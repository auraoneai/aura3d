import type { ThreeCompatPostProcessFrame, ThreeCompatPostProcessPass } from "./PostProcessTypes";

export class ShaderPassThreeCompat implements ThreeCompatPostProcessPass {
  readonly enabled = true;
  constructor(public readonly name: string, private readonly transform: (frame: ThreeCompatPostProcessFrame) => ThreeCompatPostProcessFrame) {}
  apply(frame: ThreeCompatPostProcessFrame): ThreeCompatPostProcessFrame { return this.transform(frame); }
}
