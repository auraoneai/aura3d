/**
 * @fileoverview Entity state replication manager.
 * Handles network ID assignment, authority management, and state synchronization.
 * @module net/replication/ReplicationManager
 */

import { Logger } from '../../core/Logger';
import { Entity } from '../../ecs/Entity';
import {
  NetworkId,
  PlayerId,
  NetworkAuthority,
  ReplicationMode,
  NetworkEntityRegistry,
} from '../NetworkEntity';
import { StateSnapshot } from './StateSnapshot';
import { DeltaCompressor } from './DeltaCompression';
import { InterestManager as AOIManager } from './InterestManagement';
import { NetworkMessage, MessageRegistry, MessagePriority } from '../NetworkMessage';

const logger = Logger.create('ReplicationManager');

/**
 * Replication configuration.
 */
export interface ReplicationConfig {
  /** Replication tick rate in Hz */
  tickRate?: number;
  /** Enable delta compression */
  enableDeltaCompression?: boolean;
  /** Enable interest management (AOI) */
  enableInterestManagement?: boolean;
  /** Maximum network entities */
  maxEntities?: number;
  /** Snapshot buffer size per entity */
  snapshotBufferSize?: number;
}

/**
 * Replication statistics.
 */
export interface ReplicationStats {
  /** Number of entities being replicated */
  replicatedEntities: number;
  /** Snapshots sent this second */
  snapshotsSent: number;
  /** Snapshots received this second */
  snapshotsReceived: number;
  /** Average snapshot size in bytes */
  averageSnapshotSize: number;
  /** Bandwidth used (bytes/sec) */
  bandwidthUsed: number;
  /** Compression ratio (0-1, lower is better) */
  compressionRatio: number;
}

/**
 * Entity replication callback.
 */
export type EntityReplicationCallback = (
  entity: Entity,
  snapshot: StateSnapshot
) => void;

/**
 * Replication manager for network entities.
 * Manages entity state replication, network ID assignment, and authority control.
 *
 * Performance target: 1000 entities @ 60 FPS, 64 players
 *
 * @example
 * ```typescript
 * const replicationManager = new ReplicationManager({
 *   tickRate: 20,
 *   enableDeltaCompression: true,
 *   enableInterestManagement: true,
 *   maxEntities: 10000,
 * });
 *
 * // Register entity for replication
 * const networkId = replicationManager.registerEntity(
 *   entity,
 *   playerId,
 *   NetworkAuthority.CLIENT,
 *   ReplicationMode.ALL_CLIENTS
 * );
 *
 * // Update every frame
 * replicationManager.update(deltaTime);
 *
 * // Capture and send snapshot
 * const snapshot = replicationManager.captureSnapshot(entity);
 * replicationManager.sendSnapshot(networkId, snapshot);
 * ```
 */
export class ReplicationManager {
  private config: Required<ReplicationConfig>;
  private registry: NetworkEntityRegistry;
  private deltaCompressor: DeltaCompressor;
  private aoiManager: AOIManager;

  /** Snapshot buffers per entity */
  private snapshotBuffers = new Map<NetworkId, StateSnapshot[]>();

  /** Last snapshot sent per entity */
  private lastSnapshots = new Map<NetworkId, StateSnapshot>();

  /** Entity state capture callbacks */
  private stateCaptureCallbacks = new Map<NetworkId, () => Map<string, any>>();

  /** Entity state apply callbacks */
  private stateApplyCallbacks = new Map<NetworkId, (state: Map<string, any>) => void>();

  /** Message types */
  private readonly MSG_SNAPSHOT: number;
  private readonly MSG_DELTA_SNAPSHOT: number;
  private readonly MSG_ENTITY_SPAWN: number;
  private readonly MSG_ENTITY_DESPAWN: number;
  private readonly MSG_AUTHORITY_TRANSFER: number;

  /** Replication tick accumulator */
  private tickAccumulator: number = 0;
  private readonly tickInterval: number;

  /** Statistics */
  private stats: ReplicationStats = {
    replicatedEntities: 0,
    snapshotsSent: 0,
    snapshotsReceived: 0,
    averageSnapshotSize: 0,
    bandwidthUsed: 0,
    compressionRatio: 1.0,
  };

