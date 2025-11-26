/**
 * Complete pipeline state object for G3D rendering engine.
 * Encapsulates all GPU state needed for rendering including blending, depth, stencil, and rasterization.
 * Uses state hashing for efficient caching and state change minimization.
 *
 * @module PipelineState
 */

import { Logger } from '../../core/Logger';

const logger = Logger.create('PipelineState');

/**
 * Blend factors for source and destination colors.
 * Maps to WebGL/WebGPU blend factors.
 */
export enum BlendFactor {
  Zero = 0,
  One = 1,
  SrcColor = 2,
  OneMinusSrcColor = 3,
  DstColor = 4,
  OneMinusDstColor = 5,
  SrcAlpha = 6,
  OneMinusSrcAlpha = 7,
  DstAlpha = 8,
  OneMinusDstAlpha = 9,
  ConstantColor = 10,
  OneMinusConstantColor = 11,
  ConstantAlpha = 12,
  OneMinusConstantAlpha = 13,
  SrcAlphaSaturate = 14,
}

/**
 * Blend operations for combining source and destination values.
 */
export enum BlendOperation {
  Add = 0,
  Subtract = 1,
  ReverseSubtract = 2,
  Min = 3,
  Max = 4,
}

/**
 * Comparison functions for depth and stencil testing.
 */
export enum CompareFunction {
  Never = 0,
  Less = 1,
  Equal = 2,
  LessEqual = 3,
  Greater = 4,
  NotEqual = 5,
  GreaterEqual = 6,
  Always = 7,
}

/**
 * Stencil operations that can be performed on stencil buffer.
 */
export enum StencilOperation {
  Keep = 0,
  Zero = 1,
  Replace = 2,
  IncrementClamp = 3,
  DecrementClamp = 4,
  Invert = 5,
  IncrementWrap = 6,
  DecrementWrap = 7,
}

/**
 * Culling mode for back-face culling.
 */
export enum CullMode {
  None = 0,
  Front = 1,
  Back = 2,
}

/**
 * Front face winding order.
 */
export enum FrontFace {
  CCW = 0, // Counter-clockwise
  CW = 1,  // Clockwise
}

/**
 * Polygon rendering mode.
 */
export enum PolygonMode {
  Fill = 0,
  Line = 1,
  Point = 2,
}

/**
 * Color write mask flags.
 */
export enum ColorWriteMask {
  None = 0,
  Red = 1 << 0,
  Green = 1 << 1,
  Blue = 1 << 2,
  Alpha = 1 << 3,
  All = Red | Green | Blue | Alpha,
}

/**
 * Blend state configuration for a single render target.
 * Controls how fragment colors are blended with framebuffer colors.
 *
 * @example
 * ```typescript
 * // Alpha blending
 * const alphaBlend: BlendState = {
 *   enabled: true,
 *   srcColorFactor: BlendFactor.SrcAlpha,
 *   dstColorFactor: BlendFactor.OneMinusSrcAlpha,
 *   colorOperation: BlendOperation.Add,
 *   srcAlphaFactor: BlendFactor.One,
 *   dstAlphaFactor: BlendFactor.OneMinusSrcAlpha,
 *   alphaOperation: BlendOperation.Add,
 *   writeMask: ColorWriteMask.All,
 * };
 *
 * // Additive blending
 * const additiveBlend: BlendState = {
 *   enabled: true,
 *   srcColorFactor: BlendFactor.One,
 *   dstColorFactor: BlendFactor.One,
 *   colorOperation: BlendOperation.Add,
 *   srcAlphaFactor: BlendFactor.One,
 *   dstAlphaFactor: BlendFactor.One,
 *   alphaOperation: BlendOperation.Add,
 *   writeMask: ColorWriteMask.All,
 * };
 * ```
 */
export interface BlendState {
  /** Whether blending is enabled */
  enabled: boolean;
  /** Source blend factor for color components */
  srcColorFactor: BlendFactor;
  /** Destination blend factor for color components */
  dstColorFactor: BlendFactor;
  /** Blend operation for color components */
  colorOperation: BlendOperation;
  /** Source blend factor for alpha component */
  srcAlphaFactor: BlendFactor;
  /** Destination blend factor for alpha component */
  dstAlphaFactor: BlendFactor;
  /** Blend operation for alpha component */
  alphaOperation: BlendOperation;
  /** Color channel write mask */
  writeMask: ColorWriteMask;
}

