import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import {
  ProductionWebGL2Renderer
} from "../../../packages/rendering/src/v6";
import type {
  V6RendererInput,
  V7FrameRenderResult
} from "../../../packages/rendering/src/v6/ProductionRendererTypes";

describe("V8 explicit interactive renderer API", () => {
  it("publishes renderInteractiveFrame and captureProof as the primary V6 renderer names", () => {
    const types = readFileSync(resolve("packages/rendering/src/v6/ProductionRendererTypes.ts"), "utf8");
    const rendererV6 = readFileSync(resolve("packages/rendering/src/v6/RendererV6.ts"), "utf8");
    const sdk = readFileSync(resolve("packages/engine/src/v6/index.ts"), "utf8");

    expect(types).toContain("export interface V8ProductionRenderer");
    expect(types).toContain("renderInteractiveFrame(input: V6RendererInput)");
    expect(types).toContain("captureProof(input: V6RendererInput)");
    expect(rendererV6).toContain("renderFrame(input: V6RendererInput)");
    expect(rendererV6).toContain("return this.renderInteractiveFrame(input);");
    expect(rendererV6).toContain("renderImportedAsset(input: V6RendererInput)");
    expect(rendererV6).toContain("return this.captureProof(input);");
    expect(sdk).toContain("renderInteractiveFrame(input: G3DRenderOptions)");
    expect(sdk).toContain("captureProof(input: G3DRenderOptions)");
    expect(sdk).toContain("return this.renderInteractiveFrame(input);");
    expect(sdk).toContain("return this.captureProof(input);");
  });

  it("renders an interactive frame without pixel metrics or readback", () => {
    const { renderer, render, readPixels } = createRenderer();

    const result = renderer.renderInteractiveFrame(createInput()) as V7FrameRenderResult & {
      readonly pixels?: unknown;
    };

    expect(render).toHaveBeenCalledTimes(1);
    expect(readPixels).not.toHaveBeenCalled();
    expect(result.backend).toBe("webgl2");
    expect(result.diagnostics.drawCalls).toBe(1);
    expect(result.pixels).toBeUndefined();
    expect(result.features.map((feature) => feature.id)).not.toContain("pixel-readback");
    expect(result.features.map((feature) => feature.id)).not.toContain("scene-color-transmission-capture");
    expect(result.timing).toMatchObject({
      renderMs: expect.any(Number),
      totalMs: expect.any(Number)
    });
    expect(result.timing?.readbackMs).toBeUndefined();
  });

  it("captures proof with explicit pixel metrics and readback diagnostics", () => {
    const { renderer, render, readPixels } = createRenderer();

    const proof = renderer.captureProof(createInput());

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

  it("keeps renderFrame and renderImportedAsset as compatible aliases", () => {
    const interactive = createRenderer();
    const frame = interactive.renderer.renderFrame(createInput()) as V7FrameRenderResult & {
      readonly pixels?: unknown;
    };

    expect(interactive.render).toHaveBeenCalledTimes(1);
    expect(interactive.readPixels).not.toHaveBeenCalled();
    expect(frame.pixels).toBeUndefined();

    const proof = createRenderer();
    expect(proof.renderer.renderImportedAsset(createInput()).pixels.nonBlackPixels).toBeGreaterThan(0);
    expect(proof.readPixels).toHaveBeenCalledTimes(1);
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
    dispose: vi.fn()
  };

  return {
    renderer: Reflect.construct(ProductionWebGL2Renderer, [fakeRenderer, 2, 2]) as ProductionWebGL2Renderer,
    render,
    readPixels
  };
}

function createInput(): V6RendererInput {
  return {
    source: { renderItems: [] },
    metadata: {
      assetId: "v8-unit-asset",
      assetUri: "fixtures/v8/unit.glb",
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
