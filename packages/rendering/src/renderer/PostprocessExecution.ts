// PR 0b-2 carve-out (CONTRACTS.md §3.3) — verbatim move from Renderer.ts; 0 changed logic lines.
// File: packages/rendering/src/renderer/PostprocessExecution.ts — owner lane 03.

import type { RenderItem } from "../ForwardPass";
import { type BloomOptions, BloomPass, type ChromaticAberrationOptions, type ColorGradeOptions, type ContactShadowPostProcessOptions, type DepthOfFieldOptions, type DepthTextureBinding, type FXAAOptions, FXAAPass, type FilmGrainOptions, type FusedLdrPostProcessPass, type MotionBlurOptions, type OutlineOptions, type SSAOOptions, type SSROptions, type TAAOptions, type ToneMappingOptions, ToneMappingPass, type VolumetricLightOptions, bloomFloatPixels, bloomPixels, chromaticAberrationPixels, colorGradePixels, contactShadowPixels, createDepthTextureBinding, depthOfFieldPixels, filmGrainPixels, fusedLdrPostprocessPixels, fxaaPixels, motionBlurPixels, outlinePixels, ssaoPixels, ssrPixels, taaPixels, toneMapFloatPixels, toneMapPixels, volumetricLightPixels, writePostProcessPixels } from "../PostProcessPass";
import { type LdrPostprocessPassDescriptor, type RenderDevice, RenderDeviceError, type RenderTarget, type RenderTargetDescriptor } from "../RenderDevice";
import type { RendererPostProcessOptions, RendererPostprocessDiagnostics } from "../Renderer";
import { type RendererPostProcessPassName, type RendererPostProcessPassPlan, type RendererPostprocessTargetFormat, createRendererPostprocessPasses, createRendererPostprocessPlanDiagnostics } from "../RendererPostprocessPlan";
import type { RenderSource } from "../contracts/renderSource";
import { isIterable } from "./RenderShared";
import type { RendererHost } from "./RendererHost";
import { Scene } from "@aura3d/scene";

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
    (postprocess.ssr && !postprocess.ssr.depth)
  );
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

  executePostprocess(postprocess: RendererPostProcessOptions, ownedTargets: RenderTarget[], outputTarget?: RenderTarget): void {
    const forwardTarget = ownedTargets[0];
    let current = forwardTarget;
    if (!current) {
      throw new RenderDeviceError("Renderer postprocess missing forward render target", "POSTPROCESS_TARGET_MISSING");
    }
    const passes = createRendererPostprocessPasses(postprocess);
    if (passes.length === 0) {
      if (outputTarget) {
        this.host.device.setRenderTarget(current);
        writePostProcessPixels(this.host.device, current, outputTarget, this.host.device.readPixels(0, 0, current.width, current.height));
      } else {
        this.host.device.presentRenderTarget?.(current);
      }
      return;
    }
    if (this.executeFusedLdrPostprocess(current, passes, outputTarget, postprocess.execution === "cpu-deterministic")) return;
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
        this.executePixelPostprocessPass(pass, current, target, forwardTarget);
      }
      if (target) current = target;
    }
  }

  private executeFusedLdrPostprocess(
    current: RenderTarget,
    passes: readonly RendererPostProcessPassPlan[],
    outputTarget?: RenderTarget,
    forceCpuDeterministic = false
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
        toneMappingDefaults: { outputColorSpace: "srgb" }
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
      if (outputTarget) {
        this.host.device.setRenderTarget(current);
        writePostProcessPixels(this.host.device, current, outputTarget, await this.readRenderTargetPixelsAsync(current));
      } else {
        this.host.device.presentRenderTarget?.(current);
      }
      return;
    }
    if (await this.executeFusedLdrPostprocessAsync(current, passes, outputTarget, postprocess.execution === "cpu-deterministic")) return;
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
        await this.executePixelPostprocessPassAsync(pass, current, target, forwardTarget);
      }
      if (target) current = target;
    }
  }

  private async executeFusedLdrPostprocessAsync(
    current: RenderTarget,
    passes: readonly RendererPostProcessPassPlan[],
    outputTarget?: RenderTarget,
    forceCpuDeterministic = false
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
        toneMappingDefaults: { outputColorSpace: "srgb" }
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

  private executePixelPostprocessPass(pass: RendererPostProcessPassPlan, source: RenderTarget, target: RenderTarget | undefined, forwardTarget: RenderTarget): void {
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

  private async executePixelPostprocessPassAsync(pass: RendererPostProcessPassPlan, source: RenderTarget, target: RenderTarget | undefined, forwardTarget: RenderTarget): Promise<void> {
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
