/**
 * PRD-03 — C-13 engine bridge: submitted postprocess telemetry, the C-31
 * `post`/`exposure` diagnostics sections, and the `AuraPostSurface` extension.
 * One module because it is the lane-owned seam between the compiler bridge and
 * the app surface.
 *
 * Diagnostics truthfulness (C-31): `compiler/postprocess.ts` records the exact
 * `RendererPostProcessOptions` it hands the renderer on every mount. The
 * sections read this store instead of `app.diagnostics()` — sections run
 * *inside* `diagnostics()`, so calling back into it would recurse. Anything
 * not measurable engine-side is `null`, never guessed. Recording never alters
 * the submitted options and runs identically flag-off: the `post` section must
 * report what the legacy chain executes today.
 */

import {
  createRendererPostprocessPlanDiagnostics,
  postVelocityCoverage,
  volumetricLightDirection,
  type CollectedLight,
  type RendererPostProcessOptions
} from "@aura3d/rendering";
import {
  registerPostPass,
  registeredPostPasses,
  type PostInsertAt,
  type PostPassDescriptor,
  type PostPipelineOptions,
  type PostSpace,
  type AuraQualityTier,
  type AuraQualityTierSettings,
  type QrFlags
} from "@aura3d/rendering/contracts";
import type { BloomOptionsV2, PostTierResolution } from "@aura3d/rendering";
import type { AuraCustomPostPass, AuraPostSurface } from "../contracts/post.js";
import type { AuraOutputOptions } from "../contracts/output.js";
import { AuraRuntimeError, groups, type AuraApp, type AuraCreateAppOptions, type AuraEffectNode, type AuraSceneSnapshot } from "./index.js";
import { expandPostPreset, presetCapabilityDegraded } from "./postPresets.js";

/* ------------------------------------------------------------------------- */
/* Submitted postprocess telemetry                                           */
/* ------------------------------------------------------------------------- */

export interface AuthoredPostSummary {
  readonly bloom: boolean;
  readonly ambientOcclusion: boolean;
  readonly contactOcclusion: boolean;
  readonly colorGrade: boolean;
  readonly antiAlias: boolean;
  readonly outline: boolean;
  readonly ssr: boolean;
  readonly depthOfField: boolean;
  readonly motionBlur: boolean;
  readonly volumetricFog: boolean;
  readonly colorGradeExposure: number | null;
  readonly antiAliasMode: string | null;
  /** Phase 1 (flag-on): the C-27 tier AA resolution that produced the submit. */
  readonly resolvedAntiAlias?: { readonly mode: string; readonly sampleCount: number; readonly reason?: string } | null;
  /** Phase 1 (flag-on): the camera clipping forwarded to the legacy chain (CCR-03-1). */
  readonly depthRange?: { readonly near: number; readonly far: number; readonly projection: string } | null;
  /** Phase 2 (§7.1): field-validation diagnostics — deprecated + unsupported + informational. */
  readonly fieldDiagnostics?: readonly PostFieldDiagnostic[];
  /** Phase 2 (C-13): the assembled v2 pipeline options, when strict+flag-on. */
  readonly v2?: boolean;
}

export interface SubmittedPostprocessRecord {
  readonly sequence: number;
  readonly atMs: number;
  readonly renderWidth: number;
  readonly renderHeight: number;
  readonly temporalRequested: boolean;
  readonly options: RendererPostProcessOptions;
  readonly authored: AuthoredPostSummary;
}

/** Mirrors `postProductionBuild` in the renderer (§6.9 prod-skip rule). */
function postProductionBuildBridge(): boolean {
  const meta = import.meta as unknown as { readonly env?: { readonly PROD?: boolean } };
  if (meta.env?.PROD) return true;
  return (globalThis as { readonly process?: { readonly env?: { readonly NODE_ENV?: string } } })
    .process?.env?.NODE_ENV === "production";
}

let latest: SubmittedPostprocessRecord | null = null;

/**
 * Per-app binding (review P2): a module-global record is overwritten by
 * whichever app compiles most recently, and the compile runs inside the
 * app's async mount — after `ext.create` — so factory-time binding cannot
 * attribute it. The compile's canvas is the one handle that reaches both
 * sides: `createProductionRuntimePostprocess` records it, and
 * `collectPostSection(app)`/`collectExposureSection(app)` resolve the record
 * through `app.canvas`. Headless apps (no canvas) keep reading `latest`.
 */
const canvasRecords = new WeakMap<HTMLCanvasElement, SubmittedPostprocessRecord>();
let sequence = 0;

export function recordSubmittedPostprocess(
  options: RendererPostProcessOptions,
  context: {
    readonly renderWidth: number;
    readonly renderHeight: number;
    readonly temporalRequested: boolean;
    readonly authored: AuthoredPostSummary;
    readonly canvas?: HTMLCanvasElement;
  }
): void {
  sequence += 1;
  latest = {
    sequence,
    atMs: Date.now(),
    renderWidth: context.renderWidth,
    renderHeight: context.renderHeight,
    temporalRequested: context.temporalRequested,
    options,
    authored: context.authored
  };
  if (context.canvas) canvasRecords.set(context.canvas, latest);
}

export function latestSubmittedPostprocess(): SubmittedPostprocessRecord | null {
  return latest;
}

/** Test hook: clears the store between specs. */
export function resetSubmittedPostprocess(): void {
  latest = null;
  sequence = 0;
}

/* ------------------------------------------------------------------------- */
/* Authored post context (C-38 `options.output` + `post.setQualityTier`)       */
/* ------------------------------------------------------------------------- */

