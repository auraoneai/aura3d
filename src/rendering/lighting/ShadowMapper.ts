/**
 * @module Rendering/Lighting
 * @description
 * Shadow mapping system with atlas management, cascade support, and various
 * filtering techniques (PCF, PCSS, VSM). Handles shadow map allocation,
 * rendering, and temporal stabilization.
 */

import { Vector3 } from '../../math/Vector3';
import { Matrix4 } from '../../math/Matrix4';
import { Box3 } from '../../math/Box3';
import { Logger } from '../../core/Logger';
import { Light, ShadowMode, ShadowQuality, ShadowFilter } from './Light';
import { DirectionalLight } from './DirectionalLight';
import { PointLight } from './PointLight';
import { SpotLight } from './SpotLight';

const logger = Logger.create('ShadowMapper');

/**
 * Shadow map atlas allocation entry.
 */
interface AtlasAllocation {
  /** Light ID that owns this allocation */
  lightId: number;
  /** X position in atlas (pixels) */
  x: number;
  /** Y position in atlas (pixels) */
  y: number;
  /** Width in atlas (pixels) */
  width: number;
  /** Height in atlas (pixels) */
  height: number;
  /** Cascade index (for directional lights) */
  cascadeIndex: number;
  /** Cubemap face index (for point lights, 0-5) */
  faceIndex: number;
  /** Last frame this allocation was used */
  lastUsedFrame: number;
}

/**
 * Shadow map configuration.
 */
export interface ShadowMapConfig {
  /** Atlas texture width */
  atlasWidth: number;
  /** Atlas texture height */
  atlasHeight: number;
  /** Maximum number of shadow maps */
  maxShadowMaps: number;
  /** Enable temporal stabilization */
  temporalStabilization: boolean;
  /** Enable shadow map caching */
  cacheShadowMaps: boolean;
  /** Number of frames before evicting unused shadows */
  evictionFrames: number;
  /** Default shadow quality */
  defaultQuality: ShadowQuality;
  /** Default shadow filter */
  defaultFilter: ShadowFilter;
}

/**
 * Shadow render data for a light.
 */
export interface ShadowRenderData {
  /** Light that casts this shadow */
  light: Light;
  /** View-projection matrices for shadow rendering */
  viewProjectionMatrices: Matrix4[];
  /** Viewport rectangles in atlas (normalized [0,1]) */
  viewports: { x: number; y: number; width: number; height: number }[];
  /** Shadow map resolution */
  resolution: number;
  /** Cascade split distances (for directional lights) */
  cascadeSplits?: number[];
  /** Cubemap faces to render (for point lights) */
  cubemapFaces?: number[];
}

/**
 * Shadow atlas manager with automatic allocation and deallocation.
 *
 * Manages a texture atlas for shadow maps, supporting:
 * - Efficient packing of multiple shadow maps
 * - Cascade shadow maps for directional lights
 * - Cubemap shadows for point lights
 * - Single shadow maps for spot lights
 * - Automatic eviction of unused shadows
 * - Temporal stabilization to reduce flickering
 *
 * @example
 * ```typescript
 * const shadowMapper = new ShadowMapper({
 *   atlasWidth: 4096,
 *   atlasHeight: 4096,
 *   maxShadowMaps: 32,
 *   temporalStabilization: true,
 *   cacheShadowMaps: true,
 *   evictionFrames: 60,
 *   defaultQuality: ShadowQuality.High,
 *   defaultFilter: ShadowFilter.PCF,
 * });
 *
 * // Update shadows each frame
 * const shadowData = shadowMapper.prepareShadows(lights, camera, frameIndex);
 *
 * // Render shadows
 * for (const shadow of shadowData) {
 *   renderShadowMap(shadow);
 * }
 * ```
 */
export class ShadowMapper {
  /**
   * Shadow map configuration.
   */
  readonly config: ShadowMapConfig;

  /**
   * Current atlas allocations.
   */
  private allocations: Map<string, AtlasAllocation>;

  /**
   * Free regions in the atlas.
   */
  private freeRegions: { x: number; y: number; width: number; height: number }[];

  /**
   * Current frame index.
   */
  private frameIndex: number;

  /**
   * Shadow map atlas texture ID.
   */
  private atlasTextureId: number | null;

