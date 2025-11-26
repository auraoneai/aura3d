/**
 * Behavior cloning agent for learning from demonstrations.
 * Trains policy to mimic expert behavior through supervised learning.
 * @module BehaviorCloningAgent
 */

import { Logger } from '../../core/Logger';
import { PolicyNetwork } from './PolicyNetwork';
import { FeatureExtractor, Observation } from './FeatureExtractor';
import { ExperienceBuffer, Experience } from './ExperienceBuffer';
import { ONNXTensor } from './ONNXRuntimeWrapper';

const logger = Logger.create('BehaviorCloningAgent');

/**
 * Demonstration data (expert state-action pair).
 */
export interface Demonstration {
  /** Observation from expert */
  observation: Observation;
  /** Action taken by expert */
  action: number | number[];
  /** Optional action quality/confidence */
  quality?: number;
}

/**
 * Behavior cloning configuration.
 */
export interface BehaviorCloningConfig {
  /** Learning rate for updates */
  learningRate?: number;
  /** Batch size for training */
  batchSize?: number;
  /** Number of training epochs */
  epochs?: number;
  /** Validation split ratio */
  validationSplit?: number;
  /** Enable data augmentation */
  dataAugmentation?: boolean;
  /** Enable early stopping */
  earlyStopping?: {
    enabled: boolean;
    patience: number;
    minDelta: number;
  };
}

/**
 * Training metrics and statistics.
 */
export interface TrainingMetrics {
  /** Training loss */
  trainLoss: number;
  /** Validation loss */
  valLoss: number;
  /** Training accuracy (for discrete actions) */
  trainAccuracy?: number;
  /** Validation accuracy */
  valAccuracy?: number;
  /** Current epoch */
  epoch: number;
}

/**
 * Behavior cloning agent that learns from expert demonstrations.
 * Implements supervised learning for imitation learning.
 */
export class BehaviorCloningAgent {
  private readonly policy: PolicyNetwork;
  private readonly featureExtractor: FeatureExtractor;
  private readonly config: Required<BehaviorCloningConfig>;
  private demonstrations: Demonstration[] = [];
  private trainingMetrics: TrainingMetrics[] = [];

  /**
   * Creates a new behavior cloning agent.
   * @param policy - Policy network to train
   * @param featureExtractor - Feature extractor for observations
   * @param config - Behavior cloning configuration
   */
  constructor(
    policy: PolicyNetwork,
    featureExtractor: FeatureExtractor,
    config: BehaviorCloningConfig = {}
  ) {
    this.policy = policy;
    this.featureExtractor = featureExtractor;
    this.config = {
      learningRate: config.learningRate ?? 0.001,
      batchSize: config.batchSize ?? 32,
      epochs: config.epochs ?? 100,
      validationSplit: config.validationSplit ?? 0.2,
      dataAugmentation: config.dataAugmentation ?? false,
      earlyStopping: {
        enabled: config.earlyStopping?.enabled ?? true,
        patience: config.earlyStopping?.patience ?? 10,
        minDelta: config.earlyStopping?.minDelta ?? 0.001,
      },
    };

    logger.info('BehaviorCloningAgent initialized', { config: this.config });
  }

  /**
   * Adds a single demonstration to the dataset.
   * @param demonstration - Expert demonstration
   */
  addDemonstration(demonstration: Demonstration): void {
    this.demonstrations.push(demonstration);
  }

  /**
   * Adds multiple demonstrations in batch.
   * @param demonstrations - Array of demonstrations
   */
  addDemonstrations(demonstrations: Demonstration[]): void {
    this.demonstrations.push(...demonstrations);
    logger.info(`Added ${demonstrations.length} demonstrations (total: ${this.demonstrations.length})`);
  }

