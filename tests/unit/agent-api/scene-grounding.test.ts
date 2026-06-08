import { describe, expect, it } from "vitest";
import {
  boundsFromSize,
  boundsHeight,
  groundedPlacement,
  groundedYOffset,
  normalizedScaleForTargetHeight,
  type SceneBounds
} from "../../../packages/engine/src";

// Real bounds taken from the animation-studio generated typed assets
// (aura.assets.json -> boundsMetadata). Miko is a tiny center-origin robot,
// Luma a full-height foot-origin humanoid.
const mikoBounds: SceneBounds = { min: [-0.033, -0.013, -0.009], max: [0.033, 0.013, 0.008] };
const lumaBounds: SceneBounds = { min: [-0.55, 0, -0.4], max: [0.55, 1.8, 0.4] };

describe("scene grounding utils", () => {
  it("computes bounds height from the Y extent", () => {
    expect(boundsHeight(mikoBounds)).toBeCloseTo(0.026, 6);
    expect(boundsHeight(lumaBounds)).toBeCloseTo(1.8, 6);
  });

  it("grounds the lowest point onto y=0 via -min.y", () => {
    // Center-origin asset: lowest point below origin, so offset lifts it up.
    expect(groundedYOffset(mikoBounds)).toBeCloseTo(0.013, 6);
    // Foot-origin asset already sits on y=0, so no offset needed.
    expect(groundedYOffset(lumaBounds)).toBeCloseTo(0, 6);
  });

  it("normalizes uniform scale so height matches the target", () => {
    const mikoScale = normalizedScaleForTargetHeight(mikoBounds, 1.5);
    const lumaScale = normalizedScaleForTargetHeight(lumaBounds, 1.5);
    expect(mikoScale).toBeCloseTo(1.5 / 0.026, 6);
    expect(lumaScale).toBeCloseTo(1.5 / 1.8, 6);
    // After scaling, both assets are exactly the target height.
    expect(boundsHeight(mikoBounds) * mikoScale).toBeCloseTo(1.5, 6);
    expect(boundsHeight(lumaBounds) * lumaScale).toBeCloseTo(1.5, 6);
  });

  it("returns scale 1 for degenerate height or non-positive target", () => {
    const flat: SceneBounds = { min: [0, 2, 0], max: [1, 2, 1] };
    expect(normalizedScaleForTargetHeight(flat, 1.5)).toBe(1);
    expect(normalizedScaleForTargetHeight(mikoBounds, 0)).toBe(1);
    expect(normalizedScaleForTargetHeight(mikoBounds, -3)).toBe(1);
  });

  it("places scaled assets so their lowest point rests on the floor", () => {
    const floorY = 0.07;
    const targetHeight = 1.5;
    const miko = groundedPlacement(mikoBounds, { targetHeight, x: -0.8, z: 0, floorY });
    const luma = groundedPlacement(lumaBounds, { targetHeight, x: 0.8, z: 0, floorY });

    expect(miko.position[0]).toBe(-0.8);
    expect(luma.position[0]).toBe(0.8);
    expect(miko.position[2]).toBe(0);

    // The model's local lowest point, once scaled and translated, lands on floorY.
    const mikoFootWorldY = miko.position[1] + mikoBounds.min[1] * miko.scale;
    const lumaFootWorldY = luma.position[1] + lumaBounds.min[1] * luma.scale;
    expect(mikoFootWorldY).toBeCloseTo(floorY, 6);
    expect(lumaFootWorldY).toBeCloseTo(floorY, 6);

    // Both share the same on-screen height despite very different native scales.
    expect(boundsHeight(mikoBounds) * miko.scale).toBeCloseTo(targetHeight, 6);
    expect(boundsHeight(lumaBounds) * luma.scale).toBeCloseTo(targetHeight, 6);
  });

  it("defaults x/z/floorY to 0", () => {
    const p = groundedPlacement(lumaBounds, { targetHeight: 1.8 });
    expect(p.position).toEqual([0, 0, 0]);
    expect(p.scale).toBeCloseTo(1, 6);
  });

  it("builds bounds from size and center", () => {
    const b = boundsFromSize([0.066, 0.026, 0.017], [0, 0, 0]);
    expect(b.min[1]).toBeCloseTo(-0.013, 6);
    expect(b.max[1]).toBeCloseTo(0.013, 6);
    expect(boundsHeight(b)).toBeCloseTo(0.026, 6);
  });
});
