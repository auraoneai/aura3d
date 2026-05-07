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
  viewBytes
} from "./RenderDevice";
import { reflectShaderSources } from "./ShaderReflection";
import { Texture } from "./Texture";
import { type VertexFormat } from "./VertexFormat";

const BUFFER_USAGE = {
  MAP_READ: 0x0001,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  INDEX: 0x0010,
  VERTEX: 0x0020,
  UNIFORM: 0x0040
} as const;

const TEXTURE_USAGE = {
  RENDER_ATTACHMENT: 0x0010,
  COPY_SRC: 0x0001,
  TEXTURE_BINDING: 0x0004
} as const;

export interface WebGPULike {
  requestAdapter(): Promise<WebGPUAdapterLike | null>;
  getPreferredCanvasFormat?(): string;
}

export interface WebGPUAdapterLike {
  requestDevice(): Promise<WebGPUDeviceLike>;
  readonly name?: string;
  readonly info?: {
    readonly vendor?: string;
    readonly architecture?: string;
    readonly device?: string;
    readonly description?: string;
  };
}

export interface WebGPUDeviceLike {
  readonly queue: WebGPUQueueLike;
  readonly lost?: Promise<WebGPUDeviceLostInfoLike>;
  createBuffer(descriptor: WebGPUBufferDescriptorLike): WebGPUBufferLike;
  createShaderModule?(descriptor: { readonly label?: string; readonly code: string }): unknown;
  createRenderPipeline?(descriptor: WebGPURenderPipelineDescriptorLike): WebGPURenderPipelineLike;
  createBindGroup?(descriptor: WebGPUBindGroupDescriptorLike): WebGPUBindGroupLike;
  createTexture?(descriptor: WebGPUTextureDescriptorLike): WebGPUTextureLike;
  createCommandEncoder?(descriptor?: { readonly label?: string }): WebGPUCommandEncoderLike;
  destroy?(): void;
}

export interface WebGPUDeviceLostInfoLike {
  readonly reason?: string;
  readonly message?: string;
}

export interface WebGPUQueueLike {
  writeBuffer(buffer: WebGPUBufferLike, offset: number, data: ArrayBuffer | ArrayBufferView, dataOffset?: number, size?: number): void;
  submit(commands: readonly unknown[]): void;
}

export interface WebGPUBufferDescriptorLike {
  readonly label?: string;
  readonly size: number;
  readonly usage: number;
  readonly mappedAtCreation?: boolean;
}

export interface WebGPUBufferLike {
  destroy(): void;
}

export interface WebGPUTextureDescriptorLike {
  readonly label?: string;
  readonly size: readonly [number, number] | { readonly width: number; readonly height: number };
  readonly format: string;
  readonly usage: number;
}

export interface WebGPUTextureLike {
  createView(): unknown;
  destroy(): void;
}

export interface WebGPUCanvasContextLike {
  configure(configuration: WebGPUCanvasConfigurationLike): void;
  getCurrentTexture(): WebGPUTextureLike;
  unconfigure?(): void;
}

export interface WebGPUCanvasConfigurationLike {
  readonly device: WebGPUDeviceLike;
  readonly format: string;
  readonly alphaMode?: "opaque" | "premultiplied";
}

export interface WebGPURenderPipelineDescriptorLike {
  readonly label?: string;
  readonly layout: "auto";
  readonly vertex: {
    readonly module: unknown;
    readonly entryPoint: string;
    readonly buffers?: readonly WebGPUVertexBufferLayoutLike[];
  };
  readonly fragment?: {
    readonly module: unknown;
    readonly entryPoint: string;
    readonly targets: readonly [{ readonly format: string }];
  };
  readonly primitive: {
    readonly topology: "triangle-list" | "line-list" | "point-list";
  };
}

export interface WebGPUVertexBufferLayoutLike {
  readonly arrayStride: number;
  readonly attributes: readonly WebGPUVertexAttributeLike[];
}

export interface WebGPUVertexAttributeLike {
  readonly shaderLocation: number;
  readonly offset: number;
  readonly format: "float32" | "float32x2" | "float32x3" | "float32x4";
}

export interface WebGPUBindGroupDescriptorLike {
  readonly label?: string;
  readonly layout: unknown;
  readonly entries: readonly WebGPUBindGroupEntryLike[];
}

export interface WebGPUBindGroupEntryLike {
  readonly binding: number;
  readonly resource: { readonly buffer: WebGPUBufferLike };
}

export interface WebGPUBindGroupLike {}

export interface WebGPURenderPipelineLike {
  getBindGroupLayout?(index: number): unknown;
}

export interface WebGPUCommandEncoderLike {
  beginRenderPass(descriptor: WebGPURenderPassDescriptorLike): WebGPURenderPassEncoderLike;
  finish(): unknown;
}

export interface WebGPURenderPassDescriptorLike {
  readonly label?: string;
  readonly colorAttachments: readonly [{
    readonly view: unknown;
    readonly clearValue?: readonly [number, number, number, number];
    readonly loadOp: "clear" | "load";
    readonly storeOp: "store";
  }];
}

export interface WebGPURenderPassEncoderLike {
  setPipeline(pipeline: WebGPURenderPipelineLike): void;
  setVertexBuffer(slot: number, buffer: WebGPUBufferLike): void;
  setBindGroup?(index: number, bindGroup: WebGPUBindGroupLike): void;
  setIndexBuffer?(buffer: WebGPUBufferLike, indexFormat: "uint16" | "uint32"): void;
  draw(vertexCount: number, instanceCount?: number): void;
  drawIndexed?(indexCount: number, instanceCount?: number): void;
  end(): void;
}