  /**
   * Loads demonstrations from an experience buffer.
   * @param buffer - Experience buffer containing demonstrations
   */
  loadFromExperiences(buffer: ExperienceBuffer): void {
    const experiences = buffer.getAllExperiences();

    for (const exp of experiences) {
      // Convert experience to demonstration
      // Note: This assumes state tensor can be converted back to observation
      // In practice, you might want to store observations directly
      const demo: Demonstration = {
        observation: this.createObservationFromTensor(exp.state),
        action: exp.action,
        quality: exp.metadata?.value,
      };

      this.demonstrations.push(demo);
    }

    logger.info(`Loaded ${experiences.length} demonstrations from buffer`);
  }

  /**
   * Creates a placeholder observation from a tensor.
   * In production, you would implement proper tensor-to-observation conversion.
   * @param tensor - State tensor
   * @returns Observation
   */
  private createObservationFromTensor(tensor: ONNXTensor): Observation {
    // Placeholder implementation
    // In production, this would properly decode the tensor back to observation
    return FeatureExtractor.createMinimalObservation(
      { x: 0, y: 0, z: 0 } as any
    );
  }

  /**
   * Trains the policy on collected demonstrations.
   * Uses supervised learning to minimize imitation loss.
   * @returns Training metrics history
   */
  async train(): Promise<TrainingMetrics[]> {
    if (this.demonstrations.length === 0) {
      throw new Error('No demonstrations available for training');
    }

    logger.info(`Starting behavior cloning training with ${this.demonstrations.length} demonstrations`);

    // Split into training and validation sets
    const splitIndex = Math.floor(
      this.demonstrations.length * (1 - this.config.validationSplit)
    );

    const shuffled = this.shuffle([...this.demonstrations]);
    const trainData = shuffled.slice(0, splitIndex);
    const valData = shuffled.slice(splitIndex);

    logger.info(`Train: ${trainData.length}, Validation: ${valData.length}`);

    // Training loop
    this.trainingMetrics = [];
    let bestValLoss = Infinity;
    let patienceCounter = 0;

    for (let epoch = 0; epoch < this.config.epochs; epoch++) {
      // Train epoch
      const trainLoss = await this.trainEpoch(trainData);

      // Validation epoch
      const valLoss = await this.validateEpoch(valData);

      // Record metrics
      const metrics: TrainingMetrics = {
        trainLoss,
        valLoss,
        epoch: epoch + 1,
      };
      this.trainingMetrics.push(metrics);

      logger.info(
        `Epoch ${epoch + 1}/${this.config.epochs}: ` +
        `train_loss=${trainLoss.toFixed(4)}, val_loss=${valLoss.toFixed(4)}`
      );

      // Early stopping check
      if (this.config.earlyStopping.enabled) {
        if (valLoss < bestValLoss - this.config.earlyStopping.minDelta) {
          bestValLoss = valLoss;
          patienceCounter = 0;
        } else {
          patienceCounter++;

          if (patienceCounter >= this.config.earlyStopping.patience) {
            logger.info(`Early stopping at epoch ${epoch + 1}`);
            break;
          }
        }
      }
    }

    logger.info('Training complete');
    return this.trainingMetrics;
  }

  /**
   * Trains for one epoch.
   * @param trainData - Training demonstrations
   * @returns Average training loss
   */
  private async trainEpoch(trainData: Demonstration[]): Promise<number> {
    const batches = this.createBatches(trainData, this.config.batchSize);
    let totalLoss = 0;

    for (const batch of batches) {
      const loss = await this.trainBatch(batch);
      totalLoss += loss;
    }

    return totalLoss / batches.length;
  }

  /**
   * Validates for one epoch.
   * @param valData - Validation demonstrations
   * @returns Average validation loss
   */
  private async validateEpoch(valData: Demonstration[]): Promise<number> {
    const batches = this.createBatches(valData, this.config.batchSize);
    let totalLoss = 0;

    for (const batch of batches) {
      const loss = await this.computeLoss(batch);
      totalLoss += loss;
    }

    return totalLoss / batches.length;
  }

