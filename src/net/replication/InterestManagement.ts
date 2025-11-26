/**
 * @fileoverview Area of Interest (AOI) and relevancy management.
 * Optimizes bandwidth by only replicating relevant entities to each client.
 * @module net/replication/InterestManagement
 */

import { Logger } from '../../core/Logger';
import { NetworkId, PlayerId, NetworkEntityRegistry, ReplicationMode } from '../NetworkEntity';
import { Vector3 } from '../../math/Vector3';

const logger = Logger.create('InterestManagement');

/**
 * Interest area shape.
 */
export enum InterestShape {
  /** Sphere (distance-based) */
  SPHERE = 'sphere',
  /** Box (AABB) */
  BOX = 'box',
  /** Cylinder (2D distance + height) */
  CYLINDER = 'cylinder',
}

/**
 * Interest area definition.
 */
export interface InterestArea {
  /** Shape type */
  shape: InterestShape;
  /** Center position */
  center: Vector3;
  /** Radius (for sphere/cylinder) */
  radius?: number;
  /** Half-extents (for box) */
  halfExtents?: Vector3;
  /** Height (for cylinder) */
  height?: number;
}

/**
 * Entity position provider function.
 */
export type PositionProvider = (networkId: NetworkId) => Vector3 | null;

/**
 * Relevancy set for a player.
 * Contains entities that are currently relevant to the player.
 */
export class RelevancySet {
  private relevant = new Set<NetworkId>();
  private previouslyRelevant = new Set<NetworkId>();

  /**
   * Updates the relevancy set.
   *
   * @param newRelevant - Set of currently relevant network IDs
   * @returns Changes (added and removed entities)
   */
  update(newRelevant: Set<NetworkId>): {
    added: NetworkId[];
    removed: NetworkId[];
    unchanged: NetworkId[];
  } {
    const added: NetworkId[] = [];
    const removed: NetworkId[] = [];
    const unchanged: NetworkId[] = [];

    // Find added entities
    for (const networkId of newRelevant) {
      if (!this.relevant.has(networkId)) {
        added.push(networkId);
      } else {
        unchanged.push(networkId);
      }
    }

    // Find removed entities
    for (const networkId of this.relevant) {
      if (!newRelevant.has(networkId)) {
        removed.push(networkId);
      }
    }

    // Update sets
    this.previouslyRelevant = this.relevant;
    this.relevant = newRelevant;

    return { added, removed, unchanged };
  }

  /**
   * Checks if an entity is relevant.
   * @param networkId - Network ID
   * @returns True if relevant
   */
  isRelevant(networkId: NetworkId): boolean {
    return this.relevant.has(networkId);
  }

  /**
   * Gets all relevant network IDs.
   * @returns Set of relevant network IDs
   */
  getRelevant(): Set<NetworkId> {
    return new Set(this.relevant);
  }

  /**
   * Gets previously relevant network IDs.
   * @returns Set of previously relevant network IDs
   */
  getPreviouslyRelevant(): Set<NetworkId> {
    return new Set(this.previouslyRelevant);
  }

  /**
   * Gets the number of relevant entities.
   * @returns Count
   */
  get size(): number {
    return this.relevant.size;
  }

  /**
   * Clears the relevancy set.
   */
  clear(): void {
    this.relevant.clear();
    this.previouslyRelevant.clear();
  }
}

/**
 * Interest management system (Area of Interest).
 * Determines which entities should be replicated to which clients based on spatial proximity.
 *
 * Performance: Optimized for 1000+ entities with spatial partitioning.
 *
 * @example
 * ```typescript
 * const interestManager = new InterestManager(registry);
 *
 * // Set position provider
 * interestManager.setPositionProvider((networkId) => {
 *   const entity = registry.getEntity(networkId);
 *   return getEntityPosition(entity);
 * });
 *
 * // Update relevancy for a player
 * const changes = interestManager.updateRelevancy(
 *   playerId,
 *   playerPosition,
 *   100 // interest radius
 * );
 *
 * // Check if entity is relevant
 * if (interestManager.isRelevant(entityNetworkId, playerId)) {
 *   // Replicate to this player
 * }
 * ```
 */
export class InterestManager {
  private registry: NetworkEntityRegistry;
  private positionProvider: PositionProvider | null = null;

  /** Relevancy sets per player */
  private relevancySets = new Map<PlayerId, RelevancySet>();

  /** Default interest distance */
  private defaultInterestDistance: number = 100;

  /** Enable spatial grid optimization */
  private enableSpatialGrid: boolean = true;

  /** Grid cell size */
  private gridCellSize: number = 50;

  /** Spatial grid (simple 2D grid for optimization) */
  private spatialGrid = new Map<string, Set<NetworkId>>();

  /**
   * Creates a new InterestManager.
   *
   * @param registry - Network entity registry
   * @param defaultInterestDistance - Default interest distance
   *
   * @example
   * ```typescript
   * const manager = new InterestManager(registry, 150);
   * ```
   */
  constructor(registry: NetworkEntityRegistry, defaultInterestDistance: number = 100) {
    this.registry = registry;
    this.defaultInterestDistance = defaultInterestDistance;
  }

