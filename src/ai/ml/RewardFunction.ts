/**
 * Reward function utilities for reinforcement learning.
 * Provides reward calculation, shaping, and normalization.
 * @module RewardFunction
 */

import { Vector3 } from '../../math/Vector3';
import { Logger } from '../../core/Logger';

const logger = Logger.create('RewardFunction');

/**
 * Reward components for multi-objective reward functions.
 */
export interface RewardComponents {
  /** Primary task reward */
  task?: number;
  /** Distance-based reward */
  distance?: number;
  /** Velocity-based reward */
  velocity?: number;
  /** Survival/time-based reward */
  survival?: number;
  /** Collision penalty */
  collision?: number;
  /** Efficiency bonus */
  efficiency?: number;
  /** Custom component rewards */
  custom?: Record<string, number>;
}

/**
 * Reward function configuration.
 */
export interface RewardFunctionConfig {
  /** Weights for each reward component */
  weights?: {
    task?: number;
    distance?: number;
    velocity?: number;
    survival?: number;
    collision?: number;
    efficiency?: number;
  };
  /** Enable reward normalization */
  normalize?: boolean;
  /** Enable reward clipping */
  clip?: { min: number; max: number };
  /** Discount factor for future rewards */
  gamma?: number;
}

/**
 * Reward function for calculating agent rewards.
 * Supports multi-objective rewards with configurable weights.
 */
export class RewardFunction {
  private readonly config: Required<RewardFunctionConfig>;
  private rewardHistory: number[] = [];
  private runningMean: number = 0;
  private runningStd: number = 1;
  private episodeRewards: number[] = [];

  /**
   * Creates a new reward function.
   * @param config - Reward function configuration
   */
  constructor(config: RewardFunctionConfig = {}) {
    this.config = {
      weights: {
        task: config.weights?.task ?? 1.0,
        distance: config.weights?.distance ?? 0.1,
        velocity: config.weights?.velocity ?? 0.0,
        survival: config.weights?.survival ?? 0.01,
        collision: config.weights?.collision ?? -1.0,
        efficiency: config.weights?.efficiency ?? 0.05,
      },
      normalize: config.normalize ?? false,
      clip: config.clip ?? { min: -10, max: 10 },
      gamma: config.gamma ?? 0.99,
    };

    logger.info('RewardFunction initialized', { config: this.config });
  }

  /**
   * Calculates total reward from components.
   * @param components - Individual reward components
   * @returns Total weighted reward
   */
  calculate(components: RewardComponents): number {
    let total = 0;

    // Task reward
    if (components.task !== undefined) {
      total += components.task * this.config.weights.task!;
    }

    // Distance reward
    if (components.distance !== undefined) {
      total += components.distance * this.config.weights.distance!;
    }

    // Velocity reward
    if (components.velocity !== undefined) {
      total += components.velocity * this.config.weights.velocity!;
    }

    // Survival reward
    if (components.survival !== undefined) {
      total += components.survival * this.config.weights.survival!;
    }

    // Collision penalty
    if (components.collision !== undefined) {
      total += components.collision * this.config.weights.collision!;
    }

    // Efficiency bonus
    if (components.efficiency !== undefined) {
      total += components.efficiency * this.config.weights.efficiency!;
    }

    // Custom components (unweighted - should be pre-weighted)
    if (components.custom) {
      for (const value of Object.values(components.custom)) {
        total += value;
      }
    }

    // Apply normalization
    if (this.config.normalize) {
      total = this.normalize(total);
    }

    // Apply clipping
    total = Math.max(
      this.config.clip.min,
      Math.min(this.config.clip.max, total)
    );

    // Track reward
    this.rewardHistory.push(total);
    this.episodeRewards.push(total);

    if (this.rewardHistory.length > 10000) {
      this.rewardHistory.shift();
    }

    return total;
  }

  /**
   * Calculates distance-based reward.
   * Rewards getting closer to target, penalizes moving away.
   * @param currentDistance - Current distance to target
   * @param previousDistance - Previous distance to target
   * @returns Distance reward (positive if closer, negative if farther)
   */
  distanceReward(currentDistance: number, previousDistance: number): number {
    return previousDistance - currentDistance;
  }

  /**
   * Calculates progress reward towards a target.
   * Measures progress along the direct path to target.
   * @param currentPosition - Agent's current position
   * @param previousPosition - Agent's previous position
   * @param targetPosition - Target position
   * @returns Progress reward
   */
  progressReward(
    currentPosition: Vector3,
    previousPosition: Vector3,
    targetPosition: Vector3
  ): number {
    const toTarget = targetPosition.sub(previousPosition).normalize();
    const movement = currentPosition.sub(previousPosition);
    return movement.dot(toTarget);
  }

  /**
   * Calculates velocity-aligned reward.
   * Rewards moving in the desired direction.
   * @param velocity - Agent's velocity
   * @param desiredDirection - Desired direction (normalized)
   * @returns Alignment reward [-1, 1]
   */
  velocityAlignmentReward(velocity: Vector3, desiredDirection: Vector3): number {
    const velocityNorm = velocity.normalize();
    return velocityNorm.dot(desiredDirection);
  }

