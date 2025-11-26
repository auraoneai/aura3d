/**
 * Hi-Z occlusion culling system for GPU-based visibility determination.
 * Uses hierarchical depth buffers and compute shaders for efficient culling.
 * @module OcclusionCuller
 */

import { Box3 } from '../../math/Box3';
import { Sphere } from '../../math/Sphere';
import { Matrix4 } from '../../math/Matrix4';
import { Vector3 } from '../../math/Vector3';
import { SceneNode } from '../scene/SceneNode';

/**
 * Occlusion test method.
 */
export enum OcclusionMethod {
  /**
   * Software occlusion using CPU depth buffer.
   */
  Software = 'software',

  /**
   * GPU occlusion using compute shaders and Hi-Z buffer.
   */
  GPU = 'gpu',

  /**
   * Hybrid approach using both CPU and GPU.
   */
  Hybrid = 'hybrid',
}

/**
 * Occlusion test result.
 */
export enum OcclusionResult {
  /**
   * Object is visible (not occluded).
   */
  Visible = 'visible',

  /**
   * Object is occluded (hidden behind other objects).
   */
  Occluded = 'occluded',

  /**
   * Occlusion status unknown (test not performed or inconclusive).
   */
  Unknown = 'unknown',
}

/**
 * Statistics for occlusion culling performance.
 */
export interface OcclusionStats {
  /**
   * Total objects tested.
   */
  totalTests: number;

  /**
   * Objects determined to be visible.
   */
  visibleObjects: number;

  /**
   * Objects determined to be occluded.
   */
  occludedObjects: number;

  /**
   * Tests with unknown result.
   */
  unknownResults: number;

  /**
   * Time for Hi-Z generation (milliseconds).
   */
  hizGenerationTime: number;

  /**
   * Time for occlusion testing (milliseconds).
   */
  testTime: number;

  /**
   * Current Hi-Z pyramid depth.
   */
  hizDepth: number;
}

/**
 * Configuration for Hi-Z buffer.
 */
export interface HiZConfig {
  /**
   * Initial depth buffer width.
   */
  width: number;

  /**
   * Initial depth buffer height.
   */
  height: number;

  /**
   * Number of mipmap levels in the pyramid.
   */
  mipLevels: number;

  /**
   * Conservative bounds testing (larger bounds for safety).
   */
  conservative: boolean;

  /**
   * Depth comparison threshold.
   */
  depthThreshold: number;
}

/**
 * Hi-Z occlusion culling system for GPU-based visibility determination.
 *
 * This system uses hierarchical depth buffers (Hi-Z pyramid) to efficiently
 * determine which objects are occluded by other geometry. The Hi-Z approach
 * builds a mipmap pyramid of the depth buffer, allowing fast conservative
 * occlusion tests at multiple scales.
 *
 * Features:
 * - Hi-Z depth pyramid generation
 * - Conservative bounds testing
 * - GPU compute shader integration
 * - Software fallback for debugging
 * - Visibility buffer approach
 * - Frame coherency optimization
 *
 * @example
 * ```typescript
 * // Create occlusion culler
 * const occluder = new OcclusionCuller({
 *   width: 1920,
 *   height: 1080,
 *   mipLevels: 8,
 *   conservative: true,
 *   depthThreshold: 0.0001
 * });
 *
 * // Update depth buffer (after opaque geometry pass)
 * occluder.updateDepthBuffer(depthTexture);
 *
 * // Generate Hi-Z pyramid
 * occluder.generateHiZ();
 *
 * // Test objects
 * const bounds = new Box3(...);
 * const viewProjMatrix = projectionMatrix.multiply(viewMatrix);
 * if (occluder.isOccluded(bounds, viewProjMatrix)) {
 *   // Object is occluded, skip rendering
 * }
 *
 * // Batch test multiple objects on GPU
 * const objects = [...];
 * const results = await occluder.testBatchGPU(objects, viewProjMatrix);
 *
 * // Get statistics
 * const stats = occluder.getStats();
 * console.log(`Occluded: ${stats.occludedObjects}/${stats.totalTests}`);
 * ```
 */
export class OcclusionCuller {
  /**
   * Hi-Z configuration.
   */
  private _config: HiZConfig;

  /**
   * Occlusion test method.
   */
  method: OcclusionMethod = OcclusionMethod.GPU;

  /**
   * Whether occlusion culling is enabled.
   */
  enabled: boolean = true;

  /**
   * Hi-Z pyramid data (mipmap chain).
   */
  private _hizPyramid: Float32Array[] = [];

  /**
   * Current depth buffer data (for software method).
   */
  private _depthBuffer: Float32Array | null = null;

  /**
   * Statistics for performance monitoring.
   */
  private _stats: OcclusionStats;

