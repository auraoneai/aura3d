import type { V5PostProcessFrame, V5PostProcessPass } from "./PostProcessTypes";

export class EffectComposerV5 {
  readonly passes: V5PostProcessPass[] = [];

  addPass(pass: V5PostProcessPass): this {
    this.passes.push(pass);
    return this;
  }

  render(frame: V5PostProcessFrame): V5PostProcessFrame {
    return this.passes.reduce((current, pass) => pass.enabled ? pass.apply(current) : current, frame);
  }
}
