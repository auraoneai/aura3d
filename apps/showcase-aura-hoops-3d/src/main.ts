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
 *   launch solve + rim/backboard/floor contacts + swish detection), 5v5
 *   teammate/CPU AI, the shot meter + Jam Meter + dunk packages, Street Tour
 *   bracket, team kits + Player Studio fit colors, Handles Lab cone gates, Dunk Lab, a
 *   camera director, DOM HUD wired to index.html ids every frame, rooftop-
 *   buckets SFX through createGameAudio, juice/FX layers, and a rich
 *   `__AURA3D_GAME_EVIDENCE__` channel. Rules that need no scene (meter, dead
 *   balls, take-back, kits, separation, render blend) live in rules.ts.
 */
import {
  camera,
  createAuraApp,
  createFixedStepLoop,
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
  installGameBeacon,
  createFootSlideMeter,
  createHitStop,
  createHandBounce,
  handBounceOverlayAngles
} from "@aura3d/engine/game";
import { assets } from "./aura-assets.route";
import {
  COURT_RIGS,
  LIGHTNING_NODE_ID,
  LIGHTNING_PEAK,
  courtAtmosphereNodes,
  courtWaterNodes,
  courtLampNodes,
  courtLensFlareNodes,
  courtLightningNodes,
  courtLookNodes,
  courtPracticalNodes,
  courtSkyNodes,
  courtWeatherNodes,
  lightningFlash
} from "./courtRigs";
import { JUICE_FX, ballTrailOptions, hoopsBurstOptions, hoopsFxKindFor, registerHoopsFx, type HoopsFxKind } from "./fxPack";
import "../../showcase-port-shared/quickbar.css";
import { createFrameErrorBoundary, installBlackFrameGuard } from "@aura3d/debug";
import { pickLocomotion } from "./locomotionRates";
import { advanceShotBall, aimError, createHoopWorld, crossedRimDownward, solveLaunch } from "./shotPhysics";
import { BALL_R, DRIB_SHOULDER_FALLBACK, dribbleCycleY } from "./dribble";
import { createOnePress } from "./input";
import { hoopMaterials } from "./hoopMaterials";
import { SprayTags } from "./sprayTags";
import { headLookAngles, headLookQuat, stepHeadLook, worldToActor, type HeadLookAngles } from "./headLook";
import { SCOREBOARD_NODE_ID, courtNameNode, scoreboardNode, scoreboardText } from "./diegetic";
import { projectCrops, type QaCropSubject } from "./qaCrops";
import { MarkerPool, parkedTransforms, type MarkerSlot } from "./markerPools";
import { LIVE_CAM, MAKE_FOV_KICK, ReplayRing, createBroadcast, createLetterbox, railPose, replayPose, replaySourceTime, type V3 as BroadcastV3 } from "./broadcast";
import {
  CHECK_SHOT_GUARD, CPU_DUNK_RATE, SIM_STEP, advanceMeter, blendPose, canBlockRelease, clearTarget, decayRimShake,
  deadBallPossession, dunkRejectChance, isCleared, isDeadBall, makeCosmeticRng, matchDifficulty, meterQuality,
  releaseRead, separate, squadAimSkill, squadSpeedScale, squadStealScale, teamKits, tourNeedsReset,
  type Body, type Kit, type Pose
} from "./rules";

let gameBeacon: ReturnType<typeof installGameBeacon> | undefined;
const publishBeacon = (evidence: object): void => {
  gameBeacon ??= installGameBeacon({ route: "showcase-aura-hoops-3d", evidenceGlobals: ["__AURA3D_GAME_EVIDENCE__"] });
  gameBeacon.publishEvidence(evidence);
};

installBlackFrameGuard();

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
/** Cosmetic jitter only (rim shake): never touches the gameplay stream above. */
const fxRng = makeCosmeticRng(0x51de);

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
const shotStats = { released: 0, made: 0, rimImpacts: 0, boardImpacts: 0, rimRolls: 0, swishes: 0, bankShots: 0 };
const hoopWorld = createHoopWorld({ rim: RIM, boardFaceZ: BOARD_Z + 0.06, boardHalfW: BOARD_HALF_W, boardY0: BOARD_Y0, boardY1: BOARD_Y1 }, (impact) => {
  if (impact.tag === "rim") {
    shotStats.rimImpacts += 1;
    ball.hitRim = true;
    juiceFire("rim", { position: impact.point });
    rimShake = Math.min(1, impact.speed / 6);
  } else if (impact.tag === "board") {
    shotStats.boardImpacts += 1;
    ball.hitBoard = true;
    juiceFire("bank", { position: impact.point });
  }
});
const ARC_R = 6.75; // street "two" line
const CHECK_SPOT: Vec3 = [0, 0, 8.6];
const COURT_X = 7.6;
const COURT_Z0 = -2.2;
const COURT_Z1 = 10.6;
const PLAYER_SPEED = 4.6;
const SPRINT_SPEED = 6.9;
const DUNK_RANGE = 2.4;
const GRAVITY = -10.4; // snappier arcade arc than textbook 9.81
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
  aiPlan: "idle" | "drive" | "stand" | "pullup" | "post" | "orbit" | "clear";
  /** Rolled once per CPU drive: go up for the dunk at the rim (true) or pull up (false). */
  dunkIntent: boolean;
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
  /** Team that touched the ball last (shot, pass, steal poke, block, dunk): a dead ball goes to the other team. */
  lastTouch: TeamId;
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

/** Player Studio fit: the home crew's jersey (with socks) and shorts, the two regions the kit materials carry. */
interface StudioFit {
  jersey: number;
  shorts: number;
}
const STUDIO = {
  jersey: ["#ff7a1a", "#39d7ff", "#e26bff", "#66e37f", "#f2f0e2", "#ff3b5c"],
  shorts: ["#1a1206", "#22262e", "#f2f0e2", "#06222b", "#3a2c20", "#2b0710"]
};

const initialParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : new URLSearchParams();
/** ?diag=1&qaDt=0.0167 fixes the simulation step so a slow software-GL run still integrates at a real-device rate (measurement only). */
const QA_DT = initialParams.get("diag") === "1" ? Number(initialParams.get("qaDt")) || 0 : 0;
/** ?diag=1&qaCam=front is a close front-left view for filmstrips; ?diag=1&qaLean=1.2 scales the running-dribble waist bend and &qaLead=2 the palm look-ahead (measurement only). */
const QA_LEAN = initialParams.get("diag") === "1" ? Number(initialParams.get("qaLean")) || 1 : 1;
const QA_SERVE = initialParams.get("diag") === "1" && initialParams.get("qaServe") === "away";
const QA_STAND = initialParams.get("diag") === "1" && initialParams.get("qaStand") === "1";
const QA_CAM_FRONT = initialParams.get("diag") === "1" && initialParams.get("qaCam") === "front";
/** ?diag=1&qaStep=1: the sim advances only when a probe calls `window.__qaStep(n)` (n fixed steps), so a filmstrip can capture consecutive frames. */
const QA_STEP = initialParams.get("diag") === "1" && initialParams.get("qaStep") === "1";
let qaStepsLeft = 0;
if (QA_STEP && typeof window !== "undefined") (window as unknown as { __qaStep: (n?: number) => void }).__qaStep = (n = 1) => { qaStepsLeft += n; };
const QA_LEAD = initialParams.get("diag") === "1" ? Number(initialParams.get("qaLead")) || 1 : 1;
/** ?diag=1&qaAo=0|1 builds the look from its flat nodes with the ambient-occlusion pass dropped (0) or kept (1), for AO on/off pairs (measurement only). */
const QA_AO = initialParams.get("diag") === "1" ? initialParams.get("qaAo") : null;
/** ?diag=1&qaTarget=N plays to N points so a run reaches the results card quickly (measurement only). */
const QA_TARGET = initialParams.get("diag") === "1" ? Number(initialParams.get("qaTarget")) || 0 : 0;
/** ?look=original: the 4.6 look (presets, fog off, today's practicals and dressing) for GU47 before/after pairs. */
const LOOK_ORIGINAL = initialParams.get("look") === "original";
/**
 * GU47 phase 2 fallback: `world.water` fails the renderer mount on this route ("Oblique clip projection is degenerate",
 * RENDERER_MOUNT_FAILED: Venice and Shanghai drew nothing in the after-capture). Until the engine water fix lands the
 * 4.6 ocean and river planes draw by default and `?water=real` opts in to the H47-E3 water nodes.
 */
const REAL_WATER = !LOOK_ORIGINAL && initialParams.get("water") === "real";
/**
 * Reduced motion / flash as the boot scene sees them (`buildScene` runs before `setupSystems` sets the live flags):
 * the same URL params and media queries, read once.
 */
/* H47-C1 / H47-P2: broadcast intro rail and Jam-dunk replay (broadcast.ts). Off on ?look=original, under reduced motion,
 * with ?intro=0 and on every measurement path (?diag=1, ?simsteps=N), so captures and probes keep their stepping. */
const BROADCAST_OFF = initialParams.get("look") === "original" || initialParams.get("intro") === "0" || initialParams.get("diag") === "1" ||
  Number(initialParams.get("simsteps")) > 0 || initialParams.has("reducedMotion") ||
  (typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false));
const broadcast = createBroadcast({ disabled: BROADCAST_OFF });
/** Recorded presenter steps for the replay (1.2 s at the sim step; the replay shows the last 0.96 s). */
const replayRing = new ReplayRing(Math.ceil(1.2 * 60));
let replayClip: ReplayRing | null = null;
/** Set when a Jam dunk takes off; finishDunk starts the replay (a read of the dunk branch, no sim change). */
let jamDunkPending = false;
let letterbox: { show(on: boolean): void } | null = null;
let broadcastPostOn = false;
/** H47-V3: the Jam-dunk spray tags (new look). */
const sprayTags = new SprayTags();
// H47-H1: the tour HUD skin (spray-stencil score bug, spray-can Jam meter) styles off body[data-look="tour"].
if (typeof document !== "undefined" && initialParams.get("look") !== "original") document.body.dataset.look = "tour";
/** H47-H1: the score text the in-world Rucker board shows (set at build, kept equal to the DOM score by syncHud). */
let shownBoardScore = "";
const BOOT_REDUCED_MOTION = initialParams.has("reducedMotion") || (typeof window !== "undefined" && (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false));

const game_ = {
  mode: "quick" as ModeId,
  phase: "menu" as Phase,
  venue: "rucker" as VenueId,
  diff: "pro" as DiffId,
  /** The difficulty the player picked; Street Tour overrides `diff` per round and other modes restore this. */
  userDiff: "pro" as DiffId,
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
  fit: { jersey: 0, shorts: 0 } as StudioFit,
  /** Player Studio fit in force on the home squad (null until APPLY FIT). */
  appliedFit: null as StudioFit | null,
  /** game_.time when the ball went live (the check press must not also open the shot meter). */
  liveSince: -10,
  stats: { home: { fga: 0, fgm: 0, dunks: 0, steals: 0, blocks: 0 }, away: { fga: 0, fgm: 0, dunks: 0, steals: 0, blocks: 0 } },
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
  shotValue: 1, shooter: -1, blocked: false, looseT: 0, lastTouch: "home"
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
  // Free-throw circle + 2-point arc — painted dashes along the rings, one instanced draw for all 50 (they were 50 boxes)
  const ticks: { position: Vec3; rotation: Vec3; scale: Vec3 }[] = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    ticks.push({ position: [Math.cos(a) * 1.8, 0.012, 3.95 + Math.sin(a) * 1.8], rotation: [0, -a, 0], scale: [0.09, 0.02, 0.55] });
  }
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2;
    ticks.push({ position: [Math.cos(a) * ARC_R, 0.014, Math.sin(a) * ARC_R], rotation: [0, -a, 0], scale: [0.1, 0.02, 1.15] });
  }
  nodes.push((instances as any).box({ name: "court-ticks", transforms: ticks, material: lineMat, castShadow: false }));
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
    // y 1.98 is the 4.6 placement, unchanged; the fit-grounding check only sees it now that the overrides moved to
    // hoopMaterials.ts. Phase 2 checks the stanchion foot against the floor in a capture (lane report g07).
    model(assets.hoopsHoopRig, { // fit-grounding: ok
      name: "hoop-rig",
      targetHeight: 3.95,
      scaleMode: "fit",
      castShadow: true,
      receiveShadow: true,
      materialOverrides: hoopMaterials(LOOK_ORIGINAL).rig
    })
      .position(0, 1.98, -1.08)
      .rotate(0, Math.PI, 0),
    model(assets.hoopsBackboard, {
      name: "hoop-backboard",
      scaleMode: "world",
      castShadow: true,
      receiveShadow: true,
      materialOverrides: hoopMaterials(LOOK_ORIGINAL).backboard
    })
      .position(0, 3.35, BOARD_Z)
      .runtime(game.runtimeNode("backboard-assembly")),
    model(assets.hoopsRim, {
      name: "hoop-rim",
      scaleMode: "world",
      castShadow: true,
      materialOverrides: hoopMaterials(LOOK_ORIGINAL).rim
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
    model(assets.hoopsBall, { name: "ball-live", scaleMode: "fit", targetMaxDimension: 0.26, castShadow: true, ...(LOOK_ORIGINAL ? {} : { materialOverrides: hoopMaterials(false).ball }) })
      .position(0, 0.98, CHECK_SPOT[2])
      .runtime(game.runtimeNode("ball-live")),
    primitives.cylinder({ name: "ball-shadow", size: [0.34, 0.008, 0.34], material: material.pbr({ color: "#000000", opacity: 0.28, roughness: 1 }) }).position(0, 0.012, CHECK_SPOT[2]).runtime(game.runtimeNode("ball-shadow"))
  ];
  // H47-V1 / H47-PF1: the 14 emissive trail spheres stay only on ?look=original; the new look draws one ribbon trail.
  for (let i = 0; i < (LOOK_ORIGINAL ? TRAIL_COUNT : 0); i++) {
    nodes.push(
      primitives.sphere({ name: `ball-trail-${i}`, size: [0.1, 0.1, 0.1], material: material.emissive({ color: "#ff9a3d", emissive: "#ff9a3d", emissiveIntensity: 0.4 }) })
        .scale(HIDDEN)
        .runtime(game.runtimeNode(`ball-trail-${i}`))
    );
  }
  return nodes;
}

/** Clean ground readability rings & shadow for one 3D Meshy athlete (no primitive body/shoe capsules). */
function buildAthleteAccessories(id: string, team: TeamId, kit: Kit): any[] {
  // Team ring in the kit colour, with a shape cue that does not depend on colour: home stands on a round ring, away on a
  // square one (a four-segment torus), so the sides read apart for colour-blind players too.
  return [
    primitives.cylinder({ name: `${id}-shadow`, size: [0.58, 0.008, 0.58], material: material.pbr({ color: "#000000", opacity: 0.24, roughness: 1 }) }).runtime(game.runtimeNode(`${id}-shadow`)),
    primitives.torus({
      name: `${id}-ring`,
      size: team === "home" ? [0.82, 0.82, 0.34] : [0.86, 0.86, 0.34],
      ...(team === "away" ? { params: { tubularSegments: 4 } } : {}),
      material: material.emissive({ color: kit.jersey, emissive: kit.jersey, emissiveIntensity: 0.45, opacity: 0.72 })
    }).rotate(Math.PI / 2, 0, team === "away" ? Math.PI / 4 : 0).runtime(game.runtimeNode(`${id}-ring`)),
    // Jam aura — hidden until the meter is full
    primitives.cylinder({ name: `${id}-aura`, size: [0.9, 1.9, 0.9], material: material.emissive({ color: "#ff7a1a", emissive: "#ff7a1a", emissiveIntensity: 0.9, opacity: 0.16 }) }).scale(HIDDEN).runtime(game.runtimeNode(`${id}-aura`))
  ];
}

