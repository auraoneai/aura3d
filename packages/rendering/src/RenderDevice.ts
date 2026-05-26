import { type VertexFormat } from "./VertexFormat";
import { type TextureBinding } from "./TextureBinding";
import { Texture, type TextureFormat } from "./Texture";
import { reflectShaderSources, type ShaderReflection } from "./ShaderReflection";
import type { RendererPostprocessPlanDiagnostics } from "./RendererPostprocessPlan";

export type { ShaderAttributeReflection, ShaderReflection, ShaderUniformReflection } from "./ShaderReflection";

export type RenderBackendKind = "mock" | "webgl2" | "webgpu";

export type BufferUsage = "vertex" | "index" | "uniform" | "readback";

export type IndexType = "uint16" | "uint32";

export type PrimitiveTopology = "triangles" | "lines" | "points";

export interface DisposableResource {
  readonly disposed: boolean;
  dispose(): void;
}

export interface RenderBuffer extends DisposableResource {
  readonly id: number;
  readonly usage: BufferUsage;
  readonly byteLength: number;
}

export interface ShaderSources {
  readonly label: string;
  readonly vertex: string;
  readonly fragment: string;
  readonly marker: string;
}

export interface RenderShaderProgram extends DisposableResource {
  readonly id: number;
  readonly label: string;
  readonly marker: string;
  readonly reflection: ShaderReflection;
}

export interface RenderTargetDescriptor {
  readonly width: number;
  readonly height: number;
  readonly label?: string;
  readonly format?: Extract<TextureFormat, "rgba8" | "rgba16f" | "rgba32f">;
  readonly depth?: boolean | "renderbuffer" | "texture";
}

export interface RenderTarget extends DisposableResource {
  readonly id: number;
  readonly width: number;
  readonly height: number;
  readonly label: string;
  readonly colorTexture: Texture;
  readonly depthTexture?: Texture;
}

export type LdrPostprocessPassName = "tone-mapping" | "color-grade" | "fxaa";

export interface LdrPostprocessPassDescriptor {
  readonly name: LdrPostprocessPassName;
  readonly options: Readonly<Record<string, unknown>>;
}

export interface LdrPostprocessPresentationOptions {
  readonly passes: readonly LdrPostprocessPassDescriptor[];
  readonly outputTarget?: RenderTarget;
  readonly toneMappingDefaults?: Readonly<Record<string, unknown>>;
}

export interface DrawCommand {
  readonly label?: string;
  readonly topology: PrimitiveTopology;
  readonly renderState?: RenderCommandState;
  readonly vertexBuffer: RenderBuffer;
  readonly vertexFormat?: VertexFormat;
  readonly vertexCount: number;
  readonly firstVertex?: number;
  readonly instanceCount?: number;
  readonly instanceAttributes?: readonly InstanceVertexAttribute[];
  readonly indexBuffer?: RenderBuffer;
  readonly indexType?: IndexType;
  readonly indexCount?: number;
  readonly firstIndex?: number;
  readonly shader?: RenderShaderProgram;
  readonly uniforms?: ReadonlyMap<string, UniformValue>;
}

export interface InstanceVertexAttribute {
  readonly buffer: RenderBuffer;
  readonly shaderName: string;
  readonly components: 1 | 2 | 3 | 4;
  readonly offset: number;
  readonly stride: number;
  readonly normalized?: boolean;
  readonly divisor?: number;
}

export type UniformValue = number | readonly number[] | Float32Array | Int32Array | Uint32Array | TextureBinding;

export interface RenderCommandState {
  readonly depthTest: boolean;
  readonly depthWrite: boolean;
  readonly cullMode: "none" | "back" | "front";
  readonly blend: boolean;
  readonly depthCompare: "always" | "less-equal";
  readonly colorWrite?: readonly [boolean, boolean, boolean, boolean];
  readonly scissor?: {
    readonly x: number;
    readonly y: number;
    readonly width: number;
    readonly height: number;
  } | null;
  readonly polygonOffset?: {
    readonly factor: number;
    readonly units: number;
  } | null;
  readonly stencil?: {
    readonly compare?: "never" | "less" | "less-equal" | "greater" | "greater-equal" | "equal" | "not-equal" | "always";
    readonly reference?: number;
    readonly readMask?: number;
    readonly writeMask?: number;
    readonly fail?: "keep" | "zero" | "replace" | "increment" | "decrement" | "invert" | "increment-wrap" | "decrement-wrap";
    readonly depthFail?: "keep" | "zero" | "replace" | "increment" | "decrement" | "invert" | "increment-wrap" | "decrement-wrap";
    readonly depthPass?: "keep" | "zero" | "replace" | "increment" | "decrement" | "invert" | "increment-wrap" | "decrement-wrap";
  } | null;
}

