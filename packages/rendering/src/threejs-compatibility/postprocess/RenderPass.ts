import type { V5PostProcessFrame, V5PostProcessPass } from "./PostProcessTypes";

export class RenderPassV5 implements V5PostProcessPass {
  readonly name = "RenderPass";
  readonly enabled = true;
  apply(frame: V5PostProcessFrame): V5PostProcessFrame {
    return { ...frame, label: "rendered-scene" };
  }
}
