/** Camera orbit, cursor-centered zoom and pointer gestures. */

import { createDefaultControlState, type ThreeCompatControlState } from "./ControlState";
import type { Vector3Like } from "./NativeControlTypes";
import { measurePointerContentBox } from "./PointerCoordinates";
import { acquirePointerCapture, acquireTouchAction, releasePointerCaptureLease, releaseTouchAction } from "./PointerLeases";

export interface ArcballCameraLike {
  position: Vector3Like;
  /** Mutable camera up vector; required when lookAt ignores its second argument. */
  up?: Vector3Like;
  lookAt?(target: Vector3Like, up?: Vector3Like): void;
  /** Perspective field of view in radians, used when no ray callback is supplied. */
  fovYRadians?: number;
  aspect?: number;
  /** Orthographic projection extents, used when no ray callback is supplied. */
  left?: number;
  right?: number;
  top?: number;
  bottom?: number;
  zoom?: number;
  near?: number;
  updateProjectionMatrix?(): void;
  updateCameraMatrices?(): void;
  /** Optional native projection, using the supplied client-coordinate viewport. */
  rayFromScreen?(clientX: number, clientY: number, viewport: ArcballViewport): ArcballRay;
}

/**
 * Client-coordinate bounds used for ray normalization, in CSS pixels. DOM
 * input uses the canvas content box; programmatic input supplies its viewport.
 */
