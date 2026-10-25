/**
 * Strange Orbit course topology and static definitions. Ported from the
 * original's `src/course.js` plus the course-layout helpers the bundle emits
 * outside any `//#region src/` marker (split/opal sections, island tiles, gates,
 * lane-offset functions); see PORTING-NOTES.md. Pure data and arithmetic.
 */

export type Vehicle = "bike" | "skate";
export type Route = "main" | "upper" | "lower" | "islands" | "bypass";
export type Difficulty = "explorer" | "racer" | "expert";
export type Mode = "cup" | "trial" | "free";

/** Length of one orbit in course units. */
export const COURSE_LENGTH = 1450;

export const CRYSTAL_CAVE = { start: 0.205, end: 0.405, entrance: 0.23, exit: 0.38 } as const;

/** Painted split: the main road forks into upper/lower lines. */
export const SPLIT = { start: 165, end: 290 } as const;
/** Opal steps: bypass lane or jump across the island platforms. */
export const OPAL = { start: 1165, end: 1335 } as const;

export interface IslandTile { readonly id: number; readonly start: number; readonly end: number; readonly height: number }
export const ISLAND_TILES: readonly IslandTile[] = Array.from({ length: 6 }, (_, t) => ({
  id: t,
  start: 1181 + t * 24.5,
  end: 1195 + t * 24.5,
  height: [0.7, 1.8, 0.3, 2, 1.1, 0][t]!
}));

export interface Gate { readonly s: number; readonly name: string }
export const GATES: readonly Gate[] = [
  { s: 90, name: "Departure" },
  { s: 305, name: "Crystal threshold" },
  { s: 600, name: "Into the fold" },
  { s: 1080, name: "Opal approach" },
  { s: 1370, name: "Homeward" }
];

export const ROUTES: readonly Route[] = ["main", "upper", "lower", "islands", "bypass"];

/** Crystal-resonance gates on the main route. */
export const RESONANCE_GATES = [
  { s: 150, lane: -5 },
  { s: 330, lane: 4.5 },
  { s: 395, lane: -4.5 },
  { s: 465, lane: 4.5 },
  { s: 540, lane: -3.5 },
  { s: 1120, lane: 4 }
] as const;

export const wrapS = (s: number): number => (s % COURSE_LENGTH + COURSE_LENGTH) % COURSE_LENGTH;
export const smoothstep01 = (x: number): number => {
  const t = Math.max(0, Math.min(1, x));
  return t * t * (3 - 2 * t);
};
export const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export interface Meteor { readonly lane: number; readonly id: number }
/** Meteors drift sideways around their nominal lane. */
export const meteorLane = (meteor: Meteor, time: number): number => meteor.lane + Math.sin(time * 0.48 + meteor.id * 0.9) * 1.25;

export interface Ramp {
  readonly id: string;
  readonly name: string;
  readonly s: number;
  readonly lane: number;
  readonly width: number;
  readonly length: number;
  readonly height: number;
}

export const BIKE_RAMPS: readonly Ramp[] = [
  { id: "moon-hop", name: "MOON HOP", s: 105, lane: -5.5, width: 5, length: 18, height: 1.8 },
  { id: "comet-kicker", name: "COMET KICKER", s: 1050, lane: 5.5, width: 5, length: 20, height: 2.4 },
  { id: "last-light", name: "LAST LIGHT", s: 1380, lane: -5.5, width: 5, length: 22, height: 2.8 }
];

const SKATE_EXTRA_RAMPS: readonly Ramp[] = [
  { id: "crystal-pop", name: "CRYSTAL POP", s: 345, lane: -5.5, width: 4.5, length: 14, height: 1.1 },
  { id: "geode-transfer", name: "GEODE TRANSFER", s: 490, lane: 5.5, width: 4.5, length: 16, height: 1.5 },
  { id: "inverted-ollie", name: "INVERTED OLLIE", s: 780, lane: -5, width: 4.5, length: 16, height: 1.2 },
  { id: "home-kick", name: "HOME KICK", s: 1340, lane: 5, width: 4.5, length: 18, height: 1.9 }
];

const SKATE_RAMPS: readonly Ramp[] = [...BIKE_RAMPS, ...SKATE_EXTRA_RAMPS];
export const rampsFor = (vehicle: Vehicle): readonly Ramp[] => (vehicle === "skate" ? SKATE_RAMPS : BIKE_RAMPS);

export function rampAt(s: number, lane: number, vehicle: Vehicle = "bike"): Ramp | undefined {
  const r = wrapS(s);
  return rampsFor(vehicle).find((ramp) => r >= ramp.s && r < ramp.s + ramp.length && Math.abs(lane - ramp.lane) <= ramp.width / 2);
}

