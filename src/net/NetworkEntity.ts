/**
 * @fileoverview Network-replicated entity system.
 * Provides network ID assignment, ownership tracking, and authority models.
 * @module net/NetworkEntity
 */

import { Entity } from '../ecs/Entity';
import { IComponent } from '../ecs/Component';
import { Logger } from '../core/Logger';

const logger = Logger.create('NetworkEntity');

/**
 * Network entity ID (unique across network).
 */
export type NetworkId = number;

/**
 * Player/client ID.
 */
export type PlayerId = number;

/**
 * Network authority model.
 */
export enum NetworkAuthority {
  /** Server has authority */
  SERVER = 'server',
  /** Client has authority */
  CLIENT = 'client',
  /** Shared authority (both can modify) */
  SHARED = 'shared',
}

/**
 * Network replication mode.
 */
export enum ReplicationMode {
  /** No replication */
  NONE = 'none',
  /** Replicate to owner only */
  OWNER_ONLY = 'owner_only',
  /** Replicate to all clients */
  ALL_CLIENTS = 'all_clients',
  /** Replicate to all except owner */
  ALL_EXCEPT_OWNER = 'all_except_owner',
}

/**
 * Network entity metadata.
 */
export interface NetworkEntityMetadata {
  /** Network ID */
  networkId: NetworkId;
  /** Owner player ID (0 = server) */
  ownerId: PlayerId;
  /** Authority model */
  authority: NetworkAuthority;
  /** Replication mode */
  replicationMode: ReplicationMode;
  /** Last update timestamp */
  lastUpdateTime: number;
  /** Update sequence number */
  sequenceNumber: number;
  /** Interest distance (for interest management) */
  interestDistance: number;
}

/**
 * Network identity component.
 * Marks an entity as network-replicated.
 *
 * @example
 * ```typescript
 * class NetworkIdentityComponent implements IComponent {
 *   networkId: NetworkId = 0;
 *   ownerId: PlayerId = 0;
 *   authority: NetworkAuthority = NetworkAuthority.SERVER;
 *   replicationMode: ReplicationMode = ReplicationMode.ALL_CLIENTS;
 * }
 *
 * // Add to entity
 * world.addComponent(entity, new NetworkIdentityComponent());
 * ```
 */
export class NetworkIdentityComponent implements IComponent {
  /** Network ID (assigned by NetworkEntityRegistry) */
  networkId: NetworkId = 0;

  /** Owner player ID (0 = server/no owner) */
  ownerId: PlayerId = 0;

  /** Authority model */
  authority: NetworkAuthority = NetworkAuthority.SERVER;

  /** Replication mode */
  replicationMode: ReplicationMode = ReplicationMode.ALL_CLIENTS;

  /** Last update timestamp */
  lastUpdateTime: number = 0;

  /** Update sequence number */
  sequenceNumber: number = 0;

  /** Interest distance for culling (0 = always relevant) */
  interestDistance: number = 0;

  /** Whether this entity is spawned by the network */
  isNetworkSpawned: boolean = false;

  reset(): void {
    this.networkId = 0;
    this.ownerId = 0;
    this.authority = NetworkAuthority.SERVER;
    this.replicationMode = ReplicationMode.ALL_CLIENTS;
    this.lastUpdateTime = 0;
    this.sequenceNumber = 0;
    this.interestDistance = 0;
    this.isNetworkSpawned = false;
  }
}

/**
 * Registry for network entities.
 * Manages network ID assignment and entity lookups.
 *
 * @example
 * ```typescript
 * const registry = new NetworkEntityRegistry();
 *
 * // Register entity
 * const networkId = registry.register(entity, metadata);
 *
 * // Lookup entity
 * const entity = registry.getEntity(networkId);
 *
 * // Get metadata
 * const metadata = registry.getMetadata(networkId);
 * ```
 */
export class NetworkEntityRegistry {
  /** Map from network ID to entity */
  private networkIdToEntity = new Map<NetworkId, Entity>();

  /** Map from entity to network ID */
  private entityToNetworkId = new Map<Entity, NetworkId>();

  /** Map from network ID to metadata */
  private metadata = new Map<NetworkId, NetworkEntityMetadata>();

  /** Next network ID to assign */
  private nextNetworkId: NetworkId = 1;

  /**
   * Registers a network entity.
   *
   * @param entity - Entity to register
   * @param ownerId - Owner player ID
   * @param authority - Authority model
   * @param replicationMode - Replication mode
   * @param interestDistance - Interest distance
   * @returns Assigned network ID
   *
   * @example
   * ```typescript
   * const networkId = registry.register(
   *   entity,
   *   playerId,
   *   NetworkAuthority.CLIENT,
   *   ReplicationMode.ALL_CLIENTS,
   *   100
   * );
   * ```
   */
  register(
    entity: Entity,
    ownerId: PlayerId = 0,
    authority: NetworkAuthority = NetworkAuthority.SERVER,
    replicationMode: ReplicationMode = ReplicationMode.ALL_CLIENTS,
    interestDistance: number = 0
  ): NetworkId {
    if (this.entityToNetworkId.has(entity)) {
      throw new Error('Entity is already registered');
    }

    const networkId = this.nextNetworkId++;

    this.networkIdToEntity.set(networkId, entity);
    this.entityToNetworkId.set(entity, networkId);

    const meta: NetworkEntityMetadata = {
      networkId,
      ownerId,
      authority,
      replicationMode,
      lastUpdateTime: Date.now(),
      sequenceNumber: 0,
      interestDistance,
    };

    this.metadata.set(networkId, meta);

    logger.debug(`Registered entity ${entity} as network ID ${networkId}`);

    return networkId;
  }

