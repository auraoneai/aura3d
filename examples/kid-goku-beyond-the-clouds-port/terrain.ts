/**
 * Procedural scenery for the Cumulus Dash course: the lofted ground (sandy track, grass shoulders, hill banks or
 * sandstone cliffs), canyon walls, gorges, foliage, rocks and flowers. Everything is generated from the course data and a
 * seeded RNG, merged into a few chunked meshes, so the art is original and deterministic.
 */
import type { Chapter } from "./chapter";
import { at, frameAt, type V3 } from "./course";
import { Mesh, cylinder, hex, icosphere, mix3, mul3 } from "./mesh";
import { seeded, smooth } from "./sim";

export const ROAD_HALF = 6.2;
export const CHUNK = 160;

/* ---------------------------------------------------------------- smooth 1-D noise */
const hash = (n: number): number => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };
export function noise1(x: number, seed = 0): number {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return hash(i + seed * 17.3) * (1 - u) + hash(i + 1 + seed * 17.3) * u;
}
export const fbm1 = (x: number, seed = 0): number => 0.55 * noise1(x, seed) + 0.3 * noise1(x * 2.1 + 5, seed) + 0.15 * noise1(x * 4.3 + 9, seed);

const inSpan = (s: number, spans: readonly { start: number; end: number }[], pad = 0): boolean => spans.some((p) => s > p.start - pad && s < p.end + pad);
/** The road surface is missing here (gap or an unplanted pole gorge). */
export const isVoid = (ch: Chapter, s: number): boolean => inSpan(s, ch.gaps) || inSpan(s, ch.poles);

/* ---------------------------------------------------------------- the lateral profile */
export interface ProfilePoint { readonly u: number; readonly h: number; readonly kind: "road" | "grass" | "slope"; /** 0 grass .. 1 sandstone */ readonly cliff: number }
/** Outer four points: [du from the shoulder, height, sandstone weight]. A wall rises above the track; a drop falls to the valley. */
const WALL: ReadonlyArray<readonly [number, number, number]> = [[1.0, 2.0, 1], [2.2, 11, 1], [3.0, 21, 0.6], [9, 23, 0]];
const DROP: ReadonlyArray<readonly [number, number, number]> = [[0.6, -0.5, 0.3], [1.4, -9, 1], [3.5, -26, 1], [9, -42, 1]];
const CANYON: ReadonlyArray<readonly [number, number, number]> = [[1.4, 7, 1], [2.0, 14, 1], [3.5, 19, 1], [9, 21, 0.5]];
const MEADOW: ReadonlyArray<readonly [number, number, number]> = [[3.5, 1.2, 0], [9, 2.8, 0], [24, 4.8, 0], [140, 6.5, 0]];
/** The middle of the run opens from the canyon onto rolling meadows (0 canyon style, 1 open meadow). */
export function openMode(s: number): number { return smooth(560, 720, s) * (1 - smooth(1780, 1900, s)); }

/** Cliff-versus-wall mode (0 rising sandstone wall, 1 sandstone drop to the valley) for one side. */
export function cliffMode(s: number, side: 1 | -1): number {
  const n = fbm1(s * 0.017 + (side > 0 ? 11 : 0), side > 0 ? 3 : 8);
  const m = side > 0 ? smooth(0.34, 0.5, n) : smooth(0.5, 0.66, n);
  return side > 0 ? Math.max(m, 1 - smooth(60, 160, s)) : m * smooth(20, 90, s) + 0;
}
export function canyonMode(ch: Chapter, s: number): number {
  let k = 0;
  for (const w of ch.walls) k = Math.max(k, smooth(w.start - 18, w.start + 4, s) * (1 - smooth(w.end - 4, w.end + 18, s)));
  return k;
}