  /**
   * Creates a new ShadowMapper instance.
   *
   * @param config - Shadow map configuration
   *
   * @example
   * ```typescript
   * const shadowMapper = new ShadowMapper({
   *   atlasWidth: 2048,
   *   atlasHeight: 2048,
   *   maxShadowMaps: 16,
   *   temporalStabilization: true,
   *   cacheShadowMaps: false,
   *   evictionFrames: 30,
   *   defaultQuality: ShadowQuality.Medium,
   *   defaultFilter: ShadowFilter.PCF,
   * });
   * ```
   */
  constructor(config: Partial<ShadowMapConfig> = {}) {
    this.config = {
      atlasWidth: config.atlasWidth || 4096,
      atlasHeight: config.atlasHeight || 4096,
      maxShadowMaps: config.maxShadowMaps || 32,
      temporalStabilization: config.temporalStabilization ?? true,
      cacheShadowMaps: config.cacheShadowMaps ?? true,
      evictionFrames: config.evictionFrames || 60,
      defaultQuality: config.defaultQuality || ShadowQuality.Medium,
      defaultFilter: config.defaultFilter || ShadowFilter.PCF,
    };

    this.allocations = new Map();
    this.freeRegions = [
      {
        x: 0,
        y: 0,
        width: this.config.atlasWidth,
        height: this.config.atlasHeight,
      },
    ];
    this.frameIndex = 0;
    this.atlasTextureId = null;
  }

  /**
   * Prepares shadow render data for all shadow-casting lights.
   *
   * @param lights - Array of lights to process
   * @param camera - Camera for view-dependent calculations
   * @param frameIndex - Current frame index
   * @returns Array of shadow render data
   *
   * @example
   * ```typescript
   * const shadowData = shadowMapper.prepareShadows(
   *   scene.getLights(),
   *   camera,
   *   Time.frameCount
   * );
   * ```
   */
  prepareShadows(
    lights: Light[],
    camera: { position: Vector3; viewMatrix: Matrix4; projectionMatrix: Matrix4; fov: number; aspect: number },
    frameIndex: number
  ): ShadowRenderData[] {
    this.frameIndex = frameIndex;

    // Evict old allocations if caching is disabled
    if (!this.config.cacheShadowMaps || frameIndex % 60 === 0) {
      this.evictUnusedAllocations();
    }

    const shadowData: ShadowRenderData[] = [];

    for (const light of lights) {
      if (!light.enabled || !light.castsShadows()) continue;

      if (light instanceof DirectionalLight) {
        const data = this.prepareDirectionalLightShadow(light, camera);
        if (data) shadowData.push(data);
      } else if (light instanceof PointLight) {
        const data = this.preparePointLightShadow(light, camera);
        if (data) shadowData.push(data);
      } else if (light instanceof SpotLight) {
        const data = this.prepareSpotLightShadow(light);
        if (data) shadowData.push(data);
      }
    }

    return shadowData;
  }

  /**
   * Prepares shadow data for a directional light (cascaded shadow maps).
   */
  private prepareDirectionalLightShadow(
    light: DirectionalLight,
    camera: { position: Vector3; viewMatrix: Matrix4; projectionMatrix: Matrix4; fov: number; aspect: number }
  ): ShadowRenderData | null {
    const cascadeCount = light.cascadeConfig.count;
    const resolution = this.getShadowResolution(light.shadowConfig.quality);

    // Calculate cascade splits
    const nearPlane = light.shadowConfig.nearPlane;
    const farPlane = light.shadowConfig.farPlane;
    const splits = light.calculateCascadeSplits(nearPlane, farPlane);

    const viewProjectionMatrices: Matrix4[] = [];
    const viewports: { x: number; y: number; width: number; height: number }[] = [];

    // Allocate shadow maps for each cascade
    for (let i = 0; i < cascadeCount; i++) {
      const allocation = this.allocateOrGetShadowMap(
        light.id,
        resolution,
        resolution,
        i
      );

      if (!allocation) {
        logger.warn(`Failed to allocate shadow map for cascade ${i} of light ${light.id}`);
        continue;
      }

      // Calculate view-projection matrix for this cascade
      const matrix = light.calculateCascadeMatrix(
        i,
        camera.viewMatrix,
        splits[i],
        splits[i + 1],
        camera.fov,
        camera.aspect
      );

      viewProjectionMatrices.push(matrix);

      // Normalized viewport coordinates
      viewports.push({
        x: allocation.x / this.config.atlasWidth,
        y: allocation.y / this.config.atlasHeight,
        width: allocation.width / this.config.atlasWidth,
        height: allocation.height / this.config.atlasHeight,
      });
    }

    if (viewProjectionMatrices.length === 0) return null;

    return {
      light,
      viewProjectionMatrices,
      viewports,
      resolution,
      cascadeSplits: splits,
    };
  }

