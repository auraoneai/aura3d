import { pickingRayFromCamera } from "@aura3d/input";
import { invertMat4, type Camera, type Mat4, type SceneNode } from "@aura3d/scene";
import type { Vector3Like } from "./NativeControlTypes";
import { forEachSceneBound, type SelectionBoxBoundsProvider, type SelectionBoxBounds } from "./SelectionBox";
import { measurePointerContentBox } from "./PointerCoordinates";
import { acquirePointerCapture, releasePointerCaptureLease } from "./PointerLeases";

export interface InteractiveGroupRay { readonly origin: Vector3Like; readonly direction: Vector3Like }
export interface InteractiveGroupHit {
  readonly object: SceneNode;
  readonly distance: number;
  readonly point: Vector3Like;
  readonly instanceId?: number;
}
export type InteractiveGroupEventType = "pointerdown" | "pointermove" | "pointerup" | "pointercancel" | "pointerenter" | "pointerleave" | "click";
export interface InteractiveGroupEvent {
  readonly type: InteractiveGroupEventType;
  readonly pointerId: number;
  readonly target: SceneNode;
  readonly currentTarget: SceneNode;
  readonly hit: InteractiveGroupHit;
  readonly originalEvent?: PointerEvent;
  /** Stop this event from bubbling to further scene ancestors. */
  stopPropagation(): void;
}
export type InteractiveGroupListener = (event: InteractiveGroupEvent) => void;
export interface InteractiveGroupOptions {
  readonly element: HTMLElement;
  readonly root: SceneNode;
  /** Native camera used to unproject client coordinates through this canvas. */
  readonly camera?: Camera;
  /** Override camera unprojection, for example with a custom projection. */
  readonly rayFromPointer?: (event: PointerEvent) => InteractiveGroupRay;
  /** Supply exact mesh hits (nearest or all) when geometry precision is needed. */
  readonly hitTest?: (ray: InteractiveGroupRay, root: SceneNode, event: PointerEvent) => InteractiveGroupHit | readonly InteractiveGroupHit[] | null | undefined;
  /** Current local-space animated bounds used by the built-in bounds query. */
  readonly bounds?: SelectionBoxBoundsProvider;
  /** An alternate blur event target, useful when the canvas is in another window. */
  readonly blurTarget?: EventTarget;
}

interface PointerState {
  pressed?: InteractiveGroupHit;
  hover?: InteractiveGroupHit;
  capture?: object;
}

/**
 * Route canvas pointer events through a native scene hierarchy. By default the
 * query intersects current local bounds transformed by each node and instance;
 * applications may inject an exact triangle query with `hitTest`. Listeners
 * bubble from the hit node to its ancestors. Contacts and capture are owned
 * independently and cancellation never dispatches a click.
 */
export class InteractiveGroup {
  private readonly listeners = new Map<SceneNode, Map<InteractiveGroupEventType, Set<InteractiveGroupListener>>>();
  private readonly pointers = new Map<number, PointerState>();
  private readonly pending = new Map<number, object>();
  private readonly blurTarget?: EventTarget;
  private disposed = false;

