/**
 * Aura Hoops 3D — flagship 3D streetball route on the Aura3D engine.
 *
 * LOOK BRIEF
 *   Golden-hour asphalt drama for the world courts (hard key, long shadows,
 *   saturated paint, living crowd edge) and a clean sci-fi dome contrast for
 *   Orbit Court with `gravityPlanetEarth` hanging in the sky. Per-venue look
 *   presets swap through `app.setScene` — every court rebuilds the scene graph
 *   with its own look + dressing while the match state survives.
 *
 * ARCHITECTURE
 *   Everything lives in this file: the state machine (menu → check-ball →
 *   live → score → game-over → rematch), a route-local ball sim (analytic
 *   launch solve + rim/backboard/floor contacts + swish detection), 3v3
 *   teammate/CPU AI, the shot meter + Jam Meter + dunk packages, Street Tour
 *   bracket, Player Studio fit colors, Handles Lab cone gates, Dunk Lab, a
 *   camera director, DOM HUD wired to index.html ids every frame, rooftop-
 *   buckets SFX through createGameAudio, juice/FX layers, and a rich
 *   `__AURA3D_GAME_EVIDENCE__` channel.
 */
import {
  camera,
  createAuraApp,
  createGameAudio,
  decals,
  effects,
  game,
  instances,
  lights,
  looks,
  material,
  model,
  primitives,
  scene,
  type AuraRuntimeNodeHandle
} from "@aura3d/engine";
import {
  createJuice,
  createOverlayDriver,
  createRumbleDriver,
  createTweenEngine,
  createFxParticlePass,
  mountTouchControls,
} from "@aura3d/engine/game";
import { assets } from "./aura-assets.route";

type Vec3 = [number, number, number];
type AnyHandle = AuraRuntimeNodeHandle | undefined;

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (t: number) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const dist2d = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
const angTo = (ax: number, az: number, bx: number, bz: number) => Math.atan2(bx - ax, bz - az);

type Quat = { x: number; y: number; z: number; w: number };
const unit = (v: Vec3): Vec3 => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};
const qMul = (a: Quat, b: Quat): Quat => ({
  x: a.w * b.x + a.x * b.w + a.y * b.z - a.z * b.y,
  y: a.w * b.y - a.x * b.z + a.y * b.w + a.z * b.x,
  z: a.w * b.z + a.x * b.y - a.y * b.x + a.z * b.w,
  w: a.w * b.w - a.x * b.x - a.y * b.y - a.z * b.z
});
const qConj = (q: Quat): Quat => ({ x: -q.x, y: -q.y, z: -q.z, w: q.w });
const qX = (angle: number): Quat => ({ x: Math.sin(angle / 2), y: 0, z: 0, w: Math.cos(angle / 2) });
const qFromTo = (from: Vec3, to: Vec3): Quat => {
  const d = from[0] * to[0] + from[1] * to[1] + from[2] * to[2];
  if (d < -0.999999) {
    const axis: Vec3 = Math.abs(from[0]) < 0.9 ? [0, -from[2], from[1]] : [-from[1], from[0], 0];
    const u = unit(axis);
    return { x: u[0], y: u[1], z: u[2], w: 0 };
  }
  const cx = from[1] * to[2] - from[2] * to[1];
  const cy = from[2] * to[0] - from[0] * to[2];
  const cz = from[0] * to[1] - from[1] * to[0];
  const w = 1 + d;
  const l = Math.hypot(cx, cy, cz, w) || 1;
  return { x: cx / l, y: cy / l, z: cz / l, w: w / l };
};
const qFromMat4 = (m: ArrayLike<number>): Quat => {
  const m11 = m[0]!, m12 = m[4]!, m13 = m[8]!;
  const m21 = m[1]!, m22 = m[5]!, m23 = m[9]!;
  const m31 = m[2]!, m32 = m[6]!, m33 = m[10]!;
  const trace = m11 + m22 + m33;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return { x: (m32 - m23) * s, y: (m13 - m31) * s, z: (m21 - m12) * s, w: 0.25 / s };
  }
  if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
    return { x: 0.25 * s, y: (m12 + m21) / s, z: (m13 + m31) / s, w: (m32 - m23) / s };
  }
  if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
    return { x: (m12 + m21) / s, y: 0.25 * s, z: (m23 + m32) / s, w: (m13 - m31) / s };
  }
  const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
  return { x: (m13 + m31) / s, y: (m23 + m32) / s, z: 0.25 * s, w: (m21 - m12) / s };
};
const solveElbow = (shoulder: Vec3, palm: Vec3, l1: number, l2: number, pole: Vec3 = [-1, 0, -0.2]): Vec3 => {
  const raw = Math.hypot(palm[0] - shoulder[0], palm[1] - shoulder[1], palm[2] - shoulder[2]) || 1;
  const dist = clamp(raw, 1e-4, l1 + l2 - 1e-4);
  const ux = (palm[0] - shoulder[0]) / raw;
  const uy = (palm[1] - shoulder[1]) / raw;
  const uz = (palm[2] - shoulder[2]) / raw;
  const a = (l1 * l1 - l2 * l2 + dist * dist) / (2 * dist);
  const h = Math.sqrt(Math.max(0, l1 * l1 - a * a));
  // Elbow pole points outward and slightly back so the bend stays clear of the ribs.
  let px = pole[0], py = pole[1], pz = pole[2];
  const pd = px * ux + py * uy + pz * uz;
  px -= ux * pd;
  py -= uy * pd;
  pz -= uz * pd;
  const pl = Math.hypot(px, py, pz) || 1;
  return [
    shoulder[0] + ux * a + (px / pl) * h,
    shoulder[1] + uy * a + (py / pl) * h,
    shoulder[2] + uz * a + (pz / pl) * h
  ];
};

/** Deterministic 32-bit LCG — all gameplay randomness flows through this. */
function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}
const rng = makeRng(0xa3d5);

/* ------------------------------------------------------------------ *
 *  Court geometry — half-court, rim at origin attacking +Z             *
 *  (adopted from the retired rooftop-buckets solver layout)            *
 * ------------------------------------------------------------------ */
const RIM: Vec3 = [0, 3.05, 0];
const RIM_R = 0.255; // rim ring + pipe
const BOARD_Z = -0.35;
const BOARD_HALF_W = 0.9;
const BOARD_Y0 = 2.82;
const BOARD_Y1 = 3.9;
const BALL_R = 0.13;
const ARC_R = 6.75; // street "two" line
const CHECK_SPOT: Vec3 = [0, 0, 8.6];
const COURT_X = 7.6;
const COURT_Z0 = -2.2;
const COURT_Z1 = 10.6;
const PLAYER_SPEED = 4.6;
const SPRINT_SPEED = 6.9;
const DUNK_RANGE = 2.4;
const GRAVITY = -10.4; // snappier NBA-Jam arc than textbook 9.81
const HIDDEN = 0.0001;
const CROWD_WAVERS = 0;
const TRAIL_COUNT = 14;
const CONE_COUNT = 10;

/* ------------------------------------------------------------------ *
 *  Venues — six world courts                                           *
 * ------------------------------------------------------------------ */
type VenueId = "rucker" | "venice" | "athens" | "manila" | "shanghai" | "orbit";
type LookId = "outdoor-day" | "golden-hour" | "overcast" | "night-city" | "polar-night" | "alpine-snow" | "interior-warm" | "interior-industrial" | "product-studio" | "neon-arcade";

interface VenueSpec {
  readonly id: VenueId;
  readonly label: string;
  readonly sub: string;
  readonly look: LookId;
  readonly lookLabel: string;
  readonly bg: string;
  readonly floor: string;
  readonly paint: string;
  readonly line: string;
  readonly apron: string;
  readonly accent: string;
  readonly crowdDensity: number; // 0..1
  readonly night: boolean;
  readonly orbit: boolean;
  readonly covered: boolean;
  readonly glbVenue: boolean; // use rooftopCourt/rooftopVenueV2 shell
}

const VENUES: Record<VenueId, VenueSpec> = {
  rucker: {
    id: "rucker", label: "RUCKER PARK · HARLEM", sub: "GOLDEN HOUR LOOK",
    look: "golden-hour", lookLabel: "GOLDEN HOUR LOOK", bg: "#c98a5a",
    floor: "#2f3237", paint: "#b3541e", line: "#f2ead6", apron: "#22252b",
    accent: "#ff7a1a", crowdDensity: 1, night: false, orbit: false, covered: false, glbVenue: false
  },
  venice: {
    id: "venice", label: "VENICE BEACH · LA", sub: "SUNSET LOOK",
    look: "golden-hour", lookLabel: "SUNSET LOOK", bg: "#c98a5a",
    floor: "#3b6f7e", paint: "#e8e0c8", line: "#fdf6e3", apron: "#c9ad72",
    accent: "#ff9a3d", crowdDensity: 0.55, night: false, orbit: false, covered: false, glbVenue: false
  },
  athens: {
    id: "athens", label: "ATHENS ROOFTOP", sub: "OUTDOOR DAY LOOK",
    look: "outdoor-day", lookLabel: "OUTDOOR DAY LOOK", bg: "#9db8cf",
    floor: "#3a4048", paint: "#2f5f9e", line: "#f5f0e0", apron: "#2c313a",
    accent: "#39d7ff", crowdDensity: 0.8, night: false, orbit: false, covered: false, glbVenue: true
  },
  manila: {
    id: "manila", label: "MANILA COVERED", sub: "INTERIOR WARM LOOK",
    look: "interior-warm", lookLabel: "INTERIOR WARM LOOK", bg: "#1c1712",
    floor: "#5a4a34", paint: "#8a3b2a", line: "#f5ecd4", apron: "#3c332a",
    accent: "#ffd257", crowdDensity: 0.85, night: true, orbit: false, covered: true, glbVenue: false
  },
  shanghai: {
    id: "shanghai", label: "SHANGHAI RIVERSIDE", sub: "NIGHT CITY LOOK",
    look: "night-city", lookLabel: "NIGHT CITY LOOK", bg: "#070a12",
    floor: "#1c2230", paint: "#1d5f8a", line: "#9fdcff", apron: "#11151f",
    accent: "#39d7ff", crowdDensity: 0.7, night: true, orbit: false, covered: false, glbVenue: false
  },
  orbit: {
    id: "orbit", label: "ORBIT COURT · LEO", sub: "NEON ARCADE LOOK",
    look: "neon-arcade", lookLabel: "NEON ARCADE LOOK", bg: "#0a0d18",
    floor: "#141a2e", paint: "#233a66", line: "#7dfcff", apron: "#0a0d1a",
    accent: "#7dfcff", crowdDensity: 0.5, night: true, orbit: true, covered: false, glbVenue: false
  }
};
const VENUE_ORDER: readonly VenueId[] = ["rucker", "venice", "athens", "manila", "shanghai", "orbit"];

/* ------------------------------------------------------------------ *
 *  Squads + difficulty                                                 *
 * ------------------------------------------------------------------ */
interface SquadSpec {
  readonly id: string;
  readonly name: string;
  readonly short: string;
  readonly color: string;
  readonly alt: string;
  readonly shoot: number; // 1..10
  readonly speed: number;
  readonly dunk: number;
  readonly defense: number;
}
const SQUADS: readonly SquadSpec[] = [
  { id: "flyers", name: "HARLEM FLYERS", short: "HFY", color: "#ff7a1a", alt: "#1a1206", shoot: 7, speed: 7, dunk: 7, defense: 6 },
  { id: "snipers", name: "VENICE SNIPERS", short: "VSN", color: "#ffd257", alt: "#20180a", shoot: 9, speed: 6, dunk: 5, defense: 5 },
  { id: "giants", name: "ATHENS GIANTS", short: "AGT", color: "#39d7ff", alt: "#06222b", shoot: 5, speed: 5, dunk: 9, defense: 8 },
  { id: "jets", name: "MANILA JETS", short: "MJT", color: "#66e37f", alt: "#0a220e", shoot: 6, speed: 9, dunk: 6, defense: 6 },
  { id: "neon", name: "SHANGHAI NEON", short: "SHN", color: "#e26bff", alt: "#220a2b", shoot: 7, speed: 8, dunk: 8, defense: 5 },
  { id: "walkers", name: "ORBIT WALKERS", short: "ORB", color: "#7dfcff", alt: "#06222b", shoot: 6, speed: 5, dunk: 8, defense: 9 },
  { id: "brakers", name: "BKLYN ANKLEBREAK", short: "BKB", color: "#ff3b5c", alt: "#2b0710", shoot: 6, speed: 8, dunk: 6, defense: 8 },
  { id: "monsoon", name: "MONSOON KINGS", short: "MON", color: "#f2f0e2", alt: "#23211a", shoot: 8, speed: 7, dunk: 7, defense: 7 }
];
const TOUR_FILLER = [
  "KYOTO RONIN", "LAGOS LIGHTNING", "BERLIN BLOCKS", "SEOUL SURGE", "PARIS PYLONS",
  "RIO RISERS", "TORONTO FROST", "MEXICO CITY MUX", "SYDNEY SWISH", "CAIRO CATS",
  "LONDON LOBSTERS", "DELHI DUNKS", "CHICAGO CRATE", "LA LATERALS", "MADRID MATADORS",
  "BANGKOK BOUNCE", "OSLO ORBIT", "DAKAR DRIVE", "HANOI HOPS", "LIMA LEGENDS",
  "DUBLIN DIME", "SPLIT STEP CLUB", "TAIPEI TORNADO", "QUEENS GUTTER"
];

type DiffId = "playground" | "pro" | "legend";
interface DiffSpec { readonly id: DiffId; readonly label: string; readonly cpuSpeed: number; readonly contest: number; readonly make: number; readonly steal: number; readonly react: number }
const DIFFS: Record<DiffId, DiffSpec> = {
  playground: { id: "playground", label: "PLAYGROUND", cpuSpeed: 0.82, contest: 0.55, make: -0.08, steal: 0.10, react: 0.55 },
  pro: { id: "pro", label: "PRO", cpuSpeed: 1.0, contest: 0.85, make: 0.0, steal: 0.08, react: 0.3 },
  legend: { id: "legend", label: "LEGEND", cpuSpeed: 1.14, contest: 1.15, make: 0.1, steal: 0.06, react: 0.16 }
};

/* ------------------------------------------------------------------ *
 *  DOM handles                                                        *
 * ------------------------------------------------------------------ */
const el = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;
const hudMode = el<HTMLElement>("h-mode");
const hudHomeName = el<HTMLElement>("h-home-name");
const hudHomeScore = el<HTMLElement>("h-home-score");
const hudHomePoss = el<HTMLElement>("h-home-poss");
const hudAwayName = el<HTMLElement>("h-away-name");
const hudAwayScore = el<HTMLElement>("h-away-score");
const hudAwayPoss = el<HTMLElement>("h-away-poss");
const hudTarget = el<HTMLElement>("h-target");
const hudClock = el<HTMLElement>("h-clock");
const hudVenue = el<HTMLElement>("h-venue");
const jamWrap = el<HTMLElement>("h-jam-wrap");
const jamFill = el<HTMLElement>("h-jam");
const jamReady = el<HTMLElement>("h-jam-ready");
const hudCourtChip = el<HTMLElement>("h-court-chip");
const hudLookChip = el<HTMLElement>("h-look-chip");
const hudTourChip = el<HTMLElement>("h-tour-chip");
const hudTourRound = el<HTMLElement>("h-tour-round");
const hudLabChip = el<HTMLElement>("h-lab-chip");
const hudLabLine = el<HTMLElement>("h-lab-line");
const hudTicker = el<HTMLElement>("h-ticker");
const msgBox = el<HTMLElement>("msg");
const msgText = el<HTMLElement>("msg-text");
const msgSub = el<HTMLElement>("msg-sub");
const bannerEl = el<HTMLElement>("banner");
const promptEl = el<HTMLElement>("prompt");
const shotMeter = el<HTMLElement>("shot-meter");
const smGreen = el<HTMLElement>("sm-green");
const smPerfect = el<HTMLElement>("sm-perfect");
const smNeedle = el<HTMLElement>("sm-needle");
const smLabel = el<HTMLElement>("sm-label");
const jamFlash = el<HTMLElement>("jam-flash");
const menuOverlay = el<HTMLElement>("menu-overlay");
const studioSection = el<HTMLElement>("studio-section");
const tourSection = el<HTMLElement>("tour-section");
const bracketEl = el<HTMLElement>("bracket");
const renderError = el<HTMLElement>("render-error");
const controlsHint = el<HTMLElement>("aura-controls-hint");

/* ------------------------------------------------------------------ *
 *  Game state                                                         *
 * ------------------------------------------------------------------ */
type ModeId = "quick" | "dunklab" | "handleslab" | "tour" | "blacktop" | "studio";
type Phase = "menu" | "check" | "live" | "shot" | "score" | "gameover";
type TeamId = "home" | "away";

interface AthleteState {
  readonly nodeId: string;
  readonly team: TeamId;
  readonly index: number;
  x: number;
  y: number; // vertical (jump) offset
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  vy: number;
  hasBall: boolean;
  controlled: boolean; // user-controlled (home team only)
  stumble: number; // ankle-break timer
  jumpT: number; // >0 while airborne on a jump
  blockArm: number; // contest reach timer
  pokeCd: number;
  screenT: number;
  cutT: number;
  aiT: number; // CPU decision timer
  aiPlan: "idle" | "drive" | "stand" | "pullup" | "post" | "orbit";
  tx: number; // AI target
  tz: number;
  clip: string;
  clipSince: number;
  wpPauseT: number;
  actionUntil: number;
  meterT: number; // CPU shot meter progress
  shooting: boolean;
  dunkT: number; // dunk animation progress
  dunkKind: string;
}

type BallState = "held" | "dribbleAir" | "flight" | "pass" | "loose" | "dunk" | "parked";
interface Ball {
  state: BallState;
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  holder: number; // athlete index or -1
  passTarget: number;
  dribbleT: number;
  flightT: number;
  hitRim: boolean;
  hitBoard: boolean;
  scored: boolean;
  swishOnly: boolean; // released from a perfect/green read
  shotValue: 1 | 2;
  shooter: number;
  blocked: boolean;
  looseT: number;
}

interface ConesState {
  active: boolean;
  order: number[];
  next: number;
  cleared: number;
  streak: number;
  score: number;
  best: number;
}

interface TourState {
  active: boolean;
  round: number; // 0..4
  eliminated: boolean;
  champion: boolean;
  opponents: number[]; // squad index per round played
}

interface StudioFit {
  jersey: number;
  kicks: number;
  skin: number;
  hair: number;
}
const STUDIO = {
  jersey: ["#ff7a1a", "#39d7ff", "#e26bff", "#66e37f", "#f2f0e2", "#ff3b5c"],
  kicks: ["#f2f0e2", "#22262e", "#ff7a1a", "#39d7ff", "#ffd257", "#e26bff"],
  skin: ["#c68a5a", "#8a5f42", "#6b4630", "#e8b08a", "#4a3222", "#d99b6c"],
  hair: ["#1a1410", "#3a2c20", "#5e503f", "#0d0d12", "#7a4a2a", "#c7c7cf"]
};

const initialParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();

const game_ = {
  mode: "quick" as ModeId,
  phase: "menu" as Phase,
  venue: "rucker" as VenueId,
  diff: "pro" as DiffId,
  autopilot: initialParams.get("autoplay") === "1" || initialParams.get("demo") === "1",
  target: 11,
  scoreHome: 0,
  scoreAway: 0,
  possession: "home" as TeamId,
  servingTeam: "home" as TeamId,
  mustClear: false,
  jam: 0.35,
  jamFull: false,
  shotMeter: { active: false, t: 0, g0: 0.66, g1: 0.78, perfect: 0.72, frames: 0, tapRelease: false },
  homeSquad: SQUADS[0]!,
  awaySquad: SQUADS[4]!,
  lab: { score: 0, streak: 0, best: 0, attempts: 0, style: 0 },
  cones: { active: false, order: [] as number[], next: 0, cleared: 0, streak: 0, score: 0, best: 0 } as ConesState,
  tour: { active: false, round: 0, eliminated: false, champion: false, opponents: [] as number[] } as TourState,
  fit: { jersey: 0, kicks: 1, skin: 0, hair: 0 } as StudioFit,
  pendingMode: "quick" as ModeId,
  time: 0,
  matchT: 0,
  checkT: 0,
  scoreT: 0,
  bannerT: 0,
  msgT: 0,
  promptT: 0,
  stealFlash: 0,
  celebration: "",
  lastShotLabel: ""
};

let athletes: AthleteState[] = [];
const ball: Ball = {
  state: "parked", x: 0, y: 1.0, z: 8.6, vx: 0, vy: 0, vz: 0,
  holder: -1, passTarget: -1, dribbleT: 0, flightT: 0,
  hitRim: false, hitBoard: false, scored: false, swishOnly: false,
  shotValue: 1, shooter: -1, blocked: false, looseT: 0
};
let dribbleHand: { x: number; y: number; z: number; socket: boolean; forearmValid: boolean; socketApi: boolean; raw?: [number, number, number]; point?: [number, number, number] } | null = null;

