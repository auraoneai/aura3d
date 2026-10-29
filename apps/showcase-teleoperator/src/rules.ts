/**
 * Grid Dispatch rules: pure functions and constants, no DOM and no engine calls, so the unit tests can drive them
 * (tests/unit/teleoperator/rules.test.ts).
 */

export type Vec3 = [number, number, number];
export type PlayableCarId = "cruiser" | "coupe" | "truck" | "gt" | "interceptor";
export type AutopilotLevel = "MAN" | "L3" | "L4" | "L5" | "L5 MAX";
export type WeatherPreset = "noon" | "golden" | "fog" | "night";
export type RideLifecycleState = "offer" | "boarding" | "ride" | "alighting" | "summary";
export type RideStyle = "comfort" | "street";
export type CameraMode = 0 | 1 | 2 | 3;

export const clamp = (v: number, min: number, max: number): number => Math.max(min, Math.min(max, v));
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

// ---------------------------------------------------------------- street layout

// Lanes 0 and 1 run towards the camera (oncoming, -7.6 m and -3.2 m); lanes 2 and 3 run with the player (+3.4 m and +7.4 m).
export const AVENUE_LANES_X = [-7.6, -3.2, 3.4, 7.4] as const;
export const CENTER_LINE_X = 0;
export const CURB_BEACON_X = 8.55;
/** Where a car stopping at the kerb beacon has its centre. */
export const KERB_STOP_X = CURB_BEACON_X - 0.9;
export const PLAYER_X_LIMIT = 9.2;

// ---------------------------------------------------------------- fleet

export interface FleetSpec {
  readonly id: PlayableCarId;
  readonly name: string;
  readonly maker: string;
  /** Longest side after fitting, metres (the model's length). */
  readonly maxDim: number;
  /** Manifest bounds [x, y, z] of the GLB (x width, y height, z length). */
  readonly bounds: readonly [number, number, number];
  readonly maxSpeedMps: number;
  readonly accel: number;
  readonly isIce: boolean;
  /** Powertrain tag shown after the assist label. */
  readonly drive: string;
}

export const PLAYABLE_FLEET: Readonly<Record<PlayableCarId, FleetSpec>> = {
  cruiser: { id: "cruiser", name: "Apex Lidar Cruiser", maker: "Apex Autonomous", maxDim: 3.9, bounds: [0.8921, 1.4132, 1.9017], maxSpeedMps: 38, accel: 18, isIce: false, drive: "DUAL-MOTOR EV" },
  coupe: { id: "coupe", name: "Cyber Coupe", maker: "Aura Autonomous", maxDim: 4.0, bounds: [1.2939, 1.1513, 1.9016], maxSpeedMps: 40, accel: 20, isIce: false, drive: "SINGLE-MOTOR EV" },
  truck: { id: "truck", name: "Titan EV Truck", maker: "Aura Heavy Industries", maxDim: 5.55, bounds: [0.7774, 0.7276, 1.9027], maxSpeedMps: 43, accel: 22, isIce: false, drive: "TRI-MOTOR AWD" },
  gt: { id: "gt", name: "Vortex GT", maker: "Manual Override", maxDim: 4.66, bounds: [0.9245, 0.5271, 1.9061], maxSpeedMps: 54, accel: 29, isIce: true, drive: "8-SPEED V8" },
  interceptor: { id: "interceptor", name: "Apex Interceptor", maker: "Aura Aero Division", maxDim: 4.5, bounds: [0.8736, 0.5225, 1.9019], maxSpeedMps: 58, accel: 34, isIce: false, drive: "QUAD-MOTOR EV" }
};

export const PLAYABLE_IDS: readonly PlayableCarId[] = ["cruiser", "coupe", "truck", "gt", "interceptor"];

export interface FittedSize {
  readonly width: number;
  readonly height: number;
  readonly length: number;
}

/** Size of a model fitted with `scaleMode: "fit"` to `maxDim` (the longest bound becomes maxDim). */
export function fittedSize(bounds: readonly [number, number, number], maxDim: number): FittedSize {
  const s = maxDim / Math.max(bounds[0], bounds[1], bounds[2]);
  return { width: bounds[0] * s, height: bounds[1] * s, length: bounds[2] * s };
}

