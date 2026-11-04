/**
 * PRD-03 — C-13 real: the v2 post graph.
 *
 * Phase 2 replaces the Phase-0 "everything withheld" planner with the real
 * stage-descriptor table of PRD-03 §6.1: fixed order, per-stage output format
 * and scale, `enabled(options)` predicates, and C-13 custom-pass insertion
 * with `space` validation (a `display` pass before tonemap throws
 * `POSTPROCESS_SPACE_INVALID:<id>`). Stages this phase does not yet execute
 * are placed in `stages` for order truth and also reported under `skipped`
 * with reason `post-v2-deferred:phase-N`.
 *
 * GPU execution lives in `webgl2/LegacyPost.ts` (`executePostGraphWebGL2`),
 * which drives `post/v2Stages.ts` (`runV2HdrStages` / `runV2LdrTail`) and is
 * reached from `renderer/PostprocessExecution.ts`. C-13 custom passes
 * (`app.addPostPass` → the pass registry, plus `pipeline.customPasses`) run at
 * all five §6.1 anchors there. `PostGraph.execute` is the no-device entry: it
 * validates and returns the plan the executor runs (03-S18c).
 */

import { defineContractSlot, type ContractSlot, type QrFlags } from "../contracts/core";
import {
  registeredPostPasses,
  validatePostPassSpace as contractsValidatePostPassSpace,
  type PostGraphReport,
  type PostInsertAt,
  type PostPassDescriptor,
  type PostPipelineOptions,
  type PostSpace
} from "../contracts/post";
import type { AuraToneMappingOperatorLike } from "../contracts/output";
import { validateNativePostEffect, type NativePostEffect } from "./NativeEffectShaders";

export interface PostGraphFrame {
  readonly width: number;
  readonly height: number;
  /** Explicit renderer identity for app-owned custom pass planning. */
  readonly scopeId?: object;
  /** When provided, every declared custom-pass input must be present. */
  readonly availableInputs?: readonly PostStageInput[];
  /** Validate that a custom pass supplies source for this backend. */
  readonly backend?: "webgl2" | "webgpu";
}

export interface PostGraphLike {
  /** "legacy" while the existing chain serves the frame; "v2" for the real graph. */
  readonly kind: "legacy" | "v2";
  /**
   * The plan the graph would execute for these options — stage names in
   * execution order, formats, and anything withheld (with a named reason).
   * Planning never touches the GPU; it is the conformance-testable surface.
   */
  plan(options: PostPipelineOptions, frame: PostGraphFrame): PostGraphReport;
  /** GPU execution needs a device; this no-device entry fails closed. */
  execute?(options: PostPipelineOptions, frame: PostGraphFrame): PostGraphReport;
}

/* ------------------------------------------------------------------ */
/* Concrete option types for the contract's `unknown` members (CCR-03-3  */
/* pattern: defined here until CONTRACTS narrows the placeholders).      */
/* ------------------------------------------------------------------ */

export interface Rgb { readonly r: number; readonly g: number; readonly b: number }

/** §6.3/§8.4 GTAO options. */
export interface GtaoOptions {
  readonly radius: number;
  readonly intensity: number;
  readonly falloff: number;
  readonly directions: 2 | 4;
  readonly steps: 4 | 6;
  readonly halfRes: boolean;
  readonly temporal: boolean;
  readonly multiBounce: boolean;
  /** §6.3: indirect-fraction fallback weight when `prd03.indirectFraction` is off. */
  readonly fallbackStrength: number;
}

/** §6.6 v2 bloom options. */
export interface BloomOptionsV2 {
  /** Linear HDR threshold, [0, 64]. */
  readonly threshold: number;
  /** Fraction of threshold, [0, 1]. */
  readonly knee: number;
  /** Bloom intensity multiplier, [0, 4]. */
  readonly intensity: number;
  /** Upsample radius 0..1. */
  readonly scatter: number;
  /** Tint on the prefilter output. */
  readonly tint: readonly [number, number, number];
  /** Firefly clamp, default 64. */
  readonly clampLuminance: number;
  /** Mip count, C-27 `bloomMipLevels`: 3 | 5 | 6. */
  readonly mips: 3 | 5 | 6;
  /**
   * Internal execution flag, enabled only after the renderer has produced a
   * capability-checked separate signal attachment. Omitted = ordinary bloom.
   */
  readonly selective?: boolean;
}

