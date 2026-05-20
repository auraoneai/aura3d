import {
  type BufferUsage,
  type DrawCommand,
  type InstanceVertexAttribute,
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
} from "./RenderDevice";
import { Texture, isCompressedTextureFormat, type TextureCompressedFormat, type TextureCubeFace, type TexturePixelData } from "./Texture";
import { TextureBinding } from "./TextureBinding";
import type { Sampler, TextureMagFilter, TextureMinFilter } from "./Sampler";
import { type VertexAttribute, type VertexFormat } from "./VertexFormat";
import { WebGL2StateCache } from "./WebGL2StateCache";

interface TextureFilterAnisotropicExtension {
  readonly TEXTURE_MAX_ANISOTROPY_EXT: GLenum;
  readonly MAX_TEXTURE_MAX_ANISOTROPY_EXT: GLenum;
}

const WEBGL_CUBE_FACES: readonly TextureCubeFace[] = ["px", "nx", "py", "ny", "pz", "nz"];

export interface WebGL2DeviceOptions {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly antialias?: boolean;
  readonly alpha?: boolean;
  readonly preserveDrawingBuffer?: boolean;
  readonly errorCheckMode?: WebGL2ErrorCheckMode;
}

export type WebGL2ErrorCheckMode = "strict" | "frame";

class WebGL2Buffer implements RenderBuffer {
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

class WebGL2ShaderProgram implements RenderShaderProgram {
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

class WebGL2RenderTarget implements RenderTarget {
  public disposed = false;

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
    private readonly gl: WebGL2RenderingContext
  ) {}

  dispose(): void {
    if (!this.disposed) {
      this.gl.deleteFramebuffer(this.framebuffer);
      this.gl.deleteTexture(this.colorHandle);
      if (this.depthHandle) this.gl.deleteRenderbuffer(this.depthHandle);
      if (this.depthTextureHandle) this.gl.deleteTexture(this.depthTextureHandle);
      this.colorTexture.dispose();
      this.depthTexture?.dispose();
      this.disposed = true;
    }
  }
}

interface WebGL2VertexArrayCacheEntry {
  readonly key: string;
  readonly handle: WebGLVertexArrayObject;
  readonly boundLocations: ReadonlySet<number>;
}

interface WebGL2TextureUnit0Snapshot {
  readonly activeTexture: GLenum;
  readonly texture2d: WebGLTexture | null;
  readonly sampler: WebGLSampler | null;
}

interface WebGL2FullscreenPresentationStateSnapshot {
  readonly framebuffer: WebGLFramebuffer | null;
  readonly program: WebGLProgram | null;
  readonly textureUnit0: WebGL2TextureUnit0Snapshot;
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

export class WebGL2Device implements RenderDevice {
  public readonly kind = "webgl2";
  public readonly info: RenderDeviceInfo;
  public disposed = false;
  public contextLost = false;
  private readonly gl: WebGL2RenderingContext;
  private nextId = 1;
  private drawCalls = 0;
  private buffers = new Set<WebGL2Buffer>();
  private shaders = new Set<WebGL2ShaderProgram>();
  private renderTargets = new Set<WebGL2RenderTarget>();
  private activeRenderTarget: WebGL2RenderTarget | null = null;
  private textures = new Map<Texture, WebGLTexture>();
  private textureUploadModes = new Map<Texture, "compressed" | "cube" | "depth-render-target" | "fallback" | "rgba8" | "rgba16f" | "rgba32f">();
  private fallbackTexture: WebGLTexture | null = null;
  private fallbackCubeTexture: WebGLTexture | null = null;
  private readonly samplerObjectCache = new Map<string, WebGLSampler>();
  private presentationProgram: WebGLProgram | null = null;
  private ldrPostprocessProgram: WebGLProgram | null = null;
  private depthReadbackProgram: WebGLProgram | null = null;
  private readonly uniformLocationCache = new WeakMap<WebGL2ShaderProgram, Map<string, WebGLUniformLocation | null>>();
  private readonly textureSamplerParameterCache = new WeakMap<WebGLTexture, Map<GLenum, GLenum | number>>();
  private readonly stateCache = new WebGL2StateCache({ label: "webgl2-device-state-cache" });
  private readonly textureUnitBindings = new Map<string, WebGLTexture>();
  private readonly vertexArrayCache = new Map<string, WebGL2VertexArrayCacheEntry>();
  private readonly vertexFormatIds = new WeakMap<VertexFormat, number>();
  private presentationVertexArray: WebGLVertexArrayObject | null = null;
  private activeTextureUnitIndex = -1;
  private shaderProgramCreateCount = 0;
  private uniformLocationLookupCount = 0;
  private bufferUpdateCount = 0;
  private textureBindCount = 0;
  private samplerParameterUploadCount = 0;
  private samplerAnisotropyUploadCount = 0;
  private vertexArrayCreateCount = 0;
  private nativeInstancedSubmissions = 0;
  private nextVertexFormatId = 1;
  private releasedTextureHandles = 0;
  private nativeEnvironmentBindings = 0;
  private nativeShadowMapBindings = 0;
  private lastError: string | null = null;
  private frameActive = false;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private readonly maxVertexAttributes: number;
  private readonly anisotropicFilteringExtension: TextureFilterAnisotropicExtension | null;
  private readonly maxTextureAnisotropy: number;
  private readonly contextLostListener?: EventListener;
  private readonly contextRestoredListener?: EventListener;
  private readonly canvas?: HTMLCanvasElement | OffscreenCanvas;

  static create(options: WebGL2DeviceOptions): WebGL2Device {
    const gl = options.canvas.getContext("webgl2", {
      antialias: options.antialias ?? true,
      alpha: options.alpha ?? false,
      preserveDrawingBuffer: options.preserveDrawingBuffer ?? false
    });
    if (!gl) {
      throw new RenderDeviceError("WebGL2 is not available for the provided canvas", "WEBGL2_UNAVAILABLE");
    }
    return new WebGL2Device(gl as WebGL2RenderingContext, options.canvas, options.errorCheckMode ?? "strict");
  }

  private constructor(
    gl: WebGL2RenderingContext,
    canvas: HTMLCanvasElement | OffscreenCanvas,
    private readonly errorCheckMode: WebGL2ErrorCheckMode
  ) {
    this.gl = gl;
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

    this.canvas = canvas;
    if ("addEventListener" in canvas) {
      this.contextLostListener = ((event: Event) => {
        event.preventDefault();
        this.contextLost = true;
        this.lastError = "CONTEXT_LOST";
        this.frameActive = false;
      }) as EventListener;
      this.contextRestoredListener = (() => {
        this.contextLost = false;
        this.lastError = null;
      }) as EventListener;
      canvas.addEventListener("webglcontextlost", this.contextLostListener);
      canvas.addEventListener("webglcontextrestored", this.contextRestoredListener);
    }
  }

  createBuffer(usage: BufferUsage, byteLength: number, initialData?: ArrayBufferView): RenderBuffer {
    this.assertAlive();
    if (byteLength <= 0 || !Number.isInteger(byteLength)) {
      throw new RenderDeviceError("Buffer byteLength must be a positive integer", "INVALID_BUFFER_SIZE", { byteLength });
    }

    const handle = this.gl.createBuffer();
    if (!handle) {
      throw new RenderDeviceError("Failed to allocate WebGL buffer", "WEBGL_ALLOCATION_FAILED");
    }

    const target = usage === "index" ? this.gl.ELEMENT_ARRAY_BUFFER : this.gl.ARRAY_BUFFER;
    this.bindNoVertexArray();
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
    this.assertAlive();
    const webglBuffer = this.requireBuffer(buffer);
    if (byteOffset < 0 || byteOffset + data.byteLength > webglBuffer.byteLength) {
      throw new RenderDeviceError("Buffer update range is out of bounds", "BUFFER_RANGE_OUT_OF_BOUNDS", {
        byteOffset,
        dataByteLength: data.byteLength,
        byteLength: webglBuffer.byteLength
      });
    }
    this.bindNoVertexArray();
    this.stateCache.bindBuffer(webglBuffer.target, webglBuffer.handle, () => this.gl.bindBuffer(webglBuffer.target, webglBuffer.handle));
    this.gl.bufferSubData(webglBuffer.target, byteOffset, data);
    this.bufferUpdateCount += 1;
  }

  readBuffer(buffer: RenderBuffer, byteOffset = 0, byteLength = buffer.byteLength - byteOffset): Uint8Array {
    this.assertAlive();
    const webglBuffer = this.requireBuffer(buffer);
    if (byteOffset < 0 || byteLength < 0 || byteOffset + byteLength > webglBuffer.byteLength) {
      throw new RenderDeviceError("Buffer read range is out of bounds", "BUFFER_RANGE_OUT_OF_BOUNDS", {
        byteOffset,
        byteLength,
        bufferByteLength: webglBuffer.byteLength
      });
    }
    const output = new Uint8Array(byteLength);
    this.bindNoVertexArray();
    this.stateCache.bindBuffer(webglBuffer.target, webglBuffer.handle, () => this.gl.bindBuffer(webglBuffer.target, webglBuffer.handle));
    this.gl.getBufferSubData(webglBuffer.target, byteOffset, output);
    return output;
  }

  createShaderProgram(sources: ShaderSources): RenderShaderProgram {
    this.assertAlive();
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
    this.shaderProgramCreateCount += 1;
    this.gl.attachShader(program, vertexShader);
    this.gl.attachShader(program, fragmentShader);
    this.gl.linkProgram(program);
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
    this.assertAlive();
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
    const colorHandle = this.gl.createTexture();
    const framebuffer = this.gl.createFramebuffer();
    const depthMode = descriptor.depth === "texture" ? "texture" : descriptor.depth === false ? "none" : "renderbuffer";
    const depthHandle = depthMode === "renderbuffer" ? this.gl.createRenderbuffer() : null;
    const depthTextureHandle = depthMode === "texture" ? this.gl.createTexture() : null;
    if (!colorHandle || !framebuffer || (depthMode === "renderbuffer" && !depthHandle) || (depthMode === "texture" && !depthTextureHandle)) {
      if (colorHandle) this.gl.deleteTexture(colorHandle);
      if (framebuffer) this.gl.deleteFramebuffer(framebuffer);
      if (depthHandle) this.gl.deleteRenderbuffer(depthHandle);
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
    const textureFormat = this.resolveRenderTargetFormat(format);
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
    if (depthHandle) {
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
    const status = this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER);
    this.gl.bindRenderbuffer(this.gl.RENDERBUFFER, previousRenderbuffer);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, previousFramebuffer);
    this.gl.bindTexture(this.gl.TEXTURE_2D, previousTexture);
    this.gl.activeTexture(previousActiveTexture);
    this.stateCache.invalidate();
    if (status !== this.gl.FRAMEBUFFER_COMPLETE) {
      this.gl.deleteTexture(colorHandle);
      this.gl.deleteFramebuffer(framebuffer);
      this.gl.deleteRenderbuffer(depthHandle);
      if (depthTextureHandle) this.gl.deleteTexture(depthTextureHandle);
      throw new RenderDeviceError("WebGL render target framebuffer status is invalid", "FRAMEBUFFER_INVALID", { status });
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
      depthHandle,
      depthTextureHandle,
      this.gl
    );
    this.renderTargets.add(target);
    this.textures.set(target.colorTexture, colorHandle);
    this.textureUploadModes.set(target.colorTexture, "rgba8");
    if (depthTexture && depthTextureHandle) {
      this.textures.set(depthTexture, depthTextureHandle);
      this.textureUploadModes.set(depthTexture, "depth-render-target");
    }
    return target;
  }

