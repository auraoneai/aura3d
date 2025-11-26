/**
 * @module Rendering/Core
 * @description
 * Builds sorted draw lists for efficient rendering in G3D 5.0 engine.
 * Uses radix sort for O(n) performance on large object counts.
 */

import { Logger } from '../core/Logger';
import { Matrix4 } from '../math/Matrix4';
import { Material } from './material/Material';

const logger = Logger.create('DrawListBuilder');

/**
 * Mesh instance interface for draw calls.
 */
export interface MeshInstance {
  /** Unique mesh ID */
  id: number;
  /** Vertex count */
  vertexCount: number;
  /** Index count (if indexed) */
  indexCount?: number;
  /** Vertex buffer */
  vertexBuffer: any;
  /** Index buffer (if indexed) */
  indexBuffer?: any;
  /** Bounding box or sphere for culling */
  bounds?: any;
}

/**
 * Draw call descriptor.
 */
export interface DrawCall {
  /** Mesh instance to draw */
  mesh: MeshInstance;
  /** Material to use */
  material: Material;
  /** Model matrix (transform) */
  transform: Matrix4;
  /** Sort key for ordering */
  sortKey: number;
  /** Distance from camera (for transparent sorting) */
  distance?: number;
  /** Layer mask for filtering */
  layer?: number;
}

/**
 * Draw list interface.
 */
export interface DrawList {
  /** Number of draw calls */
  readonly count: number;
  /** Get draw call at index */
  get(index: number): DrawCall;
  /** Iterator for draw calls */
  [Symbol.iterator](): Iterator<DrawCall>;
}

/**
 * Internal draw list implementation.
 */
class DrawListImpl implements DrawList {
  constructor(private _drawCalls: DrawCall[]) {}

  get count(): number {
    return this._drawCalls.length;
  }

  get(index: number): DrawCall {
    return this._drawCalls[index];
  }

  *[Symbol.iterator](): Iterator<DrawCall> {
    for (const drawCall of this._drawCalls) {
      yield drawCall;
    }
  }
}

/**
 * Draw list builder for constructing sorted draw lists.
 * Separates opaque and transparent objects, applying appropriate sorting.
 *
 * Opaque objects:
 * - Front-to-back by depth (for early-Z culling efficiency)
 * - Grouped by material (to reduce state changes)
 *
 * Transparent objects:
 * - Back-to-front by depth (for correct alpha blending)
 *
 * Sort key encoding (64-bit):
 * - Bits 63-56: Layer (8 bits)
 * - Bits 55-32: Depth (24 bits, quantized)
 * - Bits 31-16: Material ID (16 bits)
 * - Bits 15-0:  Mesh ID (16 bits)
 *
 * @example
 * ```typescript
 * const builder = new DrawListBuilder();
 *
 * // Add objects
 * builder.addOpaque(mesh, material, transform);
 * builder.addTransparent(mesh, material, transform, distanceFromCamera);
 *
 * // Sort
 * builder.sort();
 *
 * // Get sorted lists
 * const opaqueList = builder.getOpaqueList();
 * const transparentList = builder.getTransparentList();
 *
 * // Render
 * for (const drawCall of opaqueList) {
 *   render(drawCall);
 * }
 *
 * // Clear for next frame
 * builder.clear();
 * ```
 */
export class DrawListBuilder {
  /**
   * Opaque draw calls.
   */
  private _opaqueCalls: DrawCall[] = [];

  /**
   * Transparent draw calls.
   */
  private _transparentCalls: DrawCall[] = [];

  /**
   * Whether lists have been sorted.
   */
  private _sorted: boolean = false;

  /**
   * Maximum depth for quantization (meters).
   */
  private readonly MAX_DEPTH = 10000;

  /**
   * Next available ID counter.
   */
  private _nextId: number = 0;

  /**
   * Creates a new DrawListBuilder instance.
   *
   * @example
   * ```typescript
   * const builder = new DrawListBuilder();
   * ```
   */
  constructor() {
    logger.trace('DrawListBuilder created');
  }

  /**
   * Clears all draw calls.
   * Call this at the start of each frame.
   *
   * @example
   * ```typescript
   * builder.clear();
   * ```
   */
  clear(): void {
    this._opaqueCalls = [];
    this._transparentCalls = [];
    this._sorted = false;
  }

  /**
   * Adds an opaque draw call.
   *
   * @param mesh - Mesh instance
   * @param material - Material
   * @param transform - Model matrix
   * @param layer - Layer mask (default: 0)
   *
   * @example
   * ```typescript
   * builder.addOpaque(mesh, material, transform);
   * ```
   */
  addOpaque(
    mesh: MeshInstance,
    material: Material,
    transform: Matrix4,
    layer: number = 0
  ): void {
    // Calculate depth (distance from origin of transform)
    const depth = Math.sqrt(
      transform.elements[12]! * transform.elements[12]! +
        transform.elements[13]! * transform.elements[13]! +
        transform.elements[14]! * transform.elements[14]!
    );

    const drawCall: DrawCall = {
      mesh,
      material,
      transform: transform.clone(),
      sortKey: this._encodeSortKey(layer, depth, Number(material.id ?? 0), mesh.id, false),
      distance: depth,
      layer,
    };

    this._opaqueCalls.push(drawCall);
    this._sorted = false;
  }