  /** Statistics tracking */
  private snapshotSizesSent: number[] = [];
  private bytesSentThisSecond: number = 0;
  private statsResetTimer: number = 0;

  /**
   * Creates a new ReplicationManager.
   *
   * @param config - Replication configuration
   *
   * @example
   * ```typescript
   * const manager = new ReplicationManager({
   *   tickRate: 20,
   *   enableDeltaCompression: true,
   *   enableInterestManagement: true,
   * });
   * ```
   */
  constructor(config: ReplicationConfig = {}) {
    this.config = {
      tickRate: config.tickRate ?? 20,
      enableDeltaCompression: config.enableDeltaCompression ?? true,
      enableInterestManagement: config.enableInterestManagement ?? true,
      maxEntities: config.maxEntities ?? 10000,
      snapshotBufferSize: config.snapshotBufferSize ?? 30,
    };

    this.tickInterval = 1.0 / this.config.tickRate;

    this.registry = new NetworkEntityRegistry();
    this.deltaCompressor = new DeltaCompressor();
    this.aoiManager = new AOIManager(this.registry);

    // Register message types
    this.MSG_SNAPSHOT = MessageRegistry.register('replication_snapshot');
    this.MSG_DELTA_SNAPSHOT = MessageRegistry.register('replication_delta_snapshot');
    this.MSG_ENTITY_SPAWN = MessageRegistry.register('replication_entity_spawn');
    this.MSG_ENTITY_DESPAWN = MessageRegistry.register('replication_entity_despawn');
    this.MSG_AUTHORITY_TRANSFER = MessageRegistry.register('replication_authority_transfer');

    logger.info('ReplicationManager initialized', {
      tickRate: this.config.tickRate,
      deltaCompression: this.config.enableDeltaCompression,
      interestManagement: this.config.enableInterestManagement,
    });
  }

  /**
   * Registers an entity for replication.
   *
   * @param entity - Entity to register
   * @param ownerId - Owner player ID
   * @param authority - Network authority
   * @param replicationMode - Replication mode
   * @param interestDistance - Interest distance for AOI (0 = always relevant)
   * @returns Assigned network ID
   *
   * @example
   * ```typescript
   * const networkId = manager.registerEntity(
   *   playerEntity,
   *   playerId,
   *   NetworkAuthority.CLIENT,
   *   ReplicationMode.ALL_CLIENTS,
   *   100 // 100 units interest distance
   * );
   * ```
   */
  registerEntity(
    entity: Entity,
    ownerId: PlayerId = 0,
    authority: NetworkAuthority = NetworkAuthority.SERVER,
    replicationMode: ReplicationMode = ReplicationMode.ALL_CLIENTS,
    interestDistance: number = 0
  ): NetworkId {
    if (this.registry.size >= this.config.maxEntities) {
      throw new Error(`Maximum entities reached: ${this.config.maxEntities}`);
    }

    const networkId = this.registry.register(
      entity,
      ownerId,
      authority,
      replicationMode,
      interestDistance
    );

    // Initialize snapshot buffer
    this.snapshotBuffers.set(networkId, []);

    this.stats.replicatedEntities = this.registry.size;

    logger.debug(`Registered entity ${entity} with network ID ${networkId}`);

    return networkId;
  }

  /**
   * Unregisters an entity from replication.
   *
   * @param entity - Entity to unregister
   * @returns True if unregistered, false if not found
   *
   * @example
   * ```typescript
   * manager.unregisterEntity(entity);
   * ```
   */
  unregisterEntity(entity: Entity): boolean {
    const networkId = this.registry.getNetworkId(entity);
    if (!networkId) {
      return false;
    }

    this.registry.unregister(entity);
    this.snapshotBuffers.delete(networkId);
    this.lastSnapshots.delete(networkId);
    this.stateCaptureCallbacks.delete(networkId);
    this.stateApplyCallbacks.delete(networkId);

    this.stats.replicatedEntities = this.registry.size;

    logger.debug(`Unregistered entity ${entity} (network ID ${networkId})`);

    return true;
  }