  /**
   * Sets the position provider function.
   *
   * @param provider - Function that returns entity positions
   *
   * @example
   * ```typescript
   * manager.setPositionProvider((networkId) => {
   *   const entity = registry.getEntity(networkId);
   *   const transform = world.getComponent(entity, TransformComponent);
   *   return transform?.position ?? null;
   * });
   * ```
   */
  setPositionProvider(provider: PositionProvider): void {
    this.positionProvider = provider;
  }

  /**
   * Updates relevancy for a player.
   *
   * @param playerId - Player ID
   * @param playerPosition - Player position
   * @param interestDistance - Interest distance (optional, uses default if not specified)
   * @returns Relevancy changes (added, removed, unchanged)
   *
   * @example
   * ```typescript
   * const changes = manager.updateRelevancy(
   *   playerId,
   *   new Vector3(100, 0, 200),
   *   150
   * );
   *
   * // Spawn newly relevant entities
   * for (const networkId of changes.added) {
   *   spawnEntityForPlayer(networkId, playerId);
   * }
   *
   * // Despawn no longer relevant entities
   * for (const networkId of changes.removed) {
   *   despawnEntityForPlayer(networkId, playerId);
   * }
   * ```
   */
  updateRelevancy(
    playerId: PlayerId,
    playerPosition: Vector3,
    interestDistance?: number
  ): {
    added: NetworkId[];
    removed: NetworkId[];
    unchanged: NetworkId[];
  } {
    const distance = interestDistance ?? this.defaultInterestDistance;

    // Get or create relevancy set
    let relevancySet = this.relevancySets.get(playerId);
    if (!relevancySet) {
      relevancySet = new RelevancySet();
      this.relevancySets.set(playerId, relevancySet);
    }

    // Calculate new relevant set
    const newRelevant = this.calculateRelevantEntities(playerId, playerPosition, distance);

    // Update and get changes
    return relevancySet.update(newRelevant);
  }

  /**
   * Calculates relevant entities for a player.
   */
  private calculateRelevantEntities(
    playerId: PlayerId,
    playerPosition: Vector3,
    interestDistance: number
  ): Set<NetworkId> {
    const relevant = new Set<NetworkId>();

    if (!this.positionProvider) {
      logger.warn('No position provider set - all entities considered relevant');
      return new Set(this.registry.getAllNetworkIds());
    }

    // Use spatial grid if enabled
    const candidateIds = this.enableSpatialGrid
      ? this.getCandidatesFromGrid(playerPosition, interestDistance)
      : this.registry.getAllNetworkIds();

    for (const networkId of candidateIds) {
      const metadata = this.registry.getMetadata(networkId);
      if (!metadata) continue;

      // Check replication mode
      if (!this.shouldReplicateToPlayer(metadata.replicationMode, metadata.ownerId, playerId)) {
        continue;
      }

      // Get entity interest distance (0 = always relevant)
      const entityInterestDistance = metadata.interestDistance || interestDistance;

      if (entityInterestDistance === 0) {
        // Always relevant
        relevant.add(networkId);
        continue;
      }

      // Get entity position
      const entityPosition = this.positionProvider(networkId);
      if (!entityPosition) {
        continue;
      }

      // Check distance
      const distanceSq = playerPosition.distanceToSquared(entityPosition);
      const interestDistanceSq = entityInterestDistance * entityInterestDistance;

      if (distanceSq <= interestDistanceSq) {
        relevant.add(networkId);
      }
    }

    return relevant;
  }

  /**
   * Gets candidate entities from spatial grid.
   */
  private getCandidatesFromGrid(position: Vector3, radius: number): NetworkId[] {
    // Calculate grid cells to check
    const minX = Math.floor((position.x - radius) / this.gridCellSize);
    const maxX = Math.floor((position.x + radius) / this.gridCellSize);
    const minZ = Math.floor((position.z - radius) / this.gridCellSize);
    const maxZ = Math.floor((position.z + radius) / this.gridCellSize);

    const candidates = new Set<NetworkId>();

    for (let x = minX; x <= maxX; x++) {
      for (let z = minZ; z <= maxZ; z++) {
        const cellKey = `${x},${z}`;
        const cell = this.spatialGrid.get(cellKey);
        if (cell) {
          for (const networkId of cell) {
            candidates.add(networkId);
          }
        }
      }
    }

    return Array.from(candidates);
  }

  /**
   * Updates the spatial grid with entity positions.
   * Call this periodically to keep the grid up-to-date.
   *
   * @example
   * ```typescript
   * // Update grid every second
   * setInterval(() => {
   *   manager.updateSpatialGrid();
   * }, 1000);
   * ```
   */
  updateSpatialGrid(): void {
    if (!this.positionProvider || !this.enableSpatialGrid) {
      return;
    }

    // Clear grid
    this.spatialGrid.clear();

    // Add all entities to grid
    for (const networkId of this.registry.getAllNetworkIds()) {
      const position = this.positionProvider(networkId);
      if (!position) continue;

      const cellKey = this.getGridCellKey(position);
      let cell = this.spatialGrid.get(cellKey);
      if (!cell) {
        cell = new Set();
        this.spatialGrid.set(cellKey, cell);
      }
      cell.add(networkId);
    }
  }

