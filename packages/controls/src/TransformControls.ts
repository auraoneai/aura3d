import type { ControlObject3DLike, Vector3Like } from "./NativeControlTypes";

export type TransformControlMode = "translate" | "rotate" | "scale";
export type TransformControlSpace = "world" | "local";
export type TransformControlHandle = "x" | "y" | "z" | "xy" | "xz" | "yz" | "uniform";

/** A pointer ray in world space, as a viewport would unproject it. */
export interface TransformControlRay {
  readonly origin: Vector3Like;
  readonly direction: Vector3Like;
}

/** One renderable gizmo handle. */
export interface TransformControlHandleGeometry {
  readonly handle: TransformControlHandle;
  readonly kind: "axis-arrow" | "plane-quad" | "rotation-ring" | "uniform-box";
  readonly segments: readonly { readonly start: readonly [number, number, number]; readonly end: readonly [number, number, number] }[];
  readonly color: readonly [number, number, number, number];
  readonly direction?: readonly [number, number, number];
}

export interface TransformControlPick {
  readonly handle: TransformControlHandle;
  readonly distance: number;
  readonly point: readonly [number, number, number];
}

export interface TransformControlDragUpdate {
  readonly handle: TransformControlHandle;
  readonly mode: TransformControlMode;
  /** Snapped total since drag start: world units for translate/scale, radians for rotate. */
  readonly totalDelta: number;
  /** Snapped change since the previous move. */
  readonly stepDelta: number;
  readonly snapped: boolean;
}

export interface TransformControlSnapSettings {
  readonly enabled?: boolean;
  readonly position?: number;
  readonly rotationDegrees?: number;
  readonly scale?: number;
}

export interface TransformControlsOptions {
  readonly mode?: TransformControlMode;
  readonly space?: TransformControlSpace;
  /** Gizmo arm length in world units. */
  readonly size?: number;
  /** Pick radius around each handle, in world units. */
  readonly pickTolerance?: number;
  readonly snap?: TransformControlSnapSettings;
}

const AXIS_COLORS: Readonly<Record<TransformControlHandle, readonly [number, number, number, number]>> = {
  x: [1, 0.25, 0.28, 1],
  y: [0.35, 0.95, 0.4, 1],
  z: [0.32, 0.55, 1, 1],
  xy: [0.95, 0.9, 0.4, 0.85],
  xz: [0.6, 0.95, 0.95, 0.85],
  yz: [0.95, 0.55, 0.95, 0.85],
  uniform: [0.95, 0.9, 0.4, 1]
};

/**
 * Interactive transform controls: rendered gizmo handles, ray picking, a pointer drag
 * lifecycle, axis and plane constraints, snapping, and local/world spaces.
 *
 * This class previously applied explicit deltas only, with no geometry, picking, or
 * drag state, which is why it could not support an interactive-parity claim. The delta
 * API (`apply`) is retained unchanged for source compatibility; everything below it is
 * new.
 *
 * Drag math is projection-free: a pointer ray is intersected with a plane through the
 * gizmo origin and the resulting world point is projected onto the constrained axis.
 * The drag plane is derived from the ray direction rather than fixed, because a fixed
 * plane can be parallel to the pointer ray, in which case there is no intersection and
 * the drag silently stops responding.
 */
export class TransformControls {
  object: ControlObject3DLike | null = null;
  mode: TransformControlMode = "translate";
  enabled = true;

  private space: TransformControlSpace;
  private readonly size: number;
  private readonly pickTolerance: number;
  private snapSettings: Required<TransformControlSnapSettings>;
  private origin: readonly [number, number, number] = [0, 0, 0];
  private orientation: readonly [number, number, number, number] = [0, 0, 0, 1];
  private hovered: TransformControlHandle | undefined;
  private active: TransformControlHandle | undefined;
  private dragStartValue = 0;
  private accumulated = 0;
  private dragging = false;
  private disposed = false;

