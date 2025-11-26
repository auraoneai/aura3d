/**
 * @module Rendering/Core
 * @description
 * Abstract interface for GPU operations, providing unified API for WebGPU and WebGL2.
 * Handles resource creation, pipeline compilation, and command submission.
 */

import { Logger } from '../core/Logger';
import {
  GPUDevice as BaseGPUDevice,
  GPUCapabilities,
  GPUBackendType,
  TextureFormat,
  BufferUsage,
  TextureUsage,
  ShaderModuleDescriptor,
  ShaderModule,
  CompareFunction,
} from './gpu/GPUDevice';

const logger = Logger.create('RenderDevice');

/**
 * Device capabilities reported by the GPU.
 */
export interface DeviceCapabilities {
  /** Maximum 2D texture dimension */
  maxTextureSize: number;
  /** Maximum texture array layers */
  maxTextureLayers: number;
  /** Maximum color attachments */
  maxColorAttachments: number;
  /** Maximum uniform buffer size */
  maxUniformBufferSize: number;
  /** Maximum storage buffer size */
  maxStorageBufferSize: number;
  /** Maximum compute workgroup size [x, y, z] */
  maxComputeWorkgroupSize: [number, number, number];
  /** Whether compute shaders are supported */
  supportsCompute: boolean;
  /** Whether timestamp queries are supported */
  supportsTimestampQueries: boolean;
  /** Whether 32-bit float depth is supported */
  supportsDepth32Float: boolean;
  /** Whether BC texture compression is supported */
  supportsBC: boolean;
  /** Whether ASTC texture compression is supported */
  supportsASTC: boolean;
  /** Maximum anisotropy level */
  maxAnisotropy: number;
  /** Maximum samples for MSAA */
  maxSamples: number;
}

/**
 * Buffer descriptor.
 */
export interface BufferDesc {
  /** Size in bytes */
  size: number;
  /** Usage flags */
  usage: BufferUsage;
  /** Whether buffer can be mapped for read/write */
  mappedAtCreation?: boolean;
  /** Debug label */
  label?: string;
}

/**
 * Texture descriptor.
 */
export interface TextureDesc {
  /** Texture dimensions */
  size: { width: number; height: number; depth?: number };
  /** Texture format */
  format: TextureFormat;
  /** Usage flags */
  usage: TextureUsage;
  /** Texture dimension (1d, 2d, 3d) */
  dimension?: '1d' | '2d' | '3d';
  /** Mip level count */
  mipLevelCount?: number;
  /** Sample count for MSAA */
  sampleCount?: number;
  /** Debug label */
  label?: string;
}

/**
 * Sampler descriptor.
 */
export interface SamplerDesc {
  /** Magnification filter */
  magFilter?: 'nearest' | 'linear';
  /** Minification filter */
  minFilter?: 'nearest' | 'linear';
  /** Mipmap filter */
  mipmapFilter?: 'nearest' | 'linear';
  /** Address mode U */
  addressModeU?: 'clamp-to-edge' | 'repeat' | 'mirror-repeat';
  /** Address mode V */
  addressModeV?: 'clamp-to-edge' | 'repeat' | 'mirror-repeat';
  /** Address mode W */
  addressModeW?: 'clamp-to-edge' | 'repeat' | 'mirror-repeat';
  /** Min LOD clamp */
  lodMinClamp?: number;
  /** Max LOD clamp */
  lodMaxClamp?: number;
  /** Comparison function for shadow sampling */
  compare?: CompareFunction;
  /** Max anisotropy level */
  maxAnisotropy?: number;
  /** Debug label */
  label?: string;
}

/**
 * Shader descriptor.
 */
export interface ShaderDesc {
  /** Shader source code */
  code: string;
  /** Shader entry point */
  entryPoint: string;
  /** Shader stage */
  stage: 'vertex' | 'fragment' | 'compute';
  /** Debug label */
  label?: string;
}

/**
 * Pipeline descriptor for graphics pipelines.
 */
