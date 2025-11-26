/**
 * @module Rendering/GPU
 * @description
 * GPU sampler abstraction for texture sampling configuration.
 */

import { Logger } from '../../core/Logger';
import { CompareFunction } from './GPUDevice';

const logger = Logger.create('GPUSampler');

/**
 * Filter mode for texture sampling.
 */
export enum FilterMode {
  /** Nearest neighbor filtering (no interpolation) */
  Nearest = 'nearest',
  /** Linear/bilinear filtering */
  Linear = 'linear',
}

/**
 * Address mode for texture coordinate wrapping.
 */
export enum AddressMode {
  /** Clamp to edge texels */
  ClampToEdge = 'clamp-to-edge',
  /** Repeat texture coordinates */
  Repeat = 'repeat',
  /** Mirror repeat texture coordinates */
  MirrorRepeat = 'mirror-repeat',
}

/**
 * GPU sampler descriptor.
 */
export interface GPUSamplerDescriptor {
  /** Magnification filter */
  magFilter?: FilterMode;
  /** Minification filter */
  minFilter?: FilterMode;
  /** Mipmap filter */
  mipmapFilter?: FilterMode;
  /** Address mode for U coordinate */
  addressModeU?: AddressMode;
  /** Address mode for V coordinate */
  addressModeV?: AddressMode;
  /** Address mode for W coordinate */
  addressModeW?: AddressMode;
  /** Minimum LOD clamp */
  lodMinClamp?: number;
  /** Maximum LOD clamp */
  lodMaxClamp?: number;
  /** Comparison function for shadow sampling */
  compare?: CompareFunction;
  /** Maximum anisotropy level (1-16) */
  maxAnisotropy?: number;
  /** Debug label */
  label?: string;
}

/**
 * Abstract GPU sampler interface.
 *
 * Provides texture sampling configuration including:
 * - Filter modes (nearest, linear, anisotropic)
 * - Address modes (repeat, clamp, mirror)
 * - LOD bias and clamping
 * - Comparison functions for shadow mapping
 *
 * @example
 * ```typescript
 * // Create linear sampler with repeat wrapping
 * const sampler = device.createSampler({
 *   magFilter: FilterMode.Linear,
 *   minFilter: FilterMode.Linear,
 *   mipmapFilter: FilterMode.Linear,
 *   addressModeU: AddressMode.Repeat,
 *   addressModeV: AddressMode.Repeat,
 *   label: 'LinearRepeat',
 * });
 *
 * // Create shadow sampler
 * const shadowSampler = device.createSampler({
 *   magFilter: FilterMode.Linear,
 *   minFilter: FilterMode.Linear,
 *   compare: CompareFunction.Less,
 *   label: 'ShadowSampler',
 * });
 *
 * // Create anisotropic sampler
 * const anisoSampler = device.createSampler({
 *   magFilter: FilterMode.Linear,
 *   minFilter: FilterMode.Linear,
 *   mipmapFilter: FilterMode.Linear,
 *   maxAnisotropy: 16,
 *   label: 'Anisotropic',
 * });
 * ```
 */
export abstract class GPUSampler {
  /** Unique sampler identifier */
  readonly id: number;
  /** Magnification filter */
  readonly magFilter: FilterMode;
  /** Minification filter */
  readonly minFilter: FilterMode;
  /** Mipmap filter */
  readonly mipmapFilter: FilterMode;
  /** Address mode U */
  readonly addressModeU: AddressMode;
  /** Address mode V */
  readonly addressModeV: AddressMode;
  /** Address mode W */
  readonly addressModeW: AddressMode;
  /** Minimum LOD clamp */
  readonly lodMinClamp: number;
  /** Maximum LOD clamp */
  readonly lodMaxClamp: number;
  /** Comparison function */
  readonly compare?: CompareFunction;
  /** Maximum anisotropy */
  readonly maxAnisotropy: number;
  /** Debug label */
  readonly label?: string;

  protected disposed = false;

  /**
   * Creates a GPU sampler.
   * @param id - Unique identifier
   * @param descriptor - Sampler descriptor
   */
  constructor(id: number, descriptor: GPUSamplerDescriptor) {
    this.id = id;
    this.magFilter = descriptor.magFilter ?? FilterMode.Nearest;
    this.minFilter = descriptor.minFilter ?? FilterMode.Nearest;
    this.mipmapFilter = descriptor.mipmapFilter ?? FilterMode.Nearest;
    this.addressModeU = descriptor.addressModeU ?? AddressMode.ClampToEdge;
    this.addressModeV = descriptor.addressModeV ?? AddressMode.ClampToEdge;
    this.addressModeW = descriptor.addressModeW ?? AddressMode.ClampToEdge;
    this.lodMinClamp = descriptor.lodMinClamp ?? 0;
    this.lodMaxClamp = descriptor.lodMaxClamp ?? 32;
    this.compare = descriptor.compare;
    this.maxAnisotropy = descriptor.maxAnisotropy ?? 1;
    this.label = descriptor.label;

    // Validate anisotropy
    if (this.maxAnisotropy < 1 || this.maxAnisotropy > 16) {
      throw new Error('maxAnisotropy must be between 1 and 16');
    }

    // Validate LOD range
    if (this.lodMinClamp > this.lodMaxClamp) {
      throw new Error('lodMinClamp must be less than or equal to lodMaxClamp');
    }
  }

