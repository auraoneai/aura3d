import type { V5PostProcessFrame, V5PostProcessPass } from "./PostProcessTypes";

export class DepthOfFieldPassV5 implements V5PostProcessPass {
  readonly name = "DepthOfFieldPass";
  readonly enabled = true;
  constructor(public readonly blur = 0.35) {}
  apply(frame: V5PostProcessFrame): V5PostProcessFrame { return { ...frame, blur: frame.blur + this.blur }; }
}
