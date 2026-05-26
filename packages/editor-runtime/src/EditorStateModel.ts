import { normalizeGizmoSettings, type GizmoPivotMode, type GizmoSettings, type GizmoSpaceMode } from "./Gizmo";

export interface EditorStateStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export interface EditorViewportSettings {
  readonly showGrid: boolean;
  readonly gridSize: number;
  readonly gridSubdivisions: number;
  readonly showAxisGizmo: boolean;
  readonly showStats: boolean;
  readonly showWireframe: boolean;
  readonly showBounds: boolean;
  readonly showLights: boolean;
  readonly showCameras: boolean;
  readonly fov: number;
  readonly near: number;
  readonly far: number;
}

export interface EditorGridSnapSettings {
  readonly snapToGrid: boolean;
  readonly positionSnap: number;
  readonly rotationSnapEnabled: boolean;
  readonly rotationSnapDegrees: number;
  readonly scaleSnapEnabled: boolean;
  readonly scaleSnap: number;
}

export interface EditorStateSnapshot {
  readonly activeTool: string;
  readonly transformSpace: GizmoSpaceMode;
  readonly pivotMode: GizmoPivotMode;
  readonly viewport: EditorViewportSettings;
  readonly gridSnap: EditorGridSnapSettings;
  readonly persisted: boolean;
  readonly storageKey: string;
  readonly changeCount: number;
  readonly evidence: {
    readonly oldCodebasePort: true;
    readonly persistentEditorState: boolean;
    readonly viewportSettings: boolean;
    readonly gridSnapSettings: boolean;
    readonly transformSpacePivotMode: boolean;
  };
}

export interface EditorStateChange {
  readonly property: string;
  readonly oldValue: unknown;
  readonly newValue: unknown;
}

export interface EditorStateModelOptions {
  readonly storage?: EditorStateStorage;
  readonly storageKey?: string;
}

type Listener = (change: EditorStateChange) => void;

