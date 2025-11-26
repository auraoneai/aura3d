import { Logger } from '../../core/Logger';
import { EntityState } from './ClientPrediction';
import { Input } from './InputBuffer';

/**
 * Server-side entity state with input tracking
 */
export interface ServerEntityState extends EntityState {
  /** Client ID owning this entity */
  clientId: string;
  /** Last input sequence processed for this entity */
  lastProcessedInput: number;
}

/**
 * Snapshot of world state at a specific time
 */
export interface WorldSnapshot {
  /** Timestamp of this snapshot */
  timestamp: number;
  /** All entity states at this time */
  entities: Map<string, ServerEntityState>;
}

/**
 * Configuration for server reconciliation
 */
export interface ServerReconciliationConfig {
  /** Number of world snapshots to keep for rollback */
  snapshotHistorySize?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Tick rate in Hz */
  tickRate?: number;
}

/**
 * Result of processing client input
 */
export interface InputProcessingResult {
  /** Updated entity state */
  state: ServerEntityState;
  /** Whether input was valid */
  valid: boolean;
  /** Validation error message if invalid */
  error?: string;
}

/**
 * Server-side reconciliation with rollback and replay support.
 * Maintains authoritative game state and processes client inputs.
 *
 * @example
 * ```typescript
 * const reconciliation = new ServerReconciliation({ tickRate: 60 });
 *
 * // Process client input
 * const result = reconciliation.processInput('player1', input, deltaTime);
 *
 * // Get state to send back to client
 * const state = reconciliation.getEntityState('player1');
 * ```
 */
export class ServerReconciliation {
  private readonly entities: Map<string, ServerEntityState> = new Map();
  private readonly snapshotHistory: WorldSnapshot[] = [];
  private readonly snapshotHistorySize: number;
  private readonly debug: boolean;
  private readonly tickRate: number;
  private readonly deltaTime: number;
  private readonly logger: Logger;
  private currentTick: number = 0;

  constructor(config: ServerReconciliationConfig = {}) {
    this.snapshotHistorySize = config.snapshotHistorySize ?? 120; // 2 seconds at 60 ticks
    this.debug = config.debug ?? false;
    this.tickRate = config.tickRate ?? 60;
    this.deltaTime = 1 / this.tickRate;
    this.logger = new Logger('ServerReconciliation');
  }

  /**
   * Register a new entity
   *
   * @param entityId - Unique entity identifier
   * @param clientId - Client that owns this entity
   * @param initialState - Initial entity state
   */
  public registerEntity(
    entityId: string,
    clientId: string,
    initialState?: Partial<EntityState>
  ): void {
    const state: ServerEntityState = {
      clientId,
      position: initialState?.position ?? { x: 0, y: 0, z: 0 },
      velocity: initialState?.velocity ?? { x: 0, y: 0, z: 0 },
      rotation: initialState?.rotation ?? { x: 0, y: 0, z: 0 },
      lastProcessedInput: -1,
      timestamp: performance.now(),
      custom: initialState?.custom
    };

    this.entities.set(entityId, state);

    if (this.debug) {
      this.logger.debug(`Registered entity ${entityId} for client ${clientId}`);
    }
  }

  /**
   * Unregister an entity
   *
   * @param entityId - Entity to remove
   * @returns True if entity was removed
   */
  public unregisterEntity(entityId: string): boolean {
    const removed = this.entities.delete(entityId);
    if (removed && this.debug) {
      this.logger.debug(`Unregistered entity ${entityId}`);
    }
    return removed;
  }

