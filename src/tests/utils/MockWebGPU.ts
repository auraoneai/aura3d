/**
 * MockWebGPU.ts
 *
 * Complete WebGPU mock implementation for headless testing.
 * Provides full WebGPU API with state tracking for verification in tests.
 *
 * @module tests/utils/MockWebGPU
 */

/**
 * Mock GPUBuffer implementation
 */
export class MockGPUBuffer {
  readonly size: number;
  readonly usage: GPUBufferUsageFlags;
  readonly mapState: GPUBufferMapState = 'unmapped';
  private mappedData: ArrayBuffer | null = null;

  constructor(size: number, usage: GPUBufferUsageFlags) {
    this.size = size;
    this.usage = usage;
  }

  async mapAsync(mode: GPUMapModeFlags, offset?: number, size?: number): Promise<void> {
    this.mappedData = new ArrayBuffer(this.size);
  }

  getMappedRange(offset?: number, size?: number): ArrayBuffer {
    return this.mappedData || new ArrayBuffer(this.size);
  }

  unmap(): void {
    this.mappedData = null;
  }

  destroy(): void {
    this.mappedData = null;
  }

  get label(): string {
    return '';
  }

  set label(value: string) {}
}

/**
 * Mock GPUTexture implementation
 */
export class MockGPUTexture {
  readonly width: number;
  readonly height: number;
  readonly depthOrArrayLayers: number;
  readonly mipLevelCount: number;
  readonly sampleCount: number;
  readonly dimension: GPUTextureDimension;
  readonly format: GPUTextureFormat;
  readonly usage: GPUTextureUsageFlags;

  constructor(descriptor: GPUTextureDescriptor) {
    let width: number;
    let height: number;
    let depthOrArrayLayers: number;

    const size = descriptor.size as any;
    if (typeof size === 'number') {
      width = size;
      height = 1;
      depthOrArrayLayers = 1;
    } else if (Array.isArray(size)) {
      width = size[0];
      height = size[1] ?? 1;
      depthOrArrayLayers = size[2] ?? 1;
    } else {
      width = size.width;
      height = size.height ?? 1;
      depthOrArrayLayers = size.depthOrArrayLayers ?? 1;
    }

    this.width = width;
    this.height = height;
    this.depthOrArrayLayers = depthOrArrayLayers;
    this.mipLevelCount = descriptor.mipLevelCount || 1;
    this.sampleCount = descriptor.sampleCount || 1;
    this.dimension = descriptor.dimension || '2d';
    this.format = descriptor.format;
    this.usage = descriptor.usage;
  }

  createView(descriptor?: GPUTextureViewDescriptor): GPUTextureView {
    return new MockGPUTextureView(this, descriptor) as any;
  }

  destroy(): void {}

  get label(): string {
    return '';
  }

  set label(value: string) {}
}

/**
 * Mock GPUTextureView implementation
 */
export class MockGPUTextureView {
  readonly texture: MockGPUTexture;
  readonly descriptor?: GPUTextureViewDescriptor;

  constructor(texture: MockGPUTexture, descriptor?: GPUTextureViewDescriptor) {
    this.texture = texture;
    this.descriptor = descriptor;
  }

  get label(): string {
    return '';
  }

  set label(value: string) {}
}

/**
 * Mock GPUSampler implementation
 */
export class MockGPUSampler {
  readonly descriptor: GPUSamplerDescriptor;

  constructor(descriptor: GPUSamplerDescriptor = {}) {
    this.descriptor = descriptor;
  }

  get label(): string {
    return '';
  }

  set label(value: string) {}
}

/**
 * Mock GPUBindGroupLayout implementation
 */
export class MockGPUBindGroupLayout {
  readonly entries: readonly GPUBindGroupLayoutEntry[];

  constructor(descriptor: GPUBindGroupLayoutDescriptor) {
    this.entries = Array.from(descriptor.entries);
  }

  get label(): string {
    return '';
  }

  set label(value: string) {}
}

/**
 * Mock GPUBindGroup implementation
 */
export class MockGPUBindGroup {
  readonly layout: MockGPUBindGroupLayout;
  readonly entries: readonly GPUBindGroupEntry[];

  constructor(descriptor: GPUBindGroupDescriptor) {
    this.layout = descriptor.layout as any;
    this.entries = Array.from(descriptor.entries);
  }