export function profile(ch: Chapter, s: number, side: 1 | -1): ProfilePoint[] {
  const w = 4.2 + 3.0 * fbm1(s * 0.02, side > 0 ? 5 : 6);
  const op = openMode(s);
  const m = cliffMode(s, side) * (1 - op), c = canyonMode(ch, s);
  const lip = 0.18 + 0.22 * noise1(s * 0.07, 2);
  const pts: ProfilePoint[] = [
    { u: 0, h: 0, kind: "road", cliff: 0 },
    { u: 0.9, h: 0.04, kind: "grass", cliff: 0 },
    { u: 1.6, h: lip, kind: "grass", cliff: 0 },
    { u: w * 0.55 + 1.6, h: 0.35 + 0.35 * noise1(s * 0.05, 4), kind: "grass", cliff: 0 },
    { u: w + 1.6, h: 0.5 + 0.4 * noise1(s * 0.04, 7), kind: "grass", cliff: 0 }
  ];
  for (let i = 0; i < 4; i++) {
    const wl = WALL[i]!, dr = DROP[i]!, cn = CANYON[i]!;
    let du = wl[0] + (dr[0] - wl[0]) * m, h = wl[1] + (dr[1] - wl[1]) * m, rock = wl[2] + (dr[2] - wl[2]) * m;
    du += (cn[0] - du) * c; h += (cn[1] - h) * c; rock += (cn[2] - rock) * c;
    const mw = MEADOW[i]!, ok = op * (1 - c);
    du += (mw[0] - du) * ok; h += (mw[1] - h) * ok; rock += (mw[2] - rock) * ok;
    const wobble = (noise1(s * 0.035 + i * 3.1, side > 0 ? 12 : 13) - 0.5) * (i === 0 ? 5 : 3.6);
    const hWob = i > 1 ? (noise1(s * 0.05 + i, 9) - 0.5) * 3.0 * (1 - c) : 0;
    pts.push({ u: w + 1.6 + du + wobble, h: h + hWob, kind: "slope", cliff: rock });
  }
  return pts;
}

/** Ground height at lateral offset `lat` (signed, from the centerline) at distance `s` (0 on the road). */
export function groundHeight(ch: Chapter, s: number, lat: number): number {
  const side: 1 | -1 = lat >= 0 ? 1 : -1;
  const u = Math.abs(lat) - ROAD_HALF;
  if (u <= 0) return 0;
  const p = profile(ch, s, side);
  for (let i = 1; i < p.length; i++) {
    const a = p[i - 1]!, b = p[i]!;
    if (u <= b.u) return a.h + (b.h - a.h) * ((u - a.u) / Math.max(1e-6, b.u - a.u));
  }
  return p[p.length - 1]!.h;
}

/* ---------------------------------------------------------------- palette (linear colours, painterly warm light) */
const SAND = hex("#d9b374"), SAND_DARK = hex("#b88a50"), SAND_LIGHT = hex("#ecd09a");
const GRASS = hex("#7db34a"), GRASS_DARK = hex("#4f8a35"), GRASS_LIGHT = hex("#a8cf62");
const ROCK_GOLD = hex("#d8a95d"), ROCK_RED = hex("#b9784a"), ROCK_PALE = hex("#ecd3a0"), HAZE = hex("#b9cde0");

export interface GroundMeshes { road: Mesh[]; grass: Mesh[]; slope: Mesh[] }

