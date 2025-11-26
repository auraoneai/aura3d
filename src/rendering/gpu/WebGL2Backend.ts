/**
 * @module Rendering/GPU
 * @description
 * WebGL2 backend implementation for fallback compatibility.
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
  TextureUsage,
  TextureFormat,
  TextureDimension,
  IndexFormat,
  VertexFormat,
  CompareFunction,
  BlendFactor,
  CullMode,
  FrontFace,
  PrimitiveTopology,
} from './GPUDevice';
import { GPUBuffer, GPUBufferDescriptor, MapMode, MemoryHint } from './GPUBuffer';
import { GPUTexture, GPUTextureDescriptor, GPUTextureView, GPUTextureViewDescriptor } from './GPUTexture';
import { GPUSampler, GPUSamplerDescriptor, FilterMode, AddressMode } from './GPUSampler';
import { GPUPipeline, RenderPipelineDescriptor, ComputePipelineDescriptor, PipelineType, VertexStepMode } from './GPUPipeline';
import {
  GPUCommandEncoder,
  RenderPassEncoder,
  ComputePassEncoder,
  RenderPassDescriptor,
  ComputePassDescriptor,
  BufferCopyView,
  TextureCopyView,
  Extent3D,
} from './GPUCommandEncoder';
import { Color } from '../../math/Color';

const logger = Logger.create('WebGL2Backend');

/**
 * WebGL2 shader module implementation.
 */
class WebGL2ShaderModule implements ShaderModule {
  readonly id: number;
  readonly label?: string;
  readonly stage: ShaderStage;
  readonly isValid: boolean;
  readonly error?: string;

  constructor(
    id: number,
    public glShader: WebGLShader | null,
    public source: string,
    descriptor: ShaderModuleDescriptor,
    compilationError?: string
  ) {
    this.id = id;
    this.label = descriptor.label;
    this.stage = descriptor.stage;
    this.source = source;
    this.isValid = glShader !== null && !compilationError;
    this.error = compilationError;
  }

  dispose(): void {
    // Shaders are deleted when programs are deleted
  }
}

/**
 * WebGL2 buffer implementation.
 */
class WebGL2Buffer extends GPUBuffer {
  private mappedData: ArrayBuffer | null = null;

  constructor(
    id: number,
    descriptor: GPUBufferDescriptor,
    public glBuffer: WebGLBuffer,
    private gl: WebGL2RenderingContext
  ) {
    super(id, descriptor);
  }

  protected writeInternal(data: ArrayBuffer | ArrayBufferView, offset: number): void {
    const target = this.getGLTarget();
    this.gl.bindBuffer(target, this.glBuffer);

    if (offset === 0 && (ArrayBuffer.isView(data) ? data.byteLength : data.byteLength) === this.size) {
      // Full buffer update
      this.gl.bufferData(
        target,
        ArrayBuffer.isView(data) ? data : new Uint8Array(data),
        this.getGLUsage(),
        0
      );
    } else {
      // Partial update
      this.gl.bufferSubData(
        target,
        offset,
        ArrayBuffer.isView(data) ? data : new Uint8Array(data)
      );
    }

    this.gl.bindBuffer(target, null);
  }

  protected async readInternal(_offset: number, _size: number): Promise<ArrayBuffer> {
    // WebGL2 doesn't support direct buffer reads
    // This would require a sync point which is very slow
    throw new Error('Buffer reads are not efficiently supported in WebGL2');
  }

  protected async mapInternal(mode: MapMode, _offset: number, size: number): Promise<ArrayBuffer> {
    // WebGL2 doesn't support mapped buffers
    // Emulate by creating a local copy
    if (mode === MapMode.Write) {
      this.mappedData = new ArrayBuffer(size);
      return this.mappedData;
    } else {
      throw new Error('Read mapping is not supported in WebGL2');
    }
  }

  protected unmapInternal(): void {
    if (this.mappedData && this.mappedRange) {
      this.writeInternal(this.mappedData, this.mappedRange.offset);
      this.mappedData = null;
    }
  }

  protected disposeInternal(): void {
    this.gl.deleteBuffer(this.glBuffer);
  }

  private getGLTarget(): number {
    if (this.usage & BufferUsage.Index) {
      return this.gl.ELEMENT_ARRAY_BUFFER;
    } else if (this.usage & BufferUsage.Uniform) {
      return this.gl.UNIFORM_BUFFER;
    } else {
      return this.gl.ARRAY_BUFFER;
    }
  }

  private getGLUsage(): number {
    switch (this.memoryHint) {
      case MemoryHint.Static:
        return this.gl.STATIC_DRAW;
      case MemoryHint.Dynamic:
        return this.gl.DYNAMIC_DRAW;
      case MemoryHint.Stream:
        return this.gl.STREAM_DRAW;
      default:
        return this.gl.STATIC_DRAW;
    }
  }
}

/**
 * WebGL2 texture view implementation.
 */
class WebGL2TextureView extends GPUTextureView {
  constructor(
    id: number,
    texture: GPUTexture,
    descriptor?: GPUTextureViewDescriptor
  ) {
    super(id, texture, descriptor);
  }

  protected disposeInternal(): void {
    // Views don't own resources in WebGL2
  }
}

/**
 * WebGL2 texture implementation.
 */
class WebGL2Texture extends GPUTexture {
  constructor(
    id: number,
    descriptor: GPUTextureDescriptor,
    public glTexture: WebGLTexture,
    private gl: WebGL2RenderingContext,
    private device: WebGL2Device
  ) {
    super(id, descriptor);
  }