  /**
   * Sets the state capture callback for an entity.
   *
   * @param networkId - Network ID
   * @param callback - Callback that returns entity state
   *
   * @example
   * ```typescript
   * manager.setStateCaptureCallback(networkId, () => {
   *   const state = new Map<string, any>();
   *   state.set('x', transform.position.x);
   *   state.set('y', transform.position.y);
   *   state.set('z', transform.position.z);
   *   state.set('health', health.current);
   *   return state;
   * });
   * ```
   */
  setStateCaptureCallback(networkId: NetworkId, callback: () => Map<string, any>): void {
    this.stateCaptureCallbacks.set(networkId, callback);
  }

  /**
   * Sets the state apply callback for an entity.
   *
   * @param networkId - Network ID
   * @param callback - Callback that applies entity state
   *
   * @example
   * ```typescript
   * manager.setStateApplyCallback(networkId, (state) => {
   *   transform.position.x = state.get('x');
   *   transform.position.y = state.get('y');
   *   transform.position.z = state.get('z');
   *   health.current = state.get('health');
   * });
   * ```
   */
  setStateApplyCallback(networkId: NetworkId, callback: (state: Map<string, any>) => void): void {
    this.stateApplyCallbacks.set(networkId, callback);
  }

  /**
   * Captures a snapshot of entity state.
   *
   * @param networkId - Network ID
   * @returns State snapshot
   *
   * @example
   * ```typescript
   * const snapshot = manager.captureSnapshot(networkId);
   * ```
   */
  captureSnapshot(networkId: NetworkId): StateSnapshot | null {
    const callback = this.stateCaptureCallbacks.get(networkId);
    if (!callback) {
      logger.warn(`No state capture callback for network ID ${networkId}`);
      return null;
    }

    const state = callback();
    const snapshot: StateSnapshot = {
      timestamp: Date.now(),
      networkId,
      state,
    };

    return snapshot;
  }

  /**
   * Applies a snapshot to an entity.
   *
   * @param networkId - Network ID
   * @param snapshot - State snapshot
   *
   * @example
   * ```typescript
   * manager.applySnapshot(networkId, receivedSnapshot);
   * ```
   */
  applySnapshot(networkId: NetworkId, snapshot: StateSnapshot): void {
    const callback = this.stateApplyCallbacks.get(networkId);
    if (!callback) {
      logger.warn(`No state apply callback for network ID ${networkId}`);
      return;
    }

    callback(snapshot.state);

    // Add to buffer
    this.addSnapshotToBuffer(networkId, snapshot);
  }

  /**
   * Adds a snapshot to the entity's buffer.
   */
  private addSnapshotToBuffer(networkId: NetworkId, snapshot: StateSnapshot): void {
    let buffer = this.snapshotBuffers.get(networkId);
    if (!buffer) {
      buffer = [];
      this.snapshotBuffers.set(networkId, buffer);
    }

    // Add snapshot
    buffer.push(snapshot);

    // Sort by timestamp
    buffer.sort((a, b) => a.timestamp - b.timestamp);

    // Trim buffer
    if (buffer.length > this.config.snapshotBufferSize) {
      buffer.splice(0, buffer.length - this.config.snapshotBufferSize);
    }
  }

  /**
   * Gets a snapshot from buffer at a specific time.
   *
   * @param networkId - Network ID
   * @param timestamp - Timestamp
   * @returns Snapshot or null
   */
  getSnapshotAtTime(networkId: NetworkId, timestamp: number): StateSnapshot | null {
    const buffer = this.snapshotBuffers.get(networkId);
    if (!buffer || buffer.length === 0) {
      return null;
    }

    // Find snapshot at or before timestamp
    for (let i = buffer.length - 1; i >= 0; i--) {
      if (buffer[i].timestamp <= timestamp) {
        return buffer[i];
      }
    }

    return buffer[0];
  }

  /**
   * Gets the latest snapshot for an entity.
   *
   * @param networkId - Network ID
   * @returns Latest snapshot or null
   */
  getLatestSnapshot(networkId: NetworkId): StateSnapshot | null {
    const buffer = this.snapshotBuffers.get(networkId);
    if (!buffer || buffer.length === 0) {
      return null;
    }
    return buffer[buffer.length - 1];
  }

