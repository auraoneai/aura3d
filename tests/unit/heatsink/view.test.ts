/**
 * Thermal Drift drawing: track geometry (C11), projection (C7), interpolation (C14), instancing helpers (C13, C20).
 */
import { describe, expect, it } from "vitest";
import { runMotionGate, createFixedStepPresenter } from "../../../packages/game/src/index";
import { BANK, CHASE, ChaseCamera, COUNTDOWN_SHOTS, projectToScreen, shotPose, TITLE_OFFSET } from "../../../apps/showcase-heatsink/src/camera";
import { CIRCUITS } from "../../../apps/showcase-heatsink/src/data";
import { autopilot, createRace, stepRace } from "../../../apps/showcase-heatsink/src/sim";
import { blendShown, createShown, writeShown, type Shown } from "../../../apps/showcase-heatsink/src/shown";
import { curvatureAt, TrackView, type TrackPose } from "../../../apps/showcase-heatsink/src/track";
import { InstanceWriter, slotRivals } from "../../../apps/showcase-heatsink/src/view";
import { cueForEvent } from "../../../apps/showcase-heatsink/src/audio";
import type { DroneId } from "../../../apps/showcase-heatsink/src/data";

const pose = (): TrackPose => ({ x: 0, y: 0, z: 0, heading: 0 });

describe("heatsink track: no jump at sector boundaries (C11)", () => {
  it("curvature is continuous across every sector boundary and the lap line", () => {
    for (const circuit of Object.values(CIRCUITS)) {
      const L = circuit.length;
      const marks = [...circuit.sectors.map((s) => s.startFrac * L), L];
      for (const b of marks) {
        const jump = Math.abs(curvatureAt(circuit, b + 0.05) - curvatureAt(circuit, b - 0.05));
        expect(jump, `${circuit.id} @${b}`).toBeLessThan(1e-4);
      }
    }
  });
  it("a far road point drifts smoothly from frame to frame, with no jump at a boundary", () => {
    const circuit = CIRCUITS.grand;
    const view = new TrackView();
    const a = pose(), b = pose();
    let worst = 0, worstChange = 0, prev: number | null = null;
    // Consecutive 60 Hz frames at about 70 m/s over a whole lap. The same world point is sampled on both frames;
    // its motion on screen comes only from the road turning, so it must be small and change smoothly.
    // The audit measured a one-frame jump of up to 84.8 m at d = 184 m with the old single-sample bend.
    for (let s = 0; s < circuit.length; s += 1.2) {
      view.update(circuit, s);
      view.sample(184, a);
      view.update(circuit, s + 1.2);
      view.sample(184 - 1.2, b);
      const move = Math.hypot(a.x - b.x, a.z - b.z);
      worst = Math.max(worst, move);
      if (prev !== null) worstChange = Math.max(worstChange, Math.abs(move - prev));
      prev = move;
    }
    expect(worst).toBeLessThan(2.5);
    expect(worstChange).toBeLessThan(0.1);
  });
  it("tiles follow the local tangent: heading integrates curvature", () => {
    const circuit = CIRCUITS.dustfall;
    const view = new TrackView();
    view.update(circuit, 1500);
    const p = pose();
    view.sample(100, p);
    let h = 0;
    for (let d = 0; d < 100; d += 0.5) h += curvatureAt(circuit, 1500 + d + 0.25) * 0.5;
    expect(p.heading).toBeCloseTo(h, 3);
    view.sample(0, p);
    expect(p.x).toBe(0); expect(p.z).toBe(0); expect(p.heading).toBe(0);
  });
});

