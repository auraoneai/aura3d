import { describe, expect, it } from "vitest";
import {
  createProductionEffectsRenderSource,
  summarizeProductionEffectsProof,
  type ProductionRenderProof
} from "../../../packages/rendering/src/production-runtime";

describe("Production production effects pipeline", () => {
  it("adds renderer-owned shadows and postprocess settings to a real render source", () => {
    const source = createProductionEffectsRenderSource({ renderItems: [], cameraPolicy: "require" });

    expect(source.shadow).toMatchObject({ enabled: true, size: 512 });
    expect(source.postprocess).toMatchObject({
      targetFormat: "rgba8",
      toneMapping: expect.objectContaining({ operator: "filmic" }),
      bloom: expect.objectContaining({ intensity: expect.any(Number) }),
      fxaa: expect.objectContaining({ edgeThreshold: expect.any(Number) })
    });
  });

  it("requires shadows, transparency declaration, postprocess pixels, and real WebGL2 proof", () => {
    const proof: ProductionRenderProof = {
      backend: "webgl2",
      realWebGL2: true,
      mockDevice: false,
      canvas2dProof: false,
      importedAsset: {
        assetId: "damaged-helmet",
        assetUri: "damaged-helmet.glb",
        meshCount: 1,
        primitiveCount: 1,
        materialCount: 1,
        textureCount: 5,
        imageCount: 5,
        animationCount: 0,
        skinCount: 0,
        morphTargetCount: 0,
        extensionsUsed: []
      },
      diagnostics: {
        drawCalls: 3,
        buffers: 4,
        shaders: 2,
        textures: 6,
        renderTargets: 1,
        lastError: null,
        contextLost: false
      },
      features: [],
      pixels: {
        width: 64,
        height: 64,
        nonTransparentPixels: 4096,
        nonBlackPixels: 3500,
        averageLuma: 42,
        maxLuma: 180,
        uniqueColorBuckets: 32,
        centerPixel: [80, 90, 120, 255]
      }
    };

    expect(summarizeProductionEffectsProof(proof, { transparentItemCount: 1 }).pass).toBe(true);
    expect(summarizeProductionEffectsProof({ ...proof, diagnostics: { ...proof.diagnostics, drawCalls: 1 } }, { transparentItemCount: 1 }).pass).toBe(false);
    expect(summarizeProductionEffectsProof(proof, { transparentItemCount: 0 }).pass).toBe(false);
  });
});