export interface WebGPUDeviceOptions {
  readonly gpu?: WebGPULike;
  readonly adapter?: WebGPUAdapterLike;
  readonly device?: WebGPUDeviceLike;
  readonly canvas?: HTMLCanvasElement | OffscreenCanvas;
  readonly presentationFormat?: string;
}

class WebGPURenderBuffer implements RenderBuffer {
  public disposed = false;
  public readonly bytes: Uint8Array;

  constructor(
    public readonly id: number,
    public readonly usage: BufferUsage,
    public readonly byteLength: number,
    public readonly handle: WebGPUBufferLike,
    initialData?: ArrayBufferView
  ) {
    this.bytes = new Uint8Array(byteLength);
    if (initialData) this.bytes.set(viewBytes(initialData), 0);
  }

  dispose(): void {
    if (!this.disposed) {
      this.handle.destroy();
      this.disposed = true;
    }
  }
}

class WebGPUShaderProgram implements RenderShaderProgram {
  public disposed = false;
  public readonly renderPipelines = new Map<string, WebGPURenderPipelineLike>();

  constructor(
    public readonly id: number,
    public readonly label: string,
    public readonly marker: string,
    public readonly reflection: ShaderReflection,
    public readonly modules: readonly unknown[],
    public readonly entryPoints: readonly [string, string]
  ) {}

  dispose(): void {
    this.disposed = true;
  }
}

class WebGPURenderTarget implements RenderTarget {
  public disposed = false;
  public readonly colorPixels: Uint8Array;

  constructor(
    public readonly id: number,
    public readonly width: number,
    public readonly height: number,
    public readonly label: string,
    public readonly colorTexture: Texture,
    public readonly nativeTexture: WebGPUTextureLike | null,
    public readonly nativeView: unknown | null
  ) {
    this.colorPixels = new Uint8Array(width * height * 4);
  }

  dispose(): void {
    if (!this.disposed) {
      this.nativeTexture?.destroy();
      this.colorTexture.dispose();
      this.disposed = true;
    }
  }
}

export class WebGPUDevice implements RenderDevice {
  public readonly kind = "webgpu";
  public readonly info: RenderDeviceInfo;
  public disposed = false;
  public contextLost = false;

  private nextId = 1;
  private frameActive = false;
  private drawCalls = 0;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private clearColor: readonly [number, number, number, number] = [0, 0, 0, 1];
  private lastError: string | null = null;
  private nativeSubmissions = 0;
  private canvasSubmissions = 0;
  private readonly buffers = new Set<WebGPURenderBuffer>();
  private readonly shaders = new Set<WebGPUShaderProgram>();
  private readonly renderTargets = new Set<WebGPURenderTarget>();
  private activeRenderTarget: WebGPURenderTarget | null = null;

  static async create(options: WebGPUDeviceOptions = {}): Promise<WebGPUDevice> {
    const gpu = options.gpu ?? readWebGPU(globalThis);
    const adapter = options.adapter ?? (await requestAdapter(gpu));
    if (!adapter) {
      throw new RenderDeviceError("WebGPU adapter request did not return a device owner", "WEBGPU_ADAPTER_MISSING");
    }
    const device = validateWebGPUDevice(await requestDevice(adapter, options.device));
    const canvasContext = options.canvas ? acquireWebGPUCanvasContext(options.canvas) : null;
    const presentationFormat = options.presentationFormat ?? gpu?.getPreferredCanvasFormat?.() ?? "bgra8unorm";
    if (canvasContext) {
      canvasContext.configure({
        device,
        format: presentationFormat,
        alphaMode: "opaque"
      });
    }
    return new WebGPUDevice(adapter, device, canvasContext, presentationFormat);
  }

  private constructor(
    private readonly adapter: WebGPUAdapterLike,
    private readonly device: WebGPUDeviceLike,
    private readonly canvasContext: WebGPUCanvasContextLike | null,
    private readonly presentationFormat: string
  ) {
    const supportsNativeRenderPipeline = hasNativeRenderPipeline(device);
    const supportsCanvasSurface = supportsNativeRenderPipeline && canvasContext !== null;
    this.info = {
      backend: "webgpu",
      vendor: adapter.info?.vendor ?? "webgpu",
      renderer: describeAdapter(adapter) ?? "webgpu-render-device",
      capabilities: [
        "buffers",
        "buffer-readback",
        "shader-validation",
        "render-targets",
        "pixel-readback",
        "draw-validation",
        "rasterization",
        ...(supportsNativeRenderPipeline ? ["native-render-pipeline" as const] : []),
        ...(supportsCanvasSurface ? ["canvas-surface" as const] : [])
      ],
      limitations: [
        "CPU-shadowed readback remains active for deterministic tests while native WebGPU render-pass submission is available.",
        ...(supportsNativeRenderPipeline ? [] : ["native WebGPU render-pipeline submission requires createRenderPipeline, createTexture, and createCommandEncoder."]),
        ...(canvasContext ? [] : ["Canvas presentation requires a canvas that exposes a webgpu context."])
      ]
    };
    this.observeDeviceLost();
  }

