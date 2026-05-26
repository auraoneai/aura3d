import type { ThreeCompatPostProcessFrame, ThreeCompatPostProcessPass } from "./PostProcessTypes";

export class FXAAPassThreeCompat implements ThreeCompatPostProcessPass {
  readonly name = "FXAAPass";
  readonly enabled = true;
  apply(frame: ThreeCompatPostProcessFrame): ThreeCompatPostProcessFrame { return { ...frame, sharpness: frame.sharpness + 0.12 }; }
}