export type RenderDeviceCapability =
  | "buffers"
  | "buffer-readback"
  | "shader-validation"
  | "render-targets"
  | "pixel-readback"
  | "postprocess-presentation"
  | "draw-validation"
  | "rasterization"
  | "native-render-pipeline"
  | "native-sampled-textures"
  | "native-texture-readback"
  | "canvas-surface"
  | "hdr-render-targets"
  | "float-readback"
  | "depth-render-targets"
  | "depth-textures"
  | "contact-shadows"
  | "spot-shadow-maps"
  | "point-shadow-maps"
  | "hdr-image-based-lighting"
  | "anisotropic-texture-filtering"
  | "production-pbr-parity"
  | "gpu-timing"
  | "webgpu-compute";

export interface RenderDeviceInfo {
  readonly backend: RenderBackendKind;
  readonly vendor: string;
  readonly renderer: string;
  readonly capabilities?: readonly RenderDeviceCapability[];
  readonly limitations?: readonly string[];
}

export interface RenderDeviceDiagnostics {
  readonly drawCalls: number;
  readonly buffers: number;
  readonly shaders: number;
  readonly renderTargets?: number;
  readonly textures?: number;
  readonly bufferBytes?: number;
  readonly textureBytes?: number;
  readonly approximateGpuMemoryBytes?: number;
  readonly disposedBuffers?: number;
  readonly disposedShaders?: number;
  readonly disposedRenderTargets?: number;
  readonly disposedTextures?: number;
  readonly compressedTextures?: number;
  readonly compressedTextureBytes?: number;
  readonly textureFallbacks?: number;
  readonly textureFallbackBytes?: number;
  readonly nativeSubmissions?: number;
  readonly nativeTextureBindings?: number;
  readonly nativeGeneratedBasicSubmissions?: number;
  readonly nativeGeneratedTextureSubmissions?: number;
  readonly nativePassthroughSubmissions?: number;
  readonly nativePbrSubmissions?: number;
  readonly nativeInstancedSubmissions?: number;
  readonly nativeSkinnedSubmissions?: number;
  readonly nativeMorphSubmissions?: number;
  readonly nativeEnvironmentBindings?: number;
  readonly nativeShadowMapBindings?: number;
  readonly samplerAnisotropyUploads?: number;
  readonly maxTextureAnisotropy?: number;
  readonly stateCacheIssued?: number;
  readonly stateCacheSkipped?: number;
  readonly stateCacheProgramSwitches?: number;
  readonly stateCacheTextureBinds?: number;
  readonly stateCacheBufferBinds?: number;
  readonly stateCacheVertexArrayBinds?: number;
  readonly stateCacheSamplerBinds?: number;
  readonly submittedObjects?: number;
  readonly visibleObjects?: number;
  readonly culledObjects?: number;
  readonly frustumTestedObjects?: number;
  readonly postprocessPasses?: number;
  readonly postprocessPassNames?: readonly string[];
  readonly postprocessTargetFormat?: "rgba8" | "rgba16f" | "rgba32f";
  readonly postprocessRenderTargets?: number;
  readonly postprocessTextures?: number;
  readonly postprocessTargetWidth?: number;
  readonly postprocessTargetHeight?: number;
  readonly postprocessPlan?: RendererPostprocessPlanDiagnostics;
  readonly lastError: string | null;
  readonly contextLost: boolean;
}

export interface RenderDevice {
  readonly kind: RenderBackendKind;
  readonly info: RenderDeviceInfo;
  readonly disposed: boolean;
  readonly contextLost: boolean;

