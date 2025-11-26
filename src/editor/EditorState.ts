/**
 * @fileoverview Editor state management for current selection, active tool,
 * viewport settings, grid/snap settings, and preferences.
 * @module editor/EditorState
 */

import { Entity } from '../ecs/Entity';
import { Vector3 } from '../math/Vector3';
import { Quaternion } from '../math/Quaternion';

/**
 * Editor tool enumeration
 */
export enum EditorTool {
  SELECT = 'select',
  TRANSLATE = 'translate',
  ROTATE = 'rotate',
  SCALE = 'scale',
  RECT_SELECT = 'rect_select'
}

/**
 * Transform space mode
 */
export enum TransformSpace {
  LOCAL = 'local',
  WORLD = 'world'
}

/**
 * Pivot mode for multi-object transforms
 */
export enum PivotMode {
  /** Individual pivots for each object */
  INDIVIDUAL = 'individual',
  /** Center of all objects */
  CENTER = 'center',
  /** Active object pivot */
  ACTIVE = 'active'
}

/**
 * Viewport settings interface
 */
export interface ViewportSettings {
  /** Show grid */
  showGrid: boolean;
  /** Grid size */
  gridSize: number;
  /** Grid subdivisions */
  gridSubdivisions: number;
  /** Show axis gizmo */
  showAxisGizmo: boolean;
  /** Show statistics */
  showStats: boolean;
  /** Show wireframe */
  showWireframe: boolean;
  /** Show bounds */
  showBounds: boolean;
  /** Show lights */
  showLights: boolean;
  /** Show cameras */
  showCameras: boolean;
  /** Field of view */
  fov: number;
  /** Near clip plane */
  near: number;
  /** Far clip plane */
  far: number;
}

/**
 * Grid and snap settings interface
 */
export interface GridSnapSettings {
  /** Snap to grid enabled */
  snapToGrid: boolean;
  /** Position snap increment */
  positionSnap: number;
  /** Rotation snap enabled */
  rotationSnapEnabled: boolean;
  /** Rotation snap in degrees */
  rotationSnap: number;
  /** Scale snap enabled */
  scaleSnapEnabled: boolean;
  /** Scale snap increment */
  scaleSnap: number;
}

/**
 * State change event
 */
export interface StateChangeEvent {
  /** Property that changed */
  property: string;
  /** Old value */
  oldValue: any;
  /** New value */
  newValue: any;
}

/**
 * Editor state manager for tracking selection, active tool,
 * viewport settings, and editor preferences with persistence.
 *
 * @example
 * ```typescript
 * const state = new EditorState();
 * state.setActiveTool(EditorTool.TRANSLATE);
 * state.setTransformSpace(TransformSpace.WORLD);
 * state.setViewportSetting('showGrid', true);
 *
 * // Listen for changes
 * state.on('changed', (event) => {
 *   console.log(`${event.property} changed to ${event.newValue}`);
 * });
 * ```
 */
export class EditorState {
  private activeTool: EditorTool = EditorTool.SELECT;
  private transformSpace: TransformSpace = TransformSpace.WORLD;
  private pivotMode: PivotMode = PivotMode.CENTER;

  private viewportSettings: ViewportSettings = {
    showGrid: true,
    gridSize: 10,
    gridSubdivisions: 10,
    showAxisGizmo: true,
    showStats: true,
    showWireframe: false,
    showBounds: false,
    showLights: true,
    showCameras: true,
    fov: 60,
    near: 0.1,
    far: 1000
  };

  private gridSnapSettings: GridSnapSettings = {
    snapToGrid: false,
    positionSnap: 1,
    rotationSnapEnabled: false,
    rotationSnap: 15,
    scaleSnapEnabled: false,
    scaleSnap: 0.1
  };

  private mousePosition: Vector3 = new Vector3();
  private hoveredEntity: Entity | null = null;
  private isDragging: boolean = false;
  private lastUpdateTime: number = 0;

  private listeners: Map<string, Set<Function>> = new Map();

  /**
   * Creates a new editor state manager
   */
  constructor() {
    this.loadState();
  }

  /**
   * Gets the active tool
   */
  public getActiveTool(): EditorTool {
    return this.activeTool;
  }