  /**
   * Gets the grid cell key for a position.
   */
  private getGridCellKey(position: Vector3): string {
    const x = Math.floor(position.x / this.gridCellSize);
    const z = Math.floor(position.z / this.gridCellSize);
    return `${x},${z}`;
  }

  /**
   * Checks if entity should replicate to a player based on replication mode.
   */
  private shouldReplicateToPlayer(
    mode: ReplicationMode,
    ownerId: PlayerId,
    playerId: PlayerId
  ): boolean {
    switch (mode) {
      case ReplicationMode.NONE:
        return false;
      case ReplicationMode.OWNER_ONLY:
        return ownerId === playerId;
      case ReplicationMode.ALL_EXCEPT_OWNER:
        return ownerId !== playerId;
      case ReplicationMode.ALL_CLIENTS:
        return true;
      default:
        return false;
    }
  }

  /**
   * Checks if an entity is relevant to a player.
   *
   * @param networkId - Network ID
   * @param playerId - Player ID
   * @param playerPosition - Player position
   * @param entityPosition - Entity position
   * @returns True if relevant
   *
   * @example
   * ```typescript
   * if (manager.isRelevant(entityId, playerId, playerPos, entityPos)) {
   *   // Send update to player
   * }
   * ```
   */
  isRelevant(
    networkId: NetworkId,
    playerId: PlayerId,
    playerPosition: [number, number, number],
    entityPosition: [number, number, number]
  ): boolean {
    const metadata = this.registry.getMetadata(networkId);
    if (!metadata) {
      return false;
    }

    // Check replication mode
    if (!this.shouldReplicateToPlayer(metadata.replicationMode, metadata.ownerId, playerId)) {
      return false;
    }

    // Check interest distance (0 = always relevant)
    const interestDistance = metadata.interestDistance || this.defaultInterestDistance;
    if (interestDistance === 0) {
      return true;
    }

    // Calculate distance
    const dx = entityPosition[0] - playerPosition[0];
    const dy = entityPosition[1] - playerPosition[1];
    const dz = entityPosition[2] - playerPosition[2];
    const distanceSq = dx * dx + dy * dy + dz * dz;
    const interestDistanceSq = interestDistance * interestDistance;

    return distanceSq <= interestDistanceSq;
  }

  /**
   * Gets the relevancy set for a player.
   *
   * @param playerId - Player ID
   * @returns Relevancy set or null
   */
  getRelevancySet(playerId: PlayerId): RelevancySet | null {
    return this.relevancySets.get(playerId) ?? null;
  }

  /**
   * Gets all relevant entities for a player.
   *
   * @param playerId - Player ID
   * @returns Array of relevant network IDs
   */
  getRelevantEntities(playerId: PlayerId): NetworkId[] {
    const relevancySet = this.relevancySets.get(playerId);
    return relevancySet ? Array.from(relevancySet.getRelevant()) : [];
  }

  /**
   * Checks if an entity is in a player's relevancy set.
   *
   * @param networkId - Network ID
   * @param playerId - Player ID
   * @returns True if relevant
   */
  isInRelevancySet(networkId: NetworkId, playerId: PlayerId): boolean {
    const relevancySet = this.relevancySets.get(playerId);
    return relevancySet ? relevancySet.isRelevant(networkId) : false;
  }

  /**
   * Removes a player's relevancy set.
   *
   * @param playerId - Player ID
   *
   * @example
   * ```typescript
   * // When player disconnects
   * manager.removePlayer(playerId);
   * ```
   */
  removePlayer(playerId: PlayerId): void {
    this.relevancySets.delete(playerId);
  }

  /**
   * Sets the default interest distance.
   *
   * @param distance - Interest distance
   */
  setDefaultInterestDistance(distance: number): void {
    this.defaultInterestDistance = distance;
  }

  /**
   * Enables or disables spatial grid optimization.
   *
   * @param enabled - Enable/disable
   */
  setSpatialGridEnabled(enabled: boolean): void {
    this.enableSpatialGrid = enabled;
    if (!enabled) {
      this.spatialGrid.clear();
    }
  }

  /**
   * Sets the spatial grid cell size.
   *
   * @param size - Cell size
   */
  setGridCellSize(size: number): void {
    this.gridCellSize = size;
    this.spatialGrid.clear();
  }

  /**
   * Gets statistics about the interest management system.
   * @returns Statistics object
   */
  getStats(): {
    players: number;
    totalRelevant: number;
    averageRelevantPerPlayer: number;
    gridCells: number;
  } {
    let totalRelevant = 0;
    for (const set of this.relevancySets.values()) {
      totalRelevant += set.size;
    }

    return {
      players: this.relevancySets.size,
      totalRelevant,
      averageRelevantPerPlayer:
        this.relevancySets.size > 0 ? totalRelevant / this.relevancySets.size : 0,
      gridCells: this.spatialGrid.size,
    };
  }

  /**
   * Clears all relevancy data.
   */
  clear(): void {
    this.relevancySets.clear();
    this.spatialGrid.clear();
  }
}
