/**
 * @fileoverview Wander steering behavior - random exploration movement.
 * @module ai/steering/Wander
 */

import { Vector3 } from '../../math/Vector3';
import { SteeringBehavior } from './SteeringBehavior';

/**
 * Wander behavior creates seemingly random movement by projecting a circle in front
 * of the agent and randomly displacing a target point on that circle each frame.
 *
 * @example
 * ```typescript
 * const wander = new Wander({
 *   radius: 5,
 *   distance: 10,
 *   jitter: 1.0
 * });
 *
 * // In update loop
 * const force = wander.calculate(agentPos, agentVel, maxSpeed);
 * agentVel.addInPlace(force.scale(deltaTime));
 * ```
 */
export class Wander extends SteeringBehavior {
  /** Radius of the wander circle */
  radius: number;

  /** Distance to project wander circle in front of agent */
  distance: number;

  /** Maximum random displacement per frame */
  jitter: number;

  /** Current wander target (on unit circle) */
  private wanderTarget: Vector3;

  /**
   * Creates a new wander behavior.
   *
   * @param options - Optional configuration
   */
  constructor(
    options: {
      radius?: number;
      distance?: number;
      jitter?: number;
      weight?: number;
      priority?: number;
      enabled?: boolean;
    } = {}
  ) {
    super({ ...options, name: 'Wander' });
    this.radius = options.radius ?? 5.0;
    this.distance = options.distance ?? 10.0;
    this.jitter = options.jitter ?? 1.0;

    // Initialize wander target on unit circle
    const theta = Math.random() * Math.PI * 2;
    this.wanderTarget = new Vector3(Math.cos(theta), 0, Math.sin(theta));
  }

  /**
   * Calculates the wander steering force.
   *
   * @param position - Current agent position
   * @param velocity - Current agent velocity
   * @param maxSpeed - Maximum agent speed
   * @returns Steering force vector
   */
  calculate(position: Vector3, velocity: Vector3, maxSpeed: number): Vector3 {
    // Add random jitter to wander target
    const jitterX = (Math.random() * 2 - 1) * this.jitter;
    const jitterZ = (Math.random() * 2 - 1) * this.jitter;

    this.wanderTarget.x += jitterX;
    this.wanderTarget.z += jitterZ;

    // Re-normalize to keep on unit circle
    this.wanderTarget.normalizeInPlace();

    // Scale to wander circle radius
    const targetOnCircle = this.wanderTarget.scale(this.radius);

    // Get forward direction
    const forward = velocity.length() > 0.001
      ? velocity.normalize()
      : Vector3.forward();

    // Calculate circle center (projected in front of agent)
    const circleCenter = forward.scale(this.distance);

    // Calculate target in world space
    const target = position.add(circleCenter).add(targetOnCircle);

    // Return seek force toward target
    const desired = target.sub(position).normalize().scale(maxSpeed);
    return desired.sub(velocity);
  }

  /**
   * Resets the wander target to a random direction.
   */
  reset(): void {
    const theta = Math.random() * Math.PI * 2;
    this.wanderTarget.set(Math.cos(theta), 0, Math.sin(theta));
  }

  /**
   * Gets the current wander target in world space.
   *
   * @param position - Current position
   * @param velocity - Current velocity
   * @returns World space wander target
   */
  getWanderTarget(position: Vector3, velocity: Vector3): Vector3 {
    const forward = velocity.length() > 0.001
      ? velocity.normalize()
      : Vector3.forward();

    const circleCenter = forward.scale(this.distance);
    const targetOnCircle = this.wanderTarget.scale(this.radius);

    return position.add(circleCenter).add(targetOnCircle);
  }
}
