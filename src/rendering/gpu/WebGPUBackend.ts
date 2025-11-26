/**
 * @module Rendering/GPU
 * @description
 * WebGPU backend implementation.
 */

import { Logger } from '../../core/Logger';
import {
  GPUDevice,
  GPUBackendType,
  GPUCapabilities,
  GPULimits,
  GPUFeature,
  ShaderModuleDescriptor,
  ShaderModule,
  ShaderStage,
  BufferUsage,
  CompareFunction,
} from './GPUDevice';
import { GPUBuffer as G3DGPUBuffer, GPUBufferDescriptor, MapMode, BufferType } from './GPUBuffer';
import { GPUTexture as G3DGPUTexture, GPUTextureDescriptor, GPUTextureView as G3DGPUTextureView, GPUTextureViewDescriptor, ColorAttachment, DepthStencilAttachment } from './GPUTexture';
import { GPUSampler as G3DGPUSampler, GPUSamplerDescriptor } from './GPUSampler';
import { GPUPipeline as G3DGPUPipeline, RenderPipelineDescriptor, ComputePipelineDescriptor, PipelineType } from './GPUPipeline';
import {
  GPUCommandEncoder as G3DGPUCommandEncoder,
  RenderPassEncoder,
  ComputePassEncoder,
  RenderPassDescriptor,
  ComputePassDescriptor,
  BufferCopyView,
  TextureCopyView,
  Extent3D,
} from './GPUCommandEncoder';
import { Color } from '../../math/Color';

const logger = Logger.create('WebGPUBackend');

/**
 * WebGPU shader module implementation.
 */
class WebGPUShaderModule implements ShaderModule {
  readonly id: number;
  readonly label?: string;
  readonly stage: ShaderStage;
  readonly isValid: boolean;
  readonly error?: string;

  constructor(
    id: number,
    public nativeModule: globalThis.GPUShaderModule | null,
    descriptor: ShaderModuleDescriptor,
    compilationError?: string
  ) {
    this.id = id;
    this.label = descriptor.label;
    this.stage = descriptor.stage;
    this.isValid = nativeModule !== null && !compilationError;
    this.error = compilationError;
  }

  dispose(): void {
    // WebGPU shader modules are garbage collected
  }
}

/**
 * WebGPU buffer implementation.
 */
class WebGPUBuffer extends G3DGPUBuffer {
  constructor(
    id: number,
    descriptor: GPUBufferDescriptor,
    public nativeBuffer: globalThis.GPUBuffer
  ) {
    super(id, descriptor);
  }

  protected writeInternal(data: ArrayBuffer | ArrayBufferView, offset: number): void {
    const queue = (this.nativeBuffer as any).__device?.queue;
    if (!queue) {
      throw new Error('Cannot access device queue for buffer write');
    }

    queue.writeBuffer(
      this.nativeBuffer,
      offset,
      ArrayBuffer.isView(data) ? data.buffer : data,
      ArrayBuffer.isView(data) ? data.byteOffset : 0,
      ArrayBuffer.isView(data) ? data.byteLength : data.byteLength
    );
  }

  protected async readInternal(offset: number, size: number): Promise<ArrayBuffer> {
    await this.nativeBuffer.mapAsync(GPUMapMode.READ, offset, size);
    const mapped = this.nativeBuffer.getMappedRange(offset, size);
    const result = mapped.slice(0);
    this.nativeBuffer.unmap();
    return result;
  }

  protected async mapInternal(
    mode: MapMode,
    offset: number,
    size: number
  ): Promise<ArrayBuffer> {
    const mapMode = mode === MapMode.Read ? GPUMapMode.READ : GPUMapMode.WRITE;
    await this.nativeBuffer.mapAsync(mapMode, offset, size);
    return this.nativeBuffer.getMappedRange(offset, size);
  }

  protected unmapInternal(): void {
    this.nativeBuffer.unmap();
  }

  protected disposeInternal(): void {
    this.nativeBuffer.destroy();
  }
}

