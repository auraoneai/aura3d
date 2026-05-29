import { ssaoPixels } from "../../PostProcessPass";
import { applyThreeCompatPixelKernel, createThreeCompatDepthProxy, type ThreeCompatPostProcessFrame, type ThreeCompatPostProcessPass } from "./PostProcessTypes";

export class SSAOPassThreeCompat implements ThreeCompatPostProcessPass {
  readonly name = "SSAOPass";
  readonly enabled = true;
  constructor(public readonly radius = 0.7) {}
  apply(frame: ThreeCompatPostProcessFrame): ThreeCompatPostProcessFrame {
    return applyThreeCompatPixelKernel(
      { ...frame, ambientOcclusion: frame.ambientOcclusion + this.radius },
      this.name,
      (pixels, width, height) => ssaoPixels(pixels, width, height, {
        depth: frame.depth ?? createThreeCompatDepthProxy(width, height),
        radius: Math.max(1, Math.round(this.radius * 3)),
        intensity: Math.max(0.1, this.radius),
        bias: 0.01
      }).pixels,
      "ssaoPixels kernel"
    );
  }
}
