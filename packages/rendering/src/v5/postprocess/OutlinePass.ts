import type { V5PostProcessFrame, V5PostProcessPass } from "./PostProcessTypes";

export class OutlinePassV5 implements V5PostProcessPass {
  readonly name = "OutlinePass";
  readonly enabled = true;
  constructor(public readonly strength = 0.5) {}
  apply(frame: V5PostProcessFrame): V5PostProcessFrame { return { ...frame, outlines: frame.outlines + this.strength }; }
}
