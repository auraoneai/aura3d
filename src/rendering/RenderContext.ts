/**
 * @module Rendering/Core
 * @description
 * Per-frame rendering state and command recording for the G3D 5.0 engine.
 * Provides access to frame resources, scene data, and command encoding APIs.
 */

import { Logger } from '../core/Logger';
import { GPUDevice, TextureFormat } from './gpu/GPUDevice';
import { Scene } from './scene/Scene';
import { ViewData } from './ViewData';
import { FrameResources } from './FrameResources';
import { GBuffer } from './GBuffer';
import { Color } from '../math/Color';
import { Rect } from '../math/Rect';

const logger = Logger.create('RenderContext');

/**
 * Render pass color attachment descriptor.
 */
export interface ColorAttachment {
  /** Texture view to render to */
  view: any; // GPUTextureView
  /** Resolve target for MSAA */
  resolveTarget?: any;
  /** Clear value */
  clearValue?: Color;
  /** Load operation */
  loadOp: 'load' | 'clear';
  /** Store operation */
  storeOp: 'store' | 'discard';
}

/**
 * Render pass depth-stencil attachment descriptor.
 */
export interface DepthStencilAttachment {
  /** Texture view to render to */
  view: any; // GPUTextureView
  /** Depth clear value */
  depthClearValue?: number;
  /** Depth load operation */
  depthLoadOp?: 'load' | 'clear';
  /** Depth store operation */
  depthStoreOp?: 'store' | 'discard';
  /** Stencil clear value */
  stencilClearValue?: number;
  /** Stencil load operation */
  stencilLoadOp?: 'load' | 'clear';
  /** Stencil store operation */
  stencilStoreOp?: 'store' | 'discard';
  /** Read-only depth */
  depthReadOnly?: boolean;
  /** Read-only stencil */
  stencilReadOnly?: boolean;
}

/**
 * Render pass descriptor.
 */
export interface RenderPassDesc {
  /** Color attachments (up to 8) */
  colorAttachments: ColorAttachment[];
  /** Depth-stencil attachment (optional) */
  depthStencilAttachment?: DepthStencilAttachment;
  /** Viewport rectangle (optional) */
  viewport?: Rect;
  /** Scissor rectangle (optional) */
  scissor?: Rect;
  /** Debug label */
  label?: string;
}

/**
 * Render pass encoder for recording draw commands.
 * Abstracts WebGPU GPURenderPassEncoder and WebGL2 framebuffer binding.
 */
export interface RenderPassEncoder {
  /** Set the graphics pipeline */
  setPipeline(pipeline: any): void;
  /** Set vertex buffer */
  setVertexBuffer(slot: number, buffer: any, offset?: number, size?: number): void;
  /** Set index buffer */
  setIndexBuffer(buffer: any, format: 'uint16' | 'uint32', offset?: number, size?: number): void;
  /** Set bind group */
  setBindGroup(index: number, bindGroup: any, dynamicOffsets?: number[]): void;
  /** Draw */
  draw(vertexCount: number, instanceCount?: number, firstVertex?: number, firstInstance?: number): void;
  /** Draw indexed */
  drawIndexed(indexCount: number, instanceCount?: number, firstIndex?: number, baseVertex?: number, firstInstance?: number): void;
  /** End the render pass */
  end(): void;
}

/**
 * Compute pass encoder for recording compute commands.
 * Abstracts WebGPU GPUComputePassEncoder.
 */
export interface ComputePassEncoder {
  /** Set the compute pipeline */
  setPipeline(pipeline: any): void;
  /** Set bind group */
  setBindGroup(index: number, bindGroup: any, dynamicOffsets?: number[]): void;
  /** Dispatch workgroups */
  dispatch(x: number, y?: number, z?: number): void;
  /** Dispatch indirect */
  dispatchIndirect(buffer: any, offset: number): void;
  /** End the compute pass */
  end(): void;
}

/**
 * Temporary texture descriptor.
 */
export interface TextureDesc {
  /** Width in pixels */
  width: number;
  /** Height in pixels */
  height: number;
  /** Texture format */
  format: TextureFormat;
  /** Usage flags */
  usage: number;
  /** Sample count (default: 1) */
  sampleCount?: number;
  /** Mip level count (default: 1) */
  mipLevelCount?: number;
  /** Debug label */
  label?: string;
}

/**
 * Temporary texture pool entry.
 */
interface TemporaryTextureEntry {
  texture: any; // GPUTexture
  desc: TextureDesc;
  lastUsedFrame: number;
  inUse: boolean;
}

/**
 * Per-frame rendering statistics.
 */
