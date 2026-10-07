// PR 0b-2 carve-out (CONTRACTS.md §3.3) — verbatim move from WebGL2Device.ts; 0 changed logic lines.

import { invertSsrProjection } from "../ProjectionMath";
import { RenderDeviceError, resolveGpuTargetOwner, type GpuTargetInventoryEntry, type LdrPostprocessPassDescriptor, type LdrPostprocessPresentationOptions, type RenderTarget } from "../RenderDevice";
import type { TemporalGpuBindings } from "../TemporalHistory";
import { temporalAccumulationWeight } from "../TemporalMath";
import { WebGL2RenderTarget, type WebGL2BloomDiagnostics } from "../WebGL2Device";
import { normalizeBloomQualityPreset, resolveBloomPyramidBlurRadii, resolveBloomPyramidPlan, resolveBloomPyramidResponseGain, type BloomPyramidPlan, type BloomQualityPreset } from "../postprocess/NativeBloomPyramid";
import { BLOOM_BRIGHT_LUT_HEIGHT, BLOOM_BRIGHT_LUT_WIDTH, BLOOM_COMPOSITE_LUT_SIZE, OUTLINE_BLEND_LUT_WIDTH, OUTLINE_LIMB_RADIX, createBloomBrightThresholdLut, createBloomCompositeLut, createOutlineBlendLut, createOutlineGradientBound } from "../postprocess/NativeLdrEffectLuts";
import type { WebGL2TextureUnit0Snapshot, WebGL2TextureUnitBindingSnapshot } from "./ContextLifecycle";
import type { WebGL2DeviceHost } from "./DeviceHost";
// PRD-03 Phase 1 — the r185 FXAA finalize (post/shaders/fxaa.glsl.ts). The
// split is opt-in via `fxaa: { variant: "r185" }`; the legacy in-shader
// `u_hasFxaa` taps stay the default path.
import { FXAA_185_FRAGMENT_GLSL } from "../post/shaders/fxaa.glsl";
import type { PostPipelineOptions } from "../contracts/post";
import type { FrameCamera } from "../contracts/frameGraph";
import type { LdrPostprocessPassName } from "../RenderDevice";

export interface NativeBloomOptions {
  readonly threshold: number;
  readonly intensity: number;
  readonly radius: number;
  readonly quality: BloomQualityPreset;
  readonly softKnee: number;
  readonly shoulder: number;
}

export interface NativeDepthOfFieldOptions {
  readonly focusDepth: number;
  readonly focusRange: number;
  readonly maxRadius: number;
}

export interface NativeMotionBlurOptions {
  readonly samples: number;
  readonly scale: number;
  readonly velocity?: Float32Array;
  readonly temporal?: TemporalGpuBindings;
}

export interface NativeOutlineOptions {
  readonly width: number;
  readonly threshold: number;
  readonly opacity: number;
  readonly color: readonly [number, number, number, number];
}

export interface NativeSsaoOptions {
  readonly radius: number;
  readonly intensity: number;
  readonly bias: number;
}

export interface NativeSsrOptions {
  readonly intensity: number;
  readonly maxDistance: number;
  readonly maxSteps?: number;
  readonly thickness?: number;
  readonly projection?: Float32Array;
  readonly inverseProjection?: Float32Array;
  readonly normalMask?: WebGLTexture;
}

export interface NativeTaaOptions {
  readonly blend: number;
  readonly history?: Uint8Array;
  readonly temporal?: TemporalGpuBindings;
}

export interface WebGL2BloomPingPongResources {
  readonly width: number;
  readonly height: number;
  readonly hdr: boolean;
  readonly textures: readonly [WebGLTexture, WebGLTexture];
  readonly framebuffers: readonly [WebGLFramebuffer, WebGLFramebuffer];
}

export interface WebGL2BloomPyramidResources {
  readonly plan: BloomPyramidPlan;
  readonly hdr: boolean;
  readonly textures: readonly WebGLTexture[];
  readonly framebuffers: readonly WebGLFramebuffer[];
  readonly accumulatorTextureA: WebGLTexture;
  readonly accumulatorFramebufferA: WebGLFramebuffer;
  readonly accumulatorTextureB: WebGLTexture;
  readonly accumulatorFramebufferB: WebGLFramebuffer;
}

export interface WebGL2FullscreenPresentationStateSnapshot {
  readonly framebuffer: WebGLFramebuffer | null;
  readonly program: WebGLProgram | null;
  readonly textureUnit0: WebGL2TextureUnit0Snapshot;
  readonly textureUnit1: WebGL2TextureUnitBindingSnapshot;
  readonly textureUnit2: WebGL2TextureUnitBindingSnapshot;
  readonly vertexArray: WebGLVertexArrayObject | null;
  readonly viewport: Int32Array | readonly number[];
  readonly colorMask: readonly boolean[];
  readonly depthTestEnabled: boolean;
  readonly cullFaceEnabled: boolean;
  readonly blendEnabled: boolean;
  readonly scissorTestEnabled: boolean;
  readonly stencilTestEnabled: boolean;
  readonly polygonOffsetFillEnabled: boolean;
  readonly depthMask: boolean;
}

export class WebGL2LegacyPostPipeline {
  constructor(readonly host: WebGL2DeviceHost) {}

  bloomAccumulateProgram: WebGLProgram | null = null;

  bloomBlurProgram: WebGLProgram | null = null;

  bloomBrightExtractProgram: WebGLProgram | null = null;

  bloomBrightLutTexture: WebGLTexture | null = null;

  bloomBrightLutThreshold: number | null = null;

  bloomCompositeLutIntensity: number | null = null;

  bloomCompositeLutShoulder: number | null = null;

  bloomCompositeLutTexture: WebGLTexture | null = null;

  bloomCompositeProgram: WebGLProgram | null = null;

  bloomDownsampleProgram: WebGLProgram | null = null;

  bloomPingPongResources: WebGL2BloomPingPongResources | null = null;

  bloomPyramidResources: WebGL2BloomPyramidResources | null = null;

  depthOfFieldProgram: WebGLProgram | null = null;

  lastBloomDiagnostics: WebGL2BloomDiagnostics | null = null;

  ldrPostprocessProgram: WebGLProgram | null = null;

  motionBlurProgram: WebGLProgram | null = null;

  nativeFxaaFinalizeProgram: WebGLProgram | null = null;

  motionBlurVelocitySize: { readonly width: number; readonly height: number } | null = null;

  motionBlurVelocityTexture: WebGLTexture | null = null;

  outlineBlendLutKey: string | null = null;

  outlineBlendLutTexture: WebGLTexture | null = null;

  outlineProgram: WebGLProgram | null = null;

  presentationProgram: WebGLProgram | null = null;

  presentationVertexArray: WebGLVertexArrayObject | null = null;

  ssaoProgram: WebGLProgram | null = null;

  ssrProgram: WebGLProgram | null = null;

  taaHistorySize: { readonly width: number; readonly height: number } | null = null;

  taaHistoryTexture: WebGLTexture | null = null;

  taaPresentationProgram: WebGLProgram | null = null;

  taaProgram: WebGLProgram | null = null;

