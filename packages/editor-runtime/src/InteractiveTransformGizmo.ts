import { Plane, Ray, Vector3 } from "@aura3d/math";
import type { GizmoHandle, GizmoSettings, GizmoSpaceMode } from "./Gizmo";
import { normalizeGizmoSettings } from "./Gizmo";

export type InteractiveGizmoMode = "translate" | "rotate" | "scale";

/**
 * One pickable, renderable gizmo handle.
 *
 * Handles are described in gizmo-local space and transformed by the gizmo's own
 * origin and (in local space mode) the target's orientation, so the same descriptor
 * set serves both world and local modes.
 */
export interface GizmoHandleGeometry {
  readonly handle: GizmoHandle;
  readonly kind: "axis-arrow" | "plane-quad" | "rotation-ring" | "uniform-box";
  /** Line segments in world space, for rendering the handle. */
  readonly segments: readonly { readonly start: readonly [number, number, number]; readonly end: readonly [number, number, number] }[];
  readonly color: readonly [number, number, number, number];
  /** Axis direction in world space. Undefined for uniform handles. */
  readonly direction?: readonly [number, number, number];
}

export interface GizmoPickResult {
  readonly handle: GizmoHandle;
  /** Distance along the ray to the picked point. */
  readonly distance: number;
  /** World-space point on the handle nearest the ray. */
  readonly point: readonly [number, number, number];
}

export interface GizmoDragUpdate {
  readonly handle: GizmoHandle;
  readonly mode: InteractiveGizmoMode;
  /** Signed movement along the constrained axis, in world units (translate/scale). */
  readonly axisDelta: number;
  /** Signed rotation about the constrained axis, in radians. */
  readonly rotationDelta: number;
  /** Accumulated value since drag start, after snapping. */
  readonly totalDelta: number;
  readonly snapped: boolean;
}

export interface InteractiveGizmoState {
  readonly mode: InteractiveGizmoMode;
  readonly spaceMode: GizmoSpaceMode;
  readonly origin: readonly [number, number, number];
  readonly hoveredHandle: GizmoHandle | undefined;
  readonly activeHandle: GizmoHandle | undefined;
  readonly dragging: boolean;
  readonly handleCount: number;
}

export interface InteractiveTransformGizmoOptions {
  readonly mode?: InteractiveGizmoMode;
  readonly settings?: Partial<GizmoSettings>;
  /** Gizmo arm length in world units. */
  readonly size?: number;
  /** Pick radius around each handle, in world units. */
  readonly pickTolerance?: number;
}

const AXIS_COLORS: Readonly<Record<string, readonly [number, number, number, number]>> = {
  x: [1, 0.25, 0.28, 1],
  y: [0.35, 0.95, 0.4, 1],
  z: [0.32, 0.55, 1, 1],
  uniform: [0.95, 0.9, 0.4, 1],
  xy: [0.95, 0.9, 0.4, 0.85],
  xz: [0.6, 0.95, 0.95, 0.85],
  yz: [0.95, 0.55, 0.95, 0.85]
};

/**
 * Interactive transform gizmo: rendered handles, ray picking, and a pointer drag
 * lifecycle with axis constraints, snapping, and local/world spaces.
 *
 * This is the piece the command-backed `TransformControls` compatibility helper never
 * had. That helper applied explicit deltas and had no geometry, no picking, and no
 * drag state, which is why interactive parity could not be claimed from it.
 *
 * Drag math is deliberately projection-free: a pointer ray is intersected against a
 * plane through the gizmo origin, and the resulting world point is projected onto the
 * constrained axis. That keeps the geometry testable without a live camera while
 * remaining exactly what a viewport would feed it.
 */
