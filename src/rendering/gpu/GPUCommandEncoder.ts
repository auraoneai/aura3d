/**
 * @module Rendering/GPU
 * @description
 * GPU command encoder for recording render and compute commands.
 */

import { Logger } from '../../core/Logger';
import { GPUBuffer } from './GPUBuffer';
import { GPUTexture, ColorAttachment, DepthStencilAttachment } from './GPUTexture';
import { GPUPipeline } from './GPUPipeline';
import { IndexFormat } from './GPUDevice';
import { Color } from '../../math/Color';

const logger = Logger.create('GPUCommandEncoder');

/**
 * Render pass descriptor.
 */
export interface RenderPassDescriptor {
  /** Color attachments */
  colorAttachments: ColorAttachment[];
  /** Depth/stencil attachment */
  depthStencilAttachment?: DepthStencilAttachment;
  /** Occlusion query set */
  occlusionQuerySet?: any;
  /** Timestamp writes for profiling */
  timestampWrites?: {
    querySet: any;
    beginningOfPassWriteIndex?: number;
    endOfPassWriteIndex?: number;
  };
  /** Debug label */
  label?: string;
}

/**
 * Compute pass descriptor.
 */
export interface ComputePassDescriptor {
  /** Timestamp writes for profiling */
  timestampWrites?: {
    querySet: any;
    beginningOfPassWriteIndex?: number;
    endOfPassWriteIndex?: number;
  };
  /** Debug label */
  label?: string;
}

/**
 * Buffer copy descriptor.
 */
export interface BufferCopyView {
  /** Buffer to copy from/to */
  buffer: GPUBuffer;
  /** Offset in bytes */
  offset?: number;
  /** Bytes per row (for texture copies) */
  bytesPerRow?: number;
  /** Rows per image (for 3D texture copies) */
  rowsPerImage?: number;
}

/**
 * Texture copy descriptor.
 */
export interface TextureCopyView {
  /** Texture to copy from/to */
  texture: GPUTexture;
  /** Mip level */
  mipLevel?: number;
  /** Origin coordinates */
  origin?: { x?: number; y?: number; z?: number };
}

/**
 * Copy size descriptor.
 */
export interface Extent3D {
  /** Width */
  width: number;
  /** Height */
  height?: number;
  /** Depth or array layers */
  depth?: number;
}

/**
 * Abstract render pass encoder.
 *
 * Records rendering commands within a render pass.
 */
export abstract class RenderPassEncoder {
  protected label?: string;
  protected ended = false;

  constructor(label?: string) {
    this.label = label;
  }

  /**
   * Sets the rendering pipeline.
   * @param pipeline - Render pipeline to use
   *
   * @example
   * ```typescript
   * pass.setPipeline(renderPipeline);
   * ```
   */
  abstract setPipeline(pipeline: GPUPipeline): void;

  /**
   * Sets a vertex buffer for a binding slot.
   * @param slot - Vertex buffer slot
   * @param buffer - Vertex buffer
   * @param offset - Offset in bytes (default: 0)
   * @param size - Size in bytes (default: entire buffer)
   *
   * @example
   * ```typescript
   * pass.setVertexBuffer(0, positionBuffer);
   * pass.setVertexBuffer(1, normalBuffer);
   * ```
   */
  abstract setVertexBuffer(
    slot: number,
    buffer: GPUBuffer,
    offset?: number,
    size?: number
  ): void;

  /**
   * Sets the index buffer.
   * @param buffer - Index buffer
   * @param format - Index format (uint16 or uint32)
   * @param offset - Offset in bytes (default: 0)
   * @param size - Size in bytes (default: entire buffer)
   *
   * @example
   * ```typescript
   * pass.setIndexBuffer(indexBuffer, IndexFormat.Uint16);
   * ```
   */
  abstract setIndexBuffer(
    buffer: GPUBuffer,
    format: IndexFormat,
    offset?: number,
    size?: number
  ): void;

  /**
   * Sets a bind group for resource binding.
   * @param index - Bind group index
   * @param bindGroup - Bind group to set
   * @param dynamicOffsets - Dynamic offsets for uniform buffers
   *
   * @example
   * ```typescript
   * pass.setBindGroup(0, uniformBindGroup);
   * pass.setBindGroup(1, textureBindGroup);
   * ```
   */
  abstract setBindGroup(
    index: number,
    bindGroup: any,
    dynamicOffsets?: number[]
  ): void;