  constructor(readonly options: InteractiveGroupOptions) {
    if (!options.camera && !options.rayFromPointer) {
      throw new Error("InteractiveGroup requires a camera or rayFromPointer.");
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
  }

  get isDisposed(): boolean { return this.disposed; }

  on(object: SceneNode, type: InteractiveGroupEventType, listener: InteractiveGroupListener): () => void {
    if (this.disposed) return () => {};
    const byType = this.listeners.get(object) ?? new Map<InteractiveGroupEventType, Set<InteractiveGroupListener>>();
    const handlers = byType.get(type) ?? new Set<InteractiveGroupListener>();
    handlers.add(listener);
    byType.set(type, handlers);
    this.listeners.set(object, byType);
    return () => {
      handlers.delete(listener);
      if (!handlers.size) byType.delete(type);
      if (!byType.size) this.listeners.delete(object);
    };
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pending.clear();
    const element = this.options.element;
    element.removeEventListener("pointerdown", this.handleDown);
    element.removeEventListener("pointermove", this.handleMove);
    element.removeEventListener("pointerup", this.handleUp);
    element.removeEventListener("pointercancel", this.handleCancel);
    element.removeEventListener("lostpointercapture", this.handleLostCapture);
    element.removeEventListener("pointerleave", this.handleLeave);
    this.blurTarget?.removeEventListener("blur", this.handleBlur);
    let failure: unknown;
    let failed = false;
    for (const id of [...this.pointers.keys()]) {
      try { this.cancel(id, undefined, true); } catch (error) {
        if (!failed) { failure = error; failed = true; }
      }
    }
    this.listeners.clear();
    if (failed) throw failure;
  }

  private readonly handleDown = (event: PointerEvent): void => {
    const id = event.pointerId;
    if (this.disposed || this.pending.has(id)) return;
    if (this.pointers.get(id)?.pressed) {
      this.cancel(id, event, true);
      if (this.disposed || this.pending.has(id) || this.pointers.get(id)?.pressed) return;
    }
    const pending = {};
    this.pending.set(id, pending);
    const current = (): boolean => !this.disposed && this.pending.get(id) === pending;
    try {
      const hit = this.hit(event);
      if (!current()) return;
      const state = this.pointers.get(id) ?? {};
      this.pointers.set(id, state);
      this.setHover(state, hit, event);
      if (!current() || this.pointers.get(id) !== state) return;
      if (!hit) { this.pointers.delete(id); return; }
      state.pressed = hit;
      const capture = {};
      state.capture = capture;
      try { acquirePointerCapture(this.options.element, id, capture); } catch { /* capture can be unsupported or already lost */ }
      if (!current() || this.pointers.get(id) !== state || state.capture !== capture) return;
      this.dispatch("pointerdown", hit, id, event);
    } finally {
      if (this.pending.get(id) === pending) this.pending.delete(id);
    }
  };

  private readonly handleMove = (event: PointerEvent): void => {
    if (this.disposed) return;
    const hit = this.hit(event);
    const state = this.pointers.get(event.pointerId) ?? {};
    this.pointers.set(event.pointerId, state);
    this.setHover(state, hit, event);
    if (this.disposed || this.pointers.get(event.pointerId) !== state) return;
    if (state.pressed && hit && sameHit(state.pressed, hit)) state.pressed = hit;
    if (state.pressed ?? hit) this.dispatch("pointermove", (state.pressed ?? hit)!, event.pointerId, event);
    if (this.disposed || this.pointers.get(event.pointerId) !== state) return;
    if (state.pressed || state.hover) this.pointers.set(event.pointerId, state);
    else this.pointers.delete(event.pointerId);
  };

  private readonly handleUp = (event: PointerEvent): void => {
    if (this.disposed) return;
    this.pending.delete(event.pointerId);
    const state = this.pointers.get(event.pointerId);
    if (!state) return;
    const hit = this.hit(event);
    this.setHover(state, hit, event);
    if (this.disposed || this.pointers.get(event.pointerId) !== state) return;
    if (state.pressed && hit && sameHit(state.pressed, hit)) state.pressed = hit;
    const pressed = state.pressed;
    const capture = state.capture;
    state.pressed = undefined;
    state.capture = undefined;
    try {
      if (pressed) {
        this.dispatch("pointerup", pressed, event.pointerId, event);
        if (!this.disposed && this.pointers.get(event.pointerId) === state && sameHit(pressed, hit)) {
          this.dispatch("click", hit!, event.pointerId, event);
        }
      }
    } finally {
      if (capture) this.releaseCapture(event.pointerId, capture, true);
      if (this.pointers.get(event.pointerId) === state && !state.pressed) {
        if (event.pointerType === "touch") this.setHover(state, undefined, event);
        if (this.pointers.get(event.pointerId) === state && !state.hover && !state.pressed) {
          this.pointers.delete(event.pointerId);
        }
      }
    }
  };

  private readonly handleCancel = (event: PointerEvent): void => { this.cancel(event.pointerId, event, true); };
  private readonly handleLostCapture = (event: PointerEvent): void => {
    // A queued loss from an earlier press can arrive after the same pointer id
    // has acquired a new capture. The new press still owns that capture.
    try { if (this.options.element.hasPointerCapture?.(event.pointerId)) return; } catch { /* Treat an unavailable capture as lost. */ }
    if (this.pointers.get(event.pointerId)?.pressed || this.pending.has(event.pointerId)) this.cancel(event.pointerId, event, false);
  };
  private readonly handleLeave = (event: PointerEvent): void => {
    const state = this.pointers.get(event.pointerId);
    if (!state) return;
    this.setHover(state, undefined, event);
    if (this.pointers.get(event.pointerId) === state && !state.pressed) this.pointers.delete(event.pointerId);
  };
  private readonly handleBlur = (): void => {
    for (const id of [...this.pointers.keys()]) this.cancel(id, undefined, true);
  };

  private cancel(id: number, event: PointerEvent | undefined, releaseCapture: boolean): void {
    this.pending.delete(id);
    const state = this.pointers.get(id);
    if (!state) return;
    this.pointers.delete(id);
    try {
      if (state.pressed) this.dispatch("pointercancel", state.pressed, id, event);
      if (state.hover) this.dispatch("pointerleave", state.hover, id, event);
    } finally {
      if (state.capture) this.releaseCapture(id, state.capture, releaseCapture);
    }
  }

  private releaseCapture(id: number, owner: object, release: boolean): void {
    try {
      releasePointerCaptureLease(this.options.element, id, owner, release);
    } catch { /* capture may already have been released by the browser */ }
  }

  private setHover(state: PointerState, hit: InteractiveGroupHit | undefined, event: PointerEvent): void {
    if (sameHit(state.hover, hit)) { state.hover = hit; return; }
    if (state.hover) {
      const previous = state.hover;
      state.hover = undefined;
      this.dispatch("pointerleave", previous, event.pointerId, event);
      if (this.disposed || this.pointers.get(event.pointerId) !== state) return;
    }
    state.hover = hit;
    if (hit) this.dispatch("pointerenter", hit, event.pointerId, event);
  }

  private hit(event: PointerEvent): InteractiveGroupHit | undefined {
    const ray = this.options.rayFromPointer?.(event) ?? this.cameraRay(event);
    const candidates = this.options.hitTest
      ? this.options.hitTest(ray, this.options.root, event)
      : this.queryBounds(ray);
    const hits = Array.isArray(candidates) ? candidates : candidates ? [candidates] : [];
    return [...hits].filter((hit) => this.pathTo(hit.object).some((node) => this.listeners.has(node)))
      .sort((a, b) => a.distance - b.distance)[0];
  }

  private cameraRay(event: PointerEvent): InteractiveGroupRay {
    const camera = this.options.camera!;
    const box = measurePointerContentBox(this.options.element, "InteractiveGroup");
    const { x, y } = box.fromClient(event.clientX, event.clientY);
    const viewport = camera.viewport.width === 1 && camera.viewport.height === 1
      ? { x: 0, y: 0, width: box.width, height: box.height }
      : camera.viewport;
    return pickingRayFromCamera(camera, x, y, viewport);
  }

  private queryBounds(ray: InteractiveGroupRay): readonly InteractiveGroupHit[] {
    const length = Math.hypot(ray.direction.x, ray.direction.y, ray.direction.z);
    if (!(length > 0) || !Number.isFinite(length) || ![ray.origin.x, ray.origin.y, ray.origin.z].every(Number.isFinite)) {
      throw new RangeError("InteractiveGroup ray must have a finite origin and nonzero direction.");
    }
    const direction = { x: ray.direction.x / length, y: ray.direction.y / length, z: ray.direction.z / length };
    const hits: InteractiveGroupHit[] = [];
    forEachSceneBound(this.options.root, { bounds: this.options.bounds }, (object, bounds, matrix, instanceId) => {
      let inverse: Mat4;
      try { inverse = invertMat4(matrix); } catch { return; }
      const origin = point(inverse, ray.origin, 1);
      const localDirection = point(inverse, direction, 0);
      const distance = intersectBounds(origin, localDirection, bounds);
      if (distance === undefined) return;
      const worldPoint = { x: ray.origin.x + direction.x * distance, y: ray.origin.y + direction.y * distance, z: ray.origin.z + direction.z * distance };
      hits.push(instanceId === undefined ? { object, distance, point: worldPoint } : { object, distance, point: worldPoint, instanceId });
    });
    return hits;
  }

  private dispatch(type: InteractiveGroupEventType, hit: InteractiveGroupHit, pointerId: number, originalEvent?: PointerEvent): void {
    let stopped = false;
    for (const currentTarget of this.pathTo(hit.object)) {
      const handlers = this.listeners.get(currentTarget)?.get(type);
      if (!handlers) continue;
      const event: InteractiveGroupEvent = {
        type, target: hit.object, currentTarget, pointerId, hit, originalEvent,
        stopPropagation: () => { stopped = true; }
      };
      for (const handler of [...handlers]) handler(event);
      if (stopped) break;
    }
  }

  private pathTo(object: SceneNode): readonly SceneNode[] {
    const path: SceneNode[] = [];
    let node: SceneNode | null = object;
    while (node) {
      path.push(node);
      if (node === this.options.root) return path;
      node = node.parent;
    }
    return [];
  }
}

function sameHit(a: InteractiveGroupHit | undefined, b: InteractiveGroupHit | undefined): boolean {
  return a?.object === b?.object && a?.instanceId === b?.instanceId;
}

function point(m: Mat4, v: Vector3Like, w: number): Vector3Like {
  return { x: m[0] * v.x + m[4] * v.y + m[8] * v.z + m[12] * w,
    y: m[1] * v.x + m[5] * v.y + m[9] * v.z + m[13] * w,
    z: m[2] * v.x + m[6] * v.y + m[10] * v.z + m[14] * w };
}

function intersectBounds(origin: Vector3Like, direction: Vector3Like, bounds: SelectionBoxBounds): number | undefined {
  let near = 0;
  let far = Infinity;
  const origins = [origin.x, origin.y, origin.z];
  const directions = [direction.x, direction.y, direction.z];
  for (let axis = 0; axis < 3; axis += 1) {
    if (Math.abs(directions[axis]) < 1e-12) {
      if (origins[axis] < bounds.min[axis] || origins[axis] > bounds.max[axis]) return undefined;
      continue;
    }
    let a = (bounds.min[axis] - origins[axis]) / directions[axis];
    let b = (bounds.max[axis] - origins[axis]) / directions[axis];
    if (a > b) [a, b] = [b, a];
    near = Math.max(near, a);
    far = Math.min(far, b);
    if (near > far) return undefined;
  }
  return near;
}