  createBuffer(usage: BufferUsage, byteLength: number, initialData?: ArrayBufferView): RenderBuffer {
    this.assertAlive();
    if (byteLength <= 0 || !Number.isInteger(byteLength)) {
      throw new RenderDeviceError("Buffer byteLength must be a positive integer", "INVALID_BUFFER_SIZE", { byteLength });
    }
    if (initialData && initialData.byteLength > byteLength) {
      throw new RenderDeviceError("Initial data exceeds buffer size", "BUFFER_OVERFLOW", {
        byteLength,
        dataByteLength: initialData.byteLength
      });
    }

    const handle = this.device.createBuffer({
      label: `galileo3d-${usage}-${this.nextId}`,
      size: byteLength,
      usage: bufferUsageFlags(usage)
    });
    const buffer = new WebGPURenderBuffer(this.nextId++, usage, byteLength, handle, initialData);
    this.buffers.add(buffer);
    if (initialData) this.device.queue.writeBuffer(handle, 0, initialData);
    return buffer;
  }

  updateBuffer(buffer: RenderBuffer, byteOffset: number, data: ArrayBufferView): void {
    this.assertAlive();
    const webgpuBuffer = this.requireBuffer(buffer);
    if (byteOffset < 0 || byteOffset + data.byteLength > webgpuBuffer.byteLength) {
      throw new RenderDeviceError("Buffer update range is out of bounds", "BUFFER_RANGE_OUT_OF_BOUNDS", {
        byteOffset,
        dataByteLength: data.byteLength,
        byteLength: webgpuBuffer.byteLength
      });
    }
    webgpuBuffer.bytes.set(viewBytes(data), byteOffset);
    this.device.queue.writeBuffer(webgpuBuffer.handle, byteOffset, data);
  }

  readBuffer(buffer: RenderBuffer, byteOffset = 0, byteLength = buffer.byteLength - byteOffset): Uint8Array {
    this.assertAlive();
    const webgpuBuffer = this.requireBuffer(buffer);
    if (byteOffset < 0 || byteLength < 0 || byteOffset + byteLength > webgpuBuffer.byteLength) {
      throw new RenderDeviceError("Buffer read range is out of bounds", "BUFFER_RANGE_OUT_OF_BOUNDS", {
        byteOffset,
        byteLength,
        bufferByteLength: webgpuBuffer.byteLength
      });
    }
    return webgpuBuffer.bytes.slice(byteOffset, byteOffset + byteLength);
  }

  createShaderProgram(sources: ShaderSources): RenderShaderProgram {
    this.assertAlive();
    if (!sources.vertex.includes(sources.marker) || !sources.fragment.includes(sources.marker)) {
      throw new RenderDeviceError("Shader source marker is missing from compiled sources", "SHADER_MARKER_MISSING", {
        label: sources.label,
        marker: sources.marker
      });
    }
    const nativeSources = createNativeShaderSources(sources);
    const modules = this.device.createShaderModule
      ? [
          this.device.createShaderModule({ label: `${sources.label}-vertex`, code: nativeSources.vertex }),
          this.device.createShaderModule({ label: `${sources.label}-fragment`, code: nativeSources.fragment })
        ]
      : [];
    const shader = new WebGPUShaderProgram(this.nextId++, sources.label, sources.marker, reflectShaderSources(sources), modules, nativeSources.entryPoints);
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
    const nativeTexture = this.device.createTexture?.({
      label: descriptor.label ?? "galileo3d-webgpu-render-target",
      size: [descriptor.width, descriptor.height],
      format: "rgba8unorm",
      usage: TEXTURE_USAGE.RENDER_ATTACHMENT | TEXTURE_USAGE.COPY_SRC | TEXTURE_USAGE.TEXTURE_BINDING
    }) ?? null;
    const target = new WebGPURenderTarget(
      this.nextId++,
      descriptor.width,
      descriptor.height,
      descriptor.label ?? "render-target",
      new Texture({ width: descriptor.width, height: descriptor.height, label: descriptor.label ?? "render-target-color" }),
      nativeTexture,
      nativeTexture?.createView() ?? null
    );
    this.renderTargets.add(target);
    return target;
  }

  setRenderTarget(target: RenderTarget | null): void {
    this.assertAlive();
    if (target === null) {
      this.activeRenderTarget = null;
      return;
    }
    if (!(target instanceof WebGPURenderTarget) || !this.renderTargets.has(target) || target.disposed) {
      throw new RenderDeviceError("Render target is not a live WebGPU resource owned by this device", "INVALID_RESOURCE", {
        targetId: target.id
      });
    }
    this.activeRenderTarget = target;
  }