export class InteractiveTransformGizmo {
  private mode: InteractiveGizmoMode;
  private settings: GizmoSettings;
  private readonly size: number;
  private readonly pickTolerance: number;
  private origin = new Vector3(0, 0, 0);
  /** Target orientation as a quaternion, used for local-space handle directions. */
  private orientation: readonly [number, number, number, number] = [0, 0, 0, 1];
  private hoveredHandle: GizmoHandle | undefined;
  private activeHandle: GizmoHandle | undefined;
  private dragStartValue = 0;
  private accumulated = 0;
  private dragging = false;

  constructor(options: InteractiveTransformGizmoOptions = {}) {
    this.mode = options.mode ?? "translate";
    this.settings = normalizeGizmoSettings(options.settings);
    const size = options.size ?? 1;
    if (!Number.isFinite(size) || size <= 0) throw new RangeError("Gizmo size must be a positive finite number.");
    this.size = size;
    const tolerance = options.pickTolerance ?? size * 0.16;
    if (!Number.isFinite(tolerance) || tolerance <= 0) throw new RangeError("Gizmo pickTolerance must be a positive finite number.");
    this.pickTolerance = tolerance;
  }

  setMode(mode: InteractiveGizmoMode): void {
    this.mode = mode;
    this.cancelDrag();
  }

  configure(settings: Partial<GizmoSettings>): void {
    this.settings = normalizeGizmoSettings({ ...this.settings, ...settings });
  }

  /** Places the gizmo and records the orientation used for local-space handles. */
  place(origin: readonly [number, number, number], orientation: readonly [number, number, number, number] = [0, 0, 0, 1]): void {
    if (!origin.every(Number.isFinite)) throw new RangeError("Gizmo origin must contain finite components.");
    if (!orientation.every(Number.isFinite)) throw new RangeError("Gizmo orientation must contain finite components.");
    this.origin = new Vector3(origin[0], origin[1], origin[2]);
    this.orientation = [orientation[0], orientation[1], orientation[2], orientation[3]];
  }

  state(): InteractiveGizmoState {
    return {
      mode: this.mode,
      spaceMode: this.settings.spaceMode,
      origin: [this.origin.x, this.origin.y, this.origin.z],
      hoveredHandle: this.hoveredHandle,
      activeHandle: this.activeHandle,
      dragging: this.dragging,
      handleCount: this.handles().length
    };
  }

  /**
   * Renderable, pickable handle geometry for the current mode and space.
   *
   * Translate and scale expose three axis handles plus three plane handles; rotate
   * exposes three rings. Local space rotates every direction by the target
   * orientation, which is the difference a viewport actually shows.
   */
  handles(): readonly GizmoHandleGeometry[] {
    const axes: readonly { readonly handle: GizmoHandle; readonly axis: readonly [number, number, number] }[] = [
      { handle: "x", axis: [1, 0, 0] },
      { handle: "y", axis: [0, 1, 0] },
      { handle: "z", axis: [0, 0, 1] }
    ];

    if (this.mode === "rotate") {
      return axes.map((entry) => {
        const direction = this.toActiveSpace(entry.axis);
        return {
          handle: entry.handle,
          kind: "rotation-ring" as const,
          segments: this.ringSegments(direction),
          color: AXIS_COLORS[entry.handle] ?? AXIS_COLORS.uniform!,
          direction
        };
      });
    }

    const axisHandles: GizmoHandleGeometry[] = axes.map((entry) => {
      const direction = this.toActiveSpace(entry.axis);
      const tip = this.origin.add(new Vector3(direction[0], direction[1], direction[2]).multiplyScalar(this.size));
      return {
        handle: entry.handle,
        kind: "axis-arrow" as const,
        segments: [{ start: [this.origin.x, this.origin.y, this.origin.z], end: [tip.x, tip.y, tip.z] }],
        color: AXIS_COLORS[entry.handle] ?? AXIS_COLORS.uniform!,
        direction
      };
    });

    const planeHandles: GizmoHandleGeometry[] = ([
      { handle: "xy" as const, first: [1, 0, 0] as const, second: [0, 1, 0] as const },
      { handle: "xz" as const, first: [1, 0, 0] as const, second: [0, 0, 1] as const },
      { handle: "yz" as const, first: [0, 1, 0] as const, second: [0, 0, 1] as const }
    ]).map((entry) => {
      const first = this.toActiveSpace(entry.first);
      const second = this.toActiveSpace(entry.second);
      const extent = this.size * 0.34;
      const a = this.origin.add(vec(first).multiplyScalar(extent));
      const b = a.add(vec(second).multiplyScalar(extent));
      const c = this.origin.add(vec(second).multiplyScalar(extent));
      return {
        handle: entry.handle,
        kind: "plane-quad" as const,
        segments: [
          { start: tuple(this.origin), end: tuple(a) },
          { start: tuple(a), end: tuple(b) },
          { start: tuple(b), end: tuple(c) },
          { start: tuple(c), end: tuple(this.origin) }
        ],
        color: AXIS_COLORS[entry.handle] ?? AXIS_COLORS.uniform!
      };
    });

    if (this.mode === "scale") {
      // Uniform scale handle, which rotate and translate do not have.
      const uniform: GizmoHandleGeometry = {
        handle: "uniform",
        kind: "uniform-box",
        segments: this.uniformBoxSegments(),
        color: AXIS_COLORS.uniform!
      };
      return [...axisHandles, ...planeHandles, uniform];
    }
    return [...axisHandles, ...planeHandles];
  }

