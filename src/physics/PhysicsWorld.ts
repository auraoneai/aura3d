/**
 * Physics simulation world managing rigid bodies and collision detection.
 *
 * @module Physics/PhysicsWorld
 */

import { Vector3 } from '../math/Vector3';
import { RigidBody, BodyType } from './RigidBody';
import { Collision, CollisionManifold } from './Collision';
import { CollisionPair } from './CollisionPair';
import { Constraint } from './Constraint';
import { Matrix4 } from '../math/Matrix4';
import { AABBUtils } from './Collider';

/**
 * Collision event data.
 */
export interface CollisionEvent {
  bodyA: RigidBody;
  bodyB: RigidBody;
  manifold: CollisionManifold;
}

/**
 * Physics world configuration options.
 */
export interface PhysicsWorldOptions {
  gravity?: Vector3;
  fixedTimestep?: number;
  maxSubsteps?: number;
  broadphaseType?: 'naive' | 'sweep-and-prune';
}

/**
 * Main physics world for simulation.
 *
 * Manages rigid bodies, collision detection, and constraint solving.
 *
 * @example
 * ```typescript
 * const world = new PhysicsWorld({
 *   gravity: new Vector3(0, -9.81, 0),
 *   fixedTimestep: 1/60
 * });
 *
 * const body = new RigidBody({ mass: 10 });
 * world.addRigidBody(body);
 *
 * world.step(deltaTime);
 * ```
 */
export class PhysicsWorld {
  gravity: Vector3;
  fixedTimestep: number;
  maxSubsteps: number;
  bodies: RigidBody[];
  constraints: Constraint[];
  
  private accumulator: number;
  private collisionPairs: Map<string, CollisionPair>;
  private onCollisionEnter: ((event: CollisionEvent) => void)[];
  private onCollisionStay: ((event: CollisionEvent) => void)[];
  private onCollisionExit: ((event: CollisionEvent) => void)[];

  /**
   * Creates a new physics world.
   */
  constructor(options: PhysicsWorldOptions = {}) {
    this.gravity = options.gravity ?? new Vector3(0, -9.81, 0);
    this.fixedTimestep = options.fixedTimestep ?? 1 / 60;
    this.maxSubsteps = options.maxSubsteps ?? 5;
    this.bodies = [];
    this.constraints = [];
    this.accumulator = 0;
    this.collisionPairs = new Map();
    this.onCollisionEnter = [];
    this.onCollisionStay = [];
    this.onCollisionExit = [];
  }

  /**
   * Adds a rigid body to the world.
   */
  addRigidBody(body: RigidBody): void {
    if (!this.bodies.includes(body)) {
      this.bodies.push(body);
    }
  }

  /**
   * Removes a rigid body from the world.
   */
  removeRigidBody(body: RigidBody): void {
    const index = this.bodies.indexOf(body);
    if (index !== -1) {
      this.bodies.splice(index, 1);
    }
  }

  /**
   * Adds a constraint to the world.
   */
  addConstraint(constraint: Constraint): void {
    if (!this.constraints.includes(constraint)) {
      this.constraints.push(constraint);
    }
  }

  /**
   * Removes a constraint from the world.
   */
  removeConstraint(constraint: Constraint): void {
    const index = this.constraints.indexOf(constraint);
    if (index !== -1) {
      this.constraints.splice(index, 1);
    }
  }

  /**
   * Steps the simulation forward by deltaTime using fixed timestep.
   *
   * @param deltaTime - Time elapsed since last frame
   */
  step(deltaTime: number): void {
    this.accumulator += deltaTime;

    let substeps = 0;
    while (this.accumulator >= this.fixedTimestep && substeps < this.maxSubsteps) {
      this.fixedStep(this.fixedTimestep);
      this.accumulator -= this.fixedTimestep;
      substeps++;
    }

    // Clamp accumulator to prevent spiral of death
    if (this.accumulator > this.fixedTimestep) {
      this.accumulator = this.fixedTimestep;
    }
  }