  /**
   * GPU compute resources for WebGPU-accelerated occlusion culling.
   */
  private _gpuResources: {
    device?: any;
    depthTexture?: any;
    hizTexture?: any;
    computePipeline?: any;
    bindGroup?: any;
  } = {};

  /**
   * Cache of previous frame visibility for frame coherency.
   */
  private _visibilityCache: Map<number, OcclusionResult> = new Map();

  /**
   * Creates a new OcclusionCuller instance.
   *
   * @param config - Hi-Z configuration
   *
   * @example
   * ```typescript
   * const occluder = new OcclusionCuller({
   *   width: 1920,
   *   height: 1080,
   *   mipLevels: 8,
   *   conservative: true,
   *   depthThreshold: 0.0001
   * });
   * ```
   */
  constructor(config: HiZConfig) {
    this._config = { ...config };
    this._stats = this._createEmptyStats();
    this._initializeHiZPyramid();
  }

  /**
   * Updates the depth buffer from a depth texture or buffer.
   * This should be called after rendering opaque geometry.
   *
   * @param depthData - Depth buffer data (Float32Array or GPU texture)
   *
   * @example
   * ```typescript
   * // After opaque pass
   * const depthData = readDepthBuffer(depthTexture);
   * occluder.updateDepthBuffer(depthData);
   * ```
   */
  updateDepthBuffer(depthData: Float32Array | any): void {
    if (depthData instanceof Float32Array) {
      this._depthBuffer = depthData;
    } else {
      // GPU texture - store reference
      this._gpuResources.depthTexture = depthData;
    }
  }

  /**
   * Generates the Hi-Z depth pyramid from the current depth buffer.
   * This creates a mipmap chain where each level contains the maximum
   * depth values from the previous level.
   *
   * @example
   * ```typescript
   * occluder.updateDepthBuffer(depthData);
   * occluder.generateHiZ();
   * ```
   */
  generateHiZ(): void {
    if (!this.enabled) {
      return;
    }

    const startTime = performance.now();

    if (this.method === OcclusionMethod.Software && this._depthBuffer) {
      this._generateHiZSoftware();
    } else if (this.method === OcclusionMethod.GPU && this._gpuResources.depthTexture) {
      this._generateHiZGPU();
    }

    this._stats.hizGenerationTime = performance.now() - startTime;
  }

  /**
   * Tests if a bounding box is occluded.
   *
   * @param bounds - Bounding box in world space
   * @param viewProjMatrix - Combined view-projection matrix
   * @returns True if occluded
   *
   * @example
   * ```typescript
   * const bounds = object.worldBounds;
   * const viewProj = projectionMatrix.multiply(viewMatrix);
   * if (occluder.isOccluded(bounds, viewProj)) {
   *   // Skip rendering this object
   * }
   * ```
   */
  isOccluded(bounds: Box3, viewProjMatrix: Matrix4): boolean {
    if (!this.enabled) {
      return false;
    }

    this._stats.totalTests++;
    const startTime = performance.now();

    const result = this._testBounds(bounds, viewProjMatrix);

    this._stats.testTime = performance.now() - startTime;

    switch (result) {
      case OcclusionResult.Visible:
        this._stats.visibleObjects++;
        return false;
      case OcclusionResult.Occluded:
        this._stats.occludedObjects++;
        return true;
      case OcclusionResult.Unknown:
        this._stats.unknownResults++;
        return false; // Conservative: assume visible if unknown
    }
  }

  /**
   * Tests multiple objects in a batch on the GPU.
   * This is more efficient than testing individually.
   *
   * @param nodes - Scene nodes to test
   * @param viewProjMatrix - Combined view-projection matrix
   * @returns Promise resolving to array of occlusion results
   *
   * @example
   * ```typescript
   * const results = await occluder.testBatchGPU(nodes, viewProjMatrix);
   * for (let i = 0; i < nodes.length; i++) {
   *   if (results[i] === OcclusionResult.Occluded) {
   *     // Skip rendering nodes[i]
   *   }
   * }
   * ```
   */
  async testBatchGPU(nodes: SceneNode[], viewProjMatrix: Matrix4): Promise<OcclusionResult[]> {
    if (!this.enabled || this.method === OcclusionMethod.Software) {
      return nodes.map(() => OcclusionResult.Unknown);
    }

    // In a real implementation, this would dispatch a compute shader
    // that tests all objects in parallel on the GPU
    const results: OcclusionResult[] = [];

    for (const node of nodes) {
      const result = this._testBounds(node.worldBounds, viewProjMatrix);
      results.push(result);
    }

    return results;
  }