  /**
   * Picks the nearest handle along a pointer ray.
   *
   * Axis handles use ray-to-segment closest approach; rings use ray-to-plane
   * intersection with a radial band test. Returning the distance lets a caller sort
   * gizmo picks against scene geometry picks.
   */
  pick(ray: Ray): GizmoPickResult | undefined {
    // Axis and uniform handles take priority over plane handles.
    //
    // Plane handles share their corner edges with the axis arms, so a ray aimed at an
    // arm is inside tolerance of both. Sorting purely by ray distance lets the plane
    // quad win and makes the axis arms effectively unclickable, which is a real
    // usability bug rather than a cosmetic one. Real gizmos resolve this the same way:
    // the more constrained handle wins the tie.
    const priority = (handle: GizmoHandleGeometry): number => (handle.kind === "plane-quad" ? 1 : 0);
    let best: GizmoPickResult | undefined;
    let bestPriority = Number.POSITIVE_INFINITY;
    for (const handle of this.handles()) {
      const candidate = handle.kind === "rotation-ring"
        ? this.pickRing(ray, handle)
        : this.pickSegments(ray, handle);
      if (!candidate) continue;
      const candidatePriority = priority(handle);
      if (!best || candidatePriority < bestPriority || (candidatePriority === bestPriority && candidate.distance < best.distance)) {
        best = candidate;
        bestPriority = candidatePriority;
      }
    }
    return best;
  }

  /** Updates hover state from a pointer ray. Returns the hovered handle, if any. */
  hover(ray: Ray): GizmoHandle | undefined {
    if (this.dragging) return this.activeHandle;
    this.hoveredHandle = this.pick(ray)?.handle;
    return this.hoveredHandle;
  }

  /**
   * Begins a drag on whichever handle the ray picks.
   *
   * Returns false when nothing was picked, so a viewport can fall through to scene
   * selection instead of swallowing the pointer.
   */
  pointerDown(ray: Ray): boolean {
    if (this.dragging) return false;
    const picked = this.pick(ray);
    if (!picked) return false;
    const value = this.measure(ray, picked.handle);
    if (value === undefined) return false;
    this.activeHandle = picked.handle;
    this.hoveredHandle = picked.handle;
    this.dragStartValue = value;
    this.accumulated = 0;
    this.dragging = true;
    return true;
  }