/* ------------------------------------------------------------------ *
 *  Event log → ticker                                                 *
 * ------------------------------------------------------------------ */
const eventLog = game.eventLog({ label: "aura-hoops-3d events", maxEvents: 48 });
function pushEvent(type: string, label: string, severity: "info" | "success" | "warning" = "info", value?: number): void {
  const rec = eventLog.push({ type, label, severity, value, time: game_.time, frame: framesRendered });
  if (hudTicker) {
    const item = document.createElement("span");
    item.className = `tick ${severity === "success" ? "tick-success" : severity === "warning" ? "tick-warning" : ""}`;
    item.textContent = rec.label;
    hudTicker.prepend(item);
    while (hudTicker.children.length > 4) hudTicker.lastElementChild?.remove();
    requestAnimationFrame(() => item.classList.add("show"));
    window.setTimeout(() => { item.classList.remove("show"); }, 3600);
    window.setTimeout(() => { item.remove(); }, 4200);
  }
}

/* ------------------------------------------------------------------ *
 *  Scene construction                                                 *
 * ------------------------------------------------------------------ */
function buildCourtSurfaces(v: VenueSpec): any[] {
  const nodes: any[] = [];
  const lineMat = material.pbr({ color: v.line, roughness: 0.6, emissive: v.night ? v.line : "#000000", emissiveIntensity: v.night ? 0.5 : 0.06 });
  const line = (name: string, w: number, l: number, x: number, z: number) =>
    primitives.box({ name, size: [w, 0.02, l], material: lineMat }).position(x, 0.012, z);

  nodes.push(
    // Apron + playable floor + painted key + center disc (size = XYZ scale on unit geometry)
    primitives.plane({ name: "court-apron", size: [36, 1, 30], material: material.pbr({ color: v.apron, roughness: 0.94 }) }).position(0, -0.02, 4).runtime(game.runtimeNode("court-apron")),
    primitives.plane({ name: "court-floor", size: [COURT_X * 2 + 0.2, 1, COURT_Z1 - COURT_Z0 + 0.2], material: material.pbr({ color: v.floor, roughness: 0.86 }) }).position(0, 0.0, (COURT_Z0 + COURT_Z1) / 2).runtime(game.runtimeNode("court-floor")),
    primitives.plane({ name: "court-key", size: [4.9, 1, 5.8], material: material.pbr({ color: v.paint, roughness: 0.8 }) }).position(0, 0.005, 1.05),
    primitives.cylinder({ name: "court-logo", size: [3.6, 0.015, 3.6], material: material.pbr({ color: v.paint, roughness: 0.75, opacity: 0.85 }) }).position(0, 0.006, 6.4)
  );

  // Lines: boundaries, key edges, free-throw circle, 2pt arc
  nodes.push(
    line("line-base", COURT_X * 2, 0.12, 0, COURT_Z0),
    line("line-far", COURT_X * 2, 0.12, 0, COURT_Z1),
    line("line-left", 0.12, COURT_Z1 - COURT_Z0, -COURT_X, (COURT_Z0 + COURT_Z1) / 2),
    line("line-right", 0.12, COURT_Z1 - COURT_Z0, COURT_X, (COURT_Z0 + COURT_Z1) / 2),
    line("line-key-l", 0.1, 5.8, -2.45, 1.05),
    line("line-key-r", 0.1, 5.8, 2.45, 1.05),
    line("line-ft", 4.9, 0.1, 0, 3.95)
  );
  // Free-throw circle + 2-point arc — painted dashes along the rings
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    nodes.push(
      primitives.box({ name: `ft-tick-${i}`, size: [0.09, 0.02, 0.55], material: lineMat })
        .position(Math.cos(a) * 1.8, 0.012, 3.95 + Math.sin(a) * 1.8)
        .rotate(0, -a, 0)
    );
  }
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2;
    nodes.push(
      primitives.box({ name: `arc-tick-${i}`, size: [0.1, 0.02, 1.15], material: lineMat })
        .position(Math.cos(a) * ARC_R, 0.014, Math.sin(a) * ARC_R)
        .rotate(0, -a, 0)
    );
  }
  // Check hash mark
  nodes.push(line("check-hash", 0.6, 0.14, 0, CHECK_SPOT[2]));
  return nodes;
}

function buildHoopNodes(): any[] {
  return [
    // Admitted 3D Meshy hoop stanchion rig + backboard + rim. The source GLBs
    // carry AI-generated camo base-colour/MR maps; override them with clean,
    // venue-neutral hardware materials so the rim assembly reads as equipment
    // instead of an overexposed orange smear.
    model(assets.hoopsHoopRig, {
      name: "hoop-rig",
      targetHeight: 3.95,
      scaleMode: "fit",
      castShadow: true,
      receiveShadow: true,
      materialOverrides: [
        { color: "#2f3439", colorMode: "replace", replaceTextures: true, roughness: 0.52, metallic: 0.58, envMapIntensity: 0.8 }
      ]
    })
      .position(0, 1.98, -1.08)
      .rotate(0, Math.PI, 0),
    model(assets.hoopsBackboard, {
      name: "hoop-backboard",
      scaleMode: "world",
      castShadow: true,
      receiveShadow: true,
      materialOverrides: [
        { color: "#eef3f7", colorMode: "replace", replaceTextures: true, roughness: 0.34, metallic: 0.02, clearcoat: 0.45, clearcoatRoughness: 0.22, envMapIntensity: 0.7 }
      ]
    })
      .position(0, 3.35, BOARD_Z)
      .runtime(game.runtimeNode("backboard-assembly")),
    model(assets.hoopsRim, {
      name: "hoop-rim",
      scaleMode: "world",
      castShadow: true,
      materialOverrides: [
        { color: "#c65a1e", colorMode: "replace", replaceTextures: true, roughness: 0.38, metallic: 0.42, envMapIntensity: 0.85 }
      ]
    })
      .position(RIM[0], RIM[1], RIM[2])
      .runtime(game.runtimeNode("rim-assembly")),
    // Net: two stacked tori + skirt planes for ripple feedback
    primitives.torus({ name: "net-top", size: [0.47, 0.47, 0.35], material: material.pbr({ color: "#e8e8e0", roughness: 0.7 }) }).position(0, RIM[1] - 0.1, 0).rotate(Math.PI / 2, 0, 0).runtime(game.runtimeNode("net-top")),
    primitives.torus({ name: "net-bottom", size: [0.3, 0.3, 0.28], material: material.pbr({ color: "#e8e8e0", roughness: 0.7 }) }).position(0, RIM[1] - 0.42, 0).rotate(Math.PI / 2, 0, 0).runtime(game.runtimeNode("net-bottom")),
    primitives.cylinder({ name: "net-skirt", size: [0.34, 0.34, 0.34], material: material.pbr({ color: "#e8e8e0", roughness: 0.7, opacity: 0.22 }) }).position(0, RIM[1] - 0.24, 0).runtime(game.runtimeNode("net-skirt")),
    // Quiet warm rim light in place of the old oversized emissive saucer.
    primitives.torus({ name: "rim-halo", size: [0.58, 0.58, 0.16], material: material.emissive({ color: "#5a2f14", emissive: "#ff8a3d", emissiveIntensity: 0.35, opacity: 0.28 }) }).position(0, RIM[1] + 0.015, 0).rotate(Math.PI / 2, 0, 0).runtime(game.runtimeNode("rim-halo"))
  ];
}

function buildBallNodes(): any[] {
  const nodes: any[] = [
    model(assets.hoopsBall, { name: "ball-live", scaleMode: "fit", targetMaxDimension: 0.26, castShadow: true })
      .position(0, 0.98, CHECK_SPOT[2])
      .runtime(game.runtimeNode("ball-live")),
    primitives.cylinder({ name: "ball-shadow", size: [0.34, 0.008, 0.34], material: material.pbr({ color: "#000000", opacity: 0.28, roughness: 1 }) }).position(0, 0.012, CHECK_SPOT[2]).runtime(game.runtimeNode("ball-shadow"))
  ];
  for (let i = 0; i < TRAIL_COUNT; i++) {
    nodes.push(
      primitives.sphere({ name: `ball-trail-${i}`, size: [0.1, 0.1, 0.1], material: material.emissive({ color: "#ff9a3d", emissive: "#ff9a3d", emissiveIntensity: 0.4 }) })
        .scale(HIDDEN)
        .runtime(game.runtimeNode(`ball-trail-${i}`))
    );
  }
  return nodes;
}

/** Clean ground readability rings & shadow for one 3D Meshy athlete (no primitive body/shoe capsules). */
function buildAthleteAccessories(id: string, team: TeamId): any[] {
  // Muted team tints, not broadcast target markers: a thin painted ring with a
  // whisper of emissive so it survives shade without reading as a reticle.
  const ringColor = team === "home" ? "#8a3f16" : "#17465c";
  const ringEmissive = team === "home" ? "#ff7a1a" : "#39d7ff";
  return [
    primitives.cylinder({ name: `${id}-shadow`, size: [0.58, 0.008, 0.58], material: material.pbr({ color: "#000000", opacity: 0.24, roughness: 1 }) }).runtime(game.runtimeNode(`${id}-shadow`)),
    primitives.torus({ name: `${id}-ring`, size: [0.82, 0.82, 0.34], material: material.emissive({ color: ringColor, emissive: ringEmissive, emissiveIntensity: 0.26, opacity: 0.42 }) }).rotate(Math.PI / 2, 0, 0).runtime(game.runtimeNode(`${id}-ring`)),
    // Jam aura — hidden until the meter is full
    primitives.cylinder({ name: `${id}-aura`, size: [0.9, 1.9, 0.9], material: material.emissive({ color: "#ff7a1a", emissive: "#ff7a1a", emissiveIntensity: 0.9, opacity: 0.16 }) }).scale(HIDDEN).runtime(game.runtimeNode(`${id}-aura`))
  ];
}

function buildAthlete(id: string, _team: TeamId): any[] {
  const athleteAsset = /[124]$/.test(id) ? assets.hoopsAthleteBig : assets.hoopsAthleteGuard;
  return [
    model(athleteAsset, { name: id, targetHeight: 1.92, scaleMode: "fit", castShadow: true, receiveShadow: true })
      .position(0, 0.96, 6)
      .animate({ clip: "Crouch_Idle_Loop", loop: true, speed: 1.0 })
      .runtime(game.runtimeNode(id)),
    ...buildAthleteAccessories(id, _team)
  ];
}

function buildCrowd(_v: VenueSpec): any[] {
  const nodes: any[] = [
    // Real 3D stadium seating grandstands surrounding the outer court perimeter
    model(assets.showcaseStadiumSeats, { name: "bleacher-north", targetMaxDimension: 12, scaleMode: "fit", castShadow: false, receiveShadow: true })
      .position(0, 1.2, -18.5),
    model(assets.showcaseStadiumSeats, { name: "bleacher-west", targetMaxDimension: 11, scaleMode: "fit", castShadow: false, receiveShadow: true })
      .position(-19.5, 1.1, 4.0)
      .rotate(0, Math.PI / 2, 0),
    model(assets.showcaseStadiumSeats, { name: "bleacher-east", targetMaxDimension: 11, scaleMode: "fit", castShadow: false, receiveShadow: true })
      .position(19.5, 1.1, 4.0)
      .rotate(0, -Math.PI / 2, 0)
  ];
  return nodes;
}

function buildVenueDressing(v: VenueSpec): any[] {
  const nodes: any[] = [];
  const vrng = makeRng(0x9e3779 + VENUE_ORDER.indexOf(v.id) * 77);

  if (v.glbVenue) {
    nodes.push(
      model(assets.hoopsCourtShell, { name: "venue-shell", targetMaxDimension: 24, scaleMode: "fit", castShadow: false, receiveShadow: true }).position(0, 0.2, -22),
    );
  }

  // Skyline ring — tall silhouettes behind play, per-venue density/tint
  if (v.id === "rucker" || v.id === "shanghai" || v.id === "athens") {
    nodes.push(
      model(assets.hoopsSkyline, { name: "skyline", targetMaxDimension: 26, scaleMode: "fit", castShadow: false, receiveShadow: false })
        .position(0, -0.5, -56)
    );
    if (v.id === "shanghai") {
      nodes.push(
        model(assets.hoopsTower, { name: "tower-east", targetHeight: 34, castShadow: false }).position(26, 0, -18),
        model(assets.hoopsTower, { name: "tower-west", targetHeight: 26, castShadow: false }).position(-26, 0, -14)
      );
      nodes.push(
        primitives.plane({ name: "river-strip", size: [80, 1, 12], material: material.pbr({ color: "#0a1826", roughness: 0.2, metalness: 0.6, emissive: "#0d2438", emissiveIntensity: 0.25 }) }).position(0, -0.05, 20)
      );
    }
  }

  if (v.id === "venice") {
    nodes.push(
      primitives.plane({ name: "sand-surround", size: [90, 1, 46], material: material.pbr({ color: "#c9ad72", roughness: 0.95 }) }).position(0, -0.04, 6),
      primitives.plane({ name: "ocean-glint", size: [90, 1, 10], material: material.pbr({ color: "#2e8fa8", roughness: 0.3, metalness: 0.4, emissive: "#ff9a3d", emissiveIntensity: 0.12 }) }).position(0, -0.03, -22)
    );
    for (const [x, z, s] of [[-12, -8, 1], [12.5, -10, 1.2], [-14, 12, 0.9], [14, 14, 1.05], [-9, 16, 0.8]] as const) {
      nodes.push(model(assets.hoopsPalm, { name: `palm-${x}-${z}`, targetHeight: 6.4 * s, castShadow: true }).position(x, 0, z).rotate(0, vrng() * Math.PI * 2, 0));
    }
  }

  if (v.id === "manila") {
    nodes.push(
      model(assets.hoopsCanopy, { name: "manila-canopy", targetMaxDimension: 36, scaleMode: "fit", castShadow: false, receiveShadow: true }).position(0, 9.2, 4)
    );
    for (const [x, z] of [[-13, -4], [13, -4], [-13, 12], [13, 12]] as const) {
      nodes.push(
        model(assets.hoopsFloodlight, { name: `flood-${x}-${z}`, targetHeight: 8.6 }).position(x, 0, z).rotate(0, Math.atan2(-x, -z), 0),
        lights.spot({ name: `flood-s-${x}-${z}`, position: [x * 0.9, 8.4, z * 0.9], target: [0, 0, 4], angle: 0.6, penumbra: 0.5, intensity: 2.2, color: "#ffd9a8", distance: 55 })
      );
    }
  }

  if (v.id === "shanghai") {
    for (const [x, z] of [[-9, -3.2], [9, -3.2], [-9, 11.5], [9, 11.5], [-12, 4], [12, 4]] as const) {
      nodes.push(model(assets.hoopsLamp, { name: `neon-lamp-${x}-${z}`, targetHeight: 4.6 }).position(x, 0, z).rotate(0, Math.atan2(-x, 4 - z), 0));
    }
    nodes.push(
      lights.point({ name: "neon-fill-a", position: [-8, 5, 4], color: "#39d7ff", intensity: 1.6, distance: 40 }),
      lights.point({ name: "neon-fill-b", position: [8, 5, 4], color: "#e26bff", intensity: 1.3, distance: 40 })
    );
  }

  if (v.id === "orbit") {
    nodes.push(
      model(assets.hoopsOrbitArena, { name: "orbit-dome", targetMaxDimension: 64, castShadow: false, receiveShadow: false }).position(0, -0.4, 4),
      model(assets.hoopsCanopy, { name: "orbit-halo", targetMaxDimension: 46, castShadow: false, receiveShadow: false }).position(0, 14, -20),
      model(assets.hoopsEarth, { name: "planet-earth", targetMaxDimension: 210, castShadow: false, receiveShadow: false })
        .position(-60, 130, -300)
        .runtime(game.runtimeNode("planet-earth"))
    );
    const starT: any[] = [];
    for (let i = 0; i < 140; i++) {
      const a = vrng() * Math.PI * 2;
      const ph = vrng() * Math.PI * 0.5;
      const r = 120 + vrng() * 60;
      starT.push({ position: [Math.cos(a) * Math.cos(ph) * r, 20 + Math.sin(ph) * r, Math.sin(a) * Math.cos(ph) * r], scale: [0.5 + vrng(), 0.5 + vrng(), 0.5 + vrng()] });
    }
    nodes.push((instances as any).sphere({ name: "starfield", transforms: starT, material: material.emissive({ color: "#cfe8ff", emissive: "#cfe8ff", emissiveIntensity: 1.4 }) }));
    nodes.push(
      lights.point({ name: "orbit-fill", position: [0, 12, 4], color: "#7dfcff", intensity: 2.0, distance: 60 }),
      effects.lightCone({ name: "orbit-cone", position: [0, 10, -6], direction: [0, -1, 0.2], color: "#7dfcff", intensity: 0.25, length: 12, coneAngle: 0.5, softness: 0.6 } as any)
    );
  }

  if (v.id === "rucker") {
    for (const [x, z] of [[-11, -7], [11, -7], [-11, 13], [11, 13]] as const) {
      nodes.push(
        model(assets.hoopsFloodlight, { name: `flood-${x}-${z}`, targetHeight: 9.2 }).position(x, 0, z).rotate(0, Math.atan2(-x, 4 - z), 0),
        lights.spot({ name: `flood-s-${x}-${z}`, position: [x * 0.92, 9.0, z * 0.92], target: [0, 0, 4], angle: 0.55, penumbra: 0.5, intensity: 1.9, color: "#ffd9b0", distance: 55 })
      );
    }
    nodes.push(
      model(assets.hoopsScoreboard, { name: "scoreboard-rig", targetHeight: 5.4, castShadow: false }).position(0, 4.2, -12.5),
      primitives.box({ name: "scoreboard-glow", size: [6.4, 2.2, 0.24], material: material.emissive({ color: "#1a0f04", emissive: "#ff7a1a", emissiveIntensity: 0.5 }) }).position(0, 5.4, -12.3).runtime(game.runtimeNode("scoreboard-glow"))
    );
  }

  // Courtside dressing shared by all courts: ball rack and trophy case (no static sideline athlete clones)
  nodes.push(
    model(assets.hoopsBallCart, { name: "ball-rack", targetHeight: 1.15 }).position(-8.9, 0.58, 9.4).rotate(0, 0.5, 0),
    model(assets.hoopsTrophy, { name: "trophy-case", targetHeight: 1.7, castShadow: false }).position(9.2, 0.85, -3.4).rotate(0, -0.8, 0).runtime(game.runtimeNode("trophy-case"))
  );

  // Court wear decals
  for (const [x, z, s] of [[-2.2, 3.6, 1.4], [2.1, 3.4, 1.2], [0, 8.6, 1.6], [-3.4, 7.8, 1.0], [3.1, 9.2, 1.3], [0.4, 0.9, 1.1]] as const) {
    nodes.push(decals.project({ name: `scuff-${x}-${z}`, color: "#000000", size: [s, s * 0.62], opacity: v.id === "venice" ? 0.08 : 0.16, position: [x, 0.014, z], normal: [0, 1, 0] }));
  }
  return nodes;
}

function buildCones(): any[] {
  const nodes: any[] = [];
  for (let i = 0; i < CONE_COUNT; i++) {
    nodes.push(
      primitives.cylinder({ name: `cone-${i}`, size: [0.34, 0.5, 0.34], material: material.emissive({ color: "#ff7a1a", emissive: "#ff7a1a", emissiveIntensity: 0.5 }) })
        .scale(HIDDEN)
        .runtime(game.runtimeNode(`cone-${i}`)),
      primitives.torus({ name: `cone-ring-${i}`, size: [0.68, 0.68, 0.5], material: material.emissive({ color: "#ffd257", emissive: "#ffd257", emissiveIntensity: 1.0 }) })
        .rotate(Math.PI / 2, 0, 0)
        .scale(HIDDEN)
        .runtime(game.runtimeNode(`cone-ring-${i}`))
    );
  }
  return nodes;
}

function buildScene(v: VenueSpec): any {
  const s = scene()
    .background(v.bg)
    .add(looks.preset(v.look, { fogDensityScale: 0, exposureEv: 0.16 }))
    .add(effects.contactShadows({ intensity: 0.7, length: 0.28 }))
    .add(effects.vignette({ intensity: 0.16, smoothness: 0.7 }))
    .camera(camera.perspective({ position: [0, 9.2, 17.4], target: [0, 1.4, 2.4], fov: 34, far: v.orbit ? 900 : 240 }))
    .addMany(buildCourtSurfaces(v))
    .addMany(buildHoopNodes())
    .addMany(buildBallNodes())
    .addMany(buildCrowd(v))
    .addMany(buildVenueDressing(v))
    .addMany(buildCones())
    .addMany(buildAthlete("p0", "home"))
    .addMany(buildAthlete("p1", "home"))
    .addMany(buildAthlete("p2", "home"))
    .addMany(buildAthlete("p3", "home"))
    .addMany(buildAthlete("p4", "home"))
    .addMany(buildAthlete("a0", "away"))
    .addMany(buildAthlete("a1", "away"))
    .addMany(buildAthlete("a2", "away"))
    .addMany(buildAthlete("a3", "away"))
    .addMany(buildAthlete("a4", "away"));
  return s;
}

