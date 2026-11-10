/** Cross Hop core: scene builder, pooled visuals, run simulation. */
import {
  game, looks, lights, effects, model, scene, camera, instances,
  primitives, material, sky, type AuraApp, type AuraSceneNode
} from "@aura3d/engine";
import { assets } from "../aura-assets";
import {
  COL_MAX, COL_MIN, COL_W, FIELD_HALF, LANE_D, STRIP_W, THEMES,
  themeIndexForRow, type LaneType
} from "./themes";
import { laneFor, laneZ, laneMovers, moverHalf, railCycle, railWarning, MOVER_LENGTH, TRAIN_CARS, TRAIN_CAR_LENGTH, type Lane } from "./world";
import { loadProfile, saveProfile, type Profile } from "./persistence";
import { CROSS_HOP_PALETTE, ORIGINAL_SUN, THEME_LOOKS, VIVID_LOOKS, keyAt, sunShadowFootprint, mixHex, sunVector, sunDirection, p5DuskFor, candyRaftFor, P5_DUSK_SKY, P5_CANDY_RAFT } from "./look";
import { BACKDROP_WIDTH, CAM_DIORAMA, ambientEmitter, backdropFlat, damp, dioramaPose, hopScale, HOP_YAW, kitLod, kitSlots, lampSlots, screenY, turnToward } from "./diorama";
import { CROSS_HOP_VFX, DEATH_COLORS, DEATH_VFX, landingVfx, registerCrossHopVfx } from "./vfx";
import { critterNodeTransforms, critterOverrides, VEHICLE_OVERRIDES } from "./critterLook";
import { labCameraOptions, readLabFlags } from "../../../showcase-port-shared/lab-flags";
import { shadeMaterial } from "./shade";
import { broadcastCrispLutAsset, flipbookQuadMaterial, lavaMagmaMaterial, riverWaterMaterial } from "./surfaceShaders";

// ---------------- pool capacities ----------------
const CAP = {
  ground: 56, detail: 460, glow: 180, glowS: 80,
  car: 22, hatch: 22, suv: 22, taxi: 22, van: 22, pickup: 22,
  truck: 18, tram: 28, train: 6 * TRAIN_CARS, hover: 26,
  log: 48, logEnd: 96, raft: 196, pad: 48, stone: 48, coin: 26,
  trunk: 360, canopy: 300, dressB: 260,
  // GU47 CH47-07 + WP-14: one instanced pool per ground surface + distant horizon hills/skyline.
  felt: 44, asphalt: 44, water: 32, gravel: 26, lava: 26, horizon: 44,
  // GU47 phase 4: sun-cast shadow decals (vivid and 4.6 looks; empty in the diorama).
  shade: 220
} as const;

/**
 * GU47 WP-24: "diorama" is the tabletop tilt-shift look; "original" (`?look=original`) is the 4.6 look, kept
 * unchanged for before/after captures. main.ts sets it before the scene builds.
 */
export type LookMode = "diorama" | "original" | "vivid";
let lookMode: LookMode = "diorama";
export function setLookMode(mode: LookMode): void { lookMode = mode; }
export function getLookMode(): LookMode { return lookMode; }
/** GU47 phase 4 dressing (shadow decals, toy rafts): main.ts sets it from `p4DressFor`. */
let p4Dress = true;
export function setP4Dress(on: boolean): void { p4Dress = on; }

export type Mode = "title" | "run" | "dead";
export type RunKind = "quick" | "tour" | "drill";

export interface CritterDef {
  readonly id: string; readonly label: string; readonly asset: keyof typeof assets;
  readonly price: number; readonly tagline: string;
}
export const CRITTERS: readonly CritterDef[] = [
  { id: "hop", label: "Hop", asset: "hop", price: 0, tagline: "The original lane-hopper." },
  { id: "chick", label: "Chick", asset: "chick", price: 60, tagline: "Tiny feet, zero fear." },
  { id: "turtle", label: "Turtle", asset: "turtle", price: 80, tagline: "Slow is a strategy." },
  { id: "bun", label: "Bun", asset: "bun", price: 90, tagline: "Ears up, eyes forward." },
  { id: "axolotl", label: "Axolotl", asset: "axolotl", price: 120, tagline: "Swims rivers in spirit." },
  { id: "ducky", label: "Ducky", asset: "ducky", price: 140, tagline: "Quacken on approach." },
  { id: "roboFrog", label: "Robo-Frog", asset: "roboFrog", price: 180, tagline: "Chrome amphibian v2." },
  { id: "toastCat", label: "Toast Cat", asset: "toastCat", price: 200, tagline: "Lands butter-side up." },
  { id: "mushroomKid", label: "Mushroom Kid", asset: "mushroomKid", price: 220, tagline: "Spore-driven athlete." },
  { id: "knightToad", label: "Knight Toad", asset: "knightToad", price: 260, tagline: "Armored for asphalt." },
  { id: "astroFrog", label: "Astro-Frog", asset: "astroFrog", price: 320, tagline: "One small hop for frogkind." },
  { id: "goldenHop", label: "Golden Hop", asset: "goldenHop", price: 500, tagline: "Legend-tier shine." }
] as const;

export interface DrillDef { readonly id: string; readonly label: string; readonly desc: string; readonly script: readonly LaneType[]; }
export const DRILLS: readonly DrillDef[] = [
  {
    id: "traffic-gaps", label: "Traffic Gaps", desc: "Read the cars, hop the gaps.",
    script: ["meadow", "meadow", "road", "meadow", "road", "road", "meadow", "road", "meadow", "meadow"]
  },
  {
    id: "log-hops", label: "Log Hops", desc: "Ride the river or sleep in it.",
    script: ["meadow", "river", "river", "meadow", "river", "river", "river", "meadow", "meadow", "meadow"]
  },
  {
    id: "train-dodges", label: "Train Dodges", desc: "Horn means move. Now.",
    script: ["meadow", "rail", "meadow", "rail", "rail", "meadow", "lava", "rail", "meadow", "meadow"]
  }
];

export interface Death { kind: "squashed" | "flattened" | "drowned" | "burned" | "snatched"; label: string }

const COLORS = {
  coin: "#ffd94a", pod: "#ff9ed2", carBody: "#e05555", water: "#3f8fd2",
  glow: "#ff8a3d", railSignal: "#ff3355"
};

/** Matte warm grade shared by the player, hawk, and spectator critters so the
 *  Meshy animals sit in the same flat storybook palette as the lanes. */
const CRITTER_MAT = material.pbr({ color: "#fff1df", roughness: 0.93, metalness: 0 });

// ---------------- game state ----------------
export interface GameState {
  mode: Mode;
  runKind: RunKind;
  drill: DrillDef | null;
  profile: Profile;
  seed: number;
  time: number;
  score: number; coins: number; row: number; bestRow: number;
  playerRow: number; playerCol: number;
  hop: { active: boolean; t: number; fromX: number; fromY: number; fromZ: number; toX: number; toY: number; toZ: number; dir: string };
  idle: number;
  dead: Death | null;
  deadAt: number;
  lanes: Map<number, Lane>;
  critter: CritterDef;
  message: string;
  messageT: number;
  themeIdx: number;
  events: string[];
  podTaken: Set<number>;
  coinTaken: Set<number>;
  autopilot: boolean;
  apTimer: number;
  dressKey: string;
  forceTheme: number | undefined;
  /** The seed came from the caller (URL, World Tour, test) and restarts reuse it (CH-8). Quick Play rolls a new one. */
  seedPinned: boolean;
  /** This run's coins are already added to the profile (CH-1). */
  banked: boolean;
  /** Increments on every run start; keys the static instance pools (CH-E3). */
  runId: number;
  /** Simulation is held (tab hidden, window blurred, pause button) (CH-E7). */
  paused: boolean;
  /** Critters unlocked during this run, for the death card (CH-E7). */
  runUnlocks: string[];
  /** This run set a new profile best (CH-E7). */
  newBest: boolean;
  /** Rescue pods picked up this session; main.ts plays the rescue cue when it changes (CH-14). */
  rescues: number;
  /** A rail lane at or just ahead of the player is in its warning window (CH-14 horn). */
  railAlert: boolean;
  /** Close traffic/train near-misses this run; drives real-time hit-stop + whoosh SFX in main.ts (WP-14). */
  nearMisses: number;
}

export const st: GameState = {
  mode: "run", runKind: "quick", drill: null,
  profile: loadProfile(),
  seed: 1, time: 0,
  score: 0, coins: 0, row: 0, bestRow: 0,
  playerRow: 0, playerCol: 0,
  hop: { active: false, t: 0, fromX: 0, fromY: 0.17, fromZ: 0, toX: 0, toY: 0.17, toZ: 0, dir: "fwd" },
  idle: 0, dead: null, deadAt: 0,
  lanes: new Map(),
  critter: CRITTERS[0],
  message: "", messageT: 0,
  themeIdx: 0, events: [],
  podTaken: new Set(), coinTaken: new Set(),
  autopilot: false, apTimer: 0, dressKey: "",
  forceTheme: undefined,
  seedPinned: false, banked: true, runId: 0, paused: false,
  runUnlocks: [], newBest: false, rescues: 0, railAlert: false, nearMisses: 0
};

const ROW_AHEAD = 26, ROW_BEHIND = 8;
const HOP_DUR = 0.16;
const HAWK_KILL = 5.2;
/** Row 0 is hawk-free only for this long after a run starts (CH-17). */
export const ROW0_GRACE = 3.0;
/** A dead critter ignores hop keys for this long, so a buffered key cannot skip the death card (CH-9). */
export const RESTART_LOCKOUT = 0.6;
/** A river or lava hop snaps sideways onto a platform only within this distance; further away it lands in the hazard (CH-11). */
export const PLATFORM_SNAP = 0.9;
/** Fixed simulation step (CH-E1). */
export const SIM_STEP = 1 / 60;

/**
 * Exact top-surface Y of a lane or its active platform in world units:
 * - Meadow / Road / Tram ground strip: center y = 0, sy = 0.24 -> top = 0.12
 * - Rail: railbed + ties + rails -> top = 0.13
 * - River log: center y = 0.08, sy = 0.22 -> top = 0.22
 * - River lilypad: raised so critter base stays >= 0.17 -> top = 0.12
 * - Lava stone: center y = 0.06, sy = 0.20 -> top = 0.16
 */
const CRITTER_FOOT_OFFSET = 0.05;

/** Tighter chase rig: closer/lower lens and a wider FOV so the critter,
 *  near lane edges, and the horizon all share the frame. */
const CAM = {
  y: 3.85,
  back: 5.3,
  targetY: 0.55,
  ahead: 4.4,
  fov: 50,
  followX: 0.42,
  targetX: 0.36
} as const;

/** One upright gold disc per coin, about half a column wide, so one drawn coin is one pickup (CH-13). */
const COIN_DIAMETER = 0.5;
const COIN_LIFT = 0.36;
const COIN_THICK = 0.08;
/** Top of the world floor plane that lies under and beyond the lane strips. */
const FLOOR_Y = -0.16;
/** Scenery and spectators stand beyond the drawn lane strips (|x| >= this), so nothing stands in a traffic lane (CH-12). */
const SCENERY_X = STRIP_W / 2 + 0.5;

function surfaceTopY(l: Lane): number {
  if (l.type === "river") return l.moverKind === "log" ? 0.22 : PAD_TOP;
  if (l.type === "lava") return 0.16;
  if (l.type === "rail") return 0.13;
  return 0.12;
}

/** Lilypad top surface; the pad is drawn centred at PAD_TOP - PAD_H / 2 so the critter's feet touch it (CH-16). */
export const PAD_TOP = 0.12;
export const PAD_H = 0.08;

function playerBaseY(l: Lane): number {
  return surfaceTopY(l) + CRITTER_FOOT_OFFSET;
}

// scratch buffers — allocated once
interface PoolSpec { position: [number, number, number]; rotation: [number, number, number]; scale: [number, number, number] }
const XS = new Float32Array(24);
const HIDDEN: PoolSpec = { position: [0, -999, 0], rotation: [0, 0, 0], scale: [0.001, 0.001, 0.001] };
const POOL = {} as Record<keyof typeof CAP, { specs: PoolSpec[]; cols: string[]; n: number; dirty: number }>;
for (const k of Object.keys(CAP) as (keyof typeof CAP)[]) {
  POOL[k] = {
    specs: Array.from({ length: CAP[k] }, () => ({ position: [0, -999, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number], scale: [0.001, 0.001, 0.001] as [number, number, number] })),
    cols: Array.from({ length: CAP[k] }, () => "#ffffff"),
    n: 0, dirty: 0
  };
}
function P(k: keyof typeof CAP) { return POOL[k]; }
function inst(k: keyof typeof CAP, x: number, y: number, z: number, sx: number, sy: number, sz: number, color: string, ry = 0, rz = 0): void {
  const p = P(k);
  if (p.n >= CAP[k]) return;
  const s = p.specs[p.n];
  s.position[0] = x; s.position[1] = y; s.position[2] = z;
  s.rotation[1] = ry; s.rotation[2] = rz;
  s.scale[0] = sx; s.scale[1] = sy; s.scale[2] = sz;
  p.cols[p.n] = color;
  p.n++;
}

function difficulty(): number {
  return Math.min(1, st.playerRow / 220);
}

/**
 * Mover settings for drill lanes. Each type carries its own spacing (CH-3): the base lane's spacing (4.2 to 8.2 m
 * for roads, 6 for meadows) packed four to six trains onto one rail lane and made Train Dodges unwinnable.
 */
export const DRILL_LANE: Record<LaneType, Pick<Lane, "moverKind" | "speed" | "spacing">> = {
  meadow: { moverKind: "none", speed: 0, spacing: 8 },
  road: { moverKind: "car", speed: 3.4, spacing: 7 },
  tram: { moverKind: "tram", speed: 3.6, spacing: 9.5 },
  river: { moverKind: "log", speed: 1.8, spacing: 5.8 },
  rail: { moverKind: "train", speed: 15, spacing: 60 },
  lava: { moverKind: "stone", speed: 1.8, spacing: 3.4 }
};

/** Lane descriptor for row, honoring drill scripts. */
export function lane(row: number): Lane {
  let l = st.lanes.get(row);
  if (!l) {
    if (st.runKind === "drill" && st.drill) {
      const type = st.drill.script[Math.min(row, st.drill.script.length - 1)] ?? "meadow";
      l = laneFor(row, st.seed, difficulty());
      if (row > 1 && row < st.drill.script.length) {
        // Neighbouring platform lanes must drift against each other, or a log never lines up with the next lane
        // (riders stay at the log centre): alternate direction and vary speed by row.
        const drift = type === "river" || type === "lava";
        const base = DRILL_LANE[type];
        l = {
          ...l, ...base, type, theme: 0,
          ...(drift ? { dir: (row % 2 === 0 ? 1 : -1) as 1 | -1, speed: base.speed * (0.8 + (row % 3) * 0.2) } : {})
        };
      } else {
        l = { ...l, type: "meadow", moverKind: "none", speed: 0, theme: 0 };
      }
    } else {
      l = laneFor(row, st.seed, difficulty(), st.forceTheme);
    }
    st.lanes.set(row, l);
  }
  return l;
}

let nearMissCooldownUntil = 0;
let lastHopOriginRow = -1;
let lastHopOriginTime = -1;
let lastHopOriginX = 0;

export function startRun(kind: RunKind, drill: DrillDef | null, seed?: number, forceTheme?: number): void {
  // A run that is replaced while still live (R, Quick Play, a World button) banks its coins first (CH-1).
  bankRun();
  st.runKind = kind; st.drill = drill;
  st.seedPinned = seed !== undefined;
  st.seed = seed ?? ((Math.random() * 0xffffffff) >>> 0);
  st.forceTheme = forceTheme;
  st.time = 0; st.score = 0; st.coins = 0; st.row = 0;
  st.playerRow = 0; st.playerCol = 0;
  st.hop.active = false; st.hop.t = 0; st.hop.dir = "fwd"; st.idle = 0; st.dead = null; st.deadAt = 0;
  st.lanes.clear(); st.podTaken.clear(); st.coinTaken.clear();
  st.events.length = 0;
  st.runUnlocks = []; st.newBest = false; st.banked = false; st.paused = false; st.railAlert = false; st.nearMisses = 0;
  nearMissCooldownUntil = 0;
  lastHopOriginRow = -1;
  lastHopOriginTime = -1;
  st.runId++;
  st.critter = CRITTERS.find(c => c.id === st.profile.selected) ?? CRITTERS[0];
  st.dressKey = "";
  // The look on screen may belong to the theme the last run ended in (CH-6): put the starting theme's look back.
  st.themeIdx = forceTheme ?? 0;
  if (appliedLook !== st.themeIdx) swapLook(st.themeIdx);
  st.mode = "run";
  st.message = "";
  st.messageT = 0;
  if (kind === "drill") pushEvent(`Drill: ${drill?.label}`);
  else if (kind === "tour") pushEvent("World Tour departure");
  else {
    st.events.push("Quick Play");
    if (st.events.length > 6) st.events.shift();
  }
}

