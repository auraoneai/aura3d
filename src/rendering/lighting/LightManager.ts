/**
 * @module Rendering/Lighting
 * @description
 * Central manager for all lights in the scene. Handles light collection, culling,
 * sorting, GPU buffer packing, and shadow update scheduling. Supports both forward
 * and deferred rendering pipelines.
 */

import { Vector3 } from '../../math/Vector3';
import { Matrix4 } from '../../math/Matrix4';
import { Frustum } from '../../math/Frustum';
import { Logger } from '../../core/Logger';
import { Light, LightType } from './Light';
import { DirectionalLight } from './DirectionalLight';
import { PointLight } from './PointLight';
import { SpotLight } from './SpotLight';
import { AreaLight } from './AreaLight';
import { LightProbe } from './LightProbe';
import { ShadowMapper, ShadowMapConfig } from './ShadowMapper';

const logger = Logger.create('LightManager');

/**
 * Light culling strategy.
 */
export enum CullingStrategy {
  /** No culling (all lights rendered) */
  None = 'none',
  /** Frustum culling only */
  Frustum = 'frustum',
  /** Per-tile light culling (forward+) */
  Tiled = 'tiled',
  /** Clustered light culling */
  Clustered = 'clustered',
}

/**
 * Light sorting mode.
 */
export enum SortMode {
  /** No sorting */
  None = 'none',
  /** Sort by priority */
  Priority = 'priority',
  /** Sort by distance to camera */
  Distance = 'distance',
  /** Sort by contribution (intensity * attenuation) */
  Contribution = 'contribution',
}

/**
 * Light budget configuration for performance management.
 */
export interface LightBudget {
  /** Maximum number of directional lights */
  maxDirectional: number;
  /** Maximum number of point lights */
  maxPoint: number;
  /** Maximum number of spot lights */
  maxSpot: number;
  /** Maximum number of area lights */
  maxArea: number;
  /** Maximum number of light probes */
  maxProbes: number;
  /** Maximum shadow-casting lights */
  maxShadowCasters: number;
  /** Enable budget enforcement */
  enforced: boolean;
}

/**
 * Light manager configuration.
 */
export interface LightManagerConfig {
  /** Light culling strategy */
  cullingStrategy: CullingStrategy;
  /** Light sorting mode */
  sortMode: SortMode;
  /** Light budget limits */
  budget: LightBudget;
  /** Shadow mapper configuration */
  shadowConfig: ShadowMapConfig;
  /** Enable automatic light LOD */
  enableLightLOD: boolean;
  /** Distance for light LOD transitions */
  lodDistances: number[];
  /** Enable clustered light grid */
  enableClusteredLighting: boolean;
  /** Tile size for tiled/clustered culling */
  tileSize: number;
  /** Number of depth slices for clustered lighting */
  depthSlices: number;
}

/**
 * Visible light set after culling.
 */
export interface VisibleLights {
  /** All visible lights */
  all: Light[];
  /** Visible directional lights */
  directional: DirectionalLight[];
  /** Visible point lights */
  point: PointLight[];
  /** Visible spot lights */
  spot: SpotLight[];
  /** Visible area lights */
  area: AreaLight[];
  /** Visible light probes */
  probes: LightProbe[];
  /** Lights that cast shadows */
  shadowCasters: Light[];
}

/**
 * GPU light buffer layout.
 */
export interface GPULightBuffer {
  /** Light count by type */
  counts: {
    directional: number;
    point: number;
    spot: number;
    area: number;
    probes: number;
  };
  /** Packed light data buffer */
  data: Float32Array;
  /** Buffer byte size */
  byteSize: number;
}

/**
 * Light manager class for centralized light management.
 *
 * The LightManager is responsible for:
 * - Collecting all lights in the scene
 * - Culling lights based on visibility
 * - Sorting lights for optimal rendering
 * - Packing light data into GPU buffers
 * - Managing shadow updates
 * - Enforcing performance budgets
 * - Supporting tiled/clustered lighting
 *
 * @example
 * ```typescript
 * const lightManager = new LightManager({
 *   cullingStrategy: CullingStrategy.Clustered,
 *   sortMode: SortMode.Contribution,
 *   budget: {
 *     maxDirectional: 4,
 *     maxPoint: 64,
 *     maxSpot: 32,
 *     maxArea: 16,
 *     maxProbes: 8,
 *     maxShadowCasters: 8,
 *     enforced: true,
 *   },
 *   shadowConfig: {
 *     atlasWidth: 4096,
 *     atlasHeight: 4096,
 *     maxShadowMaps: 32,
 *   },
 * });
 *
 * // Each frame
 * const visibleLights = lightManager.cullLights(lights, camera);
 * const lightBuffer = lightManager.packLightData(visibleLights);
 * const shadowData = lightManager.prepareShadows(visibleLights, camera);
 * ```
 */