/* ------------------------------------------------------------------ *
 *  App boot                                                           *
 * ------------------------------------------------------------------ */
let appReady = false;
let framesRendered = 0;
let venue: VenueSpec = VENUES.rucker;
let auraApp: ReturnType<typeof createAuraApp>;

try {
  auraApp = createAuraApp("#app", {
    scene: buildScene(venue),
    ...looks.appOptions(venue.look),
    qualityRebuild: { flags: ["game", "-compiler", "-post", "-vfxFog"] },
    diagnostics: false
  } as any);
} catch (err) {
  if (renderError) (renderError as HTMLElement).hidden = false;
  throw err;
}

const req = (id: string): AnyHandle => {
  try { return auraApp.nodes.require(id) as AnyHandle; } catch { return undefined; }
};

interface Rig {
  root: AnyHandle; shadow: AnyHandle; ring: AnyHandle; aura: AnyHandle;
}
let rigs: Rig[] = [];
let refereeNode: AnyHandle;
let ballNode: AnyHandle;
let ballShadow: AnyHandle;
let rimHalo: AnyHandle;
let rimNode: AnyHandle;
let netTop: AnyHandle;
let netBottom: AnyHandle;
let netSkirt: AnyHandle;
let scoreboardGlow: AnyHandle;
let planetEarth: AnyHandle;
let trailNodes: AnyHandle[] = [];
let coneNodes: AnyHandle[] = [];
let coneRingNodes: AnyHandle[] = [];
let waverNodes: AnyHandle[] = [];

const ROSTER_IDS = ["p0", "p1", "p2", "p3", "p4", "a0", "a1", "a2", "a3", "a4"] as const;
const lastClipByActor = new Map<string, string>();
const lastSpeedByActor = new Map<string, number>();
const dribblePoseOn = new Set<string>();
const livePoseOn = new Set<string>();
const overlayPoseOn = new Set<string>();
/** Per-handler palm solve handed from syncAthlete's pose to the ball hold branch. */
interface DribbleAim { palm: Vec3; shoulderY: number; t: number; moving: boolean }
const dribbleAims = new Map<string, DribbleAim>();
// Bind-space arm geometry. The rig has no hand bones (arms end at Forearm), so
// the palm is the calibrated hand-centroid offset in forearm bone space. These
// measured constants are only the fallback — armRigFor() derives the live
// lengths/directions from socket().bindWorldMatrix() on first valid read.
const PALM_OFFSET_R: Vec3 = [-0.117, -0.245, 0.137];
const PALM_OFFSET_L: Vec3 = [0.117, -0.245, 0.137];
const UPPER_ARM_LEN = Math.hypot(0.05, 0.25, 0.01);
const FOREARM_LEN = Math.hypot(0.117, 0.245, 0.137);
const RIGHT_UPPER_ARM_BIND = unit([-0.05, -0.25, 0.01]);
const RIGHT_FOREARM_BIND = unit(PALM_OFFSET_R);
const LEFT_UPPER_ARM_BIND = unit([0.05, -0.25, 0.01]);
const LEFT_FOREARM_BIND = unit(PALM_OFFSET_L);
/** Bind-derived per-athlete arm facts: segment lengths + bone-space directions. */
interface ArmRigFacts {
  upperLenR: number; foreLenR: number; upperDirR: Vec3; foreDirR: Vec3;
  upperLenL: number; foreLenL: number; upperDirL: Vec3; foreDirL: Vec3;
}
const FALLBACK_ARM_RIG: ArmRigFacts = {
  upperLenR: UPPER_ARM_LEN, foreLenR: FOREARM_LEN, upperDirR: RIGHT_UPPER_ARM_BIND, foreDirR: RIGHT_FOREARM_BIND,
  upperLenL: UPPER_ARM_LEN, foreLenL: FOREARM_LEN, upperDirL: LEFT_UPPER_ARM_BIND, foreDirL: LEFT_FOREARM_BIND
};
const armRigs = new Map<string, ArmRigFacts>();
/** Minimal view of the engine's `animation.socket(bone)` used for bind reads. */
interface BoneSocketView {
  readonly valid: boolean;
  worldMatrix(out?: Float32Array): Float32Array;
  bindWorldMatrix(out?: Float32Array): Float32Array;
}
const mat4Translation = (m: ArrayLike<number>): Vec3 => [m[12]!, m[13]!, m[14]!];
const mat4Point = (m: ArrayLike<number>, p: Vec3): Vec3 => [
  m[0]! * p[0] + m[4]! * p[1] + m[8]! * p[2] + m[12]!,
  m[1]! * p[0] + m[5]! * p[1] + m[9]! * p[2] + m[13]!,
  m[2]! * p[0] + m[6]! * p[1] + m[10]! * p[2] + m[14]!
];
/**
 * Derive one athlete's bind arm geometry from the animation sockets: segment
 * lengths from the joint translations, palm direction from the forearm bind
 * matrix composed with the calibrated palm offset. Falls back to the measured
 * constants (and retries next frame) until the sockets resolve.
 */
function armRigFor(id: string, root: AnyHandle): ArmRigFacts {
  const cached = armRigs.get(id);
  if (cached) return cached;
  const anim = (root as any)?.animation;
  if (typeof anim?.socket !== "function") return FALLBACK_ARM_RIG;
  const side = (upperName: string, foreName: string, palmOffset: Vec3) => {
    const u = anim.socket(upperName) as BoneSocketView;
    const f = anim.socket(foreName) as BoneSocketView;
    if (!u?.valid || !f?.valid) return undefined;
    const shoulder = mat4Translation(u.bindWorldMatrix());
    const elbow = mat4Translation(f.bindWorldMatrix());
    if (Math.hypot(shoulder[0], shoulder[1], shoulder[2]) < 1e-3) return undefined;
    if (Math.hypot(elbow[0], elbow[1], elbow[2]) < 1e-3) return undefined;
    const palm = mat4Point(f.bindWorldMatrix(), palmOffset);
    return {
      upperLen: Math.hypot(elbow[0] - shoulder[0], elbow[1] - shoulder[1], elbow[2] - shoulder[2]),
      foreLen: Math.hypot(palm[0] - elbow[0], palm[1] - elbow[1], palm[2] - elbow[2]),
      upperDir: unit([elbow[0] - shoulder[0], elbow[1] - shoulder[1], elbow[2] - shoulder[2]]),
      foreDir: unit([palm[0] - elbow[0], palm[1] - elbow[1], palm[2] - elbow[2]])
    };
  };
  const right = side("RightUpperArm", "RightForearm", PALM_OFFSET_R);
  const left = side("LeftUpperArm", "LeftForearm", PALM_OFFSET_L);
  if (!right || !left) return FALLBACK_ARM_RIG;
  const facts: ArmRigFacts = {
    upperLenR: right.upperLen, foreLenR: right.foreLen, upperDirR: right.upperDir, foreDirR: right.foreDir,
    upperLenL: left.upperLen, foreLenL: left.foreLen, upperDirL: left.upperDir, foreDirL: left.foreDir
  };
  armRigs.set(id, facts);
  return facts;
}
/** Two-bone arm solve in the actor-local bone world space; rotations come back parent-local. */
function armIK(
  chestRot: Quat, shoulder: Vec3, palm: Vec3,
  upperLen: number, foreLen: number, upperBind: Vec3, foreBind: Vec3, pole: Vec3
): { upperLocal: Quat; foreLocal: Quat } {
  const elbow = solveElbow(shoulder, palm, upperLen, foreLen, pole);
  const upperWorld = qFromTo(upperBind, unit([elbow[0] - shoulder[0], elbow[1] - shoulder[1], elbow[2] - shoulder[2]]));
  const foreWorld = qFromTo(foreBind, unit([palm[0] - elbow[0], palm[1] - elbow[1], palm[2] - elbow[2]]));
  return { upperLocal: qMul(qConj(chestRot), upperWorld), foreLocal: qMul(qConj(upperWorld), foreWorld) };
}
// The GLB's Idle/Ready clips carry no arm keys, so stationary athletes hold the
// A-pose bind with stiff straight arms. This full-body stance is the crouch
// frame from Crouch_Idle_Loop; procedural arm IK is layered on top each frame.
const stanceLegs = () => ({
  Hips: { position: { x: 0, y: 0.882, z: 0 } },
  Spine: { rotation: qX(0.105) },
  Chest: { rotation: qX(0.07) },
  Head: { rotation: qX(-0.122) },
  LeftUpperLeg: { rotation: qX(-0.208) },
  LeftLowerLeg: { rotation: qX(0.276) },
  LeftFoot: { rotation: qX(-0.07) },
  RightUpperLeg: { rotation: qX(-0.208) },
  RightLowerLeg: { rotation: qX(0.276) },
  RightFoot: { rotation: qX(-0.07) }
});

function setNodeClip(id: string, handle: AnyHandle, clip: string, speed = 1.0): void {
  if (!handle) return;
  const prevClip = lastClipByActor.get(id);
  const prevSpeed = lastSpeedByActor.get(id) ?? 1.0;
  if (prevClip === clip && Math.abs(prevSpeed - speed) < 0.05) return;
  lastClipByActor.set(id, clip);
  lastSpeedByActor.set(id, speed);
  try {
    if (typeof handle.setAnimation === "function") {
      handle.setAnimation({ clip, loop: true, speed });
      return;
    }
    handle.play?.(clip, { loop: true, speed });
  } catch {
    /* animation switch best-effort */
  }
}

function resolveHandles(): void {
  lastClipByActor.clear();
  lastSpeedByActor.clear();
  dribblePoseOn.clear();
  livePoseOn.clear();
  overlayPoseOn.clear();
  dribbleAims.clear();
  armRigs.clear();
  rigs = ROSTER_IDS.map((id) => ({
    root: req(id),
    shadow: req(`${id}-shadow`),
    ring: req(`${id}-ring`),
    aura: req(`${id}-aura`)
  }));
  refereeNode = req("referee");
  ballNode = req("ball-live");
  ballShadow = req("ball-shadow");
  rimHalo = req("rim-halo");
  rimNode = req("rim-assembly");
  netTop = req("net-top");
  netBottom = req("net-bottom");
  netSkirt = req("net-skirt");
  scoreboardGlow = req("scoreboard-glow");
  planetEarth = req("planet-earth");
  trailNodes = Array.from({ length: TRAIL_COUNT }, (_, i) => req(`ball-trail-${i}`));
  coneNodes = Array.from({ length: CONE_COUNT }, (_, i) => req(`cone-${i}`));
  coneRingNodes = Array.from({ length: CONE_COUNT }, (_, i) => req(`cone-ring-${i}`));
  waverNodes = Array.from({ length: CROWD_WAVERS }, (_, i) => req(`waver-${i}`));
}
resolveHandles();

/* ------------------------------------------------------------------ *
 *  Athlete entities                                                   *
 * ------------------------------------------------------------------ */
const lerpAngle = (a: number, b: number, t: number) => {
  const diff = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + diff * t;
};

function makeAthlete(nodeId: string, team: TeamId, index: number): AthleteState {
  return {
    nodeId, team, index,
    x: 0, y: 0, z: 6, vx: 0, vz: 0, yaw: team === "home" ? Math.PI : 0, vy: 0,
    hasBall: false, controlled: false, stumble: 0, jumpT: 0, blockArm: 0, pokeCd: 0,
    screenT: 0, cutT: 0, aiT: 0.4 + index * 0.45, aiPlan: "idle", tx: 0, tz: 6,
    clip: "", clipSince: -10, wpPauseT: 0, actionUntil: 0,
    meterT: 0, shooting: false, dunkT: 0, dunkKind: ""
  };
}

function resetAthletes(): void {
  athletes = [
    makeAthlete("p0", "home", 0),
    makeAthlete("p1", "home", 1),
    makeAthlete("p2", "home", 2),
    makeAthlete("p3", "home", 3),
    makeAthlete("p4", "home", 4),
    makeAthlete("a0", "away", 0),
    makeAthlete("a1", "away", 1),
    makeAthlete("a2", "away", 2),
    makeAthlete("a3", "away", 3),
    makeAthlete("a4", "away", 4)
  ];
}

const homeTeam = () => athletes.filter((a) => a.team === "home");
const awayTeam = () => athletes.filter((a) => a.team === "away");
const holderAthlete = (): AthleteState | undefined => athletes.find((a) => a.hasBall);
const idxOf = (a: AthleteState) => (a.team === "home" ? a.index : 5 + a.index);
const nearestDefender = (a: AthleteState): AthleteState | undefined => {
  const foes = a.team === "home" ? awayTeam() : homeTeam();
  let best: AthleteState | undefined; let bd = Infinity;
  for (const f of foes) { const d = dist2d(a.x, a.z, f.x, f.z); if (d < bd) { bd = d; best = f; } }
  return best;
};

const LOCOMOTION_CLIPS = new Set(["Idle_Loop", "Crouch_Idle_Loop", "Ready", "Walk_Loop", "Run", "Sprint_Loop"]);

function setClip(a: AthleteState, clip: string, speed = 1.0): void {
  const isInitial = a.clip === "";
  if (a.clip === clip) {
    const r = rigs[idxOf(a)];
    if (r?.root) setNodeClip(a.nodeId, r.root, clip, speed);
    return;
  }
  const isLocomotion = LOCOMOTION_CLIPS.has(clip) && LOCOMOTION_CLIPS.has(a.clip);
  if (!isInitial && isLocomotion && (game_.time - a.clipSince) < 0.35) {
    return;
  }
  a.clip = clip;
  a.clipSince = isInitial ? -10 : game_.time;
  const r = rigs[idxOf(a)];
  const h = r?.root as any;
  if (!h) return;
  setNodeClip(a.nodeId, h, clip, speed);
}

/* ------------------------------------------------------------------ *
 *  Audio + juice + fx                                                 *
 * ------------------------------------------------------------------ */
type GameAudioLike = { unlock(): Promise<unknown>; cue(c: string): Promise<unknown>; evidence: { unlocked: boolean; cueCount: number; playedCueCount: number } };
let audio: GameAudioLike | null = null;
let juice: ReturnType<typeof createJuice> | null = null;
let fxCtl: ReturnType<typeof game.effects> | null = null;
let touchControls: any = null;
let reducedMotion = false;
let reducedFlash = false;
let hitStopUntil = 0;
let jamFlashT = 0;

const JUICE_EVENTS: Record<string, { fx?: { kind: any; count?: number; color?: string; speed?: number }; cue?: string; shake?: number; punch?: { fovDeg?: number; dolly?: number; ms?: number }; hitStop?: number; flash?: { color: string; peak: number; ms: number }; rumble?: { ms: number; strong?: number; weak?: number } }> = {
  dribble: { cue: "dribble" },
  swish: { fx: { kind: "ring", count: 20, color: "#ffd257", speed: 4.6 }, cue: "swish", hitStop: 0.06, punch: { fovDeg: 2.2, ms: 240 }, flash: { color: "#ffd257", peak: 0.16, ms: 150 }, rumble: { ms: 40, weak: 0.4 } },
  bank: { fx: { kind: "spark", count: 10, color: "#39d7ff", speed: 3.2 }, cue: "boardThud", punch: { fovDeg: 1.4, ms: 160 } },
  rim: { cue: "rimClank", shake: 0.12, rumble: { ms: 30, weak: 0.3 } },
  brick: { cue: "brickMiss", flash: { color: "#ff3b5c", peak: 0.08, ms: 110 } },
  buzzer: { cue: "buzzerFail", shake: 0.35, flash: { color: "#ff3b5c", peak: 0.2, ms: 240 } },
  dunk: { fx: { kind: "ring", count: 26, color: "#ff7a1a", speed: 5.6 }, cue: "rimClank", hitStop: 0.09, shake: 0.5, punch: { fovDeg: 3.4, dolly: -0.5, ms: 300 }, flash: { color: "#ff7a1a", peak: 0.24, ms: 200 }, rumble: { ms: 70, strong: 0.7, weak: 0.9 } },
  jam: { fx: { kind: "aura", count: 30, color: "#ff7a1a", speed: 6.2 }, cue: "fireIgnite", hitStop: 0.11, shake: 0.6, punch: { fovDeg: 4.0, dolly: -0.6, ms: 380 }, flash: { color: "#ffd257", peak: 0.3, ms: 280 }, rumble: { ms: 90, strong: 0.85, weak: 1 } },
  steal: { fx: { kind: "spark", count: 8, color: "#66e37f", speed: 3.0 }, cue: "heatAdvance", punch: { fovDeg: 1.2, ms: 140 } },
  block: { fx: { kind: "spark", count: 14, color: "#39d7ff", speed: 4.4 }, cue: "boardThud", shake: 0.3, punch: { fovDeg: 2.0, ms: 200 } },
  pass: { cue: "chargeTick", rumble: { ms: 18, weak: 0.2 } },
  juke: { fx: { kind: "streak", count: 12, color: "#e26bff", speed: 4.0 }, cue: "chargeTick", punch: { fovDeg: 1.4, ms: 160 } },
  check: { cue: "chargeTick" },
  win: { fx: { kind: "ring", count: 30, color: "#ffd257", speed: 5.0 }, cue: "fanfare", shake: 0.4, punch: { fovDeg: 3.0, ms: 420 }, flash: { color: "#ffd257", peak: 0.26, ms: 300 } },
  crown: { cue: "winFanfare", shake: 0.6, punch: { fovDeg: 4.4, ms: 600 }, flash: { color: "#ff7a1a", peak: 0.34, ms: 420 } },
  gate: { fx: { kind: "spark", count: 8, color: "#66e37f", speed: 2.6 }, cue: "heatAdvance" },
  release: { cue: "chargeTick" }
};

const FX_KIND_MAP: Record<string, string> = {
  spark: "hit-spark", dust: "ground-dust", ring: "ring-shockwave", streak: "dash-trail",
  aura: "aura-burst", flash: "super-flash"
};

function juiceFire(ev: string, at?: Record<string, unknown>): void {
  try { (juice as any)?.fire?.(ev, at); } catch { /* juice is best-effort */ }
}
function fxSpawn(kind: string, pos: Vec3, radius = 0.5, color?: string): void {
  try { fxCtl?.spawn((FX_KIND_MAP[kind] ?? "hit-spark") as any, pos, { radius, color, intensity: 1 }); } catch { /* bound fx best-effort */ }
}
function cue(name: string): void { void audio?.cue(name).catch(() => {}); }