/** Restart the current run the way it was started: same kind, drill, World Tour theme and, when pinned, seed (CH-8). */
export function restartRun(): void {
  startRun(st.runKind, st.drill, st.seedPinned ? st.seed : undefined, st.forceTheme);
}

/** Add this run's coins to the profile exactly once (CH-1). */
function bankRun(): void {
  if (st.banked) return;
  st.banked = true;
  st.profile.coins += st.coins;
  saveProfile(st.profile);
}

/** Coins to show in the HUD: the bank plus this run's coins while they are not banked yet. */
export function displayCoins(): number {
  return st.profile.coins + (st.banked ? 0 : st.coins);
}

export function endToTitle(): void { bankRun(); st.mode = "title"; st.paused = false; saveProfile(st.profile); }

export function setPaused(paused: boolean): void {
  st.paused = paused && st.mode === "run";
}

export function pushEvent(msg: string): void {
  st.events.push(msg);
  if (st.events.length > 6) st.events.shift();
  st.message = msg; st.messageT = 2.6;
}

function die(kind: Death["kind"], label: string): void {
  if (st.dead) return;
  st.dead = { kind, label };
  st.deadAt = st.time;
  st.mode = "dead";
  // Drills are short scripted courses and do not count toward Best (CH-17); the Timing School panel says so.
  if (st.runKind !== "drill" && st.score > st.profile.best) { st.profile.best = st.score; st.newBest = true; }
  bankRun();
  pushEvent(`${label} — run over at ${st.score}`);
}

/** The theme look group for the current look mode (GU47 WP-24). */
function buildLookGroup(th: (typeof THEMES)[number]) {
  if (lookMode === "vivid") return buildVividLookGroup(THEMES.indexOf(th));
  return lookMode === "original" ? buildOriginalLookGroup(th) : buildDioramaLookGroup(THEMES.indexOf(th));
}

/** Name of the look preset's key light; the diorama look drops it for its own runtime sun (`sun-key`). */
const LOOK_KEY_NAME = "look key light";

/**
 * GU47 CH47-01/03/04/06: the diorama look for one theme. The preset brings the theme's own HDRI (IBL only; the
 * gradient sky draws the background), height fog, grade and post preset; its key and rim are dropped (the scene's
 * runtime `sun-key` is the one shadowed key) and a hemisphere fill replaces the 4.6 ambient light.
 */
function buildDioramaLookGroup(ti: number) {
  const th = THEMES[ti]!;
  const L = THEME_LOOKS[ti]!;
  const lookId = th.look as Parameters<typeof looks.preset>[0];
  const group = looks.preset(lookId, {
    exposureEv: L.exposureEv,
    hdri: L.hdri,
    environmentIntensity: L.environmentIntensity,
    environmentRotationDeg: L.environmentRotationDeg,
    background: L.sky.horizon,
    sun: { azimuthDeg: L.sun.azimuthDeg, elevationDeg: L.sun.elevationDeg },
    rim: false,
    fogDensityScale: L.fog ? 1 : 0,
    ...(L.fog ? { fog: { color: L.fog.color, height: { mode: "height" as const, density: L.fog.density, heightFalloff: L.fog.heightFalloff, heightReference: 0 } } } : {}),
    grade: { contrast: L.grade.contrast, saturation: L.grade.saturation, temperature: L.grade.temperature },
    post: L.post
  }).runtime(game.runtimeNode("look")).toJSON();
  const children = group.children
    // The scene's own `sun-key` is the key; the scene's bloom node carries the theme bloom (setEffect).
    .filter((child) => !(child.kind === "light" && child.name === LOOK_KEY_NAME))
    .filter((child) => !(child.kind === "effect" && child.effect === "bloom"))
    .concat([lights.hemisphere({ name: "cross-hop hemisphere fill", skyColor: L.hemi.sky, groundColor: L.hemi.ground, intensity: L.hemi.intensity }).toJSON()]);
  return { ...group, background: L.sky.horizon, children };
}

/** GU47 CH47-03: the theme's gradient sky; stars at night, light clouds at dawn and noon. The sun glow rides the key. */
function buildSky(ti: number, row: number) {
  const L = THEME_LOOKS[ti]!;
  const k = keyAt(ti, null, row);
  return sky.gradient({
    name: "cross-hop sky",
    zenith: L.sky.zenith,
    horizon: L.sky.horizon,
    ground: L.sky.ground,
    horizonGlow: L.sky.horizonGlow,
    sun: { elevationDeg: k.elevationDeg, azimuthDeg: k.azimuthDeg, color: L.sun.color, intensity: Math.min(1.5, L.sun.intensity * 0.5), discSize: 0 },
    ...(L.sky.stars ? { stars: { count: L.sky.stars.count, brightness: L.sky.stars.brightness } } : {}),
    ...(L.sky.clouds ? { clouds: { coverage: L.sky.clouds.coverage, speed: L.sky.clouds.speed, color: L.sky.clouds.color } } : {}),
    captureEnvironment: false,
    affectsFog: true
  }).runtime(game.runtimeNode("sky")).toJSON();
}

/** Sun-key distance from its target; only the direction matters for the camera-fitted cascades. */
const SUN_DIST = 30;

/** GU47 CH47-01: one shadowed PCSS sun with 2 camera-fitted cascades (the tier drops to 1 cascade PCF on Low). */
function buildSunKey(ti: number) {
  const L = THEME_LOOKS[ti]!;
  const v = sunVector(L.sun.elevationDeg, L.sun.azimuthDeg);
  return lights.directional({
    name: "cross-hop sun",
    position: [v[0] * SUN_DIST, v[1] * SUN_DIST, v[2] * SUN_DIST],
    target: [0, 0, 0],
    color: L.sun.color,
    intensity: L.sun.intensity,
    shadow: { cascades: 2, filter: "pcss", mapSize: 2048, maxDistance: 48, lightSize: 1.2, fit: "camera" }
  }).runtime(game.runtimeNode("sun-key"));
}

/** Build a balanced look group with fog/bloom disabled and key light toned down to prevent white blowout. */
function buildOriginalLookGroup(th: (typeof THEMES)[number]) {
  const lookId = th.look as Parameters<typeof looks.preset>[0];
  const group = looks.preset(lookId, {
    fogDensityScale: 0,
    exposureEv: th.exposureEv
    // No `background` override: since GU47 E-A (9001eb1f8) a colour background hides the look's HDRI, and that HDRI is
    // the sky 4.6.2 drew behind every theme (the override would turn it into a flat colour wall).
  }).runtime(game.runtimeNode("look")).toJSON();
  const tunedChildren = group.children
    .filter((child) => !(child.kind === "effect" && (child.effect === "bloom" || child.effect === "fog")))
    .map((child) => {
      if (child.kind === "light" && child.light === "directional") {
        return {
          ...child,
          intensity: Math.min(child.intensity, 1.25)
        };
      }
      if (child.kind === "environment") {
        return {
          ...child,
          intensity: Math.min(child.intensity, 0.58),
          background: false
        };
      }
      return child;
    })
    // Theme-matched haze (not the preset's generic fog) so the far lanes and
    // horizon melt together without bleaching the critters or signage.
    .concat([effects.fog({ name: "cross-hop depth haze", color: th.palette.horizon, density: 0.0055 }).toJSON()]);
  return {
    ...group,
    background: th.palette.sky,
    children: tunedChildren
  };
}

// -------------------- scene --------------------
/** Minimal scene for remote-capture bisection: progressively adds layers. */
export function probeScene(level: number): unknown {
  const s = scene()
    .background(THEMES[0].palette.sky)
    .add(buildLookGroup(THEMES[0]))
    .camera(camera.perspective({ ...labCameraOptions(readLabFlags(), "reversed"), position: [0, 4, 8], target: [0, 0.5, 0], fov: 46 }));
  if (level >= 1) {
    s.add(primitives.box({ name: "p1-box", size: [2, 2, 2], material: material.pbr({ color: "#58a75c" }) }).position(0, 1, 0));
  }
  if (level >= 2) {
    s.add(instances.box({ name: "p2-pool", size: [1, 1, 1], material: material.pbr({ color: "#3a3f46" }), transforms: [{ position: [-2, 0.5, 0], scale: [1, 1, 1] }, { position: [2, 0.5, 0], scale: [1, 1, 1] }] }));
  }
  if (level >= 3) {
    s.add(instances.model(assets.trafficSedan, { name: "p3-cars", transforms: [{ position: [-4, 0, -3], scale: [1, 1, 1] }, { position: [4, 0, -3], scale: [1, 1, 1] }], targetLength: 2.1 }));
  }
  if (level >= 4) {
    s.add(model(assets.hop, { name: "p4-critter", targetHeight: 1.05, castShadow: true }).position(0, 0.17, 2).rotate(0, Math.PI, 0).animate({ clip: "Idle", loop: true }));
  }
  return s.toJSON();
}

const SPECTATOR_CRITTERS: readonly (keyof typeof assets)[] = [
  "chick", "turtle", "bun", "axolotl", "ducky", "roboFrog", "toastCat", "mushroomKid", "knightToad", "astroFrog", "goldenHop"
];

export function buildScene(): unknown {
  if (lookMode === "vivid") return buildVividScene();
  return lookMode === "original" ? buildOriginalScene() : buildDioramaScene();
}

/** The 4.6 scene (`?look=original`), with hemisphere fill (zero `lights.ambient`). */
function buildOriginalScene(): unknown {
  const th0 = THEMES[0];
  const s = scene()
    .background(th0.palette.sky)
    .add(buildLookGroup(th0))
    // Soft grounding for critters, coins, and traffic (legacy-post safe).
    .add(effects.contactShadows({ intensity: 0.7, length: 0.3 }))
    // Gentle neon life on coins/pods without blowing out the flat world.
    .add(effects.bloom({ intensity: 0.16, threshold: 0.86, radius: 0.3 }))
    .add(effects.vignette({ intensity: 0.16, smoothness: 0.65 }))
    .add(lights.hemisphere({ skyColor: "#dce8f5", groundColor: "#6d8458", intensity: 0.42 }))
    // Warm sun key from camera-left + cool rim from the far horizon give the
    // flat diorama depth and unify the textured critters with the lanes.
    .add(lights.directional({ position: [-9, 10, 9], target: [0, 0, -4], color: "#ffd8a6", intensity: 0.78 }))
    .add(lights.directional({ position: [7, 7, -15], target: [0, 0, -2], color: "#8fc8ff", intensity: 0.46 }))
    .camera(camera.perspective({ ...labCameraOptions(readLabFlags(), "reversed"),
      position: [0, CAM.y, CAM.back],
      target: [0, CAM.targetY, -CAM.ahead],
      fov: CAM.fov
    }));
  s.addMany([
    // two-plane sky: deep zenith above a lighter horizon band
    primitives.box({
      name: "sky-backdrop",
      size: [220, 80, 1],
      material: material.pbr({ color: th0.palette.sky, emissive: th0.palette.sky, emissiveIntensity: 0.45, roughness: 0.96, metalness: 0 }),
      castShadow: false,
      receiveShadow: false
    })
      .position(0, 22, -56)
      .runtime(game.runtimeNode("skirt")),
    primitives.box({
      name: "sky-horizon",
      size: [220, 22, 1],
      material: material.pbr({ color: th0.palette.horizon, emissive: th0.palette.horizon, emissiveIntensity: 0.4, roughness: 0.96, metalness: 0 }),
      castShadow: false,
      receiveShadow: false
    })
      .position(0, 4, -54)
      .runtime(game.runtimeNode("skirt-horizon")),
    primitives.sphere({
      name: "sun-disc",
      size: [3.2, 3.2, 3.2],
      material: material.emissive({ color: "#5a3f1f", emissive: "#ffd89a", emissiveIntensity: 1.15, roughness: 0.5 }),
      castShadow: false,
      receiveShadow: false
    }).position(-17, 6.4, -46).runtime(game.runtimeNode("sun"))
  ]);
  s.addMany(poolNodes(false) as never[]);
  return s.toJSON();
}

/**
 * GU47 phase 3 + WP-14: the vivid toy-city diorama look for one theme. The theme's preset brings its IBL and
 * broadcast-crisp grade; its key, fog and bloom are dropped (the scene's `sun-key` is the one shadowed key, the scene
 * bloom node carries the theme bloom) and a hemisphere fill plus calibrated horizon haze are added.
 */
function buildVividLookGroup(ti: number) {
  const th = THEMES[ti]!;
  const V = VIVID_LOOKS[ti]!;
  const lookId = th.look as Parameters<typeof looks.preset>[0];
  const lutAsset = broadcastCrispLutAsset();
  const group = looks.preset(lookId, {
    fogDensityScale: 0,
    exposureEv: V.exposureEv,
    grade: {
      contrast: V.grade.contrast,
      saturation: V.grade.saturation,
      temperature: V.grade.temperature,
      ...(lutAsset ? { lut: lutAsset } : {})
    },
    rim: false
  }).runtime(game.runtimeNode("look")).toJSON();
  const hazeNode = V.fog.density > 0
    ? effects.fog({ name: "cross-hop depth haze", color: V.fog.color, density: V.fog.density }).toJSON()
    : looks.fogForExtent({ name: "cross-hop horizon haze", extent: 58, haze: 0.28, color: V.fog.color, mode: "exp2" }).toJSON();
  const children = group.children
    .filter((child) => !(child.kind === "light" && child.name === LOOK_KEY_NAME))
    .filter((child) => !(child.kind === "effect" && (child.effect === "bloom" || child.effect === "fog" || child.effect === "ambient-occlusion")))
    .map((child) => (child.kind === "environment" ? { ...child, intensity: V.environmentIntensity, background: false } : child))
    .concat([lights.hemisphere({ name: "cross-hop hemisphere fill", skyColor: V.hemi.sky, groundColor: V.hemi.ground, intensity: V.hemi.intensity }).toJSON()])
    .concat([hazeNode]);
  return { ...group, background: V.sky.horizon, children };
}

/** The vivid look's painted sky: gradient, a low sun glow on the visible horizon, clouds by day, stars at night. */
function buildVividSky(ti: number) {
  const V = VIVID_LOOKS[ti]!;
  return sky.gradient({
    name: "cross-hop sky",
    zenith: V.sky.zenith,
    horizon: V.sky.horizon,
    ground: V.sky.ground,
    horizonGlow: V.sky.horizonGlow,
    sun: { elevationDeg: V.sky.glow.elevationDeg, azimuthDeg: V.sky.glow.azimuthDeg, color: V.sky.glow.color, intensity: V.sky.glow.intensity, discSize: V.sky.glow.discSize },
    ...(V.sky.stars ? { stars: { count: V.sky.stars.count, brightness: V.sky.stars.brightness } } : {}),
    ...(V.sky.clouds ? { clouds: { coverage: V.sky.clouds.coverage, speed: V.sky.clouds.speed, color: V.sky.clouds.color } } : {}),
    captureEnvironment: false,
    affectsFog: false
  }).runtime(game.runtimeNode("sky")).toJSON();
}

/** The vivid look's key: one shadowed sun from the camera's left, a little behind it (2 camera-fitted cascades). */
function buildVividSunKey(ti: number) {
  const V = VIVID_LOOKS[ti]!;
  const v = sunVector(V.sun.elevationDeg, V.sun.azimuthDeg);
  return lights.directional({
    name: "cross-hop sun",
    position: [v[0] * SUN_DIST, v[1] * SUN_DIST, v[2] * SUN_DIST],
    target: [0, 0, 0],
    color: V.sun.color,
    intensity: V.sun.intensity,
    shadow: { cascades: 2, filter: "pcss", mapSize: 2048, maxDistance: 44, lightSize: 0.9, fit: "camera" }
  }).runtime(game.runtimeNode("sun-key"));
}

const FLIPBOOK_SLOTS = 4;

function buildGodRaysNode() {
  return effects.godRays({
    name: "cross-hop god rays",
    source: "sun",
    intensity: 0.42,
    decay: 0.94,
    samples: 48,
    color: "#ffe1ad"
  }).runtime(game.runtimeNode("god-rays")).toJSON();
}

