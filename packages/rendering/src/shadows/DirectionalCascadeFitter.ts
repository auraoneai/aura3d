/**
 * DirectionalCascadeFitter — stable-fit CSM cascade matrices (PRD-02 Phase 4,
 * §6.4). Works on a plain C-08 `CameraLike` (view/projection matrices) — no
 * PerspectiveCamera instanceof. Split scheme reuses
 * `CascadedShadowMaps.computeSplits` (practical λ blend); each cascade's
 * ortho centre snaps to the shadow-texel grid so the edge mask is stable
 * under sub-texel camera motion (the `prd02-17` shimmer gate).
 */

import { instancedWorldBounds } from "../renderer/InstanceBounds";
import { CascadedShadowMaps } from "../CascadedShadowMaps";
import type { RenderItem } from "../contracts/renderItem";
import type { Geometry } from "../Geometry";
import { skinnedItemLocalBounds } from "../renderer/SkinnedBounds";

export interface CascadeFitterCamera {
  readonly viewProjectionMatrix: Float32Array | readonly number[];
  readonly near?: number;
  readonly far?: number;
}

export interface DirectionalCascadeFit {
  readonly index: number;
  /** Column-major light-space view-projection (world → [0,1]³ shadow UV), for sampling. */
  readonly viewProjection: Float32Array;
  /** Unbiased world → clip-space VP used to rasterize the depth target. */
  readonly drawViewProjection: Float32Array;
  /** View-space far distance of this cascade's split (for `a3d_selectCascade`). */
  readonly splitFar: number;
  /** World-space size of one shadow-map texel (normal-bias + stability unit). */
  readonly texelWorld: number;
  /** Bounding-sphere radius of the cascade slice (+ casters), before padding. */
  readonly radius: number;
  /** Texel-snapped light-space ortho centre (x, y) and depth mid (z). */
  readonly center: readonly [number, number, number];
  readonly casterCount: number;
}

export interface DirectionalCascadeFitOptions {
  readonly camera: CascadeFitterCamera;
  readonly lightDirection: readonly [number, number, number];
  readonly casters: readonly RenderItem[];
  readonly mapSize: number;
  readonly cascadeCount: number;
  readonly splitLambda?: number;
  readonly padding?: number;
  /**
   * Shadow distance cap (view-space, PRD-02 §6.4 `maxDistance`): cascades
   * cover [near, min(far, maxDistance)]. The camera's own far still anchors
   * the frustum-corner interpolation.
   */
  readonly maxDistance?: number;
}

function invertMat4(m: readonly number[] | Float32Array): Float32Array {
  const a = Array.from(m);
  const inv = new Float32Array(16);
  const a00 = a[0]!, a01 = a[1]!, a02 = a[2]!, a03 = a[3]!;
  const a10 = a[4]!, a11 = a[5]!, a12 = a[6]!, a13 = a[7]!;
  const a20 = a[8]!, a21 = a[9]!, a22 = a[10]!, a23 = a[11]!;
  const a30 = a[12]!, a31 = a[13]!, a32 = a[14]!, a33 = a[15]!;
  const b00 = a00 * a11 - a01 * a10, b01 = a00 * a12 - a02 * a10, b02 = a00 * a13 - a03 * a10;
  const b03 = a01 * a12 - a02 * a11, b04 = a01 * a13 - a03 * a11, b05 = a02 * a13 - a03 * a12;
  const b06 = a20 * a31 - a21 * a30, b07 = a20 * a32 - a22 * a30, b08 = a20 * a33 - a23 * a30;
  const b09 = a21 * a32 - a22 * a31, b10 = a21 * a33 - a23 * a31, b11 = a22 * a33 - a23 * a32;
  const det = b00 * b11 - b01 * b10 + b02 * b09 + b03 * b08 - b04 * b07 + b05 * b06;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-12) throw new Error("CascadeFitter: camera VP not invertible");
  const id = 1 / det;
  inv[0] = (a11 * b11 - a12 * b10 + a13 * b09) * id;
  inv[1] = (a02 * b10 - a01 * b11 - a03 * b09) * id;
  inv[2] = (a31 * b05 - a32 * b04 + a33 * b03) * id;
  inv[3] = (a22 * b04 - a21 * b05 - a23 * b03) * id;
  inv[4] = (a12 * b08 - a10 * b11 - a13 * b07) * id;
  inv[5] = (a00 * b11 - a02 * b08 + a03 * b07) * id;
  inv[6] = (a32 * b02 - a30 * b05 - a33 * b01) * id;
  inv[7] = (a20 * b05 - a22 * b02 + a23 * b01) * id;
  inv[8] = (a10 * b10 - a11 * b08 + a13 * b06) * id;
  inv[9] = (a01 * b08 - a00 * b10 - a03 * b06) * id;
  inv[10] = (a30 * b04 - a31 * b02 + a33 * b00) * id;
  inv[11] = (a21 * b02 - a20 * b04 - a23 * b00) * id;
  inv[12] = (a11 * b07 - a10 * b09 - a12 * b06) * id;
  inv[13] = (a00 * b09 - a01 * b07 + a02 * b06) * id;
  inv[14] = (a31 * b01 - a30 * b03 - a32 * b00) * id;
  inv[15] = (a20 * b03 - a21 * b01 + a22 * b00) * id;
  return inv;
}

