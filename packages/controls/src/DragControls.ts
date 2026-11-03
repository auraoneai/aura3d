import { pickingRayFromCamera } from "@aura3d/input";
import { composeMat4, invertMat4, multiplyMat4, quatFromEulerXYZ, type Camera, type Mat4, type SceneNode } from "@aura3d/scene";
import { forEachSceneBound, type SelectionBoxBoundsProvider } from "./SelectionBox";
import { Picking, type ExactScenePickHit, type PickingOptions } from "./Picking";
import { measurePointerContentBox } from "./PointerCoordinates";
import { acquirePointerCapture, acquireTouchAction, releasePointerCaptureLease, releaseTouchAction } from "./PointerLeases";
import type { ControlObject3DLike, ControlPickMetadata, Vector3Like } from "./NativeControlTypes";
import { TransformControls } from "./TransformControls";

/** Kept for callers which imported the old compatibility notice. */
export interface DragControlsDeprecation {
  readonly status: "deprecated";
  readonly replacement: "@aura3d/input InteractionSystem + @aura3d/editor-runtime transform commands";
  readonly limitation: string;
}
export const DRAG_CONTROLS_DEPRECATION: DragControlsDeprecation = Object.freeze({
  status: "deprecated",
  replacement: "@aura3d/input InteractionSystem + @aura3d/editor-runtime transform commands",
  limitation: "The explicit delta API is retained for compatibility; pointer-driven dragging is available through DragControlsOptions."
});

export type DragObject = ControlObject3DLike | SceneNode;
export interface DragRay { readonly origin: Vector3Like; readonly direction: Vector3Like }
export interface DragHit<T extends DragObject = DragObject> {
  readonly object: T;
  readonly point: Vector3Like;
  readonly distance: number;
  readonly instanceId?: number;
}
export type DragEventType = "dragstart" | "drag" | "dragend" | "dragcancel" | "hoverenter" | "hoverleave";
export interface DragEvent<T extends DragObject = DragObject> {
  readonly type: DragEventType;
  readonly object: T;
  readonly pointerId: number;
  readonly instanceId?: number;
  readonly point?: Vector3Like;
  readonly originalEvent?: PointerEvent;
}
export type DragListener<T extends DragObject = DragObject> = (event: DragEvent<T>) => void;
export interface DragControlsOptions<T extends DragObject = ControlObject3DLike> {
  readonly transforms?: TransformControls;
  readonly element?: HTMLElement;
  readonly root?: T;
  readonly camera?: Camera;
  readonly rayFromPointer?: (event: PointerEvent) => DragRay;
  readonly hitTest?: (ray: DragRay, event: PointerEvent) => DragHit<T> | readonly DragHit<T>[] | null | undefined;
  readonly picking?: Picking;
  /** Exact adapters may resolve either compatibility objects or native scene nodes. */
  readonly pickOptions?: Omit<PickingOptions, "resolveObject" | "metadata"> & {
    readonly resolveObject?: (hit: ExactScenePickHit) => ControlObject3DLike | SceneNode | undefined;
    readonly metadata?: (object: T) => ControlPickMetadata | undefined;
  };
  readonly bounds?: SelectionBoxBoundsProvider;
  readonly planeNormal?: (hit: DragHit<T>, ray: DragRay) => Vector3Like;
  readonly blurTarget?: EventTarget;
  readonly onEvent?: DragListener<T>;
}

interface ActiveDrag<T extends DragObject> {
  readonly pointerId: number;
  readonly object: T;
  readonly planePoint: Vector3Like;
  readonly planeNormal: Vector3Like;
  readonly startPoint: Vector3Like;
  readonly worldPosition: Vector3Like;
  readonly instanceId?: number;
  readonly instanceTransforms?: Float32Array;
  started: boolean;
}

/**
 * Pointer-driven drag on a plane through the hit. The plane faces the starting
 * ray unless a normal is supplied. Positions are converted back through the
 * current parent transform, so dragging works inside rotated or scaled groups.
 * Legacy explicit `start`/`drag`/`end` calls continue to work.
 */
