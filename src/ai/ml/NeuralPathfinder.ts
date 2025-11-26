/**
 * Neural network-based pathfinding for learning-based navigation.
 * Learns to navigate using deep reinforcement learning instead of traditional A*.
 * @module NeuralPathfinder
 */

import { Vector3 } from '../../math/Vector3';
import { Logger } from '../../core/Logger';
import { PolicyNetwork } from './PolicyNetwork';
import { ValueNetwork } from './ValueNetwork';
import { FeatureExtractor, Observation } from './FeatureExtractor';
import { RewardFunction } from './RewardFunction';

const logger = Logger.create('NeuralPathfinder');

/**
 * Pathfinding waypoint.
 */
export interface Waypoint {
  /** Waypoint position */
  position: Vector3;
  /** Distance from start */
  distanceFromStart: number;
  /** Estimated distance to goal */
  distanceToGoal: number;
}

/**
 * Pathfinding result.
 */
export interface PathResult {
  /** Path waypoints from start to goal */
  path: Vector3[];
  /** Whether path finding succeeded */
  success: boolean;
  /** Path cost/length */
  cost: number;
  /** Number of steps taken */
  steps: number;
  /** Computation time in milliseconds */
  computeTime: number;
}

/**
 * Neural pathfinder configuration.
 */
export interface NeuralPathfinderConfig {
  /** Maximum path finding steps */
  maxSteps?: number;
  /** Step size for movement */
  stepSize?: number;
  /** Goal reaching threshold */
  goalThreshold?: number;
  /** Obstacle avoidance radius */
  obstacleRadius?: number;
  /** Enable path smoothing */
  smoothPath?: boolean;
  /** Smoothing iterations */
  smoothingIterations?: number;
}

/**
 * Neural network-based pathfinder using learned navigation policies.
 * Provides adaptive pathfinding that improves with experience.
 */
export class NeuralPathfinder {
  private readonly policy: PolicyNetwork;
  private readonly value: ValueNetwork;
  private readonly featureExtractor: FeatureExtractor;
  private readonly config: Required<NeuralPathfinderConfig>;
  private pathfindingAttempts: number = 0;
  private successfulPaths: number = 0;

  /**
   * Creates a new neural pathfinder.
   * @param policy - Policy network for navigation
   * @param value - Value network for path quality estimation
   * @param config - Pathfinder configuration
   */
  constructor(
    policy: PolicyNetwork,
    value: ValueNetwork,
    config: NeuralPathfinderConfig = {}
  ) {
    this.policy = policy;
    this.value = value;

    this.config = {
      maxSteps: config.maxSteps ?? 100,
      stepSize: config.stepSize ?? 1.0,
      goalThreshold: config.goalThreshold ?? 0.5,
      obstacleRadius: config.obstacleRadius ?? 0.5,
      smoothPath: config.smoothPath ?? true,
      smoothingIterations: config.smoothingIterations ?? 3,
    };

    // Configure feature extractor for pathfinding
    this.featureExtractor = new FeatureExtractor({
      includePosition: true,
      includeVelocity: true,
      includeForward: true,
      includeTarget: true,
      maxNearbyEntities: 10,
      positionScale: 100.0,
      velocityScale: 10.0,
      distanceScale: 100.0,
    });

    logger.info('NeuralPathfinder initialized', { config: this.config });
  }

  /**
   * Finds a path from start to goal using the neural network policy.
   * @param start - Start position
   * @param goal - Goal position
   * @param obstacles - Optional obstacle positions
   * @returns Path result
   */
  async findPath(
    start: Vector3,
    goal: Vector3,
    obstacles: Vector3[] = []
  ): Promise<PathResult> {
    const startTime = performance.now();
    this.pathfindingAttempts++;

    logger.debug(`Finding path from ${start.toArray()} to ${goal.toArray()}`);

    const path: Vector3[] = [start.clone()];
    let currentPosition = start.clone();
    let currentVelocity = Vector3.zero();
    let steps = 0;
    let totalCost = 0;

    while (steps < this.config.maxSteps) {
      // Check if goal reached
      const distanceToGoal = Vector3.distance(currentPosition, goal);
      if (distanceToGoal <= this.config.goalThreshold) {
        path.push(goal.clone());
        const computeTime = performance.now() - startTime;
        this.successfulPaths++;

        logger.debug(`Path found in ${steps} steps, ${computeTime.toFixed(2)}ms`);

        const result: PathResult = {
          path: this.config.smoothPath ? this.smoothPath(path) : path,
          success: true,
          cost: totalCost,
          steps,
          computeTime,
        };

        return result;
      }

      // Create observation
      const observation: Observation = {
        position: currentPosition,
        velocity: currentVelocity,
        forward: currentVelocity.length() > 0.01
          ? currentVelocity.normalize()
          : Vector3.forward(),
        target: goal,
        targetDistance: distanceToGoal,
        nearbyEntities: this.findNearbyObstacles(currentPosition, obstacles),
      };

      // Get action from policy
      const features = this.featureExtractor.extract(observation);
      const policyOutput = await this.policy.selectAction(features);

      // Interpret action as movement direction
      const movement = this.interpretMovement(policyOutput.action);

      // Update position
      const stepVector = movement.scale(this.config.stepSize);
      currentPosition = currentPosition.add(stepVector);
      currentVelocity = stepVector;

      // Add to path
      path.push(currentPosition.clone());

      // Update cost
      totalCost += this.config.stepSize;

      steps++;
    }

    // Max steps reached - path finding failed
    const computeTime = performance.now() - startTime;

    logger.warn(`Path finding failed after ${steps} steps`);

    return {
      path: [],
      success: false,
      cost: Infinity,
      steps,
      computeTime,
    };
  }

