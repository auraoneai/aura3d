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
      const big = rng() < 0.16;
      const height = (30 + rng() * 80) * (big ? 1.8 : 1);
      const radius = 22 + rng() * 40 + (big ? 30 : 0);
      /* the hill's footprint at road height is ~0.8 of its base radius x1.25: keep its foot 30 m+ clear of the road edge */
      const lat = side * (fr.hw + 30 + radius * 1.25 * 1.05 + rng() * 80);
      const x = fr.x + fr.rx * lat, z = fr.z + fr.rz * lat;
      /* footprint is radius x1.25 x up to 1.3 of wobble: guard with the real extent so no hill swallows another stretch of road */
      if (!nearRoad(x, z, radius * 1.25 * 1.35 + 20, s)) mound(rocks, x, fr.y - 40, z, radius * 1.25, height + 40, rng() * 6.28);
      else void rng();
      const clat = side * (fr.hw + 3.5 + rng() * 7);
      const cxp = fr.x + fr.rx * clat, czp = fr.z + fr.rz * clat;
      if (rng() < 0.55) spire(crystals, cxp, fr.y + track.latY(s, clat) - 0.5, czp, 0.9 + rng() * 1.1, 3.5 + rng() * 6, 0.22, rng() * 2);
    }
  }
  /* far ridge: broad low-detail massifs that give the horizon its silhouette */
  for (let s = 0; s < track.length; s += 110 + rng() * 90) {
    const fr = track.frame(s, f);
    const side = rng() < 0.5 ? -1 : 1;
    const lat = side * (fr.hw + 300 + rng() * 380);
    const x = fr.x + fr.rx * lat, z = fr.z + fr.rz * lat;
    const radius = 140 + rng() * 200, height = 90 + rng() * 170;
    if (!nearRoad(x, z, radius * 1.35 + 40, s)) mound(rocks, x, fr.y - 85, z, radius, height + 85, rng() * 6.28, 16, 7);
    else void rng();
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


/* ---------------------------------------------------------------- art pass (2026-10-23): terrain, rails, arches, shards */

type V3 = readonly [number, number, number];

/** Smooth vertex normals for the triangles added since (`v0`, `i0`): area-weighted accumulation, then normalised. */
function accumulateNormals(m: MeshData, v0: number, i0: number): void {
  for (let k = v0 * 3; k < m.normals.length; k++) m.normals[k] = 0;
  for (let t = i0; t < m.indices.length; t += 3) {
    const a = m.indices[t]!, b = m.indices[t + 1]!, c = m.indices[t + 2]!;
    const pa = [m.positions[a * 3]!, m.positions[a * 3 + 1]!, m.positions[a * 3 + 2]!], pb = [m.positions[b * 3]!, m.positions[b * 3 + 1]!, m.positions[b * 3 + 2]!], pc = [m.positions[c * 3]!, m.positions[c * 3 + 1]!, m.positions[c * 3 + 2]!];
    const n = crossV(sub(pb, pa), sub(pc, pa));
    for (const v of [a, b, c]) { m.normals[v * 3] = m.normals[v * 3]! + n[0]; m.normals[v * 3 + 1] = m.normals[v * 3 + 1]! + n[1]; m.normals[v * 3 + 2] = m.normals[v * 3 + 2]! + n[2]; }
  }
  for (let v = v0; v < m.positions.length / 3; v++) {
    const n = unit([m.normals[v * 3]!, m.normals[v * 3 + 1]!, m.normals[v * 3 + 2]!]);
    m.normals[v * 3] = n[0]; m.normals[v * 3 + 1] = n[1]; m.normals[v * 3 + 2] = n[2];
  }
}

/** Flip the triangles added since `i0` when their summed facing disagrees with `outward(centroid)`. */
function orient(m: MeshData, i0: number, outward: (x: number, y: number, z: number) => V3): void {
  let score = 0;
  for (let t = i0; t < m.indices.length; t += 3) {
    const a = m.indices[t]!, b = m.indices[t + 1]!, c = m.indices[t + 2]!;
    const pa = [m.positions[a * 3]!, m.positions[a * 3 + 1]!, m.positions[a * 3 + 2]!], pb = [m.positions[b * 3]!, m.positions[b * 3 + 1]!, m.positions[b * 3 + 2]!], pc = [m.positions[c * 3]!, m.positions[c * 3 + 1]!, m.positions[c * 3 + 2]!];
    const n = crossV(sub(pb, pa), sub(pc, pa));
    const o = outward((pa[0]! + pb[0]! + pc[0]!) / 3, (pa[1]! + pb[1]! + pc[1]!) / 3, (pa[2]! + pb[2]! + pc[2]!) / 3);
    score += n[0] * o[0] + n[1] * o[1] + n[2] * o[2];
  }
  if (score < 0) for (let t = i0; t < m.indices.length; t += 3) { const b = m.indices[t + 1]!; m.indices[t + 1] = m.indices[t + 2]!; m.indices[t + 2] = b; }
}

/** Smooth rounded hill: a revolved dome profile with low-frequency wobble and smooth normals. */
export function mound(m: MeshData, cx: number, baseY: number, cz: number, radius: number, height: number, seed: number, sides = 18, rings = 8): void {
  const v0 = m.positions.length / 3, i0 = m.indices.length;
  for (let i = 0; i <= rings; i++) {
    const t = i / rings;
    const profile = 1 - Math.pow(1 - t, 2.1);
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2;
      const wob = 1 + 0.16 * Math.sin(3 * a + seed) + 0.09 * Math.sin(5 * a + seed * 2.3) + 0.05 * Math.sin(8 * a + seed * 0.7);
      const r = radius * (1 - t * 0.97) * wob;
      const y = baseY + height * profile * (1 + 0.07 * Math.sin(2 * a + seed * 1.7));
      m.positions.push(cx + Math.cos(a) * r, y, cz + Math.sin(a) * r);
      m.normals.push(0, 1, 0);
      m.uvs.push(k / sides, t);
    }
  }
  for (let i = 0; i < rings; i++) {
    for (let k = 0; k < sides; k++) {
      const a = v0 + i * sides + k, b = v0 + i * sides + ((k + 1) % sides), c = a + sides, d = b + sides;
      m.indices.push(a, c, b, b, c, d);
    }
  }
  orient(m, i0, (x, y, z) => [x - cx, y - baseY + height * 0.2, z - cz]);
  accumulateNormals(m, v0, i0);
}

