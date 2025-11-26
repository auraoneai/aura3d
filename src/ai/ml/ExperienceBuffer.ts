/**
 * Experience replay buffer for storing and sampling training data.
 * Supports both on-policy (trajectory) and off-policy (replay) storage.
 * @module ExperienceBuffer
 */

import { Logger } from '../../core/Logger';
import { ONNXTensor } from './ONNXRuntimeWrapper';

const logger = Logger.create('ExperienceBuffer');

/**
 * Single experience/transition in the environment.
 */
export interface Experience {
  /** State observation tensor */
  state: ONNXTensor;
  /** Action taken */
  action: number | number[];
  /** Reward received */
  reward: number;
  /** Next state observation tensor */
  nextState: ONNXTensor;
  /** Whether the episode terminated */
  done: boolean;
  /** Additional metadata */
  metadata?: {
    /** Action log probability */
    logProb?: number;
    /** State value estimate */
    value?: number;
    /** Advantage estimate */
    advantage?: number;
    /** Action entropy */
    entropy?: number;
    /** Custom data */
    custom?: Record<string, unknown>;
  };
}

/**
 * Trajectory (sequence of experiences) for on-policy algorithms.
 */
export interface Trajectory {
  /** Sequence of experiences */
  experiences: Experience[];
  /** Total trajectory return */
  totalReturn: number;
  /** Trajectory length */
  length: number;
}

/**
 * Experience buffer configuration.
 */
export interface ExperienceBufferConfig {
  /** Maximum buffer capacity */
  capacity?: number;
  /** Buffer type: 'replay' for off-policy, 'trajectory' for on-policy */
  type?: 'replay' | 'trajectory';
  /** Enable prioritized sampling */
  prioritized?: boolean;
  /** Priority exponent for prioritized sampling */
  alpha?: number;
  /** Importance sampling exponent */
  beta?: number;
}

/**
 * Experience replay buffer with support for various sampling strategies.
 */
export class ExperienceBuffer {
  private buffer: Experience[] = [];
  private trajectories: Trajectory[] = [];
  private currentTrajectory: Experience[] = [];
  private readonly config: Required<ExperienceBufferConfig>;
  private priorities: number[] = [];
  private totalExperiences: number = 0;

  /**
   * Creates a new experience buffer.
   * @param config - Buffer configuration
   */
  constructor(config: ExperienceBufferConfig = {}) {
    this.config = {
      capacity: config.capacity ?? 10000,
      type: config.type ?? 'replay',
      prioritized: config.prioritized ?? false,
      alpha: config.alpha ?? 0.6,
      beta: config.beta ?? 0.4,
    };

    logger.info('ExperienceBuffer initialized', {
      capacity: this.config.capacity,
      type: this.config.type,
      prioritized: this.config.prioritized,
    });
  }

  /**
   * Adds an experience to the buffer.
   * @param experience - Experience to add
   */
  add(experience: Experience): void {
    if (this.config.type === 'trajectory') {
      // Add to current trajectory
      this.currentTrajectory.push(experience);

      // If episode ended, finalize trajectory
      if (experience.done) {
        this.finalizeTrajectory();
      }
    } else {
      // Add to replay buffer
      this.buffer.push(experience);

      // Initialize priority for new experience
      if (this.config.prioritized) {
        const maxPriority = this.priorities.length > 0
          ? Math.max(...this.priorities)
          : 1.0;
        this.priorities.push(maxPriority);
      }

      // Remove oldest if capacity exceeded
      if (this.buffer.length > this.config.capacity) {
        this.buffer.shift();
        if (this.config.prioritized) {
          this.priorities.shift();
        }
      }
    }

    this.totalExperiences++;
  }

  /**
   * Adds multiple experiences in batch.
   * @param experiences - Array of experiences
   */
  addBatch(experiences: Experience[]): void {
    for (const exp of experiences) {
      this.add(exp);
    }
  }

  /**
   * Finalizes the current trajectory and adds it to storage.
   */
  private finalizeTrajectory(): void {
    if (this.currentTrajectory.length === 0) {
      return;
    }

    const totalReturn = this.currentTrajectory.reduce(
      (sum, exp) => sum + exp.reward,
      0
    );

    const trajectory: Trajectory = {
      experiences: this.currentTrajectory,
      totalReturn,
      length: this.currentTrajectory.length,
    };

    this.trajectories.push(trajectory);

    // Remove oldest trajectory if capacity exceeded
    const totalSize = this.trajectories.reduce((sum, t) => sum + t.length, 0);
    while (totalSize > this.config.capacity && this.trajectories.length > 0) {
      this.trajectories.shift();
    }

    // Reset current trajectory
    this.currentTrajectory = [];

    logger.debug(`Trajectory finalized: length=${trajectory.length}, return=${totalReturn.toFixed(2)}`);
  }

  /**
   * Samples a batch of experiences uniformly.
   * @param batchSize - Number of experiences to sample
   * @returns Array of sampled experiences
   */
  sample(batchSize: number): Experience[] {
    if (this.buffer.length === 0) {
      throw new Error('Cannot sample from empty buffer');
    }

    if (this.config.prioritized) {
      return this.samplePrioritized(batchSize);
    }

    const batch: Experience[] = [];
    const availableSize = this.buffer.length;

    for (let i = 0; i < batchSize; i++) {
      const index = Math.floor(Math.random() * availableSize);
      batch.push(this.buffer[index]);
    }

    return batch;
  }