describe("heatsink lock bracket: real projection (C7)", () => {
  const camera = { position: [0, 4.2, 9.5] as const, target: [0, 1.8, -18] as const, fov: 68 };
  it("projects the camera target to the centre of the canvas", () => {
    const out = projectToScreen(camera, 16 / 9, [0, 1.8, -18], { x: 0, y: 0, depth: 0 });
    expect(out.x).toBeCloseTo(0.5, 6);
    expect(out.y).toBeCloseTo(0.5, 6);
  });
  it("puts a rival 3 m to the side 19 m ahead at about 54% of the width (the old formula said 66.6%)", () => {
    const out = projectToScreen(camera, 1280 / 720, [3, 1.95, -19.4], { x: 0, y: 0, depth: 0 });
    expect(out.x).toBeGreaterThan(0.53);
    expect(out.x).toBeLessThan(0.56);
    const old = Math.min(82, Math.max(18, 50 + (3 / 19) * 105)) / 100;
    expect((old - out.x) * 1280).toBeGreaterThan(140);
  });
  it("reports points behind the camera with a non-positive depth", () => {
    expect(projectToScreen(camera, 1, [0, 2, 20], { x: 0, y: 0, depth: 0 }).depth).toBeLessThanOrEqual(0);
  });
  it("chase camera: reduced motion has no FOV kick and no shake", () => {
    const cam = new ChaseCamera();
    cam.addTrauma(1);
    for (let i = 0; i < 60; i++) cam.update(1 / 60, { drone: [0, 1.55, -0.4], lookAt: [0, 1.8, -18], boosting: true, hyper: false, aspect: 16 / 9, reducedMotion: true });
    expect(cam.pose.fov).toBeCloseTo(CHASE.fov, 6);
    expect(cam.pose.position[1]).toBeCloseTo(CHASE.y, 3);
    const moving = new ChaseCamera();
    for (let i = 0; i < 60; i++) moving.update(1 / 60, { drone: [0, 1.55, -0.4], lookAt: [0, 1.8, -18], boosting: true, hyper: false, aspect: 16 / 9, reducedMotion: false });
    expect(moving.pose.fov).toBeGreaterThan(CHASE.fov + 2);
  });
});

describe("heatsink HS-17 camera", () => {
  const base = { lookAt: [0, 1.8, -18] as [number, number, number], boosting: false, hyper: false, aspect: 16 / 9 };
  it("rests at fov 62, y 3.2, z 8.2", () => {
    const cam = new ChaseCamera();
    for (let i = 0; i < 120; i++) cam.update(1 / 60, { ...base, drone: [0, 1.55, -0.4], reducedMotion: false });
    expect(cam.pose.fov).toBeCloseTo(62, 6);
    expect(cam.pose.position[1]).toBeCloseTo(3.2, 3);
    expect(cam.pose.position[2]).toBe(8.2);
  });
  it("banks with lateral speed, never past 6 degrees, and not at all on reduced motion", () => {
    for (const reducedMotion of [false, true]) {
      const cam = new ChaseCamera();
      let peak = 0;
      for (let i = 0; i < 240; i++) {
        cam.update(1 / 60, { ...base, drone: [Math.sin(i / 12) * 9, 1.55, -0.4], reducedMotion });
        peak = Math.max(peak, Math.abs(cam.pose.roll));
      }
      if (reducedMotion) expect(peak).toBe(0);
      else {
        expect(peak).toBeGreaterThan(0.02);
        expect(peak).toBeLessThanOrEqual(BANK.max + 1e-12);
      }
      expect(Math.hypot(...cam.pose.up)).toBeCloseTo(1, 10);
    }
  });
  it("cuts through three countdown shots, skipped on reduced motion", () => {
    const drone: [number, number, number] = [0, 1.45, -0.4];
    const poses = [3, 2, 1].map((digit) => shotPose({ kind: "countdown", digit }, drone, false)!);
    expect(poses.every(Boolean)).toBe(true);
    expect(new Set(poses.map((p) => p.position.join(","))).size).toBe(3);
    expect(shotPose({ kind: "countdown", digit: 2 }, drone, true)).toBeNull();
    expect(Object.keys(COUNTDOWN_SHOTS)).toEqual(["1", "2", "3"]);
    const cam = new ChaseCamera();
    cam.update(1 / 60, { ...base, drone, reducedMotion: false, shot: { kind: "countdown", digit: 3 } });
    expect(cam.cut).toBe(true);
    cam.update(1 / 60, { ...base, drone, reducedMotion: false, shot: { kind: "countdown", digit: 3 } });
    expect(cam.cut).toBe(false);
  });
  it("orbits on results (still on reduced motion) and holds a title pose at least 4 m from the chase", () => {
    const drone: [number, number, number] = [0, 1.45, -0.4];
    const a = shotPose({ kind: "results", seconds: 0 }, drone, false)!;
    const b = shotPose({ kind: "results", seconds: 2 }, drone, false)!;
    expect(a.position).not.toEqual(b.position);
    expect(shotPose({ kind: "results", seconds: 2 }, drone, true)!.position).toEqual(shotPose({ kind: "results", seconds: 0 }, drone, true)!.position);
    const title = shotPose({ kind: "title" }, drone, false)!;
    expect(title.position).toEqual([drone[0] + TITLE_OFFSET[0], drone[1] + TITLE_OFFSET[1], drone[2] + TITLE_OFFSET[2]]);
    expect(Math.hypot(title.position[0], title.position[1] - CHASE.y, title.position[2] - CHASE.z)).toBeGreaterThanOrEqual(4);
  });
});

