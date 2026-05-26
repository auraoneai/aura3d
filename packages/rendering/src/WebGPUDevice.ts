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
  type UniformValue,
  viewBytes
} from "./RenderDevice";
import { reflectShaderSources } from "./ShaderReflection";
import type { Sampler, TextureMagFilter, TextureMinFilter } from "./Sampler";
import { Texture, bytesPerPixel, isCompressedTextureFormat, type TextureFormat } from "./Texture";
import { TextureBinding } from "./TextureBinding";
import { type VertexFormat } from "./VertexFormat";

const BUFFER_USAGE = {
  MAP_READ: 0x0001,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  INDEX: 0x0010,
  VERTEX: 0x0020,
  UNIFORM: 0x0040
} as const;
const MAP_MODE = {
  READ: 0x0001
} as const;

const TEXTURE_USAGE = {
  RENDER_ATTACHMENT: 0x0010,
  COPY_SRC: 0x0001,
  COPY_DST: 0x0002,
  TEXTURE_BINDING: 0x0004
} as const;
const DEPTH_TEXTURE_FORMAT = "depth24plus";

interface ForwardShadowUniforms {
  readonly texture: TextureBinding;
  readonly matrix: readonly number[];
  readonly strength: number;
  readonly bias: number;
}

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
  createSampler?(descriptor?: WebGPUSamplerDescriptorLike): WebGPUSamplerLike;
  createCommandEncoder?(descriptor?: { readonly label?: string }): WebGPUCommandEncoderLike;
  destroy?(): void;
}

export interface WebGPUDeviceLostInfoLike {
  readonly reason?: string;
  readonly message?: string;
}

export interface WebGPUQueueLike {
  writeBuffer(buffer: WebGPUBufferLike, offset: number, data: ArrayBuffer | ArrayBufferView, dataOffset?: number, size?: number): void;
  writeTexture?(destination: WebGPUImageCopyTextureLike, data: ArrayBuffer | ArrayBufferView, dataLayout: WebGPUImageDataLayoutLike, size: WebGPUExtent3DLike): void;
  copyExternalImageToTexture?(source: WebGPUImageCopyExternalImageLike, destination: WebGPUImageCopyTextureLike, size: WebGPUExtent3DLike): void;
  submit(commands: readonly unknown[]): void;
}

export interface WebGPUBufferDescriptorLike {
  readonly label?: string;
  readonly size: number;
  readonly usage: number;
  readonly mappedAtCreation?: boolean;
}

export interface WebGPUBufferLike {
  mapAsync?(mode: number): Promise<void>;
  getMappedRange?(): ArrayBuffer;
  unmap?(): void;
  destroy(): void;
}

export interface WebGPUTextureDescriptorLike {
  readonly label?: string;
  readonly size: readonly [number, number, number?] | { readonly width: number; readonly height: number; readonly depthOrArrayLayers?: number };
  readonly format: string;
  readonly usage: number;
  readonly mipLevelCount?: number;
}

export interface WebGPUTextureLike {
  createView(): unknown;
  destroy(): void;
}

export interface WebGPUSamplerDescriptorLike {
  readonly minFilter?: "nearest" | "linear";
  readonly magFilter?: "nearest" | "linear";
  readonly mipmapFilter?: "nearest" | "linear";
  readonly addressModeU?: "clamp-to-edge" | "repeat" | "mirror-repeat";
  readonly addressModeV?: "clamp-to-edge" | "repeat" | "mirror-repeat";
  readonly maxAnisotropy?: number;
}

export interface WebGPUSamplerLike {}

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
  readonly depthStencil?: {
    readonly format: string;
    readonly depthWriteEnabled: boolean;
    readonly depthCompare: "less-equal" | "always";
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
  readonly resource: unknown;
}

export interface WebGPUBindGroupLike {}

export interface WebGPURenderPipelineLike {
  getBindGroupLayout?(index: number): unknown;
}

export interface WebGPUCommandEncoderLike {
  beginRenderPass(descriptor: WebGPURenderPassDescriptorLike): WebGPURenderPassEncoderLike;
  copyTextureToBuffer?(source: WebGPUImageCopyTextureLike, destination: WebGPUImageCopyBufferLike, size: WebGPUExtent3DLike): void;
  finish(): unknown;
}

export interface WebGPUImageCopyTextureLike {
  readonly texture: WebGPUTextureLike;
  readonly mipLevel?: number;
  readonly origin?: {
    readonly x?: number;
    readonly y?: number;
    readonly z?: number;
  };
}

export interface WebGPUImageCopyExternalImageLike {
  readonly source: TexImageSource;
  readonly origin?: {
    readonly x?: number;
    readonly y?: number;
  };
  readonly flipY?: boolean;
}

export interface WebGPUImageCopyBufferLike {
  readonly buffer: WebGPUBufferLike;
  readonly bytesPerRow: number;
  readonly rowsPerImage?: number;
}

export interface WebGPUImageDataLayoutLike {
  readonly offset?: number;
  readonly bytesPerRow: number;
  readonly rowsPerImage?: number;
}

export type WebGPUExtent3DLike =
  | readonly [number, number, number?]
  | {
    readonly width: number;
    readonly height: number;
    readonly depthOrArrayLayers?: number;
  };

export interface WebGPURenderPassDescriptorLike {
  readonly label?: string;
  readonly colorAttachments: readonly [{
    readonly view: unknown;
    readonly clearValue?: readonly [number, number, number, number];
    readonly loadOp: "clear" | "load";
    readonly storeOp: "store";
  }];
  readonly depthStencilAttachment?: {
    readonly view: unknown;
    readonly depthClearValue?: number;
    readonly depthLoadOp: "clear" | "load";
    readonly depthStoreOp: "store";
  };
}

export interface WebGPURenderPassEncoderLike {
  setPipeline(pipeline: WebGPURenderPipelineLike): void;
  setVertexBuffer(slot: number, buffer: WebGPUBufferLike): void;
  setBindGroup?(index: number, bindGroup: WebGPUBindGroupLike): void;
  setIndexBuffer?(buffer: WebGPUBufferLike, indexFormat: "uint16" | "uint32"): void;
  draw(vertexCount: number, instanceCount?: number, firstVertex?: number): void;
  drawIndexed?(indexCount: number, instanceCount?: number, firstIndex?: number): void;
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
    public readonly nativeByteLength: number,
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

type NativeUniformLayout =
  | "generated-basic"
  | "generated-texture"
  | "generated-pbr"
  | "generated-textured-pbr"
  | "generated-instanced-pbr"
  | "generated-skinned-unlit"
  | "generated-morph-unlit"
  | "passthrough";

class WebGPUShaderProgram implements RenderShaderProgram {
  public disposed = false;
  public readonly renderPipelines = new Map<string, WebGPURenderPipelineLike>();

  constructor(
    public readonly id: number,
    public readonly label: string,
    public readonly marker: string,
    public readonly reflection: ShaderReflection,
    public readonly modules: readonly unknown[],
    public readonly entryPoints: readonly [string, string],
    public readonly nativeUniformLayout: NativeUniformLayout
  ) {}

  dispose(): void {
    this.disposed = true;
  }
}

class WebGPURenderTarget implements RenderTarget {
  public disposed = false;
  public nativeNeedsClear = true;
  public nativeClearColor: readonly [number, number, number, number] = [0, 0, 0, 1];
  public readonly colorPixels: Uint8Array;
  public readonly colorFloatPixels: Float32Array | null;
  public readonly depthPixels: Float32Array | null;

  constructor(
    public readonly id: number,
    public readonly width: number,
    public readonly height: number,
    public readonly label: string,
    public readonly colorTexture: Texture,
    public readonly depthTexture: Texture | undefined,
    public readonly nativeTexture: WebGPUTextureLike | null,
    public readonly nativeView: unknown | null,
    public readonly nativeDepthTexture: WebGPUTextureLike | null,
    public readonly nativeDepthView: unknown | null,
    public readonly hasDepth: boolean
  ) {
    this.colorPixels = new Uint8Array(width * height * 4);
    this.colorFloatPixels = colorTexture.format === "rgba16f" || colorTexture.format === "rgba32f"
      ? new Float32Array(width * height * 4)
      : null;
    this.depthPixels = hasDepth ? new Float32Array(width * height).fill(1) : null;
  }

