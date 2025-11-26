/**
 * @module Rendering/GPU
 * @description
 * GPU device abstraction for cross-platform rendering support.
 * Provides unified interface for WebGPU and WebGL2 backends.
 */

import { Logger } from '../../core/Logger';

const logger = Logger.create('GPUDevice');

/**
 * GPU backend type enumeration.
 */
export enum GPUBackendType {
  /** Modern WebGPU API - preferred when available */
  WebGPU = 'webgpu',
  /** WebGL 2.0 fallback for broader compatibility */
  WebGL2 = 'webgl2',
  /** No GPU available or initialization failed */
  None = 'none',
}

/**
 * GPU feature flags for capability detection.
 */
export enum GPUFeature {
  /** Compute shader support */
  Compute = 'compute',
  /** Multiple render targets (MRT) */
  MultipleRenderTargets = 'multiple-render-targets',
  /** Depth texture support */
  DepthTexture = 'depth-texture',
  /** Floating-point texture support */
  FloatTexture = 'float-texture',
  /** Linear filtering of float textures */
  FloatTextureLinear = 'float-texture-linear',
  /** Anisotropic filtering */
  AnisotropicFiltering = 'anisotropic-filtering',
  /** Instanced rendering */
  Instancing = 'instancing',
  /** Occlusion queries */
  OcclusionQuery = 'occlusion-query',
  /** Timestamp queries for profiling */
  TimestampQuery = 'timestamp-query',
  /** Texture compression BC formats */
  TextureCompressionBC = 'texture-compression-bc',
  /** Texture compression ETC2 formats */
  TextureCompressionETC2 = 'texture-compression-etc2',
  /** Texture compression ASTC formats */
  TextureCompressionASTC = 'texture-compression-astc',
  /** 3D texture support */
  Texture3D = 'texture-3d',
  /** Storage buffer support */
  StorageBuffer = 'storage-buffer',
}

/**
 * GPU device limits and capabilities.
 */
export interface GPULimits {
  /** Maximum texture dimension (width or height) */
  maxTextureDimension2D: number;
  /** Maximum 3D texture dimension */
  maxTextureDimension3D: number;
  /** Maximum cube map face dimension */
  maxTextureDimensionCube: number;
  /** Maximum number of texture layers */
  maxTextureArrayLayers: number;
  /** Maximum number of vertex attributes */
  maxVertexAttributes: number;
  /** Maximum number of vertex buffer bindings */
  maxVertexBuffers: number;
  /** Maximum vertex buffer stride in bytes */
  maxVertexBufferStride: number;
  /** Maximum uniform buffer binding size */
  maxUniformBufferSize: number;
  /** Maximum storage buffer binding size */
  maxStorageBufferSize: number;
  /** Maximum number of color attachments */
  maxColorAttachments: number;
  /** Maximum samples for multisampling */
  maxSamples: number;
  /** Maximum anisotropy level */
  maxAnisotropy: number;
  /** Maximum compute workgroup size X */
  maxComputeWorkgroupSizeX: number;
  /** Maximum compute workgroup size Y */
  maxComputeWorkgroupSizeY: number;
  /** Maximum compute workgroup size Z */
  maxComputeWorkgroupSizeZ: number;
  /** Maximum compute workgroup invocations */
  maxComputeWorkgroupInvocations: number;
  /** Maximum compute dispatch size */
  maxComputeWorkgroupsPerDimension: number;
}

/**
 * GPU device capabilities information.
 */
export interface GPUCapabilities {
  /** Backend type in use */
  backend: GPUBackendType;
  /** Device vendor name */
  vendor: string;
  /** Device renderer name */
  renderer: string;
  /** Supported features */
  features: Set<GPUFeature>;
  /** Device limits */
  limits: GPULimits;
  /** Whether the device supports WGSL shaders */
  supportsWGSL: boolean;
  /** Whether the device supports GLSL shaders */
  supportsGLSL: boolean;
}

/**
 * Shader stage enumeration.
 */
export enum ShaderStage {
  /** Vertex shader stage */
  Vertex = 'vertex',
  /** Fragment/pixel shader stage */
  Fragment = 'fragment',
  /** Compute shader stage */
  Compute = 'compute',
}

/**
 * Shader module descriptor.
 */
