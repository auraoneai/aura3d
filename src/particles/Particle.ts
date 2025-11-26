/**
 * Individual particle data structure for particle systems.
 * Represents a single particle instance with all its properties.
 * @module Particle
 */

import { Vector3 } from '../math/Vector3';
import { Color } from '../math/Color';
import { IPoolable } from '../types';

/**
 * Custom data storage for particle modules.
 * Allows modules to attach custom data to particles without modifying the core structure.
 */
export interface ParticleCustomData {
  [key: string]: any;
}

/**
 * Individual particle instance.
 *
 * Represents a single particle in a particle system with all its properties including
 * position, velocity, color, size, rotation, and lifetime tracking. Designed for
 * efficient pooling and minimal memory allocations.
 *
 * Features:
 * - Position, velocity, and acceleration vectors
 * - Color and alpha with per-channel support
 * - Size with independent X/Y/Z scaling
 * - 3D rotation with angular velocity
 * - Lifetime and age tracking
 * - Normalized lifetime (0-1) for curve sampling
 * - Custom data slots for module-specific data
 * - Poolable for efficient reuse
 *
 * @example
 * ```typescript
 * // Create a particle
 * const particle = new Particle();
 * particle.position.set(0, 5, 0);
 * particle.velocity.set(1, 2, 0);
 * particle.color.set(1, 0, 0, 1);
 * particle.size.set(1, 1, 1);
 * particle.lifetime = 2.0;
 *
 * // Update particle
 * particle.update(0.016);
 *
 * // Check if alive
 * if (!particle.isDead()) {
 *   // Render particle
 * }
 *
 * // Reset for pooling
 * particle.reset();
 * ```
 */
export class Particle implements IPoolable {
  // ============================================================================
  // Position and Movement
  // ============================================================================

  /** Current position in world space */
  readonly position: Vector3 = new Vector3();

  /** Current velocity vector */
  readonly velocity: Vector3 = new Vector3();

  /** Current acceleration vector */
  readonly acceleration: Vector3 = new Vector3();

  /** Initial position (for some emitter types) */
  readonly startPosition: Vector3 = new Vector3();

  /** Initial velocity (for velocity inheritance) */
  readonly startVelocity: Vector3 = new Vector3();

  // ============================================================================
  // Appearance
  // ============================================================================

  /** Current color and alpha */
  readonly color: Color = new Color(1, 1, 1, 1);

  /** Initial color (for gradient interpolation) */
  readonly startColor: Color = new Color(1, 1, 1, 1);

  /** Size on each axis (for non-uniform scaling) */
  readonly size: Vector3 = new Vector3(1, 1, 1);

  /** Initial size */
  readonly startSize: Vector3 = new Vector3(1, 1, 1);

  /** Current rotation in radians (euler angles) */
  readonly rotation: Vector3 = new Vector3();

  /** Angular velocity in radians per second */
  readonly angularVelocity: Vector3 = new Vector3();

  /** Initial rotation */
  readonly startRotation: Vector3 = new Vector3();

  // ============================================================================
  // Lifetime Tracking
  // ============================================================================

  /** Total lifetime in seconds */
  lifetime: number = 1.0;

  /** Current age in seconds */
  age: number = 0;

  /** Normalized lifetime [0-1] (age / lifetime) */
  normalizedAge: number = 0;

  /** Inverse lifetime (1 / lifetime) for efficient computation */
  invLifetime: number = 1.0;

  /** Whether this particle is active */
  active: boolean = true;

  // ============================================================================
  // Physics and Forces
  // ============================================================================

  /** Drag coefficient for air resistance */
  drag: number = 0;

  /** Mass of the particle (for force calculations) */
  mass: number = 1.0;

  /** Inverse mass (1 / mass) for efficient computation */
  invMass: number = 1.0;

  // ============================================================================
  // Rendering
  // ============================================================================

  /** Texture atlas frame index (for sprite sheet animations) */
  frame: number = 0;

  /** Normalized frame [0-1] for interpolation */
  normalizedFrame: number = 0;

