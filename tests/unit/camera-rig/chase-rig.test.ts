import { describe, expect, it } from "vitest";
import { cameras } from "../../../packages/engine/src/agent-api/nodes/cameras";
import { snapChase, stepChase, type ChaseInput, type ChaseState } from "../../../examples/drift-and-deliver-port/chase";
import * as ref from "../../fixtures/camera-rig/drift-chase-reference";

const base: ChaseInput = { x: 30, z: -120, y: 0, heading: 0, speed: 0, boosting: false, shake: 0 };

describe("cameras.chase: Drift & Deliver equivalence with the original chase.ts", () => {
  it("matches the original over a scripted 1200-step drive (turns, boost, shake, ground)", () => {
    const ground = (x: number, z: number) => 0.4 * Math.sin(x * 0.05) + 0.3 * Math.cos(z * 0.04);
    const a: ChaseState = snapChase(base);
    const b: ref.ChaseState = ref.snapChase(base);
    let worst = 0;
    let cases = 0;
    for (let i = 0; i < 1200; i++) {
      const t = i / 60;
      const input: ChaseInput = {
        x: 30 + 8 * t, z: -120 + 5 * Math.sin(t * 0.7) * t, y: 0.2 * Math.sin(t),
        heading: Math.sin(t * 0.45) * 3.4 + (i > 700 ? 2.5 : 0),
        speed: 5 + 35 * Math.abs(Math.sin(t * 0.3)) + (i % 400 > 300 ? 25 : 0),
        boosting: i % 250 > 200,
        shake: i % 300 > 280 ? 0.8 : 0
      };
      const dt = i % 97 === 0 ? 1 / 30 : 1 / 60;
      stepChase(a, input, dt, ground);
      ref.stepChase(b, input, dt, ground);
      for (const [x, y] of [[a.eye[0], b.eye[0]], [a.eye[1], b.eye[1]], [a.eye[2], b.eye[2]], [a.look[0], b.look[0]], [a.look[1], b.look[1]], [a.look[2], b.look[2]], [a.fov, b.fov], [a.heading, b.heading], [a.time, b.time]] as const) {
        worst = Math.max(worst, Math.abs(x - y));
        cases++;
      }
    }
    expect(cases).toBe(1200 * 9);
    expect(worst).toBeLessThan(1e-9);
  });
});

describe("cameras.chase: rig behaviour", () => {
  it("first step snaps and reports cut; later steps smooth", () => {
    const rig = cameras.chase({ lag: { eye: 7 } });
    const first = rig.step({ wantEye: [0, 5, 10], wantLook: [0, 0, 0] }, 1 / 60);
    expect(first.cut).toBe(true);
    expect(first.eye).toEqual([0, 5, 10]);
    const second = rig.step({ wantEye: [10, 5, 10], wantLook: [0, 0, 0] }, 1 / 60);
    expect(second.cut).toBe(false);
    expect(second.eye[0]).toBeCloseTo(10 * (1 - Math.exp(-7 / 60)), 12);
  });

  it("an absent or infinite lag follows exactly; cut snaps; reset re-snaps", () => {
    const rig = cameras.chase({ lag: { eye: 3 } });
    rig.step({ wantEye: [1, 2, 3], wantLook: [4, 5, 6], fovTarget: 50 }, 1 / 60);
    const p = rig.step({ wantEye: [9, 9, 9], wantLook: [7, 8, 9], fovTarget: 70 }, 1 / 60);
    expect(p.look).toEqual([7, 8, 9]);
    expect(p.fov).toBe(70);
    expect(rig.step({ wantEye: [100, 0, 0], wantLook: [0, 0, 0], cut: true }, 1 / 60).eye).toEqual([100, 0, 0]);
    rig.reset();
    expect(rig.step({ wantEye: [5, 5, 5], wantLook: [0, 0, 0] }, 1 / 60).cut).toBe(true);
  });

  it("a per-step lag override and shakeOffset apply to the output only", () => {
    const rig = cameras.chase({ lag: { eye: 5, look: 5 } });
    rig.step({ wantEye: [0, 0, 0], wantLook: [0, 0, 1] }, 0.1);
    const p = rig.step({ wantEye: [10, 0, 0], wantLook: [0, 0, 1], lag: { eye: 14 }, shakeOffset: [0, 1, 0] }, 0.1);
    expect(p.eye[0]).toBeCloseTo(10 * (1 - Math.exp(-1.4)), 12);
    expect(p.eye[1]).toBe(1);
    expect(rig.pose.eye[1]).toBe(0);
  });

  it("offset mode places the eye behind the heading and opens the fov with speed and boost", () => {
    const rig = cameras.chase({ offset: { back: 6, up: 2, lead: 4, lookUp: 1 }, lag: { eye: 50, look: 50, fov: 50 }, fovKick: { base: 60, perSpeed: 1, maxSpeedKick: 10, boost: 5 } });
    rig.snap({ position: [0, 0, 0], heading: 0 });
    let p = rig.pose;
    for (let i = 0; i < 120; i++) p = rig.step({ position: [0, 0, 0], heading: 0, speed: 30, boosting: true }, 1 / 60);
    expect(p.eye[2]).toBeCloseTo(-6, 6);
    expect(p.eye[1]).toBeCloseTo(2, 6);
    expect(p.look[2]).toBeCloseTo(4, 6);
    expect(p.fov).toBeCloseTo(75, 6);
  });
});
