import type { ThreeCompatPostProcessFrame, ThreeCompatPostProcessPass } from "./PostProcessTypes";

export class VignettePassThreeCompat implements ThreeCompatPostProcessPass {
  readonly name = "VignettePass";
  readonly enabled = true;
  constructor(public readonly amount = 0.22) {}
  apply(frame: ThreeCompatPostProcessFrame): ThreeCompatPostProcessFrame { return { ...frame, vignette: frame.vignette + this.amount }; }
}
