// PR 0b-2 carve-out (CONTRACTS.md §3.3) — verbatim move from Renderer.ts; 0 changed logic lines.
// File: packages/rendering/src/renderer/PostprocessExecution.ts — owner lane 03.

import { standardizeDepthReadback } from "./FrameDepthConvention";
import type { RenderItem } from "../ForwardPass";
import { type BloomOptions, BloomPass, type ChromaticAberrationOptions, type ColorGradeOptions, type ContactShadowPostProcessOptions, type DepthOfFieldOptions, type DepthTextureBinding, type FXAAOptions, FXAAPass, type FilmGrainOptions, type FusedLdrPostProcessPass, type MotionBlurOptions, type OutlineOptions, type SSAOOptions, type SSROptions, type TAAOptions, type ToneMappingOptions, ToneMappingPass, type VolumetricLightOptions, bloomFloatPixels, bloomPixels, chromaticAberrationPixels, colorGradePixels, contactShadowPixels, createDepthTextureBinding, depthOfFieldPixels, filmGrainPixels, fusedLdrPostprocessPixels, fxaaPixels, motionBlurPixels, outlinePixels, ssaoPixels, ssrPixels, taaPixels, toneMapFloatPixels, toneMapPixels, volumetricLightPixels, writePostProcessPixels } from "../PostProcessPass";
import { type LdrPostprocessPassDescriptor, type LdrPostprocessPresentationOptions, type NativeWebGPUDofFrame, type NativeWebGPUDofFrameSubmission, type RenderDevice, type RenderDeviceDiagnostics, RenderDeviceError, type RenderTarget, type RenderTargetDescriptor } from "../RenderDevice";
import type { RendererPostProcessOptions, RendererPostprocessDiagnostics } from "../Renderer";
import { type RendererPostProcessPassName, type RendererPostProcessPassPlan, type RendererPostprocessTargetFormat, createRendererPostprocessPasses, createRendererPostprocessPlanDiagnostics } from "../RendererPostprocessPlan";
import type { RenderSource } from "../contracts/renderSource";
import { isIterable } from "./RenderShared";
import { rendererQrFlags } from "./FrameGraph";
import { qrCoreOutputOn } from "./qrSubFlags";
import type { RendererHost } from "./RendererHost";
import { Scene } from "@aura3d/scene";
import { type PostPassDescriptor, type PostPipelineOptions, registeredPostPasses } from "../contracts/post";
import { webgl2DeviceHost } from "../webgl2/Counters";
import type { WebGL2DeviceHost } from "../webgl2/DeviceHost";
import { type OutlineTargetOptions, outlineTargetPassFor, outlineTargetsOf } from "./OutlineTargets";
import { executePostGraphWebGL2 } from "../webgl2/LegacyPost";
import type { TemporalGpuBindings } from "../TemporalHistory";
import { markPostV2Presented, recordPostSkipped } from "./postSkipped";
import { postDiagnostics, type PostDiagnosticToken } from "./PostDiagnosticsScope";
import { guardPostprocessPlan } from "../quality/PostprocessGuard";
import { renderTargetPoolSlot, type RenderTargetPoolLike } from "../contracts/device";
import { acquireTargetPoolLease, type TargetPoolLease } from "../resources/RenderTargetPoolLease";
export { postProductionBuild, postSkippedReasons, recordPostSkipped, resetPostSkipped } from "./postSkipped";

/* Q-03-1 (#91, C-28/C-13, behind A3D_QR_TIERS): one C-28 pool per device for
 * the legacy chain's intermediate targets. The slot factory builds a new pool
 * per call, so the instance is cached here. */
const postChainPools = new WeakMap<RenderDevice, RenderTargetPoolLike>();

interface PostChainOwner {
  retired: boolean;
}

interface PostChainReleaseState {
  readonly pending: Map<TargetPoolLease, PostChainOwner>;
  readonly released: WeakSet<TargetPoolLease>;
  releasing: boolean;
}

// Keep failed releases reachable through the device after a renderer is retired,
// but retain their originating pipeline token so live owners remain isolated.
const postChainReleases = new WeakMap<RenderDevice, PostChainReleaseState>();

function postChainReleaseState(device: RenderDevice): PostChainReleaseState {
  let state = postChainReleases.get(device);
  if (!state) {
    state = { pending: new Map(), released: new WeakSet(), releasing: false };
    postChainReleases.set(device, state);
  }
  return state;
}

/** Guard even a provider-supplied lease against late and reentrant releases. */
function guardPostChainLease(backing: TargetPoolLease): TargetPoolLease {
  let released = false;
  let releasing = false;
  return {
    target: backing.target,
    release(): void {
      if (released || releasing) return;
      releasing = true;
      try {
        backing.release();
        released = true;
      } finally {
        releasing = false;
      }
    }
  };
}

function qrTiersOn(device: RenderDevice): boolean {
  return Boolean(rendererQrFlags(device).on("A3D_QR_TIERS"));
}

function postChainPool(device: RenderDevice): RenderTargetPoolLike {
  let pool = postChainPools.get(device);
  if (!pool) {
    pool = renderTargetPoolSlot.get(rendererQrFlags(device))(device);
    postChainPools.set(device, pool);
  }
  return pool;
}

/**
 * Q-03-1 (#91): under `A3D_QR_TIERS` the plan goes through lane 11's
 * `guardPostprocessPlan` before any pass runs, so a pass with no GPU
 * implementation never reaches a CPU readback. Mode comes from
 * `A3D_QR_STRICT` (throw `POSTPROCESS_PASS_CPU_ONLY`); otherwise dropped
 * passes are recorded as `POSTPROCESS_PASS_DROPPED:<name>` on the §6.9 skip
 * registry (`diagnostics().post.skipped`). Flag-off returns the plan as-is.
 */
export function guardRendererPostprocessPlan(
  device: RenderDevice,
  postprocess: RendererPostProcessOptions,
  source: RenderTarget,
  passes: readonly RendererPostProcessPassPlan[]
): readonly RendererPostProcessPassPlan[] {
  if (!qrTiersOn(device)) return passes;
  const flags = rendererQrFlags(device);
  const guarded = guardPostprocessPlan(passes, {
    mode: flags?.on("A3D_QR_STRICT") ? "throw" : "drop",
    gpuFusable: Boolean(device.presentLdrPostprocess),
    hasDepthTexture: Boolean(source.depthTexture),
    cpuDeterministic: postprocess.execution === "cpu-deterministic"
  });
  for (const name of guarded.dropped) recordPostSkipped(`POSTPROCESS_PASS_DROPPED:${name}`, postprocess.postFrameContext?.diagnosticToken);
  return guarded.passes;
}

/* v2 module warm cache — the sync `render()` route cannot `import()`; the
 * first flag-on frame fires it, later frames run the real S1–S12 stages. */
let postV2Modules: typeof import("../post/v2Entry") | undefined;

/** A signal frame must not race the deferred v2 HDR stage driver. */
export function postV2ModulesAvailable(): boolean {
  return postV2Modules !== undefined;
}

/* 03-S18c: what the last `tryExecutePostGraphV2` call did — "v2" when the v2
 * stages (and C-13 custom passes) ran, "v2-modules-loading" while the
 * deferred bag is still loading, or `legacy-chain:<reason>` when the seam
 * declined. `null` until a postprocess frame reached the seam (e.g. the
 * Renderer dropped the chain under core output). */
let lastPostGraphV2Outcome: string | null = null;

export function postGraphV2LastOutcome(token?: PostDiagnosticToken): string | null {
  return token ? postDiagnostics.snapshotToken(token)?.outcome ?? null : lastPostGraphV2Outcome;
}

/** Test hook. */
export function resetPostGraphV2Outcome(token?: PostDiagnosticToken): void {
  if (token) postDiagnostics.setOutcome(token, null);
  else lastPostGraphV2Outcome = null;
}

function setPostGraphV2Outcome(outcome: string, token?: PostDiagnosticToken): void {
  if (token) postDiagnostics.setOutcome(token, outcome);
  else lastPostGraphV2Outcome = outcome;
}

let postV2WarmPromise: Promise<void> | null = null;

export function warmPostV2Modules(): void {
  // Fire-and-forget from the frame path; a failed load is retried next frame.
  postV2ModulesReady().catch(() => undefined);
}

/**
 * Starts (once) and returns the deferred `post/v2Entry` load. The sync
 * `render()` route runs the v2 stages (S1–S12, C-13 custom passes) only
 * after this resolves; until then the seam reports `v2-modules-loading`.
 * Callers that need the first frames on the real v2 chain (the flag-on post
 * surface at mount, browser probes) await it. Rejection resets the warm so
 * the next frame retries.
 */
export function postV2ModulesReady(): Promise<void> {
  if (postV2Modules) return Promise.resolve();
  if (!postV2WarmPromise) {
    postV2WarmPromise = import("../post/v2Entry").then((modules) => {
      postV2Modules = modules;
    }).catch((error: unknown) => {
      postV2WarmPromise = null;
      throw error;
    });
  }
  return postV2WarmPromise;
}

export function collectPostprocess(source: RenderSource | Iterable<RenderItem> | Scene): RendererPostProcessOptions | undefined {
  if (source instanceof Scene || isIterable(source)) return undefined;
  if (source.postprocess === true) return {};
  if (!source.postprocess) return undefined;
  return source.postprocess;
}

function canFuseLdrPostprocess(source: RenderTarget, passes: readonly RendererPostProcessPassPlan[]): boolean {
  return canFusePasses(isHdrRenderTarget(source), passes);
}

export function webgpuAutoExposureRequested(device: RenderDevice, postprocess: RendererPostProcessOptions): boolean {
  if (device.kind !== "webgpu" || !postprocess.v2 || !postprocess.pipeline || typeof postprocess.pipeline !== "object") return false;
  const value = (postprocess.pipeline as PostPipelineOptions).autoExposure;
  return value !== undefined && value !== false;
}

export function webgpuDepthOfFieldRequested(device: RenderDevice, postprocess: RendererPostProcessOptions): boolean {
  if (device.kind !== "webgpu" || !postprocess.v2 || !postprocess.pipeline || typeof postprocess.pipeline !== "object") return false;
  const value = (postprocess.pipeline as PostPipelineOptions).dof;
  return value !== undefined && value !== false;
}