  constructor(options: TransformControlsOptions = {}) {
    this.mode = options.mode ?? "translate";
    this.space = options.space ?? "world";
    const size = options.size ?? 1;
    if (!Number.isFinite(size) || size <= 0) throw new RangeError("TransformControls size must be a positive finite number.");
    this.size = size;
    const tolerance = options.pickTolerance ?? size * 0.16;
    if (!Number.isFinite(tolerance) || tolerance <= 0) {
      throw new RangeError("TransformControls pickTolerance must be a positive finite number.");
    }
    this.pickTolerance = tolerance;
    this.snapSettings = {
      enabled: options.snap?.enabled ?? false,
      position: positive(options.snap?.position, 1),
      rotationDegrees: positive(options.snap?.rotationDegrees, 15),
      scale: positive(options.snap?.scale, 0.1)
    };
  }

  attach(object: ControlObject3DLike): void {
    this.object = object;
    // Track the attached object so the gizmo is drawn and picked where the object is.
    this.origin = [object.position.x, object.position.y, object.position.z];
  }

  detach(): void {
    this.object = null;
    this.cancelDrag();
  }

  setMode(mode: TransformControlMode): void {
    this.mode = mode;
    this.cancelDrag();
  }

  setSpace(space: TransformControlSpace): void {
    this.space = space;
  }

  setSnap(settings: TransformControlSnapSettings): void {
    this.snapSettings = {
      enabled: settings.enabled ?? this.snapSettings.enabled,
      position: positive(settings.position, this.snapSettings.position),
      rotationDegrees: positive(settings.rotationDegrees, this.snapSettings.rotationDegrees),
      scale: positive(settings.scale, this.snapSettings.scale)
    };
  }

  /** Places the gizmo. Orientation drives local-space handle directions. */
  place(origin: readonly [number, number, number], orientation: readonly [number, number, number, number] = [0, 0, 0, 1]): void {
    if (!origin.every(Number.isFinite)) throw new RangeError("TransformControls origin must contain finite components.");
    if (!orientation.every(Number.isFinite)) throw new RangeError("TransformControls orientation must contain finite components.");
    this.origin = [origin[0], origin[1], origin[2]];
    this.orientation = [orientation[0], orientation[1], orientation[2], orientation[3]];
  }

  state(): {
    readonly mode: TransformControlMode;
    readonly space: TransformControlSpace;
    readonly origin: readonly [number, number, number];
    readonly hoveredHandle: TransformControlHandle | undefined;
    readonly activeHandle: TransformControlHandle | undefined;
    readonly dragging: boolean;
    readonly snapEnabled: boolean;
  } {
    return {
      mode: this.mode,
      space: this.space,
      origin: this.origin,
      hoveredHandle: this.hovered,
      activeHandle: this.active,
      dragging: this.dragging,
      snapEnabled: this.snapSettings.enabled
    };
  }

  /** Renderable handle geometry for the current mode and space. */
  handles(): readonly TransformControlHandleGeometry[] {
    const axes: readonly { readonly handle: TransformControlHandle; readonly axis: readonly [number, number, number] }[] = [
      { handle: "x", axis: [1, 0, 0] },
      { handle: "y", axis: [0, 1, 0] },
      { handle: "z", axis: [0, 0, 1] }
    ];

    if (this.mode === "rotate") {
      return axes.map((entry) => {
        const normal = this.toActiveSpace(entry.axis);
        return {
          handle: entry.handle,
          kind: "rotation-ring" as const,
          segments: ringSegments(this.origin, normal, this.size),
          color: AXIS_COLORS[entry.handle],
          direction: normal
        };
      });
    }

    const axisHandles = axes.map((entry) => {
      const direction = this.toActiveSpace(entry.axis);
      const tip: readonly [number, number, number] = [
        this.origin[0] + direction[0] * this.size,
        this.origin[1] + direction[1] * this.size,
        this.origin[2] + direction[2] * this.size
      ];
      return {
        handle: entry.handle,
        kind: "axis-arrow" as const,
        segments: [{ start: this.origin, end: tip }],
        color: AXIS_COLORS[entry.handle],
        direction
      };
    });

    const planeHandles = ([
      { handle: "xy" as const, first: [1, 0, 0] as const, second: [0, 1, 0] as const },
      { handle: "xz" as const, first: [1, 0, 0] as const, second: [0, 0, 1] as const },
      { handle: "yz" as const, first: [0, 1, 0] as const, second: [0, 0, 1] as const }
    ]).map((entry) => {
      const first = this.toActiveSpace(entry.first);
      const second = this.toActiveSpace(entry.second);
      const extent = this.size * 0.34;
      const a = offset(this.origin, first, extent);
      const b = offset(a, second, extent);
      const c = offset(this.origin, second, extent);
      return {
        handle: entry.handle,
        kind: "plane-quad" as const,
        segments: [
          { start: this.origin, end: a },
          { start: a, end: b },
          { start: b, end: c },
          { start: c, end: this.origin }
        ],
        color: AXIS_COLORS[entry.handle]
      };
    });

    if (this.mode === "scale") {
      return [...axisHandles, ...planeHandles, {
        handle: "uniform" as const,
        kind: "uniform-box" as const,
        segments: uniformBoxSegments(this.origin, this.size * 0.14),
        color: AXIS_COLORS.uniform
      }];
    }
    return [...axisHandles, ...planeHandles];
  }