/** GU47 phase 3 + WP-14: crisp sunlit toy-city diorama with contactShadows, GTAO, SSR, cinematicBloom & flipbooks. */
function buildVividScene(): unknown {
  const V0 = VIVID_LOOKS[0]!;
  const s = scene()
    .background(V0.sky.horizon)
    .add(buildLookGroup(THEMES[0]))
    .add(buildVividSky(0))
    .add(buildVividSunKey(0))
    .add(effects.contactShadows({ length: 0.3, thickness: 0.05, steps: 16, intensity: 0.65 }))
    .add(effects.ambientOcclusion({ intensity: 0.52, radius: 0.42, multiBounce: true }))
    .add(effects.screenSpaceReflections({ intensity: 0.56, maxDistance: 14, roughness: 0.22, thickness: 0.25 }))
    .add(effects.cinematicBloom({ name: "bloom", intensity: V0.bloom.intensity, threshold: V0.bloom.threshold, color: "#fff8eb", radius: 0.34 }))
    .add(effects.vignette({ intensity: 0.16, smoothness: 0.62 }))
    .camera(camera.perspective({ ...labCameraOptions(readLabFlags(), "reversed"),
      position: [0, CAM.y, CAM.back],
      target: [0, CAM.targetY, -CAM.ahead],
      fov: CAM.fov
    }));
  if (!reducedMotion) {
    s.add(effects.depthOfField({ name: "cross-hop tilt-shift", maxBlur: 1.7, tiltShift: { bandCenter: 0.6, bandWidth: 0.48 } }));
  }
  const amb = ambientNode(0);
  if (amb) s.add(amb);
  for (let i = 0; i < FLIPBOOK_SLOTS; i++) {
    s.add(
      primitives.plane({
        name: `vfx-ripple-${i}`,
        size: [1, 1, 1],
        material: flipbookQuadMaterial("ripple", [210, 244, 255]),
        castShadow: false,
        receiveShadow: false
      }).position(0, -999, 0).scale([0.001, 1, 0.001]).runtime(game.runtimeNode(`vfx-ripple-${i}`))
    );
    s.add(
      primitives.plane({
        name: `vfx-dust-${i}`,
        size: [1, 1, 1],
        material: flipbookQuadMaterial("dust", [246, 234, 208]),
        castShadow: false,
        receiveShadow: false
      }).position(0, -999, 0).rotate(Math.PI * 0.36, 0, 0).scale([0.001, 1, 0.001]).runtime(game.runtimeNode(`vfx-dust-${i}`))
    );
  }
  s.addMany(poolNodes(false, true, V0.floor) as never[]);
  return s.toJSON();
}

function swapVividLook(ti: number): void {
  if (!app) return;
  const V = VIVID_LOOKS[ti]!;
  const n0 = app.nodes as unknown as { remove(id: string): void; add(n: never): void; get(id: string): unknown; require(id: string): { setMaterial?(m: unknown): void } };
  const attempt = (fn: () => void): void => { try { fn(); } catch { /* best-effort */ } };
  attempt(() => n0.remove("look"));
  attempt(() => n0.add(buildVividLookGroup(ti) as never));
  attempt(() => n0.remove("sky"));
  attempt(() => n0.add(buildVividSky(ti) as never));
  attempt(() => n0.remove("ambient"));
  const amb = ambientNode(ti);
  if (amb) attempt(() => n0.add(amb as never));
  attempt(() => n0.remove("god-rays"));
  if (ti === 2 && !reducedMotion) attempt(() => n0.add(buildGodRaysNode() as never));
  attempt(() => n0.require("world-floor")?.setMaterial?.(material.pbr({ color: V.floor, roughness: 0.96, metalness: 0 })));
  try {
    (n0.get("sun-key") as LightHandleLike | undefined)?.setLight?.({ color: V.sun.color, intensity: V.sun.intensity, direction: sunDirection(V.sun.elevationDeg, V.sun.azimuthDeg) }, { transitionSeconds: reducedMotion ? 0 : 0.6 });
  } catch { /* setLight needs A3D_QR_LIGHTING */ }
  try { post()?.setEffect?.("bloom", { intensity: V.bloom.intensity, threshold: V.bloom.threshold }); } catch { /* post v2 only */ }
  syncLamps(ti, true);
  appliedLook = ti;
  themeChangedAt = st.time;
  lastKeyRow = -1;
}

/** Tilt-shift band centre at boot (the player row sits low in the diorama frame); updated every frame. */
const TILT_CENTER0 = 0.68;

/**
 * GU47 WP-24: the tabletop diorama scene. One shadowed sun (`sun-key`), hemisphere fill and the theme's HDRI as IBL,
 * a gradient sky, per-theme height fog and post preset, the signature tilt-shift DOF (absent under reduced motion;
 * the post tier drops it below High), per-surface ground pools and textured critters.
 */
function buildDioramaScene(): unknown {
  const L0 = THEME_LOOKS[0]!;
  const pose = dioramaPose({ x: 0, z: 0, sinceStart: Infinity, sinceTheme: Infinity, sinceDeath: Infinity, reducedMotion: true });
  const s = scene()
    .background(L0.sky.horizon)
    .add(buildLookGroup(THEMES[0]))
    .add(buildSky(0, 0))
    .add(buildSunKey(0))
    .add(effects.contactShadows({ length: 0.3, thickness: 0.05, steps: 16, intensity: 0.6 }))
    .add(effects.ambientOcclusion({ intensity: 0.46, radius: 0.42, multiBounce: true }))
    .add(effects.screenSpaceReflections({ intensity: 0.52, maxDistance: 14, roughness: 0.22, thickness: 0.25 }))
    .add(effects.bloom({ intensity: L0.bloom.intensity, threshold: L0.bloom.threshold, radius: 0.3 }))
    .add(effects.vignette({ intensity: 0.14, smoothness: 0.6 }))
    .camera(camera.perspective({ ...labCameraOptions(readLabFlags(), "reversed"), position: pose.position, target: pose.target, fov: pose.fov }));
  if (!reducedMotion) {
    s.add(effects.depthOfField({ name: "cross-hop tilt-shift", maxBlur: L0.tiltShift.maxBlur, tiltShift: { bandCenter: TILT_CENTER0, bandWidth: L0.tiltShift.bandWidth } }));
  }
  const amb = ambientNode(0);
  if (amb) s.add(amb);
  const flat = backdropFlat(pose.position, pose.target, pose.fov, FLOOR_Y);
  backdropColors(0).forEach((c, i) => {
    const b = flat.bands[i]!;
    s.add(primitives.plane({ name: `cross-hop backdrop ${i}`, size: [1, 1, 1], material: backdropMaterial(c), castShadow: false, receiveShadow: false })
      .position(flat.x, b.y, flat.z).rotate(Math.PI / 2, 0, 0).scale([BACKDROP_WIDTH, 1, b.height]).runtime(game.runtimeNode(`backdrop-${i}`)));
  });
  s.addMany(poolNodes(true) as never[]);
  return s.toJSON();
}

/** Backdrop flat colours, bottom to top: distant hills, horizon glow, mid sky, zenith (CH47-11 horizon). */
function backdropColors(ti: number): string[] {
  const k = THEME_LOOKS[ti]!.sky;
  return [k.ground, k.horizon, mixHex(k.horizon, k.zenith, 0.5), k.zenith];
}

/** The backdrop is a lit painted flat (a practical, like a theatre cyclorama): self-lit so the low sun does not shade
 *  it, and kept under the bloom threshold. */
function backdropMaterial(color: string) {
  return material.pbr({ color, emissive: color, emissiveIntensity: 0.55, roughness: 0.96, metalness: 0, practical: true });
}

const QA_PARAMS = typeof location !== "undefined" ? new URLSearchParams(location.search) : null;
/** ?diag=1&qaNoAmbient=1 drops the theme ambient emitter, so a frame pair isolates its pixels (measurement only). */
const QA_NO_AMBIENT = QA_PARAMS?.get("diag") === "1" && QA_PARAMS.get("qaNoAmbient") === "1";
/** ?diag=1&qaCamEye=x,y,z&qaCamAt=x,y,z[&qaCamFov=deg]: a fixed free camera in the diorama look, e.g. into the theme
 *  ambient emitter volume (measurement only). */
const QA_CAM_FREE = ((): { eye: [number, number, number]; target: [number, number, number]; fov: number } | null => {
  if (QA_PARAMS?.get("diag") !== "1") return null;
  const vec = (key: string): [number, number, number] | null => {
    const v = (QA_PARAMS.get(key) ?? "").split(",").map(Number);
    return v.length === 3 && v.every(Number.isFinite) ? [v[0]!, v[1]!, v[2]!] : null;
  };
  const eye = vec("qaCamEye"), target = vec("qaCamAt");
  return eye && target ? { eye, target, fov: Number(QA_PARAMS.get("qaCamFov")) || 40 } : null;
})();
/**
 * GU47 CH47-14: the theme's ambient particle emitter, following the player through the `ambient` runtime node.
 * Authored without `shape`/`shapeSize` on purpose: 5.0.2 ignored them (point spawn, 1.15 m radius) and 5.1 honours them,
 * which spread every theme's few hundred small particles through a 34 x 3 x 20.7 m box where they all but vanish. Without
 * them the emitter lowers exactly as in 5.0.2 (`AmbientEmitter.shapeSize` stays as data). Real-GPU frames per theme:
 * evidence/lane-511-engine-api/games-r3.
 */
function ambientNode(ti: number): AuraSceneNode | null {
  const a = ambientEmitter(THEME_LOOKS[ti]!.ambient, reducedMotion);
  if (!a || QA_NO_AMBIENT) return null;
  return effects.particles({
    name: a.name,
    position: [a.offset[0], a.offset[1], a.offset[2]],
    rate: a.rate,
    maxParticles: a.maxParticles,
    loop: true,
    lifetime: a.lifetime,
    // The legacy particle field types `speed` as one number: the midpoint of the emitter range.
    speed: (a.speed[0] + a.speed[1]) / 2,
    size: a.size,
    gravity: a.gravity,
    color: a.color,
    sprite: a.sprite,
    blend: a.blend
  }).runtime(game.runtimeNode("ambient")).toJSON() as AuraSceneNode;
}

