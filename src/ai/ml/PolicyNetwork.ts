/**
 * Policy network wrapper for action selection in reinforcement learning.
 * Implements stochastic and deterministic policy evaluation.
 * @module PolicyNetwork
 */

import { Logger } from '../../core/Logger';
import { InferenceSession } from './ONNXRuntimeWrapper';
import { ONNXTensor } from './ONNXRuntimeWrapper';
import { softmax, sampleCategorical } from './TensorUtils';

const logger = Logger.create('PolicyNetwork');

/**
 * Action space configuration.
 */
export interface ActionSpace {
  /** Type of action space */
  type: 'discrete' | 'continuous';
  /** Number of discrete actions or continuous dimensions */
  size: number;
  /** Min/max bounds for continuous actions */
  bounds?: { min: number; max: number };
}

/**
 * Policy network output.
 */
export interface PolicyOutput {
  /** Selected action(s) */
  action: number | number[];
  /** Action probabilities (discrete) or mean values (continuous) */
  distribution: Float32Array;
  /** Log probability of selected action */
  logProb?: number;
  /** Entropy of action distribution */
  entropy?: number;
}

/**
 * Policy network configuration.
 */
export interface PolicyNetworkConfig {
  /** Action space specification */
  actionSpace: ActionSpace;
  /** Input tensor name (default: 'input') */
  inputName?: string;
  /** Output tensor name (default: 'output') */
  outputName?: string;
  /** Use stochastic sampling (default: true) */
  stochastic?: boolean;
  /** Temperature for sampling (default: 1.0) */
  temperature?: number;
  /** Enable action masking */
  enableActionMasking?: boolean;
}

/**
 * Policy network for selecting actions based on observations.
 * Supports both discrete and continuous action spaces.
 */
export class PolicyNetwork {
  private readonly session: InferenceSession;
  private readonly config: Required<PolicyNetworkConfig>;
  private inferenceCount: number = 0;

  /**
   * Creates a new policy network.
   * @param session - ONNX inference session
   * @param config - Policy configuration
   */
  constructor(session: InferenceSession, config: PolicyNetworkConfig) {
    this.session = session;
    this.config = {
      actionSpace: config.actionSpace,
      inputName: config.inputName ?? 'input',
      outputName: config.outputName ?? 'output',
      stochastic: config.stochastic ?? true,
      temperature: config.temperature ?? 1.0,
      enableActionMasking: config.enableActionMasking ?? false,
    };

    logger.info('PolicyNetwork initialized', {
      actionSpace: this.config.actionSpace,
      stochastic: this.config.stochastic,
    });
  }

  /**
   * Selects an action based on the current observation.
   * @param observation - Feature tensor from observation
   * @param actionMask - Optional mask for invalid actions (discrete only)
   * @returns Policy output with selected action
   */
  async selectAction(
    observation: ONNXTensor,
    actionMask?: boolean[]
  ): Promise<PolicyOutput> {
    // Run inference
    const feeds = { [this.config.inputName]: observation };
    const outputs = await this.session.run(feeds, [this.config.outputName]);
    const output = outputs[this.config.outputName];

    this.inferenceCount++;

    // Handle discrete action space
    if (this.config.actionSpace.type === 'discrete') {
      return this.selectDiscreteAction(output, actionMask);
    } else {
      return this.selectContinuousAction(output);
    }
  }

  /**
   * Selects a discrete action from policy logits.
   * @param logits - Raw network output (logits)
   * @param actionMask - Optional mask for invalid actions
   * @returns Policy output with selected action
   */
  private selectDiscreteAction(
    logits: ONNXTensor,
    actionMask?: boolean[]
  ): PolicyOutput {
    let probs = softmax(logits);
    let probArray = Array.from(probs.data as Float32Array);

    // Apply action mask if provided
    if (actionMask && this.config.enableActionMasking) {
      for (let i = 0; i < probArray.length; i++) {
        if (!actionMask[i]) {
          probArray[i] = 0;
        }
      }

      // Renormalize
      const sum = probArray.reduce((a, b) => a + b, 0);
      if (sum > 0) {
        probArray = probArray.map((p) => p / sum);
      } else {
        // All actions masked - uniform distribution over valid actions
        const validCount = actionMask.filter((m) => m).length;
        probArray = actionMask.map((m) => (m ? 1 / validCount : 0));
      }

      (probs.data as Float32Array).set(probArray);
    }

    // Sample or take argmax
    let action: number;
    if (this.config.stochastic) {
      action = sampleCategorical(probs, this.config.temperature);
    } else {
      // Deterministic: select action with highest probability
      action = probArray.indexOf(Math.max(...probArray));
    }

    // Calculate log probability
    const logProb = Math.log(Math.max(probArray[action], 1e-10));

    // Calculate entropy: H = -sum(p * log(p))
    const entropy = -probArray.reduce((sum, p) => {
      return sum + (p > 0 ? p * Math.log(p) : 0);
    }, 0);

    return {
      action,
      distribution: new Float32Array(probArray),
      logProb,
      entropy,
    };
  }

