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
  type AuraGroupNode,
  type AuraMaterialSpec,
  type AuraNodeBuilder
} from "@aura3d/engine";

export type V2 = readonly [number, number];
export type V3 = readonly [number, number, number];
export type V4 = readonly [number, number, number, number];

export interface RawMesh {
  readonly positions: number[];
  readonly normals: number[];
  readonly uvs: number[];
  readonly indices: number[];
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
  return { positions, normals, uvs: src.uvs.slice(), indices };
}

/** Splits shared vertices into crisp per-triangle flat normals. */
export function toFlatShaded(src: RawMesh): RawMesh {
  const positions: number[] = [];
  const normals: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
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
    indices.push(base, base + 1, base + 2);
  }
  return { positions, normals, uvs, indices };
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
  for (const m of meshes) {
    const vOff = positions.length / 3;
    for (let i = 0; i < m.positions.length; i += 1) positions.push(m.positions[i]!);
    for (let i = 0; i < m.normals.length; i += 1) normals.push(m.normals[i]!);
    for (let i = 0; i < m.uvs.length; i += 1) uvs.push(m.uvs[i]!);
    for (let i = 0; i < m.indices.length; i += 1) indices.push(m.indices[i]! + vOff);
  }
  return { positions, normals, uvs, indices };
}

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
        10
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
    for (let i = 0; i < 14; i += 1) {
      const a = (i / 14) * Math.PI * 2;
      ring.push([Math.cos(a) * rx * s, y * s, (Math.sin(a) * rz + zShift) * s]);
    }
    return ring;
  };
  slots.push({
    mesh: loftSectionsMesh([
      mkTorsoRing(0.62, 0.21, 0.145, -0.01),
      mkTorsoRing(0.86, 0.175, 0.12, 0),
      mkTorsoRing(1.12, 0.205, 0.135, 0.008),
      mkTorsoRing(1.31, 0.225, 0.13, 0.005),
      mkTorsoRing(1.36, 0.13, 0.095, 0)
    ], true),
    materialIndex: opts.coatMat
  });

  // Cozy scarf / collar ring + belt trim
  slots.push({
    mesh: transformMesh(latheMesh([[0.085 * s, 0], [0.135 * s, 0.025 * s], [0.132 * s, 0.075 * s], [0.09 * s, 0.095 * s]], 14), {
      pos: [0, 1.32 * s, 0.005 * s]
    }),
    materialIndex: opts.trimMat
  });
  slots.push({
    mesh: transformMesh(latheMesh([[0.176 * s, 0], [0.184 * s, 0.02 * s], [0.184 * s, 0.048 * s], [0.176 * s, 0.06 * s]], 14), {
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
        9
      ),
      materialIndex: opts.coatMat
    });
    slots.push({
      mesh: transformMesh(icosphereSmoothMesh(0.042 * s, 1, 0.03, seed + side), {
        pos: [hx, 0.795 * s, hz + 0.015 * s],
        scale: [0.88, 1.08, 1.05]
      }),
      materialIndex: opts.skinMat
    });
  }

  // Sculpted neck + smooth organic head
  slots.push({
    mesh: transformMesh(latheMesh([[0.056 * s, 0], [0.052 * s, 0.09 * s], [0, 0.1 * s]], 12), {
      pos: [0, 1.38 * s, 0.005 * s]
    }),
    materialIndex: opts.skinMat
  });
  slots.push({
    mesh: transformMesh(icosphereSmoothMesh(0.112 * s, 2, 0.02, seed + 11), {
      pos: [0, 1.545 * s, 0.012 * s],
      scale: [0.92, 1.08, 0.98]
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
  for (const p of meshes) {
    totalVerts += p.positions.length / 3;
    totalIdx += p.indices.length;
  }
  const positions = new Float32Array(totalVerts * 3);
  const normals = new Float32Array(totalVerts * 3);
  const uvs = new Float32Array(totalVerts * 2);
  const indices = totalVerts > 65535 ? new Uint32Array(totalIdx) : new Uint16Array(totalIdx);

  let vOff = 0;
  let iOff = 0;
  for (const p of meshes) {
    positions.set(p.positions, vOff * 3);
    normals.set(p.normals, vOff * 3);
    uvs.set(p.uvs, vOff * 2);
    for (let k = 0; k < p.indices.length; k += 1) {
      indices[iOff + k] = p.indices[k]! + vOff;
    }
    vOff += p.positions.length / 3;
    iOff += p.indices.length;
  }

  return geometry.define({
    positions,
    normals,
    uvs,
    indices,
    bounds: computePositionsBounds(positions)
  });
}

/** Packs multi-material `MultiMatSlot[]` into a grouped `AuraCustomGeometrySpec` for `geometry.multiMaterial`. */
export function buildGroupedGeometrySpec(slots: readonly MultiMatSlot[]): AuraCustomGeometrySpec {
  const byMat = new Map<number, RawMesh[]>();
  for (const s of slots) {
    if (s.mesh.positions.length === 0 || s.mesh.indices.length === 0) continue;
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
  const indices = totalVerts > 65535 ? new Uint32Array(totalIdx) : new Uint16Array(totalIdx);
  const groups: { start: number; count: number; materialIndex: number }[] = [];

  let vOff = 0;
  let iOff = 0;
  for (const [materialIndex, list] of sorted) {
    const start = iOff;
    for (const m of list) {
      positions.set(m.positions, vOff * 3);
      normals.set(m.normals, vOff * 3);
      uvs.set(m.uvs, vOff * 2);
      for (let k = 0; k < m.indices.length; k += 1) {
        indices[iOff + k] = m.indices[k]! + vOff;
      }
      vOff += m.positions.length / 3;
      iOff += m.indices.length;
    }
    groups.push({ start, count: iOff - start, materialIndex });
  }

  return geometry.define({
    positions,
    normals,
    uvs,
    indices,
    groups,
    bounds: computePositionsBounds(positions)
  });
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
  } = {}
): AuraNodeBuilder<AuraGroupNode> {
  const spec = buildGroupedGeometrySpec(slots);
  let builder = geometry.multiMaterial(spec, materials, {
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
