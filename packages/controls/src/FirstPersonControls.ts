import { FlyControls } from "./FlyControls";

export class FirstPersonControls extends FlyControls {
  look(deltaX: number, deltaY: number): void {
    this.state.rotation.y += deltaX;
    this.state.rotation.x += deltaY;
  }
}
