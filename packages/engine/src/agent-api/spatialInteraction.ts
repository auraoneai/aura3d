/**
 * Hover/click events for point and instance picks, a culling label overlay manager, and a measurement /
 * annotation record (register gaps K-01, K-03, K-07 first cuts).
 *
 * Everything except the thin DOM writes in `createLabelOverlay` and the listener wiring in `bindSpatialPicking` is
 * pure and unit-tested without a browser.
 */

import type { AuraSceneSnapshot } from "./nodes/types.js";
import type { AuraRuntimeNodeHandle } from "./nodes/types/runtime.js";
import { cameraFor, type AuraPointerInteractionApp } from "./nodes/pointerInteraction.js";
import { createSpatialPicker, type SpatialPickHit, type SpatialPickOptions, type SpatialPicker } from "./spatialPicker.js";
import type { Vec3 } from "./spatialIndex.js";

// ── Hover / click ─────────────────────────────────────────────────────────

export type SpatialPickEventType = "enter" | "leave" | "move" | "click";

export interface SpatialPickEvent {
  readonly type: SpatialPickEventType;
  /** The hit under the pointer now (`undefined` for `leave`, or a click on nothing). */
  readonly hit: SpatialPickHit | undefined;
  /** The hit that was hovered before this event. */
  readonly previous: SpatialPickHit | undefined;
  readonly ndc: readonly [number, number];
  readonly client: readonly [number, number];
  readonly pointerId: number | undefined;
}

interface SpatialPickElementLike {
  addEventListener(type: string, listener: (event: unknown) => void): unknown;
  removeEventListener(type: string, listener: (event: unknown) => void): unknown;
  getBoundingClientRect(): { readonly left: number; readonly top: number; readonly width: number; readonly height: number };
}

export interface SpatialPickBindOptions {
  readonly element?: SpatialPickElementLike;
  /** Reuse a picker (and its indices); default builds one over `app.nodes` / `app.scene.nodes`. */
  readonly picker?: SpatialPicker;
  /** Pick options (pixel radius, kinds, rank...). `viewport` is filled from the element rect. */
  readonly pick?: Omit<SpatialPickOptions, "viewport">;
  /** Max pointer travel in CSS pixels between down and up for a click. Default 4. */
  readonly clickSlop?: number;
  /** Frame scheduler for coalesced hover picks; default `requestAnimationFrame` or a microtask. */
  readonly schedule?: (callback: () => void) => void;
}

export interface SpatialPickBinding {
  /** Hover picks actually executed (at most one per scheduled frame, however many pointermoves arrived). */
  readonly pickCount: number;
  /** Run any pending coalesced hover pick now. */
  flush(): void;
  dispose(): void;
}

const hitKey = (hit: SpatialPickHit | undefined): string | undefined =>
  hit === undefined ? undefined : `${hit.nodeId ?? hit.nodeName ?? ""}|${hit.kind}|${hit.kind === "point" ? hit.index : hit.instanceId}`;

/**
 * Bind hover (`enter` / `leave` / `move`) and `click` events for points and instances to a canvas. Pointer moves are
 * coalesced to one pick per scheduled frame, hover transitions are diffed by node + point index / instance id, and
 * a click is a pick at pointer-up within `clickSlop` of pointer-down. Returns a binding with a disposer.
 */