export function rampHeightAt(s: number, lane: number, vehicle: Vehicle = "bike"): number {
  const ramp = rampAt(s, lane, vehicle);
  if (!ramp) return 0;
  const t = (wrapS(s) - ramp.s) / ramp.length;
  return ramp.height * t * t;
}

export interface LoopDef {
  readonly id: string;
  readonly name: string;
  readonly s: number;
  readonly lane: number;
  readonly radius: number;
  readonly length: number;
  readonly width: number;
}
export const SKATE_LOOPS: readonly LoopDef[] = [
  { id: "satellite-loop", name: "SATELLITE LOOP", s: 130, lane: 5.5, radius: 8, length: 14, width: 4.5 },
  { id: "lunar-loop", name: "LUNAR LOOP", s: 1140, lane: -5.5, radius: 10, length: 18, width: 4.5 }
];

export interface CourseDef {
  readonly id: string;
  readonly name: string;
  readonly tag: string;
  readonly description: string;
  readonly color: string;
  readonly tint: string;
  readonly laps: number;
  readonly trialLaps: number;
  readonly radius: number;
  readonly waves: number;
  readonly elevation: number;
  readonly dive: number;
  readonly roll: number;
  readonly geode: boolean;
  readonly rocks: number;
  readonly grip: number;
  readonly unlock: number;
  readonly shortcut: { readonly s: number; readonly end: number; readonly lane: number; readonly name: string; readonly rate: number };
}

export const COURSES: readonly CourseDef[] = [
  {
    id: "painted",
    name: "Painted Rings",
    tag: "The opening race",
    description: "The planet dive, the crystal cave and the complete gravity fold.",
    color: "#e9ad87",
    tint: "#ffffff",
    laps: 7,
    trialLaps: 5,
    radius: 220,
    waves: 13,
    elevation: 12,
    dive: 76,
    roll: 1,
    geode: true,
    rocks: 13,
    grip: 1,
    unlock: 0,
    shortcut: { s: 840, end: 995, lane: -8, name: "Inside line", rate: 1.24 }
  }
];

export interface DifficultyRules {
  readonly name: string;
  readonly description: string;
  readonly ai: number;
  readonly grip: number;
  readonly edgeGrace: number;
  readonly charges: number;
  readonly duration: number;
  readonly rescue: number;
  readonly mistakes: number;
}

export const DIFFICULTY: Readonly<Record<Difficulty, DifficultyRules>> = {
  explorer: { name: "Explorer", description: "Forgiving edges · 5 rescues · relaxed rivals", ai: 0.86, grip: 1.4, edgeGrace: 1.1, charges: 5, duration: 8, rescue: 18, mistakes: 0.13 },
  racer: { name: "Racer", description: "Precise lines · 3 rescues · competitive rivals", ai: 0.96, grip: 1, edgeGrace: 0.55, charges: 3, duration: 6, rescue: 12, mistakes: 0.07 },
  expert: { name: "Expert", description: "Exposed edges · 2 rescues · relentless rivals", ai: 1, grip: 0.83, edgeGrace: 0.22, charges: 2, duration: 4, rescue: 8, mistakes: 0.025 }
};

export const courseById = (id: string): CourseDef => COURSES.find((course) => course.id === id) ?? COURSES[0]!;

export const normalizeDifficulty = (value: string): Difficulty =>
  value === "normal" ? "racer" : value === "relaxed" ? "explorer" : value in DIFFICULTY ? (value as Difficulty) : "racer";

export const RIVAL_NAMES = ["LYRA", "IO", "ATLAS", "NOVA", "ORION"] as const;
export const CHAMPIONSHIP_POINTS = [15, 12, 10, 8, 6, 4] as const;

export interface Rider {
  readonly name: string;
  readonly color: string;
  readonly accent: string;
  readonly role: string;
  readonly speed: number;
  readonly handling: number;
  readonly boost: number;
}
export const RIDERS: readonly Rider[] = [
  { name: "Sol", color: "#e7d8b4", accent: "#d86a43", role: "The all-rounder", speed: 0, handling: 1, boost: 1 },
  { name: "Ciel", color: "#577fb0", accent: "#ead8a0", role: "The corner poet", speed: -1, handling: 1.2, boost: 0.92 },
  { name: "Ember", color: "#ce5537", accent: "#9bc4bc", role: "The comet chaser", speed: 1, handling: 0.91, boost: 1.12 }
];