/** The kit one side wears: the squad kit (rules.teamKits), with the applied Player Studio fit on the home side. */
function teamKit(team: TeamId): Kit {
  const kits = teamKits(game_.homeSquad, game_.awaySquad);
  if (team === "away") return kits.away;
  const fit = game_.appliedFit;
  if (!fit) return kits.home;
  const jersey = STUDIO.jersey[fit.jersey] ?? kits.home.jersey;
  return { jersey, shorts: STUDIO.shorts[fit.shorts] ?? kits.home.shorts, socks: jersey };
}

function athleteOverrides(kit: Kit): any[] {
  const flat = (target: RegExp, color: string, roughness: number) => ({ target, color, colorMode: "replace", replaceTextures: true, roughness, metallic: 0 });
  // -kit carries jersey and socks (one colour), -shorts the shorts; -body (skin, hair, face, kicks) keeps its palette texture
  return [flat(/-kit$/, kit.jersey, 0.68), flat(/-shorts$/, kit.shorts, 0.72)];
}

/* H47-PF1: on the new look the ground markers and drill cones are pooled instanced nodes (markerPools.ts): 10 shadow discs,
 * 10 team rings, 10 Jam auras, 10 cones and 10 cone rings drew as 50 primitive nodes and now draw as at most 6 (one ring
 * node per side keeps the round/square shape cue and the kit colour). ?look=original keeps the separate primitives. */
const POOLED_MARKERS = !LOOK_ORIGINAL;
const HOME_IDS: readonly string[] = ["p0", "p1", "p2", "p3", "p4"];
const AWAY_IDS: readonly string[] = ["a0", "a1", "a2", "a3", "a4"];
const MARKER_ATHLETES = HOME_IDS.length + AWAY_IDS.length;
const RING_ROT_HOME: Vec3 = [Math.PI / 2, 0, 0];
const RING_ROT_AWAY: Vec3 = [Math.PI / 2, 0, Math.PI / 4];
const CONE_RING_ROT: Vec3 = [Math.PI / 2, 0, 0];

function buildMarkerPoolNodes(): any[] {
  if (!POOLED_MARKERS) return [];
  const home = teamKit("home"), away = teamKit("away");
  const ringMat = (k: Kit) => material.emissive({ color: k.jersey, emissive: k.jersey, emissiveIntensity: 0.45, opacity: 0.72 });
  const pool = (kind: "cylinder" | "torus", name: string, capacity: number, opts: Record<string, unknown>) =>
    (instances as any)[kind]({ name, transforms: parkedTransforms(capacity), castShadow: false, ...opts }).runtime(game.runtimeNode(name));
  return [
    pool("cylinder", "marker-shadows", MARKER_ATHLETES, { size: [0.58, 0.008, 0.58], material: material.pbr({ color: "#000000", opacity: 0.24, roughness: 1 }) }),
    pool("torus", "marker-rings-home", HOME_IDS.length, { size: [0.82, 0.82, 0.34], material: ringMat(home) }),
    pool("torus", "marker-rings-away", AWAY_IDS.length, { size: [0.86, 0.86, 0.34], params: { tubularSegments: 4 }, material: ringMat(away) }),
    pool("cylinder", "marker-auras", MARKER_ATHLETES, { size: [0.9, 1.9, 0.9], material: material.emissive({ color: "#ff7a1a", emissive: "#ff7a1a", emissiveIntensity: 0.9, opacity: 0.16 }) }),
    pool("cylinder", "marker-cones", CONE_COUNT, { size: [0.34, 0.5, 0.34], material: material.emissive({ color: "#ff7a1a", emissive: "#ff7a1a", emissiveIntensity: 0.5 }) }),
    pool("torus", "marker-cone-rings", CONE_COUNT, { size: [0.68, 0.68, 0.5], material: material.emissive({ color: "#ffd257", emissive: "#ffd257", emissiveIntensity: 1.0 }) })
  ];
}

function buildAthlete(id: string, team: TeamId): any[] {
  // Region-split copies of the palette athletes (tools/hoops-athlete-retexture/split-kit-materials.mjs): one material per
  // body region, so the kit, shorts and socks take the team colours.
  const athleteAsset = /[124]$/.test(id) ? assets.hoopsAthleteBigKit : assets.hoopsAthleteGuardKit;
  const kit = teamKit(team);
  return [
    model(athleteAsset, { name: id, targetHeight: 1.92, scaleMode: "fit", castShadow: true, receiveShadow: true, materialOverrides: athleteOverrides(kit) } as any)
      .position(0, 0, 6)
      .animate({ clip: "Crouch_Idle_Loop", loop: true, speed: 1.0 })
      .runtime(game.runtimeNode(id)),
    ...(POOLED_MARKERS ? [] : buildAthleteAccessories(id, team, kit))
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
      if (!REAL_WATER) nodes.push(
        primitives.plane({ name: "river-strip", size: [80, 1, 12], material: material.pbr({ color: "#0a1826", roughness: 0.2, metalness: 0.6, emissive: "#0d2438", emissiveIntensity: 0.25 }) }).position(0, -0.05, 20)
      );
    }
  }

  if (v.id === "venice") {
    nodes.push(
      primitives.plane({ name: "sand-surround", size: [90, 1, 46], material: material.pbr({ color: "#c9ad72", roughness: 0.95 }) }).position(0, -0.04, 6),
      ...(!REAL_WATER ? [primitives.plane({ name: "ocean-glint", size: [90, 1, 10], material: material.pbr({ color: "#2e8fa8", roughness: 0.3, metalness: 0.4, emissive: "#ff9a3d", emissiveIntensity: 0.12 }) }).position(0, -0.03, -22)] : [])
    );
    for (const [x, z, s] of [[-12, -8, 1], [12.5, -10, 1.2], [-14, 12, 0.9], [14, 14, 1.05], [-9, 16, 0.8]] as const) {
      nodes.push(model(assets.hoopsPalm, { name: `palm-${x}-${z}`, targetHeight: 6.4 * s, castShadow: true }).position(x, 0, z).rotate(0, vrng() * Math.PI * 2, 0));
    }
  }

  if (v.id === "manila") {
    nodes.push(
      model(assets.hoopsCanopy, { name: "manila-canopy", targetMaxDimension: 36, scaleMode: "fit", castShadow: false, receiveShadow: true }).position(0, 9.2, 4)
    );
    // H47-L2: under the roof the court is lit by 12 tungsten bulbs on two strings (courtRigs.ts), not floodlights.
    if (LOOK_ORIGINAL) {
      for (const [x, z] of [[-13, -4], [13, -4], [-13, 12], [13, 12]] as const) {
        nodes.push(
          model(assets.hoopsFloodlight, { name: `flood-${x}-${z}`, targetHeight: 8.6 }).position(x, 0, z).rotate(0, Math.atan2(-x, -z), 0),
          lights.spot({ name: `flood-s-${x}-${z}`, position: [x * 0.9, 8.4, z * 0.9], target: [0, 0, 4], angle: 0.6, penumbra: 0.5, intensity: 2.2, color: "#ffd9a8", distance: 55 })
        );
      }
    }
  }

  if (v.id === "shanghai") {
    for (const [x, z] of [[-9, -3.2], [9, -3.2], [-9, 11.5], [9, 11.5], [-12, 4], [12, 4]] as const) {
      nodes.push(model(assets.hoopsLamp, { name: `neon-lamp-${x}-${z}`, targetHeight: 4.6 }).position(x, 0, z).rotate(0, Math.atan2(-x, 4 - z), 0));
    }
    // H47-L3: sign rect lights (courtRigs.ts) replace the two neon point fills.
    if (LOOK_ORIGINAL) {
      nodes.push(
        lights.point({ name: "neon-fill-a", position: [-8, 5, 4], color: "#39d7ff", intensity: 1.6, distance: 40 }),
        lights.point({ name: "neon-fill-b", position: [8, 5, 4], color: "#e26bff", intensity: 1.3, distance: 40 })
      );
    }
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
    // H47-L1: the starfield HDRI is the sky now; the 140 emissive star spheres stay only on ?look=original.
    if (LOOK_ORIGINAL) nodes.push((instances as any).sphere({ name: "starfield", transforms: starT, material: material.emissive({ color: "#cfe8ff", emissive: "#cfe8ff", emissiveIntensity: 1.4 }) }));
    // H47-L3: station rib rect lights (courtRigs.ts) replace the orbit point fill.
    if (LOOK_ORIGINAL) nodes.push(lights.point({ name: "orbit-fill", position: [0, 12, 4], color: "#7dfcff", intensity: 2.0, distance: 60 }));
    nodes.push(effects.lightCone({ name: "orbit-cone", position: [0, 10, -6], direction: [0, -1, 0.2], color: "#7dfcff", intensity: 0.25, length: 12, coneAngle: 0.5, softness: 0.6 } as any));
  }

  if (v.id === "rucker") {
    for (const [x, z] of [[-11, -7], [11, -7], [-11, 13], [11, 13]] as const) {
      nodes.push(model(assets.hoopsFloodlight, { name: `flood-${x}-${z}`, targetHeight: 9.2 }).position(x, 0, z).rotate(0, Math.atan2(-x, 4 - z), 0));
      // H47-L2: four sodium spots, two shadowed, from courtRigs.ts; the 4.6 warm-white spots stay on ?look=original.
      if (LOOK_ORIGINAL) nodes.push(lights.spot({ name: `flood-s-${x}-${z}`, position: [x * 0.92, 9.0, z * 0.92], target: [0, 0, 4], angle: 0.55, penumbra: 0.5, intensity: 1.9, color: "#ffd9b0", distance: 55 }));
    }
    nodes.push(
      model(assets.hoopsScoreboard, { name: "scoreboard-rig", targetHeight: 5.4, castShadow: false }).position(0, 4.2, -12.5),
      primitives.box({ name: "scoreboard-glow", size: [6.4, 2.2, 0.24], material: material.emissive({ color: "#1a0f04", emissive: "#ff7a1a", emissiveIntensity: 0.5 }) }).position(0, 5.4, -12.3).runtime(game.runtimeNode("scoreboard-glow"))
    );
    // H47-H1: SDF score on the scoreboard rig, rebuilt by syncHud when the score changes.
    if (!LOOK_ORIGINAL) {
      shownBoardScore = currentBoardScore();
      nodes.push(scoreboardNode(shownBoardScore));
    }
  }

  // H47-H1: the court name painted on the far apron in the court's tag colour.
  if (!LOOK_ORIGINAL) nodes.push(courtNameNode(v.label, COURT_RIGS[v.id].sprayTag.color, COURT_Z1 + 1.3));

  // Courtside dressing shared by all courts: ball rack and trophy case (no static sideline athlete clones)
  nodes.push(
    model(assets.hoopsBallCart, { name: "ball-rack", targetHeight: 1.15 }).position(-8.9, 0, 9.4).rotate(0, 0.5, 0),
    model(assets.hoopsTrophy, { name: "trophy-case", targetHeight: 1.7, castShadow: false }).position(9.2, 0, -3.4).rotate(0, -0.8, 0).runtime(game.runtimeNode("trophy-case"))
  );

  // Court wear decals
  for (const [x, z, s] of [[-2.2, 3.6, 1.4], [2.1, 3.4, 1.2], [0, 8.6, 1.6], [-3.4, 7.8, 1.0], [3.1, 9.2, 1.3], [0.4, 0.9, 1.1]] as const) {
    nodes.push(decals.project({ name: `scuff-${x}-${z}`, color: "#000000", size: [s, s * 0.62], opacity: v.id === "venice" ? 0.08 : 0.16, position: [x, 0.014, z], normal: [0, 1, 0] }));
  }
  return nodes;
}

function buildCones(): any[] {
  const nodes: any[] = [];
  if (POOLED_MARKERS) return buildMarkerPoolNodes();
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
  const s = scene();
  shownBoardScore = "";
  if (LOOK_ORIGINAL) {
    // ?look=original: the 4.6 look (one preset per court, fog off) for before/after pairs.
    const lookOverrides = { fogDensityScale: 0, exposureEv: 0.16 };
    s.background(v.bg);
    if (QA_AO === "0" || QA_AO === "1") {
      s.addMany(looks.nodes(v.look, lookOverrides).filter((n) => QA_AO === "1" || (n.toJSON() as { name?: string }).name !== "look ambient occlusion"));
    } else {
      s.add(looks.preset(v.look, lookOverrides));
    }
  } else {
    // H47-L1: the court's own rig (courtRigs.ts): catalogue HDRI drawn as the sky, one PCSS key, fog to the horizon,
    // explicit AO (dropped by ?diag=1&qaAo=0), the court's post preset, grade and day/night bloom.
    const rig = COURT_RIGS[v.id];
    s.background(rig.fog.color).addMany(courtLookNodes(rig, { ao: QA_AO !== "0" }));
    // H47-L2 / H47-L3: the court's practicals (sodium spots, tungsten bulb clusters, sign and rib rect lights) and the
    // emissive lamp heads they belong to (one instanced draw per court, two at Manila).
    s.addMany(courtPracticalNodes(rig)).addMany(courtLampNodes(rig));
    // H47-L4 lens flares (Venice sun, Rucker floods), H47-E4 Preetham sky (Venice, Athens), H47-E2 rain, wet ground and
    // the storm court's lightning light (reduced motion halves the rain; reduced flash keeps the lightning dark).
    s.addMany(courtLensFlareNodes(rig)).addMany(courtSkyNodes(rig)).addMany(courtWeatherNodes(rig, BOOT_REDUCED_MOTION)).addMany(courtLightningNodes(rig));
    // H47-V2: Rucker flood cones and haze, Manila roof-gap god rays and dust motes.
    s.addMany(courtAtmosphereNodes(rig, BOOT_REDUCED_MOTION));
    // H47-E3: Venice surf and the Shanghai river as real water (replacing the 4.6 planes).
    if (REAL_WATER) s.addMany(courtWaterNodes(rig, BOOT_REDUCED_MOTION));
  }
  s
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
    qualityRebuild: { flags: ["game"] },
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
  root: AnyHandle; shadow: AnyHandle | MarkerSlot; ring: AnyHandle | MarkerSlot; aura: AnyHandle | MarkerSlot;
}
let rigs: Rig[] = [];
let refereeNode: AnyHandle;
let ballNode: AnyHandle;
let ballShadow: AnyHandle;
/** H47-AN1: the glass shakes with the rim after a dunk or a hard rim hit (new look; a sine of game time, no RNG draw). */
let backboardNode: AnyHandle;
let rimHalo: AnyHandle;
let rimNode: AnyHandle;
let netTop: AnyHandle;
let netBottom: AnyHandle;
let netSkirt: AnyHandle;
let scoreboardGlow: AnyHandle;
let planetEarth: AnyHandle;
let trailNodes: AnyHandle[] = [];
/** H47-E2: the storm court's lightning light (absent on other courts and on ?look=original) and its last level. */
let lightningNode: AnyHandle;
let lightningLevel = 0;
let coneNodes: (AnyHandle | MarkerSlot)[] = [];
let coneRingNodes: (AnyHandle | MarkerSlot)[] = [];
let markerPools: Record<"shadows" | "ringsHome" | "ringsAway" | "auras" | "cones" | "coneRings", MarkerPool> | undefined;
/** H47-PF1: submit the pooled marker transforms once per rendered frame. */
function flushMarkerPools(): void {
  if (!markerPools) return;
  for (const p of Object.values(markerPools)) p.flush();
}
let waverNodes: AnyHandle[] = [];

