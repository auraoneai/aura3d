import { assertValidPassContext, executeNativePass, type RenderPass, type RenderPassExecutionContext } from '../framegraph/RenderPass';

/** Compatibility adapter; rendering is dispatched to the canonical native pass.
 * Allocation, shader compilation and device lifetime remain with that renderer. */
export interface DepthPrepassOptions {
  readonly enabled?: boolean;
  readonly geometryResource?: string;
  readonly depthResource?: string;
}

export class DepthPrepass implements RenderPass {
  readonly id = 'DepthPrepass';
  readonly kind = 'depth' as const;
  readonly reads: readonly string[];
  readonly writes: readonly string[];
  private executedFrames = 0;
  private lastFrame = -1;

  constructor(private readonly options: DepthPrepassOptions = {}) {
    const geometryResource = options.geometryResource ?? 'scene.geometry';
    const depthResource = options.depthResource ?? 'linear-depth';
    if (geometryResource.trim().length === 0) throw new Error("DepthPrepass geometryResource must be non-empty.");
    if (depthResource.trim().length === 0) throw new Error("DepthPrepass depthResource must be non-empty.");
    this.reads = [geometryResource];
    this.writes = [depthResource];
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
      throw new Error(`DepthPrepass missing resources: ${missing.join(", ")}.`);
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

export { assertValidPassContext } from '../framegraph/RenderPass';