export interface TaaOptions {
  readonly feedbackMin: number;
  readonly feedbackMax: number;
  readonly varianceGamma: number;
  /** Spatial resolves at render size then scales; temporal reconstructs directly at output size. */
  readonly reconstruction?: "spatial" | "temporal";
  readonly upscale: boolean;
  readonly sharpness: number;
}

export interface DofOptions {
  readonly focusDistance: number;
  readonly fStop: number;
  readonly focalLengthMm: number;
  readonly sensorHeightMm: number;
  readonly maxBlurPx: number;
  readonly halfRes: boolean;
  /**
   * GU47 E-C: screen-space tilt-shift band (miniature look) instead of the
   * thin-lens CoC. `bandCenter` 0 = top edge .. 1 = bottom edge, `bandWidth`
   * the sharp fraction of the frame height, `angleDeg` rotates the band.
   */
  readonly tiltShift?: { readonly bandCenter: number; readonly bandWidth: number; readonly angleDeg?: number };
}

export interface MotionBlurOptions {
  readonly shutter: number;
  readonly maxBlurPx: number;
  readonly samples: 8 | 12 | 16;
  readonly tileSize: 16 | 20;
}

export interface GodRayOptions {
  readonly samples: 32 | 48 | 64;
  readonly decay: number;
  readonly weight: number;
  readonly color: readonly [number, number, number];
  readonly intensity: number;
  readonly lightWorld?: readonly [number, number, number];
  /** World-space direction TOWARD the strongest directional light (bridge). */
  readonly lightDirection?: readonly [number, number, number];
  /** GU47 E-C: shaft density, the march fraction toward the light in (0, 1] (volumetricFog `godRayDensity`); omitted = 1. */
  readonly density?: number;
  /**
   * GU47 phase 2: shaft medium per metre (volumetricFog `density`): the shaft is scaled by
   * `1 - exp(-medium · viewDepth)`, so it builds with distance. Omitted = unscaled.
   */
  readonly medium?: number;
}

/** §6.7 composite (linear) grade options. */
export interface ColorGradeOptionsV2 {
  readonly temperature: number;
  readonly tint: number;
  readonly contrast: number;
  readonly saturation: number;
  readonly vibrance: number;
  readonly lift: Rgb;
  readonly gamma: Rgb;
  readonly gain: Rgb;
  readonly shadows: Rgb;
  readonly midtones: Rgb;
  readonly highlights: Rgb;
  readonly lutIntensity: number;
}

export interface LutTexture3D {
  readonly size: number;
  /** size³×4, display (sRGB-encoded) domain. */
  readonly data: Float32Array;
}

export interface AutoExposureOptionsV2 {
  readonly minEv: number;
  readonly maxEv: number;
  readonly speedUp: number;
  readonly speedDown: number;
  readonly compensationEv: number;
  readonly meteringMask: "center-weighted" | "average";
}

/* ------------------------------------------------------------------ */
/* Stage descriptors — PRD-03 §6.1 fixed order.                          */
/* ------------------------------------------------------------------ */

export type PostStageInput = "color" | "depth" | "velocity" | "normal" | "reactive";
export type PostTargetFormat = "rgba16f" | "r11g11b10f" | "rgba8" | "r8" | "r32f" | "rg32f" | "rg16f";

