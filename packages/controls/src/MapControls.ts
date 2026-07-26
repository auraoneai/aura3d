import { OrbitControls } from "./OrbitControls";

export class MapControls extends OrbitControls {
  readonly screenSpacePanning = false;

  /**
   * Ground-plane truck. Camera-attached instances move the real orbit target on
   * the XZ plane; detached instances only accumulate `state.target` bookkeeping
   * (see the detached-mode note on `OrbitControls`).
   */
  truck(deltaX: number, deltaZ: number): void {
    if (!this.enablePan) return;
    this.truckTarget(deltaX, deltaZ);
  }
}