export class LightManager {
  /**
   * Manager configuration.
   */
  readonly config: LightManagerConfig;

  /**
   * Shadow mapper instance.
   */
  readonly shadowMapper: ShadowMapper;

  /**
   * All registered lights.
   */
  private lights: Set<Light>;

  /**
   * Current frame index.
   */
  private frameIndex: number;

  /**
   * Cached frustum for culling.
   */
  private cachedFrustum: Frustum | null;

  /**
   * Creates a new LightManager instance.
   *
   * @param config - Manager configuration
   *
   * @example
   * ```typescript
   * const manager = new LightManager({
   *   cullingStrategy: CullingStrategy.Frustum,
   *   sortMode: SortMode.Priority,
   *   budget: {
   *     maxDirectional: 2,
   *     maxPoint: 32,
   *     maxSpot: 16,
   *     maxArea: 8,
   *     maxProbes: 4,
   *     maxShadowCasters: 4,
   *     enforced: false,
   *   },
   * });
   * ```
   */
  constructor(config: Partial<LightManagerConfig> = {}) {
    this.config = {
      cullingStrategy: config.cullingStrategy || CullingStrategy.Frustum,
      sortMode: config.sortMode || SortMode.Priority,
      budget: config.budget || {
        maxDirectional: 4,
        maxPoint: 64,
        maxSpot: 32,
        maxArea: 16,
        maxProbes: 8,
        maxShadowCasters: 8,
        enforced: false,
      },
      shadowConfig: config.shadowConfig || {
        atlasWidth: 4096,
        atlasHeight: 4096,
        maxShadowMaps: 32,
        temporalStabilization: true,
        cacheShadowMaps: true,
        evictionFrames: 60,
        defaultQuality: 'medium' as any,
        defaultFilter: 'pcf' as any,
      },
      enableLightLOD: config.enableLightLOD ?? false,
      lodDistances: config.lodDistances || [50, 100, 200],
      enableClusteredLighting: config.enableClusteredLighting ?? false,
      tileSize: config.tileSize || 16,
      depthSlices: config.depthSlices || 16,
    };

    this.shadowMapper = new ShadowMapper(this.config.shadowConfig);
    this.lights = new Set();
    this.frameIndex = 0;
    this.cachedFrustum = null;
  }

  /**
   * Adds a light to the manager.
   *
   * @param light - Light to add
   *
   * @example
   * ```typescript
   * const sun = new DirectionalLight();
   * manager.addLight(sun);
   * ```
   */
  addLight(light: Light): void {
    this.lights.add(light);
  }

  /**
   * Removes a light from the manager.
   *
   * @param light - Light to remove
   *
   * @example
   * ```typescript
   * manager.removeLight(sun);
   * ```
   */
  removeLight(light: Light): void {
    this.lights.delete(light);
  }

  /**
   * Clears all lights from the manager.
   */
  clearLights(): void {
    this.lights.clear();
  }

  /**
   * Updates all lights.
   *
   * @param deltaTime - Time since last update in seconds
   *
   * @example
   * ```typescript
   * manager.update(Time.deltaTime);
   * ```
   */
  update(deltaTime: number): void {
    for (const light of this.lights) {
      if (light.enabled) {
        light.update(deltaTime);
      }
    }
  }