  presentRenderTarget(source: RenderTarget): void {
    this.host.lifecycle.assertAlive();
    if (!(source instanceof WebGL2RenderTarget) || !this.host.renderTargets.has(source) || source.disposed) {
      throw new RenderDeviceError("Render target is not a live WebGL2 resource owned by this device", "INVALID_RESOURCE", {
        targetId: source.id
      });
    }
    this.host.resolveMultisampleTarget(source);
    const outputWidth = this.host.lifecycle.viewportWidth || this.host.gl.drawingBufferWidth;
    const outputHeight = this.host.lifecycle.viewportHeight || this.host.gl.drawingBufferHeight;
    this.drawRenderTargetToBackbuffer(source, outputWidth, outputHeight);
    this.host.activeRenderTarget = null;
    this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, null);
    this.host.lifecycle.lastError = this.host.lifecycle.readError();
    if (this.host.lifecycle.lastError) {
      throw new RenderDeviceError(`WebGL2 render-target presentation failed: ${this.host.lifecycle.lastError}`, "WEBGL_PRESENT_FAILED", {
        targetId: source.id,
        error: this.host.lifecycle.lastError
      });
    }
  }

  executeReflectionSurfaceSsr(source: RenderTarget, normalMask: RenderTarget, output: RenderTarget,
    options: { projection: Float32Array; inverseProjection: Float32Array; maxSteps: number; maxDistance: number; thickness: number; intensity: number }): void {
    this.host.lifecycle.assertAlive();
    for (const target of [source, normalMask, output]) {
      if (!(target instanceof WebGL2RenderTarget) || !this.host.renderTargets.has(target) || target.disposed) {
        throw new RenderDeviceError("SSR inputs must be live targets owned by this device", "INVALID_RESOURCE");
      }
    }
    const color = source as WebGL2RenderTarget, normals = normalMask as WebGL2RenderTarget, destination = output as WebGL2RenderTarget;
    if (!color.depthTextureHandle || color === destination || normals === destination
      || color.width !== normals.width || color.height !== normals.height) {
      throw new RenderDeviceError("SSR requires sampleable scene depth, matching normal-mask input, and a separate output", "INVALID_RESOURCE");
    }
    this.host.resolveMultisampleTarget(color);
    this.host.resolveMultisampleTarget(normals);
    const state = this.prepareFullscreenPresentation(destination.framebuffer, destination.width, destination.height);
    try {
      this.drawSsrKernel(color.colorHandle, color.depthTextureHandle, destination.width, destination.height,
        { ...options, normalMask: normals.colorHandle }, this.ensurePresentationVertexArray(), { near: 0.1, far: 1000 });
    } finally {
      this.restoreFullscreenPresentationState(state, destination.width, destination.height);
    }
  }

  presentLdrPostprocess(source: RenderTarget, options: LdrPostprocessPresentationOptions): void {
    this.host.lifecycle.assertAlive();
    if (!(source instanceof WebGL2RenderTarget) || !this.host.renderTargets.has(source) || source.disposed) {
      throw new RenderDeviceError("Render target is not a live WebGL2 resource owned by this device", "INVALID_RESOURCE", {
        targetId: source.id
      });
    }
    this.host.resolveMultisampleTarget(source);
    const tonePass = options.passes.find((pass) => pass.name === "tone-mapping");
    const bloomPass = options.passes.find((pass) => pass.name === "bloom");
    const depthOfFieldPass = options.passes.find((pass) => pass.name === "depth-of-field");
    const motionBlurPass = options.passes.find((pass) => pass.name === "motion-blur");
    const ssaoPass = options.passes.find((pass) => pass.name === "ssao");
    const ssrPass = options.passes.find((pass) => pass.name === "ssr");
    const taaPass = options.passes.find((pass) => pass.name === "taa");
    const outlinePass = options.passes.find((pass) => pass.name === "outline");
    if (source.colorTexture.format !== "rgba8" && !tonePass) {
      throw new RenderDeviceError("WebGL2 HDR postprocess presentation requires a tone-mapping pass before LDR output.", "WEBGL_LDR_POSTPROCESS_FORMAT_UNSUPPORTED", {
        targetId: source.id,
        format: source.colorTexture.format
      });
    }
    if (source.colorTexture.format !== "rgba8" && (depthOfFieldPass || motionBlurPass || ssaoPass || ssrPass || taaPass || outlinePass) && !tonePass) {
      throw new RenderDeviceError("WebGL2 byte-kernel postprocess requires rgba8 input or a preceding tone-mapping pass.", "WEBGL_LDR_POSTPROCESS_FORMAT_UNSUPPORTED", {
        targetId: source.id,
        format: source.colorTexture.format,
        pass: depthOfFieldPass ? "depth-of-field" : motionBlurPass ? "motion-blur" : ssaoPass ? "ssao" : ssrPass ? "ssr" : taaPass ? "taa" : "outline"
      });
    }
    if ((depthOfFieldPass || ssaoPass || ssrPass) && !source.depthTextureHandle) {
      throw new RenderDeviceError("WebGL2 native depth postprocess requires a renderer-owned sampleable depth texture.", "WEBGL_LDR_POSTPROCESS_DEPTH_REQUIRED", {
        targetId: source.id,
        pass: depthOfFieldPass ? "depth-of-field" : ssaoPass ? "ssao" : "ssr"
      });
    }
    // Raw GL depth is nonlinear (0.1/1000 defaults park the play area past
    // 0.97), which blinded every depth-gated native pass. SSR and DOF compare
    // linearized depth; SSAO keeps its legacy response (documented partial).
    const depthRange = normalizeLdrDepthRange(options.depthRange);
    const outputTarget = options.outputTarget;
    if (outputTarget && (!(outputTarget instanceof WebGL2RenderTarget) || !this.host.renderTargets.has(outputTarget) || outputTarget.disposed)) {
      throw new RenderDeviceError("Output render target is not a live WebGL2 resource owned by this device", "INVALID_RESOURCE", {
        targetId: outputTarget.id
      });
    }
    if (outputTarget && outputTarget.colorTexture.format !== "rgba8") {
      throw new RenderDeviceError("WebGL2 LDR postprocess output target must be rgba8.", "WEBGL_LDR_POSTPROCESS_OUTPUT_FORMAT_UNSUPPORTED", {
        targetId: outputTarget.id,
        format: outputTarget.colorTexture.format
      });
    }
    if (outputTarget && (outputTarget.width !== source.width || outputTarget.height !== source.height)) {
      throw new RenderDeviceError("WebGL2 LDR postprocess source and output dimensions must match.", "WEBGL_LDR_POSTPROCESS_SIZE_MISMATCH", {
        sourceWidth: source.width,
        sourceHeight: source.height,
        targetWidth: outputTarget.width,
        targetHeight: outputTarget.height
      });
    }
    const webglOutputTarget = outputTarget as WebGL2RenderTarget | undefined;

    const colorPass = options.passes.find((pass) => pass.name === "color-grade");
    const fxaaPass = options.passes.find((pass) => pass.name === "fxaa");
    const bloomOptions = bloomPass ? normalizeNativeBloomOptions(bloomPass.options) : undefined;
    const depthOfFieldOptions = depthOfFieldPass ? normalizeNativeDepthOfFieldOptions(depthOfFieldPass.options) : undefined;
    const motionBlurOptions = motionBlurPass
      ? normalizeNativeMotionBlurOptions(motionBlurPass.options, source.width, source.height)
      : undefined;
    const ssaoOptions = ssaoPass ? normalizeNativeSsaoOptions(ssaoPass.options) : undefined;
    const ssrOptions = ssrPass ? normalizeNativeSsrOptions(ssrPass.options) : undefined;
    const taaOptions = taaPass ? normalizeNativeTaaOptions(taaPass.options, source.width, source.height) : undefined;
    const outlineOptions = outlinePass ? normalizeNativeOutlineOptions(outlinePass.options) : undefined;
    const program = this.ensureLdrPostprocessProgram();
    const vertexArray = this.ensurePresentationVertexArray();
    const sourceIsHdr = source.colorTexture.format !== "rgba8";
    // PRD-03 Phase 1: `fxaa.variant === "r185"` splits the finalize — the
    // legacy stage presents tone/grade into an RGBA8 intermediate and the
    // dedicated r185 FXAA + triangular-dither program writes the output, so
    // the FXAA taps no longer re-run `finalColorAt` per tap.
    const fxaaSplit = (fxaaPass?.options as { readonly variant?: unknown } | undefined)?.variant === "r185";
    const bloomResources = bloomOptions || depthOfFieldOptions || motionBlurOptions || ssaoOptions || ssrOptions || taaOptions || outlineOptions || fxaaSplit
      ? this.ensureBloomPingPongResources(source.width, source.height, sourceIsHdr && Boolean(bloomOptions))
      : undefined;
    if (bloomOptions && !sourceIsHdr) {
      this.ensureBloomLutTextures(bloomOptions);
    }
    if (outlineOptions) {
      this.ensureOutlineBlendLutTexture(outlineOptions);
    }
    if (motionBlurOptions?.velocity) {
      this.ensureMotionBlurVelocityTexture(source.width, source.height, motionBlurOptions.velocity);
    }
    if (taaOptions?.history) {
      this.ensureTaaHistoryTexture(source.width, source.height, taaOptions.history);
    }
    const outputWidth = webglOutputTarget?.width ?? (this.host.lifecycle.viewportWidth || this.host.gl.drawingBufferWidth);
    const outputHeight = webglOutputTarget?.height ?? (this.host.lifecycle.viewportHeight || this.host.gl.drawingBufferHeight);
    const previousState = this.prepareFullscreenPresentation(webglOutputTarget?.framebuffer ?? null, outputWidth, outputHeight);
    try {
      let ldrSourceHandle = source.colorHandle;
      let temporarySourceIndex: -1 | 0 | 1 = -1;
      if (bloomOptions && bloomResources) {
        if (bloomOptions.quality === "performance") {
          ldrSourceHandle = this.executeNativeBloomPasses(ldrSourceHandle, bloomResources, bloomOptions, vertexArray, sourceIsHdr);
          temporarySourceIndex = 1;
          this.recordBloomDiagnostics(bloomOptions, source.width, source.height, sourceIsHdr, 1);
        } else {
          const plan = resolveBloomPyramidPlan(source.width, source.height, bloomOptions.quality, sourceIsHdr);
          const pyramid = this.ensureBloomPyramidResources(plan, sourceIsHdr);
          const pyramidResult = this.executeNativeBloomPyramidPasses(
            ldrSourceHandle,
            source.width,
            source.height,
            pyramid,
            {
              textureA: bloomResources.textures[0],
              framebufferA: bloomResources.framebuffers[0],
              textureB: bloomResources.textures[1],
              framebufferB: bloomResources.framebuffers[1]
            },
            bloomOptions,
            vertexArray,
            sourceIsHdr
          );
          // The pyramid sum lands in ping-pong texture A; composite it with the
          // source through the proven single-scale composite program.
          this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, bloomResources.framebuffers[1]);
          this.host.gl.viewport(0, 0, source.width, source.height);
          const pyramidComposite = this.ensureBloomCompositeProgram();
          this.host.gl.useProgram(pyramidComposite);
          this.host.gl.bindVertexArray(vertexArray);
          this.bindFullscreenTexture(0, ldrSourceHandle);
          this.bindFullscreenTexture(1, pyramidResult);
          if (this.bloomCompositeLutTexture) this.bindFullscreenTexture(2, this.bloomCompositeLutTexture);
          this.host.gl.uniform1i(this.host.gl.getUniformLocation(pyramidComposite, "u_source"), 0);
          this.host.gl.uniform1i(this.host.gl.getUniformLocation(pyramidComposite, "u_blurred"), 1);
          this.host.gl.uniform1i(this.host.gl.getUniformLocation(pyramidComposite, "u_compositeLut"), 2);
          this.host.gl.uniform1i(this.host.gl.getUniformLocation(pyramidComposite, "u_hdr"), sourceIsHdr ? 1 : 0);
          this.host.gl.uniform1f(
            this.host.gl.getUniformLocation(pyramidComposite, "u_intensity"),
            bloomOptions.intensity * resolveBloomPyramidResponseGain(plan)
          );
          this.host.gl.drawArrays(this.host.gl.TRIANGLES, 0, 3);
          ldrSourceHandle = bloomResources.textures[1];
          // The composited result lives in texture B, so subsequent passes
          // must write texture A (index 0) to avoid sampling a bound target.
          temporarySourceIndex = 0;
          this.recordBloomDiagnostics(bloomOptions, source.width, source.height, sourceIsHdr, plan.mipCount);
        }
      }
      if ((depthOfFieldOptions || motionBlurOptions || ssaoOptions || ssrOptions || taaOptions || outlineOptions) && bloomResources) {
        if (tonePass || colorPass) {
          const baseTargetIndex = 0 as const;
          this.drawNativeLdrStage(
            ldrSourceHandle,
            bloomResources.framebuffers[baseTargetIndex],
            source.width,
            source.height,
            program,
            vertexArray,
            tonePass,
            colorPass,
            undefined,
            options.toneMappingDefaults
          );
          ldrSourceHandle = bloomResources.textures[baseTargetIndex];
          temporarySourceIndex = baseTargetIndex;
        }
        if (depthOfFieldOptions && source.depthTextureHandle) {
          const depthOfFieldTargetIndex: 0 | 1 = temporarySourceIndex === 0 ? 1 : 0;
          ldrSourceHandle = this.executeNativeDepthOfFieldPass(
            ldrSourceHandle,
            source.depthTextureHandle,
            bloomResources,
            depthOfFieldOptions,
            vertexArray,
            depthOfFieldTargetIndex,
            depthRange
          );
          temporarySourceIndex = depthOfFieldTargetIndex;
        }
        if (motionBlurOptions) {
          const motionBlurTargetIndex: 0 | 1 = temporarySourceIndex === 0 ? 1 : 0;
          ldrSourceHandle = this.executeNativeMotionBlurPass(
            ldrSourceHandle,
            bloomResources,
            motionBlurOptions,
            vertexArray,
            motionBlurTargetIndex
          );
          temporarySourceIndex = motionBlurTargetIndex;
        }
        if (ssaoOptions && source.depthTextureHandle) {
          const ssaoTargetIndex: 0 | 1 = temporarySourceIndex === 0 ? 1 : 0;
          ldrSourceHandle = this.executeNativeSsaoPass(
            ldrSourceHandle,
            source.depthTextureHandle,
            bloomResources,
            ssaoOptions,
            vertexArray,
            ssaoTargetIndex
          );
          temporarySourceIndex = ssaoTargetIndex;
        }
        if (ssrOptions && source.depthTextureHandle) {
          const ssrTargetIndex: 0 | 1 = temporarySourceIndex === 0 ? 1 : 0;
          ldrSourceHandle = this.executeNativeSsrPass(
            ldrSourceHandle,
            source.depthTextureHandle,
            bloomResources,
            ssrOptions,
            vertexArray,
            ssrTargetIndex,
            depthRange
          );
          temporarySourceIndex = ssrTargetIndex;
        }
        if (taaOptions) {
          const taaTargetIndex: 0 | 1 = temporarySourceIndex === 0 ? 1 : 0;
          ldrSourceHandle = this.executeNativeTaaPass(
            ldrSourceHandle,
            bloomResources,
            taaOptions,
            vertexArray,
            taaTargetIndex
          );
          temporarySourceIndex = taaTargetIndex;
        }
      }
      if (outlineOptions && bloomResources) {
        const outlineTargetIndex: 0 | 1 = temporarySourceIndex === 0 ? 1 : 0;
        ldrSourceHandle = this.executeNativeOutlinePasses(
          ldrSourceHandle,
          bloomResources,
          outlineOptions,
          vertexArray,
          outlineTargetIndex
        );
        temporarySourceIndex = outlineTargetIndex;
      }
      if (fxaaSplit && bloomResources) {
        const fxaaScratchIndex: 0 | 1 = temporarySourceIndex === 0 ? 1 : 0;
        this.drawNativeLdrStage(
          ldrSourceHandle,
          bloomResources.framebuffers[fxaaScratchIndex],
          source.width,
          source.height,
          program,
          vertexArray,
          depthOfFieldOptions || motionBlurOptions || ssaoOptions || ssrOptions || taaOptions || outlineOptions ? undefined : tonePass,
          depthOfFieldOptions || motionBlurOptions || ssaoOptions || ssrOptions || taaOptions || outlineOptions ? undefined : colorPass,
          undefined,
          options.toneMappingDefaults
        );
        this.executeNativeFxaaFinalize(
          bloomResources.textures[fxaaScratchIndex],
          webglOutputTarget?.framebuffer ?? null,
          outputWidth,
          outputHeight,
          source.width,
          source.height,
          vertexArray
        );
      } else {
        this.drawNativeLdrStage(
          ldrSourceHandle,
          webglOutputTarget?.framebuffer ?? null,
          outputWidth,
          outputHeight,
          program,
          vertexArray,
          depthOfFieldOptions || motionBlurOptions || ssaoOptions || ssrOptions || taaOptions || outlineOptions ? undefined : tonePass,
          depthOfFieldOptions || motionBlurOptions || ssaoOptions || ssrOptions || taaOptions || outlineOptions ? undefined : colorPass,
          fxaaPass,
          options.toneMappingDefaults
        );
      }
      this.host.gl.flush();
    } finally {
      this.restoreFullscreenPresentationState(previousState, outputWidth, outputHeight);
    }
    this.host.lifecycle.lastError = this.host.lifecycle.readError();
    if (this.host.lifecycle.lastError) {
      throw new RenderDeviceError(`WebGL2 LDR postprocess presentation failed: ${this.host.lifecycle.lastError}`, "WEBGL_LDR_POSTPROCESS_FAILED", {
        targetId: source.id,
        error: this.host.lifecycle.lastError
      });
    }
    this.host.device.setRenderTarget(webglOutputTarget ?? null);
  }

  drawRenderTargetToBackbuffer(source: WebGL2RenderTarget, outputWidth: number, outputHeight: number): void {
    const program = this.ensurePresentationProgram();
    const vertexArray = this.ensurePresentationVertexArray();
    const previousState = this.prepareFullscreenPresentation(null, outputWidth, outputHeight);
    this.host.gl.useProgram(program);
    this.host.gl.bindVertexArray(vertexArray);
    this.host.gl.activeTexture(this.host.gl.TEXTURE0);
    this.host.gl.bindTexture(this.host.gl.TEXTURE_2D, source.colorHandle);
    this.host.gl.bindSampler(0, null);
    try {
      const uniformLocation = this.host.gl.getUniformLocation(program, "u_source");
      this.host.gl.uniform1i(uniformLocation, 0);
      this.host.gl.drawArrays(this.host.gl.TRIANGLES, 0, 3);
      this.host.gl.flush();
    } finally {
      this.restoreFullscreenPresentationState(previousState, outputWidth, outputHeight);
    }
  }

  ensureBloomPingPongResources(width: number, height: number, hdr = false): WebGL2BloomPingPongResources {
    const current = this.bloomPingPongResources;
    if (current && current.width === width && current.height === height && current.hdr === hdr) {
      return current;
    }
    this.disposeBloomPingPongResources();
    this.disposeBloomPyramidResources();

    const textureUnit0 = this.host.lifecycle.captureTextureUnit0();
    const previousFramebuffer = this.host.gl.getParameter(this.host.gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const textures: WebGLTexture[] = [];
    const framebuffers: WebGLFramebuffer[] = [];
    try {
      for (let index = 0; index < 2; index += 1) {
        const texture = this.host.gl.createTexture();
        const framebuffer = this.host.gl.createFramebuffer();
        if (!texture || !framebuffer) {
          if (texture) this.host.gl.deleteTexture(texture);
          if (framebuffer) this.host.gl.deleteFramebuffer(framebuffer);
          throw new RenderDeviceError("Failed to allocate WebGL2 bloom ping-pong resources", "WEBGL_ALLOCATION_FAILED", {
            width,
            height,
            index
          });
        }
        textures.push(texture);
        framebuffers.push(framebuffer);
        this.host.gl.bindTexture(this.host.gl.TEXTURE_2D, texture);
        this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_MIN_FILTER, this.host.gl.NEAREST);
        this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_MAG_FILTER, this.host.gl.NEAREST);
        this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_WRAP_S, this.host.gl.CLAMP_TO_EDGE);
        this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_WRAP_T, this.host.gl.CLAMP_TO_EDGE);
        this.host.gl.texImage2D(this.host.gl.TEXTURE_2D, 0, hdr ? this.host.gl.RGBA16F : this.host.gl.RGBA8, width, height, 0, this.host.gl.RGBA, hdr ? this.host.gl.HALF_FLOAT : this.host.gl.UNSIGNED_BYTE, null);
        this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, framebuffer);
        this.host.gl.framebufferTexture2D(this.host.gl.FRAMEBUFFER, this.host.gl.COLOR_ATTACHMENT0, this.host.gl.TEXTURE_2D, texture, 0);
        const status = this.host.gl.checkFramebufferStatus(this.host.gl.FRAMEBUFFER);
        if (status !== this.host.gl.FRAMEBUFFER_COMPLETE) {
          throw new RenderDeviceError("WebGL2 bloom ping-pong framebuffer status is invalid", "FRAMEBUFFER_INVALID", {
            width,
            height,
            index,
            status
          });
        }
      }
      const resources: WebGL2BloomPingPongResources = {
        width,
        height,
        hdr,
        textures: [textures[0]!, textures[1]!],
        framebuffers: [framebuffers[0]!, framebuffers[1]!]
      };
      this.bloomPingPongResources = resources;
      return resources;
    } catch (error) {
      for (const texture of textures) this.host.gl.deleteTexture(texture);
      for (const framebuffer of framebuffers) this.host.gl.deleteFramebuffer(framebuffer);
      throw error;
    } finally {
      this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, previousFramebuffer);
      this.host.lifecycle.restoreTextureUnit0(textureUnit0);
      this.host.stateCache.invalidate();
    }
  }

  ensureBloomLutTextures(options: NativeBloomOptions): void {
    const updateBright = this.bloomBrightLutThreshold !== options.threshold;
    const updateComposite =
      this.bloomCompositeLutIntensity !== options.intensity ||
      this.bloomCompositeLutShoulder !== options.shoulder;
    if (this.bloomBrightLutTexture && this.bloomCompositeLutTexture && !updateBright && !updateComposite) {
      return;
    }

    const textureUnit0 = this.host.lifecycle.captureTextureUnit0();
    try {
      if (!this.bloomBrightLutTexture) {
        this.bloomBrightLutTexture = this.createNativeBloomDataTexture();
      }
      if (updateBright) {
        const pixels = createBloomBrightThresholdLut(options.threshold);
        this.host.gl.bindTexture(this.host.gl.TEXTURE_2D, this.bloomBrightLutTexture);
        this.host.gl.texImage2D(
          this.host.gl.TEXTURE_2D,
          0,
          this.host.gl.RGBA8,
          BLOOM_BRIGHT_LUT_WIDTH,
          BLOOM_BRIGHT_LUT_HEIGHT,
          0,
          this.host.gl.RGBA,
          this.host.gl.UNSIGNED_BYTE,
          pixels
        );
        this.bloomBrightLutThreshold = options.threshold;
      }

      if (!this.bloomCompositeLutTexture) {
        this.bloomCompositeLutTexture = this.createNativeBloomDataTexture();
      }
      if (updateComposite) {
        const pixels = createBloomCompositeLut(options.intensity, { shoulder: options.shoulder });
        this.host.gl.bindTexture(this.host.gl.TEXTURE_2D, this.bloomCompositeLutTexture);
        this.host.gl.texImage2D(
          this.host.gl.TEXTURE_2D,
          0,
          this.host.gl.RGBA8,
          BLOOM_COMPOSITE_LUT_SIZE,
          BLOOM_COMPOSITE_LUT_SIZE,
          0,
          this.host.gl.RGBA,
          this.host.gl.UNSIGNED_BYTE,
          pixels
        );
        this.bloomCompositeLutIntensity = options.intensity;
        this.bloomCompositeLutShoulder = options.shoulder;
      }
    } finally {
      this.host.lifecycle.restoreTextureUnit0(textureUnit0);
      this.host.stateCache.invalidate();
    }
  }

  createNativeBloomDataTexture(): WebGLTexture {
    const texture = this.host.gl.createTexture();
    if (!texture) {
      throw new RenderDeviceError("Failed to allocate WebGL2 bloom lookup texture", "WEBGL_ALLOCATION_FAILED");
    }
    this.host.gl.bindTexture(this.host.gl.TEXTURE_2D, texture);
    this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_MIN_FILTER, this.host.gl.NEAREST);
    this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_MAG_FILTER, this.host.gl.NEAREST);
    this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_WRAP_S, this.host.gl.CLAMP_TO_EDGE);
    this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_WRAP_T, this.host.gl.CLAMP_TO_EDGE);
    return texture;
  }

  ensureOutlineBlendLutTexture(options: NativeOutlineOptions): void {
    const combinedAlpha = options.opacity * (options.color[3] / 255);
    const key = `${options.color.join(",")}|${combinedAlpha}`;
    if (this.outlineBlendLutTexture && this.outlineBlendLutKey === key) return;

    const textureUnit0 = this.host.lifecycle.captureTextureUnit0();
    try {
      if (!this.outlineBlendLutTexture) {
        this.outlineBlendLutTexture = this.createNativeBloomDataTexture();
      }
      this.host.gl.bindTexture(this.host.gl.TEXTURE_2D, this.outlineBlendLutTexture);
      this.host.gl.texImage2D(
        this.host.gl.TEXTURE_2D,
        0,
        this.host.gl.RGBA8,
        OUTLINE_BLEND_LUT_WIDTH,
        1,
        0,
        this.host.gl.RGBA,
        this.host.gl.UNSIGNED_BYTE,
        createOutlineBlendLut(options.color, combinedAlpha)
      );
      this.outlineBlendLutKey = key;
    } finally {
      this.host.lifecycle.restoreTextureUnit0(textureUnit0);
      this.host.stateCache.invalidate();
    }
  }

  ensureMotionBlurVelocityTexture(width: number, height: number, velocity: Float32Array): void {
    const textureUnit0 = this.host.lifecycle.captureTextureUnit0();
    try {
      if (!this.motionBlurVelocityTexture) {
        this.motionBlurVelocityTexture = this.createNativeBloomDataTexture();
      }
      this.motionBlurVelocitySize = { width, height };
      this.host.gl.bindTexture(this.host.gl.TEXTURE_2D, this.motionBlurVelocityTexture);
      this.host.gl.texImage2D(
        this.host.gl.TEXTURE_2D,
        0,
        this.host.gl.RG32F,
        width,
        height,
        0,
        this.host.gl.RG,
        this.host.gl.FLOAT,
        velocity
      );
    } finally {
      this.host.lifecycle.restoreTextureUnit0(textureUnit0);
      this.host.stateCache.invalidate();
    }
  }

  ensureTaaHistoryTexture(width: number, height: number, history: Uint8Array): void {
    const textureUnit0 = this.host.lifecycle.captureTextureUnit0();
    try {
      if (!this.taaHistoryTexture) {
        this.taaHistoryTexture = this.createNativeBloomDataTexture();
      }
      this.taaHistorySize = { width, height };
      this.host.gl.bindTexture(this.host.gl.TEXTURE_2D, this.taaHistoryTexture);
      this.host.gl.texImage2D(
        this.host.gl.TEXTURE_2D,
        0,
        this.host.gl.RGBA8,
        width,
        height,
        0,
        this.host.gl.RGBA,
        this.host.gl.UNSIGNED_BYTE,
        history
      );
    } finally {
      this.host.lifecycle.restoreTextureUnit0(textureUnit0);
      this.host.stateCache.invalidate();
    }
  }

  drawNativeLdrStage(
    sourceTexture: WebGLTexture,
    framebuffer: WebGLFramebuffer | null,
    width: number,
    height: number,
    program: WebGLProgram,
    vertexArray: WebGLVertexArrayObject,
    tonePass: LdrPostprocessPassDescriptor | undefined,
    colorPass: LdrPostprocessPassDescriptor | undefined,
    fxaaPass: LdrPostprocessPassDescriptor | undefined,
    toneMappingDefaults: Readonly<Record<string, unknown>> | undefined
  ): void {
    const toneOptions = { ...(toneMappingDefaults ?? {}), ...(tonePass?.options ?? {}) };
    const colorOptions = colorPass?.options ?? {};
    const fxaaOptions = fxaaPass?.options ?? {};
    this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, framebuffer);
    this.host.gl.viewport(0, 0, width, height);
    this.host.gl.useProgram(program);
    this.host.gl.bindVertexArray(vertexArray);
    this.bindFullscreenTexture(0, sourceTexture);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(program, "u_source"), 0);
    this.host.gl.uniform2f(this.host.gl.getUniformLocation(program, "u_texelSize"), 1 / width, 1 / height);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(program, "u_hasToneMapping"), tonePass ? 1 : 0);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(program, "u_toneOperator"), toneMappingOperatorId(stringOption(toneOptions, "operator", "reinhard")));
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(program, "u_inputColorSpace"), colorSpaceId(stringOption(toneOptions, "inputColorSpace", "linear")));
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(program, "u_outputColorSpace"), colorSpaceId(stringOption(toneOptions, "outputColorSpace", "linear")));
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(program, "u_exposure"), numberOption(toneOptions, "exposure", 1));
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(program, "u_whitePoint"), Math.max(0.0001, numberOption(toneOptions, "whitePoint", 1)));
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(program, "u_gamma"), Math.max(0.0001, numberOption(toneOptions, "gamma", 2.2)));
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(program, "u_hasColorGrade"), colorPass ? 1 : 0);
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(program, "u_contrast"), numberOption(colorOptions, "contrast", 1));
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(program, "u_temperature"), numberOption(colorOptions, "temperature", 0));
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(program, "u_tint"), numberOption(colorOptions, "tint", 0));
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(program, "u_saturation"), numberOption(colorOptions, "saturation", 1));
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(program, "u_vibrance"), numberOption(colorOptions, "vibrance", 0));
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(program, "u_vignette"), numberOption(colorOptions, "vignette", 0));
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(program, "u_sharpening"), numberOption(colorOptions, "sharpening", 0));
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(program, "u_hasFxaa"), fxaaPass ? 1 : 0);
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(program, "u_edgeThreshold"), numberOption(fxaaOptions, "edgeThreshold", 0.125));
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(program, "u_subpixelBlend"), numberOption(fxaaOptions, "subpixelBlend", 0.75));
    this.host.gl.drawArrays(this.host.gl.TRIANGLES, 0, 3);
  }

  executeNativeBloomPasses(
    sourceTexture: WebGLTexture,
    resources: WebGL2BloomPingPongResources,
    options: NativeBloomOptions,
    vertexArray: WebGLVertexArrayObject,
    hdr: boolean
  ): WebGLTexture {
    const brightLut = this.bloomBrightLutTexture;
    const compositeLut = this.bloomCompositeLutTexture;
    if (!hdr && (!brightLut || !compositeLut)) {
      throw new RenderDeviceError("WebGL2 bloom lookup textures were not initialized", "WEBGL_ALLOCATION_FAILED");
    }
    const [textureA, textureB] = resources.textures;
    const [framebufferA, framebufferB] = resources.framebuffers;

    const brightProgram = this.ensureBloomBrightExtractProgram();
    this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, framebufferA);
    this.host.gl.viewport(0, 0, resources.width, resources.height);
    this.host.gl.useProgram(brightProgram);
    this.host.gl.bindVertexArray(vertexArray);
    this.bindFullscreenTexture(0, sourceTexture);
    if (brightLut) this.bindFullscreenTexture(1, brightLut);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(brightProgram, "u_source"), 0);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(brightProgram, "u_brightLut"), 1);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(brightProgram, "u_hdr"), hdr ? 1 : 0);
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(brightProgram, "u_threshold"), options.threshold);
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(brightProgram, "u_softKnee"), options.softKnee);
    this.host.gl.drawArrays(this.host.gl.TRIANGLES, 0, 3);

    const blurProgram = this.ensureBloomBlurProgram();
    this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, framebufferB);
    this.host.gl.useProgram(blurProgram);
    this.bindFullscreenTexture(0, textureA);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(blurProgram, "u_source"), 0);
    this.host.gl.uniform2i(this.host.gl.getUniformLocation(blurProgram, "u_size"), resources.width, resources.height);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(blurProgram, "u_radius"), options.radius);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(blurProgram, "u_horizontal"), 1);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(blurProgram, "u_hdr"), hdr ? 1 : 0);
    this.host.gl.drawArrays(this.host.gl.TRIANGLES, 0, 3);

    this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, framebufferA);
    this.bindFullscreenTexture(0, textureB);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(blurProgram, "u_horizontal"), 0);
    this.host.gl.drawArrays(this.host.gl.TRIANGLES, 0, 3);

    const compositeProgram = this.ensureBloomCompositeProgram();
    this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, framebufferB);
    this.host.gl.useProgram(compositeProgram);
    this.bindFullscreenTexture(0, sourceTexture);
    this.bindFullscreenTexture(1, textureA);
    if (compositeLut) this.bindFullscreenTexture(2, compositeLut);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(compositeProgram, "u_source"), 0);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(compositeProgram, "u_blurred"), 1);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(compositeProgram, "u_compositeLut"), 2);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(compositeProgram, "u_hdr"), hdr ? 1 : 0);
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(compositeProgram, "u_intensity"), options.intensity);
    this.host.gl.drawArrays(this.host.gl.TRIANGLES, 0, 3);
    return textureB;
  }

  executeNativeBloomPyramidPasses(
    sourceTexture: WebGLTexture,
    sourceWidth: number,
    sourceHeight: number,
    resources: WebGL2BloomPyramidResources,
    fullResStaging: {
      textureA: WebGLTexture;
      framebufferA: WebGLFramebuffer;
      textureB: WebGLTexture;
      framebufferB: WebGLFramebuffer;
    },
    options: NativeBloomOptions,
    vertexArray: WebGLVertexArrayObject,
    hdr: boolean
  ): WebGLTexture {
    const plan = resources.plan;
    const mipCount = plan.mips.length;
    const blurRadii = resolveBloomPyramidBlurRadii(plan, options.radius);
    const downsampleProgram = this.ensureBloomDownsampleProgram();
    const brightProgram = this.ensureBloomBrightExtractProgram();
    const blurProgram = this.ensureBloomBlurProgram();
    const accumulateProgram = this.ensureBloomAccumulateProgram();
    const brightLut = this.bloomBrightLutTexture;

    const mipTexture = (level: number, slot: 0 | 1): WebGLTexture => resources.textures[level * 2 + slot]!;
    const mipFramebuffer = (level: number, slot: 0 | 1): WebGLFramebuffer => resources.framebuffers[level * 2 + slot]!;
    const mipSize = (level: number): { width: number; height: number } => plan.mips[level]!;
    // Every level settles in slot 0 after the vertical blur.
    const blurredSlot = (_level: number): 0 | 1 => 0;

    const drawDownsample = (
      fromTexture: WebGLTexture,
      fromWidth: number,
      fromHeight: number,
      toFramebuffer: WebGLFramebuffer,
      toWidth: number,
      toHeight: number
    ): void => {
      this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, toFramebuffer);
      this.host.gl.viewport(0, 0, toWidth, toHeight);
      this.host.gl.useProgram(downsampleProgram);
      this.host.gl.bindVertexArray(vertexArray);
      this.bindFullscreenTexture(0, fromTexture);
      this.host.gl.uniform1i(this.host.gl.getUniformLocation(downsampleProgram, "u_source"), 0);
      this.host.gl.uniform2f(
        this.host.gl.getUniformLocation(downsampleProgram, "u_texelSize"),
        1 / fromWidth,
        1 / fromHeight
      );
      this.host.gl.uniform2f(
        this.host.gl.getUniformLocation(downsampleProgram, "u_targetSize"),
        toWidth,
        toHeight
      );
      this.host.gl.drawArrays(this.host.gl.TRIANGLES, 0, 3);
    };

    const drawBrightExtract = (fromTexture: WebGLTexture, toFramebuffer: WebGLFramebuffer, size: { width: number; height: number }): void => {
      this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, toFramebuffer);
      this.host.gl.viewport(0, 0, size.width, size.height);
      this.host.gl.useProgram(brightProgram);
      this.host.gl.bindVertexArray(vertexArray);
      this.bindFullscreenTexture(0, fromTexture);
      if (brightLut) this.bindFullscreenTexture(1, brightLut);
      this.host.gl.uniform1i(this.host.gl.getUniformLocation(brightProgram, "u_source"), 0);
      this.host.gl.uniform1i(this.host.gl.getUniformLocation(brightProgram, "u_brightLut"), 1);
      this.host.gl.uniform1i(this.host.gl.getUniformLocation(brightProgram, "u_hdr"), hdr ? 1 : 0);
      this.host.gl.uniform1f(this.host.gl.getUniformLocation(brightProgram, "u_threshold"), options.threshold);
      this.host.gl.uniform1f(this.host.gl.getUniformLocation(brightProgram, "u_softKnee"), options.softKnee);
      this.host.gl.drawArrays(this.host.gl.TRIANGLES, 0, 3);
    };

    const drawSeparableBlur = (
      readTexture: WebGLTexture,
      tmpTexture: WebGLTexture,
      tmpFramebuffer: WebGLFramebuffer,
      outFramebuffer: WebGLFramebuffer,
      size: { width: number; height: number },
      radius: number
    ): void => {
      // Horizontal into the temp target, vertical back into the output target.
      this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, tmpFramebuffer);
      this.host.gl.viewport(0, 0, size.width, size.height);
      this.host.gl.useProgram(blurProgram);
      this.host.gl.bindVertexArray(vertexArray);
      this.bindFullscreenTexture(0, readTexture);
      this.host.gl.uniform1i(this.host.gl.getUniformLocation(blurProgram, "u_source"), 0);
      this.host.gl.uniform2i(this.host.gl.getUniformLocation(blurProgram, "u_size"), size.width, size.height);
      this.host.gl.uniform1i(this.host.gl.getUniformLocation(blurProgram, "u_radius"), radius);
      this.host.gl.uniform1i(this.host.gl.getUniformLocation(blurProgram, "u_horizontal"), 1);
      this.host.gl.uniform1i(this.host.gl.getUniformLocation(blurProgram, "u_hdr"), hdr ? 1 : 0);
      this.host.gl.drawArrays(this.host.gl.TRIANGLES, 0, 3);
      this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, outFramebuffer);
      this.bindFullscreenTexture(0, tmpTexture);
      this.host.gl.uniform1i(this.host.gl.getUniformLocation(blurProgram, "u_horizontal"), 0);
      this.host.gl.drawArrays(this.host.gl.TRIANGLES, 0, 3);
    };

    // Extract highlights at the source resolution before the first downsample.
    // Downsampling the complete scene first averaged narrow emissive sources
    // below the authored threshold, so balanced/cinematic bloom could execute
    // all native passes yet remain pixel-identical to disabled output.
    this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, fullResStaging.framebufferA);
    this.host.gl.viewport(0, 0, sourceWidth, sourceHeight);
    this.host.gl.useProgram(brightProgram);
    this.host.gl.bindVertexArray(vertexArray);
    this.bindFullscreenTexture(0, sourceTexture);
    if (brightLut) this.bindFullscreenTexture(1, brightLut);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(brightProgram, "u_source"), 0);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(brightProgram, "u_brightLut"), 1);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(brightProgram, "u_hdr"), hdr ? 1 : 0);
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(brightProgram, "u_threshold"), options.threshold);
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(brightProgram, "u_softKnee"), options.softKnee);
    this.host.gl.drawArrays(this.host.gl.TRIANGLES, 0, 3);

    // Level 0 downsamples the extracted highlight field, then blurs H into
    // slot 1 and V back into slot 0. The result therefore settles in slot 0.
    const level0 = mipSize(0);
    drawDownsample(fullResStaging.textureA, sourceWidth, sourceHeight, mipFramebuffer(0, 0), level0.width, level0.height);
    drawSeparableBlur(mipTexture(0, 0), mipTexture(0, 1), mipFramebuffer(0, 1), mipFramebuffer(0, 0), level0, blurRadii[0]!);

    for (let level = 1; level < mipCount; level += 1) {
      const size = mipSize(level);
      const previous = mipSize(level - 1);
      drawDownsample(mipTexture(level - 1, blurredSlot(level - 1)), previous.width, previous.height, mipFramebuffer(level, 0), size.width, size.height);
      // H into slot 1, V back into slot 0: blurred result settles in slot 0.
      drawSeparableBlur(mipTexture(level, 0), mipTexture(level, 1), mipFramebuffer(level, 1), mipFramebuffer(level, 0), size, blurRadii[level]!);
    }

    // Accumulate smallest-to-largest, ping-ponging between the two
    // accumulators (a pass must never sample its own bound target).
    const weights = plan.weights;
    let readAccumulator = { texture: resources.accumulatorTextureA, framebuffer: resources.accumulatorFramebufferA };
    let writeAccumulator = { texture: resources.accumulatorTextureB, framebuffer: resources.accumulatorFramebufferB };
    // Clear both accumulators; the seed reads the cleared sibling, never the
    // bound target (feedback loop).
    for (const acc of [readAccumulator, writeAccumulator]) {
      this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, acc.framebuffer);
      this.host.gl.viewport(0, 0, level0.width, level0.height);
      this.host.gl.clearColor(0, 0, 0, 0);
      this.host.gl.clear(this.host.gl.COLOR_BUFFER_BIT);
    }
    // Seed: smallest mip onto the cleared sibling accumulator.
    this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, writeAccumulator.framebuffer);
    this.host.gl.viewport(0, 0, level0.width, level0.height);
    this.host.gl.useProgram(accumulateProgram);
    this.host.gl.bindVertexArray(vertexArray);
    this.bindFullscreenTexture(0, readAccumulator.texture);
    this.bindFullscreenTexture(1, mipTexture(mipCount - 1, blurredSlot(mipCount - 1)));
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(accumulateProgram, "u_base"), 0);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(accumulateProgram, "u_bloom"), 1);
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(accumulateProgram, "u_weight"), weights[mipCount - 1]!);
    this.host.gl.drawArrays(this.host.gl.TRIANGLES, 0, 3);
    for (let level = mipCount - 2; level >= 0; level -= 1) {
      const nextRead = writeAccumulator;
      const nextWrite = readAccumulator;
      readAccumulator = nextRead;
      writeAccumulator = nextWrite;
      this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, writeAccumulator.framebuffer);
      this.host.gl.viewport(0, 0, level0.width, level0.height);
      this.host.gl.useProgram(accumulateProgram);
      this.host.gl.bindVertexArray(vertexArray);
      this.bindFullscreenTexture(0, readAccumulator.texture);
      this.bindFullscreenTexture(1, mipTexture(level, blurredSlot(level)));
      this.host.gl.uniform1i(this.host.gl.getUniformLocation(accumulateProgram, "u_base"), 0);
      this.host.gl.uniform1i(this.host.gl.getUniformLocation(accumulateProgram, "u_bloom"), 1);
      this.host.gl.uniform1f(this.host.gl.getUniformLocation(accumulateProgram, "u_weight"), weights[level]!);
      this.host.gl.drawArrays(this.host.gl.TRIANGLES, 0, 3);
    }
    // Upsample the weighted sum onto full-resolution staging target A, using
    // the cleared staging target B as the zero base (never sample A while
    // rendering into it).
    this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, fullResStaging.framebufferB);
    this.host.gl.viewport(0, 0, sourceWidth, sourceHeight);
    this.host.gl.clearColor(0, 0, 0, 0);
    this.host.gl.clear(this.host.gl.COLOR_BUFFER_BIT);
    this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, fullResStaging.framebufferA);
    this.host.gl.viewport(0, 0, sourceWidth, sourceHeight);
    this.host.gl.useProgram(accumulateProgram);
    this.host.gl.bindVertexArray(vertexArray);
    this.bindFullscreenTexture(0, fullResStaging.textureB);
    this.bindFullscreenTexture(1, writeAccumulator.texture);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(accumulateProgram, "u_base"), 0);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(accumulateProgram, "u_bloom"), 1);
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(accumulateProgram, "u_weight"), 1);
    this.host.gl.drawArrays(this.host.gl.TRIANGLES, 0, 3);
    return fullResStaging.textureA;
  }

  executeNativeOutlinePasses(
    sourceTexture: WebGLTexture,
    resources: WebGL2BloomPingPongResources,
    options: NativeOutlineOptions,
    vertexArray: WebGLVertexArrayObject,
    targetIndex: 0 | 1
  ): WebGLTexture {
    const blendLut = this.outlineBlendLutTexture;
    if (!blendLut) {
      throw new RenderDeviceError("WebGL2 outline lookup texture was not initialized", "WEBGL_ALLOCATION_FAILED");
    }
    const program = this.ensureOutlineProgram();
    const targetTexture = resources.textures[targetIndex];
    const targetFramebuffer = resources.framebuffers[targetIndex];
    const bound = createOutlineGradientBound(options.threshold);
    this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, targetFramebuffer);
    this.host.gl.viewport(0, 0, resources.width, resources.height);
    this.host.gl.useProgram(program);
    this.host.gl.bindVertexArray(vertexArray);
    this.bindFullscreenTexture(0, sourceTexture);
    this.bindFullscreenTexture(1, blendLut);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(program, "u_source"), 0);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(program, "u_blendLut"), 1);
    this.host.gl.uniform2i(this.host.gl.getUniformLocation(program, "u_size"), resources.width, resources.height);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(program, "u_width"), options.width);
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(program, "u_boundHigh"), bound.highWord);
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(program, "u_boundLow"), bound.lowWord);
    this.host.gl.drawArrays(this.host.gl.TRIANGLES, 0, 3);
    return targetTexture;
  }

  executeNativeSsaoPass(
    sourceTexture: WebGLTexture,
    depthTexture: WebGLTexture,
    resources: WebGL2BloomPingPongResources,
    options: NativeSsaoOptions,
    vertexArray: WebGLVertexArrayObject,
    targetIndex: 0 | 1
  ): WebGLTexture {
    const program = this.ensureSsaoProgram();
    const targetTexture = resources.textures[targetIndex];
    this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, resources.framebuffers[targetIndex]);
    this.host.gl.viewport(0, 0, resources.width, resources.height);
    this.host.gl.useProgram(program);
    this.host.gl.bindVertexArray(vertexArray);
    this.bindFullscreenTexture(0, sourceTexture);
    this.bindFullscreenTexture(1, depthTexture);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(program, "u_source"), 0);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(program, "u_depth"), 1);
    this.host.gl.uniform2i(this.host.gl.getUniformLocation(program, "u_size"), resources.width, resources.height);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(program, "u_radius"), options.radius);
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(program, "u_intensity"), options.intensity);
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(program, "u_bias"), options.bias);
    this.host.gl.drawArrays(this.host.gl.TRIANGLES, 0, 3);
    return targetTexture;
  }

  executeNativeSsrPass(
    sourceTexture: WebGLTexture,
    depthTexture: WebGLTexture,
    resources: WebGL2BloomPingPongResources,
    options: NativeSsrOptions,
    vertexArray: WebGLVertexArrayObject,
    targetIndex: 0 | 1,
    depthRange: { readonly near: number; readonly far: number }
  ): WebGLTexture {
    const targetTexture = resources.textures[targetIndex];
    this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, resources.framebuffers[targetIndex]);
    this.drawSsrKernel(sourceTexture, depthTexture, resources.width, resources.height, options, vertexArray, depthRange);
    return targetTexture;
  }

  drawSsrKernel(sourceTexture: WebGLTexture, depthTexture: WebGLTexture, width: number, height: number,
    options: NativeSsrOptions, vertexArray: WebGLVertexArrayObject, depthRange: { readonly near: number; readonly far: number }): void {
    const program = this.ensureSsrProgram();
    this.host.gl.viewport(0, 0, width, height);
    this.host.gl.useProgram(program);
    this.host.gl.bindVertexArray(vertexArray);
    this.bindFullscreenTexture(0, sourceTexture);
    this.bindFullscreenTexture(1, depthTexture);
    this.bindFullscreenTexture(2, options.normalMask ?? sourceTexture);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(program, "u_source"), 0);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(program, "u_depth"), 1);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(program, "u_normalMask"), 2);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(program, "u_hasNormalMask"), options.normalMask ? 1 : 0);
    this.host.gl.uniform2i(this.host.gl.getUniformLocation(program, "u_size"), width, height);
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(program, "u_intensity"), options.intensity);
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(program, "u_maxDistance"), options.maxDistance);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(program, "u_maxSteps"), options.maxSteps ?? 32);
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(program, "u_thickness"), options.thickness ?? 0.2);
    if (options.projection && options.inverseProjection) {
      this.host.gl.uniformMatrix4fv(this.host.gl.getUniformLocation(program, "u_projection"), false, options.projection);
      this.host.gl.uniformMatrix4fv(this.host.gl.getUniformLocation(program, "u_inverseProjection"), false, options.inverseProjection);
    }
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(program, "u_depthNear"), depthRange.near);
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(program, "u_depthFar"), depthRange.far);
    this.host.gl.drawArrays(this.host.gl.TRIANGLES, 0, 3);
  }

  executeNativeDepthOfFieldPass(
    sourceTexture: WebGLTexture,
    depthTexture: WebGLTexture,
    resources: WebGL2BloomPingPongResources,
    options: NativeDepthOfFieldOptions,
    vertexArray: WebGLVertexArrayObject,
    targetIndex: 0 | 1,
    depthRange: { readonly near: number; readonly far: number }
  ): WebGLTexture {
    const program = this.ensureDepthOfFieldProgram();
    const targetTexture = resources.textures[targetIndex];
    this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, resources.framebuffers[targetIndex]);
    this.host.gl.viewport(0, 0, resources.width, resources.height);
    this.host.gl.useProgram(program);
    this.host.gl.bindVertexArray(vertexArray);
    this.bindFullscreenTexture(0, sourceTexture);
    this.bindFullscreenTexture(1, depthTexture);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(program, "u_source"), 0);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(program, "u_depth"), 1);
    this.host.gl.uniform2i(this.host.gl.getUniformLocation(program, "u_size"), resources.width, resources.height);
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(program, "u_focusDepth"), options.focusDepth);
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(program, "u_focusRange"), options.focusRange);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(program, "u_maxRadius"), options.maxRadius);
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(program, "u_depthNear"), depthRange.near);
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(program, "u_depthFar"), depthRange.far);
    this.host.gl.drawArrays(this.host.gl.TRIANGLES, 0, 3);
    return targetTexture;
  }

  executeNativeMotionBlurPass(
    sourceTexture: WebGLTexture,
    resources: WebGL2BloomPingPongResources,
    options: NativeMotionBlurOptions,
    vertexArray: WebGLVertexArrayObject,
    targetIndex: 0 | 1
  ): WebGLTexture {
    const velocityTexture = options.temporal ? this.requireTemporalTarget(options.temporal.velocity, resources.width, resources.height).colorHandle : this.motionBlurVelocityTexture;
    if (!velocityTexture) {
      throw new RenderDeviceError("WebGL2 motion-blur velocity texture was not initialized", "WEBGL_ALLOCATION_FAILED");
    }
    const program = this.ensureMotionBlurProgram();
    const targetTexture = resources.textures[targetIndex];
    this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, resources.framebuffers[targetIndex]);
    this.host.gl.viewport(0, 0, resources.width, resources.height);
    this.host.gl.useProgram(program);
    this.host.gl.bindVertexArray(vertexArray);
    this.bindFullscreenTexture(0, sourceTexture);
    this.bindFullscreenTexture(1, velocityTexture);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(program, "u_source"), 0);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(program, "u_velocity"), 1);
    this.host.gl.uniform2i(this.host.gl.getUniformLocation(program, "u_size"), resources.width, resources.height);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(program, "u_samples"), options.samples);
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(program, "u_scale"), options.scale);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(program, "u_velocityUv"), options.temporal ? 1 : 0);
    if (options.temporal) { this.host.counters.nativeTemporalPasses++; this.host.counters.nativeTemporalBindings++; }
    this.host.gl.drawArrays(this.host.gl.TRIANGLES, 0, 3);
    return targetTexture;
  }

  executeNativeTaaPass(
    sourceTexture: WebGLTexture,
    resources: WebGL2BloomPingPongResources,
    options: NativeTaaOptions,
    vertexArray: WebGLVertexArrayObject,
    targetIndex: 0 | 1
  ): WebGLTexture {
    const temporal = options.temporal;
    const historyTarget = temporal ? this.requireTemporalTarget(temporal.history, resources.width, resources.height) : undefined;
    const historyTexture = historyTarget?.colorHandle ?? this.taaHistoryTexture;
    if (!historyTexture) {
      throw new RenderDeviceError("WebGL2 TAA history texture was not initialized", "WEBGL_ALLOCATION_FAILED");
    }
    const accumulationProgram = this.ensureTaaProgram();
    const targetTexture = resources.textures[targetIndex];
    this.host.gl.viewport(0, 0, resources.width, resources.height);
    this.host.gl.useProgram(accumulationProgram);
    this.host.gl.bindVertexArray(vertexArray);
    this.bindFullscreenTexture(0, sourceTexture);
    this.bindFullscreenTexture(1, historyTexture);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(accumulationProgram, "u_source"), 0);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(accumulationProgram, "u_history"), 1);
    this.host.gl.uniform1f(this.host.gl.getUniformLocation(accumulationProgram, "u_blend"), temporal && !temporal.historyValid ? 0 : temporalAccumulationWeight(options.blend, temporal?.historyFrames));
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(accumulationProgram, "u_temporal"), temporal ? 1 : 0);
    if (temporal) {
      const velocity = this.requireTemporalTarget(temporal.velocity, resources.width, resources.height);
      const destination = this.requireTemporalTarget(temporal.historyOutput, resources.width, resources.height);
      if (destination === historyTarget || destination === velocity || historyTarget === velocity) throw new RenderDeviceError("Temporal targets must not alias", "TEMPORAL_TARGET_ALIAS");
      this.bindFullscreenTexture(2, velocity.colorHandle);
      this.host.gl.uniform1i(this.host.gl.getUniformLocation(accumulationProgram, "u_velocity"), 2);
      // Resolve exactly once into the next history target. Presentation reads
      // this immutable result through a separate program, so display tuning
      // cannot alter the accumulated history shader or its stored bytes.
      this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, destination.framebuffer);
      this.host.gl.drawArrays(this.host.gl.TRIANGLES, 0, 3);

      const presentationProgram = this.ensureTaaPresentationProgram();
      this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, resources.framebuffers[targetIndex]);
      this.host.gl.useProgram(presentationProgram);
      this.bindFullscreenTexture(0, sourceTexture);
      this.bindFullscreenTexture(1, destination.colorHandle);
      this.host.gl.uniform1i(this.host.gl.getUniformLocation(presentationProgram, "u_source"), 0);
      this.host.gl.uniform1i(this.host.gl.getUniformLocation(presentationProgram, "u_accumulated"), 1);
      this.host.gl.drawArrays(this.host.gl.TRIANGLES, 0, 3);
      this.host.counters.nativeTemporalPasses++; this.host.counters.nativeTemporalBindings += 3;
    } else {
      this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, resources.framebuffers[targetIndex]);
      this.host.gl.drawArrays(this.host.gl.TRIANGLES, 0, 3);
    }
    return targetTexture;
  }

  requireTemporalTarget(target: RenderTarget, width: number, height: number): WebGL2RenderTarget {
    if (!(target instanceof WebGL2RenderTarget) || !this.host.renderTargets.has(target) || target.disposed || target.width !== width || target.height !== height || target.colorTexture.format !== "rgba16f") throw new RenderDeviceError("Temporal input must be a live same-device same-size RGBA16F target", "TEMPORAL_TARGET_INVALID");
    return target;
  }

  bindFullscreenTexture(unit: number, texture: WebGLTexture): void {
    this.host.gl.activeTexture(this.host.gl.TEXTURE0 + unit);
    this.host.gl.bindTexture(this.host.gl.TEXTURE_2D, texture);
    this.host.gl.bindSampler(unit, null);
  }

  disposeBloomPingPongResources(): void {
    if (!this.bloomPingPongResources) return;
    for (const texture of this.bloomPingPongResources.textures) this.host.gl.deleteTexture(texture);
    for (const framebuffer of this.bloomPingPongResources.framebuffers) this.host.gl.deleteFramebuffer(framebuffer);
    this.bloomPingPongResources = null;
  }

  getBloomDiagnostics(): WebGL2BloomDiagnostics | null {
    return this.lastBloomDiagnostics;
  }

  recordBloomDiagnostics(
    options: NativeBloomOptions,
    sourceWidth: number,
    sourceHeight: number,
    hdr: boolean,
    mipCount: number
  ): void {
    const plan = resolveBloomPyramidPlan(sourceWidth, sourceHeight, options.quality, hdr);
    const pingPongBytes = sourceWidth * sourceHeight * 4 * (hdr ? 2 : 1) * 2;
    const bytesPerChannel = plan.halfFloat ? 2 : 1;
    const level0 = plan.mips[0]!;
    const accumulatorBytes = level0.width * level0.height * 4 * bytesPerChannel;
    this.lastBloomDiagnostics = {
      quality: options.quality,
      mipCount,
      targetCount: options.quality === "performance" ? 2 : plan.mips.length * 2 + 1,
      targetBytes: (options.quality === "performance" ? pingPongBytes : plan.targetBytes + accumulatorBytes + pingPongBytes),
      compositeGain: options.intensity * resolveBloomPyramidResponseGain(plan),
      threshold: options.threshold,
      intensity: options.intensity,
      softKnee: options.softKnee,
      shoulder: options.shoulder,
      halfFloat: hdr || plan.halfFloat,
    };
  }

  describeGpuTargetInventory(liveRenderTargets: readonly WebGL2RenderTarget[]): GpuTargetInventoryEntry[] {
    const entries: GpuTargetInventoryEntry[] = liveRenderTargets.map((target) => ({
      label: target.label,
      kind: "render-target" as const,
      bytes: target.colorTexture.byteLength + (target.depthTexture?.byteLength ?? 0),
      owner: resolveGpuTargetOwner(target.label)
    }));
    const pyramid = this.bloomPyramidResources;
    if (pyramid) {
      const bytesPerPixel = pyramid.hdr ? 8 : 4;
      pyramid.plan.mips.forEach((mip, index) => {
        for (const side of ["a", "b"] as const) {
          entries.push({
            label: `bloom-pyramid-mip${index}${side}`,
            kind: "pyramid-mip",
            bytes: mip.width * mip.height * bytesPerPixel,
            owner: "a1-bloom"
          });
        }
      });
      const level0 = pyramid.plan.mips[0];
      if (level0) {
        for (const side of ["a", "b"] as const) {
          entries.push({
            label: `bloom-pyramid-accumulator-${side}`,
            kind: "pyramid-accumulator",
            bytes: level0.width * level0.height * bytesPerPixel,
            owner: "a1-bloom"
          });
        }
      }
    }
    const pingPong = this.bloomPingPongResources;
    if (pingPong) {
      const bytesPerPixel = pingPong.hdr ? 8 : 4;
      for (const side of ["a", "b"] as const) {
        entries.push({
          label: `bloom-ping-pong-${side}`,
          kind: "ping-pong",
          bytes: pingPong.width * pingPong.height * bytesPerPixel,
          owner: "a1-bloom"
        });
      }
    }
    if (this.bloomBrightLutTexture) {
      entries.push({
        label: "bloom-bright-lut",
        kind: "lut",
        bytes: BLOOM_BRIGHT_LUT_WIDTH * BLOOM_BRIGHT_LUT_HEIGHT * 4,
        owner: "a1-bloom"
      });
    }
    if (this.bloomCompositeLutTexture) {
      entries.push({
        label: "bloom-composite-lut",
        kind: "lut",
        bytes: BLOOM_COMPOSITE_LUT_SIZE * BLOOM_COMPOSITE_LUT_SIZE * 4,
        owner: "a1-bloom"
      });
    }
    if (this.outlineBlendLutTexture) {
      entries.push({ label: "outline-blend-lut", kind: "lut", bytes: OUTLINE_BLEND_LUT_WIDTH * 4, owner: "post" });
    }
    if (this.motionBlurVelocityTexture && this.motionBlurVelocitySize) {
      entries.push({
        label: "motion-blur-velocity",
        kind: "history",
        bytes: this.motionBlurVelocitySize.width * this.motionBlurVelocitySize.height * 8,
        owner: "post"
      });
    }
    if (this.taaHistoryTexture && this.taaHistorySize) {
      entries.push({
        label: "taa-history",
        kind: "history",
        bytes: this.taaHistorySize.width * this.taaHistorySize.height * 4,
        owner: "post"
      });
    }
    return entries;
  }

  disposeBloomPyramidResources(): void {
    if (!this.bloomPyramidResources) return;
    for (const texture of this.bloomPyramidResources.textures) this.host.gl.deleteTexture(texture);
    for (const framebuffer of this.bloomPyramidResources.framebuffers) this.host.gl.deleteFramebuffer(framebuffer);
    this.host.gl.deleteTexture(this.bloomPyramidResources.accumulatorTextureA);
    this.host.gl.deleteFramebuffer(this.bloomPyramidResources.accumulatorFramebufferA);
    this.host.gl.deleteTexture(this.bloomPyramidResources.accumulatorTextureB);
    this.host.gl.deleteFramebuffer(this.bloomPyramidResources.accumulatorFramebufferB);
    this.bloomPyramidResources = null;
  }

  ensureBloomPyramidResources(plan: BloomPyramidPlan, hdr: boolean): WebGL2BloomPyramidResources {
    const current = this.bloomPyramidResources;
    if (
      current && current.plan.quality === plan.quality && current.hdr === (hdr || plan.halfFloat) &&
      current.plan.mips.length === plan.mips.length &&
      current.plan.mips.every((mip, index) => mip.width === plan.mips[index]!.width && mip.height === plan.mips[index]!.height)
    ) {
      return current;
    }
    this.disposeBloomPyramidResources();

    const textureUnit0 = this.host.lifecycle.captureTextureUnit0();
    const previousFramebuffer = this.host.gl.getParameter(this.host.gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const textures: WebGLTexture[] = [];
    const framebuffers: WebGLFramebuffer[] = [];
    const useHalfFloat = hdr || plan.halfFloat;
    const allocateTarget = (width: number, height: number, label: string): { texture: WebGLTexture; framebuffer: WebGLFramebuffer } => {
      const texture = this.host.gl.createTexture();
      const framebuffer = this.host.gl.createFramebuffer();
      if (!texture || !framebuffer) {
        if (texture) this.host.gl.deleteTexture(texture);
        if (framebuffer) this.host.gl.deleteFramebuffer(framebuffer);
        throw new RenderDeviceError(`Failed to allocate WebGL2 bloom pyramid ${label}`, "WEBGL_ALLOCATION_FAILED", { width, height });
      }
      textures.push(texture);
      framebuffers.push(framebuffer);
      this.host.gl.bindTexture(this.host.gl.TEXTURE_2D, texture);
      this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_MIN_FILTER, this.host.gl.LINEAR);
      this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_MAG_FILTER, this.host.gl.LINEAR);
      this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_WRAP_S, this.host.gl.CLAMP_TO_EDGE);
      this.host.gl.texParameteri(this.host.gl.TEXTURE_2D, this.host.gl.TEXTURE_WRAP_T, this.host.gl.CLAMP_TO_EDGE);
      this.host.gl.texImage2D(this.host.gl.TEXTURE_2D, 0, useHalfFloat ? this.host.gl.RGBA16F : this.host.gl.RGBA8, width, height, 0, this.host.gl.RGBA, useHalfFloat ? this.host.gl.HALF_FLOAT : this.host.gl.UNSIGNED_BYTE, null);
      this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, framebuffer);
      this.host.gl.framebufferTexture2D(this.host.gl.FRAMEBUFFER, this.host.gl.COLOR_ATTACHMENT0, this.host.gl.TEXTURE_2D, texture, 0);
      const status = this.host.gl.checkFramebufferStatus(this.host.gl.FRAMEBUFFER);
      if (status !== this.host.gl.FRAMEBUFFER_COMPLETE) {
        throw new RenderDeviceError("WebGL2 bloom pyramid framebuffer status is invalid", "FRAMEBUFFER_INVALID", { width, height, status });
      }
      return { texture, framebuffer };
    };
    try {
      // Two ping-pong targets per mip (separable blur needs distinct read/write
      // targets at the same size), plus two level-0-sized accumulators: the
      // weighted sum ping-pongs between them so no pass ever samples the
      // texture of its own bound framebuffer (feedback loop).
      for (const mip of plan.mips) {
        allocateTarget(mip.width, mip.height, "mip");
        allocateTarget(mip.width, mip.height, "mip");
      }
      const level0 = plan.mips[0]!;
      const accumulatorA = allocateTarget(level0.width, level0.height, "accumulator-a");
      const accumulatorB = allocateTarget(level0.width, level0.height, "accumulator-b");
      const finalResources: WebGL2BloomPyramidResources = {
        plan,
        hdr: useHalfFloat,
        textures,
        framebuffers,
        accumulatorTextureA: accumulatorA.texture,
        accumulatorFramebufferA: accumulatorA.framebuffer,
        accumulatorTextureB: accumulatorB.texture,
        accumulatorFramebufferB: accumulatorB.framebuffer
      };
      this.bloomPyramidResources = finalResources;
      return finalResources;
    } catch (error) {
      for (const texture of textures) this.host.gl.deleteTexture(texture);
      for (const framebuffer of framebuffers) this.host.gl.deleteFramebuffer(framebuffer);
      throw error;
    } finally {
      this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, previousFramebuffer);
      this.host.lifecycle.restoreTextureUnit0(textureUnit0);
      this.host.stateCache.invalidate();
    }
  }

  prepareFullscreenPresentation(framebuffer: WebGLFramebuffer | null, outputWidth: number, outputHeight: number): WebGL2FullscreenPresentationStateSnapshot {
    const textureUnit0 = this.host.lifecycle.captureTextureUnit0();
    const textureUnit1 = this.host.lifecycle.captureTextureUnitBinding(1);
    const textureUnit2 = this.host.lifecycle.captureTextureUnitBinding(2);
    this.host.gl.activeTexture(textureUnit0.activeTexture);
    const snapshot: WebGL2FullscreenPresentationStateSnapshot = {
      framebuffer: this.host.gl.getParameter(this.host.gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null,
      program: this.host.gl.getParameter(this.host.gl.CURRENT_PROGRAM) as WebGLProgram | null,
      textureUnit0,
      textureUnit1,
      textureUnit2,
      vertexArray: this.host.gl.getParameter(this.host.gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null,
      viewport: this.host.gl.getParameter(this.host.gl.VIEWPORT) as Int32Array | readonly number[],
      colorMask: this.host.gl.getParameter(this.host.gl.COLOR_WRITEMASK) as readonly boolean[],
      depthTestEnabled: this.host.gl.isEnabled(this.host.gl.DEPTH_TEST),
      cullFaceEnabled: this.host.gl.isEnabled(this.host.gl.CULL_FACE),
      blendEnabled: this.host.gl.isEnabled(this.host.gl.BLEND),
      scissorTestEnabled: this.host.gl.isEnabled(this.host.gl.SCISSOR_TEST),
      stencilTestEnabled: this.host.gl.isEnabled(this.host.gl.STENCIL_TEST),
      polygonOffsetFillEnabled: this.host.gl.isEnabled(this.host.gl.POLYGON_OFFSET_FILL),
      depthMask: this.host.gl.getParameter(this.host.gl.DEPTH_WRITEMASK) as boolean
    };
    this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, framebuffer);
    this.host.gl.viewport(0, 0, outputWidth, outputHeight);
    this.host.gl.colorMask(true, true, true, true);
    this.host.gl.disable(this.host.gl.SCISSOR_TEST);
    this.host.gl.disable(this.host.gl.STENCIL_TEST);
    this.host.gl.disable(this.host.gl.POLYGON_OFFSET_FILL);
    this.host.gl.disable(this.host.gl.DEPTH_TEST);
    this.host.gl.disable(this.host.gl.CULL_FACE);
    this.host.gl.disable(this.host.gl.BLEND);
    this.host.gl.depthMask(false);
    return snapshot;
  }

  restoreFullscreenPresentationState(snapshot: WebGL2FullscreenPresentationStateSnapshot, fallbackWidth: number, fallbackHeight: number): void {
    this.host.gl.bindVertexArray(snapshot.vertexArray);
    this.host.lifecycle.restoreTextureUnitBinding(2, snapshot.textureUnit2);
    this.host.lifecycle.restoreTextureUnitBinding(1, snapshot.textureUnit1);
    this.host.lifecycle.restoreTextureUnit0(snapshot.textureUnit0);
    this.host.gl.useProgram(snapshot.program);
    if (snapshot.depthTestEnabled) this.host.gl.enable(this.host.gl.DEPTH_TEST);
    else this.host.gl.disable(this.host.gl.DEPTH_TEST);
    if (snapshot.cullFaceEnabled) this.host.gl.enable(this.host.gl.CULL_FACE);
    else this.host.gl.disable(this.host.gl.CULL_FACE);
    if (snapshot.blendEnabled) this.host.gl.enable(this.host.gl.BLEND);
    else this.host.gl.disable(this.host.gl.BLEND);
    if (snapshot.scissorTestEnabled) this.host.gl.enable(this.host.gl.SCISSOR_TEST);
    else this.host.gl.disable(this.host.gl.SCISSOR_TEST);
    if (snapshot.stencilTestEnabled) this.host.gl.enable(this.host.gl.STENCIL_TEST);
    else this.host.gl.disable(this.host.gl.STENCIL_TEST);
    if (snapshot.polygonOffsetFillEnabled) this.host.gl.enable(this.host.gl.POLYGON_OFFSET_FILL);
    else this.host.gl.disable(this.host.gl.POLYGON_OFFSET_FILL);
    this.host.gl.colorMask(snapshot.colorMask[0] ?? true, snapshot.colorMask[1] ?? true, snapshot.colorMask[2] ?? true, snapshot.colorMask[3] ?? true);
    this.host.gl.depthMask(snapshot.depthMask);
    this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, snapshot.framebuffer);
    this.host.gl.viewport(snapshot.viewport[0] ?? 0, snapshot.viewport[1] ?? 0, snapshot.viewport[2] ?? fallbackWidth, snapshot.viewport[3] ?? fallbackHeight);
    this.host.stateCache.invalidate();
  }

  ensurePresentationVertexArray(): WebGLVertexArrayObject {
    if (this.presentationVertexArray) return this.presentationVertexArray;
    const vertexArray = this.host.gl.createVertexArray();
    if (!vertexArray) {
      throw new RenderDeviceError("Failed to allocate WebGL presentation vertex array", "WEBGL_ALLOCATION_FAILED");
    }
    this.presentationVertexArray = vertexArray;
    return vertexArray;
  }

  ensurePresentationProgram(): WebGLProgram {
    if (this.presentationProgram) {
      return this.presentationProgram;
    }
    const vertex = this.host.device.compileShader(this.host.gl.VERTEX_SHADER, `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
  vec2 position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = position;
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}
`, "webgl2-present-render-target");
    const fragment = this.host.device.compileShader(this.host.gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
uniform sampler2D u_source;
in vec2 v_uv;
out vec4 outColor;
void main() {
  outColor = texture(u_source, v_uv);
}
`, "webgl2-present-render-target");
    const program = this.host.gl.createProgram();
    if (!program) {
      this.host.gl.deleteShader(vertex);
      this.host.gl.deleteShader(fragment);
      throw new RenderDeviceError("Failed to allocate WebGL presentation shader", "WEBGL_ALLOCATION_FAILED");
    }
    this.host.gl.attachShader(program, vertex);
    this.host.gl.attachShader(program, fragment);
    this.host.gl.linkProgram(program);
    this.host.counters.programCompiles += 1;
    this.host.gl.deleteShader(vertex);
    this.host.gl.deleteShader(fragment);
    if (!this.host.gl.getProgramParameter(program, this.host.gl.LINK_STATUS)) {
      const log = this.host.gl.getProgramInfoLog(program) ?? "Unknown presentation shader link error";
      this.host.gl.deleteProgram(program);
      throw new RenderDeviceError("WebGL presentation shader link failed", "SHADER_LINK_FAILED", { log });
    }
    this.presentationProgram = program;
    return program;
  }

  ensureBloomBrightExtractProgram(): WebGLProgram {
    if (this.bloomBrightExtractProgram) {
      return this.bloomBrightExtractProgram;
    }
    this.bloomBrightExtractProgram = this.createFullscreenProgram(`#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_source;
uniform sampler2D u_brightLut;
uniform int u_hdr;
uniform float u_threshold;
uniform float u_softKnee;
out vec4 outColor;

uvec4 byteTexel(sampler2D source, ivec2 coordinate) {
  return uvec4(texelFetch(source, coordinate, 0) * 255.0 + 0.5);
}

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  if (u_hdr == 1) {
    vec4 source = texelFetch(u_source, pixel, 0);
    float luma = dot(source.rgb, vec3(0.2126, 0.7152, 0.0722));
    float kneeLow = max(u_threshold - u_softKnee, 0.0);
    float kneeHigh = min(u_threshold + u_softKnee, 1.0);
    float weight = u_softKnee <= 0.0
      ? (luma >= u_threshold ? 1.0 : 0.0)
      : smoothstep(kneeLow, kneeHigh, luma);
    outColor = source * weight;
    return;
  }
  uvec4 source = byteTexel(u_source, pixel);
  uint colorIndex = (source.r << 16u) | (source.g << 8u) | source.b;
  uint byteIndex = colorIndex >> 3u;
  uint texelIndex = byteIndex >> 2u;
  ivec2 lutCoordinate = ivec2(
    int(texelIndex % ${BLOOM_BRIGHT_LUT_WIDTH}u),
    int(texelIndex / ${BLOOM_BRIGHT_LUT_WIDTH}u)
  );
  uvec4 packed = byteTexel(u_brightLut, lutCoordinate);
  uint component = byteIndex & 3u;
  uint packedByte = component == 0u
    ? packed.r
    : component == 1u
      ? packed.g
      : component == 2u
        ? packed.b
        : packed.a;
  bool bright = ((packedByte >> (colorIndex & 7u)) & 1u) == 1u;
  outColor = bright ? vec4(source) / 255.0 : vec4(0.0);
}
`, "webgl2-bloom-bright-extract");
    return this.bloomBrightExtractProgram;
  }

  ensureBloomBlurProgram(): WebGLProgram {
    if (this.bloomBlurProgram) {
      return this.bloomBlurProgram;
    }
    this.bloomBlurProgram = this.createFullscreenProgram(`#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_source;
uniform ivec2 u_size;
uniform int u_radius;
uniform int u_horizontal;
uniform int u_hdr;
out vec4 outColor;

vec4 sourcePixel(ivec2 coordinate) {
  return texelFetch(u_source, clamp(coordinate, ivec2(0), u_size - ivec2(1)), 0);
}

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  float sigma = max(float(u_radius) / 3.0, 0.5);
  float coefficient = 0.39894 / sigma;
  vec4 sum = sourcePixel(pixel) * coefficient;
  float weightSum = coefficient;
  for (int offset = 1; offset <= 16; offset += 1) {
    if (offset > u_radius) continue;
    float distance = float(offset);
    float weight = coefficient * exp(-0.5 * distance * distance / (sigma * sigma));
    ivec2 delta = u_horizontal == 1 ? ivec2(offset, 0) : ivec2(0, offset);
    sum += (sourcePixel(pixel + delta) + sourcePixel(pixel - delta)) * weight;
    weightSum += 2.0 * weight;
  }
  outColor = sum / max(weightSum, 0.000001);
}
`, "webgl2-bloom-blur");
    return this.bloomBlurProgram;
  }

  ensureBloomCompositeProgram(): WebGLProgram {
    if (this.bloomCompositeProgram) {
      return this.bloomCompositeProgram;
    }
    this.bloomCompositeProgram = this.createFullscreenProgram(`#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_source;