/** Instanced pools, the critters and the floor; `diorama` + `vivid` share the 10/10 materials and surface pools. */
function poolNodes(diorama: boolean, flatFloor = diorama, floorColor?: string) {
  const th0 = THEMES[0];
  const rich = diorama || lookMode === "vivid";
  const groundMat = material.pbr({ color: "#ffffff", roughness: 0.88, metalness: 0.04 });
  const detailMat = material.pbr({ color: "#ffffff", roughness: 0.62, metalness: 0.06, clearcoat: rich ? 0.25 : 0, clearcoatRoughness: 0.24 });
  // Signals, lamp heads, neon strips and the coin are practicals in the diorama look (art direction: no emissive fill).
  const practical = diorama ? { practical: true } : {};
  const glowMat = material.pbr({ color: "#ffffff", emissive: "#ffffff", emissiveIntensity: 1.05, roughness: 0.38, ...practical });
  const pad = (n: number) => Array.from({ length: n }, () => ({ position: [0, -999, 0] as [number, number, number], scale: [0.001, 0.001, 0.001] as [number, number, number] }));

  const out = [
    primitives.plane({
      name: "world-floor",
      size: [1, 1, 1],
      material: material.pbr({ color: floorColor ?? th0.palette.dressingA, roughness: 0.94, metalness: 0 }),
      castShadow: false,
      receiveShadow: true
    }).position(0, -0.16, -20).rotate(flatFloor ? 0 : -Math.PI / 2, 0, 0).scale(flatFloor ? [220, 1, 220] : [220, 220, 1]).runtime(game.runtimeNode("world-floor")),
    instances.box({ name: "lane-ground", size: [1, 1, 1], material: groundMat, transforms: pad(CAP.ground), receiveShadow: true, castShadow: false }).runtime(game.runtimeNode("pool-ground")),
    instances.box({ name: "lane-detail", size: [1, 1, 1], material: detailMat, transforms: pad(CAP.detail), castShadow: false, receiveShadow: true }).runtime(game.runtimeNode("pool-detail")),
    instances.box({ name: "lane-glow", size: [1, 1, 1], material: glowMat, transforms: pad(CAP.glow), castShadow: false }).runtime(game.runtimeNode("pool-glow")),
    instances.box({ name: "scenery-glow", size: [1, 1, 1], material: glowMat, transforms: pad(CAP.glowS), castShadow: false }).runtime(game.runtimeNode("pool-glowS")),
    instances.roundedBox({ name: "horizon-ridge", size: [1, 1, 1], material: material.pbr({ color: "#ffffff", roughness: 0.94, metalness: 0 }), transforms: pad(CAP.horizon), castShadow: false, receiveShadow: false }).runtime(game.runtimeNode("pool-horizon")),
    // Full fleet of 3D Meshy traffic vehicles (length is along X in GLB local space)
    // Drawn lengths come from MOVER_LENGTH, the same table the hitboxes use (CH-5).
    instances.model(assets.trafficSedan, { name: "m-cars", transforms: pad(CAP.car), targetMaxDimension: MOVER_LENGTH.car, castShadow: true, ...vehicleMaterial(rich) }).runtime(game.runtimeNode("pool-car")),
    instances.model(assets.trafficHatch, { name: "m-hatch", transforms: pad(CAP.hatch), targetMaxDimension: MOVER_LENGTH.hatch, castShadow: true, ...vehicleMaterial(rich) }).runtime(game.runtimeNode("pool-hatch")),
    instances.model(assets.trafficSuv, { name: "m-suv", transforms: pad(CAP.suv), targetMaxDimension: MOVER_LENGTH.suv, castShadow: true, ...vehicleMaterial(rich) }).runtime(game.runtimeNode("pool-suv")),
    instances.model(assets.trafficTaxi, { name: "m-taxi", transforms: pad(CAP.taxi), targetMaxDimension: MOVER_LENGTH.taxi, castShadow: true, ...vehicleMaterial(rich) }).runtime(game.runtimeNode("pool-taxi")),
    instances.model(assets.trafficVan, { name: "m-van", transforms: pad(CAP.van), targetMaxDimension: MOVER_LENGTH.van, castShadow: true, ...vehicleMaterial(rich) }).runtime(game.runtimeNode("pool-van")),
    instances.model(assets.trafficPickup, { name: "m-pickup", transforms: pad(CAP.pickup), targetMaxDimension: MOVER_LENGTH.pickup, castShadow: true, ...vehicleMaterial(rich) }).runtime(game.runtimeNode("pool-pickup")),
    instances.model(assets.trafficBoxtruck, { name: "m-trucks", transforms: pad(CAP.truck), targetMaxDimension: MOVER_LENGTH.truck, castShadow: true, ...vehicleMaterial(rich) }).runtime(game.runtimeNode("pool-truck")),
    instances.model(assets.tramCar, { name: "m-trams", transforms: pad(CAP.tram), targetMaxDimension: MOVER_LENGTH.tram, castShadow: true, ...vehicleMaterial(rich) }).runtime(game.runtimeNode("pool-tram")),
    instances.model(assets.trainCar, { name: "m-trains", transforms: pad(CAP.train), targetMaxDimension: TRAIN_CAR_LENGTH, castShadow: true, ...vehicleMaterial(rich) }).runtime(game.runtimeNode("pool-train")),
    instances.model(assets.trafficSkyCar, { name: "m-hover", transforms: pad(CAP.hover), targetMaxDimension: MOVER_LENGTH.hover, castShadow: true, ...vehicleMaterial(rich) }).runtime(game.runtimeNode("pool-hover")),
    // Round bark logs lying across the river, half sunk, with pale cut ends (CH-E4).
    instances.cylinder({ name: "m-logs", size: [1, 1, 1], material: material.pbr({ color: "#ffffff", roughness: 0.92 }), transforms: pad(CAP.log), castShadow: true, receiveShadow: true }).runtime(game.runtimeNode("pool-log")),
    instances.cylinder({ name: "m-log-ends", size: [1, 1, 1], material: material.pbr({ color: "#ffffff", roughness: 0.8 }), transforms: pad(CAP.logEnd), castShadow: false, receiveShadow: true }).runtime(game.runtimeNode("pool-logEnd")),
    instances.cylinder({ name: "m-pads", size: [1, 1, 1], material: material.pbr({ color: "#ffffff", roughness: 0.8 }), transforms: pad(CAP.pad), castShadow: true, receiveShadow: true }).runtime(game.runtimeNode("pool-pad")),
    instances.cylinder({ name: "m-stones", size: [1, 1, 1], material: material.pbr({ color: "#ffffff", roughness: 0.85 }), transforms: pad(CAP.stone), castShadow: true, receiveShadow: true }).runtime(game.runtimeNode("pool-stone")),
    p4Dress && !diorama
      ? instances.model(assets.xhopCoin, { name: "m-coins", transforms: pad(CAP.coin), targetHeight: COIN_DIAMETER, castShadow: true }).runtime(game.runtimeNode("pool-coin"))
      : instances.cylinder({ name: "m-coins", size: [1, 1, 1], material: material.pbr({ color: "#ffffff", metalness: 0.55, roughness: 0.3, emissive: "#ffb21f", emissiveIntensity: 0.32, ...practical }), transforms: pad(CAP.coin), castShadow: true }).runtime(game.runtimeNode("pool-coin")),
    instances.cylinder({ name: "d-trunks", size: [1, 1, 1], material: detailMat, transforms: pad(CAP.trunk), castShadow: rich, receiveShadow: true }).runtime(game.runtimeNode("pool-trunk")),
    instances.sphere({ name: "d-canopy", size: [1, 1, 1], material: detailMat, transforms: pad(CAP.canopy), castShadow: rich, receiveShadow: true, ...(rich ? { wind: true } : {}) }).runtime(game.runtimeNode("pool-canopy")),
    instances.box({ name: "d-b", size: [1, 1, 1], material: detailMat, transforms: pad(CAP.dressB), castShadow: rich, receiveShadow: true }).runtime(game.runtimeNode("pool-dressb")),
    model(assets.hop, { name: "player", targetHeight: 1.05, castShadow: true, ...critterMaterial("hop", rich) })
      .position(0, 0.17, 0).rotate(0, Math.PI, 0)
      .animate({ clip: "Idle", loop: true })
      .runtime(game.runtimeNode("player")),
    model(assets.hawk, { name: "hawk", targetHeight: 1.35, castShadow: true, ...critterMaterial("hawk", rich) })
      .position(0, -999, 0)
      .runtime(game.runtimeNode("hawk")),
    model(assets.rescuePod, { name: "pod", targetHeight: 1.15, castShadow: true, ...(rich ? { materialOverrides: critterOverrides("rescuePod") } : {}) })
      .position(0, -999, 0)
      .runtime(game.runtimeNode("pod")),
    // 3D Meshy spectator critters cheering along the outer meadow banks! The diorama look mounts them after the
    // first frame (CH47-18 lazy load, `mountSpectators`).
    ...(diorama ? [] : SPECTATOR_CRITTERS).map((key, idx) =>
      model(assets[key], { name: `spectator-${idx}`, targetHeight: 0.92, castShadow: true, ...critterMaterial(key, rich) })
        .position((idx % 2 === 0 ? -1 : 1) * (SCENERY_X + 0.6 + (idx % 3) * 1.1), FLOOR_Y, -idx * 2.2)
        .rotate(0, idx % 2 === 0 ? Math.PI * 0.45 : -Math.PI * 0.45, 0)
        .animate({ clip: "Idle", loop: true })
        .runtime(game.runtimeNode(`spectator-${idx}`))
    )
  ];
  if (!diorama && p4Dress) {
    // GU47 phase 4: soft sun-cast shadow decals under every mover, the critter and the coin (see `sunShadowFootprint`).
    out.push(instances.plane({ name: "sun-shade", size: [1, 1, 1], material: shadeMaterial(), transforms: pad(CAP.shade), castShadow: false, receiveShadow: false }).runtime(game.runtimeNode("pool-shade")));
  }
  if (!diorama && p4Dress) {
    // Damp wet-bark timber rafters & rope lashings (kept named `m-rafts` for GU47 phase-4 parity).
    out.push(instances.roundedBox({ name: "m-rafts", size: [1, 1, 1], material: material.clearcoat({ color: "#ffffff", roughness: 0.56, metalness: 0, clearcoat: 0.62, clearcoatRoughness: 0.22 }), transforms: pad(CAP.raft), castShadow: true, receiveShadow: true }).runtime(game.runtimeNode("pool-raft")));
  }
  if (!diorama && lookMode === "vivid") {
    out.push(
      instances.roundedBox({ name: "s-felt", size: [1, 1, 1], material: material.felt({ color: "#ffffff", sheen: 0.14, envMapIntensity: 0.36 }), transforms: pad(CAP.felt), receiveShadow: true, castShadow: false }).runtime(game.runtimeNode("pool-felt")),
      instances.box({ name: "s-asphalt", size: [1, 1, 1], material: material.pbr({ color: "#ffffff", roughness: 0.84, metalness: 0.02 }), transforms: pad(CAP.asphalt), receiveShadow: true, castShadow: false }).runtime(game.runtimeNode("pool-asphalt")),
      instances.box({ name: "v-water", size: [1, 1, 1], material: riverWaterMaterial(), transforms: pad(CAP.water), receiveShadow: true, castShadow: false }).runtime(game.runtimeNode("pool-water")),
      instances.box({ name: "s-gravel", size: [1, 1, 1], material: material.pbr({ color: "#ffffff", roughness: 0.95, metalness: 0 }), transforms: pad(CAP.gravel), receiveShadow: true, castShadow: false }).runtime(game.runtimeNode("pool-gravel")),
      instances.box({ name: "s-lava", size: [1, 1, 1], material: lavaMagmaMaterial(), transforms: pad(CAP.lava), receiveShadow: false, castShadow: false }).runtime(game.runtimeNode("pool-lava"))
    );
  }
  if (diorama) {
    const L0 = THEME_LOOKS[0]!;
    out.push(
      instances.roundedBox({ name: "s-felt", size: [1, 1, 1], material: material.felt({ color: "#ffffff", sheen: 0.08, envMapIntensity: 0.3 }), transforms: pad(CAP.felt), receiveShadow: true, castShadow: false }).runtime(game.runtimeNode("pool-felt")),
      instances.box({ name: "s-asphalt", size: [1, 1, 1], material: material.pbr({ color: "#ffffff", roughness: 0.88, metalness: 0 }), transforms: pad(CAP.asphalt), receiveShadow: true, castShadow: false }).runtime(game.runtimeNode("pool-asphalt")),
      instances.box({ name: "s-water", size: [1, 1, 1], material: riverWaterMaterial(), transforms: pad(CAP.water), receiveShadow: true, castShadow: false }).runtime(game.runtimeNode("pool-water")),
      instances.box({ name: "s-gravel", size: [1, 1, 1], material: material.pbr({ color: "#ffffff", roughness: 0.97, metalness: 0 }), transforms: pad(CAP.gravel), receiveShadow: true, castShadow: false }).runtime(game.runtimeNode("pool-gravel")),
      instances.box({ name: "s-lava", size: [1, 1, 1], material: material.emissive({ color: "#ffffff", emissive: "#ff6a2a", emissiveIntensity: L0.surfaces.lavaEmissive, roughness: 0.6 }), transforms: pad(CAP.lava), receiveShadow: false, castShadow: false, instanceColorTarget: "both" }).runtime(game.runtimeNode("pool-lava"))
    );
  }
  return out;
}

/** CH47-18: the diorama look loads the 11 spectator critters after the app is ready, so they stay off the boot path. */
let spectatorsMounted = false;
export function mountSpectators(): void {
  if (!app || lookMode !== "diorama" || spectatorsMounted) return;
  spectatorsMounted = true;
  const n0 = app.nodes as unknown as { add(n: never): void };
  SPECTATOR_CRITTERS.forEach((key, idx) => {
    try {
      n0.add(model(assets[key], { name: `spectator-${idx}`, targetHeight: 0.92, castShadow: true, ...critterMaterial(key, true) })
        .position((idx % 2 === 0 ? -1 : 1) * (SCENERY_X + 0.6 + (idx % 3) * 1.1), FLOOR_Y, -idx * 2.2)
        .rotate(0, idx % 2 === 0 ? Math.PI * 0.45 : -Math.PI * 0.45, 0)
        .animate({ clip: "Idle", loop: true })
        .runtime(game.runtimeNode(`spectator-${idx}`))
        .toJSON() as never);
    } catch { /* runtime add unsupported: no spectators */ }
  });
}

/** CH47-08 + WP-14: vivid & diorama keep each critter's textures + rim/clearcoat + amphibian crouch; original paints cream. */
function critterMaterial(key: string, rich: boolean): {
  material?: typeof CRITTER_MAT;
  materialOverrides?: ReturnType<typeof critterOverrides>;
  nodeTransforms?: ReturnType<typeof critterNodeTransforms>;
} {
  if (!rich) return { material: CRITTER_MAT };
  const nodeTransforms = critterNodeTransforms(key);
  return {
    materialOverrides: critterOverrides(key),
    ...(nodeTransforms ? { nodeTransforms } : {})
  };
}
/** Drawn heights and depths (metres) of the movers, for their shadow decals. */
const SHADE_SIZE: Record<string, readonly [number, number]> = {
  car: [0.72, 0.92], hatch: [0.72, 0.9], taxi: [0.75, 0.92], suv: [0.9, 0.98], van: [0.95, 0.98], pickup: [0.85, 0.98],
  truck: [1.35, 1.02], tram: [1.45, 1.08], train: [1.4, 1.08], hover: [0.75, 0.95]
};

/** Queue one sun-cast shadow decal (vivid and 4.6 looks only). */
function shade(x: number, groundY: number, z: number, len: number, dep: number, height: number): void {
  if (lookMode === "diorama" || !p4Dress) return;
  const sun = lookMode === "vivid" ? VIVID_LOOKS[appliedLook]!.sun : ORIGINAL_SUN;
  const f = sunShadowFootprint(x, z, len, dep, height, sun);
  inst("shade", f.x, groundY + 0.008, f.z, f.len, 1, f.dep, "#000000");
}

function vehicleMaterial(rich: boolean): { materialOverrides?: typeof VEHICLE_OVERRIDES } {
  return rich ? { materialOverrides: VEHICLE_OVERRIDES } : {};
}

// -------------------- per-frame --------------------
let app: AuraApp | null = null;
let nodeOk = true;
export let nodeErr = "";
let activePlayerClip = "Idle";
/** Theme index of the look group currently mounted (CH-6). The mounted scene starts with theme 0. */
let appliedLook = 0;

export function bindApp(a: AuraApp): void {
  app = a;
  if (lookMode !== "original") {
    try { registerCrossHopVfx(a.effects as never, reducedMotion); } catch { /* vfx lane off */ }
    if (reducedMotion) { try { post()?.setEffectEnabled?.("depthOfField", false); } catch { /* post v2 only */ } }
  }
}

const CAR_POOLS: readonly (keyof typeof CAP)[] = ["car", "hatch", "suv", "taxi", "van", "pickup"];
const VEHICLE_POOL: Record<string, keyof typeof CAP> = { car: "car", truck: "truck", tram: "tram", train: "train", hover: "hover" };

export interface GameInput { buffered(d: string, w: number): boolean; consume?(d: string): boolean }
const DIRS = ["up", "down", "left", "right"] as const;

function consumeAll(input: GameInput): void {
  for (const d of DIRS) input.consume?.(d);
}

/** One fixed simulation step (CH-E1). Rendering is separate: `syncVisuals(alpha)`. */
export function step(dt: number, input: GameInput): void {
  if (st.paused) return;
  st.time += dt;
  if (st.messageT > 0) st.messageT -= dt;
  if (st.mode === "run") {
    runFrame(dt, input);
    st.railAlert = st.mode === "run" && railAlertNear();
  } else if (st.mode === "dead") {
    if (st.time - st.deadAt < RESTART_LOCKOUT) {
      // Keys pressed while the card appears are dropped, so they cannot skip it (CH-9).
      consumeAll(input);
      return;
    }
    const manualRestart = DIRS.some((d) => input.buffered(d, 0.14));
    if (manualRestart || (st.autopilot && st.time - st.deadAt > 1.4)) {
      if (manualRestart) { st.autopilot = false; consumeAll(input); }
      restartRun();
    }
  }
}

/** Compatibility wrapper for callers that drive one variable step and one draw. */
export function frame(dt: number, input: GameInput): void {
  step(dt, input);
  syncVisuals(dt);
}

function railAlertNear(): boolean {
  for (let r = st.playerRow; r <= st.playerRow + 2; r++) {
    const l = lane(r);
    if (l.type === "rail" && railWarning(l, st.time) > 0) return true;
  }
  return false;
}

function runFrame(dt: number, input: GameInput): void {
  let p = st.playerCol * COL_W;
  const l = lane(st.playerRow);
  // Row 0 is safe only while the player gets their bearings (CH-17); after that the hawk comes there too.
  if (st.playerRow === 0 && !st.autopilot && st.time < ROW0_GRACE) {
    st.idle = 0;
  } else {
    st.idle += dt;
  }

  // platform carry (river/lava)
  if (!st.hop.active && (l.type === "river" || l.type === "lava")) {
    const on = platformUnder(l, p);
    if (on < -1e8) { die(l.type === "river" ? "drowned" : "burned", l.type === "river" ? "Drowned" : "Burned"); return; }
    st.playerCol = on / COL_W;
    p = on;
    st.idle = 0; // riding counts as alive
  }
  // hawk pressure
  if (st.idle > HAWK_KILL) { die("snatched", "Snatched by the hawk"); return; }

  // hop trigger
  if (!st.hop.active) {
    let dir: string | null = null;
    let action: (typeof DIRS)[number] | null = null;
    if (input.buffered("up", 0.14)) { dir = "fwd"; action = "up"; }
    else if (input.buffered("down", 0.14)) { dir = "back"; action = "down"; }
    else if (input.buffered("left", 0.14)) { dir = "left"; action = "left"; }
    else if (input.buffered("right", 0.14)) { dir = "right"; action = "right"; }
    if (dir && action) {
      // One press is one hop: consume it so the same press cannot also fire the next step.
      input.consume?.(action);
      st.autopilot = false;
      tryHop(dir);
    } else if (st.autopilot) {
      autopilot(dt);
    }
  } else {
    st.hop.t += dt / HOP_DUR;
    if (st.hop.t >= 1) landHop();
  }

  // squash check on hazard lanes (while standing, not hopping); movers only hit inside the playfield
  if (!st.hop.active && !st.dead) {
    const laneType = l.type;
    if (laneType === "road" || laneType === "tram" || laneType === "rail") {
      const n = laneMovers(l, st.time, XS);
      for (let i = 0; i < n; i++) {
        const dist = Math.abs(XS[i] - p);
        if (dist < moverHalf(l) + 0.3) {
          if (laneType === "rail") die("flattened", "Flattened by the train");
          else die("squashed", "Squashed");
          break;
        }
        if (!st.dead && st.time >= nearMissCooldownUntil && dist < moverHalf(l) + 0.98) {
          st.nearMisses++;
          nearMissCooldownUntil = st.time + 0.85;
          pushEvent("Near miss!");
        }
      }
    }
    // screen-edge drown
    if (!st.dead && Math.abs(p) > FIELD_HALF) die("drowned", "Swept away");
  }

  // WP-14 near-miss check on the hazard row Hop just vaulted off within 260 ms
  if (!st.dead && st.time >= nearMissCooldownUntil && lastHopOriginRow >= 0 && st.time - lastHopOriginTime <= 0.26) {
    const prevLane = lane(lastHopOriginRow);
    if (prevLane.type === "road" || prevLane.type === "tram" || prevLane.type === "rail") {
      const nPrev = laneMovers(prevLane, st.time, XS);
      for (let i = 0; i < nPrev; i++) {
        if (Math.abs(XS[i] - lastHopOriginX) < moverHalf(prevLane) + 0.45) {
          st.nearMisses++;
          nearMissCooldownUntil = st.time + 0.85;
          lastHopOriginRow = -1;
          pushEvent("Close shave!");
          break;
        }
      }
    }
  }
}

interface ActiveFlipbook {
  kind: "ripple" | "dust";
  slot: number;
  x: number;
  y: number;
  z: number;
  age: number;
  duration: number;
  startScale: number;
  endScale: number;
  tint: readonly [number, number, number];
}
const activeFlipbooks: ActiveFlipbook[] = [];
let nextRippleSlot = 0;
let nextDustSlot = 0;

function spawnFlipbook(
  kind: "ripple" | "dust",
  x: number,
  y: number,
  z: number,
  duration: number,
  startScale: number,
  endScale: number,
  tint: readonly [number, number, number]
): void {
  if (lookMode !== "vivid" || reducedMotion || !app?.nodes) return;
  const slot = kind === "ripple" ? (nextRippleSlot++ % 4) : (nextDustSlot++ % 4);
  const existing = activeFlipbooks.findIndex((f) => f.kind === kind && f.slot === slot);
  const entry: ActiveFlipbook = { kind, slot, x, y, z, age: 0, duration, startScale, endScale, tint };
  if (existing >= 0) activeFlipbooks[existing] = entry;
  else activeFlipbooks.push(entry);
}