  readPixels(x: number, y: number, width: number, height: number): Uint8Array {
    this.assertAlive();
    if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width <= 0 || height <= 0) {
      throw new RenderDeviceError("Readback rectangle must be positive and in bounds", "INVALID_READBACK_RECT", { x, y, width, height });
    }
    const boundsWidth = this.activeRenderTarget?.width ?? this.viewportWidth;
    const boundsHeight = this.activeRenderTarget?.height ?? this.viewportHeight;
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
    const output = new Uint8Array(width * height * 4);
    const target = this.activeRenderTarget;
    if (!target) {
      const bytes = rgbaBytes(this.clearColor);
      for (let index = 0; index < output.length; index += 4) output.set(bytes, index);
      return output;
    }
    for (let row = 0; row < height; row += 1) {
      const sourceOffset = ((y + row) * target.width + x) * 4;
      const destOffset = row * width * 4;
      output.set(target.colorPixels.subarray(sourceOffset, sourceOffset + width * 4), destOffset);
    }
    return output;
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
    this.lastError = null;
    this.viewportWidth = width;
    this.viewportHeight = height;
  }

  clear(color: readonly [number, number, number, number]): void {
    this.assertFrame();
    this.clearColor = color;
    if (this.activeRenderTarget) {
      const bytes = rgbaBytes(color);
      for (let index = 0; index < this.activeRenderTarget.colorPixels.length; index += 4) {
        this.activeRenderTarget.colorPixels.set(bytes, index);
      }
    }
  }

  draw(command: DrawCommand): void {
    this.assertFrame();
    const vertexBuffer = this.requireBuffer(command.vertexBuffer);
    if (vertexBuffer.disposed) {
      throw new RenderDeviceError("Cannot draw with a disposed vertex buffer", "DISPOSED_RESOURCE", {
        bufferId: command.vertexBuffer.id
      });
    }
    if (command.indexBuffer) {
      const indexBuffer = this.requireBuffer(command.indexBuffer);
      if (indexBuffer.disposed) {
        throw new RenderDeviceError("Cannot draw with a disposed index buffer", "DISPOSED_RESOURCE", {
          bufferId: command.indexBuffer.id
        });
      }
    }
    if (command.shader) this.requireShader(command.shader);
    if (command.vertexCount <= 0) {
      throw new RenderDeviceError("Draw command must have a positive vertex count", "INVALID_DRAW_COMMAND", {
        vertexCount: command.vertexCount,
        label: command.label
      });
    }
    if (command.instanceCount !== undefined && (!Number.isInteger(command.instanceCount) || command.instanceCount <= 0)) {
      throw new RenderDeviceError("Draw command instanceCount must be a positive integer", "INVALID_DRAW_COMMAND", {
        instanceCount: command.instanceCount,
        label: command.label
      });
    }
    this.submitNativeRenderPass(command, vertexBuffer);
    this.rasterizeDraw(command, vertexBuffer);
    this.drawCalls += 1;
  }

  endFrame(): void {
    this.assertFrame();
    this.frameActive = false;
    this.device.queue.submit([]);
  }

  captureState(): ReadonlyMap<string, string | number | boolean | null> {
    return new Map<string, string | number | boolean | null>([
      ["backend", this.kind],
      ["disposed", this.disposed],
      ["contextLost", this.contextLost],
      ["frameActive", this.frameActive],
      ["viewportWidth", this.viewportWidth],
      ["viewportHeight", this.viewportHeight],
      ["renderTarget", this.activeRenderTarget?.label ?? null],
      ["presentationFormat", this.presentationFormat],
      ["drawCalls", this.drawCalls],
      ["nativeSubmissions", this.nativeSubmissions],
      ["canvasSubmissions", this.canvasSubmissions]
    ]);
  }

  getDiagnostics(): RenderDeviceDiagnostics {
    const liveRenderTargets = [...this.renderTargets].filter((target) => !target.disposed);
    return {
      drawCalls: this.drawCalls,
      buffers: [...this.buffers].filter((buffer) => !buffer.disposed).length,
      shaders: [...this.shaders].filter((shader) => !shader.disposed).length,
      renderTargets: liveRenderTargets.length,
      textures: liveRenderTargets.length,
      textureBytes: liveRenderTargets.reduce((total, target) => total + target.colorTexture.byteLength, 0),
      compressedTextures: 0,
      compressedTextureBytes: 0,
      textureFallbacks: 0,
      textureFallbackBytes: 0,
      disposedBuffers: [...this.buffers].filter((buffer) => buffer.disposed).length,
      disposedShaders: [...this.shaders].filter((shader) => shader.disposed).length,
      disposedRenderTargets: [...this.renderTargets].filter((target) => target.disposed).length,
      disposedTextures: [...this.renderTargets].filter((target) => target.colorTexture.disposed).length,
      nativeSubmissions: this.nativeSubmissions,
      lastError: this.lastError,
      contextLost: this.contextLost
    };
  }

  dispose(): void {
    if (this.disposed) return;
    for (const buffer of this.buffers) buffer.dispose();
    for (const shader of this.shaders) shader.dispose();
    for (const target of this.renderTargets) target.dispose();
    this.canvasContext?.unconfigure?.();
    this.device.destroy?.();
    this.frameActive = false;
    this.disposed = true;
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

  private observeDeviceLost(): void {
    const lost = this.device.lost;
    if (!lost || typeof lost.then !== "function") return;
    void lost.then((info) => {
      if (this.disposed) return;
      this.contextLost = true;
      const detail = [info.reason, info.message].filter(Boolean).join(": ");
      this.lastError = detail ? `WebGPU device lost: ${detail}` : "WebGPU device lost";
    }).catch((error: unknown) => {
      if (this.disposed) return;
      this.contextLost = true;
      this.lastError = `WebGPU device lost promise rejected: ${error instanceof Error ? error.message : String(error)}`;
    });
  }

  private requireBuffer(buffer: RenderBuffer): WebGPURenderBuffer {
    if (!(buffer instanceof WebGPURenderBuffer) || !this.buffers.has(buffer)) {
      throw new RenderDeviceError("Buffer was not created by this WebGPU device", "FOREIGN_RESOURCE", {
        bufferId: buffer.id
      });
    }
    if (buffer.disposed) {
      throw new RenderDeviceError("Cannot use a disposed buffer", "DISPOSED_RESOURCE", { bufferId: buffer.id });
    }
    return buffer;
  }

  private requireShader(shader: RenderShaderProgram): WebGPUShaderProgram {
    if (!(shader instanceof WebGPUShaderProgram) || !this.shaders.has(shader)) {
      throw new RenderDeviceError("Shader was not created by this WebGPU device", "FOREIGN_RESOURCE", {
        shaderId: shader.id
      });
    }
    if (shader.disposed) {
      throw new RenderDeviceError("Cannot use a disposed shader", "DISPOSED_RESOURCE", { shaderId: shader.id });
    }
    return shader;
  }

  private rasterizeDraw(command: DrawCommand, vertexBuffer: WebGPURenderBuffer): void {
    if (!this.activeRenderTarget || !command.vertexFormat?.hasAttribute("position")) return;
    const position = command.vertexFormat.getAttribute("position");
    const colorAttribute = command.vertexFormat.hasAttribute("color") ? command.vertexFormat.getAttribute("color") : null;
    if (position.components < 2) return;
    const indices = this.indicesFor(command);
    const color = uniformColor(command.uniforms);
    const instanceMatrices = uniformMat4Array(command.uniforms, command.instanceCount ?? 1);
    for (const matrix of instanceMatrices) {
      if (command.topology === "triangles") {
        for (let offset = 0; offset + 2 < indices.length; offset += 3) {
          const indexA = indices[offset]!;
          const indexB = indices[offset + 1]!;
          const indexC = indices[offset + 2]!;
          const a = transformPosition(readPosition(vertexBuffer.bytes, command.vertexFormat.stride, position.offset, indexA), matrix);
          const b = transformPosition(readPosition(vertexBuffer.bytes, command.vertexFormat.stride, position.offset, indexB), matrix);
          const c = transformPosition(readPosition(vertexBuffer.bytes, command.vertexFormat.stride, position.offset, indexC), matrix);
          const colorA = readVertexColor(vertexBuffer.bytes, command.vertexFormat.stride, colorAttribute?.offset, indexA);
          const colorB = readVertexColor(vertexBuffer.bytes, command.vertexFormat.stride, colorAttribute?.offset, indexB);
          const colorC = readVertexColor(vertexBuffer.bytes, command.vertexFormat.stride, colorAttribute?.offset, indexC);
          rasterizeTriangle(this.activeRenderTarget, a, b, c, color, colorA, colorB, colorC);
        }
      } else if (command.topology === "lines") {
        for (let offset = 0; offset + 1 < indices.length; offset += 2) {
          const indexA = indices[offset]!;
          const indexB = indices[offset + 1]!;
          const a = transformPosition(readPosition(vertexBuffer.bytes, command.vertexFormat.stride, position.offset, indexA), matrix);
          const b = transformPosition(readPosition(vertexBuffer.bytes, command.vertexFormat.stride, position.offset, indexB), matrix);
          const colorA = readVertexColor(vertexBuffer.bytes, command.vertexFormat.stride, colorAttribute?.offset, indexA);
          const colorB = readVertexColor(vertexBuffer.bytes, command.vertexFormat.stride, colorAttribute?.offset, indexB);
          rasterizeLine(this.activeRenderTarget, a, b, color, colorA, colorB);
        }
      } else {
        for (const index of indices) {
          const point = transformPosition(readPosition(vertexBuffer.bytes, command.vertexFormat.stride, position.offset, index), matrix);
          const vertexColor = readVertexColor(vertexBuffer.bytes, command.vertexFormat.stride, colorAttribute?.offset, index);
          rasterizePoint(this.activeRenderTarget, point, multiplyColor(color, vertexColor));
        }
      }
    }
  }

  private submitNativeRenderPass(command: DrawCommand, vertexBuffer: WebGPURenderBuffer): void {
    const nativeView = this.activeRenderTarget?.nativeView ?? this.currentCanvasView();
    if (!nativeView || !command.shader) return;
    if (!hasNativeRenderPipeline(this.device)) return;
    const shader = this.requireShader(command.shader);
    const vertexModule = shader.modules[0];
    const fragmentModule = shader.modules[1] ?? vertexModule;
    if (!vertexModule || !fragmentModule) return;
    const topology = command.topology === "lines" ? "line-list" : command.topology === "points" ? "point-list" : "triangle-list";
    const targetFormat = this.activeRenderTarget ? "rgba8unorm" : this.presentationFormat;
    const vertexBuffers = command.vertexFormat ? [vertexBufferLayout(command.vertexFormat)] : undefined;
    const pipelineKey = `${topology}:${targetFormat}:${command.vertexFormat?.stride ?? 0}:${command.vertexFormat?.attributes.map((attribute) => `${attribute.shaderLocation}/${attribute.offset}/${attribute.components}`).join(",") ?? "none"}`;
    let pipeline = shader.renderPipelines.get(pipelineKey);
    if (!pipeline) {
      pipeline = this.device.createRenderPipeline({
        label: `${shader.label}-pipeline`,
        layout: "auto",
        vertex: { module: vertexModule, entryPoint: shader.entryPoints[0], ...(vertexBuffers ? { buffers: vertexBuffers } : {}) },
        fragment: {
          module: fragmentModule,
          entryPoint: shader.entryPoints[1],
          targets: [{ format: targetFormat }]
        },
        primitive: { topology }
      });
      shader.renderPipelines.set(pipelineKey, pipeline);
    }
    const encoder = this.device.createCommandEncoder({ label: `${command.label ?? "draw"}-encoder` });
    const uniformBuffer = this.createNativeFragmentUniformBuffer(command);
    const bindGroup = uniformBuffer && pipeline.getBindGroupLayout && this.device.createBindGroup
      ? this.device.createBindGroup({
          label: `${command.label ?? "draw"}-fragment-bind-group`,
          layout: pipeline.getBindGroupLayout(0),
          entries: [{ binding: 0, resource: { buffer: uniformBuffer } }]
        })
      : null;
    const pass = encoder.beginRenderPass({
      label: `${command.label ?? "draw"}-pass`,
      colorAttachments: [{
        view: nativeView,
        clearValue: this.clearColor,
        loadOp: this.drawCalls === 0 ? "clear" : "load",
        storeOp: "store"
      }]
    });
    pass.setPipeline(pipeline);
    pass.setVertexBuffer(0, vertexBuffer.handle);
    if (bindGroup) pass.setBindGroup?.(0, bindGroup);
    if (command.indexBuffer) {
      if (!pass.setIndexBuffer || !pass.drawIndexed) {
        pass.end();
        uniformBuffer?.destroy();
        this.lastError = "Native WebGPU indexed draw skipped because the render-pass encoder does not expose indexed draw APIs.";
        return;
      }
      const indexBuffer = this.requireBuffer(command.indexBuffer);
      pass.setIndexBuffer(indexBuffer.handle, command.indexType ?? "uint16");
      pass.drawIndexed(command.indexCount ?? this.indicesFor(command).length, command.instanceCount ?? 1);
    } else {
      pass.draw(command.vertexCount, command.instanceCount ?? 1);
    }
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    uniformBuffer?.destroy();
    this.nativeSubmissions += 1;
    if (!this.activeRenderTarget) this.canvasSubmissions += 1;
  }

  private createNativeFragmentUniformBuffer(command: DrawCommand): WebGPUBufferLike | null {
    if (!this.device.createBindGroup) return null;
    const color = new Float32Array(uniformColor(command.uniforms));
    const buffer = this.device.createBuffer({
      label: `${command.label ?? "draw"}-fragment-uniforms`,
      size: color.byteLength,
      usage: BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST
    });
    this.device.queue.writeBuffer(buffer, 0, color);
    return buffer;
  }

  private currentCanvasView(): unknown | null {
    if (!this.canvasContext) return null;
    return this.canvasContext.getCurrentTexture().createView();
  }

  private indicesFor(command: DrawCommand): readonly number[] {
    if (!command.indexBuffer) {
      return Array.from({ length: command.vertexCount }, (_, index) => index);
    }
    const indexBuffer = this.requireBuffer(command.indexBuffer);
    const indexCount = command.indexCount ?? Math.floor(indexBuffer.byteLength / (command.indexType === "uint32" ? 4 : 2));
    const indices: number[] = [];
    const view = new DataView(indexBuffer.bytes.buffer, indexBuffer.bytes.byteOffset, indexBuffer.bytes.byteLength);
    for (let index = 0; index < indexCount; index += 1) {
      indices.push(command.indexType === "uint32" ? view.getUint32(index * 4, true) : view.getUint16(index * 2, true));
    }
    return indices;
  }
}