type WebgpuNativePostOptions = Pick<LdrPostprocessPresentationOptions, "nativeEffects" | "postFrameContext" | "autoExposure" | "nativeDepthOfField">;

// A strict-v2 root compile also retains a legacy DoF for WebGL fallback. Its
// focus controls are different from the native lens controls, so equality of
// the numbers cannot identify a duplicate. Accept only the unchanged pair
// linked by that compile; all independently supplied combinations still fail.
const ROOT_DOF_TWIN = Symbol.for("@aura3d/root-postprocess/dof-twin/v1");

function unchangedDofFields(value: unknown, fields: unknown, extraKeys: number): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value) || !Array.isArray(fields)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))
    || Reflect.ownKeys(value).length !== fields.length + extraKeys) return false;
  return fields.every(entry => {
    if (!Array.isArray(entry) || entry.length !== 2 || typeof entry[0] !== "string") return false;
    const descriptor = Object.getOwnPropertyDescriptor(value, entry[0]);
    return descriptor?.enumerable === true && "value" in descriptor && Object.is(descriptor.value, entry[1]);
  });
}

function isRootDofTwin(legacy: RendererPostProcessOptions["depthOfField"], nativeDof: unknown): boolean {
  if (!legacy || typeof legacy !== "object") return false;
  const descriptor = Object.getOwnPropertyDescriptor(legacy, ROOT_DOF_TWIN);
  const link = descriptor && "value" in descriptor ? descriptor.value as {
    legacy?: unknown; nativeDof?: unknown; legacyFields?: unknown; nativeFields?: unknown;
  } | undefined : undefined;
  return Boolean(link && link.legacy === legacy && link.nativeDof === nativeDof
    && unchangedDofFields(legacy, link.legacyFields, 1) && unchangedDofFields(nativeDof, link.nativeFields, 0));
}

/** Reject combinations whose color/depth provenance or graph order is not yet implemented. */
export function validateNativeDofRoute(postprocess: RendererPostProcessOptions, pipeline: PostPipelineOptions, scopeId: object | undefined): void {
  const options = pipeline.dof;
  if (options === null || typeof options !== "object" || Array.isArray(options)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(options))) {
    throw new RenderDeviceError("Depth of field requires an options object", "WEBGPU_DOF_INVALID");
  }
  if ([pipeline.ao, pipeline.ssr, pipeline.godRays, pipeline.taa, pipeline.motionBlur].some(Boolean)
    || (pipeline.antiAliasing !== undefined && pipeline.antiAliasing !== "off" && pipeline.antiAliasing !== "fxaa")
    || (pipeline.antiAliasing === "fxaa" && !postprocess.fxaa)
    || pipeline.nativeEffects?.length || pipeline.customPasses?.length
    || registeredPostPasses().some(pass => pass.postScopeMatches?.(scopeId) !== false)
    || (postprocess.depthOfField && !isRootDofTwin(postprocess.depthOfField, options))
    || [postprocess.volumetricLight, postprocess.motionBlur, postprocess.contactShadow,
      postprocess.ssao, postprocess.ssr, postprocess.taa, postprocess.outline, postprocess.chromaticAberration, postprocess.filmGrain].some(Boolean)
    || pipeline.lut || pipeline.vignette || pipeline.filmGrain || pipeline.chromaticAberration
    || (pipeline.bloom && !postprocess.bloom) || (pipeline.grade && !postprocess.colorGrade)) {
    throw new RenderDeviceError("Native depth of field cannot yet combine with the requested post stages", "WEBGPU_DOF_COMBINATION_UNSUPPORTED");
  }
}

function postprocessPassesForRoute(postprocess: RendererPostProcessOptions, nativePost: WebgpuNativePostOptions | undefined): readonly RendererPostProcessPassPlan[] {
  const passes = createRendererPostprocessPasses(postprocess);
  // webgpuNativePostOptions already validated that any legacy twin is the
  // unchanged root-authored pair before this native-only filter runs.
  return nativePost?.nativeDepthOfField ? passes.filter(pass => pass.name !== "depth-of-field") : passes;
}

/** Forward native effects and frame attribution to the backend that executes them. */
function webgpuNativePostOptions(device: RenderDevice, postprocess: RendererPostProcessOptions, source: RenderTarget): WebgpuNativePostOptions | undefined {
  if (device.kind !== "webgpu") return undefined;
  const pipeline = postprocess.v2 && postprocess.pipeline && typeof postprocess.pipeline === "object"
    ? postprocess.pipeline as PostPipelineOptions : undefined;
  const effects = pipeline?.nativeEffects;
  if (effects?.length && postprocess.execution === "cpu-deterministic") throw new RenderDeviceError("Native WebGPU effects require native postprocessing", "WEBGPU_NATIVE_EFFECTS_UNAVAILABLE");
  const autoExposure = webgpuAutoExposureRequested(device, postprocess) ? pipeline!.autoExposure : undefined;
  const depthOfField = webgpuDepthOfFieldRequested(device, postprocess) ? pipeline!.dof : undefined;
  if (autoExposure !== undefined && (autoExposure === null || typeof autoExposure !== "object" || Array.isArray(autoExposure)
      || ![Object.prototype, null].includes(Object.getPrototypeOf(autoExposure)))) {
    throw new RenderDeviceError("WebGPU auto exposure requires an options object", "WEBGPU_AUTO_EXPOSURE_INVALID");
  }
  if (autoExposure !== undefined && (postprocess.execution === "cpu-deterministic" || !device.presentLdrPostprocess)) {
    throw new RenderDeviceError("WebGPU auto exposure requires native postprocessing", "WEBGPU_AUTO_EXPOSURE_NATIVE_REQUIRED");
  }
  if (autoExposure !== undefined && !isHdrRenderTarget(source)) {
    throw new RenderDeviceError("WebGPU auto exposure requires a linear HDR source", "WEBGPU_AUTO_EXPOSURE_HDR_REQUIRED");
  }
  const context = postprocess.postFrameContext;
  let nativeDepthOfField: LdrPostprocessPresentationOptions["nativeDepthOfField"];
  if (depthOfField !== undefined) {
    validateNativeDofRoute(postprocess, pipeline!, context?.scopeId);
    if (postprocess.execution === "cpu-deterministic" || !device.presentLdrPostprocess || device.canPresentNativeDepthOfField?.() !== true) {
      throw new RenderDeviceError("Depth of field requires the native WebGPU implementation", "WEBGPU_DOF_NATIVE_REQUIRED");
    }
    if (!isHdrRenderTarget(source) || source.colorTexture.colorSpace !== "linear" || (source.sampleCount ?? 1) !== 1) {
      throw new RenderDeviceError("Depth of field requires a single-sample linear HDR source", "WEBGPU_DOF_HDR_REQUIRED");
    }
    const dofFrame = (context as (typeof context & { readonly nativeDepthOfFieldFrame?: NativeWebGPUDofFrame }))?.nativeDepthOfFieldFrame;
    if (!dofFrame || device.validateNativeDepthOfFieldFrame?.(dofFrame, source) !== true
      || dofFrame.source !== source || dofFrame.scopeId !== context?.scopeId || dofFrame.viewId !== context?.viewId
      || dofFrame.frameId !== context?.frameId || dofFrame.deviceGeneration !== device.generation
      || dofFrame.alpha !== "opaque" || dofFrame.depthModel !== "single-surface"
      || dofFrame.coverage?.target !== source || dofFrame.coverage.colorAttachment !== 1
      || dofFrame.coverage.encoding !== "depth-coverage-red8" || typeof dofFrame.isCurrent !== "function" || dofFrame.isCurrent() !== true) {
      throw new RenderDeviceError("Depth of field requires a current device-verified frame with matching coverage", "WEBGPU_DOF_FRAME_REQUIRED");
    }
    nativeDepthOfField = { options: depthOfField as NonNullable<LdrPostprocessPresentationOptions["nativeDepthOfField"]>["options"], frame: dofFrame };
  }
  const validView = typeof context?.viewId === "string" || (typeof context?.viewId === "number" && Number.isFinite(context.viewId));
  const frame = context?.scopeId && typeof context.scopeId === "object" && validView && Number.isSafeInteger(context.frameId) && context.frameId! >= 0
    ? { scopeId: context.scopeId, viewId: context.viewId, frameId: context.frameId!, cameraCut: context.cameraCut,
      ...(context.timeSeconds !== undefined ? { timeSeconds: context.timeSeconds } : {}),
      ...(context.diagnosticToken ? { diagnosticToken: context.diagnosticToken } : {}) }
    : undefined;
  if (autoExposure !== undefined && !frame) throw new RenderDeviceError("WebGPU auto exposure requires a renderer, view and frame identity", "POSTPROCESS_HISTORY_IDENTITY_REQUIRED");
  if (autoExposure !== undefined && !Number.isFinite(frame?.timeSeconds)) throw new RenderDeviceError("WebGPU auto exposure requires a finite frame time", "WEBGPU_AUTO_EXPOSURE_TIME_REQUIRED");
  if (!effects?.length && !frame && autoExposure === undefined && !nativeDepthOfField) return undefined;
  return { ...(effects?.length ? { nativeEffects: effects } : {}), ...(frame ? { postFrameContext: frame as NonNullable<WebgpuNativePostOptions["postFrameContext"]> } : {}),
    ...(autoExposure !== undefined ? { autoExposure: autoExposure as NonNullable<WebgpuNativePostOptions["autoExposure"]> } : {}),
    ...(nativeDepthOfField ? { nativeDepthOfField } : {}) };
}

function webgpuNativeOnlyPasses(source: RenderTarget, postprocess: RendererPostProcessOptions): readonly LdrPostprocessPassDescriptor[] {
  if (!isHdrRenderTarget(source)) return [];
  const pipeline = postprocess.pipeline as PostPipelineOptions;
  return [{ name: "tone-mapping", options: { operator: postprocess.toneMapping === false &&
    ((pipeline.autoExposure !== undefined && pipeline.autoExposure !== false) || (pipeline.dof !== undefined && pipeline.dof !== false))
    ? "linear" : pipeline.toneMapping, exposure: pipeline.exposure } }];
}