export interface FrameStatistics {
  /** Number of draw calls */
  drawCalls: number;
  /** Number of triangles rendered */
  triangles: number;
  /** Number of vertices processed */
  vertices: number;
  /** Number of render passes */
  renderPasses: number;
  /** Number of compute passes */
  computePasses: number;
  /** Number of shader switches */
  shaderSwitches: number;
  /** Number of texture bindings */
  textureBindings: number;
}

/**
 * Per-frame rendering context for command recording and state management.
 * Provides unified access to frame resources, scene data, and GPU commands.
 *
 * @example
 * ```typescript
 * // In a render pass
 * function execute(context: RenderContext): void {
 *   const encoder = context.beginRenderPass({
 *     colorAttachments: [{
 *       view: context.gbuffer.albedo.createView(),
 *       loadOp: 'clear',
 *       storeOp: 'store',
 *       clearValue: Color.black(),
 *     }],
 *     depthStencilAttachment: {
 *       view: context.gbuffer.depth.createView(),
 *       depthLoadOp: 'clear',
 *       depthStoreOp: 'store',
 *       depthClearValue: 1.0,
 *     },
 *   });
 *
 *   // Record draw commands
 *   encoder.setPipeline(pipeline);
 *   encoder.draw(vertexCount);
 *   encoder.end();
 *
 *   // Update statistics
 *   context.recordDrawCall(vertexCount / 3);
 * }
 * ```
 */
export class RenderContext {
  /**
   * GPU device for resource creation and command submission.
   */
  readonly device: GPUDevice;

  /**
   * Current frame index (increments each frame).
   */
  readonly frameIndex: number;

  /**
   * Time since last frame in seconds.
   */
  readonly deltaTime: number;

  /**
   * Scene being rendered.
   */
  readonly scene: Scene;

  /**
   * Per-view rendering data (camera, matrices, frustum).
   */
  readonly viewData: ViewData;

  /**
   * Per-frame transient GPU resources.
   */
  readonly frameResources: FrameResources;

  /**
   * Geometry buffer for deferred rendering.
   */
  readonly gbuffer: GBuffer;

  /**
   * Command encoder for the current frame.
   */
  private _commandEncoder: any; // GPUCommandEncoder or null

  /**
   * Temporary texture pool for transient resources.
   */
  private _temporaryTextures: TemporaryTextureEntry[] = [];

  /**
   * Maximum age for temporary textures (frames).
   */
  private readonly MAX_TEXTURE_AGE = 2;

  /**
   * Frame statistics.
   */
  private _statistics: FrameStatistics = {
    drawCalls: 0,
    triangles: 0,
    vertices: 0,
    renderPasses: 0,
    computePasses: 0,
    shaderSwitches: 0,
    textureBindings: 0,
  };

  /**
   * Creates a new RenderContext instance.
   *
   * @param device - GPU device
   * @param frameIndex - Current frame index
   * @param deltaTime - Time since last frame
   * @param scene - Scene to render
   * @param viewData - View-specific rendering data
   * @param frameResources - Frame resources
   * @param gbuffer - Geometry buffer
   *
   * @example
   * ```typescript
   * const context = new RenderContext(
   *   device,
   *   frameIndex,
   *   deltaTime,
   *   scene,
   *   viewData,
   *   frameResources,
   *   gbuffer
   * );
   * ```
   */
  constructor(
    device: GPUDevice,
    frameIndex: number,
    deltaTime: number,
    scene: Scene,
    viewData: ViewData,
    frameResources: FrameResources,
    gbuffer: GBuffer
  ) {
    this.device = device;
    this.frameIndex = frameIndex;
    this.deltaTime = deltaTime;
    this.scene = scene;
    this.viewData = viewData;
    this.frameResources = frameResources;
    this.gbuffer = gbuffer;

    // Create command encoder for this frame
    this._commandEncoder = device.createCommandEncoder(`Frame${frameIndex}`);

    logger.trace(`Created RenderContext for frame ${frameIndex}`);
  }

  /**
   * Gets the current frame statistics.
   * @returns Frame statistics
   */
  get statistics(): Readonly<FrameStatistics> {
    return this._statistics;
  }

