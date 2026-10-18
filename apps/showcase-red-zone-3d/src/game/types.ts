/**
 * Red Zone 3D — shared sim types & field constants.
 *
 * World units are yards: the playing surface spans z ∈ [0, 100] with
 * 10-yard end zones at either end and x ∈ [-26.65, 26.65] across the
 * 53.3-yard width. Possession carries an attack direction `dir` (+1
 * attacks the z=100 goal line, -1 attacks z=0) so the same sim code
 * serves both teams without mirroring.
 */

export type Vec3 = [number, number, number];

export const FIELD = {
  /** Sideline-to-sideline playable width (53.3 yd rounded). */
  WIDTH: 53.3,
  HALF_WIDTH: 26.65,
  /** Goal lines at z=0 and z=100; end zones extend ±10. */
  GOAL_NEAR: 0,
  GOAL_FAR: 100,
  ENDZONE_DEPTH: 10,
  /** Hash marks (high-school width keeps reads honest). */
  HASH_X: 9.0,
  /** Drive start after a change of possession via "kickoff". */
  DRIVE_START: 25,
  /** PAT/go-for-2 snaps from the 2.5-yard line. */
  PAT_SPOT: 2.5
} as const;

export type TeamSide = "off" | "def";
export type Unit = "offense" | "defense";

export type PlayPhase =
  | "idle"        // no game running (menu orbit)
  | "preSnap"     // lined up, play sheet live, waiting on the call
  | "live"        // post-snap: routes, runs, ball flight, tackles
  | "playOver"    // whistle, brief settle before next down
  | "patChoice"   // TD scored — pick auto-XP or go-for-2
  | "kickoff"     // short transition to the next drive
  | "gameOver"
  | "paused";

export type PlayType = "run" | "short" | "deep";

export interface RouteDef {
  /** Waypoints relative to alignment [dx, dz] and the time (s) the stem ends. */
  readonly stem: readonly (readonly [number, number])[];
  /** Seconds from snap until the stem is complete; after that the receiver improvs. */
  readonly stemTime: number;
  /** Yard at which the timing "window" opens for Route Lab / QB AI. */
  readonly window: readonly [number, number];
}

export interface ReceiverAlign {
  /** Slot id — determines route assignment and label. */
  readonly slot: string;
  readonly dx: number;   // alignment offset from ball at LOS
  readonly dz: number;   // depth offset (behind LOS, negative)
  readonly stance: "two" | "three";
}

export interface PlayDef {
  readonly id: string;
  readonly name: string;
  readonly type: PlayType;
  /** Route per receiver slot (only present on pass plays). */
  readonly routes?: Record<string, RouteDef>;
  /** Run-ball path for the carrier (waypoints from alignment). */
  readonly runPath?: readonly (readonly [number, number])[];
  /** Play-action delay applied to the QB drop (s). */
  readonly playAction?: number;
  /** QB timing read: preferred seconds after snap to release. */
  readonly timing: number;
}

export type CoverageShell = "cover2" | "cover3" | "man" | "blitz";

export interface Club {
  readonly id: string;
  readonly abbr: string;
  readonly name: string;
  readonly city: string;
  readonly identity: "smashmouth" | "air-raid" | "option" | "blitz-heavy" | "balanced";
  readonly colors: { readonly primary: string; readonly secondary: string; readonly pants: string; readonly helmet: string; readonly visor: string; readonly accent: string };
  /** Play-call weights [run, short, deep] summing to 1. */
  readonly callWeights: readonly [number, number, number];
  /** Preferred defensive shells in weighted order. */
  readonly defense: readonly (readonly [CoverageShell, number])[];
  /** Overall roster strength 0.7–1.0 — scales athlete attrs. */
  readonly rating: number;
}

export interface Stadium {
  readonly id: string;
  readonly label: string;
  readonly blurb: string;
  readonly turf: string;         // playing surface colour
  readonly turfAlt: string;      // mow-stripe alternate
  readonly apron: string;
  readonly endzone: string;
  readonly endzoneAlt: string;
  readonly line: string;
  readonly hoarding: string;
  readonly accent: string;
  readonly seat: string;
  readonly crowd: readonly string[];
  readonly weather: "clear" | "snow" | "rain" | "indoor";
  readonly night: boolean;
  readonly dome: boolean;
  /** Thin-air flag — balls carry farther (Altitude Bowl). */
  readonly thinAir: boolean;
  readonly breathFog: boolean;
  readonly fogColor: string;
  readonly expo: number;
}

