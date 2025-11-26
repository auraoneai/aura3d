/**
 * @fileoverview Editor engine wrapper providing edit mode vs play mode switching,
 * scene management, auto-save, and editor-specific functionality.
 * @module editor/EditorEngine
 */

import { Engine } from '../core/Engine';
import { Scene } from '../scene/Scene';
import { Entity } from '../ecs/Entity';
import { EditorState } from './EditorState';
import { Selection } from './Selection';
import { History } from './History';

/**
 * Editor mode enumeration
 */
export enum EditorMode {
  EDIT = 'edit',
  PLAY = 'play'
}

/**
 * Editor plugin interface
 */
export interface IEditorPlugin {
  /** Plugin name */
  name: string;
  /** Initialize plugin */
  initialize(editor: EditorEngine): void;
  /** Cleanup plugin */
  dispose(): void;
  /** Update plugin */
  update?(deltaTime: number): void;
}

/**
 * Editor preferences interface
 */
export interface EditorPreferences {
  /** Auto-save enabled */
  autoSaveEnabled: boolean;
  /** Auto-save interval in seconds */
  autoSaveInterval: number;
  /** Grid visible */
  showGrid: boolean;
  /** Grid size */
  gridSize: number;
  /** Snap to grid */
  snapToGrid: boolean;
  /** Snap increment */
  snapIncrement: number;
  /** Angle snap enabled */
  angleSnap: boolean;
  /** Angle snap increment in degrees */
  angleSnapIncrement: number;
  /** Show gizmos */
  showGizmos: boolean;
  /** Gizmo size */
  gizmoSize: number;
  /** Show icons */
  showIcons: boolean;
  /** Undo limit */
  undoLimit: number;
}

/**
 * Scene snapshot for play mode
 */
interface SceneSnapshot {
  /** Scene JSON data */
  data: string;
  /** Snapshot timestamp */
  timestamp: number;
}

/**
 * Editor engine wrapper providing edit/play mode switching,
 * scene management, auto-save functionality, and plugin system.
 *
 * @example
 * ```typescript
 * const editor = new EditorEngine(engine);
 * editor.setPreference('autoSaveEnabled', true);
 * editor.registerPlugin(myPlugin);
 *
 * // Enter play mode
 * editor.enterPlayMode();
 *
 * // Exit play mode
 * editor.exitPlayMode();
 * ```
 */
export class EditorEngine {
  private engine: Engine;
  private state: EditorState;
  private mode: EditorMode = EditorMode.EDIT;
  private playModeSnapshot: SceneSnapshot | null = null;
  private plugins: Map<string, IEditorPlugin> = new Map();
  private preferences: EditorPreferences;
  private autoSaveTimer: number | null = null;
  private lastSaveTime: number = 0;
  private isDirty: boolean = false;

  /**
   * Creates a new editor engine
   * @param engine - The game engine instance
   * @param state - Optional editor state instance
   */
  constructor(engine: Engine, state?: EditorState) {
    this.engine = engine;
    this.state = state || new EditorState();

    // Initialize default preferences
    this.preferences = {
      autoSaveEnabled: true,
      autoSaveInterval: 300, // 5 minutes
      showGrid: true,
      gridSize: 10,
      snapToGrid: false,
      snapIncrement: 1,
      angleSnap: false,
      angleSnapIncrement: 15,
      showGizmos: true,
      gizmoSize: 1,
      showIcons: true,
      undoLimit: 50
    };

    // Load preferences from storage
    this.loadPreferences();

    // Setup auto-save
    if (this.preferences.autoSaveEnabled) {
      this.startAutoSave();
    }

    // Track changes for dirty flag
    this.setupChangeTracking();
  }

  /**
   * Gets the current editor mode
   */
  public getMode(): EditorMode {
    return this.mode;
  }

  /**
   * Checks if editor is in edit mode
   */
  public isEditMode(): boolean {
    return this.mode === EditorMode.EDIT;
  }

  /**
   * Checks if editor is in play mode
   */
  public isPlayMode(): boolean {
    return this.mode === EditorMode.PLAY;
  }