// ---------------------------------------------------------------- camera

/** The scene camera never moves; the game moves the world so the car stays in front of it. */
export const SCENE_CAM_POS: Vec3 = [0, 3.4, 6.5];
export const SCENE_CAM_TARGET: Vec3 = [0, 1.0, -7.2];
export const SCENE_CAM_FOV_DEG = 56;
/** View-space z of the player car's centre in the chase camera. */
export const CAR_DRAW_Z = -0.8;
/** Scene camera near plane: geometry closer than this is clipped, so the eye must clear the car by at least this much. */
export const CAMERA_NEAR = 0.25;
const ROOF_CAM_CLEARANCE = 0.4;
const ROOF_CAM_AHEAD = 0.28;
const BUMPER_CAM_HEIGHT = 0.8;
const BUMPER_CAM_AHEAD = 0.35;

export interface CamOffset {
  readonly y: number;
  readonly z: number;
}

/**
 * World offsets for the four camera modes, derived from the car's fitted size: the roof camera sits `ROOF_CAM_CLEARANCE` above
 * the roof and a little ahead of the car's centre, the bumper camera sits ahead of the front bumper at bumper height. The
 * offsets shift the world (y up lowers the eye, z up moves the car towards and past the camera).
 */
export function cameraOffsets(size: FittedSize): Readonly<Record<CameraMode, CamOffset>> {
  const base = SCENE_CAM_POS[2] - CAR_DRAW_Z;
  return {
    0: { y: 0, z: 0 },
    1: { y: -0.55, z: -2.4 },
    2: { y: SCENE_CAM_POS[1] - (size.height + ROOF_CAM_CLEARANCE), z: base + ROOF_CAM_AHEAD * size.length },
    3: { y: SCENE_CAM_POS[1] - BUMPER_CAM_HEIGHT, z: base + size.length / 2 + BUMPER_CAM_AHEAD }
  };
}

/**
 * Signed distances from the camera to the car's box in view space. The camera counts as inside the car when it is within the
 * near-plane distance of the box on all three axes (closer than that, the near plane cuts into the body).
 */
export function cameraClearance(size: FittedSize, off: CamOffset, carViewX = 0, margin = CAMERA_NEAR): { readonly dx: number; readonly dy: number; readonly dz: number; readonly inside: boolean } {
  const carZ = CAR_DRAW_Z + off.z;
  const carBottom = off.y;
  const dx = Math.abs(SCENE_CAM_POS[0] - carViewX) - size.width / 2;
  const dz = Math.abs(SCENE_CAM_POS[2] - carZ) - size.length / 2;
  const eye = SCENE_CAM_POS[1] - carBottom;
  const dy = eye > size.height ? eye - size.height : eye < 0 ? -eye : -Math.min(eye, size.height - eye);
  return { dx, dy, dz, inside: dx < margin && dy < margin && dz < margin };
}

/**
 * The world-to-view x shift. The view follows the player across lanes by `VIEW_FOLLOW` of its lateral offset, so the car moves
 * across the screen by the rest. Every world-anchored node, road strips included, goes through this one function.
 */
export const VIEW_FOLLOW = 0.72;
export const viewX = (worldX: number, playerX: number, shakeX = 0): number => worldX - playerX * VIEW_FOLLOW + shakeX;

// ---------------------------------------------------------------- assist levels

export interface AssistSpec {
  /** Who steers: the player, the system holding the current lane, or the system driving the route (lane changes). */
  readonly steering: "player" | "lane" | "route";
  /** Who sets the speed. */
  readonly speed: "player" | "auto";
  /** The system brakes for a car close ahead and for red lights while the player drives. */
  readonly brakeAssist: boolean;
  /** Cruise speed in m/s when the system sets the speed. */
  readonly cruiseMps: number;
  readonly label: string;
  readonly dock: string;
  readonly hint: string;
}