  protected writeInternal(
    data: ArrayBuffer | ArrayBufferView,
    mipLevel: number,
    size: { width: number; height: number; depth?: number },
    offset?: { x?: number; y?: number; z?: number },
    _dataLayout?: any
  ): void {
    const target = this.getGLTarget();
    this.gl.bindTexture(target, this.glTexture);

    const glFormat = formatToGLFormat(this.format, this.gl);
    const glType = formatToGLType(this.format, this.gl);
    const glInternalFormat = formatToGLInternalFormat(this.format, this.gl);

    const pixels = ArrayBuffer.isView(data) ? data : new Uint8Array(data);

    if (offset && (offset.x || offset.y || offset.z)) {
      // Sub-image update
      if (target === this.gl.TEXTURE_2D) {
        this.gl.texSubImage2D(
          target,
          mipLevel,
          offset.x ?? 0,
          offset.y ?? 0,
          size.width,
          size.height,
          glFormat,
          glType,
          pixels
        );
      } else if (target === this.gl.TEXTURE_3D) {
        this.gl.texSubImage3D(
          target,
          mipLevel,
          offset.x ?? 0,
          offset.y ?? 0,
          offset.z ?? 0,
          size.width,
          size.height,
          size.depth ?? 1,
          glFormat,
          glType,
          pixels
        );
      }
    } else {
      // Full mip level update
      if (target === this.gl.TEXTURE_2D) {
        this.gl.texImage2D(
          target,
          mipLevel,
          glInternalFormat,
          size.width,
          size.height,
          0,
          glFormat,
          glType,
          pixels
        );
      } else if (target === this.gl.TEXTURE_3D) {
        this.gl.texImage3D(
          target,
          mipLevel,
          glInternalFormat,
          size.width,
          size.height,
          size.depth ?? 1,
          0,
          glFormat,
          glType,
          pixels
        );
      }
    }

    this.gl.bindTexture(target, null);
  }

  protected async readInternal(
    mipLevel: number,
    size: { width: number; height: number; depth?: number },
    offset?: { x?: number; y?: number; z?: number }
  ): Promise<ArrayBuffer> {
    // Create framebuffer and read pixels
    const fbo = this.gl.createFramebuffer();
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, fbo);
    this.gl.framebufferTexture2D(
      this.gl.FRAMEBUFFER,
      this.gl.COLOR_ATTACHMENT0,
      this.gl.TEXTURE_2D,
      this.glTexture,
      mipLevel
    );

    const buffer = new Uint8Array(size.width * size.height * 4);
    this.gl.readPixels(
      offset?.x ?? 0,
      offset?.y ?? 0,
      size.width,
      size.height,
      this.gl.RGBA,
      this.gl.UNSIGNED_BYTE,
      buffer
    );

    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.deleteFramebuffer(fbo);

    return buffer.buffer;
  }

  protected createViewInternal(descriptor?: GPUTextureViewDescriptor): GPUTextureView {
    // Generate a unique ID for the view by using current timestamp + random value
    const viewId = Date.now() + Math.floor(Math.random() * 1000000);
    return new WebGL2TextureView(
      viewId,
      this,
      descriptor
    );
  }

  protected generateMipmapsInternal(): void {
    const target = this.getGLTarget();
    this.gl.bindTexture(target, this.glTexture);
    this.gl.generateMipmap(target);
    this.gl.bindTexture(target, null);
  }

  protected disposeInternal(): void {
    this.gl.deleteTexture(this.glTexture);
  }

  private getGLTarget(): number {
    switch (this.dimension) {
      case TextureDimension.D2:
        return this.gl.TEXTURE_2D;
      case TextureDimension.D3:
        return this.gl.TEXTURE_3D;
      default:
        return this.gl.TEXTURE_2D;
    }
  }
}

/**
 * WebGL2 sampler implementation.
 */
class WebGL2Sampler extends GPUSampler {
  constructor(
    id: number,
    descriptor: GPUSamplerDescriptor,
    public glSampler: WebGLSampler,
    private gl: WebGL2RenderingContext
  ) {
    super(id, descriptor);
  }

  protected disposeInternal(): void {
    this.gl.deleteSampler(this.glSampler);
  }
}

/**
 * WebGL2 pipeline state.
 */
interface WebGL2PipelineState {
  program: WebGLProgram;
  vertexArrayObject: WebGLVertexArrayObject | null;
  primitive: PrimitiveTopology;
  cullMode: CullMode;
  frontFace: FrontFace;
  depthTest: boolean;
  depthWrite: boolean;
  depthCompare: CompareFunction;
  blendEnabled: boolean;
  blendSrcRGB: BlendFactor;
  blendDstRGB: BlendFactor;
  blendSrcAlpha: BlendFactor;
  blendDstAlpha: BlendFactor;
  vertexBuffers: Array<{
    stride: number;
    stepMode: VertexStepMode;
    attributes: Array<{
      format: VertexFormat;
      offset: number;
      location: number;
    }>;
  }>;
}

/**
 * WebGL2 pipeline implementation.
 */
class WebGL2Pipeline extends GPUPipeline {
  constructor(
    id: number,
    type: PipelineType,
    public state: WebGL2PipelineState,
    label?: string
  ) {
    super(id, type, label);
  }

  protected disposeInternal(): void {
    // Programs are managed by device
  }
}

/**
 * WebGL2 render pass encoder implementation.
 */
class WebGL2RenderPassEncoder extends RenderPassEncoder {
  private currentPipeline: WebGL2Pipeline | null = null;
  private boundVertexBuffers: Map<number, WebGL2Buffer> = new Map();

  constructor(
    private gl: WebGL2RenderingContext,
    private device: WebGL2Device,
    label?: string
  ) {
    super(label);
  }

