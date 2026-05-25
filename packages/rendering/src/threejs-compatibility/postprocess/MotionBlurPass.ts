import type { V5PostProcessFrame, V5PostProcessPass } from "./PostProcessTypes";

export class MotionBlurPassV5 implements V5PostProcessPass {
  readonly name = "MotionBlurPass";
  readonly enabled = true;
  constructor(public readonly blur = 0.18) {}
  apply(frame: V5PostProcessFrame): V5PostProcessFrame { return { ...frame, blur: frame.blur + this.blur }; }
}