const ROSTER_IDS = ["p0", "p1", "p2", "p3", "p4", "a0", "a1", "a2", "a3", "a4"] as const;
const lastClipByActor = new Map<string, string>();
const lastSpeedByActor = new Map<string, number>();
const dribblePoseOn = new Set<string>();
const livePoseOn = new Set<string>();
const overlayPoseOn = new Set<string>();
/** H47-AN1: smoothed head look-at angles per athlete while the override is on. */
const headLookOn = new Map<string, HeadLookAngles>();
/** H47-AN1 acceptance counters: look-at frames, and those whose yaw error to the ball is <= 25 deg. */
const headLookStats = { frames: 0, within25: 0 };
/** Per-handler palm solve handed from syncAthlete's pose to the ball hold branch. */
interface DribbleAim { palm: Vec3; /** the palm as rendered last frame (forearm bone), when the sockets are live */ actual?: Vec3; shoulderY: number; t: number; moving: boolean }
const dribbleAims = new Map<string, DribbleAim>();
/** The holder's rendered palm and shoulder height, published every frame whatever pose the athlete is in, so the ball always rides the hand that is drawn. */
const heldRig = new Map<string, { palm: Vec3 | undefined; shoulderY: number | undefined }>();
/** Last pose kind per athlete and the frame it changed on: the socket still shows the previous pose on a switch frame. */
const poseKindOf = new Map<string, { kind: string; changedAt: number }>();
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
/** Idle hand target below the shoulder: 0.53 m of a 0.555 m arm hangs it nearly straight (0.46 bent the elbow about 15 cm and, flared out, bowed both arms). */
const IDLE_HAND_DROP = 0.53;
/** Full-body stance; `crouch` 0..1 sinks the hips 0.36 m with the knees folded so the feet stay planted (the pound dribble needs the shoulder down for the hand to reach the bounce). */
const stanceLegs = (crouch = 0) => ({
  Hips: { position: { x: 0, y: 0.882 - 0.36 * crouch, z: 0 } },
  Spine: { rotation: qX(0.105) },
  Chest: { rotation: qX(0.07) },
  Head: { rotation: qX(-0.122) },
  LeftUpperLeg: { rotation: qX(-(0.208 + 0.892 * crouch)) },
  LeftLowerLeg: { rotation: qX(0.276 + 1.674 * crouch) },
  LeftFoot: { rotation: qX(-(0.07 + 0.78 * crouch)) },
  RightUpperLeg: { rotation: qX(-(0.208 + 0.892 * crouch)) },
  RightLowerLeg: { rotation: qX(0.276 + 1.674 * crouch) },
  RightFoot: { rotation: qX(-(0.07 + 0.78 * crouch)) }
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
  heldRig.clear();
  poseKindOf.clear();
  armRigs.clear();
  markerPools = POOLED_MARKERS ? {
    shadows: new MarkerPool(req("marker-shadows"), ROSTER_IDS.length),
    ringsHome: new MarkerPool(req("marker-rings-home"), HOME_IDS.length, RING_ROT_HOME),
    ringsAway: new MarkerPool(req("marker-rings-away"), AWAY_IDS.length, RING_ROT_AWAY),
    auras: new MarkerPool(req("marker-auras"), ROSTER_IDS.length, [0, 0, 0], HIDDEN),
    cones: new MarkerPool(req("marker-cones"), CONE_COUNT, [0, 0, 0], HIDDEN, false),
    coneRings: new MarkerPool(req("marker-cone-rings"), CONE_COUNT, CONE_RING_ROT, HIDDEN, false)
  } : undefined;
  const mp = markerPools;
  rigs = ROSTER_IDS.map((id, i) => ({
    root: req(id),
    shadow: mp ? mp.shadows.slot(i) : req(`${id}-shadow`),
    ring: mp ? (id.startsWith("p") ? mp.ringsHome.slot(HOME_IDS.indexOf(id)) : mp.ringsAway.slot(AWAY_IDS.indexOf(id))) : req(`${id}-ring`),
    aura: mp ? mp.auras.slot(i) : req(`${id}-aura`)
  }));
  refereeNode = req("referee");
  ballNode = req("ball-live");
  ballShadow = req("ball-shadow");
  rimHalo = req("rim-halo");
  rimNode = req("rim-assembly");
  backboardNode = LOOK_ORIGINAL ? undefined : req("backboard-assembly");
  netTop = req("net-top");
  netBottom = req("net-bottom");
  netSkirt = req("net-skirt");
  scoreboardGlow = req("scoreboard-glow");
  planetEarth = req("planet-earth");
  lightningNode = LOOK_ORIGINAL ? undefined : auraApp.nodes.get(LIGHTNING_NODE_ID) as AnyHandle;
  lightningLevel = 0;
  trailNodes = LOOK_ORIGINAL ? Array.from({ length: TRAIL_COUNT }, (_, i) => req(`ball-trail-${i}`)) : [];
  coneNodes = Array.from({ length: CONE_COUNT }, (_, i) => mp ? mp.cones.slot(i) : req(`cone-${i}`));
  coneRingNodes = Array.from({ length: CONE_COUNT }, (_, i) => mp ? mp.coneRings.slot(i) : req(`cone-ring-${i}`));
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
    meterT: 0, shooting: false, dunkT: 0, dunkKind: "", dunkIntent: false
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
  homeList = athletes.filter((a) => a.team === "home");
  awayList = athletes.filter((a) => a.team === "away");
}

// Team lists are rebuilt only when the roster is (resetAthletes); callers must not reorder them (index order = spot order).
let homeList: AthleteState[] = [];
let awayList: AthleteState[] = [];
const homeTeam = (): readonly AthleteState[] => homeList;
const awayTeam = (): readonly AthleteState[] => awayList;
const nearestOf = (list: readonly AthleteState[], x: number, z: number, skip?: AthleteState): AthleteState | undefined => {
  let best: AthleteState | undefined; let bd = Infinity;
  for (const m of list) { if (m === skip) continue; const d = dist2d(m.x, m.z, x, z); if (d < bd) { bd = d; best = m; } }
  return best;
};
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
// Real-time hit-stop: it must count down on the frame clock, not on game time (game time stands still while frozen).
const hitStop = createHitStop(0);
let jamFlashT = 0;

const JUICE_EVENTS: Record<string, { fx?: { kind: any; count?: number; color?: string; speed?: number }; cue?: string; shake?: number; punch?: { fovDeg?: number; dolly?: number; ms?: number }; hitStop?: number; flash?: { color: string; peak: number; ms: number }; rumble?: { ms: number; strong?: number; weak?: number } }> = {
  dribble: { cue: "dribble" },
  swish: { fx: { kind: "ring", count: 20, color: "#ffd257", speed: 4.6 }, cue: "swish", hitStop: 0.06, punch: { fovDeg: 2.2, ms: 240 }, flash: { color: "#ffd257", peak: 0.16, ms: 150 }, rumble: { ms: 40, weak: 0.4 } },
  bank: { fx: { kind: "spark", count: 10, color: "#39d7ff", speed: 3.2 }, cue: "boardThud", punch: { fovDeg: 1.4, ms: 160 } },
  rim: { cue: "rimClank", shake: 0.12, rumble: { ms: 30, weak: 0.3 } },
  brick: { cue: "brickMiss", flash: { color: "#ff3b5c", peak: 0.08, ms: 110 } },
  buzzer: { cue: "buzzerFail", shake: 0.35, flash: { color: "#ff3b5c", peak: 0.2, ms: 240 } },
  dunk: { fx: { kind: "ring", count: 26, color: "#ff7a1a", speed: 5.6 }, cue: "slam", hitStop: 0.09, shake: 0.5, punch: { fovDeg: 3.4, dolly: -0.5, ms: 300 }, flash: { color: "#ff7a1a", peak: 0.24, ms: 200 }, rumble: { ms: 70, strong: 0.7, weak: 0.9 } },
  jam: { fx: { kind: "aura", count: 30, color: "#ff7a1a", speed: 6.2 }, cue: "fireIgnite", hitStop: 0.11, shake: 0.6, punch: { fovDeg: 4.0, dolly: -0.6, ms: 380 }, flash: { color: "#ffd257", peak: 0.3, ms: 280 }, rumble: { ms: 90, strong: 0.85, weak: 1 } },
  steal: { fx: { kind: "spark", count: 8, color: "#66e37f", speed: 3.0 }, cue: "steal", punch: { fovDeg: 1.2, ms: 140 } },
  block: { fx: { kind: "spark", count: 14, color: "#39d7ff", speed: 4.4 }, cue: "block", shake: 0.3, punch: { fovDeg: 2.0, ms: 200 } },
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

/**
 * H47-V1: the juice table of the new look. Every event that draws bursts exactly one registered hoops kind (fxPack.ts
 * `JUICE_FX`); counts and colours come from the preset, so only the kind changes here. ?look=original keeps the table
 * above with the bound 4.6 kinds.
 */
const HOOPS_JUICE_EVENTS: typeof JUICE_EVENTS = Object.fromEntries(
  Object.entries(JUICE_EVENTS).map(([ev, preset]) => {
    const kind = JUICE_FX[ev];
    return [ev, kind ? { ...preset, fx: { kind } } : { ...preset, fx: undefined }];
  })
);
const HOOPS_KIND_SET: ReadonlySet<string> = new Set<string>(Object.values(JUICE_FX));

/** Registers the hoops preset pack and (re)starts the ball ribbon on the mounted scene (after every setScene). */
let ballTrail: { stop(o?: { immediate?: boolean }): void } | null = null;
let ballTrailFire = false;
function mountCourtFx(): void {
  if (LOOK_ORIGINAL || !auraApp) return;
  try { registerHoopsFx((auraApp as any).effects, { reducedFlash }); } catch { /* fx best-effort */ }
  restartBallTrail(game_.jamFull);
}
function restartBallTrail(fire: boolean): void {
  if (LOOK_ORIGINAL || !auraApp) return;
  try {
    ballTrail?.stop({ immediate: true });
    ballTrail = (auraApp as any).effects?.trail?.("ball-live", ballTrailOptions(fire)) ?? null;
    ballTrailFire = fire;
  } catch { ballTrail = null; }
}
/** Burst one hoops kind at a juice position (wet courts swap ground dust for splashes; reduced motion halves it). */
function hoopsBurst(kind: HoopsFxKind, position: Vec3, strength = 1): void {
  try {
    const k = hoopsFxKindFor(kind, COURT_RIGS[venue.id].weather.wetGround);
    const opts = hoopsBurstOptions(k, { reducedMotion });
    (auraApp as any).effects?.burst?.(k, position, strength === 1 ? opts : { ...opts, count: Math.max(1, Math.round((opts.count ?? 1) * strength)) });
  } catch { /* fx best-effort */ }
}

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
  mountCourtFx();
  const fx = createFxParticlePass({
    burst: (kind: string, position: any, o: any) => {
      if (HOOPS_KIND_SET.has(kind)) { hoopsBurst(kind as HoopsFxKind, position as Vec3); return; }
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
      dribble: { id: "dribble", asset: assets.hoopsDribbleSfx as any, volume: 0.34 },
      slam: { id: "slam", asset: assets.hoopsDunkSfx as any, volume: 0.9 },
      steal: { id: "steal", asset: assets.hoopsStealSfx as any, volume: 0.7 },
      block: { id: "block", asset: assets.hoopsBlockSfx as any, volume: 0.8 }
    },
    buses: [{ id: "sfx" } as any]
  } as any) as unknown as GameAudioLike;

  const unlock = () => { void audio?.unlock(); cue("ambient"); cue("crowd"); };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });

  juice = createJuice({
    events: (LOOK_ORIGINAL ? JUICE_EVENTS : HOOPS_JUICE_EVENTS) as any,
    camera: (auraApp as any)?.camera as any,
    session: {
      reducedMotion,
      reducedFlash,
      hitStop: (seconds: number) => { hitStop.trigger(seconds * 1000); },
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
      // Buttons only: SHOOT / CROSS / PASS / SPRINT / HESI. Movement is the route's own stick below (the preset's
      // left/right buttons would only strafe and sit under the stick, so they stay unbound and are not rendered).
      bindings: { "stick.left": "left", "stick.right": "right", "stick.up": "up", "stick.down": "down", light: "shoot", heavy: "cross", special: "pass", jump: "sprint", block: "hesi" },
      haptics: { ms: 12 }
    } as any, {
      doc: document as any,
      root: (document.getElementById("touch") ?? stage) as any,
      viewport: { width: window.innerWidth || 390, height: window.innerHeight || 844 },
      coarsePointer: () => window.matchMedia?.("(pointer: coarse)")?.matches ?? false
    } as any);
  } catch (e) {
    console.warn("[hoops] touch controls unavailable", e);
  }
  mountMoveStick();
}

/**
 * Route-local move stick for touch. The engine preset's stick zone does not mount today (its layout names the rect
 * "leftStick" while the mounter looks up "stick"), so a phone could only strafe. When an engine stick is present this
 * stands down so there is never a second one.
 */
