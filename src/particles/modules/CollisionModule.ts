/**
 * Collision module for particle world collision detection and response.
 * Supports bounce, friction, lifetime loss, and sub-emitter triggers.
 * @module CollisionModule
 */

import { Vector3 } from '../../math/Vector3';
import { Plane } from '../../math/Plane';
import { Ray } from '../../math/Ray';
import { IParticleModule, ParticleSystem } from '../ParticleSystem';
import { Particle } from '../Particle';
import { SubEmitter } from '../ParticleEmitter';

/**
 * Collision mode types.
 */
export enum CollisionMode {
  /** Collide with world planes */
  Planes = 'Planes',
  /** Collide with world sphere */
  Sphere = 'Sphere',
  /** Collide with world box */
  Box = 'Box',
  /** Collide with custom collision function */
  Custom = 'Custom',
}

/**
 * Collision plane configuration.
 */
export interface CollisionPlane {
  /** Plane normal */
  normal: Vector3;
  /** Distance from origin */
  distance: number;
}

/**
 * Collision response types.
 */
export enum CollisionResponse {
  /** Bounce off surface */
  Bounce = 'Bounce',
  /** Stick to surface */
  Stick = 'Stick',
  /** Kill particle */
  Kill = 'Kill',
  /** Pass through (trigger only) */
  Trigger = 'Trigger',
}

/**
 * Custom collision function.
 */
export type CollisionFunction = (
  particle: Particle,
  deltaTime: number
) => { collided: boolean; position?: Vector3; normal?: Vector3 } | null;

/**
 * Collision module configuration.
 */
export interface CollisionModuleConfig {
  /** Collision mode */
  mode?: CollisionMode;
  /** Collision response */
  response?: CollisionResponse;
  /** Bounce coefficient [0-1] */
  bounce?: number;
  /** Friction coefficient [0-1] */
  friction?: number;
  /** Lifetime loss on collision [0-1] */
  lifetimeLoss?: number;
  /** Minimum velocity to collide */
  minVelocity?: number;
  /** Collision planes */
  planes?: CollisionPlane[];
  /** Collision sphere center */
  sphereCenter?: Vector3;
  /** Collision sphere radius */
  sphereRadius?: number;
  /** Collision sphere invert (inside collision) */
  sphereInvert?: boolean;
  /** Collision box center */
  boxCenter?: Vector3;
  /** Collision box size */
  boxSize?: Vector3;
  /** Collision box invert (inside collision) */
  boxInvert?: boolean;
  /** Custom collision function */
  customCollision?: CollisionFunction;
  /** Sub-emitters on collision */
  subEmitters?: SubEmitter[];
  /** Collision quality (raycast steps) */
  quality?: number;
}

/**
 * Collision module.
 *
 * Handles particle collision with world geometry. Supports various collision
 * shapes, responses, and sub-emitter triggers on collision events.
 *
 * Features:
 * - Multiple collision shapes (planes, sphere, box, custom)
 * - Bounce and friction
 * - Lifetime loss on collision
 * - Sub-emitter spawning on collision
 * - Continuous collision detection
 *
 * @example
 * ```typescript
 * // Ground plane collision
 * const groundCollision = new CollisionModule({
 *   mode: CollisionMode.Planes,
 *   response: CollisionResponse.Bounce,
 *   bounce: 0.5,
 *   friction: 0.1,
 *   planes: [
 *     { normal: new Vector3(0, 1, 0), distance: 0 },
 *   ],
 * });
 *
 * // Sphere collision (inside)
 * const sphereCollision = new CollisionModule({
 *   mode: CollisionMode.Sphere,
 *   response: CollisionResponse.Bounce,
 *   sphereCenter: new Vector3(0, 5, 0),
 *   sphereRadius: 10,
 *   sphereInvert: true,
 *   bounce: 0.8,
 * });
 *
 * // Kill on collision
 * const killCollision = new CollisionModule({
 *   mode: CollisionMode.Planes,
 *   response: CollisionResponse.Kill,
 *   lifetimeLoss: 1.0,
 *   planes: [
 *     { normal: new Vector3(0, 1, 0), distance: -5 },
 *   ],
 * });
 *
 * system.addModule(groundCollision);
 * ```
 */
export class CollisionModule implements IParticleModule {
  readonly name: string = 'CollisionModule';
  enabled: boolean = true;
  priority: number = 40; // Run late, after forces

  /** Collision mode */
  mode: CollisionMode = CollisionMode.Planes;

  /** Collision response */
  response: CollisionResponse = CollisionResponse.Bounce;

  /** Bounce coefficient */
  bounce: number = 0.5;

  /** Friction coefficient */
  friction: number = 0.1;

  /** Lifetime loss on collision */
  lifetimeLoss: number = 0;

  /** Minimum velocity to collide */
  minVelocity: number = 0;

  /** Collision planes */
  readonly planes: CollisionPlane[] = [];

  /** Sphere collision */
  readonly sphereCenter: Vector3 = new Vector3();
  sphereRadius: number = 1.0;
  sphereInvert: boolean = false;

