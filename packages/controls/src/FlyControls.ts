import { createDefaultControlState, type ThreeCompatControlState } from "./ControlState";

export class FlyControls {
  readonly state: ThreeCompatControlState = createDefaultControlState();
  movementSpeed = 1;

  moveForward(distance: number): void {
    this.state.position.z -= distance * this.movementSpeed;
  }

  strafe(distance: number): void {
    this.state.position.x += distance * this.movementSpeed;
  }
}
