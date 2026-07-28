import { InputSnapshot } from "../InputSnapshot";
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
    if (
      (snapshot.pointer.deltaX !== 0 || snapshot.pointer.deltaY !== 0)
      && !snapshot.button(0).down
    ) {
      const buttons = new Map(snapshot.pointer.buttons);
      buttons.set(0, { down: true, pressed: false, released: false });
      super.update(new InputSnapshot({
        keys: snapshot.keys,
        pointer: { ...snapshot.pointer, buttons },
        gamepads: snapshot.gamepads
      }), deltaSeconds);
      return;
    }
    super.update(snapshot, deltaSeconds);
  }
}
