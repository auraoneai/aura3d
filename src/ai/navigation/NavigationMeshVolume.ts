/**
 * @fileoverview Navigation mesh volume queries for height and containment tests.
 * Provides efficient spatial queries for 3D navigation mesh volumes.
 * @module ai/navigation/NavigationMeshVolume
 */

import { Vector3 } from '../../math/Vector3';
import { Box3 } from '../../math/Box3';
import { NavMesh, NavPolygon } from './NavMesh';
import { Logger } from '../../core/Logger';

const logger = Logger.create('NavigationMeshVolume');

/**
 * Height query result.
 */
export interface HeightQueryResult {
  height: number;
  polygon: NavPolygon;
  normal: Vector3;
  isValid: boolean;
}

/**
 * Volume query result.
 */
export interface VolumeQueryResult {
  polygons: NavPolygon[];
  bounds: Box3;
  totalArea: number;
}

/**
 * Navigation mesh volume for spatial queries.
 * Provides height queries, containment tests, and volume calculations.
 */
export class NavigationMeshVolume {
  private navMesh: NavMesh;
  private heightCache: Map<string, HeightQueryResult>;
  private cacheEnabled: boolean;
  private cacheGridSize: number;

  constructor(navMesh: NavMesh, enableCache: boolean = true, cacheGridSize: number = 1.0) {
    this.navMesh = navMesh;
    this.heightCache = new Map();
    this.cacheEnabled = enableCache;
    this.cacheGridSize = cacheGridSize;
  }

  /**
   * Queries height at given XZ position.
   * Returns height, polygon, and normal at the position.
   */
  queryHeight(position: Vector3, maxDistance: number = 10.0): HeightQueryResult {
    if (this.cacheEnabled) {
      const cacheKey = this.getCacheKey(position);
      const cached = this.heightCache.get(cacheKey);
      if (cached) {
        return cached;
      }
    }

    const polygon = this.navMesh.findNearestPolygon(
      new Vector3(position.x, 0, position.z),
      maxDistance
    );

    if (!polygon) {
      return {
        height: 0,
        polygon: null as any,
        normal: new Vector3(0, 1, 0),
        isValid: false
      };
    }

    const height = this.interpolateHeight(polygon, position);
    const result: HeightQueryResult = {
      height,
      polygon,
      normal: polygon.normal.clone(),
      isValid: true
    };

    if (this.cacheEnabled) {
      const cacheKey = this.getCacheKey(position);
      this.heightCache.set(cacheKey, result);
    }

    return result;
  }

  /**
   * Interpolates height on polygon at given position.
   */
  private interpolateHeight(polygon: NavPolygon, position: Vector3): number {
    if (polygon.vertices.length < 3) {
      return polygon.vertices[0].y;
    }

    const v0 = polygon.vertices[0];
    const v1 = polygon.vertices[1];
    const v2 = polygon.vertices[2];

    const edge1 = v1.sub(v0);
    const edge2 = v2.sub(v0);
    const normal = edge1.cross(edge2);

    if (Math.abs(normal.y) < 1e-6) {
      return v0.y;
    }

    const d = -normal.dot(v0);
    const height = -(normal.x * position.x + normal.z * position.z + d) / normal.y;

    return height;
  }

  /**
   * Queries all polygons within a bounding box.
   */
  queryVolume(bounds: Box3): VolumeQueryResult {
    const center = bounds.getCenter();
    const size = bounds.getSize();
    const radius = Math.max(size.x, size.y, size.z) * 0.5;

    const candidates = this.navMesh.queryPolygonsInRadius(center, radius);

    const polygons = candidates.filter(polygon =>
      polygon.bounds.intersectsBox(bounds)
    );

    let totalArea = 0;
    for (const polygon of polygons) {
      totalArea += polygon.getArea();
    }

    return {
      polygons,
      bounds,
      totalArea
    };
  }

  /**
   * Checks if position is inside navigation mesh volume.
   */
  containsPoint(position: Vector3, verticalTolerance: number = 2.0): boolean {
    const heightResult = this.queryHeight(position, 5.0);

    if (!heightResult.isValid) {
      return false;
    }

    const heightDiff = Math.abs(position.y - heightResult.height);

    if (heightDiff > verticalTolerance) {
      return false;
    }

    return heightResult.polygon.containsPoint(position);
  }