export interface PipelineDesc {
  /** Vertex shader */
  vertexShader: any; // ShaderModule
  /** Fragment shader */
  fragmentShader?: any; // ShaderModule
  /** Compute shader (for compute pipelines) */
  computeShader?: any; // ShaderModule
  /** Vertex buffer layouts */
  vertexBuffers?: VertexBufferLayout[];
  /** Primitive topology */
  topology?: 'point-list' | 'line-list' | 'line-strip' | 'triangle-list' | 'triangle-strip';
  /** Cull mode */
  cullMode?: 'none' | 'front' | 'back';
  /** Front face winding */
  frontFace?: 'ccw' | 'cw';
  /** Color target states */
  targets?: ColorTargetState[];
  /** Depth-stencil state */
  depthStencil?: DepthStencilState;
  /** Multisample state */
  multisample?: MultisampleState;
  /** Debug label */
  label?: string;
}

/**
 * Vertex buffer layout descriptor.
 */
export interface VertexBufferLayout {
  /** Stride in bytes */
  arrayStride: number;
  /** Step mode */
  stepMode?: 'vertex' | 'instance';
  /** Vertex attributes */
  attributes: VertexAttribute[];
}

/**
 * Vertex attribute descriptor.
 */
export interface VertexAttribute {
  /** Attribute format */
  format: string; // e.g., 'float32x3'
  /** Offset in bytes */
  offset: number;
  /** Shader location */
  shaderLocation: number;
}

/**
 * Color target state.
 */
export interface ColorTargetState {
  /** Target format */
  format: TextureFormat;
  /** Blend state */
  blend?: BlendState;
  /** Write mask */
  writeMask?: number;
}

/**
 * Blend state.
 */
export interface BlendState {
  /** Color blend */
  color: BlendComponent;
  /** Alpha blend */
  alpha: BlendComponent;
}

/**
 * Blend component.
 */
export interface BlendComponent {
  /** Source factor */
  srcFactor: BlendFactor;
  /** Destination factor */
  dstFactor: BlendFactor;
  /** Blend operation */
  operation: 'add' | 'subtract' | 'reverse-subtract' | 'min' | 'max';
}

/**
 * Blend factor enumeration.
 */
export type BlendFactor =
  | 'zero'
  | 'one'
  | 'src'
  | 'one-minus-src'
  | 'src-alpha'
  | 'one-minus-src-alpha'
  | 'dst'
  | 'one-minus-dst'
  | 'dst-alpha'
  | 'one-minus-dst-alpha'
  | 'src-alpha-saturated'
  | 'constant'
  | 'one-minus-constant';

/**
 * Depth-stencil state.
 */
export interface DepthStencilState {
  /** Depth-stencil format */
  format: TextureFormat;
  /** Depth write enabled */
  depthWriteEnabled?: boolean;
  /** Depth compare function */
  depthCompare?: CompareFunction;
  /** Stencil front state */
  stencilFront?: StencilFaceState;
  /** Stencil back state */
  stencilBack?: StencilFaceState;
  /** Stencil read mask */
  stencilReadMask?: number;
  /** Stencil write mask */
  stencilWriteMask?: number;
  /** Depth bias */
  depthBias?: number;
  /** Depth bias slope scale */
  depthBiasSlopeScale?: number;
  /** Depth bias clamp */
  depthBiasClamp?: number;
}

/**
 * Stencil face state.
 */
export interface StencilFaceState {
  /** Comparison function */
  compare?: CompareFunction;
  /** Fail operation */
  failOp?: StencilOperation;
  /** Depth fail operation */
  depthFailOp?: StencilOperation;
  /** Pass operation */
  passOp?: StencilOperation;
}

/**
 * Stencil operation enumeration.
 */
export type StencilOperation =
  | 'keep'
  | 'zero'
  | 'replace'
  | 'invert'
  | 'increment-clamp'
  | 'decrement-clamp'
  | 'increment-wrap'
  | 'decrement-wrap';

/**
 * Multisample state.
 */
export interface MultisampleState {
  /** Sample count */
  count?: number;
  /** Sample mask */
  mask?: number;
  /** Alpha to coverage enabled */
  alphaToCoverageEnabled?: boolean;
}

/**
 * Bind group descriptor.
 */
export interface BindGroupDesc {
  /** Bind group layout */
  layout: any; // BindGroupLayout
  /** Entries */
  entries: BindGroupEntry[];
  /** Debug label */
  label?: string;
}

/**
 * Bind group entry.
 */
