/**
 * Pure fixed-timestep simulation state. Source of truth for field names is public/toptennis/match-engine.js
 * (`state`, `makePlayer`, `makeBall`, `awardPoint`) and physics.js. A port module may ADD fields but must not rename
 * or change the meaning of these, because the reference capture and replay tests key on them.
 * Coordinates: x lateral, y along court (player end positive, rival end negative), z height; normalised units (units.ts).
 */
export type Side = "player" | "ai";
export type Surface = "hard" | "grass" | "clay";
export type Difficulty = "beginner" | "club" | "ace" | "pro" | "legend";
export type ShotPreset = "neutral" | "short" | "deep" | "lob";
export type StrokeKind = "forehand" | "backhand" | "forehand-volley" | "backhand-volley" | "smash" | "serve";
export type MatchMode = "menu" | "playing" | "gameover";
export type Phase = "menu" | "serve" | "serveToss" | "serveFault" | "rally" | "point" | "practiceFeed" | "practiceResult" | "complete";
export type Controller = "human" | "computer";

export interface BallState {
  x: number; y: number; z: number;
  vx: number; vy: number; vz: number;
  active: boolean; dead: boolean; settling: boolean; rolling: boolean;
  lastHit: Side | null;
  bounceCount: number;
  crossedNet: boolean;
  targetX: number | null; targetY: number | null;
  isServe: boolean; defensiveLob: boolean; highDeepLob: boolean; netTouched: boolean;
  speedKph: number;
  shotType?: ShotPreset | "serve";
  stroke?: StrokeKind;
  proDrop?: number;
  trail: Array<{ x: number; y: number; z: number }>;
}

export interface ActorState {
  side: Side;
  id: "p1" | "p2";
  /** +1 for the near (player) end, -1 for the far end. */
  end: 1 | -1;
  controller: Controller;
  x: number; y: number; vx: number; vy: number;
  targetX: number; targetY: number;
  energy: number; energyRecoveryDelay: number; powerDeniedUntil: number;
  selectedShot: ShotPreset; queuedShot: ShotPreset; queuedAim: number; queuedPower: boolean; aimRemaining: number;
  swing: number; swingAge: number; swingCooldown: number; swingPressAt: number | null;
  serveMotion: number; strokeConnected: boolean; contactFlash: number;
  stroke: StrokeKind; racketSide: 1 | -1; strokeContactAge: number; strokeContactZ: number;
  /** Presentation drivers the pose solver reads; they never influence gameplay. */
  stride: number; moveBlend: number; facing: number; lean: number; splitStep: number; recovery: number;
  reactionTimer: number; trackingTimer: number;
  readTarget: { x: number; y: number }; readErrorX: number; readErrorY: number;
  stats: ActorStats;
  /** Roster profile id and appearance are Phase 2 data but travel in the state so snapshots stay complete. */
  profileId?: string;
  appearance?: Record<string, unknown>;
}

export interface ServeStats { aces: number; faults: number; doubleFaults: number; pointsPlayed: number; pointsWon: number; unreturned: number; returnErrors: number; [k: string]: number }
export interface ActorStats { pointsWon: number; pointsLost: number; longestRally?: number; fastestShot?: number; serve: ServeStats }

export interface ScoreState { playerPoints: number; aiPoints: number; playerGames: number; aiGames: number }

export type ServeResult = "ace" | "returnError" | "pointWon" | "pointLost" | "fault" | "doubleFault" | "let";
export interface ServeAttempt {
  server: Side;
  /** 1 or 2. */
  number: 1 | 2;
  tossAt: number | null; swingAt: number | null; contactAt: number | null;
  aim: { x: number; y: number }; lockedAim?: { x: number; y: number };
  power: boolean; legal?: boolean; counted?: boolean; pointCounted?: boolean; receiverTouched?: boolean;
  result?: ServeResult; swipeStrength?: number;
  expected?: { x: number; y: number }; actual?: { x: number; y: number };
}

export interface MatchState {
  mode: MatchMode; paused: boolean; phase: Phase;
  difficulty: Difficulty; venue: string;
  /** Simulation seconds since match start (not wall clock) and the fixed tick counter. */
  time: number; tick: number;
  rallyTime: number; rallyHits: number;
  server: Side; firstServer: Side; serveNumber: 1 | 2; serveCourt: "deuce" | "ad"; serveSequence: number;
  serveAttempt: ServeAttempt | null; lastServe: ServeAttempt | null; serveHistory: ServeAttempt[];
  pointDelay: number; serveDelay: number; pointWinner: Side | null; lastCall: string; message: string; messageTimer: number;
  tiebreak: boolean; tiebreakFirstServer: Side; matchWon: boolean; winner?: Side;
  score: ScoreState;
  stats: ActorStats;
  player: ActorState; ai: ActorState; ball: BallState; retiringBall: (BallState & { fade: number }) | null;
  particles: Array<Record<string, unknown>>; marks: Array<Record<string, unknown>>;
  screenShake: number;
  lastShotType: string; lastStroke: string; lastShotSpeed: number; lastTiming: string; lastShotPower: boolean;
  /** Present only in practice mode / swipe mode; kept as optional blocks exactly like the source. */
  practice?: Record<string, unknown>;
  swipe?: Record<string, unknown>;
  outFeedback: Record<string, unknown> | null;
  eventId?: string;
}

/** Match rules as implemented by awardPoint: 4 points win by 2, first to 3 games win by 2, 3-3 triggers a tiebreak to 7 win by 2. */
export const MATCH_RULES = Object.freeze({
  pointsToGame: 4, winBy: 2, gamesToMatch: 3, tiebreakAt: 3, tiebreakPoints: 7, pointResultDelay: 1.65, matchWonDelay: 2,
} as const);

export const other = (side: Side): Side => (side === "player" ? "ai" : "player");
