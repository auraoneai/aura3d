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

export type { Vec3 };

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

/**
 * Reversed-Z depth convention with automatic hardware fallback so overlapping
 * diorama rails, rugs, plinths, and layered eye/cheek features never z-fight.
 */
export const CAMERA_DEPTH_OPTIONS = {
  mode: "reversed",
  allowFallback: true
} as const;

export interface CameraPose {
  readonly position: Vec3;
  readonly target: Vec3;
  /** Vertical field of view in degrees. */
  readonly fov: number;
  readonly near: number;
  readonly far: number;
  readonly depth?: typeof CAMERA_DEPTH_OPTIONS;
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

const NEAR = 0.12;
const FAR = 120;

export const CAMERA_PRESETS: Readonly<Record<CameraPresetId, CameraPresetSpec>> = {
  wide: { position: [0, 1.7, 5.6], target: [0, 0.72, -0.3], fov: 42, near: NEAR, far: FAR, halfWidth: 3.05, minHalfWidth: 1.95, maxHalfWidth: 4.6, maxFov: 58 },
  medium: { position: [0, 1.5, 4.4], target: [0, 0.7, -0.2], fov: 44, near: NEAR, far: FAR, halfWidth: 2.7, minHalfWidth: 1.9, maxHalfWidth: 4.2, maxFov: 58 },
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

function smoothstep01(value: number): number {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

const DEG = Math.PI / 180;

/** Smooth portrait weight (`0` for `aspect >= 1.0`, `1` on narrow `9:19.5` phones). */
export function portraitFramingWeight(aspect: number): number {
  const a = Number.isFinite(aspect) && aspect > 0.05 ? aspect : 16 / 9;
  if (a >= 1) return 0;
  return smoothstep01((1 - a) / 0.54);
}

/** The half-width a preset must keep visible at this aspect (narrow screens keep only the core of the stage). */
export function requiredHalfWidth(spec: CameraPresetSpec, aspect: number): number {
  const t = smoothstep01((aspect - 0.5) / (1.3 - 0.5));
  return lerp(spec.minHalfWidth, spec.halfWidth, t);
}

/**
 * Fits a preset to the canvas aspect: smoothly settles vertical eye/target on
 * portrait viewports, widens the field of view (up to `maxFov`) and dollies back
 * along the view line until `requiredHalfWidth` is visible; on ultra-wide screens
 * narrows the field of view instead, and stamps reversed-Z depth. Pure.
 */
export function frameCamera(preset: CameraPresetId, aspect: number): CameraPose {
  const spec = CAMERA_PRESETS[preset];
  const a = Number.isFinite(aspect) && aspect > 0.05 ? aspect : 16 / 9;
  const pWeight = portraitFramingWeight(a);
  const adjustedTarget: Vec3 = [
    spec.target[0],
    spec.target[1] + 0.04 * pWeight,
    spec.target[2]
  ];
  const baseEye: Vec3 = [
    spec.position[0],
    spec.position[1] - 0.03 * pWeight,
    spec.position[2]
  ];
  const view = sub(adjustedTarget, baseEye);
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
  const position: Vec3 = [
    adjustedTarget[0] - dir[0] * d,
    adjustedTarget[1] - dir[1] * d,
    adjustedTarget[2] - dir[2] * d
  ];
  return {
    position,
    target: adjustedTarget,
    fov,
    near: spec.near,
    far: spec.far,
    depth: CAMERA_DEPTH_OPTIONS
  };
}

export function lerpCameraPose(a: CameraPose, b: CameraPose, t: number): CameraPose {
  return {
    position: lerpVec3(a.position, b.position, t),
    target: lerpVec3(a.target, b.target, t),
    fov: lerp(a.fov, b.fov, t),
    near: lerp(a.near, b.near, t),
    far: lerp(a.far, b.far, t),
    depth: b.depth ?? a.depth ?? CAMERA_DEPTH_OPTIONS
  };
}

export function sameCameraPose(a: CameraPose, b: CameraPose, epsilon = 1e-5): boolean {
  return (
    Math.abs(a.fov - b.fov) < epsilon &&
    length(sub(a.position, b.position)) < epsilon &&
    length(sub(a.target, b.target)) < epsilon
  );
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
    const o = origin[i]!;
    const d = direction[i]!;
    const lo = box.min[i]!;
    const hi = box.max[i]!;
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
  /** Optional stage asset key (`"bed"`, `"cradle"`, `"lift"`, `"door"`, `"blanket"`, etc.). */
  readonly asset?: string;
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

const WIDE_SLEEP_SURFACES: ReadonlySet<string> = new Set(["bed", "sleepyCloud", "cushion", "bench", "stompStone"]);
const COMPACT_SEAT_SURFACES: ReadonlySet<string> = new Set(["cradle", "chair"]);
const RIDEABLE_CONTAINERS: ReadonlySet<string> = new Set(["lift", "gogoCarriage"]);

function canRestOnSupport(
  mover: { readonly id: string; readonly role: LayoutRole; readonly height: number; readonly asset?: string },
  support: { readonly id: string; readonly role: LayoutRole; readonly height: number; readonly asset?: string }
): boolean {
  if (mover.id === support.id) return false;
  if (support.asset === "blanket") return false;
  if (mover.asset === "blanket") {
    return support.role === "surface" || support.asset === "gogoCarriage";
  }
  // Never stack large furniture/buildings on another surface.
  if (mover.role === "occluder" || mover.role === "container") return false;
  if (mover.role === "surface" && mover.asset !== "cushion" && mover.asset !== "plate" && mover.asset !== "cake") {
    return false;
  }
  if (support.asset !== undefined && RIDEABLE_CONTAINERS.has(support.asset)) {
    const maxRiderH = support.asset === "lift" ? 0.92 : 0.72;
    return mover.height <= maxRiderH;
  }
  if (support.role !== "surface") return false;
  if (mover.role !== "actor") {
    if (mover.height <= SMALL_PROP_HEIGHT_M) return true;
    // Companion animals/plushes placed as props on beds/clouds/cushions:
    if (support.asset !== undefined && WIDE_SLEEP_SURFACES.has(support.asset) && mover.height <= 0.96) return true;
    return false;
  }
  // Cast & animal actors (`role === "actor"`):
  if (support.asset !== undefined && WIDE_SLEEP_SURFACES.has(support.asset)) {
    return mover.height <= 0.96;
  }
  if (support.asset !== undefined && COMPACT_SEAT_SURFACES.has(support.asset)) {
    return mover.height <= 0.64;
  }
  return false;
}

/**
 * Resolves where each node starts. Nodes alone on a spot stand on it. Shared spots:
 * small props (and fitting sleepers/riders) rest on a surface/cab, blocks stack, hidden nodes
 * wait behind an occluder or inside a container, and the rest stand side by side, centred on the spot.
 * Deterministic: ties keep the input order.
 */
export function resolveLayout(entries: readonly LayoutEntry[]): ReadonlyMap<string, Vec3> {
  const out = new Map<string, Vec3>();
  const grouped = new Map<SpotId, LayoutEntry[]>();
  for (const entry of entries) {
    const group = grouped.get(entry.spot);
    if (group) group.push(entry);
    else grouped.set(entry.spot, [entry]);
  }
  for (const [spot, group] of grouped) {
    const base = SPOTS[spot];
    const only = group.length === 1 ? group[0] : undefined;
    if (only) {
      out.set(only.id, only.asset === "bubble" && base[1] < 0.25 ? [base[0], Math.max(base[1], only.height * 0.65 + 0.12), base[2]] : base);
      continue;
    }
    const surface = group.find((e) => e.role === "surface" && e.asset !== "blanket");
    const occluder = group.find((e) => e.role === "occluder" || e.role === "container");

    // In-place swap props (e.g. visible `bud-1` + hidden `flower-1` sharing a garden spot) keep the exact spot centre
    // so blooming/swapping never teleports sideways.
    if (!surface && !occluder && group.every((e) => e.role !== "actor" && e.role !== "stackable")) {
      const visibleEntries = group.filter((e) => !e.hidden);
      const hiddenEntries = group.filter((e) => e.hidden);
      if (visibleEntries.length === 1 && hiddenEntries.length >= 1) {
        for (const entry of group) {
          out.set(entry.id, entry.asset === "bubble" && base[1] < 0.25 ? [base[0], Math.max(base[1], entry.height * 0.65 + 0.12), base[2]] : base);
        }
        continue;
      }
    }

    const anchors = new Set<string>();
    if (surface) {
      out.set(surface.id, base);
      anchors.add(surface.id);
    }
    if (occluder && occluder !== surface) {
      out.set(occluder.id, base);
      anchors.add(occluder.id);
    }
    const supportForRest = surface ?? (occluder && occluder.asset !== undefined && RIDEABLE_CONTAINERS.has(occluder.asset) ? occluder : undefined);
    const restY = base[1] + (supportForRest ? supportForRest.restHeight ?? supportForRest.height : 0);

    // Hidden things wait behind an occluder or inside a container.
    if (occluder && occluder !== surface) {
      const hiddenGroup = group.filter((e) => !anchors.has(e.id) && e.hidden);
      hiddenGroup.forEach((entry, idx) => {
        if (occluder.role === "container") {
          out.set(entry.id, [base[0], base[1] + (occluder.restHeight ?? occluder.height * 0.2), base[2]]);
        } else if (hiddenGroup.length === 1) {
          out.set(entry.id, [base[0], base[1], base[2] - (occluder.depth / 2 + entry.depth / 2 + 0.06)]);
        } else {
          const lateral = (idx - (hiddenGroup.length - 1) / 2) * 0.18;
          out.set(entry.id, [
            base[0] + lateral,
            base[1],
            base[2] - (occluder.depth / 2 + entry.depth / 2 + 0.08 + idx * 0.06)
          ]);
        }
        anchors.add(entry.id);
      });
    }

    // Blocks stack into a tower (on the surface when there is one).
    let stackY = restY;
    for (const entry of group) {
      if (anchors.has(entry.id) || entry.role !== "stackable") continue;
      out.set(entry.id, [base[0], stackY, base[2]]);
      stackY += entry.height;
      anchors.add(entry.id);
    }

    // Coverlet blankets drape directly over their bed / cradle / cloud / carriage instead of pushing sleepers sideways.
    if (supportForRest) {
      for (const entry of group) {
        if (anchors.has(entry.id) || entry.asset !== "blanket") continue;
        out.set(entry.id, [base[0], restY + 0.03, base[2] + 0.04]);
        anchors.add(entry.id);
      }
      const onTop = group.filter((e) => !anchors.has(e.id) && canRestOnSupport(e, supportForRest));
      spreadRow(onTop, [base[0], restY, base[2]], out, anchors);
    }

    // Everything else stands side by side on the ground, centred on the spot.
    const rest = group.filter((e) => !anchors.has(e.id));
    if (anchors.size > 0 && rest.length > 0) {
      const anchorDepth = Math.max(...group.filter((e) => anchors.has(e.id)).map((e) => e.depth));
      const doorAnchor = occluder?.asset === "door";
      const frontClear = doorAnchor ? Math.max(anchorDepth / 2 + 0.25, 0.56 * (occluder?.height ?? 1.6) + 0.18) : anchorDepth / 2 + 0.25;
      spreadRow(rest, [base[0], base[1], base[2] + frontClear], out, anchors);
    } else {
      spreadRow(rest, base, out, anchors);
    }
    for (const entry of group) {
      if (entry.asset === "bubble") {
        const cur = out.get(entry.id);
        if (cur && cur[1] < 0.25) out.set(entry.id, [cur[0], Math.max(cur[1], entry.height * 0.65 + 0.12), cur[2]]);
      }
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
  readonly asset?: string;
  readonly width: number;
  readonly depth?: number;
  readonly height: number;
  readonly restHeight?: number;
  readonly open?: boolean;
  readonly openProgress?: number;
  readonly yaw?: number;
  readonly liftM?: number;
}

export interface Mover {
  readonly id: string;
  readonly role: LayoutRole;
  readonly asset?: string;
  readonly width: number;
  readonly depth?: number;
  readonly height: number;
  readonly floats?: boolean;
  /** Where it is now (it moves in from this side). */
  readonly from: Vec3;
}

function clampVal(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/**
 * Where a node should stop when it moves to a spot that others already occupy:
 * on a surface/cab (small props & fitting sleepers/riders), on top of a block (blocks),
 * through/outside a doorway threshold, or cleanly beside whoever stands there.
 */
export function placeAtSpot(spot: SpotId, mover: Mover, occupants: readonly Occupant[]): Vec3 {
  const base = SPOTS[spot];
  const moverFloats = mover.floats === true || base[1] > 0.85;
  const near = occupants.filter((o) => {
    if (o.id === mover.id) return false;
    const reach = Math.max(0.42, (o.width + mover.width) * 0.55);
    return Math.hypot(o.position[0] - base[0], o.position[2] - base[2]) < reach;
  });

  // 1. Support surface or rideable container (`bed`, `table`, `plate`, `cradle`, `sleepyCloud`, `lift`, `gogoCarriage`).
  const support = near.find((o) => o.asset !== "blanket" && canRestOnSupport(mover, o));
  if (support) {
    const top = support.position[1] + (support.restHeight ?? support.height) + (support.liftM ?? 0);
    if (mover.asset === "blanket") {
      return [support.position[0], top + 0.03, support.position[2] + 0.04];
    }
    const others = near.filter((o) => o !== support && o.asset !== "blanket" && Math.abs(o.position[1] - top) < 0.14);
    if (others.length === 0) return [support.position[0], top, support.position[2]];
    const side = mover.from[0] <= support.position[0] ? -1 : 1;
    const minX = Math.min(...others.map((o) => o.position[0] - o.width / 2));
    const maxX = Math.max(...others.map((o) => o.position[0] + o.width / 2));
    const gap = support.asset === "bed" || support.asset === "sleepyCloud" ? 0.06 : SPREAD_GAP_M;
    const rawX = side < 0 ? minX - mover.width / 2 - gap : maxX + mover.width / 2 + gap;
    const maxHalfSpan = support.asset === "bed" || support.asset === "sleepyCloud"
      ? Math.max(0.28, support.width * 0.44 - mover.width * 0.35)
      : 2.6;
    const clampedX = support.asset === "bed" || support.asset === "sleepyCloud"
      ? clampVal(rawX, support.position[0] - maxHalfSpan, support.position[0] + maxHalfSpan)
      : rawX;
    return [clampedX, top, support.position[2]];
  }

  // 2. Stackable blocks build upward.
  if (mover.role === "stackable") {
    const blocks = near.filter((o) => o.role === "stackable");
    if (blocks.length > 0) {
      const top = Math.max(...blocks.map((o) => o.position[1] + o.height));
      return [base[0], top, base[2]];
    }
  }

  // 3. Doorway / barn threshold awareness: stop clear of swing arc or step cleanly through an open doorway.
  const doorOcc = near.find((o) => o.asset === "door" || o.asset === "barn");
  if (doorOcc && !moverFloats) {
    const dx = doorOcc.position[0];
    const dz = doorOcc.position[2];
    const doorD = doorOcc.depth ?? 0.2;
    const moverD = mover.depth ?? mover.width * 0.85;
    const swingReach = doorOcc.asset === "door" ? 0.56 * doorOcc.height : 0.44 * doorOcc.height;
    const isOpen = doorOcc.open === true || (doorOcc.openProgress ?? 0) > 0.1;
    const behindOthers = occupants.filter(
      (o) =>
        o.id !== mover.id &&
        o.id !== doorOcc.id &&
        Math.abs(o.position[0] - dx) < 1.2 &&
        o.position[2] < dz - 0.08 &&
        o.position[2] > dz - 2.2
    );
    const countBehind = behindOthers.length;
    const backOffset = countBehind === 0 ? 0 : (countBehind % 2 === 1 ? -1 : 1) * 0.2 * Math.ceil(countBehind / 2);
    const extraBackZ = countBehind * 0.12;
    if (isOpen) {
      if (mover.from[2] > dz + 0.05) {
        // Stepping from front (`+Z`) through open doorway to behind threshold (`-Z`).
        return [dx + backOffset, base[1], dz - (doorD / 2 + moverD / 2 + 0.28 + extraBackZ)];
      }
      // Stepping out from behind (`-Z`) to front of open doorway, clear of open leaf.
      return [dx, base[1], dz + swingReach + moverD / 2 + 0.08];
    }
    if (mover.from[2] < dz - 0.02) {
      return [dx + backOffset, base[1], dz - (doorD / 2 + moverD / 2 + 0.26 + extraBackZ)];
    }
    return [dx, base[1], dz + Math.max(doorD / 2 + moverD / 2 + 0.22, swingReach + moverD / 2 + 0.06)];
  }

  // 4. Solid occupant avoidance across actors, props, containers, occluders & non-ridden furniture.
  const blocking = near.filter((o) => {
    if (o.asset === "blanket") return false;
    const occFloats = o.position[1] > 0.85;
    if (moverFloats !== occFloats) return false;
    return (
      o.role === "actor" ||
      o.role === "plain" ||
      o.role === "stackable" ||
      o.role === "occluder" ||
      o.role === "container" ||
      o.role === "surface"
    );
  });
  const liftY = mover.asset === "bubble" && base[1] < 0.25 ? Math.max(base[1], mover.height * 0.65 + 0.12) : base[1];
  if (blocking.length === 0) return [base[0], liftY, base[2]];
  const side = mover.from[0] <= base[0] ? -1 : 1;
  const minX = Math.min(...blocking.map((o) => o.position[0] - o.width / 2));
  const maxX = Math.max(...blocking.map((o) => o.position[0] + o.width / 2));
  const nextX = side < 0 ? minX - mover.width / 2 - SPREAD_GAP_M : maxX + mover.width / 2 + SPREAD_GAP_M;
  return [clampVal(nextX, -3.2, 3.2), liftY, base[2]];
}

// ---------------------------------------------------------------- deterministic path & doorway steering

export interface PathCollider {
  readonly id: string;
  readonly asset?: string;
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly halfW: number;
  readonly halfD: number;
  readonly height: number;
  readonly door?: boolean;
  readonly open?: boolean;
  readonly openProgress?: number;
  readonly yaw?: number;
}

export interface SafePathPlan {
  readonly waypoints: readonly Vec3[];
  readonly waitSec: number;
  readonly totalDistance: number;
}

function dist3(a: Vec3, b: Vec3): number {
  return Math.hypot(b[0] - a[0], b[1] - a[1], b[2] - a[2]);
}

function polylineLength(pts: readonly Vec3[]): number {
  let sum = 0;
  for (let i = 0; i < pts.length - 1; i += 1) {
    const a = pts[i];
    const b = pts[i + 1];
    if (a && b) sum += dist3(a, b);
  }
  return sum;
}

function segmentHitsBoxXZ(
  ax: number,
  az: number,
  bx: number,
  bz: number,
  minX: number,
  maxX: number,
  minZ: number,
  maxZ: number
): boolean {
  const dx = bx - ax;
  const dz = bz - az;
  let tMin = 0.04;
  let tMax = 0.96;
  if (Math.abs(dx) < 1e-6) {
    if (ax <= minX || ax >= maxX) return false;
  } else {
    const inv = 1 / dx;
    let t1 = (minX - ax) * inv;
    let t2 = (maxX - ax) * inv;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin >= tMax) return false;
  }
  if (Math.abs(dz) < 1e-6) {
    if (az <= minZ || az >= maxZ) return false;
  } else {
    const inv = 1 / dz;
    let t1 = (minZ - az) * inv;
    let t2 = (maxZ - az) * inv;
    if (t1 > t2) {
      const tmp = t1;
      t1 = t2;
      t2 = tmp;
    }
    tMin = Math.max(tMin, t1);
    tMax = Math.min(tMax, t2);
    if (tMin >= tMax) return false;
  }
  return tMax - tMin > 0.015;
}

function pointInsideBoxXZ(px: number, pz: number, minX: number, maxX: number, minZ: number, maxZ: number): boolean {
  return px > minX + 0.01 && px < maxX - 0.01 && pz > minZ + 0.01 && pz < maxZ - 0.01;
}

/**
 * Computes a collision-free, doorway-aware waypoint path from `from` to `to`:
 * 1. Waits (`waitSec`) for opening doors/gates to clear their swing arc before crossing;
 * 2. Routes doorway crossings straight through the open arch centre (never slicing doorjambs or bypassing freestanding frames);
 * 3. Routes lift entries/exits strictly through the `+Z` front shaft gate (never sideways through solid shaft walls);
 * 4. Steers smoothly around solid obstacles, furniture, world fencing/props, and stationary cast members.
 */
export function planSafePath(
  from: Vec3,
  to: Vec3,
  mover: {
    readonly id: string;
    readonly asset?: string;
    readonly width: number;
    readonly depth?: number;
    readonly height: number;
    readonly floats?: boolean;
  },
  colliders: readonly PathCollider[]
): SafePathPlan {
  const directLen = dist3(from, to);
  if (directLen < 0.04 || mover.floats === true || (from[1] > 0.85 && to[1] > 0.85)) {
    return { waypoints: [from, to], waitSec: 0, totalDistance: directLen };
  }

  const moverR = clampVal(Math.min(mover.width, mover.depth ?? mover.width) * 0.4, 0.12, 0.42);
  let waitSec = 0;
  const points: Vec3[] = [from];
  const handledIds = new Set<string>([mover.id]);

  // 1. Lift front-gate (`+Z`) entry & exit routing (`G07`).
  const liftCollider = colliders.find(
    (c) =>
      c.asset === "lift" &&
      (Math.hypot(to[0] - c.x, to[2] - c.z) < 0.3 || Math.hypot(from[0] - c.x, from[2] - c.z) < 0.3)
  );
  if (liftCollider) {
    handledIds.add(liftCollider.id);
    const enteringLift = Math.hypot(to[0] - liftCollider.x, to[2] - liftCollider.z) < 0.3 && Math.hypot(from[0] - liftCollider.x, from[2] - liftCollider.z) >= 0.3;
    const exitingLift = Math.hypot(from[0] - liftCollider.x, from[2] - liftCollider.z) < 0.3 && Math.hypot(to[0] - liftCollider.x, to[2] - liftCollider.z) >= 0.3;
    const frontZ = liftCollider.z + liftCollider.halfD + moverR + 0.16;
    if (liftCollider.open === true && (liftCollider.openProgress ?? 1) < 0.55) {
      waitSec = Math.max(waitSec, clampVal((0.55 - (liftCollider.openProgress ?? 0)) * 0.65, 0, 0.38));
    }
    if (enteringLift) {
      points.push([liftCollider.x, from[1], frontZ]);
    } else if (exitingLift) {
      points.push([liftCollider.x, to[1], frontZ]);
    }
  }

  // 2. Open doorway / barn threshold aperture routing (`E18`, `E02`, `G04`, `G09`).
  const doorCollider = colliders.find((c) => {
    if (c.asset !== "door" && c.asset !== "barn") return false;
    const isOpen = c.open === true || (c.openProgress ?? 0) > 0.08;
    if (!isOpen) return false;
    const crossesPlane = (from[2] - c.z) * (to[2] - c.z) < -0.005;
    const nearLateral = Math.min(Math.abs(from[0] - c.x), Math.abs(to[0] - c.x)) < 1.75;
    return crossesPlane && nearLateral;
  });

  if (doorCollider) {
    handledIds.add(doorCollider.id);
    const prog = doorCollider.openProgress ?? (doorCollider.open ? 1 : 0);
    if (prog < 0.58) {
      waitSec = Math.max(waitSec, clampVal((0.58 - prog) * 0.95, 0, 0.54));
    }
    // Bias slightly +X on single left-hinged `door` so the walker clears the open `-X` door leaf AND right jamb.
    const apX = doorCollider.asset === "door" ? doorCollider.x + 0.05 : doorCollider.x;
    const backZ = doorCollider.z - (doorCollider.halfD + moverR + 0.14);
    const leafFrontReach = (doorCollider.asset === "door" ? 0.54 : 0.42) * doorCollider.height;
    const frontZ = doorCollider.z + Math.max(doorCollider.halfD + moverR + 0.18, leafFrontReach + moverR * 0.45);
    const groundY = Math.min(from[1], to[1]);
    if (from[2] < doorCollider.z && to[2] > doorCollider.z) {
      if (Math.hypot(from[0] - apX, from[2] - backZ) > 0.12 && from[2] < backZ + 0.08) {
        points.push([apX, groundY, backZ]);
      }
      if (to[2] > frontZ - 0.1 || Math.abs(to[0] - apX) > 0.22) {
        points.push([apX, groundY, Math.min(frontZ, Math.max(doorCollider.z + 0.45, to[2]))]);
      }
    } else if (from[2] > doorCollider.z && to[2] < doorCollider.z) {
      if (from[2] > frontZ - 0.1 || Math.abs(from[0] - apX) > 0.22) {
        points.push([apX, groundY, Math.min(frontZ, Math.max(doorCollider.z + 0.45, from[2]))]);
      }
      if (Math.hypot(to[0] - apX, to[2] - backZ) > 0.12 && to[2] < backZ + 0.08) {
        points.push([apX, groundY, backZ]);
      }
    }
  }

  points.push(to);

  // 3. Steer around solid props, closed doors, stationary characters & world dressing obstacles (up to 2 detour passes).
  // Railway vehicles (`gogo`, `gogoCarriage`) stay locked to their straight track line without lateral swerving.
  if (mover.asset !== "gogo" && mover.asset !== "gogoCarriage") {
    for (let pass = 0; pass < 2; pass += 1) {
      let inserted = false;
      for (let segIdx = 0; segIdx < points.length - 1; segIdx += 1) {
        const a = points[segIdx]!;
        const b = points[segIdx + 1]!;
        const segMinY = Math.min(a[1], b[1]) + 0.04;
        const segMaxY = Math.max(a[1], b[1]) + mover.height - 0.04;

        let hitCollider: PathCollider | null = null;
        let hitBounds: { minX: number; maxX: number; minZ: number; maxZ: number } | null = null;

        for (const c of colliders) {
          if (handledIds.has(c.id)) continue;
          if (c.asset === "blanket" || c.asset === "plate" || c.asset === "stompStone" || c.asset === "cushion") continue;
          // Ignore target support/destination collider when landing directly on/at it.
          if (Math.hypot(b[0] - c.x, b[2] - c.z) < Math.max(c.halfW, c.halfD) + 0.06 && b[1] >= c.y + 0.03) continue;
          // Vertical overlap test.
          if (c.y + c.height < segMinY || c.y > segMaxY) continue;

          const pad = moverR + 0.05;
          let minX = c.x - c.halfW - pad;
          let maxX = c.x + c.halfW + pad;
          let minZ = c.z - c.halfD - pad;
          let maxZ = c.z + c.halfD + pad;
          if (c.asset === "door" && (c.open === true || (c.openProgress ?? 0) > 0.1)) {
            minX = Math.min(minX, c.x - 0.36 * c.height - pad);
            maxZ = Math.max(maxZ, c.z + 0.54 * c.height + pad);
          }
          // If start or end is already inside this padded box, let the mover step out cleanly without trapping it.
          if (pointInsideBoxXZ(a[0], a[2], minX, maxX, minZ, maxZ)) continue;
          if (pointInsideBoxXZ(b[0], b[2], minX, maxX, minZ, maxZ)) continue;

          if (segmentHitsBoxXZ(a[0], a[2], b[0], b[2], minX, maxX, minZ, maxZ)) {
            hitCollider = c;
            hitBounds = { minX, maxX, minZ, maxZ };
            break;
          }
        }

        if (hitCollider && hitBounds) {
          handledIds.add(hitCollider.id);
          const midY = (a[1] + b[1]) * 0.5;
          const horizMove = Math.abs(b[0] - a[0]) >= Math.abs(b[2] - a[2]);
          let detour: Vec3;
          if (horizMove) {
            const frontZ = hitBounds.maxZ + 0.08;
            const backZ = hitBounds.minZ - 0.08;
            const costFront = Math.hypot(hitCollider.x - a[0], frontZ - a[2]) + Math.hypot(b[0] - hitCollider.x, b[2] - frontZ);
            const costBack = Math.hypot(hitCollider.x - a[0], backZ - a[2]) + Math.hypot(b[0] - hitCollider.x, b[2] - backZ);
            const chosenZ = frontZ <= 1.72 && (costFront <= costBack + 0.25 || backZ < -1.95) ? frontZ : backZ;
            detour = [hitCollider.x, midY, clampVal(chosenZ, -2.05, 1.72)];
          } else {
            const leftX = hitBounds.minX - 0.08;
            const rightX = hitBounds.maxX + 0.08;
            const costLeft = Math.hypot(leftX - a[0], hitCollider.z - a[2]) + Math.hypot(b[0] - leftX, b[2] - hitCollider.z);
            const costRight = Math.hypot(rightX - a[0], hitCollider.z - a[2]) + Math.hypot(b[0] - rightX, b[2] - hitCollider.z);
            const chosenX = costLeft <= costRight ? leftX : rightX;
            detour = [clampVal(chosenX, -3.35, 3.35), midY, hitCollider.z];
          }
          points.splice(segIdx + 1, 0, detour);
          inserted = true;
          break;
        }
      }
      if (!inserted) break;
    }
  }

  return {
    waypoints: points,
    waitSec,
    totalDistance: polylineLength(points)
  };
}
