/**
 * ECS System for terrain rendering and updates.
 * Integrates terrain into the entity-component-system architecture.
 * @module TerrainSystem
 */

import { System, SystemContext } from '../ecs/System';
import { IComponent } from '../ecs/Component';
import { Entity } from '../ecs/Entity';
import { Terrain } from './Terrain';
import { Camera } from '../rendering/camera/Camera';
import { Frustum } from '../math/Frustum';
import { Logger } from '../core/Logger';

const logger = Logger.create('TerrainSystem');

/**
 * Terrain component for entities.
 * Attaches a terrain instance to an entity.
 *
 * @example
 * ```typescript
 * const terrainEntity = world.createEntity();
 * const terrainComponent = new TerrainComponent(terrain);
 * terrainEntity.addComponent(terrainComponent);
 * ```
 */
export class TerrainComponent implements IComponent {
  /** Terrain instance */
  readonly terrain: Terrain;
  /** Whether terrain is active */
  active: boolean;
  /** Whether to update terrain each frame */
  autoUpdate: boolean;

  /**
   * Creates a new terrain component.
   *
   * @param terrain - Terrain instance
   */
  constructor(terrain: Terrain) {
    this.terrain = terrain;
    this.active = true;
    this.autoUpdate = true;
  }

  /**
   * Called when component is attached to an entity.
   * @param entity - Entity ID
   */
  onAttach(entity: number): void {
    logger.info(`Terrain component attached to entity ${entity}`);
  }

  /**
   * Called when component is detached from an entity.
   * @param entity - Entity ID
   */
  onDetach(entity: number): void {
    logger.info(`Terrain component detached from entity ${entity}`);
  }

  /**
   * Resets component state.
   */
  reset(): void {
    this.active = true;
    this.autoUpdate = true;
  }

  /**
   * Serializes component to JSON.
   * @returns JSON representation
   */
  serialize(): object {
    return {
      terrain: this.terrain.toJSON(),
      active: this.active,
      autoUpdate: this.autoUpdate,
    };
  }

  /**
   * Deserializes component from JSON.
   * @param data - JSON data
   */
  deserialize(data: any): void {
    if (data.active !== undefined) this.active = data.active;
    if (data.autoUpdate !== undefined) this.autoUpdate = data.autoUpdate;
    // Note: Terrain deserialization would need to be handled separately
  }
}

/**
 * Camera component reference for frustum culling.
 * Simplified interface for camera access.
 */
export interface CameraComponent extends IComponent {
  camera: Camera;
  active: boolean;
}

/**
 * ECS System for terrain rendering and updates.
 * Processes entities with TerrainComponent and updates terrains each frame.
 *
 * @example
 * ```typescript
 * // Add system to world
 * const terrainSystem = new TerrainSystem();
 * world.addSystem(terrainSystem);
 *
 * // Create terrain entity
 * const entity = world.createEntity();
 * entity.addComponent(new TerrainComponent(terrain));
 *
 * // System will automatically update terrain each frame
 * ```
 */
export class TerrainSystem extends System {
  /** Query for entities with TerrainComponent */
  readonly query = [TerrainComponent];
  /** Active camera for frustum culling */
  private _activeCamera: Camera | null;
  /** Cached frustum */
  private _frustum: Frustum;
  /** Terrain update statistics */
  private _stats: {
    terrainCount: number;
    visibleChunks: number;
    updateTime: number;
  };

  /**
   * Creates a new terrain system.
   */
  constructor() {
    super();
    this._activeCamera = null;
    this._frustum = new Frustum();
    this._stats = {
      terrainCount: 0,
      visibleChunks: 0,
      updateTime: 0,
    };
  }


  /**
   * Sets the active camera for frustum culling.
   *
   * @param camera - Camera to use
   */
  setActiveCamera(camera: Camera): void {
    this._activeCamera = camera;
  }

  /**
   * Gets rendering statistics.
   * @returns Statistics object
   */
  getStats(): Readonly<typeof this._stats> {
    return this._stats;
  }

  /**
   * Called when system is added to world.
   */
  override onStart(): void {
    logger.info('TerrainSystem started');
  }

  /**
   * Called when system is removed from world.
   */
  override onStop(): void {
    logger.info('TerrainSystem stopped');
  }