/** Wide plains on both sides of the road falling away to a valley, so the hills stand in a landscape, not a void. */
export function buildShoulders(track: Track, spacing = 6): MeshData {
  const m = emptyMesh();
  const offsets = [0, 3, 10, 24, 50, 100, 200, 420];
  const drops = [-0.55, -0.75, -1.5, -3.2, -7.5, -17, -38, -85];
  const rows = Math.ceil(track.length / spacing);
  const ds = track.length / rows;
  const f: Partial<Frame> = {};
  /* where the track crosses over itself, the upper stretch's plains would hang overhead like a ceiling above the lower road:
     leave out any quad that sits above another stretch of road (spatial hash of the road samples, 64 m cells) */
  const CELL = 64, COVER_R = 55, MIN_GAP = 6, OWN_SPAN = 150;
  const grid = new Map<number, number[]>();
  const cellKey = (cx: number, cz: number): number => cx * 73856093 + cz * 19349663;
  for (let i = 0; i < track.n; i += 2) {
    const k = cellKey(Math.floor((track.px[i] as number) / CELL), Math.floor((track.pz[i] as number) / CELL));
    const list = grid.get(k);
    if (list) list.push(i); else grid.set(k, [i]);
  }
  const coversLowerRoad = (x: number, y: number, z: number, ownS: number): boolean => {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    for (let dx = -1; dx <= 1; dx++) for (let dz = -1; dz <= 1; dz++) {
      const list = grid.get(cellKey(cx + dx, cz + dz));
      if (!list) continue;
      for (const i of list) {
        if (Math.abs(track.wrapDelta(i * track.step, ownS)) < OWN_SPAN) continue;
        const ddx = (track.px[i] as number) - x, ddz = (track.pz[i] as number) - z;
        if (ddx * ddx + ddz * ddz < COVER_R * COVER_R && y - (track.py[i] as number) > MIN_GAP) return true;
      }
    }
    return false;
  };
  for (const side of [-1, 1]) {
    const v0 = m.positions.length / 3, i0 = m.indices.length;
    const covered: boolean[] = [];
    for (let i = 0; i <= rows; i++) {
      const s = i * ds;
      const fr = track.frame(s, f);
      for (let j = 0; j < offsets.length; j++) {
        const lat = side * (fr.hw + offsets[j]!);
        const wob = j >= 2 ? Math.sin(s * 0.013 + j * 1.9) * 0.9 + Math.sin(s * 0.041 + j) * 0.4 : 0;
        const px = fr.x + fr.rx * lat, py = fr.y + track.latY(s, side * fr.hw) + drops[j]! + wob, pz = fr.z + fr.rz * lat;
        m.positions.push(px, py, pz);
        m.normals.push(0, 1, 0);
        m.uvs.push(j / (offsets.length - 1), s / 40);
        covered.push(coversLowerRoad(px, py, pz, s));
      }
    }
    const cols = offsets.length;
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols - 1; j++) {
      const a = v0 + i * cols + j, b = a + 1, c = a + cols, d = c + 1;
      if (covered[a - v0] || covered[b - v0] || covered[c - v0] || covered[d - v0]) continue;
      m.indices.push(a, c, b, b, c, d);
    }
    orient(m, i0, () => [0, 1, 0]);
    accumulateNormals(m, v0, i0);
  }
  return m;
}