  setRenderTarget(target: RenderTarget | null): void {
    this.assertAlive();
    if (target === null) {
      this.activeRenderTarget = null;
      this.stateCache.bindFramebuffer(this.gl.FRAMEBUFFER, null, () => this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null));
      this.stateCache.viewport(
        0,
        0,
        this.viewportWidth || this.gl.drawingBufferWidth,
        this.viewportHeight || this.gl.drawingBufferHeight,
        () => this.gl.viewport(0, 0, this.viewportWidth || this.gl.drawingBufferWidth, this.viewportHeight || this.gl.drawingBufferHeight)
      );
      return;
    }
    if (!(target instanceof WebGL2RenderTarget) || !this.renderTargets.has(target) || target.disposed) {
      throw new RenderDeviceError("Render target is not a live WebGL2 resource owned by this device", "INVALID_RESOURCE", {
        targetId: target.id
      });
    }
    this.activeRenderTarget = target;
    this.stateCache.bindFramebuffer(this.gl.FRAMEBUFFER, target.framebuffer, () => this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, target.framebuffer));
    this.stateCache.viewport(0, 0, target.width, target.height, () => this.gl.viewport(0, 0, target.width, target.height));
  }

  writeRenderTargetPixels(target: RenderTarget, pixels: Uint8Array): void {
    this.assertAlive();
    if (!(target instanceof WebGL2RenderTarget) || !this.renderTargets.has(target) || target.disposed) {
      throw new RenderDeviceError("Render target is not a live WebGL2 resource owned by this device", "INVALID_RESOURCE", {
        targetId: target.id
      });
    }
    if (target.colorTexture.format !== "rgba8") {
      throw new RenderDeviceError("Byte pixel uploads are only supported for rgba8 WebGL2 render targets", "INVALID_PIXEL_UPLOAD_FORMAT", {
        targetId: target.id,
        format: target.colorTexture.format
      });
    }
    if (pixels.length !== target.width * target.height * 4) {
      throw new RenderDeviceError("Render-target pixel upload must contain width * height * 4 bytes", "INVALID_PIXEL_UPLOAD_SIZE", {
        targetId: target.id,
        byteLength: pixels.length,
        expectedByteLength: target.width * target.height * 4
      });
    }
    const textureUnit0 = this.captureTextureUnit0();
    try {
      this.gl.bindTexture(this.gl.TEXTURE_2D, target.colorHandle);
      this.gl.texSubImage2D(this.gl.TEXTURE_2D, 0, 0, 0, target.width, target.height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels);
    } finally {
      this.restoreTextureUnit0(textureUnit0);
    }
    this.lastError = this.readError();
    if (this.lastError) {
      throw new RenderDeviceError("WebGL2 render-target pixel upload failed", "WEBGL_PIXEL_UPLOAD_FAILED", {
        targetId: target.id,
        error: this.lastError
      });
    }
  }

  presentRenderTarget(source: RenderTarget): void {
    this.assertAlive();
    if (!(source instanceof WebGL2RenderTarget) || !this.renderTargets.has(source) || source.disposed) {
      throw new RenderDeviceError("Render target is not a live WebGL2 resource owned by this device", "INVALID_RESOURCE", {
        targetId: source.id
      });
    }
    const outputWidth = this.viewportWidth || this.gl.drawingBufferWidth;
    const outputHeight = this.viewportHeight || this.gl.drawingBufferHeight;
    this.drawRenderTargetToBackbuffer(source, outputWidth, outputHeight);
    this.activeRenderTarget = null;
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.lastError = this.readError();
    if (this.lastError) {
      throw new RenderDeviceError(`WebGL2 render-target presentation failed: ${this.lastError}`, "WEBGL_PRESENT_FAILED", {
        targetId: source.id,
        error: this.lastError
      });
    }
  }

  presentLdrPostprocess(source: RenderTarget, options: LdrPostprocessPresentationOptions): void {
    this.assertAlive();
    if (!(source instanceof WebGL2RenderTarget) || !this.renderTargets.has(source) || source.disposed) {
      throw new RenderDeviceError("Render target is not a live WebGL2 resource owned by this device", "INVALID_RESOURCE", {
        targetId: source.id
      });
    }
    const tonePass = options.passes.find((pass) => pass.name === "tone-mapping");
    if (source.colorTexture.format !== "rgba8" && !tonePass) {
      throw new RenderDeviceError("WebGL2 HDR postprocess presentation requires a tone-mapping pass before LDR output.", "WEBGL_LDR_POSTPROCESS_FORMAT_UNSUPPORTED", {
        targetId: source.id,
        format: source.colorTexture.format
      });
    }
    const outputTarget = options.outputTarget;
    if (outputTarget && (!(outputTarget instanceof WebGL2RenderTarget) || !this.renderTargets.has(outputTarget) || outputTarget.disposed)) {
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
    const toneOptions = { ...(options.toneMappingDefaults ?? {}), ...(tonePass?.options ?? {}) };
    const colorOptions = colorPass?.options ?? {};
    const fxaaOptions = fxaaPass?.options ?? {};
    const program = this.ensureLdrPostprocessProgram();
    const vertexArray = this.ensurePresentationVertexArray();
    const outputWidth = webglOutputTarget?.width ?? (this.viewportWidth || this.gl.drawingBufferWidth);
    const outputHeight = webglOutputTarget?.height ?? (this.viewportHeight || this.gl.drawingBufferHeight);
    const previousState = this.prepareFullscreenPresentation(webglOutputTarget?.framebuffer ?? null, outputWidth, outputHeight);
    try {
      this.gl.useProgram(program);
      this.gl.bindVertexArray(vertexArray);
      this.gl.activeTexture(this.gl.TEXTURE0);
      this.gl.bindTexture(this.gl.TEXTURE_2D, source.colorHandle);
      this.gl.bindSampler(0, null);
      this.gl.uniform1i(this.gl.getUniformLocation(program, "u_source"), 0);
      this.gl.uniform2f(this.gl.getUniformLocation(program, "u_texelSize"), 1 / source.width, 1 / source.height);
      this.gl.uniform1i(this.gl.getUniformLocation(program, "u_hasToneMapping"), tonePass ? 1 : 0);
      this.gl.uniform1i(this.gl.getUniformLocation(program, "u_toneOperator"), toneMappingOperatorId(stringOption(toneOptions, "operator", "reinhard")));
      this.gl.uniform1i(this.gl.getUniformLocation(program, "u_inputColorSpace"), colorSpaceId(stringOption(toneOptions, "inputColorSpace", "linear")));
      this.gl.uniform1i(this.gl.getUniformLocation(program, "u_outputColorSpace"), colorSpaceId(stringOption(toneOptions, "outputColorSpace", "linear")));
      this.gl.uniform1f(this.gl.getUniformLocation(program, "u_exposure"), numberOption(toneOptions, "exposure", 1));
      this.gl.uniform1f(this.gl.getUniformLocation(program, "u_whitePoint"), Math.max(0.0001, numberOption(toneOptions, "whitePoint", 1)));
      this.gl.uniform1f(this.gl.getUniformLocation(program, "u_gamma"), Math.max(0.0001, numberOption(toneOptions, "gamma", 2.2)));
      this.gl.uniform1i(this.gl.getUniformLocation(program, "u_hasColorGrade"), colorPass ? 1 : 0);
      this.gl.uniform1f(this.gl.getUniformLocation(program, "u_contrast"), numberOption(colorOptions, "contrast", 1));
      this.gl.uniform1f(this.gl.getUniformLocation(program, "u_temperature"), numberOption(colorOptions, "temperature", 0));
      this.gl.uniform1f(this.gl.getUniformLocation(program, "u_tint"), numberOption(colorOptions, "tint", 0));
      this.gl.uniform1f(this.gl.getUniformLocation(program, "u_saturation"), numberOption(colorOptions, "saturation", 1));
      this.gl.uniform1f(this.gl.getUniformLocation(program, "u_vibrance"), numberOption(colorOptions, "vibrance", 0));
      this.gl.uniform1f(this.gl.getUniformLocation(program, "u_vignette"), numberOption(colorOptions, "vignette", 0));
      this.gl.uniform1f(this.gl.getUniformLocation(program, "u_sharpening"), numberOption(colorOptions, "sharpening", 0));
      this.gl.uniform1i(this.gl.getUniformLocation(program, "u_hasFxaa"), fxaaPass ? 1 : 0);
      this.gl.uniform1f(this.gl.getUniformLocation(program, "u_edgeThreshold"), numberOption(fxaaOptions, "edgeThreshold", 0.125));
      this.gl.uniform1f(this.gl.getUniformLocation(program, "u_subpixelBlend"), numberOption(fxaaOptions, "subpixelBlend", 0.75));
      this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
      this.gl.flush();
    } finally {
      this.restoreFullscreenPresentationState(previousState, outputWidth, outputHeight);
    }
    this.lastError = this.readError();
    if (this.lastError) {
      throw new RenderDeviceError(`WebGL2 LDR postprocess presentation failed: ${this.lastError}`, "WEBGL_LDR_POSTPROCESS_FAILED", {
        targetId: source.id,
        error: this.lastError
      });
    }
    this.setRenderTarget(webglOutputTarget ?? null);
  }

  readPixels(x: number, y: number, width: number, height: number): Uint8Array {
    this.assertAlive();
    if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width <= 0 || height <= 0) {
      throw new RenderDeviceError("Readback rectangle must be positive and in bounds", "INVALID_READBACK_RECT", { x, y, width, height });
    }
    const boundsWidth = this.activeRenderTarget?.width ?? this.gl.drawingBufferWidth;
    const boundsHeight = this.activeRenderTarget?.height ?? this.gl.drawingBufferHeight;
    if (x + width > boundsWidth || y + height > boundsHeight) {
      throw new RenderDeviceError("Readback rectangle exceeds framebuffer bounds", "READBACK_OUT_OF_BOUNDS", {
        x,
        y,
        width,
        height,
        boundsWidth,
        boundsHeight
      });
    }
    const pixels = new Uint8Array(width * height * 4);
    this.gl.readPixels(x, y, width, height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels);
    return pixels;
  }

