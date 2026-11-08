// Mesh builders: tapered tubes (branches, roots, ropes), lumpy leaf blobs and the grassy mound.
import { geometry } from "@aura3d/engine";
import { MOUND_HEIGHT, moundHeight, type Branch, type V3 } from "./tree";

export interface MeshAcc {
  pos: number[];
  nor: number[];
  col: number[];
  idx: number[];
  min: V3;
  max: V3;
}

export const newAcc = (): MeshAcc => ({ pos: [], nor: [], col: [], idx: [], min: [1e9, 1e9, 1e9], max: [-1e9, -1e9, -1e9] });

type RGB = [number, number, number];

const sub = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: V3, b: V3): V3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = (a: V3): V3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

function pushVertex(acc: MeshAcc, p: V3, n: V3, c: RGB): number {
  const i = acc.pos.length / 3;
  acc.pos.push(p[0], p[1], p[2]);
  acc.nor.push(n[0], n[1], n[2]);
  acc.col.push(c[0], c[1], c[2], 1);
  for (let k = 0; k < 3; k += 1) {
    acc.min[k] = Math.min(acc.min[k], p[k]);
    acc.max[k] = Math.max(acc.max[k], p[k]);
  }
  return i;
}

export interface TubeOptions {
  radial: number;
  bark: number; // ridge amplitude as a fraction of the radius
  phase: number;
  color: RGB;
  /** Optional colour at the far end (twigs fade lighter). */
  tipColor?: RGB;
  cap: boolean;
}

