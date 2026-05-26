import type { ThreeCompatPostProcessFrame, ThreeCompatPostProcessPass } from "./PostProcessTypes";

export class DepthOfFieldPassThreeCompat implements ThreeCompatPostProcessPass {
  readonly name = "DepthOfFieldPass";
  readonly enabled = true;
  constructor(public readonly blur = 0.35) {}
  apply(frame: ThreeCompatPostProcessFrame): ThreeCompatPostProcessFrame { return { ...frame, blur: frame.blur + this.blur }; }
}
