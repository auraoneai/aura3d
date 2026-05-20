import type { V5PostProcessFrame, V5PostProcessPass } from "./PostProcessTypes";

export class SSAOPassV5 implements V5PostProcessPass {
  readonly name = "SSAOPass";
  readonly enabled = true;
  constructor(public readonly radius = 0.7) {}
  apply(frame: V5PostProcessFrame): V5PostProcessFrame { return { ...frame, ambientOcclusion: frame.ambientOcclusion + this.radius }; }
}
