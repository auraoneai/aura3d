/**
 * DirectionalCascadeFitter — stable-fit CSM cascade matrices (PRD-02 Phase 4,
 * §6.4). Works on a plain C-08 `CameraLike` (view/projection matrices) — no
 * PerspectiveCamera instanceof. Split scheme reuses
 * `CascadedShadowMaps.computeSplits` (practical λ blend); each cascade's
 * ortho centre snaps to the shadow-texel grid so the edge mask is stable
 * under sub-texel camera motion (the `prd02-17` shimmer gate).
 */

import { CascadedShadowMaps } from "../CascadedShadowMaps";
import type { RenderItem } from "../contracts/renderItem";

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
  /** Texel-snapped light-space ortho centre (x, y) and unsnapped depth mid (z). */
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

type V3 = readonly [number, number, number];

function lightBasis(direction: V3): { right: V3; up: V3; forward: V3 } {
  const len = Math.hypot(direction[0], direction[1], direction[2]) || 1;
  const fwd: V3 = [direction[0] / len, direction[1] / len, direction[2] / len];
  const ref: V3 = Math.abs(fwd[1]) > 0.999 ? [1, 0, 0] : [0, 1, 0];
  const right = normalize(cross(fwd, ref));
  return { right, up: cross(right, fwd), forward: fwd };
}
function normalize(v: V3): V3 { const l = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / l, v[1] / l, v[2] / l]; }
function cross(a: V3, b: V3): V3 { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function lerp3(a: V3, b: V3, t: number): V3 { return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]; }

function itemWorldBounds(item: RenderItem): { min: V3; max: V3 } | null {
  const b = item.geometry?.bounds;
  if (!b) return null;
  const m = item.modelMatrix;
  const pts = [
    [b.min[0], b.min[1], b.min[2]], [b.max[0], b.min[1], b.min[2]],
    [b.min[0], b.max[1], b.min[2]], [b.max[0], b.max[1], b.min[2]],
    [b.min[0], b.min[1], b.max[2]], [b.max[0], b.min[1], b.max[2]],
    [b.min[0], b.max[1], b.max[2]], [b.max[0], b.max[1], b.max[2]]
  ] as const;
  const out = { min: [Infinity, Infinity, Infinity] as number[], max: [-Infinity, -Infinity, -Infinity] as number[] };
  for (const p of pts) {
    const w: V3 = m && m.length >= 16
      ? [m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!, m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!, m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!]
      : p;
    for (let i = 0; i < 3; i += 1) {
      out.min[i] = Math.min(out.min[i]!, w[i]!);
      out.max[i] = Math.max(out.max[i]!, w[i]!);
    }
  }
  return { min: out.min as unknown as V3, max: out.max as unknown as V3 };
}

/** Stable-fit cascades for one directional light from a C-08 CameraLike. */
export function fitDirectionalCascades(options: DirectionalCascadeFitOptions): DirectionalCascadeFit[] {
  const vp = options.camera.viewProjectionMatrix;
  if (!vp || vp.length < 16) throw new Error("CascadeFitter requires camera.viewProjectionMatrix (16 numbers)");
  const invVp = invertMat4(vp);
  const near = Math.max(1e-3, options.camera.near ?? 0.1);
  const far = Math.max(near + 1e-3, options.camera.far ?? 100);
  const splits = CascadedShadowMaps.computeSplits({
    cascadeCount: options.cascadeCount,
    near,
    far,
    lambda: options.splitLambda ?? 0.75
  });
  const nearCorners = [-1, 1].flatMap((x) => [-1, 1].map((y) => ndcToWorld(invVp, x, y, -1)));
  const farCorners = [-1, 1].flatMap((x) => [-1, 1].map((y) => ndcToWorld(invVp, x, y, 1)));
  const basis = lightBasis(options.lightDirection);
  const padding = options.padding ?? 0.25;
  const casterBounds = options.casters
    .map(itemWorldBounds)
    .filter((b): b is { min: V3; max: V3 } => b !== null);

  return splits.map((split, index) => {
    const t0 = (split.near - near) / (far - near);
    const t1 = (split.far - near) / (far - near);
    const frustumPts: V3[] = nearCorners.flatMap((nc, i) => [
      lerp3(nc, farCorners[i]!, t0),
      lerp3(nc, farCorners[i]!, t1)
    ]);
    // Frustum slice + caster bounds → light-space ortho, snapped to texels.
    const allPts = [...frustumPts, ...casterBounds.flatMap((b) => [b.min, b.max])];
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
    const centerZ = (min[2]! + max[2]!) / 2;
    let cx0 = 0, cy0 = 0, cz0 = 0;
    for (const p of allPts) { cx0 += p[0]; cy0 += p[1]; cz0 += p[2]; }
    const n = allPts.length;
    const centroid: V3 = [cx0 / n, cy0 / n, cz0 / n];
    let radius = 0;
    for (const p of allPts) {
      radius = Math.max(radius, Math.hypot(p[0] - centroid[0], p[1] - centroid[1], p[2] - centroid[2]));
    }
    const centerX = centroid[0] * basis.right[0] + centroid[1] * basis.right[1] + centroid[2] * basis.right[2];
    const centerY = centroid[0] * basis.up[0] + centroid[1] * basis.up[1] + centroid[2] * basis.up[2];
    radius = Math.max(radius, 1e-6);
    const extent = 2 * radius + padding * 2;
    const texelWorld = extent / options.mapSize;
    const cx = Math.round(centerX / texelWorld) * texelWorld;
    const cy = Math.round(centerY / texelWorld) * texelWorld;
    const depthPad = Math.max(padding, extent * 0.05);
    const view = new Float32Array([
      basis.right[0], basis.up[0], basis.forward[0], 0,
      basis.right[1], basis.up[1], basis.forward[1], 0,
      basis.right[2], basis.up[2], basis.forward[2], 0,
      -cx, -cy, -(min[2]! + max[2]!) / 2, 1
    ]);
    const half = extent / 2;
    const depth = (max[2]! - min[2]!) + depthPad * 2;
    // view already centres z on (min+max)/2 — the proj z column must NOT
    // translate again (double-centring pushed off-frustum casters past z=1).
    const proj = new Float32Array([
      1 / half, 0, 0, 0,
      0, 1 / half, 0, 0,
      0, 0, -2 / depth, 0,
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
    return { index, viewProjection: biased, drawViewProjection: viewProjection, splitFar: split.far, texelWorld, radius, center: [cx, cy, centerZ], casterCount: options.casters.length };
  });
}
