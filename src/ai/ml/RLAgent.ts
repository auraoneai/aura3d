/**
 * Reinforcement learning agent base with PPO-style updates.
 * Provides framework for on-policy RL training and inference.
 * @module RLAgent
 */

import { Logger } from '../../core/Logger';
import { PolicyNetwork } from './PolicyNetwork';
import { ValueNetwork } from './ValueNetwork';
import { FeatureExtractor, Observation } from './FeatureExtractor';
import { RewardFunction, RewardComponents } from './RewardFunction';
import { ExperienceBuffer, Experience } from './ExperienceBuffer';
import { ONNXTensor } from './ONNXRuntimeWrapper';

const logger = Logger.create('RLAgent');

/**
 * RL agent configuration.
 */
export interface RLAgentConfig {
  /** Discount factor for future rewards */
  gamma?: number;
  /** GAE lambda parameter */
  lambda?: number;
  /** PPO clipping parameter */
  clipRange?: number;
  /** Value function coefficient in loss */
  valueCoef?: number;
  /** Entropy coefficient for exploration */
  entropyCoef?: number;
  /** Learning rate */
  learningRate?: number;
  /** Number of optimization epochs per update */
  updateEpochs?: number;
  /** Mini-batch size for updates */
  batchSize?: number;
  /** Maximum gradient norm for clipping */
  maxGradNorm?: number;
}

/**
 * Agent step result.
 */
export interface StepResult {
  /** Action taken */
  action: number | number[];
  /** State value estimate */
  value: number;
  /** Action log probability */
  logProb: number;
  /** Action entropy */
  entropy: number;
}

/**
 * Training statistics.
 */
export interface TrainingStats {
  /** Policy loss */
  policyLoss: number;
  /** Value loss */
  valueLoss: number;
  /** Total loss */
  totalLoss: number;
  /** Average advantage */
  avgAdvantage: number;
  /** Average return */
  avgReturn: number;
  /** KL divergence (policy change) */
  klDivergence?: number;
  /** Explained variance */
  explainedVariance?: number;
}

/**
 * Reinforcement learning agent implementing PPO-style training.
 * Supports both discrete and continuous action spaces.
 */
export class RLAgent {
  private readonly policy: PolicyNetwork;
  private readonly value: ValueNetwork;
  private readonly featureExtractor: FeatureExtractor;
  private readonly rewardFunction: RewardFunction;
  private readonly buffer: ExperienceBuffer;
  private readonly config: Required<RLAgentConfig>;
  private episodeReward: number = 0;
  private episodeLength: number = 0;
  private totalSteps: number = 0;

  /**
   * Creates a new RL agent.
   * @param policy - Policy network
   * @param value - Value network
   * @param featureExtractor - Feature extractor
   * @param rewardFunction - Reward function
   * @param config - Agent configuration
   */
  constructor(
    policy: PolicyNetwork,
    value: ValueNetwork,
    featureExtractor: FeatureExtractor,
    rewardFunction: RewardFunction,
    config: RLAgentConfig = {}
  ) {
    this.policy = policy;
    this.value = value;
    this.featureExtractor = featureExtractor;
    this.rewardFunction = rewardFunction;

    this.config = {
      gamma: config.gamma ?? 0.99,
      lambda: config.lambda ?? 0.95,
      clipRange: config.clipRange ?? 0.2,
      valueCoef: config.valueCoef ?? 0.5,
      entropyCoef: config.entropyCoef ?? 0.01,
      learningRate: config.learningRate ?? 0.0003,
      updateEpochs: config.updateEpochs ?? 4,
      batchSize: config.batchSize ?? 64,
      maxGradNorm: config.maxGradNorm ?? 0.5,
    };

    // Initialize experience buffer for trajectories
    this.buffer = new ExperienceBuffer({
      type: 'trajectory',
      capacity: 10000,
    });

    logger.info('RLAgent initialized', { config: this.config });
  }