  /**
   * Draws primitives.
   * @param vertexCount - Number of vertices to draw
   * @param instanceCount - Number of instances (default: 1)
   * @param firstVertex - First vertex index (default: 0)
   * @param firstInstance - First instance index (default: 0)
   *
   * @example
   * ```typescript
   * pass.draw(36); // Draw 36 vertices (12 triangles)
   * pass.draw(6, 100); // Draw 6 vertices, 100 instances
   * ```
   */
  abstract draw(
    vertexCount: number,
    instanceCount?: number,
    firstVertex?: number,
    firstInstance?: number
  ): void;

  /**
   * Draws indexed primitives.
   * @param indexCount - Number of indices to draw
   * @param instanceCount - Number of instances (default: 1)
   * @param firstIndex - First index (default: 0)
   * @param baseVertex - Base vertex offset (default: 0)
   * @param firstInstance - First instance index (default: 0)
   *
   * @example
   * ```typescript
   * pass.drawIndexed(36); // Draw 36 indices
   * pass.drawIndexed(24, 50, 0, 0, 0); // Draw 24 indices, 50 instances
   * ```
   */
  abstract drawIndexed(
    indexCount: number,
    instanceCount?: number,
    firstIndex?: number,
    baseVertex?: number,
    firstInstance?: number
  ): void;

  /**
   * Draws primitives using indirect parameters from a buffer.
   * @param indirectBuffer - Buffer containing draw parameters
   * @param indirectOffset - Offset in buffer
   *
   * @example
   * ```typescript
   * pass.drawIndirect(indirectBuffer, 0);
   * ```
   */
  abstract drawIndirect(indirectBuffer: GPUBuffer, indirectOffset: number): void;

  /**
   * Draws indexed primitives using indirect parameters.
   * @param indirectBuffer - Buffer containing draw parameters
   * @param indirectOffset - Offset in buffer
   *
   * @example
   * ```typescript
   * pass.drawIndexedIndirect(indirectBuffer, 0);
   * ```
   */
  abstract drawIndexedIndirect(
    indirectBuffer: GPUBuffer,
    indirectOffset: number
  ): void;

  /**
   * Sets the viewport.
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param width - Width
   * @param height - Height
   * @param minDepth - Minimum depth (default: 0)
   * @param maxDepth - Maximum depth (default: 1)
   *
   * @example
   * ```typescript
   * pass.setViewport(0, 0, 1920, 1080, 0, 1);
   * ```
   */
  abstract setViewport(
    x: number,
    y: number,
    width: number,
    height: number,
    minDepth?: number,
    maxDepth?: number
  ): void;

  /**
   * Sets the scissor rectangle.
   * @param x - X coordinate
   * @param y - Y coordinate
   * @param width - Width
   * @param height - Height
   *
   * @example
   * ```typescript
   * pass.setScissorRect(100, 100, 800, 600);
   * ```
   */
  abstract setScissorRect(
    x: number,
    y: number,
    width: number,
    height: number
  ): void;

  /**
   * Sets the blend constant color.
   * @param color - Blend color
   *
   * @example
   * ```typescript
   * pass.setBlendConstant(new Color(1, 0, 0, 0.5));
   * ```
   */
  abstract setBlendConstant(color: Color | [number, number, number, number]): void;

  /**
   * Sets the stencil reference value.
   * @param reference - Stencil reference value
   *
   * @example
   * ```typescript
   * pass.setStencilReference(1);
   * ```
   */
  abstract setStencilReference(reference: number): void;

  /**
   * Begins an occlusion query.
   * @param queryIndex - Query index
   */
  abstract beginOcclusionQuery(queryIndex: number): void;

  /**
   * Ends the current occlusion query.
   */
  abstract endOcclusionQuery(): void;

  /**
   * Executes a bundle of pre-recorded commands.
   * @param bundles - Command bundles to execute
   */
  abstract executeBundles(bundles: any[]): void;

  /**
   * Ends the render pass.
   *
   * @example
   * ```typescript
   * pass.end();
   * ```
   */
  end(): void {
    if (this.ended) {
      logger.warn('Render pass already ended');
      return;
    }

    this.endInternal();
    this.ended = true;
  }

  /**
   * Checks if the pass has ended.
   * @returns True if ended
   */
  isEnded(): boolean {
    return this.ended;
  }