/**
 * The compiler runs outside `createAuraApp`'s options scope, so the C-38
 * `output` options and the requested quality tier are recorded here at app
 * creation / `post.setQualityTier` call time. The compiler reads this store
 * to wire PRD-03 Phase-1 behaviour (exposure product, operator, tier AA,
 * real depth range) — flag-gated by `flags.post` recorded alongside.
 */
export interface AuthoredPostContext {
  readonly flags: { readonly post: boolean };
  readonly output: AuraOutputOptions | undefined;
  readonly qualityTier: AuraQualityTier | "auto" | null;
  /** `compat.post === "3.0"` forces `pipeline: "legacy"` on the v2 bridge (§7.1). */
  readonly compatPost3: boolean;
}

interface MutableAuthoredPostContext {
  flags: { readonly post: boolean };
  output: AuraOutputOptions | undefined;
  qualityTier: AuraQualityTier | "auto" | null;
  compatPost3: boolean;
}

let authoredContext: MutableAuthoredPostContext | null = null;

/**
 * Per-app authored context — same async-mount scoping fix as `canvasRecords`
 * (review P2): two apps created back-to-back both run `ext.create` before
 * either async mount compiles, so a global context would hand the SECOND
 * app's flags/options to the first app's compile. Keyed by `app.canvas`.
 */
const canvasAuthored = new WeakMap<HTMLCanvasElement, MutableAuthoredPostContext>();

/** Called by the `prd03.post` app extension once per `createAuraApp`. */
export function recordAuthoredPostContext(ctx: { readonly flags: QrFlags; readonly options: unknown }, app?: AuraApp): void {
  const options = (ctx.options ?? {}) as AuraCreateAppOptions;
  authoredContext = {
    flags: { post: ctx.flags.on("A3D_QR_POST") },
    output: options.output ?? options.renderer?.output,
    qualityTier: authoredContext?.qualityTier ?? null,
    compatPost3: options.compat?.post === "3.0"
  };
  if (app?.canvas) canvasAuthored.set(app.canvas, authoredContext);
}

export function latestAuthoredPostContext(): AuthoredPostContext | null {
  return authoredContext;
}

/** The context for the app that owns `canvas` — falls back to `latest`. */
export function authoredPostContextFor(canvas?: HTMLCanvasElement): AuthoredPostContext | null {
  return (canvas ? canvasAuthored.get(canvas) : undefined) ?? authoredContext;
}

function recordPostQualityTier(tier: AuraQualityTier | "auto", canvas?: HTMLCanvasElement): void {
  const target = (canvas ? canvasAuthored.get(canvas) : undefined) ?? authoredContext;
  if (target) {
    target.qualityTier = tier;
  } else {
    authoredContext = { flags: { post: false }, output: undefined, qualityTier: tier, compatPost3: false };
    if (canvas) canvasAuthored.set(canvas, authoredContext);
  }
}

/** Test hook: clears the authored context between specs. */
export function resetAuthoredPostContext(): void {
  authoredContext = null;
}

/* ------------------------------------------------------------------------- */
/* C-31 sections                                                             */
/* ------------------------------------------------------------------------- */

export interface PostSectionReport {
  readonly pipeline: "legacy" | "v2";
  readonly present: boolean;
  readonly requestedPasses: readonly string[];
  readonly submittedPasses: readonly string[];
  readonly pixelBackedPasses: readonly string[];
  readonly droppedPasses: readonly string[];
  readonly missingInputs: readonly string[];
  readonly executionMode: string | null;
  readonly readbackPasses: readonly string[];
  readonly fusedLdr: boolean;
  readonly targetFormat: string | null;
  readonly temporalRequested: boolean;
  /** Phase 1 (flag-on): the tier-AA resolution that produced the submit, with its reason. */
  readonly antiAlias: { readonly mode: string; readonly sampleCount: number; readonly reason?: string; readonly tier: string } | null;
  /** Phase 4 (C-14): items tracked by the velocity binder and how many carry
   * previous-frame data. `moving/movingWithHistory` drive the TAA coverage
   * gate; `items/withVelocity` is the §7.2 contract shape. `null` pre-frame. */
  readonly velocityCoverage: { readonly items: number; readonly withVelocity: number; readonly moving: number; readonly movingWithHistory: number } | null;
  /** Things the submit intentionally did not run (PRD §7.2 reasons + dropped passes). */
  readonly skipped: readonly string[];
  readonly customPasses: readonly { readonly id: string; readonly status: string }[];
  readonly warnings: readonly string[];
  readonly source: "agent-api/postBridge.ts + RendererPostprocessPlanDiagnostics";
}

export interface ExposureSectionReport {
  readonly present: boolean;
  /** The multiplier the tone-mapping pass received (uniform sent). `null` when no post chain ran. */
  readonly applied: number | null;
  readonly operator: string | null;
  readonly whitePoint: number | null;
  readonly inputColorSpace: string | null;
  readonly outputColorSpace: string | null;
  /** Authored-but-unconsumed values, reported so the drop is visible (not silent). */
  readonly authoredGradeExposure: number | null;
  readonly outputExposureAuthored: number | null;
  readonly source: "agent-api/postBridge.ts";
}

/** Depth-consuming legacy passes — mirrors `postprocessRequiresDepthTexture`. */
function submittedNeedsDepthTexture(options: RendererPostProcessOptions): boolean {
  return Boolean(
    (options.volumetricLight && !options.volumetricLight.depth) ||
    (options.depthOfField && !options.depthOfField.depth) ||
    (options.contactShadow && !options.contactShadow.depth) ||
    (options.ssao && !options.ssao.depth) ||
    (options.ssr && !options.ssr.depth)
  );
}

