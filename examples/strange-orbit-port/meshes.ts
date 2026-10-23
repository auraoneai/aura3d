/**
 * Pure mesh builders for the Strange Orbit world (no engine imports): the painted
 * track ribbon, rails, island slabs, ramps, skate loops and the gate veils. Each
 * returns plain arrays the scene module wraps in `geometry.dynamic`.
 */
import {
  COURSE_LENGTH,
  ISLAND_TILES,
  OPAL,
  SPLIT,
  islandHeight,
  rampsFor,
  routeBlend,
  trackLane,
  trackUv,
  type LoopDef,
  type Ramp,
  type Route,
  type Vehicle
} from "./course";
import { paintOriginalAt, pigmentsAt } from "./palette";
import { loopFrame } from "./race";
import { mainFrame, routeFrame, surfaceNoise } from "./track";
import { Vec3 } from "./vec3";

export interface MeshData {
  positions: number[];
  normals: number[];
  uvs: number[];
  indices: number[];
  pigmentBase: number[];
  pigmentVein: number[];
  pigmentChalk: number[];
  paintOriginal: number[];
}

export const emptyMesh = (): MeshData => ({
  positions: [], normals: [], uvs: [], indices: [],
  pigmentBase: [], pigmentVein: [], pigmentChalk: [], paintOriginal: []
});

export const vertexCount = (m: MeshData): number => m.positions.length / 3;

function pushPigment(m: MeshData, s: number): void {
  const [base, vein, chalk] = pigmentsAt(s);
  m.pigmentBase.push(...base);
  m.pigmentVein.push(...vein);
  m.pigmentChalk.push(...chalk);
  m.paintOriginal.push(paintOriginalAt(s));
}

/** Append `source` to `target`, offsetting its indices. */
export function appendMesh(target: MeshData, source: MeshData): void {
  const offset = vertexCount(target);
  target.positions.push(...source.positions);
  target.normals.push(...source.normals);
  target.uvs.push(...source.uvs);
  target.pigmentBase.push(...source.pigmentBase);
  target.pigmentVein.push(...source.pigmentVein);
  target.pigmentChalk.push(...source.pigmentChalk);
  target.paintOriginal.push(...source.paintOriginal);
  for (const i of source.indices) target.indices.push(i + offset);
}

/** Area-weighted smooth vertex normals (three's `computeVertexNormals`). */
export function computeNormals(positions: readonly number[], indices: readonly number[]): number[] {
  const normals = new Array<number>(positions.length).fill(0);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i]! * 3, b = indices[i + 1]! * 3, c = indices[i + 2]! * 3;
    const abx = positions[b]! - positions[a]!, aby = positions[b + 1]! - positions[a + 1]!, abz = positions[b + 2]! - positions[a + 2]!;
    const acx = positions[c]! - positions[a]!, acy = positions[c + 1]! - positions[a + 1]!, acz = positions[c + 2]! - positions[a + 2]!;
    const nx = aby * acz - abz * acy, ny = abz * acx - abx * acz, nz = abx * acy - aby * acx;
    for (const v of [a, b, c]) { normals[v]! += nx; normals[v + 1]! += ny; normals[v + 2]! += nz; }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i]!, normals[i + 1]!, normals[i + 2]!) || 1;
    normals[i]! /= len; normals[i + 1]! /= len; normals[i + 2]! /= len;
  }
  return normals;
}

const surfacePoint = (s: number, lane: number, route: Route, lift = 0): Vec3 => {
  const f = routeFrame(s, route);
  return f.p.addScaledVector(f.side, lane).addScaledVector(f.up, (islandHeight(s, route) ?? 0) + lift + surfaceNoise(s, trackLane(s, lane, route)));
};