export type GameMode = "quickplay" | "routelab" | "tacklelab" | "series" | "idle";

export interface AthleteState {
  id: string;
  slot: string;
  unit: Unit;
  /** World position on the field plane. */
  x: number;
  z: number;
  /** Facing yaw (rad). */
  yaw: number;
  speed: number;
  /** Current locomotion target for AI movers. */
  tx: number;
  tz: number;
  vx: number;
  vz: number;
  /** Pose mode consumed by the rig poser. */
  pose: "stance2" | "stance3" | "run" | "backpedal" | "throw" | "catch" | "reach" | "tackle" | "down" | "celebrate" | "block" | "idle" | "jump";
  poseT: number;
  runPhase: number;
  hasBall: boolean;
  /** Route run bookkeeping. */
  route?: RouteDef;
  routeT: number;
  coverageTarget?: string;
  engaged?: string;    // blocker<->rusher pair id
  down: boolean;       // knocked down / on the turf
  stunT: number;
  ai: "cpu" | "user";  // who steers this athlete
  attrs: { speed: number; power: number; hands: number; aware: number };
}

export interface BallState {
  kind: "held" | "air" | "loose" | "dead";
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  holder?: string;
  targetId?: string;   // intended receiver (for AI + catch window)
  aimX: number;
  aimZ: number;
  flightT: number;
  eta: number;
  thrownAt?: number;
  pickBonus?: boolean; // a defender used ball-hawk during this flight
}

export interface ScoreState {
  home: number;
  away: number;
}

export interface GameState {
  mode: GameMode;
  phase: PlayPhase;
  venue: string;
  quarter: number;       // 1..4, 5 = OT
  clock: number;         // seconds remaining in quarter
  clockRunning: boolean;
  down: number;          // 1..4
  toGo: number;          // yards to first down
  los: number;           // line of scrimmage (absolute z)
  firstDownLine: number; // absolute z to reach
  dir: 1 | -1;           // attack direction of the offense
  possession: "user" | "cpu";
  ballSpotX: number;
  userTeam: Club;
  cpuTeam: Club;
  score: ScoreState;     // user is always "home" in the HUD bug
  athletes: AthleteState[];
  ball: BallState;
  play?: { def: PlayDef; card: number };
  coverage: CoverageShell;
  snapT: number;         // time since snap
  throwCharge: number;   // 0..1 power build-up
  aim: { x: number; z: number; target?: string };
  overReason: string;
  lastCall: string;
  lastGain: number;
  ot: boolean;
  gameT: number;
  userControlled?: string;   // athlete id the user steers
  carrier?: string;
  qbId?: string;
  pressure: number;
  series?: SeriesState;
  labScore?: { made: number; total: number; perfect: number; rep: number; reps: number; grade: string };
  studio: StudioState;
  stats: { passYds: number; rushYds: number; plays: number; turnovers: number; sacks: number; ints: number; fumbles: number; tds: number };
}

export interface StudioState {
  clubId: string;
  jersey: string;
  pants: string;
  helmet: string;
  visor: string;
}

export interface SeriesGame {
  a: number;  // club index or -1 user / -2 tbd
  b: number;
  winner: number;   // club index, -1 user, -2 undecided
  scoreA: number;
  scoreB: number;
}

export interface SeriesState {
  active: boolean;
  round: number;               // 0..4  (R32,R16,QF,SF,F)
  bracket: SeriesGame[][];     // [round][game]
  seed: number[];              // seeded club indices for the 32 entrants
  userSeedSlot: number;
  nextGame?: { opponent: number; round: number };
  eliminated: boolean;
  champion: boolean;
}

export interface SimEvents {
  call(type: string, label: string, severity?: "info" | "success" | "warn", value?: number): void;
  juice(event: string, at?: { position?: Vec3; strength?: number }): void;
  bigCall(text: string): void;
  cue(name: string): void;
}

export interface SimCommand {
  moveX?: number;       // -1..1 lateral (field x)
  moveZ?: number;       // -1..1 downfield (attack dir applied by sim)
  pickCard?: number;    // 0..2
  audible?: boolean;
  snap?: boolean;
  throwHeld?: boolean;
  throwPressed?: boolean;
  throwReleased?: boolean;
  throwReceiverIndex?: number;
  juke?: boolean;
  truck?: boolean;
  dive?: boolean;
  tackle?: boolean;
  hitStick?: boolean;
  ballHawk?: boolean;
  patKick?: boolean;    // choose XP
  patGo?: boolean;      // choose go-for-2
  pause?: boolean;
}
