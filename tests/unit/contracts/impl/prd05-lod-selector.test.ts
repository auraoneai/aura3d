/**
 * PRD-05 §6.3.7 — LodSelector threshold mapping, 10 % hysteresis, bias, and
 * one-step-per-frame stepping, plus projectedSphereCoverage on synthetic
 * camera distances.
 */

import { describe, expect, it } from "vitest";
import {
  LodSelector,
  projectedSphereCoverage
} from "../../../../packages/engine/src/production-runtime/LodSelector";

const THRESHOLDS = [0.25, 0.08, 0.02];

function perspectiveCamera(distance: number, fovDeg = 60) {
  const verticalScale = 1 / Math.tan((fovDeg / 2) * (Math.PI / 180));
  const projectionMatrix = new Float32Array(16);
  projectionMatrix[0] = verticalScale;
  projectionMatrix[5] = verticalScale;
  projectionMatrix[10] = -1;
  projectionMatrix[11] = -1;
  projectionMatrix[14] = -0.2;
  const viewMatrix = new Float32Array(16);
  viewMatrix[0] = viewMatrix[5] = viewMatrix[10] = viewMatrix[15] = 1;
  return { distance, projectionMatrix, viewMatrix };
}

describe("LodSelector", () => {
  it("maps coverage to the smallest adequate level", () => {
    const selector = new LodSelector({ screenCoverage: THRESHOLDS });
    expect(selector.unconstrainedLevel(0.5)).toBe(0);
    expect(selector.unconstrainedLevel(0.1)).toBe(1);
    expect(selector.unconstrainedLevel(0.01)).toBe(2);
  });

  it("steps coarser only below the current level's threshold minus hysteresis", () => {
    const selector = new LodSelector({ screenCoverage: THRESHOLDS });
    expect(selector.select(0.5)).toBe(0);
    // 0.24 < 0.25 but > 0.25 * 0.9 = 0.225 → deadband keeps level 0.
    expect(selector.select(0.24)).toBe(0);
    expect(selector.select(0.2)).toBe(1);
    // Level 1 → 2 boundary is t[1] = 0.08: 0.075 > 0.072 deadband → stays 1.
    expect(selector.select(0.075)).toBe(1);
    expect(selector.select(0.07)).toBe(2);
  });

  it("steps back up only past the finer level's threshold + hysteresis", () => {
    const selector = new LodSelector({ screenCoverage: THRESHOLDS });
    selector.select(0.5);
    selector.select(0.2);
    expect(selector.activeLevel).toBe(1);
    // 0.26 >= 0.25 but < 0.25 * 1.1 = 0.275 → deadband keeps level 1.
    expect(selector.select(0.26)).toBe(1);
    expect(selector.select(0.28)).toBe(0);
  });

  it("moves at most one level per frame", () => {
    const selector = new LodSelector({ screenCoverage: THRESHOLDS });
    expect(selector.select(0.005)).toBe(1); // target 2, clamped to +1
    expect(selector.select(0.005)).toBe(2);
    expect(selector.select(0.5)).toBe(1); // target 0, clamped to -1
    expect(selector.select(0.5)).toBe(0);
  });

  it("bias multiplies coverage", () => {
    const selector = new LodSelector({ screenCoverage: THRESHOLDS, bias: 0.5 });
    // 0.5 * 0.5 = 0.25 >= threshold 0.25 → stays 0; 0.15*0.5=0.075 < 0.072 deadband edge
    expect(selector.select(0.5)).toBe(0);
    expect(selector.select(0.14)).toBe(1);
  });

  it("setLevel forces the level and validates range", () => {
    const selector = new LodSelector({ screenCoverage: THRESHOLDS });
    selector.setLevel(2);
    expect(selector.activeLevel).toBe(2);
    expect(() => selector.setLevel(3)).toThrow(RangeError);
    expect(() => selector.setLevel(-1)).toThrow(RangeError);
  });
});

describe("projectedSphereCoverage", () => {
  it("computes perspective coverage as radius*projY/distance", () => {
    const camera = perspectiveCamera(10);
    const coverage = projectedSphereCoverage({
      center: [0, 0, -10],
      radius: 1,
      camera
    });
    expect(coverage).toBeCloseTo(1.732 / 10, 3);
  });

  it("halves coverage when distance doubles", () => {
    const near = projectedSphereCoverage({ center: [0, 0, -10], radius: 2, camera: perspectiveCamera(10) });
    const far = projectedSphereCoverage({ center: [0, 0, -20], radius: 2, camera: perspectiveCamera(20) });
    expect(far).toBeCloseTo(near / 2, 5);
  });

  it("orthographic coverage is distance-independent", () => {
    const ortho = { projectionMatrix: new Float32Array([1, 0, 0, 0, 0, 0.1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1]) };
    expect(projectedSphereCoverage({ center: [0, 0, -5], radius: 1, camera: ortho })).toBeCloseTo(0.1, 5);
    expect(projectedSphereCoverage({ center: [0, 0, -50], radius: 1, camera: ortho })).toBeCloseTo(0.1, 5);
  });

  it("falls back to full coverage when no usable matrix exists", () => {
    expect(projectedSphereCoverage({ center: [0, 0, -10], radius: 1, camera: {} })).toBe(1);
  });
});
