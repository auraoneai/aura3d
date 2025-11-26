/**
 * @module Rendering/GPU
 * @description
 * GPU abstraction layer for the G3D rendering engine.
 *
 * This module provides a unified GPU API that works across WebGPU and WebGL2 backends,
 * enabling cross-platform rendering with modern GPU features while maintaining fallback
 * compatibility for older devices and browsers.
 *
 * ## Key Features
 *
 * - **Unified API**: Single interface for both WebGPU and WebGL2
 * - **Resource Management**: Buffers, textures, samplers with automatic cleanup
 * - **Pipeline State Objects**: Immutable, high-performance render state
 * - **Command Recording**: Efficient command buffer encoding
 * - **Zero-Copy Uploads**: Minimize data transfer overhead
 * - **Ring Buffers**: Allocation-free dynamic uniform updates
 *
 * ## Architecture
 *
 * The GPU abstraction consists of several layers:
 *
 * 1. **Device Layer**: Hardware interface and capability detection
 * 2. **Resource Layer**: Buffers, textures, samplers, and pipelines
 * 3. **Command Layer**: Command encoding and submission
 * 4. **Backend Layer**: Platform-specific implementations
 *
 * ## Usage Example
 *
 * ```typescript
 * import {
 *   createWebGPUDevice,
 *   createWebGL2Device,
 *   BufferUsage,
 *   TextureUsage,
 *   TextureFormat,
 *   ShaderStage,
 *   LoadOp,
 *   StoreOp,
 * } from './rendering/gpu';
 *
 * // Create device (try WebGPU first, fallback to WebGL2)
 * const canvas = document.getElementById('canvas') as HTMLCanvasElement;
 * let device = await createWebGPUDevice(canvas);
 * if (!device) {
 *   device = createWebGL2Device(canvas);
 * }
 *
 * if (!device) {
 *   throw new Error('No GPU support available');
 * }
 *
 * // Query capabilities
 * const caps = device.getCapabilities();
 * console.log(`Backend: ${caps.backend}`);
 * console.log(`Renderer: ${caps.renderer}`);
 * console.log(`Max texture size: ${caps.limits.maxTextureDimension2D}`);
 *
 * // Create vertex buffer
 * const positions = new Float32Array([
 *   -0.5, -0.5, 0.0,
 *    0.5, -0.5, 0.0,
 *    0.0,  0.5, 0.0,
 * ]);
 *
 * const vertexBuffer = device.createBuffer({
 *   size: positions.byteLength,
 *   usage: BufferUsage.Vertex | BufferUsage.CopyDst,
 *   data: positions,
 *   label: 'TrianglePositions',
 * });
 *
 * // Create texture
 * const texture = device.createTexture({
 *   size: { width: 512, height: 512 },
 *   format: TextureFormat.RGBA8Unorm,
 *   usage: TextureUsage.TextureBinding | TextureUsage.RenderAttachment,
 *   label: 'RenderTarget',
 * });
 *
 * // Compile shaders
 * const vertexShader = await device.createShaderModule({
 *   code: vertexShaderSource,
 *   language: 'wgsl',
 *   entryPoint: 'main',
 *   stage: ShaderStage.Vertex,
 * });
 *
 * const fragmentShader = await device.createShaderModule({
 *   code: fragmentShaderSource,
 *   language: 'wgsl',
 *   entryPoint: 'main',
 *   stage: ShaderStage.Fragment,
 * });
 *
 * // Create render pipeline
 * const pipeline = device.createRenderPipeline({
 *   vertex: {
 *     module: vertexShader,
 *     entryPoint: 'main',
 *     buffers: [{
 *       arrayStride: 12,
 *       attributes: [{
 *         format: VertexFormat.Float32x3,
 *         offset: 0,
 *         shaderLocation: 0,
 *       }],
 *     }],
 *   },
 *   fragment: {
 *     module: fragmentShader,
 *     entryPoint: 'main',
 *     targets: [{
 *       format: TextureFormat.BGRA8Unorm,
 *     }],
 *   },
 *   primitive: {
 *     topology: PrimitiveTopology.TriangleList,
 *   },
 * });
 *
 * // Render frame
 * const encoder = device.createCommandEncoder();
 * const textureView = texture.createView();
 *
 * const pass = encoder.beginRenderPass({
 *   colorAttachments: [{
 *     view: textureView,
 *     loadOp: LoadOp.Clear,
 *     storeOp: StoreOp.Store,
 *     clearValue: new Color(0.1, 0.1, 0.1, 1.0),
 *   }],
 * });
 *
 * pass.setPipeline(pipeline);
 * pass.setVertexBuffer(0, vertexBuffer);
 * pass.draw(3);
 * pass.end();
 *
 * const commandBuffer = encoder.finish();
 * device.submit([commandBuffer]);
 *
 * // Clean up
 * vertexBuffer.dispose();
 * texture.dispose();
 * textureView.dispose();
 * pipeline.dispose();
 * device.dispose();
 * ```
 *
 * ## Best Practices
 *
 * ### Resource Management
 * - Always dispose of resources when done to prevent memory leaks
 * - Use object pools for frequently created/destroyed resources
 * - Prefer ring buffers for per-frame uniform updates
 *
 * ### Performance
 * - Minimize pipeline state changes
 * - Batch draw calls with the same pipeline
 * - Use instancing for repeated geometry
 * - Avoid synchronous operations (map, read)
 *
 * ### Compatibility
 * - Check capabilities before using advanced features
 * - Provide fallback paths for unsupported features
 * - Test on both WebGPU and WebGL2 backends
 *
 * @see {@link GPUDevice} for the main device interface
 * @see {@link GPUBuffer} for buffer management
 * @see {@link GPUTexture} for texture operations
 * @see {@link GPUPipeline} for render state
 * @see {@link GPUCommandEncoder} for command recording
 */