function ndcToWorld(inv: Float32Array, x: number, y: number, z: number): [number, number, number] {
  const w = inv[3]! * x + inv[7]! * y + inv[11]! * z + inv[15]!;
  const iw = 1 / Math.max(Math.abs(w), 1e-9) * Math.sign(w || 1);
  return [
    (inv[0]! * x + inv[4]! * y + inv[8]! * z + inv[12]!) * iw,
    (inv[1]! * x + inv[5]! * y + inv[9]! * z + inv[13]!) * iw,
    (inv[2]! * x + inv[6]! * y + inv[10]! * z + inv[14]!) * iw
  ];
}

type Vec3Tuple = readonly [number, number, number];

/**
 * #1141: near/far of a perspective camera known only by its view-projection
 * and eye (structural CameraLikes carry no near/far): distances from the eye
 * to the unprojected NDC centres of the near and far planes.
 */
export function clipRangeFromViewProjection(
  viewProjection: Float32Array | readonly number[],
  eye: readonly [number, number, number]
): { near: number; far: number } | null {
  let inv: Float32Array;
  try { inv = invertMat4(viewProjection); } catch { return null; }
  const n = ndcToWorld(inv, 0, 0, -1);
  const f = ndcToWorld(inv, 0, 0, 1);
  const near = Math.hypot(n[0] - eye[0], n[1] - eye[1], n[2] - eye[2]);
  const far = Math.hypot(f[0] - eye[0], f[1] - eye[1], f[2] - eye[2]);
  return Number.isFinite(near) && Number.isFinite(far) && far > near && near > 0 ? { near, far } : null;
}