export function bindSpatialPicking(
  app: AuraPointerInteractionApp & { readonly scene: AuraSceneSnapshot; readonly nodes?: { all(): readonly AuraRuntimeNodeHandle[] } },
  listener: (event: SpatialPickEvent) => void,
  options: SpatialPickBindOptions = {}
): SpatialPickBinding {
  const element = options.element ?? (app.canvas as SpatialPickElementLike | undefined);
  if (!element || typeof element.addEventListener !== "function" || typeof element.getBoundingClientRect !== "function") {
    throw new TypeError("SPATIAL_PICK_NO_ELEMENT: bindSpatialPicking needs app.canvas or options.element with pointer events and getBoundingClientRect().");
  }
  const picker = options.picker ?? createSpatialPicker(() => {
    const handles = app.nodes?.all() ?? [];
    return handles.length > 0 ? { handles } : { nodes: app.scene.nodes };
  });
  const slop = options.clickSlop ?? 4;
  const schedule = options.schedule ?? ((cb) => {
    const raf = (globalThis as { requestAnimationFrame?: (cb: () => void) => unknown }).requestAnimationFrame;
    if (typeof raf === "function") raf(cb); else queueMicrotask(cb);
  });

  let hovered: SpatialPickHit | undefined;
  let pending: { x: number; y: number; pointerId: number | undefined } | undefined;
  let scheduled = false;
  let picks = 0;
  let down: { x: number; y: number; pointerId: number | undefined } | undefined;
  let disposed = false;

  const pickAt = (x: number, y: number): { hit: SpatialPickHit | undefined; ndc: readonly [number, number] } | undefined => {
    const rect = element.getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return undefined;
    const ndc = [((x - rect.left) / rect.width) * 2 - 1, 1 - ((y - rect.top) / rect.height) * 2] as const;
    const camera = cameraFor(app, rect.width / rect.height);
    if (!camera) return { hit: undefined, ndc };
    picks += 1;
    return { hit: picker.pick({ camera, ndc }, { ...options.pick, viewport: { width: rect.width, height: rect.height } }), ndc };
  };

  const runHover = (): void => {
    scheduled = false;
    const p = pending;
    pending = undefined;
    if (!p || disposed) return;
    const result = pickAt(p.x, p.y);
    if (!result) return;
    const previous = hovered;
    const base = { ndc: result.ndc, client: [p.x, p.y] as const, pointerId: p.pointerId };
    if (hitKey(previous) !== hitKey(result.hit)) {
      if (previous) listener({ type: "leave", hit: undefined, previous, ...base });
      hovered = result.hit;
      if (result.hit) listener({ type: "enter", hit: result.hit, previous, ...base });
    } else if (result.hit) {
      hovered = result.hit;
      listener({ type: "move", hit: result.hit, previous, ...base });
    }
  };

  const read = (raw: unknown): { x: number; y: number; pointerId: number | undefined } | undefined => {
    const e = raw as { clientX?: number; clientY?: number; pointerId?: number };
    return Number.isFinite(e.clientX) && Number.isFinite(e.clientY) ? { x: e.clientX!, y: e.clientY!, pointerId: e.pointerId } : undefined;
  };
  const onMove = (raw: unknown): void => {
    const p = read(raw);
    if (!p) return;
    pending = p;
    if (!scheduled) { scheduled = true; schedule(runHover); }
  };
  const onDown = (raw: unknown): void => { down = read(raw); };
  const onUp = (raw: unknown): void => {
    const p = read(raw), d = down;
    down = undefined;
    if (!p || !d || Math.hypot(p.x - d.x, p.y - d.y) > slop) return;
    const result = pickAt(p.x, p.y);
    if (result) listener({ type: "click", hit: result.hit, previous: hovered, ndc: result.ndc, client: [p.x, p.y], pointerId: p.pointerId });
  };
  const onLeave = (): void => {
    pending = undefined;
    const previous = hovered;
    hovered = undefined;
    if (previous) listener({ type: "leave", hit: undefined, previous, ndc: [0, 0], client: [0, 0], pointerId: undefined });
  };
  const wired: Array<[string, (event: unknown) => void]> = [["pointermove", onMove], ["pointerdown", onDown], ["pointerup", onUp], ["pointerleave", onLeave]];
  for (const [type, fn] of wired) element.addEventListener(type, fn);
  return {
    get pickCount() { return picks; },
    flush: runHover,
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const [type, fn] of wired) element.removeEventListener(type, fn);
      if (!options.picker) picker.dispose();
    }
  };
}

// ── Projection and label overlay ──────────────────────────────────────────

export interface CssViewport {
  readonly width: number;
  readonly height: number;
}

export interface CssProjection {
  /** CSS pixels from the viewport's top-left. */
  readonly x: number;
  readonly y: number;
  /** NDC depth (standard convention, smaller is nearer). */
  readonly depth: number;
  /** Clip-space w; `<= 0` is behind the camera. */
  readonly w: number;
  /** In front of the camera, inside the clip depth range and inside the viewport. */
  readonly visible: boolean;
}