/**
 * WebGPU texture view implementation.
 */
class WebGPUTextureView extends G3DGPUTextureView {
  constructor(
    id: number,
    texture: G3DGPUTexture,
    public nativeView: globalThis.GPUTextureView,
    descriptor?: GPUTextureViewDescriptor
  ) {
    super(id, texture, descriptor);
  }

  protected disposeInternal(): void {
    // WebGPU texture views are garbage collected
  }
}

/**
 * WebGPU texture implementation.
 */
class WebGPUTexture extends G3DGPUTexture {
  constructor(
    id: number,
    descriptor: GPUTextureDescriptor,
    public nativeTexture: globalThis.GPUTexture,
    private device: WebGPUDevice
  ) {
    super(id, descriptor);
  }

  protected writeInternal(
    data: ArrayBuffer | ArrayBufferView,
    mipLevel: number,
    size: { width: number; height: number; depth?: number },
    offset?: { x?: number; y?: number; z?: number },
    dataLayout?: any
  ): void {
    const queue = (this.device as any).nativeDevice.queue;

    queue.writeTexture(
      {
        texture: this.nativeTexture,
        mipLevel,
        origin: offset,
      },
      ArrayBuffer.isView(data) ? data.buffer : data,
      {
        offset: dataLayout?.offset ?? 0,
        bytesPerRow: dataLayout?.bytesPerRow,
        rowsPerImage: dataLayout?.rowsPerImage,
      },
      size
    );
  }

  protected async readInternal(
    mipLevel: number,
    size: { width: number; height: number; depth?: number },
    offset?: { x?: number; y?: number; z?: number }
  ): Promise<ArrayBuffer> {
    // Create staging buffer
    const bytesPerPixel = this.getBytesPerPixel();
    const bytesPerRow = Math.ceil((size.width * bytesPerPixel) / 256) * 256;
    const bufferSize = bytesPerRow * (size.height ?? 1) * (size.depth ?? 1);

    const stagingBuffer = this.device.createBuffer({
      size: bufferSize,
      usage: BufferUsage.CopyDst | BufferUsage.MapRead,
      type: BufferType.Generic,
    });

    // Copy texture to buffer
    const encoder = this.device.createCommandEncoder();
    (encoder as any).copyTextureToBuffer(
      { texture: this as any, mipLevel, origin: offset },
      { buffer: stagingBuffer as any, bytesPerRow },
      size
    );
    const commandBuffer = encoder.finish();
    this.device.submit([commandBuffer]);

    // Read buffer
    await this.device.waitForIdle();
    const data = await stagingBuffer.read(0, bufferSize);
    stagingBuffer.dispose();

    return data;
  }

  protected createViewInternal(descriptor?: GPUTextureViewDescriptor): G3DGPUTextureView {
    const nativeView = this.nativeTexture.createView(descriptor as any);
    return new WebGPUTextureView(
      (this.device as any).generateResourceId(),
      this,
      nativeView,
      descriptor
    );
  }

  protected generateMipmapsInternal(): void {
    // WebGPU doesn't have built-in mipmap generation
    // This would require a custom compute or render pipeline
    logger.warn('Mipmap generation not yet implemented for WebGPU');
  }

  protected disposeInternal(): void {
    this.nativeTexture.destroy();
  }
}

/**
 * WebGPU sampler implementation.
 */
class WebGPUSampler extends G3DGPUSampler {
  constructor(
    id: number,
    descriptor: GPUSamplerDescriptor,
    public nativeSampler: globalThis.GPUSampler
  ) {
    super(id, descriptor);
  }

  protected disposeInternal(): void {
    // WebGPU samplers are garbage collected
  }
}

/**
 * WebGPU pipeline implementation.
 */
class WebGPUPipeline extends G3DGPUPipeline {
  constructor(
    id: number,
    type: PipelineType,
    public nativePipeline: globalThis.GPURenderPipeline | globalThis.GPUComputePipeline,
    label?: string
  ) {
    super(id, type, label);
  }