  /**
   * Sets the active tool
   * @param tool - Tool to activate
   */
  public setActiveTool(tool: EditorTool): void {
    if (this.activeTool === tool) return;

    const oldValue = this.activeTool;
    this.activeTool = tool;
    this.emit('changed', { property: 'activeTool', oldValue, newValue: tool });
    this.saveState();
  }

  /**
   * Gets the transform space mode
   */
  public getTransformSpace(): TransformSpace {
    return this.transformSpace;
  }

  /**
   * Sets the transform space mode
   * @param space - Transform space
   */
  public setTransformSpace(space: TransformSpace): void {
    if (this.transformSpace === space) return;

    const oldValue = this.transformSpace;
    this.transformSpace = space;
    this.emit('changed', { property: 'transformSpace', oldValue, newValue: space });
    this.saveState();
  }

  /**
   * Toggles between local and world space
   */
  public toggleTransformSpace(): void {
    this.setTransformSpace(
      this.transformSpace === TransformSpace.LOCAL
        ? TransformSpace.WORLD
        : TransformSpace.LOCAL
    );
  }

  /**
   * Gets the pivot mode
   */
  public getPivotMode(): PivotMode {
    return this.pivotMode;
  }

  /**
   * Sets the pivot mode
   * @param mode - Pivot mode
   */
  public setPivotMode(mode: PivotMode): void {
    if (this.pivotMode === mode) return;

    const oldValue = this.pivotMode;
    this.pivotMode = mode;
    this.emit('changed', { property: 'pivotMode', oldValue, newValue: mode });
    this.saveState();
  }

  /**
   * Gets viewport settings
   */
  public getViewportSettings(): Readonly<ViewportSettings> {
    return { ...this.viewportSettings };
  }

  /**
   * Sets a viewport setting
   */
  public setViewportSetting<K extends keyof ViewportSettings>(
    key: K,
    value: ViewportSettings[K]
  ): void {
    if (this.viewportSettings[key] === value) return;

    const oldValue = this.viewportSettings[key];
    this.viewportSettings[key] = value;
    this.emit('changed', { property: `viewport.${key}`, oldValue, newValue: value });
    this.saveState();
  }

  /**
   * Gets grid and snap settings
   */
  public getGridSnapSettings(): Readonly<GridSnapSettings> {
    return { ...this.gridSnapSettings };
  }

  /**
   * Sets a grid/snap setting
   */
  public setGridSnapSetting<K extends keyof GridSnapSettings>(
    key: K,
    value: GridSnapSettings[K]
  ): void {
    if (this.gridSnapSettings[key] === value) return;

    const oldValue = this.gridSnapSettings[key];
    this.gridSnapSettings[key] = value;
    this.emit('changed', { property: `gridSnap.${key}`, oldValue, newValue: value });
    this.saveState();
  }

  /**
   * Snaps a position value to grid
   * @param value - Value to snap
   * @returns Snapped value
   */
  public snapPosition(value: number): number {
    if (!this.gridSnapSettings.snapToGrid) {
      return value;
    }
    const snap = this.gridSnapSettings.positionSnap;
    return Math.round(value / snap) * snap;
  }

  /**
   * Snaps a position vector to grid
   * @param position - Position to snap
   * @returns Snapped position
   */
  public snapPositionVector(position: Vector3): Vector3 {
    return new Vector3(
      this.snapPosition(position.x),
      this.snapPosition(position.y),
      this.snapPosition(position.z)
    );
  }

  /**
   * Snaps a rotation angle to increment
   * @param angle - Angle in radians
   * @returns Snapped angle in radians
   */
  public snapRotation(angle: number): number {
    if (!this.gridSnapSettings.rotationSnapEnabled) {
      return angle;
    }
    const snapDeg = this.gridSnapSettings.rotationSnap;
    const snapRad = (snapDeg * Math.PI) / 180;
    return Math.round(angle / snapRad) * snapRad;
  }

  /**
   * Snaps a scale value to increment
   * @param value - Scale value to snap
   * @returns Snapped scale value
   */
  public snapScale(value: number): number {
    if (!this.gridSnapSettings.scaleSnapEnabled) {
      return value;
    }
    const snap = this.gridSnapSettings.scaleSnap;
    return Math.round(value / snap) * snap;
  }