/** Project a world point to CSS pixels with a column-major view-projection matrix. */
export function worldToCss(viewProjection: ArrayLike<number>, point: Vec3, viewport: CssViewport, margin = 0): CssProjection {
  const m = viewProjection;
  const [px, py, pz] = point;
  const cx = m[0]! * px + m[4]! * py + m[8]! * pz + m[12]!;
  const cy = m[1]! * px + m[5]! * py + m[9]! * pz + m[13]!;
  const cz = m[2]! * px + m[6]! * py + m[10]! * pz + m[14]!;
  const cw = m[3]! * px + m[7]! * py + m[11]! * pz + m[15]!;
  if (!(cw > 0) || !Number.isFinite(cw)) return { x: 0, y: 0, depth: 0, w: Number.isFinite(cw) ? cw : 0, visible: false };
  const nx = cx / cw, ny = cy / cw, nz = cz / cw;
  const x = (nx * 0.5 + 0.5) * viewport.width, y = (1 - (ny * 0.5 + 0.5)) * viewport.height;
  const visible = nz >= -1 && nz <= 1 && x >= -margin && x <= viewport.width + margin && y >= -margin && y <= viewport.height + margin;
  return { x, y, depth: nz, w: cw, visible };
}

/** Inverse of {@link worldToCss}'s pixel mapping: CSS pixels to NDC. */
export function cssToNdc(x: number, y: number, viewport: CssViewport): readonly [number, number] {
  return [(x / viewport.width) * 2 - 1, 1 - (y / viewport.height) * 2];
}

export interface OverlayLabel {
  readonly id: string;
  readonly text: string;
  readonly position: Vec3;
  /** Higher wins when the cap drops labels. Default 0; ties go to the nearer label. */
  readonly priority?: number;
  /** CSS pixel offset from the projected point. */
  readonly offset?: readonly [number, number];
  readonly className?: string;
}

export interface PlacedOverlayLabel {
  readonly label: OverlayLabel;
  readonly x: number;
  readonly y: number;
  readonly depth: number;
}

export interface LabelOverlayOptions {
  /** Maximum labels shown per update. Default 64. */
  readonly maxLabels?: number;
  /** CSS pixels outside the viewport that still count as visible. Default 0. */
  readonly margin?: number;
}

/** Cull labels behind the camera or outside the viewport, rank by priority then nearness, cap at `maxLabels`. */
export function planLabelOverlay(viewProjection: ArrayLike<number>, viewport: CssViewport, labels: readonly OverlayLabel[], options: LabelOverlayOptions = {}): PlacedOverlayLabel[] {
  const cap = Math.max(0, Math.floor(options.maxLabels ?? 64));
  const margin = options.margin ?? 0;
  const placed: PlacedOverlayLabel[] = [];
  for (const label of labels) {
    const p = worldToCss(viewProjection, label.position, viewport, margin);
    if (!p.visible) continue;
    placed.push({ label, x: p.x + (label.offset?.[0] ?? 0), y: p.y + (label.offset?.[1] ?? 0), depth: p.depth });
  }
  placed.sort((a, b) => (b.label.priority ?? 0) - (a.label.priority ?? 0) || a.depth - b.depth || (a.label.id < b.label.id ? -1 : a.label.id > b.label.id ? 1 : 0));
  return placed.length > cap ? placed.slice(0, cap) : placed;
}

interface OverlayElementLike {
  textContent: string | null;
  className: string;
  style: { transform: string; display: string; position?: string; left?: string; top?: string; pointerEvents?: string };
  remove(): void;
}
interface OverlayContainerLike {
  appendChild(element: never): unknown;
  readonly ownerDocument?: { createElement(tag: string): unknown } | null;
}

export interface LabelOverlay {
  /** Place up to `maxLabels` labels; elements are pooled and unchanged text/position writes are skipped. */
  update(viewProjection: ArrayLike<number>, viewport: CssViewport, labels: readonly OverlayLabel[]): void;
  /** Number of label elements currently shown. */
  readonly shown: number;
  /** DOM property writes performed so far (for the no-write-when-unchanged test). */
  readonly writes: number;
  clear(): void;
  dispose(): void;
}