describe("heatsink presenter: smooth at 60, 120 and 144 Hz (C14, lessons M1)", () => {
  for (const hz of [60, 120, 144]) {
    it(`passes the motion gate at ${hz} Hz`, () => {
      const race = createRace({ circuit: "grand", mode: "race", drone: "orion", seed: 4 });
      const presenter = createFixedStepPresenter<Shown>({ snapshot: () => writeShown(race, createShown(race.rivals.length)), blend: blendShown });
      const report = runMotionGate({
        displayHz: hz,
        seconds: 6,
        warmupSeconds: 4.5,
        step: (dt) => { const a = autopilot(race); stepRace(race, a.input, a.actions, dt); },
        afterStep: () => presenter.afterStep(),
        drawn: (alpha) => { const s = presenter.present({ alpha }, true); return [s.player[0]!]; }
      });
      expect(report.failures).toEqual([]);
      expect(report.passed).toBe(true);
    });
  }
});

describe("heatsink instancing helpers (C13, C20)", () => {
  const fakeHandle = () => {
    const calls: { m: Float32Array; count: number }[] = [];
    return { calls, handle: { setInstanceMatrices(m: Float32Array, count: number) { calls.push({ m: m.slice(), count }); return this; } } };
  };
  it("writes yaw-only column-major matrices and parks unused slots at scale 0", () => {
    const { calls, handle } = fakeHandle();
    const w = new InstanceWriter(handle as never, 3);
    w.begin();
    w.push(1, 2, 3, Math.PI / 2, 1);
    w.end();
    const { m, count } = calls[0]!;
    expect(count).toBe(3);
    expect(m[0]).toBeCloseTo(0, 6); expect(m[2]).toBeCloseTo(-1, 6); expect(m[8]).toBeCloseTo(1, 6);
    expect([m[12], m[13], m[14]]).toEqual([1, 2, 3]);
    expect(m[16 + 5]).toBe(0);
    expect(m[32 + 13]).toBe(-60);
  });
  it("keeps a drawn rival on the same drone model while it stays drawn", () => {
    const slots = new Map<number, DroneId>();
    const models: DroneId[] = ["volt", "bastion", "spectre", "razor", "nighthawk", "wraith"];
    const a = slotRivals([3, 1, 7], slots, models);
    const b = slotRivals([7, 9, 3], slots, models);
    expect([...a.entries()].find(([, r]) => r === 3)![0]).toBe([...b.entries()].find(([, r]) => r === 3)![0]);
    expect([...b.values()].sort()).toEqual([3, 7, 9]);
    expect(new Set(b.keys()).size).toBe(3);
  });
});

describe("heatsink audio map (C22)", () => {
  it("gives the race events a cue", () => {
    for (const type of ["countdown", "go", "lap", "takedown", "incoming", "damage", "scrape", "pickup", "shock", "roll", "laser"] as const) {
      const event = type === "countdown" ? { type, value: 3 } : type === "lap" ? { type, lap: 1, lapSeconds: 30, best: false, trace: null } : type === "takedown" ? { type, name: "x", by: "laser" as const } : type === "incoming" ? { type, name: "x" } : type === "damage" ? { type, amount: 1, source: "missile" as const } : type === "pickup" ? { type, kind: "boost" as const, item: null } : type === "shock" ? { type, hits: 0 } : { type };
      expect(cueForEvent(event as never), type).not.toBeNull();
    }
  });
});
