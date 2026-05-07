import type { InputSnapshot } from "../InputSnapshot";
import { clamp, type CameraTransformLike, type Vec3Like } from "./ControlTypes";

export interface OrbitControlsOptions {
  readonly target?: Vec3Like;
  readonly distance?: number;
  readonly minDistance?: number;
  readonly maxDistance?: number;
  readonly minPolar?: number;
  readonly maxPolar?: number;
  readonly rotateSpeed?: number;
  readonly zoomSpeed?: number;
}

export class OrbitControls {
  enabled = true;
  readonly target: Vec3Like;

  private azimuth = 0;
  private polar = Math.PI / 2;
  private distance: number;
  private readonly minDistance: number;
  private readonly maxDistance: number;
  private readonly minPolar: number;
  private readonly maxPolar: number;
  private readonly rotateSpeed: number;
  private readonly zoomSpeed: number;

  constructor(
    private readonly camera: CameraTransformLike,
    options: OrbitControlsOptions = {}
  ) {
    this.target = { ...(options.target ?? { x: 0, y: 0, z: 0 }) };
    this.distance = options.distance ?? 5;
    this.minDistance = options.minDistance ?? 0.1;
    this.maxDistance = options.maxDistance ?? 1_000;
    this.minPolar = options.minPolar ?? 0.001;
    this.maxPolar = options.maxPolar ?? Math.PI - 0.001;
    this.rotateSpeed = options.rotateSpeed ?? 0.005;
    this.zoomSpeed = options.zoomSpeed ?? 0.01;
    this.apply();
  }

  update(snapshot: InputSnapshot): void {
    if (!this.enabled) {
      return;
    }

    if (snapshot.button(0).down) {
      this.azimuth -= snapshot.pointer.deltaX * this.rotateSpeed;
      this.polar = clamp(this.polar - snapshot.pointer.deltaY * this.rotateSpeed, this.minPolar, this.maxPolar);
    }

    if (snapshot.pointer.wheelY !== 0) {
      this.distance = clamp(
        this.distance + snapshot.pointer.wheelY * this.zoomSpeed,
        this.minDistance,
        this.maxDistance
      );
    }

    this.apply();
  }

  dispose(): void {
    this.enabled = false;
  }

  private apply(): void {
    const sinPolar = Math.sin(this.polar);
    this.camera.position.x = this.target.x + this.distance * sinPolar * Math.sin(this.azimuth);
    this.camera.position.y = this.target.y + this.distance * Math.cos(this.polar);
    this.camera.position.z = this.target.z + this.distance * sinPolar * Math.cos(this.azimuth);
    this.camera.lookAt?.(this.target);
  }
}