/**
 * Depth buffer state configuration.
 * Controls depth testing and writing for depth buffering.
 *
 * @example
 * ```typescript
 * // Standard depth test
 * const depthTest: DepthState = {
 *   testEnabled: true,
 *   writeEnabled: true,
 *   compareFunction: CompareFunction.Less,
 *   depthBias: 0,
 *   depthBiasSlope: 0,
 *   depthBiasClamp: 0,
 * };
 *
 * // Read-only depth test (for transparent objects)
 * const depthTestReadOnly: DepthState = {
 *   testEnabled: true,
 *   writeEnabled: false,
 *   compareFunction: CompareFunction.Less,
 * };
 * ```
 */
export interface DepthState {
  /** Whether depth testing is enabled */
  testEnabled: boolean;
  /** Whether depth writes are enabled */
  writeEnabled: boolean;
  /** Comparison function for depth test */
  compareFunction: CompareFunction;
  /** Constant depth bias (optional) */
  depthBias?: number;
  /** Slope-scaled depth bias (optional) */
  depthBiasSlope?: number;
  /** Maximum depth bias clamp (optional) */
  depthBiasClamp?: number;
}

/**
 * Stencil operation state for front or back faces.
 *
 * @example
 * ```typescript
 * const stencilOp: StencilOperationState = {
 *   failOp: StencilOperation.Keep,
 *   depthFailOp: StencilOperation.Keep,
 *   passOp: StencilOperation.Replace,
 *   compareFunction: CompareFunction.Always,
 * };
 * ```
 */
export interface StencilOperationState {
  /** Operation when stencil test fails */
  failOp: StencilOperation;
  /** Operation when stencil test passes but depth test fails */
  depthFailOp: StencilOperation;
  /** Operation when both stencil and depth tests pass */
  passOp: StencilOperation;
  /** Comparison function for stencil test */
  compareFunction: CompareFunction;
}

/**
 * Stencil buffer state configuration.
 * Supports separate front and back face operations for two-sided stenciling.
 *
 * @example
 * ```typescript
 * // Stencil masking
 * const stencilMask: StencilState = {
 *   enabled: true,
 *   readMask: 0xFF,
 *   writeMask: 0xFF,
 *   reference: 1,
 *   front: {
 *     failOp: StencilOperation.Keep,
 *     depthFailOp: StencilOperation.Keep,
 *     passOp: StencilOperation.Replace,
 *     compareFunction: CompareFunction.Always,
 *   },
 *   back: {
 *     failOp: StencilOperation.Keep,
 *     depthFailOp: StencilOperation.Keep,
 *     passOp: StencilOperation.Replace,
 *     compareFunction: CompareFunction.Always,
 *   },
 * };
 * ```
 */
export interface StencilState {
  /** Whether stencil testing is enabled */
  enabled: boolean;
  /** Mask for reading stencil values */
  readMask: number;
  /** Mask for writing stencil values */
  writeMask: number;
  /** Reference value for stencil operations */
  reference: number;
  /** Stencil operations for front faces */
  front: StencilOperationState;
  /** Stencil operations for back faces */
  back: StencilOperationState;
}

/**
 * Rasterizer state configuration.
 * Controls primitive rasterization including culling, polygon mode, and depth bias.
 *
 * @example
 * ```typescript
 * // Standard rasterizer state
 * const rasterizer: RasterizerState = {
 *   cullMode: CullMode.Back,
 *   frontFace: FrontFace.CCW,
 *   polygonMode: PolygonMode.Fill,
 *   depthClampEnabled: false,
 *   scissorTestEnabled: false,
 *   multisampleEnabled: true,
 *   antialiasedLineEnabled: false,
 *   lineWidth: 1.0,
 * };
 *
 * // Wireframe rendering
 * const wireframe: RasterizerState = {
 *   cullMode: CullMode.None,
 *   frontFace: FrontFace.CCW,
 *   polygonMode: PolygonMode.Line,
 *   lineWidth: 2.0,
 * };
 * ```
 */