let touchExtra: HTMLElement | null = null;
function mountMoveStick(): void {
  touchExtra = document.getElementById("touch-extra");
  const zone = document.getElementById("touch-stick");
  const nub = zone?.querySelector<HTMLElement>(".nub") ?? null;
  if (!zone || !touchExtra) return;
  if (document.querySelector('.a3g-touch [data-control="stick"]')) { zone.remove(); return; }
  const held = new Map<string, boolean>();
  const set = (action: string, on: boolean) => {
    if ((held.get(action) ?? false) === on) return;
    held.set(action, on);
    inputCtl.setAction(action, on);
  };
  let pointer = -1;
  const move = (cx: number, cy: number) => {
    const r = zone.getBoundingClientRect();
    const rad = r.width / 2;
    let dx = (cx - (r.left + rad)) / rad, dy = (cy - (r.top + rad)) / rad;
    const m = Math.hypot(dx, dy);
    if (m > 1) { dx /= m; dy /= m; }
    if (nub) nub.style.transform = `translate(${dx * rad * 0.6}px, ${dy * rad * 0.6}px)`;
    set("left", dx < -0.35); set("right", dx > 0.35); set("up", dy < -0.35); set("down", dy > 0.35);
  };
  const end = () => {
    pointer = -1;
    if (nub) nub.style.transform = "";
    for (const a of ["left", "right", "up", "down"]) set(a, false);
  };
  zone.addEventListener("pointerdown", (ev) => {
    pointer = ev.pointerId;
    try { zone.setPointerCapture(ev.pointerId); } catch { /* synthetic pointers */ }
    move(ev.clientX, ev.clientY);
    ev.preventDefault();
  });
  zone.addEventListener("pointermove", (ev) => { if (ev.pointerId === pointer) move(ev.clientX, ev.clientY); });
  zone.addEventListener("pointerup", (ev) => { if (ev.pointerId === pointer) end(); });
  zone.addEventListener("pointercancel", end);
  zone.addEventListener("lostpointercapture", end);
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
/* Foot-slide evidence (?diag=1): planted-foot world speed per athlete from the live bone sockets. */
const footMeters = new Map<string, ReturnType<typeof createFootSlideMeter>>();
/** The socket frame's height origin is the rig's, not the court's: the lowest foot height seen per athlete stands in for the floor. */
const footFloor = new Map<string, number>();
let footReports: Record<string, unknown> = {};
function sampleFeet(a: AthleteState, root: AnyHandle): void {
  if (initialParams.get("diag") !== "1") return;
  const anim = (root as any)?.animation;
  if (typeof anim?.socket !== "function") return;
  const cy = Math.cos(a.yaw), sy = Math.sin(a.yaw);
  const body = Math.hypot(a.vx, a.vz);
  for (const bone of ["LeftFoot", "RightFoot"]) {
    const sock = anim.socket(bone) as BoneSocketView;
    if (!sock?.valid) continue;
    const m = sock.worldMatrix();
    const lx = m[12]!, ly = m[13]!, lz = m[14]!;
    const key = `${a.nodeId}:${bone}`;
    let meter = footMeters.get(key);
    if (!meter) { meter = createFootSlideMeter({ plantedHeight: 0.07, threshold: 0.15 }); footMeters.set(key, meter); }
    const wy = ly + a.y;
    const floor = Math.min(footFloor.get(a.nodeId) ?? wy, wy);
    footFloor.set(a.nodeId, floor);
    meter.feed(game_.time, [a.x + lx * cy + lz * sy, wy, a.z - lx * sy + lz * cy], { bodySpeed: body, groundHeight: floor });
  }
}
function footEvidence(): Record<string, unknown> {
  if (initialParams.get("diag") !== "1") return {};
  if (framesRendered % 90 === 0 || Object.keys(footReports).length === 0) {
    const out: Record<string, unknown> = {};
    for (const [key, meter] of footMeters) {
      const r = meter.report();
      out[key] = { planted: r.plantedSamples, max: Number(r.maxPlantedSpeed.toFixed(3)), p95: Number(r.p95PlantedSpeed.toFixed(3)), lift: Number(r.liftRange.toFixed(3)), notStepping: r.notStepping, passed: r.passed };
    }
    footReports = out;
  }
  return footReports;
}

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
/** One fire per physical press (input.ts): never `buffered()`, which repeats for the whole 140 ms window. */
const pressed = createOnePress(inputCtl, keysPressed, keysHeld);

/* ------------------------------------------------------------------ *
 *  HUD helpers                                                        *
 * ------------------------------------------------------------------ */
function showBanner(text: string, dur = 1.5): void {
  if (bannerEl) { bannerEl.textContent = text; bannerEl.classList.add("show"); }
  game_.bannerT = dur;
}
let msgUntil = 0;
function showMsg(big: string, sub: string, dur = 2.1): void {
  if (msgText) msgText.textContent = big;
  if (msgSub) msgSub.textContent = sub;
  if (msgBox) msgBox.classList.add("show");
  game_.msgT = dur;
  msgUntil = performance.now() / 1000 + dur + 0.5;
}
function showPrompt(text: string, dur = 0.2): void {
  if (promptEl) { promptEl.textContent = text; promptEl.classList.add("show"); }
  game_.promptT = Math.max(game_.promptT, dur);
}
function flashJam(alpha = 0.85): void { if (!reducedFlash) jamFlashT = alpha; }

/** The menu overlay is a modal: when closed it is inert and hidden from assistive tech, when open it pauses play. */
function menuIsOpen(): boolean { return Boolean(menuOverlay?.classList.contains("open")); }
function setMenuOpen(open: boolean, autoStart = true): void {
  if (!menuOverlay) return;
  menuOverlay.classList.toggle("open", open);
  menuOverlay.toggleAttribute("inert", !open);
  menuOverlay.setAttribute("aria-hidden", open ? "false" : "true");
  if (open) (menuOverlay.querySelector("button") as HTMLButtonElement | null)?.focus({ preventScroll: true });
  if (!open && autoStart && game_.phase === "menu") {
    // closing the boot menu starts the mode it was showing instead of leaving a phase nothing advances
    startMatch(game_.pendingMode === "studio" ? "quick" : game_.pendingMode);
    enterLive();
  }
}

/** Kits are baked into the scene graph: a new squad, opponent or applied fit rebuilds it (the match state survives, as for a court swap). */
function rebuildScene(): void {
  if (!auraApp) return;
  try {
    auraApp.setScene(buildScene(venue));
    resolveHandles();
    mountCourtFx();
  } catch (e) {
    console.warn("[hoops] scene rebuild failed", e);
  }
}

/** Crowd loop swells on a bucket, then settles back. */
let crowdLevel = 1;
function crowdSwell(): void {
  crowdLevel = 2.2;
  try { (audio as any)?.setCueLevel?.("crowd", { volume: crowdLevel }, 120); } catch { /* audio best-effort */ }
}

/** Athletes on the floor push apart to a shoulder width; a dunker in the air and lab-parked bodies keep their line. */
const bodyScratch: (Body & { a: AthleteState })[] = [];
function separateBodies(): void {
  bodyScratch.length = 0;
  for (const a of athletes) {
    if (a.z < -40) continue; // parked off-court in the labs
    bodyScratch.push({ x: a.x, z: a.z, pinned: a.dunkT > 0, a });
  }
  if (separate(bodyScratch) === 0) return;
  for (const b of bodyScratch) { b.a.x = b.x; b.a.z = b.z; }
}

function rematch(): void {
  promptEl?.classList.remove("show");
  msgBox?.classList.remove("show");
  startMatch(game_.mode);
  enterLive();
  renderBracket();
}

const resultsEl = el<HTMLElement>("results");
/** Results card: the final, field-goal %, dunks, steals and blocks per side, the tour state, and Rematch / Menu buttons. */
function showResults(won: boolean): void {
  if (!resultsEl) return;
  const pct = (s: { fga: number; fgm: number }) => (s.fga > 0 ? `${Math.round((100 * s.fgm) / s.fga)}%` : "—");
  const h = game_.stats.home, a = game_.stats.away;
  const tour = game_.mode === "tour"
    ? (game_.tour.champion ? "STREET TOUR CHAMPION" : game_.tour.eliminated ? `ELIMINATED IN THE ${["ROUND OF 32", "ROUND OF 16", "QUARTERS", "SEMIS", "FINAL"][game_.tour.round] ?? "FINAL"}` : `NEXT: ${["ROUND OF 32", "ROUND OF 16", "QUARTERS", "SEMIS", "FINAL"][game_.tour.round] ?? "FINAL"}`)
    : "";
  const set = (id: string, text: string) => { const n = el<HTMLElement>(id); if (n) n.textContent = text; };
  set("res-title", game_.celebration || (won ? "RUN WON" : "RUN LOST"));
  set("res-score", `${game_.homeSquad.short} ${game_.scoreHome} — ${game_.scoreAway} ${game_.awaySquad.short}`);
  set("res-home-name", game_.homeSquad.short);
  set("res-away-name", game_.awaySquad.short);
  set("res-fg-h", `${h.fgm}/${h.fga} · ${pct(h)}`); set("res-fg-a", `${a.fgm}/${a.fga} · ${pct(a)}`);
  set("res-dunks-h", `${h.dunks}`); set("res-dunks-a", `${a.dunks}`);
  set("res-steals-h", `${h.steals}`); set("res-steals-a", `${a.steals}`);
  set("res-blocks-h", `${h.blocks}`); set("res-blocks-a", `${a.blocks}`);
  set("res-tour", tour);
  set("res-rematch", game_.mode === "tour" && !game_.tour.champion && !game_.tour.eliminated ? "NEXT ROUND" : "REMATCH");
  resultsEl.hidden = false;
}
function hideResults(): void { if (resultsEl) resultsEl.hidden = true; }

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
  ball.flightT = 0; ball.looseT = 0; ball.lastTouch = team;
  trailHist.length = 0;
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
  game_.liveSince = game_.time;
  const h = holderAthlete();
  if (h) ball.state = "held";
  // the ball is live: the check prompt goes away
  promptEl?.classList.remove("show");
  game_.promptT = 0;
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
  // H47-C1: FOV kick on every make (camera only; reduced motion keeps the lens still).
  if (!LOOK_ORIGINAL && !reducedMotion) cam.punch = Math.max(cam.punch, MAKE_FOV_KICK);
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
  showMsg(game_.celebration, `${game_.homeSquad.short} ${game_.scoreHome} — ${game_.scoreAway} ${game_.awaySquad.short}`, 2.4);
  showResults(won);
  pushEvent("game", `final ${game_.scoreHome}-${game_.scoreAway}`, won ? "success" : "warning");
}

