/**
 * Shared `@aura3d/engine` 5.5.1 Procedural 3D Sculpting Kernel (`WP-00`).
 *
 * Pure TypeScript curve, surface, and multi-material sub-assembly builders
 * targeting `geometry.define`, `geometry.multiMaterial`, and `instances.custom`
 * with precomputed local bounding boxes and zero `three` dependencies.
 */
import {
  geometry,
  type AuraCustomGeometrySpec,
  type AuraMaterialSpec,
  type AuraNodeBuilder,
  type AuraSceneNode
} from "@aura3d/engine";

export type AuraGroupNode = Extract<AuraSceneNode, { readonly kind: "group" }> & { readonly visible?: boolean };

export type V2 = readonly [number, number];
export type V3 = readonly [number, number, number];
export type V4 = readonly [number, number, number, number];

export interface RawMesh {
  readonly positions: number[];
  readonly normals: number[];
  readonly uvs: number[];
  readonly indices: number[];
  /** Optional per-vertex linear-space RGBA (`vertexCount * 4`). */
  readonly colors?: number[];
  /** True when `normals` carry exact analytic SDF gradients and should not be overwritten by facet recomputation. */
  readonly analyticNormals?: boolean;
}

export interface MultiMatSlot {
  readonly mesh: RawMesh;
  readonly materialIndex: number;
}

export interface TransformOpts {
  readonly pos?: V3;
  readonly rot?: V3;
  readonly scale?: number | V3;
}

// ---------------------------------------------------------------------------
// Vector & Deterministic Noise Helpers
// ---------------------------------------------------------------------------

export function add3(a: V3, b: V3): [number, number, number] {
  return [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
}

export function sub3(a: V3, b: V3): [number, number, number] {
  return [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
}

export function scale3(v: V3, s: number): [number, number, number] {
  return [v[0] * s, v[1] * s, v[2] * s];
}

export function dot3(a: V3, b: V3): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

export function cross3(a: V3, b: V3): [number, number, number] {
  return [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0]
  ];
}

export function norm3(v: V3): [number, number, number] {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
}

export function lerp3(a: V3, b: V3, t: number): [number, number, number] {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t
  ];
}

