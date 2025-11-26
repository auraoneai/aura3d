/**
 * @fileoverview Raycast-based picking using physics and geometry intersection.
 * @module editor/picking/RaycastPicking
 */

import { Scene } from '../../scene/Scene';
import { Entity } from '../../ecs/Entity';
import { Camera } from '../../components/Camera';
import { Transform } from '../../components/Transform';
import { Vector3 } from '../../math/Vector3';
import { Ray } from '../../math/Ray';
import { Bounds } from '../../math/Bounds';
import { PickResult } from './PickingSystem';

/**
 * BVH node for acceleration
 */
interface BVHNode {
  bounds: Bounds;
  entities: Entity[];
  left?: BVHNode;
  right?: BVHNode;
}

/**
 * Raycast-based picking using physics raycasting and mesh intersection.
 * Uses BVH acceleration structure for efficient intersection testing.
 * More accurate than GPU picking but potentially slower for complex scenes.
 *
 * @example
 * ```typescript
 * const raycastPicking = new RaycastPicking(scene);
 * const result = raycastPicking.pick(mouseX, mouseY, camera);
 * if (result) {
 *   console.log('Picked:', result.entity.name, 'at', result.position);
 * }
 * ```
 */
export class RaycastPicking {
  private scene: Scene;
  private bvh: BVHNode | null = null;
  private needsRebuild: boolean = true;

  /**
   * Creates a raycast picking system
   * @param scene - Scene to pick from
   */
  constructor(scene: Scene) {
    this.scene = scene;
  }

  /**
   * Builds a BVH acceleration structure
   */
  private buildBVH(): void {
    const entities = this.scene.getEntities().filter(e => {
      return e.hasComponent(Transform) && e.enabled;
    });

    this.bvh = this.buildBVHRecursive(entities, 0);
    this.needsRebuild = false;
  }

  /**
   * Recursively builds BVH nodes
   * @param entities - Entities to build BVH for
   * @param depth - Current depth
   */
  private buildBVHRecursive(entities: Entity[], depth: number): BVHNode | null {
    if (entities.length === 0) return null;

    // Calculate bounds for all entities
    const bounds = this.calculateBounds(entities);

    // Leaf node if few entities
    if (entities.length <= 4) {
      return { bounds, entities };
    }

    // Split entities
    const axis = depth % 3; // Cycle through X, Y, Z
    const sorted = [...entities].sort((a, b) => {
      const posA = a.getComponent(Transform)?.position;
      const posB = b.getComponent(Transform)?.position;
      if (!posA || !posB) return 0;

      const valueA = axis === 0 ? posA.x : (axis === 1 ? posA.y : posA.z);
      const valueB = axis === 0 ? posB.x : (axis === 1 ? posB.y : posB.z);
      return valueA - valueB;
    });

    const mid = Math.floor(sorted.length / 2);
    const left = this.buildBVHRecursive(sorted.slice(0, mid), depth + 1);
    const right = this.buildBVHRecursive(sorted.slice(mid), depth + 1);

    return {
      bounds,
      entities: [],
      left: left || undefined,
      right: right || undefined
    };
  }

  /**
   * Calculates combined bounds for entities
   */
  private calculateBounds(entities: Entity[]): Bounds {
    const points: Vector3[] = [];

    entities.forEach(entity => {
      const transform = entity.getComponent(Transform);
      if (transform) {
        points.push(transform.position.clone());
        // In a full implementation, would use actual mesh bounds
      }
    });

    if (points.length === 0) {
      return new Bounds(new Vector3(), new Vector3());
    }

    return Bounds.fromPoints(points);
  }

  /**
   * Picks an entity at screen coordinates
   * @param x - Screen X coordinate
   * @param y - Screen Y coordinate
   * @param camera - Camera to pick with
   * @returns Pick result or null
   */
  public pick(x: number, y: number, camera: Camera): PickResult | null {
    const ray = this.screenToRay(x, y, camera);
    return this.pickWithRay(ray);
  }

  /**
   * Picks an entity using a ray
   * @param ray - Ray to use for picking
   * @returns Pick result or null
   */
  public pickWithRay(ray: Ray): PickResult | null {
    if (this.needsRebuild) {
      this.buildBVH();
    }

    if (!this.bvh) return null;

    const results = this.intersectBVH(ray, this.bvh);

    if (results.length === 0) return null;

    // Return closest hit
    results.sort((a, b) => a.distance - b.distance);
    return results[0];
  }

  /**
   * Picks all entities along a ray
   * @param x - Screen X coordinate
   * @param y - Screen Y coordinate
   * @param camera - Camera to pick with
   * @returns Array of all hits sorted by distance
   */
  public pickAll(x: number, y: number, camera: Camera): PickResult[] {
    const ray = this.screenToRay(x, y, camera);

    if (this.needsRebuild) {
      this.buildBVH();
    }

    if (!this.bvh) return [];

    const results = this.intersectBVH(ray, this.bvh);
    results.sort((a, b) => a.distance - b.distance);
    return results;
  }