/** An HDR effect frame still needs its authored tone or a linear output conversion. */
function withWebgpuExposureOutputPass(passes: readonly RendererPostProcessPassPlan[], postprocess: RendererPostProcessOptions,
  nativePost: WebgpuNativePostOptions | undefined): readonly RendererPostProcessPassPlan[] {
  const pipeline = postprocess.pipeline as PostPipelineOptions;
  const authored = nativePost?.nativeDepthOfField && postprocess.toneMapping !== false
    ? passes.map(pass => pass.name === "tone-mapping"
      ? { ...pass, options: { operator: pipeline.toneMapping, exposure: pipeline.exposure, ...pass.options } }
      : pass)
    : passes;
  if ((!nativePost?.autoExposure && !nativePost?.nativeDepthOfField) || postprocess.toneMapping !== false || authored.length === 0 || authored.some(pass => pass.name === "tone-mapping")) return authored;
  const index = authored[0]?.name === "bloom" ? 1 : 0;
  return [...authored.slice(0, index), { name: "tone-mapping", options: { operator: "linear", exposure: pipeline.exposure } }, ...authored.slice(index)];
}

function webgpuOutputPolicyRequested(device: RenderDevice, postprocess: RendererPostProcessOptions): boolean {
  if (device.kind !== "webgpu" || !postprocess.v2 || !postprocess.pipeline || typeof postprocess.pipeline !== "object") return false;
  const pipeline = postprocess.pipeline as PostPipelineOptions;
  return pipeline.outputColorSpace !== undefined || pipeline.alphaMode !== undefined;
}

/**
 * Check the caller's declaration before choosing any backend or fallback.
 * Legacy CPU/fused routes otherwise silently discard this pipeline policy.
 */
function postprocessPreservesAlpha(postprocess: RendererPostProcessOptions): boolean {
  const pipeline = postprocess.pipeline;
  if (!pipeline || typeof pipeline !== "object") return false;
  const { alphaMode, inputAlphaMode } = pipeline as { readonly alphaMode?: unknown; readonly inputAlphaMode?: unknown };
  if (alphaMode !== undefined && alphaMode !== "opaque" && alphaMode !== "straight" && alphaMode !== "premultiplied") {
    throw new RenderDeviceError("OUTPUT_ALPHA_MODE_UNSUPPORTED: unsupported postprocess output alpha mode", "OUTPUT_ALPHA_MODE_UNSUPPORTED", { alphaMode });
  }
  if (inputAlphaMode !== undefined && inputAlphaMode !== "premultiplied") {
    throw new RenderDeviceError("OUTPUT_INPUT_ALPHA_MODE_UNSUPPORTED: expected premultiplied scene-linear opacity", "OUTPUT_INPUT_ALPHA_MODE_UNSUPPORTED", { inputAlphaMode });
  }
  if (alphaMode === "straight" || alphaMode === "premultiplied") {
    if (inputAlphaMode !== "premultiplied") {
      throw new RenderDeviceError("OUTPUT_INPUT_ALPHA_MODE_UNAVAILABLE: alpha-preserving postprocess requires a premultiplied scene-linear source", "OUTPUT_INPUT_ALPHA_MODE_UNAVAILABLE");
    }
    return true;
  }
  if (inputAlphaMode !== undefined) {
    throw new RenderDeviceError("OUTPUT_INPUT_ALPHA_MODE_UNSUPPORTED: opaque output uses the legacy coverage contract", "OUTPUT_INPUT_ALPHA_MODE_UNSUPPORTED");
  }
  return false;
}

function assertPostprocessAlphaBackend(device: RenderDevice, postprocess: RendererPostProcessOptions, targetedOutline: readonly string[] | null): void {
  if (!postprocessPreservesAlpha(postprocess)) return;
  // WebGPU's native tone shader transforms associated RGB directly; its final
  // copy only changes output association. The CPU and legacy fused kernels have
  // the same missing unassociation. Only the WebGL2 v2 OutputPass can honor
  // the declared input contract. A targeted outline and arbitrary display
  // custom passes draw after OUT without an alpha-association warranty.
  if (device.kind !== "webgl2" || postprocess.v2 !== true || postprocess.execution === "cpu-deterministic" || (targetedOutline?.length ?? 0) > 0) {
    throw new RenderDeviceError("POSTPROCESS_OUTPUT_POLICY_UNAVAILABLE: alpha-preserving output requires the WebGL2 v2 OutputPass route without unverified post-output draws", "POSTPROCESS_OUTPUT_POLICY_UNAVAILABLE", {
      backend: device.kind,
      execution: postprocess.execution,
      v2: postprocess.v2,
      targetedOutline: (targetedOutline?.length ?? 0) > 0
    });
  }
  const pipeline = postprocess.pipeline as PostPipelineOptions;
  const scopeId = postprocess.postFrameContext?.scopeId ?? postprocess.postFrameContext?.diagnosticToken?.scopeId;
  const seen = new Set<string>();
  for (const pass of [...(pipeline.customPasses ?? []), ...registeredPostPasses()]) {
    if (pass.postScopeMatches?.(scopeId) === false || seen.has(pass.id)) continue;
    seen.add(pass.id); // Same first-descriptor-wins rule as the v2 graph.
    if (pass.insertAt === "after-tonemap" && pass.space === "display") {
      throw new RenderDeviceError("POSTPROCESS_OUTPUT_POLICY_UNAVAILABLE: a display custom pass has no alpha-association warranty", "POSTPROCESS_OUTPUT_POLICY_UNAVAILABLE", { customDisplay: true, pass: pass.id });
    }
  }
}

function webgpuOutputDefaults(device: RenderDevice, postprocess: RendererPostProcessOptions, outputTarget?: RenderTarget): Readonly<Record<string, unknown>> {
  if (device.kind !== "webgpu") return { outputColorSpace: "srgb" };
  const pipeline = postprocess.v2 && postprocess.pipeline && typeof postprocess.pipeline === "object"
    ? postprocess.pipeline as PostPipelineOptions : undefined;
  const requested = pipeline?.outputColorSpace ?? "srgb";
  if (requested !== "srgb" && requested !== "display-p3") {
    throw new RenderDeviceError("Unsupported WebGPU output color space", "WEBGPU_OUTPUT_COLOR_SPACE_UNSUPPORTED", { requested });
  }
  if (outputTarget && requested === "display-p3") {
    throw new RenderDeviceError("WebGPU cannot convert offscreen postprocess output to display-p3", "WEBGPU_OUTPUT_COLOR_SPACE_UNSUPPORTED");
  }
  let active: "srgb" | "display-p3" = "srgb";
  if (!outputTarget) {
    if (!device.negotiateOutputColorSpace) throw new RenderDeviceError("WebGPU canvas color space cannot be negotiated", "WEBGPU_OUTPUT_COLOR_SPACE_UNAVAILABLE");
    const result = device.negotiateOutputColorSpace(requested);
    if (!result || (result.active !== "srgb" && result.active !== "display-p3") || (requested === "srgb" && result.active !== "srgb")) {
      throw new RenderDeviceError("WebGPU canvas color space does not match its output transform", "WEBGPU_OUTPUT_COLOR_SPACE_UNAVAILABLE");
    }
    active = result.active;
  }
  if (!outputTarget && pipeline?.alphaMode && pipeline.alphaMode !== "opaque") {
    const active = device.getPresentationAlphaMode?.();
    if (active !== pipeline.alphaMode) throw new RenderDeviceError("Output alpha mode does not match the canvas", "OUTPUT_ALPHA_MODE_UNAVAILABLE", { requested: pipeline.alphaMode, active });
  }
  return { outputColorSpace: active,
    ...(pipeline?.toneMapping !== undefined ? { operator: pipeline.toneMapping } : {}),
    ...(pipeline?.exposure !== undefined ? { exposure: pipeline.exposure } : {}),
    ...(pipeline?.alphaMode ? { alphaMode: pipeline.alphaMode } : {}) };
}

function canFusePasses(sourceIsHdr: boolean, passes: readonly RendererPostProcessPassPlan[]): boolean {
  return passes.length > 0
    && (!sourceIsHdr || passes[0]?.name === "tone-mapping" || (passes[0]?.name === "bloom" && passes[1]?.name === "tone-mapping"))
    && passes.every((pass) => pass.name === "bloom" || pass.name === "tone-mapping" || pass.name === "color-grade" || pass.name === "depth-of-field" || pass.name === "motion-blur" || pass.name === "ssao" || pass.name === "ssr" || pass.name === "taa" || pass.name === "outline" || pass.name === "fxaa")
    && passes.every((pass, index) => {
      const previousRank = index === 0 ? -1 : ldrFusionPassRank(passes[index - 1]!.name);
      return ldrFusionPassRank(pass.name) >= previousRank;
    });
}

const FUSABLE_LDR_PASS_NAMES: ReadonlySet<string> = new Set([
  "bloom", "tone-mapping", "color-grade", "depth-of-field", "motion-blur",
  "ssao", "ssr", "taa", "outline", "fxaa"
]);

/** Pass names `canFuseLdrPostprocess` cannot route (labels the legacy-route reason).
 * "order" = all names fusable but ordering/prefix rules unmet. */
function unfusedPassNames(passes: readonly RendererPostProcessPassPlan[]): string {
  const unfused = passes.map((pass) => pass.name).filter((name) => !FUSABLE_LDR_PASS_NAMES.has(name));
  return unfused.length ? unfused.join(",") : "order";
}

/**
 * Why the PostGraph v2 seam cannot run this postprocess, or `null` when it can.
 * Both the Renderer (before it builds the frame) and `tryExecutePostGraphV2` ask,
 * so the frame route and the execution agree. A non-null reason means the
 * explicit legacy chain (compat.post "3.0", `-post`, WebGPU, cpu-deterministic)
 * encodes the frame itself.
 */
export function postV2SeamDeclineReason(
  deviceKind: string,
  postprocess: RendererPostProcessOptions,
  passes: readonly RendererPostProcessPassPlan[],
  sourceIsHdr: boolean
): string | null {
  if (postprocess.v2 !== true) return "no-v2-plan";
  if (deviceKind !== "webgl2") return "backend";
  if (!postprocess.pipeline || typeof postprocess.pipeline !== "object") return "no-pipeline";
  if (postprocess.execution === "cpu-deterministic") return "cpu-deterministic";
  if (passes.length > 0 && !canFusePasses(sourceIsHdr, passes)) return unfusedPassNames(passes);
  return null;
}