  /**
   * Process a client input for an entity
   *
   * @param entityId - Entity to update
   * @param input - Client input to process
   * @param customDeltaTime - Optional custom delta time (uses tick rate if not provided)
   * @returns Processing result with updated state
   */
  public processInput(
    entityId: string,
    input: Input,
    customDeltaTime?: number
  ): InputProcessingResult {
    const entity = this.entities.get(entityId);
    if (!entity) {
      return {
        state: this.createDefaultState(entityId, 'unknown'),
        valid: false,
        error: 'Entity not found'
      };
    }

    // Validate input sequence
    if (input.sequence <= entity.lastProcessedInput) {
      if (this.debug) {
        this.logger.warn(
          `Duplicate/old input for ${entityId}: ${input.sequence} <= ${entity.lastProcessedInput}`
        );
      }
      return {
        state: entity,
        valid: false,
        error: 'Input already processed'
      };
    }

    // Validate input timing (basic anti-cheat)
    const timeSinceLastInput = input.timestamp - entity.timestamp;
    const expectedMinTime = (1000 / this.tickRate) * 0.5; // Allow some tolerance
    if (timeSinceLastInput < expectedMinTime && entity.lastProcessedInput >= 0) {
      if (this.debug) {
        this.logger.warn(
          `Input too fast for ${entityId}: ${timeSinceLastInput.toFixed(2)}ms`
        );
      }
      // Still process but flag for potential cheating
    }

    // Apply input to entity
    const deltaTime = customDeltaTime ?? this.deltaTime;
    const newState = this.applyInput(entity, input.data, deltaTime);
    newState.lastProcessedInput = input.sequence;
    newState.timestamp = input.timestamp;

    // Validate resulting state (anti-cheat)
    const validation = this.validateState(entity, newState, deltaTime);
    if (!validation.valid) {
      if (this.debug) {
        this.logger.warn(`Invalid state for ${entityId}: ${validation.error}`);
      }
      // Reject the update
      return {
        state: entity,
        valid: false,
        error: validation.error
      };
    }

    // Update entity
    this.entities.set(entityId, newState);

    if (this.debug) {
      this.logger.debug(
        `Processed input ${input.sequence} for ${entityId}`,
        newState.position
      );
    }

    return {
      state: newState,
      valid: true
    };
  }

  /**
   * Apply input to entity state (override for game-specific logic)
   *
   * @param state - Current entity state
   * @param input - Input data to apply
   * @param deltaTime - Time step in seconds
   * @returns Updated entity state
   */
  public applyInput(
    state: ServerEntityState,
    input: Record<string, any>,
    deltaTime: number
  ): ServerEntityState {
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
   * Validate state changes for anti-cheat
   *
   * @param oldState - Previous state
   * @param newState - New state to validate
   * @param deltaTime - Time step used
   * @returns Validation result
   */
  private validateState(
    oldState: ServerEntityState,
    newState: ServerEntityState,
    deltaTime: number
  ): { valid: boolean; error?: string } {
    // Check position change is physically possible
    const maxSpeed = 10.0; // Max units per second
    const maxDistance = maxSpeed * deltaTime * 1.5; // 50% tolerance

    const dx = newState.position.x - oldState.position.x;
    const dy = newState.position.y - oldState.position.y;
    const dz = newState.position.z - oldState.position.z;
    const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

    if (distance > maxDistance) {
      return {
        valid: false,
        error: `Movement too fast: ${distance.toFixed(2)} > ${maxDistance.toFixed(2)}`
      };
    }

    // Check velocity is within bounds
    const maxVelocity = 15.0;
    const velocityMagnitude = Math.sqrt(
      newState.velocity.x ** 2 +
      newState.velocity.y ** 2 +
      newState.velocity.z ** 2
    );

    if (velocityMagnitude > maxVelocity) {
      return {
        valid: false,
        error: `Velocity too high: ${velocityMagnitude.toFixed(2)} > ${maxVelocity}`
      };
    }

    return { valid: true };
  }

  /**
   * Take a snapshot of current world state
   * Used for rollback if needed
   */
  public takeSnapshot(): void {
    const snapshot: WorldSnapshot = {
      timestamp: performance.now(),
      entities: new Map()
    };

    for (const [entityId, state] of this.entities) {
      snapshot.entities.set(entityId, this.cloneState(state));
    }

    this.snapshotHistory.push(snapshot);

    // Prune old snapshots
    if (this.snapshotHistory.length > this.snapshotHistorySize) {
      this.snapshotHistory.shift();
    }

    if (this.debug) {
      this.logger.debug(`Snapshot taken, history size: ${this.snapshotHistory.length}`);
    }
  }

  /**
   * Rollback to a specific timestamp
   *
   * @param timestamp - Timestamp to roll back to
   * @returns True if rollback succeeded
   */
  public rollback(timestamp: number): boolean {
    // Find closest snapshot
    let closestSnapshot: WorldSnapshot | null = null;
    let closestDiff = Infinity;

    for (const snapshot of this.snapshotHistory) {
      const diff = Math.abs(snapshot.timestamp - timestamp);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestSnapshot = snapshot;
      }
    }

    if (!closestSnapshot) {
      if (this.debug) {
        this.logger.warn('No snapshot found for rollback');
      }
      return false;
    }

    // Restore state
    this.entities.clear();
    for (const [entityId, state] of closestSnapshot.entities) {
      this.entities.set(entityId, this.cloneState(state));
    }

    if (this.debug) {
      this.logger.debug(`Rolled back to ${closestSnapshot.timestamp}`);
    }

    return true;
  }