  /**
   * Creates a delta snapshot between two snapshots.
   *
   * @param networkId - Network ID
   * @param currentSnapshot - Current snapshot
   * @returns Serialized delta or full snapshot
   */
  createDeltaSnapshot(networkId: NetworkId, currentSnapshot: StateSnapshot): ArrayBuffer {
    const baseSnapshot = this.lastSnapshots.get(networkId);

    if (!baseSnapshot || !this.config.enableDeltaCompression) {
      // Send full snapshot
      this.lastSnapshots.set(networkId, currentSnapshot);
      return this.serializeFullSnapshot(currentSnapshot);
    }

    // Create delta
    const delta = this.deltaCompressor.createDelta(baseSnapshot, currentSnapshot);

    // Update last snapshot
    this.lastSnapshots.set(networkId, currentSnapshot);

    // Serialize delta
    const buffer = this.deltaCompressor.serializeDelta(delta);

    // Track compression ratio
    const fullSize = this.estimateSnapshotSize(currentSnapshot);
    const deltaSize = buffer.byteLength;
    const ratio = deltaSize / Math.max(fullSize, 1);

    this.stats.compressionRatio = this.stats.compressionRatio * 0.9 + ratio * 0.1;

    return buffer;
  }

  /**
   * Serializes a full snapshot.
   */
  private serializeFullSnapshot(snapshot: StateSnapshot): ArrayBuffer {
    // Estimate size
    const estimatedSize = this.estimateSnapshotSize(snapshot);
    const buffer = new ArrayBuffer(estimatedSize);
    const view = new DataView(buffer);

    let offset = 0;

    // Write network ID (4 bytes)
    view.setUint32(offset, snapshot.networkId, true);
    offset += 4;

    // Write timestamp (8 bytes)
    view.setFloat64(offset, snapshot.timestamp, true);
    offset += 8;

    // Write state count (2 bytes)
    view.setUint16(offset, snapshot.state.size, true);
    offset += 2;

    // Write state entries
    const encoder = new TextEncoder();
    for (const [key, value] of snapshot.state) {
      // Write key
      const keyBytes = encoder.encode(key);
      view.setUint8(offset, keyBytes.length);
      offset += 1;
      new Uint8Array(buffer, offset).set(keyBytes);
      offset += keyBytes.length;

      // Write value type and data
      offset += this.serializeValue(value, view, offset);
    }

    return buffer.slice(0, offset);
  }

  /**
   * Serializes a value with type information.
   */
  private serializeValue(value: any, view: DataView, offset: number): number {
    const startOffset = offset;

    if (typeof value === 'number') {
      view.setUint8(offset, 0); // Type: number
      offset += 1;
      view.setFloat64(offset, value, true);
      offset += 8;
    } else if (typeof value === 'boolean') {
      view.setUint8(offset, 1); // Type: boolean
      offset += 1;
      view.setUint8(offset, value ? 1 : 0);
      offset += 1;
    } else if (typeof value === 'string') {
      view.setUint8(offset, 2); // Type: string
      offset += 1;
      const encoder = new TextEncoder();
      const bytes = encoder.encode(value);
      view.setUint16(offset, bytes.length, true);
      offset += 2;
      new Uint8Array(view.buffer, offset).set(bytes);
      offset += bytes.length;
    } else {
      // Unknown type - skip
      view.setUint8(offset, 255);
      offset += 1;
    }

    return offset - startOffset;
  }

  /**
   * Estimates the serialized size of a snapshot.
   */
  private estimateSnapshotSize(snapshot: StateSnapshot): number {
    let size = 4 + 8 + 2; // networkId + timestamp + state count

    for (const [key, value] of snapshot.state) {
      size += 1 + key.length; // key length + key

      if (typeof value === 'number') {
        size += 1 + 8;
      } else if (typeof value === 'boolean') {
        size += 1 + 1;
      } else if (typeof value === 'string') {
        size += 1 + 2 + value.length;
      } else {
        size += 1;
      }
    }

    return size;
  }