  /**
   * Selects an action for the given observation.
   * @param observation - Current observation
   * @returns Step result with action and metadata
   */
  async step(observation: Observation): Promise<StepResult> {
    // Extract features
    const features = this.featureExtractor.extract(observation);

    // Get policy action
    const policyOutput = await this.policy.selectAction(features);

    // Get value estimate
    const valueOutput = await this.value.estimate(features);

    this.episodeLength++;
    this.totalSteps++;

    return {
      action: policyOutput.action,
      value: valueOutput.value,
      logProb: policyOutput.logProb ?? 0,
      entropy: policyOutput.entropy ?? 0,
    };
  }

  /**
   * Records a transition in the experience buffer.
   * @param observation - Current observation
   * @param action - Action taken
   * @param rewardComponents - Reward components
   * @param nextObservation - Next observation
   * @param done - Whether episode ended
   * @param metadata - Additional metadata (logProb, value, etc.)
   */
  recordTransition(
    observation: Observation,
    action: number | number[],
    rewardComponents: RewardComponents,
    nextObservation: Observation,
    done: boolean,
    metadata?: {
      logProb?: number;
      value?: number;
      entropy?: number;
    }
  ): void {
    // Calculate reward
    const reward = this.rewardFunction.calculate(rewardComponents);

    // Extract features
    const state = this.featureExtractor.extract(observation);
    const nextState = this.featureExtractor.extract(nextObservation);

    // Create experience
    const experience: Experience = {
      state,
      action,
      reward,
      nextState,
      done,
      metadata,
    };

    // Add to buffer
    this.buffer.add(experience);

    // Track episode reward
    this.episodeReward += reward;

    // Reset episode if done
    if (done) {
      logger.debug(
        `Episode complete: reward=${this.episodeReward.toFixed(2)}, ` +
        `length=${this.episodeLength}`
      );

      this.rewardFunction.resetEpisode();
      this.episodeReward = 0;
      this.episodeLength = 0;
    }
  }

  /**
   * Updates the policy and value networks using PPO.
   * In a full implementation, this would perform gradient-based optimization.
   * @returns Training statistics
   */
  async update(): Promise<TrainingStats> {
    // Get all trajectories
    const trajectories = this.buffer.getTrajectories();

    if (trajectories.length === 0) {
      throw new Error('No trajectories available for update');
    }

    logger.info(`Updating with ${trajectories.length} trajectories`);

    // Compute advantages and returns
    const { advantages, returns } = this.computeAdvantagesAndReturns(trajectories);

    // Normalize advantages
    const normalizedAdvantages = this.normalizeAdvantages(advantages);

    // Perform multiple update epochs
    let totalPolicyLoss = 0;
    let totalValueLoss = 0;
    let totalLoss = 0;
    let updates = 0;

    for (let epoch = 0; epoch < this.config.updateEpochs; epoch++) {
      const stats = await this.updateEpoch(
        trajectories,
        normalizedAdvantages,
        returns
      );

      totalPolicyLoss += stats.policyLoss;
      totalValueLoss += stats.valueLoss;
      totalLoss += stats.totalLoss;
      updates++;
    }

    // Clear buffer after update
    this.buffer.clear();

    const avgReturn = returns.reduce((a, b) => a + b, 0) / returns.length;
    const avgAdvantage = advantages.reduce((a, b) => a + b, 0) / advantages.length;

    const stats: TrainingStats = {
      policyLoss: totalPolicyLoss / updates,
      valueLoss: totalValueLoss / updates,
      totalLoss: totalLoss / updates,
      avgAdvantage,
      avgReturn,
    };

    logger.info('Update complete', stats);

    return stats;
  }

  /**
   * Computes advantages and returns for all trajectories.
   * @param trajectories - Trajectory data
   * @returns Advantages and returns
   */
  private computeAdvantagesAndReturns(trajectories: any[]): {
    advantages: number[];
    returns: number[];
  } {
    const advantages: number[] = [];
    const returns: number[] = [];

    for (const trajectory of trajectories) {
      const rewards = trajectory.experiences.map((e: Experience) => e.reward);
      const values = trajectory.experiences.map(
        (e: Experience) => e.metadata?.value ?? 0
      );

      // Last value is 0 if episode ended, otherwise estimate from last state
      const lastValue = trajectory.experiences[trajectory.length - 1].done
        ? 0
        : values[values.length - 1];

      // Compute advantages using GAE
      const trajAdvantages = this.value.computeAdvantages(
        rewards,
        values,
        lastValue,
        this.config.gamma,
        this.config.lambda
      );

      // Compute returns
      const trajReturns = this.value.computeReturns(
        rewards,
        values,
        lastValue,
        this.config.gamma
      );

      advantages.push(...trajAdvantages);
      returns.push(...trajReturns);
    }

    return { advantages, returns };
  }

