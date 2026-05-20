import { createDefaultControlState, type V5ControlState } from "./ControlState";

export class OrbitControls {
  readonly state: V5ControlState = createDefaultControlState();
  enablePan = true;
  enableZoom = true;
  enableRotate = true;

  rotate(deltaX: number, deltaY: number): void {
    if (!this.enableRotate) return;
    this.state.rotation.x += deltaY;
    this.state.rotation.y += deltaX;
  }

  pan(deltaX: number, deltaY: number): void {
    if (!this.enablePan) return;
    this.state.target.x += deltaX;
    this.state.target.y += deltaY;
  }

  dolly(scale: number): void {
    if (!this.enableZoom) return;
    this.state.position.z *= scale;
  }
}