function ldrFusionPassRank(name: RendererPostProcessPassName): number {
  if (name === "bloom") return -1;
  if (name === "tone-mapping") return 0;
  if (name === "color-grade") return 1;
  if (name === "depth-of-field") return 2;
  if (name === "motion-blur") return 3;
  if (name === "ssao") return 4;
  if (name === "ssr") return 5;
  if (name === "taa") return 6;
  if (name === "outline") return 7;
  if (name === "fxaa") return 8;
  return Number.POSITIVE_INFINITY;
}

function isDepthPostprocessPass(name: RendererPostProcessPassName): name is "volumetric-light" | "depth-of-field" | "contact-shadow" | "ssao" | "ssr" {
  return name === "volumetric-light" || name === "depth-of-field" || name === "contact-shadow" || name === "ssao" || name === "ssr";
}

function postprocessPassHasDepth(options: RendererPostProcessPassPlan["options"]): boolean {
  return typeof options === "object" && options !== null && "depth" in options && Boolean((options as { readonly depth?: unknown }).depth);
}

function withRendererDepth<T extends VolumetricLightOptions | DepthOfFieldOptions | ContactShadowPostProcessOptions | SSAOOptions | SSROptions>(options: T, depth: DepthTextureBinding | undefined): T {
  return depth && !options.depth ? { ...options, depth } : options;
}

function isHdrRenderTarget(target: RenderTarget): boolean {
  return target.colorTexture.format === "rgba16f" || target.colorTexture.format === "rgba32f";
}

/** GU47 E-E: the chain's options without the outline (a targeted outline runs after the chain instead). */
function withoutOutline(postprocess: RendererPostProcessOptions): RendererPostProcessOptions {
  const { outline: _outline, ...rest } = postprocess;
  return rest;
}

export function postprocessRequiresDepthTexture(postprocess: RendererPostProcessOptions, postScopeId?: object): boolean {
  return Boolean(
    // GU47 E-E: a targeted outline tests its mask against scene depth so hidden target pixels get no ink.
    outlineTargetsOf(postprocess.outline) !== null ||
    (postprocess.volumetricLight && !postprocess.volumetricLight.depth) ||
    (postprocess.depthOfField && !postprocess.depthOfField.depth) ||
    (postprocess.contactShadow && !postprocess.contactShadow.depth) ||
    (postprocess.ssao && !postprocess.ssao.depth) ||
    (postprocess.ssr && !postprocess.ssr.depth) ||
    // PRD-03 §6.9: on the v2 route the legacy fields are not populated — the
    // depth-needing stages (S1 depth-prep feeding S2 GTAO / S4 god rays /
    // Phase-4 DOF+motion blur+SSR) live on the pipeline bag instead.
    (postprocess.v2 === true && (v2PipelineNeedsDepth(postprocess.pipeline) || v2CustomPassesNeedDepth(postprocess.pipeline, postScopeId)))
  );
}

function v2PipelineNeedsDepth(pipeline: unknown): boolean {
  if (pipeline === null || typeof pipeline !== "object") return false;
  const bag = pipeline as { ao?: unknown; godRays?: unknown; dof?: unknown; motionBlur?: unknown; ssr?: unknown; taa?: unknown; antiAliasing?: unknown };
  // S5 TAA reads linear Z for disocclusion and S1-C reads device depth for
  // camera velocity — the depth attachment is required on the forward target.
  return [bag.ao, bag.godRays, bag.dof, bag.motionBlur, bag.ssr, bag.taa].some(Boolean) || bag.antiAliasing === "taa";
}

/**
 * GU47 phase 2: a C-13 custom pass that declares a `depth` input (`effects.toon({ inkSource: "depth" })`,
 * `effects.shaderPass({ inputs: ["color", "depth"] })`) reads the scene depth: the HDR anchors bind the S1 linear depth,
 * the after-tonemap tail linearises `sceneDepth`. Both come from the forward target's depth texture, which only the
 * effects above used to request, so in a scene whose only depth reader was the custom pass the HDR driver skipped every
 * stage (`WEBGL_LDR_POSTPROCESS_DEPTH_REQUIRED`) and the tail bound no depth. Same pass set as the v2 driver reads
 * (`mergedCustomPasses`: the pipeline bag, then the page registry `app.post.addPostPass` fills).
 */
function v2CustomPassesNeedDepth(pipeline: unknown, postScopeId?: object): boolean {
  const bag = pipeline !== null && typeof pipeline === "object" ? (pipeline as { customPasses?: readonly PostPassDescriptor[] }).customPasses : undefined;
  const wantsDepth = (pass: PostPassDescriptor): boolean => pass.postScopeMatches?.(postScopeId) !== false && pass.inputs.includes("depth");
  return Boolean(bag?.some(wantsDepth)) || registeredPostPasses().some(wantsDepth);
}

export function defaultPostprocessTargetFormat(
  device: RenderDevice,
  postprocess: RendererPostProcessOptions
): Extract<RenderTargetDescriptor["format"], "rgba8" | "rgba16f" | "rgba32f"> {
  if (postprocess.toneMapping === false && !webgpuAutoExposureRequested(device, postprocess) && !webgpuDepthOfFieldRequested(device, postprocess)) return "rgba8";
  return device.info.capabilities?.includes("hdr-render-targets") ? "rgba16f" : "rgba8";
}

export function createPostprocessDiagnostics(
  postprocess: RendererPostProcessOptions | undefined,
  ownedTargets: readonly RenderTarget[],
  width: number,
  height: number,
  context: {
    readonly targetFormat?: RendererPostprocessTargetFormat;
    readonly nativeLdrPostprocess?: boolean;
    readonly rendererDepthAvailable?: boolean;
    /** The issuing device's state for this exact frame, not a cumulative stage trace. */
    readonly nativeDepthOfFieldSubmission?: NativeWebGPUDofFrameSubmission & { readonly frame: NativeWebGPUDofFrame };
  } = {}
): (RendererPostprocessDiagnostics & Pick<RenderDeviceDiagnostics, "nativeDepthOfField">) | undefined {
  if (!postprocess) return undefined;
  const passes = createRendererPostprocessPasses(postprocess);
  const targetFormat = context.targetFormat ?? postprocess.targetFormat ?? "rgba8";
  const pipeline = postprocess.v2 && postprocess.pipeline && typeof postprocess.pipeline === "object"
    ? postprocess.pipeline as PostPipelineOptions : undefined;
  const nativeFrame = postprocess.postFrameContext?.nativeDepthOfFieldFrame;
  const token = postprocess.postFrameContext?.diagnosticToken;
  const submission = context.nativeDepthOfFieldSubmission;
  const matchingSubmission = Boolean(nativeFrame && submission?.frame === nativeFrame
    && nativeFrame.scopeId === postprocess.postFrameContext?.scopeId && nativeFrame.viewId === postprocess.postFrameContext?.viewId
    && nativeFrame.frameId === postprocess.postFrameContext?.frameId
    && (!token || (token.scopeId === nativeFrame.scopeId && token.viewId === nativeFrame.viewId && token.frameId === nativeFrame.frameId)));
  const nativeDepthOfField: RenderDeviceDiagnostics["nativeDepthOfField"] =
    nativeFrame && pipeline?.dof !== undefined && pipeline.dof !== false
      ? { requested: true, depthPreparation: matchingSubmission && submission?.depthSubmitted === true ? "submitted" : "not-observed",
        effect: matchingSubmission && submission?.depthSubmitted === true && submission.effectSubmitted === true ? "submitted" : "not-observed", pixelValidation: "not-established" }
      : undefined;
  const plan = createRendererPostprocessPlanDiagnostics(postprocess, {
    sourceTargetFormat: targetFormat,
    targetFormat,
    nativeLdrPostprocess: context.nativeLdrPostprocess,
    rendererDepthAvailable: context.rendererDepthAvailable,
    width,
    height
  });
  return {
    postprocessPasses: passes.length,
    postprocessPassNames: passes.map((pass) => pass.name),
    postprocessTargetFormat: targetFormat,
    postprocessRenderTargets: ownedTargets.length,
    postprocessTextures: ownedTargets.reduce((total, target) => total + (target.colorTextures?.length ?? 1) + (target.depthTexture ? 1 : 0), 0),
    postprocessTargetWidth: width,
    postprocessTargetHeight: height,
    ...(nativeDepthOfField ? { nativeDepthOfField } : {}),
    postprocessPlan: nativeDepthOfField
      ? { ...plan, claimBoundary: "This plan covers the legacy postprocess chain. Native depth of field is reported separately by nativeDepthOfField; submission does not establish GPU validation or rendered pixels." }
      : plan
  };
}

export class RendererPostprocessPipeline {
  // One pipeline is created for each Renderer; this token does not retain it.
  private readonly chainOwner: PostChainOwner = { retired: false };

  constructor(readonly host: RendererHost) {}

  /** Pre-render twin of the `tryExecutePostGraphV2` decline check (same shared predicate); `null` = the v2 seam runs this chain. */
  v2SeamDeclineFor(postprocess: RendererPostProcessOptions): string | null {
    const format = postprocess.targetFormat ?? defaultPostprocessTargetFormat(this.host.device, postprocess);
    return postV2SeamDeclineReason(this.host.device.kind, postprocess, createRendererPostprocessPasses(postprocess), format !== "rgba8");
  }

  /**
   * Intermediate chain target. Flag-off: a fresh device target owned by the
   * frame (`ownedTargets`, disposed by the Renderer). Under `A3D_QR_TIERS`
   * (Q-03-1, #91): acquired from the C-28 pool and tracked in `pooled`, which
   * the caller releases back to the pool when the chain finishes.
   */
  private chainTarget(label: string, ownedTargets: RenderTarget[], pooled: TargetPoolLease[] | null): RenderTarget {
    if (pooled) {
      const lease = guardPostChainLease(acquireTargetPoolLease(postChainPool(this.host.device), {
        width: this.host.width,
        height: this.host.height,
        format: "rgba8",
        samples: 1,
        depth: false
      }));
      pooled.push(lease);
      return lease.target;
    }
    const target = this.host.device.createRenderTarget({
      width: this.host.width,
      height: this.host.height,
      label,
      format: "rgba8",
      depth: false
    });
    ownedTargets.push(target);
    return target;
  }