  createBuffer(usage: BufferUsage, byteLength: number, initialData?: ArrayBufferView): RenderBuffer;
  updateBuffer(buffer: RenderBuffer, byteOffset: number, data: ArrayBufferView): void;
  readBuffer(buffer: RenderBuffer, byteOffset?: number, byteLength?: number): Uint8Array;
  createShaderProgram(sources: ShaderSources): RenderShaderProgram;
  createRenderTarget(descriptor: RenderTargetDescriptor): RenderTarget;
  setRenderTarget(target: RenderTarget | null): void;
  writeRenderTargetPixels?(target: RenderTarget, pixels: Uint8Array): void;
  presentRenderTarget?(source: RenderTarget): void;
  presentLdrPostprocess?(source: RenderTarget, options: LdrPostprocessPresentationOptions): void;
  readPixels(x: number, y: number, width: number, height: number): Uint8Array;
  readPixelsAsync?(x: number, y: number, width: number, height: number): Promise<Uint8Array>;
  readFloatPixels(x: number, y: number, width: number, height: number): Float32Array;
  readFloatPixelsAsync?(x: number, y: number, width: number, height: number): Promise<Float32Array>;
  readDepthPixels?(x: number, y: number, width: number, height: number): Float32Array;
  beginFrame(width: number, height: number): void;
  clear(color: readonly [number, number, number, number]): void;
  clearRenderTarget?(color: readonly [number, number, number, number]): void;
  draw(command: DrawCommand): void;
  endFrame(): void;
  captureState(): ReadonlyMap<string, string | number | boolean | null>;
  getDiagnostics(): RenderDeviceDiagnostics;
  dispose(): void;
}

export class RenderDeviceError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly details: Readonly<Record<string, unknown>> = {}
  ) {
    super(message);
    this.name = "RenderDeviceError";
  }
}

export class MockRenderBuffer implements RenderBuffer {
  public disposed = false;
  public readonly bytes: Uint8Array;

  constructor(
    public readonly id: number,
    public readonly usage: BufferUsage,
    public readonly byteLength: number,
    initialData?: ArrayBufferView
  ) {
    this.bytes = new Uint8Array(byteLength);
    if (initialData) {
      if (initialData.byteLength > byteLength) {
        throw new RenderDeviceError("Initial data exceeds buffer size", "BUFFER_OVERFLOW", {
          byteLength,
          dataByteLength: initialData.byteLength
        });
      }
      this.bytes.set(viewBytes(initialData), 0);
    }
  }

  dispose(): void {
    this.disposed = true;
  }
}

export class MockShaderProgram implements RenderShaderProgram {
  public disposed = false;

  constructor(
    public readonly id: number,
    public readonly label: string,
    public readonly marker: string,
    public readonly reflection: ShaderReflection
  ) {}

  dispose(): void {
    this.disposed = true;
  }
}

export class MockRenderTarget implements RenderTarget {
  public disposed = false;
  public readonly colorPixels: Uint8Array;
  public readonly colorFloatPixels: Float32Array | null;
  public readonly depthPixels: Float32Array | null;

  constructor(
    public readonly id: number,
    public readonly width: number,
    public readonly height: number,
    public readonly label: string,
    public readonly colorTexture: Texture,
    public readonly depthTexture?: Texture
  ) {
    this.colorPixels = new Uint8Array(width * height * 4);
    this.colorFloatPixels = colorTexture.format === "rgba16f" || colorTexture.format === "rgba32f"
      ? new Float32Array(width * height * 4)
      : null;
    this.depthPixels = depthTexture ? new Float32Array(width * height).fill(1) : null;
  }

  dispose(): void {
    this.disposed = true;
    this.colorTexture.dispose();
    this.depthTexture?.dispose();
  }
}

export class MockRenderDevice implements RenderDevice {
  public readonly kind = "mock";
  public readonly info: RenderDeviceInfo = {
    backend: "mock",
    vendor: "aura3d",
    renderer: "mock-render-device",
    capabilities: ["buffers", "buffer-readback", "shader-validation", "render-targets", "pixel-readback", "postprocess-presentation", "draw-validation", "spot-shadow-maps", "depth-render-targets", "depth-textures"],
    limitations: ["Mock render device validates commands and readback contracts but does not rasterize geometry."]
  };

