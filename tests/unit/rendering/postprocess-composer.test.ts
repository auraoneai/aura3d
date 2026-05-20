import { describe, expect, it } from "vitest";
import {
  MockRenderDevice,
  PostProcessComposer,
  createPostProcessCapabilityReport,
  createDepthTextureBinding,
  type RenderTarget
} from "../../../packages/rendering/src";

describe("PostProcessComposer", () => {
  it("runs public postprocess passes through reusable ping-pong render targets", () => {
    const device = new MockRenderDevice();
    const source = device.createRenderTarget({ width: 3, height: 1, label: "composer-source" }) as RenderTarget & { colorPixels: Uint8Array };
    const output = device.createRenderTarget({ width: 3, height: 1, label: "composer-output" });
    source.colorPixels.set([
      0, 0, 0, 255,
      255, 255, 255, 255,
      0, 0, 0, 255
    ]);

    const composer = new PostProcessComposer({ device, width: 3, height: 1, label: "unit-composer" });
    const before = device.getDiagnostics();

    const diagnostics = composer.render({
      source,
      target: output,
      passes: [
        { name: "bloom", options: { threshold: 0.9, intensity: 1, radius: 1 } },
        { name: "fxaa", options: { edgeThreshold: 0.1, subpixelBlend: 0 } }
      ]
    });

    device.setRenderTarget(output);
    expect(Array.from(device.readPixels(0, 0, 3, 1))).toEqual([
      85, 85, 85, 255,
      255, 255, 255, 255,
      85, 85, 85, 255
    ]);
    expect(diagnostics).toMatchObject({
      width: 3,
      height: 1,
      passCount: 2,
      pingPongTargets: 2,
      textureCount: 2,
      lastPasses: ["bloom", "fxaa"],
      presentedToBackbuffer: false,
      outputTargetLabel: "composer-output"
    });
    expect(device.getDiagnostics().renderTargets).toBe(before.renderTargets);

    composer.dispose();
    source.dispose();
    output.dispose();
    expect(device.getDiagnostics()).toMatchObject({
      renderTargets: 0,
      textures: 0
    });
  });

  it("presents to the backbuffer when no output target is supplied", () => {
    const device = new MockRenderDevice();
    const source = device.createRenderTarget({ width: 1, height: 1, label: "present-source" }) as RenderTarget & { colorPixels: Uint8Array };
    source.colorPixels.set([128, 64, 0, 255]);
    const composer = new PostProcessComposer({ device, width: 1, height: 1 });

    const diagnostics = composer.render({
      source,
      passes: [{ name: "tone-mapping", options: { exposure: 2, gamma: 1, operator: "reinhard", outputColorSpace: "linear" } }]
    });

    expect(diagnostics.presentedToBackbuffer).toBe(true);
    expect(Array.from(device.readPixels(0, 0, 1, 1))).toEqual([128, 85, 0, 255]);
    composer.dispose();
    source.dispose();
  });

  it("resizes ping-pong targets and validates source dimensions", () => {
    const device = new MockRenderDevice();
    const composer = new PostProcessComposer({ device, width: 2, height: 2 });
    expect(device.getDiagnostics()).toMatchObject({ renderTargets: 2, textures: 2 });

    composer.resize(4, 1);
    expect(composer.getDiagnostics()).toMatchObject({ width: 4, height: 1, pingPongTargets: 2 });
    expect(device.getDiagnostics()).toMatchObject({
      renderTargets: 2,
      textures: 2,
      disposedRenderTargets: 2,
      disposedTextures: 2
    });

    const wrongSize = device.createRenderTarget({ width: 2, height: 2, label: "wrong-size" });
    expect(() => composer.render({ source: wrongSize })).toThrow(/dimensions/);
    wrongSize.dispose();
    composer.dispose();
  });

  it("supports depth-aware public composer passes when the caller provides depth data", () => {
    const device = new MockRenderDevice();
    const source = device.createRenderTarget({ width: 3, height: 3, label: "depth-source" }) as RenderTarget & { colorPixels: Uint8Array };
    source.colorPixels.fill(180);
    for (let index = 3; index < source.colorPixels.length; index += 4) source.colorPixels[index] = 255;
    const output = device.createRenderTarget({ width: 3, height: 3, label: "depth-output" });
    const depth = createDepthTextureBinding({
      label: "composer-depth",
      width: 3,
      height: 3,
      data: new Float32Array([
        0.9, 0.9, 0.9,
        0.9, 0.2, 0.9,
        0.9, 0.9, 0.9
      ])
    });
    const composer = new PostProcessComposer({ device, width: 3, height: 3 });

    composer.render({
      source,
      target: output,
      passes: [
        { name: "ssao", options: { depth, radius: 1, intensity: 0.4 } },
        { name: "outline", options: { width: 1, threshold: 0.01, opacity: 0.8 } }
      ]
    });

    device.setRenderTarget(output);
    expect(Array.from(device.readPixels(0, 0, 3, 3))).not.toEqual(Array.from(source.colorPixels));
    composer.dispose();
    source.dispose();
    output.dispose();
  });

  it("reports supported and unsupported postprocess effects per backend capability", () => {
    const device = new MockRenderDevice();
    const report = createPostProcessCapabilityReport(device);

    expect(report.backend).toBe("mock");
    expect(report.supportedEffects).toEqual(expect.arrayContaining([
      "bloom",
      "tone-mapping",
      "depth-of-field-with-depth-binding",
      "ssao-with-depth-binding",
      "fxaa",
      "taa",
      "stereo-parallax-barrier"
    ]));
    expect(report.supportsRenderTargets).toBe(true);
    expect(report.supportsPresentation).toBe(true);
    expect(report.supportsPixelReadback).toBe(true);
    expect(report.supportsRendererOwnedDepthEffects).toBe(true);
    expect(report.unsupportedEffects).toEqual(expect.arrayContaining([
      expect.objectContaining({ name: "smaa" }),
      expect.objectContaining({ name: "hdr-render-target-postprocess", requiredCapability: "hdr-render-targets" }),
      expect.objectContaining({ name: "hdr-float-readback-postprocess", requiredCapability: "float-readback" })
    ]));
  });
});
