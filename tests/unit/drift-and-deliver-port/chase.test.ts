import { describe, expect, it } from "vitest";
import { snapChase, stepChase, type ChaseInput, type ChaseState } from "../../../examples/drift-and-deliver-port/chase";

const base: ChaseInput = { x: 30, z: -120, y: 0, heading: 0, speed: 0, boosting: false, shake: 0 };

describe("chase camera (original Dr / Cr)", () => {
  it("snap puts the eye 10.6 m behind and 4.3 m up, looking 5 m ahead", () => {
    const c = snapChase({ ...base, heading: Math.PI / 2 });
    expect(c.eye[0]).toBeCloseTo(30 - 10.6, 9);
    expect(c.eye[1]).toBeCloseTo(4.3, 9);
    expect(c.eye[2]).toBeCloseTo(-120, 9);
    expect(c.look[0]).toBeCloseTo(35, 9);
    expect(c.fov).toBe(56);
  });

  const run = (steps: number, input: ChaseInput, cam: ChaseState = snapChase(input)) => {
    for (let i = 0; i < steps; i++) stepChase(cam, input, 1 / 60);
    return cam;
  };

  it("settles behind a moving car at 5.9 m + 0.048 x speed", () => {
    const input = { ...base, speed: 30 };
    const cam = run(600, input);
    // The original adds a small speed-dependent wobble (0.075 x (speed - 22) / 40), so allow its amplitude.
    expect(Math.abs(Math.hypot(cam.eye[0] - input.x, cam.eye[2] - input.z) - (5.9 + 0.048 * 30))).toBeLessThan(0.05);
    expect(Math.abs(cam.eye[1] - (2.5 + 0.013 * 30))).toBeLessThan(0.05);
  });

  it("opens the field of view with speed and boost", () => {
    const slow = run(300, { ...base, speed: 0 }).fov;
    const fast = run(300, { ...base, speed: 40 }).fov;
    const boosted = run(300, { ...base, speed: 40, boosting: true }).fov;
    expect(slow).toBeCloseTo(56, 3);
    expect(fast).toBeGreaterThan(slow + 8);
    expect(boosted).toBeGreaterThan(fast + 5);
  });

  it("follows a turn with a lag instead of snapping", () => {
    const cam = snapChase(base);
    stepChase(cam, { ...base, heading: 1, speed: 20 }, 1 / 60);
    expect(cam.heading).toBeGreaterThan(0);
    expect(cam.heading).toBeLessThan(0.2);
    for (let i = 0; i < 600; i++) stepChase(cam, { ...base, heading: 1, speed: 20 }, 1 / 60);
    expect(cam.heading).toBeCloseTo(1, 3);
  });

  it("takes the short way round the angle wrap", () => {
    const cam = snapChase({ ...base, heading: 3.0 });
    let nearest = Infinity;
    for (let i = 0; i < 300; i++) {
      stepChase(cam, { ...base, heading: -3.0, speed: 20 }, 1 / 60);
      nearest = Math.min(nearest, Math.abs(cam.heading));
    }
    // 3.0 -> -3.0 is a 0.28 rad turn through pi, not a 6 rad swing through 0.
    expect(nearest).toBeGreaterThan(2.9);
    const diff = Math.atan2(Math.sin(cam.heading + 3.0), Math.cos(cam.heading + 3.0));
    expect(Math.abs(diff)).toBeLessThan(0.05);
  });

  it("shake moves the eye and is deterministic", () => {
    const a = run(30, { ...base, speed: 20, shake: 0.8 });
    const b = run(30, { ...base, speed: 20, shake: 0.8 });
    const calm = run(30, { ...base, speed: 20, shake: 0 });
    expect(a.eye).toEqual(b.eye);
    expect(Math.abs(a.eye[0] - calm.eye[0])).toBeGreaterThan(1e-3);
  });
});
