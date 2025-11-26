import { Logger } from '../../core/Logger';
import { InputBuffer, Input } from './InputBuffer';

/**
 * Entity state snapshot for client prediction
 */
export interface EntityState {
  /** Entity position */
  position: { x: number; y: number; z: number };
  /** Entity velocity */
  velocity: { x: number; y: number; z: number };
  /** Entity rotation (euler angles in radians) */
  rotation: { x: number; y: number; z: number };
  /** Last processed input sequence */
  lastProcessedInput: number;
  /** State timestamp */
  timestamp: number;
  /** Additional custom state data */
  custom?: Record<string, any>;
}

/**
 * Configuration for client prediction
 */
export interface ClientPredictionConfig {
  /** Enable smooth error correction */
  smoothCorrection?: boolean;
  /** Error correction blend factor (0-1) */
  correctionSpeed?: number;
  /** Minimum error distance to trigger correction (units) */
  minCorrectionThreshold?: number;
  /** Maximum error distance for smooth correction (units) */
  maxSmoothCorrectionDistance?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Maximum number of state snapshots to keep */
  maxStateHistory?: number;
}

/**
 * Client-side prediction engine for smooth, responsive gameplay.
 * Applies inputs immediately and corrects against server state.
 *
 * @example
 * ```typescript
 * const prediction = new ClientPrediction();
 *
 * // Add input and apply immediately
 * const sequence = prediction.addInput({ forward: true });
 * prediction.applyInput(currentState, { forward: true }, deltaTime);
 *
 * // When server state arrives
 * prediction.reconcileWithServer(serverState);
 * ```
 */
export class ClientPrediction {
  private readonly inputBuffer: InputBuffer;
  private readonly stateHistory: EntityState[] = [];
  private currentState: EntityState | null = null;
  private readonly smoothCorrection: boolean;
  private readonly correctionSpeed: number;
  private readonly minCorrectionThreshold: number;
  private readonly maxSmoothCorrectionDistance: number;
  private readonly debug: boolean;
  private readonly maxStateHistory: number;
  private readonly logger: Logger;
  private correctionOffset: { x: number; y: number; z: number } | null = null;

  constructor(config: ClientPredictionConfig = {}) {
    this.inputBuffer = new InputBuffer({ maxSize: 120, debug: config.debug });
    this.smoothCorrection = config.smoothCorrection ?? true;
    this.correctionSpeed = config.correctionSpeed ?? 0.15;
    this.minCorrectionThreshold = config.minCorrectionThreshold ?? 0.01;
    this.maxSmoothCorrectionDistance = config.maxSmoothCorrectionDistance ?? 5.0;
    this.debug = config.debug ?? false;
    this.maxStateHistory = config.maxStateHistory ?? 60;
    this.logger = new Logger('ClientPrediction');
  }

  /**
   * Add a new input and return its sequence number
   *
   * @param inputData - Input data to buffer
   * @returns Sequence number for this input
   */
  public addInput(inputData: Record<string, any>): number {
    return this.inputBuffer.addInput(inputData);
  }

  /**
   * Apply an input to a state (prediction step)
   * Override this in game-specific implementation
   *
   * @param state - Current entity state
   * @param input - Input to apply
   * @param deltaTime - Time step in seconds
   * @returns Updated state after applying input
   */
  public applyInput(
    state: EntityState,
    input: Record<string, any>,
    deltaTime: number
  ): EntityState {
    const newState = this.cloneState(state);

    // Example physics - override this for your game
    const moveSpeed = 5.0;
    const rotateSpeed = 2.0;

    if (input.forward) {
      newState.velocity.z = -moveSpeed;
    } else if (input.backward) {
      newState.velocity.z = moveSpeed;
    } else {
      newState.velocity.z *= 0.9;
    }

    if (input.left) {
      newState.velocity.x = -moveSpeed;
    } else if (input.right) {
      newState.velocity.x = moveSpeed;
    } else {
      newState.velocity.x *= 0.9;
    }

    if (input.rotateLeft) {
      newState.rotation.y += rotateSpeed * deltaTime;
    }
    if (input.rotateRight) {
      newState.rotation.y -= rotateSpeed * deltaTime;
    }

    // Apply velocity
    newState.position.x += newState.velocity.x * deltaTime;
    newState.position.y += newState.velocity.y * deltaTime;
    newState.position.z += newState.velocity.z * deltaTime;

    return newState;
  }

  /**
   * Process a frame with current input
   *
   * @param currentInput - Current frame's input
   * @param deltaTime - Time step in seconds
   * @returns Updated state after prediction
   */
  public predict(currentInput: Record<string, any>, deltaTime: number): EntityState {
    if (!this.currentState) {
      this.currentState = this.createDefaultState();
    }

    // Apply input
    this.currentState = this.applyInput(this.currentState, currentInput, deltaTime);
    this.currentState.timestamp = performance.now();

    // Apply smooth error correction if active
    if (this.correctionOffset && this.smoothCorrection) {
      this.currentState.position.x += this.correctionOffset.x;
      this.currentState.position.y += this.correctionOffset.y;
      this.currentState.position.z += this.correctionOffset.z;

      // Blend correction toward zero
      this.correctionOffset.x *= (1 - this.correctionSpeed);
      this.correctionOffset.y *= (1 - this.correctionSpeed);
      this.correctionOffset.z *= (1 - this.correctionSpeed);

      // Stop correction when very small
      const magnitude = Math.sqrt(
        this.correctionOffset.x ** 2 +
        this.correctionOffset.y ** 2 +
        this.correctionOffset.z ** 2
      );
      if (magnitude < this.minCorrectionThreshold) {
        this.correctionOffset = null;
        if (this.debug) {
          this.logger.debug('Correction complete');
        }
      }
    }

    // Save state snapshot
    this.saveStateSnapshot(this.currentState);

    return this.cloneState(this.currentState);
  }