/** Lofted ground along `s`, in `CHUNK`-long pieces so frustum culling works. */
export function buildGround(ch: Chapter, from = -40, to = ch.length + 80): GroundMeshes {
  const out: GroundMeshes = { road: [], grass: [], slope: [] };
  const step = 2;
  for (let c0 = from; c0 < to; c0 += CHUNK) {
    const c1 = Math.min(to, c0 + CHUNK);
    const road = new Mesh(), grass = new Mesh(), slope = new Mesh();
    let prevRoad: number[] | null = null;
    const prevG: Record<string, number[] | null> = { "-1": null, "1": null };
    const prevS: Record<string, number[] | null> = { "-1": null, "1": null };
    for (let s = c0; s <= c1 + 1e-6; s += step) {
      const frame = frameAt(s);
      const hole = isVoid(ch, s) || isVoid(ch, s + step * 0.5) || isVoid(ch, s - step * 0.5);
      if (!hole) {
        const cols = [-ROAD_HALF, -ROAD_HALF * 0.56, 0, ROAD_HALF * 0.56, ROAD_HALF];
        const idx = cols.map((lat, k) => {
          const edgeDist = 1 - Math.abs(lat) / ROAD_HALF;
          const rut = k === 1 || k === 3 ? -0.14 : k === 2 ? 0.16 : -0.22;
          const camber = edgeDist * 0.028;
          const tone = mix3(SAND_DARK, SAND_LIGHT, Math.min(1, Math.max(0, 0.54 + rut + 0.22 * (noise1(s * 0.32 + k * 1.3, 1) - 0.5))));
          return road.vertex(at(s, lat, camber), frame.up, [lat / 5.5, s / 5.5], tone);
        });
        if (prevRoad) for (let k = 0; k < 4; k++) road.quad(prevRoad[k]!, prevRoad[k + 1]!, idx[k + 1]!, idx[k]!);
        prevRoad = idx;
      } else prevRoad = null;
      for (const side of [-1, 1] as const) {
        const prof = profile(ch, s, side);
        const gi: number[] = [], si: number[] = [];
        for (let k = 0; k <= 4; k++) {
          if (hole) break;
          const p = prof[k]!;
          const lat = side * (ROAD_HALF + p.u);
          const shade = 0.5 + 0.5 * noise1(s * 0.12 + k * 1.7, side > 0 ? 21 : 22);
          const col = k === 0 ? mix3(SAND_DARK, GRASS_DARK, 0.5) : mix3(GRASS_DARK, GRASS_LIGHT, shade * 0.9);
          gi.push(grass.vertex(at(s, lat, p.h), frame.up, [lat / 5, s / 5], col));
        }
        // outer slope: the shoulder end plus each outer point, subdivided so sandstone bands and ridges read
        const outer: { u: number; h: number; cliff: number }[] = [];
        for (let k = 4; k + 1 < prof.length; k++) {
          const a0 = prof[k]!, b0 = prof[k + 1]!;
          for (let q = k === 4 ? 0 : 1; q <= 3; q++) {
            const t = q / 3;
            outer.push({ u: a0.u + (b0.u - a0.u) * t, h: a0.h + (b0.h - a0.h) * t, cliff: a0.cliff + (b0.cliff - a0.cliff) * t });
          }
        }
        outer.forEach((p, k) => {
          const ridge = (noise1(s * 0.5 + k * 2.3, side > 0 ? 41 : 42) - 0.5) * (p.cliff > 0.4 ? 3.0 : 0.6);
          const lat = side * (ROAD_HALF + p.u + ridge);
          const hillCol = mix3(GRASS_DARK, GRASS, 0.5 + 0.5 * noise1(s * 0.05 + k, 30));
          const bandT = 0.5 + 0.5 * Math.sin(p.h * 0.9 + noise1(s * 0.04 + k, 33) * 3);
          const rockCol = mix3(bandT > 0.66 ? ROCK_PALE : ROCK_GOLD, ROCK_RED, bandT < 0.28 ? 0.55 : 0.1);
          const lightSide = side < 0 ? 1.0 : 0.88;
          const baseCol = mix3(hillCol, mul3(rockCol, (0.86 + 0.22 * noise1(s * 0.2 + k, 31)) * lightSide), Math.min(1, p.cliff * 1.2));
          const fade = p.h < -26 ? smooth(-26, -42, p.h) : 0;
          si.push(slope.vertex(at(s, lat, p.h), [0, 1, 0], [s / 12, p.h / 10 + Math.abs(lat) / 40], mix3(baseCol, HAZE, fade * 0.6)));
        });
        const pg = prevG[String(side)], ps = prevS[String(side)];
        if (pg && gi.length === 5 && pg.length === 5 && !hole) for (let k = 0; k < 4; k++) { if (side > 0) grass.quad(pg[k]!, pg[k + 1]!, gi[k + 1]!, gi[k]!); else grass.quad(pg[k + 1]!, pg[k]!, gi[k]!, gi[k + 1]!); }
        if (ps) for (let k = 0; k + 1 < si.length; k++) { if (side > 0) slope.quad(ps[k]!, ps[k + 1]!, si[k + 1]!, si[k]!); else slope.quad(ps[k + 1]!, ps[k]!, si[k]!, si[k + 1]!); }
        prevG[String(side)] = gi.length === 5 ? gi : null;
        prevS[String(side)] = si;
      }
    }
    slope.computeNormals(); grass.computeNormals();
    if (road.indices.length) out.road.push(road);
    if (grass.indices.length) out.grass.push(grass);
    if (slope.indices.length) out.slope.push(slope);
  }
  return out;
}