function planForSubmitted(options: RendererPostProcessOptions, width: number, height: number) {
  const targetFormat = options.targetFormat ?? "rgba8";
  return createRendererPostprocessPlanDiagnostics(options, {
    sourceTargetFormat: targetFormat,
    targetFormat,
    // The production WebGL2 device implements presentLdrPostprocess; a mounted
    // forward target carries a depth texture exactly when the submitted chain
    // consumes depth.
    nativeLdrPostprocess: true,
    rendererDepthAvailable: submittedNeedsDepthTexture(options),
    width,
    height
  });
}

export function collectPostSection(app: AuraApp): PostSectionReport {
  const submitted = (app.canvas ? canvasRecords.get(app.canvas) : undefined) ?? latestSubmittedPostprocess();
  const authoredContext = authoredPostContextFor(app.canvas ?? undefined);
  const custom = registeredPostPasses().map((pass) => ({ id: pass.id, status: "post-graph-v2-pending" }));
  const empty = {
    present: false,
    requestedPasses: [],
    submittedPasses: [],
    pixelBackedPasses: [],
    droppedPasses: [],
    missingInputs: [],
    executionMode: null,
    readbackPasses: [] as readonly string[],
    fusedLdr: false,
    targetFormat: null,
    temporalRequested: false,
    velocityCoverage: null,
    skipped: [] as readonly string[],
    warnings: [] as readonly string[]
  };
  const antiAlias = submitted?.authored.resolvedAntiAlias
    ? {
      ...submitted.authored.resolvedAntiAlias,
      tier: authoredContext?.qualityTier ?? "high"
    }
    : null;
  if (!submitted) {
    return {
      pipeline: "legacy",
      ...empty,
      antiAlias: null,
      customPasses: custom,
      source: "agent-api/postBridge.ts + RendererPostprocessPlanDiagnostics"
    };
  }
  const plan = planForSubmitted(submitted.options, submitted.renderWidth, submitted.renderHeight);
  return {
    pipeline: submitted.authored.v2 ? "v2" : "legacy",
    present: true,
    requestedPasses: plan.requestedPassNames,
    submittedPasses: plan.submittedPassNames,
    pixelBackedPasses: plan.pixelBackedPassNames,
    droppedPasses: plan.plannedVsActual.dropped,
    missingInputs: plan.missingInputs,
    executionMode: plan.executionMode,
    readbackPasses: plan.readbackPassNames,
    fusedLdr: plan.canFuseLdr,
    targetFormat: plan.targetFormat,
    temporalRequested: submitted.temporalRequested,
    velocityCoverage: authoredContext?.flags.post ? postVelocityCoverage() : null,
    antiAlias,
    skipped: [
      ...(antiAlias?.reason ? [`aa:${antiAlias.reason}`] : []),
      ...plan.plannedVsActual.dropped,
      // §6.3: the indirect-fraction feature is registered but the lane-01
      // program generator is still the PR 0a stub — AO applies the
      // `u_aoFallbackStrength` path until C-02 lands real.
      ...(authoredContext?.flags.post && (submitted.authored.ambientOcclusion || submitted.authored.contactOcclusion)
        ? ["AO_INDIRECT_FRACTION_PENDING"]
        : []),
      // §6.9: in production builds the non-GPU passes are skipped instead of
      // throwing POSTPROCESS_PASS_NOT_GPU — record them here.
      ...(postProductionBuildBridge() && authoredContext?.flags.post
        ? plan.pixelBackedPassNames.map((name) => `POSTPROCESS_PASS_NOT_GPU:${name}`)
        : [])
    ],
    customPasses: custom,
    warnings: [
      ...plan.clarityWarnings,
      // §7.1: flag-off unknown fields warn as `option-ignored`; deprecated
      // fields + informational diagnostics keep their §7.1 names.
      ...(submitted.authored.fieldDiagnostics ?? []).map((diagnostic) =>
        diagnostic.code === "POST_FIELD_UNSUPPORTED" && !authoredContext?.flags.post
          ? `option-ignored:${diagnostic.effect}.${diagnostic.field}`
          : diagnostic.field
            ? `${diagnostic.code}:${diagnostic.effect}.${diagnostic.field}`
            : `${diagnostic.code}:${diagnostic.effect}`)
    ],
    source: "agent-api/postBridge.ts + RendererPostprocessPlanDiagnostics"
  };
}

export function collectExposureSection(app: AuraApp): ExposureSectionReport {
  const submitted = (app.canvas ? canvasRecords.get(app.canvas) : undefined) ?? latestSubmittedPostprocess();
  const authoredContext = authoredPostContextFor(app.canvas ?? undefined);
  const toneMapping = submitted?.options.toneMapping;
  const toneMappingOptions = typeof toneMapping === "object" && toneMapping !== null ? toneMapping : undefined;
  return {
    present: submitted !== null,
    applied: toneMapping === false ? null : (toneMappingOptions?.exposure ?? (submitted ? 1 : null)),
    operator: toneMapping === false ? "off" : (toneMappingOptions?.operator ?? (submitted ? "aces" : null)),
    whitePoint: toneMappingOptions?.whitePoint ?? null,
    inputColorSpace: toneMappingOptions?.inputColorSpace ?? null,
    outputColorSpace: toneMappingOptions?.outputColorSpace ?? null,
    authoredGradeExposure: submitted?.authored.colorGradeExposure ?? null,
    outputExposureAuthored: typeof authoredContext?.output?.exposure === "number" ? authoredContext.output.exposure : null,
    source: "agent-api/postBridge.ts"
  };
}