  get label(): string {
    return '';
  }

  set label(value: string) {}
}

/**
 * Mock GPUPipelineLayout implementation
 */
export class MockGPUPipelineLayout {
  readonly bindGroupLayouts: readonly MockGPUBindGroupLayout[];

  constructor(descriptor: GPUPipelineLayoutDescriptor) {
    this.bindGroupLayouts = descriptor.bindGroupLayouts as any;
  }

  get label(): string {
    return '';
  }

  set label(value: string) {}
}

/**
 * Mock GPUShaderModule implementation
 */
export class MockGPUShaderModule {
  readonly code: string;

  constructor(descriptor: GPUShaderModuleDescriptor) {
    this.code = descriptor.code;
  }

  async getCompilationInfo(): Promise<GPUCompilationInfo> {
    return {
      messages: [] as any
    } as unknown as GPUCompilationInfo;
  }

  get label(): string {
    return '';
  }

  set label(value: string) {}
}

/**
 * Mock GPURenderPipeline implementation
 */
export class MockGPURenderPipeline {
  readonly descriptor: GPURenderPipelineDescriptor;

  constructor(descriptor: GPURenderPipelineDescriptor) {
    this.descriptor = descriptor;
  }

  getBindGroupLayout(index: number): GPUBindGroupLayout {
    return new MockGPUBindGroupLayout({ entries: [] }) as any;
  }

  get label(): string {
    return '';
  }

  set label(value: string) {}
}

/**
 * Mock GPUComputePipeline implementation
 */
export class MockGPUComputePipeline {
  readonly descriptor: GPUComputePipelineDescriptor;

  constructor(descriptor: GPUComputePipelineDescriptor) {
    this.descriptor = descriptor;
  }

  getBindGroupLayout(index: number): GPUBindGroupLayout {
    return new MockGPUBindGroupLayout({ entries: [] }) as any;
  }

  get label(): string {
    return '';
  }

  set label(value: string) {}
}

/**
 * Mock GPUCommandEncoder implementation
 */
export class MockGPUCommandEncoder {
  private commands: string[] = [];

  beginRenderPass(descriptor: GPURenderPassDescriptor): GPURenderPassEncoder {
    this.commands.push('beginRenderPass');
    return new MockGPURenderPassEncoder(this) as any;
  }

  beginComputePass(descriptor?: GPUComputePassDescriptor): GPUComputePassEncoder {
    this.commands.push('beginComputePass');
    return new MockGPUComputePassEncoder(this) as any;
  }

  copyBufferToBuffer(
    source: GPUBuffer,
    sourceOffset: number,
    destination: GPUBuffer,
    destinationOffset: number,
    size: number
  ): void {
    this.commands.push('copyBufferToBuffer');
  }

  copyBufferToTexture(
    source: GPUImageCopyBuffer,
    destination: GPUImageCopyTexture,
    copySize: GPUExtent3D
  ): void {
    this.commands.push('copyBufferToTexture');
  }

  copyTextureToBuffer(
    source: GPUImageCopyTexture,
    destination: GPUImageCopyBuffer,
    copySize: GPUExtent3D
  ): void {
    this.commands.push('copyTextureToBuffer');
  }

  copyTextureToTexture(
    source: GPUImageCopyTexture,
    destination: GPUImageCopyTexture,
    copySize: GPUExtent3D
  ): void {
    this.commands.push('copyTextureToTexture');
  }

  clearBuffer(buffer: GPUBuffer, offset?: number, size?: number): void {
    this.commands.push('clearBuffer');
  }

  writeTimestamp(querySet: GPUQuerySet, queryIndex: number): void {
    this.commands.push('writeTimestamp');
  }

  resolveQuerySet(
    querySet: GPUQuerySet,
    firstQuery: number,
    queryCount: number,
    destination: GPUBuffer,
    destinationOffset: number
  ): void {
    this.commands.push('resolveQuerySet');
  }

  finish(descriptor?: GPUCommandBufferDescriptor): GPUCommandBuffer {
    return new MockGPUCommandBuffer(this.commands) as any;
  }

  pushDebugGroup(groupLabel: string): void {
    this.commands.push(`pushDebugGroup:${groupLabel}`);
  }