export interface ShaderModuleDescriptor {
  /** Shader source code */
  code: string;
  /** Shader language (WGSL or GLSL) */
  language: 'wgsl' | 'glsl';
  /** Entry point function name */
  entryPoint: string;
  /** Shader stage */
  stage: ShaderStage;
  /** Optional debug label */
  label?: string;
}

/**
 * Compiled shader module.
 */
export interface ShaderModule {
  /** Unique identifier */
  readonly id: number;
  /** Debug label */
  readonly label?: string;
  /** Shader stage */
  readonly stage: ShaderStage;
  /** Whether compilation succeeded */
  readonly isValid: boolean;
  /** Compilation error message if any */
  readonly error?: string;
  /** Dispose of shader resources */
  dispose(): void;
}

/**
 * Buffer usage flags (can be combined with bitwise OR).
 */
export enum BufferUsage {
  /** Buffer can be mapped for reading */
  MapRead = 0x0001,
  /** Buffer can be mapped for writing */
  MapWrite = 0x0002,
  /** Buffer can be used as copy source */
  CopySrc = 0x0004,
  /** Buffer can be used as copy destination */
  CopyDst = 0x0008,
  /** Buffer can be used as index buffer */
  Index = 0x0010,
  /** Buffer can be used as vertex buffer */
  Vertex = 0x0020,
  /** Buffer can be used as uniform buffer */
  Uniform = 0x0040,
  /** Buffer can be used as storage buffer */
  Storage = 0x0080,
  /** Buffer can be used as indirect draw/dispatch buffer */
  Indirect = 0x0100,
  /** Buffer can be used as query resolve buffer */
  QueryResolve = 0x0200,
}

/**
 * Texture usage flags (can be combined with bitwise OR).
 */
export enum TextureUsage {
  /** Texture can be used as copy source */
  CopySrc = 0x01,
  /** Texture can be used as copy destination */
  CopyDst = 0x02,
  /** Texture can be sampled in shaders */
  TextureBinding = 0x04,
  /** Texture can be used as storage texture */
  StorageBinding = 0x08,
  /** Texture can be used as render attachment */
  RenderAttachment = 0x10,
}

/**
 * Texture dimension enumeration.
 */
export enum TextureDimension {
  /** 1D texture */
  D1 = '1d',
  /** 2D texture */
  D2 = '2d',
  /** 3D texture */
  D3 = '3d',
}

/**
 * Texture view dimension enumeration.
 */
export enum TextureViewDimension {
  /** 1D texture view */
  D1 = '1d',
  /** 2D texture view */
  D2 = '2d',
  /** 2D array texture view */
  D2Array = '2d-array',
  /** Cube map texture view */
  Cube = 'cube',
  /** Cube map array texture view */
  CubeArray = 'cube-array',
  /** 3D texture view */
  D3 = '3d',
}

/**
 * Texture format enumeration.
 */
export enum TextureFormat {
  // 8-bit formats
  R8Unorm = 'r8unorm',
  R8Snorm = 'r8snorm',
  R8Uint = 'r8uint',
  R8Sint = 'r8sint',

  // 16-bit formats
  R16Uint = 'r16uint',
  R16Sint = 'r16sint',
  R16Float = 'r16float',
  RG8Unorm = 'rg8unorm',
  RG8Snorm = 'rg8snorm',
  RG8Uint = 'rg8uint',
  RG8Sint = 'rg8sint',

  // 32-bit formats
  R32Uint = 'r32uint',
  R32Sint = 'r32sint',
  R32Float = 'r32float',
  RG16Uint = 'rg16uint',
  RG16Sint = 'rg16sint',
  RG16Float = 'rg16float',
  RGBA8Unorm = 'rgba8unorm',
  RGBA8UnormSrgb = 'rgba8unorm-srgb',
  RGBA8Snorm = 'rgba8snorm',
  RGBA8Uint = 'rgba8uint',
  RGBA8Sint = 'rgba8sint',
  BGRA8Unorm = 'bgra8unorm',
  BGRA8UnormSrgb = 'bgra8unorm-srgb',

  // Packed 32-bit formats
  RGB10A2Unorm = 'rgb10a2unorm',
  RG11B10Ufloat = 'rg11b10ufloat',

  // 64-bit formats
  RG32Uint = 'rg32uint',
  RG32Sint = 'rg32sint',
  RG32Float = 'rg32float',
  RGBA16Uint = 'rgba16uint',
  RGBA16Sint = 'rgba16sint',
  RGBA16Float = 'rgba16float',

