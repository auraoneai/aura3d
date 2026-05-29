import { outlinePixels } from "../../PostProcessPass";
import { applyThreeCompatPixelKernel, type ThreeCompatPostProcessFrame, type ThreeCompatPostProcessPass } from "./PostProcessTypes";

export class OutlinePassThreeCompat implements ThreeCompatPostProcessPass {
  readonly name = "OutlinePass";
  readonly enabled = true;
  constructor(public readonly strength = 0.5) {}
  apply(frame: ThreeCompatPostProcessFrame): ThreeCompatPostProcessFrame {
    return applyThreeCompatPixelKernel(
      { ...frame, outlines: frame.outlines + this.strength },
      this.name,
      (pixels, width, height) => outlinePixels(pixels, width, height, {
        threshold: 0.08,
        width: 2,
        opacity: Math.min(1, 0.45 + this.strength * 0.5),
        color: [64, 190, 255, 255]
      }).pixels,
      "outlinePixels kernel"
    );
  }
}