  /**
   * Picks the nearest handle along a pointer ray.
   *
   * Axis and uniform handles outrank plane handles: plane quads share their corner
   * edges with the axis arms, so a ray aimed at an arm is inside tolerance of both, and
   * sorting purely by distance would make the arms effectively unclickable.
   */
  pick(ray: TransformControlRay): TransformControlPick | undefined {
    const direction = normalize(ray.direction);
    if (!direction) return undefined;
    let best: TransformControlPick | undefined;
    let bestPriority = Number.POSITIVE_INFINITY;
    for (const handle of this.handles()) {
      const candidate = handle.kind === "rotation-ring"
        ? this.pickRing(ray.origin, direction, handle)
        : this.pickSegments(ray.origin, direction, handle);
      if (!candidate) continue;
      const priority = handle.kind === "plane-quad" ? 1 : 0;
      if (!best || priority < bestPriority || (priority === bestPriority && candidate.distance < best.distance)) {
        best = candidate;
        bestPriority = priority;
      }
    }
    return best;
  }

  /** Updates hover state. Returns the hovered handle, if any. */
  hover(ray: TransformControlRay): TransformControlHandle | undefined {
    if (this.dragging) return this.active;
    this.hovered = this.pick(ray)?.handle;
    return this.hovered;
  }

  /**
   * Begins a drag on whichever handle the ray picks.
   *
   * Returns false when nothing was picked so a viewport can fall through to scene
   * selection instead of swallowing the pointer.
   */
  pointerDown(ray: TransformControlRay): boolean {
    if (this.disposed || !this.enabled || this.dragging) return false;
    const picked = this.pick(ray);
    if (!picked) return false;
    const value = this.measure(ray, picked.handle);
    if (value === undefined) return false;
    this.active = picked.handle;
    this.hovered = picked.handle;
    this.dragStartValue = value;
    this.accumulated = 0;
    this.dragging = true;
    return true;
  }

  /**
   * Continues an active drag and applies the resulting delta to the attached object.
   *
   * Only the constrained component is applied, so dragging the X arm cannot move the
   * object on Y or Z.
   */
  pointerMove(ray: TransformControlRay): TransformControlDragUpdate | undefined {
    if (!this.dragging || !this.active) return undefined;
    const value = this.measure(ray, this.active);
    if (value === undefined) return undefined;
    const snappedTotal = this.applySnap(value - this.dragStartValue);
    const step = snappedTotal - this.accumulated;
    this.accumulated = snappedTotal;
    if (step !== 0) this.applyConstrainedDelta(this.active, step);
    return {
      handle: this.active,
      mode: this.mode,
      totalDelta: snappedTotal,
      stepDelta: step,
      snapped: this.snapSettings.enabled
    };
  }

  /** Ends an active drag and reports the committed total. */
  pointerUp(): { readonly handle: TransformControlHandle; readonly totalDelta: number } | undefined {
    if (!this.dragging || !this.active) return undefined;
    const result = { handle: this.active, totalDelta: this.accumulated };
    this.dragging = false;
    this.active = undefined;
    this.accumulated = 0;
    return result;
  }

  /** Aborts a drag without further mutation, for example on Escape or focus loss. */
  cancelDrag(): void {
    this.dragging = false;
    this.active = undefined;
    this.accumulated = 0;
  }

