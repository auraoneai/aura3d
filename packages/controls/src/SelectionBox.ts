import { invertMat4, multiplyMat4, type Camera, type Mat4, type SceneNode } from "@aura3d/scene";
import { measurePointerContentBox, type PointerContentBox } from "./PointerCoordinates";
import { acquirePointerCapture, releasePointerCaptureLease } from "./PointerLeases";

/** `select` uses NDC (-1, -1 is lower-left); `selectClient` and marquee events use client pixels. */
export interface SelectionBoxPoint { readonly x: number; readonly y: number }
export interface SelectionBoxBounds {
  readonly min: readonly [number, number, number];
  readonly max: readonly [number, number, number];
}
export interface SelectionBoxHit {
  readonly object: SceneNode;
  /** Present even for a single instance when the renderable has instance transforms. */
  readonly instanceId?: number;
}
export type SelectionBoxBoundsProvider = (object: SceneNode, instanceId: number | undefined) => SelectionBoxBounds | null | undefined;
export interface SelectionBoxOptions {
  /** Select objects intersecting the volume, or only those wholly inside it. */
  readonly mode?: "intersects" | "contains";
  readonly includeInvisible?: boolean;
  readonly filter?: (object: SceneNode, instanceId: number | undefined) => boolean;
  /** Return current local-space bounds, e.g. a skinned pose. Undefined uses localBounds; null skips the node. */
  readonly bounds?: SelectionBoxBoundsProvider;
  readonly depthRange?: "negative-one-to-one" | "zero-to-one";
}

export interface SelectionBoxConnectionOptions {
  /** Opt into a particular interaction mode, for example only while Shift is held. */
  readonly shouldStart?: (event: PointerEvent) => boolean;
  /** Defaults to the connected element's window. */
  readonly blurTarget?: EventTarget;
}
export interface SelectionBoxMarquee {
  readonly pointerId: number;
  /** Start and end are client-pixel coordinates, suitable for an overlay. */
  readonly start: SelectionBoxPoint;
  readonly end: SelectionBoxPoint;
}
export type SelectionBoxEventType = "marqueestart" | "marqueemove" | "marqueeend" | "marqueecancel";
export interface SelectionBoxEvent extends SelectionBoxMarquee {
  readonly type: SelectionBoxEventType;
  /** The last committed selection; only `marqueeend` changes it. */
  readonly selection: readonly SelectionBoxHit[];
  readonly originalEvent?: PointerEvent;
}
export type SelectionBoxListener = (event: SelectionBoxEvent) => void;

interface SelectionBoxConnection {
  readonly element: HTMLElement;
  readonly options: SelectionBoxConnectionOptions;
  readonly bindings: { readonly target: EventTarget; readonly type: string; readonly listener: EventListener }[];
}
interface SelectionBoxPending {
  readonly connection: SelectionBoxConnection;
  readonly pointerId: number;
  readonly timeStamp: number;
}
interface SelectionBoxGesture extends SelectionBoxPending {
  /** Keep the anchor attached to the camera viewport as the element moves or resizes. */
  readonly startNdc: SelectionBoxPoint;
  start: SelectionBoxPoint;
  end: SelectionBoxPoint;
  started: boolean;
  finishing: boolean;
}

/**
 * Marquee selection over native scene nodes. The rectangle uses NDC, not page
 * pixels; convert client coordinates using the actual canvas rectangle first.
 * Each node's local bounds is tested against the selection frustum using its
 * current world matrix. Instance matrices are applied individually. To select
 * deformed geometry according to its current shape, provide live pose bounds
 * with `options.bounds`; authored `localBounds` is otherwise used.
 *
 * `connect` is optional: it installs pointer listeners only when explicitly
 * called. Subscribe for client-pixel marquee updates and committed hits. The
 * anchor is reprojected on motion/release if the element moves or resizes. A
 * cancelled gesture leaves the previous selection unchanged. Connections do not
 * suppress events, arbitrate other controls, or change touch-action. Callers can
 * choose an interaction mode with `shouldStart`, disable competing controls
 * while that mode is active, and configure touch-action themselves.
 */