  /**
   * Reconcile client state with authoritative server state
   *
   * @param serverState - Authoritative state from server
   */
  public reconcileWithServer(serverState: EntityState): void {
    if (!this.currentState) {
      this.currentState = this.cloneState(serverState);
      return;
    }

    const lastProcessedInput = serverState.lastProcessedInput;

    // Calculate prediction error
    const error = {
      x: serverState.position.x - this.currentState.position.x,
      y: serverState.position.y - this.currentState.position.y,
      z: serverState.position.z - this.currentState.position.z
    };

    const errorMagnitude = Math.sqrt(error.x ** 2 + error.y ** 2 + error.z ** 2);

    if (this.debug) {
      this.logger.debug(
        `Reconciliation: error=${errorMagnitude.toFixed(3)}, lastProcessed=${lastProcessedInput}`
      );
    }

    // Small error - use smooth correction
    if (errorMagnitude < this.maxSmoothCorrectionDistance && this.smoothCorrection) {
      this.correctionOffset = error;
    } else if (errorMagnitude >= this.maxSmoothCorrectionDistance) {
      // Large error - snap to server state
      if (this.debug) {
        this.logger.warn(`Large error detected (${errorMagnitude.toFixed(2)}), snapping to server state`);
      }
      this.currentState.position = { ...serverState.position };
      this.currentState.velocity = { ...serverState.velocity };
      this.currentState.rotation = { ...serverState.rotation };
      this.correctionOffset = null;
    }

    // Remove acknowledged inputs
    this.inputBuffer.removeUntil(lastProcessedInput);

    // Replay unacknowledged inputs
    const pendingInputs = this.inputBuffer.getInputsSince(lastProcessedInput);
    if (pendingInputs.length > 0) {
      if (this.debug) {
        this.logger.debug(`Replaying ${pendingInputs.length} pending inputs`);
      }

      let replayState = this.cloneState(serverState);
      const deltaTime = 1 / 60; // Assume 60 FPS for replay

      for (const input of pendingInputs) {
        replayState = this.applyInput(replayState, input.data, deltaTime);
      }

      // Update current state with replayed state
      this.currentState.position = { ...replayState.position };
      this.currentState.velocity = { ...replayState.velocity };
      this.currentState.rotation = { ...replayState.rotation };
    }

    this.currentState.lastProcessedInput = lastProcessedInput;
  }

  /**
   * Get the current predicted state
   *
   * @returns Current entity state
   */
  public getCurrentState(): EntityState | null {
    return this.currentState ? this.cloneState(this.currentState) : null;
  }

  /**
   * Set the current state (used for initialization)
   *
   * @param state - State to set
   */
  public setState(state: EntityState): void {
    this.currentState = this.cloneState(state);
  }

  /**
   * Get the input buffer for advanced usage
   *
   * @returns The input buffer instance
   */
  public getInputBuffer(): InputBuffer {
    return this.inputBuffer;
  }

  /**
   * Reset the prediction system
   */
  public reset(): void {
    this.inputBuffer.reset();
    this.stateHistory.length = 0;
    this.currentState = null;
    this.correctionOffset = null;
    if (this.debug) {
      this.logger.debug('Prediction system reset');
    }
  }

  /**
   * Save a state snapshot for history
   */
  private saveStateSnapshot(state: EntityState): void {
    this.stateHistory.push(this.cloneState(state));
    if (this.stateHistory.length > this.maxStateHistory) {
      this.stateHistory.shift();
    }
  }

  /**
   * Create a default initial state
   */
  private createDefaultState(): EntityState {
    return {
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      lastProcessedInput: -1,
      timestamp: performance.now()
    };
  }

  /**
   * Clone a state object
   */
  private cloneState(state: EntityState): EntityState {
    return {
      position: { ...state.position },
      velocity: { ...state.velocity },
      rotation: { ...state.rotation },
      lastProcessedInput: state.lastProcessedInput,
      timestamp: state.timestamp,
      custom: state.custom ? { ...state.custom } : undefined
    };
  }

  /**
   * Get prediction statistics
   */
  public getStats(): {
    pendingInputs: number;
    stateHistorySize: number;
    hasCorrection: boolean;
    correctionMagnitude: number | null;
  } {
    let correctionMagnitude: number | null = null;
    if (this.correctionOffset) {
      correctionMagnitude = Math.sqrt(
        this.correctionOffset.x ** 2 +
        this.correctionOffset.y ** 2 +
        this.correctionOffset.z ** 2
      );
    }

    return {
      pendingInputs: this.inputBuffer.getSize(),
      stateHistorySize: this.stateHistory.length,
      hasCorrection: this.correctionOffset !== null,
      correctionMagnitude
    };
  }
}