  public disposed = false;
  public contextLost = false;
  public readonly drawCommands: DrawCommand[] = [];
  private nextId = 1;
  private buffers = new Set<MockRenderBuffer>();
  private shaders = new Set<MockShaderProgram>();
  private renderTargets = new Set<MockRenderTarget>();
  private activeRenderTarget: MockRenderTarget | null = null;
  private backbufferPixels: Uint8Array | null = null;
  private backbufferWidth = 0;
  private backbufferHeight = 0;
  private lastError: string | null = null;
  private frameActive = false;
  private viewportWidth = 0;
  private viewportHeight = 0;
  private clearColor: readonly [number, number, number, number] = [0, 0, 0, 1];

  createBuffer(usage: BufferUsage, byteLength: number, initialData?: ArrayBufferView): RenderBuffer {
    this.assertAlive();
    if (byteLength <= 0 || !Number.isInteger(byteLength)) {
      throw new RenderDeviceError("Buffer byteLength must be a positive integer", "INVALID_BUFFER_SIZE", { byteLength });
    }
    const buffer = new MockRenderBuffer(this.nextId++, usage, byteLength, initialData);
    this.buffers.add(buffer);
    return buffer;
  }

  updateBuffer(buffer: RenderBuffer, byteOffset: number, data: ArrayBufferView): void {
    this.assertAlive();
    const mockBuffer = this.requireMockBuffer(buffer);
    if (mockBuffer.disposed) {
      throw new RenderDeviceError("Cannot update a disposed buffer", "DISPOSED_RESOURCE", { bufferId: buffer.id });
    }
    if (byteOffset < 0 || byteOffset + data.byteLength > mockBuffer.byteLength) {
      throw new RenderDeviceError("Buffer update range is out of bounds", "BUFFER_RANGE_OUT_OF_BOUNDS", {
        byteOffset,
        dataByteLength: data.byteLength,
        byteLength: mockBuffer.byteLength
      });
    }
    mockBuffer.bytes.set(viewBytes(data), byteOffset);
  }

  readBuffer(buffer: RenderBuffer, byteOffset = 0, byteLength = buffer.byteLength - byteOffset): Uint8Array {
    this.assertAlive();
    const mockBuffer = this.requireMockBuffer(buffer);
    if (mockBuffer.disposed) {
      throw new RenderDeviceError("Cannot read a disposed buffer", "DISPOSED_RESOURCE", { bufferId: buffer.id });
    }
    if (byteOffset < 0 || byteLength < 0 || byteOffset + byteLength > mockBuffer.byteLength) {
      throw new RenderDeviceError("Buffer read range is out of bounds", "BUFFER_RANGE_OUT_OF_BOUNDS", {
        byteOffset,
        byteLength,
        bufferByteLength: mockBuffer.byteLength
      });
    }
    return mockBuffer.bytes.slice(byteOffset, byteOffset + byteLength);
  }

