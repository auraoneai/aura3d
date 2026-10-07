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
 * GPU execution lives in `webgl2/LegacyPost.ts` (`executePostGraphWebGL2`) and
 * is reached from `renderer/PostprocessExecution.ts`; `PostGraph.execute`
 * remains a no-device entry and still fails closed.
 */

import { defineContractSlot, type QrFlags } from "../contracts/core";
import {
  registeredPostPasses,
  type PostGraphReport,
  type PostInsertAt,
  type PostPassDescriptor,
  type PostPipelineOptions,
  type PostSpace
} from "../contracts/post";
import type { AuraToneMappingOperatorLike } from "../contracts/output";

export interface PostGraphFrame {
  readonly width: number;
  readonly height: number;
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
}

export interface TaaOptions {
  readonly feedbackMin: number;
  readonly feedbackMax: number;
  readonly varianceGamma: number;
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
  readonly enabled: (options: PostPipelineOptions) => boolean;
  /** PRD phase that lands the GPU implementation. */
  readonly phase: number;
  /** Extra implemented check beyond `phase` (e.g. per-AA-mode splits). */
  readonly implemented?: (options: PostPipelineOptions) => boolean;
}

/** Depth is linearized when a stage consumes scene depth or camera velocity. */
function depthPrepEnabled(options: PostPipelineOptions): boolean {
  return Boolean(options.ao || options.ssr || options.godRays || options.dof
    || options.motionBlur || options.antiAliasing === "taa" || options.taa);
}

function autoExposureRequested(options: PostPipelineOptions): boolean {
  const value = (options as { readonly autoExposure?: unknown }).autoExposure;
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
    enabled: autoExposureRequested, phase: 6
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
    implemented: (o) => o.antiAliasing === "fxaa", // SMAA lands in Phase 6
    phase: 2
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

/** C-13 rule: `space` must be "linear-hdr" unless insertAt === "after-tonemap". */
export function validatePostPassSpace(pass: Pick<PostPassDescriptor, "id" | "insertAt" | "space">): void {
  const anchor = POST_INSERT_ANCHORS[pass.insertAt];
  if (anchor && pass.space !== anchor.space) {
    throw new Error(`POSTPROCESS_SPACE_INVALID:${pass.id}`);
  }
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
}

/**
 * Plans the v2 chain: every enabled §6.1 stage plus C-13 custom passes at
 * their insertion anchors, in execution order. Entries that are enabled but
 * not yet implemented (or a deferred custom pass) also land in `skipped`
 * with reason `post-v2-deferred:phase-N` — never silently dropped.
 */
export function planPostGraph(options: PostPipelineOptions, frame: PostGraphFrame): PostGraphReport {
  const entries: PlannedEntry[] = [];
  for (const descriptor of POST_STAGE_DESCRIPTORS) {
    if (!descriptor.enabled(options)) continue;
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
      deferredReason: implemented ? null : `post-v2-deferred:phase-${descriptor.phase}`
    });
  }

  const customPasses = [...(options.customPasses ?? []), ...registeredPostPasses()];
  for (const pass of customPasses) {
    validatePostPassSpace(pass);
    const anchor = POST_INSERT_ANCHORS[pass.insertAt];
    entries.push({
      name: pass.id,
      format: pass.space === "display" ? "rgba8" : "rgba16f",
      width: frame.width,
      height: frame.height,
      anchor: anchor.before ?? anchor.after ?? "S10-composite",
      after: anchor.after !== undefined,
      custom: true,
      deferredReason: "post-v2-deferred:phase-6"
    });
  }

  // Resolve order: table order first; customs splice around their anchor.
  const tableIndex = new Map(POST_STAGE_DESCRIPTORS.map((d, i) => [d.id, i]));
  entries.sort((a, b) => {
    const ai = tableIndex.get(a.name) ?? tableIndex.get(a.anchor)! + (a.after ? 0.5 : -0.5);
    const bi = tableIndex.get(b.name) ?? tableIndex.get(b.anchor)! + (b.after ? 0.5 : -0.5);
    if (ai !== bi) return ai - bi;
    // Stable secondary: customs after their anchor keep registration order.
    return 0;
  });

  const stages = entries.map((entry) => ({ name: entry.name, format: entry.format, width: entry.width, height: entry.height }));
  const skipped = entries
    .filter((entry) => entry.deferredReason !== null)
    .map((entry) => ({ name: entry.name, reason: entry.deferredReason as string }));
  return { stages, skipped };
}

/** C-13 stub: the legacy chain's view of the graph (nothing v2 executes). */
export class LegacyPostGraphStub implements PostGraphLike {
  readonly kind = "legacy" as const;
  plan(_options: PostPipelineOptions, _frame: PostGraphFrame): PostGraphReport {
    return {
      stages: [],
      skipped: registeredPostPasses().map((pass) => ({ name: pass.id, reason: "post-graph-v2-pending" }))
    };
  }
}

/** C-13 real: plans the §6.1 chain; GPU work is dispatched by the executor. */
export class PostGraph implements PostGraphLike {
  readonly kind = "v2" as const;
  plan(options: PostPipelineOptions, frame: PostGraphFrame): PostGraphReport {
    return planPostGraph(options, frame);
  }
  execute(_options: PostPipelineOptions, _frame: PostGraphFrame): PostGraphReport {
    throw new Error("POST_GRAPH_V2_PENDING");
  }
}

/**
 * The C-13 slot (contract id `C-13`, flag `A3D_QR_POST`). PR 0's frozen surface
 * declares no slot in `contracts/post.ts`, so lane 03 defines it here and
 * provides it from `lanes/prd03.ts`; `get(flags)` returns the real PostGraph
 * only once provided AND the flag is on — the legacy stub otherwise.
 */
export const postPipelineSlot = defineContractSlot<PostGraphLike>(
  "C-13",
  "prd03",
  "A3D_QR_POST",
  new LegacyPostGraphStub()
);

/** Resolved graph for these flags; call at mount/compile time, never per draw. */
export function resolvePostGraph(flags: QrFlags): PostGraphLike {
  return postPipelineSlot.get(flags);
}

/** Operator passthrough used by plan-time validation only. */
export type { AuraToneMappingOperatorLike };