  setPipeline(pipeline: GPUPipeline): void {
    const webgl2Pipeline = pipeline as WebGL2Pipeline;
    this.currentPipeline = webgl2Pipeline;

    const state = webgl2Pipeline.state;

    // Use program
    this.gl.useProgram(state.program);

    // Bind VAO if present
    if (state.vertexArrayObject) {
      this.gl.bindVertexArray(state.vertexArrayObject);
    }

    // Set rasterizer state
    if (state.cullMode !== CullMode.None) {
      this.gl.enable(this.gl.CULL_FACE);
      this.gl.cullFace(state.cullMode === CullMode.Front ? this.gl.FRONT : this.gl.BACK);
    } else {
      this.gl.disable(this.gl.CULL_FACE);
    }

    this.gl.frontFace(state.frontFace === FrontFace.CCW ? this.gl.CCW : this.gl.CW);

    // Set depth state
    if (state.depthTest) {
      this.gl.enable(this.gl.DEPTH_TEST);
      this.gl.depthFunc(compareFunctionToGL(state.depthCompare, this.gl));
    } else {
      this.gl.disable(this.gl.DEPTH_TEST);
    }

    this.gl.depthMask(state.depthWrite);

    // Set blend state
    if (state.blendEnabled) {
      this.gl.enable(this.gl.BLEND);
      this.gl.blendFuncSeparate(
        blendFactorToGL(state.blendSrcRGB, this.gl),
        blendFactorToGL(state.blendDstRGB, this.gl),
        blendFactorToGL(state.blendSrcAlpha, this.gl),
        blendFactorToGL(state.blendDstAlpha, this.gl)
      );
    } else {
      this.gl.disable(this.gl.BLEND);
    }
  }

  setVertexBuffer(slot: number, buffer: GPUBuffer, offset = 0, _size?: number): void {
    const webgl2Buffer = buffer as WebGL2Buffer;
    this.boundVertexBuffers.set(slot, webgl2Buffer);

    if (!this.currentPipeline) return;

    const state = this.currentPipeline.state;
    const bufferLayout = state.vertexBuffers[slot];
    if (!bufferLayout) return;

    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, webgl2Buffer.glBuffer);

    for (const attr of bufferLayout.attributes) {
      const location = attr.location;
      this.gl.enableVertexAttribArray(location);

      const info = vertexFormatToGL(attr.format, this.gl);
      this.gl.vertexAttribPointer(
        location,
        info.size,
        info.type,
        info.normalized,
        bufferLayout.stride,
        attr.offset + offset
      );

      if (bufferLayout.stepMode === VertexStepMode.Instance) {
        this.gl.vertexAttribDivisor(location, 1);
      }
    }
  }

  setIndexBuffer(buffer: GPUBuffer, format: IndexFormat, _offset = 0, _size?: number): void {
    const webgl2Buffer = buffer as WebGL2Buffer;
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, webgl2Buffer.glBuffer);
    this.currentIndexFormat = format;
  }

  /** Currently bound index format */
  private currentIndexFormat: IndexFormat = IndexFormat.Uint16;

  setBindGroup(_index: number, _bindGroup: any, _dynamicOffsets?: number[]): void {
    // WebGL2 bind groups are emulated through direct uniform/texture binding
    logger.warn('Bind groups not yet implemented for WebGL2');
  }

  draw(vertexCount: number, instanceCount = 1, firstVertex = 0, _firstInstance = 0): void {
    if (!this.currentPipeline) {
      logger.error('No pipeline set for draw call');
      return;
    }

    const mode = primitiveTopologyToGL(this.currentPipeline.state.primitive, this.gl);

    if (instanceCount > 1) {
      this.gl.drawArraysInstanced(mode, firstVertex, vertexCount, instanceCount);
    } else {
      this.gl.drawArrays(mode, firstVertex, vertexCount);
    }
  }

  drawIndexed(
    indexCount: number,
    instanceCount = 1,
    firstIndex = 0,
    _baseVertex = 0,
    _firstInstance = 0
  ): void {
    if (!this.currentPipeline) {
      logger.error('No pipeline set for draw call');
      return;
    }

    const mode = primitiveTopologyToGL(this.currentPipeline.state.primitive, this.gl);

    // Convert index format to WebGL constant and byte size
    const glIndexType = this.currentIndexFormat === IndexFormat.Uint32
      ? this.gl.UNSIGNED_INT
      : this.gl.UNSIGNED_SHORT;
    const indexSize = this.currentIndexFormat === IndexFormat.Uint32 ? 4 : 2;

    if (instanceCount > 1) {
      this.gl.drawElementsInstanced(
        mode,
        indexCount,
        glIndexType,
        firstIndex * indexSize,
        instanceCount
      );
    } else {
      this.gl.drawElements(mode, indexCount, glIndexType, firstIndex * indexSize);
    }
  }

  drawIndirect(_indirectBuffer: GPUBuffer, _indirectOffset: number): void {
    throw new Error('Indirect drawing not supported in WebGL2');
  }

  drawIndexedIndirect(_indirectBuffer: GPUBuffer, _indirectOffset: number): void {
    throw new Error('Indirect drawing not supported in WebGL2');
  }

  setViewport(x: number, y: number, width: number, height: number, minDepth = 0, maxDepth = 1): void {
    this.gl.viewport(x, y, width, height);
    this.gl.depthRange(minDepth, maxDepth);
  }

  setScissorRect(x: number, y: number, width: number, height: number): void {
    this.gl.enable(this.gl.SCISSOR_TEST);
    this.gl.scissor(x, y, width, height);
  }

  setBlendConstant(color: Color | [number, number, number, number]): void {
    if (color instanceof Color) {
      this.gl.blendColor(color.r, color.g, color.b, color.a);
    } else {
      this.gl.blendColor(color[0], color[1], color[2], color[3]);
    }
  }

  setStencilReference(_reference: number): void {
    // WebGL2 stencil reference is set with stencilFunc
    logger.warn('Stencil reference not fully supported in WebGL2');
  }

  beginOcclusionQuery(_queryIndex: number): void {
    logger.warn('Occlusion queries not yet implemented for WebGL2');
  }

  endOcclusionQuery(): void {
    logger.warn('Occlusion queries not yet implemented for WebGL2');
  }

  executeBundles(_bundles: any[]): void {
    throw new Error('Command bundles not supported in WebGL2');
  }

  protected endInternal(): void {
    // Unbind VAO
    this.gl.bindVertexArray(null);
    this.gl.bindBuffer(this.gl.ARRAY_BUFFER, null);
    this.gl.bindBuffer(this.gl.ELEMENT_ARRAY_BUFFER, null);
  }
}