function startMatch(mode: ModeId): void {
  game_.mode = mode;
  jamDunkPending = false;
  replayRing.clear();
  sprayTags.clear();
  broadcast.startIntro(venue.id);
  game_.scoreHome = 0;
  game_.scoreAway = 0;
  game_.matchT = 0;
  game_.jam = mode === "dunklab" ? 1 : 0.35;
  game_.target = QA_TARGET > 0 ? QA_TARGET : mode === "blacktop" ? 21 : 11;
  game_.servingTeam = "home";
  resetAthletes();

  hideResults();
  game_.stats = { home: { fga: 0, fgm: 0, dunks: 0, steals: 0, blocks: 0 }, away: { fga: 0, fgm: 0, dunks: 0, steals: 0, blocks: 0 } };
  // A finished tour (title or elimination) starts over from the round of 32, from the R key and the menu card alike.
  if (mode === "tour" && tourNeedsReset(game_.tour)) {
    game_.tour = { active: true, round: 0, eliminated: false, champion: false, opponents: [] };
  }
  const prevAway = game_.awaySquad;
  if (mode === "tour") {
    // opponents come from the squads you are not playing as
    const pool = SQUADS.filter((q) => q !== game_.homeSquad);
    const oppIdx = SQUADS.indexOf(pool[(game_.tour.round * 3 + Math.floor(rng() * 5)) % pool.length]!);
    game_.awaySquad = SQUADS[oppIdx]!;
    game_.tour.opponents[game_.tour.round] = oppIdx;
  } else if (game_.awaySquad === game_.homeSquad) {
    game_.awaySquad = SQUADS.find((q) => q !== game_.homeSquad)!;
  }
  // Street Tour climbs its own ladder; every other mode plays at the difficulty you picked.
  game_.diff = matchDifficulty(mode, game_.tour.round, game_.userDiff);
  if (game_.awaySquad !== prevAway) rebuildScene();

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

function releaseShot(a: AthleteState, quality: number, meterT = game_.shotMeter.t): void {
  // quality ∈ [0,1] timing accuracy → aim error mapping
  a.yaw = angTo(a.x, a.z, RIM[0], RIM[2]);
  const from: Vec3 = [a.x, 2.0 + a.y, a.z];
  const d = dist2d(a.x, a.z, RIM[0], RIM[2]);
  const isTwo = d > ARC_R;
  const perfect = quality > 0.985;
  const inGreen = quality > 0.9;
  // Aim error from the release read, distance, defender and skill; the rim and glass colliders decide make or miss.
  const def = nearestDefender(a);
  const defD = def ? dist2d(a.x, a.z, def.x, def.z) : 99;
  const contest = defD < 1.6 ? -0.28 : defD < 2.6 ? -0.1 : 0;
  const skill = a.team === "home" ? squadAimSkill(game_.homeSquad) : DIFFS[game_.diff].make + (squadAimSkill(game_.awaySquad) - 0.06);
  const err = aimError(quality, d, contest, skill, rng);
  const target: Vec3 = [RIM[0] + err.dx, RIM[1], RIM[2] + err.dz];
  shotStats.released += 1;
  game_.stats[a.team].fga += 1;

  const v = solveLaunch(from, target, GRAVITY);
  Object.assign(ball, {
    state: "flight" as BallState, x: from[0], y: from[1], z: from[2],
    vx: v[0], vy: v[1], vz: v[2], holder: -1, flightT: 0,
    hitRim: false, hitBoard: false, scored: false,
    swishOnly: perfect, shotValue: (isTwo ? 2 : 1) as 1 | 2, shooter: idxOf(a), blocked: false, looseT: 0, lastTouch: a.team
  });
  trailHist.length = 0;
  a.hasBall = false;
  a.shooting = false;
  closeMeter();
  setClip(a, "Release", 1.5);
  a.actionUntil = game_.time + 0.42;
  game_.phase = "shot";
  juiceFire("release", { position: from });
  const read = releaseRead(meterT, quality, game_.shotMeter.perfect);
  pushEvent("shot", perfect ? "release — PERFECT" : inGreen ? "release — green" : `release — ${read} ${(quality * 100) | 0}%`, perfect || inGreen ? "success" : "info");
  if (a.team === "home" && !game_.autopilot) showBanner(read === "perfect" ? "PERFECT RELEASE" : read === "green" ? "GREEN" : read === "early" ? "EARLY" : "LATE", 0.9);

  // Contest: a jumping defender within range may swat any release short of perfect
  if (def && def.jumpT > 0 && defD < 1.9 && canBlockRelease(quality)) {
    const blockP = (def.team === "away" ? 0.42 * DIFFS[game_.diff].contest : 0.5);
    if (rng() < blockP) {
      ball.vx = (ball.x - def.x) * 2.2 + (rng() - 0.5) * 3;
      ball.vy = 1.4;
      ball.vz = Math.abs(ball.vz) * 0.4 + 2.4;
      ball.blocked = true;
      ball.lastTouch = def.team;
      game_.stats[def.team].blocks += 1;
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
  game_.stats[a.team].fga += 1;
  // Contest at take-off: the nearest defender within 1.2 m may reject it (labs have no defenders on the floor).
  const def = nearestDefender(a);
  const defD = def ? defDist(a, def) : 99;
  if (def && game_.mode !== "dunklab" && game_.mode !== "handleslab") {
    const mine = a.team === "home" ? game_.homeSquad : game_.awaySquad;
    const theirs = def.team === "home" ? game_.homeSquad : game_.awaySquad;
    const p = dunkRejectChance({
      defenderDistance: defD,
      defenderAirborne: def.jumpT > 0,
      defenderStumbling: def.stumble > 0,
      dunk: mine.dunk + (jammed ? 2 : 0),
      defense: theirs.defense,
      contestScale: def.team === "away" ? DIFFS[game_.diff].contest : 1
    });
    if (p > 0 && rng() < p) {
      rejectDunk(a, def);
      return;
    }
  }
  a.dunkT = 0.0001;
  a.dunkKind = pkg;
  a.hasBall = false;
  Object.assign(ball, { state: "dunk" as BallState, holder: idxOf(a), x: a.x, y: 1.4, z: a.z, vx: 0, vy: 0, vz: 0, shotValue: 1 as const, shooter: idxOf(a), scored: false, flightT: 0, looseT: 0, lastTouch: a.team });
  trailHist.length = 0;
  setClip(a, "Jump_Loop", 1.45);
  if (jammed) {
    game_.jam = 0;
    game_.jamFull = false;
    flashJam();
    jamWrap?.classList.remove("full");
    juiceFire("jam", { position: [a.x, 2, a.z] });
    cue("fireIgnite");
    jamDunkPending = true;
  } else {
    juiceFire("dunk", { position: [a.x, 2, a.z] });
  }
  pushEvent("dunk", `${pkg.toLowerCase()} attempt`, "info");
}

/** A contested dunk swatted at take-off: the ball pops loose away from the rim and the rebound battle is on. */
function rejectDunk(a: AthleteState, def: AthleteState): void {
  a.hasBall = false;
  a.jumpT = 0.0001; a.vy = 3.6;
  setClip(a, "Jump_Loop", 1.45);
  def.jumpT = Math.max(def.jumpT, 0.0001); def.vy = Math.max(def.vy, 5.4);
  setClip(def, "Contest", 1.35);
  const away = Math.atan2(a.x - RIM[0], a.z - RIM[2]);
  Object.assign(ball, {
    state: "loose" as BallState, holder: -1, x: a.x, y: 2.6, z: a.z,
    vx: Math.sin(away) * 3.2 + (rng() - 0.5) * 1.6, vy: 2.2, vz: Math.cos(away) * 3.2,
    scored: false, blocked: true, hitRim: false, hitBoard: false, flightT: 0, looseT: 0, lastTouch: def.team
  });
  trailHist.length = 0;
  game_.phase = "live";
  game_.stats[def.team].blocks += 1;
  juiceFire("block", { position: [a.x, 2.6, a.z] });
  showBanner("REJECTED", 1.1);
  pushEvent("block", `REJECTED — ${def.team === "home" ? "your stop" : "cpu stop"}`, def.team === "home" ? "success" : "warning");
}

function finishDunk(a: AthleteState): void {
  const pts = 1;
  game_.stats[a.team].fgm += 1;
  game_.stats[a.team].dunks += 1;
  game_.jam = clamp(game_.jam + 0.22, 0, 1);
  juiceFire("dunk", { position: [RIM[0], RIM[1], RIM[2]] });
  if (jamDunkPending) {
    jamDunkPending = false;
    if (!LOOK_ORIGINAL) {
      try { sprayTags.stamp((auraApp as any).effects, COURT_RIGS[venue.id].sprayTag, [RIM[0], RIM[1], RIM[2]], game_.time); } catch { /* fx best-effort */ }
    }
    if (replayRing.size > 1 && broadcast.startReplay()) replayClip = replayRing.snapshot();
  }
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
const hoopsBounce = createHandBounce({ ballRadius: BALL_R });
const dribbleClock = { key: "" };
const bouncePhase = (key: string): number => (dribbleClock.key === key ? hoopsBounce.state().phase : 0);
let dribbleEvidence: { t: number; palmY: number; ballY: number; moving: boolean } | null = null;

function stepBallSim(dt: number): void {
  dribbleHand = null;
  dribbleEvidence = null;
  if (ball.state === "flight" || ball.state === "loose" || ball.state === "pass") {
    const prev: Vec3 = [ball.x, ball.y, ball.z];
    ball.flightT += dt;
    advanceShotBall(hoopWorld, ball, BALL_R, dt, GRAVITY);
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

    // Rim and glass contacts are resolved by the swept impact step above (hoopWorld); here only the make is read off.
    if (!ball.scored && crossedRimDownward(prev, [ball.x, ball.y, ball.z], RIM)) {
      ball.scored = true;
      const swish = !ball.hitRim && !ball.hitBoard;
      shotStats.made += 1;
      if (swish) shotStats.swishes += 1;
      else if (ball.hitBoard && !ball.hitRim) shotStats.bankShots += 1;
      else shotStats.rimRolls += 1;
      netPulse = 1;
      game_.jam = clamp(game_.jam + (swish ? 0.2 : 0.12), 0, 1);
      if (swish) { juiceFire("swish", { position: [RIM[0], RIM[1] - 0.2, RIM[2]] }); }
      else { cue("swish"); }
      const scorer = athletes[ball.shooter];
      if (scorer) {
        game_.stats[scorer.team].fgm += 1;
        crowdSwell();
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

    // Out of play → dead ball → the team that did not touch it last checks it. A made basket is handled by the score
    // phase (winner's ball), so its loose ball never counts as dead.
    if (!ball.scored && (game_.phase === "live" || game_.phase === "shot") && isDeadBall(ball)) {
      pushEvent("ball", "dead ball", "info");
      enterCheck(deadBallPossession(ball.lastTouch));
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
      ball.scored = true; ball.looseT = 0; ball.flightT = 0;
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
        hoopsBounce.reset();
      }
      // syncAthlete solves the dribble palm (two-bone IK over the live
      // shoulder) every frame and publishes it through dribbleAims; the ball
      // rides that same cycle (library createHandBounce), so palm and ball stay
      // phase-locked whether the handler is standing or driving. Contact point
      // tracks the palm as RENDERED (the arm may not reach its target); at the
      // check the dead ball sits in the targeted palm and the phase is held.
      const aim = dribbleAims.get(h.nodeId);
      const rig = heldRig.get(h.nodeId);
      const checkNow = game_.phase === "check";
      const palmNow: Vec3 | undefined = aim ? (checkNow ? aim.palm : aim.actual ?? aim.palm) : rig?.palm;
      const frame = hoopsBounce.step(dt, {
        moving,
        shoulderY: aim?.shoulderY ?? rig?.shoulderY ?? DRIB_SHOULDER_FALLBACK,
        palm: palmNow,
        holder: { x: h.x, z: h.z, vx: h.vx, vz: h.vz },
        hold: checkNow
      });
      const cyc = dribbleCycleY(frame.phase, aim?.shoulderY ?? rig?.shoulderY ?? DRIB_SHOULDER_FALLBACK, moving);
      const prevY = ball.y;
      if (palmNow) {
        const tgt = aim?.palm ?? palmNow;
        dribbleHand = {
          x: tgt[0], y: tgt[1], z: tgt[2],
          socket: true, forearmValid: true, socketApi: true,
          raw: [tgt[0], tgt[1], tgt[2]], point: [tgt[0], tgt[1], tgt[2]]
        };
        if (h.shooting) {
          ball.x = h.x + Math.sin(h.yaw) * 0.22;
          ball.z = h.z + Math.cos(h.yaw) * 0.22;
          ball.y = 1.65 + h.y + game_.shotMeter.t * 0.35;
        } else {
          ball.x = frame.ball[0];
          ball.y = frame.ball[1];
          ball.z = frame.ball[2];
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
        t: frame.phase,
        palmY: palmNow ? palmNow[1] : cyc.palmY,
        ballY: ball.y,
        moving: frame.moving
      };
      if (!h.shooting && game_.phase !== "check" && prevY > 0.28 && ball.y <= 0.22) cue("dribble");
    } else {
      dribbleClock.key = "";
    }
  }
}

/** After every athlete has been synced for the frame: put the held ball exactly under the hand as it is drawn now (body, yaw and pose are current). */
function refreshHeldBall(): void {
  if (ball.state !== "held" && ball.state !== "dribbleAir" && ball.state !== "parked") return;
  const h = athletes[ball.holder];
  if (!h || !h.hasBall || h.shooting || game_.phase === "check" || h.dunkT > 0) return;
  const aim = dribbleAims.get(h.nodeId);
  const rig = heldRig.get(h.nodeId);
  const switched = poseKindOf.get(h.nodeId)?.changedAt === framesRendered;
  const palm = switched ? aim?.palm ?? rig?.palm : aim?.actual ?? rig?.palm;
  if (!palm) return;
  const f = hoopsBounce.place({ palm, holder: { x: h.x, z: h.z, vx: h.vx, vz: h.vz } });
  ball.x = f.ball[0]; ball.y = f.ball[1]; ball.z = f.ball[2];
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
  const speed = PLAYER_SPEED * 0.82 * diff.cpuSpeed * squadSpeedScale(squad);
  if (a.hasBall) {
    if (QA_STAND && !a.shooting) { a.vx = 0; a.vz = 0; return; } // measurement: an AI handler that stands and pounds the ball
    // CPU ball-handler: drive / pullup / pass
    const dRim = dist2d(a.x, a.z, RIM[0], RIM[2]);
    const def = nearestDefender(a);
    const defD = def ? dist2d(a.x, a.z, def.x, def.z) : 99;
    if (a.shooting) {
      a.meterT += dt / 0.72;
      if (a.meterT >= (0.7 + (rng() - 0.5) * 0.06)) {
        releaseShot(a, 0.64 + rng() * 0.32, a.meterT);
      }
      return;
    }
    a.aiT -= dt;
    if (a.dunkT > 0) return;
    // Take-back: after a defensive board the CPU must dribble it out past the arc before it can shoot, pass or dunk.
    if (game_.mustClear) {
      a.aiPlan = "clear";
      const [cx, cz] = clearTarget(a.x, a.z, RIM, ARC_R);
      a.tx = cx; a.tz = cz;
      aiMove(a, cx, cz, dt, speed);
      return;
    }
    if (dRim < DUNK_RANGE && a.aiPlan === "drive") {
      if (a.dunkIntent) { startDunk(a, "POWER JAM"); return; }
      // pull up instead of a guaranteed slam
      a.aiPlan = "pullup";
      a.shooting = true;
      a.meterT = 0;
      setClip(a, "Load");
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
      a.dunkIntent = rng() < CPU_DUNK_RATE[game_.diff];
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
  const [first, second] = defenderRanks(holder);
  const onBall = first === a;
  const help = second === a;
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

/** The two CPU defenders closest to the home handler, computed once per frame (it used to sort per defender). */
let rankFrame = -1;
const ranks: [AthleteState | undefined, AthleteState | undefined] = [undefined, undefined];
function defenderRanks(holder: AthleteState): readonly [AthleteState | undefined, AthleteState | undefined] {
  if (rankFrame === framesRendered) return ranks;
  rankFrame = framesRendered;
  ranks[0] = nearestOf(awayTeam(), holder.x, holder.z);
  ranks[1] = nearestOf(awayTeam(), holder.x, holder.z, ranks[0]);
  return ranks;
}

function attemptSteal(def: AthleteState, holder: AthleteState): void {
  const base = (def.team === "away" ? 0.34 * DIFFS[game_.diff].contest : 0.42) * squadStealScale(def.team === "home" ? game_.homeSquad : game_.awaySquad);
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
    ball.flightT = 0; ball.looseT = 0; ball.lastTouch = def.team; ball.scored = false; ball.blocked = false;
    trailHist.length = 0;
    game_.stats[def.team].steals += 1;
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
    holder: -1, passTarget: idxOf(recv), flightT: 0, looseT: 0, lastTouch: a.team
  });
  trailHist.length = 0;
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
      releaseShot(me, game_.autopilot ? 0.58 + rng() * 0.4 : 0.96);
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
      if (game_.jamFull && !game_.mustClear && dist2d(me.x, me.z, RIM[0], RIM[2]) < DUNK_RANGE + 0.6) {
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
      if (game_.jamFull && !game_.mustClear && dist2d(me.x, me.z, RIM[0], RIM[2]) < DUNK_RANGE + 0.6) {
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
      if (game_.jamFull && !game_.mustClear && dist2d(me.x, me.z, RIM[0], RIM[2]) < DUNK_RANGE + 1.2) {
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
    // Shoot: press-hold-release meter OR rim-run dunk. Not on the check press itself (CHECK_SHOT_GUARD), and not
    // before a defensive board has been taken back past the arc.
    if (pressed("shoot", "Space", "Enter") && game_.time - game_.liveSince >= CHECK_SHOT_GUARD) {
      const dRim = dist2d(me.x, me.z, RIM[0], RIM[2]);
      if (game_.mustClear) {
        showPrompt("TAKE IT BACK — PAST THE ARC FIRST", 0.9);
        pushEvent("rules", "take it back before you score", "warning");
      } else {
        const driving = dRim < DUNK_RANGE && Math.hypot(me.vx, me.vz) > 1.4 && (me.vz < 0 || dRim < 1.4);
        if (driving || (game_.jamFull && dRim < DUNK_RANGE)) {
          startDunk(me, "auto");
        } else if (!game_.shotMeter.active) {
          openMeter(me);
        }
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

  // Meter release: the shot leaves at the needle's real position. An early tap is an early brick, holding to the end of
  // the meter is a late brick (the needle stops at 1, it no longer wraps back into a free "tap" make).
  if (game_.shotMeter.active && me.shooting) {
    const shootHeld = held("shoot", "Space", "Enter");
    const sm = game_.shotMeter;
    if ((!shootHeld && sm.frames > 1) || sm.t >= 1) {
      releaseShot(me, meterQuality(sm.t, sm.g0, sm.g1, sm.perfect), sm.t);
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
  ball.lastTouch = a.team;
  ball.flightT = 0; ball.looseT = 0;
  trailHist.length = 0;
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
  if (game_.mustClear) {
    a.aiPlan = "clear";
    [a.tx, a.tz] = clearTarget(a.x, a.z, RIM, ARC_R);
  } else {
    a.aiPlan = "drive";
    a.dunkIntent = rng() < CPU_DUNK_RATE[game_.diff];
    a.tx = a.x * 1.4; a.tz = 9.0;
  }
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

const lastRenderedPalm = new Map<string, Vec3>();
/** The rendered palm advanced by one frame of its own motion relative to the body (the socket holds last frame's pose; the body is already current). */
function renderedPalmLead(a: AthleteState, root: AnyHandle): Vec3 | undefined {
  const p = renderedPalm(a, root);
  if (!p) { lastRenderedPalm.delete(a.nodeId); return undefined; }
  const local: Vec3 = [p[0] - a.x, p[1], p[2] - a.z];
  const prev = lastRenderedPalm.get(a.nodeId);
  lastRenderedPalm.set(a.nodeId, local);
  if (!prev) return p;
  const dx = local[0] - prev[0], dy = local[1] - prev[1], dz = local[2] - prev[2];
  if (Math.hypot(dx, dy, dz) > 0.2) return p;
  return [p[0] + dx * QA_LEAD, p[1] + dy * QA_LEAD, p[2] + dz * QA_LEAD];
}

/** The dribbling palm as the skinned arm really rendered it (forearm bone + palm offset), or undefined until the sockets load. */
function renderedPalm(a: AthleteState, root: AnyHandle): Vec3 | undefined {
  const fore = (root as any)?.animation?.socket?.("RightForearm") as BoneSocketView | undefined;
  if (!fore?.valid) return undefined;
  return athleteLocalToWorld(a, mat4Point(fore.worldMatrix(), PALM_OFFSET_R));
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

  // `scaleMode: "fit"` grounds the model's lowest point on the node position, so the node sits at floor height (+ jump height):
  // adding half the body height here lifted every athlete 0.96 m off the floor, away from its ring, shadow and the ball.
  r.root.setPosition(a.x, a.y + bob, a.z).setRotation(0, a.yaw, 0);
  sampleFeet(a, r.root);

  // Clip selection with hysteresis when nothing explicit is playing
  if (!a.shooting && a.dunkT <= 0 && a.jumpT <= 0 && a.stumble <= 0 && a.actionUntil <= 0) {
    const idleClip = a.hasBall ? "Crouch_Idle_Loop" : "Ready";
    const pick = pickLocomotion(speed, a.clip);
    if (pick.clip === "idle") setClip(a, idleClip, 1.0);
    else setClip(a, pick.clip, pick.rate);
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
  const cycleT = bouncePhase(a.nodeId);
  const poseKind = stanceNow ? "stance" : carryNow ? "carry" : "clip";
  const lastKind = poseKindOf.get(a.nodeId);
  if (!lastKind || lastKind.kind !== poseKind) poseKindOf.set(a.nodeId, { kind: poseKind, changedAt: framesRendered });
  const rigPalm = holdsBall ? renderedPalmLead(a, r.root) : undefined;
  if (holdsBall) {
    heldRig.set(a.nodeId, { palm: rigPalm, shoulderY: upperR?.valid === true ? mat4Translation(upperR.worldMatrix())[1] + 0.96 + a.y : undefined });
  } else {
    heldRig.delete(a.nodeId);
  }
  const shoulderOf = (upper: { worldMatrix(out?: Float32Array): ArrayLike<number> }): Vec3 =>
    mat4Translation(upper.worldMatrix());
  let aimed: DribbleAim | undefined;
  if (stanceNow) {
    const shoulderR = upperR ? shoulderOf(upperR) : undefined;
    const shoulderL = upperL ? shoulderOf(upperL) : undefined;
    const shoulderY = shoulderR ? shoulderR[1] + 0.96 + a.y : DRIB_SHOULDER_FALLBACK;
    // Phase-coupled cycle — the same dribbleCycleY that positions the ball in
    // stepBallSim drives the palm here, so hand and ball ride as one.
    const cyc = dribbleCycleY(cycleT, shoulderY);
    const bones: Record<string, { rotation?: Quat; position?: { x: number; y: number; z: number } }> =
      stanceLegs(dribbleNow && !checkHold ? cyc.effort : 0);
    if (dribbleNow) {
      // Lean over the ball; the torso dips hard into each push because the arm
      // alone cannot reach the low bounce (arm 0.56m from a ~1.2m shoulder).
      const effort = checkHold ? 0 : cyc.effort;
      const lean = handBounceOverlayAngles(effort, false);
      bones.Spine = { rotation: qX(checkHold ? 0.16 : lean.spine) };
      bones.Chest = { rotation: qX(checkHold ? 0.10 : lean.chest) };
      bones.Head = { rotation: qX(lean.head) };
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
          ? [shoulderR[0] - 0.06, cyc.palmY - 0.96 - a.y, shoulderR[2] + 0.14]
          : [shoulderR[0] - 0.03, shoulderR[1] - IDLE_HAND_DROP, shoulderR[2] + 0.03];
      const palmL: Vec3 = checkHold
        ? [shoulderL[0] - 0.04, shoulderL[1] - 0.42, shoulderL[2] + 0.10]
        : dribbleNow
          ? [shoulderL[0] - 0.04, shoulderL[1] - 0.34, shoulderL[2] + 0.16]
          : [shoulderL[0] + 0.03, shoulderL[1] - IDLE_HAND_DROP, shoulderL[2] + 0.03];
      // Dribbling elbow stays tucked into the ribs and drives down with the
      // pound; idle arms hang close so nobody reads as a stiff A-pose.
      const flare = dribbleNow ? 0.22 : 0.06;
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
          actual: rigPalm,
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
    const cyc = dribbleCycleY(cycleT, shoulderY, true);
    // Upper-body-only run dribble: the torso bends over the ball at the waist (a steady lean plus a push dip) so the
    // dribbling shoulder comes down far enough for the arm to follow the ball. Legs, hips and feet stay on the clip.
    const lean = handBounceOverlayAngles(cyc.effort, true, QA_LEAN);
    const bones: Record<string, { rotation?: Quat; position?: { x: number; y: number; z: number } }> = {
      Spine: { rotation: qX(lean.spine) },
      Chest: { rotation: qX(lean.chest) },
      Head: { rotation: qX(lean.head) }
    };
    // The contact point leads the handler in the movement direction (yaw
    // tracks velocity); the off hand guards near the body instead of mirroring.
    const palmR: Vec3 = [shoulderR[0] - 0.06, cyc.palmY - 0.96 - a.y, shoulderR[2] + 0.12];
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
      actual: rigPalm,
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
  syncHeadLook(a, anim, holdsBall, dt);

  // Ground rings & shadow
  r.shadow?.setPosition(a.x, 0.012, a.z).setScale([1 - a.y * 0.14, 1, 1 - a.y * 0.14]).setVisible(true);
  const ringS = a.controlled ? 1.06 : a.hasBall ? 1.0 : 0.82;
  r.ring?.setPosition(a.x, 0.018, a.z).setScale([ringS, ringS, ringS]).setVisible(true);
  // Jam aura
  const auraOn = game_.jamFull && a.team === "home" && a.hasBall;
  r.aura?.setPosition(a.x, a.y + 0.95, a.z).setScale(auraOn ? [0.9, 1.9, 0.9] : HIDDEN).setVisible(auraOn); // fit-grounding: ok (a centre-based cylinder primitive)
}

/**
 * H47-AN1 head look-at (new look only): an off-ball athlete that is not in a
 * shot, dunk, jump, stumble or action clip turns its head toward the ball
 * through the engine's last-in-order pose override. The ball handler keeps the
 * dribble pose's head lean (it already looks down at the ball), and every
 * other case clears the override so the clip owns the head again.
 */
function syncHeadLook(a: AthleteState, anim: any, holdsBall: boolean, dt: number): void {
  const pose = anim?.pose;
  if (typeof pose?.setLocalRotation !== "function") return;
  const wants = !LOOK_ORIGINAL && !holdsBall && !a.shooting && a.dunkT <= 0 && a.jumpT <= 0 &&
    a.stumble <= 0 && a.actionUntil <= 0;
  const head = wants ? anim.socket?.("Head") : undefined;
  const neck = wants ? anim.socket?.("Neck") : undefined;
  const parent = neck?.valid === true ? neck : wants ? anim.socket?.("Chest") : undefined;
  if (!wants || head?.valid !== true || parent?.valid !== true) {
    if (headLookOn.delete(a.nodeId)) pose.clear?.("Head");
    return;
  }
  const target = worldToActor([ball.x, ball.y, ball.z], a.x, a.y, a.z, a.yaw);
  const goal = headLookAngles(mat4Translation(head.worldMatrix()), target, qFromMat4(parent.worldMatrix()));
  const next = stepHeadLook(headLookOn.get(a.nodeId) ?? { yaw: 0, pitch: 0 }, goal, dt, reducedMotion);
  headLookOn.set(a.nodeId, next);
  headLookStats.frames++;
  if (Math.abs(goal.yaw - next.yaw) <= (25 * Math.PI) / 180) headLookStats.within25++;
  pose.setLocalRotation("Head", headLookQuat(next));
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

/** Courtside poles per venue as [x, z, clearance radius] (floodlights, lamps, palms); see buildVenueDressing. */
function cameraObstacles(v: VenueSpec): readonly (readonly [number, number, number])[] {
  switch (v.id) {
    // floodlights are fitted to 8.6-9.2 m tall, which makes the model about 3.2 m wide
    case "rucker": return [[-11, -7, 2.2], [11, -7, 2.2], [-11, 13, 2.2], [11, 13, 2.2]];
    // the Manila floodlights stand only on ?look=original (H47-L2 hangs bulb strings under the roof instead)
    case "manila": return LOOK_ORIGINAL ? [[-13, -4, 2.2], [13, -4, 2.2], [-13, 12, 2.2], [13, 12, 2.2]] : [];
    case "shanghai": return [[-9, -3.2, 1.8], [9, -3.2, 1.8], [-9, 11.5, 1.8], [9, 11.5, 1.8], [-12, 4, 1.8], [12, 4, 1.8]];
    case "venice": return [[-12, -8, 2.2], [12.5, -10, 2.2], [-14, 12, 2.2], [14, 14, 2.2], [-9, 16, 2.2]];
    default: return [];
  }
}
/** Distance in the floor plane from (px, pz) to the segment a-b. */
function segDist(ax: number, az: number, bx: number, bz: number, px: number, pz: number): number {
  const dx = bx - ax, dz = bz - az;
  const l2 = dx * dx + dz * dz || 1;
  const t = clamp(((px - ax) * dx + (pz - az) * dz) / l2, 0, 1);
  return Math.hypot(ax + dx * t - px, az + dz * t - pz);
}
const sightBlocked = (eye: Vec3, target: Vec3): boolean =>
  cameraObstacles(venue).some(([ox, oz, r]) => segDist(eye[0], eye[2], target[0], target[2], ox, oz) < r);
/** When a pole stands between the chase eye and the play, swing the eye to the other side of the handler, or else lift it over. */
function clearSight(eye: Vec3, target: Vec3): void {
  if (!sightBlocked(eye, target)) return;
  const mirrored: Vec3 = [2 * target[0] - eye[0], eye[1], eye[2]];
  if (!sightBlocked(mirrored, target)) { eye[0] = mirrored[0]; return; }
  eye[1] = Math.max(eye[1], 9.5);
}
function pushEyeClear(eye: Vec3): void {
  for (const [ox, oz, r] of cameraObstacles(venue)) {
    const dx = eye[0] - ox, dz = eye[2] - oz;
    const d = Math.hypot(dx, dz);
    if (d >= r) continue;
    // step toward the court centre line, where there is never a pole
    const ux = d > 1e-3 ? dx / d : -Math.sign(ox) || 1, uz = d > 1e-3 ? dz / d : 0;
    eye[0] = ox + ux * r; eye[2] = oz + uz * r;
  }
}
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
      // H47-C1: long-lens shot cam on the new look (fov 34, 2 m lower, farther out); ?look=original keeps 4.6.
      const so = LOOK_ORIGINAL ? [7.6, 4.9, 5.2] : LIVE_CAM.shot.offset;
      want = {
        eye: [ball.x + so[0]!, so[1]! + cam.punch * 0.2, ball.z + so[2]!],
        target: [ball.x - 0.2, Math.max(1.5, ball.y), ball.z - 0.8],
        fov: (LOOK_ORIGINAL ? 44 : LIVE_CAM.shot.fov) + cam.punch
      };
    } else {
      const hx = holder?.x ?? ball.x;
      const hz = Math.max(holder?.z ?? ball.z, ball.z);
      want = QA_CAM_FRONT && holder
        // measurement: a close, elevated view from in front of the handler on the dribbling-hand side (hand over ball)
        ? (() => {
          const cy = Math.cos(holder.yaw), sn = Math.sin(holder.yaw);
          const at = (lx: number, ly: number, lz: number): Vec3 => [holder.x + cy * lx + sn * lz, ly, holder.z - sn * lx + cy * lz];
          return { eye: at(-1.9, 1.8, 2.3), target: at(-0.05, 0.75, 0.2), fov: 40 };
        })()
        : LOOK_ORIGINAL
          ? { eye: [hx + 5.6, 3.0, hz + 4.2], target: [hx - 0.2, 1.1, hz - 0.9], fov: 38 + cam.punch }
          // H47-C1: long-lens chase (fov 32, eye 0.8 m lower and farther out)
          : {
            eye: [hx + LIVE_CAM.chase.offset[0], LIVE_CAM.chase.offset[1], hz + LIVE_CAM.chase.offset[2]],
            target: [hx + LIVE_CAM.chase.targetOffset[0], LIVE_CAM.chase.targetOffset[1], hz + LIVE_CAM.chase.targetOffset[2]],
            fov: LIVE_CAM.chase.fov + cam.punch
          };
    }
  }
  // The low chase eye (handler + (5.6, 3.0, 4.2)) can look straight through a courtside pole: the Rucker floodlight at
  // (11, 13) filled the right third of the frame with the handler at (6.4, 11.5) (remote runs g07-after2, g07-final-screens).
  // Swing the eye to the clear side, then push it out of any pole it still stands in.
  if (game_.phase !== "menu") { clearSight(want.eye, want.target); pushEyeClear(want.eye); }
  const k = 1 - Math.pow(0.02, dt);
  cam.eye = [lerp(cam.eye[0], want.eye[0], k), lerp(cam.eye[1], want.eye[1], k), lerp(cam.eye[2], want.eye[2], k)];
  cam.target = [lerp(cam.target[0], want.target[0], k), lerp(cam.target[1], want.target[1], k), lerp(cam.target[2], want.target[2], k)];
  cam.fov = lerp(cam.fov, want.fov, k);
  cam.punch = lerp(cam.punch, 0, 1 - Math.pow(0.05, dt));
  drawCameraPose(cam.eye, cam.target, cam.fov);
}

/** DOM writes only when the value changes (the HUD used to rewrite every node every frame). */
const domCache = new WeakMap<object, string>();
function setText(node: Node | null | undefined, text: string): void {
  if (!node || domCache.get(node) === text) return;
  domCache.set(node, text);
  node.textContent = text;
}
function setStyle(node: HTMLElement | null | undefined, prop: "width" | "left" | "display", value: string): void {
  if (!node) return;
  const key = `${prop}:${value}`;
  const cacheKey = (node as any)[`__a3dStyle_${prop}`];
  if (cacheKey === key) return;
  (node as any)[`__a3dStyle_${prop}`] = key;
  node.style[prop] = value;
}

/** H47-H1: the score text the in-world board shows (equal to the DOM score bug). */
function currentBoardScore(): string {
  return scoreboardText(game_.scoreHome, game_.scoreAway, game_.mode === "dunklab" || game_.mode === "handleslab");
}
function syncBoardScore(): void {
  if (LOOK_ORIGINAL || venue.id !== "rucker" || !auraApp) return;
  const text = currentBoardScore();
  if (text === shownBoardScore) return;
  try {
    const nodes = auraApp.nodes as unknown as { remove(id: string): boolean; add(node: unknown): unknown };
    nodes.remove(SCOREBOARD_NODE_ID);
    nodes.add(scoreboardNode(text));
    shownBoardScore = text;
  } catch { /* in-world score best-effort */ }
}
function syncHud(): void {
  syncBoardScore();
  const lab = game_.mode === "dunklab" || game_.mode === "handleslab";
  setText(hudHomeName, game_.homeSquad.short);
  setText(hudAwayName, lab ? "LAB" : game_.awaySquad.short);
  setText(hudHomeScore, `${game_.scoreHome}`);
  setText(hudAwayScore, lab ? "—" : `${game_.scoreAway}`);
  setText(hudHomePoss, game_.possession === "home" ? "● BALL" : "");
  setText(hudAwayPoss, game_.possession === "away" ? "● BALL" : "");
  setText(hudTarget, game_.mode === "dunklab" ? "FREE RUN" : game_.mode === "handleslab" ? "CONE DRILL" : `FIRST TO ${game_.target}`);
  if (hudClock) {
    const mm = Math.floor(game_.matchT / 60);
    const ss = Math.floor(game_.matchT % 60).toString().padStart(2, "0");
    setText(hudClock, game_.phase === "check" ? "CHECK" : game_.phase === "shot" ? "SHOT" : game_.phase === "score" ? "BUCKET" : game_.phase === "gameover" ? "FINAL" : game_.phase === "menu" ? "STREET" : `${mm}:${ss}`);
  }
  setText(hudVenue, venue.label);
  setText(hudCourtChip?.firstChild, `${venue.label}`);
  setText(hudLookChip, venue.lookLabel);
  setStyle(jamFill, "width", `${Math.round(game_.jam * 100)}%`);
  const jamNowFull = game_.jam >= 1;
  if (jamNowFull !== game_.jamFull) {
    game_.jamFull = jamNowFull;
    jamWrap?.classList.toggle("full", jamNowFull);
    if (jamNowFull) { flashJam(); cue("fireIgnite"); showBanner("JAM METER FULL"); pushEvent("jam", "jam meter loaded — attack the rim", "success"); }
  }
  setStyle(hudTourChip, "display", game_.mode === "tour" ? "" : "none");
  if (game_.mode === "tour") {
    setText(hudTourRound, game_.tour.champion ? "CHAMPION" : game_.tour.eliminated ? "ELIMINATED" : `ROUND OF ${[32, 16, 8, 4, 2][game_.tour.round] ?? 2}`);
  }
  setStyle(hudLabChip, "display", lab ? "" : "none");
  if (lab) {
    setText(hudLabLine, game_.mode === "dunklab"
      ? `SCORE ${game_.lab.score} · STREAK ${game_.lab.streak}`
      : `CONES ${game_.cones.cleared} · STREAK ${game_.cones.streak} · STYLE ${game_.lab.style}`);
  }
  // Shot meter
  const sm = game_.shotMeter;
  setStyle(smGreen, "left", `${sm.g0 * 100}%`); setStyle(smGreen, "width", `${(sm.g1 - sm.g0) * 100}%`);
  setStyle(smPerfect, "left", `${(sm.perfect - 0.012) * 100}%`); setStyle(smPerfect, "width", "2.4%");
  setStyle(smNeedle, "left", `${clamp(sm.t, 0, 1) * 100}%`);
  setText(smLabel, sm.active ? (sm.t < sm.g0 ? "CHARGING…" : sm.t <= sm.g1 ? "RELEASE NOW" : "LATE") : "RELEASE IN THE GREEN");
}

/** Where a bone-relative point of an athlete really is in the world (sockets are in the model's native space, whose origin is 0.96 m above the grounded feet). */
function athleteLocalToWorld(a: AthleteState, p: Vec3): Vec3 {
  const cy = Math.cos(a.yaw), sn = Math.sin(a.yaw);
  return [a.x + cy * p[0] + sn * p[2], 0.96 + a.y + p[1], a.z - sn * p[0] + cy * p[2]];
}

/** Diagnostics (?diag=1): the rendered right palm and hips of every athlete beside the sim ball, to measure hand-to-ball distance. */
function handProbe(): Record<string, unknown> | null {
  if (initialParams.get("diag") !== "1") return null;
  const out: Record<string, unknown> = {};
  athletes.forEach((a, i) => {
    const anim = (rigs[i]?.root as any)?.animation;
    if (typeof anim?.socket !== "function") return;
    const fore = anim.socket("RightForearm") as BoneSocketView;
    const hips = anim.socket("Hips") as BoneSocketView;
    const rec: Record<string, unknown> = { sim: [Number(a.x.toFixed(2)), Number(a.z.toFixed(2))], hasBall: a.hasBall, yaw: Number(a.yaw.toFixed(2)) };
    if (fore?.valid) rec.palm = athleteLocalToWorld(a, mat4Point(fore.worldMatrix(), PALM_OFFSET_R)).map((v) => Number(v.toFixed(3)));
    const foreL = anim.socket("LeftForearm") as BoneSocketView;
    if (foreL?.valid) rec.palmL = athleteLocalToWorld(a, mat4Point(foreL.worldMatrix(), PALM_OFFSET_L)).map((v) => Number(v.toFixed(3)));
    const elbow = fore?.valid ? athleteLocalToWorld(a, mat4Translation(fore.worldMatrix())) : undefined;
    if (elbow) rec.elbow = elbow.map((v) => Number(v.toFixed(3)));
    if (hips?.valid) rec.hips = athleteLocalToWorld(a, mat4Translation(hips.worldMatrix())).map((v) => Number(v.toFixed(3)));
    const bnd = (rigs[i]?.root as any)?.bounds?.();
    if (bnd?.min && bnd?.max) rec.bounds = { min: [bnd.min[0], bnd.min[1], bnd.min[2]].map((v: number) => Number(v.toFixed(3))), max: [bnd.max[0], bnd.max[1], bnd.max[2]].map((v: number) => Number(v.toFixed(3))) };
    const footL = anim.socket("LeftFoot") as BoneSocketView;
    if (footL?.valid) rec.footL = athleteLocalToWorld(a, mat4Translation(footL.worldMatrix())).map((v) => Number(v.toFixed(3)));
    const upper = anim.socket("RightUpperArm") as BoneSocketView;
    if (upper?.valid) rec.shoulder = athleteLocalToWorld(a, mat4Translation(upper.worldMatrix())).map((v) => Number(v.toFixed(3)));
    out[a.nodeId] = rec;
  });
  return out;
}

/**
 * The evidence snapshot allocates (event log copy, per-athlete records): publish it every 10th frame, or after 250 ms on a
 * slow device, or when the phase changes, instead of on every frame.
 */
let lastPublishAt = -Infinity;
let lastPublishedPhase = "";
/**
 * The pose the renderer was last handed (live chase, sub-step blend, broadcast intro rail or replay). QA crops project
 * from it: `cam` keeps the live chase pose while an intro or replay draws, so crops from `cam` missed the frame.
 */
const drawnPose: { eye: Vec3; target: Vec3; fov: number } = { eye: [...cam.eye] as Vec3, target: [...cam.target] as Vec3, fov: cam.fov };
function drawCameraPose(eye: readonly number[], target: readonly number[], fov: number): void {
  drawnPose.eye = [eye[0]!, eye[1]!, eye[2]!]; drawnPose.target = [target[0]!, target[1]!, target[2]!]; drawnPose.fov = fov;
  try { (auraApp as any).camera?.setPose?.({ position: eye, target, fov }); } catch { /* camera ext optional */ }
}
/** QA crops for E-I's luma capture: feet of the controlled athlete, the ball, the rim, the court floor and the lamp. */
function publishQaCrops(): void {
  const me = controlledAthlete() ?? athletes[0];
  const subjects: QaCropSubject[] = [
    { name: "floor", at: [0, 0, 4], half: [3, 2] },
    { name: "rim", at: [RIM[0], RIM[1], RIM[2]], half: [0.9, 0.7] },
    { name: "ball", at: [ball.x, ball.y, ball.z], half: [0.35, 0.35] }
  ];
  if (me) subjects.push({ name: "feet", at: [me.x, 0.15, me.z], half: [0.6, 0.25] });
  const canvas = document.querySelector<HTMLCanvasElement>("#app canvas");
  const aspect = canvas && canvas.clientHeight > 0 ? canvas.clientWidth / canvas.clientHeight : 16 / 9;
  // The lamp crop is the nearest practical on screen (practicals[0] stands behind the broadcast eye at Rucker, so its
  // crop was never published); the rect hugs the lamp head itself.
  if (!LOOK_ORIGINAL) {
    const lamp = COURT_RIGS[venue.id].practicals
      .map((p) => ({ name: "lamp", at: p.position, half: [0.8, 0.3] as const }))
      .filter((sub) => projectCrops(drawnPose.eye, drawnPose.target, drawnPose.fov, aspect, [sub]).length > 0)
      .sort((a, b) => Math.hypot(a.at[0] - drawnPose.eye[0], a.at[1] - drawnPose.eye[1], a.at[2] - drawnPose.eye[2]) - Math.hypot(b.at[0] - drawnPose.eye[0], b.at[1] - drawnPose.eye[1], b.at[2] - drawnPose.eye[2]))[0];
    if (lamp) subjects.push(lamp);
  }
  const w = window as unknown as { __AURA_QA__?: Record<string, unknown> };
  w.__AURA_QA__ = { ...(w.__AURA_QA__ ?? {}), crops: projectCrops(drawnPose.eye, drawnPose.target, drawnPose.fov, aspect, subjects) };
}

function publishEvidence(force = false): void {
  const nowMs = performance.now();
  if (!force && framesRendered % 10 !== 0 && nowMs - lastPublishAt < 250 && game_.phase === lastPublishedPhase) return;
  lastPublishAt = nowMs;
  lastPublishedPhase = game_.phase;
  try { publishQaCrops(); } catch { /* QA crops best-effort */ }
  const holder = holderAthlete();
  const evidence = {
    route: "showcase-aura-hoops-3d",
    engine: "@aura3d/engine",
    ready: appReady && document.body.dataset.aura3dReady === "true",
    framesRendered,
    frameErrors: frameBoundary.stats(),
    shotStats: { ...shotStats },
    // H47-AN1: off-ball head look-at (frames, within25 = yaw error <= 25 deg; acceptance wants >= 80%)
    headLook: { active: headLookOn.size, ...headLookStats },
    // H47-H1: the in-world board text (Rucker, new look) next to the DOM score it must equal
    inWorldScore: shownBoardScore ? { board: shownBoardScore, dom: currentBoardScore() } : null,
    footSlide: footEvidence(),
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
    handProbe: handProbe(),
    camera: initialParams.get("diag") === "1" ? { eye: cam.eye, target: cam.target, fov: Number(cam.fov.toFixed(3)) } : null,
    drawn: initialParams.get("diag") === "1" ? (() => {
      const b = (ballNode as any)?.bounds?.();
      return { ballCenter: b?.min && b?.max ? [0, 1, 2].map((k) => Number(((b.min[k] + b.max[k]) / 2).toFixed(3))) : null };
    })() : null,
    athleteClips: athletes.map((a) => ({
      id: a.nodeId,
      clip: a.clip,
      speed: Number(Math.hypot(a.vx, a.vz).toFixed(2)),
      x: Number(a.x.toFixed(2)),
      z: Number(a.z.toFixed(2)),
      hasBall: a.hasBall
    })),
    difficulty: game_.diff,
    userDifficulty: game_.userDiff,
    menuOpen: menuIsOpen(),
    lastTouch: ball.lastTouch,
    kits: teamKits(game_.homeSquad, game_.awaySquad),
    appliedFit: game_.appliedFit,
    stats: game_.stats,
    squads: { home: game_.homeSquad.id, away: game_.awaySquad.id },
    tour: { active: game_.tour.active, round: game_.tour.round, champion: game_.tour.champion, eliminated: game_.tour.eliminated },
    lab: { ...game_.lab, cones: game_.cones.cleared },
    studio: { ...game_.fit },
    eventLog: eventLog.snapshot(),
    audio: audio?.evidence ? { unlocked: audio.evidence.unlocked, cueCount: audio.evidence.cueCount, playedCueCount: audio.evidence.playedCueCount } : null,
    touch: touchControls?.evidence?.() ?? null,
    deterministic: { rng: "lcg:0xa3d5", ballSim: "route-local analytic + contact model" },
    assets: [
      "hoopsAthleteGuardKit", "hoopsAthleteBigKit", "hoopsHoopRig", "hoopsRim", "hoopsBackboard", "hoopsBall", "hoopsCourtShell", "showcaseStadiumSeats", "hoopsScoreboard", "hoopsFloodlight", "hoopsBallCart", "hoopsSkyline", "hoopsTower", "hoopsEarth", "hoopsOrbitArena", "hoopsCanopy", "hoopsLamp", "hoopsPalm", "hoopsTrophy"
    ]
  };
  publishBeacon(evidence);
}

/* ------------------------------------------------------------------ *
 *  Main loop                                                          *
 * ------------------------------------------------------------------ */
function frame(dtRaw: number): void {
  const frozen = hitStop.active;
  hitStop.update(dtRaw);
  const dt = frozen ? 0 : clamp(QA_DT > 0 ? QA_DT : dtRaw, 1 / 240, 0.05);
  game_.time += dt;
  if (game_.phase === "live" || game_.phase === "shot") game_.matchT += dt;
  framesRendered += 1;

  // Timers
  if (game_.bannerT > 0) { game_.bannerT -= dt; if (game_.bannerT <= 0) bannerEl?.classList.remove("show"); }
  if (game_.msgT > 0) { game_.msgT -= dt; if (game_.msgT <= 0 || performance.now() / 1000 >= msgUntil) { game_.msgT = 0; msgBox?.classList.remove("show"); } }
  if (game_.promptT > 0) { game_.promptT -= dt; if (game_.promptT <= 0) promptEl?.classList.remove("show"); }
  if (jamFlashT > 0) { jamFlashT = Math.max(0, jamFlashT - dt * 2.4); if (jamFlash) jamFlash.style.opacity = jamFlashT.toFixed(2); }
  if (netPulse > 0) netPulse -= dt * 3;
  rimShake = decayRimShake(rimShake, dt);
  if (!LOOK_ORIGINAL) sprayTags.prune(game_.time);
  if (crowdLevel > 1) {
    crowdLevel = Math.max(1, crowdLevel - dt * 0.6);
    if (framesRendered % 12 === 0 || crowdLevel === 1) { try { (audio as any)?.setCueLevel?.("crowd", { volume: crowdLevel }, 200); } catch { /* best-effort */ } }
  }

  // Menu key: exactly one toggle per press (input.ts)
  pressed.beginFrame();
  if (pressed("menu", "Escape")) setMenuOpen(!menuIsOpen());

  // The open menu pauses play: no simulation and no gameplay input behind it.
  if (menuIsOpen()) {
    updateCamera(dt);
    syncHud();
    publishEvidence();
    inputCtl.update(dt);
    keysPressed.clear();
    return;
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
        if (h) { h.aiPlan = "drive"; h.dunkIntent = rng() < CPU_DUNK_RATE[game_.diff]; h.tx = RIM[0]; h.tz = 2.2; }
      }
      break;
    }
    case "live":
    case "shot": {
      // Meter charge
      if (game_.shotMeter.active && me?.shooting) {
        game_.shotMeter.t = advanceMeter(game_.shotMeter.t, dt); // stops at 1: holding past the end is a late brick
        game_.shotMeter.frames += 1;
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
              ?? nearestOf(awayTeam(), a.x, a.z);
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
      if (pressed("rematch", "KeyR")) rematch();
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

  // Bodies never overlap: one push-apart pass over the athletes on the floor (a dunker in the air holds its line).
  separateBodies();

  // Ball + athletes
  stepBallSim(dt);
  for (const a of athletes) syncAthlete(a, dt);
  refreshHeldBall();

  // Ball visuals
  if (ball.state === "flight" || ball.state === "loose" || ball.state === "pass") {
    ballSpin[0] = ball.flightT * 6; ballSpin[1] = 0; ballSpin[2] = ball.flightT * 4;
  } else {
    const h = holderAthlete();
    ballSpin[0] = game_.time * 5.2; ballSpin[1] = h?.yaw ?? 0; ballSpin[2] = 0;
  }
  placeBall(ball.x, ball.y, ball.z);
  ballShadow?.setScale([clamp(1.1 - ball.y * 0.12, 0.3, 1.05), 1, clamp(1.1 - ball.y * 0.12, 0.3, 1.05)]).setVisible(true);
  // H47-E2: Shanghai lightning, a double strike every ~40 s of game time (reduced flash keeps it dark).
  if (lightningNode) {
    const level = lightningFlash(COURT_RIGS[venue.id], game_.time, reducedFlash);
    if (level !== lightningLevel) {
      lightningLevel = level;
      try { (lightningNode as any).setLight?.({ intensity: level * LIGHTNING_PEAK }); } catch { /* lighting flag off */ }
    }
  }
  // H47-V1: the ribbon turns fire-coloured at a full Jam Meter (a trail's options are fixed, so it restarts).
  if (!LOOK_ORIGINAL && ballTrailFire !== game_.jamFull) restartBallTrail(game_.jamFull);
  for (let i = 0; i < trailNodes.length; i++) {
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
  rimNode?.setPosition(RIM[0] + (fxRng() - 0.5) * rimShake * 0.03, RIM[1] + rimShake * 0.02, RIM[2]);
  if (backboardNode) {
    const shake = reducedMotion ? 0 : rimShake;
    backboardNode.setPosition(Math.sin(game_.time * 61) * shake * 0.018, 3.35 + Math.sin(game_.time * 47) * shake * 0.012, BOARD_Z);
  }
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
  if (touchExtra) { const show = Boolean(touchControls?.visible); if (touchExtra.hidden === show) touchExtra.hidden = !show; }
  syncHud();
  publishEvidence();
  inputCtl.update(dt);
  keysPressed.clear();
}

/** Current ball spin (rx, ry, rz); the presenter reuses it when it draws the ball between steps. */
const ballSpin: Vec3 = [0, 0, 0];
/** Draw the ball with its CENTRE at (x, y, z). The fitted ball model is grounded on its lowest point and rotates about that
 * point, so the node is offset by R * (0, radius, 0), R = Rz Ry Rx as the engine builds it. */
function placeBall(x: number, y: number, z: number): void {
  if (ballNode) {
    const [rx, ry, rz] = ballSpin;
    ballNode.setRotation(rx, ry, rz);
    const cxr = Math.cos(rx), sxr = Math.sin(rx), cyr = Math.cos(ry), syr = Math.sin(ry), czr = Math.cos(rz), szr = Math.sin(rz);
    const ux = syr * sxr, uy = cxr, uz = cyr * sxr;
    const cy = Math.max(BALL_R, y);
    ballNode.setPosition(x - (czr * ux - szr * uy) * BALL_R, cy - (szr * ux + czr * uy) * BALL_R, z - uz * BALL_R);
  }
  ballShadow?.setPosition(x, 0.014, z);
}

/* ------------------------------------------------------------------ *
 *  Fixed-step presenter: the sim runs at SIM_STEP; every display frame  *
 *  draws the athletes and the ball between the last two steps, so      *
 *  120 and 144 Hz displays see motion on every frame.                  *
 * ------------------------------------------------------------------ */
interface Shown { prev: Pose; cur: Pose; has: boolean; out: Pose }
const shownAthletes = new Map<string, Shown>();
const shownBall: Shown = { prev: { x: 0, y: 0, z: 0, yaw: 0 }, cur: { x: 0, y: 0, z: 0, yaw: 0 }, has: false, out: { x: 0, y: 0, z: 0, yaw: 0 } };
function pushShown(sh: Shown, x: number, y: number, z: number, yaw: number): void {
  if (sh.has) Object.assign(sh.prev, sh.cur);
  sh.cur.x = x; sh.cur.y = y; sh.cur.z = z; sh.cur.yaw = yaw;
  if (!sh.has) { Object.assign(sh.prev, sh.cur); sh.has = true; }
}
function recordStep(): void {
  for (const a of athletes) {
    let sh = shownAthletes.get(a.nodeId);
    if (!sh) { sh = { prev: { x: 0, y: 0, z: 0, yaw: 0 }, cur: { x: 0, y: 0, z: 0, yaw: 0 }, has: false, out: { x: 0, y: 0, z: 0, yaw: 0 } }; shownAthletes.set(a.nodeId, sh); }
    pushShown(sh, a.x, a.y, a.z, a.yaw);
  }
  pushShown(shownBall, ball.x, ball.y, ball.z, 0);
  if (!BROADCAST_OFF) replayRing.push({ time: game_.time, athletes: athletes.map((a) => ({ x: a.x, y: a.y, z: a.z, yaw: a.yaw })), ball: [ball.x, ball.y, ball.z] });
  pushShown(shownEye, cam.eye[0], cam.eye[1], cam.eye[2], cam.fov);
  pushShown(shownTarget, cam.target[0], cam.target[1], cam.target[2], 0);
}
const shownEye: Shown = { prev: { x: 0, y: 0, z: 0, yaw: 0 }, cur: { x: 0, y: 0, z: 0, yaw: 0 }, has: false, out: { x: 0, y: 0, z: 0, yaw: 0 } };
const shownTarget: Shown = { prev: { x: 0, y: 0, z: 0, yaw: 0 }, cur: { x: 0, y: 0, z: 0, yaw: 0 }, has: false, out: { x: 0, y: 0, z: 0, yaw: 0 } };
const camLerp = (sh: Shown, alpha: number): Pose => {
  const o = sh.out, a = Math.max(0, Math.min(1, alpha));
  o.x = sh.prev.x + (sh.cur.x - sh.prev.x) * a; o.y = sh.prev.y + (sh.cur.y - sh.prev.y) * a; o.z = sh.prev.z + (sh.cur.z - sh.prev.z) * a;
  o.yaw = sh.prev.yaw + (sh.cur.yaw - sh.prev.yaw) * a; // fov rides in yaw
  return o;
};
function present(alpha: number): void {
  if (alpha >= 0.999) return; // the last step is already drawn
  athletes.forEach((a, i) => {
    const sh = shownAthletes.get(a.nodeId);
    const r = rigs[i];
    if (!sh?.has || !r?.root) return;
    const p = blendPose(sh.prev, sh.cur, alpha, sh.out);
    r.root.setPosition(p.x, p.y, p.z).setRotation(0, p.yaw, 0);
    r.shadow?.setPosition(p.x, 0.012, p.z);
    r.ring?.setPosition(p.x, 0.018, p.z);
    r.aura?.setPosition(p.x, p.y + 0.95, p.z); // fit-grounding: ok (a centre-based cylinder primitive)
  });
  if (shownBall.has) {
    const b = blendPose(shownBall.prev, shownBall.cur, alpha, shownBall.out);
    placeBall(b.x, b.y, b.z);
  }
  if (shownEye.has) {
    // the camera eases toward its target every step; draw it between steps too, or the whole frame stalls at 120/144 Hz
    const e = camLerp(shownEye, alpha), t = camLerp(shownTarget, alpha);
    drawCameraPose([e.x, e.y, e.z], [t.x, t.y, t.z], e.yaw);
  }
}
const simLoop = createFixedStepLoop({
  stepSeconds: SIM_STEP,
  // the old variable step clamped a frame to 0.05 s; keep that ceiling (3 steps) so slow devices pace the same
  maxCatchUpSteps: 3,
  maxFrameSeconds: 0.05,
  step: (seconds) => { frame(seconds); recordStep(); },
  render: () => present(simLoop.alpha),
  schedule: () => 0,
  cancel: () => undefined
});

/** Draw one replay frame: recorded athlete and ball poses, the low rim-side camera. */
function drawReplayFrame(t: number): BroadcastV3 | null {
  const f = replayClip?.at(replaySourceTime(t));
  if (!f) return null;
  f.athletes.forEach((p, i) => {
    const r = rigs[i];
    if (!r?.root) return;
    r.root.setPosition(p.x, p.y, p.z).setRotation(0, p.yaw, 0);
    r.shadow?.setPosition(p.x, 0.012, p.z);
    r.ring?.setPosition(p.x, 0.018, p.z);
    r.aura?.setPosition(p.x, p.y + 0.95, p.z); // fit-grounding: ok (a centre-based cylinder primitive)
  });
  placeBall(f.ball[0], f.ball[1], f.ball[2]);
  return f.ball;
}
/** DOF (focused on the subject) and motion blur only while a broadcast shot runs (H47-P2, E-C runtime toggles). */
function setBroadcastPost(on: boolean, eye?: BroadcastV3, focus?: BroadcastV3): void {
  const post = (auraApp as any)?.post;
  if (!post?.setEffectEnabled) return;
  try {
    const want = broadcast.post(eye, focus);
    if (on && want.focusDistance !== undefined) post.setEffect("depthOfField", { focusDistance: want.focusDistance, aperture: 0.5, maxBlur: 4 });
    if (on !== broadcastPostOn) {
      post.setEffectEnabled("depthOfField", on && want.depthOfField);
      post.setEffectEnabled("motionBlur", on && want.motionBlur);
      broadcastPostOn = on;
    }
  } catch { /* post toggles best-effort */ }
}
/**
 * H47-C1: run the intro rail or the Jam-dunk replay this frame. The sim is held (no steps) while a shot runs; returns false
 * once nothing runs, and the live camera and sim resume on the same frame.
 */
let broadcastRan = false;
let broadcastWallMs = 0;
function runBroadcast(dt: number): boolean {
  if (!broadcast.active && !broadcastRan) return false;
  const shot = broadcast.active ? broadcast.update(dt) : null;
  broadcastRan = shot !== null;
  if (!shot) {
    letterbox?.show(false);
    setBroadcastPost(false);
    replayClip = null;
    present(0.99);
    simLoop.resetAccumulator();
    return false;
  }
  letterbox ??= createLetterbox(document.getElementById("game-stage") ?? document.body);
  letterbox.show(true);
  let pose;
  if (shot.kind === "intro") pose = railPose(shot.court, shot.t);
  else {
    const b = drawReplayFrame(shot.t) ?? [ball.x, ball.y, ball.z] as BroadcastV3;
    pose = replayPose(shot.t, b, [RIM[0], RIM[1], RIM[2]]);
  }
  setBroadcastPost(true, pose.eye, shot.kind === "intro" ? pose.target : [ball.x, ball.y, ball.z]);
  drawCameraPose(pose.eye, pose.target, pose.fov);
  return true;
}
/** Any key or pointer skips the running intro or replay; the next frame is live. */
if (typeof window !== "undefined") {
  const skipBroadcast = () => { if (broadcast.active) broadcast.skip(); };
  window.addEventListener("keydown", skipBroadcast, { capture: true });
  window.addEventListener("pointerdown", skipBroadcast, { capture: true });
}

const frameBoundary = createFrameErrorBoundary({
  onFatal: () => { if (renderError) (renderError as HTMLElement).hidden = false; }
});
auraApp.onFrame(({ dt }) => {
  frameBoundary.run(() => {
    if (!appReady) {
      for (const a of athletes) syncAthlete(a, 0);
      updateCamera(0.016);
      syncHud();
      return;
    }
    // `?simsteps=N` (diagnostics): N extra fixed 1/60 s sim steps per rendered frame, so a slow software-GL run covers real game time.
    if (QA_STEP) {
      if (qaStepsLeft <= 0) return;
      qaStepsLeft -= 1;
    }
    const extra = Math.max(0, Math.min(119, Number(initialParams.get("simsteps")) | 0));
    if (QA_STEP || extra > 0 || QA_DT > 0) {
      // measurement paths (?diag=1 qaStep / qaDt, ?simsteps=N) keep their own stepping
      for (let i = 0; i < extra; i += 1) frame(1 / 60);
      frame(dt);
      return;
    }
    // GU47 phase 2: broadcast shots run on wall-clock time (capped at 1 s a frame). The engine dt is clamped, so at the
    // 1-3 fps of software WebGL2 the 6 s intro rail ran for minutes and settle-60s frames caught the fly-in mid-rail.
    const nowMs = performance.now();
    const wallDt = broadcastWallMs > 0 ? Math.min(1, Math.max(0, (nowMs - broadcastWallMs) / 1000)) : dt;
    broadcastWallMs = nowMs;
    if (runBroadcast(wallDt)) return;
    simLoop.tick(performance.now());
  });
  frameBoundary.run(flushMarkerPools);
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
      sprayTags.clear();
      auraApp.setScene(buildScene(venue));
      resolveHandles();
      mountCourtFx();
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
    { id: "studio-shorts", key: "shorts", colors: STUDIO.shorts }
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
      setMenuOpen(false, false);
      startMatch(mode);
      enterLive();
    });
  });
  document.querySelectorAll<HTMLButtonElement>("[data-diff]").forEach((btn) => {
    btn.addEventListener("click", () => {
      const d = btn.dataset.diff as DiffId;
      if (!DIFFS[d]) return;
      game_.userDiff = d;
      if (game_.mode !== "tour") game_.diff = d;
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
      if (m === "menu") { setMenuOpen(true); return; }
      if (m === "quick") { setMenuOpen(false, false); startMatch("quick"); enterLive(); }
      if (m === "dunklab") { setMenuOpen(false, false); startMatch("dunklab"); }
    });
  });
  el<HTMLElement>("menu-close")?.addEventListener("click", () => setMenuOpen(false));
  el<HTMLElement>("menu-run")?.addEventListener("click", () => {
    setMenuOpen(false, false);
    startMatch(game_.pendingMode === "studio" ? "quick" : game_.pendingMode);
    enterLive();
  });
  el<HTMLElement>("studio-apply")?.addEventListener("click", () => {
    // The fit goes onto the home crew's kit materials (jersey with socks, and shorts).
    game_.appliedFit = { ...game_.fit };
    rebuildScene();
    buildStudioPills();
    showBanner("FIT APPLIED TO YOUR SQUAD");
    pushEvent("studio", "fit applied", "success");
    setMenuOpen(false);
  });
  // Squad picker: your crew's colours and its shoot / speed / dunk / defense stats
  const squadRow = el<HTMLElement>("squad-row");
  const renderSquads = (): void => {
    if (!squadRow) return;
    squadRow.innerHTML = "";
    for (const q of SQUADS) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "menu-pill squad-pill" + (q === game_.homeSquad ? " active" : "");
      b.dataset.squad = q.id;
      b.innerHTML = `<span class="sq-chip" style="background:${q.color}"></span>${q.name}<span class="sq-stats">SHT ${q.shoot} · SPD ${q.speed} · DNK ${q.dunk} · DEF ${q.defense}</span>`;
      b.addEventListener("click", () => {
        game_.homeSquad = q;
        if (game_.awaySquad === q) game_.awaySquad = SQUADS.find((o) => o !== q)!;
        rebuildScene();
        renderSquads();
        pushEvent("squad", `squad: ${q.name.toLowerCase()}`, "info");
      });
      squadRow.appendChild(b);
    }
  };
  renderSquads();
  // Mute toggle
  const muteBtn = el<HTMLButtonElement>("tb-mute");
  let muted = false;
  muteBtn?.addEventListener("click", () => {
    muted = !muted;
    try { (audio as any)?.setMuted?.(muted); } catch { /* best-effort */ }
    muteBtn.textContent = muted ? "SOUND: OFF" : "SOUND: ON";
    muteBtn.setAttribute("aria-pressed", muted ? "true" : "false");
  });
  // Results card + touch buttons
  el<HTMLElement>("res-rematch")?.addEventListener("click", () => rematch());
  el<HTMLElement>("res-menu")?.addEventListener("click", () => { hideResults(); setMenuOpen(true); });
  el<HTMLElement>("touch-menu")?.addEventListener("click", () => setMenuOpen(!menuIsOpen()));
  // Pause when the tab or app goes to the background.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && (game_.phase === "live" || game_.phase === "shot" || game_.phase === "check")) setMenuOpen(true);
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
  if (modeParam && modeParam !== "studio") game_.pendingMode = modeParam;
  if (modeParam === "studio") { studioSection?.style.setProperty("display", ""); buildStudioPills(); }
  setMenuOpen(true);
} else {
  setMenuOpen(false, false);
  startMatch(modeParam ?? "quick");
  if (QA_SERVE) enterCheck("away");
  enterLive();
}

void Promise.resolve((auraApp as any).ready?.()).then(() => {
  resolveHandles();
  for (const a of athletes) syncAthlete(a, 0);
  updateCamera(0.016);
  syncHud();
  appReady = true;
  simLoop.resetAccumulator();
  document.body.dataset.aura3dReady = "true";
  document.querySelector("#app canvas")?.setAttribute("data-ready", "true");
  publishEvidence(true);
  pushEvent("system", "aura hoops 3d online — six courts loaded", "success");
  console.info("[aura-hoops-3d] ready", { venue: venue.id, mode: game_.mode, phase: game_.phase });
});
