import { type VertexFormat } from "./VertexFormat";
import { type TextureBinding } from "./TextureBinding";
import { Texture } from "./Texture";
import { reflectShaderSources, type ShaderReflection } from "./ShaderReflection";

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
}

export interface RenderTarget extends DisposableResource {
  readonly id: number;
  readonly width: number;
  readonly height: number;
  readonly label: string;
  readonly colorTexture: Texture;
}

export interface DrawCommand {
  readonly label?: string;
  readonly topology: PrimitiveTopology;
  readonly renderState?: RenderCommandState;
  readonly vertexBuffer: RenderBuffer;
  readonly vertexFormat?: VertexFormat;
  readonly vertexCount: number;
  readonly instanceCount?: number;
  readonly indexBuffer?: RenderBuffer;
  readonly indexType?: IndexType;
  readonly indexCount?: number;
  readonly shader?: RenderShaderProgram;
  readonly uniforms?: ReadonlyMap<string, UniformValue>;
}

export type UniformValue = number | readonly number[] | Float32Array | Int32Array | Uint32Array | TextureBinding;

export interface RenderCommandState {
  readonly depthTest: boolean;
  readonly depthWrite: boolean;
  readonly cullMode: "none" | "back" | "front";
  readonly blend: boolean;
  readonly depthCompare: "always" | "less-equal";
}

export type RenderDeviceCapability =
  | "buffers"
  | "buffer-readback"
  | "shader-validation"
  | "render-targets"
  | "pixel-readback"
  | "draw-validation"
  | "rasterization"
  | "native-render-pipeline"
  | "canvas-surface";

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
  readonly textureBytes?: number;
  readonly disposedBuffers?: number;
  readonly disposedShaders?: number;
  readonly disposedRenderTargets?: number;
  readonly disposedTextures?: number;
  readonly compressedTextures?: number;
  readonly compressedTextureBytes?: number;
  readonly textureFallbacks?: number;
  readonly textureFallbackBytes?: number;
  readonly nativeSubmissions?: number;
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
  readPixels(x: number, y: number, width: number, height: number): Uint8Array;
  beginFrame(width: number, height: number): void;
  clear(color: readonly [number, number, number, number]): void;
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

  constructor(
    public readonly id: number,
    public readonly width: number,
    public readonly height: number,
    public readonly label: string,
    public readonly colorTexture: Texture
  ) {
    this.colorPixels = new Uint8Array(width * height * 4);
  }

  dispose(): void {
    this.disposed = true;
    this.colorTexture.dispose();
  }
}

export class MockRenderDevice implements RenderDevice {
  public readonly kind = "mock";
  public readonly info: RenderDeviceInfo = {
    backend: "mock",
    vendor: "galileo3d",
    renderer: "mock-render-device",
    capabilities: ["buffers", "buffer-readback", "shader-validation", "render-targets", "pixel-readback", "draw-validation"],
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
      new Texture({ width: descriptor.width, height: descriptor.height, label: descriptor.label ?? "render-target-color" })
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

  readPixels(x: number, y: number, width: number, height: number): Uint8Array {
    this.assertAlive();
    if (![x, y, width, height].every(Number.isInteger) || x < 0 || y < 0 || width <= 0 || height <= 0) {
      throw new RenderDeviceError("Readback rectangle must be positive and in bounds", "INVALID_READBACK_RECT", { x, y, width, height });
    }
    const output = new Uint8Array(width * height * 4);
    const target = this.activeRenderTarget;
    if (!target) {
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
    }
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
    const liveTextures = liveRenderTargets.map((target) => target.colorTexture);
    return {
      drawCalls: this.drawCommands.length,
      buffers: [...this.buffers].filter((buffer) => !buffer.disposed).length,
      shaders: [...this.shaders].filter((shader) => !shader.disposed).length,
      renderTargets: liveRenderTargets.length,
      textures: liveRenderTargets.length,
      textureBytes: liveRenderTargets.reduce((total, target) => total + target.colorTexture.byteLength, 0),
      compressedTextures: liveTextures.filter((texture) => texture.format !== "rgba8" && texture.format !== "depth24").length,
      compressedTextureBytes: liveTextures
        .filter((texture) => texture.format !== "rgba8" && texture.format !== "depth24")
        .reduce((total, texture) => total + texture.byteLength, 0),
      textureFallbacks: 0,
      textureFallbackBytes: 0,
      disposedBuffers: [...this.buffers].filter((buffer) => buffer.disposed).length,
      disposedShaders: [...this.shaders].filter((shader) => shader.disposed).length,
      disposedRenderTargets: [...this.renderTargets].filter((target) => target.disposed).length,
      disposedTextures: [...this.renderTargets].filter((target) => target.colorTexture.disposed).length,
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
}

export function viewBytes(view: ArrayBufferView): Uint8Array {
  return new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
}

function rgbaBytes(color: readonly [number, number, number, number]): Uint8Array {
  return new Uint8Array(color.map((channel) => Math.round(Math.max(0, Math.min(1, channel)) * 255)));
}