/**
 * WebGL2 compute pass encoder (not supported).
 */
class WebGL2ComputePassEncoder extends ComputePassEncoder {
  constructor() {
    super();
  }

  setPipeline(_pipeline: GPUPipeline): void {
    throw new Error('Compute shaders not supported in WebGL2');
  }

  setBindGroup(_index: number, _bindGroup: any, _dynamicOffsets?: number[]): void {
    throw new Error('Compute shaders not supported in WebGL2');
  }

  dispatch(_workgroupCountX: number, _workgroupCountY = 1, _workgroupCountZ = 1): void {
    throw new Error('Compute shaders not supported in WebGL2');
  }

  dispatchIndirect(_indirectBuffer: GPUBuffer, _indirectOffset: number): void {
    throw new Error('Compute shaders not supported in WebGL2');
  }

  protected endInternal(): void {
    // Nothing to do
  }
}

/**
 * WebGL2 command encoder implementation.
 */
class WebGL2CommandEncoder extends GPUCommandEncoder {
  private commands: Array<() => void> = [];

  constructor(
    private gl: WebGL2RenderingContext,
    private device: WebGL2Device,
    label?: string
  ) {
    super(label);
  }

  beginRenderPass(descriptor: RenderPassDescriptor): RenderPassEncoder {
    // Set up framebuffer
    const fbo = this.gl.createFramebuffer();
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, fbo);

    // Attach color attachments
    for (let i = 0; i < descriptor.colorAttachments.length; i++) {
      const attachment = descriptor.colorAttachments[i];
      const view = attachment.view as WebGL2TextureView;
      const texture = view.texture as WebGL2Texture;

      this.gl.framebufferTexture2D(
        this.gl.FRAMEBUFFER,
        this.gl.COLOR_ATTACHMENT0 + i,
        this.gl.TEXTURE_2D,
        texture.glTexture,
        0
      );

      // Handle load op
      if (attachment.loadOp === 'clear') {
        const clearValue = attachment.clearValue;
        if (clearValue) {
          if (clearValue instanceof Color) {
            this.gl.clearColor(clearValue.r, clearValue.g, clearValue.b, clearValue.a);
          } else {
            this.gl.clearColor(clearValue[0], clearValue[1], clearValue[2], clearValue[3]);
          }
        }
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);
      }
    }

    // Attach depth/stencil
    if (descriptor.depthStencilAttachment) {
      const ds = descriptor.depthStencilAttachment;
      const view = ds.view as WebGL2TextureView;
      const texture = view.texture as WebGL2Texture;

      this.gl.framebufferTexture2D(
        this.gl.FRAMEBUFFER,
        this.gl.DEPTH_STENCIL_ATTACHMENT,
        this.gl.TEXTURE_2D,
        texture.glTexture,
        0
      );

      // Handle depth clear
      if (ds.depthLoadOp === 'clear' && ds.depthClearValue !== undefined) {
        this.gl.clearDepth(ds.depthClearValue);
        this.gl.clear(this.gl.DEPTH_BUFFER_BIT);
      }

      // Handle stencil clear
      if (ds.stencilLoadOp === 'clear' && ds.stencilClearValue !== undefined) {
        this.gl.clearStencil(ds.stencilClearValue);
        this.gl.clear(this.gl.STENCIL_BUFFER_BIT);
      }
    }

    return new WebGL2RenderPassEncoder(this.gl, this.device, descriptor.label);
  }

  beginComputePass(_descriptor?: ComputePassDescriptor): ComputePassEncoder {
    throw new Error('Compute passes not supported in WebGL2');
  }

  copyBufferToBuffer(
    _source: GPUBuffer,
    _sourceOffset: number,
    _destination: GPUBuffer,
    _destinationOffset: number,
    _size: number
  ): void {
    this.commands.push(() => {

      // WebGL2 doesn't have direct buffer-to-buffer copy
      // Use transform feedback or pixel buffer objects as workaround
      logger.warn('Buffer-to-buffer copy not efficiently implemented for WebGL2');
    });
  }

  copyBufferToTexture(
    _source: BufferCopyView,
    _destination: TextureCopyView,
    _copySize: Extent3D
  ): void {
    this.commands.push(() => {
      logger.warn('Buffer-to-texture copy not yet implemented for WebGL2');
    });
  }

  copyTextureToTexture(
    _source: TextureCopyView,
    _destination: BufferCopyView,
    _copySize: Extent3D
  ): void {
    this.commands.push(() => {
      logger.warn('Texture-to-buffer copy not yet implemented for WebGL2');
    });
  }

  copyTextureToTexture2(
    source: TextureCopyView,
    destination: TextureCopyView,
    _copySize: Extent3D
  ): void {
    this.commands.push(() => {
      const srcTexture = source.texture as WebGL2Texture;
      const dstTexture = destination.texture as WebGL2Texture;

      // Use framebuffer blit
      const readFBO = this.gl.createFramebuffer();
      const drawFBO = this.gl.createFramebuffer();

      this.gl.bindFramebuffer(this.gl.READ_FRAMEBUFFER, readFBO);
      this.gl.framebufferTexture2D(
        this.gl.READ_FRAMEBUFFER,
        this.gl.COLOR_ATTACHMENT0,
        this.gl.TEXTURE_2D,
        srcTexture.glTexture,
        source.mipLevel ?? 0
      );

      this.gl.bindFramebuffer(this.gl.DRAW_FRAMEBUFFER, drawFBO);
      this.gl.framebufferTexture2D(
        this.gl.DRAW_FRAMEBUFFER,
        this.gl.COLOR_ATTACHMENT0,
        this.gl.TEXTURE_2D,
        dstTexture.glTexture,
        destination.mipLevel ?? 0
      );

      this.gl.blitFramebuffer(
        source.origin?.x ?? 0,
        source.origin?.y ?? 0,
        (source.origin?.x ?? 0) + _copySize.width,
        (source.origin?.y ?? 0) + (_copySize.height ?? 1),
        destination.origin?.x ?? 0,
        destination.origin?.y ?? 0,
        (destination.origin?.x ?? 0) + _copySize.width,
        (destination.origin?.y ?? 0) + (_copySize.height ?? 1),
        this.gl.COLOR_BUFFER_BIT,
        this.gl.NEAREST
      );

      this.gl.deleteFramebuffer(readFBO);
      this.gl.deleteFramebuffer(drawFBO);
    });
  }

  clearBuffer(_buffer: GPUBuffer, _offset = 0, _size?: number): void {
    this.commands.push(() => {
      logger.warn('Buffer clear not efficiently implemented for WebGL2');
    });
  }

  writeTimestamp(_querySet: any, _queryIndex: number): void {
    logger.warn('Timestamp queries not supported in WebGL2');
  }

  resolveQuerySet(
    _querySet: any,
    _firstQuery: number,
    _queryCount: number,
    _destination: GPUBuffer,
    _destinationOffset: number
  ): void {
    logger.warn('Query resolution not supported in WebGL2');
  }

  protected finishInternal(): any {
    // Execute all recorded commands
    for (const cmd of this.commands) {
      cmd();
    }
    this.commands = [];

    // Return a dummy command buffer
    return { isWebGL2: true };
  }
}

