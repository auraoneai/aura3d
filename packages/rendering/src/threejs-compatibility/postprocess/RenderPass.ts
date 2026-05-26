import type { ThreeCompatPostProcessFrame, ThreeCompatPostProcessPass } from "./PostProcessTypes";

export class RenderPassThreeCompat implements ThreeCompatPostProcessPass {
  readonly name = "RenderPass";
  readonly enabled = true;
  apply(frame: ThreeCompatPostProcessFrame): ThreeCompatPostProcessFrame {
    return { ...frame, label: "rendered-scene" };
  }
}