  /**
   * Unregisters a network entity.
   *
   * @param entity - Entity to unregister
   * @returns True if unregistered, false if not found
   *
   * @example
   * ```typescript
   * registry.unregister(entity);
   * ```
   */
  unregister(entity: Entity): boolean {
    const networkId = this.entityToNetworkId.get(entity);
    if (!networkId) {
      return false;
    }

    this.networkIdToEntity.delete(networkId);
    this.entityToNetworkId.delete(entity);
    this.metadata.delete(networkId);

    logger.debug(`Unregistered entity ${entity} (network ID ${networkId})`);

    return true;
  }

  /**
   * Unregisters by network ID.
   *
   * @param networkId - Network ID to unregister
   * @returns True if unregistered, false if not found
   */
  unregisterById(networkId: NetworkId): boolean {
    const entity = this.networkIdToEntity.get(networkId);
    if (!entity) {
      return false;
    }

    this.networkIdToEntity.delete(networkId);
    this.entityToNetworkId.delete(entity);
    this.metadata.delete(networkId);

    return true;
  }

  /**
   * Gets entity by network ID.
   *
   * @param networkId - Network ID
   * @returns Entity or undefined
   *
   * @example
   * ```typescript
   * const entity = registry.getEntity(42);
   * if (entity) {
   *   // Process entity
   * }
   * ```
   */
  getEntity(networkId: NetworkId): Entity | undefined {
    return this.networkIdToEntity.get(networkId);
  }

  /**
   * Gets network ID for entity.
   *
   * @param entity - Entity
   * @returns Network ID or undefined
   */
  getNetworkId(entity: Entity): NetworkId | undefined {
    return this.entityToNetworkId.get(entity);
  }

  /**
   * Gets metadata for network ID.
   *
   * @param networkId - Network ID
   * @returns Metadata or undefined
   */
  getMetadata(networkId: NetworkId): NetworkEntityMetadata | undefined {
    return this.metadata.get(networkId);
  }

  /**
   * Gets metadata for entity.
   *
   * @param entity - Entity
   * @returns Metadata or undefined
   */
  getEntityMetadata(entity: Entity): NetworkEntityMetadata | undefined {
    const networkId = this.entityToNetworkId.get(entity);
    if (!networkId) {
      return undefined;
    }
    return this.metadata.get(networkId);
  }

  /**
   * Updates metadata for an entity.
   *
   * @param networkId - Network ID
   * @param updates - Partial metadata updates
   *
   * @example
   * ```typescript
   * registry.updateMetadata(networkId, {
   *   lastUpdateTime: Date.now(),
   *   sequenceNumber: sequenceNumber + 1,
   * });
   * ```
   */
  updateMetadata(networkId: NetworkId, updates: Partial<NetworkEntityMetadata>): void {
    const meta = this.metadata.get(networkId);
    if (!meta) {
      logger.warn(`Cannot update metadata - network ID ${networkId} not found`);
      return;
    }

    Object.assign(meta, updates);
  }

  /**
   * Checks if entity is registered.
   *
   * @param entity - Entity to check
   * @returns True if registered
   */
  has(entity: Entity): boolean {
    return this.entityToNetworkId.has(entity);
  }

  /**
   * Checks if network ID is registered.
   *
   * @param networkId - Network ID to check
   * @returns True if registered
   */
  hasId(networkId: NetworkId): boolean {
    return this.networkIdToEntity.has(networkId);
  }

  /**
   * Gets all registered network IDs.
   * @returns Array of network IDs
   */
  getAllNetworkIds(): NetworkId[] {
    return Array.from(this.networkIdToEntity.keys());
  }

  /**
   * Gets all registered entities.
   * @returns Array of entities
   */
  getAllEntities(): Entity[] {
    return Array.from(this.entityToNetworkId.keys());
  }

  /**
   * Gets entities owned by a player.
   *
   * @param ownerId - Owner player ID
   * @returns Array of entities
   *
   * @example
   * ```typescript
   * const playerEntities = registry.getEntitiesByOwner(playerId);
   * for (const entity of playerEntities) {
   *   // Process player's entities
   * }
   * ```
   */
  getEntitiesByOwner(ownerId: PlayerId): Entity[] {
    const entities: Entity[] = [];

    for (const [networkId, meta] of this.metadata) {
      if (meta.ownerId === ownerId) {
        const entity = this.networkIdToEntity.get(networkId);
        if (entity) {
          entities.push(entity);
        }
      }
    }

    return entities;
  }