export const ASSIST: Readonly<Record<AutopilotLevel, AssistSpec>> = {
  MAN: { steering: "player", speed: "player", brakeAssist: false, cruiseMps: 0, label: "MANUAL", dock: "Manual", hint: "W/S speed, A/D steer, stop at the kerb beacon" },
  L3: { steering: "player", speed: "player", brakeAssist: true, cruiseMps: 0, label: "L3 · BRAKE ASSIST", dock: "L3 Brake Assist", hint: "You drive; the car brakes for traffic and red lights" },
  L4: { steering: "lane", speed: "auto", brakeAssist: true, cruiseMps: 13.4, label: "L4 · LANE CRUISE", dock: "L4 Lane Cruise", hint: "Holds its lane and stops at the kerb; never overtakes" },
  L5: { steering: "route", speed: "auto", brakeAssist: true, cruiseMps: 15.2, label: "L5 · SELF-DRIVING", dock: "L5 Self-Driving", hint: "Drives the route, overtakes and stops at the kerb" },
  "L5 MAX": { steering: "route", speed: "auto", brakeAssist: true, cruiseMps: 21.5, label: "L5 MAX · FAST ROUTE", dock: "L5 Fast Route", hint: "Self-driving at a higher cruise speed" }
};

export const ASSIST_ORDER: readonly AutopilotLevel[] = ["MAN", "L3", "L4", "L5", "L5 MAX"];
export const nextAssist = (level: AutopilotLevel): AutopilotLevel => ASSIST_ORDER[(ASSIST_ORDER.indexOf(level) + 1) % ASSIST_ORDER.length]!;
export const gmodeLabel = (level: AutopilotLevel, car: PlayableCarId): string => `${ASSIST[level].label} · ${PLAYABLE_FLEET[car].drive}`;
export const isAutonomous = (level: AutopilotLevel): boolean => ASSIST[level].speed === "auto";

// ---------------------------------------------------------------- kerb beacon

export const KERB_X_TOLERANCE = 1.2;
export const KERB_STOP_SPEED = 2;
export const KERB_Z_WINDOW = 4.2;
/** Driving this far past the beacon without stopping misses it. */
export const KERB_MISS_DISTANCE = 6;

export type KerbGate = "approach" | "stop" | "missed";

/**
 * Pickup and drop-off gate. `dz` is how far the beacon is ahead of the car (negative once passed). The system stops on the
 * kerb by itself; a player who drives (MAN, L3) must be in the kerb lane and below `KERB_STOP_SPEED` inside the window.
 */
export function kerbGate(o: { readonly playerDrives: boolean; readonly playerX: number; readonly dz: number; readonly speed: number }): KerbGate {
  if (o.dz < -KERB_MISS_DISTANCE) return "missed";
  if (Math.abs(o.dz) > KERB_Z_WINDOW) return "approach";
  if (!o.playerDrives) return "stop";
  return Math.abs(o.playerX - KERB_STOP_X) < KERB_X_TOLERANCE && o.speed < KERB_STOP_SPEED ? "stop" : "approach";
}

/** What the hint pill tells a driving player inside the approach zone. */
export function kerbHint(o: { readonly playerX: number; readonly dz: number; readonly speed: number }): "move-to-kerb" | "slow-down" | "pull-up" {
  if (Math.abs(o.playerX - KERB_STOP_X) >= KERB_X_TOLERANCE) return "move-to-kerb";
  if (o.speed >= KERB_STOP_SPEED && o.dz < 30) return "slow-down";
  return "pull-up";
}

// ---------------------------------------------------------------- fares and scoring

export interface FareScenario {
  readonly passenger: string;
  readonly avatarColor: string;
  readonly quote: string;
  readonly pickupName: string;
  readonly pickupStreet: string;
  readonly dropoffName: string;
  readonly dropoffStreet: string;
  readonly tripMiles: number;
  readonly fareUsd: number;
  readonly parSec: number;
}