/* ---------------------------------------------------------------- foliage, rocks, flowers */
export interface Placement { pos: V3; scale: number; yaw: number; /** Optional slope pitch/roll for grounded bank boulders. */ pitch?: number; roll?: number; /** Track distance and lateral offset of the foot (GU47 phase 4 ground shadows drape on these). */ s?: number; lat?: number }
export interface Scatter { trees: Mesh[]; bushes: Mesh[]; rocks: Mesh[]; flowers: Mesh[]; roundTrees: Placement[]; pineTrees: Placement[]; boulders: Placement[] }
const HERO_TREE_CAP = 150, HERO_ROCK_CAP = 90, HERO_NEAR = 24;

let treeParts: { trunk: Mesh; crowns: Mesh[] } | null = null;
function treeKit(): { trunk: Mesh; crowns: Mesh[] } {
  if (treeParts) return treeParts;
  const rnd = seeded(77);
  const trunk = cylinder(8, 0.4, 0.18, 1, hex("#573a22"), hex("#855d3b"));
  trunk.append(cylinder(8, 0.52, 0.36, 0.22, hex("#482f1b"), hex("#5e4026")), [0, 0, 0]);
  const crowns = [hex("#2f722e"), hex("#4c9238"), hex("#65a83e"), hex("#82bc48")].map((c) => icosphere(1, c, 0.18, rnd, true));
  treeParts = { trunk, crowns };
  return treeParts;
}

function treeAt(trees: Mesh, kit: { trunk: Mesh; crowns: Mesh[] }, rnd: () => number, base: V3, size: number): void {
  trees.append(kit.trunk, base, [size * 0.27, size * 0.66, size * 0.27], rnd() * 6.28);
  const c0 = kit.crowns[0]!, c1 = kit.crowns[1 + Math.floor(rnd() * 2)]!, c2 = kit.crowns[2 + Math.floor(rnd() * 2)]!;
  trees.append(c0, [base[0], base[1] + size * 0.62, base[2]], [size * 0.68, size * 0.42, size * 0.68], rnd() * 6.28);
  trees.append(c1, [base[0] + (rnd() - 0.5) * size * 0.28, base[1] + size * 0.88, base[2] + (rnd() - 0.5) * size * 0.28], [size * 0.54, size * 0.4, size * 0.54], rnd() * 6.28);
  trees.append(c2, [base[0] + (rnd() - 0.5) * size * 0.2, base[1] + size * 1.12, base[2] + (rnd() - 0.5) * size * 0.2], [size * 0.38, size * 0.34, size * 0.38], rnd() * 6.28);
}

