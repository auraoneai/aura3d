import type { InputSnapshot } from "../InputSnapshot";
import { clamp, type CameraTransformLike, type Vec3Like } from "./ControlTypes";

export const DEFAULT_ORBIT_MAX_POLAR = Math.PI * 0.37;

export interface OrbitControlsOptions {
  /** Opt in to time-based decay; dampingFactor is the fraction consumed at 60Hz. */
  readonly enableDamping?: boolean;
  readonly dampingFactor?: number;
  readonly zoomToCursor?: boolean;
  /** Pointer coordinates and this rectangle must use the same CSS-pixel space. */
  readonly viewport?: () => { x: number; y: number; width: number; height: number };
  readonly panBounds?: { readonly min: Vec3Like; readonly max: Vec3Like };
  readonly screenSpacePanning?: boolean;
  readonly oneFingerAction?: "rotate" | "pan";
  readonly enabled?: boolean;
  readonly enablePan?: boolean;
  readonly enableZoom?: boolean;
  readonly enableRotate?: boolean;
  readonly target?: Vec3Like;
  readonly distance?: number;
  readonly minDistance?: number;
  readonly maxDistance?: number;
  readonly minZoom?: number;
  readonly maxZoom?: number;
  readonly minPolar?: number;
  readonly maxPolar?: number;
  readonly rotateSpeed?: number;
  readonly zoomSpeed?: number;
  readonly panSpeed?: number;
}

/** Structural projection adapter; fov is vertical degrees, orthographic extents are world units. */
export interface OrbitCameraTransformLike extends CameraTransformLike {
  readonly fov?: number;
  readonly aspect?: number;
  readonly isOrthographicCamera?: boolean;
  readonly left?: number;
  readonly right?: number;
  readonly top?: number;
  readonly bottom?: number;
  zoom?: number;
  updateProjectionMatrix?(): void;
}

export class OrbitControls {
  enableDamping: boolean;
  dampingFactor: number;
  zoomToCursor: boolean;
  enabled: boolean;
  enablePan: boolean;
  enableZoom: boolean;
  enableRotate: boolean;
  readonly target: Vec3Like;

  private azimuth = 0;
  private polar = Math.PI / 2;
  private distance: number;
  private readonly initial: { target: Vec3Like; azimuth: number; polar: number; distance: number; zoom: number };
  private disposed = false;
  private pendingAzimuth = 0;
  private pendingPolar = 0;
  private pendingPan = { x: 0, y: 0, z: 0 };
  private previousTouches: InputSnapshot["pointer"]["touches"] = [];
  private readonly minDistance: number;
  private readonly maxDistance: number;
  private readonly minPolar: number;
  private readonly maxPolar: number;
  private readonly rotateSpeed: number;
  private readonly zoomSpeed: number;
  private readonly panSpeed: number;
  private readonly options: OrbitControlsOptions;

