// Wonder World stage geometry (PRD 04 D08-D13): named spots, the fixed child
// camera framings and the pure projection and layout math the stage uses for
// picking, target rectangles and placing props that share a spot. No DOM and
// no engine imports, so every number here is unit tested.
//
// The stage is a small toy set in front of a fixed camera about 4.5 m back.
// Characters are about 1 m tall. Ground spots have y = 0 (the feet); the high
// spots float about 1.8 m up. Off spots sit outside every framing, so actors
// can walk, float or drop in from them.

import type { CameraPresetId, SpotId } from "../types.js";
import { clamp, lerp, lerpVec3, type Vec3 } from "./motion.js";

// ---------------------------------------------------------------- spots

export const SPOTS: Readonly<Record<SpotId, Vec3>> = {
  center: [0, 0, 0],
  left: [-1.3, 0, 0.1],
  right: [1.3, 0, 0.1],
  farLeft: [-2.4, 0, -0.4],
  farRight: [2.4, 0, -0.4],
  front: [0, 0, 1.25],
  frontLeft: [-0.95, 0, 1.15],
  frontRight: [0.95, 0, 1.15],
  back: [0, 0, -1.6],
  backLeft: [-1.5, 0, -1.5],
  backRight: [1.5, 0, -1.5],
  high: [0, 1.85, -0.5],
  highLeft: [-1.45, 1.75, -0.5],
  highRight: [1.45, 1.75, -0.5],
  offLeft: [-6.5, 0, 0.1],
  offRight: [6.5, 0, 0.1],
  offTop: [0, 7.5, -0.5],
  offBelow: [0, -4.5, 0.3]
};

export const SPOT_IDS = Object.keys(SPOTS) as readonly SpotId[];

export const OFF_STAGE_SPOTS: readonly SpotId[] = ["offLeft", "offRight", "offTop", "offBelow"];
export const HIGH_SPOTS: readonly SpotId[] = ["high", "highLeft", "highRight"];
export const ON_STAGE_SPOTS: readonly SpotId[] = SPOT_IDS.filter((id) => !OFF_STAGE_SPOTS.includes(id));
/** The spots every framing keeps in view, even a narrow portrait phone. */
export const CORE_SPOTS: readonly SpotId[] = ["center", "left", "right", "front", "frontLeft", "frontRight", "back", "high"];

export function spotPosition(id: SpotId): Vec3 {
  return SPOTS[id];
}

export function isOffStage(id: SpotId): boolean {
  return OFF_STAGE_SPOTS.includes(id);
}

export function isHighSpot(id: SpotId): boolean {
  return HIGH_SPOTS.includes(id);
}

/** Where an actor comes from when an `enter` action names no `from`: the nearer side, or above for floaters. */
export function defaultEntrySpot(at: SpotId, floats: boolean): SpotId {
  if (floats || isHighSpot(at)) return "offTop";
  return SPOTS[at][0] > 0.05 ? "offRight" : "offLeft";
}

// ---------------------------------------------------------------- camera

export interface CameraPose {
  readonly position: Vec3;
  readonly target: Vec3;
  /** Vertical field of view in degrees. */
  readonly fov: number;
  readonly near: number;
  readonly far: number;
}

export interface CameraPresetSpec extends CameraPose {
  /** Half-width (metres) the framing keeps visible around the target in landscape. */
  readonly halfWidth: number;
  /** Half-width kept on the narrowest portrait screens (the core of the stage). */
  readonly minHalfWidth: number;
  /** Ultra-wide screens narrow the field of view so the framing never shows more than this. */
  readonly maxHalfWidth: number;
  /** Widest vertical field of view before the camera dollies back instead. */
  readonly maxFov: number;
}

const NEAR = 0.1;
const FAR = 120;