  /**
   * Normalizes advantages for stable training.
   * @param advantages - Raw advantages
   * @returns Normalized advantages
   */
  private normalizeAdvantages(advantages: number[]): number[] {
    const mean = advantages.reduce((a, b) => a + b, 0) / advantages.length;
    const variance =
      advantages.reduce((sum, a) => sum + Math.pow(a - mean, 2), 0) /
      advantages.length;
    const std = Math.sqrt(variance);

    return advantages.map((a) => (a - mean) / Math.max(std, 1e-8));
  }

  /**
   * Performs one update epoch.
   * In a full implementation, this would compute gradients and update weights.
   * @param trajectories - Trajectory data
   * @param advantages - Normalized advantages
   * @param returns - Computed returns
   * @returns Epoch statistics
   */
  private async updateEpoch(
    trajectories: any[],
    advantages: number[],
    returns: number[]
  ): Promise<TrainingStats> {
    // In a real implementation with trainable models:
    // 1. Create mini-batches
    // 2. For each batch:
    //    a. Compute current policy and value predictions
    //    b. Compute PPO clipped policy loss
    //    c. Compute value loss
    //    d. Compute entropy bonus
    //    e. Total loss = policy_loss + value_coef * value_loss - entropy_coef * entropy
    //    f. Backward pass and gradient step
    //    g. Clip gradients

    // For this implementation (inference-only):
    // We simulate the update by computing losses without actually updating

    let policyLoss = 0;
    let valueLoss = 0;
    let totalLoss = 0;

    // Simulate loss computation
    const allExperiences = trajectories.flatMap((t: any) => t.experiences);

    for (let i = 0; i < allExperiences.length; i++) {
      const exp = allExperiences[i];
      const advantage = advantages[i];
      const returnValue = returns[i];

      // Simulate policy loss (negative advantage weighted by log prob)
      const oldLogProb = exp.metadata?.logProb ?? 0;
      policyLoss += -advantage * oldLogProb;

      // Simulate value loss (MSE)
      const predictedValue = exp.metadata?.value ?? 0;
      valueLoss += Math.pow(returnValue - predictedValue, 2);
    }

    policyLoss /= allExperiences.length;
    valueLoss /= allExperiences.length;
    totalLoss = policyLoss + this.config.valueCoef * valueLoss;

    return {
      policyLoss,
      valueLoss,
      totalLoss,
      avgAdvantage: advantages.reduce((a, b) => a + b, 0) / advantages.length,
      avgReturn: returns.reduce((a, b) => a + b, 0) / returns.length,
    };
  }

  /**
   * Checks if enough data is available for update.
   * @param minSteps - Minimum steps required
   * @returns True if ready to update
   */
  canUpdate(minSteps: number): boolean {
    return this.buffer.hasEnoughSamples(minSteps);
  }

  /**
   * Gets the experience buffer.
   * @returns Experience buffer
   */
  getBuffer(): ExperienceBuffer {
    return this.buffer;
  }

  /**
   * Gets total steps taken by agent.
   * @returns Step count
   */
  getTotalSteps(): number {
    return this.totalSteps;
  }

  /**
   * Gets current episode reward.
   * @returns Episode reward
   */
  getEpisodeReward(): number {
    return this.episodeReward;
  }

  /**
   * Gets current episode length.
   * @returns Episode length
   */
  getEpisodeLength(): number {
    return this.episodeLength;
  }

  /**
   * Resets the agent for a new episode.
   */
  resetEpisode(): void {
    this.episodeReward = 0;
    this.episodeLength = 0;
    this.rewardFunction.resetEpisode();
  }
}
