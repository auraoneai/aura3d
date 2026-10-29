/**
 * Aura Links 3D — course roster + deterministic terrain builder.
 *
 * Six courses × 9 authored holes. `buildHoleTerrain` turns a HoleSpec into
 * the single source of truth for ground height + surface zone, consumed by
 * both the physics sim and the scene mesh builder. Pure math — no engine
 * imports, no Math.random; all noise is seeded from (course.id, hole.number).
 */

import type {
  CourseId,
  CourseSpec,
  HoleLayout,
  HoleSpec,
  HoleTerrain,
  LieKind,
  Vec2,
  Vec3,
} from "./types";
import { ZONE_ORDER } from "./types";

/* ------------------------------------------------------------------ *
 *  Small math helpers                                                 *
 * ------------------------------------------------------------------ */

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / Math.max(1e-9, e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

/* ------------------------------------------------------------------ *
 *  Deterministic value noise (seeded — no Math.random)                *
 * ------------------------------------------------------------------ */

/** FNV-1a over the course id mixed with the hole number */
function seedCourse(id: string, n: number): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= Math.imul(n, 0x9e3779b9);
  h = Math.imul(h, 0x01000193);
  h ^= h >>> 13;
  return h >>> 0;
}

/** integer-lattice hash → [0,1) */
function hash2(ix: number, iz: number, seed: number): number {
  let h = seed ^ Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iz, 0x9e3779b9);
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** single-octave value noise → [0,1) */
function vnoise(x: number, z: number, seed: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);
  const a = hash2(ix, iz, seed);
  const b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed);
  const d = hash2(ix + 1, iz + 1, seed);
  return lerp(lerp(a, b, ux), lerp(c, d, ux), uz);
}

/** two octaves — ~22 m dunes + ~8 m bumps (input coords are metres) → [0,1) */
function fbm(x: number, z: number, seed: number): number {
  return (
    vnoise(x * 0.045, z * 0.045, seed) * 0.68 +
    vnoise(x * 0.12 + 31.7, z * 0.12 + 17.3, seed ^ 0x68bc21eb) * 0.32
  );
}

/* ------------------------------------------------------------------ *
 *  Authoring helpers                                                  *
 * ------------------------------------------------------------------ */

interface Disc {
  readonly center: Vec2;
  readonly radius: number;
}

const disc = (x: number, z: number, radius: number): Disc => ({ center: [x, z], radius });
const ev = (t: number, height: number): { readonly t: number; readonly height: number } => ({ t, height });

/**
 * Point + orientation frame on the path polyline at arc-length parameter t.
 * `rx/rz` is the right-of-line unit normal (+X when the segment runs +Z),
 * `dx/dz` the unit direction down-hole.
 */
function pathFrame(
  path: readonly Vec2[],
  t: number,
): { x: number; z: number; rx: number; rz: number; dx: number; dz: number } {
  const lens: number[] = [];
  let total = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const l = Math.hypot(path[i + 1][0] - path[i][0], path[i + 1][1] - path[i][1]);
    lens.push(l);
    total += l;
  }
  let target = clamp(t, 0, 1) * total;
  for (let i = 0; i + 1 < path.length; i++) {
    const l = lens[i];
    if (target <= l || i + 2 === path.length) {
      const a = path[i];
      const b = path[i + 1];
      const u = l > 1e-9 ? target / l : 0;
      const dx = (b[0] - a[0]) / (l || 1);
      const dz = (b[1] - a[1]) / (l || 1);
      return { x: a[0] + (b[0] - a[0]) * u, z: a[1] + (b[1] - a[1]) * u, rx: dz, rz: -dx, dx, dz };
    }
    target -= l;
  }
  const a = path[path.length - 1];
  return { x: a[0], z: a[1], rx: 1, rz: 0, dx: 0, dz: 1 };
}

/**
 * Bunker authors write placement intent, not absolute coords — the disc is
 * resolved against the hole's own path inside `hole()`:
 *  - `bunk(t, off, r)`   → `off` metres right(+)/left(-) of the centreline at t
 *  - `bunkG(lat, fwd, r)` → cup frame: `lat` lateral, `fwd` past(-)/short(+)
 */
type BunkerArg = Disc | ((path: readonly Vec2[]) => Disc);

const bunk =
  (t: number, off: number, radius: number) =>
  (path: readonly Vec2[]): Disc => {
    const f = pathFrame(path, t);
    return { center: [f.x + f.rx * off, f.z + f.rz * off], radius };
  };

const bunkG =
  (lat: number, fwd: number, radius: number) =>
  (path: readonly Vec2[]): Disc => {
    const f = pathFrame(path, 1);
    return { center: [f.x + f.rx * lat + f.dx * fwd, f.z + f.rz * lat + f.dz * fwd], radius };
  };

const hole = (
  number: number,
  name: string,
  par: 3 | 4 | 5,
  handicap: number,
  lengthM: number,
  layout: Omit<HoleLayout, "bunkers"> & { readonly bunkers: readonly BunkerArg[] },
): HoleSpec => ({
  number,
  name,
  par,
  handicap,
  lengthM,
  layout: {
    ...layout,
    bunkers: layout.bunkers.map((b) => (typeof b === "function" ? b(layout.path) : b)),
  },
});

/* ------------------------------------------------------------------ *
 *  ST. AURORAS LINKS — Scottish dunes, morning haar, marram rough      *
 * ------------------------------------------------------------------ */