  /**
   * Intersects a ray with BVH
   * @param ray - Ray to test
   * @param node - BVH node
   * @returns Array of pick results
   */
  private intersectBVH(ray: Ray, node: BVHNode): PickResult[] {
    const results: PickResult[] = [];

    // Test ray against node bounds
    if (!this.rayIntersectsBounds(ray, node.bounds)) {
      return results;
    }

    // Leaf node - test entities
    if (node.entities.length > 0) {
      node.entities.forEach(entity => {
        const result = this.intersectEntity(ray, entity);
        if (result) {
          results.push(result);
        }
      });
      return results;
    }

    // Interior node - recurse
    if (node.left) {
      results.push(...this.intersectBVH(ray, node.left));
    }
    if (node.right) {
      results.push(...this.intersectBVH(ray, node.right));
    }

    return results;
  }

  /**
   * Tests if ray intersects bounds
   * @param ray - Ray to test
   * @param bounds - Bounds to test
   * @returns True if ray intersects bounds
   */
  private rayIntersectsBounds(ray: Ray, bounds: Bounds): boolean {
    const min = bounds.min;
    const max = bounds.max;

    let tmin = (min.x - ray.origin.x) / ray.direction.x;
    let tmax = (max.x - ray.origin.x) / ray.direction.x;

    if (tmin > tmax) [tmin, tmax] = [tmax, tmin];

    let tymin = (min.y - ray.origin.y) / ray.direction.y;
    let tymax = (max.y - ray.origin.y) / ray.direction.y;

    if (tymin > tymax) [tymin, tymax] = [tymax, tymin];

    if ((tmin > tymax) || (tymin > tmax)) return false;

    if (tymin > tmin) tmin = tymin;
    if (tymax < tmax) tmax = tymax;

    let tzmin = (min.z - ray.origin.z) / ray.direction.z;
    let tzmax = (max.z - ray.origin.z) / ray.direction.z;

    if (tzmin > tzmax) [tzmin, tzmax] = [tzmax, tzmin];

    if ((tmin > tzmax) || (tzmin > tmax)) return false;

    return true;
  }

  /**
   * Intersects a ray with an entity
   * @param ray - Ray to test
   * @param entity - Entity to test
   * @returns Pick result or null
   */
  private intersectEntity(ray: Ray, entity: Entity): PickResult | null {
    const transform = entity.getComponent(Transform);
    if (!transform) return null;

    // Simple sphere intersection for now
    // In a full implementation, would test against actual mesh geometry
    const radius = 0.5; // Default radius
    const toSphere = transform.position.clone().sub(ray.origin);
    const projection = toSphere.dot(ray.direction);

    if (projection < 0) return null;

    const closestPoint = ray.origin.clone().add(ray.direction.clone().multiplyScalar(projection));
    const distanceToCenter = closestPoint.distanceTo(transform.position);

    if (distanceToCenter > radius) return null;

    // Calculate actual intersection point
    const offset = Math.sqrt(radius * radius - distanceToCenter * distanceToCenter);
    const distance = projection - offset;
    const position = ray.origin.clone().add(ray.direction.clone().multiplyScalar(distance));

    // Calculate normal
    const normal = position.clone().sub(transform.position).normalize();

    return {
      entity,
      position,
      distance,
      normal
    };
  }

  /**
   * Creates a ray from screen coordinates
   * @param x - Screen X coordinate
   * @param y - Screen Y coordinate
   * @param camera - Camera to use
   * @returns Ray in world space
   */
  private screenToRay(x: number, y: number, camera: Camera): Ray {
    const viewportWidth = 800; // Would come from actual viewport
    const viewportHeight = 600;

    // Convert screen to NDC
    const ndcX = (x / viewportWidth) * 2 - 1;
    const ndcY = -(y / viewportHeight) * 2 + 1;

    // Create ray from camera
    const origin = camera.transform.position.clone();
    const direction = new Vector3(ndcX, ndcY, -1);

    // Transform by camera rotation
    direction.applyQuaternion(camera.transform.rotation);
    direction.normalize();

    return new Ray(origin, direction);
  }

  /**
   * Updates the picking system
   * @param deltaTime - Time since last update
   */
  public update(deltaTime: number): void {
    // Mark for rebuild if scene changed
    // In a full implementation, would listen for scene change events
  }

  /**
   * Invalidates the BVH, forcing a rebuild
   */
  public invalidate(): void {
    this.needsRebuild = true;
  }

  /**
   * Disposes of the picking system
   */
  public dispose(): void {
    this.bvh = null;
  }
}