  /** Continues an active drag. Returns undefined when no drag is in progress. */
  pointerMove(ray: Ray): GizmoDragUpdate | undefined {
    if (!this.dragging || !this.activeHandle) return undefined;
    const value = this.measure(ray, this.activeHandle);
    if (value === undefined) return undefined;
    const raw = value - this.dragStartValue;
    const snappedTotal = this.applySnap(raw);
    const previous = this.accumulated;
    this.accumulated = snappedTotal;
    const step = snappedTotal - previous;
    return {
      handle: this.activeHandle,
      mode: this.mode,
      axisDelta: this.mode === "rotate" ? 0 : step,
      rotationDelta: this.mode === "rotate" ? step : 0,
      totalDelta: snappedTotal,
      snapped: this.settings.snapEnabled
    };
  }

  /** Ends an active drag and reports the committed total. */
  pointerUp(): { readonly handle: GizmoHandle; readonly totalDelta: number } | undefined {
    if (!this.dragging || !this.activeHandle) return undefined;
    const result = { handle: this.activeHandle, totalDelta: this.accumulated };
    this.dragging = false;
    this.activeHandle = undefined;
    this.accumulated = 0;
    return result;
  }

  /** Aborts a drag without committing, for example on Escape or focus loss. */
  cancelDrag(): void {
    this.dragging = false;
    this.activeHandle = undefined;
    this.accumulated = 0;
  }

  dispose(): void {
    this.cancelDrag();
    this.hoveredHandle = undefined;
  }

  /**
   * Scalar the drag is measured along for a handle.
   *
   * Axis handles measure distance along the axis; plane handles measure along the
   * plane's first in-plane direction; rings measure an angle about the ring normal.
   */
  private measure(ray: Ray, handle: GizmoHandle): number | undefined {
    const directions = this.handleDirections(handle);
    if (!directions) return undefined;

    if (this.mode === "rotate") {
      // Rotation is measured in the ring's own plane, which is fixed by the handle.
      const hit = intersectPlaneBothSides(ray, this.origin, directions.ringNormal);
      if (!hit) return undefined;
      const local = hit.subtract(this.origin);
      return Math.atan2(local.dot(vec(directions.tangent)), local.dot(vec(directions.reference)));
    }

    // Translate and scale measure distance along the constrained axis. The drag plane
    // must contain that axis and face the viewer; a fixed plane can be parallel to the
    // pointer ray, in which case there is no intersection and the drag silently dies.
    // Building the plane from the ray direction guarantees a usable intersection.
    const axis = vec(directions.measure).normalize();
    const planeNormal = axis.cross(axis.cross(ray.direction));
    const usableNormal = planeNormal.lengthSquared() > 1e-12 ? planeNormal : perpendicularTo(axis);
    const hit = intersectPlaneBothSides(ray, this.origin, tuple(usableNormal));
    if (!hit) return undefined;
    return hit.subtract(this.origin).dot(axis);
  }

  private handleDirections(handle: GizmoHandle): {
    readonly measure: readonly [number, number, number];
    /** Ring plane normal, used only in rotate mode. */
    readonly ringNormal: readonly [number, number, number];
    readonly reference: readonly [number, number, number];
    readonly tangent: readonly [number, number, number];
  } | undefined {
    const x = this.toActiveSpace([1, 0, 0]);
    const y = this.toActiveSpace([0, 1, 0]);
    const z = this.toActiveSpace([0, 0, 1]);
    switch (handle) {
      case "x":
        return { measure: x, ringNormal: x, reference: y, tangent: z };
      case "y":
        return { measure: y, ringNormal: y, reference: z, tangent: x };
      case "z":
        return { measure: z, ringNormal: z, reference: x, tangent: y };
      case "xy":
        return { measure: x, ringNormal: z, reference: x, tangent: y };
      case "xz":
        return { measure: x, ringNormal: y, reference: x, tangent: z };
      case "yz":
        return { measure: y, ringNormal: x, reference: y, tangent: z };
      case "uniform":
        // Uniform scale is driven by movement along a single consistent axis; only the
        // delta matters, so the choice of axis just needs to be stable.
        return { measure: x, ringNormal: z, reference: x, tangent: y };
    }
  }

