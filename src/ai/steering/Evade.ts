/**
 * @fileoverview Evade steering behavior - predicts and flees from moving threat.
 * @module ai/steering/Evade
 */

import { Vector3 } from '../../math/Vector3';
import { SteeringBehavior } from './SteeringBehavior';

/**
 * Evade behavior predicts where a moving threat will be and flees from that position.
 * The opposite of pursuit - anticipates the threat's future position and moves away.
 *
 * @example
 * ```typescript
 * const threatPos = new Vector3(50, 0, 50);
 * const threatVel = new Vector3(5, 0, 0);
 * const evade = new Evade(threatPos, threatVel, {
 *   panicDistance: 30
 * });
 *
 * // In update loop
 * evade.setThreat(enemy.position, enemy.velocity);
 * const force = evade.calculate(agentPos, agentVel, maxSpeed);
 * agentVel.addInPlace(force.scale(deltaTime));
 * ```
 */
export class Evade extends SteeringBehavior {
  /** Threat's current position */
  threatPosition: Vector3;

  /** Threat's current velocity */
  threatVelocity: Vector3;

  /** Maximum prediction time in seconds */
  maxPredictionTime: number;

  /** Panic distance - only evade when closer than this (Infinity = always evade) */
  panicDistance: number;

  /**
   * Creates a new evade behavior.
   *
   * @param threatPosition - Initial threat position
   * @param threatVelocity - Initial threat velocity
   * @param options - Optional configuration
   */
  constructor(
    threatPosition: Vector3 = Vector3.zero(),
    threatVelocity: Vector3 = Vector3.zero(),
    options: {
      maxPredictionTime?: number;
      panicDistance?: number;
      weight?: number;
      priority?: number;
      enabled?: boolean;
    } = {}
  ) {
    super({ ...options, name: 'Evade' });
    this.threatPosition = threatPosition.clone();
    this.threatVelocity = threatVelocity.clone();
    this.maxPredictionTime = options.maxPredictionTime ?? 1.0;
    this.panicDistance = options.panicDistance ?? Infinity;
  }

  /**
   * Calculates the evade steering force.
   *
   * @param position - Current agent position
   * @param velocity - Current agent velocity
   * @param maxSpeed - Maximum agent speed
   * @returns Steering force vector
   */
  calculate(position: Vector3, velocity: Vector3, maxSpeed: number): Vector3 {
    const toThreat = this.threatPosition.sub(position);
    const distance = toThreat.length();

    // Check if within panic distance
    if (distance > this.panicDistance) {
      return Vector3.zero();
    }

    // Calculate prediction time based on distance and relative speeds
    const relativeSpeed = velocity.length() + this.threatVelocity.length();
    let predictionTime: number;

    if (relativeSpeed > 0.001) {
      predictionTime = distance / relativeSpeed;
    } else {
      predictionTime = this.maxPredictionTime;
    }

    // Clamp prediction time
    predictionTime = Math.min(predictionTime, this.maxPredictionTime);

    // Predict threat's future position
    const predictedPosition = this.threatPosition.add(
      this.threatVelocity.scale(predictionTime)
    );

    // Flee from the predicted position
    const desired = position.sub(predictedPosition).normalize().scale(maxSpeed);
    return desired.sub(velocity);
  }

  /**
   * Sets the threat's position and velocity.
   *
   * @param position - Threat position
   * @param velocity - Threat velocity
   */
  setThreat(position: Vector3, velocity: Vector3): void {
    this.threatPosition.copy(position);
    this.threatVelocity.copy(velocity);
  }

  /**
   * Gets the predicted threat position.
   *
   * @param position - Current agent position
   * @param velocity - Current agent velocity
   * @returns Predicted threat position
   */
  getPredictedThreatPosition(position: Vector3, velocity: Vector3): Vector3 {
    const toThreat = this.threatPosition.sub(position);
    const distance = toThreat.length();

    const relativeSpeed = velocity.length() + this.threatVelocity.length();
    let predictionTime: number;

    if (relativeSpeed > 0.001) {
      predictionTime = distance / relativeSpeed;
    } else {
      predictionTime = this.maxPredictionTime;
    }

    predictionTime = Math.min(predictionTime, this.maxPredictionTime);

    return this.threatPosition.add(this.threatVelocity.scale(predictionTime));
  }

  /**
   * Gets the distance to threat.
   *
   * @param position - Current position
   * @returns Distance to threat
   */
  getDistanceToThreat(position: Vector3): number {
    return Vector3.distance(position, this.threatPosition);
  }

  /**
   * Checks if agent should panic (within panic distance).
   *
   * @param position - Current position
   * @returns True if should panic
   */
  shouldPanic(position: Vector3): boolean {
    return this.getDistanceToThreat(position) < this.panicDistance;
  }
}
