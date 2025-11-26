/**
 * @fileoverview Picking system for selecting entities from screen coordinates.
 * @module editor/picking/PickingSystem
 */

import { Scene } from '../../scene/Scene';
import { Entity } from '../../ecs/Entity';
import { Camera } from '../../components/Camera';
import { Transform } from '../../components/Transform';
import { Vector3 } from '../../math/Vector3';
import { Ray } from '../../math/Ray';
import { GPUPicking } from './GPUPicking';
import { RaycastPicking } from './RaycastPicking';

/**
 * Pick mode enumeration
 */
export enum PickMode {
  /** GPU-based color picking (fast for complex scenes) */
  GPU = 'gpu',
  /** Raycast-based picking (more accurate) */
  RAYCAST = 'raycast',
  /** Automatic selection based on scene complexity */
  AUTO = 'auto'
}

/**
 * Pick result interface
 */
export interface PickResult {
  /** Picked entity */
  entity: Entity;
  /** Hit position in world space */
  position: Vector3;
  /** Distance from camera */
  distance: number;
  /** Normal at hit point (if available) */
  normal?: Vector3;
}

/**
 * Pick filter function
 */
export type PickFilter = (entity: Entity) => boolean;

/**
 * Picking system for selecting entities from screen coordinates.
 * Supports GPU and raycast picking modes with layer filtering
 * and configurable performance targets.
 *
 * @example
 * ```typescript
 * const picking = new PickingSystem(scene);
 * picking.setMode(PickMode.RAYCAST);
 *
 * // Pick entity at screen coordinates
 * const result = picking.pick(mouseX, mouseY, camera);
 * if (result) {
 *   console.log('Picked:', result.entity.name);
 *   Selection.select(result.entity);
 * }
 *
 * // Pick multiple entities in a rect
 * const results = picking.pickRect(x1, y1, x2, y2, camera);
 * Selection.selectMultiple(results.map(r => r.entity));
 * ```
 */
export class PickingSystem {
  private scene: Scene;
  private mode: PickMode = PickMode.AUTO;
  private gpuPicking: GPUPicking;
  private raycastPicking: RaycastPicking;

  private layerMask: number = 0xFFFFFFFF; // All layers
  private pickThroughTransparent: boolean = false;
  private maxDistance: number = Infinity;

  private performanceTarget: number = 1; // 1ms target
  private lastPickTime: number = 0;

  private filter: PickFilter | null = null;

  /**
   * Creates a new picking system
   * @param scene - Scene to pick from
   */
  constructor(scene: Scene) {
    this.scene = scene;
    this.gpuPicking = new GPUPicking(scene);
    this.raycastPicking = new RaycastPicking(scene);
  }

  /**
   * Sets the pick mode
   * @param mode - Pick mode to use
   */
  public setMode(mode: PickMode): void {
    this.mode = mode;
  }

  /**
   * Gets the current pick mode
   */
  public getMode(): PickMode {
    return this.mode;
  }

  /**
   * Sets the layer mask for filtering
   * @param mask - Layer mask (bitfield)
   */
  public setLayerMask(mask: number): void {
    this.layerMask = mask;
  }

  /**
   * Gets the layer mask
   */
  public getLayerMask(): number {
    return this.layerMask;
  }

  /**
   * Sets whether to pick through transparent objects
   * @param enabled - Pick through transparent
   */
  public setPickThroughTransparent(enabled: boolean): void {
    this.pickThroughTransparent = enabled;
  }

  /**
   * Sets the maximum pick distance
   * @param distance - Max distance
   */
  public setMaxDistance(distance: number): void {
    this.maxDistance = distance;
  }

  /**
   * Sets a custom pick filter
   * @param filter - Filter function or null to clear
   */
  public setFilter(filter: PickFilter | null): void {
    this.filter = filter;
  }

  /**
   * Picks an entity at screen coordinates
   * @param x - Screen X coordinate
   * @param y - Screen Y coordinate
   * @param camera - Camera to pick with
   * @returns Pick result or null if nothing picked
   */
  public pick(x: number, y: number, camera: Camera): PickResult | null {
    const startTime = performance.now();

    let result: PickResult | null = null;

    // Determine which picking method to use
    const actualMode = this.determinePickMode();

    switch (actualMode) {
      case PickMode.GPU:
        result = this.gpuPicking.pick(x, y, camera);
        break;

      case PickMode.RAYCAST:
        result = this.raycastPicking.pick(x, y, camera);
        break;
    }

    // Apply filtering
    if (result && !this.passesFilter(result.entity)) {
      result = null;
    }

    // Track performance
    this.lastPickTime = performance.now() - startTime;

    return result;
  }