const stAuroras: CourseSpec = {
  id: "stAuroras",
  name: "ST. AURORAS LINKS",
  shortName: "ST. AURORAS",
  tagline: "Windswept dunes and morning haar on the old country shore.",
  look: "outdoor-day",
  lookOverrides: { fogDensityScale: 0, exposureEv: -0.06 },
  gravity: 9.81,
  airDensity: 1.0,
  wind: { baseSpeed: 4.5, gust: 3.0 },
  palette: {
    accent: "#ffffff",
    fairway: "#2d7a3e",
    rough: "#1e562b",
    green: "#36964b",
    sand: "#d8b878",
    water: "#154c79",
    teeBox: "#2d7a3e",
    fringe: "#276b35",
  },
  dressing: {
    theme: "dunes",
    flora: ["marram-grass", "dune-bush", "sea-buckthorn"],
    landmarks: ["lighthouse", "stone-wall", "flag-pole"],
  },
  holes: [
    hole(1, "Dune Slack", 4, 5, 245, {
      path: [[0, 0], [10, 245]],
      fairwayWidth: 30,
      greenRadius: 11.5,
      teePos: [0, 0],
      bunkers: [
        bunk(0.26, -13.5, 5.2),
        bunk(0.42, 13.5, 5.6),
        bunk(0.64, -13, 5.4),
        bunkG(13, 1.5, 4.8),
        bunkG(-12, -2.5, 4.5)
      ],
      water: [disc(25, 115, 13)],
      woods: [disc(-26, 75, 16), disc(32, 85, 16), disc(-25, 165, 18), disc(34, 175, 18)],
      elevation: [ev(0, 1.8), ev(0.38, -0.8), ev(0.72, -0.3), ev(1, 1.6)],
      greenBreak: [0.25, -0.15],
      roughAmp: 0.65,
    }),
    hole(2, "Sea Pulpit", 5, 1, 415, {
      path: [[0, 0], [25, 160], [-10, 300], [15, 415]],
      fairwayWidth: 26,
      greenRadius: 10,
      teePos: [2, -3],
      bunkers: [bunk(0.36, 11.5, 6), bunk(0.7, -11.5, 5), bunkG(11.5, 2, 4), bunkG(-9, -5, 4)],
      water: [disc(35, 260, 9)],
      woods: [disc(45, 185, 20), disc(-40, 320, 22)],
      elevation: [ev(0, 0), ev(0.2, 4), ev(0.45, -5), ev(0.75, 3), ev(1, 2)],
      greenBreak: [0.3, 0.2],
      roughAmp: 1.7,
    }),
    hole(3, "Marram Bend", 4, 3, 270, {
      path: [[0, 0], [-15, 120], [-55, 270]],
      fairwayWidth: 27,
      greenRadius: 10.5,
      teePos: [0, 0],
      bunkers: [bunk(0.44, -12, 5), bunkG(-12, 2, 4.5), bunkG(10, -4, 4)],
      water: [],
      woods: [disc(25, 140, 22), disc(-82, 205, 18)],
      elevation: [ev(0, 2), ev(0.4, 6), ev(0.8, 0), ev(1, -2)],
      greenBreak: [-0.35, 0.1],
      roughAmp: 1.6,
    }),
    hole(4, "Fisher's Gap", 3, 8, 130, {
      path: [[0, 0], [5, 130]],
      fairwayWidth: 24,
      greenRadius: 12,
      teePos: [-2, -3],
      bunkers: [bunkG(13.5, 1, 4), bunkG(-12.5, -3, 3.5)],
      water: [disc(17, 95, 10)],
      woods: [],
      elevation: [ev(0, -1), ev(0.5, 2), ev(1, 0)],
      greenBreak: [0.15, 0.25],
      roughAmp: 1.4,
    }),
    hole(5, "Whip Grass", 4, 7, 230, {
      path: [[0, 0], [18, 110], [30, 230]],
      fairwayWidth: 29,
      greenRadius: 11,
      teePos: [0, 0],
      bunkers: [bunk(0.46, 13, 5), bunkG(12.5, 1.5, 4)],
      water: [],
      woods: [disc(-25, 140, 20), disc(52, 155, 18)],
      elevation: [ev(0, 1), ev(0.3, -4), ev(0.6, 2), ev(1, 4)],
      greenBreak: [-0.2, 0.3],
      roughAmp: 1.6,
    }),
    hole(6, "Kittiwake", 5, 2, 395, {
      path: [[0, 0], [-20, 140], [10, 270], [-15, 395]],
      fairwayWidth: 25,
      greenRadius: 10,
      teePos: [0, 0],
      bunkers: [bunk(0.34, -11, 6), bunk(0.7, 11, 5), bunkG(-11.5, 2, 4), bunkG(10, -3.5, 4.5)],
      water: [disc(-45, 300, 14)],
      woods: [disc(35, 200, 24), disc(-50, 185, 20)],
      elevation: [ev(0, 0), ev(0.25, 5), ev(0.55, -6), ev(0.85, 4), ev(1, 0)],
      greenBreak: [0.4, -0.1],
      roughAmp: 1.8,
    }),
    hole(7, "Salt Pan", 3, 9, 105, {
      path: [[0, 0], [-5, 105]],
      fairwayWidth: 26,
      greenRadius: 12.5,
      teePos: [0, 0],
      bunkers: [bunkG(-13, 1, 4), bunkG(12.5, -4, 4)],
      water: [disc(12, 78, 12)],
      woods: [disc(-25, 60, 15)],
      elevation: [ev(0, 0), ev(1, -3)],
      greenBreak: [-0.15, -0.2],
      roughAmp: 1.3,
    }),
    hole(8, "Long Slack", 4, 4, 285, {
      path: [[0, 0], [12, 150], [5, 285]],
      fairwayWidth: 27,
      greenRadius: 10,
      teePos: [1, -3],
      bunkers: [bunk(0.55, 12, 5.5), bunkG(-11.5, 1.5, 4.5)],
      water: [],
      woods: [disc(-30, 200, 22), disc(40, 100, 18)],
      elevation: [ev(0, 3), ev(0.35, -2), ev(0.7, 5), ev(1, 3)],
      greenBreak: [0.3, 0.15],
      roughAmp: 1.6,
    }),
    hole(9, "Home Dune", 4, 6, 255, {
      path: [[0, 0], [-8, 130], [0, 255]],
      fairwayWidth: 30,
      greenRadius: 11.5,
      teePos: [0, 0],
      bunkers: [bunk(0.5, -13.5, 5), bunkG(13, 2, 4), bunkG(-12, -3.5, 4)],
      water: [],
      woods: [disc(-35, 180, 20), disc(30, 160, 20)],
      elevation: [ev(0, 0), ev(0.4, 4), ev(0.8, -3), ev(1, 2)],
      greenBreak: [0.2, 0.25],
      roughAmp: 1.5,
    }),
  ],
};

/* ------------------------------------------------------------------ *
 *  MAPLE HOLLOW — calm parkland, pines and ponds                       *
 * ------------------------------------------------------------------ */