  /**
   * Culls lights based on camera frustum and configuration.
   *
   * @param camera - Camera for culling
   * @returns Visible lights after culling
   *
   * @example
   * ```typescript
   * const visible = manager.cullLights(camera);
   * console.log(`Visible: ${visible.all.length} lights`);
   * ```
   */
  cullLights(camera: {
    position: Vector3;
    viewMatrix: Matrix4;
    projectionMatrix: Matrix4;
    fov: number;
    aspect: number;
    near: number;
    far: number;
  }): VisibleLights {
    const visible: VisibleLights = {
      all: [],
      directional: [],
      point: [],
      spot: [],
      area: [],
      probes: [],
      shadowCasters: [],
    };

    // Build frustum for culling
    const frustum = this.getFrustum(camera);

    // Process each light
    for (const light of this.lights) {
      if (!light.enabled) continue;

      // Frustum culling
      if (this.config.cullingStrategy !== CullingStrategy.None) {
        if (!this.isLightVisible(light, frustum)) {
          continue;
        }
      }

      // Add to visible set
      visible.all.push(light);

      // Categorize by type
      if (light instanceof DirectionalLight) {
        visible.directional.push(light);
      } else if (light instanceof PointLight) {
        visible.point.push(light);
      } else if (light instanceof SpotLight) {
        visible.spot.push(light);
      } else if (light instanceof AreaLight) {
        visible.area.push(light);
      } else if (light instanceof LightProbe) {
        visible.probes.push(light);
      }

      // Track shadow casters
      if (light.castsShadows()) {
        visible.shadowCasters.push(light);
      }
    }

    // Apply budget limits
    if (this.config.budget.enforced) {
      this.enforceBudget(visible, camera.position);
    }

    // Sort lights
    this.sortLights(visible, camera.position);

    return visible;
  }

  /**
   * Checks if a light is visible in the frustum.
   */
  private isLightVisible(light: Light, frustum: Frustum): boolean {
    // Directional lights always visible
    if (light instanceof DirectionalLight) {
      return true;
    }

    const bounds = light.getBoundingVolume();

    if (bounds instanceof Box3) {
      return frustum.intersectsBox(bounds);
    } else {
      return frustum.intersectsSphere(bounds);
    }
  }

  /**
   * Gets or creates frustum for culling.
   */
  private getFrustum(camera: {
    viewMatrix: Matrix4;
    projectionMatrix: Matrix4;
  }): Frustum {
    if (!this.cachedFrustum) {
      this.cachedFrustum = new Frustum();
    }

    const viewProj = camera.projectionMatrix.multiply(camera.viewMatrix);
    this.cachedFrustum.setFromMatrix(viewProj);

    return this.cachedFrustum;
  }

  /**
   * Enforces budget limits by removing lowest priority lights.
   */
  private enforceBudget(visible: VisibleLights, cameraPosition: Vector3): void {
    const budget = this.config.budget;

    // Helper to trim array to budget
    const trimToBudget = (lights: Light[], max: number) => {
      if (lights.length <= max) return lights;

      // Sort by priority (descending)
      lights.sort((a, b) => b.priority - a.priority);

      return lights.slice(0, max);
    };

    visible.directional = trimToBudget(visible.directional, budget.maxDirectional) as DirectionalLight[];
    visible.point = trimToBudget(visible.point, budget.maxPoint) as PointLight[];
    visible.spot = trimToBudget(visible.spot, budget.maxSpot) as SpotLight[];
    visible.area = trimToBudget(visible.area, budget.maxArea) as AreaLight[];
    visible.probes = trimToBudget(visible.probes, budget.maxProbes) as LightProbe[];

    // Rebuild all array
    visible.all = [
      ...visible.directional,
      ...visible.point,
      ...visible.spot,
      ...visible.area,
      ...visible.probes,
    ];

    // Limit shadow casters
    visible.shadowCasters = trimToBudget(
      visible.shadowCasters,
      budget.maxShadowCasters
    );
  }

  /**
   * Sorts lights based on configuration.
   */
  private sortLights(visible: VisibleLights, cameraPosition: Vector3): void {
    if (this.config.sortMode === SortMode.None) return;

    const sortFn = (a: Light, b: Light): number => {
      switch (this.config.sortMode) {
        case SortMode.Priority:
          return b.priority - a.priority;

        case SortMode.Distance: {
          const distA = this.getLightDistance(a, cameraPosition);
          const distB = this.getLightDistance(b, cameraPosition);
          return distA - distB;
        }

        case SortMode.Contribution: {
          const contribA = this.estimateContribution(a, cameraPosition);
          const contribB = this.estimateContribution(b, cameraPosition);
          return contribB - contribA;
        }

        default:
          return 0;
      }
    };

    visible.all.sort(sortFn);
    visible.point.sort(sortFn);
    visible.spot.sort(sortFn);
    visible.area.sort(sortFn);
    visible.shadowCasters.sort(sortFn);
  }