  protected disposeInternal(): void {
    // WebGPU pipelines are garbage collected
  }
}

/**
 * WebGPU render pass encoder implementation.
 */
class WebGPURenderPassEncoder extends RenderPassEncoder {
  constructor(
    public nativeEncoder: globalThis.GPURenderPassEncoder,
    label?: string
  ) {
    super(label);
  }

  setPipeline(pipeline: G3DGPUPipeline): void {
    const webgpuPipeline = pipeline as WebGPUPipeline;
    this.nativeEncoder.setPipeline(webgpuPipeline.nativePipeline as globalThis.GPURenderPipeline);
  }

  setVertexBuffer(slot: number, buffer: G3DGPUBuffer, offset = 0, size?: number): void {
    const webgpuBuffer = buffer as WebGPUBuffer;
    this.nativeEncoder.setVertexBuffer(slot, webgpuBuffer.nativeBuffer, offset, size);
  }

  setIndexBuffer(buffer: G3DGPUBuffer, format: any, offset = 0, size?: number): void {
    const webgpuBuffer = buffer as WebGPUBuffer;
    this.nativeEncoder.setIndexBuffer(webgpuBuffer.nativeBuffer, format, offset, size);
  }

  setBindGroup(index: number, bindGroup: any, dynamicOffsets?: number[]): void {
    this.nativeEncoder.setBindGroup(index, bindGroup, dynamicOffsets);
  }

  draw(vertexCount: number, instanceCount = 1, firstVertex = 0, firstInstance = 0): void {
    this.nativeEncoder.draw(vertexCount, instanceCount, firstVertex, firstInstance);
  }

  drawIndexed(
    indexCount: number,
    instanceCount = 1,
    firstIndex = 0,
    baseVertex = 0,
    firstInstance = 0
  ): void {
    this.nativeEncoder.drawIndexed(indexCount, instanceCount, firstIndex, baseVertex, firstInstance);
  }

  drawIndirect(indirectBuffer: G3DGPUBuffer, indirectOffset: number): void {
    const webgpuBuffer = indirectBuffer as WebGPUBuffer;
    this.nativeEncoder.drawIndirect(webgpuBuffer.nativeBuffer, indirectOffset);
  }

  drawIndexedIndirect(indirectBuffer: G3DGPUBuffer, indirectOffset: number): void {
    const webgpuBuffer = indirectBuffer as WebGPUBuffer;
    this.nativeEncoder.drawIndexedIndirect(webgpuBuffer.nativeBuffer, indirectOffset);
  }

  setViewport(
    x: number,
    y: number,
    width: number,
    height: number,
    minDepth = 0,
    maxDepth = 1
  ): void {
    this.nativeEncoder.setViewport(x, y, width, height, minDepth, maxDepth);
  }

  setScissorRect(x: number, y: number, width: number, height: number): void {
    this.nativeEncoder.setScissorRect(x, y, width, height);
  }

  setBlendConstant(color: Color | [number, number, number, number]): void {
    if (color instanceof Color) {
      this.nativeEncoder.setBlendConstant({ r: color.r, g: color.g, b: color.b, a: color.a });
    } else {
      this.nativeEncoder.setBlendConstant({ r: color[0], g: color[1], b: color[2], a: color[3] });
    }
  }

  setStencilReference(reference: number): void {
    this.nativeEncoder.setStencilReference(reference);
  }

  beginOcclusionQuery(queryIndex: number): void {
    this.nativeEncoder.beginOcclusionQuery(queryIndex);
  }

  endOcclusionQuery(): void {
    this.nativeEncoder.endOcclusionQuery();
  }

  executeBundles(bundles: any[]): void {
    this.nativeEncoder.executeBundles(bundles);
  }

  protected endInternal(): void {
    this.nativeEncoder.end();
  }
}

/**
 * WebGPU compute pass encoder implementation.
 */
class WebGPUComputePassEncoder extends ComputePassEncoder {
  constructor(
    public nativeEncoder: globalThis.GPUComputePassEncoder,
    label?: string
  ) {
    super(label);
  }