  // 128-bit formats
  RGBA32Uint = 'rgba32uint',
  RGBA32Sint = 'rgba32sint',
  RGBA32Float = 'rgba32float',

  // Depth/stencil formats
  Depth16Unorm = 'depth16unorm',
  Depth24Plus = 'depth24plus',
  Depth24PlusStencil8 = 'depth24plus-stencil8',
  Depth32Float = 'depth32float',
  Depth32FloatStencil8 = 'depth32float-stencil8',
  Stencil8 = 'stencil8',

  // BC compressed formats (desktop)
  BC1RGBAUnorm = 'bc1-rgba-unorm',
  BC1RGBAUnormSrgb = 'bc1-rgba-unorm-srgb',
  BC2RGBAUnorm = 'bc2-rgba-unorm',
  BC2RGBAUnormSrgb = 'bc2-rgba-unorm-srgb',
  BC3RGBAUnorm = 'bc3-rgba-unorm',
  BC3RGBAUnormSrgb = 'bc3-rgba-unorm-srgb',
  BC4RUnorm = 'bc4-r-unorm',
  BC4RSnorm = 'bc4-r-snorm',
  BC5RGUnorm = 'bc5-rg-unorm',
  BC5RGSnorm = 'bc5-rg-snorm',
  BC6HRGBUfloat = 'bc6h-rgb-ufloat',
  BC6HRGBFloat = 'bc6h-rgb-float',
  BC7RGBAUnorm = 'bc7-rgba-unorm',
  BC7RGBAUnormSrgb = 'bc7-rgba-unorm-srgb',

  // ETC2 compressed formats (mobile)
  ETC2RGB8Unorm = 'etc2-rgb8unorm',
  ETC2RGB8UnormSrgb = 'etc2-rgb8unorm-srgb',
  ETC2RGB8A1Unorm = 'etc2-rgb8a1unorm',
  ETC2RGB8A1UnormSrgb = 'etc2-rgb8a1unorm-srgb',
  ETC2RGBA8Unorm = 'etc2-rgba8unorm',
  ETC2RGBA8UnormSrgb = 'etc2-rgba8unorm-srgb',
  EACR11Unorm = 'eac-r11unorm',
  EACR11Snorm = 'eac-r11snorm',
  EACRG11Unorm = 'eac-rg11unorm',
  EACRG11Snorm = 'eac-rg11snorm',

  // ASTC compressed formats
  ASTC4x4Unorm = 'astc-4x4-unorm',
  ASTC4x4UnormSrgb = 'astc-4x4-unorm-srgb',
  ASTC5x5Unorm = 'astc-5x5-unorm',
  ASTC5x5UnormSrgb = 'astc-5x5-unorm-srgb',
  ASTC6x6Unorm = 'astc-6x6-unorm',
  ASTC6x6UnormSrgb = 'astc-6x6-unorm-srgb',
  ASTC8x8Unorm = 'astc-8x8-unorm',
  ASTC8x8UnormSrgb = 'astc-8x8-unorm-srgb',
}

/**
 * Load operation for render pass attachments.
 */
export enum LoadOp {
  /** Load existing contents */
  Load = 'load',
  /** Clear to a constant value */
  Clear = 'clear',
}

/**
 * Store operation for render pass attachments.
 */
export enum StoreOp {
  /** Store results to memory */
  Store = 'store',
  /** Discard results */
  Discard = 'discard',
}

/**
 * Index format enumeration.
 */
export enum IndexFormat {
  /** 16-bit unsigned integer indices */
  Uint16 = 'uint16',
  /** 32-bit unsigned integer indices */
  Uint32 = 'uint32',
}

/**
 * Vertex format enumeration.
 */
