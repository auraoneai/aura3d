import { colorGradePixels } from "../../PostProcessPass";
import { applyThreeCompatPixelKernel, type ThreeCompatPostProcessFrame, type ThreeCompatPostProcessPass } from "./PostProcessTypes";

export class VignettePassThreeCompat implements ThreeCompatPostProcessPass {
  readonly name = "VignettePass";
  readonly enabled = true;
  constructor(public readonly amount = 0.22) {}
  apply(frame: ThreeCompatPostProcessFrame): ThreeCompatPostProcessFrame {
    return applyThreeCompatPixelKernel(
      { ...frame, vignette: frame.vignette + this.amount },
      this.name,
      (pixels, width, height) => colorGradePixels(pixels, width, height, { vignette: this.amount, contrast: 1.02, saturation: 1 }).pixels,
      "colorGradePixels vignette kernel"
    );
  }
}