export interface ArcballViewport {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface ArcballRay {
  readonly origin: Vector3Like;
  readonly direction: Vector3Like;
}

/** Minimal browser pointer shape, also usable by non-DOM input adapters. */
export interface ArcballPointer {
  readonly pointerId: number;
  readonly clientX: number;
  readonly clientY: number;
  readonly pointerType?: string;
  readonly button?: number;
}

export interface ArcballControlsOptions {
  readonly minDistance?: number;
  readonly maxDistance?: number;
  readonly enableDamping?: boolean;
  readonly dampingFactor?: number;
  readonly rotateSpeed?: number;
  readonly panSpeed?: number;
  readonly zoomSpeed?: number;
  readonly minZoom?: number;
  readonly maxZoom?: number;
  readonly cursorZoom?: boolean;
  readonly adjustNearPlane?: boolean;
  /** Bind to an element immediately; the control owns and removes its listeners. */
  readonly element?: HTMLElement;
  /** Return a ray in the same coordinate space as camera.position and state.target. */
  readonly rayFromScreen?: (clientX: number, clientY: number, viewport: ArcballViewport) => ArcballRay;
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

function dot(a: Vector3Like, b: Vector3Like): number {
  return a.x * b.x + a.y * b.y + a.z * b.z;
}

function addScaled(a: Vector3Like, b: Vector3Like, scale: number): Vector3Like {
  return { x: a.x + b.x * scale, y: a.y + b.y * scale, z: a.z + b.z * scale };
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
  minZoom: number;
  maxZoom: number;
  cursorZoom: boolean;
  adjustNearPlane: boolean;

  private camera: ArcballCameraLike | undefined;
  private yawVelocity = 0;
  private pitchVelocity = 0;
  private rollVelocity = 0;
  private panVelocity = { x: 0, y: 0 };
  private dollyVelocity = 0;
  private disposed = false;
  private up: Vector3Like = { ...UP };
  private readonly rayFromScreen: ArcballControlsOptions["rayFromScreen"];
  private element: HTMLElement | undefined;
  private blurTarget: Window | null = null;
  private readonly contacts = new Map<number, { x: number; y: number; button: number }>();
  private originalNear: number | undefined;
  private appliedNear: number | undefined;
  private touchActionAcquired = false;

  constructor(camera?: ArcballCameraLike, options: ArcballControlsOptions = {}) {
    this.minDistance = options.minDistance ?? 0.5;
    this.maxDistance = options.maxDistance ?? 60;
    this.enableDamping = options.enableDamping ?? false;
    this.dampingFactor = options.dampingFactor ?? 0.08;
    this.rotateSpeed = options.rotateSpeed ?? 0.005;
    this.panSpeed = options.panSpeed ?? 0.01;
    this.zoomSpeed = options.zoomSpeed ?? 1;
    this.minZoom = options.minZoom ?? 0.01;
    this.maxZoom = options.maxZoom ?? 1000;
    this.cursorZoom = options.cursorZoom ?? false;
    this.adjustNearPlane = options.adjustNearPlane ?? false;
    this.rayFromScreen = options.rayFromScreen;
    if (!Number.isFinite(this.minDistance) || this.minDistance < 0) throw new RangeError("ArcballControls minDistance must be finite and >= 0.");
    if (Number.isNaN(this.maxDistance) || this.maxDistance < this.minDistance) {
      throw new RangeError("ArcballControls maxDistance must be >= minDistance.");
    }
    if (!Number.isFinite(this.zoomSpeed) || this.zoomSpeed < 0) throw new RangeError("ArcballControls zoomSpeed must be finite and >= 0.");
    if (!Number.isFinite(this.minZoom) || this.minZoom <= 0 || !Number.isFinite(this.maxZoom) || this.maxZoom < this.minZoom) {
      throw new RangeError("ArcballControls zoom limits must be finite, positive and ordered.");
    }
    if (camera) {
      this.camera = camera;
      if (camera.up && Math.hypot(camera.up.x, camera.up.y, camera.up.z) > 1e-12) this.up = normalize(camera.up);
      if (camera.near !== undefined && Number.isFinite(camera.near) && camera.near > 0) this.originalNear = camera.near;
      this.state.position.set(camera.position.x, camera.position.y, camera.position.z);
    }
    if (options.element) this.connect(options.element);
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
    this.translateCameraAndTarget(shift);
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
   * Zoom while preserving the point under a client-coordinate cursor on the
   * plane through the target, perpendicular to the current view. The camera
   * must expose projection parameters or a rayFromScreen callback.
   */
  dollyToCursor(scale: number, clientX: number, clientY: number, viewport: ArcballViewport): void {
    assertFinite(scale, "dolly scale");
    if (this.disposed || !this.state.enabled) return;
    if (scale <= 0) throw new RangeError("ArcballControls dolly scale must be > 0.");
    if (!this.camera) throw new Error("ArcballControls cursor zoom requires an attached camera.");
    validateViewport(viewport);
    assertFinite(clientX, "clientX");
    assertFinite(clientY, "clientY");
    const planePoint = { ...this.state.target };
    const normal = this.cameraBasis().forward;
    const before = intersectPlane(this.screenRay(clientX, clientY, viewport), planePoint, normal);
    if (!before) throw new Error("ArcballControls cursor ray does not intersect the target plane.");
    const camera = this.camera;
    const previous = {
      position: { ...camera.position }, zoom: camera.zoom, near: camera.near,
      hadZoom: "zoom" in camera, hadNear: "near" in camera,
      originalNear: this.originalNear, appliedNear: this.appliedNear
    };
    let after: Vector3Like | undefined;
    try {
      this.applyDolly(scale);
      // Orthographic dolly changes zoom without aiming; measure the second
      // native ray after the same reorientation the final translation applies.
      if (isOrthographic(camera) && camera.rayFromScreen && !this.rayFromScreen) this.aimCamera();
      after = intersectPlane(this.screenRay(clientX, clientY, viewport), planePoint, normal);
      if (!after) throw new Error("ArcballControls cursor ray does not intersect the target plane after zoom.");
    } catch (error) {
      Object.assign(camera.position, previous.position);
      if (camera.zoom !== previous.zoom) {
        if (previous.hadZoom) camera.zoom = previous.zoom;
        else delete camera.zoom;
      }
      if (camera.near !== previous.near) {
        if (previous.hadNear) camera.near = previous.near;
        else delete camera.near;
      }
      this.originalNear = previous.originalNear;
      this.appliedNear = previous.appliedNear;
      this.state.position.set(camera.position.x, camera.position.y, camera.position.z);
      this.aimCamera();
      this.updateProjection();
      throw error;
    }
    this.translateCameraAndTarget(sub(before, after));
    // Residual centered dolly would move the anchor, so cursor zoom does not
    // queue dolly inertia. Other pending pan/rotation inertia remains intact.
    this.dollyVelocity = 0;
  }

  /** Attach browser events. Reconnecting first cancels and detaches the old target. */
  connect(element: HTMLElement): void {
    if (this.disposed || this.element === element) return;
    this.disconnect();
    this.element = element;
    this.touchActionAcquired = acquireTouchAction(element, this);
    element.addEventListener("pointerdown", this.onPointerDown);
    element.addEventListener("pointermove", this.onPointerMove);
    element.addEventListener("pointerup", this.onPointerUp);
    element.addEventListener("pointercancel", this.onPointerCancel);
    element.addEventListener("lostpointercapture", this.onLostPointerCapture);
    element.addEventListener("wheel", this.onWheel, { passive: false });
    element.addEventListener("contextmenu", this.onContextMenu);
    this.blurTarget = element.ownerDocument?.defaultView ?? null;
    this.blurTarget?.addEventListener("blur", this.onBlur);
  }

  /** Release all owned captures and listeners; can be connected again. */
  disconnect(): void {
    const element = this.element;
    this.cancelContacts();
    if (!element) return;
    element.removeEventListener("pointerdown", this.onPointerDown);
    element.removeEventListener("pointermove", this.onPointerMove);
    element.removeEventListener("pointerup", this.onPointerUp);
    element.removeEventListener("pointercancel", this.onPointerCancel);
    element.removeEventListener("lostpointercapture", this.onLostPointerCapture);
    element.removeEventListener("wheel", this.onWheel);
    element.removeEventListener("contextmenu", this.onContextMenu);
    this.blurTarget?.removeEventListener("blur", this.onBlur);
    this.blurTarget = null;
    if (this.touchActionAcquired) releaseTouchAction(element, this);
    this.touchActionAcquired = false;
    this.element = undefined;
  }

  /** Start tracking one independent pointer. Additional contacts rebase the gesture. */
  pointerDown(pointer: ArcballPointer): void {
    if (this.disposed || !this.state.enabled) return;
    validatePointer(pointer);
    if (this.contacts.has(pointer.pointerId)) return;
    if (pointer.pointerType !== "touch" && pointer.button !== undefined && ![0, 1, 2].includes(pointer.button)) return;
    const contact = { x: pointer.clientX, y: pointer.clientY, button: pointer.button ?? 0 };
    this.contacts.set(pointer.pointerId, contact);
    try { acquirePointerCapture(this.element, pointer.pointerId, contact); } catch { /* capture can be unavailable or already lost */ }
  }

  /**
   * One contact rotates (right button pans, middle button dollies); two contacts
   * combine centroid pan, pinch and roll. The first two IDs remain paired until
   * either ends, avoiding jumps when other fingers join or leave.
   */
  pointerMove(pointer: ArcballPointer, viewport?: ArcballViewport): void {
    if (this.disposed || !this.state.enabled) return;
    validatePointer(pointer);
    const contact = this.contacts.get(pointer.pointerId);
    if (!contact) return;
    const ids = [...this.contacts.keys()].slice(0, 2);
    const first = this.contacts.get(ids[0]!)!;
    const second = ids.length > 1 ? this.contacts.get(ids[1]!) : undefined;
    const oldFirst = { ...first };
    const oldSecond = second && { ...second };
    contact.x = pointer.clientX;
    contact.y = pointer.clientY;
    if (second && oldSecond) {
      if (!ids.includes(pointer.pointerId)) return;
      const oldX = oldSecond.x - oldFirst.x;
      const oldY = oldSecond.y - oldFirst.y;
      const x = second.x - first.x;
      const y = second.y - first.y;
      const oldDistance = Math.hypot(oldX, oldY);
      const distance = Math.hypot(x, y);
      this.panBetween(
        (oldFirst.x + oldSecond.x) / 2, (oldFirst.y + oldSecond.y) / 2,
        (first.x + second.x) / 2, (first.y + second.y) / 2, viewport
      );
      if (oldDistance > 1e-6 && distance > 1e-6) {
        const scale = Math.pow(oldDistance / distance, this.zoomSpeed);
        if (this.cursorZoom && viewport) this.dollyToCursor(scale, (first.x + second.x) / 2, (first.y + second.y) / 2, viewport);
        else this.dolly(scale);
        let angle = Math.atan2(y, x) - Math.atan2(oldY, oldX);
        if (angle > Math.PI) angle -= Math.PI * 2;
        if (angle < -Math.PI) angle += Math.PI * 2;
        this.roll(-angle);
      }
    } else {
      const dx = contact.x - oldFirst.x;
      const dy = contact.y - oldFirst.y;
      if (contact.button === 2) this.panBetween(oldFirst.x, oldFirst.y, contact.x, contact.y, viewport);
      else if (contact.button === 1) this.dolly(Math.exp(Math.max(-20, Math.min(20, dy * 0.01 * this.zoomSpeed))));
      else this.rotate(dx, dy);
    }
  }

  /** End only this pointer; remaining contacts keep their current positions. */
  pointerUp(pointer: Pick<ArcballPointer, "pointerId">): void { this.endPointer(pointer.pointerId); }

  /** Cancellation terminates motion without producing a release action. */
  pointerCancel(pointer: Pick<ArcballPointer, "pointerId">): void {
    if (!this.contacts.has(pointer.pointerId)) return;
    this.endPointer(pointer.pointerId);
    this.clearVelocity();
  }

  /**
   * Damping tick. Returns true while velocity remains. With damping off this
   * is a no-op returning false (mirrors the `TrackballControls` contract).
   */
  update(deltaSeconds = 1 / 60): boolean {
    if (this.disposed || !this.state.enabled || !this.enableDamping) return false;
    assertFinite(deltaSeconds, "deltaSeconds");
    const damping = Math.max(0, Math.min(1, this.dampingFactor * deltaSeconds * 60));
    this.applyRotation(
      this.yawVelocity * damping,
      this.pitchVelocity * damping,
      this.rollVelocity * damping
    );
    const pan = this.panShift(this.panVelocity.x * damping, this.panVelocity.y * damping);
    this.translateCameraAndTarget(pan);
    this.applyDolly(1 + this.dollyVelocity * damping);
    this.yawVelocity -= this.yawVelocity * damping;
    this.pitchVelocity -= this.pitchVelocity * damping;
    this.rollVelocity -= this.rollVelocity * damping;
    this.panVelocity.x -= this.panVelocity.x * damping;
    this.panVelocity.y -= this.panVelocity.y * damping;
    this.dollyVelocity -= this.dollyVelocity * damping;
    this.aimCamera();
    return Math.abs(this.yawVelocity) + Math.abs(this.pitchVelocity) + Math.abs(this.rollVelocity) +
      Math.abs(this.panVelocity.x) + Math.abs(this.panVelocity.y) + Math.abs(this.dollyVelocity) > 1e-6;
  }

  /**
   * Cancel active pointers, release captures and listeners, restore an
   * adjusted near plane, and detach the camera. Idempotent.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disconnect();
    this.restoreNearPlane();
    this.disposed = true;
    this.state.enabled = false;
    this.camera = undefined;
    this.clearVelocity();
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
    if (yaw !== 0) {
      offset = rotateAboutAxis(offset, UP, yaw);
      this.up = rotateAboutAxis(this.up, UP, yaw);
    }
    if (pitch !== 0 || roll !== 0) {
      const viewDir = normalize({ x: -offset.x, y: -offset.y, z: -offset.z });
      const right = this.perpendicularRight(viewDir);
      if (pitch !== 0 && (right.x !== 0 || right.y !== 0 || right.z !== 0)) {
        offset = rotateAboutAxis(offset, right, pitch);
        this.up = rotateAboutAxis(this.up, right, pitch);
      }
      if (roll !== 0) {
        const newView = normalize({ x: -offset.x, y: -offset.y, z: -offset.z });
        this.up = rotateAboutAxis(this.up, newView, roll);
      }
    }
    if (yaw !== 0 || pitch !== 0) {
      offset = this.clampOffset(offset);
      camera.position.x = this.state.target.x + offset.x;
      camera.position.y = this.state.target.y + offset.y;
      camera.position.z = this.state.target.z + offset.z;
    }
    this.state.position.set(camera.position.x, camera.position.y, camera.position.z);
    this.state.rotation.y += yaw;
    this.state.rotation.x += pitch;
    this.state.rotation.z += roll;
    this.aimCamera();
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
    if (isOrthographic(camera)) {
      const zoom = camera.zoom ?? 1;
      camera.zoom = Math.min(this.maxZoom, Math.max(this.minZoom, zoom / scale));
      this.updateProjection();
      this.adjustNear();
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
    this.aimCamera();
    this.adjustNear();
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
    const { right, up } = this.cameraBasis();
    return {
      x: (right.x * -deltaX + up.x * deltaY) * scale,
      y: (right.y * -deltaX + up.y * deltaY) * scale,
      z: (right.z * -deltaX + up.z * deltaY) * scale
    };
  }

  private perpendicularRight(forward: Vector3Like): Vector3Like {
    let right = normalize(cross(forward, this.up));
    if (Math.hypot(right.x, right.y, right.z) < 1e-12) {
      const reference = Math.abs(forward.y) < 0.9 ? UP : { x: 1, y: 0, z: 0 };
      right = normalize(cross(forward, reference));
    }
    return right;
  }

  private cameraBasis(): { forward: Vector3Like; right: Vector3Like; up: Vector3Like } {
    const camera = this.camera;
    if (!camera) throw new Error("ArcballControls requires an attached camera.");
    let forward = normalize(sub(this.state.target, camera.position));
    if (Math.hypot(forward.x, forward.y, forward.z) < 1e-12) forward = { x: 0, y: 0, z: -1 };
    const right = this.perpendicularRight(forward);
    return { forward, right, up: normalize(cross(right, forward)) };
  }

  private aimCamera(): void {
    const camera = this.camera;
    if (!camera) return;
    const { up } = this.cameraBasis();
    this.up = up;
    if (camera.up) {
      camera.up.x = up.x;
      camera.up.y = up.y;
      camera.up.z = up.z;
    }
    camera.lookAt?.(this.state.target, up);
  }

  private translateCameraAndTarget(shift: Vector3Like): void {
    this.state.target.x += shift.x;
    this.state.target.y += shift.y;
    this.state.target.z += shift.z;
    if (this.camera) {
      this.camera.position.x += shift.x;
      this.camera.position.y += shift.y;
      this.camera.position.z += shift.z;
      this.state.position.set(this.camera.position.x, this.camera.position.y, this.camera.position.z);
      this.aimCamera();
    }
  }

  private panBetween(oldX: number, oldY: number, x: number, y: number, viewport?: ArcballViewport): void {
    if (oldX === x && oldY === y) return;
    const camera = this.camera;
    if (viewport && camera && (this.rayFromScreen || camera.rayFromScreen || isOrthographic(camera) || camera.fovYRadians !== undefined)) {
      validateViewport(viewport);
      const normal = this.cameraBasis().forward;
      const before = intersectPlane(this.screenRay(oldX, oldY, viewport), this.state.target, normal);
      // The native ray reflects the actual pose, which may not yet face the
      // target. Account for the aim performed by translateCameraAndTarget.
      if (before && camera.rayFromScreen && !this.rayFromScreen) this.aimCamera();
      const after = intersectPlane(this.screenRay(x, y, viewport), this.state.target, normal);
      if (before && after) {
        this.translateCameraAndTarget(sub(before, after));
        // A later screen-independent damping step would lose the plane anchor.
        this.panVelocity = { x: 0, y: 0 };
        return;
      }
    }
    this.pan(x - oldX, y - oldY);
  }

  private screenRay(x: number, y: number, viewport: ArcballViewport): ArcballRay {
    if (this.rayFromScreen) return this.rayFromScreen(x, y, viewport);
    const camera = this.camera!;
    if (camera.rayFromScreen) return camera.rayFromScreen(x, y, viewport);
    const basis = this.cameraBasis();
    const nx = ((x - viewport.left) / viewport.width) * 2 - 1;
    const ny = 1 - ((y - viewport.top) / viewport.height) * 2;
    if (isOrthographic(camera)) {
      const zoom = camera.zoom ?? 1;
      if (!(zoom > 0) || !Number.isFinite(zoom)) throw new RangeError("ArcballControls camera zoom must be finite and positive.");
      const horizontal = (camera.left! + (nx + 1) * (camera.right! - camera.left!) / 2) / zoom;
      const vertical = (camera.bottom! + (ny + 1) * (camera.top! - camera.bottom!) / 2) / zoom;
      return {
        origin: addScaled(addScaled(camera.position, basis.right, horizontal), basis.up, vertical),
        direction: basis.forward
      };
    }
    const fov = camera.fovYRadians;
    if (fov === undefined || !Number.isFinite(fov) || fov <= 0 || fov >= Math.PI) {
      throw new Error("ArcballControls cursor zoom requires fovYRadians, orthographic extents, or rayFromScreen.");
    }
    const aspect = camera.aspect ?? viewport.width / viewport.height;
    if (!Number.isFinite(aspect) || aspect <= 0) throw new RangeError("ArcballControls camera aspect must be finite and positive.");
    const halfHeight = Math.tan(fov / 2);
    const direction = addScaled(addScaled(basis.forward, basis.right, nx * halfHeight * aspect), basis.up, ny * halfHeight);
    return { origin: { ...camera.position }, direction };
  }

  private updateProjection(): void {
    if (this.camera?.updateProjectionMatrix) this.camera.updateProjectionMatrix();
    else this.camera?.updateCameraMatrices?.();
  }

  private adjustNear(): void {
    const camera = this.camera;
    if (!camera) return;
    if (this.appliedNear === undefined && camera.near !== undefined && Number.isFinite(camera.near) && camera.near > 0) {
      this.originalNear = camera.near;
    }
    if (this.originalNear === undefined) return;
    if (!this.adjustNearPlane) { this.restoreNearPlane(); return; }
    // Re-adopt a caller's later edit instead of overwriting it during cleanup.
    if (this.appliedNear !== undefined && camera.near !== this.appliedNear && camera.near !== undefined && camera.near > 0) {
      this.originalNear = camera.near;
    }
    const near = Math.min(this.originalNear, Math.max(1e-6, this.getDistance() * 0.1));
    if (camera.near !== near) {
      camera.near = near;
      this.appliedNear = near;
      this.updateProjection();
    }
  }

  private restoreNearPlane(): void {
    const camera = this.camera;
    if (camera && this.originalNear !== undefined && this.appliedNear !== undefined && camera.near === this.appliedNear) {
      camera.near = this.originalNear;
      this.updateProjection();
    }
    this.appliedNear = undefined;
  }

  private endPointer(pointerId: number, release = true): void {
    const contact = this.contacts.get(pointerId);
    if (!contact) return;
    this.contacts.delete(pointerId);
    try {
      releasePointerCaptureLease(this.element, pointerId, contact, release);
    } catch { /* capture may already have been lost */ }
  }

