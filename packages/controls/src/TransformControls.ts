import type { ControlObject3DLike, Vector3Like } from "./NativeControlTypes";

export type TransformControlMode = "translate" | "rotate" | "scale";

export interface TransformControlsDeprecation {
  readonly status: "deprecated";
  readonly replacement: "@aura3d/editor-runtime transform gizmos";
  readonly limitation: string;
}

export const TRANSFORM_CONTROLS_DEPRECATION: TransformControlsDeprecation = Object.freeze({
  status: "deprecated",
  replacement: "@aura3d/editor-runtime transform gizmos",
  limitation: "The compatibility class applies explicit deltas only; it has no rendered gizmo, handle picking, DOM lifecycle, axis constraints, snapping, or local/world space."
});

/**
 * Legacy explicit-delta transform mutator retained for source compatibility.
 *
 * @deprecated This is not a Three.js-compatible interactive TransformControls
 * implementation. Use `TranslateGizmo`, `RotateGizmo`, and `ScaleGizmo` from
 * `@aura3d/editor-runtime` for command-backed editor transforms.
 */
export class TransformControls {
  object: ControlObject3DLike | null = null;
  mode: TransformControlMode = "translate";
  enabled = true;

  attach(object: ControlObject3DLike): void {
    this.object = object;
  }

  detach(): void {
    this.object = null;
  }

  setMode(mode: TransformControlMode): void {
    this.mode = mode;
  }

  apply(delta: Vector3Like): void {
    validateDelta(delta);
    const object = this.object;
    if (!this.enabled || !object) return;
    if (this.mode === "translate") add(object.position, delta);
    if (this.mode === "rotate" && object.rotation) add(object.rotation, delta);
    if (this.mode === "scale" && object.scale) add(object.scale, delta);
  }

  dispose(): void {
    this.enabled = false;
    this.detach();
  }
}

function add(target: Vector3Like, delta: Vector3Like): void {
  target.x += delta.x;
  target.y += delta.y;
  target.z += delta.z;
}

function validateDelta(delta: Vector3Like): void {
  if (![delta.x, delta.y, delta.z].every(Number.isFinite)) {
    throw new RangeError("TransformControls delta must contain finite x/y/z values.");
  }
}
