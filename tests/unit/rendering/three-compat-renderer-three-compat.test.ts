import { describe, expect, it } from "vitest";
import { createThreeCompatRenderer, summarizeThreeCompatRendererDiagnostics, THREE_COMPAT_REQUIRED_RENDERER_FEATURES } from "../../../packages/rendering/src";

describe("ThreeCompatRenderer breadth contract", () => {
  it("exposes the renderer systems expected by a broad Three.js replacement track", () => {
    const renderer = createThreeCompatRenderer({ backend: "webgl2", width: 1440, height: 900 });
    const diagnostics = renderer.createDiagnostics();
    const summary = summarizeThreeCompatRendererDiagnostics(diagnostics);
    const plan = renderer.createComplexScenePlan();

    expect(summary.missing).toEqual([]);
    expect(summary.canClaimRendererBreadth).toBe(true);
    expect(diagnostics.features.map((feature) => feature.feature)).toEqual(expect.arrayContaining([...THREE_COMPAT_REQUIRED_RENDERER_FEATURES]));
    expect(renderer.renderTargets.current.format).toBe("rgba16f");
    expect(renderer.renderTargets.supportsMultipleRenderTargets()).toBe(true);
    expect(renderer.renderTargets.supportsHdr()).toBe(true);
    expect(renderer.textures.supports("hdr-environment-textures")).toBe(true);
    expect(renderer.resize(1920, 1080)).toMatchObject({ width: 1920, height: 1080 });
    expect(renderer.captureScreenshot()).toContain("1920x1080");
    expect(renderer.handleDeviceLost("test context loss")).toEqual({ recovered: true, reason: "test context loss" });
    expect(plan.cameras).toEqual(["perspective", "orthographic", "cube-environment"]);
    expect(plan.lights.map((light) => light.kind)).toEqual(expect.arrayContaining(["directional", "point", "spot", "hemisphere", "ambient", "rect-area"]));
    expect(plan.materialModes).toEqual(expect.arrayContaining(["opaque", "alpha-test", "alpha-blend", "transmissive", "double-sided"]));
    expect(plan.sceneComplexity.instances).toBeGreaterThanOrEqual(10000);
  });
});
