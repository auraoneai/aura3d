/**
 * @fileoverview Steering pipeline for behavior blending and prioritization.
 * @module ai/steering/SteeringPipeline
 */

import { Vector3 } from '../../math/Vector3';
import { SteeringBehavior } from './SteeringBehavior';
import { Logger } from '../../core/Logger';

const logger = Logger.create('SteeringPipeline');

/**
 * Blending mode for combining steering behaviors.
 */
export enum BlendMode {
  /** Weighted sum - blend all behaviors proportionally */
  WEIGHTED_SUM = 'weighted_sum',
  /** Priority - use first satisfied behavior */
  PRIORITY = 'priority',
  /** Dithered priority - probabilistic selection */
  DITHERED = 'dithered',
}

/**
 * Steering pipeline combines multiple steering behaviors using various blending strategies.
 * Supports weighted blending, priority-based selection, and force limiting.
 *
 * @example
 * ```typescript
 * const pipeline = new SteeringPipeline({
 *   blendMode: BlendMode.WEIGHTED_SUM,
 *   maxForce: 10.0
 * });
 *
 * // Add behaviors
 * pipeline.addBehavior(seek);
 * pipeline.addBehavior(separation);
 * pipeline.addBehavior(wander);
 *
 * // In update loop
 * const force = pipeline.calculate(agentPos, agentVel, maxSpeed);
 * agentVel.addInPlace(force.scale(deltaTime));
 * ```
 */
export class SteeringPipeline {
  /** Blending mode */
  blendMode: BlendMode;

  /** Maximum steering force magnitude */
  maxForce: number;

  /** Registered behaviors */
  private behaviors: SteeringBehavior[];

  /** Enable debug logging */
  private debugMode: boolean;

  /** Force truncation threshold for priority mode */
  private priorityThreshold: number;

  /**
   * Creates a new steering pipeline.
   *
   * @param options - Optional configuration
   */
  constructor(
    options: {
      blendMode?: BlendMode;
      maxForce?: number;
      debugMode?: boolean;
      priorityThreshold?: number;
    } = {}
  ) {
    this.blendMode = options.blendMode ?? BlendMode.WEIGHTED_SUM;
    this.maxForce = options.maxForce ?? 10.0;
    this.debugMode = options.debugMode ?? false;
    this.priorityThreshold = options.priorityThreshold ?? 0.1;
    this.behaviors = [];
  }

  /**
   * Adds a behavior to the pipeline.
   *
   * @param behavior - Behavior to add
   * @returns This pipeline for chaining
   */
  addBehavior(behavior: SteeringBehavior): this {
    this.behaviors.push(behavior);
    this.sortBehaviors();
    return this;
  }

  /**
   * Removes a behavior from the pipeline.
   *
   * @param behavior - Behavior to remove
   * @returns True if removed
   */
  removeBehavior(behavior: SteeringBehavior): boolean {
    const index = this.behaviors.indexOf(behavior);
    if (index !== -1) {
      this.behaviors.splice(index, 1);
      return true;
    }
    return false;
  }

  /**
   * Sorts behaviors by priority (highest first).
   * @private
   */
  private sortBehaviors(): void {
    this.behaviors.sort((a, b) => b.priority - a.priority);
  }

  /**
   * Calculates the combined steering force.
   *
   * @param position - Current agent position
   * @param velocity - Current agent velocity
   * @param maxSpeed - Maximum agent speed
   * @returns Combined steering force
   */
  calculate(position: Vector3, velocity: Vector3, maxSpeed: number): Vector3 {
    switch (this.blendMode) {
      case BlendMode.WEIGHTED_SUM:
        return this.calculateWeightedSum(position, velocity, maxSpeed);
      case BlendMode.PRIORITY:
        return this.calculatePriority(position, velocity, maxSpeed);
      case BlendMode.DITHERED:
        return this.calculateDithered(position, velocity, maxSpeed);
      default:
        return Vector3.zero();
    }
  }

  /**
   * Calculates weighted sum blending.
   * @private
   */
  private calculateWeightedSum(
    position: Vector3,
    velocity: Vector3,
    maxSpeed: number
  ): Vector3 {
    const force = Vector3.zero();

    for (const behavior of this.behaviors) {
      if (!behavior.enabled) {
        continue;
      }

      const behaviorForce = behavior.calculate(position, velocity, maxSpeed);
      const weightedForce = behaviorForce.scale(behavior.weight);
      force.addInPlace(weightedForce);

      if (this.debugMode) {
        logger.debug(`${behavior.name}: force=${behaviorForce.length().toFixed(2)}`);
      }
    }

    // Truncate to max force
    return this.truncate(force, this.maxForce);
  }

