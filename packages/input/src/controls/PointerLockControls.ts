import type { InputSnapshot } from "../InputSnapshot";
import { FirstPersonControls, type FirstPersonControlsOptions } from "./FirstPersonControls";
import type { CameraTransformLike } from "./ControlTypes";

export class PointerLockControls extends FirstPersonControls {
  locked = false;

  constructor(camera: CameraTransformLike, options: FirstPersonControlsOptions = {}) {
    super(camera, options);
  }

  lock(): void {
    this.locked = true;
  }

  unlock(): void {
    this.locked = false;
  }

  override update(snapshot: InputSnapshot, deltaSeconds: number): void {
    if (!this.locked) return;
    super.update(snapshot, deltaSeconds);
  }
}