  /**
   * Begins a render pass with the specified descriptor.
   * Returns an encoder for recording draw commands.
   *
   * @param desc - Render pass descriptor
   * @returns Render pass encoder
   *
   * @example
   * ```typescript
   * const encoder = context.beginRenderPass({
   *   colorAttachments: [{
   *     view: colorTexture.createView(),
   *     loadOp: 'clear',
   *     storeOp: 'store',
   *     clearValue: new Color(0.1, 0.1, 0.1, 1.0),
   *   }],
   *   depthStencilAttachment: {
   *     view: depthTexture.createView(),
   *     depthLoadOp: 'clear',
   *     depthStoreOp: 'store',
   *     depthClearValue: 1.0,
   *   },
   * });
   * ```
   */
  beginRenderPass(desc: RenderPassDesc): RenderPassEncoder {
    if (!this._commandEncoder) {
      logger.error('Command encoder not available');
      throw new Error('Command encoder not available');
    }

    this._statistics.renderPasses++;

    // Convert descriptor to backend-specific format
    const passDesc: any = {
      label: desc.label,
      colorAttachments: desc.colorAttachments.map((att) => ({
        view: att.view,
        resolveTarget: att.resolveTarget,
        clearValue: att.clearValue
          ? {
              r: att.clearValue.r,
              g: att.clearValue.g,
              b: att.clearValue.b,
              a: att.clearValue.a,
            }
          : undefined,
        loadOp: att.loadOp,
        storeOp: att.storeOp,
      })),
      depthStencilAttachment: desc.depthStencilAttachment
        ? {
            view: desc.depthStencilAttachment.view,
            depthClearValue: desc.depthStencilAttachment.depthClearValue,
            depthLoadOp: desc.depthStencilAttachment.depthLoadOp,
            depthStoreOp: desc.depthStencilAttachment.depthStoreOp,
            stencilClearValue: desc.depthStencilAttachment.stencilClearValue,
            stencilLoadOp: desc.depthStencilAttachment.stencilLoadOp,
            stencilStoreOp: desc.depthStencilAttachment.stencilStoreOp,
            depthReadOnly: desc.depthStencilAttachment.depthReadOnly,
            stencilReadOnly: desc.depthStencilAttachment.stencilReadOnly,
          }
        : undefined,
    };

    const encoder = this._commandEncoder.beginRenderPass(passDesc);

    // Apply viewport and scissor if specified
    if (desc.viewport) {
      encoder.setViewport(
        desc.viewport.x,
        desc.viewport.y,
        desc.viewport.width,
        desc.viewport.height,
        0,
        1
      );
    }

    if (desc.scissor) {
      encoder.setScissorRect(
        desc.scissor.x,
        desc.scissor.y,
        desc.scissor.width,
        desc.scissor.height
      );
    }

    logger.trace(`Began render pass: ${desc.label || 'unnamed'}`);

    return encoder;
  }

  /**
   * Begins a compute pass for GPU compute operations.
   * Returns an encoder for recording compute commands.
   *
   * @param label - Debug label (optional)
   * @returns Compute pass encoder
   *
   * @example
   * ```typescript
   * const encoder = context.beginComputePass('ParticleSim');
   * encoder.setPipeline(computePipeline);
   * encoder.setBindGroup(0, bindGroup);
   * encoder.dispatch(workgroupCountX, workgroupCountY, workgroupCountZ);
   * encoder.end();
   * ```
   */
  beginComputePass(label?: string): ComputePassEncoder {
    if (!this._commandEncoder) {
      logger.error('Command encoder not available');
      throw new Error('Command encoder not available');
    }

    this._statistics.computePasses++;

    const encoder = this._commandEncoder.beginComputePass({ label });

    logger.trace(`Began compute pass: ${label || 'unnamed'}`);

    return encoder;
  }

  /**
   * Gets a temporary texture for transient rendering operations.
   * Textures are automatically pooled and reused across frames.
   *
   * @param desc - Texture descriptor
   * @returns GPU texture
   *
   * @example
   * ```typescript
   * const tempTex = context.getTemporaryTexture({
   *   width: 1920,
   *   height: 1080,
   *   format: TextureFormat.RGBA8Unorm,
   *   usage: TextureUsage.RenderAttachment | TextureUsage.TextureBinding,
   * });
   *
   * // Use texture...
   *
   * context.releaseTemporaryTexture(tempTex);
   * ```
   */
  getTemporaryTexture(desc: TextureDesc): any {
    // Try to find a matching unused texture
    for (const entry of this._temporaryTextures) {
      if (!entry.inUse && this._textureDescMatches(entry.desc, desc)) {
        entry.inUse = true;
        entry.lastUsedFrame = this.frameIndex;
        logger.trace(`Reusing temporary texture: ${desc.label || 'unnamed'}`);
        return entry.texture;
      }
    }

    // Create a new texture
    const texture = this.device.createTexture({
      size: { width: desc.width, height: desc.height, depth: 1 },
      format: desc.format,
      usage: desc.usage,
      dimension: '2d' as any,
      mipLevelCount: desc.mipLevelCount || 1,
      sampleCount: desc.sampleCount || 1,
      label: desc.label,
    });

    const entry: TemporaryTextureEntry = {
      texture,
      desc,
      lastUsedFrame: this.frameIndex,
      inUse: true,
    };

    this._temporaryTextures.push(entry);

    logger.trace(`Created temporary texture: ${desc.label || 'unnamed'}`);

    return texture;
  }