  /**
   * Transfers authority of an entity.
   *
   * @param networkId - Network ID
   * @param newAuthority - New authority
   * @param newOwnerId - New owner ID (optional)
   *
   * @example
   * ```typescript
   * // Transfer authority to client
   * manager.transferAuthority(networkId, NetworkAuthority.CLIENT, clientId);
   * ```
   */
  transferAuthority(
    networkId: NetworkId,
    newAuthority: NetworkAuthority,
    newOwnerId?: PlayerId
  ): void {
    const metadata = this.registry.getMetadata(networkId);
    if (!metadata) {
      logger.warn(`Cannot transfer authority - network ID ${networkId} not found`);
      return;
    }

    const updates: any = { authority: newAuthority };
    if (newOwnerId !== undefined) {
      updates.ownerId = newOwnerId;
    }

    this.registry.updateMetadata(networkId, updates);

    logger.info(`Authority transferred for network ID ${networkId}`, {
      oldAuthority: metadata.authority,
      newAuthority,
      oldOwner: metadata.ownerId,
      newOwner: newOwnerId ?? metadata.ownerId,
    });
  }

  /**
   * Checks if an entity is relevant to a player (AOI check).
   *
   * @param networkId - Network ID
   * @param playerId - Player ID
   * @param playerPosition - Player position
   * @param entityPosition - Entity position
   * @returns True if relevant
   */
  isRelevant(
    networkId: NetworkId,
    playerId: PlayerId,
    playerPosition: [number, number, number],
    entityPosition: [number, number, number]
  ): boolean {
    if (!this.config.enableInterestManagement) {
      return true;
    }

    return this.aoiManager.isRelevant(networkId, playerId, playerPosition, entityPosition);
  }

  /**
   * Updates the replication system (call every frame).
   *
   * @param deltaTime - Time since last update in seconds
   *
   * @example
   * ```typescript
   * update(deltaTime: number): void {
   *   replicationManager.update(deltaTime);
   * }
   * ```
   */
  update(deltaTime: number): void {
    this.tickAccumulator += deltaTime;

    // Update statistics
    this.statsResetTimer += deltaTime;
    if (this.statsResetTimer >= 1.0) {
      this.stats.bandwidthUsed = this.bytesSentThisSecond;
      this.bytesSentThisSecond = 0;
      this.statsResetTimer = 0;

      // Update average snapshot size
      if (this.snapshotSizesSent.length > 0) {
        const sum = this.snapshotSizesSent.reduce((a, b) => a + b, 0);
        this.stats.averageSnapshotSize = sum / this.snapshotSizesSent.length;
        this.snapshotSizesSent.length = 0;
      }
    }

    // Process replication ticks
    while (this.tickAccumulator >= this.tickInterval) {
      this.tickAccumulator -= this.tickInterval;
      this.processTick();
    }
  }

  /**
   * Processes one replication tick.
   */
  private processTick(): void {
    // This would be called by the network system to replicate entities
    // Actual replication is driven by the NetworkSystem or game code
  }

  /**
   * Records a sent snapshot for statistics.
   */
  recordSnapshotSent(size: number): void {
    this.stats.snapshotsSent++;
    this.snapshotSizesSent.push(size);
    this.bytesSentThisSecond += size;
  }

  /**
   * Records a received snapshot for statistics.
   */
  recordSnapshotReceived(): void {
    this.stats.snapshotsReceived++;
  }

  /**
   * Gets replication statistics.
   * @returns Replication statistics
   */
  getStats(): Readonly<ReplicationStats> {
    return { ...this.stats };
  }

  /**
   * Gets the network entity registry.
   * @returns Entity registry
   */
  getRegistry(): NetworkEntityRegistry {
    return this.registry;
  }

  /**
   * Gets the interest manager.
   * @returns Interest manager
   */
  getInterestManager(): AOIManager {
    return this.aoiManager;
  }

  /**
   * Cleans up resources.
   */
  dispose(): void {
    this.registry.clear();
    this.snapshotBuffers.clear();
    this.lastSnapshots.clear();
    this.stateCaptureCallbacks.clear();
    this.stateApplyCallbacks.clear();

    logger.info('ReplicationManager disposed');
  }
}