  /**
   * Gets the current mouse position in world space
   */
  public getMousePosition(): Vector3 {
    return this.mousePosition.clone();
  }

  /**
   * Sets the mouse position in world space
   * @param position - Mouse position
   */
  public setMousePosition(position: Vector3): void {
    this.mousePosition.copy(position);
  }

  /**
   * Gets the currently hovered entity
   */
  public getHoveredEntity(): Entity | null {
    return this.hoveredEntity;
  }

  /**
   * Sets the currently hovered entity
   * @param entity - Hovered entity or null
   */
  public setHoveredEntity(entity: Entity | null): void {
    if (this.hoveredEntity === entity) return;

    const oldValue = this.hoveredEntity;
    this.hoveredEntity = entity;
    this.emit('changed', { property: 'hoveredEntity', oldValue, newValue: entity });
  }

  /**
   * Gets whether user is currently dragging
   */
  public getIsDragging(): boolean {
    return this.isDragging;
  }

  /**
   * Sets the dragging state
   * @param dragging - Whether dragging
   */
  public setIsDragging(dragging: boolean): void {
    if (this.isDragging === dragging) return;

    const oldValue = this.isDragging;
    this.isDragging = dragging;
    this.emit('changed', { property: 'isDragging', oldValue, newValue: dragging });
  }

  /**
   * Updates editor state
   * @param deltaTime - Time since last update
   */
  public update(deltaTime: number): void {
    this.lastUpdateTime += deltaTime;
  }

  /**
   * Gets time since editor state was created
   */
  public getUptime(): number {
    return this.lastUpdateTime;
  }

  /**
   * Saves state to persistent storage
   */
  private saveState(): void {
    try {
      const state = {
        activeTool: this.activeTool,
        transformSpace: this.transformSpace,
        pivotMode: this.pivotMode,
        viewportSettings: this.viewportSettings,
        gridSnapSettings: this.gridSnapSettings
      };
      localStorage.setItem('editor:state', JSON.stringify(state));
    } catch (error) {
      console.error('Failed to save editor state:', error);
    }
  }

  /**
   * Loads state from persistent storage
   */
  private loadState(): void {
    try {
      const stored = localStorage.getItem('editor:state');
      if (stored) {
        const state = JSON.parse(stored);
        this.activeTool = state.activeTool || this.activeTool;
        this.transformSpace = state.transformSpace || this.transformSpace;
        this.pivotMode = state.pivotMode || this.pivotMode;
        this.viewportSettings = { ...this.viewportSettings, ...state.viewportSettings };
        this.gridSnapSettings = { ...this.gridSnapSettings, ...state.gridSnapSettings };
      }
    } catch (error) {
      console.error('Failed to load editor state:', error);
    }
  }

  /**
   * Resets state to defaults
   */
  public reset(): void {
    this.activeTool = EditorTool.SELECT;
    this.transformSpace = TransformSpace.WORLD;
    this.pivotMode = PivotMode.CENTER;

    this.viewportSettings = {
      showGrid: true,
      gridSize: 10,
      gridSubdivisions: 10,
      showAxisGizmo: true,
      showStats: true,
      showWireframe: false,
      showBounds: false,
      showLights: true,
      showCameras: true,
      fov: 60,
      near: 0.1,
      far: 1000
    };

    this.gridSnapSettings = {
      snapToGrid: false,
      positionSnap: 1,
      rotationSnapEnabled: false,
      rotationSnap: 15,
      scaleSnapEnabled: false,
      scaleSnap: 0.1
    };

    this.saveState();
    this.emit('reset', {});
  }

  /**
   * Registers an event listener
   * @param event - Event name
   * @param callback - Callback function
   */
  public on(event: string, callback: Function): void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)!.add(callback);
  }

  /**
   * Unregisters an event listener
   * @param event - Event name
   * @param callback - Callback function
   */
  public off(event: string, callback: Function): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.delete(callback);
    }
  }

  /**
   * Emits an event
   * @param event - Event name
   * @param data - Event data
   */
  private emit(event: string, data: any): void {
    const listeners = this.listeners.get(event);
    if (listeners) {
      listeners.forEach(callback => callback(data));
    }
  }

  /**
   * Disposes of the editor state
   */
  public dispose(): void {
    this.listeners.clear();
  }
}
