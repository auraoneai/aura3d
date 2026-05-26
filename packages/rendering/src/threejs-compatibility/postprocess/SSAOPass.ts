import type { ThreeCompatPostProcessFrame, ThreeCompatPostProcessPass } from "./PostProcessTypes";

export class SSAOPassThreeCompat implements ThreeCompatPostProcessPass {
  readonly name = "SSAOPass";
  readonly enabled = true;
  constructor(public readonly radius = 0.7) {}
  apply(frame: ThreeCompatPostProcessFrame): ThreeCompatPostProcessFrame { return { ...frame, ambientOcclusion: frame.ambientOcclusion + this.radius }; }
}