  popDebugGroup(): void {
    this.commands.push('popDebugGroup');
  }

  insertDebugMarker(markerLabel: string): void {
    this.commands.push(`insertDebugMarker:${markerLabel}`);
  }

  get label(): string {
    return '';
  }

  set label(value: string) {}
}

/**
 * Mock GPURenderPassEncoder implementation
 */
export class MockGPURenderPassEncoder {
  private encoder: MockGPUCommandEncoder;
  private commands: string[] = [];

  constructor(encoder: MockGPUCommandEncoder) {
    this.encoder = encoder;
  }

  setPipeline(pipeline: GPURenderPipeline): void {
    this.commands.push('setPipeline');
  }

  setBindGroup(
    index: number,
    bindGroup: GPUBindGroup | null,
    dynamicOffsets?: Uint32Array | number[]
  ): void {
    this.commands.push(`setBindGroup:${index}`);
  }

  setIndexBuffer(buffer: GPUBuffer, indexFormat: GPUIndexFormat, offset?: number, size?: number): void {
    this.commands.push('setIndexBuffer');
  }

  setVertexBuffer(slot: number, buffer: GPUBuffer | null, offset?: number, size?: number): void {
    this.commands.push(`setVertexBuffer:${slot}`);
  }

  draw(vertexCount: number, instanceCount?: number, firstVertex?: number, firstInstance?: number): void {
    this.commands.push(`draw:${vertexCount}`);
  }

  drawIndexed(
    indexCount: number,
    instanceCount?: number,
    firstIndex?: number,
    baseVertex?: number,
    firstInstance?: number
  ): void {
    this.commands.push(`drawIndexed:${indexCount}`);
  }

  drawIndirect(indirectBuffer: GPUBuffer, indirectOffset: number): void {
    this.commands.push('drawIndirect');
  }

  drawIndexedIndirect(indirectBuffer: GPUBuffer, indirectOffset: number): void {
    this.commands.push('drawIndexedIndirect');
  }

  setViewport(x: number, y: number, width: number, height: number, minDepth: number, maxDepth: number): void {
    this.commands.push('setViewport');
  }

  setScissorRect(x: number, y: number, width: number, height: number): void {
    this.commands.push('setScissorRect');
  }

  setBlendConstant(color: GPUColor): void {
    this.commands.push('setBlendConstant');
  }

  setStencilReference(reference: number): void {
    this.commands.push('setStencilReference');
  }

  beginOcclusionQuery(queryIndex: number): void {
    this.commands.push('beginOcclusionQuery');
  }

  endOcclusionQuery(): void {
    this.commands.push('endOcclusionQuery');
  }

  executeBundles(bundles: GPURenderBundle[]): void {
    this.commands.push('executeBundles');
  }

  end(): void {
    this.commands.push('end');
  }

  pushDebugGroup(groupLabel: string): void {
    this.commands.push(`pushDebugGroup:${groupLabel}`);
  }

  popDebugGroup(): void {
    this.commands.push('popDebugGroup');
  }

  insertDebugMarker(markerLabel: string): void {
    this.commands.push(`insertDebugMarker:${markerLabel}`);
  }

  get label(): string {
    return '';
  }

  set label(value: string) {}
}

/**
 * Mock GPUComputePassEncoder implementation
 */
export class MockGPUComputePassEncoder {
  private encoder: MockGPUCommandEncoder;
  private commands: string[] = [];

  constructor(encoder: MockGPUCommandEncoder) {
    this.encoder = encoder;
  }

  setPipeline(pipeline: GPUComputePipeline): void {
    this.commands.push('setPipeline');
  }

  setBindGroup(
    index: number,
    bindGroup: GPUBindGroup | null,
    dynamicOffsets?: Uint32Array | number[]
  ): void {
    this.commands.push(`setBindGroup:${index}`);
  }

  dispatchWorkgroups(workgroupCountX: number, workgroupCountY?: number, workgroupCountZ?: number): void {
    this.commands.push(`dispatchWorkgroups:${workgroupCountX}`);
  }

  dispatchWorkgroupsIndirect(indirectBuffer: GPUBuffer, indirectOffset: number): void {
    this.commands.push('dispatchWorkgroupsIndirect');
  }

