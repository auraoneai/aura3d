/**
 * Arcball controls (muse3jsparity-PRD N2).
 *
 * The r185 addon baseline ships `ArcballControls` alongside
 * Orbit/Map/Trackball/Fly/FirstPerson; Aura3D had every neighbor but not
 * this one. Like its siblings in this package it owns no DOM listeners —
 * input arrives through `rotate`/`pan`/`dolly`/`applyPointer` calls (or the
 * input-system snapshots the route already forwards) — so `dispose()` means
 * detach + disable + drain velocities, idempotent, with no leaked listeners
 * by construction (F1 hygiene standard).
 *
 * ## Parity vs three.js `ArcballControls` (r185)
 *
 * | Option / behavior              | three.js ArcballControls | This implementation |
 * |--------------------------------|--------------------------|---------------------|
 * | Free rotation (no polar clamp) | yes                      | yes (`rotate`)      |
 * | Pan (screen-space truck)       | yes (`mouseActions.PAN`) | yes (`pan`)         |
 * | Dolly with min/max distance    | yes                      | yes (`dolly`)       |
 * | Damping (`enableDamping`)      | yes                      | yes (`update(dt)`)  |
 * | Roll about the view axis       | via touch gestures       | yes (`roll`)        |
 * | `cursorZoom` (zoom to cursor)  | yes                      | GAP — listed, not claimed (needs a projecting camera; the `OrbitCameraLike` surface here carries position only) |
 * | Touch two-finger gestures      | yes                      | GAP — routes forward snapshots; pinch maps to `dolly`, two-finger drag to `pan` |
 * | `adjustNearPlane`              | yes                      | GAP — near-plane ownership stays with the scene camera |
 *
 * No `three` imports: all vector math below is local.
 */

import { createDefaultControlState, type ThreeCompatControlState } from "./ControlState";
import type { Vector3Like } from "./NativeControlTypes";

export interface ArcballCameraLike {
  position: Vector3Like;
  lookAt?(target: Vector3Like): void;
}

export interface ArcballControlsOptions {
  readonly minDistance?: number;
  readonly maxDistance?: number;
  readonly enableDamping?: boolean;
  readonly dampingFactor?: number;
  readonly rotateSpeed?: number;
  readonly panSpeed?: number;
  readonly zoomSpeed?: number;
}

const UP = { x: 0, y: 1, z: 0 };

function assertFinite(value: number, field: string): void {
  if (!Number.isFinite(value)) {
    throw new RangeError(`ArcballControls ${field} must be finite (received ${String(value)}).`);
  }
}

