import type { ControlObject3DLike, Vector3Like } from "./NativeControlTypes";
import { TransformControls } from "./TransformControls";

export interface DragControlsDeprecation {
  readonly status: "deprecated";
  readonly replacement: "@aura3d/input InteractionSystem + @aura3d/editor-runtime transform commands";
  readonly limitation: string;
}

export const DRAG_CONTROLS_DEPRECATION: DragControlsDeprecation = Object.freeze({
  status: "deprecated",
  replacement: "@aura3d/input InteractionSystem + @aura3d/editor-runtime transform commands",
  limitation: "The compatibility class applies explicit world-space deltas; it does not bind DOM events, raycast draggable objects, or implement Three.js DragControls."
});

export interface DragControlsOptions {
  readonly transforms?: TransformControls;
}

/**
 * A compatibility shim that delegates explicit translation deltas to the real
 * command-backed `TransformControls`.
 *
 * @deprecated This is not a browser/Three.js DragControls implementation. Use
 * `InteractionSystem` from `@aura3d/input` for drag lifecycle events and
 * `TransformControls` for recorded object mutation.
 */
export class DragControls {
  dragging: ControlObject3DLike | null = null;
  readonly transforms: TransformControls;

  constructor(options: DragControlsOptions = {}) {
    this.transforms = options.transforms ?? new TransformControls();
  }

  start(object: ControlObject3DLike): void {
    this.dragging = object;
    this.transforms.attach(object);
    this.transforms.setMode("translate");
  }

  drag(delta: Vector3Like): void {
    if (!this.dragging) return;
    this.transforms.apply(delta);
  }

  end(): void {
    this.dragging = null;
    this.transforms.detach();
  }
}