export class DragControls<T extends DragObject = ControlObject3DLike> {
  dragging: T | null = null;
  readonly transforms: TransformControls;
  private enabledValue = true;
  private disposed = false;
  private readonly ownsTransforms: boolean;
  private readonly picking: Picking;
  private readonly listeners = new Set<DragListener<T>>();
  private readonly hovered = new Map<number, T>();
  private readonly hoverChanges = new Map<number, object>();
  private readonly active = new Map<number, ActiveDrag<T>>();
  private readonly pending = new Map<number, object>();
  private readonly moving = new Map<number, object>();
  private readonly blurTarget?: EventTarget;
  private touchActionAcquired = false;
  private suspending = 0;

  constructor(readonly options: DragControlsOptions<T> = {}) {
    this.transforms = options.transforms ?? new TransformControls();
    this.ownsTransforms = options.transforms === undefined;
    this.picking = options.picking ?? new Picking();
    if (options.onEvent) this.listeners.add(options.onEvent);
    if (options.element) {
      if ((!options.rayFromPointer && !options.camera) || (!options.root && !options.hitTest)) {
        throw new Error("DragControls requires a camera or rayFromPointer and a root or hitTest when an element is provided.");
      }
      const element = options.element;
      element.addEventListener("pointerdown", this.handleDown);
      element.addEventListener("pointermove", this.handleMove);
      element.addEventListener("pointerup", this.handleUp);
      element.addEventListener("pointercancel", this.handleCancel);
      element.addEventListener("lostpointercapture", this.handleLostCapture);
      element.addEventListener("pointerleave", this.handleLeave);
      this.blurTarget = options.blurTarget ?? element.ownerDocument?.defaultView ?? undefined;
      this.blurTarget?.addEventListener("blur", this.handleBlur);
      this.touchActionAcquired = acquireTouchAction(element, this);
    }
  }

