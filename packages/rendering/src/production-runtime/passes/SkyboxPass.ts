import { executeNativePass, type RenderPass, type RenderPassExecutionContext } from '../framegraph/RenderPass';
import { assertValidPassContext } from './DepthPrepass';

/** Compatibility adapter; rendering is dispatched to the canonical native pass.
 * Allocation, shader compilation and device lifetime remain with that renderer. */
export interface SkyboxPassOptions {
  readonly enabled?: boolean;
  readonly skyResource?: string;
  readonly colorResource?: string;
}

export class SkyboxPass implements RenderPass {
  readonly id = 'SkyboxPass';
  readonly kind = 'skybox' as const;
  readonly reads: readonly string[];
  readonly writes: readonly string[];
  private executedFrames = 0;
  private lastFrame = -1;

  constructor(private readonly options: SkyboxPassOptions = {}) {
    const skyResource = options.skyResource ?? 'environment.sky';
    const colorResource = options.colorResource ?? 'hdr.color';
    if (skyResource.trim().length === 0) throw new Error("SkyboxPass skyResource must be non-empty.");
    if (colorResource.trim().length === 0) throw new Error("SkyboxPass colorResource must be non-empty.");
    this.reads = [skyResource];
    this.writes = [colorResource];
  }

  get enabled(): boolean {
    return this.options.enabled ?? true;
  }

  get executionCount(): number {
    return this.executedFrames;
  }

  get lastExecutedFrame(): number {
    return this.lastFrame;
  }

  validateResources(available: readonly string[]): void {
    const missing = this.reads.filter((resource) => !available.includes(resource));
    if (missing.length > 0) {
      throw new Error(`SkyboxPass missing resources: ${missing.join(", ")}.`);
    }
  }

  execute(context: RenderPassExecutionContext): void {
    assertValidPassContext(this.id, context);
    if (!this.enabled) return;
    executeNativePass(this, context);
    this.executedFrames += 1;
    this.lastFrame = context.frameIndex;
  }
}