  end(): void {
    this.commands.push('end');
  }

  pushDebugGroup(groupLabel: string): void {
    this.commands.push(`pushDebugGroup:${groupLabel}`);
  }

  popDebugGroup(): void {
    this.commands.push('popDebugGroup');
  }

  insertDebugMarker(markerLabel: string): void {
    this.commands.push(`insertDebugMarker:${markerLabel}`);
  }

  get label(): string {
    return '';
  }

  set label(value: string) {}
}

/**
 * Mock GPUCommandBuffer implementation
 */
export class MockGPUCommandBuffer {
  readonly commands: string[];

  constructor(commands: string[]) {
    this.commands = commands;
  }

  get label(): string {
    return '';
  }

  set label(value: string) {}
}

/**
 * Mock GPUQuerySet implementation
 */
export class MockGPUQuerySet {
  readonly type: GPUQueryType;
  readonly count: number;

  constructor(descriptor: GPUQuerySetDescriptor) {
    this.type = descriptor.type;
    this.count = descriptor.count;
  }

  destroy(): void {}

  get label(): string {
    return '';
  }

  set label(value: string) {}
}

/**
 * Mock GPURenderBundle implementation
 */
export class MockGPURenderBundle {
  get label(): string {
    return '';
  }

  set label(value: string) {}
}

/**
 * Mock GPUQueue implementation
 */
export class MockGPUQueue {
  private submittedCommands: MockGPUCommandBuffer[] = [];

  submit(commandBuffers: GPUCommandBuffer[]): void {
    this.submittedCommands.push(...(commandBuffers as any));
  }

  writeBuffer(
    buffer: GPUBuffer,
    bufferOffset: number,
    data: BufferSource,
    dataOffset?: number,
    size?: number
  ): void {
    // Mock implementation
  }

  writeTexture(
    destination: GPUImageCopyTexture,
    data: BufferSource,
    dataLayout: GPUImageDataLayout,
    size: GPUExtent3D
  ): void {
    // Mock implementation
  }

  copyExternalImageToTexture(
    source: GPUImageCopyExternalImage,
    destination: GPUImageCopyTexture,
    copySize: GPUExtent3D
  ): void {
    // Mock implementation
  }

  onSubmittedWorkDone(): Promise<void> {
    return Promise.resolve();
  }

  getSubmittedCommands(): MockGPUCommandBuffer[] {
    return this.submittedCommands;
  }

  get label(): string {
    return '';
  }

  set label(value: string) {}
}

/**
 * Mock GPUDevice implementation
 */
export class MockGPUDevice {
  readonly features: GPUSupportedFeatures = new Set<string>() as any;
  readonly limits: GPUSupportedLimits = {
    maxTextureDimension1D: 8192,
    maxTextureDimension2D: 8192,
    maxTextureDimension3D: 2048,
    maxTextureArrayLayers: 256,
    maxBindGroups: 4,
    maxBindingsPerBindGroup: 1000,
    maxDynamicUniformBuffersPerPipelineLayout: 8,
    maxDynamicStorageBuffersPerPipelineLayout: 4,
    maxSampledTexturesPerShaderStage: 16,
    maxSamplersPerShaderStage: 16,
    maxStorageBuffersPerShaderStage: 8,
    maxStorageTexturesPerShaderStage: 4,
    maxUniformBuffersPerShaderStage: 12,
    maxUniformBufferBindingSize: 65536,
    maxStorageBufferBindingSize: 134217728,
    minUniformBufferOffsetAlignment: 256,
    minStorageBufferOffsetAlignment: 256,
    maxVertexBuffers: 8,
    maxBufferSize: 268435456,
    maxVertexAttributes: 16,
    maxVertexBufferArrayStride: 2048,
    maxInterStageShaderComponents: 60,
    maxInterStageShaderVariables: 16,
    maxColorAttachments: 8,
    maxColorAttachmentBytesPerSample: 32,
    maxComputeWorkgroupStorageSize: 16384,
    maxComputeInvocationsPerWorkgroup: 256,
    maxComputeWorkgroupSizeX: 256,
    maxComputeWorkgroupSizeY: 256,
    maxComputeWorkgroupSizeZ: 64,
    maxComputeWorkgroupsPerDimension: 65535
  } as any;
  readonly queue: MockGPUQueue = new MockGPUQueue();
  readonly lost: Promise<GPUDeviceLostInfo> = Promise.resolve({
    reason: 'destroyed',
    message: 'Device destroyed'
  } as any);

  createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer {
    return new MockGPUBuffer(descriptor.size, descriptor.usage) as any;
  }

  createTexture(descriptor: GPUTextureDescriptor): GPUTexture {
    return new MockGPUTexture(descriptor) as any;
  }

  createSampler(descriptor?: GPUSamplerDescriptor): GPUSampler {
    return new MockGPUSampler(descriptor) as any;
  }

  createBindGroupLayout(descriptor: GPUBindGroupLayoutDescriptor): GPUBindGroupLayout {
    return new MockGPUBindGroupLayout(descriptor) as any;
  }

  createPipelineLayout(descriptor: GPUPipelineLayoutDescriptor): GPUPipelineLayout {
    return new MockGPUPipelineLayout(descriptor) as any;
  }

  createBindGroup(descriptor: GPUBindGroupDescriptor): GPUBindGroup {
    return new MockGPUBindGroup(descriptor) as any;
  }

  createShaderModule(descriptor: GPUShaderModuleDescriptor): GPUShaderModule {
    return new MockGPUShaderModule(descriptor) as any;
  }

  createComputePipeline(descriptor: GPUComputePipelineDescriptor): GPUComputePipeline {
    return new MockGPUComputePipeline(descriptor) as any;
  }

  createRenderPipeline(descriptor: GPURenderPipelineDescriptor): GPURenderPipeline {
    return new MockGPURenderPipeline(descriptor) as any;
  }

  async createComputePipelineAsync(descriptor: GPUComputePipelineDescriptor): Promise<GPUComputePipeline> {
    return this.createComputePipeline(descriptor);
  }

  async createRenderPipelineAsync(descriptor: GPURenderPipelineDescriptor): Promise<GPURenderPipeline> {
    return this.createRenderPipeline(descriptor);
  }

  createCommandEncoder(descriptor?: GPUCommandEncoderDescriptor): GPUCommandEncoder {
    return new MockGPUCommandEncoder() as any;
  }

  createRenderBundleEncoder(descriptor: GPURenderBundleEncoderDescriptor): GPURenderBundleEncoder {
    return {} as any; // Simplified mock
  }

  createQuerySet(descriptor: GPUQuerySetDescriptor): GPUQuerySet {
    return new MockGPUQuerySet(descriptor) as any;
  }

  pushErrorScope(filter: GPUErrorFilter): void {
    // Mock implementation
  }

  async popErrorScope(): Promise<GPUError | null> {
    return null;
  }

  destroy(): void {
    // Mock implementation
  }

  get label(): string {
    return '';
  }

  set label(value: string) {}
}

/**
 * Mock GPUAdapter implementation
 */
export class MockGPUAdapter {
  readonly features: GPUSupportedFeatures = new Set<string>() as any;
  readonly limits: GPUSupportedLimits = new MockGPUDevice().limits;
  readonly isFallbackAdapter: boolean = false;

  async requestDevice(descriptor?: GPUDeviceDescriptor): Promise<GPUDevice> {
    return new MockGPUDevice() as any;
  }

  async requestAdapterInfo(): Promise<GPUAdapterInfo> {
    return {
      vendor: 'Mock Vendor',
      architecture: 'Mock Architecture',
      device: 'Mock Device',
      description: 'Mock WebGPU Adapter'
    } as any;
  }
}

/**
 * Creates a mock WebGPU adapter for testing
 *
 * @returns Mock GPU adapter
 *
 * @example
 * ```typescript
 * const adapter = createMockGPUAdapter();
 * const device = await adapter.requestDevice();
 * ```
 */
export function createMockGPUAdapter(): MockGPUAdapter {
  return new MockGPUAdapter();
}

/**
 * Creates a mock WebGPU device for testing
 *
 * @returns Mock GPU device
 *
 * @example
 * ```typescript
 * const device = createMockGPUDevice();
 * const buffer = device.createBuffer({ size: 1024, usage: GPUBufferUsage.VERTEX });
 * ```
 */
export function createMockGPUDevice(): MockGPUDevice {
  return new MockGPUDevice();
}