function syncFlipbooks(dt: number): void {
  if (lookMode !== "vivid" || !app?.nodes || activeFlipbooks.length === 0) return;
  for (let i = activeFlipbooks.length - 1; i >= 0; i--) {
    const f = activeFlipbooks[i]!;
    f.age += dt;
    const h = app.nodes.get(`vfx-${f.kind}-${f.slot}`);
    if (!h) { activeFlipbooks.splice(i, 1); continue; }
    const p = Math.max(0, Math.min(1, f.age / Math.max(0.05, f.duration)));
    if (p >= 1) {
      h.setPosition(0, -999, 0);
      activeFlipbooks.splice(i, 1);
      continue;
    }
    const ease = 1 - (1 - p) * (1 - p);
    const sc = f.startScale + (f.endScale - f.startScale) * ease;
    const alpha = (1 - p) * 0.88;
    h.setPosition(f.x, f.y, f.z);
    h.setScale([sc, 1, sc]);
    try {
      h.setMaterial?.(flipbookQuadMaterial(f.kind, f.tint, p, alpha) as never);
    } catch { /* custom material hot-update best-effort */ }
  }
}

function tryHop(dir: string): void {
  const originLane = lane(st.playerRow);
  const originX = st.playerCol * COL_W;
  const originZ = laneZ(st.playerRow);
  lastHopOriginRow = st.playerRow;
  lastHopOriginTime = st.time;
  lastHopOriginX = originX;
  let nr = st.playerRow, nc = Math.round(st.playerCol);
  if (dir === "fwd") nr++;
  else if (dir === "back") nr = Math.max(0, nr - 1);
  else if (dir === "left") nc = Math.max(COL_MIN, nc - 1);
  else if (dir === "right") nc = Math.min(COL_MAX, nc + 1);
  const targetLane = lane(nr);
  if (targetLane.type === "river" || targetLane.type === "lava") {
    // Snap onto a nearby platform only (CH-11); a hop into open water or lava lands there.
    const n = laneMovers(targetLane, st.time + HOP_DUR, XS);
    const targetX = nc * COL_W;
    let hasMoverUnder = false;
    let bestX = targetX;
    let bestDist = Infinity;
    for (let i = 0; i < n; i++) {
      const d = Math.abs(XS[i] - targetX);
      if (d < moverHalf(targetLane) - 0.08) { hasMoverUnder = true; break; }
      if (d < bestDist && Math.abs(XS[i]) <= FIELD_HALF - 0.5) { bestDist = d; bestX = XS[i]; }
    }
    if (!hasMoverUnder && bestDist <= PLATFORM_SNAP) nc = bestX / COL_W;
  }
  const fromY = playerBaseY(originLane);
  const toY = playerBaseY(targetLane);
  if (originLane.type === "river") {
    spawnFlipbook("ripple", originX, 0.024, originZ, 0.44, 0.42, 1.38, [188, 238, 255]);
  } else {
    spawnFlipbook("dust", originX, surfaceTopY(originLane) + 0.026, originZ, 0.32, 0.38, 0.96, [242, 234, 214]);
  }
  st.hop = { active: true, t: 0, fromX: originX, fromY, fromZ: originZ, toX: nc * COL_W, toY, toZ: laneZ(nr), dir };
  st.playerRow = nr; st.playerCol = nc;
  st.idle = 0;
  // Score counts new rows only, so hopping back and forth cannot farm points (CH-2).
  if (dir === "fwd" && nr > st.row) { st.score++; st.row = nr; }
}

function landHop(): void {
  st.hop.active = false;
  st.hop.t = 1;
  const l = lane(st.playerRow);
  const x = st.playerCol * COL_W;
  if (l.hasCoin && !st.coinTaken.has(l.row) && l.coinCol === Math.round(st.playerCol)) {
    st.coinTaken.add(l.row); st.coins += 10; st.score += 10;
    pushEvent("+10 coin");
    if (lookMode !== "original") { app?.effects?.burst(CROSS_HOP_VFX.coin, [x, 0.6, laneZ(st.playerRow)]); comboTrail(); }
    else app?.effects?.burst("pickup", [x, 0.6, laneZ(st.playerRow)], { count: 14, speed: 2.2, scale: 0.5, color: COLORS.coin });
  }
  if (l.hasPod && !st.podTaken.has(l.row) && l.podCol === Math.round(st.playerCol)) {
    st.podTaken.add(l.row); st.score += 50; st.rescues++;
    const locked = CRITTERS.filter(c => !st.profile.unlocked.includes(c.id));
    if (locked.length) {
      const pick = locked[Math.floor(Math.random() * locked.length)];
      st.profile.unlocked.push(pick.id);
      st.runUnlocks.push(pick.label);
      pushEvent(`+50 rescue pod — ${pick.label} unlocked!`);
    } else pushEvent("+50 rescue pod");
    if (lookMode !== "original") app?.effects?.burst(CROSS_HOP_VFX.rescue, [x, 0.8, laneZ(st.playerRow)]);
    else app?.effects?.burst("aura-burst", [x, 0.8, laneZ(st.playerRow)], { count: 30, speed: 3, scale: 0.7, color: COLORS.pod });
  }
  if (l.type === "river" || l.type === "lava") {
    const on = platformUnder(l, x);
    if (on < -1e8) { die(l.type === "river" ? "drowned" : "burned", l.type === "river" ? "Drowned" : "Burned"); return; }
    st.playerCol = on / COL_W;
  }
  landingEffect(l, st.playerCol * COL_W, laneZ(st.playerRow));
  // drill completion
  if (st.runKind === "drill" && st.drill && st.playerRow >= st.drill.script.length) {
    if (!st.profile.drills.includes(st.drill.id)) {
      st.profile.drills.push(st.drill.id);
      st.coins += 25;
      pushEvent(`Drill cleared: ${st.drill.label} (+25)`);
    } else pushEvent(`Drill cleared: ${st.drill.label}`);
    st.mode = "dead";
    st.dead = null; // reuse summary card
    st.deadAt = st.time;
    bankRun();
    return;
  }
  // theme shift
  const ti = st.runKind === "drill" ? 0 : (st.forceTheme ?? themeIndexForRow(st.playerRow, st.seed));
  if (ti !== st.themeIdx) {
    st.themeIdx = ti;
    swapLook(ti);
    pushEvent(`Theme: ${THEMES[ti].label}`);
  }
}

/** CH47-13 / WP-14: theme-coloured landing dust, log splash + ripple flipbook, lily-pad ring, lava sparks. */
function landingEffect(l: Lane, x: number, z: number): void {
  if (lookMode === "original") return;
  if (l.type === "river") {
    spawnFlipbook("ripple", x, 0.026, z, 0.54, 0.52, 1.78, [196, 244, 255]);
  } else if (l.type === "lava") {
    spawnFlipbook("dust", x, 0.18, z, 0.42, 0.48, 1.24, [255, 146, 68]);
  } else {
    spawnFlipbook("dust", x, surfaceTopY(l) + 0.028, z, 0.36, 0.45, 1.14, [244, 236, 218]);
  }
  if (!app?.effects) return;
  const kind = landingVfx(l.type, l.moverKind === "log");
  if (!kind) return;
  try { app.effects.burst(kind, [x, surfaceTopY(l), z], kind === CROSS_HOP_VFX.landDust ? { color: THEME_LOOKS[l.theme]!.dust } : undefined); } catch { /* vfx off */ }
}

/** CH47-13: a coin-gold trail behind the critter while coins come in quick succession. */
let comboHandle: { stop(o?: { immediate?: boolean }): void; readonly alive: boolean } | null = null;
let comboUntil = 0;
const COMBO_SECONDS = 1.6;
function comboTrail(): void {
  if (!app?.effects || reducedMotion) return;
  const live = comboHandle?.alive === true && st.time < comboUntil;
  comboUntil = st.time + COMBO_SECONDS;
  if (live) return;
  try { comboHandle = app.effects.trail("player", { width: 0.14, life: 0.35, color: "#ffc531" }); } catch { comboHandle = null; }
}
/** Stops the combo trail once the streak lapses (called from syncVisuals). */
function syncCombo(): void {
  if (comboHandle && st.time >= comboUntil) { try { comboHandle.stop(); } catch { /* gone */ } comboHandle = null; }
}

/** The death effect for a death kind (CH47-13), fired by main.ts. */
export function deathEffect(kind: Death["kind"], at: [number, number, number]): void {
  if (!app?.effects) return;
  if (lookMode !== "original") app.effects.burst(DEATH_VFX[kind], at, { color: DEATH_COLORS[kind] });
  else app.effects.burst("debris", at, { count: 26, speed: 4, scale: 0.7 });
}

function platformUnder(l: Lane, x: number): number {
  const n = laneMovers(l, st.time, XS);
  for (let i = 0; i < n; i++) if (Math.abs(XS[i] - x) < moverHalf(l) + 0.25) return XS[i];
  return -1e9;
}

/**
 * Demo and QA autopilot. It checks a target cell over a short time window with the real hit sizes, so it only steps
 * into a gap it can stand in, steps aside or back when the cell it stands on is about to be hit, and works back toward
 * the centre while riding a platform.
 */
function autopilot(dt: number): void {
  st.apTimer += dt;
  if (st.apTimer < 0.12) return;
  st.apTimer = 0;
  const curCol = Math.round(st.playerCol);
  const ahead = lane(st.playerRow + 1);
  const curLane = lane(st.playerRow);
  /** Will a mover hit column x of lane l at any time in [from, to] seconds from now? */
  const hit = (l: Lane, px: number, from: number, to: number): boolean => {
    for (let dtk = from; dtk <= to + 1e-6; dtk += 0.04) {
      const n = laneMovers(l, st.time + dtk, XS);
      for (let i = 0; i < n; i++) if (Math.abs(XS[i] - px) < moverHalf(l) + 0.55) return true;
    }
    return false;
  };
  const platformAt = (l: Lane, px: number, when: number): boolean => {
    const n = laneMovers(l, st.time + when, XS);
    for (let i = 0; i < n; i++) if (Math.abs(XS[i] - px) < moverHalf(l) - 0.12 && Math.abs(XS[i]) < FIELD_HALF - 1.5) return true;
    return false;
  };
  const safe = (l: Lane, col: number, hold = 0.7): boolean => {
    const px = col * COL_W;
    if (Math.abs(px) > FIELD_HALF - 1.5) return false;
    if (l.type === "road" || l.type === "tram" || l.type === "rail") {
      if (l.type === "rail" && railWarning(l, st.time + HOP_DUR) > 0) return false;
      if (l.type === "rail" && railWarning(l, st.time + HOP_DUR + hold) > 0) return false;
      return !hit(l, px, 0, HOP_DUR + hold);
    }
    if (l.type === "river" || l.type === "lava") return platformAt(l, px, HOP_DUR);
    return true;
  };
  const onPlatform = curLane.type === "river" || curLane.type === "lava";
  const hereInDanger = (curLane.type === "road" || curLane.type === "tram" || curLane.type === "rail")
    && hit(curLane, st.playerCol * COL_W, 0, 0.5);
  if (safe(ahead, curCol)) { tryHop("fwd"); return; }
  const inward = curCol < 0 ? 1 : -1;
  if (onPlatform && Math.abs(curCol) >= 3 && safe(curLane, curCol + inward)) { tryHop(inward > 0 ? "right" : "left"); return; }
  if (hereInDanger) {
    if (safe(curLane, curCol + inward, 0.5)) { tryHop(inward > 0 ? "right" : "left"); return; }
    if (safe(curLane, curCol - inward, 0.5)) { tryHop(inward > 0 ? "left" : "right"); return; }
    if (st.playerRow > 0 && safe(lane(st.playerRow - 1), curCol, 0.5)) { tryHop("back"); return; }
    return;
  }
  // Waiting on solid, quiet ground: look for a column with a better chance of a gap ahead.
  if (onPlatform || curLane.type !== "meadow") return;
  if (curCol !== 0 && safe(ahead, curCol + inward) && safe(curLane, curCol + inward)) tryHop(inward > 0 ? "right" : "left");
  else if (st.idle > 2.2 && safe(curLane, curCol + inward)) tryHop(inward > 0 ? "right" : "left");
  else if (st.idle > 3.4 && safe(curLane, curCol - inward)) tryHop(inward > 0 ? "left" : "right");
}

// -------------------- visuals --------------------
/** The app's runtime post surface (E-C `setEffect` / `setEffectEnabled`), duck-typed. */
interface PostLike { setEffect?(name: string, patch: Record<string, number | string | boolean | number[]>): void; setEffectEnabled?(name: string, on: boolean): void }
function post(): PostLike | undefined {
  return (app as unknown as { post?: PostLike } | null)?.post;
}
interface LightHandleLike { setLight?(patch: { color?: string; intensity?: number; distance?: number; direction?: [number, number, number] }, opts?: { transitionSeconds?: number }): void; setPosition(x: number, y: number, z: number): void; setVisible(v: boolean): void }

/** Sim time of the last theme swap (camera theme lift, CH47-11); -Infinity: none yet. */
let themeChangedAt = -Infinity;
/** Lamp pool added to the scene (CH47-02): added on the first lamp theme, then shown or hidden. */
let lampsAdded = false;
/** Lamp points in the pool; the Low tier keeps 4 (4 lights per pixel, PRD §6.4). */
export const LAMP_POOL = 12;
let lampCount = LAMP_POOL;
export function setLampBudget(n: number): void { lampCount = Math.max(0, Math.min(LAMP_POOL, Math.floor(n))); }

/** GU47 WP-24 theme swap: look group, gradient sky, sun key blend, bloom and DOF strength, ambient emitter, lamps. */
function swapDioramaLook(ti: number): void {
  if (!app) return;
  const L = THEME_LOOKS[ti]!;
  const th = THEMES[ti]!;
  const n0 = app.nodes as unknown as { remove(id: string): void; add(n: never): void; get(id: string): unknown; require(id: string): { setMaterial?(m: unknown): void } };
  // Each step is best-effort on its own, so a missing node (no ambient emitter on Downtown) cannot skip the rest.
  const attempt = (fn: () => void): void => { try { fn(); } catch { /* best-effort */ } };
  attempt(() => n0.remove("look"));
  attempt(() => n0.add(buildDioramaLookGroup(ti) as never));
  attempt(() => n0.remove("sky"));
  attempt(() => n0.add(buildSky(ti, st.playerRow) as never));
  attempt(() => n0.remove("ambient"));
  const amb = ambientNode(ti);
  if (amb) attempt(() => n0.add(amb as never));
  const terrain = th.dress === "trees" || th.dress === "reeds" || th.dress === "candy" ? th.palette.dressingA : th.palette.dressingB;
  attempt(() => n0.require("world-floor")?.setMaterial?.(material.pbr({ color: terrain, roughness: 0.96, metalness: 0 })));
  backdropColors(ti).forEach((c, i) => attempt(() => n0.require(`backdrop-${i}`)?.setMaterial?.(backdropMaterial(c))));
  // Only the HDRI and the post preset snap; the key blends (CH47-19).
  const key = keyAt(ti, null, st.playerRow);
  try {
    (n0.get("sun-key") as LightHandleLike | undefined)?.setLight?.({ color: key.color, intensity: key.intensity, direction: sunDirection(key.elevationDeg, key.azimuthDeg) }, { transitionSeconds: reducedMotion ? 0 : 0.6 });
  } catch { /* setLight needs A3D_QR_LIGHTING */ }
  try {
    post()?.setEffect?.("bloom", { intensity: L.bloom.intensity, threshold: L.bloom.threshold });
    if (!reducedMotion) post()?.setEffect?.("depthOfField", { maxBlur: L.tiltShift.maxBlur });
  } catch { /* post v2 only */ }
  syncLamps(ti, true);
  appliedLook = ti;
  themeChangedAt = st.time;
  lastKeyRow = -1;
}

/** Row the sun key was last aimed for; the sweep re-aims once per row (CH47-03 signature, CH47-19). */
let lastKeyRow = -1;

/** The theme the next stride will show (CH47-19 blend target); null when the run cannot change theme. */
function nextThemeFor(row: number): number | null {
  if (st.runKind === "drill" || st.forceTheme !== undefined) return null;
  const nextStride = (Math.floor(row / 25) + 1) * 25;
  return themeIndexForRow(nextStride, st.seed);
}

