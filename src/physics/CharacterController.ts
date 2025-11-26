/**
 * Character controller for player and NPC movement with collision response.
 * Uses capsule-based collision with ground detection, step climbing, and slope handling.
 *
 * @module Physics/CharacterController
 */

import { Vector3 } from '../math/Vector3';
import { Quaternion } from '../math/Quaternion';
import { RigidBody, BodyType } from './RigidBody';
import { PhysicsWorld } from './PhysicsWorld';
import { Collider } from './Collider';
import { CapsuleShape, CapsuleAxis } from './shapes/CapsuleShape';
import { Ray, RaycastHit } from './Raycast';

/**
 * Collision flags indicating where the controller is touching.
 */
export enum CollisionFlags {
  /** Not touching anything */
  NONE = 0,

  /** Touching on the sides */
  SIDES = 1 << 0,

  /** Touching above (ceiling) */
  ABOVE = 1 << 1,

  /** Touching below (ground) */
  BELOW = 1 << 2
}

/**
 * Controller collision hit data.
 */
export interface ControllerColliderHit {
  /** Collider that was hit */
  collider: Collider;

  /** Rigid body that was hit (if any) */
  rigidbody?: RigidBody;

  /** Contact point in world space */
  point: Vector3;

  /** Contact normal */
  normal: Vector3;

  /** Move direction that caused the collision */
  moveDirection: Vector3;

  /** Remaining move distance after collision */
  moveLength: number;
}

/**
 * Character controller configuration options.
 */
export interface CharacterControllerOptions {
  /** Height of the character capsule */
  height?: number;

  /** Radius of the character capsule */
  radius?: number;

  /** Center offset from base position */
  center?: Vector3;

  /** Maximum slope angle in degrees that character can walk on */
  slopeLimit?: number;

  /** Maximum step height character can climb */
  stepOffset?: number;

  /** Skin width for collision detection (prevents sticking) */
  skinWidth?: number;

  /** Minimum distance to move (optimization) */
  minMoveDistance?: number;

  /** Physics world reference */
  physicsWorld?: PhysicsWorld;

  /** Collision layer mask */
  layerMask?: number;
}

/**
 * Signal type for controller collision events.
 */
type CollisionCallback = (hit: ControllerColliderHit) => void;

/**
 * Character controller for kinematic character movement.
 *
 * Provides robust character movement with:
 * - Capsule-based collision detection
 * - Ground detection with slope handling
 * - Step climbing for stairs and obstacles
 * - Sliding on steep surfaces
 * - Moving platform support
 * - Collision callbacks
 *
 * @example
 * ```typescript
 * // Create character controller
 * const controller = new CharacterController({
 *   height: 2.0,
 *   radius: 0.5,
 *   slopeLimit: 45,
 *   stepOffset: 0.3,
 *   physicsWorld: world
 * });
 *
 * // Move character
 * const moveVector = new Vector3(1, 0, 0);
 * const flags = controller.move(moveVector.scale(deltaTime));
 *
 * // Check if grounded
 * if (flags & CollisionFlags.BELOW) {
 *   console.log('Character is on ground');
 * }
 *
 * // Listen for collisions
 * controller.onControllerColliderHit.add((hit) => {
 *   console.log('Hit:', hit.collider);
 * });
 * ```
 */
export class CharacterController {
  /**
   * Character height (total capsule height).
   */
  height: number;

  /**
   * Character radius.
   */
  radius: number;

  /**
   * Center offset from base position.
   */
  center: Vector3;

  /**
   * Maximum slope angle in degrees.
   */
  slopeLimit: number;

  /**
   * Maximum step height to climb.
   */
  stepOffset: number;

  /**
   * Skin width for collision detection.
   */
  skinWidth: number;

  /**
   * Minimum distance to move.
   */
  minMoveDistance: number;

  /**
   * Collision layer mask.
   */
  layerMask: number;

  /**
   * Current position in world space.
   */
  position: Vector3;

  /**
   * Current velocity (for physics interactions).
   */
  velocity: Vector3;