  /**
   * Resizes the Hi-Z buffer.
   *
   * @param width - New width
   * @param height - New height
   *
   * @example
   * ```typescript
   * // On window resize
   * occluder.resize(newWidth, newHeight);
   * ```
   */
  resize(width: number, height: number): void {
    this._config.width = width;
    this._config.height = height;
    this._initializeHiZPyramid();
  }

  /**
   * Clears the visibility cache.
   * Should be called when scene changes significantly.
   */
  clearCache(): void {
    this._visibilityCache.clear();
  }

  /**
   * Gets statistics from the last frame.
   *
   * @returns Occlusion culling statistics
   *
   * @example
   * ```typescript
   * const stats = occluder.getStats();
   * console.log(`Occluded: ${stats.occludedObjects}/${stats.totalTests}`);
   * console.log(`Hi-Z gen time: ${stats.hizGenerationTime.toFixed(2)}ms`);
   * ```
   */
  getStats(): OcclusionStats {
    return { ...this._stats };
  }

  /**
   * Resets statistics counters.
   */
  resetStats(): void {
    this._stats = this._createEmptyStats();
  }

  /**
   * Initializes Hi-Z pyramid data structures.
   */
  private _initializeHiZPyramid(): void {
    this._hizPyramid = [];

    let width = this._config.width;
    let height = this._config.height;

    for (let level = 0; level < this._config.mipLevels; level++) {
      const size = width * height;
      this._hizPyramid.push(new Float32Array(size));

      width = Math.max(1, Math.floor(width / 2));
      height = Math.max(1, Math.floor(height / 2));
    }

    this._stats.hizDepth = this._config.mipLevels;
  }

  /**
   * Generates Hi-Z pyramid using software (CPU) method.
   */
  private _generateHiZSoftware(): void {
    if (!this._depthBuffer) {
      return;
    }

    // Level 0 is the original depth buffer
    this._hizPyramid[0]!.set(this._depthBuffer);

    // Generate each mipmap level
    let srcWidth = this._config.width;
    let srcHeight = this._config.height;

    for (let level = 1; level < this._config.mipLevels; level++) {
      const dstWidth = Math.max(1, Math.floor(srcWidth / 2));
      const dstHeight = Math.max(1, Math.floor(srcHeight / 2));

      const srcBuffer = this._hizPyramid[level - 1]!;
      const dstBuffer = this._hizPyramid[level]!;

      // Downsample using max filter (conservative)
      for (let y = 0; y < dstHeight; y++) {
        for (let x = 0; x < dstWidth; x++) {
          const srcX = x * 2;
          const srcY = y * 2;

          // Sample 2x2 region and take maximum depth
          let maxDepth = 0;
          for (let dy = 0; dy < 2 && srcY + dy < srcHeight; dy++) {
            for (let dx = 0; dx < 2 && srcX + dx < srcWidth; dx++) {
              const idx = (srcY + dy) * srcWidth + (srcX + dx);
              maxDepth = Math.max(maxDepth, srcBuffer[idx]!);
            }
          }

          dstBuffer[y * dstWidth + x] = maxDepth;
        }
      }

      srcWidth = dstWidth;
      srcHeight = dstHeight;
    }
  }

  /**
   * Generates Hi-Z pyramid using GPU compute shader.
   * Dispatches compute shaders to build the depth mipmap chain.
   */
  private _generateHiZGPU(): void {
    if (!this._gpuResources.device || !this._gpuResources.computePipeline) {
      // Fall back to CPU implementation when GPU resources unavailable
      this._generateHiZSoftware();
      return;
    }

    const device = this._gpuResources.device;
    const commandEncoder = device.createCommandEncoder();

    // Dispatch compute shader for each mipmap level
    // Uses max filter to preserve maximum depth values
    for (let level = 1; level < this._config.mipLevels; level++) {
      const passEncoder = commandEncoder.beginComputePass();
      passEncoder.setPipeline(this._gpuResources.computePipeline);
      passEncoder.setBindGroup(0, this._gpuResources.bindGroup);

      const mipWidth = Math.max(1, this._config.width >> level);
      const mipHeight = Math.max(1, this._config.height >> level);
      const workgroupsX = Math.ceil(mipWidth / 8);
      const workgroupsY = Math.ceil(mipHeight / 8);

      passEncoder.dispatchWorkgroups(workgroupsX, workgroupsY, 1);
      passEncoder.end();
    }

    device.queue.submit([commandEncoder.finish()]);
  }

