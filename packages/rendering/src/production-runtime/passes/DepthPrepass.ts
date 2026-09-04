import type { RenderPass, RenderPassExecutionContext } from '../framegraph/RenderPass';

/**
 * muse3jsparity-PRD T3 — DepthPrepass owns real logic.
 *
 * GPU work lives in the WebGL2Device native programs; this pass owns the
 * CPU-side contract: validated options, truthful resource edges
 * (reads/writes match the actual resource flow), resource-availability
 * validation, context validation on execute, and observable execution
 * bookkeeping. Emptying this file fails
 * `tests/unit/rendering/framegraph-passes-t3.test.ts`.
 */
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
    this.executedFrames += 1;
    this.lastFrame = context.frameIndex;
  }
}

export function assertValidPassContext(passId: string, context: RenderPassExecutionContext): void {
  if (!Number.isInteger(context.frameIndex) || context.frameIndex < 0) {
    throw new RangeError(`${passId} requires a non-negative integer frameIndex.`);
  }
  if (!Number.isFinite(context.width) || context.width <= 0) {
    throw new RangeError(`${passId} requires a positive finite width.`);
  }
  if (!Number.isFinite(context.height) || context.height <= 0) {
    throw new RangeError(`${passId} requires a positive finite height.`);
  }
}