  /**
   * Checks if this is a comparison sampler (for shadow mapping).
   * @returns True if comparison sampler
   */
  isComparisonSampler(): boolean {
    return this.compare !== undefined;
  }

  /**
   * Checks if anisotropic filtering is enabled.
   * @returns True if anisotropic
   */
  isAnisotropic(): boolean {
    return this.maxAnisotropy > 1;
  }

  /**
   * Checks if the sampler has been disposed.
   * @returns True if disposed
   */
  isDisposed(): boolean {
    return this.disposed;
  }

  /**
   * Disposes of the sampler and frees GPU resources.
   */
  dispose(): void {
    if (this.disposed) {
      logger.warn(`Sampler ${this.label ?? this.id} already disposed`);
      return;
    }

    this.disposeInternal();
    this.disposed = true;

    logger.debug(`Sampler disposed: ${this.label ?? this.id}`);
  }

  /**
   * Backend-specific dispose implementation.
   */
  protected abstract disposeInternal(): void;
}

/**
 * Common sampler presets for convenience.
 */
export class SamplerPresets {
  /**
   * Nearest neighbor filtering with clamped edges.
   * Good for pixel art or non-filtered textures.
   */
  static readonly NEAREST_CLAMP: GPUSamplerDescriptor = {
    magFilter: FilterMode.Nearest,
    minFilter: FilterMode.Nearest,
    mipmapFilter: FilterMode.Nearest,
    addressModeU: AddressMode.ClampToEdge,
    addressModeV: AddressMode.ClampToEdge,
    addressModeW: AddressMode.ClampToEdge,
  };

  /**
   * Linear filtering with clamped edges.
   * General purpose smooth filtering.
   */
  static readonly LINEAR_CLAMP: GPUSamplerDescriptor = {
    magFilter: FilterMode.Linear,
    minFilter: FilterMode.Linear,
    mipmapFilter: FilterMode.Linear,
    addressModeU: AddressMode.ClampToEdge,
    addressModeV: AddressMode.ClampToEdge,
    addressModeW: AddressMode.ClampToEdge,
  };

  /**
   * Linear filtering with repeating coordinates.
   * Good for tiled textures.
   */
  static readonly LINEAR_REPEAT: GPUSamplerDescriptor = {
    magFilter: FilterMode.Linear,
    minFilter: FilterMode.Linear,
    mipmapFilter: FilterMode.Linear,
    addressModeU: AddressMode.Repeat,
    addressModeV: AddressMode.Repeat,
    addressModeW: AddressMode.Repeat,
  };

  /**
   * Linear filtering with mirrored repeating.
   * Good for seamless tiled textures.
   */
  static readonly LINEAR_MIRROR: GPUSamplerDescriptor = {
    magFilter: FilterMode.Linear,
    minFilter: FilterMode.Linear,
    mipmapFilter: FilterMode.Linear,
    addressModeU: AddressMode.MirrorRepeat,
    addressModeV: AddressMode.MirrorRepeat,
    addressModeW: AddressMode.MirrorRepeat,
  };

  /**
   * Anisotropic filtering with repeat wrapping.
   * Best quality for textured surfaces viewed at angles.
   */
  static readonly ANISOTROPIC_REPEAT: GPUSamplerDescriptor = {
    magFilter: FilterMode.Linear,
    minFilter: FilterMode.Linear,
    mipmapFilter: FilterMode.Linear,
    addressModeU: AddressMode.Repeat,
    addressModeV: AddressMode.Repeat,
    addressModeW: AddressMode.Repeat,
    maxAnisotropy: 16,
  };

  /**
   * Shadow sampler with linear filtering and less comparison.
   * For percentage-closer filtering (PCF).
   */
  static readonly SHADOW_PCF: GPUSamplerDescriptor = {
    magFilter: FilterMode.Linear,
    minFilter: FilterMode.Linear,
    mipmapFilter: FilterMode.Nearest,
    addressModeU: AddressMode.ClampToEdge,
    addressModeV: AddressMode.ClampToEdge,
    addressModeW: AddressMode.ClampToEdge,
    compare: CompareFunction.Less,
  };

  /**
   * Shadow sampler with nearest filtering and less comparison.
   * For hard shadow edges.
   */
  static readonly SHADOW_HARD: GPUSamplerDescriptor = {
    magFilter: FilterMode.Nearest,
    minFilter: FilterMode.Nearest,
    mipmapFilter: FilterMode.Nearest,
    addressModeU: AddressMode.ClampToEdge,
    addressModeV: AddressMode.ClampToEdge,
    addressModeW: AddressMode.ClampToEdge,
    compare: CompareFunction.Less,
  };

  /**
   * Nearest neighbor with repeat wrapping.
   * For retro/pixel art with tiling.
   */
  static readonly NEAREST_REPEAT: GPUSamplerDescriptor = {
    magFilter: FilterMode.Nearest,
    minFilter: FilterMode.Nearest,
    mipmapFilter: FilterMode.Nearest,
    addressModeU: AddressMode.Repeat,
    addressModeV: AddressMode.Repeat,
    addressModeW: AddressMode.Repeat,
  };
}