  /**
   * Backend-specific end implementation.
   */
  protected abstract endInternal(): void;
}

/**
 * Abstract compute pass encoder.
 *
 * Records compute commands within a compute pass.
 */
export abstract class ComputePassEncoder {
  protected label?: string;
  protected ended = false;

  constructor(label?: string) {
    this.label = label;
  }

  /**
   * Sets the compute pipeline.
   * @param pipeline - Compute pipeline to use
   *
   * @example
   * ```typescript
   * pass.setPipeline(computePipeline);
   * ```
   */
  abstract setPipeline(pipeline: GPUPipeline): void;

  /**
   * Sets a bind group for resource binding.
   * @param index - Bind group index
   * @param bindGroup - Bind group to set
   * @param dynamicOffsets - Dynamic offsets
   *
   * @example
   * ```typescript
   * pass.setBindGroup(0, computeBindGroup);
   * ```
   */
  abstract setBindGroup(
    index: number,
    bindGroup: any,
    dynamicOffsets?: number[]
  ): void;

  /**
   * Dispatches compute work.
   * @param workgroupCountX - Number of workgroups in X
   * @param workgroupCountY - Number of workgroups in Y (default: 1)
   * @param workgroupCountZ - Number of workgroups in Z (default: 1)
   *
   * @example
   * ```typescript
   * pass.dispatch(256, 256, 1);
   * ```
   */
  abstract dispatch(
    workgroupCountX: number,
    workgroupCountY?: number,
    workgroupCountZ?: number
  ): void;

  /**
   * Dispatches compute work using indirect parameters.
   * @param indirectBuffer - Buffer containing dispatch parameters
   * @param indirectOffset - Offset in buffer
   *
   * @example
   * ```typescript
   * pass.dispatchIndirect(indirectBuffer, 0);
   * ```
   */
  abstract dispatchIndirect(
    indirectBuffer: GPUBuffer,
    indirectOffset: number
  ): void;

  /**
   * Ends the compute pass.
   *
   * @example
   * ```typescript
   * pass.end();
   * ```
   */
  end(): void {
    if (this.ended) {
      logger.warn('Compute pass already ended');
      return;
    }

    this.endInternal();
    this.ended = true;
  }

  /**
   * Checks if the pass has ended.
   * @returns True if ended
   */
  isEnded(): boolean {
    return this.ended;
  }

  /**
   * Backend-specific end implementation.
   */
  protected abstract endInternal(): void;
}

/**
 * Abstract command encoder.
 *
 * Records GPU commands for later submission.
 * Commands are recorded into a command buffer which is then submitted to the device queue.
 *
 * @example
 * ```typescript
 * const encoder = device.createCommandEncoder('FrameCommands');
 *
 * // Begin render pass
 * const pass = encoder.beginRenderPass({
 *   colorAttachments: [{
 *     view: textureView,
 *     loadOp: LoadOp.Clear,
 *     storeOp: StoreOp.Store,
 *     clearValue: new Color(0, 0, 0, 1),
 *   }],
 * });
 *
 * pass.setPipeline(pipeline);
 * pass.setVertexBuffer(0, vertexBuffer);
 * pass.draw(3);
 * pass.end();
 *
 * // Copy buffer
 * encoder.copyBufferToBuffer(srcBuffer, 0, dstBuffer, 0, 256);
 *
 * // Finish and submit
 * const commandBuffer = encoder.finish();
 * device.submit([commandBuffer]);
 * ```
 */
export abstract class GPUCommandEncoder {
  protected label?: string;
  protected finished = false;

  constructor(label?: string) {
    this.label = label;
  }

  /**
   * Begins a render pass.
   * @param descriptor - Render pass descriptor
   * @returns Render pass encoder
   *
   * @example
   * ```typescript
   * const pass = encoder.beginRenderPass({
   *   colorAttachments: [{
   *     view: colorView,
   *     loadOp: LoadOp.Clear,
   *     storeOp: StoreOp.Store,
   *     clearValue: [0, 0, 0, 1],
   *   }],
   *   depthStencilAttachment: {
   *     view: depthView,
   *     depthLoadOp: LoadOp.Clear,
   *     depthStoreOp: StoreOp.Store,
   *     depthClearValue: 1.0,
   *   },
   * });
   * ```
   */
  abstract beginRenderPass(descriptor: RenderPassDescriptor): RenderPassEncoder;