  private applySnap(value: number): number {
    if (!this.settings.snapEnabled) return value;
    const increment = this.mode === "rotate"
      ? (this.settings.rotationSnapDegrees * Math.PI) / 180
      : this.mode === "scale" ? this.settings.scaleSnap : this.settings.positionSnap;
    return Math.round(value / increment) * increment;
  }

  /** Rotates a gizmo-local direction into the active space. */
  private toActiveSpace(axis: readonly [number, number, number]): readonly [number, number, number] {
    if (this.settings.spaceMode === "world") return axis;
    return rotateByQuaternion(axis, this.orientation);
  }

  private ringSegments(normal: readonly [number, number, number]): readonly { readonly start: readonly [number, number, number]; readonly end: readonly [number, number, number] }[] {
    const basis = orthonormalBasis(normal);
    const steps = 32;
    const radius = this.size;
    const segments: { readonly start: readonly [number, number, number]; readonly end: readonly [number, number, number] }[] = [];
    for (let step = 0; step < steps; step += 1) {
      const a = (step / steps) * Math.PI * 2;
      const b = ((step + 1) / steps) * Math.PI * 2;
      segments.push({ start: tuple(this.ringPoint(basis, radius, a)), end: tuple(this.ringPoint(basis, radius, b)) });
    }
    return segments;
  }

  private ringPoint(
    basis: { readonly first: readonly [number, number, number]; readonly second: readonly [number, number, number] },
    radius: number,
    angle: number
  ): Vector3 {
    return this.origin
      .add(vec(basis.first).multiplyScalar(Math.cos(angle) * radius))
      .add(vec(basis.second).multiplyScalar(Math.sin(angle) * radius));
  }

  private uniformBoxSegments(): readonly { readonly start: readonly [number, number, number]; readonly end: readonly [number, number, number] }[] {
    const extent = this.size * 0.14;
    const corners: Vector3[] = [];
    for (const sx of [-1, 1]) {
      for (const sy of [-1, 1]) {
        for (const sz of [-1, 1]) {
          corners.push(this.origin.add(new Vector3(sx * extent, sy * extent, sz * extent)));
        }
      }
    }
    const edges: readonly (readonly [number, number])[] = [
      [0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]
    ];
    return edges.map(([from, to]) => ({ start: tuple(corners[from]!), end: tuple(corners[to]!) }));
  }

  private pickSegments(ray: Ray, handle: GizmoHandleGeometry): GizmoPickResult | undefined {
    let best: GizmoPickResult | undefined;
    for (const segment of handle.segments) {
      const closest = closestApproach(ray, vec(segment.start), vec(segment.end));
      if (!closest || closest.separation > this.pickTolerance) continue;
      if (!best || closest.rayDistance < best.distance) {
        best = { handle: handle.handle, distance: closest.rayDistance, point: tuple(closest.point) };
      }
    }
    return best;
  }

  private pickRing(ray: Ray, handle: GizmoHandleGeometry): GizmoPickResult | undefined {
    const normal = handle.direction;
    if (!normal) return undefined;
    const hit = ray.intersectPlane(planeThrough(this.origin, normal));
    if (!hit) return undefined;
    const radial = hit.subtract(this.origin).length();
    // Only the band near the ring radius is pickable, so the interior stays free for
    // scene selection instead of the ring behaving like a filled disc.
    if (Math.abs(radial - this.size) > this.pickTolerance) return undefined;
    return { handle: handle.handle, distance: hit.subtract(ray.origin).length(), point: tuple(hit) };
  }
}

function vec(value: readonly [number, number, number]): Vector3 {
  return new Vector3(value[0], value[1], value[2]);
}

function tuple(value: Vector3): readonly [number, number, number] {
  return [value.x, value.y, value.z];
}

function planeThrough(origin: Vector3, normal: readonly [number, number, number]): Plane {
  const n = vec(normal).normalize();
  return new Plane(n, -n.dot(origin));
}