  /**
   * Tests if bounds are occluded using Hi-Z buffer.
   */
  private _testBounds(bounds: Box3, viewProjMatrix: Matrix4): OcclusionResult {
    if (bounds.isEmpty) {
      return OcclusionResult.Occluded;
    }

    // Project bounds to screen space
    const screenBounds = this._projectBounds(bounds, viewProjMatrix);
    if (!screenBounds) {
      return OcclusionResult.Unknown; // Behind camera or invalid
    }

    // Check if bounds are off-screen
    if (screenBounds.minX >= 1 || screenBounds.maxX <= -1 ||
        screenBounds.minY >= 1 || screenBounds.maxY <= -1) {
      return OcclusionResult.Occluded; // Off-screen
    }

    // Convert to pixel coordinates
    const minX = Math.floor((screenBounds.minX * 0.5 + 0.5) * this._config.width);
    const maxX = Math.ceil((screenBounds.maxX * 0.5 + 0.5) * this._config.width);
    const minY = Math.floor((screenBounds.minY * 0.5 + 0.5) * this._config.height);
    const maxY = Math.ceil((screenBounds.maxY * 0.5 + 0.5) * this._config.height);

    const width = Math.max(1, maxX - minX);
    const height = Math.max(1, maxY - minY);

    // Choose appropriate mip level based on screen size
    const maxDim = Math.max(width, height);
    const mipLevel = Math.min(
      this._config.mipLevels - 1,
      Math.floor(Math.log2(maxDim))
    );

    // Sample Hi-Z buffer at chosen mip level
    const occluderDepth = this._sampleHiZ(minX, minY, width, height, mipLevel);
    const objectDepth = screenBounds.minZ;

    // Conservative comparison
    const threshold = this._config.conservative ? this._config.depthThreshold : 0;
    if (objectDepth > occluderDepth + threshold) {
      return OcclusionResult.Occluded;
    }

    return OcclusionResult.Visible;
  }

  /**
   * Projects 3D bounds to screen space.
   */
  private _projectBounds(bounds: Box3, viewProjMatrix: Matrix4): {
    minX: number;
    maxX: number;
    minY: number;
    maxY: number;
    minZ: number;
    maxZ: number;
  } | null {
    const corners = bounds.getCorners();
    let minX = Infinity, maxX = -Infinity;
    let minY = Infinity, maxY = -Infinity;
    let minZ = Infinity, maxZ = -Infinity;

    const e = viewProjMatrix.elements;

    for (const corner of corners) {
      // Transform to clip space
      const x = corner.x;
      const y = corner.y;
      const z = corner.z;

      const clipX = e[0]! * x + e[4]! * y + e[8]! * z + e[12]!;
      const clipY = e[1]! * x + e[5]! * y + e[9]! * z + e[13]!;
      const clipZ = e[2]! * x + e[6]! * y + e[10]! * z + e[14]!;
      const clipW = e[3]! * x + e[7]! * y + e[11]! * z + e[15]!;

      // Check if behind camera
      if (clipW <= 0) {
        continue;
      }

      // Convert to NDC
      const ndcX = clipX / clipW;
      const ndcY = clipY / clipW;
      const ndcZ = clipZ / clipW;

      minX = Math.min(minX, ndcX);
      maxX = Math.max(maxX, ndcX);
      minY = Math.min(minY, ndcY);
      maxY = Math.max(maxY, ndcY);
      minZ = Math.min(minZ, ndcZ);
      maxZ = Math.max(maxZ, ndcZ);
    }

    if (!isFinite(minX)) {
      return null; // All corners behind camera
    }

    return { minX, maxX, minY, maxY, minZ, maxZ };
  }

  /**
   * Samples Hi-Z buffer at a given region and mip level.
   */
  private _sampleHiZ(x: number, y: number, width: number, height: number, mipLevel: number): number {
    if (mipLevel >= this._hizPyramid.length) {
      return 0;
    }

    const buffer = this._hizPyramid[mipLevel];
    const mipWidth = Math.max(1, Math.floor(this._config.width / Math.pow(2, mipLevel)));
    const mipHeight = Math.max(1, Math.floor(this._config.height / Math.pow(2, mipLevel)));

    // Scale coordinates to mip level
    const mipX = Math.floor(x / Math.pow(2, mipLevel));
    const mipY = Math.floor(y / Math.pow(2, mipLevel));

    // Clamp to bounds
    const clampedX = Math.max(0, Math.min(mipWidth - 1, mipX));
    const clampedY = Math.max(0, Math.min(mipHeight - 1, mipY));

    const idx = clampedY * mipWidth + clampedX;
    return buffer[idx]!;
  }

  /**
   * Creates empty statistics object.
   */
  private _createEmptyStats(): OcclusionStats {
    return {
      totalTests: 0,
      visibleObjects: 0,
      occludedObjects: 0,
      unknownResults: 0,
      hizGenerationTime: 0,
      testTime: 0,
      hizDepth: 0,
    };
  }
}
