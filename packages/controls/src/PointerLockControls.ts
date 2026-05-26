import { createDefaultControlState, type ThreeCompatControlState } from "./ControlState";

export class PointerLockControls {
  readonly state: ThreeCompatControlState = createDefaultControlState();
  locked = false;

  lock(): void { this.locked = true; }
  unlock(): void { this.locked = false; }

  look(deltaX: number, deltaY: number): void {
    if (!this.locked) return;
    this.state.rotation.y += deltaX;
    this.state.rotation.x += deltaY;
  }
}