function lightBasis(direction: Vec3Tuple): { right: Vec3Tuple; up: Vec3Tuple; forward: Vec3Tuple } {
  const len = Math.hypot(direction[0], direction[1], direction[2]) || 1;
  const fwd: Vec3Tuple = [direction[0] / len, direction[1] / len, direction[2] / len];
  const ref: Vec3Tuple = Math.abs(fwd[1]) > 0.999 ? [1, 0, 0] : [0, 1, 0];
  const right = normalize(cross(fwd, ref));
  return { right, up: cross(right, fwd), forward: fwd };
}
function normalize(v: Vec3Tuple): Vec3Tuple { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function cross(a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function lerp3(a: Vec3Tuple, b: Vec3Tuple, t: number): Vec3Tuple { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

const IDENTITY_MODEL: readonly number[] = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/**
 * World AABB of a caster for the cascade fit. 02-S4: instanced casters cover
 * every instance (model × instance), and skinned casters use the posed
 * envelope — the base-geometry box alone let the caster-rect clamp crop most
 * instances out of the ortho (prd02-16b IoU 0.34, 6 of 16 instance shadows).
 */
export function itemWorldBounds(item: RenderItem): { min: Vec3Tuple; max: Vec3Tuple } | null {
  const b = item.skinning && item.geometry
    ? skinnedItemLocalBounds(item.geometry as Geometry, item.skinning)
    : item.geometry?.bounds;
  if (!b) return null;
  const m = item.modelMatrix && item.modelMatrix.length >= 16 ? item.modelMatrix : null;
  const pts = [
    [b.min[0], b.min[1], b.min[2]], [b.max[0], b.min[1], b.min[2]],
    [b.min[0], b.max[1], b.min[2]], [b.max[0], b.max[1], b.min[2]],
    [b.min[0], b.min[1], b.max[2]], [b.max[0], b.min[1], b.max[2]],
    [b.min[0], b.max[1], b.max[2]], [b.max[0], b.max[1], b.max[2]]
  ] as const;
  const out = { min: [Infinity, Infinity, Infinity] as number[], max: [-Infinity, -Infinity, -Infinity] as number[] };
  const apply = (t: ArrayLike<number>, p: readonly number[]): Vec3Tuple => [
    t[0]! * p[0]! + t[4]! * p[1]! + t[8]! * p[2]! + t[12]!,
    t[1]! * p[0]! + t[5]! * p[1]! + t[9]! * p[2]! + t[13]!,
    t[2]! * p[0]! + t[6]! * p[1]! + t[10]! * p[2]! + t[14]!
  ];
  const instances = item.instanceTransforms && item.instanceTransforms.length >= 16 ? item.instanceTransforms : null;
  if (instances) {
    // O(instances) per frame: allocation-free box accumulation (see InstanceBounds.ts); non-finite matrices skip the caster.
    try {
      const world = instancedWorldBounds(b, m ?? IDENTITY_MODEL, instances);
      if (!world.min.every(Number.isFinite) || !world.max.every(Number.isFinite)) return null;
      return { min: [world.min[0], world.min[1], world.min[2]], max: [world.max[0], world.max[1], world.max[2]] };
    } catch {
      return null;
    }
  }
  for (const p of pts) {
    const w: Vec3Tuple = m ? apply(m, p) : [p[0]!, p[1]!, p[2]!];
    for (let i = 0; i < 3; i += 1) {
      out.min[i] = Math.min(out.min[i]!, w[i]!);
      out.max[i] = Math.max(out.max[i]!, w[i]!);
    }
  }
  if (!out.min.every(Number.isFinite) || !out.max.every(Number.isFinite)) return null;
  return { min: out.min as unknown as Vec3Tuple, max: out.max as unknown as Vec3Tuple };
}

type LightBasis = { right: Vec3Tuple; up: Vec3Tuple; forward: Vec3Tuple };

function toLight(p: Vec3Tuple, basis: LightBasis): Vec3Tuple {
  return [
    p[0] * basis.right[0] + p[1] * basis.right[1] + p[2] * basis.right[2],
    p[0] * basis.up[0] + p[1] * basis.up[1] + p[2] * basis.up[2],
    p[0] * basis.forward[0] + p[1] * basis.forward[1] + p[2] * basis.forward[2]
  ];
}

/**
 * #1141 caster-rectangle fit: the light-space rectangle of all casters
 * (padded), when it lies inside the slice footprint, plus the depth interval
 * covering the casters and every in-slice receiver they can shadow.
 */
export function casterRectClamp(
  slicePts: readonly Vec3Tuple[],
  casterBounds: readonly { min: Vec3Tuple; max: Vec3Tuple }[],
  basis: LightBasis,
  padding: number
): { extent: number; centerX: number; centerY: number; zMin: number; zMax: number } | null {
  if (casterBounds.length === 0) return null;
  let cMin: [number, number, number] = [Infinity, Infinity, Infinity];
  let cMax: [number, number, number] = [-Infinity, -Infinity, -Infinity];
  for (const b of casterBounds) {
    for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) {
      const l = toLight([x, y, z], basis);
      cMin = [Math.min(cMin[0], l[0]), Math.min(cMin[1], l[1]), Math.min(cMin[2], l[2])];
      cMax = [Math.max(cMax[0], l[0]), Math.max(cMax[1], l[1]), Math.max(cMax[2], l[2])];
    }
  }
  if (!cMin.every(Number.isFinite) || !cMax.every(Number.isFinite)) return null;
  const lightPts = slicePts.map((p) => toLight(p, basis));
  const fMinX = Math.min(...lightPts.map((p) => p[0])), fMaxX = Math.max(...lightPts.map((p) => p[0]));
  const fMinY = Math.min(...lightPts.map((p) => p[1])), fMaxY = Math.max(...lightPts.map((p) => p[1]));
  if (cMin[0] < fMinX || cMax[0] > fMaxX || cMin[1] < fMinY || cMax[1] > fMaxY) return null;
  const rect = { minX: cMin[0] - padding, maxX: cMax[0] + padding, minY: cMin[1] - padding, maxY: cMax[1] + padding };
  const extent = Math.max(rect.maxX - rect.minX, rect.maxY - rect.minY);
  if (!Number.isFinite(extent) || extent <= 0) return null;
  const receivers = sliceDepthWithinRect(lightPts, rect);
  return {
    extent,
    centerX: (rect.minX + rect.maxX) / 2,
    centerY: (rect.minY + rect.maxY) / 2,
    zMin: Math.min(cMin[2], receivers?.zMin ?? Infinity),
    zMax: Math.max(cMax[2], receivers?.zMax ?? -Infinity)
  };
}

type LightRect = { readonly minX: number; readonly maxX: number; readonly minY: number; readonly maxY: number };

/** Slice corner order: index 2i = near, 2i+1 = far, for NDC corners i = (-1,-1), (-1,1), (1,-1), (1,1). */
const SLICE_EDGES: readonly (readonly [number, number])[] = [
  [0, 2], [2, 6], [6, 4], [4, 0], [1, 3], [3, 7], [7, 5], [5, 1], [0, 1], [2, 3], [4, 5], [6, 7]
];
const SLICE_FACES: readonly (readonly [number, number, number])[] = [
  [0, 2, 6], [1, 3, 7], [0, 2, 3], [4, 6, 7], [0, 4, 5], [2, 6, 7]
];

/**
 * #1141: light-space depth interval [zMin, zMax] of the receivers a caster
 * rectangle can shadow — the convex frustum slice `pts` (light space)
 * intersected with the infinite prism `rect` × (-∞, ∞) along the light.
 * Extremes of a convex intersection lie on its vertices: slice corners inside
 * the prism, slice edges crossing a prism wall, and the four prism edges
 * clipped by the slice faces. Null when the slice misses the prism.
 */
export function sliceDepthWithinRect(pts: readonly Vec3Tuple[], rect: LightRect): { zMin: number; zMax: number } | null {
  const inside = (x: number, y: number): boolean =>
    x >= rect.minX - 1e-9 && x <= rect.maxX + 1e-9 && y >= rect.minY - 1e-9 && y <= rect.maxY + 1e-9;
  let zMin = Infinity;
  let zMax = -Infinity;
  const add = (z: number): void => { zMin = Math.min(zMin, z); zMax = Math.max(zMax, z); };
  for (const p of pts) if (inside(p[0], p[1])) add(p[2]);
  for (const [a, b] of SLICE_EDGES) {
    const p = pts[a]!, q = pts[b]!;
    for (const [axis, value] of [[0, rect.minX], [0, rect.maxX], [1, rect.minY], [1, rect.maxY]] as const) {
      const d = q[axis] - p[axis];
      if (Math.abs(d) < 1e-12) continue;
      const t = (value - p[axis]) / d;
      if (t < 0 || t > 1) continue;
      const hit = lerp3(p, q, t);
      if (inside(hit[0], hit[1])) add(hit[2]);
    }
  }
  const centroid = pts.reduce<Vec3Tuple>((s, p) => [s[0] + p[0] / pts.length, s[1] + p[1] / pts.length, s[2] + p[2] / pts.length], [0, 0, 0]);
  const planes = SLICE_FACES.map(([a, b, c]) => {
    const pa = pts[a]!, pb = pts[b]!, pc = pts[c]!;
    let n = cross([pb[0] - pa[0], pb[1] - pa[1], pb[2] - pa[2]], [pc[0] - pa[0], pc[1] - pa[1], pc[2] - pa[2]]);
    let d = -(n[0] * pa[0] + n[1] * pa[1] + n[2] * pa[2]);
    // Orient outward: the slice centroid must be on the negative side.
    if (n[0] * centroid[0] + n[1] * centroid[1] + n[2] * centroid[2] + d > 0) { n = [-n[0], -n[1], -n[2]]; d = -d; }
    return { n, d };
  });
  for (const [x, y] of [[rect.minX, rect.minY], [rect.minX, rect.maxY], [rect.maxX, rect.minY], [rect.maxX, rect.maxY]] as const) {
    let lo = -Infinity;
    let hi = Infinity;
    for (const { n, d } of planes) {
      const rest = n[0] * x + n[1] * y + d; // n_z·z + rest ≤ 0
      if (Math.abs(n[2]) < 1e-12) { if (rest > 1e-9) { lo = Infinity; break; } continue; }
      const bound = -rest / n[2];
      if (n[2] > 0) hi = Math.min(hi, bound); else lo = Math.max(lo, bound);
    }
    if (lo <= hi) { add(lo); add(hi); }
  }
  return Number.isFinite(zMin) && Number.isFinite(zMax) ? { zMin, zMax } : null;
}


/** Casters bigger than this many shadow distances (and than `OVERSIZE_CASTER_FLOOR` metres) are environment shells, not casters. */
export const OVERSIZE_CASTER_FACTOR = 4;
export const OVERSIZE_CASTER_FLOOR = 100;

/**
 * A single, non-instanced caster whose world box is far larger than the shadow distance is a sky dome, skybox or planet-sized
 * plane. Cascades only cover `[near, shadowDistance]`, so such a mesh cannot be shadowed meaningfully; worse, a dome that
 * encloses the camera puts its near hemisphere between the light and every receiver and darkens the whole frame (Shadowstep
 * Gauntlet's 4000 m sky). Instanced casters are exempt: their box spans every instance, not one large surface.
 */
export function isOversizeShadowCaster(item: RenderItem, shadowDistance: number): boolean {
  if (item.instanceTransforms && item.instanceTransforms.length >= 16) return false;
  const b = itemWorldBounds(item);
  if (!b) return false;
  const largest = Math.max(b.max[0] - b.min[0], b.max[1] - b.min[1], b.max[2] - b.min[2]);
  return largest > Math.max(OVERSIZE_CASTER_FLOOR, OVERSIZE_CASTER_FACTOR * shadowDistance);
}


const dist3 = (a: Vec3Tuple, b: Vec3Tuple): number => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

/**
 * The slice corners are lerped between the VP's own near and far corners, so the fractions must use the VP's real clip range.
 * A caller whose `near`/`far` disagree with the VP (a frame camera without a clip range, a test camera) made every slice a
 * sliver of the frustum. For a perspective VP the true range follows from the near/far plane widths (similar triangles);
 * the caller's values are kept whenever they agree with it, and for orthographic projections.
 */
function resolveClipRange(nearCorners: readonly Vec3Tuple[], farCorners: readonly Vec3Tuple[], givenNear: number | undefined, givenFar: number | undefined): { near: number; far: number } {
  const near = Math.max(1e-3, givenNear ?? 0.1);
  const far = Math.max(near + 1e-3, givenFar ?? 100);
  const nc = (i: number): Vec3Tuple => nearCorners[i]!;
  const fc = (i: number): Vec3Tuple => farCorners[i]!;
  const wN = dist3(nc(0), nc(3));
  const wF = dist3(fc(0), fc(3));
  const mid = (a: Vec3Tuple, b: Vec3Tuple): Vec3Tuple => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
  const planeGap = dist3(mid(nc(0), nc(3)), mid(fc(0), fc(3)));
  const ratio = wF / Math.max(wN, 1e-12);
  if (!(ratio > 1.0001) || !Number.isFinite(ratio) || !(planeGap > 0)) return { near, far };
  const trueNear = planeGap / (ratio - 1);
  const trueFar = trueNear + planeGap;
  if (!Number.isFinite(trueNear) || !Number.isFinite(trueFar) || trueNear <= 0) return { near, far };
  const agrees = Math.abs(trueFar - far) <= 0.05 * trueFar && Math.abs(trueNear - near) <= 0.05 * Math.max(trueNear, near);
  return agrees ? { near, far } : { near: Math.max(1e-3, trueNear), far: trueFar };
}

/** Stable-fit cascades for one directional light from a C-08 CameraLike. */
export function fitDirectionalCascades(options: DirectionalCascadeFitOptions): DirectionalCascadeFit[] {
  const vp = options.camera.viewProjectionMatrix;
  if (!vp || vp.length < 16) throw new Error("CascadeFitter requires camera.viewProjectionMatrix (16 numbers)");
  const invVp = invertMat4(vp);
  const nearCorners = [-1, 1].flatMap((x) => [-1, 1].map((y) => ndcToWorld(invVp, x, y, -1)));
  const farCorners = [-1, 1].flatMap((x) => [-1, 1].map((y) => ndcToWorld(invVp, x, y, 1)));
  const clip = resolveClipRange(nearCorners, farCorners, options.camera.near, options.camera.far);
  const near = clip.near;
  const far = clip.far;
  const shadowFar = options.maxDistance !== undefined && Number.isFinite(options.maxDistance) && options.maxDistance > near
    ? Math.min(far, options.maxDistance)
    : far;
  const splits = CascadedShadowMaps.computeSplits({
    cascadeCount: options.cascadeCount,
    near,
    far: shadowFar,
    lambda: options.splitLambda ?? 0.75
  });
  const basis = lightBasis(options.lightDirection);
  const padding = options.padding ?? 0.25;
  const casterBounds = options.casters
    .map(itemWorldBounds)
    .filter((b): b is { min: Vec3Tuple; max: Vec3Tuple } => b !== null);

  return splits.map((split, index) => {
    const t0 = (split.near - near) / (far - near);
    const t1 = (split.far - near) / (far - near);
    const frustumPts: Vec3Tuple[] = nearCorners.flatMap((nc, i) => [
      lerp3(nc, farCorners[i]!, t0),
      lerp3(nc, farCorners[i]!, t1)
    ]);
    // Frustum slice → light-space ortho, snapped to texels. In an orthographic light projection only casters whose
    // light-space footprint overlaps the slice can shadow it, so casters never widen x/y (a scene-spanning instanced set
    // or a distant mountain used to inflate every cascade to kilometres: 1 m texels and washed-out shadows); they only
    // extend the depth range toward the light, below.
    const allPts = frustumPts;
    let min = [Infinity, Infinity, Infinity];
    let max = [-Infinity, -Infinity, -Infinity];
    for (const p of allPts) {
      const lx = p[0] * basis.right[0] + p[1] * basis.right[1] + p[2] * basis.right[2];
      const ly = p[0] * basis.up[0] + p[1] * basis.up[1] + p[2] * basis.up[2];
      const lz = p[0] * basis.forward[0] + p[1] * basis.forward[1] + p[2] * basis.forward[2];
      min = [Math.min(min[0]!, lx), Math.min(min[1]!, ly), Math.min(min[2]!, lz)];
      max = [Math.max(max[0]!, lx), Math.max(max[1]!, ly), Math.max(max[2]!, lz)];
    }
    // Bounding-sphere radius about the world-space centroid: rigid transforms
    // (e.g. camera yaw about the camera pivot) rotate the centroid with the
    // point set and preserve 3D distances, so max|p-centroid| is exactly
    // yaw-invariant — a 10° yaw keeps each cascade's radius stable
    // (PRD-02 §6.4 / prd02-17 shimmer) where a light-space AABB extent is not.
    let cx0 = 0, cy0 = 0, cz0 = 0;
    for (const p of allPts) { cx0 += p[0]; cy0 += p[1]; cz0 += p[2]; }
    const n = allPts.length;
    const centroid: Vec3Tuple = [cx0 / n, cy0 / n, cz0 / n];
    let radius = 0;
    for (const p of allPts) {
      radius = Math.max(radius, Math.hypot(p[0] - centroid[0], p[1] - centroid[1], p[2] - centroid[2]));
    }
    let centerX = centroid[0] * basis.right[0] + centroid[1] * basis.right[1] + centroid[2] * basis.right[2];
    let centerY = centroid[0] * basis.up[0] + centroid[1] * basis.up[1] + centroid[2] * basis.up[2];
    radius = Math.max(radius, 1e-6);
    let extent = 2 * radius + padding * 2;
    let zLo = min[2]!;
    let zHi = max[2]!;
    // Casters whose light-space footprint overlaps the slice extend the depth range toward the light (capped, so a huge
    // box cannot stretch the range and cost depth precision); casters behind the slice cannot shadow it.
    {
      const reach = Math.max(8 * radius, 200);
      const rx0 = centerX - radius - padding, rx1 = centerX + radius + padding;
      const ry0 = centerY - radius - padding, ry1 = centerY + radius + padding;
      for (const b of casterBounds) {
        let cx0 = Infinity, cx1 = -Infinity, cy0 = Infinity, cy1 = -Infinity, cz0 = Infinity;
        for (const x of [b.min[0], b.max[0]]) for (const y of [b.min[1], b.max[1]]) for (const z of [b.min[2], b.max[2]]) {
          const lx = x * basis.right[0] + y * basis.right[1] + z * basis.right[2];
          const ly = x * basis.up[0] + y * basis.up[1] + z * basis.up[2];
          const lz = x * basis.forward[0] + y * basis.forward[1] + z * basis.forward[2];
          cx0 = Math.min(cx0, lx); cx1 = Math.max(cx1, lx); cy0 = Math.min(cy0, ly); cy1 = Math.max(cy1, ly); cz0 = Math.min(cz0, lz);
        }
        if (cx1 < rx0 || cx0 > rx1 || cy1 < ry0 || cy0 > ry1) continue;
        zLo = Math.min(zLo, Math.max(cz0, min[2]! - reach));
      }
    }
    // #1141: a slice reaching far past a bounded scene (camera far 100 m over a
    // 14 m set) inflated the ortho to ~130 m — 13× coarser texels and a depth
    // range that turned the constant compare bias into detached, washed-out
    // shadows. Shadows exist only where casters project, so when every caster
    // projects inside the slice's light-space footprint the ortho shrinks to
    // the caster rectangle (world-fixed, so still shimmer-stable) and depth to
    // casters ∪ the receivers in that prism. Unbounded/partial cases keep the
    // bounding-sphere fit above.
    const clamp = casterBounds.length === options.casters.length
      ? casterRectClamp(frustumPts, casterBounds, basis, padding)
      : null;
    if (clamp && Number.isFinite(clamp.extent) && clamp.extent > 0 && clamp.extent < extent) {
      extent = clamp.extent;
      centerX = clamp.centerX;
      centerY = clamp.centerY;
      zLo = clamp.zMin;
      zHi = clamp.zMax;
    }
    const texelWorld = extent / options.mapSize;
    const cx = Math.round(centerX / texelWorld) * texelWorld;
    const cy = Math.round(centerY / texelWorld) * texelWorld;
    const depthPad = Math.max(padding, extent * 0.05);
    const view = new Float32Array([
      basis.right[0], basis.up[0], basis.forward[0], 0,
      basis.right[1], basis.up[1], basis.forward[1], 0,
      basis.right[2], basis.up[2], basis.forward[2], 0,
      -cx, -cy, -(zLo + zHi) / 2, 1
    ]);
    const half = extent / 2;
    const depth = (zHi - zLo) + depthPad * 2;
    // view already centres z on (min+max)/2 — the proj z column must NOT
    // translate again (double-centring pushed off-frustum casters past z=1).
    // #1141: view z runs along `forward` (light travel), so depth must grow
    // with +z. The old -2/depth flipped it: the less-equal depth pass kept the
    // surface FARTHEST from the light and receivers behind casters tested lit.
    const proj = new Float32Array([
      1 / half, 0, 0, 0,
      0, 1 / half, 0, 0,
      0, 0, 2 / depth, 0,
      0, 0, 0, 1
    ]);
    // proj*(view*p): row-major compose proj × view.
    const viewProjection = new Float32Array(16);
    for (let c = 0; c < 4; c += 1) {
      for (let r = 0; r < 4; r += 1) {
        viewProjection[c * 4 + r] =
          proj[r]! * view[c * 4]! + proj[4 + r]! * view[c * 4 + 1]! +
          proj[8 + r]! * view[c * 4 + 2]! + proj[12 + r]! * view[c * 4 + 3]!;
      }
    }
    // Scale+bias into [0,1]³ for the shadow sampler.
    const bias = new Float32Array([0.5, 0, 0, 0, 0, 0.5, 0, 0, 0, 0, 0.5, 0, 0.5, 0.5, 0.5, 1]);
    const biased = new Float32Array(16);
    for (let c = 0; c < 4; c += 1) {
      for (let r = 0; r < 4; r += 1) {
        biased[c * 4 + r] =
          bias[r]! * viewProjection[c * 4]! + bias[4 + r]! * viewProjection[c * 4 + 1]! +
          bias[8 + r]! * viewProjection[c * 4 + 2]! + bias[12 + r]! * viewProjection[c * 4 + 3]!;
      }
    }
    return { index, viewProjection: biased, drawViewProjection: viewProjection, splitFar: split.far, texelWorld, radius, center: [cx, cy, (zLo + zHi) / 2], casterCount: options.casters.length };
  });
}
