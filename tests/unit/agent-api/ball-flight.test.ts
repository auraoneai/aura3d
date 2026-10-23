import { describe, expect, it } from "vitest";
import { createBallFlight, racketSports, type BallFlightBall, type BallFlightConfig } from "../../../packages/engine/src/agent-api/game-kits/racketSports";

// A deliberately non-tennis court: metres on every axis, 9.81 gravity, no drag, one bouncy surface and a 1 m net.
const squashLike: BallFlightConfig = {
  gravity: 9.81, drag: 0, ballRadius: 0.02,
  net: { centerHeight: 1, postHeight: 1, halfWidth: 3 },
  surfaces: { floor: { rebound: 0.5, retention: 0.9 } },
  serveMaxRiseMetres: 0.5
};

const ball = (over: Partial<BallFlightBall> = {}): BallFlightBall => ({ x: 0, y: 2, z: 1, vx: 0, vy: 0, vz: 0, active: true, bounceCount: 0, ...over });

describe("racketSports().ballFlight", () => {
  it("is exposed on the kit and as a factory", () => {
    const kit = racketSports.create();
    expect(typeof kit.ballFlight).toBe("function");
    expect(typeof racketSports.ballFlight).toBe("function");
    expect(createBallFlight(squashLike).gravity).toBe(9.81);
  });

  it("reproduces closed-form free fall independent of frame size", () => {
    const flight = createBallFlight(squashLike);
    const a = ball({ z: 2 }), b = ball({ z: 2 });
    const events: string[] = [];
    for (let i = 0; i < 8; i++) flight.advance(a, 0.1, "floor", (type) => events.push(type));
    for (let i = 0; i < 80; i++) flight.advance(b, 0.01, "floor", () => {});
    expect(a.z).toBeCloseTo(b.z, 9);
    expect(a.vz).toBeCloseTo(b.vz, 9);
    expect(flight.sample(ball({ z: 2 }), 0.3).z).toBeCloseTo(2 - 9.81 * 0.09 / 2, 12);
    expect(a.bounceCount).toBe(b.bounceCount);
    expect(events).toContain("bounce");
  });

  it("applies the surface rebound and retention and counts bounces", () => {
    const flight = createBallFlight(squashLike);
    const b = ball({ z: 0.02, vz: -4, vx: 2 });
    flight.rebound(b, "floor");
    expect(b.vz).toBeCloseTo(2, 12);
    expect(b.vx).toBeCloseTo(1.8, 12);
    expect(b.bounceCount).toBe(1);
    flight.rebound(b, "unknown-surface");
    expect(b.bounceCount).toBe(2);
  });

  it("emits net, tape and clears the net by height", () => {
    const flight = createBallFlight(squashLike);
    // The net is crossed 0.4 s after launch, by which time gravity has pulled the ball down 0.785 m.
    const low = ball({ y: 2, z: 0.6, vy: -5, vz: 0 }), high = ball({ y: 2, z: 3, vy: -5, vz: 0 }), skim = ball({ y: 2, z: 1.02, vy: -5, vz: 9.81 * 0.4 / 2 });
    const log = (b: BallFlightBall) => { const out: string[] = []; for (let i = 0; i < 120 && b.active; i++) flight.advance(b, 1 / 60, "floor", (t) => out.push(t)); return out; };
    expect(log(low)).toContain("net");
    expect(log(high)).not.toContain("net");
    expect(log(skim)).toContain("tape");
  });

  it("reflects off configured boards and never passes through them", () => {
    const flight = createBallFlight({ ...squashLike, boards: { renderScale: { x: 1, y: 1 }, contactRadius: 0.02, list: [{ x: 0, y: -4, halfWidth: 5, height: 3, angle: 0 }] } });
    const b = ball({ y: -1, z: 1, vy: -6 });
    const events: string[] = [];
    for (let i = 0; i < 240; i++) flight.advance(b, 1 / 120, "floor", (t) => events.push(t));
    expect(events).toContain("board");
    expect(b.y).toBeGreaterThan(-4);
  });

  it("solveShot reaches its target and lengthens the arc to clear the net, or throws", () => {
    const flight = createBallFlight(squashLike);
    const start = ball({ y: 3, z: 1.2 });
    const solved = flight.solveShot(start, 0.5, -4, 0.4);
    const landing = flight.sample(solved, solved.flightTime);
    expect(landing.x).toBeCloseTo(0.5, 6);
    expect(landing.y).toBeCloseTo(-4, 6);
    expect(() => flight.solveShot(ball({ y: 0.6, z: 0.05 }), 0, -0.9, 0.28, 500)).toThrow("Unable to construct a playable trajectory");
  });

  it("serveTrajectory respects the requested speed and flags unreachable net targets", () => {
    const flight = createBallFlight({ ...squashLike, units: { x: 1, y: 1, z: 1 } });
    const serve = flight.serveTrajectory(ball({ y: 5, z: 2.2 }), 0, -4, 100);
    expect(serve.paceLimited).toBe(false);
    expect(Math.hypot(serve.vx, serve.vy, serve.vz) * 3.6).toBeGreaterThan(90);
    expect(flight.serveTargetNetRisk(ball({ y: 0.4, z: 0.3 }), 0, -0.2, 0.5)).toBe(true);
  });

  it("settles a released ball: rolls to a stop, never moving forever", () => {
    const flight = createBallFlight(squashLike);
    const b = ball({ z: 0.5, vy: -3, vx: 1 });
    flight.releaseBall(b);
    for (let i = 0; i < 2000 && b.settling; i++) flight.advanceLoose(b, 1 / 60, "floor");
    expect(b.settling).toBe(false);
    expect(b.vx).toBe(0);
    expect(b.vy).toBe(0);
  });

  it("is deterministic: identical inputs give bit-identical results", () => {
    const flight = createBallFlight(squashLike);
    const run = () => { const b = ball({ z: 1.5, vx: 1, vy: -4, vz: 2 }); const out: unknown[] = []; for (let i = 0; i < 200; i++) { flight.advance(b, 1 / 60, "floor", (t) => out.push([t, b.x, b.y, b.z])); } return JSON.stringify([b, out]); };
    expect(run()).toBe(run());
  });
});
