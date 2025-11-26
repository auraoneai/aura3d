/**
 * @module Rendering/GPU
 * @description
 * GPU pipeline abstraction for graphics and compute pipelines.
 */

import { Logger } from '../../core/Logger';
import {
  ShaderModule,
  PrimitiveTopology,
  CullMode,
  FrontFace,
  CompareFunction,
  BlendFactor,
  BlendOperation,
  ColorWriteMask,
  StencilOperation,
  VertexFormat,
  TextureFormat,
} from './GPUDevice';

const logger = Logger.create('GPUPipeline');

/**
 * Vertex step mode for vertex buffers.
 */
export enum VertexStepMode {
  /** Advance per vertex */
  Vertex = 'vertex',
  /** Advance per instance */
  Instance = 'instance',
}

/**
 * Vertex attribute descriptor.
 */
export interface VertexAttribute {
  /** Format of the attribute */
  format: VertexFormat;
  /** Offset in bytes from the beginning of the vertex */
  offset: number;
  /** Shader location (matches @location in shader) */
  shaderLocation: number;
}

/**
 * Vertex buffer layout descriptor.
 */
export interface VertexBufferLayout {
  /** Stride in bytes between vertices/instances */
  arrayStride: number;
  /** Step mode (per vertex or per instance) */
  stepMode?: VertexStepMode;
  /** Attribute descriptors */
  attributes: VertexAttribute[];
}

/**
 * Vertex state descriptor.
 */
export interface VertexState {
  /** Vertex shader module */
  module: ShaderModule;
  /** Entry point function name */
  entryPoint: string;
  /** Vertex buffer layouts */
  buffers?: VertexBufferLayout[];
}

/**
 * Primitive state descriptor.
 */
export interface PrimitiveState {
  /** Primitive topology */
  topology?: PrimitiveTopology;
  /** Index format for strip topologies */
  stripIndexFormat?: 'uint16' | 'uint32';
  /** Front face winding order */
  frontFace?: FrontFace;
  /** Face culling mode */
  cullMode?: CullMode;
  /** Enable depth clipping (default: true) */
  depthClip?: boolean;
}

/**
 * Stencil face state.
 */
export interface StencilFaceState {
  /** Comparison function */
  compare?: CompareFunction;
  /** Operation on stencil test fail */
  failOp?: StencilOperation;
  /** Operation on depth test fail */
  depthFailOp?: StencilOperation;
  /** Operation on pass */
  passOp?: StencilOperation;
}

/**
 * Depth/stencil state descriptor.
 */
export interface DepthStencilState {
  /** Depth/stencil format */
  format: TextureFormat;
  /** Enable depth writes */
  depthWriteEnabled?: boolean;
  /** Depth comparison function */
  depthCompare?: CompareFunction;
  /** Stencil front face state */
  stencilFront?: StencilFaceState;
  /** Stencil back face state */
  stencilBack?: StencilFaceState;
  /** Stencil read mask */
  stencilReadMask?: number;
  /** Stencil write mask */
  stencilWriteMask?: number;
  /** Depth bias constant factor */
  depthBias?: number;
  /** Depth bias slope scale */
  depthBiasSlopeScale?: number;
  /** Depth bias clamp */
  depthBiasClamp?: number;
}

/**
 * Blend component descriptor.
 */
export interface BlendComponent {
  /** Source blend factor */
  srcFactor?: BlendFactor;
  /** Destination blend factor */
  dstFactor?: BlendFactor;
  /** Blend operation */
  operation?: BlendOperation;
}

/**
 * Blend state descriptor.
 */
export interface BlendState {
  /** Color blend component */
  color: BlendComponent;
  /** Alpha blend component */
  alpha: BlendComponent;
}

/**
 * Color target state descriptor.
 */
export interface ColorTargetState {
  /** Target format */
  format: TextureFormat;
  /** Blend state (undefined = no blending) */
  blend?: BlendState;
  /** Color write mask */
  writeMask?: ColorWriteMask;
}

/**
 * Fragment state descriptor.
 */
export interface FragmentState {
  /** Fragment shader module */
  module: ShaderModule;
  /** Entry point function name */
  entryPoint: string;
  /** Color target states */
  targets: ColorTargetState[];
}

/**
 * Multisample state descriptor.
 */
export interface MultisampleState {
  /** Sample count (1 or 4) */
  count?: number;
  /** Sample mask (0xFFFFFFFF = all samples) */
  mask?: number;
  /** Enable alpha to coverage */
  alphaToCoverageEnabled?: boolean;
}

/**
 * Graphics pipeline descriptor.
 */
export interface RenderPipelineDescriptor {
  /** Vertex state */
  vertex: VertexState;
  /** Fragment state */
  fragment?: FragmentState;
  /** Primitive state */
  primitive?: PrimitiveState;
  /** Depth/stencil state */
  depthStencil?: DepthStencilState;
  /** Multisample state */
  multisample?: MultisampleState;
  /** Debug label */
  label?: string;
}

