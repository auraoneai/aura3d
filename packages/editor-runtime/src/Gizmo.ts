import type { Ray } from "@galileo3d/math";
import type { CommandHistory } from "./CommandHistory";
import type { TransformTarget } from "./commands/TransformCommand";

export type GizmoAxis = "x" | "y" | "z" | "uniform";

export interface GizmoHit {
  readonly axis: GizmoAxis;
  readonly distance: number;
}

export interface GizmoDrag {
  readonly axis: GizmoAxis;
  readonly delta: number;
}

export abstract class Gizmo {
  enabled = true;
  target?: TransformTarget;

  constructor(protected readonly history: CommandHistory) {}

  setTarget(target: TransformTarget | undefined): void {
    this.target = target;
  }

  hitTest(_ray: Ray): GizmoHit | undefined {
    return undefined;
  }

  abstract drag(input: GizmoDrag): Promise<void>;

  dispose(): void {
    this.enabled = false;
    this.target = undefined;
  }
}
