import { describe, expect, it } from "vitest";
import {
  createProductionOrbitControlPreset,
  summarizeProductionAnimationWorkflow
} from "../../../packages/rendering/src/production-runtime";

describe("Production animation and controls production workflow", () => {
  it("recognizes imported skinned animation and morph target animation readiness", () => {
    expect(summarizeProductionAnimationWorkflow({
      assetId: "cesium-man",
      animationCount: 1,
      skinCount: 1,
      morphTargetCount: 0,
      primitiveCount: 1,
      materialCount: 1
    })).toMatchObject({
      assetId: "cesium-man",
      importedAnimation: true,
      skinningReady: true,
      morphTargetsReady: false,
      renderable: true,
      warnings: []
    });

    expect(summarizeProductionAnimationWorkflow({
      assetId: "animated-morph-cube",
      animationCount: 1,
      skinCount: 0,
      morphTargetCount: 1,
      primitiveCount: 1,
      materialCount: 1
    })).toMatchObject({
      assetId: "animated-morph-cube",
      importedAnimation: true,
      skinningReady: false,
      morphTargetsReady: true,
      renderable: true,
      warnings: []
    });
  });

  it("creates finite orbit controls from real asset bounds and viewport dimensions", () => {
    const preset = createProductionOrbitControlPreset(
      {
        min: [-0.45, 0, -0.25],
        max: [0.45, 1.82, 0.25]
      },
      { width: 768, height: 512 },
      { yawRadians: -0.35, pitchRadians: -0.16, paddingRatio: 0.2 }
    );

    expect(preset.target).toHaveLength(3);
    expect(preset.target.every(Number.isFinite)).toBe(true);
    expect(preset.distance).toBeGreaterThan(0);
    expect(preset.minDistance).toBeGreaterThan(0);
    expect(preset.maxDistance).toBeGreaterThan(preset.distance);
    expect(preset.frame.viewMatrix).toHaveLength(16);
    expect(preset.frame.projectionMatrix).toHaveLength(16);
    expect(preset.frame.viewProjectionMatrix).toHaveLength(16);
    expect(preset.frame.viewProjectionMatrix.every(Number.isFinite)).toBe(true);
  });

  it("flags metadata-only animation claims as incomplete", () => {
    const summary = summarizeProductionAnimationWorkflow({
      assetId: "static-placeholder",
      animationCount: 0,
      skinCount: 0,
      morphTargetCount: 0,
      primitiveCount: 0,
      materialCount: 0
    });

    expect(summary.importedAnimation).toBe(false);
    expect(summary.skinningReady).toBe(false);
    expect(summary.morphTargetsReady).toBe(false);
    expect(summary.renderable).toBe(false);
    expect(summary.warnings.length).toBeGreaterThanOrEqual(3);
  });
});