  /** Frames per second for animation */
  frameRate: number = 0;

  /** Random seed for this particle */
  randomSeed: number = 0;

  // ============================================================================
  // Custom Data
  // ============================================================================

  /** Custom data storage for modules */
  readonly customData: ParticleCustomData = {};

  // ============================================================================
  // Temporary Vectors (for calculations)
  // ============================================================================

  private static readonly _tempVector1 = new Vector3();
  private static readonly _tempVector2 = new Vector3();

  /**
   * Create a new particle.
   * Initializes all properties to default values.
   */
  constructor() {
    this.reset();
  }

  /**
   * Initialize particle with start values.
   * Called when particle is emitted from the system.
   *
   * @param position - Initial position
   * @param velocity - Initial velocity
   * @param color - Initial color
   * @param size - Initial size
   * @param lifetime - Particle lifetime in seconds
   * @param rotation - Initial rotation (optional)
   */
  initialize(
    position: Vector3,
    velocity: Vector3,
    color: Color,
    size: Vector3 | number,
    lifetime: number,
    rotation?: Vector3
  ): void {
    // Set position
    this.position.copy(position);
    this.startPosition.copy(position);

    // Set velocity
    this.velocity.copy(velocity);
    this.startVelocity.copy(velocity);

    // Set color
    this.color.copy(color);
    this.startColor.copy(color);

    // Set size
    if (typeof size === 'number') {
      this.size.set(size, size, size);
      this.startSize.set(size, size, size);
    } else {
      this.size.copy(size);
      this.startSize.copy(size);
    }

    // Set rotation
    if (rotation) {
      this.rotation.copy(rotation);
      this.startRotation.copy(rotation);
    } else {
      this.rotation.set(0, 0, 0);
      this.startRotation.set(0, 0, 0);
    }

    // Set lifetime
    this.lifetime = lifetime;
    this.invLifetime = 1.0 / Math.max(lifetime, 0.0001);
    this.age = 0;
    this.normalizedAge = 0;

    // Set mass
    this.invMass = 1.0 / Math.max(this.mass, 0.0001);

    // Reset acceleration
    this.acceleration.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);

    // Reset frame
    this.frame = 0;
    this.normalizedFrame = 0;