uniform sampler2D u_blurred;
uniform sampler2D u_compositeLut;
uniform int u_hdr;
uniform float u_intensity;
out vec4 outColor;

uvec4 byteTexel(sampler2D source, ivec2 coordinate) {
  return uvec4(texelFetch(source, coordinate, 0) * 255.0 + 0.5);
}

float compositeChannel(uint source, uint blurred) {
  return texelFetch(u_compositeLut, ivec2(int(source), int(blurred)), 0).r;
}

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  if (u_hdr == 1) {
    vec4 source = texelFetch(u_source, pixel, 0);
    vec3 blurred = texelFetch(u_blurred, pixel, 0).rgb;
    outColor = vec4(source.rgb + blurred * u_intensity, source.a);
    return;
  }
  uvec4 source = byteTexel(u_source, pixel);
  uvec4 blurred = byteTexel(u_blurred, pixel);
  outColor = vec4(
    compositeChannel(source.r, blurred.r),
    compositeChannel(source.g, blurred.g),
    compositeChannel(source.b, blurred.b),
    float(source.a) / 255.0
  );
}
`, "webgl2-bloom-composite");
    return this.bloomCompositeProgram;
  }

  ensureBloomDownsampleProgram(): WebGLProgram {
    if (this.bloomDownsampleProgram) return this.bloomDownsampleProgram;
    this.bloomDownsampleProgram = this.createFullscreenProgram(`#version 300 es