function sub(a: Vector3Like, b: Vector3Like): Vector3Like {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function cross(a: Vector3Like, b: Vector3Like): Vector3Like {
  return {
    x: a.y * b.z - a.z * b.y,
    y: a.z * b.x - a.x * b.z,
    z: a.x * b.y - a.y * b.x
  };
}

function normalize(v: Vector3Like): Vector3Like {
  const length = Math.hypot(v.x, v.y, v.z);
  if (!(length > 1e-12)) return { x: 0, y: 0, z: 0 };
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}

/** Rodrigues rotation of `v` about unit axis `k` by `angle` radians. */
function rotateAboutAxis(v: Vector3Like, k: Vector3Like, angle: number): Vector3Like {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const dot = v.x * k.x + v.y * k.y + v.z * k.z;
  const crossed = cross(k, v);
  return {
    x: v.x * cos + crossed.x * sin + k.x * dot * (1 - cos),
    y: v.y * cos + crossed.y * sin + k.y * dot * (1 - cos),
    z: v.z * cos + crossed.z * sin + k.z * dot * (1 - cos)
  };
}

/**
 * Camera-attached operation is the supported path: rotation orbits a real
 * camera around `state.target` with no polar clamp (the Arcball distinction
 * from Orbit). Detached operation (`new ArcballControls()`) accumulates
 * yaw/pitch/roll bookkeeping on `state.rotation` and dolly on
 * `state.position.z`, matching the sibling detached convention.
 */
export class ArcballControls {
  readonly state: ThreeCompatControlState = createDefaultControlState();
  enableDamping: boolean;
  dampingFactor: number;
  rotateSpeed: number;
  panSpeed: number;
  zoomSpeed: number;
  minDistance: number;
  maxDistance: number;

  private camera: ArcballCameraLike | undefined;
  private yawVelocity = 0;
  private pitchVelocity = 0;
  private rollVelocity = 0;
  private panVelocity = { x: 0, y: 0 };
  private dollyVelocity = 0;
  private disposed = false;

  constructor(camera?: ArcballCameraLike, options: ArcballControlsOptions = {}) {
    this.minDistance = options.minDistance ?? 0.5;
    this.maxDistance = options.maxDistance ?? 60;
    this.enableDamping = options.enableDamping ?? false;
    this.dampingFactor = options.dampingFactor ?? 0.08;
    this.rotateSpeed = options.rotateSpeed ?? 0.005;
    this.panSpeed = options.panSpeed ?? 0.01;
    this.zoomSpeed = options.zoomSpeed ?? 1;
    if (this.minDistance < 0) throw new RangeError("ArcballControls minDistance must be >= 0.");
    if (this.maxDistance < this.minDistance) {
      throw new RangeError("ArcballControls maxDistance must be >= minDistance.");
    }
    if (camera) {
      this.camera = camera;
      this.state.position.set(camera.position.x, camera.position.y, camera.position.z);
    }
  }

  /** True when a camera is attached and motion moves a real pose. */
  get isCameraAttached(): boolean {
    return this.camera !== undefined;
  }

  /** True after `dispose()`; every mutator is a no-op past this point. */
  get isDisposed(): boolean {
    return this.disposed;
  }

  getDistance(): number {
    if (this.camera) {
      return Math.hypot(
        this.camera.position.x - this.state.target.x,
        this.camera.position.y - this.state.target.y,
        this.camera.position.z - this.state.target.z
      );
    }
    return this.state.position.z;
  }

  rotate(deltaX: number, deltaY: number): void {
    assertFinite(deltaX, "deltaX");
    assertFinite(deltaY, "deltaY");
    if (this.disposed || !this.state.enabled) return;
    const yaw = -deltaX * this.rotateSpeed;
    const pitch = -deltaY * this.rotateSpeed;
    this.applyRotation(yaw, pitch, 0);
    this.yawVelocity += yaw;
    this.pitchVelocity += pitch;
  }

  roll(delta: number): void {
    assertFinite(delta, "roll delta");
    if (this.disposed || !this.state.enabled) return;
    this.applyRotation(0, 0, delta);
    this.rollVelocity += delta;
  }

  pan(deltaX: number, deltaY: number): void {
    assertFinite(deltaX, "pan deltaX");
    assertFinite(deltaY, "pan deltaY");
    if (this.disposed || !this.state.enabled) return;
    const shift = this.panShift(deltaX, deltaY);
    this.state.target.x += shift.x;
    this.state.target.y += shift.y;
    this.state.target.z += shift.z;
    if (this.camera) {
      this.camera.position.x += shift.x;
      this.camera.position.y += shift.y;
      this.camera.position.z += shift.z;
      this.camera.lookAt?.(this.state.target);
    }
    this.panVelocity.x += deltaX;
    this.panVelocity.y += deltaY;
  }

  dolly(scale: number): void {
    assertFinite(scale, "dolly scale");
    if (this.disposed || !this.state.enabled) return;
    if (scale <= 0) throw new RangeError("ArcballControls dolly scale must be > 0.");
    this.applyDolly(scale);
    this.dollyVelocity += scale - 1;
  }

  /**
   * Damping tick. Returns true while velocity remains. With damping off this
   * is a no-op returning false (mirrors the `TrackballControls` contract).
   */
  update(deltaSeconds = 1 / 60): boolean {
    if (this.disposed || !this.enableDamping) return false;
    assertFinite(deltaSeconds, "deltaSeconds");
    const damping = Math.max(0, Math.min(1, this.dampingFactor * deltaSeconds * 60));
    this.applyRotation(
      this.yawVelocity * damping,
      this.pitchVelocity * damping,
      this.rollVelocity * damping
    );
    const pan = this.panShift(this.panVelocity.x * damping, this.panVelocity.y * damping);
    this.state.target.x += pan.x;
    this.state.target.y += pan.y;
    this.state.target.z += pan.z;
    if (this.camera) {
      this.camera.position.x += pan.x;
      this.camera.position.y += pan.y;
      this.camera.position.z += pan.z;
    }
    this.applyDolly(1 + this.dollyVelocity * damping);
    this.yawVelocity -= this.yawVelocity * damping;
    this.pitchVelocity -= this.pitchVelocity * damping;
    this.rollVelocity -= this.rollVelocity * damping;
    this.panVelocity.x -= this.panVelocity.x * damping;
    this.panVelocity.y -= this.panVelocity.y * damping;
    this.dollyVelocity -= this.dollyVelocity * damping;
    if (this.camera) this.camera.lookAt?.(this.state.target);
    return Math.abs(this.yawVelocity) + Math.abs(this.pitchVelocity) + Math.abs(this.rollVelocity) +
      Math.abs(this.panVelocity.x) + Math.abs(this.panVelocity.y) + Math.abs(this.dollyVelocity) > 1e-6;
  }

  /**
   * F1-standard disposal: disables the instance, detaches the camera so no
   * further mutation is possible, drains pending velocity, and owns zero DOM
   * listeners (input arrives via method calls), so nothing can leak.
   * Idempotent.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.state.enabled = false;
    this.camera = undefined;
    this.yawVelocity = 0;
    this.pitchVelocity = 0;
    this.rollVelocity = 0;
    this.panVelocity = { x: 0, y: 0 };
    this.dollyVelocity = 0;
  }

  private applyRotation(yaw: number, pitch: number, roll: number): void {
    if (yaw === 0 && pitch === 0 && roll === 0) return;
    const camera = this.camera;
    if (!camera) {
      this.state.rotation.y += yaw;
      this.state.rotation.x += pitch;
      this.state.rotation.z += roll;
      return;
    }
    let offset = sub(camera.position, this.state.target);
    if (yaw !== 0) offset = rotateAboutAxis(offset, UP, yaw);
    if (pitch !== 0 || roll !== 0) {
      const viewDir = normalize({ x: -offset.x, y: -offset.y, z: -offset.z });
      const right = normalize(cross(viewDir, UP));
      if (pitch !== 0 && (right.x !== 0 || right.y !== 0 || right.z !== 0)) {
        offset = rotateAboutAxis(offset, right, pitch);
      }
      if (roll !== 0) offset = rotateAboutAxis(offset, viewDir, roll);
    }
    offset = this.clampOffset(offset);
    camera.position.x = this.state.target.x + offset.x;
    camera.position.y = this.state.target.y + offset.y;
    camera.position.z = this.state.target.z + offset.z;
    this.state.position.set(camera.position.x, camera.position.y, camera.position.z);
    this.state.rotation.y += yaw;
    this.state.rotation.x += pitch;
    this.state.rotation.z += roll;
    camera.lookAt?.(this.state.target);
  }

  private applyDolly(scale: number): void {
    const camera = this.camera;
    if (!camera) {
      this.state.position.z = Math.min(
        this.maxDistance,
        Math.max(this.minDistance, this.state.position.z * scale)
      );
      return;
    }
    const offset = this.clampOffset(sub(camera.position, this.state.target));
    const scaled = {
      x: offset.x * scale,
      y: offset.y * scale,
      z: offset.z * scale
    };
    const clamped = this.clampOffset(scaled);
    camera.position.x = this.state.target.x + clamped.x;
    camera.position.y = this.state.target.y + clamped.y;
    camera.position.z = this.state.target.z + clamped.z;
    this.state.position.set(camera.position.x, camera.position.y, camera.position.z);
    camera.lookAt?.(this.state.target);
  }

  private clampOffset(offset: Vector3Like): Vector3Like {
    const length = Math.hypot(offset.x, offset.y, offset.z);
    if (!(length > 1e-12)) return { x: 0, y: 0, z: this.minDistance };
    const clamped = Math.min(this.maxDistance, Math.max(this.minDistance, length));
    return { x: offset.x / length * clamped, y: offset.y / length * clamped, z: offset.z / length * clamped };
  }

  private panShift(deltaX: number, deltaY: number): Vector3Like {
    const distance = Math.max(this.minDistance, this.getDistance());
    const scale = this.panSpeed * distance * 0.12;
    const camera = this.camera;
    if (!camera) return { x: deltaX * scale, y: -deltaY * scale, z: 0 };
    const offset = sub(camera.position, this.state.target);
    const viewDir = normalize({ x: -offset.x, y: -offset.y, z: -offset.z });
    const right = normalize(cross(viewDir, UP));
    const up = normalize(cross(right, viewDir));
    return {
      x: (right.x * -deltaX + up.x * deltaY) * scale,
      y: (right.y * -deltaX + up.y * deltaY) * scale,
      z: (right.z * -deltaX + up.z * deltaY) * scale
    };
  }
}
