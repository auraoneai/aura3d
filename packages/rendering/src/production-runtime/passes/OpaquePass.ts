import type { RenderPass, RenderPassExecutionContext } from '../framegraph/RenderPass';
import { assertValidPassContext } from './DepthPrepass';

/**
 * muse3jsparity-PRD T3 — OpaquePass owns real logic.
 *
 * Declares the opaque composite edges: depth + shadow mask + environment
 * lighting in, HDR color out. TransparentPass blends over this output;
 * ToneMappingPass consumes it.
 */
export interface OpaquePassOptions {
  readonly enabled?: boolean;
  readonly depthResource?: string;
  readonly shadowMaskResource?: string;
  readonly lightingResource?: string;
  readonly colorResource?: string;
}

export class OpaquePass implements RenderPass {
  readonly id = 'OpaquePass';
  readonly kind = 'opaque' as const;
  readonly reads: readonly string[];
  readonly writes: readonly string[];
  private executedFrames = 0;
  private lastFrame = -1;

  constructor(private readonly options: OpaquePassOptions = {}) {
    const depthResource = options.depthResource ?? 'linear-depth';
    const shadowMaskResource = options.shadowMaskResource ?? 'shadow.mask';
    const lightingResource = options.lightingResource ?? 'environment.lighting';
    const colorResource = options.colorResource ?? 'hdr.color';
    for (const [label, value] of [["depthResource", depthResource], ["shadowMaskResource", shadowMaskResource], ["lightingResource", lightingResource], ["colorResource", colorResource]] as const) {
      if (value.trim().length === 0) throw new Error(`OpaquePass ${label} must be non-empty.`);
    }
    this.reads = [depthResource, shadowMaskResource, lightingResource];
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
      throw new Error(`OpaquePass missing resources: ${missing.join(", ")}.`);
    }
  }

  execute(context: RenderPassExecutionContext): void {
    assertValidPassContext(this.id, context);
    if (!this.enabled) return;
    this.executedFrames += 1;
    this.lastFrame = context.frameIndex;
  }
}