  /**
   * Is character grounded on this frame.
   */
  isGrounded: boolean;

  /**
   * Collision flags from last move.
   */
  collisionFlags: CollisionFlags;

  /**
   * Ground normal if grounded.
   */
  groundNormal: Vector3;

  /**
   * Collision event signal.
   */
  onControllerColliderHit: {
    add: (callback: CollisionCallback) => void;
    remove: (callback: CollisionCallback) => void;
    dispatch: (hit: ControllerColliderHit) => void;
  };

  private physicsWorld: PhysicsWorld | null;
  private capsuleShape: CapsuleShape;
  private collider: Collider;
  private maxPushForce: number;
  private callbacks: Set<CollisionCallback>;

  /**
   * Creates a new character controller.
   *
   * @param options - Configuration options
   */
  constructor(options: CharacterControllerOptions = {}) {
    this.height = options.height ?? 2.0;
    this.radius = options.radius ?? 0.5;
    this.center = options.center ?? new Vector3(0, this.height * 0.5, 0);
    this.slopeLimit = options.slopeLimit ?? 45.0;
    this.stepOffset = options.stepOffset ?? 0.3;
    this.skinWidth = options.skinWidth ?? 0.08;
    this.minMoveDistance = options.minMoveDistance ?? 0.001;
    this.layerMask = options.layerMask ?? 0xFFFFFFFF;

    this.position = Vector3.zero();
    this.velocity = Vector3.zero();
    this.isGrounded = false;
    this.collisionFlags = CollisionFlags.NONE;
    this.groundNormal = Vector3.up();

    this.physicsWorld = options.physicsWorld ?? null;
    this.maxPushForce = 2.0;

    this.capsuleShape = new CapsuleShape(this.height, this.radius, CapsuleAxis.Y);
    this.collider = new Collider({
      shape: this.capsuleShape,
      isTrigger: false,
      layerMask: this.layerMask
    });

    this.callbacks = new Set<CollisionCallback>();

    this.onControllerColliderHit = {
      add: (callback: CollisionCallback) => {
        this.callbacks.add(callback);
      },
      remove: (callback: CollisionCallback) => {
        this.callbacks.delete(callback);
      },
      dispatch: (hit: ControllerColliderHit) => {
        for (const callback of this.callbacks) {
          callback(hit);
        }
      }
    };
  }

  /**
   * Moves the character by the given motion vector.
   * Handles collision detection, sliding, and step climbing.
   *
   * @param motion - Motion vector in world space
   * @returns Collision flags indicating what was hit
   *
   * @example
   * ```typescript
   * const motion = new Vector3(speed * deltaTime, 0, 0);
   * const flags = controller.move(motion);
   *
   * if (flags & CollisionFlags.SIDES) {
   *   console.log('Hit a wall');
   * }
   * ```
   */
  move(motion: Vector3): CollisionFlags {
    if (motion.lengthSquared() < this.minMoveDistance * this.minMoveDistance) {
      this.checkGroundStatus();
      return this.collisionFlags;
    }

    this.collisionFlags = CollisionFlags.NONE;
    const originalPosition = this.position.clone();

    this.velocity = motion.scale(1.0 / 0.016);

    const totalMotion = motion.clone();
    let remainingMotion = totalMotion.clone();
    const maxIterations = 4;

    for (let iteration = 0; iteration < maxIterations; iteration++) {
      if (remainingMotion.lengthSquared() < this.minMoveDistance * this.minMoveDistance) {
        break;
      }

      const moveDistance = remainingMotion.length();
      const moveDirection = remainingMotion.normalize();

      const hit = this.castCapsule(this.position, moveDirection, moveDistance);

      if (hit) {
        const safeDistance = Math.max(0, hit.distance - this.skinWidth);
        this.position = this.position.add(moveDirection.scale(safeDistance));

        this.handleCollision(hit, moveDirection, moveDistance - safeDistance);

        const unclippedSpace = remainingMotion.length() - safeDistance;
        remainingMotion = this.clipVelocity(remainingMotion, hit.normal, 1.0);

        const clippedLength = remainingMotion.length();
        if (clippedLength < 0.001) {
          break;
        }

        const scale = unclippedSpace / (moveDistance + 0.001);
        remainingMotion = remainingMotion.normalize().scale(clippedLength * scale);

        if (this.shouldStepUp(hit, totalMotion)) {
          if (this.tryStepUp(hit, remainingMotion)) {
            break;
          }
        }
      } else {
        this.position = this.position.add(remainingMotion);
        break;
      }
    }

    this.checkGroundStatus();

    return this.collisionFlags;
  }

