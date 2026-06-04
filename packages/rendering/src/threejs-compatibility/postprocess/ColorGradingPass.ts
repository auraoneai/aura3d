import { colorGradePixels } from "../../PostProcessPass";
import { applyThreeCompatPixelKernel, type ThreeCompatPostProcessFrame, type ThreeCompatPostProcessPass } from "./PostProcessTypes";

export class ColorGradingPassThreeCompat implements ThreeCompatPostProcessPass {
  readonly name = "ColorGradingPass";
  readonly enabled = true;
  constructor(public readonly contrast = 1.16, public readonly saturation = 1.08) {}
  apply(frame: ThreeCompatPostProcessFrame): ThreeCompatPostProcessFrame {
    return applyThreeCompatPixelKernel(
      { ...frame, contrast: frame.contrast * this.contrast, saturation: frame.saturation * this.saturation },
      this.name,
      (pixels, width, height) => colorGradePixels(pixels, width, height, { contrast: this.contrast, saturation: this.saturation, vibrance: 0.12, vignette: 0.1, sharpening: 0.12 }).pixels,
      "colorGradePixels kernel"
    );
  }
}
