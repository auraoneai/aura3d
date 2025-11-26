/**
 * Collision system for cloth simulation with various collision shapes.
 *
 * Handles collision detection and response between cloth particles and
 * rigid collision shapes (spheres, boxes, capsules, meshes).
 *
 * @module Simulation/Cloth/ClothCollisionSystem
 */

import { Vector3 } from '../../math/Vector3';
import { Matrix4 } from '../../math/Matrix4';
import { SphereShape } from '../../physics/shapes/SphereShape';
import { BoxShape } from '../../physics/shapes/BoxShape';
import { CapsuleShape } from '../../physics/shapes/CapsuleShape';
import { IShape, ShapeType } from '../../physics/Collider';
import { RigidBody } from '../../physics/RigidBody';
import { CollisionConstraint } from './PBDSolver';

/**
 * Collision info for a single particle.
 */
export interface CollisionInfo {
  /**
   * Index of the colliding particle.
   */
  particleIndex: number;

  /**
   * Point of collision on the shape surface.
   */
  collisionPoint: Vector3;

  /**
   * Normal at the collision point.
   */
  normal: Vector3;

  /**
   * Penetration depth.
   */
  penetrationDepth: number;

  /**
   * Friction coefficient.
   */
  friction: number;
}

/**
 * Cloth collision system managing interactions with rigid shapes.
 *
 * Supports multiple collision shape types and handles both static and
 * dynamic rigid bodies. Generates collision constraints for PBD solver.
 *
 * @example
 * ```typescript
 * const collisionSystem = new ClothCollisionSystem();
 *
 * // Add static sphere obstacle
 * const sphereBody = new RigidBody({ type: BodyType.Static });
 * sphereBody.addCollider(new Collider({
 *   shape: new SphereShape(2.0)
 * }));
 * collisionSystem.addRigidBody(sphereBody);
 *
 * // Detect collisions
 * const collisions = collisionSystem.detectCollisions(
 *   clothPositions,
 *   particleRadius
 * );
 *
 * // Apply collision response
 * collisionSystem.resolveCollisions(
 *   clothPositions,
 *   clothVelocities,
 *   collisions
 * );
 * ```
 */
export class ClothCollisionSystem {
  private rigidBodies: RigidBody[] = [];
  private friction: number;
  private restitution: number;
  private particleRadius: number;

  /**
   * Creates a new cloth collision system.
   *
   * @param config - Configuration options
   */
  constructor(config: {
    friction?: number;
    restitution?: number;
    particleRadius?: number;
  } = {}) {
    this.friction = config.friction ?? 0.3;
    this.restitution = config.restitution ?? 0.0;
    this.particleRadius = config.particleRadius ?? 0.05;
  }

  /**
   * Adds a rigid body to collide with.
   *
   * @param body - Rigid body with collision shapes
   */
  addRigidBody(body: RigidBody): void {
    this.rigidBodies.push(body);
  }