  dispose(): void {
    if (!this.disposed) {
      this.nativeTexture?.destroy();
      this.nativeDepthTexture?.destroy();
      this.colorTexture.dispose();
      this.depthTexture?.dispose();
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
  private nativeTextureBindings = 0;
  private nativeGeneratedBasicSubmissions = 0;
  private nativeGeneratedTextureSubmissions = 0;
  private nativePassthroughSubmissions = 0;
  private nativePbrSubmissions = 0;
  private nativeInstancedSubmissions = 0;
  private nativeSkinnedSubmissions = 0;
  private nativeMorphSubmissions = 0;
  private nativeEnvironmentBindings = 0;
  private nativeShadowMapBindings = 0;
  private canvasSubmissions = 0;
  private readonly buffers = new Set<WebGPURenderBuffer>();
  private readonly shaders = new Set<WebGPUShaderProgram>();
  private readonly renderTargets = new Set<WebGPURenderTarget>();
  private readonly nativeSampledTextures = new Map<Texture, { readonly texture: WebGPUTextureLike; readonly view: unknown }>();
  private activeRenderTarget: WebGPURenderTarget | null = null;
  private backbufferPixels: Uint8Array | null = null;
  private backbufferWidth = 0;
  private backbufferHeight = 0;

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
    const supportsNativeTextureReadback = hasNativeTextureReadback(device);
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
        "postprocess-presentation",
        "hdr-render-targets",
        "float-readback",
        "draw-validation",
        "rasterization",
        "depth-render-targets",
        "spot-shadow-maps",
        "point-shadow-maps",
        "hdr-image-based-lighting",
        ...(supportsNativeRenderPipeline ? ["native-render-pipeline" as const] : []),
        ...(hasNativeSampledTextureBinding(device) ? ["native-sampled-textures" as const] : []),
        ...(supportsNativeTextureReadback ? ["native-texture-readback" as const] : []),
        ...(supportsCanvasSurface ? ["canvas-surface" as const] : [])
      ],
      limitations: [
        "Synchronous readPixels remains CPU-shadowed for deterministic tests; use readPixelsAsync for native WebGPU texture-to-buffer readback when available.",
        "Renderer.render() stays synchronous and uses CPU-shadowed readback for deterministic compatibility; use Renderer.renderAsync() when renderer-owned WebGPU postprocess must read native render targets.",
        "Sampleable WebGPU depth render-target textures are not advertised until native texture binding and depth readback evidence exists.",
        ...(supportsNativeRenderPipeline ? [] : ["native WebGPU render-pipeline submission requires createRenderPipeline, createTexture, and createCommandEncoder."]),
        ...(hasNativeSampledTextureBinding(device) ? [] : ["native WebGPU sampled texture binding requires createSampler, createTexture, and queue.writeTexture."]),
        ...(supportsNativeTextureReadback ? [] : ["native WebGPU texture readback requires copyTextureToBuffer plus mappable readback buffers."]),
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
      label: `aura3d-${usage}-${this.nextId}`,
      size: alignTo(byteLength, 4),
      usage: bufferUsageFlags(usage)
    });
    const buffer = new WebGPURenderBuffer(this.nextId++, usage, byteLength, alignTo(byteLength, 4), handle, initialData);
    this.buffers.add(buffer);
    if (initialData) writeAlignedQueueBuffer(this.device.queue, handle, 0, initialData, buffer.nativeByteLength);
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
    writeAlignedQueueBuffer(this.device.queue, webgpuBuffer.handle, byteOffset, webgpuBuffer.bytes.subarray(byteOffset, byteOffset + data.byteLength), webgpuBuffer.nativeByteLength);
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
    const shader = new WebGPUShaderProgram(
      this.nextId++,
      sources.label,
      sources.marker,
      reflectShaderSources(sources),
      modules,
      nativeSources.entryPoints,
      nativeSources.uniformLayout
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
    const nativeTexture = this.device.createTexture?.({
      label: descriptor.label ?? "aura3d-webgpu-render-target",
      size: [descriptor.width, descriptor.height],
      format: webgpuTextureFormat(descriptor.format ?? "rgba8"),
      usage: TEXTURE_USAGE.RENDER_ATTACHMENT | TEXTURE_USAGE.COPY_SRC | TEXTURE_USAGE.COPY_DST | TEXTURE_USAGE.TEXTURE_BINDING
    }) ?? null;
    const hasDepth = descriptor.depth !== false;
    const hasSampleableDepth = descriptor.depth === "texture";
    const nativeDepthTexture = hasDepth
      ? this.device.createTexture?.({
        label: `${descriptor.label ?? "aura3d-webgpu-render-target"}-depth`,
        size: [descriptor.width, descriptor.height],
        format: DEPTH_TEXTURE_FORMAT,
        usage: TEXTURE_USAGE.RENDER_ATTACHMENT | (hasSampleableDepth ? TEXTURE_USAGE.TEXTURE_BINDING : 0)
      }) ?? null
      : null;
    const depthTexture = hasSampleableDepth
      ? new Texture({ width: descriptor.width, height: descriptor.height, format: "depth24", label: `${descriptor.label ?? "render-target"}-depth` })
      : undefined;
    const target = new WebGPURenderTarget(
      this.nextId++,
      descriptor.width,
      descriptor.height,
      descriptor.label ?? "render-target",
      new Texture({ width: descriptor.width, height: descriptor.height, format: descriptor.format ?? "rgba8", label: descriptor.label ?? "render-target-color" }),
      depthTexture,
      nativeTexture,
      nativeTexture?.createView() ?? null,
      nativeDepthTexture,
      nativeDepthTexture?.createView() ?? null,
      hasDepth
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

  writeRenderTargetPixels(target: RenderTarget, pixels: Uint8Array): void {
    this.assertAlive();
    const webgpuTarget = this.requireRenderTarget(target);
    const expectedLength = webgpuTarget.width * webgpuTarget.height * 4;
    if (pixels.length !== expectedLength) {
      throw new RenderDeviceError("Render target pixel upload length does not match target dimensions", "INVALID_RENDER_TARGET_PIXELS", {
        targetId: target.id,
        expectedLength,
        actualLength: pixels.length
      });
    }
    webgpuTarget.colorPixels.set(pixels);
    if (webgpuTarget.colorFloatPixels) {
      for (let index = 0; index < pixels.length; index += 1) {
        webgpuTarget.colorFloatPixels[index] = pixels[index]! / 255;
      }
    }
    if (webgpuTarget.nativeTexture && webgpuTarget.colorTexture.format === "rgba8" && hasNativeTextureUpload(this.device)) {
      this.device.queue.writeTexture(
        { texture: webgpuTarget.nativeTexture },
        pixels,
        { bytesPerRow: webgpuTarget.width * 4, rowsPerImage: webgpuTarget.height },
        { width: webgpuTarget.width, height: webgpuTarget.height, depthOrArrayLayers: 1 }
      );
      webgpuTarget.nativeNeedsClear = false;
    }
  }

  presentRenderTarget(source: RenderTarget): void {
    this.assertAlive();
    const target = this.requireRenderTarget(source);
    if (target.colorTexture.format !== "rgba8") {
      throw new RenderDeviceError("WebGPU backbuffer presentation currently requires rgba8 source pixels", "PRESENT_FORMAT_UNSUPPORTED", {
        source: source.label,
        format: target.colorTexture.format
      });
    }
    this.backbufferPixels = target.colorPixels.slice();
    this.backbufferWidth = target.width;
    this.backbufferHeight = target.height;
    this.activeRenderTarget = null;
    this.canvasSubmissions += 1;
  }

  readPixels(x: number, y: number, width: number, height: number): Uint8Array {
    this.assertAlive();
    if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width <= 0 || height <= 0) {
      throw new RenderDeviceError("Readback rectangle must be positive and in bounds", "INVALID_READBACK_RECT", { x, y, width, height });
    }
    const boundsWidth = this.activeRenderTarget?.width ?? (this.backbufferPixels ? this.backbufferWidth : this.viewportWidth);
    const boundsHeight = this.activeRenderTarget?.height ?? (this.backbufferPixels ? this.backbufferHeight : this.viewportHeight);
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
      if (this.backbufferPixels) {
        for (let row = 0; row < height; row += 1) {
          const sourceOffset = ((y + row) * this.backbufferWidth + x) * 4;
          const destOffset = row * width * 4;
          output.set(this.backbufferPixels.subarray(sourceOffset, sourceOffset + width * 4), destOffset);
        }
        return output;
      }
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

  async readPixelsAsync(x: number, y: number, width: number, height: number): Promise<Uint8Array> {
    this.assertAlive();
    if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width <= 0 || height <= 0) {
      throw new RenderDeviceError("Readback rectangle must be positive and in bounds", "INVALID_READBACK_RECT", { x, y, width, height });
    }
    const target = this.activeRenderTarget;
    if (!target || !target.nativeTexture) {
      throw new RenderDeviceError("Native WebGPU readback requires an active native render target", "NATIVE_READBACK_TARGET_MISSING", {
        x,
        y,
        width,
        height,
        renderTarget: target?.label ?? null
      });
    }
    if (target.colorTexture.format !== "rgba8") {
      throw new RenderDeviceError("Native WebGPU readback currently supports rgba8 render targets", "NATIVE_READBACK_FORMAT_UNSUPPORTED", {
        format: target.colorTexture.format,
        renderTarget: target.label
      });
    }
    if (x + width > target.width || y + height > target.height) {
      throw new RenderDeviceError("Readback rectangle exceeds framebuffer bounds", "READBACK_OUT_OF_BOUNDS", {
        x,
        y,
        width,
        height,
        boundsWidth: target.width,
        boundsHeight: target.height
      });
    }
    if (!hasNativeTextureReadback(this.device)) {
      throw new RenderDeviceError("WebGPU device does not expose native texture-to-buffer readback", "NATIVE_READBACK_UNSUPPORTED");
    }
    this.flushNativeRenderTargetClear(target);

    const bytesPerPixel = 4;
    const unpaddedBytesPerRow = width * bytesPerPixel;
    const bytesPerRow = alignTo(unpaddedBytesPerRow, 256);
    const bufferSize = bytesPerRow * height;
    const readback = this.device.createBuffer({
      label: `${target.label}-native-readback`,
      size: bufferSize,
      usage: BUFFER_USAGE.MAP_READ | BUFFER_USAGE.COPY_DST
    });
    const encoder = this.device.createCommandEncoder({ label: `${target.label}-native-readback-encoder` });
    const copyTextureToBuffer = encoder.copyTextureToBuffer;
    if (!copyTextureToBuffer) {
      readback.destroy();
      throw new RenderDeviceError("WebGPU command encoder does not expose texture-to-buffer copy", "NATIVE_READBACK_UNSUPPORTED");
    }
    copyTextureToBuffer.call(
      encoder,
      { texture: target.nativeTexture, origin: { x, y, z: 0 } },
      { buffer: readback, bytesPerRow, rowsPerImage: height },
      { width, height, depthOrArrayLayers: 1 }
    );
    this.device.queue.submit([encoder.finish()]);

    try {
      const mapAsync = readback.mapAsync;
      const getMappedRange = readback.getMappedRange;
      const unmap = readback.unmap;
      if (!mapAsync || !getMappedRange || !unmap) {
        throw new RenderDeviceError("WebGPU readback buffer does not expose mapped readback APIs", "NATIVE_READBACK_UNSUPPORTED");
      }
      await mapAsync.call(readback, MAP_MODE.READ);
      const mapped = new Uint8Array(getMappedRange.call(readback));
      const output = new Uint8Array(width * height * bytesPerPixel);
      for (let row = 0; row < height; row += 1) {
        const sourceOffset = row * bytesPerRow;
        const destOffset = (height - 1 - row) * unpaddedBytesPerRow;
        output.set(mapped.subarray(sourceOffset, sourceOffset + unpaddedBytesPerRow), destOffset);
      }
      unmap.call(readback);
      return output;
    } finally {
      readback.destroy();
    }
  }

  async readFloatPixelsAsync(x: number, y: number, width: number, height: number): Promise<Float32Array> {
    this.assertAlive();
    if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width <= 0 || height <= 0) {
      throw new RenderDeviceError("Float readback rectangle must be positive and in bounds", "INVALID_READBACK_RECT", { x, y, width, height });
    }
    const target = this.activeRenderTarget;
    if (!target || !target.nativeTexture) {
      throw new RenderDeviceError("Native WebGPU float readback requires an active native render target", "NATIVE_READBACK_TARGET_MISSING", {
        x,
        y,
        width,
        height,
        renderTarget: target?.label ?? null
      });
    }
    if (x + width > target.width || y + height > target.height) {
      throw new RenderDeviceError("Float readback rectangle exceeds framebuffer bounds", "READBACK_OUT_OF_BOUNDS", {
        x,
        y,
        width,
        height,
        boundsWidth: target.width,
        boundsHeight: target.height
      });
    }
    if (!hasNativeTextureReadback(this.device)) {
      throw new RenderDeviceError("WebGPU device does not expose native texture-to-buffer readback", "NATIVE_READBACK_UNSUPPORTED");
    }
    this.flushNativeRenderTargetClear(target);

    const format = target.colorTexture.format;
    const bytesPerPixel = format === "rgba32f" ? 16 : format === "rgba16f" ? 8 : 4;
    const unpaddedBytesPerRow = width * bytesPerPixel;
    const bytesPerRow = alignTo(unpaddedBytesPerRow, 256);
    const bufferSize = bytesPerRow * height;
    const readback = this.device.createBuffer({
      label: `${target.label}-native-float-readback`,
      size: bufferSize,
      usage: BUFFER_USAGE.MAP_READ | BUFFER_USAGE.COPY_DST
    });
    const encoder = this.device.createCommandEncoder({ label: `${target.label}-native-float-readback-encoder` });
    const copyTextureToBuffer = encoder.copyTextureToBuffer;
    if (!copyTextureToBuffer) {
      readback.destroy();
      throw new RenderDeviceError("WebGPU command encoder does not expose texture-to-buffer copy", "NATIVE_READBACK_UNSUPPORTED");
    }
    copyTextureToBuffer.call(
      encoder,
      { texture: target.nativeTexture, origin: { x, y, z: 0 } },
      { buffer: readback, bytesPerRow, rowsPerImage: height },
      { width, height, depthOrArrayLayers: 1 }
    );
    this.device.queue.submit([encoder.finish()]);

    try {
      const mapAsync = readback.mapAsync;
      const getMappedRange = readback.getMappedRange;
      const unmap = readback.unmap;
      if (!mapAsync || !getMappedRange || !unmap) {
        throw new RenderDeviceError("WebGPU readback buffer does not expose mapped readback APIs", "NATIVE_READBACK_UNSUPPORTED");
      }
      await mapAsync.call(readback, MAP_MODE.READ);
      const mapped = new Uint8Array(getMappedRange.call(readback));
      const view = new DataView(mapped.buffer, mapped.byteOffset, mapped.byteLength);
      const output = new Float32Array(width * height * 4);
      for (let row = 0; row < height; row += 1) {
        const destRow = height - 1 - row;
        for (let column = 0; column < width; column += 1) {
          const sourceOffset = row * bytesPerRow + column * bytesPerPixel;
          const destOffset = (destRow * width + column) * 4;
          if (format === "rgba32f") {
            output[destOffset] = view.getFloat32(sourceOffset, true);
            output[destOffset + 1] = view.getFloat32(sourceOffset + 4, true);
            output[destOffset + 2] = view.getFloat32(sourceOffset + 8, true);
            output[destOffset + 3] = view.getFloat32(sourceOffset + 12, true);
          } else if (format === "rgba16f") {
            output[destOffset] = halfFloatToNumber(view.getUint16(sourceOffset, true));
            output[destOffset + 1] = halfFloatToNumber(view.getUint16(sourceOffset + 2, true));
            output[destOffset + 2] = halfFloatToNumber(view.getUint16(sourceOffset + 4, true));
            output[destOffset + 3] = halfFloatToNumber(view.getUint16(sourceOffset + 6, true));
          } else {
            output[destOffset] = (mapped[sourceOffset] ?? 0) / 255;
            output[destOffset + 1] = (mapped[sourceOffset + 1] ?? 0) / 255;
            output[destOffset + 2] = (mapped[sourceOffset + 2] ?? 0) / 255;
            output[destOffset + 3] = (mapped[sourceOffset + 3] ?? 0) / 255;
          }
        }
      }
      unmap.call(readback);
      return output;
    } finally {
      readback.destroy();
    }
  }