  /**
   * Performs one fixed timestep simulation.
   */
  private fixedStep(dt: number): void {
    // Integration
    for (const body of this.bodies) {
      body.integrate(dt, this.gravity);
    }

    // Broad phase collision detection
    const broadPhasePairs = this.broadPhase();

    // Narrow phase collision detection
    const currentPairs = new Set<string>();
    const collisionEvents: CollisionEvent[] = [];

    for (const [bodyA, bodyB] of broadPhasePairs) {
      for (const colliderA of bodyA.colliders) {
        for (const colliderB of bodyB.colliders) {
          if (!colliderA.canCollideWith(colliderB)) continue;

          const manifold = Collision.testCollision(
            colliderA,
            colliderB,
            bodyA.getWorldMatrix(),
            bodyB.getWorldMatrix()
          );

          if (manifold) {
            const pairId = CollisionPair.generateId(colliderA, colliderB);
            currentPairs.add(pairId);

            const isNewCollision = !this.collisionPairs.has(pairId);
            
            if (isNewCollision) {
              const pair = new CollisionPair(colliderA, colliderB);
              this.collisionPairs.set(pairId, pair);
              
              collisionEvents.push({
                bodyA,
                bodyB,
                manifold
              });
            }

            // Collision response (simplified)
            if (!colliderA.isTrigger && !colliderB.isTrigger) {
              this.resolveCollision(bodyA, bodyB, manifold);
            }
          }
        }
      }
    }

    // Detect collision exits
    const exitPairs: string[] = [];
    for (const [pairId, pair] of this.collisionPairs) {
      if (!currentPairs.has(pairId)) {
        exitPairs.push(pairId);
      }
    }

    // Remove old pairs
    for (const pairId of exitPairs) {
      this.collisionPairs.delete(pairId);
    }

    // Fire collision events
    for (const event of collisionEvents) {
      for (const callback of this.onCollisionEnter) {
        callback(event);
      }
    }

    // Solve constraints
    for (const constraint of this.constraints) {
      constraint.solve(dt);
    }
  }

  /**
   * Broad phase collision detection (naive O(n²) for now).
   */
  private broadPhase(): [RigidBody, RigidBody][] {
    const pairs: [RigidBody, RigidBody][] = [];

    for (let i = 0; i < this.bodies.length; i++) {
      for (let j = i + 1; j < this.bodies.length; j++) {
        const bodyA = this.bodies[i];
        const bodyB = this.bodies[j];

        // Skip if both are static
        if (bodyA.type === BodyType.Static && bodyB.type === BodyType.Static) {
          continue;
        }

        // Skip if both are sleeping
        if (bodyA.isSleeping && bodyB.isSleeping) {
          continue;
        }

        // AABB overlap test
        if (bodyA.colliders.length > 0 && bodyB.colliders.length > 0) {
          const aabbA = bodyA.colliders[0].getAABB(bodyA.getWorldMatrix());
          const aabbB = bodyB.colliders[0].getAABB(bodyB.getWorldMatrix());

          if (AABBUtils.overlaps(aabbA, aabbB)) {
            pairs.push([bodyA, bodyB]);
          }
        }
      }
    }

    return pairs;
  }

  /**
   * Resolves collision between two bodies (simplified impulse resolution).
   */
  private resolveCollision(bodyA: RigidBody, bodyB: RigidBody, manifold: CollisionManifold): void {
    if (manifold.contacts.length === 0) return;

    const contact = manifold.contacts[0];
    const normal = contact.normal;

    // Separate bodies
    const correction = normal.scale(contact.penetration * 0.8);

    if (bodyA.type === BodyType.Dynamic && bodyB.type === BodyType.Dynamic) {
      bodyA.position.addInPlace(correction.scale(-0.5));
      bodyB.position.addInPlace(correction.scale(0.5));
    } else if (bodyA.type === BodyType.Dynamic) {
      bodyA.position.addInPlace(correction.scale(-1));
    } else if (bodyB.type === BodyType.Dynamic) {
      bodyB.position.addInPlace(correction);
    }

    // Apply impulse (simplified)
    const relativeVel = bodyB.linearVelocity.sub(bodyA.linearVelocity);
    const velAlongNormal = relativeVel.dot(normal);

    if (velAlongNormal > 0) return; // Bodies moving apart

    const restitution = Math.min(
      manifold.colliderA.material.restitution,
      manifold.colliderB.material.restitution
    );

    const j = -(1 + restitution) * velAlongNormal;
    const impulse = normal.scale(j / (bodyA.inverseMass + bodyB.inverseMass));

    if (bodyA.type === BodyType.Dynamic) {
      bodyA.applyImpulse(impulse.negate());
    }
    if (bodyB.type === BodyType.Dynamic) {
      bodyB.applyImpulse(impulse);
    }
  }

  /**
   * Registers callback for collision enter events.
   */
  addEventListener(event: 'collisionenter', callback: (event: CollisionEvent) => void): void {
    this.onCollisionEnter.push(callback);
  }

  /**
   * Clears the world.
   */
  clear(): void {
    this.bodies = [];
    this.constraints = [];
    this.collisionPairs.clear();
    this.accumulator = 0;
  }

  /**
   * Gets number of active bodies (not sleeping).
   */
  getActiveBodies(): number {
    return this.bodies.filter(b => !b.isSleeping).length;
  }
}