  readFloatPixels(x: number, y: number, width: number, height: number): Float32Array {
    this.assertAlive();
    if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width <= 0 || height <= 0) {
      throw new RenderDeviceError("Float readback rectangle must be positive and in bounds", "INVALID_READBACK_RECT", { x, y, width, height });
    }
    const boundsWidth = this.activeRenderTarget?.width ?? this.gl.drawingBufferWidth;
    const boundsHeight = this.activeRenderTarget?.height ?? this.gl.drawingBufferHeight;
    if (x + width > boundsWidth || y + height > boundsHeight) {
      throw new RenderDeviceError("Float readback rectangle exceeds framebuffer bounds", "READBACK_OUT_OF_BOUNDS", {
        x,
        y,
        width,
        height,
        boundsWidth,
        boundsHeight
      });
    }
    const pixels = new Float32Array(width * height * 4);
    this.gl.readPixels(x, y, width, height, this.gl.RGBA, this.gl.FLOAT, pixels);
    return pixels;
  }

  readDepthPixels(x: number, y: number, width: number, height: number): Float32Array {
    this.assertAlive();
    if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width <= 0 || height <= 0) {
      throw new RenderDeviceError("Depth readback rectangle must be positive and in bounds", "INVALID_READBACK_RECT", { x, y, width, height });
    }
    const target = this.activeRenderTarget;
    if (!target?.depthTextureHandle) {
      throw new RenderDeviceError("Depth readback requires an active WebGL2 render target with a sampleable depth texture.", "DEPTH_READBACK_UNAVAILABLE", {
        renderTarget: target?.label ?? null
      });
    }
    if (x + width > target.width || y + height > target.height) {
      throw new RenderDeviceError("Depth readback rectangle exceeds framebuffer bounds", "READBACK_OUT_OF_BOUNDS", {
        x,
        y,
        width,
        height,
        boundsWidth: target.width,
        boundsHeight: target.height
      });
    }
    const encoded = this.copyDepthTextureToBytes(target, x, y, width, height);
    const pixels = new Float32Array(width * height);
    for (let index = 0; index < pixels.length; index += 1) {
      const byteIndex = index * 4;
      const r = encoded[byteIndex] ?? 255;
      const g = encoded[byteIndex + 1] ?? 255;
      const b = encoded[byteIndex + 2] ?? 255;
      pixels[index] = Math.max(0, Math.min(1, r / 255 + g / 65025 + b / 16581375));
    }
    return pixels;
  }

  beginFrame(width: number, height: number): void {
    this.assertAlive();
    if (this.frameActive) {
      throw new RenderDeviceError("Frame is already active", "FRAME_ALREADY_ACTIVE");
    }
    if (width <= 0 || height <= 0) {
      throw new RenderDeviceError("Frame dimensions must be positive", "INVALID_FRAME_SIZE", { width, height });
    }
    this.frameActive = true;
    this.drawCalls = 0;
    this.nativeEnvironmentBindings = 0;
    this.nativeShadowMapBindings = 0;
    this.activeTextureUnitIndex = -1;
    this.textureUnitBindings.clear();
    this.stateCache.invalidate();
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.stateCache.bindFramebuffer(this.gl.FRAMEBUFFER, this.activeRenderTarget?.framebuffer ?? null, () => this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.activeRenderTarget?.framebuffer ?? null));
    this.stateCache.viewport(0, 0, width, height, () => this.gl.viewport(0, 0, width, height));
    this.stateCache.setEnabled(this.gl.DEPTH_TEST, true, () => this.gl.enable(this.gl.DEPTH_TEST));
    this.stateCache.depthFunc(this.gl.LEQUAL, () => this.gl.depthFunc(this.gl.LEQUAL));
  }

  clear(color: readonly [number, number, number, number]): void {
    this.assertFrame();
    this.gl.clearColor(color[0], color[1], color[2], color[3]);
    this.stateCache.depthMask(true, () => this.gl.depthMask(true));
    this.gl.clearDepth(1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
  }

  clearRenderTarget(color: readonly [number, number, number, number]): void {
    this.assertFrame();
    this.gl.clearColor(color[0], color[1], color[2], color[3]);
    this.stateCache.depthMask(true, () => this.gl.depthMask(true));
    this.gl.clearDepth(1);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
  }

  draw(command: DrawCommand): void {
    this.assertFrame();
    const vertexBuffer = this.requireBuffer(command.vertexBuffer);
    this.applyRenderState(command.renderState);
    let shader: WebGL2ShaderProgram | undefined;
    if (command.shader) {
      const activeShader = this.requireShader(command.shader);
      shader = activeShader;
      this.stateCache.useProgram(activeShader.handle, () => this.gl.useProgram(activeShader.handle));
      if (command.uniforms) {
        this.uploadUniforms(activeShader, command.uniforms);
        if (this.errorCheckMode === "strict") {
          const uniformError = this.readError();
          if (uniformError) {
            throw new RenderDeviceError(`WebGL2 uniform upload failed for draw ${command.label ?? "unnamed"}: ${uniformError}`, "WEBGL_DRAW_FAILED", {
              label: command.label,
              stage: "uniforms",
              error: uniformError
            });
          }
        }
      }
    }

    if (shader && command.vertexFormat) {
      this.bindVertexArrayForCommand(command, shader, vertexBuffer);
      if (this.errorCheckMode === "strict") {
        const vertexFormatError = this.readError();
        if (vertexFormatError) {
          throw new RenderDeviceError(`WebGL2 vertex format binding failed for draw ${command.label ?? "unnamed"}: ${vertexFormatError}`, "WEBGL_DRAW_FAILED", {
            label: command.label,
            stage: "vertex-format",
            error: vertexFormatError
          });
        }
      }
    } else {
      this.bindNoVertexArray();
      this.stateCache.bindBuffer(this.gl.ARRAY_BUFFER, vertexBuffer.handle, () => this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vertexBuffer.handle));
    }
    if (command.indexBuffer) {
      const indexBuffer = this.requireBuffer(command.indexBuffer);
      if (!shader || !command.vertexFormat) {
        this.stateCache.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer.handle, () => this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer.handle));
      }
      const type = command.indexType === "uint32" ? this.gl.UNSIGNED_INT : this.gl.UNSIGNED_SHORT;
      const indexByteSize = command.indexType === "uint32" ? 4 : 2;
      const indexOffset = (command.firstIndex ?? 0) * indexByteSize;
      if ((command.instanceCount ?? 1) > 1) {
        this.gl.drawElementsInstanced(this.primitive(command.topology), command.indexCount ?? 0, type, indexOffset, command.instanceCount ?? 1);
        this.nativeInstancedSubmissions += 1;
      } else {
        this.gl.drawElements(this.primitive(command.topology), command.indexCount ?? 0, type, indexOffset);
      }
    } else {
      if ((command.instanceCount ?? 1) > 1) {
        this.gl.drawArraysInstanced(this.primitive(command.topology), command.firstVertex ?? 0, command.vertexCount, command.instanceCount ?? 1);
        this.nativeInstancedSubmissions += 1;
      } else {
        this.gl.drawArrays(this.primitive(command.topology), command.firstVertex ?? 0, command.vertexCount);
      }
    }
    this.drawCalls += 1;
    if (this.errorCheckMode === "strict") {
      const drawError = this.readError();
      if (drawError) {
        throw new RenderDeviceError(`WebGL2 draw failed for ${command.label ?? "unnamed"}: ${drawError}`, "WEBGL_DRAW_FAILED", {
          label: command.label,
          stage: "draw",
          error: drawError
        });
      }
    }
  }

  endFrame(): void {
    this.assertFrame();
    this.frameActive = false;
    this.lastError = this.readError();
  }

  captureState(): ReadonlyMap<string, string | number | boolean | null> {
    const viewport = this.gl.getParameter(this.gl.VIEWPORT) as Int32Array | readonly number[];
    return new Map<string, string | number | boolean | null>([
      ["backend", this.kind],
      ["disposed", this.disposed],
      ["contextLost", this.contextLost],
      ["frameActive", this.frameActive],
      ["depthTest", this.gl.isEnabled(this.gl.DEPTH_TEST)],
      ["blend", this.gl.isEnabled(this.gl.BLEND)],
      ["cullFace", this.gl.isEnabled(this.gl.CULL_FACE)],
      ["program", this.gl.getParameter(this.gl.CURRENT_PROGRAM) ? "bound" : null],
      ["arrayBuffer", this.gl.getParameter(this.gl.ARRAY_BUFFER_BINDING) ? "bound" : null],
      ["elementArrayBuffer", this.gl.getParameter(this.gl.ELEMENT_ARRAY_BUFFER_BINDING) ? "bound" : null],
      ["viewportWidth", this.viewportWidth],
      ["viewportHeight", this.viewportHeight],
      ["actualViewportWidth", viewport[2] ?? 0],
      ["actualViewportHeight", viewport[3] ?? 0],
      ["renderTarget", this.activeRenderTarget?.label ?? null],
      ["drawCalls", this.drawCalls],
      ["shaderProgramCreates", this.shaderProgramCreateCount],
      ["uniformLocationLookups", this.uniformLocationLookupCount],
      ["bufferUpdates", this.bufferUpdateCount],
      ["textureBinds", this.textureBindCount],
      ["samplerParameterUploads", this.samplerParameterUploadCount],
      ["vertexArrayCreates", this.vertexArrayCreateCount],
      ["samplerObjects", this.samplerObjectCache.size],
      ["samplerAnisotropyUploads", this.samplerAnisotropyUploadCount],
      ["maxTextureAnisotropy", this.maxTextureAnisotropy],
      ["nativeEnvironmentBindings", this.nativeEnvironmentBindings],
      ["nativeShadowMapBindings", this.nativeShadowMapBindings],
      ["nativeInstancedSubmissions", this.nativeInstancedSubmissions],
      ["stateCacheIssued", this.stateCache.stats().issued],
      ["stateCacheSkipped", this.stateCache.stats().skipped]
    ]);
  }

  getDiagnostics(): RenderDeviceDiagnostics {
    this.releaseDisposedTextureHandles();
    const liveRenderTargets = [...this.renderTargets].filter((target) => !target.disposed);
    const liveTextures = new Set<Texture>([
      ...liveRenderTargets.map((target) => target.colorTexture),
      ...[...this.textures.keys()].filter((texture) => !texture.disposed)
    ]);
    const liveTextureList = [...liveTextures];
    const compressedTextures = liveTextureList.filter((texture) => isCompressedTextureFormat(texture.format));
    const fallbackTextures = liveTextureList.filter((texture) => this.textureUploadModes.get(texture) === "fallback");
    const stateCacheStats = this.stateCache.stats();
    const bufferBytes = [...this.buffers].filter((buffer) => !buffer.disposed).reduce((total, buffer) => total + buffer.byteLength, 0);
    const textureBytes = liveTextureList.reduce((total, texture) => total + texture.byteLength, 0);
    return {
      drawCalls: this.drawCalls,
      buffers: [...this.buffers].filter((buffer) => !buffer.disposed).length,
      shaders: [...this.shaders].filter((shader) => !shader.disposed).length,
      renderTargets: liveRenderTargets.length,
      textures: liveTextures.size,
      bufferBytes,
      textureBytes,
      approximateGpuMemoryBytes: bufferBytes + textureBytes,
      compressedTextures: compressedTextures.length,
      compressedTextureBytes: compressedTextures.reduce((total, texture) => total + texture.byteLength, 0),
      textureFallbacks: fallbackTextures.length,
      textureFallbackBytes: fallbackTextures.reduce((total, texture) => total + texture.fallbackByteLength, 0),
      nativeEnvironmentBindings: this.nativeEnvironmentBindings,
      nativeShadowMapBindings: this.nativeShadowMapBindings,
      nativeInstancedSubmissions: this.nativeInstancedSubmissions,
      samplerAnisotropyUploads: this.samplerAnisotropyUploadCount,
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
      disposedTextures: [...this.renderTargets].filter((target) => target.colorTexture.disposed).length + this.releasedTextureHandles,
      lastError: this.lastError,
      contextLost: this.contextLost
    };
  }

  dispose(): void {
    if (this.canvas && "removeEventListener" in this.canvas) {
      if (this.contextLostListener) this.canvas.removeEventListener("webglcontextlost", this.contextLostListener);
      if (this.contextRestoredListener) this.canvas.removeEventListener("webglcontextrestored", this.contextRestoredListener);
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
    for (const entry of this.vertexArrayCache.values()) {
      this.gl.deleteVertexArray(entry.handle);
    }
    this.vertexArrayCache.clear();
    for (const sampler of this.samplerObjectCache.values()) {
      this.gl.deleteSampler(sampler);
    }
    this.samplerObjectCache.clear();
    for (const texture of this.textures.values()) {
      this.gl.deleteTexture(texture);
    }
    this.textureUploadModes.clear();
    if (this.fallbackTexture) {
      this.gl.deleteTexture(this.fallbackTexture);
      this.fallbackTexture = null;
    }
    if (this.fallbackCubeTexture) {
      this.gl.deleteTexture(this.fallbackCubeTexture);
      this.fallbackCubeTexture = null;
    }
    if (this.presentationProgram) {
      this.gl.deleteProgram(this.presentationProgram);
      this.presentationProgram = null;
    }
    if (this.ldrPostprocessProgram) {
      this.gl.deleteProgram(this.ldrPostprocessProgram);
      this.ldrPostprocessProgram = null;
    }
    if (this.presentationVertexArray) {
      this.gl.deleteVertexArray(this.presentationVertexArray);
      this.presentationVertexArray = null;
    }
    if (this.depthReadbackProgram) {
      this.gl.deleteProgram(this.depthReadbackProgram);
      this.depthReadbackProgram = null;
    }
    this.textures.clear();
    this.disposed = true;
  }

  private copyDepthTextureToBytes(source: WebGL2RenderTarget, x: number, y: number, width: number, height: number): Uint8Array {
    const colorHandle = this.gl.createTexture();
    const framebuffer = this.gl.createFramebuffer();
    if (!colorHandle || !framebuffer) {
      if (colorHandle) this.gl.deleteTexture(colorHandle);
      if (framebuffer) this.gl.deleteFramebuffer(framebuffer);
      throw new RenderDeviceError("Failed to allocate WebGL2 depth readback target", "WEBGL_ALLOCATION_FAILED", {
        renderTarget: source.label
      });
    }
    const previousFramebuffer = this.gl.getParameter(this.gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
    const previousProgram = this.gl.getParameter(this.gl.CURRENT_PROGRAM) as WebGLProgram | null;
    const textureUnit0 = this.captureTextureUnit0();
    const viewport = this.gl.getParameter(this.gl.VIEWPORT) as Int32Array | readonly number[];
    const depthTestEnabled = this.gl.isEnabled(this.gl.DEPTH_TEST);
    const depthMask = this.gl.getParameter(this.gl.DEPTH_WRITEMASK) as boolean;
    const cullFaceEnabled = this.gl.isEnabled(this.gl.CULL_FACE);
    const blendEnabled = this.gl.isEnabled(this.gl.BLEND);
    const pixels = new Uint8Array(width * height * 4);
    try {
      this.gl.activeTexture(this.gl.TEXTURE0);
      this.gl.bindTexture(this.gl.TEXTURE_2D, colorHandle);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
      this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA8, width, height, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, null);
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, framebuffer);
      this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, colorHandle, 0);
      const status = this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER);
      if (status !== this.gl.FRAMEBUFFER_COMPLETE) {
        throw new RenderDeviceError("WebGL2 depth readback framebuffer status is invalid", "FRAMEBUFFER_INVALID", {
          renderTarget: source.label,
          status
        });
      }
      this.gl.viewport(0, 0, width, height);
      this.gl.disable(this.gl.DEPTH_TEST);
      this.gl.disable(this.gl.CULL_FACE);
      this.gl.disable(this.gl.BLEND);
      this.gl.depthMask(false);
      this.gl.useProgram(this.ensureDepthReadbackProgram());
      this.gl.activeTexture(this.gl.TEXTURE0);
      this.gl.bindTexture(this.gl.TEXTURE_2D, source.depthTextureHandle);
      this.gl.bindSampler(0, null);
      this.gl.uniform1i(this.gl.getUniformLocation(this.ensureDepthReadbackProgram(), "u_depth"), 0);
      this.gl.uniform4f(this.gl.getUniformLocation(this.ensureDepthReadbackProgram(), "u_sourceRect"), x / source.width, y / source.height, width / source.width, height / source.height);
      this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
      this.gl.readPixels(0, 0, width, height, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixels);
      const error = this.readError();
      if (error) {
        throw new RenderDeviceError("WebGL2 depth texture readback failed", "WEBGL_DEPTH_READBACK_FAILED", {
          renderTarget: source.label,
          error
        });
      }
      return pixels;
    } finally {
      this.restoreTextureUnit0(textureUnit0);
      this.gl.useProgram(previousProgram);
      if (depthTestEnabled) this.gl.enable(this.gl.DEPTH_TEST);
      else this.gl.disable(this.gl.DEPTH_TEST);
      if (cullFaceEnabled) this.gl.enable(this.gl.CULL_FACE);
      else this.gl.disable(this.gl.CULL_FACE);
      if (blendEnabled) this.gl.enable(this.gl.BLEND);
      else this.gl.disable(this.gl.BLEND);
      this.gl.depthMask(depthMask);
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, previousFramebuffer);
      this.gl.viewport(viewport[0] ?? 0, viewport[1] ?? 0, viewport[2] ?? this.viewportWidth, viewport[3] ?? this.viewportHeight);
      this.gl.deleteTexture(colorHandle);
      this.gl.deleteFramebuffer(framebuffer);
      this.stateCache.invalidate();
    }
  }

  private drawRenderTargetToBackbuffer(source: WebGL2RenderTarget, outputWidth: number, outputHeight: number): void {
    const program = this.ensurePresentationProgram();
    const vertexArray = this.ensurePresentationVertexArray();
    const previousState = this.prepareFullscreenPresentation(null, outputWidth, outputHeight);
    this.gl.useProgram(program);
    this.gl.bindVertexArray(vertexArray);
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, source.colorHandle);
    this.gl.bindSampler(0, null);
    try {
      const uniformLocation = this.gl.getUniformLocation(program, "u_source");
      this.gl.uniform1i(uniformLocation, 0);
      this.gl.drawArrays(this.gl.TRIANGLES, 0, 3);
      this.gl.flush();
    } finally {
      this.restoreFullscreenPresentationState(previousState, outputWidth, outputHeight);
    }
  }

  private captureTextureUnit0(): WebGL2TextureUnit0Snapshot {
    const activeTexture = this.gl.getParameter(this.gl.ACTIVE_TEXTURE) as GLenum;
    this.gl.activeTexture(this.gl.TEXTURE0);
    return {
      activeTexture,
      texture2d: this.gl.getParameter(this.gl.TEXTURE_BINDING_2D) as WebGLTexture | null,
      sampler: this.gl.getParameter(this.gl.SAMPLER_BINDING) as WebGLSampler | null
    };
  }

  private restoreTextureUnit0(snapshot: WebGL2TextureUnit0Snapshot): void {
    this.gl.activeTexture(this.gl.TEXTURE0);
    this.gl.bindTexture(this.gl.TEXTURE_2D, snapshot.texture2d);
    this.gl.bindSampler(0, snapshot.sampler);
    this.gl.activeTexture(snapshot.activeTexture);
  }

  private prepareFullscreenPresentation(framebuffer: WebGLFramebuffer | null, outputWidth: number, outputHeight: number): WebGL2FullscreenPresentationStateSnapshot {
    const snapshot: WebGL2FullscreenPresentationStateSnapshot = {
      framebuffer: this.gl.getParameter(this.gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null,
      program: this.gl.getParameter(this.gl.CURRENT_PROGRAM) as WebGLProgram | null,
      textureUnit0: this.captureTextureUnit0(),
      vertexArray: this.gl.getParameter(this.gl.VERTEX_ARRAY_BINDING) as WebGLVertexArrayObject | null,
      viewport: this.gl.getParameter(this.gl.VIEWPORT) as Int32Array | readonly number[],
      colorMask: this.gl.getParameter(this.gl.COLOR_WRITEMASK) as readonly boolean[],
      depthTestEnabled: this.gl.isEnabled(this.gl.DEPTH_TEST),
      cullFaceEnabled: this.gl.isEnabled(this.gl.CULL_FACE),
      blendEnabled: this.gl.isEnabled(this.gl.BLEND),
      scissorTestEnabled: this.gl.isEnabled(this.gl.SCISSOR_TEST),
      stencilTestEnabled: this.gl.isEnabled(this.gl.STENCIL_TEST),
      polygonOffsetFillEnabled: this.gl.isEnabled(this.gl.POLYGON_OFFSET_FILL),
      depthMask: this.gl.getParameter(this.gl.DEPTH_WRITEMASK) as boolean
    };
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, framebuffer);
    this.gl.viewport(0, 0, outputWidth, outputHeight);
    this.gl.colorMask(true, true, true, true);
    this.gl.disable(this.gl.SCISSOR_TEST);
    this.gl.disable(this.gl.STENCIL_TEST);
    this.gl.disable(this.gl.POLYGON_OFFSET_FILL);
    this.gl.disable(this.gl.DEPTH_TEST);
    this.gl.disable(this.gl.CULL_FACE);
    this.gl.disable(this.gl.BLEND);
    this.gl.depthMask(false);
    return snapshot;
  }

  private restoreFullscreenPresentationState(snapshot: WebGL2FullscreenPresentationStateSnapshot, fallbackWidth: number, fallbackHeight: number): void {
    this.gl.bindVertexArray(snapshot.vertexArray);
    this.restoreTextureUnit0(snapshot.textureUnit0);
    this.gl.useProgram(snapshot.program);
    if (snapshot.depthTestEnabled) this.gl.enable(this.gl.DEPTH_TEST);
    else this.gl.disable(this.gl.DEPTH_TEST);
    if (snapshot.cullFaceEnabled) this.gl.enable(this.gl.CULL_FACE);
    else this.gl.disable(this.gl.CULL_FACE);
    if (snapshot.blendEnabled) this.gl.enable(this.gl.BLEND);
    else this.gl.disable(this.gl.BLEND);
    if (snapshot.scissorTestEnabled) this.gl.enable(this.gl.SCISSOR_TEST);
    else this.gl.disable(this.gl.SCISSOR_TEST);
    if (snapshot.stencilTestEnabled) this.gl.enable(this.gl.STENCIL_TEST);
    else this.gl.disable(this.gl.STENCIL_TEST);
    if (snapshot.polygonOffsetFillEnabled) this.gl.enable(this.gl.POLYGON_OFFSET_FILL);
    else this.gl.disable(this.gl.POLYGON_OFFSET_FILL);
    this.gl.colorMask(snapshot.colorMask[0] ?? true, snapshot.colorMask[1] ?? true, snapshot.colorMask[2] ?? true, snapshot.colorMask[3] ?? true);
    this.gl.depthMask(snapshot.depthMask);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, snapshot.framebuffer);
    this.gl.viewport(snapshot.viewport[0] ?? 0, snapshot.viewport[1] ?? 0, snapshot.viewport[2] ?? fallbackWidth, snapshot.viewport[3] ?? fallbackHeight);
    this.stateCache.invalidate();
  }

  private ensurePresentationVertexArray(): WebGLVertexArrayObject {
    if (this.presentationVertexArray) return this.presentationVertexArray;
    const vertexArray = this.gl.createVertexArray();
    if (!vertexArray) {
      throw new RenderDeviceError("Failed to allocate WebGL presentation vertex array", "WEBGL_ALLOCATION_FAILED");
    }
    this.presentationVertexArray = vertexArray;
    return vertexArray;
  }

  private ensureDepthReadbackProgram(): WebGLProgram {
    if (this.depthReadbackProgram) {
      return this.depthReadbackProgram;
    }
    const vertex = this.compileShader(this.gl.VERTEX_SHADER, `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
  vec2 position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = position;
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}
`, "webgl2-depth-readback");
    const fragment = this.compileShader(this.gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
uniform sampler2D u_depth;
uniform vec4 u_sourceRect;
in vec2 v_uv;
out vec4 outColor;
vec3 packDepth24(float value) {
  value = clamp(value, 0.0, 1.0);
  vec3 encoded = fract(value * vec3(1.0, 255.0, 65025.0));
  encoded -= encoded.yzz * vec3(1.0 / 255.0, 1.0 / 255.0, 0.0);
  return encoded;
}
void main() {
  vec2 uv = u_sourceRect.xy + v_uv * u_sourceRect.zw;
  outColor = vec4(packDepth24(texture(u_depth, uv).r), 1.0);
}
`, "webgl2-depth-readback");
    const program = this.gl.createProgram();
    if (!program) {
      this.gl.deleteShader(vertex);
      this.gl.deleteShader(fragment);
      throw new RenderDeviceError("Failed to allocate WebGL2 depth readback shader", "WEBGL_ALLOCATION_FAILED");
    }
    this.gl.attachShader(program, vertex);
    this.gl.attachShader(program, fragment);
    this.gl.linkProgram(program);
    this.gl.deleteShader(vertex);
    this.gl.deleteShader(fragment);
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const log = this.gl.getProgramInfoLog(program) ?? "Unknown depth readback shader link error";
      this.gl.deleteProgram(program);
      throw new RenderDeviceError("WebGL2 depth readback shader link failed", "SHADER_LINK_FAILED", { log });
    }
    this.depthReadbackProgram = program;
    return program;
  }

  private ensurePresentationProgram(): WebGLProgram {
    if (this.presentationProgram) {
      return this.presentationProgram;
    }
    const vertex = this.compileShader(this.gl.VERTEX_SHADER, `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
  vec2 position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = position;
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}
`, "webgl2-present-render-target");
    const fragment = this.compileShader(this.gl.FRAGMENT_SHADER, `#version 300 es
precision highp float;
uniform sampler2D u_source;
in vec2 v_uv;
out vec4 outColor;
void main() {
  outColor = texture(u_source, v_uv);
}
`, "webgl2-present-render-target");
    const program = this.gl.createProgram();
    if (!program) {
      this.gl.deleteShader(vertex);
      this.gl.deleteShader(fragment);
      throw new RenderDeviceError("Failed to allocate WebGL presentation shader", "WEBGL_ALLOCATION_FAILED");
    }
    this.gl.attachShader(program, vertex);
    this.gl.attachShader(program, fragment);
    this.gl.linkProgram(program);
    this.gl.deleteShader(vertex);
    this.gl.deleteShader(fragment);
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const log = this.gl.getProgramInfoLog(program) ?? "Unknown presentation shader link error";
      this.gl.deleteProgram(program);
      throw new RenderDeviceError("WebGL presentation shader link failed", "SHADER_LINK_FAILED", { log });
    }
    this.presentationProgram = program;
    return program;
  }

  private ensureLdrPostprocessProgram(): WebGLProgram {
    if (this.ldrPostprocessProgram) {
      return this.ldrPostprocessProgram;
    }
    const vertex = this.compileShader(this.gl.VERTEX_SHADER, `#version 300 es
precision highp float;
out vec2 v_uv;
void main() {
  vec2 position = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  v_uv = position;
  gl_Position = vec4(position * 2.0 - 1.0, 0.0, 1.0);
}
`, "webgl2-ldr-postprocess");
    const fragment = this.compileShader(this.gl.FRAGMENT_SHADER, `#version 300 es
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

float aces(float value) {
  return (value * (2.51 * value + 0.03)) / (value * (2.43 * value + 0.59) + 0.14);
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
  if (u_toneOperator == 2) return aces(exposed);
  if (u_toneOperator == 3) return filmic(exposed);
  if (u_toneOperator == 4) return uncharted2(exposed);
  if (u_toneOperator == 5) return agx(exposed);
  return neutral(exposed);
}

vec3 applyToneMapping(vec3 color) {
  if (u_hasToneMapping == 0) return color;
  vec3 decoded = decodeColor(color);
  vec3 mapped = vec3(toneMapChannel(decoded.r), toneMapChannel(decoded.g), toneMapChannel(decoded.b));
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
    const program = this.gl.createProgram();
    if (!program) {
      this.gl.deleteShader(vertex);
      this.gl.deleteShader(fragment);
      throw new RenderDeviceError("Failed to allocate WebGL2 LDR postprocess shader", "WEBGL_ALLOCATION_FAILED");
    }
    this.gl.attachShader(program, vertex);
    this.gl.attachShader(program, fragment);
    this.gl.linkProgram(program);
    this.gl.deleteShader(vertex);
    this.gl.deleteShader(fragment);
    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const log = this.gl.getProgramInfoLog(program) ?? "Unknown LDR postprocess shader link error";
      this.gl.deleteProgram(program);
      throw new RenderDeviceError("WebGL2 LDR postprocess shader link failed", "SHADER_LINK_FAILED", { log });
    }
    this.ldrPostprocessProgram = program;
    return program;
  }

  private compileShader(type: GLenum, source: string, label: string): WebGLShader {
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

  private uploadUniforms(shader: WebGL2ShaderProgram, uniforms: ReadonlyMap<string, unknown>): void {
    let textureUnit = 0;
    for (const [name, value] of uniforms) {
      if (!shader.reflection.uniforms.has(name)) {
        continue;
      }
      const location = this.getUniformLocation(shader, name);
      if (location === null) {
        throw new RenderDeviceError("Material tried to bind a missing shader uniform", "MISSING_UNIFORM", { name });
      }
      if (value instanceof TextureBinding) {
        this.uploadTextureUniform(location, value, textureUnit);
        textureUnit += 1;
      } else if (typeof value === "number") {
        this.gl.uniform1f(location, value);
      } else if (Array.isArray(value) || ArrayBuffer.isView(value)) {
        const length = (value as ArrayLike<number>).length;
        const floatData = value as Float32List;
        if (length === 16 || (length > 16 && length % 16 === 0 && /(?:Matrix|Matrices)$/.test(name))) {
          this.gl.uniformMatrix4fv(location, false, floatData);
        } else if (length > 16 && length % 4 === 0) {
          this.gl.uniform4fv(location, floatData);
        } else if (length === 4) {
          this.gl.uniform4fv(location, floatData);
        } else if (length === 3) {
          this.gl.uniform3fv(location, floatData);
        } else if (length === 2) {
          this.gl.uniform2fv(location, floatData);
        } else {
          throw new RenderDeviceError("Unsupported uniform array length", "UNSUPPORTED_UNIFORM", { name, length });
        }
      } else {
        throw new RenderDeviceError("Unsupported uniform value", "UNSUPPORTED_UNIFORM", { name, valueType: typeof value });
      }
    }
  }

  private getUniformLocation(shader: WebGL2ShaderProgram, name: string): WebGLUniformLocation | null {
    let cache = this.uniformLocationCache.get(shader);
    if (!cache) {
      cache = new Map();
      this.uniformLocationCache.set(shader, cache);
    }
    if (!cache.has(name)) {
      this.uniformLocationLookupCount += 1;
      cache.set(name, this.gl.getUniformLocation(shader.handle, name) ?? this.gl.getUniformLocation(shader.handle, `${name}[0]`));
    }
    return cache.get(name) ?? null;
  }

  private uploadTextureUniform(location: WebGLUniformLocation, binding: TextureBinding, textureUnit: number): void {
    const validation = binding.validate();
    if (!validation.ok) {
      throw new RenderDeviceError("Texture binding validation failed", "INVALID_TEXTURE_BINDING", {
        diagnostics: validation.diagnostics,
        name: binding.name
      });
    }
    this.activateTextureUnit(textureUnit);
    const dimension = binding.texture?.dimension ?? (binding.name.toLowerCase().includes("cubemap") || binding.name.toLowerCase().includes("cube") ? "cube" : "2d");
    const target = dimension === "cube" ? this.gl.TEXTURE_CUBE_MAP : this.gl.TEXTURE_2D;
    const handle = binding.texture ? this.getTextureHandle(binding.texture) : dimension === "cube" ? this.getFallbackCubeTextureHandle() : this.getFallbackTextureHandle();
    if (binding.texture) {
      const lowerName = binding.name.toLowerCase();
      if (lowerName.includes("environment")) this.nativeEnvironmentBindings += 1;
      if (lowerName.includes("shadow")) this.nativeShadowMapBindings += 1;
    }
    this.bindTextureForUnit(textureUnit, target, handle);
    const samplerHandle = this.getSamplerHandle(binding.sampler, target);
    this.stateCache.bindSampler(textureUnit, samplerHandle, () => this.gl.bindSampler(textureUnit, samplerHandle));
    this.gl.uniform1i(location, textureUnit);
  }

  private activateTextureUnit(textureUnit: number): void {
    if (this.activeTextureUnitIndex === textureUnit) return;
    this.stateCache.activeTexture(textureUnit, () => this.gl.activeTexture(this.gl.TEXTURE0 + textureUnit));
    this.activeTextureUnitIndex = textureUnit;
  }

  private bindTextureForUnit(textureUnit: number, target: GLenum, handle: WebGLTexture): void {
    const key = `${textureUnit}:${target}`;
    if (this.textureUnitBindings.get(key) === handle) return;
    this.stateCache.bindTexture(target, handle, () => this.gl.bindTexture(target, handle));
    this.textureUnitBindings.set(key, handle);
    this.textureBindCount += 1;
  }

  private setTextureParameterIfNeeded(handle: WebGLTexture, target: GLenum, parameter: GLenum, value: GLenum | number): void {
    let parameters = this.textureSamplerParameterCache.get(handle);
    if (!parameters) {
      parameters = new Map();
      this.textureSamplerParameterCache.set(handle, parameters);
    }
    if (parameters.get(parameter) === value) return;
    this.gl.texParameteri(target, parameter, value);
    parameters.set(parameter, value);
    this.samplerParameterUploadCount += 1;
  }

  private applySamplerAnisotropy(maxAnisotropy: number, target: GLenum = this.gl.TEXTURE_2D): void {
    if (maxAnisotropy <= 1) return;
    if (!this.anisotropicFilteringExtension) return;
    this.gl.texParameterf(
      target,
      this.anisotropicFilteringExtension.TEXTURE_MAX_ANISOTROPY_EXT,
      Math.min(Math.max(1, maxAnisotropy), this.maxTextureAnisotropy)
    );
    this.samplerAnisotropyUploadCount += 1;
  }

  private getSamplerHandle(sampler: Sampler, target: GLenum): WebGLSampler {
    const key = this.samplerKey(sampler, target);
    const cached = this.samplerObjectCache.get(key);
    if (cached) return cached;
    const handle = this.gl.createSampler();
    if (!handle) {
      throw new RenderDeviceError("Failed to allocate WebGL sampler", "WEBGL_ALLOCATION_FAILED");
    }
    this.gl.samplerParameteri(handle, this.gl.TEXTURE_MIN_FILTER, this.minFilter(sampler.minFilter));
    this.gl.samplerParameteri(handle, this.gl.TEXTURE_MAG_FILTER, this.magFilter(sampler.magFilter));
    this.gl.samplerParameteri(handle, this.gl.TEXTURE_WRAP_S, this.addressMode(sampler.addressU));
    this.gl.samplerParameteri(handle, this.gl.TEXTURE_WRAP_T, this.addressMode(sampler.addressV));
    this.samplerParameterUploadCount += 4;
    if (target === this.gl.TEXTURE_CUBE_MAP) {
      this.gl.samplerParameteri(handle, this.gl.TEXTURE_WRAP_R, this.addressMode(sampler.addressV));
      this.samplerParameterUploadCount += 1;
    }
    if (sampler.maxAnisotropy > 1 && this.anisotropicFilteringExtension) {
      this.gl.samplerParameterf(
        handle,
        this.anisotropicFilteringExtension.TEXTURE_MAX_ANISOTROPY_EXT,
        Math.min(Math.max(1, sampler.maxAnisotropy), this.maxTextureAnisotropy)
      );
      this.samplerAnisotropyUploadCount += 1;
    }
    this.samplerObjectCache.set(key, handle);
    return handle;
  }

  private samplerKey(sampler: Sampler, target: GLenum): string {
    return [
      sampler.minFilter,
      sampler.magFilter,
      sampler.addressU,
      sampler.addressV,
      sampler.maxAnisotropy,
      target === this.gl.TEXTURE_CUBE_MAP ? "cube" : "2d"
    ].join("|");
  }

  private getFallbackTextureHandle(): WebGLTexture {
    if (this.fallbackTexture) {
      return this.fallbackTexture;
    }
    const handle = this.gl.createTexture();
    if (!handle) {
      throw new RenderDeviceError("Failed to allocate WebGL fallback texture", "WEBGL_ALLOCATION_FAILED");
    }
    this.stateCache.invalidate();
    this.gl.bindTexture(this.gl.TEXTURE_2D, handle);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, 1, 1, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    this.fallbackTexture = handle;
    return handle;
  }

  private getFallbackCubeTextureHandle(): WebGLTexture {
    if (this.fallbackCubeTexture) {
      return this.fallbackCubeTexture;
    }
    const handle = this.gl.createTexture();
    if (!handle) {
      throw new RenderDeviceError("Failed to allocate WebGL fallback cube texture", "WEBGL_ALLOCATION_FAILED");
    }
    this.stateCache.invalidate();
    this.gl.bindTexture(this.gl.TEXTURE_CUBE_MAP, handle);
    this.gl.texParameteri(this.gl.TEXTURE_CUBE_MAP, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_CUBE_MAP, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_CUBE_MAP, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_CUBE_MAP, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_CUBE_MAP, this.gl.TEXTURE_WRAP_R, this.gl.CLAMP_TO_EDGE);
    const pixel = new Uint8Array([255, 255, 255, 255]);
    for (const face of WEBGL_CUBE_FACES) {
      this.gl.texImage2D(this.cubeFaceTarget(face), 0, this.gl.RGBA, 1, 1, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, pixel);
    }
    this.fallbackCubeTexture = handle;
    return handle;
  }

  private getTextureHandle(texture: Texture): WebGLTexture {
    this.releaseDisposedTextureHandles();
    if (texture.disposed) {
      throw new RenderDeviceError("Texture is disposed", "DISPOSED_RESOURCE", { label: texture.label });
    }
    const cached = this.textures.get(texture);
    if (cached) {
      return cached;
    }
    const handle = this.gl.createTexture();
    if (!handle) {
      throw new RenderDeviceError("Failed to allocate WebGL texture", "WEBGL_ALLOCATION_FAILED", { label: texture.label });
    }
    this.stateCache.invalidate();
    this.gl.pixelStorei(this.gl.UNPACK_FLIP_Y_WEBGL, false);
    this.gl.pixelStorei(this.gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    this.gl.pixelStorei(this.gl.UNPACK_COLORSPACE_CONVERSION_WEBGL, this.gl.NONE);
    if (texture.dimension === "cube") {
      this.uploadCubeTexture(texture, handle);
      this.textureUploadModes.set(texture, "cube");
      this.textures.set(texture, handle);
      return handle;
    }
    this.gl.bindTexture(this.gl.TEXTURE_2D, handle);
    if (isCompressedTextureFormat(texture.format)) {
      const compressed = this.resolveCompressedTextureFormat(texture.format);
      if (compressed) {
        const uploadLevels = completeUploadLevels(texture.textureLevels);
        for (const [levelIndex, level] of uploadLevels.entries()) {
          this.gl.compressedTexImage2D(this.gl.TEXTURE_2D, levelIndex, compressed.internalFormat, level.width, level.height, 0, level.data);
        }
        const compressedUploadError = this.readError();
        if (!compressedUploadError) {
          this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_BASE_LEVEL, 0);
          this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAX_LEVEL, uploadLevels.length - 1);
          this.textureUploadModes.set(texture, "compressed");
          this.textures.set(texture, handle);
          return handle;
        }
      }
      const fallbackLevels = completeUploadLevels(texture.fallbackTextureLevels);
      if (fallbackLevels.length === 0) {
        this.gl.deleteTexture(handle);
        throw new RenderDeviceError("Compressed texture format is not supported and no RGBA8 fallback data was provided", "COMPRESSED_TEXTURE_UNSUPPORTED", {
          label: texture.label,
          format: texture.format
        });
      }
      this.uploadRgba8FallbackTexture(texture, fallbackLevels);
      this.textureUploadModes.set(texture, "fallback");
      this.textures.set(texture, handle);
      return handle;
    }
    if (texture.format === "depth24") {
      throw new RenderDeviceError("Depth textures cannot be uploaded to WebGL2 color samplers", "UNSUPPORTED_TEXTURE_FORMAT", {
        label: texture.label,
        format: texture.format
      });
    }
    if (texture.source) {
      this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.rgba8TextureInternalFormat(texture), this.gl.RGBA, this.gl.UNSIGNED_BYTE, texture.source);
      this.gl.generateMipmap(this.gl.TEXTURE_2D);
    } else if (texture.mipLevels.length > 0) {
      const uploadFormat = this.textureUploadFormat(texture);
      const uploadLevels = completeUploadLevels(texture.textureLevels);
      for (const [levelIndex, level] of uploadLevels.entries()) {
        this.gl.texImage2D(
          this.gl.TEXTURE_2D,
          levelIndex,
          uploadFormat.internalFormat,
          level.width,
          level.height,
          0,
          uploadFormat.format,
          uploadFormat.type,
          texturePixelUploadData(level.data, texture.format)
        );
      }
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_BASE_LEVEL, 0);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAX_LEVEL, uploadLevels.length - 1);
    } else {
      const uploadFormat = this.textureUploadFormat(texture);
      this.gl.texImage2D(
        this.gl.TEXTURE_2D,
        0,
        uploadFormat.internalFormat,
        texture.width,
        texture.height,
        0,
        uploadFormat.format,
        uploadFormat.type,
        texture.data ? texturePixelUploadData(texture.data, texture.format) : null
      );
      this.gl.generateMipmap(this.gl.TEXTURE_2D);
    }
    this.textureUploadModes.set(texture, texture.format);
    this.textures.set(texture, handle);
    return handle;
  }

  private uploadCubeTexture(texture: Texture, handle: WebGLTexture): void {
    this.gl.bindTexture(this.gl.TEXTURE_CUBE_MAP, handle);
    const uploadFormat = this.textureUploadFormat(texture);
    for (const face of texture.cubeFaces) {
      const uploadLevels = completeUploadLevels(face.mipLevels);
      for (const [levelIndex, level] of uploadLevels.entries()) {
        this.gl.texImage2D(
          this.cubeFaceTarget(face.face),
          levelIndex,
          uploadFormat.internalFormat,
          level.width,
          level.height,
          0,
          uploadFormat.format,
          uploadFormat.type,
          texturePixelUploadData(level.data, texture.format)
        );
      }
    }
    const firstFaceLevels = completeUploadLevels(texture.cubeFaces[0]?.mipLevels ?? []);
    this.gl.texParameteri(this.gl.TEXTURE_CUBE_MAP, this.gl.TEXTURE_BASE_LEVEL, 0);
    this.gl.texParameteri(this.gl.TEXTURE_CUBE_MAP, this.gl.TEXTURE_MAX_LEVEL, Math.max(0, firstFaceLevels.length - 1));
    this.gl.texParameteri(this.gl.TEXTURE_CUBE_MAP, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_CUBE_MAP, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_CUBE_MAP, this.gl.TEXTURE_WRAP_R, this.gl.CLAMP_TO_EDGE);
  }

  private uploadRgba8FallbackTexture(texture: Texture, fallbackLevels: readonly { readonly width: number; readonly height: number; readonly data: TexturePixelData }[]): void {
    const internalFormat = this.rgba8TextureInternalFormat(texture);
    for (const [levelIndex, level] of fallbackLevels.entries()) {
      this.gl.texImage2D(
        this.gl.TEXTURE_2D,
        levelIndex,
        internalFormat,
        level.width,
        level.height,
        0,
        this.gl.RGBA,
        this.gl.UNSIGNED_BYTE,
        texturePixelUploadData(level.data, "rgba8")
      );
    }
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_BASE_LEVEL, 0);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAX_LEVEL, fallbackLevels.length - 1);
  }

  private cubeFaceTarget(face: TextureCubeFace): GLenum {
    switch (face) {
      case "px": return this.gl.TEXTURE_CUBE_MAP_POSITIVE_X;
      case "nx": return this.gl.TEXTURE_CUBE_MAP_NEGATIVE_X;
      case "py": return this.gl.TEXTURE_CUBE_MAP_POSITIVE_Y;
      case "ny": return this.gl.TEXTURE_CUBE_MAP_NEGATIVE_Y;
      case "pz": return this.gl.TEXTURE_CUBE_MAP_POSITIVE_Z;
      case "nz": return this.gl.TEXTURE_CUBE_MAP_NEGATIVE_Z;
    }
  }

  private rgba8TextureInternalFormat(texture: Texture): GLenum {
    return texture.colorSpace === "srgb" ? this.gl.SRGB8_ALPHA8 : this.gl.RGBA;
  }

  private textureUploadFormat(texture: Texture): { readonly internalFormat: GLenum; readonly format: GLenum; readonly type: GLenum } {
    if (texture.format === "rgba8") {
      return { internalFormat: this.rgba8TextureInternalFormat(texture), format: this.gl.RGBA, type: this.gl.UNSIGNED_BYTE };
    }
    if (texture.colorSpace === "srgb") {
      throw new RenderDeviceError("Floating-point texture uploads must use linear colorSpace", "UNSUPPORTED_TEXTURE_FORMAT", {
        label: texture.label,
        format: texture.format,
        colorSpace: texture.colorSpace
      });
    }
    if (texture.format === "rgba16f") {
      return { internalFormat: this.gl.RGBA16F, format: this.gl.RGBA, type: this.gl.HALF_FLOAT };
    }
    if (texture.format === "rgba32f") {
      return { internalFormat: this.gl.RGBA32F, format: this.gl.RGBA, type: this.gl.FLOAT };
    }
    throw new RenderDeviceError("Unsupported texture upload format", "UNSUPPORTED_TEXTURE_FORMAT", {
      label: texture.label,
      format: texture.format
    });
  }

  private resolveRenderTargetFormat(format: "rgba8" | "rgba16f" | "rgba32f"): { readonly internalFormat: GLenum; readonly type: GLenum } {
    if (format === "rgba8") {
      return { internalFormat: this.gl.RGBA, type: this.gl.UNSIGNED_BYTE };
    }
    if (!this.gl.getExtension("EXT_color_buffer_float")) {
      throw new RenderDeviceError("Floating-point color render targets require EXT_color_buffer_float", "HDR_RENDER_TARGET_UNSUPPORTED", { format });
    }
    if (format === "rgba16f") {
      return { internalFormat: this.gl.RGBA16F, type: this.gl.HALF_FLOAT };
    }
    return { internalFormat: this.gl.RGBA32F, type: this.gl.FLOAT };
  }

  private releaseDisposedTextureHandles(): void {
    for (const [texture, handle] of [...this.textures]) {
      if (texture.disposed) {
        this.gl.deleteTexture(handle);
        this.textures.delete(texture);
        this.textureUploadModes.delete(texture);
        this.releasedTextureHandles += 1;
      }
    }
  }

  private resolveCompressedTextureFormat(format: TextureCompressedFormat): { readonly internalFormat: GLenum } | null {
    switch (format) {
      case "bc1-rgba-unorm": {
        const extension = this.gl.getExtension("WEBGL_compressed_texture_s3tc");
        return extension ? { internalFormat: extension.COMPRESSED_RGBA_S3TC_DXT1_EXT } : null;
      }
      case "bc3-rgba-unorm": {
        const extension = this.gl.getExtension("WEBGL_compressed_texture_s3tc");
        return extension ? { internalFormat: extension.COMPRESSED_RGBA_S3TC_DXT5_EXT } : null;
      }
      case "etc2-rgba8unorm":
        return { internalFormat: 0x9278 };
      case "astc-4x4-rgba-unorm": {
        const extension = this.gl.getExtension("WEBGL_compressed_texture_astc");
        return extension ? { internalFormat: extension.COMPRESSED_RGBA_ASTC_4x4_KHR } : null;
      }
    }
  }

  private magFilter(filter: TextureMagFilter): GLenum {
    return filter === "nearest" ? this.gl.NEAREST : this.gl.LINEAR;
  }

  private minFilter(filter: TextureMinFilter): GLenum {
    switch (filter) {
      case "nearest":
        return this.gl.NEAREST;
      case "linear":
        return this.gl.LINEAR;
      case "nearest-mipmap-nearest":
        return this.gl.NEAREST_MIPMAP_NEAREST;
      case "linear-mipmap-nearest":
        return this.gl.LINEAR_MIPMAP_NEAREST;
      case "nearest-mipmap-linear":
        return this.gl.NEAREST_MIPMAP_LINEAR;
      case "linear-mipmap-linear":
        return this.gl.LINEAR_MIPMAP_LINEAR;
    }
  }

  private addressMode(mode: "clamp-to-edge" | "repeat" | "mirror-repeat"): GLenum {
    if (mode === "repeat") return this.gl.REPEAT;
    if (mode === "mirror-repeat") return this.gl.MIRRORED_REPEAT;
    return this.gl.CLAMP_TO_EDGE;
  }

  private bindVertexFormat(shader: RenderShaderProgram, format: VertexFormat): Set<number> {
    const boundLocations = new Set<number>();
    for (const attribute of format.attributes) {
      const location = this.resolveAttributeLocation(shader, attribute);
      if (location < 0) {
        continue;
      }
      if (attribute.type !== "float32") {
        throw new RenderDeviceError("Unsupported vertex attribute type", "UNSUPPORTED_VERTEX_ATTRIBUTE", {
          attribute: attribute.shaderName,
          type: attribute.type
        });
      }
      boundLocations.add(location);
      this.gl.enableVertexAttribArray(location);
      this.gl.vertexAttribDivisor(location, 0);
      this.gl.vertexAttribPointer(
        location,
        attribute.components,
        this.gl.FLOAT,
        attribute.normalized,
        format.stride,
        attribute.offset
      );
    }
    return boundLocations;
  }

  private bindVertexArrayForCommand(command: DrawCommand, shader: WebGL2ShaderProgram, vertexBuffer: WebGL2Buffer): WebGL2VertexArrayCacheEntry {
    const indexBuffer = command.indexBuffer ? this.requireBuffer(command.indexBuffer) : undefined;
    const key = this.vertexArrayCacheKey(command, shader, vertexBuffer, indexBuffer);
    const cached = this.vertexArrayCache.get(key);
    if (cached) {
      this.stateCache.bindVertexArray(cached.handle, () => this.gl.bindVertexArray(cached.handle));
      return cached;
    }

    const handle = this.gl.createVertexArray();
    if (!handle) {
      throw new RenderDeviceError("Failed to allocate WebGL vertex array", "WEBGL_ALLOCATION_FAILED");
    }
    this.vertexArrayCreateCount += 1;
    this.stateCache.bindVertexArray(handle, () => this.gl.bindVertexArray(handle));
    this.stateCache.bindBuffer(this.gl.ARRAY_BUFFER, vertexBuffer.handle, () => this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vertexBuffer.handle));
    const boundLocations = this.bindVertexFormat(shader, command.vertexFormat!);
    if (command.instanceAttributes && command.instanceAttributes.length > 0) {
      this.bindInstanceAttributes(shader, command.instanceAttributes, boundLocations);
    }
    if (indexBuffer) {
      this.stateCache.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer.handle, () => this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer.handle));
    }
    this.disableUnboundVertexAttributes(boundLocations);
    this.applyDefaultAttributes(shader, boundLocations);
    const entry: WebGL2VertexArrayCacheEntry = { key, handle, boundLocations };
    this.vertexArrayCache.set(key, entry);
    return entry;
  }

  private bindNoVertexArray(): void {
    this.stateCache.bindVertexArray(null, () => this.gl.bindVertexArray(null));
  }

  private vertexArrayCacheKey(command: DrawCommand, shader: WebGL2ShaderProgram, vertexBuffer: WebGL2Buffer, indexBuffer: WebGL2Buffer | undefined): string {
    const instanceKey = (command.instanceAttributes ?? []).map((attribute) => {
      const buffer = this.requireBuffer(attribute.buffer);
      return `${attribute.shaderName}:${buffer.id}:${attribute.components}:${attribute.offset}:${attribute.stride}:${attribute.normalized === true ? 1 : 0}:${attribute.divisor ?? 1}`;
    }).join(",");
    return [
      shader.id,
      vertexBuffer.id,
      this.vertexFormatId(command.vertexFormat!),
      indexBuffer?.id ?? 0,
      instanceKey
    ].join("|");
  }

  private vertexFormatId(format: VertexFormat): number {
    const existing = this.vertexFormatIds.get(format);
    if (existing !== undefined) return existing;
    const next = this.nextVertexFormatId;
    this.nextVertexFormatId += 1;
    this.vertexFormatIds.set(format, next);
    return next;
  }

  private bindInstanceAttributes(shader: RenderShaderProgram, attributes: readonly InstanceVertexAttribute[], boundLocations: Set<number>): void {
    for (const attribute of attributes) {
      const location = shader.reflection.attributes.get(attribute.shaderName);
      if (location === undefined || location < 0) {
        continue;
      }
      if (![1, 2, 3, 4].includes(attribute.components)) {
        throw new RenderDeviceError("Instance vertex attribute components must be 1, 2, 3, or 4", "INVALID_DRAW_COMMAND", {
          attribute: attribute.shaderName,
          components: attribute.components
        });
      }
      if (!Number.isInteger(attribute.offset) || attribute.offset < 0 || attribute.offset % 4 !== 0) {
        throw new RenderDeviceError("Instance vertex attribute offset must be non-negative and 4-byte aligned", "INVALID_DRAW_COMMAND", {
          attribute: attribute.shaderName,
          offset: attribute.offset
        });
      }
      if (!Number.isInteger(attribute.stride) || attribute.stride <= 0 || attribute.stride % 4 !== 0) {
        throw new RenderDeviceError("Instance vertex attribute stride must be positive and 4-byte aligned", "INVALID_DRAW_COMMAND", {
          attribute: attribute.shaderName,
          stride: attribute.stride
        });
      }
      if (attribute.offset + attribute.components * 4 > attribute.stride) {
        throw new RenderDeviceError("Instance vertex attribute range must fit inside its stride", "INVALID_DRAW_COMMAND", {
          attribute: attribute.shaderName,
          offset: attribute.offset,
          components: attribute.components,
          stride: attribute.stride
        });
      }
      const buffer = this.requireBuffer(attribute.buffer);
      boundLocations.add(location);
      this.stateCache.bindBuffer(this.gl.ARRAY_BUFFER, buffer.handle, () => this.gl.bindBuffer(this.gl.ARRAY_BUFFER, buffer.handle));
      this.gl.enableVertexAttribArray(location);
      this.gl.vertexAttribPointer(
        location,
        attribute.components,
        this.gl.FLOAT,
        attribute.normalized ?? false,
        attribute.stride,
        attribute.offset
      );
      this.gl.vertexAttribDivisor(location, attribute.divisor ?? 1);
    }
  }

  private resolveAttributeLocation(shader: RenderShaderProgram, attribute: VertexAttribute): number {
    const reflected = shader.reflection.attributes.get(attribute.shaderName);
    if (reflected !== undefined) {
      return reflected;
    }
    return shader.reflection.attributes.get(attribute.semantic) ?? -1;
  }

  private applyDefaultAttributes(shader: RenderShaderProgram, boundLocations: ReadonlySet<number>): void {
    const colorLocation = shader.reflection.attributes.get("a_color") ?? shader.reflection.attributes.get("color");
    if (colorLocation !== undefined && colorLocation >= 0 && !boundLocations.has(colorLocation)) {
      this.gl.disableVertexAttribArray(colorLocation);
      this.gl.vertexAttribDivisor(colorLocation, 0);
      this.gl.vertexAttrib4f(colorLocation, 1, 1, 1, 1);
    }
    const tangentLocation = shader.reflection.attributes.get("a_tangent") ?? shader.reflection.attributes.get("tangent");
    if (tangentLocation !== undefined && tangentLocation >= 0 && !boundLocations.has(tangentLocation)) {
      this.gl.disableVertexAttribArray(tangentLocation);
      this.gl.vertexAttribDivisor(tangentLocation, 0);
      this.gl.vertexAttrib4f(tangentLocation, 1, 0, 0, 1);
    }
    const uv1Location = shader.reflection.attributes.get("a_uv1") ?? shader.reflection.attributes.get("uv1");
    if (uv1Location !== undefined && uv1Location >= 0 && !boundLocations.has(uv1Location)) {
      this.gl.disableVertexAttribArray(uv1Location);
      this.gl.vertexAttribDivisor(uv1Location, 0);
      this.gl.vertexAttrib2f(uv1Location, 0, 0);
    }
    const instanceColorLocation = shader.reflection.attributes.get("a_instanceColor") ?? shader.reflection.attributes.get("instanceColor");
    if (instanceColorLocation !== undefined && instanceColorLocation >= 0 && !boundLocations.has(instanceColorLocation)) {
      this.gl.disableVertexAttribArray(instanceColorLocation);
      this.gl.vertexAttribDivisor(instanceColorLocation, 0);
      this.gl.vertexAttrib4f(instanceColorLocation, 1, 1, 1, 1);
    }
  }

  private disableUnboundVertexAttributes(boundLocations: ReadonlySet<number>): void {
    for (let location = 0; location < this.maxVertexAttributes; location += 1) {
      if (!boundLocations.has(location)) {
        this.gl.disableVertexAttribArray(location);
        this.gl.vertexAttribDivisor(location, 0);
      }
    }
  }

  private primitive(topology: DrawCommand["topology"]): GLenum {
    if (topology === "lines") return this.gl.LINES;
    if (topology === "points") return this.gl.POINTS;
    return this.gl.TRIANGLES;
  }

  private applyRenderState(state: DrawCommand["renderState"]): void {
    const renderState = state ?? {
      depthTest: true,
      depthWrite: true,
      cullMode: "back" as const,
      blend: false,
      depthCompare: "less-equal" as const,
      colorWrite: [true, true, true, true] as const,
      scissor: null,
      polygonOffset: null,
      stencil: null
    };
    this.stateCache.setEnabled(this.gl.DEPTH_TEST, renderState.depthTest, () => {
      if (renderState.depthTest) this.gl.enable(this.gl.DEPTH_TEST);
      else this.gl.disable(this.gl.DEPTH_TEST);
    });
    this.stateCache.depthMask(renderState.depthWrite, () => this.gl.depthMask(renderState.depthWrite));
    this.stateCache.depthFunc(renderState.depthCompare === "always" ? this.gl.ALWAYS : this.gl.LEQUAL, () => this.gl.depthFunc(renderState.depthCompare === "always" ? this.gl.ALWAYS : this.gl.LEQUAL));
    const colorWrite = renderState.colorWrite ?? [true, true, true, true] as const;
    this.stateCache.colorMask(colorWrite[0], colorWrite[1], colorWrite[2], colorWrite[3], () => this.gl.colorMask(colorWrite[0], colorWrite[1], colorWrite[2], colorWrite[3]));
    if (renderState.scissor) {
      this.stateCache.setEnabled(this.gl.SCISSOR_TEST, true, () => this.gl.enable(this.gl.SCISSOR_TEST));
      this.stateCache.scissor(renderState.scissor.x, renderState.scissor.y, renderState.scissor.width, renderState.scissor.height, () => {
        this.gl.scissor(renderState.scissor!.x, renderState.scissor!.y, renderState.scissor!.width, renderState.scissor!.height);
      });
    } else {
      this.stateCache.setEnabled(this.gl.SCISSOR_TEST, false, () => this.gl.disable(this.gl.SCISSOR_TEST));
    }
    if (renderState.polygonOffset) {
      this.stateCache.setEnabled(this.gl.POLYGON_OFFSET_FILL, true, () => this.gl.enable(this.gl.POLYGON_OFFSET_FILL));
      this.stateCache.polygonOffset(renderState.polygonOffset.factor, renderState.polygonOffset.units, () => this.gl.polygonOffset(renderState.polygonOffset!.factor, renderState.polygonOffset!.units));
    } else {
      this.stateCache.setEnabled(this.gl.POLYGON_OFFSET_FILL, false, () => this.gl.disable(this.gl.POLYGON_OFFSET_FILL));
    }
    if (renderState.stencil) {
      const stencil = renderState.stencil;
      const compare = this.stencilCompare(stencil.compare ?? "always");
      const reference = stencil.reference ?? 0;
      const readMask = stencil.readMask ?? 0xff;
      const writeMask = stencil.writeMask ?? 0xff;
      const fail = this.stencilOperation(stencil.fail ?? "keep");
      const depthFail = this.stencilOperation(stencil.depthFail ?? "keep");
      const depthPass = this.stencilOperation(stencil.depthPass ?? "keep");
      this.stateCache.setEnabled(this.gl.STENCIL_TEST, true, () => this.gl.enable(this.gl.STENCIL_TEST));
      this.stateCache.stencilFunc(compare, reference, readMask, () => this.gl.stencilFunc(compare, reference, readMask));
      this.stateCache.stencilMask(writeMask, () => this.gl.stencilMask(writeMask));
      this.stateCache.stencilOp(fail, depthFail, depthPass, () => this.gl.stencilOp(fail, depthFail, depthPass));
    } else {
      this.stateCache.setEnabled(this.gl.STENCIL_TEST, false, () => this.gl.disable(this.gl.STENCIL_TEST));
    }
    if (renderState.cullMode === "none") {
      this.stateCache.setEnabled(this.gl.CULL_FACE, false, () => this.gl.disable(this.gl.CULL_FACE));
    } else {
      this.stateCache.setEnabled(this.gl.CULL_FACE, true, () => this.gl.enable(this.gl.CULL_FACE));
      this.stateCache.cullFace(renderState.cullMode === "front" ? this.gl.FRONT : this.gl.BACK, () => this.gl.cullFace(renderState.cullMode === "front" ? this.gl.FRONT : this.gl.BACK));
    }
    if (renderState.blend) {
      this.stateCache.setEnabled(this.gl.BLEND, true, () => this.gl.enable(this.gl.BLEND));
      this.stateCache.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA, () => this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA));
    } else {
      this.stateCache.setEnabled(this.gl.BLEND, false, () => this.gl.disable(this.gl.BLEND));
    }
  }

  private requireBuffer(buffer: RenderBuffer): WebGL2Buffer {
    if (!(buffer instanceof WebGL2Buffer) || !this.buffers.has(buffer) || buffer.disposed) {
      throw new RenderDeviceError("Buffer is not a live WebGL2 resource owned by this device", "INVALID_RESOURCE", {
        bufferId: buffer.id
      });
    }
    return buffer;
  }

  private stencilCompare(compare: NonNullable<DrawCommand["renderState"]>["stencil"] extends infer Stencil ? Stencil extends { readonly compare?: infer Compare } ? NonNullable<Compare> : never : never): GLenum {
    switch (compare) {
      case "never": return this.gl.NEVER;
      case "less": return this.gl.LESS;
      case "less-equal": return this.gl.LEQUAL;
      case "greater": return this.gl.GREATER;
      case "greater-equal": return this.gl.GEQUAL;
      case "equal": return this.gl.EQUAL;
      case "not-equal": return this.gl.NOTEQUAL;
      case "always": return this.gl.ALWAYS;
    }
  }

  private stencilOperation(operation: NonNullable<DrawCommand["renderState"]>["stencil"] extends infer Stencil ? Stencil extends { readonly fail?: infer Operation } ? NonNullable<Operation> : never : never): GLenum {
    switch (operation) {
      case "keep": return this.gl.KEEP;
      case "zero": return this.gl.ZERO;
      case "replace": return this.gl.REPLACE;
      case "increment": return this.gl.INCR;
      case "decrement": return this.gl.DECR;
      case "invert": return this.gl.INVERT;
      case "increment-wrap": return this.gl.INCR_WRAP;
      case "decrement-wrap": return this.gl.DECR_WRAP;
    }
  }

  private requireShader(shader: RenderShaderProgram): WebGL2ShaderProgram {
    if (!(shader instanceof WebGL2ShaderProgram) || !this.shaders.has(shader) || shader.disposed) {
      throw new RenderDeviceError("Shader is not a live WebGL2 resource owned by this device", "INVALID_RESOURCE", {
        shaderId: shader.id
      });
    }
    return shader;
  }

  private assertAlive(): void {
    if (this.disposed) {
      throw new RenderDeviceError("Render device is disposed", "DISPOSED_DEVICE");
    }
    if (this.contextLost) {
      throw new RenderDeviceError("Render context is lost", "CONTEXT_LOST");
    }
  }

  private assertFrame(): void {
    this.assertAlive();
    if (!this.frameActive) {
      throw new RenderDeviceError("No active frame", "NO_ACTIVE_FRAME");
    }
  }

  private readError(): string | null {
    const error = this.gl.getError();
    return error === this.gl.NO_ERROR ? null : `0x${error.toString(16)}`;
  }
}

