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
  private disposed = false;
  private readonly ownsTransforms: boolean;

  constructor(options: DragControlsOptions = {}) {
    this.transforms = options.transforms ?? new TransformControls();
    this.ownsTransforms = options.transforms === undefined;
  }

  /** True after `dispose()`; `start`/`drag` are no-ops past this point. */
  get isDisposed(): boolean {
    return this.disposed;
  }

  start(object: ControlObject3DLike): void {
    if (this.disposed) return;
    this.dragging = object;
    this.transforms.attach(object);
    this.transforms.setMode("translate");
  }

  drag(delta: Vector3Like): void {
    if (this.disposed || !this.dragging) return;
    this.transforms.apply(delta);
  }

  end(): void {
    this.dragging = null;
    this.transforms.detach();
  }

  /**
   * F1-standard disposal: ends any active drag, detaches the object, and
   * disposes the owned transform helper (a caller-supplied `transforms`
   * instance is left undisposed — its owner disposes it). Idempotent. Owns
   * zero DOM listeners, so nothing can leak.
   */
  dispose(options: { readonly disposeTransforms?: boolean } = {}): void {
    if (this.disposed) return;
    this.disposed = true;
    this.end();
    if ((options.disposeTransforms ?? this.ownsTransforms)) this.transforms.dispose();
  }
}
