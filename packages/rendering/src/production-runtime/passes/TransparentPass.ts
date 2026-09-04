import type { RenderPass, RenderPassExecutionContext } from '../framegraph/RenderPass';
import { assertValidPassContext } from './DepthPrepass';

/**
 * muse3jsparity-PRD T3 — TransparentPass owns real logic.
 *
 * Read/write the SAME hdr.color resource: transparency composites over the
 * opaque output in place. The shared resource name is load-bearing — a
 * graph that routes transparent output anywhere else is miswired, and
 * `validateResources` + the topology test enforce it.
 */
export interface TransparentPassOptions {
  readonly enabled?: boolean;
  readonly colorResource?: string;
  readonly depthResource?: string;
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
    if (colorResource.trim().length === 0) throw new Error("TransparentPass colorResource must be non-empty.");
    if (depthResource.trim().length === 0) throw new Error("TransparentPass depthResource must be non-empty.");
    if (options.maxTransparentItems !== undefined && (!Number.isInteger(options.maxTransparentItems) || options.maxTransparentItems <= 0)) {
      throw new RangeError("TransparentPass maxTransparentItems must be a positive integer.");
    }
    this.reads = [colorResource, depthResource];
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
    this.executedFrames += 1;
    this.lastFrame = context.frameIndex;
  }
}
