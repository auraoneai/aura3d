import { executeNativePass, type RenderPass, type RenderPassExecutionContext } from '../framegraph/RenderPass';
import { assertValidPassContext } from './DepthPrepass';

/** Compatibility adapter; rendering is dispatched to the canonical native pass.
 * Allocation, shader compilation and device lifetime remain with that renderer. */
export interface TransparentPassOptions {
  readonly enabled?: boolean;
  readonly colorResource?: string;
  readonly depthResource?: string;
  readonly geometryResource?: string;
  readonly maxTransparentItems?: number;
}

export class TransparentPass implements RenderPass {
  readonly id = 'TransparentPass';
  readonly kind = 'transparent' as const;
  readonly reads: readonly string[];
  readonly writes: readonly string[];
  private executedFrames = 0;
  private lastFrame = -1;

  constructor(private readonly options: TransparentPassOptions = {}) {
    const colorResource = options.colorResource ?? 'hdr.color';
    const depthResource = options.depthResource ?? 'linear-depth';
    const geometryResource = options.geometryResource ?? 'scene.geometry';
    if (geometryResource.trim().length === 0) throw new Error('TransparentPass geometryResource must be non-empty.');
    if (colorResource.trim().length === 0) throw new Error("TransparentPass colorResource must be non-empty.");
    if (depthResource.trim().length === 0) throw new Error("TransparentPass depthResource must be non-empty.");
    if (options.maxTransparentItems !== undefined && (!Number.isInteger(options.maxTransparentItems) || options.maxTransparentItems <= 0)) {
      throw new RangeError("TransparentPass maxTransparentItems must be a positive integer.");
    }
    this.reads = [colorResource, depthResource, geometryResource];
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
      throw new Error(`TransparentPass missing resources: ${missing.join(", ")}.`);
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