export interface PostStageDescriptor {
  /** §6.1 stage id — also the report name. */
  readonly id: string;
  /** Output space: linear-hdr up to the OutputPass boundary, display after. */
  readonly space: PostSpace;
  readonly inputs: readonly PostStageInput[];
  /** Primary output. `scale` is relative to render size; `fixedSize` wins. */
  readonly output: { readonly format: PostTargetFormat; readonly scale: number };
  readonly fixedSize?: readonly [number, number];
  readonly enabled: (options: PostPipelineOptions, frame?: PostGraphFrame) => boolean;
  /** PRD phase that lands the GPU implementation. */
  readonly phase: number;
  /** Extra implemented check beyond `phase` (e.g. per-AA-mode splits). */
  readonly implemented?: (options: PostPipelineOptions) => boolean;
}

/** Depth is linearized when a stage consumes scene depth or camera velocity. */
function depthPrepEnabled(options: PostPipelineOptions, frame?: PostGraphFrame): boolean {
  return Boolean(options.ao || options.ssr || options.godRays || options.dof
    || options.motionBlur || options.antiAliasing === "taa" || options.taa
    || [...(options.customPasses ?? []), ...registeredPostPasses()].some((pass) => pass.postScopeMatches?.(frame?.scopeId) !== false && pass.inputs.includes("depth")));
}

function autoExposureRequested(options: PostPipelineOptions): boolean {
  const value = options.autoExposure as AutoExposureOptionsV2 | false | undefined;
  return Boolean(value) && value !== false;
}

/**
 * §6.1 fixed order. The MSAA resolve (S0) is a blit owned by the forward pass,
 * not a post stage, so it is absent. `OUT` is the C-05 `OutputPass` boundary:
 * the only stage that consumes linear HDR and produces display space.
 */
export const POST_STAGE_DESCRIPTORS: readonly PostStageDescriptor[] = [
  {
    id: "S1-depth-prep", space: "linear-hdr", inputs: ["depth"],
    output: { format: "r32f", scale: 1 },
    enabled: depthPrepEnabled,
    implemented: () => true, phase: 3
  },
  {
    id: "S2-gtao", space: "linear-hdr", inputs: ["depth"],
    output: { format: "r8", scale: 0.5 },
    enabled: (o) => Boolean(o.ao),
    implemented: () => true, phase: 3
  },
  {
    id: "S3-ssr", space: "linear-hdr", inputs: ["color", "depth"],
    output: { format: "rgba16f", scale: 0.5 },
    enabled: (o) => Boolean(o.ssr), phase: 3
  },
  {
    id: "S4-god-rays", space: "linear-hdr", inputs: ["color", "depth"],
    output: { format: "rgba16f", scale: 0.5 },
    enabled: (o) => Boolean(o.godRays),
    implemented: () => true, phase: 3
  },
  {
    id: "S5-taa", space: "linear-hdr", inputs: ["color", "velocity", "depth"],
    output: { format: "rgba16f", scale: 1 },
    enabled: (o) => o.antiAliasing === "taa" || Boolean(o.taa), phase: 4
  },
  {
    id: "S6-dof", space: "linear-hdr", inputs: ["color", "depth"],
    output: { format: "rgba16f", scale: 0.5 },
    enabled: (o) => Boolean(o.dof), phase: 4
  },
  {
    id: "S7-motion-blur", space: "linear-hdr", inputs: ["color", "velocity"],
    output: { format: "rgba16f", scale: 1 },
    enabled: (o) => Boolean(o.motionBlur), phase: 4
  },
  {
    id: "S8-auto-exposure", space: "linear-hdr", inputs: ["color"],
    output: { format: "r32f", scale: 1 }, fixedSize: [1, 1],
    enabled: autoExposureRequested, implemented: () => true, phase: 6
  },
  {
    id: "S9-bloom", space: "linear-hdr", inputs: ["color"],
    output: { format: "rgba16f", scale: 0.5 },
    enabled: (o) => Boolean(o.bloom), phase: 2
  },
  {
    id: "S10-composite", space: "linear-hdr", inputs: ["color"],
    output: { format: "rgba16f", scale: 1 },
    enabled: () => true, phase: 2
  },
  {
    // C-05 boundary: consumes linear HDR, produces display-referred RGBA8.
    id: "OUT-output-pass", space: "display", inputs: ["color"],
    output: { format: "rgba8", scale: 1 },
    enabled: () => true, phase: 2
  },
  {
    id: "S10b-display-grade", space: "display", inputs: ["color"],
    output: { format: "rgba8", scale: 1 },
    enabled: (o) => Boolean(o.grade || o.lut || o.vignette), phase: 2
  },
  {
    id: "S11-post-aa", space: "display", inputs: ["color"],
    output: { format: "rgba8", scale: 1 },
    enabled: (o) => o.antiAliasing === "fxaa" || o.antiAliasing === "smaa",
    implemented: (o) => o.antiAliasing === "fxaa" || o.antiAliasing === "smaa",
    phase: 6
  },
  {
    // Writes the default framebuffer: grain, RCAS, triangular dither.
    id: "S12-finalize", space: "display", inputs: ["color"],
    output: { format: "rgba8", scale: 1 },
    enabled: () => true, phase: 2
  }
];