/**
 * WebGL2 device implementation.
 */
export class WebGL2Device extends GPUDevice {
  private capabilities: GPUCapabilities;
  private extensions: Map<string, any> = new Map();
  private currentTexture: GPUTexture | null = null;

  constructor(
    private gl: WebGL2RenderingContext,
    private canvas: HTMLCanvasElement
  ) {
    super();
    this.capabilities = this.buildCapabilities();
    this.loadExtensions();

    logger.info('WebGL2 device created', {
      vendor: this.capabilities.vendor,
      renderer: this.capabilities.renderer,
    });
  }

  private loadExtensions(): void {
    const extensions = [
      'EXT_color_buffer_float',
      'EXT_texture_filter_anisotropic',
      'WEBGL_compressed_texture_s3tc',
      'WEBGL_compressed_texture_etc',
      'WEBGL_compressed_texture_astc',
      'OES_texture_float_linear',
    ];

    for (const name of extensions) {
      const ext = this.gl.getExtension(name);
      if (ext) {
        this.extensions.set(name, ext);
        logger.debug(`Loaded extension: ${name}`);
      }
    }
  }

  private buildCapabilities(): GPUCapabilities {
    const features = new Set<GPUFeature>();

    // Check for depth texture support
    features.add(GPUFeature.DepthTexture);

    // Check for float texture support
    if (this.gl.getExtension('OES_texture_float')) {
      features.add(GPUFeature.FloatTexture);
    }

    // Check for float texture linear filtering
    if (this.gl.getExtension('OES_texture_float_linear')) {
      features.add(GPUFeature.FloatTextureLinear);
    }

    // Anisotropic filtering
    if (this.gl.getExtension('EXT_texture_filter_anisotropic')) {
      features.add(GPUFeature.AnisotropicFiltering);
    }

    // WebGL2 supports these by default
    features.add(GPUFeature.MultipleRenderTargets);
    features.add(GPUFeature.Instancing);
    features.add(GPUFeature.Texture3D);

    // Compression formats
    if (this.gl.getExtension('WEBGL_compressed_texture_s3tc')) {
      features.add(GPUFeature.TextureCompressionBC);
    }
    if (this.gl.getExtension('WEBGL_compressed_texture_etc')) {
      features.add(GPUFeature.TextureCompressionETC2);
    }
    if (this.gl.getExtension('WEBGL_compressed_texture_astc')) {
      features.add(GPUFeature.TextureCompressionASTC);
    }

    const limits: GPULimits = {
      maxTextureDimension2D: this.gl.getParameter(this.gl.MAX_TEXTURE_SIZE),
      maxTextureDimension3D: this.gl.getParameter(this.gl.MAX_3D_TEXTURE_SIZE),
      maxTextureDimensionCube: this.gl.getParameter(this.gl.MAX_CUBE_MAP_TEXTURE_SIZE),
      maxTextureArrayLayers: this.gl.getParameter(this.gl.MAX_ARRAY_TEXTURE_LAYERS),
      maxVertexAttributes: this.gl.getParameter(this.gl.MAX_VERTEX_ATTRIBS),
      maxVertexBuffers: this.gl.getParameter(this.gl.MAX_VERTEX_ATTRIBS),
      maxVertexBufferStride: 2048,
      maxUniformBufferSize: this.gl.getParameter(this.gl.MAX_UNIFORM_BLOCK_SIZE),
      maxStorageBufferSize: 0,
      maxColorAttachments: this.gl.getParameter(this.gl.MAX_COLOR_ATTACHMENTS),
      maxSamples: this.gl.getParameter(this.gl.MAX_SAMPLES),
      maxAnisotropy: this.extensions.has('EXT_texture_filter_anisotropic')
        ? this.gl.getParameter(this.gl.getExtension('EXT_texture_filter_anisotropic')!.MAX_TEXTURE_MAX_ANISOTROPY_EXT)
        : 1,
      maxComputeWorkgroupSizeX: 0,
      maxComputeWorkgroupSizeY: 0,
      maxComputeWorkgroupSizeZ: 0,
      maxComputeWorkgroupInvocations: 0,
      maxComputeWorkgroupsPerDimension: 0,
    };

    return {
      backend: GPUBackendType.WebGL2,
      vendor: this.gl.getParameter(this.gl.VENDOR),
      renderer: this.gl.getParameter(this.gl.RENDERER),
      features,
      limits,
      supportsWGSL: false,
      supportsGLSL: true,
    };
  }