precision highp float;
uniform sampler2D u_source;
uniform vec2 u_texelSize;
uniform vec2 u_targetSize;
out vec4 outColor;
void main() {
  // gl_FragCoord is expressed in destination pixels. Normalize by the
  // destination size so every downsample covers the complete source image;
  // multiplying by source texel size cropped a half-size target to the
  // lower-left quarter of the preceding level.
  vec2 uv = gl_FragCoord.xy / u_targetSize;
  vec2 e = u_texelSize * 0.5;
  vec4 sum = texture(u_source, uv - e) + texture(u_source, uv + vec2(e.x, -e.y))
    + texture(u_source, uv + vec2(-e.x, e.y)) + texture(u_source, uv + e);
  outColor = sum * 0.25;
}
`, "webgl2-bloom-downsample");
    return this.bloomDownsampleProgram;
  }

  ensureBloomAccumulateProgram(): WebGLProgram {
    if (this.bloomAccumulateProgram) return this.bloomAccumulateProgram;
    this.bloomAccumulateProgram = this.createFullscreenProgram(`#version 300 es
precision highp float;
uniform sampler2D u_base;
uniform sampler2D u_bloom;
uniform float u_weight;
out vec4 outColor;
void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  vec4 base = texelFetch(u_base, pixel, 0);
  vec2 uv = (vec2(pixel) + 0.5) / vec2(textureSize(u_base, 0));
  vec3 bloom = texture(u_bloom, uv).rgb;
  outColor = vec4(base.rgb + bloom * u_weight, base.a);
}
`, "webgl2-bloom-accumulate");
    return this.bloomAccumulateProgram;
  }

  ensureOutlineProgram(): WebGLProgram {
    if (this.outlineProgram) return this.outlineProgram;
    this.outlineProgram = this.createFullscreenProgram(`#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_source;
