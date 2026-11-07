/**
 * `camera.frame` geometry: a pure, dependency-free mapping from world bounds +
 * lens + aspect + fill to a camera pose, so the maths is unit-testable without a
 * scene, a DOM or a GPU.
 *
 * Definition of fill: the larger of the subject's projected height (as a fraction
 * of the frame height) and projected width (as a fraction of the frame width).
 * With `fill: 0.6` a landscape frame shows the subject 60% of the frame tall; a
 * portrait frame shows it 60% of the frame wide when width is the tighter axis.
 * The projection is exact for perspective (all eight bounds corners are
 * projected, not a bounding sphere), and the aim is re-centred so the projected
 * box sits in the middle of the frame.
 */
import type { AuraVec3 } from "../nodes/types.js";

/** Named camera angles; azimuth 0 looks from +Z toward -Z, positive azimuth swings toward +X. */
export type AuraFrameAngle = "three-quarter" | "front" | "top" | "side";

export interface AuraFrameBounds {
  readonly min: AuraVec3;
  readonly max: AuraVec3;
}

export interface AuraFramePoseOptions {
  /** Fraction (0.05..1) of the limiting frame axis the subject occupies. Default 0.6. */
  readonly fill?: number;
  /** A named angle, or pass `azimuth`/`elevation` (radians) which win over it. Default `"three-quarter"`. */
  readonly angle?: AuraFrameAngle;
  /** Radians around +Y from +Z. */
  readonly azimuth?: number;
  /** Radians above the horizon. */
  readonly elevation?: number;
  /** Extra margin as a fraction of the subject size (0.1 = 10% breathing room). Shrinks the effective fill by 1 / (1 + padding). Default 0. */
  readonly padding?: number;
  /** Vertical field of view in degrees. Default 40. */
  readonly fov?: number;
  /** Frame width / height the fit is solved for. Default 16 / 9. */
  readonly aspect?: number;
  /** Never place the eye closer than this. Default 0.05. */
  readonly minDistance?: number;
}

export interface AuraFramePose {
  readonly position: AuraVec3;
  readonly target: AuraVec3;
  readonly distance: number;
  readonly fov: number;
  readonly azimuth: number;
  readonly elevation: number;
  /** Effective fill the solver targeted (`fill / (1 + padding)`). */
  readonly fill: number;
  readonly near: number;
  readonly far: number;
}

export const FRAME_ANGLES: Readonly<Record<AuraFrameAngle, { readonly azimuth: number; readonly elevation: number }>> = {
  "three-quarter": { azimuth: 0.62, elevation: 0.35 },
  front: { azimuth: 0, elevation: 0.12 },
  side: { azimuth: Math.PI / 2, elevation: 0.12 },
  top: { azimuth: 0, elevation: Math.PI / 2 - 0.02 }
};

interface Basis {
  readonly eye: AuraVec3;
  readonly right: AuraVec3;
  readonly up: AuraVec3;
}

function basisFor(azimuth: number, elevation: number): Basis {
  const ce = Math.cos(elevation);
  const eye: AuraVec3 = [Math.sin(azimuth) * ce, Math.sin(elevation), Math.cos(azimuth) * ce];
  // right = normalize(cross(forward, worldUp)), forward = -eye  =>  (eye.z, 0, -eye.x)
  let rx = eye[2];
  let rz = -eye[0];
  let len = Math.hypot(rx, rz);
  if (len < 1e-6) {
    rx = 1;
    rz = 0;
    len = 1;
  }
  const right: AuraVec3 = [rx / len, 0, rz / len];
  // up = cross(right, forward)
  const f: AuraVec3 = [-eye[0], -eye[1], -eye[2]];
  const up: AuraVec3 = [
    right[1] * f[2] - right[2] * f[1],
    right[2] * f[0] - right[0] * f[2],
    right[0] * f[1] - right[1] * f[0]
  ];
  const ul = Math.hypot(up[0], up[1], up[2]) || 1;
  return { eye, right, up: [up[0] / ul, up[1] / ul, up[2] / ul] };
}

const dot = (a: AuraVec3, b: AuraVec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

function corners(bounds: AuraFrameBounds, about: AuraVec3): AuraVec3[] {
  const out: AuraVec3[] = [];
  for (const x of [bounds.min[0], bounds.max[0]]) {
    for (const y of [bounds.min[1], bounds.max[1]]) {
      for (const z of [bounds.min[2], bounds.max[2]]) out.push([x - about[0], y - about[1], z - about[2]]);
    }
  }
  return out;
}

interface Projection {
  readonly fill: number;
  readonly centerX: number;
  readonly centerY: number;
}

/** Project bounds corners (relative to the aim point) from `distance` along the basis eye vector. */
function project(rel: readonly AuraVec3[], basis: Basis, distance: number, tanHalf: number, aspect: number): Projection {
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const p of rel) {
    const depth = Math.max(1e-6, distance - dot(p, basis.eye));
    const nx = dot(p, basis.right) / (depth * tanHalf * aspect);
    const ny = dot(p, basis.up) / (depth * tanHalf);
    if (nx < minX) minX = nx;
    if (nx > maxX) maxX = nx;
    if (ny < minY) minY = ny;
    if (ny > maxY) maxY = ny;
  }
  return { fill: Math.max((maxX - minX) / 2, (maxY - minY) / 2), centerX: (minX + maxX) / 2, centerY: (minY + maxY) / 2 };
}