  /** Removes (and records) the flag-on CPU pixel passes; tone mapping, bloom and FXAA have their own passes. */
  private dropSkippedCpuPasses(passes: readonly RendererPostProcessPassPlan[], cpuDeterministic: boolean, token?: PostDiagnosticToken): readonly RendererPostProcessPassPlan[] {
    return passes.filter((pass) => pass.name === "tone-mapping" || pass.name === "bloom" || pass.name === "fxaa" || !this.postCpuPassSkipped(pass.name, cpuDeterministic, token));
  }

  /** Encode a linear forward target before any display-space native effects. */
  private presentLinearWebgpuCanvas(
    current: RenderTarget,
    postprocess: RendererPostProcessOptions,
    outputTarget: RenderTarget | undefined,
    nativePost: WebgpuNativePostOptions | undefined,
    outputDefaults: Readonly<Record<string, unknown>>
  ): boolean {
    const device = this.host.device;
    if (device.kind !== "webgpu" || outputTarget || current.colorTexture.format !== "rgba8" || current.colorTexture.colorSpace !== "linear" ||
        nativePost?.autoExposure || nativePost?.nativeDepthOfField) return false;
    if (postprocess.execution === "cpu-deterministic" || !device.presentLdrPostprocess) {
      throw new RenderDeviceError("Linear WebGPU canvas output requires native sRGB encoding", "WEBGPU_OUTPUT_POLICY_UNAVAILABLE");
    }
    if ((outputDefaults.alphaMode !== undefined && outputDefaults.alphaMode !== "opaque") || device.getPresentationAlphaMode?.() !== "opaque") {
      throw new RenderDeviceError("Linear WebGPU canvas output requires an opaque presentation surface", "OUTPUT_ALPHA_MODE_UNAVAILABLE");
    }
    device.presentLdrPostprocess(current, {
      passes: [{ name: "tone-mapping", options: { operator: "linear", exposure: 1, whitePoint: 1 } }],
      ...nativePost,
      toneMappingDefaults: { ...outputDefaults, alphaMode: "opaque" }
    });
    return true;
  }

  /** Every pass was skipped: present the source, or copy it to an explicit output. */
  private presentUnchanged(current: RenderTarget, outputTarget: RenderTarget | undefined): void {
    if (outputTarget) {
      this.host.device.setRenderTarget(current);
      writePostProcessPixels(this.host.device, current, outputTarget, this.host.device.readPixels(0, 0, current.width, current.height));
    } else {
      this.host.device.presentRenderTarget?.(current);
    }
  }

  /** Retry only unacknowledged releases in the requested ownership scope. */
  private retryChainTargets(scope: "owner" | "retired" | "retired-peers" = "owner", requireIdle = true): void {
    const state = postChainReleases.get(this.host.device);
    if (!state) return;
    const leases = [...state.pending].filter(([, owner]) => scope === "owner"
      ? owner === this.chainOwner
      : owner.retired && (scope === "retired" || owner !== this.chainOwner)).map(([lease]) => lease);
    if (state.releasing && (requireIdle || leases.length > 0)) {
      throw new RenderDeviceError("Postprocess target release is already in progress", "POSTPROCESS_TARGET_RELEASE_BUSY");
    }
    if (leases.length === 0) return;
    const existing = new Set(state.pending.keys());
    const errors: unknown[] = [];
    state.releasing = true;
    try {
      for (const lease of leases) {
        try {
          lease.release();
          state.released.add(lease);
          state.pending.delete(lease);
        } catch (error) {
          errors.push(error);
        }
      }
    } finally {
      state.releasing = false;
    }
    if ([...state.pending.keys()].some(lease => !existing.has(lease))) {
      errors.push(new RenderDeviceError("Postprocess target release was deferred by reentrant cleanup", "POSTPROCESS_TARGET_RELEASE_DEFERRED"));
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length > 1) throw new AggregateError(errors, "Postprocess target release failed", { cause: errors[0] });
  }

  /** Mark the pipeline retired before renderer teardown invokes callbacks. */
  retireChainOwner(): void {
    this.chainOwner.retired = true;
  }

  /** Retire and drain this renderer's completed, failed chain releases. */
  drainRetainedChainTargets(): void {
    this.retireChainOwner();
    this.retryChainTargets("owner", false);
  }

  /** At last-device-owner teardown, drain retired owners without touching live peers. */
  drainRetiredChainTargets(includeCurrent: boolean): void {
    this.retryChainTargets(includeCurrent ? "retired" : "retired-peers", false);
  }

  private releaseChainTargets(pooled: TargetPoolLease[] | null, executionFailure?: { readonly error: unknown }): void {
    if (!pooled?.length) return;
    const state = postChainReleaseState(this.host.device);
    // Transfer ownership before invoking any provider callbacks. Failed leases
    // remain reachable on the device; completed siblings must never run twice.
    for (const lease of pooled.splice(0)) {
      if (!state.released.has(lease) && !state.pending.has(lease)) state.pending.set(lease, this.chainOwner);
    }
    try {
      this.retryChainTargets();
    } catch (error) {
      if (executionFailure) {
        throw new AggregateError([executionFailure.error, error], "Postprocess execution and target release failed", { cause: executionFailure.error });
      }
      throw error;
    }
  }

  /**
   * PRD-03 C-13 / Phase 2: flag-on (`v2` + pipeline bag) on a WebGL2 device
   * routes the present through `executePostGraphWebGL2` — the device
   * internals carve (CONTRACTS §3.1) — instead of the per-pass loop. Returns
   * true when the v2 seam executed.
   */
  private tryExecutePostGraphV2(
    postprocess: RendererPostProcessOptions,
    current: RenderTarget,
    passes: readonly RendererPostProcessPassPlan[],
    outputTarget?: RenderTarget,
    v2Modules?: typeof import("../post/v2Entry")
  ): boolean {
    // Declines are reported through the §6.9 skip registry so
    // `diagnostics().output.postSkipped` names the frames that took the explicit
    // legacy chain (compat.post "3.0", `-post`, WebGPU, cpu-deterministic).
    const token = postprocess.postFrameContext?.diagnosticToken;
    const declined = postV2SeamDeclineReason(this.host.device.kind, postprocess, passes, isHdrRenderTarget(current));
    if (declined !== null) {
      if (postprocessPreservesAlpha(postprocess)) {
        throw new RenderDeviceError("POSTPROCESS_OUTPUT_POLICY_UNAVAILABLE: the requested alpha policy cannot use the legacy postprocess fallback", "POSTPROCESS_OUTPUT_POLICY_UNAVAILABLE", { reason: declined });
      }
      if (qrCoreOutputOn(rendererQrFlags(this.host.device))) recordPostSkipped(`POSTPROCESS_LEGACY_ROUTE:${declined}`, token);
      setPostGraphV2Outcome(`legacy-chain:${declined}`, token);
      return false;
    }
    const pipeline = postprocess.pipeline as PostPipelineOptions;
    warmPostV2Modules();
    v2Modules = v2Modules ?? postV2Modules;
    // Without the deferred module bag the seam runs the fused present only:
    // no v2 stage (and no C-13 custom pass) executes this frame.
    const outcome = v2Modules ? "v2" : "v2-modules-loading";
    const descriptors = passes.map((pass) => ({
      name: pass.name,
      options: pass.options as Readonly<Record<string, unknown>>
    })) as readonly LdrPostprocessPassDescriptor[];
    // Phase 4: the Renderer stamps the flag-on TemporalHistory bindings onto
    // `taa.temporal` / `motionBlur.temporal` — lift them for the v2 stages.
    const temporal =
      (postprocess.taa as { temporal?: TemporalGpuBindings } | undefined)?.temporal ??
      (postprocess.motionBlur as { temporal?: TemporalGpuBindings } | undefined)?.temporal;
    executePostGraphWebGL2(webgl2DeviceHost(this.host.device), current, {
      pipeline,
      passes: descriptors,
      ...(v2Modules ? { v2: v2Modules } : {}),
      ...(postprocess.cameraFrame ? { cameraFrame: postprocess.cameraFrame } : {}),
      ...(postprocess.postFrameContext ? { frameContext: postprocess.postFrameContext } : {}),
      ...(temporal ? { temporal } : {}),
      ...(outputTarget ? { outputTarget } : {}),
      ...(postprocess.depthRange ? { depthRange: postprocess.depthRange } : {})
    });
    setPostGraphV2Outcome(outcome, token);
    if (v2Modules && postprocess.temporal && postprocess.motionBlur) {
      const context = postprocess.postFrameContext;
      markPostV2Presented(context?.scopeId, context?.viewId, context?.frameId);
    }
    return true;
  }

  executePostprocess(postprocess: RendererPostProcessOptions, ownedTargets: RenderTarget[], outputTarget?: RenderTarget): void {
    // GU47 E-E: an outline with `targets` inks only those nodes' silhouettes, so the chain runs without the
    // full-frame luma outline and the target ink blends onto the chain's output afterwards. No `targets`: unchanged.
    const outlineTargets = outlineTargetsOf(postprocess.outline);
    assertPostprocessAlphaBackend(this.host.device, postprocess, outlineTargets);
    this.retryChainTargets();
    const pooled = qrTiersOn(this.host.device) ? [] as TargetPoolLease[] : null;
    let failure: { readonly error: unknown } | undefined;
    try {
      this.executePostprocessChain(outlineTargets ? withoutOutline(postprocess) : postprocess, ownedTargets, outputTarget, pooled);
      if (outlineTargets) this.executeOutlineTargets(postprocess, outlineTargets, ownedTargets[0], outputTarget);
    } catch (error) {
      failure = { error };
      throw error;
    } finally {
      this.releaseChainTargets(pooled, failure);
    }
  }