  /**
   * Prepares shadow data for a point light (cubemap shadow).
   */
  private preparePointLightShadow(
    light: PointLight,
    camera: { position: Vector3; forward: Vector3; fov: number }
  ): ShadowRenderData | null {
    const resolution = this.getShadowResolution(light.shadowConfig.quality);

    // Determine which cubemap faces to render
    const facesToRender = light.calculateVisibleShadowFaces(
      camera.position,
      camera.forward,
      camera.fov
    );

    const viewProjectionMatrices: Matrix4[] = [];
    const viewports: { x: number; y: number; width: number; height: number }[] = [];

    // Allocate and create matrices for each face
    for (const faceIndex of facesToRender) {
      const allocation = this.allocateOrGetShadowMap(
        light.id,
        resolution,
        resolution,
        -1, // No cascade
        faceIndex
      );

      if (!allocation) continue;

      // Create view-projection matrix for this cubemap face
      const matrix = this.createCubemapFaceMatrix(
        light.position,
        faceIndex,
        light.shadowConfig.nearPlane,
        light.range
      );

      viewProjectionMatrices.push(matrix);

      viewports.push({
        x: allocation.x / this.config.atlasWidth,
        y: allocation.y / this.config.atlasHeight,
        width: allocation.width / this.config.atlasWidth,
        height: allocation.height / this.config.atlasHeight,
      });
    }

    if (viewProjectionMatrices.length === 0) return null;

    return {
      light,
      viewProjectionMatrices,
      viewports,
      resolution,
      cubemapFaces: facesToRender,
    };
  }

  /**
   * Prepares shadow data for a spot light.
   */
  private prepareSpotLightShadow(light: SpotLight): ShadowRenderData | null {
    const resolution = this.getShadowResolution(light.shadowConfig.quality);

    const allocation = this.allocateOrGetShadowMap(light.id, resolution, resolution);

    if (!allocation) {
      logger.warn(`Failed to allocate shadow map for spot light ${light.id}`);
      return null;
    }

    const viewProjectionMatrix = light.getViewProjectionMatrix();

    return {
      light,
      viewProjectionMatrices: [viewProjectionMatrix],
      viewports: [
        {
          x: allocation.x / this.config.atlasWidth,
          y: allocation.y / this.config.atlasHeight,
          width: allocation.width / this.config.atlasWidth,
          height: allocation.height / this.config.atlasHeight,
        },
      ],
      resolution,
    };
  }

  /**
   * Allocates or retrieves existing shadow map allocation.
   */
  private allocateOrGetShadowMap(
    lightId: number,
    width: number,
    height: number,
    cascadeIndex: number = -1,
    faceIndex: number = -1
  ): AtlasAllocation | null {
    const key = this.getAllocationKey(lightId, cascadeIndex, faceIndex);

    // Check if allocation already exists
    const existing = this.allocations.get(key);
    if (existing) {
      existing.lastUsedFrame = this.frameIndex;
      return existing;
    }

    // Find suitable free region
    let bestRegion = -1;
    let bestArea = Infinity;

    for (let i = 0; i < this.freeRegions.length; i++) {
      const region = this.freeRegions[i];
      if (region.width >= width && region.height >= height) {
        const area = region.width * region.height;
        if (area < bestArea) {
          bestArea = area;
          bestRegion = i;
        }
      }
    }

    if (bestRegion === -1) {
      logger.warn('Shadow atlas is full, cannot allocate more shadow maps');
      return null;
    }

    // Allocate from the best region
    const region = this.freeRegions[bestRegion];
    const allocation: AtlasAllocation = {
      lightId,
      x: region.x,
      y: region.y,
      width,
      height,
      cascadeIndex,
      faceIndex,
      lastUsedFrame: this.frameIndex,
    };

    // Split remaining space
    this.freeRegions.splice(bestRegion, 1);

    // Add remaining horizontal space
    if (region.width > width) {
      this.freeRegions.push({
        x: region.x + width,
        y: region.y,
        width: region.width - width,
        height: region.height,
      });
    }

    // Add remaining vertical space
    if (region.height > height) {
      this.freeRegions.push({
        x: region.x,
        y: region.y + height,
        width,
        height: region.height - height,
      });
    }

    this.allocations.set(key, allocation);
    return allocation;
  }

