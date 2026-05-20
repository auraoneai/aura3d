import type { InputSnapshot } from "../InputSnapshot";
import { clamp, type CameraTransformLike, type Vec3Like } from "./ControlTypes";

export const DEFAULT_ORBIT_MAX_POLAR = Math.PI * 0.37;

export interface OrbitControlsOptions {
  readonly enabled?: boolean;
  readonly enablePan?: boolean;
  readonly enableZoom?: boolean;
  readonly enableRotate?: boolean;
  readonly target?: Vec3Like;
  readonly distance?: number;
  readonly minDistance?: number;
  readonly maxDistance?: number;
  readonly minPolar?: number;
  readonly maxPolar?: number;
  readonly rotateSpeed?: number;
  readonly zoomSpeed?: number;
  readonly panSpeed?: number;
}

export class OrbitControls {
  enabled: boolean;
  enablePan: boolean;
  enableZoom: boolean;
  enableRotate: boolean;
  readonly target: Vec3Like;

  private azimuth = 0;
  private polar = Math.PI / 2;
  private distance: number;
  private readonly initial: { target: Vec3Like; azimuth: number; polar: number; distance: number };
  private readonly minDistance: number;
  private readonly maxDistance: number;
  private readonly minPolar: number;
  private readonly maxPolar: number;
  private readonly rotateSpeed: number;
  private readonly zoomSpeed: number;
  private readonly panSpeed: number;

  constructor(
    private readonly camera: CameraTransformLike,
    options: OrbitControlsOptions = {}
  ) {
    this.enabled = options.enabled ?? true;
    this.enablePan = options.enablePan ?? true;
    this.enableZoom = options.enableZoom ?? true;
    this.enableRotate = options.enableRotate ?? true;
    this.target = { ...(options.target ?? { x: 0, y: 0, z: 0 }) };
    this.minDistance = options.minDistance ?? 0.1;
    this.maxDistance = options.maxDistance ?? 1_000;
    this.minPolar = options.minPolar ?? 0.001;
    this.maxPolar = options.maxPolar ?? DEFAULT_ORBIT_MAX_POLAR;
    this.rotateSpeed = options.rotateSpeed ?? 0.005;
    this.zoomSpeed = options.zoomSpeed ?? 1;
    this.panSpeed = options.panSpeed ?? 0.002;
    const current = orbitStateFromCamera(camera, this.target);
    this.distance = clamp(options.distance ?? current.distance, this.minDistance, this.maxDistance);
    this.azimuth = current.azimuth;
    this.polar = clamp(current.polar, this.minPolar, this.maxPolar);
    this.initial = {
      target: { ...this.target },
      azimuth: this.azimuth,
      polar: this.polar,
      distance: this.distance
    };
    this.apply();
  }

  update(snapshot: InputSnapshot): void {
    if (!this.enabled) {
      return;
    }

    const leftButton = snapshot.button(0);
    const middleButton = snapshot.button(1);
    const rightButton = snapshot.button(2);
    const panModifier = snapshot.keys.has("ShiftLeft") || snapshot.keys.has("ShiftRight") || snapshot.keys.has("ControlLeft") || snapshot.keys.has("ControlRight") || snapshot.keys.has("MetaLeft") || snapshot.keys.has("MetaRight");

    if (this.enableRotate && leftButton.down && !panModifier) {
      this.azimuth -= snapshot.pointer.deltaX * this.rotateSpeed;
      this.polar = clamp(this.polar - snapshot.pointer.deltaY * this.rotateSpeed, this.minPolar, this.maxPolar);
    }

    if (this.enablePan && (rightButton.down || middleButton.down || (leftButton.down && panModifier))) {
      this.pan(snapshot.pointer.deltaX, snapshot.pointer.deltaY);
    }

    if (this.enableZoom && snapshot.pointer.wheelY !== 0) {
      this.dollyFromWheel(snapshot.pointer.wheelY);
    }

    this.apply();
  }

  getPolarAngle(): number {
    return this.polar;
  }

  getAzimuthalAngle(): number {
    return this.azimuth;
  }

  getDistance(): number {
    return this.distance;
  }

  saveState(): void {
    this.initial.target.x = this.target.x;
    this.initial.target.y = this.target.y;
    this.initial.target.z = this.target.z;
    this.initial.azimuth = this.azimuth;
    this.initial.polar = this.polar;
    this.initial.distance = this.distance;
  }

  reset(): void {
    this.target.x = this.initial.target.x;
    this.target.y = this.initial.target.y;
    this.target.z = this.initial.target.z;
    this.azimuth = this.initial.azimuth;
    this.polar = this.initial.polar;
    this.distance = this.initial.distance;
    this.apply();
  }

  dispose(): void {
    this.enabled = false;
  }

  private pan(deltaX: number, deltaY: number): void {
    const scale = this.distance * this.panSpeed;
    this.target.x -= deltaX * scale;
    this.target.y += deltaY * scale;
  }

  private dollyFromWheel(deltaY: number): void {
    const normalizedDelta = Math.abs(deltaY * 0.01);
    const zoomScale = Math.pow(0.95, this.zoomSpeed * normalizedDelta);
    const nextDistance = deltaY < 0
      ? this.distance * zoomScale
      : this.distance / zoomScale;
    this.distance = clamp(nextDistance, this.minDistance, this.maxDistance);
  }

  private apply(): void {
    const sinPolar = Math.sin(this.polar);
    this.camera.position.x = this.target.x + this.distance * sinPolar * Math.sin(this.azimuth);
    this.camera.position.y = this.target.y + this.distance * Math.cos(this.polar);
    this.camera.position.z = this.target.z + this.distance * sinPolar * Math.cos(this.azimuth);
    this.camera.lookAt?.(this.target);
  }
}

function orbitStateFromCamera(camera: CameraTransformLike, target: Vec3Like): { readonly azimuth: number; readonly polar: number; readonly distance: number } {
  const dx = camera.position.x - target.x;
  const dy = camera.position.y - target.y;
  const dz = camera.position.z - target.z;
  const distance = Math.hypot(dx, dy, dz);
  if (!Number.isFinite(distance) || distance <= 1e-6) {
    return { azimuth: 0, polar: Math.PI / 2, distance: 5 };
  }
  return {
    azimuth: Math.atan2(dx, dz),
    polar: Math.acos(clamp(dy / distance, -1, 1)),
    distance
  };
}