  /** Box collision */
  readonly boxCenter: Vector3 = new Vector3();
  readonly boxSize: Vector3 = new Vector3(1, 1, 1);
  boxInvert: boolean = false;

  /** Custom collision function */
  customCollision: CollisionFunction | null = null;

  /** Sub-emitters */
  readonly subEmitters: SubEmitter[] = [];

  /** Collision quality */
  quality: number = 1;

  /** Temporary vectors */
  private static readonly _tempVector1 = new Vector3();
  private static readonly _tempVector2 = new Vector3();
  private static readonly _tempVector3 = new Vector3();
  private static readonly _tempPlane = new Plane();

  /**
   * Create a new collision module.
   *
   * @param config - Module configuration
   */
  constructor(config: CollisionModuleConfig = {}) {
    this.mode = config.mode ?? CollisionMode.Planes;
    this.response = config.response ?? CollisionResponse.Bounce;
    this.bounce = config.bounce ?? 0.5;
    this.friction = config.friction ?? 0.1;
    this.lifetimeLoss = config.lifetimeLoss ?? 0;
    this.minVelocity = config.minVelocity ?? 0;
    this.sphereRadius = config.sphereRadius ?? 1.0;
    this.sphereInvert = config.sphereInvert ?? false;
    this.boxInvert = config.boxInvert ?? false;
    this.quality = config.quality ?? 1;

    if (config.planes) {
      this.planes.push(...config.planes);
    }

    if (config.sphereCenter) {
      this.sphereCenter.copy(config.sphereCenter);
    }

    if (config.boxCenter) {
      this.boxCenter.copy(config.boxCenter);
    }

    if (config.boxSize) {
      this.boxSize.copy(config.boxSize);
    }

    if (config.customCollision) {
      this.customCollision = config.customCollision;
    }

    if (config.subEmitters) {
      this.subEmitters.push(...config.subEmitters);
    }
  }

  /**
   * Add a collision plane.
   *
   * @param normal - Plane normal
   * @param distance - Distance from origin
   */
  addPlane(normal: Vector3, distance: number): void {
    this.planes.push({
      normal: normal.clone().normalize(),
      distance,
    });
  }

  /**
   * Update particle collision.
   *
   * @param particle - Particle to update
   * @param deltaTime - Time step in seconds
   * @param system - Parent particle system
   */
  updateParticle(particle: Particle, deltaTime: number, system: ParticleSystem): void {
    // Check minimum velocity
    const speed = particle.velocity.length();
    if (speed < this.minVelocity) {
      return;
    }

    let collisionResult: {
      collided: boolean;
      position?: Vector3;
      normal?: Vector3;
    } | null = null;

    // Detect collision based on mode
    switch (this.mode) {
      case CollisionMode.Planes:
        collisionResult = this.checkPlaneCollision(particle);
        break;
      case CollisionMode.Sphere:
        collisionResult = this.checkSphereCollision(particle);
        break;
      case CollisionMode.Box:
        collisionResult = this.checkBoxCollision(particle);
        break;
      case CollisionMode.Custom:
        if (this.customCollision) {
          collisionResult = this.customCollision(particle, deltaTime);
        }
        break;
    }

    // Handle collision
    if (collisionResult && collisionResult.collided) {
      this.handleCollision(particle, collisionResult, system);
    }
  }

  /**
   * Check plane collision.
   */
  private checkPlaneCollision(particle: Particle): {
    collided: boolean;
    position?: Vector3;
    normal?: Vector3;
  } | null {
    for (const planeData of this.planes) {
      const plane = CollisionModule._tempPlane;
      plane.normal.copy(planeData.normal);
      plane.constant = -planeData.distance;

      const distance = plane.distanceToPoint(particle.position);

      // Check if particle crossed the plane
      if (distance < 0) {
        // Project particle back onto plane
        const correction = CollisionModule._tempVector1
          .copy(plane.normal)
          .multiplyScalar(-distance);

        const correctedPos = CollisionModule._tempVector2
          .copy(particle.position)
          .add(correction);

        return {
          collided: true,
          position: correctedPos,
          normal: plane.normal.clone(),
        };
      }
    }

    return null;
  }

  /**
   * Check sphere collision.
   */
  private checkSphereCollision(particle: Particle): {
    collided: boolean;
    position?: Vector3;
    normal?: Vector3;
  } | null {
    const toParticle = CollisionModule._tempVector1
      .copy(particle.position)
      .sub(this.sphereCenter);

    const distance = toParticle.length();

    const collided = this.sphereInvert
      ? distance > this.sphereRadius
      : distance < this.sphereRadius;

    if (collided) {
      toParticle.normalize();

      const correctedPos = CollisionModule._tempVector2
        .copy(this.sphereCenter)
        .add(toParticle.multiplyScalar(this.sphereRadius));

      const normal = this.sphereInvert
        ? toParticle.clone().negate()
        : toParticle.clone();

      return {
        collided: true,
        position: correctedPos,
        normal,
      };
    }

    return null;
  }