/* ------------------------------------------------------------------ */
/* C-13 custom-pass insertion.                                           */
/* ------------------------------------------------------------------ */

/** insertAt anchor → §6.1 stage the pass binds after/before. */
export const POST_INSERT_ANCHORS: Record<PostInsertAt, { readonly after?: string; readonly before?: string; readonly space: PostSpace }> = {
  "after-depth": { after: "S1-depth-prep", space: "linear-hdr" },
  "before-taa": { before: "S5-taa", space: "linear-hdr" },
  "after-taa": { after: "S5-taa", space: "linear-hdr" },
  "before-tonemap": { before: "OUT-output-pass", space: "linear-hdr" },
  "after-tonemap": { after: "S10b-display-grade", space: "display" }
};

/** A view and effect keep their own pair of history targets on each device. */
export interface PostHistoryFrame {
  readonly scopeId: object;
  readonly viewId: string | number;
  readonly effectIndex: number;
  readonly frameId: number;
  readonly width: number;
  readonly height: number;
  /** Change when a device/context is replaced, even if the scope is reused. */
  readonly deviceGeneration?: unknown;
  /** Encoded primaries for display-space history; omitted for other histories. */
  readonly displayColorSpace?: "srgb" | "display-p3";
  readonly cameraCut?: boolean;
}

export interface PostHistoryLease<T> {
  /** Null until a prior authored frame committed a result. */
  readonly read: T | null;
  /** Exclusive output target; never aliases `read`. */
  readonly write: T;
  /** Mark the write complete. Duplicate commits in one frame are harmless. */
  commit(): void;
  /** Discard a failed write, including one that followed a same-frame commit. */
  abort(): void;
}

interface PostHistoryEntry<T> {
  readonly width: number;
  readonly height: number;
  readonly deviceGeneration: unknown;
  readonly displayColorSpace: PostHistoryFrame["displayColorSpace"];
  readonly release: (target: T) => void;
  read: T;
  write: T;
  valid: boolean;
  frameId: number;
  committed: boolean;
  cutFrame: number | null;
}

interface PostHistoryRetiredTarget<T> {
  readonly scopeId: object;
  readonly viewId: string | number;
  readonly target: T;
  readonly release: (target: T) => void;
}

/**
 * Owns the two targets of each temporal post effect. A completed output is
 * promoted only when the next authored frame begins: repeated passes in the
 * same frame therefore keep sampling the same prior-frame image. The caller
 * must call `resetView` when a view is removed and `dispose` with its device.
 * Failed target releases remain owned for a later matching reset or disposal.
 */
export class PostViewHistory<T> {
  private readonly scopes = new Map<object, Map<string | number, Map<number, PostHistoryEntry<T>>>>();
  private readonly retired = new Set<PostHistoryRetiredTarget<T>>();
  private cleanup: { readonly attempted: Set<PostHistoryRetiredTarget<T>>; readonly errors: unknown[] } | undefined;
  private disposed = false;

