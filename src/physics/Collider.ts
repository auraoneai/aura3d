/**
 * Base collider class and shape interface for physics collision detection.
 *
 * @module Physics/Collider
 */

import { Vector3 } from '../math/Vector3';
import { Matrix4 } from '../math/Matrix4';
import { PhysicsMaterial } from './PhysicsMaterial';

/**
 * Collision shape type enum for runtime type checking.
 */
export enum ShapeType {
  /** Box/cube shape */
  Box = 0,

  /** Sphere shape */
  Sphere = 1,

  /** Capsule shape */
  Capsule = 2,

  /** Convex hull mesh */
  ConvexHull = 3,

  /** Triangle mesh (static geometry only) */
  TriangleMesh = 4,

  /** Compound shape (multiple sub-shapes) */
  Compound = 5
}

/**
 * Axis-aligned bounding box for broad-phase collision detection.
 */
export interface AABB {
  /** Minimum corner of the bounding box */
  min: Vector3;

  /** Maximum corner of the bounding box */
  max: Vector3;
}

/**
 * Abstract base interface for collision shapes.
 * All shape types must implement these methods.
 */
export interface IShape {
  /** Shape type identifier */
  readonly type: ShapeType;

  /** Local offset from collider center */
  offset: Vector3;

  /** Computes axis-aligned bounding box in world space */
  computeAABB(transform: Matrix4): AABB;

  /** Computes inertia tensor for this shape with given mass */
  computeInertia(mass: number): Matrix4;

  /** Gets approximate volume of the shape */
  getVolume(): number;

  /** Finds support point in given direction (for GJK algorithm) */
  support(direction: Vector3, transform: Matrix4): Vector3;
}

/**
 * Base collider class containing shape and material information.
 *
 * Colliders define the physical boundaries of objects for collision detection.
 * They are attached to rigid bodies and can be triggers or solid.
 *
 * @example
 * ```typescript
 * // Create a box collider
 * const boxCollider = new Collider({
 *   shape: new BoxShape(new Vector3(1, 1, 1)),
 *   material: PhysicsMaterial.wood(),
 *   isTrigger: false
 * });
 *
 * // Create a trigger sphere
 * const triggerSphere = new Collider({
 *   shape: new SphereShape(2.0),
 *   isTrigger: true,
 *   layer: CollisionLayer.Trigger
 * });
 *
 * // Layer filtering
 * collider.setLayerMask(
 *   CollisionLayer.Default | CollisionLayer.Player
 * );
 * ```
 */
export class Collider {
  /**
   * Collision shape defining the geometry.
   */
  shape: IShape;

  /**
   * Physics material defining friction and restitution.
   */
  material: PhysicsMaterial;

  /**
   * Whether this is a trigger collider.
   * Triggers generate collision events but don't apply forces.
   */
  isTrigger: boolean;

  /**
   * Collision layer this collider belongs to.
   * Used for filtering which objects can collide.
   */
  layer: number;

  /**
   * Collision layer mask defining which layers to collide with.
   * Bitwise mask where each bit represents a layer.
   */
  layerMask: number;

  /**
   * Cached axis-aligned bounding box in world space.
   * Updated when transform changes.
   */
  private _cachedAABB: AABB | null = null;

  /**
   * Dirty flag indicating AABB needs recomputation.
   */
  private _aabbDirty: boolean = true;

  /**
   * User data for application-specific purposes.
   */
  userData: any = null;

  /**
   * Creates a new collider.
   *
   * @param options - Collider configuration
   * @param options.shape - Collision shape
   * @param options.material - Physics material (default: default material)
   * @param options.isTrigger - Whether this is a trigger (default: false)
   * @param options.layer - Collision layer (default: 0)
   * @param options.layerMask - Collision layer mask (default: 0xFFFFFFFF - all layers)
   *
   * @example
   * ```typescript
   * const collider = new Collider({
   *   shape: new SphereShape(1.0),
   *   material: PhysicsMaterial.rubber(),
   *   isTrigger: false,
   *   layer: CollisionLayer.Player,
   *   layerMask: CollisionLayer.Default | CollisionLayer.Environment
   * });
   * ```
   */
  constructor(options: {
    shape: IShape;
    material?: PhysicsMaterial;
    isTrigger?: boolean;
    layer?: number;
    layerMask?: number;
  }) {
    this.shape = options.shape;
    this.material = options.material ?? PhysicsMaterial.default();
    this.isTrigger = options.isTrigger ?? false;
    this.layer = options.layer ?? CollisionLayer.Default;
    this.layerMask = options.layerMask ?? 0xFFFFFFFF;
  }