uniform sampler2D u_blendLut;
uniform ivec2 u_size;
uniform int u_width;
uniform float u_boundHigh;
uniform float u_boundLow;
out vec4 outColor;

uvec4 sourceByte(ivec2 coordinate) {
  ivec2 bounded = clamp(coordinate, ivec2(0), u_size - ivec2(1));
  return uvec4(texelFetch(u_source, bounded, 0) * 255.0 + 0.5);
}

uint lumaNumerator(ivec2 coordinate) {
  uvec3 source = sourceByte(coordinate).rgb;
  return 2126u * source.r + 7152u * source.g + 722u * source.b;
}

uvec2 squareWords(int signedValue) {
  uint value = uint(abs(signedValue));
  uint high = value >> 12u;
  uint low = value & 4095u;
  uint middle = 2u * high * low;
  uint lowWord = low * low + (middle & 4095u) * 4096u;
  uint highWord = high * high + (middle >> 12u);
  highWord += lowWord / ${OUTLINE_LIMB_RADIX}u;
  lowWord %= ${OUTLINE_LIMB_RADIX}u;
  return uvec2(highWord, lowWord);
}

bool edgeAt(ivec2 pixel) {
  int nw = int(lumaNumerator(pixel + ivec2(-1, -1)));
  int n = int(lumaNumerator(pixel + ivec2(0, -1)));
  int ne = int(lumaNumerator(pixel + ivec2(1, -1)));
  int w = int(lumaNumerator(pixel + ivec2(-1, 0)));
  int e = int(lumaNumerator(pixel + ivec2(1, 0)));
  int sw = int(lumaNumerator(pixel + ivec2(-1, 1)));
  int s = int(lumaNumerator(pixel + ivec2(0, 1)));
  int se = int(lumaNumerator(pixel + ivec2(1, 1)));
  int gx = -nw - 2 * w - sw + ne + 2 * e + se;
  int gy = -nw - 2 * n - ne + sw + 2 * s + se;
  uvec2 x = squareWords(gx);
  uvec2 y = squareWords(gy);
  uint low = x.y + y.y;
  uint high = x.x + y.x;
  if (low >= ${OUTLINE_LIMB_RADIX}u) {
    low -= ${OUTLINE_LIMB_RADIX}u;
    high += 1u;
  }
  uint boundHigh = uint(u_boundHigh);
  uint boundLow = uint(u_boundLow);
  return high != boundHigh ? high > boundHigh : low >= boundLow;
}

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  bool outlined = false;
  for (int offsetY = -6; offsetY <= 6 && !outlined; offsetY += 1) {
    for (int offsetX = -6; offsetX <= 6; offsetX += 1) {
      if (abs(offsetX) > u_width || abs(offsetY) > u_width) continue;
      if (offsetX * offsetX + offsetY * offsetY > u_width * u_width) continue;
      ivec2 candidate = clamp(pixel + ivec2(offsetX, offsetY), ivec2(0), u_size - ivec2(1));
      if (edgeAt(candidate)) {
        outlined = true;
        break;
      }
    }
  }
  uvec4 source = sourceByte(pixel);
  if (!outlined) {
    outColor = vec4(source) / 255.0;
    return;
  }
  outColor = vec4(
    texelFetch(u_blendLut, ivec2(int(source.r), 0), 0).r,
    texelFetch(u_blendLut, ivec2(int(source.g), 0), 0).g,
    texelFetch(u_blendLut, ivec2(int(source.b), 0), 0).b,
    float(source.a) / 255.0
  );
}
`, "webgl2-outline");
    return this.outlineProgram;
  }

  ensureSsaoProgram(): WebGLProgram {
    if (this.ssaoProgram) return this.ssaoProgram;
    this.ssaoProgram = this.createFullscreenProgram(`#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_source;