  private cancelContacts(): void {
    for (const id of [...this.contacts.keys()]) this.endPointer(id);
    this.clearVelocity();
  }

  private clearVelocity(): void {
    this.yawVelocity = 0;
    this.pitchVelocity = 0;
    this.rollVelocity = 0;
    this.panVelocity = { x: 0, y: 0 };
    this.dollyVelocity = 0;
  }

  private viewport(): ArcballViewport | undefined {
    if (!this.element) return undefined;
    let box: ReturnType<typeof measurePointerContentBox>;
    try {
      box = measurePointerContentBox(this.element, "ArcballControls");
    } catch (error) {
      // A hidden or collapsed element has no usable projection viewport.
      if (error instanceof RangeError) return undefined;
      throw error;
    }
    const origin = box.fromClient(0, 0);
    const sample = box.fromClient(box.width, box.height);
    const scaleX = (sample.x - origin.x) / box.width;
    const scaleY = (sample.y - origin.y) / box.height;
    if (![origin.x, origin.y, scaleX, scaleY, box.width, box.height].every(Number.isFinite) ||
        scaleX <= 0 || scaleY <= 0) return undefined;
    return {
      left: -origin.x / scaleX,
      top: -origin.y / scaleY,
      width: box.width / scaleX,
      height: box.height / scaleY
    };
  }