/** Deterministic integer hash in `[0, 1)`. */
export function hash01(seed: number): number {
  let h = Math.imul((seed | 0) ^ 0x9e3779b9, 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function noise3(x: number, y: number, z: number, seed = 1): number {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const fx = x - ix, fy = y - iy, fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uy = fy * fy * (3 - 2 * fy);
  const uz = fz * fz * (3 - 2 * fz);
  const c = (dx: number, dy: number, dz: number): number =>
    hash01(
      Math.imul(ix + dx, 73856093) ^
      Math.imul(iy + dy, 19349663) ^
      Math.imul(iz + dz, 83492791) ^
      Math.imul(seed | 0, 2654435761)
    );
  const x00 = c(0, 0, 0) + (c(1, 0, 0) - c(0, 0, 0)) * ux;
  const x10 = c(0, 1, 0) + (c(1, 1, 0) - c(0, 1, 0)) * ux;
  const x01 = c(0, 0, 1) + (c(1, 0, 1) - c(0, 0, 1)) * ux;
  const x11 = c(0, 1, 1) + (c(1, 1, 1) - c(0, 1, 1)) * ux;
  const y0 = x00 + (x10 - x00) * uy;
  const y1 = x01 + (x11 - x01) * uy;
  return y0 + (y1 - y0) * uz;
}

/** Deterministic 3-octave value FBM in `[0, 1]`. */
export function fbm3(x: number, y: number, z: number, seed = 1): number {
  return (
    noise3(x, y, z, seed) * 0.55 +
    noise3(x * 2.07, y * 2.07, z * 2.07, seed + 17) * 0.3 +
    noise3(x * 4.13, y * 4.13, z * 4.13, seed + 43) * 0.15
  );
}

/** Smooth 3D Catmull-Rom spline passing through `points`. */
export function catmullRomSpline3(
  points: readonly V3[],
  segmentsPerSpan = 8,
  closed = false
): V3[] {
  if (points.length === 0) return [];
  if (points.length === 1) return [[...points[0]!]];
  const segs = Math.max(1, Math.floor(segmentsPerSpan));
  const n = points.length;
  const getPt = (idx: number): V3 => {
    if (closed) return points[((idx % n) + n) % n]!;
    if (idx < 0) {
      const p0 = points[0]!, p1 = points[1]!;
      return [2 * p0[0] - p1[0], 2 * p0[1] - p1[1], 2 * p0[2] - p1[2]];
    }
    if (idx >= n) {
      const pn = points[n - 1]!, pm = points[n - 2]!;
      return [2 * pn[0] - pm[0], 2 * pn[1] - pm[1], 2 * pn[2] - pm[2]];
    }
    return points[idx]!;
  };

  const spanCount = closed ? n : n - 1;
  const out: V3[] = [];
  for (let s = 0; s < spanCount; s += 1) {
    const p0 = getPt(s - 1);
    const p1 = getPt(s);
    const p2 = getPt(s + 1);
    const p3 = getPt(s + 2);
    const limit = !closed && s === spanCount - 1 ? segs : segs - 1;
    for (let i = 0; i <= limit; i += 1) {
      const t = i / segs;
      const t2 = t * t;
      const t3 = t2 * t;
      const evalAxis = (k: 0 | 1 | 2): number =>
        0.5 * (
          2 * p1[k] +
          (-p0[k] + p2[k]) * t +
          (2 * p0[k] - 5 * p1[k] + 4 * p2[k] - p3[k]) * t2 +
          (-p0[k] + 3 * p1[k] - 3 * p2[k] + p3[k]) * t3
        );
      out.push([evalAxis(0), evalAxis(1), evalAxis(2)]);
    }
  }
  return out;
}

/** Smooth 2D cubic Bezier curve for lathe profiles, fenders, and eaves. */
export function bezierCurve2(
  p0: V2,
  p1: V2,
  p2: V2,
  p3: V2,
  segments = 12
): V2[] {
  const segs = Math.max(1, Math.floor(segments));
  const out: V2[] = [];
  for (let i = 0; i <= segs; i += 1) {
    const t = i / segs;
    const u = 1 - t;
    const b0 = u * u * u;
    const b1 = 3 * u * u * t;
    const b2 = 3 * u * t * t;
    const b3 = t * t * t;
    out.push([
      b0 * p0[0] + b1 * p1[0] + b2 * p2[0] + b3 * p3[0],
      b0 * p0[1] + b1 * p1[1] + b2 * p2[1] + b3 * p3[1]
    ]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rigid Transform & Shading Helpers
// ---------------------------------------------------------------------------

/**
 * Rigid + non-uniform transform (`pos`, Euler XYZ `rot` in radians, `scale`)
 * with inverse-transpose normal transform and automatic negative-determinant winding flip.
 */
export function transformMesh(src: RawMesh, opts: TransformOpts = {}): RawMesh {
  const px = opts.pos?.[0] ?? 0;
  const py = opts.pos?.[1] ?? 0;
  const pz = opts.pos?.[2] ?? 0;
  const rx = opts.rot?.[0] ?? 0;
  const ry = opts.rot?.[1] ?? 0;
  const rz = opts.rot?.[2] ?? 0;
  const sx = typeof opts.scale === "number" ? opts.scale : (opts.scale?.[0] ?? 1);
  const sy = typeof opts.scale === "number" ? opts.scale : (opts.scale?.[1] ?? 1);
  const sz = typeof opts.scale === "number" ? opts.scale : (opts.scale?.[2] ?? 1);

  const cx = Math.cos(rx), snx = Math.sin(rx);
  const cy = Math.cos(ry), sny = Math.sin(ry);
  const cz = Math.cos(rz), snz = Math.sin(rz);

  const rotVec = (vx: number, vy: number, vz: number): [number, number, number] => {
    const y1 = vy * cx - vz * snx;
    const z1 = vy * snx + vz * cx;
    const x2 = vx * cy + z1 * sny;
    const z2 = -vx * sny + z1 * cy;
    const x3 = x2 * cz - y1 * snz;
    const y3 = x2 * snz + y1 * cz;
    return [x3, y3, z2];
  };

  const positions = new Array<number>(src.positions.length);
  const normals = new Array<number>(src.normals.length);
  const invSx = 1 / (Math.abs(sx) > 1e-6 ? sx : 1);
  const invSy = 1 / (Math.abs(sy) > 1e-6 ? sy : 1);
  const invSz = 1 / (Math.abs(sz) > 1e-6 ? sz : 1);

  for (let i = 0; i < src.positions.length; i += 3) {
    const [ox, oy, oz] = rotVec(src.positions[i]! * sx, src.positions[i + 1]! * sy, src.positions[i + 2]! * sz);
    positions[i] = ox + px;
    positions[i + 1] = oy + py;
    positions[i + 2] = oz + pz;

    const [nx, ny, nz] = rotVec(src.normals[i]! * invSx, src.normals[i + 1]! * invSy, src.normals[i + 2]! * invSz);
    const nl = Math.hypot(nx, ny, nz) || 1;
    normals[i] = nx / nl;
    normals[i + 1] = ny / nl;
    normals[i + 2] = nz / nl;
  }

  const flip = sx * sy * sz < 0;
  const indices = src.indices.slice();
  if (flip) {
    for (let i = 0; i < indices.length; i += 3) {
      const tmp = indices[i + 1]!;
      indices[i + 1] = indices[i + 2]!;
      indices[i + 2] = tmp;
    }
  }
  return {
    positions,
    normals,
    uvs: src.uvs.slice(),
    indices,
    ...(src.colors ? { colors: src.colors.slice() } : {}),
    ...(src.analyticNormals ? { analyticNormals: true } : {})
  };
}

/** Splits shared vertices into crisp per-triangle flat normals. */
export function toFlatShaded(src: RawMesh): RawMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const colors: number[] | undefined = src.colors ? [] : undefined;
  for (let i = 0; i < src.indices.length; i += 3) {
    const i0 = src.indices[i]! * 3;
    const i1 = src.indices[i + 1]! * 3;
    const i2 = src.indices[i + 2]! * 3;
    const p0: V3 = [src.positions[i0]!, src.positions[i0 + 1]!, src.positions[i0 + 2]!];
    const p1: V3 = [src.positions[i1]!, src.positions[i1 + 1]!, src.positions[i1 + 2]!];
    const p2: V3 = [src.positions[i2]!, src.positions[i2 + 1]!, src.positions[i2 + 2]!];
    const n = norm3(cross3(sub3(p1, p0), sub3(p2, p0)));
    const base = positions.length / 3;
    positions.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
    normals.push(n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]);
    const u0 = (i0 / 3) * 2, u1 = (i1 / 3) * 2, u2 = (i2 / 3) * 2;
    uvs.push(
      src.uvs[u0] ?? 0, src.uvs[u0 + 1] ?? 0,
      src.uvs[u1] ?? 0, src.uvs[u1 + 1] ?? 0,
      src.uvs[u2] ?? 0, src.uvs[u2 + 1] ?? 0
    );
    if (colors && src.colors) {
      const c0 = (i0 / 3) * 4, c1 = (i1 / 3) * 4, c2 = (i2 / 3) * 4;
      colors.push(
        src.colors[c0] ?? 1, src.colors[c0 + 1] ?? 1, src.colors[c0 + 2] ?? 1, src.colors[c0 + 3] ?? 1,
        src.colors[c1] ?? 1, src.colors[c1 + 1] ?? 1, src.colors[c1 + 2] ?? 1, src.colors[c1 + 3] ?? 1,
        src.colors[c2] ?? 1, src.colors[c2 + 1] ?? 1, src.colors[c2 + 2] ?? 1, src.colors[c2 + 3] ?? 1
      );
    }
    indices.push(base, base + 1, base + 2);
  }
  return { positions, normals, uvs, indices, ...(colors ? { colors } : {}) };
}

function pushQuadCCW(out: RawMesh, p0: V3, p1: V3, p2: V3, p3: V3, uvScale = 1): void {
  const n = norm3(cross3(sub3(p1, p0), sub3(p2, p0)));
  const base = out.positions.length / 3;
  out.positions.push(
    p0[0], p0[1], p0[2],
    p1[0], p1[1], p1[2],
    p2[0], p2[1], p2[2],
    p3[0], p3[1], p3[2]
  );
  for (let k = 0; k < 4; k += 1) out.normals.push(n[0], n[1], n[2]);
  out.uvs.push(0, 0, uvScale, 0, uvScale, uvScale, 0, uvScale);
  out.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
}

function pushTriCCW(out: RawMesh, p0: V3, p1: V3, p2: V3): void {
  const n = norm3(cross3(sub3(p1, p0), sub3(p2, p0)));
  const base = out.positions.length / 3;
  out.positions.push(p0[0], p0[1], p0[2], p1[0], p1[1], p1[2], p2[0], p2[1], p2[2]);
  out.normals.push(n[0], n[1], n[2], n[0], n[1], n[2], n[0], n[1], n[2]);
  out.uvs.push(0, 0, 1, 0, 0.5, 1);
  out.indices.push(base, base + 1, base + 2);
}

// ---------------------------------------------------------------------------
// Core Curved, Bevelled, Revolved, Swept & Lofted Surface Builders
// ---------------------------------------------------------------------------

/** Chamfered 3D box (`wx * wy * wz` centered at origin) with 45-degree specular bevels. */
export function bevelBoxMesh(wx: number, wy: number, wz: number, bevel = 0.03): RawMesh {
  const hx = Math.max(1e-4, wx * 0.5);
  const hy = Math.max(1e-4, wy * 0.5);
  const hz = Math.max(1e-4, wz * 0.5);
  const b = Math.min(Math.max(0, bevel), hx * 0.42, hy * 0.42, hz * 0.42);
  const ix = hx - b, iy = hy - b, iz = hz - b;
  const out: RawMesh = { positions: [], normals: [], uvs: [], indices: [] };

  if (b <= 1e-4) {
    pushQuadCCW(out, [-hx, -hy, hz], [hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz]);
    pushQuadCCW(out, [hx, -hy, -hz], [-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz]);
    pushQuadCCW(out, [hx, -hy, hz], [hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz]);
    pushQuadCCW(out, [-hx, -hy, -hz], [-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz]);
    pushQuadCCW(out, [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz], [-hx, hy, -hz]);
    pushQuadCCW(out, [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz], [-hx, -hy, hz]);
    return out;
  }

  pushQuadCCW(out, [-ix, -iy, hz], [ix, -iy, hz], [ix, iy, hz], [-ix, iy, hz]);
  pushQuadCCW(out, [ix, -iy, -hz], [-ix, -iy, -hz], [-ix, iy, -hz], [ix, iy, -hz]);
  pushQuadCCW(out, [hx, -iy, iz], [hx, -iy, -iz], [hx, iy, -iz], [hx, iy, iz]);
  pushQuadCCW(out, [-hx, -iy, -iz], [-hx, -iy, iz], [-hx, iy, iz], [-hx, iy, -iz]);
  pushQuadCCW(out, [-ix, hy, iz], [ix, hy, iz], [ix, hy, -iz], [-ix, hy, -iz]);
  pushQuadCCW(out, [-ix, -hy, -iz], [ix, -hy, -iz], [ix, -hy, iz], [-ix, -hy, iz]);

  pushQuadCCW(out, [ix, -iy, hz], [hx, -iy, iz], [hx, iy, iz], [ix, iy, hz]);
  pushQuadCCW(out, [hx, -iy, -iz], [ix, -iy, -hz], [ix, iy, -hz], [hx, iy, -iz]);
  pushQuadCCW(out, [-ix, -iy, -hz], [-hx, -iy, -iz], [-hx, iy, -iz], [-ix, iy, -hz]);
  pushQuadCCW(out, [-hx, -iy, iz], [-ix, -iy, hz], [-ix, iy, hz], [-hx, iy, iz]);

  pushQuadCCW(out, [-ix, iy, hz], [ix, iy, hz], [ix, hy, iz], [-ix, hy, iz]);
  pushQuadCCW(out, [ix, iy, -hz], [-ix, iy, -hz], [-ix, hy, -iz], [ix, hy, -iz]);
  pushQuadCCW(out, [hx, iy, iz], [hx, iy, -iz], [ix, hy, -iz], [ix, hy, iz]);
  pushQuadCCW(out, [-hx, iy, -iz], [-hx, iy, iz], [-ix, hy, iz], [-ix, hy, -iz]);

  pushQuadCCW(out, [-ix, -hy, iz], [ix, -hy, iz], [ix, -iy, hz], [-ix, -iy, hz]);
  pushQuadCCW(out, [ix, -hy, -iz], [-ix, -hy, -iz], [-ix, -iy, -hz], [ix, -iy, -hz]);
  pushQuadCCW(out, [ix, -hy, iz], [ix, -hy, -iz], [hx, -iy, -iz], [hx, -iy, iz]);
  pushQuadCCW(out, [-ix, -hy, -iz], [-ix, -hy, iz], [-hx, -iy, iz], [-hx, -iy, -iz]);

  pushTriCCW(out, [ix, iy, hz], [hx, iy, iz], [ix, hy, iz]);
  pushTriCCW(out, [hx, iy, -iz], [ix, iy, -hz], [ix, hy, -iz]);
  pushTriCCW(out, [-ix, iy, -hz], [-hx, iy, -iz], [-ix, hy, -iz]);
  pushTriCCW(out, [-hx, iy, iz], [-ix, iy, hz], [-ix, hy, iz]);

  pushTriCCW(out, [hx, -iy, iz], [ix, -iy, hz], [ix, -hy, iz]);
  pushTriCCW(out, [ix, -iy, -hz], [hx, -iy, -iz], [ix, -hy, -iz]);
  pushTriCCW(out, [-hx, -iy, -iz], [-ix, -iy, -hz], [-ix, -hy, -iz]);
  pushTriCCW(out, [-ix, -iy, hz], [-hx, -iy, iz], [-ix, -hy, iz]);

  return out;
}

/** Revolved lathe surface around `+Y` from bottom-to-top profile `[radius, y][]`. */
export function latheMesh(
  profile: readonly V2[],
  radialSegments = 16,
  flatShaded = false
): RawMesh {
  const segs = Math.max(3, Math.floor(radialSegments));
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const rows = profile.length;
  if (rows < 2) return { positions, normals, uvs, indices };

  for (let j = 0; j < rows; j += 1) {
    const [rawR, y] = profile[j]!;
    const r = Math.max(0, rawR);
    const prev = profile[Math.max(0, j - 1)]!;
    const next = profile[Math.min(rows - 1, j + 1)]!;
    const dr = next[0] - prev[0];
    const dy = next[1] - prev[1];
    const len = Math.hypot(dr, dy) || 1;
    const nr = dy / len;
    const ny = -dr / len;
    const v = j / Math.max(1, rows - 1);

    for (let i = 0; i <= segs; i += 1) {
      const u = i / segs;
      const phi = u * Math.PI * 2;
      const cp = Math.cos(phi);
      const sp = Math.sin(phi);
      positions.push(r * sp, y, r * cp);
      if (r < 1e-5) {
        normals.push(0, ny >= 0 ? 1 : -1, 0);
      } else {
        normals.push(nr * sp, ny, nr * cp);
      }
      uvs.push(u, v);
    }
  }

  const stride = segs + 1;
  for (let j = 0; j < rows - 1; j += 1) {
    for (let i = 0; i < segs; i += 1) {
      const a = j * stride + i;
      const b = a + 1;
      const c = (j + 1) * stride + i + 1;
      const d = (j + 1) * stride + i;
      indices.push(a, b, c, a, c, d);
    }
  }

  const raw: RawMesh = { positions, normals, uvs, indices };
  return flatShaded ? toFlatShaded(raw) : raw;
}

/** Swept 3D tube along spine `[x, y, z, radius][]` with parallel-transport frames and end caps. */
export function tubeSweepMesh(
  spine: readonly V4[],
  radialSegments = 8,
  flatShaded = false
): RawMesh {
  const segs = Math.max(3, Math.floor(radialSegments));
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const nPts = spine.length;
  if (nPts < 2) return { positions, normals, uvs, indices };
  let up: [number, number, number] = [0, 1, 0];

  for (let j = 0; j < nPts; j += 1) {
    const cur = spine[j]!;
    const prev = spine[Math.max(0, j - 1)]!;
    const next = spine[Math.min(nPts - 1, j + 1)]!;
    const tang = norm3([next[0] - prev[0], next[1] - prev[1], next[2] - prev[2]]);
    if (Math.abs(dot3(tang, up)) > 0.95) {
      up = Math.abs(tang[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    }
    const side = norm3(cross3(up, tang));
    const binorm = norm3(cross3(tang, side));
    up = binorm;

    const r = Math.max(0, cur[3]);
    const v = j / Math.max(1, nPts - 1);
    for (let i = 0; i <= segs; i += 1) {
      const u = i / segs;
      const a = u * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const nx = side[0] * ca + binorm[0] * sa;
      const ny = side[1] * ca + binorm[1] * sa;
      const nz = side[2] * ca + binorm[2] * sa;
      positions.push(cur[0] + nx * r, cur[1] + ny * r, cur[2] + nz * r);
      normals.push(nx, ny, nz);
      uvs.push(u, v);
    }
  }

  const stride = segs + 1;
  for (let j = 0; j < nPts - 1; j += 1) {
    for (let i = 0; i < segs; i += 1) {
      const a = j * stride + i;
      const b = a + 1;
      const c = (j + 1) * stride + i + 1;
      const d = (j + 1) * stride + i;
      indices.push(a, d, c, a, c, b);
    }
  }

  const first = spine[0]!;
  if (first[3] > 1e-4) {
    const cIdx = positions.length / 3;
    const next = spine[1]!;
    const n0 = norm3([first[0] - next[0], first[1] - next[1], first[2] - next[2]]);
    positions.push(first[0], first[1], first[2]);
    normals.push(n0[0], n0[1], n0[2]);
    uvs.push(0.5, 0.5);
    for (let i = 0; i < segs; i += 1) indices.push(cIdx, i, i + 1);
  }
  const last = spine[nPts - 1]!;
  if (last[3] > 1e-4) {
    const cIdx = positions.length / 3;
    const prev = spine[nPts - 2]!;
    const n1 = norm3([last[0] - prev[0], last[1] - prev[1], last[2] - prev[2]]);
    positions.push(last[0], last[1], last[2]);
    normals.push(n1[0], n1[1], n1[2]);
    uvs.push(0.5, 0.5);
    const ring = (nPts - 1) * stride;
    for (let i = 0; i < segs; i += 1) indices.push(cIdx, ring + i + 1, ring + i);
  }

  const raw: RawMesh = { positions, normals, uvs, indices };
  return flatShaded ? toFlatShaded(raw) : raw;
}

/** 2D polygon ear-clipping triangulation (handles convex & concave rings; auto-normalizes CCW). */
function triangulatePolygon2D(ringIn: readonly V2[]): { readonly ring: V2[]; readonly tris: [number, number, number][] } {
  const cleaned: V2[] = [];
  for (const pt of ringIn) {
    const prev = cleaned[cleaned.length - 1];
    if (!prev || Math.hypot(pt[0] - prev[0], pt[1] - prev[1]) > 1e-6) cleaned.push([pt[0], pt[1]]);
  }
  if (cleaned.length > 2) {
    const first = cleaned[0]!, last = cleaned[cleaned.length - 1]!;
    if (Math.hypot(first[0] - last[0], first[1] - last[1]) <= 1e-6) cleaned.pop();
  }
  if (cleaned.length < 3) return { ring: cleaned, tris: [] };

  let signedArea2 = 0;
  for (let i = 0; i < cleaned.length; i += 1) {
    const a = cleaned[i]!, b = cleaned[(i + 1) % cleaned.length]!;
    signedArea2 += a[0] * b[1] - b[0] * a[1];
  }
  const ring = signedArea2 >= 0 ? cleaned : [...cleaned].reverse();

  const avail = ring.map((_, idx) => idx);
  const tris: [number, number, number][] = [];
  const cross2 = (a: V2, b: V2, c: V2): number =>
    (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const ptInTri = (p: V2, a: V2, b: V2, c: V2): boolean =>
    cross2(a, b, p) >= -1e-7 && cross2(b, c, p) >= -1e-7 && cross2(c, a, p) >= -1e-7;

  let guard = avail.length * avail.length + 16;
  while (avail.length > 3 && guard > 0) {
    guard -= 1;
    let earFound = false;
    for (let i = 0; i < avail.length; i += 1) {
      const i0 = avail[(i - 1 + avail.length) % avail.length]!;
      const i1 = avail[i]!;
      const i2 = avail[(i + 1) % avail.length]!;
      const a = ring[i0]!, b = ring[i1]!, c = ring[i2]!;
      if (cross2(a, b, c) <= 1e-7) continue;
      let blocked = false;
      for (const other of avail) {
        if (other === i0 || other === i1 || other === i2) continue;
        if (ptInTri(ring[other]!, a, b, c)) {
          blocked = true;
          break;
        }
      }
      if (!blocked) {
        tris.push([i0, i1, i2]);
        avail.splice(i, 1);
        earFound = true;
        break;
      }
    }
    if (!earFound) {
      tris.push([avail[0]!, avail[1]!, avail[2]!]);
      avail.splice(1, 1);
    }
  }
  if (avail.length === 3) tris.push([avail[0]!, avail[1]!, avail[2]!]);
  return { ring, tris };
}

function insetRing2D(ring: readonly V2[], bevel: number): V2[] {
  let cx = 0, cy = 0;
  for (const p of ring) { cx += p[0]; cy += p[1]; }
  cx /= Math.max(1, ring.length);
  cy /= Math.max(1, ring.length);

  return ring.map((p, i) => {
    const prev = ring[(i - 1 + ring.length) % ring.length]!;
    const next = ring[(i + 1) % ring.length]!;
    const e0 = norm3([p[0] - prev[0], p[1] - prev[1], 0]);
    const e1 = norm3([next[0] - p[0], next[1] - p[1], 0]);
    // Inward normal for CCW ring is (-ey, ex)
    const n0: V2 = [-e0[1], e0[0]];
    const n1: V2 = [-e1[1], e1[0]];
    let bx = n0[0] + n1[0];
    let by = n0[1] + n1[1];
    const bl = Math.hypot(bx, by);
    if (bl > 1e-4) {
      bx /= bl;
      by /= bl;
    } else {
      const toC = norm3([cx - p[0], cy - p[1], 0]);
      bx = toC[0];
      by = toC[1];
    }
    const maxDist = Math.hypot(cx - p[0], cy - p[1]) * 0.45;
    const d = Math.min(bevel, maxDist);
    return [p[0] + bx * d, p[1] + by * d] as const;
  });
}

/**
 * Extrudes a 2D polygon (`ccwRing` in XY, convex or concave) across `Z in [-height/2, +height/2]`
 * with optional 45-degree front/back specular bevels.
 */
export function extrudePolygonMesh(
  ccwRing: readonly V2[],
  height: number,
  bevel = 0,
  flatShaded = false
): RawMesh {
  const out: RawMesh = { positions: [], normals: [], uvs: [], indices: [] };
  const { ring, tris } = triangulatePolygon2D(ccwRing);
  const n = ring.length;
  if (n < 3) return out;

  const hz = Math.max(1e-4, height * 0.5);
  const b = Math.min(Math.max(0, bevel), hz * 0.42);
  const innerRing = b > 1e-4 ? insetRing2D(ring, b) : ring;
  const zOuter = hz - b;

  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (const [x, y] of ring) {
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }
  const spanX = Math.max(1e-4, maxX - minX);
  const spanY = Math.max(1e-4, maxY - minY);

  // Front cap (+hz) & Back cap (-hz)
  const frontBase = out.positions.length / 3;
  for (const [x, y] of innerRing) {
    out.positions.push(x, y, hz);
    out.normals.push(0, 0, 1);
    out.uvs.push((x - minX) / spanX, (y - minY) / spanY);
  }
  for (const [i0, i1, i2] of tris) {
    out.indices.push(frontBase + i0, frontBase + i1, frontBase + i2);
  }

  const backBase = out.positions.length / 3;
  for (const [x, y] of innerRing) {
    out.positions.push(x, y, -hz);
    out.normals.push(0, 0, -1);
    out.uvs.push((x - minX) / spanX, (y - minY) / spanY);
  }
  for (const [i0, i1, i2] of tris) {
    out.indices.push(backBase + i0, backBase + i2, backBase + i1);
  }

  // Side walls + optional front/back bevel chamfers
  for (let i = 0; i < n; i += 1) {
    const a = ring[i]!;
    const c = ring[(i + 1) % n]!;
    pushQuadCCW(out, [a[0], a[1], -zOuter], [c[0], c[1], -zOuter], [c[0], c[1], zOuter], [a[0], a[1], zOuter]);
    if (b > 1e-4) {
      const ia = innerRing[i]!;
      const ic = innerRing[(i + 1) % n]!;
      pushQuadCCW(out, [a[0], a[1], zOuter], [c[0], c[1], zOuter], [ic[0], ic[1], hz], [ia[0], ia[1], hz]);
      pushQuadCCW(out, [c[0], c[1], -zOuter], [a[0], a[1], -zOuter], [ia[0], ia[1], -hz], [ic[0], ic[1], -hz]);
    }
  }

  return flatShaded ? toFlatShaded(out) : out;
}

/**
 * Lofts an ordered list of equal-count 3D cross-section rings (`sections`) into a smooth
 * hull (fuselages, car bodies, boat hulls, stadium bowls, wings) with automatic outward winding.
 */
export function loftSectionsMesh(
  sections: readonly (readonly V3[])[],
  capEnds = true,
  flatShaded = false
): RawMesh {
  const numSec = sections.length;
  if (numSec < 2) return { positions: [], normals: [], uvs: [], indices: [] };
  const ringLen = sections[0]!.length;
  if (ringLen < 3) return { positions: [], normals: [], uvs: [], indices: [] };

  const centroids: V3[] = sections.map((ring) => {
    let cx = 0, cy = 0, cz = 0;
    for (const p of ring) { cx += p[0]; cy += p[1]; cz += p[2]; }
    return [cx / ringLen, cy / ringLen, cz / ringLen];
  });

  // Determine whether index progression (i -> i+1) combined with section progression (s -> s+1) points outward
  let orientVotes = 0;
  for (let s = 0; s < numSec - 1; s += 1) {
    const r0 = sections[s]!;
    const r1 = sections[s + 1]!;
    const midC = lerp3(centroids[s]!, centroids[s + 1]!, 0.5);
    for (let i = 0; i < ringLen; i += 1) {
      const nextI = (i + 1) % ringLen;
      const a = r0[i]!;
      const b = r0[nextI]!;
      const d = r1[i]!;
      const n = cross3(sub3(b, a), sub3(d, a));
      const outward = sub3(a, midC);
      orientVotes += dot3(n, outward);
    }
  }
  const reverseWinding = orientVotes < 0;

  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const stride = ringLen + 1;

  for (let s = 0; s < numSec; s += 1) {
    const ring = sections[s]!;
    const v = s / Math.max(1, numSec - 1);
    for (let i = 0; i <= ringLen; i += 1) {
      const p = ring[i % ringLen]!;
      positions.push(p[0], p[1], p[2]);
      uvs.push(i / ringLen, v);
    }
  }

  for (let s = 0; s < numSec - 1; s += 1) {
    for (let i = 0; i < ringLen; i += 1) {
      const a = s * stride + i;
      const b = a + 1;
      const c = (s + 1) * stride + i + 1;
      const d = (s + 1) * stride + i;
      if (reverseWinding) {
        indices.push(a, d, c, a, c, b);
      } else {
        indices.push(a, b, c, a, c, d);
      }
    }
  }

  // Smooth area-weighted vertex normals across the lofted skin, seam-welded at i=0 / i=ringLen
  const normals = new Array<number>(positions.length).fill(0);
  for (let t = 0; t < indices.length; t += 3) {
    const i0 = indices[t]!, i1 = indices[t + 1]!, i2 = indices[t + 2]!;
    const p0: V3 = [positions[i0 * 3]!, positions[i0 * 3 + 1]!, positions[i0 * 3 + 2]!];
    const p1: V3 = [positions[i1 * 3]!, positions[i1 * 3 + 1]!, positions[i1 * 3 + 2]!];
    const p2: V3 = [positions[i2 * 3]!, positions[i2 * 3 + 1]!, positions[i2 * 3 + 2]!];
    const fn = cross3(sub3(p1, p0), sub3(p2, p0));
    for (const vi of [i0, i1, i2]) {
      normals[vi * 3]! += fn[0];
      normals[vi * 3 + 1]! += fn[1];
      normals[vi * 3 + 2]! += fn[2];
    }
  }
  for (let s = 0; s < numSec; s += 1) {
    const first = s * stride;
    const last = first + ringLen;
    const sx = normals[first * 3]! + normals[last * 3]!;
    const sy = normals[first * 3 + 1]! + normals[last * 3 + 1]!;
    const sz = normals[first * 3 + 2]! + normals[last * 3 + 2]!;
    normals[first * 3] = sx; normals[first * 3 + 1] = sy; normals[first * 3 + 2] = sz;
    normals[last * 3] = sx; normals[last * 3 + 1] = sy; normals[last * 3 + 2] = sz;
  }
  for (let i = 0; i < normals.length; i += 3) {
    const nl = Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!) || 1;
    normals[i]! /= nl;
    normals[i + 1]! /= nl;
    normals[i + 2]! /= nl;
  }

  if (capEnds) {
    const addCap = (ring: readonly V3[], center: V3, axisOut: V3): void => {
      const cIdx = positions.length / 3;
      const nOut = norm3(axisOut);
      positions.push(center[0], center[1], center[2]);
      normals.push(nOut[0], nOut[1], nOut[2]);
      uvs.push(0.5, 0.5);
      const ringStart = positions.length / 3;
      for (let i = 0; i < ringLen; i += 1) {
        const p = ring[i]!;
        positions.push(p[0], p[1], p[2]);
        normals.push(nOut[0], nOut[1], nOut[2]);
        uvs.push(0.5 + 0.5 * Math.cos((i / ringLen) * Math.PI * 2), 0.5 + 0.5 * Math.sin((i / ringLen) * Math.PI * 2));
      }
      for (let i = 0; i < ringLen; i += 1) {
        const a = ringStart + i;
        const b = ringStart + ((i + 1) % ringLen);
        const triN = cross3(sub3(ring[i]!, center), sub3(ring[(i + 1) % ringLen]!, center));
        if (dot3(triN, nOut) >= 0) {
          indices.push(cIdx, a, b);
        } else {
          indices.push(cIdx, b, a);
        }
      }
    };
    addCap(sections[0]!, centroids[0]!, sub3(centroids[0]!, centroids[1]!));
    addCap(sections[numSec - 1]!, centroids[numSec - 1]!, sub3(centroids[numSec - 1]!, centroids[numSec - 2]!));
  }

  const raw: RawMesh = { positions, normals, uvs, indices };
  return flatShaded ? toFlatShaded(raw) : raw;
}

/** Subdivided faceted icosphere with optional deterministic `fbm3` displacement. */
export function icosphereFacetMesh(
  radius: number,
  detail: 0 | 1 | 2 = 1,
  noiseAmp = 0,
  seed = 1
): RawMesh {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts: [number, number, number][] = (
    [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
    ] as const
  ).map((v) => norm3(v));

  let faces: [number, number, number][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
  ];

  for (let d = 0; d < detail; d += 1) {
    const midCache = new Map<string, number>();
    const mid = (a: number, b: number): number => {
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      const hit = midCache.get(k);
      if (hit !== undefined) return hit;
      const va = verts[a]!, vb = verts[b]!;
      const idx = verts.length;
      verts.push(norm3([(va[0] + vb[0]) * 0.5, (va[1] + vb[1]) * 0.5, (va[2] + vb[2]) * 0.5]));
      midCache.set(k, idx);
      return idx;
    };
    const nextFaces: [number, number, number][] = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      nextFaces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = nextFaces;
  }

  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (const v of verts) {
    const disp = noiseAmp > 0 ? 1 + (fbm3(v[0] * 1.9 + 3.1, v[1] * 1.9 - 1.7, v[2] * 1.9 + 5.3, seed) - 0.5) * 2 * noiseAmp : 1;
    const r = radius * disp;
    positions.push(v[0] * r, v[1] * r, v[2] * r);
    normals.push(v[0], v[1], v[2]);
    uvs.push(0.5 + Math.atan2(v[2], v[0]) / (2 * Math.PI), 0.5 - Math.asin(Math.max(-1, Math.min(1, v[1]))) / Math.PI);
  }
  for (const [a, b, c] of faces) indices.push(a, b, c);
  return toFlatShaded({ positions, normals, uvs, indices });
}

/** Smooth-shaded organic icosphere with area-weighted vertex normals and optional upward botanical normal bias. */
export function icosphereSmoothMesh(
  radius: number,
  detail: 0 | 1 | 2 = 2,
  noiseAmp = 0.08,
  seed = 1,
  upwardNormalBias = 0
): RawMesh {
  const t = (1 + Math.sqrt(5)) / 2;
  let verts: [number, number, number][] = (
    [
      [-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0],
      [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t],
      [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]
    ] as const
  ).map((v) => norm3(v));

  let faces: [number, number, number][] = [
    [0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11],
    [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8],
    [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9],
    [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]
  ];

  for (let d = 0; d < detail; d += 1) {
    const midCache = new Map<string, number>();
    const mid = (a: number, b: number): number => {
      const k = a < b ? `${a}_${b}` : `${b}_${a}`;
      const hit = midCache.get(k);
      if (hit !== undefined) return hit;
      const va = verts[a]!, vb = verts[b]!;
      const idx = verts.length;
      verts.push(norm3([(va[0] + vb[0]) * 0.5, (va[1] + vb[1]) * 0.5, (va[2] + vb[2]) * 0.5]));
      midCache.set(k, idx);
      return idx;
    };
    const nextFaces: [number, number, number][] = [];
    for (const [a, b, c] of faces) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      nextFaces.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    faces = nextFaces;
  }

  const positions: number[] = [];
  const normals = new Array<number>(verts.length * 3).fill(0);
  const uvs: number[] = [];
  const indices: number[] = [];

  for (const v of verts) {
    const disp = noiseAmp > 0 ? 1 + (fbm3(v[0] * 1.7 + 3.1, v[1] * 1.7 - 1.7, v[2] * 1.7 + 5.3, seed) - 0.5) * 2 * noiseAmp : 1;
    const r = radius * disp;
    positions.push(v[0] * r, v[1] * r, v[2] * r);
    uvs.push(0.5 + Math.atan2(v[2], v[0]) / (2 * Math.PI), 0.5 - Math.asin(Math.max(-1, Math.min(1, v[1]))) / Math.PI);
  }
  for (const [a, b, c] of faces) {
    indices.push(a, b, c);
    const p0: V3 = [positions[a * 3]!, positions[a * 3 + 1]!, positions[a * 3 + 2]!];
    const p1: V3 = [positions[b * 3]!, positions[b * 3 + 1]!, positions[b * 3 + 2]!];
    const p2: V3 = [positions[c * 3]!, positions[c * 3 + 1]!, positions[c * 3 + 2]!];
    const fn = cross3(sub3(p1, p0), sub3(p2, p0));
    for (const vi of [a, b, c]) {
      normals[vi * 3]! += fn[0];
      normals[vi * 3 + 1]! += fn[1];
      normals[vi * 3 + 2]! += fn[2];
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const n = norm3([normals[i]!, normals[i + 1]!, normals[i + 2]!]);
    const biased = norm3([n[0], n[1] + upwardNormalBias, n[2]]);
    normals[i] = biased[0];
    normals[i + 1] = biased[1];
    normals[i + 2] = biased[2];
  }
  return { positions, normals, uvs, indices };
}

// ---------------------------------------------------------------------------
// High-Craft Reusable Compound Sub-Assemblies
// ---------------------------------------------------------------------------

/**
 * Sculpted multi-material wheel assembly centered at `[0, 0, 0]` with axle along `X` (`[-width/2, +width/2]`):
 * chamfered rubber tire profile + deep-dish alloy rim barrel + `spokeCount` forged spokes + optional brake rotor.
 */
export function wheelAssemblySlots(opts: {
  readonly radius: number;
  readonly width: number;
  readonly spokeCount?: number;
  readonly tireMat: number;
  readonly rimMat: number;
  readonly rotorMat?: number;
}): MultiMatSlot[] {
  const r = Math.max(0.05, opts.radius);
  const hw = Math.max(0.02, opts.width * 0.5);
  const rimR = r * 0.66;
  const hubR = r * 0.2;
  const spokeCount = Math.max(3, Math.floor(opts.spokeCount ?? 5));
  const slots: MultiMatSlot[] = [];

  // Chamfered sidewall + tread rubber tire revolved around +Y, then rotated so +Y becomes +X axle
  const tireProfile: V2[] = [
    [rimR * 0.98, -hw * 0.88],
    [r * 0.92, -hw],
    [r, -hw * 0.76],
    [r, hw * 0.76],
    [r * 0.92, hw],
    [rimR * 0.98, hw * 0.88]
  ];
  slots.push({
    mesh: transformMesh(latheMesh(tireProfile, 22), { rot: [0, 0, -Math.PI * 0.5] }),
    materialIndex: opts.tireMat
  });

  // Alloy rim outer flanges + recessed barrel + center hub cap
  const rimProfile: V2[] = [
    [0, -hw * 0.55],
    [rimR * 0.99, -hw * 0.55],
    [rimR * 1.02, -hw * 0.86],
    [rimR * 0.92, -hw * 0.86],
    [rimR * 0.84, 0],
    [rimR * 0.92, hw * 0.86],
    [rimR * 1.02, hw * 0.86],
    [hubR * 1.15, hw * 0.62],
    [hubR, hw * 0.92],
    [0, hw * 0.94]
  ];
  slots.push({
    mesh: transformMesh(latheMesh(rimProfile, 20), { rot: [0, 0, -Math.PI * 0.5] }),
    materialIndex: opts.rimMat
  });

  // Sculpted forged spokes on both outer (+X) and inner (-X) faces so left/right wheels both read crisply
  const spokeLen = rimR * 0.92 - hubR * 0.65;
  const spokeMid = (rimR * 0.92 + hubR * 0.65) * 0.5;
  for (const side of [-1, 1] as const) {
    for (let i = 0; i < spokeCount; i += 1) {
      const ang = (i / spokeCount) * Math.PI * 2;
      const sy = Math.cos(ang) * spokeMid;
      const sz = Math.sin(ang) * spokeMid;
      slots.push({
        mesh: transformMesh(
          bevelBoxMesh(hw * 0.24, spokeLen, r * 0.095, r * 0.018),
          { pos: [side * hw * 0.72, sy, sz], rot: [ang, 0, 0] }
        ),
        materialIndex: opts.rimMat
      });
    }
  }

  if (opts.rotorMat !== undefined) {
    const rotorR = rimR * 0.74;
    const rotorProfile: V2[] = [
      [0, -hw * 0.16],
      [rotorR, -hw * 0.16],
      [rotorR, hw * 0.16],
      [0, hw * 0.16]
    ];
    slots.push({
      mesh: transformMesh(latheMesh(rotorProfile, 18), { rot: [0, 0, -Math.PI * 0.5] }),
      materialIndex: opts.rotorMat
    });
    // Performance brake caliper
    slots.push({
      mesh: transformMesh(
        bevelBoxMesh(hw * 0.52, rotorR * 0.52, rotorR * 0.34, r * 0.02),
        { pos: [0, rotorR * 0.56, -rotorR * 0.32], rot: [-0.45, 0, 0] }
      ),
      materialIndex: opts.rotorMat
    });
  }

  return slots;
}

/**
 * Open 4-chord structural steel lattice truss (`span = [wx, wy, wz]` centered at origin)
 * with collar frames and X-braced bays along its primary span axis.
 */
export function latticeTrussMesh(opts: {
  readonly span: V3;
  readonly bays: number;
  readonly chordRadius: number;
  readonly braceRadius?: number;
}): RawMesh {
  const [wx, wy, wz] = opts.span;
  const bays = Math.max(1, Math.floor(opts.bays));
  const cr = Math.max(0.008, opts.chordRadius);
  const br = Math.max(0.005, opts.braceRadius ?? cr * 0.62);

  // Pick longest axis as primary truss axis: 0 = X, 1 = Y, 2 = Z
  const primary: 0 | 1 | 2 = wx >= wy && wx >= wz ? 0 : wy >= wz ? 1 : 2;
  const len = opts.span[primary]!;
  const uAxis: 0 | 1 | 2 = primary === 0 ? 1 : 0;
  const vAxis: 0 | 1 | 2 = primary === 2 ? 1 : 2;
  const hu = Math.max(cr * 1.5, opts.span[uAxis]! * 0.5 - cr);
  const hv = Math.max(cr * 1.5, opts.span[vAxis]! * 0.5 - cr);
  const hLen = len * 0.5;

  const mkPt = (s: number, u: number, v: number, rad: number): V4 => {
    const p: [number, number, number] = [0, 0, 0];
    p[primary] = s;
    p[uAxis] = u;
    p[vAxis] = v;
    return [p[0], p[1], p[2], rad];
  };

  const parts: RawMesh[] = [];
  const corners: readonly [number, number][] = [
    [-hu, -hv],
    [hu, -hv],
    [hu, hv],
    [-hu, hv]
  ];

  // 4 longitudinal main chords
  for (const [cu, cv] of corners) {
    parts.push(tubeSweepMesh([mkPt(-hLen, cu, cv, cr), mkPt(hLen, cu, cv, cr)], 6, true));
  }

  // Bay collar struts + diagonal X-bracing on all 4 truss faces
  for (let b = 0; b <= bays; b += 1) {
    const s0 = -hLen + (b / bays) * len;
    for (let c = 0; c < 4; c += 1) {
      const [u0, v0] = corners[c]!;
      const [u1, v1] = corners[(c + 1) % 4]!;
      parts.push(tubeSweepMesh([mkPt(s0, u0, v0, br), mkPt(s0, u1, v1, br)], 5, true));
      if (b < bays) {
        const s1 = -hLen + ((b + 1) / bays) * len;
        parts.push(tubeSweepMesh([mkPt(s0, u0, v0, br * 0.88), mkPt(s1, u1, v1, br * 0.88)], 5, true));
        if (b % 2 === 0) {
          parts.push(tubeSweepMesh([mkPt(s1, u0, v0, br * 0.82), mkPt(s0, u1, v1, br * 0.82)], 5, true));
        }
      }
    }
  }

  return mergeRawMeshesToRaw(parts);
}

/**
 * Radial masonry archway in XY (`y >= 0`, depth along `Z`) composed of alternating
 * chamfered wedge voussoirs (`stoneMatA` / `stoneMatB`) and a proud crown keystone (`keystoneMat`).
 */
export function archwayVoussoirSlots(opts: {
  readonly radius: number;
  readonly thickness: number;
  readonly depth: number;
  readonly voussoirs?: number;
  readonly stoneMatA: number;
  readonly stoneMatB: number;
  readonly keystoneMat: number;
}): MultiMatSlot[] {
  const rIn = Math.max(0.1, opts.radius);
  const thick = Math.max(0.05, opts.thickness);
  const rOut = rIn + thick;
  const depth = Math.max(0.05, opts.depth);
  const rawCount = Math.max(5, Math.floor(opts.voussoirs ?? 9));
  const count = rawCount % 2 === 1 ? rawCount : rawCount + 1;
  const midIdx = Math.floor(count / 2);
  const slots: MultiMatSlot[] = [];

  for (let i = 0; i < count; i += 1) {
    const isKey = i === midIdx;
    const a0 = (i / count) * Math.PI + 0.008;
    const a1 = ((i + 1) / count) * Math.PI - 0.008;
    const ri = isKey ? rIn - thick * 0.08 : rIn;
    const ro = isKey ? rOut + thick * 0.16 : rOut;
    const d = isKey ? depth * 1.14 : depth;
    const poly: V2[] = [
      [Math.cos(a0) * ri, Math.sin(a0) * ri],
      [Math.cos(a0) * ro, Math.sin(a0) * ro],
      [Math.cos((a0 + a1) * 0.5) * ro, Math.sin((a0 + a1) * 0.5) * ro],
      [Math.cos(a1) * ro, Math.sin(a1) * ro],
      [Math.cos(a1) * ri, Math.sin(a1) * ri]
    ];
    slots.push({
      mesh: extrudePolygonMesh(poly, d, Math.min(thick, d) * 0.09, true),
      materialIndex: isKey ? opts.keystoneMat : i % 2 === 0 ? opts.stoneMatA : opts.stoneMatB
    });
  }

  return slots;
}

/**
 * Multi-puff stylized broadleaf / Ghibli foliage canopy (`9–14` smooth-shaded botanical leaf puffs
 * with crown-spherical upward-biased normals so sunlit foliage never shows dark faceted triangles).
 */
export function layeredCanopyMesh(opts: {
  readonly radius: number;
  readonly height: number;
  readonly puffs?: number;
  readonly seed?: number;
}): RawMesh {
  const r = Math.max(0.15, opts.radius);
  const h = Math.max(0.15, opts.height);
  const puffs = Math.max(7, Math.floor(opts.puffs ?? 11));
  const seed = opts.seed ?? 11;
  const parts: RawMesh[] = [];

  // Lush smooth central crown billow
  parts.push(
    transformMesh(icosphereSmoothMesh(r * 0.66, 2, 0.08, seed, 0.36), {
      pos: [0, h * 0.66, 0],
      scale: [1.14, (h / r) * 0.58, 1.14]
    })
  );

  // Staggered lower & mid perimeter botanical bough puffs
  const ringCount = puffs - 1;
  const lowerTotal = Math.ceil(ringCount * 0.6);
  const upperTotal = Math.max(1, ringCount - lowerTotal);
  for (let i = 0; i < ringCount; i += 1) {
    const tier = i < lowerTotal ? 0 : 1;
    const idxInTier = tier === 0 ? i : i - lowerTotal;
    const tierTotal = tier === 0 ? lowerTotal : upperTotal;
    const jitter = (hash01(seed * 31 + i * 17) - 0.5) * 0.42;
    const ang = (idxInTier / tierTotal) * Math.PI * 2 + tier * 0.58 + jitter;
    const dist = r * (tier === 0 ? 0.54 : 0.36) * (0.9 + hash01(seed * 47 + i * 13) * 0.2);
    const puffR = r * (tier === 0 ? 0.52 : 0.46) * (0.92 + hash01(seed * 59 + i * 7) * 0.18);
    const py = h * (tier === 0 ? 0.38 : 0.6) + (hash01(seed * 71 + i * 19) - 0.5) * h * 0.09;
    parts.push(
      transformMesh(icosphereSmoothMesh(puffR, 1, 0.09, seed + i * 23, 0.34), {
        pos: [Math.cos(ang) * dist, py, Math.sin(ang) * dist],
        rot: [0, ang, 0],
        scale: [1.2, 0.72, 1.14]
      })
    );
  }

  const merged = mergeRawMeshesToRaw(parts);
  // Blend local puff normals with crown-spherical + sunlit upward bias for cohesive botanical shading
  const crownY = h * 0.42;
  for (let i = 0; i < merged.positions.length; i += 3) {
    const outDir = norm3([
      merged.positions[i]!,
      merged.positions[i + 1]! - crownY + r * 0.35,
      merged.positions[i + 2]!
    ]);
    const blended = norm3([
      merged.normals[i]! * 0.52 + outDir[0] * 0.48,
      merged.normals[i + 1]! * 0.52 + (outDir[1] + 0.28) * 0.48,
      merged.normals[i + 2]! * 0.52 + outDir[2] * 0.48
    ]);
    merged.normals[i] = blended[0];
    merged.normals[i + 1] = blended[1];
    merged.normals[i + 2] = blended[2];
  }
  return merged;
}

/**
 * Stacked scalloped drooping conifer / pine bough tiers from `y = 0` to `y = height`
 * with smooth botanical normals (eliminates harsh dark faceted pine wedges).
 */
export function coniferBoughTierMesh(opts: {
  readonly baseRadius: number;
  readonly height: number;
  readonly tiers?: number;
  readonly seed?: number;
}): RawMesh {
  const baseR = Math.max(0.12, opts.baseRadius);
  const h = Math.max(0.25, opts.height);
  const tiers = Math.max(4, Math.floor(opts.tiers ?? 5));
  const seed = opts.seed ?? 29;
  const parts: RawMesh[] = [];

  for (let t = 0; t < tiers; t += 1) {
    const frac = t / tiers;
    const nextFrac = (t + 1) / tiers;
    const yBase = frac * h * 0.8;
    const yApex = Math.min(h, (frac * 0.76 + 0.36) * h);
    const tierR = baseR * (1 - frac * 0.7);
    const topR = t === tiers - 1 ? 0.015 : baseR * (1 - nextFrac * 0.8) * 0.4;
    const lobes = Math.max(7, 10 - Math.floor(frac * 3));
    const pts = lobes * 2;
    const phase = hash01(seed + t * 37) * Math.PI * 2;

    const ringSkirt: V3[] = [];
    const ringBot: V3[] = [];
    const ringMid: V3[] = [];
    const ringTop: V3[] = [];
    for (let i = 0; i < pts; i += 1) {
      const a = (i / pts) * Math.PI * 2 + phase;
      const isTip = i % 2 === 0;
      const scallop = isTip ? 1.08 : 0.78;
      const droop = isTip ? -h * 0.032 : h * 0.016;
      const r0 = tierR * scallop * (0.95 + hash01(seed * 19 + t * 41 + i * 7) * 0.1);
      const rSkirt = r0 * 0.86;
      const r1 = (tierR * 0.56 + topR * 0.44) * (isTip ? 0.98 : 0.86);
      ringSkirt.push([Math.cos(a) * rSkirt, yBase + droop - h * 0.018, Math.sin(a) * rSkirt]);
      ringBot.push([Math.cos(a) * r0, yBase + droop, Math.sin(a) * r0]);
      ringMid.push([Math.cos(a) * r1, (yBase + yApex) * 0.54, Math.sin(a) * r1]);
      ringTop.push([Math.cos(a) * Math.max(0.015, topR), yApex, Math.sin(a) * Math.max(0.015, topR)]);
    }
    parts.push(loftSectionsMesh([ringSkirt, ringBot, ringMid, ringTop], true, false));
  }

  const merged = mergeRawMeshesToRaw(parts);
  for (let i = 0; i < merged.normals.length; i += 3) {
    const n = norm3([merged.normals[i]!, merged.normals[i + 1]! + 0.32, merged.normals[i + 2]!]);
    merged.normals[i] = n[0];
    merged.normals[i + 1] = n[1];
    merged.normals[i + 2] = n[2];
  }
  return merged;
}

/**
 * Terraced, `fbm3`-faceted sedimentary cliff / mesa / coastal headland (`y in [0, height]`),
 * designed to pair directly with `material.strata(...)`.
 */
export function stratifiedCliffMesh(opts: {
  readonly radiusX: number;
  readonly radiusZ: number;
  readonly height: number;
  readonly terraces?: number;
  readonly seed?: number;
}): RawMesh {
  const rx = Math.max(0.2, opts.radiusX);
  const rz = Math.max(0.2, opts.radiusZ);
  const h = Math.max(0.2, opts.height);
  const terraces = Math.max(3, Math.floor(opts.terraces ?? 5));
  const seed = opts.seed ?? 17;
  const radialSegs = 16;

  const sections: V3[][] = [];
  const totalRings = terraces * 2;
  for (let rIdx = 0; rIdx <= totalRings; rIdx += 1) {
    const t = rIdx / totalRings;
    const stepIdx = Math.floor(rIdx / 2);
    const isLedgeTop = rIdx % 2 === 1 && rIdx < totalRings;
    const yFrac = isLedgeTop
      ? (stepIdx + 0.86) / terraces
      : Math.min(1, stepIdx / terraces + (rIdx === totalRings ? 0 : 0.04));
    const taper = 1 - Math.pow(t, 1.35) * 0.36 - (isLedgeTop ? 0.04 : 0);
    const ring: V3[] = [];
    for (let i = 0; i < radialSegs; i += 1) {
      const a = (i / radialSegs) * Math.PI * 2;
      const ca = Math.cos(a), sa = Math.sin(a);
      const n = fbm3(ca * 1.65 + 2.3, yFrac * 2.4, sa * 1.65 - 1.9, seed);
      const crag = 0.78 + n * 0.44;
      ring.push([
        ca * rx * taper * crag,
        yFrac * h,
        sa * rz * taper * crag
      ]);
    }
    sections.push(ring);
  }

  return loftSectionsMesh(sections, true, true);
}

// ---------------------------------------------------------------------------
// Spec & Multi-Material Node Assemblers (`geometry.define` / `geometry.multiMaterial`)
// ---------------------------------------------------------------------------

export function mergeRawMeshesToRaw(meshes: readonly RawMesh[]): RawMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  const hasAnyColors = meshes.some((m) => Boolean(m.colors && m.colors.length > 0));
  const colors: number[] | undefined = hasAnyColors ? [] : undefined;
  for (const m of meshes) {
    const vOff = positions.length / 3;
    const vCount = m.positions.length / 3;
    for (let i = 0; i < m.positions.length; i += 1) positions.push(m.positions[i]!);
    for (let i = 0; i < m.normals.length; i += 1) normals.push(m.normals[i]!);
    for (let i = 0; i < m.uvs.length; i += 1) uvs.push(m.uvs[i]!);
    if (colors) {
      if (m.colors && m.colors.length >= vCount * 4) {
        for (let i = 0; i < vCount * 4; i += 1) colors.push(m.colors[i]!);
      } else {
        for (let i = 0; i < vCount; i += 1) colors.push(1, 1, 1, 1);
      }
    }
    for (let i = 0; i < m.indices.length; i += 1) indices.push(m.indices[i]! + vOff);
  }
  const hasAnalyticNormals = meshes.some((m) => Boolean(m.analyticNormals));
  return {
    positions,
    normals,
    uvs,
    indices,
    ...(colors ? { colors } : {}),
    ...(hasAnalyticNormals ? { analyticNormals: true } : {})
  };
}

/** Radial resolution of the folk torso loft, collar, belt and neck (24 keeps silhouettes round at close crops). */
const FOLK_TORSO_RING = 24;

/**
 * Sculpted articulated human townsperson / spectator / caddie (`y = 0..height`, default `1.72 m`)
 * with tailored flared coat/jacket, scarf/collar, neck & head, hat/coiffed hair, two bent arms
 * with hands, two distinct legs, shoes, and optional satchel — eliminates "bowling-pin" pegs.
 */
export function articulatedFolkSlots(opts: {
  readonly height?: number;
  readonly coatMat: number;
  readonly trimMat: number;
  readonly skinMat: number;
  readonly hairHatMat: number;
  readonly trouserMat: number;
  readonly shoeMat?: number;
  readonly bagMat?: number;
  readonly wearingHat?: boolean;
  readonly seed?: number;
}): MultiMatSlot[] {
  const h = opts.height ?? 1.72;
  const s = h / 1.72;
  const seed = opts.seed ?? 7;
  const shoeMat = opts.shoeMat ?? opts.trouserMat;
  const slots: MultiMatSlot[] = [];

  // Two distinct legs + tailored shoes
  for (const side of [-1, 1] as const) {
    const lx = side * 0.095 * s;
    const stride = side * (hash01(seed * 13 + 3) - 0.5) * 0.07 * s;
    slots.push({
      mesh: tubeSweepMesh(
        [
          [lx, 0.07 * s, stride, 0.056 * s],
          [lx * 1.02, 0.42 * s, stride * 0.5, 0.068 * s],
          [lx * 0.96, 0.78 * s, 0, 0.078 * s]
        ],
        16
      ),
      materialIndex: opts.trouserMat
    });
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.095 * s, 0.075 * s, 0.21 * s, 0.024 * s), {
        pos: [lx, 0.038 * s, stride + 0.035 * s]
      }),
      materialIndex: shoeMat
    });
  }

  // Sculpted elliptical-lofted tailored coat / athletic jacket (`y = 0.62..1.34`)
  const mkTorsoRing = (y: number, rx: number, rz: number, zShift = 0): V3[] => {
    const ring: V3[] = [];
    for (let i = 0; i < FOLK_TORSO_RING; i += 1) {
      const a = (i / FOLK_TORSO_RING) * Math.PI * 2;
      ring.push([Math.cos(a) * rx * s, y * s, (Math.sin(a) * rz + zShift) * s]);
    }
    return ring;
  };
  slots.push({
    mesh: taubinSmoothMesh(loftSectionsMesh([
      mkTorsoRing(0.62, 0.21, 0.145, -0.01),
      mkTorsoRing(0.86, 0.175, 0.12, 0),
      mkTorsoRing(1.12, 0.205, 0.135, 0.008),
      mkTorsoRing(1.31, 0.225, 0.13, 0.005),
      mkTorsoRing(1.36, 0.13, 0.095, 0)
    ], true), 2),
    materialIndex: opts.coatMat
  });

  // Cozy scarf / collar ring + belt trim
  slots.push({
    mesh: transformMesh(latheMesh([[0.085 * s, 0], [0.135 * s, 0.025 * s], [0.132 * s, 0.075 * s], [0.09 * s, 0.095 * s]], FOLK_TORSO_RING), {
      pos: [0, 1.32 * s, 0.005 * s]
    }),
    materialIndex: opts.trimMat
  });
  slots.push({
    mesh: transformMesh(latheMesh([[0.176 * s, 0], [0.184 * s, 0.02 * s], [0.184 * s, 0.048 * s], [0.176 * s, 0.06 * s]], FOLK_TORSO_RING), {
      pos: [0, 0.87 * s, 0]
    }),
    materialIndex: opts.trimMat
  });

  // Two articulated bent arms (shoulder -> elbow -> cuff) + sculpted hands
  const leftSwing = (hash01(seed * 29 + 5) - 0.35) * 0.18;
  const rightSwing = (hash01(seed * 41 + 9) - 0.35) * 0.22;
  for (const side of [-1, 1] as const) {
    const swing = side < 0 ? leftSwing : rightSwing;
    const sx = side * 0.225 * s;
    const ex = side * 0.265 * s;
    const hx = side * 0.22 * s;
    const hz = (0.09 + swing * 0.45) * s;
    slots.push({
      mesh: tubeSweepMesh(
        [
          [sx, 1.29 * s, 0, 0.058 * s],
          [ex, 1.03 * s, swing * 0.15 * s, 0.052 * s],
          [hx, 0.83 * s, hz, 0.046 * s]
        ],
        14
      ),
      materialIndex: opts.coatMat
    });
    slots.push({
      mesh: transformMesh(icosphereSmoothMesh(0.042 * s, 2, 0.02, seed + side), {
        pos: [hx, 0.795 * s, hz + 0.015 * s],
        scale: [0.88, 1.08, 1.05]
      }),
      materialIndex: opts.skinMat
    });
  }

  // Sculpted neck + appealing stylized head with jaw taper, brow & nose bridge
  slots.push({
    mesh: transformMesh(latheMesh([[0.058 * s, 0], [0.052 * s, 0.095 * s], [0, 0.105 * s]], FOLK_TORSO_RING), {
      pos: [0, 1.38 * s, 0.005 * s]
    }),
    materialIndex: opts.skinMat
  });
  slots.push({
    mesh: transformMesh(sculptStylizedHeadMesh(0.112 * s, { jawTaper: 0.22, noseBridge: 0.16, seed: seed + 11 }), {
      pos: [0, 1.545 * s, 0.012 * s]
    }),
    materialIndex: opts.skinMat
  });

  // Brimmed fedora / trilby / wool cap OR sculpted hair crown
  if (opts.wearingHat ?? (hash01(seed * 53) > 0.42)) {
    slots.push({
      mesh: transformMesh(
        latheMesh(
          [
            [0.108 * s, 0],
            [0.185 * s, 0.008 * s],
            [0.182 * s, 0.024 * s],
            [0.116 * s, 0.032 * s],
            [0.108 * s, 0.115 * s],
            [0.075 * s, 0.138 * s],
            [0, 0.142 * s]
          ],
          18
        ),
        { pos: [0, 1.605 * s, 0.006 * s], rot: [-0.06, 0, (hash01(seed * 61) - 0.5) * 0.08] }
      ),
      materialIndex: opts.hairHatMat
    });
  } else {
    slots.push({
      mesh: transformMesh(icosphereSmoothMesh(0.118 * s, 2, 0.05, seed + 31), {
        pos: [0, 1.575 * s, -0.008 * s],
        scale: [0.96, 0.94, 1.04]
      }),
      materialIndex: opts.hairHatMat
    });
  }

  // Optional side satchel / briefcase
  if (opts.bagMat !== undefined) {
    slots.push({
      mesh: transformMesh(bevelBoxMesh(0.085 * s, 0.22 * s, 0.28 * s, 0.022 * s), {
        pos: [0.245 * s, 0.72 * s, 0.04 * s],
        rot: [0.05, 0, -0.08]
      }),
      materialIndex: opts.bagMat
    });
  }

  return slots;
}

// ---------------------------------------------------------------------------
// Linear-Space Vertex Coloring, Cavity AO, Smooth Subdivision & Sculpting
// ---------------------------------------------------------------------------

/** Converts an sRGB `[0, 1]` channel to linear light `[0, 1]`. */
export function srgbToLinearChannel(c01: number): number {
  const c = Math.max(0, Math.min(1, c01));
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

/** Parses `#rgb`, `#rrggbb`, or `#rrggbbaa` into linear-space `[r, g, b, a]`. */
export function srgbHexToLinearRgba(hex: string, alpha = 1): [number, number, number, number] {
  const clean = hex.trim().replace(/^#/, "");
  let r = 1, g = 1, b = 1, a = alpha;
  if (clean.length === 3) {
    r = parseInt(clean[0]! + clean[0]!, 16) / 255;
    g = parseInt(clean[1]! + clean[1]!, 16) / 255;
    b = parseInt(clean[2]! + clean[2]!, 16) / 255;
  } else if (clean.length === 6 || clean.length === 8) {
    r = parseInt(clean.slice(0, 2), 16) / 255;
    g = parseInt(clean.slice(2, 4), 16) / 255;
    b = parseInt(clean.slice(4, 6), 16) / 255;
    if (clean.length === 8) {
      a = (parseInt(clean.slice(6, 8), 16) / 255) * alpha;
    }
  }
  return [
    srgbToLinearChannel(Number.isFinite(r) ? r : 1),
    srgbToLinearChannel(Number.isFinite(g) ? g : 1),
    srgbToLinearChannel(Number.isFinite(b) ? b : 1),
    Math.max(0, Math.min(1, Number.isFinite(a) ? a : 1))
  ];
}

/** Paints or modulates per-vertex linear RGBA colors on a `RawMesh`. */
export function paintMeshColors(
  src: RawMesh,
  colorOrSampler: string | V3 | V4 | ((pos: V3, norm: V3, uv: V2, vertexIndex: number) => V3 | V4),
  multiplyExisting = true
): RawMesh {
  const vCount = Math.floor(src.positions.length / 3);
  const colors = new Array<number>(vCount * 4);
  const toRgba = (c: V3 | V4): V4 =>
    c.length === 3
      ? [srgbToLinearChannel(c[0]), srgbToLinearChannel(c[1]), srgbToLinearChannel(c[2]), 1]
      : [c[0], c[1], c[2], Number.isFinite(c[3]) ? c[3] : 1];
  const sampler = typeof colorOrSampler === "function" ? colorOrSampler : null;
  const constRgba: V4 | null =
    typeof colorOrSampler === "string"
      ? srgbHexToLinearRgba(colorOrSampler)
      : typeof colorOrSampler === "function"
        ? null
        : toRgba(colorOrSampler);

  for (let i = 0; i < vCount; i += 1) {
    const p3 = i * 3;
    const u2 = i * 2;
    const c4 = i * 4;
    const rgba = constRgba ?? toRgba(
      sampler!(
        [src.positions[p3]!, src.positions[p3 + 1]!, src.positions[p3 + 2]!],
        [src.normals[p3] ?? 0, src.normals[p3 + 1] ?? 1, src.normals[p3 + 2] ?? 0],
        [src.uvs[u2] ?? 0, src.uvs[u2 + 1] ?? 0],
        i
      )
    );
    if (multiplyExisting && src.colors && src.colors.length >= c4 + 4) {
      colors[c4] = src.colors[c4]! * rgba[0];
      colors[c4 + 1] = src.colors[c4 + 1]! * rgba[1];
      colors[c4 + 2] = src.colors[c4 + 2]! * rgba[2];
      colors[c4 + 3] = src.colors[c4 + 3]! * rgba[3];
    } else {
      colors[c4] = rgba[0];
      colors[c4 + 1] = rgba[1];
      colors[c4 + 2] = rgba[2];
      colors[c4 + 3] = rgba[3];
    }
  }
  return { ...src, colors };
}

/**
 * Bakes smooth crevice concavity + ground-hemisphere ambient occlusion into
 * linear-space vertex `colors` so sculpted meshes read with depth and contact grounding.
 */
export function bakeMeshCavityAO(src: RawMesh, strength = 0.2): RawMesh {
  const vCount = Math.floor(src.positions.length / 3);
  if (vCount === 0 || strength <= 0) return src;
  const clampedStrength = Math.max(0, Math.min(0.65, strength));

  let minY = Infinity, maxY = -Infinity;
  const weldMap = new Map<string, number>();
  const vertToWeld = new Int32Array(vCount);
  const weldPos: [number, number, number][] = [];
  for (let i = 0; i < vCount; i += 1) {
    const x = src.positions[i * 3]!;
    const y = src.positions[i * 3 + 1]!;
    const z = src.positions[i * 3 + 2]!;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
    const key = `${Math.round(x * 2000)}|${Math.round(y * 2000)}|${Math.round(z * 2000)}`;
    let w = weldMap.get(key);
    if (w === undefined) {
      w = weldPos.length;
      weldMap.set(key, w);
      weldPos.push([x, y, z]);
    }
    vertToWeld[i] = w;
  }

  const adj = Array.from({ length: weldPos.length }, () => new Set<number>());
  for (let i = 0; i < src.indices.length; i += 3) {
    const a = vertToWeld[src.indices[i]!]!;
    const b = vertToWeld[src.indices[i + 1]!]!;
    const c = vertToWeld[src.indices[i + 2]!]!;
    if (a !== b) { adj[a]!.add(b); adj[b]!.add(a); }
    if (b !== c) { adj[b]!.add(c); adj[c]!.add(b); }
    if (c !== a) { adj[c]!.add(a); adj[a]!.add(c); }
  }

  const spanY = Math.max(0.05, maxY - minY);
  const weldCount = weldPos.length;
  let weldConcavity = new Float32Array(weldCount);
  const weldNormalAccum: [number, number, number][] = Array.from({ length: weldCount }, () => [0, 0, 0]);
  for (let i = 0; i < vCount; i += 1) {
    const p3 = i * 3;
    const acc = weldNormalAccum[vertToWeld[i]!]!;
    acc[0] += src.normals[p3] ?? 0;
    acc[1] += src.normals[p3 + 1] ?? 1;
    acc[2] += src.normals[p3 + 2] ?? 0;
  }
  for (let w = 0; w < weldCount; w += 1) {
    const neighbors = adj[w]!;
    if (neighbors.size === 0) continue;
    const [px, py, pz] = weldPos[w]!;
    const nAcc = weldNormalAccum[w]!;
    const nl = Math.hypot(nAcc[0], nAcc[1], nAcc[2]) || 1;
    const nx = nAcc[0] / nl, ny = nAcc[1] / nl, nz = nAcc[2] / nl;
    let sx = 0, sy = 0, sz = 0, edgeSum = 0;
    for (const nb of neighbors) {
      const np = weldPos[nb]!;
      sx += np[0]; sy += np[1]; sz += np[2];
      edgeSum += Math.hypot(np[0] - px, np[1] - py, np[2] - pz);
    }
    const inv = 1 / neighbors.size;
    const dx = sx * inv - px;
    const dy = sy * inv - py;
    const dz = sz * inv - pz;
    const avgEdge = Math.max(1e-4, edgeSum * inv);
    // When neighbors sit in front of the vertex along its surface normal (`dot > 0`), the vertex sits in a concave pocket/fold.
    weldConcavity[w] = Math.max(0, Math.min(1, ((dx * nx + dy * ny + dz * nz) / avgEdge) * 1.25));
  }
  // Smooth discrete 1-ring concavity across 2 neighbor-averaging passes so triangulation rings never speckle vertex colors.
  for (let pass = 0; pass < 2; pass += 1) {
    const nextConcavity = new Float32Array(weldCount);
    for (let w = 0; w < weldCount; w += 1) {
      const neighbors = adj[w]!;
      if (neighbors.size === 0) {
        nextConcavity[w] = weldConcavity[w]!;
        continue;
      }
      let sum = 0;
      for (const nb of neighbors) sum += weldConcavity[nb]!;
      nextConcavity[w] = weldConcavity[w]! * 0.45 + (sum / neighbors.size) * 0.55;
    }
    weldConcavity = nextConcavity;
  }

  const colors = new Array<number>(vCount * 4);
  for (let i = 0; i < vCount; i += 1) {
    const p3 = i * 3;
    const c4 = i * 4;
    const py = src.positions[p3 + 1]!;
    const ny = src.normals[p3 + 1] ?? 1;
    const concavity = weldConcavity[vertToWeld[i]!]!;
    const groundBounce = Math.max(0, Math.min(0.42, (0.2 - ny) * 0.34));
    const baseContact = Math.max(0, Math.min(0.32, (1 - (py - minY) / (spanY * 0.45)) * 0.24));
    const occ = Math.max(0, Math.min(1, concavity * 0.58 + groundBounce + baseContact));
    const shade = 1 - clampedStrength * occ;
    const r0 = src.colors?.[c4] ?? 1;
    const g0 = src.colors?.[c4 + 1] ?? 1;
    const b0 = src.colors?.[c4 + 2] ?? 1;
    const a0 = src.colors?.[c4 + 3] ?? 1;
    colors[c4] = r0 * shade;
    colors[c4 + 1] = g0 * shade;
    colors[c4 + 2] = b0 * shade;
    colors[c4 + 3] = a0;
  }
  return { ...src, colors };
}

/**
 * Position-welded Loop-style smooth triangle subdivision (`iterations` clamped to `1..3`).
 * Turns low-poly cages into smooth organic heads, bodies, creatures, helmets, fairings, and foliage
 * while preserving UV/color seams and open boundary rims.
 */
export function subdivideSmoothMesh(src: RawMesh, iterations = 1, smoothWeight = 0.56): RawMesh {
  const passes = Math.max(0, Math.min(3, Math.floor(iterations)));
  if (passes === 0 || src.indices.length < 3) return src;
  const weight = Math.max(0, Math.min(1, smoothWeight));

  let cur = src;
  for (let pass = 0; pass < passes; pass += 1) {
    const vCount = Math.floor(cur.positions.length / 3);
    const hasColors = Boolean(cur.colors && cur.colors.length >= vCount * 4);

    // 1. Weld coincident 3D positions so seams deform together without cracking.
    const weldMap = new Map<string, number>();
    const vertToWeld = new Int32Array(vCount);
    const weldPos: [number, number, number][] = [];
    for (let i = 0; i < vCount; i += 1) {
      const x = cur.positions[i * 3]!;
      const y = cur.positions[i * 3 + 1]!;
      const z = cur.positions[i * 3 + 2]!;
      const key = `${Math.round(x * 10000)}|${Math.round(y * 10000)}|${Math.round(z * 10000)}`;
      let w = weldMap.get(key);
      if (w === undefined) {
        w = weldPos.length;
        weldMap.set(key, w);
        weldPos.push([x, y, z]);
      }
      vertToWeld[i] = w;
    }

    // 2. Collect welded edge opposite vertices & boundary adjacency for Loop weights.
    const wEdgeOpps = new Map<string, number[]>();
    const wNeighbors = Array.from({ length: weldPos.length }, () => new Set<number>());
    const wEdgeKey = (u: number, v: number): string => (u < v ? `${u}:${v}` : `${v}:${u}`);
    for (let i = 0; i < cur.indices.length; i += 3) {
      const wa = vertToWeld[cur.indices[i]!]!;
      const wb = vertToWeld[cur.indices[i + 1]!]!;
      const wc = vertToWeld[cur.indices[i + 2]!]!;
      if (wa === wb || wb === wc || wc === wa) continue;
      wNeighbors[wa]!.add(wb); wNeighbors[wa]!.add(wc);
      wNeighbors[wb]!.add(wa); wNeighbors[wb]!.add(wc);
      wNeighbors[wc]!.add(wa); wNeighbors[wc]!.add(wb);
      const reg = (u: number, v: number, opp: number): void => {
        const k = wEdgeKey(u, v);
        let list = wEdgeOpps.get(k);
        if (!list) wEdgeOpps.set(k, (list = []));
        list.push(opp);
      };
      reg(wa, wb, wc);
      reg(wb, wc, wa);
      reg(wc, wa, wb);
    }

    const wBoundaryNeighbors = Array.from({ length: weldPos.length }, () => [] as number[]);
    for (const [k, opps] of wEdgeOpps) {
      if (opps.length === 1) {
        const sep = k.indexOf(":");
        const u = Number(k.slice(0, sep));
        const v = Number(k.slice(sep + 1));
        wBoundaryNeighbors[u]!.push(v);
        wBoundaryNeighbors[v]!.push(u);
      }
    }

    // 3. Relax welded control vertices.
    const relaxedWeldPos: [number, number, number][] = new Array(weldPos.length);
    for (let w = 0; w < weldPos.length; w += 1) {
      const p = weldPos[w]!;
      const bnd = wBoundaryNeighbors[w]!;
      if (bnd.length >= 2) {
        const b0 = weldPos[bnd[0]!]!, b1 = weldPos[bnd[1]!]!;
        const tx = p[0] * 0.75 + (b0[0] + b1[0]) * 0.125;
        const ty = p[1] * 0.75 + (b0[1] + b1[1]) * 0.125;
        const tz = p[2] * 0.75 + (b0[2] + b1[2]) * 0.125;
        relaxedWeldPos[w] = lerp3(p, [tx, ty, tz], weight);
      } else if (bnd.length === 0 && wNeighbors[w]!.size >= 3) {
        const nbs = wNeighbors[w]!;
        let sx = 0, sy = 0, sz = 0;
        for (const nb of nbs) {
          const np = weldPos[nb]!;
          sx += np[0]; sy += np[1]; sz += np[2];
        }
        const k = nbs.size;
        const beta = k === 3 ? 3 / 16 : 3 / (8 * k);
        const factor = k * beta;
        const tx = p[0] * (1 - factor) + sx * beta;
        const ty = p[1] * (1 - factor) + sy * beta;
        const tz = p[2] * (1 - factor) + sz * beta;
        relaxedWeldPos[w] = lerp3(p, [tx, ty, tz], weight);
      } else {
        relaxedWeldPos[w] = [p[0], p[1], p[2]];
      }
    }

    // 4. Build subdivided vertex & index buffers, splitting each triangle into 4.
    const positions: number[] = new Array(vCount * 3);
    const uvs: number[] = cur.uvs.slice(0, vCount * 2);
    while (uvs.length < vCount * 2) uvs.push(0);
    const colors: number[] | undefined = hasColors ? cur.colors!.slice(0, vCount * 4) : undefined;
    for (let i = 0; i < vCount; i += 1) {
      const rp = relaxedWeldPos[vertToWeld[i]!]!;
      positions[i * 3] = rp[0];
      positions[i * 3 + 1] = rp[1];
      positions[i * 3 + 2] = rp[2];
    }

    const midCache = new Map<string, number>();
    const getMidpoint = (i0: number, i1: number): number => {
      const key = i0 < i1 ? `${i0}:${i1}` : `${i1}:${i0}`;
      const hit = midCache.get(key);
      if (hit !== undefined) return hit;

      const w0 = vertToWeld[i0]!, w1 = vertToWeld[i1]!;
      const p0 = weldPos[w0]!, p1 = weldPos[w1]!;
      let mx = (p0[0] + p1[0]) * 0.5;
      let my = (p0[1] + p1[1]) * 0.5;
      let mz = (p0[2] + p1[2]) * 0.5;
      if (w0 !== w1) {
        const opps = wEdgeOpps.get(wEdgeKey(w0, w1));
        if (opps && opps.length === 2) {
          const o0 = weldPos[opps[0]!]!, o1 = weldPos[opps[1]!]!;
          const lx = (p0[0] + p1[0]) * 0.375 + (o0[0] + o1[0]) * 0.125;
          const ly = (p0[1] + p1[1]) * 0.375 + (o0[1] + o1[1]) * 0.125;
          const lz = (p0[2] + p1[2]) * 0.375 + (o0[2] + o1[2]) * 0.125;
          mx = mx + (lx - mx) * weight;
          my = my + (ly - my) * weight;
          mz = mz + (lz - mz) * weight;
        }
      }

      const idx = positions.length / 3;
      positions.push(mx, my, mz);
      uvs.push(
        ((cur.uvs[i0 * 2] ?? 0) + (cur.uvs[i1 * 2] ?? 0)) * 0.5,
        ((cur.uvs[i0 * 2 + 1] ?? 0) + (cur.uvs[i1 * 2 + 1] ?? 0)) * 0.5
      );
      if (colors && cur.colors) {
        const c0 = i0 * 4, c1 = i1 * 4;
        colors.push(
          (cur.colors[c0]! + cur.colors[c1]!) * 0.5,
          (cur.colors[c0 + 1]! + cur.colors[c1 + 1]!) * 0.5,
          (cur.colors[c0 + 2]! + cur.colors[c1 + 2]!) * 0.5,
          (cur.colors[c0 + 3]! + cur.colors[c1 + 3]!) * 0.5
        );
      }
      midCache.set(key, idx);
      return idx;
    };

    const indices: number[] = [];
    for (let i = 0; i < cur.indices.length; i += 3) {
      const a = cur.indices[i]!;
      const b = cur.indices[i + 1]!;
      const c = cur.indices[i + 2]!;
      const ab = getMidpoint(a, b);
      const bc = getMidpoint(b, c);
      const ca = getMidpoint(c, a);
      indices.push(
        a, ab, ca,
        ab, b, bc,
        ca, bc, c,
        ab, bc, ca
      );
    }

    // 5. Recompute smooth area-weighted normals across welded positions.
    const newVCount = positions.length / 3;
    const nWeldMap = new Map<string, number>();
    const nVertToWeld = new Int32Array(newVCount);
    const accumNormals: [number, number, number][] = [];
    for (let i = 0; i < newVCount; i += 1) {
      const x = positions[i * 3]!, y = positions[i * 3 + 1]!, z = positions[i * 3 + 2]!;
      const key = `${Math.round(x * 10000)}|${Math.round(y * 10000)}|${Math.round(z * 10000)}`;
      let w = nWeldMap.get(key);
      if (w === undefined) {
        w = accumNormals.length;
        nWeldMap.set(key, w);
        accumNormals.push([0, 0, 0]);
      }
      nVertToWeld[i] = w;
    }
    for (let i = 0; i < indices.length; i += 3) {
      const i0 = indices[i]! * 3, i1 = indices[i + 1]! * 3, i2 = indices[i + 2]! * 3;
      const e1x = positions[i1]! - positions[i0]!;
      const e1y = positions[i1 + 1]! - positions[i0 + 1]!;
      const e1z = positions[i1 + 2]! - positions[i0 + 2]!;
      const e2x = positions[i2]! - positions[i0]!;
      const e2y = positions[i2 + 1]! - positions[i0 + 1]!;
      const e2z = positions[i2 + 2]! - positions[i0 + 2]!;
      const fnx = e1y * e2z - e1z * e2y;
      const fny = e1z * e2x - e1x * e2z;
      const fnz = e1x * e2y - e1y * e2x;
      for (let k = 0; k < 3; k += 1) {
        const acc = accumNormals[nVertToWeld[indices[i + k]!]!]!;
        acc[0] += fnx;
        acc[1] += fny;
        acc[2] += fnz;
      }
    }
    const normals = new Array<number>(newVCount * 3);
    for (let i = 0; i < newVCount; i += 1) {
      const acc = accumNormals[nVertToWeld[i]!]!;
      const nl = Math.hypot(acc[0], acc[1], acc[2]) || 1;
      normals[i * 3] = acc[0] / nl;
      normals[i * 3 + 1] = acc[1] / nl;
      normals[i * 3 + 2] = acc[2] / nl;
    }

    cur = { positions, normals, uvs, indices, ...(colors ? { colors } : {}) };
  }
  return cur;
}

/**
 * Sweeps an anatomical limb (`[x, y, z, radius]` control joints) along a smooth Catmull-Rom spine
 * with natural muscle-belly contour and smooth dome joint end-caps so bent joints never gap or need external sphere balls.
 */
export function sculptHumanoidLimbMesh(
  joints: readonly V4[],
  radialSegments = 14,
  muscleBulge = 0.14
): RawMesh {
  if (joints.length < 2) return tubeSweepMesh(joints, radialSegments, false);
  const pts3 = joints.map((j): V3 => [j[0], j[1], j[2]]);
  const spine = catmullRomSpline3(pts3, 5, false);
  const dense: V4[] = [];
  const startR = joints[0]![3];
  const endR = joints[joints.length - 1]![3];
  const startDir = norm3(sub3(spine[1] ?? pts3[1]!, spine[0]!));
  const endDir = norm3(sub3(spine[spine.length - 1]!, spine[spine.length - 2] ?? pts3[0]!));
  // Smooth two-ring dome cap so joints overlap naturally without exposed sphere balls
  dense.push([
    spine[0]![0] - startDir[0] * startR * 0.68,
    spine[0]![1] - startDir[1] * startR * 0.68,
    spine[0]![2] - startDir[2] * startR * 0.68,
    startR * 0.32
  ]);
  dense.push([
    spine[0]![0] - startDir[0] * startR * 0.34,
    spine[0]![1] - startDir[1] * startR * 0.34,
    spine[0]![2] - startDir[2] * startR * 0.34,
    startR * 0.78
  ]);
  for (let i = 0; i < spine.length; i += 1) {
    const t = spine.length > 1 ? i / (spine.length - 1) : 0;
    const fIdx = t * (joints.length - 1);
    const j0 = Math.min(joints.length - 1, Math.floor(fIdx));
    const j1 = Math.min(joints.length - 1, j0 + 1);
    const ft = fIdx - j0;
    const baseR = joints[j0]![3] + (joints[j1]![3] - joints[j0]![3]) * ft;
    const belly = 1 + muscleBulge * Math.sin(Math.PI * Math.min(1, Math.max(0, t * 1.12)));
    dense.push([spine[i]![0], spine[i]![1], spine[i]![2], baseR * belly]);
  }
  dense.push([
    spine[spine.length - 1]![0] + endDir[0] * endR * 0.34,
    spine[spine.length - 1]![1] + endDir[1] * endR * 0.34,
    spine[spine.length - 1]![2] + endDir[2] * endR * 0.34,
    endR * 0.78
  ]);
  dense.push([
    spine[spine.length - 1]![0] + endDir[0] * endR * 0.68,
    spine[spine.length - 1]![1] + endDir[1] * endR * 0.68,
    spine[spine.length - 1]![2] + endDir[2] * endR * 0.68,
    endR * 0.32
  ]);
  return tubeSweepMesh(dense, Math.max(10, radialSegments), false);
}

/** Returns a valid empty `RawMesh`. */
export function emptyMesh(): RawMesh {
  return { positions: [], normals: [], uvs: [], indices: [] };
}

/**
 * Deforms a `RawMesh` via a custom vertex mapper `(pos, norm, vertexIndex) => newPos`
 * and recomputes smooth welded area-weighted normals so organic sculpts shade seamlessly.
 */
export function deformMesh(
  src: RawMesh,
  mapper: (pos: V3, norm: V3, vertexIndex: number) => V3
): RawMesh {
  const vCount = Math.floor(src.positions.length / 3);
  if (vCount === 0) return src;
  const positions = new Array<number>(vCount * 3);
  for (let i = 0; i < vCount; i += 1) {
    const p3 = i * 3;
    const mapped = mapper(
      [src.positions[p3]!, src.positions[p3 + 1]!, src.positions[p3 + 2]!],
      [src.normals[p3] ?? 0, src.normals[p3 + 1] ?? 1, src.normals[p3 + 2] ?? 0],
      i
    );
    positions[p3] = mapped[0];
    positions[p3 + 1] = mapped[1];
    positions[p3 + 2] = mapped[2];
  }
  const weldMap = new Map<string, number>();
  const vertToWeld = new Int32Array(vCount);
  const accumNormals: [number, number, number][] = [];
  for (let i = 0; i < vCount; i += 1) {
    const x = positions[i * 3]!, y = positions[i * 3 + 1]!, z = positions[i * 3 + 2]!;
    const key = `${Math.round(x * 10000)}|${Math.round(y * 10000)}|${Math.round(z * 10000)}`;
    let w = weldMap.get(key);
    if (w === undefined) {
      w = accumNormals.length;
      weldMap.set(key, w);
      accumNormals.push([0, 0, 0]);
    }
    vertToWeld[i] = w;
  }
  for (let i = 0; i < src.indices.length; i += 3) {
    const i0 = src.indices[i]! * 3, i1 = src.indices[i + 1]! * 3, i2 = src.indices[i + 2]! * 3;
    const e1x = positions[i1]! - positions[i0]!;
    const e1y = positions[i1 + 1]! - positions[i0 + 1]!;
    const e1z = positions[i1 + 2]! - positions[i0 + 2]!;
    const e2x = positions[i2]! - positions[i0]!;
    const e2y = positions[i2 + 1]! - positions[i0 + 1]!;
    const e2z = positions[i2 + 2]! - positions[i0 + 2]!;
    const fnx = e1y * e2z - e1z * e2y;
    const fny = e1z * e2x - e1x * e2z;
    const fnz = e1x * e2y - e1y * e2x;
    for (let k = 0; k < 3; k += 1) {
      const acc = accumNormals[vertToWeld[src.indices[i + k]!]!]!;
      acc[0] += fnx;
      acc[1] += fny;
      acc[2] += fnz;
    }
  }
  const normals = new Array<number>(vCount * 3);
  for (let i = 0; i < vCount; i += 1) {
    const acc = accumNormals[vertToWeld[i]!]!;
    const nl = Math.hypot(acc[0], acc[1], acc[2]) || 1;
    normals[i * 3] = acc[0] / nl;
    normals[i * 3 + 1] = acc[1] / nl;
    normals[i * 3 + 2] = acc[2] / nl;
  }
  return {
    positions,
    normals,
    uvs: src.uvs.slice(),
    indices: src.indices.slice(),
    ...(src.colors ? { colors: src.colors.slice() } : {})
  };
}

/**
 * Lofts an asymmetric anatomical limb (quad/calf, deltoid/bicep, forearm) with distinct lateral `rx`
 * and anterior-posterior `rz` cross-sections plus calf/bicep peak bias (`peakT`), eliminating cylindrical "PVC-pipe" limbs.
 */
export function sculptAnatomicalLimbMesh(
  stations: readonly {
    readonly pos: V3;
    readonly rx: number;
    readonly rz: number;
    readonly zOffset?: number;
  }[],
  opts: {
    readonly ringPoints?: number;
    readonly capEnds?: boolean;
    readonly muscleBiasZ?: number;
    readonly peakT?: number;
  } = {}
): RawMesh {
  const ringPts = Math.max(12, Math.floor(opts.ringPoints ?? 16));
  const capEnds = opts.capEnds ?? true;
  const biasZ = opts.muscleBiasZ ?? 0;
  const peakT = opts.peakT ?? 0.38;
  if (stations.length < 2) return emptyMesh();

  const rings: V3[][] = [];
  const pushRing = (pos: V3, rx: number, rz: number, zOff: number): void => {
    const ring: V3[] = [];
    for (let i = 0; i < ringPts; i += 1) {
      const a = (i / ringPts) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // Slight flattened medial/lateral muscle plane (`|cos|^0.92`) for organic athletic silhouette
      const sx = Math.sign(ca) * Math.pow(Math.abs(ca), 0.92) * rx;
      const sz = Math.sign(sa) * Math.pow(Math.abs(sa), 0.94) * rz + zOff;
      ring.push([pos[0] + sx, pos[1], pos[2] + sz]);
    }
    rings.push(ring);
  };

  if (capEnds) {
    const s0 = stations[0]!;
    const s1 = stations[1]!;
    const dir = norm3(sub3(s1.pos, s0.pos));
    const capSpan = (s0.rx + s0.rz) * 0.32;
    pushRing(
      [s0.pos[0] - dir[0] * capSpan, s0.pos[1] - dir[1] * capSpan, s0.pos[2] - dir[2] * capSpan],
      s0.rx * 0.38,
      s0.rz * 0.38,
      (s0.zOffset ?? 0) * 0.5
    );
    pushRing(
      [s0.pos[0] - dir[0] * capSpan * 0.45, s0.pos[1] - dir[1] * capSpan * 0.45, s0.pos[2] - dir[2] * capSpan * 0.45],
      s0.rx * 0.82,
      s0.rz * 0.82,
      (s0.zOffset ?? 0) * 0.85
    );
  }

  for (let i = 0; i < stations.length; i += 1) {
    const st = stations[i]!;
    const t = stations.length > 1 ? i / (stations.length - 1) : 0;
    const bell = Math.exp(-Math.pow((t - peakT) / 0.32, 2));
    pushRing(st.pos, st.rx, st.rz, (st.zOffset ?? 0) + biasZ * bell);
  }

  if (capEnds) {
    const sn = stations[stations.length - 1]!;
    const sp = stations[stations.length - 2]!;
    const dir = norm3(sub3(sn.pos, sp.pos));
    const capSpan = (sn.rx + sn.rz) * 0.32;
    pushRing(
      [sn.pos[0] + dir[0] * capSpan * 0.45, sn.pos[1] + dir[1] * capSpan * 0.45, sn.pos[2] + dir[2] * capSpan * 0.45],
      sn.rx * 0.82,
      sn.rz * 0.82,
      (sn.zOffset ?? 0) * 0.85
    );
    pushRing(
      [sn.pos[0] + dir[0] * capSpan, sn.pos[1] + dir[1] * capSpan, sn.pos[2] + dir[2] * capSpan],
      sn.rx * 0.38,
      sn.rz * 0.38,
      (sn.zOffset ?? 0) * 0.5
    );
  }

  return taubinSmoothMesh(loftSectionsMesh(rings, true), 2, 0.44, -0.46);
}

// ---------------------------------------------------------------------------
// Organic Implicit SDF Surface-Nets, Taubin Fairing, Hair Locks & Garments
// ---------------------------------------------------------------------------

/** Recomputes smooth position-welded area-weighted vertex normals on `src`. */
export function recomputeSmoothWeldedNormals(src: RawMesh): RawMesh {
  const vCount = Math.floor(src.positions.length / 3);
  if (vCount === 0 || src.indices.length < 3) return src;
  const weldMap = new Map<string, number>();
  const vertToWeld = new Int32Array(vCount);
  const accumNormals: [number, number, number][] = [];
  for (let i = 0; i < vCount; i += 1) {
    const x = src.positions[i * 3]!, y = src.positions[i * 3 + 1]!, z = src.positions[i * 3 + 2]!;
    const key = `${Math.round(x * 10000)}|${Math.round(y * 10000)}|${Math.round(z * 10000)}`;
    let w = weldMap.get(key);
    if (w === undefined) {
      w = accumNormals.length;
      weldMap.set(key, w);
      accumNormals.push([0, 0, 0]);
    }
    vertToWeld[i] = w;
  }
  for (let i = 0; i < src.indices.length; i += 3) {
    const i0 = src.indices[i]! * 3, i1 = src.indices[i + 1]! * 3, i2 = src.indices[i + 2]! * 3;
    const e1x = src.positions[i1]! - src.positions[i0]!;
    const e1y = src.positions[i1 + 1]! - src.positions[i0 + 1]!;
    const e1z = src.positions[i1 + 2]! - src.positions[i0 + 2]!;
    const e2x = src.positions[i2]! - src.positions[i0]!;
    const e2y = src.positions[i2 + 1]! - src.positions[i0 + 1]!;
    const e2z = src.positions[i2 + 2]! - src.positions[i0 + 2]!;
    const fnx = e1y * e2z - e1z * e2y;
    const fny = e1z * e2x - e1x * e2z;
    const fnz = e1x * e2y - e1y * e2x;
    for (let k = 0; k < 3; k += 1) {
      const acc = accumNormals[vertToWeld[src.indices[i + k]!]!]!;
      acc[0] += fnx;
      acc[1] += fny;
      acc[2] += fnz;
    }
  }
  const normals = new Array<number>(vCount * 3);
  for (let i = 0; i < vCount; i += 1) {
    const acc = accumNormals[vertToWeld[i]!]!;
    const nl = Math.hypot(acc[0], acc[1], acc[2]) || 1;
    normals[i * 3] = acc[0] / nl;
    normals[i * 3 + 1] = acc[1] / nl;
    normals[i * 3 + 2] = acc[2] / nl;
  }
  return {
    positions: src.positions.slice(),
    normals,
    uvs: src.uvs.slice(),
    indices: src.indices.slice(),
    ...(src.colors ? { colors: src.colors.slice() } : {})
  };
}

/**
 * Volume-preserving Taubin (`lambda` shrink + `mu` inflate) surface fairing across welded vertices.
 * Eliminates concentric subdivision ripples, lathe ring ridges, and polygon creases without shrinking silhouettes.
 */
export function taubinSmoothMesh(
  src: RawMesh,
  iterations = 4,
  lambda = 0.48,
  mu = -0.505
): RawMesh {
  const passes = Math.max(0, Math.min(20, Math.floor(iterations)));
  const vCount = Math.floor(src.positions.length / 3);
  if (passes === 0 || vCount < 4 || src.indices.length < 3) return src;

  const weldMap = new Map<string, number>();
  const vertToWeld = new Int32Array(vCount);
  let weldPos: [number, number, number][] = [];
  for (let i = 0; i < vCount; i += 1) {
    const x = src.positions[i * 3]!, y = src.positions[i * 3 + 1]!, z = src.positions[i * 3 + 2]!;
    const key = `${Math.round(x * 10000)}|${Math.round(y * 10000)}|${Math.round(z * 10000)}`;
    let w = weldMap.get(key);
    if (w === undefined) {
      w = weldPos.length;
      weldMap.set(key, w);
      weldPos.push([x, y, z]);
    }
    vertToWeld[i] = w;
  }

  const wCount = weldPos.length;
  const edgeCounts = new Map<string, number>();
  const neighbors = Array.from({ length: wCount }, () => new Set<number>());
  const eKey = (u: number, v: number): string => (u < v ? `${u}:${v}` : `${v}:${u}`);
  for (let i = 0; i < src.indices.length; i += 3) {
    const a = vertToWeld[src.indices[i]!]!;
    const b = vertToWeld[src.indices[i + 1]!]!;
    const c = vertToWeld[src.indices[i + 2]!]!;
    if (a === b || b === c || c === a) continue;
    neighbors[a]!.add(b); neighbors[a]!.add(c);
    neighbors[b]!.add(a); neighbors[b]!.add(c);
    neighbors[c]!.add(a); neighbors[c]!.add(b);
    for (const [u, v] of [[a, b], [b, c], [c, a]] as const) {
      const k = eKey(u, v);
      edgeCounts.set(k, (edgeCounts.get(k) ?? 0) + 1);
    }
  }
  const isBoundary = new Uint8Array(wCount);
  for (const [k, cnt] of edgeCounts) {
    if (cnt === 1) {
      const sep = k.indexOf(":");
      isBoundary[Number(k.slice(0, sep))] = 1;
      isBoundary[Number(k.slice(sep + 1))] = 1;
    }
  }

  const stepLaplacian = (cur: [number, number, number][], factor: number): [number, number, number][] => {
    const next = new Array<[number, number, number]>(wCount);
    for (let w = 0; w < wCount; w += 1) {
      const p = cur[w]!;
      const nbs = neighbors[w]!;
      if (isBoundary[w] || nbs.size < 2) {
        next[w] = [p[0], p[1], p[2]];
        continue;
      }
      let sx = 0, sy = 0, sz = 0;
      for (const nb of nbs) {
        const np = cur[nb]!;
        sx += np[0]; sy += np[1]; sz += np[2];
      }
      const inv = 1 / nbs.size;
      next[w] = [
        p[0] + factor * (sx * inv - p[0]),
        p[1] + factor * (sy * inv - p[1]),
        p[2] + factor * (sz * inv - p[2])
      ];
    }
    return next;
  };

  for (let it = 0; it < passes; it += 1) {
    weldPos = stepLaplacian(weldPos, lambda);
    weldPos = stepLaplacian(weldPos, mu);
  }

  const positions = new Array<number>(vCount * 3);
  for (let i = 0; i < vCount; i += 1) {
    const wp = weldPos[vertToWeld[i]!]!;
    positions[i * 3] = wp[0];
    positions[i * 3 + 1] = wp[1];
    positions[i * 3 + 2] = wp[2];
  }
  return recomputeSmoothWeldedNormals({
    positions,
    normals: src.normals,
    uvs: src.uvs,
    indices: src.indices,
    ...(src.colors ? { colors: src.colors } : {})
  });
}

/** Polynomial smooth-minimum (`C^1` organic fillet) for implicit SDF sculpting. */
export function sminPoly(a: number, b: number, k: number): number {
  if (k <= 1e-6) return Math.min(a, b);
  const h = Math.max(0, Math.min(1, 0.5 + (0.5 * (b - a)) / k));
  return b * (1 - h) + a * h - k * h * (1 - h);
}

/** Polynomial smooth-maximum (`C^1` organic carving/subtraction) for implicit SDF sculpting. */
export function smaxPoly(a: number, b: number, k: number): number {
  return -sminPoly(-a, -b, k);
}

/** Approximate signed distance to an axis-aligned ellipsoid centered at `center` with semi-axes `radii`. */
export function sdfEllipsoid(p: V3, center: V3, radii: V3): number {
  const rx = Math.max(1e-4, radii[0]);
  const ry = Math.max(1e-4, radii[1]);
  const rz = Math.max(1e-4, radii[2]);
  const qx = (p[0] - center[0]) / rx;
  const qy = (p[1] - center[1]) / ry;
  const qz = (p[2] - center[2]) / rz;
  const k0 = Math.hypot(qx, qy, qz);
  if (k0 < 1e-6) return -Math.min(rx, ry, rz);
  const k1 = Math.hypot(qx / rx, qy / ry, qz / rz) || 1;
  return (k0 * (k0 - 1)) / k1;
}

/** Exact signed distance to a smoothly tapered capsule from `a` (radius `ra`) to `b` (radius `rb`). */
export function sdfTaperedCapsule(p: V3, a: V3, b: V3, ra: number, rb: number): number {
  const bax = b[0] - a[0], bay = b[1] - a[1], baz = b[2] - a[2];
  const pax = p[0] - a[0], pay = p[1] - a[1], paz = p[2] - a[2];
  const l2 = bax * bax + bay * bay + baz * baz;
  if (l2 < 1e-8) return Math.hypot(pax, pay, paz) - Math.max(ra, rb);
  const rba = rb - ra;
  const papa = pax * pax + pay * pay + paz * paz;
  const paba = (pax * bax + pay * bay + paz * baz) / l2;
  const x = Math.sqrt(Math.max(0, papa - paba * paba * l2));
  const cax = Math.max(0, x - (paba < 0.5 ? ra : rb));
  const cay = Math.abs(paba - 0.5) - 0.5;
  const k = rba * rba + l2;
  const f = Math.max(0, Math.min(1, (rba * (x - ra) + paba * l2) / k));
  const cbx = x - ra - f * rba;
  const cby = paba - f;
  const s = cbx < 0 && cay < 0 ? -1 : 1;
  return s * Math.sqrt(Math.max(0, Math.min(cax * cax + cay * cay * l2, cbx * cbx + cby * cby * l2)));
}

/**
 * Extracts a smooth, watertight, closed 2-manifold organic mesh from an implicit SDF (`evaluate(x, y, z) < 0` inside)
 * using dual Surface-Nets + volume-preserving Taubin fairing + analytic SDF gradient normals.
 * Ideal for Meshy-grade unified creature/mascot bodies where head, brow sockets, torso, and haunches blend seamlessly.
 */
export function sculptOrganicSdfMesh(opts: {
  readonly boundsMin: V3;
  readonly boundsMax: V3;
  readonly resolution?: number | readonly [number, number, number];
  readonly evaluate: (x: number, y: number, z: number) => number;
  readonly taubinIterations?: number;
  readonly projectToIso?: number;
}): RawMesh {
  const res = typeof opts.resolution === "number"
    ? [opts.resolution, opts.resolution, opts.resolution] as const
    : (opts.resolution ?? [32, 32, 32] as const);
  const nx = Math.max(8, Math.min(72, Math.floor(res[0])));
  const ny = Math.max(8, Math.min(72, Math.floor(res[1])));
  const nz = Math.max(8, Math.min(72, Math.floor(res[2])));

  const rawSpanX = Math.max(1e-3, opts.boundsMax[0] - opts.boundsMin[0]);
  const rawSpanY = Math.max(1e-3, opts.boundsMax[1] - opts.boundsMin[1]);
  const rawSpanZ = Math.max(1e-3, opts.boundsMax[2] - opts.boundsMin[2]);
  const dx = rawSpanX / (nx - 4);
  const dy = rawSpanY / (ny - 4);
  const dz = rawSpanZ / (nz - 4);
  const ox = opts.boundsMin[0] - 2 * dx;
  const oy = opts.boundsMin[1] - 2 * dy;
  const oz = opts.boundsMin[2] - 2 * dz;

  const gxCount = nx + 1;
  const gyCount = ny + 1;
  const gzCount = nz + 1;
  const strideY = gxCount;
  const strideZ = gxCount * gyCount;
  const field = new Float32Array(gxCount * gyCount * gzCount);
  const posThresh = Math.min(dx, dy, dz) * 0.5;

  for (let k = 0; k < gzCount; k += 1) {
    const z = oz + k * dz;
    const onZ = k === 0 || k === nz;
    for (let j = 0; j < gyCount; j += 1) {
      const y = oy + j * dy;
      const onYZ = onZ || j === 0 || j === ny;
      const rowBase = k * strideZ + j * strideY;
      for (let i = 0; i < gxCount; i += 1) {
        if (onYZ || i === 0 || i === nx) {
          field[rowBase + i] = posThresh;
        } else {
          field[rowBase + i] = opts.evaluate(ox + i * dx, y, z);
        }
      }
    }
  }

  // 12 cube edges as pairs of corner offsets [x0,y0,z0, x1,y1,z1]
  const CUBE_EDGES: readonly [number, number, number, number, number, number][] = [
    [0, 0, 0, 1, 0, 0], [0, 1, 0, 1, 1, 0], [0, 0, 1, 1, 0, 1], [0, 1, 1, 1, 1, 1],
    [0, 0, 0, 0, 1, 0], [1, 0, 0, 1, 1, 0], [0, 0, 1, 0, 1, 1], [1, 0, 1, 1, 1, 1],
    [0, 0, 0, 0, 0, 1], [1, 0, 0, 1, 0, 1], [0, 1, 0, 0, 1, 1], [1, 1, 0, 1, 1, 1]
  ];

  const cellVert = new Int32Array(nx * ny * nz).fill(-1);
  const cellIndex = (i: number, j: number, k: number): number => (k * ny + j) * nx + i;
  const positions: number[] = [];

  for (let k = 0; k < nz; k += 1) {
    for (let j = 0; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        let mask = 0;
        for (let cz = 0; cz < 2; cz += 1) {
          for (let cy = 0; cy < 2; cy += 1) {
            for (let cx = 0; cx < 2; cx += 1) {
              const bit = cx | (cy << 1) | (cz << 2);
              if (field[(k + cz) * strideZ + (j + cy) * strideY + (i + cx)]! < 0) {
                mask |= 1 << bit;
              }
            }
          }
        }
        if (mask === 0 || mask === 255) continue;
        let sx = 0, sy = 0, sz = 0, crossings = 0;
        for (const [ax, ay, az, bx, by, bz] of CUBE_EDGES) {
          const fa = field[(k + az) * strideZ + (j + ay) * strideY + (i + ax)]!;
          const fb = field[(k + bz) * strideZ + (j + by) * strideY + (i + bx)]!;
          if ((fa < 0) === (fb < 0)) continue;
          const t = fa / (fa - fb);
          sx += ox + (i + ax + (bx - ax) * t) * dx;
          sy += oy + (j + ay + (by - ay) * t) * dy;
          sz += oz + (k + az + (bz - az) * t) * dz;
          crossings += 1;
        }
        const vIdx = positions.length / 3;
        cellVert[cellIndex(i, j, k)] = vIdx;
        const inv = 1 / Math.max(1, crossings);
        positions.push(sx * inv, sy * inv, sz * inv);
      }
    }
  }

  if (positions.length === 0) return emptyMesh();

  const indices: number[] = [];
  const emitQuad = (c00: number, c10: number, c11: number, c01: number, flip: boolean): void => {
    if (c00 < 0 || c10 < 0 || c11 < 0 || c01 < 0) return;
    if (flip) {
      indices.push(c00, c01, c11, c00, c11, c10);
    } else {
      indices.push(c00, c10, c11, c00, c11, c01);
    }
  };

  // +X grid edges
  for (let k = 1; k < nz; k += 1) {
    for (let j = 1; j < ny; j += 1) {
      for (let i = 0; i < nx; i += 1) {
        const f0 = field[k * strideZ + j * strideY + i]!;
        const f1 = field[k * strideZ + j * strideY + (i + 1)]!;
        if ((f0 < 0) === (f1 < 0)) continue;
        emitQuad(
          cellVert[cellIndex(i, j - 1, k - 1)]!,
          cellVert[cellIndex(i, j, k - 1)]!,
          cellVert[cellIndex(i, j, k)]!,
          cellVert[cellIndex(i, j - 1, k)]!,
          f0 >= 0
        );
      }
    }
  }
  // +Y grid edges
  for (let k = 1; k < nz; k += 1) {
    for (let j = 0; j < ny; j += 1) {
      for (let i = 1; i < nx; i += 1) {
        const f0 = field[k * strideZ + j * strideY + i]!;
        const f1 = field[k * strideZ + (j + 1) * strideY + i]!;
        if ((f0 < 0) === (f1 < 0)) continue;
        emitQuad(
          cellVert[cellIndex(i - 1, j, k - 1)]!,
          cellVert[cellIndex(i - 1, j, k)]!,
          cellVert[cellIndex(i, j, k)]!,
          cellVert[cellIndex(i, j, k - 1)]!,
          f0 >= 0
        );
      }
    }
  }
  // +Z grid edges
  for (let k = 0; k < nz; k += 1) {
    for (let j = 1; j < ny; j += 1) {
      for (let i = 1; i < nx; i += 1) {
        const f0 = field[k * strideZ + j * strideY + i]!;
        const f1 = field[(k + 1) * strideZ + j * strideY + i]!;
        if ((f0 < 0) === (f1 < 0)) continue;
        emitQuad(
          cellVert[cellIndex(i - 1, j - 1, k)]!,
          cellVert[cellIndex(i, j - 1, k)]!,
          cellVert[cellIndex(i, j, k)]!,
          cellVert[cellIndex(i - 1, j, k)]!,
          f0 >= 0
        );
      }
    }
  }

  const vTotal = positions.length / 3;
  const cxMid = (opts.boundsMin[0] + opts.boundsMax[0]) * 0.5;
  const cyMid = (opts.boundsMin[1] + opts.boundsMax[1]) * 0.5;
  const czMid = (opts.boundsMin[2] + opts.boundsMax[2]) * 0.5;
  const uvs = new Array<number>(vTotal * 2);
  const dummyNormals = new Array<number>(vTotal * 3).fill(0);
  for (let i = 0; i < vTotal; i += 1) {
    const dir = norm3([positions[i * 3]! - cxMid, positions[i * 3 + 1]! - cyMid, positions[i * 3 + 2]! - czMid]);
    uvs[i * 2] = 0.5 + Math.atan2(dir[2], dir[0]) / (2 * Math.PI);
    uvs[i * 2 + 1] = 0.5 - Math.asin(Math.max(-1, Math.min(1, dir[1]))) / Math.PI;
    dummyNormals[i * 3 + 1] = 1;
  }

  let mesh: RawMesh = { positions, normals: dummyNormals, uvs, indices };
  const taubinPasses = Math.max(7, opts.taubinIterations ?? 7);
  mesh = taubinSmoothMesh(mesh, taubinPasses, 0.48, -0.503);

  const projStrength = opts.projectToIso === undefined ? 0.94 : Math.max(0, Math.min(1, opts.projectToIso));
  const minCell = Math.min(dx, dy, dz);
  const eps = minCell * 0.32;
  const evalGrad = (x: number, y: number, z: number): [number, number, number, number] => {
    const gx = opts.evaluate(x + eps, y, z) - opts.evaluate(x - eps, y, z);
    const gy = opts.evaluate(x, y + eps, z) - opts.evaluate(x, y - eps, z);
    const gz = opts.evaluate(x, y, z + eps) - opts.evaluate(x, y, z - eps);
    const gl = Math.hypot(gx, gy, gz) || 1;
    return [gx / gl, gy / gl, gz / gl, gl / (2 * eps)];
  };

  if (projStrength > 0) {
    // Build 1-ring adjacency on the Surface-Nets vertex graph (already 1 unique vertex per active cell!).
    const adj = Array.from({ length: vTotal }, () => new Set<number>());
    for (let i = 0; i < mesh.indices.length; i += 3) {
      const a = mesh.indices[i]!;
      const b = mesh.indices[i + 1]!;
      const c = mesh.indices[i + 2]!;
      if (a !== b && b !== c && c !== a) {
        adj[a]!.add(b); adj[a]!.add(c);
        adj[b]!.add(a); adj[b]!.add(c);
        adj[c]!.add(a); adj[c]!.add(b);
      }
    }

    let curPos = mesh.positions.slice();
    const maxStep = minCell * 0.55;
    // 5 coupled passes of tangential umbrella relaxation (`I - n⊗n`) + exact analytic Newton `f(p) = 0` projection:
    // slides vertices smoothly across voxel slice boundaries without shrinking volume, eliminating all marching-cubes terraces!
    for (let pass = 0; pass < 5; pass += 1) {
      const relaxed = curPos.slice();
      for (let i = 0; i < vTotal; i += 1) {
        const nbs = adj[i]!;
        if (nbs.size < 2) continue;
        const px = curPos[i * 3]!, py = curPos[i * 3 + 1]!, pz = curPos[i * 3 + 2]!;
        const [nxG, nyG, nzG] = evalGrad(px, py, pz);
        let sx = 0, sy = 0, sz = 0;
        for (const nb of nbs) {
          sx += curPos[nb * 3]!;
          sy += curPos[nb * 3 + 1]!;
          sz += curPos[nb * 3 + 2]!;
        }
        const inv = 1 / nbs.size;
        const ux = sx * inv - px;
        const uy = sy * inv - py;
        const uz = sz * inv - pz;
        const nDot = ux * nxG + uy * nyG + uz * nzG;
        const tx = ux - nDot * nxG;
        const ty = uy - nDot * nyG;
        const tz = uz - nDot * nzG;
        relaxed[i * 3] = px + tx * 0.52;
        relaxed[i * 3 + 1] = py + ty * 0.52;
        relaxed[i * 3 + 2] = pz + tz * 0.52;
      }
      for (let i = 0; i < vTotal; i += 1) {
        let px = relaxed[i * 3]!, py = relaxed[i * 3 + 1]!, pz = relaxed[i * 3 + 2]!;
        const fVal = opts.evaluate(px, py, pz);
        const [nxG, nyG, nzG, slope] = evalGrad(px, py, pz);
        const step = Math.max(-maxStep, Math.min(maxStep, (-fVal / Math.max(0.25, slope)) * projStrength));
        px += nxG * step;
        py += nyG * step;
        pz += nzG * step;
        relaxed[i * 3] = px;
        relaxed[i * 3 + 1] = py;
        relaxed[i * 3 + 2] = pz;
      }
      curPos = relaxed;
    }
    mesh = { ...mesh, positions: curPos };
  }

  // Use exact C^1 analytic SDF gradient normals so voxel-grid triangulation never imprints specular streaks!
  const finalNormals = new Array<number>(vTotal * 3);
  for (let i = 0; i < vTotal; i += 1) {
    const px = mesh.positions[i * 3]!, py = mesh.positions[i * 3 + 1]!, pz = mesh.positions[i * 3 + 2]!;
    const [gx, gy, gz, slope] = evalGrad(px, py, pz);
    const blended = slope > 1e-4
      ? norm3([gx, gy, gz])
      : norm3([mesh.normals[i * 3]!, mesh.normals[i * 3 + 1]!, mesh.normals[i * 3 + 2]!]);
    finalNormals[i * 3] = blended[0];
    finalNormals[i * 3 + 1] = blended[1];
    finalNormals[i * 3 + 2] = blended[2];
  }
  return { ...mesh, normals: finalNormals, analyticNormals: true };
}

/**
 * Sculpts a smooth, curved, crescent/teardrop stylized 3D hair lock or plume along a quadratic/Catmull-Rom arc
 * (`root -> mid -> tip`), eliminating rigid geometric cone-spikes on anime, martial-arts, and athletic heroes.
 */
export function sculptCurvedHairLockMesh(opts: {
  readonly root: V3;
  readonly mid: V3;
  readonly tip: V3;
  readonly width: number;
  readonly thickness?: number;
  readonly segments?: number;
  readonly radialSegments?: number;
}): RawMesh {
  const segs = Math.max(5, Math.floor(opts.segments ?? 9));
  const ringPts = Math.max(8, Math.floor(opts.radialSegments ?? 12));
  const wMax = Math.max(0.004, opts.width * 0.5);
  const tMax = Math.max(0.003, (opts.thickness ?? opts.width * 0.58) * 0.5);
  const spine = catmullRomSpline3([opts.root, opts.mid, opts.tip], Math.max(3, Math.ceil(segs / 2)), false);
  if (spine.length < 2) return emptyMesh();

  let refUp: V3 = [0, 1, 0];
  const rings: V3[][] = [];
  for (let j = 0; j < spine.length; j += 1) {
    const u = j / (spine.length - 1);
    const cur = spine[j]!;
    const prev = spine[Math.max(0, j - 1)]!;
    const next = spine[Math.min(spine.length - 1, j + 1)]!;
    const tang = norm3(sub3(next, prev));
    if (Math.abs(dot3(tang, refUp)) > 0.94) {
      refUp = Math.abs(tang[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0];
    }
    const side = norm3(cross3(refUp, tang));
    const binorm = norm3(cross3(tang, side));
    refUp = binorm;

    // Fuller root & mid-belly tapering smoothly to a soft rounded tip (`u = 1`)
    const env = u < 0.12
      ? 0.62 + (u / 0.12) * 0.38
      : Math.pow(Math.max(0.04, 1 - (u - 0.12) / 0.88), 0.78) * (1 + 0.18 * Math.sin(Math.PI * u));
    const rx = wMax * env;
    const ry = tMax * env;
    const ring: V3[] = [];
    for (let i = 0; i < ringPts; i += 1) {
      const a = (i / ringPts) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // Soft dorsal ridge (`sa > 0`) + tucked underside (`sa < 0`) for sculpted lock volume
      const localX = ca * rx;
      const localY = (sa >= 0 ? Math.pow(sa, 0.85) : -Math.pow(-sa, 1.15) * 0.72) * ry + ca * ca * ry * -0.14;
      ring.push([
        cur[0] + side[0] * localX + binorm[0] * localY,
        cur[1] + side[1] * localX + binorm[1] * localY,
        cur[2] + side[2] * localX + binorm[2] * localY
      ]);
    }
    rings.push(ring);
  }
  return taubinSmoothMesh(loftSectionsMesh(rings, true, false), 2, 0.42, -0.44);
}

/**
 * Lofts a smooth flowing garment (hooded cloak, martial-arts gi tunic, tailored jersey, flared skirt/shorts)
 * with soft organic cloth folds and Taubin surface fairing — eliminates stiff traffic-cone / cylinder clothing.
 */
export function sculptDrapedGarmentMesh(
  stations: readonly {
    readonly y: number;
    readonly rx: number;
    readonly rz: number;
    readonly x?: number;
    readonly z?: number;
    readonly folds?: number;
    readonly foldAmp?: number;
    readonly superellipseN?: number;
  }[],
  opts: {
    readonly ringPoints?: number;
    readonly capEnds?: boolean;
    readonly smoothPasses?: number;
  } = {}
): RawMesh {
  if (stations.length < 2) return emptyMesh();
  const ringPts = Math.max(14, Math.floor(opts.ringPoints ?? 24));
  const rings: V3[][] = stations.map((st) => {
    const nExp = 2 / Math.max(1.2, st.superellipseN ?? 2.15);
    const folds = Math.max(0, Math.floor(st.folds ?? 0));
    const foldAmp = st.foldAmp ?? 0;
    const cx = st.x ?? 0;
    const cz = st.z ?? 0;
    const ring: V3[] = [];
    for (let i = 0; i < ringPts; i += 1) {
      const a = (i / ringPts) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const pleat = folds > 0 ? 1 + foldAmp * Math.sin(a * folds + st.y * 2.2) : 1;
      const sx = Math.sign(ca) * Math.pow(Math.abs(ca), nExp) * st.rx * pleat;
      const sz = Math.sign(sa) * Math.pow(Math.abs(sa), nExp) * st.rz * pleat;
      ring.push([cx + sx, st.y, cz + sz]);
    }
    return ring;
  });
  const lofted = loftSectionsMesh(rings, opts.capEnds ?? true, false);
  const smoothPasses = opts.smoothPasses ?? 3;
  return smoothPasses > 0 ? taubinSmoothMesh(lofted, smoothPasses, 0.44, -0.46) : lofted;
}

/**
 * Sculpted stylized 3D character head (`+Z` forward, `+Y` up) with cranium fullness, cheekbones,
 * tapered jawline/chin, subtle brow ridge, and nose bridge — replaces raw egg/sphere heads.
 */
export function sculptStylizedHeadMesh(
  radius: number,
  opts: {
    readonly jawTaper?: number;
    readonly cheekFullness?: number;
    readonly noseBridge?: number;
    readonly browRidge?: number;
    readonly subdivisions?: 0 | 1 | 2;
    readonly seed?: number;
  } = {}
): RawMesh {
  const jawTaper = opts.jawTaper ?? 0.24;
  const cheek = opts.cheekFullness ?? 0.08;
  const nose = opts.noseBridge ?? 0.18;
  const brow = opts.browRidge ?? 0.09;
  const base = icosphereSmoothMesh(radius, opts.subdivisions ?? 2, 0, opts.seed ?? 17);
  const deformed = deformMesh(base, ([x, y, z]) => {
    const nx = x / Math.max(1e-5, radius);
    const ny = y / Math.max(1e-5, radius);
    const nz = z / Math.max(1e-5, radius);
    // Taper lower jaw (`ny < 0`), fuller cranium (`ny > 0.15`), defined chin (`ny < -0.45, nz > 0.25`)
    const lower = Math.max(0, -ny);
    const jawScaleX = 1 - jawTaper * Math.pow(lower, 1.25);
    const craniumX = ny > 0.1 ? 1 + 0.04 * Math.sin(Math.min(1, (ny - 0.1) / 0.9) * Math.PI) : 1;
    const cheekBump =
      cheek *
      Math.exp(-Math.pow((ny + 0.08) / 0.28, 2)) *
      Math.exp(-Math.pow((Math.abs(nx) - 0.62) / 0.32, 2)) *
      Math.max(0, nz + 0.2);
    const chinForward =
      nz > 0
        ? 0.09 * Math.exp(-Math.pow((ny + 0.72) / 0.24, 2)) * Math.exp(-Math.pow(nx / 0.36, 2))
        : 0;
    const browBump =
      nz > 0.2
        ? brow * Math.exp(-Math.pow((ny - 0.22) / 0.16, 2)) * Math.exp(-Math.pow(nx / 0.58, 2))
        : 0;
    const noseBump =
      nz > 0.35
        ? nose * Math.exp(-Math.pow((ny + 0.04) / 0.24, 2)) * Math.exp(-Math.pow(nx / 0.19, 2))
        : 0;
    const occiput = nz < -0.2 && ny > -0.15 ? 0.06 * Math.exp(-Math.pow((ny - 0.18) / 0.45, 2)) : 0;
    return [
      x * jawScaleX * craniumX + Math.sign(x) * cheekBump * radius * 0.45,
      y * 1.08,
      z * 0.98 + (chinForward + browBump + noseBump - occiput) * radius
    ];
  });
  return taubinSmoothMesh(deformed, 3, 0.44, -0.46);
}

/**
 * Lofts a smooth aerodynamic superellipse fuselage / cowling / hull along `Z` (`-length/2 .. +length/2`)
 * for sleek bikes, racers, pods, drones, hoverboards, and watercraft.
 */
export function sculptStreamlinedHullMesh(
  length: number,
  width: number,
  height: number,
  opts: {
    readonly noseSharpness?: number;
    readonly tailTaper?: number;
    readonly canopyBulge?: number;
    readonly undersideFlat?: number;
    readonly stations?: number;
    readonly ringPoints?: number;
  } = {}
): RawMesh {
  const noseSharp = opts.noseSharpness ?? 0.68;
  const tailTaper = opts.tailTaper ?? 0.42;
  const canopyBulge = opts.canopyBulge ?? 0.22;
  const underFlat = Math.max(0, Math.min(0.85, opts.undersideFlat ?? 0.45));
  const stations = Math.max(7, Math.floor(opts.stations ?? 13));
  const ringPts = Math.max(10, Math.floor(opts.ringPoints ?? 18));
  const halfL = length * 0.5;
  const halfW = width * 0.5;
  const halfH = height * 0.5;

  const rings: V3[][] = [];
  for (let s = 0; s < stations; s += 1) {
    const t = s / (stations - 1); // 0 = rear (-halfL), 1 = nose (+halfL)
    const z = -halfL + t * length;
    const edgePin = s === 0 || s === stations - 1;
    const foreEnv = Math.pow(Math.max(0.002, 1 - t), noseSharp * 0.72);
    const aftEnv = Math.pow(Math.max(0.002, t), tailTaper * 0.65);
    const env = edgePin ? 0.04 : Math.min(1.12, foreEnv * aftEnv * 2.15);
    const rx = Math.max(0.004, halfW * env);
    const ry = Math.max(0.004, halfH * env);
    const hump = canopyBulge * halfH * Math.exp(-(((t - 0.58) / 0.24) ** 2));
    const ring: V3[] = [];
    for (let i = 0; i < ringPts; i += 1) {
      const a = (i / ringPts) * Math.PI * 2;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const sx = Math.sign(ca) * Math.pow(Math.abs(ca), 0.86) * rx;
      let sy = Math.sign(sa) * Math.pow(Math.abs(sa), 0.88) * ry;
      if (sy < 0) sy *= 1 - underFlat * 0.55;
      else sy += hump * sa;
      ring.push([sx, sy, z]);
    }
    rings.push(ring);
  }
  return taubinSmoothMesh(loftSectionsMesh(rings, true), 2, 0.44, -0.46);
}

const sharedProceduralGeometryMemo = new Map<string, unknown>();

/** Process/page-level bounded cache (`<= 512` entries) so procedural models never rebuild across spawns or restarts. */
export function memoizeGeometry<T>(key: string, build: () => T): T {
  const existing = sharedProceduralGeometryMemo.get(key) as T | undefined;
  if (existing !== undefined) return existing;
  const built = build();
  if (sharedProceduralGeometryMemo.size >= 512) {
    const oldest = sharedProceduralGeometryMemo.keys().next().value;
    if (oldest !== undefined) sharedProceduralGeometryMemo.delete(oldest);
  }
  sharedProceduralGeometryMemo.set(key, built);
  return built;
}

export function computePositionsBounds(positions: Float32Array): { readonly min: [number, number, number]; readonly max: [number, number, number] } | undefined {
  if (positions.length < 3) return undefined;
  let minX = Infinity, minY = Infinity, minZ = Infinity;
  let maxX = -Infinity, maxY = -Infinity, maxZ = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i]!, y = positions[i + 1]!, z = positions[i + 2]!;
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (z < minZ) minZ = z;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
    if (z > maxZ) maxZ = z;
  }
  return { min: [minX, minY, minZ], max: [maxX, maxY, maxZ] };
}

/** Merges multiple `RawMesh` parts into a single indexed `AuraCustomGeometrySpec` with precomputed bounds. */
export function mergeRawMeshes(meshes: readonly RawMesh[]): AuraCustomGeometrySpec {
  let totalVerts = 0;
  let totalIdx = 0;
  let hasAnyColors = false;
  for (const p of meshes) {
    totalVerts += p.positions.length / 3;
    totalIdx += p.indices.length;
    if (p.colors && p.colors.length > 0) hasAnyColors = true;
  }
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const colors = hasAnyColors ? new Float32Array(totalVerts * 4) : undefined;
  const indices = totalVerts > 65535 ? new Uint32Array(totalIdx) : new Uint16Array(totalIdx);

  let vOff = 0;
  let iOff = 0;
  for (const p of meshes) {
    const vCount = p.positions.length / 3;
    positions.set(p.positions, vOff * 3);
    normals.set(p.normals, vOff * 3);
    uvs.set(p.uvs, vOff * 2);
    if (colors) {
      if (p.colors && p.colors.length >= vCount * 4) {
        colors.set(p.colors.slice(0, vCount * 4), vOff * 4);
      } else {
        colors.fill(1, vOff * 4, (vOff + vCount) * 4);
      }
    }
    for (let k = 0; k < p.indices.length; k += 1) {
      indices[iOff + k] = p.indices[k]! + vOff;
    }
    vOff += vCount;
    iOff += p.indices.length;
  }

  return geometry.define({
    positions,
    normals,
    uvs,
    ...(colors ? { colors } : {}),
    indices,
    bounds: computePositionsBounds(positions)
  });
}

/** Packs multi-material `MultiMatSlot[]` into a grouped `AuraCustomGeometrySpec` for `geometry.multiMaterial`. */
export function buildGroupedGeometrySpec(slots: readonly MultiMatSlot[]): AuraCustomGeometrySpec {
  const byMat = new Map<number, RawMesh[]>();
  let hasAnyColors = false;
  for (const s of slots) {
    if (s.mesh.positions.length === 0 || s.mesh.indices.length === 0) continue;
    if (s.mesh.colors && s.mesh.colors.length > 0) hasAnyColors = true;
    let list = byMat.get(s.materialIndex);
    if (!list) byMat.set(s.materialIndex, (list = []));
    list.push(s.mesh);
  }
  const sorted = [...byMat.entries()].sort(([a], [b]) => a - b);

  let totalVerts = 0;
  let totalIdx = 0;
  for (const [, list] of sorted) {
    for (const m of list) {
      totalVerts += m.positions.length / 3;
      totalIdx += m.indices.length;
    }
  }

  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const colors = hasAnyColors ? new Float32Array(totalVerts * 4) : undefined;
  const indices = totalVerts > 65535 ? new Uint32Array(totalIdx) : new Uint16Array(totalIdx);
  const groups: { start: number; count: number; materialIndex: number }[] = [];

  let vOff = 0;
  let iOff = 0;
  for (const [materialIndex, list] of sorted) {
    const start = iOff;
    for (const m of list) {
      const vCount = m.positions.length / 3;
      positions.set(m.positions, vOff * 3);
      normals.set(m.normals, vOff * 3);
      uvs.set(m.uvs, vOff * 2);
      if (colors) {
        if (m.colors && m.colors.length >= vCount * 4) {
          colors.set(m.colors.slice(0, vCount * 4), vOff * 4);
        } else {
          colors.fill(1, vOff * 4, (vOff + vCount) * 4);
        }
      }
      for (let k = 0; k < m.indices.length; k += 1) {
        indices[iOff + k] = m.indices[k]! + vOff;
      }
      vOff += vCount;
      iOff += m.indices.length;
    }
    groups.push({ start, count: iOff - start, materialIndex });
  }

  return geometry.define({
    positions,
    normals,
    uvs,
    ...(colors ? { colors } : {}),
    indices,
    groups,
    bounds: computePositionsBounds(positions)
  });
}

type PhysicalFinishBucket = "matte" | "coat" | "metallic-coat" | "polished-metal" | "brushed-metal";

const HEX_COLOR_RE = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function isAchromaticProceduralDetailMap(val: unknown): boolean {
  if (val === undefined) return true;
  if (!val || typeof val !== "object") return false;
  const rec = val as Record<string, unknown>;
  return rec.kind === "aura-procedural-texture" && rec.colorA === undefined && rec.colorB === undefined;
}

function classifyCoalesceableFinish(mat: AuraMaterialSpec | undefined): PhysicalFinishBucket | null {
  if (!mat) return null;
  const rec = mat as Record<string, unknown>;
  if (rec.kind !== undefined && rec.kind !== "standard" && rec.kind !== "physical") return null;
  if (rec.transparent === true) return null;
  if (typeof rec.opacity === "number" && rec.opacity < 0.999) return null;
  if (typeof rec.transmission === "number" && rec.transmission > 0) return null;
  if (typeof rec.emissiveIntensity === "number" && rec.emissiveIntensity > 0.001) return null;
  if (rec.emissive !== undefined) return null;
  if (rec.wireframe === true || rec.flatShading === true || rec.doubleSided === true || rec.side !== undefined) return null;
  if (rec.vertexColors === false || rec.custom !== undefined || rec.pbrMaps !== undefined) return null;
  if (
    rec.map !== undefined ||
    rec.metalnessMap !== undefined ||
    rec.aoMap !== undefined ||
    rec.emissiveMap !== undefined ||
    rec.alphaMap !== undefined
  ) {
    return null;
  }
  if (
    !isAchromaticProceduralDetailMap(rec.normal) ||
    !isAchromaticProceduralDetailMap(rec.normalMap) ||
    !isAchromaticProceduralDetailMap(rec.roughnessMap)
  ) {
    return null;
  }
  if (typeof mat.color !== "string" || !HEX_COLOR_RE.test(mat.color.trim())) return null;
  const metalness = typeof mat.metalness === "number" ? mat.metalness : (typeof rec.metallic === "number" ? rec.metallic : 0);
  const roughness = typeof mat.roughness === "number" ? mat.roughness : 0.5;
  const clearcoat = typeof rec.clearcoat === "number" ? rec.clearcoat : 0;
  if (metalness >= 0.45) {
    if (clearcoat >= 0.5) return "metallic-coat";
    return roughness <= 0.28 && rec.anisotropy === undefined ? "polished-metal" : "brushed-metal";
  }
  return clearcoat >= 0.25 || roughness <= 0.24 ? "coat" : "matte";
}

function coalesceMultiMaterialAssembly(
  slots: readonly MultiMatSlot[],
  materials: readonly AuraMaterialSpec[]
): { readonly slots: readonly MultiMatSlot[]; readonly materials: readonly AuraMaterialSpec[] } {
  const bucketMatIndices = new Map<PhysicalFinishBucket, Set<number>>();
  for (const s of slots) {
    if (s.mesh.positions.length === 0 || s.mesh.indices.length === 0) continue;
    const bucket = classifyCoalesceableFinish(materials[s.materialIndex]);
    if (!bucket) continue;
    let set = bucketMatIndices.get(bucket);
    if (!set) bucketMatIndices.set(bucket, (set = new Set<number>()));
    set.add(s.materialIndex);
  }

  const activeBuckets = new Set<PhysicalFinishBucket>();
  for (const [bucket, set] of bucketMatIndices) {
    if (set.size >= 2) activeBuckets.add(bucket);
  }
  if (activeBuckets.size === 0) {
    return { slots, materials };
  }

  const nextMaterials: AuraMaterialSpec[] = [];
  const passthroughRemap = new Map<number, number>();
  const bucketRemap = new Map<PhysicalFinishBucket, number>();
  const bucketAccum = new Map<
    PhysicalFinishBucket,
    {
      wSum: number;
      dominantWeight: number;
      dominantMat: AuraMaterialSpec;
      roughness: number;
      metalness: number;
      clearcoat: number;
      clearcoatRoughness: number;
      envMapIntensity: number;
    }
  >();

  for (const s of slots) {
    if (s.mesh.positions.length === 0 || s.mesh.indices.length === 0) continue;
    const mat = materials[s.materialIndex];
    const bucket = classifyCoalesceableFinish(mat);
    if (bucket && activeBuckets.has(bucket) && mat) {
      const rec = mat as Record<string, unknown>;
      const w = Math.max(1, s.mesh.positions.length / 3);
      let acc = bucketAccum.get(bucket);
      if (!acc) {
        acc = {
          wSum: 0,
          dominantWeight: 0,
          dominantMat: mat,
          roughness: 0,
          metalness: 0,
          clearcoat: 0,
          clearcoatRoughness: 0,
          envMapIntensity: 0
        };
        bucketAccum.set(bucket, acc);
      }
      if (w > acc.dominantWeight) {
        acc.dominantWeight = w;
        acc.dominantMat = mat;
      }
      const metalVal = typeof mat.metalness === "number" ? mat.metalness : (typeof rec.metallic === "number" ? rec.metallic : 0);
      acc.wSum += w;
      acc.roughness += (typeof mat.roughness === "number" ? mat.roughness : 0.5) * w;
      acc.metalness += metalVal * w;
      acc.clearcoat += (typeof rec.clearcoat === "number" ? rec.clearcoat : 0) * w;
      acc.clearcoatRoughness += (typeof rec.clearcoatRoughness === "number" ? rec.clearcoatRoughness : 0.12) * w;
      acc.envMapIntensity += (typeof rec.envMapIntensity === "number" ? rec.envMapIntensity : 0.85) * w;
    }
  }

  const outSlots: MultiMatSlot[] = [];
  for (const s of slots) {
    if (s.mesh.positions.length === 0 || s.mesh.indices.length === 0) continue;
    const mat = materials[s.materialIndex];
    const bucket = classifyCoalesceableFinish(mat);
    if (bucket && activeBuckets.has(bucket) && mat && typeof mat.color === "string") {
      let targetIdx = bucketRemap.get(bucket);
      if (targetIdx === undefined) {
        const acc = bucketAccum.get(bucket)!;
        const inv = 1 / Math.max(1, acc.wSum);
        const clearcoat = acc.clearcoat * inv;
        const metalAvg = Number((acc.metalness * inv).toFixed(3));
        const domRec = acc.dominantMat as Record<string, unknown>;
        targetIdx = nextMaterials.length;
        bucketRemap.set(bucket, targetIdx);
        nextMaterials.push({
          ...(typeof domRec.sheen === "number" ? { sheen: domRec.sheen } : {}),
          ...(typeof domRec.sheenRoughness === "number" ? { sheenRoughness: domRec.sheenRoughness } : {}),
          ...(typeof domRec.anisotropy === "number" ? { anisotropy: domRec.anisotropy } : {}),
          ...(typeof domRec.anisotropyRotation === "number" ? { anisotropyRotation: domRec.anisotropyRotation } : {}),
          color: "#ffffff",
          roughness: Number((acc.roughness * inv).toFixed(3)),
          metalness: metalAvg,
          metallic: metalAvg,
          envMapIntensity: Number((acc.envMapIntensity * inv).toFixed(3)),
          ...(clearcoat > 0.02
            ? {
                clearcoat: Number(clearcoat.toFixed(3)),
                clearcoatRoughness: Number((acc.clearcoatRoughness * inv).toFixed(3))
              }
            : {})
        } as AuraMaterialSpec);
      }
      const painted = bakeMeshCavityAO(paintMeshColors(s.mesh, mat.color, true), 0.14);
      outSlots.push({ mesh: painted, materialIndex: targetIdx });
    } else {
      let targetIdx = passthroughRemap.get(s.materialIndex);
      if (targetIdx === undefined) {
        targetIdx = nextMaterials.length;
        passthroughRemap.set(s.materialIndex, targetIdx);
        nextMaterials.push(mat ?? { kind: "standard", color: "#cccccc", roughness: 0.5, metalness: 0 });
      }
      outSlots.push({ mesh: s.mesh, materialIndex: targetIdx });
    }
  }

  return { slots: outSlots, materials: nextMaterials };
}

/** Assembles a complete `@aura3d/engine` `geometry.multiMaterial` node with optional runtime ID, tags, and visibility. */
export function assembleMultiMaterialNode(
  name: string,
  slots: readonly MultiMatSlot[],
  materials: readonly AuraMaterialSpec[],
  options: {
    readonly id?: string;
    readonly tags?: readonly string[];
    readonly position?: V3;
    readonly rotation?: V3;
    readonly scale?: number | V3;
    readonly castShadow?: boolean;
    readonly receiveShadow?: boolean;
    readonly visible?: boolean;
    readonly coalesceColors?: boolean;
  } = {}
): AuraNodeBuilder<AuraGroupNode> {
  const coalesced =
    options.coalesceColors === false ? { slots, materials } : coalesceMultiMaterialAssembly(slots, materials);
  const spec = buildGroupedGeometrySpec(coalesced.slots);
  let builder = geometry.multiMaterial(spec, coalesced.materials, {
    name,
    ...(options.position ? { position: options.position } : {}),
    ...(options.rotation ? { rotation: options.rotation } : {}),
    ...(options.scale !== undefined ? { scale: options.scale } : {}),
    castShadow: options.castShadow ?? true,
    receiveShadow: options.receiveShadow ?? true
  });
  if (options.id) {
    builder = builder.runtime({
      id: options.id,
      ...(options.tags ? { tags: [...options.tags] } : {})
    });
  }
  if (options.visible === false) {
    const Ctor = builder.constructor as typeof AuraNodeBuilder<AuraGroupNode>;
    return new Ctor({ ...builder.toJSON(), visible: false });
  }
  return builder;
}
