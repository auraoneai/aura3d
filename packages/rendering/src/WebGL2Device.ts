import { temporalAccumulationWeight } from "./TemporalMath";
import { invertSsrProjection } from "./ProjectionMath";
import type { TemporalGpuBindings } from "./TemporalHistory";
import {
  type BufferUsage,
  type DrawCommand,
  type GpuTargetInventoryEntry,
  type InstanceVertexAttribute,
  type LdrPostprocessPassDescriptor,
  type LdrPostprocessPresentationOptions,
  type RenderBuffer,
  type RenderDevice,
  RenderDeviceError,
  type RenderDeviceDiagnostics,
  type RenderDeviceInfo,
  type RenderShaderProgram,
  type RenderTarget,
  type RenderTargetDescriptor,
  type ShaderReflection,
  type ShaderSources,
  resolveGpuTargetOwner,
  spreadGpuTargetInventory,
} from "./RenderDevice";
import { Texture, isCompressedTextureFormat, isFloatColorTextureFormat, type TextureCompressedFormat, type TextureCubeFace, type TextureFormat, type TexturePixelData } from "./Texture";
import { isTextureBinding, TextureBinding } from "./TextureBinding";
import type { Sampler, TextureMagFilter, TextureMinFilter } from "./Sampler";
import { type VertexAttribute, type VertexFormat } from "./VertexFormat";
import { WebGL2StateCache } from "./WebGL2StateCache";
import {
  BLOOM_BRIGHT_LUT_HEIGHT,
  BLOOM_BRIGHT_LUT_WIDTH,
  BLOOM_COMPOSITE_LUT_SIZE,
  OUTLINE_BLEND_LUT_WIDTH,
  OUTLINE_LIMB_RADIX,
  createOutlineBlendLut,
  createOutlineGradientBound,
  createBloomBrightThresholdLut,
  createBloomCompositeLut
} from "./postprocess/NativeLdrEffectLuts";
import {
  normalizeBloomQualityPreset,
  resolveBloomPyramidBlurRadii,
  resolveBloomPyramidPlan,
  resolveBloomPyramidResponseGain,
  type BloomPyramidPlan,
  type BloomQualityPreset,
} from "./postprocess/NativeBloomPyramid";
import { WebGL2Counters } from "./webgl2/Counters";
import { createWebGL2DeviceProbe } from "./webgl2/Probe";
import type { DeviceCounters, DeviceProbe } from "./contracts/device";
import type { WebGL2DeviceHost } from "./webgl2/DeviceHost";
import { WebGL2ContextLifecycle } from "./webgl2/ContextLifecycle";
import { WebGL2TextureRegistry } from "./webgl2/TextureUpload";
import { WebGL2SamplerRegistry } from "./webgl2/Samplers";
import { WebGL2DrawCallBinder } from "./webgl2/MultiDraw";
import { WebGL2ReadbackProbe } from "./webgl2/Probe";
import { WebGL2LegacyPostPipeline } from "./webgl2/LegacyPost";
import { cubeFaceTarget, rgba8TextureInternalFormat, textureUploadFormat, resolveRenderTargetFormat, resolveCompressedTextureFormat, magFilter, minFilter, addressMode } from "./webgl2/TextureFormats";

export interface TextureFilterAnisotropicExtension {
  readonly TEXTURE_MAX_ANISOTROPY_EXT: GLenum;
  readonly MAX_TEXTURE_MAX_ANISOTROPY_EXT: GLenum;
}

export const WEBGL_CUBE_FACES: readonly TextureCubeFace[] = ["px", "nx", "py", "ny", "pz", "nz"];

export interface WebGL2DeviceOptions {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly antialias?: boolean;
  readonly alpha?: boolean;
  readonly preserveDrawingBuffer?: boolean;
  /** §6.9 (lane 01): forwarded to getContext when set; absent = browser default. */
  readonly powerPreference?: WebGLPowerPreference;
  readonly errorCheckMode?: WebGL2ErrorCheckMode;
}

export type WebGL2ErrorCheckMode = "strict" | "frame";

export class WebGL2Buffer implements RenderBuffer {
  public disposed = false;

  constructor(
    public readonly id: number,
    public readonly usage: BufferUsage,
    public readonly byteLength: number,
    public readonly target: GLenum,
    public readonly handle: WebGLBuffer,
    private readonly gl: WebGL2RenderingContext
  ) {}

  dispose(): void {
    if (!this.disposed) {
      this.gl.deleteBuffer(this.handle);
      this.disposed = true;
    }
  }
}

export class WebGL2ShaderProgram implements RenderShaderProgram {
  public disposed = false;

  constructor(
    public readonly id: number,
    public readonly label: string,
    public readonly marker: string,
    public readonly reflection: ShaderReflection,
    public readonly handle: WebGLProgram,
    private readonly gl: WebGL2RenderingContext
  ) {}

  dispose(): void {
    if (!this.disposed) {
      this.gl.deleteProgram(this.handle);
      this.disposed = true;
    }
  }
}

export interface WebGL2RenderTargetOptions {
  readonly dimension?: "2d" | "cube" | "2d-array";
  readonly layers?: number;
  readonly colorTextures?: readonly Texture[];
  readonly extraColorHandles?: readonly WebGLTexture[];
  readonly layerFramebuffers?: readonly WebGLFramebuffer[];
  readonly layerTargets?: readonly RenderTarget[];
  /** Layer children share the parent's GL resources; dispose only marks them. */
  readonly layerChild?: boolean;
}

export class WebGL2RenderTarget implements RenderTarget {
  public disposed = false;
  public needsResolve = false;
  public readonly dimension: "2d" | "cube" | "2d-array";
  public readonly layers?: number;
  public readonly colorTextures?: readonly Texture[];
  public layerTargets?: readonly RenderTarget[];
  private readonly extraColorHandles: readonly WebGLTexture[];
  private readonly layerFramebuffers: readonly WebGLFramebuffer[];
  private readonly layerChild: boolean;

  constructor(
    public readonly id: number,
    public readonly width: number,
    public readonly height: number,
    public readonly label: string,
    public readonly colorTexture: Texture,
    public readonly depthTexture: Texture | undefined,
    public readonly framebuffer: WebGLFramebuffer,
    public readonly colorHandle: WebGLTexture,
    public readonly depthHandle: WebGLRenderbuffer | null,
    public readonly depthTextureHandle: WebGLTexture | null,
    public readonly sampleCount: number,
    public readonly drawFramebuffer: WebGLFramebuffer,
    public readonly multisampleColorHandle: WebGLRenderbuffer | null,
    private readonly gl: WebGL2RenderingContext,
    options: WebGL2RenderTargetOptions = {}
  ) {
    this.dimension = options.dimension ?? "2d";
    this.layers = options.layers;
    this.colorTextures = options.colorTextures;
    this.layerTargets = options.layerTargets;
    this.extraColorHandles = options.extraColorHandles ?? [];
    this.layerFramebuffers = options.layerFramebuffers ?? [];
    this.layerChild = options.layerChild === true;
  }

  dispose(): void {
    if (!this.disposed) {
      if (this.layerChild) {
        this.disposed = true;
        return;
      }
      for (const framebuffer of this.layerFramebuffers) {
        if (framebuffer !== this.framebuffer) this.gl.deleteFramebuffer(framebuffer);
      }
      this.gl.deleteFramebuffer(this.framebuffer);
      if (this.drawFramebuffer !== this.framebuffer) this.gl.deleteFramebuffer(this.drawFramebuffer);
      this.gl.deleteTexture(this.colorHandle);
      for (const handle of this.extraColorHandles) {
        this.gl.deleteTexture(handle);
      }
      if (this.depthHandle) this.gl.deleteRenderbuffer(this.depthHandle);
      if (this.multisampleColorHandle) this.gl.deleteRenderbuffer(this.multisampleColorHandle);
      if (this.depthTextureHandle) this.gl.deleteTexture(this.depthTextureHandle);
      this.colorTexture.dispose();
      for (const texture of this.colorTextures ?? []) {
        if (texture !== this.colorTexture) texture.dispose();
      }
      this.depthTexture?.dispose();
      for (const child of this.layerTargets ?? []) {
        (child as WebGL2RenderTarget).disposed = true;
      }
      this.disposed = true;
    }
  }
}