  /**
   * Begins a compute pass.
   * @param descriptor - Compute pass descriptor
   * @returns Compute pass encoder
   *
   * @example
   * ```typescript
   * const pass = encoder.beginComputePass({ label: 'ParticleUpdate' });
   * ```
   */
  abstract beginComputePass(
    descriptor?: ComputePassDescriptor
  ): ComputePassEncoder;

  /**
   * Copies data from one buffer to another.
   * @param source - Source buffer
   * @param sourceOffset - Source offset in bytes
   * @param destination - Destination buffer
   * @param destinationOffset - Destination offset in bytes
   * @param size - Number of bytes to copy
   *
   * @example
   * ```typescript
   * encoder.copyBufferToBuffer(srcBuffer, 0, dstBuffer, 256, 1024);
   * ```
   */
  abstract copyBufferToBuffer(
    source: GPUBuffer,
    sourceOffset: number,
    destination: GPUBuffer,
    destinationOffset: number,
    size: number
  ): void;

  /**
   * Copies data from a buffer to a texture.
   * @param source - Source buffer view
   * @param destination - Destination texture view
   * @param copySize - Copy dimensions
   *
   * @example
   * ```typescript
   * encoder.copyBufferToTexture(
   *   { buffer: pixelBuffer, bytesPerRow: 256 * 4 },
   *   { texture: myTexture },
   *   { width: 256, height: 256 }
   * );
   * ```
   */
  abstract copyBufferToTexture(
    source: BufferCopyView,
    destination: TextureCopyView,
    copySize: Extent3D
  ): void;

  /**
   * Copies data from a texture to a buffer.
   * @param source - Source texture view
   * @param destination - Destination buffer view
   * @param copySize - Copy dimensions
   *
   * @example
   * ```typescript
   * encoder.copyTextureToBuffer(
   *   { texture: renderTarget },
   *   { buffer: readbackBuffer, bytesPerRow: 1920 * 4 },
   *   { width: 1920, height: 1080 }
   * );
   * ```
   */
  abstract copyTextureToTexture(
    source: TextureCopyView,
    destination: BufferCopyView,
    copySize: Extent3D
  ): void;

  /**
   * Copies data from one texture to another.
   * @param source - Source texture view
   * @param destination - Destination texture view
   * @param copySize - Copy dimensions
   *
   * @example
   * ```typescript
   * encoder.copyTextureToTexture(
   *   { texture: srcTexture, mipLevel: 0 },
   *   { texture: dstTexture, mipLevel: 1 },
   *   { width: 512, height: 512 }
   * );
   * ```
   */
  abstract copyTextureToTexture2(
    source: TextureCopyView,
    destination: TextureCopyView,
    copySize: Extent3D
  ): void;

  /**
   * Clears a buffer to zero.
   * @param buffer - Buffer to clear
   * @param offset - Offset in bytes (default: 0)
   * @param size - Number of bytes to clear (default: entire buffer)
   *
   * @example
   * ```typescript
   * encoder.clearBuffer(buffer, 0, 1024);
   * ```
   */
  abstract clearBuffer(buffer: GPUBuffer, offset?: number, size?: number): void;

  /**
   * Writes a timestamp query.
   * @param querySet - Query set
   * @param queryIndex - Query index
   */
  abstract writeTimestamp(querySet: any, queryIndex: number): void;

  /**
   * Resolves query results to a buffer.
   * @param querySet - Query set
   * @param firstQuery - First query index
   * @param queryCount - Number of queries
   * @param destination - Destination buffer
   * @param destinationOffset - Destination offset
   */
  abstract resolveQuerySet(
    querySet: any,
    firstQuery: number,
    queryCount: number,
    destination: GPUBuffer,
    destinationOffset: number
  ): void;

  /**
   * Finishes command recording and returns a command buffer.
   * @returns Command buffer for submission
   *
   * @example
   * ```typescript
   * const commandBuffer = encoder.finish();
   * device.submit([commandBuffer]);
   * ```
   */
  finish(): any {
    if (this.finished) {
      throw new Error('Command encoder already finished');
    }

    this.finished = true;
    return this.finishInternal();
  }

  /**
   * Checks if the encoder has finished.
   * @returns True if finished
   */
  isFinished(): boolean {
    return this.finished;
  }

  /**
   * Backend-specific finish implementation.
   * @returns Command buffer
   */
  protected abstract finishInternal(): any;
}
