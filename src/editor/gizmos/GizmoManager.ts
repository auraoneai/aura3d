/**
 * @fileoverview Gizmo manager for handling transform gizmos with space modes and snap settings.
 * @module editor/gizmos/GizmoManager
 */

import { Entity } from '../../ecs/Entity';
import { Transform } from '../../components/Transform';
import { Vector3 } from '../../math/Vector3';
import { Quaternion } from '../../math/Quaternion';
import { Camera } from '../../components/Camera';
import { TranslateGizmo } from './TranslateGizmo';
import { RotateGizmo } from './RotateGizmo';
import { ScaleGizmo } from './ScaleGizmo';
import { BoundsGizmo } from './BoundsGizmo';

/**
 * Gizmo type enumeration
 */
export enum GizmoType {
  TRANSLATE = 'translate',
  ROTATE = 'rotate',
  SCALE = 'scale',
  BOUNDS = 'bounds'
}

/**
 * Transform space mode
 */
export enum SpaceMode {
  LOCAL = 'local',
  WORLD = 'world'
}

/**
 * Pivot mode for multi-object transforms
 */
export enum PivotMode {
  INDIVIDUAL = 'individual',
  CENTER = 'center',
  ACTIVE = 'active'
}

/**
 * Base gizmo interface
 */
export interface IGizmo {
  /** Renders the gizmo */
  render(camera: Camera): void;
  /** Updates the gizmo */
  update(deltaTime: number): void;
  /** Handles mouse down */
  onMouseDown(x: number, y: number, camera: Camera): boolean;
  /** Handles mouse move */
  onMouseMove(x: number, y: number, camera: Camera): boolean;
  /** Handles mouse up */
  onMouseUp(x: number, y: number, camera: Camera): boolean;
  /** Sets the target entities */
  setTargets(entities: Entity[]): void;
  /** Gets if gizmo is active */
  isActive(): boolean;
  /** Disposes the gizmo */
  dispose(): void;
}

/**
 * Gizmo manager for handling transform gizmos with different modes and settings.
 *
 * @example
 * ```typescript
 * const manager = new GizmoManager();
 * manager.setActiveGizmo(GizmoType.TRANSLATE);
 * manager.setSpaceMode(SpaceMode.WORLD);
 * manager.setSnapEnabled(true);
 * manager.setSnapIncrement(1.0);
 *
 * // Attach to entities
 * manager.attachTo([entity]);
 *
 * // Update and render
 * manager.update(deltaTime);
 * manager.render(camera);
 * ```
 */
export class GizmoManager {
  private gizmos: Map<GizmoType, IGizmo> = new Map();
  private activeGizmo: IGizmo | null = null;
  private activeType: GizmoType | null = null;
  private targetEntities: Entity[] = [];

  private spaceMode: SpaceMode = SpaceMode.WORLD;
  private pivotMode: PivotMode = PivotMode.CENTER;

  private snapEnabled: boolean = false;
  private positionSnapIncrement: number = 1.0;
  private rotationSnapIncrement: number = 15.0; // degrees
  private scaleSnapIncrement: number = 0.1;

  private visible: boolean = true;
  private size: number = 1.0;
  private opacity: number = 1.0;

  private listeners: Map<string, Set<Function>> = new Map();

  /**
   * Creates a new gizmo manager
   */
  constructor() {
    this.initializeGizmos();
  }

  /**
   * Initializes all gizmo types
   */
  private initializeGizmos(): void {
    this.gizmos.set(GizmoType.TRANSLATE, new TranslateGizmo(this));
    this.gizmos.set(GizmoType.ROTATE, new RotateGizmo(this));
    this.gizmos.set(GizmoType.SCALE, new ScaleGizmo(this));
    this.gizmos.set(GizmoType.BOUNDS, new BoundsGizmo(this));
  }

  /**
   * Sets the active gizmo type
   * @param type - Gizmo type to activate
   */
  public setActiveGizmo(type: GizmoType | null): void {
    if (this.activeType === type) return;

    this.activeType = type;
    this.activeGizmo = type ? this.gizmos.get(type) || null : null;

    if (this.activeGizmo) {
      this.activeGizmo.setTargets(this.targetEntities);
    }

    this.emit('gizmoChanged', { type });
  }

  /**
   * Gets the active gizmo type
   */
  public getActiveGizmoType(): GizmoType | null {
    return this.activeType;
  }

  /**
   * Gets the active gizmo instance
   */
  public getActiveGizmo(): IGizmo | null {
    return this.activeGizmo;
  }