  constructor(private readonly camera: CameraTransformLike, options: OrbitControlsOptions = {}) {
    this.options = options;
    this.enableDamping = options.enableDamping ?? false;
    this.dampingFactor = options.dampingFactor ?? 0.05;
    this.zoomToCursor = options.zoomToCursor ?? false;
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
      distance: this.distance,
      zoom: (camera as OrbitCameraTransformLike).zoom ?? 1
    };
    this.apply();
  }

  update(snapshot: InputSnapshot, deltaSeconds = 1 / 60): void {
    if (!this.enabled || this.disposed || !Number.isFinite(deltaSeconds) || deltaSeconds <= 0) {
      return;
    }

    const leftButton = snapshot.button(0);
    const middleButton = snapshot.button(1);
    const rightButton = snapshot.button(2);
    const panModifier = snapshot.keys.has("ShiftLeft") || snapshot.keys.has("ShiftRight") || snapshot.keys.has("ControlLeft") || snapshot.keys.has("ControlRight") || snapshot.keys.has("MetaLeft") || snapshot.keys.has("MetaRight");

    const dx = finite(snapshot.pointer.deltaX);
    const dy = finite(snapshot.pointer.deltaY);
    const touching = snapshot.pointer.touches.length > 0;
    if (!this.enableRotate) this.pendingAzimuth = this.pendingPolar = 0;
    if (!this.enablePan) this.pendingPan = { x: 0, y: 0, z: 0 };
    if (this.enableRotate && leftButton.down && !panModifier && !touching) {
      this.pendingAzimuth -= dx * this.rotateSpeed;
      this.pendingPolar -= dy * this.rotateSpeed;
    }

    if (this.enablePan && !touching && (rightButton.down || middleButton.down || (leftButton.down && panModifier))) {
      this.pan(dx, dy);
    }

    this.touch(snapshot);
    const factor = this.enableDamping
      ? 1 - Math.pow(1 - clamp(finite(this.dampingFactor), 0.000001, 1), deltaSeconds * 60)
      : 1;
    this.azimuth += this.pendingAzimuth * factor;
    this.polar = clamp(this.polar + this.pendingPolar * factor, this.minPolar, this.maxPolar);
    for (const axis of ["x", "y", "z"] as const) {
      this.target[axis] += this.pendingPan[axis] * factor;
      this.pendingPan[axis] *= 1 - factor;
    }
    this.pendingAzimuth *= 1 - factor;
    this.pendingPolar *= 1 - factor;

    if (this.enableZoom && snapshot.pointer.wheelY !== 0) {
      this.dollyFromWheel(finite(snapshot.pointer.wheelY), snapshot.pointer.x, snapshot.pointer.y);
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
    if (this.disposed) return;
    this.initial.target.x = this.target.x;
    this.initial.target.y = this.target.y;
    this.initial.target.z = this.target.z;
    this.initial.azimuth = this.azimuth;
    this.initial.polar = this.polar;
    this.initial.distance = this.distance;
    this.initial.zoom = (this.camera as OrbitCameraTransformLike).zoom ?? 1;
  }

  reset(): void {
    if (this.disposed) return;
    this.clearPending();
    this.target.x = this.initial.target.x;
    this.target.y = this.initial.target.y;
    this.target.z = this.initial.target.z;
    this.azimuth = this.initial.azimuth;
    this.polar = this.initial.polar;
    this.distance = this.initial.distance;
    const camera = this.camera as OrbitCameraTransformLike;
    if (camera.isOrthographicCamera) {
      camera.zoom = this.initial.zoom;
      camera.updateProjectionMatrix?.();
    }
    this.apply();
  }

  dispose(): void {
    this.disposed = true;
    this.enabled = false;
    this.clearPending();
  }

  private clearPending(): void {
    this.pendingAzimuth = this.pendingPolar = 0;
    this.pendingPan = { x: 0, y: 0, z: 0 };
    this.previousTouches = [];
  }

  private pan(deltaX: number, deltaY: number): void {
    const scale = this.distance * this.panSpeed;
    if (this.options.screenSpacePanning === false) {
      this.pendingPan.x += (-deltaX * Math.cos(this.azimuth) + deltaY * Math.sin(this.azimuth)) * scale;
      this.pendingPan.z += (deltaX * Math.sin(this.azimuth) + deltaY * Math.cos(this.azimuth)) * scale;
    } else {
      // Preserve legacy world-XY pan unless ground-plane semantics are requested.
      this.pendingPan.x -= deltaX * scale;
      this.pendingPan.y += deltaY * scale;
    }
  }

  private dollyFromWheel(deltaY: number, x = 0, y = 0): void {
    const anchor = this.cursorOffset(x, y);
    const oldDistance = this.distance;
    const camera = this.camera as OrbitCameraTransformLike;
    const oldZoom = camera.zoom ?? 1;
    const normalizedDelta = Math.abs(deltaY * 0.01);
    const zoomScale = Math.pow(0.95, this.zoomSpeed * normalizedDelta);
    const nextDistance = deltaY < 0
      ? this.distance * zoomScale
      : this.distance / zoomScale;
    this.distance = clamp(nextDistance, this.minDistance, this.maxDistance);
    let ratio = this.distance / oldDistance;
    if (camera.isOrthographicCamera) {
      const requestedRatio = deltaY < 0 ? zoomScale : 1 / zoomScale;
      camera.zoom = clamp(oldZoom / requestedRatio, this.options.minZoom ?? 1e-6, this.options.maxZoom ?? 1e6);
      ratio = oldZoom / camera.zoom;
      this.distance = oldDistance;
      camera.updateProjectionMatrix?.();
    }
    if (anchor) for (const axis of ["x", "y", "z"] as const) this.target[axis] += anchor[axis] * (1 - ratio);
  }

  private cursorOffset(x: number, y: number): Vec3Like | undefined {
    const viewport = this.options.viewport?.();
    if (!this.zoomToCursor || !viewport || viewport.width <= 0 || viewport.height <= 0 ||
        ![x, y, viewport.x, viewport.y, viewport.width, viewport.height].every(Number.isFinite)) return;
    const nx = 2 * (x - viewport.x) / viewport.width - 1;
    const ny = 1 - 2 * (y - viewport.y) / viewport.height;
    const cam = this.camera as OrbitCameraTransformLike;
    let horizontal: number;
    let vertical: number;
    if (cam.isOrthographicCamera) {
      if (![cam.left, cam.right, cam.top, cam.bottom].every(value => typeof value === "number" && Number.isFinite(value))) return;
      horizontal = (nx * (cam.right! - cam.left!) + cam.right! + cam.left!) / (2 * (cam.zoom ?? 1));
      vertical = (ny * (cam.top! - cam.bottom!) + cam.top! + cam.bottom!) / (2 * (cam.zoom ?? 1));
    } else {
      if (!Number.isFinite(cam.fov) || cam.fov! <= 0 || cam.fov! >= 180) return;
      const halfHeight = this.distance * Math.tan(cam.fov! * Math.PI / 360) / (cam.zoom ?? 1);
      horizontal = nx * halfHeight * (cam.aspect ?? viewport.width / viewport.height);
      vertical = ny * halfHeight;
    }
    const c = Math.cos(this.azimuth), s = Math.sin(this.azimuth);
    const cp = Math.cos(this.polar), sp = Math.sin(this.polar);
    return { x: horizontal * c - vertical * cp * s, y: vertical * sp, z: -horizontal * s - vertical * cp * c };
  }

  private touch(snapshot: InputSnapshot): void {
    const touches = snapshot.pointer.touches.filter(t => Number.isFinite(t.x) && Number.isFinite(t.y));
    const previous = this.previousTouches;
    this.previousTouches = touches;
    if (touches.length !== previous.length || !touches.every((t, i) => t.id === previous[i]?.id)) return;
    if (touches.length === 1) {
      const dx = touches[0]!.x - previous[0]!.x, dy = touches[0]!.y - previous[0]!.y;
      if (this.options.oneFingerAction === "pan") { if (this.enablePan) this.pan(dx, dy); }
      else if (this.enableRotate) { this.pendingAzimuth -= dx * this.rotateSpeed; this.pendingPolar -= dy * this.rotateSpeed; }
    } else if (touches.length === 2) {
      const a = touches[0]!, b = touches[1]!, pa = previous[0]!, pb = previous[1]!;
      const x = (a.x + b.x) / 2, y = (a.y + b.y) / 2;
      if (this.enablePan) this.pan(x - (pa.x + pb.x) / 2, y - (pa.y + pb.y) / 2);
      const before = Math.hypot(pa.x - pb.x, pa.y - pb.y), after = Math.hypot(a.x - b.x, a.y - b.y);
      if (this.enableZoom && before > 0 && after > 0) this.dollyFromWheel(Math.log(after / before) / Math.log(0.95) * 100, x, y);
    }
  }

  private apply(): void {
    const bounds = this.options.panBounds;
    if (bounds) for (const axis of ["x", "y", "z"] as const) {
      const min = bounds.min[axis], max = bounds.max[axis];
      if (Number.isFinite(min) && Number.isFinite(max) && min <= max) {
        const next = clamp(this.target[axis], min, max);
        if (next !== this.target[axis]) this.pendingPan[axis] = 0;
        this.target[axis] = next;
      }
    }
    const sinPolar = Math.sin(this.polar);
    this.camera.position.x = this.target.x + this.distance * sinPolar * Math.sin(this.azimuth);
    this.camera.position.y = this.target.y + this.distance * Math.cos(this.polar);
    this.camera.position.z = this.target.z + this.distance * sinPolar * Math.cos(this.azimuth);
    this.camera.lookAt?.(this.target);
  }
}

function finite(value: number): number { return Number.isFinite(value) ? value : 0; }

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