  setPipeline(pipeline: G3DGPUPipeline): void {
    const webgpuPipeline = pipeline as WebGPUPipeline;
    this.nativeEncoder.setPipeline(webgpuPipeline.nativePipeline as globalThis.GPUComputePipeline);
  }

  setBindGroup(index: number, bindGroup: any, dynamicOffsets?: number[]): void {
    this.nativeEncoder.setBindGroup(index, bindGroup, dynamicOffsets);
  }

  dispatch(workgroupCountX: number, workgroupCountY = 1, workgroupCountZ = 1): void {
    this.nativeEncoder.dispatchWorkgroups(workgroupCountX, workgroupCountY, workgroupCountZ);
  }

  dispatchIndirect(indirectBuffer: G3DGPUBuffer, indirectOffset: number): void {
    const webgpuBuffer = indirectBuffer as WebGPUBuffer;
    this.nativeEncoder.dispatchWorkgroupsIndirect(webgpuBuffer.nativeBuffer, indirectOffset);
  }

  protected endInternal(): void {
    this.nativeEncoder.end();
  }
}

/**
 * WebGPU command encoder implementation.
 */
class WebGPUCommandEncoder extends G3DGPUCommandEncoder {
  constructor(
    public nativeEncoder: globalThis.GPUCommandEncoder,
    label?: string
  ) {
    super(label);
  }

  beginRenderPass(descriptor: RenderPassDescriptor): RenderPassEncoder {
    const colorAttachments: globalThis.GPURenderPassColorAttachment[] = descriptor.colorAttachments.map(att => {
      const view = att.view as WebGPUTextureView;
      const resolveTarget = att.resolveTarget as WebGPUTextureView | undefined;

      let clearValue: globalThis.GPUColor | undefined;
      if (att.clearValue) {
        if (att.clearValue instanceof Color) {
          clearValue = { r: att.clearValue.r, g: att.clearValue.g, b: att.clearValue.b, a: att.clearValue.a };
        } else {
          clearValue = { r: att.clearValue[0], g: att.clearValue[1], b: att.clearValue[2], a: att.clearValue[3] };
        }
      }

      return {
        view: view.nativeView,
        resolveTarget: resolveTarget?.nativeView,
        loadOp: att.loadOp as globalThis.GPULoadOp,
        storeOp: att.storeOp as globalThis.GPUStoreOp,
        clearValue,
      };
    });

    let depthStencilAttachment: globalThis.GPURenderPassDepthStencilAttachment | undefined;
    if (descriptor.depthStencilAttachment) {
      const ds = descriptor.depthStencilAttachment;
      const view = ds.view as WebGPUTextureView;

      depthStencilAttachment = {
        view: view.nativeView,
        depthLoadOp: ds.depthLoadOp as globalThis.GPULoadOp,
        depthStoreOp: ds.depthStoreOp as globalThis.GPUStoreOp,
        depthClearValue: ds.depthClearValue,
        depthReadOnly: ds.depthReadOnly,
        stencilLoadOp: ds.stencilLoadOp as globalThis.GPULoadOp,
        stencilStoreOp: ds.stencilStoreOp as globalThis.GPUStoreOp,
        stencilClearValue: ds.stencilClearValue,
        stencilReadOnly: ds.stencilReadOnly,
      };
    }

    const nativePass = this.nativeEncoder.beginRenderPass({
      colorAttachments,
      depthStencilAttachment,
      occlusionQuerySet: descriptor.occlusionQuerySet,
      timestampWrites: descriptor.timestampWrites as any,
      label: descriptor.label,
    });

    return new WebGPURenderPassEncoder(nativePass, descriptor.label);
  }

  beginComputePass(descriptor?: ComputePassDescriptor): ComputePassEncoder {
    const nativePass = this.nativeEncoder.beginComputePass({
      timestampWrites: descriptor?.timestampWrites as any,
      label: descriptor?.label,
    });

    return new WebGPUComputePassEncoder(nativePass, descriptor?.label);
  }

