/**
 * @fileoverview Seek steering behavior - moves toward a target position.
 * @module ai/steering/Seek
 */

import { Vector3 } from '../../math/Vector3';
import { SteeringBehavior } from './SteeringBehavior';

/**
 * Seek behavior moves the agent toward a target position at maximum speed.
 * The agent does not slow down as it approaches the target.
 *
 * @example
 * ```typescript
 * const target = new Vector3(100, 0, 50);
 * const seek = new Seek(target);
 *
 * // In update loop
 * const force = seek.calculate(agentPos, agentVel, maxSpeed);
 * agentVel.addInPlace(force.scale(deltaTime));
 * ```
 */
export class Seek extends SteeringBehavior {
  /** Target position to seek */
  target: Vector3;

  /**
   * Creates a new seek behavior.
   *
   * @param target - Target position (default: origin)
   * @param options - Optional configuration
   */
  constructor(
    target: Vector3 = Vector3.zero(),
    options: {
      weight?: number;
      priority?: number;
      enabled?: boolean;
    } = {}
  ) {
    super({ ...options, name: 'Seek' });
    this.target = target.clone();
  }

  /**
   * Calculates the seek steering force.
   *
   * @param position - Current agent position
   * @param velocity - Current agent velocity
   * @param maxSpeed - Maximum agent speed
   * @returns Steering force vector
   */
  calculate(position: Vector3, velocity: Vector3, maxSpeed: number): Vector3 {
    // Desired velocity points toward target at max speed
    const desired = this.target.sub(position).normalize().scale(maxSpeed);

    // Steering force = desired velocity - current velocity
    return desired.sub(velocity);
  }

  /**
   * Sets the target position.
   *
   * @param target - New target position
   */
  setTarget(target: Vector3): void {
    this.target.copy(target);
  }

  /**
   * Gets the distance to target.
   *
   * @param position - Current position
   * @returns Distance to target
   */
  getDistanceToTarget(position: Vector3): number {
    return Vector3.distance(position, this.target);
  }
}