/** Bushy forest masses on the valley floor beside the ridge (the dark green clumps the track looks out over). */
export function buildValleyForest(ch: Chapter): Mesh[] {
  const out: Mesh[] = [];
  const rnd = seeded(6161);
  const greens = [hex("#2f6a2c"), hex("#3c8434"), hex("#285f2b"), hex("#4f9a38"), hex("#6aa83c")];
  const blobs = greens.map((c, i) => icosphere(1, c, 0.18, seeded(70 + i), true));
  for (let c0 = -60; c0 < ch.length + 120; c0 += CHUNK * 2) {
    const m = new Mesh();
    for (let s = c0; s < c0 + CHUNK * 2; s += 5 + rnd() * 5) {
      for (const side of [-1, 1] as const) {
        const lat = side * (ROAD_HALF + 18 + Math.pow(rnd(), 1.6) * 130);
        const f = frameAt(s + rnd() * 6);
        const size = 5 + rnd() * 7 + (Math.abs(lat) > 80 ? 3 : 0);
        const base: V3 = [f.point[0] + f.right[0] * lat, f.point[1] - 42.5 + (rnd() - 0.5) * 2.5, f.point[2] + f.right[2] * lat];
        const n = 2 + Math.floor(rnd() * 2);
        for (let k = 0; k < n; k++) m.append(blobs[Math.floor(rnd() * blobs.length)]!, [base[0] + (rnd() - 0.5) * size, base[1] + size * 0.45, base[2] + (rnd() - 0.5) * size], [size * (0.7 + rnd() * 0.5), size * (0.62 + rnd() * 0.4), size * (0.7 + rnd() * 0.5)], rnd() * 6.28);
      }
    }
    if (m.indices.length) out.push(m);
  }
  return out;
}

