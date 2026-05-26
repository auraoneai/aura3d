import { describe, expect, it } from "vitest";
import {
  BloomPassThreeCompat,
  ColorGradingPassThreeCompat,
  DepthOfFieldPassThreeCompat,
  EffectComposerThreeCompat,
  FXAAPassThreeCompat,
  MotionBlurPassThreeCompat,
  OutlinePassThreeCompat,
  RenderPassThreeCompat,
  SMAAPassThreeCompat,
  SSAOPassThreeCompat,
  TAAPassThreeCompat,
  VignettePassThreeCompat,
  createThreeCompatBaseFrame
} from "../../../packages/rendering/src";
import { EffectComposerCompat, RenderPassCompat, UnrealBloomPassCompat } from "../../../packages/three-compat/src";

describe("ThreeCompat postprocess", () => {
  it("runs a cinematic composer chain and exposes Three.js-style adapters", () => {
    const composer = new EffectComposerThreeCompat()
      .addPass(new RenderPassThreeCompat())
      .addPass(new BloomPassThreeCompat())
      .addPass(new SSAOPassThreeCompat())
      .addPass(new TAAPassThreeCompat())
      .addPass(new FXAAPassThreeCompat())
      .addPass(new SMAAPassThreeCompat())
      .addPass(new DepthOfFieldPassThreeCompat())
      .addPass(new MotionBlurPassThreeCompat())
      .addPass(new ColorGradingPassThreeCompat())
      .addPass(new VignettePassThreeCompat())
      .addPass(new OutlinePassThreeCompat());
    const output = composer.render(createThreeCompatBaseFrame());
    const compat = new EffectComposerCompat().addPass(new RenderPassCompat()).addPass(new UnrealBloomPassCompat());
    const compatOutput = compat.render(createThreeCompatBaseFrame());

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