  readFloatPixels(x: number, y: number, width: number, height: number): Float32Array {
    this.assertAlive();
    if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width <= 0 || height <= 0) {
      throw new RenderDeviceError("Float readback rectangle must be positive and in bounds", "INVALID_READBACK_RECT", { x, y, width, height });
    }
    const boundsWidth = this.activeRenderTarget?.width ?? (this.backbufferPixels ? this.backbufferWidth : this.viewportWidth);
    const boundsHeight = this.activeRenderTarget?.height ?? (this.backbufferPixels ? this.backbufferHeight : this.viewportHeight);
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
    const output = new Float32Array(width * height * 4);
    const target = this.activeRenderTarget;
    if (!target) {
      if (this.backbufferPixels) {
        const bytes = this.readPixels(x, y, width, height);
        for (let index = 0; index < bytes.length; index += 1) output[index] = bytes[index]! / 255;
        return output;
      }
      for (let index = 0; index < output.length; index += 4) {
        output[index] = this.clearColor[0];
        output[index + 1] = this.clearColor[1];
        output[index + 2] = this.clearColor[2];
        output[index + 3] = this.clearColor[3];
      }
      return output;
    }
    if (target.colorFloatPixels) {
      for (let row = 0; row < height; row += 1) {
        const sourceOffset = ((y + row) * target.width + x) * 4;
        const destOffset = row * width * 4;
        output.set(target.colorFloatPixels.subarray(sourceOffset, sourceOffset + width * 4), destOffset);
      }
      return output;
    }
    const bytes = this.readPixels(x, y, width, height);
    for (let index = 0; index < bytes.length; index += 1) output[index] = bytes[index]! / 255;
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
      this.clearActiveRenderTarget(color);
    }
  }

  clearRenderTarget(color: readonly [number, number, number, number]): void {
    this.assertFrame();
    if (!this.activeRenderTarget) {
      this.clearColor = color;
      return;
    }
    this.clearActiveRenderTarget(color);
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
    if (command.firstVertex !== undefined && (!Number.isInteger(command.firstVertex) || command.firstVertex < 0)) {
      throw new RenderDeviceError("Draw command firstVertex must be a non-negative integer", "INVALID_DRAW_COMMAND", {
        firstVertex: command.firstVertex,
        label: command.label
      });
    }
    if (command.indexBuffer && (command.indexCount === undefined || command.indexCount <= 0)) {
      throw new RenderDeviceError("Indexed draw command must have a positive index count", "INVALID_DRAW_COMMAND", {
        indexCount: command.indexCount,
        label: command.label
      });
    }
    if (command.firstIndex !== undefined && (!Number.isInteger(command.firstIndex) || command.firstIndex < 0)) {
      throw new RenderDeviceError("Draw command firstIndex must be a non-negative integer", "INVALID_DRAW_COMMAND", {
        firstIndex: command.firstIndex,
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
      ["nativeTextureBindings", this.nativeTextureBindings],
      ["nativeGeneratedBasicSubmissions", this.nativeGeneratedBasicSubmissions],
      ["nativeGeneratedTextureSubmissions", this.nativeGeneratedTextureSubmissions],
      ["nativePassthroughSubmissions", this.nativePassthroughSubmissions],
      ["nativePbrSubmissions", this.nativePbrSubmissions],
      ["nativeInstancedSubmissions", this.nativeInstancedSubmissions],
      ["nativeSkinnedSubmissions", this.nativeSkinnedSubmissions],
      ["nativeMorphSubmissions", this.nativeMorphSubmissions],
      ["nativeEnvironmentBindings", this.nativeEnvironmentBindings],
      ["nativeShadowMapBindings", this.nativeShadowMapBindings],
      ["canvasSubmissions", this.canvasSubmissions]
    ]);
  }

  getDiagnostics(): RenderDeviceDiagnostics {
    const liveRenderTargets = [...this.renderTargets].filter((target) => !target.disposed);
    const bufferBytes = [...this.buffers].filter((buffer) => !buffer.disposed).reduce((total, buffer) => total + buffer.byteLength, 0);
    const textureBytes = liveRenderTargets.reduce((total, target) => total + target.colorTexture.byteLength + (target.depthTexture?.byteLength ?? 0), 0);
    return {
      drawCalls: this.drawCalls,
      buffers: [...this.buffers].filter((buffer) => !buffer.disposed).length,
      shaders: [...this.shaders].filter((shader) => !shader.disposed).length,
      renderTargets: liveRenderTargets.length,
      textures: liveRenderTargets.length,
      bufferBytes,
      textureBytes,
      approximateGpuMemoryBytes: bufferBytes + textureBytes,
      compressedTextures: 0,
      compressedTextureBytes: 0,
      textureFallbacks: 0,
      textureFallbackBytes: 0,
      disposedBuffers: [...this.buffers].filter((buffer) => buffer.disposed).length,
      disposedShaders: [...this.shaders].filter((shader) => shader.disposed).length,
      disposedRenderTargets: [...this.renderTargets].filter((target) => target.disposed).length,
      disposedTextures: [...this.renderTargets].reduce((total, target) => total + (target.colorTexture.disposed ? 1 : 0) + (target.depthTexture?.disposed ? 1 : 0), 0),
      nativeSubmissions: this.nativeSubmissions,
      nativeTextureBindings: this.nativeTextureBindings,
      nativeGeneratedBasicSubmissions: this.nativeGeneratedBasicSubmissions,
      nativeGeneratedTextureSubmissions: this.nativeGeneratedTextureSubmissions,
      nativePassthroughSubmissions: this.nativePassthroughSubmissions,
      nativePbrSubmissions: this.nativePbrSubmissions,
      nativeInstancedSubmissions: this.nativeInstancedSubmissions,
      nativeSkinnedSubmissions: this.nativeSkinnedSubmissions,
      nativeMorphSubmissions: this.nativeMorphSubmissions,
      nativeEnvironmentBindings: this.nativeEnvironmentBindings,
      nativeShadowMapBindings: this.nativeShadowMapBindings,
      lastError: this.lastError,
      contextLost: this.contextLost
    };
  }

  dispose(): void {
    if (this.disposed) return;
    for (const buffer of this.buffers) buffer.dispose();
    for (const shader of this.shaders) shader.dispose();
    for (const target of this.renderTargets) target.dispose();
    for (const resource of this.nativeSampledTextures.values()) resource.texture.destroy();
    this.nativeSampledTextures.clear();
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

  private requireRenderTarget(target: RenderTarget): WebGPURenderTarget {
    if (!(target instanceof WebGPURenderTarget) || !this.renderTargets.has(target)) {
      throw new RenderDeviceError("Render target was not created by this WebGPU device", "FOREIGN_RESOURCE", {
        targetId: target.id
      });
    }
    if (target.disposed) {
      throw new RenderDeviceError("Cannot use a disposed render target", "DISPOSED_RESOURCE", { targetId: target.id });
    }
    return target;
  }

  private rasterizeDraw(command: DrawCommand, vertexBuffer: WebGPURenderBuffer): void {
    if (!this.activeRenderTarget || !command.vertexFormat?.hasAttribute("position")) return;
    const position = command.vertexFormat.getAttribute("position");
    const colorAttribute = command.vertexFormat.hasAttribute("color") ? command.vertexFormat.getAttribute("color") : null;
    const uvAttribute = command.vertexFormat.hasAttribute("uv") ? command.vertexFormat.getAttribute("uv") : null;
    if (position.components < 2) return;
    const indices = this.indicesFor(command);
    const color = uniformColor(command.uniforms);
    const texture = uniformBaseColorTextureBinding(command.uniforms);
    const shadow = uniformForwardShadow(command.uniforms);
    const instanceMatrices = uniformRasterMatrices(command.uniforms, command.instanceCount ?? 1);
    const modelMatrices = uniformRasterModelMatrices(command.uniforms, command.instanceCount ?? 1);
    const depthTest = command.renderState?.depthTest !== false && this.activeRenderTarget.depthPixels !== null;
    const depthWrite = command.renderState?.depthWrite !== false;
    for (let instanceIndex = 0; instanceIndex < instanceMatrices.length; instanceIndex += 1) {
      const matrix = instanceMatrices[instanceIndex] ?? identityMatrix();
      const modelMatrix = modelMatrices[instanceIndex] ?? identityMatrix();
      if (command.topology === "triangles") {
        for (let offset = 0; offset + 2 < indices.length; offset += 3) {
          const indexA = indices[offset]!;
          const indexB = indices[offset + 1]!;
          const indexC = indices[offset + 2]!;
          const localA = readMorphedPosition(vertexBuffer.bytes, command.vertexFormat.stride, position.offset, indexA, command.uniforms);
          const localB = readMorphedPosition(vertexBuffer.bytes, command.vertexFormat.stride, position.offset, indexB, command.uniforms);
          const localC = readMorphedPosition(vertexBuffer.bytes, command.vertexFormat.stride, position.offset, indexC, command.uniforms);
          const a = transformPosition(localA, matrix);
          const b = transformPosition(localB, matrix);
          const c = transformPosition(localC, matrix);
          const worldA = transformPosition(localA, modelMatrix);
          const worldB = transformPosition(localB, modelMatrix);
          const worldC = transformPosition(localC, modelMatrix);
          const colorA = readVertexColor(vertexBuffer.bytes, command.vertexFormat.stride, colorAttribute?.offset, indexA);
          const colorB = readVertexColor(vertexBuffer.bytes, command.vertexFormat.stride, colorAttribute?.offset, indexB);
          const colorC = readVertexColor(vertexBuffer.bytes, command.vertexFormat.stride, colorAttribute?.offset, indexC);
          const uvA = readVertexUv(vertexBuffer.bytes, command.vertexFormat.stride, uvAttribute?.offset, indexA);
          const uvB = readVertexUv(vertexBuffer.bytes, command.vertexFormat.stride, uvAttribute?.offset, indexB);
          const uvC = readVertexUv(vertexBuffer.bytes, command.vertexFormat.stride, uvAttribute?.offset, indexC);
          rasterizeTriangle(this.activeRenderTarget, a, b, c, worldA, worldB, worldC, color, colorA, colorB, colorC, uvA, uvB, uvC, texture, shadow, depthTest, depthWrite);
        }
      } else if (command.topology === "lines") {
        for (let offset = 0; offset + 1 < indices.length; offset += 2) {
          const indexA = indices[offset]!;
          const indexB = indices[offset + 1]!;
          const a = transformPosition(readMorphedPosition(vertexBuffer.bytes, command.vertexFormat.stride, position.offset, indexA, command.uniforms), matrix);
          const b = transformPosition(readMorphedPosition(vertexBuffer.bytes, command.vertexFormat.stride, position.offset, indexB, command.uniforms), matrix);
          const colorA = readVertexColor(vertexBuffer.bytes, command.vertexFormat.stride, colorAttribute?.offset, indexA);
          const colorB = readVertexColor(vertexBuffer.bytes, command.vertexFormat.stride, colorAttribute?.offset, indexB);
          rasterizeLine(this.activeRenderTarget, a, b, color, colorA, colorB, depthTest, depthWrite);
        }
      } else {
        for (const index of indices) {
          const point = transformPosition(readMorphedPosition(vertexBuffer.bytes, command.vertexFormat.stride, position.offset, index, command.uniforms), matrix);
          const vertexColor = readVertexColor(vertexBuffer.bytes, command.vertexFormat.stride, colorAttribute?.offset, index);
          rasterizePoint(this.activeRenderTarget, point, multiplyColor(color, vertexColor), depthTest, depthWrite);
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
    const targetFormat = this.activeRenderTarget ? webgpuTextureFormat(this.activeRenderTarget.colorTexture.format) : this.presentationFormat;
    const vertexBuffers = command.vertexFormat ? [vertexBufferLayout(command.vertexFormat)] : undefined;
    const shouldClear = this.activeRenderTarget ? this.activeRenderTarget.nativeNeedsClear : this.drawCalls === 0;
    const depthEnabled = this.activeRenderTarget?.nativeDepthView !== null &&
      this.activeRenderTarget?.nativeDepthView !== undefined &&
      command.renderState?.depthTest !== false;
    const depthWriteEnabled = command.renderState?.depthWrite ?? true;
    const depthCompare = command.renderState?.depthCompare ?? "less-equal";
    const blendEnabled = command.renderState?.blend === true;
    const pipelineKey = `${shader.nativeUniformLayout}:${topology}:${targetFormat}:${blendEnabled ? "blend" : "opaque"}:${depthEnabled ? `${depthWriteEnabled}:${depthCompare}` : "nodepth"}:${command.vertexFormat?.stride ?? 0}:${command.vertexFormat?.attributes.map((attribute) => `${attribute.shaderLocation}/${attribute.offset}/${attribute.components}`).join(",") ?? "none"}`;
    let pipeline = shader.renderPipelines.get(pipelineKey);
    if (!pipeline) {
      pipeline = this.device.createRenderPipeline({
        label: `${shader.label}-pipeline`,
        layout: "auto",
        vertex: { module: vertexModule, entryPoint: shader.entryPoints[0], ...(vertexBuffers ? { buffers: vertexBuffers } : {}) },
        fragment: {
          module: fragmentModule,
          entryPoint: shader.entryPoints[1],
          targets: [{
            format: targetFormat,
            ...(blendEnabled
              ? {
                  blend: {
                    color: { srcFactor: "src-alpha", dstFactor: "one-minus-src-alpha", operation: "add" },
                    alpha: { srcFactor: "one", dstFactor: "one-minus-src-alpha", operation: "add" }
                  }
                }
              : {})
          }]
        },
        primitive: { topology },
        ...(depthEnabled
          ? {
              depthStencil: {
                format: DEPTH_TEXTURE_FORMAT,
                depthWriteEnabled,
                depthCompare
              }
            }
          : {})
      });
      shader.renderPipelines.set(pipelineKey, pipeline);
    }
    const encoder = this.device.createCommandEncoder({ label: `${command.label ?? "draw"}-encoder` });
    const uniformBuffer = usesNativeDrawUniforms(shader.nativeUniformLayout) ? this.createNativeDrawUniformBuffer(command) : null;
    const sampledTexture = shader.nativeUniformLayout === "generated-texture" ? this.createNativeSampledTextureBinding(uniformBaseColorTextureBinding(command.uniforms)) : null;
    const materialTextures = usesNativePbrTextureBindings(shader.nativeUniformLayout) ? this.createNativePbrTextureBindings(command) : null;
    if (shader.nativeUniformLayout === "generated-texture" && !sampledTexture) {
      uniformBuffer?.destroy();
      return;
    }
    if (usesNativePbrTextureBindings(shader.nativeUniformLayout) && !materialTextures) {
      uniformBuffer?.destroy();
      return;
    }
    const bindGroup = uniformBuffer && pipeline.getBindGroupLayout && this.device.createBindGroup
      ? this.device.createBindGroup({
          label: `${command.label ?? "draw"}-draw-bind-group`,
          layout: pipeline.getBindGroupLayout(0),
          entries: [
            { binding: 0, resource: { buffer: uniformBuffer } },
            ...(sampledTexture ? [
              { binding: 1, resource: sampledTexture.sampler },
              { binding: 2, resource: sampledTexture.view }
            ] : []),
            ...(materialTextures ? [
              { binding: 1, resource: materialTextures.base.sampler },
              { binding: 2, resource: materialTextures.base.view },
              { binding: 3, resource: materialTextures.environment.sampler },
              { binding: 4, resource: materialTextures.environment.view },
              { binding: 5, resource: materialTextures.brdf.sampler },
              { binding: 6, resource: materialTextures.brdf.view },
              { binding: 7, resource: materialTextures.shadow.sampler },
              { binding: 8, resource: materialTextures.shadow.view },
              { binding: 9, resource: materialTextures.normal.sampler },
              { binding: 10, resource: materialTextures.normal.view },
              { binding: 11, resource: materialTextures.metallicRoughness.sampler },
              { binding: 12, resource: materialTextures.metallicRoughness.view },
              { binding: 13, resource: materialTextures.occlusion.sampler },
              { binding: 14, resource: materialTextures.occlusion.view }
            ] : [])
          ]
        })
      : null;
    const pass = encoder.beginRenderPass({
      label: `${command.label ?? "draw"}-pass`,
      colorAttachments: [{
        view: nativeView,
        clearValue: this.activeRenderTarget?.nativeClearColor ?? this.clearColor,
        loadOp: shouldClear ? "clear" : "load",
        storeOp: "store"
      }],
      ...(depthEnabled
        ? {
            depthStencilAttachment: {
              view: this.activeRenderTarget!.nativeDepthView,
              depthClearValue: 1,
              depthLoadOp: shouldClear ? "clear" as const : "load" as const,
              depthStoreOp: "store" as const
            }
          }
        : {})
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
      pass.drawIndexed(command.indexCount ?? this.indicesFor(command).length, command.instanceCount ?? 1, command.firstIndex ?? 0);
    } else {
      pass.draw(command.vertexCount, command.instanceCount ?? 1, command.firstVertex ?? 0);
    }
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    if (this.activeRenderTarget) this.activeRenderTarget.nativeNeedsClear = false;
    uniformBuffer?.destroy();
    this.nativeSubmissions += 1;
    if (sampledTexture) this.nativeTextureBindings += 1;
    if (shader.nativeUniformLayout === "generated-basic") this.nativeGeneratedBasicSubmissions += 1;
    if (shader.nativeUniformLayout === "generated-texture") this.nativeGeneratedTextureSubmissions += 1;
    if (shader.nativeUniformLayout === "passthrough") this.nativePassthroughSubmissions += 1;
    if (shader.nativeUniformLayout === "generated-pbr" || shader.nativeUniformLayout === "generated-textured-pbr" || shader.nativeUniformLayout === "generated-instanced-pbr") this.nativePbrSubmissions += 1;
    if (shader.nativeUniformLayout === "generated-instanced-pbr") this.nativeInstancedSubmissions += 1;
    if (shader.nativeUniformLayout === "generated-skinned-unlit") this.nativeSkinnedSubmissions += 1;
    if (shader.nativeUniformLayout === "generated-morph-unlit") this.nativeMorphSubmissions += 1;
    if (materialTextures?.actualBaseColor) this.nativeTextureBindings += 1;
    if (materialTextures?.actualNormal) this.nativeTextureBindings += 1;
    if (materialTextures?.actualMetallicRoughness) this.nativeTextureBindings += 1;
    if (materialTextures?.actualOcclusion) this.nativeTextureBindings += 1;
    if (materialTextures?.actualEnvironment) this.nativeEnvironmentBindings += 1;
    if (materialTextures?.actualBrdf) this.nativeEnvironmentBindings += 1;
    if (materialTextures?.actualShadow) this.nativeShadowMapBindings += 1;
    if (!this.activeRenderTarget) this.canvasSubmissions += 1;
  }

  private flushNativeRenderTargetClear(target: WebGPURenderTarget): void {
    if (!target.nativeNeedsClear || !target.nativeView || !this.device.createCommandEncoder) return;
    const encoder = this.device.createCommandEncoder({ label: `${target.label}-native-clear` });
    const pass = encoder.beginRenderPass({
      label: `${target.label}-native-clear-pass`,
      colorAttachments: [{
        view: target.nativeView,
        clearValue: target.nativeClearColor,
        loadOp: "clear",
        storeOp: "store"
      }],
      ...(target.nativeDepthView
        ? {
            depthStencilAttachment: {
              view: target.nativeDepthView,
              depthClearValue: 1,
              depthLoadOp: "clear" as const,
              depthStoreOp: "store" as const
            }
          }
        : {})
    });
    pass.end();
    this.device.queue.submit([encoder.finish()]);
    target.nativeNeedsClear = false;
  }

  private createNativeSampledTextureBinding(binding: TextureBinding | null): { readonly view: unknown; readonly sampler: WebGPUSamplerLike; readonly actual: boolean } | null {
    if (!binding?.texture || binding.texture.disposed || !binding.validate().ok || !hasNativeSampledTextureBinding(this.device)) return null;
    const texture = binding.texture;
    let resource = this.nativeSampledTextures.get(texture);
    if (!resource) {
      if (texture.source) {
        if (typeof this.device.queue.copyExternalImageToTexture !== "function") return null;
        const nativeTexture = this.device.createTexture({
          label: texture.label,
          size: { width: texture.width, height: texture.height, depthOrArrayLayers: 1 },
          format: webgpuSampledTextureFormat(texture, "rgba8"),
          usage: TEXTURE_USAGE.TEXTURE_BINDING | TEXTURE_USAGE.COPY_DST,
          mipLevelCount: 1
        });
        this.device.queue.copyExternalImageToTexture(
          { source: texture.source },
          { texture: nativeTexture },
          { width: texture.width, height: texture.height, depthOrArrayLayers: 1 }
        );
        resource = { texture: nativeTexture, view: nativeTexture.createView() };
      } else {
        const sampledTexture = nativeSampledTextureLevels(texture);
        if (!sampledTexture) return null;
        const { levels, format } = sampledTexture;
        const baseLevel = levels[0];
        if (!baseLevel) return null;
        const levelBytesPerPixel = bytesPerPixel(format);
        if (levels.some((level) => level.data.byteLength < level.width * level.height * levelBytesPerPixel)) return null;
        const nativeTexture = this.device.createTexture({
          label: texture.label,
          size: { width: baseLevel.width, height: baseLevel.height, depthOrArrayLayers: 1 },
          format: webgpuSampledTextureFormat(texture, format),
          usage: TEXTURE_USAGE.TEXTURE_BINDING | TEXTURE_USAGE.COPY_DST,
          mipLevelCount: levels.length
        });
        for (const [mipLevel, level] of levels.entries()) {
          this.device.queue.writeTexture(
            { texture: nativeTexture, mipLevel },
            level.data,
            { bytesPerRow: level.width * levelBytesPerPixel, rowsPerImage: level.height },
            { width: level.width, height: level.height, depthOrArrayLayers: 1 }
          );
        }
        resource = { texture: nativeTexture, view: nativeTexture.createView() };
      }
      this.nativeSampledTextures.set(texture, resource);
    }
    return {
      view: resource.view,
      sampler: this.device.createSampler(webgpuSamplerDescriptor(binding.sampler)),
      actual: true
    };
  }

  private createNativePbrTextureBindings(command: DrawCommand): {
    readonly base: { readonly view: unknown; readonly sampler: WebGPUSamplerLike; readonly actual: boolean };
    readonly environment: { readonly view: unknown; readonly sampler: WebGPUSamplerLike; readonly actual: boolean };
    readonly brdf: { readonly view: unknown; readonly sampler: WebGPUSamplerLike; readonly actual: boolean };
    readonly shadow: { readonly view: unknown; readonly sampler: WebGPUSamplerLike; readonly actual: boolean };
    readonly normal: { readonly view: unknown; readonly sampler: WebGPUSamplerLike; readonly actual: boolean };
    readonly metallicRoughness: { readonly view: unknown; readonly sampler: WebGPUSamplerLike; readonly actual: boolean };
    readonly occlusion: { readonly view: unknown; readonly sampler: WebGPUSamplerLike; readonly actual: boolean };
    readonly actualBaseColor: boolean;
    readonly actualEnvironment: boolean;
    readonly actualBrdf: boolean;
    readonly actualShadow: boolean;
    readonly actualNormal: boolean;
    readonly actualMetallicRoughness: boolean;
    readonly actualOcclusion: boolean;
  } | null {
    if (!hasNativeSampledTextureBinding(this.device)) return null;
    const baseBinding = uniformBaseColorTextureBinding(command.uniforms);
    const environmentBinding = uniformTextureBinding(command.uniforms, "u_environmentMapTexture");
    const brdfBinding = uniformTextureBinding(command.uniforms, "u_environmentBrdfLutTexture");
    const shadowBinding = uniformTextureBinding(command.uniforms, "u_shadowMapTexture");
    const normalBinding = uniformTextureBinding(command.uniforms, "u_normalTexture");
    const metallicRoughnessBinding = uniformTextureBinding(command.uniforms, "u_metallicRoughnessTexture");
    const occlusionBinding = uniformTextureBinding(command.uniforms, "u_occlusionTexture");
    const base = this.createNativeSampledTextureBinding(baseBinding) ?? this.createNativeFallbackSampledTextureBinding("white-srgb", [255, 255, 255, 255], "srgb");
    const environment = this.createNativeSampledTextureBinding(environmentBinding) ?? this.createNativeFallbackSampledTextureBinding("environment-srgb", [92, 116, 156, 255], "srgb");
    const brdf = this.createNativeSampledTextureBinding(brdfBinding) ?? this.createNativeFallbackSampledTextureBinding("brdf-linear", [180, 180, 255, 255], "linear");
    const shadow = this.createNativeSampledTextureBinding(shadowBinding) ?? this.createNativeFallbackSampledTextureBinding("shadow-lit-linear", [255, 255, 255, 255], "linear");
    const normal = this.createNativeSampledTextureBinding(normalBinding) ?? this.createNativeFallbackSampledTextureBinding("flat-normal-linear", [128, 128, 255, 255], "linear");
    const metallicRoughness = this.createNativeSampledTextureBinding(metallicRoughnessBinding) ?? this.createNativeFallbackSampledTextureBinding("metallic-roughness-linear", [255, 255, 255, 255], "linear");
    const occlusion = this.createNativeSampledTextureBinding(occlusionBinding) ?? this.createNativeFallbackSampledTextureBinding("occlusion-linear", [255, 255, 255, 255], "linear");
    if (!base || !environment || !brdf || !shadow || !normal || !metallicRoughness || !occlusion) return null;
    return {
      base,
      environment,
      brdf,
      shadow,
      normal,
      metallicRoughness,
      occlusion,
      actualBaseColor: baseBinding !== null && base.actual,
      actualEnvironment: environmentBinding !== null && environment.actual,
      actualBrdf: brdfBinding !== null && brdf.actual,
      actualShadow: shadowBinding !== null && shadow.actual,
      actualNormal: normalBinding !== null && normal.actual,
      actualMetallicRoughness: metallicRoughnessBinding !== null && metallicRoughness.actual,
      actualOcclusion: occlusionBinding !== null && occlusion.actual
    };
  }

  private createNativeFallbackSampledTextureBinding(key: string, rgba: readonly [number, number, number, number], colorSpace: Texture["colorSpace"]): { readonly view: unknown; readonly sampler: WebGPUSamplerLike; readonly actual: boolean } | null {
    if (!hasNativeSampledTextureBinding(this.device)) return null;
    let resource = this.nativeSampledTextures.get(`fallback:${key}` as unknown as Texture);
    if (!resource) {
      const nativeTexture = this.device.createTexture({
        label: `aura3d-native-${key}`,
        size: { width: 1, height: 1, depthOrArrayLayers: 1 },
        format: colorSpace === "srgb" ? "rgba8unorm-srgb" : "rgba8unorm",
        usage: TEXTURE_USAGE.TEXTURE_BINDING | TEXTURE_USAGE.COPY_DST
      });
      this.device.queue.writeTexture(
        { texture: nativeTexture },
        new Uint8Array(rgba),
        { bytesPerRow: 4, rowsPerImage: 1 },
        { width: 1, height: 1, depthOrArrayLayers: 1 }
      );
      resource = { texture: nativeTexture, view: nativeTexture.createView() };
      this.nativeSampledTextures.set(`fallback:${key}` as unknown as Texture, resource);
    }
    return {
      view: resource.view,
      sampler: this.device.createSampler({
        minFilter: "nearest",
        magFilter: "nearest",
        addressModeU: "clamp-to-edge",
        addressModeV: "clamp-to-edge"
      }),
      actual: false
    };
  }

  private createNativeDrawUniformBuffer(command: DrawCommand): WebGPUBufferLike | null {
    if (!this.device.createBindGroup) return null;
    const data = new Float32Array(168);
    data.set(uniformMat4(command.uniforms?.get("u_modelViewProjection")) ?? identityMatrix(), 0);
    data.set(uniformColor(command.uniforms), 16);
    data[20] = uniformNumber(command.uniforms?.get("u_metallic"), 0);
    data[21] = uniformNumber(command.uniforms?.get("u_roughness"), 0.5);
    data[22] = uniformNumber(command.uniforms?.get("u_environmentIntensity"), 0);
    data[23] = uniformNumber(command.uniforms?.get("u_environmentMapTextureIntensity"), 0);
    data[24] = uniformBaseColorTextureBinding(command.uniforms) ? 1 : 0;
    data[25] = uniformNumber(command.uniforms?.get("u_shadowMapEnabled"), 0);
    data[26] = uniformNumber(command.uniforms?.get("u_shadowMapStrength"), 0.65);
    data[27] = uniformTextureBinding(command.uniforms, "u_environmentMapTexture") ? 1 : 0;
    const morphWeights = command.uniforms?.get("u_morphWeights");
    data[28] = morphWeights instanceof Float32Array || Array.isArray(morphWeights) ? Number(morphWeights[0] ?? 0) : 0;
    data[29] = uniformNumber(command.uniforms?.get("u_morphTargetCount"), 0);
    data[30] = uniformNumber(command.uniforms?.get("u_environmentMapTextureMipCount"), 1);
    data[31] = uniformNumber(command.uniforms?.get("u_environmentMapTextureSpecularIntensity"), 0);
    data[128] = uniformNumber(command.uniforms?.get("u_normalTextureEnabled"), 0);
    data[129] = uniformNumber(command.uniforms?.get("u_normalScale"), 1);
    data[130] = uniformNumber(command.uniforms?.get("u_occlusionStrength"), 1);
    data[160] = uniformNumber(command.uniforms?.get("u_alphaCutoff"), 0);
    data[161] = uniformNumber(command.uniforms?.get("u_transmissionFactor"), 0);
    data[162] = uniformNumber(command.uniforms?.get("u_diffuseTransmissionFactor"), 0);
    data.set(uniformVec3(command.uniforms?.get("u_cameraPosition")) ?? [0, 0, 1], 164);
    data[167] = 1;
    const modelMatrix = uniformMat4(command.uniforms?.get("u_modelMatrix")) ?? identityMatrix();
    const instanceMatrixValue = command.uniforms?.get("u_instanceMatrices");
    const instanceMatrixNumbers = instanceMatrixValue instanceof Float32Array || Array.isArray(instanceMatrixValue) ? Array.from(instanceMatrixValue) : [];
    const hasInstanceMatrices = instanceMatrixNumbers.length >= 16 && instanceMatrixNumbers.slice(0, 16).every(Number.isFinite);
    const instanceMatrices = hasInstanceMatrices ? uniformMat4Array(instanceMatrixValue, 4) : [];
    for (let index = 0; index < 4; index += 1) {
      data.set(instanceMatrices[index] ?? (index === 0 ? modelMatrix : identityMatrix()), 32 + index * 16);
    }
    const jointMatrices = uniformMat4Array(command.uniforms?.get("u_jointMatrices"), 2);
    for (let index = 0; index < 2; index += 1) {
      data.set(jointMatrices[index] ?? identityMatrix(), 96 + index * 16);
    }
    const morphDeltas = command.uniforms?.get("u_morphPositionDeltas");
    const morphNumbers = morphDeltas instanceof Float32Array || Array.isArray(morphDeltas) ? Array.from(morphDeltas).slice(0, 32) : [];
    if (morphNumbers.length > 0) data.set(morphNumbers, 128);
    const buffer = this.device.createBuffer({
      label: `${command.label ?? "draw"}-draw-uniforms`,
      size: data.byteLength,
      usage: BUFFER_USAGE.UNIFORM | BUFFER_USAGE.COPY_DST
    });
    this.device.queue.writeBuffer(buffer, 0, data);
    return buffer;
  }

  private currentCanvasView(): unknown | null {
    if (!this.canvasContext) return null;
    return this.canvasContext.getCurrentTexture().createView();
  }

  private clearActiveRenderTarget(color: readonly [number, number, number, number]): void {
    if (!this.activeRenderTarget) return;
    const bytes = rgbaBytes(color);
    for (let index = 0; index < this.activeRenderTarget.colorPixels.length; index += 4) {
      this.activeRenderTarget.colorPixels.set(bytes, index);
    }
    this.activeRenderTarget.nativeNeedsClear = true;
    this.activeRenderTarget.nativeClearColor = color;
    this.activeRenderTarget.depthPixels?.fill(1);
    if (this.activeRenderTarget.colorFloatPixels) {
      for (let index = 0; index < this.activeRenderTarget.colorFloatPixels.length; index += 4) {
        this.activeRenderTarget.colorFloatPixels[index] = color[0];
        this.activeRenderTarget.colorFloatPixels[index + 1] = color[1];
        this.activeRenderTarget.colorFloatPixels[index + 2] = color[2];
        this.activeRenderTarget.colorFloatPixels[index + 3] = color[3];
      }
    }
  }

  private indicesFor(command: DrawCommand): readonly number[] {
    if (!command.indexBuffer) {
      const firstVertex = command.firstVertex ?? 0;
      return Array.from({ length: command.vertexCount }, (_, index) => firstVertex + index);
    }
    const indexBuffer = this.requireBuffer(command.indexBuffer);
    const indexCount = command.indexCount ?? Math.floor(indexBuffer.byteLength / (command.indexType === "uint32" ? 4 : 2));
    const indices: number[] = [];
    const view = new DataView(indexBuffer.bytes.buffer, indexBuffer.bytes.byteOffset, indexBuffer.bytes.byteLength);
    const firstIndex = command.firstIndex ?? 0;
    for (let index = 0; index < indexCount; index += 1) {
      const byteOffset = (firstIndex + index) * (command.indexType === "uint32" ? 4 : 2);
      indices.push(command.indexType === "uint32" ? view.getUint32(byteOffset, true) : view.getUint16(byteOffset, true));
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

function hasNativeSampledTextureBinding(device: WebGPUDeviceLike): device is WebGPUDeviceLike & Required<Pick<WebGPUDeviceLike, "createTexture" | "createSampler">> & { readonly queue: WebGPUQueueLike & Required<Pick<WebGPUQueueLike, "writeTexture">> } {
  return typeof device.createTexture === "function" &&
    typeof device.createSampler === "function" &&
    typeof device.queue.writeTexture === "function";
}

function hasNativeTextureUpload(device: WebGPUDeviceLike): device is WebGPUDeviceLike & { readonly queue: WebGPUQueueLike & Required<Pick<WebGPUQueueLike, "writeTexture">> } {
  return typeof device.queue.writeTexture === "function";
}

function hasNativeTextureReadback(device: WebGPUDeviceLike): device is WebGPUDeviceLike & Required<Pick<WebGPUDeviceLike, "createCommandEncoder" | "createTexture">> {
  if (typeof device.createCommandEncoder !== "function" || typeof device.createTexture !== "function") return false;
  const probe = device.createBuffer({
    label: "aura3d-native-readback-capability-probe",
    size: 4,
    usage: BUFFER_USAGE.MAP_READ | BUFFER_USAGE.COPY_DST
  });
  const supported = typeof probe.mapAsync === "function" &&
    typeof probe.getMappedRange === "function" &&
    typeof probe.unmap === "function" &&
    typeof device.createCommandEncoder({ label: "aura3d-native-readback-capability-probe" }).copyTextureToBuffer === "function";
  probe.destroy();
  return supported;
}

function alignTo(value: number, alignment: number): number {
  return Math.ceil(value / alignment) * alignment;
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

function webgpuTextureFormat(format: "rgba8" | "rgba16f" | "rgba32f" | string): string {
  if (format === "rgba16f") return "rgba16float";
  if (format === "rgba32f") return "rgba32float";
  return "rgba8unorm";
}

function nativeSampledTextureLevels(texture: Texture): { readonly levels: readonly { readonly width: number; readonly height: number; readonly data: ArrayBufferView }[]; readonly format: TextureFormat } | null {
  if (isCompressedTextureFormat(texture.format)) {
    const fallback = texture.fallbackTextureLevels;
    return fallback.length > 0 ? { levels: fallback, format: "rgba8" } : null;
  }
  if (texture.format === "depth24") return null;
  const levels = texture.textureLevels;
  return levels.length > 0 ? { levels, format: texture.format } : null;
}

function webgpuSampledTextureFormat(texture: Texture, format: TextureFormat): string {
  if (format === "rgba16f") return "rgba16float";
  if (format === "rgba32f") return "rgba32float";
  return texture.colorSpace === "srgb" ? "rgba8unorm-srgb" : "rgba8unorm";
}

function webgpuMinFilter(filter: TextureMinFilter): TextureMagFilter {
  if (filter === "nearest" || filter === "nearest-mipmap-nearest" || filter === "nearest-mipmap-linear") return "nearest";
  return "linear";
}

function webgpuMagFilter(filter: TextureMagFilter): TextureMagFilter {
  return filter;
}

function webgpuMipmapFilter(filter: TextureMinFilter): TextureMagFilter | undefined {
  if (filter === "nearest-mipmap-nearest" || filter === "linear-mipmap-nearest") return "nearest";
  if (filter === "nearest-mipmap-linear" || filter === "linear-mipmap-linear") return "linear";
  return undefined;
}

function webgpuSamplerDescriptor(sampler: Sampler): WebGPUSamplerDescriptorLike {
  const minFilter = webgpuMinFilter(sampler.minFilter);
  const magFilter = webgpuMagFilter(sampler.magFilter);
  const mipmapFilter = webgpuMipmapFilter(sampler.minFilter);
  const descriptor: WebGPUSamplerDescriptorLike = {
    minFilter,
    magFilter,
    ...(mipmapFilter ? { mipmapFilter } : {}),
    addressModeU: sampler.addressU,
    addressModeV: sampler.addressV
  };
  const maxAnisotropy = webgpuMaxAnisotropy(sampler.maxAnisotropy, minFilter, magFilter, mipmapFilter);
  return maxAnisotropy === undefined ? descriptor : { ...descriptor, maxAnisotropy };
}

function webgpuMaxAnisotropy(
  maxAnisotropy: number,
  minFilter: TextureMagFilter,
  magFilter: TextureMagFilter,
  mipmapFilter: TextureMagFilter | undefined
): number | undefined {
  if (maxAnisotropy <= 1) return undefined;
  if (minFilter !== "linear" || magFilter !== "linear" || mipmapFilter !== "linear") return undefined;
  return Math.min(16, Math.max(1, Math.floor(maxAnisotropy)));
}

function usesNativeDrawUniforms(layout: NativeUniformLayout): boolean {
  return layout !== "passthrough";
}

function usesNativePbrTextureBindings(layout: NativeUniformLayout): boolean {
  return layout === "generated-pbr" ||
    layout === "generated-textured-pbr" ||
    layout === "generated-instanced-pbr";
}

function writeAlignedQueueBuffer(
  queue: WebGPUQueueLike,
  buffer: WebGPUBufferLike,
  byteOffset: number,
  data: ArrayBufferView,
  nativeByteLength: number
): void {
  const bytes = viewBytes(data);
  if (byteOffset % 4 === 0 && bytes.byteLength % 4 === 0) {
    queue.writeBuffer(buffer, byteOffset, bytes);
    return;
  }
  const alignedOffset = Math.floor(byteOffset / 4) * 4;
  const alignedEnd = alignTo(byteOffset + bytes.byteLength, 4);
  if (alignedEnd > nativeByteLength) {
    throw new RenderDeviceError("Aligned WebGPU buffer write exceeds native buffer allocation", "BUFFER_RANGE_OUT_OF_BOUNDS", {
      byteOffset,
      dataByteLength: bytes.byteLength,
      alignedOffset,
      alignedEnd,
      nativeByteLength
    });
  }
  const padded = new Uint8Array(alignedEnd - alignedOffset);
  padded.set(bytes, byteOffset - alignedOffset);
  queue.writeBuffer(buffer, alignedOffset, padded);
}

function rgbaBytes(color: readonly [number, number, number, number]): Uint8Array {
  return new Uint8Array(color.map((channel) => Math.round(Math.max(0, Math.min(1, channel)) * 255)));
}

function halfFloatToNumber(bits: number): number {
  const sign = (bits & 0x8000) ? -1 : 1;
  const exponent = (bits >> 10) & 0x1f;
  const fraction = bits & 0x03ff;
  if (exponent === 0) {
    return sign * 2 ** -14 * (fraction / 1024);
  }
  if (exponent === 0x1f) {
    return fraction === 0 ? sign * Infinity : Number.NaN;
  }
  return sign * 2 ** (exponent - 15) * (1 + fraction / 1024);
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

function uniformBaseColorTextureBinding(uniforms: DrawCommand["uniforms"]): TextureBinding | null {
  if (!uniforms) return null;
  const direct = uniforms.get("u_texture") ?? uniforms.get("u_baseColorTexture") ?? uniforms.get("baseColorTexture");
  if (direct instanceof TextureBinding && direct.texture && !direct.texture.disposed && direct.validate().ok) {
    return direct;
  }
  return null;
}

function uniformTextureBinding(uniforms: DrawCommand["uniforms"], name: string): TextureBinding | null {
  const value = uniforms?.get(name);
  return value instanceof TextureBinding && value.texture && !value.texture.disposed && value.validate().ok ? value : null;
}

function uniformNumber(value: UniformValue | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function uniformVec3(value: UniformValue | undefined): readonly [number, number, number] | null {
  const components = value instanceof Float32Array || Array.isArray(value) ? Array.from(value).slice(0, 3) : [];
  return components.length === 3 && components.every(Number.isFinite)
    ? [components[0]!, components[1]!, components[2]!]
    : null;
}

function uniformMat4Array(value: UniformValue | undefined, count: number): readonly (readonly number[])[] {
  const numbers = value instanceof Float32Array || Array.isArray(value) ? Array.from(value) : [];
  return Array.from({ length: count }, (_, index) => {
    const start = index * 16;
    const matrix = numbers.slice(start, start + 16);
    return matrix.length === 16 && matrix.every(Number.isFinite) ? matrix : identityMatrix();
  });
}

function uniformRasterMatrices(uniforms: DrawCommand["uniforms"], instanceCount: number): readonly (readonly number[])[] {
  const modelViewProjection = uniformMat4(uniforms?.get("u_modelViewProjection")) ?? identityMatrix();
  const value = uniforms?.get("u_instanceMatrices");
  const numbers = value instanceof Float32Array || Array.isArray(value) ? Array.from(value) : [];
  if (numbers.length < instanceCount * 16 || !numbers.slice(0, instanceCount * 16).every(Number.isFinite)) {
    return Array.from({ length: instanceCount }, () => modelViewProjection);
  }
  return Array.from({ length: instanceCount }, (_, index) => multiplyMat4(modelViewProjection, numbers.slice(index * 16, index * 16 + 16)));
}

function uniformRasterModelMatrices(uniforms: DrawCommand["uniforms"], instanceCount: number): readonly (readonly number[])[] {
  const modelMatrix = uniformMat4(uniforms?.get("u_modelMatrix")) ?? identityMatrix();
  const value = uniforms?.get("u_instanceMatrices");
  const numbers = value instanceof Float32Array || Array.isArray(value) ? Array.from(value) : [];
  if (numbers.length < instanceCount * 16 || !numbers.slice(0, instanceCount * 16).every(Number.isFinite)) {
    return Array.from({ length: instanceCount }, () => modelMatrix);
  }
  return Array.from({ length: instanceCount }, (_, index) => multiplyMat4(modelMatrix, numbers.slice(index * 16, index * 16 + 16)));
}

function uniformForwardShadow(uniforms: DrawCommand["uniforms"]): ForwardShadowUniforms | null {
  if (!uniforms) return null;
  const enabled = uniforms.get("u_shadowMapEnabled");
  if (typeof enabled !== "number" || enabled < 0.5) return null;
  const texture = uniforms.get("u_shadowMapTexture");
  const matrix = uniformMat4(uniforms.get("u_shadowMapMatrix")) ?? identityMatrix();
  if (!(texture instanceof TextureBinding) || !texture.texture || texture.texture.disposed || !texture.validate().ok) {
    return null;
  }
  const strengthValue = uniforms.get("u_shadowMapStrength");
  const biasValue = uniforms.get("u_shadowMapBias");
  const strength = typeof strengthValue === "number" && Number.isFinite(strengthValue) ? Math.max(0, Math.min(1, strengthValue)) : 0.65;
  const bias = typeof biasValue === "number" && Number.isFinite(biasValue) ? Math.max(0, biasValue) : 0.001;
  return { texture, matrix, strength, bias };
}

function uniformMat4(value: UniformValue | undefined): readonly number[] | null {
  const numbers = value instanceof Float32Array || Array.isArray(value) ? Array.from(value) : [];
  return numbers.length === 16 && numbers.every(Number.isFinite) ? numbers : null;
}

function multiplyMat4(left: readonly number[], right: readonly number[]): readonly number[] {
  const out = new Array<number>(16);
  for (let row = 0; row < 4; row += 1) {
    for (let column = 0; column < 4; column += 1) {
      out[column * 4 + row] =
        (left[0 * 4 + row] ?? 0) * (right[column * 4 + 0] ?? 0) +
        (left[1 * 4 + row] ?? 0) * (right[column * 4 + 1] ?? 0) +
        (left[2 * 4 + row] ?? 0) * (right[column * 4 + 2] ?? 0) +
        (left[3 * 4 + row] ?? 0) * (right[column * 4 + 3] ?? 0);
    }
  }
  return out;
}

function transformPosition(position: readonly [number, number, number], matrix: readonly number[]): readonly [number, number, number] {
  const x = (matrix[0] ?? 1) * position[0] + (matrix[4] ?? 0) * position[1] + (matrix[8] ?? 0) * position[2] + (matrix[12] ?? 0);
  const y = (matrix[1] ?? 0) * position[0] + (matrix[5] ?? 1) * position[1] + (matrix[9] ?? 0) * position[2] + (matrix[13] ?? 0);
  const z = (matrix[2] ?? 0) * position[0] + (matrix[6] ?? 0) * position[1] + (matrix[10] ?? 1) * position[2] + (matrix[14] ?? 0);
  const w = (matrix[3] ?? 0) * position[0] + (matrix[7] ?? 0) * position[1] + (matrix[11] ?? 0) * position[2] + (matrix[15] ?? 1);
  const inverseW = Math.abs(w) > 1e-8 ? 1 / w : 1;
  return [
    x * inverseW,
    y * inverseW,
    z * inverseW
  ];
}

function toDepth(ndcZ: number): number {
  return Math.max(0, Math.min(1, ndcZ * 0.5 + 0.5));
}

function passesDepthTest(target: WebGPURenderTarget, pixelIndex: number, depth: number, enabled: boolean, write: boolean): boolean {
  if (!enabled || !target.depthPixels) return true;
  if (depth > (target.depthPixels[pixelIndex] ?? 1) + 1e-6) return false;
  if (write) target.depthPixels[pixelIndex] = depth;
  return true;
}

function readPosition(bytes: Uint8Array, stride: number, offset: number, vertexIndex: number): readonly [number, number, number] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const base = vertexIndex * stride + offset;
  return [
    view.getFloat32(base, true),
    view.getFloat32(base + 4, true),
    view.getFloat32(base + 8, true)
  ];
}

function readMorphedPosition(bytes: Uint8Array, stride: number, offset: number, vertexIndex: number, uniforms: DrawCommand["uniforms"]): readonly [number, number, number] {
  const basePosition = readPosition(bytes, stride, offset, vertexIndex);
  const packed = uniforms?.get("u_morphPositionDeltas");
  const weights = uniforms?.get("u_morphWeights");
  const targetCountValue = uniforms?.get("u_morphTargetCount");
  if (!(packed instanceof Float32Array) || !(weights instanceof Float32Array) || typeof targetCountValue !== "number") {
    return basePosition;
  }
  const targetCount = Math.max(0, Math.min(weights.length, Math.floor(targetCountValue)));
  let x = basePosition[0];
  let y = basePosition[1];
  let z = basePosition[2];
  for (let target = 0; target < targetCount; target += 1) {
    const weight = weights[target] ?? 0;
    const deltaOffset = (target * 64 + vertexIndex) * 4;
    x += (packed[deltaOffset] ?? 0) * weight;
    y += (packed[deltaOffset + 1] ?? 0) * weight;
    z += (packed[deltaOffset + 2] ?? 0) * weight;
  }
  return [x, y, z];
}

function toPixel(position: readonly [number, number, number], width: number, height: number): readonly [number, number, number] {
  return [
    (position[0] * 0.5 + 0.5) * (width - 1),
    (1 - (position[1] * 0.5 + 0.5)) * (height - 1),
    toDepth(position[2])
  ];
}

function identityMatrix(): readonly number[] {
  return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
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

function readVertexUv(bytes: Uint8Array, stride: number, offset: number | undefined, vertexIndex: number): readonly [number, number] {
  if (offset === undefined) return [0, 0];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const base = vertexIndex * stride + offset;
  return [view.getFloat32(base, true), view.getFloat32(base + 4, true)];
}

function rasterizeTriangle(
  target: WebGPURenderTarget,
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  c: readonly [number, number, number],
  worldA: readonly [number, number, number],
  worldB: readonly [number, number, number],
  worldC: readonly [number, number, number],
  color: readonly [number, number, number, number],
  colorA: readonly [number, number, number, number],
  colorB: readonly [number, number, number, number],
  colorC: readonly [number, number, number, number],
  uvA: readonly [number, number],
  uvB: readonly [number, number],
  uvC: readonly [number, number],
  texture: TextureBinding | null,
  shadow: ForwardShadowUniforms | null,
  depthTest: boolean,
  depthWrite: boolean
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
        const wa = w0 * invArea;
        const wb = w1 * invArea;
        const wc = w2 * invArea;
        const uv: readonly [number, number] = [
          uvA[0] * wa + uvB[0] * wb + uvC[0] * wc,
          uvA[1] * wa + uvB[1] * wb + uvC[1] * wc
        ];
        const worldPosition: readonly [number, number, number] = [
          worldA[0] * wa + worldB[0] * wb + worldC[0] * wc,
          worldA[1] * wa + worldB[1] * wb + worldC[1] * wc,
          worldA[2] * wa + worldB[2] * wb + worldC[2] * wc
        ];
        const pixelIndex = y * target.width + x;
        const depth = pa[2] * wa + pb[2] * wb + pc[2] * wc;
        if (!passesDepthTest(target, pixelIndex, depth, depthTest, depthWrite)) continue;
        const shadedColor = multiplyColor(
          multiplyColor(color, interpolateColor(colorA, colorB, colorC, wa, wb, wc)),
          texture ? sampleTextureBinding(texture, uv) : [1, 1, 1, 1]
        );
        target.colorPixels.set(rgbaBytes(multiplyColor(shadedColor, shadowFactor(shadow, worldPosition))), pixelIndex * 4);
      }
    }
  }
}

function rasterizeLine(
  target: WebGPURenderTarget,
  a: readonly [number, number, number],
  b: readonly [number, number, number],
  color: readonly [number, number, number, number],
  colorA: readonly [number, number, number, number],
  colorB: readonly [number, number, number, number],
  depthTest: boolean,
  depthWrite: boolean
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
    const pixelIndex = y * target.width + x;
    const depth = pa[2] + (pb[2] - pa[2]) * t;
    if (!passesDepthTest(target, pixelIndex, depth, depthTest, depthWrite)) continue;
    const shaded = lerpColor(shadedA, shadedB, t);
    target.colorPixels.set(rgbaBytes(shaded), pixelIndex * 4);
  }
}

function rasterizePoint(
  target: WebGPURenderTarget,
  point: readonly [number, number, number],
  color: readonly [number, number, number, number],
  depthTest: boolean,
  depthWrite: boolean
): void {
  const pixel = toPixel(point, target.width, target.height);
  const centerX = clampInt(Math.round(pixel[0]), 0, target.width - 1);
  const centerY = clampInt(Math.round(pixel[1]), 0, target.height - 1);
  const bytes = rgbaBytes(color);
  for (let y = centerY - 2; y <= centerY + 2; y += 1) {
    if (y < 0 || y >= target.height) continue;
    for (let x = centerX - 2; x <= centerX + 2; x += 1) {
      if (x < 0 || x >= target.width) continue;
      const pixelIndex = y * target.width + x;
      if (!passesDepthTest(target, pixelIndex, pixel[2], depthTest, depthWrite)) continue;
      target.colorPixels.set(bytes, pixelIndex * 4);
    }
  }
}

function sampleTextureBinding(binding: TextureBinding, uv: readonly [number, number]): readonly [number, number, number, number] {
  const texture = binding.texture;
  if (!texture || texture.disposed) return [1, 1, 1, 1];
  const level = texture.textureLevels[0] ?? texture.fallbackTextureLevels[0];
  if (!level || level.data.length < level.width * level.height * 4) return [1, 1, 1, 1];
  const transformed = binding.transformUV(uv);
  const u = addressCoordinate(transformed[0], binding.sampler.addressU);
  const v = addressCoordinate(transformed[1], binding.sampler.addressV);
  const x = clampInt(Math.round(u * (level.width - 1)), 0, level.width - 1);
  const y = clampInt(Math.round(v * (level.height - 1)), 0, level.height - 1);
  const offset = (y * level.width + x) * 4;
  const r = (level.data[offset] ?? 255) / 255;
  const g = (level.data[offset + 1] ?? 255) / 255;
  const b = (level.data[offset + 2] ?? 255) / 255;
  return [
    texture.colorSpace === "srgb" ? srgbToLinear(r) : r,
    texture.colorSpace === "srgb" ? srgbToLinear(g) : g,
    texture.colorSpace === "srgb" ? srgbToLinear(b) : b,
    (level.data[offset + 3] ?? 255) / 255
  ];
}

function srgbToLinear(value: number): number {
  return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
}

function shadowFactor(shadow: ForwardShadowUniforms | null, worldPosition: readonly [number, number, number]): readonly [number, number, number, number] {
  if (!shadow) return [1, 1, 1, 1];
  const projected = transformPosition(worldPosition, shadow.matrix);
  if (projected[0] < -1 || projected[0] > 1 || projected[1] < -1 || projected[1] > 1 || projected[2] < -1 || projected[2] > 1) {
    return [1, 1, 1, 1];
  }
  const uv: readonly [number, number] = [projected[0] * 0.5 + 0.5, projected[1] * 0.5 + 0.5];
  const storedDepth = sampleTextureBinding(shadow.texture, uv)[0];
  const receiverDepth = projected[2] * 0.5 + 0.5 - shadow.bias;
  const visibility = receiverDepth > storedDepth ? 1 - shadow.strength : 1;
  return [visibility, visibility, visibility, 1];
}

function addressCoordinate(value: number, mode: "clamp-to-edge" | "repeat" | "mirror-repeat"): number {
  if (mode === "repeat") return value - Math.floor(value);
  if (mode === "mirror-repeat") {
    const repeated = value - Math.floor(value);
    return Math.floor(value) % 2 === 0 ? repeated : 1 - repeated;
  }
  return Math.min(1, Math.max(0, value));
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

function edge(a: readonly number[], b: readonly number[], c: readonly number[]): number {
  return (c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0]);
}

function clampInt(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function createNativeShaderSources(sources: ShaderSources): {
  readonly vertex: string;
  readonly fragment: string;
  readonly entryPoints: readonly [string, string];
  readonly uniformLayout: NativeUniformLayout;
} {
  const vertexEntry = inferWGSLVertexEntryPoint(sources.vertex) ?? "vs_main";
  const fragmentEntry = inferWGSLFragmentEntryPoint(sources.fragment) ?? "fs_main";
  if (/\@(vertex|fragment|compute)\b/.test(sources.vertex) || /\@(vertex|fragment|compute)\b/.test(sources.fragment)) {
    return { vertex: sources.vertex, fragment: sources.fragment, entryPoints: [vertexEntry, fragmentEntry], uniformLayout: "passthrough" };
  }
  if (sources.marker.includes("instanced-pbr")) {
    return { ...nativeInstancedPbrShader(vertexEntry, fragmentEntry, sources.marker), entryPoints: [vertexEntry, fragmentEntry], uniformLayout: "generated-instanced-pbr" };
  }
  if (sources.marker.includes("pbr-textured")) {
    return { ...nativeTexturedPbrShader(vertexEntry, fragmentEntry, sources.marker), entryPoints: [vertexEntry, fragmentEntry], uniformLayout: "generated-textured-pbr" };
  }
  if (sources.marker.includes("pbr-direct")) {
    return sources.fragment.includes("u_baseColorTexture")
      ? { ...nativeTexturedPbrShader(vertexEntry, fragmentEntry, sources.marker), entryPoints: [vertexEntry, fragmentEntry], uniformLayout: "generated-textured-pbr" }
      : { ...nativePbrShader(vertexEntry, fragmentEntry, sources.marker), entryPoints: [vertexEntry, fragmentEntry], uniformLayout: "generated-pbr" };
  }
  if (sources.marker.includes("skinned-unlit")) {
    return { ...nativeSkinnedUnlitShader(vertexEntry, fragmentEntry, sources.marker), entryPoints: [vertexEntry, fragmentEntry], uniformLayout: "generated-skinned-unlit" };
  }
  if (sources.marker.includes("morph-unlit")) {
    return { ...nativeMorphUnlitShader(vertexEntry, fragmentEntry, sources.marker), entryPoints: [vertexEntry, fragmentEntry], uniformLayout: "generated-morph-unlit" };
  }
  if (/sampler2D/.test(sources.fragment) && /layout\s*\(\s*location\s*=\s*2\s*\)\s*in\s+vec2/.test(sources.vertex)) {
    return {
      vertex: `// ${sources.marker}\nstruct DrawUniforms {\n  modelViewProjection: mat4x4<f32>,\n  color: vec4<f32>,\n};\n\nstruct VertexOutput {\n  @builtin(position) position: vec4<f32>,\n  @location(0) uv: vec2<f32>,\n};\n\n@group(0) @binding(0) var<uniform> u_draw: DrawUniforms;\n\n@vertex\nfn ${vertexEntry}(@location(0) position: vec3<f32>, @location(2) uv: vec2<f32>) -> VertexOutput {\n  var output: VertexOutput;\n  let clipPosition = u_draw.modelViewProjection * vec4<f32>(position, 1.0);
  output.position = vec4<f32>(clipPosition.x, clipPosition.y, clipPosition.z * 0.5 + clipPosition.w * 0.5, clipPosition.w);\n  output.uv = uv;\n  return output;\n}\n`,
      fragment: `// ${sources.marker}\nstruct DrawUniforms {\n  modelViewProjection: mat4x4<f32>,\n  color: vec4<f32>,\n};\n\nstruct VertexOutput {\n  @builtin(position) position: vec4<f32>,\n  @location(0) uv: vec2<f32>,\n};\n\n@group(0) @binding(0) var<uniform> u_draw: DrawUniforms;\n@group(0) @binding(1) var u_textureSampler: sampler;\n@group(0) @binding(2) var u_texture: texture_2d<f32>;\n\n@fragment\nfn ${fragmentEntry}(input: VertexOutput) -> @location(0) vec4<f32> {\n  return u_draw.color * textureSample(u_texture, u_textureSampler, input.uv);\n}\n`,
      entryPoints: [vertexEntry, fragmentEntry],
      uniformLayout: "generated-texture"
    };
  }
  return {
    vertex: `// ${sources.marker}\nstruct DrawUniforms {\n  modelViewProjection: mat4x4<f32>,\n  color: vec4<f32>,\n};\n\nstruct VertexOutput {\n  @builtin(position) position: vec4<f32>,\n};\n\n@group(0) @binding(0) var<uniform> u_draw: DrawUniforms;\n\n@vertex\nfn ${vertexEntry}(@location(0) position: vec3<f32>) -> VertexOutput {\n  var output: VertexOutput;\n  let clipPosition = u_draw.modelViewProjection * vec4<f32>(position, 1.0);
  output.position = vec4<f32>(clipPosition.x, clipPosition.y, clipPosition.z * 0.5 + clipPosition.w * 0.5, clipPosition.w);\n  return output;\n}\n`,
    fragment: `// ${sources.marker}\nstruct DrawUniforms {\n  modelViewProjection: mat4x4<f32>,\n  color: vec4<f32>,\n};\n\n@group(0) @binding(0) var<uniform> u_draw: DrawUniforms;\n\n@fragment\nfn ${fragmentEntry}() -> @location(0) vec4<f32> {\n  return u_draw.color;\n}\n`,
    entryPoints: [vertexEntry, fragmentEntry],
    uniformLayout: "generated-basic"
  };
}

function nativeUniformStruct(): string {
  return `struct DrawUniforms {
  modelViewProjection: mat4x4<f32>,
  color: vec4<f32>,
  params: vec4<f32>,
  flags: vec4<f32>,
  reserved0: vec4<f32>,
  instance0: mat4x4<f32>,
  instance1: mat4x4<f32>,
  instance2: mat4x4<f32>,
  instance3: mat4x4<f32>,
  joint0: mat4x4<f32>,
  joint1: mat4x4<f32>,
  morph0: vec4<f32>,
  morph1: vec4<f32>,
  morph2: vec4<f32>,
  morph3: vec4<f32>,
  morph4: vec4<f32>,
  morph5: vec4<f32>,
  morph6: vec4<f32>,
  morph7: vec4<f32>,
  material: vec4<f32>,
  camera: vec4<f32>,
};

@group(0) @binding(0) var<uniform> u_draw: DrawUniforms;

fn a3dWebGPUClipPosition(clipPosition: vec4<f32>) -> vec4<f32> {
  return vec4<f32>(clipPosition.x, clipPosition.y, clipPosition.z * 0.5 + clipPosition.w * 0.5, clipPosition.w);
}
`;
}

function nativePbrFragmentPrelude(marker: string): string {
  return `// ${marker}
${nativeUniformStruct()}
@group(0) @binding(1) var u_baseSampler: sampler;
@group(0) @binding(2) var u_baseTexture: texture_2d<f32>;
@group(0) @binding(3) var u_environmentSampler: sampler;
@group(0) @binding(4) var u_environmentTexture: texture_2d<f32>;
@group(0) @binding(5) var u_brdfSampler: sampler;
@group(0) @binding(6) var u_brdfTexture: texture_2d<f32>;
@group(0) @binding(7) var u_shadowSampler: sampler;
@group(0) @binding(8) var u_shadowTexture: texture_2d<f32>;
@group(0) @binding(9) var u_normalSampler: sampler;
@group(0) @binding(10) var u_normalTexture: texture_2d<f32>;
@group(0) @binding(11) var u_metallicRoughnessSampler: sampler;
@group(0) @binding(12) var u_metallicRoughnessTexture: texture_2d<f32>;
@group(0) @binding(13) var u_occlusionSampler: sampler;
@group(0) @binding(14) var u_occlusionTexture: texture_2d<f32>;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) normal: vec3<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) worldPosition: vec3<f32>,
};

fn fresnelSchlick(cosTheta: f32, f0: vec3<f32>) -> vec3<f32> {
  return f0 + (vec3<f32>(1.0, 1.0, 1.0) - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

fn fresnelSchlickRoughness(cosTheta: f32, f0: vec3<f32>, roughness: f32) -> vec3<f32> {
  let smoothness = 1.0 - clamp(roughness, 0.0, 1.0);
  return f0 + (max(vec3<f32>(smoothness, smoothness, smoothness), f0) - f0) * pow(clamp(1.0 - cosTheta, 0.0, 1.0), 5.0);
}

fn ggxDistribution(nDotH: f32, roughness: f32) -> f32 {
  let a = max(roughness * roughness, 0.045);
  let a2 = a * a;
  let denom = max((nDotH * nDotH) * (a2 - 1.0) + 1.0, 0.001);
  return a2 / max(3.14159265 * denom * denom, 0.001);
}

fn ggxVisibilitySmithCorrelated(nDotV: f32, nDotL: f32, roughness: f32) -> f32 {
  let a = max(roughness * roughness, 0.045);
  let a2 = a * a;
  let lambdaV = nDotL * sqrt(max((nDotV - a2 * nDotV) * nDotV + a2, 0.00001));
  let lambdaL = nDotV * sqrt(max((nDotL - a2 * nDotL) * nDotL + a2, 0.00001));
  return 0.5 / max(lambdaV + lambdaL, 0.00001);
}

fn diffuseBurley(nDotV: f32, nDotL: f32, lDotH: f32, roughness: f32) -> f32 {
  let energyBias = mix(0.0, 0.5, roughness);
  let energyFactor = mix(1.0, 1.0 / 1.51, roughness);
  let fd90 = energyBias + 2.0 * lDotH * lDotH * roughness;
  let lightScatter = 1.0 + (fd90 - 1.0) * pow(clamp(1.0 - nDotL, 0.0, 1.0), 5.0);
  let viewScatter = 1.0 + (fd90 - 1.0) * pow(clamp(1.0 - nDotV, 0.0, 1.0), 5.0);
  return lightScatter * viewScatter * energyFactor;
}

fn encodePbrOutput(linearColor: vec3<f32>) -> vec3<f32> {
  let color = max(linearColor, vec3<f32>(0.0, 0.0, 0.0));
  let filmic = clamp((color * (2.51 * color + vec3<f32>(0.03, 0.03, 0.03))) / (color * (2.43 * color + vec3<f32>(0.59, 0.59, 0.59)) + vec3<f32>(0.14, 0.14, 0.14)), vec3<f32>(0.0, 0.0, 0.0), vec3<f32>(1.0, 1.0, 1.0));
  return pow(filmic, vec3<f32>(1.0 / 2.2, 1.0 / 2.2, 1.0 / 2.2));
}

fn perturbNormal(normalInput: vec3<f32>, worldPosition: vec3<f32>, uv: vec2<f32>, normalSample: vec3<f32>, normalScale: f32) -> vec3<f32> {
  let n = normalize(normalInput);
  let dp1 = dpdx(worldPosition);
  let dp2 = dpdy(worldPosition);
  let duv1 = dpdx(uv);
  let duv2 = dpdy(uv);
  let dp2perp = cross(dp2, n);
  let dp1perp = cross(n, dp1);
  let tangent = dp2perp * duv1.x + dp1perp * duv2.x;
  let bitangent = dp2perp * duv1.y + dp1perp * duv2.y;
  let inverseFrameScale = 1.0 / sqrt(max(max(dot(tangent, tangent), dot(bitangent, bitangent)), 0.000001));
  let mapped = vec3<f32>((normalSample.xy * 2.0 - vec2<f32>(1.0, 1.0)) * max(normalScale, 0.0), normalSample.z * 2.0 - 1.0);
  return normalize(tangent * inverseFrameScale * mapped.x + bitangent * inverseFrameScale * mapped.y + n * mapped.z);
}

fn shadePbr(normalInput: vec3<f32>, uv: vec2<f32>, worldPosition: vec3<f32>) -> vec4<f32> {
  var normal = normalize(normalInput);
  if (u_draw.morph0.x > 0.5) {
    normal = perturbNormal(normal, worldPosition, uv, textureSample(u_normalTexture, u_normalSampler, uv).rgb, u_draw.morph0.y);
  }
  let viewDirection = normalize(u_draw.camera.xyz - worldPosition);
  let lightDirection = normalize(vec3<f32>(0.36, 0.52, 0.78));
  let halfVector = normalize(lightDirection + viewDirection);
  var baseColor = u_draw.color.rgb;
  var materialAlpha = u_draw.color.a;
  if (u_draw.flags.x > 0.5) {
    let baseSample = textureSample(u_baseTexture, u_baseSampler, uv);
    baseColor = baseColor * baseSample.rgb;
    materialAlpha = materialAlpha * baseSample.a;
  }
  if (materialAlpha < u_draw.material.x) {
    discard;
  }
  let transmission = clamp(max(u_draw.material.y, u_draw.material.z), 0.0, 1.0);
  let metallicRoughness = textureSample(u_metallicRoughnessTexture, u_metallicRoughnessSampler, uv);
  let occlusion = mix(1.0, textureSample(u_occlusionTexture, u_occlusionSampler, uv).r, clamp(u_draw.morph0.z, 0.0, 1.0));
  let metallic = clamp(u_draw.params.x * metallicRoughness.b, 0.0, 1.0);
  let roughness = clamp(u_draw.params.y * metallicRoughness.g, 0.045, 1.0);
  let nDotL = max(dot(normal, lightDirection), 0.0);
  let nDotV = max(dot(normal, viewDirection), 0.001);
  let nDotH = max(dot(normal, halfVector), 0.001);
  let vDotH = max(dot(viewDirection, halfVector), 0.001);
  let f0 = mix(vec3<f32>(0.04, 0.04, 0.04), baseColor, metallic);
  let fresnel = fresnelSchlick(vDotH, f0);
  let distribution = ggxDistribution(nDotH, roughness);
  let visibility = ggxVisibilitySmithCorrelated(nDotV, nDotL, roughness);
  let lDotH = max(dot(lightDirection, halfVector), 0.0);
  let kd = (vec3<f32>(1.0, 1.0, 1.0) - fresnel) * (1.0 - metallic);
  let specular = fresnel * distribution * visibility;
  let diffuse = kd * baseColor * diffuseBurley(nDotV, nDotL, lDotH, roughness) / 3.14159265;
  var environment = baseColor * u_draw.params.z * (0.28 + 0.72 * clamp(normal.y * 0.5 + 0.5, 0.0, 1.0)) * occlusion;
  var environmentSpecularContribution = vec3<f32>(0.0, 0.0, 0.0);
  if (u_draw.flags.w > 0.5) {
    let reflectionDirection = reflect(-viewDirection, normal);
    let diffuseUv = vec2<f32>(fract(atan2(normal.z, normal.x) / 6.2831853 + 0.5), acos(clamp(normal.y, -1.0, 1.0)) / 3.14159265);
    let specularUv = vec2<f32>(fract(atan2(reflectionDirection.z, reflectionDirection.x) / 6.2831853 + 0.5), acos(clamp(reflectionDirection.y, -1.0, 1.0)) / 3.14159265);
    let environmentMipCount = max(u_draw.reserved0.z, 1.0);
    let diffuseEnv = textureSampleLevel(u_environmentTexture, u_environmentSampler, diffuseUv, max(environmentMipCount - 1.0, 0.0)).rgb;
    let specularEnv = textureSampleLevel(u_environmentTexture, u_environmentSampler, specularUv, roughness * max(environmentMipCount - 1.0, 0.0)).rgb;
    let brdf = textureSample(u_brdfTexture, u_brdfSampler, vec2<f32>(nDotV, roughness)).rg;
    let environmentFresnel = fresnelSchlickRoughness(nDotV, f0, roughness);
    let environmentDiffuse = (vec3<f32>(1.0, 1.0, 1.0) - environmentFresnel) * (1.0 - metallic) * diffuseEnv * baseColor * u_draw.params.w * occlusion;
    let environmentSpecular = specularEnv * (f0 * brdf.x + vec3<f32>(brdf.y, brdf.y, brdf.y)) * max(u_draw.reserved0.w, u_draw.params.w);
    environmentSpecularContribution = environmentSpecular;
    environment = environment + environmentDiffuse + environmentSpecular;
  }
  var shadow = 1.0;
  if (u_draw.flags.y > 0.5) {
    let shadowDepth = textureSample(u_shadowTexture, u_shadowSampler, vec2<f32>(0.5, 0.5)).r;
    shadow = mix(1.0, shadowDepth, clamp(u_draw.flags.z, 0.0, 1.0));
  }
  let opaqueLinearColor = environment + (diffuse + specular) * nDotL * 3.2 * shadow;
  let transmittedTint = baseColor * u_draw.params.w * (0.18 + 0.42 * clamp(1.0 - roughness, 0.0, 1.0)) + environmentSpecularContribution * 1.35;
  let linearColor = mix(opaqueLinearColor, opaqueLinearColor * 0.22 + transmittedTint, transmission);
  let outputAlpha = mix(materialAlpha, min(materialAlpha, 0.22), transmission);
  return vec4<f32>(encodePbrOutput(linearColor), outputAlpha);
}
`;
}

function nativePbrShader(vertexEntry: string, fragmentEntry: string, marker: string): { readonly vertex: string; readonly fragment: string } {
  return {
    vertex: `// ${marker}
${nativeUniformStruct()}
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) normal: vec3<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) worldPosition: vec3<f32>,
};

@vertex
fn ${vertexEntry}(@location(0) position: vec3<f32>, @location(1) normal: vec3<f32>) -> VertexOutput {
  var output: VertexOutput;
  let worldPosition = (u_draw.instance0 * vec4<f32>(position, 1.0)).xyz;
  output.position = a3dWebGPUClipPosition(u_draw.modelViewProjection * vec4<f32>(position, 1.0));
  output.normal = normalize((u_draw.instance0 * vec4<f32>(normal, 0.0)).xyz);
  output.uv = vec2<f32>(0.5, 0.5);
  output.worldPosition = worldPosition;
  return output;
}
`,
    fragment: `${nativePbrFragmentPrelude(marker)}
@fragment
fn ${fragmentEntry}(input: VertexOutput) -> @location(0) vec4<f32> {
  return shadePbr(input.normal, input.uv, input.worldPosition);
}
`
  };
}

function nativeTexturedPbrShader(vertexEntry: string, fragmentEntry: string, marker: string): { readonly vertex: string; readonly fragment: string } {
  return {
    vertex: `// ${marker}
${nativeUniformStruct()}
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) normal: vec3<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) worldPosition: vec3<f32>,
};

@vertex
fn ${vertexEntry}(@location(0) position: vec3<f32>, @location(1) normal: vec3<f32>, @location(2) uv: vec2<f32>) -> VertexOutput {
  var output: VertexOutput;
  let worldPosition = (u_draw.instance0 * vec4<f32>(position, 1.0)).xyz;
  output.position = a3dWebGPUClipPosition(u_draw.modelViewProjection * vec4<f32>(position, 1.0));
  output.normal = normalize((u_draw.instance0 * vec4<f32>(normal, 0.0)).xyz);
  output.uv = uv;
  output.worldPosition = worldPosition;
  return output;
}
`,
    fragment: `${nativePbrFragmentPrelude(marker)}
@fragment
fn ${fragmentEntry}(input: VertexOutput) -> @location(0) vec4<f32> {
  return shadePbr(input.normal, input.uv, input.worldPosition);
}
`
  };
}

function nativeInstancedPbrShader(vertexEntry: string, fragmentEntry: string, marker: string): { readonly vertex: string; readonly fragment: string } {
  return {
    vertex: `// ${marker}
${nativeUniformStruct()}
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) normal: vec3<f32>,
  @location(1) uv: vec2<f32>,
  @location(2) worldPosition: vec3<f32>,
};

fn instanceMatrix(index: u32) -> mat4x4<f32> {
  if (index == 1u) { return u_draw.instance1; }
  if (index == 2u) { return u_draw.instance2; }
  if (index == 3u) { return u_draw.instance3; }
  return u_draw.instance0;
}

@vertex
fn ${vertexEntry}(@location(0) position: vec3<f32>, @location(1) normal: vec3<f32>, @builtin(instance_index) instanceIndex: u32) -> VertexOutput {
  var output: VertexOutput;
  let model = instanceMatrix(instanceIndex);
  let worldPosition = (model * vec4<f32>(position, 1.0)).xyz;
  output.position = a3dWebGPUClipPosition(u_draw.modelViewProjection * model * vec4<f32>(position, 1.0));
  output.normal = normalize((model * vec4<f32>(normal, 0.0)).xyz);
  output.uv = vec2<f32>(0.5, 0.5);
  output.worldPosition = worldPosition;
  return output;
}
`,
    fragment: `${nativePbrFragmentPrelude(marker)}
@fragment
fn ${fragmentEntry}(input: VertexOutput) -> @location(0) vec4<f32> {
  return shadePbr(input.normal, input.uv, input.worldPosition);
}
`
  };
}

function nativeSkinnedUnlitShader(vertexEntry: string, fragmentEntry: string, marker: string): { readonly vertex: string; readonly fragment: string } {
  return {
    vertex: `// ${marker}
${nativeUniformStruct()}
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
};

fn jointMatrix(index: f32) -> mat4x4<f32> {
  if (index > 0.5) { return u_draw.joint1; }
  return u_draw.joint0;
}

@vertex
fn ${vertexEntry}(@location(0) position: vec3<f32>, @location(5) joints: vec4<f32>, @location(6) weights: vec4<f32>) -> VertexOutput {
  var output: VertexOutput;
  let skin = jointMatrix(joints.x) * weights.x + jointMatrix(joints.y) * weights.y + jointMatrix(joints.z) * weights.z + jointMatrix(joints.w) * weights.w;
  let weightSum = weights.x + weights.y + weights.z + weights.w;
  let skinned = select(vec4<f32>(position, 1.0), skin * vec4<f32>(position, 1.0), weightSum > 0.0001);
  output.position = a3dWebGPUClipPosition(u_draw.modelViewProjection * skinned);
  return output;
}
`,
    fragment: `// ${marker}
${nativeUniformStruct()}
@fragment
fn ${fragmentEntry}() -> @location(0) vec4<f32> {
  return u_draw.color;
}
`
  };
}

function nativeMorphUnlitShader(vertexEntry: string, fragmentEntry: string, marker: string): { readonly vertex: string; readonly fragment: string } {
  return {
    vertex: `// ${marker}
${nativeUniformStruct()}
struct VertexOutput {
  @builtin(position) position: vec4<f32>,
};

fn morphDelta(index: u32) -> vec3<f32> {
  if (index == 0u) { return u_draw.morph0.xyz; }
  if (index == 1u) { return u_draw.morph1.xyz; }
  if (index == 2u) { return u_draw.morph2.xyz; }
  if (index == 3u) { return u_draw.morph3.xyz; }
  if (index == 4u) { return u_draw.morph4.xyz; }
  if (index == 5u) { return u_draw.morph5.xyz; }
  if (index == 6u) { return u_draw.morph6.xyz; }
  return u_draw.morph7.xyz;
}

@vertex
fn ${vertexEntry}(@location(0) position: vec3<f32>, @builtin(vertex_index) vertexIndex: u32) -> VertexOutput {
  var output: VertexOutput;
  let enabled = min(u_draw.reserved0.y, 1.0);
  let morphed = position + morphDelta(min(vertexIndex, 7u)) * u_draw.reserved0.x * enabled;
  output.position = a3dWebGPUClipPosition(u_draw.modelViewProjection * vec4<f32>(morphed, 1.0));
  return output;
}
`,
    fragment: `// ${marker}
${nativeUniformStruct()}
@fragment
fn ${fragmentEntry}() -> @location(0) vec4<f32> {
  return u_draw.color;
}
`
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