  /**
   * GU47 E-E: the targeted outline pass (`OutlineTargets.ts`): a mask of only the target items, then a ring of the
   * outline colour `width` px wide around the mask's visible silhouette, blended onto the final output.
   */
  private executeOutlineTargets(
    postprocess: RendererPostProcessOptions,
    targets: readonly string[],
    forwardTarget: RenderTarget | undefined,
    outputTarget: RenderTarget | undefined
  ): void {
    const device = this.host.device;
    if (device.kind === "webgpu") {
      recordPostSkipped("OUTLINE_TARGETS_WEBGL2_ONLY", postprocess.postFrameContext?.diagnosticToken);
      return;
    }
    const frame = postprocess.postFrameContext;
    const viewProjection = postprocess.cameraFrame?.viewProjectionMatrix;
    if (!frame || !viewProjection) {
      recordPostSkipped("OUTLINE_TARGETS_FRAME_CONTEXT_MISSING", postprocess.postFrameContext?.diagnosticToken);
      return;
    }
    const sceneDepth = frame.sceneDepth.available ? frame.sceneDepth.texture : null;
    // The forward target may be multisampled; its depth texture holds resolved depth only after the blit.
    if (sceneDepth && forwardTarget) webgl2DeviceHost(device)?.resolveMultisampleTarget(forwardTarget as Parameters<WebGL2DeviceHost["resolveMultisampleTarget"]>[0]);
    const outline = (typeof postprocess.outline === "object" ? postprocess.outline : {}) as OutlineTargetOptions;
    outlineTargetPassFor(device).execute({
      items: frame.items,
      timeSeconds: frame.timeSeconds,
      targets,
      viewProjectionMatrix: viewProjection,
      cameraPosition: postprocess.cameraFrame?.position,
      depthConvention: postprocess.cameraFrame?.depth,
      depthViewMatrix: postprocess.cameraFrame?.viewMatrix,
      depthRange: postprocess.cameraFrame ? { near: postprocess.cameraFrame.near, far: postprocess.cameraFrame.far } : undefined,
      width: this.host.width,
      height: this.host.height,
      ...(outline.color ? { color: outline.color } : {}),
      ...(outline.width !== undefined ? { radius: outline.width } : {}),
      ...(outline.opacity !== undefined ? { opacity: outline.opacity } : {}),
      sceneDepth,
      output: outputTarget ?? null
    });
  }

  private executePostprocessChain(postprocess: RendererPostProcessOptions, ownedTargets: RenderTarget[], outputTarget: RenderTarget | undefined, pooled: TargetPoolLease[] | null): void {
    const forwardTarget = ownedTargets[0];
    let current = forwardTarget;
    if (!current) {
      throw new RenderDeviceError("Renderer postprocess missing forward render target", "POSTPROCESS_TARGET_MISSING");
    }
    const nativePost = webgpuNativePostOptions(this.host.device, postprocess, current);
    if (webgpuOutputPolicyRequested(this.host.device, postprocess) && postprocess.execution === "cpu-deterministic") {
      throw new RenderDeviceError("WebGPU output policy requires native postprocess presentation", "WEBGPU_OUTPUT_POLICY_UNAVAILABLE");
    }
    const outputDefaults = webgpuOutputDefaults(this.host.device, postprocess, outputTarget);
    let passes = withWebgpuExposureOutputPass(guardRendererPostprocessPlan(this.host.device, postprocess, current, postprocessPassesForRoute(postprocess, nativePost)), postprocess, nativePost);
    if (passes.length === 0) {
      // §6.9: a pipeline-only frame (e.g. vignette + toneMapping:"none")
      // emits no plan passes — the v2 route still applies its stages.
      if (postprocess.v2 === true && this.tryExecutePostGraphV2(postprocess, current, passes, outputTarget)) return;
      if (this.presentLinearWebgpuCanvas(current, postprocess, outputTarget, nativePost, outputDefaults)) return;
      const outputPolicy = webgpuOutputPolicyRequested(this.host.device, postprocess);
      if ((nativePost?.nativeEffects?.length || nativePost?.autoExposure || nativePost?.nativeDepthOfField || outputPolicy) && postprocess.execution !== "cpu-deterministic" && this.host.device.presentLdrPostprocess) {
        this.host.device.presentLdrPostprocess(current, { passes: webgpuNativeOnlyPasses(current, postprocess), ...nativePost, ...(outputTarget ? { outputTarget } : {}), toneMappingDefaults: outputDefaults });
        return;
      }
      if (outputPolicy) throw new RenderDeviceError("WebGPU output policy requires native postprocess presentation", "WEBGPU_OUTPUT_POLICY_UNAVAILABLE");
      if (outputTarget) {
        this.host.device.setRenderTarget(current);
        writePostProcessPixels(this.host.device, current, outputTarget, this.host.device.readPixels(0, 0, current.width, current.height));
      } else {
        this.host.device.presentRenderTarget?.(current);
      }
      return;
    }
    if (this.tryExecutePostGraphV2(postprocess, current, passes, outputTarget)) return;
    if (this.executeFusedLdrPostprocess(current, passes, outputTarget, postprocess.execution === "cpu-deterministic", postprocess.depthRange, nativePost, outputDefaults)) return;
    if (nativePost?.nativeDepthOfField) throw new RenderDeviceError("Depth of field requires a compatible native postprocess chain", "WEBGPU_DOF_NATIVE_REQUIRED");
    if (nativePost?.autoExposure) throw new RenderDeviceError("WebGPU auto exposure requires a compatible native postprocess chain", "WEBGPU_AUTO_EXPOSURE_NATIVE_REQUIRED");
    if (nativePost?.nativeEffects?.length) throw new RenderDeviceError("Native WebGPU effects require a compatible postprocess chain", "WEBGPU_NATIVE_EFFECTS_UNAVAILABLE");
    if (webgpuOutputPolicyRequested(this.host.device, postprocess)) throw new RenderDeviceError("WebGPU output policy requires a compatible native postprocess chain", "WEBGPU_OUTPUT_POLICY_UNAVAILABLE");
    // §6.9/T0-17: flag-on CPU pixel passes are recorded and skipped before the
    // per-pass loop, so a skipped pass costs no readback (the previous
    // record-and-skip still read the frame back to copy it through).
    passes = this.dropSkippedCpuPasses(passes, postprocess.execution === "cpu-deterministic", postprocess.postFrameContext?.diagnosticToken);
    if (passes.length === 0) {
      this.presentUnchanged(current, outputTarget);
      return;
    }
    for (let index = 0; index < passes.length; index += 1) {
      const pass = passes[index]!;
      const nextPass = passes[index + 1];
      if (pass.name === "bloom" && isHdrRenderTarget(current)) {
        if (nextPass?.name !== "tone-mapping") {
          throw new RenderDeviceError("Renderer HDR bloom requires tone mapping immediately after the float bloom pass.", "HDR_BLOOM_TONEMAPPING_REQUIRED", {
            source: current.label
          });
        }
        const isCombinedLast = index + 1 === passes.length - 1;
        const target = isCombinedLast ? outputTarget : this.chainTarget("renderer-postprocess-tone-mapping", ownedTargets, pooled);
        if (target && isCombinedLast) ownedTargets.push(target);
        this.host.device.setRenderTarget(current);
        const bloomed = bloomFloatPixels(
          this.host.device.readFloatPixels(0, 0, current.width, current.height),
          current.width,
          current.height,
          pass.options as BloomOptions
        );
        const mapped = toneMapFloatPixels(
          bloomed.pixels,
          current.width,
          current.height,
          {
            outputColorSpace: "srgb",
            ...(nextPass.options as ToneMappingOptions)
          }
        );
        writePostProcessPixels(this.host.device, current, target, mapped.pixels);
        if (target) current = target;
        index += 1;
        continue;
      }
      const isLast = index === passes.length - 1;
      const target = isLast ? outputTarget : this.chainTarget(`renderer-postprocess-${pass.name}`, ownedTargets, pooled);
      if (target && isLast) ownedTargets.push(target);
      if (pass.name === "tone-mapping") {
        new ToneMappingPass({
          source: current,
          target,
          outputColorSpace: "srgb",
          ...(pass.options as ToneMappingOptions)
        }).execute({ device: this.host.device, width: this.host.width, height: this.host.height });
      } else if (pass.name === "bloom") {
        new BloomPass({
          source: current,
          target,
          ...(pass.options as BloomOptions)
        }).execute({ device: this.host.device, width: this.host.width, height: this.host.height });
      } else if (pass.name === "fxaa") {
        new FXAAPass({
          source: current,
          target,
          ...(pass.options as FXAAOptions)
        }).execute({ device: this.host.device, width: this.host.width, height: this.host.height });
      } else {
        this.executePixelPostprocessPass(pass, current, target, forwardTarget, postprocess.execution === "cpu-deterministic", postprocess.postFrameContext?.diagnosticToken);
      }
      if (target) current = target;
    }
  }

  private executeFusedLdrPostprocess(
    current: RenderTarget,
    passes: readonly RendererPostProcessPassPlan[],
    outputTarget?: RenderTarget,
    forceCpuDeterministic = false,
    depthRange?: RendererPostProcessOptions["depthRange"],
    nativePost?: WebgpuNativePostOptions,
    outputDefaults: Readonly<Record<string, unknown>> = { outputColorSpace: "srgb" }
  ): boolean {
    const nativeHdrBloom = isHdrRenderTarget(current) && passes[0]?.name === "bloom" && passes[1]?.name === "tone-mapping";
    if (nativeHdrBloom && (forceCpuDeterministic || !this.host.device.presentLdrPostprocess)) return false;
    if (!canFuseLdrPostprocess(current, passes)) return false;
    if (!forceCpuDeterministic && !this.host.device.presentLdrPostprocess && passes.some((pass) => pass.name === "depth-of-field" || pass.name === "motion-blur" || pass.name === "ssao" || pass.name === "ssr" || pass.name === "taa")) return false;
    // A caller that supplies its own `depth` array for depth-of-field/SSAO/SSR gets a plain
    // depth renderbuffer, because `postprocessRequiresDepthTexture` only requests a
    // sampleable depth texture when the renderer has to generate the depth itself. The
    // backend's fused path samples `depthTextureHandle` regardless and used to throw
    // `WEBGL_LDR_POSTPROCESS_DEPTH_REQUIRED`, failing the whole render rather than falling
    // back. Declining fusion here routes those passes through the per-pass CPU path, which
    // consumes the caller's depth directly and is the behaviour the options already imply.
    if (!forceCpuDeterministic && !current.depthTexture && passes.some((pass) => pass.name === "depth-of-field" || pass.name === "ssao" || pass.name === "ssr")) return false;
    if (!forceCpuDeterministic && this.host.device.presentLdrPostprocess) {
      this.host.device.presentLdrPostprocess(current, {
        passes: passes.map((pass) => ({
          name: pass.name,
          options: pass.options as Readonly<Record<string, unknown>>
        })) as readonly LdrPostprocessPassDescriptor[],
        ...(outputTarget ? { outputTarget } : {}),
        ...nativePost,
        toneMappingDefaults: outputDefaults,
        // CCR-03-1: real camera range for depth-gated native passes.
        ...(depthRange ? { depthRange: { near: depthRange.near, far: depthRange.far } } : {})
      });
      return true;
    }
    this.host.device.setRenderTarget(current);
    const pixels = fusedLdrPostprocessPixels(
      this.host.device.readPixels(0, 0, current.width, current.height),
      current.width,
      current.height,
      passes as readonly FusedLdrPostProcessPass[],
      {
        mutateInput: true,
        scratch: this.host.fusedLdrPostprocessScratch,
        toneMappingDefaults: { outputColorSpace: "srgb" }
      }
    );
    writePostProcessPixels(this.host.device, current, outputTarget, pixels);
    return true;
  }