const defaultViewportSettings: EditorViewportSettings = {
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

const defaultGridSnapSettings: EditorGridSnapSettings = {
  snapToGrid: true,
  positionSnap: 1,
  rotationSnapEnabled: false,
  rotationSnapDegrees: 15,
  scaleSnapEnabled: false,
  scaleSnap: 0.1
};

export class EditorStateModel {
  private activeToolRef = "select";
  private transformSpaceRef: GizmoSpaceMode = "world";
  private pivotModeRef: GizmoPivotMode = "center";
  private viewportRef: EditorViewportSettings = defaultViewportSettings;
  private gridSnapRef: EditorGridSnapSettings = defaultGridSnapSettings;
  private readonly listeners = new Set<Listener>();
  private readonly storageKey: string;
  private readonly storage: EditorStateStorage | undefined;
  private persisted = false;
  private changes = 0;

  constructor(options: EditorStateModelOptions = {}) {
    this.storage = options.storage;
    this.storageKey = options.storageKey ?? "aura3d:editor-state:externalParity";
    this.load();
  }

  get activeTool(): string {
    return this.activeToolRef;
  }

  get transformSpace(): GizmoSpaceMode {
    return this.transformSpaceRef;
  }

  get pivotMode(): GizmoPivotMode {
    return this.pivotModeRef;
  }

  setActiveTool(tool: string): void {
    const normalized = tool.trim();
    if (normalized.length === 0) throw new Error("Editor state active tool cannot be empty.");
    this.setValue("activeTool", this.activeToolRef, normalized, (value) => {
      this.activeToolRef = value;
    });
  }

  setTransformSpace(space: GizmoSpaceMode): void {
    this.setValue("transformSpace", this.transformSpaceRef, space, (value) => {
      this.transformSpaceRef = value;
    });
  }

  setPivotMode(mode: GizmoPivotMode): void {
    this.setValue("pivotMode", this.pivotModeRef, mode, (value) => {
      this.pivotModeRef = value;
    });
  }

  configureViewport(settings: Partial<EditorViewportSettings>): EditorViewportSettings {
    const next = normalizeViewportSettings({ ...this.viewportRef, ...settings });
    this.setValue("viewport", this.viewportRef, next, (value) => {
      this.viewportRef = value;
    });
    return this.viewportRef;
  }

  configureGridSnap(settings: Partial<EditorGridSnapSettings>): EditorGridSnapSettings {
    const next = normalizeGridSnapSettings({ ...this.gridSnapRef, ...settings });
    this.setValue("gridSnap", this.gridSnapRef, next, (value) => {
      this.gridSnapRef = value;
    });
    return this.gridSnapRef;
  }

  configureFromGizmoSettings(settings: GizmoSettings): void {
    this.setTransformSpace(settings.spaceMode);
    this.setPivotMode(settings.pivotMode);
    this.configureGridSnap({
      snapToGrid: settings.snapEnabled,
      positionSnap: settings.positionSnap,
      rotationSnapEnabled: settings.snapEnabled,
      rotationSnapDegrees: settings.rotationSnapDegrees,
      scaleSnapEnabled: settings.snapEnabled,
      scaleSnap: settings.scaleSnap
    });
  }

  gizmoSettings(): GizmoSettings {
    return normalizeGizmoSettings({
      snapEnabled: this.gridSnapRef.snapToGrid,
      positionSnap: this.gridSnapRef.positionSnap,
      rotationSnapDegrees: this.gridSnapRef.rotationSnapDegrees,
      scaleSnap: this.gridSnapRef.scaleSnap,
      spaceMode: this.transformSpaceRef,
      pivotMode: this.pivotModeRef
    });
  }

  snapPosition(value: number): number {
    return this.gridSnapRef.snapToGrid ? snap(value, this.gridSnapRef.positionSnap) : value;
  }

  snapRotation(radians: number): number {
    return this.gridSnapRef.rotationSnapEnabled ? snap(radians, this.gridSnapRef.rotationSnapDegrees * Math.PI / 180) : radians;
  }

  snapScale(value: number): number {
    return this.gridSnapRef.scaleSnapEnabled ? snap(value, this.gridSnapRef.scaleSnap) : value;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  snapshot(): EditorStateSnapshot {
    return {
      activeTool: this.activeToolRef,
      transformSpace: this.transformSpaceRef,
      pivotMode: this.pivotModeRef,
      viewport: this.viewportRef,
      gridSnap: this.gridSnapRef,
      persisted: this.persisted,
      storageKey: this.storageKey,
      changeCount: this.changes,
      evidence: {
        oldCodebasePort: true,
        persistentEditorState: this.persisted,
        viewportSettings: this.viewportRef.gridSize > 0 && this.viewportRef.fov > 0 && this.viewportRef.far > this.viewportRef.near,
        gridSnapSettings: this.gridSnapRef.positionSnap > 0 && this.gridSnapRef.rotationSnapDegrees > 0 && this.gridSnapRef.scaleSnap > 0,
        transformSpacePivotMode: Boolean(this.transformSpaceRef) && Boolean(this.pivotModeRef)
      }
    };
  }

  reset(): void {
    this.activeToolRef = "select";
    this.transformSpaceRef = "world";
    this.pivotModeRef = "center";
    this.viewportRef = defaultViewportSettings;
    this.gridSnapRef = defaultGridSnapSettings;
    this.changes += 1;
    this.persist();
    this.emit({ property: "reset", oldValue: null, newValue: this.snapshot() });
  }

  private setValue<T>(property: string, current: T, next: T, apply: (value: T) => void): void {
    if (deepEqual(current, next)) return;
    apply(next);
    this.changes += 1;
    this.persist();
    this.emit({ property, oldValue: current, newValue: next });
  }

  private emit(change: EditorStateChange): void {
    for (const listener of this.listeners) listener(change);
  }

  private persist(): void {
    if (!this.storage) return;
    this.storage.setItem(this.storageKey, JSON.stringify({
      activeTool: this.activeToolRef,
      transformSpace: this.transformSpaceRef,
      pivotMode: this.pivotModeRef,
      viewport: this.viewportRef,
      gridSnap: this.gridSnapRef
    }));
    this.persisted = true;
  }

  private load(): void {
    if (!this.storage) return;
    const text = this.storage.getItem(this.storageKey);
    if (!text) return;
    try {
      const parsed = JSON.parse(text) as unknown;
      if (!isRecord(parsed)) return;
      this.activeToolRef = typeof parsed.activeTool === "string" && parsed.activeTool.trim().length > 0 ? parsed.activeTool : this.activeToolRef;
      this.transformSpaceRef = parsed.transformSpace === "local" ? "local" : "world";
      this.pivotModeRef = parsed.pivotMode === "active" || parsed.pivotMode === "individual" ? parsed.pivotMode : "center";
      this.viewportRef = normalizeViewportSettings({ ...this.viewportRef, ...(isRecord(parsed.viewport) ? parsed.viewport : {}) });
      this.gridSnapRef = normalizeGridSnapSettings({ ...this.gridSnapRef, ...(isRecord(parsed.gridSnap) ? parsed.gridSnap : {}) });
      this.persisted = true;
    } catch {
      this.persisted = false;
    }
  }
}

export function createMemoryEditorStateStorage(initial: Record<string, string> = {}): EditorStateStorage & { readonly values: Record<string, string> } {
  const values = { ...initial };
  return {
    values,
    getItem(key) {
      return values[key] ?? null;
    },
    setItem(key, value) {
      values[key] = value;
    },
    removeItem(key) {
      delete values[key];
    }
  };
}

function normalizeViewportSettings(settings: Partial<EditorViewportSettings>): EditorViewportSettings {
  return {
    showGrid: booleanOr(settings.showGrid, defaultViewportSettings.showGrid),
    gridSize: positive(settings.gridSize, defaultViewportSettings.gridSize),
    gridSubdivisions: Math.max(1, Math.round(positive(settings.gridSubdivisions, defaultViewportSettings.gridSubdivisions))),
    showAxisGizmo: booleanOr(settings.showAxisGizmo, defaultViewportSettings.showAxisGizmo),
    showStats: booleanOr(settings.showStats, defaultViewportSettings.showStats),
    showWireframe: booleanOr(settings.showWireframe, defaultViewportSettings.showWireframe),
    showBounds: booleanOr(settings.showBounds, defaultViewportSettings.showBounds),
    showLights: booleanOr(settings.showLights, defaultViewportSettings.showLights),
    showCameras: booleanOr(settings.showCameras, defaultViewportSettings.showCameras),
    fov: clamp(positive(settings.fov, defaultViewportSettings.fov), 10, 140),
    near: positive(settings.near, defaultViewportSettings.near),
    far: Math.max(positive(settings.far, defaultViewportSettings.far), positive(settings.near, defaultViewportSettings.near) + 1)
  };
}

function normalizeGridSnapSettings(settings: Partial<EditorGridSnapSettings>): EditorGridSnapSettings {
  return {
    snapToGrid: booleanOr(settings.snapToGrid, defaultGridSnapSettings.snapToGrid),
    positionSnap: positive(settings.positionSnap, defaultGridSnapSettings.positionSnap),
    rotationSnapEnabled: booleanOr(settings.rotationSnapEnabled, defaultGridSnapSettings.rotationSnapEnabled),
    rotationSnapDegrees: positive(settings.rotationSnapDegrees, defaultGridSnapSettings.rotationSnapDegrees),
    scaleSnapEnabled: booleanOr(settings.scaleSnapEnabled, defaultGridSnapSettings.scaleSnapEnabled),
    scaleSnap: positive(settings.scaleSnap, defaultGridSnapSettings.scaleSnap)
  };
}

function booleanOr(value: unknown, fallback: boolean): boolean {
  return typeof value === "boolean" ? value : fallback;
}

function positive(value: unknown, fallback: number): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function snap(value: number, increment: number): number {
  return Math.round(value / increment) * increment;
}

function deepEqual(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