  copyBufferToBuffer(
    source: G3DGPUBuffer,
    sourceOffset: number,
    destination: G3DGPUBuffer,
    destinationOffset: number,
    size: number
  ): void {
    const src = source as WebGPUBuffer;
    const dst = destination as WebGPUBuffer;
    this.nativeEncoder.copyBufferToBuffer(
      src.nativeBuffer,
      sourceOffset,
      dst.nativeBuffer,
      destinationOffset,
      size
    );
  }

  copyBufferToTexture(
    source: BufferCopyView,
    destination: TextureCopyView,
    copySize: Extent3D
  ): void {
    const srcBuffer = source.buffer as WebGPUBuffer;
    const dstTexture = destination.texture as WebGPUTexture;

    this.nativeEncoder.copyBufferToTexture(
      {
        buffer: srcBuffer.nativeBuffer,
        offset: source.offset,
        bytesPerRow: source.bytesPerRow,
        rowsPerImage: source.rowsPerImage,
      },
      {
        texture: dstTexture.nativeTexture,
        mipLevel: destination.mipLevel,
        origin: destination.origin,
      },
      copySize as globalThis.GPUExtent3DStrict
    );
  }

  copyTextureToTexture(
    source: TextureCopyView,
    destination: BufferCopyView,
    copySize: Extent3D
  ): void {
    const srcTexture = source.texture as WebGPUTexture;
    const dstBuffer = destination.buffer as WebGPUBuffer;

    this.nativeEncoder.copyTextureToBuffer(
      {
        texture: srcTexture.nativeTexture,
        mipLevel: source.mipLevel,
        origin: source.origin,
      },
      {
        buffer: dstBuffer.nativeBuffer,
        offset: destination.offset,
        bytesPerRow: destination.bytesPerRow,
        rowsPerImage: destination.rowsPerImage,
      },
      copySize as globalThis.GPUExtent3DStrict
    );
  }

  copyTextureToTexture2(
    source: TextureCopyView,
    destination: TextureCopyView,
    copySize: Extent3D
  ): void {
    const srcTexture = source.texture as WebGPUTexture;
    const dstTexture = destination.texture as WebGPUTexture;

    this.nativeEncoder.copyTextureToTexture(
      {
        texture: srcTexture.nativeTexture,
        mipLevel: source.mipLevel,
        origin: source.origin,
      },
      {
        texture: dstTexture.nativeTexture,
        mipLevel: destination.mipLevel,
        origin: destination.origin,
      },
      copySize as globalThis.GPUExtent3DStrict
    );
  }

  clearBuffer(buffer: G3DGPUBuffer, offset = 0, size?: number): void {
    const webgpuBuffer = buffer as WebGPUBuffer;
    this.nativeEncoder.clearBuffer(webgpuBuffer.nativeBuffer, offset, size);
  }

  writeTimestamp(querySet: any, queryIndex: number): void {
    // writeTimestamp is deprecated in WebGPU, use timestampWrites in pass descriptors instead
    // this.nativeEncoder.writeTimestamp(querySet, queryIndex);
    logger.warn('writeTimestamp is not available in WebGPU, use timestampWrites in pass descriptors');
  }

  resolveQuerySet(
    querySet: any,
    firstQuery: number,
    queryCount: number,
    destination: G3DGPUBuffer,
    destinationOffset: number
  ): void {
    const dstBuffer = destination as WebGPUBuffer;
    this.nativeEncoder.resolveQuerySet(
      querySet,
      firstQuery,
      queryCount,
      dstBuffer.nativeBuffer,
      destinationOffset
    );
  }

  protected finishInternal(): any {
    return this.nativeEncoder.finish();
  }
}