/* ------------------------------------------------------------------------- */
/* C-13 app surface                                                          */
/* ------------------------------------------------------------------------- */

let customPassSequence = 0;

/** Space implied by the anchor a custom pass inserts at. */
function spaceForAnchor(insertAt: PostInsertAt): PostSpace {
  return insertAt === "after-tonemap" ? "display" : "linear-hdr";
}

/**
 * `AuraCustomPostPass` → `PostPassDescriptor`. Custom fragments are GPU-only by
 * contract (`AuraCustomPostPass` carries fragment/uniforms, never a cpu run).
 */
function customPassToDescriptor(pass: AuraCustomPostPass): PostPassDescriptor {
  customPassSequence += 1;
  const uniforms = pass.uniforms;
  return {
    id: `prd03.custom.${pass.name || `pass-${customPassSequence}`}`,
    owner: "prd03",
    flag: "A3D_QR_POST",
    space: spaceForAnchor(pass.insertAt),
    insertAt: pass.insertAt,
    inputs: pass.inputs ?? ["color"],
    fragment: { glsl: pass.fragment.glsl, ...(pass.fragment.wgsl ? { wgsl: pass.fragment.wgsl } : {}) },
    uniforms: uniforms ? () => uniforms : undefined,
    enabled: () => true,
    gpuOnly: true
  };
}

/**
 * The real `post` extension value. Flag-off it behaves exactly like
 * `StubPostSurface` (addPostPass no-ops, the tier is only recorded); flag-on it
 * additionally registers the descriptor into the C-13 pass registry, where the
 * v2 graph picks it up. `setQualityTier` records either way — tier resolution
 * against `AuraQualityTierSettings` lands with the graph.
 */
export class Prd03PostSurface implements AuraPostSurface {
  private requestedTier: AuraQualityTier | "auto" | null = null;

  constructor(
    private readonly flags: QrFlags,
    private readonly canvas?: HTMLCanvasElement,
    private readonly app?: AuraApp
  ) { }

  addPostPass(pass: AuraCustomPostPass): () => void {
    if (!this.flags.on("A3D_QR_POST")) return () => { /* stub chain: release is a no-op */ };
    return registerPostPass(customPassToDescriptor(pass));
  }

  setQualityTier(tier: AuraQualityTier | "auto"): void {
    this.requestedTier = tier;
    // The compiler reads the shared context store when resolving tier AA (Phase 1).
    recordPostQualityTier(tier, this.canvas);
    // §6.8: delegate to the C-27 controller when lane 11 exposes `app.quality`;
    // `quality.onChange` re-records below so the next compile/frame re-resolves
    // the post tier. On this build's surface the recorded tier is the channel.
    if (tier !== "auto") {
      const quality = qualityControllerOf(this.app);
      void quality?.set(tier);
    }
  }

  /** Test/diagnostic accessor for the recorded tier. */
  get qualityTier(): AuraQualityTier | "auto" | null {
    return this.requestedTier;
  }
}

/** C-27 duck-type: `app.quality` is lane 11's surface — read it if present. */
function qualityControllerOf(app: AuraApp | undefined): { set(tier: AuraQualityTier, overrides?: unknown): Promise<void>; onChange(l: (e: { readonly to: AuraQualityTier }) => void): () => void } | undefined {
  const quality = (app as unknown as { quality?: { set(tier: AuraQualityTier, overrides?: unknown): Promise<void>; onChange(l: (e: { readonly to: AuraQualityTier }) => void): () => void } } | undefined)?.quality;
  return quality && typeof quality.set === "function" && typeof quality.onChange === "function" ? quality : undefined;
}

/** C-38 factory: mounts `app.post` for prd03 with the app's resolved flags. */
export function createPrd03PostSurface(app: AuraApp, ctx: { readonly flags: QrFlags; readonly options: unknown }): AuraPostSurface {
  // Record the C-38 `output` options so `compiler/postprocess.ts` can wire
  // Phase-1 behaviour (exposure product, operator, tier AA) without reaching
  // back into `createAuraApp` scope.
  recordAuthoredPostContext(ctx, app);
  // §6.8 re-resolution: a C-27 tier change re-records the authored tier so the
  // next postpipeline resolve reads the new `QUALITY_TIERS` row.
  qualityControllerOf(app)?.onChange((event) => recordPostQualityTier(event.to, app.canvas ?? undefined));
  return new Prd03PostSurface(ctx.flags, app.canvas ?? undefined, app);
}

/* ------------------------------------------------------------------------- */
/* Phase 2 — C-13 v2 bridge: field validation + v2 option assembly            */
/* ------------------------------------------------------------------------- */

/**
 * Own keys allowed on every effect node regardless of `effect` — the node's
 * shared bag fields (`AuraEffectNode`) plus the transform spec and the lane
 * bookkeeping field `postAuthored` (CCR-03-3).
 */
export const POST_EFFECT_COMMON_FIELDS: readonly string[] = [
  "kind", "effect", "name", "id", "intensity", "enabled", "animation", "postAuthored",
  "position", "rotation", "scale", "lookAt", "rotationOrder", "quaternion"
];

/**
 * §7.1 allowlist: v2-executed fields per post-relevant `effect` value. A field
 * absent from the node's `postAuthored` list takes its v2 default; a field
 * present but not in this list or `POST_EFFECT_DEPRECATED_FIELDS` throws
 * `POST_FIELD_UNSUPPORTED` (flag on) before the first frame.
 */