export class SelectionBox {
  private connection?: SelectionBoxConnection;
  private pending?: SelectionBoxPending;
  private active?: SelectionBoxGesture;
  private disposed = false;
  private selectionValue: readonly SelectionBoxHit[] = Object.freeze([]);
  private readonly listeners = new Set<SelectionBoxListener>();

  constructor(
    readonly camera: Camera,
    readonly root: SceneNode,
    readonly options: SelectionBoxOptions = {}
  ) {}

  get isDisposed(): boolean { return this.disposed; }
  /** Instance-aware hits from the last completed gesture, not from query calls. */
  get selection(): readonly SelectionBoxHit[] { return this.selectionValue; }
  get marquee(): SelectionBoxMarquee | null { return this.active ? marqueeOf(this.active) : null; }

  subscribe(listener: SelectionBoxListener): () => void {
    if (this.disposed) return () => {};
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  /**
   * Replace any existing connection. Only a primary press within the camera
   * viewport whose event has not been default-prevented starts a gesture. The
   * returned disposer only owns this connection, not a later one.
   */
  connect(element: HTMLElement, options: SelectionBoxConnectionOptions = {}): () => void {
    if (this.disposed) return () => {};
    this.disconnect();
    // A cancellation listener may have disposed or reconnected the control.
    if (this.disposed || this.connection) return () => {};
    const connection: SelectionBoxConnection = { element, options, bindings: [] };
    this.connection = connection;
    const bind = (target: EventTarget | undefined, type: string, listener: EventListener): void => {
      if (!target || this.connection !== connection) return;
      connection.bindings.push({ target, type, listener });
      target.addEventListener(type, listener);
      // A custom target may disconnect synchronously during registration.
      if (this.connection !== connection) target.removeEventListener(type, listener);
    };
    try {
      bind(element, "pointerdown", (event) => this.pointerDown(connection, event as PointerEvent));
      bind(element, "pointermove", (event) => this.pointerMove(connection, event as PointerEvent));
      bind(element, "pointerup", (event) => this.pointerUp(connection, event as PointerEvent));
      bind(element, "pointercancel", (event) => this.pointerCancel(connection, event as PointerEvent, true));
      bind(element, "lostpointercapture", (event) => this.lostCapture(connection, event as PointerEvent));
      bind(options.blurTarget ?? element.ownerDocument?.defaultView ?? undefined, "blur", () => this.blur(connection));
    } catch (error) {
      if (this.connection === connection) {
        try { this.disconnect(); } catch { /* Preserve the registration failure. */ }
      }
      throw error;
    }
    return () => { if (this.connection === connection) this.disconnect(); };
  }

  /** Cancel any active marquee and remove this connection's listeners and capture lease. */
  disconnect(): void {
    const connection = this.connection;
    if (!connection) return;
    this.connection = undefined;
    if (this.pending?.connection === connection) this.pending = undefined;
    let failure: unknown;
    let failed = false;
    const attempt = (operation: () => void): void => {
      try { operation(); } catch (error) {
        if (!failed) { failure = error; failed = true; }
      }
    };
    for (const { target, type, listener } of connection.bindings.splice(0)) {
      attempt(() => target.removeEventListener(type, listener));
    }
    const active = this.active;
    if (active?.connection === connection) attempt(() => this.cancel(active, undefined, true));
    if (failed) throw failure;
  }

  /** Dispose the connection and listeners and clear selection; queries remain available. */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    try { this.disconnect(); } finally {
      this.listeners.clear();
      this.selectionValue = Object.freeze([]);
    }
  }

  /** Select using browser client coordinates, accounting for the current canvas size and viewport. */
  selectClient(start: SelectionBoxPoint, end: SelectionBoxPoint, element: HTMLElement): readonly SelectionBoxHit[] {
    const box = measurePointerContentBox(element, "SelectionBox");
    const viewport = viewportOf(this.camera, box);
    const toNdc = (point: SelectionBoxPoint): SelectionBoxPoint => {
      const { x, y } = box.fromClient(point.x, point.y);
      return { x: (x - viewport.x) / viewport.width * 2 - 1, y: 1 - (y - viewport.y) / viewport.height * 2 };
    };
    return this.select(toNdc(start), toNdc(end));
  }