const mapleHollow: CourseSpec = {
  id: "mapleHollow",
  name: "MAPLE HOLLOW",
  shortName: "MAPLE HOLLOW",
  tagline: "Parkland calm beneath turning maples and still ponds.",
  look: "outdoor-day",
  lookOverrides: { fogDensityScale: 0, exposureEv: -0.06 },
  gravity: 9.81,
  airDensity: 1.0,
  wind: { baseSpeed: 1.2, gust: 0.8 },
  palette: {
    accent: "#c85a3a",
    fairway: "#3f8f4e",
    rough: "#2e7a42",
    green: "#4da35a",
    sand: "#e6d9b8",
    water: "#3e7fa6",
    teeBox: "#478f52",
    fringe: "#459a55",
  },
  dressing: {
    theme: "parkland",
    flora: ["maple-tree", "pine", "oak", "pond-reed"],
    landmarks: ["clubhouse", "footbridge", "gazebo"],
  },
  holes: [
    hole(1, "Orchard Gate", 4, 6, 240, {
      path: [[0, 0], [8, 240]],
      fairwayWidth: 32,
      greenRadius: 12,
      teePos: [0, 0],
      bunkers: [bunk(0.72, 14, 5), bunkG(-13.5, 1, 4.5)],
      water: [],
      woods: [disc(-28, 140, 22), disc(30, 120, 20)],
      elevation: [ev(0, 0), ev(0.5, 2), ev(1, 1)],
      greenBreak: [0.2, 0.15],
      roughAmp: 0.6,
    }),
    hole(2, "Maple Bend", 4, 3, 265, {
      path: [[0, 0], [15, 120], [45, 265]],
      fairwayWidth: 29,
      greenRadius: 11,
      teePos: [0, 0],
      bunkers: [bunk(0.44, 13, 5.5), bunkG(-12.5, 1.5, 4.5)],
      water: [],
      woods: [disc(-20, 150, 24), disc(62, 205, 20), disc(66, 265, 16)],
      elevation: [ev(0, 0), ev(0.4, 3), ev(0.75, 1), ev(1, -2)],
      greenBreak: [-0.25, 0.2],
      roughAmp: 0.7,
    }),
    hole(3, "Pond Hollow", 5, 1, 400, {
      path: [[0, 0], [-10, 150], [15, 280], [5, 400]],
      fairwayWidth: 27,
      greenRadius: 10.5,
      teePos: [2, -3],
      bunkers: [bunk(0.36, -12.5, 6), bunk(0.74, 12, 5), bunkG(12, 2, 4.5), bunkG(-11, -3.5, 4)],
      water: [disc(-25, 270, 18)],
      woods: [disc(30, 185, 25), disc(-40, 320, 22), disc(35, 352, 18)],
      elevation: [ev(0, 2), ev(0.3, -3), ev(0.6, 4), ev(1, 0)],
      greenBreak: [0.3, -0.2],
      roughAmp: 0.8,
    }),
    hole(4, "Cedar Post", 3, 5, 140, {
      path: [[0, 0], [-6, 140]],
      fairwayWidth: 25,
      greenRadius: 11,
      teePos: [0, 0],
      bunkers: [bunkG(-12.5, 1, 4.5), bunkG(11.5, -3, 4)],
      water: [disc(15, 122, 12)],
      woods: [disc(-26, 110, 18), disc(20, 62, 15)],
      elevation: [ev(0, 1), ev(0.5, -2), ev(1, 0)],
      greenBreak: [-0.2, 0.3],
      roughAmp: 0.6,
    }),
    hole(5, "Creek Turn", 4, 4, 255, {
      path: [[0, 0], [20, 130], [10, 255]],
      fairwayWidth: 28,
      greenRadius: 11,
      teePos: [0, 0],
      bunkers: [bunk(0.48, 12.5, 5), bunkG(-12.5, 1.5, 4.5)],
      water: [disc(-15, 190, 14)],
      woods: [disc(-35, 120, 20), disc(40, 180, 22)],
      elevation: [ev(0, 0), ev(0.35, 4), ev(0.7, -1), ev(1, 2)],
      greenBreak: [0.15, -0.25],
      roughAmp: 0.7,
    }),
    hole(6, "Amber Way", 5, 2, 425, {
      path: [[0, 0], [15, 160], [-15, 300], [20, 425]],
      fairwayWidth: 26,
      greenRadius: 10,
      teePos: [0, 0],
      bunkers: [bunk(0.36, 12, 6), bunk(0.72, -11.5, 5.5), bunkG(11.5, 1.5, 4.5)],
      water: [disc(-35, 220, 15)],
      woods: [disc(42, 145, 22), disc(-45, 305, 25), disc(45, 382, 18)],
      elevation: [ev(0, 0), ev(0.25, 5), ev(0.55, -4), ev(0.85, 6), ev(1, 4)],
      greenBreak: [-0.3, 0.15],
      roughAmp: 0.8,
    }),
    hole(7, "Stillwater", 3, 9, 115, {
      path: [[0, 0], [4, 115]],
      fairwayWidth: 27,
      greenRadius: 12,
      teePos: [-2, -3],
      bunkers: [bunkG(13.5, 0.5, 4)],
      water: [disc(-14, 94, 11)],
      woods: [disc(23, 82, 15), disc(-26, 60, 16)],
      elevation: [ev(0, 0), ev(1, -2)],
      greenBreak: [0.2, 0.1],
      roughAmp: 0.5,
    }),
    hole(8, "Ridge Maple", 4, 7, 275, {
      path: [[0, 0], [-18, 140], [-30, 275]],
      fairwayWidth: 30,
      greenRadius: 11.5,
      teePos: [0, 0],
      bunkers: [bunk(0.48, -13.5, 5), bunkG(-12.5, 1.5, 4.5)],
      water: [],
      woods: [disc(15, 155, 20), disc(-55, 200, 22), disc(-52, 292, 15)],
      elevation: [ev(0, 1), ev(0.3, 6), ev(0.65, 8), ev(1, 5)],
      greenBreak: [0.25, -0.2],
      roughAmp: 0.7,
    }),
    hole(9, "Homeward", 4, 8, 235, {
      path: [[0, 0], [6, 235]],
      fairwayWidth: 33,
      greenRadius: 12,
      teePos: [0, 0],
      bunkers: [bunk(0.78, 15, 5), bunkG(-13.5, 1, 4.5)],
      water: [disc(-20, 182, 10)],
      woods: [disc(28, 145, 20), disc(-30, 165, 22)],
      elevation: [ev(0, 0), ev(0.5, -2), ev(1, -1)],
      greenBreak: [-0.15, 0.2],
      roughAmp: 0.6,
    }),
  ],
};

/* ------------------------------------------------------------------ *
 *  CINDER RIM — volcanic crater rim, amber ash over basalt             *
 * ------------------------------------------------------------------ */

