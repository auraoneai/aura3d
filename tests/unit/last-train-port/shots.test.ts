import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { cameras } from "@aura3d/engine";
import { controllerInput } from "../../../examples/last-train-port/replay";
import { CATCH_SHAKE, FOV_KICK, SHOT_SECONDS, ShotDirector, type ShotFrameContext, type ShotPose, type V3 } from "../../../examples/last-train-port/shots";
import { DT, actionDepart, actionDoors, createState, sampleRoute, step, type RouteData, type SimData, type SimState, type Tables } from "../../../examples/last-train-port/sim";

const data: SimData = {
  route: JSON.parse(readFileSync("examples/last-train-port/data/route.json", "utf8")) as RouteData,
  tables: JSON.parse(readFileSync("examples/last-train-port/data/tables.json", "utf8")) as Tables
};
const PARAMS = { kRoll: 6, kVel: 1.2, deadband: 0.15, pace: "brisk", brakeDecel: 4, brakeMargin: 6 } as const;
const BASE: ShotPose = { eye: [0, 6, -17], target: [0, 2, 12], fov: 56 };
const CTX: ShotFrameContext = { here: [0, 0, 0], forward: [0, 0, 1], side: [1, 0, 0] };
const dist = (a: V3, b: V3): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/** Drives one full circuit with the capture controller; `shots` (when given) observes every step read-only. */
function drive(shots?: ShotDirector): { sim: SimState; seconds: number } {
  const sim = createState();
  let t = 0;
  for (let i = 0; i < 60 * 60 * 20 && sim.attempt.status === "active"; i++) {
    if (sim.phase === "docked") actionDoors(sim);
    if (sim.phase === "ready") actionDepart(sim);
    step(sim, DT, controllerInput(sim, data, PARAMS), data);
    t += DT;
    if (shots) {
      shots.observe({ phase: sim.phase, complete: (sim.attempt.status as string) === "complete", catches: sim.attempt.catches }, t);
      const here = sampleRoute(data.route, sim.leg, sim.distance);
      shots.frame(BASE, { here: [here.x, here.y, here.z], forward: [0, 0, 1], side: [1, 0, 0] }, t, false);
    }
  }
  return { sim, seconds: t };
}

describe("camera shots (GU47 WP-31 LT-16)", () => {
  it("plays 6 arrival sequences per circuit and leaves service time identical", () => {
    const shots = new ShotDirector();
    const withShots = drive(shots), without = drive();
    expect(withShots.sim.attempt.status).toBe("complete");
    expect(shots.started.arrival).toBe(6);
    expect(shots.started.departure).toBeGreaterThanOrEqual(5);
    expect(shots.started.finale).toBe(1);
    expect(withShots.seconds).toBe(without.seconds);
    expect(JSON.stringify(withShots.sim)).toBe(JSON.stringify(without.sim));
  });

  it("blends in and out without a hitch (eye moves < 1 m per 60 Hz frame through the chase rig on a still tram)", () => {
    const d = new ShotDirector(), chase = cameras.chase();
    d.observe({ phase: "enroute", complete: false, catches: 0 }, 0);
    d.observe({ phase: "docked", complete: false, catches: 0 }, 0);
    const show = (r: ShotPose): V3 => chase.step({ wantEye: r.eye, wantLook: r.target, fovTarget: r.fov }, 1 / 60).eye;
    let prev = show(d.frame(BASE, CTX, 0, false)), maxStep = 0, maxWeight = 0;
    for (let t = 1 / 60; t < SHOT_SECONDS.arrival + 2; t += 1 / 60) {
      const r = d.frame(BASE, CTX, t, false), eye = show(r);
      maxStep = Math.max(maxStep, dist(prev, eye)); prev = eye; maxWeight = Math.max(maxWeight, r.weight);
      expect(r.cut).toBe(false);
    }
    expect(maxWeight).toBe(1);
    expect(maxStep).toBeLessThan(1);
    expect(d.active).toBeNull();
  });

  it("is skippable: skip() blends the shot out", () => {
    const d = new ShotDirector();
    d.observe({ phase: "closing", complete: false, catches: 0 }, 0);
    d.observe({ phase: "enroute", complete: false, catches: 0 }, 0);
    d.frame(BASE, CTX, 0.5, false);
    d.skip();
    d.frame(BASE, CTX, 0.6, false);
    expect(d.frame(BASE, CTX, 1.6, false).weight).toBe(0);
    expect(d.active).toBeNull();
  });

  it("cuts under reduced motion: no rail move, no FOV kick, no shake", () => {
    const d = new ShotDirector();
    d.observe({ phase: "enroute", complete: false, catches: 0 }, 0);
    d.observe({ phase: "docked", complete: false, catches: 1 }, 0);
    const first = d.frame(BASE, CTX, 0, true);
    expect(first.cut).toBe(true);
    expect(first.weight).toBe(1);
    expect(first.shakeOffset).toEqual([0, 0, 0]);
    const mid = d.frame(BASE, CTX, 1.5, true);
    expect(mid.cut).toBe(false);
    expect(dist(mid.eye, first.eye)).toBe(0);
    const out = d.frame(BASE, CTX, SHOT_SECONDS.arrival + 0.01, true);
    expect(out.cut).toBe(true);
    expect(out.eye).toEqual(BASE.eye);
    const dep = new ShotDirector();
    dep.observe({ phase: "closing", complete: false, catches: 0 }, 0);
    dep.observe({ phase: "enroute", complete: false, catches: 0 }, 0);
    expect(dep.frame(BASE, CTX, 0.1, true).fov).toBe(50); // the held end pose, no kick on top
  });

  it("kicks the FOV on departure and shakes on a catch, both decaying to zero", () => {
    const d = new ShotDirector();
    d.observe({ phase: "enroute", complete: false, catches: 0 }, 0);
    d.observe({ phase: "enroute", complete: false, catches: 1 }, 1);
    const s = d.frame(BASE, CTX, 1.05, false).shakeOffset;
    expect(Math.hypot(...s)).toBeGreaterThan(0);
    expect(Math.hypot(...s)).toBeLessThanOrEqual(CATCH_SHAKE.metres * 1.6);
    expect(d.frame(BASE, CTX, 1 + CATCH_SHAKE.seconds + 0.01, false).shakeOffset).toEqual([0, 0, 0]);
    const k = new ShotDirector();
    k.observe({ phase: "closing", complete: false, catches: 0 }, 0);
    k.observe({ phase: "enroute", complete: false, catches: 0 }, 0);
    k.skip();
    k.frame(BASE, CTX, 0, false);
    expect(k.frame(BASE, CTX, 0.95, false).fov).toBeGreaterThan(BASE.fov);
    expect(k.frame(BASE, CTX, FOV_KICK.seconds + 0.01, false).fov).toBe(BASE.fov);
  });

  it("is off when disabled (?shots=0, ?look=original)", () => {
    const d = new ShotDirector(false);
    d.observe({ phase: "enroute", complete: false, catches: 0 }, 0);
    d.observe({ phase: "docked", complete: false, catches: 0 }, 0);
    expect(d.active).toBeNull();
    expect(d.frame(BASE, CTX, 0.5, false).eye).toEqual(BASE.eye);
  });
});
