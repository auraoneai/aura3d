import { describe, expect, it } from "vitest";
import { camera } from "../../../packages/engine/src/agent-api/nodes/camera";
import { scene } from "../../../packages/engine/src/agent-api/nodes/scene";
import { createCameraProjection } from "../../../packages/engine/src/agent-api/CameraProjection";

describe("perspective camera option preservation", () => {
  it("retains authored lens, view, up, depth and layers in the scene camera", () => {
    const options = {
      position: [1, 2, 8] as const,
      target: [0, 1, 0] as const,
      up: [1, 0, 0] as const,
      fov: 48,
      focalLength: 50,
      filmGauge: 36,
      filmOffset: 3,
      viewOffset: { fullWidth: 800, fullHeight: 400, x: 200, y: 0, width: 200, height: 400 },
      depth: { mode: "standard" as const, allowFallback: false },
      near: 0.3,
      far: 240,
      layers: 0
    };
    const spec = camera.perspective(options);
    const snapshot = scene().camera(spec).toJSON().camera;

    expect(spec).toMatchObject({ mode: "perspective", ...options });
    expect(snapshot).toMatchObject({ mode: "perspective", ...options });
    expect(snapshot.layers).toBe(0);
    expect(snapshot.depth?.allowFallback).toBe(false);
  });

  it("uses preserved focal length, film gauge and film offset in the projection", () => {
    const spec = camera.perspective({ near: 0.05, far: 100, fov: 10, focalLength: 50, filmGauge: 36, filmOffset: 3 });
    const projection = createCameraProjection(spec, 1.5);

    // At aspect 1.5 the physical half-height is near * (24 / 100);
    // the film offset shifts the center by one sixth of the half-width.
    expect(projection[0]).toBeCloseTo(2.7777778, 5);
    expect(projection[5]).toBeCloseTo(4.1666667, 5);
    expect(projection[8]).toBeCloseTo(1 / 6, 5);
    expect(projection[5]).not.toBeCloseTo(1 / Math.tan(5 * Math.PI / 180), 3);
  });

  it("uses the preserved sub-view rectangle in the projection", () => {
    const spec = camera.perspective({
      near: 1,
      far: 100,
      fov: 90,
      viewOffset: { fullWidth: 800, fullHeight: 400, x: 200, y: 0, width: 200, height: 400 }
    });
    // The full near-plane rectangle is [-2,2] x [-1,1]; this tile is [-1,0] x [-1,1].
    const projection = createCameraProjection(spec, 1);
    expect(projection[0]).toBeCloseTo(2);
    expect(projection[5]).toBeCloseTo(1);
    expect(projection[8]).toBeCloseTo(-1);
  });

  it("retains an explicit depth request for later capability checks", () => {
    const reversed = camera.perspective({ depth: { mode: "reversed", allowFallback: false } });
    const logarithmic = camera.perspective({ depth: { mode: "logarithmic", allowFallback: true } });
    expect(reversed.depth).toEqual({ mode: "reversed", allowFallback: false });
    expect(logarithmic.depth).toEqual({ mode: "logarithmic", allowFallback: true });
  });

  it("preserves defaults and existing clipping validation", () => {
    const spec = camera.perspective();
    expect(spec).toMatchObject({ mode: "perspective", fov: 45, near: 0.05, far: 100 });
    for (const key of ["up", "viewOffset", "focalLength", "filmGauge", "filmOffset", "depth", "layers"]) {
      expect(spec).not.toHaveProperty(key);
    }
    expect(() => camera.perspective({ near: 0 })).toThrow(RangeError);
    expect(() => camera.perspective({ near: 2, far: 2 })).toThrow(RangeError);
  });

  it("retains invalid authored lens or tile values for the projection validator", () => {
    const invalidGauge = camera.perspective({ filmGauge: 0 });
    const invalidTile = camera.perspective({
      viewOffset: { fullWidth: 100, fullHeight: 100, x: 90, y: 0, width: 20, height: 40 }
    });
    expect(() => createCameraProjection(invalidGauge, 1)).toThrow(/film gauge/i);
    expect(() => createCameraProjection(invalidTile, 1)).toThrow(/view offset/i);
  });
});