  begin(frame: PostHistoryFrame, allocate: (width: number, height: number) => T, release: (target: T) => void): PostHistoryLease<T> {
    if (this.disposed) throw new Error("POST_HISTORY_DISPOSED");
    if (!frame.scopeId || typeof frame.scopeId !== "object") throw new Error("POST_HISTORY_SCOPE_INVALID");
    if ((typeof frame.viewId !== "string" && typeof frame.viewId !== "number")
      || (typeof frame.viewId === "number" && !Number.isFinite(frame.viewId))) throw new Error("POST_HISTORY_VIEW_INVALID");
    if (!Number.isSafeInteger(frame.effectIndex) || frame.effectIndex < 0
      || !Number.isSafeInteger(frame.frameId) || frame.frameId < 0
      || !Number.isSafeInteger(frame.width) || frame.width <= 0
      || !Number.isSafeInteger(frame.height) || frame.height <= 0) throw new Error("POST_HISTORY_FRAME_INVALID");
    if (frame.displayColorSpace !== undefined && frame.displayColorSpace !== "srgb" && frame.displayColorSpace !== "display-p3") {
      throw new Error("POST_HISTORY_COLOR_SPACE_INVALID");
    }

    let views = this.scopes.get(frame.scopeId);
    if (!views) { views = new Map(); this.scopes.set(frame.scopeId, views); }
    let effects = views.get(frame.viewId);
    if (!effects) { effects = new Map(); views.set(frame.viewId, effects); }
    let entry = effects.get(frame.effectIndex);
    const assertVacant = (): void => {
      if (this.disposed) throw new Error("POST_HISTORY_DISPOSED");
      if (this.scopes.get(frame.scopeId) !== views || views!.get(frame.viewId) !== effects || effects!.has(frame.effectIndex)) {
        throw new Error("POST_HISTORY_STALE_LEASE");
      }
    };
    if (entry && frame.frameId < entry.frameId) throw new Error("POST_HISTORY_FRAME_OUT_OF_ORDER");
    if (entry && frame.frameId === entry.frameId && (entry.width !== frame.width || entry.height !== frame.height
      || !Object.is(entry.deviceGeneration, frame.deviceGeneration)
      || entry.displayColorSpace !== frame.displayColorSpace
      || (entry.cutFrame === frame.frameId) !== (frame.cameraCut === true))) {
      throw new Error("POST_HISTORY_FRAME_CONFLICT");
    }
    const invalidate = entry && (entry.width !== frame.width || entry.height !== frame.height
      || !Object.is(entry.deviceGeneration, frame.deviceGeneration)
      || entry.displayColorSpace !== frame.displayColorSpace
      || (frame.cameraCut === true && entry.cutFrame !== frame.frameId));
    if (entry && invalidate) {
      effects.delete(frame.effectIndex);
      this.releaseTargets(this.retireEntries(frame.scopeId, frame.viewId, [entry]));
      entry = undefined;
      // Release callbacks may reset the view, dispose the owner, or begin a
      // replacement in this slot. Never resurrect or overwrite that work.
      assertVacant();
    }

    if (!entry) {
      const allocated: T[] = [];
      let read: T;
      let write: T;
      try {
        read = allocate(frame.width, frame.height);
        allocated.push(read);
        assertVacant();
        write = allocate(frame.width, frame.height);
        if (!Object.is(read, write)) allocated.push(write);
        assertVacant();
        if (Object.is(read, write)) throw new Error("POST_HISTORY_TARGET_ALIAS");
      } catch (error) {
        const targets = allocated.map(target => this.retireTarget(frame.scopeId, frame.viewId, target, release));
        try { this.releaseTargets(targets); } catch { /* Keep failed targets, but preserve the original error. */ }
        throw error;
      }
      entry = {
        width: frame.width, height: frame.height, deviceGeneration: frame.deviceGeneration, displayColorSpace: frame.displayColorSpace,
        release, read, write, valid: false, frameId: frame.frameId, committed: false,
        cutFrame: frame.cameraCut ? frame.frameId : null
      };
      effects.set(frame.effectIndex, entry);
    } else if (entry.frameId !== frame.frameId) {
      if (entry.committed) {
        [entry.read, entry.write] = [entry.write, entry.read];
        entry.valid = true;
      } else {
        // A failed or abandoned write cannot stand in for the immediately
        // preceding frame; reusing older history would resurrect stale pixels.
        entry.valid = false;
      }
      entry.frameId = frame.frameId;
      entry.committed = false;
    }

    const current = entry;
    const assertCurrent = (): void => {
      if (this.disposed || effects!.get(frame.effectIndex) !== current || current.frameId !== frame.frameId) {
        throw new Error("POST_HISTORY_STALE_LEASE");
      }
    };
    return {
      read: current.valid ? current.read : null,
      write: current.write,
      commit: () => {
        assertCurrent();
        current.committed = true;
      },
      abort: () => {
        assertCurrent();
        current.committed = false;
      }
    };
  }

