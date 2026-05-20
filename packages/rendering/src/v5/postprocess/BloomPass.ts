import type { V5PostProcessFrame, V5PostProcessPass } from "./PostProcessTypes";

export class BloomPassV5 implements V5PostProcessPass {
  readonly name = "BloomPass";
  readonly enabled = true;
  constructor(public readonly strength = 0.45) {}
  apply(frame: V5PostProcessFrame): V5PostProcessFrame { return { ...frame, bloom: frame.bloom + this.strength }; }
}