  /**
   * Releases a temporary texture back to the pool.
   *
   * @param texture - Texture to release
   *
   * @example
   * ```typescript
   * context.releaseTemporaryTexture(tempTex);
   * ```
   */
  releaseTemporaryTexture(texture: any): void {
    const entry = this._temporaryTextures.find((e) => e.texture === texture);
    if (entry) {
      entry.inUse = false;
      logger.trace('Released temporary texture');
    }
  }

  /**
   * Records a draw call for statistics tracking.
   *
   * @param triangles - Number of triangles rendered
   * @param vertices - Number of vertices processed (optional)
   *
   * @example
   * ```typescript
   * context.recordDrawCall(mesh.triangleCount, mesh.vertexCount);
   * ```
   */
  recordDrawCall(triangles: number, vertices?: number): void {
    this._statistics.drawCalls++;
    this._statistics.triangles += triangles;
    if (vertices !== undefined) {
      this._statistics.vertices += vertices;
    }
  }

  /**
   * Records a shader switch for statistics tracking.
   *
   * @example
   * ```typescript
   * context.recordShaderSwitch();
   * ```
   */
  recordShaderSwitch(): void {
    this._statistics.shaderSwitches++;
  }

  /**
   * Records a texture binding for statistics tracking.
   *
   * @example
   * ```typescript
   * context.recordTextureBinding();
   * ```
   */
  recordTextureBinding(): void {
    this._statistics.textureBindings++;
  }

  /**
   * Finishes command recording and returns the command buffer.
   * This must be called at the end of the frame.
   *
   * @returns Command buffer ready for submission
   *
   * @example
   * ```typescript
   * const commandBuffer = context.finish();
   * device.submit([commandBuffer]);
   * ```
   */
  finish(): any {
    if (!this._commandEncoder) {
      logger.error('Command encoder already finished');
      throw new Error('Command encoder already finished');
    }

    const commandBuffer = this._commandEncoder.finish();
    this._commandEncoder = null;

    // Clean up old temporary textures
    this._cleanupTemporaryTextures();

    logger.trace(`Finished frame ${this.frameIndex}`);

    return commandBuffer;
  }

  /**
   * Resets frame statistics.
   *
   * @example
   * ```typescript
   * context.resetStatistics();
   * ```
   */
  resetStatistics(): void {
    this._statistics = {
      drawCalls: 0,
      triangles: 0,
      vertices: 0,
      renderPasses: 0,
      computePasses: 0,
      shaderSwitches: 0,
      textureBindings: 0,
    };
  }

  /**
   * Cleans up temporary textures that haven't been used recently.
   * @private
   */
  private _cleanupTemporaryTextures(): void {
    const toRemove: number[] = [];

    for (let i = 0; i < this._temporaryTextures.length; i++) {
      const entry = this._temporaryTextures[i];
      const age = this.frameIndex - entry.lastUsedFrame;

      if (!entry.inUse && age > this.MAX_TEXTURE_AGE) {
        entry.texture.destroy();
        toRemove.push(i);
      }
    }

    // Remove in reverse order to maintain indices
    for (let i = toRemove.length - 1; i >= 0; i--) {
      this._temporaryTextures.splice(toRemove[i], 1);
    }

    if (toRemove.length > 0) {
      logger.trace(`Cleaned up ${toRemove.length} temporary textures`);
    }
  }

  /**
   * Checks if two texture descriptors match.
   * @private
   */
  private _textureDescMatches(a: TextureDesc, b: TextureDesc): boolean {
    return (
      a.width === b.width &&
      a.height === b.height &&
      a.format === b.format &&
      a.usage === b.usage &&
      (a.sampleCount || 1) === (b.sampleCount || 1) &&
      (a.mipLevelCount || 1) === (b.mipLevelCount || 1)
    );
  }

  /**
   * Disposes of all resources held by this context.
   * Should be called when the context is no longer needed.
   *
   * @example
   * ```typescript
   * context.dispose();
   * ```
   */
  dispose(): void {
    // Dispose all temporary textures
    for (const entry of this._temporaryTextures) {
      entry.texture.destroy();
    }
    this._temporaryTextures = [];

    logger.debug(`Disposed RenderContext for frame ${this.frameIndex}`);
  }
}
