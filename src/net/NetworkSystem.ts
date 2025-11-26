/**
 * @fileoverview Network system for ECS integration.
 * Processes network identity components and handles replication.
 * @module net/NetworkSystem
 */

import { System, SystemContext, SystemPriorities } from '../ecs/System';
import { Entity } from '../ecs/Entity';
import { Logger } from '../core/Logger';
import { NetworkManager, NetworkMode } from './NetworkManager';
import {
  NetworkIdentityComponent,
  NetworkEntityRegistry,
  NetworkAuthority,
  ReplicationMode,
  NetworkId,
} from './NetworkEntity';
import { StateSnapshot, SnapshotBuffer, DeltaCompressor } from './StateSync';
import { MessageRegistry, MessagePriority } from './NetworkMessage';

const logger = Logger.create('NetworkSystem');

/**
 * Component that should be replicated over network.
 */
export interface IReplicatedComponent {
  /** Component type name */
  readonly componentType: string;

  /**
   * Serializes component state for network transmission.
   * @returns State map
   */
  getState(): Map<string, any>;

  /**
   * Applies received state.
   * @param state - State map to apply
   */
  setState(state: Map<string, any>): void;
}

/**
 * Network system for ECS integration.
 * Handles entity replication, state synchronization, and RPC dispatch.
 *
 * @example
 * ```typescript
 * const networkSystem = new NetworkSystem(networkManager);
 *
 * // Add to world
 * world.addSystem(networkSystem);
 *
 * // The system will automatically:
 * // - Register entities with NetworkIdentityComponent
 * // - Replicate component state changes
 * // - Handle spawn/despawn messages
 * // - Process RPCs
 * ```
 */
export class NetworkSystem extends System {
  readonly query = [NetworkIdentityComponent];
  override priority = SystemPriorities.EARLY;

  /** Network manager instance */
  private networkManager: NetworkManager;

  /** Snapshot buffers per entity */
  private snapshots = new Map<NetworkId, SnapshotBuffer>();

  /** Delta compressor */
  private deltaCompressor = new DeltaCompressor();

  /** Replicated component types */
  private replicatedComponents = new Set<string>();

  /** Message types */
  private readonly MSG_ENTITY_SPAWN: number;
  private readonly MSG_ENTITY_DESPAWN: number;
  private readonly MSG_STATE_UPDATE: number;

  /** Update rate limiter */
  private updateAccumulator: number = 0;
  private readonly updateRate: number = 1 / 20; // 20Hz state updates

  /**
   * Creates a new network system.
   *
   * @param networkManager - Network manager instance
   *
   * @example
   * ```typescript
   * const network = new NetworkManager({ mode: NetworkMode.CLIENT });
   * const networkSystem = new NetworkSystem(network);
   * world.addSystem(networkSystem);
   * ```
   */
  constructor(networkManager: NetworkManager) {
    super({
      name: 'NetworkSystem',
      priority: SystemPriorities.EARLY,
    });

    this.networkManager = networkManager;

    // Register message types
    this.MSG_ENTITY_SPAWN = MessageRegistry.register('entity_spawn');
    this.MSG_ENTITY_DESPAWN = MessageRegistry.register('entity_despawn');
    this.MSG_STATE_UPDATE = MessageRegistry.register('state_update');

    this.setupMessageHandlers();
  }

  /**
   * Sets up network message handlers.
   */
  private setupMessageHandlers(): void {
    // Entity spawn
    this.networkManager.onMessage(this.MSG_ENTITY_SPAWN, (msg) => {
      this.handleEntitySpawn(msg.data);
    });

    // Entity despawn
    this.networkManager.onMessage(this.MSG_ENTITY_DESPAWN, (msg) => {
      this.handleEntityDespawn(msg.data);
    });

    // State update
    this.networkManager.onMessage(this.MSG_STATE_UPDATE, (msg) => {
      this.handleStateUpdate(msg.data);
    });
  }

