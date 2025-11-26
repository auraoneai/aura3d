/**
 * Visibility set containing culled object indices and rendering lists.
 * Results of frustum culling, LOD selection, and render list sorting.
 * @module VisibilitySet
 */

import { Vector3 } from '../../math/Vector3';

/**
 * LOD (Level of Detail) level information.
 */
export interface LODLevel {
  /**
   * Object/entity index.
   */
  objectIndex: number;

  /**
   * Selected LOD level (0 = highest quality).
   */
  lodLevel: number;

  /**
   * Distance from camera.
   */
  distance: number;

  /**
   * Screen coverage (0-1, where 1 = full screen).
   */
  screenCoverage: number;
}

/**
 * Render item with sorting key.
 */
export interface RenderItem {
  /**
   * Object/entity index.
   */
  objectIndex: number;

  /**
   * Distance from camera (for sorting).
   */
  distance: number;

  /**
   * Material index.
   */
  materialIndex: number;

  /**
   * Mesh index.
   */
  meshIndex: number;

  /**
   * Layer mask bit.
   */
  layer: number;

  /**
   * Sorting key (for state sorting).
   */
  sortKey: bigint;
}

/**
 * Shadow caster information.
 */
export interface ShadowCaster {
  /**
   * Object/entity index.
   */
  objectIndex: number;

  /**
   * Distance from light.
   */
  distanceFromLight: number;

  /**
   * Whether this caster affects cascade 0.
   */
  cascade0: boolean;

  /**
   * Whether this caster affects cascade 1.
   */
  cascade1: boolean;

  /**
   * Whether this caster affects cascade 2.
   */
  cascade2: boolean;

  /**
   * Whether this caster affects cascade 3.
   */
  cascade3: boolean;
}

/**
 * Decal information for deferred decals.
 */
export interface DecalInfo {
  /**
   * Decal object index.
   */
  objectIndex: number;

  /**
   * Distance from camera.
   */
  distance: number;

  /**
   * Material index.
   */
  materialIndex: number;

  /**
   * Whether decal affects normals.
   */
  affectsNormals: boolean;

  /**
   * Whether decal affects roughness.
   */
  affectsRoughness: boolean;
}

/**
 * VisibilitySet containing results of frustum culling and render list building.
 * Generated per-view and used by the renderer to determine what to draw.
 *
 * @example
 * ```typescript
 * const visSet = new VisibilitySet();
 *
 * // Add visible objects
 * visSet.addOpaqueObject(entityId, distance, materialId, meshId, layer);
 * visSet.addTransparentObject(entityId, distance, materialId, meshId, layer);
 *
 * // Add shadow casters
 * visSet.addShadowCaster(entityId, distanceFromLight, true, true, false, false);
 *
 * // Finalize (sorts lists)
 * visSet.finalize(cameraPosition);
 *
 * // Use in renderer
 * for (const item of visSet.opaqueObjects) {
 *   renderObject(item.objectIndex, item.materialIndex, item.meshIndex);
 * }
 * ```
 */
export class VisibilitySet {
  /**
   * Opaque object render list (front-to-back sorted after finalize).
   */
  readonly opaqueObjects: RenderItem[] = [];

  /**
   * Transparent object render list (back-to-front sorted after finalize).
   */
  readonly transparentObjects: RenderItem[] = [];

  /**
   * Shadow caster list.
   */
  readonly shadowCasters: ShadowCaster[] = [];

  /**
   * Decal list (back-to-front sorted after finalize).
   */
  readonly decals: DecalInfo[] = [];

  /**
   * LOD selection results.
   */
  readonly lodLevels: Map<number, LODLevel> = new Map();

  /**
   * Light indices visible in this view.
   */
  readonly visibleLights: Set<number> = new Set();

  /**
   * Reflection probe indices visible in this view.
   */
  readonly visibleProbes: Set<number> = new Set();

  /**
   * Total number of visible objects (opaque + transparent).
   */
  get totalVisibleObjects(): number {
    return this.opaqueObjects.length + this.transparentObjects.length;
  }

  /**
   * Whether the visibility set has been finalized (sorted).
   */
  private _finalized: boolean = false;

  /**
   * Creates a new VisibilitySet.
   *
   * @example
   * ```typescript
   * const visSet = new VisibilitySet();
   * ```
   */
  constructor() {}

  /**
   * Adds an opaque object to the visibility set.
   *
   * @param objectIndex - Object/entity index
   * @param distance - Distance from camera
   * @param materialIndex - Material index
   * @param meshIndex - Mesh index
   * @param layer - Layer number (0-31)
   *
   * @example
   * ```typescript
   * visSet.addOpaqueObject(entityId, 10.5, matId, meshId, 0);
   * ```
   */
  addOpaqueObject(
    objectIndex: number,
    distance: number,
    materialIndex: number,
    meshIndex: number,
    layer: number
  ): void {
    const sortKey = this._generateSortKey(materialIndex, meshIndex, layer, false);

    this.opaqueObjects.push({
      objectIndex,
      distance,
      materialIndex,
      meshIndex,
      layer,
      sortKey,
    });

    this._finalized = false;
  }