  getCapabilities(): GPUCapabilities {
    return this.capabilities;
  }

  async createShaderModule(descriptor: ShaderModuleDescriptor): Promise<ShaderModule> {
    if (descriptor.language !== 'glsl') {
      return new WebGL2ShaderModule(
        this.generateResourceId(),
        null,
        '',
        descriptor,
        'WebGL2 only supports GLSL shaders'
      );
    }

    const glType =
      descriptor.stage === ShaderStage.Vertex
        ? this.gl.VERTEX_SHADER
        : this.gl.FRAGMENT_SHADER;

    const shader = this.gl.createShader(glType);
    if (!shader) {
      return new WebGL2ShaderModule(
        this.generateResourceId(),
        null,
        descriptor.code,
        descriptor,
        'Failed to create shader'
      );
    }

    this.gl.shaderSource(shader, descriptor.code);
    this.gl.compileShader(shader);

    if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
      const error = this.gl.getShaderInfoLog(shader) ?? 'Unknown compilation error';
      this.gl.deleteShader(shader);
      return new WebGL2ShaderModule(
        this.generateResourceId(),
        null,
        descriptor.code,
        descriptor,
        error
      );
    }

    return new WebGL2ShaderModule(
      this.generateResourceId(),
      shader,
      descriptor.code,
      descriptor
    );
  }

  createBuffer(descriptor: GPUBufferDescriptor): GPUBuffer {
    const buffer = this.gl.createBuffer();
    if (!buffer) {
      throw new Error('Failed to create buffer');
    }

    const target =
      descriptor.usage & BufferUsage.Index
        ? this.gl.ELEMENT_ARRAY_BUFFER
        : this.gl.ARRAY_BUFFER;

    this.gl.bindBuffer(target, buffer);
    this.gl.bufferData(target, descriptor.size, this.gl.STATIC_DRAW);
    this.gl.bindBuffer(target, null);

    return new WebGL2Buffer(this.generateResourceId(), descriptor, buffer, this.gl);
  }

  createTexture(descriptor: GPUTextureDescriptor): GPUTexture {
    const texture = this.gl.createTexture();
    if (!texture) {
      throw new Error('Failed to create texture');
    }

    const target =
      descriptor.dimension === TextureDimension.D3 ? this.gl.TEXTURE_3D : this.gl.TEXTURE_2D;

    this.gl.bindTexture(target, texture);

    const glInternalFormat = formatToGLInternalFormat(descriptor.format, this.gl);
    const glFormat = formatToGLFormat(descriptor.format, this.gl);
    const glType = formatToGLType(descriptor.format, this.gl);

    if (target === this.gl.TEXTURE_2D) {
      this.gl.texImage2D(
        target,
        0,
        glInternalFormat,
        descriptor.size.width,
        descriptor.size.height,
        0,
        glFormat,
        glType,
        null
      );
    } else if (target === this.gl.TEXTURE_3D) {
      this.gl.texImage3D(
        target,
        0,
        glInternalFormat,
        descriptor.size.width,
        descriptor.size.height,
        descriptor.size.depth ?? 1,
        0,
        glFormat,
        glType,
        null
      );
    }

    this.gl.bindTexture(target, null);

    return new WebGL2Texture(this.generateResourceId(), descriptor, texture, this.gl, this);
  }

  createSampler(descriptor: GPUSamplerDescriptor): GPUSampler {
    const sampler = this.gl.createSampler();
    if (!sampler) {
      throw new Error('Failed to create sampler');
    }

    const magFilter =
      descriptor.magFilter === FilterMode.Linear ? this.gl.LINEAR : this.gl.NEAREST;
    const minFilter =
      descriptor.minFilter === FilterMode.Linear ? this.gl.LINEAR : this.gl.NEAREST;

    this.gl.samplerParameteri(sampler, this.gl.TEXTURE_MAG_FILTER, magFilter);
    this.gl.samplerParameteri(sampler, this.gl.TEXTURE_MIN_FILTER, minFilter);

    const wrapS = addressModeToGL(descriptor.addressModeU ?? AddressMode.ClampToEdge, this.gl);
    const wrapT = addressModeToGL(descriptor.addressModeV ?? AddressMode.ClampToEdge, this.gl);
    const wrapR = addressModeToGL(descriptor.addressModeW ?? AddressMode.ClampToEdge, this.gl);

    this.gl.samplerParameteri(sampler, this.gl.TEXTURE_WRAP_S, wrapS);
    this.gl.samplerParameteri(sampler, this.gl.TEXTURE_WRAP_T, wrapT);
    this.gl.samplerParameteri(sampler, this.gl.TEXTURE_WRAP_R, wrapR);

    if (descriptor.maxAnisotropy && descriptor.maxAnisotropy > 1) {
      const ext = this.extensions.get('EXT_texture_filter_anisotropic');
      if (ext) {
        this.gl.samplerParameterf(
          sampler,
          ext.TEXTURE_MAX_ANISOTROPY_EXT,
          descriptor.maxAnisotropy
        );
      }
    }

    return new WebGL2Sampler(this.generateResourceId(), descriptor, sampler, this.gl);
  }

  createRenderPipeline(descriptor: RenderPipelineDescriptor): GPUPipeline {
    const vertexShader = descriptor.vertex.module as WebGL2ShaderModule;
    const fragmentShader = descriptor.fragment?.module as WebGL2ShaderModule;

    const program = this.gl.createProgram();
    if (!program) {
      throw new Error('Failed to create program');
    }

    this.gl.attachShader(program, vertexShader.glShader!);
    if (fragmentShader) {
      this.gl.attachShader(program, fragmentShader.glShader!);
    }

    this.gl.linkProgram(program);

    if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
      const error = this.gl.getProgramInfoLog(program) ?? 'Unknown link error';
      this.gl.deleteProgram(program);
      throw new Error(`Pipeline link failed: ${error}`);
    }

    // Build pipeline state
    const state: WebGL2PipelineState = {
      program,
      vertexArrayObject: this.gl.createVertexArray(),
      primitive: descriptor.primitive?.topology ?? PrimitiveTopology.TriangleList,
      cullMode: descriptor.primitive?.cullMode ?? CullMode.None,
      frontFace: descriptor.primitive?.frontFace ?? FrontFace.CCW,
      depthTest: descriptor.depthStencil?.depthCompare !== undefined,
      depthWrite: descriptor.depthStencil?.depthWriteEnabled ?? false,
      depthCompare: descriptor.depthStencil?.depthCompare ?? CompareFunction.Less,
      blendEnabled: descriptor.fragment?.targets[0]?.blend !== undefined,
      blendSrcRGB: descriptor.fragment?.targets[0]?.blend?.color.srcFactor ?? BlendFactor.One,
      blendDstRGB: descriptor.fragment?.targets[0]?.blend?.color.dstFactor ?? BlendFactor.Zero,
      blendSrcAlpha: descriptor.fragment?.targets[0]?.blend?.alpha.srcFactor ?? BlendFactor.One,
      blendDstAlpha: descriptor.fragment?.targets[0]?.blend?.alpha.dstFactor ?? BlendFactor.Zero,
      vertexBuffers: descriptor.vertex.buffers?.map(buf => ({
        stride: buf.arrayStride,
        stepMode: buf.stepMode ?? VertexStepMode.Vertex,
        attributes: buf.attributes.map(attr => ({
          format: attr.format,
          offset: attr.offset,
          location: attr.shaderLocation,
        })),
      })) ?? [],
    };

    return new WebGL2Pipeline(
      this.generateResourceId(),
      PipelineType.Render,
      state,
      descriptor.label
    );
  }

  createComputePipeline(_descriptor: ComputePipelineDescriptor): GPUPipeline {
    throw new Error('Compute pipelines not supported in WebGL2');
  }

  createCommandEncoder(label?: string): GPUCommandEncoder {
    return new WebGL2CommandEncoder(this.gl, this, label);
  }

  submit(_commandBuffers: any[]): void {
    // WebGL2 commands are executed immediately
    this.gl.flush();
  }

  async waitForIdle(): Promise<void> {
    this.gl.finish();
  }

  getCurrentTexture(): GPUTexture | null {
    // WebGL2 renders directly to canvas
    // Return a dummy texture representing the default framebuffer
    if (!this.currentTexture) {
      this.currentTexture = this.createTexture({
        size: { width: this.canvas.width, height: this.canvas.height },
        format: TextureFormat.RGBA8Unorm,
        usage: TextureUsage.RenderAttachment,
        label: 'DefaultFramebuffer',
      });
    }
    return this.currentTexture;
  }

  present(): void {
    // WebGL2 automatically presents
    this.currentTexture = null;
  }

  override dispose(): void {
    if (this.disposed) {
      return;
    }

    const ext = this.gl.getExtension('WEBGL_lose_context');
    if (ext) {
      ext.loseContext();
    }

    super.dispose();
  }
}