/** Moves the sun with progress and blends the key toward the next theme over the last 5 rows. */
function syncSunKey(): void {
  if (!app || lookMode !== "diorama" || st.playerRow === lastKeyRow) return;
  lastKeyRow = st.playerRow;
  const k = keyAt(appliedLook, nextThemeFor(st.playerRow), st.playerRow);
  try {
    (app.nodes.get("sun-key") as unknown as LightHandleLike | undefined)?.setLight?.(
      { color: k.color, intensity: k.intensity, direction: sunDirection(k.elevationDeg, k.azimuthDeg) },
      { transitionSeconds: reducedMotion ? 0 : 0.35 }
    );
  } catch { /* setLight needs A3D_QR_LIGHTING */ }
}

/** CH47-02 / WP-14: places the lamp pool along the rows ahead on lamp themes and hides it elsewhere. */
let lampRow = -1;
function syncLamps(ti: number, force = false): void {
  if (!app || lookMode === "original") return;
  const L = THEME_LOOKS[ti]!;
  const n0 = app.nodes as unknown as { add(n: never): void; get(id: string): unknown };
  if (L.lamps.count > 0 && !lampsAdded) {
    lampsAdded = true;
    for (let i = 0; i < LAMP_POOL; i++) {
      try {
        n0.add(lights.point({ name: `cross-hop lamp ${i}`, position: [0, -50, 0], intensity: 0, distance: 8, color: "#ffb347" }).runtime(game.runtimeNode(`lamp-${i}`)).toJSON() as never);
      } catch { /* runtime add unsupported */ }
    }
  }
  if (!lampsAdded) return;
  const from = Math.max(0, st.playerRow - 2);
  if (!force && from === lampRow) return;
  lampRow = from;
  const slots = lampSlots(from, LAMP_POOL);
  for (let i = 0; i < LAMP_POOL; i++) {
    const h = n0.get(`lamp-${i}`) as LightHandleLike | undefined;
    if (!h) continue;
    const on = L.lamps.count > 0 && i < Math.min(L.lamps.count, lampCount);
    h.setVisible(on);
    if (!on) continue;
    const slot = slots[i]!;
    h.setPosition(slot.x, slot.y, slot.z);
    try { h.setLight?.({ color: L.lamps.colors[i % L.lamps.colors.length]!, intensity: L.lamps.power / 100, distance: L.lamps.distance }); } catch { /* lighting lane off */ }
  }
}

function swapLook(ti: number): void {
  if (lookMode === "diorama") { swapDioramaLook(ti); return; }
  if (lookMode === "vivid") { swapVividLook(ti); return; }
  if (!app) return;
  const base = THEMES[ti];
  // GU47 phase 5: dusk sky on the dressed Critter Core view (sibling distinctness vs pips-big-leap).
  const th = p5DuskFor(lookMode, p4Dress, base.id) ? { ...base, palette: { ...base.palette, ...P5_DUSK_SKY } } : base;
  try {
    const n0 = app.nodes as unknown as { remove(id: string): void; add(n: never): void; require(id: string): { setMaterial?(m: unknown): void; setVisible?(v: boolean): void } };
    n0.remove("look");
    n0.add(buildLookGroup(th) as never);
    n0.remove("skirt");
    n0.add(
      primitives.box({
        name: "sky-backdrop",
        size: [220, 80, 1],
        material: material.pbr({ color: th.palette.sky, emissive: th.palette.sky, emissiveIntensity: 0.45, roughness: 0.96, metalness: 0 }),
        castShadow: false,
        receiveShadow: false
      })
        .position(st.playerCol * COL_W * 0.4, 22, laneZ(st.playerRow) - 56)
        .runtime(game.runtimeNode("skirt"))
        .toJSON() as never
    );
    n0.remove("skirt-horizon");
    n0.add(
      primitives.box({
        name: "sky-horizon",
        size: [220, 22, 1],
        material: material.pbr({ color: th.palette.horizon, emissive: th.palette.horizon, emissiveIntensity: 0.4, roughness: 0.96, metalness: 0 }),
        castShadow: false,
        receiveShadow: false
      })
        .position(st.playerCol * COL_W * 0.4, 4, laneZ(st.playerRow) - 54)
        .runtime(game.runtimeNode("skirt-horizon"))
        .toJSON() as never
    );
    // Re-tint the landscape and hide the sun disc in indoor/night themes.
    const terrain = th.dress === "trees" || th.dress === "reeds" || th.dress === "candy"
      ? th.palette.dressingA
      : th.palette.dressingB;
    n0.require("world-floor")?.setMaterial?.(material.pbr({ color: terrain, roughness: 0.96, metalness: 0 }));
    n0.require("sun")?.setVisible?.(th.dress === "trees" || th.dress === "reeds" || th.dress === "candy");
    try { (app as unknown as { lighting?: { setEnvironmentIntensity?(n:number):void } }).lighting?.setEnvironmentIntensity?.(0.58); } catch { /* no-op */ }
    appliedLook = ti;
  } catch { /* look swap best-effort */ }
}

const TRUCK_TINTS = ["#d8e0ea", "#e2dad0", "#d4e0e6"] as const;
const TRUCK_STRIPES = ["#ef476f", "#118ab2", "#ffb703", "#06d6a0"] as const;

/** Pools whose content depends only on the visible rows, their themes and the run: rebuilt when that key changes (CH-E3). */
const STATIC_POOLS: readonly (keyof typeof CAP)[] = ["ground", "detail", "glowS", "trunk", "canopy", "dressB", "felt", "asphalt", "water", "gravel", "lava", "horizon"];
const DYNAMIC_POOLS = (Object.keys(CAP) as (keyof typeof CAP)[]).filter((k) => !STATIC_POOLS.includes(k));
let staticKey = "";
/** Pools submitted while empty and already hidden; they need no upload until they hold something again. */
const emptySubmitted = new Set<keyof typeof CAP>();

/** Reduced motion (CH-15): no hawk FOV widening. main.ts sets it from `prefers-reduced-motion`. */
let reducedMotion = false;
export function setReducedMotion(on: boolean): void { reducedMotion = on; }

/** WP-14 real-time impact rig camera shake & FOV kick (driven by real frame dt in main.ts). */
const camImpactOffset: [number, number, number] = [0, 0, 0];
let camImpactFov = 0;
export function setCameraImpact(offset: readonly [number, number, number], fovDeltaDeg: number): void {
  camImpactOffset[0] = offset[0];
  camImpactOffset[1] = offset[1];
  camImpactOffset[2] = offset[2];
  camImpactFov = fovDeltaDeg;
}

/**
 * Simulation time drawn this frame: between the last two fixed steps, `alpha` of the way (CH-E1). Movers are pure
 * functions of time, so drawing them at this time is exact interpolation.
 */
export function renderTime(alpha: number): number {
  if (st.mode !== "run" || st.paused) return st.time;
  return Math.max(0, st.time - (1 - Math.max(0, Math.min(1, alpha))) * SIM_STEP);
}

/** Player pose drawn this frame, interpolated the same way as the movers. */
export function displayPose(alpha: number): { x: number; y: number; z: number; hopping: boolean } {
  const tr = renderTime(alpha);
  const lag = st.time - tr;
  const pl = lane(st.playerRow);
  if (st.hop.active) {
    const t = Math.max(0, Math.min(1, st.hop.t - lag / HOP_DUR));
    const x = st.hop.fromX + (st.hop.toX - st.hop.fromX) * t;
    const z = st.hop.fromZ + (st.hop.toZ - st.hop.fromZ) * t;
    const y = st.hop.fromY + (st.hop.toY - st.hop.fromY) * t + Math.sin(Math.PI * t) * 0.68;
    return { x, y: Math.max(0.17, y), z, hopping: true };
  }
  let x = st.playerCol * COL_W;
  // Riding a log or stone: the platform moves at a constant speed, so the drawn x trails the sim by `lag`.
  if (!st.dead && (pl.type === "river" || pl.type === "lava")) x -= pl.dir * pl.speed * lag;
  return { x, y: Math.max(0.17, playerBaseY(pl)), z: laneZ(st.playerRow), hopping: false };
}

/** Draw-side state of the diorama look (never read by the sim). */
let frameDt = 0, lastDrawTime = -1, landedAt = -1, wasHopping = false, drawnYaw = Math.PI;
let camX = 0, camZ = 0, camPrimed = false, lastBand = -1;
/** Last diorama camera pose and tilt-shift band, for the QA hook and tests. */
export const dioramaView = { position: [0, 0, 0] as [number, number, number], target: [0, 0, 0] as [number, number, number], fov: CAM_DIORAMA.fov as number, bandCenter: 0.68 };

/** CH47-11 camera (damped follow, crane-down intro, theme lift, death push-in) and CH47-05 tilt-shift focus. */
function syncDioramaCamera(px: number, pz: number, py: number, warn: number): void {
  if (!app) return;
  if (!camPrimed || st.time < 1e-6) { camX = px; camZ = pz; camPrimed = true; }
  camX = damp(camX, px * 0.6, CAM_DIORAMA.follow, frameDt);
  camZ = damp(camZ, pz, CAM_DIORAMA.follow, frameDt);
  const p = dioramaPose({
    x: camX,
    z: camZ,
    sinceStart: st.time,
    sinceTheme: themeChangedAt === -Infinity ? Infinity : st.time - themeChangedAt,
    sinceDeath: st.dead ? st.time - st.deadAt : Infinity,
    reducedMotion
  });
  const fov = p.fov + (reducedMotion ? 0 : warn * 3);
  if (QA_CAM_FREE) { app.camera?.setPose({ position: QA_CAM_FREE.eye, target: QA_CAM_FREE.target, fov: QA_CAM_FREE.fov }); return; }
  app.camera?.setPose({ position: p.position, target: p.target, fov });
  dioramaView.position = p.position; dioramaView.target = p.target; dioramaView.fov = fov;
  const flat = backdropFlat(p.position, p.target, fov, FLOOR_Y);
  for (let i = 0; i < flat.bands.length; i++) {
    const h = app.nodes?.get(`backdrop-${i}`);
    if (!h) continue;
    h.setPosition(flat.x, flat.bands[i]!.y, flat.z);
    h.setScale([BACKDROP_WIDTH, 1, flat.bands[i]!.height]);
  }
  if (reducedMotion) return;
  const band = screenY([px, py + 0.4, pz], p.position, p.target, fov);
  if (band === null || Math.abs(band - lastBand) < 0.004) return;
  lastBand = band;
  dioramaView.bandCenter = band;
  try { post()?.setEffect?.("depthOfField", { tiltShift: [band, THEME_LOOKS[appliedLook]!.tiltShift.bandWidth] }); } catch { /* post v2 only */ }
}