export interface BindGroupEntry {
  /** Binding index */
  binding: number;
  /** Resource */
  resource:
    | { buffer: any; offset?: number; size?: number }
    | { sampler: any }
    | { texture: any };
}

/**
 * Abstract render device interface for GPU operations.
 * Provides unified API across WebGPU and WebGL2 backends.
 *
 * @example
 * ```typescript
 * // Create device (implementation-specific)
 * const device = await createWebGPUDevice(canvas);
 *
 * // Query capabilities
 * const caps = device.getCapabilities();
 * console.log('Max texture size:', caps.maxTextureSize);
 *
 * // Create buffer
 * const buffer = device.createBuffer({
 *   size: 1024,
 *   usage: BufferUsage.Vertex | BufferUsage.CopyDst,
 *   label: 'VertexBuffer',
 * });
 *
 * // Create texture
 * const texture = device.createTexture({
 *   size: { width: 512, height: 512 },
 *   format: TextureFormat.RGBA8Unorm,
 *   usage: TextureUsage.TextureBinding | TextureUsage.RenderAttachment,
 *   label: 'ColorTexture',
 * });
 *
 * // Clean up
 * device.destroy(buffer);
 * device.destroy(texture);
 * device.dispose();
 * ```
 */
export abstract class RenderDevice extends BaseGPUDevice {
  /**
   * Device type identifier.
   */
  abstract readonly type: 'webgpu' | 'webgl2';

  /**
   * Canvas element for rendering.
   */
  protected canvas: HTMLCanvasElement | null = null;

  /**
   * Device capabilities.
   */
  protected caps: DeviceCapabilities | null = null;

  /**
   * Gets the device capabilities.
   *
   * @returns Device capabilities
   *
   * @example
   * ```typescript
   * const caps = device.getCapabilities();
   * if (caps.supportsCompute) {
   *   console.log('Compute shaders available');
   * }
   * ```
   */
  abstract getCapabilities(): DeviceCapabilities;

  /**
   * Creates a GPU buffer.
   *
   * @param desc - Buffer descriptor
   * @returns GPU buffer
   *
   * @example
   * ```typescript
   * const buffer = device.createBuffer({
   *   size: 256,
   *   usage: BufferUsage.Uniform | BufferUsage.CopyDst,
   *   label: 'UniformBuffer',
   * });
   * ```
   */
  abstract createBuffer(desc: BufferDesc): any;

  /**
   * Creates a GPU texture.
   *
   * @param desc - Texture descriptor
   * @returns GPU texture
   *
   * @example
   * ```typescript
   * const texture = device.createTexture({
   *   size: { width: 1024, height: 1024 },
   *   format: TextureFormat.RGBA8Unorm,
   *   usage: TextureUsage.TextureBinding | TextureUsage.CopyDst,
   *   mipLevelCount: 10,
   *   label: 'DiffuseMap',
   * });
   * ```
   */
  abstract createTexture(desc: TextureDesc): any;

  /**
   * Creates a GPU sampler.
   *
   * @param desc - Sampler descriptor
   * @returns GPU sampler
   *
   * @example
   * ```typescript
   * const sampler = device.createSampler({
   *   magFilter: 'linear',
   *   minFilter: 'linear',
   *   mipmapFilter: 'linear',
   *   addressModeU: 'repeat',
   *   addressModeV: 'repeat',
   *   maxAnisotropy: 16,
   *   label: 'LinearSampler',
   * });
   * ```
   */
  abstract createSampler(desc: SamplerDesc): any;

  /**
   * Creates a shader module.
   *
   * @param desc - Shader descriptor
   * @returns Promise resolving to shader module
   *
   * @example
   * ```typescript
   * const shader = await device.createShader({
   *   code: shaderSource,
   *   entryPoint: 'main',
   *   stage: 'vertex',
   *   label: 'VertexShader',
   * });
   * ```
   */
  abstract createShader(desc: ShaderDesc): Promise<any>;

  /**
   * Creates a render pipeline.
   *
   * @param desc - Pipeline descriptor
   * @returns GPU pipeline
   *
   * @example
   * ```typescript
   * const pipeline = device.createPipeline({
   *   vertexShader: vertShader,
   *   fragmentShader: fragShader,
   *   topology: 'triangle-list',
   *   targets: [{ format: TextureFormat.BGRA8Unorm }],
   *   depthStencil: {
   *     format: TextureFormat.Depth24PlusStencil8,
   *     depthWriteEnabled: true,
   *     depthCompare: 'less',
   *   },
   *   label: 'MainPipeline',
   * });
   * ```
   */
  abstract createPipeline(desc: PipelineDesc): any;