  /**
   * Picks multiple entities in a rectangular region
   * @param x1 - Left edge
   * @param y1 - Top edge
   * @param x2 - Right edge
   * @param y2 - Bottom edge
   * @param camera - Camera to pick with
   * @returns Array of pick results
   */
  public pickRect(x1: number, y1: number, x2: number, y2: number, camera: Camera): PickResult[] {
    const results: PickResult[] = [];

    // Sample points in the rectangle
    const samplesX = Math.max(2, Math.ceil(Math.abs(x2 - x1) / 10));
    const samplesY = Math.max(2, Math.ceil(Math.abs(y2 - y1) / 10));

    const minX = Math.min(x1, x2);
    const maxX = Math.max(x1, x2);
    const minY = Math.min(y1, y2);
    const maxY = Math.max(y1, y2);

    const picked = new Set<Entity>();

    for (let i = 0; i < samplesX; i++) {
      for (let j = 0; j < samplesY; j++) {
        const x = minX + (maxX - minX) * (i / (samplesX - 1));
        const y = minY + (maxY - minY) * (j / (samplesY - 1));

        const result = this.pick(x, y, camera);
        if (result && !picked.has(result.entity)) {
          picked.add(result.entity);
          results.push(result);
        }
      }
    }

    return results;
  }

  /**
   * Picks all entities along a ray
   * @param x - Screen X coordinate
   * @param y - Screen Y coordinate
   * @param camera - Camera to pick with
   * @returns Array of all hit results sorted by distance
   */
  public pickAll(x: number, y: number, camera: Camera): PickResult[] {
    // Use raycast picking for this
    const results = this.raycastPicking.pickAll(x, y, camera);

    // Apply filtering
    return results.filter(result => this.passesFilter(result.entity));
  }

  /**
   * Picks entities using a custom ray
   * @param ray - Ray to use for picking
   * @param camera - Camera for context
   * @returns Pick result or null
   */
  public pickWithRay(ray: Ray, camera: Camera): PickResult | null {
    const result = this.raycastPicking.pickWithRay(ray);

    if (result && !this.passesFilter(result.entity)) {
      return null;
    }

    return result;
  }

  /**
   * Determines the actual pick mode to use
   */
  private determinePickMode(): PickMode {
    if (this.mode !== PickMode.AUTO) {
      return this.mode;
    }

    // Auto mode: choose based on scene complexity and performance
    const entityCount = this.scene.getEntities().length;

    // Use GPU picking for complex scenes
    if (entityCount > 100) {
      return PickMode.GPU;
    }

    // Use raycast for simple scenes (more accurate)
    return PickMode.RAYCAST;
  }

  /**
   * Checks if an entity passes the filter
   */
  private passesFilter(entity: Entity): boolean {
    // Check layer mask
    const layer = (entity as any).layer || 0;
    if (((1 << layer) & this.layerMask) === 0) {
      return false;
    }

    // Check custom filter
    if (this.filter && !this.filter(entity)) {
      return false;
    }

    // Check if entity is enabled
    if (!entity.enabled) {
      return false;
    }

    return true;
  }

  /**
   * Gets the last pick operation time in milliseconds
   */
  public getLastPickTime(): number {
    return this.lastPickTime;
  }

  /**
   * Checks if last pick met performance target
   */
  public metPerformanceTarget(): boolean {
    return this.lastPickTime <= this.performanceTarget;
  }

  /**
   * Sets the performance target in milliseconds
   * @param targetMs - Target time in milliseconds
   */
  public setPerformanceTarget(targetMs: number): void {
    this.performanceTarget = Math.max(0.1, targetMs);
  }

  /**
   * Creates a ray from screen coordinates
   * @param x - Screen X coordinate
   * @param y - Screen Y coordinate
   * @param camera - Camera to use
   * @returns Ray in world space
   */
  public screenToRay(x: number, y: number, camera: Camera): Ray {
    // Get camera's view and projection matrices
    const viewportWidth = 800; // Would come from actual viewport
    const viewportHeight = 600;

    // Convert screen to NDC
    const ndcX = (x / viewportWidth) * 2 - 1;
    const ndcY = -(y / viewportHeight) * 2 + 1;

    // Create ray from camera position through screen point
    const origin = camera.transform.position.clone();
    const direction = new Vector3(ndcX, ndcY, -1);

    // Transform by camera rotation
    direction.applyQuaternion(camera.transform.rotation);
    direction.normalize();

    return new Ray(origin, direction);
  }

  /**
   * Updates the picking system
   * @param deltaTime - Time since last update
   */
  public update(deltaTime: number): void {
    this.gpuPicking.update(deltaTime);
    this.raycastPicking.update(deltaTime);
  }

  /**
   * Disposes of the picking system
   */
  public dispose(): void {
    this.gpuPicking.dispose();
    this.raycastPicking.dispose();
  }
}
