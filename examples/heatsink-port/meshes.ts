/**
 * Pure mesh generators for the HEATSINK port: road ribbon (with split-lane heights), divider walls, rock and crystal
 * props, checkpoint veils, boost pads. Output is plain arrays so a unit test can check counts, bounds and winding
 * without a GPU. Every vertex position comes from the same `Track` the simulation drives.
 */
import { seededRandom } from "./rng";
import type { Frame, Track } from "./track";

export interface MeshData {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  attrs: Record<string, number[]>;
}

export const emptyMesh = (attrNames: readonly string[] = []): MeshData => ({ positions: [], normals: [], uvs: [], indices: [], attrs: Object.fromEntries(attrNames.map((n) => [n, [] as number[]])) });

export const hexLinear = (hex: string): [number, number, number] => {
  const n = Number.parseInt(hex.replace("#", ""), 16);
  const lin = (c: number): number => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  return [lin(((n >> 16) & 255) / 255), lin(((n >> 8) & 255) / 255), lin((n & 255) / 255)];
};

const sub = (a: readonly number[], b: readonly number[]): [number, number, number] => [a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!];
const crossV = (a: readonly number[], b: readonly number[]): [number, number, number] => [a[1]! * b[2]! - a[2]! * b[1]!, a[2]! * b[0]! - a[0]! * b[2]!, a[0]! * b[1]! - a[1]! * b[0]!];
const unit = (a: readonly number[]): [number, number, number] => {
  const l = Math.hypot(a[0]!, a[1]!, a[2]!) || 1;
  return [a[0]! / l, a[1]! / l, a[2]! / l];
};

/** Road ribbon: `columns` verts across the (split-widened) width, one row per `spacing` metres, closed loop. */
export function buildRoad(track: Track, spacing = 3, columns = 17): MeshData {
  const rows = Math.ceil(track.length / spacing);
  const ds = track.length / rows;
  const m = emptyMesh(["roadColor", "roadUv"]);
  const grid: number[][] = [];
  const f: Partial<Frame> = {};
  for (let i = 0; i <= rows; i++) {
    const s = i * ds;
    const fr = track.frame(s, f);
    const color = hexLinear(fr.sec.hud.color);
    for (let j = 0; j < columns; j++) {
      const u = -1 + (2 * j) / (columns - 1);
      const lat = u * fr.hw;
      const y = fr.y + track.latY(s, lat);
      const idx = i * columns + j;
      grid[idx] = [fr.x + fr.rx * lat, y, fr.z + fr.rz * lat];
      m.positions.push(grid[idx]![0]!, y, grid[idx]![2]!);
      m.uvs.push(j / (columns - 1), s / 40);
      m.attrs.roadColor!.push(color[0], color[1], color[2]);
      m.attrs.roadUv!.push(u, s);
    }
  }
  for (let i = 0; i <= rows; i++) {
    for (let j = 0; j < columns; j++) {
      const a = grid[Math.max(0, i - 1) * columns + j]!;
      const b = grid[Math.min(rows, i + 1) * columns + j]!;
      const l = grid[i * columns + Math.max(0, j - 1)]!;
      const r = grid[i * columns + Math.min(columns - 1, j + 1)]!;
      const n = unit(crossV(sub(r, l), sub(b, a)));
      m.normals.push(n[0], n[1], n[2]);
    }
  }
  for (let i = 0; i < rows; i++) {
    for (let j = 0; j < columns - 1; j++) {
      const a = i * columns + j, b = a + 1, c = a + columns, d = c + 1;
      m.indices.push(a, c, b, b, c, d);
    }
  }
  return m;
}

/** Median walls of the two split sections: two vertical faces and a lid between `-divider` and `+divider`. */
export function buildDividers(track: Track, spacing = 3, height = 3): MeshData {
  const m = emptyMesh();
  const rows = Math.ceil(track.length / spacing);
  const ds = track.length / rows;
  const f: Partial<Frame> = {};
  const g: Partial<Frame> = {};
  const quad = (p: number[][], n: [number, number, number]): void => {
    const base = m.positions.length / 3;
    for (const v of p) { m.positions.push(v[0]!, v[1]!, v[2]!); m.normals.push(n[0], n[1], n[2]); m.uvs.push(0, 0); }
    m.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
  };
  for (let i = 0; i < rows; i++) {
    const s0 = i * ds, s1 = (i + 1) * ds;
    const d0 = track.dividerAt(s0), d1 = track.dividerAt(s1);
    if (d0 <= 0 || d1 <= 0) continue;
    const a = track.frame(s0, f), b = track.frame(s1, g);
    const P = (fr: Frame, lat: number, up: number): number[] => [fr.x + fr.rx * lat, fr.y + track.latY(fr.s, lat) + up, fr.z + fr.rz * lat];
    quad([P(a, -d0, 0), P(b, -d1, 0), P(b, -d1, height), P(a, -d0, height)], [Math.sign(a.rx) * -1 || -1, 0, 0]);
    quad([P(a, d0, 0), P(a, d0, height), P(b, d1, height), P(b, d1, 0)], [1, 0, 0]);
    quad([P(a, -d0, height), P(b, -d1, height), P(b, d1, height), P(a, d0, height)], [0, 1, 0]);
  }
  return m;
}