export interface RasterizerState {
  /** Face culling mode */
  cullMode: CullMode;
  /** Front face winding order */
  frontFace: FrontFace;
  /** Polygon rendering mode */
  polygonMode: PolygonMode;
  /** Whether depth clamping is enabled (optional) */
  depthClampEnabled?: boolean;
  /** Whether scissor testing is enabled (optional) */
  scissorTestEnabled?: boolean;
  /** Whether multisampling is enabled (optional) */
  multisampleEnabled?: boolean;
  /** Whether line antialiasing is enabled (optional) */
  antialiasedLineEnabled?: boolean;
  /** Line width for line rendering (optional) */
  lineWidth?: number;
}

/**
 * Complete pipeline state descriptor.
 * Combines all rendering state into a single immutable object.
 * Used for state caching and batching state changes.
 *
 * @example
 * ```typescript
 * const opaqueState: PipelineStateDescriptor = {
 *   blend: PipelineState.defaultBlendState(),
 *   depth: {
 *     testEnabled: true,
 *     writeEnabled: true,
 *     compareFunction: CompareFunction.Less,
 *   },
 *   stencil: PipelineState.defaultStencilState(),
 *   rasterizer: {
 *     cullMode: CullMode.Back,
 *     frontFace: FrontFace.CCW,
 *     polygonMode: PolygonMode.Fill,
 *   },
 * };
 *
 * const state = new PipelineState(opaqueState);
 * ```
 */
export interface PipelineStateDescriptor {
  /** Blend state configuration */
  blend: BlendState;
  /** Depth state configuration */
  depth: DepthState;
  /** Stencil state configuration */
  stencil: StencilState;
  /** Rasterizer state configuration */
  rasterizer: RasterizerState;
}

/**
 * Pipeline state object with hash-based caching.
 * Immutable once created for efficient state comparison and caching.
 *
 * The hash is computed once on construction and used for fast state comparison.
 * This enables the render pipeline to quickly detect state changes and minimize
 * GPU state transitions.
 *
 * @example
 * ```typescript
 * // Create opaque rendering state
 * const opaqueDesc = {
 *   blend: PipelineState.defaultBlendState(),
 *   depth: {
 *     testEnabled: true,
 *     writeEnabled: true,
 *     compareFunction: CompareFunction.Less,
 *   },
 *   stencil: PipelineState.defaultStencilState(),
 *   rasterizer: PipelineState.defaultRasterizerState(),
 * };
 * const opaqueState = new PipelineState(opaqueDesc);
 *
 * // Create transparent rendering state
 * const transparentDesc = {
 *   ...opaqueDesc,
 *   blend: PipelineState.alphaBlendState(),
 *   depth: {
 *     testEnabled: true,
 *     writeEnabled: false,
 *     compareFunction: CompareFunction.Less,
 *   },
 * };
 * const transparentState = new PipelineState(transparentDesc);
 *
 * // Fast comparison using hash
 * if (opaqueState.hash !== transparentState.hash) {
 *   // States differ, apply new state
 * }
 * ```
 */
export class PipelineState {
  /** Immutable blend state */
  readonly blend: Readonly<BlendState>;
  /** Immutable depth state */
  readonly depth: Readonly<DepthState>;
  /** Immutable stencil state */
  readonly stencil: Readonly<StencilState>;
  /** Immutable rasterizer state */
  readonly rasterizer: Readonly<RasterizerState>;
  /** Pre-computed hash for fast comparison */
  readonly hash: number;

  /**
   * Creates a new pipeline state object.
   * Computes hash on construction for efficient state comparison.
   *
   * @param descriptor - Complete pipeline state descriptor
   */
  constructor(descriptor: PipelineStateDescriptor) {
    // Deep freeze to ensure immutability
    this.blend = Object.freeze({ ...descriptor.blend });
    this.depth = Object.freeze({ ...descriptor.depth });
    this.stencil = Object.freeze({
      ...descriptor.stencil,
      front: Object.freeze({ ...descriptor.stencil.front }),
      back: Object.freeze({ ...descriptor.stencil.back }),
    });
    this.rasterizer = Object.freeze({ ...descriptor.rasterizer });

    // Compute hash once
    this.hash = this.computeHash();
  }