/**
 * The fill (larger of projected height / width fraction of the frame) the given
 * pose produces for `bounds`. Tests and callers measure with the same definition
 * the solver uses.
 */
export function measureFrameFill(
  bounds: AuraFrameBounds,
  pose: Pick<AuraFramePose, "position" | "target" | "fov">,
  aspect = 16 / 9
): number {
  const eye: AuraVec3 = [pose.position[0] - pose.target[0], pose.position[1] - pose.target[1], pose.position[2] - pose.target[2]];
  const distance = Math.hypot(eye[0], eye[1], eye[2]);
  const elevation = Math.asin(Math.max(-1, Math.min(1, eye[1] / distance)));
  const azimuth = Math.atan2(eye[0], eye[2]);
  const basis = basisFor(azimuth, elevation);
  const tanHalf = Math.tan((pose.fov * Math.PI) / 360);
  return project(corners(bounds, pose.target), basis, distance, tanHalf, aspect).fill;
}

/**
 * Camera pose that frames `bounds` so the subject fills `fill` of the frame.
 *
 * Pure: same inputs, same pose. Throws `RangeError` on non-finite bounds.
 */
export function frameCameraPose(bounds: AuraFrameBounds, options: AuraFramePoseOptions = {}): AuraFramePose {
  for (const v of [...bounds.min, ...bounds.max]) {
    if (!Number.isFinite(v)) throw new RangeError("camera.frame: bounds must be finite.");
  }
  const named = FRAME_ANGLES[options.angle ?? "three-quarter"];
  const azimuth = options.azimuth ?? named.azimuth;
  const elevation = Math.max(-Math.PI / 2 + 0.01, Math.min(Math.PI / 2 - 0.01, options.elevation ?? named.elevation));
  const fov = Math.max(5, Math.min(120, options.fov ?? 40));
  const aspect = options.aspect !== undefined && Number.isFinite(options.aspect) && options.aspect > 0 ? options.aspect : 16 / 9;
  const padding = Math.max(0, options.padding ?? 0);
  const fill = Math.max(0.05, Math.min(1, options.fill ?? 0.6));
  const goal = fill / (1 + padding);
  const tanHalf = Math.tan((fov * Math.PI) / 360);
  const basis = basisFor(azimuth, elevation);

  // Never collapse a degenerate (point or flat) box to zero size.
  const eps = 1e-3;
  const lo: [number, number, number] = [bounds.min[0], bounds.min[1], bounds.min[2]];
  const hi: [number, number, number] = [bounds.max[0], bounds.max[1], bounds.max[2]];
  for (let i = 0; i < 3; i += 1) {
    if (hi[i]! - lo[i]! < eps) {
      const mid = (hi[i]! + lo[i]!) / 2;
      lo[i] = mid - eps / 2;
      hi[i] = mid + eps / 2;
    }
  }
  const box: AuraFrameBounds = { min: lo, max: hi };
  let target: AuraVec3 = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2, (lo[2] + hi[2]) / 2];
  const radius = Math.hypot(hi[0] - lo[0], hi[1] - lo[1], hi[2] - lo[2]) / 2;
  const minDistance = options.minDistance ?? 0.05;

  const solveDistance = (aim: AuraVec3): number => {
    const rel = corners(box, aim);
    let maxZ = -Infinity;
    for (const p of rel) maxZ = Math.max(maxZ, dot(p, basis.eye));
    // fill(distance) is strictly decreasing for distance > maxZ (the nearest corner's depth > 0); bisect.
    let a = maxZ + radius * 1e-9 + 1e-12;
    let b = Math.max(a, 0) + radius * 1e4 + 1;
    for (let i = 0; i < 100; i += 1) {
      const mid = (a + b) / 2;
      if (project(rel, basis, mid, tanHalf, aspect).fill > goal) a = mid;
      else b = mid;
    }
    return (a + b) / 2;
  };
  // Re-centre the projected box with damped shifts of the aim point, then solve the distance for the final aim,
  // so the fill is exact for the pose that is returned even when the centring has not fully converged.
  for (let pass = 0; pass < 8; pass += 1) {
    const dist = solveDistance(target);
    const proj = project(corners(box, target), basis, dist, tanHalf, aspect);
    const dx = proj.centerX * dist * tanHalf * aspect;
    const dy = proj.centerY * dist * tanHalf;
    if (Math.abs(dx) + Math.abs(dy) < radius * 1e-5) break;
    const k = 0.6;
    target = [
      target[0] + (basis.right[0] * dx + basis.up[0] * dy) * k,
      target[1] + (basis.right[1] * dx + basis.up[1] * dy) * k,
      target[2] + (basis.right[2] * dx + basis.up[2] * dy) * k
    ];
  }
  let distance = solveDistance(target);
  distance = Math.max(distance, minDistance);
  const position: AuraVec3 = [
    target[0] + basis.eye[0] * distance,
    target[1] + basis.eye[1] * distance,
    target[2] + basis.eye[2] * distance
  ];
  const near = Math.max(0.05, distance * 0.01);
  const far = Math.max(100, (distance + radius * 2) * 10);
  return { position, target, distance, fov, azimuth, elevation, fill: goal, near, far };
}