  /**
   * Gets the number of registered entities.
   * @returns Entity count
   */
  get size(): number {
    return this.networkIdToEntity.size;
  }

  /**
   * Clears all registrations.
   */
  clear(): void {
    this.networkIdToEntity.clear();
    this.entityToNetworkId.clear();
    this.metadata.clear();
    this.nextNetworkId = 1;
  }
}

/**
 * Interest manager for network entities.
 * Culls entities based on distance or other criteria.
 *
 * @example
 * ```typescript
 * const interestManager = new InterestManager(registry);
 *
 * // Check if entity is relevant to player
 * const isRelevant = interestManager.isRelevant(
 *   networkId,
 *   playerId,
 *   playerPosition
 * );
 *
 * // Get all relevant entities for a player
 * const relevant = interestManager.getRelevantEntities(
 *   playerId,
 *   playerPosition,
 *   positions
 * );
 * ```
 */
export class InterestManager {
  private registry: NetworkEntityRegistry;

  /**
   * Creates a new interest manager.
   * @param registry - Network entity registry
   */
  constructor(registry: NetworkEntityRegistry) {
    this.registry = registry;
  }

  /**
   * Checks if an entity is relevant to a player.
   *
   * @param networkId - Network ID of entity
   * @param playerId - Player ID
   * @param playerPosition - Player position (x, y, z)
   * @param entityPosition - Entity position (x, y, z)
   * @returns True if relevant
   *
   * @example
   * ```typescript
   * const isRelevant = interestManager.isRelevant(
   *   entityNetworkId,
   *   playerId,
   *   [playerX, playerY, playerZ],
   *   [entityX, entityY, entityZ]
   * );
   * ```
   */
  isRelevant(
    networkId: NetworkId,
    playerId: PlayerId,
    playerPosition: [number, number, number],
    entityPosition: [number, number, number]
  ): boolean {
    const meta = this.registry.getMetadata(networkId);
    if (!meta) {
      return false;
    }

    // Check replication mode
    switch (meta.replicationMode) {
      case ReplicationMode.NONE:
        return false;
      case ReplicationMode.OWNER_ONLY:
        return meta.ownerId === playerId;
      case ReplicationMode.ALL_EXCEPT_OWNER:
        if (meta.ownerId === playerId) {
          return false;
        }
        break;
      case ReplicationMode.ALL_CLIENTS:
        // Continue to distance check
        break;
    }

    // Check interest distance (0 = always relevant)
    if (meta.interestDistance === 0) {
      return true;
    }

    // Calculate distance
    const dx = entityPosition[0] - playerPosition[0];
    const dy = entityPosition[1] - playerPosition[1];
    const dz = entityPosition[2] - playerPosition[2];
    const distanceSq = dx * dx + dy * dy + dz * dz;
    const interestDistanceSq = meta.interestDistance * meta.interestDistance;

    return distanceSq <= interestDistanceSq;
  }

  /**
   * Gets all entities relevant to a player.
   *
   * @param playerId - Player ID
   * @param playerPosition - Player position
   * @param getEntityPosition - Function to get entity position
   * @returns Array of relevant network IDs
   *
   * @example
   * ```typescript
   * const relevant = interestManager.getRelevantEntities(
   *   playerId,
   *   playerPos,
   *   (networkId) => {
   *     const entity = registry.getEntity(networkId);
   *     const pos = world.getComponent(entity, PositionComponent);
   *     return [pos.x, pos.y, pos.z];
   *   }
   * );
   * ```
   */
  getRelevantEntities(
    playerId: PlayerId,
    playerPosition: [number, number, number],
    getEntityPosition: (networkId: NetworkId) => [number, number, number] | null
  ): NetworkId[] {
    const relevant: NetworkId[] = [];

    for (const networkId of this.registry.getAllNetworkIds()) {
      const entityPos = getEntityPosition(networkId);
      if (!entityPos) {
        continue;
      }

      if (this.isRelevant(networkId, playerId, playerPosition, entityPos)) {
        relevant.push(networkId);
      }
    }

    return relevant;
  }

  /**
   * Filters entities by replication mode.
   *
   * @param networkIds - Network IDs to filter
   * @param playerId - Player ID
   * @returns Filtered network IDs
   */
  filterByReplicationMode(networkIds: NetworkId[], playerId: PlayerId): NetworkId[] {
    return networkIds.filter((networkId) => {
      const meta = this.registry.getMetadata(networkId);
      if (!meta) {
        return false;
      }

      switch (meta.replicationMode) {
        case ReplicationMode.NONE:
          return false;
        case ReplicationMode.OWNER_ONLY:
          return meta.ownerId === playerId;
        case ReplicationMode.ALL_EXCEPT_OWNER:
          return meta.ownerId !== playerId;
        case ReplicationMode.ALL_CLIENTS:
          return true;
        default:
          return false;
      }
    });
  }
}