export interface Equipment {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly level: number;
  readonly speed: number;
  readonly handling: number;
  readonly boost: number;
}
export const EQUIPMENT: readonly Equipment[] = [
  { id: "balanced", name: "Touring", description: "Balanced speed and handling", level: 0, speed: 0, handling: 1, boost: 1 },
  { id: "carve", name: "Carver", description: "Sharper steering · lower top speed", level: 2, speed: -1.5, handling: 1.16, boost: 0.96 },
  { id: "comet", name: "Comet", description: "Stronger boost · wider turns", level: 5, speed: 0.6, handling: 0.88, boost: 1.1 }
];

/* ------------------------------------------------------------------ route layout */

export interface RouteOffset { readonly side: number; readonly height: number; readonly half: number }

/** Lateral/vertical offset and half-width of `route` at distance `s`. */
export function routeOffset(s: number, route: Route = "main"): RouteOffset {
  const n = wrapS(s);
  if (route === "upper" || route === "lower") {
    const u = clamp((n - SPLIT.start) / (SPLIT.end - SPLIT.start), 0, 1);
    const r = Math.sin(Math.PI * u) ** 2;
    return {
      side: (route === "upper" ? -1 : 1) * (23 / 3 + 18 * r - 41 * r * r),
      height: (route === "upper" ? 17 : -14) * r,
      half: 23 / 6
    };
  }
  if (route === "islands") return { side: -4.75, height: 0, half: 6.75 };
  if (route === "bypass") {
    const u = clamp((n - OPAL.start) / (OPAL.end - OPAL.start), 0, 1);
    const r = Math.sin(Math.PI * u) ** 2;
    return { side: 6.75 + 16 * r, height: -11 * r, half: 4.75 };
  }
  return { side: 0, height: 0, half: n >= SPLIT.start && n < SPLIT.end ? 23 / 6 : 11.5 };
}

/** Surface height of the island route (null where there is a gap). */
export function islandHeight(s: number, route: Route = "main"): number | null {
  if (route !== "islands") return 0;
  const n = wrapS(s);
  const tile = ISLAND_TILES.find((t) => n >= t.start && n <= t.end);
  if (tile) {
    const u = (n - tile.start) / (tile.end - tile.start);
    return tile.height + 0.55 * Math.sin(u * Math.PI * 2) * Math.sin(u * Math.PI) ** 2;
  }
  return n < ISLAND_TILES[0]!.start
    ? 0.7 * smoothstep01((n - OPAL.start) / (ISLAND_TILES[0]!.start - OPAL.start))
    : n > ISLAND_TILES[ISLAND_TILES.length - 1]!.end ? 0 : null;
}

/** Where an island rider is put back after falling between tiles. */
export function islandRecoverS(s: number, route: Route): number {
  if (route !== "islands") return s;
  const base = Math.floor(s / COURSE_LENGTH) * COURSE_LENGTH;
  const n = wrapS(s);
  const tile = ISLAND_TILES.filter((t) => t.start <= n).at(-1);
  return tile ? base + Math.min(n, (tile.start + tile.end) / 2 - 2) : s;
}

export interface RouteRider {
  s: number;
  lane: number;
  route: Route;
  events?: { type: string; text?: string }[];
}

/** Route switching at the split/opal entries and exits, applied after movement. */
export function applyRouteTransitions(rider: RouteRider, prevS: number): void {
  const base = Math.floor(prevS / COURSE_LENGTH) * COURSE_LENGTH;
  for (const section of [SPLIT, OPAL]) {
    if (prevS < base + section.start && rider.s >= base + section.start) {
      rider.route = section === SPLIT
        ? rider.lane < -23 / 6 ? "upper" : rider.lane > 23 / 6 ? "lower" : "main"
        : rider.lane > 2 ? "bypass" : "islands";
      rider.lane -= routeOffset(section.start, rider.route).side;
      if (rider.events && rider.route !== "main") {
        rider.events.push({
          type: "route",
          text: rider.route === "upper" ? "UPPER LINE · ride the crest"
            : rider.route === "lower" ? "LOWER LINE · under the pack"
              : rider.route === "islands" ? "OPAL STEPS · jump the gold lips / brake in air"
                : "LOWER BYPASS · keep your momentum"
        });
      }
    }
    if (prevS < base + section.end && rider.s >= base + section.end) {
      rider.lane += routeOffset(section.end - 0.001, rider.route).side;
      rider.route = "main";
    }
  }
}

/** Fixed lane a rival is steered to ahead of the splits (null elsewhere). */
export function rivalForcedLane(s: number, seed: number, lap = 0): number | null {
  const r = wrapS(s);
  return r > SPLIT.start - 35 && r < SPLIT.start
    ? [-8, 0, 8][(seed + lap) % 3]!
    : r > OPAL.start - 60 && r < OPAL.start ? (seed % 3 === 0 ? 7 : -5) : null;
}