  /**
   * Samples experiences using prioritized experience replay.
   * @param batchSize - Number of experiences to sample
   * @returns Array of sampled experiences with importance weights
   */
  private samplePrioritized(batchSize: number): Experience[] {
    const batch: Experience[] = [];

    // Calculate probability distribution
    const totalPriority = this.priorities.reduce(
      (sum, p) => sum + Math.pow(p, this.config.alpha),
      0
    );

    const probabilities = this.priorities.map(
      (p) => Math.pow(p, this.config.alpha) / totalPriority
    );

    // Sample based on priorities
    for (let i = 0; i < batchSize; i++) {
      const index = this.sampleFromDistribution(probabilities);
      const experience = this.buffer[index];

      // Calculate importance sampling weight
      const probability = probabilities[index];
      const weight = Math.pow(this.buffer.length * probability, -this.config.beta);
      const maxWeight = Math.pow(
        this.buffer.length * Math.min(...probabilities),
        -this.config.beta
      );
      const normalizedWeight = weight / maxWeight;

      // Attach weight to metadata
      const experienceWithWeight = {
        ...experience,
        metadata: {
          ...experience.metadata,
          importanceWeight: normalizedWeight,
        },
      };

      batch.push(experienceWithWeight);
    }

    return batch;
  }

  /**
   * Samples an index from a probability distribution.
   * @param probabilities - Probability distribution
   * @returns Sampled index
   */
  private sampleFromDistribution(probabilities: number[]): number {
    const rand = Math.random();
    let cumulative = 0;

    for (let i = 0; i < probabilities.length; i++) {
      cumulative += probabilities[i];
      if (rand < cumulative) {
        return i;
      }
    }

    return probabilities.length - 1;
  }

  /**
   * Updates priorities for prioritized replay.
   * @param indices - Indices of experiences to update
   * @param priorities - New priority values
   */
  updatePriorities(indices: number[], priorities: number[]): void {
    if (!this.config.prioritized) {
      logger.warn('Attempted to update priorities on non-prioritized buffer');
      return;
    }

    for (let i = 0; i < indices.length; i++) {
      const index = indices[i];
      if (index >= 0 && index < this.priorities.length) {
        this.priorities[index] = priorities[i];
      }
    }
  }

  /**
   * Gets all trajectories.
   * Used for on-policy algorithms that need full trajectories.
   * @returns Array of trajectories
   */
  getTrajectories(): Trajectory[] {
    return [...this.trajectories];
  }

  /**
   * Gets all experiences from all trajectories.
   * @returns Flattened array of experiences
   */
  getAllExperiences(): Experience[] {
    if (this.config.type === 'trajectory') {
      const all: Experience[] = [];
      for (const trajectory of this.trajectories) {
        all.push(...trajectory.experiences);
      }
      return all;
    }
    return [...this.buffer];
  }

  /**
   * Gets the most recent N experiences.
   * @param count - Number of recent experiences to retrieve
   * @returns Array of recent experiences
   */
  getRecent(count: number): Experience[] {
    const experiences = this.config.type === 'trajectory'
      ? this.getAllExperiences()
      : this.buffer;

    const start = Math.max(0, experiences.length - count);
    return experiences.slice(start);
  }

  /**
   * Clears all stored experiences and trajectories.
   */
  clear(): void {
    this.buffer = [];
    this.trajectories = [];
    this.currentTrajectory = [];
    this.priorities = [];
    logger.debug('Experience buffer cleared');
  }

  /**
   * Gets buffer size information.
   * @returns Size statistics
   */
  size(): {
    experiences: number;
    trajectories: number;
    capacity: number;
    utilization: number;
  } {
    const experiences = this.config.type === 'trajectory'
      ? this.trajectories.reduce((sum, t) => sum + t.length, 0)
      : this.buffer.length;

    return {
      experiences,
      trajectories: this.trajectories.length,
      capacity: this.config.capacity,
      utilization: experiences / this.config.capacity,
    };
  }

  /**
   * Gets statistics about stored experiences.
   * @returns Experience statistics
   */
  getStats(): {
    totalExperiences: number;
    averageReward: number;
    averageTrajectoryLength: number;
    averageTrajectoryReturn: number;
  } {
    const all = this.getAllExperiences();

    const averageReward = all.length > 0
      ? all.reduce((sum, exp) => sum + exp.reward, 0) / all.length
      : 0;

    const averageTrajectoryLength = this.trajectories.length > 0
      ? this.trajectories.reduce((sum, t) => sum + t.length, 0) / this.trajectories.length
      : 0;

    const averageTrajectoryReturn = this.trajectories.length > 0
      ? this.trajectories.reduce((sum, t) => sum + t.totalReturn, 0) / this.trajectories.length
      : 0;

    return {
      totalExperiences: this.totalExperiences,
      averageReward,
      averageTrajectoryLength,
      averageTrajectoryReturn,
    };
  }

  /**
   * Checks if buffer has enough samples for training.
   * @param minSamples - Minimum required samples
   * @returns True if buffer has enough samples
   */
  hasEnoughSamples(minSamples: number): boolean {
    const size = this.config.type === 'trajectory'
      ? this.getAllExperiences().length
      : this.buffer.length;
    return size >= minSamples;
  }

  /**
   * Gets buffer capacity.
   * @returns Maximum buffer capacity
   */
  getCapacity(): number {
    return this.config.capacity;
  }
}