/**
 * WebGPU device implementation.
 *
 * @example
 * ```typescript
 * const device = await createWebGPUDevice(canvas);
 * if (!device) {
 *   console.error('WebGPU not supported');
 *   return;
 * }
 *
 * // Use device...
 * const buffer = device.createBuffer({
 *   size: 1024,
 *   usage: BufferUsage.Vertex | BufferUsage.CopyDst,
 * });
 * ```
 */
export class WebGPUDevice extends GPUDevice {
  private adapter: globalThis.GPUAdapter;
  private context: globalThis.GPUCanvasContext;
  private capabilities: GPUCapabilities;
  private currentTexture: G3DGPUTexture | null = null;

  constructor(
    private nativeDevice: globalThis.GPUDevice,
    adapter: globalThis.GPUAdapter,
    context: globalThis.GPUCanvasContext
  ) {
    super();
    this.adapter = adapter;
    this.context = context;
    this.capabilities = this.buildCapabilities();

    // Store device reference on buffers for queue access
    (this.nativeDevice as any).__device = this.nativeDevice;

    logger.info('WebGPU device created', {
      vendor: this.capabilities.vendor,
      renderer: this.capabilities.renderer,
    });
  }

  private buildCapabilities(): GPUCapabilities {
    const features = new Set<GPUFeature>();

    // Check WebGPU features
    if (this.nativeDevice.features.has('timestamp-query')) {
      features.add(GPUFeature.TimestampQuery);
    }
    if (this.nativeDevice.features.has('texture-compression-bc')) {
      features.add(GPUFeature.TextureCompressionBC);
    }
    if (this.nativeDevice.features.has('texture-compression-etc2')) {
      features.add(GPUFeature.TextureCompressionETC2);
    }
    if (this.nativeDevice.features.has('texture-compression-astc')) {
      features.add(GPUFeature.TextureCompressionASTC);
    }

    // WebGPU supports these by default
    features.add(GPUFeature.Compute);
    features.add(GPUFeature.MultipleRenderTargets);
    features.add(GPUFeature.DepthTexture);
    features.add(GPUFeature.FloatTexture);
    features.add(GPUFeature.AnisotropicFiltering);
    features.add(GPUFeature.Instancing);
    features.add(GPUFeature.Texture3D);
    features.add(GPUFeature.StorageBuffer);

    const limits = this.nativeDevice.limits;
    const gpuLimits: GPULimits = {
      maxTextureDimension2D: limits.maxTextureDimension2D,
      maxTextureDimension3D: limits.maxTextureDimension3D,
      maxTextureDimensionCube: limits.maxTextureDimension2D,
      maxTextureArrayLayers: limits.maxTextureArrayLayers,
      maxVertexAttributes: limits.maxVertexAttributes,
      maxVertexBuffers: limits.maxVertexBuffers,
      maxVertexBufferStride: limits.maxVertexBufferArrayStride,
      maxUniformBufferSize: limits.maxUniformBufferBindingSize,
      maxStorageBufferSize: limits.maxStorageBufferBindingSize,
      maxColorAttachments: limits.maxColorAttachments,
      maxSamples: 4,
      maxAnisotropy: 16,
      maxComputeWorkgroupSizeX: limits.maxComputeWorkgroupSizeX,
      maxComputeWorkgroupSizeY: limits.maxComputeWorkgroupSizeY,
      maxComputeWorkgroupSizeZ: limits.maxComputeWorkgroupSizeZ,
      maxComputeWorkgroupInvocations: limits.maxComputeInvocationsPerWorkgroup,
      maxComputeWorkgroupsPerDimension: limits.maxComputeWorkgroupsPerDimension,
    };

    return {
      backend: GPUBackendType.WebGPU,
      vendor: 'Unknown',
      renderer: this.adapter.info?.device ?? 'WebGPU',
      features,
      limits: gpuLimits,
      supportsWGSL: true,
      supportsGLSL: false,
    };
  }

  getCapabilities(): GPUCapabilities {
    return this.capabilities;
  }