/**
 * Compute pipeline descriptor.
 */
export interface ComputePipelineDescriptor {
  /** Compute shader module */
  compute: {
    module: ShaderModule;
    entryPoint: string;
  };
  /** Debug label */
  label?: string;
}

/**
 * Pipeline type enumeration.
 */
export enum PipelineType {
  /** Graphics/render pipeline */
  Render = 'render',
  /** Compute pipeline */
  Compute = 'compute',
}

/**
 * Abstract GPU pipeline interface.
 *
 * Represents a compiled graphics or compute pipeline with all state baked in.
 * Pipelines are immutable after creation for optimal performance.
 *
 * @example
 * ```typescript
 * // Create graphics pipeline
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
 *       blend: {
 *         color: {
 *           srcFactor: BlendFactor.SrcAlpha,
 *           dstFactor: BlendFactor.OneMinusSrcAlpha,
 *           operation: BlendOperation.Add,
 *         },
 *         alpha: {
 *           srcFactor: BlendFactor.One,
 *           dstFactor: BlendFactor.OneMinusSrcAlpha,
 *           operation: BlendOperation.Add,
 *         },
 *       },
 *     }],
 *   },
 *   primitive: {
 *     topology: PrimitiveTopology.TriangleList,
 *     cullMode: CullMode.Back,
 *     frontFace: FrontFace.CCW,
 *   },
 *   depthStencil: {
 *     format: TextureFormat.Depth24Plus,
 *     depthWriteEnabled: true,
 *     depthCompare: CompareFunction.Less,
 *   },
 *   label: 'MainPipeline',
 * });
 *
 * // Create compute pipeline
 * const computePipeline = device.createComputePipeline({
 *   compute: {
 *     module: computeShader,
 *     entryPoint: 'main',
 *   },
 *   label: 'ParticleUpdate',
 * });
 * ```
 */
export abstract class GPUPipeline {
  /** Unique pipeline identifier */
  readonly id: number;
  /** Pipeline type */
  readonly type: PipelineType;
  /** Debug label */
  readonly label?: string;

  protected disposed = false;

  /**
   * Creates a GPU pipeline.
   * @param id - Unique identifier
   * @param type - Pipeline type
   * @param label - Debug label
   */
  constructor(id: number, type: PipelineType, label?: string) {
    this.id = id;
    this.type = type;
    this.label = label;
  }

  /**
   * Checks if this is a render pipeline.
   * @returns True if render pipeline
   */
  isRenderPipeline(): boolean {
    return this.type === PipelineType.Render;
  }

  /**
   * Checks if this is a compute pipeline.
   * @returns True if compute pipeline
   */
  isComputePipeline(): boolean {
    return this.type === PipelineType.Compute;
  }

  /**
   * Checks if the pipeline has been disposed.
   * @returns True if disposed
   */
  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Disposes of the pipeline and frees GPU resources.
   */
  dispose(): void {
    if (this.disposed) {
      logger.warn(`Pipeline ${this.label ?? this.id} already disposed`);
      return;
    }

    this.disposeInternal();
    this.disposed = true;

    logger.debug(`Pipeline disposed: ${this.label ?? this.id}`);
  }

  /**
   * Backend-specific dispose implementation.
   */
  protected abstract disposeInternal(): void;
}

/**
 * Common blend state presets.
 */
export class BlendPresets {
  /**
   * No blending (opaque rendering).
   */
  static readonly OPAQUE: BlendState | undefined = undefined;

  /**
   * Alpha blending (standard transparency).
   * color = src.rgb * src.a + dst.rgb * (1 - src.a)
   * alpha = src.a + dst.a * (1 - src.a)
   */
  static readonly ALPHA_BLEND: BlendState = {
    color: {
      srcFactor: BlendFactor.SrcAlpha,
      dstFactor: BlendFactor.OneMinusSrcAlpha,
      operation: BlendOperation.Add,
    },
    alpha: {
      srcFactor: BlendFactor.One,
      dstFactor: BlendFactor.OneMinusSrcAlpha,
      operation: BlendOperation.Add,
    },
  };

  /**
   * Premultiplied alpha blending.
   * color = src.rgb + dst.rgb * (1 - src.a)
   * alpha = src.a + dst.a * (1 - src.a)
   */
  static readonly PREMULTIPLIED_ALPHA: BlendState = {
    color: {
      srcFactor: BlendFactor.One,
      dstFactor: BlendFactor.OneMinusSrcAlpha,
      operation: BlendOperation.Add,
    },
    alpha: {
      srcFactor: BlendFactor.One,
      dstFactor: BlendFactor.OneMinusSrcAlpha,
      operation: BlendOperation.Add,
    },
  };

  /**
   * Additive blending (for effects like fire, light).
   * color = src.rgb + dst.rgb
   * alpha = src.a + dst.a
   */
  static readonly ADDITIVE: BlendState = {
    color: {
      srcFactor: BlendFactor.One,
      dstFactor: BlendFactor.One,
      operation: BlendOperation.Add,
    },
    alpha: {
      srcFactor: BlendFactor.One,
      dstFactor: BlendFactor.One,
      operation: BlendOperation.Add,
    },
  };

