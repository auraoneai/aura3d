/**
 * Aura Diamond 3D — broadcast-grade 3D baseball on the Aura3D engine.
 *
 * LOOK BRIEF (art-direction §sports/diamond):
 *   Warm americana-meets-neon: deep dusk keys, stadium floods, chalk lines
 *   glowing. Six ballparks — Harbor Sandlot (golden hour), Midtown Skyline
 *   (night rooftop, window targets), Canyon Rim (overcast, deep alleys),
 *   Ivy Classic (brick + vines), Typhoon Dome (indoor), Lunar Park
 *   (polar-night, 1/6 gravity, 500-ft moonshots).
 *
 * ARCHITECTURE
 *   The pure rules (pitch flight, swing timing, ball flight, count/outs/mercy/walk-off, the bracket and the set-dressing
 *   layout) live in rules.ts with unit tests; this file runs them on a fixed 1/120 s step: a deterministic baseball sim (pitch
 *   movement curves → PCI×timing contact → launch/exit-velo ball flight →
 *   fence/field interaction), a full 3-inning game state machine with extras
 *   and a +10 mercy rule, Derby/Bullpen labs, a 32-team World Classic bracket
 *   and Player Studio cosmetics. The scene is rebuilt per ballpark through
 *   `app.setScene`; runtime node handles are re-bound after each rebuild.
 *   Athletes are typed catalog GLBs with team-colour caps and belts riding
 *   their Head and Hips bones; bases, mound, walls and the ball are authored
 *   field geometry. The DOM HUD is wired every frame to the ids in index.html.
 */
import {
  camera,
  createAuraApp,
  createFixedStepLoop,
  createGameAudio,
  effects,
  game,
  instances,
  lights,
  looks,
  material,
  model,
  primitives,
  scene
} from "@aura3d/engine";
import {
  createJuice,
  createOverlayDriver,
  createFixedStepPresenter,
  createRumbleDriver,
  createTweenEngine,
  createFxParticlePass,
  mountTouchControls,
  installGameBeacon,
  attachToBone,
  boneWorldPosition,
  type AttachableActor
} from "@aura3d/engine/game";
import { assets } from "./aura-assets.route";
import { batContact, boundedBlend } from "./contact";
import {
  clamp,
  lerp,
  makeRng,
  MOUND_Z,
  MOUND_TOP,
  RELEASE_PT,
  ZONE_HW,
  ZONE_CY,
  ZONE_HH,
  FOUL_DEG,
  CONTACT_PLANE_T,
  WINDUP_RELEASE_T,
  PLAYER_SWING_PRE,
  SIM_STEP,
  PARKS,
  PARK_ORDER,
  PITCHES,
  PITCH_KEYS,
  WAVER_COUNT,
  CLASSIC_ROUND_NAMES,
  fenceRadius,
  fencePoint,
  pitchPosAt,
  zoneCoords,
  inZone,
  timeToContactPlane,
  swingTimingError,
  gradeSwing,
  stepFlight,
  predictLanding,
  halfEndDecision,
  isWalkoff,
  isMidInningMercy,
  sacFlyScores,
  createBracket,
  advanceBracket,
  shouldResumeClassic,
  currentFixture,
  crowdPlacements,
  bleacherPlacements,
  shellPlacements,
  scoreboardPlacement,
  propSpot,
  HARBOR_WATER,
  type Vec3,
  type ParkId,
  type ParkSpec,
  type PitchId,
  type PitchSpec,
  type BracketState
} from "./rules";
import "../../showcase-port-shared/quickbar.css";
import { installBlackFrameGuard } from "@aura3d/debug";

let gameBeacon: ReturnType<typeof installGameBeacon> | undefined;
const publishBeacon = (evidence: object): void => {
  gameBeacon ??= installGameBeacon({ route: "showcase-aura-diamond-3d", evidenceGlobals: ["__AURA3D_GAME_EVIDENCE__"] });
  gameBeacon.publishEvidence(evidence);
};

installBlackFrameGuard();

/* ================================================================== *
 *  Types + small math helpers                                         *
 * ================================================================== */

type AnyHandle = any;

type ModeId = "quick" | "derby" | "bullpen" | "classic" | "studio";
type DiffId = "rookie" | "pro" | "legend";
type Phase =
  | "menu"
  | "between"
  | "windup"
  | "pitch"
  | "batted"
  | "runners"
  | "pitchSelect"
  | "pitchMeter"
  | "gameover";
type CamMode = "menuOrbit" | "batting" | "pitching" | "track" | "celebrate";

const smoothstep = (t: number): number => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
const mix3 = (a: Vec3, b: Vec3, t: number): Vec3 => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];
const mphToMs = (mph: number): number => mph * 0.44704;
const mToFt = (m: number): number => m * 3.28084;

/** Signed jitter in [-1,1] from a uniform rng. */
const jitter = (rng: () => number): number => rng() + rng() - 1;

/* ================================================================== *
 *  Field geometry (metres, compact-but-proportional diamond)          *
 * ================================================================== */

const BASE_PATH = 12.73; // home→1B legs at 45°, ~18 m paths
const BASES: readonly Vec3[] = [
  [BASE_PATH, 0.09, -BASE_PATH], // 1B
  [0, 0.09, -BASE_PATH * 2], // 2B
  [-BASE_PATH, 0.09, -BASE_PATH] // 3B
];
const HOME_PLATE: Vec3 = [0, 0.05, 0.4];
const TRAIL_COUNT = 16;
const HIDDEN_SCALE = 0.0001;

import {
  RIG,
  ACTOR_FIT,
  BAT_PHYSICS_WEIGHT,
  BAT_SPRAY_MAX_DELTA_DEG,
  BAT_LAUNCH_MAX_DELTA_DEG,
  SWING_TOTAL,
  SWING_CONTACT_T,
  qMul,
  qAxis,
  qRot,
  unit3,
  rotY,
  sampleBatterTarget,
  type SwingKey,
  STANCE_KEY,
  CONTACT_DIR,
  POLE_STANCE_R,
  BATTER_YAW,
  poseBonesForEngine,
  solveTwoBone,
  BAT_ATTACH_ROT,
  KNOB_HALF,
  FIT_GROUND_N,
  GLOVE_ATTACH_POS,
  qToEulerZYX,
  solveBatterPose,
  type ContactConfig,
  buildContactConfig
} from "./batter-pose";

/* ================================================================== *
 *  Clubs + pitcher repertoires + pitch specs                          *
 * ================================================================== */

interface ClubSpec {
  readonly id: string;
  readonly name: string;
  readonly abbr: string;
  readonly color: string;
  readonly tag: string;
  readonly rep: readonly PitchId[];
  readonly power: number;
  readonly contact: number;
  readonly pitching: number;
}

const CLUBS: readonly ClubSpec[] = [
  { id: "wash", name: "Harbor Wash", abbr: "HBW", color: "#2e8fa8", tag: "Patient contact club — a line-drive machine.", rep: ["fourseam", "changeup", "curve"], power: 0.42, contact: 0.8, pitching: 0.6 },
  { id: "liners", name: "Midtown Skyliners", abbr: "MSC", color: "#ffb03a", tag: "Window-shattering power bats.", rep: ["fourseam", "slider", "changeup"], power: 0.88, contact: 0.56, pitching: 0.64 },
  { id: "riders", name: "Canyon Rim Riders", abbr: "CRR", color: "#a8593a", tag: "Gap hunters — they live in the deep alleys.", rep: ["curve", "slider", "fourseam"], power: 0.62, contact: 0.7, pitching: 0.68 },
  { id: "classics", name: "Ivy Classics", abbr: "IVC", color: "#2e6b3f", tag: "Small-ball artisans. Death by a thousand singles.", rep: ["curve", "changeup"], power: 0.36, contact: 0.86, pitching: 0.56 },
  { id: "zephyrs", name: "Typhoon Zephyrs", abbr: "TYZ", color: "#35d6ff", tag: "Ace factory — filthiest bullpen on the circuit.", rep: ["fourseam", "slider", "curve", "changeup"], power: 0.62, contact: 0.62, pitching: 0.92 },
  { id: "orbiters", name: "Lunar Orbiters", abbr: "LNO", color: "#c8cfe0", tag: "Moon-ball power — every swing opens a launch window.", rep: ["fourseam", "curve"], power: 0.95, contact: 0.46, pitching: 0.55 },
  { id: "comets", name: "Neon Comets", abbr: "NEC", color: "#ff42c8", tag: "Speed demons — legs turn singles into doubles.", rep: ["slider", "changeup"], power: 0.55, contact: 0.72, pitching: 0.62 },
  { id: "seals", name: "Golden Bay Seals", abbr: "GBS", color: "#d4b06a", tag: "Golden-hour heroes — the balanced nine.", rep: ["fourseam", "curve", "changeup"], power: 0.6, contact: 0.66, pitching: 0.62 }
];

const clubById = (id: string): ClubSpec => CLUBS.find((c) => c.id === id) ?? CLUBS[7]!;

interface DiffSpec {
  readonly label: string;
  readonly pciScale: number;
  readonly cpuVeloMul: number;
  readonly cpuContactSigma: number;
  readonly cpuChase: number;
  readonly cpuPower: number;
  readonly sweetWiden: number;
}

const DIFFS: Record<DiffId, DiffSpec> = {
  rookie: { label: "ROOKIE", pciScale: 1.28, cpuVeloMul: 0.9, cpuContactSigma: 0.11, cpuChase: 0.3, cpuPower: 0.55, sweetWiden: 1.4 },
  pro: { label: "PRO", pciScale: 1.0, cpuVeloMul: 1.0, cpuContactSigma: 0.08, cpuChase: 0.2, cpuPower: 0.72, sweetWiden: 1.0 },
  legend: { label: "LEGEND", pciScale: 0.82, cpuVeloMul: 1.07, cpuContactSigma: 0.055, cpuChase: 0.12, cpuPower: 0.88, sweetWiden: 0.72 }
};

/* ================================================================== *
 *  Player Studio options                                              *
 * ================================================================== */

const STUDIO_COLORS: readonly { id: string; label: string; color: string }[] = [
  { id: "amber", label: "Amber Home", color: "#ffb03a" },
  { id: "cyan", label: "Comet Teal", color: "#35d6ff" },
  { id: "crimson", label: "Crimson Sox", color: "#e5484d" },
  { id: "ivy", label: "Ivy Green", color: "#3fae62" },
  { id: "midnight", label: "Midnight Navy", color: "#4a6fd8" },
  { id: "chalk", label: "Chalk White", color: "#f2eee3" }
];

const STUDIO_BATS: readonly { id: string; label: string; color: string; emissive: number }[] = [
  { id: "ash", label: "Natural Ash", color: "#b98a4e", emissive: 0 },
  { id: "blackout", label: "Blackout Maple", color: "#1d2028", emissive: 0 },
  { id: "ember", label: "Ember Grain", color: "#c2542a", emissive: 0.35 },
  { id: "neon", label: "Neon Teal", color: "#35d6ff", emissive: 0.9 },
  { id: "lunar", label: "Lunar White", color: "#dfe6ee", emissive: 0.25 },
  { id: "gilded", label: "Gilded", color: "#ffd76a", emissive: 0.55 }
];

const STUDIO_FLAIR: readonly { id: string; label: string }[] = [
  { id: "fireworks", label: "Fireworks" },
  { id: "spark", label: "Spark Storm" },
  { id: "bass", label: "Bass Drop" },
  { id: "moondust", label: "Moon Dust" },
  { id: "none", label: "No Flair" }
];

/* ================================================================== *
 *  World Classic — 32 national squads                                 *
 * ================================================================== */

interface ClassicTeam {
  readonly name: string;
  readonly abbr: string;
  readonly rating: number;
}

const WORLD_TEAMS: readonly ClassicTeam[] = [
  { name: "Aura Select", abbr: "AUR", rating: 0.72 },
  { name: "Harbor City", abbr: "HBC", rating: 0.66 },
  { name: "Midtown", abbr: "MID", rating: 0.78 },
  { name: "Canyon Rim", abbr: "CYN", rating: 0.7 },
  { name: "Ivy Borough", abbr: "IVY", rating: 0.6 },
  { name: "Typhoon Bay", abbr: "TYP", rating: 0.82 },
  { name: "Tranquility Base", abbr: "TRQ", rating: 0.86 },
  { name: "Neon District", abbr: "NEO", rating: 0.68 },
  { name: "Santo Domingo", abbr: "SDO", rating: 0.84 },
  { name: "Osaka", abbr: "OSK", rating: 0.83 },
  { name: "Seoul", abbr: "SEO", rating: 0.77 },
  { name: "Havana", abbr: "HAV", rating: 0.74 },
  { name: "San Juan", abbr: "SJU", rating: 0.73 },
  { name: "Caracas", abbr: "CAR", rating: 0.71 },
  { name: "Monterrey", abbr: "MTY", rating: 0.69 },
  { name: "Taipei City", abbr: "TPE", rating: 0.67 },
  { name: "Sydney", abbr: "SYD", rating: 0.62 },
  { name: "Amsterdam", abbr: "AMS", rating: 0.58 },
  { name: "Roma", abbr: "ROM", rating: 0.55 },
  { name: "Berlin", abbr: "BER", rating: 0.52 },
  { name: "London", abbr: "LDN", rating: 0.57 },
  { name: "Paris", abbr: "PAR", rating: 0.5 },
  { name: "Cape Town", abbr: "CAP", rating: 0.54 },
  { name: "Auckland", abbr: "AKL", rating: 0.56 },
  { name: "Toronto", abbr: "TOR", rating: 0.65 },
  { name: "México City", abbr: "MEX", rating: 0.72 },
  { name: "Panamá", abbr: "PAN", rating: 0.61 },
  { name: "Managua", abbr: "MAN", rating: 0.59 },
  { name: "Curaçao", abbr: "CUR", rating: 0.63 },
  { name: "Melbourne", abbr: "MEL", rating: 0.53 },
  { name: "Vancouver", abbr: "VAN", rating: 0.51 },
  { name: "Reykjavík", abbr: "REY", rating: 0.48 }
];

/* ================================================================== *
 *  Pitch + contact sim types                                          *
 * ================================================================== */

interface LivePitch {
  type: PitchId;
  spec: PitchSpec;
  t: number;
  flightSec: number;
  mph: number;
  start: Vec3;
  target: Vec3; // pre-break target on the plate plane (z=0)
  breakX: number;
  breakY: number;
  releaseQ: number; // release-meter quality 0..1
  resolved: boolean;
  swung: boolean;
  /** The CPU batter has made its one take-or-swing decision for this pitch. */
  cpuDecided?: boolean;
}

interface BattedBall {
  pos: Vec3;
  vel: Vec3;
  evMph: number;
  launchDeg: number;
  sprayDeg: number;
  hangT: number;
  landPos: Vec3;
  landDist: number;
  landTheta: number;
  maxY: number;
  crossedFence: boolean;
  hrCrossed: boolean;
  wallHit: boolean;
  /** The landing prediction's fence flags. The live flight starts with its own flags false and sets them as it reaches the wall. */
  predicted: { crossedFence: boolean; hrCrossed: boolean; wallHit: boolean };
  /** Outcome rolled at contact so a fielder can be sent to a catch in time (C8); null for fouls and assisted catches. */
  plannedOutcome: string | null;
  outcome: string | null;
  dead: boolean;
  age: number;
  resolveAt: number;
  fromCpu: boolean;
  catchable: boolean;
  catchFielder: number;
  catchProb: number;
  windowHit: boolean;
}

/* ================================================================== *
 *  Scene construction                                                 *
 * ================================================================== */

const chalkMat = () => material.pbr({ color: "#f5f1e4", roughness: 0.6, emissive: "#f5f1e4", emissiveIntensity: 0.18 });

function buildFieldNodes(park: ParkSpec): any[] {
  const nodes: any[] = [];
  const grass = material.pbr({ color: park.grass, roughness: 0.94 });
  const grassAlt = material.pbr({ color: park.grassAlt, roughness: 0.94 });
  const dirt = material.pbr({ color: park.dirt, roughness: 0.96 });
  const wallMat = material.pbr({ color: park.wall, roughness: 0.7 });
  const wallTopMat = material.emissive({ color: park.wallTop, emissive: park.wallTop, emissiveIntensity: park.night ? 0.85 : 0.2 });
  const bagMat = material.pbr({ color: "#ece8d8", roughness: 0.65 });

  // Ground, mow stripes, infield dirt, home circle, mound
  nodes.push(
    primitives.plane({ name: "field-grass", size: [340, 340] as any, material: grass }).position(0, -0.02, -60),
    ...Array.from({ length: 9 }, (_, i) =>
      primitives
        .plane({ name: `mow-${i}`, size: [340 / 9, 340] as any, material: i % 2 ? grass : grassAlt })
        .position(-170 + (340 / 9) * (i + 0.5), -0.005 - 0.001 * i, -60)
    ),
    primitives.cylinder({ name: "infield-dirt", size: [26, 0.05, 26], material: dirt }).position(0, 0.012, -BASE_PATH - 1.5),
    primitives.cylinder({ name: "home-dirt", size: [7.4, 0.06, 7.4], material: dirt }).position(0, 0.018, 0.4),
    primitives.cylinder({ name: "mound", size: [5.6, MOUND_TOP, 5.6], material: dirt }).position(0, MOUND_TOP / 2 + 0.02, MOUND_Z),
    primitives.box({ name: "mound-rubber", size: [0.6, 0.03, 0.16], material: bagMat }).position(0, MOUND_TOP + 0.045, MOUND_Z - 0.35)
  );

  // Base paths — thin dirt strips between the bases
  for (const [x0, z0, x1, z1] of [
    [0.9, -0.9, BASE_PATH - 0.4, -BASE_PATH + 0.4],
    [BASE_PATH - 0.4, -BASE_PATH - 0.4, 0.9, -BASE_PATH * 2 + 0.9],
    [-0.9, -BASE_PATH * 2 + 0.9, -BASE_PATH + 0.4, -BASE_PATH - 0.4],
    [-BASE_PATH + 0.4, -BASE_PATH + 0.4, -0.9, -0.9]
  ] as const) {
    const mx = (x0 + x1) / 2;
    const mz = (z0 + z1) / 2;
    const len = Math.hypot(x1 - x0, z1 - z0);
    const yaw = Math.atan2(x1 - x0, z1 - z0);
    nodes.push(primitives.box({ name: `basepath-${mx.toFixed(1)}-${mz.toFixed(1)}`, size: [2.4, 0.04, len], material: dirt }).position(mx, 0.025, mz).rotate(0, yaw, 0));
  }

  // Base dirt circles + bags + home plate + boxes
  for (let i = 0; i < 3; i++) {
    const [bx, , bz] = BASES[i]!;
    nodes.push(
      primitives.cylinder({ name: `base-dirt-${i}`, size: [4.6, 0.05, 4.6], material: dirt }).position(bx, 0.02, bz),
      model(assets.diamondBase, { name: `base-bag-${i}`, targetHeight: 0.16, scaleMode: "fit" }).position(bx, 0.06, bz)
    );
  }
  nodes.push(
    primitives.box({ name: "home-plate", size: [0.44, 0.03, 0.44], material: bagMat }).position(0, 0.045, 0).rotate(0, Math.PI / 4, 0),
    primitives.box({ name: "batters-box-l", size: [0.06, 0.02, 1.7], material: chalkMat() }).position(-1.15, 0.05, 0.35),
    primitives.box({ name: "batters-box-r", size: [0.06, 0.02, 1.7], material: chalkMat() }).position(1.15, 0.05, 0.35),
    primitives.box({ name: "batters-box-back", size: [2.3, 0.02, 0.06], material: chalkMat() }).position(0, 0.05, 1.2),
    primitives.box({ name: "catchers-box-back", size: [1.4, 0.02, 0.06], material: chalkMat() }).position(0, 0.05, 2.1)
  );

  // Foul lines + poles
  for (const side of [-1, 1]) {
    const len = park.fenceCorner * 1.02;
    const fx = Math.sin((side * FOUL_DEG * Math.PI) / 180);
    const fz = -Math.cos((side * FOUL_DEG * Math.PI) / 180);
    nodes.push(
      primitives.box({ name: `foul-line-${side}`, size: [0.09, 0.02, len], material: chalkMat() }).position((fx * len) / 2, 0.05, (fz * len) / 2).rotate(0, (side * FOUL_DEG * Math.PI) / 180, 0),
      primitives
        .cylinder({ name: `foul-pole-glow-${side}`, size: [0.14, 11, 0.14], material: material.emissive({ color: "#ffd76a", emissive: "#ffd76a", emissiveIntensity: park.night ? 0.9 : 0.25 }) })
        .position(fx * park.fenceCorner, 5.5, fz * park.fenceCorner),
      model(assets.diamondFoulPole, { name: `foul-pole-${side}`, targetHeight: 11, role: "setDressing", scaleMode: "fit" }).position(fx * park.fenceCorner, 0, fz * park.fenceCorner)
    );
  }

  // Outfield wall — segmented arc from foul pole to foul pole
  // One instanced draw for the wall and one for its cap (C12); each segment is a unit-length box scaled to its chord.
  const segs = park.fenceSegments;
  const wallT: { position: Vec3; rotation: Vec3; scale: Vec3 }[] = [];
  const capT: { position: Vec3; rotation: Vec3; scale: Vec3 }[] = [];
  for (let i = 0; i < segs; i++) {
    const t0 = -FOUL_DEG + (2 * FOUL_DEG * i) / segs;
    const t1 = -FOUL_DEG + (2 * FOUL_DEG * (i + 1)) / segs;
    const tm = (t0 + t1) / 2;
    const p0 = fencePoint(park, t0, 0);
    const p1 = fencePoint(park, t1, 0);
    const pm = fencePoint(park, tm, 0);
    const segLen = Math.hypot(p1[0] - p0[0], p1[2] - p0[2]) + 0.35;
    const yaw = Math.atan2(p1[0] - p0[0], p1[2] - p0[2]);
    wallT.push({ position: [pm[0], park.wallH / 2, pm[2]], rotation: [0, yaw + Math.PI / 2, 0], scale: [segLen, 1, 1] });
    capT.push({ position: [pm[0], park.wallH + 0.07, pm[2]], rotation: [0, yaw + Math.PI / 2, 0], scale: [segLen, 1, 1] });
  }
  nodes.push(
    instances.box({ name: "outfield-wall", size: [1, park.wallH, 0.5], material: wallMat, transforms: wallT }),
    instances.box({ name: "outfield-wall-cap", size: [1, 0.14, 0.56], material: wallTopMat, transforms: capT })
  );

  // On-deck rings + side dugouts. Keep the circles as painted chalk outlines
  // (a filled disc read as an oversized white target in the foreground) and
  // push the dugout boxes to the side touchlines so they frame instead of
  // blocking the lower third of the broadcast camera.
  const ondeckMat = material.pbr({ color: "#eee6d2", roughness: 1, opacity: 0.5 });
  nodes.push(
    primitives.torus({ name: "ondeck-l", size: [1.5, 1.5, 0.26], material: ondeckMat }).position(-7.1, 0.028, 2.2).rotate(Math.PI / 2, 0, 0),
    primitives.torus({ name: "ondeck-r", size: [1.5, 1.5, 0.26], material: ondeckMat }).position(7.1, 0.028, 2.2).rotate(Math.PI / 2, 0, 0),
    model(assets.diamondDugout, {
      name: "dugout-l", targetHeight: 2.0, role: "setDressing", scaleMode: "fit",
      materialOverrides: [{ color: "#4b5259", colorMode: "replace", replaceTextures: true, roughness: 0.82, metallic: 0.08 }]
    }).position(-28, 0, -6).rotate(0, Math.PI / 2, 0),
    model(assets.diamondDugout, {
      name: "dugout-r", targetHeight: 2.0, role: "setDressing", scaleMode: "fit",
      materialOverrides: [{ color: "#4b5259", colorMode: "replace", replaceTextures: true, roughness: 0.82, metallic: 0.08 }]
    }).position(28, 0, -6).rotate(0, -Math.PI / 2, 0)
  );

  return nodes;
}