export enum VertexFormat {
  Uint8x2 = 'uint8x2',
  Uint8x4 = 'uint8x4',
  Sint8x2 = 'sint8x2',
  Sint8x4 = 'sint8x4',
  Unorm8x2 = 'unorm8x2',
  Unorm8x4 = 'unorm8x4',
  Snorm8x2 = 'snorm8x2',
  Snorm8x4 = 'snorm8x4',
  Uint16x2 = 'uint16x2',
  Uint16x4 = 'uint16x4',
  Sint16x2 = 'sint16x2',
  Sint16x4 = 'sint16x4',
  Unorm16x2 = 'unorm16x2',
  Unorm16x4 = 'unorm16x4',
  Snorm16x2 = 'snorm16x2',
  Snorm16x4 = 'snorm16x4',
  Float16x2 = 'float16x2',
  Float16x4 = 'float16x4',
  Float32 = 'float32',
  Float32x2 = 'float32x2',
  Float32x3 = 'float32x3',
  Float32x4 = 'float32x4',
  Uint32 = 'uint32',
  Uint32x2 = 'uint32x2',
  Uint32x3 = 'uint32x3',
  Uint32x4 = 'uint32x4',
  Sint32 = 'sint32',
  Sint32x2 = 'sint32x2',
  Sint32x3 = 'sint32x3',
  Sint32x4 = 'sint32x4',
}

/**
 * Primitive topology enumeration.
 */
export enum PrimitiveTopology {
  /** Point list */
  PointList = 'point-list',
  /** Line list */
  LineList = 'line-list',
  /** Line strip */
  LineStrip = 'line-strip',
  /** Triangle list */
  TriangleList = 'triangle-list',
  /** Triangle strip */
  TriangleStrip = 'triangle-strip',
}

/**
 * Face culling mode.
 */
export enum CullMode {
  /** No culling */
  None = 'none',
  /** Cull front faces */
  Front = 'front',
  /** Cull back faces */
  Back = 'back',
}

/**
 * Front face winding order.
 */
export enum FrontFace {
  /** Counter-clockwise */
  CCW = 'ccw',
  /** Clockwise */
  CW = 'cw',
}

/**
 * Comparison function for depth/stencil testing.
 */
export enum CompareFunction {
  Never = 'never',
  Less = 'less',
  Equal = 'equal',
  LessEqual = 'less-equal',
  Greater = 'greater',
  NotEqual = 'not-equal',
  GreaterEqual = 'greater-equal',
  Always = 'always',
}

/**
 * Blend factor enumeration.
 */
export enum BlendFactor {
  Zero = 'zero',
  One = 'one',
  Src = 'src',
  OneMinusSrc = 'one-minus-src',
  SrcAlpha = 'src-alpha',
  OneMinusSrcAlpha = 'one-minus-src-alpha',
  Dst = 'dst',
  OneMinusDst = 'one-minus-dst',
  DstAlpha = 'dst-alpha',
  OneMinusDstAlpha = 'one-minus-dst-alpha',
  SrcAlphaSaturated = 'src-alpha-saturated',
  Constant = 'constant',
  OneMinusConstant = 'one-minus-constant',
}

/**
 * Blend operation enumeration.
 */
export enum BlendOperation {
  Add = 'add',
  Subtract = 'subtract',
  ReverseSubtract = 'reverse-subtract',
  Min = 'min',
  Max = 'max',
}

/**
 * Color write mask (can be combined with bitwise OR).
 */
export enum ColorWriteMask {
  None = 0x0,
  Red = 0x1,
  Green = 0x2,
  Blue = 0x4,
  Alpha = 0x8,
  All = 0xF,
}

/**
 * Stencil operation enumeration.
 */
export enum StencilOperation {
  Keep = 'keep',
  Zero = 'zero',
  Replace = 'replace',
  Invert = 'invert',
  IncrementClamp = 'increment-clamp',
  DecrementClamp = 'decrement-clamp',
  IncrementWrap = 'increment-wrap',
  DecrementWrap = 'decrement-wrap',
}

/**
 * Abstract GPU device interface.
 *
 * Provides a unified API for GPU resource management and command submission
 * across different backend implementations (WebGPU, WebGL2).
 *
 * @example
 * ```typescript
 * // Create device (backend-specific)
 * const device = await createWebGPUDevice(canvas);
 *
 * // Query capabilities
 * const caps = device.getCapabilities();
 * if (caps.features.has(GPUFeature.Compute)) {
 *   console.log('Compute shaders supported');
 * }
 *
 * // Create resources
 * const buffer = device.createBuffer({
 *   size: 1024,
 *   usage: BufferUsage.Vertex | BufferUsage.CopyDst,
 * });
 *
 * // Clean up
 * buffer.dispose();
 * device.dispose();
 * ```
 */
export abstract class GPUDevice {
  protected disposed = false;
  protected nextResourceId = 1;

  /**
   * Gets the device capabilities.
   * @returns Device capabilities information
   */
  abstract getCapabilities(): GPUCapabilities;