  async createShaderModule(descriptor: ShaderModuleDescriptor): Promise<ShaderModule> {
    try {
      if (descriptor.language !== 'wgsl') {
        return new WebGPUShaderModule(
          this.generateResourceId(),
          null,
          descriptor,
          'WebGPU only supports WGSL shaders'
        );
      }

      const nativeModule = this.nativeDevice.createShaderModule({
        code: descriptor.code,
        label: descriptor.label,
      });

      // Check for compilation errors
      const compilationInfo = await nativeModule.getCompilationInfo();
      const errors = compilationInfo.messages.filter(m => m.type === 'error');

      if (errors.length > 0) {
        const errorMessage = errors.map(e => `${e.lineNum}:${e.linePos}: ${e.message}`).join('\n');
        return new WebGPUShaderModule(
          this.generateResourceId(),
          null,
          descriptor,
          errorMessage
        );
      }

      return new WebGPUShaderModule(
        this.generateResourceId(),
        nativeModule,
        descriptor
      );
    } catch (error) {
      return new WebGPUShaderModule(
        this.generateResourceId(),
        null,
        descriptor,
        error instanceof Error ? error.message : 'Unknown compilation error'
      );
    }
  }

  createBuffer(descriptor: GPUBufferDescriptor): G3DGPUBuffer {
    const nativeBuffer = this.nativeDevice.createBuffer({
      size: descriptor.size,
      usage: descriptor.usage as number,
      mappedAtCreation: descriptor.data !== undefined,
      label: descriptor.label,
    });

    // Upload initial data if provided
    if (descriptor.data) {
      const mapped = nativeBuffer.getMappedRange();
      const view = new Uint8Array(mapped);
      const data = ArrayBuffer.isView(descriptor.data)
        ? new Uint8Array(descriptor.data.buffer, descriptor.data.byteOffset, descriptor.data.byteLength)
        : new Uint8Array(descriptor.data);
      view.set(data);
      nativeBuffer.unmap();
    }

    return new WebGPUBuffer(this.generateResourceId(), descriptor, nativeBuffer);
  }

  createTexture(descriptor: GPUTextureDescriptor): G3DGPUTexture {
    const nativeTexture = this.nativeDevice.createTexture({
      size: descriptor.size as globalThis.GPUExtent3D,
      format: descriptor.format as globalThis.GPUTextureFormat,
      usage: descriptor.usage as number,
      dimension: descriptor.dimension as globalThis.GPUTextureDimension,
      mipLevelCount: descriptor.mipLevelCount,
      sampleCount: descriptor.sampleCount,
      label: descriptor.label,
    });

    return new WebGPUTexture(
      this.generateResourceId(),
      descriptor,
      nativeTexture,
      this
    );
  }

  createSampler(descriptor: GPUSamplerDescriptor): G3DGPUSampler {
    const nativeSampler = this.nativeDevice.createSampler({
      magFilter: descriptor.magFilter as globalThis.GPUFilterMode,
      minFilter: descriptor.minFilter as globalThis.GPUFilterMode,
      mipmapFilter: descriptor.mipmapFilter as globalThis.GPUMipmapFilterMode,
      addressModeU: descriptor.addressModeU as globalThis.GPUAddressMode,
      addressModeV: descriptor.addressModeV as globalThis.GPUAddressMode,
      addressModeW: descriptor.addressModeW as globalThis.GPUAddressMode,
      lodMinClamp: descriptor.lodMinClamp,
      lodMaxClamp: descriptor.lodMaxClamp,
      compare: descriptor.compare as globalThis.GPUCompareFunction,
      maxAnisotropy: descriptor.maxAnisotropy,
      label: descriptor.label,
    });

    return new WebGPUSampler(this.generateResourceId(), descriptor, nativeSampler);
  }

