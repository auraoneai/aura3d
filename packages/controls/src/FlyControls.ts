import {
  EditorFlyControls as InputFlyControls,
  InputSnapshot,
  type EditorFlyControlsOptions
} from "@aura3d/input";
import { createDefaultControlState, type ThreeCompatControlState } from "./ControlState";
import type { Vector3Like } from "./NativeControlTypes";

export interface FlyCameraLike {
  readonly position: Vector3Like;
  readonly rotation?: Vector3Like;
}

export interface FlyControlsOptions extends Omit<EditorFlyControlsOptions, "baseSpeed"> {
  /**
   * World units per second. The delegated input engine is normalized to one
   * unit per second so this remains mutable for compatibility.
   */
  readonly movementSpeed?: number;
}

interface FlyControlsDelegate {
  enabled: boolean;
  update(snapshot: InputSnapshot, deltaSeconds: number): void;
  dispose(): void;
}

/**
 * Fly navigation backed by `@aura3d/input`'s real editor-fly implementation.
 *
 * Supplying a camera mutates that camera. The no-argument compatibility form
 * uses `state.position`/`state.rotation` as a small in-memory camera, so it
 * still exercises the same yaw-relative movement and pitch-clamping engine
 * rather than duplicating the camera math path.
 */
export class FlyControls {
  readonly state: ThreeCompatControlState = createDefaultControlState();
  movementSpeed: number;

  protected readonly controlledCamera: FlyCameraLike;
  protected pointerLookSpeed: number;
  private delegate: FlyControlsDelegate;

  constructor(camera?: FlyCameraLike, options: FlyControlsOptions = {}) {
    this.movementSpeed = options.movementSpeed ?? 1;
    this.pointerLookSpeed = options.lookSpeed ?? 0.0025;
    this.controlledCamera = camera ?? {
      position: this.state.position,
      rotation: this.state.rotation
    };
    this.delegate = new InputFlyControls(this.controlledCamera, {
      baseSpeed: 1,
      fastMultiplier: options.fastMultiplier,
      lookSpeed: options.lookSpeed
    });
    this.syncState();
  }

  /** True for every instance: even the no-camera form owns a delegated state camera. */
  get isDelegated(): true {
    return true;
  }

  get enabled(): boolean {
    return this.state.enabled;
  }

  set enabled(value: boolean) {
    this.state.enabled = value;
    this.delegate.enabled = value;
  }

  applyInput(snapshot: InputSnapshot, deltaSeconds: number): void {
    this.updateDelegate(snapshot, deltaSeconds * this.movementSpeed);
  }

  moveForward(distance: number): void {
    assertFinite(distance, "forward distance");
    const movement = distance * this.movementSpeed;
    if (movement === 0) return;
    // The input engine's +Z convention is opposite the historical
    // moveForward helper, so KeyS preserves that helper's -Z contract.
    this.updateDelegate(
      keySnapshot(movement > 0 ? "KeyS" : "KeyW"),
      Math.abs(movement)
    );
  }

  strafe(distance: number): void {
    assertFinite(distance, "strafe distance");
    const movement = distance * this.movementSpeed;
    if (movement === 0) return;
    this.updateDelegate(
      keySnapshot(movement > 0 ? "KeyD" : "KeyA"),
      Math.abs(movement)
    );
  }

  lift(distance: number): void {
    assertFinite(distance, "lift distance");
    const movement = distance * this.movementSpeed;
    if (movement === 0) return;
    this.updateDelegate(
      keySnapshot(movement > 0 ? "KeyE" : "KeyQ"),
      Math.abs(movement)
    );
  }

  dispose(): void {
    this.state.enabled = false;
    this.delegate.dispose();
  }

  protected replaceDelegate(delegate: FlyControlsDelegate, pointerLookSpeed: number): void {
    this.delegate.dispose();
    this.delegate = delegate;
    this.pointerLookSpeed = pointerLookSpeed;
    this.delegate.enabled = this.state.enabled;
    this.syncState();
  }

  protected lookByRadians(deltaYaw: number, deltaPitch: number, button: number): void {
    assertFinite(deltaYaw, "yaw delta");
    assertFinite(deltaPitch, "pitch delta");
    if (!this.state.enabled || (deltaYaw === 0 && deltaPitch === 0)) return;
    const speed = Math.abs(this.pointerLookSpeed) > Number.EPSILON ? this.pointerLookSpeed : 1;
    this.updateDelegate(
      new InputSnapshot({
        pointer: {
          deltaX: -deltaYaw / speed,
          deltaY: -deltaPitch / speed,
          buttons: new Map([[button, { down: true, pressed: true, released: false }]])
        }
      }),
      0
    );
  }

  private updateDelegate(snapshot: InputSnapshot, deltaSeconds: number): void {
    assertFinite(deltaSeconds, "delta seconds");
    if (!this.state.enabled) return;
    this.delegate.enabled = true;
    this.delegate.update(snapshot, deltaSeconds);
    this.syncState();
  }

  private syncState(): void {
    const { position, rotation } = this.controlledCamera;
    this.state.position.copy(position);
    if (rotation) this.state.rotation.copy(rotation);
  }
}

function keySnapshot(code: string): InputSnapshot {
  return new InputSnapshot({ keys: new Set([code]) });
}

function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value)) throw new RangeError(`FlyControls ${label} must be finite.`);
}