/** Oriented box with flat normals: centre `c`, unit axes `ex/ey/ez`, half sizes. */
export function appendBox(m: MeshData, c: V3, ex: V3, ey: V3, ez: V3, hx: number, hy: number, hz: number): void {
  const axes: [V3, V3, V3] = [ex, ey, ez];
  const half = [hx, hy, hz];
  const P = (sx: number, sy: number, sz: number): number[] => [c[0] + ex[0] * hx * sx + ey[0] * hy * sy + ez[0] * hz * sz, c[1] + ex[1] * hx * sx + ey[1] * hy * sy + ez[1] * hz * sz, c[2] + ex[2] * hx * sx + ey[2] * hy * sy + ez[2] * hz * sz];
  void half; void axes;
  const faces: [number[], V3][] = [
    [[...P(1, -1, -1), ...P(1, 1, -1), ...P(1, 1, 1), ...P(1, -1, 1)], ex],
    [[...P(-1, -1, 1), ...P(-1, 1, 1), ...P(-1, 1, -1), ...P(-1, -1, -1)], [-ex[0], -ex[1], -ex[2]]],
    [[...P(-1, 1, -1), ...P(-1, 1, 1), ...P(1, 1, 1), ...P(1, 1, -1)], ey],
    [[...P(-1, -1, 1), ...P(-1, -1, -1), ...P(1, -1, -1), ...P(1, -1, 1)], [-ey[0], -ey[1], -ey[2]]],
    [[...P(-1, -1, 1), ...P(1, -1, 1), ...P(1, 1, 1), ...P(-1, 1, 1)], ez],
    [[...P(1, -1, -1), ...P(-1, -1, -1), ...P(-1, 1, -1), ...P(1, 1, -1)], [-ez[0], -ez[1], -ez[2]]]
  ];
  for (const [verts, n] of faces) {
    const base = m.positions.length / 3;
    for (let k = 0; k < 4; k++) { m.positions.push(verts[k * 3]!, verts[k * 3 + 1]!, verts[k * 3 + 2]!); m.normals.push(n[0], n[1], n[2]); m.uvs.push(k === 1 || k === 2 ? 1 : 0, k >= 2 ? 1 : 0); }
    const pa = [verts[0]!, verts[1]!, verts[2]!], pb = [verts[3]!, verts[4]!, verts[5]!], pc = [verts[6]!, verts[7]!, verts[8]!];
    const face = crossV(sub(pb, pa), sub(pc, pa));
    if (face[0] * n[0] + face[1] * n[1] + face[2] * n[2] >= 0) m.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    else m.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
  }
}

