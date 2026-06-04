import { motionBlurPixels } from "../../PostProcessPass";
import { applyThreeCompatPixelKernel, createThreeCompatVelocityProxy, type ThreeCompatPostProcessFrame, type ThreeCompatPostProcessPass } from "./PostProcessTypes";

export class MotionBlurPassThreeCompat implements ThreeCompatPostProcessPass {
  readonly name = "MotionBlurPass";
  readonly enabled = true;
  constructor(public readonly blur = 0.18) {}
  apply(frame: ThreeCompatPostProcessFrame): ThreeCompatPostProcessFrame {
    return applyThreeCompatPixelKernel(
      { ...frame, blur: frame.blur + this.blur },
      this.name,
      (pixels, width, height) => motionBlurPixels(pixels, width, height, {
        velocity: frame.velocity ?? createThreeCompatVelocityProxy(width, height),
        samples: 5,
        scale: Math.max(0.1, this.blur * 4)
      }).pixels,
      "motionBlurPixels kernel"
    );
  }
}