function setupSystems(): void {
  const params = new URLSearchParams(window.location.search);
  reducedMotion = params.has("reducedMotion") || (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false);
  reducedFlash = params.has("reducedFlash") || (window.matchMedia?.("(prefers-reduced-flash: reduce)")?.matches ?? false);

  const stage = document.getElementById("game-stage") ?? document.body;
  let fxLayer = document.getElementById("hoops-fx-layer");
  if (!fxLayer) {
    fxLayer = document.createElement("div");
    fxLayer.id = "hoops-fx-layer";
    fxLayer.setAttribute("aria-hidden", "true");
    fxLayer.style.cssText = "position:fixed;inset:0;pointer-events:none;background:transparent;z-index:8;";
    stage.appendChild(fxLayer);
  }

  try {
    fxCtl = (game as any).effects({ app: auraApp, reducedMotion, reducedFlash });
  } catch { fxCtl = null; }
  const fx = createFxParticlePass({
    burst: (kind: string, position: any, o: any) => {
      fxSpawn(kind, position as Vec3, Math.max(0.2, (o?.count ?? 10) / 24), o?.color);
    },
    trail: () => {},
    liveCount: 0
  } as any);

  audio = createGameAudio({
    browserContext: true,
    cues: {
      swish: { id: "swish", asset: assets.hoopsSwishSfx as any, volume: 0.85 },
      rimClank: { id: "rimClank", asset: assets.hoopsRimClankSfx as any, volume: 0.7 },
      boardThud: { id: "boardThud", asset: assets.hoopsBoardThudSfx as any, volume: 0.7 },
      brickMiss: { id: "brickMiss", asset: assets.hoopsBrickSfx as any, volume: 0.6 },
      buzzerFail: { id: "buzzerFail", asset: assets.hoopsBuzzerSfx as any, volume: 0.85 },
      chargeTick: { id: "chargeTick", asset: assets.hoopsChargeTickSfx as any, volume: 0.4 },
      fireIgnite: { id: "fireIgnite", asset: assets.hoopsFireSfx as any, volume: 0.9 },
      goldBall: { id: "goldBall", asset: assets.hoopsGoldChimeSfx as any, volume: 0.8 },
      heatAdvance: { id: "heatAdvance", asset: assets.hoopsHeatTickSfx as any, volume: 0.65 },
      ambient: { id: "ambient", asset: assets.hoopsAmbientSfx as any, volume: 0.3, loop: true },
      fanfare: { id: "fanfare", asset: assets.hoopsFanfareSfx as any, volume: 0.85 },
      winFanfare: { id: "winFanfare", asset: assets.hoopsFanfareSfx as any, volume: 0.95 },
      crowd: { id: "crowd", asset: assets.hoopsCrowdSfx as any, volume: 0.24, loop: true },
      dribble: { id: "dribble", asset: assets.hoopsDribbleSfx as any, volume: 0.34 }
    },
    buses: [{ id: "sfx" } as any]
  } as any) as unknown as GameAudioLike;

  const unlock = () => { void audio?.unlock(); cue("ambient"); cue("crowd"); };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });

  juice = createJuice({
    events: JUICE_EVENTS as any,
    camera: (auraApp as any)?.camera as any,
    session: {
      reducedMotion,
      reducedFlash,
      hitStop: (seconds: number) => { hitStopUntil = game_.time + seconds; },
      slowMo: () => { /* sessionless route */ }
    } as any,
    fx,
    overlay: createOverlayDriver({ domElement: fxLayer }),
    tweens: createTweenEngine(),
    rumble: createRumbleDriver(),
    sound: { cue: (c: string) => cue(c) }
  } as any);

  try {
    const sink = {
      press: (b: string) => inputCtl?.press(b),
      release: (b: string) => inputCtl?.release(b),
      setAction: (a: string, held: boolean) => inputCtl?.setAction(a, held)
    };
    touchControls = mountTouchControls(sink as any, {
      preset: "dpad-4btn",
      bindings: { "stick.left": "left", "stick.right": "right", "stick.up": "up", "stick.down": "down", left: "left", right: "right", light: "shoot", heavy: "cross", special: "pass", jump: "shoot", block: "hesi" },
      haptics: { ms: 12 }
    } as any, {
      doc: document as any,
      root: (document.getElementById("touch") ?? stage) as any,
      coarsePointer: () => window.matchMedia?.("(pointer: coarse)")?.matches ?? false
    } as any);
  } catch (e) {
    console.warn("[hoops] touch controls unavailable", e);
  }
}

/* ------------------------------------------------------------------ *
 *  Input                                                              *
 * ------------------------------------------------------------------ */
const inputCtl = auraApp.input({
  actions: {
    up: ["KeyW", "ArrowUp"],
    down: ["KeyS", "ArrowDown"],
    left: ["KeyA", "ArrowLeft"],
    right: ["KeyD", "ArrowRight"],
    sprint: ["ShiftLeft", "ShiftRight"],
    cross: ["KeyJ"],
    hesi: ["KeyK"],
    pass: ["KeyE"],
    shoot: ["Space"],
    rematch: ["KeyR"],
    menu: ["Escape"]
  },
  axes: {
    moveX: { negative: "left", positive: "right" },
    moveZ: { negative: "up", positive: "down" }
  },
  bufferMs: 140
});

// Direct key fallback so gameplay works even before canvas focus.
const keysHeld = new Set<string>();
const keysPressed = new Set<string>();
let lastManualInputAt = -999;

// Blur any clicked button so Space/Enter never re-clicks UI buttons during play.
window.addEventListener("click", (ev) => {
  const btn = (ev.target as HTMLElement | null)?.closest?.("button");
  if (btn && typeof btn.blur === "function") btn.blur();
}, true);

