/**
 * Aura Links 3D — shared game contract.
 *
 * Every module in `src/game/` writes against these types and ONLY these types:
 *  - `courses.ts`   → course/hole data + `buildHoleTerrain` (single source of
 *                     truth for ground height + surface zone, consumed by both
 *                     the sim and the scene builder so visual === physical)
 *  - `sim.ts`       → pure golf logic: clubs, three-click swing meter, ball
 *                     flight/roll integrator, scoring, AI, Pro Circuit bracket
 *  - `rig.ts`       → golfer primitive rig + pose driver (address/swing/etc.)
 *  - `main.ts`      → engine scene, camera, HUD/menu wiring, evidence
 *
 * Units: metres, seconds, radians. World frame per hole: +Z points from the
 * tee toward the green (the "line of play"), +X is lateral (right of line),
 * +Y up. The tee box sits near local origin; all hole-local geometry uses
 * this frame. No three.js imports anywhere in src/game/.
 */

export type Vec2 = readonly [number, number];
export type Vec3 = readonly [number, number, number];

/* ------------------------------------------------------------------ *
 *  Courses & holes                                                    *
 * ------------------------------------------------------------------ */

export type CourseId =
  | "stAuroras" // Scottish dunes links — morning fog, marram rough
  | "mapleHollow" // parkland — pines, ponds, autumn accents
  | "cinderRim" // volcanic rim — amber/ash, hardpan, lava rock
  | "cloudTerrace" // alpine terraces — thin air (drives carry farther)
  | "neonBay" // saturated night city — floodlit turf, skyline backdrop
  | "mareCourse"; // exotic — lunar sea-of-tranquility, 1/6 gravity

export type LookId =
  | "outdoor-day"
  | "golden-hour"
  | "overcast"
  | "night-city"
  | "polar-night"
  | "alpine-snow"
  | "interior-warm"
  | "interior-neutral"
  | "interior-industrial"
  | "space"
  | "underwater";

export interface CoursePalette {
  /** DOM/CSS accent for HUD chips + fairway tint families */
  readonly accent: string;
  readonly fairway: string;
  readonly rough: string;
  readonly green: string;
  readonly sand: string;
  readonly water: string;
  readonly teeBox: string;
  readonly fringe: string;
}

export interface CourseSpec {
  readonly id: CourseId;
  readonly name: string;
  readonly shortName: string;
  readonly tagline: string;
  readonly look: LookId;
  /** exposure/fog/background tweaks passed to looks.preset overrides */
  readonly lookOverrides?: {
    readonly fogDensityScale?: number;
    readonly exposureEv?: number;
    readonly background?: string;
  };
  /** gravity in m/s² — Mare = 1.62, everything else 9.81 (Cloud Terrace uses
   *  reduced airDensity instead of touching g) */
  readonly gravity: number;
  /** air density factor on carry drag (Cloud Terrace ≈ 0.78) */
  readonly airDensity: number;
  /** base wind speed m/s + direction jitter between shots */
  readonly wind: { readonly baseSpeed: number; readonly gust: number };
  readonly palette: CoursePalette;
  readonly holes: readonly HoleSpec[];
  /** dressing hints consumed by the scene builder */
  readonly dressing: CourseDressing;
}

export type CourseTheme = "dunes" | "parkland" | "volcanic" | "alpine" | "nightCity" | "lunar";

export interface CourseDressing {
  readonly theme: CourseTheme;
  /** catalog asset keys main.ts may scatter (trees, rocks, buildings, props) */
  readonly flora: readonly string[];
  readonly landmarks: readonly string[];
}

export interface HoleSpec {
  readonly number: number; // 1..9
  readonly name: string;
  readonly par: 3 | 4 | 5;
  /** stroke index 1 (hardest) .. 9 (easiest), unique per course */
  readonly handicap: number;
  /** nominal tee→cup distance in metres along the hole axis */
  readonly lengthM: number;
  readonly layout: HoleLayout;
}

/**
 * Authored hole layout in hole-local metres. `path` is the intended line of
 * play from tee [0,0] to cup; doglegs curve it. The terrain builder turns
 * this into a heightfield + zone map.
 */
export interface HoleLayout {
  /** line-of-play control points; first ≈ [0,0] (tee), last = cup */
  readonly path: readonly Vec2[];
  readonly fairwayWidth: number;
  readonly greenRadius: number;
  readonly teePos: Vec2;
  readonly bunkers: readonly { readonly center: Vec2; readonly radius: number }[];
  readonly water: readonly { readonly center: Vec2; readonly radius: number }[];
  /** dense rough/tree clusters that also spawn flora props */
  readonly woods: readonly { readonly center: Vec2; readonly radius: number }[];
  /** elevation control samples along path param t∈[0,1] → metres up/down */
  readonly elevation: readonly { readonly t: number; readonly height: number }[];
  /** base break applied to the green surface (metres of tilt across green) */
  readonly greenBreak: Vec2;
  /** amplify dune/bump noise outside fairway (0 = flat parkland) */
  readonly roughAmp: number;
}

