import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  Renderer
} from "../../../packages/rendering/src/Renderer";
import {
  ProductionWebGL2Renderer,
  ProductionRuntimeRenderer,
  validateProductionRendererInput,
  rendererFeatureReport,
  rendererInteractiveFeatureReport,
  rendererShadowReport,
  rendererProofCapture
} from "../../../packages/rendering/src/production-runtime";
import type {
  ProductionRendererInput
} from "../../../packages/rendering/src/production-runtime/ProductionRendererTypes";

// Phase 2 collapsed the three Production renderer wrappers onto the single
// C-29 `Renderer`. Frame submission goes through `renderer.render` /
// `renderer.renderAsync`; pixel proof/feature/shadow evidence moved to the
// free functions in `production-runtime/renderProofs.ts` (re-exported through
// `packages/engine/src/agent-api/devtools/rendererReports.ts`).
describe("CurrentRoutes explicit interactive renderer API", () => {
  it("publishes the one-renderer surface: Renderer render dispatch plus devtools proof helpers", () => {
    const barrel = readFileSync(resolve("packages/rendering/src/production-runtime/index.ts"), "utf8");
    const proofs = readFileSync(resolve("packages/rendering/src/production-runtime/renderProofs.ts"), "utf8");
    const devtools = readFileSync(resolve("packages/engine/src/agent-api/devtools/rendererReports.ts"), "utf8");
    const bridge = readFileSync(resolve("packages/engine/src/agent-api/compiler/renderer.ts"), "utf8");

    expect(proofs).toContain("export function rendererProofCapture");
    expect(proofs).toContain("export function rendererFeatureReport");
    expect(proofs).toContain("export function rendererInteractiveFeatureReport");
    expect(proofs).toContain("export function rendererShadowReport");
    expect(proofs).toContain("export function validateProductionRendererInput");
    expect(devtools).toContain("rendererProofCapture");
    expect(devtools).toContain("rendererFeatureReport");
    expect(devtools).toContain("rendererShadowReport");
    expect(bridge).toContain("Renderer.create");
    expect(bridge).toContain("productionRenderer.render(");
    expect(bridge).toContain("productionRenderer.renderAsync(");
    // Deprecated aliases survive this phase only (removed in Phase 8).
    expect(barrel).toContain("Renderer as ProductionWebGL2Renderer");
    expect(barrel).toContain("Renderer as ProductionRuntimeRenderer");
    expect(ProductionWebGL2Renderer).toBe(Renderer);
    expect(ProductionRuntimeRenderer).toBe(Renderer);
  });

  it("renders an interactive frame without pixel metrics or readback", () => {
    const { renderer, render, readPixels } = createRenderer();
    const input = createInput();
    validateProductionRendererInput(input);

    const diagnostics = renderer.render(input.source, input.camera);
    const features = rendererInteractiveFeatureReport(renderer, diagnostics, input);

    expect(render).toHaveBeenCalledTimes(1);
    expect(readPixels).not.toHaveBeenCalled();
    expect(renderer.device.kind).toBe("webgl2");
    expect(diagnostics.drawCalls).toBe(1);
    expect(features.map((feature) => feature.id)).not.toContain("pixel-readback");
    expect(features.map((feature) => feature.id)).not.toContain("scene-color-transmission-capture");
  });

  it("captures proof with explicit pixel metrics and readback diagnostics", () => {
    const { renderer, render, readPixels } = createRenderer();

    const proof = rendererProofCapture(renderer, createInput());

    expect(render).toHaveBeenCalledTimes(1);
    expect(readPixels).toHaveBeenCalledTimes(1);
    expect(proof.backend).toBe("webgl2");
    expect(proof.pixels.nonBlackPixels).toBeGreaterThan(0);
    expect(proof.features.find((feature) => feature.id === "pixel-readback")).toMatchObject({
      state: "supported"
    });
    expect(proof.timing).toMatchObject({
      renderMs: expect.any(Number),
      readbackMs: expect.any(Number),
      pixelAnalysisMs: expect.any(Number),
      totalMs: expect.any(Number)
    });
  });

  it("reports features and shadow evidence through the moved free functions", () => {
    const { renderer } = createRenderer();

    expect(rendererFeatureReport(renderer).map((feature) => feature.id)).toContain("pixel-readback");
    expect(rendererShadowReport(renderer)).toBeNull();
  });
});

function createRenderer() {
  const diagnostics = {
    drawCalls: 1,
    buffers: 2,
    shaders: 1,
    renderTargets: 1,
    textures: 1,
    textureBytes: 16,
    lastError: null,
    contextLost: false
  };
  const readPixels = vi.fn(() => new Uint8Array([
    0, 0, 0, 255,
    220, 80, 30, 255,
    25, 40, 60, 255,
    8, 8, 8, 255
  ]));
  const render = vi.fn(() => diagnostics);
  const fakeRenderer = {
    device: {
      kind: "webgl2",
      info: { capabilities: ["hdr-image-based-lighting", "anisotropic-texture-filtering"] },
      readPixels
    },
    render,
    getDiagnostics: vi.fn(() => diagnostics),
    getShadowEvidence: vi.fn(() => null),
    dispose: vi.fn()
  };

  return {
    renderer: fakeRenderer as unknown as Renderer,
    render,
    readPixels
  };
}

function createInput(): ProductionRendererInput {
  return {
    source: { renderItems: [] },
    viewport: { width: 2, height: 2 },
    metadata: {
      assetId: "current-routes-unit-asset",
      assetUri: "fixtures/threejs-parity/unit.glb",
      meshCount: 1,
      primitiveCount: 1,
      materialCount: 1,
      textureCount: 1,
      imageCount: 1,
      animationCount: 0,
      skinCount: 0,
      morphTargetCount: 0,
      extensionsUsed: []
    }
  };
}