function buildStandsNodes(park: ParkSpec): any[] {
  const nodes: any[] = [];
  const rng = makeRng(0xbeef);

  // Grandstand stadium shells framing the outer ballpark skyline, placed behind each park's own fence (rules.ts shellPlacements).
  nodes.push(
    ...shellPlacements(park).map((sh) =>
      model(assets.diamondStadium, { name: sh.name, targetMaxDimension: sh.name.endsWith("-c") ? 30 : 28, role: "setDressing", scaleMode: "fit" })
        .position(sh.x, 0, sh.z)
        .rotate(0, sh.yaw, 0)
    ),
    // Hidden dugout seat asset reference so route asset validation sees showcaseStadiumSeats
    model(assets.showcaseStadiumSeats, {
      name: "dugout-seat-ref",
      targetMaxDimension: 1.2,
      role: "setDressing",
      scaleMode: "fit",
      visible: false
    })
      .position(0, -80, 0)
      .scale(HIDDEN_SCALE)
  );

  // Grounded tiered stadium bleachers wrapping the outfield arc
  const deckMat = material.pbr({ color: "#1c2638", roughness: 0.78, metalness: 0.22 });
  const benchMat = material.pbr({ color: "#2d3e5a", roughness: 0.62, metalness: 0.28 });
  // Each section starts a fixed distance behind the fence at its own angle, so no row stands inside the wall (C3).
  // Instanced risers and benches: two draws instead of 42 (C12).
  const bleachers = bleacherPlacements(park);
  nodes.push(
    instances.box({
      name: "bleacher-risers",
      size: [11.5, 1, 2.2],
      material: deckMat,
      transforms: bleachers.map((b) => ({ position: [b.x, b.tierH * 0.5, b.z] as Vec3, rotation: [0, b.yaw, 0] as Vec3, scale: [1, b.tierH, 1] as Vec3 }))
    }),
    instances.box({
      name: "bleacher-benches",
      size: [11.2, 0.22, 0.85],
      material: benchMat,
      transforms: bleachers.map((b) => ({ position: b.bench, rotation: [0, b.yaw, 0] as Vec3 }))
    })
  );

  // Animated front-row wavers — real admitted 3D Meshy athletes grounded at y = 0
  void rng;
  for (const [i, c] of crowdPlacements(park).entries()) {
    nodes.push(
      model(assets.diamondCrowdAthlete, {
        name: `waver-${i}`,
        targetHeight: 1.88,
        role: "setDressing",
        scaleMode: "fit"
      })
        .position(c.x, 0, c.z)
        .rotate(0, c.yaw, 0)
        .animate({ clip: "Idle_Loop", loop: true, speed: 1.1 })
        .runtime(game.runtimeNode(`waver-${i}`))
    );
  }

  // Scoreboard + floodlight towers
  // Behind the centre bleacher section, at the same rig-to-screen spacing the art was tuned with.
  const sb = scoreboardPlacement(park);
  nodes.push(
    model(assets.diamondScoreboard, { name: "scoreboard-rig", targetHeight: 11, role: "setDressing", scaleMode: "fit" }).position(sb.rig[0], sb.rig[1], sb.rig[2]).rotate(0, Math.PI, 0).runtime(game.runtimeNode("scoreboard-rig")),
    primitives.box({ name: "scoreboard-screen", size: [10.5, 3.4, 0.4], material: material.emissive({ color: "#0d2436", emissive: "#1b4a66", emissiveIntensity: 0.9 }) }).position(sb.screen[0], sb.screen[1], sb.screen[2]).runtime(game.runtimeNode("scoreboard-screen"))
  );

  if (park.flood) {
    const towers: Vec3[] = [
      [-park.fenceCorner * 0.72, 0, -park.fenceCorner * 0.55 - 6],
      [park.fenceCorner * 0.72, 0, -park.fenceCorner * 0.55 - 6],
      [-park.fenceCorner * 0.5, 0, 14],
      [park.fenceCorner * 0.5, 0, 14]
    ];
    towers.forEach(([tx, , tz], i) => {
      nodes.push(
        model(assets.diamondFloodlight, { name: `flood-${i}`, targetHeight: 16, role: "setDressing", scaleMode: "fit" }).position(tx, 0, tz).rotate(0, Math.atan2(-tx, 10 - tz) + Math.PI, 0),
        lights.spot({ name: `flood-spot-${i}`, position: [tx * 0.9, 15, tz * 0.9], target: [0, 0, -10], angle: 0.6, penumbra: 0.55, intensity: 2.0, color: park.id === "lunar" ? "#bfe0ff" : "#fff2d4", distance: 160 }),
        effects.lightCone({ name: `flood-cone-${i}`, position: [tx * 0.9, 14.6, tz * 0.9], direction: [-tx * 0.05, -1, (10 - tz) * 0.05], color: "#bfe0ff", intensity: 0.22, length: 15, coneAngle: 0.5, softness: 0.6 } as any)
      );
    });
  }

  return nodes;
}

function buildParkExtras(park: ParkSpec): any[] {
  const nodes: any[] = [];
  // Photoreal rock GLBs carry warm AI textures that fight the flat-shaded
  // players. Knock them back to a restrained desert palette and reduce their
  // silhouettes so the field stays the subject.
  const rockOverride = [{ color: "#745845", colorMode: "replace" as const, replaceTextures: true, roughness: 0.96, metallic: 0 }];
  const rockOverrideAlt = [{ color: "#82644e", colorMode: "replace" as const, replaceTextures: true, roughness: 0.94, metallic: 0 }];
  // Outfield props come from rules.ts PROP_SPOTS, pushed behind each park's fence (C3).
  const at = (name: string): [number, number] => propSpot(park, name);
  switch (park.id) {
    case "sandlot": {
      const W = HARBOR_WATER;
      nodes.push(
        model(assets.diamondHarborPier, { name: "harbor-pier", targetHeight: 8, role: "setDressing", scaleMode: "fit" }).position(at("harbor-pier")[0], -0.3, at("harbor-pier")[1]).rotate(0, 0.3, 0),
        primitives.plane({ name: "harbor-water", size: [W.w, W.d] as any, material: material.pbr({ color: "#2e5d7a", roughness: 0.35, metalness: 0.3 }) }).position(W.x, W.y, W.z),
        model(assets.diamondTower, { name: "sandlot-windmill", targetHeight: 13, role: "setDressing", scaleMode: "fit" }).position(at("sandlot-windmill")[0], 0, at("sandlot-windmill")[1]).rotate(0, 0.6, 0),
        model(assets.diamondCanyonArch, { name: "sandlot-tower", targetHeight: 12, role: "setDressing", scaleMode: "fit", materialOverrides: rockOverrideAlt }).position(at("sandlot-tower")[0], 0, at("sandlot-tower")[1]).rotate(0, -0.4, 0),
        model(assets.diamondRock, { name: "pine-a", targetHeight: 7, role: "setDressing", scaleMode: "fit", materialOverrides: rockOverride }).position(at("pine-a")[0], 0, at("pine-a")[1]),
        model(assets.diamondRock, { name: "pine-b", targetHeight: 6.5, role: "setDressing", scaleMode: "fit", materialOverrides: rockOverrideAlt }).position(at("pine-b")[0], 0, at("pine-b")[1]).rotate(0, 1.2, 0),
        model(assets.diamondFloodlight, { name: "sandlot-lamp", targetHeight: 5.4, role: "setDressing", scaleMode: "fit" }).position(at("sandlot-lamp")[0], 0, at("sandlot-lamp")[1])
      );
      break;
    }
    case "skyline": {
      const buildings: [number, number][] = [[46, 0.5], [52, -0.4], [38, 0.9], [30, -0.9], [60, 0.1]];
      buildings.forEach(([h, r], i) => {
        const [x, z] = at(`skyline-bldg-${i}`);
        nodes.push(model(assets.diamondTower, { name: `skyline-bldg-${i}`, targetHeight: h, role: "setDressing", scaleMode: "fit" }).position(x, 0, z).rotate(0, r, 0));
      });
      for (let i = 0; i < 4; i++) {
        const theta = -24 + i * 16;
        const pm = fencePoint(park, theta, 0);
        nodes.push(
          primitives
            .box({ name: `window-target-${i}`, size: [7.5, 4.6, 0.5], material: material.emissive({ color: "#16324a", emissive: "#35d6ff", emissiveIntensity: 0.55 }) })
            .position(pm[0] * 1.18, 9.5 + i * 2.2, pm[2] * 1.18 - 3)
            .rotate(0, (theta * Math.PI) / 180, 0)
            .runtime(game.runtimeNode(`window-target-${i}`))
        );
      }
      for (const [lx, lz] of [[-26, 8], [26, 8], [-46, -30], [46, -30]] as const) {
        nodes.push(model(assets.diamondFloodlight, { name: `lamp-${lx}`, targetHeight: 6, role: "setDressing", scaleMode: "fit" }).position(lx, 0, lz));
      }
      break;
    }
    case "canyon": {
      const rocks: [number, number][] = [[13, 0.3], [15, -0.7], [7.5, 1.1], [6.5, -0.4], [22, 0]];
      rocks.forEach(([h, r], i) => {
        const [x, z] = at(`canyon-rock-${i}`);
        nodes.push(model(assets.diamondRock, {
          name: `canyon-rock-${i}`, targetHeight: h, role: "setDressing", scaleMode: "fit",
          materialOverrides: i % 2 ? rockOverrideAlt : rockOverride
        }).position(x, 0, z).rotate(0, r, 0));
      });
      for (const [tx, tz] of [[-108, -40], [110, -44], [-88, -20], [88, -16]] as const) {
        nodes.push(model(assets.diamondRock, {
          name: `canyon-pine-${tx}`, targetHeight: 8.5, role: "setDressing", scaleMode: "fit",
          materialOverrides: rockOverride
        }).position(tx, 0, tz));
      }
      break;
    }
    case "ivy": {
      nodes.push(
        model(assets.diamondStadium, { name: "ivy-grandstand", targetHeight: 14, role: "setDressing", scaleMode: "fit" }).position(0, 0, 26).rotate(0, Math.PI, 0),
        model(assets.diamondTrophy, { name: "ivy-trophy", targetHeight: 2.4, role: "setDressing", scaleMode: "fit" }).position(-9.5, 0, 8.4).rotate(0, 0.9, 0),
        model(assets.diamondTrophy, { name: "ivy-statue", targetHeight: 4.2, role: "primaryWorld", scaleMode: "fit" }).position(14, 0, 10).rotate(0, -2.4, 0),
        ...Array.from({ length: 7 }, (_, i) => {
          const theta = -36 + i * 12;
          const pm = fencePoint(park, theta, 0);
          return model(assets.diamondIvyWall, {
            name: `ivy-vine-${i}`,
            targetHeight: park.wallH + 1.2,
            role: "setDressing",
            scaleMode: "fit"
          })
            .position(pm[0] * 0.995, 0, pm[2] * 0.995)
            .rotate(0, (theta * Math.PI) / 180, 0);
        })
      );
      break;
    }
    case "dome": {
      nodes.push(
        model(assets.diamondTyphoonDome, { name: "typhoon-dome-shell", targetHeight: 60, role: "setDressing", scaleMode: "fit" }).position(0, -0.4, -42).rotate(0, Math.PI, 0),
        ...Array.from({ length: 5 }, (_, i) => primitives.box({ name: `dome-rafter-${i}`, size: [1.2, 1.2, 190], material: material.pbr({ color: "#233046", roughness: 0.6, metalness: 0.4 }) }).position(-60 + i * 30, 26, -50)),
        ...Array.from({ length: 4 }, (_, i) => primitives.box({ name: `dome-banner-${i}`, size: [3.2, 7, 0.2], material: material.emissive({ color: "#ffb03a", emissive: i % 2 ? "#35d6ff" : "#ffb03a", emissiveIntensity: 0.7 }) }).position(-18 + i * 12, 14, 18))
      );
      break;
    }
    case "lunar": {
      nodes.push(
        model(assets.diamondEarthRise, { name: "lunar-earth", targetHeight: 90, role: "primaryWorld", scaleMode: "fit" }).position(-30, 66, -260),
        model(assets.diamondLunarRover, { name: "lunar-rover", targetHeight: 2.6, role: "setDressing", scaleMode: "fit" }).position(-17, 0, 9).rotate(0, 0.8, 0),
        ...Array.from({ length: 6 }, (_, i) => primitives.cylinder({ name: `regolith-${i}`, size: [4 + i, 0.5, 4 + i * 0.7], material: material.pbr({ color: "#5d6378", roughness: 1 }) }).position(at(`regolith-${i}`)[0], 0.1, at(`regolith-${i}`)[1])),
        model(assets.diamondMoonDome, { name: "lunar-comms", targetHeight: 15, role: "setDressing", scaleMode: "fit" }).position(at("lunar-comms")[0], 0, at("lunar-comms")[1]).rotate(0, -0.5, 0)
      );
      break;
    }
  }
  return nodes;
}

/** An admitted 3D catalog athlete grounded cleanly with skeletal animation. */
function buildAthleteNodes(id: string, asset: any, initialClip = "Ready"): any[] {
  return [
    model(asset, { name: id, targetHeight: 1.88, role: "primaryCharacter", scaleMode: "fit" })
      .position(0, -80, 0)
      .animate({ clip: initialClip, loop: true, speed: 1.0 })
      .runtime(game.runtimeNode(id))
  ];
}

const FIELDER_IDS = ["f-c", "f-1b", "f-2b", "f-ss", "f-3b", "f-lf", "f-cf", "f-rf"] as const;
/** Everyone who wears a glove except the catcher (his mitt has its own node and calibrated offsets). */
const GLOVE_OWNERS = ["pitcher", "f-1b", "f-2b", "f-ss", "f-3b", "f-lf", "f-cf", "f-rf"] as const;
/** Everyone in uniform who gets a team cap and belt. */
const KIT_OWNERS = ["pitcher", ...FIELDER_IDS, "batter", "runner-0", "runner-1", "runner-2"] as const;
/** Cap and belt offsets in bone space (Head and Hips bones point up the body in this rig). */
const CAP_ATTACH_POS: Vec3 = [0, 0.135, 0.012];
const BELT_ATTACH_POS: Vec3 = [0, 0.045, 0];
const FIELDER_SPOTS: Record<string, Vec3> = {
  // The single catcher crouches behind the plate, offset to the camera-right
  // of the batter so it never crosses the batting-camera line.
  "f-c": [0.55, 0, 2.45],
  "f-1b": [14.2, 0, -14.2],
  "f-2b": [7.4, 0, -19.5],
  "f-ss": [-8.2, 0, -19.5],
  "f-3b": [-14.2, 0, -14.2],
  "f-lf": [-30, 0, -52],
  "f-cf": [0, 0, -68],
  "f-rf": [30, 0, -52]
};

function buildActorsNodes(): any[] {
  const nodes: any[] = [
    ...buildAthleteNodes("pitcher", assets.diamondAthlete, "Crouch_Idle_Loop"),
    ...buildAthleteNodes("batter", assets.diamondAthlete, "Idle_Loop"),
    ...FIELDER_IDS.flatMap((id) =>
      buildAthleteNodes(id, assets.diamondAthlete, id === "f-lf" || id === "f-cf" || id === "f-rf" ? "Ready" : "Crouch_Idle_Loop")
    ),
    ...Array.from({ length: 3 }, (_, i) => buildAthleteNodes(`runner-${i}`, assets.diamondAthlete, "Crouch_Idle_Loop")).flat(),
    model(assets.diamondAthlete, { name: "coach-1b", targetHeight: 1.88, role: "primaryCharacter", scaleMode: "fit" })
      .position(21.5, 0, -14.8)
      .rotate(0, -Math.PI * 0.72, 0)
      .animate({ clip: "Crouch_Idle_Loop", loop: true, speed: 1.0 })
      .runtime(game.runtimeNode("coach-1b")),
    model(assets.diamondAthlete, { name: "coach-3b", targetHeight: 1.88, role: "primaryCharacter", scaleMode: "fit" })
      .position(-21.5, 0, -14.8)
      .rotate(0, Math.PI * 0.72, 0)
      .animate({ clip: "Crouch_Idle_Loop", loop: true, speed: 1.0 })
      .runtime(game.runtimeNode("coach-3b")),
    // Hidden dugout glove reference so route asset validation sees diamondGlove without floating mitts in front of fielders
    model(assets.diamondGlove, { name: "dugout-glove-ref", targetMaxDimension: 0.34, role: "setDressing", scaleMode: "fit", visible: false })
      .position(0, -80, 0)
      .scale(HIDDEN_SCALE),
    // Catcher's mitt — socketed to the crouched catcher's left forearm at runtime
    model(assets.diamondGlove, { name: "catcher-mitt", targetMaxDimension: 0.36, role: "setDressing", scaleMode: "fit" })
      .position(0.25, 0.55, 2.1)
      .rotate(0, Math.PI, 0.3)
      .runtime(game.runtimeNode("catcher-mitt"))
  ];

  // Fielder and pitcher gloves — each rides its owner's left forearm through the kit attach (no world-authored spot).
  for (const id of GLOVE_OWNERS) {
    nodes.push(
      model(assets.diamondGlove, { name: `glove-${id}`, targetMaxDimension: 0.34, role: "setDressing", scaleMode: "fit" })
        .position(0, -80, 0)
        .runtime(game.runtimeNode(`glove-${id}`))
    );
  }

  // Team cap and belt per athlete (C5): primitives that ride the Head and Hips bones (attached in attachBatSocket) and take the
  // team colour through setMaterial in applyUniforms. The athlete GLB has one mesh and one material, so a tint would recolour skin too.
  for (const id of KIT_OWNERS) {
    nodes.push(
      primitives.sphere({ name: `${id}-cap`, size: [0.205, 0.11, 0.225], material: material.pbr({ color: "#f2eee3", roughness: 0.6 }) }).position(0, -80, 0).runtime(game.runtimeNode(`${id}-cap`)),
      primitives.cylinder({ name: `${id}-belt`, size: [0.33, 0.05, 0.25], material: material.pbr({ color: "#f2eee3", roughness: 0.6 }) }).position(0, -80, 0).runtime(game.runtimeNode(`${id}-belt`))
    );
  }

  // Bat — socketed to the batter's right forearm (knob at the palm); authored
  // transform is only a sane first frame before the socket takes ownership.
  nodes.push(
    model(assets.diamondBat, { name: "bat", targetMaxDimension: 1.02, scaleMode: "fit" })
      .position(-0.51, 1.52, 0.18)
      .rotate(0, BATTER_YAW + 0.15, 1.0)
      .runtime(game.runtimeNode("bat")),
    // Hidden root-level probe pinned to the same bone to calibrate the
    // actor fit scale / normalization shift for world⇄actor conversions.
    primitives
      .sphere({ name: "bat-cal", size: [0.02, 0.02, 0.02], material: material.pbr({ color: "#000000", opacity: 0.0, roughness: 1 }) })
      .position(0, -80, 0)
      .scale(HIDDEN_SCALE)
      .runtime(game.runtimeNode("bat-cal"))
  );

  // Ball: a 16x12 sphere (about 360 triangles) instead of the 20,326-triangle GLB (C12); at 15 cm on the broadcast
  // camera the seams of the GLB were never visible. The sphere is centred on its node (the GLB was grounded by fit).
  nodes.push(
    primitives.sphere({ name: "ball", size: [0.15, 0.15, 0.15], params: { widthSegments: 16, heightSegments: 12 }, material: material.pbr({ color: "#f4f1e8", roughness: 0.55 }) } as any).position(0, -60, 0).runtime(game.runtimeNode("ball")),
    primitives.cylinder({ name: "ball-shadow", size: [0.34, 0.006, 0.34], material: material.pbr({ color: "#000000", opacity: 0.28, roughness: 1 }) }).runtime(game.runtimeNode("ball-shadow")),
    effects.trail({ name: "ball-ribbon", target: "ball", color: "#f5f1e4", width: 0.1, maxPoints: 40, intensity: 0.85 } as any)
  );

  for (let i = 0; i < TRAIL_COUNT; i++) {
    nodes.push(
      primitives.sphere({ name: `ball-trail-${i}`, size: [0.09, 0.09, 0.09], material: material.emissive({ color: "#ffd76a", emissive: "#ffd76a", emissiveIntensity: 0.5 }) }).scale(HIDDEN_SCALE).runtime(game.runtimeNode(`ball-trail-${i}`))
    );
  }

  // Strike-zone helpers: PCI ring (batting) + aim dot (pitching) + landing ring
  nodes.push(
    primitives.torus({ name: "pci-ring", size: [0.42, 0.045] as any, material: material.emissive({ color: "#ffb03a", emissive: "#ffb03a", emissiveIntensity: 1.1 }) }).runtime(game.runtimeNode("pci-ring")),
    primitives.sphere({ name: "aim-dot", size: [0.16, 0.16, 0.16], material: material.emissive({ color: "#35d6ff", emissive: "#35d6ff", emissiveIntensity: 1.2 }) }).runtime(game.runtimeNode("aim-dot")),
    primitives.torus({ name: "land-ring", size: [0.5, 0.04] as any, material: material.emissive({ color: "#7dfcff", emissive: "#7dfcff", emissiveIntensity: 1.15 }) }).rotate(Math.PI / 2, 0, 0).runtime(game.runtimeNode("land-ring")),
    primitives.torus({ name: "zone-frame", size: [0.62, 0.03] as any, material: material.emissive({ color: "#f5f1e4", emissive: "#f5f1e4", emissiveIntensity: 0.3 }) }).position(0, ZONE_CY, 0.1).runtime(game.runtimeNode("zone-frame"))
  );

  // Celebration particle fountains (hidden until fired)
  nodes.push(
    effects.particles({ name: "confetti", emitter: "fountain", position: [0, 4, 0], color: "#ffd76a", intensity: 1, visible: false, particleCount: 260, speed: 1.2, radius: 3.2, gravity: -1.2 } as any).runtime(game.runtimeNode("confetti")),
    effects.particles({ name: "hr-burst", emitter: "fountain", position: [0, 1.2, -2], color: "#ffb03a", intensity: 1, visible: false, particleCount: 200, speed: 1.6, radius: 1.6, gravity: -2.4 } as any).runtime(game.runtimeNode("hr-burst")),
    effects.particles({ name: "flair-burst", emitter: "fountain", position: [-0.8, 1.4, 0.4], color: "#35d6ff", intensity: 1, visible: false, particleCount: 160, speed: 1.1, radius: 0.8, gravity: -0.8 } as any).runtime(game.runtimeNode("flair-burst"))
  );

  return nodes;
}

const QA_FLAGS = (() => {
  const q = typeof window === "undefined" ? new URLSearchParams() : new URLSearchParams(window.location.search);
  return { noAo: q.get("qa-ao") === "0", noContact: q.get("qa-contact") === "0" };
})();

function buildParkScene(park: ParkSpec): any {
  // fogDensityScale 0 removes the preset's volumetric fog: at stadium
  // distances even a heavily scaled density washed the stands out in white.
  const lookOverrides: Record<string, any> = {
    sandlot: { fogDensityScale: 0, exposureEv: 0.14 },
    skyline: { fogDensityScale: 0, exposureEv: 0.12 },
    canyon: { fogDensityScale: 0, exposureEv: 0.1 },
    ivy: { fogDensityScale: 0, exposureEv: 0.12 },
    dome: { fogDensityScale: 0, exposureEv: 0.14 },
    lunar: { fogDensityScale: 0, exposureEv: 0.16 }
  };
  // Match each look's own horizon instead of the old near-black navy slab.
  const backdrop: Record<ParkId, string> = {
    sandlot: "#c98a5a",
    skyline: "#070a12",
    canyon: "#8f9aa3",
    ivy: "#9db8cf",
    dome: "#101216",
    lunar: "#04070d"
  };
  // QA-only switches for the AO and contact-shadow on/off capture pairs (LIGHT-06, C17): `?qa-ao=0`, `?qa-contact=0`.
  const look = looks.preset(park.look as any, lookOverrides[park.id] ?? { fogDensityScale: 0 });
  let lookNode: any = look;
  if (QA_FLAGS.noAo) {
    const g = look.toJSON() as any;
    lookNode = { ...g, children: (g.children ?? []).filter((c: any) => c.effect !== "ambient-occlusion") };
  }
  const sc = scene().add(lookNode).background(backdrop[park.id]);
  if (!QA_FLAGS.noContact) sc.add(effects.contactShadows({ intensity: 0.75, length: 0.3 }));
  return sc
    .add(effects.vignette({ intensity: 0.16, smoothness: 0.7 }))
    .camera(camera.perspective({ fov: 42, near: 0.2, far: 700, position: [0, 26, 42], target: [0, 0, -14] }))
    .addMany(buildFieldNodes(park))
    .addMany(buildStandsNodes(park))
    .addMany(buildParkExtras(park))
    .addMany(buildActorsNodes());
}

/* ================================================================== *
 *  Boot                                                               *
 * ================================================================== */

const getEl = <T extends HTMLElement>(id: string): T | null => document.getElementById(id) as T | null;

