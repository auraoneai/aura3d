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
import type { RendererHost } from "./RendererHost";
import { Scene } from "@aura3d/scene";
import type { PostPipelineOptions } from "../contracts/post";
import { webgl2DeviceHost } from "../webgl2/Counters";
import { executePostGraphWebGL2 } from "../webgl2/LegacyPost";
import type { TemporalGpuBindings } from "../TemporalHistory";

/* v2 module warm cache — the sync `render()` route cannot `import()`; the
 * first flag-on frame fires it, later frames run the real S1–S12 stages. */
let postV2Modules: typeof import("../post/v2Entry") | undefined;
let postV2WarmStarted = false;

export function warmPostV2Modules(): void {
  if (postV2WarmStarted) return;
  postV2WarmStarted = true;
  void import("../post/v2Entry").then((modules) => {
    postV2Modules = modules;
  }).catch(() => {
    postV2WarmStarted = false;
  });
}

export function collectPostprocess(source: RenderSource | Iterable<RenderItem> | Scene): RendererPostProcessOptions | undefined {
  if (source instanceof Scene || isIterable(source)) return undefined;
  if (source.postprocess === true) return {};
  if (!source.postprocess) return undefined;
  return source.postprocess;
}

function canFuseLdrPostprocess(source: RenderTarget, passes: readonly RendererPostProcessPassPlan[]): boolean {
  const sourceIsHdr = isHdrRenderTarget(source);
  return passes.length > 0
    && (!sourceIsHdr || passes[0]?.name === "tone-mapping" || (passes[0]?.name === "bloom" && passes[1]?.name === "tone-mapping"))
    && passes.every((pass) => pass.name === "bloom" || pass.name === "tone-mapping" || pass.name === "color-grade" || pass.name === "depth-of-field" || pass.name === "motion-blur" || pass.name === "ssao" || pass.name === "ssr" || pass.name === "taa" || pass.name === "outline" || pass.name === "fxaa")
    && passes.every((pass, index) => {
      const previousRank = index === 0 ? -1 : ldrFusionPassRank(passes[index - 1]!.name);
      return ldrFusionPassRank(pass.name) >= previousRank;
    });
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

export function postprocessRequiresDepthTexture(postprocess: RendererPostProcessOptions): boolean {
  return Boolean(
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
    if (postprocess.v2 !== true || this.host.device.kind !== "webgl2") return false;
    const pipeline = postprocess.pipeline;
    if (!pipeline || typeof pipeline !== "object") return false;
    // Transitional seam: the v2 path delegates to the native fused present,
    // which only covers the fused pass names. Scenes authoring anything
    // outside that set (film-grain, chromatic-aberration, volumetric-light,
    // contact-shadow) — or requesting cpu-deterministic — keep the legacy
    // route so nothing authored is silently dropped. An empty pass list is
    // fine: pipeline-only effects (vignette/film-grain/CA) emit no plan pass.
    if (postprocess.execution === "cpu-deterministic") return false;
    if (passes.length > 0 && !canFuseLdrPostprocess(current, passes)) return false;
    warmPostV2Modules();
    v2Modules = v2Modules ?? postV2Modules;
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
      pipeline: pipeline as PostPipelineOptions,
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
    const forwardTarget = ownedTargets[0];
    let current = forwardTarget;
    if (!current) {
      throw new RenderDeviceError("Renderer postprocess missing forward render target", "POSTPROCESS_TARGET_MISSING");
    }
    const passes = createRendererPostprocessPasses(postprocess);
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
        const target = isCombinedLast ? outputTarget : this.host.device.createRenderTarget({
          width: this.host.width,
          height: this.host.height,
          label: "renderer-postprocess-tone-mapping",
          format: "rgba8",
          depth: false
        });
        if (target) ownedTargets.push(target);
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
      const target = isLast ? outputTarget : this.host.device.createRenderTarget({
        width: this.host.width,
        height: this.host.height,
        label: `renderer-postprocess-${pass.name}`,
        format: "rgba8",
        depth: false
      });
      if (target) ownedTargets.push(target);
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
    const forwardTarget = ownedTargets[0];
    let current = forwardTarget;
    if (!current) {
      throw new RenderDeviceError("Renderer postprocess missing forward render target", "POSTPROCESS_TARGET_MISSING");
    }
    const passes = createRendererPostprocessPasses(postprocess);
    if (passes.length === 0) {
      const v2ModulesEmpty = postprocess.v2 === true && this.host.device.kind === "webgl2"
        ? await import("../post/v2Entry")
        : undefined;
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
    if (this.tryExecutePostGraphV2(postprocess, current, passes, outputTarget, v2Modules)) return;
    if (await this.executeFusedLdrPostprocessAsync(current, passes, outputTarget, postprocess.execution === "cpu-deterministic", postprocess.depthRange)) return;
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
        const target = isCombinedLast ? outputTarget : this.host.device.createRenderTarget({
          width: this.host.width,
          height: this.host.height,
          label: "renderer-postprocess-tone-mapping",
          format: "rgba8",
          depth: false
        });
        if (target) ownedTargets.push(target);
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
      const target = isLast ? outputTarget : this.host.device.createRenderTarget({
        width: this.host.width,
        height: this.host.height,
        label: `renderer-postprocess-${pass.name}`,
        format: "rgba8",
        depth: false
      });
      if (target) ownedTargets.push(target);
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
    this.assertPostPassOnGpu(pass.name, cpuDeterministic);
    this.host.device.setRenderTarget(source);
    const input = this.host.device.readPixels(0, 0, source.width, source.height);
    const rendererDepth = isDepthPostprocessPass(pass.name) && !postprocessPassHasDepth(pass.options)
      ? this.readRendererOwnedDepthTexture(forwardTarget)
      : undefined;
    const result = pass.name === "color-grade"
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
    this.assertPostPassOnGpu(pass.name, cpuDeterministic);
    const input = await this.readRenderTargetPixelsAsync(source);
    const rendererDepth = isDepthPostprocessPass(pass.name) && !postprocessPassHasDepth(pass.options)
      ? this.readRendererOwnedDepthTexture(forwardTarget)
      : undefined;
    const result = pass.name === "color-grade"
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
   * §6.9: with `A3D_QR_POST` on, a non-GPU post pass is a violation unless
   * `execution === "cpu-deterministic"`. Dev builds throw
   * `POSTPROCESS_PASS_NOT_GPU`; production builds skip the pass and record it
   * (`postSkippedReasons` surfaces it into `diagnostics().post.skipped`).
   */
  private assertPostPassOnGpu(passName: string, cpuDeterministic: boolean): void {
    const flags = rendererQrFlags();
    if (!flags?.on("A3D_QR_POST") || cpuDeterministic) return;
    if (postProductionBuild()) {
      recordPostSkipped(`POSTPROCESS_PASS_NOT_GPU:${passName}`);
      return;
    }
    throw new RenderDeviceError(
      `Post pass "${passName}" has no GPU implementation on the v2 chain; set postprocess.execution = "cpu-deterministic" for the reference path.`,
      "POSTPROCESS_PASS_NOT_GPU",
      { pass: passName }
    );
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

/* §6.9 prod-skip registry — the record a production build leaves in place of
 * the dev `POSTPROCESS_PASS_NOT_GPU` throw. `postSections` folds these into
 * `diagnostics().post.skipped`. */
const postSkippedReasonsSet = new Set<string>();

export function recordPostSkipped(reason: string): void {
  postSkippedReasonsSet.add(reason);
}

export function postSkippedReasons(): readonly string[] {
  return [...postSkippedReasonsSet];
}

/** `import.meta.env.PROD` / `process.env.NODE_ENV === "production"`. */
export function postProductionBuild(): boolean {
  const meta = import.meta as unknown as { readonly env?: { readonly PROD?: boolean } };
  if (meta.env?.PROD) return true;
  return (globalThis as { readonly process?: { readonly env?: { readonly NODE_ENV?: string } } })
    .process?.env?.NODE_ENV === "production";
}
