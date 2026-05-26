import type { ThreeCompatPostProcessFrame, ThreeCompatPostProcessPass } from "./PostProcessTypes";

export class OutlinePassThreeCompat implements ThreeCompatPostProcessPass {
  readonly name = "OutlinePass";
  readonly enabled = true;
  constructor(public readonly strength = 0.5) {}
  apply(frame: ThreeCompatPostProcessFrame): ThreeCompatPostProcessFrame { return { ...frame, outlines: frame.outlines + this.strength }; }
}
