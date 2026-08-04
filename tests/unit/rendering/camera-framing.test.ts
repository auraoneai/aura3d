import { describe, expect, it } from "vitest";
import { Matrix4, Vector3 } from "../../../packages/math/src";
import { computeOrthographicCameraFrame, computeOrthographicCameraView, computePerspectiveCameraFrame } from "../../../packages/rendering/src";

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

describe("orthographic camera framing", () => {
  it("projects equal world lengths to equal screen lengths regardless of depth", () => {
    // This is the defining property of a parallel projection, and the reason a
    // long-lens perspective camera is not a substitute: under perspective the
    // nearer pair would measure wider on screen.
    const frame = computeOrthographicCameraFrame(
      { min: [-2, -2, -2], max: [2, 2, 2] },
      { width: 800, height: 800 }
    );
    const viewProjection = new Matrix4(frame.viewProjectionMatrix);

    const nearLeft = viewProjection.transformPoint(new Vector3(-1, 0, 1.5));
    const nearRight = viewProjection.transformPoint(new Vector3(1, 0, 1.5));
    const farLeft = viewProjection.transformPoint(new Vector3(-1, 0, -1.5));
    const farRight = viewProjection.transformPoint(new Vector3(1, 0, -1.5));

    expect(round3(nearRight.x - nearLeft.x)).toBe(round3(farRight.x - farLeft.x));
  });

  it("keeps every bounds corner inside clip space across viewport aspects", () => {
    const cases = [
      { bounds: { min: [-8, -1, -1], max: [8, 1, 1] }, viewport: { width: 400, height: 1200 } },
      { bounds: { min: [-1, -8, -1], max: [1, 8, 1] }, viewport: { width: 1600, height: 400 } },
      { bounds: { min: [-1, -1, -20], max: [1, 1, 20] }, viewport: { width: 800, height: 600 } },
      { bounds: { min: [-3, -2, -1], max: [4, 5, 2] }, viewport: { width: 1024, height: 768 } }
    ] as const;

    for (const entry of cases) {
      const frame = computeOrthographicCameraFrame(entry.bounds, entry.viewport, { paddingRatio: 0.08 });
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

  it("keeps rotated subjects inside clip space, so yaw and pitch do not crop the subject", () => {
    const frame = computeOrthographicCameraFrame(
      { min: [-3, -2, -1], max: [4, 5, 2] },
      { width: 1024, height: 768 },
      { paddingRatio: 0.1, yawRadians: Math.PI / 5, pitchRadians: -Math.PI / 7 }
    );
    const viewProjection = new Matrix4(frame.viewProjectionMatrix);

    for (const corner of corners({ min: [-3, -2, -1], max: [4, 5, 2] })) {
      const ndc = viewProjection.transformPoint(new Vector3(corner[0], corner[1], corner[2]));
      expect(Math.abs(ndc.x)).toBeLessThanOrEqual(1.0001);
      expect(Math.abs(ndc.y)).toBeLessThanOrEqual(1.0001);
    }
  });

  it("honours each fit mode's contract for a wide subject in a tall viewport", () => {
    const bounds = { min: [-4, -1, -1], max: [4, 1, 1] } as const;
    const viewport = { width: 400, height: 800 } as const;

    const contain = computeOrthographicCameraFrame(bounds, viewport, { fitMode: "contain" });
    const fitVertical = computeOrthographicCameraFrame(bounds, viewport, { fitMode: "fit-vertical" });
    const stretch = computeOrthographicCameraFrame(bounds, viewport, { fitMode: "stretch" });

    // contain must not crop, so its horizontal half-extent covers the subject.
    expect(contain.right).toBeGreaterThanOrEqual(4);
    // fit-vertical pins the vertical extent and therefore does crop horizontally.
    expect(fitVertical.top).toBeCloseTo(1, 6);
    expect(fitVertical.right).toBeLessThan(4);
    // stretch ignores aspect entirely, mapping each axis to its own extent.
    expect(stretch.right).toBeCloseTo(4, 6);
    expect(stretch.top).toBeCloseTo(1, 6);
  });

  it("builds an explicit frustum without the caller assembling matrices", () => {
    const view = computeOrthographicCameraView({
      left: -1,
      right: 1,
      bottom: -1,
      top: 1,
      near: 0.1,
      far: 10,
      eye: [0, 0, 4],
      target: [0, 0, 0]
    });
    const viewProjection = new Matrix4(view.viewProjectionMatrix);

    // The origin sits dead centre, and the frustum edges land on the clip-space
    // boundary, which is what makes this reproducible against a reference render.
    const center = viewProjection.transformPoint(new Vector3(0, 0, 0));
    expect(round3(center.x)).toBe(0);
    expect(round3(center.y)).toBe(0);
    expect(round3(viewProjection.transformPoint(new Vector3(1, 0, 0)).x)).toBe(1);
    expect(round3(viewProjection.transformPoint(new Vector3(0, 1, 0)).y)).toBe(1);
  });

  it("supports a straight-down plan view, where the usual up vector degenerates", () => {
    // Top-down plan views are a primary orthographic use case and the exact case
    // where a naive cross product against world up collapses.
    const view = computeOrthographicCameraView({
      left: -5,
      right: 5,
      bottom: -5,
      top: 5,
      eye: [0, 20, 0],
      target: [0, 0, 0]
    });

    expect(view.viewProjectionMatrix.every((value) => Number.isFinite(value))).toBe(true);
    const ndc = new Matrix4(view.viewProjectionMatrix).transformPoint(new Vector3(0, 0, 0));
    expect(round3(ndc.x)).toBe(0);
    expect(round3(ndc.y)).toBe(0);
  });

  it("rejects invalid bounds, viewports, and frustums at the package boundary", () => {
    expect(() => computeOrthographicCameraFrame({ min: [1, 0, 0], max: [0, 1, 1] }, { width: 1, height: 1 })).toThrow(/bounds/);
    expect(() => computeOrthographicCameraFrame({ min: [0, 0, 0], max: [1, 1, 1] }, { width: 0, height: 1 })).toThrow(/viewport/);
    expect(() => computeOrthographicCameraView({ left: -1, right: -1, bottom: -1, top: 1 })).toThrow(/non-zero/);
    expect(() => computeOrthographicCameraView({ left: -1, right: 1, bottom: -1, top: 1, eye: [0, 0, 0], target: [0, 0, 0] })).toThrow(/identical/);
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
