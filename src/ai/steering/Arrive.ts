/**
 * @fileoverview Arrive steering behavior - moves toward target with deceleration.
 * @module ai/steering/Arrive
 */

import { Vector3 } from '../../math/Vector3';
import { SteeringBehavior } from './SteeringBehavior';

/**
 * Deceleration mode for arrival behavior.
 */
export enum Deceleration {
  /** Slow deceleration (3x slowing radius) */
  SLOW = 3,
  /** Normal deceleration (2x slowing radius) */
  NORMAL = 2,
  /** Fast deceleration (1x slowing radius) */
  FAST = 1,
}

/**
 * Arrive behavior moves the agent toward a target position and slows down as it approaches.
 * Uses a slowing radius to determine when to start decelerating.
 *
 * @example
 * ```typescript
 * const target = new Vector3(100, 0, 50);
 * const arrive = new Arrive(target, {
 *   slowingRadius: 20,
 *   deceleration: Deceleration.NORMAL
 * });
 *
 * // In update loop
 * const force = arrive.calculate(agentPos, agentVel, maxSpeed);
 * agentVel.addInPlace(force.scale(deltaTime));
 * ```
 */
export class Arrive extends SteeringBehavior {
  /** Target position to arrive at */
  target: Vector3;

  /** Radius at which to start slowing down */
  slowingRadius: number;

  /** Deceleration mode */
  deceleration: Deceleration;

  /** Tolerance distance - consider arrived when within this distance */
  tolerance: number;

  /**
   * Creates a new arrive behavior.
   *
   * @param target - Target position (default: origin)
   * @param options - Optional configuration
   */
  constructor(
    target: Vector3 = Vector3.zero(),
    options: {
      slowingRadius?: number;
      deceleration?: Deceleration;
      tolerance?: number;
      weight?: number;
      priority?: number;
      enabled?: boolean;
    } = {}
  ) {
    super({ ...options, name: 'Arrive' });
    this.target = target.clone();
    this.slowingRadius = options.slowingRadius ?? 10.0;
    this.deceleration = options.deceleration ?? Deceleration.NORMAL;
    this.tolerance = options.tolerance ?? 0.5;
  }

  /**
   * Calculates the arrive steering force.
   *
   * @param position - Current agent position
   * @param velocity - Current agent velocity
   * @param maxSpeed - Maximum agent speed
   * @returns Steering force vector
   */
  calculate(position: Vector3, velocity: Vector3, maxSpeed: number): Vector3 {
    const toTarget = this.target.sub(position);
    const distance = toTarget.length();

    // Already at target
    if (distance < this.tolerance) {
      return velocity.negate(); // Stop
    }

    // Calculate desired speed
    let desiredSpeed: number;

    if (distance > this.slowingRadius) {
      // Outside slowing radius - go at max speed
      desiredSpeed = maxSpeed;
    } else {
      // Inside slowing radius - interpolate speed to zero
      desiredSpeed = maxSpeed * (distance / this.slowingRadius);
    }

    // Calculate desired velocity
    const desired = toTarget.normalize().scale(desiredSpeed);

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
   * Checks if agent has arrived at target.
   *
   * @param position - Current position
   * @returns True if arrived
   */
  hasArrived(position: Vector3): boolean {
    return this.getDistanceToTarget(position) < this.tolerance;
  }

  /**
   * Checks if agent is in slowing radius.
   *
   * @param position - Current position
   * @returns True if in slowing radius
   */
  isSlowing(position: Vector3): boolean {
    return this.getDistanceToTarget(position) < this.slowingRadius;
  }
}