  /**
   * Computes a 32-bit hash of the pipeline state.
   * Uses FNV-1a hashing algorithm for fast, collision-resistant hashing.
   *
   * @returns 32-bit hash value
   */
  private computeHash(): number {
    let hash = 2166136261; // FNV offset basis

    // Helper to hash a number
    const hashNumber = (value: number): void => {
      hash ^= value & 0xFF;
      hash = Math.imul(hash, 16777619);
      hash ^= (value >>> 8) & 0xFF;
      hash = Math.imul(hash, 16777619);
      hash ^= (value >>> 16) & 0xFF;
      hash = Math.imul(hash, 16777619);
      hash ^= (value >>> 24) & 0xFF;
      hash = Math.imul(hash, 16777619);
    };

    // Hash blend state
    hashNumber(this.blend.enabled ? 1 : 0);
    hashNumber(this.blend.srcColorFactor);
    hashNumber(this.blend.dstColorFactor);
    hashNumber(this.blend.colorOperation);
    hashNumber(this.blend.srcAlphaFactor);
    hashNumber(this.blend.dstAlphaFactor);
    hashNumber(this.blend.alphaOperation);
    hashNumber(this.blend.writeMask);

    // Hash depth state
    hashNumber(this.depth.testEnabled ? 1 : 0);
    hashNumber(this.depth.writeEnabled ? 1 : 0);
    hashNumber(this.depth.compareFunction);
    if (this.depth.depthBias !== undefined) {
      hashNumber(this.depth.depthBias);
    }
    if (this.depth.depthBiasSlope !== undefined) {
      hashNumber(this.depth.depthBiasSlope);
    }

    // Hash stencil state
    hashNumber(this.stencil.enabled ? 1 : 0);
    hashNumber(this.stencil.readMask);
    hashNumber(this.stencil.writeMask);
    hashNumber(this.stencil.reference);
    hashNumber(this.stencil.front.failOp);
    hashNumber(this.stencil.front.depthFailOp);
    hashNumber(this.stencil.front.passOp);
    hashNumber(this.stencil.front.compareFunction);
    hashNumber(this.stencil.back.failOp);
    hashNumber(this.stencil.back.depthFailOp);
    hashNumber(this.stencil.back.passOp);
    hashNumber(this.stencil.back.compareFunction);

    // Hash rasterizer state
    hashNumber(this.rasterizer.cullMode);
    hashNumber(this.rasterizer.frontFace);
    hashNumber(this.rasterizer.polygonMode);
    if (this.rasterizer.depthClampEnabled !== undefined) {
      hashNumber(this.rasterizer.depthClampEnabled ? 1 : 0);
    }
    if (this.rasterizer.scissorTestEnabled !== undefined) {
      hashNumber(this.rasterizer.scissorTestEnabled ? 1 : 0);
    }
    if (this.rasterizer.multisampleEnabled !== undefined) {
      hashNumber(this.rasterizer.multisampleEnabled ? 1 : 0);
    }
    if (this.rasterizer.lineWidth !== undefined) {
      hashNumber(Math.floor(this.rasterizer.lineWidth * 1000));
    }

    return hash >>> 0; // Convert to unsigned 32-bit
  }

  /**
   * Checks if this state equals another state.
   * Uses hash comparison first for fast rejection.
   *
   * @param other - State to compare with
   * @returns True if states are equal
   */
  equals(other: PipelineState): boolean {
    // Fast path: compare hashes
    if (this.hash !== other.hash) {
      return false;
    }

    // Hash collision check: deep comparison
    return (
      this.compareBlendState(other.blend) &&
      this.compareDepthState(other.depth) &&
      this.compareStencilState(other.stencil) &&
      this.compareRasterizerState(other.rasterizer)
    );
  }

  /**
   * Compares blend states for equality.
   */
  private compareBlendState(other: BlendState): boolean {
    return (
      this.blend.enabled === other.enabled &&
      this.blend.srcColorFactor === other.srcColorFactor &&
      this.blend.dstColorFactor === other.dstColorFactor &&
      this.blend.colorOperation === other.colorOperation &&
      this.blend.srcAlphaFactor === other.srcAlphaFactor &&
      this.blend.dstAlphaFactor === other.dstAlphaFactor &&
      this.blend.alphaOperation === other.alphaOperation &&
      this.blend.writeMask === other.writeMask
    );
  }