async function requestAdapter(gpu: WebGPULike | undefined): Promise<WebGPUAdapterLike | null> {
  if (!gpu) {
    throw new RenderDeviceError("WebGPU runtime is missing from the current environment", "WEBGPU_RUNTIME_MISSING");
  }
  return gpu.requestAdapter();
}

async function requestDevice(adapter: WebGPUAdapterLike, injectedDevice?: WebGPUDeviceLike): Promise<WebGPUDeviceLike> {
  if (injectedDevice) {
    return injectedDevice;
  }
  try {
    return await adapter.requestDevice();
  } catch (error) {
    throw new RenderDeviceError("WebGPU adapter failed to create a device", "WEBGPU_DEVICE_REQUEST_FAILED", {
      adapter: describeAdapter(adapter),
      reason: error instanceof Error ? error.message : String(error)
    });
  }
}

function validateWebGPUDevice(device: WebGPUDeviceLike): WebGPUDeviceLike {
  const missing: string[] = [];
  if (!device || typeof device !== "object") missing.push("device");
  if (typeof device?.createBuffer !== "function") missing.push("createBuffer");
  if (typeof device?.queue?.writeBuffer !== "function") missing.push("queue.writeBuffer");
  if (typeof device?.queue?.submit !== "function") missing.push("queue.submit");

  if (missing.length > 0) {
    throw new RenderDeviceError("WebGPU device is missing required render-device capabilities", "WEBGPU_DEVICE_INVALID", {
      missing
    });
  }
  return device;
}