export function syncVisuals(alpha = 1): void {
  if (!app) return;
  const nodes = app.nodes;
  if (!nodes) return;
  const tr = renderTime(alpha);
  frameDt = lastDrawTime < 0 ? 0 : Math.max(0, Math.min(0.1, tr - lastDrawTime));
  lastDrawTime = tr;

  const lo = Math.max(0, st.playerRow - ROW_BEHIND), hi = st.playerRow + ROW_AHEAD;
  const key = `${st.runId}|${lo}|${hi}|${st.themeIdx}`;
  const rebuildStatic = key !== staticKey;
  for (const k of rebuildStatic ? (Object.keys(CAP) as (keyof typeof CAP)[]) : DYNAMIC_POOLS) P(k).n = 0;

  const pose = displayPose(alpha);
  for (let r = lo; r <= hi; r++) paintLane(lane(r), r, tr, rebuildStatic, pose.x);
  if (rebuildStatic) paintDressing(lo, hi);

  // movers
  for (let r = lo; r <= hi; r++) {
    const l = lane(r);
    if (l.moverKind === "none") continue;
    const n = laneMovers(l, tr, XS);
    const z = laneZ(r);
    for (let i = 0; i < n; i++) {
      const x = XS[i];
      const ry = l.dir > 0 ? 0 : Math.PI;
      if (l.moverKind === "log") {
        // Round log along X: radius 0.3, top at 0.22 like the old slab, so it rides half sunk in the water.
        if (p4Dress && lookMode !== "diorama") {
          const candy = candyRaftFor(lookMode, p4Dress, THEMES[appliedLook]?.id ?? "");
          if (candy) {
            inst("raft", x, 0.22 - 0.07, z, MOVER_LENGTH.log, 0.14, 0.78, P5_CANDY_RAFT.deck);
            for (const e of [-1, 1]) inst("raft", x, 0.03, z + e * 0.27, MOVER_LENGTH.log * 0.92, 0.16, 0.2, P5_CANDY_RAFT.pontoon);
          } else {
            // WP-14 damp dark-bark multi-timber log raft with hemp rope lashings & heartwood grain ends.
            inst("raft", x, 0.22 - 0.075, z, MOVER_LENGTH.log, 0.15, 0.30, "#633d22");
            inst("raft", x, 0.22 - 0.085, z - 0.27, MOVER_LENGTH.log * 0.96, 0.15, 0.24, "#764b2c");
            inst("raft", x, 0.22 - 0.085, z + 0.27, MOVER_LENGTH.log * 0.96, 0.15, 0.24, "#58351d");
            for (const strap of [-1, 1]) {
              inst("raft", x + strap * (MOVER_LENGTH.log * 0.31), 0.22 - 0.068, z, 0.14, 0.165, 0.80, "#dfc086");
              inst("logEnd", x + strap * (MOVER_LENGTH.log / 2 + 0.008), 0.14, z, 0.26, 0.025, 0.26, "#ebd19e", 0, Math.PI / 2);
            }
          }
          shade(x, 0.0, z, MOVER_LENGTH.log * 0.96, 0.7, 0.22);
          continue;
        }
        inst("log", x, 0.22 - 0.3, z, 0.6, MOVER_LENGTH.log, 0.6, "#6b4223", 0, Math.PI / 2);
        for (const e of [-1, 1]) inst("logEnd", x + e * (MOVER_LENGTH.log / 2 + 0.01), 0.22 - 0.3, z, 0.5, 0.03, 0.5, "#e6c792", 0, Math.PI / 2);
      }
      // Lilypads: top surface at PAD_TOP, the critter's base height on pad lanes (CH-16).
      else if (l.moverKind === "pad") {
        inst("pad", x, PAD_TOP - PAD_H / 2, z, 0.94, PAD_H, 0.94, "#3d9950", (r * 1.7 + i) % (Math.PI * 2));
        if (lookMode !== "original") {
          inst("detail", x, PAD_TOP + 0.004, z, 0.56, 0.012, 0.56, "#69c46e", (r + i) * 0.8);
          if ((r + i) % 3 === 0) {
            inst("canopy", x + 0.18, PAD_TOP + 0.07, z - 0.14, 0.22, 0.13, 0.22, (r + i) % 2 === 0 ? "#ff8fab" : "#ffd166");
          }
        }
      }
      // Lava stones: center y = 0.06, sy = 0.20 -> top surface at y = 0.16, sz = 0.88 fits inside LANE_D = 1.15
      else if (l.moverKind === "stone") {
        inst("stone", x, 0.06, z, 1.05, 0.20, 0.88, "#4b4b56");
        if (lookMode !== "original") inst("detail", x, 0.162, z, 0.76, 0.014, 0.62, "#636472");
      }
      else {
        const th2 = THEMES[l.theme];
        const kind = th2.vehicleSet === "hover" && l.moverKind === "car" ? "hover" : l.moverKind;
        const pool = kind === "car" ? CAR_POOLS[(r * 3 + i) % CAR_POOLS.length]! : VEHICLE_POOL[kind]!;
        const roadTopY = l.type === "rail" ? 0.13 : l.type === "tram" ? 0.128 : 0.12;
        const lift = kind === "hover" ? 0.32 : 0;
        const tint = pool === "truck" ? TRUCK_TINTS[(r + i) % TRUCK_TINTS.length]! : "#f4ead9";
        if (pool === "train") {
          // One train is TRAIN_CARS coupled cars; lead locomotive + passenger coaches share exact hitbox (CH-5).
          const leadIdx = l.dir > 0 ? TRAIN_CARS - 1 : 0;
          const coachScaleX = TRAIN_CAR_LENGTH / MOVER_LENGTH.tram;
          for (let c = 0; c < TRAIN_CARS; c++) {
            const cx = x + (c - (TRAIN_CARS - 1) / 2) * TRAIN_CAR_LENGTH;
            if (lookMode !== "original" && c !== leadIdx) {
              inst("tram", cx, roadTopY, z, coachScaleX, 0.96, 0.96, c === 1 ? "#dbe7f6" : "#e8f0fa", ry);
              inst("glow", cx, roadTopY + 0.56, z, TRAIN_CAR_LENGTH * 0.68, 0.14, 0.84, "#ffe29a");
            } else {
              inst("train", cx, roadTopY, z, 1, 1, 1, tint, ry);
              if (lookMode !== "original") {
                inst("glow", cx + l.dir * (TRAIN_CAR_LENGTH * 0.48), roadTopY + 0.52, z, 0.08, 0.18, 0.44, "#fff4bd");
              }
            }
            if (lookMode !== "original" && c < TRAIN_CARS - 1) {
              inst("detail", cx + TRAIN_CAR_LENGTH * 0.5, roadTopY + 0.24, z, 0.22, 0.12, 0.34, "#252830");
            }
          }
          const [th, td] = SHADE_SIZE.train!;
          shade(x, roadTopY, z, TRAIN_CARS * TRAIN_CAR_LENGTH * 0.98, td, th);
        } else {
          inst(pool, x, roadTopY + lift, z, 1, 1, 1, tint, ry);
          if (lookMode !== "original" && pool === "truck") {
            const stripe = TRUCK_STRIPES[(r + i) % TRUCK_STRIPES.length]!;
            for (const sgn of [-1, 1] as const) {
              inst("detail", x - l.dir * 0.18, roadTopY + 0.62, z + sgn * 0.48, 1.36, 0.12, 0.025, stripe);
            }
          }
          const [sh, sd] = SHADE_SIZE[pool] ?? [0.8, 0.95];
          const lengths = MOVER_LENGTH as Record<string, number>;
          shade(x, roadTopY, z, (lengths[pool] ?? lengths[kind] ?? 2) * 0.96, sd, sh + lift);
        }
      }
    }
  }

  // coins: one upright spinning disc per pickup (CH-13)
  for (let r = lo; r <= hi; r++) {
    const l = lane(r);
    if (l.hasCoin && !st.coinTaken.has(r)) {
      const coinBase = surfaceTopY(l) + COIN_LIFT;
      // The fitted coin model stands on its lowest point: drop it by its radius so its centre stays at coinBase.
      if (p4Dress && lookMode !== "diorama") inst("coin", l.coinCol * COL_W, coinBase - COIN_DIAMETER / 2 + Math.sin(tr * 3 + r) * 0.035, laneZ(r), 1, 1, 1, "#ffffff", tr * 1.6);
      else inst("coin", l.coinCol * COL_W, coinBase + Math.sin(tr * 3 + r) * 0.035, laneZ(r), COIN_DIAMETER, COIN_THICK, COIN_DIAMETER, COLORS.coin, tr * 1.6, Math.PI / 2);
      shade(l.coinCol * COL_W, surfaceTopY(l), laneZ(r), 0.32, 0.22, coinBase + COIN_DIAMETER / 2 - surfaceTopY(l));
    }
  }

  // player — grounded on the exact top surface of the current lane or platform
  const px = pose.x, pz = pose.z;
  if (!st.dead) shade(px, surfaceTopY(lane(st.playerRow)), pz, 0.62, 0.55, 0.95);
  const squash = st.dead && (st.dead.kind === "squashed" || st.dead.kind === "flattened") ? 0.18 : 1;
  try {
    const h = nodes.require("player");
    h.setPosition(px, pose.y, pz);
    if (lookMode !== "original") {
      // CH47-12 / WP-14: anticipation squash, take-off stretch and landing squash, 70 ms damped yaw turns.
      if (pose.hopping && !wasHopping) landedAt = -1;
      if (!pose.hopping && wasHopping) landedAt = tr;
      wasHopping = pose.hopping;
      const [sxz, sy] = hopScale(st.hop.t, pose.hopping, landedAt < 0 ? -1 : tr - landedAt, reducedMotion);
      if (st.dead && squash !== 1) h.setScale([1.25, squash, 1.25]);
      else h.setScale([sxz, sy, sxz]);
      drawnYaw = turnToward(drawnYaw, HOP_YAW[st.hop.dir] ?? Math.PI, frameDt);
      h.setRotation(0, drawnYaw, 0);
    } else {
      if (pose.hopping) h.setScale(1.0 + Math.sin(Math.PI * Math.max(0, Math.min(1, st.hop.t))) * 0.25);
      else h.setScale(squash);
      if (st.hop.dir === "left") h.setRotation(0, -Math.PI / 2, 0);
      else if (st.hop.dir === "right") h.setRotation(0, Math.PI / 2, 0);
      else if (st.hop.dir === "back") h.setRotation(0, 0, 0);
      else h.setRotation(0, Math.PI, 0);
    }
    const targetClip = pose.hopping ? "Regular_Jump" : "Idle";
    if (targetClip !== activePlayerClip) {
      activePlayerClip = targetClip;
      // CH47-12: one jump clip per hop (speed fits the clip to HOP_DUR, played once).
      h.setAnimation(lookMode !== "original" && targetClip === "Regular_Jump"
        ? { clip: targetClip, loop: false, speed: 2.2 }
        : { clip: targetClip, loop: true, speed: targetClip === "Regular_Jump" ? 2.2 : 1.0 });
    }
  } catch (e) { nodeOk = false; nodeErr = `player: ${String(e).slice(0, 120)}`; }

  // Spectator critters cheer from the meadow banks beyond the lane strips (CH-12): meadow rows only, on the floor.
  const baseRow = Math.floor(st.playerRow / 12) * 12;
  for (let idx = 0; idx < SPECTATOR_CRITTERS.length; idx++) {
    const sp = nodes.get(`spectator-${idx}`);
    if (!sp) continue;
    let specRow = -1;
    for (let r = baseRow + idx * 2; r < baseRow + idx * 2 + 4; r++) if (lane(r).type === "meadow") { specRow = r; break; }
    if (specRow < 0) { sp.setVisible(false); continue; }
    sp.setVisible(true);
    const side = idx % 2 === 0 ? -1 : 1;
    const sx = side * (SCENERY_X + 0.6 + (idx % 3) * 1.15);
    const cheerBob = reducedMotion ? 0 : Math.abs(Math.sin(tr * 5.2 + idx * 1.1)) * 0.22;
    sp.setPosition(sx, FLOOR_Y + cheerBob, laneZ(specRow));
    sp.setRotation(0, side < 0 ? Math.PI * 0.42 : -Math.PI * 0.42, 0);
  }

  // Keep the two-plane sky, sun, and landscape under the course anchored to
  // the run so the horizon never falls out of frame.
  try {
    const sky = nodes.get("skirt");
    if (sky) sky.setPosition(px * 0.4, 22, pz - 56);
    const horizon = nodes.get("skirt-horizon");
    if (horizon) horizon.setPosition(px * 0.4, 4, pz - 54);
    const sun = nodes.get("sun");
    if (sun) sun.setPosition(px * 0.3 - 17, 6.4, pz - 46);
    const floor = nodes.get("world-floor");
    if (floor) floor.setPosition(px * 0.3, FLOOR_Y, pz - 20);
    const amb = nodes.get("ambient");
    if (amb) amb.setPosition(px, 2.2, pz - 5);
  } catch { /* no-op */ }

  // hawk
  const warn = st.mode === "run" ? Math.min(1, Math.max(0, st.idle - 1.4) / (HAWK_KILL - 1.4)) : 0;
  try {
    const hk = nodes.require("hawk");
    if (warn > 0 && !st.dead) {
      const hy = 9 - warn * 7.4;
      hk.setVisible(true);
      hk.setPosition(px, Math.max(1.1, hy), pz - 2.5 + warn * 1.5);
      hk.setRotation(Math.PI * 0.2 * warn, 0, Math.sin(tr * 7) * 0.12);
    } else if (st.dead?.kind === "snatched") {
      const since = st.time - st.deadAt;
      hk.setVisible(true);
      hk.setPosition(px + Math.sin(since * 2) * 0.4, 1.2 + since * 3.2, pz - 2 - since * 4);
      hk.setRotation(-0.3, 0, 0);
      nodes.require("player").setPosition(px, 1.0 + since * 3.2, pz - 2 - since * 4);
    } else hk.setVisible(false);
    // rescue pod marker
    const pod = nodes.require("pod");
    let podSet = false;
    for (let r = lo; r <= hi; r++) {
      const l = lane(r);
      if (l.hasPod && !st.podTaken.has(r)) {
        pod.setVisible(true); pod.setPosition(l.podCol * COL_W, surfaceTopY(l), laneZ(r));
        pod.setRotation(0, tr * 0.8, 0);
        podSet = true; break;
      }
    }
    if (!podSet) pod.setVisible(false);
  } catch (e) { nodeOk = false; nodeErr = `hawk/pod: ${String(e).slice(0, 120)}`; }

  // camera — tighter, lower chase rig: the critter reads larger, lane edges
  // frame the shot, and the horizon replaces the empty foreground.
  syncFlipbooks(frameDt);
  if (lookMode === "diorama") {
    syncCombo();
    syncDioramaCamera(px, pz, pose.y, warn);
    syncSunKey();
    syncLamps(appliedLook);
  } else {
    if (lookMode === "vivid") {
      syncCombo();
      syncLamps(appliedLook);
    }
    const camZ = pz + CAM.back, camY = CAM.y + st.playerRow * 0.0012;
    const sx = reducedMotion ? 0 : camImpactOffset[0];
    const sy = reducedMotion ? 0 : camImpactOffset[1];
    const sz = reducedMotion ? 0 : camImpactOffset[2];
    const kickFov = reducedMotion ? 0 : camImpactFov;
    app.camera?.setPose({
      position: [px * CAM.followX + sx, camY + sy, camZ + sz],
      target: [px * CAM.targetX + sx * 0.45, CAM.targetY + sy * 0.35, pz - CAM.ahead],
      fov: CAM.fov + (reducedMotion ? 0 : warn * 6) + kickFov
    });
  }
  if (warn > 0.5) app.output?.setOutputOverlay({ vignette: [0.02, 0.02, 0.06, warn * 0.85] });
  else app.output?.setOutputOverlay(st.mode === "dead" || st.paused ? { fade: [0, 0, 0, 0.25] } : {});

  // submit pools — hide stale slots beyond the live count, then push specs. Static pools only when their key changed;
  // an empty pool whose slots are already hidden is skipped (CH-E3).
  for (const k of rebuildStatic ? (Object.keys(CAP) as (keyof typeof CAP)[]) : DYNAMIC_POOLS) {
    const p = P(k);
    if (p.n === 0 && p.dirty === 0 && emptySubmitted.has(k)) continue;
    for (let i = p.n; i < p.dirty; i++) {
      const s = p.specs[i];
      s.position[0] = HIDDEN.position[0]; s.position[1] = HIDDEN.position[1]; s.position[2] = HIDDEN.position[2];
      s.rotation[1] = 0; s.rotation[2] = 0;
      s.scale[0] = HIDDEN.scale[0]; s.scale[1] = HIDDEN.scale[1]; s.scale[2] = HIDDEN.scale[2];
    }
    p.dirty = p.n;
    try {
      nodes.require(`pool-${k === "dressB" ? "dressb" : k}`)
        .setInstances(p.specs, p.cols);
      if (p.n === 0) emptySubmitted.add(k); else emptySubmitted.delete(k);
    } catch (e) { nodeOk = false; nodeErr = `pool-${k}: ${String(e).slice(0, 120)}`; }
  }
  if (rebuildStatic) staticKey = key;

}

/** CH47-07 / WP-14: one pool per ground surface in vivid and diorama looks; felt tiles slightly inset so bevels read. */
function paintDioramaGround(l: Lane, z: number): boolean {
  if (lookMode === "vivid") {
    const pal = THEMES[l.theme].palette;
    const S = THEME_LOOKS[l.theme]!.surfaces;
    switch (l.type) {
      case "meadow": inst("felt", 0, 0, z, STRIP_W, 0.24, LANE_D * 0.975, pal.meadow); return true;
      case "road": inst("asphalt", 0, 0, z, STRIP_W, 0.24, LANE_D, pal.road); return true;
      case "tram": inst("asphalt", 0, 0, z, STRIP_W, 0.24, LANE_D, S.gravel); return true;
      case "river": inst("water", 0, -0.08, z, STRIP_W, 0.16, LANE_D, pal.water); return true;
      case "rail": inst("gravel", 0, -0.02, z, STRIP_W, 0.2, LANE_D, pal.railbed); return true;
      case "lava": inst("lava", 0, -0.08, z, STRIP_W, 0.16, LANE_D, pal.lava); return true;
    }
    return false;
  }
  if (lookMode !== "diorama") return false;
  const S = THEME_LOOKS[l.theme]!.surfaces;
  switch (l.type) {
    case "meadow": inst("felt", 0, 0, z, STRIP_W, 0.24, LANE_D * 0.97, S.felt); return true;
    case "road": inst("asphalt", 0, 0, z, STRIP_W, 0.24, LANE_D, S.asphalt); return true;
    case "tram": inst("asphalt", 0, 0, z, STRIP_W, 0.24, LANE_D, S.gravel); return true;
    case "river": inst("water", 0, -0.08, z, STRIP_W, 0.16, LANE_D, S.water); return true;
    case "rail": inst("gravel", 0, -0.02, z, STRIP_W, 0.2, LANE_D, S.gravel); return true;
    case "lava": inst("lava", 0, -0.08, z, STRIP_W, 0.16, LANE_D, S.lava); return true;
  }
  return false;
}

function paintLane(l: Lane, r: number, tr: number, statics: boolean, playerX: number): void {
  const z = laneZ(r);
  if (statics && paintDioramaGround(l, z)) {
    // The surface pool drew the strip; the lane's own details follow (the switch below skips its ground line).
    paintLaneDetails(l, r, tr, statics, playerX, z);
    return;
  }
  paintLaneDetails(l, r, tr, statics, playerX, z, true);
}