  /**
   * Calculates priority-based selection.
   * Returns first behavior that produces significant force.
   * @private
   */
  private calculatePriority(
    position: Vector3,
    velocity: Vector3,
    maxSpeed: number
  ): Vector3 {
    for (const behavior of this.behaviors) {
      if (!behavior.enabled) {
        continue;
      }

      const force = behavior.calculate(position, velocity, maxSpeed);
      const weightedForce = force.scale(behavior.weight);

      if (weightedForce.lengthSquared() > this.priorityThreshold * this.priorityThreshold) {
        if (this.debugMode) {
          logger.debug(`Priority: ${behavior.name} (force=${force.length().toFixed(2)})`);
        }
        return this.truncate(weightedForce, this.maxForce);
      }
    }

    return Vector3.zero();
  }

  /**
   * Calculates dithered priority selection.
   * Probabilistically selects behavior based on force magnitude.
   * @private
   */
  private calculateDithered(
    position: Vector3,
    velocity: Vector3,
    maxSpeed: number
  ): Vector3 {
    const forces: { behavior: SteeringBehavior; force: Vector3; magnitude: number }[] = [];
    let totalMagnitude = 0;

    // Calculate all forces
    for (const behavior of this.behaviors) {
      if (!behavior.enabled) {
        continue;
      }

      const force = behavior.calculate(position, velocity, maxSpeed);
      const weightedForce = force.scale(behavior.weight);
      const magnitude = weightedForce.length();

      if (magnitude > this.priorityThreshold) {
        forces.push({ behavior, force: weightedForce, magnitude });
        totalMagnitude += magnitude;
      }
    }

    if (forces.length === 0) {
      return Vector3.zero();
    }

    // Probabilistic selection
    const rand = Math.random() * totalMagnitude;
    let accumulated = 0;

    for (const entry of forces) {
      accumulated += entry.magnitude;
      if (rand <= accumulated) {
        if (this.debugMode) {
          logger.debug(`Dithered: ${entry.behavior.name}`);
        }
        return this.truncate(entry.force, this.maxForce);
      }
    }

    // Fallback to last force
    return this.truncate(forces[forces.length - 1].force, this.maxForce);
  }

  /**
   * Truncates force to maximum magnitude.
   * @private
   */
  private truncate(force: Vector3, maxMagnitude: number): Vector3 {
    const magnitudeSq = force.lengthSquared();
    if (magnitudeSq > maxMagnitude * maxMagnitude) {
      return force.normalize().scale(maxMagnitude);
    }
    return force;
  }

  /**
   * Gets all behaviors.
   *
   * @returns Array of behaviors
   */
  getBehaviors(): SteeringBehavior[] {
    return [...this.behaviors];
  }

  /**
   * Gets enabled behaviors.
   *
   * @returns Array of enabled behaviors
   */
  getEnabledBehaviors(): SteeringBehavior[] {
    return this.behaviors.filter((b) => b.enabled);
  }

  /**
   * Clears all behaviors.
   */
  clearBehaviors(): void {
    this.behaviors = [];
  }

  /**
   * Enables all behaviors.
   */
  enableAll(): void {
    for (const behavior of this.behaviors) {
      behavior.enable();
    }
  }

  /**
   * Disables all behaviors.
   */
  disableAll(): void {
    for (const behavior of this.behaviors) {
      behavior.disable();
    }
  }

  /**
   * Gets a behavior by name.
   *
   * @param name - Behavior name
   * @returns Behavior or undefined
   */
  getBehaviorByName(name: string): SteeringBehavior | undefined {
    return this.behaviors.find((b) => b.name === name);
  }

  /**
   * Checks if a behavior exists in the pipeline.
   *
   * @param behavior - Behavior to check
   * @returns True if exists
   */
  hasBehavior(behavior: SteeringBehavior): boolean {
    return this.behaviors.includes(behavior);
  }

  /**
   * Gets the number of behaviors.
   */
  getBehaviorCount(): number {
    return this.behaviors.length;
  }

  /**
   * Sets debug mode.
   *
   * @param enabled - Whether to enable debug logging
   */
  setDebugMode(enabled: boolean): void {
    this.debugMode = enabled;
  }

  /**
   * Gets statistics about the pipeline.
   */
  getStats(): {
    behaviorCount: number;
    enabledCount: number;
    blendMode: BlendMode;
    maxForce: number;
  } {
    return {
      behaviorCount: this.behaviors.length,
      enabledCount: this.getEnabledBehaviors().length,
      blendMode: this.blendMode,
      maxForce: this.maxForce,
    };
  }

  /**
   * Gets a debug string representation.
   */
  toString(): string {
    const behaviors = this.behaviors
      .map((b) => `  ${b.toString()}`)
      .join('\n');

    return `SteeringPipeline {
  Mode: ${this.blendMode}
  Max Force: ${this.maxForce}
  Behaviors (${this.behaviors.length}):
${behaviors}
}`;
  }
}