/** One rideable strip of `route` between distances `from` and `to` (the original's `p(...)`). */
export function trackStrip(from: number, to: number, route: Route = "main", half = 11.5, edgeDepth = 1.2, step = 1.3): MeshData {
  const m = emptyMesh();
  const rows = Math.max(2, Math.ceil((to - from) / step));
  for (let i = 0; i <= rows; i++) {
    const s = from + (to - from) * i / rows;
    const frame = routeFrame(s, route);
    const ground = islandHeight(s, route) ?? 0;
    const drop = -(1.2 + (edgeDepth - 1.2) * routeBlend(s, route));
    const columns: [number, number][] = [
      [-half, drop],
      ...Array.from({ length: 13 }, (_, t): [number, number] => [-half + t / 12 * half * 2, 0]),
      [half, drop]
    ];
    for (const [lane, lift] of columns) {
      const p = frame.p.clone().addScaledVector(frame.side, lane).addScaledVector(frame.up, ground + lift + surfaceNoise(s, trackLane(s, lane, route)));
      m.positions.push(p.x, p.y, p.z);
      const [u, v] = trackUv(s, lane, route);
      m.uvs.push(u, v + lift * 0.04);
      pushPigment(m, s);
    }
  }
  for (let e = 0; e < rows; e++) {
    for (let t = 0; t < 14; t++) {
      const n = e * 15 + t;
      m.indices.push(n, n + 1, n + 15, n + 1, n + 16, n + 15);
    }
    const t = e * 15;
    m.indices.push(t, t + 15, t + 29, t, t + 29, t + 14);
  }
  // Analytic surface normals from the true derivatives; edge skirts reuse their neighbour.
  const at = (s: number, lane: number): Vec3 => surfacePoint(s, lane, route);
  m.normals = new Array<number>(m.positions.length).fill(0);
  for (let i = 0; i <= rows; i++) {
    const s = from + (to - from) * i / rows;
    for (let j = 0; j <= 12; j++) {
      const lane = -half + j / 12 * half * 2;
      const ds = at(s + 0.025, lane).sub(at(s - 0.025, lane));
      const dl = at(s, lane + 0.025).sub(at(s, lane - 0.025));
      const n = new Vec3().crossVectors(dl, ds).normalize();
      const base = (i * 15 + j + 1) * 3;
      m.normals[base] = n.x; m.normals[base + 1] = n.y; m.normals[base + 2] = n.z;
      if (j === 0) { m.normals[i * 15 * 3] = n.x; m.normals[i * 15 * 3 + 1] = n.y; m.normals[i * 15 * 3 + 2] = n.z; }
      if (j === 12) { const e = (i * 15 + 14) * 3; m.normals[e] = n.x; m.normals[e + 1] = n.y; m.normals[e + 2] = n.z; }
    }
  }
  return m;
}

/** Thin glowing rail along one edge of a strip. */
export function railStrip(from: number, to: number, route: Route, half: number, side: -1 | 1, step = 1.3): MeshData {
  const m = emptyMesh();
  const rows = Math.max(2, Math.ceil((to - from) / step));
  for (let i = 0; i <= rows; i++) {
    const s = from + (to - from) * i / rows;
    const f = routeFrame(s, route);
    const ground = islandHeight(s, route) ?? 0;
    for (const d of [-0.1, 0.1]) {
      const lane = side * half + d;
      const p = f.p.clone().addScaledVector(f.side, lane).addScaledVector(f.up, ground + 0.035 + surfaceNoise(s, trackLane(s, lane, route)));
      m.positions.push(p.x, p.y, p.z);
      m.uvs.push(s * 0.05, d);
      m.normals.push(f.up.x, f.up.y, f.up.z);
      pushPigment(m, s);
    }
    if (i < rows) { const k = i * 2; m.indices.push(k, k + 1, k + 2, k + 1, k + 3, k + 2); }
  }
  return m;
}

/** Whole rideable course (every strip and rail), mirroring the original's section list. */
export function buildCourse(step = 1.3): { track: MeshData; rails: MeshData } {
  const track = emptyMesh();
  const rails = emptyMesh();
  const sections: [number, number, Route, number, number][] = [
    [0, SPLIT.start, "main", 11.5, 1.2],
    [SPLIT.start, SPLIT.end, "main", 23 / 6, 1.2],
    [SPLIT.start, SPLIT.end, "upper", 23 / 6, 1.7],
    [SPLIT.start, SPLIT.end, "lower", 23 / 6, 1.7],
    [SPLIT.end, OPAL.start, "main", 11.5, 1.2],
    [OPAL.end, COURSE_LENGTH, "main", 11.5, 1.2],
    [OPAL.start, ISLAND_TILES[0]!.start, "islands", 6.75, 3],
    [ISLAND_TILES[ISLAND_TILES.length - 1]!.end, OPAL.end, "islands", 6.75, 3],
    [OPAL.start, OPAL.end, "bypass", 4.75, 2.5]
  ];
  for (const [from, to, route, half, edge] of sections) {
    appendMesh(track, trackStrip(from, to, route, half, edge, step));
    for (const side of [-1, 1] as const) appendMesh(rails, railStrip(from, to, route, half, side, step));
  }
  return { track, rails };
}

