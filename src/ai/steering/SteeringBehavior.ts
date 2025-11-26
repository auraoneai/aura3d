/**
 * @fileoverview Base steering behavior class for autonomous agent movement.
 * Provides weight, priority, and enable/disable functionality.
 * @module ai/steering/SteeringBehavior
 */

import { Vector3 } from '../../math/Vector3';

/**
 * Base class for all steering behaviors.
 * Each behavior calculates a steering force that influences agent movement.
 *
 * @example
 * ```typescript
 * class CustomBehavior extends SteeringBehavior {
 *   calculate(position: Vector3, velocity: Vector3, maxSpeed: number): Vector3 {
 *     // Calculate steering force
 *     return new Vector3(1, 0, 0);
 *   }
 * }
 *
 * const behavior = new CustomBehavior();
 * behavior.weight = 2.0;
 * behavior.priority = 10;
 * ```
 */
export abstract class SteeringBehavior {
  /** Behavior weight for blending (0-1 typical, higher = stronger) */
  weight: number;

  /** Behavior priority (higher = checked first) */
  priority: number;

  /** Whether this behavior is enabled */
  enabled: boolean;

  /** Optional behavior name for debugging */
  name: string;

  /**
   * Creates a new steering behavior.
   *
   * @param options - Optional configuration
   */
  constructor(options: {
    weight?: number;
    priority?: number;
    enabled?: boolean;
    name?: string;
  } = {}) {
    this.weight = options.weight ?? 1.0;
    this.priority = options.priority ?? 0;
    this.enabled = options.enabled ?? true;
    this.name = options.name ?? this.constructor.name;
  }

  /**
   * Calculates the steering force for this behavior.
   * Must be implemented by subclasses.
   *
   * @param position - Current agent position
   * @param velocity - Current agent velocity
   * @param maxSpeed - Maximum agent speed
   * @returns Steering force vector
   */
  abstract calculate(position: Vector3, velocity: Vector3, maxSpeed: number): Vector3;

  /**
   * Enables this behavior.
   */
  enable(): void {
    this.enabled = true;
  }

  /**
   * Disables this behavior.
   */
  disable(): void {
    this.enabled = false;
  }

  /**
   * Toggles this behavior on/off.
   */
  toggle(): void {
    this.enabled = !this.enabled;
  }

  /**
   * Gets a weighted steering force.
   *
   * @param position - Current agent position
   * @param velocity - Current agent velocity
   * @param maxSpeed - Maximum agent speed
   * @returns Weighted steering force
   */
  getWeightedForce(position: Vector3, velocity: Vector3, maxSpeed: number): Vector3 {
    if (!this.enabled) {
      return Vector3.zero();
    }
    return this.calculate(position, velocity, maxSpeed).scale(this.weight);
  }

  /**
   * Gets a string representation of this behavior.
   */
  toString(): string {
    const status = this.enabled ? 'enabled' : 'disabled';
    return `${this.name} [${status}] (weight: ${this.weight}, priority: ${this.priority})`;
  }
}