const cinderRim: CourseSpec = {
  id: "cinderRim",
  name: "CINDER RIM",
  shortName: "CINDER RIM",
  tagline: "Golf along a volcanic crater rim of amber ash and basalt.",
  look: "golden-hour",
  lookOverrides: { fogDensityScale: 0, exposureEv: 0.05 },
  gravity: 9.81,
  airDensity: 1.0,
  wind: { baseSpeed: 3.0, gust: 2.0 },
  palette: {
    accent: "#e8a04c",
    fairway: "#7a6a4a",
    rough: "#5f5240",
    green: "#7d9455",
    sand: "#3f3a36",
    water: "#d8541f",
    teeBox: "#7a6a4a",
    fringe: "#73824f",
  },
  dressing: {
    theme: "volcanic",
    flora: ["basalt-column", "obsidian-shard", "dead-tree"],
    landmarks: ["lava-vent", "crater-spire", "smoke-plume"],
  },
  holes: [
    hole(1, "Caldera Gate", 4, 7, 250, {
      path: [[0, 0], [10, 250]],
      fairwayWidth: 30,
      greenRadius: 11,
      teePos: [0, 0],
      bunkers: [bunk(0.72, 13.5, 5), bunkG(-12.5, 1.5, 4)],
      water: [],
      woods: [disc(-25, 140, 18), disc(28, 120, 20)],
      elevation: [ev(0, 4), ev(0.4, 8), ev(0.8, 2), ev(1, 3)],
      greenBreak: [0.3, 0.1],
      roughAmp: 0.9,
    }),
    hole(2, "Obsidian Run", 5, 2, 420, {
      path: [[0, 0], [20, 160], [-5, 290], [25, 420]],
      fairwayWidth: 26,
      greenRadius: 10,
      teePos: [0, 0],
      bunkers: [bunk(0.36, 11.5, 6), bunk(0.72, -11.5, 5.5), bunkG(11.5, 2, 4.5)],
      water: [disc(-30, 230, 12)],
      woods: [disc(42, 185, 22), disc(-40, 330, 20), disc(50, 300, 18)],
      elevation: [ev(0, 6), ev(0.3, 12), ev(0.6, 4), ev(0.85, 10), ev(1, 6)],
      greenBreak: [-0.35, 0.2],
      roughAmp: 1.1,
    }),
    hole(3, "Ash Pitch", 3, 8, 125, {
      path: [[0, 0], [-5, 125]],
      fairwayWidth: 26,
      greenRadius: 12,
      teePos: [-2, -3],
      bunkers: [bunkG(-13.5, 1, 5), bunkG(12.5, -3, 4), bunkG(0, -15, 3.5)],
      water: [],
      woods: [disc(-22, 90, 15), disc(20, 70, 14)],
      elevation: [ev(0, 5), ev(0.5, 9), ev(1, 7)],
      greenBreak: [0.2, -0.15],
      roughAmp: 0.8,
    }),
    hole(4, "Rim Walk", 4, 1, 280, {
      path: [[0, 0], [25, 140], [40, 280]],
      fairwayWidth: 24,
      greenRadius: 10,
      teePos: [0, 0],
      bunkers: [bunk(0.45, 10.5, 5), bunkG(11.5, 1.5, 4), bunkG(-9, -5.5, 4)],
      water: [],
      woods: [disc(57, 185, 20), disc(-20, 72, 15), disc(66, 262, 15)],
      elevation: [ev(0, 8), ev(0.35, 15), ev(0.7, 10), ev(1, 14)],
      greenBreak: [-0.4, 0.25],
      roughAmp: 1.2,
    }),
    hole(5, "Lava Slack", 4, 5, 235, {
      path: [[0, 0], [-15, 120], [-35, 235]],
      fairwayWidth: 29,
      greenRadius: 11,
      teePos: [0, 0],
      bunkers: [bunk(0.5, -13, 5), bunkG(-12.5, 1.5, 4.5)],
      water: [disc(-46, 165, 10)],
      woods: [disc(15, 150, 18), disc(-60, 195, 20)],
      elevation: [ev(0, 3), ev(0.4, -2), ev(0.8, 4), ev(1, 2)],
      greenBreak: [0.25, 0.3],
      roughAmp: 1.0,
    }),
    hole(6, "Sulphur Bench", 5, 3, 395, {
      path: [[0, 0], [10, 140], [-20, 280], [0, 395]],
      fairwayWidth: 27,
      greenRadius: 10.5,
      teePos: [2, -3],
      bunkers: [bunk(0.34, 12, 5.5), bunk(0.72, -12, 5), bunkG(-12, 1.5, 4.5)],
      water: [],
      woods: [disc(-45, 180, 22), disc(30, 245, 20), disc(-30, 360, 16)],
      elevation: [ev(0, 2), ev(0.25, 10), ev(0.55, 14), ev(0.8, 6), ev(1, 9)],
      greenBreak: [0.35, -0.2],
      roughAmp: 1.1,
    }),
    hole(7, "Cinder Pot", 3, 9, 95, {
      path: [[0, 0], [3, 95]],
      fairwayWidth: 28,
      greenRadius: 12.5,
      teePos: [0, 0],
      bunkers: [bunkG(14, 1, 4.5), bunkG(-13, -3, 4)],
      water: [],
      woods: [disc(18, 60, 14), disc(-20, 72, 15)],
      elevation: [ev(0, 1), ev(1, -1)],
      greenBreak: [-0.15, 0.2],
      roughAmp: 0.8,
    }),
    hole(8, "Vent Edge", 4, 4, 260, {
      path: [[0, 0], [18, 130], [30, 260]],
      fairwayWidth: 27,
      greenRadius: 10.5,
      teePos: [0, 0],
      bunkers: [bunk(0.46, 12, 5), bunkG(12, 1.5, 4.5)],
      water: [disc(42, 175, 9)],
      woods: [disc(-20, 160, 18), disc(50, 222, 16)],
      elevation: [ev(0, 6), ev(0.3, 12), ev(0.6, 7), ev(1, 11)],
      greenBreak: [0.3, 0.15],
      roughAmp: 1.0,
    }),
    hole(9, "Crater Rim", 5, 6, 360, {
      path: [[0, 0], [-10, 130], [15, 250], [-5, 360]],
      fairwayWidth: 28,
      greenRadius: 11,
      teePos: [0, 0],
      bunkers: [bunk(0.36, -12.5, 5.5), bunk(0.7, 12.5, 5), bunkG(-12.5, 1.5, 4.5)],
      water: [],
      woods: [disc(30, 180, 20), disc(-35, 280, 22), disc(25, 332, 15)],
      elevation: [ev(0, 10), ev(0.3, 16), ev(0.6, 12), ev(0.85, 18), ev(1, 15)],
      greenBreak: [-0.3, -0.15],
      roughAmp: 1.2,
    }),
  ],
};

/* ------------------------------------------------------------------ *
 *  CLOUD TERRACE — alpine shelves, thin air, big elevation deltas      *
 * ------------------------------------------------------------------ */

