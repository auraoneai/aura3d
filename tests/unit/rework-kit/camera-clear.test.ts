import { describe, expect, it } from "vitest";
import { clearCameraEye, createCameraClearance } from "../../../packages/game/src/motion/index";

const wallAt = (z: number) => (_x: number, _y: number, pz: number) => pz > z;

describe("clearCameraEye", () => {
  it("leaves a clear eye where it is", () => {
    const r = clearCameraEye({ focus: [0, 2, 0], eye: [0, 6, -13], blocked: () => false });
    expect(r.t).toBe(1);
    expect(r.eye).toEqual([0, 6, -13]);
  });

  it("stops the eye before a wall between focus and eye", () => {
    const r = clearCameraEye({ focus: [0, 2, 0], eye: [0, 2, 20], blocked: wallAt(10) });
    expect(r.t).toBeLessThan(0.55);
    expect(r.eye[2]).toBeLessThanOrEqual(10);
    expect(r.eye[2]).toBeGreaterThan(8.5);
  });

  it("never returns a blocked point when the wall is well past the minimum distance", () => {
    for (const wall of [3, 5, 8, 12, 16]) {
      const blocked = wallAt(wall);
      const r = clearCameraEye({ focus: [0, 2, 0], eye: [0, 2, 20], blocked, minDistance: 1 });
      expect(blocked(r.eye[0], r.eye[1], r.eye[2])).toBe(false);
    }
  });

  it("respects the minimum distance when a wall is closer than it", () => {
    const r = clearCameraEye({ focus: [0, 2, 0], eye: [0, 2, 20], blocked: wallAt(0.5), minDistance: 2 });
    expect(Math.hypot(r.eye[0], r.eye[1] - 2, r.eye[2])).toBeCloseTo(2, 5);
  });

  it("catches a thin slab with enough samples", () => {
    const slab = (_x: number, _y: number, z: number) => z > 9.5 && z < 10.5;
    const r = clearCameraEye({ focus: [0, 0, 0], eye: [0, 0, 20], blocked: slab, samples: 64 });
    expect(r.eye[2]).toBeLessThan(9.6);
  });

  it("works against a floor: an eye under the ground is lifted along the segment", () => {
    const floor = (_x: number, y: number) => y < 1;
    const r = clearCameraEye({ focus: [0, 3, 0], eye: [0, -4, -10], blocked: (x, y) => floor(x, y) });
    expect(r.eye[1]).toBeGreaterThanOrEqual(1 - 1e-6);
  });
});

describe("createCameraClearance", () => {
  const wall = { focus: [0, 2, 0] as const, eye: [0, 2, 20] as const, blocked: wallAt(10) };

  it("pulls in fast and releases slowly, with no pop", () => {
    const c = createCameraClearance({ pullRate: 18, releaseRate: 2 });
    const eyes: number[] = [];
    for (let i = 0; i < 60; i += 1) eyes.push(c.update(1 / 60, wall)[2]);
    expect(eyes[eyes.length - 1]).toBeLessThanOrEqual(10);
    const clearView = { ...wall, blocked: () => false };
    const out: number[] = [];
    for (let i = 0; i < 30; i += 1) out.push(c.update(1 / 60, clearView)[2]);
    for (let i = 1; i < out.length; i += 1) expect(out[i]! - out[i - 1]!).toBeLessThan(2);
    expect(out[0]!).toBeLessThan(11);
    expect(out[out.length - 1]!).toBeLessThan(20);
  });

  it("never outputs a blocked eye on the frame a wall appears", () => {
    const c = createCameraClearance();
    c.update(1 / 60, { ...wall, blocked: () => false });
    const eye = c.update(1 / 60, wall);
    expect(wall.blocked(eye[0], eye[1], eye[2])).toBe(false);
  });

  it("returns to the full distance once clear", () => {
    const c = createCameraClearance({ releaseRate: 8 });
    for (let i = 0; i < 30; i += 1) c.update(1 / 60, wall);
    for (let i = 0; i < 600; i += 1) c.update(1 / 60, { ...wall, blocked: () => false });
    expect(c.factor).toBe(1);
  });
});
