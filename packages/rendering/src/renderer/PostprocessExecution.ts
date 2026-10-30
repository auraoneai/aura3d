// PR 0b-2 carve-out (CONTRACTS.md §3.3) — verbatim move from Renderer.ts; 0 changed logic lines.
// File: packages/rendering/src/renderer/PostprocessExecution.ts — owner lane 03.

import type { RenderItem } from "../ForwardPass";
import { type BloomOptions, BloomPass, type ChromaticAberrationOptions, type ColorGradeOptions, type ContactShadowPostProcessOptions, type DepthOfFieldOptions, type DepthTextureBinding, type FXAAOptions, FXAAPass, type FilmGrainOptions, type FusedLdrPostProcessPass, type MotionBlurOptions, type OutlineOptions, type SSAOOptions, type SSROptions, type TAAOptions, type ToneMappingOptions, ToneMappingPass, type VolumetricLightOptions, bloomFloatPixels, bloomPixels, chromaticAberrationPixels, colorGradePixels, contactShadowPixels, createDepthTextureBinding, depthOfFieldPixels, filmGrainPixels, fusedLdrPostprocessPixels, fxaaPixels, motionBlurPixels, outlinePixels, ssaoPixels, ssrPixels, taaPixels, toneMapFloatPixels, toneMapPixels, volumetricLightPixels, writePostProcessPixels } from "../PostProcessPass";
import { type LdrPostprocessPassDescriptor, type RenderDevice, RenderDeviceError, type RenderTarget, type RenderTargetDescriptor } from "../RenderDevice";
import type { RendererPostProcessOptions, RendererPostprocessDiagnostics } from "../Renderer";
import { type RendererPostProcessPassName, type RendererPostProcessPassPlan, type RendererPostprocessTargetFormat, createRendererPostprocessPasses, createRendererPostprocessPlanDiagnostics } from "../RendererPostprocessPlan";
import type { RenderSource } from "../contracts/renderSource";
import { isIterable } from "./RenderShared";
import { rendererQrFlags } from "./FrameGraph";
import { qrCoreOutputOn } from "./qrSubFlags";
import type { RendererHost } from "./RendererHost";
import { Scene } from "@aura3d/scene";
import type { PostPipelineOptions } from "../contracts/post";
import { webgl2DeviceHost } from "../webgl2/Counters";
import type { WebGL2DeviceHost } from "../webgl2/DeviceHost";
import { type OutlineTargetOptions, outlineTargetPassFor, outlineTargetsOf } from "./OutlineTargets";
import { executePostGraphWebGL2 } from "../webgl2/LegacyPost";
import type { TemporalGpuBindings } from "../TemporalHistory";
import { recordPostSkipped } from "./postSkipped";
import { guardPostprocessPlan } from "../quality/PostprocessGuard";
import { renderTargetPoolSlot, type RenderTargetPoolLike } from "../contracts/device";
export { postProductionBuild, postSkippedReasons, recordPostSkipped, resetPostSkipped } from "./postSkipped";

/* Q-03-1 (#91, C-28/C-13, behind A3D_QR_TIERS): one C-28 pool per device for
 * the legacy chain's intermediate targets. The slot factory builds a new pool
 * per call, so the instance is cached here. */
const postChainPools = new WeakMap<RenderDevice, RenderTargetPoolLike>();

function qrTiersOn(): boolean {
  return Boolean(rendererQrFlags()?.on("A3D_QR_TIERS"));
}