window.addEventListener("keydown", (ev) => {
  lastManualInputAt = game_.time;
  if (!keysHeld.has(ev.code)) keysPressed.add(ev.code);
  keysHeld.add(ev.code);
  if (["Space", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight"].includes(ev.code)) ev.preventDefault();
});
window.addEventListener("keyup", (ev) => keysHeld.delete(ev.code));
window.addEventListener("blur", () => keysHeld.clear());

const held = (action: string, ...codes: string[]) =>
  inputCtl.held(action) || codes.some((c) => keysHeld.has(c));
const pressed = (action: string, ...codes: string[]) =>
  inputCtl.pressed(action) || inputCtl.buffered(action) || codes.some((c) => keysPressed.has(c));

/* ------------------------------------------------------------------ *
 *  HUD helpers                                                        *
 * ------------------------------------------------------------------ */
function showBanner(text: string, dur = 1.5): void {
  if (bannerEl) { bannerEl.textContent = text; bannerEl.classList.add("show"); }
  game_.bannerT = dur;
}
function showMsg(big: string, sub: string, dur = 2.1): void {
  if (msgText) msgText.textContent = big;
  if (msgSub) msgSub.textContent = sub;
  if (msgBox) msgBox.classList.add("show");
  game_.msgT = dur;
}
function showPrompt(text: string, dur = 0.2): void {
  if (promptEl) { promptEl.textContent = text; promptEl.classList.add("show"); }
  game_.promptT = Math.max(game_.promptT, dur);
}
function flashJam(alpha = 0.85): void { jamFlashT = alpha; }

/* ------------------------------------------------------------------ *
 *  Possession / scoring                                               *
 * ------------------------------------------------------------------ */
const FIVE_SPOTS: readonly Vec3[] = [
  [0, 0, CHECK_SPOT[2]],
  [-4.8, 0, 7.2],
  [4.8, 0, 7.2],
  [-6.2, 0, 2.4],
  [3.1, 0, 3.4]
];

function spotFor(_team: TeamId, role: number): Vec3 {
  // 5v5 offense spots around the perimeter, wings, and post.
  return FIVE_SPOTS[role % FIVE_SPOTS.length]!;
}

function pickOffBallWaypoint(a: AthleteState): void {
  const base = spotFor(a.team, a.index);
  const sign = base[0] < 0 ? -1 : base[0] > 0 ? 1 : (a.index % 2 === 0 ? 1 : -1);
  const candidates: Vec3[] = [
    [base[0], 0, base[2]],
    [clamp(base[0] + sign * 1.4, -COURT_X + 0.8, COURT_X - 0.8), 0, clamp(base[2] - 2.8, 1.2, COURT_Z1 - 0.8)],
    [clamp(base[0] * 0.45, -COURT_X + 0.8, COURT_X - 0.8), 0, clamp(base[2] - 1.8, 1.6, COURT_Z1 - 0.8)],
    [clamp(-base[0] * 0.65, -COURT_X + 0.8, COURT_X - 0.8), 0, clamp(base[2] + 0.6, 2.4, COURT_Z1 - 0.8)],
    [sign * 1.35, 0, 1.55]
  ];
  // Pick a candidate at least 2.2m away from current position so the cut is a clean Run
  const far = candidates.filter((c) => dist2d(a.x, a.z, c[0], c[2]) > 2.2);
  const pool = far.length > 0 ? far : candidates;
  const pick = pool[Math.floor(rng() * pool.length)]!;
  a.tx = pick[0];
  a.tz = pick[2];
  a.aiT = 1.6 + rng() * 1.2;
}

function enterCheck(team: TeamId): void {
  game_.phase = "check";
  game_.possession = team;
  game_.checkT = 0;
  game_.mustClear = false;
  closeMeter();
  athletes.forEach((a) => { a.shooting = false; a.meterT = 0; a.actionUntil = 0; });
  ball.state = "parked";
  ball.scored = false; ball.hitRim = false; ball.hitBoard = false; ball.blocked = false;
  const off = team === "home" ? homeTeam() : awayTeam();
  const def = team === "home" ? awayTeam() : homeTeam();
  off.forEach((a, i) => {
    const s = spotFor(team, i);
    a.x = s[0]; a.z = s[2]; a.y = 0; a.vx = 0; a.vz = 0;
    a.hasBall = i === 0; a.controlled = team === "home" && i === 0;
    a.shooting = false; a.dunkT = 0; a.meterT = 0;
    a.yaw = angTo(a.x, a.z, RIM[0], RIM[2]);
    a.wpPauseT = 0.1 + i * 0.18;
    if (i === 0) {
      a.tx = a.x; a.tz = a.z;
    } else {
      pickOffBallWaypoint(a);
    }
  });
  def.forEach((a, i) => {
    const s = spotFor(team, i);
    a.x = s[0] * 0.55; a.z = s[2] - 2.6; a.y = 0; a.vx = 0; a.vz = 0;
    a.hasBall = false; a.controlled = team === "away" && i === 0;
    a.yaw = angTo(a.x, a.z, s[0], s[2]);
    a.tx = a.x; a.tz = a.z;
    a.wpPauseT = 0.15 + i * 0.15;
  });
  const h = holderAthlete();
  if (h) { ball.x = h.x; ball.y = 0.98; ball.z = h.z + 0.28; ball.holder = idxOf(h); }
  showPrompt(team === "home" ? "SPACE — CHECK BALL" : "CPU CHECKING…", 1.4);
  pushEvent("check", team === "home" ? "check ball — your rock" : "check ball — cpu ball", "info");
  juiceFire("check", {});
}

function enterLive(): void {
  if (game_.phase !== "check") return;
  game_.phase = "live";
  const h = holderAthlete();
  if (h) ball.state = "held";
  showBanner("LIVE");
  pushEvent("phase", "ball is live", "info");
}

function awardPoints(team: TeamId, pts: number, label: string): void {
  game_.lastShotLabel = label;
  if (game_.mode === "dunklab" || game_.mode === "handleslab") {
    // Labs don't run a match score — buckets feed style score + streak.
    game_.lab.score += pts;
    game_.lab.streak += 1;
    game_.lab.best = Math.max(game_.lab.best, game_.lab.streak);
    pushEvent("score", `${label} +${pts}`, "success", pts);
    showBanner(`${label} · +${pts}`);
    resetLabBall();
    return;
  }
  if (team === "home") game_.scoreHome += pts; else game_.scoreAway += pts;
  pushEvent("score", `${label} — ${team === "home" ? game_.homeSquad.name : game_.awaySquad.name} +${pts}`, "success", pts);
  const target = game_.target;
  const score = team === "home" ? game_.scoreHome : game_.scoreAway;
  if (score >= target) endGame(team);
  else {
    // Winner's ball: scorer keeps it → check again.
    game_.phase = "score";
    game_.scoreT = 1.15;
    game_.servingTeam = team;
    showBanner(`${label} · ${score}`, 1.15);
  }
}

function endGame(winner: TeamId): void {
  game_.phase = "gameover";
  const won = winner === "home";
  game_.celebration = won ? "RUN WON" : "RUN LOST";
  if (game_.mode === "tour" && game_.tour.active) {
    if (won) {
      game_.tour.round += 1;
      if (game_.tour.round >= 5) {
        game_.tour.champion = true;
        game_.celebration = "STREET TOUR CHAMPION";
        juiceFire("crown", {});
        pushEvent("tour", "street tour champion — 32 crews down", "success");
      } else {
        juiceFire("win", {});
        pushEvent("tour", `advanced — round of ${[16, 8, 4, 2][game_.tour.round - 1] ?? 2}`, "success");
      }
    } else {
      game_.tour.eliminated = true;
      juiceFire("buzzer", {});
      pushEvent("tour", "eliminated from the bracket", "warning");
    }
  } else {
    juiceFire(won ? "win" : "buzzer", {});
  }
  renderBracket();
  showMsg(game_.celebration, `${game_.homeSquad.short} ${game_.scoreHome} — ${game_.scoreAway} ${game_.awaySquad.short} · R TO REMATCH`, 30);
  pushEvent("game", `final ${game_.scoreHome}-${game_.scoreAway}`, won ? "success" : "warning");
}

function startMatch(mode: ModeId): void {
  game_.mode = mode;
  game_.scoreHome = 0;
  game_.scoreAway = 0;
  game_.matchT = 0;
  game_.jam = mode === "dunklab" ? 1 : 0.35;
  game_.target = mode === "blacktop" ? 21 : 11;
  game_.servingTeam = "home";
  resetAthletes();

  if (mode === "tour" && !game_.tour.active) {
    game_.tour = { active: true, round: 0, eliminated: false, champion: false, opponents: [] };
  }
  if (mode === "tour" && game_.tour.active) {
    const oppIdx = 1 + ((game_.tour.round * 3 + Math.floor(rng() * 5)) % (SQUADS.length - 1));
    game_.awaySquad = SQUADS[oppIdx]!;
    game_.tour.opponents[game_.tour.round] = oppIdx;
    const ladder: DiffId[] = ["playground", "pro", "pro", "legend", "legend"];
    game_.diff = ladder[clamp(game_.tour.round, 0, 4)]!;
  }

  if (mode === "handleslab") {
    setupCones();
  } else {
    game_.cones.active = false;
  }

  // Per-mode controls hint + jam-ready copy
  if (controlsHint) {
    const hints: Record<ModeId, string> = {
      quick: "MOVE: <b>WASD</b> · SPRINT: <b>SHIFT</b> · CROSS/HESI: <b>J/K</b> · PASS/OOP: <b>E</b> · SHOOT/BLOCK: <b>SPACE</b> · STEAL: <b>K</b>",
      blacktop: "BLACKTOP TO 21 — ALL BUCKETS COUNT 2 · <b>R</b> REMATCH",
      tour: "STREET TOUR — SURVIVE THE BRACKET · <b>R</b> REMATCH",
      dunklab: "DUNK LAB — JAM METER UNLOCKED · DRIVE AND <b>SPACE</b> AT THE RIM · <b>E</b> ALLEY-OOP",
      handleslab: "HANDLES LAB — CLEAR EVERY CONE RING · <b>J</b> CROSS · <b>K</b> HESI · CHAIN FOR STYLE",
      studio: "PLAYER STUDIO — PICK YOUR FIT · APPLY TO UPDATE THE SQUAD"
    };
    controlsHint.innerHTML = hints[mode] ?? hints.quick;
  }
  if (jamReady) {
    jamReady.textContent = mode === "dunklab" ? "UNLIMITED JAM — POSTERIZE" : "JAM READY · ATTACK THE RIM";
  }

  enterCheck("home");
  if (mode === "dunklab" || mode === "handleslab") {
    game_.phase = "live";
    ball.state = "held";
    const h = holderAthlete();
    if (h) { h.x = 0; h.z = 7.2; }
    if (hudAwayScore) hudAwayScore.textContent = "—";
    awayTeam().forEach((a) => { a.x = 0; a.z = -60 + a.index * 4; }); // park CPU off-court in labs
  }
  const modeLabel = { quick: "QUICK PLAY", dunklab: "DUNK LAB", handleslab: "HANDLES LAB", tour: "STREET TOUR", blacktop: "BLACKTOP", studio: "PLAYER STUDIO" }[mode];
  if (hudMode) hudMode.textContent = modeLabel;
  showMsg(modeLabel, mode === "tour" ? `ROUND OF 32 · VS ${game_.awaySquad.name}` : `${venue.label} · FIRST TO ${game_.target}`, 2.2);
  pushEvent("mode", `started ${modeLabel.toLowerCase()}`, "info");
}

/* ------------------------------------------------------------------ *
 *  Shot meter                                                         *
 * ------------------------------------------------------------------ */
function openMeter(a: AthleteState): void {
  const d = dist2d(a.x, a.z, RIM[0], RIM[2]);
  const def = nearestDefender(a);
  const defD = def ? dist2d(a.x, a.z, def.x, def.z) : 99;
  const contest = defD < 1.6 ? 0.55 : defD < 2.6 ? 0.78 : 1;
  const distF = d < 3 ? 1.45 : d < 4.6 ? 1.15 : d < ARC_R ? 0.95 : 0.8;
  const diffF = game_.diff === "playground" ? 1.15 : game_.diff === "legend" ? 0.9 : 1;
  const halfW = 0.075 * distF * contest * diffF;
  const center = 0.72;
  game_.shotMeter = { active: true, t: 0, g0: center - halfW, g1: center + halfW, perfect: center, frames: 0, tapRelease: false };
  a.shooting = true;
  a.yaw = angTo(a.x, a.z, RIM[0], RIM[2]);
  if (a.jumpT <= 0) {
    a.jumpT = 0.0001;
    a.vy = 2.8;
  }
  setClip(a, "Shoot", 1.35);
  if (shotMeter) shotMeter.classList.add("show");
}

function closeMeter(): void {
  game_.shotMeter.active = false;
  game_.shotMeter.tapRelease = false;
  if (shotMeter) shotMeter.classList.remove("show");
}

/** Solve a launch velocity that arcs from `from` to `target` with a readable apex. */
function solveLaunch(from: Vec3, target: Vec3, arcBoost = 0.9): Vec3 {
  const apex = Math.max(target[1] + 0.55, Math.max(from[1], target[1]) + arcBoost + dist2d(from[0], from[2], target[0], target[2]) * 0.16);
  const vy = Math.sqrt(Math.max(0.1, -2 * GRAVITY * (apex - from[1])));
  const tUp = vy / -GRAVITY;
  const tDown = Math.sqrt(Math.max(0.01, (2 * (apex - target[1])) / -GRAVITY));
  const t = Math.max(0.4, tUp + tDown);
  return [(target[0] - from[0]) / t, vy, (target[2] - from[2]) / t];
}

function releaseShot(a: AthleteState, quality: number): void {
  // quality ∈ [0,1] timing accuracy → aim error mapping
  a.yaw = angTo(a.x, a.z, RIM[0], RIM[2]);
  const from: Vec3 = [a.x, 2.0 + a.y, a.z];
  const d = dist2d(a.x, a.z, RIM[0], RIM[2]);
  const isTwo = d > ARC_R;
  const perfect = quality > 0.985;
  const inGreen = quality > 0.9;
  // make probability shaped by distance + contest + difficulty
  const def = nearestDefender(a);
  const defD = def ? dist2d(a.x, a.z, def.x, def.z) : 99;
  const contest = defD < 1.6 ? -0.28 : defD < 2.6 ? -0.1 : 0;
  const distP = d < 3 ? 0.86 : d < 4.6 ? 0.78 : d < ARC_R ? 0.68 : 0.56;
  const makeP = clamp(distP + contest + (a.controlled ? 0.06 : DIFFS[game_.diff].make) + quality * 0.3 - 0.28, 0.04, 0.99);
  const made = perfect || (inGreen && rng() < makeP) || (!inGreen && rng() < makeP * 0.4);

  const err = (1 - quality) * (d * 0.28) * (made ? 0.25 : 1);
  const errA = rng() * Math.PI * 2;
  const target: Vec3 = made
    ? [RIM[0] + (rng() - 0.5) * 0.06, RIM[1], RIM[2] + (rng() - 0.5) * 0.06]
    : [RIM[0] + Math.cos(errA) * (RIM_R + 0.04 + rng() * err), RIM[1] + (rng() - 0.5) * 0.3, RIM[2] + Math.sin(errA) * (RIM_R + 0.04 + rng() * err)];

  const v = solveLaunch(from, target);
  Object.assign(ball, {
    state: "flight" as BallState, x: from[0], y: from[1], z: from[2],
    vx: v[0], vy: v[1], vz: v[2], holder: -1, flightT: 0,
    hitRim: false, hitBoard: false, scored: false,
    swishOnly: perfect, shotValue: (isTwo ? 2 : 1) as 1 | 2, shooter: idxOf(a), blocked: false
  });
  a.hasBall = false;
  a.shooting = false;
  closeMeter();
  setClip(a, "Release", 1.5);
  a.actionUntil = game_.time + 0.42;
  game_.phase = "shot";
  juiceFire("release", { position: from });
  pushEvent("shot", perfect ? "release — PERFECT" : inGreen ? "release — green" : `release — ${(quality * 100) | 0}%`, perfect || inGreen ? "success" : "info");

  // Contest: a jumping defender within range may swat on release
  if (def && def.jumpT > 0 && defD < 1.9 && !made) {
    const blockP = (def.team === "away" ? 0.42 * DIFFS[game_.diff].contest : 0.5);
    if (rng() < blockP) {
      ball.vx = (ball.x - def.x) * 2.2 + (rng() - 0.5) * 3;
      ball.vy = 1.4;
      ball.vz = Math.abs(ball.vz) * 0.4 + 2.4;
      ball.blocked = true;
      juiceFire("block", { position: [ball.x, ball.y, ball.z] });
      pushEvent("block", "REJECTED", "warning");
      setClip(def, "Contest", 1.35);
    }
  }
}

/* ------------------------------------------------------------------ *
 *  Dunks + Jam packages                                               *
 * ------------------------------------------------------------------ */
const DUNK_PACKAGES = ["POWER JAM", "WINDMILL", "360", "LOB OOP"] as const;

function startDunk(a: AthleteState, kind: string): void {
  const jammed = game_.jamFull && a.team === "home";
  const pkg = kind === "auto" ? (jammed ? DUNK_PACKAGES[1 + Math.floor(rng() * 2)] : "POWER JAM") : kind;
  a.dunkT = 0.0001;
  a.dunkKind = pkg;
  a.hasBall = false;
  Object.assign(ball, { state: "dunk" as BallState, holder: idxOf(a), x: a.x, y: 1.4, z: a.z, vx: 0, vy: 0, vz: 0, shotValue: 1 as const, shooter: idxOf(a), scored: false });
  setClip(a, "Jump_Loop", 1.45);
  if (jammed) {
    game_.jam = 0;
    game_.jamFull = false;
    flashJam();
    jamWrap?.classList.remove("full");
    juiceFire("jam", { position: [a.x, 2, a.z] });
    cue("fireIgnite");
  } else {
    juiceFire("dunk", { position: [a.x, 2, a.z] });
  }
  pushEvent("dunk", `${pkg.toLowerCase()} attempt`, "info");
}

function finishDunk(a: AthleteState): void {
  const pts = 1;
  game_.jam = clamp(game_.jam + 0.22, 0, 1);
  juiceFire("dunk", { position: [RIM[0], RIM[1], RIM[2]] });
  netPulse = 1;
  rimShake = 1;
  pushEvent("dunk", `${a.dunkKind || "dunk"} — ${a.team === "home" ? game_.homeSquad.name : game_.awaySquad.name}`, "success");
  if (game_.mode === "dunklab") {
    game_.lab.score += a.dunkKind === "POWER JAM" ? 2 : 4;
    game_.lab.streak += 1;
    game_.lab.best = Math.max(game_.lab.best, game_.lab.streak);
    game_.lab.style += a.dunkKind === "360" ? 3 : a.dunkKind === "WINDMILL" ? 2 : 1;
    resetLabBall();
  } else {
    awardPoints(a.team, pts, a.dunkKind || "DUNK");
  }
  a.dunkT = 0;
  a.dunkKind = "";
  setClip(a, "Crouch_Idle_Loop");
}

/* ------------------------------------------------------------------ *
 *  Ball sim — route-local parabolic + rim/board/floor contacts        *
 * ------------------------------------------------------------------ */
let netPulse = 0;
let rimShake = 0;
const trailHist: Vec3[] = [];

/* ------------------------------------------------------------------ *
 *  Dribble cycle — phase 0 is the palm meeting the ball at the top.    *
 *  Palm and ball ride down together through the push (t<0.35), the    *
 *  palm decelerates and turns around by 0.60 while the ball keeps      *
 *  going to the floor (0.66) with extra downward velocity, then both   *
 *  rise and meet again at t=1 — same hand, every bounce. Heights       *
 *  anchor to the live shoulder so the palm travel (~0.6m) survives     *
 *  any torso posture, and the ball follows gravity-like easing (fast   *
 *  at the floor, slow at the top) between meets.                       *
 * ------------------------------------------------------------------ */
const DRIB_RIDE_END = 0.35;
const DRIB_PALM_TURN = 0.60;
const DRIB_FLOOR_AT = 0.66;
const DRIB_BALL_GAP = 0.11; // palm centroid rides this far above the ball crown
const DRIB_FLOOR_Y = BALL_R + 0.03;
const DRIB_CYCLE_STAND = 0.46;
const DRIB_CYCLE_RUN = 0.34;
const DRIB_SHOULDER_FALLBACK = 1.19; // world shoulder Y before sockets resolve
const dribbleClock = { key: "", phase: 0, moving: false };
let dribbleEvidence: { t: number; palmY: number; ballY: number; moving: boolean } | null = null;

function dribbleCycleY(t: number, shoulderY: number): { palmY: number; ballY: number; effort: number } {
  const top = shoulderY - 0.10;
  const push = Math.max(0.52, shoulderY - 0.64);
  const low = push - 0.05;
  let palmY: number;
  let effort: number;
  if (t < DRIB_RIDE_END) {
    const s = t / DRIB_RIDE_END;
    effort = Math.pow(s, 1.6);
    palmY = lerp(top, push, effort); // palm accelerates down with the ball
  } else if (t < DRIB_PALM_TURN) {
    const s = (t - DRIB_RIDE_END) / (DRIB_PALM_TURN - DRIB_RIDE_END);
    effort = 1 - smoothstep(s);
    palmY = lerp(push, low, 1 - (1 - s) * (1 - s)); // decelerate into the turnaround
  } else {
    const s = (t - DRIB_PALM_TURN) / (1 - DRIB_PALM_TURN);
    effort = 0;
    palmY = lerp(low, top, smoothstep(s)); // rise back to the meet
  }
  let ballY: number;
  if (t < DRIB_RIDE_END) {
    ballY = palmY - DRIB_BALL_GAP; // glued under the riding palm
  } else if (t < DRIB_FLOOR_AT) {
    const s = (t - DRIB_RIDE_END) / (DRIB_FLOOR_AT - DRIB_RIDE_END);
    ballY = lerp(push - DRIB_BALL_GAP, DRIB_FLOOR_Y, Math.pow(s, 1.2)); // thrown down after separation
  } else {
    const s = (t - DRIB_FLOOR_AT) / (1 - DRIB_FLOOR_AT);
    ballY = lerp(DRIB_FLOOR_Y, top - DRIB_BALL_GAP, 1 - Math.pow(1 - s, 1.7)); // gravity rise into the palm
  }
  return { palmY, ballY, effort };
}

function stepBallSim(dt: number): void {
  dribbleHand = null;
  dribbleEvidence = null;
  if (ball.state === "flight" || ball.state === "loose" || ball.state === "pass") {
    const prev: Vec3 = [ball.x, ball.y, ball.z];
    ball.flightT += dt;
    ball.vy += GRAVITY * dt;
    ball.x += ball.vx * dt;
    ball.y += ball.vy * dt;
    ball.z += ball.vz * dt;
    trailHist.push([ball.x, ball.y, ball.z]);
    if (trailHist.length > TRAIL_COUNT) trailHist.shift();

    // Pass catch: reach the receiver
    if (ball.state === "pass" && ball.passTarget >= 0) {
      const recv = athletes[ball.passTarget];
      if (recv) {
        const d = dist2d(ball.x, ball.z, recv.x, recv.z);
        if (d < 0.9 && ball.y < 2.2) {
          recv.hasBall = true;
          ball.state = "held";
          ball.holder = ball.passTarget;
          if (recv.team === "home") switchControl(recv);
          pushEvent("pass", "caught in stride", "info");
          // Lob oop: cutter catching near the rim goes straight up for the slam
          if (recv.cutT > 0 && dist2d(recv.x, recv.z, RIM[0], RIM[2]) < 3.6) {
            startDunk(recv, "LOB OOP");
          }
          return;
        }
      }
    }

    // Rim torus contact
    const dr = dist2d(ball.x, ball.z, RIM[0], RIM[2]);
    if (Math.abs(ball.y - RIM[1]) < 0.16 && dr > RIM_R - 0.09 && dr < RIM_R + 0.11 && !ball.scored) {
      if (!ball.hitRim) { juiceFire("rim", { position: [ball.x, ball.y, ball.z] }); rimShake = 1; }
      ball.hitRim = true;
      // Reflect horizontally off the ring
      const nx = (ball.x - RIM[0]) / (dr || 1);
      const nz = (ball.z - RIM[2]) / (dr || 1);
      const dot = ball.vx * nx + ball.vz * nz;
      ball.vx = (ball.vx - 2 * dot * nx) * 0.55 + (rng() - 0.5) * 0.9;
      ball.vz = (ball.vz - 2 * dot * nz) * 0.55 + (rng() - 0.5) * 0.9;
      ball.vy = ball.vy * 0.6 + 0.7;
      ball.x = RIM[0] + nx * (RIM_R + 0.12);
      ball.z = RIM[2] + nz * (RIM_R + 0.12);
    }

    // Backboard plane contact (z approaching from +z)
    if (prev[2] - BALL_R > BOARD_Z + 0.06 && ball.z - BALL_R <= BOARD_Z + 0.06 &&
      Math.abs(ball.x - RIM[0]) < BOARD_HALF_W && ball.y > BOARD_Y0 && ball.y < BOARD_Y1) {
      if (!ball.hitBoard) juiceFire("bank", { position: [ball.x, ball.y, ball.z] });
      ball.hitBoard = true;
      ball.z = BOARD_Z + 0.06 + BALL_R;
      ball.vz = Math.abs(ball.vz) * 0.5;
      ball.vx *= 0.82;
      ball.vy *= 0.82;
    }

    // Score: crossed rim plane downward inside the cylinder
    if (!ball.scored && prev[1] >= RIM[1] && ball.y < RIM[1] && ball.vy < 0 && dr < RIM_R - 0.05) {
      ball.scored = true;
      const swish = !ball.hitRim && !ball.hitBoard;
      netPulse = 1;
      game_.jam = clamp(game_.jam + (swish ? 0.2 : 0.12), 0, 1);
      if (swish) { juiceFire("swish", { position: [RIM[0], RIM[1] - 0.2, RIM[2]] }); }
      else { cue("swish"); }
      const scorer = athletes[ball.shooter];
      if (scorer) {
        const label = swish ? (ball.shotValue === 2 ? "DEEP TWO · SWISH" : "SWISH") : ball.hitBoard ? "OFF THE GLASS" : "RIM ROLL";
        awardPoints(scorer.team, ball.shotValue, label);
      }
    }

    // Floor bounce → loose
    if (ball.y < BALL_R) {
      ball.y = BALL_R;
      if (Math.abs(ball.vy) > 0.8) {
        ball.vy = Math.abs(ball.vy) * 0.58;
        ball.vx *= 0.78; ball.vz *= 0.78;
        if (!ball.scored && !ball.hitRim && !ball.hitBoard && ball.state === "flight" && ball.flightT > 0.5) {
          juiceFire("brick", { position: [ball.x, ball.y, ball.z] });
        }
        cue("dribble");
      } else {
        ball.vy = 0; ball.vx *= 0.9; ball.vz *= 0.9;
      }
      if (ball.state === "flight" || ball.state === "pass") {
        ball.state = "loose";
        ball.looseT = 0;
        if (!ball.scored) {
          game_.phase = "live"; // board is live — rebound battle on
          pushEvent("ball", ball.blocked ? "blocked shot — loose" : "loose ball", "info");
        }
      }
    }

    // Out of play → dead ball → check
    if (ball.flightT > 4 || Math.abs(ball.x) > 24 || ball.z < -14 || ball.z > 24) {
      enterCheck(game_.servingTeam === "home" ? "away" : "home");
    }
    return;
  }

  if (ball.state === "dunk") {
    const a = athletes[ball.holder];
    if (!a) { ball.state = "loose"; return; }
    a.dunkT += dt;
    const t = clamp(a.dunkT / 0.62, 0, 1);
    // Arc the athlete to the rim
    const sx = a.x, sz = a.z;
    const k = smoothstep(t);
    a.x = lerp(sx, RIM[0], k * dt * 60 * 0.14 + k * 0);
    a.z = lerp(sz, RIM[2] + 0.35, k * dt * 60 * 0.14 + k * 0);
    a.y = Math.sin(t * Math.PI) * 1.15;
    ball.x = a.x; ball.z = a.z;
    ball.y = 1.5 + a.y + Math.sin(t * Math.PI * 0.5) * (RIM[1] - 1.4);
    if (a.dunkKind === "360") a.yaw += dt * 12;
    else if (a.dunkKind === "WINDMILL") a.yaw += dt * 5 * Math.sin(t * Math.PI);
    if (t >= 1) {
      ball.state = "loose";
      ball.x = RIM[0]; ball.y = RIM[1] - 0.15; ball.z = RIM[2];
      ball.vx = 0; ball.vy = -3.2; ball.vz = 0.4;
      ball.scored = true; ball.looseT = 0;
      finishDunk(a);
    }
    return;
  }

  if (ball.state === "held" || ball.state === "dribbleAir" || ball.state === "parked") {
    const h = athletes[ball.holder] ?? holderAthlete();
    if (h && h.hasBall) {
      ball.holder = idxOf(h);
      ball.dribbleT = game_.time;
      const moving = Math.hypot(h.vx, h.vz) > 0.45;
      // One cycle per bounce, phase 0 = palm meets ball at the top. A new
      // holder restarts at the meet so the hand is already on the rock.
      if (dribbleClock.key !== h.nodeId) {
        dribbleClock.key = h.nodeId;
        dribbleClock.phase = 0;
      }
      dribbleClock.moving = moving;
      if (game_.phase === "check") dribbleClock.phase = 0; // dead ball at the check
      else dribbleClock.phase = (dribbleClock.phase + dt / (moving ? DRIB_CYCLE_RUN : DRIB_CYCLE_STAND)) % 1;
      // syncAthlete solves the dribble palm (two-bone IK over the live
      // shoulder) every frame and publishes it through dribbleAims; the ball
      // rides that same cycle, so palm and ball stay phase-locked — never a
      // static hip offset — whether the handler is standing or driving.
      const aim = dribbleAims.get(h.nodeId);
      const cyc = dribbleCycleY(dribbleClock.phase, aim?.shoulderY ?? DRIB_SHOULDER_FALLBACK);
      const prevY = ball.y;
      if (aim) {
        dribbleHand = {
          x: aim.palm[0], y: aim.palm[1], z: aim.palm[2],
          socket: true, forearmValid: true, socketApi: true,
          raw: [aim.palm[0], aim.palm[1], aim.palm[2]], point: [aim.palm[0], aim.palm[1], aim.palm[2]]
        };
        if (h.shooting) {
          ball.x = h.x + Math.sin(h.yaw) * 0.22;
          ball.z = h.z + Math.cos(h.yaw) * 0.22;
          ball.y = 1.65 + h.y + game_.shotMeter.t * 0.35;
        } else if (game_.phase === "check") {
          // Check ball: held between both hands, no bounce before the live phase.
          ball.x = aim.palm[0];
          ball.y = aim.palm[1];
          ball.z = aim.palm[2];
        } else {
          // Contact point tracks the palm solve, nudged outward so the fingers
          // don't clip the ball, and carried slightly with the handler's stride.
          const ox = aim.palm[0] - h.x;
          const oz = aim.palm[2] - h.z;
          const olen = Math.hypot(ox, oz) || 1;
          ball.x = aim.palm[0] + (ox / olen) * 0.045 + h.vx * 0.04;
          ball.z = aim.palm[2] + (oz / olen) * 0.045 + h.vz * 0.04;
          ball.y = cyc.ballY;
        }
      } else {
        // Socket warm-up fallback: still cycle the ball beside the right hand
        // (lead offset forward, faster while moving) instead of parking it.
        const sideX = -0.2;
        const fwd = moving ? 0.34 : 0.28;
        ball.x = h.x + Math.cos(h.yaw) * sideX + Math.sin(h.yaw) * fwd + h.vx * 0.04;
        ball.z = h.z - Math.sin(h.yaw) * sideX + Math.cos(h.yaw) * fwd + h.vz * 0.04;
        ball.y = h.shooting ? 1.65 + h.y + game_.shotMeter.t * 0.35 : cyc.ballY;
        dribbleHand = {
          x: ball.x, y: cyc.palmY, z: ball.z, socket: false, forearmValid: false,
          socketApi: typeof (rigs[ball.holder]?.root as any)?.animation?.socket === "function"
        };
      }
      dribbleEvidence = {
        t: dribbleClock.phase,
        palmY: aim ? aim.palm[1] : cyc.palmY,
        ballY: ball.y,
        moving: dribbleClock.moving
      };
      if (!h.shooting && game_.phase !== "check" && prevY > 0.28 && ball.y <= 0.22) cue("dribble");
    } else {
      dribbleClock.key = "";
    }
  }
}

/* ------------------------------------------------------------------ *
 *  AI                                                                 *
 * ------------------------------------------------------------------ */
function aiMove(a: AthleteState, tx: number, tz: number, dt: number, speed: number): void {
  const d = dist2d(a.x, a.z, tx, tz);
  if (d < 0.45) {
    a.vx = lerp(a.vx, 0, clamp(dt * 12, 0, 1));
    a.vz = lerp(a.vz, 0, clamp(dt * 12, 0, 1));
    if (Math.hypot(a.vx, a.vz) < 0.08) {
      a.vx = 0;
      a.vz = 0;
    }
    const holder = holderAthlete();
    const lookX = holder && holder !== a ? holder.x : RIM[0];
    const lookZ = holder && holder !== a ? holder.z : RIM[2];
    a.yaw = lerpAngle(a.yaw, angTo(a.x, a.z, lookX, lookZ), clamp(dt * 6, 0, 1));
    return;
  }
  const dx = (tx - a.x) / d, dz = (tz - a.z) / d;
  const acc = a.stumble > 0 ? 0.15 : 1;
  a.vx = lerp(a.vx, dx * speed * acc, clamp(dt * 8, 0, 1));
  a.vz = lerp(a.vz, dz * speed * acc, clamp(dt * 8, 0, 1));
  a.yaw = angTo(0, 0, a.vx || dx, a.vz || dz);
}

function stepOffBallWaypoints(a: AthleteState, dt: number, speed: number): void {
  a.aiT -= dt;
  const d = dist2d(a.x, a.z, a.tx, a.tz);
  if (d < 0.48) {
    a.wpPauseT += dt;
    aiMove(a, a.tx, a.tz, dt, speed);
    if (a.wpPauseT >= 2.4) {
      a.wpPauseT = 0;
      pickOffBallWaypoint(a);
    }
    return;
  }
  a.wpPauseT = 0;
  if (a.aiT <= 0) {
    pickOffBallWaypoint(a);
  }
  aiMove(a, a.tx, a.tz, dt, speed);
}

function stepTeammateAI(a: AthleteState, dt: number): void {
  // Home 5v5 AI: discrete waypoint cuts + timed rim cuts + screens
  if (a.cutT > 0) {
    a.cutT -= dt;
    aiMove(a, RIM[0] + (a.index % 2 === 1 ? -0.9 : 0.9), RIM[2] + 1.2, dt, PLAYER_SPEED * 0.92);
    if (a.cutT <= 0) pickOffBallWaypoint(a);
    return;
  }
  if (a.screenT > 0) {
    a.screenT -= dt;
    const holder = holderAthlete();
    const def = holder ? nearestDefender(holder) : undefined;
    if (holder && def) {
      aiMove(a, def.x + Math.sin(holder.yaw) * 0.4, def.z + Math.cos(holder.yaw) * 0.4, dt, PLAYER_SPEED * 0.82);
    }
    if (a.screenT <= 0) pickOffBallWaypoint(a);
    return;
  }
  stepOffBallWaypoints(a, dt, PLAYER_SPEED * 0.82);
}

function stepCpuOffense(a: AthleteState, dt: number): void {
  const diff = DIFFS[game_.diff];
  const squad = game_.awaySquad;
  const speed = PLAYER_SPEED * 0.82 * diff.cpuSpeed * (0.85 + squad.speed * 0.03);
  if (a.hasBall) {
    // CPU ball-handler: drive / pullup / pass
    const dRim = dist2d(a.x, a.z, RIM[0], RIM[2]);
    const def = nearestDefender(a);
    const defD = def ? dist2d(a.x, a.z, def.x, def.z) : 99;
    if (a.shooting) {
      a.meterT += dt / 0.72;
      if (a.meterT >= (0.7 + (rng() - 0.5) * 0.06)) {
        releaseShot(a, 0.8 + rng() * 0.18);
      }
      return;
    }
    a.aiT -= dt;
    if (a.dunkT > 0) return;
    if (dRim < DUNK_RANGE && (a.aiPlan === "drive" || rng() < 0.008)) {
      startDunk(a, "POWER JAM");
      return;
    }
    if (a.aiT <= 0 || dist2d(a.x, a.z, a.tx, a.tz) < 0.5) {
      a.aiT = 1.6 + rng() * 1.4 - diff.react * 0.5;
      const roll = rng();
      if (dRim < 5.6 && (defD > 2.1 || roll < 0.3)) {
        a.aiPlan = "pullup";
        a.shooting = true;
        a.meterT = 0;
        setClip(a, "Load");
        return;
      }
      if (roll < 0.28) {
        // kickout to open 5v5 teammate
        const mates = awayTeam().filter((m) => m !== a);
        const recv = mates[Math.floor(rng() * mates.length)];
        if (recv) throwPass(a, recv);
        return;
      }
      a.aiPlan = "drive";
      a.tx = RIM[0] + (rng() - 0.5) * 2.8;
      a.tz = RIM[2] + 1.3 + rng() * 1.8;
    }
    aiMove(a, a.tx, a.tz, dt, speed);
  } else {
    // Off-ball 5v5 discrete waypoint cuts
    if (a.cutT > 0) {
      a.cutT -= dt;
      aiMove(a, RIM[0] + (a.index % 2 === 1 ? -1 : 1), RIM[2] + 1.4, dt, speed);
      if (a.cutT <= 0) pickOffBallWaypoint(a);
      return;
    }
    stepOffBallWaypoints(a, dt, PLAYER_SPEED * 0.82);
  }
}

function stepCpuDefense(a: AthleteState, dt: number): void {
  const diff = DIFFS[game_.diff];
  const speed = PLAYER_SPEED * 0.82 * diff.cpuSpeed;
  const holder = holderAthlete();
  if (!holder || holder.team !== "home") return;
  const foes = awayTeam().sort((m, n) => dist2d(m.x, m.z, holder.x, holder.z) - dist2d(n.x, n.z, holder.x, holder.z));
  const onBall = foes[0] === a;
  const help = foes[1] === a;
  if (onBall) {
    // Shadow the handler at arm's length between them and rim
    const gap = holder.shooting ? 0.8 : 1.15;
    const dir = angTo(holder.x, holder.z, RIM[0], RIM[2]);
    aiMove(a, holder.x + Math.sin(dir) * gap, holder.z + Math.cos(dir) * gap, dt, speed);
    // Contest a live meter
    if (holder.shooting && defDist(a, holder) < 2.2 && rng() < diff.contest * dt * 3.4) {
      a.jumpT = 0.0001;
      a.vy = 5.4;
      setClip(a, "Contest");
    }
    // Poke steal
    if (!holder.shooting && a.pokeCd <= 0 && defDist(a, holder) < 1.3 && rng() < diff.steal * dt * 4) {
      a.pokeCd = 1.8;
      attemptSteal(a, holder);
    }
  } else if (help) {
    // Collapse on drives or patrol discrete paint help spots
    if (dist2d(holder.x, holder.z, RIM[0], RIM[2]) < 3.4) {
      aiMove(a, holder.x, holder.z, dt, speed);
    } else {
      a.aiT -= dt;
      if (a.aiT <= 0 || dist2d(a.x, a.z, a.tx, a.tz) < 0.48) {
        a.wpPauseT += dt;
        if (a.wpPauseT >= 0.6 || a.aiT <= 0) {
          a.wpPauseT = 0;
          a.aiT = 1.8 + rng() * 1.0;
          const side = a.x <= 0 ? 1.6 : -1.6;
          a.tx = clamp(holder.x * 0.35 + side, -2.4, 2.4);
          a.tz = 2.0 + (rng() * 1.4);
        }
      }
      aiMove(a, a.tx, a.tz, dt, speed);
    }
  } else {
    // Match up with off-ball home player by index using their discrete target
    const mark = homeTeam().find((m) => m.index === a.index && !m.hasBall)
      ?? homeTeam().filter((m) => !m.hasBall).sort((m, n) => dist2d(m.x, m.z, a.x, a.z) - dist2d(n.x, n.z, a.x, a.z))[0];
    if (mark) {
      const wantX = mark.x * 0.88;
      const wantZ = mark.z * 0.88 - 0.65;
      if (dist2d(a.tx, a.tz, wantX, wantZ) > 0.75) {
        a.tx = wantX;
        a.tz = wantZ;
      }
      aiMove(a, a.tx, a.tz, dt, speed);
    }
  }
}

const defDist = (a: AthleteState, b: AthleteState) => dist2d(a.x, a.z, b.x, b.z);

function attemptSteal(def: AthleteState, holder: AthleteState): void {
  const base = def.team === "away" ? 0.34 * DIFFS[game_.diff].contest : 0.42;
  setClip(def, "Punch_Jab");
  def.actionUntil = game_.time + 0.42;
  if (rng() < base) {
    holder.hasBall = false;
    ball.state = "loose";
    ball.holder = -1;
    ball.vx = (rng() - 0.5) * 4 + (def.x - holder.x) * 1.4;
    ball.vz = (rng() - 0.5) * 4 + (def.z - holder.z) * 1.4;
    ball.vy = 2.4;
    ball.x = holder.x; ball.y = 1.0; ball.z = holder.z;
    game_.stealFlash = 0.4;
    juiceFire("steal", { position: [ball.x, 1.0, ball.z] });
    pushEvent("steal", def.team === "home" ? "POKE — BALL LOOSE" : "stripped — cpu steals it", def.team === "home" ? "success" : "warning");
    if (def.team === "home") game_.jam = clamp(game_.jam + 0.1, 0, 1);
  } else {
    pushEvent("steal", "poke whiffed", "info");
  }
}

/* ------------------------------------------------------------------ *
 *  Player control + Smart Autopilot                                   *
 * ------------------------------------------------------------------ */
function controlledAthlete(): AthleteState | undefined {
  const home = homeTeam();
  return home.find((a) => a.controlled) ?? home[0];
}
function switchControl(a: AthleteState): void {
  homeTeam().forEach((m) => (m.controlled = m === a));
}

function throwPass(a: AthleteState, recv: AthleteState): void {
  a.hasBall = false;
  const from: Vec3 = [a.x, 1.5, a.z];
  const to: Vec3 = [recv.x, 1.6, recv.z];
  const d = dist2d(from[0], from[2], to[0], to[2]);
  const t = clamp(d / 11, 0.22, 0.7);
  Object.assign(ball, {
    state: "pass" as BallState, x: from[0], y: from[1], z: from[2],
    vx: (to[0] - from[0]) / t, vy: (to[1] - from[1]) / t + 0.9, vz: (to[2] - from[2]) / t,
    holder: -1, passTarget: idxOf(recv), flightT: 0
  });
  juiceFire("pass", {});
  pushEvent("pass", `dime → ${recv.nodeId.toUpperCase()}`, "info");
}

function stepPlayerAutopilot(me: AthleteState, dt: number): void {
  // Smart autopilot demo play when user is idle — yields immediately on any manual input
  if (me.dunkT > 0 || me.stumble > 0) return;
  if (game_.shotMeter.active && me.shooting) {
    me.vx = lerp(me.vx, 0, dt * 10);
    me.vz = lerp(me.vz, 0, dt * 10);
    if (game_.shotMeter.frames > 3 && game_.shotMeter.t >= game_.shotMeter.perfect - 0.015) {
      releaseShot(me, 0.96);
    }
    return;
  }
  if (ball.state === "loose" && game_.phase === "live") {
    aiMove(me, ball.x, ball.z, dt, PLAYER_SPEED * 0.95);
    if (dist2d(me.x, me.z, ball.x, ball.z) < 1.3 && ball.y < 2.3) grabLooseBall(me);
    return;
  }
  if (game_.mode === "handleslab") {
    const nextIdx = game_.cones.order[game_.cones.next];
    if (nextIdx !== undefined) {
      const c = CONE_SPOTS[nextIdx]!;
      aiMove(me, c[0], c[2], dt, PLAYER_SPEED * 0.92);
    }
    return;
  }
  if (me.hasBall && (game_.possession === "home" || game_.mode === "dunklab")) {
    if (game_.mustClear) {
      aiMove(me, me.x * 0.8, ARC_R + 1.4, dt, PLAYER_SPEED * 0.92);
      return;
    }
    const dRim = dist2d(me.x, me.z, RIM[0], RIM[2]);
    if (dRim < DUNK_RANGE) {
      startDunk(me, "auto");
      return;
    }
    me.aiT -= dt;
    if (me.aiT <= 0) {
      me.aiT = 1.3 + rng() * 1.6;
      const roll = rng();
      if (game_.mode !== "dunklab" && roll < 0.28) {
        const mates = homeTeam().filter((m) => m !== me);
        const recv = mates[Math.floor(rng() * mates.length)];
        if (recv) { throwPass(me, recv); return; }
      }
      if (game_.mode !== "dunklab" && dRim < 6.4 && roll < 0.58) {
        openMeter(me);
        return;
      }
      if (game_.mode !== "dunklab" && roll < 0.8) {
        // Handles on display: stand and pound the rock so the standing dribble
        // cycle reads before the next drive to the rim (autoplay evidence).
        me.aiPlan = "stand";
        me.tx = me.x;
        me.tz = me.z;
        me.aiT = 2.2 + rng() * 1.0;
      } else {
        me.aiPlan = "drive";
        me.tx = RIM[0] + (rng() - 0.5) * 2.0;
        me.tz = RIM[2] + 1.0 + rng() * 1.1;
      }
    }
    aiMove(me, me.tx || RIM[0], me.tz || (RIM[2] + 1.3), dt, me.aiPlan === "stand" ? 0.4 : PLAYER_SPEED * 0.88);
  } else if (game_.possession === "away") {
    const holder = holderAthlete();
    if (holder) {
      const dir = angTo(holder.x, holder.z, RIM[0], RIM[2]);
      aiMove(me, holder.x + Math.sin(dir) * 1.15, holder.z + Math.cos(dir) * 1.15, dt, PLAYER_SPEED * 0.86);
    }
  }
}

function stepPlayerControl(dt: number): void {
  const me = controlledAthlete();
  if (!me) return;
  const onOffense = game_.possession === "home" && me.hasBall;
  const inLab = game_.mode === "dunklab" || game_.mode === "handleslab";

  const mx = inputCtl.axis("moveX") + ((held("right", "KeyD", "ArrowRight") ? 1 : 0) - (held("left", "KeyA", "ArrowLeft") ? 1 : 0));
  const mz = inputCtl.axis("moveZ") + ((held("down", "KeyS", "ArrowDown") ? 1 : 0) - (held("up", "KeyW", "ArrowUp") ? 1 : 0));
  const moveMag = Math.hypot(mx, mz);
  const anyManual =
    moveMag > 0.05 ||
    pressed("shoot", "Space", "Enter") ||
    pressed("pass", "KeyE") ||
    pressed("cross", "KeyJ") ||
    pressed("hesi", "KeyK") ||
    held("shoot", "Space", "Enter");

  if (anyManual) {
    lastManualInputAt = game_.time;
  }

  if (game_.autopilot && !anyManual && (game_.time - lastManualInputAt >= 2.2)) {
    stepPlayerAutopilot(me, dt);
    return;
  }

  const sprint = held("sprint", "ShiftLeft", "ShiftRight") || moveMag > 0.85;
  const spd = (sprint ? SPRINT_SPEED : PLAYER_SPEED) * (me.hasBall ? 0.94 : 1);

  if (me.dunkT > 0 || me.stumble > 0) {
    // locked in an animation
  } else if (game_.shotMeter.active && me.shooting) {
    // Rooted while the meter runs
    me.vx = lerp(me.vx, 0, dt * 10);
    me.vz = lerp(me.vz, 0, dt * 10);
  } else if (moveMag > 0.05) {
    const len = moveMag || 1;
    const cx = clamp(mx / len, -1, 1), cz = clamp(mz / len, -1, 1);
    me.vx = lerp(me.vx, cx * spd, clamp(dt * 11, 0, 1));
    me.vz = lerp(me.vz, cz * spd, clamp(dt * 11, 0, 1));
    if (Math.hypot(me.vx, me.vz) > 0.35) me.yaw = angTo(0, 0, me.vx, me.vz);
  } else {
    me.vx = lerp(me.vx, 0, clamp(dt * 10, 0, 1));
    me.vz = lerp(me.vz, 0, clamp(dt * 10, 0, 1));
    if (Math.hypot(me.vx, me.vz) < 0.08) { me.vx = 0; me.vz = 0; }
    if (me.hasBall) me.yaw = lerpAngle(me.yaw, angTo(me.x, me.z, RIM[0], RIM[2]), clamp(dt * 4, 0, 1));
  }

  // Ankle-breaker / hesi timing taps (offense w/ ball)
  if (onOffense && me.dunkT <= 0) {
    if (pressed("cross", "KeyJ")) {
      if (game_.jamFull && dist2d(me.x, me.z, RIM[0], RIM[2]) < DUNK_RANGE + 0.6) {
        startDunk(me, "WINDMILL");
      } else {
        const def = nearestDefender(me);
        const d = def ? defDist(me, def) : 99;
        // crossover burst sideways
        const lat = me.yaw + Math.PI / 2;
        me.vx += Math.sin(lat) * 4.6; me.vz += Math.cos(lat) * 4.6;
        juiceFire("juke", { position: [me.x, 1, me.z] });
        setClip(me, "Attack", 1.45);
        me.actionUntil = game_.time + 0.42;
        if (def && d < 1.7 && rng() < 0.6) {
          def.stumble = 0.9;
          showBanner("ANKLE BREAKER");
          pushEvent("juke", "cross — defender stumbled", "success");
          game_.jam = clamp(game_.jam + 0.05, 0, 1);
        } else pushEvent("juke", "crossover", "info");
      }
    }
    if (pressed("hesi", "KeyK")) {
      if (game_.jamFull && dist2d(me.x, me.z, RIM[0], RIM[2]) < DUNK_RANGE + 0.6) {
        startDunk(me, "360");
      } else {
        me.vx *= 0.12; me.vz *= 0.12;
        const def = nearestDefender(me);
        if (def && defDist(me, def) < 1.9 && rng() < 0.45) {
          def.stumble = 0.7;
          def.vz -= 2.6;
          showBanner("HESI PULL-UP WINDOW");
          pushEvent("juke", "hesi — defender froze", "success");
          game_.jam = clamp(game_.jam + 0.04, 0, 1);
        } else pushEvent("juke", "hesitation", "info");
        juiceFire("juke", { position: [me.x, 1, me.z] });
      }
    }
    if (pressed("pass", "KeyE")) {
      if (game_.jamFull && dist2d(me.x, me.z, RIM[0], RIM[2]) < DUNK_RANGE + 1.2) {
        // Lob oop: find cutting teammate nearest rim
        const mate = homeTeam().filter((m) => m !== me).sort((x, y) => dist2d(x.x, x.z, RIM[0], RIM[2]) - dist2d(y.x, y.z, RIM[0], RIM[2]))[0];
        if (mate) {
          mate.cutT = 1.2;
          throwPass(me, mate);
          showBanner("LOB — GO GET IT");
        }
      } else {
        const mates = homeTeam().filter((m) => m !== me).sort((x, y) => dist2d(x.x, x.z, me.x, me.z) - dist2d(y.x, y.z, me.x, me.z));
        const recv = mates[0];
        if (recv) { closeMeter(); me.shooting = false; throwPass(me, recv); }
      }
    }
    // Shoot: press-hold-release meter OR rim-run dunk
    if (pressed("shoot", "Space", "Enter")) {
      const dRim = dist2d(me.x, me.z, RIM[0], RIM[2]);
      const driving = dRim < DUNK_RANGE && Math.hypot(me.vx, me.vz) > 1.4 && (me.vz < 0 || dRim < 1.4);
      if (driving || (game_.jamFull && dRim < DUNK_RANGE)) {
        startDunk(me, "auto");
      } else if (!game_.shotMeter.active) {
        openMeter(me);
      }
    }
  } else if (me.hasBall && inLab) {
    // Labs: same shot/dunk surface
    if (pressed("shoot", "Space", "Enter")) {
      const dRim = dist2d(me.x, me.z, RIM[0], RIM[2]);
      if (dRim < DUNK_RANGE + 0.4) {
        const kind = game_.mode === "dunklab" ? DUNK_PACKAGES[Math.floor(rng() * 3)] : "auto";
        startDunk(me, kind);
      } else if (!game_.shotMeter.active) openMeter(me);
    }
    if (pressed("cross", "KeyJ") && game_.mode === "handleslab") handlesJuke(me, "cross");
    if (pressed("hesi", "KeyK") && game_.mode === "handleslab") handlesJuke(me, "hesi");
  } else if (game_.possession === "away") {
    // Defense: switch player / jump contest / poke
    if (pressed("pass", "KeyE")) {
      const holder = holderAthlete();
      const mates = homeTeam().filter((m) => m !== me).sort((x, y) => {
        const hd = holder ? 1 : 0;
        return (dist2d(x.x, x.z, holder?.x ?? 0, holder?.z ?? 8) - dist2d(y.x, y.z, holder?.x ?? 0, holder?.z ?? 8)) * hd;
      });
      if (mates[0]) { switchControl(mates[0]); pushEvent("defense", "switched defender", "info"); }
    }
    if (pressed("shoot", "Space", "Enter") && me.jumpT <= 0) {
      me.jumpT = 0.0001;
      me.vy = 5.6;
      setClip(me, "Contest", 1.35);
      pushEvent("defense", "block attempt", "info");
    }
    if (pressed("hesi", "KeyK") || pressed("cross", "KeyJ")) {
      const holder = holderAthlete();
      if (holder && holder.team === "away" && me.pokeCd <= 0 && defDist(me, holder) < 1.35) {
        me.pokeCd = 1.6;
        attemptSteal(me, holder);
      }
    }
  }

  // Meter release — supports both hold-and-release and quick tap of Space
  if (game_.shotMeter.active && me.shooting) {
    const shootHeld = held("shoot", "Space", "Enter");
    if (!shootHeld && game_.shotMeter.frames > 1) {
      if (game_.shotMeter.t < 0.48) {
        // Quick tap: let the jumper rise to the release window then fire automatically
        game_.shotMeter.tapRelease = true;
      } else {
        const t = game_.shotMeter.t;
        const c = game_.shotMeter.perfect;
        const hw = (game_.shotMeter.g1 - game_.shotMeter.g0) / 2;
        const q = clamp(1 - Math.abs(t - c) / Math.max(hw * 2.2, 0.001), 0, 1);
        releaseShot(me, q);
      }
    }
    if (game_.shotMeter.tapRelease && game_.shotMeter.t >= game_.shotMeter.perfect - 0.02) {
      releaseShot(me, 0.94);
    }
  }

  // Rebound grab (loose ball, any live phase)
  if (ball.state === "loose" && game_.phase === "live") {
    const d3 = Math.hypot(ball.x - me.x, ball.z - me.z);
    if (d3 < 1.35 && ball.y < 2.3 && pressed("shoot", "Space", "Enter")) {
      grabLooseBall(me);
    }
  }
}

function grabLooseBall(a: AthleteState): void {
  ball.state = "held";
  ball.holder = idxOf(a);
  a.hasBall = true;
  ball.vx = 0; ball.vy = 0; ball.vz = 0;
  if (a.team === "home") {
    switchControl(a);
    if (game_.possession === "away") {
      game_.possession = "home";
      game_.mustClear = true;
      showBanner("TAKE IT BACK PAST THE ARC");
      pushEvent("rebound", "defensive board — clear it", "success");
      game_.jam = clamp(game_.jam + 0.08, 0, 1);
    } else {
      pushEvent("rebound", "offensive rebound — put it back", "success");
    }
  } else {
    if (game_.possession === "home") {
      game_.possession = "away";
      game_.mustClear = true;
      showBanner("CPU BALL — TAKE-BACK");
      pushEvent("rebound", "cpu board — their rock", "warning");
    }
  }
  a.aiPlan = "drive";
  a.tx = a.x * 1.4; a.tz = 9.0; // clearance dribble target for CPU
}

/* ------------------------------------------------------------------ *
 *  Handles Lab — cone slalom                                          *
 * ------------------------------------------------------------------ */
const CONE_SPOTS: Vec3[] = [
  [-4.4, 0, 8.8], [-1.4, 0, 7.4], [1.6, 0, 8.9], [4.4, 0, 7.2], [2.2, 0, 5.6],
  [-1.8, 0, 5.2], [-4.6, 0, 3.4], [-1.0, 0, 2.2], [2.6, 0, 3.2], [0, 0, 1.2]
];

function setupCones(): void {
  game_.cones = { active: true, order: CONE_SPOTS.map((_, i) => i), next: 0, cleared: 0, streak: 0, score: 0, best: game_.cones.best };
}

function handlesJuke(me: AthleteState, kind: "cross" | "hesi"): void {
  // Style bonus when juking next to a live cone
  const nextIdx = game_.cones.order[game_.cones.next];
  if (nextIdx === undefined) return;
  const c = CONE_SPOTS[nextIdx]!;
  if (dist2d(me.x, me.z, c[0], c[2]) < 1.7) {
    game_.cones.score += 1;
    game_.lab.style += 1;
    pushEvent("lab", kind === "cross" ? "clean cross at the cone" : "hesi freeze at the cone", "success");
    juiceFire("gate", { position: [c[0], 0.4, c[2]] });
  }
}

function stepHandlesLab(me: AthleteState): void {
  const st = game_.cones;
  if (!st.active || st.next >= st.order.length) return;
  const ci = st.order[st.next]!;
  const c = CONE_SPOTS[ci]!;
  if (dist2d(me.x, me.z, c[0], c[2]) < 0.85) {
    st.next += 1;
    st.cleared += 1;
    st.streak += 1;
    st.score += 1;
    st.best = Math.max(st.best, st.streak);
    juiceFire("gate", { position: [c[0], 0.4, c[2]] });
    pushEvent("lab", `gate ${st.cleared}/${CONE_COUNT}`, "success");
    if (st.next >= st.order.length) {
      // Course reset — mirrored for variety
      st.order = [...st.order].reverse();
      st.next = 0;
      showBanner("COURSE FLIPPED — RUN IT BACK");
      cue("fanfare");
    }
  }
}

function resetLabBall(): void {
  const me = controlledAthlete() ?? homeTeam()[0]!;
  me.x = 0; me.z = 7.2; me.vx = 0; me.vz = 0; me.hasBall = true;
  ball.state = "held"; ball.holder = idxOf(me); ball.scored = false; ball.hitRim = false; ball.hitBoard = false; ball.blocked = false;
  if (game_.mode === "dunklab") {
    game_.jam = 1; game_.jamFull = true;
    jamWrap?.classList.add("full");
    showPrompt("SPACE — RIM RUN · J/K/E — PACKAGES", 2.2);
  }
}

/* ------------------------------------------------------------------ *
 *  Per-frame athlete rig sync                                         *
 * ------------------------------------------------------------------ */
function syncAthlete(a: AthleteState, dt: number): void {
  const r = rigs[idxOf(a)];
  if (!r?.root) return;
  const labHidden = (game_.mode === "dunklab" || game_.mode === "handleslab") && (a.team === "away" || a.index > 0);
  r.root.setVisible(!labHidden);
  if (labHidden) {
    r.shadow?.setVisible(false);
    r.ring?.setVisible(false);
    r.aura?.setVisible(false);
    return;
  }
  // Integrate position
  a.x = clamp(a.x + a.vx * dt, -COURT_X - 1.4, COURT_X + 1.4);
  a.z = clamp(a.z + a.vz * dt, COURT_Z0 - 2.4, COURT_Z1 + 2.6);
  if (a.stumble > 0) a.stumble -= dt;
  if (a.pokeCd > 0) a.pokeCd -= dt;

  // Jump physics
  if (a.jumpT > 0 || a.vy !== 0) {
    a.jumpT += dt;
    a.vy += GRAVITY * dt;
    a.y = Math.max(0, a.y + a.vy * dt);
    if (a.y <= 0 && a.vy < 0) {
      a.y = 0;
      a.vy = 0;
      a.jumpT = 0;
      if (a.clip === "Contest" || a.clip === "Jump_Loop" || a.clip === "Shoot") {
        setClip(a, a.hasBall ? "Crouch_Idle_Loop" : "Ready", 1.0);
      }
    }
  }

  // Deterministic action clip completion (Release -> FollowThrough -> locomotion)
  if (a.actionUntil > 0 && game_.time >= a.actionUntil) {
    if (a.clip === "Release") {
      setClip(a, "FollowThrough", 1.25);
      a.actionUntil = game_.time + 0.28;
    } else {
      a.actionUntil = 0;
      a.clipSince = -10;
    }
  }

  const speed = Math.hypot(a.vx, a.vz);
  const bob = 0;

  // Ground the 1.92m Meshy athlete model (centered at origin, H*0.5 = 0.96) so sneakers sit at y=0
  r.root.setPosition(a.x, 0.96 + a.y + bob, a.z).setRotation(0, a.yaw, 0);

  // Clip selection with hysteresis when nothing explicit is playing
  if (!a.shooting && a.dunkT <= 0 && a.jumpT <= 0 && a.stumble <= 0 && a.actionUntil <= 0) {
    const idleClip = a.hasBall ? "Crouch_Idle_Loop" : "Ready";
    if (speed > 5.2 || (a.clip === "Sprint_Loop" && speed > 4.6)) {
      setClip(a, "Sprint_Loop", 1.35);
    } else if (speed > 0.85 || ((a.clip === "Run" || a.clip === "Sprint_Loop") && speed > 0.65)) {
      setClip(a, "Run", 1.2);
    } else if (speed > 0.35 || ((a.clip === "Walk_Loop" || a.clip === "Run") && speed >= 0.20)) {
      setClip(a, "Walk_Loop", 1.1);
    } else {
      setClip(a, idleClip, 1.0);
    }
  }
  if (a.stumble > 0) setClip(a, "Crouch_Idle_Loop", 1.2);

  // Stationary athletes get a deliberate full-body stance with procedural arms.
  // The rig's Idle/Ready clips carry no arm keys, so letting those clips own a
  // standing player leaves both arms in the A-pose bind (mannequin hands). A
  // live pose suppresses clip dispatch entirely, so the stance specifies every
  // major bone instead of inheriting the last clip frame.
  const stanceNow = speed < 0.35 && !a.shooting && a.dunkT <= 0 && a.jumpT <= 0 &&
    a.stumble <= 0 && a.actionUntil <= 0;
  const holdsBall = a.hasBall && ball.holder === idxOf(a);
  const dribbleNow = stanceNow && holdsBall;
  const checkHold = dribbleNow && game_.phase === "check";
  // A moving handler keeps the locomotion clip (legs own the stride) and gets
  // an OVERLAY pose that writes only the arm bones plus a mild lean after the
  // clip evaluates, so the dribble reads while driving — not just standing.
  const carryNow = !stanceNow && holdsBall && !a.shooting && a.dunkT <= 0 &&
    a.jumpT <= 0 && a.stumble <= 0 && a.actionUntil <= 0;
  // `animation` is the engine's C-37 runtime extension on model-node handles.
  const anim = (r.root as any).animation;
  const facts = armRigFor(a.nodeId, r.root);
  const chest = anim?.socket?.("Chest");
  const upperR = anim?.socket?.("RightUpperArm");
  const upperL = anim?.socket?.("LeftUpperArm");
  const socketsUp = chest?.valid === true && upperR?.valid === true && upperL?.valid === true;
  const cycleT = dribbleClock.key === a.nodeId ? dribbleClock.phase : 0;
  const shoulderOf = (upper: { worldMatrix(out?: Float32Array): ArrayLike<number> }): Vec3 =>
    mat4Translation(upper.worldMatrix());
  let aimed: DribbleAim | undefined;
  if (stanceNow) {
    const bones: Record<string, { rotation?: Quat; position?: { x: number; y: number; z: number } }> = stanceLegs();
    const shoulderR = upperR ? shoulderOf(upperR) : undefined;
    const shoulderL = upperL ? shoulderOf(upperL) : undefined;
    const shoulderY = shoulderR ? shoulderR[1] + 0.96 + a.y : DRIB_SHOULDER_FALLBACK;
    // Phase-coupled cycle — the same dribbleCycleY that positions the ball in
    // stepBallSim drives the palm here, so hand and ball ride as one.
    const cyc = dribbleCycleY(cycleT, shoulderY);
    if (dribbleNow) {
      // Lean over the ball; the torso dips hard into each push because the arm
      // alone cannot reach the low bounce (arm 0.56m from a ~1.2m shoulder).
      const effort = checkHold ? 0 : cyc.effort;
      bones.Spine = { rotation: qX(checkHold ? 0.16 : 0.20 + 0.30 * effort) };
      bones.Chest = { rotation: qX(checkHold ? 0.10 : 0.12 + 0.20 * effort) };
      bones.Head = { rotation: qX(-0.22) };
    }
    if (socketsUp && shoulderR && shoulderL) {
      const chestRot = qFromMat4(chest!.worldMatrix());
      // Palm targets live in the same actor-local frame as the bones (local +x
      // is the character's left, +z is forward). The dribbling palm travels
      // down with the bounce so the hand pushes the ball to the floor and
      // rises with it, instead of hanging at the hip while the ball bounces.
      const palmR: Vec3 = checkHold
        ? [shoulderR[0] - 0.06, shoulderR[1] - 0.46, shoulderR[2] + 0.20]
        : dribbleNow
          ? [shoulderR[0] - 0.06, cyc.palmY - 0.96 - a.y, shoulderR[2] + 0.27]
          : [shoulderR[0] + 0.02, shoulderR[1] - 0.46, shoulderR[2] + 0.04];
      const palmL: Vec3 = checkHold
        ? [shoulderL[0] - 0.04, shoulderL[1] - 0.42, shoulderL[2] + 0.10]
        : dribbleNow
          ? [shoulderL[0] - 0.04, shoulderL[1] - 0.34, shoulderL[2] + 0.16]
          : [shoulderL[0] - 0.02, shoulderL[1] - 0.46, shoulderL[2] + 0.04];
      // Dribbling elbow stays tucked into the ribs and drives down with the
      // pound; idle arms hang close so nobody reads as a stiff A-pose.
      const flare = dribbleNow ? 0.22 : 0.18;
      const rightArm = armIK(chestRot, shoulderR, palmR, facts.upperLenR, facts.foreLenR, facts.upperDirR, facts.foreDirR,
        [-flare, -1, dribbleNow ? 0.06 : 0]);
      const leftArm = armIK(chestRot, shoulderL, palmL, facts.upperLenL, facts.foreLenL, facts.upperDirL, facts.foreDirL,
        [flare, -1, 0]);
      bones.RightUpperArm = { rotation: rightArm.upperLocal };
      bones.RightForearm = { rotation: rightArm.foreLocal };
      bones.LeftUpperArm = { rotation: leftArm.upperLocal };
      bones.LeftForearm = { rotation: leftArm.foreLocal };
      if (dribbleNow) {
        const cy = Math.cos(a.yaw);
        const sn = Math.sin(a.yaw);
        // At the check the ball sits on the right hip, outside the palm so the
        // 3/4 camera can see it; live it tracks that palm through the bounce.
        const aimPalm: Vec3 = checkHold
          ? [palmR[0] - 0.05, palmR[1] + 0.04, palmR[2] + 0.02]
          : palmR;
        aimed = {
          palm: [
            a.x + cy * aimPalm[0] + sn * aimPalm[2],
            0.96 + a.y + aimPalm[1],
            a.z - sn * aimPalm[0] + cy * aimPalm[2]
          ],
          shoulderY,
          t: cycleT,
          moving: false
        };
      }
    } else {
      bones.RightUpperArm = { rotation: { x: -0.089, y: -0.066, z: -0.041, w: 0.993 } };
      bones.RightForearm = { rotation: qX(-0.122) };
      bones.LeftUpperArm = { rotation: { x: -0.089, y: 0.066, z: 0.041, w: 0.993 } };
      bones.LeftForearm = { rotation: qX(-0.122) };
    }
    r.root.setAnimationPose({ bones });
    livePoseOn.add(a.nodeId);
  } else if (carryNow && socketsUp) {
    // Moving handler: overlay on top of the Run/Walk/Sprint clip. Only the
    // arms (and a mild spine/chest lean over the ball) are named, so the clip
    // keeps owning the legs and everything else.
    const shoulderR = shoulderOf(upperR!);
    const shoulderL = shoulderOf(upperL!);
    const shoulderY = shoulderR[1] + 0.96 + a.y;
    const cyc = dribbleCycleY(cycleT, shoulderY);
    const bones: Record<string, { rotation?: Quat; position?: { x: number; y: number; z: number } }> = {
      Spine: { rotation: qX(0.10 + 0.10 * cyc.effort) },
      Chest: { rotation: qX(0.06 + 0.08 * cyc.effort) }
    };
    // The contact point leads the handler in the movement direction (yaw
    // tracks velocity); the off hand guards near the body instead of mirroring.
    const palmR: Vec3 = [shoulderR[0] - 0.06, cyc.palmY - 0.96 - a.y, shoulderR[2] + 0.36];
    const palmL: Vec3 = [shoulderL[0] + 0.04, shoulderL[1] - 0.30, shoulderL[2] + 0.22];
    const chestRot = qFromMat4(chest!.worldMatrix());
    const rightArm = armIK(chestRot, shoulderR, palmR, facts.upperLenR, facts.foreLenR, facts.upperDirR, facts.foreDirR,
      [-0.22, -1, 0.06]);
    const leftArm = armIK(chestRot, shoulderL, palmL, facts.upperLenL, facts.foreLenL, facts.upperDirL, facts.foreDirL,
      [0.18, -1, 0]);
    bones.RightUpperArm = { rotation: rightArm.upperLocal };
    bones.RightForearm = { rotation: rightArm.foreLocal };
    bones.LeftUpperArm = { rotation: leftArm.upperLocal };
    bones.LeftForearm = { rotation: leftArm.foreLocal };
    r.root.setAnimationPose({ bones, mode: "overlay" });
    overlayPoseOn.add(a.nodeId);
    const cy = Math.cos(a.yaw);
    const sn = Math.sin(a.yaw);
    aimed = {
      palm: [
        a.x + cy * palmR[0] + sn * palmR[2],
        0.96 + a.y + palmR[1],
        a.z - sn * palmR[0] + cy * palmR[2]
      ],
      shoulderY,
      t: cycleT,
      moving: true
    };
  } else if (livePoseOn.delete(a.nodeId) || overlayPoseOn.delete(a.nodeId)) {
    // Shooting, dunking, jumping, stumbling, or losing the ball: clear any
    // pose (replace or overlay) so those animations play unchanged.
    r.root.setAnimationPose(undefined);
  }
  if (aimed) {
    dribblePoseOn.add(a.nodeId);
    dribbleAims.set(a.nodeId, aimed);
  } else {
    dribblePoseOn.delete(a.nodeId);
    dribbleAims.delete(a.nodeId);
  }

  // Ground rings & shadow
  r.shadow?.setPosition(a.x, 0.012, a.z).setScale([1 - a.y * 0.14, 1, 1 - a.y * 0.14]).setVisible(true);
  const ringS = a.controlled ? 1.06 : a.hasBall ? 1.0 : 0.82;
  r.ring?.setPosition(a.x, 0.018, a.z).setScale([ringS, ringS, ringS]).setVisible(true);
  // Jam aura
  const auraOn = game_.jamFull && a.team === "home" && a.hasBall;
  r.aura?.setPosition(a.x, a.y + 0.95, a.z).setScale(auraOn ? [0.9, 1.9, 0.9] : HIDDEN).setVisible(auraOn);
}

/* ------------------------------------------------------------------ *
 *  Frame update — phases, sim, HUD, camera, evidence                  *
 * ------------------------------------------------------------------ */
const cam = {
  mode: "broadcast" as "menu" | "broadcast" | "celebrate" | "lab",
  eye: [0, 9.2, 17.4] as Vec3,
  target: [0, 1.4, 2.4] as Vec3,
  fov: 34,
  orbit: 0,
  punch: 0
};

function updateCamera(dt: number): void {
  const holder = holderAthlete();
  cam.orbit += dt * 0.11;
  let want: { eye: Vec3; target: Vec3; fov: number };
  if (game_.phase === "menu") {
    const r = 17;
    want = {
      eye: [Math.sin(cam.orbit) * r, 8.6 + Math.sin(cam.orbit * 0.6) * 1.6, 4 + Math.cos(cam.orbit) * r],
      target: [0, 1.6, 2.5],
      fov: 30
    };
  } else if (game_.phase === "gameover") {
    const w = homeTeam()[0]!;
    want = {
      eye: [w.x + Math.sin(cam.orbit * 2.4) * 6.6, 2.8, w.z + Math.cos(cam.orbit * 2.4) * 6.6],
      target: [w.x, 1.3, w.z],
      fov: 26
    };
  } else {
    // Strong 3/4 sideline chase. A camera parked directly behind the handler
    // sits on the same line as the ball (the handler holds it out in front),
    // so the hand and ball collapse onto the same screen pixels. Swinging the
    // eye well to the handler's right separates the near-side palm and ball
    // in profile. During a shot the ball becomes the focus so the flight stays
    // framed instead of leaving the tighter view.
    const shotNow = game_.phase === "shot" || game_.phase === "score";
    if (shotNow) {
      want = {
        eye: [ball.x + 7.6, 4.9 + cam.punch * 0.2, ball.z + 5.2],
        target: [ball.x - 0.2, Math.max(1.5, ball.y), ball.z - 0.8],
        fov: 44 + cam.punch
      };
    } else {
      const hx = holder?.x ?? ball.x;
      const hz = Math.max(holder?.z ?? ball.z, ball.z);
      want = {
        eye: [hx + 5.6, 3.0, hz + 4.2],
        target: [hx - 0.2, 1.1, hz - 0.9],
        fov: 38 + cam.punch
      };
    }
  }
  const k = 1 - Math.pow(0.02, dt);
  cam.eye = [lerp(cam.eye[0], want.eye[0], k), lerp(cam.eye[1], want.eye[1], k), lerp(cam.eye[2], want.eye[2], k)];
  cam.target = [lerp(cam.target[0], want.target[0], k), lerp(cam.target[1], want.target[1], k), lerp(cam.target[2], want.target[2], k)];
  cam.fov = lerp(cam.fov, want.fov, k);
  cam.punch = lerp(cam.punch, 0, 1 - Math.pow(0.05, dt));
  try { (auraApp as any).camera?.setPose?.({ position: cam.eye, target: cam.target, fov: cam.fov }); } catch { /* camera ext optional */ }
}

function syncHud(): void {
  if (hudHomeName) hudHomeName.textContent = game_.homeSquad.short;
  if (hudAwayName) hudAwayName.textContent = game_.mode === "dunklab" || game_.mode === "handleslab" ? "LAB" : game_.awaySquad.short;
  if (hudHomeScore) hudHomeScore.textContent = `${game_.scoreHome}`;
  if (hudAwayScore) hudAwayScore.textContent = (game_.mode === "dunklab" || game_.mode === "handleslab") ? "—" : `${game_.scoreAway}`;
  if (hudHomePoss) hudHomePoss.textContent = game_.possession === "home" ? "● BALL" : "";
  if (hudAwayPoss) hudAwayPoss.textContent = game_.possession === "away" ? "● BALL" : "";
  if (hudTarget) hudTarget.textContent = game_.mode === "dunklab" ? "FREE RUN" : game_.mode === "handleslab" ? "CONE DRILL" : `FIRST TO ${game_.target}`;
  if (hudClock) {
    const mm = Math.floor(game_.matchT / 60);
    const ss = Math.floor(game_.matchT % 60).toString().padStart(2, "0");
    hudClock.textContent = game_.phase === "check" ? "CHECK" : game_.phase === "shot" ? "SHOT" : game_.phase === "score" ? "BUCKET" : game_.phase === "gameover" ? "FINAL" : game_.phase === "menu" ? "STREET" : `${mm}:${ss}`;
  }
  if (hudVenue) hudVenue.textContent = venue.label;
  if (hudCourtChip?.firstChild) hudCourtChip.firstChild.textContent = `${venue.label}`;
  if (hudLookChip) hudLookChip.textContent = venue.lookLabel;
  if (jamFill) jamFill.style.width = `${Math.round(game_.jam * 100)}%`;
  const jamNowFull = game_.jam >= 1;
  if (jamNowFull !== game_.jamFull) {
    game_.jamFull = jamNowFull;
    jamWrap?.classList.toggle("full", jamNowFull);
    if (jamNowFull) { flashJam(); cue("fireIgnite"); showBanner("JAM METER FULL"); pushEvent("jam", "jam meter loaded — attack the rim", "success"); }
  }
  if (hudTourChip) hudTourChip.style.display = game_.mode === "tour" ? "" : "none";
  if (hudTourRound && game_.mode === "tour") {
    hudTourRound.textContent = game_.tour.champion ? "CHAMPION" : game_.tour.eliminated ? "ELIMINATED" : `ROUND OF ${[32, 16, 8, 4, 2][game_.tour.round] ?? 2}`;
  }
  const labActive = game_.mode === "dunklab" || game_.mode === "handleslab";
  if (hudLabChip) hudLabChip.style.display = labActive ? "" : "none";
  if (hudLabLine && labActive) {
    hudLabLine.textContent = game_.mode === "dunklab"
      ? `SCORE ${game_.lab.score} · STREAK ${game_.lab.streak}`
      : `CONES ${game_.cones.cleared} · STREAK ${game_.cones.streak} · STYLE ${game_.lab.style}`;
  }
  // Shot meter
  const sm = game_.shotMeter;
  if (smGreen) { smGreen.style.left = `${sm.g0 * 100}%`; smGreen.style.width = `${(sm.g1 - sm.g0) * 100}%`; }
  if (smPerfect) { smPerfect.style.left = `${(sm.perfect - 0.012) * 100}%`; smPerfect.style.width = "2.4%"; }
  if (smNeedle) smNeedle.style.left = `${clamp(sm.t, 0, 1) * 100}%`;
  if (smLabel) smLabel.textContent = sm.active ? (sm.t < sm.g0 ? "CHARGING…" : sm.t <= sm.g1 ? "RELEASE NOW" : "LATE — STILL LIVE") : "RELEASE IN THE GREEN";
}

function publishEvidence(): void {
  const holder = holderAthlete();
  const evidence = {
    route: "showcase-aura-hoops-3d",
    engine: "@aura3d/engine",
    engineVersion: "4.0.2",
    ready: appReady && document.body.dataset.aura3dReady === "true",
    framesRendered,
    autopilot: game_.autopilot,
    look: venue.look,
    mode: game_.mode,
    phase: game_.phase,
    cameraMode: cam.mode,
    venue: venue.id,
    score: { home: game_.scoreHome, away: game_.scoreAway, target: game_.target },
    possession: game_.possession,
    mustClear: game_.mustClear,
    shotMeter: { active: game_.shotMeter.active, t: Number(game_.shotMeter.t.toFixed(3)), green: [game_.shotMeter.g0, game_.shotMeter.g1] },
    jamMeter: Number(game_.jam.toFixed(3)),
    jamFull: game_.jamFull,
    ball: { state: ball.state, position: [Number(ball.x.toFixed(2)), Number(ball.y.toFixed(2)), Number(ball.z.toFixed(2))], scored: ball.scored },
    dribbleHand: dribbleHand ? { x: Number(dribbleHand.x.toFixed(2)), y: Number(dribbleHand.y.toFixed(2)), z: Number(dribbleHand.z.toFixed(2)), socket: dribbleHand.socket, forearmValid: dribbleHand.forearmValid, socketApi: dribbleHand.socketApi, raw: dribbleHand.raw, point: dribbleHand.point } : null,
    dribblePose: holder ? dribblePoseOn.has(holder.nodeId) : false,
    holder: holder?.nodeId ?? null,
    holderClip: holder?.clip ?? null,
    holderSpeed: holder ? Number(Math.hypot(holder.vx, holder.vz).toFixed(2)) : 0,
    dribbleCycle: dribbleEvidence,
    athleteClips: athletes.map((a) => ({
      id: a.nodeId,
      clip: a.clip,
      speed: Number(Math.hypot(a.vx, a.vz).toFixed(2)),
      x: Number(a.x.toFixed(2)),
      z: Number(a.z.toFixed(2)),
      hasBall: a.hasBall
    })),
    difficulty: game_.diff,
    squads: { home: game_.homeSquad.id, away: game_.awaySquad.id },
    tour: { active: game_.tour.active, round: game_.tour.round, champion: game_.tour.champion, eliminated: game_.tour.eliminated },
    lab: { ...game_.lab, cones: game_.cones.cleared },
    studio: { ...game_.fit },
    eventLog: eventLog.snapshot(),
    audio: audio?.evidence ? { unlocked: audio.evidence.unlocked, cueCount: audio.evidence.cueCount, playedCueCount: audio.evidence.playedCueCount } : null,
    touch: touchControls?.evidence?.() ?? null,
    deterministic: { rng: "lcg:0xa3d5", ballSim: "route-local analytic + contact model" },
    assets: [
      "hoopsAthleteGuard", "hoopsAthleteBig", "hoopsHoopRig", "hoopsRim", "hoopsBackboard", "hoopsBall", "hoopsCourtShell", "showcaseStadiumSeats", "hoopsScoreboard", "hoopsFloodlight", "hoopsBallCart", "hoopsSkyline", "hoopsTower", "hoopsEarth", "hoopsOrbitArena", "hoopsCanopy", "hoopsLamp", "hoopsPalm", "hoopsTrophy"
    ]
  };
  (window as any).__AURA3D_GAME_EVIDENCE__ = evidence;
  (window as any).__AURA3D_GAME__ = evidence;
}

/* ------------------------------------------------------------------ *
 *  Main loop                                                          *
 * ------------------------------------------------------------------ */
function frame(dtRaw: number): void {
  const now = game_.time;
  const frozen = hitStopUntil > now;
  const dt = frozen ? 0 : clamp(dtRaw, 1 / 240, 0.05);
  game_.time += dt;
  if (game_.phase === "live" || game_.phase === "shot") game_.matchT += dt;
  framesRendered += 1;

  // Timers
  if (game_.bannerT > 0) { game_.bannerT -= dt; if (game_.bannerT <= 0) bannerEl?.classList.remove("show"); }
  if (game_.msgT > 0) { game_.msgT -= dt; if (game_.msgT <= 0) msgBox?.classList.remove("show"); }
  if (game_.promptT > 0) { game_.promptT -= dt; if (game_.promptT <= 0) promptEl?.classList.remove("show"); }
  if (jamFlashT > 0) { jamFlashT = Math.max(0, jamFlashT - dt * 2.4); if (jamFlash) jamFlash.style.opacity = jamFlashT.toFixed(2); }
  if (netPulse > 0) netPulse -= dt * 3;
  if (rimShake > 0) rimShake -= dt * 4;

  // Menu key
  if (pressed("menu", "Escape")) {
    menuOverlay?.classList.toggle("open");
  }

  const me = controlledAthlete();

  switch (game_.phase) {
    case "menu":
      break;
    case "check": {
      game_.checkT += dt;
      const autoCheck = game_.autopilot && game_.checkT > 0.85;
      const manualCheck =
        pressed("shoot", "Space", "Enter") ||
        pressed("pass", "KeyE") ||
        pressed("cross", "KeyJ") ||
        pressed("hesi", "KeyK") ||
        held("up", "KeyW", "ArrowUp") ||
        held("down", "KeyS", "ArrowDown") ||
        held("left", "KeyA", "ArrowLeft") ||
        held("right", "KeyD", "ArrowRight");
      if (game_.possession === "home") {
        showPrompt("SPACE / WASD — CHECK BALL", 0.3);
        if (manualCheck || autoCheck) enterLive();
      } else if (game_.checkT > 0.9) {
        enterLive();
        const h = holderAthlete();
        if (h) { h.aiPlan = "drive"; h.tx = RIM[0]; h.tz = 2.2; }
      }
      break;
    }
    case "live":
    case "shot": {
      // Meter charge
      if (game_.shotMeter.active && me?.shooting) {
        game_.shotMeter.t += dt / 0.72;
        game_.shotMeter.frames += 1;
        if (game_.shotMeter.t >= 1) { game_.shotMeter.t = 0; } // wraps — late release = brick territory
      }
      stepPlayerControl(dt);
      const playIsActive =
        game_.autopilot ||
        (game_.time - lastManualInputAt < 1.2) ||
        Math.hypot(me?.vx ?? 0, me?.vz ?? 0) > 0.15 ||
        Boolean(me?.shooting) ||
        (me?.dunkT ?? 0) > 0 ||
        ball.state !== "held" ||
        game_.possession === "away";
      // AI
      for (const a of athletes) {
        if (a.controlled) continue;
        if (!playIsActive) {
          a.vx = lerp(a.vx, 0, clamp(dt * 12, 0, 1));
          a.vz = lerp(a.vz, 0, clamp(dt * 12, 0, 1));
          if (Math.hypot(a.vx, a.vz) < 0.08) {
            a.vx = 0;
            a.vz = 0;
          }
          continue;
        }
        if (game_.mode === "dunklab" || game_.mode === "handleslab") {
          if (a.team === "away") continue; // parked off-court in labs
          if (!a.hasBall) stepTeammateAI(a, dt);
          continue;
        }
        if (game_.possession === "home") {
          if (a.team === "home" && !a.hasBall) stepTeammateAI(a, dt);
          else if (a.team === "away") stepCpuDefense(a, dt);
        } else {
          if (a.team === "away") stepCpuOffense(a, dt);
          else if (a.team === "home" && !a.controlled) {
            // Home off-ball defenders shadow their 5v5 marks using discrete target updates
            const mark = awayTeam().find((m) => m.index === a.index)
              ?? awayTeam().sort((m, n) => defDist(m, a) - defDist(n, a))[0];
            if (mark) {
              const wantX = mark.x * 0.9;
              const wantZ = mark.z * 0.9 - 0.55;
              if (dist2d(a.tx, a.tz, wantX, wantZ) > 0.75) {
                a.tx = wantX;
                a.tz = wantZ;
              }
              aiMove(a, a.tx, a.tz, dt, PLAYER_SPEED * 0.82);
            }
          }
        }
      }
      // Auto-grab loose balls for AI athletes (and a forgiving walk-over scoop in labs)
      if (ball.state === "loose") {
        ball.looseT += dt;
        const labMode = game_.mode === "dunklab" || game_.mode === "handleslab";
        for (const a of athletes) {
          const reach = a.controlled ? (labMode ? 0.9 : -1) : 1.3;
          if (reach > 0 && dist2d(a.x, a.z, ball.x, ball.z) < reach && ball.y < 2.3) grabLooseBall(a);
          else if (!a.controlled && !a.hasBall) {
            // rebounders chase
            if (dist2d(a.x, a.z, ball.x, ball.z) < 7) aiMove(a, ball.x, ball.z, dt, PLAYER_SPEED * 0.85);
          }
        }
        if (labMode && ball.looseT > 3.5) resetLabBall();
      }
      break;
    }
    case "score": {
      game_.scoreT -= dt;
      if (game_.scoreT <= 0) enterCheck(game_.servingTeam);
      break;
    }
    case "gameover": {
      if (pressed("rematch", "KeyR")) {
        promptEl?.classList.remove("show");
        msgBox?.classList.remove("show");
        if (game_.mode === "tour" && (game_.tour.champion || game_.tour.eliminated)) {
          game_.tour = { active: true, round: 0, eliminated: false, champion: false, opponents: [] };
        }
        startMatch(game_.mode);
        renderBracket();
      }
      break;
    }
  }

  // Take-back clearing check
  if (game_.mustClear && game_.phase === "live") {
    const h = holderAthlete();
    if (h && dist2d(h.x, h.z, RIM[0], RIM[2]) > ARC_R + 0.4) {
      game_.mustClear = false;
      showBanner("CLEARED — PLAY");
      pushEvent("rules", "ball cleared — play on", "info");
    } else if (h) {
      showPrompt("TAKE IT BACK — PAST THE ARC", 0.3);
    }
  }

  if (game_.mode === "handleslab" && me) stepHandlesLab(me);

  // Jam meter slow fill on stops / decay guard
  if (game_.mode !== "dunklab") {
    if (game_.jam >= 1) game_.jam = 1;
  } else {
    game_.jam = 1;
    game_.jamFull = true;
  }

  // Ball + athletes
  stepBallSim(dt);
  for (const a of athletes) syncAthlete(a, dt);

  // Ball visuals
  if (ballNode) {
    ballNode.setPosition(ball.x, Math.max(BALL_R, ball.y), ball.z);
    if (ball.state === "flight" || ball.state === "loose" || ball.state === "pass") {
      ballNode.setRotation(ball.flightT * 6, 0, ball.flightT * 4);
    } else {
      const h = holderAthlete();
      ballNode.setRotation(game_.time * 5.2, h?.yaw ?? 0, 0);
    }
  }
  ballShadow?.setPosition(ball.x, 0.014, ball.z).setScale([clamp(1.1 - ball.y * 0.12, 0.3, 1.05), 1, clamp(1.1 - ball.y * 0.12, 0.3, 1.05)]).setVisible(true);
  for (let i = 0; i < TRAIL_COUNT; i++) {
    const h = trailNodes[i];
    const pt = trailHist[trailHist.length - 1 - i];
    if (h && pt && (ball.state === "flight" || ball.state === "pass") && !frozen) {
      const s = Math.max(0.2, 1 - i / (TRAIL_COUNT + 1));
      h.setPosition(pt[0], pt[1], pt[2]).setScale([s, s, s]).setVisible(true);
    } else h?.setScale(HIDDEN).setVisible(false);
  }
  // Rim/net feedback
  const netS = 1 + Math.max(0, netPulse) * 0.4;
  netTop?.setScale([netS, netS, netS]);
  netBottom?.setScale([1 + Math.max(0, netPulse) * 0.8, 1 + Math.max(0, netPulse) * 0.8, 1]);
  netSkirt?.setScale([1 + netPulse * 0.3, 1 + netPulse * 0.55, 1 + netPulse * 0.3]);
  rimHalo?.setScale([1 + rimShake * 0.12, 1 + rimShake * 0.12, 1]);
  rimNode?.setPosition(RIM[0] + (rng() - 0.5) * rimShake * 0.03, RIM[1] + rimShake * 0.02, RIM[2]);
  planetEarth?.setRotation(0, game_.time * 0.02, 0);

  // Cones
  for (let i = 0; i < CONE_COUNT; i++) {
    const on = game_.cones.active;
    const c = CONE_SPOTS[game_.cones.order.indexOf(i) >= 0 ? i : i]!;
    const isNext = on && game_.cones.order[game_.cones.next] === i;
    const done = on && game_.cones.order.indexOf(i) < game_.cones.next;
    coneNodes[i]?.setPosition(c[0], 0.26, c[2]).setScale(on ? [1, 1, 1] : HIDDEN).setVisible(on);
    coneRingNodes[i]?.setPosition(c[0], 0.03 + Math.sin(game_.time * 4) * 0.02, c[2])
      .setScale(on ? (isNext ? [1.2, 1.2, 1.2] : [0.7, 0.7, 0.7]) : HIDDEN)
      .setVisible(on && !done);
  }

  updateCamera(dt);
  touchControls?.update?.();
  syncHud();
  publishEvidence();
  inputCtl.update(dt);
  keysPressed.clear();
}

auraApp.onFrame(({ dt }) => {
  if (!appReady) {
    for (const a of athletes) syncAthlete(a, 0);
    updateCamera(0.016);
    syncHud();
    return;
  }
  frame(dt);
});

/* ------------------------------------------------------------------ *
 *  Menu / toolbar wiring                                              *
 * ------------------------------------------------------------------ */
function setVenue(vId: VenueId, silent = false): void {
  if (!VENUES[vId]) return;
  const changed = venue.id !== vId;
  venue = VENUES[vId];
  document.querySelectorAll<HTMLButtonElement>("[data-court]").forEach((b) => b.classList.toggle("active", b.dataset.court === vId));
  document.querySelectorAll<HTMLButtonElement>("[data-court-menu]").forEach((b) => b.classList.toggle("active", b.dataset.courtMenu === vId));
  if (changed) {
    try {
      auraApp.setScene(buildScene(venue));
      resolveHandles();
    } catch (e) {
      console.warn("[hoops] venue swap failed", e);
    }
  }
  if (!silent) {
    showMsg(venue.label, venue.lookLabel, 1.8);
    pushEvent("venue", `court: ${venue.label.toLowerCase()}`, "info");
  }
}

function renderBracket(): void {
  if (!bracketEl) return;
  const t = game_.tour;
  const rounds = [32, 16, 8, 4, 2];
  const names = ["ROUND OF 32", "ROUND OF 16", "QUARTERS", "SEMIS", "FINAL"];
  let html = "";
  for (let r = 0; r < 5; r++) {
    html += `<div class="bracket-round"><div class="br-title">${names[r]}</div>`;
    const cells = rounds[r]! / 2;
    for (let c = 0; c < cells; c++) {
      let cls = "bracket-cell";
      let text = "—";
      if (r === 0 && c === 0) { text = `${game_.homeSquad.short} vs ${SQUADS[t.opponents[0] ?? 1]!.short}`; cls += t.round > 0 ? " done" : " you alive"; }
      else if (r === t.round && c === 0 && t.active && !t.eliminated) { text = `${game_.homeSquad.short} vs ${game_.awaySquad.short}`; cls += " you alive"; }
      else if (r < t.round && c === 0) { text = `${game_.homeSquad.short} advanced`; cls += " done"; }
      else if (r === t.round && t.eliminated && c === 0) { text = `${game_.awaySquad.short} advanced`; cls += " done"; }
      else if (r === 0) { text = TOUR_FILLER[(c * 2 + r) % TOUR_FILLER.length]!; cls += " alive"; }
      else { text = r < t.round ? "decided" : "TBD"; cls += r < t.round ? " done" : ""; }
      html += `<div class="${cls}">${text}</div>`;
    }
    html += "</div>";
  }
  if (t.champion) html += `<div class="bracket-round"><div class="br-title">CHAMPION</div><div class="bracket-cell you alive">${game_.homeSquad.name}</div></div>`;
  bracketEl.innerHTML = html;
}

function buildStudioPills(): void {
  const groups: { id: string; key: keyof StudioFit; colors: readonly string[] }[] = [
    { id: "studio-jersey", key: "jersey", colors: STUDIO.jersey },
    { id: "studio-kicks", key: "kicks", colors: STUDIO.kicks },
    { id: "studio-skin", key: "skin", colors: STUDIO.skin },
    { id: "studio-hair", key: "hair", colors: STUDIO.hair }
  ];
  for (const g of groups) {
    const row = el<HTMLElement>(g.id);
    if (!row) continue;
    row.innerHTML = "";
    g.colors.forEach((color, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "swatch" + (game_.fit[g.key] === i ? " active" : "");
      b.style.background = color;
      b.setAttribute("aria-label", `${g.key} ${i}`);
      b.addEventListener("click", () => {
        game_.fit[g.key] = i;
        buildStudioPills();
        pushEvent("studio", `${g.key} → ${color}`, "info");
      });
      row.appendChild(b);
    });
  }
}

function wireMenus(): void {
  const autoBtn = el<HTMLButtonElement>("tb-auto");
  const syncAutoBtn = (): void => {
    if (!autoBtn) return;
    autoBtn.classList.toggle("active", game_.autopilot);
    autoBtn.textContent = game_.autopilot ? "AUTO: ON" : "AUTO";
  };
  syncAutoBtn();
  autoBtn?.addEventListener("click", () => {
    game_.autopilot = !game_.autopilot;
    syncAutoBtn();
    showBanner(game_.autopilot ? "CPU AUTOPILOT ON" : "MANUAL CONTROLS ACTIVE");
    pushEvent("system", game_.autopilot ? "autopilot enabled" : "manual controls active", "info");
  });

  // Mode cards
  document.querySelectorAll<HTMLButtonElement>("[data-start]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const mode = (btn.dataset.start ?? "quick") as ModeId;
      game_.pendingMode = mode;
      if (mode === "studio") {
        studioSection?.style.setProperty("display", "");
        buildStudioPills();
        return;
      }
      if (mode === "tour") {
        tourSection?.style.setProperty("display", "");
        renderBracket();
      }
      menuOverlay?.classList.remove("open");
      startMatch(mode);
      enterLive();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-diff]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const d = btn.dataset.diff as DiffId;
      if (!DIFFS[d]) return;
      game_.diff = d;
      document.querySelectorAll<HTMLButtonElement>("[data-diff]").forEach((b) => b.classList.toggle("active", b === btn));
      pushEvent("difficulty", `difficulty: ${DIFFS[d].label.toLowerCase()}`, "info");
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-court-menu]").forEach((btn) => {
    btn.addEventListener("click", () => setVenue(btn.dataset.courtMenu as VenueId));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-court]").forEach((btn) => {
    btn.addEventListener("click", () => setVenue(btn.dataset.court as VenueId));
  });
  document.querySelectorAll<HTMLButtonElement>("[data-mode-btn]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const m = btn.dataset.modeBtn;
      document.querySelectorAll<HTMLButtonElement>("[data-mode-btn]").forEach((b) => b.classList.toggle("active", b === btn));
      if (m === "menu") { menuOverlay?.classList.add("open"); return; }
      if (m === "quick") { menuOverlay?.classList.remove("open"); startMatch("quick"); enterLive(); }
      if (m === "dunklab") { menuOverlay?.classList.remove("open"); startMatch("dunklab"); }
    });
  });
  el<HTMLElement>("menu-close")?.addEventListener("click", () => menuOverlay?.classList.remove("open"));
  el<HTMLElement>("menu-run")?.addEventListener("click", () => {
    menuOverlay?.classList.remove("open");
    startMatch(game_.pendingMode === "studio" ? "quick" : game_.pendingMode);
    enterLive();
  });
  el<HTMLElement>("studio-apply")?.addEventListener("click", () => {
    buildStudioPills();
    showBanner("FIT APPLIED TO YOUR SQUAD");
    pushEvent("studio", "fit applied", "success");
    menuOverlay?.classList.remove("open");
  });
}