export interface WebGL2BloomDiagnostics {
  readonly quality: BloomQualityPreset;
  readonly mipCount: number;
  readonly targetCount: number;
  readonly targetBytes: number;
  readonly compositeGain: number;
  readonly threshold: number;
  readonly intensity: number;
  readonly softKnee: number;
  readonly shoulder: number;
  readonly halfFloat: boolean;
}













export class WebGL2Device implements RenderDevice {
  public readonly kind = "webgl2";
  public readonly info: RenderDeviceInfo;
  private readonly gl: WebGL2RenderingContext;
  private nextId = 1;



  private buffers = new Set<WebGL2Buffer>();
  private shaders = new Set<WebGL2ShaderProgram>();
  private renderTargets = new Set<WebGL2RenderTarget>();




































  private readonly stateCache = new WebGL2StateCache({ label: "webgl2-device-state-cache" });






















  private readonly maxVertexAttributes: number;
  private readonly anisotropicFilteringExtension: TextureFilterAnisotropicExtension | null;
  private readonly maxTextureAnisotropy: number;
  /**
   * WS-2.6 — subscribers for context loss and restoration.
   *
   * The device has tracked `contextLost` since before 1.6 and acted on it internally, but nothing
   * could *observe* it: there was no callback, so a consumer could only poll `diagnostics()`. That is
   * why the parity table listed context-loss recovery as a gap while the listeners existed — the
   * device layer was never the gap, the absence of a public signal was.
   */






  private readonly host: WebGL2DeviceHost;
  /** C-28: device capability probe, filled from extension detection in the ctor. */
  readonly probe: DeviceProbe;

  static create(options: WebGL2DeviceOptions): WebGL2Device {
    const gl = options.canvas.getContext("webgl2", {
      antialias: options.antialias ?? true,
      alpha: options.alpha ?? false,
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false,
      ...(options.powerPreference !== undefined ? { powerPreference: options.powerPreference } : {})
    });
    if (!gl) {
      throw new RenderDeviceError("WebGL2 is not available for the provided canvas", "WEBGL2_UNAVAILABLE");
    }
    // Default to frame-level error checking.
    //
    // `strict` calls `gl.getError()` after every uniform upload, vertex-format
    // bind, and draw. `gl.getError()` forces a synchronous CPU/GPU sync, so on a
    // scene with a few dozen draws and many uniforms per draw it dominates frame
    // time: profiling Aura Clash attributed ~93% of frame time to `getError`,
    // holding the route at ~11 FPS on an Apple M4 Max. Frame-level checking still
    // reports real WebGL errors (read once in `endFrame` and surfaced through
    // `lastError`); callers that need per-operation attribution can still opt into
    // `strict` explicitly.
    return new WebGL2Device(gl as WebGL2RenderingContext, options.canvas, options.errorCheckMode ?? "frame");
  }

  private constructor(
    gl: WebGL2RenderingContext,
    canvas: HTMLCanvasElement | OffscreenCanvas,
    private readonly errorCheckMode: WebGL2ErrorCheckMode
  ) {
    this.gl = gl;
    // A browser returns the same WebGL2 context object after `webglcontextrestored`.
    // The controller that owned it before the loss is disposed before a replacement
    // device mounts, and Chromium can leave an INVALID_OPERATION from that stale
    // resource teardown in the context's error queue. A fresh device must establish
    // its own error boundary; otherwise its first valid uniform upload or presentation
    // is blamed for an error produced by the previous owner.
    for (let index = 0; index < 16 && gl.getError() !== gl.NO_ERROR; index += 1) {
      // Drain only errors that predate this device. Normal frame/strict checks still
      // report every error generated after construction.
    }
    this.maxVertexAttributes = gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number;
    this.anisotropicFilteringExtension = gl.getExtension("EXT_texture_filter_anisotropic") as TextureFilterAnisotropicExtension | null;
    this.maxTextureAnisotropy = this.anisotropicFilteringExtension
      ? Math.max(1, gl.getParameter(this.anisotropicFilteringExtension.MAX_TEXTURE_MAX_ANISOTROPY_EXT) as number)
      : 1;
    this.info = {
      backend: "webgl2",
      vendor: gl.getParameter(gl.VENDOR) as string,
      renderer: gl.getParameter(gl.RENDERER) as string,
      capabilities: [
        "buffers",
        "buffer-readback",
        "shader-validation",
        "render-targets",
        "pixel-readback",
        "postprocess-presentation",
        "draw-validation",
        "rasterization",
        "depth-render-targets",
        "depth-textures",
        "spot-shadow-maps",
        "point-shadow-maps",
        "hdr-image-based-lighting",
        ...(this.anisotropicFilteringExtension ? ["anisotropic-texture-filtering" as const] : []),
        ...(gl.getExtension("EXT_color_buffer_float") ? ["hdr-render-targets" as const, "float-readback" as const] : [])
      ]
    };

    const host = {
      gl,
      stateCache: this.stateCache,
      counters: new WebGL2Counters(),
      buffers: this.buffers,
      shaders: this.shaders,
      renderTargets: this.renderTargets,
      activeRenderTarget: null,
      disposed: false,
      contextLost: false,
      errorCheckMode: this.errorCheckMode,
      anisotropicFilteringExtension: this.anisotropicFilteringExtension,
      maxTextureAnisotropy: this.maxTextureAnisotropy,
      maxVertexAttributes: this.maxVertexAttributes,
      resolveMultisampleTarget: (target: WebGL2RenderTarget) => this.resolveMultisampleTarget(target),
      device: this
    } as unknown as WebGL2DeviceHost;
    host.lifecycle = new WebGL2ContextLifecycle(host, canvas);
    host.textureRegistry = new WebGL2TextureRegistry(host);
    host.samplers = new WebGL2SamplerRegistry(host);
    host.drawBinder = new WebGL2DrawCallBinder(host);
    host.probe = new WebGL2ReadbackProbe(host);
    host.post = new WebGL2LegacyPostPipeline(host);
    this.host = host;
    this.probe = createWebGL2DeviceProbe(gl);

  }

  /**
   * Subscribe to WebGL context loss. Returns an unsubscribe function.
   *
   * A lost context is not an error a caller can prevent — the browser reclaims GPU resources under
   * memory pressure, on driver reset, or when a tab is backgrounded too long. What a caller can do is
   * be told, so it can recreate resources rather than render nothing.
   */




  get disposed(): boolean {
    return this.host.disposed;
  }

  set disposed(value: boolean) {
    this.host.disposed = value;
  }

  get contextLost(): boolean {
    return this.host.contextLost;
  }

  set contextLost(value: boolean) {
    this.host.contextLost = value;
  }

  onDeviceLost(listener: () => void): () => void {
    return this.host.lifecycle.onDeviceLost(listener);
  }

  onDeviceRestored(listener: () => void): () => void {
    return this.host.lifecycle.onDeviceRestored(listener);
  }

  isDeviceLost(): boolean {
    return this.host.lifecycle.isDeviceLost();
  }

  beginFrame(width: number, height: number): void {
    this.host.lifecycle.beginFrame(width, height);
  }

  clear(color: readonly [number, number, number, number]): void {
    this.host.lifecycle.clear(color);
  }

  clearRenderTarget(color: readonly [number, number, number, number], attachment?: number): void {
    this.host.lifecycle.clearRenderTarget(color, attachment);
  }

  endFrame(): void {
    this.host.lifecycle.endFrame();
  }

  draw(command: DrawCommand): void {
    this.host.drawBinder.draw(command);
  }

  readPixels(x: number, y: number, width: number, height: number, attachment?: number): Uint8Array {
    return this.host.probe.readPixels(x, y, width, height, attachment);
  }

  readFloatPixels(x: number, y: number, width: number, height: number): Float32Array {
    return this.host.probe.readFloatPixels(x, y, width, height);
  }

  readDepthPixels(x: number, y: number, width: number, height: number): Float32Array {
    return this.host.probe.readDepthPixels(x, y, width, height);
  }