export const CAMERA_PRESETS: Readonly<Record<CameraPresetId, CameraPresetSpec>> = {
  wide: { position: [0, 1.85, 6.2], target: [0, 0.75, -0.3], fov: 46, near: NEAR, far: FAR, halfWidth: 3.4, minHalfWidth: 2.2, maxHalfWidth: 5.0, maxFov: 58 },
  medium: { position: [0, 1.5, 4.6], target: [0, 0.7, -0.2], fov: 46, near: NEAR, far: FAR, halfWidth: 2.9, minHalfWidth: 1.9, maxHalfWidth: 4.2, maxFov: 58 },
  close: { position: [0, 1.15, 3.2], target: [0, 0.65, 0], fov: 40, near: NEAR, far: FAR, halfWidth: 1.6, minHalfWidth: 1.1, maxHalfWidth: 2.6, maxFov: 56 },
  left: { position: [-1.3, 1.35, 4.0], target: [-1.1, 0.65, -0.2], fov: 42, near: NEAR, far: FAR, halfWidth: 1.7, minHalfWidth: 1.15, maxHalfWidth: 2.7, maxFov: 56 },
  right: { position: [1.3, 1.35, 4.0], target: [1.1, 0.65, -0.2], fov: 42, near: NEAR, far: FAR, halfWidth: 1.7, minHalfWidth: 1.15, maxHalfWidth: 2.7, maxFov: 56 },
  high: { position: [0, 3.4, 5.6], target: [0, 0.55, -0.3], fov: 46, near: NEAR, far: FAR, halfWidth: 3.0, minHalfWidth: 2.0, maxHalfWidth: 5.0, maxFov: 58 }
};

export const DEFAULT_CAMERA_PRESET: CameraPresetId = "medium";

/** Seconds a camera preset change eases over (no whip pans). */
export const CAMERA_EASE_SEC = 1.4;