/**
 * Overlay manager for N DOM labels per frame. Labels are positioned with `transform` (no layout), culled when
 * behind the camera or off screen, and capped. The container should be `position: relative/absolute` over the canvas.
 */
export function createLabelOverlay(container: OverlayContainerLike, options: LabelOverlayOptions & { readonly createElement?: () => OverlayElementLike } = {}): LabelOverlay {
  const make = options.createElement ?? ((): OverlayElementLike => {
    const doc = container.ownerDocument;
    if (!doc) throw new TypeError("LABEL_OVERLAY_NO_DOCUMENT: pass options.createElement or a container with ownerDocument.");
    const el = doc.createElement("div") as OverlayElementLike;
    el.style.position = "absolute"; el.style.left = "0"; el.style.top = "0"; el.style.pointerEvents = "none";
    return el;
  });
  const pool: Array<{ el: OverlayElementLike; text: string; cls: string; transform: string; shown: boolean }> = [];
  let shown = 0, writes = 0, disposed = false;
  return {
    update(viewProjection, viewport, labels) {
      if (disposed) return;
      const plan = planLabelOverlay(viewProjection, viewport, labels, options);
      for (let i = 0; i < plan.length; i += 1) {
        let slot = pool[i];
        if (!slot) {
          const el = make();
          container.appendChild(el as never);
          slot = { el, text: "", cls: "", transform: "", shown: false };
          pool.push(slot);
        }
        const { label, x, y } = plan[i]!;
        if (slot.text !== label.text) { slot.el.textContent = label.text; slot.text = label.text; writes += 1; }
        const cls = label.className ?? "";
        if (slot.cls !== cls) { slot.el.className = cls; slot.cls = cls; writes += 1; }
        const transform = `translate(${Math.round(x * 10) / 10}px,${Math.round(y * 10) / 10}px)`;
        if (slot.transform !== transform) { slot.el.style.transform = transform; slot.transform = transform; writes += 1; }
        if (!slot.shown) { slot.el.style.display = ""; slot.shown = true; writes += 1; }
      }
      for (let i = plan.length; i < pool.length; i += 1) {
        const slot = pool[i]!;
        if (slot.shown) { slot.el.style.display = "none"; slot.shown = false; writes += 1; }
      }
      shown = plan.length;
    },
    get shown() { return shown; },
    get writes() { return writes; },
    clear() {
      for (const slot of pool) if (slot.shown) { slot.el.style.display = "none"; slot.shown = false; }
      shown = 0;
    },
    dispose() {
      disposed = true;
      for (const slot of pool) slot.el.remove();
      pool.length = 0;
      shown = 0;
    }
  };
}

// ── Measurement and annotation ────────────────────────────────────────────

/** A picked or typed world anchor. */
export interface MeasurePoint {
  readonly position: Vec3;
  readonly nodeId?: string | undefined;
  readonly nodeName?: string | undefined;
  readonly kind?: "point" | "instance" | "surface" | undefined;
  /** Point index (`kind: "point"`). */
  readonly index?: number | undefined;
  /** Instance id (`kind: "instance"`). */
  readonly instanceId?: number | undefined;
}

export interface AnnotationRecord {
  readonly id: string;
  readonly type: "point" | "distance";
  /** Coordinate frame name of `points`; `"world"` unless the host says otherwise. */
  readonly frame: string;
  /** Unit of `value` (`"m"` by default; scene units are not assumed to be metres by the engine). */
  readonly unit: string;
  readonly points: readonly MeasurePoint[];
  /** Euclidean distance for `type: "distance"`. */
  readonly value?: number;
  readonly text: string;
  readonly attributes?: Readonly<Record<string, string | number | boolean>>;
  /** Milliseconds since the epoch (caller-supplied for determinism, default `Date.now()`). */
  readonly createdAt: number;
}

export interface AnnotationOptions {
  readonly id: string;
  readonly frame?: string;
  readonly unit?: string;
  readonly text?: string;
  readonly decimals?: number;
  readonly attributes?: Readonly<Record<string, string | number | boolean>>;
  readonly createdAt?: number;
}