  resetView(scopeId: object, viewId: string | number): void {
    const views = this.scopes.get(scopeId);
    const effects = views?.get(viewId);
    if (views && effects) {
      views.delete(viewId);
      if (views.size === 0) this.scopes.delete(scopeId);
      this.retireEntries(scopeId, viewId, effects.values());
      effects.clear();
    }
    this.releaseTargets([...this.retired].filter(target => target.scopeId === scopeId && target.viewId === viewId));
  }

  /** Retire every view owned by one renderer without affecting other scopes. */
  resetScope(scopeId: object): void {
    const views = this.scopes.get(scopeId);
    if (views) {
      this.scopes.delete(scopeId);
      for (const [viewId, effects] of views) {
        this.retireEntries(scopeId, viewId, effects.values());
        effects.clear();
      }
      views.clear();
    }
    this.releaseTargets([...this.retired].filter(target => target.scopeId === scopeId));
  }

  dispose(): void {
    if (!this.disposed) {
      this.disposed = true;
      for (const [scopeId, views] of this.scopes) {
        for (const [viewId, effects] of views) {
          this.retireEntries(scopeId, viewId, effects.values());
          effects.clear();
        }
        views.clear();
      }
      this.scopes.clear();
    }
    this.releaseTargets([...this.retired]);
  }

  private retireTarget(scopeId: object, viewId: string | number, target: T, release: (target: T) => void): PostHistoryRetiredTarget<T> {
    const retired = { scopeId, viewId, target, release };
    this.retired.add(retired);
    return retired;
  }

  private retireEntries(scopeId: object, viewId: string | number, entries: Iterable<PostHistoryEntry<T>>): PostHistoryRetiredTarget<T>[] {
    const retired: PostHistoryRetiredTarget<T>[] = [];
    for (const entry of entries) for (const target of [entry.read, entry.write]) {
      retired.push(this.retireTarget(scopeId, viewId, target, entry.release));
    }
    return retired;
  }

  private releaseTargets(targets: Iterable<PostHistoryRetiredTarget<T>>): void {
    // Reentrant resets/disposals share one attempt set: an in-flight or failed
    // target is not retried until the outermost cleanup call has returned.
    const outermost = !this.cleanup;
    const cleanup = this.cleanup ?? { attempted: new Set<PostHistoryRetiredTarget<T>>(), errors: [] as unknown[] };
    this.cleanup = cleanup;
    const errorOffset = cleanup.errors.length;
    try {
      for (const target of targets) {
        if (!this.retired.has(target) || cleanup.attempted.has(target)) continue;
        cleanup.attempted.add(target);
        try {
          target.release(target.target);
          this.retired.delete(target);
        } catch (error) {
          cleanup.errors.push(error);
        }
      }
    } finally {
      if (outermost) this.cleanup = undefined;
    }
    if (cleanup.errors.length > errorOffset) {
      throw new AggregateError(cleanup.errors.slice(errorOffset), "Post history target disposal failed");
    }
  }
}