  /**
   * Updates terrain each frame.
   *
   * @param context - System context with timing info
   */
  update(context: SystemContext): void {
    const startTime = performance.now();

    // Find active camera if not set
    if (!this._activeCamera) {
      this._findActiveCamera();
    }

    if (!this._activeCamera) {
      return; // No camera available
    }

    // Update frustum from camera
    this._updateFrustum();

    // Reset stats
    this._stats.terrainCount = 0;
    this._stats.visibleChunks = 0;

    // Process all terrain entities
    const query = this.world?.getQuery(this.query);
    if (!query) return;

    query.forEach((entity: Entity, components: IComponent[]) => {
      const terrainComponent = components[0] as TerrainComponent;

      if (!terrainComponent.active) return;

      const terrain = terrainComponent.terrain;

      // Update terrain if auto-update is enabled
      if (terrainComponent.autoUpdate && this._activeCamera) {
        terrain.update(this._activeCamera, this._frustum, context.deltaTime);
      }

      // Count visible chunks
      const visibleChunks = terrain.getVisibleChunks();
      this._stats.visibleChunks += visibleChunks.length;
      this._stats.terrainCount++;
    });

    this._stats.updateTime = performance.now() - startTime;
  }

  /**
   * Finds and sets the active camera from entities.
   * @private
   */
  private _findActiveCamera(): void {
    if (!this.world) return;

    // Query for camera components
    // Note: This is a placeholder - camera query would need proper component type
    // For now, we skip camera auto-detection
    // const cameraQuery = this.world.getQuery([CameraComponent]);
    // if (!cameraQuery) return;

    // Find the first active camera
    // cameraQuery.forEach((entity: Entity, components: IComponent[]) => {
    //   const cameraComponent = components[0] as CameraComponent;
    //   if (cameraComponent?.active && cameraComponent.camera) {
    //     this._activeCamera = cameraComponent.camera;
    //     return; // Found active camera, stop iteration
    //   }
    // });
  }

  /**
   * Updates frustum from active camera.
   * @private
   */
  private _updateFrustum(): void {
    if (!this._activeCamera) return;

    // Update frustum from camera's view-projection matrix
    // This assumes Camera has a method to get the frustum
    // In a real implementation, this would be:
    // this._frustum = this._activeCamera.getFrustum();
  }

  /**
   * Renders terrain chunks.
   * Called during render phase (if implementing a render system pattern).
   *
   * @param renderContext - Rendering context
   */
  render(renderContext?: any): void {
    if (!this._activeCamera) return;

    const query = this.world?.getQuery(this.query);
    if (!query) return;

    query.forEach((entity: Entity, components: IComponent[]) => {
      const terrainComponent = components[0] as TerrainComponent;

      if (!terrainComponent.active) return;

      const terrain = terrainComponent.terrain;
      const visibleChunks = terrain.getVisibleChunks();

      // Render each visible chunk
      for (const { chunk, lodLevel } of visibleChunks) {
        const mesh = chunk.getMesh(lodLevel);
        const material = terrain.material;

        if (!mesh || !material) continue;

        // Submit mesh for rendering
        // This would interface with the rendering system
        // renderContext?.drawMesh(mesh, material, chunk.worldPosition);
      }

      // Render vegetation if enabled
      const vegetation = terrain.vegetation;
      if (vegetation && this._activeCamera) {
        const cameraPos = this._activeCamera.transform.position;

        for (let i = 0; i < vegetation.layers.length; i++) {
          const instances = vegetation.getVisibleInstances(i, cameraPos);
          const layer = vegetation.layers[i]!;

          if (instances.length === 0 || !layer.mesh || !layer.material) continue;

          // Render instanced vegetation
          // renderContext?.drawInstanced(layer.mesh, layer.material, instances);
        }
      }
    });
  }

  /**
   * Gets all terrain instances being managed.
   * @returns Array of terrains
   */
  getTerrains(): Terrain[] {
    const terrains: Terrain[] = [];
    const query = this.world?.getQuery(this.query);

    if (!query) return terrains;

    query.forEach((entity: Entity, components: IComponent[]) => {
      const terrainComponent = components[0] as TerrainComponent;
      terrains.push(terrainComponent.terrain);
    });

    return terrains;
  }

  /**
   * Finds terrain containing a world position.
   *
   * @param x - World X coordinate
   * @param z - World Z coordinate
   * @returns Terrain at position or null
   */
  findTerrainAt(x: number, z: number): Terrain | null {
    const query = this.world?.getQuery(this.query);
    if (!query) return null;

    let found: Terrain | null = null;

    query.forEach((entity: Entity, components: IComponent[]) => {
      const terrainComponent = components[0] as TerrainComponent;
      const terrain = terrainComponent.terrain;

      // Check if position is within terrain bounds
      const bounds = terrain.bounds;
      if (
        x >= bounds.min.x && x <= bounds.max.x &&
        z >= bounds.min.z && z <= bounds.max.z
      ) {
        found = terrain;
      }
    });

    return found;
  }

  /**
   * Gets height at world position across all terrains.
   *
   * @param x - World X coordinate
   * @param z - World Z coordinate
   * @returns Height or 0 if no terrain
   */
  getHeightAt(x: number, z: number): number {
    const terrain = this.findTerrainAt(x, z);
    return terrain?.getHeight(x, z) ?? 0;
  }
}