uniform sampler2D u_depth;
uniform ivec2 u_size;
uniform int u_radius;
uniform float u_intensity;
uniform float u_bias;
out vec4 outColor;

float depthAt(ivec2 coordinate) {
  return texelFetch(u_depth, clamp(coordinate, ivec2(0), u_size - ivec2(1)), 0).r;
}

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  float centerDepth = depthAt(pixel);
  float occlusion = 0.0;
  float samples = 0.0;
  for (int stepY = -1; stepY <= 1; stepY += 1) {
    for (int stepX = -1; stepX <= 1; stepX += 1) {
      if (stepX == 0 && stepY == 0) continue;
      float sampleDepth = depthAt(pixel + ivec2(stepX * u_radius, stepY * u_radius));
      occlusion += clamp(
        (centerDepth - sampleDepth - u_bias) / (0.14 + float(u_radius) * 0.04),
        0.0,
        1.0
      );
      samples += 1.0;
    }
  }
  float factor = max(0.18, 1.0 - (occlusion / max(1.0, samples)) * u_intensity * 0.72);
  vec4 source = texelFetch(u_source, pixel, 0);
  outColor = vec4(source.rgb * factor, source.a);
}
`, "webgl2-ssao");
    return this.ssaoProgram;
  }

  ensureSsrProgram(): WebGLProgram {
    if (this.ssrProgram) return this.ssrProgram;
    this.ssrProgram = this.createFullscreenProgram(`#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_source;
uniform sampler2D u_depth;
uniform sampler2D u_normalMask;
uniform ivec2 u_size;
uniform float u_intensity;
uniform float u_maxDistance;
uniform int u_maxSteps;
uniform float u_thickness;
uniform int u_hasNormalMask;
uniform mat4 u_projection;
uniform mat4 u_inverseProjection;
out vec4 outColor;
vec3 positionAtDepth(vec2 uv, float depth) {
  vec4 p = u_inverseProjection * vec4(uv * 2.0 - 1.0, depth * 2.0 - 1.0, 1.0);
  return p.xyz / p.w;
}
vec3 positionAt(vec2 uv) {
  return positionAtDepth(uv, texture(u_depth, uv).r);
}
vec3 viewDirection(vec2 uv) {
  return normalize(positionAtDepth(uv, 0.999) - positionAtDepth(uv, 0.0));
}
vec2 projectPosition(vec3 p) {
  vec4 clip = u_projection * vec4(p, 1.0);
  return clip.xy / clip.w * 0.5 + 0.5;
}
float depthDifference(vec3 p, vec2 uv) {
  return dot(p - positionAt(uv), viewDirection(uv));
}
void main() {
  vec2 uv = gl_FragCoord.xy / vec2(u_size);
  vec4 base = texture(u_source, uv);
  outColor = base;
  vec3 origin = positionAt(uv);
  vec4 normalMask = texture(u_normalMask, uv);
  vec3 normal = u_hasNormalMask == 1 ? normalize(normalMask.xyz * 2.0 - 1.0) : normalize(cross(dFdx(origin), dFdy(origin)));
  float roughness = u_hasNormalMask == 1 ? normalMask.a : 0.25;
  if (texture(u_depth, uv).r >= 0.999999 || (u_hasNormalMask == 1 && normalMask.a == 0.0) || roughness >= 1.0) return;
  vec3 ray = normalize(reflect(viewDirection(uv), normal));
  float stepSize = u_maxDistance / float(u_maxSteps);
  vec3 start = origin + normal * u_thickness;
  float previous = 0.0;
  for (int i = 1; i <= 64; ++i) {
    if (i > u_maxSteps) break;
    float distanceAlong = float(i) * stepSize;
    vec3 candidate = start + ray * distanceAlong;
    vec4 candidateClip = u_projection * vec4(candidate, 1.0);
    if (candidateClip.w <= 0.0 || abs(candidateClip.z) >= candidateClip.w) break;
    vec2 hitUV = projectPosition(candidate);
    if (any(lessThanEqual(hitUV, vec2(0.0))) || any(greaterThanEqual(hitUV, vec2(1.0)))) break;
    float difference = depthDifference(candidate, hitUV);
    if (difference >= 0.0 && previous < 0.0) {
      float lo = distanceAlong - stepSize, hi = distanceAlong;
      for (int j = 0; j < 5; ++j) {
        float mid = (lo + hi) * 0.5;
        vec3 point = start + ray * mid;
        if (depthDifference(point, projectPosition(point)) >= 0.0) hi = mid; else lo = mid;
      }
      candidate = start + ray * hi;
      hitUV = projectPosition(candidate);
      difference = depthDifference(candidate, hitUV);
      if (difference > u_thickness || texture(u_depth, hitUV).r >= 0.999999) break;
      float edge = smoothstep(0.0, 0.08, min(min(hitUV.x, hitUV.y), min(1.0 - hitUV.x, 1.0 - hitUV.y)));
      float response = clamp(u_intensity * edge * (1.0 - roughness) * (1.0 - hi / u_maxDistance), 0.0, 1.0);
      outColor = vec4(mix(base.rgb, texture(u_source, hitUV).rgb, response), base.a);
      break;
    }
    previous = difference;
  }
}
`, "webgl2-ssr");
    return this.ssrProgram;
  }

  ensureDepthOfFieldProgram(): WebGLProgram {
    if (this.depthOfFieldProgram) return this.depthOfFieldProgram;
    this.depthOfFieldProgram = this.createFullscreenProgram(`#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_source;
uniform sampler2D u_depth;
uniform ivec2 u_size;
uniform float u_focusDepth;
uniform float u_focusRange;
uniform int u_maxRadius;
uniform float u_depthNear;
uniform float u_depthFar;
out vec4 outColor;

// Same linearization contract as the SSR program, except focus is authored
// directly as a linear-distance fraction (0 = near plane, 1 = far plane):
// buffer-unit focus values are unusable once depth is linearized, because the
// projection curve parks the whole play area inside a sliver of buffer units.
// The CPU byte kernel keeps buffer-unit semantics; the divergence is
// documented at normalizeLdrDepthRange.
float a3dDofLinearDepth(float depth) {
  float viewZ = u_depthNear * u_depthFar / max(u_depthFar - depth * (u_depthFar - u_depthNear), 0.0001);
  return clamp((viewZ - u_depthNear) / max(u_depthFar - u_depthNear, 0.0001), 0.0, 1.0);
}

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  vec4 source = texelFetch(u_source, pixel, 0);
  float linearDepth = a3dDofLinearDepth(texelFetch(u_depth, pixel, 0).r);
  float normalizedBlur = max(0.0, abs(linearDepth - u_focusDepth) - u_focusRange)
    / max(u_focusRange, 0.001) * float(u_maxRadius);
  int radius = min(u_maxRadius, int(round(normalizedBlur)));
  if (radius == 0) {
    outColor = source;
    return;
  }
  vec3 sum = vec3(0.0);
  float samples = 0.0;
  for (int offsetY = -8; offsetY <= 8; offsetY += 1) {
    for (int offsetX = -8; offsetX <= 8; offsetX += 1) {
      if (abs(offsetX) > radius || abs(offsetY) > radius) continue;
      if (offsetX * offsetX + offsetY * offsetY > radius * radius) continue;
      ivec2 samplePixel = clamp(pixel + ivec2(offsetX, offsetY), ivec2(0), u_size - ivec2(1));
      sum += texelFetch(u_source, samplePixel, 0).rgb;
      samples += 1.0;
    }
  }
  outColor = vec4(sum / max(1.0, samples), source.a);
}
`, "webgl2-depth-of-field");
    return this.depthOfFieldProgram;
  }

  ensureMotionBlurProgram(): WebGLProgram {
    if (this.motionBlurProgram) return this.motionBlurProgram;
    this.motionBlurProgram = this.createFullscreenProgram(`#version 300 es
precision highp float;
precision highp int;
uniform sampler2D u_source;
uniform sampler2D u_velocity;
uniform bool u_velocityUv;
uniform ivec2 u_size;
uniform int u_samples;
uniform float u_scale;
out vec4 outColor;

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  vec4 source = texelFetch(u_source, pixel, 0);
  vec2 velocity = texelFetch(u_velocity, pixel, 0).rg * u_scale;
  if (u_velocityUv) velocity *= vec2(u_size);
  velocity = clamp(velocity, vec2(-64.0), vec2(64.0));
  if (length(velocity) < 0.01) {
    outColor = source;
    return;
  }
  vec3 sum = vec3(0.0);
  for (int sampleIndex = 0; sampleIndex < 16; sampleIndex += 1) {
    if (sampleIndex >= u_samples) continue;
    float t = float(sampleIndex) / float(u_samples - 1) - 0.5;
    ivec2 samplePixel = ivec2(floor(vec2(pixel) - velocity * t + vec2(0.5)));
    samplePixel = clamp(samplePixel, ivec2(0), u_size - ivec2(1));
    sum += texelFetch(u_source, samplePixel, 0).rgb;
  }
  outColor = vec4(sum / float(u_samples), source.a);
}
`, "webgl2-motion-blur");
    return this.motionBlurProgram;
  }

  ensureTaaProgram(): WebGLProgram {
    if (this.taaProgram) return this.taaProgram;
    this.taaProgram = this.createFullscreenProgram(`#version 300 es
precision highp float;
uniform sampler2D u_source;
uniform sampler2D u_history;
uniform sampler2D u_velocity;
uniform float u_blend;
uniform bool u_temporal;
out vec4 outColor;
vec4 cubicWeights(float f) {
  float f2=f*f, f3=f2*f;
  return vec4(-0.5*f+f2-0.5*f3,1.0-2.5*f2+1.5*f3,0.5*f+2.0*f2-1.5*f3,-0.5*f2+0.5*f3);
}
vec4 historyAt(vec2 uv) {
  ivec2 size=textureSize(u_history,0);
  vec2 position=uv*vec2(size)-0.5;
  ivec2 base=ivec2(floor(position));
  vec4 wx=cubicWeights(fract(position.x)), wy=cubicWeights(fract(position.y));
  vec4 result=vec4(0.0);
  // Repeated bilinear history reconstruction diffuses a moving edge every
  // frame. Cubic reconstruction preserves it; the resolve's current-neighbor
  // clipping below bounds ringing before accumulation.
  for(int y=0;y<4;y++) for(int x=0;x<4;x++) {
    result+=texelFetch(u_history,clamp(base+ivec2(x-1,y-1),ivec2(0),size-1),0)*wx[x]*wy[y];
  }
  return result;
}

void main() {
  ivec2 pixel = ivec2(gl_FragCoord.xy);
  ivec2 size = textureSize(u_source, 0);
  vec2 outputUV=(vec2(pixel)+0.5)/vec2(size);
  // Raster jitter supplies quadrature samples inside the output pixel.
  // Keep that sample on its pixel's accumulation grid; undoing the jitter
  // spatially filters it and defeats temporal coverage integration.
  vec2 sourceUV=outputUV;
  ivec2 sourcePixel=clamp(ivec2(floor(sourceUV*vec2(size))),ivec2(0),size-1);
  // Reconstruct current color on the stable output grid before accumulation.
  vec4 source = texelFetch(u_source, pixel, 0);
  vec4 motion = u_temporal ? texelFetch(u_velocity, sourcePixel, 0) : vec4(0.0);
  // A currently uncovered sample may still carry integrated foreground
  // coverage in history. Track nearby foreground motion for that coverage,
  // but retain this pixel's own current/previous depth tags: copying RGBA
  // wholesale falsely labels background color as a foreground surface.
  if (u_temporal) {
    float nearestDepth=motion.b;
    for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++) {
      vec4 candidate=texelFetch(u_velocity,clamp(pixel+ivec2(x,y),ivec2(0),size-1),0);
      if(candidate.b<nearestDepth) {nearestDepth=candidate.b;motion.xy=candidate.xy;}
    }
  }
  vec2 previousUV = outputUV-motion.xy;
  vec4 history = u_temporal ? historyAt(previousUV) : texture(u_history, previousUV);
  float weight = u_blend;
  if (u_temporal) {
    // Reprojected history incurs reconstruction error as the footprint moves
    // across the pixel grid. Reduce its confidence with displacement instead
    // of repeatedly giving a softened moving edge the stationary .9 weight.
    // Physical motion itself remains fully represented in previousUV.
    weight /= 1.0 + length(motion.xy * vec2(size));
    // Depth is categorical at a silhouette: bilinear alpha interpolation creates
    // nonexistent surfaces and rejects valid history on every jittered edge.
    // Test surface presence in the central history footprint. RGB remains
    // an integrated coverage value reconstructed from the wider cubic kernel.
    ivec2 previousBase=ivec2(floor(previousUV*vec2(size)-vec2(0.5)));
    float depthError=1.0;
    for(int y=0;y<2;y++) for(int x=0;x<2;x++) {
      float previousDepth=texelFetch(u_history,clamp(previousBase+ivec2(x,y),ivec2(0),size-1),0).a;
      depthError=min(depthError,abs(previousDepth-motion.a));
    }
    if (any(lessThan(previousUV,vec2(0.0))) || any(greaterThanEqual(previousUV,vec2(1.0))) || depthError>0.002) weight=0.0;
    vec3 lo=source.rgb, hi=source.rgb;
    for(int y=-1;y<=1;y++) for(int x=-1;x<=1;x++) { vec3 tap=texelFetch(u_source,clamp(pixel+ivec2(x,y),ivec2(0),size-1),0).rgb; lo=min(lo,tap); hi=max(hi,tap); }
    history.rgb=clamp(history.rgb,lo,hi);
  }
  vec3 resolved=mix(source.rgb,history.rgb,weight);
  outColor=vec4(resolved,u_temporal?motion.b:source.a);
}
`, "webgl2-taa-accumulation");
    return this.taaProgram;
  }

  ensureTaaPresentationProgram(): WebGLProgram {
    if (this.taaPresentationProgram) return this.taaPresentationProgram;
    this.taaPresentationProgram = this.createFullscreenProgram(`#version 300 es