  get isDisposed(): boolean { return this.disposed; }
  get enabled(): boolean { return this.enabledValue; }
  set enabled(value: boolean) {
    if (this.enabledValue === value) return;
    this.enabledValue = value;
    if (this.disposed) return;
    const element = this.options.element;
    if (value) {
      if (element && !this.touchActionAcquired) this.touchActionAcquired = acquireTouchAction(element, this);
    } else {
      if (element && this.touchActionAcquired) {
        this.touchActionAcquired = false;
        releaseTouchAction(element, this);
      }
      this.cancelInteractions();
    }
  }
  subscribe(listener: DragListener<T>): () => void {
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(object: T): void {
    if (this.disposed) return;
    this.pending.clear();
    this.moving.clear();
    if (this.active.size) this.finishAll("dragcancel");
    if (this.disposed) return;
    this.dragging = object;
    if (!isSceneNode(object)) {
      this.transforms.attach(object);
      this.transforms.setMode("translate");
    }
  }

  drag(delta: Vector3Like): void {
    if (this.disposed || !this.dragging) return;
    if (isSceneNode(this.dragging)) {
      const position = this.dragging.transform.position;
      this.dragging.transform.setPosition(position[0] + delta.x, position[1] + delta.y, position[2] + delta.z);
    } else this.transforms.apply(delta);
  }

  end(): void {
    this.pending.clear();
    this.moving.clear();
    if (this.active.size) this.finishAll("dragend");
    else {
      this.dragging = null;
      this.transforms.detach();
    }
  }

  dispose(options: { readonly disposeTransforms?: boolean } = {}): void {
    if (this.disposed) return;
    this.disposed = true;
    let failure: unknown;
    let failed = false;
    const attempt = (operation: () => void): void => {
      try { operation(); } catch (error) {
        if (!failed) { failure = error; failed = true; }
      }
    };
    this.pending.clear();
    this.moving.clear();
    const element = this.options.element;
    attempt(() => element?.removeEventListener("pointerdown", this.handleDown));
    attempt(() => element?.removeEventListener("pointermove", this.handleMove));
    attempt(() => element?.removeEventListener("pointerup", this.handleUp));
    attempt(() => element?.removeEventListener("pointercancel", this.handleCancel));
    attempt(() => element?.removeEventListener("lostpointercapture", this.handleLostCapture));
    attempt(() => element?.removeEventListener("pointerleave", this.handleLeave));
    attempt(() => this.blurTarget?.removeEventListener("blur", this.handleBlur));
    if (element && this.touchActionAcquired) {
      this.touchActionAcquired = false;
      attempt(() => releaseTouchAction(element, this));
    }
    const activeDrags = [...this.active.values()];
    for (const active of activeDrags) attempt(() => this.finish(active, "dragcancel"));
    // finish normally releases capture, but a custom transform helper may
    // throw while detaching before it gets that far.
    for (const active of activeDrags) attempt(() => {
      releasePointerCaptureLease(element, active.pointerId, active, true);
    });
    for (const pointerId of [...this.hovered.keys()]) {
      attempt(() => this.setHover(pointerId, undefined));
    }
    this.hovered.clear();
    this.dragging = null;
    attempt(() => this.transforms.detach());
    if (options.disposeTransforms ?? this.ownsTransforms) attempt(() => this.transforms.dispose());
    this.listeners.clear();
    if (failed) throw failure;
  }

  private readonly handleDown = (event: PointerEvent): void => {
    const pointerId = event.pointerId;
    if (this.disposed || !this.enabled || this.suspending || this.active.has(pointerId) || this.pending.has(pointerId) ||
        (event.pointerType !== "touch" && event.button !== 0)) return;
    this.moving.delete(pointerId);
    const token = {};
    this.pending.set(pointerId, token);
    const current = (): boolean => !this.disposed && this.enabled && !this.suspending && this.pending.get(pointerId) === token;
    try {
      const ray = this.ray(event);
      if (!current()) return;
      const hit = this.hit(ray, event);
      if (!current()) return;
      this.setHover(pointerId, hit?.object, event);
      if (!current() || !hit || !validTarget(hit.object, hit.instanceId) || this.ownedTarget(hit.object, hit.instanceId)) return;
      const normal = normalize(this.options.planeNormal?.(hit, ray) ?? ray.direction);
      if (!current()) return;
      const point = intersectPlane(ray, hit.point, normal);
      if (!point) return;
      const worldPosition = getWorldPosition(hit.object, hit.instanceId);
      if (!current() || !validTarget(hit.object, hit.instanceId) || this.ownedTarget(hit.object, hit.instanceId)) return;
      const instanceTransforms = isSceneNode(hit.object) && hit.instanceId !== undefined
        ? hit.object.renderable?.instanceTransforms : undefined;
      const active: ActiveDrag<T> = {
        pointerId, object: hit.object, planePoint: copy(hit.point), planeNormal: normal,
        startPoint: point, worldPosition, instanceId: hit.instanceId, instanceTransforms, started: false
      };
      const previous = this.primary();
      this.active.set(pointerId, active);
      this.pending.delete(pointerId);
      try {
        this.updatePrimary(previous);
      } catch (error) {
        try { this.finish(active, "dragcancel"); } catch {}
        throw error;
      }
      if (this.active.get(pointerId) !== active) return;
      let captureFailed = false;
      try { acquirePointerCapture(this.options.element, pointerId, active); } catch { /* Capture is optional or already lost. */ captureFailed = true; }
      if (captureFailed) {
        if (this.active.get(pointerId) === active) this.terminatePointer(event, "dragcancel");
        return;
      }
      if (this.active.get(pointerId) !== active) return;
      active.started = true;
      this.emit({ type: "dragstart", object: hit.object, pointerId, instanceId: active.instanceId, point, originalEvent: event },
        () => this.active.get(pointerId) === active);
    } finally {
      if (this.pending.get(pointerId) === token) this.pending.delete(pointerId);
    }
  };

  private readonly handleMove = (event: PointerEvent): void => {
    if (this.disposed || !this.enabled || this.suspending) return;
    const pointerId = event.pointerId;
    const active = this.active.get(pointerId);
    if (active && !validActiveTarget(active)) {
      this.terminatePointer(event, "dragcancel");
      return;
    }
    const token = {};
    this.moving.set(pointerId, token);
    const current = (): boolean => !this.disposed && this.enabled && !this.suspending &&
      this.moving.get(pointerId) === token && this.active.get(pointerId) === active;
    try {
      let ray: DragRay;
      try {
        ray = this.ray(event);
      } catch (error) {
        if (active && current()) {
          try { this.terminatePointer(event, "dragcancel"); } catch {}
        }
        throw error;
      }
      if (!current()) return;
      if (active) {
        if (!validActiveTarget(active)) {
          this.terminatePointer(event, "dragcancel");
          return;
        }
        const point = intersectPlane(ray, active.planePoint, active.planeNormal);
        if (!point) return;
        const world = { x: active.worldPosition.x + point.x - active.startPoint.x, y: active.worldPosition.y + point.y - active.startPoint.y, z: active.worldPosition.z + point.z - active.startPoint.z };
        let moved: boolean;
        try {
          moved = setWorldPosition(active.object, world, active.instanceId, active.instanceTransforms);
        } catch (error) {
          if (current()) {
            try { this.terminatePointer(event, "dragcancel"); } catch {}
          }
          throw error;
        }
        if (!moved) {
          if (current()) this.terminatePointer(event, "dragcancel");
          return;
        }
        if (!current()) return;
        this.emit({ type: "drag", object: active.object, pointerId, instanceId: active.instanceId, point, originalEvent: event },
          () => current());
        return;
      }
      const hit = this.hit(ray, event);
      if (current()) this.setHover(pointerId, hit?.object, event);
    } finally {
      if (this.moving.get(pointerId) === token) this.moving.delete(pointerId);
    }
  };

  private readonly handleUp = (event: PointerEvent): void => {
    this.terminatePointer(event, "dragend", true, event.pointerType === "touch");
  };
  private readonly handleCancel = (event: PointerEvent): void => {
    this.terminatePointer(event, "dragcancel");
  };
  private readonly handleLostCapture = (event: PointerEvent): void => {
    // Ignore a queued loss from an earlier press if this pointer owns a new capture.
    try { if (this.options.element?.hasPointerCapture?.(event.pointerId)) return; } catch { /* Treat an unavailable capture as lost. */ }
    this.terminatePointer(event, "dragcancel", false);
  };
  private readonly handleLeave = (event: PointerEvent): void => { this.setHover(event.pointerId, undefined, event); };
  private readonly handleBlur = (): void => { this.cancelInteractions(); };

  private primary(): ActiveDrag<T> | undefined {
    return this.active.values().next().value;
  }

  private ownedTarget(object: T, instanceId?: number): boolean {
    for (const active of this.active.values()) {
      if (active.object === object && (active.instanceId === undefined || instanceId === undefined || active.instanceId === instanceId)) return true;
    }
    return false;
  }

  private updatePrimary(previous?: ActiveDrag<T>): void {
    const next = this.primary();
    this.dragging = next?.object ?? null;
    if (next === previous) return;
    if (next && !this.disposed && !isSceneNode(next.object)) {
      this.transforms.attach(next.object);
      if (this.primary() === next && !this.disposed) this.transforms.setMode("translate");
    } else if (previous || this.transforms.object) {
      this.transforms.detach();
    }
  }

  private finish(active: ActiveDrag<T>, type: "dragend" | "dragcancel", event?: PointerEvent, release = true): void {
    if (this.active.get(active.pointerId) !== active) return;
    const terminalType = type === "dragend" && !validActiveTarget(active) ? "dragcancel" : type;
    const previous = this.primary();
    this.active.delete(active.pointerId);
    let failure: unknown;
    let failed = false;
    const attempt = (operation: () => void): void => {
      try { operation(); } catch (error) {
        if (!failed) { failure = error; failed = true; }
      }
    };
    if (previous === active) attempt(() => this.updatePrimary(previous));
    try {
      releasePointerCaptureLease(this.options.element, active.pointerId, active, release);
    } catch { /* Browsers can release capture before the event is delivered. */ }
    if (active.started) attempt(() => this.emit({
      type: terminalType, object: active.object, pointerId: active.pointerId, instanceId: active.instanceId, originalEvent: event
    }));
    if (failed) throw failure;
  }

  private terminatePointer(event: PointerEvent, type: "dragend" | "dragcancel", release = true, clearHover = true): void {
    const pointerId = event.pointerId;
    this.pending.delete(pointerId);
    this.moving.delete(pointerId);
    let failure: unknown;
    let failed = false;
    const attempt = (operation: () => void): void => {
      try { operation(); } catch (error) {
        if (!failed) { failure = error; failed = true; }
      }
    };
    const active = this.active.get(pointerId);
    if (active) attempt(() => this.finish(active, type, event, release));
    if (clearHover && !this.active.has(pointerId) && !this.pending.has(pointerId)) {
      attempt(() => this.setHover(pointerId, undefined, event));
    }
    if (failed) throw failure;
  }

  private finishAll(type: "dragend" | "dragcancel"): void {
    let failure: unknown;
    let failed = false;
    this.suspending += 1;
    try {
      for (const active of [...this.active.values()]) {
        try { this.finish(active, type); } catch (error) {
          if (!failed) { failure = error; failed = true; }
        }
      }
    } finally {
      this.suspending -= 1;
    }
    if (failed) throw failure;
  }

  private cancelInteractions(): void {
    let failure: unknown;
    let failed = false;
    this.suspending += 1;
    this.pending.clear();
    this.moving.clear();
    try {
      try { this.finishAll("dragcancel"); } catch (error) { failure = error; failed = true; }
      for (const pointerId of [...this.hovered.keys()]) {
        try { this.setHover(pointerId, undefined); } catch (error) {
          if (!failed) { failure = error; failed = true; }
        }
      }
    } finally {
      this.suspending -= 1;
    }
    if (failed) throw failure;
  }

  private setHover(pointerId: number, object?: T, event?: PointerEvent): void {
    const token = {};
    this.hoverChanges.set(pointerId, token);
    const previous = this.hovered.get(pointerId);
    try {
      if (previous === object) return;
      if (previous) {
        this.hovered.delete(pointerId);
        this.emit({ type: "hoverleave", object: previous, pointerId, originalEvent: event });
      }
      if (object && !this.disposed && this.hoverChanges.get(pointerId) === token) {
        this.hovered.set(pointerId, object);
        this.emit({ type: "hoverenter", object, pointerId, originalEvent: event });
      }
    } finally {
      if (this.hoverChanges.get(pointerId) === token) this.hoverChanges.delete(pointerId);
    }
  }

  private emit(event: DragEvent<T>, current?: () => boolean): void {
    let failure: unknown;
    let failed = false;
    for (const listener of [...this.listeners]) {
      if (current && !current()) break;
      if (!this.listeners.has(listener)) continue;
      try { listener(event); } catch (error) {
        if (!failed) { failure = error; failed = true; }
      }
    }
    if (failed) throw failure;
  }

  private ray(event: PointerEvent): DragRay {
    const ray = this.options.rayFromPointer?.(event) ?? this.cameraRay(event);
    if (![ray.origin.x, ray.origin.y, ray.origin.z].every(Number.isFinite)) throw new RangeError("DragControls ray origin must be finite.");
    return { origin: copy(ray.origin), direction: normalize(ray.direction) };
  }

  private cameraRay(event: PointerEvent): DragRay {
    const camera = this.options.camera!;
    const box = measurePointerContentBox(this.options.element!, "DragControls");
    const { x, y } = box.fromClient(event.clientX, event.clientY);
    const viewport = camera.viewport.width === 1 && camera.viewport.height === 1
      ? { x: 0, y: 0, width: box.width, height: box.height } : camera.viewport;
    return pickingRayFromCamera(camera, x, y, viewport);
  }

  private hit(ray: DragRay, event: PointerEvent): DragHit<T> | undefined {
    if (this.options.hitTest) {
      const value = this.options.hitTest(ray, event);
      const hits: readonly DragHit<T>[] = Array.isArray(value) ? value : value ? [value as DragHit<T>] : [];
      return [...hits].filter((hit) => Number.isFinite(hit.distance) && hit.distance >= 0).sort((a, b) => a.distance - b.distance)[0];
    }
    const root = this.options.root;
    if (!root) return undefined;
    if (isSceneNode(root)) return (this.options.pickOptions?.mode === "exact"
      ? pickSceneExact(root, ray, this.options.pickOptions as NonNullable<DragControlsOptions<SceneNode>["pickOptions"]>)
      : pickSceneBounds(root, ray, this.options.bounds)) as DragHit<T> | undefined;
    const hit = this.picking.pick(root, ray.origin, ray.direction, this.options.pickOptions as PickingOptions | undefined);
    return hit ? { object: hit.object as T, point: hit.point, distance: hit.distance, instanceId: hit.instanceId ?? hit.metadata?.instanceId } : undefined;
  }
}

function isSceneNode(object: DragObject): object is SceneNode {
  return "transform" in object && "updateWorldTransform" in object;
}
function validTarget(object: DragObject, instanceId?: number): boolean {
  if (!isSceneNode(object)) return instanceId === undefined;
  if (object.disposed) return false;
  if (instanceId === undefined) return true;
  const transforms = object.renderable?.instanceTransforms;
  return Number.isInteger(instanceId) && instanceId >= 0 && !!transforms && instanceId * 16 + 15 < transforms.length;
}
function validActiveTarget<T extends DragObject>(active: ActiveDrag<T>): boolean {
  return validTarget(active.object, active.instanceId) && (active.instanceId === undefined ||
    (isSceneNode(active.object) && active.object.renderable?.instanceTransforms === active.instanceTransforms));
}
function copy(v: Vector3Like): Vector3Like { return { x: v.x, y: v.y, z: v.z }; }
function normalize(v: Vector3Like): Vector3Like {
  const length = Math.hypot(v.x, v.y, v.z);
  if (!(length > 1e-12) || !Number.isFinite(length)) throw new RangeError("DragControls direction must be finite and nonzero.");
  return { x: v.x / length, y: v.y / length, z: v.z / length };
}
function dot(a: Vector3Like, b: Vector3Like): number { return a.x * b.x + a.y * b.y + a.z * b.z; }
function intersectPlane(ray: DragRay, plane: Vector3Like, normal: Vector3Like): Vector3Like | undefined {
  const denominator = dot(ray.direction, normal);
  if (Math.abs(denominator) < 1e-10) return undefined;
  const t = dot({ x: plane.x - ray.origin.x, y: plane.y - ray.origin.y, z: plane.z - ray.origin.z }, normal) / denominator;
  if (!Number.isFinite(t) || t < 0) return undefined;
  return { x: ray.origin.x + t * ray.direction.x, y: ray.origin.y + t * ray.direction.y, z: ray.origin.z + t * ray.direction.z };
}
function refresh(node: SceneNode): void {
  let root = node;
  while (root.parent) root = root.parent;
  root.updateWorldTransform();
}
function getWorldPosition(object: DragObject, instanceId?: number): Vector3Like {
  if (isSceneNode(object)) {
    refresh(object);
    const matrix = object.transform.worldMatrix;
    const transforms = object.renderable?.instanceTransforms;
    if (instanceId !== undefined && transforms && instanceId >= 0 && instanceId * 16 + 15 < transforms.length) {
      return applyPoint(matrix, { x: transforms[instanceId * 16 + 12]!, y: transforms[instanceId * 16 + 13]!, z: transforms[instanceId * 16 + 14]! }, 1);
    }
    return { x: matrix[12], y: matrix[13], z: matrix[14] };
  }
  const matrix = parentMatrix(object);
  return matrix ? applyPoint(matrix, object.position, 1) : copy(object.position);
}
function setWorldPosition(object: DragObject, world: Vector3Like, instanceId?: number, instanceTransforms?: Float32Array): boolean {
  if (!validTarget(object, instanceId) || ![world.x, world.y, world.z].every(Number.isFinite)) return false;
  if (isSceneNode(object)) {
    const transforms = object.renderable?.instanceTransforms;
    if (instanceId !== undefined) {
      if (!transforms || transforms !== instanceTransforms) return false;
      refresh(object);
      if (!validTarget(object, instanceId) || object.renderable?.instanceTransforms !== transforms) return false;
      let inverse: Mat4;
      try { inverse = invertMat4(object.transform.worldMatrix); } catch { return false; }
      const local = applyPoint(inverse, world, 1);
      if (![local.x, local.y, local.z].every(Number.isFinite)) return false;
      transforms[instanceId * 16 + 12] = local.x;
      transforms[instanceId * 16 + 13] = local.y;
      transforms[instanceId * 16 + 14] = local.z;
      return true;
    }
    if (object.parent) refresh(object.parent);
    if (object.disposed) return false;
    // Preserve pivot and local orientation by applying the world-origin delta.
    const current = getWorldPosition(object);
    const difference = { x: world.x - current.x, y: world.y - current.y, z: world.z - current.z };
    let localDelta = difference;
    if (object.parent) {
      let inverse: Mat4;
      try { inverse = invertMat4(object.parent.transform.worldMatrix); } catch { return false; }
      localDelta = applyPoint(inverse, difference, 0);
    }
    const position = object.transform.position;
    if ([localDelta.x, localDelta.y, localDelta.z].every(Number.isFinite)) {
      if (!object.transform.matrixAutoUpdate) {
        const matrix = [...object.transform.localMatrix] as Mat4;
        matrix[12] += localDelta.x;
        matrix[13] += localDelta.y;
        matrix[14] += localDelta.z;
        object.transform.setLocalMatrix(matrix, { matrixAutoUpdate: false });
        return true;
      }
      object.transform.setPosition(position[0] + localDelta.x, position[1] + localDelta.y, position[2] + localDelta.z);
      return true;
    }
    return false;
  }
  const matrix = parentMatrix(object);
  let local = world;
  if (matrix) {
    let inverse: Mat4;
    try { inverse = invertMat4(matrix); } catch { return false; }
    local = applyPoint(inverse, world, 1);
  }
  if (![local.x, local.y, local.z].every(Number.isFinite)) return false;
  object.position.x = local.x; object.position.y = local.y; object.position.z = local.z;
  return true;
}
function parentMatrix(object: ControlObject3DLike): Mat4 | undefined {
  interface ParentLike {
    readonly parent?: ParentLike | null;
    readonly position?: Vector3Like;
    readonly rotation?: Vector3Like;
    readonly scale?: Vector3Like;
    readonly matrixWorld?: ArrayLike<number> | { readonly elements: ArrayLike<number> };
    readonly transform?: { readonly worldMatrix?: ArrayLike<number> };
    updateWorldTransform?(): void;
  }
  const parent = (object as ControlObject3DLike & { parent?: ParentLike | null }).parent;
  if (!parent) return undefined;
  parent?.updateWorldTransform?.();
  const calculate = (node: ParentLike): Mat4 => {
    const source = node.transform?.worldMatrix ?? node.matrixWorld;
    const data = source && "elements" in Object(source) ? (source as { elements: ArrayLike<number> }).elements : source as ArrayLike<number> | undefined;
    if (data?.length === 16) return Array.from(data) as Mat4;
    const p = node.position ?? { x: 0, y: 0, z: 0 };
    const r = node.rotation ?? { x: 0, y: 0, z: 0 };
    const s = node.scale ?? { x: 1, y: 1, z: 1 };
    const local = composeMat4([p.x, p.y, p.z], quatFromEulerXYZ(r.x, r.y, r.z), [s.x, s.y, s.z]);
    return node.parent ? multiplyMat4(calculate(node.parent), local) : local;
  };
  return calculate(parent);
}
function applyPoint(matrix: Mat4, point: Vector3Like, w: number): Vector3Like {
  return { x: matrix[0] * point.x + matrix[4] * point.y + matrix[8] * point.z + matrix[12] * w,
    y: matrix[1] * point.x + matrix[5] * point.y + matrix[9] * point.z + matrix[13] * w,
    z: matrix[2] * point.x + matrix[6] * point.y + matrix[10] * point.z + matrix[14] * w };
}

/** Resolve exact query identities within the native subtree, never its bounds. */
function pickSceneExact(root: SceneNode, ray: DragRay, options: NonNullable<DragControlsOptions<SceneNode>["pickOptions"]>): DragHit<SceneNode> | undefined {
  const range = (value: number, label: string, minimum: number): number => {
    if (label === "far" && value === Infinity) return value;
    if (!Number.isFinite(value) || value < minimum) throw new RangeError(`Picking ${label} must be finite and >= ${minimum}.`);
    return value;
  };
  const near = range(options.near ?? 0, "near", 0);
  const far = range(options.far ?? Infinity, "far", near);
  range(options.tolerance ?? 0, "tolerance", 0);
  if (!options.query) throw new Error("Picking exact mode requires a scene query adapter.");

  const nodes = new Set<SceneNode>();
  const byId = new Map<string, SceneNode | null>();
  const byName = new Map<string, SceneNode | null>();
  const visibility = new Map<SceneNode, boolean>();
  const walk = (node: SceneNode, parentVisible: boolean): void => {
    nodes.add(node);
    byId.set(node.id, byId.has(node.id) ? null : node);
    if (node.name) byName.set(node.name, byName.has(node.name) ? null : node);
    const visible = parentVisible && node.visible && !node.disposed;
    visibility.set(node, visible);
    for (const child of node.children) walk(child, visible);
  };
  walk(root, true);

  const rawHits = options.query({
    origin: [ray.origin.x, ray.origin.y, ray.origin.z],
    direction: [ray.direction.x, ray.direction.y, ray.direction.z],
    ...(Number.isFinite(far) ? { maxDistance: far } : {})
  }, { mode: "mesh", near, far, recursive: true, firstHitOnly: false });
  const hits: { readonly hit: DragHit<SceneNode>; readonly priority: number }[] = [];
  for (const raw of rawHits) {
    if (!Number.isFinite(raw.distance) || raw.distance < near || raw.distance > far) continue;
    const mapped = raw.object ?? options.resolveObject?.(raw);
    const candidate = mapped ?? (raw.nodeId && byId.has(raw.nodeId) ? byId.get(raw.nodeId) : raw.nodeName ? byName.get(raw.nodeName) : undefined);
    if (!candidate || !nodes.has(candidate as SceneNode)) {
      throw new Error(`Picking could not uniquely resolve exact scene hit ${raw.nodeId ?? raw.nodeName ?? "without an identity"}; provide resolveObject.`);
    }
    const node = candidate as SceneNode;
    if (node.disposed || (!visibility.get(node) && !options.includeInvisible)) continue;
    const authored = node.userData.a3dPicking ?? node.userData.picking;
    const metadata = options.metadata?.(node)
      ?? (authored && typeof authored === "object" ? authored as ControlPickMetadata : undefined);
    if (metadata?.selectable === false) continue;
    if (!raw.point.every(Number.isFinite)) throw new RangeError("Picking exact query returned a non-finite point.");
    if (raw.normal && !raw.normal.every(Number.isFinite)) throw new RangeError("Picking exact query returned a non-finite normal.");
    hits.push({
      hit: { object: node, distance: raw.distance, point: { x: raw.point[0], y: raw.point[1], z: raw.point[2] }, instanceId: raw.instanceId },
      priority: metadata?.priority ?? 0
    });
  }
  hits.sort((a, b) => Math.abs(a.hit.distance - b.hit.distance) > 1e-8
    ? a.hit.distance - b.hit.distance : b.priority - a.priority);
  return hits[0]?.hit;
}

function pickSceneBounds(root: SceneNode, ray: DragRay, bounds?: SelectionBoxBoundsProvider): DragHit | undefined {
  let nearest: DragHit | undefined;
  forEachSceneBound(root, { bounds }, (object, box, matrix, instanceId) => {
    let inverse: Mat4;
    try { inverse = invertMat4(matrix); } catch { return; }
    const origin = applyPoint(inverse, ray.origin, 1);
    const direction = applyPoint(inverse, ray.direction, 0);
    let near = 0; let far = Infinity;
    const origins = [origin.x, origin.y, origin.z];
    const directions = [direction.x, direction.y, direction.z];
    for (let axis = 0; axis < 3; axis += 1) {
      if (Math.abs(directions[axis]!) < 1e-12) {
        if (origins[axis]! < box.min[axis]! || origins[axis]! > box.max[axis]!) return;
        continue;
      }
      let a = (box.min[axis]! - origins[axis]!) / directions[axis]!;
      let b = (box.max[axis]! - origins[axis]!) / directions[axis]!;
      if (a > b) [a, b] = [b, a];
      near = Math.max(near, a); far = Math.min(far, b);
      if (near > far) return;
    }
    if (!nearest || near < nearest.distance) nearest = { object, distance: near, point: { x: ray.origin.x + near * ray.direction.x, y: ray.origin.y + near * ray.direction.y, z: ray.origin.z + near * ray.direction.z }, instanceId };
  });
  return nearest;
}
