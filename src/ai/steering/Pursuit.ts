/**
 * @fileoverview Pursuit steering behavior - intercepts a moving target.
 * @module ai/steering/Pursuit
 */

import { Vector3 } from '../../math/Vector3';
import { SteeringBehavior } from './SteeringBehavior';

/**
 * Pursuit behavior predicts where a moving target will be and seeks that position.
 * More sophisticated than seek as it anticipates the target's future position.
 *
 * @example
 * ```typescript
 * const targetPos = new Vector3(50, 0, 50);
 * const targetVel = new Vector3(5, 0, 0);
 * const pursuit = new Pursuit(targetPos, targetVel);
 *
 * // In update loop
 * pursuit.setTarget(enemy.position, enemy.velocity);
 * const force = pursuit.calculate(agentPos, agentVel, maxSpeed);
 * agentVel.addInPlace(force.scale(deltaTime));
 * ```
 */
export class Pursuit extends SteeringBehavior {
  /** Target's current position */
  targetPosition: Vector3;

  /** Target's current velocity */
  targetVelocity: Vector3;

  /** Maximum prediction time in seconds */
  maxPredictionTime: number;

  /**
   * Creates a new pursuit behavior.
   *
   * @param targetPosition - Initial target position
   * @param targetVelocity - Initial target velocity
   * @param options - Optional configuration
   */
  constructor(
    targetPosition: Vector3 = Vector3.zero(),
    targetVelocity: Vector3 = Vector3.zero(),
    options: {
      maxPredictionTime?: number;
      weight?: number;
      priority?: number;
      enabled?: boolean;
    } = {}
  ) {
    super({ ...options, name: 'Pursuit' });
    this.targetPosition = targetPosition.clone();
    this.targetVelocity = targetVelocity.clone();
    this.maxPredictionTime = options.maxPredictionTime ?? 1.0;
  }

  /**
   * Calculates the pursuit steering force.
   *
   * @param position - Current agent position
   * @param velocity - Current agent velocity
   * @param maxSpeed - Maximum agent speed
   * @returns Steering force vector
   */
  calculate(position: Vector3, velocity: Vector3, maxSpeed: number): Vector3 {
    const toTarget = this.targetPosition.sub(position);
    const distance = toTarget.length();

    // Calculate prediction time based on distance and relative speeds
    const relativeSpeed = velocity.length() + this.targetVelocity.length();
    let predictionTime: number;

    if (relativeSpeed > 0.001) {
      predictionTime = distance / relativeSpeed;
    } else {
      predictionTime = this.maxPredictionTime;
    }

    // Clamp prediction time
    predictionTime = Math.min(predictionTime, this.maxPredictionTime);

    // Predict target's future position
    const predictedPosition = this.targetPosition.add(
      this.targetVelocity.scale(predictionTime)
    );

    // Seek the predicted position
    const desired = predictedPosition.sub(position).normalize().scale(maxSpeed);
    return desired.sub(velocity);
  }

  /**
   * Sets the target's position and velocity.
   *
   * @param position - Target position
   * @param velocity - Target velocity
   */
  setTarget(position: Vector3, velocity: Vector3): void {
    this.targetPosition.copy(position);
    this.targetVelocity.copy(velocity);
  }

  /**
   * Gets the predicted intercept position.
   *
   * @param position - Current agent position
   * @param velocity - Current agent velocity
   * @returns Predicted target position
   */
  getPredictedPosition(position: Vector3, velocity: Vector3): Vector3 {
    const toTarget = this.targetPosition.sub(position);
    const distance = toTarget.length();

    const relativeSpeed = velocity.length() + this.targetVelocity.length();
    let predictionTime: number;

    if (relativeSpeed > 0.001) {
      predictionTime = distance / relativeSpeed;
    } else {
      predictionTime = this.maxPredictionTime;
    }

    predictionTime = Math.min(predictionTime, this.maxPredictionTime);

    return this.targetPosition.add(this.targetVelocity.scale(predictionTime));
  }

  /**
   * Gets the distance to target.
   *
   * @param position - Current position
   * @returns Distance to target
   */
  getDistanceToTarget(position: Vector3): number {
    return Vector3.distance(position, this.targetPosition);
  }
}