  writeRenderTargetPixels(target: RenderTarget, pixels: Uint8Array): void {
    this.host.probe.writeRenderTargetPixels(target, pixels);
  }

  presentRenderTarget(source: RenderTarget): void {
    this.host.post.presentRenderTarget(source);
  }

  presentLdrPostprocess(source: RenderTarget, options: LdrPostprocessPresentationOptions): void {
    this.host.post.presentLdrPostprocess(source, options);
  }

  executeReflectionSurfaceSsr(source: RenderTarget, normalMask: RenderTarget, output: RenderTarget,
    options: { projection: Float32Array; inverseProjection: Float32Array; maxSteps: number; maxDistance: number; thickness: number; intensity: number }): void {
    this.host.post.executeReflectionSurfaceSsr(source, normalMask, output, options);
  }

  getBloomDiagnostics(): WebGL2BloomDiagnostics | null {
    return this.host.post.getBloomDiagnostics();
  }

  /** C-28: partial counters from existing diagnostics and the wrapped counter fields. */
  counters(): DeviceCounters {
    const diagnostics = this.getDiagnostics();
    return {
      drawCalls: this.host.counters.drawCalls,
      bufferCreates: diagnostics.buffers,
      textureUploads: diagnostics.textures ?? 0,
      readbacks: this.host.counters.readbacks,
      renderTargetsCreated: diagnostics.renderTargets ?? 0,
      programCompiles: this.host.counters.programCompiles,
      liveBuffers: diagnostics.buffers,
      liveVertexArrays: this.host.drawBinder.vertexArrayCache.size,
      textureBytes: diagnostics.textureBytes ?? 0,
      renderTargetBytes: 0
    };
  }

  resetFrameCounters(): void {
    this.host.counters.drawCalls = 0;
    this.host.counters.readbacks = 0;
  }

  compileAsync(sources: ShaderSources): Promise<RenderShaderProgram> {
    return Promise.resolve(this.createShaderProgram(sources));
  }

  multiDrawElementsInstanced(draws: readonly unknown[]): void {
    this.host.drawBinder.multiDrawElementsInstanced(draws);
  }

  createBuffer(usage: BufferUsage, byteLength: number, initialData?: ArrayBufferView): RenderBuffer {
    this.host.lifecycle.assertAlive();
    if (byteLength <= 0 || !Number.isInteger(byteLength)) {
      throw new RenderDeviceError("Buffer byteLength must be a positive integer", "INVALID_BUFFER_SIZE", { byteLength });
    }

    const handle = this.gl.createBuffer();
    if (!handle) {
      throw new RenderDeviceError("Failed to allocate WebGL buffer", "WEBGL_ALLOCATION_FAILED");
    }

    const target = usage === "index" ? this.gl.ELEMENT_ARRAY_BUFFER : this.gl.ARRAY_BUFFER;
    this.host.drawBinder.bindNoVertexArray();
    this.stateCache.bindBuffer(target, handle, () => this.gl.bindBuffer(target, handle));
    this.gl.bufferData(target, byteLength, this.gl.DYNAMIC_DRAW);
    if (initialData) {
      if (initialData.byteLength > byteLength) {
        throw new RenderDeviceError("Initial data exceeds buffer size", "BUFFER_OVERFLOW", {
          byteLength,
          dataByteLength: initialData.byteLength
        });
      }
      this.gl.bufferSubData(target, 0, initialData);
    }

    const buffer = new WebGL2Buffer(this.nextId++, usage, byteLength, target, handle, this.gl);
    this.buffers.add(buffer);
    return buffer;
  }

  updateBuffer(buffer: RenderBuffer, byteOffset: number, data: ArrayBufferView): void {
    this.host.lifecycle.assertAlive();
    const webglBuffer = this.host.drawBinder.requireBuffer(buffer);
    if (byteOffset < 0 || byteOffset + data.byteLength > webglBuffer.byteLength) {
      throw new RenderDeviceError("Buffer update range is out of bounds", "BUFFER_RANGE_OUT_OF_BOUNDS", {
        byteOffset,
        dataByteLength: data.byteLength,
        byteLength: webglBuffer.byteLength
      });
    }
    this.host.drawBinder.bindNoVertexArray();
    this.stateCache.bindBuffer(webglBuffer.target, webglBuffer.handle, () => this.gl.bindBuffer(webglBuffer.target, webglBuffer.handle));
    this.gl.bufferSubData(webglBuffer.target, byteOffset, data);
    this.host.counters.bufferUpdateCount += 1;
  }

  readBuffer(buffer: RenderBuffer, byteOffset = 0, byteLength = buffer.byteLength - byteOffset): Uint8Array {
    this.host.lifecycle.assertAlive();
    const webglBuffer = this.host.drawBinder.requireBuffer(buffer);
    if (byteOffset < 0 || byteLength < 0 || byteOffset + byteLength > webglBuffer.byteLength) {
      throw new RenderDeviceError("Buffer read range is out of bounds", "BUFFER_RANGE_OUT_OF_BOUNDS", {
        byteOffset,
        byteLength,
        bufferByteLength: webglBuffer.byteLength
      });
    }
    const output = new Uint8Array(byteLength);
    this.host.drawBinder.bindNoVertexArray();
    this.stateCache.bindBuffer(webglBuffer.target, webglBuffer.handle, () => this.gl.bindBuffer(webglBuffer.target, webglBuffer.handle));
    this.gl.getBufferSubData(webglBuffer.target, byteOffset, output);
    return output;
  }

