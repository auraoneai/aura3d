import { describe, expect, it } from "vitest";
import {
  createDepthTextureBinding,
  createRendererPostprocessPasses,
  createRendererPostprocessPlanDiagnostics,
  volumetricLightPixels
} from "../../../packages/rendering/src";

describe("depth-aware volumetric light", () => {
  it("integrates bright samples radially while depth occluders suppress participating media", () => {
    const width = 32;
    const height = 24;
    const pixels = new Uint8Array(width * height * 4);
    const depth = new Float32Array(width * height).fill(1);
    for (let offset = 0; offset < pixels.length; offset += 4) pixels[offset + 3] = 255;
    for (let y = 1; y <= 4; y += 1) {
      for (let x = 14; x <= 18; x += 1) {
        const offset = (y * width + x) * 4;
        pixels[offset] = 255;
        pixels[offset + 1] = 238;
        pixels[offset + 2] = 180;
      }
    }
    for (let y = 8; y <= 18; y += 1) {
      for (let x = 14; x <= 18; x += 1) depth[y * width + x] = 0.18;
    }
    const result = volumetricLightPixels(pixels, width, height, {
      depth: createDepthTextureBinding({ label: "volumetric-unit-depth", width, height, data: depth }),
      lightPosition: [0.5, 0.1],
      samples: 24,
      density: 1,
      exposure: 0.9
    });

    expect(result.method).toBe("depth-aware-radial-participating-media");
    expect(result.sampleCount).toBe(24);
    expect(result.changedPixels).toBeGreaterThan(200);
    expect(result.occludedSamples).toBeGreaterThan(100);
    expect(result.maxScattering).toBeGreaterThan(0.1);
    expect(result.pixels[(12 * width + 5) * 4]).toBeGreaterThan(pixels[(12 * width + 5) * 4]!);
    expect(() => volumetricLightPixels(pixels, width, height)).toThrow(/requires a depth texture/i);
  });

  it("registers a renderer-owned depth pass with explicit diagnostics", () => {
    const passes = createRendererPostprocessPasses({
      toneMapping: false,
      volumetricLight: { lightPosition: [0.5, 0.12], samples: 20 }
    });
    const diagnostics = createRendererPostprocessPlanDiagnostics(
      { toneMapping: false, volumetricLight: { lightPosition: [0.5, 0.12], samples: 20 } },
      { rendererDepthAvailable: true }
    );

    expect(passes.map((pass) => pass.name)).toEqual(["volumetric-light"]);
    expect(diagnostics.requiresDepthTexture).toBe(true);
    expect(diagnostics.missingInputs).toEqual([]);
    expect(diagnostics.passes[0]).toMatchObject({
      name: "volumetric-light",
      requiresDepth: true,
      usesRendererOwnedDepth: true
    });
  });
});