  /**
   * Evicts allocations that haven't been used recently.
   */
  private evictUnusedAllocations(): void {
    const evictedKeys: string[] = [];

    for (const [key, allocation] of this.allocations) {
      const framesSinceUse = this.frameIndex - allocation.lastUsedFrame;
      if (framesSinceUse > this.config.evictionFrames) {
        evictedKeys.push(key);

        // Return space to free regions
        this.freeRegions.push({
          x: allocation.x,
          y: allocation.y,
          width: allocation.width,
          height: allocation.height,
        });
      }
    }

    for (const key of evictedKeys) {
      this.allocations.delete(key);
    }

    // Merge adjacent free regions
    this.mergeFreeRegions();
  }

  /**
   * Merges adjacent free regions to reduce fragmentation.
   */
  private mergeFreeRegions(): void {
    // Simple merge: combine regions with same x or y coordinates
    let merged = true;
    while (merged) {
      merged = false;

      for (let i = 0; i < this.freeRegions.length; i++) {
        for (let j = i + 1; j < this.freeRegions.length; j++) {
          const a = this.freeRegions[i];
          const b = this.freeRegions[j];

          // Horizontal merge
          if (a.y === b.y && a.height === b.height) {
            if (a.x + a.width === b.x) {
              a.width += b.width;
              this.freeRegions.splice(j, 1);
              merged = true;
              break;
            } else if (b.x + b.width === a.x) {
              a.x = b.x;
              a.width += b.width;
              this.freeRegions.splice(j, 1);
              merged = true;
              break;
            }
          }

          // Vertical merge
          if (a.x === b.x && a.width === b.width) {
            if (a.y + a.height === b.y) {
              a.height += b.height;
              this.freeRegions.splice(j, 1);
              merged = true;
              break;
            } else if (b.y + b.height === a.y) {
              a.y = b.y;
              a.height += b.height;
              this.freeRegions.splice(j, 1);
              merged = true;
              break;
            }
          }
        }

        if (merged) break;
      }
    }
  }

  /**
   * Creates allocation key for map lookup.
   */
  private getAllocationKey(
    lightId: number,
    cascadeIndex: number,
    faceIndex: number
  ): string {
    return `${lightId}_${cascadeIndex}_${faceIndex}`;
  }

  /**
   * Gets shadow resolution from quality setting.
   */
  private getShadowResolution(quality: ShadowQuality): number {
    switch (quality) {
      case ShadowQuality.Low: return 512;
      case ShadowQuality.Medium: return 1024;
      case ShadowQuality.High: return 2048;
      case ShadowQuality.Ultra: return 4096;
      default: return 1024;
    }
  }

  /**
   * Creates view-projection matrix for a cubemap face.
   */
  private createCubemapFaceMatrix(
    position: Vector3,
    faceIndex: number,
    near: number,
    far: number
  ): Matrix4 {
    // Cubemap face directions and up vectors
    const faces = [
      { target: new Vector3(1, 0, 0), up: new Vector3(0, -1, 0) },   // +X
      { target: new Vector3(-1, 0, 0), up: new Vector3(0, -1, 0) },  // -X
      { target: new Vector3(0, 1, 0), up: new Vector3(0, 0, 1) },    // +Y
      { target: new Vector3(0, -1, 0), up: new Vector3(0, 0, -1) },  // -Y
      { target: new Vector3(0, 0, 1), up: new Vector3(0, -1, 0) },   // +Z
      { target: new Vector3(0, 0, -1), up: new Vector3(0, -1, 0) },  // -Z
    ];

    const face = faces[faceIndex];
    const target = position.add(face.target);

    const view = Matrix4.lookAt(position, target, face.up);
    const projection = Matrix4.perspective(Math.PI / 2, 1.0, near, far);

    return projection.multiply(view);
  }

  /**
   * Clears all allocations and resets the atlas.
   */
  clear(): void {
    this.allocations.clear();
    this.freeRegions = [
      {
        x: 0,
        y: 0,
        width: this.config.atlasWidth,
        height: this.config.atlasHeight,
      },
    ];
  }

  /**
   * Gets atlas texture ID.
   */
  getAtlasTextureId(): number | null {
    return this.atlasTextureId;
  }

  /**
   * Sets atlas texture ID.
   */
  setAtlasTextureId(id: number): void {
    this.atlasTextureId = id;
  }

  /**
   * Gets atlas utilization statistics.
   */
  getStatistics(): {
    totalAllocations: number;
    usedPixels: number;
    totalPixels: number;
    utilization: number;
  } {
    let usedPixels = 0;
    for (const allocation of this.allocations.values()) {
      usedPixels += allocation.width * allocation.height;
    }

    const totalPixels = this.config.atlasWidth * this.config.atlasHeight;

    return {
      totalAllocations: this.allocations.size,
      usedPixels,
      totalPixels,
      utilization: usedPixels / totalPixels,
    };
  }
}
