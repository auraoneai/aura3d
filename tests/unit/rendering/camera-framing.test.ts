import { describe, expect, it } from "vitest";
import { Matrix4, Vector3 } from "../../../packages/math/src";
import { computePerspectiveCameraFrame } from "../../../packages/rendering/src";

describe("camera framing helpers", () => {
  it("computes the same deterministic perspective frame used by renderer auto-frame", () => {
    const frame = computePerspectiveCameraFrame(
      { min: [11.5, -3.5, 1.5], max: [12.5, -2.5, 2.5] },
      { width: 16, height: 9 }
    );

    expect(frame.center.map(round3)).toEqual([12, -3, 2]);
    expect(frame.cameraPosition.map(round3)).toEqual([12, -3, 3.366]);
    expect(round3(frame.aspect)).toBe(1.778);
    expect(frame.near).toBeGreaterThan(0);
    expect(frame.far).toBeGreaterThan(frame.near);
    expect(frame.viewProjectionMatrix).toHaveLength(16);
  });

  it("frames every bounds corner inside clip space for wide, tall, deep, and orbit camera defaults", () => {
    const cases = [
      {
        bounds: { min: [-8, -1, -1], max: [8, 1, 1] },
        viewport: { width: 400, height: 1200 },
        options: { paddingRatio: 0.08 }
      },
      {
        bounds: { min: [-1, -8, -1], max: [1, 8, 1] },
        viewport: { width: 1600, height: 400 },
        options: { paddingRatio: 0.08 }
      },
      {
        bounds: { min: [-1, -1, -20], max: [1, 1, 20] },
        viewport: { width: 800, height: 600 },
        options: { paddingRatio: 0.08, nearPadding: 0.25, farPadding: 1 }
      },
      {
        bounds: { min: [-3, -2, -1], max: [4, 5, 2] },
        viewport: { width: 1024, height: 768 },
        options: { paddingRatio: 0.1, yawRadians: Math.PI / 5, pitchRadians: -Math.PI / 7 }
      }
    ] as const;

    for (const entry of cases) {
      const frame = computePerspectiveCameraFrame(entry.bounds, entry.viewport, entry.options);
      const viewProjection = new Matrix4(frame.viewProjectionMatrix);
      for (const corner of corners(entry.bounds)) {
        const ndc = viewProjection.transformPoint(new Vector3(corner[0], corner[1], corner[2]));
        expect(Math.abs(ndc.x), JSON.stringify({ entry, corner, ndc: ndc.toArray() })).toBeLessThanOrEqual(1.0001);
        expect(Math.abs(ndc.y), JSON.stringify({ entry, corner, ndc: ndc.toArray() })).toBeLessThanOrEqual(1.0001);
        expect(ndc.z, JSON.stringify({ entry, corner, ndc: ndc.toArray() })).toBeGreaterThanOrEqual(-1.0001);
        expect(ndc.z, JSON.stringify({ entry, corner, ndc: ndc.toArray() })).toBeLessThanOrEqual(1.0001);
      }
    }
  });

  it("supports padding for reusable app-level fit-to-bounds defaults", () => {
    const tight = computePerspectiveCameraFrame(
      { min: [-1, -1, -1], max: [1, 1, 1] },
      { width: 800, height: 600 },
      { paddingRatio: 0 }
    );
    const padded = computePerspectiveCameraFrame(
      { min: [-1, -1, -1], max: [1, 1, 1] },
      { width: 800, height: 600 },
      { paddingRatio: 0.2 }
    );

    expect(padded.cameraPosition[2]).toBeGreaterThan(tight.cameraPosition[2]);
    expect(padded.far).toBeGreaterThan(tight.far);
  });

  it("rejects invalid bounds, viewports, and FOVs at the package boundary", () => {
    expect(() => computePerspectiveCameraFrame({ min: [1, 0, 0], max: [0, 1, 1] }, { width: 1, height: 1 })).toThrow(/bounds/);
    expect(() => computePerspectiveCameraFrame({ min: [0, 0, 0], max: [1, 1, 1] }, { width: 0, height: 1 })).toThrow(/viewport/);
    expect(() => computePerspectiveCameraFrame({ min: [0, 0, 0], max: [1, 1, 1] }, { width: 1, height: 1 }, { fovYRadians: 0 })).toThrow(/fovYRadians/);
  });
});

function corners(bounds: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] }): readonly [number, number, number][] {
  return [
    [bounds.min[0], bounds.min[1], bounds.min[2]],
    [bounds.min[0], bounds.min[1], bounds.max[2]],
    [bounds.min[0], bounds.max[1], bounds.min[2]],
    [bounds.min[0], bounds.max[1], bounds.max[2]],
    [bounds.max[0], bounds.min[1], bounds.min[2]],
    [bounds.max[0], bounds.min[1], bounds.max[2]],
    [bounds.max[0], bounds.max[1], bounds.min[2]],
    [bounds.max[0], bounds.max[1], bounds.max[2]]
  ];
}

function round3(value: number): number {
  return Math.round(value * 1000) / 1000;
}