  /**
   * Adds a transparent object to the visibility set.
   *
   * @param objectIndex - Object/entity index
   * @param distance - Distance from camera
   * @param materialIndex - Material index
   * @param meshIndex - Mesh index
   * @param layer - Layer number (0-31)
   *
   * @example
   * ```typescript
   * visSet.addTransparentObject(entityId, 10.5, matId, meshId, 0);
   * ```
   */
  addTransparentObject(
    objectIndex: number,
    distance: number,
    materialIndex: number,
    meshIndex: number,
    layer: number
  ): void {
    const sortKey = this._generateSortKey(materialIndex, meshIndex, layer, true);

    this.transparentObjects.push({
      objectIndex,
      distance,
      materialIndex,
      meshIndex,
      layer,
      sortKey,
    });

    this._finalized = false;
  }

  /**
   * Adds a shadow caster to the visibility set.
   *
   * @param objectIndex - Object/entity index
   * @param distanceFromLight - Distance from light source
   * @param cascade0 - Whether visible in cascade 0
   * @param cascade1 - Whether visible in cascade 1
   * @param cascade2 - Whether visible in cascade 2
   * @param cascade3 - Whether visible in cascade 3
   *
   * @example
   * ```typescript
   * visSet.addShadowCaster(entityId, 15.2, true, true, false, false);
   * ```
   */
  addShadowCaster(
    objectIndex: number,
    distanceFromLight: number,
    cascade0: boolean = true,
    cascade1: boolean = false,
    cascade2: boolean = false,
    cascade3: boolean = false
  ): void {
    this.shadowCasters.push({
      objectIndex,
      distanceFromLight,
      cascade0,
      cascade1,
      cascade2,
      cascade3,
    });
  }

  /**
   * Adds a decal to the visibility set.
   *
   * @param objectIndex - Decal object index
   * @param distance - Distance from camera
   * @param materialIndex - Material index
   * @param affectsNormals - Whether decal modifies normals
   * @param affectsRoughness - Whether decal modifies roughness
   *
   * @example
   * ```typescript
   * visSet.addDecal(decalId, 5.3, matId, true, false);
   * ```
   */
  addDecal(
    objectIndex: number,
    distance: number,
    materialIndex: number,
    affectsNormals: boolean = true,
    affectsRoughness: boolean = false
  ): void {
    this.decals.push({
      objectIndex,
      distance,
      materialIndex,
      affectsNormals,
      affectsRoughness,
    });

    this._finalized = false;
  }

  /**
   * Sets LOD level for an object.
   *
   * @param objectIndex - Object/entity index
   * @param lodLevel - Selected LOD level (0 = highest quality)
   * @param distance - Distance from camera
   * @param screenCoverage - Screen coverage ratio (0-1)
   *
   * @example
   * ```typescript
   * visSet.setLODLevel(entityId, 1, 25.5, 0.15);
   * ```
   */
  setLODLevel(
    objectIndex: number,
    lodLevel: number,
    distance: number,
    screenCoverage: number
  ): void {
    this.lodLevels.set(objectIndex, {
      objectIndex,
      lodLevel,
      distance,
      screenCoverage,
    });
  }

  /**
   * Adds a visible light index.
   *
   * @param lightIndex - Light index
   *
   * @example
   * ```typescript
   * visSet.addVisibleLight(lightId);
   * ```
   */
  addVisibleLight(lightIndex: number): void {
    this.visibleLights.add(lightIndex);
  }

  /**
   * Adds a visible reflection probe index.
   *
   * @param probeIndex - Probe index
   *
   * @example
   * ```typescript
   * visSet.addVisibleProbe(probeId);
   * ```
   */
  addVisibleProbe(probeIndex: number): void {
    this.visibleProbes.add(probeIndex);
  }

  /**
   * Finalizes the visibility set by sorting all lists.
   * Must be called before rendering.
   *
   * @param cameraPosition - Camera position for distance-based sorting
   *
   * @example
   * ```typescript
   * visSet.finalize(camera.transform.worldPosition);
   * ```
   */
  finalize(cameraPosition: Vector3): void {
    if (this._finalized) return;

    // Sort opaque objects front-to-back (minimize overdraw)
    // Primary: material (state changes), Secondary: distance (early-Z)
    this.opaqueObjects.sort((a, b) => {
      // Compare sort keys first (material batching)
      if (a.sortKey < b.sortKey) return -1;
      if (a.sortKey > b.sortKey) return 1;

      // Then by distance (front-to-back)
      return a.distance - b.distance;
    });

    // Sort transparent objects back-to-front (correct alpha blending)
    this.transparentObjects.sort((a, b) => {
      return b.distance - a.distance;
    });

    // Sort decals back-to-front
    this.decals.sort((a, b) => {
      return b.distance - a.distance;
    });

    // Sort shadow casters by distance from light (optional optimization)
    this.shadowCasters.sort((a, b) => {
      return a.distanceFromLight - b.distanceFromLight;
    });

    this._finalized = true;
  }

