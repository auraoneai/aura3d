// Aura FC 3D — shared spec types.
//
// The pitch lies on the XZ plane: length along X (goal lines at ±PITCH_HX),
// width along Z (touchlines at ±PITCH_HZ). Broadcast camera lives on +Z.
// `sim.ts` owns the authoritative match state; `ai.ts` produces the same
// `PlayerCommand` shape the user's input produces, so one mechanic path
// drives both humans and the CPU.

export type Vec3 = readonly [number, number, number];

export type TeamId = 0 | 1;
export type Role = "GK" | "DF" | "MF" | "FW";

/** Possession state machine — the PRD's dribble/loose/controlled/flight set. */
export type BallMode = "dribble" | "loose" | "flight" | "controlled" | "held" | "dead";

export type MatchPhase =
  | "idle"        // menu / not started
  | "kickoff"     // centred, short countdown
  | "live"        // open play
  | "goal"        // goal celebration
  | "restart"     // kick-in / corner / goal-kick placement
  | "halftime"    // interval banner
  | "extratime"   // golden-goal period countdown
  | "shootout"    // penalty series
  | "ended";      // full time / winner decided

export type ModeId = "menu" | "quick" | "shootout" | "touch";

export type VenueId = "favela" | "munich" | "lagos" | "kyoto" | "uyuni" | "glacier";

export type ClubId =
  | "aurora" | "kings" | "iron" | "waves"
  | "kites" | "stars" | "giants" | "storm";

export type CelebrationId = "knee" | "spin" | "leap" | "heart";

export type SkillKind = "none" | "stepover" | "chop";

export interface PlayerState {
  readonly id: string;            // "h-gk" | "h-df0" | ... | "a-fw"
  readonly team: TeamId;
  readonly role: Role;
  readonly anchor: [number, number]; // formation home (attacking-normalised, team-space)
  x: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;                    // facing, 0 = +X
  speed: number;                  // current planar speed
  stamina: number;                // 0..1
  slideT: number;                 // >0 while sliding (seconds remaining)
  slideDir: [number, number];     // unit slide direction
  slideCooldown: number;
  kickT: number;                  // kick animation timer (counts to 0)
  kickDur: number;                // total duration of the current/last kick swing (s)
  kickPower: number;              // last kick power for anim
  skillT: number;
  skill: SkillKind;
  celebrateT: number;
  celebrateKind: number;
  diveT: number;                  // keeper dive timer
  diveDir: number;                // -1 / +1 across goal mouth
  diveVx: number;                 // committed dive velocity (z)
  stunT: number;                  // brief recovery after being beaten
  controlled: boolean;            // user-controlled flag (render ring)
  isKeeper: boolean;
  trapT: number;                  // first-touch control window
  holdT: number;                  // keeper holding the ball
  gait: number;                   // run-cycle phase
}

export interface BallState {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  rotX: number;
  rotY: number;
  rotZ: number;
  quat: [number, number, number, number]; // orientation (x, y, z, w); rotX/rotY/rotZ are its ZYX Euler for the renderer
  spin: number;                   // sidespin rad/s — curl
  rolling: boolean;               // on the ground, rolling (friction regime, no bounces)
  lastKickPower: number;          // power of the last completed strike (evidence)
  lastKickFootDist: number;       // kicking-foot ↔ ball distance at the contact frame (m)
  lastKickT: number;              // simT stamp of the last completed strike (-1 = none)
  mode: BallMode;
  ownerId: string | null;
  lastTouchTeam: TeamId | null;
  intendedTargetId: string | null;
  shotPower: number;              // of last shot, for fx
  freeT: number;                  // seconds since released
  kickerId: string | null;        // who struck it — brief self-retrap immunity
  lastToucherId: string | null;   // last player to touch/kick (goal credit)
  controlT: number;               // remaining controlled (trap) time
  lastShot: "none" | "pass" | "driven" | "shot" | "clearance" | "cross";
  trail: Vec3[];
}