  /**
   * Creates a bind group for shader resource bindings.
   *
   * @param desc - Bind group descriptor
   * @returns GPU bind group
   *
   * @example
   * ```typescript
   * const bindGroup = device.createBindGroup({
   *   layout: bindGroupLayout,
   *   entries: [
   *     { binding: 0, resource: { buffer: uniformBuffer } },
   *     { binding: 1, resource: { texture: texture.createView() } },
   *     { binding: 2, resource: { sampler: sampler } },
   *   ],
   *   label: 'MaterialBindGroup',
   * });
   * ```
   */
  abstract createBindGroup(desc: BindGroupDesc): any;

  /**
   * Creates a command encoder for recording GPU commands.
   *
   * @param label - Debug label (optional)
   * @returns Command encoder
   *
   * @example
   * ```typescript
   * const encoder = device.createCommandEncoder('FrameCommands');
   * const passEncoder = encoder.beginRenderPass(passDesc);
   * // Record commands...
   * passEncoder.end();
   * const commandBuffer = encoder.finish();
   * device.submit([commandBuffer]);
   * ```
   */
  abstract createCommandEncoder(label?: string): any;

  /**
   * Submits command buffers to the GPU for execution.
   *
   * @param commandBuffers - Array of command buffers
   *
   * @example
   * ```typescript
   * device.submit([commandBuffer1, commandBuffer2]);
   * ```
   */
  abstract submit(commandBuffers: any[]): void;

  /**
   * Waits for all pending GPU operations to complete.
   * Useful for synchronization and profiling.
   *
   * @returns Promise that resolves when GPU is idle
   *
   * @example
   * ```typescript
   * await device.waitForGPU();
   * console.log('GPU idle');
   * ```
   */
  abstract waitForGPU(): Promise<void>;

  /**
   * Destroys a GPU resource and frees its memory.
   *
   * @param resource - Resource to destroy
   *
   * @example
   * ```typescript
   * device.destroy(buffer);
   * device.destroy(texture);
   * device.destroy(pipeline);
   * ```
   */
  abstract destroy(resource: any): void;

  /**
   * Gets the current swap chain texture for presentation.
   *
   * @returns Current texture or null if not available
   *
   * @example
   * ```typescript
   * const backbuffer = device.getCurrentTexture();
   * if (backbuffer) {
   *   // Render to backbuffer...
   *   device.present();
   * }
   * ```
   */
  abstract getCurrentTexture(): any | null;

  /**
   * Presents the current frame to the screen.
   *
   * @example
   * ```typescript
   * device.present();
   * ```
   */
  abstract present(): void;

  /**
   * Writes data to a GPU buffer.
   *
   * @param buffer - Target buffer
   * @param offset - Offset in bytes
   * @param data - Data to write
   *
   * @example
   * ```typescript
   * const data = new Float32Array([1, 2, 3, 4]);
   * device.writeBuffer(buffer, 0, data);
   * ```
   */
  writeBuffer(buffer: any, offset: number, data: ArrayBuffer | ArrayBufferView): void {
    // WebGL2 implementation
    if (this.gl) {
      const gl = this.gl;
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);

      // Get ArrayBufferView from data
      const view = data instanceof ArrayBuffer
        ? new Uint8Array(data)
        : data;

      gl.bufferSubData(gl.ARRAY_BUFFER, offset, view);
      gl.bindBuffer(gl.ARRAY_BUFFER, null);
      return;
    }

    // WebGPU implementation
    if (this.gpuDevice && buffer.gpuBuffer) {
      this.gpuDevice.queue.writeBuffer(buffer.gpuBuffer, offset, data);
      return;
    }