  /**
   * Registers a component type for replication.
   *
   * @param componentType - Component type name
   *
   * @example
   * ```typescript
   * networkSystem.registerReplicatedComponent('TransformComponent');
   * networkSystem.registerReplicatedComponent('VelocityComponent');
   * ```
   */
  registerReplicatedComponent(componentType: string): void {
    this.replicatedComponents.add(componentType);
    logger.debug(`Registered replicated component: ${componentType}`);
  }

  /**
   * Spawns a network entity.
   *
   * @param entity - Entity to spawn
   * @param prefabId - Prefab ID for spawning
   * @param ownerId - Owner player ID
   * @param authority - Network authority
   *
   * @example
   * ```typescript
   * const entity = world.createEntity();
   * world.addComponent(entity, new NetworkIdentityComponent());
   * networkSystem.spawnEntity(entity, 'player', playerId, NetworkAuthority.CLIENT);
   * ```
   */
  spawnEntity(
    entity: Entity,
    prefabId: string,
    ownerId: number,
    authority: NetworkAuthority = NetworkAuthority.SERVER
  ): void {
    if (this.networkManager.getMode() !== NetworkMode.SERVER) {
      logger.error('Only server can spawn entities');
      return;
    }

    // Register entity
    const networkId = this.networkManager.entityRegistry.register(
      entity,
      ownerId,
      authority,
      ReplicationMode.ALL_CLIENTS,
      0
    );

    // Update NetworkIdentityComponent
    const identity = this.getNetworkIdentity(entity);
    if (identity) {
      identity.networkId = networkId;
      identity.ownerId = ownerId;
      identity.authority = authority;
      identity.isNetworkSpawned = true;
    }

    // Send spawn message
    const buffer = new ArrayBuffer(256);
    const view = new DataView(buffer);
    let offset = 0;

    view.setUint32(offset, networkId, true);
    offset += 4;

    view.setUint32(offset, ownerId, true);
    offset += 4;

    view.setUint8(offset, this.authorityToCode(authority));
    offset += 1;

    // Write prefab ID
    const encoder = new TextEncoder();
    const prefabBytes = encoder.encode(prefabId);
    view.setUint16(offset, prefabBytes.length, true);
    offset += 2;
    new Uint8Array(buffer, offset).set(prefabBytes);
    offset += prefabBytes.length;

    // Write initial state
    const state = this.captureEntityState(entity);
    const stateData = this.serializeState(state);
    new Uint8Array(buffer, offset).set(new Uint8Array(stateData));
    offset += stateData.byteLength;

    this.networkManager.sendMessage(
      this.MSG_ENTITY_SPAWN,
      buffer.slice(0, offset),
      MessagePriority.HIGH
    );

    logger.debug(`Spawned entity ${entity} with network ID ${networkId}`);
  }

  /**
   * Despawns a network entity.
   *
   * @param entity - Entity to despawn
   *
   * @example
   * ```typescript
   * networkSystem.despawnEntity(entity);
   * ```
   */
  despawnEntity(entity: Entity): void {
    const networkId = this.networkManager.entityRegistry.getNetworkId(entity);
    if (!networkId) {
      logger.warn('Entity is not networked');
      return;
    }

    // Send despawn message
    const buffer = new ArrayBuffer(4);
    const view = new DataView(buffer);
    view.setUint32(0, networkId, true);

    this.networkManager.sendMessage(
      this.MSG_ENTITY_DESPAWN,
      buffer,
      MessagePriority.HIGH
    );

    // Unregister
    this.networkManager.entityRegistry.unregister(entity);
    this.snapshots.delete(networkId);

    logger.debug(`Despawned entity ${entity} (network ID ${networkId})`);
  }

