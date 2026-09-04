import type { RenderPass, RenderPassExecutionContext } from '../framegraph/RenderPass';
import { assertValidPassContext } from './DepthPrepass';

/**
 * muse3jsparity-PRD T3 — ShadowPass owns real logic (feeds B1).
 *
 * Same contract as DepthPrepass: validated options, truthful edges, resource
 * validation, context validation, execution bookkeeping. The shadow-mask edge
 * declared here is the edge the B1 spot/directional shadow path must produce.
 */
export interface ShadowPassOptions {
  readonly enabled?: boolean;
  readonly casterResource?: string;
  readonly shadowMapResource?: string;
  readonly shadowMaskResource?: string;
  readonly maxShadowCasters?: number;
}

export class ShadowPass implements RenderPass {
  readonly id = 'ShadowPass';
  readonly kind = 'shadow' as const;
  readonly reads: readonly string[];
  readonly writes: readonly string[];
  private executedFrames = 0;
  private lastFrame = -1;

  constructor(private readonly options: ShadowPassOptions = {}) {
    const casterResource = options.casterResource ?? 'scene.casters';
    const shadowMapResource = options.shadowMapResource ?? 'shadow.maps';
    const shadowMaskResource = options.shadowMaskResource ?? 'shadow.mask';
    for (const [label, value] of [["casterResource", casterResource], ["shadowMapResource", shadowMapResource], ["shadowMaskResource", shadowMaskResource]] as const) {
      if (value.trim().length === 0) throw new Error(`ShadowPass ${label} must be non-empty.`);
    }
    if (options.maxShadowCasters !== undefined && (!Number.isInteger(options.maxShadowCasters) || options.maxShadowCasters <= 0)) {
      throw new RangeError("ShadowPass maxShadowCasters must be a positive integer.");
    }
    this.reads = [casterResource, shadowMapResource];
    this.writes = [shadowMaskResource];
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
      throw new Error(`ShadowPass missing resources: ${missing.join(", ")}.`);
    }
  }

  execute(context: RenderPassExecutionContext): void {
    assertValidPassContext(this.id, context);
    if (!this.enabled) return;
    this.executedFrames += 1;
    this.lastFrame = context.frameIndex;
  }
}