  /**
   * Multiplicative blending.
   * color = src.rgb * dst.rgb
   * alpha = src.a * dst.a
   */
  static readonly MULTIPLY: BlendState = {
    color: {
      srcFactor: BlendFactor.Dst,
      dstFactor: BlendFactor.Zero,
      operation: BlendOperation.Add,
    },
    alpha: {
      srcFactor: BlendFactor.Dst,
      dstFactor: BlendFactor.Zero,
      operation: BlendOperation.Add,
    },
  };

  /**
   * Subtractive blending.
   * color = dst.rgb - src.rgb
   * alpha = dst.a - src.a
   */
  static readonly SUBTRACT: BlendState = {
    color: {
      srcFactor: BlendFactor.One,
      dstFactor: BlendFactor.One,
      operation: BlendOperation.ReverseSubtract,
    },
    alpha: {
      srcFactor: BlendFactor.One,
      dstFactor: BlendFactor.One,
      operation: BlendOperation.ReverseSubtract,
    },
  };
}

/**
 * Helper for building vertex buffer layouts.
 *
 * @example
 * ```typescript
 * const layout = new VertexLayoutBuilder()
 *   .addAttribute(VertexFormat.Float32x3, 0) // position
 *   .addAttribute(VertexFormat.Float32x3, 1) // normal
 *   .addAttribute(VertexFormat.Float32x2, 2) // uv
 *   .build();
 * ```
 */
export class VertexLayoutBuilder {
  private attributes: VertexAttribute[] = [];
  private currentOffset = 0;

  /**
   * Adds a vertex attribute.
   * @param format - Attribute format
   * @param shaderLocation - Shader location index
   * @returns This builder for chaining
   */
  addAttribute(format: VertexFormat, shaderLocation: number): this {
    const size = getVertexFormatSize(format);

    this.attributes.push({
      format,
      offset: this.currentOffset,
      shaderLocation,
    });

    this.currentOffset += size;
    return this;
  }

  /**
   * Adds padding bytes.
   * @param bytes - Number of padding bytes
   * @returns This builder for chaining
   */
  addPadding(bytes: number): this {
    this.currentOffset += bytes;
    return this;
  }

  /**
   * Builds the vertex buffer layout.
   * @param stepMode - Step mode (default: Vertex)
   * @returns Vertex buffer layout
   */
  build(stepMode: VertexStepMode = VertexStepMode.Vertex): VertexBufferLayout {
    return {
      arrayStride: this.currentOffset,
      stepMode,
      attributes: this.attributes,
    };
  }

  /**
   * Gets the current stride.
   * @returns Stride in bytes
   */
  getStride(): number {
    return this.currentOffset;
  }

  /**
   * Resets the builder.
   */
  reset(): void {
    this.attributes = [];
    this.currentOffset = 0;
  }
}

/**
 * Gets the byte size of a vertex format.
 * @param format - Vertex format
 * @returns Size in bytes
 */
export function getVertexFormatSize(format: VertexFormat): number {
  switch (format) {
    case VertexFormat.Uint8x2:
    case VertexFormat.Sint8x2:
    case VertexFormat.Unorm8x2:
    case VertexFormat.Snorm8x2:
      return 2;

    case VertexFormat.Uint8x4:
    case VertexFormat.Sint8x4:
    case VertexFormat.Unorm8x4:
    case VertexFormat.Snorm8x4:
    case VertexFormat.Uint16x2:
    case VertexFormat.Sint16x2:
    case VertexFormat.Unorm16x2:
    case VertexFormat.Snorm16x2:
    case VertexFormat.Float16x2:
    case VertexFormat.Float32:
    case VertexFormat.Uint32:
    case VertexFormat.Sint32:
      return 4;

    case VertexFormat.Uint16x4:
    case VertexFormat.Sint16x4:
    case VertexFormat.Unorm16x4:
    case VertexFormat.Snorm16x4:
    case VertexFormat.Float16x4:
    case VertexFormat.Float32x2:
    case VertexFormat.Uint32x2:
    case VertexFormat.Sint32x2:
      return 8;

    case VertexFormat.Float32x3:
    case VertexFormat.Uint32x3:
    case VertexFormat.Sint32x3:
      return 12;

    case VertexFormat.Float32x4:
    case VertexFormat.Uint32x4:
    case VertexFormat.Sint32x4:
      return 16;

    default:
      return 4;
  }
}

/**
 * Creates a default stencil face state.
 * @returns Default stencil face state
 */
export function createDefaultStencilFaceState(): StencilFaceState {
  return {
    compare: CompareFunction.Always,
    failOp: StencilOperation.Keep,
    depthFailOp: StencilOperation.Keep,
    passOp: StencilOperation.Keep,
  };
}
