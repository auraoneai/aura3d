import {
  PointerLockControls as InputPointerLockControls,
  type FirstPersonControlsOptions
} from "@aura3d/input";
import { FirstPersonControls } from "./FirstPersonControls";
import type { FlyCameraLike } from "./FlyControls";

/**
 * Pointer-lock navigation delegated to `@aura3d/input`. `lock()` and
 * `unlock()` gate both snapshot updates and compatibility `look()` deltas.
 */
export class PointerLockControls extends FirstPersonControls {
  private readonly pointerLockDelegate: InputPointerLockControls;

  constructor(camera?: FlyCameraLike, options: FirstPersonControlsOptions = {}) {
    super(camera, options);
    this.pointerLockDelegate = new InputPointerLockControls(this.controlledCamera, {
      ...options,
      moveSpeed: 1
    });
    this.replaceDelegate(this.pointerLockDelegate, options.lookSpeed ?? 0.002);
  }

  get locked(): boolean {
    return this.pointerLockDelegate.locked;
  }

  set locked(value: boolean) {
    if (value) this.lock();
    else this.unlock();
  }

  lock(): void {
    if (this.isDisposed) return;
    this.pointerLockDelegate.lock();
  }

  unlock(): void {
    if (this.isDisposed) return;
    this.pointerLockDelegate.unlock();
  }
}