function postChainPool(device: RenderDevice): RenderTargetPoolLike {
  let pool = postChainPools.get(device);
  if (!pool) {
    pool = renderTargetPoolSlot.get(rendererQrFlags())(device);
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
  if (!qrTiersOn()) return passes;
  const flags = rendererQrFlags();
  const guarded = guardPostprocessPlan(passes, {
    mode: flags?.on("A3D_QR_STRICT") ? "throw" : "drop",
    gpuFusable: Boolean(device.presentLdrPostprocess),
    hasDepthTexture: Boolean(source.depthTexture),
    cpuDeterministic: postprocess.execution === "cpu-deterministic"
  });
  for (const name of guarded.dropped) recordPostSkipped(`POSTPROCESS_PASS_DROPPED:${name}`);
  return guarded.passes;
}

/* v2 module warm cache — the sync `render()` route cannot `import()`; the
 * first flag-on frame fires it, later frames run the real S1–S12 stages. */
let postV2Modules: typeof import("../post/v2Entry") | undefined;

/* 03-S18c: what the last `tryExecutePostGraphV2` call did — "v2" when the v2
 * stages (and C-13 custom passes) ran, "v2-modules-loading" while the
 * deferred bag is still loading, or `legacy-chain:<reason>` when the seam
 * declined. `null` until a postprocess frame reached the seam (e.g. the
 * Renderer dropped the chain under core output). */
let lastPostGraphV2Outcome: string | null = null;

export function postGraphV2LastOutcome(): string | null {
  return lastPostGraphV2Outcome;
}

/** Test hook. */
export function resetPostGraphV2Outcome(): void {
  lastPostGraphV2Outcome = null;
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

export function postprocessRequiresDepthTexture(postprocess: RendererPostProcessOptions): boolean {
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
    (postprocess.v2 === true && v2PipelineNeedsDepth(postprocess.pipeline))
  );
}

function v2PipelineNeedsDepth(pipeline: unknown): boolean {
  if (pipeline === null || typeof pipeline !== "object") return false;
  const bag = pipeline as { ao?: unknown; godRays?: unknown; dof?: unknown; motionBlur?: unknown; ssr?: unknown; taa?: unknown; antiAliasing?: unknown };
  // S5 TAA reads linear Z for disocclusion and S1-C reads device depth for
  // camera velocity — the depth attachment is required on the forward target.
  return Boolean(bag.ao ?? bag.godRays ?? bag.dof ?? bag.motionBlur ?? bag.ssr ?? bag.taa) || bag.antiAliasing === "taa";
}

export function defaultPostprocessTargetFormat(
  device: RenderDevice,
  postprocess: RendererPostProcessOptions
): Extract<RenderTargetDescriptor["format"], "rgba8" | "rgba16f" | "rgba32f"> {
  if (postprocess.toneMapping === false) return "rgba8";
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
  } = {}
): RendererPostprocessDiagnostics | undefined {
  if (!postprocess) return undefined;
  const passes = createRendererPostprocessPasses(postprocess);
  const targetFormat = context.targetFormat ?? postprocess.targetFormat ?? "rgba8";
  return {
    postprocessPasses: passes.length,
    postprocessPassNames: passes.map((pass) => pass.name),
    postprocessTargetFormat: targetFormat,
    postprocessRenderTargets: ownedTargets.length,
    postprocessTextures: ownedTargets.reduce((total, target) => total + 1 + (target.depthTexture ? 1 : 0), 0),
    postprocessTargetWidth: width,
    postprocessTargetHeight: height,
    postprocessPlan: createRendererPostprocessPlanDiagnostics(postprocess, {
      sourceTargetFormat: targetFormat,
      targetFormat,
      nativeLdrPostprocess: context.nativeLdrPostprocess,
      rendererDepthAvailable: context.rendererDepthAvailable,
      width,
      height
    })
  };
}

