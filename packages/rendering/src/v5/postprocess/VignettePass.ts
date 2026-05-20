import type { V5PostProcessFrame, V5PostProcessPass } from "./PostProcessTypes";

export class VignettePassV5 implements V5PostProcessPass {
  readonly name = "VignettePass";
  readonly enabled = true;
  constructor(public readonly amount = 0.22) {}
  apply(frame: V5PostProcessFrame): V5PostProcessFrame { return { ...frame, vignette: frame.vignette + this.amount }; }
}