  /** True after `dispose()`; pointer and delta entry points are no-ops past this point. */
  get isDisposed(): boolean {
    return this.disposed;
  }

  /** Explicit-delta mutation, retained unchanged for source compatibility. */
  apply(delta: Vector3Like): void {
    validateDelta(delta);
    const object = this.object;
    if (this.disposed || !this.enabled || !object) return;
    if (this.mode === "translate") add(object.position, delta);
    if (this.mode === "rotate" && object.rotation) add(object.rotation, delta);
    if (this.mode === "scale" && object.scale) add(object.scale, delta);
  }

  /**
   * F1-standard disposal: disables the instance, clears hover/drag state,
   * detaches the object, and owns zero DOM listeners so nothing can leak.
   * Idempotent.
   */
  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.enabled = false;
    this.hovered = undefined;
    this.detach();
  }

  private applyConstrainedDelta(handle: TransformControlHandle, step: number): void {
    const object = this.object;
    if (!object) return;
    if (this.mode === "rotate") {
      if (!object.rotation) return;
      const axis = this.axisMaskFor(handle);
      object.rotation.x += axis[0] * step;
      object.rotation.y += axis[1] * step;
      object.rotation.z += axis[2] * step;
      return;
    }
    if (this.mode === "scale") {
      if (!object.scale) return;
      // Uniform scales every axis; a constrained handle scales only its own axes.
      const axis = handle === "uniform" ? ([1, 1, 1] as const) : this.axisMaskFor(handle);
      object.scale.x += axis[0] * step;
      object.scale.y += axis[1] * step;
      object.scale.z += axis[2] * step;
      return;
    }
    const direction = this.translationDirectionFor(handle);
    object.position.x += direction[0] * step;
    object.position.y += direction[1] * step;
    object.position.z += direction[2] * step;
    this.origin = [object.position.x, object.position.y, object.position.z];
  }

  /** Which object-space axes a handle affects. */
  private axisMaskFor(handle: TransformControlHandle): readonly [number, number, number] {
    switch (handle) {
      case "x": return [1, 0, 0];
      case "y": return [0, 1, 0];
      case "z": return [0, 0, 1];
      case "xy": return [1, 1, 0];
      case "xz": return [1, 0, 1];
      case "yz": return [0, 1, 1];
      case "uniform": return [1, 1, 1];
    }
  }

  /** World-space direction a translate drag moves along. */
  private translationDirectionFor(handle: TransformControlHandle): readonly [number, number, number] {
    const mask = this.axisMaskFor(handle);
    const base: readonly [number, number, number] = handle === "uniform"
      ? [1, 0, 0]
      : [mask[0] ? 1 : 0, mask[0] ? 0 : mask[1] ? 1 : 0, mask[0] || mask[1] ? 0 : 1];
    return this.toActiveSpace(base);
  }

  private measure(ray: TransformControlRay, handle: TransformControlHandle): number | undefined {
    const direction = normalize(ray.direction);
    if (!direction) return undefined;

    if (this.mode === "rotate") {
      const normal = this.toActiveSpace(this.axisUnitFor(handle));
      const hit = intersectPlane(ray.origin, direction, this.origin, normal);
      if (!hit) return undefined;
      const basis = orthonormalBasis(normal);
      const local = subtract(hit, this.origin);
      return Math.atan2(dot(local, basis.second), dot(local, basis.first));
    }

    const axis = this.translationDirectionFor(handle);
    // Build the drag plane from the ray direction so it always faces the pointer.
    const planeNormal = cross(axis, cross(axis, direction));
    const usable = length(planeNormal) > 1e-9 ? planeNormal : orthonormalBasis(axis).first;
    const hit = intersectPlane(ray.origin, direction, this.origin, usable);
    if (!hit) return undefined;
    return dot(subtract(hit, this.origin), normalizeUnsafe(axis));
  }

  private axisUnitFor(handle: TransformControlHandle): readonly [number, number, number] {
    switch (handle) {
      case "x": case "yz": return [1, 0, 0];
      case "y": case "xz": return [0, 1, 0];
      default: return [0, 0, 1];
    }
  }

  private applySnap(value: number): number {
    if (!this.snapSettings.enabled) return value;
    const increment = this.mode === "rotate"
      ? (this.snapSettings.rotationDegrees * Math.PI) / 180
      : this.mode === "scale" ? this.snapSettings.scale : this.snapSettings.position;
    return Math.round(value / increment) * increment;
  }

  private toActiveSpace(axis: readonly [number, number, number]): readonly [number, number, number] {
    return this.space === "world" ? axis : rotateByQuaternion(axis, this.orientation);
  }

  private pickSegments(
    origin: Vector3Like,
    direction: readonly [number, number, number],
    handle: TransformControlHandleGeometry
  ): TransformControlPick | undefined {
    let best: TransformControlPick | undefined;
    for (const segment of handle.segments) {
      const closest = closestApproach(origin, direction, segment.start, segment.end);
      if (!closest || closest.separation > this.pickTolerance) continue;
      if (!best || closest.rayDistance < best.distance) {
        best = { handle: handle.handle, distance: closest.rayDistance, point: closest.point };
      }
    }
    return best;
  }

  private pickRing(
    origin: Vector3Like,
    direction: readonly [number, number, number],
    handle: TransformControlHandleGeometry
  ): TransformControlPick | undefined {
    const normal = handle.direction;
    if (!normal) return undefined;
    const hit = intersectPlane(origin, direction, this.origin, normal);
    if (!hit) return undefined;
    const radial = length(subtract(hit, this.origin));
    // Only the band near the ring radius is pickable, so the interior stays available
    // for scene selection instead of behaving like a filled disc.
    if (Math.abs(radial - this.size) > this.pickTolerance) return undefined;
    return { handle: handle.handle, distance: length(subtract(hit, [origin.x, origin.y, origin.z])), point: hit };
  }
}

