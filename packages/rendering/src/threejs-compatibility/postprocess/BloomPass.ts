import type { ThreeCompatPostProcessFrame, ThreeCompatPostProcessPass } from "./PostProcessTypes";

export class BloomPassThreeCompat implements ThreeCompatPostProcessPass {
  readonly name = "BloomPass";
  readonly enabled = true;
  constructor(public readonly strength = 0.45) {}
  apply(frame: ThreeCompatPostProcessFrame): ThreeCompatPostProcessFrame { return { ...frame, bloom: frame.bloom + this.strength }; }
}