function paintLaneDetails(l: Lane, r: number, tr: number, statics: boolean, playerX: number, z: number, withGround = false): void {
  const rich = lookMode !== "original";
  const S = THEME_LOOKS[l.theme]!.surfaces;
  const th = THEMES[l.theme];
  const pal = th.palette;
  switch (l.type) {
    case "meadow":
      if (statics && withGround) inst("ground", 0, 0, z, STRIP_W, 0.24, LANE_D, pal.meadow);
      break;
    case "road": {
      if (!statics) break;
      if (withGround) inst("ground", 0, 0, z, STRIP_W, 0.24, LANE_D, pal.road);
      // Crisp painted highway dashes + edge markings + crosswalk bars at meadow-to-road transitions (WP-14).
      for (let x = -16; x < 17; x += 4) inst("detail", x, 0.121, z, 1.48, 0.008, 0.095, rich ? S.dash : "#cfd6de");
      inst("detail", 0, 0.121, z - LANE_D * 0.44, STRIP_W, 0.008, 0.075, rich ? "#edf2f8" : pal.shoulder);
      inst("detail", 0, 0.121, z + LANE_D * 0.44, STRIP_W, 0.008, 0.075, rich ? "#edf2f8" : pal.shoulder);
      if (rich && r > 0 && lane(r - 1).type === "meadow" && r % 3 === 1) {
        for (let zb = -0.32; zb <= 0.34; zb += 0.16) {
          inst("detail", 0, 0.122, z + zb, 0.82, 0.008, 0.08, "#f4f7fc");
        }
      }
      break;
    }
    case "tram": {
      if (statics) {
        if (withGround) inst("ground", 0, 0, z, STRIP_W, 0.24, LANE_D, "#8b9099");
        inst("detail", 0, 0.122, z - 0.32, STRIP_W, 0.016, 0.08, "#3a3d44");
        inst("detail", 0, 0.122, z + 0.32, STRIP_W, 0.016, 0.08, "#3a3d44");
      }
      // Lit when a tram will reach the player's column within a second (CH-4).
      if (railWarning(l, tr, playerX)) inst("glow", 0, 0.128, z, STRIP_W, 0.016, 0.5, "#f2c94c");
      break;
    }
    case "river":
      if (!statics) break;
      // Water top is at y = 0.00 (-0.08 + 0.16 / 2); bank trim only against non-river neighbors
      if (withGround) inst("ground", 0, -0.08, z, STRIP_W, 0.16, LANE_D, pal.water);
      if (lane(r + 1).type !== "river") {
        inst("detail", 0, 0.04, z - LANE_D * 0.47, STRIP_W, 0.10, 0.06, pal.meadow);
      }
      if (r > 0 && lane(r - 1).type !== "river") {
        inst("detail", 0, 0.04, z + LANE_D * 0.47, STRIP_W, 0.10, 0.06, pal.meadow);
      }
      break;
    case "rail": {
      if (statics) {
        if (withGround) inst("ground", 0, -0.02, z, STRIP_W, 0.2, LANE_D, pal.railbed);
        // Brushed steel rails & timber sleepers
        inst("detail", 0, 0.115, z - 0.3, STRIP_W, 0.03, 0.07, rich ? S.rail : "#2c2c30");
        inst("detail", 0, 0.115, z + 0.3, STRIP_W, 0.03, 0.07, rich ? S.rail : "#2c2c30");
        for (let x = -16; x < 17; x += 1.6) inst("detail", x, 0.09, z, 0.24, 0.03, 0.88, "#241f1a");
        // Crossing posts & crossbuck sign housing at both signals (CH-E5).
        inst("trunk", -8, 0.44, z - LANE_D * 0.42, 0.11, 0.88, 0.11, "#3a3d44");
        inst("trunk", 8, 0.44, z + LANE_D * 0.42, 0.11, 0.88, 0.11, "#3a3d44");
      }
      // Smooth hinged crossing arms & dual alternating crossbuck strobes (CH-4, CH-E5, WP-14).
      const cyc = railCycle(l);
      const u = ((tr + l.phase) % cyc.period + cyc.period) % cyc.period;
      const activeEnd = cyc.warn + cyc.cross;
      const lit = u < activeEnd;
      let gate = 0;
      if (u < 0.34) {
        const t0 = Math.max(0, Math.min(1, u / 0.34));
        gate = t0 * t0 * (3 - 2 * t0);
      } else if (u <= activeEnd) {
        gate = 1;
      } else if (u < activeEnd + 0.36) {
        const t1 = Math.max(0, Math.min(1, (u - activeEnd) / 0.36));
        gate = 1 - t1 * t1 * (3 - 2 * t1);
      }
      const ang = (1 - gate) * 1.43; // 82 deg upright -> 0 deg lowered horizontal
      const blink = Math.sin(tr * 16) > 0;
      for (const side of [-1, 1] as const) {
        const sz = z + side * LANE_D * 0.42;
        if (lit) {
          inst("glow", side * 8 - 0.12, 0.88, sz, 0.17, 0.17, 0.17, blink ? "#ff2e4c" : "#44101c");
          inst("glow", side * 8 + 0.12, 0.88, sz, 0.17, 0.17, 0.17, !blink ? "#ff2e4c" : "#44101c");
        } else {
          inst("glow", side * 8 - 0.12, 0.88, sz, 0.16, 0.16, 0.16, "#361018");
          inst("glow", side * 8 + 0.12, 0.88, sz, 0.16, 0.16, 0.16, "#361018");
        }
        const rz = -side * ang;
        const cosA = Math.cos(ang);
        const sinA = Math.sin(ang);
        for (let seg = 0; seg < 4; seg++) {
          const d = 0.28 + seg * 0.48;
          const ax = side * 8 - side * d * cosA;
          const ay = 0.64 + d * sinA;
          inst("glow", ax, ay, sz, 0.48, 0.075, 0.075, seg % 2 === 0 ? "#ff3355" : "#f4f1ea", 0, rz);
        }
      }
      break;
    }
    case "lava":
      if (statics) {
        if (withGround) inst("ground", 0, -0.08, z, STRIP_W, 0.16, LANE_D, pal.lava);
        for (let x = -15; x < 16; x += 3.1) inst("detail", x, 0.01, z + (((r * 7 + x) % 3) - 1) * 0.3, 1.3, 0.06, 0.36, pal.crust);
      }
      inst("glow", 0, 0.01, z - LANE_D * 0.46, STRIP_W, 0.03, 0.08, "#ff6a2a");
      inst("glow", 0, 0.01, z + LANE_D * 0.46, STRIP_W, 0.03, 0.08, "#ff6a2a");
      break;
  }
}

function paintHorizonRidge(hi: number): void {
  if (lookMode !== "vivid") return;
  const th = THEMES[st.themeIdx];
  const urban = th.dress === "city" || th.dress === "neon";
  const volcanic = th.dress === "basalt";
  const baseZ = laneZ(hi + 8);
  const b = FLOOR_Y;
  for (let i = 0; i < 18; i++) {
    const x = -44 + i * 5.2 + ((i % 3) - 1) * 0.8;
    const z = baseZ - (i % 3) * 3.4;
    const wave = Math.abs(Math.sin(i * 1.73 + st.themeIdx * 0.9));
    if (urban) {
      const h = 3.8 + wave * 6.4;
      const w = 3.2 + (i % 2) * 1.4;
      const col = th.dress === "neon"
        ? (i % 2 === 0 ? "#1f2544" : "#2c2f58")
        : (i % 2 === 0 ? "#4a5b78" : "#5b6d8c");
      inst("horizon", x, b + h * 0.5, z, w, h, 2.8, col);
    } else if (volcanic) {
      const h = 3.2 + wave * 5.6;
      inst("horizon", x, b + h * 0.42, z, 5.6, h, 4.4, i % 2 === 0 ? "#2e2226" : "#3d2b2e", i * 0.3, 0.22);
    } else {
      const h = 2.4 + wave * 3.8;
      const col = th.id === "crittercore"
        ? (i % 2 === 0 ? "#7a5ca8" : "#936ec0")
        : (i % 2 === 0 ? "#5a9c6e" : "#4b8864");
      inst("horizon", x, b + h * 0.35, z, 7.6, h, 5.4, col, i * 0.2);
    }
  }
}

function paintDressing(lo: number, hi: number): void {
  const th = THEMES[st.themeIdx];
  const pal = th.palette;
  // Fence, tufts and signs stand just beyond the playfield, and only on meadow rows, so no prop sits in a traffic
  // lane, river or lava strip (CH-12). Trees and buildings stand beyond the drawn strip on the world floor.
  const fenceX = FIELD_HALF + 2.1;
  const softTheme = th.dress === "trees" || th.dress === "reeds" || th.dress === "candy";
  const b = FLOOR_Y;
  if (lookMode === "vivid") paintHorizonRidge(hi);
  if (lookMode !== "original") paintDioramaKit(lo, hi);
  for (let r = lo; r <= hi; r++) {
    const z = laneZ(r);
    const meadow = lane(r).type === "meadow";
    const rndA = Math.abs(Math.sin(r * 12.9898 + st.seed * 0.37)) % 1;
    const rndB = Math.abs(Math.sin(r * 78.233 + st.seed * 0.11)) % 1;
    const side = rndA < 0.5 ? -1 : 1;
    if (lookMode !== "original") {
      paintLaneFurniture(r, z);
      if (meadow) paintMeadowEdge(r, z, fenceX, softTheme, side, rndA, rndB);
      continue;
    }
    const off = SCENERY_X + 0.4 + rndB * 3.2;
    if (softTheme) {
      if (rndA < 0.55) {
        inst("trunk", side * off, b + 0.7, z, 0.22, 1.4, 0.22, pal.dressingB);
        inst("canopy", side * off, b + 1.8, z, 1.1, 0.9, 1.1, pal.dressingA);
        inst("trunk", -side * (off + 2.4), b + 0.7, z, 0.22, 1.4, 0.22, pal.dressingB);
        inst("canopy", -side * (off + 2.4), b + 1.8, z, 1.1, 0.9, 1.1, pal.dressingA);
      }
    } else if (th.dress === "city" || th.dress === "neon") {
      const h = 2.2 + rndB * 3.4;
      inst("dressB", side * (off + 2), b + h / 2, z, 1.8, h, 1.8, pal.dressingB);
      if (th.dress === "neon" && rndB < 0.4) inst("glowS", side * (off + 2) - 0.95, b + h / 2, z, 0.06, h * 0.5, 0.4, pal.accent);
      inst("dressB", -side * (off + 4.5), b + (h * 0.7) / 2, z, 2.2, h * 0.7, 2.2, pal.dressingA);
    } else if (th.dress === "basalt") {
      inst("dressB", side * off, b + 0.5 + rndB, z, 0.9, 1 + rndB * 2, 0.9, pal.dressingB);
      if (rndA < 0.3) inst("glowS", -side * (off + 1.5), b + 0.3, z, 0.3, 0.3, 0.3, "#ff5a1f");
    }
    if (!meadow) continue;
    paintMeadowEdge(r, z, fenceX, softTheme, side, rndA, rndB);
  }
}

/**
 * CH47-15: the verge kit at 3x the 4.6 density, nothing within |x| < KIT_MIN_X, distance LOD (outer slots drop
 * beyond KIT_LOD_ROWS), canopies sway (pool wind). Primitive stand-ins in today's pools until the WP-36 kits land.
 */
function paintDioramaKit(lo: number, hi: number): void {
  const th = THEMES[st.themeIdx];
  const pal = th.palette;
  const L = THEME_LOOKS[st.themeIdx]!;
  const b = FLOOR_Y;
  for (let r = lo; r <= hi; r++) {
    const z0 = laneZ(r);
    const dist = Math.abs(r - st.playerRow);
    const slots = kitSlots(r, st.seed);
    for (let i = 0; i < slots.length; i++) {
      if (!kitLod(i, dist)) continue;
      const k = slots[i]!;
      const sc = k.scale;
      const z = k.z;
      switch (th.dress) {
        case "trees":
        case "candy":
          inst("trunk", k.x, b + 0.55 * sc, z, 0.18 * sc, 1.1 * sc, 0.18 * sc, pal.dressingB);
          inst("canopy", k.x, b + (1.45 + k.variant * 0.15) * sc, z, (0.9 + k.variant * 0.2) * sc, 0.8 * sc, (0.9 + k.variant * 0.2) * sc, k.variant === 1 ? pal.dressingA : L.surfaces.felt, k.yaw);
          break;
        case "reeds":
          inst("trunk", k.x, b + 0.4 * sc, z, 0.06, 0.8 * sc, 0.06, pal.dressingA);
          inst("trunk", k.x + 0.2, b + 0.5 * sc, z + 0.15, 0.06, 1.0 * sc, 0.06, pal.dressingA);
          if (k.variant === 0) inst("canopy", k.x, b + 0.35 * sc, z, 0.9 * sc, 0.5 * sc, 0.9 * sc, L.surfaces.felt, k.yaw);
          break;
        case "city":
        case "neon": {
          const h = (1.6 + k.variant * 1.2) * sc;
          inst("dressB", k.x, b + h / 2, z, 1.5 * sc, h, 1.5 * sc, k.variant === 2 ? pal.dressingA : pal.dressingB, k.yaw);
          if (th.dress === "neon" && k.variant === 1) inst("glowS", k.x - 0.78 * sc, b + h / 2, z, 0.05, h * 0.5, 0.35, pal.accent);
          break;
        }
        case "basalt":
          inst("dressB", k.x, b + 0.5 * sc, z, 0.8 * sc, (1 + k.variant * 0.7) * sc, 0.8 * sc, pal.dressingB, k.yaw);
          if (k.variant === 0 && i % 2 === 0) inst("glowS", k.x + 0.6, b + 0.15, z, 0.25, 0.25, 0.25, "#ff5a1f");
          break;
      }
    }
    void z0;
  }
  // CH47-02: lamp posts under the pooled lamp points (lamp model: WP-36).
  if (L.lamps.count > 0) {
    for (const slot of lampSlots(Math.max(0, st.playerRow - 2), Math.min(L.lamps.count, lampCount))) {
      inst("trunk", slot.x, slot.y / 2 - 0.08, slot.z, 0.08, slot.y, 0.08, "#2a2c34");
      inst("glowS", slot.x, slot.y + 0.05, slot.z, 0.26, 0.16, 0.26, L.lamps.colors[0]!);
    }
  }
}

/** CH47-16 / WP-14: lane furniture: tram poles, river reeds, lava crust, road kerbs + reflective bollards. */
function paintLaneFurniture(r: number, z: number): void {
  const l = lane(r);
  const S = THEME_LOOKS[l.theme]!.surfaces;
  const edge = STRIP_W / 2 - 0.25;
  const bollardX = FIELD_HALF + 1.45;
  switch (l.type) {
    case "tram":
      if (r % 2 === 0) for (const sd of [-1, 1]) inst("trunk", sd * edge, 0.9, z, 0.08, 1.8, 0.08, "#6a6e78");
      break;
    case "river":
      for (const sd of [-1, 1]) {
        inst("trunk", sd * (edge - 0.3), 0.22, z - 0.2, 0.05, 0.5, 0.05, "#5f7a3a");
        inst("trunk", sd * (edge - 0.1), 0.26, z + 0.15, 0.05, 0.6, 0.05, "#6f8a44");
      }
      break;
    case "lava":
      for (const sd of [-1, 1]) inst("detail", sd * edge, 0.04, z, 0.5, 0.1, LANE_D * 0.9, "#2a1c18");
      break;
    case "road":
      for (const sd of [-1, 1]) {
        inst("detail", sd * edge, 0.15, z, 0.3, 0.08, LANE_D, S.gravel);
        if (r % 2 === 0) {
          inst("trunk", sd * bollardX, 0.28, z, 0.13, 0.44, 0.13, "#f1f4f9");
          inst("detail", sd * bollardX, 0.43, z, 0.145, 0.08, 0.145, "#ff9f1c");
        }
      }
      break;
  }
}

/** Fence, tufts and signs on a meadow row (both looks). */
function paintMeadowEdge(r: number, z: number, fenceX: number, softTheme: boolean, side: number, rndA: number, rndB: number): void {
  const pal = THEMES[st.themeIdx].palette;
  {
    // Low split-rail fence just outside the traffic envelope on meadow rows.
    if (r % 2 === 0) {
      for (const sdd of [-1, 1] as const) {
        inst("trunk", sdd * fenceX, 0.35, z, 0.12, 0.7, 0.12, pal.dressingB);
        inst("dressB", sdd * fenceX, 0.54, z - LANE_D * 0.55, 0.07, 0.07, LANE_D * 1.15, pal.shoulder);
      }
    }
    // Grass tufts / low shrubs soften the fence line and the empty verge.
    if (rndA < 0.8) {
      const tw = 0.34 + rndB * 0.24;
      inst("canopy", (r % 2 === 0 ? -1 : 1) * (fenceX + 0.9 + rndB * 0.8), 0.14 + tw * 0.4, z, tw, tw * 0.6, tw, softTheme ? pal.meadow : pal.dressingA);
    }
    // Occasional roadside sign gives midground scale and a pop of accent.
    if (r % 12 === 5) {
      inst("trunk", side * (fenceX + 0.55), 0.62, z, 0.1, 1.24, 0.1, pal.dressingB);
      inst("dressB", side * (fenceX + 0.55), 1.28, z, 1.35, 0.55, 0.08, pal.accent);
    }
  }
}

/** Player swap (Player Studio). Rebuilds the player node in place. */
export function swapCritter(c: CritterDef): void {
  st.critter = c;
  st.profile.selected = c.id;
  saveProfile(st.profile);
  if (!app) return;
  try {
    const n0 = app.nodes as unknown as { require(id:string): { setPosition(x:number,y:number,z:number):void }; remove(id: string): void; add(n: never): void };
    const pz = laneZ(st.playerRow);
    const py = playerBaseY(lane(st.playerRow));
    n0.remove("player");
    n0.add(
      model(assets[c.asset], { name: "player", targetHeight: 1.05, castShadow: true, ...critterMaterial(c.asset, lookMode !== "original") })
        .position(st.playerCol * COL_W, py, pz).rotate(0, Math.PI, 0)
        .animate({ clip: "Idle", loop: true })
        .runtime(game.runtimeNode("player"))
        .toJSON() as never
    );
  } catch { nodeOk = false; }
}

export function evidenceExtra(): Record<string, unknown> {
  let movers = 0;
  const lo = Math.max(0, st.playerRow - ROW_BEHIND), hi = st.playerRow + ROW_AHEAD;
  for (let r = lo; r <= hi; r++) movers += laneMovers(lane(r), st.time, XS);
  return {
    state: { mode: st.mode, paused: st.paused, runKind: st.runKind, score: st.score, coins: st.coins, bank: st.profile.coins, best: st.profile.best, row: st.playerRow, bestRow: st.row, nearMisses: st.nearMisses, critter: st.critter.id, theme: THEMES[st.themeIdx].label, lookTheme: THEMES[appliedLook].label, dead: st.dead?.kind ?? null, time: +st.time.toFixed(2) },
    movers,
    lanesBuffered: st.lanes.size,
    events: st.events.slice(-6),
    unlocked: st.profile.unlocked.length + "/" + CRITTERS.length,
    nodesOk: nodeOk,
    nodeErr
  };
}
