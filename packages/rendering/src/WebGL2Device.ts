import {
  type BufferUsage,
  type DrawCommand,
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
import { Texture, isCompressedTextureFormat, type TextureCompressedFormat } from "./Texture";
import { TextureBinding } from "./TextureBinding";
import { type VertexAttribute, type VertexFormat } from "./VertexFormat";

export interface WebGL2DeviceOptions {
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  readonly antialias?: boolean;
  readonly alpha?: boolean;
  readonly preserveDrawingBuffer?: boolean;
}

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
    public readonly framebuffer: WebGLFramebuffer,
    public readonly colorHandle: WebGLTexture,
    private readonly gl: WebGL2RenderingContext
  ) {}

  dispose(): void {
    if (!this.disposed) {
      this.gl.deleteFramebuffer(this.framebuffer);
      this.gl.deleteTexture(this.colorHandle);
      this.colorTexture.dispose();
      this.disposed = true;
    }
  }
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
  private textureUploadModes = new Map<Texture, "compressed" | "fallback" | "rgba8">();
  private fallbackTexture: WebGLTexture | null = null;
  private releasedTextureHandles = 0;
  private lastError: string | null = null;
  private frameActive = false;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private readonly maxVertexAttributes: number;
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
    return new WebGL2Device(gl as WebGL2RenderingContext, options.canvas);
  }

  private constructor(gl: WebGL2RenderingContext, canvas: HTMLCanvasElement | OffscreenCanvas) {
    this.gl = gl;
    this.maxVertexAttributes = gl.getParameter(gl.MAX_VERTEX_ATTRIBS) as number;
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
        "draw-validation",
        "rasterization"
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
    this.gl.bindBuffer(target, handle);
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
    this.gl.bindBuffer(webglBuffer.target, webglBuffer.handle);
    this.gl.bufferSubData(webglBuffer.target, byteOffset, data);
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
    this.gl.bindBuffer(webglBuffer.target, webglBuffer.handle);
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
    if (!colorHandle || !framebuffer) {
      if (colorHandle) this.gl.deleteTexture(colorHandle);
      if (framebuffer) this.gl.deleteFramebuffer(framebuffer);
      throw new RenderDeviceError("Failed to allocate WebGL render target", "WEBGL_ALLOCATION_FAILED", {
        width: descriptor.width,
        height: descriptor.height,
        label: descriptor.label
      });
    }
    this.gl.bindTexture(this.gl.TEXTURE_2D, colorHandle);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.LINEAR);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texImage2D(
      this.gl.TEXTURE_2D,
      0,
      this.gl.RGBA,
      descriptor.width,
      descriptor.height,
      0,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      null
    );

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, framebuffer);
    this.gl.framebufferTexture2D(this.gl.FRAMEBUFFER, this.gl.COLOR_ATTACHMENT0, this.gl.TEXTURE_2D, colorHandle, 0);
    const status = this.gl.checkFramebufferStatus(this.gl.FRAMEBUFFER);
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    if (status !== this.gl.FRAMEBUFFER_COMPLETE) {
      this.gl.deleteTexture(colorHandle);
      this.gl.deleteFramebuffer(framebuffer);
      throw new RenderDeviceError("WebGL render target framebuffer status is invalid", "FRAMEBUFFER_INVALID", { status });
    }

    const target = new WebGL2RenderTarget(
      this.nextId++,
      descriptor.width,
      descriptor.height,
      descriptor.label ?? "render-target",
      new Texture({ width: descriptor.width, height: descriptor.height, label: descriptor.label ?? "render-target-color" }),
      framebuffer,
      colorHandle,
      this.gl
    );
    this.renderTargets.add(target);
    return target;
  }

  setRenderTarget(target: RenderTarget | null): void {
    this.assertAlive();
    if (target === null) {
      this.activeRenderTarget = null;
      this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
      return;
    }
    if (!(target instanceof WebGL2RenderTarget) || !this.renderTargets.has(target) || target.disposed) {
      throw new RenderDeviceError("Render target is not a live WebGL2 resource owned by this device", "INVALID_RESOURCE", {
        targetId: target.id
      });
    }
    this.activeRenderTarget = target;
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, target.framebuffer);
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
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, this.activeRenderTarget?.framebuffer ?? null);
    this.gl.viewport(0, 0, width, height);
    this.gl.enable(this.gl.DEPTH_TEST);
    this.gl.depthFunc(this.gl.LEQUAL);
  }

  clear(color: readonly [number, number, number, number]): void {
    this.assertFrame();
    this.gl.clearColor(color[0], color[1], color[2], color[3]);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT | this.gl.DEPTH_BUFFER_BIT);
  }

  draw(command: DrawCommand): void {
    this.assertFrame();
    const vertexBuffer = this.requireBuffer(command.vertexBuffer);
    this.applyRenderState(command.renderState);
    if (command.shader) {
      const shader = this.requireShader(command.shader);
      this.gl.useProgram(shader.handle);
      if (command.uniforms) {
        this.uploadUniforms(shader, command.uniforms);
      }
    }

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, vertexBuffer.handle);
    if (command.shader && command.vertexFormat) {
      this.bindVertexFormat(command.shader, command.vertexFormat);
    }
    if (command.indexBuffer) {
      const indexBuffer = this.requireBuffer(command.indexBuffer);
      this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, indexBuffer.handle);
      const type = command.indexType === "uint32" ? this.gl.UNSIGNED_INT : this.gl.UNSIGNED_SHORT;
      if ((command.instanceCount ?? 1) > 1) {
        this.gl.drawElementsInstanced(this.primitive(command.topology), command.indexCount ?? 0, type, 0, command.instanceCount ?? 1);
      } else {
        this.gl.drawElements(this.primitive(command.topology), command.indexCount ?? 0, type, 0);
      }
    } else {
      if ((command.instanceCount ?? 1) > 1) {
        this.gl.drawArraysInstanced(this.primitive(command.topology), 0, command.vertexCount, command.instanceCount ?? 1);
      } else {
        this.gl.drawArrays(this.primitive(command.topology), 0, command.vertexCount);
      }
    }
    this.drawCalls += 1;
  }

  endFrame(): void {
    this.assertFrame();
    this.frameActive = false;
    this.lastError = this.readError();
  }

  captureState(): ReadonlyMap<string, string | number | boolean | null> {
    return new Map<string, string | number | boolean | null>([
      ["backend", this.kind],
      ["disposed", this.disposed],
      ["contextLost", this.contextLost],
      ["depthTest", this.gl.isEnabled(this.gl.DEPTH_TEST)],
      ["blend", this.gl.isEnabled(this.gl.BLEND)],
      ["cullFace", this.gl.isEnabled(this.gl.CULL_FACE)],
      ["program", this.gl.getParameter(this.gl.CURRENT_PROGRAM) ? "bound" : null],
      ["arrayBuffer", this.gl.getParameter(this.gl.ARRAY_BUFFER_BINDING) ? "bound" : null],
      ["elementArrayBuffer", this.gl.getParameter(this.gl.ELEMENT_ARRAY_BUFFER_BINDING) ? "bound" : null],
      ["viewportWidth", this.viewportWidth],
      ["viewportHeight", this.viewportHeight],
      ["drawCalls", this.drawCalls]
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
    return {
      drawCalls: this.drawCalls,
      buffers: [...this.buffers].filter((buffer) => !buffer.disposed).length,
      shaders: [...this.shaders].filter((shader) => !shader.disposed).length,
      renderTargets: liveRenderTargets.length,
      textures: liveTextures.size,
      textureBytes: liveTextureList.reduce((total, texture) => total + texture.byteLength, 0),
      compressedTextures: compressedTextures.length,
      compressedTextureBytes: compressedTextures.reduce((total, texture) => total + texture.byteLength, 0),
      textureFallbacks: fallbackTextures.length,
      textureFallbackBytes: fallbackTextures.reduce((total, texture) => total + texture.fallbackByteLength, 0),
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
    for (const texture of this.textures.values()) {
      this.gl.deleteTexture(texture);
    }
    this.textureUploadModes.clear();
    if (this.fallbackTexture) {
      this.gl.deleteTexture(this.fallbackTexture);
      this.fallbackTexture = null;
    }
    this.textures.clear();
    this.disposed = true;
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
      const location = this.gl.getUniformLocation(shader.handle, name) ?? this.gl.getUniformLocation(shader.handle, `${name}[0]`);
      if (location === null) {
        throw new RenderDeviceError("Material tried to bind a missing shader uniform", "MISSING_UNIFORM", { name });
      }
      if (value instanceof TextureBinding) {
        this.uploadTextureUniform(location, value, textureUnit);
        textureUnit += 1;
      } else if (typeof value === "number") {
        this.gl.uniform1f(location, value);
      } else if (Array.isArray(value) || ArrayBuffer.isView(value)) {
        const data = Array.from(value as ArrayLike<number>);
        const floatData = value as Float32List;
        if (data.length === 16 || (data.length > 16 && data.length % 16 === 0 && /(?:Matrix|Matrices)$/.test(name))) {
          this.gl.uniformMatrix4fv(location, false, floatData);
        } else if (data.length > 16 && data.length % 4 === 0) {
          this.gl.uniform4fv(location, floatData);
        } else if (data.length === 4) {
          this.gl.uniform4fv(location, floatData);
        } else if (data.length === 3) {
          this.gl.uniform3fv(location, floatData);
        } else if (data.length === 2) {
          this.gl.uniform2fv(location, floatData);
        } else {
          throw new RenderDeviceError("Unsupported uniform array length", "UNSUPPORTED_UNIFORM", { name, length: data.length });
        }
      } else {
        throw new RenderDeviceError("Unsupported uniform value", "UNSUPPORTED_UNIFORM", { name, valueType: typeof value });
      }
    }
  }

  private uploadTextureUniform(location: WebGLUniformLocation, binding: TextureBinding, textureUnit: number): void {
    const validation = binding.validate();
    if (!validation.ok) {
      throw new RenderDeviceError("Texture binding validation failed", "INVALID_TEXTURE_BINDING", {
        diagnostics: validation.diagnostics,
        name: binding.name
      });
    }
    this.gl.activeTexture(this.gl.TEXTURE0 + textureUnit);
    const handle = binding.texture ? this.getTextureHandle(binding.texture) : this.getFallbackTextureHandle();
    this.gl.bindTexture(this.gl.TEXTURE_2D, handle);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.filter(binding.sampler.minFilter));
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.filter(binding.sampler.magFilter));
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.addressMode(binding.sampler.addressU));
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.addressMode(binding.sampler.addressV));
    this.gl.uniform1i(location, textureUnit);
  }

  private getFallbackTextureHandle(): WebGLTexture {
    if (this.fallbackTexture) {
      return this.fallbackTexture;
    }
    const handle = this.gl.createTexture();
    if (!handle) {
      throw new RenderDeviceError("Failed to allocate WebGL fallback texture", "WEBGL_ALLOCATION_FAILED");
    }
    this.gl.bindTexture(this.gl.TEXTURE_2D, handle);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MIN_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAG_FILTER, this.gl.NEAREST);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_S, this.gl.CLAMP_TO_EDGE);
    this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_WRAP_T, this.gl.CLAMP_TO_EDGE);
    this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, 1, 1, 0, this.gl.RGBA, this.gl.UNSIGNED_BYTE, new Uint8Array([255, 255, 255, 255]));
    this.fallbackTexture = handle;
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
    this.gl.bindTexture(this.gl.TEXTURE_2D, handle);
    if (isCompressedTextureFormat(texture.format)) {
      const compressed = this.resolveCompressedTextureFormat(texture.format);
      if (compressed) {
        const uploadLevels = completeUploadLevels(texture.textureLevels);
        for (const [levelIndex, level] of uploadLevels.entries()) {
          this.gl.compressedTexImage2D(this.gl.TEXTURE_2D, levelIndex, compressed.internalFormat, level.width, level.height, 0, level.data);
        }
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_BASE_LEVEL, 0);
        this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAX_LEVEL, uploadLevels.length - 1);
        this.textureUploadModes.set(texture, "compressed");
        this.textures.set(texture, handle);
        return handle;
      }
      const fallbackLevels = completeUploadLevels(texture.fallbackTextureLevels);
      if (fallbackLevels.length === 0) {
        this.gl.deleteTexture(handle);
        throw new RenderDeviceError("Compressed texture format is not supported and no RGBA8 fallback data was provided", "COMPRESSED_TEXTURE_UNSUPPORTED", {
          label: texture.label,
          format: texture.format
        });
      }
      for (const [levelIndex, level] of fallbackLevels.entries()) {
        this.gl.texImage2D(
          this.gl.TEXTURE_2D,
          levelIndex,
          this.gl.RGBA,
          level.width,
          level.height,
          0,
          this.gl.RGBA,
          this.gl.UNSIGNED_BYTE,
          level.data
        );
      }
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_BASE_LEVEL, 0);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAX_LEVEL, fallbackLevels.length - 1);
      this.textureUploadModes.set(texture, "fallback");
      this.textures.set(texture, handle);
      return handle;
    }
    if (texture.format !== "rgba8") {
      throw new RenderDeviceError("Only rgba8 textures can be uploaded to WebGL2 color samplers", "UNSUPPORTED_TEXTURE_FORMAT", {
        label: texture.label,
        format: texture.format
      });
    }
    if (texture.source) {
      this.gl.texImage2D(this.gl.TEXTURE_2D, 0, this.gl.RGBA, this.gl.RGBA, this.gl.UNSIGNED_BYTE, texture.source);
    } else if (texture.mipLevels.length > 0) {
      const uploadLevels = completeUploadLevels(texture.textureLevels);
      for (const [levelIndex, level] of uploadLevels.entries()) {
        this.gl.texImage2D(
          this.gl.TEXTURE_2D,
          levelIndex,
          this.gl.RGBA,
          level.width,
          level.height,
          0,
          this.gl.RGBA,
          this.gl.UNSIGNED_BYTE,
          level.data
        );
      }
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_BASE_LEVEL, 0);
      this.gl.texParameteri(this.gl.TEXTURE_2D, this.gl.TEXTURE_MAX_LEVEL, uploadLevels.length - 1);
    } else {
      this.gl.texImage2D(
        this.gl.TEXTURE_2D,
        0,
        this.gl.RGBA,
        texture.width,
        texture.height,
        0,
        this.gl.RGBA,
        this.gl.UNSIGNED_BYTE,
        texture.data
      );
    }
    this.textureUploadModes.set(texture, "rgba8");
    this.textures.set(texture, handle);
    return handle;
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

  private filter(filter: "nearest" | "linear"): GLenum {
    return filter === "nearest" ? this.gl.NEAREST : this.gl.LINEAR;
  }

  private addressMode(mode: "clamp-to-edge" | "repeat" | "mirror-repeat"): GLenum {
    if (mode === "repeat") return this.gl.REPEAT;
    if (mode === "mirror-repeat") return this.gl.MIRRORED_REPEAT;
    return this.gl.CLAMP_TO_EDGE;
  }

  private bindVertexFormat(shader: RenderShaderProgram, format: VertexFormat): void {
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
      this.gl.vertexAttribPointer(
        location,
        attribute.components,
        this.gl.FLOAT,
        attribute.normalized,
        format.stride,
        attribute.offset
      );
    }
    this.disableUnboundVertexAttributes(boundLocations);
    this.applyDefaultAttributes(shader, boundLocations);
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
      this.gl.vertexAttrib4f(colorLocation, 1, 1, 1, 1);
    }
  }

  private disableUnboundVertexAttributes(boundLocations: ReadonlySet<number>): void {
    for (let location = 0; location < this.maxVertexAttributes; location += 1) {
      if (!boundLocations.has(location)) {
        this.gl.disableVertexAttribArray(location);
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
      depthCompare: "less-equal" as const
    };
    if (renderState.depthTest) {
      this.gl.enable(this.gl.DEPTH_TEST);
    } else {
      this.gl.disable(this.gl.DEPTH_TEST);
    }
    this.gl.depthMask(renderState.depthWrite);
    this.gl.depthFunc(renderState.depthCompare === "always" ? this.gl.ALWAYS : this.gl.LEQUAL);
    if (renderState.cullMode === "none") {
      this.gl.disable(this.gl.CULL_FACE);
    } else {
      this.gl.enable(this.gl.CULL_FACE);
      this.gl.cullFace(renderState.cullMode === "front" ? this.gl.FRONT : this.gl.BACK);
    }
    if (renderState.blend) {
      this.gl.enable(this.gl.BLEND);
      this.gl.blendFunc(this.gl.SRC_ALPHA, this.gl.ONE_MINUS_SRC_ALPHA);
    } else {
      this.gl.disable(this.gl.BLEND);
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