export class RendererPostprocessPipeline {
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
  private chainTarget(label: string, ownedTargets: RenderTarget[], pooled: RenderTarget[] | null): RenderTarget {
    if (pooled) {
      const target = postChainPool(this.host.device).acquire({
        width: this.host.width,
        height: this.host.height,
        format: "rgba8",
        samples: 1,
        depth: false
      });
      pooled.push(target);
      return target;
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
  private dropSkippedCpuPasses(passes: readonly RendererPostProcessPassPlan[], cpuDeterministic: boolean): readonly RendererPostProcessPassPlan[] {
    return passes.filter((pass) => pass.name === "tone-mapping" || pass.name === "bloom" || pass.name === "fxaa" || !this.postCpuPassSkipped(pass.name, cpuDeterministic));
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

  private releaseChainTargets(pooled: RenderTarget[] | null): void {
    if (!pooled) return;
    const pool = postChainPool(this.host.device);
    for (const target of pooled) pool.release(target);
    pooled.length = 0;
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
    const declined = postV2SeamDeclineReason(this.host.device.kind, postprocess, passes, isHdrRenderTarget(current));
    if (declined !== null) {
      if (qrCoreOutputOn(rendererQrFlags())) recordPostSkipped(`POSTPROCESS_LEGACY_ROUTE:${declined}`);
      lastPostGraphV2Outcome = `legacy-chain:${declined}`;
      return false;
    }
    const pipeline = postprocess.pipeline as PostPipelineOptions;
    warmPostV2Modules();
    v2Modules = v2Modules ?? postV2Modules;
    // Without the deferred module bag the seam runs the fused present only:
    // no v2 stage (and no C-13 custom pass) executes this frame.
    lastPostGraphV2Outcome = v2Modules ? "v2" : "v2-modules-loading";
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
    return true;
  }

  executePostprocess(postprocess: RendererPostProcessOptions, ownedTargets: RenderTarget[], outputTarget?: RenderTarget): void {
    const pooled = qrTiersOn() ? [] as RenderTarget[] : null;
    // GU47 E-E: an outline with `targets` inks only those nodes' silhouettes, so the chain runs without the
    // full-frame luma outline and the target ink blends onto the chain's output afterwards. No `targets`: unchanged.
    const outlineTargets = outlineTargetsOf(postprocess.outline);
    try {
      this.executePostprocessChain(outlineTargets ? withoutOutline(postprocess) : postprocess, ownedTargets, outputTarget, pooled);
      if (outlineTargets) this.executeOutlineTargets(postprocess, outlineTargets, ownedTargets[0], outputTarget);
    } finally {
      this.releaseChainTargets(pooled);
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
      recordPostSkipped("OUTLINE_TARGETS_WEBGL2_ONLY");
      return;
    }
    const frame = postprocess.postFrameContext;
    const viewProjection = postprocess.cameraFrame?.viewProjectionMatrix;
    if (!frame || !viewProjection) {
      recordPostSkipped("OUTLINE_TARGETS_FRAME_CONTEXT_MISSING");
      return;
    }
    const sceneDepth = frame.sceneDepth.available ? frame.sceneDepth.texture : null;
    // The forward target may be multisampled; its depth texture holds resolved depth only after the blit.
    if (sceneDepth && forwardTarget) webgl2DeviceHost(device)?.resolveMultisampleTarget(forwardTarget as Parameters<WebGL2DeviceHost["resolveMultisampleTarget"]>[0]);
    const outline = (typeof postprocess.outline === "object" ? postprocess.outline : {}) as OutlineTargetOptions;
    outlineTargetPassFor(device).execute({
      items: frame.items,
      targets,
      viewProjectionMatrix: viewProjection,
      width: this.host.width,
      height: this.host.height,
      ...(outline.color ? { color: outline.color } : {}),
      ...(outline.width !== undefined ? { radius: outline.width } : {}),
      ...(outline.opacity !== undefined ? { opacity: outline.opacity } : {}),
      sceneDepth,
      output: outputTarget ?? null
    });
  }

  private executePostprocessChain(postprocess: RendererPostProcessOptions, ownedTargets: RenderTarget[], outputTarget: RenderTarget | undefined, pooled: RenderTarget[] | null): void {
    const forwardTarget = ownedTargets[0];
    let current = forwardTarget;
    if (!current) {
      throw new RenderDeviceError("Renderer postprocess missing forward render target", "POSTPROCESS_TARGET_MISSING");
    }
    let passes = guardRendererPostprocessPlan(this.host.device, postprocess, current, createRendererPostprocessPasses(postprocess));
    if (passes.length === 0) {
      // §6.9: a pipeline-only frame (e.g. vignette + toneMapping:"none")
      // emits no plan passes — the v2 route still applies its stages.
      if (postprocess.v2 === true && this.tryExecutePostGraphV2(postprocess, current, passes, outputTarget)) return;
      if (outputTarget) {
        this.host.device.setRenderTarget(current);
        writePostProcessPixels(this.host.device, current, outputTarget, this.host.device.readPixels(0, 0, current.width, current.height));
      } else {
        this.host.device.presentRenderTarget?.(current);
      }
      return;
    }
    if (this.tryExecutePostGraphV2(postprocess, current, passes, outputTarget)) return;
    if (this.executeFusedLdrPostprocess(current, passes, outputTarget, postprocess.execution === "cpu-deterministic", postprocess.depthRange)) return;
    // §6.9/T0-17: flag-on CPU pixel passes are recorded and skipped before the
    // per-pass loop, so a skipped pass costs no readback (the previous
    // record-and-skip still read the frame back to copy it through).
    passes = this.dropSkippedCpuPasses(passes, postprocess.execution === "cpu-deterministic");
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
        this.executePixelPostprocessPass(pass, current, target, forwardTarget, postprocess.execution === "cpu-deterministic");
      }
      if (target) current = target;
    }
  }

  private executeFusedLdrPostprocess(
    current: RenderTarget,
    passes: readonly RendererPostProcessPassPlan[],
    outputTarget?: RenderTarget,
    forceCpuDeterministic = false,
    depthRange?: RendererPostProcessOptions["depthRange"]
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
        toneMappingDefaults: { outputColorSpace: "srgb" },
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
    const pooled = qrTiersOn() ? [] as RenderTarget[] : null;
    // GU47 E-E: same targeted-outline split as `executePostprocess`.
    const outlineTargets = outlineTargetsOf(postprocess.outline);
    try {
      await this.executePostprocessChainAsync(outlineTargets ? withoutOutline(postprocess) : postprocess, ownedTargets, outputTarget, pooled);
      if (outlineTargets && !this.host.device.disposed) this.executeOutlineTargets(postprocess, outlineTargets, ownedTargets[0], outputTarget);
    } finally {
      this.releaseChainTargets(pooled);
    }
  }

  private async executePostprocessChainAsync(postprocess: RendererPostProcessOptions, ownedTargets: RenderTarget[], outputTarget: RenderTarget | undefined, pooled: RenderTarget[] | null): Promise<void> {
    const forwardTarget = ownedTargets[0];
    let current = forwardTarget;
    if (!current) {
      throw new RenderDeviceError("Renderer postprocess missing forward render target", "POSTPROCESS_TARGET_MISSING");
    }
    let passes = guardRendererPostprocessPlan(this.host.device, postprocess, current, createRendererPostprocessPasses(postprocess));
    if (passes.length === 0) {
      const v2ModulesEmpty = postprocess.v2 === true && this.host.device.kind === "webgl2"
        ? await import("../post/v2Entry")
        : undefined;
      if (this.host.device.disposed || (current as { disposed?: boolean }).disposed) return;
      if (v2ModulesEmpty && this.tryExecutePostGraphV2(postprocess, current, passes, outputTarget, v2ModulesEmpty)) return;
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
    if (await this.executeFusedLdrPostprocessAsync(current, passes, outputTarget, postprocess.execution === "cpu-deterministic", postprocess.depthRange)) return;
    // §6.9/T0-17: flag-on CPU pixel passes are recorded and skipped before the
    // per-pass loop, so a skipped pass costs no readback (the previous
    // record-and-skip still read the frame back to copy it through).
    passes = this.dropSkippedCpuPasses(passes, postprocess.execution === "cpu-deterministic");
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
        await this.executePixelPostprocessPassAsync(pass, current, target, forwardTarget, postprocess.execution === "cpu-deterministic");
      }
      if (target) current = target;
    }
  }

