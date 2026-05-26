import type { ThreeCompatPostProcessFrame, ThreeCompatPostProcessPass } from "./PostProcessTypes";

export class TAAPassThreeCompat implements ThreeCompatPostProcessPass {
  readonly name = "TAAPass";
  readonly enabled = true;
  apply(frame: ThreeCompatPostProcessFrame): ThreeCompatPostProcessFrame { return { ...frame, sharpness: frame.sharpness + 0.18 }; }
}