/** C-13 rule: `space` must be "linear-hdr" unless insertAt === "after-tonemap". */
export function validatePostPassSpace(pass: Pick<PostPassDescriptor, "id" | "insertAt" | "space">): void {
  contractsValidatePostPassSpace(pass);
}

function stageSize(descriptor: PostStageDescriptor, frame: PostGraphFrame): { width: number; height: number } {
  if (descriptor.fixedSize) return { width: descriptor.fixedSize[0], height: descriptor.fixedSize[1] };
  return {
    width: Math.max(1, Math.round(frame.width * descriptor.output.scale)),
    height: Math.max(1, Math.round(frame.height * descriptor.output.scale))
  };
}

interface PlannedEntry {
  readonly name: string;
  readonly format: string;
  readonly width: number;
  readonly height: number;
  readonly anchor: string;
  readonly after: boolean;
  readonly custom: boolean;
  readonly deferredReason: string | null;
  readonly rank: number;
  readonly order: number;
}

/**
 * Plans the v2 chain: every enabled §6.1 stage plus C-13 custom passes at
 * their insertion anchors, in execution order. Entries that are enabled but
 * not yet implemented (or a deferred custom pass) also land in `skipped`
 * with reason `post-v2-deferred:phase-N` — never silently dropped.
 */
export function planPostGraph(options: PostPipelineOptions, frame: PostGraphFrame): PostGraphReport {
  if (!Number.isSafeInteger(frame.width) || frame.width <= 0 || !Number.isSafeInteger(frame.height) || frame.height <= 0) {
    throw new Error("POSTPROCESS_FRAME_SIZE_INVALID");
  }
  const entries: PlannedEntry[] = [];
  const tableIndex = new Map(POST_STAGE_DESCRIPTORS.map((descriptor, index) => [descriptor.id, index]));
  for (const [index, descriptor] of POST_STAGE_DESCRIPTORS.entries()) {
    if (!descriptor.enabled(options, frame)) continue;
    const size = stageSize(descriptor, frame);
    const implemented = descriptor.implemented ? descriptor.implemented(options) : descriptor.phase <= 2;
    entries.push({
      name: descriptor.id,
      format: descriptor.output.format,
      width: size.width,
      height: size.height,
      anchor: descriptor.id,
      after: false,
      custom: false,
      deferredReason: implemented ? null : `post-v2-deferred:phase-${descriptor.phase}`,
      rank: index * 2,
      order: 0
    });
  }

  const customPasses = [...(options.customPasses ?? []), ...registeredPostPasses()];
  const seen = new Set<string>();
  for (const pass of customPasses) {
    if (pass.postScopeMatches?.(frame.scopeId) === false) continue;
    // The executor keeps the first descriptor when a pipeline bag and the
    // app registry both name the same pass.
    if (seen.has(pass.id)) continue;
    seen.add(pass.id);
    validatePostPassSpace(pass);
    if (pass.gpuOnly !== true) throw new Error(`POSTPROCESS_PASS_NOT_GPU:${pass.id}`);
    if (frame.backend === "webgpu" && !pass.fragment.wgsl?.trim()) throw new Error(`POSTPROCESS_SHADER_UNAVAILABLE:${pass.id}:webgpu`);
    if (frame.backend === "webgl2" && !pass.fragment.glsl.trim()) throw new Error(`POSTPROCESS_SHADER_UNAVAILABLE:${pass.id}:webgl2`);
    if (frame.availableInputs) {
      for (const input of pass.inputs) {
        if (!frame.availableInputs.includes(input)) throw new Error(`POSTPROCESS_INPUT_UNAVAILABLE:${pass.id}:${input}`);
      }
    }
    const anchor = POST_INSERT_ANCHORS[pass.insertAt];
    const anchorName = anchor.before ?? anchor.after ?? "S10-composite";
    entries.push({
      name: pass.id,
      format: pass.space === "display" ? "rgba8" : "rgba16f",
      width: frame.width,
      height: frame.height,
      anchor: anchorName,
      after: anchor.after !== undefined,
      custom: true,
      deferredReason: null, // C-13 execution landed in Phase 6
      rank: tableIndex.get(anchorName)! * 2 + (anchor.after ? 1 : -1),
      order: typeof pass.order === "number" && Number.isFinite(pass.order) ? pass.order : Number.MAX_SAFE_INTEGER
    });
  }

  // Native effects are an ordered display-space chain after all
  // after-tonemap custom passes and before post-AA. A mask affects subsequent
  // effects until the matching clear-mask, as in the executing tail.
  const nativeEffects = (options as PostPipelineOptions & { readonly nativeEffects?: readonly NativePostEffect[] }).nativeEffects ?? [];
  for (const [index, effect] of nativeEffects.entries()) {
    validateNativePostEffect(effect);
    entries.push({
      name: `native-${index}-${effect.kind}`, format: "rgba8", width: frame.width, height: frame.height,
      anchor: "S11-post-aa", after: false, custom: false, deferredReason: null,
      rank: tableIndex.get("S11-post-aa")! * 2 - 0.5, order: index
    });
  }

  // Stable sort preserves registration order for equal/absent order keys.
  entries.sort((a, b) => a.rank - b.rank || a.order - b.order);

  const stages = entries.map((entry) => ({ name: entry.name, format: entry.format, width: entry.width, height: entry.height }));
  const skipped = entries
    .filter((entry) => entry.deferredReason !== null)
    .map((entry) => ({ name: entry.name, reason: entry.deferredReason as string }));
  return { stages, skipped };
}