/** The six floating opal platforms as closed slabs. */
export function buildIslands(): MeshData {
  const out = emptyMesh();
  for (const tile of ISLAND_TILES) {
    const rows = Math.ceil((tile.end - tile.start) / 1);
    const cols = 12;
    const top: Vec3[][] = [];
    for (let i = 0; i <= rows; i++) {
      const s = tile.start + (tile.end - tile.start) * i / rows;
      const u = i / rows;
      const half = 6.75 * (1 + 0.025 * Math.sin(u * Math.PI * 5));
      const row: Vec3[] = [];
      for (let j = 0; j <= cols; j++) row.push(surfacePoint(s, -half + j / cols * half * 2, "islands"));
      top.push(row);
    }
    const down = (p: Vec3, f: number): Vec3 => p.clone().addScaledVector(routeFrame(tile.start, "islands").up, -f);
    const face = (quad: Vec3[], flip = false): void => {
      const m = emptyMesh();
      for (const p of quad) { m.positions.push(p.x, p.y, p.z); m.uvs.push(0, 0); pushPigment(m, tile.start); }
      m.indices.push(...(flip ? [0, 2, 1, 0, 3, 2] : [0, 1, 2, 0, 2, 3]));
      appendMesh(out, m);
    };
    const grid = emptyMesh();
    top.forEach((row) => row.forEach((p) => { grid.positions.push(p.x, p.y, p.z); grid.uvs.push(0, 0); pushPigment(grid, tile.start); }));
    for (let i = 0; i < rows; i++) for (let j = 0; j < cols; j++) {
      const a = i * (cols + 1) + j, b = a + 1, c = a + cols + 1, d = c + 1;
      grid.indices.push(a, c, b, b, c, d);
    }
    appendMesh(out, grid);
    for (let i = 0; i < rows; i++) {
      face([top[i]![0]!, top[i + 1]![0]!, down(top[i + 1]![0]!, 5), down(top[i]![0]!, 5)]);
      face([top[i]![cols]!, top[i + 1]![cols]!, down(top[i + 1]![cols]!, 5), down(top[i]![cols]!, 5)], true);
    }
    for (let j = 0; j < cols; j++) {
      face([top[0]![j]!, top[0]![j + 1]!, down(top[0]![j + 1]!, 5), down(top[0]![j]!, 5)], true);
      face([top[rows]![j]!, top[rows]![j + 1]!, down(top[rows]![j + 1]!, 5), down(top[rows]![j]!, 5)]);
    }
  }
  out.normals = computeNormals(out.positions, out.indices);
  return out;
}

/** Wedge ramps (the original's `stunt-ramp.js`). */
export function buildRamps(vehicle: Vehicle): MeshData {
  const out = emptyMesh();
  for (const ramp of rampsFor(vehicle)) appendMesh(out, rampMesh(ramp));
  out.normals = computeNormals(out.positions, out.indices);
  return out;
}

function rampMesh(ramp: Ramp): MeshData {
  const m = emptyMesh();
  const at = (u: number, lane: number, lift = 0): Vec3 => {
    const s = ramp.s + u * ramp.length;
    const f = mainFrame(s);
    return f.p.addScaledVector(f.side, lane).addScaledVector(f.up, surfaceNoise(s, lane) + ramp.height * u * u + lift);
  };
  for (let i = 0; i <= 32; i++) {
    const u = i / 32;
    for (const [lane, lift] of [
      [ramp.lane - ramp.width / 2, -ramp.height * u * u - 0.08],
      [ramp.lane - ramp.width / 2, 0],
      [ramp.lane + ramp.width / 2, 0],
      [ramp.lane + ramp.width / 2, -ramp.height * u * u - 0.08]
    ] as const) {
      const p = at(u, lane, lift);
      m.positions.push(p.x, p.y, p.z);
      m.uvs.push(36 / COURSE_LENGTH * (ramp.s + u * ramp.length), 0.5 + lane / 23);
      pushPigment(m, ramp.s + u * ramp.length);
    }
  }
  for (let e = 0; e < 32; e++) for (let t = 0; t < 3; t++) {
    const n = e * 4 + t;
    m.indices.push(n, n + 1, n + 4, n + 1, n + 5, n + 4);
  }
  m.indices.push(128, 129, 130, 128, 130, 131);
  return m;
}

/** Skate-only loop ribbons (the original's `skate-loop.js`). */
export function buildLoops(loops: readonly LoopDef[]): MeshData {
  const out = emptyMesh();
  for (const def of loops) {
    const m = emptyMesh();
    for (let n = 0; n <= 180; n++) {
      for (const side of [-1, 1]) {
        const p = loopFrame(def, n / 180, side * def.width / 2).p;
        m.positions.push(p.x, p.y, p.z);
        m.uvs.push(36 / COURSE_LENGTH * (def.s + def.length * n / 180), 0.5 + (def.lane + side * def.width / 2) / 23);
        pushPigment(m, def.s + def.length * Math.floor(n) / 180);
      }
      if (n < 180) { const e = n * 2; m.indices.push(e, e + 1, e + 2, e + 1, e + 3, e + 2); }
    }
    appendMesh(out, m);
  }
  out.normals = computeNormals(out.positions, out.indices);
  return out;
}

/** A vertical 23 × 13 m curtain facing along the track at distance `s` (uv.y runs up). */
export function veilQuad(s: number): MeshData {
  const m = emptyMesh();
  const f = mainFrame(s);
  const corners: [number, number][] = [[-11.5, 0], [11.5, 0], [11.5, 13], [-11.5, 13]];
  const uv: [number, number][] = [[0, 0], [1, 0], [1, 1], [0, 1]];
  corners.forEach(([lane, up], k) => {
    const p = f.p.clone().addScaledVector(f.side, lane).addScaledVector(f.up, up);
    m.positions.push(p.x, p.y, p.z);
    m.normals.push(f.tangent.x, f.tangent.y, f.tangent.z);
    m.uvs.push(...uv[k]!);
  });
  m.indices.push(0, 1, 2, 0, 2, 3);
  return m;
}