// Core device abstraction
export {
  GPUDevice,
  GPUBackendType,
  GPUFeature,
  ShaderStage,
  BufferUsage,
  TextureUsage,
  TextureDimension,
  TextureViewDimension,
  TextureFormat,
  LoadOp,
  StoreOp,
  IndexFormat,
  VertexFormat,
  PrimitiveTopology,
  CullMode,
  FrontFace,
  CompareFunction,
  BlendFactor,
  BlendOperation,
  ColorWriteMask,
  StencilOperation,
} from './GPUDevice';

export type {
  GPUCapabilities,
  GPULimits,
  ShaderModuleDescriptor,
  ShaderModule,
} from './GPUDevice';

// Buffer management
export {
  GPUBuffer,
  MapMode,
  BufferType,
  MemoryHint,
  UniformLayout,
} from './GPUBuffer';

export type {
  GPUBufferDescriptor,
} from './GPUBuffer';

// Texture management
export {
  GPUTexture,
  GPUTextureView,
  calculateMipLevels,
  getTextureBytesPerPixel,
  isDepthFormat,
  isStencilFormat,
  isCompressedFormat,
} from './GPUTexture';

export type {
  GPUTextureDescriptor,
  GPUTextureViewDescriptor,
  ColorAttachment,
  DepthStencilAttachment,
  TextureDataLayout,
  TextureCopyView,
} from './GPUTexture';

// Sampler configuration
export {
  GPUSampler,
  FilterMode,
  AddressMode,
  SamplerPresets,
} from './GPUSampler';

export type {
  GPUSamplerDescriptor,
} from './GPUSampler';

// Pipeline state
export {
  GPUPipeline,
  PipelineType,
  VertexStepMode,
  BlendPresets,
  VertexLayoutBuilder,
  getVertexFormatSize,
  createDefaultStencilFaceState,
} from './GPUPipeline';

export type {
  RenderPipelineDescriptor,
  ComputePipelineDescriptor,
  VertexAttribute,
  VertexBufferLayout,
  VertexState,
  PrimitiveState,
  StencilFaceState,
  DepthStencilState,
  BlendComponent,
  BlendState,
  ColorTargetState,
  FragmentState,
  MultisampleState,
} from './GPUPipeline';

// Command encoding
export {
  GPUCommandEncoder,
  RenderPassEncoder,
  ComputePassEncoder,
} from './GPUCommandEncoder';

export type {
  RenderPassDescriptor,
  ComputePassDescriptor,
  BufferCopyView,
  Extent3D,
} from './GPUCommandEncoder';

// WebGPU backend
export { WebGPUDevice, createWebGPUDevice } from './WebGPUBackend';

// WebGL2 backend
export { WebGL2Device, createWebGL2Device } from './WebGL2Backend';

/**
 * Creates a GPU device, trying WebGPU first and falling back to WebGL2.
 *
 * @param canvas - Canvas element to render to
 * @param preferWebGPU - Whether to prefer WebGPU over WebGL2 (default: true)
 * @returns GPU device or null if no backend is available
 *
 * @example
 * ```typescript
 * const canvas = document.getElementById('canvas') as HTMLCanvasElement;
 * const device = await createGPUDevice(canvas);
 *
 * if (!device) {
 *   console.error('No GPU support available');
 *   return;
 * }
 *
 * console.log(`Using ${device.getCapabilities().backend} backend`);
 * ```
 */
export async function createGPUDevice(
  canvas: HTMLCanvasElement,
  preferWebGPU = true
): Promise<GPUDevice | null> {
  const { createWebGPUDevice } = await import('./WebGPUBackend');
  const { createWebGL2Device } = await import('./WebGL2Backend');

  if (preferWebGPU) {
    const webgpuDevice = await createWebGPUDevice(canvas);
    if (webgpuDevice) {
      return webgpuDevice;
    }
  }

  const webgl2Device = createWebGL2Device(canvas);
  if (webgl2Device) {
    return webgl2Device;
  }

  if (!preferWebGPU) {
    const webgpuDevice = await createWebGPUDevice(canvas);
    if (webgpuDevice) {
      return webgpuDevice;
    }
  }

  return null;
}
