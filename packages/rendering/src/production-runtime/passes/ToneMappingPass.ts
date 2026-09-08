import type { ToneMappingOperator } from '../../PostProcessPass';
import { executeNativePass, type RenderPass, type RenderPassExecutionContext } from '../framegraph/RenderPass';
import { assertValidPassContext } from './DepthPrepass';

/** Compatibility adapter; rendering is dispatched to the canonical native pass.
 * Allocation, shader compilation and device lifetime remain with that renderer. */
export type FramegraphToneOperator = "aces-filmic" | "reinhard" | "neutral";

/** Published compatibility spelling maps to the canonical ACES filmic implementation. */
export function toNativeFramegraphToneOperator(operator: FramegraphToneOperator | ToneMappingOperator): ToneMappingOperator {
  return operator === 'aces-filmic' ? 'aces' : operator;
}

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

  get nativeOperator(): ToneMappingOperator {
    return toNativeFramegraphToneOperator(this.operator);
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
    executeNativePass(this, context);
    this.executedFrames += 1;
    this.lastFrame = context.frameIndex;
  }
}
