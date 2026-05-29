import { describe, expect, it } from "vitest";
import {
  BloomPass,
  ColorGradingPass,
  DOFPass,
  FXAAPass,
  ProductionEffectComposer,
  SSAOPass,
  createProductionDemoPostProcessInput
} from "../../../packages/rendering/src/production-runtime";

describe("production-runtime postprocess", () => {
  it("runs named postprocess classes through real pixel kernels", () => {
    const input = createProductionDemoPostProcessInput();
    const composer = new ProductionEffectComposer({ passes: [
      new ColorGradingPass(),
      new BloomPass(),
      new SSAOPass(),
      new DOFPass(),
      new FXAAPass()
    ] });
    const output = composer.render(input);

    expect(output.pixels).toBeInstanceOf(Uint8Array);
    expect(output.passOutputs.map((pass) => pass.passName)).toEqual([
      "production-color-grading",
      "production-bloom",
      "production-ssao",
      "production-depth-of-field",
      "production-fxaa"
    ]);
    expect(output.totalChangedPixels).toBeGreaterThan(1000);
    expect(output.diagnostics.join(" ")).toContain("pixel kernel");
  });
});