  /**
   * Enters play mode - takes snapshot of scene and starts simulation
   */
  public enterPlayMode(): void {
    if (this.mode === EditorMode.PLAY) {
      console.warn('Already in play mode');
      return;
    }

    // Take snapshot of current scene state
    this.playModeSnapshot = this.createSceneSnapshot();

    // Clear selection
    Selection.clear();

    // Switch mode
    this.mode = EditorMode.PLAY;

    // Start physics and other runtime systems
    this.engine.getPhysicsSystem()?.start();

    // Notify plugins
    this.plugins.forEach(plugin => {
      if (plugin.update) {
        // Plugins can react to mode change
      }
    });

    console.log('Entered play mode');
  }

  /**
   * Exits play mode - restores scene snapshot
   */
  public exitPlayMode(): void {
    if (this.mode === EditorMode.EDIT) {
      console.warn('Already in edit mode');
      return;
    }

    // Stop physics
    this.engine.getPhysicsSystem()?.stop();

    // Restore scene from snapshot
    if (this.playModeSnapshot) {
      this.restoreSceneSnapshot(this.playModeSnapshot);
      this.playModeSnapshot = null;
    }

    // Switch mode
    this.mode = EditorMode.EDIT;

    // Clear runtime state
    History.clear();

    console.log('Exited play mode');
  }

  /**
   * Creates a snapshot of the current scene
   */
  private createSceneSnapshot(): SceneSnapshot {
    const scene = this.engine.getActiveScene();
    if (!scene) {
      throw new Error('No active scene to snapshot');
    }

    return {
      data: JSON.stringify(scene.serialize()),
      timestamp: Date.now()
    };
  }

  /**
   * Restores scene from a snapshot
   */
  private restoreSceneSnapshot(snapshot: SceneSnapshot): void {
    const scene = this.engine.getActiveScene();
    if (!scene) {
      throw new Error('No active scene to restore');
    }

    const data = JSON.parse(snapshot.data);
    scene.deserialize(data);
  }

  /**
   * Saves the current scene
   * @param path - Optional file path to save to
   */
  public async saveScene(path?: string): Promise<void> {
    const scene = this.engine.getActiveScene();
    if (!scene) {
      throw new Error('No active scene to save');
    }

    const data = scene.serialize();
    const json = JSON.stringify(data, null, 2);

    if (path) {
      // In a real implementation, this would write to file system
      // For now, we'll use localStorage as an example
      try {
        localStorage.setItem(`scene:${path}`, json);
        this.lastSaveTime = Date.now();
        this.isDirty = false;
        console.log(`Scene saved to ${path}`);
      } catch (error) {
        console.error('Failed to save scene:', error);
        throw error;
      }
    } else {
      // Save to default location
      const defaultPath = scene.name || 'untitled';
      await this.saveScene(defaultPath);
    }
  }

  /**
   * Loads a scene from storage
   * @param path - File path to load from
   */
  public async loadScene(path: string): Promise<void> {
    try {
      const json = localStorage.getItem(`scene:${path}`);
      if (!json) {
        throw new Error(`Scene not found: ${path}`);
      }

      const data = JSON.parse(json);
      const scene = this.engine.getActiveScene();
      if (!scene) {
        throw new Error('No active scene');
      }

      scene.deserialize(data);
      this.isDirty = false;
      console.log(`Scene loaded from ${path}`);
    } catch (error) {
      console.error('Failed to load scene:', error);
      throw error;
    }
  }

  /**
   * Creates a new empty scene
   * @param name - Scene name
   */
  public newScene(name: string = 'New Scene'): Scene {
    const scene = new Scene(name);
    this.engine.setActiveScene(scene);
    this.isDirty = false;
    History.clear();
    Selection.clear();
    return scene;
  }

  /**
   * Gets editor preferences
   */
  public getPreferences(): Readonly<EditorPreferences> {
    return { ...this.preferences };
  }

  /**
   * Sets a preference value
   */
  public setPreference<K extends keyof EditorPreferences>(
    key: K,
    value: EditorPreferences[K]
  ): void {
    this.preferences[key] = value;
    this.savePreferences();

    // Handle preference changes
    if (key === 'autoSaveEnabled') {
      if (value) {
        this.startAutoSave();
      } else {
        this.stopAutoSave();
      }
    } else if (key === 'autoSaveInterval') {
      if (this.preferences.autoSaveEnabled) {
        this.stopAutoSave();
        this.startAutoSave();
      }
    } else if (key === 'undoLimit') {
      History.setLimit(value as number);
    }
  }