  async executePostprocessAsync(postprocess: RendererPostProcessOptions, ownedTargets: RenderTarget[], outputTarget?: RenderTarget): Promise<void> {
    // GU47 E-E: same targeted-outline split as `executePostprocess`.
    const outlineTargets = outlineTargetsOf(postprocess.outline);
    assertPostprocessAlphaBackend(this.host.device, postprocess, outlineTargets);
    this.retryChainTargets();
    const pooled = qrTiersOn(this.host.device) ? [] as TargetPoolLease[] : null;
    let failure: { readonly error: unknown } | undefined;
    try {
      await this.executePostprocessChainAsync(outlineTargets ? withoutOutline(postprocess) : postprocess, ownedTargets, outputTarget, pooled);
      if (outlineTargets && !this.host.device.disposed) this.executeOutlineTargets(postprocess, outlineTargets, ownedTargets[0], outputTarget);
    } catch (error) {
      failure = { error };
      throw error;
    } finally {
      this.releaseChainTargets(pooled, failure);
    }
  }

  private async executePostprocessChainAsync(postprocess: RendererPostProcessOptions, ownedTargets: RenderTarget[], outputTarget: RenderTarget | undefined, pooled: TargetPoolLease[] | null): Promise<void> {
    const forwardTarget = ownedTargets[0];
    let current = forwardTarget;
    if (!current) {
      throw new RenderDeviceError("Renderer postprocess missing forward render target", "POSTPROCESS_TARGET_MISSING");
    }
    const nativePost = webgpuNativePostOptions(this.host.device, postprocess, current);
    if (webgpuOutputPolicyRequested(this.host.device, postprocess) && postprocess.execution === "cpu-deterministic") {
      throw new RenderDeviceError("WebGPU output policy requires native postprocess presentation", "WEBGPU_OUTPUT_POLICY_UNAVAILABLE");
    }
    const outputDefaults = webgpuOutputDefaults(this.host.device, postprocess, outputTarget);
    let passes = withWebgpuExposureOutputPass(guardRendererPostprocessPlan(this.host.device, postprocess, current, postprocessPassesForRoute(postprocess, nativePost)), postprocess, nativePost);
    if (passes.length === 0) {
      const v2ModulesEmpty = postprocess.v2 === true && this.host.device.kind === "webgl2"
        ? await import("../post/v2Entry")
        : undefined;
      if (this.host.device.disposed || (current as { disposed?: boolean }).disposed) return;
      if (postprocess.v2 === true && this.tryExecutePostGraphV2(postprocess, current, passes, outputTarget, v2ModulesEmpty)) return;
      if (this.presentLinearWebgpuCanvas(current, postprocess, outputTarget, nativePost, outputDefaults)) return;
      const outputPolicy = webgpuOutputPolicyRequested(this.host.device, postprocess);
      if ((nativePost?.nativeEffects?.length || nativePost?.autoExposure || nativePost?.nativeDepthOfField || outputPolicy) && postprocess.execution !== "cpu-deterministic" && this.host.device.presentLdrPostprocess) {
        this.host.device.presentLdrPostprocess(current, { passes: webgpuNativeOnlyPasses(current, postprocess), ...nativePost, ...(outputTarget ? { outputTarget } : {}), toneMappingDefaults: outputDefaults });
        return;
      }
      if (outputPolicy) throw new RenderDeviceError("WebGPU output policy requires native postprocess presentation", "WEBGPU_OUTPUT_POLICY_UNAVAILABLE");
      if (outputTarget) {
        this.host.device.setRenderTarget(current);
        writePostProcessPixels(this.host.device, current, outputTarget, await this.readRenderTargetPixelsAsync(current));
      } else {
        this.host.device.presentRenderTarget?.(current);
      }
      return;
    }
    // C-13 v2 seam: the ONLY import() of `post/` GPU modules in the
    // renderer — the deferred chunk the bundle gate measures. The sync
    // `executePostprocess` path runs the same carve without the bag (the
    // transitional fused mapping needs none of it).
    const v2Modules = postprocess.v2 === true && this.host.device.kind === "webgl2"
      ? await import("../post/v2Entry")
      : undefined;
    if (this.host.device.disposed || (current as { disposed?: boolean }).disposed) return;
    if (this.tryExecutePostGraphV2(postprocess, current, passes, outputTarget, v2Modules)) return;
    if (await this.executeFusedLdrPostprocessAsync(current, passes, outputTarget, postprocess.execution === "cpu-deterministic", postprocess.depthRange, nativePost, outputDefaults)) return;
    if (nativePost?.nativeDepthOfField) throw new RenderDeviceError("Depth of field requires a compatible native postprocess chain", "WEBGPU_DOF_NATIVE_REQUIRED");
    if (nativePost?.autoExposure) throw new RenderDeviceError("WebGPU auto exposure requires a compatible native postprocess chain", "WEBGPU_AUTO_EXPOSURE_NATIVE_REQUIRED");
    if (nativePost?.nativeEffects?.length) throw new RenderDeviceError("Native WebGPU effects require a compatible postprocess chain", "WEBGPU_NATIVE_EFFECTS_UNAVAILABLE");
    if (webgpuOutputPolicyRequested(this.host.device, postprocess)) throw new RenderDeviceError("WebGPU output policy requires a compatible native postprocess chain", "WEBGPU_OUTPUT_POLICY_UNAVAILABLE");
    // §6.9/T0-17: flag-on CPU pixel passes are recorded and skipped before the
    // per-pass loop, so a skipped pass costs no readback (the previous
    // record-and-skip still read the frame back to copy it through).
    passes = this.dropSkippedCpuPasses(passes, postprocess.execution === "cpu-deterministic", postprocess.postFrameContext?.diagnosticToken);
    if (passes.length === 0) {
      this.presentUnchanged(current, outputTarget);
      return;
    }
    for (let index = 0; index < passes.length; index += 1) {
      const pass = passes[index]!;
      const nextPass = passes[index + 1];
      if (pass.name === "bloom" && isHdrRenderTarget(current)) {
        if (nextPass?.name !== "tone-mapping") {
          throw new RenderDeviceError("Renderer HDR bloom requires tone mapping immediately after the float bloom pass.", "HDR_BLOOM_TONEMAPPING_REQUIRED", {
            source: current.label
          });
        }
        const isCombinedLast = index + 1 === passes.length - 1;
        const target = isCombinedLast ? outputTarget : this.chainTarget("renderer-postprocess-tone-mapping", ownedTargets, pooled);
        if (target && isCombinedLast) ownedTargets.push(target);
        const bloomed = bloomFloatPixels(
          await this.readRenderTargetFloatPixelsAsync(current),
          current.width,
          current.height,
          pass.options as BloomOptions
        );
        const mapped = toneMapFloatPixels(
          bloomed.pixels,
          current.width,
          current.height,
          {
            outputColorSpace: "srgb",
            ...(nextPass.options as ToneMappingOptions)
          }
        );
        writePostProcessPixels(this.host.device, current, target, mapped.pixels);
        if (target) current = target;
        index += 1;
        continue;
      }
      const isLast = index === passes.length - 1;
      const target = isLast ? outputTarget : this.chainTarget(`renderer-postprocess-${pass.name}`, ownedTargets, pooled);
      if (target && isLast) ownedTargets.push(target);
      if (pass.name === "tone-mapping") {
        const mapped = isHdrRenderTarget(current)
          ? toneMapFloatPixels(await this.readRenderTargetFloatPixelsAsync(current), current.width, current.height, {
              outputColorSpace: "srgb",
              ...(pass.options as ToneMappingOptions)
            })
          : toneMapPixels(await this.readRenderTargetPixelsAsync(current), current.width, current.height, {
              outputColorSpace: "srgb",
              ...(pass.options as ToneMappingOptions)
            });
        writePostProcessPixels(this.host.device, current, target, mapped.pixels);
      } else if (pass.name === "bloom") {
        const bloomed = bloomPixels(await this.readRenderTargetPixelsAsync(current), current.width, current.height, pass.options as BloomOptions);
        writePostProcessPixels(this.host.device, current, target, bloomed.pixels);
      } else if (pass.name === "fxaa") {
        const smoothed = fxaaPixels(await this.readRenderTargetPixelsAsync(current), current.width, current.height, pass.options as FXAAOptions);
        writePostProcessPixels(this.host.device, current, target, smoothed.pixels);
      } else {
        await this.executePixelPostprocessPassAsync(pass, current, target, forwardTarget, postprocess.execution === "cpu-deterministic", postprocess.postFrameContext?.diagnosticToken);
      }
      if (target) current = target;
    }
  }