function hasNativeRenderPipeline(device: WebGPUDeviceLike): device is WebGPUDeviceLike & Required<Pick<WebGPUDeviceLike, "createBindGroup" | "createCommandEncoder" | "createRenderPipeline" | "createTexture">> {
  return typeof device.createCommandEncoder === "function" &&
    typeof device.createRenderPipeline === "function" &&
    typeof device.createBindGroup === "function" &&
    typeof device.createTexture === "function";
}

function readWebGPU(globalScope: Pick<typeof globalThis, "navigator">): WebGPULike | undefined {
  return (globalScope.navigator as Navigator & { gpu?: WebGPULike } | undefined)?.gpu;
}

function acquireWebGPUCanvasContext(canvas: HTMLCanvasElement | OffscreenCanvas): WebGPUCanvasContextLike {
  const getContext = (canvas as HTMLCanvasElement & {
    getContext(type: "webgpu"): WebGPUCanvasContextLike | null;
  }).getContext;
  if (typeof getContext !== "function") {
    throw new RenderDeviceError("WebGPU canvas presentation requires getContext(\"webgpu\")", "WEBGPU_CANVAS_CONTEXT_MISSING");
  }
  const context = getContext.call(canvas, "webgpu");
  if (!context || typeof context.configure !== "function" || typeof context.getCurrentTexture !== "function") {
    throw new RenderDeviceError("Canvas did not provide a usable WebGPU presentation context", "WEBGPU_CANVAS_CONTEXT_INVALID");
  }
  return context;
}

