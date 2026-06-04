import { fxaaPixels } from "../../PostProcessPass";
import { applyThreeCompatPixelKernel, type ThreeCompatPostProcessFrame, type ThreeCompatPostProcessPass } from "./PostProcessTypes";

export class SMAAPassThreeCompat implements ThreeCompatPostProcessPass {
  readonly name = "SMAAPass";
  readonly enabled = true;
  apply(frame: ThreeCompatPostProcessFrame): ThreeCompatPostProcessFrame {
    return applyThreeCompatPixelKernel(
      { ...frame, sharpness: frame.sharpness + 0.16 },
      this.name,
      (pixels, width, height) => fxaaPixels(pixels, width, height, { edgeThreshold: 0.06, subpixelBlend: 0.72 }).pixels,
      "FXAA-backed compatibility antialiasing kernel"
    );
  }
}