  /**
   * Compares depth states for equality.
   */
  private compareDepthState(other: DepthState): boolean {
    return (
      this.depth.testEnabled === other.testEnabled &&
      this.depth.writeEnabled === other.writeEnabled &&
      this.depth.compareFunction === other.compareFunction &&
      (this.depth.depthBias ?? 0) === (other.depthBias ?? 0) &&
      (this.depth.depthBiasSlope ?? 0) === (other.depthBiasSlope ?? 0) &&
      (this.depth.depthBiasClamp ?? 0) === (other.depthBiasClamp ?? 0)
    );
  }

  /**
   * Compares stencil states for equality.
   */
  private compareStencilState(other: StencilState): boolean {
    return (
      this.stencil.enabled === other.enabled &&
      this.stencil.readMask === other.readMask &&
      this.stencil.writeMask === other.writeMask &&
      this.stencil.reference === other.reference &&
      this.compareStencilOp(this.stencil.front, other.front) &&
      this.compareStencilOp(this.stencil.back, other.back)
    );
  }

  /**
   * Compares stencil operation states for equality.
   */
  private compareStencilOp(a: StencilOperationState, b: StencilOperationState): boolean {
    return (
      a.failOp === b.failOp &&
      a.depthFailOp === b.depthFailOp &&
      a.passOp === b.passOp &&
      a.compareFunction === b.compareFunction
    );
  }

  /**
   * Compares rasterizer states for equality.
   */
  private compareRasterizerState(other: RasterizerState): boolean {
    return (
      this.rasterizer.cullMode === other.cullMode &&
      this.rasterizer.frontFace === other.frontFace &&
      this.rasterizer.polygonMode === other.polygonMode &&
      (this.rasterizer.depthClampEnabled ?? false) === (other.depthClampEnabled ?? false) &&
      (this.rasterizer.scissorTestEnabled ?? false) === (other.scissorTestEnabled ?? false) &&
      (this.rasterizer.multisampleEnabled ?? true) === (other.multisampleEnabled ?? true) &&
      (this.rasterizer.antialiasedLineEnabled ?? false) === (other.antialiasedLineEnabled ?? false) &&
      (this.rasterizer.lineWidth ?? 1.0) === (other.lineWidth ?? 1.0)
    );
  }

  /**
   * Creates default blend state (disabled, no blending).
   */
  static defaultBlendState(): BlendState {
    return {
      enabled: false,
      srcColorFactor: BlendFactor.One,
      dstColorFactor: BlendFactor.Zero,
      colorOperation: BlendOperation.Add,
      srcAlphaFactor: BlendFactor.One,
      dstAlphaFactor: BlendFactor.Zero,
      alphaOperation: BlendOperation.Add,
      writeMask: ColorWriteMask.All,
    };
  }

  /**
   * Creates alpha blend state for standard transparency.
   * Formula: src.rgb * src.a + dst.rgb * (1 - src.a)
   */
  static alphaBlendState(): BlendState {
    return {
      enabled: true,
      srcColorFactor: BlendFactor.SrcAlpha,
      dstColorFactor: BlendFactor.OneMinusSrcAlpha,
      colorOperation: BlendOperation.Add,
      srcAlphaFactor: BlendFactor.One,
      dstAlphaFactor: BlendFactor.OneMinusSrcAlpha,
      alphaOperation: BlendOperation.Add,
      writeMask: ColorWriteMask.All,
    };
  }

  /**
   * Creates additive blend state for effects like particles and lights.
   * Formula: src.rgb + dst.rgb
   */
  static additiveBlendState(): BlendState {
    return {
      enabled: true,
      srcColorFactor: BlendFactor.One,
      dstColorFactor: BlendFactor.One,
      colorOperation: BlendOperation.Add,
      srcAlphaFactor: BlendFactor.One,
      dstAlphaFactor: BlendFactor.One,
      alphaOperation: BlendOperation.Add,
      writeMask: ColorWriteMask.All,
    };
  }

