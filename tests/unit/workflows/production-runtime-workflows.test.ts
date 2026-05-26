import { describe, expect, it } from "vitest";
import {
  createProductionAssetPreflight,
  createProductionRendererDefaults,
  createProductionVisualQAResult,
  createProductionWorkflowPlan,
  listProductionWorkflowDefinitions
} from "../../../packages/workflows/src";

describe("production workflow and differentiation APIs", () => {
  it("defines the five production production workflows", () => {
    const workflows = listProductionWorkflowDefinitions();
    expect(workflows.map((workflow) => workflow.id)).toEqual(["product", "asset", "material", "architecture", "cinematic"]);
    expect(workflows.every((workflow) => workflow.requiredRendererFeatures.length > 0)).toBe(true);
    expect(workflows.every((workflow) => workflow.requiredProof.length > 0)).toBe(true);
    expect(workflows.every((workflow) => workflow.differentiation.length > 0)).toBe(true);
  });

  it("preflights real corpus asset metadata before rendering", () => {
    const result = createProductionAssetPreflight({
      id: "damaged-helmet",
      localPath: "fixtures/asset-corpus/damaged-helmet.glb",
      sourceUri: "https://example.invalid/damaged-helmet.glb",
      sha256: "a".repeat(64),
      bytes: 3_773_916,
      license: "CC-BY-4.0",
      tags: ["pbr", "texture"],
      renderRequirements: ["baseColorTexture", "metallicRoughnessTexture", "normalTexture", "hdrIbl"]
    });
    expect(result.pass).toBe(true);
    expect(result.missing).toEqual([]);
    const animationAsset = createProductionAssetPreflight({
      id: "animated-morph-cube",
      localPath: "fixtures/asset-corpus/animated-morph-cube.glb",
      sourceUri: "https://example.invalid/animated-morph-cube.glb",
      sha256: "b".repeat(64),
      bytes: 22_332,
      license: "CC0-1.0",
      tags: ["animation", "morph"],
      renderRequirements: ["morphTargets", "animation"]
    });
    expect(animationAsset.pass).toBe(true);
    expect(animationAsset.warnings).toContain("Asset does not declare HDR IBL as an asset-specific requirement; renderer workflow must provide fallback HDR lighting proof.");
    expect(createProductionAssetPreflight({ id: "fake" }).pass).toBe(false);
  });

  it("scores visual QA from renderer proof and rejects blank screenshots", () => {
    const pass = createProductionVisualQAResult({
      screenshotPath: "tests/reports/production-runtime-gallery/assets/damaged-helmet-webgl2.png",
      rendererBackend: "webgl2",
      realRendererProof: true,
      width: 512,
      height: 512,
      nonBlackPixels: 240_000,
      uniqueColorBuckets: 160,
      drawCalls: 3,
      textureMemory: 86_000_000
    });
    expect(pass.pass).toBe(true);
    expect(pass.score).toBeGreaterThan(40);
    const fail = createProductionVisualQAResult({
      screenshotPath: "blank.png",
      rendererBackend: "webgl2",
      realRendererProof: false,
      width: 64,
      height: 64,
      nonBlackPixels: 0,
      uniqueColorBuckets: 1,
      drawCalls: 0,
      textureMemory: 0
    });
    expect(fail.pass).toBe(false);
    expect(fail.failures).toContain("missing-real-renderer-proof");
  });

  it("creates production defaults and complete workflow plans", () => {
    const defaults = createProductionRendererDefaults("cinematic");
    expect(defaults.backend).toBe("webgl2");
    expect(defaults.hdrEnvironmentId).toBe("studio-small-08");
    expect(defaults.postprocess).toContain("fxaa");
    const plan = createProductionWorkflowPlan("material");
    expect(plan.workflow.id).toBe("material");
    expect(plan.preflightRequired).toBe(true);
    expect(plan.visualQARequired).toBe(true);
  });
});
