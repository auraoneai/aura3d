import type { Ray } from "@aura3d/math";
import type { CommandHistory } from "./CommandHistory";
import type { TransformTarget } from "./commands/TransformCommand";

export type GizmoAxis = "x" | "y" | "z" | "uniform";
export type GizmoPlaneAxis = "xy" | "xz" | "yz";
export type GizmoHandle = GizmoAxis | GizmoPlaneAxis;
export type GizmoSpaceMode = "world" | "local";
export type GizmoPivotMode = "center" | "active" | "individual";

export interface GizmoSettings {
  readonly snapEnabled: boolean;
  readonly positionSnap: number;
  readonly rotationSnapDegrees: number;
  readonly scaleSnap: number;
  readonly spaceMode: GizmoSpaceMode;
  readonly pivotMode: GizmoPivotMode;
}

export const DEFAULT_GIZMO_SETTINGS: GizmoSettings = {
  snapEnabled: false,
  positionSnap: 1,
  rotationSnapDegrees: 15,
  scaleSnap: 0.1,
  spaceMode: "world",
  pivotMode: "center"
};

export interface GizmoHit {
  readonly axis: GizmoHandle;
  readonly distance: number;
}

export interface GizmoDrag {
  readonly axis: GizmoHandle;
  readonly delta: number;
}

export abstract class Gizmo {
  enabled = true;
  target?: TransformTarget;
  protected settings: GizmoSettings = DEFAULT_GIZMO_SETTINGS;

  constructor(protected readonly history: CommandHistory, settings: Partial<GizmoSettings> = {}) {
    this.configure(settings);
  }

  setTarget(target: TransformTarget | undefined): void {
    this.target = target;
  }

  configure(settings: Partial<GizmoSettings>): void {
    this.settings = normalizeGizmoSettings({ ...this.settings, ...settings });
  }

  snapshotSettings(): GizmoSettings {
    return this.settings;
  }

  hitTest(_ray: Ray): GizmoHit | undefined {
    return undefined;
  }

  abstract drag(input: GizmoDrag): Promise<void>;

  dispose(): void {
    this.enabled = false;
    this.target = undefined;
  }

  protected snapPositionDelta(value: number): number {
    return this.settings.snapEnabled ? snap(value, this.settings.positionSnap) : value;
  }

  protected snapRotationDelta(radians: number): number {
    return this.settings.snapEnabled ? snap(radians, this.settings.rotationSnapDegrees * Math.PI / 180) : radians;
  }

  protected snapScaleFactor(value: number): number {
    return this.settings.snapEnabled ? snap(value, this.settings.scaleSnap) : value;
  }
}

export function normalizeGizmoSettings(settings: Partial<GizmoSettings> = {}): GizmoSettings {
  return {
    snapEnabled: settings.snapEnabled ?? DEFAULT_GIZMO_SETTINGS.snapEnabled,
    positionSnap: positive(settings.positionSnap, DEFAULT_GIZMO_SETTINGS.positionSnap),
    rotationSnapDegrees: positive(settings.rotationSnapDegrees, DEFAULT_GIZMO_SETTINGS.rotationSnapDegrees),
    scaleSnap: positive(settings.scaleSnap, DEFAULT_GIZMO_SETTINGS.scaleSnap),
    spaceMode: settings.spaceMode ?? DEFAULT_GIZMO_SETTINGS.spaceMode,
    pivotMode: settings.pivotMode ?? DEFAULT_GIZMO_SETTINGS.pivotMode
  };
}

function positive(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : fallback;
}

function snap(value: number, increment: number): number {
  return Math.round(value / increment) * increment;
}