  private async executeFusedLdrPostprocessAsync(
    current: RenderTarget,
    passes: readonly RendererPostProcessPassPlan[],
    outputTarget?: RenderTarget,
    forceCpuDeterministic = false,
    depthRange?: RendererPostProcessOptions["depthRange"]
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
        toneMappingDefaults: { outputColorSpace: "srgb" },
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

  private executePixelPostprocessPass(pass: RendererPostProcessPassPlan, source: RenderTarget, target: RenderTarget | undefined, forwardTarget: RenderTarget, cpuDeterministic = false): void {
    this.host.device.setRenderTarget(source);
    const input = this.host.device.readPixels(0, 0, source.width, source.height);
    const skipped = this.postCpuPassSkipped(pass.name, cpuDeterministic);
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

  private async executePixelPostprocessPassAsync(pass: RendererPostProcessPassPlan, source: RenderTarget, target: RenderTarget | undefined, forwardTarget: RenderTarget, cpuDeterministic = false): Promise<void> {
    const input = await this.readRenderTargetPixelsAsync(source);
    const skipped = this.postCpuPassSkipped(pass.name, cpuDeterministic);
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
  private postCpuPassSkipped(passName: string, cpuDeterministic: boolean): boolean {
    const flags = rendererQrFlags();
    if (!flags?.on("A3D_QR_POST") || cpuDeterministic) return false;
    recordPostSkipped(`POSTPROCESS_PASS_NOT_GPU:${passName}`);
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
      data: this.host.device.readDepthPixels(0, 0, forwardTarget.width, forwardTarget.height)
    });
  }
}