  /**
   * Check box collision.
   */
  private checkBoxCollision(particle: Particle): {
    collided: boolean;
    position?: Vector3;
    normal?: Vector3;
  } | null {
    const relPos = CollisionModule._tempVector1
      .copy(particle.position)
      .sub(this.boxCenter);

    const halfSize = CollisionModule._tempVector2
      .copy(this.boxSize)
      .multiplyScalar(0.5);

    const inside =
      Math.abs(relPos.x) < halfSize.x &&
      Math.abs(relPos.y) < halfSize.y &&
      Math.abs(relPos.z) < halfSize.z;

    const collided = this.boxInvert ? !inside : inside;

    if (collided) {
      // Find closest face
      const dx = halfSize.x - Math.abs(relPos.x);
      const dy = halfSize.y - Math.abs(relPos.y);
      const dz = halfSize.z - Math.abs(relPos.z);

      let normal = new Vector3();
      let correctedPos = particle.position.clone();

      if (dx < dy && dx < dz) {
        // X face
        normal.set(Math.sign(relPos.x), 0, 0);
        correctedPos.x = this.boxCenter.x + Math.sign(relPos.x) * halfSize.x;
      } else if (dy < dz) {
        // Y face
        normal.set(0, Math.sign(relPos.y), 0);
        correctedPos.y = this.boxCenter.y + Math.sign(relPos.y) * halfSize.y;
      } else {
        // Z face
        normal.set(0, 0, Math.sign(relPos.z));
        correctedPos.z = this.boxCenter.z + Math.sign(relPos.z) * halfSize.z;
      }

      if (this.boxInvert) {
        normal.negate();
      }

      return {
        collided: true,
        position: correctedPos,
        normal,
      };
    }

    return null;
  }

  /**
   * Handle collision response.
   */
  private handleCollision(
    particle: Particle,
    collision: { position?: Vector3; normal?: Vector3 },
    system: ParticleSystem
  ): void {
    // Update position
    if (collision.position) {
      particle.position.copy(collision.position);
    }

    // Apply response
    switch (this.response) {
      case CollisionResponse.Bounce:
        if (collision.normal) {
          this.applyBounce(particle, collision.normal);
        }
        break;

      case CollisionResponse.Stick:
        particle.velocity.set(0, 0, 0);
        particle.acceleration.set(0, 0, 0);
        break;

      case CollisionResponse.Kill:
        particle.active = false;
        break;

      case CollisionResponse.Trigger:
        // Do nothing to velocity
        break;
    }

    // Apply lifetime loss
    if (this.lifetimeLoss > 0) {
      particle.age += particle.lifetime * this.lifetimeLoss;
    }

    // Trigger sub-emitters
    for (const subEmitter of this.subEmitters) {
      if (subEmitter.emitOnCollision) {
        this.triggerSubEmitter(particle, subEmitter, system);
      }
    }

    // Mark collision in custom data
    particle.setCustomData('collided', true);
    particle.setCustomData('collisionNormal', collision.normal);
  }

  /**
   * Apply bounce response.
   */
  private applyBounce(particle: Particle, normal: Vector3): void {
    // Reflect velocity
    const dotProduct = particle.velocity.dot(normal);
    const reflection = CollisionModule._tempVector1
      .copy(normal)
      .multiplyScalar(2 * dotProduct);

    particle.velocity.sub(reflection);

    // Apply bounce damping
    particle.velocity.multiplyScalar(this.bounce);

    // Apply friction (perpendicular to normal)
    const normalVelocity = CollisionModule._tempVector2
      .copy(normal)
      .multiplyScalar(particle.velocity.dot(normal));

    const tangentVelocity = CollisionModule._tempVector3
      .copy(particle.velocity)
      .sub(normalVelocity);

    tangentVelocity.multiplyScalar(1 - this.friction);

    particle.velocity.copy(normalVelocity).add(tangentVelocity);
  }

  /**
   * Trigger sub-emitter.
   */
  private triggerSubEmitter(
    particle: Particle,
    subEmitter: SubEmitter,
    system: ParticleSystem
  ): void {
    // Set emitter position
    subEmitter.emitter.setPosition(
      particle.position.x,
      particle.position.y,
      particle.position.z
    );

    // Emit particles
    for (let i = 0; i < subEmitter.count; i++) {
      const newParticle = system.emit();
      if (!newParticle) break;

      // Inherit velocity if configured
      if (subEmitter.inheritVelocity) {
        const inheritedVel = CollisionModule._tempVector1
          .copy(particle.velocity)
          .multiplyScalar(subEmitter.inheritFactor);
        newParticle.velocity.add(inheritedVel);
      }
    }
  }

  /**
   * Clear all planes.
   */
  clearPlanes(): void {
    this.planes.length = 0;
  }

  /**
   * Add sub-emitter.
   *
   * @param subEmitter - Sub-emitter configuration
   */
  addSubEmitter(subEmitter: SubEmitter): void {
    this.subEmitters.push(subEmitter);
  }
}