/* ------------------------------------------------------------------ *
 *  HoleTerrain — single source of truth for the playing surface       *
 * ------------------------------------------------------------------ */

export type LieKind = "tee" | "green" | "fairway" | "fringe" | "rough" | "sand" | "water" | "oob" | "rock";

export interface HoleTerrain {
  /** turf height (metres) at world (x,z) */
  height(x: number, z: number): number;
  /** dominant surface zone at world (x,z) */
  zone(x: number, z: number): LieKind;
  /** surface normal estimate (for bounce deflection + green reads) */
  slope(x: number, z: number): Vec2;
  /** metres from (x,z) to cup centre on the ground plane */
  cupDistance(x: number, z: number): number;
  /** cup centre — y = turf height there */
  readonly cup: Vec3;
  /** ball spawn on the tee box */
  readonly tee: Vec3;
  /** aim yaw in radians pointing straight down the intended line */
  readonly lineYaw: number;
  /** terrain bounds for mesh generation + OOB shell */
  readonly bounds: { readonly minX: number; readonly maxX: number; readonly minZ: number; readonly maxZ: number };
  /** samples a height grid for mesh building (columns×rows, row-major) */
  grid(columns: number, rows: number): { readonly heights: Float32Array; readonly zones: Uint8Array };
}

export const ZONE_ORDER: readonly LieKind[] = ["tee", "green", "fringe", "fairway", "rough", "sand", "water", "rock", "oob"];

/* ------------------------------------------------------------------ *
 *  Clubs & swing                                                      *
 * ------------------------------------------------------------------ */

export type ClubId = "driver" | "wood" | "hybrid" | "iron" | "wedge" | "putter";

export interface ClubSpec {
  readonly id: ClubId;
  readonly label: string;
  /** nominal full-power carry in metres (calm air, flat lie) */
  readonly carry: number;
  /** launch angle above horizon, degrees */
  readonly launchDeg: number;
  /** backspin factor: high = stops fast on greens, curves more in wind */
  readonly spin: number;
  /** post-landing rollout multiplier on residual speed */
  readonly roll: number;
  /** loft display order (smaller = hits longer) */
  readonly order: number;
  readonly putter?: boolean;
}

/** result quality of the accuracy click, -1 (heavy miss) .. 0 (perfect) .. +1 */
export type AccuracyResult = number;
/** spin set by the third click: -1 draw .. +1 fade, magnitude = strength */
export type SpinResult = number;

export type SwingPhase = "idle" | "power" | "accuracy" | "spin" | "committed";

export interface SwingState {
  readonly phase: SwingPhase;
  /** current meter cursor 0..1 while sweeping */
  readonly meter: number;
  readonly power: number | null;
  readonly accuracy: AccuracyResult | null;
  readonly spin: SpinResult | null;
  /** direction the meter cursor is travelling this phase */
  readonly sweepDir: 1 | -1;
}

/** what the third click produces — everything launchShot needs */
export interface ShotCommit {
  readonly club: ClubSpec;
  readonly power: number;
  readonly accuracy: AccuracyResult;
  readonly spin: SpinResult;
  readonly aimYaw: number;
}

/* ------------------------------------------------------------------ *
 *  Ball flight                                                        *
 * ------------------------------------------------------------------ */

export type BallStatus = "flight" | "roll" | "rest" | "holed" | "water" | "oob";

export interface BallState {
  readonly pos: Vec3;
  readonly vel: Vec3;
  /** lateral spin factor carried from the shot (-1..1) */
  readonly curve: number;
  /** vertical-axis spin residue that checks the first green bounce */
  readonly backspin: number;
  readonly status: BallStatus;
  /** total carry covered (flight only), metres */
  readonly carry: number;
  readonly bounces: number;
}

export type BallEvent =
  | { readonly kind: "bounce"; readonly pos: Vec3; readonly zone: LieKind }
  | { readonly kind: "rollout"; readonly pos: Vec3; readonly zone: LieKind }
  | { readonly kind: "rest"; readonly pos: Vec3; readonly zone: LieKind }
  | { readonly kind: "holed"; readonly pos: Vec3 }
  | { readonly kind: "lip"; readonly pos: Vec3 }
  | { readonly kind: "water"; readonly pos: Vec3 }
  | { readonly kind: "oob"; readonly pos: Vec3 }
  | { readonly kind: "tree"; readonly pos: Vec3 };

export interface ShotEnv {
  readonly terrain: HoleTerrain;
  readonly gravity: number;
  readonly airDensity: number;
  readonly wind: WindState;
  readonly lie: LieKind;
  /** rough/sand contact quality multiplies effective power (0.7–1) */
  readonly liePenalty: number;
}

