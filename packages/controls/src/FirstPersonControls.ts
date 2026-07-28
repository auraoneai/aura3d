import {
  FirstPersonControls as InputFirstPersonControls,
  type FirstPersonControlsOptions
} from "@aura3d/input";
import { FlyControls, type FlyCameraLike } from "./FlyControls";

export type { FirstPersonControlsOptions };

/**
 * First-person navigation delegated to `@aura3d/input`.
 *
 * `look()` accepts angular deltas for compatibility; `applyInput()` accepts
 * raw input snapshots and uses the configured input-engine look speed.
 */
export class FirstPersonControls extends FlyControls {
  constructor(camera?: FlyCameraLike, options: FirstPersonControlsOptions = {}) {
    super(camera, {
      movementSpeed: options.moveSpeed,
      lookSpeed: options.lookSpeed
    });
    this.replaceDelegate(
      new InputFirstPersonControls(this.controlledCamera, {
        ...options,
        moveSpeed: 1
      }),
      options.lookSpeed ?? 0.002
    );
  }

  look(deltaX: number, deltaY: number): void {
    this.lookByRadians(deltaX, deltaY, 0);
  }
}