/** Skip reason for registered custom passes while the legacy chain serves the frame. */
export const POST_LEGACY_CHAIN_REASON = "legacy-chain:A3D_QR_POST-off";

/**
 * C-13 slot default: the legacy chain's view of the graph. With `A3D_QR_POST`
 * off no v2 stage runs, so any registered custom pass is reported as skipped
 * by the legacy chain (never silently dropped).
 */
export class LegacyPostGraph implements PostGraphLike {
  readonly kind = "legacy" as const;
  plan(_options: PostPipelineOptions, frame: PostGraphFrame): PostGraphReport {
    return {
      stages: [],
      skipped: registeredPostPasses().filter(pass => pass.postScopeMatches?.(frame.scopeId) !== false)
        .map((pass) => ({ name: pass.id, reason: POST_LEGACY_CHAIN_REASON }))
    };
  }
}

/** C-13 real: plans the §6.1 chain; GPU work is dispatched by the executor. */
export class PostGraph implements PostGraphLike {
  readonly kind = "v2" as const;
  plan(options: PostPipelineOptions, frame: PostGraphFrame): PostGraphReport {
    return planPostGraph(options, frame);
  }
  /**
   * No-device entry (03-S18c): validates every custom pass (a display pass
   * before tonemap throws `POSTPROCESS_SPACE_INVALID:<id>`) and returns the
   * plan, in execution order, that `runV2HdrStages`/`runV2LdrTail` execute.
   */
  execute(options: PostPipelineOptions, frame: PostGraphFrame): PostGraphReport {
    return planPostGraph(options, frame);
  }
}

/**
 * The C-13 slot (contract id `C-13`, flag `A3D_QR_POST`). PR 0's frozen surface
 * declares no slot in `contracts/post.ts`, so lane 03 defines it here and
 * provides it from `lanes/prd03.ts`; `get(flags)` returns the real PostGraph
 * only once provided AND the flag is on — the legacy stub otherwise.
 */
export const postPipelineSlot: ContractSlot<PostGraphLike> = defineContractSlot<PostGraphLike>(
  "C-13",
  "prd03",
  "A3D_QR_POST",
  new LegacyPostGraph()
);

/** Resolved graph for these flags; call at mount/compile time, never per draw. */
export function resolvePostGraph(flags: QrFlags): PostGraphLike {
  return postPipelineSlot.get(flags);
}

/** Operator passthrough used by plan-time validation only. */
export type { AuraToneMappingOperatorLike };