  /**
   * Gets the axis-aligned bounding box in world space.
   * Cached and only recomputed when dirty.
   *
   * @param transform - World transform matrix
   * @returns AABB in world space
   *
   * @example
   * ```typescript
   * const worldMatrix = rigidBody.getWorldMatrix();
   * const aabb = collider.getAABB(worldMatrix);
   * console.log(`Min: ${aabb.min}, Max: ${aabb.max}`);
   * ```
   */
  getAABB(transform: Matrix4): AABB {
    if (this._aabbDirty || !this._cachedAABB) {
      this._cachedAABB = this.shape.computeAABB(transform);
      this._aabbDirty = false;
    }
    return this._cachedAABB;
  }

  /**
   * Marks the AABB as dirty, forcing recomputation on next access.
   * Call when the transform changes.
   *
   * @example
   * ```typescript
   * rigidBody.setPosition(new Vector3(10, 0, 0));
   * collider.markDirty();
   * ```
   */
  markDirty(): void {
    this._aabbDirty = true;
  }

  /**
   * Checks if this collider can collide with another collider based on layers.
   *
   * @param other - Other collider to check
   * @returns True if collision is allowed by layer filtering
   *
   * @example
   * ```typescript
   * const playerCollider = new Collider({
   *   shape: new SphereShape(1),
   *   layer: CollisionLayer.Player,
   *   layerMask: CollisionLayer.Default | CollisionLayer.Environment
   * });
   *
   * const enemyCollider = new Collider({
   *   shape: new SphereShape(1),
   *   layer: CollisionLayer.Enemy
   * });
   *
   * const canCollide = playerCollider.canCollideWith(enemyCollider); // false
   * ```
   */
  canCollideWith(other: Collider): boolean {
    // Check if other's layer is in our mask AND our layer is in other's mask
    const ourCheck = (this.layerMask & (1 << other.layer)) !== 0;
    const theirCheck = (other.layerMask & (1 << this.layer)) !== 0;
    return ourCheck && theirCheck;
  }

  /**
   * Sets the collision layer for this collider.
   *
   * @param layer - Layer index (0-31)
   *
   * @example
   * ```typescript
   * collider.setLayer(CollisionLayer.Player);
   * ```
   */
  setLayer(layer: number): void {
    this.layer = layer;
  }

  /**
   * Sets which layers this collider can collide with.
   *
   * @param mask - Bitwise mask of layers
   *
   * @example
   * ```typescript
   * // Collide with Default and Player layers only
   * collider.setLayerMask(
   *   (1 << CollisionLayer.Default) | (1 << CollisionLayer.Player)
   * );
   * ```
   */
  setLayerMask(mask: number): void {
    this.layerMask = mask;
  }

  /**
   * Adds a layer to the collision mask.
   *
   * @param layer - Layer to add
   *
   * @example
   * ```typescript
   * collider.addLayerToMask(CollisionLayer.Enemy);
   * ```
   */
  addLayerToMask(layer: number): void {
    this.layerMask |= (1 << layer);
  }

  /**
   * Removes a layer from the collision mask.
   *
   * @param layer - Layer to remove
   *
   * @example
   * ```typescript
   * collider.removeLayerFromMask(CollisionLayer.Trigger);
   * ```
   */
  removeLayerFromMask(layer: number): void {
    this.layerMask &= ~(1 << layer);
  }

  /**
   * Checks if a layer is in the collision mask.
   *
   * @param layer - Layer to check
   * @returns True if layer is in mask
   *
   * @example
   * ```typescript
   * if (collider.hasLayerInMask(CollisionLayer.Player)) {
   *   console.log('Can collide with player');
   * }
   * ```
   */
  hasLayerInMask(layer: number): boolean {
    return (this.layerMask & (1 << layer)) !== 0;
  }

  /**
   * Computes the inertia tensor for this collider's shape.
   *
   * @param mass - Mass of the rigid body
   * @returns Inertia tensor matrix
   *
   * @example
   * ```typescript
   * const mass = 10.0;
   * const inertia = collider.computeInertia(mass);
   * rigidBody.setInertia(inertia);
   * ```
   */
  computeInertia(mass: number): Matrix4 {
    return this.shape.computeInertia(mass);
  }