    logger.warn('writeBuffer: No rendering context available');
  }

  /**
   * Writes data to a GPU texture.
   *
   * @param texture - Target texture
   * @param data - Image data
   * @param width - Image width
   * @param height - Image height
   *
   * @example
   * ```typescript
   * const pixels = new Uint8Array(width * height * 4);
   * device.writeTexture(texture, pixels, width, height);
   * ```
   */
  writeTexture(texture: any, data: ArrayBufferView, width: number, height: number): void {
    // WebGL2 implementation
    if (this.gl) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, texture.glTexture ?? texture);
      gl.texSubImage2D(
        gl.TEXTURE_2D,
        0,        // mip level
        0, 0,     // x, y offset
        width,
        height,
        gl.RGBA,
        gl.UNSIGNED_BYTE,
        data
      );
      gl.bindTexture(gl.TEXTURE_2D, null);
      return;
    }

    // WebGPU implementation
    if (this.gpuDevice && texture.gpuTexture) {
      this.gpuDevice.queue.writeTexture(
        { texture: texture.gpuTexture },
        data,
        { bytesPerRow: width * 4, rowsPerImage: height },
        { width, height }
      );
      return;
    }

    logger.warn('writeTexture: No rendering context available');
  }

  /**
   * Generates mipmaps for a texture.
   *
   * @param texture - Texture to generate mipmaps for
   *
   * @example
   * ```typescript
   * device.generateMipmaps(texture);
   * ```
   */
  generateMipmaps(texture: any): void {
    // WebGL2 implementation
    if (this.gl) {
      const gl = this.gl;
      const target = texture.isCubeMap ? gl.TEXTURE_CUBE_MAP : gl.TEXTURE_2D;

      gl.bindTexture(target, texture.glTexture ?? texture);
      gl.generateMipmap(target);
      gl.bindTexture(target, null);
      return;
    }

    // WebGPU implementation - mipmaps must be generated manually or at creation
    if (this.gpuDevice && texture.gpuTexture) {
      // WebGPU doesn't have generateMipmap - use compute shader or blit
      this.generateMipmapsWebGPU(texture);
      return;
    }

    logger.warn('generateMipmaps: No rendering context available');
  }

  /**
   * Generates mipmaps using WebGPU compute or blit.
   */
  private generateMipmapsWebGPU(texture: any): void {
    if (!this.gpuDevice) return;

    const gpuTexture = texture.gpuTexture;
    const mipLevels = Math.floor(Math.log2(Math.max(texture.width, texture.height))) + 1;

    // Use a simple blit-based mipmap generation
    const commandEncoder = this.gpuDevice.createCommandEncoder();

    for (let level = 1; level < mipLevels; level++) {
      const srcWidth = Math.max(1, texture.width >> (level - 1));
      const srcHeight = Math.max(1, texture.height >> (level - 1));
      const dstWidth = Math.max(1, texture.width >> level);
      const dstHeight = Math.max(1, texture.height >> level);

      // Copy and downsample using render pass with bilinear filtering
      // This is a simplified approach - full implementation would use compute shader
      commandEncoder.copyTextureToTexture(
        { texture: gpuTexture, mipLevel: level - 1 },
        { texture: gpuTexture, mipLevel: level },
        { width: dstWidth, height: dstHeight }
      );
    }

    this.gpuDevice.queue.submit([commandEncoder.finish()]);
  }

  /** WebGL2 rendering context (if using WebGL2 backend) */
  protected gl: WebGL2RenderingContext | null = null;

  /** WebGPU device (if using WebGPU backend) */
  protected gpuDevice: GPUDevice | null = null;

  /**
   * Checks if the device has been lost (disconnected).
   *
   * @returns True if device is lost
   *
   * @example
   * ```typescript
   * if (device.isLost()) {
   *   console.log('GPU device lost, need to recreate');
   * }
   * ```
   */
  isLost(): boolean {
    return false; // Default implementation
  }

  /**
   * Gets memory usage statistics.
   *
   * @returns Memory usage in bytes
   *
   * @example
   * ```typescript
   * const usage = device.getMemoryUsage();
   * console.log(`GPU memory: ${usage.used / 1024 / 1024} MB`);
   * ```
   */
  getMemoryUsage(): { used: number; total: number } {
    return { used: 0, total: 0 }; // Default implementation
  }

  /**
   * Disposes of the device and all resources.
   * After calling this, the device cannot be used.
   *
   * @example
   * ```typescript
   * device.dispose();
   * ```
   */
  override dispose(): void {
    super.dispose();
    this.canvas = null;
    this.caps = null;
    logger.info('RenderDevice disposed');
  }
}