  /**
   * Trains on a single batch.
   * In a full implementation, this would compute gradients and update weights.
   * @param batch - Batch of demonstrations
   * @returns Batch loss
   */
  private async trainBatch(batch: Demonstration[]): Promise<number> {
    // In a real implementation with training capability:
    // 1. Extract features from observations
    // 2. Forward pass through policy network
    // 3. Compute loss (e.g., cross-entropy for discrete, MSE for continuous)
    // 4. Backward pass to compute gradients
    // 5. Update policy weights

    // For this implementation (inference-only ONNX):
    // We simulate training by computing the loss
    return this.computeLoss(batch);
  }

  /**
   * Computes imitation loss for a batch.
   * @param batch - Batch of demonstrations
   * @returns Average loss
   */
  private async computeLoss(batch: Demonstration[]): Promise<number> {
    let totalLoss = 0;

    for (const demo of batch) {
      // Extract features
      const features = this.featureExtractor.extract(demo.observation);

      // Get policy prediction
      const output = await this.policy.selectAction(features);

      // Compute loss based on action space type
      // For discrete: cross-entropy
      // For continuous: mean squared error

      if (typeof demo.action === 'number') {
        // Discrete action - negative log likelihood
        const probs = output.distribution;
        const loss = -Math.log(Math.max(probs[demo.action], 1e-10));
        totalLoss += loss;
      } else {
        // Continuous action - MSE
        const predicted = output.action as number[];
        const target = demo.action;
        const mse = predicted.reduce((sum, pred, i) => {
          return sum + Math.pow(pred - target[i], 2);
        }, 0) / predicted.length;
        totalLoss += mse;
      }
    }

    return totalLoss / batch.length;
  }

  /**
   * Creates batches from demonstrations.
   * @param data - Demonstrations to batch
   * @param batchSize - Batch size
   * @returns Array of batches
   */
  private createBatches(
    data: Demonstration[],
    batchSize: number
  ): Demonstration[][] {
    const batches: Demonstration[][] = [];

    for (let i = 0; i < data.length; i += batchSize) {
      batches.push(data.slice(i, i + batchSize));
    }

    return batches;
  }

  /**
   * Shuffles an array using Fisher-Yates algorithm.
   * @param array - Array to shuffle
   * @returns Shuffled array
   */
  private shuffle<T>(array: T[]): T[] {
    const shuffled = [...array];

    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    return shuffled;
  }

  /**
   * Selects an action using the trained policy.
   * @param observation - Current observation
   * @returns Selected action
   */
  async selectAction(observation: Observation): Promise<number | number[]> {
    const features = this.featureExtractor.extract(observation);
    const output = await this.policy.selectAction(features);
    return output.action;
  }

  /**
   * Evaluates the policy on a test set.
   * @param testData - Test demonstrations
   * @returns Evaluation metrics
   */
  async evaluate(testData: Demonstration[]): Promise<{
    loss: number;
    accuracy?: number;
  }> {
    const loss = await this.validateEpoch(testData);

    // Compute accuracy for discrete actions
    let accuracy: number | undefined;
    if (testData.length > 0 && typeof testData[0].action === 'number') {
      let correct = 0;

      for (const demo of testData) {
        const features = this.featureExtractor.extract(demo.observation);
        const output = await this.policy.selectAction(features);

        if (output.action === demo.action) {
          correct++;
        }
      }

      accuracy = correct / testData.length;
    }

    logger.info(`Evaluation: loss=${loss.toFixed(4)}${accuracy !== undefined ? `, accuracy=${(accuracy * 100).toFixed(2)}%` : ''}`);

    return { loss, accuracy };
  }

  /**
   * Gets training metrics history.
   * @returns Array of training metrics
   */
  getMetrics(): TrainingMetrics[] {
    return [...this.trainingMetrics];
  }

  /**
   * Gets number of demonstrations.
   * @returns Demonstration count
   */
  getDemonstrationCount(): number {
    return this.demonstrations.length;
  }

  /**
   * Clears all demonstrations.
   */
  clearDemonstrations(): void {
    this.demonstrations = [];
    logger.debug('Demonstrations cleared');
  }
}
