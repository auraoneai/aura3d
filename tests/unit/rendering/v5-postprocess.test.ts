import { describe, expect, it } from "vitest";
import {
  BloomPassV5,
  ColorGradingPassV5,
  DepthOfFieldPassV5,
  EffectComposerV5,
  FXAAPassV5,
  MotionBlurPassV5,
  OutlinePassV5,
  RenderPassV5,
  SMAAPassV5,
  SSAOPassV5,
  TAAPassV5,
  VignettePassV5,
  createV5BaseFrame
} from "../../../packages/rendering/src";
import { EffectComposerCompat, RenderPassCompat, UnrealBloomPassCompat } from "../../../packages/three-compat/src";

describe("V5 postprocess", () => {
  it("runs a cinematic composer chain and exposes Three.js-style adapters", () => {
    const composer = new EffectComposerV5()
      .addPass(new RenderPassV5())
      .addPass(new BloomPassV5())
      .addPass(new SSAOPassV5())
      .addPass(new TAAPassV5())
      .addPass(new FXAAPassV5())
      .addPass(new SMAAPassV5())
      .addPass(new DepthOfFieldPassV5())
      .addPass(new MotionBlurPassV5())
      .addPass(new ColorGradingPassV5())
      .addPass(new VignettePassV5())
      .addPass(new OutlinePassV5());
    const output = composer.render(createV5BaseFrame());
    const compat = new EffectComposerCompat().addPass(new RenderPassCompat()).addPass(new UnrealBloomPassCompat());
    const compatOutput = compat.render(createV5BaseFrame());

    expect(output.label).toBe("rendered-scene");
    expect(output.bloom).toBeGreaterThan(0);
    expect(output.ambientOcclusion).toBeGreaterThan(0);
    expect(output.blur).toBeGreaterThan(0);
    expect(output.sharpness).toBeGreaterThan(0.4);
    expect(output.contrast).toBeGreaterThan(1);
    expect(output.vignette).toBeGreaterThan(0);
    expect(output.outlines).toBeGreaterThan(0);
    expect(compatOutput.bloom).toBeGreaterThan(0);
  });
});