precision highp float;
uniform sampler2D u_source;
uniform sampler2D u_accumulated;
out vec4 outColor;
void main() {
  ivec2 pixel=ivec2(gl_FragCoord.xy);
  ivec2 size=textureSize(u_source,0);
  vec4 source=texelFetch(u_source,pixel,0);
  vec3 accumulated=texelFetch(u_accumulated,pixel,0).rgb;
  // Retained native pixels isolate the remaining spatial excess to the
  // horizontally moving silhouette. Apply a bounded three-tap unsharp resolve
  // to presentation only; accumulated history remains immutable.
  vec3 center=mix(source.rgb,accumulated,0.90);
  ivec2 leftPixel=clamp(pixel+ivec2(-1,0),ivec2(0),size-1);
  ivec2 rightPixel=clamp(pixel+ivec2(1,0),ivec2(0),size-1);
  vec3 left=mix(texelFetch(u_source,leftPixel,0).rgb,texelFetch(u_accumulated,leftPixel,0).rgb,0.90);
  vec3 right=mix(texelFetch(u_source,rightPixel,0).rgb,texelFetch(u_accumulated,rightPixel,0).rgb,0.90);
  outColor=vec4(clamp(center*1.04-(left+right)*0.02,0.0,1.0),source.a);
}
`, "webgl2-taa-presentation");
    return this.taaPresentationProgram;
  }

  ensureNativeFxaaFinalizeProgram(): WebGLProgram {
    if (this.nativeFxaaFinalizeProgram) {
      return this.nativeFxaaFinalizeProgram;
    }
    this.nativeFxaaFinalizeProgram = this.createFullscreenProgram(FXAA_185_FRAGMENT_GLSL, "webgl2-fxaa-185-finalize");
    return this.nativeFxaaFinalizeProgram;
  }

  /**
   * PRD-03 Phase 1 — the split finalize for `fxaa.variant === "r185"`: samples
   * the completed LDR intermediate (source resolution) and writes the r185
   * FXAA blend plus the ±1-LSB triangular dither to the output.
   */
  executeNativeFxaaFinalize(
    sourceTexture: WebGLTexture,
    framebuffer: WebGLFramebuffer | null,
    outputWidth: number,
    outputHeight: number,
    sourceWidth: number,
    sourceHeight: number,
    vertexArray: WebGLVertexArrayObject
  ): void {
    const program = this.ensureNativeFxaaFinalizeProgram();
    this.host.gl.bindFramebuffer(this.host.gl.FRAMEBUFFER, framebuffer);
    this.host.gl.viewport(0, 0, outputWidth, outputHeight);
    this.host.gl.useProgram(program);
    this.host.gl.bindVertexArray(vertexArray);
    this.bindFullscreenTexture(0, sourceTexture);
    this.host.gl.uniform1i(this.host.gl.getUniformLocation(program, "u_source"), 0);
    this.host.gl.uniform2f(this.host.gl.getUniformLocation(program, "u_texelSize"), 1 / sourceWidth, 1 / sourceHeight);
    this.host.gl.uniform2f(this.host.gl.getUniformLocation(program, "u_outputTexel"), 1 / outputWidth, 1 / outputHeight);
    this.host.gl.drawArrays(this.host.gl.TRIANGLES, 0, 3);
  }

  createFullscreenProgram(fragmentSource: string, label: string): WebGLProgram {
    const vertex = this.host.device.compileShader(this.host.gl.VERTEX_SHADER, `#version 300 es
precision highp float;
void main() {
  vec2 position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}
`, label);
    const fragment = this.host.device.compileShader(this.host.gl.FRAGMENT_SHADER, fragmentSource, label);
    const program = this.host.gl.createProgram();
    if (!program) {
      this.host.gl.deleteShader(vertex);
      this.host.gl.deleteShader(fragment);
      throw new RenderDeviceError("Failed to allocate WebGL2 fullscreen shader program", "WEBGL_ALLOCATION_FAILED", { label });
    }
    this.host.gl.attachShader(program, vertex);
    this.host.gl.attachShader(program, fragment);
    this.host.gl.linkProgram(program);
    this.host.counters.programCompiles += 1;
    this.host.gl.deleteShader(vertex);
    this.host.gl.deleteShader(fragment);
    if (!this.host.gl.getProgramParameter(program, this.host.gl.LINK_STATUS)) {
      const log = this.host.gl.getProgramInfoLog(program) ?? "Unknown fullscreen shader link error";
      this.host.gl.deleteProgram(program);
      throw new RenderDeviceError("WebGL2 fullscreen shader link failed", "SHADER_LINK_FAILED", { label, log });
    }
    return program;
  }

  ensureLdrPostprocessProgram(): WebGLProgram {
    if (this.ldrPostprocessProgram) {
      return this.ldrPostprocessProgram;
    }
    const vertex = this.host.device.compileShader(this.host.gl.VERTEX_SHADER, `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
  vec2 position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = position;
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}
`, "webgl2-ldr-postprocess");
    const fragment = this.host.device.compileShader(this.host.gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
uniform sampler2D u_source;
uniform vec2 u_texelSize;
uniform int u_hasToneMapping;
uniform int u_toneOperator;
uniform int u_inputColorSpace;
uniform int u_outputColorSpace;
uniform float u_exposure;
uniform float u_whitePoint;
uniform float u_gamma;
uniform int u_hasColorGrade;
uniform float u_contrast;
uniform float u_temperature;
uniform float u_tint;
uniform float u_saturation;
uniform float u_vibrance;
uniform float u_vignette;
uniform float u_sharpening;
uniform int u_hasFxaa;
uniform float u_edgeThreshold;
uniform float u_subpixelBlend;
in vec2 v_uv;
out vec4 outColor;

float srgbToLinear(float value) {
  return value <= 0.04045 ? value / 12.92 : pow((value + 0.055) / 1.055, 2.4);
}

float linearToSrgb(float value) {
  return value <= 0.0031308 ? value * 12.92 : 1.055 * pow(value, 1.0 / 2.4) - 0.055;
}

vec3 decodeColor(vec3 color) {
  return u_inputColorSpace == 1 ? vec3(srgbToLinear(color.r), srgbToLinear(color.g), srgbToLinear(color.b)) : color;
}

vec3 encodeColor(vec3 color) {
  vec3 linear = clamp(color, 0.0, 1.0);
  return u_outputColorSpace == 1 ? vec3(linearToSrgb(linear.r), linearToSrgb(linear.g), linearToSrgb(linear.b)) : linear;
}

vec3 acesRrtAndOdtFit(vec3 value) {
  vec3 numerator = value * (value + 0.0245786) - 0.000090537;
  vec3 denominator = value * (0.983729 * value + 0.4329510) + 0.238081;
  return numerator / denominator;
}

vec3 acesFilmic(vec3 color) {
  // Match current Three.js ACESFilmicToneMapping. ACES is a coupled RGB
  // transform; a scalar approximation shifts hue and washes saturated colors.
  const mat3 acesInput = mat3(
    vec3(0.59719, 0.07600, 0.02840),
    vec3(0.35458, 0.90834, 0.13383),
    vec3(0.04823, 0.01566, 0.83777)
  );
  const mat3 acesOutput = mat3(
    vec3(1.60475, -0.10208, -0.00327),
    vec3(-0.53108, 1.10813, -0.07276),
    vec3(-0.07367, -0.00605, 1.07602)
  );
  vec3 acesColor = acesInput * (color / 0.6);
  acesColor = acesRrtAndOdtFit(acesColor);
  return clamp(acesOutput * acesColor, 0.0, 1.0);
}

float filmic(float value) {
  float x = max(0.0, value);
  float toe = max(0.0, x - 0.004);
  float curve = (toe * (6.2 * toe + 0.5)) / (toe * (6.2 * toe + 1.7) + 0.06);
  return min(curve, x * 1.08);
}

float uncharted2(float value) {
  float a = 0.15;
  float b = 0.5;
  float c = 0.1;
  float d = 0.2;
  float e = 0.02;
  float f = 0.3;
  float w = 11.2;
  float x = value * 2.0;
  float curve = ((x * (a * x + c * b) + d * e) / (x * (a * x + b) + d * f)) - e / f;
  float wx = w;
  float white = ((wx * (a * wx + c * b) + d * e) / (wx * (a * wx + b) + d * f)) - e / f;
  return clamp(curve / white, 0.0, 1.0);
}

float agx(float value) {
  float x = max(0.0, value);
  float encoded = log2(1.0 + x) / log2(17.0);
  return clamp(encoded * encoded * (3.0 - 2.0 * encoded), 0.0, 1.0);
}

float neutral(float value) {
  float x = max(0.0, value);
  return min(1.0, (x * (1.0 + x / 7.5)) / (1.0 + x));
}

float toneMapChannel(float value) {
  float exposed = max(0.0, value * u_exposure) / max(0.0001, u_whitePoint);
  if (u_toneOperator == 0) return min(1.0, exposed);
  if (u_toneOperator == 1) return exposed / (1.0 + exposed);
  if (u_toneOperator == 2) return exposed;
  if (u_toneOperator == 3) return filmic(exposed);
  if (u_toneOperator == 4) return uncharted2(exposed);
  if (u_toneOperator == 5) return agx(exposed);
  return neutral(exposed);
}

vec3 applyToneMapping(vec3 color) {
  if (u_hasToneMapping == 0) return color;
  vec3 decoded = decodeColor(color);
  vec3 mapped = u_toneOperator == 2
    ? acesFilmic(max(vec3(0.0), decoded * u_exposure) / max(0.0001, u_whitePoint))
    : vec3(toneMapChannel(decoded.r), toneMapChannel(decoded.g), toneMapChannel(decoded.b));
  return encodeColor(mapped);
}

vec3 applyColorGrade(vec3 color, vec2 uv) {
  if (u_hasColorGrade == 0) return color;
  float contrastOffset = 0.5 - 0.5 * u_contrast;
  float redShift = u_temperature * 0.08 - u_tint * 0.02;
  float greenShift = u_tint * 0.06;
  float blueShift = -u_temperature * 0.08 - u_tint * 0.02;
  float luma = dot(color, vec3(0.2126, 0.7152, 0.0722));
  vec3 graded = color * u_contrast + vec3(contrastOffset + redShift, contrastOffset + greenShift, contrastOffset + blueShift);
  float distanceFromLuma = min(1.0, abs(graded.r - luma) + abs(graded.g - luma) + abs(graded.b - luma));
  float vibranceBoost = u_vibrance == 0.0 ? 0.0 : u_vibrance * (1.0 - distanceFromLuma);
  float saturation = u_saturation + vibranceBoost;
  graded = vec3(luma) + (graded - vec3(luma)) * saturation;
  vec2 centered = uv * 2.0 - 1.0;
  float vignette = 1.0 - u_vignette * clamp((length(centered) - 0.28) / 1.12, 0.0, 1.0);
  return clamp(graded * vignette, 0.0, 1.0);
}

vec3 baseColorAt(vec2 uv) {
  vec2 clampedUv = clamp(uv, vec2(0.0), vec2(1.0));
  vec3 color = texture(u_source, clampedUv).rgb;
  return applyColorGrade(applyToneMapping(color), clampedUv);
}

vec3 finalColorAt(vec2 uv) {
  vec3 center = baseColorAt(uv);
  if (u_hasColorGrade == 0 || u_sharpening <= 0.0) return center;
  vec3 blur = (
    baseColorAt(uv + vec2(-u_texelSize.x, 0.0)) +
    baseColorAt(uv + vec2(u_texelSize.x, 0.0)) +
    baseColorAt(uv + vec2(0.0, -u_texelSize.y)) +
    baseColorAt(uv + vec2(0.0, u_texelSize.y))
  ) * 0.25;
  return clamp(center + (center - blur) * u_sharpening, 0.0, 1.0);
}

float luma(vec3 color) {
  return dot(color, vec3(0.2126, 0.7152, 0.0722));
}

void main() {
  vec3 center = finalColorAt(v_uv);
  float alpha = texture(u_source, clamp(v_uv, vec2(0.0), vec2(1.0))).a;
  if (u_hasFxaa == 0) {
    outColor = vec4(center, alpha);
    return;
  }
  vec3 north = finalColorAt(v_uv + vec2(0.0, -u_texelSize.y));
  vec3 south = finalColorAt(v_uv + vec2(0.0, u_texelSize.y));
  vec3 west = finalColorAt(v_uv + vec2(-u_texelSize.x, 0.0));
  vec3 east = finalColorAt(v_uv + vec2(u_texelSize.x, 0.0));
  float centerLuma = luma(center);
  float minLuma = min(centerLuma, min(min(luma(north), luma(south)), min(luma(west), luma(east))));
  float maxLuma = max(centerLuma, max(max(luma(north), luma(south)), max(luma(west), luma(east))));
  if (maxLuma - minLuma < u_edgeThreshold) {
    outColor = vec4(center, alpha);
    return;
  }
  vec3 average = (north + south + west + east) * 0.25;
  outColor = vec4(mix(center, average, clamp(u_subpixelBlend, 0.0, 1.0)), alpha);
}
`, "webgl2-ldr-postprocess");
    const program = this.host.gl.createProgram();
    if (!program) {
      this.host.gl.deleteShader(vertex);
      this.host.gl.deleteShader(fragment);
      throw new RenderDeviceError("Failed to allocate WebGL2 LDR postprocess shader", "WEBGL_ALLOCATION_FAILED");
    }
    this.host.gl.attachShader(program, vertex);
    this.host.gl.attachShader(program, fragment);
    this.host.gl.linkProgram(program);
    this.host.counters.programCompiles += 1;
    this.host.gl.deleteShader(vertex);
    this.host.gl.deleteShader(fragment);
    if (!this.host.gl.getProgramParameter(program, this.host.gl.LINK_STATUS)) {
      const log = this.host.gl.getProgramInfoLog(program) ?? "Unknown LDR postprocess shader link error";
      this.host.gl.deleteProgram(program);
      throw new RenderDeviceError("WebGL2 LDR postprocess shader link failed", "SHADER_LINK_FAILED", { log });
    }
    this.ldrPostprocessProgram = program;
    return program;
  }
}

function bloomNumberOption(options: Readonly<Record<string, unknown>>, key: string, fallback: number): number {
  const value = options[key];
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RenderDeviceError(`Bloom ${key} must be a finite number.`, "INVALID_POSTPROCESS_OPTIONS", { key, value });
  }
  return value;
}

function colorSpaceId(value: string): number {
  return value === "srgb" ? 1 : 0;
}

function depthOfFieldNumberOption(options: Readonly<Record<string, unknown>>, key: string, fallback: number): number {
  const value = options[key];
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RenderDeviceError(`Depth-of-field ${key} must be a finite number.`, "INVALID_POSTPROCESS_OPTIONS", { key, value });
  }
  return value;
}

function motionBlurNumberOption(options: Readonly<Record<string, unknown>>, key: string, fallback: number): number {
  const value = options[key];
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RenderDeviceError(`Motion blur ${key} must be a finite number.`, "INVALID_POSTPROCESS_OPTIONS", { key, value });
  }
  return value;
}

function normalizeLdrDepthRange(range: { readonly near: number; readonly far: number } | undefined): {
  readonly near: number;
  readonly far: number;
} {
  const near = range && Number.isFinite(range.near) && range.near > 0 ? range.near : 0.1;
  const far = range && Number.isFinite(range.far) && range.far > near ? range.far : 1000;
  return { near, far };
}