// Helper functions for WebGL conversions

function formatToGLInternalFormat(format: TextureFormat, gl: WebGL2RenderingContext): number {
  switch (format) {
    case TextureFormat.RGBA8Unorm:
      return gl.RGBA8;
    case TextureFormat.RGBA8UnormSrgb:
      return gl.SRGB8_ALPHA8;
    case TextureFormat.BGRA8Unorm:
      return gl.RGBA8;
    case TextureFormat.RGBA16Float:
      return gl.RGBA16F;
    case TextureFormat.RGBA32Float:
      return gl.RGBA32F;
    case TextureFormat.Depth24Plus:
      return gl.DEPTH_COMPONENT24;
    case TextureFormat.Depth32Float:
      return gl.DEPTH_COMPONENT32F;
    default:
      return gl.RGBA8;
  }
}

function formatToGLFormat(format: TextureFormat, gl: WebGL2RenderingContext): number {
  switch (format) {
    case TextureFormat.RGBA8Unorm:
    case TextureFormat.RGBA8UnormSrgb:
    case TextureFormat.BGRA8Unorm:
    case TextureFormat.RGBA16Float:
    case TextureFormat.RGBA32Float:
      return gl.RGBA;
    case TextureFormat.Depth24Plus:
    case TextureFormat.Depth32Float:
      return gl.DEPTH_COMPONENT;
    default:
      return gl.RGBA;
  }
}

