import type { V5PostProcessFrame, V5PostProcessPass } from "./PostProcessTypes";

export class TAAPassV5 implements V5PostProcessPass {
  readonly name = "TAAPass";
  readonly enabled = true;
  apply(frame: V5PostProcessFrame): V5PostProcessFrame { return { ...frame, sharpness: frame.sharpness + 0.18 }; }
}