export function buildScatter(ch: Chapter): Scatter {
  const out: Scatter = { trees: [], bushes: [], rocks: [], flowers: [], roundTrees: [], pineTrees: [], boulders: [] };
  const heroTree = (base: V3, height: number, lat: number, r: number, s: number): boolean => {
    if (Math.abs(lat) - ROAD_HALF > HERO_NEAR || out.roundTrees.length + out.pineTrees.length >= HERO_TREE_CAP) return false;
    (r < 0.45 ? out.pineTrees : out.roundTrees).push({ pos: base, scale: height, yaw: r * 40, s, lat });
    return true;
  };
  const kit = treeKit();
  const rnd = seeded(2024);
  const rockMesh = [0, 1, 2].map((i) => icosphere(1, mix3(hex("#bda27c"), hex("#8f7a5c"), i / 2), 0.22, seeded(90 + i), true));
  const curbMesh = [0, 1].map((i) => icosphere(0, mix3(hex("#cbb089"), hex("#967858"), i), 0.18, seeded(120 + i), true));
  const bushMesh = [0, 1].map((i) => {
    const sr = seeded(40 + i);
    const m = new Mesh();
    const dark = icosphere(1, hex("#376d2d"), 0.18, sr, true);
    const mid = icosphere(1, hex("#59993a"), 0.19, sr, true);
    const crown = icosphere(1, hex("#7fba46"), 0.16, sr, true);
    m.append(dark, [0, 0.02, 0], [1.05, 0.72, 1.05], 0.4);
    m.append(mid, [0.34, 0.22, 0.18], [0.74, 0.66, 0.74], 1.7);
    m.append(crown, [-0.24, 0.34, -0.14], [0.64, 0.58, 0.64], 3.1);
    return m;
  });
  const flowerColours = ["#fff2c8", "#ff8fa3", "#ffd25a", "#b9a3ff", "#ff9d4a", "#ffffff"].map(hex);
  const flowerCluster = ((): Mesh => {
    const m = new Mesh();
    const stemBase = hex("#3e752c"), stemTip = hex("#76b042"), petal = [1, 1, 1] as const, heart = hex("#ffbe3b");
    for (let b = 0; b < 3; b++) {
      const ang = (b / 3) * Math.PI * 2 + 0.35;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const i0 = m.vertex([-sa * 0.035, 0, ca * 0.035], [ca * 0.4, 0.9, sa * 0.4], [0, 0], stemBase);
      const i1 = m.vertex([sa * 0.035, 0, -ca * 0.035], [ca * 0.4, 0.9, sa * 0.4], [1, 0], stemBase);
      const i2 = m.vertex([ca * 0.17, 0.22 + (b % 2) * 0.05, sa * 0.17], [0, 1, 0], [0.5, 1], stemTip);
      m.tri(i0, i1, i2);
    }
    const c = m.vertex([0, 0.23, 0], [0, 1, 0], [0.5, 0.5], heart);
    const p0 = m.vertex([0.11, 0.26, 0], [0, 1, 0], [1, 0.5], petal);
    const p1 = m.vertex([0, 0.26, 0.11], [0, 1, 0], [0.5, 1], petal);
    const p2 = m.vertex([-0.11, 0.26, 0], [0, 1, 0], [0, 0.5], petal);
    const p3 = m.vertex([0, 0.26, -0.11], [0, 1, 0], [0.5, 0], petal);
    m.tri(c, p0, p1); m.tri(c, p1, p2); m.tri(c, p2, p3); m.tri(c, p3, p0);
    return m;
  })();
  const grassTuft = ((): Mesh => {
    const m = new Mesh();
    const root = hex("#3d722b"), tip = hex("#8ac24e");
    for (let b = 0; b < 3; b++) {
      const ang = (b / 3) * Math.PI * 2 + 0.2;
      const ca = Math.cos(ang), sa = Math.sin(ang);
      const i0 = m.vertex([-sa * 0.05, 0, ca * 0.05], [ca * 0.3, 0.95, sa * 0.3], [0, 0], root);
      const i1 = m.vertex([sa * 0.05, 0, -ca * 0.05], [ca * 0.3, 0.95, sa * 0.3], [1, 0], root);
      const i2 = m.vertex([ca * 0.2, 0.26, sa * 0.2], [0, 1, 0], [0.5, 1], tip);
      m.tri(i0, i1, i2);
    }
    return m;
  })();
  for (let c0 = -40; c0 < ch.length + 80; c0 += CHUNK) {
    const trees = new Mesh(), bushes = new Mesh(), rocks = new Mesh(), flowers = new Mesh();
    for (let s = c0; s < c0 + CHUNK; s += 1) {
      const cm = canyonMode(ch, s);
      const roadSolid = !isVoid(ch, s);
      for (const side of [-1, 1] as const) {
        // weathered sandstone verge curb stones & grass fringe soften the road-to-shoulder seam
        if (roadSolid && (Math.floor(s) + (side > 0 ? 1 : 0)) % 3 === 0) {
          const edgeLat = side * (ROAD_HALF + 0.14 + noise1(s * 0.7, side > 0 ? 51 : 52) * 0.32);
          const edgeBase = at(s, edgeLat, groundHeight(ch, s, edgeLat) - 0.05);
          rocks.append(curbMesh[Math.abs(Math.floor(s)) % 2]!, edgeBase, [0.42 + noise1(s * 1.1, 53) * 0.28, 0.16, 0.55 + noise1(s * 0.9, 54) * 0.3], yawOfEdge(s) + (noise1(s, 55) - 0.5) * 0.35);
          flowers.append(grassTuft, at(s + 0.4, side * (ROAD_HALF + 0.28), groundHeight(ch, s, side * (ROAD_HALF + 0.28))), 0.85 + noise1(s * 1.3, 56) * 0.45, s * 1.7);
        }
        // trees crown the wall tops; at drops only a few stand on the shoulder
        const op = openMode(s);
        const mode = cliffMode(s, side) * (1 - op);
        const prof = profile(ch, s, side);
        const wallTop = prof[prof.length - 1]!.u, shoulder = prof[4]!.u;
        if (mode < 0.55 && cm < 0.6 && rnd() < (op > 0.5 ? 0.22 : 0.62)) {
          const lat = side * (ROAD_HALF + (op > 0.5 ? shoulder + 1 + rnd() * 46 : wallTop - 1 + rnd() * 30));
          const base = at(s + (rnd() - 0.5) * 0.9, lat, groundHeight(ch, s, lat) - 0.15);
          const size = 4.4 + rnd() * 6;
          if (!heroTree(base, size * 1.4, lat, rnd(), s)) treeAt(trees, kit, rnd, base, size);
        } else if (mode >= 0.55 && rnd() < 0.1) {
          const lat = side * (ROAD_HALF + 2.2 + rnd() * Math.max(1, shoulder - 3));
          const base2 = at(s, lat, groundHeight(ch, s, lat) - 0.15), size2 = 3.6 + rnd() * 3;
          if (!heroTree(base2, size2 * 1.4, lat, rnd(), s)) treeAt(trees, kit, rnd, base2, size2);
        }
        if (rnd() < 0.22) {
          const gl = side * (ROAD_HALF + 1.3 + rnd() * Math.min(5, Math.max(1.5, shoulder - 0.5)));
          const base = at(s, gl, groundHeight(ch, s, gl) - 0.12);
          bushes.append(bushMesh[Math.floor(rnd() * 2)]!, base, [0.72 + rnd() * 0.88, 0.58 + rnd() * 0.58, 0.72 + rnd() * 0.88], rnd() * 6.28);
        }
        if (rnd() < 0.07) {
          const rawOffset = 0.9 + rnd() * 12;
          const maxSafeOffset = mode >= 0.45 ? Math.max(1.4, shoulder - 0.8) : 12.9;
          const gl = side * (ROAD_HALF + Math.min(rawOffset, maxSafeOffset));
          const rs: V3 = [0.8 + rnd() * 1.9, 0.6 + rnd() * 1.2, 0.8 + rnd() * 1.7], ry = rnd() * 6.28, rt = (rnd() - 0.5) * 0.3, rk = Math.floor(rnd() * 3);
          const hCenter = groundHeight(ch, s, gl);
          const hOut = groundHeight(ch, s, gl + side * 0.9), hIn = groundHeight(ch, s, gl - side * 0.9);
          const bankSlope = (hOut - hIn) / 1.8;
          const bScale = 1.1 + (rs[0] + rs[2]) * 0.55;
          const sink = 0.3 + Math.min(1.1, Math.abs(bankSlope) * 0.42 * bScale);
          const base = at(s, gl, hCenter - sink);
          if (Math.abs(gl) - ROAD_HALF < 14 && Math.abs(bankSlope) < 1.35 && out.boulders.length < HERO_ROCK_CAP) {
            const slopeRoll = Math.max(-0.45, Math.min(0.45, -side * Math.atan(bankSlope) * 0.65));
            out.boulders.push({ pos: base, scale: bScale, yaw: ry, pitch: rt * 0.5, roll: slopeRoll, s, lat: gl });
          } else {
            rocks.append(rockMesh[rk]!, base, rs, ry, rt);
          }
        }
        for (let k = 0; k < 2; k++) {
          if (rnd() < 0.55) {
            const gl = side * (ROAD_HALF + 0.55 + rnd() * Math.min(6.8, shoulder + 0.6));
            const base = at(s + rnd(), gl, groundHeight(ch, s, gl) + 0.01);
            flowers.append(flowerCluster, base, 0.72 + rnd() * 0.58, rnd() * 6.28, 0, flowerColours[Math.floor(rnd() * flowerColours.length)]!);
          }
        }
      }
    }
    if (trees.indices.length) out.trees.push(trees);
    if (bushes.indices.length) out.bushes.push(bushes);
    if (rocks.indices.length) out.rocks.push(rocks);
    if (flowers.indices.length) out.flowers.push(flowers);
  }
  return out;
}

const yawOfEdge = (s: number): number => { const f = frameAt(s).forward; return Math.atan2(f[0], f[2]); };

/** Position helper for props that stand on the ground at `s`, lateral `lat`. */
export function groundPoint(ch: Chapter, s: number, lat: number, lift = 0): V3 { return at(s, lat, groundHeight(ch, s, lat) + lift); }
