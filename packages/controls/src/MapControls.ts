import { OrbitControls } from "./OrbitControls";

export class MapControls extends OrbitControls {
  readonly screenSpacePanning = false;

  truck(deltaX: number, deltaZ: number): void {
    this.state.target.x += deltaX;
    this.state.target.z += deltaZ;
  }
}
