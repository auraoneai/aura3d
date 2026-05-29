import { fxaaPixels } from "../../PostProcessPass";
import { applyThreeCompatPixelKernel, type ThreeCompatPostProcessFrame, type ThreeCompatPostProcessPass } from "./PostProcessTypes";

export class FXAAPassThreeCompat implements ThreeCompatPostProcessPass {
  readonly name = "FXAAPass";
  readonly enabled = true;
  apply(frame: ThreeCompatPostProcessFrame): ThreeCompatPostProcessFrame {
    return applyThreeCompatPixelKernel(
      { ...frame, sharpness: frame.sharpness + 0.12 },
      this.name,
      (pixels, width, height) => fxaaPixels(pixels, width, height, { edgeThreshold: 0.08, subpixelBlend: 0.68 }).pixels,
      "fxaaPixels kernel"
    );
  }
}