export interface ShootoutState {
  round: number;                  // 1..5 then sudden death
  takerTeam: TeamId;
  scores: [number, number];
  taken: [number, number];
  stage: "walkup" | "aim" | "kick" | "decided" | "done";
  stageT: number;
  aim: [number, number];          // placement target in goal mouth (z, y)
  power: number;
  resultText: string;
  gkDive: number;                 // keeper's committed dive side (-1/0/1)
  pendingMiss: boolean;           // flagged by firePenalty when the shot misses the frame
  log: [("in" | "out")[], ("in" | "out")[]]; // per-team kick results in order (HUD ledger)
}

export interface MatchState {
  mode: ModeId;
  phase: MatchPhase;
  phaseT: number;
  simT: number;                   // monotonic sim clock (never resets — kick timing evidence)
  half: 1 | 2 | 3;                // 3 = golden-goal extra
  clock: number;                  // seconds elapsed in current half
  score: [number, number];
  attackSign: [number, number];   // +1 = attacks +X goal; flips at halftime
  ball: BallState;
  players: PlayerState[];
  userTeam: TeamId | null;        // null → CPU vs CPU (demo)
  controlledId: string | null;
  possession: [number, number];   // accumulated seconds
  possessionTeam: TeamId | null;
  shotsOn: [number, number];
  saves: [number, number];
  corners: [number, number];
  kicks: number;                  // total kicks — evidence counter
  paused: boolean;
  goldenGoal: boolean;
  winner: TeamId | null;
  shootout: ShootoutState | null;
  venue: VenueId;
  kickoffTeam: TeamId;
  restartSpot: [number, number] | null;
  restartTeam: TeamId | null;
  restartKind: "kickin" | "corner" | "goalkick" | "kickoff" | null;
  restartT: number;
  goalFlashT: number;
  lastScorer: string | null;
}

/** One frame of intent for a player — identical shape for human and CPU. */
export interface PlayerCommand {
  move: [number, number];         // desired world-space move dir (unit)
  sprint: boolean;
  pass?: "short" | "driven";
  passTo?: string;                // CPU pass: the receiver it chose (the user's pass is picked from the aim)
  shoot?: number;                 // 0..1 power (released shot); undefined = no shot
  shootAim?: { lateral: number; lift: number }; // -1..1 mouth offset, 0..1 height
  skill?: "stepover" | "chop";
  slide?: boolean;
  dive?: number;                  // keeper dive: -1 or +1
  keeperRush?: boolean;
}

export interface UserInputFrame {
  move: [number, number];
  sprint: boolean;
  passShort: boolean;
  passDriven: boolean;
  shootHeld: boolean;
  shootReleased: boolean;
  skillStepover: boolean;
  skillChop: boolean;             // doubles as slide on defense
  switchPlayer: boolean;
  pause: boolean;
}

/** Match configuration handed to the sim by a mode controller. */
export interface MatchConfig {
  mode: ModeId;
  venue: VenueId;
  homeClub: ClubId;
  awayClub: ClubId;
  userTeam: TeamId | null;        // null → demo/CPU-vs-CPU
  difficulty: number;             // 0..1 press + reaction scaling
  circuitTag?: string;            // e.g. "R16", "QF" — HUD ribbon label
  goldenGoal: boolean;            // tie → golden-goal extra time
  shootoutOnTie: boolean;         // …and penalties after that
  seed?: number;                  // match RNG seed (default: SIM_SEED stepped per match)
}

/** Discrete sim events — ticker/juice/audio consume these. */
export interface SimEvent {
  type:
    | "kickoff" | "goal" | "own-goal" | "save" | "post" | "out"
    | "corner" | "goalkick" | "throwin" | "halftime" | "fulltime"
    | "extratime" | "shootout-start" | "penalty" | "pen-goal" | "pen-save" | "pen-miss"
    | "tackle" | "skill" | "shot" | "pass" | "catch" | "whistle" | "crossbar"
    | "bounce" | "wall" | "celebrate";
  team?: TeamId;
  playerId?: string;
  label: string;
  severity?: "info" | "success" | "warn";
  position?: Vec3;
  value?: number;
}

export interface CircuitMatch {
  stage: "group" | "r16" | "qf" | "sf" | "final";
  groupIndex?: number;
  opponentName: string;
  opponentClub: ClubId;
  difficulty: number;
  mustWin: boolean;
}

export interface DrillScore {
  label: string;
  value: number;
}