  /**
   * Calculates sparse reward for reaching goal.
   * @param position - Agent position
   * @param goal - Goal position
   * @param threshold - Distance threshold for success
   * @param rewardValue - Reward value for success (default: 1.0)
   * @returns Reward (rewardValue if within threshold, 0 otherwise)
   */
  sparseGoalReward(
    position: Vector3,
    goal: Vector3,
    threshold: number,
    rewardValue: number = 1.0
  ): number {
    const distance = Vector3.distance(position, goal);
    return distance <= threshold ? rewardValue : 0;
  }

  /**
   * Calculates dense goal reward with exponential decay.
   * Provides smooth gradient towards goal.
   * @param distance - Distance to goal
   * @param scale - Decay scale parameter (default: 1.0)
   * @returns Exponentially decaying reward
   */
  denseGoalReward(distance: number, scale: number = 1.0): number {
    return Math.exp(-distance / scale);
  }

  /**
   * Calculates collision penalty.
   * @param collided - Whether a collision occurred
   * @param penaltyValue - Penalty value (default: -1.0)
   * @returns Collision penalty
   */
  collisionPenalty(collided: boolean, penaltyValue: number = -1.0): number {
    return collided ? penaltyValue : 0;
  }

  /**
   * Calculates time/survival reward.
   * Small positive reward for each timestep survived.
   * @param rewardPerStep - Reward per timestep (default: 0.01)
   * @returns Survival reward
   */
  survivalReward(rewardPerStep: number = 0.01): number {
    return rewardPerStep;
  }

  /**
   * Calculates efficiency reward based on path length.
   * Rewards shorter paths to goal.
   * @param pathLength - Actual path length taken
   * @param optimalLength - Optimal (straight-line) path length
   * @returns Efficiency reward [0, 1]
   */
  efficiencyReward(pathLength: number, optimalLength: number): number {
    if (pathLength === 0) return 1.0;
    return Math.max(0, 1 - (pathLength - optimalLength) / optimalLength);
  }

  /**
   * Shapes a reward with potential-based shaping.
   * Maintains optimal policy while providing denser feedback.
   * @param reward - Base reward
   * @param currentPotential - Potential function value at current state
   * @param nextPotential - Potential function value at next state
   * @returns Shaped reward
   */
  potentialBasedShaping(
    reward: number,
    currentPotential: number,
    nextPotential: number
  ): number {
    return reward + this.config.gamma * nextPotential - currentPotential;
  }

  /**
   * Normalizes a reward using running statistics.
   * @param reward - Raw reward
   * @returns Normalized reward
   */
  private normalize(reward: number): number {
    // Update running statistics
    const alpha = 0.01;
    this.runningMean = (1 - alpha) * this.runningMean + alpha * reward;

    const diff = reward - this.runningMean;
    const variance = (1 - alpha) * (this.runningStd * this.runningStd) + alpha * diff * diff;
    this.runningStd = Math.sqrt(variance);

    // Normalize
    return (reward - this.runningMean) / Math.max(this.runningStd, 1e-8);
  }

  /**
   * Calculates discounted return from a sequence of rewards.
   * @param rewards - Array of rewards
   * @param gamma - Discount factor (default: from config)
   * @returns Discounted return
   */
  discountedReturn(rewards: number[], gamma?: number): number {
    const discountFactor = gamma ?? this.config.gamma;
    let ret = 0;
    let discount = 1;

    for (const reward of rewards) {
      ret += discount * reward;
      discount *= discountFactor;
    }

    return ret;
  }

  /**
   * Gets reward statistics from history.
   * @returns Reward statistics
   */
  getStats(): {
    mean: number;
    std: number;
    min: number;
    max: number;
    count: number;
  } {
    if (this.rewardHistory.length === 0) {
      return { mean: 0, std: 0, min: 0, max: 0, count: 0 };
    }

    const mean = this.rewardHistory.reduce((a, b) => a + b, 0) / this.rewardHistory.length;
    const variance =
      this.rewardHistory.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) /
      this.rewardHistory.length;
    const std = Math.sqrt(variance);
    const min = Math.min(...this.rewardHistory);
    const max = Math.max(...this.rewardHistory);

    return { mean, std, min, max, count: this.rewardHistory.length };
  }

  /**
   * Gets the total reward for the current episode.
   * @returns Episode return
   */
  getEpisodeReturn(): number {
    return this.episodeRewards.reduce((a, b) => a + b, 0);
  }

  /**
   * Resets episode rewards.
   * Call this at the start of each new episode.
   */
  resetEpisode(): void {
    this.episodeRewards = [];
  }

  /**
   * Clears all reward history.
   */
  clearHistory(): void {
    this.rewardHistory = [];
    this.episodeRewards = [];
    this.runningMean = 0;
    this.runningStd = 1;
  }

  /**
   * Updates reward weights.
   * @param weights - New weight values
   */
  updateWeights(weights: Partial<RewardFunctionConfig['weights']>): void {
    Object.assign(this.config.weights, weights);
    logger.debug('Reward weights updated', weights);
  }
}