function sub(a: Vec3, b: Vec3): Vec3 {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

function dot(a: Vec3, b: Vec3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

function cross(a: Vec3, b: Vec3): Vec3 {
  return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
}

function length(a: Vec3): number {
  return Math.hypot(a[0], a[1], a[2]);
}

function normalize(a: Vec3): Vec3 {
  const l = length(a);
  return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, -1];
}

const DEG = Math.PI / 180;

/** The half-width a preset must keep visible at this aspect (narrow screens keep only the core of the stage). */
export function requiredHalfWidth(spec: CameraPresetSpec, aspect: number): number {
  const t = clamp((aspect - 0.5) / (1.3 - 0.5), 0, 1);
  return lerp(spec.minHalfWidth, spec.halfWidth, t);
}

/**
 * Fits a preset to the canvas aspect: widens the field of view (up to `maxFov`) and
 * then dollies back along the view line until the required half-width is visible;
 * on ultra-wide screens narrows the field of view instead. Pure.
 */
export function frameCamera(preset: CameraPresetId, aspect: number): CameraPose {
  const spec = CAMERA_PRESETS[preset];
  const a = Number.isFinite(aspect) && aspect > 0.05 ? aspect : 16 / 9;
  const view = sub(spec.target, spec.position);
  const distance = length(view);
  const dir = normalize(view);
  const need = requiredHalfWidth(spec, a);
  const halfWidthAt = (fovDeg: number, d: number): number => d * Math.tan((fovDeg * DEG) / 2) * a;
  let fov = spec.fov;
  let d = distance;
  if (halfWidthAt(fov, d) < need) {
    fov = Math.min(spec.maxFov, (2 * Math.atan(need / (d * a))) / DEG);
    if (halfWidthAt(fov, d) < need - 1e-6) {
      d = need / (Math.tan((fov * DEG) / 2) * a);
    }
  } else if (halfWidthAt(fov, d) > spec.maxHalfWidth) {
    fov = (2 * Math.atan(spec.maxHalfWidth / (d * a))) / DEG;
  }
  const position: Vec3 = [spec.target[0] - dir[0] * d, spec.target[1] - dir[1] * d, spec.target[2] - dir[2] * d];
  return { position, target: spec.target, fov, near: spec.near, far: spec.far };
}

export function lerpCameraPose(a: CameraPose, b: CameraPose, t: number): CameraPose {
  return {
    position: lerpVec3(a.position, b.position, t),
    target: lerpVec3(a.target, b.target, t),
    fov: lerp(a.fov, b.fov, t),
    near: lerp(a.near, b.near, t),
    far: lerp(a.far, b.far, t)
  };
}

export function sameCameraPose(a: CameraPose, b: CameraPose, epsilon = 1e-5): boolean {
  return Math.abs(a.fov - b.fov) < epsilon
    && length(sub(a.position, b.position)) < epsilon
    && length(sub(a.target, b.target)) < epsilon;
}

interface CameraBasis {
  readonly forward: Vec3;
  readonly right: Vec3;
  readonly up: Vec3;
}

function cameraBasis(pose: CameraPose): CameraBasis {
  const forward = normalize(sub(pose.target, pose.position));
  let right = cross(forward, [0, 1, 0]);
  if (length(right) < 1e-6) right = [1, 0, 0];
  right = normalize(right);
  const up = cross(right, forward);
  return { forward, right, up };
}

/**
 * Projects a world point to normalised device coordinates [x, y, depth] for a
 * perspective camera (x right, y up, both -1..1 inside the frame). Returns null
 * for points at or behind the near plane.
 */
export function projectToNdc(point: Vec3, pose: CameraPose, aspect: number): Vec3 | null {
  const { forward, right, up } = cameraBasis(pose);
  const v = sub(point, pose.position);
  const depth = dot(v, forward);
  if (depth <= pose.near) return null;
  const tanHalf = Math.tan((pose.fov * DEG) / 2);
  return [dot(v, right) / (depth * tanHalf * aspect), dot(v, up) / (depth * tanHalf), depth];
}

/** True when a point projects inside the frame (with an optional inset margin in NDC units). */
export function isInFrame(point: Vec3, pose: CameraPose, aspect: number, margin = 0): boolean {
  const ndc = projectToNdc(point, pose, aspect);
  if (!ndc) return false;
  return Math.abs(ndc[0]) <= 1 - margin && Math.abs(ndc[1]) <= 1 - margin;
}

/** NDC to CSS pixels inside a canvas of the given CSS size (origin top-left). */
export function ndcToCss(ndcX: number, ndcY: number, width: number, height: number): readonly [number, number] {
  return [((ndcX + 1) / 2) * width, ((1 - ndcY) / 2) * height];
}

/** CSS pixels (relative to the canvas, origin top-left) to NDC. */
export function cssToNdc(x: number, y: number, width: number, height: number): readonly [number, number] {
  const w = width > 0 ? width : 1;
  const h = height > 0 ? height : 1;
  return [(x / w) * 2 - 1, 1 - (y / h) * 2];
}

/** A world-space ray through an NDC point (for hit tests and tests of the hit test). */
export function rayThroughNdc(pose: CameraPose, aspect: number, ndcX: number, ndcY: number): { readonly origin: Vec3; readonly direction: Vec3 } {
  const { forward, right, up } = cameraBasis(pose);
  const tanHalf = Math.tan((pose.fov * DEG) / 2);
  const x = ndcX * tanHalf * aspect;
  const y = ndcY * tanHalf;
  const direction = normalize([
    forward[0] + right[0] * x + up[0] * y,
    forward[1] + right[1] * x + up[1] * y,
    forward[2] + right[2] * x + up[2] * y
  ]);
  return { origin: pose.position, direction };
}

export interface Box3 {
  readonly min: Vec3;
  readonly max: Vec3;
}

/** Axis-aligned box of a node standing on `base` with the given size, inflated by `factor` around its centre. */
export function standingBox(base: Vec3, size: Vec3, factor = 1, minSize = 0): Box3 {
  const w = Math.max(size[0] * factor, minSize);
  const h = Math.max(size[1] * factor, minSize);
  const d = Math.max(size[2] * factor, minSize);
  const cy = base[1] + size[1] / 2;
  return {
    min: [base[0] - w / 2, cy - h / 2, base[2] - d / 2],
    max: [base[0] + w / 2, cy + h / 2, base[2] + d / 2]
  };
}

/** Slab-method ray / box test. Returns the hit distance or null. */
export function rayBoxDistance(origin: Vec3, direction: Vec3, box: Box3): number | null {
  let tmin = -Infinity;
  let tmax = Infinity;
  for (let i = 0; i < 3; i += 1) {
    const o = origin[i];
    const d = direction[i];
    const lo = box.min[i];
    const hi = box.max[i];
    if (Math.abs(d) < 1e-9) {
      if (o < lo || o > hi) return null;
      continue;
    }
    const t1 = (lo - o) / d;
    const t2 = (hi - o) / d;
    tmin = Math.max(tmin, Math.min(t1, t2));
    tmax = Math.min(tmax, Math.max(t1, t2));
  }
  if (tmax < Math.max(tmin, 0)) return null;
  return tmin >= 0 ? tmin : tmax;
}

/** Screen rectangle (CSS px, relative to the canvas) that covers a box; null when it is behind the camera. */
export function boxToCssRect(box: Box3, pose: CameraPose, aspect: number, width: number, height: number): { readonly x: number; readonly y: number; readonly w: number; readonly h: number } | null {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  let any = false;
  for (let i = 0; i < 8; i += 1) {
    const corner: Vec3 = [
      i & 1 ? box.max[0] : box.min[0],
      i & 2 ? box.max[1] : box.min[1],
      i & 4 ? box.max[2] : box.min[2]
    ];
    const ndc = projectToNdc(corner, pose, aspect);
    if (!ndc) continue;
    any = true;
    const [x, y] = ndcToCss(ndc[0], ndc[1], width, height);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  if (!any) return null;
  const x0 = clamp(minX, 0, width);
  const y0 = clamp(minY, 0, height);
  const x1 = clamp(maxX, 0, width);
  const y1 = clamp(maxY, 0, height);
  if (x1 - x0 <= 0 || y1 - y0 <= 0) return null;
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

// ---------------------------------------------------------------- layout

/**
 * How a node behaves when it shares a spot with others:
 * - actor: characters and animals stand side by side;
 * - surface: tables, plates, cushions; small props placed on the same spot rest on top;
 * - container: boxes and baskets; hidden things on the same spot wait inside;
 * - occluder: doors, bushes, barns; hidden things on the same spot wait behind;
 * - stackable: blocks stack into a tower;
 * - plain: everything else stands side by side.
 */
export type LayoutRole = "actor" | "surface" | "container" | "occluder" | "stackable" | "plain";

export interface LayoutEntry {
  readonly id: string;
  readonly spot: SpotId;
  readonly role: LayoutRole;
  /** Metres. */
  readonly width: number;
  readonly depth: number;
  readonly height: number;
  /** For surfaces and containers: the height things rest at, in metres above the base. */
  readonly restHeight?: number;
  readonly hidden: boolean;
}

/** Props at most this tall rest on a surface that shares their spot. */
export const SMALL_PROP_HEIGHT_M = 0.65;
const SPREAD_GAP_M = 0.14;

/**
 * Resolves where each node starts. Nodes alone on a spot stand on it. Shared spots:
 * small props rest on a surface, blocks stack, hidden nodes wait behind an occluder
 * or inside a container, and the rest stand side by side, centred on the spot.
 * Deterministic: ties keep the input order.
 */
export function resolveLayout(entries: readonly LayoutEntry[]): ReadonlyMap<string, Vec3> {
  const out = new Map<string, Vec3>();
  const groups = new Map<SpotId, LayoutEntry[]>();
  for (const entry of entries) {
    const group = groups.get(entry.spot);
    if (group) group.push(entry);
    else groups.set(entry.spot, [entry]);
  }
  for (const [spot, group] of groups) {
    const base = SPOTS[spot];
    const only = group.length === 1 ? group[0] : undefined;
    if (only) {
      out.set(only.id, base);
      continue;
    }
    const surface = group.find((e) => e.role === "surface");
    const occluder = group.find((e) => e.role === "occluder" || e.role === "container");
    const anchors = new Set<string>();
    if (surface) {
      out.set(surface.id, base);
      anchors.add(surface.id);
    }
    if (occluder && occluder !== surface) {
      out.set(occluder.id, base);
      anchors.add(occluder.id);
    }
    const restY = base[1] + (surface ? surface.restHeight ?? surface.height : 0);
    // Hidden things wait behind an occluder or inside a container.
    if (occluder && occluder !== surface) {
      for (const entry of group) {
        if (anchors.has(entry.id) || !entry.hidden) continue;
        if (occluder.role === "container") {
          out.set(entry.id, [base[0], base[1] + (occluder.restHeight ?? occluder.height * 0.2), base[2]]);
        } else {
          out.set(entry.id, [base[0], base[1], base[2] - (occluder.depth / 2 + entry.depth / 2 + 0.06)]);
        }
        anchors.add(entry.id);
      }
    }
    // Blocks stack into a tower (on the surface when there is one).
    let stackY = restY;
    for (const entry of group) {
      if (anchors.has(entry.id) || entry.role !== "stackable") continue;
      out.set(entry.id, [base[0], stackY, base[2]]);
      stackY += entry.height;
      anchors.add(entry.id);
    }
    // Small props rest on the surface, side by side across it.
    if (surface) {
      const onTop = group.filter((e) => !anchors.has(e.id) && e.role !== "actor" && e.height <= SMALL_PROP_HEIGHT_M);
      spreadRow(onTop, [base[0], restY, base[2]], out, anchors);
    }
    // Everything else stands side by side on the ground, centred on the spot.
    const rest = group.filter((e) => !anchors.has(e.id));
    if (anchors.size > 0 && rest.length > 0) {
      // Keep the anchors in the middle: the row goes in front of them.
      const anchorDepth = Math.max(...group.filter((e) => anchors.has(e.id)).map((e) => e.depth));
      spreadRow(rest, [base[0], base[1], base[2] + anchorDepth / 2 + 0.25], out, anchors);
    } else {
      spreadRow(rest, base, out, anchors);
    }
  }
  return out;
}

function spreadRow(entries: readonly LayoutEntry[], center: Vec3, out: Map<string, Vec3>, anchors: Set<string>): void {
  if (entries.length === 0) return;
  const total = entries.reduce((sum, e) => sum + e.width, 0) + SPREAD_GAP_M * (entries.length - 1);
  let x = center[0] - total / 2;
  for (const entry of entries) {
    out.set(entry.id, [x + entry.width / 2, center[1], center[2]]);
    x += entry.width + SPREAD_GAP_M;
    anchors.add(entry.id);
  }
}

export interface Occupant {
  readonly id: string;
  readonly position: Vec3;
  readonly role: LayoutRole;
  readonly width: number;
  readonly height: number;
  readonly restHeight?: number;
}

export interface Mover {
  readonly id: string;
  readonly role: LayoutRole;
  readonly width: number;
  readonly height: number;
  /** Where it is now (it moves in from this side). */
  readonly from: Vec3;
}

/**
 * Where a node should stop when it moves to a spot that others already occupy:
 * on a surface (small props), on top of a block (blocks) or beside whoever stands there.
 */
export function placeAtSpot(spot: SpotId, mover: Mover, occupants: readonly Occupant[]): Vec3 {
  const base = SPOTS[spot];
  const near = occupants.filter((o) => o.id !== mover.id && Math.hypot(o.position[0] - base[0], o.position[2] - base[2]) < 0.35);
  const surface = near.find((o) => o.role === "surface");
  if (surface && mover.role !== "actor" && mover.height <= SMALL_PROP_HEIGHT_M) {
    const top = surface.position[1] + (surface.restHeight ?? surface.height);
    const others = near.filter((o) => o !== surface && Math.abs(o.position[1] - top) < 0.05);
    if (others.length === 0) return [base[0], top, base[2]];
    const side = mover.from[0] <= base[0] ? -1 : 1;
    const widest = Math.max(...others.map((o) => o.width));
    return [base[0] + side * (widest / 2 + mover.width / 2 + SPREAD_GAP_M), top, base[2]];
  }
  if (mover.role === "stackable") {
    const blocks = near.filter((o) => o.role === "stackable");
    if (blocks.length > 0) {
      const top = Math.max(...blocks.map((o) => o.position[1] + o.height));
      return [base[0], top, base[2]];
    }
  }
  const blocking = near.filter((o) => o.role === "actor" || o.role === "plain" || o.role === "stackable");
  if (blocking.length === 0) return base;
  const side = mover.from[0] <= base[0] ? -1 : 1;
  const widest = Math.max(...blocking.map((o) => o.width));
  return [base[0] + side * (widest / 2 + mover.width / 2 + SPREAD_GAP_M), base[1], base[2]];
}
