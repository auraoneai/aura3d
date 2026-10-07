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
  type RendererPostProcessOptions
} from "@aura3d/rendering";
import {
  registerPostPass,
  registeredPostPasses,
  type PostInsertAt,
  type PostPassDescriptor,
  type PostSpace,
  type AuraQualityTier,
  type QrFlags
} from "@aura3d/rendering/contracts";
import type { AuraCustomPostPass, AuraPostSurface } from "../contracts/post.js";
import type { AuraOutputOptions } from "../contracts/output.js";
import type { AuraApp, AuraCreateAppOptions } from "./index.js";

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
}

interface MutableAuthoredPostContext {
  flags: { readonly post: boolean };
  output: AuraOutputOptions | undefined;
  qualityTier: AuraQualityTier | "auto" | null;
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
    qualityTier: authoredContext?.qualityTier ?? null
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
    authoredContext = { flags: { post: false }, output: undefined, qualityTier: tier };
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
    pipeline: "legacy",
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
    antiAlias,
    skipped: [
      ...(antiAlias?.reason ? [`aa:${antiAlias.reason}`] : []),
      ...plan.plannedVsActual.dropped
    ],
    customPasses: custom,
    warnings: plan.clarityWarnings,
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

  constructor(private readonly flags: QrFlags, private readonly canvas?: HTMLCanvasElement) { }

  addPostPass(pass: AuraCustomPostPass): () => void {
    if (!this.flags.on("A3D_QR_POST")) return () => { /* stub chain: release is a no-op */ };
    return registerPostPass(customPassToDescriptor(pass));
  }

  setQualityTier(tier: AuraQualityTier | "auto"): void {
    this.requestedTier = tier;
    // The compiler reads the shared context store when resolving tier AA (Phase 1).
    recordPostQualityTier(tier, this.canvas);
  }

  /** Test/diagnostic accessor for the recorded tier. */
  get qualityTier(): AuraQualityTier | "auto" | null {
    return this.requestedTier;
  }
}

/** C-38 factory: mounts `app.post` for prd03 with the app's resolved flags. */
export function createPrd03PostSurface(app: AuraApp, ctx: { readonly flags: QrFlags; readonly options: unknown }): AuraPostSurface {
  // Record the C-38 `output` options so `compiler/postprocess.ts` can wire
  // Phase-1 behaviour (exposure product, operator, tier AA) without reaching
  // back into `createAuraApp` scope.
  recordAuthoredPostContext(ctx, app);
  return new Prd03PostSurface(ctx.flags, app.canvas ?? undefined);
}