/** Faceted hexagonal spire (tapered prism). Smooth per-face normals are baked into split vertices. */
function spire(m: MeshData, cx: number, baseY: number, cz: number, radius: number, height: number, taper: number, twist: number, sides = 6): void {
  const ring = (y: number, r: number, k: number): [number, number, number] => [cx + Math.cos(((k + twist) / sides) * Math.PI * 2) * r, y, cz + Math.sin(((k + twist) / sides) * Math.PI * 2) * r];
  for (let k = 0; k < sides; k++) {
    const a = ring(baseY, radius, k), b = ring(baseY, radius, k + 1), c = ring(baseY + height, radius * taper, k + 1), d = ring(baseY + height, radius * taper, k);
    const n = unit(crossV(sub(b, a), sub(d, a)));
    const base = m.positions.length / 3;
    for (const v of [a, b, c, d]) { m.positions.push(v[0], v[1], v[2]); m.normals.push(n[0], n[1], n[2]); m.uvs.push(0, 0); }
    m.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
  const tip = ring(baseY + height, radius * taper, 0);
  const base = m.positions.length / 3;
  m.positions.push(cx, baseY + height * 1.08, cz);
  m.normals.push(0, 1, 0);
  m.uvs.push(0, 0);
  for (let k = 0; k < sides; k++) { const v = ring(baseY + height, radius * taper, k); m.positions.push(v[0], v[1], v[2]); m.normals.push(0, 1, 0); m.uvs.push(0, 0); }
  for (let k = 0; k < sides; k++) m.indices.push(base, base + 1 + k, base + 1 + ((k + 1) % sides));
  void tip;
}

/** Rock massifs on both sides of the road (seeded from the map's `world.seed`) and neon crystal spires near the edges. */
export function buildProps(track: Track, seed = 91): { rocks: MeshData; crystals: MeshData } {
  const rng = seededRandom(seed);
  const rocks = emptyMesh();
  const crystals = emptyMesh();
  const f: Partial<Frame> = {};
  const clearance = 16;
  const sampleStride = 4;
  const nearRoad = (x: number, z: number, minDist: number, ownS: number): boolean => {
    for (let i = 0; i < track.n; i += sampleStride) {
      const s = i * track.step;
      if (Math.abs(track.wrapDelta(s, ownS)) < 30) continue;
      const dx = (track.px[i] as number) - x, dz = (track.pz[i] as number) - z;
      if (dx * dx + dz * dz < minDist * minDist) return true;
    }
    return false;
  };
  for (let s = 0; s < track.length; s += 18 + rng() * 22) {
    const fr = track.frame(s, f);
    for (const side of [-1, 1]) {
      const lat = side * (fr.hw + 30 + rng() * 110);
      const x = fr.x + fr.rx * lat, z = fr.z + fr.rz * lat;
      const big = rng() < 0.16;
      const height = (30 + rng() * 80) * (big ? 1.8 : 1);
      const radius = 22 + rng() * 40 + (big ? 30 : 0);
      if (!nearRoad(x, z, radius + clearance, s)) spire(rocks, x, fr.y - 40, z, radius, height + 40, 0.12 + rng() * 0.2, rng() * 2, 10);
      else void rng();
      const clat = side * (fr.hw + 3.5 + rng() * 7);
      const cxp = fr.x + fr.rx * clat, czp = fr.z + fr.rz * clat;
      if (rng() < 0.55) spire(crystals, cxp, fr.y + track.latY(s, clat) - 0.5, czp, 0.9 + rng() * 1.1, 3.5 + rng() * 6, 0.22, rng() * 2);
    }
  }
  return { rocks, crystals };
}

/** Vertical checkpoint veil across the full road width at `s`. */
export function veilQuad(track: Track, s: number, height = 20, lift = 0): MeshData {
  const fr = track.frame(s);
  const m = emptyMesh();
  const P = (lat: number, up: number): number[] => [fr.x + fr.rx * lat, fr.y + track.latY(s, lat) + up, fr.z + fr.rz * lat];
  const corners = [P(-fr.hw, lift), P(fr.hw, lift), P(fr.hw, lift + height), P(-fr.hw, lift + height)];
  const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
  corners.forEach((c, i) => { m.positions.push(c[0]!, c[1]!, c[2]!); m.normals.push(fr.tx, 0, fr.tz); m.uvs.push(uvs[i]![0]!, uvs[i]![1]!); });
  m.indices.push(0, 1, 2, 0, 2, 3);
  return m;
}

/** Flat glowing quad on the road: boost pads (`length` along, `width` across). */
export function padQuad(track: Track, s: number, x: number, length = 9, width = 6.8): MeshData {
  const m = emptyMesh();
  const f: Partial<Frame> = {};
  const corners: number[][] = [];
  for (const [ds, dx] of [[-0.5, -0.5], [-0.5, 0.5], [0.5, 0.5], [0.5, -0.5]] as const) {
    const fr = track.frame(s + ds * length, f);
    const lat = x + dx * width;
    corners.push([fr.x + fr.rx * lat, fr.y + track.latY(fr.s, lat) + 0.08, fr.z + fr.rz * lat]);
  }
  const uvs = [[0, 0], [1, 0], [1, 1], [0, 1]];
  corners.forEach((c, i) => { m.positions.push(c[0]!, c[1]!, c[2]!); m.normals.push(0, 1, 0); m.uvs.push(uvs[i]![0]!, uvs[i]![1]!); });
  m.indices.push(0, 1, 2, 0, 2, 3);
  return m;
}

/** Large flat quad for the abyss below the course. */
export function groundQuad(size: number, y: number): MeshData {
  const m = emptyMesh();
  for (const [a, b] of [[-1, -1], [1, -1], [1, 1], [-1, 1]] as const) { m.positions.push(a * size, y, b * size); m.normals.push(0, 1, 0); m.uvs.push(a, b); }
  m.indices.push(0, 2, 1, 0, 3, 2);
  return m;
}