export const FARES: readonly FareScenario[] = [
  { passenger: "Maya Lin", avatarColor: "#2596be", quote: "Heading to the Montgomery pyramid. Glad an Apex caught my hail!", pickupName: "Nob Hill · Mason St", pickupStreet: "California St & Mason St", dropoffName: "Financial District · Pyramid", dropoffStreet: "Montgomery St & Washington St", tripMiles: 0.8, fareUsd: 28.5, parSec: 52 },
  { passenger: "Marcus Chen", avatarColor: "#d97706", quote: "Late for a pitch at the transit tower. Smooth and steady, please!", pickupName: "Chinatown · Grant Ave", pickupStreet: "California St & Grant Ave", dropoffName: "SoMa · Transit Tower", dropoffStreet: "Mission St & Fremont St", tripMiles: 0.9, fareUsd: 32.0, parSec: 56 },
  { passenger: "Elena Rostova", avatarColor: "#8b5cf6", quote: "Catching the ferry at the Embarcadero terminal!", pickupName: "Financial District · Kearny St", pickupStreet: "California St & Kearny St", dropoffName: "Embarcadero · Ferry Terminal", dropoffStreet: "The Embarcadero & Market St", tripMiles: 1.1, fareUsd: 36.75, parSec: 60 },
  { passenger: "Liam O'Connor", avatarColor: "#10b981", quote: "Espresso run in North Beach. Love watching the roof sensor spin!", pickupName: "Embarcadero · Pier 7", pickupStreet: "The Embarcadero & Broadway", dropoffName: "North Beach · Washington Sq", dropoffStreet: "Columbus Ave & Union St", tripMiles: 0.7, fareUsd: 24.25, parSec: 48 },
  { passenger: "Priya Nair", avatarColor: "#e11d48", quote: "Picking up a cake on Union Street. No sudden stops!", pickupName: "North Beach · Columbus Ave", pickupStreet: "Columbus Ave & Broadway", dropoffName: "Russian Hill · Union St", dropoffStreet: "Union St & Hyde St", tripMiles: 0.9, fareUsd: 30.5, parSec: 54 }
];

export interface RideOutcomeInput {
  readonly style: RideStyle;
  readonly fareUsd: number;
  readonly parSec: number;
  readonly elapsedSec: number;
  /** 0..100, reset to 100 at boarding. */
  readonly comfortScore: number;
  /** Contacts with traffic at 1.5 m/s or more during this ride. */
  readonly collisions: number;
  /** Street-style multiplier, 1..5. */
  readonly streetMultiplier: number;
}

export interface RideOutcome {
  readonly tipUsd: number;
  readonly earnedUsd: number;
  readonly stars: number;
  readonly late: boolean;
  readonly timeFactor: number;
}

const cents = (v: number): number => Math.round(v * 100) / 100;

/**
 * Tip and stars for one ride. Comfort rides tip up to 30% of the fare, scaled by comfort squared; street rides tip 8% per
 * multiplier step. Both lose the tip linearly after the par time (zero at twice par), and three or more collisions void it.
 */
export function rideOutcome(r: RideOutcomeInput): RideOutcome {
  const late = r.elapsedSec > r.parSec;
  const timeFactor = late ? clamp(1 - (r.elapsedSec - r.parSec) / r.parSec, 0, 1) : 1;
  const comfort = clamp(r.comfortScore, 0, 100) / 100;
  let tip = r.style === "comfort" ? r.fareUsd * 0.3 * comfort * comfort * timeFactor : r.fareUsd * 0.08 * clamp(r.streetMultiplier, 1, 5) * timeFactor;
  if (r.collisions >= 3) tip = 0;
  const stars = clamp(5 - Math.min(r.collisions, 2) - (late ? 1 : 0) - (r.style === "comfort" && r.comfortScore < 75 ? 1 : 0), 1, 5);
  return { tipUsd: cents(tip), earnedUsd: cents(r.fareUsd + tip), stars, late, timeFactor };
}

// ---------------------------------------------------------------- shift

export const SHIFT_FARES = 5;
export const SHIFT_SECONDS = 420;

export interface ShiftState {
  faresDone: number;
  skipped: number;
  missed: number;
  earnedUsd: number;
  starsSum: number;
  collisions: number;
  redLights: number;
  elapsedSec: number;
  over: boolean;
  reason: "fares" | "time" | null;
}

