import type { ThreeCompatPostProcessFrame, ThreeCompatPostProcessPass } from "./PostProcessTypes";

export class SMAAPassThreeCompat implements ThreeCompatPostProcessPass {
  readonly name = "SMAAPass";
  readonly enabled = true;
  apply(frame: ThreeCompatPostProcessFrame): ThreeCompatPostProcessFrame { return { ...frame, sharpness: frame.sharpness + 0.16 }; }
}
