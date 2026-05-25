import type { V5PostProcessFrame, V5PostProcessPass } from "./PostProcessTypes";

export class FXAAPassV5 implements V5PostProcessPass {
  readonly name = "FXAAPass";
  readonly enabled = true;
  apply(frame: V5PostProcessFrame): V5PostProcessFrame { return { ...frame, sharpness: frame.sharpness + 0.12 }; }
}