export const createShift = (): ShiftState => ({ faresDone: 0, skipped: 0, missed: 0, earnedUsd: 0, starsSum: 0, collisions: 0, redLights: 0, elapsedSec: 0, over: false, reason: null });

export function shiftAddFare(shift: ShiftState, outcome: RideOutcome): void {
  if (shift.over) return;
  shift.faresDone += 1;
  shift.earnedUsd = cents(shift.earnedUsd + outcome.earnedUsd);
  shift.starsSum += outcome.stars;
  if (shift.faresDone >= SHIFT_FARES) {
    shift.over = true;
    shift.reason = "fares";
  }
}

export function shiftTick(shift: ShiftState, dt: number): boolean {
  if (shift.over) return false;
  shift.elapsedSec += dt;
  if (shift.elapsedSec >= SHIFT_SECONDS) {
    shift.elapsedSec = SHIFT_SECONDS;
    shift.over = true;
    shift.reason = "time";
    return true;
  }
  return false;
}

/** Shift score: money earned, plus a $25 bonus for finishing all fares before the clock, minus $10 per red light run. */
export function shiftScore(shift: ShiftState): number {
  const bonus = shift.reason === "fares" ? 25 : 0;
  return Math.max(0, Math.round(shift.earnedUsd + bonus - shift.redLights * 10));
}

// ---------------------------------------------------------------- career

export interface CareerStats {
  earningsUsd: number;
  rides: number;
  starsSum: number;
  bestShiftScore: number;
}

export const CAREER_KEY = "grid-dispatch:career:v1";
export const emptyCareer = (): CareerStats => ({ earningsUsd: 0, rides: 0, starsSum: 0, bestShiftScore: 0 });

export function loadCareer(storage: Pick<Storage, "getItem"> | null | undefined): CareerStats {
  try {
    const raw = storage?.getItem(CAREER_KEY);
    if (!raw) return emptyCareer();
    const v = JSON.parse(raw) as Partial<CareerStats>;
    const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? x : 0);
    return { earningsUsd: num(v.earningsUsd), rides: Math.floor(num(v.rides)), starsSum: num(v.starsSum), bestShiftScore: num(v.bestShiftScore) };
  } catch {
    return emptyCareer();
  }
}

export function saveCareer(storage: Pick<Storage, "setItem"> | null | undefined, stats: CareerStats): void {
  try {
    storage?.setItem(CAREER_KEY, JSON.stringify(stats));
  } catch {
    /* private mode or full storage: stats stay in memory */
  }
}

export const careerRating = (c: CareerStats): number | null => (c.rides > 0 ? Math.round((c.starsSum / c.rides) * 100) / 100 : null);

// ---------------------------------------------------------------- signals

export const INTERSECTION_STRIDE_Z = 92;
export const STOP_LINE_OFFSET = 9.5;
const SIGNAL_CYCLE = 16;

/** 0 green, 1 yellow, 2 red. All intersections share one phase. */
export function signalPhase(simTime: number): 0 | 1 | 2 {
  const t = ((simTime % SIGNAL_CYCLE) + SIGNAL_CYCLE) % SIGNAL_CYCLE;
  return t < 10.5 ? 0 : t < 13 ? 1 : 2;
}

/** The stop line of the next intersection ahead (smaller z) of `z`. */
export function nextStopLineZ(z: number): number {
  return INTERSECTION_STRIDE_Z * Math.floor((z - STOP_LINE_OFFSET - 1e-6) / INTERSECTION_STRIDE_Z) + STOP_LINE_OFFSET;
}

/** The stop line crossed while moving from `prevZ` to `z` (driving towards -z), or null. */
export function crossedStopLine(prevZ: number, z: number): number | null {
  if (z >= prevZ) return null;
  const line = nextStopLineZ(prevZ);
  return line >= z ? line : null;
}

/**
 * Speed cap for a system that obeys signals: stop at the line on red, and on yellow when it can still stop comfortably
 * (4 m/s^2). Returns Infinity when the light does not constrain the car.
 */