  /**
   * Gets distance from light to camera.
   */
  private getLightDistance(light: Light, cameraPosition: Vector3): number {
    if (light instanceof DirectionalLight) {
      return 0; // Always closest
    } else if (light instanceof PointLight || light instanceof SpotLight || light instanceof AreaLight || light instanceof LightProbe) {
      return (light as any).position.sub(cameraPosition).length();
    }
    return Infinity;
  }

  /**
   * Estimates light contribution at camera position.
   */
  private estimateContribution(light: Light, cameraPosition: Vector3): number {
    const intensity = light.getEffectiveIntensity();

    if (light instanceof DirectionalLight) {
      return intensity * 1000; // High priority
    } else if (light instanceof PointLight) {
      const distance = light.position.sub(cameraPosition).length();
      return intensity * light.calculateAttenuation(distance);
    } else if (light instanceof SpotLight) {
      const distance = light.position.sub(cameraPosition).length();
      return intensity * light.calculateDistanceAttenuation(distance);
    } else if (light instanceof AreaLight) {
      return intensity * light.calculateSolidAngle(cameraPosition);
    }

    return 0;
  }

  /**
   * Packs visible lights into a GPU buffer.
   *
   * @param visible - Visible lights to pack
   * @returns GPU light buffer
   *
   * @example
   * ```typescript
   * const buffer = manager.packLightData(visibleLights);
   * device.updateBuffer(lightBuffer, buffer.data);
   * ```
   */
  packLightData(visible: VisibleLights): GPULightBuffer {
    // Calculate buffer size (conservative estimate)
    const maxLightSize = 32; // floats per light
    const totalLights = visible.all.length;
    const bufferSize = totalLights * maxLightSize + 16; // Extra space for counts

    const data = new Float32Array(bufferSize);
    let offset = 0;

    // Pack light counts (first 16 floats)
    data[offset++] = visible.directional.length;
    data[offset++] = visible.point.length;
    data[offset++] = visible.spot.length;
    data[offset++] = visible.area.length;
    data[offset++] = visible.probes.length;
    data[offset++] = visible.shadowCasters.length;
    offset = 16; // Skip to aligned position

    // Pack each light type
    for (const light of visible.directional) {
      offset = light.packGPUData(data, offset);
    }

    for (const light of visible.point) {
      offset = light.packGPUData(data, offset);
    }

    for (const light of visible.spot) {
      offset = light.packGPUData(data, offset);
    }

    for (const light of visible.area) {
      offset = light.packGPUData(data, offset);
    }

    for (const light of visible.probes) {
      offset = light.packGPUData(data, offset);
    }

    return {
      counts: {
        directional: visible.directional.length,
        point: visible.point.length,
        spot: visible.spot.length,
        area: visible.area.length,
        probes: visible.probes.length,
      },
      data: data.slice(0, offset),
      byteSize: offset * 4,
    };
  }

  /**
   * Prepares shadow data for visible lights.
   *
   * @param visible - Visible lights
   * @param camera - Camera for shadow calculations
   * @returns Shadow render data
   *
   * @example
   * ```typescript
   * const shadows = manager.prepareShadows(visibleLights, camera);
   * for (const shadow of shadows) {
   *   renderShadowMap(shadow);
   * }
   * ```
   */
  prepareShadows(
    visible: VisibleLights,
    camera: {
      position: Vector3;
      viewMatrix: Matrix4;
      projectionMatrix: Matrix4;
      fov: number;
      aspect: number;
      forward: Vector3;
    }
  ) {
    return this.shadowMapper.prepareShadows(
      visible.shadowCasters,
      camera,
      this.frameIndex
    );
  }

  /**
   * Advances to the next frame.
   */
  nextFrame(): void {
    this.frameIndex++;
  }

  /**
   * Gets manager statistics.
   */
  getStatistics() {
    return {
      totalLights: this.lights.size,
      frameIndex: this.frameIndex,
      shadowAtlas: this.shadowMapper.getStatistics(),
    };
  }

  /**
   * Gets all lights managed by this manager.
   */
  getLights(): Light[] {
    return Array.from(this.lights);
  }

  /**
   * Gets lights by type.
   */
  getLightsByType(type: LightType): Light[] {
    return Array.from(this.lights).filter(light => light.type === type);
  }
}