  /**
   * Finds nearby obstacles within detection radius.
   * @param position - Current position
   * @param obstacles - All obstacle positions
   * @returns Nearby obstacles
   */
  private findNearbyObstacles(
    position: Vector3,
    obstacles: Vector3[]
  ): Vector3[] {
    const detectionRadius = this.config.obstacleRadius * 5;
    const nearby: Vector3[] = [];

    for (const obstacle of obstacles) {
      const distance = Vector3.distance(position, obstacle);
      if (distance <= detectionRadius) {
        nearby.push(obstacle);
      }
    }

    // Sort by distance and take closest 10
    nearby.sort((a, b) => {
      const distA = Vector3.distance(position, a);
      const distB = Vector3.distance(position, b);
      return distA - distB;
    });

    return nearby.slice(0, 10);
  }

  /**
   * Interprets policy action as movement direction.
   * @param action - Policy action (discrete index or continuous values)
   * @returns Movement direction vector
   */
  private interpretMovement(action: number | number[]): Vector3 {
    if (typeof action === 'number') {
      // Discrete action: map to 8 directions
      const directions = [
        Vector3.forward(),           // 0: Forward
        Vector3.forward().add(Vector3.right()).normalize(), // 1: Forward-Right
        Vector3.right(),             // 2: Right
        Vector3.back().add(Vector3.right()).normalize(),    // 3: Back-Right
        Vector3.back(),              // 4: Back
        Vector3.back().add(Vector3.left()).normalize(),     // 5: Back-Left
        Vector3.left(),              // 6: Left
        Vector3.forward().add(Vector3.left()).normalize(),  // 7: Forward-Left
      ];

      return directions[action % directions.length];
    } else {
      // Continuous action: interpret as direction vector
      const actionValues = action;
      if (actionValues.length >= 2) {
        const direction = new Vector3(
          actionValues[0],
          0,
          actionValues[1]
        );
        return direction.length() > 0.01 ? direction.normalize() : Vector3.forward();
      }

      return Vector3.forward();
    }
  }

  /**
   * Smooths a path by removing unnecessary waypoints.
   * Uses iterative averaging to create smoother curves.
   * @param path - Raw path waypoints
   * @returns Smoothed path
   */
  private smoothPath(path: Vector3[]): Vector3[] {
    if (path.length <= 2) {
      return path;
    }

    let smoothed = [...path];

    for (let iter = 0; iter < this.config.smoothingIterations; iter++) {
      const newPath: Vector3[] = [smoothed[0]]; // Keep start

      for (let i = 1; i < smoothed.length - 1; i++) {
        const prev = smoothed[i - 1];
        const current = smoothed[i];
        const next = smoothed[i + 1];

        // Average with neighbors
        const averaged = new Vector3(
          (prev.x + current.x + next.x) / 3,
          (prev.y + current.y + next.y) / 3,
          (prev.z + current.z + next.z) / 3
        );

        newPath.push(averaged);
      }

      newPath.push(smoothed[smoothed.length - 1]); // Keep end
      smoothed = newPath;
    }

    // Remove redundant waypoints (collinear points)
    return this.removeRedundantWaypoints(smoothed);
  }

  /**
   * Removes redundant waypoints that are nearly collinear.
   * @param path - Path to simplify
   * @returns Simplified path
   */
  private removeRedundantWaypoints(path: Vector3[]): Vector3[] {
    if (path.length <= 2) {
      return path;
    }

    const simplified: Vector3[] = [path[0]];
    const angleThreshold = Math.cos(Math.PI / 36); // 5 degrees

    for (let i = 1; i < path.length - 1; i++) {
      const prev = simplified[simplified.length - 1];
      const current = path[i];
      const next = path[i + 1];

      const dir1 = current.sub(prev).normalize();
      const dir2 = next.sub(current).normalize();

      // Check if directions are similar (collinear)
      const dot = dir1.dot(dir2);
      if (dot < angleThreshold) {
        // Not collinear - keep waypoint
        simplified.push(current);
      }
    }

    simplified.push(path[path.length - 1]); // Keep end
    return simplified;
  }

  /**
   * Estimates the quality of a path using the value network.
   * @param path - Path to evaluate
   * @param goal - Goal position
   * @returns Estimated path quality (higher is better)
   */
  async evaluatePathQuality(path: Vector3[], goal: Vector3): Promise<number> {
    if (path.length === 0) {
      return 0;
    }

    let totalValue = 0;

    for (let i = 0; i < path.length; i++) {
      const position = path[i];
      const velocity = i > 0
        ? path[i].sub(path[i - 1])
        : Vector3.zero();

      const observation: Observation = {
        position,
        velocity,
        forward: velocity.length() > 0.01 ? velocity.normalize() : Vector3.forward(),
        target: goal,
        targetDistance: Vector3.distance(position, goal),
      };

      const features = this.featureExtractor.extract(observation);
      const valueOutput = await this.value.estimate(features);
      totalValue += valueOutput.value;
    }

    return totalValue / path.length;
  }

  /**
   * Gets pathfinding statistics.
   * @returns Statistics object
   */
  getStats(): {
    attempts: number;
    successes: number;
    successRate: number;
  } {
    return {
      attempts: this.pathfindingAttempts,
      successes: this.successfulPaths,
      successRate: this.pathfindingAttempts > 0
        ? this.successfulPaths / this.pathfindingAttempts
        : 0,
    };
  }

  /**
   * Resets pathfinding statistics.
   */
  resetStats(): void {
    this.pathfindingAttempts = 0;
    this.successfulPaths = 0;
  }
}