  createRenderPipeline(descriptor: RenderPipelineDescriptor): G3DGPUPipeline {
    const vertexModule = descriptor.vertex.module as WebGPUShaderModule;
    const fragmentModule = descriptor.fragment?.module as WebGPUShaderModule;

    const nativePipeline = this.nativeDevice.createRenderPipeline({
      vertex: {
        module: vertexModule.nativeModule!,
        entryPoint: descriptor.vertex.entryPoint,
        buffers: descriptor.vertex.buffers as any,
      },
      fragment: descriptor.fragment
        ? {
            module: fragmentModule.nativeModule!,
            entryPoint: descriptor.fragment.entryPoint,
            targets: descriptor.fragment.targets as any,
          }
        : undefined,
      primitive: descriptor.primitive as any,
      depthStencil: descriptor.depthStencil as any,
      multisample: descriptor.multisample as any,
      label: descriptor.label,
    } as globalThis.GPURenderPipelineDescriptor);

    return new WebGPUPipeline(
      this.generateResourceId(),
      PipelineType.Render,
      nativePipeline,
      descriptor.label
    );
  }

  createComputePipeline(descriptor: ComputePipelineDescriptor): G3DGPUPipeline {
    const computeModule = descriptor.compute.module as WebGPUShaderModule;

    const nativePipeline = this.nativeDevice.createComputePipeline({
      layout: 'auto' as globalThis.GPUAutoLayoutMode,
      compute: {
        module: computeModule.nativeModule!,
        entryPoint: descriptor.compute.entryPoint,
      },
      label: descriptor.label,
    });

    return new WebGPUPipeline(
      this.generateResourceId(),
      PipelineType.Compute,
      nativePipeline,
      descriptor.label
    );
  }

  createCommandEncoder(label?: string): G3DGPUCommandEncoder {
    const nativeEncoder = this.nativeDevice.createCommandEncoder({ label });
    return new WebGPUCommandEncoder(nativeEncoder, label);
  }

  submit(commandBuffers: any[]): void {
    this.nativeDevice.queue.submit(commandBuffers);
  }

  async waitForIdle(): Promise<void> {
    await this.nativeDevice.queue.onSubmittedWorkDone();
  }

  getCurrentTexture(): G3DGPUTexture | null {
    if (!this.currentTexture) {
      const nativeTexture = this.context.getCurrentTexture();
      this.currentTexture = new WebGPUTexture(
        this.generateResourceId(),
        {
          size: { width: nativeTexture.width, height: nativeTexture.height },
          format: nativeTexture.format as any,
          usage: nativeTexture.usage,
        },
        nativeTexture,
        this
      );
    }
    return this.currentTexture;
  }

  present(): void {
    this.currentTexture = null;
  }

  override dispose(): void {
    if (this.disposed) {
      return;
    }

    this.nativeDevice.destroy();
    super.dispose();
  }
}

/**
 * Creates a WebGPU device instance.
 * @param canvas - Canvas element to render to
 * @param powerPreference - Power preference hint
 * @returns WebGPU device or null if not supported
 *
 * @example
 * ```typescript
 * const canvas = document.getElementById('canvas') as HTMLCanvasElement;
 * const device = await createWebGPUDevice(canvas);
 * if (!device) {
 *   console.error('WebGPU not supported');
 * }
 * ```
 */
export async function createWebGPUDevice(
  canvas: HTMLCanvasElement,
  powerPreference: 'low-power' | 'high-performance' = 'high-performance'
): Promise<WebGPUDevice | null> {
  if (!navigator.gpu) {
    logger.warn('WebGPU not supported in this browser');
    return null;
  }

  try {
    const adapter = await navigator.gpu.requestAdapter({ powerPreference });
    if (!adapter) {
      logger.error('Failed to get WebGPU adapter');
      return null;
    }

    const device = await adapter.requestDevice();
    device.addEventListener('uncapturederror', (event: any) => {
      logger.error('WebGPU uncaptured error', event.error);
    });

    const context = canvas.getContext('webgpu');
    if (!context) {
      logger.error('Failed to get WebGPU context');
      return null;
    }

    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
      device,
      format,
      alphaMode: 'premultiplied',
    });

    return new WebGPUDevice(device, adapter, context);
  } catch (error) {
    logger.error('Failed to create WebGPU device', error);
    return null;
  }
}