  select(start: SelectionBoxPoint, end: SelectionBoxPoint): readonly SelectionBoxHit[] {
    if (![start.x, start.y, end.x, end.y].every(Number.isFinite)) {
      throw new RangeError("SelectionBox coordinates must be finite NDC values.");
    }
    const left = Math.max(-1, Math.min(start.x, end.x));
    const right = Math.min(1, Math.max(start.x, end.x));
    const bottom = Math.max(-1, Math.min(start.y, end.y));
    const top = Math.min(1, Math.max(start.y, end.y));
    if (left > right || bottom > top) return [];
    this.camera.updateCameraMatrices();
    const inverse = invertMat4(this.camera.viewProjectionMatrix);
    const frustum = cornersOf({
      min: [left, bottom, this.options.depthRange === "zero-to-one" ? 0 : -1],
      max: [right, top, 1]
    }).map((corner) => unproject(inverse, corner));
    const hits: SelectionBoxHit[] = [];
    forEachSceneBound(this.root, this.options, (object, bounds, worldMatrix, instanceId) => {
      const matrix = multiplyMat4(this.camera.viewProjectionMatrix, worldMatrix);
      const corners = cornersOf(bounds).map((point) => clipPoint(matrix, point));
      const planeValues = (point: readonly number[]): readonly number[] => [
        point[0] - left * point[3], right * point[3] - point[0],
        point[1] - bottom * point[3], top * point[3] - point[1],
        this.options.depthRange === "zero-to-one" ? point[2] : point[2] + point[3],
        point[3] - point[2]
      ];
      const distances = corners.map(planeValues);
      const matches = this.options.mode === "contains"
        ? distances.every((values) => values.every((value) => value >= 0))
        : ![0, 1, 2, 3, 4, 5].some((plane) => distances.every((values) => values[plane] < 0))
          && intersectsFrustum(cornersOf(bounds).map((corner) => affinePoint(worldMatrix, corner)), frustum);
      if (matches) hits.push(instanceId === undefined ? { object } : { object, instanceId });
    });
    return hits;
  }

  private pointerDown(connection: SelectionBoxConnection, event: PointerEvent): void {
    if (this.disposed || this.connection !== connection || this.pending || this.active ||
        event.defaultPrevented || event.isPrimary === false || event.button !== 0 ||
        !Number.isFinite(event.pointerId) || !finiteClientPoint(event)) return;
    const pending: SelectionBoxPending = { connection, pointerId: event.pointerId, timeStamp: event.timeStamp };
    this.pending = pending;
    const current = (): boolean => !this.disposed && this.connection === connection && this.pending === pending;
    try {
      if (connection.options.shouldStart && !connection.options.shouldStart(event)) return;
      if (!current()) return;
      let box: PointerContentBox;
      try { box = measurePointerContentBox(connection.element, "SelectionBox"); }
      catch (error) {
        if (error instanceof RangeError) return; // A hidden/zero-sized surface cannot start a marquee.
        throw error;
      }
      if (!current()) return;
      const { x, y } = box.fromClient(event.clientX, event.clientY);
      const viewport = viewportOf(this.camera, box);
      if (![x, y, box.width, box.height, viewport.x, viewport.y, viewport.width, viewport.height].every(Number.isFinite) ||
          !(viewport.width > 0) || !(viewport.height > 0) ||
          x < 0 || y < 0 || x >= box.width || y >= box.height ||
          x < viewport.x || y < viewport.y || x >= viewport.x + viewport.width || y >= viewport.y + viewport.height ||
          !current()) return;
      const point = clientPoint(event);
      if (!current()) return;
      const startNdc = viewportPoint(x, y, viewport);
      if (![startNdc.x, startNdc.y].every(Number.isFinite)) return;
      const active: SelectionBoxGesture = {
        ...pending, startNdc, start: point, end: point, started: false, finishing: false
      };
      this.pending = undefined;
      this.active = active;
      try { acquirePointerCapture(connection.element, active.pointerId, active); }
      catch {
        // Match DragControls: a failed capture must not leave an active gesture.
        if (this.active === active) this.cancel(active, event, true);
        return;
      }
      if (this.active !== active || this.connection !== connection || this.disposed) return;
      active.started = true;
      try { this.emit("marqueestart", active, event, () => this.active === active); }
      catch (error) {
        try { this.cancel(active, event, true); } catch { /* Preserve the listener failure. */ }
        throw error;
      }
    } finally {
      if (this.pending === pending) this.pending = undefined;
    }
  }

