import { describe, expect, it } from "vitest";
import {
  PRODUCTION_WEBGL2_REQUIRED_FEATURES,
  analyzePixels,
  summarizeProductionWebGL2Proof,
  type ProductionRenderProof
} from "../../../packages/rendering/src/production-runtime";

describe("Production WebGL2 production renderer contract", () => {
  it("defines the required real-renderer gates and excludes mock/canvas proof", () => {
    expect(PRODUCTION_WEBGL2_REQUIRED_FEATURES).toEqual([
      "real-webgl2-context",
      "no-canvas2d-proof",
      "no-mock-device",
      "imported-gltf-render-source",
      "pbr-materials",
      "texture-upload-diagnostics",
      "render-target-diagnostics",
      "draw-call-diagnostics",
      "pixel-readback",
      "hdr-ibl-ready"
    ]);
  });

  it("summarizes real WebGL2 proof only when renderer pixels and diagnostics exist", () => {
    const pixels = new Uint8Array([
      0, 0, 0, 255,
      240, 120, 40, 255,
      30, 60, 90, 255,
      12, 12, 12, 255
    ]);
    const metrics = analyzePixels(pixels, 2, 2);
    const proof: ProductionRenderProof = {
      backend: "webgl2",
      realWebGL2: true,
      mockDevice: false,
      canvas2dProof: false,
      importedAsset: {
        assetId: "damaged-helmet",
        assetUri: "fixtures/asset-corpus/damaged-helmet.glb",
        meshCount: 1,
        primitiveCount: 1,
        materialCount: 1,
        textureCount: 5,
        imageCount: 5,
        animationCount: 0,
        skinCount: 0,
        morphTargetCount: 0,
        extensionsUsed: [],
        environmentId: "studio-small-08"
      },
      diagnostics: {
        drawCalls: 1,
        buffers: 2,
        shaders: 1,
        renderTargets: 1,
        textures: 5,
        textureBytes: 1024,
        lastError: null,
        contextLost: false
      },
      features: PRODUCTION_WEBGL2_REQUIRED_FEATURES.map((id) => ({
        id,
        state: "supported",
        detail: "unit contract"
      })),
      pixels: metrics
    };

    expect(metrics.nonBlackPixels).toBeGreaterThan(0);
    expect(metrics.uniqueColorBuckets).toBeGreaterThan(1);
    expect(summarizeProductionWebGL2Proof(proof)).toMatchObject({
      pass: true,
      drawCalls: 1,
      liveTextures: 5,
      nonBlackPixels: metrics.nonBlackPixels
    });
    expect(summarizeProductionWebGL2Proof({ ...proof, mockDevice: true }).pass).toBe(false);
    expect(summarizeProductionWebGL2Proof({ ...proof, canvas2dProof: true }).pass).toBe(false);
  });
});