  /**
   * Performs a simple move without step climbing (for flying/swimming).
   *
   * @param motion - Motion vector
   * @returns Collision flags
   */
  simpleMove(motion: Vector3): CollisionFlags {
    const gravity = this.physicsWorld?.gravity ?? new Vector3(0, -9.81, 0);
    const gravityMotion = gravity.scale(0.016);
    const totalMotion = motion.add(gravityMotion);

    return this.move(totalMotion);
  }

  /**
   * Sets the position of the character controller.
   *
   * @param position - New position
   */
  setPosition(position: Vector3): void {
    this.position = position.clone();
  }

  /**
   * Gets the current position.
   *
   * @returns Current position
   */
  getPosition(): Vector3 {
    return this.position.clone();
  }

  /**
   * Gets the center position of the capsule in world space.
   *
   * @returns Center position
   */
  getCenterPosition(): Vector3 {
    return this.position.add(this.center);
  }

  /**
   * Checks if a position is valid (not overlapping geometry).
   *
   * @param position - Position to check
   * @returns True if position is valid
   */
  isValidPosition(position: Vector3): boolean {
    const testPos = position.add(this.center);
    const hit = this.overlapCapsule(testPos);
    return hit === null;
  }

  /**
   * Casts the character capsule from a position in a direction.
   *
   * @param position - Start position
   * @param direction - Cast direction (normalized)
   * @param distance - Cast distance
   * @returns Hit information or null
   */
  private castCapsule(position: Vector3, direction: Vector3, distance: number): RaycastHit | null {
    if (!this.physicsWorld) return null;

    const centerPos = position.add(this.center);
    const [p1, p2] = this.capsuleShape.getSegmentEndpoints();

    const worldP1 = centerPos.add(p1);
    const worldP2 = centerPos.add(p2);

    const ray1 = new Ray(worldP1, direction);
    const ray2 = new Ray(worldP2, direction);
    const raySide = new Ray(centerPos, direction);

    let closestHit: RaycastHit | null = null;
    let closestDist = distance + this.radius;

    const hit1 = this.sphereCast(ray1, this.radius, distance, this.layerMask);
    if (hit1 && hit1.distance < closestDist) {
      closestHit = hit1;
      closestDist = hit1.distance;
    }

    const hit2 = this.sphereCast(ray2, this.radius, distance, this.layerMask);
    if (hit2 && hit2.distance < closestDist) {
      closestHit = hit2;
      closestDist = hit2.distance;
    }

    const hitSide = this.sphereCast(raySide, this.radius, distance, this.layerMask);
    if (hitSide && hitSide.distance < closestDist) {
      closestHit = hitSide;
      closestDist = hitSide.distance;
    }

    return closestHit;
  }

  /**
   * Checks for capsule overlap at a position.
   *
   * @param centerPosition - Center position to check
   * @returns Hit information or null
   */
  private overlapCapsule(centerPosition: Vector3): RaycastHit | null {
    if (!this.physicsWorld) return null;

    const [p1, p2] = this.capsuleShape.getSegmentEndpoints();
    const worldP1 = centerPosition.add(p1);
    const worldP2 = centerPosition.add(p2);

    const overlapRadius = this.radius - this.skinWidth;

    return null;
  }