  /**
   * Checks if a specific feature is supported.
   * @param feature - Feature to check
   * @returns True if feature is supported
   */
  hasFeature(feature: GPUFeature): boolean {
    return this.getCapabilities().features.has(feature);
  }

  /**
   * Creates a shader module from source code.
   * @param descriptor - Shader module descriptor
   * @returns Promise resolving to compiled shader module
   *
   * @example
   * ```typescript
   * const shader = await device.createShaderModule({
   *   code: `
   *     @vertex
   *     fn main(@location(0) pos: vec3<f32>) -> @builtin(position) vec4<f32> {
   *       return vec4<f32>(pos, 1.0);
   *     }
   *   `,
   *   language: 'wgsl',
   *   entryPoint: 'main',
   *   stage: ShaderStage.Vertex,
   *   label: 'SimpleVertexShader',
   * });
   * ```
   */
  abstract createShaderModule(descriptor: ShaderModuleDescriptor): Promise<ShaderModule>;

  /**
   * Creates a GPU buffer.
   * @param descriptor - Buffer descriptor
   * @returns GPU buffer instance
   */
  abstract createBuffer(descriptor: {
    size: number;
    usage: BufferUsage;
    label?: string;
  }): any; // Returns GPUBuffer

  /**
   * Creates a GPU texture.
   * @param descriptor - Texture descriptor
   * @returns GPU texture instance
   */
  abstract createTexture(descriptor: {
    size: { width: number; height: number; depth?: number };
    format: TextureFormat;
    usage: TextureUsage;
    dimension?: TextureDimension;
    mipLevelCount?: number;
    sampleCount?: number;
    label?: string;
  }): any; // Returns GPUTexture

  /**
   * Creates a GPU sampler.
   * @param descriptor - Sampler descriptor
   * @returns GPU sampler instance
   */
  abstract createSampler(descriptor: {
    magFilter?: 'nearest' | 'linear';
    minFilter?: 'nearest' | 'linear';
    mipmapFilter?: 'nearest' | 'linear';
    addressModeU?: 'clamp-to-edge' | 'repeat' | 'mirror-repeat';
    addressModeV?: 'clamp-to-edge' | 'repeat' | 'mirror-repeat';
    addressModeW?: 'clamp-to-edge' | 'repeat' | 'mirror-repeat';
    lodMinClamp?: number;
    lodMaxClamp?: number;
    compare?: CompareFunction;
    maxAnisotropy?: number;
    label?: string;
  }): any; // Returns GPUSampler

  /**
   * Creates a graphics pipeline.
   * @param descriptor - Pipeline descriptor
   * @returns GPU pipeline instance
   */
  abstract createRenderPipeline(descriptor: any): any; // Returns GPUPipeline

  /**
   * Creates a compute pipeline.
   * @param descriptor - Pipeline descriptor
   * @returns GPU pipeline instance
   */
  abstract createComputePipeline(descriptor: any): any; // Returns GPUPipeline

  /**
   * Creates a command encoder for recording GPU commands.
   * @param label - Optional debug label
   * @returns Command encoder instance
   */
  abstract createCommandEncoder(label?: string): any; // Returns GPUCommandEncoder

  /**
   * Submits encoded commands to the GPU for execution.
   * @param commandBuffers - Array of command buffers to submit
   */
  abstract submit(commandBuffers: any[]): void;

  /**
   * Waits for all pending GPU operations to complete.
   * Useful for synchronization and debugging.
   * @returns Promise that resolves when GPU is idle
   */
  abstract waitForIdle(): Promise<void>;

  /**
   * Gets the current frame's swapchain texture for rendering to screen.
   * @returns Current texture or null if not available
   */
  abstract getCurrentTexture(): any | null; // Returns GPUTexture or null

  /**
   * Presents the current frame to the screen.
   */
  abstract present(): void;

  /**
   * Checks if the device has been disposed.
   * @returns True if disposed
   */
  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Disposes of the device and all associated resources.
   * After calling dispose(), the device cannot be used anymore.
   */
  dispose(): void {
    if (this.disposed) {
      logger.warn('Device already disposed');
      return;
    }

    this.disposed = true;
    logger.info('Device disposed');
  }

  /**
   * Generates a unique resource ID.
   * @returns Unique ID number
   */
  protected generateResourceId(): number {
    return this.nextResourceId++;
  }
}