  private pointerMove(connection: SelectionBoxConnection, event: PointerEvent): void {
    const active = this.active;
    if (!this.owns(active, connection, event) || !active.started || active.finishing) return;
    // A mouse can release its primary button while another button remains down.
    if (!finiteClientPoint(event) || (typeof event.buttons === "number" && (event.buttons & 1) === 0)) {
      this.cancel(active, event, true);
      return;
    }
    let start: SelectionBoxPoint;
    try { start = mapMarquee(this.camera, active, event).start; }
    catch (error) {
      try { this.cancel(active, event, true); } catch { /* Preserve the mapping failure. */ }
      throw error;
    }
    if (!this.owns(active, connection, event)) return;
    if (active.start.x === start.x && active.start.y === start.y &&
        active.end.x === event.clientX && active.end.y === event.clientY) return;
    active.start = start;
    active.end = clientPoint(event);
    try { this.emit("marqueemove", active, event, () => this.active === active); }
    catch (error) {
      try { this.cancel(active, event, true); } catch { /* Preserve the listener failure. */ }
      throw error;
    }
  }

  private pointerUp(connection: SelectionBoxConnection, event: PointerEvent): void {
    if (this.pending?.connection === connection && this.pending.pointerId === event.pointerId &&
        !earlierThan(event, this.pending)) this.pending = undefined;
    const active = this.active;
    if (!this.owns(active, connection, event) || active.finishing) return;
    if (!active.started) {
      // A reentrant release during capture acquisition is not a completed marquee.
      this.cancel(active, event, true);
      return;
    }
    if (event.button !== 0 || !finiteClientPoint(event)) {
      this.cancel(active, event, true);
      return;
    }
    active.end = clientPoint(event);
    active.finishing = true;
    let hits: readonly SelectionBoxHit[];
    try {
      const mapped = mapMarquee(this.camera, active, event);
      if (!this.owns(active, connection, event)) return;
      active.start = mapped.start;
      hits = this.select(active.startNdc, mapped.endNdc);
    }
    catch (error) {
      try { this.cancel(active, event, true); } catch { /* Preserve the query failure. */ }
      throw error;
    }
    // A bounds/filter callback can cancel, disconnect, or dispose during the query.
    if (this.active !== active || this.connection !== connection || this.disposed) return;
    this.active = undefined;
    this.selectionValue = Object.freeze(hits.map((hit) => Object.freeze({ ...hit })));
    try { this.emit("marqueeend", active, event); }
    finally { this.release(active, true); }
  }

  private pointerCancel(connection: SelectionBoxConnection, event: PointerEvent, release: boolean): void {
    if (this.pending?.connection === connection && this.pending.pointerId === event.pointerId &&
        !earlierThan(event, this.pending)) this.pending = undefined;
    const active = this.active;
    if (this.owns(active, connection, event)) this.cancel(active, event, release);
  }

  private lostCapture(connection: SelectionBoxConnection, event: PointerEvent): void {
    const pending = this.pending;
    const active = this.active;
    if (!(pending?.connection === connection && pending.pointerId === event.pointerId && !earlierThan(event, pending)) &&
        !this.owns(active, connection, event)) return;
    // A queued loss from an old gesture must not cancel a newer capture.
    try { if (connection.element.hasPointerCapture?.(event.pointerId)) return; }
    catch { /* An unavailable capture is treated as lost. */ }
    this.pointerCancel(connection, event, false);
  }

  private blur(connection: SelectionBoxConnection): void {
    if (this.connection !== connection) return;
    if (this.pending?.connection === connection) this.pending = undefined;
    const active = this.active;
    if (active?.connection === connection) this.cancel(active, undefined, true);
  }

  private owns(active: SelectionBoxGesture | undefined, connection: SelectionBoxConnection, event: PointerEvent): active is SelectionBoxGesture {
    return !this.disposed && this.connection === connection && !!active && active.connection === connection &&
      active.pointerId === event.pointerId && !earlierThan(event, active);
  }

  private cancel(active: SelectionBoxGesture, event: PointerEvent | undefined, release: boolean): void {
    if (this.active !== active) return;
    this.active = undefined;
    try { if (active.started) this.emit("marqueecancel", active, event); }
    finally { this.release(active, release); }
  }

