/**
 * Value network for state value estimation in reinforcement learning.
 * Predicts expected future rewards from current state.
 * @module ValueNetwork
 */

import { Logger } from '../../core/Logger';
import { InferenceSession } from './ONNXRuntimeWrapper';
import { ONNXTensor } from './ONNXRuntimeWrapper';

const logger = Logger.create('ValueNetwork');

/**
 * Value network configuration.
 */
export interface ValueNetworkConfig {
  /** Input tensor name (default: 'input') */
  inputName?: string;
  /** Output tensor name (default: 'output') */
  outputName?: string;
  /** Value normalization parameters */
  normalization?: {
    /** Whether to normalize values */
    enabled: boolean;
    /** Running mean for normalization */
    mean?: number;
    /** Running standard deviation for normalization */
    std?: number;
    /** Smoothing factor for running statistics */
    alpha?: number;
  };
}

/**
 * Value network output.
 */
export interface ValueOutput {
  /** Estimated state value */
  value: number;
  /** Raw (unnormalized) value if normalization is enabled */
  rawValue?: number;
}

/**
 * Value network for estimating state values.
 * Used in actor-critic algorithms for advantage estimation.
 */
export class ValueNetwork {
  private readonly session: InferenceSession;
  private readonly config: Required<ValueNetworkConfig>;
  private inferenceCount: number = 0;
  private runningMean: number = 0;
  private runningStd: number = 1;
  private valueHistory: number[] = [];

  /**
   * Creates a new value network.
   * @param session - ONNX inference session
   * @param config - Value network configuration
   */
  constructor(session: InferenceSession, config: ValueNetworkConfig = {}) {
    this.session = session;
    this.config = {
      inputName: config.inputName ?? 'input',
      outputName: config.outputName ?? 'output',
      normalization: {
        enabled: config.normalization?.enabled ?? false,
        mean: config.normalization?.mean ?? 0,
        std: config.normalization?.std ?? 1,
        alpha: config.normalization?.alpha ?? 0.01,
      },
    };

    if (this.config.normalization.enabled) {
      this.runningMean = this.config.normalization.mean!;
      this.runningStd = this.config.normalization.std!;
    }

    logger.info('ValueNetwork initialized', {
      normalization: this.config.normalization.enabled,
    });
  }

  /**
   * Estimates the value of a given state.
   * @param observation - Feature tensor from observation
   * @returns Value estimate
   */
  async estimate(observation: ONNXTensor): Promise<ValueOutput> {
    // Run inference
    const feeds = { [this.config.inputName]: observation };
    const outputs = await this.session.run(feeds, [this.config.outputName]);
    const output = outputs[this.config.outputName];

    this.inferenceCount++;

    // Extract value (assumes single output scalar or first element)
    const data = output.data as Float32Array;
    const rawValue = data[0];

    // Update running statistics
    if (this.config.normalization.enabled) {
      this.updateStatistics(rawValue);
    }

    // Denormalize if needed
    let value = rawValue;
    if (this.config.normalization.enabled) {
      value = this.denormalize(rawValue);
    }

    // Track value history for analysis
    this.valueHistory.push(value);
    if (this.valueHistory.length > 1000) {
      this.valueHistory.shift();
    }

    return {
      value,
      rawValue: this.config.normalization.enabled ? rawValue : undefined,
    };
  }

  /**
   * Estimates values for a batch of observations.
   * @param observations - Batch of observations
   * @returns Array of value estimates
   */
  async estimateBatch(observations: ONNXTensor): Promise<ValueOutput[]> {
    const feeds = { [this.config.inputName]: observations };
    const outputs = await this.session.run(feeds, [this.config.outputName]);
    const output = outputs[this.config.outputName];

    const data = output.data as Float32Array;
    const batchSize = observations.dims[0];
    const results: ValueOutput[] = [];

    for (let i = 0; i < batchSize; i++) {
      const rawValue = data[i];

      if (this.config.normalization.enabled) {
        this.updateStatistics(rawValue);
      }

      let value = rawValue;
      if (this.config.normalization.enabled) {
        value = this.denormalize(rawValue);
      }

      this.valueHistory.push(value);
      if (this.valueHistory.length > 1000) {
        this.valueHistory.shift();
      }

      results.push({
        value,
        rawValue: this.config.normalization.enabled ? rawValue : undefined,
      });
    }

    this.inferenceCount += batchSize;
    return results;
  }