const cloudTerrace: CourseSpec = {
  id: "cloudTerrace",
  name: "CLOUD TERRACE",
  shortName: "CLOUD TERRACE",
  tagline: "Terraced alpine shelves above the clouds — thin air, long carries.",
  look: "alpine-snow",
  lookOverrides: { fogDensityScale: 0, exposureEv: -0.06 },
  gravity: 9.81,
  airDensity: 0.78,
  wind: { baseSpeed: 5.0, gust: 4.0 },
  palette: {
    accent: "#e8f2f8",
    fairway: "#6d9a58",
    rough: "#557f4b",
    green: "#7fae62",
    sand: "#cfc7b0",
    water: "#6fa8c8",
    teeBox: "#74a05c",
    fringe: "#79a65f",
  },
  dressing: {
    theme: "alpine",
    flora: ["alpine-fir", "pine", "snow-rock"],
    landmarks: ["cable-car", "chalet", "cairn"],
  },
  holes: [
    hole(1, "Terrace One", 4, 6, 260, {
      path: [[0, 0], [12, 260]],
      fairwayWidth: 30,
      greenRadius: 11,
      teePos: [0, 0],
      bunkers: [bunk(0.75, 13.5, 5), bunkG(-11, -3, 4.5)],
      water: [],
      woods: [disc(-28, 150, 22), disc(30, 130, 20)],
      elevation: [ev(0, 12), ev(0.35, 4), ev(0.7, 10), ev(1, 6)],
      greenBreak: [0.35, 0.2],
      roughAmp: 1.1,
    }),
    hole(2, "Cirque Bowl", 5, 1, 430, {
      path: [[0, 0], [-20, 160], [10, 300], [-15, 430]],
      fairwayWidth: 25,
      greenRadius: 10,
      teePos: [0, 0],
      bunkers: [bunk(0.36, -11.5, 6), bunk(0.72, 11, 5), bunkG(-11.5, 2, 4.5)],
      water: [disc(25, 252, 12)],
      woods: [disc(35, 185, 25), disc(-45, 325, 22), disc(20, 382, 18)],
      elevation: [ev(0, 20), ev(0.25, 8), ev(0.5, 18), ev(0.75, 4), ev(1, 12)],
      greenBreak: [-0.4, 0.25],
      roughAmp: 1.3,
    }),
    hole(3, "Alp Shelf", 3, 5, 145, {
      path: [[0, 0], [5, 145]],
      fairwayWidth: 24,
      greenRadius: 11,
      teePos: [-2, -3],
      bunkers: [bunkG(12.5, 1, 4.5), bunkG(-11.5, -3, 4)],
      water: [],
      woods: [disc(-22, 100, 16), disc(20, 72, 15)],
      elevation: [ev(0, 10), ev(0.6, 2), ev(1, 4)],
      greenBreak: [0.25, -0.2],
      roughAmp: 1.0,
    }),
    hole(4, "Marmot Run", 4, 8, 240, {
      path: [[0, 0], [-12, 120], [-30, 240]],
      fairwayWidth: 31,
      greenRadius: 11.5,
      teePos: [0, 0],
      bunkers: [bunk(0.48, -14, 5), bunkG(-13, 1.5, 4.5)],
      water: [],
      woods: [disc(12, 155, 18), disc(-56, 195, 22)],
      elevation: [ev(0, 6), ev(0.4, 14), ev(0.8, 8), ev(1, 10)],
      greenBreak: [-0.3, 0.15],
      roughAmp: 1.1,
    }),
    hole(5, "Glacier Drop", 3, 9, 110, {
      path: [[0, 0], [0, 110]],
      fairwayWidth: 26,
      greenRadius: 12,
      teePos: [0, 0],
      bunkers: [bunkG(13.5, 1, 4.5), bunkG(-12.5, -3, 4)],
      water: [disc(14, 86, 9)],
      woods: [disc(-21, 70, 15)],
      elevation: [ev(0, 8), ev(1, -6)],
      greenBreak: [0.2, 0.3],
      roughAmp: 0.9,
    }),
    hole(6, "Serac Wall", 5, 2, 405, {
      path: [[0, 0], [18, 140], [-10, 270], [15, 405]],
      fairwayWidth: 26,
      greenRadius: 10,
      teePos: [0, 0],
      bunkers: [bunk(0.34, 11.5, 5.5), bunk(0.7, -11.5, 5), bunkG(11.5, 1.5, 4.5)],
      water: [disc(-30, 210, 11)],
      woods: [disc(40, 165, 20), disc(-40, 302, 20), disc(35, 362, 16)],
      elevation: [ev(0, 5), ev(0.3, 18), ev(0.55, 8), ev(0.8, 20), ev(1, 14)],
      greenBreak: [0.4, -0.3],
      roughAmp: 1.3,
    }),
    hole(7, "Chalet Turn", 4, 4, 275, {
      path: [[0, 0], [22, 130], [35, 275]],
      fairwayWidth: 28,
      greenRadius: 11,
      teePos: [1, -3],
      bunkers: [bunk(0.44, 12.5, 5), bunkG(12.5, 1.5, 4.5)],
      water: [],
      woods: [disc(-12, 165, 20), disc(56, 205, 20), disc(58, 282, 15)],
      elevation: [ev(0, 14), ev(0.35, 6), ev(0.7, 16), ev(1, 10)],
      greenBreak: [-0.25, 0.35],
      roughAmp: 1.1,
    }),
    hole(8, "Col Crossing", 4, 7, 225, {
      path: [[0, 0], [-8, 115], [0, 225]],
      fairwayWidth: 30,
      greenRadius: 11,
      teePos: [0, 0],
      bunkers: [bunk(0.5, -13.5, 5), bunkG(-12.5, 1.5, 4)],
      water: [],
      woods: [disc(-30, 145, 18), disc(25, 92, 16)],
      elevation: [ev(0, 2), ev(0.45, 22), ev(1, 8)],
      greenBreak: [0.3, -0.1],
      roughAmp: 1.2,
    }),
    hole(9, "Summit Home", 5, 3, 385, {
      path: [[0, 0], [10, 140], [-15, 260], [5, 385]],
      fairwayWidth: 27,
      greenRadius: 11.5,
      teePos: [0, 0],
      bunkers: [bunk(0.36, 12, 5.5), bunk(0.7, -12, 5), bunkG(13, 1.5, 4.5)],
      water: [],
      woods: [disc(-30, 185, 20), disc(30, 302, 22)],
      elevation: [ev(0, 0), ev(0.3, 12), ev(0.6, 18), ev(0.85, 26), ev(1, 24)],
      greenBreak: [-0.35, 0.2],
      roughAmp: 1.2,
    }),
  ],
};

/* ------------------------------------------------------------------ *
 *  NEON BAY — floodlit night golf under a skyline                      *
 * ------------------------------------------------------------------ */