/** Appends a tapered tube along `pts` with per-point `radii`. */
export function addTube(acc: MeshAcc, pts: V3[], radii: number[], o: TubeOptions): void {
  const n = pts.length;
  const T: V3[] = pts.map((_, i) => norm(sub(pts[Math.min(i + 1, n - 1)], pts[Math.max(i - 1, 0)])));
  const ref: V3 = Math.abs(T[0][1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  const d0 = dot(ref, T[0]);
  let N: V3 = norm([ref[0] - T[0][0] * d0, ref[1] - T[0][1] * d0, ref[2] - T[0][2] * d0]);
  const first = acc.pos.length / 3;
  for (let i = 0; i < n; i += 1) {
    const d = dot(N, T[i]);
    N = norm([N[0] - T[i][0] * d, N[1] - T[i][1] * d, N[2] - T[i][2] * d]);
    const B = cross(T[i], N);
    const t = i / (n - 1);
    const base: RGB = o.tipColor
      ? [o.color[0] + (o.tipColor[0] - o.color[0]) * t, o.color[1] + (o.tipColor[1] - o.color[1]) * t, o.color[2] + (o.tipColor[2] - o.color[2]) * t]
      : o.color;
    for (let j = 0; j < o.radial; j += 1) {
      const a = (j / o.radial) * Math.PI * 2;
      const ridge = 0.5 * Math.sin(a * 3 + t * 5 + o.phase) + 0.5 * Math.sin(a * 7 - t * 9 + o.phase * 2);
      const m = 1 + o.bark * ridge;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      const radial: V3 = [N[0] * ca + B[0] * sa, N[1] * ca + B[1] * sa, N[2] * ca + B[2] * sa];
      const r = radii[i] * m;
      const shade = 1 + (m - 1) * 3;
      pushVertex(
        acc,
        [pts[i][0] + radial[0] * r, pts[i][1] + radial[1] * r, pts[i][2] + radial[2] * r],
        radial,
        [base[0] * shade, base[1] * shade, base[2] * shade]
      );
    }
  }
  for (let i = 0; i < n - 1; i += 1) {
    for (let j = 0; j < o.radial; j += 1) {
      const j2 = (j + 1) % o.radial;
      const a = first + i * o.radial + j;
      const b = first + i * o.radial + j2;
      const c = first + (i + 1) * o.radial + j;
      const d = first + (i + 1) * o.radial + j2;
      acc.idx.push(a, b, c, b, d, c);
    }
  }
  if (o.cap) {
    const e = pts[n - 1];
    const k = radii[n - 1] * 0.9;
    const tip = pushVertex(acc, [e[0] + T[n - 1][0] * k, e[1] + T[n - 1][1] * k, e[2] + T[n - 1][2] * k], T[n - 1], o.tipColor ?? o.color);
    const ring = first + (n - 1) * o.radial;
    for (let j = 0; j < o.radial; j += 1) acc.idx.push(ring + j, ring + ((j + 1) % o.radial), tip);
  }
}

export function addBranch(acc: MeshAcc, b: Branch, phase: number): void {
  const level = b.level;
  const isRoot = b.kind === "root";
  addTube(acc, b.pts, b.radii, {
    radial: b.kind === "trunk" ? 14 : isRoot ? 8 : level >= 3 ? 5 : level === 2 ? 6 : 9,
    bark: level <= 1 ? 0.05 : 0.02,
    phase,
    color: isRoot ? [0.27, 0.18, 0.11] : level === 0 ? [0.3, 0.2, 0.12] : level === 1 ? [0.33, 0.23, 0.14] : [0.37, 0.27, 0.17],
    tipColor: level >= 2 ? [0.42, 0.32, 0.2] : undefined,
    cap: !isRoot
  });
}

export function toGeometry(acc: MeshAcc) {
  return geometry.define({
    positions: new Float32Array(acc.pos),
    normals: new Float32Array(acc.nor),
    colors: new Float32Array(acc.col),
    indices: new Uint32Array(acc.idx),
    bounds: { min: acc.min, max: acc.max }
  });
}

/** Unit-radius lumpy blob used for every leaf clump (scaled and tinted per instance). */
export function leafBlobGeometry() {
  const lon = 16;
  const lat = 11;
  const positions: number[] = [];
  const indices: number[] = [];
  for (let i = 0; i <= lat; i += 1) {
    const th = (i / lat) * Math.PI;
    for (let j = 0; j < lon; j += 1) {
      const ph = (j / lon) * Math.PI * 2;
      const x = Math.sin(th) * Math.cos(ph);
      const y = Math.cos(th);
      const z = Math.sin(th) * Math.sin(ph);
      let r =
        1 +
        0.16 * Math.sin(2.7 * x + 0.5) * Math.sin(2.3 * y + 1.1) +
        0.12 * Math.sin(3.9 * z + 2.0) * Math.sin(3.3 * x) +
        0.07 * Math.sin(6 * y + 4 * z);
      if (y < 0) r *= 1 + 0.18 * y; // flatter underside
      positions.push(x * r, y * r, z * r);
    }
  }
  for (let i = 0; i < lat; i += 1) {
    for (let j = 0; j < lon; j += 1) {
      const j2 = (j + 1) % lon;
      const a = i * lon + j;
      const b = i * lon + j2;
      const c = (i + 1) * lon + j;
      const d = (i + 1) * lon + j2;
      indices.push(a, b, c, b, d, c);
    }
  }
  const pos = new Float32Array(positions);
  return geometry.define({
    positions: pos,
    normals: geometry.computeNormals({ positions: pos, indices }),
    indices: new Uint32Array(indices),
    bounds: { min: [-1.4, -1.2, -1.4], max: [1.4, 1.3, 1.4] }
  });
}

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const smooth = (a: number, b: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export const GROUND_COLOR: RGB = [0.2, 0.4, 0.11];

/** The grassy mound: a vertex-coloured heightfield that fades into the flat ground colour. */
export function moundGeometry() {
  const CELLS = 130;
  const SIZE = 26;
  const count = (CELLS + 1) * (CELLS + 1);
  const positions = new Float32Array(count * 3);
  const normals = new Float32Array(count * 3);
  const colors = new Float32Array(count * 4);
  const indices: number[] = [];
  const grassA: RGB = [0.22, 0.43, 0.12];
  const grassB: RGB = [0.34, 0.54, 0.15];
  const dirt: RGB = [0.24, 0.17, 0.1];
  for (let j = 0; j <= CELLS; j += 1) {
    for (let i = 0; i <= CELLS; i += 1) {
      const v = j * (CELLS + 1) + i;
      const x = (i / CELLS - 0.5) * SIZE;
      const z = (j / CELLS - 0.5) * SIZE;
      const h = moundHeight(x, z);
      positions.set([x, h, z], v * 3);
      const e = 0.15;
      const nx = moundHeight(x - e, z) - moundHeight(x + e, z);
      const nz = moundHeight(x, z - e) - moundHeight(x, z + e);
      const l = Math.hypot(nx, 2 * e, nz);
      normals.set([nx / l, (2 * e) / l, nz / l], v * 3);
      const r = Math.hypot(x, z);
      const patch = 0.5 + 0.5 * Math.sin(x * 1.7 + Math.sin(z * 2.3)) * Math.sin(z * 1.3 + Math.cos(x * 1.9));
      let c = mix(grassA, grassB, patch * 0.7 + (h / MOUND_HEIGHT) * 0.3);
      c = mix(c, dirt, 1 - smooth(0.9, 1.9, r));
      c = mix(c, GROUND_COLOR, smooth(6.5, 10, r));
      colors.set([c[0], c[1], c[2], 1], v * 4);
      if (i < CELLS && j < CELLS) indices.push(v, v + CELLS + 1, v + 1, v + 1, v + CELLS + 1, v + CELLS + 2);
    }
  }
  return geometry.define({
    positions,
    normals,
    colors,
    indices: new Uint32Array(indices),
    bounds: { min: [-SIZE / 2, -0.2, -SIZE / 2], max: [SIZE / 2, MOUND_HEIGHT + 0.3, SIZE / 2] }
  });
}

/** Large flat quad in the ground colour that continues the mound to the horizon. */
export function farGroundGeometry() {
  const S = 300;
  const y = -0.02;
  const c = [GROUND_COLOR[0], GROUND_COLOR[1], GROUND_COLOR[2], 1];
  return geometry.define({
    positions: new Float32Array([-S, y, -S, S, y, -S, -S, y, S, S, y, S]),
    normals: new Float32Array([0, 1, 0, 0, 1, 0, 0, 1, 0, 0, 1, 0]),
    colors: new Float32Array([...c, ...c, ...c, ...c]),
    indices: new Uint32Array([0, 2, 1, 1, 2, 3]),
    bounds: { min: [-S, y - 0.1, -S], max: [S, y + 0.1, S] }
  });
}
