import type { V5PostProcessFrame, V5PostProcessPass } from "./PostProcessTypes";

export class ColorGradingPassV5 implements V5PostProcessPass {
  readonly name = "ColorGradingPass";
  readonly enabled = true;
  constructor(public readonly contrast = 1.16, public readonly saturation = 1.08) {}
  apply(frame: V5PostProcessFrame): V5PostProcessFrame {
    return { ...frame, contrast: frame.contrast * this.contrast, saturation: frame.saturation * this.saturation };
  }
}