const neonBay: CourseSpec = {
  id: "neonBay",
  name: "NEON BAY",
  shortName: "NEON BAY",
  tagline: "Floodlit night golf along the harbour under a neon skyline.",
  look: "night-city",
  lookOverrides: { fogDensityScale: 0, exposureEv: 0.08 },
  gravity: 9.81,
  airDensity: 1.0,
  wind: { baseSpeed: 2.0, gust: 1.5 },
  palette: {
    accent: "#19e0ff",
    fairway: "#1f6a52",
    rough: "#17563f",
    green: "#2a8a66",
    sand: "#4a4a55",
    water: "#2ac8d8",
    teeBox: "#21604b",
    fringe: "#247a5a",
  },
  dressing: {
    theme: "nightCity",
    flora: ["neon-palm", "light-tower", "holo-sign"],
    landmarks: ["skyline", "harbour-crane", "billboard"],
  },
  holes: [
    hole(1, "Neon Mile", 4, 5, 250, {
      path: [[0, 0], [10, 250]],
      fairwayWidth: 32,
      greenRadius: 12,
      teePos: [0, 0],
      bunkers: [bunk(0.78, 14.5, 5), bunkG(13.5, 1, 4.5)],
      water: [],
      woods: [disc(-26, 150, 16), disc(28, 120, 18)],
      elevation: [ev(0, 0), ev(0.5, 1), ev(1, 0)],
      greenBreak: [0.2, 0.15],
      roughAmp: 0.6,
    }),
    hole(2, "Harbour Lights", 5, 2, 410, {
      path: [[0, 0], [20, 160], [-15, 290], [10, 410]],
      fairwayWidth: 27,
      greenRadius: 10.5,
      teePos: [0, 0],
      bunkers: [bunk(0.36, 12, 5.5), bunk(0.72, -12, 5), bunkG(12, 1.5, 4.5)],
      water: [disc(-35, 240, 16), disc(30, 332, 12)],
      woods: [disc(40, 172, 18), disc(-45, 342, 20)],
      elevation: [ev(0, 1), ev(0.3, -1), ev(0.6, 2), ev(1, 0)],
      greenBreak: [-0.3, 0.2],
      roughAmp: 0.7,
    }),
    hole(3, "Metro Pitch", 3, 8, 120, {
      path: [[0, 0], [-4, 120]],
      fairwayWidth: 26,
      greenRadius: 12,
      teePos: [-2, -3],
      bunkers: [bunkG(-13.5, 1, 4.5), bunkG(12.5, -3, 4)],
      water: [disc(12, 96, 9)],
      woods: [disc(-20, 80, 14)],
      elevation: [ev(0, 2), ev(1, 0)],
      greenBreak: [0.15, -0.25],
      roughAmp: 0.5,
    }),
    hole(4, "Canal Bend", 4, 3, 270, {
      path: [[0, 0], [18, 130], [45, 270]],
      fairwayWidth: 28,
      greenRadius: 11,
      teePos: [0, 0],
      bunkers: [bunk(0.46, 12.5, 5), bunkG(12.5, 1.5, 4.5)],
      water: [disc(33, 196, 12)],
      woods: [disc(-15, 160, 18), disc(62, 232, 15)],
      elevation: [ev(0, 0), ev(0.4, 2), ev(0.7, 0), ev(1, -1)],
      greenBreak: [0.25, 0.3],
      roughAmp: 0.7,
    }),
    hole(5, "Skyline", 4, 7, 235, {
      path: [[0, 0], [-12, 118], [-25, 235]],
      fairwayWidth: 30,
      greenRadius: 11.5,
      teePos: [0, 0],
      bunkers: [bunk(0.48, -13.5, 5), bunkG(-13, 1.5, 4.5)],
      water: [],
      woods: [disc(15, 152, 16), disc(-48, 182, 18), disc(30, 222, 14)],
      elevation: [ev(0, 1), ev(0.35, 3), ev(0.75, 0), ev(1, 2)],
      greenBreak: [-0.2, 0.2],
      roughAmp: 0.6,
    }),
    hole(6, "Dockside", 5, 1, 390, {
      path: [[0, 0], [-18, 150], [10, 270], [-8, 390]],
      fairwayWidth: 25,
      greenRadius: 10,
      teePos: [0, 0],
      bunkers: [bunk(0.36, -11.5, 6), bunk(0.72, 11, 5.5), bunkG(-11.5, 1.5, 4.5)],
      water: [disc(-38, 200, 15), disc(22, 320, 11)],
      woods: [disc(30, 182, 18), disc(-45, 332, 18)],
      elevation: [ev(0, 0), ev(0.3, 2), ev(0.6, -2), ev(0.85, 1), ev(1, -1)],
      greenBreak: [0.35, -0.15],
      roughAmp: 0.8,
    }),
    hole(7, "Lumen Short", 3, 9, 95, {
      path: [[0, 0], [3, 95]],
      fairwayWidth: 28,
      greenRadius: 12.5,
      teePos: [0, 0],
      bunkers: [bunkG(14, 1, 4), bunkG(-13, -3.5, 4)],
      water: [],
      woods: [disc(18, 58, 12), disc(-18, 70, 14)],
      elevation: [ev(0, 0), ev(1, 1)],
      greenBreak: [-0.15, 0.15],
      roughAmp: 0.5,
    }),
    hole(8, "Overpass", 4, 4, 285, {
      path: [[0, 0], [15, 140], [25, 285]],
      fairwayWidth: 27,
      greenRadius: 10.5,
      teePos: [2, -3],
      bunkers: [bunk(0.44, 12, 5.5), bunkG(12, 1.5, 4.5)],
      water: [disc(-18, 200, 10)],
      woods: [disc(40, 162, 16), disc(-30, 242, 18)],
      elevation: [ev(0, 2), ev(0.4, -1), ev(0.7, 3), ev(1, 1)],
      greenBreak: [0.3, 0.2],
      roughAmp: 0.7,
    }),
    hole(9, "Bay Front", 4, 6, 245, {
      path: [[0, 0], [-10, 125], [0, 245]],
      fairwayWidth: 29,
      greenRadius: 11.5,
      teePos: [0, 0],
      bunkers: [bunk(0.5, -13, 5), bunkG(13, 1.5, 4.5)],
      water: [disc(25, 182, 14)],
      woods: [disc(-28, 162, 16), disc(35, 262, 14)],
      elevation: [ev(0, 1), ev(0.5, 2), ev(1, 0)],
      greenBreak: [0.2, -0.3],
      roughAmp: 0.6,
    }),
  ],
};

/* ------------------------------------------------------------------ *
 *  MARE COURSE — Sea of Tranquility, 1/6 gravity, crater bowls         *
 * ------------------------------------------------------------------ */

