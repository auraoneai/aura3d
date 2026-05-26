import type { ThreeCompatPostProcessFrame, ThreeCompatPostProcessPass } from "./PostProcessTypes";

export class ColorGradingPassThreeCompat implements ThreeCompatPostProcessPass {
  readonly name = "ColorGradingPass";
  readonly enabled = true;
  constructor(public readonly contrast = 1.16, public readonly saturation = 1.08) {}
  apply(frame: ThreeCompatPostProcessFrame): ThreeCompatPostProcessFrame {
    return { ...frame, contrast: frame.contrast * this.contrast, saturation: frame.saturation * this.saturation };
  }
}