export function normalizeNativeBloomOptions(options: Readonly<Record<string, unknown>>): NativeBloomOptions {
  // PRD-03 §7.2 carve (0b-2): flag-on (`v2` stamp) accepts the HDR option
  // ranges — threshold [0,64], `knee` ratio [0,1] — and drops the
  // `softKnee ≤ 0.5` throw. §7.1 deprecated fields map while the
  // transitional legacy chain still executes: `knee` feeds the soft-knee
  // slot (§6.6 `threshold × kneeRatio` absolute width), authored
  // `scatter`/`radius` map onto the legacy `radius` integer, and
  // `maxIntensity`/`antiBlowout`/`clampLuminance`/`quality`/`shoulder` are
  // accepted and ignored (deprecation diagnostics live in the bridge).
  const v2 = options["v2"] === true;
  const threshold = bloomNumberOption(options, "threshold", 0.75);
  const intensity = bloomNumberOption(options, "intensity", 0.35);
  const knee = bloomNumberOption(options, "knee", NaN);
  const scatter = bloomNumberOption(options, "scatter", NaN);
  const radius = Number.isFinite(scatter)
    ? Math.round(scatter)
    : bloomNumberOption(options, "radius", 1);
  if (threshold < 0 || threshold > (v2 ? 64 : 1)) {
    throw new RenderDeviceError(
      v2 ? "Bloom threshold must be finite and in [0, 64]." : "Bloom threshold must be finite and in [0, 1].",
      "INVALID_POSTPROCESS_OPTIONS",
      { threshold }
    );
  }
  if (intensity < 0) {
    throw new RenderDeviceError("Bloom intensity must be finite and non-negative.", "INVALID_POSTPROCESS_OPTIONS", { intensity });
  }
  if (!Number.isInteger(radius) || radius < 0 || radius > 16) {
    throw new RenderDeviceError("Bloom radius must be an integer in [0, 16].", "INVALID_POSTPROCESS_OPTIONS", { radius });
  }
  if (v2 && Number.isFinite(knee) && (knee < 0 || knee > 1)) {
    throw new RenderDeviceError("Bloom knee must be finite and in [0, 1].", "INVALID_POSTPROCESS_OPTIONS", { knee });
  }
  const authoredSoftKnee = bloomNumberOption(options, "softKnee", 0);
  const softKnee = v2 && Number.isFinite(knee) ? Math.min(0.5, threshold * knee) : authoredSoftKnee;
  if (!v2 && (!(authoredSoftKnee >= 0) || authoredSoftKnee > 0.5)) {
    throw new RenderDeviceError("Bloom softKnee must be finite and in [0, 0.5].", "INVALID_POSTPROCESS_OPTIONS", { softKnee });
  }
  const shoulder = bloomNumberOption(options, "shoulder", 0);
  if (!(shoulder >= 0) || shoulder > 1) {
    throw new RenderDeviceError("Bloom shoulder must be finite and in [0, 1].", "INVALID_POSTPROCESS_OPTIONS", { shoulder });
  }
  let quality: BloomQualityPreset;
  try {
    quality = normalizeBloomQualityPreset(options.quality);
  } catch {
    throw new RenderDeviceError("Bloom quality must be one of performance|balanced|cinematic.", "INVALID_POSTPROCESS_OPTIONS", { quality: options.quality });
  }
  return { threshold, intensity, radius, quality, softKnee, shoulder };
}

function normalizeNativeDepthOfFieldOptions(options: Readonly<Record<string, unknown>>): NativeDepthOfFieldOptions {
  const focusDepth = depthOfFieldNumberOption(options, "focusDepth", 0.5);
  const focusRange = depthOfFieldNumberOption(options, "focusRange", 0.12);
  const maxRadius = depthOfFieldNumberOption(options, "maxRadius", 2);
  if (focusDepth < 0 || focusDepth > 1) {
    throw new RenderDeviceError("Depth-of-field focusDepth must be finite and in [0, 1].", "INVALID_POSTPROCESS_OPTIONS", { focusDepth });
  }
  if (focusRange < 0.001 || focusRange > 1) {
    throw new RenderDeviceError("Depth-of-field focusRange must be finite and in [0.001, 1].", "INVALID_POSTPROCESS_OPTIONS", { focusRange });
  }
  if (!Number.isInteger(maxRadius) || maxRadius < 0 || maxRadius > 8) {
    throw new RenderDeviceError("Depth-of-field maxRadius must be an integer in [0, 8].", "INVALID_POSTPROCESS_OPTIONS", { maxRadius });
  }
  return { focusDepth, focusRange, maxRadius };
}

function normalizeNativeMotionBlurOptions(
  options: Readonly<Record<string, unknown>>,
  width: number,
  height: number
): NativeMotionBlurOptions {
  const samples = motionBlurNumberOption(options, "samples", 5);
  const scale = motionBlurNumberOption(options, "scale", 1);
  if (options.temporal) {
    if (!Number.isInteger(samples) || samples < 2 || samples > 16 || scale < 0 || scale > 8) throw new RenderDeviceError("Invalid motion blur samples/scale", "INVALID_POSTPROCESS_OPTIONS");
    return { samples, scale, temporal: options.temporal as TemporalGpuBindings };
  }
  const value = options.velocity;
  if (!(value instanceof Float32Array) && !Array.isArray(value)) {
    throw new RenderDeviceError("Motion blur requires a velocity Float32Array or number array.", "WEBGL_LDR_POSTPROCESS_VELOCITY_REQUIRED");
  }
  const velocity = value instanceof Float32Array ? value : new Float32Array(value as number[]);
  if (velocity.length !== width * height * 2) {
    throw new RenderDeviceError("Motion blur velocity must contain width * height * 2 float samples.", "INVALID_POSTPROCESS_OPTIONS", {
      expectedLength: width * height * 2,
      actualLength: velocity.length
    });
  }
  if (!Number.isInteger(samples) || samples < 2 || samples > 16) {
    throw new RenderDeviceError("Motion blur samples must be an integer in [2, 16].", "INVALID_POSTPROCESS_OPTIONS", { samples });
  }
  if (scale < 0 || scale > 8) {
    throw new RenderDeviceError("Motion blur scale must be finite and in [0, 8].", "INVALID_POSTPROCESS_OPTIONS", { scale });
  }
  return { samples, scale, velocity };
}

function normalizeNativeOutlineOptions(options: Readonly<Record<string, unknown>>): NativeOutlineOptions {
  const width = outlineNumberOption(options, "width", 1);
  const threshold = outlineNumberOption(options, "threshold", 0.22);
  const opacity = outlineNumberOption(options, "opacity", 0.85);
  const value = options.color;
  const sourceColor = value === undefined ? [255, 188, 64, 255] : value;
  if (
    !Array.isArray(sourceColor)
    || (sourceColor.length !== 3 && sourceColor.length !== 4)
    || sourceColor.some((channel) => typeof channel !== "number" || !Number.isFinite(channel) || channel < 0 || channel > 255)
  ) {
    throw new RenderDeviceError("Outline color must contain three or four finite channels in [0, 255].", "INVALID_POSTPROCESS_OPTIONS", { color: value });
  }
  if (!Number.isInteger(width) || width < 1 || width > 6) {
    throw new RenderDeviceError("Outline width must be an integer in [1, 6].", "INVALID_POSTPROCESS_OPTIONS", { width });
  }
  if (threshold < 0 || threshold > 4) {
    throw new RenderDeviceError("Outline threshold must be finite and in [0, 4].", "INVALID_POSTPROCESS_OPTIONS", { threshold });
  }
  if (opacity < 0 || opacity > 1) {
    throw new RenderDeviceError("Outline opacity must be finite and in [0, 1].", "INVALID_POSTPROCESS_OPTIONS", { opacity });
  }
  const color: readonly [number, number, number, number] = [
    sourceColor[0] as number,
    sourceColor[1] as number,
    sourceColor[2] as number,
    (sourceColor[3] ?? 255) as number
  ];
  return { width, threshold, opacity, color };
}

function normalizeNativeSsaoOptions(options: Readonly<Record<string, unknown>>): NativeSsaoOptions {
  const radius = ssaoNumberOption(options, "radius", 2);
  const intensity = ssaoNumberOption(options, "intensity", 0.38);
  const bias = ssaoNumberOption(options, "bias", 0.015);
  if (!Number.isInteger(radius) || radius < 1 || radius > 8) {
    throw new RenderDeviceError("SSAO radius must be an integer in [1, 8].", "INVALID_POSTPROCESS_OPTIONS", { radius });
  }
  if (intensity < 0 || intensity > 2) {
    throw new RenderDeviceError("SSAO intensity must be finite and in [0, 2].", "INVALID_POSTPROCESS_OPTIONS", { intensity });
  }
  if (bias < 0 || bias > 0.25) {
    throw new RenderDeviceError("SSAO bias must be finite and in [0, 0.25].", "INVALID_POSTPROCESS_OPTIONS", { bias });
  }
  return { radius, intensity, bias };
}

function normalizeNativeSsrOptions(options: Readonly<Record<string, unknown>>): NativeSsrOptions {
  const intensity = ssrNumberOption(options, "intensity", 0.32);
  const maxDistance = ssrNumberOption(options, "maxDistance", 16);
  if (intensity < 0 || intensity > 2) {
    throw new RenderDeviceError("SSR intensity must be finite and in [0, 2].", "INVALID_POSTPROCESS_OPTIONS", { intensity });
  }
  if (!Number.isInteger(maxDistance) || maxDistance < 1 || maxDistance > 64) {
    throw new RenderDeviceError("SSR maxDistance must be an integer in [1, 64].", "INVALID_POSTPROCESS_OPTIONS", { maxDistance });
  }
  const projection = options["projection"];
  if (!(projection instanceof Float32Array)) throw new RenderDeviceError("Native SSR requires the actual frame projection or view-projection matrix.", "INVALID_POSTPROCESS_OPTIONS");
  const inverseProjection = invertSsrProjection(projection);
  return { intensity, maxDistance, projection, inverseProjection };
}

function normalizeNativeTaaOptions(
  options: Readonly<Record<string, unknown>>,
  width: number,
  height: number
): NativeTaaOptions {
  const blend = taaNumberOption(options, "blend", 0.18);
  if (options.temporal) {
    if (blend < 0 || blend > .95) throw new RenderDeviceError("Invalid TAA blend", "INVALID_POSTPROCESS_OPTIONS");
    return { blend, temporal: options.temporal as TemporalGpuBindings };
  }
  const history = options.history;
  if (!(history instanceof Uint8Array)) {
    throw new RenderDeviceError("TAA requires a Uint8Array history buffer.", "WEBGL_LDR_POSTPROCESS_HISTORY_REQUIRED");
  }
  if (history.byteLength !== width * height * 4) {
    throw new RenderDeviceError("TAA history must contain width * height * 4 RGBA bytes.", "INVALID_POSTPROCESS_OPTIONS", {
      expectedLength: width * height * 4,
      actualLength: history.byteLength
    });
  }
  if (blend < 0 || blend > 0.95) {
    throw new RenderDeviceError("TAA blend must be finite and in [0, 0.95].", "INVALID_POSTPROCESS_OPTIONS", { blend });
  }
  return { blend, history };
}

function numberOption(options: Readonly<Record<string, unknown>>, key: string, fallback: number): number {
  const value = options[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function outlineNumberOption(options: Readonly<Record<string, unknown>>, key: string, fallback: number): number {
  const value = options[key];
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RenderDeviceError(`Outline ${key} must be a finite number.`, "INVALID_POSTPROCESS_OPTIONS", { key, value });
  }
  return value;
}

function ssaoNumberOption(options: Readonly<Record<string, unknown>>, key: string, fallback: number): number {
  const value = options[key];
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RenderDeviceError(`SSAO ${key} must be a finite number.`, "INVALID_POSTPROCESS_OPTIONS", { key, value });
  }
  return value;
}

function ssrNumberOption(options: Readonly<Record<string, unknown>>, key: string, fallback: number): number {
  const value = options[key];
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RenderDeviceError(`SSR ${key} must be a finite number.`, "INVALID_POSTPROCESS_OPTIONS", { key, value });
  }
  return value;
}

function stringOption(options: Readonly<Record<string, unknown>>, key: string, fallback: string): string {
  const value = options[key];
  return typeof value === "string" ? value : fallback;
}

function taaNumberOption(options: Readonly<Record<string, unknown>>, key: string, fallback: number): number {
  const value = options[key];
  if (value === undefined) return fallback;
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new RenderDeviceError(`TAA ${key} must be a finite number.`, "INVALID_POSTPROCESS_OPTIONS", { key, value });
  }
  return value;
}

function toneMappingOperatorId(value: string): number {
  if (value === "linear") return 0;
  if (value === "reinhard") return 1;
  if (value === "aces") return 2;
  if (value === "filmic") return 3;
  if (value === "uncharted2") return 4;
  if (value === "agx") return 5;
  return 6;
}

/* ------------------------------------------------------------------------- */
/* C-13 v2 seam (PRD-03 Phase 2, CCR-03-5)                                    */
/* ------------------------------------------------------------------------- */

/**
 * The §6.1 OUT stage adapted onto the proven native tone program (C-05
 * OutputPass stub): single tonemap operator + sRGB encode. `exposure`
 * defaults to the pipeline bag's §6.4 product — while the transitional
 * chain applies exposure here, the final graph applies it in S10 composite
 * and this pass receives `1`.
 */
export function createLegacyOutputPass(
  pipeline: PostPipelineOptions,
  base?: Readonly<Record<string, unknown>>
): LdrPostprocessPassDescriptor {
  const operator = pipeline.toneMapping === "none" ? "linear" : pipeline.toneMapping;
  return {
    name: "tone-mapping",
    options: {
      ...(base ?? {}),
      operator,
      exposure: pipeline.exposure,
      inputColorSpace: "srgb-linear",
      outputColorSpace: "srgb",
      // §6.1 OUT.dithering: false — the S12 finalize owns the triangular
      // dither; a second dither here would double-dither.
      ...(pipeline.dither === false ? { dithering: false } : {})
    }
  };
}

/**
 * `executePostGraphWebGL2` — the C-13 device carve (CONTRACTS §3.1 /
 * PRD-03 §7.2). It receives the device's GL internals (the registered
 * `WebGL2DeviceHost`) plus the already-planned LDR descriptors, replaces
 * the legacy `tone-mapping` descriptor with `createLegacyOutputPass`,
 * stamps `v2` on bloom options (the §7.2 field-range carve), and runs the
 * proven native fused path. Phases 3–6 grow this seam stage-by-stage into
 * the real v2 GPU loop (S1–S12) without touching `WebGL2Device.ts`.
 */
export function executePostGraphWebGL2(
  host: WebGL2DeviceHost | null,
  source: RenderTarget,
  request: {
    readonly pipeline: PostPipelineOptions;
    readonly passes: readonly LdrPostprocessPassDescriptor[];
    /**
     * The deferred `post/v2Entry` module bag (import()ed by the async path —
     * the only `post/` GPU code edge in the renderer). Undefined on the sync
     * path; the transitional fused mapping does not need it.
     */
    readonly v2?: typeof import("../post/v2Entry");
    /** C-38 frame camera for the v2 HDR stages (S1/S2/S4) — Phase 3. */
    readonly cameraFrame?: FrameCamera;
    /** Phase 4: flag-on TemporalHistory bindings (C-14 matrices + surfaces). */
    readonly temporal?: import("../TemporalHistory").TemporalGpuBindings;
    readonly outputTarget?: RenderTarget;
    readonly depthRange?: { readonly near: number; readonly far: number };
  }
): void {
  if (!host) {
    throw new RenderDeviceError("PostGraph v2 requires a WebGL2 device host.", "POST_GRAPH_V2_UNSUPPORTED");
  }
  const v2 = request.v2;
  const pipeline = request.pipeline;
  // Phase 3: real S1/S2/S4 + CA run on the HDR target before the fused
  // present; S10b/S11/S12 run as the LDR tail after it.
  let workSource = source;
  if (v2) {
    workSource = v2.runV2HdrStages(host, source, pipeline, request.cameraFrame, request.temporal).target;
  }
  const needsTail = Boolean(v2 && v2.v2NeedsLdrTail(pipeline));
  const ldrTailTarget = needsTail && v2
    ? v2.acquireV2Target(host, { width: source.width, height: source.height, format: "rgba8" })
    : undefined;
  // With a real S12 the fused OUT must not emit the legacy dither — the
  // finalize pass owns the single triangular dither for the frame.
  const pipelineForOut = needsTail && pipeline.dither !== false
    ? { ...pipeline, dither: false as const }
    : pipeline;
  const passes = request.passes
    // §6.9: on the v2 chain S2 GTAO owns occlusion — the legacy SSAO pass is
    // not scheduled (it would double-darken against the §6.3 apply).
    .filter((pass) => !(v2 && pipeline.ao && pass.name === ("ssao" as LdrPostprocessPassName)))
    .map((pass) => {
    if (pass.name === ("tone-mapping" as LdrPostprocessPassName)) {
      return createLegacyOutputPass(pipelineForOut, pass.options);
    }
    if (pass.name === ("bloom" as LdrPostprocessPassName)) {
      return { name: pass.name, options: { ...pass.options, v2: true } } as LdrPostprocessPassDescriptor;
    }
    return pass;
  });
  host.post.presentLdrPostprocess(workSource, {
    passes,
    ...(ldrTailTarget ?? request.outputTarget ? { outputTarget: ldrTailTarget ?? request.outputTarget } : {}),
    toneMappingDefaults: { outputColorSpace: "srgb" },
    depthRange: {
      near: request.depthRange?.near ?? request.pipeline.depthRange.near,
      far: request.depthRange?.far ?? request.pipeline.depthRange.far
    }
  });
  if (workSource !== source && v2) v2.releaseV2Target(host, workSource);
  if (ldrTailTarget && v2) {
    v2.runV2LdrTail(host, ldrTailTarget, pipeline, request.outputTarget);
    v2.releaseV2Target(host, ldrTailTarget);
  }
}