const mareCourse: CourseSpec = {
  id: "mareCourse",
  name: "MARE COURSE",
  shortName: "MARE",
  tagline: "Low-gravity golf in the Sea of Tranquility — watch the earthrise.",
  look: "space",
  lookOverrides: { fogDensityScale: 0, exposureEv: 0.05 },
  gravity: 1.62,
  airDensity: 0.0,
  wind: { baseSpeed: 0.0, gust: 0.0 },
  palette: {
    accent: "#d8b45a",
    fairway: "#8e9096",
    rough: "#7a7d84",
    green: "#a2a4aa",
    sand: "#6a6d74",
    water: "#20242e",
    teeBox: "#8e9096",
    fringe: "#94969c",
  },
  dressing: {
    theme: "lunar",
    flora: ["regolith-boulder", "crater-rim", "rock"],
    landmarks: ["lander", "rover", "flag"],
  },
  holes: [
    hole(1, "Tranquility Base", 4, 6, 260, {
      path: [[0, 0], [8, 260]],
      fairwayWidth: 32,
      greenRadius: 12,
      teePos: [0, 0],
      bunkers: [bunk(0.72, 14, 6), bunkG(-13, -3, 5), bunkG(13.5, 1, 4.5)],
      water: [],
      woods: [disc(-30, 150, 20), disc(28, 132, 22)],
      elevation: [ev(0, 0), ev(0.3, -6), ev(0.6, 4), ev(1, -2)],
      greenBreak: [0.25, 0.15],
      roughAmp: 2.0,
    }),
    hole(2, "Sea of Nectar", 5, 1, 430, {
      path: [[0, 0], [22, 160], [-12, 300], [18, 430]],
      fairwayWidth: 26,
      greenRadius: 10.5,
      teePos: [0, 0],
      bunkers: [bunk(0.34, 11.5, 7), bunk(0.72, -11.5, 6), bunkG(12, 2, 5), bunkG(-10, -4, 4.5)],
      water: [],
      woods: [disc(-42, 225, 24), disc(42, 265, 20), disc(-35, 372, 18)],
      elevation: [ev(0, 4), ev(0.25, -10), ev(0.5, 8), ev(0.75, -8), ev(1, 2)],
      greenBreak: [-0.4, 0.2],
      roughAmp: 2.4,
    }),
    hole(3, "Little West", 3, 8, 130, {
      path: [[0, 0], [-6, 130]],
      fairwayWidth: 26,
      greenRadius: 11,
      teePos: [-2, -3],
      bunkers: [bunkG(-12.5, 1.5, 5), bunkG(12, -3, 4.5)],
      water: [],
      woods: [disc(-24, 92, 16), disc(20, 76, 15)],
      elevation: [ev(0, 3), ev(0.5, -5), ev(1, -2)],
      greenBreak: [0.2, -0.25],
      roughAmp: 1.8,
    }),
    hole(4, "Rill Edge", 4, 3, 275, {
      path: [[0, 0], [20, 130], [38, 275]],
      fairwayWidth: 27,
      greenRadius: 10.5,
      teePos: [0, 0],
      bunkers: [bunk(0.45, 12, 6), bunkG(12, 1.5, 5)],
      water: [],
      woods: [disc(-15, 162, 20), disc(56, 222, 18), disc(60, 282, 14)],
      elevation: [ev(0, 2), ev(0.35, 10), ev(0.7, 4), ev(1, 8)],
      greenBreak: [0.35, 0.25],
      roughAmp: 2.2,
    }),
    hole(5, "Dust Bowl", 4, 7, 235, {
      path: [[0, 0], [-12, 115], [-28, 235]],
      fairwayWidth: 30,
      greenRadius: 11.5,
      teePos: [0, 0],
      bunkers: [bunk(0.48, -13.5, 6), bunkG(-13, 1.5, 5), bunkG(12, -3.5, 4)],
      water: [],
      woods: [disc(12, 152, 18), disc(-52, 188, 20)],
      elevation: [ev(0, 0), ev(0.4, -8), ev(0.8, -4), ev(1, -6)],
      greenBreak: [-0.3, 0.15],
      roughAmp: 2.3,
    }),
    hole(6, "Eagle's Rest", 5, 2, 400, {
      path: [[0, 0], [-15, 150], [12, 280], [-10, 400]],
      fairwayWidth: 26,
      greenRadius: 10,
      teePos: [0, 0],
      bunkers: [bunk(0.36, -11.5, 7), bunk(0.72, 11.5, 6), bunkG(-11.5, 2, 5)],
      water: [],
      woods: [disc(30, 192, 22), disc(-40, 312, 24), disc(25, 362, 16)],
      elevation: [ev(0, 6), ev(0.25, -4), ev(0.55, 10), ev(0.8, -6), ev(1, 4)],
      greenBreak: [0.4, -0.3],
      roughAmp: 2.4,
    }),
    hole(7, "Crater Short", 3, 9, 100, {
      path: [[0, 0], [4, 100]],
      fairwayWidth: 28,
      greenRadius: 12.5,
      teePos: [0, 0],
      bunkers: [bunkG(14, 1, 5), bunkG(-13, -3, 4.5)],
      water: [],
      woods: [disc(22, 60, 14), disc(-20, 76, 15)],
      elevation: [ev(0, 0), ev(1, 3)],
      greenBreak: [-0.15, 0.2],
      roughAmp: 1.8,
    }),
    hole(8, "Hadley Turn", 4, 4, 285, {
      path: [[0, 0], [15, 140], [30, 285]],
      fairwayWidth: 27,
      greenRadius: 10.5,
      teePos: [2, -3],
      bunkers: [bunk(0.44, 12, 6), bunkG(12, 1.5, 5)],
      water: [],
      woods: [disc(-20, 182, 20), disc(48, 232, 18)],
      elevation: [ev(0, 4), ev(0.35, -6), ev(0.65, 8), ev(1, 2)],
      greenBreak: [0.3, -0.2],
      roughAmp: 2.2,
    }),
    hole(9, "Earthrise", 5, 5, 375, {
      path: [[0, 0], [-10, 140], [15, 260], [-5, 375]],
      fairwayWidth: 28,
      greenRadius: 11.5,
      teePos: [0, 0],
      bunkers: [bunk(0.36, -12.5, 6), bunk(0.72, 12.5, 5.5), bunkG(-13, 1.5, 5)],
      water: [],
      woods: [disc(28, 202, 20), disc(-35, 292, 22)],
      elevation: [ev(0, -2), ev(0.3, 8), ev(0.6, -4), ev(0.85, 10), ev(1, 6)],
      greenBreak: [-0.35, 0.25],
      roughAmp: 2.3,
    }),
  ],
};

/* ------------------------------------------------------------------ *
 *  Exports: roster                                                    *
 * ------------------------------------------------------------------ */

export const COURSES: Record<CourseId, CourseSpec> = {
  stAuroras,
  mapleHollow,
  cinderRim,
  cloudTerrace,
  neonBay,
  mareCourse,
};

export const COURSE_ORDER: readonly CourseId[] = [
  "stAuroras",
  "mapleHollow",
  "cinderRim",
  "cloudTerrace",
  "neonBay",
  "mareCourse",
];

/* ------------------------------------------------------------------ *
 *  buildHoleTerrain — HoleSpec → playable surface                      *
 * ------------------------------------------------------------------ */

const BOUNDS_MARGIN = 60;