    // Activate
    this.active = true;
  }

  /**
   * Update particle state.
   * Advances particle simulation by the given time step.
   *
   * @param deltaTime - Time step in seconds
   */
  update(deltaTime: number): void {
    if (!this.active) return;

    // Update age
    this.age += deltaTime;
    this.normalizedAge = Math.min(this.age * this.invLifetime, 1.0);

    // Check if particle should die
    if (this.age >= this.lifetime) {
      this.active = false;
      return;
    }

    // Apply acceleration to velocity
    if (this.acceleration.lengthSquared() > 0) {
      Particle._tempVector1.copy(this.acceleration).multiplyScalar(deltaTime);
      this.velocity.add(Particle._tempVector1);
    }

    // Apply drag
    if (this.drag > 0) {
      const dragFactor = Math.max(0, 1 - this.drag * deltaTime);
      this.velocity.multiplyScalar(dragFactor);
    }

    // Apply velocity to position
    if (this.velocity.lengthSquared() > 0) {
      Particle._tempVector1.copy(this.velocity).multiplyScalar(deltaTime);
      this.position.add(Particle._tempVector1);
    }

    // Apply angular velocity to rotation
    if (this.angularVelocity.lengthSquared() > 0) {
      Particle._tempVector1.copy(this.angularVelocity).multiplyScalar(deltaTime);
      this.rotation.add(Particle._tempVector1);
    }

    // Update frame animation
    if (this.frameRate > 0) {
      this.normalizedFrame = (this.age * this.frameRate) % 1.0;
      this.frame = Math.floor(this.normalizedFrame * 100); // Assuming 100 frames max
    }
  }

  /**
   * Apply a force to the particle.
   * Force is converted to acceleration based on particle mass.
   *
   * @param force - Force vector to apply
   */
  applyForce(force: Vector3): void {
    Particle._tempVector1.copy(force).multiplyScalar(this.invMass);
    this.acceleration.add(Particle._tempVector1);
  }

  /**
   * Apply an impulse to the particle.
   * Impulse directly modifies velocity.
   *
   * @param impulse - Impulse vector to apply
   */
  applyImpulse(impulse: Vector3): void {
    Particle._tempVector1.copy(impulse).multiplyScalar(this.invMass);
    this.velocity.add(Particle._tempVector1);
  }

  /**
   * Check if particle is dead.
   *
   * @returns True if particle has exceeded its lifetime or is inactive
   */
  isDead(): boolean {
    return !this.active || this.age >= this.lifetime;
  }

  /**
   * Check if particle is alive.
   *
   * @returns True if particle is still active
   */
  isAlive(): boolean {
    return this.active && this.age < this.lifetime;
  }

  /**
   * Get remaining lifetime as a normalized value [0-1].
   *
   * @returns 1.0 at birth, 0.0 at death
   */
  getRemainingLifetime(): number {
    return Math.max(0, 1.0 - this.normalizedAge);
  }

  /**
   * Set custom data for a module.
   *
   * @param key - Data key
   * @param value - Data value
   */
  setCustomData(key: string, value: any): void {
    this.customData[key] = value;
  }

  /**
   * Get custom data for a module.
   *
   * @param key - Data key
   * @param defaultValue - Default value if not found
   * @returns The stored value or default
   */
  getCustomData<T = any>(key: string, defaultValue?: T): T {
    return this.customData[key] !== undefined ? this.customData[key] : defaultValue!;
  }

  /**
   * Reset particle to initial state for pooling.
   * Clears all properties and prepares for reuse.
   */
  reset(): void {
    this.position.set(0, 0, 0);
    this.velocity.set(0, 0, 0);
    this.acceleration.set(0, 0, 0);
    this.startPosition.set(0, 0, 0);
    this.startVelocity.set(0, 0, 0);

    this.color.set(1, 1, 1, 1);
    this.startColor.set(1, 1, 1, 1);
    this.size.set(1, 1, 1);
    this.startSize.set(1, 1, 1);
    this.rotation.set(0, 0, 0);
    this.angularVelocity.set(0, 0, 0);
    this.startRotation.set(0, 0, 0);

    this.lifetime = 1.0;
    this.age = 0;
    this.normalizedAge = 0;
    this.invLifetime = 1.0;

    this.drag = 0;
    this.mass = 1.0;
    this.invMass = 1.0;

    this.frame = 0;
    this.normalizedFrame = 0;
    this.frameRate = 0;
    this.randomSeed = 0;

    this.active = false;

    // Clear custom data
    for (const key in this.customData) {
      delete this.customData[key];
    }
  }

  /**
   * Copy values from another particle.
   *
   * @param source - Particle to copy from
   */
  copy(source: Particle): this {
    this.position.copy(source.position);
    this.velocity.copy(source.velocity);
    this.acceleration.copy(source.acceleration);
    this.startPosition.copy(source.startPosition);
    this.startVelocity.copy(source.startVelocity);

    this.color.copy(source.color);
    this.startColor.copy(source.startColor);
    this.size.copy(source.size);
    this.startSize.copy(source.startSize);
    this.rotation.copy(source.rotation);
    this.angularVelocity.copy(source.angularVelocity);
    this.startRotation.copy(source.startRotation);

    this.lifetime = source.lifetime;
    this.age = source.age;
    this.normalizedAge = source.normalizedAge;
    this.invLifetime = source.invLifetime;

    this.drag = source.drag;
    this.mass = source.mass;
    this.invMass = source.invMass;

    this.frame = source.frame;
    this.normalizedFrame = source.normalizedFrame;
    this.frameRate = source.frameRate;
    this.randomSeed = source.randomSeed;

    this.active = source.active;

    // Copy custom data
    for (const key in source.customData) {
      this.customData[key] = source.customData[key];
    }

    return this;
  }
}