  createShaderProgram(sources: ShaderSources): RenderShaderProgram {
    this.assertAlive();
    if (!sources.vertex.includes(sources.marker) || !sources.fragment.includes(sources.marker)) {
      throw new RenderDeviceError("Shader source marker is missing from compiled sources", "SHADER_MARKER_MISSING", {
        label: sources.label,
        marker: sources.marker
      });
    }
    const program = new MockShaderProgram(this.nextId++, sources.label, sources.marker, reflectShaderSources(sources));
    this.shaders.add(program);
    return program;
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
    const target = new MockRenderTarget(
      this.nextId++,
      descriptor.width,
      descriptor.height,
      descriptor.label ?? "render-target",
      new Texture({ width: descriptor.width, height: descriptor.height, format: descriptor.format ?? "rgba8", label: descriptor.label ?? "render-target-color" }),
      descriptor.depth === "texture"
        ? new Texture({ width: descriptor.width, height: descriptor.height, format: "depth24", label: `${descriptor.label ?? "render-target"}-depth` })
        : undefined
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
    if (!(target instanceof MockRenderTarget) || !this.renderTargets.has(target) || target.disposed) {
      throw new RenderDeviceError("Render target is not a live resource owned by this device", "INVALID_RESOURCE", {
        targetId: target.id
      });
    }
    this.activeRenderTarget = target;
  }

  writeRenderTargetPixels(target: RenderTarget, pixels: Uint8Array): void {
    this.assertAlive();
    const mockTarget = this.requireMockRenderTarget(target);
    if (pixels.length !== mockTarget.width * mockTarget.height * 4) {
      throw new RenderDeviceError("Render-target pixel upload must contain width * height * 4 bytes", "INVALID_PIXEL_UPLOAD_SIZE", {
        targetId: target.id,
        byteLength: pixels.length,
        expectedByteLength: mockTarget.width * mockTarget.height * 4
      });
    }
    mockTarget.colorPixels.set(pixels);
    if (mockTarget.colorFloatPixels) {
      for (let index = 0; index < pixels.length; index += 4) {
        mockTarget.colorFloatPixels[index] = (pixels[index] ?? 0) / 255;
        mockTarget.colorFloatPixels[index + 1] = (pixels[index + 1] ?? 0) / 255;
        mockTarget.colorFloatPixels[index + 2] = (pixels[index + 2] ?? 0) / 255;
        mockTarget.colorFloatPixels[index + 3] = (pixels[index + 3] ?? 0) / 255;
      }
    }
  }

  presentRenderTarget(source: RenderTarget): void {
    this.assertAlive();
    const mockSource = this.requireMockRenderTarget(source);
    this.backbufferPixels = new Uint8Array(mockSource.colorPixels);
    this.backbufferWidth = mockSource.width;
    this.backbufferHeight = mockSource.height;
    this.activeRenderTarget = null;
  }

  readPixels(x: number, y: number, width: number, height: number): Uint8Array {
    this.assertAlive();
    if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width <= 0 || height <= 0) {
      throw new RenderDeviceError("Readback rectangle must be positive and in bounds", "INVALID_READBACK_RECT", { x, y, width, height });
    }
    const output = new Uint8Array(width * height * 4);
    const target = this.activeRenderTarget;
    if (!target) {
      if (this.backbufferPixels) {
        if (x + width > this.backbufferWidth || y + height > this.backbufferHeight) {
          throw new RenderDeviceError("Readback rectangle exceeds backbuffer bounds", "READBACK_OUT_OF_BOUNDS", {
            x,
            y,
            width,
            height,
            boundsWidth: this.backbufferWidth,
            boundsHeight: this.backbufferHeight
          });
        }
        for (let row = 0; row < height; row += 1) {
          const sourceOffset = ((y + row) * this.backbufferWidth + x) * 4;
          const destOffset = row * width * 4;
          output.set(this.backbufferPixels.subarray(sourceOffset, sourceOffset + width * 4), destOffset);
        }
        return output;
      }
      const bytes = rgbaBytes(this.clearColor);
      for (let i = 0; i < output.length; i += 4) output.set(bytes, i);
      return output;
    }
    if (x + width > target.width || y + height > target.height) {
      throw new RenderDeviceError("Readback rectangle exceeds render target bounds", "READBACK_OUT_OF_BOUNDS", { x, y, width, height });
    }
    for (let row = 0; row < height; row += 1) {
      const sourceOffset = ((y + row) * target.width + x) * 4;
      const destOffset = row * width * 4;
      output.set(target.colorPixels.subarray(sourceOffset, sourceOffset + width * 4), destOffset);
    }
    return output;
  }