function positive(value: number | undefined, fallback: number): number {
  return Number.isFinite(value) && Number(value) > 0 ? Number(value) : fallback;
}

function add(target: Vector3Like, delta: Vector3Like): void {
  target.x += delta.x;
  target.y += delta.y;
  target.z += delta.z;
}

function validateDelta(delta: Vector3Like): void {
  if (![delta.x, delta.y, delta.z].every(Number.isFinite)) {
    throw new RangeError("TransformControls delta must contain finite x/y/z values.");
  }
}

type Vec3 = readonly [number, number, number];

function offset(from: Vec3, direction: Vec3, distance: number): Vec3 {
  return [from[0] + direction[0] * distance, from[1] + direction[1] * distance, from[2] + direction[2] * distance];
}

function subtract(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function length(value: Vec3): number {
  return Math.hypot(value[0], value[1], value[2]);
}

function normalize(value: Vector3Like): Vec3 | undefined {
  const magnitude = Math.hypot(value.x, value.y, value.z);
  if (!Number.isFinite(magnitude) || magnitude <= 1e-9) return undefined;
  return [value.x / magnitude, value.y / magnitude, value.z / magnitude];
}

function normalizeUnsafe(value: Vec3): Vec3 {
  const magnitude = length(value) || 1;
  return [value[0] / magnitude, value[1] / magnitude, value[2] / magnitude];
}

/**
 * Ray/plane intersection accepting hits on either side of the plane.
 *
 * Rejecting negative distances would be correct for scene picking but wrong for gizmo
 * dragging: a pointer can legitimately end up behind the drag plane mid-gesture, and
 * rejecting that would freeze the drag.
 */
function intersectPlane(rayOrigin: Vector3Like, rayDirection: Vec3, planePoint: Vec3, planeNormal: Vec3): Vec3 | undefined {
  const normal = normalizeUnsafe(planeNormal);
  const denominator = dot(normal, rayDirection);
  if (Math.abs(denominator) < 1e-9) return undefined;
  const origin: Vec3 = [rayOrigin.x, rayOrigin.y, rayOrigin.z];
  const distance = dot(normal, subtract(planePoint, origin)) / denominator;
  if (!Number.isFinite(distance)) return undefined;
  return [origin[0] + rayDirection[0] * distance, origin[1] + rayDirection[1] * distance, origin[2] + rayDirection[2] * distance];
}

function orthonormalBasis(normal: Vec3): { readonly first: Vec3; readonly second: Vec3 } {
  const n = normalizeUnsafe(normal);
  // A reference axis parallel to the normal would make the cross product degenerate.
  const reference: Vec3 = Math.abs(n[1]) > 0.9 ? [1, 0, 0] : [0, 1, 0];
  const first = normalizeUnsafe(cross(reference, n));
  const second = normalizeUnsafe(cross(n, first));
  return { first, second };
}

function ringSegments(origin: Vec3, normal: Vec3, radius: number): readonly { readonly start: Vec3; readonly end: Vec3 }[] {
  const basis = orthonormalBasis(normal);
  const steps = 32;
  const segments: { readonly start: Vec3; readonly end: Vec3 }[] = [];
  const point = (angle: number): Vec3 => [
    origin[0] + basis.first[0] * Math.cos(angle) * radius + basis.second[0] * Math.sin(angle) * radius,
    origin[1] + basis.first[1] * Math.cos(angle) * radius + basis.second[1] * Math.sin(angle) * radius,
    origin[2] + basis.first[2] * Math.cos(angle) * radius + basis.second[2] * Math.sin(angle) * radius
  ];
  for (let step = 0; step < steps; step += 1) {
    segments.push({ start: point((step / steps) * Math.PI * 2), end: point(((step + 1) / steps) * Math.PI * 2) });
  }
  return segments;
}

function uniformBoxSegments(origin: Vec3, extent: number): readonly { readonly start: Vec3; readonly end: Vec3 }[] {
  const corners: Vec3[] = [];
  for (const sx of [-1, 1]) for (const sy of [-1, 1]) for (const sz of [-1, 1]) {
    corners.push([origin[0] + sx * extent, origin[1] + sy * extent, origin[2] + sz * extent]);
  }
  const edges: readonly (readonly [number, number])[] = [
    [0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]
  ];
  return edges.map(([from, to]) => ({ start: corners[from]!, end: corners[to]! }));
}

function rotateByQuaternion(axis: Vec3, quaternion: readonly [number, number, number, number]): Vec3 {
  const magnitude = Math.hypot(quaternion[0], quaternion[1], quaternion[2], quaternion[3]) || 1;
  const x = quaternion[0] / magnitude;
  const y = quaternion[1] / magnitude;
  const z = quaternion[2] / magnitude;
  const w = quaternion[3] / magnitude;
  const tx = y * axis[2] - z * axis[1] + w * axis[0];
  const ty = z * axis[0] - x * axis[2] + w * axis[1];
  const tz = x * axis[1] - y * axis[0] + w * axis[2];
  return [
    axis[0] + 2 * (y * tz - z * ty),
    axis[1] + 2 * (z * tx - x * tz),
    axis[2] + 2 * (x * ty - y * tx)
  ];
}

function closestApproach(rayOrigin: Vector3Like, rayDirection: Vec3, start: Vec3, end: Vec3): {
  readonly rayDistance: number;
  readonly separation: number;
  readonly point: Vec3;
} | undefined {
  const segment = subtract(end, start);
  const segmentLength = length(segment);
  if (segmentLength <= 1e-9) return undefined;
  const v = normalizeUnsafe(segment);
  const origin: Vec3 = [rayOrigin.x, rayOrigin.y, rayOrigin.z];
  const w0 = subtract(origin, start);
  const a = dot(rayDirection, rayDirection);
  const b = dot(rayDirection, v);
  const d = dot(rayDirection, w0);
  const e = dot(v, w0);
  const denominator = a - b * b;
  let rayT: number;
  let segmentT: number;
  if (Math.abs(denominator) < 1e-9) {
    // Parallel: clamp to the segment start.
    rayT = Math.max(0, -d / a);
    segmentT = 0;
  } else {
    rayT = (b * e - d) / denominator;
    segmentT = (e - b * d) / denominator;
  }
  if (rayT < 0) rayT = 0;
  segmentT = Math.min(Math.max(segmentT, 0), segmentLength);
  const rayPoint: Vec3 = [
    origin[0] + rayDirection[0] * rayT,
    origin[1] + rayDirection[1] * rayT,
    origin[2] + rayDirection[2] * rayT
  ];
  const segmentPoint = offset(start, v, segmentT);
  return { rayDistance: rayT, separation: length(subtract(rayPoint, segmentPoint)), point: segmentPoint };
}
