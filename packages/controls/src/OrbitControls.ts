import { InputSnapshot, OrbitControls as OrbitControlsEngine, type OrbitControlsOptions } from "@aura3d/input";
import { createDefaultControlState, type ThreeCompatControlState } from "./ControlState";
import type { Vector3Like } from "./NativeControlTypes";

export type { OrbitControlsOptions };

export interface OrbitCameraLike {
  position: Vector3Like;
  lookAt?(target: Vector3Like): void;
}

function pointerDrag(button: number, deltaX: number, deltaY: number): InputSnapshot {
  return new InputSnapshot({
    pointer: {
      deltaX,
      deltaY,
      buttons: new Map([[button, { down: true, pressed: true, released: false }]])
    }
  });
}

/**
 * Three.js-compatible orbit controls.
 *
 * Two modes:
 *
 * - Camera-attached (`new OrbitControls(camera, options)`): all motion is
 *   delegated to the `@aura3d/input` orbit implementation, which owns the real
 *   spherical camera math, distance/polar clamping, and `saveState`/`reset`.
 *   `state` mirrors the camera the engine produced. This is the supported path.
 * - Detached (`new OrbitControls()`): there is no camera to drive, so
 *   `rotate`/`pan`/`dolly` only accumulate bookkeeping numbers on `state`.
 *   Those numbers are not a camera pose and carry no parity claim. This mode
 *   exists so `TrackballControls` and existing detached callers keep working;
 *   new code should attach a camera.
 */
export class OrbitControls {
  readonly state: ThreeCompatControlState = createDefaultControlState();
  enablePan = true;
  enableZoom = true;
  enableRotate = true;

  private readonly engine: OrbitControlsEngine | undefined;
  private attachedCamera: OrbitCameraLike | undefined;

  constructor(camera?: OrbitCameraLike, options: OrbitControlsOptions = {}) {
    if (!camera) return;
    this.engine = new OrbitControlsEngine(camera, options);
    this.enablePan = this.engine.enablePan;
    this.enableZoom = this.engine.enableZoom;
    this.enableRotate = this.engine.enableRotate;
    this.syncState(camera);
  }

  /** True when a camera is attached and motion is delegated to the real engine. */
  get isCameraAttached(): boolean {
    return this.engine !== undefined;
  }

  /**
   * Drive the controls from an input snapshot. Camera-attached only; a detached
   * instance has no camera to move and ignores the snapshot.
   *
   * Named `applyInput` rather than `update` because `TrackballControls`
   * overrides `update(deltaSeconds)` with damping-tick semantics.
   */
  applyInput(snapshot: InputSnapshot): void {
    const engine = this.engine;
    if (!engine) return;
    this.pushFlags(engine);
    engine.update(snapshot);
    this.syncState();
  }

  rotate(deltaX: number, deltaY: number): void {
    if (!this.enableRotate) return;
    if (this.engine) {
      this.pushFlags(this.engine);
      this.engine.update(pointerDrag(0, deltaX, deltaY));
      this.syncState();
      return;
    }
    this.state.rotation.x += deltaY;
    this.state.rotation.y += deltaX;
  }

  pan(deltaX: number, deltaY: number): void {
    if (!this.enablePan) return;
    if (this.engine) {
      this.pushFlags(this.engine);
      this.engine.update(pointerDrag(2, deltaX, deltaY));
      this.syncState();
      return;
    }
    this.state.target.x += deltaX;
    this.state.target.y += deltaY;
  }

  dolly(scale: number): void {
    if (!this.enableZoom) return;
    if (this.engine) {
      this.pushFlags(this.engine);
      this.engine.update(new InputSnapshot({ pointer: { wheelY: scale < 1 ? -100 : 100 } }));
      this.syncState();
      return;
    }
    this.state.position.z *= scale;
  }

  /** Camera-attached only; returns 0 when detached. */
  getAzimuthalAngle(): number {
    return this.engine?.getAzimuthalAngle() ?? 0;
  }

  /** Camera-attached only; returns 0 when detached. */
  getPolarAngle(): number {
    return this.engine?.getPolarAngle() ?? 0;
  }

  /** Camera-attached only; returns 0 when detached. */
  getDistance(): number {
    return this.engine?.getDistance() ?? 0;
  }

  /** Camera-attached only; no-op when detached. */
  saveState(): void {
    this.engine?.saveState();
  }

  /** Camera-attached only; no-op when detached. */
  reset(): void {
    if (!this.engine) return;
    this.engine.reset();
    this.syncState();
  }

  dispose(): void {
    this.engine?.dispose();
  }

  /**
   * Move the orbit target on the XZ ground plane. Camera-attached instances
   * move the engine target (and therefore the camera); detached instances only
   * update `state.target` bookkeeping.
   */
  protected truckTarget(deltaX: number, deltaZ: number): void {
    const engine = this.engine;
    if (!engine) {
      this.state.target.x += deltaX;
      this.state.target.z += deltaZ;
      return;
    }
    engine.target.x += deltaX;
    engine.target.z += deltaZ;
    engine.update(new InputSnapshot());
    this.syncState();
  }

  private pushFlags(engine: OrbitControlsEngine): void {
    engine.enablePan = this.enablePan;
    engine.enableZoom = this.enableZoom;
    engine.enableRotate = this.enableRotate;
  }

  private syncState(camera?: OrbitCameraLike): void {
    const engine = this.engine;
    if (!engine) return;
    const source = camera ?? this.attachedCamera;
    if (source) {
      this.state.position.set(source.position.x, source.position.y, source.position.z);
    }
    this.state.target.set(engine.target.x, engine.target.y, engine.target.z);
    this.state.rotation.set(engine.getPolarAngle(), engine.getAzimuthalAngle(), this.state.rotation.z);
    this.attachedCamera = source;
  }
}