/**
 * Ray/plane intersection that accepts hits on either side of the plane.
 *
 * `Ray.intersectPlane` rejects negative distances, which is correct for scene picking
 * but wrong for gizmo dragging: a pointer can legitimately end up on the far side of
 * the drag plane mid-gesture, and rejecting that would freeze the drag.
 */
function intersectPlaneBothSides(ray: Ray, origin: Vector3, normal: readonly [number, number, number]): Vector3 | undefined {
  const n = vec(normal).normalize();
  const denominator = n.dot(ray.direction);
  if (Math.abs(denominator) < 1e-9) return undefined;
  const distance = n.dot(origin.subtract(ray.origin)) / denominator;
  if (!Number.isFinite(distance)) return undefined;
  return ray.origin.add(ray.direction.multiplyScalar(distance));
}

/** Any unit vector perpendicular to `axis`. */
function perpendicularTo(axis: Vector3): Vector3 {
  const reference = Math.abs(axis.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  return reference.cross(axis).normalize();
}

function orthonormalBasis(normal: readonly [number, number, number]): {
  readonly first: readonly [number, number, number];
  readonly second: readonly [number, number, number];
} {
  const n = vec(normal).normalize();
  // Choose a reference axis that is not parallel to the normal, otherwise the cross
  // product degenerates to zero and the ring collapses.
  const reference = Math.abs(n.y) > 0.9 ? new Vector3(1, 0, 0) : new Vector3(0, 1, 0);
  const first = reference.cross(n).normalize();
  const second = n.cross(first).normalize();
  return { first: tuple(first), second: tuple(second) };
}

function rotateByQuaternion(
  axis: readonly [number, number, number],
  quaternion: readonly [number, number, number, number]
): readonly [number, number, number] {
  const [qx, qy, qz, qw] = quaternion;
  const length = Math.hypot(qx, qy, qz, qw) || 1;
  const x = qx / length;
  const y = qy / length;
  const z = qz / length;
  const w = qw / length;
  const [vx, vy, vz] = axis;
  // v + 2 * cross(q.xyz, cross(q.xyz, v) + q.w * v)
  const tx = y * vz - z * vy + w * vx;
  const ty = z * vx - x * vz + w * vy;
  const tz = x * vy - y * vx + w * vz;
  return [
    vx + 2 * (y * tz - z * ty),
    vy + 2 * (z * tx - x * tz),
    vz + 2 * (x * ty - y * tx)
  ];
}

/** Closest approach between a ray and a finite segment. */
function closestApproach(ray: Ray, start: Vector3, end: Vector3): {
  readonly rayDistance: number;
  readonly separation: number;
  readonly point: Vector3;
} | undefined {
  const segmentDirection = end.subtract(start);
  const segmentLength = segmentDirection.length();
  if (segmentLength <= 1e-9) return undefined;
  const u = ray.direction;
  const v = segmentDirection.multiplyScalar(1 / segmentLength);
  const w0 = ray.origin.subtract(start);
  const a = u.dot(u);
  const b = u.dot(v);
  const c = v.dot(v);
  const d = u.dot(w0);
  const e = v.dot(w0);
  const denominator = a * c - b * b;
  let rayT: number;
  let segmentT: number;
  if (Math.abs(denominator) < 1e-9) {
    // Parallel: clamp to the segment start.
    rayT = Math.max(0, -d / a);
    segmentT = 0;
  } else {
    rayT = (b * e - c * d) / denominator;
    segmentT = (a * e - b * d) / denominator;
  }
  if (rayT < 0) rayT = 0;
  segmentT = Math.min(Math.max(segmentT, 0), segmentLength);
  const rayPoint = ray.origin.add(u.multiplyScalar(rayT));
  const segmentPoint = start.add(v.multiplyScalar(segmentT));
  return { rayDistance: rayT, separation: rayPoint.subtract(segmentPoint).length(), point: segmentPoint };
}