  /**
   * Creates premultiplied alpha blend state.
   * Formula: src.rgb + dst.rgb * (1 - src.a)
   */
  static premultipliedAlphaBlendState(): BlendState {
    return {
      enabled: true,
      srcColorFactor: BlendFactor.One,
      dstColorFactor: BlendFactor.OneMinusSrcAlpha,
      colorOperation: BlendOperation.Add,
      srcAlphaFactor: BlendFactor.One,
      dstAlphaFactor: BlendFactor.OneMinusSrcAlpha,
      alphaOperation: BlendOperation.Add,
      writeMask: ColorWriteMask.All,
    };
  }

  /**
   * Creates default depth state (enabled, less-than comparison).
   */
  static defaultDepthState(): DepthState {
    return {
      testEnabled: true,
      writeEnabled: true,
      compareFunction: CompareFunction.Less,
      depthBias: 0,
      depthBiasSlope: 0,
      depthBiasClamp: 0,
    };
  }

  /**
   * Creates read-only depth state (test enabled, writes disabled).
   * Useful for transparent objects that shouldn't write to depth buffer.
   */
  static depthReadOnlyState(): DepthState {
    return {
      testEnabled: true,
      writeEnabled: false,
      compareFunction: CompareFunction.Less,
    };
  }

  /**
   * Creates disabled depth state (no testing or writing).
   */
  static depthDisabledState(): DepthState {
    return {
      testEnabled: false,
      writeEnabled: false,
      compareFunction: CompareFunction.Always,
    };
  }

  /**
   * Creates default stencil state (disabled).
   */
  static defaultStencilState(): StencilState {
    const defaultOp: StencilOperationState = {
      failOp: StencilOperation.Keep,
      depthFailOp: StencilOperation.Keep,
      passOp: StencilOperation.Keep,
      compareFunction: CompareFunction.Always,
    };

    return {
      enabled: false,
      readMask: 0xFF,
      writeMask: 0xFF,
      reference: 0,
      front: defaultOp,
      back: defaultOp,
    };
  }

  /**
   * Creates default rasterizer state (back-face culling, CCW front face).
   */
  static defaultRasterizerState(): RasterizerState {
    return {
      cullMode: CullMode.Back,
      frontFace: FrontFace.CCW,
      polygonMode: PolygonMode.Fill,
      depthClampEnabled: false,
      scissorTestEnabled: false,
      multisampleEnabled: true,
      antialiasedLineEnabled: false,
      lineWidth: 1.0,
    };
  }

  /**
   * Creates wireframe rasterizer state (no culling, line mode).
   */
  static wireframeRasterizerState(lineWidth: number = 1.0): RasterizerState {
    return {
      cullMode: CullMode.None,
      frontFace: FrontFace.CCW,
      polygonMode: PolygonMode.Line,
      depthClampEnabled: false,
      scissorTestEnabled: false,
      multisampleEnabled: true,
      antialiasedLineEnabled: true,
      lineWidth,
    };
  }

  /**
   * Creates default opaque pipeline state.
   * Standard state for solid objects with depth testing and back-face culling.
   */
  static opaque(): PipelineState {
    return new PipelineState({
      blend: PipelineState.defaultBlendState(),
      depth: PipelineState.defaultDepthState(),
      stencil: PipelineState.defaultStencilState(),
      rasterizer: PipelineState.defaultRasterizerState(),
    });
  }

  /**
   * Creates default transparent pipeline state.
   * Alpha blending with depth testing but no depth writes.
   */
  static transparent(): PipelineState {
    return new PipelineState({
      blend: PipelineState.alphaBlendState(),
      depth: PipelineState.depthReadOnlyState(),
      stencil: PipelineState.defaultStencilState(),
      rasterizer: PipelineState.defaultRasterizerState(),
    });
  }

  /**
   * Creates additive blending pipeline state.
   * Useful for particle effects and lights.
   */
  static additive(): PipelineState {
    return new PipelineState({
      blend: PipelineState.additiveBlendState(),
      depth: PipelineState.depthReadOnlyState(),
      stencil: PipelineState.defaultStencilState(),
      rasterizer: PipelineState.defaultRasterizerState(),
    });
  }
}
