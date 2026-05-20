import { createDefaultControlState, type V5ControlState } from "./ControlState";

export class FlyControls {
  readonly state: V5ControlState = createDefaultControlState();
  movementSpeed = 1;

  moveForward(distance: number): void {
    this.state.position.z -= distance * this.movementSpeed;
  }

  strafe(distance: number): void {
    this.state.position.x += distance * this.movementSpeed;
  }
}