/** Pale pipe rails along both road edges (continuous square tube) and cyan neon posts every ~22 m. */
export function buildRails(track: Track, spacing = 5): { rails: MeshData; posts: MeshData } {
  const rails = emptyMesh();
  const posts = emptyMesh();
  const rows = Math.ceil(track.length / spacing);
  const ds = track.length / rows;
  const f: Partial<Frame> = {};
  const half = 0.3;
  for (const side of [-1, 1]) {
    const v0 = rails.positions.length / 3, i0 = rails.indices.length;
    for (let i = 0; i <= rows; i++) {
      const s = i * ds;
      const fr = track.frame(s, f);
      const lat = side * (fr.hw + 0.55);
      const cx = fr.x + fr.rx * lat, cz = fr.z + fr.rz * lat, cy = fr.y + track.latY(s, side * fr.hw) + 0.62;
      for (const [dl, dy] of [[-half, -half], [half, -half], [half, half], [-half, half]] as const) {
        rails.positions.push(cx + fr.rx * dl, cy + dy, cz + fr.rz * dl);
        rails.normals.push(0, 1, 0);
        rails.uvs.push(0, 0);
      }
    }
    for (let i = 0; i < rows; i++) for (let j = 0; j < 4; j++) { const a = v0 + i * 4 + j, b = v0 + i * 4 + ((j + 1) % 4), c = a + 4, d = b + 4; rails.indices.push(a, c, b, b, c, d); }
    {
      /* the tube's j=0 face is its underside: its triangle normal must point down, otherwise flip the whole side */
      const a = rails.indices[i0]!, b = rails.indices[i0 + 1]!, c = rails.indices[i0 + 2]!;
      const pa = [rails.positions[a * 3]!, rails.positions[a * 3 + 1]!, rails.positions[a * 3 + 2]!], pb = [rails.positions[b * 3]!, rails.positions[b * 3 + 1]!, rails.positions[b * 3 + 2]!], pc = [rails.positions[c * 3]!, rails.positions[c * 3 + 1]!, rails.positions[c * 3 + 2]!];
      if (crossV(sub(pb, pa), sub(pc, pa))[1] > 0) for (let t = i0; t < rails.indices.length; t += 3) { const q = rails.indices[t + 1]!; rails.indices[t + 1] = rails.indices[t + 2]!; rails.indices[t + 2] = q; }
    }
    accumulateNormals(rails, v0, i0);
    for (let s = 11; s < track.length; s += 22) {
      const fr = track.frame(s, f);
      const lat = side * (fr.hw + 0.55);
      const up: V3 = [0, 1, 0], tan: V3 = [fr.tx, 0, fr.tz], rgt: V3 = [fr.rx, 0, fr.rz];
      appendBox(posts, [fr.x + fr.rx * lat, fr.y + track.latY(s, side * fr.hw) + 0.95, fr.z + fr.rz * lat], tan, up, rgt, 0.16, 0.95, 0.16);
    }
  }
  return { rails, posts };
}

/** Dark bone-pipe gantry arches over the road every ~240 m, with a cyan neon strip under the beam. */
export function buildArches(track: Track, every = 240): { body: MeshData; neon: MeshData } {
  const body = emptyMesh();
  const neon = emptyMesh();
  const up: V3 = [0, 1, 0];
  for (let s = 120; s < track.length - 60; s += every) {
    const fr = track.frame(s);
    const tan: V3 = [fr.tx, 0, fr.tz], rgt: V3 = [fr.rx, 0, fr.rz];
    const span = fr.hw + 2.4;
    const baseY = fr.y - 2;
    for (const side of [-1, 1]) appendBox(body, [fr.x + fr.rx * span * side, baseY + 6.2, fr.z + fr.rz * span * side], tan, up, rgt, 1.7, 6.2, 1.5);
    appendBox(body, [fr.x, baseY + 13.2, fr.z], tan, up, rgt, 1.9, 1.3, span + 1.6);
    appendBox(neon, [fr.x, baseY + 11.7, fr.z], tan, up, rgt, 0.12, 0.08, span - 1.2);
    appendBox(neon, [fr.x - 0 + fr.tx * 1.95, baseY + 13.2, fr.z + fr.tz * 1.95], tan, up, rgt, 0.05, 0.12, span * 0.85);
  }
  return { body, neon };
}

/** Floating dark crystal shards (stretched bipyramids) hanging above the valley on both sides of the course. */
export function buildShards(track: Track, seed = 311): MeshData {
  const rng = seededRandom(seed);
  const m = emptyMesh();
  const f: Partial<Frame> = {};
  for (let s = 40; s < track.length; s += 160 + rng() * 140) {
    const fr = track.frame(s, f);
    const side = rng() < 0.5 ? -1 : 1;
    const lat = side * (fr.hw + 40 + rng() * 160);
    const cx = fr.x + fr.rx * lat, cz = fr.z + fr.rz * lat, cy = fr.y + 45 + rng() * 90;
    const r = 6 + rng() * 10, h = 14 + rng() * 22, tw = rng() * 6;
    const sides = 6;
    const v0 = m.positions.length / 3, i0 = m.indices.length;
    m.positions.push(cx, cy + h, cz, cx, cy - h * 0.8, cz);
    m.normals.push(0, 1, 0, 0, -1, 0);
    m.uvs.push(0, 0, 0, 0);
    for (let k = 0; k < sides; k++) {
      const a = (k / sides) * Math.PI * 2 + tw;
      m.positions.push(cx + Math.cos(a) * r, cy, cz + Math.sin(a) * r);
      m.normals.push(0, 0, 0);
      m.uvs.push(0, 0);
    }
    for (let k = 0; k < sides; k++) {
      const a = v0 + 2 + k, b = v0 + 2 + ((k + 1) % sides);
      m.indices.push(v0, b, a, v0 + 1, a, b);
    }
    orient(m, i0, (x, y, z) => [x - cx, y - cy, z - cz]);
    accumulateNormals(m, v0, i0);
  }
  return m;
}