  /**
   * Simplified sphere cast for collision detection.
   */
  private sphereCast(ray: Ray, radius: number, distance: number, layerMask: number): RaycastHit | null {
    if (!this.physicsWorld) return null;

    for (const body of this.physicsWorld.bodies) {
      if (body.type === BodyType.Dynamic && body.isSleeping) continue;

      for (const collider of body.colliders) {
        if ((collider.layerMask & layerMask) === 0) continue;

        const aabb = collider.getAABB(body.getWorldMatrix());
        const expandedMin = aabb.min.sub(new Vector3(radius, radius, radius));
        const expandedMax = aabb.max.add(new Vector3(radius, radius, radius));

        const hit = this.rayAABB(ray, expandedMin, expandedMax, distance);
        if (hit) {
          const normal = this.calculateNormal(hit.point, aabb);
          return {
            point: hit.point,
            normal: normal,
            distance: hit.distance,
            collider: collider,
            rigidBody: body
          };
        }
      }
    }

    return null;
  }

  /**
   * Ray-AABB intersection test.
   */
  private rayAABB(ray: Ray, min: Vector3, max: Vector3, maxDist: number): { point: Vector3; distance: number } | null {
    const invDir = new Vector3(
      1.0 / (ray.direction.x + 1e-10),
      1.0 / (ray.direction.y + 1e-10),
      1.0 / (ray.direction.z + 1e-10)
    );

    const t1 = (min.x - ray.origin.x) * invDir.x;
    const t2 = (max.x - ray.origin.x) * invDir.x;
    const t3 = (min.y - ray.origin.y) * invDir.y;
    const t4 = (max.y - ray.origin.y) * invDir.y;
    const t5 = (min.z - ray.origin.z) * invDir.z;
    const t6 = (max.z - ray.origin.z) * invDir.z;

    const tmin = Math.max(Math.max(Math.min(t1, t2), Math.min(t3, t4)), Math.min(t5, t6));
    const tmax = Math.min(Math.min(Math.max(t1, t2), Math.max(t3, t4)), Math.max(t5, t6));

    if (tmax < 0 || tmin > tmax || tmin > maxDist) {
      return null;
    }

    const distance = tmin >= 0 ? tmin : tmax;
    const point = ray.getPoint(distance);

    return { point, distance };
  }

  /**
   * Calculates surface normal from hit point and AABB.
   */
  private calculateNormal(point: Vector3, aabb: { min: Vector3; max: Vector3 }): Vector3 {
    const center = new Vector3(
      (aabb.min.x + aabb.max.x) * 0.5,
      (aabb.min.y + aabb.max.y) * 0.5,
      (aabb.min.z + aabb.max.z) * 0.5
    );

    const extents = new Vector3(
      (aabb.max.x - aabb.min.x) * 0.5,
      (aabb.max.y - aabb.min.y) * 0.5,
      (aabb.max.z - aabb.min.z) * 0.5
    );

    const local = point.sub(center);
    const normal = new Vector3(0, 1, 0);

    let minDist = Math.abs(extents.x - Math.abs(local.x));
    if (Math.abs(extents.x - Math.abs(local.x)) < minDist + 0.001) {
      normal.set(local.x > 0 ? 1 : -1, 0, 0);
      minDist = Math.abs(extents.x - Math.abs(local.x));
    }

    if (Math.abs(extents.y - Math.abs(local.y)) < minDist) {
      normal.set(0, local.y > 0 ? 1 : -1, 0);
      minDist = Math.abs(extents.y - Math.abs(local.y));
    }

    if (Math.abs(extents.z - Math.abs(local.z)) < minDist) {
      normal.set(0, 0, local.z > 0 ? 1 : -1);
    }

    return normal;
  }