  private readonly onPointerDown = (event: PointerEvent): void => {
    this.pointerDown(event);
    if (this.contacts.has(event.pointerId)) event.preventDefault();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.contacts.has(event.pointerId)) return;
    this.pointerMove(event, this.viewport());
    event.preventDefault();
  };

  private readonly onPointerUp = (event: PointerEvent): void => { this.pointerUp(event); };
  private readonly onPointerCancel = (event: PointerEvent): void => { this.pointerCancel(event); };
  private readonly onLostPointerCapture = (event: PointerEvent): void => {
    try { if (this.element?.hasPointerCapture?.(event.pointerId)) return; } catch {}
    if (!this.contacts.has(event.pointerId)) return;
    this.endPointer(event.pointerId, false);
    this.clearVelocity();
  };
  private readonly onBlur = (): void => { this.cancelContacts(); };
  private readonly onContextMenu = (event: Event): void => { if (this.state.enabled) event.preventDefault(); };
  private readonly onWheel = (event: WheelEvent): void => {
    if (this.disposed || !this.state.enabled) return;
    const viewport = this.viewport();
    const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? (viewport?.height ?? 1) : 1;
    const scale = Math.exp(Math.max(-20, Math.min(20, event.deltaY * unit * 0.001 * this.zoomSpeed)));
    if (this.cursorZoom && viewport) this.dollyToCursor(scale, event.clientX, event.clientY, viewport);
    else this.dolly(scale);
    event.preventDefault();
  };
}