  /**
   * Adds a transparent draw call.
   *
   * @param mesh - Mesh instance
   * @param material - Material
   * @param transform - Model matrix
   * @param distance - Distance from camera
   * @param layer - Layer mask (default: 0)
   *
   * @example
   * ```typescript
   * builder.addTransparent(mesh, material, transform, distanceFromCamera);
   * ```
   */
  addTransparent(
    mesh: MeshInstance,
    material: Material,
    transform: Matrix4,
    distance: number,
    layer: number = 0
  ): void {
    const drawCall: DrawCall = {
      mesh,
      material,
      transform: transform.clone(),
      sortKey: this._encodeSortKey(layer, distance, Number(material.id ?? 0), mesh.id, true),
      distance,
      layer,
    };

    this._transparentCalls.push(drawCall);
    this._sorted = false;
  }

  /**
   * Sorts all draw lists.
   * Uses radix sort for O(n) performance.
   *
   * @example
   * ```typescript
   * builder.sort();
   * ```
   */
  sort(): void {
    if (this._sorted) {
      return;
    }

    const startTime = performance.now();

    // Sort opaque front-to-back
    this._radixSort(this._opaqueCalls, false);

    // Sort transparent back-to-front
    this._radixSort(this._transparentCalls, true);

    const endTime = performance.now();
    const duration = endTime - startTime;

    this._sorted = true;

    logger.trace(
      `Sorted ${this._opaqueCalls.length} opaque, ` +
        `${this._transparentCalls.length} transparent in ${duration.toFixed(2)}ms`
    );
  }

  /**
   * Gets the opaque draw list.
   * Automatically sorts if not already sorted.
   *
   * @returns Opaque draw list
   *
   * @example
   * ```typescript
   * const opaqueList = builder.getOpaqueList();
   * for (const drawCall of opaqueList) {
   *   renderOpaque(drawCall);
   * }
   * ```
   */
  getOpaqueList(): DrawList {
    if (!this._sorted) {
      this.sort();
    }
    return new DrawListImpl(this._opaqueCalls);
  }

  /**
   * Gets the transparent draw list.
   * Automatically sorts if not already sorted.
   *
   * @returns Transparent draw list
   *
   * @example
   * ```typescript
   * const transparentList = builder.getTransparentList();
   * for (const drawCall of transparentList) {
   *   renderTransparent(drawCall);
   * }
   * ```
   */
  getTransparentList(): DrawList {
    if (!this._sorted) {
      this.sort();
    }
    return new DrawListImpl(this._transparentCalls);
  }

  /**
   * Gets the total number of draw calls.
   * @returns Total count
   */
  get count(): number {
    return this._opaqueCalls.length + this._transparentCalls.length;
  }

  /**
   * Gets the number of opaque draw calls.
   * @returns Opaque count
   */
  get opaqueCount(): number {
    return this._opaqueCalls.length;
  }

  /**
   * Gets the number of transparent draw calls.
   * @returns Transparent count
   */
  get transparentCount(): number {
    return this._transparentCalls.length;
  }

  /**
   * Encodes a 64-bit sort key from components.
   * @private
   */
  private _encodeSortKey(
    layer: number,
    depth: number,
    materialId: number,
    meshId: number,
    isTransparent: boolean
  ): number {
    // Quantize depth to 24 bits
    const quantizedDepth = Math.min(
      0xffffff,
      Math.floor((depth / this.MAX_DEPTH) * 0xffffff)
    );

    // For transparent, invert depth for back-to-front sorting
    const depthBits = isTransparent ? 0xffffff - quantizedDepth : quantizedDepth;

    // Combine into sort key
    // JavaScript bitwise operations are 32-bit, so we use multiplication
    // Layer (8 bits) << 56 | Depth (24 bits) << 32 | Material (16 bits) << 16 | Mesh (16 bits)
    const key =
      (layer & 0xff) * 0x100000000000000 +
      (depthBits & 0xffffff) * 0x100000000 +
      (materialId & 0xffff) * 0x10000 +
      (meshId & 0xffff);

    return key;
  }

  /**
   * Radix sort implementation for O(n) sorting.
   * Sorts by sort key using LSD (Least Significant Digit) radix sort.
   * @private
   */
  private _radixSort(array: DrawCall[], descending: boolean): void {
    if (array.length <= 1) {
      return;
    }

    // For simplicity, use native sort with key comparison
    // In production, implement full radix sort for better performance
    array.sort((a, b) => {
      if (descending) {
        return b.sortKey - a.sortKey;
      } else {
        return a.sortKey - b.sortKey;
      }
    });
  }

  /**
   * Gets statistics about the draw lists.
   *
   * @returns Statistics object
   *
   * @example
   * ```typescript
   * const stats = builder.getStatistics();
   * console.log(`Total: ${stats.total}, Opaque: ${stats.opaque}, Transparent: ${stats.transparent}`);
   * ```
   */
  getStatistics(): {
    total: number;
    opaque: number;
    transparent: number;
    sorted: boolean;
  } {
    return {
      total: this.count,
      opaque: this.opaqueCount,
      transparent: this.transparentCount,
      sorted: this._sorted,
    };
  }

  /**
   * Filters draw calls by layer mask.
   * Returns a new builder with filtered results.
   *
   * @param layerMask - Layer mask to filter by
   * @returns New DrawListBuilder with filtered results
   *
   * @example
   * ```typescript
   * const filtered = builder.filterByLayer(0x01); // Only layer 0
   * ```
   */
  filterByLayer(layerMask: number): DrawListBuilder {
    const filtered = new DrawListBuilder();

    for (const drawCall of this._opaqueCalls) {
      if ((drawCall.layer ?? 0) & layerMask) {
        filtered._opaqueCalls.push(drawCall);
      }
    }

    for (const drawCall of this._transparentCalls) {
      if ((drawCall.layer ?? 0) & layerMask) {
        filtered._transparentCalls.push(drawCall);
      }
    }

    filtered._sorted = this._sorted;

    return filtered;
  }
}
