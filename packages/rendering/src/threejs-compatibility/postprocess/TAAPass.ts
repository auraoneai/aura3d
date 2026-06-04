import { taaPixels } from "../../PostProcessPass";
import { applyThreeCompatPixelKernel, createThreeCompatHistoryProxy, type ThreeCompatPostProcessFrame, type ThreeCompatPostProcessPass } from "./PostProcessTypes";

export class TAAPassThreeCompat implements ThreeCompatPostProcessPass {
  readonly name = "TAAPass";
  readonly enabled = true;
  apply(frame: ThreeCompatPostProcessFrame): ThreeCompatPostProcessFrame {
    return applyThreeCompatPixelKernel(
      { ...frame, sharpness: frame.sharpness + 0.18 },
      this.name,
      (pixels, width, height) => taaPixels(pixels, width, height, { history: frame.history ?? createThreeCompatHistoryProxy(pixels, width, height), blend: 0.22 }).pixels,
      "taaPixels kernel"
    );
  }
}