function describeAdapter(adapter: WebGPUAdapterLike): string | undefined {
  if (adapter.name) return adapter.name;
  const parts = [adapter.info?.vendor, adapter.info?.architecture, adapter.info?.device, adapter.info?.description].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : undefined;
}

function bufferUsageFlags(usage: BufferUsage): number {
  if (usage === "vertex") return BUFFER_USAGE.VERTEX | BUFFER_USAGE.COPY_DST | BUFFER_USAGE.COPY_SRC;
  if (usage === "index") return BUFFER_USAGE.INDEX | BUFFER_USAGE.COPY_DST | BUFFER_USAGE.COPY_SRC;
  if (usage === "uniform") return BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST | BUFFER_USAGE.COPY_SRC;
  return BUFFER_USAGE.MAP_READ | BUFFER_USAGE.COPY_DST;
}

function rgbaBytes(color: readonly [number, number, number, number]): Uint8Array {
  return new Uint8Array(color.map((channel) => Math.round(Math.max(0, Math.min(1, channel)) * 255)));
}

function uniformColor(uniforms: DrawCommand["uniforms"]): readonly [number, number, number, number] {
  const value = uniforms?.get("u_color") ?? uniforms?.get("u_baseColor") ?? uniforms?.get("color");
  const components = value instanceof Float32Array || Array.isArray(value) ? Array.from(value).slice(0, 4) : [];
  if (components.length >= 3 && components.every((component) => Number.isFinite(component))) {
    return [
      components[0] ?? 1,
      components[1] ?? 1,
      components[2] ?? 1,
      components[3] ?? 1
    ];
  }
  return [1, 1, 1, 1];
}

function uniformMat4Array(uniforms: DrawCommand["uniforms"], instanceCount: number): readonly (readonly number[])[] {
  const value = uniforms?.get("u_instanceMatrices");
  const numbers = value instanceof Float32Array || Array.isArray(value) ? Array.from(value) : [];
  if (numbers.length < instanceCount * 16 || !numbers.slice(0, instanceCount * 16).every(Number.isFinite)) {
    return Array.from({ length: instanceCount }, () => identityMatrix());
  }
  return Array.from({ length: instanceCount }, (_, index) => numbers.slice(index * 16, index * 16 + 16));
}

function transformPosition(position: readonly [number, number], matrix: readonly number[]): readonly [number, number] {
  return [
    (matrix[0] ?? 1) * position[0] + (matrix[4] ?? 0) * position[1] + (matrix[12] ?? 0),
    (matrix[1] ?? 0) * position[0] + (matrix[5] ?? 1) * position[1] + (matrix[13] ?? 0)
  ];
}

function identityMatrix(): readonly number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
}

function readPosition(bytes: Uint8Array, stride: number, offset: number, vertexIndex: number): readonly [number, number] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const base = vertexIndex * stride + offset;
  return [view.getFloat32(base, true), view.getFloat32(base + 4, true)];
}

function readVertexColor(bytes: Uint8Array, stride: number, offset: number | undefined, vertexIndex: number): readonly [number, number, number, number] {
  if (offset === undefined) return [1, 1, 1, 1];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const base = vertexIndex * stride + offset;
  return [
    view.getFloat32(base, true),
    view.getFloat32(base + 4, true),
    view.getFloat32(base + 8, true),
    view.getFloat32(base + 12, true)
  ];
}

function rasterizeTriangle(
  target: WebGPURenderTarget,
  a: readonly [number, number],
  b: readonly [number, number],
  c: readonly [number, number],
  color: readonly [number, number, number, number],
  colorA: readonly [number, number, number, number],
  colorB: readonly [number, number, number, number],
  colorC: readonly [number, number, number, number]
): void {
  const pa = toPixel(a, target.width, target.height);
  const pb = toPixel(b, target.width, target.height);
  const pc = toPixel(c, target.width, target.height);
  const minX = clampInt(Math.floor(Math.min(pa[0], pb[0], pc[0])), 0, target.width - 1);
  const maxX = clampInt(Math.ceil(Math.max(pa[0], pb[0], pc[0])), 0, target.width - 1);
  const minY = clampInt(Math.floor(Math.min(pa[1], pb[1], pc[1])), 0, target.height - 1);
  const maxY = clampInt(Math.ceil(Math.max(pa[1], pb[1], pc[1])), 0, target.height - 1);
  const area = edge(pa, pb, pc);
  if (Math.abs(area) < 1e-6) return;
  for (let y = minY; y <= maxY; y += 1) {
    for (let x = minX; x <= maxX; x += 1) {
      const p = [x + 0.5, y + 0.5] as const;
      const w0 = edge(pb, pc, p);
      const w1 = edge(pc, pa, p);
      const w2 = edge(pa, pb, p);
      if ((w0 >= 0 && w1 >= 0 && w2 >= 0) || (w0 <= 0 && w1 <= 0 && w2 <= 0)) {
        const invArea = 1 / area;
        const shadedColor = multiplyColor(color, interpolateColor(colorA, colorB, colorC, w0 * invArea, w1 * invArea, w2 * invArea));
        target.colorPixels.set(rgbaBytes(shadedColor), (y * target.width + x) * 4);
      }
    }
  }
}