  /**
   * Loads preferences from storage
   */
  private loadPreferences(): void {
    try {
      const stored = localStorage.getItem('editor:preferences');
      if (stored) {
        const loaded = JSON.parse(stored);
        this.preferences = { ...this.preferences, ...loaded };
      }
    } catch (error) {
      console.error('Failed to load preferences:', error);
    }
  }

  /**
   * Saves preferences to storage
   */
  private savePreferences(): void {
    try {
      localStorage.setItem('editor:preferences', JSON.stringify(this.preferences));
    } catch (error) {
      console.error('Failed to save preferences:', error);
    }
  }

  /**
   * Starts auto-save timer
   */
  private startAutoSave(): void {
    if (this.autoSaveTimer !== null) {
      return;
    }

    this.autoSaveTimer = window.setInterval(() => {
      if (this.isDirty && this.mode === EditorMode.EDIT) {
        this.autoSave();
      }
    }, this.preferences.autoSaveInterval * 1000);
  }

  /**
   * Stops auto-save timer
   */
  private stopAutoSave(): void {
    if (this.autoSaveTimer !== null) {
      clearInterval(this.autoSaveTimer);
      this.autoSaveTimer = null;
    }
  }

  /**
   * Performs auto-save
   */
  private async autoSave(): Promise<void> {
    try {
      const scene = this.engine.getActiveScene();
      if (!scene) return;

      const autoSavePath = `${scene.name}_autosave`;
      await this.saveScene(autoSavePath);
      console.log('Auto-save completed');
    } catch (error) {
      console.error('Auto-save failed:', error);
    }
  }

  /**
   * Sets up change tracking for dirty flag
   */
  private setupChangeTracking(): void {
    // Track history changes
    History.on('execute', () => {
      this.isDirty = true;
    });

    // Track selection changes that modify state
    Selection.on('changed', () => {
      // Selection alone doesn't make scene dirty
    });
  }

  /**
   * Registers an editor plugin
   * @param plugin - Plugin to register
   */
  public registerPlugin(plugin: IEditorPlugin): void {
    if (this.plugins.has(plugin.name)) {
      console.warn(`Plugin ${plugin.name} already registered`);
      return;
    }

    this.plugins.set(plugin.name, plugin);
    plugin.initialize(this);
    console.log(`Plugin registered: ${plugin.name}`);
  }

  /**
   * Unregisters an editor plugin
   * @param name - Plugin name
   */
  public unregisterPlugin(name: string): void {
    const plugin = this.plugins.get(name);
    if (plugin) {
      plugin.dispose();
      this.plugins.delete(name);
      console.log(`Plugin unregistered: ${name}`);
    }
  }

  /**
   * Gets a registered plugin
   * @param name - Plugin name
   */
  public getPlugin(name: string): IEditorPlugin | undefined {
    return this.plugins.get(name);
  }

  /**
   * Updates editor and plugins
   * @param deltaTime - Time since last update in seconds
   */
  public update(deltaTime: number): void {
    // Update plugins
    this.plugins.forEach(plugin => {
      if (plugin.update) {
        plugin.update(deltaTime);
      }
    });

    // Update state
    this.state.update(deltaTime);
  }

  /**
   * Gets the editor state
   */
  public getState(): EditorState {
    return this.state;
  }

  /**
   * Gets the game engine
   */
  public getEngine(): Engine {
    return this.engine;
  }

  /**
   * Checks if scene has unsaved changes
   */
  public isDirtyScene(): boolean {
    return this.isDirty;
  }

  /**
   * Marks scene as dirty
   */
  public markDirty(): void {
    this.isDirty = true;
  }

  /**
   * Gets time since last save in seconds
   */
  public getTimeSinceLastSave(): number {
    if (this.lastSaveTime === 0) {
      return 0;
    }
    return (Date.now() - this.lastSaveTime) / 1000;
  }

  /**
   * Disposes of the editor engine
   */
  public dispose(): void {
    this.stopAutoSave();

    // Dispose plugins
    this.plugins.forEach(plugin => plugin.dispose());
    this.plugins.clear();

    // Exit play mode if active
    if (this.mode === EditorMode.PLAY) {
      this.exitPlayMode();
    }
  }
}