  private release(active: SelectionBoxGesture, release: boolean): void {
    try { releasePointerCaptureLease(active.connection.element, active.pointerId, active, release); }
    catch { /* The browser may already have released capture. */ }
  }

  private emit(type: SelectionBoxEventType, active: SelectionBoxGesture, originalEvent?: PointerEvent, current?: () => boolean): void {
    const event: SelectionBoxEvent = Object.freeze({ type, ...marqueeOf(active), selection: this.selectionValue, originalEvent });
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
}

interface SelectionBoxViewport {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

function viewportOf(camera: Camera, box: PointerContentBox): SelectionBoxViewport {
  return camera.viewport.width === 1 && camera.viewport.height === 1
    ? { x: 0, y: 0, width: box.width, height: box.height }
    : camera.viewport;
}

function viewportPoint(x: number, y: number, viewport: SelectionBoxViewport): SelectionBoxPoint {
  return { x: (x - viewport.x) / viewport.width * 2 - 1, y: 1 - (y - viewport.y) / viewport.height * 2 };
}

/** Reproject the down anchor and current pointer through one current layout snapshot. */
function mapMarquee(camera: Camera, active: SelectionBoxGesture, event: PointerEvent): {
  readonly start: SelectionBoxPoint;
  readonly endNdc: SelectionBoxPoint;
} {
  const box = measurePointerContentBox(active.connection.element, "SelectionBox");
  const viewport = viewportOf(camera, box);
  const origin = box.fromClient(0, 0);
  const unit = box.fromClient(1, 1);
  const scaleX = unit.x - origin.x;
  const scaleY = unit.y - origin.y;
  const end = box.fromClient(event.clientX, event.clientY);
  if (![viewport.x, viewport.y, viewport.width, viewport.height, origin.x, origin.y, scaleX, scaleY, end.x, end.y].every(Number.isFinite) ||
      !(viewport.width > 0) || !(viewport.height > 0) || !(scaleX > 0) || !(scaleY > 0)) {
    throw new RangeError("SelectionBox cannot map the current content box and viewport.");
  }
  const startX = viewport.x + (active.startNdc.x + 1) * viewport.width / 2;
  const startY = viewport.y + (1 - active.startNdc.y) * viewport.height / 2;
  const start = { x: (startX - origin.x) / scaleX, y: (startY - origin.y) / scaleY };
  const endNdc = viewportPoint(end.x, end.y, viewport);
  if (![start.x, start.y, endNdc.x, endNdc.y].every(Number.isFinite)) {
    throw new RangeError("SelectionBox cannot map the current content box and viewport.");
  }
  return {
    start: Object.freeze(start),
    endNdc
  };
}

function finiteClientPoint(event: PointerEvent): boolean {
  return Number.isFinite(event.clientX) && Number.isFinite(event.clientY);
}

function clientPoint(event: PointerEvent): SelectionBoxPoint {
  return Object.freeze({ x: event.clientX, y: event.clientY });
}

function marqueeOf(active: SelectionBoxGesture): SelectionBoxMarquee {
  return Object.freeze({ pointerId: active.pointerId, start: active.start, end: active.end });
}

function earlierThan(event: PointerEvent, gesture: SelectionBoxPending): boolean {
  return Number.isFinite(event.timeStamp) && Number.isFinite(gesture.timeStamp) && event.timeStamp < gesture.timeStamp;
}

/** Internal traversal shared with InteractiveGroup's native bounds query. */
export function forEachSceneBound(
  root: SceneNode,
  options: Pick<SelectionBoxOptions, "includeInvisible" | "filter" | "bounds">,
  visit: (object: SceneNode, bounds: SelectionBoxBounds, worldMatrix: Mat4, instanceId: number | undefined) => void
): void {
  let ancestor = root;
  while (ancestor.parent) ancestor = ancestor.parent;
  ancestor.updateWorldTransform();
  const walk = (node: SceneNode, parentVisible: boolean): void => {
    if (node.disposed) return;
    const visible = parentVisible && node.visible && !node.disposed;
    if (!visible && !options.includeInvisible) return;
    const transforms = node.renderable?.instanceTransforms;
    const count = transforms && transforms.length >= 16 ? Math.floor(transforms.length / 16) : 0;
    const append = (instanceId: number | undefined, matrix: Mat4): void => {
      if (options.filter && !options.filter(node, instanceId)) return;
      const provided = options.bounds?.(node, instanceId);
      const bounds = provided === undefined ? node.localBounds : provided;
      if (bounds && validBounds(bounds)) visit(node, bounds, matrix, instanceId);
    };
    if (count > 0 && transforms) {
      for (let index = 0; index < count; index += 1) {
        const instance = Array.from(transforms.slice(index * 16, index * 16 + 16)) as Mat4;
        append(index, multiplyMat4(node.transform.worldMatrix, instance));
      }
    } else append(undefined, node.transform.worldMatrix);
    for (const child of node.children) walk(child, visible);
  };
  walk(root, true);
}

function validBounds(bounds: SelectionBoxBounds): boolean {
  return bounds.min.every(Number.isFinite) && bounds.max.every(Number.isFinite)
    && bounds.min.every((value, index) => value <= bounds.max[index]);
}

function cornersOf(bounds: SelectionBoxBounds): readonly (readonly [number, number, number])[] {
  const result: [number, number, number][] = [];
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) result.push([x, y, z]);
    }
  }
  return result;
}

