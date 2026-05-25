import type { V5PostProcessFrame, V5PostProcessPass } from "./PostProcessTypes";

export class ShaderPassV5 implements V5PostProcessPass {
  readonly enabled = true;
  constructor(public readonly name: string, private readonly transform: (frame: V5PostProcessFrame) => V5PostProcessFrame) {}
  apply(frame: V5PostProcessFrame): V5PostProcessFrame { return this.transform(frame); }
}