export const POST_EFFECT_FIELDS: Readonly<Record<string, readonly string[]>> = {
  bloom: ["threshold", "knee", "scatter", "color", "clampLuminance"],
  "ambient-occlusion": ["radius", "intensity", "falloff", "multiBounce"],
  "contact-occlusion": ["radius", "intensity", "falloff", "multiBounce"],
  "color-grade": ["exposure", "temperature", "tint", "contrast", "saturation", "vibrance",
    "lift", "gamma", "gain", "shadows", "midtones", "highlights", "lut", "lutIntensity"],
  "anti-alias": ["mode", "sharpness"],
  vignette: ["intensity", "smoothness", "roundness", "color"],
  "film-grain": ["intensity", "size", "luminanceResponse"],
  "chromatic-aberration": ["intensity"],
  // Lane-07 factories route through this bridge on the v2 chain (§6.9).
  "volumetric-fog": ["density", "color", "volumetricQuality", "lightPosition", "heightFalloff", "heightReference"],
  "depth-of-field": ["focusDistance", "fStop", "focalLength", "maxBlur"],
  "motion-blur": ["shutter", "maxBlur", "samples", "tileSize", "timeScale"],
  "screen-space-reflections": ["maxDistance", "intensity"],
  outline: ["color", "width", "threshold"]
};

/**
 * §7.1 deprecated fields — accepted with a `post-field-deprecated` diagnostic,
 * mapped where the spec says so (bloom `radius` → `scatter`, `maxIntensity` /
 * `antiBlowout` → `clampLuminance`; DOF `focus`/`aperture` convert with real
 * near/far). Everything else is ignored.
 */
export const POST_EFFECT_DEPRECATED_FIELDS: Readonly<Record<string, readonly string[]>> = {
  bloom: ["quality", "softKnee", "shoulder", "maxIntensity", "antiBlowout", "radius"],
  "ambient-occlusion": ["density", "color"],
  "contact-occlusion": ["density", "color"],
  "depth-of-field": ["focus", "aperture"]
};

export interface PostFieldDiagnostic {
  readonly code: "POST_FIELD_UNSUPPORTED" | "post-field-deprecated" | "BLOOM_THRESHOLD_BELOW_HDR_WHITE" | "preset-capability-degraded" | "post-tier-disabled";
  readonly effect: string;
  readonly field?: string;
  readonly message: string;
}

function isAuthored(node: AuraEffectNode, field: string): boolean {
  return node.postAuthored === undefined || node.postAuthored.includes(field);
}

/**
 * Validates one effect node's own keys against the allowlists. Returns the
 * diagnostics the caller either throws on (flag on, unknown fields) or warns
 * with (flag off / deprecated). `undefined` for non-post effects — those are
 * other lanes' to validate.
 */
export function validatePostEffectNode(node: AuraEffectNode): readonly PostFieldDiagnostic[] | undefined {
  const fields = POST_EFFECT_FIELDS[node.effect];
  if (!fields) return undefined;
  const deprecated = POST_EFFECT_DEPRECATED_FIELDS[node.effect] ?? [];
  const diagnostics: PostFieldDiagnostic[] = [];
  // §7.1 applies to AUTHORED fields: `postAuthored` (CCR-03-3) lists the keys
  // the caller actually wrote — factory-default own keys are excluded. Nodes
  // built without the bridge marker fall back to validating every own key.
  const keys = node.postAuthored ?? Object.keys(node);
  for (const key of keys) {
    if (POST_EFFECT_COMMON_FIELDS.includes(key) || fields.includes(key)) continue;
    if (deprecated.includes(key)) {
      diagnostics.push({
        code: "post-field-deprecated",
        effect: node.effect,
        field: key,
        message: `effects.${node.effect} field "${key}" is deprecated under the v2 post chain (§7.1 mapping).`
      });
      continue;
    }
    diagnostics.push({
      code: "POST_FIELD_UNSUPPORTED",
      effect: node.effect,
      field: key,
      message: `effects.${node.effect} field "${key}" has no v2 post-chain consumer (POST_FIELD_UNSUPPORTED).`
    });
  }
  return diagnostics;
}

/* V2 option bags ---------------------------------------------------------- */

const V2_BLOOM_DEFAULTS = { threshold: 1.0, knee: 0.25, intensity: 0.25, scatter: 0.7, clampLuminance: 64 } as const;