  /**
   * Gets the volume of the collision shape.
   *
   * @returns Volume in cubic units
   *
   * @example
   * ```typescript
   * const volume = collider.getVolume();
   * const density = material.density;
   * const mass = volume * density;
   * ```
   */
  getVolume(): number {
    return this.shape.getVolume();
  }

  /**
   * Computes mass from volume and material density.
   *
   * @returns Computed mass in kg
   *
   * @example
   * ```typescript
   * const mass = collider.computeMass();
   * rigidBody.setMass(mass);
   * ```
   */
  computeMass(): number {
    const volume = this.getVolume();
    return volume * this.material.density;
  }
}

/**
 * Standard collision layers for common use cases.
 * Applications can define custom layers using these as a base.
 */
export const CollisionLayer = {
  /** Default layer for most objects (0) */
  Default: 0,

  /** Static environment geometry (1) */
  Environment: 1,

  /** Player character (2) */
  Player: 2,

  /** Enemy characters (3) */
  Enemy: 3,

  /** Projectiles and bullets (4) */
  Projectile: 4,

  /** Trigger volumes (5) */
  Trigger: 5,

  /** Debris and particles (6) */
  Debris: 6,

  /** UI and non-gameplay elements (7) */
  UI: 7
} as const;

/**
 * Utility functions for working with AABBs.
 */
export const AABBUtils = {
  /**
   * Creates an AABB from min and max points.
   *
   * @param min - Minimum corner
   * @param max - Maximum corner
   * @returns New AABB
   */
  create(min: Vector3, max: Vector3): AABB {
    return { min, max };
  },

  /**
   * Creates an AABB centered at a point with given extents.
   *
   * @param center - Center point
   * @param extents - Half-extents in each dimension
   * @returns New AABB
   */
  fromCenterAndExtents(center: Vector3, extents: Vector3): AABB {
    return {
      min: center.sub(extents),
      max: center.add(extents)
    };
  },

  /**
   * Tests if two AABBs overlap.
   *
   * @param a - First AABB
   * @param b - Second AABB
   * @returns True if AABBs overlap
   */
  overlaps(a: AABB, b: AABB): boolean {
    return (
      a.min.x <= b.max.x && a.max.x >= b.min.x &&
      a.min.y <= b.max.y && a.max.y >= b.min.y &&
      a.min.z <= b.max.z && a.max.z >= b.min.z
    );
  },

  /**
   * Computes the center of an AABB.
   *
   * @param aabb - AABB to analyze
   * @returns Center point
   */
  getCenter(aabb: AABB): Vector3 {
    return new Vector3(
      (aabb.min.x + aabb.max.x) * 0.5,
      (aabb.min.y + aabb.max.y) * 0.5,
      (aabb.min.z + aabb.max.z) * 0.5
    );
  },

  /**
   * Computes the extents (half-size) of an AABB.
   *
   * @param aabb - AABB to analyze
   * @returns Half-extents
   */
  getExtents(aabb: AABB): Vector3 {
    return new Vector3(
      (aabb.max.x - aabb.min.x) * 0.5,
      (aabb.max.y - aabb.min.y) * 0.5,
      (aabb.max.z - aabb.min.z) * 0.5
    );
  },

  /**
   * Expands an AABB to include a point.
   *
   * @param aabb - AABB to expand
   * @param point - Point to include
   */
  expandToInclude(aabb: AABB, point: Vector3): void {
    aabb.min.x = Math.min(aabb.min.x, point.x);
    aabb.min.y = Math.min(aabb.min.y, point.y);
    aabb.min.z = Math.min(aabb.min.z, point.z);
    aabb.max.x = Math.max(aabb.max.x, point.x);
    aabb.max.y = Math.max(aabb.max.y, point.y);
    aabb.max.z = Math.max(aabb.max.z, point.z);
  },

  /**
   * Merges two AABBs into one containing both.
   *
   * @param a - First AABB
   * @param b - Second AABB
   * @returns Merged AABB
   */
  merge(a: AABB, b: AABB): AABB {
    return {
      min: new Vector3(
        Math.min(a.min.x, b.min.x),
        Math.min(a.min.y, b.min.y),
        Math.min(a.min.z, b.min.z)
      ),
      max: new Vector3(
        Math.max(a.max.x, b.max.x),
        Math.max(a.max.y, b.max.y),
        Math.max(a.max.z, b.max.z)
      )
    };
  }
};