  /**
   * Clears all lists and resets the visibility set.
   *
   * @example
   * ```typescript
   * visSet.clear();
   * ```
   */
  clear(): void {
    this.opaqueObjects.length = 0;
    this.transparentObjects.length = 0;
    this.shadowCasters.length = 0;
    this.decals.length = 0;
    this.lodLevels.clear();
    this.visibleLights.clear();
    this.visibleProbes.clear();
    this._finalized = false;
  }

  /**
   * Gets statistics about the visibility set.
   * @returns Statistics object
   *
   * @example
   * ```typescript
   * const stats = visSet.getStatistics();
   * console.log(`Visible objects: ${stats.totalObjects}`);
   * ```
   */
  getStatistics(): {
    opaqueCount: number;
    transparentCount: number;
    totalObjects: number;
    shadowCasters: number;
    decals: number;
    lights: number;
    probes: number;
  } {
    return {
      opaqueCount: this.opaqueObjects.length,
      transparentCount: this.transparentObjects.length,
      totalObjects: this.totalVisibleObjects,
      shadowCasters: this.shadowCasters.length,
      decals: this.decals.length,
      lights: this.visibleLights.size,
      probes: this.visibleProbes.size,
    };
  }

  /**
   * Generates a sort key for state sorting.
   * Key encoding (64-bit):
   * - Bits 0-15: Mesh index (65536 meshes)
   * - Bits 16-31: Material index (65536 materials)
   * - Bits 32-36: Layer (32 layers)
   * - Bit 37: Transparent flag
   * - Bits 38-63: Reserved
   *
   * @private
   */
  private _generateSortKey(
    materialIndex: number,
    meshIndex: number,
    layer: number,
    transparent: boolean
  ): bigint {
    let key = BigInt(0);

    key |= BigInt(meshIndex & 0xFFFF);
    key |= BigInt((materialIndex & 0xFFFF) << 16);
    key |= BigInt((layer & 0x1F) << 32);
    key |= BigInt((transparent ? 1 : 0) << 37);

    return key;
  }

  /**
   * Gets objects by layer.
   *
   * @param layer - Layer number (0-31)
   * @returns Array of object indices in layer
   *
   * @example
   * ```typescript
   * const uiObjects = visSet.getObjectsByLayer(5);
   * ```
   */
  getObjectsByLayer(layer: number): number[] {
    const objects: number[] = [];

    for (const item of this.opaqueObjects) {
      if (item.layer === layer) {
        objects.push(item.objectIndex);
      }
    }

    for (const item of this.transparentObjects) {
      if (item.layer === layer) {
        objects.push(item.objectIndex);
      }
    }

    return objects;
  }

  /**
   * Gets objects by material.
   *
   * @param materialIndex - Material index
   * @returns Array of object indices using material
   *
   * @example
   * ```typescript
   * const metalObjects = visSet.getObjectsByMaterial(metalMatId);
   * ```
   */
  getObjectsByMaterial(materialIndex: number): number[] {
    const objects: number[] = [];

    for (const item of this.opaqueObjects) {
      if (item.materialIndex === materialIndex) {
        objects.push(item.objectIndex);
      }
    }

    for (const item of this.transparentObjects) {
      if (item.materialIndex === materialIndex) {
        objects.push(item.objectIndex);
      }
    }

    return objects;
  }

  /**
   * Creates a copy of this visibility set.
   * @returns New VisibilitySet instance
   *
   * @example
   * ```typescript
   * const visSet2 = visSet.clone();
   * ```
   */
  clone(): VisibilitySet {
    const visSet = new VisibilitySet();

    visSet.opaqueObjects.push(...this.opaqueObjects);
    visSet.transparentObjects.push(...this.transparentObjects);
    visSet.shadowCasters.push(...this.shadowCasters);
    visSet.decals.push(...this.decals);

    for (const [key, value] of this.lodLevels) {
      visSet.lodLevels.set(key, { ...value });
    }

    for (const light of this.visibleLights) {
      visSet.visibleLights.add(light);
    }

    for (const probe of this.visibleProbes) {
      visSet.visibleProbes.add(probe);
    }

    visSet._finalized = this._finalized;

    return visSet;
  }
}