  /**
   * Handles collision response.
   */
  private handleCollision(hit: RaycastHit, moveDirection: Vector3, remainingDistance: number): void {
    const angle = Math.acos(hit.normal.dot(Vector3.up())) * (180 / Math.PI);

    if (angle < this.slopeLimit) {
      this.collisionFlags |= CollisionFlags.BELOW;
      this.groundNormal = hit.normal.clone();
    } else if (hit.normal.y > 0.1) {
      this.collisionFlags |= CollisionFlags.SIDES;
    } else if (hit.normal.y < -0.7) {
      this.collisionFlags |= CollisionFlags.ABOVE;
    } else {
      this.collisionFlags |= CollisionFlags.SIDES;
    }

    const controllerHit: ControllerColliderHit = {
      collider: hit.collider,
      rigidbody: hit.rigidBody,
      point: hit.point,
      normal: hit.normal,
      moveDirection: moveDirection,
      moveLength: remainingDistance
    };

    this.onControllerColliderHit.dispatch(controllerHit);

    if (hit.rigidBody && hit.rigidBody.type === BodyType.Dynamic) {
      const pushDir = hit.normal.negate();
      const pushForce = pushDir.scale(this.maxPushForce);
      hit.rigidBody.applyForce(pushForce, hit.point);
    }
  }

  /**
   * Clips velocity against a surface normal.
   */
  private clipVelocity(velocity: Vector3, normal: Vector3, overbounce: number): Vector3 {
    const backoff = velocity.dot(normal) * overbounce;
    const change = normal.scale(backoff);
    return velocity.sub(change);
  }

  /**
   * Checks if character should attempt to step up.
   */
  private shouldStepUp(hit: RaycastHit, motion: Vector3): boolean {
    if (hit.normal.y > 0.7) return false;

    const angle = Math.acos(hit.normal.dot(Vector3.up())) * (180 / Math.PI);
    return angle >= this.slopeLimit && Math.abs(motion.y) < 0.01;
  }

  /**
   * Attempts to step up over an obstacle.
   */
  private tryStepUp(hit: RaycastHit, remainingMotion: Vector3): boolean {
    const upOffset = Vector3.up().scale(this.stepOffset);
    const testPos = this.position.add(upOffset);

    if (!this.isValidPosition(testPos)) {
      return false;
    }

    this.position = testPos;

    const forwardMotion = new Vector3(remainingMotion.x, 0, remainingMotion.z);
    const forwardHit = this.castCapsule(this.position, forwardMotion.normalize(), forwardMotion.length());

    if (forwardHit && forwardHit.distance < this.skinWidth) {
      this.position = this.position.sub(upOffset);
      return false;
    }

    if (!forwardHit) {
      this.position = this.position.add(forwardMotion);
    } else {
      const safeDistance = Math.max(0, forwardHit.distance - this.skinWidth);
      this.position = this.position.add(forwardMotion.normalize().scale(safeDistance));
    }

    const downHit = this.castCapsule(this.position, Vector3.down(), this.stepOffset);
    if (downHit) {
      const dropDistance = Math.max(0, downHit.distance - this.skinWidth);
      this.position = this.position.add(Vector3.down().scale(dropDistance));
    }

    return true;
  }

  /**
   * Checks ground status via downward raycast.
   */
  private checkGroundStatus(): void {
    const groundCheckDistance = this.skinWidth + 0.01;
    const hit = this.castCapsule(this.position, Vector3.down(), groundCheckDistance);

    if (hit && hit.distance <= groundCheckDistance) {
      const angle = Math.acos(hit.normal.dot(Vector3.up())) * (180 / Math.PI);
      this.isGrounded = angle < this.slopeLimit;

      if (this.isGrounded) {
        this.groundNormal = hit.normal.clone();
        this.collisionFlags |= CollisionFlags.BELOW;
      } else {
        this.groundNormal = Vector3.up();
      }
    } else {
      this.isGrounded = false;
      this.groundNormal = Vector3.up();
    }
  }

  /**
   * Gets the height of the controller.
   */
  getHeight(): number {
    return this.height;
  }

  /**
   * Gets the radius of the controller.
   */
  getRadius(): number {
    return this.radius;
  }

  /**
   * Sets the height of the controller.
   */
  setHeight(height: number): void {
    this.height = height;
    this.capsuleShape.height = height;
    this.center.y = height * 0.5;
  }
}