export function buildHoleTerrain(course: CourseSpec, hole: HoleSpec): HoleTerrain {
  const layout = hole.layout;
  const path = layout.path;
  const seed = seedCourse(course.id, hole.number);

  // Arc-length parameterisation of the path polyline.
  const segs: { ax: number; az: number; dx: number; dz: number; len: number; cum: number }[] = [];
  let totalLen = 0;
  for (let i = 0; i + 1 < path.length; i++) {
    const a = path[i];
    const b = path[i + 1];
    const dx = b[0] - a[0];
    const dz = b[1] - a[1];
    const len = Math.hypot(dx, dz);
    segs.push({ ax: a[0], az: a[1], dx, dz, len, cum: totalLen });
    totalLen += len;
  }
  const invLen = totalLen > 1e-6 ? 1 / totalLen : 0;

  const cupX = path[path.length - 1][0];
  const cupZ = path[path.length - 1][1];
  const teeX = layout.teePos[0];
  const teeZ = layout.teePos[1];
  const fairHalf = layout.fairwayWidth * 0.5;
  const greenR = layout.greenRadius;
  const roughBand = layout.fairwayWidth * 1.6;
  const rocky = course.id === "cinderRim" || course.id === "mareCourse";

  // Generous bounds: path bounding box + margin on every side.
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of path) {
    if (p[0] < minX) minX = p[0];
    if (p[0] > maxX) maxX = p[0];
    if (p[1] < minZ) minZ = p[1];
    if (p[1] > maxZ) maxZ = p[1];
  }
  minX -= BOUNDS_MARGIN;
  maxX += BOUNDS_MARGIN;
  minZ -= BOUNDS_MARGIN;
  maxZ += BOUNDS_MARGIN;
  const bounds = { minX, maxX, minZ, maxZ };

  /** Project (x,z) onto the path → path parameter t∈[0,1] + lateral distance d */
  const project = (x: number, z: number): { t: number; d: number } => {
    let bestD2 = Number.POSITIVE_INFINITY;
    let bestT = 0;
    for (const s of segs) {
      const px = x - s.ax;
      const pz = z - s.az;
      const l2 = s.len * s.len;
      const u = l2 > 1e-9 ? clamp((px * s.dx + pz * s.dz) / l2, 0, 1) : 0;
      const qx = px - s.dx * u;
      const qz = pz - s.dz * u;
      const d2 = qx * qx + qz * qz;
      if (d2 < bestD2) {
        bestD2 = d2;
        bestT = (s.cum + u * s.len) * invLen;
      }
    }
    return { t: bestT, d: Math.sqrt(bestD2) };
  };

  /** Base elevation: smoothstep-blended between authored samples along t */
  const elevAt = (t: number): number => {
    const s = layout.elevation;
    if (t <= s[0].t) return s[0].height;
    const last = s[s.length - 1];
    if (t >= last.t) return last.height;
    for (let i = 0; i + 1 < s.length; i++) {
      const a = s[i];
      const b = s[i + 1];
      if (t <= b.t) {
        const u = (t - a.t) / Math.max(1e-6, b.t - a.t);
        return lerp(a.height, b.height, u * u * (3 - 2 * u));
      }
    }
    return last.height;
  };

  const teePadH = elevAt(0) + 0.15; // flat pad height for the tee box

  const surface = (x: number, z: number): number => {
    const p = project(x, z);
    const cupD = Math.hypot(x - cupX, z - cupZ);
    let h = elevAt(p.t);

    // Gentle crown down the fairway core (~+0.15 m)
    h += 0.15 * (1 - smoothstep(fairHalf * 0.4, fairHalf, p.d));

    // Dune/crater noise: zero on the fairway and inside the green, ramping
    // up through the rough transition band.
    const roughMask = smoothstep(fairHalf, fairHalf + 9, p.d) * smoothstep(greenR, greenR + 5, cupD);
    if (roughMask > 0.001 && layout.roughAmp > 0) {
      h += (fbm(x, z, seed) - 0.5) * 2 * layout.roughAmp * roughMask;
    }

    // Authored green break: metres of tilt across the green surface, faded
    // out through the fringe so the surface stays continuous.
    if (cupD < greenR + 3) {
      const m = 1 - smoothstep(greenR * 0.7, greenR + 2.5, cupD);
      h += ((layout.greenBreak[0] * (x - cupX) + layout.greenBreak[1] * (z - cupZ)) / greenR) * m;
    }

    // Bunker bowls
    for (const b of layout.bunkers) {
      const d = Math.hypot(x - b.center[0], z - b.center[1]);
      if (d < b.radius) h -= 0.3 * (1 - smoothstep(b.radius * 0.45, b.radius, d));
    }
    return h;
  };

  // Ponds sit in a level basin: the ground inside 1.25x the hazard radius
  // blends to one level (the turf height at the pond centre), so the flat
  // water surface meets the bank at the hazard radius on every side.
  const pondLevels = layout.water.map((w) => surface(w.center[0], w.center[1]));

  const height = (x: number, z: number): number => {
    let h = surface(x, z);
    for (let i = 0; i < layout.water.length; i++) {
      const w = layout.water[i]!;
      const d = Math.hypot(x - w.center[0], z - w.center[1]);
      if (d < w.radius * POND_BASIN) h = lerp(pondLevels[i]!, h, smoothstep(w.radius, w.radius * POND_BASIN, d));
      if (d < w.radius) h -= POND_DEPTH * (1 - smoothstep(w.radius * 0.55, w.radius, d));
    }

    // Tee box: flatten everything into a level pad
    const teeD = Math.hypot(x - teeX, z - teeZ);
    return lerp(teePadH, h, smoothstep(5, 10, teeD));
  };

  const zone = (x: number, z: number): LieKind => {
    for (const w of layout.water) {
      if (Math.hypot(x - w.center[0], z - w.center[1]) <= w.radius) return "water";
    }
    for (const b of layout.bunkers) {
      if (Math.hypot(x - b.center[0], z - b.center[1]) <= b.radius) return "sand";
    }
    const cupD = Math.hypot(x - cupX, z - cupZ);
    if (cupD <= greenR) return "green";
    if (cupD <= greenR + 2.5) return "fringe";
    if (Math.abs(x - teeX) <= 4 && Math.abs(z - teeZ) <= 4.5) return "tee";
    const p = project(x, z);
    if (p.d <= fairHalf) return "fairway";
    if (rocky) {
      // Volcanic/lunar: "woods" discs are rock fields
      for (const wds of layout.woods) {
        if (Math.hypot(x - wds.center[0], z - wds.center[1]) <= wds.radius) return "rock";
      }
    }
    if (p.d <= roughBand || (x >= minX && x <= maxX && z >= minZ && z <= maxZ)) return "rough";
    return "oob";
  };

  const slope = (x: number, z: number): Vec2 => {
    const e = 0.5;
    return [
      (height(x + e, z) - height(x - e, z)) / (2 * e),
      (height(x, z + e) - height(x, z - e)) / (2 * e),
    ];
  };

  const cupDistance = (x: number, z: number): number => Math.hypot(x - cupX, z - cupZ);

  const cup: Vec3 = [cupX, height(cupX, cupZ), cupZ];
  const tee: Vec3 = [teeX, height(teeX, teeZ), teeZ];

  // Yaw facing the first path segment (+Z is down-hole, so ~0 for a straight hole)
  const lineYaw = Math.atan2(path[1][0] - path[0][0], path[1][1] - path[0][1]);

  const grid = (columns: number, rows: number): { heights: Float32Array; zones: Uint8Array } => {
    const cx = Math.max(1, Math.floor(columns));
    const rx = Math.max(1, Math.floor(rows));
    const heights = new Float32Array(cx * rx);
    const zones = new Uint8Array(cx * rx);
    for (let r = 0; r < rx; r++) {
      const z = rx === 1 ? (minZ + maxZ) * 0.5 : lerp(minZ, maxZ, r / (rx - 1));
      for (let c = 0; c < cx; c++) {
        const x = cx === 1 ? (minX + maxX) * 0.5 : lerp(minX, maxX, c / (cx - 1));
        const i = r * cx + c;
        heights[i] = height(x, z);
        zones[i] = ZONE_ORDER.indexOf(zone(x, z));
      }
    }
    return { heights, zones };
  };

  return { height, zone, slope, cupDistance, cup, tee, lineYaw, bounds, grid };
}

/** ponds: depth of the bowl and the radius multiple of the level basin around it */
export const POND_DEPTH = 0.7;
export const POND_BASIN = 1.25;
/** how far the drawn water surface sits below the bank level (m) */
export const POND_SURFACE_DROP = 0.03;

/**
 * Drawn pond for a water hazard. Cylinder `size` is a diameter, so the water
 * disc is 0.98 of the hazard diameter and the dark rim the full diameter; the
 * surface sits just under the level bank, so the visible water edge lands at
 * about 0.95 of the hazard radius on every side.
 */
export function pondGeometry(
  terrain: HoleTerrain,
  w: { readonly center: Vec2; readonly radius: number }
): { surfaceY: number; pondDiameter: number; rimDiameter: number } {
  let sum = 0;
  const n = 16;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    sum += terrain.height(w.center[0] + Math.cos(a) * w.radius, w.center[1] + Math.sin(a) * w.radius);
  }
  return { surfaceY: sum / n - POND_SURFACE_DROP, pondDiameter: w.radius * 2 * 0.98, rimDiameter: w.radius * 2 };
}