function numberField(node: AuraEffectNode, field: string, fallback: number): number {
  const value = (node as unknown as Record<string, unknown>)[field];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function authoredNumber(node: AuraEffectNode, field: string, fallback: number): number {
  return isAuthored(node, field) ? numberField(node, field, fallback) : fallback;
}

interface RgbLike { readonly r: number; readonly g: number; readonly b: number }

function rgbField(node: AuraEffectNode, field: string, fallback: RgbLike): RgbLike {
  const value = (node as unknown as Record<string, unknown>)[field];
  if (Array.isArray(value) && value.length >= 3) {
    return { r: Number(value[0]), g: Number(value[1]), b: Number(value[2]) };
  }
  if (value && typeof value === "object" && "r" in value) {
    const v = value as { r: unknown; g: unknown; b: unknown };
    return { r: Number(v.r), g: Number(v.g), b: Number(v.b) };
  }
  return fallback;
}

/**
 * §6.6 v2 bloom mapping: authored fields win; fields absent from
 * `postAuthored` take the v2 defaults (factory defaults are legacy). A
 * threshold < 1 is honored as linear HDR and reported
 * `BLOOM_THRESHOLD_BELOW_HDR_WHITE`. `radius` aliases `scatter`;
 * `maxIntensity`/`antiBlowout` map to `clampLuminance`.
 */
export function mapBloomOptionsV2(node: AuraEffectNode, mipLevels: 3 | 5 | 6): { readonly options: BloomOptionsV2; readonly diagnostics: readonly PostFieldDiagnostic[] } {
  const diagnostics: PostFieldDiagnostic[] = [];
  const nodeFields = node as unknown as Record<string, unknown>;
  const threshold = authoredNumber(node, "threshold", V2_BLOOM_DEFAULTS.threshold);
  if (threshold < 1) {
    diagnostics.push({
      code: "BLOOM_THRESHOLD_BELOW_HDR_WHITE",
      effect: "bloom",
      field: "threshold",
      message: `bloom threshold ${threshold} is below HDR white; honored as linear HDR (§6.6).`
    });
  }
  const scatterAuthored = isAuthored(node, "scatter") ? numberField(node, "scatter", NaN) : NaN;
  const radiusAlias = isAuthored(node, "radius") ? numberField(node, "radius", NaN) : NaN;
  const maxIntensity = isAuthored(node, "maxIntensity") ? numberField(node, "maxIntensity", NaN) : NaN;
  const antiBlowout = isAuthored(node, "antiBlowout") ? nodeFields.antiBlowout === true : false;
  const clampLuminance = authoredNumber(node, "clampLuminance",
    Number.isFinite(maxIntensity) ? maxIntensity : antiBlowout ? V2_BLOOM_DEFAULTS.clampLuminance : V2_BLOOM_DEFAULTS.clampLuminance);
  const tintAuthored = isAuthored(node, "color");
  const tint = tintAuthored ? rgbField(node, "color", { r: 1, g: 1, b: 1 }) : { r: 1, g: 1, b: 1 };
  return {
    options: {
      threshold: Math.min(64, Math.max(0, threshold)),
      knee: Math.min(1, Math.max(0, authoredNumber(node, "knee", V2_BLOOM_DEFAULTS.knee))),
      intensity: Math.min(4, Math.max(0, authoredNumber(node, "intensity", V2_BLOOM_DEFAULTS.intensity))),
      scatter: Math.min(1, Math.max(0, Number.isFinite(scatterAuthored) ? scatterAuthored : Number.isFinite(radiusAlias) ? radiusAlias : V2_BLOOM_DEFAULTS.scatter)),
      tint: [tint.r, tint.g, tint.b] as const,
      clampLuminance,
      mips: mipLevels
    },
    diagnostics
  };
}

/**
 * The v2 root post pipeline (C-13): assembles `PostPipelineOptions` from the
 * snapshot's effect nodes + C-38 `output` + C-27 tier settings. Throws
 * `AuraRuntimeError("POST_FIELD_UNSUPPORTED", ...)` on an unknown effect-node
 * field — this runs inside the compile, so `app.ready()` rejects before the
 * first frame instead of the error dying inside `diagnostics.errors`.
 */
export function createRootPostPipeline(
  snapshot: AuraSceneSnapshot,
  camera: { readonly near?: number; readonly far?: number; readonly mode?: string } | undefined,
  output: AuraOutputOptions | undefined,
  tierSettings: AuraQualityTierSettings,
  lights: readonly CollectedLight[] = [],
  tierResolution?: PostTierResolution
): { readonly options: PostPipelineOptions; readonly diagnostics: readonly PostFieldDiagnostic[] } {
  const nodes = groups.flatten(snapshot.nodes);
  const diagnostics: PostFieldDiagnostic[] = [];
  for (const node of nodes) {
    if (node.kind !== "effect") continue;
    const nodeDiagnostics = validatePostEffectNode(node);
    if (nodeDiagnostics) diagnostics.push(...nodeDiagnostics);
    const unsupported = nodeDiagnostics?.find((d) => d.code === "POST_FIELD_UNSUPPORTED");
    if (unsupported) {
      throw new AuraRuntimeError("POST_FIELD_UNSUPPORTED", unsupported.message);
    }
  }

  // §6.8 (Phase 5): `output.preset` expands into `output` + effect nodes.
  // Authored `output` fields win over the preset's; an authored effect node
  // overrides the preset's same-effect node field by field. Presets naming
  // agx/neutral render aces while C-05's operator selection is a stub.
  const authoredEffectNodes = nodes.filter((node): node is AuraEffectNode => node.kind === "effect");
  const expansion = expandPostPreset(output, authoredEffectNodes);
  const effectiveOutput = expansion.output;
  const effectNodes = expansion.nodes;
  if (expansion.preset && presetCapabilityDegraded(expansion.preset, output?.toneMapping)) {
    diagnostics.push({
      code: "preset-capability-degraded",
      effect: "output",
      field: "preset",
      message: `preset "${expansion.preset.id}" declares ${expansion.preset.output.toneMapping}; renders as "aces" until C-05's operator selection is real.`
    });
  }

  const tierDisabled = (stage: string, reason: string): void => {
    diagnostics.push({
      code: "post-tier-disabled",
      effect: stage,
      message: `${stage} is off on the ${tierResolution?.tier ?? "resolved"} post tier (${reason}).`
    });
  };

  const effect = (kind: string) => effectNodes.find((node): node is AuraEffectNode => node.kind === "effect" && node.effect === kind);
  const bloomNode = effect("bloom");
  const gradeNode = effect("color-grade");
  const vignetteNode = effect("vignette");
  const grainNode = effect("film-grain");
  const caNode = effect("chromatic-aberration");
  const volumetricNode = effect("volumetric-fog");
  const dofNode = effect("depth-of-field");
  const mbNode = effect("motion-blur");
  const ssrNode = effect("screen-space-reflections");

  // §6.9/§8.4 (Phase 3): ambient-occlusion and contact-occlusion both target
  // S2 GTAO — two AO nodes are a pipeline error (`POST_DUPLICATE_STAGE`;
  // a lane-15 `AuraRuntimeError` union entry is qr-requested). `radius` is
  // interpreted in metres flag-on; contactOcclusion is ambientOcclusion with
  // a 0.2 m default radius.
  const aoNodes = effectNodes.filter((node): node is AuraEffectNode =>
    node.kind === "effect" && (node.effect === "ambient-occlusion" || node.effect === "contact-occlusion"));
  if (aoNodes.length > 1) {
    throw new Error(
      `POST_DUPLICATE_STAGE: two AO effect nodes (${aoNodes.map((node) => node.effect).join(" + ")}) target stage S2-gtao.`
    );
  }
  const aoNode = aoNodes[0];

  // §6.9: the god-ray light is the strongest DIRECTIONAL light in the
  // compiled RenderSource — direction TOWARD the light for the S4 project.
  const strongestDirectional = lights.reduce<CollectedLight | null>((best, light) =>
    light.kind === "directional" && light.intensity > 0 && (!best || light.intensity > best.intensity) ? light : best, null);
  const godRayLightDirection = strongestDirectional ? volumetricLightDirection(strongestDirectional) : null;

  const bloom = bloomNode ? mapBloomOptionsV2(bloomNode, tierSettings.bloomMipLevels) : undefined;
  if (bloom) diagnostics.push(...bloom.diagnostics);

  const exposure = (effectiveOutput?.exposure ?? 1) * authoredNumber(gradeNode ?? ({} as AuraEffectNode), "exposure", 1);
  const toneMapping = effectiveOutput?.toneMapping ?? "aces";

  // §6.8 tier gates (Phase 5): `resolvePostTier` decides which authored or
  // preset-contributed stages the resolved tier can afford. Disabled stages
  // drop their option bag and report `post-tier-disabled` so `post.skipped`
  // shows the tier, not a missing node.
  const aoEnabled = tierResolution === undefined || tierResolution.gtao.enabled;
  if (aoNode && !aoEnabled) tierDisabled("S2-gtao", "ambientOcclusion off in C-27");
  const godRaysEnabled = tierResolution === undefined || tierResolution.godRays.enabled;
  if (volumetricNode && !godRaysEnabled) tierDisabled("S4-god-rays", "god rays off below Medium");
  const dofEnabled = tierResolution === undefined || tierResolution.dof.enabled;
  if (dofNode && !dofEnabled) tierDisabled("S6-dof", "DOF off below High");
  const mbEnabled = tierResolution === undefined || tierResolution.motionBlur.enabled;
  if (mbNode && !mbEnabled) tierDisabled("S7-motion-blur", "motion blur off below High");
  const ssrEnabled = tierResolution === undefined || tierResolution.ssr.enabled;
  if (ssrNode && !ssrEnabled) tierDisabled("S3-ssr", "SSR off below High");
  const grainEnabled = tierResolution === undefined || tierResolution.allowsFilmGrain;
  if (grainNode && !grainEnabled) tierDisabled("S12-film-grain", "grain off on Low");
  const caEnabled = tierResolution === undefined || tierResolution.allowsChromaticAberration;
  if (caNode && !caEnabled) tierDisabled("S10-chromatic-aberration", "CA off on Low");
  // S8 auto-exposure: authored `output.autoExposure` (CCR-03-2) gated by the
  // C-27 tier row (off on Low; "if preset" otherwise).
  const authoredAe = effectiveOutput?.autoExposure;
  const aeRequested = authoredAe !== undefined && authoredAe !== false;
  const aeEnabled = tierResolution === undefined || tierResolution.autoExposure;
  if (aeRequested && !aeEnabled) tierDisabled("S8-auto-exposure", "auto-exposure off on Low");

  const options: PostPipelineOptions = {
    antiAliasing: "off", // resolved by the caller through resolvePostAntiAlias
    depthRange: {
      near: camera?.near ?? 0.1,
      far: camera?.far ?? 1000,
      projection: camera?.mode === "orthographic" || camera?.mode === "isometric" ? "orthographic" : "perspective"
    },
    renderScale: tierSettings.minRenderScale,
    ...(bloom ? { bloom: bloom.options } : {}),
    exposure,
    toneMapping: toneMapping as PostPipelineOptions["toneMapping"],
    dither: effectiveOutput?.dither !== false,
    backgroundPassthrough: effectiveOutput?.backgroundPassthrough === true,
    ...(aoNode && aoEnabled ? {
      ao: {
        radius: aoNode.effect === "contact-occlusion"
          ? numberField(aoNode, "radius", 0.2)
          : numberField(aoNode, "radius", 0.35),
        intensity: numberField(aoNode, "intensity", 1),
        falloff: numberField(aoNode, "falloff", 1),
        directions: (tierResolution?.gtao.enabled === true ? tierResolution.gtao.directions : 4) as 2 | 4,
        steps: (tierResolution?.gtao.enabled === true ? tierResolution.gtao.steps : 4) as 4 | 6,
        halfRes: tierResolution?.gtao.enabled === true ? tierResolution.gtao.halfRes : true,
        temporal: tierResolution?.gtao.enabled === true ? tierResolution.gtao.temporal : true,
        multiBounce: aoNode.multiBounce !== false,
        fallbackStrength: 0.6
      }
    } : {}),
    ...(volumetricNode && godRaysEnabled ? {
      godRays: {
        samples: (tierResolution?.godRays.enabled === true ? tierResolution.godRays.samples : 32) as 32 | 48 | 64,
        decay: 0.94,
        weight: numberField(volumetricNode, "intensity", 0.7),
        density: numberField(volumetricNode, "density", 0.18),
        intensity: numberField(volumetricNode, "intensity", 0.7),
        color: rgbField(volumetricNode, "color", { r: 0.44, g: 0.52, b: 0.73 }),
        lightWorld: Array.isArray(volumetricNode.lightPosition) ? volumetricNode.lightPosition.slice(0, 3) as unknown as readonly [number, number, number] : undefined,
        ...(godRayLightDirection ? { lightDirection: godRayLightDirection } : {})
      }
    } : {}),
    ...(dofNode && dofEnabled ? {
      dof: {
        // §7.1: legacy `focus` fraction converts with real near/far; the new
        // `focusDistance` field (metres) wins when authored.
        focusDistance: isAuthored(dofNode, "focusDistance")
          ? numberField(dofNode, "focusDistance", 3)
          : (camera?.near ?? 0.1) + numberField(dofNode, "focus", 0.02) * ((camera?.far ?? 1000) - (camera?.near ?? 0.1)),
        fStop: numberField(dofNode, "fStop", 2.8),
        focalLengthMm: numberField(dofNode, "focalLength", 50),
        maxBlurPx: numberField(dofNode, "maxBlur", 12),
        halfRes: tierResolution?.dof.enabled === true ? tierResolution.dof.halfRes : true,
        sensorHeightMm: 24
      }
    } : {}),
    ...(mbNode && mbEnabled ? {
      motionBlur: {
        // §8.8: authored shutter × node timeScale (C-23's per-node scale;
        // session-level timeScale lands via QR-03-12).
        shutter: numberField(mbNode, "shutter", numberField(mbNode, "intensity", 0.5)) * numberField(mbNode, "timeScale", 1),
        maxBlurPx: numberField(mbNode, "maxBlur", 32),
        // §8.8: legal sets — samples 8|12|16; the tier sets the default taps.
        samples: (() => {
          const tierDefault = tierResolution?.motionBlur.enabled === true ? tierResolution.motionBlur.samples : 12;
          const s = numberField(mbNode, "samples", tierDefault);
          return (s <= 8 ? 8 : s <= 12 ? 12 : 16) as 8 | 12 | 16;
        })(),
        tileSize: numberField(mbNode, "tileSize", 16) <= 16 ? 16 : 20
      }
    } : {}),
    ...(ssrNode && ssrEnabled ? { ssr: { intensity: numberField(ssrNode, "intensity", 0.9), maxDistance: numberField(ssrNode, "maxDistance", 18) } } : {}),
    ...(gradeNode ? {
      grade: {
        temperature: authoredNumber(gradeNode, "temperature", 0),
        tint: authoredNumber(gradeNode, "tint", 0),
        contrast: authoredNumber(gradeNode, "contrast", 1),
        saturation: authoredNumber(gradeNode, "saturation", 1),
        vibrance: authoredNumber(gradeNode, "vibrance", 0),
        lift: rgbField(gradeNode, "lift", { r: 0, g: 0, b: 0 }),
        gamma: rgbField(gradeNode, "gamma", { r: 1, g: 1, b: 1 }),
        gain: rgbField(gradeNode, "gain", { r: 1, g: 1, b: 1 }),
        shadows: rgbField(gradeNode, "shadows", { r: 1, g: 1, b: 1 }),
        midtones: rgbField(gradeNode, "midtones", { r: 1, g: 1, b: 1 }),
        highlights: rgbField(gradeNode, "highlights", { r: 1, g: 1, b: 1 }),
        lutIntensity: authoredNumber(gradeNode, "lutIntensity", 1)
      }
    } : {}),
    ...(gradeNode?.lut ? { lut: { source: gradeNode.lut, intensity: numberField(gradeNode, "lutIntensity", 1) } } : {}),
    ...(vignetteNode ? {
      vignette: {
        intensity: numberField(vignetteNode, "intensity", 0.3),
        smoothness: numberField(vignetteNode, "smoothness", 1),
        roundness: numberField(vignetteNode, "roundness", 1),
        color: rgbField(vignetteNode, "color", { r: 0, g: 0, b: 0 })
      }
    } : {}),
    ...(grainNode && grainEnabled ? {
      filmGrain: {
        intensity: numberField(grainNode, "intensity", 0.05),
        size: numberField(grainNode, "size", 1),
        luminanceResponse: numberField(grainNode, "luminanceResponse", 1)
      }
    } : {}),
    ...(caNode && caEnabled ? { chromaticAberration: { intensity: numberField(caNode, "intensity", 0.0015) } } : {}),
    ...(aeRequested && aeEnabled ? {
      autoExposure: {
        minEv: (authoredAe as { readonly minEv?: number })?.minEv ?? -4,
        maxEv: (authoredAe as { readonly maxEv?: number })?.maxEv ?? 4,
        speedUp: (authoredAe as { readonly speedUp?: number })?.speedUp ?? 3,
        speedDown: (authoredAe as { readonly speedDown?: number })?.speedDown ?? 1,
        meteringMask: (authoredAe as { readonly meteringMask?: "center-weighted" | "average" })?.meteringMask ?? "center-weighted",
        compensationEv: (authoredAe as { readonly compensationEv?: number })?.compensationEv ?? 0
      }
    } : {})
  };
  return { options, diagnostics };
}