/* ------------------------------------------------------------------ *
 *  Boot                                                               *
 * ------------------------------------------------------------------ */
setupSystems();
wireMenus();
buildStudioPills();
resetAthletes();

const params = new URLSearchParams(window.location.search);
const venueParam = params.get("court") as VenueId | null;
if (venueParam && VENUES[venueParam]) setVenue(venueParam, true);
const modeParam = params.get("mode") as ModeId | null;
const menuParam = params.get("menu") === "1" || modeParam === "studio";

if (menuParam) {
  enterCheck("home");
  game_.phase = "menu";
  menuOverlay?.classList.add("open");
} else {
  menuOverlay?.classList.remove("open");
  startMatch(modeParam ?? "quick");
  enterLive();
}

void Promise.resolve((auraApp as any).ready?.()).then(() => {
  resolveHandles();
  for (const a of athletes) syncAthlete(a, 0);
  updateCamera(0.016);
  syncHud();
  appReady = true;
  document.body.dataset.aura3dReady = "true";
  document.querySelector("#app canvas")?.setAttribute("data-ready", "true");
  publishEvidence();
  pushEvent("system", "aura hoops 3d online — six courts loaded", "success");
  console.info("[aura-hoops-3d] ready", { venue: venue.id, mode: game_.mode, phase: game_.phase });
});
