/**
 * ML-based NPC controller integrating policy networks for intelligent behavior.
 * Provides high-level interface for NPC control using learned policies.
 * @module NPCController
 */

import { Vector3 } from '../../math/Vector3';
import { Logger } from '../../core/Logger';
import { PolicyNetwork } from './PolicyNetwork';
import { ValueNetwork } from './ValueNetwork';
import { FeatureExtractor, Observation } from './FeatureExtractor';
import { ModelManager, ModelInfo } from './ModelManager';

const logger = Logger.create('NPCController');

/**
 * NPC state information.
 */
export interface NPCState {
  /** NPC position */
  position: Vector3;
  /** NPC velocity */
  velocity: Vector3;
  /** NPC forward direction */
  forward: Vector3;
  /** NPC health [0, 1] */
  health: number;
  /** NPC energy/stamina [0, 1] */
  energy: number;
  /** Current target position (if any) */
  target?: Vector3;
  /** Nearby entity positions */
  nearbyEntities?: Vector3[];
}

/**
 * NPC action result.
 */
export interface NPCAction {
  /** Movement direction (normalized) */
  movement?: Vector3;
  /** Rotation angle (radians) */
  rotation?: number;
  /** Discrete action index */
  actionIndex?: number;
  /** Jump action */
  jump?: boolean;
  /** Attack action */
  attack?: boolean;
  /** Custom action data */
  custom?: Record<string, unknown>;
}

/**
 * NPC controller configuration.
 */
export interface NPCControllerConfig {
  /** Model information for policy network */
  policyModel: ModelInfo;
  /** Optional model information for value network */
  valueModel?: ModelInfo;
  /** Feature extractor configuration */
  featureConfig?: any;
  /** Action interpretation mode */
  actionMode: 'discrete' | 'continuous';
  /** Action mapping for discrete mode */
  actionMap?: Record<number, NPCAction>;
  /** Update frequency in Hz (default: 10) */
  updateFrequency?: number;
  /** Enable value-based decision making */
  useValueNetwork?: boolean;
}

/**
 * ML-based NPC controller for intelligent agent behavior.
 * Integrates policy networks with game NPC control systems.
 */
export class NPCController {
  private policy: PolicyNetwork | null = null;
  private value: ValueNetwork | null = null;
  private readonly featureExtractor: FeatureExtractor;
  private readonly modelManager: ModelManager;
  private readonly config: Required<NPCControllerConfig>;
  private lastUpdateTime: number = 0;
  private currentAction: NPCAction = {};
  private initialized: boolean = false;
  private actionCount: number = 0;

  /**
   * Creates a new NPC controller.
   * @param modelManager - Model manager for loading networks
   * @param config - Controller configuration
   */
  constructor(modelManager: ModelManager, config: NPCControllerConfig) {
    this.modelManager = modelManager;
    this.featureExtractor = new FeatureExtractor(config.featureConfig);

    this.config = {
      policyModel: config.policyModel,
      valueModel: config.valueModel,
      featureConfig: config.featureConfig,
      actionMode: config.actionMode,
      actionMap: config.actionMap ?? this.createDefaultActionMap(),
      updateFrequency: config.updateFrequency ?? 10,
      useValueNetwork: config.useValueNetwork ?? false,
    };

    logger.info('NPCController created', {
      actionMode: this.config.actionMode,
      updateFrequency: this.config.updateFrequency,
    });
  }

  /**
   * Initializes the controller by loading models.
   * @returns Promise that resolves when initialization is complete
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      logger.warn('NPCController already initialized');
      return;
    }

    logger.info('Initializing NPC controller');

    // Load policy network
    const policySession = await this.modelManager.load(this.config.policyModel);

    this.policy = new PolicyNetwork(policySession, {
      actionSpace: {
        type: this.config.actionMode,
        size: this.config.actionMode === 'discrete'
          ? Object.keys(this.config.actionMap!).length
          : 3, // Default to 3D continuous actions
      },
      stochastic: false, // Use deterministic actions for NPCs
    });

    // Load value network if configured
    if (this.config.useValueNetwork && this.config.valueModel) {
      const valueSession = await this.modelManager.load(this.config.valueModel);
      this.value = new ValueNetwork(valueSession);
    }

    this.initialized = true;
    logger.info('NPC controller initialized successfully');
  }

  /**
   * Updates NPC behavior based on current state.
   * @param state - Current NPC state
   * @param deltaTime - Time since last update (seconds)
   * @returns NPC action to execute
   */
  async update(state: NPCState, deltaTime: number): Promise<NPCAction> {
    if (!this.initialized || !this.policy) {
      throw new Error('NPCController not initialized. Call initialize() first.');
    }

    // Check if update is needed based on frequency
    const currentTime = performance.now();
    const updateInterval = 1000 / this.config.updateFrequency;

    if (currentTime - this.lastUpdateTime < updateInterval) {
      // Return cached action
      return this.currentAction;
    }

    this.lastUpdateTime = currentTime;

    // Create observation from state
    const observation = this.createObservation(state);

    // Get action from policy
    const features = this.featureExtractor.extract(observation);
    const policyOutput = await this.policy.selectAction(features);

    // Get value estimate if available
    let stateValue: number | undefined;
    if (this.value) {
      const valueOutput = await this.value.estimate(features);
      stateValue = valueOutput.value;
    }

    // Interpret action
    this.currentAction = this.interpretAction(policyOutput.action, state);

    this.actionCount++;

    return this.currentAction;
  }