function clipPoint(m: Mat4, p: readonly [number, number, number]): readonly [number, number, number, number] {
  return [
    m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12],
    m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13],
    m[2] * p[0] + m[6] * p[1] + m[10] * p[2] + m[14],
    m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15]
  ];
}

type Vec = readonly [number, number, number];
const EDGES: readonly (readonly [number, number])[] = [
  [0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3],
  [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]
];

function unproject(matrix: Mat4, position: Vec): Vec {
  const result = clipPoint(matrix, position);
  if (!Number.isFinite(result[3]) || Math.abs(result[3]) < 1e-12) {
    throw new RangeError("SelectionBox camera cannot unproject the marquee volume.");
  }
  return [result[0] / result[3], result[1] / result[3], result[2] / result[3]];
}

function affinePoint(matrix: Mat4, position: Vec): Vec {
  const result = clipPoint(matrix, position);
  return [result[0], result[1], result[2]];
}

/** Separating-axis test removes the corner false positives of plane-only culling. */
function intersectsFrustum(box: readonly Vec[], frustum: readonly Vec[]): boolean {
  const boxEdges = [subtract(box[4], box[0]), subtract(box[2], box[0]), subtract(box[1], box[0])];
  const faceNormals = [
    cross(subtract(frustum[4], frustum[0]), subtract(frustum[2], frustum[0])),
    cross(subtract(frustum[5], frustum[1]), subtract(frustum[3], frustum[1])),
    cross(subtract(frustum[1], frustum[0]), subtract(frustum[2], frustum[0])),
    cross(subtract(frustum[5], frustum[4]), subtract(frustum[6], frustum[4])),
    cross(subtract(frustum[4], frustum[0]), subtract(frustum[1], frustum[0])),
    cross(subtract(frustum[6], frustum[2]), subtract(frustum[3], frustum[2]))
  ];
  const axes: Vec[] = [...faceNormals,
    cross(boxEdges[0], boxEdges[1]), cross(boxEdges[1], boxEdges[2]), cross(boxEdges[2], boxEdges[0])];
  for (const [from, to] of EDGES) {
    const edge = subtract(frustum[to], frustum[from]);
    for (const boxEdge of boxEdges) axes.push(cross(edge, boxEdge));
  }
  return !axes.some((axis) => separated(axis, box, frustum));
}

function subtract(a: Vec, b: Vec): Vec { return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]; }
function cross(a: Vec, b: Vec): Vec {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}
function separated(axis: Vec, first: readonly Vec[], second: readonly Vec[]): boolean {
  const length = Math.hypot(...axis);
  if (length < 1e-12) return false;
  const unit: Vec = [axis[0] / length, axis[1] / length, axis[2] / length];
  const project = (point: Vec): number => point[0] * unit[0] + point[1] * unit[1] + point[2] * unit[2];
  const a = first.map(project);
  const b = second.map(project);
  return Math.max(...a) < Math.min(...b) - 1e-9 || Math.max(...b) < Math.min(...a) - 1e-9;
}