  /**
   * Computes advantages from rewards and values.
   * Uses Generalized Advantage Estimation (GAE).
   * @param rewards - Array of rewards
   * @param values - Array of state values
   * @param nextValue - Value of the next state after the last step
   * @param gamma - Discount factor (default: 0.99)
   * @param lambda - GAE lambda parameter (default: 0.95)
   * @returns Array of advantages
   */
  computeAdvantages(
    rewards: number[],
    values: number[],
    nextValue: number,
    gamma: number = 0.99,
    lambda: number = 0.95
  ): number[] {
    const advantages: number[] = [];
    let lastGAE = 0;

    // Compute GAE backwards from the last timestep
    for (let t = rewards.length - 1; t >= 0; t--) {
      const value = values[t];
      const nextVal = t === rewards.length - 1 ? nextValue : values[t + 1];
      const reward = rewards[t];

      // TD error: r + gamma * V(s') - V(s)
      const delta = reward + gamma * nextVal - value;

      // GAE: A(s,a) = delta + gamma * lambda * A(s',a')
      lastGAE = delta + gamma * lambda * lastGAE;
      advantages.unshift(lastGAE);
    }

    return advantages;
  }

  /**
   * Computes returns from rewards and values.
   * @param rewards - Array of rewards
   * @param values - Array of state values
   * @param nextValue - Value of the next state
   * @param gamma - Discount factor (default: 0.99)
   * @returns Array of returns
   */
  computeReturns(
    rewards: number[],
    values: number[],
    nextValue: number,
    gamma: number = 0.99
  ): number[] {
    const returns: number[] = [];
    let ret = nextValue;

    // Compute returns backwards
    for (let t = rewards.length - 1; t >= 0; t--) {
      ret = rewards[t] + gamma * ret;
      returns.unshift(ret);
    }

    return returns;
  }

  /**
   * Normalizes a value using running statistics.
   * @param value - Raw value
   * @returns Normalized value
   */
  private normalize(value: number): number {
    return (value - this.runningMean) / Math.max(this.runningStd, 1e-8);
  }

  /**
   * Denormalizes a value using running statistics.
   * @param normalizedValue - Normalized value
   * @returns Denormalized value
   */
  private denormalize(normalizedValue: number): number {
    return normalizedValue * this.runningStd + this.runningMean;
  }

  /**
   * Updates running mean and standard deviation.
   * Uses exponential moving average.
   * @param value - New value to incorporate
   */
  private updateStatistics(value: number): void {
    const alpha = this.config.normalization.alpha!;

    // Update running mean
    this.runningMean = (1 - alpha) * this.runningMean + alpha * value;

    // Update running variance
    const diff = value - this.runningMean;
    const variance = (1 - alpha) * (this.runningStd * this.runningStd) + alpha * diff * diff;
    this.runningStd = Math.sqrt(variance);
  }

  /**
   * Gets the current normalization statistics.
   * @returns Mean and standard deviation
   */
  getNormalizationStats(): { mean: number; std: number } {
    return {
      mean: this.runningMean,
      std: this.runningStd,
    };
  }

  /**
   * Sets normalization statistics manually.
   * Useful for loading pre-trained models.
   * @param mean - Mean value
   * @param std - Standard deviation
   */
  setNormalizationStats(mean: number, std: number): void {
    this.runningMean = mean;
    this.runningStd = std;
    logger.debug('Normalization stats updated', { mean, std });
  }

  /**
   * Gets value statistics from recent history.
   * @returns Statistics about recent value estimates
   */
  getValueStats(): {
    mean: number;
    std: number;
    min: number;
    max: number;
    count: number;
  } {
    if (this.valueHistory.length === 0) {
      return { mean: 0, std: 0, min: 0, max: 0, count: 0 };
    }

    const mean = this.valueHistory.reduce((a, b) => a + b, 0) / this.valueHistory.length;
    const variance =
      this.valueHistory.reduce((sum, v) => sum + Math.pow(v - mean, 2), 0) /
      this.valueHistory.length;
    const std = Math.sqrt(variance);
    const min = Math.min(...this.valueHistory);
    const max = Math.max(...this.valueHistory);

    return { mean, std, min, max, count: this.valueHistory.length };
  }

  /**
   * Gets inference statistics.
   * @returns Inference count
   */
  getInferenceCount(): number {
    return this.inferenceCount;
  }

  /**
   * Resets inference statistics and value history.
   */
  resetStats(): void {
    this.inferenceCount = 0;
    this.valueHistory = [];
  }

  /**
   * Clears value history.
   */
  clearHistory(): void {
    this.valueHistory = [];
  }
}