/** Straight-line distance and delta between two world points. */
export function measureDistance(a: Vec3, b: Vec3): { readonly distance: number; readonly delta: Vec3 } {
  const delta: Vec3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  return { distance: Math.hypot(delta[0], delta[1], delta[2]), delta };
}

/** Normalize a pick hit (or a bare anchor) to a serializable {@link MeasurePoint}. */
export function measurePointFromHit(hit: SpatialPickHit | MeasurePoint | { readonly point: Vec3; readonly nodeId?: string | undefined; readonly nodeName?: string | undefined }): MeasurePoint {
  const h = hit as Record<string, unknown>;
  const position = (h.position ?? h.point) as Vec3;
  const base = { position: [position[0], position[1], position[2]] as Vec3, ...(h.nodeId !== undefined ? { nodeId: h.nodeId as string } : {}), ...(h.nodeName !== undefined ? { nodeName: h.nodeName as string } : {}) };
  if (h.kind === "point" || h.kind === "instance" || h.kind === "surface") {
    return { ...base, kind: h.kind, ...(typeof h.index === "number" ? { index: h.index } : {}), ...(typeof h.instanceId === "number" ? { instanceId: h.instanceId } : {}) };
  }
  return base;
}

/** Record a two-point distance annotation from two picks. */
export function createDistanceAnnotation(a: Parameters<typeof measurePointFromHit>[0], b: Parameters<typeof measurePointFromHit>[0], options: AnnotationOptions): AnnotationRecord {
  const pa = measurePointFromHit(a), pb = measurePointFromHit(b);
  const { distance } = measureDistance(pa.position, pb.position);
  const unit = options.unit ?? "m";
  return {
    id: options.id, type: "distance", frame: options.frame ?? "world", unit, points: [pa, pb], value: distance,
    text: options.text ?? `${distance.toFixed(options.decimals ?? 2)} ${unit}`,
    ...(options.attributes ? { attributes: options.attributes } : {}), createdAt: options.createdAt ?? Date.now()
  };
}

/** Record a single-point annotation from a pick. */
export function createPointAnnotation(hit: Parameters<typeof measurePointFromHit>[0], options: AnnotationOptions): AnnotationRecord {
  const p = measurePointFromHit(hit);
  return {
    id: options.id, type: "point", frame: options.frame ?? "world", unit: options.unit ?? "m", points: [p],
    text: options.text ?? options.id, ...(options.attributes ? { attributes: options.attributes } : {}), createdAt: options.createdAt ?? Date.now()
  };
}

/** The overlay label for an annotation: at the midpoint of a distance, at the point otherwise. */
export function annotationOverlayLabel(record: AnnotationRecord, priority = 0): OverlayLabel {
  const ps = record.points;
  const position: Vec3 = ps.length === 2
    ? [(ps[0]!.position[0] + ps[1]!.position[0]) / 2, (ps[0]!.position[1] + ps[1]!.position[1]) / 2, (ps[0]!.position[2] + ps[1]!.position[2]) / 2]
    : ps[0]!.position;
  return { id: record.id, text: record.text, position, priority };
}

/** Lossless JSON for an annotation. */
export function serializeAnnotation(record: AnnotationRecord): string {
  return JSON.stringify(record);
}

/** Parse and validate {@link serializeAnnotation} output; throws `ANNOTATION_INVALID` on a malformed record. */
export function parseAnnotation(json: string): AnnotationRecord {
  const value = JSON.parse(json) as Partial<AnnotationRecord> | null;
  const okPoint = (p: unknown): boolean => {
    const pos = (p as MeasurePoint | undefined)?.position;
    return Array.isArray(pos) && pos.length === 3 && pos.every((n) => typeof n === "number" && Number.isFinite(n));
  };
  if (!value || typeof value.id !== "string" || (value.type !== "point" && value.type !== "distance") || typeof value.frame !== "string" || typeof value.unit !== "string" ||
    typeof value.text !== "string" || typeof value.createdAt !== "number" || !Array.isArray(value.points) || !value.points.every(okPoint) ||
    value.points.length !== (value.type === "distance" ? 2 : 1) || (value.type === "distance" && typeof value.value !== "number")) {
    throw new TypeError("ANNOTATION_INVALID: not a valid AnnotationRecord.");
  }
  return value as AnnotationRecord;
}
