import { depthOfFieldPixels } from "../../PostProcessPass";
import { applyThreeCompatPixelKernel, createThreeCompatDepthProxy, type ThreeCompatPostProcessFrame, type ThreeCompatPostProcessPass } from "./PostProcessTypes";

export class DepthOfFieldPassThreeCompat implements ThreeCompatPostProcessPass {
  readonly name = "DepthOfFieldPass";
  readonly enabled = true;
  constructor(public readonly blur = 0.35) {}
  apply(frame: ThreeCompatPostProcessFrame): ThreeCompatPostProcessFrame {
    return applyThreeCompatPixelKernel(
      { ...frame, blur: frame.blur + this.blur },
      this.name,
      (pixels, width, height) => depthOfFieldPixels(pixels, width, height, {
        depth: frame.depth ?? createThreeCompatDepthProxy(width, height),
        focusDepth: 0.44,
        focusRange: 0.09,
        maxRadius: Math.max(1, Math.round(this.blur * 6))
      }).pixels,
      "depthOfFieldPixels kernel"
    );
  }
}