  /**
   * Selects a continuous action from policy output.
   * Assumes network outputs mean values; adds noise if stochastic.
   * @param output - Network output (mean values)
   * @returns Policy output with selected action
   */
  private selectContinuousAction(output: ONNXTensor): PolicyOutput {
    const means = Array.from(output.data as Float32Array);
    const actions: number[] = [];

    // Sample actions
    for (const mean of means) {
      let action = mean;

      if (this.config.stochastic) {
        // Add Gaussian noise for exploration
        const noise = this.gaussianRandom() * 0.1; // Fixed std dev
        action = mean + noise;
      }

      // Clip to bounds
      if (this.config.actionSpace.bounds) {
        const { min, max } = this.config.actionSpace.bounds;
        action = Math.max(min, Math.min(max, action));
      }

      actions.push(action);
    }

    // Calculate log probability (assuming Gaussian)
    const stdDev = 0.1; // Fixed for simplicity
    const logProb = actions.reduce((sum, action, i) => {
      const diff = action - means[i];
      return sum - 0.5 * Math.log(2 * Math.PI * stdDev * stdDev) -
        (diff * diff) / (2 * stdDev * stdDev);
    }, 0);

    return {
      action: actions,
      distribution: new Float32Array(means),
      logProb,
      entropy: 0.5 * Math.log(2 * Math.PI * Math.E * stdDev * stdDev),
    };
  }

  /**
   * Evaluates action log probabilities for given observations and actions.
   * Used during policy updates.
   * @param observation - Feature tensor
   * @param action - Action to evaluate
   * @returns Log probability and entropy
   */
  async evaluateAction(
    observation: ONNXTensor,
    action: number | number[]
  ): Promise<{ logProb: number; entropy: number }> {
    // Run inference
    const feeds = { [this.config.inputName]: observation };
    const outputs = await this.session.run(feeds, [this.config.outputName]);
    const output = outputs[this.config.outputName];

    if (this.config.actionSpace.type === 'discrete') {
      const probs = softmax(output);
      const probArray = Array.from(probs.data as Float32Array);
      const actionIndex = action as number;

      const logProb = Math.log(Math.max(probArray[actionIndex], 1e-10));
      const entropy = -probArray.reduce((sum, p) => {
        return sum + (p > 0 ? p * Math.log(p) : 0);
      }, 0);

      return { logProb, entropy };
    } else {
      // Continuous action space
      const means = Array.from(output.data as Float32Array);
      const actions = action as number[];
      const stdDev = 0.1;

      const logProb = actions.reduce((sum, a, i) => {
        const diff = a - means[i];
        return sum - 0.5 * Math.log(2 * Math.PI * stdDev * stdDev) -
          (diff * diff) / (2 * stdDev * stdDev);
      }, 0);

      const entropy = 0.5 * Math.log(2 * Math.PI * Math.E * stdDev * stdDev);

      return { logProb, entropy };
    }
  }

  /**
   * Batch action selection for multiple observations.
   * @param observations - Batch of observations
   * @param actionMasks - Optional action masks for each observation
   * @returns Array of policy outputs
   */
  async selectActionBatch(
    observations: ONNXTensor,
    actionMasks?: boolean[][]
  ): Promise<PolicyOutput[]> {
    const batchSize = observations.dims[0];
    const outputs: PolicyOutput[] = [];

    // For simplicity, process sequentially
    // In production, batch inference would be more efficient
    for (let i = 0; i < batchSize; i++) {
      // Extract single observation (simplified - assumes proper slicing)
      const singleObs = observations; // Would need proper tensor slicing
      const mask = actionMasks?.[i];
      const output = await this.selectAction(singleObs, mask);
      outputs.push(output);
    }

    return outputs;
  }

  /**
   * Generates a random action from the action space.
   * Useful for exploration or initialization.
   * @returns Random action
   */
  randomAction(): number | number[] {
    if (this.config.actionSpace.type === 'discrete') {
      return Math.floor(Math.random() * this.config.actionSpace.size);
    } else {
      const actions: number[] = [];
      const bounds = this.config.actionSpace.bounds ?? { min: -1, max: 1 };

      for (let i = 0; i < this.config.actionSpace.size; i++) {
        const action = bounds.min + Math.random() * (bounds.max - bounds.min);
        actions.push(action);
      }

      return actions;
    }
  }

  /**
   * Sets whether to use stochastic or deterministic action selection.
   * @param stochastic - True for stochastic, false for deterministic
   */
  setStochastic(stochastic: boolean): void {
    this.config.stochastic = stochastic;
    logger.debug(`Policy mode set to ${stochastic ? 'stochastic' : 'deterministic'}`);
  }

  /**
   * Sets the temperature for stochastic sampling.
   * Higher temperature = more exploration.
   * @param temperature - Sampling temperature (> 0)
   */
  setTemperature(temperature: number): void {
    if (temperature <= 0) {
      throw new Error('Temperature must be positive');
    }
    this.config.temperature = temperature;
    logger.debug(`Temperature set to ${temperature}`);
  }

  /**
   * Gets inference statistics.
   * @returns Inference count
   */
  getInferenceCount(): number {
    return this.inferenceCount;
  }

  /**
   * Resets inference statistics.
   */
  resetStats(): void {
    this.inferenceCount = 0;
  }

  /**
   * Generates a random number from standard normal distribution.
   * Uses Box-Muller transform.
   * @returns Random number from N(0, 1)
   */
  private gaussianRandom(): number {
    const u1 = Math.random();
    const u2 = Math.random();
    return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  }
}