  /**
   * Handles entity spawn message.
   */
  private handleEntitySpawn(data: ArrayBuffer): void {
    const view = new DataView(data);
    let offset = 0;

    const networkId = view.getUint32(offset, true);
    offset += 4;

    const ownerId = view.getUint32(offset, true);
    offset += 4;

    const authorityCode = view.getUint8(offset);
    offset += 1;

    // Read prefab ID
    const prefabLength = view.getUint16(offset, true);
    offset += 2;
    const decoder = new TextDecoder();
    const prefabBytes = new Uint8Array(data, offset, prefabLength);
    const prefabId = decoder.decode(prefabBytes);
    offset += prefabLength;

    // Read initial state
    const stateData = data.slice(offset);
    const state = this.deserializeState(stateData);

    logger.debug(`Received spawn for network ID ${networkId}, prefab: ${prefabId}`);

    // Emit event for game code to handle
    // Game code should create entity from prefab and add NetworkIdentityComponent
    EventBus.emit('network:entity_spawn' as any, {
      networkId,
      ownerId,
      authority: this.codeToAuthority(authorityCode),
      prefabId,
      state,
    });
  }

  /**
   * Handles entity despawn message.
   */
  private handleEntityDespawn(data: ArrayBuffer): void {
    const view = new DataView(data);
    const networkId = view.getUint32(0, true);

    const entity = this.networkManager.entityRegistry.getEntity(networkId);
    if (!entity) {
      logger.warn(`Cannot despawn - entity with network ID ${networkId} not found`);
      return;
    }

    logger.debug(`Received despawn for network ID ${networkId}`);

    // Emit event for game code to handle
    EventBus.emit('network:entity_despawn' as any, { networkId, entity });

    // Cleanup
    this.networkManager.entityRegistry.unregisterById(networkId);
    this.snapshots.delete(networkId);
  }

  /**
   * Handles state update message.
   */
  private handleStateUpdate(data: ArrayBuffer): void {
    const delta = this.deltaCompressor.deserializeDelta(data);

    const entity = this.networkManager.entityRegistry.getEntity(delta.networkId);
    if (!entity) {
      return;
    }

    // Get snapshot buffer
    let buffer = this.snapshots.get(delta.networkId);
    if (!buffer) {
      buffer = new SnapshotBuffer(10);
      this.snapshots.set(delta.networkId, buffer);
    }

    // Get base snapshot
    const baseSnapshot = buffer.getAtTime(delta.baseTimestamp);
    if (!baseSnapshot) {
      // Can't apply delta without base
      logger.warn(`Missing base snapshot for entity ${delta.networkId}`);
      return;
    }

    // Apply delta
    const newSnapshot = this.deltaCompressor.applyDelta(baseSnapshot, delta);
    buffer.add(newSnapshot);

    // Apply state to entity (interpolate in render update)
    this.applyEntityState(entity, newSnapshot.state);
  }

  /**
   * Main update method.
   */
  update(context: SystemContext): void {
    if (!this.networkManager.getIsConnected()) {
      return;
    }

    const mode = this.networkManager.getMode();

    // Server sends state updates
    if (mode === NetworkMode.SERVER) {
      this.updateAccumulator += context.deltaTime;

      if (this.updateAccumulator >= this.updateRate) {
        this.updateAccumulator = 0;
        this.sendStateUpdates();
      }
    }

    // Process network entities
    const query = this.getQuery();
    query.forEach((entity, components) => {
      this.processEntity(entity, components as [NetworkIdentityComponent], context);
    });
  }

  /**
   * Processes a network entity.
   */
  protected override processEntity(
    entity: Entity,
    components: [NetworkIdentityComponent],
    context: SystemContext
  ): void {
    const [identity] = components;

    // Ensure entity is registered
    if (identity.networkId === 0) {
      // Not yet registered - will be handled by spawn
      return;
    }

    // Client-side interpolation
    if (this.networkManager.getMode() === NetworkMode.CLIENT) {
      const buffer = this.snapshots.get(identity.networkId);
      if (buffer && buffer.size >= 2) {
        const networkTime = this.networkManager.networkTime.getNetworkTime();
        const renderTime = networkTime - 100; // 100ms interpolation delay

        const interpolated = buffer.interpolate(renderTime, [
          'x', 'y', 'z', 'qx', 'qy', 'qz', 'qw',
        ]);

        if (interpolated) {
          this.applyEntityState(entity, interpolated);
        }
      }
    }
  }