  createShaderProgram(sources: ShaderSources): RenderShaderProgram {
    this.host.lifecycle.assertAlive();
    if (!sources.vertex.includes(sources.marker) || !sources.fragment.includes(sources.marker)) {
      throw new RenderDeviceError("Shader source marker is missing from compiled sources", "SHADER_MARKER_MISSING", {
        label: sources.label,
        marker: sources.marker
      });
    }
    const vertexShader = this.compileShader(this.gl.VERTEX_SHADER, sources.vertex, sources.label);
    const fragmentShader = this.compileShader(this.gl.FRAGMENT_SHADER, sources.fragment, sources.label);
    const program = this.gl.createProgram();
    if (!program) {
      throw new RenderDeviceError("Failed to allocate WebGL shader program", "WEBGL_ALLOCATION_FAILED");
    }
    this.host.counters.shaderProgramCreateCount += 1;
    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);
    this.host.counters.programCompiles += 1;
    this.gl.deleteShader(vertexShader);
    this.gl.deleteShader(fragmentShader);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const log = this.gl.getProgramInfoLog(program) ?? "Unknown shader link error";
      this.gl.deleteProgram(program);
      throw new RenderDeviceError("WebGL shader link failed", "SHADER_LINK_FAILED", { label: sources.label, log });
    }

    const shader = new WebGL2ShaderProgram(
      this.nextId++,
      sources.label,
      sources.marker,
      this.reflectProgram(program),
      program,
      this.gl
    );
    this.shaders.add(shader);
    return shader;
  }

  createRenderTarget(descriptor: RenderTargetDescriptor): RenderTarget {
    this.host.lifecycle.assertAlive();
    if (
      (descriptor.dimension !== undefined && descriptor.dimension !== "2d") ||
      descriptor.layers !== undefined ||
      descriptor.depthOnly === true ||
      descriptor.depthCompare === true ||
      (descriptor.colorAttachments?.length ?? 0) > 0
    ) {
      return this.createFeatureRenderTarget(descriptor);
    }
    if (
      !Number.isInteger(descriptor.width) ||
      descriptor.width <= 0 ||
      !Number.isInteger(descriptor.height) ||
      descriptor.height <= 0
    ) {
      throw new RenderDeviceError("Render target dimensions must be positive integers", "INVALID_RENDER_TARGET_SIZE", {
        width: descriptor.width,
        height: descriptor.height,
        label: descriptor.label
      });
    }
    const requestedSampleCount = descriptor.sampleCount ?? 1;
    const maxSamples = Number(this.gl.getParameter(this.gl.MAX_SAMPLES) ?? 1);
    if (!Number.isInteger(requestedSampleCount) || requestedSampleCount < 1 || requestedSampleCount > maxSamples) {
      throw new RenderDeviceError("WebGL2 render-target sampleCount must be an integer supported by MAX_SAMPLES.", "INVALID_RENDER_TARGET_SAMPLE_COUNT", {
        sampleCount: requestedSampleCount,
        maxSamples,
        label: descriptor.label
      });
    }
    const sampleCount = requestedSampleCount;
    const colorHandle = this.gl.createTexture();
    const framebuffer = this.gl.createFramebuffer();
    const drawFramebuffer = sampleCount > 1 ? this.gl.createFramebuffer() : framebuffer;
    const multisampleColorHandle = sampleCount > 1 ? this.gl.createRenderbuffer() : null;
    const depthMode = descriptor.depth === "texture" ? "texture" : descriptor.depth === false ? "none" : "renderbuffer";
    const depthHandle = depthMode === "renderbuffer" ? this.gl.createRenderbuffer() : null;
    const multisampleDepthHandle = sampleCount > 1 && depthMode !== "none"
      ? (depthHandle ?? this.gl.createRenderbuffer())
      : depthHandle;
    const depthTextureHandle = depthMode === "texture" ? this.gl.createTexture() : null;
    if (
      !colorHandle
      || !framebuffer
      || !drawFramebuffer
      || (sampleCount > 1 && !multisampleColorHandle)
      || ((depthMode === "renderbuffer" || (sampleCount > 1 && depthMode !== "none")) && !multisampleDepthHandle)
      || (depthMode === "texture" && !depthTextureHandle)
    ) {
      if (colorHandle) this.gl.deleteTexture(colorHandle);
      if (framebuffer) this.gl.deleteFramebuffer(framebuffer);
      if (drawFramebuffer && drawFramebuffer !== framebuffer) this.gl.deleteFramebuffer(drawFramebuffer);
      if (multisampleColorHandle) this.gl.deleteRenderbuffer(multisampleColorHandle);
      if (multisampleDepthHandle) this.gl.deleteRenderbuffer(multisampleDepthHandle);
      if (depthTextureHandle) this.gl.deleteTexture(depthTextureHandle);
      throw new RenderDeviceError("Failed to allocate WebGL render target", "WEBGL_ALLOCATION_FAILED", {
        width: descriptor.width,
        height: descriptor.height,
        label: descriptor.label
      });
    }
    const previousActiveTexture = this.gl.getParameter(this.gl.ACTIVE_TEXTURE) as GLenum;
    this.gl.activeTexture(this.gl.TEXTURE0);
    const previousTexture = this.gl.getParameter(this.gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
    const previousFramebuffer = this.gl.getParameter(this.gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const previousRenderbuffer = this.gl.getParameter(this.gl.RENDERBUFFER_BINDING) as WebGLRenderbuffer | null;
    this.gl.bindTexture(this.gl.TEXTURE_2D, colorHandle);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    const format = descriptor.format ?? "rgba8";
    const textureFormat = resolveRenderTargetFormat(this.gl, format);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      textureFormat.internalFormat,
      descriptor.width,
      descriptor.height,
      0,
      this.gl.RGBA,
      textureFormat.type,
      null
    );

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, framebuffer);
    this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, colorHandle, 0);
    if (depthHandle && sampleCount === 1) {
      this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, depthHandle);
      this.gl.renderbufferStorage(this.gl.RENDERBUFFER, this.gl.DEPTH_COMPONENT16, descriptor.width, descriptor.height);
      this.gl.framebufferRenderbuffer(this.gl.FRAMEBUFFER, this.gl.DEPTH_ATTACHMENT, this.gl.RENDERBUFFER, depthHandle);
    }
    if (depthTextureHandle) {
      this.gl.bindTexture(this.gl.TEXTURE_2D, depthTextureHandle);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
      this.gl.texImage2D(
        this.gl.TEXTURE_2D,
        0,
        this.gl.DEPTH_COMPONENT24,
        descriptor.width,
        descriptor.height,
        0,
        this.gl.DEPTH_COMPONENT,
        this.gl.UNSIGNED_INT,
        null
      );
      this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.DEPTH_ATTACHMENT, this.gl.TEXTURE_2D, depthTextureHandle, 0);
    }
    const resolveStatus = this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER);
    let drawStatus = resolveStatus;
    if (sampleCount > 1 && multisampleColorHandle) {
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, drawFramebuffer);
      this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, multisampleColorHandle);
      const multisampleColorFormat = format === "rgba8" ? this.gl.RGBA8 : textureFormat.internalFormat;
      this.gl.renderbufferStorageMultisample(this.gl.RENDERBUFFER, sampleCount, multisampleColorFormat, descriptor.width, descriptor.height);
      this.gl.framebufferRenderbuffer(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.RENDERBUFFER, multisampleColorHandle);
      if (multisampleDepthHandle) {
        this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, multisampleDepthHandle);
        this.gl.renderbufferStorageMultisample(this.gl.RENDERBUFFER, sampleCount, this.gl.DEPTH_COMPONENT24, descriptor.width, descriptor.height);
        this.gl.framebufferRenderbuffer(this.gl.FRAMEBUFFER, this.gl.DEPTH_ATTACHMENT, this.gl.RENDERBUFFER, multisampleDepthHandle);
      }
      drawStatus = this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER);
    }
    this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, previousRenderbuffer);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, previousFramebuffer);
    this.gl.bindTexture(this.gl.TEXTURE_2D, previousTexture);
    this.gl.activeTexture(previousActiveTexture);
    this.stateCache.invalidate();
    if (resolveStatus !== this.gl.FRAMEBUFFER_COMPLETE || drawStatus !== this.gl.FRAMEBUFFER_COMPLETE) {
      this.gl.deleteTexture(colorHandle);
      this.gl.deleteFramebuffer(framebuffer);
      if (drawFramebuffer !== framebuffer) this.gl.deleteFramebuffer(drawFramebuffer);
      if (multisampleColorHandle) this.gl.deleteRenderbuffer(multisampleColorHandle);
      if (multisampleDepthHandle) this.gl.deleteRenderbuffer(multisampleDepthHandle);
      if (depthTextureHandle) this.gl.deleteTexture(depthTextureHandle);
      throw new RenderDeviceError("WebGL render target framebuffer status is invalid", "FRAMEBUFFER_INVALID", { resolveStatus, drawStatus });
    }

    const depthTexture = depthTextureHandle
      ? new Texture({ width: descriptor.width, height: descriptor.height, format: "depth24", label: `${descriptor.label ?? "render-target"}-depth` })
      : undefined;
    const target = new WebGL2RenderTarget(
      this.nextId++,
      descriptor.width,
      descriptor.height,
      descriptor.label ?? "render-target",
      new Texture({ width: descriptor.width, height: descriptor.height, format, label: descriptor.label ?? "render-target-color" }),
      depthTexture,
      framebuffer,
      colorHandle,
      multisampleDepthHandle,
      depthTextureHandle,
      sampleCount,
      drawFramebuffer,
      multisampleColorHandle,
      this.gl
    );
    this.renderTargets.add(target);
    // Shadow passes label their depth target after the shadow map texture, so the
    // label is the device-side signal that a shadow depth target was allocated.
    // Cascaded maps use the established renderer-csm-cascade-* labels.
    // Count their actual allocation too, including the first shadow frame.
    if (/shadow|(?:^|-)csm(?:-|$)/i.test(descriptor.label ?? "")) this.host.counters.shadowRenderTargetsAllocated += 1;
    this.host.textureRegistry.textures.set(target.colorTexture, colorHandle);
    this.host.textureRegistry.textureUploadModes.set(target.colorTexture, "rgba8");
    if (depthTexture && depthTextureHandle) {
      this.host.textureRegistry.textures.set(depthTexture, depthTextureHandle);
      this.host.textureRegistry.textureUploadModes.set(depthTexture, "depth-render-target");
    }
    return target;
  }

  /**
   * PR 0a render-target fields (CONTRACTS §3.4): `dimension`/`layers` (cube +
   * 2d-array layered targets rendered through `layerTargets`), `depthOnly`
   * (no color attachment), `depthCompare` (comparison-sampler depth texture)
   * and `colorAttachments` (MRT, per-layer `drawBuffers` state).
   */
  private createFeatureRenderTarget(descriptor: RenderTargetDescriptor): RenderTarget {
    const gl = this.gl;
    if (
      !Number.isInteger(descriptor.width) ||
      descriptor.width <= 0 ||
      !Number.isInteger(descriptor.height) ||
      descriptor.height <= 0
    ) {
      throw new RenderDeviceError("Render target dimensions must be positive integers", "INVALID_RENDER_TARGET_SIZE", {
        width: descriptor.width,
        height: descriptor.height,
        label: descriptor.label
      });
    }
    const dimension = descriptor.dimension ?? "2d";
    if (descriptor.layers !== undefined && (!Number.isInteger(descriptor.layers) || descriptor.layers < 1)) {
      throw new RenderDeviceError("Render target layer count must be a positive integer", "INVALID_RENDER_TARGET_SIZE", {
        layers: descriptor.layers,
        label: descriptor.label
      });
    }
    if (descriptor.layers !== undefined && dimension !== "2d-array") {
      throw new RenderDeviceError("Render target `layers` only applies to dimension \"2d-array\"", "INVALID_RENDER_TARGET_SIZE", {
        dimension,
        layers: descriptor.layers,
        label: descriptor.label
      });
    }
    const layerCount = dimension === "cube" ? 6 : dimension === "2d-array" ? descriptor.layers ?? 1 : 1;
    const depthOnly = descriptor.depthOnly === true;
    if (depthOnly && (descriptor.colorAttachments?.length ?? 0) > 0) {
      throw new RenderDeviceError("Render target cannot combine `depthOnly` with `colorAttachments`", "INVALID_RENDER_TARGET_SIZE", {
        label: descriptor.label
      });
    }
    if (depthOnly && descriptor.depth === false) {
      throw new RenderDeviceError("Render target cannot combine `depthOnly` with `depth: false`", "INVALID_RENDER_TARGET_SIZE", {
        label: descriptor.label
      });
    }
    const sampleCount = descriptor.sampleCount ?? 1;
    const colorAttachmentCount = depthOnly ? 0 : Math.max(1, descriptor.colorAttachments?.length ?? 1);
    if (sampleCount > 1 && (depthOnly || descriptor.depthCompare === true || descriptor.colorAttachments !== undefined || layerCount > 1)) {
      throw new RenderDeviceError("Multisample render targets do not support layered, depth-only, compare or MRT descriptors", "INVALID_RENDER_TARGET_SAMPLE_COUNT", {
        sampleCount,
        label: descriptor.label
      });
    }
    const maxSamples = Number(gl.getParameter(gl.MAX_SAMPLES) ?? 1);
    if (!Number.isInteger(sampleCount) || sampleCount < 1 || sampleCount > maxSamples) {
      throw new RenderDeviceError("WebGL2 render-target sampleCount must be an integer supported by MAX_SAMPLES.", "INVALID_RENDER_TARGET_SAMPLE_COUNT", {
        sampleCount,
        maxSamples,
        label: descriptor.label
      });
    }

    const label = descriptor.label ?? "render-target";
    const textureTarget = dimension === "cube" ? gl.TEXTURE_CUBE_MAP : dimension === "2d-array" ? gl.TEXTURE_2D_ARRAY : gl.TEXTURE_2D;
    const depthMode = depthOnly || descriptor.depth === "texture" || (layerCount > 1 && descriptor.depth !== false) ? "texture" : descriptor.depth === false ? "none" : "renderbuffer";
    const depthCompare = descriptor.depthCompare === true;

    const colorFormats: Extract<TextureFormat, "rgba8" | "rgba16f" | "rgba32f">[] = depthOnly
      ? []
      : colorAttachmentCount === 1 && !descriptor.colorAttachments
        ? [descriptor.format ?? "rgba8"]
        : (descriptor.colorAttachments ?? [{ format: descriptor.format ?? "rgba8" }]).map((attachment) => attachment.format);
    const colorHandles: WebGLTexture[] = [];
    const colorTextures: Texture[] = [];
    let depthTextureHandle: WebGLTexture | null = null;
    const layerFramebuffers: WebGLFramebuffer[] = [];

    const cleanup = (): void => {
      for (const handle of colorHandles) gl.deleteTexture(handle);
      if (depthTextureHandle) gl.deleteTexture(depthTextureHandle);
      for (const framebuffer of layerFramebuffers) gl.deleteFramebuffer(framebuffer);
    };

    const previousActiveTexture = gl.getParameter(gl.ACTIVE_TEXTURE) as GLenum;
    gl.activeTexture(gl.TEXTURE0);
    const previousTexture = gl.getParameter(gl.TEXTURE_BINDING_2D) as WebGLTexture | null;
    const previousCubeTexture = gl.getParameter(gl.TEXTURE_BINDING_CUBE_MAP) as WebGLTexture | null;
    const previousArrayTexture = gl.getParameter(gl.TEXTURE_BINDING_2D_ARRAY) as WebGLTexture | null;
    const previousFramebuffer = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;

    for (let attachment = 0; attachment < colorFormats.length; attachment += 1) {
      const format = colorFormats[attachment];
      const textureFormat = resolveRenderTargetFormat(gl, format);
      const handle = gl.createTexture();
      if (!handle) {
        cleanup();
        throw new RenderDeviceError("Failed to allocate WebGL render target", "WEBGL_ALLOCATION_FAILED", { label });
      }
      colorHandles.push(handle);
      colorTextures.push(
        new Texture({ width: descriptor.width, height: descriptor.height, format, label: colorAttachmentCount > 1 ? `${label}-color-${attachment}` : descriptor.label ?? "render-target-color", dimension, layers: dimension === "2d" ? undefined : layerCount })
      );
      gl.bindTexture(textureTarget, handle);
      gl.texParameteri(textureTarget, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(textureTarget, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(textureTarget, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(textureTarget, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (dimension === "2d") {
        gl.texImage2D(textureTarget, 0, textureFormat.internalFormat, descriptor.width, descriptor.height, 0, gl.RGBA, textureFormat.type, null);
      } else if (dimension === "cube") {
        gl.texStorage2D(textureTarget, 1, textureFormat.internalFormat, descriptor.width, descriptor.height);
      } else {
        gl.texStorage3D(textureTarget, 1, textureFormat.internalFormat, descriptor.width, descriptor.height, layerCount);
      }
    }

    let depthTexture: Texture | undefined;
    if (depthMode === "texture") {
      depthTextureHandle = gl.createTexture();
      if (!depthTextureHandle) {
        cleanup();
        throw new RenderDeviceError("Failed to allocate WebGL render target", "WEBGL_ALLOCATION_FAILED", { label });
      }
      depthTexture = new Texture({
        width: descriptor.width,
        height: descriptor.height,
        format: "depth24",
        label: `${label}-depth`,
        dimension,
        layers: dimension === "2d" ? undefined : layerCount
      });
      gl.bindTexture(textureTarget, depthTextureHandle);
      gl.texParameteri(textureTarget, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(textureTarget, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(textureTarget, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(textureTarget, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      if (depthCompare) {
        gl.texParameteri(textureTarget, gl.TEXTURE_COMPARE_MODE, gl.COMPARE_REF_TO_TEXTURE);
        gl.texParameteri(textureTarget, gl.TEXTURE_COMPARE_FUNC, gl.LEQUAL);
      }
      if (dimension === "2d-array") {
        gl.texImage3D(textureTarget, 0, gl.DEPTH_COMPONENT24, descriptor.width, descriptor.height, layerCount, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
      } else if (dimension === "cube") {
        gl.texStorage2D(textureTarget, 1, gl.DEPTH_COMPONENT24, descriptor.width, descriptor.height);
      } else {
        gl.texImage2D(textureTarget, 0, gl.DEPTH_COMPONENT24, descriptor.width, descriptor.height, 0, gl.DEPTH_COMPONENT, gl.UNSIGNED_INT, null);
      }
    }

    let depthRenderbufferHandle: WebGLRenderbuffer | null = null;
    if (depthMode === "renderbuffer") {
      depthRenderbufferHandle = gl.createRenderbuffer();
      if (!depthRenderbufferHandle) {
        cleanup();
        throw new RenderDeviceError("Failed to allocate WebGL render target", "WEBGL_ALLOCATION_FAILED", { label });
      }
      const previousRenderbuffer = gl.getParameter(gl.RENDERBUFFER_BINDING) as WebGLRenderbuffer | null;
      gl.bindRenderbuffer(gl.RENDERBUFFER, depthRenderbufferHandle);
      gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, descriptor.width, descriptor.height);
      gl.bindRenderbuffer(gl.RENDERBUFFER, previousRenderbuffer);
    }

    const drawBuffers = depthOnly
      ? [gl.NONE]
      : colorFormats.map((_, attachment) => gl.COLOR_ATTACHMENT0 + attachment);
    const attachLayer = (framebuffer: WebGLFramebuffer, layer: number): boolean => {
      gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
      if (depthOnly) {
        gl.drawBuffers([gl.NONE]);
        gl.readBuffer(gl.NONE);
      } else if (drawBuffers.length > 1) {
        gl.drawBuffers(drawBuffers);
      }
      for (let attachment = 0; attachment < colorHandles.length; attachment += 1) {
        if (dimension === "cube") {
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + attachment, gl.TEXTURE_CUBE_MAP_POSITIVE_X + layer, colorHandles[attachment], 0);
        } else if (dimension === "2d-array") {
          gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + attachment, colorHandles[attachment], 0, layer);
        } else {
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + attachment, gl.TEXTURE_2D, colorHandles[attachment], 0);
        }
      }
      if (depthTextureHandle) {
        if (dimension === "cube") {
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_CUBE_MAP_POSITIVE_X + layer, depthTextureHandle, 0);
        } else if (dimension === "2d-array") {
          gl.framebufferTextureLayer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, depthTextureHandle, 0, layer);
        } else {
          gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.TEXTURE_2D, depthTextureHandle, 0);
        }
      }
      if (depthRenderbufferHandle) {
        gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, depthRenderbufferHandle);
      }
      return gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
    };

    for (let layer = 0; layer < layerCount; layer += 1) {
      const framebuffer = gl.createFramebuffer();
      if (!framebuffer) {
        cleanup();
        throw new RenderDeviceError("Failed to allocate WebGL render target", "WEBGL_ALLOCATION_FAILED", { label });
      }
      layerFramebuffers.push(framebuffer);
      if (!attachLayer(framebuffer, layer)) {
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        cleanup();
        if (depthRenderbufferHandle) gl.deleteRenderbuffer(depthRenderbufferHandle);
        gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
        gl.bindTexture(gl.TEXTURE_2D, previousTexture);
        if (previousCubeTexture !== null) gl.bindTexture(gl.TEXTURE_CUBE_MAP, previousCubeTexture);
        if (previousArrayTexture !== null) gl.bindTexture(gl.TEXTURE_2D_ARRAY, previousArrayTexture);
        gl.activeTexture(previousActiveTexture);
        this.stateCache.invalidate();
        throw new RenderDeviceError("WebGL render target framebuffer status is invalid", "FRAMEBUFFER_INVALID", { status, layer, label });
      }
    }

    gl.bindFramebuffer(gl.FRAMEBUFFER, previousFramebuffer);
    gl.bindTexture(gl.TEXTURE_2D, previousTexture);
    if (previousCubeTexture !== null) gl.bindTexture(gl.TEXTURE_CUBE_MAP, previousCubeTexture);
    if (previousArrayTexture !== null) gl.bindTexture(gl.TEXTURE_2D_ARRAY, previousArrayTexture);
    gl.activeTexture(previousActiveTexture);
    this.stateCache.invalidate();

    const colorTexture = colorTextures[0] ?? new Texture({ width: descriptor.width, height: descriptor.height, format: "rgba8", label: `${label}-colorless`, dimension });
    let parentColorHandle = colorHandles[0];
    if (!parentColorHandle) {
      // Depth-only targets keep a placeholder Texture in `colorTexture`; give it a
      // real (never-attached, never-registered) GL handle so dispose stays sound.
      parentColorHandle = gl.createTexture();
      if (!parentColorHandle) {
        cleanup();
        if (depthRenderbufferHandle) gl.deleteRenderbuffer(depthRenderbufferHandle);
        throw new RenderDeviceError("Failed to allocate WebGL render target", "WEBGL_ALLOCATION_FAILED", { label });
      }
    }
    const target = new WebGL2RenderTarget(
      this.nextId++,
      descriptor.width,
      descriptor.height,
      label,
      colorTexture,
      depthTexture,
      layerFramebuffers[0],
      parentColorHandle,
      depthRenderbufferHandle,
      depthTextureHandle,
      1,
      layerFramebuffers[0],
      null,
      gl,
      {
        dimension,
        layers: layerCount > 1 ? layerCount : undefined,
        colorTextures: colorTextures.length > 1 ? colorTextures : undefined,
        extraColorHandles: colorHandles.slice(1),
        layerFramebuffers,
        layerChild: false
      }
    );
    if (layerCount > 1) {
      const children: RenderTarget[] = layerFramebuffers.map(
        (framebuffer, layer) =>
          new WebGL2RenderTarget(
            this.nextId++,
            descriptor.width,
            descriptor.height,
            `${label}-layer-${layer}`,
            colorTexture,
            depthTexture,
            framebuffer,
            colorHandles[0],
            null,
            depthTextureHandle,
            1,
            framebuffer,
            null,
            gl,
            { dimension, layers: 1, colorTextures: target.colorTextures, layerChild: true }
          )
      );
      // layerTargets shares parent GL resources; children only mark dispose.
      target.layerTargets = children;
      for (const child of children) {
        this.renderTargets.add(child as WebGL2RenderTarget);
      }
    }
    this.renderTargets.add(target);
    if (/shadow|(?:^|-)csm(?:-|$)/i.test(label)) this.host.counters.shadowRenderTargetsAllocated += 1;
    for (let attachment = 0; attachment < colorHandles.length; attachment += 1) {
      this.host.textureRegistry.textures.set(colorTextures[attachment], colorHandles[attachment]);
      this.host.textureRegistry.textureUploadModes.set(colorTextures[attachment], colorFormats[attachment]);
    }
    if (depthTexture && depthTextureHandle) {
      this.host.textureRegistry.textures.set(depthTexture, depthTextureHandle);
      this.host.textureRegistry.textureUploadModes.set(depthTexture, "depth-render-target");
    }
    return target;
  }

  setRenderTarget(target: RenderTarget | null): void {
    this.host.lifecycle.assertAlive();
    if (this.host.activeRenderTarget && this.host.activeRenderTarget !== target) {
      this.resolveMultisampleTarget(this.host.activeRenderTarget);
    }
    if (target === null) {
      this.host.activeRenderTarget = null;
      this.stateCache.bindFramebuffer(this.gl.FRAMEBUFFER, null, () => this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null));
      this.stateCache.viewport(
        0,
        0,
        this.host.lifecycle.viewportWidth || this.gl.drawingBufferWidth,
        this.host.lifecycle.viewportHeight || this.gl.drawingBufferHeight,
        () => this.gl.viewport(0, 0, this.host.lifecycle.viewportWidth || this.gl.drawingBufferWidth, this.host.lifecycle.viewportHeight || this.gl.drawingBufferHeight)
      );
      return;
    }
    if (!(target instanceof WebGL2RenderTarget) || !this.renderTargets.has(target) || target.disposed) {
      throw new RenderDeviceError("Render target is not a live WebGL2 resource owned by this device", "INVALID_RESOURCE", {
        targetId: target.id
      });
    }
    this.host.activeRenderTarget = target;
    this.stateCache.bindFramebuffer(this.gl.FRAMEBUFFER, target.drawFramebuffer, () => this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, target.drawFramebuffer));
    this.stateCache.viewport(0, 0, target.width, target.height, () => this.gl.viewport(0, 0, target.width, target.height));
  }

  private resolveMultisampleTarget(target: WebGL2RenderTarget): void {
    if (target.sampleCount <= 1 || !target.needsResolve) return;
    const previousFramebuffer = this.gl.getParameter(this.gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    this.gl.bindFramebuffer(this.gl.READ_FRAMEBUFFER, target.drawFramebuffer);
    this.gl.bindFramebuffer(this.gl.DRAW_FRAMEBUFFER, target.framebuffer);
    let mask = this.gl.COLOR_BUFFER_BIT;
    if (target.depthTextureHandle) mask |= this.gl.DEPTH_BUFFER_BIT;
    this.gl.blitFramebuffer(
      0, 0, target.width, target.height,
      0, 0, target.width, target.height,
      mask,
      this.gl.NEAREST
    );
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, previousFramebuffer);
    target.needsResolve = false;
    this.stateCache.invalidate();
  }
























  captureState(): ReadonlyMap<string, string | number | boolean | null> {
    const viewport = this.gl.getParameter(this.gl.VIEWPORT) as Int32Array | readonly number[];
    return new Map<string, string | number | boolean | null>([
      ["backend", this.kind],
      ["disposed", this.host.disposed],
      ["contextLost", this.host.contextLost],
      ["frameActive", this.host.lifecycle.frameActive],
      ["depthTest", this.gl.isEnabled(this.gl.DEPTH_TEST)],
      ["blend", this.gl.isEnabled(this.gl.BLEND)],
      ["cullFace", this.gl.isEnabled(this.gl.CULL_FACE)],
      ["program", this.gl.getParameter(this.gl.CURRENT_PROGRAM) ? "bound" : null],
      ["arrayBuffer", this.gl.getParameter(this.gl.ARRAY_BUFFER_BINDING) ? "bound" : null],
      ["elementArrayBuffer", this.gl.getParameter(this.gl.ELEMENT_ARRAY_BUFFER_BINDING) ? "bound" : null],
      ["viewportWidth", this.host.lifecycle.viewportWidth],
      ["viewportHeight", this.host.lifecycle.viewportHeight],
      ["actualViewportWidth", viewport[2] ?? 0],
      ["actualViewportHeight", viewport[3] ?? 0],
      ["renderTarget", this.host.activeRenderTarget?.label ?? null],
      ["drawCalls", this.host.counters.drawCalls],
      ["nativeTemporalPasses", this.host.counters.nativeTemporalPasses],
      ["nativeTemporalBindings", this.host.counters.nativeTemporalBindings],
      ["shaderProgramCreates", this.host.counters.shaderProgramCreateCount],
      ["uniformLocationLookups", this.host.counters.uniformLocationLookupCount],
      ["bufferUpdates", this.host.counters.bufferUpdateCount],
      ["textureBinds", this.host.counters.textureBindCount],
      ["samplerParameterUploads", this.host.counters.samplerParameterUploadCount],
      ["vertexArrayCreates", this.host.counters.vertexArrayCreateCount],
      ["samplerObjects", this.host.samplers.samplerObjectCache.size],
      ["samplerAnisotropyUploads", this.host.counters.samplerAnisotropyUploadCount],
      ["maxTextureAnisotropy", this.maxTextureAnisotropy],
      ["nativeEnvironmentBindings", this.host.counters.nativeEnvironmentBindings],
      ["nativeShadowMapBindings", this.host.counters.nativeShadowMapBindings],
      ["nativeInstancedSubmissions", this.host.counters.nativeInstancedSubmissions],
      ["stateCacheIssued", this.stateCache.stats().issued],
      ["stateCacheSkipped", this.stateCache.stats().skipped]
    ]);
  }

  getDiagnostics(): RenderDeviceDiagnostics {
    this.host.textureRegistry.releaseDisposedTextureHandles();
    const liveRenderTargets = [...this.renderTargets].filter((target) => !target.disposed);
    const liveTextures = new Set<Texture>([
      ...liveRenderTargets.map((target) => target.colorTexture),
      ...[...this.host.textureRegistry.textures.keys()].filter((texture) => !texture.disposed)
    ]);
    const liveTextureList = [...liveTextures];
    const compressedTextures = liveTextureList.filter((texture) => isCompressedTextureFormat(texture.format));
    const fallbackTextures = liveTextureList.filter((texture) => this.host.textureRegistry.textureUploadModes.get(texture) === "fallback");
    const stateCacheStats = this.stateCache.stats();
    const bufferBytes = [...this.buffers].filter((buffer) => !buffer.disposed).reduce((total, buffer) => total + buffer.byteLength, 0);
    const textureBytes = liveTextureList.reduce((total, texture) => total + texture.byteLength, 0);
    const gpuTargetEntries = this.host.post.describeGpuTargetInventory(liveRenderTargets);
    return {
      drawCalls: this.host.counters.drawCalls,
      buffers: [...this.buffers].filter((buffer) => !buffer.disposed).length,
      shaders: [...this.shaders].filter((shader) => !shader.disposed).length,
      renderTargets: liveRenderTargets.length,
      maxRenderTargetSampleCount: Math.max(1, ...liveRenderTargets.map((target) => target.sampleCount)),
      textures: liveTextures.size,
      bufferBytes,
      textureBytes,
      approximateGpuMemoryBytes: bufferBytes + textureBytes,
      compressedTextures: compressedTextures.length,
      compressedTextureBytes: compressedTextures.reduce((total, texture) => total + texture.byteLength, 0),
      textureFallbacks: fallbackTextures.length,
      textureFallbackBytes: fallbackTextures.reduce((total, texture) => total + texture.fallbackByteLength, 0),
      nativeEnvironmentBindings: this.host.counters.nativeEnvironmentBindings,
      nativeShadowMapBindings: this.host.counters.nativeShadowMapBindings,
      shadowRenderTargetsAllocated: this.host.counters.shadowRenderTargetsAllocated,
      nativeInstancedSubmissions: this.host.counters.nativeInstancedSubmissions,
      bloom: this.host.post.lastBloomDiagnostics,
      nativeTemporalPasses: this.host.counters.nativeTemporalPasses,
      nativeTemporalBindings: this.host.counters.nativeTemporalBindings,
      samplerAnisotropyUploads: this.host.counters.samplerAnisotropyUploadCount,
      maxTextureAnisotropy: this.maxTextureAnisotropy,
      stateCacheIssued: stateCacheStats.issued,
      stateCacheSkipped: stateCacheStats.skipped,
      stateCacheProgramSwitches: stateCacheStats.byOperation.useProgram?.issued ?? 0,
      stateCacheTextureBinds: stateCacheStats.byOperation.bindTexture?.issued ?? 0,
      stateCacheBufferBinds: stateCacheStats.byOperation.bindBuffer?.issued ?? 0,
      stateCacheVertexArrayBinds: stateCacheStats.byOperation.bindVertexArray?.issued ?? 0,
      stateCacheSamplerBinds: stateCacheStats.byOperation.bindSampler?.issued ?? 0,
      disposedBuffers: [...this.buffers].filter((buffer) => buffer.disposed).length,
      disposedShaders: [...this.shaders].filter((shader) => shader.disposed).length,
      disposedRenderTargets: [...this.renderTargets].filter((target) => target.disposed).length,
      disposedTextures: [...this.renderTargets].filter((target) => target.colorTexture.disposed).length + this.host.counters.releasedTextureHandles,
      ...spreadGpuTargetInventory(gpuTargetEntries),
      programCompileCount: this.host.counters.programCompiles,
      readPixelsCalls: this.host.counters.readbacks,
      lastError: this.host.lifecycle.lastError,
      contextLost: this.host.contextLost
    };
  }

  dispose(): void {
    if (this.host.lifecycle.canvas && "removeEventListener" in this.host.lifecycle.canvas) {
      this.host.lifecycle.deviceLostListeners.clear();
      this.host.lifecycle.deviceRestoredListeners.clear();
      if (this.host.lifecycle.contextLostListener) this.host.lifecycle.canvas.removeEventListener("webglcontextlost", this.host.lifecycle.contextLostListener);
      if (this.host.lifecycle.contextRestoredListener) this.host.lifecycle.canvas.removeEventListener("webglcontextrestored", this.host.lifecycle.contextRestoredListener);
    }
    for (const buffer of this.buffers) {
      buffer.dispose();
    }
    for (const shader of this.shaders) {
      shader.dispose();
    }
    for (const target of this.renderTargets) {
      target.dispose();
    }
    for (const entry of this.host.drawBinder.vertexArrayCache.values()) {
      this.gl.deleteVertexArray(entry.handle);
    }
    this.host.drawBinder.vertexArrayCache.clear();
    for (const sampler of this.host.samplers.samplerObjectCache.values()) {
      this.gl.deleteSampler(sampler);
    }
    this.host.samplers.samplerObjectCache.clear();
    for (const texture of this.host.textureRegistry.textures.values()) {
      this.gl.deleteTexture(texture);
    }
    this.host.textureRegistry.textureUploadModes.clear();
    if (this.host.textureRegistry.fallbackTexture) {
      this.gl.deleteTexture(this.host.textureRegistry.fallbackTexture);
      this.host.textureRegistry.fallbackTexture = null;
    }
    if (this.host.textureRegistry.fallbackCubeTexture) {
      this.gl.deleteTexture(this.host.textureRegistry.fallbackCubeTexture);
      this.host.textureRegistry.fallbackCubeTexture = null;
    }
    if (this.host.post.presentationProgram) {
      this.gl.deleteProgram(this.host.post.presentationProgram);
      this.host.post.presentationProgram = null;
    }
    if (this.host.post.ldrPostprocessProgram) {
      this.gl.deleteProgram(this.host.post.ldrPostprocessProgram);
      this.host.post.ldrPostprocessProgram = null;
    }
    if (this.host.post.bloomBrightExtractProgram) {
      this.gl.deleteProgram(this.host.post.bloomBrightExtractProgram);
      this.host.post.bloomBrightExtractProgram = null;
    }
    if (this.host.post.bloomBlurProgram) {
      this.gl.deleteProgram(this.host.post.bloomBlurProgram);
      this.host.post.bloomBlurProgram = null;
    }
    if (this.host.post.bloomCompositeProgram) {
      this.gl.deleteProgram(this.host.post.bloomCompositeProgram);
      this.host.post.bloomCompositeProgram = null;
    }
    if (this.host.post.bloomDownsampleProgram) {
      this.gl.deleteProgram(this.host.post.bloomDownsampleProgram);
      this.host.post.bloomDownsampleProgram = null;
    }
    if (this.host.post.bloomAccumulateProgram) {
      this.gl.deleteProgram(this.host.post.bloomAccumulateProgram);
      this.host.post.bloomAccumulateProgram = null;
    }
    if (this.host.post.outlineProgram) {
      this.gl.deleteProgram(this.host.post.outlineProgram);
      this.host.post.outlineProgram = null;
    }
    if (this.host.post.ssaoProgram) {
      this.gl.deleteProgram(this.host.post.ssaoProgram);
      this.host.post.ssaoProgram = null;
    }
    if (this.host.post.ssrProgram) {
      this.gl.deleteProgram(this.host.post.ssrProgram);
      this.host.post.ssrProgram = null;
    }
    if (this.host.post.depthOfFieldProgram) {
      this.gl.deleteProgram(this.host.post.depthOfFieldProgram);
      this.host.post.depthOfFieldProgram = null;
    }
    if (this.host.post.motionBlurProgram) {
      this.gl.deleteProgram(this.host.post.motionBlurProgram);
      this.host.post.motionBlurProgram = null;
    }
    if (this.host.post.motionBlurVelocityTexture) {
      this.gl.deleteTexture(this.host.post.motionBlurVelocityTexture);
      this.host.post.motionBlurVelocityTexture = null;
      this.host.post.motionBlurVelocitySize = null;
    }
    if (this.host.post.taaProgram) {
      this.gl.deleteProgram(this.host.post.taaProgram);
      this.host.post.taaProgram = null;
    }
    if (this.host.post.taaPresentationProgram) {
      this.gl.deleteProgram(this.host.post.taaPresentationProgram);
      this.host.post.taaPresentationProgram = null;
    }
    if (this.host.post.taaHistoryTexture) {
      this.gl.deleteTexture(this.host.post.taaHistoryTexture);
      this.host.post.taaHistoryTexture = null;
      this.host.post.taaHistorySize = null;
    }
    this.host.post.disposeBloomPingPongResources();
    this.host.post.disposeBloomPyramidResources();
    if (this.host.post.bloomBrightLutTexture) {
      this.gl.deleteTexture(this.host.post.bloomBrightLutTexture);
      this.host.post.bloomBrightLutTexture = null;
      this.host.post.bloomBrightLutThreshold = null;
    }
    if (this.host.post.bloomCompositeLutTexture) {
      this.gl.deleteTexture(this.host.post.bloomCompositeLutTexture);
      this.host.post.bloomCompositeLutTexture = null;
      this.host.post.bloomCompositeLutIntensity = null;
      this.host.post.bloomCompositeLutShoulder = null;
    }
    if (this.host.post.outlineBlendLutTexture) {
      this.gl.deleteTexture(this.host.post.outlineBlendLutTexture);
      this.host.post.outlineBlendLutTexture = null;
      this.host.post.outlineBlendLutKey = null;
    }
    if (this.host.post.presentationVertexArray) {
      this.gl.deleteVertexArray(this.host.post.presentationVertexArray);
      this.host.post.presentationVertexArray = null;
    }
    if (this.host.probe.depthReadbackProgram) {
      this.gl.deleteProgram(this.host.probe.depthReadbackProgram);
      this.host.probe.depthReadbackProgram = null;
    }
    this.host.textureRegistry.textures.clear();
    this.host.disposed = true;
  }































































































  compileShader(type: GLenum, source: string, label: string): WebGLShader {
    const shader = this.gl.createShader(type);
    if (!shader) {
      throw new RenderDeviceError("Failed to allocate WebGL shader", "WEBGL_ALLOCATION_FAILED", { label });
    }
    this.gl.shaderSource(shader, source);
    this.gl.compileShader(shader);
    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const log = this.gl.getShaderInfoLog(shader) ?? "Unknown shader compile error";
      this.gl.deleteShader(shader);
      throw new RenderDeviceError("WebGL shader compile failed", "SHADER_COMPILE_FAILED", { label, log });
    }
    return shader;
  }

  private reflectProgram(program: WebGLProgram): ShaderReflection {
    const attributes = new Map<string, number>();
    const uniforms = new Set<string>();
    const attributeDetails = new Map<string, ShaderReflection["attributeDetails"] extends ReadonlyMap<string, infer T> ? T : never>();
    const uniformDetails = new Map<string, ShaderReflection["uniformDetails"] extends ReadonlyMap<string, infer T> ? T : never>();
    const activeAttributes = this.gl.getProgramParameter(program, this.gl.ACTIVE_ATTRIBUTES) as number;
    const activeUniforms = this.gl.getProgramParameter(program, this.gl.ACTIVE_UNIFORMS) as number;

    for (let i = 0; i < activeAttributes; i += 1) {
      const info = this.gl.getActiveAttrib(program, i);
      if (info) {
        const location = this.gl.getAttribLocation(program, info.name);
        attributes.set(info.name, location);
        attributeDetails.set(info.name, { name: info.name, type: String(info.type), location, source: "vertex", line: 0 });
      }
    }
    for (let i = 0; i < activeUniforms; i += 1) {
      const info = this.gl.getActiveUniform(program, i);
      if (info) {
        const name = info.name.replace(/\[0\]$/, "");
        uniforms.add(name);
        uniformDetails.set(name, { name, type: String(info.type), arraySize: info.size > 1 ? info.size : null, source: "fragment", line: 0 });
      }
    }
    return { attributes, uniforms, attributeDetails, uniformDetails };
  }


















































































}









/**
 * Camera depth range for linearizing sampleable GL depth in the native
 * SSR/depth-of-field programs (muse3jsparity-PRD A3). Missing or invalid
 * ranges fall back to the engine perspective defaults (0.1/1000) rather than
 * failing the frame: the range is a calibration hint, and every engine camera
 * builder defaults to exactly 0.1/1000. The CPU byte kernels intentionally
 * keep fixture-unit depth semantics (deterministic reference); the native
 * programs document their GL-depth contract in-shader.
 */

