  /**
   * Get entity state
   *
   * @param entityId - Entity ID
   * @returns Entity state or undefined
   */
  public getEntityState(entityId: string): ServerEntityState | undefined {
    const state = this.entities.get(entityId);
    return state ? this.cloneState(state) : undefined;
  }

  /**
   * Get all entity states
   *
   * @returns Map of all entity states
   */
  public getAllStates(): Map<string, ServerEntityState> {
    const states = new Map<string, ServerEntityState>();
    for (const [entityId, state] of this.entities) {
      states.set(entityId, this.cloneState(state));
    }
    return states;
  }

  /**
   * Tick the simulation forward (for server-side simulation)
   *
   * @param deltaTime - Optional delta time (uses tick rate if not provided)
   */
  public tick(deltaTime?: number): void {
    const dt = deltaTime ?? this.deltaTime;
    this.currentTick++;

    // Apply physics/simulation to all entities
    for (const [entityId, state] of this.entities) {
      // Apply gravity, friction, etc.
      state.velocity.y -= 9.81 * dt; // Gravity

      // Update positions
      state.position.x += state.velocity.x * dt;
      state.position.y += state.velocity.y * dt;
      state.position.z += state.velocity.z * dt;

      state.timestamp = performance.now();
    }

    // Take periodic snapshots
    if (this.currentTick % 10 === 0) {
      this.takeSnapshot();
    }
  }

  /**
   * Clear all entities and snapshots
   */
  public reset(): void {
    this.entities.clear();
    this.snapshotHistory.length = 0;
    this.currentTick = 0;
    if (this.debug) {
      this.logger.debug('Server reconciliation reset');
    }
  }

  /**
   * Clone entity state
   */
  private cloneState(state: ServerEntityState): ServerEntityState {
    return {
      clientId: state.clientId,
      position: { ...state.position },
      velocity: { ...state.velocity },
      rotation: { ...state.rotation },
      lastProcessedInput: state.lastProcessedInput,
      timestamp: state.timestamp,
      custom: state.custom ? { ...state.custom } : undefined
    };
  }

  /**
   * Create default entity state
   */
  private createDefaultState(entityId: string, clientId: string): ServerEntityState {
    return {
      clientId,
      position: { x: 0, y: 0, z: 0 },
      velocity: { x: 0, y: 0, z: 0 },
      rotation: { x: 0, y: 0, z: 0 },
      lastProcessedInput: -1,
      timestamp: performance.now()
    };
  }

  /**
   * Get reconciliation statistics
   */
  public getStats(): {
    entityCount: number;
    snapshotCount: number;
    currentTick: number;
    tickRate: number;
  } {
    return {
      entityCount: this.entities.size,
      snapshotCount: this.snapshotHistory.length,
      currentTick: this.currentTick,
      tickRate: this.tickRate
    };
  }
}