  readFloatPixels(x: number, y: number, width: number, height: number): Float32Array {
    this.assertAlive();
    if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width <= 0 || height <= 0) {
      throw new RenderDeviceError("Float readback rectangle must be positive and in bounds", "INVALID_READBACK_RECT", { x, y, width, height });
    }
    const output = new Float32Array(width * height * 4);
    const target = this.activeRenderTarget;
    if (!target) {
      if (this.backbufferPixels) {
        if (x + width > this.backbufferWidth || y + height > this.backbufferHeight) {
          throw new RenderDeviceError("Float readback rectangle exceeds backbuffer bounds", "READBACK_OUT_OF_BOUNDS", {
            x,
            y,
            width,
            height,
            boundsWidth: this.backbufferWidth,
            boundsHeight: this.backbufferHeight
          });
        }
        for (let row = 0; row < height; row += 1) {
          const sourceOffset = ((y + row) * this.backbufferWidth + x) * 4;
          const destOffset = row * width * 4;
          for (let column = 0; column < width * 4; column += 1) {
            output[destOffset + column] = (this.backbufferPixels[sourceOffset + column] ?? 0) / 255;
          }
        }
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
    if (x + width > target.width || y + height > target.height) {
      throw new RenderDeviceError("Float readback rectangle exceeds render target bounds", "READBACK_OUT_OF_BOUNDS", { x, y, width, height });
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

  readDepthPixels(x: number, y: number, width: number, height: number): Float32Array {
    this.assertAlive();
    if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width <= 0 || height <= 0) {
      throw new RenderDeviceError("Depth readback rectangle must be positive and in bounds", "INVALID_READBACK_RECT", { x, y, width, height });
    }
    const target = this.activeRenderTarget;
    if (!target || !target.depthPixels) {
      throw new RenderDeviceError("Depth readback requires an active render target with a sampleable depth texture.", "DEPTH_READBACK_UNAVAILABLE");
    }
    if (x + width > target.width || y + height > target.height) {
      throw new RenderDeviceError("Depth readback rectangle exceeds render target bounds", "READBACK_OUT_OF_BOUNDS", { x, y, width, height });
    }
    const output = new Float32Array(width * height);
    for (let row = 0; row < height; row += 1) {
      const sourceOffset = (y + row) * target.width + x;
      const destOffset = row * width;
      output.set(target.depthPixels.subarray(sourceOffset, sourceOffset + width), destOffset);
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
    this.viewportWidth = width;
    this.viewportHeight = height;
    this.drawCommands.length = 0;
  }

  clear(color: readonly [number, number, number, number]): void {
    this.assertAlive();
    this.assertFrame();
    this.clearColor = color;
    if (this.activeRenderTarget) {
      const bytes = rgbaBytes(color);
      for (let i = 0; i < this.activeRenderTarget.colorPixels.length; i += 4) {
        this.activeRenderTarget.colorPixels.set(bytes, i);
      }
      if (this.activeRenderTarget.colorFloatPixels) {
        for (let i = 0; i < this.activeRenderTarget.colorFloatPixels.length; i += 4) {
          this.activeRenderTarget.colorFloatPixels[i] = color[0];
          this.activeRenderTarget.colorFloatPixels[i + 1] = color[1];
          this.activeRenderTarget.colorFloatPixels[i + 2] = color[2];
          this.activeRenderTarget.colorFloatPixels[i + 3] = color[3];
        }
      }
      this.activeRenderTarget.depthPixels?.fill(1);
    }
  }

  clearRenderTarget(color: readonly [number, number, number, number]): void {
    this.assertAlive();
    this.assertFrame();
    const previous = this.clearColor;
    this.clear(color);
    this.clearColor = previous;
  }

  draw(command: DrawCommand): void {
    this.assertAlive();
    this.assertFrame();
    if (command.vertexBuffer.disposed) {
      throw new RenderDeviceError("Cannot draw with a disposed vertex buffer", "DISPOSED_RESOURCE", {
        bufferId: command.vertexBuffer.id
      });
    }
    if (command.indexBuffer?.disposed) {
      throw new RenderDeviceError("Cannot draw with a disposed index buffer", "DISPOSED_RESOURCE", {
        bufferId: command.indexBuffer.id
      });
    }
    for (const attribute of command.instanceAttributes ?? []) {
      if (attribute.buffer.disposed) {
        throw new RenderDeviceError("Cannot draw with a disposed instance attribute buffer", "DISPOSED_RESOURCE", {
          bufferId: attribute.buffer.id,
          attribute: attribute.shaderName
        });
      }
      validateInstanceVertexAttribute(attribute);
    }
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
    this.drawCommands.push(command);
  }

  endFrame(): void {
    this.assertAlive();
    this.assertFrame();
    this.frameActive = false;
  }

  captureState(): ReadonlyMap<string, string | number | boolean | null> {
    return new Map<string, string | number | boolean | null>([
      ["backend", this.kind],
      ["disposed", this.disposed],
      ["contextLost", this.contextLost],
      ["frameActive", this.frameActive],
      ["viewportWidth", this.viewportWidth],
      ["viewportHeight", this.viewportHeight],
      ["clearR", this.clearColor[0]],
      ["clearG", this.clearColor[1]],
      ["clearB", this.clearColor[2]],
      ["clearA", this.clearColor[3]],
      ["drawCalls", this.drawCommands.length]
    ]);
  }

  getDiagnostics(): RenderDeviceDiagnostics {
    const liveRenderTargets = [...this.renderTargets].filter((target) => !target.disposed);
    const liveTextures = liveRenderTargets.flatMap((target) => target.depthTexture ? [target.colorTexture, target.depthTexture] : [target.colorTexture]);
    const bufferBytes = [...this.buffers].filter((buffer) => !buffer.disposed).reduce((total, buffer) => total + buffer.byteLength, 0);
    const textureBytes = liveTextures.reduce((total, texture) => total + texture.byteLength, 0);
    return {
      drawCalls: this.drawCommands.length,
      buffers: [...this.buffers].filter((buffer) => !buffer.disposed).length,
      shaders: [...this.shaders].filter((shader) => !shader.disposed).length,
      renderTargets: liveRenderTargets.length,
      textures: liveTextures.length,
      bufferBytes,
      textureBytes,
      approximateGpuMemoryBytes: bufferBytes + textureBytes,
      compressedTextures: liveTextures.filter((texture) => texture.format !== "rgba8" && texture.format !== "depth24").length,
      compressedTextureBytes: liveTextures
        .filter((texture) => texture.format !== "rgba8" && texture.format !== "depth24")
        .reduce((total, texture) => total + texture.byteLength, 0),
      textureFallbacks: 0,
      textureFallbackBytes: 0,
      disposedBuffers: [...this.buffers].filter((buffer) => buffer.disposed).length,
      disposedShaders: [...this.shaders].filter((shader) => shader.disposed).length,
      disposedRenderTargets: [...this.renderTargets].filter((target) => target.disposed).length,
      disposedTextures: [...this.renderTargets].reduce((total, target) => total + (target.colorTexture.disposed ? 1 : 0) + (target.depthTexture?.disposed ? 1 : 0), 0),
      lastError: this.lastError,
      contextLost: this.contextLost
    };
  }

  dispose(): void {
    for (const buffer of this.buffers) {
      buffer.dispose();
    }
    for (const shader of this.shaders) {
      shader.dispose();
    }
    for (const target of this.renderTargets) {
      target.dispose();
    }
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
    if (!this.frameActive) {
      throw new RenderDeviceError("No active frame", "NO_ACTIVE_FRAME");
    }
  }

  private requireMockBuffer(buffer: RenderBuffer): MockRenderBuffer {
    if (!(buffer instanceof MockRenderBuffer) || !this.buffers.has(buffer)) {
      throw new RenderDeviceError("Buffer was not created by this device", "FOREIGN_RESOURCE", { bufferId: buffer.id });
    }
    return buffer;
  }

  private requireMockRenderTarget(target: RenderTarget): MockRenderTarget {
    if (!(target instanceof MockRenderTarget) || !this.renderTargets.has(target) || target.disposed) {
      throw new RenderDeviceError("Render target is not a live resource owned by this device", "INVALID_RESOURCE", {
        targetId: target.id
      });
    }
    return target;
  }
}

function validateInstanceVertexAttribute(attribute: InstanceVertexAttribute): void {
  if (!attribute.shaderName || typeof attribute.shaderName !== "string") {
    throw new RenderDeviceError("Instance vertex attribute shaderName must be a non-empty string", "INVALID_DRAW_COMMAND");
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
  const divisor = attribute.divisor ?? 1;
  if (!Number.isInteger(divisor) || divisor <= 0) {
    throw new RenderDeviceError("Instance vertex attribute divisor must be a positive integer", "INVALID_DRAW_COMMAND", {
      attribute: attribute.shaderName,
      divisor
    });
  }
}

export function viewBytes(view: ArrayBufferView): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

function rgbaBytes(color: readonly [number, number, number, number]): Uint8Array {
  return new Uint8Array(color.map((channel) => Math.round(Math.max(0, Math.min(1, channel)) * 255)));
}