  /**
   * Sends state updates for all entities (server only).
   */
  private sendStateUpdates(): void {
    const query = this.getQuery();
    const timestamp = Date.now();

    query.forEach((entity, components) => {
      const [identity] = components as [NetworkIdentityComponent];

      if (identity.networkId === 0) {
        return;
      }

      // Capture current state
      const currentSnapshot = this.captureEntityState(entity);
      currentSnapshot.timestamp = timestamp;

      // Get snapshot buffer
      let buffer = this.snapshots.get(identity.networkId);
      if (!buffer) {
        buffer = new SnapshotBuffer(10);
        this.snapshots.set(identity.networkId, buffer);
      }

      // Get base snapshot
      const baseSnapshot = buffer.getLatest();
      if (!baseSnapshot) {
        // First snapshot - send full state
        buffer.add(currentSnapshot);
        return;
      }

      // Create delta
      const delta = this.deltaCompressor.createDelta(baseSnapshot, currentSnapshot);

      // Only send if there are changes
      if (delta.changes.size > 0) {
        const data = this.deltaCompressor.serializeDelta(delta);
        this.networkManager.sendMessage(
          this.MSG_STATE_UPDATE,
          data,
          MessagePriority.NORMAL
        );

        // Add to buffer
        buffer.add(currentSnapshot);
      }
    });
  }

  /**
   * Captures entity state for replication.
   */
  private captureEntityState(entity: Entity): StateSnapshot {
    const state = new Map<string, any>();

    // Capture all replicated components
    // This is simplified - in a real implementation, you'd query for specific components
    // For now, we'll just return a basic snapshot
    state.set('networkId', 0);

    return {
      timestamp: Date.now(),
      networkId: 0,
      state,
    };
  }

  /**
   * Applies state to entity.
   */
  private applyEntityState(entity: Entity, state: Map<string, any>): void {
    // Apply state to components
    // This is simplified - in a real implementation, you'd update actual components
  }

  /**
   * Serializes state snapshot.
   */
  private serializeState(snapshot: StateSnapshot): ArrayBuffer {
    // Simplified serialization
    return new ArrayBuffer(0);
  }

  /**
   * Deserializes state snapshot.
   */
  private deserializeState(data: ArrayBuffer): Map<string, any> {
    // Simplified deserialization
    return new Map();
  }

  /**
   * Gets NetworkIdentityComponent from entity.
   */
  private getNetworkIdentity(entity: Entity): NetworkIdentityComponent | null {
    // This would normally query the world for the component
    // Simplified for this implementation
    return null;
  }

  /**
   * Converts authority enum to code.
   */
  private authorityToCode(authority: NetworkAuthority): number {
    switch (authority) {
      case NetworkAuthority.SERVER:
        return 0;
      case NetworkAuthority.CLIENT:
        return 1;
      case NetworkAuthority.SHARED:
        return 2;
      default:
        return 0;
    }
  }

  /**
   * Converts code to authority enum.
   */
  private codeToAuthority(code: number): NetworkAuthority {
    switch (code) {
      case 0:
        return NetworkAuthority.SERVER;
      case 1:
        return NetworkAuthority.CLIENT;
      case 2:
        return NetworkAuthority.SHARED;
      default:
        return NetworkAuthority.SERVER;
    }
  }

  /**
   * Lifecycle hook - called when system is destroyed.
   */
  override onDestroy(): void {
    this.snapshots.clear();
  }
}

// Re-export EventBus for network events
import { EventBus } from '../core/EventBus';