function isOrthographic(camera: ArcballCameraLike): boolean {
  return [camera.left, camera.right, camera.top, camera.bottom].every((value) => typeof value === "number" && Number.isFinite(value)) &&
    camera.left !== camera.right && camera.top !== camera.bottom;
}

function validateViewport(viewport: ArcballViewport): void {
  if (![viewport.left, viewport.top, viewport.width, viewport.height].every(Number.isFinite) || viewport.width <= 0 || viewport.height <= 0) {
    throw new RangeError("ArcballControls viewport must have finite coordinates and positive dimensions.");
  }
}

function validatePointer(pointer: ArcballPointer): void {
  if (![pointer.pointerId, pointer.clientX, pointer.clientY].every(Number.isFinite)) {
    throw new RangeError("ArcballControls pointer ID and client coordinates must be finite.");
  }
}

function intersectPlane(ray: ArcballRay, point: Vector3Like, normal: Vector3Like): Vector3Like | undefined {
  if (![ray.origin.x, ray.origin.y, ray.origin.z, ray.direction.x, ray.direction.y, ray.direction.z].every(Number.isFinite)) return undefined;
  const denominator = dot(ray.direction, normal);
  if (Math.abs(denominator) < 1e-12) return undefined;
  const distance = dot(sub(point, ray.origin), normal) / denominator;
  if (!Number.isFinite(distance) || distance < 0) return undefined;
  return addScaled(ray.origin, ray.direction, distance);
}
