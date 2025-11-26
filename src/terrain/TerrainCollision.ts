/**
 * Terrain collision detection and raycasting.
 * Provides height queries and ray-terrain intersection tests.
 * @module TerrainCollision
 */

import { Vector2 } from '../math/Vector2';
import { Vector3 } from '../math/Vector3';
import { Ray } from '../math/Ray';
import { Box3 } from '../math/Box3';
import { Heightmap } from './Heightmap';
import { Logger } from '../core/Logger';

const logger = Logger.create('TerrainCollision');

/**
 * Ray-terrain intersection result.
 */
export interface TerrainIntersection {
  /** Intersection point in world space */
  point: Vector3;
  /** Terrain normal at intersection */
  normal: Vector3;
  /** Distance from ray origin */
  distance: number;
  /** UV coordinates on terrain (0-1) */
  uv: Vector2;
  /** Hit detected */
  hit: boolean;
}

/**
 * Terrain collision configuration.
 */
export interface TerrainCollisionConfig {
  /** Heightmap for collision */
  heightmap: Heightmap;
  /** Terrain size in world units */
  terrainSize: Vector2;
  /** Terrain world position (min corner) */
  terrainPosition: Vector3;
  /** Height scale factor */
  heightScale: number;
}

/**
 * Terrain collision system for height queries and raycasting.
 * Provides efficient collision detection against terrain heightmaps.
 *
 * @example
 * ```typescript
 * const collision = new TerrainCollision({
 *   heightmap: heightmap,
 *   terrainSize: new Vector2(1000, 1000),
 *   terrainPosition: new Vector3(0, 0, 0),
 *   heightScale: 1.0
 * });
 *
 * // Query height at world position
 * const height = collision.getHeight(500, 500);
 *
 * // Get normal at position
 * const normal = collision.getNormal(500, 500);
 *
 * // Raycast against terrain
 * const ray = new Ray(new Vector3(500, 100, 500), new Vector3(0, -1, 0));
 * const intersection = collision.raycast(ray);
 * if (intersection.hit) {
 *   console.log('Hit at:', intersection.point);
 * }
 * ```
 */
export class TerrainCollision {
  /** Heightmap reference */
  private _heightmap: Heightmap;
  /** Terrain size */
  private _terrainSize: Vector2;
  /** Terrain position */
  private _terrainPosition: Vector3;
  /** Height scale */
  private _heightScale: number;
  /** Terrain bounds */
  private _bounds: Box3;

  /**
   * Creates a new terrain collision system.
   *
   * @param config - Collision configuration
   */
  constructor(config: TerrainCollisionConfig) {
    this._heightmap = config.heightmap;
    this._terrainSize = config.terrainSize.clone();
    this._terrainPosition = config.terrainPosition.clone();
    this._heightScale = config.heightScale;
    this._bounds = new Box3();

    this._updateBounds();
  }

  /**
   * Gets the terrain bounds.
   * @returns Bounding box
   */
  get bounds(): Box3 {
    return this._bounds;
  }

  /**
   * Updates configuration.
   *
   * @param config - New configuration
   */
  updateConfig(config: Partial<TerrainCollisionConfig>): void {
    if (config.heightmap) this._heightmap = config.heightmap;
    if (config.terrainSize) this._terrainSize = config.terrainSize.clone();
    if (config.terrainPosition) this._terrainPosition = config.terrainPosition.clone();
    if (config.heightScale !== undefined) this._heightScale = config.heightScale;

    this._updateBounds();
  }

  /**
   * Gets the height at a world position.
   *
   * @param worldX - World X coordinate
   * @param worldZ - World Z coordinate
   * @returns Height in world units
   *
   * @example
   * ```typescript
   * const height = collision.getHeight(100, 200);
   * ```
   */
  getHeight(worldX: number, worldZ: number): number {
    // Convert to local coordinates
    const localX = worldX - this._terrainPosition.x;
    const localZ = worldZ - this._terrainPosition.z;

    // Check bounds
    if (localX < 0 || localX > this._terrainSize.x || localZ < 0 || localZ > this._terrainSize.y) {
      return this._terrainPosition.y;
    }

    // Sample heightmap
    const height = this._heightmap.getHeightWorld(localX, localZ, this._terrainSize);
    return this._terrainPosition.y + height * this._heightScale;
  }

  /**
   * Gets the normal at a world position.
   *
   * @param worldX - World X coordinate
   * @param worldZ - World Z coordinate
   * @returns Normal vector
   *
   * @example
   * ```typescript
   * const normal = collision.getNormal(100, 200);
   * ```
   */
  getNormal(worldX: number, worldZ: number): Vector3 {
    // Convert to local coordinates
    const localX = worldX - this._terrainPosition.x;
    const localZ = worldZ - this._terrainPosition.z;

    // Check bounds
    if (localX < 0 || localX > this._terrainSize.x || localZ < 0 || localZ > this._terrainSize.y) {
      return Vector3.up();
    }

    // Convert to heightmap coordinates
    const u = (localX / this._terrainSize.x) * (this._heightmap.width - 1);
    const v = (localZ / this._terrainSize.y) * (this._heightmap.height - 1);

    return this._heightmap.getNormal(u, v, this._heightScale);
  }

