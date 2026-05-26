import type { ThreeCompatPostProcessFrame, ThreeCompatPostProcessPass } from "./PostProcessTypes";

export class EffectComposerThreeCompat {
  readonly passes: ThreeCompatPostProcessPass[] = [];

  addPass(pass: ThreeCompatPostProcessPass): this {
    this.passes.push(pass);
    return this;
  }

  render(frame: ThreeCompatPostProcessFrame): ThreeCompatPostProcessFrame {
    return this.passes.reduce((current, pass) => pass.enabled ? pass.apply(current) : current, frame);
  }
}
