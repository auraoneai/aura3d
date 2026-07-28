import { InputSnapshot } from "@aura3d/input";
import { OrbitControls } from "./OrbitControls";
import type { OrbitCameraLike, OrbitControlsOptions } from "./OrbitControls";
import { ControlVector3 } from "./NativeControlTypes";

export class MapControls extends OrbitControls {
  readonly screenSpacePanning = false;
  readonly hasExternalCamera: boolean;

  constructor(camera?: OrbitCameraLike, options: OrbitControlsOptions = {}) {
    // Unlike OrbitControls' deliberately retained detached compatibility mode,
    // MapControls always delegates. A no-camera caller receives a state-backed
    // camera so truck/orbit/dolly all use the same spherical engine.
    super(camera ?? { position: new ControlVector3(0, 0, 5) }, options);
    this.hasExternalCamera = camera !== undefined;
  }

  /**
   * Apply MapControls mouse semantics through the delegated orbit engine:
   * left pans, right rotates, middle dollies, and the wheel dollies.
   */
  override applyInput(snapshot: InputSnapshot): void {
    const left = snapshot.button(0).down;
    const middle = snapshot.button(1).down;
    const right = snapshot.button(2).down;
    const buttons = new Map<number, { readonly down: boolean; readonly pressed: boolean; readonly released: boolean }>();
    if (left) buttons.set(2, snapshot.button(0));
    if (right) buttons.set(0, snapshot.button(2));

    super.applyInput(new InputSnapshot({
      keys: snapshot.keys,
      pointer: {
        ...snapshot.pointer,
        buttons,
        wheelY: snapshot.pointer.wheelY + (middle ? snapshot.pointer.deltaY : 0)
      },
      gamepads: snapshot.gamepads
    }));
  }

  /**
   * Ground-plane truck. This moves the real delegated orbit target on the XZ
   * plane, including for the state-backed no-camera form.
   */
  truck(deltaX: number, deltaZ: number): void {
    if (!this.enablePan) return;
    this.truckTarget(deltaX, deltaZ);
  }
}
