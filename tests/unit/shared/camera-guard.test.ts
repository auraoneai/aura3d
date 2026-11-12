import { describe, expect, it } from "vitest";
import { MAX_FOV, MIN_EYE_TARGET_DISTANCE, guardPose, limitLookLag, type GuardPose } from "../../../examples/shared/camera-guard";

const FALLBACK: GuardPose = { position: [0, 5, 10], target: [0, 2, -10], up: [0, 1, 0], fov: 62 };

describe("guardPose", () => {
  it("passes a good pose through unchanged", () => {
    const pose: GuardPose = { position: [1, 4, 8], target: [3, 2, -6], up: [0.05, 1, 0], fov: 66 };
    expect(guardPose(pose, FALLBACK, FALLBACK)).toEqual(pose);
  });

  it("replaces NaN and Infinity components with the last good pose", () => {
    const last: GuardPose = { position: [2, 4, 9], target: [2, 2, -9], up: [0, 1, 0], fov: 60 };
    const bad: GuardPose = { position: [Number.NaN, 4, 9], target: [0, Number.POSITIVE_INFINITY, 0], up: [0, 1, 0], fov: Number.NaN };
    const out = guardPose(bad, last, FALLBACK);
    expect(out.position).toEqual(last.position);
    expect(out.target).toEqual(last.target);
    expect(out.fov).toBe(60);
  });

  it("uses the fallback when there is no last good pose", () => {
    const out = guardPose({ position: [Number.NaN, 0, 0], target: [0, 0, 0], up: [0, 1, 0], fov: 62 }, null, FALLBACK);
    expect(out.position).toEqual(FALLBACK.position);
  });

  it("pushes a target that sits on the eye out along the previous view direction", () => {
    const out = guardPose({ position: [0, 5, 10], target: [0, 5, 10], up: [0, 1, 0], fov: 62 }, FALLBACK, FALLBACK);
    const d = Math.hypot(out.target[0] - out.position[0], out.target[1] - out.position[1], out.target[2] - out.position[2]);
    expect(d).toBeCloseTo(MIN_EYE_TARGET_DISTANCE, 6);
    expect(out.target[2]).toBeLessThan(out.position[2]);
  });

  it("replaces an up vector that is zero, non-finite or parallel to the view with a non-collinear axis", () => {
    const base = { position: [0, 5, 10], target: [0, 2, -10], fov: 62 } as const;
    expect(guardPose({ ...base, up: [0, 0, 0] }, null, FALLBACK).up).toEqual([0, 1, 0]);
    expect(guardPose({ ...base, up: [Number.NaN, 1, 0] }, null, FALLBACK).up).toEqual([0, 1, 0]);
    expect(guardPose({ ...base, up: [0, -3, -20] }, null, FALLBACK).up).toEqual([0, 1, 0]);
    const vertical = { position: [0, 10, 0], target: [0, 0, 0], fov: 62 } as const;
    expect(guardPose({ ...vertical, up: [0, 1, 0] }, null, FALLBACK).up).toEqual([0, 0, 1]);
    expect(guardPose({ ...vertical, up: [0, 0, 0] }, null, FALLBACK).up).toEqual([0, 0, 1]);
  });

  it("clamps the field of view", () => {
    expect(guardPose({ ...FALLBACK, fov: 400 }, null, FALLBACK).fov).toBe(MAX_FOV);
    expect(guardPose({ ...FALLBACK, fov: -3 }, null, FALLBACK).fov).toBe(20);
  });
});

describe("limitLookLag", () => {
  it("keeps a close look target", () => {
    expect(limitLookLag([1, 0, 0], [0, 0, 0], 5)).toEqual([1, 0, 0]);
  });
  it("pulls a far look target to maxLag from the wanted one along the same line", () => {
    const out = limitLookLag([30, 0, 0], [0, 0, 0], 6);
    expect(out[0]).toBeCloseTo(6, 9);
    expect(out[1]).toBeCloseTo(0, 9);
  });
  it("snaps a non-finite look target to the wanted one", () => {
    expect(limitLookLag([Number.NaN, 0, 0], [4, 5, 6], 3)).toEqual([4, 5, 6]);
  });
});
