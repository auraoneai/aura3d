import type { RenderPass } from './RenderPass';

export class FrameGraph {
  private readonly passes: RenderPass[] = [];

  addPass(pass: RenderPass): this {
    this.passes.push(pass);
    return this;
  }

  getPasses(): readonly RenderPass[] {
    return this.passes;
  }

  compile(): readonly RenderPass[] {
    return [...this.passes].sort((a, b) => a.kind.localeCompare(b.kind));
  }
}