  /**
   * Attaches gizmo to entities
   * @param entities - Entities to attach to
   */
  public attachTo(entities: Entity | Entity[]): void {
    this.targetEntities = Array.isArray(entities) ? entities : [entities];

    if (this.activeGizmo) {
      this.activeGizmo.setTargets(this.targetEntities);
    }

    this.emit('attached', { entities: this.targetEntities });
  }

  /**
   * Detaches gizmo from all entities
   */
  public detach(): void {
    this.targetEntities = [];

    if (this.activeGizmo) {
      this.activeGizmo.setTargets([]);
    }

    this.emit('detached', {});
  }

  /**
   * Gets the target entities
   */
  public getTargets(): Entity[] {
    return [...this.targetEntities];
  }

  /**
   * Sets the transform space mode
   * @param mode - Space mode (local or world)
   */
  public setSpaceMode(mode: SpaceMode): void {
    if (this.spaceMode === mode) return;

    this.spaceMode = mode;
    this.emit('spaceModeChanged', { mode });
  }

  /**
   * Gets the transform space mode
   */
  public getSpaceMode(): SpaceMode {
    return this.spaceMode;
  }

  /**
   * Toggles between local and world space
   */
  public toggleSpaceMode(): void {
    this.setSpaceMode(
      this.spaceMode === SpaceMode.LOCAL ? SpaceMode.WORLD : SpaceMode.LOCAL
    );
  }

  /**
   * Sets the pivot mode
   * @param mode - Pivot mode
   */
  public setPivotMode(mode: PivotMode): void {
    if (this.pivotMode === mode) return;

    this.pivotMode = mode;
    this.emit('pivotModeChanged', { mode });
  }

  /**
   * Gets the pivot mode
   */
  public getPivotMode(): PivotMode {
    return this.pivotMode;
  }

  /**
   * Calculates the pivot point based on current settings
   */
  public getPivotPoint(): Vector3 | null {
    if (this.targetEntities.length === 0) {
      return null;
    }

    switch (this.pivotMode) {
      case PivotMode.CENTER:
        return this.calculateCenterPivot();

      case PivotMode.ACTIVE:
        return this.calculateActivePivot();

      case PivotMode.INDIVIDUAL:
        return this.calculateCenterPivot(); // Fallback to center

      default:
        return this.calculateCenterPivot();
    }
  }

  /**
   * Calculates center pivot of all targets
   */
  private calculateCenterPivot(): Vector3 {
    const center = new Vector3();
    let count = 0;

    this.targetEntities.forEach(entity => {
      const transform = entity.getComponent(Transform);
      if (transform) {
        center.add(transform.position);
        count++;
      }
    });

    if (count > 0) {
      center.scaleInPlace(1 / count);
    }

    return center;
  }

  /**
   * Calculates active entity pivot
   */
  private calculateActivePivot(): Vector3 {
    const activeEntity = this.targetEntities[this.targetEntities.length - 1];
    if (activeEntity) {
      const transform = activeEntity.getComponent(Transform);
      if (transform) {
        return transform.position.clone();
      }
    }
    return this.calculateCenterPivot();
  }

  /**
   * Gets the orientation for the gizmo
   */
  public getOrientation(): Quaternion {
    if (this.spaceMode === SpaceMode.WORLD) {
      return new Quaternion(); // Identity quaternion
    }

    // Local space - use active entity's rotation
    const activeEntity = this.targetEntities[this.targetEntities.length - 1];
    if (activeEntity) {
      const transform = activeEntity.getComponent(Transform);
      if (transform) {
        return transform.rotation.clone();
      }
    }

    return new Quaternion();
  }

  /**
   * Sets snap enabled state
   * @param enabled - Whether snapping is enabled
   */
  public setSnapEnabled(enabled: boolean): void {
    this.snapEnabled = enabled;
    this.emit('snapChanged', { enabled });
  }

  /**
   * Gets snap enabled state
   */
  public isSnapEnabled(): boolean {
    return this.snapEnabled;
  }

  /**
   * Sets position snap increment
   * @param increment - Snap increment
   */
  public setSnapIncrement(increment: number): void {
    this.positionSnapIncrement = Math.max(0.001, increment);
    this.emit('snapChanged', { positionIncrement: this.positionSnapIncrement });
  }

  /**
   * Gets position snap increment
   */
  public getSnapIncrement(): number {
    return this.positionSnapIncrement;
  }