function boot(): void {
  const mountPoint = document.getElementById("app");
  const renderError = getEl("render-error");
  let auraApp: ReturnType<typeof createAuraApp>;
  try {
    auraApp = createAuraApp("#app", {
      scene: buildParkScene(PARKS.sandlot),
      qualityRebuild: { flags: ["game", "animation"] },
      renderer: { quality: "high" }
    } as any);
  } catch (err) {
    if (renderError) {
      renderError.hidden = false;
      renderError.textContent = `Aura Diamond 3D failed to start: ${String(err)}`;
    }
    return;
  }
  if (!mountPoint) return;
  const app = auraApp;

  /* ---------- DOM refs ---------- */
  const el = {
    hud: getEl("hud"),
    mode: getEl("h-mode"),
    linescore: getEl("h-linescore"),
    count: getEl("h-count"),
    inn: getEl("h-inn"),
    half: getEl("h-half"),
    matchup: getEl("h-matchup"),
    pitcherRep: getEl("h-pitcher-rep"),
    pitchChip: getEl("h-pitch-chip"),
    zone: getEl("h-zone"),
    pciDot: getEl("hz-pci"),
    aimDot: getEl("hz-aim"),
    pitchDot: getEl("hz-pitch"),
    meter: getEl("h-meter"),
    needle: getEl("h-meter-needle"),
    contact: getEl("h-contact"),
    contactGrade: getEl("h-contact-grade"),
    contactData: getEl("h-contact-data"),
    catchPrompt: getEl("h-catch-prompt"),
    derbyCard: getEl("h-derby-card"),
    derbyHr: getEl("h-derby-hr"),
    derbyOuts: getEl("h-derby-outs"),
    derbyLong: getEl("h-derby-long"),
    derbyTotal: getEl("h-derby-total"),
    bullpenCard: getEl("h-bullpen-card"),
    bullpenScore: getEl("h-bullpen-score"),
    bullpenStreak: getEl("h-bullpen-streak"),
    bullpenRound: getEl("h-bullpen-round"),
    msg: getEl("h-msg"),
    msgBig: getEl("h-msg-big"),
    msgSmall: getEl("h-msg-small"),
    banner: getEl("h-banner"),
    ticker: getEl("event-ticker"),
    menu: getEl("menu"),
    menuParks: getEl("menu-parks"),
    menuClubs: getEl("menu-clubs"),
    menuDiff: getEl("menu-diff"),
    studioColors: getEl("studio-colors"),
    studioBats: getEl("studio-bats"),
    studioFlair: getEl("studio-flair"),
    studioSection: getEl("studio-section"),
    bracketPanel: getEl("bracket-panel"),
    menuPlay: getEl("menu-play"),
    menuClose: getEl("menu-close"),
    goCard: getEl("gameover-card"),
    goTitle: getEl("go-title"),
    goLine: getEl("go-line"),
    tbQuick: getEl("tb-quick"),
    tbDerby: getEl("tb-derby"),
    tbAuto: getEl("tb-auto"),
    tbMenu: getEl("tb-menu"),
    controlsHint: getEl("controls-hint"),
    timingNeedle: getEl("h-timing-needle"),
    timingMs: getEl("h-timing-ms"),
    timing: getEl("h-timing"),
    pitchPad: getEl("h-pitch-pad"),
    srResult: getEl("sr-result"),
    goBox: getEl("go-box"),
    goBests: getEl("go-bests"),
    tbMute: getEl("tb-mute")
  };
  const countDots = {
    b: [0, 1, 2, 3].map((i) => getEl(`cd-b${i}`)),
    s: [0, 1, 2].map((i) => getEl(`cd-s${i}`)),
    o: [0, 1, 2].map((i) => getEl(`cd-o${i}`))
  };
  const baseDots = [getEl("hb-1"), getEl("hb-2"), getEl("hb-3")];

  /* ---------- Systems ---------- */
  const eventLog = game.eventLog({ label: "aura-diamond events", maxEvents: 48 });
  const tryReq = (id: string): AnyHandle => {
    try {
      return app.nodes.require(id);
    } catch {
      return null;
    }
  };

  let H: Record<string, AnyHandle> = {};
  const kitVisible = new Map<string, boolean>();
  const lastClipByActor = new Map<string, string>();
  const lastSpeedByActor = new Map<string, number>();

  function setActorAnimation(id: string, handle: AnyHandle, clip: string, speed = 1.0): void {
    if (!handle) return;
    const prevClip = lastClipByActor.get(id);
    const prevSpeed = lastSpeedByActor.get(id) ?? 1.0;
    if (prevClip === clip && Math.abs(prevSpeed - speed) < 0.05) return;
    lastClipByActor.set(id, clip);
    lastSpeedByActor.set(id, speed);
    try {
      if (typeof handle.setAnimation === "function") {
        handle.setAnimation({ clip, loop: true, speed });
      } else if (typeof handle.crossFadeTo === "function") {
        handle.crossFadeTo(clip, 0.16, { loop: true, timeScale: speed });
      } else if (typeof handle.play === "function") {
        handle.play(clip, { loop: true, timeScale: speed });
      }
    } catch {
      /* best-effort animation switch */
    }
  }

  function bindHandles(): void {
    kitVisible.clear();
    lastClipByActor.clear();
    lastSpeedByActor.clear();
    const req = tryReq;
    H = {
      ball: req("ball"),
      ballShadow: req("ball-shadow"),
      bat: req("bat"),
      batCal: tryReq("bat-cal"),
      pci: req("pci-ring"),
      aim: req("aim-dot"),
      landRing: req("land-ring"),
      zoneFrame: req("zone-frame"),
      pitcher: req("pitcher"),
      batter: req("batter"),
      coach1b: tryReq("coach-1b"),
      coach3b: tryReq("coach-3b"),
      catcherMitt: tryReq("catcher-mitt"),
      confetti: tryReq("confetti"),
      hrBurst: tryReq("hr-burst"),
      flairBurst: tryReq("flair-burst")
    };
    for (const id of FIELDER_IDS) H[id] = req(id);
    for (const id of GLOVE_OWNERS) H[`glove-${id}`] = tryReq(`glove-${id}`);
    for (let i = 0; i < 3; i++) H[`runner-${i}`] = req(`runner-${i}`);
    for (const id of KIT_OWNERS) {
      H[`${id}-cap`] = tryReq(`${id}-cap`);
      H[`${id}-belt`] = tryReq(`${id}-belt`);
    }
    H.wavers = Array.from({ length: WAVER_COUNT }, (_, i) => tryReq(`waver-${i}`));
    H.trail = Array.from({ length: TRAIL_COUNT }, (_, i) => tryReq(`ball-trail-${i}`));
    H.windows = Array.from({ length: 4 }, (_, i) => tryReq(`window-target-${i}`));
  }
  bindHandles();

  /* ---------- Input ---------- */
  const input = app.input({
    actions: {
      swing: ["Space", "Enter", "KeyE", "KeyJ"],
      pitch1: ["Digit1", "Numpad1"],
      pitch2: ["Digit2", "Numpad2"],
      pitch3: ["Digit3", "Numpad3"],
      pitch4: ["Digit4", "Numpad4"],
      pciL: ["KeyA", "ArrowLeft"],
      pciR: ["KeyD", "ArrowRight"],
      pciU: ["KeyW", "ArrowUp"],
      pciD: ["KeyS", "ArrowDown"],
      menu: ["Escape"]
    },
    bufferMs: { swing: 160 } as any
  });
  const heldKeys = new Set<string>();
  const justPressedKeys = new Set<string>();
  window.addEventListener("keydown", (e) => {
    if (!heldKeys.has(e.code)) {
      justPressedKeys.add(e.code);
    }
    heldKeys.add(e.code);
  });
  window.addEventListener("keyup", (e) => {
    heldKeys.delete(e.code);
  });
  // C10: a key released while the window was not focused never sends keyup; drop every held and fresh key on blur or hide.
  const dropKeys = (): void => {
    heldKeys.clear();
    justPressedKeys.clear();
  };
  window.addEventListener("blur", dropKeys);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) dropKeys();
  });

  /* ---------- Audio ---------- */
  const audio = createGameAudio({
    browserContext: true,
    cues: {
      crack: { id: "crack", asset: assets.diamondBatCrackSfx as any, volume: 0.75 },
      contact: { id: "contact", asset: assets.diamondContactSfx as any, volume: 0.4 },
      pitch: { id: "pitch", asset: assets.diamondPitchWhooshSfx as any, volume: 0.4 },
      pop: { id: "pop", asset: assets.diamondMittPopSfx as any, volume: 0.55 },
      foul: { id: "foul", asset: assets.diamondFoulSfx as any, volume: 0.5 },
      strikeout: { id: "strikeout", asset: assets.diamondStrikeoutSfx as any, volume: 0.6 },
      homer: { id: "homer", asset: assets.diamondHomerSfx as any, volume: 0.85 },
      homerBig: { id: "homerBig", asset: assets.diamondHomerBigSfx as any, volume: 0.9 },
      quad: { id: "quad", asset: assets.diamondQuadSfx as any, volume: 0.9 },
      crowd: { id: "crowd", asset: assets.diamondCrowdSfx as any, volume: 0.3, loop: true },
      uiClick: { id: "uiClick", asset: assets.diamondClickSfx as any, volume: 0.4 },
      uiConfirm: { id: "uiConfirm", asset: assets.diamondConfirmSfx as any, volume: 0.5 },
      swing: { id: "swing", asset: assets.diamondSwingSfx as any, volume: 0.5 },
      win: { id: "win", asset: assets.diamondOrganSfx as any, volume: 0.8 },
      lose: { id: "lose", asset: assets.diamondWindSfx as any, volume: 0.7 },
      walk: { id: "walk", asset: assets.diamondWalkSfx as any, volume: 0.5 }
    },
    buses: [{ id: "sfx" } as any]
  } as any);
  const unlockAudio = () => void audio.unlock();
  window.addEventListener("pointerdown", unlockAudio, { once: true });
  window.addEventListener("keydown", unlockAudio, { once: true });
  const cue = (id: string) => {
    try {
      void (audio as any).cue(id);
    } catch {
      /* audio is best-effort */
    }
  };

  /* ---------- Juice / FX ---------- */
  const params = new URLSearchParams(window.location.search);
  const reducedMotion = params.has("reducedMotion") || (window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false);
  const reducedFlash = params.has("reducedFlash") || (window.matchMedia?.("(prefers-reduced-flash: reduce)")?.matches ?? false);

  let fxLayer = document.getElementById("fx-layer");
  if (!fxLayer) {
    fxLayer = document.createElement("div");
    fxLayer.id = "fx-layer";
    fxLayer.setAttribute("aria-hidden", "true");
    fxLayer.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:26;background:transparent;";
    document.body.appendChild(fxLayer);
  }
  let hitStopUntil = 0;
  const fxCtl = (game as any).effects({ app, reducedMotion, reducedFlash });
  const FX_KIND: Record<string, string> = {
    spark: "hit-spark",
    dust: "ground-dust",
    ring: "ring-shockwave",
    streak: "dash-trail",
    burst: "aura-burst",
    flash: "super-flash"
  };
  const fx = createFxParticlePass({
    burst: (kind: string, position: any, o: any) => {
      try {
        fxCtl.spawn(FX_KIND[kind] ?? "hit-spark", position, { radius: Math.max(0.2, (o?.count ?? 10) / 24), color: o?.color, intensity: 1 });
      } catch {
        /* fx best-effort */
      }
    }
  } as any);
  const JUICE_EVENTS: Record<string, any> = {
    crack: { fx: { kind: "spark", count: 14, color: "#ffd76a", speed: 4 }, cue: "crack", shake: 0.35, punch: { fovDeg: 2.4, ms: 200 }, rumble: { ms: 50, strong: 0.5, weak: 0.8 } },
    homer: { fx: { kind: "ring", count: 26, color: "#ffb03a", speed: 6.5 }, cue: "homer", hitStop: 0.09, shake: 0.55, punch: { fovDeg: 3.6, dolly: -0.5, ms: 320 }, flash: { color: "#ffb03a", peak: 0.22, ms: 180 } },
    strikeout: { cue: "strikeout", flash: { color: "#ff5252", peak: 0.12, ms: 130 } },
    pop: { cue: "pop", punch: { fovDeg: 1.2, ms: 140 } },
    foul: { cue: "foul", flash: { color: "#ff9a3d", peak: 0.1, ms: 110 } },
    pitch: { cue: "pitch" },
    swing: { cue: "swing", punch: { fovDeg: 0.8, ms: 100 } },
    walkoff: { cue: "homerBig", shake: 0.5, punch: { fovDeg: 3.2, ms: 380 }, flash: { color: "#ffd76a", peak: 0.24, ms: 260 } },
    win: { cue: "win", shake: 0.4, flash: { color: "#5be37d", peak: 0.2, ms: 220 } },
    lose: { cue: "lose", flash: { color: "#ff5252", peak: 0.16, ms: 200 } },
    flair: { fx: { kind: "burst", count: 18, color: "#35d6ff", speed: 3 }, cue: "quad" }
  };
  const juice = createJuice({
    events: JUICE_EVENTS as any,
    camera: (app as any).camera,
    session: { reducedMotion, reducedFlash, hitStop: (s: number) => (hitStopUntil = performance.now() / 1000 + s), slowMo: () => {} } as any,
    fx,
    overlay: createOverlayDriver({ domElement: fxLayer }),
    tweens: createTweenEngine(),
    rumble: createRumbleDriver(),
    sound: { cue }
  } as any);
  const juiceFire = (ev: string, at?: Record<string, unknown>) => {
    try {
      (juice as any).fire(ev, at);
    } catch {
      /* juice best-effort */
    }
  };
  let touchControls: any = null;
  try {
    touchControls = mountTouchControls(
      input as any,
      { preset: "dpad-4btn", bindings: { "stick.left": "pciL", "stick.right": "pciR", "stick.up": "pciU", "stick.down": "pciD", light: "swing", heavy: "swing", jump: "swing", special: "swing" }, haptics: { ms: 14 } } as any,
      { doc: document as any, root: document.body as any, coarsePointer: () => window.matchMedia?.("(pointer: coarse)")?.matches ?? false } as any
    );
  } catch {
    /* touch controls optional */
  }

  /* ---------- Game state ---------- */
  interface GameState {
    mode: ModeId;
    pendingMode: ModeId;
    phase: Phase;
    park: ParkId;
    diff: DiffId;
    playerClub: string;
    cpuClub: string;
    autopilot: boolean;
    inning: number;
    inningsTotal: number;
    half: "top" | "bottom";
    outs: number;
    balls: number;
    strikes: number;
    bases: [boolean, boolean, boolean];
    score: { player: number; cpu: number };
    linescore: { player: number[]; cpu: number[] };
    pitchNo: number;
    pitch: LivePitch | null;
    batted: BattedBall | null;
    phaseT: number;
    pci: [number, number];
    aim: [number, number];
    selPitch: PitchId;
    meterNeedle: number;
    meterDir: number;
    charging: boolean;
    batterStepTimer: number;
    batterAimX: number;
    batterAimZ: number;
    fielderThrowTimer: number;
    activeThrowerId: string;
    lastTimingErr: number | null;
    lastGrade: string;
    lastEV: number;
    lastLA: number;
    lastDistFt: number;
    lastBallPos: Vec3;
    derby: { outs: number; hrs: number; longest: number; totalFt: number; done: boolean };
    bullpen: { round: number; correct: number; streak: number; bestStreak: number; guess: PitchId | null; queue: PitchId[]; done: boolean };
    studio: { color: string; bat: string; flair: string; swings: number };
    classic: BracketState | null;
    catchPrompt: { fielder: string; pos: Vec3 } | null;
    runnersAnim: { node: number; from: Vec3; to: Vec3; t: number }[];
    runnerBase: number[];
    batterRunning: boolean;
    pushUsed: boolean;
    pendingOutSlot: number;
    windowFlash: number;
    gameNo: number;
    bannerT: number;
    msgT: number;
    cam: { mode: CamMode; eye: Vec3; target: Vec3; fov: number; orbit: number };
    seed: number;
    rng: () => number;
    over: boolean;
    result: string;
    lastBatColor: string;
    lastFieldColor: string;
    /** Fielder holding a caught fly ball during the runners beat. */
    caughtBy: string | null;
    hits: { player: number; cpu: number };
    longestFt: number;
    /** WORLD_TEAMS index of the current World Classic opponent (HUD names, C20). */
    classicOpp: number;
  }

  const G: GameState = {
    mode: "quick",
    pendingMode: "quick",
    phase: "menu",
    park: "sandlot",
    diff: "pro",
    playerClub: "seals",
    cpuClub: "liners",
    autopilot: params.get("autoplay") === "1" || params.get("demo") === "1",
    inning: 1,
    inningsTotal: 3,
    half: "top",
    outs: 0,
    balls: 0,
    strikes: 0,
    bases: [false, false, false],
    score: { player: 0, cpu: 0 },
    linescore: { player: [], cpu: [] },
    pitchNo: 0,
    pitch: null,
    batted: null,
    phaseT: 0,
    pci: [0, 0],
    aim: [0, 0],
    selPitch: "fourseam",
    meterNeedle: 0,
    meterDir: 1,
    charging: false,
    batterStepTimer: 0,
    batterAimX: 0,
    batterAimZ: 0,
    fielderThrowTimer: 0,
    activeThrowerId: "",
    lastTimingErr: null,
    lastGrade: "",
    lastEV: 0,
    lastLA: 0,
    lastDistFt: 0,
    lastBallPos: [0, -60, 0],
    derby: { outs: 0, hrs: 0, longest: 0, totalFt: 0, done: false },
    bullpen: { round: 0, correct: 0, streak: 0, bestStreak: 0, guess: null, queue: [], done: false },
    studio: { color: "#ffb03a", bat: "ash", flair: "fireworks", swings: 0 },
    classic: null,
    catchPrompt: null,
    runnersAnim: [],
    runnerBase: [-1, -1, -1],
    batterRunning: false,
    pushUsed: false,
    pendingOutSlot: -1,
    windowFlash: 0,
    gameNo: 0,
    bannerT: 0,
    msgT: 0,
    cam: { mode: "menuOrbit", eye: [0, 26, 42], target: [0, 1, -14], fov: 42, orbit: 0 },
    seed: 0xd1a03d,
    rng: makeRng(0xd1a03d),
    over: false,
    result: "",
    lastBatColor: "",
    lastFieldColor: "",
    caughtBy: null,
    hits: { player: 0, cpu: 0 },
    longestFt: 0,
    classicOpp: -1
  };

  const park = (): ParkSpec => PARKS[G.park];
  /** Display abbreviation of a side: in the World Classic the national squads, otherwise the clubs (C20). */
  function clubAbbr(side: "player" | "cpu"): string {
    if (G.mode === "classic" && G.classic) {
      if (side === "player") return WORLD_TEAMS[G.classic.player]?.abbr ?? "AUR";
      if (G.classicOpp >= 0) return WORLD_TEAMS[G.classicOpp]?.abbr ?? clubById(G.cpuClub).abbr;
    }
    return clubById(side === "player" ? G.playerClub : G.cpuClub).abbr;
  }
  const battingIsPlayer = (): boolean => G.half === "top";
  const battingClub = (): ClubSpec => (battingIsPlayer() ? clubById(G.playerClub) : clubById(G.cpuClub));
  const fieldingClub = (): ClubSpec => (battingIsPlayer() ? clubById(G.cpuClub) : clubById(G.playerClub));
  const battingTeamKey = (): "player" | "cpu" => (battingIsPlayer() ? "player" : "cpu");
  const playerPitchingTurn = (): boolean => (G.mode === "quick" || G.mode === "classic") && G.half === "bottom";

  /* ---------- Event ticker + banners ---------- */
  function tick(label: string, severity: "info" | "success" | "warning" = "info", value?: number): void {
    const rec = eventLog.push({ type: "game", label, severity, value, time: performance.now() / 1000, frame: framesRendered });
    const t = el.ticker;
    if (t) {
      const item = document.createElement("div");
      item.className = `tick${severity === "success" ? " tick-success" : severity === "warning" ? " tick-warn" : ""}`;
      item.textContent = rec.label;
      t.prepend(item);
      while (t.children.length > 5) t.lastElementChild?.remove();
      requestAnimationFrame(() => item.classList.add("show"));
    }
  }

  /** Polite screen-reader announcement of at-bat results (C19); banners carry every at-bat result. */
  function announce(text: string): void {
    if (el.srResult) el.srResult.textContent = text;
  }

  /** Early/late bar and ms readout after a player's swing (C22). */
  function showTiming(timingErr: number | null): void {
    if (!el.timing) return;
    if (timingErr === null) {
      el.timing.style.display = "none";
      if (el.timingMs) el.timingMs.textContent = "";
      return;
    }
    el.timing.style.display = "";
    const ms = Math.round(timingErr * 1000);
    if (el.timingNeedle) el.timingNeedle.style.left = `${50 + clamp(timingErr / 0.155, -1, 1) * 50}%`;
    if (el.timingMs) el.timingMs.textContent = Math.abs(ms) <= 15 ? `ON TIME (${ms >= 0 ? "+" : ""}${ms} MS)` : `${ms < 0 ? "EARLY" : "LATE"} ${Math.abs(ms)} MS`;
  }

  function showBanner(text: string, dur = 1.8): void {
    announce(text);
    if (el.banner) {
      el.banner.textContent = text;
      el.banner.classList.add("show");
    }
    G.bannerT = dur;
  }

  function showMsg(big: string, small: string, dur = 2.2): void {
    if (el.msgBig) el.msgBig.textContent = big;
    if (el.msgSmall) el.msgSmall.textContent = small;
    el.msg?.classList.add("show");
    G.msgT = dur;
  }

  let contactHideAt = 0;
  let lastCross: [number, number] | null = null;
  let lastCrossUntil = 0;
  let pitchChipHideAt = 0;
  let flairOnUntil = 0;
  let confettiUntil = 0;
  let hrBurstUntil = 0;

  function showContact(grade: string, data: string, dur = 1.4): void {
    if (el.contactGrade) {
      el.contactGrade.textContent = grade;
      el.contactGrade.className = `grade ${grade.toLowerCase().replace(/\s.*/, "")}`;
    }
    if (el.contactData) el.contactData.textContent = data;
    el.contact?.classList.add("show");
    contactHideAt = performance.now() / 1000 + dur;
  }

  function showPitchChip(text: string, cls = "", dur = 1.7): void {
    const c = el.pitchChip;
    if (!c) return;
    c.textContent = text;
    c.className = `chip show ${cls}`.trim();
    pitchChipHideAt = performance.now() / 1000 + dur;
  }

  /* ---------- Linescore ---------- */
  let linescoreCache = "";
  function renderLinescore(): void {
    const table = el.linescore;
    if (!table) return;
    const cols = Math.max(3, G.inningsTotal, G.inning);
    const head = `<tr><th></th>${Array.from({ length: cols }, (_, i) => `<th>${i + 1}</th>`).join("")}<th>R</th></tr>`;
    const rowFor = (key: "player" | "cpu") => {
      const batting = battingTeamKey() === key && !G.over ? " class=\"batting\"" : "";
      const cells = Array.from({ length: cols }, (_, i) => {
        const v = G.linescore[key][i];
        // Unplayed innings stay blank in broadcast convention; a spent
        // scoreless inning is a stored 0 and still reads as 0.
        return `<td${i === G.inning - 1 && batting ? " class=\"cur\"" : ""}>${v ?? "–"}</td>`;
      }).join("");
      return `<tr${batting}><td class="tname">${clubAbbr(key)}</td>${cells}<td class="runs">${G.score[key]}</td></tr>`;
    };
    const html = head + rowFor("player") + rowFor("cpu");
    if (html !== linescoreCache) {
      linescoreCache = html;
      table.innerHTML = html;
    }
  }

  /* ---------- Game flow ---------- */
  function resetCount(): void {
    G.balls = 0;
    G.strikes = 0;
  }

  function resetField(): void {
    G.bases = [false, false, false];
    G.runnerBase = [-1, -1, -1];
    G.batted = null;
    G.pitch = null;
    G.catchPrompt = null;
    G.batterRunning = false;
    G.pushUsed = false;
    G.pendingOutSlot = -1;
    G.runnersAnim = [];
    resetCount();
  }

  function resetMatch(mode: ModeId): void {
    G.gameNo += 1;
    G.rng = makeRng((G.seed + G.gameNo * 7919) >>> 0);
    G.inning = 1;
    G.half = "top";
    G.inningsTotal = mode === "classic" ? 1 : 3;
    G.outs = 0;
    G.score = { player: 0, cpu: 0 };
    G.linescore = { player: [], cpu: [] };
    G.pitchNo = 0;
    G.derby = { outs: 0, hrs: 0, longest: 0, totalFt: 0, done: false };
    G.bullpen = { round: 0, correct: 0, streak: 0, bestStreak: 0, guess: null, queue: [], done: false };
    G.studio.swings = 0;
    G.hits = { player: 0, cpu: 0 };
    G.longestFt = 0;
    G.over = false;
    G.result = "";
    resetField();
    if (mode === "bullpen") {
      const pool: PitchId[] = ["fourseam", "curve", "slider", "changeup"];
      const q = Array.from({ length: 12 }, (_, i) => pool[i % 4]!);
      for (let i = q.length - 1; i > 0; i--) {
        const j = Math.floor(G.rng() * (i + 1));
        [q[i], q[j]] = [q[j]!, q[i]!];
      }
      G.bullpen.queue = q;
    }
  }

  const WORLD_RATINGS = WORLD_TEAMS.map((t) => t.rating);

  function startClassicBracket(): void {
    G.classic = createBracket(WORLD_TEAMS.length, makeRng(0xc1a551 + G.gameNo * 131));
  }

  /** Resolve the player's classic game result + advance (or end) the bracket. */
  function advanceClassicRound(playerWon: boolean, playerScore: number, cpuScore: number): void {
    if (G.classic) advanceBracket(G.classic, playerWon, playerScore, cpuScore, WORLD_RATINGS, G.rng);
  }

  function renderBracket(): void {
    const panel = el.bracketPanel;
    const b = G.classic;
    if (!panel) return;
    if (!b || G.pendingMode !== "classic") {
      panel.classList.remove("show");
      return;
    }
    const cols = b.rounds
      .map((round, r) => {
        const gamesHtml = round
          .map((g) => {
            const ta = WORLD_TEAMS[g.a]!;
            const tb = WORLD_TEAMS[g.b]!;
            const score = g.played ? ` ${g.scoreA}·${g.scoreB}` : "";
            const wAbbr = g.played ? WORLD_TEAMS[g.winner]!.abbr : "";
            const cls = `bp-game${g.me ? " me" : ""}`;
            return `<div class="${cls}">${g.played ? `<span class="w">${wAbbr}</span> ` : ""}${ta.abbr} v ${tb.abbr}${score}</div>`;
          })
          .join("");
        return `<div class="bp-round"><div class="r-name">${CLASSIC_ROUND_NAMES[r] ?? `R${r}`}</div>${gamesHtml}</div>`;
      })
      .join("");
    const status =
      b.champion !== null && b.champion !== undefined && b.champion >= 0
        ? `<div class="bp-round"><div class="r-name">CHAMPION</div><div class="bp-game me"><span class="w">${WORLD_TEAMS[b.champion]!.abbr}</span> ${WORLD_TEAMS[b.champion]!.name}</div></div>`
        : "";
    panel.innerHTML = `<div class="bp-rounds">${cols}${status}</div>`;
    panel.classList.add("show");
  }

  /* ---------- Mode + menu plumbing ---------- */
  const MODE_TAGS: Record<ModeId, string> = {
    quick: "QUICK PLAY",
    derby: "DERBY LAB",
    bullpen: "BULLPEN LAB",
    classic: "WORLD CLASSIC",
    studio: "PLAYER STUDIO"
  };

  function setModeTag(): void {
    if (el.mode) el.mode.textContent = MODE_TAGS[G.mode];
  }

  function startMode(mode: ModeId): void {
    // World Classic continuity: if a bracket is mid-run and the player is
    // still alive, the next game picks up the pending fixture.
    // C2: an explicit flag set by advanceBracket when the player wins a round (the old check read the result text and never matched).
    const resumeClassic = mode === "classic" && shouldResumeClassic(G.classic);
    G.mode = mode;
    G.pendingMode = mode;
    if (mode === "classic" && !resumeClassic) startClassicBracket();
    resetMatch(mode);
    setModeTag();
    if (mode === "classic") {
      const b = G.classic;
      const fixture = b ? currentFixture(b) : null;
      const oppIdx = fixture ? fixture.opponent : 1;
      const opp = WORLD_TEAMS[oppIdx]!;
      G.classicOpp = oppIdx;
      // The CPU still needs a club for its pitch repertoire and colours; the HUD names the national squad (clubAbbr).
      const others = CLUBS.filter((c) => c.id !== G.playerClub);
      G.cpuClub = others[Math.floor(G.rng() * others.length)]!.id;
      showMsg("WORLD CLASSIC", `${CLASSIC_ROUND_NAMES[b?.round ?? 0]} — AUR vs ${opp.abbr}`, 2.6);
      tick(`world classic — ${(CLASSIC_ROUND_NAMES[b?.round ?? 0] ?? "").toLowerCase()} vs ${opp.name}`, "info");
      renderBracket();
    } else if (mode === "derby") {
      showMsg("DERBY LAB", `${park().name} — 10 OUTS`, 2.4);
      tick("derby lab — chase the fence", "info");
    } else if (mode === "bullpen") {
      showMsg("BULLPEN LAB", "READ 12 PITCHES — CALL 1-4", 2.6);
      tick("bullpen lab — pitch recognition", "info");
    } else if (mode === "studio") {
      showMsg("PLAYER STUDIO", "FREE SWINGS — SHOW THE LOOK", 2.4);
      tick(`studio session — flair: ${G.studio.flair}`, "info");
    } else {
      const others = CLUBS.filter((c) => c.id !== G.playerClub);
      G.cpuClub = others[Math.floor(G.rng() * others.length)]!.id;
      showMsg("PLAY BALL", `${clubById(G.playerClub).abbr} vs ${clubById(G.cpuClub).abbr} — ${park().name}`, 2.4);
      tick(`quick play — ${clubById(G.playerClub).name} vs ${clubById(G.cpuClub).name}`, "info");
    }
    applyUniforms();
    el.menu?.classList.add("hidden");
    el.hud?.classList.add("on");
    el.goCard?.classList.remove("show");
    setPhase("between");
    cue("uiConfirm");
    cue("crowd");
    if (mode === "studio") fireFlair();
  }

  function openMenu(): void {
    el.menu?.classList.remove("hidden");
    el.hud?.classList.remove("on");
    renderBracket();
  }

  function closeMenu(): void {
    el.menu?.classList.add("hidden");
    if (!G.over) el.hud?.classList.add("on");
  }

  function endGame(playerWon: boolean | null, reason: string): void {
    G.over = true;
    G.result = reason;
    setPhase("gameover");
    const isDerby = G.mode === "derby";
    const isBullpen = G.mode === "bullpen";
    if (el.goTitle) {
      el.goTitle.textContent = isDerby ? "DERBY COMPLETE" : isBullpen ? "BULLPEN COMPLETE" : G.mode === "studio" ? "SESSION WRAP" : G.mode === "classic" && playerWon === null ? "BRACKET UPDATE" : playerWon === null ? "FINAL" : playerWon ? "YOU WIN" : "FINAL — DEFEAT";
    }
    if (el.goLine) {
      if (isDerby) {
        el.goLine.textContent = `${G.derby.hrs} HR · LONGEST ${G.derby.longest} FT · ${G.derby.totalFt} FT TOTAL — ${park().name}`;
      } else if (isBullpen) {
        el.goLine.textContent = `${G.bullpen.correct}/12 READS · BEST STREAK ${G.bullpen.bestStreak} — ${park().name}`;
      } else if (G.mode === "studio") {
        el.goLine.textContent = `${G.studio.swings} swings logged — look: ${G.studio.color} / ${G.studio.bat} / ${G.studio.flair}`;
      } else if (G.mode === "classic") {
        const b = G.classic;
        el.goLine.textContent =
          b?.champion === b?.player ? `CHAMPIONS — ${reason}. The Classic is yours.` : b?.champion !== null && b?.champion !== undefined ? `${reason} — ${WORLD_TEAMS[b.champion]?.name ?? "the field"} takes the crown` : `${reason}`;
      } else {
        el.goLine.textContent = `${clubById(G.playerClub).name} ${G.score.player} — ${G.score.cpu} ${clubById(G.cpuClub).name} · ${reason}`;
      }
    }
    renderBoxScore();
    renderBests();
    el.goCard?.classList.add("show");
    renderBracket();
    openMenu();
    if (playerWon === true) {
      cue("win");
      juiceFire("win", {});
      fireConfetti();
    } else if (playerWon === false) {
      cue("lose");
      juiceFire("lose", {});
    }
    tick(reason, playerWon === true ? "success" : playerWon === false ? "warning" : "info");
  }

  /** Results card box score: runs per inning, R and H, and the longest drive (C22). */
  function renderBoxScore(): void {
    const box = el.goBox;
    if (!box) return;
    if (G.mode !== "quick" && G.mode !== "classic") {
      box.innerHTML = "";
      return;
    }
    const cols = Math.max(G.inningsTotal, G.inning);
    const head = `<tr><th></th>${Array.from({ length: cols }, (_, i) => `<th>${i + 1}</th>`).join("")}<th>R</th><th>H</th></tr>`;
    const row = (k: "player" | "cpu") => `<tr><td class="tname">${clubAbbr(k)}</td>${Array.from({ length: cols }, (_, i) => `<td>${G.linescore[k][i] ?? "–"}</td>`).join("")}<td>${G.score[k]}</td><td>${G.hits[k]}</td></tr>`;
    box.innerHTML = `${head}${row("player")}${row("cpu")}<tr><td class="tname" colspan="${cols + 3}">LONGEST DRIVE ${G.longestFt > 0 ? `${G.longestFt} FT` : "—"}</td></tr>`;
  }

  /** Derby, Bullpen and World Classic bests kept in localStorage (C22). */
  const BESTS_KEY = "aura-diamond-3d.bests";
  function readBests(): { derbyHr: number; derbyLongest: number; bullpen: number; classicRound: number } {
    try {
      return { derbyHr: 0, derbyLongest: 0, bullpen: 0, classicRound: 0, ...JSON.parse(localStorage.getItem(BESTS_KEY) ?? "{}") };
    } catch {
      return { derbyHr: 0, derbyLongest: 0, bullpen: 0, classicRound: 0 };
    }
  }
  function renderBests(): void {
    const best = readBests();
    if (G.mode === "derby") {
      best.derbyHr = Math.max(best.derbyHr, G.derby.hrs);
      best.derbyLongest = Math.max(best.derbyLongest, G.derby.longest);
    } else if (G.mode === "bullpen") {
      best.bullpen = Math.max(best.bullpen, G.bullpen.correct);
    } else if (G.mode === "classic" && G.classic) {
      const reached = G.classic.champion === G.classic.player ? CLASSIC_ROUND_NAMES.length : G.classic.round;
      best.classicRound = Math.max(best.classicRound, reached);
    }
    try {
      localStorage.setItem(BESTS_KEY, JSON.stringify(best));
    } catch {
      /* storage unavailable (private mode): bests are session-only */
    }
    if (!el.goBests) return;
    el.goBests.textContent =
      G.mode === "derby" ? `BEST: ${best.derbyHr} HR · LONGEST ${best.derbyLongest} FT`
      : G.mode === "bullpen" ? `BEST: ${best.bullpen}/12 READS`
      : G.mode === "classic" ? `BEST RUN: ${best.classicRound >= CLASSIC_ROUND_NAMES.length ? "CHAMPIONS" : CLASSIC_ROUND_NAMES[best.classicRound] ?? "ROUND OF 32"}`
      : "";
  }

  /* ---------- Park switching ---------- */
  function setPark(id: ParkId): void {
    if (!PARKS[id] || G.park === id) return;
    G.park = id;
    try {
      app.setScene(buildParkScene(PARKS[id]));
      bindHandles();
      G.lastBatColor = "";
      G.lastFieldColor = "";
      applyUniforms();
      // Scene rebuilds recreate the actors — re-socket the bat to the new rig (retried until the new rig has loaded).
      batSocket.retries = 0;
      attachBatSocket();
      tick(`ballpark — ${PARKS[id].name.toLowerCase()}`, "info");
      showBanner(PARKS[id].name, 1.8);
    } catch (err) {
      console.warn("[diamond] park rebuild failed", err);
    }
    document.querySelectorAll<HTMLButtonElement>("[data-park]").forEach((b) => b.classList.toggle("active", b.dataset.park === id));
    document.querySelectorAll<HTMLButtonElement>("#menu-parks .pill").forEach((b) => b.classList.toggle("active", (b as HTMLElement).dataset.parkId === id));
  }

  /* ---------- Uniforms / studio ---------- */
  const uniformCache = new Map<string, unknown>();
  function uniformMaterial(color: string): any {
    let m = uniformCache.get(color);
    if (!m) {
      m = material.pbr({ color, roughness: 0.5 });
      uniformCache.set(color, m);
    }
    return m;
  }

  function applyUniforms(): void {
    const batterColor = G.mode === "studio" ? G.studio.color : battingClub().color;
    const fieldColor = fieldingClub().color;
    for (const id of ["pitcher", ...FIELDER_IDS]) {
      H[`${id}-cap`]?.setMaterial(uniformMaterial(fieldColor));
      H[`${id}-belt`]?.setMaterial(uniformMaterial(fieldColor));
    }
    for (const id of ["batter", "runner-0", "runner-1", "runner-2"]) {
      H[`${id}-cap`]?.setMaterial(uniformMaterial(batterColor));
      H[`${id}-belt`]?.setMaterial(uniformMaterial(batterColor));
    }
    G.lastBatColor = batterColor;
    G.lastFieldColor = fieldColor;
    const batSpec = STUDIO_BATS.find((b) => b.id === G.studio.bat) ?? STUDIO_BATS[0]!;
    H.bat?.setMaterial(batSpec.emissive > 0 ? material.emissive({ color: batSpec.color, emissive: batSpec.color, emissiveIntensity: batSpec.emissive }) : material.pbr({ color: batSpec.color, roughness: 0.55 }));
  }

  /** Keep uniforms honest when the half flips (batter takes fielding colors). */
  function refreshUniformsByHalf(): void {
    const batterColor = G.mode === "studio" ? G.studio.color : battingClub().color;
    const fieldColor = fieldingClub().color;
    if (batterColor !== G.lastBatColor || fieldColor !== G.lastFieldColor) applyUniforms();
  }

  function fireFlair(): void {
    if (G.studio.flair === "none") return;
    H.flairBurst?.setVisible(true);
    flairOnUntil = performance.now() / 1000 + 2.2;
    juiceFire("flair", { position: [-0.8, 1.4, 0.4] });
    if (G.studio.flair === "bass") cue("quad");
  }

  function fireConfetti(): void {
    confettiUntil = performance.now() / 1000 + 5;
    H.confetti?.setVisible(true);
  }
  function fireHrBurst(): void {
    hrBurstUntil = performance.now() / 1000 + 2.4;
    H.hrBurst?.setVisible(true);
  }

  /* ---------- Pitch construction ---------- */
  function makePitch(type: PitchId, aimX: number, aimY: number, opts: { meatball?: boolean; releaseQ?: number } = {}): LivePitch {
    const spec = PITCHES[type];
    const rng = G.rng;
    const diffMul = opts.meatball ? 0.72 : DIFFS[G.diff].cpuVeloMul;
    const mph = (spec.mph[0] + rng() * (spec.mph[1] - spec.mph[0])) * diffMul;
    const dist = Math.abs(RELEASE_PT[2]);
    const flightSec = dist / mphToMs(mph);
    return {
      type,
      spec,
      t: 0,
      flightSec,
      mph,
      start: [...RELEASE_PT],
      target: [aimX * ZONE_HW, ZONE_CY + aimY * ZONE_HH, 0],
      breakX: opts.meatball ? spec.breakX * 0.3 : spec.breakX * (0.85 + rng() * 0.3) * (battingIsPlayer() ? 1 : -1),
      breakY: opts.meatball ? spec.breakY * 0.3 : spec.breakY * (0.85 + rng() * 0.3),
      releaseQ: opts.releaseQ ?? 1,
      resolved: false,
      swung: false
    };
  }

  /* ---------- CPU pitch selection ---------- */
  function cpuChoosePitch(): void {
    const rep = fieldingClub().rep;
    const rng = G.rng;
    const ahead = G.strikes >= 2 || G.strikes > G.balls;
    let aimX = 0;
    let aimY = 0;
    const meatball = G.mode === "derby" || G.mode === "studio";
    if (meatball) {
      aimX = jitter(rng) * 0.3;
      aimY = jitter(rng) * 0.35;
    } else if (ahead) {
      const corner = Math.floor(rng() * 4);
      aimX = (corner % 2 === 0 ? -1 : 1) * (0.85 + rng() * 0.45);
      aimY = corner < 2 ? -0.95 - rng() * 0.4 : 0.95 + rng() * 0.35;
    } else {
      aimX = jitter(rng) * 0.75;
      aimY = jitter(rng) * 0.6;
      if (G.diff === "rookie" && rng() < 0.3) {
        aimX *= 0.4;
        aimY *= 0.4;
      }
    }
    const weights = rep.map((_, i) => Math.pow(0.62, i));
    let pick = rep[0]!;
    let roll = rng() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < rep.length; i++) {
      roll -= weights[i]!;
      if (roll <= 0) {
        pick = rep[i]!;
        break;
      }
    }
    if (meatball) pick = "fourseam";
    if (G.mode === "bullpen") {
      pick = G.bullpen.queue[G.bullpen.round % Math.max(1, G.bullpen.queue.length)] ?? "fourseam";
      aimX = jitter(rng) * 0.6;
      aimY = jitter(rng) * 0.55;
    }
    G.pitch = makePitch(pick, aimX, aimY, { meatball });
    G.pitchNo += 1;
    setPhase("windup");
  }

  /* ---------- Contact + batted-ball resolution ---------- */
  function resolveSwing(p: LivePitch, timingErr: number, pciX: number, pciY: number, power: number, isPlayer: boolean): void {
    p.swung = true;
    p.resolved = true;
    const cross = pitchPosAt(p, 1);
    const [bx, by] = zoneCoords(cross);
    const pciScale = isPlayer ? DIFFS[G.diff].pciScale : 1;
    const radius = (power > 0.5 ? 0.85 : 1.0) * pciScale;
    const dist = Math.hypot(pciX - bx, pciY - by);
    const graded = gradeSwing(timingErr, dist, radius);
    const q = graded.q;

    lastCross = [bx, by];
    lastCrossUntil = performance.now() / 1000 + 1.6;
    showTiming(isPlayer ? timingErr : null);
    if (graded.grade === "WHIFF") {
      G.lastGrade = "WHIFF";
      G.lastTimingErr = timingErr;
      showContact("WHIFF", `${p.mph.toFixed(0)} MPH ${p.spec.name}`, 1.0);
      tick("swing and a miss", "warning");
      cue("swing");
      registerStrike();
      return;
    }

    const grade: string = graded.grade;
    G.lastGrade = grade;

    const qualityBonus = grade === "PERFECT" ? 1 : grade === "GOOD" ? 0.78 : 0.55;
    const club = battingClub();
    const evMph = clamp(58 + q * 34 + qualityBonus * 12 + power * 11 + (isPlayer ? club.power * 8 : DIFFS[G.diff].cpuPower * 10) + jitter(G.rng) * 6, 48, 118);
    const vDiff = pciY - by; // pci above ball → top contact → grounder
    let la = clamp(26 + vDiff * -30 + (grade === "PERFECT" ? 6 : 0) + power * 5 + jitter(G.rng) * 7, -4, 54);
    let spray = clamp(timingErr * 340 + jitter(G.rng) * 9, -58, 58);
    if (grade === "EARLY") spray -= 8;
    if (grade === "LATE") spray += 8;
    // The bat decides part of where the ball goes: reflect the pitch about the swinging bat's face at the sweet spot.
    const batAxis = unit3([swingEvidence.batTipWorld[0] - swingEvidence.sweetWorld[0], swingEvidence.batTipWorld[1] - swingEvidence.sweetWorld[1], swingEvidence.batTipWorld[2] - swingEvidence.sweetWorld[2]]);
    const batHit = batContact({ axis: batAxis, sweetVelocity: swingEvidence.sweetVel, ballVelocity: [0, 0, mphToMs(p.mph)] });
    if (batHit) {
      const sprayBat = clamp(batHit.sprayDeg, -58, 58);
      const laBat = clamp(batHit.launchDeg, -4, 54);
      const blendedSpray = boundedBlend(spray, sprayBat, BAT_PHYSICS_WEIGHT, BAT_SPRAY_MAX_DELTA_DEG);
      const blendedLa = boundedBlend(la, laBat, BAT_PHYSICS_WEIGHT, BAT_LAUNCH_MAX_DELTA_DEG);
      swingEvidence.lastContact = {
        normal: batHit.normal.map((v) => Number(v.toFixed(3))) as Vec3,
        sprayDeg: Number(sprayBat.toFixed(1)),
        launchDeg: Number(laBat.toFixed(1)),
        normalBatSpeed: Number(batHit.normalBatSpeed.toFixed(1)),
        blendedSprayDeg: Number(blendedSpray.toFixed(1)),
        blendedLaunchDeg: Number(blendedLa.toFixed(1))
      };
      spray = blendedSpray;
      la = blendedLa;
    } else {
      swingEvidence.lastContact = null;
    }
    const foul = Math.abs(spray) > FOUL_DEG;
    const contactPos: Vec3 = [clamp(pciX, -1.4, 1.4) * 0.28 + cross[0] * 0.4, clamp(cross[1] - timingErr * 1.4, 0.45, 1.9), 0.35 - timingErr * 1.2];

    const ev = mphToMs(evMph);
    const laRad = (la * Math.PI) / 180;
    const sprayRad = (spray * Math.PI) / 180;
    const vel: Vec3 = [ev * Math.cos(laRad) * Math.sin(sprayRad), ev * Math.sin(laRad), -ev * Math.cos(laRad) * Math.cos(sprayRad)];

    const ball = simBattedLanding(contactPos, vel);
    ball.evMph = evMph;
    ball.launchDeg = la;
    ball.sprayDeg = spray;
    ball.fromCpu = !isPlayer;
    G.lastEV = evMph;
    G.lastLA = la;
    G.lastDistFt = Math.round(mToFt(ball.landDist));
    G.lastTimingErr = timingErr;

    // Assist-catch eligibility: only on the player's fielding turn.
    if (!isPlayerHitBallEligible(ball)) {
      ball.catchable = false;
    }
    if (!isPlayer && ball.catchable) {
      let best = 0;
      let bestD = Infinity;
      FIELDER_IDS.forEach((id, i) => {
        const s = FIELDER_SPOTS[id]!;
        const d = Math.hypot(s[0] - ball.landPos[0], s[2] - ball.landPos[2]);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      ball.catchFielder = best;
    }

    showContact(grade, `${evMph.toFixed(1)} MPH · ${la.toFixed(0)}° · ${Math.round(mToFt(ball.landDist))} FT`, foul ? 1.0 : 1.6);
    cue(isPlayer ? "crack" : "contact");
    juiceFire("crack", { position: contactPos });

    G.batted = ball;
    G.batterRunning = true; // sprint to first during the flight
    if (foul) {
      ball.outcome = "foul";
      ball.resolveAt = Math.min(ball.hangT, 1.4);
    } else {
      ball.plannedOutcome = rollOutcome(ball);
      if (ball.plannedOutcome === "flyout") ball.catchFielder = nearestFielder(ball.landPos);
    }
    setPhase("batted");
    tick(`${isPlayer ? "you" : club.abbr} put it in play — ${evMph.toFixed(0)} mph`, "info");
  }

  /** Index into FIELDER_IDS of the fielder (not the catcher) closest to a landing spot. */
  function nearestFielder(at: Vec3): number {
    let best = 6;
    let bestD = Infinity;
    FIELDER_IDS.forEach((id, i) => {
      if (id === "f-c") return;
      const sp = FIELDER_SPOTS[id]!;
      const d = Math.hypot(sp[0] - at[0], sp[2] - at[2]);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    return best;
  }

  /** Catch-assist eligibility: CPU hit, fair, catchable hang time, in play. */
  function isPlayerHitBallEligible(ball: BattedBall): boolean {
    if (!ball.fromCpu) return false;
    if (Math.abs(ball.landTheta) > FOUL_DEG || ball.predicted.hrCrossed || ball.predicted.wallHit) {
      ball.catchable = false;
      return true;
    }
    const fair = Math.abs(ball.landTheta) <= FOUL_DEG;
    const inPlay = fair && ball.landDist < fenceRadius(park(), ball.landTheta) - 2;
    ball.catchable = inPlay && ball.hangT > 1.3 && ball.landDist > 20;
    return true;
  }

  /**
   * Predict a batted ball's landing with the fixed-step integrator, and return the live ball. The live flight starts with its
   * fence flags false (C4): it replays the same 1/120 s steps in stepBatted and sets crossedFence / hrCrossed / wallHit itself
   * when it reaches the wall, so a ball predicted to hit the wall bounces off it on screen instead of passing through.
   */
  function simBattedLanding(pos0: Vec3, vel0: Vec3): BattedBall {
    const pr = predictLanding(pos0, vel0, park());
    return {
      pos: [...pos0],
      vel: [...vel0],
      evMph: 0,
      launchDeg: 0,
      sprayDeg: 0,
      hangT: pr.hangT,
      landPos: pr.landPos,
      landDist: pr.landDist,
      landTheta: pr.landTheta,
      maxY: pr.maxY,
      crossedFence: false,
      hrCrossed: false,
      wallHit: false,
      predicted: { crossedFence: pr.crossedFence, hrCrossed: pr.hrCrossed, wallHit: pr.wallHit },
      plannedOutcome: null,
      outcome: null,
      dead: false,
      age: 0,
      resolveAt: pr.hangT,
      fromCpu: false,
      catchable: false,
      catchFielder: -1,
      catchProb: 0,
      windowHit: false
    };
  }

  /** Roll the outcome from the landing prediction (called at contact, so a fielder can be sent to a catch in time). */
  function rollOutcome(ball: BattedBall): string {
    const p = park();
    const theta = ball.landTheta;
    if (Math.abs(theta) > FOUL_DEG) return "foul";
    if (ball.predicted.hrCrossed || (ball.landDist >= fenceRadius(p, theta) - 1 && ball.maxY > p.wallH && ball.hangT > 2.0)) return "homerun";
    if (ball.predicted.wallHit || ball.landDist >= fenceRadius(p, theta) - 3) return "double";
    if (ball.landDist < 26 || ball.launchDeg < 10) return G.rng() < 0.66 ? "groundout" : "single";
    const pCatch = clamp(0.16 + (ball.hangT - 1.1) * 0.3 - Math.max(0, ball.evMph - 82) * 0.009, 0.04, 0.93);
    ball.catchProb = pCatch;
    if (G.rng() < pCatch) return "flyout";
    return ball.landDist > 0.72 * fenceRadius(p, theta) ? (G.rng() < 0.14 ? "triple" : "double") : "single";
  }

  function classifyBatted(ball: BattedBall): void {
    if (ball.outcome) return;
    ball.outcome = ball.plannedOutcome ?? rollOutcome(ball);
  }

  /* ---------- Count / outs / inning ---------- */
  function nextBatter(next: Phase = "between"): void {
    resetCount();
    G.pitch = null;
    G.batted = null;
    G.catchPrompt = null;
    G.charging = false;
    G.batterRunning = false;
    G.pendingOutSlot = -1;
    if (!G.over) setPhase(next);
  }

  /** Same batter stays up — count preserved (foul balls, mid-count pitches). */
  function continueAtBat(): void {
    G.pitch = null;
    G.batted = null;
    G.catchPrompt = null;
    G.charging = false;
    if (!G.over) setPhase("between");
  }

  function registerStrike(): void {
    // Lab modes don't track a traditional count
    if (G.mode === "derby") {
      G.derby.outs += 1;
      showBanner(`OUT ${G.derby.outs}/10`, 1.4);
      tick(`derby out ${G.derby.outs} — swing and a miss`, "warning");
      cue("strikeout");
      if (G.derby.outs >= 10) {
        endGame(null, `derby: ${G.derby.hrs} HR, longest ${G.derby.longest} ft`);
        return;
      }
      nextBatter();
      return;
    }
    if (G.mode === "studio") {
      nextBatter();
      return;
    }
    G.strikes += 1;
    if (G.strikes >= 3) {
      recordOut(battingIsPlayer() ? "STRUCK OUT" : "STRIKEOUT — YOU GOT HIM");
      cue("strikeout");
      juiceFire("strikeout", {});
      showBanner("STRIKEOUT", 1.5);
      nextBatter();
      return;
    }
    // Ball rides through to the mitt — the pitch stays alive visually.
    showBanner("STRIKE", 0.9);
  }

  function registerBall(): void {
    if (G.mode === "derby" || G.mode === "studio") {
      // pitch rides to the mitt; cleanup happens in stepPitch
      return;
    }
    G.balls += 1;
    if (G.balls >= 4) {
      tick("ball four — take your base", "info");
      cue("walk");
      showBanner("WALK", 1.4);
      applyRunnerPlan(planRunnerMoves("walk"));
      nextBatter("runners");
      maybeWalkoff();
      return;
    }
    showBanner("BALL", 0.9);
  }

  function recordOut(label: string): void {
    G.outs += 1;
    tick(`${label.toLowerCase()} — out ${G.outs}`, "warning");
    if (G.outs >= 3) endHalf();
  }

  function endHalf(): void {
    const key = battingTeamKey();
    G.linescore[key][G.inning - 1] = G.linescore[key][G.inning - 1] ?? 0;
    // rules.ts halfEndDecision: the player is the visiting side (bats in the top), the CPU is home (C7).
    const decision = halfEndDecision(G.half, G.inning, G.inningsTotal, scoreline());
    if (decision === "mercy") {
      concludeMatch(G.score.player > G.score.cpu, `mercy rule — ${Math.max(G.score.player, G.score.cpu)}-${Math.min(G.score.player, G.score.cpu)} after ${G.half === "top" ? "the top of " : ""}${G.inning}`);
      return;
    }
    if (decision === "final") {
      finishRegulation();
      return;
    }
    if (decision === "next-inning") {
      // extras: keep playing until someone leads after a full inning
      G.inning += 1;
      G.half = "top";
    } else {
      G.half = "bottom";
    }
    G.outs = 0;
    G.bases = [false, false, false];
    G.runnerBase = [-1, -1, -1];
    resetCount();
    refreshUniformsByHalf();
    showBanner(`${G.half === "top" ? "TOP" : "BOTTOM"} ${G.inning} — ${clubAbbr("player")} ${G.score.player} · ${clubAbbr("cpu")} ${G.score.cpu}`, 2.0);
    setPhase("between");
  }

  const scoreline = () => ({ away: G.score.player, home: G.score.cpu });

  /**
   * After any run scores: a home lead in the bottom of the last (or an extra) inning ends the game as a walk-off, and a home lead
   * of the mercy margin in a bottom half ends it at once (C7). Returns true when the game ended.
   */
  function maybeWalkoff(): boolean {
    if (G.over || (G.mode !== "quick" && G.mode !== "classic")) return false;
    const s = scoreline();
    if (isWalkoff(G.half, G.inning, G.inningsTotal, s)) {
      juiceFire("walkoff", {});
      showBanner("WALK-OFF", 2.4);
      concludeMatch(false, `walk-off — ${clubAbbr("cpu")} ${G.score.cpu}-${G.score.player} in the ${G.inning > G.inningsTotal ? "extra " : ""}${G.inning}`);
      return true;
    }
    if (isMidInningMercy(G.half, s)) {
      concludeMatch(false, `mercy rule — ${G.score.cpu}-${G.score.player} in the bottom of ${G.inning}`);
      return true;
    }
    return false;
  }

  function finishRegulation(): void {
    concludeMatch(G.score.player > G.score.cpu, `final after ${G.inning}`);
  }

  /** Route game end through the World Classic bracket when applicable. */
  function concludeMatch(playerWon: boolean, reason: string): void {
    const b = G.classic;
    if (G.mode === "classic" && b) {
      // Capture the opponent *before* advancing — the next round has no me-game.
      const meGame = b.rounds[b.round]?.find((g) => g.me);
      const oppIdx = meGame ? (meGame.a === b.player ? meGame.b : meGame.a) : -1;
      advanceClassicRound(playerWon, G.score.player, G.score.cpu);
      if (b.champion !== null) {
        endGame(b.champion === b.player, b.champion === b.player ? "world classic champions" : `${WORLD_TEAMS[b.champion]?.name ?? "field"} takes the crown`);
        return;
      }
      if (!playerWon) {
        endGame(false, `${(oppIdx >= 0 ? WORLD_TEAMS[oppIdx]?.abbr : null) ?? "opponent"} bounced you ${G.score.cpu}-${G.score.player}`);
        return;
      }
      endGame(null, `${reason} — advanced, ${CLASSIC_ROUND_NAMES[b.round] ?? "next round"} awaits`);
      G.over = false; // bracket stays open; menu offers the next round
      return;
    }
    endGame(playerWon, reason);
  }

  /* ---------- Bases / scoring ---------- */
  function addRun(n = 1): void {
    const key = battingTeamKey();
    G.score[key] += n;
    G.linescore[key][G.inning - 1] = (G.linescore[key][G.inning - 1] ?? 0) + n;
  }

  /** Where the batter-runner is now: he has been sprinting toward first during the flight (C8), so his run starts there. */
  function batterRunnerFrom(): Vec3 {
    const st = athleteState["batter"];
    if (G.batterRunning && st) return [st.pos[0], HOME_PLATE[1], st.pos[2]];
    return HOME_PLATE;
  }

  /** Compute runner moves (batter → bases) for an outcome; returns anim list. */
  function planRunnerMoves(outcome: string): { node: number; from: Vec3; to: Vec3; t: number }[] {
    const b = G.bases;
    const prev = [...b];
    const moves: { node: number; from: Vec3; to: Vec3; t: number }[] = [];
    const bw = (baseIdx: number): Vec3 => [...BASES[baseIdx]!] as Vec3;
    const slotFor = (baseIdx: number): number => G.runnerBase.indexOf(baseIdx);
    const pushMove = (fromIdx: number, toIdx: number) => {
      if (fromIdx >= 0 && prev[fromIdx]) moves.push({ node: slotFor(fromIdx), from: bw(fromIdx), to: toIdx === 3 ? HOME_PLATE : bw(toIdx), t: 0 });
      else if (fromIdx === -1) moves.push({ node: -1, from: toIdx === 3 ? HOME_PLATE : batterRunnerFrom(), to: toIdx === 3 ? HOME_PLATE : bw(toIdx), t: 0 });
    };

    switch (outcome) {
      case "single": {
        const [r1, r2, r3] = [b[0], b[1], b[2]];
        if (r3) addRun();
        const r2Scores = r2 && G.rng() < 0.55;
        if (r2Scores) addRun();
        b[0] = true; // batter takes 1B
        b[1] = r1; // runner on 1B takes 2B
        b[2] = r2 && !r2Scores; // runner on 2B scores or holds at 3B
        if (r3) pushMove(2, 3);
        if (r2) pushMove(1, r2Scores ? 3 : 2);
        if (r1) pushMove(0, 1);
        pushMove(-1, 0);
        break;
      }
      case "double": {
        const [r1, r2, r3] = [b[0], b[1], b[2]];
        if (r3) addRun();
        if (r2) addRun();
        const r1Scores = r1 && G.rng() < 0.5;
        if (r1Scores) addRun();
        b[0] = false;
        b[1] = true; // batter takes 2B
        b[2] = r1 && !r1Scores; // runner on 1B scores or holds at 3B
        if (r3) pushMove(2, 3);
        if (r2) pushMove(1, 3);
        if (r1) pushMove(0, r1Scores ? 3 : 2);
        pushMove(-1, 1);
        break;
      }
      case "triple": {
        addRun((b[0] ? 1 : 0) + (b[1] ? 1 : 0) + (b[2] ? 1 : 0));
        for (let i = 0; i < 3; i++) if (prev[i]) pushMove(i, 3);
        b[0] = false;
        b[1] = false;
        b[2] = true;
        pushMove(-1, 2);
        break;
      }
      case "homerun": {
        addRun((b[0] ? 1 : 0) + (b[1] ? 1 : 0) + (b[2] ? 1 : 0) + 1);
        for (let i = 0; i < 3; i++) if (prev[i]) pushMove(i, 3);
        pushMove(-1, 3);
        b[0] = false;
        b[1] = false;
        b[2] = false;
        break;
      }
      case "walk": {
        const [r1, r2, r3] = [b[0], b[1], b[2]];
        const loaded = r1 && r2 && r3;
        if (loaded) addRun();
        if (loaded) pushMove(2, 3);
        if (r1 && r2) pushMove(1, 2);
        if (r1) pushMove(0, 1);
        b[0] = true;
        b[1] = r2 || r1;
        b[2] = (r1 && r2) || r3;
        pushMove(-1, 0);
        break;
      }
      case "flyout": {
        // Tag-up sac fly: the runner on 3rd scores on a deep fly only when the catch is not the third out (C6).
        if (sacFlyScores(b[2], G.batted?.landDist ?? 0, G.outs)) {
          addRun();
          b[2] = false;
          pushMove(2, 3);
          showBanner("SACRIFICE FLY", 1.6);
        }
        break;
      }
      default:
        break;
    }
    return moves;
  }

  function applyRunnerPlan(moves: { node: number; from: Vec3; to: Vec3; t: number }[]): void {
    // Runner slots are persistent identities — track slot→base through each move.
    const slotBase = [...G.runnerBase];
    G.runnersAnim = [];
    for (const m of moves) {
      const toIdx = m.to === HOME_PLATE ? 3 : BASES.findIndex((b) => b[0] === m.to[0] && b[2] === m.to[2]);
      let slot = m.node;
      if (slot < 0) {
        // The batter claims the first free runner slot for his trip around.
        slot = slotBase.findIndex((b) => b < 0);
        if (slot < 0) continue;
      }
      if (m.from[0] !== m.to[0] || m.from[2] !== m.to[2]) {
        G.runnersAnim.push({ node: slot, from: m.from, to: m.to, t: 0 });
      }
      slotBase[slot] = toIdx >= 3 || toIdx < 0 ? -1 : toIdx;
    }
    G.runnerBase = slotBase;
    G.pushUsed = false;
  }

  /* ---------- Pitch outcome resolution ---------- */
  function resolvePitchAtPlate(p: LivePitch): void {
    if (p.resolved) return;
    p.resolved = true;
    const cross = pitchPosAt(p, 1);
    if (G.mode === "bullpen") {
      const g = G.bullpen;
      const guess = g.guess;
      const correct = guess === p.type;
      g.round += 1;
      if (guess) {
        if (correct) {
          g.correct += 1;
          g.streak += 1;
          g.bestStreak = Math.max(g.bestStreak, g.streak);
        } else {
          g.streak = 0;
        }
      }
      // C19: the result is in the text, not only in the chip colour.
      showPitchChip(`IT WAS ${p.spec.name} · ${p.mph.toFixed(0)} MPH${guess ? (correct ? " — CORRECT" : " — MISS") : " — NO CALL"}`, guess ? (correct ? "guess-correct" : "guess-wrong") : "", 1.8);
      announce(`It was ${p.spec.name}. ${guess ? (correct ? "Correct." : "Miss.") : "No call."}`);
      tick(correct ? `read: ${p.spec.name.toLowerCase()} — correct` : `it was ${p.spec.name.toLowerCase()}`, correct ? "success" : "warning");
      cue(correct ? "uiConfirm" : "foul");
      if (g.round >= 12) {
        endGame(null, `bullpen complete — ${g.correct}/12`);
        return;
      }
      g.guess = null;
      G.pitch = null;
      setPhase("between");
      return;
    }
    lastCross = zoneCoords(cross);
    lastCrossUntil = performance.now() / 1000 + 1.6;
    if (inZone(cross)) {
      tick(`called strike — ${p.spec.name.toLowerCase()} ${p.mph.toFixed(0)}mph`, "warning");
      registerStrike();
    } else {
      tick(`ball — ${p.spec.name.toLowerCase()} ${p.mph.toFixed(0)}mph`, "info");
      registerBall();
    }
  }

  /* ---------- CPU batting ---------- */
  function cpuDecideSwing(p: LivePitch): void {
    if (p.resolved || p.swung || p.cpuDecided) return;
    // One decision per pitch: rolling every step made the CPU swing at nearly everything.
    p.cpuDecided = true;
    const diff = DIFFS[G.diff];
    const cross = pitchPosAt(p, 1);
    const [zx, zy] = zoneCoords(cross);
    const inZ = Math.abs(zx) <= 1 && Math.abs(zy) <= 1;
    const swingP = inZ ? 0.66 : diff.cpuChase;
    if (G.rng() < swingP) {
      // The swing animation leads the contact resolution: compress the
      // pre-contact phases so the barrel arrives with the ball.
      const remaining = (CONTACT_PLANE_T - p.t) * p.flightSec;
      const sigma = diff.cpuContactSigma;
      const timingErr = jitter(G.rng) * sigma * (inZ ? 1 : 1.8);
      const pciOff = 0.45 * (1.15 - diff.cpuPower);
      const started = startBatterSwing({
        pitch: p,
        power: 0.25,
        isPlayer: false,
        timingErr,
        pciX: zx + jitter(G.rng) * pciOff * 2,
        pciY: zy + jitter(G.rng) * pciOff * 2,
        durPre: clamp(remaining, 0.12, SWING_CONTACT_T * SWING_TOTAL),
        durPost: (1 - SWING_CONTACT_T) * SWING_TOTAL
      });
      if (started) p.swung = true;
    }
  }

  /**
   * Autopilot swing: start it so the swing's contact phase lands exactly when
   * the pitch reaches the plane. Fast flights need the load to begin during
   * the windup (delay > 0); slow flights start in flight.
   */
  function maybeStartAutoSwing(p: LivePitch, zx: number, zy: number, delay = 0): void {
    const timeToPlane = delay + (CONTACT_PLANE_T - p.t) * p.flightSec;
    if (timeToPlane > SWING_CONTACT_T * SWING_TOTAL + 1e-4) return; // too early — wait
    const started = startBatterSwing({
      pitch: p,
      power: 0.72,
      isPlayer: true,
      timingErr: jitter(G.rng) * 0.018,
      pciX: zx,
      pciY: zy,
      durPre: clamp(timeToPlane, 0.15, SWING_CONTACT_T * SWING_TOTAL),
      durPost: (1 - SWING_CONTACT_T) * SWING_TOTAL
    });
    if (started) p.swung = true;
  }

  /* ---------- Outcome application ---------- */
  function applyOutcome(ball: BattedBall): void {
    const isPlayerHit = battingIsPlayer();
    const o = ball.outcome ?? "single";
    const distFt = Math.round(mToFt(ball.landDist));
    G.lastDistFt = distFt;

    if (G.mode === "derby") {
      if (o === "homerun") {
        G.derby.hrs += 1;
        G.derby.longest = Math.max(G.derby.longest, distFt);
        G.derby.totalFt += distFt;
        showBanner(`HOME RUN — ${distFt} FT`, 2.2);
        cue(distFt > 420 ? "homerBig" : "homer");
        juiceFire("homer", { position: ball.landPos });
        fireHrBurst();
        tick(`derby HR #${G.derby.hrs} — ${distFt} ft`, "success", distFt);
      } else {
        G.derby.outs += 1;
        showBanner(`OUT ${G.derby.outs}/10`, 1.4);
        tick(`derby out ${G.derby.outs} — ${o}`, "warning");
        cue("foul");
      }
      if (G.derby.outs >= 10) {
        endGame(null, `derby: ${G.derby.hrs} HR, longest ${G.derby.longest} ft`);
        return;
      }
      nextBatter();
      return;
    }

    if (G.mode === "studio") {
      G.studio.swings += 1;
      if (o === "homerun") {
        showBanner(`${distFt} FT MOONSHOT`, 2.0);
        cue("homer");
        fireHrBurst();
      }
      nextBatter();
      return;
    }

    const landDist = ball.landDist;
    const landPos = ball.landPos;
    const crossed = ball.crossedFence;
    if (o === "single" || o === "double" || o === "triple" || o === "homerun") {
      G.hits[battingTeamKey()] += 1;
      G.longestFt = Math.max(G.longestFt, distFt);
    }
    switch (o) {
      case "homerun": {
        const runs = 1 + G.bases.filter(Boolean).length;
        showBanner(`HOME RUN — ${distFt} FT`, 2.6);
        cue(distFt > 420 || park().id === "lunar" ? "homerBig" : "homer");
        juiceFire("homer", { position: landPos });
        fireHrBurst();
        applyRunnerPlan(planRunnerMoves("homerun"));
        tick(`${isPlayerHit ? "you" : clubById(G.cpuClub).abbr} go deep — ${distFt} ft (${runs} RBI)`, "success", distFt);
        if (park().id === "skyline" && ball.landTheta > -30 && ball.landTheta < 30 && crossed) {
          G.windowFlash = performance.now() / 1000 + 2;
          showBanner("WINDOW SHOT — GLASS RAINING IN MIDTOWN", 2.4);
          tick("window shot! the skyline notices", "success");
        }
        nextBatter("runners");
        break;
      }
      case "triple":
        showBanner("TRIPLE", 2.0);
        applyRunnerPlan(planRunnerMoves("triple"));
        cue("pop");
        tick(`triple — ${distFt} ft into the alley`, "success");
        nextBatter("runners");
        break;
      case "double":
        showBanner("DOUBLE", 1.8);
        applyRunnerPlan(planRunnerMoves("double"));
        cue("pop");
        tick(`double — ${distFt} ft`, "success");
        nextBatter("runners");
        break;
      case "single":
        showBanner("SINGLE", 1.5);
        applyRunnerPlan(planRunnerMoves("single"));
        cue("pop");
        tick(`single — ${distFt} ft`, "success");
        nextBatter("runners");
        break;
      case "groundout":
        showBanner("GROUND OUT", 1.6);
        cue("pop");
        G.fielderThrowTimer = 0.65;
        G.activeThrowerId = "f-ss";
        recordOut(isPlayerHit ? "grounded out" : "ground ball — out at first");
        nextBatter("runners");
        break;
      case "flyout":
        showBanner("FLY OUT", 1.6);
        applyRunnerPlan(planRunnerMoves("flyout"));
        cue("pop");
        G.fielderThrowTimer = 0.65;
        G.activeThrowerId = FIELDER_IDS[ball.catchFielder >= 0 ? ball.catchFielder : 6] ?? "f-cf";
        recordOut(isPlayerHit ? "fly out" : "fly ball — tracked down");
        nextBatter(G.over ? "between" : "runners");
        break;
      case "foul":
        showBanner("FOUL", 1.1);
        cue("foul");
        juiceFire("foul", {});
        if (G.strikes < 2) G.strikes += 1;
        tick("fouled back", "warning");
        continueAtBat();
        break;
      default:
        nextBatter();
        break;
    }
    void landDist;
    maybeWalkoff();
  }

  /* ---------- Phase machine ---------- */
  let appReady = false;
  let evidenceDue = true;
  let framesRendered = 0;
  let simTime = 0;
  let lastManualInputAt = -10;
  const isAutopilotActive = (): boolean => G.autopilot;

  /*
   * Presses are latched once per rendered frame and consumed by the first fixed sim step that runs (C14), so a frame that runs
   * several 1/120 s steps cannot read one key press several times (for example confirm a pitch and release it in one frame).
   */
  const edges = { swing: false, digit: -1 };
  let touchPitchPress = -1;
  function captureEdges(): void {
    // Latched until a sim step consumes them: a frame that runs no step (hit-stop) keeps the press for the next frame.
    edges.swing ||=
      input.pressed("swing") ||
      justPressedKeys.has("Space") ||
      justPressedKeys.has("Enter") ||
      justPressedKeys.has("KeyE") ||
      justPressedKeys.has("KeyJ");
    const digit = input.pressed("pitch1") || justPressedKeys.has("Digit1") ? 0
      : input.pressed("pitch2") || justPressedKeys.has("Digit2") ? 1
      : input.pressed("pitch3") || justPressedKeys.has("Digit3") ? 2
      : input.pressed("pitch4") || justPressedKeys.has("Digit4") ? 3
      : -1;
    if (digit >= 0) edges.digit = digit;
    else if (touchPitchPress >= 0) edges.digit = touchPitchPress;
    touchPitchPress = -1;
  }
  function consumeEdges(): void {
    edges.swing = false;
    edges.digit = -1;
  }
  const isSwingPressed = (): boolean => edges.swing;
  const digitPressed = (): number => edges.digit;

  const getManualMoveAxis = (): [number, number] => {
    let ax = input.axis("pciMoveX", "pciL", "pciR");
    let ay = input.axis("pciMoveY", "pciD", "pciU");
    if (heldKeys.has("KeyA") || heldKeys.has("ArrowLeft")) ax = Math.min(ax, -1);
    if (heldKeys.has("KeyD") || heldKeys.has("ArrowRight")) ax = Math.max(ax, 1);
    if (heldKeys.has("KeyS") || heldKeys.has("ArrowDown")) ay = Math.min(ay, -1);
    if (heldKeys.has("KeyW") || heldKeys.has("ArrowUp")) ay = Math.max(ay, 1);
    return [ax, ay];
  };

  function setPhase(p: Phase): void {
    G.phase = p;
    G.phaseT = 0;
    if (p !== "runners") G.caughtBy = null;
  }

  /**
   * The player's swing (C1). The bat reaches the contact plane PLAYER_SWING_PRE seconds after the press; the timing error is
   * that arrival minus the ball's own arrival, measured at the moment of the press. The pitch is never moved, the break is
   * never scaled, and the PCI is the player's own. Contact is resolved when the swing reaches the plane (updateActors).
   */
  function triggerSwing(power = 0.84): void {
    lastManualInputAt = simTime;
    cue("swing");
    const p = G.pitch;
    if (p && !p.swung && !p.resolved && (G.phase === "windup" || G.phase === "pitch")) {
      const toPlane = timeToContactPlane(G.phase, G.phaseT, p.t, p.flightSec);
      const timingErr = swingTimingError(toPlane);
      const started = startBatterSwing({ pitch: p, power, isPlayer: true, timingErr, pciX: G.pci[0], pciY: G.pci[1], durPre: PLAYER_SWING_PRE, durPost: (1 - SWING_CONTACT_T) * SWING_TOTAL });
      if (started) p.swung = true;
    } else if (!p) {
      // Practice swing between pitches.
      startBatterSwing({ power, isPlayer: true, durPre: 0.42, durPost: 0.45 });
    }
  }

  /** Seconds of stance before the CPU pitcher delivers when the player does not ask for the pitch. */
  const MANUAL_PITCH_WAIT = 2.0;

  function stepBetween(dt: number): void {
    G.phaseT += dt;
    const [ax, ay] = getManualMoveAxis();
    const moveActive = Math.abs(ax) > 0.01 || Math.abs(ay) > 0.01;
    const swingHit = isSwingPressed();
    const digitHit = digitPressed() >= 0;

    if (playerPitchingTurn()) {
      // The player pitches: any input (or autopilot after a beat) opens pitch selection. Space never swings the CPU batter (C15).
      if (!isAutopilotActive() && !moveActive && !swingHit && !digitHit) return;
      if (isAutopilotActive() && !moveActive && !swingHit && !digitHit && G.phaseT < 0.85) return;
      setPhase("pitchSelect");
      G.selPitch = clubById(G.playerClub).rep[0] ?? "fourseam";
      G.aim = [0, 0];
      showBanner("YOUR PITCH — 1-4 SELECT · WASD AIM · SPACE", 2.4);
      return;
    }

    if (moveActive && battingIsPlayer()) {
      lastManualInputAt = simTime;
      G.batterAimX = clamp(G.batterAimX + ax * dt * 1.35, -0.36, 0.36);
      G.batterAimZ = clamp(G.batterAimZ - ay * dt * 1.15, -0.32, 0.32);
      G.batterStepTimer = 0.34;
    }

    if (isAutopilotActive()) {
      // ≥1.5 s of readable stance before the next pitch sequence begins
      const wait = G.mode === "bullpen" ? 1.5 : 1.4;
      if (G.phaseT < wait) return;
      cpuChoosePitch();
      return;
    }

    // Manual play: Space asks for the pitch now (it does not swing); otherwise the pitcher delivers after a short stance.
    // Movement and digit presses never start a pitch or queue a swing.
    if (swingHit) lastManualInputAt = simTime;
    if (swingHit || G.phaseT >= MANUAL_PITCH_WAIT) cpuChoosePitch();
  }

  function stepWindup(dt: number): void {
    G.phaseT += dt;
    const [ax, ay] = getManualMoveAxis();
    const moveActive = Math.abs(ax) > 0.01 || Math.abs(ay) > 0.01;
    if (moveActive && battingIsPlayer()) {
      lastManualInputAt = simTime;
      G.batterAimX = clamp(G.batterAimX + ax * dt * 1.35, -0.36, 0.36);
      G.batterAimZ = clamp(G.batterAimZ - ay * dt * 1.15, -0.32, 0.32);
      G.batterStepTimer = 0.32;
    }
    // A press before release is a real (and very early) swing: it is graded like any other.
    if (battingIsPlayer() && G.mode !== "bullpen" && isSwingPressed() && !isAutopilotActive()) triggerSwing(0.84);
    // Autopilot batting: fast flights need the load to start BEFORE release so
    // the swing's contact phase lands with the ball at the plate.
    if (isAutopilotActive() && battingIsPlayer() && G.mode !== "bullpen" && G.pitch && !swingDrive.active) {
      const preNeed = SWING_CONTACT_T * SWING_TOTAL;
      const earlyStart = clamp(preNeed - CONTACT_PLANE_T * G.pitch.flightSec, 0, 0.25);
      if (G.phaseT >= WINDUP_RELEASE_T - earlyStart) {
        const cross = pitchPosAt(G.pitch, 1);
        const [zx, zy] = zoneCoords(cross);
        if (Math.abs(zx) <= 1.08 && Math.abs(zy) <= 1.08) {
          G.pci = [clamp(zx, -1.1, 1.1), clamp(zy, -1.1, 1.1)];
          maybeStartAutoSwing(G.pitch, G.pci[0], G.pci[1], Math.max(0, WINDUP_RELEASE_T - G.phaseT));
        }
      }
    }
    if (G.phaseT >= WINDUP_RELEASE_T && G.pitch && G.phase === "windup") {
      setPhase("pitch");
      cue("pitch");
      juiceFire("pitch", {});
      if (G.mode === "bullpen") {
        showPitchChip("READ THE RELEASE — CALL 1-4", "", 0.9);
      } else if (battingIsPlayer()) {
        showPitchChip(`${G.pitch.spec.name} · ${G.pitch.mph.toFixed(0)} MPH`, "", 1.2);
      }
    }
  }

  function stepPitch(dt: number): void {
    const p = G.pitch;
    if (!p) {
      setPhase("between");
      return;
    }
    p.t += dt / p.flightSec;
    G.phaseT += dt;
    const [ax, ay] = getManualMoveAxis();
    const moveActive = Math.abs(ax) > 0.01 || Math.abs(ay) > 0.01;
    if (moveActive && battingIsPlayer()) {
      lastManualInputAt = simTime;
      G.batterAimX = clamp(G.batterAimX + ax * dt * 1.35, -0.36, 0.36);
      G.batterAimZ = clamp(G.batterAimZ - ay * dt * 1.15, -0.32, 0.32);
      G.batterStepTimer = 0.28;
    }
    if (battingIsPlayer() && G.mode !== "bullpen") {
      if (isSwingPressed() && !p.swung && !p.resolved && !isAutopilotActive()) triggerSwing(0.84);
      // Smart autopilot batting only when autopilot is explicitly enabled
      if (isAutopilotActive() && !p.swung && !p.resolved) {
        const cross = pitchPosAt(p, 1);
        const [zx, zy] = zoneCoords(cross);
        const trackRate = clamp(dt * 8.5, 0, 1);
        G.pci = [lerp(G.pci[0], clamp(zx, -1.1, 1.1), trackRate), lerp(G.pci[1], clamp(zy, -1.1, 1.1), trackRate)];
        const shouldSwing = Math.abs(zx) <= 1.08 && Math.abs(zy) <= 1.08;
        if (shouldSwing && !swingDrive.active) maybeStartAutoSwing(p, zx, zy);
      }
      // A swung pitch is settled by the swing reaching the plane; only a take is called at the plate.
      if (p.t >= 1.0 && !p.resolved && !p.swung) resolvePitchAtPlate(p);
    } else if (G.mode === "bullpen") {
      const g = G.bullpen;
      if (g.guess === null) {
        const idx = digitPressed();
        if (idx >= 0) {
          lastManualInputAt = simTime;
          g.guess = PITCH_KEYS[idx]!;
          showPitchChip(`YOUR CALL: ${PITCHES[g.guess].name}?`, "", 0.8);
          cue("uiClick");
        } else if (isAutopilotActive() && p.t >= 0.68) {
          g.guess = p.type;
          showPitchChip(`AUTO READ: ${PITCHES[g.guess].name}`, "", 0.8);
          cue("uiClick");
        }
      }
      if (p.t >= 1.0 && !p.resolved) resolvePitchAtPlate(p);
    } else {
      if (p.t >= 0.3 && !p.swung && !swingDrive.active) {
        cpuDecideSwing(p);
      }
      if (p.t >= 1.0 && !p.resolved && !p.swung) resolvePitchAtPlate(p);
    }
    // Resolved pitches ride through to the mitt, then the next beat starts.
    if (p.resolved && p.t > 1.22) {
      G.pitch = null;
      if (!G.over && G.phase === "pitch") setPhase("between");
    } else if (!p.resolved && p.t > 2.2) {
      // Safety net: a swing that never reached the plane (it should not happen) is scored as a miss.
      if (p.swung) {
        p.resolved = true;
        registerStrike();
      } else {
        resolvePitchAtPlate(p);
      }
      G.pitch = null;
      if (!G.over && G.phase === "pitch") setPhase("between");
    }
  }

  function stepBatted(dt: number): void {
    const ball = G.batted;
    if (!ball) {
      setPhase("between");
      return;
    }
    ball.age += dt;
    // Same fixed step and the same wall rule as the landing prediction (rules.ts stepFlight), so the live ball follows it.
    const { r, fenceR } = stepFlight(ball, park(), dt);
    if (ball.pos[1] > ball.maxY) ball.maxY = ball.pos[1];
    // Skyline window target check
    if (park().id === "skyline" && ball.crossedFence && !ball.windowHit && !ball.dead) {
      for (let i = 0; i < 4; i++) {
        const tp = fencePoint(park(), -24 + i * 16, 0);
        if (Math.hypot(ball.pos[0] - tp[0] * 1.18, ball.pos[2] - (tp[2] * 1.18 - 3)) < 5 && ball.pos[1] > 6 && ball.pos[1] < 16) {
          ball.windowHit = true;
          G.windowFlash = performance.now() / 1000 + 2;
          showBanner("WINDOW SHOT — MIDTOWN PAYS", 2.2);
          tick("window shot! glass rains on midtown", "success");
          cue("quad");
        }
      }
    }
    // Assist-catch prompt
    if (ball.fromCpu && !ball.dead && ball.catchable) {
      const tLand = ball.resolveAt - ball.age;
      if (tLand < 0.85 && tLand > 0 && !G.catchPrompt) {
        G.catchPrompt = { fielder: FIELDER_IDS[ball.catchFielder] ?? "f-cf", pos: ball.landPos };
      }
    }
    // A planned fly-out is caught when the ball comes down to glove height; the fielder has run to the spot (C8).
    if (ball.plannedOutcome === "flyout" && !ball.dead && !G.catchPrompt && ball.vel[1] < 0 && ball.pos[1] <= 1.7 && ball.age > 0.3) {
      ball.outcome = "flyout";
      ball.dead = true;
      const catcherId = FIELDER_IDS[ball.catchFielder >= 0 ? ball.catchFielder : 6] ?? "f-cf";
      cue("pop");
      applyOutcome(ball);
      G.caughtBy = catcherId;
      return;
    }
    if (G.catchPrompt && (isSwingPressed() || (isAutopilotActive() && ball.resolveAt - ball.age < 0.35))) {
      if (isSwingPressed()) lastManualInputAt = simTime;
      ball.outcome = "flyout";
      ball.dead = true;
      el.catchPrompt?.classList.remove("show");
      showBanner("CAN'T MISS — WEB GEM", 1.8);
      cue("pop");
      tick("you tracked it down — assist catch", "success");
      G.catchPrompt = null;
      applyOutcome(ball);
      return;
    }
    const landed = ball.pos[1] <= 0.05 || ball.age >= ball.resolveAt + 0.6 || (ball.crossedFence && ball.wallHit === false && ball.pos[1] <= park().wallH * 0.5 && ball.vel[1] < 0 && r >= fenceR + 4);
    if (landed && !ball.dead) {
      ball.dead = true;
      classifyBatted(ball);
      el.catchPrompt?.classList.remove("show");
      G.catchPrompt = null;
      applyOutcome(ball);
    }
  }

  function stepRunners(dt: number): void {
    G.phaseT += dt;
    for (const m of G.runnersAnim) m.t = Math.min(1, m.t + dt / 0.95);
    // SPACE = send the lead runner for an extra base (risk/reward)
    if (isSwingPressed() && !G.pushUsed && G.runnerBase.some((x) => x >= 0)) {
      lastManualInputAt = simTime;
      G.pushUsed = true;
      let slot = -1;
      let idx = -1;
      for (let i = 0; i < 3; i++) {
        const b = G.runnerBase[i]!;
        if (b > idx) {
          idx = b;
          slot = i;
        }
      }
      if (slot >= 0) {
        const toIdx = Math.min(3, idx + 1);
        G.runnersAnim.push({ node: slot, from: [...BASES[idx]!] as Vec3, to: toIdx === 3 ? HOME_PLATE : ([...BASES[toIdx]!] as Vec3), t: 0 });
        if (G.rng() < 0.78) {
          if (toIdx === 3) {
            addRun();
            G.runnerBase[slot] = -1;
            G.bases[idx] = false;
            showBanner("EXTRA BASE — RUN SCORES", 1.7);
            tick("aggressive running — took home", "success");
            maybeWalkoff();
          } else {
            G.runnerBase[slot] = toIdx;
            G.bases[idx] = false;
            G.bases[toIdx] = true;
            showBanner("TOOK THE EXTRA BASE", 1.4);
            tick("aggressive running — extra 90 feet", "success");
          }
        } else {
          // He slides in — the out call lands when the play ends
          G.pendingOutSlot = slot;
          G.bases[idx] = false;
          showBanner("THROWN OUT STRETCHING", 1.6);
          recordOut("gunned down stretching");
          tick("thrown out stretching", "warning");
        }
      }
    }
    if (G.phaseT >= 1.35) {
      if (G.pendingOutSlot >= 0) {
        G.runnerBase[G.pendingOutSlot] = -1;
        G.pendingOutSlot = -1;
      }
      G.runnersAnim = [];
      if (!G.over) setPhase("between");
    }
  }

  function stepPitchSelect(dt: number): void {
    G.phaseT += dt;
    const rep = clubById(G.playerClub).rep;
    const idx = digitPressed();
    if (idx >= 0) {
      lastManualInputAt = simTime;
      G.selPitch = rep[idx % rep.length] ?? "fourseam";
      cue("uiClick");
    }
    const [ax, ay] = getManualMoveAxis();
    const moveActive = Math.abs(ax) > 0.01 || Math.abs(ay) > 0.01;
    if (moveActive) lastManualInputAt = simTime;
    G.aim = [clamp(G.aim[0] + ax * dt * 1.6, -1.35, 1.35), clamp(G.aim[1] + ay * dt * 1.6, -1.35, 1.35)];
    if (isSwingPressed() || (moveActive && G.phaseT > 0.35) || (isAutopilotActive() && G.phaseT > 0.85)) {
      if (isSwingPressed() || moveActive) lastManualInputAt = simTime;
      else {
        G.selPitch = rep[G.pitchNo % rep.length] ?? "fourseam";
        G.aim = [(G.pitchNo % 2 === 0 ? -0.55 : 0.55), ((G.pitchNo >> 1) % 2 === 0 ? -0.45 : 0.45)];
      }
      setPhase("pitchMeter");
      G.meterNeedle = 0;
      G.meterDir = 1;
      cue("uiClick");
    }
  }

  function stepPitchMeter(dt: number): void {
    G.phaseT += dt;
    G.meterNeedle += G.meterDir * dt * 1.9;
    if (G.meterNeedle >= 1) {
      G.meterNeedle = 1;
      G.meterDir = -1;
    } else if (G.meterNeedle <= 0) {
      G.meterNeedle = 0;
      G.meterDir = 1;
    }
    const [ax, ay] = getManualMoveAxis();
    const moveActive = Math.abs(ax) > 0.01 || Math.abs(ay) > 0.01;
    const autoRelease = (isAutopilotActive() || moveActive) && G.phaseT > 0.22 && Math.abs(G.meterNeedle - 0.5) < 0.09;
    if (isSwingPressed() || autoRelease || (isAutopilotActive() && G.phaseT > 3.4)) {
      if (isSwingPressed() || moveActive) lastManualInputAt = simTime;
      const off = Math.abs(G.meterNeedle - 0.5);
      const q = clamp(1 - off / (0.08 * DIFFS[G.diff].sweetWiden * 3.4), 0, 1);
      const jitterAmt = (1 - q) * 0.8;
      G.pitch = makePitch(G.selPitch, G.aim[0] + jitter(G.rng) * jitterAmt, G.aim[1] + jitter(G.rng) * jitterAmt, { releaseQ: q });
      G.pitchNo += 1;
      setPhase("windup");
      if (q > 0.82) {
        showBanner("PERFECT RELEASE", 1.1);
        cue("uiConfirm");
      }
    }
  }

  /* ---------- Athlete visuals ---------- */
  const athleteState: Record<string, { pos: Vec3; yaw: number }> = {};
  /** Live bat/swing evidence, refreshed every frame by the socketed swing driver. */
  const batState = {
    position: [0, -60, 0] as Vec3,
    socketed: false,
    swingT: 0,
    poseApplied: false,
    poseError: null as string | null,
    bones: {} as Record<string, Vec3 | null>,
    animState: null as string | null,
    knobWorld: null as Vec3 | null,
    knobToHand: null as number | null,
    solverJoints: null as Record<string, Vec3> | null,
    solverActor: null as Record<string, Vec3> | null,
    sockFit: null as { s: number; n: Vec3 } | null
  };
  const swingEvidence = {
    phase: "stance" as "stance" | "load" | "stride" | "contact" | "follow-through" | "recover",
    t: 0,
    dur: 0,
    batTipWorld: [0, 0, 0] as Vec3,
    sweetWorld: [0, 0, 0] as Vec3,
    palmWorld: [0, 0, 0] as Vec3,
    /** Last frame's palm: the engine writes the bat after this frame's pose, so the grip distance compares against it. */
    palmPrev: [0, 0, 0] as Vec3,
    /** World velocity of the sweet spot (finite difference of the live bat, m/s). */
    sweetVel: [0, 0, 0] as Vec3,
    lastContact: null as null | { normal: Vec3; sprayDeg: number; launchDeg: number; normalBatSpeed: number; blendedSprayDeg: number; blendedLaunchDeg: number }
  };

  function setAthlete(id: string, x: number, y: number, z: number, yaw: number, clip = "Crouch_Idle_Loop", speed = 1.0): void {
    const h = H[id];
    if (!h) return;
    // `scaleMode: "fit"` grounds the model's lowest vertex on the node position, so the node sits at the ground (a +0.94 m "centred GLB" offset floated every athlete a metre up).
    h.setPosition(x, y, z).setRotation(0, yaw, 0).setVisible(true);
    setKitVisible(id, true);
    setActorAnimation(id, h, clip, speed);
    athleteState[id] = { pos: [x, y, z], yaw };
  }

  function hideAthlete(id: string): void {
    H[id]?.setVisible(false);
    setKitVisible(id, false);
  }
  function setKitVisible(id: string, on: boolean): void {
    if (kitVisible.get(id) === on) return;
    kitVisible.set(id, on);
    H[`${id}-cap`]?.setVisible(on);
    H[`${id}-belt`]?.setVisible(on);
  }

  /* ---------- Bat socket + swing driver ---------- */

  /** Right elbow in actor scene space under the STANCE overlay (calibration anchor). */
  function stanceElbowActor(): Vec3 {
    const sr = rotY(STANCE_KEY.phi, RIG.shoulderR);
    const shoulder: Vec3 = [RIG.chestBind[0] + sr[0], RIG.chestBind[1] + sr[1], RIG.chestBind[2] + sr[2]];
    return solveTwoBone(shoulder, STANCE_KEY.K, POLE_STANCE_R, RIG.upperArm, RIG.foreHand);
  }

  /**
   * Bat placement. The solver's palms match the engine's bone matrices to a millimetre at every swing time, so the bat is placed from
   * the same solve that poses the arms (knob at the right palm, direction from the forearm and the grip's fixed bat rotation). The
   * engine's bone attachment is not used for the bat: it lagged the hands during fast segments and left the bat 25 to 75 cm away.
   * The catcher's mitt and the fielders' gloves still ride their forearm bones through `attachToBone`.
   */
  const batSocket = {
    stage: "idle" as "idle" | "attaching" | "attached" | "failed",
    error: null as string | null,
    frames: 0,
    s: ACTOR_FIT,
    n: [0, 0, 0] as Vec3,
    disposeBat: null as (() => void) | null,
    disposeCal: null as (() => void) | null,
    disposeMitt: null as (() => void) | null,
    disposeGloves: [] as Array<() => void>,
    disposeKit: [] as Array<() => void>,
    retries: 0,
    retryAtFrame: -1
  };

  function attachBatSocket(): void {
    batSocket.disposeBat?.();
    batSocket.disposeCal?.();
    batSocket.disposeMitt?.();
    for (const dispose of batSocket.disposeGloves) dispose();
    batSocket.disposeGloves = [];
    for (const dispose of batSocket.disposeKit) dispose();
    batSocket.disposeKit = [];
    batSocket.disposeBat = null;
    batSocket.disposeCal = null;
    batSocket.disposeMitt = null;
    batSocket.stage = "attaching";
    batSocket.error = null;
    batSocket.frames = 0;
    batSocket.s = ACTOR_FIT;
    batSocket.n = [...FIT_GROUND_N] as Vec3;
    try {
      const batter = H.batter?.animation as AttachableActor | undefined;
      const catcher = H["f-c"]?.animation as AttachableActor | undefined;
      if (!batter || !catcher) throw new Error("ATTACH_ACTOR_MISSING: the batter or catcher animation handle is not available");
      // After app.setScene the new rigs load asynchronously: until the skeleton exists every socket reads invalid. Retry on
      // later frames instead of failing for the rest of the session (a park switch used to leave the bat unplaced for good).
      if (!batter.socket("RightForearm").valid && !batter.socket("LeftForearm").valid && !batter.socket("Hips").valid && batSocket.retries < 600) {
        batSocket.stage = "idle";
        batSocket.retries += 1;
        batSocket.retryAtFrame = framesRendered + 10;
        return;
      }
      // This rig names its arm bones RightForearm / LeftForearm and has no hand bones: the solver poses both forearms and the bat follows the right palm.
      for (const bone of ["RightForearm", "LeftForearm"]) if (!batter.socket(bone).valid) throw new Error(`ATTACH_BONE_NOT_FOUND: the batter has no bone "${bone}"`);
      // Catcher's mitt rides the crouched catcher's left forearm (glove hand).
      batSocket.disposeMitt = attachToBone(catcher, {
        bone: "LeftForearm",
        target: "catcher-mitt",
        position: GLOVE_ATTACH_POS,
        rotation: [-0.5, 2.9, 0.15],
        scale: 1
      }).detach;
      for (const id of GLOVE_OWNERS) {
        const owner = H[id]?.animation as AttachableActor | undefined;
        if (!owner || !H[`glove-${id}`]) continue;
        batSocket.disposeGloves.push(
          attachToBone(owner, {
            bone: "LeftForearm",
            target: `glove-${id}`,
            position: GLOVE_ATTACH_POS,
            rotation: [-0.5, 2.9, 0.15],
            scale: 1
          }).detach
        );
      }
      for (const id of KIT_OWNERS) {
        // A kit that cannot attach must never take the bat socket down with it.
        try {
          const owner = H[id]?.animation as AttachableActor | undefined;
          if (!owner) continue;
          if (H[`${id}-cap`] && owner.socket("Head").valid) {
            batSocket.disposeKit.push(attachToBone(owner, { bone: "Head", target: `${id}-cap`, position: CAP_ATTACH_POS, rotation: [0, 0, 0], scale: 1 }).detach);
          }
          if (H[`${id}-belt`] && owner.socket("Hips").valid) {
            batSocket.disposeKit.push(attachToBone(owner, { bone: "Hips", target: `${id}-belt`, position: BELT_ATTACH_POS, rotation: [0, 0, 0], scale: 1 }).detach);
          }
        } catch (err) {
          console.warn(`[aura-diamond] kit attach skipped for ${id}: ${String((err as Error)?.message ?? err).slice(0, 160)}`);
        }
      }
    } catch (err) {
      failBatSocket(String((err as Error)?.message ?? err));
    }
  }

  function failBatSocket(message: string): void {
    batSocket.stage = "failed";
    batSocket.error = message.slice(0, 240);
    console.error(`[aura-diamond] bat socket failed: ${batSocket.error}`);
  }

  /** QA evidence: where the batter's arm bones and the bat knob are in world space (metres). */
  function measureBatGrip(): void {
    const actor = H.batter?.animation as {
      socket?: (b: string) => { valid: boolean; worldMatrix: (o?: Float32Array) => Float32Array };
      animationState?: () => unknown;
    } | undefined;
    const bat = H.bat;
    if (!actor?.socket || !bat) return;
    const round = (v: readonly number[]): Vec3 => [Number(v[0]!.toFixed(3)), Number(v[1]!.toFixed(3)), Number(v[2]!.toFixed(3))];
    const bones: Record<string, Vec3 | null> = {};
    for (const name of ["Chest", "RightUpperArm", "RightForearm", "RightHand", "LeftForearm", "LeftHand"]) {
      try {
        const sock = actor.socket(name);
        // Call through `actor` so `socket` keeps its `this` (a detached method read zeros).
        bones[name] = sock.valid ? round(boneWorldPosition(actor as never, name)) : null;
      } catch {
        bones[name] = null;
      }
    }
    batState.bones = bones;
    try {
      batState.animState = JSON.stringify(actor.animationState?.() ?? null).slice(0, 400);
    } catch {
      batState.animState = "unavailable";
    }
    const r = bat.rotation as unknown as Vec3;
    const q = qMul(qAxis([0, 0, 1], r[2]), qMul(qAxis([0, 1, 0], r[1]), qAxis([1, 0, 0], r[0])));
    const dir = qRot(q, [1, 0, 0]);
    const c = bat.position as unknown as Vec3;
    const half = 0.51;
    const knob: Vec3 = [c[0] - dir[0] * half, c[1] - dir[1] * half, c[2] - dir[2] * half];
    batState.knobWorld = round(knob);
    // The bat transform read here was written by the previous render, which drew
    // the previous frame's solved pose; `palmWorld` still holds that frame's palm
    // (it is refreshed below this call), so both sides come from the same frame.
    const palm = swingEvidence.palmWorld;
    batState.knobToHand = Number(Math.hypot(knob[0] - palm[0], knob[1] - palm[1], knob[2] - palm[2]).toFixed(3));
  }


  /** QA probe: true palm positions from the engine bone matrices vs the engine-placed bat axis (metres, world). */
  function gripProbe(): Record<string, unknown> | null {
    const actor = H.batter?.animation as { socket?: (b: string) => { valid: boolean; worldMatrix: (o?: Float32Array) => Float32Array } } | undefined;
    const bat = H.bat;
    if (!actor?.socket || !bat) return null;
    const palmOf = (bone: string, local: Vec3): Vec3 | null => {
      const sock = actor.socket!(bone);
      if (!sock.valid) return null;
      const m = sock.worldMatrix();
      // Socket matrices are in the actor's skeleton frame (the frame the pose solver works in); convert to scene world like the bat.
      const actorPt: Vec3 = [m[0]! * local[0] + m[4]! * local[1] + m[8]! * local[2] + m[12]!, m[1]! * local[0] + m[5]! * local[1] + m[9]! * local[2] + m[13]!, m[2]! * local[0] + m[6]! * local[1] + m[10]! * local[2] + m[14]!];
      const st = athleteState["batter"];
      if (!st) return null;
      // True world: the batter node's own transform (position, yaw, fit scale) applied to the skeleton-frame point plus the fit's grounding shift.
      return worldFromActor(actorPt, st.pos, st.yaw);
    };
    const pr = palmOf("RightForearm", RIG.palmR);
    const pl = palmOf("LeftForearm", RIG.palmL);
    const feet = ["LeftFoot", "RightFoot", "LeftToes", "Hips", "Head"].map((b) => [b, palmOf(b, [0, 0, 0])] as const);
    const r = bat.rotation as unknown as Vec3;
    const q = qMul(qAxis([0, 0, 1], r[2]), qMul(qAxis([0, 1, 0], r[1]), qAxis([1, 0, 0], r[0])));
    const dir = qRot(q, [1, 0, 0]);
    const c = bat.position as unknown as Vec3;
    const knob: Vec3 = [c[0] - dir[0] * 0.51, c[1] - dir[1] * 0.51, c[2] - dir[2] * 0.51];
    const tip: Vec3 = [c[0] + dir[0] * 0.51, c[1] + dir[1] * 0.51, c[2] + dir[2] * 0.51];
    const axisDist = (p: Vec3 | null): number | null => {
      if (!p) return null;
      const d: Vec3 = [p[0] - knob[0], p[1] - knob[1], p[2] - knob[2]];
      const cr: Vec3 = [d[1] * dir[2] - d[2] * dir[1], d[2] * dir[0] - d[0] * dir[2], d[0] * dir[1] - d[1] * dir[0]];
      return Number(Math.hypot(cr[0], cr[1], cr[2]).toFixed(4));
    };
    const along = (p: Vec3 | null): number | null => (p ? Number(((p[0] - knob[0]) * dir[0] + (p[1] - knob[1]) * dir[1] + (p[2] - knob[2]) * dir[2]).toFixed(4)) : null);
    const dist = (a: Vec3 | null, b: Vec3): number | null => (a ? Number(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]).toFixed(4)) : null);
    const rd = (v: Vec3 | null) => (v ? (v.map((x) => Number(x.toFixed(3))) as Vec3) : null);
    return {
      phase: swingEvidence.phase,
      t: swingEvidence.t,
      rightPalm: rd(pr),
      leftPalm: rd(pl),
      knob: rd(knob),
      tip: rd(tip),
      rightPalmToAxis: axisDist(pr),
      leftPalmToAxis: axisDist(pl),
      rightPalmAlong: along(pr),
      leftPalmAlong: along(pl),
      knobToRightPalm: dist(pr, knob),
      knobMinusRightPalm: pr ? rd([knob[0] - pr[0], knob[1] - pr[1], knob[2] - pr[2]]) : null,
      calibration: { s: Number(batSocket.s.toFixed(4)), n: rd(batSocket.n) },
      palmsApart: pr && pl ? dist(pl, pr) : null,
      camera: { eye: [...G.cam.eye], target: [...G.cam.target], fov: G.cam.fov },
      canvas: (() => { const c = document.querySelector("#app canvas") as HTMLCanvasElement | null; return c ? { w: c.clientWidth, h: c.clientHeight } : null; })(),
      boneWorldY: Object.fromEntries(feet.map(([b, v]) => [b, v ? Number(v[1].toFixed(3)) : null])),
      poseApplied: batState.poseApplied
    };
  }

  /** The bat needs no calibration any more: it is placed from the solver in the batter node's own frame. */
  function stepBatSocketCalibration(_batterPos: Vec3, _batterYaw: number): void {
    if (batSocket.stage !== "attaching") return;
    batSocket.frames += 1;
    batSocket.s = ACTOR_FIT;
    batSocket.n = [...FIT_GROUND_N] as Vec3;
    H.batCal?.setVisible(false);
    batSocket.stage = "attached";
  }

  const actorFromWorld = (p: Vec3, pos: Vec3, yaw: number): Vec3 => {
    const d: Vec3 = [p[0] - pos[0], p[1] - pos[1], p[2] - pos[2]];
    const loc = rotY(-yaw, d);
    return [loc[0] / batSocket.s - batSocket.n[0], loc[1] / batSocket.s - batSocket.n[1], loc[2] / batSocket.s - batSocket.n[2]];
  };
  const worldFromActor = (p: Vec3, pos: Vec3, yaw: number): Vec3 => {
    const sc: Vec3 = [(p[0] + batSocket.n[0]) * batSocket.s, (p[1] + batSocket.n[1]) * batSocket.s, (p[2] + batSocket.n[2]) * batSocket.s];
    const r = rotY(yaw, sc);
    return [pos[0] + r[0], pos[1] + r[1], pos[2] + r[2]];
  };

  /** Swing state — the pose driver reads this every frame. */
  const swingDrive = {
    active: false,
    t: 0,
    ratePre: 2, // t per second before contact (1/durPre)
    ratePost: 2, // t per second after contact (1/durPost)
    resolved: true,
    holdT: 0,
    recover: 0,
    hold: null as number | null,
    contact: null as ContactConfig | null,
    power: 0.84,
    isPlayer: true,
    timingErr: 0,
    pciX: 0,
    pciY: 0,
    pitch: null as LivePitch | null,
    prevTau: 0,
    prevTauL: 0,
    prevGamma: 0,
    predictedBallWorld: [0.18, ZONE_CY + 0.01, 0.32] as Vec3
  };

  /** Nominal contact anchor for practice swings (zone-centre pitch crossing). */
  const nominalContactWorld = (): Vec3 => [0.18, ZONE_CY + 0.01, 0.32];

  function startBatterSwing(opts: { pitch?: LivePitch | null; power?: number; isPlayer?: boolean; timingErr?: number; pciX?: number; pciY?: number; durPre?: number; durPost?: number }): boolean {
    if (swingDrive.active && swingDrive.t < SWING_CONTACT_T + 0.2) return false;
    const pitch = opts.pitch ?? null;
    let ballWorld: Vec3 = nominalContactWorld();
    if (pitch) {
      // Predict the pitch's position when it reaches the contact plane (z≈0.32).
      ballWorld = pitchPosAt(pitch, CONTACT_PLANE_T);
    }
    swingDrive.predictedBallWorld = ballWorld;
    const ballActor = actorFromWorld(ballWorld, [-0.82 + G.batterAimX, 0, 0.28 + G.batterAimZ], BATTER_YAW);
    const hipY = -clamp((0.121 - ballActor[1]) * 0.9 + 0.03, 0.03, 0.18);
    swingDrive.contact = buildContactConfig(ballActor, hipY);
    swingDrive.pitch = pitch;
    swingDrive.power = opts.power ?? 0.84;
    swingDrive.isPlayer = opts.isPlayer ?? true;
    swingDrive.timingErr = opts.timingErr ?? 0;
    swingDrive.pciX = opts.pciX ?? 0;
    swingDrive.pciY = opts.pciY ?? 0;
    const durPre = clamp(opts.durPre ?? SWING_CONTACT_T * SWING_TOTAL, 0.1, 0.6);
    const durPost = clamp(opts.durPost ?? (1 - SWING_CONTACT_T) * SWING_TOTAL, 0.35, 0.8);
    swingDrive.ratePre = SWING_CONTACT_T / durPre;
    swingDrive.ratePost = (1 - SWING_CONTACT_T) / durPost;
    swingDrive.active = true;
    swingDrive.t = 0;
    swingDrive.resolved = !pitch;
    swingDrive.holdT = 0;
    swingDrive.recover = 0;
    swingDrive.prevTau = 0;
    swingDrive.prevTauL = 0;
    swingDrive.prevGamma = 0;
    return true;
  }

  /**
   * Drive the batter pose for this frame and report bat geometry (world).
   * Returns null when the overlay should be cleared (running / hidden).
   */
  let batterStepBlend = 0;
  function updateBatterPose(dt: number, now: number, batterPos: Vec3, batterYaw: number): { tipWorld: Vec3; sweetWorld: Vec3; palmWorld: Vec3 } | null {
    if (!H.batter || typeof H.batter.setAnimationPose !== "function") return null;
    const sampled = sampleBatterTarget(swingDrive, now);
    // Walking up to the plate the clip owns the legs: ease the crouch out and back so the hips and feet do not pop.
    batterStepBlend = clamp(batterStepBlend + (G.batterStepTimer > 0 ? dt : -dt) / 0.3, 0, 1);
    const keep = 1 - batterStepBlend;
    const hipEff: Vec3 = [sampled.hip[0] * keep, sampled.hip[1] * keep, sampled.hip[2] * keep];
    const handsK: Vec3 = [sampled.K[0] - sampled.hip[0] * batterStepBlend, sampled.K[1] - sampled.hip[1] * batterStepBlend, sampled.K[2] - sampled.hip[2] * batterStepBlend];
    const pose = solveBatterPose(handsK, sampled.D, sampled.phi, hipEff, sampled.pole, swingDrive.prevTau, swingDrive.prevTauL, swingDrive.prevGamma, sampled.stride, batterStepBlend <= 0);
    swingDrive.prevTau = pose.tau;
    swingDrive.prevTauL = pose.tauL;
    swingDrive.prevGamma = pose.gamma;
    try {
      H.batter.setAnimationPose({ bones: poseBonesForEngine(pose.bones), mode: "overlay" });
      batState.poseApplied = true;
    } catch (err) {
      batState.poseApplied = false;
      batState.poseError = String((err as Error)?.message ?? err).slice(0, 200);
    }

    // Bat from the same solve: knob at the right palm, centre half a bat along the bat axis, rotated like the hand-held bat.
    if (batSocket.stage === "attached" && H.bat) {
      const centre = worldFromActor([pose.palmActor[0] + pose.batDir[0] * KNOB_HALF, pose.palmActor[1] + pose.batDir[1] * KNOB_HALF, pose.palmActor[2] + pose.batDir[2] * KNOB_HALF], batterPos, batterYaw);
      const e = qToEulerZYX(qMul(qAxis([0, 1, 0], batterYaw), qMul(pose.qFa, BAT_ATTACH_ROT)));
      H.bat.setPosition(centre[0], centre[1], centre[2]).setRotation(e[0], e[1], e[2]);
    }

    const w = (v: Vec3): Vec3 => worldFromActor(v, batterPos, batterYaw).map((x) => Number(x.toFixed(3))) as Vec3;
    batState.solverActor = { Chest: pose.chestActor, RightUpperArm: pose.shoulderActor, RightForearm: pose.elbow, palm: pose.palmActor };
    batState.sockFit = { s: batSocket.s, n: batSocket.n };
    batState.solverJoints = { Chest: w(pose.chestActor), RightUpperArm: w(pose.shoulderActor), RightForearm: w(pose.elbow), palm: w(pose.palmActor) };
    return {
      tipWorld: worldFromActor(pose.tipActor, batterPos, batterYaw),
      sweetWorld: worldFromActor(pose.sweetActor, batterPos, batterYaw),
      palmWorld: worldFromActor(pose.palmActor, batterPos, batterYaw)
    };
  }

  /** Where the simulation puts the ball right now (before render interpolation). */
  function simBallWorld(): Vec3 {
    if (G.phase === "pitch" && G.pitch) return pitchPosAt(G.pitch, G.pitch.t);
    if (G.phase === "windup" && G.pitch) return [RELEASE_PT[0], RELEASE_PT[1] - Math.sin(clamp(G.phaseT / 0.62, 0, 1) * Math.PI) * 0.3, RELEASE_PT[2]];
    if ((G.phase === "batted" || G.phase === "runners") && G.batted) return [G.batted.pos[0], Math.max(0.075, G.batted.pos[1]), G.batted.pos[2]];
    if (G.phase === "between" || G.phase === "pitchSelect" || G.phase === "pitchMeter") return [0.3, MOUND_TOP + 1.1, MOUND_Z + 0.4]; // in the pitcher's glove
    return G.lastBallPos;
  }
  const presenter = createFixedStepPresenter<{ ball: Vec3 }>({
    snapshot: () => ({ ball: simBallWorld() }),
    // A jump of more than 4 m in one step is a new pitch or a reset: show it, do not smear across it.
    blend: (a, b, t) => (Math.hypot(b.ball[0] - a.ball[0], b.ball[1] - a.ball[1], b.ball[2] - a.ball[2]) > 4 ? b : { ball: mix3(a.ball, b.ball, t) })
  });

  /** Sim-side timers and the swing clock: one fixed step (C14). Contact resolves exactly when the bat meets the plane. */
  function stepSwingClock(dt: number): void {
    G.batterStepTimer = Math.max(0, G.batterStepTimer - dt);
    G.fielderThrowTimer = Math.max(0, G.fielderThrowTimer - dt);
    // Advance the swing timeline; resolve contact exactly when the bat meets the ball.
    if (swingDrive.active && swingDrive.hold !== null) {
      // QA hold (`holdSwingAt`): freeze the swing clock so a frame can be measured and captured at an exact t.
      swingDrive.t = clamp(swingDrive.hold, 0, 1);
      swingDrive.resolved = true;
    } else if (swingDrive.active) {
      const prevT = swingDrive.t;
      swingDrive.t = clamp(swingDrive.t + dt * (swingDrive.t < SWING_CONTACT_T ? swingDrive.ratePre : swingDrive.ratePost), 0, 1);
      if (prevT < SWING_CONTACT_T && swingDrive.t >= SWING_CONTACT_T && !swingDrive.resolved) {
        swingDrive.resolved = true;
        const p = swingDrive.pitch;
        if (p && !p.resolved && G.pitch === p) {
          resolveSwing(p, swingDrive.timingErr, swingDrive.pciX, swingDrive.pciY, swingDrive.power, swingDrive.isPlayer);
        }
      }
      if (swingDrive.t >= 1) {
        swingDrive.holdT += dt;
        if (swingDrive.holdT > 0.22) swingDrive.recover = clamp(swingDrive.recover + dt / 0.35, 0, 1);
        if (swingDrive.recover >= 1) {
          swingDrive.active = false;
          swingDrive.contact = null;
        }
      }
    }

  }

  function updateActors(dt: number, t: number): void {
    const pk = park();
    if (batSocket.stage === "idle" && batSocket.retryAtFrame >= 0 && framesRendered >= batSocket.retryAtFrame) {
      batSocket.retryAtFrame = -1;
      bindHandles();
      applyUniforms();
      attachBatSocket();
    }
    const playerBatting = battingIsPlayer();

    // Batter at the plate; completes the swing follow-through at home plate, then sprints down the 1B line
    const batterX = -0.82 + G.batterAimX;
    const batterZ = 0.28 + G.batterAimZ;
    if (qaRunT !== null) qaRunT += dt;
    const sprintingToFirst = qaRunT !== null || (G.phase === "batted" && Boolean(G.batted) && G.batterRunning && G.batted!.age >= 0.22);
    let batGeom: { tipWorld: Vec3; sweetWorld: Vec3; palmWorld: Vec3 } | null = null;
    if (sprintingToFirst && (G.batted || qaRunT !== null)) {
      const b = G.batted;
      const runAge = qaRunT !== null ? qaRunT : Math.max(0, b!.age - 0.22);
      const prog = clamp(runAge / (qaRunT !== null ? 2.4 : Math.max(0.45, b!.resolveAt * 0.55)), 0, 1);
      const dest = BASES[0]!;
      const bx = lerp(batterX, dest[0], prog * 0.92);
      const bz = lerp(batterZ, dest[2], prog * 0.92);
      const runYaw = Math.atan2(dest[0] - batterX, dest[2] - batterZ);
      setAthlete("batter", bx, 0, bz, runYaw, prog < 0.98 ? "Sprint_Loop" : "Ready", prog < 0.98 ? 1.5 : 1.0);
      try {
        H.batter?.setAnimationPose?.(undefined);
      } catch {
        /* clearing the pose is best-effort */
      }
    } else if (G.phase === "runners" && G.batterRunning) {
      hideAthlete("batter");
    } else {
      // Stance/swing: the clip only animates the legs; the overlay owns the grip.
      const batterClip = G.batterStepTimer > 0 ? "Walk_Loop" : "Idle_Loop";
      const batterSpeed = G.batterStepTimer > 0 ? 1.25 : 1.0;
      setAthlete("batter", batterX, 0, batterZ, BATTER_YAW, batterClip, batterSpeed);
      stepBatSocketCalibration([batterX, 0, batterZ], BATTER_YAW);
      batGeom = updateBatterPose(dt, t, [batterX, 0, batterZ], BATTER_YAW);
    }

    // Bat — the engine owns its transform while socketed; the route only toggles visibility.
    const batVisible = !sprintingToFirst && G.phase !== "menu" && G.phase !== "gameover" && !(G.phase === "runners" && G.batterRunning);
    H.bat?.setVisible(batVisible);
    const liveBatPos = H.bat?.position;
    if (liveBatPos && batSocket.stage !== "idle") {
      batState.position = [Number(liveBatPos[0].toFixed(3)), Number(liveBatPos[1].toFixed(3)), Number(liveBatPos[2].toFixed(3))];
    }
    batState.socketed = batSocket.stage === "attached";
    batState.swingT = swingDrive.active ? Number(swingDrive.t.toFixed(3)) : swingDrive.recover > 0 ? 1 : 0;
    if (evidenceDue) measureBatGrip();
    swingEvidence.phase = !swingDrive.active
      ? "stance"
      : swingDrive.t < 0.26
        ? "load"
        : swingDrive.t < 0.4
          ? "stride"
          : swingDrive.t < 0.56
            ? "contact"
            : swingDrive.recover > 0
              ? "recover"
              : "follow-through";
    swingEvidence.t = Number(swingDrive.t.toFixed(3));
    swingEvidence.dur = Number((SWING_CONTACT_T / swingDrive.ratePre + (1 - SWING_CONTACT_T) / swingDrive.ratePost).toFixed(3));
    if (batGeom) {
      swingEvidence.batTipWorld = batGeom.tipWorld.map((v) => Number(v.toFixed(3))) as Vec3;
      if (dt > 1e-4) {
        const prev = swingEvidence.sweetWorld;
        swingEvidence.sweetVel = [(batGeom.sweetWorld[0] - prev[0]) / dt, (batGeom.sweetWorld[1] - prev[1]) / dt, (batGeom.sweetWorld[2] - prev[2]) / dt];
      }
      swingEvidence.sweetWorld = batGeom.sweetWorld.map((v) => Number(v.toFixed(3))) as Vec3;
      swingEvidence.palmPrev = swingEvidence.palmWorld;
      swingEvidence.palmWorld = batGeom.palmWorld.map((v) => Number(v.toFixed(3))) as Vec3;
    }

    // Pitcher — windup Telegraph, brief pitch Release (<0.32), else calm Ready on the mound
    let pitcherClip = "Ready";
    let pitcherSpeed = 1.0;
    if (G.phase === "windup") {
      pitcherClip = "Telegraph";
      pitcherSpeed = 1.25;
    } else if (G.phase === "pitch" && G.pitch && G.pitch.t < 0.32) {
      pitcherClip = "Release";
      pitcherSpeed = 1.4;
    }
    setAthlete("pitcher", 0.1, MOUND_TOP, MOUND_Z - 0.1, 0, pitcherClip, pitcherSpeed);

    // 1B & 3B base coaches grounded at y = 0 with calm Ready stance. The
    // home-plate umpire was removed: two figures behind the batter read as a
    // crowd and the catcher alone is enough to sell the pitch.
    if (H.coach1b) {
      H.coach1b.setPosition(21.5, 0, -14.8).setRotation(0, -Math.PI * 0.72, 0).setVisible(true);
      setActorAnimation("coach-1b", H.coach1b, "Ready", 1.0);
    }
    if (H.coach3b) {
      H.coach3b.setPosition(-21.5, 0, -14.8).setRotation(0, Math.PI * 0.72, 0).setVisible(true);
      setActorAnimation("coach-3b", H.coach3b, "Ready", 1.0);
    }

    // Fielders — only the active fielder chasing a live batted ball runs (Sprint_Loop); stationary fielders stay in Ready
    const b = G.batted;
    let activeFielderId: string | null = b && !b.dead && (b.catchable || b.plannedOutcome === "flyout") && b.catchFielder >= 0 ? FIELDER_IDS[b.catchFielder] ?? null : null;
    if (!activeFielderId && G.phase === "batted" && b && !b.dead) {
      let bestDist = Infinity;
      for (const fid of FIELDER_IDS) {
        if (fid === "f-c") continue;
        const sp = FIELDER_SPOTS[fid]!;
        const d = Math.hypot(sp[0] - b.landPos[0], sp[2] - b.landPos[2]);
        if (d < bestDist) {
          bestDist = d;
          activeFielderId = fid;
        }
      }
    }
    FIELDER_IDS.forEach((id) => {
      const spot = FIELDER_SPOTS[id]!;
      let x = spot[0];
      let z = spot[2];
      const y = spot[1];
      let yaw = Math.atan2(-x, -z);
      // The catcher must read as a catcher, not a second batter standing at the plate.
      let clip = id === "f-c" ? "Crouch_Idle_Loop" : "Ready";
      let speed = 1.0;

      const distToLanding = b ? Math.hypot(spot[0] - b.landPos[0], spot[2] - b.landPos[2]) : Infinity;
      const shouldChase = G.phase === "batted" && b && !b.dead && id !== "f-c" && (id === activeFielderId || distToLanding < 22);
      if (shouldChase && b) {
        const isPrimary = id === activeFielderId;
        // C8: the fielder who will make a catch reaches the landing spot a beat before the ball and reaches up for it.
        const catching = isPrimary && b.plannedOutcome === "flyout";
        const chaseScale = catching ? 1 : isPrimary ? 0.78 : 0.35;
        const rawProgress = b.age / Math.max(0.25, b.resolveAt);
        const drift = clamp(catching ? rawProgress / 0.85 : rawProgress, 0, 1) * chaseScale;
        x = lerp(spot[0], b.landPos[0], drift);
        z = lerp(spot[2], b.landPos[2], drift);
        const stillMoving = (catching ? drift < 0.999 : rawProgress < 0.98) && distToLanding > 1.2;
        clip = stillMoving ? "Sprint_Loop" : catching ? "Contest" : "Ready";
        speed = stillMoving ? (isPrimary ? 1.45 : 1.28) : 1.0;
        if (distToLanding > 0.5) {
          yaw = Math.atan2(b.landPos[0] - spot[0], b.landPos[2] - spot[2]);
        }
      } else if (G.caughtBy === id && G.phase === "runners") {
        // Holding the catch where it was made.
        const st = athleteState[id];
        if (st) {
          x = st.pos[0];
          z = st.pos[2];
          yaw = st.yaw;
        }
        clip = "Contest";
      } else if (G.fielderThrowTimer > 0 && G.activeThrowerId === id) {
        clip = "Release";
        speed = 1.35;
      }
      setAthlete(id, x, y, z, yaw, clip, speed);
    });

    // Catcher's mitt rides the catcher's left forearm through the bone socket
    // (attached in attachBatSocket); only its visibility is route-owned.
    H.catcherMitt?.setVisible(batSocket.stage === "attached" || batSocket.stage === "attaching");

    // Runners on bases — advancing runners play Sprint_Loop while moving, standing runners play Ready
    G.runnerBase.forEach((baseIdx, i) => {
      const h = H[`runner-${i}`];
      if (!h) return;
      const anim = G.runnersAnim.find((m) => m.node === i);
      if (baseIdx < 0 && !anim) {
        hideAthlete(`runner-${i}`);
        return;
      }
      const pos: Vec3 = anim ? mix3(anim.from, anim.to, smoothstep(anim.t)) : [...BASES[baseIdx]!];
      const isAdvancing = Boolean(anim && anim.t < 0.98) || (G.phase === "batted" && Boolean(G.batted && !G.batted.dead && G.batted.age < G.batted.resolveAt));
      const yaw = anim ? Math.atan2(anim.to[0] - anim.from[0], anim.to[2] - anim.from[2]) : Math.atan2(-pos[0], -pos[2]);
      setAthlete(`runner-${i}`, pos[0], pos[1], pos[2], yaw, isAdvancing ? "Sprint_Loop" : "Ready", isAdvancing ? 1.45 : 1.0);
    });

    // Waver crowd — real 3D Meshy spectators standing calmly along the outfield wall grounded at y = 0
    const crowd = crowdPlacements(pk);
    ((H.wavers as AnyHandle[]) ?? []).forEach((w, i) => {
      if (!w) return;
      const c = crowd[i];
      if (c) w.setPosition(c.x, 0, c.z).setRotation(0, c.yaw, 0);
      setActorAnimation(`waver-${i}`, w, "Ready", 1.0);
    });
    void t;

    // Ball + shadow + trail dots: drawn between the last two sim steps (fixed-step presenter, C14).
    let ballWorld: Vec3 = presenter.present(simLoop, appReady && !simLoop.manual && !simPaused()).ball;
    if (G.caughtBy && G.phase === "runners") {
      const glove = H[`glove-${G.caughtBy}`]?.position as Vec3 | undefined;
      if (glove) ballWorld = [glove[0], glove[1], glove[2]];
    }
    if (qaBall) ballWorld = qaBall;
    G.lastBallPos = ballWorld;
    H.ball?.setPosition(ballWorld[0], ballWorld[1], ballWorld[2]).setVisible(ballWorld[1] > -30);
    const shScale = clamp(1.15 - ballWorld[1] * 0.02, 0.4, 1.1);
    // C17: the key light already casts the ball's real shadow near the ground; the fake disc only marks a high fly ball's spot.
    H.ballShadow?.setPosition(ballWorld[0], 0.04, ballWorld[2]).setScale([shScale, 1, shScale]).setVisible(ballWorld[1] > 3 && ballWorld[1] < 60);

    ((H.trail as AnyHandle[]) ?? []).forEach((th, i) => {
      if (!th) return;
      const ageT = i / TRAIL_COUNT;
      if (G.phase === "batted" && G.batted && ballWorld[1] > -30) {
        const back = ageT * 0.55;
        const px = ballWorld[0] - G.batted.vel[0] * back;
        const py = Math.max(0.05, ballWorld[1] - G.batted.vel[1] * back + 4.9 * back * back);
        const pz = ballWorld[2] - G.batted.vel[2] * back;
        const s = Math.max(0.2, 1 - ageT);
        th.setPosition(px, py, pz).setScale([s, s, s]).setVisible(true);
      } else if (G.phase === "pitch" && G.pitch) {
        const pt = clamp(G.pitch.t - ageT * 0.3, 0, 1.2);
        const pp = pitchPosAt(G.pitch, pt);
        const s = Math.max(0.2, 0.8 - ageT * 0.6);
        th.setPosition(pp[0], pp[1], pp[2]).setScale([s, s, s]).setVisible(true);
      } else {
        th.setScale(HIDDEN_SCALE).setVisible(false);
      }
    });

    // PCI ring (batting) + aim dot (pitching) + landing ring + zone frame
    const pciVisible = (playerBatting && (G.phase === "pitch" || G.phase === "between" || G.phase === "windup") && G.mode !== "bullpen") || G.mode === "studio" || G.mode === "derby";
    const pciX = clamp(G.pci[0], -1.25, 1.25) * ZONE_HW;
    const pciY = ZONE_CY + clamp(G.pci[1], -1.25, 1.25) * ZONE_HH;
    H.pci?.setPosition(pciX, pciY, 0.06).setRotation(0, 0, 0).setVisible(pciVisible);
    const aimVisible = playerPitchingTurn() && (G.phase === "pitchSelect" || G.phase === "pitchMeter");
    H.aim?.setPosition(G.aim[0] * ZONE_HW, ZONE_CY + G.aim[1] * ZONE_HH, 0.08).setVisible(aimVisible);
    const landVisible = G.phase === "batted" && G.batted && !G.batted.dead && Math.abs(G.batted.landTheta) <= FOUL_DEG;
    if (landVisible && G.batted) {
      H.landRing?.setPosition(G.batted.landPos[0], 0.06, G.batted.landPos[2]).setRotation(Math.PI / 2, t * 2, 0).setVisible(true);
    } else {
      H.landRing?.setVisible(false);
    }
    H.zoneFrame?.setVisible(pciVisible || aimVisible);

    // Skyline window flash on a target hit
    const win = (H.windows as AnyHandle[]) ?? [];
    if (G.windowFlash > performance.now() / 1000) {
      win.forEach((w) => w?.setMaterial(material.emissive({ color: "#ffd76a", emissive: "#ffd76a", emissiveIntensity: 2.2 })));
    } else if (win.length && win[0]) {
      win.forEach((w) => w?.setMaterial(material.emissive({ color: "#16324a", emissive: "#35d6ff", emissiveIntensity: 0.55 })));
    }

    // Particle toggles
    const now = performance.now() / 1000;
    if (confettiUntil && now > confettiUntil) {
      H.confetti?.setVisible(false);
      confettiUntil = 0;
    }
    if (hrBurstUntil && now > hrBurstUntil) {
      H.hrBurst?.setVisible(false);
      hrBurstUntil = 0;
    }
    if (flairOnUntil && now > flairOnUntil) {
      H.flairBurst?.setVisible(false);
      flairOnUntil = 0;
    }

    if (el.catchPrompt) el.catchPrompt.classList.toggle("show", !!G.catchPrompt && G.phase === "batted");

    void dt;
  }

  /* ---------- Camera director ---------- */
  let qaBall: Vec3 | null = null;
  let qaRunT: number | null = null;
  let qaCam: { eye: Vec3; target: Vec3; fov: number } | null = null;
  function updateCamera(dt: number): void {
    const c = G.cam;
    const pk = park();
    let eye: Vec3 = c.eye;
    let target: Vec3 = c.target;
    let fov = 42;
    if (G.phase === "menu" || (G.over && G.phase === "gameover")) {
      c.mode = G.over ? "celebrate" : "menuOrbit";
      c.orbit += dt * (G.over ? 0.3 : 0.1);
      if (G.over) {
        eye = [Math.sin(c.orbit) * 16, 6.5, Math.cos(c.orbit) * 16 + 2];
        target = [0, 1.4, -4];
        fov = 44;
      } else {
        const r = pk.fenceCenter * 0.62;
        eye = [Math.sin(c.orbit) * r, 20 + Math.sin(c.orbit * 0.6) * 4, Math.cos(c.orbit) * r * 0.7 + 14];
        target = [0, 2, -18];
        fov = 40;
      }
    } else if (G.phase === "batted" && G.batted) {
      c.mode = "track";
      const bp = G.batted.pos;
      eye = [clamp(bp[0] * 0.22, -6, 6), 10.5, 17.5];
      target = [clamp(bp[0] * 0.35, -8, 8), 1.2, clamp(bp[2] * 0.32, -22, -10)];
      fov = 48;
    } else if (playerPitchingTurn() && (G.phase === "pitchSelect" || G.phase === "pitchMeter" || G.phase === "windup" || (G.phase === "pitch" && G.pitch && !G.pitch.swung))) {
      c.mode = "pitching";
      eye = [G.aim[0] * 2.2, 4.6, -27.5];
      target = [G.aim[0] * 0.5, 1.2, 2];
      fov = 47;
    } else {
      c.mode = "batting";
      const drift = clamp(G.pci[0] * 0.9, -1.2, 1.2);
      const pitchPush = G.phase === "pitch" && G.pitch ? G.pitch.t * 1.4 : 0;
      // Frames the WHOLE batter and bat through the swing: the follow-through
      // tip reaches y≈2.4 m, x≈[-1.8, 0.5] — NDC extents stay under ±0.3 x /
      // ±0.65 y at fov 40°, ~3x inside the frustum at this 11.6 m standoff.
      eye = [drift - 0.5, 6.4 - pitchPush * 0.35, 11.6 - pitchPush * 0.8];
      target = [-0.5 + drift * 0.4, 1.28 + (G.pitch?.t ?? 0) * 0.1, -7.2];
      fov = 40;
    }
    if (qaCam) {
      eye = qaCam.eye;
      target = qaCam.target;
      fov = qaCam.fov;
    }
    const k = qaCam ? 1 : 1 - Math.pow(0.001, dt);
    c.eye = mix3(c.eye, eye, k);
    c.target = mix3(c.target, target, k);
    c.fov = lerp(c.fov, fov, k);
    try {
      (app as any).camera?.setPose?.({ position: c.eye, target: c.target, fov: c.fov });
    } catch {
      /* camera override best-effort */
    }
  }

  /* ---------- HUD ---------- */
  const hudCache: Record<string, string> = {};
  const setText = (elRef: HTMLElement | null, key: string, v: string) => {
    if (!elRef) return;
    if (hudCache[key] === v) return;
    hudCache[key] = v;
    elRef.textContent = v;
  };

  function updateHud(dt: number): void {
    const inGame = G.phase !== "menu" && !G.over;
    el.hud?.classList.toggle("on", inGame);
    renderLinescore();
    setText(el.count, "count", `${G.balls}-${G.strikes}`);
    countDots.b.forEach((d, i) => d?.classList.toggle("on", i < G.balls));
    countDots.s.forEach((d, i) => d?.classList.toggle("on", i < G.strikes));
    countDots.o.forEach((d, i) => d?.classList.toggle("on", i < G.outs));
    setText(el.inn, "inn", String(G.inning));
    setText(el.half, "half", G.half === "top" ? "▲" : "▼");
    baseDots.forEach((d, i) => d?.classList.toggle("on", G.bases[i] ?? false));
    const fc = fieldingClub();
    setText(el.matchup, "matchup", `${clubAbbr(battingTeamKey())} vs ${clubAbbr(battingIsPlayer() ? "cpu" : "player")}`);
    setText(el.pitcherRep, "prep", fc.rep.map((p) => PITCHES[p].short).join(" · "));
    if (el.pitchChip && performance.now() / 1000 > pitchChipHideAt) el.pitchChip.classList.remove("show");
    const showZone = (battingIsPlayer() && (G.phase === "pitch" || G.phase === "between" || G.phase === "windup") && G.mode !== "bullpen") || (playerPitchingTurn() && (G.phase === "pitchSelect" || G.phase === "pitchMeter"));
    el.zone?.classList.toggle("show", showZone);
    if (showZone) {
      const toPct = (zx: number, zy: number): [string, string] => [`${(clamp(zx, -1.3, 1.3) / 2.6 + 0.5) * 100}%`, `${(0.5 - clamp(zy, -1.3, 1.3) / 2.6) * 100}%`];
      const [pl, pt] = toPct(G.pci[0], G.pci[1]);
      if (el.pciDot) {
        el.pciDot.style.left = pl;
        el.pciDot.style.top = pt;
        el.pciDot.style.display = battingIsPlayer() && G.mode !== "bullpen" ? "" : "none";
      }
      const [al, at] = toPct(G.aim[0], G.aim[1]);
      if (el.aimDot) {
        el.aimDot.style.left = al;
        el.aimDot.style.top = at;
        el.aimDot.style.display = playerPitchingTurn() ? "" : "none";
      }
      if (el.pitchDot && G.pitch && G.phase === "pitch") {
        const pp = pitchPosAt(G.pitch, Math.min(G.pitch.t, 1));
        const [zx, zy] = zoneCoords(pp);
        const [dl, dt2] = toPct(zx, zy);
        el.pitchDot.style.left = dl;
        el.pitchDot.style.top = dt2;
        el.pitchDot.style.display = "";
      } else if (el.pitchDot && lastCross && performance.now() / 1000 < lastCrossUntil) {
        // C22: keep the crossing point on the zone for a moment after the pitch.
        const [dl, dt2] = toPct(lastCross[0], lastCross[1]);
        el.pitchDot.style.left = dl;
        el.pitchDot.style.top = dt2;
        el.pitchDot.style.display = "";
      } else if (el.pitchDot) {
        el.pitchDot.style.display = "none";
      }
    }
    // C9: on-screen pitch buttons during pitch selection and Bullpen reads.
    const padMode = playerPitchingTurn() && G.phase === "pitchSelect" ? "select" : G.mode === "bullpen" && G.phase === "pitch" && G.bullpen.guess === null ? "bullpen" : "";
    el.pitchPad?.classList.toggle("show", padMode !== "");
    if (padMode && el.pitchPad) {
      const rep = clubById(G.playerClub).rep;
      const labels = padMode === "select" ? [0, 1, 2, 3].map((i) => PITCHES[rep[i % rep.length]!].short) : PITCH_KEYS.map((k) => PITCHES[k].short);
      const active = padMode === "select" ? G.selPitch : G.bullpen.guess;
      el.pitchPad.querySelectorAll<HTMLButtonElement>("[data-pitch-idx]").forEach((b, i) => {
        const label = labels[i] ?? "";
        if (b.textContent !== label) b.textContent = label;
        const id = padMode === "select" ? rep[i % rep.length] : PITCH_KEYS[i];
        b.classList.toggle("active", id === active);
      });
    }
    el.meter?.classList.toggle("show", G.phase === "pitchMeter");
    if (el.needle && G.phase === "pitchMeter") el.needle.style.left = `${G.meterNeedle * 100}%`;
    if (el.contact && performance.now() / 1000 > contactHideAt) el.contact.classList.remove("show");
    el.derbyCard?.classList.toggle("show", G.mode === "derby");
    if (G.mode === "derby") {
      setText(el.derbyHr, "dhr", String(G.derby.hrs));
      setText(el.derbyOuts, "douts", String(G.derby.outs));
      setText(el.derbyLong, "dlong", G.derby.longest > 0 ? `${G.derby.longest} FT` : "—");
      setText(el.derbyTotal, "dtotal", String(G.derby.totalFt));
    }
    el.bullpenCard?.classList.toggle("show", G.mode === "bullpen");
    if (G.mode === "bullpen") {
      setText(el.bullpenScore, "bps", `${G.bullpen.correct}/${Math.max(1, G.bullpen.round)}`);
      setText(el.bullpenStreak, "bpst", String(G.bullpen.streak));
      setText(el.bullpenRound, "bpr", String(Math.min(12, G.bullpen.round + 1)));
    }
    // Banner timers count real seconds, not frames (C14).
    if (G.bannerT > 0) {
      G.bannerT -= dt;
      if (G.bannerT <= 0) el.banner?.classList.remove("show");
    }
    if (G.msgT > 0) {
      G.msgT -= dt;
      if (G.msgT <= 0) el.msg?.classList.remove("show");
    }
  }

  /* ---------- Menus ---------- */
  function buildMenuDom(): void {
    if (el.menuParks) {
      el.menuParks.innerHTML = PARK_ORDER.map((id) => `<button type="button" class="pill${id === G.park ? " active" : ""}" data-park-id="${id}">${PARKS[id].short}</button>`).join("");
      el.menuParks.querySelectorAll<HTMLButtonElement>("[data-park-id]").forEach((b) => b.addEventListener("click", () => setPark(b.dataset.parkId as ParkId)));
    }
    if (el.menuClubs) {
      el.menuClubs.innerHTML = CLUBS.map(
        (c) =>
          `<button type="button" class="club-card${c.id === G.playerClub ? " active" : ""}" data-club="${c.id}"><div class="cc-name"><span class="cc-dot" style="background:${c.color}"></span>${c.name}</div><div class="cc-tag">${c.tag}</div><div class="cc-rep">${c.rep.map((p) => PITCHES[p].short).join(" · ")} · PWR ${(c.power * 100) | 0} · CON ${(c.contact * 100) | 0}</div></button>`
      ).join("");
      el.menuClubs.querySelectorAll<HTMLButtonElement>("[data-club]").forEach((b) =>
        b.addEventListener("click", () => {
          G.playerClub = b.dataset.club ?? G.playerClub;
          el.menuClubs?.querySelectorAll(".club-card").forEach((x) => x.classList.toggle("active", (x as HTMLElement).dataset.club === G.playerClub));
          const others = CLUBS.filter((c) => c.id !== G.playerClub);
          G.cpuClub = others[Math.floor(G.rng() * others.length)]!.id;
          applyUniforms();
          cue("uiClick");
        })
      );
    }
    if (el.studioColors) {
      el.studioColors.innerHTML = STUDIO_COLORS.map((c) => `<button type="button" class="pill${c.color === G.studio.color ? " active" : ""}" data-sc="${c.id}" style="border-color:${c.color}55">${c.label}</button>`).join("");
      el.studioColors.querySelectorAll<HTMLButtonElement>("[data-sc]").forEach((b) =>
        b.addEventListener("click", () => {
          const c = STUDIO_COLORS.find((x) => x.id === b.dataset.sc);
          if (c) {
            G.studio.color = c.color;
            applyUniforms();
            el.studioColors?.querySelectorAll("[data-sc]").forEach((x) => x.classList.toggle("active", (x as HTMLElement).dataset.sc === c.id));
            cue("uiClick");
          }
        })
      );
    }
    if (el.studioBats) {
      el.studioBats.innerHTML = STUDIO_BATS.map((b2) => `<button type="button" class="pill${b2.id === G.studio.bat ? " active" : ""}" data-sb="${b2.id}">${b2.label}</button>`).join("");
      el.studioBats.querySelectorAll<HTMLButtonElement>("[data-sb]").forEach((b) =>
        b.addEventListener("click", () => {
          G.studio.bat = b.dataset.sb ?? G.studio.bat;
          applyUniforms();
          el.studioBats?.querySelectorAll("[data-sb]").forEach((x) => x.classList.toggle("active", (x as HTMLElement).dataset.sb === G.studio.bat));
          cue("uiClick");
        })
      );
    }
    if (el.studioFlair) {
      el.studioFlair.innerHTML = STUDIO_FLAIR.map((f) => `<button type="button" class="pill${f.id === G.studio.flair ? " active" : ""}" data-sf="${f.id}">${f.label}</button>`).join("");
      el.studioFlair.querySelectorAll<HTMLButtonElement>("[data-sf]").forEach((b) =>
        b.addEventListener("click", () => {
          G.studio.flair = b.dataset.sf ?? G.studio.flair;
          el.studioFlair?.querySelectorAll("[data-sf]").forEach((x) => x.classList.toggle("active", (x as HTMLElement).dataset.sf === G.studio.flair));
          cue("uiClick");
          fireFlair();
        })
      );
    }
    document.querySelectorAll<HTMLButtonElement>(".mode-card[data-mode]").forEach((b) => {
      b.classList.toggle("active", b.dataset.mode === G.pendingMode);
      b.addEventListener("click", () => {
        G.pendingMode = (b.dataset.mode as ModeId) ?? "quick";
        document.querySelectorAll<HTMLButtonElement>(".mode-card[data-mode]").forEach((x) => x.classList.toggle("active", x === b));
        if (G.pendingMode === "studio") el.studioSection?.scrollIntoView({ behavior: "smooth", block: "center" });
        if (G.pendingMode === "classic" && !G.classic) startClassicBracket();
        renderBracket();
        cue("uiClick");
      });
    });
    el.menuDiff?.querySelectorAll<HTMLButtonElement>("[data-diff]").forEach((b) => {
      b.classList.toggle("active", b.dataset.diff === G.diff);
      b.addEventListener("click", () => {
        G.diff = (b.dataset.diff as DiffId) ?? "pro";
        el.menuDiff?.querySelectorAll("[data-diff]").forEach((x) => x.classList.toggle("active", x === b));
        cue("uiClick");
      });
    });
  }

  /* ---------- Wiring ---------- */
  window.addEventListener(
    "click",
    (e) => {
      const target = e.target as HTMLElement | null;
      if (target && target.closest("button")) {
        (target.closest("button") as HTMLButtonElement).blur();
      }
    },
    true
  );

  const syncAutoBtn = (): void => {
    if (!el.tbAuto) return;
    el.tbAuto.classList.toggle("active", G.autopilot);
    el.tbAuto.textContent = G.autopilot ? "Auto: ON" : "Auto";
  };
  syncAutoBtn();

  el.tbQuick?.addEventListener("click", () => startMode("quick"));
  el.tbDerby?.addEventListener("click", () => startMode("derby"));
  // C19: mute toggle, remembered across visits.
  let muted = false;
  try {
    muted = localStorage.getItem("aura-diamond-3d.muted") === "1";
  } catch {
    /* storage unavailable */
  }
  const syncMute = (): void => {
    try {
      (audio as any).setMuted?.(muted);
    } catch {
      /* audio is best-effort */
    }
    if (el.tbMute) {
      el.tbMute.textContent = muted ? "Sound: Off" : "Sound: On";
      el.tbMute.setAttribute("aria-pressed", String(muted));
    }
  };
  syncMute();
  el.tbMute?.addEventListener("click", () => {
    muted = !muted;
    try {
      localStorage.setItem("aura-diamond-3d.muted", muted ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
    syncMute();
  });
  el.pitchPad?.querySelectorAll<HTMLButtonElement>("[data-pitch-idx]").forEach((b) => {
    b.addEventListener("pointerdown", (e) => {
      e.preventDefault();
      touchPitchPress = Number(b.dataset.pitchIdx);
    });
  });

  el.tbAuto?.addEventListener("click", () => {
    G.autopilot = !G.autopilot;
    syncAutoBtn();
    showBanner(G.autopilot ? "CPU AUTOPILOT ON" : "MANUAL CONTROLS ACTIVE", 1.4);
    cue("uiClick");
  });
  el.tbMenu?.addEventListener("click", () => {
    if (el.menu?.classList.contains("hidden")) openMenu();
    else closeMenu();
    cue("uiClick");
  });
  document.querySelectorAll<HTMLButtonElement>(".aura3d-top-bar [data-park]").forEach((b) => {
    b.classList.toggle("active", b.dataset.park === G.park);
    b.addEventListener("click", () => setPark(b.dataset.park as ParkId));
  });
  el.menuPlay?.addEventListener("click", () => startMode(G.pendingMode));
  el.menuClose?.addEventListener("click", closeMenu);
  window.addEventListener("keydown", (e) => {
    if (e.code === "Escape") {
      if (el.menu?.classList.contains("hidden")) openMenu();
      else closeMenu();
    }
  });

  buildMenuDom();
  applyUniforms();

  const urlPark = params.get("park") as ParkId | null;
  if (urlPark && PARKS[urlPark]) setPark(urlPark);
  const urlMode = params.get("mode") as ModeId | null;
  const validModes: ModeId[] = ["quick", "derby", "bullpen", "classic", "studio"];
  const initialMode: ModeId = urlMode && validModes.includes(urlMode) ? urlMode : "quick";
  if (params.get("menu") === "1") {
    openMenu();
  } else {
    startMode(initialMode);
  }

  // Wait for all GLB assets and textures to finish loading before marking ready or ticking simulation
  void Promise.resolve((app as any).ready?.()).then(() => {
    bindHandles();
    applyUniforms();
    // Socket the bat to the (now loaded) batter rig; the calibration probe
    // resolves the actor fit scale within a couple of frames.
    attachBatSocket();
    updateActors(0.016, simTime);
    updateCamera(0.016);
    updateHud(0.016);
    appReady = true;
    document.body.dataset.aura3dReady = "true";
    document.querySelector("#app canvas")?.setAttribute("data-ready", "true");
  });

  /* ---------- QA hooks (?qa=1 only) ---------- */
  function qaHooks(): Record<string, unknown> {
    const runUntil = (done: () => boolean, max = 6000): number => {
      let n = 0;
      while (!done() && n < max) {
        simLoop.advance(1);
        n++;
      }
      return n;
    };
    return {
      /**
       * Deliver one CPU pitch to the player with the sim stepped by hand, press swing when the timing error would be `offset`
       * seconds (negative = early), or take the pitch when `offset` is null. With `aimAtBall` the contact point is put on
       * the ball's crossing point first (what a player who reads the pitch does with the stick). Returns what the game decided.
       */
      qaSwingAt: (offset: number | null, aimAtBall = false) => {
        const wasManual = simLoop.manual;
        simLoop.manual = true;
        try {
          runUntil(() => G.phase === "between" || G.over);
          if (G.over || !battingIsPlayer()) return { error: "player not batting", phase: G.phase, half: G.half };
          const before = { balls: G.balls, strikes: G.strikes, outs: G.outs };
          G.lastGrade = "";
          G.lastTimingErr = null;
          cpuChoosePitch();
          const p = G.pitch!;
          const cross = pitchPosAt(p, 1);
          if (aimAtBall) {
            const [zx, zy] = zoneCoords(cross);
            G.pci = [clamp(zx, -1.3, 1.3), clamp(zy, -1.3, 1.3)];
          }
          let pressed = offset === null;
          runUntil(() => {
            if (p.resolved || G.pitch !== p) return true;
            if (!pressed && (G.phase === "windup" || G.phase === "pitch")) {
              // Press on the step where the bat would arrive `offset` seconds after the ball (one step = SIM_STEP).
              const toPlane = timeToContactPlane(G.phase, G.phaseT + SIM_STEP, G.phase === "pitch" ? p.t + SIM_STEP / p.flightSec : p.t, p.flightSec);
              if (swingTimingError(toPlane) >= (offset ?? 0) - SIM_STEP / 2) {
                edges.swing = true;
                pressed = true;
              }
            }
            return false;
          }, 4000);
          return { offset, aimAtBall, pitch: p.spec.name, inZone: inZone(cross), grade: G.lastGrade || null, timingErrMs: G.lastTimingErr === null ? null : Math.round(G.lastTimingErr * 1000), planned: G.batted?.plannedOutcome ?? null, before, after: { balls: G.balls, strikes: G.strikes, outs: G.outs }, phase: G.phase };
        } finally {
          simLoop.manual = wasManual;
        }
      },
      qaFinish: (playerWon: boolean) => {
        endGame(playerWon, `final after ${G.inning}`);
      },
      qaStep: (n: number) => simLoop.advance(n),
      /** Cap and belt heights above each athlete's ground point, and their horizontal offset (metres). */
      qaKit: () =>
        Object.fromEntries(
          KIT_OWNERS.map((id) => {
            const st = athleteState[id];
            const cap = H[`${id}-cap`]?.position as Vec3 | undefined;
            const belt = H[`${id}-belt`]?.position as Vec3 | undefined;
            const rel = (v: Vec3 | undefined) => (v && st ? { up: Number((v[1] - st.pos[1]).toFixed(3)), off: Number(Math.hypot(v[0] - st.pos[0], v[2] - st.pos[2]).toFixed(3)) } : null);
            return [id, { cap: rel(cap), belt: rel(belt), visible: kitVisible.get(id) ?? null }];
          })
        ),
      qaLayout: () => ({ crowd0: crowdPlacements(park())[0], drawCalls: (app as any).diagnostics?.()?.drawCalls ?? null })
    };
  }

  /* ---------- Main loop ---------- */
  /** One fixed 1/120 s simulation step (C14): the phase machine, the PCI and the swing clock. */
  function simStep(h: number): void {
    simTime += h;
    if (G.phase !== "menu") {
      switch (G.phase) {
        case "between": stepBetween(h); break;
        case "windup": stepWindup(h); break;
        case "pitch": stepPitch(h); break;
        case "batted": stepBatted(h); break;
        case "runners": stepRunners(h); break;
        case "pitchSelect": stepPitchSelect(h); break;
        case "pitchMeter": stepPitchMeter(h); break;
        case "gameover":
          G.phaseT += h;
          if (isAutopilotActive() && G.phaseT > 4.2) {
            startMode(G.mode);
          }
          break;
        default: break;
      }
      // PCI move (batting phases)
      if (battingIsPlayer() && (G.phase === "between" || G.phase === "windup" || G.phase === "pitch")) {
        const [ax, ay] = getManualMoveAxis();
        if (Math.abs(ax) > 0.01 || Math.abs(ay) > 0.01) lastManualInputAt = simTime;
        G.pci = [clamp(G.pci[0] + ax * h * 1.7, -1.3, 1.3), clamp(G.pci[1] + ay * h * 1.7, -1.3, 1.3)];
      }
    }
    stepSwingClock(h);
    consumeEdges();
    presenter.afterStep();
  }

  const simLoop = createFixedStepLoop({ step: (h) => simStep(h), stepSeconds: SIM_STEP, maxCatchUpSteps: 6, maxFrameSeconds: 0.05 });
  /** Sim clock in ms: real frame time, slowed during hit-stop. */
  let simClockMs = 0;

  /** C10: the sim waits while the menu is open over a live game or the tab is hidden. */
  const simPaused = (): boolean =>
    (typeof document !== "undefined" && document.hidden) || (!(el.menu?.classList.contains("hidden") ?? true) && G.phase !== "gameover" && G.phase !== "menu");

  const qaMode = params.get("qa") === "1";
  let lastEvidenceAt = -Infinity;

  app.onFrame(({ dt: rawDt }) => {
    const dt = clamp(rawDt, 0.001, 0.05);
    const now = performance.now() / 1000;
    framesRendered += 1;

    if (!appReady) {
      updateActors(0.016, simTime);
      updateCamera(0.016);
      updateHud(0.016);
      return;
    }

    input.update(dt);
    captureEdges();
    if (simPaused()) {
      consumeEdges();
    } else if (!simLoop.manual) {
      simClockMs += dt * 1000 * (hitStopUntil > now ? 0.12 : 1);
      simLoop.tick(simClockMs);
    }

    // Evidence (and the per-frame grip probe that feeds it) is built at 4 Hz, or every frame with ?qa=1 (C12).
    evidenceDue = qaMode || now - lastEvidenceAt >= 0.25;
    updateActors(dt, simTime);
    updateCamera(dt);
    // HUD timers run on wall-clock seconds (capped at 1 s for a stalled tab), not on the clamped sim frame.
    updateHud(clamp(rawDt, 0, 1));
    touchControls?.update?.();
    justPressedKeys.clear();
    if (!evidenceDue) return;
    lastEvidenceAt = now;

    const p = G.pitch;
    const evidence = {
      route: "showcase-aura-diamond-3d",
      engine: "@aura3d/engine",
      ready: appReady && framesRendered > 2,
      framesRendered,
      autopilot: G.autopilot,
      look: park().look,
      mode: G.mode,
      phase: G.phase,
      cameraMode: G.cam.mode,
      park: G.park,
      gravity: park().gravity,
      inning: G.inning,
      half: G.half,
      outs: G.outs,
      count: `${G.balls}-${G.strikes}`,
      bases: [...G.bases],
      score: { ...G.score },
      pitchType: p?.spec.name ?? null,
      pitchMph: p ? Number(p.mph.toFixed(1)) : null,
      pitchT: p ? Number(p.t.toFixed(3)) : null,
      pci: [Number(G.pci[0].toFixed(3)), Number(G.pci[1].toFixed(3))],
      aim: [Number(G.aim[0].toFixed(3)), Number(G.aim[1].toFixed(3))],
      selPitch: G.selPitch,
      lastGrade: G.lastGrade,
      lastTimingErrMs: G.lastTimingErr !== null ? Number((G.lastTimingErr * 1000).toFixed(1)) : null,
      exitVelo: G.lastEV ? Number(G.lastEV.toFixed(1)) : null,
      launchDeg: G.lastLA ? Number(G.lastLA.toFixed(1)) : null,
      lastDistFt: G.lastDistFt,
      derbyOuts: G.derby.outs,
      derbyHrs: G.derby.hrs,
      derbyLongest: G.derby.longest,
      bullpen: { round: G.bullpen.round, correct: G.bullpen.correct, streak: G.bullpen.streak, bestStreak: G.bullpen.bestStreak },
      classic: G.classic ? { round: G.classic.round, alive: G.classic.alive, champion: G.classic.champion } : null,
      clubs: { player: G.playerClub, cpu: G.cpuClub },
      difficulty: G.diff,
      over: G.over,
      result: G.result,
      bat: {
        position: [...batState.position],
        socketed: batState.socketed,
        socketStage: batSocket.stage,
        socketError: batSocket.error,
        swingT: batState.swingT,
        poseApplied: batState.poseApplied,
        poseError: batState.poseError,
        bones: batState.bones,
        solverJoints: batState.solverJoints,
        solverActor: batState.solverActor,
        sockFit: batState.sockFit,
        animState: batState.animState,
        knobWorld: batState.knobWorld ? [...batState.knobWorld] : null,
        knobToHand: batState.knobToHand
      },
      swing: {
        phase: swingEvidence.phase,
        t: swingEvidence.t,
        dur: swingEvidence.dur,
        batTipWorld: [...swingEvidence.batTipWorld],
        palmWorld: [...swingEvidence.palmWorld],
        sweetVelocity: swingEvidence.sweetVel.map((v) => Number(v.toFixed(2))),
        lastContact: swingEvidence.lastContact,
        sweetSpotWorld: [...swingEvidence.sweetWorld],
        predictedContactWorld: [...swingDrive.predictedBallWorld],
        // Only meaningful mid-swing: a resolved flag carried from a finished
        // swing must not read as "contact met" while the batter is back in stance.
        contactMet: swingDrive.active && swingDrive.resolved
      },
      ball: {
        position: G.lastBallPos.map((n) => Number(n.toFixed(3))),
        inPlay: G.phase === "batted" && Boolean(G.batted && !G.batted.dead)
      },
      athleteClips: Object.fromEntries(lastClipByActor.entries()),
      athletes: Object.fromEntries(
        Object.entries(athleteState).map(([k, v]) => [
          k,
          {
            pos: v.pos.map((n) => Number(n.toFixed(3))),
            yaw: Number(v.yaw.toFixed(3)),
            clip: lastClipByActor.get(k) ?? "Crouch_Idle_Loop"
          }
        ])
      ),
      eventLog: eventLog.snapshot(),
      deterministic: { rng: "lcg-32", seed: G.seed + G.gameNo * 7919 },
      audio: (audio as any).evidence ? { unlocked: (audio as any).evidence.unlocked, cueCount: (audio as any).evidence.cueCount, playedCueCount: (audio as any).evidence.playedCueCount } : null,
      touch: touchControls?.evidence?.() ?? null
    };
    publishBeacon(evidence);
  });

  {
    (window as any).__AURA3D_GAME_DIAMOND__ = {
      start: (m: ModeId) => startMode(m),
      setPark,
      triggerSwing,
      holdSwingAt: (t: number | null) => { if (t === null) { swingDrive.hold = null; return; } triggerSwing(0.84); swingDrive.hold = t; },
      gripProbe,
      /** QA: show the walk-up (batter stepping) or the run to first, to frame those states from the owner's camera. */
      qaWalk: (sec: number) => {
        G.batterStepTimer = sec;
      },
      qaRun: (on: boolean) => {
        qaRunT = on ? 0 : null;
      },
      /** QA: every batter joint's world matrix (skeleton frame) plus the node transform, so a spec can skin the mesh on the CPU and measure the drawn hand. */
      jointMatrices: (names: string[]) => {
        const actor = H.batter?.animation as { socket?: (b: string) => { valid: boolean; worldMatrix: (o?: Float32Array) => Float32Array } } | undefined;
        const st = athleteState["batter"];
        if (!actor?.socket || !st) return null;
        const mats: Record<string, number[] | null> = {};
        for (const n of names) {
          const sock = actor.socket(n);
          mats[n] = sock.valid ? Array.from(sock.worldMatrix()) : null;
        }
        return { mats, pos: st.pos, yaw: st.yaw, s: batSocket.s, n: batSocket.n };
      },
      predictedContact: () => [...swingDrive.predictedBallWorld] as Vec3,
      setQaBall: (v: Vec3 | null) => {
        qaBall = v;
      },
      /** QA: which half is batting (`bottom` puts the CPU club at bat, to frame the AI batter). */
      setHalf: (h: "top" | "bottom") => {
        G.half = h;
      },
      setCamOverride: (o: { eye: Vec3; target: Vec3; fov: number } | null) => {
        qaCam = o;
      },
      state: () => ({ mode: G.mode, phase: G.phase, park: G.park, inning: G.inning, half: G.half, score: { ...G.score }, outs: G.outs, bases: [...G.bases] }),
      ...(qaMode ? qaHooks() : {})
    };
  }
  // C18: the second boot block that started `?mode=` a second time (and ignored `?menu=1`) is gone; the URL is read once above.

  // Boot flourish
  setTimeout(() => {
    if (G.phase === "menu") showMsg("AURA DIAMOND 3D", "SIX BALLPARKS — ONE CROWN", 3.2);
  }, 600);
}

if (typeof window !== "undefined") {
  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
}