  /**
   * Raycasts against the terrain.
   *
   * @param ray - Ray to test
   * @param maxDistance - Maximum ray distance
   * @returns Intersection result
   *
   * @example
   * ```typescript
   * const ray = new Ray(
   *   new Vector3(500, 100, 500),
   *   new Vector3(0, -1, 0)
   * );
   * const result = collision.raycast(ray, 1000);
   * if (result.hit) {
   *   console.log('Hit terrain at', result.point);
   * }
   * ```
   */
  raycast(ray: Ray, maxDistance: number = Infinity): TerrainIntersection {
    const result: TerrainIntersection = {
      point: new Vector3(),
      normal: Vector3.up(),
      distance: Infinity,
      uv: new Vector2(),
      hit: false,
    };

    // Test against terrain bounds first
    const boundsHit = ray.intersectsBox(this._bounds);
    if (!boundsHit) {
      return result;
    }

    // Use DDA-like algorithm to march along the ray
    const stepSize = Math.min(this._terrainSize.x, this._terrainSize.y) / this._heightmap.width;
    const maxSteps = Math.ceil(maxDistance / stepSize);

    for (let step = 0; step < maxSteps; step++) {
      const t = step * stepSize;
      const point = ray.at(t);

      // Check if still in terrain bounds
      const localX = point.x - this._terrainPosition.x;
      const localZ = point.z - this._terrainPosition.z;

      if (localX < 0 || localX > this._terrainSize.x || localZ < 0 || localZ > this._terrainSize.y) {
        if (step > 0) break; // Left terrain bounds
        continue; // Not yet in terrain bounds
      }

      // Get terrain height at this position
      const terrainHeight = this.getHeight(point.x, point.z);

      // Check if ray point is below terrain
      if (point.y <= terrainHeight) {
        // Refine intersection point using bisection
        const prevPoint = ray.at((step - 1) * stepSize);
        const refinedPoint = this._refineIntersection(ray, prevPoint, point);

        result.point = refinedPoint;
        result.normal = this.getNormal(refinedPoint.x, refinedPoint.z);
        result.distance = ray.origin.distanceTo(refinedPoint);

        // Calculate UV
        const u = (refinedPoint.x - this._terrainPosition.x) / this._terrainSize.x;
        const v = (refinedPoint.z - this._terrainPosition.z) / this._terrainSize.y;
        result.uv.set(u, v);

        result.hit = true;
        break;
      }
    }

    return result;
  }

  /**
   * Tests if a point is on or below the terrain.
   *
   * @param point - Point to test
   * @returns True if on or below terrain
   */
  containsPoint(point: Vector3): boolean {
    const localX = point.x - this._terrainPosition.x;
    const localZ = point.z - this._terrainPosition.z;

    if (localX < 0 || localX > this._terrainSize.x || localZ < 0 || localZ > this._terrainSize.y) {
      return false;
    }

    const terrainHeight = this.getHeight(point.x, point.z);
    return point.y <= terrainHeight;
  }

  /**
   * Clamps a point to the terrain surface.
   *
   * @param point - Point to clamp
   * @param offset - Height offset above terrain
   * @returns Clamped point
   *
   * @example
   * ```typescript
   * const position = new Vector3(100, 50, 200);
   * const clamped = collision.clampToTerrain(position, 2); // 2 units above terrain
   * ```
   */
  clampToTerrain(point: Vector3, offset: number = 0): Vector3 {
    const height = this.getHeight(point.x, point.z);
    return new Vector3(point.x, height + offset, point.z);
  }

  /**
   * Aligns a transform to the terrain surface.
   *
   * @param position - Position to align
   * @param up - Current up vector
   * @param offset - Height offset
   * @returns Aligned position and normal
   */
  alignToTerrain(
    position: Vector3,
    up: Vector3 = Vector3.up(),
    offset: number = 0
  ): { position: Vector3; normal: Vector3 } {
    const height = this.getHeight(position.x, position.z);
    const normal = this.getNormal(position.x, position.z);
    const alignedPos = new Vector3(position.x, height + offset, position.z);

    return { position: alignedPos, normal };
  }

  /**
   * Gets the slope angle at a position in degrees.
   *
   * @param worldX - World X coordinate
   * @param worldZ - World Z coordinate
   * @returns Slope angle in degrees
   */
  getSlope(worldX: number, worldZ: number): number {
    const normal = this.getNormal(worldX, worldZ);
    return Math.acos(normal.y) * (180 / Math.PI);
  }

  /**
   * Tests if a sphere intersects the terrain.
   *
   * @param center - Sphere center
   * @param radius - Sphere radius
   * @returns True if intersecting
   */
  intersectsSphere(center: Vector3, radius: number): boolean {
    const height = this.getHeight(center.x, center.z);
    const distance = center.y - height;
    return distance <= radius;
  }

  /**
   * Refines ray-terrain intersection using bisection.
   * @private
   */
  private _refineIntersection(ray: Ray, p0: Vector3, p1: Vector3, iterations: number = 4): Vector3 {
    let t0 = ray.origin.distanceTo(p0);
    let t1 = ray.origin.distanceTo(p1);

    for (let i = 0; i < iterations; i++) {
      const tMid = (t0 + t1) / 2;
      const pMid = ray.at(tMid);
      const terrainHeight = this.getHeight(pMid.x, pMid.z);

      if (pMid.y > terrainHeight) {
        t0 = tMid;
      } else {
        t1 = tMid;
      }
    }

    return ray.at((t0 + t1) / 2);
  }

  /**
   * Updates terrain bounds.
   * @private
   */
  private _updateBounds(): void {
    const minHeight = this._heightmap.minHeight * this._heightScale;
    const maxHeight = this._heightmap.maxHeight * this._heightScale;

    this._bounds = new Box3(
      new Vector3(
        this._terrainPosition.x,
        this._terrainPosition.y + minHeight,
        this._terrainPosition.z
      ),
      new Vector3(
        this._terrainPosition.x + this._terrainSize.x,
        this._terrainPosition.y + maxHeight,
        this._terrainPosition.z + this._terrainSize.y
      )
    );
  }
}