  /**
   * Removes a rigid body.
   *
   * @param body - Rigid body to remove
   * @returns True if body was found and removed
   */
  removeRigidBody(body: RigidBody): boolean {
    const index = this.rigidBodies.indexOf(body);
    if (index !== -1) {
      this.rigidBodies.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Clears all rigid bodies.
   */
  clearRigidBodies(): void {
    this.rigidBodies = [];
  }

  /**
   * Detects collisions between cloth particles and rigid shapes.
   *
   * @param positions - Cloth particle positions
   * @param particleRadius - Radius of cloth particles
   * @returns Array of collision information
   */
  detectCollisions(
    positions: Vector3[],
    particleRadius?: number
  ): CollisionInfo[] {
    const radius = particleRadius ?? this.particleRadius;
    const collisions: CollisionInfo[] = [];

    for (const body of this.rigidBodies) {
      const transform = body.getWorldMatrix();

      for (const collider of body.colliders) {
        for (let i = 0; i < positions.length; i++) {
          const collision = this.detectShapeCollision(
            positions[i],
            radius,
            collider.shape,
            transform,
            i
          );

          if (collision) {
            collision.friction = this.friction * collider.material.dynamicFriction;
            collisions.push(collision);
          }
        }
      }
    }

    return collisions;
  }

  /**
   * Resolves collisions by adjusting positions and velocities.
   *
   * @param positions - Cloth particle positions (modified in-place)
   * @param velocities - Cloth particle velocities (modified in-place)
   * @param collisions - Array of collision information
   */
  resolveCollisions(
    positions: Vector3[],
    velocities: Vector3[],
    collisions: CollisionInfo[]
  ): void {
    for (const collision of collisions) {
      const i = collision.particleIndex;
      const p = positions[i];
      const v = velocities[i]!;

      // Move particle out of collision
      const correction = collision.normal.scale(collision.penetrationDepth);
      p!.addInPlace(correction);

      // Decompose velocity into normal and tangent
      const vn = collision.normal.scale(v.dot(collision.normal));
      const vt = v.sub(vn);

      // Apply restitution to normal velocity
      const vnNew = vn.scale(-this.restitution);

      // Apply friction to tangent velocity
      const vtNew = vt.scale(Math.max(0, 1.0 - collision.friction));

      // Combine
      velocities[i] = vnNew.add(vtNew);
    }
  }

  /**
   * Generates collision constraints for PBD solver.
   *
   * @param positions - Cloth particle positions
   * @param particleRadius - Radius of cloth particles
   * @returns Array of collision constraints
   */
  generateConstraints(
    positions: Vector3[],
    particleRadius?: number
  ): CollisionConstraint[] {
    const collisions = this.detectCollisions(positions, particleRadius);
    const constraints: CollisionConstraint[] = [];

    for (const collision of collisions) {
      const constraint = new CollisionConstraint(
        collision.particleIndex,
        collision.collisionPoint,
        collision.normal,
        collision.penetrationDepth
      );
      constraints.push(constraint);
    }

    return constraints;
  }

  /**
   * Detects collision between a particle and a shape.
   *
   * @param position - Particle position
   * @param radius - Particle radius
   * @param shape - Collision shape
   * @param transform - Shape transform matrix
   * @param particleIndex - Index of the particle
   * @returns Collision info if collision detected, null otherwise
   */
  private detectShapeCollision(
    position: Vector3,
    radius: number,
    shape: IShape,
    transform: Matrix4,
    particleIndex: number
  ): CollisionInfo | null {
    switch (shape.type) {
      case ShapeType.Sphere:
        return this.detectSphereCollision(
          position,
          radius,
          shape as SphereShape,
          transform,
          particleIndex
        );
      case ShapeType.Box:
        return this.detectBoxCollision(
          position,
          radius,
          shape as BoxShape,
          transform,
          particleIndex
        );
      case ShapeType.Capsule:
        return this.detectCapsuleCollision(
          position,
          radius,
          shape as CapsuleShape,
          transform,
          particleIndex
        );
      default:
        return null;
    }
  }

  /**
   * Detects collision with a sphere.
   */
  private detectSphereCollision(
    position: Vector3,
    radius: number,
    sphere: SphereShape,
    transform: Matrix4,
    particleIndex: number
  ): CollisionInfo | null {
    // Get sphere center in world space
    const center = this.transformPoint(sphere.offset, transform);
    const scale = this.getMaxScale(transform);
    const sphereRadius = sphere.radius * scale;

    // Calculate distance from particle to sphere center
    const delta = position.sub(center);
    const distance = delta.length();

    // Check if particle is inside sphere
    const combinedRadius = sphereRadius + radius;
    if (distance >= combinedRadius) return null;

    // Calculate collision normal (from sphere center to particle)
    const normal = distance > 0.0001
      ? delta.scale(1.0 / distance)
      : Vector3.up();

    const penetrationDepth = combinedRadius - distance;
    const collisionPoint = center.add(normal.scale(sphereRadius));

    return {
      particleIndex,
      collisionPoint,
      normal,
      penetrationDepth,
      friction: 0
    };
  }

  /**
   * Detects collision with a box.
   */
  private detectBoxCollision(
    position: Vector3,
    radius: number,
    box: BoxShape,
    transform: Matrix4,
    particleIndex: number
  ): CollisionInfo | null {
    // Transform particle to box local space
    const invTransform = transform.invert();
    if (!invTransform) return null;

    const localPos = this.transformPoint(position, invTransform);

    // Get box half extents
    const extents = box.extents;

    // Find closest point on box
    const closestPoint = new Vector3(
      Math.max(-extents.x, Math.min(extents.x, localPos.x)),
      Math.max(-extents.y, Math.min(extents.y, localPos.y)),
      Math.max(-extents.z, Math.min(extents.z, localPos.z))
    );

    // Calculate distance from particle to closest point
    const delta = localPos.sub(closestPoint);
    const distance = delta.length();

    // Check if particle is close enough
    if (distance >= radius) return null;

    // Calculate normal in local space
    let normal: Vector3;
    if (distance < 0.0001) {
      // Particle is inside box, find shortest axis
      const dx = Math.min(extents.x - Math.abs(localPos.x), Math.abs(localPos.x) + extents.x);
      const dy = Math.min(extents.y - Math.abs(localPos.y), Math.abs(localPos.y) + extents.y);
      const dz = Math.min(extents.z - Math.abs(localPos.z), Math.abs(localPos.z) + extents.z);

      if (dx < dy && dx < dz) {
        normal = new Vector3(localPos.x > 0 ? 1 : -1, 0, 0);
      } else if (dy < dz) {
        normal = new Vector3(0, localPos.y > 0 ? 1 : -1, 0);
      } else {
        normal = new Vector3(0, 0, localPos.z > 0 ? 1 : -1);
      }
    } else {
      normal = delta.scale(1.0 / distance);
    }

    // Transform normal to world space
    const worldNormal = this.transformDirection(normal, transform).normalize();

    const penetrationDepth = radius - distance;
    const collisionPoint = this.transformPoint(closestPoint, transform);

    return {
      particleIndex,
      collisionPoint,
      normal: worldNormal,
      penetrationDepth,
      friction: 0
    };
  }

  /**
   * Detects collision with a capsule.
   */
  private detectCapsuleCollision(
    position: Vector3,
    radius: number,
    capsule: CapsuleShape,
    transform: Matrix4,
    particleIndex: number
  ): CollisionInfo | null {
    // Transform to capsule local space
    const invTransform = transform.invert();
    if (!invTransform) return null;

    const localPos = this.transformPoint(position, invTransform);

    // Capsule is aligned with Y axis
    const halfHeight = capsule.height * 0.5 - capsule.radius;
    const p1 = new Vector3(0, -halfHeight, 0);
    const p2 = new Vector3(0, halfHeight, 0);

    // Find closest point on capsule line segment
    const line = p2.sub(p1);
    const lineLen = line.length();

    if (lineLen < 0.0001) {
      // Degenerate capsule, treat as sphere
      const delta = localPos.sub(p1);
      const distance = delta.length();
      const combinedRadius = capsule.radius + radius;

      if (distance >= combinedRadius) return null;

      const normal = distance > 0.0001
        ? delta.scale(1.0 / distance)
        : Vector3.up();

      const worldNormal = this.transformDirection(normal, transform).normalize();
      const penetrationDepth = combinedRadius - distance;
      const collisionPoint = this.transformPoint(
        p1.add(normal.scale(capsule.radius)),
        transform
      );

      return {
        particleIndex,
        collisionPoint,
        normal: worldNormal,
        penetrationDepth,
        friction: 0
      };
    }

    const t = Math.max(0, Math.min(1, localPos.sub(p1).dot(line) / (lineLen * lineLen)));
    const closestPoint = p1.add(line.scale(t));

    // Calculate distance to capsule surface
    const delta = localPos.sub(closestPoint);
    const distance = delta.length();
    const combinedRadius = capsule.radius + radius;

    if (distance >= combinedRadius) return null;

    const normal = distance > 0.0001
      ? delta.scale(1.0 / distance)
      : Vector3.up();

    const worldNormal = this.transformDirection(normal, transform).normalize();
    const penetrationDepth = combinedRadius - distance;
    const collisionPoint = this.transformPoint(
      closestPoint.add(normal.scale(capsule.radius)),
      transform
    );

    return {
      particleIndex,
      collisionPoint,
      normal: worldNormal,
      penetrationDepth,
      friction: 0
    };
  }

  /**
   * Transforms a point by a matrix.
   */
  private transformPoint(point: Vector3, matrix: Matrix4): Vector3 {
    const e = matrix.elements;
    const x = point.x * e[0]! + point.y * e[4]! + point.z * e[8]! + e[12]!;
    const y = point.x * e[1]! + point.y * e[5]! + point.z * e[9]! + e[13]!;
    const z = point.x * e[2]! + point.y * e[6]! + point.z * e[10]! + e[14]!;
    return new Vector3(x, y, z);
  }

  /**
   * Transforms a direction by a matrix (ignoring translation).
   */
  private transformDirection(dir: Vector3, matrix: Matrix4): Vector3 {
    const e = matrix.elements;
    const x = dir.x * e[0]! + dir.y * e[4]! + dir.z * e[8]!;
    const y = dir.x * e[1]! + dir.y * e[5]! + dir.z * e[9]!;
    const z = dir.x * e[2]! + dir.y * e[6]! + dir.z * e[10]!;
    return new Vector3(x, y, z);
  }

  /**
   * Gets the maximum scale component from a transform matrix.
   */
  private getMaxScale(matrix: Matrix4): number {
    const e = matrix.elements;
    const scaleX = Math.sqrt(e[0]! * e[0]! + e[1]! * e[1]! + e[2]! * e[2]!);
    const scaleY = Math.sqrt(e[4]! * e[4]! + e[5]! * e[5]! + e[6]! * e[6]!);
    const scaleZ = Math.sqrt(e[8]! * e[8]! + e[9]! * e[9]! + e[10]! * e[10]!);
    return Math.max(scaleX, scaleY, scaleZ);
  }

  /**
   * Sets the friction coefficient.
   *
   * @param friction - Friction coefficient (0-1)
   */
  setFriction(friction: number): void {
    this.friction = Math.max(0, Math.min(1, friction));
  }

  /**
   * Sets the restitution coefficient.
   *
   * @param restitution - Restitution coefficient (0-1)
   */
  setRestitution(restitution: number): void {
    this.restitution = Math.max(0, Math.min(1, restitution));
  }

  /**
   * Sets the particle radius for collision detection.
   *
   * @param radius - Particle radius
   */
  setParticleRadius(radius: number): void {
    this.particleRadius = Math.max(0, radius);
  }
}
