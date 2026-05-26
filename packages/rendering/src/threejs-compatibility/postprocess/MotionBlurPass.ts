import type { ThreeCompatPostProcessFrame, ThreeCompatPostProcessPass } from "./PostProcessTypes";

export class MotionBlurPassThreeCompat implements ThreeCompatPostProcessPass {
  readonly name = "MotionBlurPass";
  readonly enabled = true;
  constructor(public readonly blur = 0.18) {}
  apply(frame: ThreeCompatPostProcessFrame): ThreeCompatPostProcessFrame { return { ...frame, blur: frame.blur + this.blur }; }
}
