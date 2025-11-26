/**
 * @fileoverview Flee steering behavior - moves away from a target position.
 * @module ai/steering/Flee
 */

import { Vector3 } from '../../math/Vector3';
import { SteeringBehavior } from './SteeringBehavior';

/**
 * Flee behavior moves the agent away from a target position at maximum speed.
 * Optionally supports a panic distance - only flees when within range.
 *
 * @example
 * ```typescript
 * const threat = new Vector3(50, 0, 50);
 * const flee = new Flee(threat, { panicDistance: 30 });
 *
 * // In update loop
 * const force = flee.calculate(agentPos, agentVel, maxSpeed);
 * agentVel.addInPlace(force.scale(deltaTime));
 * ```
 */
export class Flee extends SteeringBehavior {
  /** Target position to flee from */
  target: Vector3;

  /** Panic distance - only flee when closer than this (Infinity = always flee) */
  panicDistance: number;

  /**
   * Creates a new flee behavior.
   *
   * @param target - Target position to flee from (default: origin)
   * @param options - Optional configuration
   */
  constructor(
    target: Vector3 = Vector3.zero(),
    options: {
      panicDistance?: number;
      weight?: number;
      priority?: number;
      enabled?: boolean;
    } = {}
  ) {
    super({ ...options, name: 'Flee' });
    this.target = target.clone();
    this.panicDistance = options.panicDistance ?? Infinity;
  }

  /**
   * Calculates the flee steering force.
   *
   * @param position - Current agent position
   * @param velocity - Current agent velocity
   * @param maxSpeed - Maximum agent speed
   * @returns Steering force vector
   */
  calculate(position: Vector3, velocity: Vector3, maxSpeed: number): Vector3 {
    // Check if within panic distance
    const distanceSq = Vector3.distanceSquared(position, this.target);
    if (distanceSq > this.panicDistance * this.panicDistance) {
      return Vector3.zero();
    }

    // Desired velocity points away from target at max speed
    const desired = position.sub(this.target).normalize().scale(maxSpeed);

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

  /**
   * Checks if agent should panic (within panic distance).
   *
   * @param position - Current position
   * @returns True if should panic
   */
  shouldPanic(position: Vector3): boolean {
    return this.getDistanceToTarget(position) < this.panicDistance;
  }
}