  private async executeFusedLdrPostprocessAsync(
    current: RenderTarget,
    passes: readonly RendererPostProcessPassPlan[],
    outputTarget?: RenderTarget,
    forceCpuDeterministic = false,
    depthRange?: RendererPostProcessOptions["depthRange"],
    nativePost?: WebgpuNativePostOptions,
    outputDefaults: Readonly<Record<string, unknown>> = { outputColorSpace: "srgb" }
  ): Promise<boolean> {
    const nativeHdrBloom = isHdrRenderTarget(current) && passes[0]?.name === "bloom" && passes[1]?.name === "tone-mapping";
    if (nativeHdrBloom && (forceCpuDeterministic || !this.host.device.presentLdrPostprocess)) return false;
    if (!canFuseLdrPostprocess(current, passes)) return false;
    if (!forceCpuDeterministic && !this.host.device.presentLdrPostprocess && passes.some((pass) => pass.name === "depth-of-field" || pass.name === "motion-blur" || pass.name === "ssao" || pass.name === "ssr" || pass.name === "taa")) return false;
    // A caller that supplies its own `depth` array for depth-of-field/SSAO/SSR gets a plain
    // depth renderbuffer, because `postprocessRequiresDepthTexture` only requests a
    // sampleable depth texture when the renderer has to generate the depth itself. The
    // backend's fused path samples `depthTextureHandle` regardless and used to throw
    // `WEBGL_LDR_POSTPROCESS_DEPTH_REQUIRED`, failing the whole render rather than falling
    // back. Declining fusion here routes those passes through the per-pass CPU path, which
    // consumes the caller's depth directly and is the behaviour the options already imply.
    if (!forceCpuDeterministic && !current.depthTexture && passes.some((pass) => pass.name === "depth-of-field" || pass.name === "ssao" || pass.name === "ssr")) return false;
    if (!forceCpuDeterministic && this.host.device.presentLdrPostprocess) {
      this.host.device.presentLdrPostprocess(current, {
        passes: passes.map((pass) => ({
          name: pass.name,
          options: pass.options as Readonly<Record<string, unknown>>
        })) as readonly LdrPostprocessPassDescriptor[],
        ...(outputTarget ? { outputTarget } : {}),
        ...nativePost,
        toneMappingDefaults: outputDefaults,
        // CCR-03-1: real camera range for depth-gated native passes.
        ...(depthRange ? { depthRange: { near: depthRange.near, far: depthRange.far } } : {})
      });
      return true;
    }
    const pixels = fusedLdrPostprocessPixels(
      await this.readRenderTargetPixelsAsync(current),
      current.width,
      current.height,
      passes as readonly FusedLdrPostProcessPass[],
      {
        mutateInput: true,
        scratch: this.host.fusedLdrPostprocessScratch,
        toneMappingDefaults: { outputColorSpace: "srgb" }
      }
    );
    writePostProcessPixels(this.host.device, current, outputTarget, pixels);
    return true;
  }

  private executePixelPostprocessPass(pass: RendererPostProcessPassPlan, source: RenderTarget, target: RenderTarget | undefined, forwardTarget: RenderTarget, cpuDeterministic = false, token?: PostDiagnosticToken): void {
    this.host.device.setRenderTarget(source);
    const input = this.host.device.readPixels(0, 0, source.width, source.height);
    const skipped = this.postCpuPassSkipped(pass.name, cpuDeterministic, token);
    const rendererDepth = !skipped && isDepthPostprocessPass(pass.name) && !postprocessPassHasDepth(pass.options)
      ? this.readRendererOwnedDepthTexture(forwardTarget)
      : undefined;
    const result = skipped
      // §6.9 record-and-skip (T0-17/FLAG-ON-4): copy the input through so
      // the chain survives; the skip is on diagnostics().post.skipped.
      ? input
      : pass.name === "color-grade"
      ? colorGradePixels(input, source.width, source.height, pass.options as ColorGradeOptions).pixels
      : pass.name === "chromatic-aberration"
        ? chromaticAberrationPixels(input, source.width, source.height, pass.options as ChromaticAberrationOptions).pixels
        : pass.name === "film-grain"
          ? filmGrainPixels(input, source.width, source.height, pass.options as FilmGrainOptions).pixels
          : pass.name === "depth-of-field"
          ? depthOfFieldPixels(input, source.width, source.height, withRendererDepth(pass.options as DepthOfFieldOptions, rendererDepth)).pixels
          : pass.name === "volumetric-light"
            ? volumetricLightPixels(input, source.width, source.height, withRendererDepth(pass.options as VolumetricLightOptions, rendererDepth)).pixels
          : pass.name === "motion-blur"
            ? motionBlurPixels(input, source.width, source.height, pass.options as MotionBlurOptions).pixels
            : pass.name === "contact-shadow"
              ? contactShadowPixels(input, source.width, source.height, withRendererDepth(pass.options as ContactShadowPostProcessOptions, rendererDepth)).pixels
            : pass.name === "ssao"
              ? ssaoPixels(input, source.width, source.height, withRendererDepth(pass.options as SSAOOptions, rendererDepth)).pixels
              : pass.name === "ssr"
                ? ssrPixels(input, source.width, source.height, withRendererDepth(pass.options as SSROptions, rendererDepth)).pixels
                  : pass.name === "taa"
                    ? taaPixels(input, source.width, source.height, pass.options as TAAOptions).pixels
                    : pass.name === "outline"
                      ? outlinePixels(input, source.width, source.height, pass.options as OutlineOptions).pixels
                      : undefined;
    if (!result) {
      throw new RenderDeviceError("Renderer postprocess pass is outside the supported renderer pass catalog", "POSTPROCESS_PASS_UNKNOWN", {
        pass: pass.name
      });
    }
    writePostProcessPixels(this.host.device, source, target, result);
  }

  private async executePixelPostprocessPassAsync(pass: RendererPostProcessPassPlan, source: RenderTarget, target: RenderTarget | undefined, forwardTarget: RenderTarget, cpuDeterministic = false, token?: PostDiagnosticToken): Promise<void> {
    const input = await this.readRenderTargetPixelsAsync(source);
    const skipped = this.postCpuPassSkipped(pass.name, cpuDeterministic, token);
    const rendererDepth = !skipped && isDepthPostprocessPass(pass.name) && !postprocessPassHasDepth(pass.options)
      ? this.readRendererOwnedDepthTexture(forwardTarget)
      : undefined;
    const result = skipped
      ? input
      : pass.name === "color-grade"
      ? colorGradePixels(input, source.width, source.height, pass.options as ColorGradeOptions).pixels
      : pass.name === "chromatic-aberration"
        ? chromaticAberrationPixels(input, source.width, source.height, pass.options as ChromaticAberrationOptions).pixels
        : pass.name === "film-grain"
          ? filmGrainPixels(input, source.width, source.height, pass.options as FilmGrainOptions).pixels
          : pass.name === "depth-of-field"
          ? depthOfFieldPixels(input, source.width, source.height, withRendererDepth(pass.options as DepthOfFieldOptions, rendererDepth)).pixels
          : pass.name === "volumetric-light"
            ? volumetricLightPixels(input, source.width, source.height, withRendererDepth(pass.options as VolumetricLightOptions, rendererDepth)).pixels
          : pass.name === "motion-blur"
            ? motionBlurPixels(input, source.width, source.height, pass.options as MotionBlurOptions).pixels
            : pass.name === "contact-shadow"
              ? contactShadowPixels(input, source.width, source.height, withRendererDepth(pass.options as ContactShadowPostProcessOptions, rendererDepth)).pixels
            : pass.name === "ssao"
              ? ssaoPixels(input, source.width, source.height, withRendererDepth(pass.options as SSAOOptions, rendererDepth)).pixels
              : pass.name === "ssr"
                ? ssrPixels(input, source.width, source.height, withRendererDepth(pass.options as SSROptions, rendererDepth)).pixels
                  : pass.name === "taa"
                    ? taaPixels(input, source.width, source.height, pass.options as TAAOptions).pixels
                    : pass.name === "outline"
                      ? outlinePixels(input, source.width, source.height, pass.options as OutlineOptions).pixels
                      : undefined;
    if (!result) {
      throw new RenderDeviceError("Renderer postprocess pass is outside the supported renderer pass catalog", "POSTPROCESS_PASS_UNKNOWN", {
        pass: pass.name
      });
    }
    writePostProcessPixels(this.host.device, source, target, result);
  }

  /**
   * §6.9/T0-17 (FLAG-ON-4): with `A3D_QR_POST` on, a non-GPU post pass must
   * never kill the frame — every build records
   * `POSTPROCESS_PASS_NOT_GPU:<name>` and the caller copies the input
   * through (`postSkippedReasons` surfaces it into
   * `diagnostics().post.skipped`). The previous dev-only throw fired per
   * frame once the v2 seam declined.
   */
  private postCpuPassSkipped(passName: string, cpuDeterministic: boolean, token?: PostDiagnosticToken): boolean {
    const flags = rendererQrFlags(this.host?.device);
    if (!flags?.on("A3D_QR_POST") || cpuDeterministic) return false;
    recordPostSkipped(`POSTPROCESS_PASS_NOT_GPU:${passName}`, token);
    return true;
  }

  private async readRenderTargetPixelsAsync(target: RenderTarget): Promise<Uint8Array> {
    this.host.device.setRenderTarget(target);
    if (this.host.device.readPixelsAsync && target.colorTexture.format === "rgba8") {
      return this.host.device.readPixelsAsync(0, 0, target.width, target.height);
    }
    return this.host.device.readPixels(0, 0, target.width, target.height);
  }

  private async readRenderTargetFloatPixelsAsync(target: RenderTarget): Promise<Float32Array> {
    this.host.device.setRenderTarget(target);
    if (this.host.device.readFloatPixelsAsync && isHdrRenderTarget(target)) {
      return this.host.device.readFloatPixelsAsync(0, 0, target.width, target.height);
    }
    return this.host.device.readFloatPixels(0, 0, target.width, target.height);
  }

  private readRendererOwnedDepthTexture(forwardTarget: RenderTarget): DepthTextureBinding {
    if (!forwardTarget.depthTexture) {
      throw new RenderDeviceError("Renderer-owned depth postprocess requires the forward target to expose a depth texture.", "POSTPROCESS_DEPTH_TARGET_MISSING", {
        renderTarget: forwardTarget.label
      });
    }
    if (!this.host.device.readDepthPixels) {
      throw new RenderDeviceError("Renderer-owned depth postprocess requires backend depth readback.", "DEPTH_READBACK_UNSUPPORTED", {
        backend: this.host.device.kind
      });
    }
    this.host.device.setRenderTarget(forwardTarget);
    return createDepthTextureBinding({
      label: forwardTarget.depthTexture.label,
      width: forwardTarget.width,
      height: forwardTarget.height,
      // Reference passes reconstruct standard window depth.
      data: standardizeDepthReadback(this.host.device.readDepthPixels(0, 0, forwardTarget.width, forwardTarget.height), this.host.device.getDepthConvention?.())
    });
  }
}