export interface WindState {
  /** m/s */
  readonly speed: number;
  /** radians — direction wind blows TOWARD, same frame as aimYaw */
  readonly yaw: number;
}

/* ------------------------------------------------------------------ *
 *  Scoring & modes                                                    *
 * ------------------------------------------------------------------ */

export interface HoleScore {
  readonly hole: number;
  readonly par: number;
  readonly strokes: number;
  readonly putts: number;
  /** "eagle"|"birdie"|"par"|"bogey"|"double"|"triple+"|null while open */
  readonly label: string;
}

export interface ScoreCard {
  readonly courseId: CourseId;
  readonly holes: readonly HoleScore[];
  readonly totalStrokes: number;
  readonly totalPar: number;
  readonly toPar: number;
  /** skins mode purse — carried skins won */
  readonly skins: number;
}

export type GameModeId = "quick" | "rangelab" | "puttinglab" | "tour" | "studio";

export type DifficultyId = "amateur" | "pro" | "legend";

export interface LabScore {
  readonly mode: "rangelab" | "puttinglab";
  readonly attempts: number;
  readonly hits: number;
  readonly best: number;
  readonly streak: number;
}

/* ------------------------------------------------------------------ *
 *  Pro Circuit (32-player medal bracket)                              *
 * ------------------------------------------------------------------ */

export interface TourRival {
  readonly seed: number;
  readonly name: string;
  readonly skill: number; // 0..1
  readonly eliminated: boolean;
  readonly score: number; // toPar across completed rounds
}

export type TourRound = "r32" | "r16" | "qtr" | "semi" | "final" | "champion";

export interface TourState {
  readonly rivals: readonly TourRival[];
  readonly round: TourRound;
  readonly playerAlive: boolean;
  readonly playerScore: number;
  /** per-round pairing result rows for the bracket DOM */
  readonly results: readonly { readonly round: TourRound; readonly name: string; readonly score: number; readonly advanced: boolean }[];
}

/* ------------------------------------------------------------------ *
 *  Player Studio                                                      *
 * ------------------------------------------------------------------ */

export interface GolferFit {
  readonly polo: string;
  readonly cap: string;
  readonly skin: string;
  readonly trail: string;
}

/* ------------------------------------------------------------------ *
 *  Module surface summary (kept in comments — the contract itself)    *
 * ------------------------------------------------------------------ *
 *
 * courses.ts must export:
 *   export const COURSES: Record<CourseId, CourseSpec>
 *   export const COURSE_ORDER: readonly CourseId[]
 *   export function buildHoleTerrain(course: CourseSpec, hole: HoleSpec): HoleTerrain
 *   — deterministic per (course.id, hole.number): seeded noise, no Math.random
 *
 * sim.ts must export:
 *   export const CLUBS: Record<ClubId, ClubSpec>
 *   export const CLUB_ORDER: readonly ClubId[]
 *   export function createSwingMeter(): { state(): SwingState; press(): SwingState; tick(dt): SwingState; reset(): void }
 *   export function launchBall(commit: ShotCommit, env: ShotEnv): BallState
 *   export function stepBall(ball: BallState, env: ShotEnv, dt: number): { ball: BallState; events: BallEvent[] }
 *   export function suggestClub(lie: LieKind, dist: number): ClubId
 *   export function liePenalty(lie: LieKind): number
 *   export function rollWind(course: CourseSpec, rng: () => number): WindState
 *   export function createScoreCard(course: CourseSpec): ScoreCard
 *   export function recordHole(card: ScoreCard, hole: HoleSpec, strokes: number, putts: number): ScoreCard
 *   export function scoreLabel(par: number, strokes: number): string
 *   export function createTour(seed?: number): TourState
 *   export function advanceTour(tour: TourState, playerToPar: number): TourState
 *   export function aiHoleScore(par: number, skill: number, rng: () => number): number
 *   export function makeRng(seed: number): () => number
 *
 * rig.ts must export:
 *   export interface GolferRig { <node handles> }
 *   export function buildGolferNodes(fit: GolferFit): any[]   // engine node builders
 *   export function resolveGolferRig(app: any): GolferRig
 *   export type GolferPhase = "address"|"backswing"|"top"|"downswing"|"follow"|
 *     "celebrate"|"walk"|"idle"|"putt"|"putt-address"|"putt-back"|"putt-through"
 *   export function poseGolfer(rig: GolferRig, phase: GolferPhase, t: number, at: Vec3, faceYaw: number, heightFn?): void
 *   export function golferTelemetry(): { phase, t, clubHeadWorld, gripWorld, ballWorld, impactDistance, attached }
 * plus swingMath.ts (pure, no engine imports):
 *   evaluateSwing(phase, t) → trajectory key; solveSwing(key, root) → bone
 *   rotations + club telemetry; clubAttachOffsets(...) → bone-space offsets
 *   for animation.attach (club socketed to the right forearm palm)
 */