export function signalSpeedCap(o: { readonly phase: 0 | 1 | 2; readonly distToLine: number; readonly speed: number }): number {
  if (o.phase === 0 || o.distToLine < 0 || o.distToLine > 60) return Infinity;
  const stopDist = (o.speed * o.speed) / (2 * 4);
  if (o.phase === 1 && stopDist > o.distToLine - 1.5) return Infinity;
  // the speed from which the car still stops 1.5 m before the line at 4 m/s^2
  return Math.sqrt(Math.max(0, 8 * (o.distToLine - 1.5)));
}

/** Left of the centre line the player is in the oncoming lanes. */
export const isWrongWay = (playerX: number): boolean => playerX < CENTER_LINE_X - 0.4;

// ---------------------------------------------------------------- traffic and rivals

export interface LaneBody {
  laneX: number;
  z: number;
  speed: number;
  direction: 1 | -1;
  /** Fitted length in metres. */
  length: number;
}

/** Index of the avenue lane nearest to `x`. */
export const laneIndexOf = (x: number): number => {
  let best = 0;
  for (let i = 1; i < AVENUE_LANES_X.length; i++) if (Math.abs(AVENUE_LANES_X[i]! - x) < Math.abs(AVENUE_LANES_X[best]! - x)) best = i;
  return best;
};

/**
 * Same-lane following for every road user that is not the player (traffic and AI rivals): a car never closes within
 * `gap` metres of the car ahead of it in its lane; it is held back and matches that car's speed. `player` is a leader the
 * others brake for (they slow to its speed when they close in) but never move: hitting the player stays the contact
 * system's job.
 */
export function resolveLaneFollowing(cars: LaneBody[], gap = 2.5, player?: LaneBody): void {
  const lanes = new Map<string, LaneBody[]>();
  for (const car of cars) {
    const key = `${car.direction}:${laneIndexOf(car.laneX)}`;
    let list = lanes.get(key);
    if (!list) lanes.set(key, (list = []));
    list.push(car);
  }
  for (const list of lanes.values()) {
    const dir = list[0]!.direction;
    // Leader first: the car furthest along its direction of travel.
    list.sort((a, b) => (dir === 1 ? a.z - b.z : b.z - a.z));
    for (let i = 1; i < list.length; i++) {
      const lead = list[i - 1]!;
      const car = list[i]!;
      const min = (lead.length + car.length) / 2 + gap;
      const sep = dir === 1 ? car.z - lead.z : lead.z - car.z;
      if (sep < min) {
        car.z = dir === 1 ? lead.z + min : lead.z - min;
        car.speed = Math.min(car.speed, lead.speed);
      }
    }
    // a player between two lanes (changing lanes) blocks both of them
    if (player && dir === player.direction && Math.abs(AVENUE_LANES_X[laneIndexOf(list[0]!.laneX)]! - player.laneX) < 2.4) {
      for (const car of list) {
        const sep = dir === 1 ? car.z - player.z : player.z - car.z;
        const min = (player.length + car.length) / 2 + gap;
        if (sep <= 0 || sep > min + 14) continue;
        // ease down to the player's speed over the last 14 m, and never close faster than the player inside the gap
        car.speed = Math.min(car.speed, sep < min ? player.speed * 0.9 : player.speed + (sep - min) * 0.6);
      }
    }
  }
}

/** Indices of the `n` nearest rivals, nearest first. */
export function nearestIndices(distances: readonly number[], n: number): number[] {
  return distances.map((d, i) => [d, i] as const).sort((a, b) => a[0] - b[0]).slice(0, n).map(([, i]) => i);
}

// ---------------------------------------------------------------- input

export const DRIVING_CODES: ReadonlySet<string> = new Set([
  "KeyW", "KeyA", "KeyS", "KeyD", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space", "ShiftLeft", "ShiftRight"
]);

/** Text fields keep their keys; everything else (the page, a focused dock button) drives the car. */
export function isTextEntryTarget(target: { readonly tagName?: string; readonly isContentEditable?: boolean } | null | undefined): boolean {
  const tag = target?.tagName?.toUpperCase();
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable === true;
}
