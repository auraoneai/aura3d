import { bloomPixels } from "../../PostProcessPass";
import { applyThreeCompatPixelKernel, type ThreeCompatPostProcessFrame, type ThreeCompatPostProcessPass } from "./PostProcessTypes";

export class BloomPassThreeCompat implements ThreeCompatPostProcessPass {
  readonly name = "BloomPass";
  readonly enabled = true;
  constructor(public readonly strength = 0.45) {}
  apply(frame: ThreeCompatPostProcessFrame): ThreeCompatPostProcessFrame {
    return applyThreeCompatPixelKernel(
      { ...frame, bloom: frame.bloom + this.strength },
      this.name,
      (pixels, width, height) => bloomPixels(pixels, width, height, { threshold: 0.58, intensity: this.strength, radius: 2 }).pixels,
      "bloomPixels kernel"
    );
  }
}