function numberOption(options: Readonly<Record<string, unknown>>, key: string, fallback: number): number {
  const value = options[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function stringOption(options: Readonly<Record<string, unknown>>, key: string, fallback: string): string {
  const value = options[key];
  return typeof value === "string" ? value : fallback;
}

function colorSpaceId(value: string): number {
  return value === "srgb" ? 1 : 0;
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

function completeUploadLevels<T extends { readonly width: number; readonly height: number }>(levels: readonly T[]): readonly T[] {
  const uploadLevels: T[] = [];
  for (const level of levels) {
    if (uploadLevels.length === 0) {
      uploadLevels.push(level);
      continue;
    }
    const previous = uploadLevels[uploadLevels.length - 1]!;
    const expectedWidth = Math.max(1, Math.floor(previous.width / 2));
    const expectedHeight = Math.max(1, Math.floor(previous.height / 2));
    if (level.width !== expectedWidth || level.height !== expectedHeight) {
      break;
    }
    uploadLevels.push(level);
  }
  return uploadLevels;
}

function texturePixelUploadData(data: TexturePixelData, format: Texture["format"]): ArrayBufferView {
  if (format === "rgba16f" && data instanceof Uint16Array) return data;
  if (format === "rgba32f" && data instanceof Float32Array) return data;
  if (format === "rgba8" && (data instanceof Uint8Array || data instanceof Uint8ClampedArray)) return data;
  throw new RenderDeviceError("Texture pixel data type does not match texture format", "UNSUPPORTED_TEXTURE_FORMAT", { format });
}