  /**
   * Creates an observation from NPC state.
   * @param state - NPC state
   * @returns Observation for feature extraction
   */
  private createObservation(state: NPCState): Observation {
    return {
      position: state.position,
      velocity: state.velocity,
      forward: state.forward,
      target: state.target,
      targetDistance: state.target
        ? Vector3.distance(state.position, state.target)
        : undefined,
      nearbyEntities: state.nearbyEntities,
      health: state.health,
      energy: state.energy,
    };
  }

  /**
   * Interprets policy output into NPC action.
   * @param action - Policy action (discrete index or continuous values)
   * @param state - Current NPC state
   * @returns Interpreted NPC action
   */
  private interpretAction(
    action: number | number[],
    state: NPCState
  ): NPCAction {
    if (this.config.actionMode === 'discrete') {
      // Discrete action: use action map
      const actionIndex = action as number;
      const mappedAction = this.config.actionMap![actionIndex];

      if (!mappedAction) {
        logger.warn(`No mapping for action index ${actionIndex}`);
        return {};
      }

      return mappedAction;
    } else {
      // Continuous action: interpret as movement vector + rotation
      const actionValues = action as number[];

      if (actionValues.length < 3) {
        logger.warn(`Insufficient action values: ${actionValues.length}`);
        return {};
      }

      // First 2 values: movement direction (x, z)
      const movement = new Vector3(
        actionValues[0],
        0,
        actionValues[1]
      ).normalize();

      // Third value: rotation
      const rotation = actionValues[2];

      // Additional discrete actions if available
      const jump = actionValues.length > 3 ? actionValues[3] > 0.5 : false;
      const attack = actionValues.length > 4 ? actionValues[4] > 0.5 : false;

      return {
        movement,
        rotation,
        jump,
        attack,
      };
    }
  }

  /**
   * Creates default action map for discrete actions.
   * Defines basic movement and combat actions.
   * @returns Default action map
   */
  private createDefaultActionMap(): Record<number, NPCAction> {
    return {
      0: { movement: Vector3.zero() }, // Idle
      1: { movement: Vector3.forward() }, // Move forward
      2: { movement: Vector3.back() }, // Move backward
      3: { movement: Vector3.left() }, // Move left
      4: { movement: Vector3.right() }, // Move right
      5: { movement: Vector3.forward(), jump: true }, // Jump forward
      6: { attack: true }, // Attack
      7: { movement: Vector3.forward(), attack: true }, // Attack while moving
    };
  }

  /**
   * Forces immediate action update (bypasses frequency throttling).
   * @param state - Current NPC state
   * @returns NPC action
   */
  async forceUpdate(state: NPCState): Promise<NPCAction> {
    this.lastUpdateTime = 0;
    return this.update(state, 0);
  }

  /**
   * Sets whether to use stochastic or deterministic action selection.
   * @param stochastic - True for stochastic, false for deterministic
   */
  setStochastic(stochastic: boolean): void {
    if (this.policy) {
      this.policy.setStochastic(stochastic);
    }
  }

  /**
   * Sets the action selection temperature for exploration.
   * @param temperature - Temperature value (higher = more random)
   */
  setTemperature(temperature: number): void {
    if (this.policy) {
      this.policy.setTemperature(temperature);
    }
  }

  /**
   * Gets the current cached action.
   * @returns Current action
   */
  getCurrentAction(): NPCAction {
    return this.currentAction;
  }

  /**
   * Gets controller statistics.
   * @returns Statistics object
   */
  getStats(): {
    initialized: boolean;
    actionCount: number;
    updateFrequency: number;
    lastUpdateTime: number;
  } {
    return {
      initialized: this.initialized,
      actionCount: this.actionCount,
      updateFrequency: this.config.updateFrequency,
      lastUpdateTime: this.lastUpdateTime,
    };
  }

  /**
   * Resets controller state.
   */
  reset(): void {
    this.currentAction = {};
    this.lastUpdateTime = 0;
    this.actionCount = 0;

    if (this.policy) {
      this.policy.resetStats();
    }

    if (this.value) {
      this.value.resetStats();
    }

    logger.debug('NPCController reset');
  }

  /**
   * Disposes of the controller and releases resources.
   */
  dispose(): void {
    this.policy = null;
    this.value = null;
    this.initialized = false;
    logger.info('NPCController disposed');
  }
}