  /**
   * Sets rotation snap increment in degrees
   * @param degrees - Snap increment in degrees
   */
  public setRotationSnapIncrement(degrees: number): void {
    this.rotationSnapIncrement = Math.max(1, degrees);
    this.emit('snapChanged', { rotationIncrement: this.rotationSnapIncrement });
  }

  /**
   * Gets rotation snap increment in degrees
   */
  public getRotationSnapIncrement(): number {
    return this.rotationSnapIncrement;
  }

  /**
   * Sets scale snap increment
   * @param increment - Snap increment
   */
  public setScaleSnapIncrement(increment: number): void {
    this.scaleSnapIncrement = Math.max(0.001, increment);
    this.emit('snapChanged', { scaleIncrement: this.scaleSnapIncrement });
  }

  /**
   * Gets scale snap increment
   */
  public getScaleSnapIncrement(): number {
    return this.scaleSnapIncrement;
  }

  /**
   * Snaps a position value
   */
  public snapPosition(value: number): number {
    if (!this.snapEnabled) return value;
    return Math.round(value / this.positionSnapIncrement) * this.positionSnapIncrement;
  }

  /**
   * Snaps a rotation value in radians
   */
  public snapRotation(radians: number): number {
    if (!this.snapEnabled) return radians;
    const snapRad = (this.rotationSnapIncrement * Math.PI) / 180;
    return Math.round(radians / snapRad) * snapRad;
  }

  /**
   * Snaps a scale value
   */
  public snapScale(value: number): number {
    if (!this.snapEnabled) return value;
    return Math.round(value / this.scaleSnapIncrement) * this.scaleSnapIncrement;
  }

  /**
   * Sets gizmo visibility
   * @param visible - Whether gizmo is visible
   */
  public setVisible(visible: boolean): void {
    this.visible = visible;
  }

  /**
   * Gets gizmo visibility
   */
  public isVisible(): boolean {
    return this.visible;
  }

  /**
   * Sets gizmo size
   * @param size - Size multiplier
   */
  public setSize(size: number): void {
    this.size = Math.max(0.1, size);
  }

  /**
   * Gets gizmo size
   */
  public getSize(): number {
    return this.size;
  }

  /**
   * Sets gizmo opacity
   * @param opacity - Opacity (0-1)
   */
  public setOpacity(opacity: number): void {
    this.opacity = Math.max(0, Math.min(1, opacity));
  }

  /**
   * Gets gizmo opacity
   */
  public getOpacity(): number {
    return this.opacity;
  }

  /**
   * Updates the active gizmo
   * @param deltaTime - Time since last update
   */
  public update(deltaTime: number): void {
    if (this.activeGizmo && this.visible) {
      this.activeGizmo.update(deltaTime);
    }
  }

  /**
   * Renders the active gizmo
   * @param camera - Camera to render with
   */
  public render(camera: Camera): void {
    if (this.activeGizmo && this.visible) {
      this.activeGizmo.render(camera);
    }
  }

  /**
   * Handles mouse down event
   */
  public onMouseDown(x: number, y: number, camera: Camera): boolean {
    if (this.activeGizmo && this.visible) {
      return this.activeGizmo.onMouseDown(x, y, camera);
    }
    return false;
  }

  /**
   * Handles mouse move event
   */
  public onMouseMove(x: number, y: number, camera: Camera): boolean {
    if (this.activeGizmo && this.visible) {
      return this.activeGizmo.onMouseMove(x, y, camera);
    }
    return false;
  }

  /**
   * Handles mouse up event
   */
  public onMouseUp(x: number, y: number, camera: Camera): boolean {
    if (this.activeGizmo && this.visible) {
      return this.activeGizmo.onMouseUp(x, y, camera);
    }
    return false;
  }

  /**
   * Checks if any gizmo is currently active/dragging
   */
  public isActive(): boolean {
    return this.activeGizmo ? this.activeGizmo.isActive() : false;
  }

  /**
   * Registers an event listener
   */
  public on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * Unregisters an event listener
   */
  public off(event: string, callback: Function): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * Emits an event
   */
  private emit(event: string, data: any): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(callback => callback(data));
    }
  }

  /**
   * Disposes of the gizmo manager
   */
  public dispose(): void {
    this.gizmos.forEach(gizmo => gizmo.dispose());
    this.gizmos.clear();
    this.listeners.clear();
    this.targetEntities = [];
    this.activeGizmo = null;
  }
}
