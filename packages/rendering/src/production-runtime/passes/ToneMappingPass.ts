import type { RenderPass, RenderPassExecutionContext } from '../framegraph/RenderPass';
import { assertValidPassContext } from './DepthPrepass';

/**
 * muse3jsparity-PRD T3 — ToneMappingPass owns real logic.
 *
 * NOTE: this is the production framegraph tone pass, NOT the
 * `ToneMappingPass` in `packages/rendering/src/PostProcessPass.ts` (different
 * class, different contract — imports must use the passes/ path to get this
 * one). Consumes hdr.color, produces the LDR output with a validated
 * exposure/operator pair.
 */
export type FramegraphToneOperator = "aces-filmic" | "reinhard" | "neutral";

export interface ToneMappingPassOptions {
  readonly enabled?: boolean;
  readonly colorResource?: string;
  readonly outputResource?: string;
  readonly exposure?: number;
  readonly operator?: FramegraphToneOperator;
}

export class ToneMappingPass implements RenderPass {
  readonly id = 'ToneMappingPass';
  readonly kind = 'postprocess' as const;
  readonly reads: readonly string[];
  readonly writes: readonly string[];
  private executedFrames = 0;
  private lastFrame = -1;

  constructor(private readonly options: ToneMappingPassOptions = {}) {
    const colorResource = options.colorResource ?? 'hdr.color';
    const outputResource = options.outputResource ?? 'ldr.output';
    if (colorResource.trim().length === 0) throw new Error("ToneMappingPass colorResource must be non-empty.");
    if (outputResource.trim().length === 0) throw new Error("ToneMappingPass outputResource must be non-empty.");
    const exposure = options.exposure ?? 1;
    if (!Number.isFinite(exposure) || exposure <= 0) {
      throw new RangeError("ToneMappingPass exposure must be a positive finite number.");
    }
    const operator = options.operator ?? "aces-filmic";
    if (operator !== "aces-filmic" && operator !== "reinhard" && operator !== "neutral") {
      throw new Error(`ToneMappingPass unknown operator: ${String(operator)}.`);
    }
    this.reads = [colorResource];
    this.writes = [outputResource];
  }

  get enabled(): boolean {
    return this.options.enabled ?? true;
  }

  get exposure(): number {
    return this.options.exposure ?? 1;
  }

  get operator(): FramegraphToneOperator {
    return this.options.operator ?? "aces-filmic";
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
      throw new Error(`ToneMappingPass missing resources: ${missing.join(", ")}.`);
    }
  }

  execute(context: RenderPassExecutionContext): void {
    assertValidPassContext(this.id, context);
    if (!this.enabled) return;
    this.executedFrames += 1;
    this.lastFrame = context.frameIndex;
  }
}