function rasterizeLine(
  target: WebGPURenderTarget,
  a: readonly [number, number],
  b: readonly [number, number],
  color: readonly [number, number, number, number],
  colorA: readonly [number, number, number, number],
  colorB: readonly [number, number, number, number]
): void {
  const pa = toPixel(a, target.width, target.height);
  const pb = toPixel(b, target.width, target.height);
  const x0 = clampInt(Math.round(pa[0]), 0, target.width - 1);
  const y0 = clampInt(Math.round(pa[1]), 0, target.height - 1);
  const x1 = clampInt(Math.round(pb[0]), 0, target.width - 1);
  const y1 = clampInt(Math.round(pb[1]), 0, target.height - 1);
  const dx = Math.abs(x1 - x0);
  const dy = Math.abs(y1 - y0);
  const steps = Math.max(dx, dy, 1);
  const shadedA = multiplyColor(color, colorA);
  const shadedB = multiplyColor(color, colorB);
  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    const x = clampInt(Math.round(x0 + (x1 - x0) * t), 0, target.width - 1);
    const y = clampInt(Math.round(y0 + (y1 - y0) * t), 0, target.height - 1);
    const shaded = lerpColor(shadedA, shadedB, t);
    target.colorPixels.set(rgbaBytes(shaded), (y * target.width + x) * 4);
  }
}

function rasterizePoint(target: WebGPURenderTarget, point: readonly [number, number], color: readonly [number, number, number, number]): void {
  const pixel = toPixel(point, target.width, target.height);
  const centerX = clampInt(Math.round(pixel[0]), 0, target.width - 1);
  const centerY = clampInt(Math.round(pixel[1]), 0, target.height - 1);
  const bytes = rgbaBytes(color);
  for (let y = centerY - 2; y <= centerY + 2; y += 1) {
    if (y < 0 || y >= target.height) continue;
    for (let x = centerX - 2; x <= centerX + 2; x += 1) {
      if (x < 0 || x >= target.width) continue;
      target.colorPixels.set(bytes, (y * target.width + x) * 4);
    }
  }
}

function lerpColor(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
  t: number
): readonly [number, number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
    a[3] + (b[3] - a[3]) * t
  ];
}

function interpolateColor(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
  c: readonly [number, number, number, number],
  wa: number,
  wb: number,
  wc: number
): readonly [number, number, number, number] {
  return [
    a[0] * wa + b[0] * wb + c[0] * wc,
    a[1] * wa + b[1] * wb + c[1] * wc,
    a[2] * wa + b[2] * wb + c[2] * wc,
    a[3] * wa + b[3] * wb + c[3] * wc
  ];
}

function multiplyColor(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number]
): readonly [number, number, number, number] {
  return [a[0] * b[0], a[1] * b[1], a[2] * b[2], a[3] * b[3]];
}

function toPixel(point: readonly [number, number], width: number, height: number): readonly [number, number] {
  return [(point[0] * 0.5 + 0.5) * (width - 1), (1 - (point[1] * 0.5 + 0.5)) * (height - 1)];
}

function edge(a: readonly [number, number], b: readonly [number, number], c: readonly [number, number]): number {
  return (c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0]);
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createNativeShaderSources(sources: ShaderSources): { readonly vertex: string; readonly fragment: string; readonly entryPoints: readonly [string, string] } {
  const vertexEntry = inferWGSLVertexEntryPoint(sources.vertex) ?? "vs_main";
  const fragmentEntry = inferWGSLFragmentEntryPoint(sources.fragment) ?? "fs_main";
  if (/\@(vertex|fragment|compute)\b/.test(sources.vertex) || /\@(vertex|fragment|compute)\b/.test(sources.fragment)) {
    return { vertex: sources.vertex, fragment: sources.fragment, entryPoints: [vertexEntry, fragmentEntry] };
  }
  return {
    vertex: `// ${sources.marker}\nstruct VertexOutput {\n  @builtin(position) position: vec4<f32>,\n};\n\n@vertex\nfn ${vertexEntry}(@location(0) position: vec3<f32>) -> VertexOutput {\n  var output: VertexOutput;\n  output.position = vec4<f32>(position, 1.0);\n  return output;\n}\n`,
    fragment: `// ${sources.marker}\nstruct FragmentUniforms {\n  color: vec4<f32>,\n};\n\n@group(0) @binding(0) var<uniform> u_fragment: FragmentUniforms;\n\n@fragment\nfn ${fragmentEntry}() -> @location(0) vec4<f32> {\n  return u_fragment.color;\n}\n`,
    entryPoints: [vertexEntry, fragmentEntry]
  };
}

function inferWGSLVertexEntryPoint(source: string): string | undefined {
  return /@vertex\s+fn\s+([A-Za-z_]\w*)/.exec(source)?.[1];
}

function inferWGSLFragmentEntryPoint(source: string): string | undefined {
  return /@fragment\s+fn\s+([A-Za-z_]\w*)/.exec(source)?.[1];
}

function vertexBufferLayout(format: VertexFormat): WebGPUVertexBufferLayoutLike {
  return {
    arrayStride: format.stride,
    attributes: format.attributes.map((attribute) => ({
      shaderLocation: attribute.shaderLocation,
      offset: attribute.offset,
      format: vertexAttributeFormat(attribute.components)
    }))
  };
}

function vertexAttributeFormat(components: 1 | 2 | 3 | 4): WebGPUVertexAttributeLike["format"] {
  if (components === 1) return "float32";
  if (components === 2) return "float32x2";
  if (components === 3) return "float32x3";
  return "float32x4";
}