  /**
   * Projects position onto navigation mesh surface.
   */
  projectToSurface(position: Vector3, maxDistance: number = 10.0): Vector3 | null {
    const heightResult = this.queryHeight(position, maxDistance);

    if (!heightResult.isValid) {
      return null;
    }

    const projectedPos = new Vector3(position.x, heightResult.height, position.z);

    if (!heightResult.polygon.containsPoint(projectedPos)) {
      const closestPoint = heightResult.polygon.closestPointOnPolygon(projectedPos);
      return closestPoint;
    }

    return projectedPos;
  }

  /**
   * Raycasts from position downward to find surface.
   */
  raycastDown(position: Vector3, maxDistance: number = 100.0): HeightQueryResult {
    const direction = new Vector3(0, -1, 0);
    const hit = this.navMesh.raycast(position, direction, maxDistance);

    if (!hit) {
      return {
        height: 0,
        polygon: null as any,
        normal: new Vector3(0, 1, 0),
        isValid: false
      };
    }

    return {
      height: hit.point.y,
      polygon: hit.polygon,
      normal: hit.polygon.normal.clone(),
      isValid: true
    };
  }

  /**
   * Calculates walkable area within radius of position.
   */
  queryWalkableArea(center: Vector3, radius: number): number {
    const polygons = this.navMesh.queryPolygonsInRadius(center, radius);

    let totalArea = 0;

    for (const polygon of polygons) {
      const polyCenter = polygon.center;
      const distance = center.distanceTo(polyCenter);

      if (distance <= radius) {
        totalArea += polygon.getArea();
      }
    }

    return totalArea;
  }

  /**
   * Finds random position on navmesh within radius.
   */
  getRandomPosition(center: Vector3, radius: number): Vector3 | null {
    const polygons = this.navMesh.queryPolygonsInRadius(center, radius);

    if (polygons.length === 0) {
      return null;
    }

    const randomPolygon = polygons[Math.floor(Math.random() * polygons.length)];

    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * radius;
    const offset = new Vector3(
      Math.cos(angle) * dist,
      0,
      Math.sin(angle) * dist
    );

    const randomPos = randomPolygon.center.add(offset);

    if (randomPolygon.containsPoint(randomPos)) {
      const height = this.interpolateHeight(randomPolygon, randomPos);
      return new Vector3(randomPos.x, height, randomPos.z);
    }

    return randomPolygon.center.clone();
  }

  /**
   * Samples multiple random positions on navmesh.
   */
  sampleRandomPositions(center: Vector3, radius: number, count: number): Vector3[] {
    const positions: Vector3[] = [];

    for (let i = 0; i < count; i++) {
      const pos = this.getRandomPosition(center, radius);
      if (pos) {
        positions.push(pos);
      }
    }

    return positions;
  }

  /**
   * Checks if there's line of sight between two positions on navmesh.
   */
  hasLineOfSight(start: Vector3, end: Vector3): boolean {
    const direction = end.sub(start);
    const distance = direction.length();
    const normalized = direction.normalize();

    const stepSize = 0.5;
    const steps = Math.ceil(distance / stepSize);

    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const testPos = start.lerp(end, t);

      const heightResult = this.queryHeight(testPos, 2.0);
      if (!heightResult.isValid) {
        return false;
      }

      const heightDiff = Math.abs(testPos.y - heightResult.height);
      if (heightDiff > 1.0) {
        return false;
      }
    }

    return true;
  }

  /**
   * Clears height cache.
   */
  clearCache(): void {
    this.heightCache.clear();
  }

  /**
   * Gets cache size.
   */
  getCacheSize(): number {
    return this.heightCache.size;
  }

  private getCacheKey(position: Vector3): string {
    const x = Math.floor(position.x / this.cacheGridSize);
    const z = Math.floor(position.z / this.cacheGridSize);
    return `${x},${z}`;
  }
}