function formatToGLType(format: TextureFormat, gl: WebGL2RenderingContext): number {
  switch (format) {
    case TextureFormat.RGBA8Unorm:
    case TextureFormat.RGBA8UnormSrgb:
    case TextureFormat.BGRA8Unorm:
      return gl.UNSIGNED_BYTE;
    case TextureFormat.RGBA16Float:
      return gl.HALF_FLOAT;
    case TextureFormat.RGBA32Float:
    case TextureFormat.Depth32Float:
      return gl.FLOAT;
    case TextureFormat.Depth24Plus:
      return gl.UNSIGNED_INT;
    default:
      return gl.UNSIGNED_BYTE;
  }
}

function addressModeToGL(mode: AddressMode, gl: WebGL2RenderingContext): number {
  switch (mode) {
    case AddressMode.ClampToEdge:
      return gl.CLAMP_TO_EDGE;
    case AddressMode.Repeat:
      return gl.REPEAT;
    case AddressMode.MirrorRepeat:
      return gl.MIRRORED_REPEAT;
    default:
      return gl.CLAMP_TO_EDGE;
  }
}

function compareFunctionToGL(func: CompareFunction, gl: WebGL2RenderingContext): number {
  switch (func) {
    case CompareFunction.Never:
      return gl.NEVER;
    case CompareFunction.Less:
      return gl.LESS;
    case CompareFunction.Equal:
      return gl.EQUAL;
    case CompareFunction.LessEqual:
      return gl.LEQUAL;
    case CompareFunction.Greater:
      return gl.GREATER;
    case CompareFunction.NotEqual:
      return gl.NOTEQUAL;
    case CompareFunction.GreaterEqual:
      return gl.GEQUAL;
    case CompareFunction.Always:
      return gl.ALWAYS;
    default:
      return gl.LESS;
  }
}

function blendFactorToGL(factor: BlendFactor, gl: WebGL2RenderingContext): number {
  switch (factor) {
    case BlendFactor.Zero:
      return gl.ZERO;
    case BlendFactor.One:
      return gl.ONE;
    case BlendFactor.Src:
      return gl.SRC_COLOR;
    case BlendFactor.OneMinusSrc:
      return gl.ONE_MINUS_SRC_COLOR;
    case BlendFactor.SrcAlpha:
      return gl.SRC_ALPHA;
    case BlendFactor.OneMinusSrcAlpha:
      return gl.ONE_MINUS_SRC_ALPHA;
    case BlendFactor.Dst:
      return gl.DST_COLOR;
    case BlendFactor.OneMinusDst:
      return gl.ONE_MINUS_DST_COLOR;
    case BlendFactor.DstAlpha:
      return gl.DST_ALPHA;
    case BlendFactor.OneMinusDstAlpha:
      return gl.ONE_MINUS_DST_ALPHA;
    default:
      return gl.ONE;
  }
}

function primitiveTopologyToGL(topology: PrimitiveTopology, gl: WebGL2RenderingContext): number {
  switch (topology) {
    case PrimitiveTopology.PointList:
      return gl.POINTS;
    case PrimitiveTopology.LineList:
      return gl.LINES;
    case PrimitiveTopology.LineStrip:
      return gl.LINE_STRIP;
    case PrimitiveTopology.TriangleList:
      return gl.TRIANGLES;
    case PrimitiveTopology.TriangleStrip:
      return gl.TRIANGLE_STRIP;
    default:
      return gl.TRIANGLES;
  }
}

function vertexFormatToGL(
  format: VertexFormat,
  gl: WebGL2RenderingContext
): { size: number; type: number; normalized: boolean } {
  switch (format) {
    case VertexFormat.Float32:
      return { size: 1, type: gl.FLOAT, normalized: false };
    case VertexFormat.Float32x2:
      return { size: 2, type: gl.FLOAT, normalized: false };
    case VertexFormat.Float32x3:
      return { size: 3, type: gl.FLOAT, normalized: false };
    case VertexFormat.Float32x4:
      return { size: 4, type: gl.FLOAT, normalized: false };
    case VertexFormat.Uint8x2:
      return { size: 2, type: gl.UNSIGNED_BYTE, normalized: false };
    case VertexFormat.Uint8x4:
      return { size: 4, type: gl.UNSIGNED_BYTE, normalized: false };
    case VertexFormat.Unorm8x4:
      return { size: 4, type: gl.UNSIGNED_BYTE, normalized: true };
    default:
      return { size: 4, type: gl.FLOAT, normalized: false };
  }
}

/**
 * Creates a WebGL2 device instance.
 * @param canvas - Canvas element to render to
 * @param options - WebGL context options
 * @returns WebGL2 device or null if not supported
 *
 * @example
 * ```typescript
 * const canvas = document.getElementById('canvas') as HTMLCanvasElement;
 * const device = createWebGL2Device(canvas);
 * if (!device) {
 *   console.error('WebGL2 not supported');
 * }
 * ```
 */
export function createWebGL2Device(
  canvas: HTMLCanvasElement,
  options?: WebGLContextAttributes
): WebGL2Device | null {
  const gl = canvas.getContext('webgl2', options);
  if (!gl) {
    logger.warn('WebGL2 not supported in this browser');
    return null;
  }

  return new WebGL2Device(gl, canvas);
}