export function sectionLabel(s: number, route: Route = "main"): string {
  const n = wrapS(s);
  return n >= SPLIT.start && n < SPLIT.end
    ? route === "upper" ? "Painted split · upper lane" : route === "lower" ? "Painted split · lower lane" : "The painted split"
    : n > 297 && n < 588 ? "The amethyst heart"
      : n >= 623 && n < 1030 ? "The gravity fold"
        : n >= 1165 && n < 1335 ? (route === "bypass" ? "Opal · lower bypass" : "The opal platforms")
          : n > 1335 ? "The homeward ribbon" : "The painted rings";
}

/** Fade factor (0..1) used to blend a route's frame into the main frame near its ends. */
export function routeBlend(s: number, route: Route): number {
  const n = wrapS(s);
  const section = route === "upper" || route === "lower" ? SPLIT : route === "islands" || route === "bypass" ? OPAL : null;
  return section ? smoothstep01(Math.min(n - section.start, section.end - n) / 8) : 1;
}

/** Track-space lane (offset applied) used for surface noise lookups. */
export const trackLane = (s: number, lane: number, route: Route = "main"): number => lane + routeOffset(s, route).side;

/** UV on the track texture. */
export const trackUv = (s: number, lane: number, route: Route = "main"): [number, number] =>
  [36 / 1450 * s, 0.5 + trackLane(s, lane, route) / 23];

const halfLength = (vehicle: Vehicle): number => (vehicle === "skate" ? 0.65 : 0.9);

export interface IslandHit { readonly height: number | null; readonly half: number; readonly tile: IslandTile | null }

/** Island footprint under (`s`, `lane`) for `vehicle`; null when over a gap. */
export function islandSurface(s: number, lane = 0, vehicle: Vehicle = "bike"): IslandHit | null {
  const r = wrapS(s);
  const reach = halfLength(vehicle);
  if (r < OPAL.start || r > OPAL.end) return null;
  for (const tile of ISLAND_TILES) {
    if (r < tile.start - reach || r > tile.end + reach) continue;
    const clamped = Math.max(tile.start, Math.min(tile.end, r));
    const u = (clamped - tile.start) / (tile.end - tile.start);
    const half = 6.75 * (1 + 0.025 * Math.sin(u * Math.PI * 5));
    if (!(Math.abs(lane) > half + 0.2)) return { height: islandHeight(clamped, "islands"), half, tile };
  }
  return (r < ISLAND_TILES[0]!.start || r > ISLAND_TILES[ISLAND_TILES.length - 1]!.end) && Math.abs(lane) <= 6.95
    ? { height: islandHeight(s, "islands"), half: 6.75, tile: null }
    : null;
}

/** Ground height under the rider: 0 off the island route, null in an island gap. */
export function groundHeight(s: number, lane = 0, route: Route = "main", vehicle: Vehicle = "bike"): number | null {
  return route === "islands" ? islandSurface(s, lane, vehicle)?.height ?? null : 0;
}

/* ------------------------------------------------------------------ collectibles */

export interface Collectible { readonly s: number; readonly lane: number; readonly route: Route; readonly kind: "meteor" | "dust"; readonly id: number }

const collectibleCache = new Map<string, readonly Collectible[]>();

/** Stardust and moon rocks along the course (deterministic, cached per course). */
export function collectibles(courseId = "painted"): readonly Collectible[] {
  const cached = collectibleCache.get(courseId);
  if (cached) return cached;
  const out: Collectible[] = [];
  let id = 0;
  for (let e = 0; e < 96; e++) {
    const r = 25 + e * (COURSE_LENGTH - 35) / 96;
    if (r >= SPLIT.start && r < SPLIT.end) {
      for (const route of ["upper", "main", "lower"] as const) {
        out.push({ s: r, lane: Math.sin(e * 0.57) * 1.8, route, kind: route === "main" && e % 4 === 0 ? "meteor" : "dust", id: id++ });
      }
    } else if (r >= OPAL.start && r < OPAL.end) {
      out.push({ s: r, lane: Math.sin(e) * 2, route: "bypass", kind: "dust", id: id++ });
      if (islandHeight(r, "islands") !== null) out.push({ s: r, lane: Math.sin(e) * 3, route: "islands", kind: "dust", id: id++ });
    } else {
      out.push({ s: r, lane: Math.sin(e * 0.57) * 7.8, route: "main", kind: e % 13 === 8 ? "meteor" : "dust", id: id++ });
    }
  }
  collectibleCache.set(courseId, out);
  return out;
}
