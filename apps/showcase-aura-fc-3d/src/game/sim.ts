// Aura FC 3D — the match simulation.
//
// Owns the authoritative state for the 5v5 game: player movement, the ball
// sim (dribble-stick / loose / flight / controlled / held / dead), restarts,
// halves + golden-goal + shootout flow, and the shootout penalty machinery.
// AI intent arrives as the same `PlayerCommand` the user input produces —
// one mechanics path for everyone.

import type {
  BallState, MatchConfig, MatchState, PlayerCommand, PlayerState,
  SimEvent, TeamId, UserInputFrame, Vec3
} from "./types";
import { VENUES } from "./content";
import { stepFreeBall, spinBall, ROLL_DECEL } from "./ballPhysics";
import { planCommand } from "./ai";

/* ------------------------------------------------------------------ *
 *  Dimensions live in ./dims (shared with ai.ts + scene.ts)           *
 * ------------------------------------------------------------------ */

export {
  PITCH_HX, PITCH_HZ, GOAL_HALF_W, GOAL_H, GOAL_DEPTH, BOX_DEPTH, BOX_HALF_W,
  PEN_X, CIRCLE_R, BALL_R, BALL_VIS_R
} from "./dims";
import {
  PITCH_HX, PITCH_HZ, GOAL_HALF_W, GOAL_H, PEN_X, BALL_R,
  HALF_LEN, ET_LEN, RUN_SPEED, SPRINT_SPEED, GK_SPEED, ACCEL,
  TRAP_R, TRAP_H, SLIDE_TIME, SLIDE_SPEED, KEEPER_REACH
} from "./dims";

/* ------------------------------------------------------------------ */

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const len2 = (x: number, z: number) => Math.hypot(x, z);
const dist2 = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);
const norm2 = (x: number, z: number): [number, number] => {
  const l = Math.hypot(x, z);
  return l > 1e-5 ? [x / l, z / l] : [0, 0];
};
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/* ---------------------- ball physics constants ---------------------- *
 * Kick launch profiles: the foot drives the ball — velocity applies at the
 * contact frame of the swing (74% through), never on a timer. Speeds are
 * believable football figures; long passes/shots leave the foot on a lofted
 * arc (launch angle per kick type). */
const KICK_MIN_TAP = 0.24;        // compact tap swing duration (s)
const KICK_RANGE_T = 0.14;        // + full-power backswing/follow-through
const KICK_CONTACT_FRAC = 0.74;   // fraction of the swing when the boot meets the ball
const KICK_PLANT_RATE = 34;       // 1/s: braking of the kicker during a swing
const KICK_TURN_RATE = 30;        // 1/s: turn toward the kick direction during a swing
const FOOT_AHEAD = 0.34;          // kicking-side foot, ahead of body centre (m)
const FOOT_SIDE = 0.14;           // kicking-side foot, lateral offset to the right boot (m)
/** CPU keeper penalty read: chance to pick the right side = base + (1 - power) * soft. Tuned so both sides convert about 70%. */
const PEN_READ_BASE = 0.24;
const PEN_READ_SOFT = 0.22;
/** Open-play keeper gather radius (m) standing / extra while diving. */
const OPEN_KEEPER_REACH = 0.6;
const OPEN_DIVE_REACH = 0.45;
const CPU_BACKPASS_PENALTY = 6;
/** Seconds a keeper holds a gathered ball before he distributes it. */
const KEEPER_HOLD = 0.6;
const PASS_ARRIVE = 5.2;          // weighted ground pass: speed left when it reaches the receiver (m/s)
const DRIVEN_ARRIVE = 7.0;

/** A kick in progress: the swing carries the ball until the contact frame. */
interface PendKick {
  dir: [number, number];          // unit horizontal launch direction
  power: number;                  // 0..1
  kind: BallState["lastShot"];
  spin: number;
  targetId: string | null;
  aimLiftDeg: number;             // extra loft for aimed shots (degrees)
  targetDist: number;             // distance to the receiver's lead point (0 = none): weights ground passes
  T: number;                      // swing duration
  contactAt: number;              // elapsed seconds until the boot reaches the ball
  minFootDist: number;            // closest foot↔ball approach before contact (evidence)
}

/** deterministic per-match RNG (LCG). Every random draw in the sim and the AI goes through it. */
export const SIM_SEED = 0xf0a7ba11;
export function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

/**
 * Launch angle (degrees) at which a ball struck at `speed` m/s crosses a line `dist` m away at height `h` m, ignoring
 * drag (the 7 m penalty flight loses well under 0.1 m to it). Bisection on the rising branch of the arc, 0..40 degrees.
 */
export function penaltyLoftDeg(speed: number, dist: number, h: number): number {
  const g = 9.81;
  const yAt = (deg: number) => {
    const a = (deg * Math.PI) / 180;
    const c = Math.cos(a);
    return BALL_R + dist * Math.tan(a) - (g * dist * dist) / (2 * speed * speed * c * c);
  };
  let lo = 0, hi = 40;
  for (let i = 0; i < 40; i++) {
    const mid = (lo + hi) / 2;
    if (yAt(mid) < h) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

/** Does a just-launched shot's drag-free path cross the goal line at `goalX` inside the frame? */
export function shotOnTarget(b: { x: number; y: number; z: number; vx: number; vy: number; vz: number }, goalX: number): boolean {
  if (Math.sign(b.vx) !== Math.sign(goalX) || Math.abs(b.vx) < 0.5) return false;
  const t = (goalX - b.x) / b.vx;
  if (t <= 0) return false;
  const z = b.z + b.vz * t;
  const y = b.y + b.vy * t - 4.905 * t * t;
  return Math.abs(z) < GOAL_HALF_W && y < GOAL_H;   // a low strike that bounces in still counts
}

/* ------------------------------------------------------------------ */

export interface Sim {
  readonly state: MatchState;
  /** 0..1 while the user is charging a shot — drives the HUD meter. */
  readonly chargeLevel: number;
  readonly autopilot: boolean;
  setAutopilot(on: boolean): void;
  /** Assist: with no stick input the user's player chases a loose ball and dribbles at goal (off by default). */
  readonly assist: boolean;
  setAssist(on: boolean): void;
  /** Seed of the current match RNG (published in the route evidence). */
  readonly seed: number;
  /** Celebration the user's scorers perform (Player Studio). */
  setUserCelebration(kind: number): void;
  step(dt: number, input: UserInputFrame): SimEvent[];
  startMatch(cfg: MatchConfig): void;
  togglePause(): boolean;
  /** Lab-mode helper: place ball + only the drills the lab wants live. */
  spawnLab(kind: "shootout" | "touch"): void;
  /** Menu backdrop: squads at their marks, ball on the spot, no clock. */
  spawnIdle(): void;
}

interface PlayerInternal extends PlayerState {
  replanT: number;
  cmd: PlayerCommand;
  pendKick: PendKick | null;
  /** This slide already won the ball once: one dispossession per slide. */
  slideWon: boolean;
}

/** Difficulty used for the user's own CPU teammates, whatever the opponent's difficulty. */
export const TEAMMATE_DIFFICULTY = 0.6;
/**
 * FC-12: difficulty an AI player plays at. The opponent plays at the match difficulty (no floor, so Quick Play and
 * each group-stage match differ); the user's own CPU teammates play at TEAMMATE_DIFFICULTY whatever the opponent's.
 */
export function aiDifficulty(userTeam: TeamId | null, team: TeamId, matchDifficulty: number): number {
  return userTeam !== null && team === userTeam ? TEAMMATE_DIFFICULTY : matchDifficulty;
}

/** Fixed sim step. main.ts runs an accumulator around it; the QA hooks step it directly. */
export const SIM_DT = 1 / 60;

export function createSim(): Sim {
  const events: SimEvent[] = [];
  let seed = SIM_SEED;
  let rng = makeRng(seed);
  let matchIndex = 0;
  let assist = false;
  let userCelebration = 0;
  let firstHalfKickoff: TeamId = 0;
  let secondHalfKickoff: TeamId = 1;
  let cfg: MatchConfig = {
    mode: "quick", venue: "munich", homeClub: "aurora", awayClub: "iron",
    userTeam: 0, difficulty: 0.6, goldenGoal: true, shootoutOnTie: true
  };
  let charge = 0;
  let chargeHeld = false;
  let dt0 = 1 / 60;
  let labPens = false;          // shootout lab: user takes every penalty
  let keeperRushHeld = false;   // user holds sprint off-ball → GK rushes out
  let autopilot = false;        // autopilot is OFF by default unless ?autoplay=1 / ?demo=1 or toggled

  const emit = (e: SimEvent) => events.push(e);

  const state: MatchState = {
    mode: "menu", phase: "idle", phaseT: 0, simT: 0,
    half: 1, clock: 0, score: [0, 0], attackSign: [1, -1],
    ball: {
      x: 0, y: BALL_R, z: 0, vx: 0, vy: 0, vz: 0, rotX: 0, rotY: 0, rotZ: 0, quat: [0, 0, 0, 1], spin: 0,
      rolling: false, lastKickPower: 0, lastKickFootDist: -1, lastKickT: -1,
      mode: "dead", ownerId: null, lastTouchTeam: null, intendedTargetId: null,
      shotPower: 0, freeT: 99, controlT: 0, lastShot: "none", trail: [],
      kickerId: null, lastToucherId: null
    },
    players: [], userTeam: 0, controlledId: null,
    possession: [0, 0], possessionTeam: null,
    shotsOn: [0, 0], saves: [0, 0], corners: [0, 0], kicks: 0,
    paused: false, goldenGoal: false, winner: null, shootout: null,
    venue: "munich", kickoffTeam: 0,
    restartSpot: null, restartTeam: null, restartKind: null, restartT: 0,
    goalFlashT: 0, lastScorer: null
  };

  /* ----------------------- roster / kickoff ----------------------- */

  const ROSTER: [string, [number, number], import("./types").Role][] = [
    ["gk", [-27.5, 0], "GK"],
    ["df0", [-14.5, -7.5], "DF"],
    ["df1", [-14.5, 7.5], "DF"],
    ["mf", [-6.0, 0], "MF"],
    ["fw", [0.8, 0], "FW"]
  ];

  function spawnTeams() {
    const players: PlayerInternal[] = [];
    for (const team of [0, 1] as const) {
      const s = state.attackSign[team];
      for (const [suffix, [ax, az], role] of ROSTER) {
        players.push({
          id: `${team === 0 ? "h" : "a"}-${suffix}`,
          team, role, anchor: [ax, az],
          x: s * ax, z: az, vx: 0, vz: 0, yaw: s > 0 ? 0 : Math.PI,
          speed: 0, stamina: 1, slideT: 0, slideDir: [0, 0], slideCooldown: 0,
          kickT: 0, kickDur: 0.32, kickPower: 0, skillT: 0, skill: "none",
          celebrateT: 0, celebrateKind: 0, diveT: 0, diveDir: 0, diveVx: 0,
          stunT: 0, controlled: false, isKeeper: role === "GK", trapT: 0, holdT: 0,
          gait: rng() * 6,
          replanT: 0, cmd: { move: [0, 0], sprint: false }, pendKick: null, slideWon: false
        });
      }
    }
    state.players = players;
  }

  function findPlayer(id: string | null): PlayerInternal | undefined {
    return (state.players as PlayerInternal[]).find((p) => p.id === id);
  }

  function toAnchors(team: TeamId | "all", kickoffShift: boolean) {
    for (const p of state.players as PlayerInternal[]) {
      if (team !== "all" && p.team !== team) continue;
      const s = state.attackSign[p.team];
      let ax = p.anchor[0], az = p.anchor[1];
      if (kickoffShift && p.role === "FW") ax -= 5.5; // strikers start near the centre spot
      if (kickoffShift && p.role === "MF") ax -= 2;
      p.x = s * ax; p.z = az; p.vx = 0; p.vz = 0; p.speed = 0;
      p.yaw = s > 0 ? 0 : Math.PI;
      p.slideT = 0; p.skillT = 0; p.diveT = 0; p.stunT = 0; p.holdT = 0;
      p.kickT = 0; p.celebrateT = 0; p.trapT = 0; p.pendKick = null;
    }
  }

  function startKickoff(team: TeamId) {
    toAnchors("all", true);
    const b = state.ball;
    b.x = 0; b.y = BALL_R; b.z = 0; b.vx = 0; b.vy = 0; b.vz = 0; b.spin = 0;
    b.rolling = false;
    b.mode = "dribble"; b.ownerId = null; b.intendedTargetId = null; b.freeT = 0;
    b.lastShot = "none"; b.trail.length = 0;
    state.phase = "kickoff"; state.phaseT = 0; state.kickoffTeam = team;
    const fw = nearestOf(team, 0, 0, false);
    if (fw) {
      fw.x = -state.attackSign[team] * 0.42;
      fw.z = 0;
      fw.vx = 0;
      fw.vz = 0;
      fw.speed = 0;
      giveBall(fw, false);
      b.x = 0;
      b.z = 0;
    }
    pickControlled();
    setControlled(state.controlledId);
    emit({ type: "kickoff", team, label: `kickoff — ${team === 0 ? "home" : "away"}`, severity: "info" });
  }

  function pickControlled() {
    if (state.userTeam === null) { state.controlledId = null; return; }
    const ut = state.userTeam;
    const mine = (state.players as PlayerInternal[]).filter((p) => p.team === ut && !p.isKeeper);
    const b = state.ball;
    let best = mine[0], bd = Infinity;
    for (const p of mine) {
      const d = dist2(p.x, p.z, b.x, b.z);
      if (d < bd) { bd = d; best = p; }
    }
    state.controlledId = best?.id ?? null;
  }

  function setControlled(id: string | null) {
    state.controlledId = id;
    for (const p of state.players as PlayerInternal[]) p.controlled = p.id === id;
  }

  /* ----------------------- ball interactions ---------------------- */

  function owner() { return findPlayer(state.ball.ownerId); }

  function giveBall(p: PlayerInternal, controlled: boolean) {
    const b = state.ball;
    b.ownerId = p.id;
    b.lastTouchTeam = p.team;
    b.lastToucherId = p.id;
    b.kickerId = null;
    b.mode = controlled ? "controlled" : "dribble";
    b.controlT = controlled ? 0.16 : 0;
    b.freeT = 0;
    p.trapT = 0.16;
    if (state.userTeam !== null && p.team === state.userTeam) setControlled(p.id);
  }

  function releaseBall(mode: "loose" | "flight") {
    const b = state.ball;
    b.ownerId = null;
    b.mode = mode;
    b.freeT = 0;
  }

  /** Kicking-side (right boot) world position — where the ball must sit. */
  function footWorld(p: PlayerInternal, ahead = FOOT_AHEAD): [number, number] {
    const c = Math.cos(p.yaw), s = Math.sin(p.yaw);
    // forward = (cos yaw, sin yaw); right-boot side = (-sin yaw, cos yaw)
    return [p.x + c * ahead - s * FOOT_SIDE, p.z + s * ahead + c * FOOT_SIDE];
  }

  /**
   * Begin a kick. The command only starts the swing — the ball stays glued to
   * the kicking foot and launches at the swing's contact frame (see
   * stepBallFlight), so the boot visibly drives the ball out.
   * Swing duration scales with power: a tap is a compact flick, a full shot
   * carries a long backswing and follow-through.
   */
  function startKick(p: PlayerInternal, dir: [number, number], power: number, opts: {
    kind: BallState["lastShot"]; targetId?: string | null; spin?: number; aimLiftDeg?: number; targetDist?: number;
  }) {
    if (p.pendKick) return;                        // mid-swing — no double strikes
    const pw = clamp(power, 0.12, 1);
    const T = KICK_MIN_TAP + pw * KICK_RANGE_T;    // 0.24s tap … 0.38s full swing
    const [dx, dz] = norm2(dir[0], dir[1]);
    p.pendKick = {
      dir: [dx, dz], power: pw, kind: opts.kind,
      spin: opts.spin ?? 0, targetId: opts.targetId ?? null,
      aimLiftDeg: opts.aimLiftDeg ?? 0, targetDist: opts.targetDist ?? 0,
      T, contactAt: T * KICK_CONTACT_FRAC, minFootDist: 99
    };
    p.kickT = T;
    p.kickDur = T;
    p.kickPower = pw;
    if (state.ball.ownerId !== p.id) { giveBall(p, false); }
    else if (state.ball.mode === "held" || state.ball.mode === "controlled") { state.ball.mode = "dribble"; }
  }

  /** The strike itself: launch profile per kick type — believable speeds on lofted arcs. */
  function launchKick(p: PlayerInternal, pend: PendKick) {
    const b = state.ball;
    let speed: number, angleDeg: number;
    // weighted ground pass: just enough speed to arrive at the receiver with PASS_ARRIVE left after
    // rolling friction and drag (a = ROLL_DECEL + ~1.2), so the ball rolls the whole way instead of lobbing
    const weighted = (arrive: number, lo: number, hi: number): number => {
      const decel = ROLL_DECEL + 1.2;
      const v = Math.sqrt(arrive * arrive + 2 * decel * pend.targetDist);
      return clamp(v * (0.94 + 0.12 * pend.power), lo, hi);
    };
    switch (pend.kind) {
      case "shot":     speed = 15 + pend.power * 9;  angleDeg = 5 + pend.power * 6 + pend.aimLiftDeg; break;  // 15–24 m/s, a driven strike that rises into the goal
      case "driven":   speed = pend.targetDist > 0 ? weighted(DRIVEN_ARRIVE, 11, 21) : 14 + pend.power * 5; angleDeg = 2 + pend.power * 1.5; break; // flat & hard along the grass
      case "cross":    speed = 10.5 + pend.power * 3; angleDeg = 38 + pend.power * 8; break;                 // lofted delivery
      case "clearance": speed = 13 + pend.power * 6; angleDeg = 28 + pend.power * 10; break;                 // big boot upfield
      default:         speed = pend.targetDist > 0 ? weighted(PASS_ARRIVE, 7, 15) : 8 + pend.power * 6; angleDeg = 2 + pend.power * 1.5; break; // ground pass
    }
    const a = (angleDeg * Math.PI) / 180;
    const vh = speed * Math.cos(a);
    // launch from where the ball sits at the boot — no repositioning, no teleport
    b.vx = pend.dir[0] * vh; b.vz = pend.dir[1] * vh;
    b.vy = speed * Math.sin(a);
    if (b.y < BALL_R) b.y = BALL_R;
    b.rolling = false;
    b.mode = "flight"; b.ownerId = null; b.freeT = 0;
    b.spin = pend.spin;
    b.kickerId = p.id; b.lastToucherId = p.id; b.lastTouchTeam = p.team;
    b.intendedTargetId = pend.targetId;
    b.lastShot = pend.kind; b.shotPower = pend.kind === "shot" ? pend.power : 0;
    if (pend.kind === "shot" && shotOnTarget(b, state.phase === "shootout" ? PITCH_HX : state.attackSign[p.team] * PITCH_HX)) state.shotsOn[p.team]++;
    // contact evidence: how far the boot was from the ball at the strike frame
    const f = footWorld(p);
    b.lastKickFootDist = dist2(b.x, b.z, f[0], f[1]);
    b.lastKickPower = pend.power;
    b.lastKickT = state.simT;
    p.pendKick = null;
    state.kicks++;
    emit({
      type: pend.kind === "shot" ? "shot" : "pass", team: p.team, playerId: p.id,
      label: pend.kind === "shot" ? `shot — power ${(pend.power * 100) | 0}%`
        : pend.kind === "driven" ? "driven pass"
        : pend.kind === "cross" ? "cross" : "pass",
      severity: "info", position: [b.x, b.y, b.z], value: speed
    });
  }

  /** choose a pass target: best open teammate toward the aim lane */
  function choosePassTarget(p: PlayerInternal, aimDir: [number, number], driven: boolean): { p: PlayerInternal; lead: [number, number] } | null {
    const mates = (state.players as PlayerInternal[]).filter((m) => m.team === p.team && m.id !== p.id);
    if (!mates.length) return null;
    const aimL = len2(aimDir[0], aimDir[1]);
    const hasAim = aimL > 0.3;
    const aimU: [number, number] = hasAim ? [aimDir[0] / aimL, aimDir[1] / aimL] : [state.attackSign[p.team], 0];
    let best: PlayerInternal | null = null;
    let bestScore = -Infinity;
    for (const m of mates) {
      if (m.isKeeper && !hasAim) continue; // don't auto-pass back to GK
      const dx = m.x - p.x, dz = m.z - p.z;
      const d = len2(dx, dz);
      if (d < 1.5) continue;
      const dot = (dx * aimU[0] + dz * aimU[1]) / Math.max(d, 0.01);
      if (hasAim && dot < 0.25) continue;         // must be roughly in the aim cone
      // openness: distance to nearest opponent
      let open = Infinity;
      for (const o of state.players) if (o.team !== p.team) open = Math.min(open, dist2(m.x, m.z, o.x, o.z));
      const forward = (m.x - p.x) * state.attackSign[p.team];
      // a CPU back-pass to the keeper is the last resort (he holds it a second and boots it long; as an ordinary
      // option half of all CPU passes recycled through him and matches stalled at 0-0)
      const backPass = m.isKeeper && !p.controlled ? CPU_BACKPASS_PENALTY : 0;
      const score = dot * 4 + open * 0.9 + forward * 0.12 - Math.abs(d - (driven ? 11 : 7)) * 0.25 - backPass;
      if (score > bestScore) { bestScore = score; best = m; }
    }
    if (!best) return null;
    return leadFor(p, best, driven);
  }

  /** Lead the runner: where the receiver will be when a pass from `p` arrives. */
  function leadFor(p: PlayerInternal, best: PlayerInternal, driven: boolean): { p: PlayerInternal; lead: [number, number] } {
    const d = dist2(p.x, p.z, best.x, best.z);
    const t = d / (driven ? 19 : 10.5);
    const lead: [number, number] = [
      clamp(best.x + best.vx * t * 1.15, -PITCH_HX + 0.8, PITCH_HX - 0.8),
      clamp(best.z + best.vz * t * 1.15, -PITCH_HZ + 0.8, PITCH_HZ - 0.8)
    ];
    return { p: best, lead };
  }

  /* --------------------------- phases ----------------------------- */

  function goal(team: TeamId, scorerId: string | null) {
    state.score[team]++;
    state.lastScorer = scorerId;
    state.kickoffTeam = team === 0 ? 1 : 0;   // conceding team restarts
    state.phase = "goal"; state.phaseT = 0; state.goalFlashT = 2.8;
    const scorer = findPlayer(scorerId);
    if (scorer) {
      scorer.celebrateT = 2.6;
      // the user's scorers perform the Player Studio celebration; CPU scorers pick one
      scorer.celebrateKind = state.userTeam !== null && scorer.team === state.userTeam ? userCelebration : (rng() * 4) | 0;
    }
    for (const p of state.players) if (p.team === team && !p.isKeeper) p.celebrateT = Math.max(p.celebrateT, 1.6);
    const golden = state.half === 3;
    emit({ type: "goal", team, playerId: scorerId ?? undefined, label: golden ? `GOLDEN GOAL — ${team === 0 ? "home" : "away"} wins it` : `GOAL — ${team === 0 ? "home" : "away"}`, severity: "success", position: [state.ball.x, 1, state.ball.z] });
    state.ball.mode = "dead"; state.ball.vx = 0; state.ball.vz = 0; state.ball.vy = 0; state.ball.rolling = false;
  }

  function endGoalPhase() {
    if (state.half === 3) {
      // golden goal decided it
      state.winner = state.score[0] > state.score[1] ? 0 : 1;
      state.phase = "ended"; state.phaseT = 0;
      emit({ type: "fulltime", label: "golden goal — match over", severity: "success" });
      return;
    }
    startKickoff(state.kickoffTeam);
  }

  function clockLimit() { return state.half === 3 ? ET_LEN : HALF_LEN; }

  function timeUp() {
    if (state.half === 1) {
      state.phase = "halftime"; state.phaseT = 0;
      emit({ type: "halftime", label: `half-time — ${state.score[0]}-${state.score[1]}`, severity: "info" });
    } else if (state.half === 2 || state.half === 3) {
      if (state.score[0] !== state.score[1]) {
        finishMatch();
      } else if (state.half === 3) {
        if (cfg.shootoutOnTie) beginShootout(); else finishMatch();
      } else if (cfg.goldenGoal) {
        state.half = 3; state.clock = 0;
        state.phase = "extratime"; state.phaseT = 0;
        emit({ type: "extratime", label: "golden goal extra time", severity: "info" });
      } else if (cfg.shootoutOnTie) {
        beginShootout();
      } else {
        finishMatch();
      }
    }
  }

  function finishMatch() {
    state.phase = "ended"; state.phaseT = 0;
    state.winner = state.score[0] === state.score[1] ? null : (state.score[0] > state.score[1] ? 0 : 1);
    emit({
      type: "fulltime",
      label: state.winner === null ? `full time — draw ${state.score[0]}-${state.score[1]}` : `full time — ${state.score[0]}-${state.score[1]}`,
      severity: "success"
    });
  }

  /* --------------------------- shootout --------------------------- */

  function beginShootout() {
    state.phase = "shootout"; state.phaseT = 0;
    state.shootout = {
      round: 1, takerTeam: 0, scores: [0, 0], taken: [0, 0],
      stage: "walkup", stageT: 0, aim: [0, 0.8], power: 0, resultText: "",
      gkDive: 0, pendingMiss: false, log: [[], []]
    };
    emit({ type: "shootout-start", label: "penalty shootout — five each", severity: "info" });
    setupPenalty();
  }

  /** positions for a single penalty: taker at PEN spot vs keeper on line */
  function setupPenalty() {
    const so = state.shootout!;
    const takerTeam = so.takerTeam;
    const goalSign = -state.attackSign[takerTeam];   // taker attacks the goal they were defending-side... use fixed: shoot at +X goal for team0/-X for team1? Broadcast reads better if ALL pens at the +X goal.
    void goalSign;
    // All penalties at the +X (east) goal for readability.
    for (const p of state.players as PlayerInternal[]) {
      p.slideT = 0; p.diveT = 0; p.skillT = 0; p.stunT = 0; p.holdT = 0; p.kickT = 0; p.celebrateT = 0; p.trapT = 0; p.pendKick = null;
      if (p.isKeeper) {
        if (p.team === takerTeam) { p.x = -PITCH_HX + 0.9; p.z = 0; }     // shooting team's GK waits at far goal
        else { p.x = PITCH_HX - 0.7; p.z = 0; p.yaw = Math.PI; }          // defending GK on the line
      } else {
        const row = (p.team === takerTeam ? 1 : -1);
        p.x = -2 * row; p.z = (p.role === "FW" ? -1.6 : p.role === "MF" ? 0 : p.role === "DF" ? 1.6 : 0.8) + (p.team === takerTeam ? 2.4 : -2.4);
      }
    }
    const taker = (state.players as PlayerInternal[]).find((p) => p.team === takerTeam && !p.isKeeper && p.role === "FW")
      ?? (state.players as PlayerInternal[]).find((p) => p.team === takerTeam && !p.isKeeper)!;
    // taker's right boot sits on the spot: foot offset (0.34 ahead, 0.14 right)
    // puts the glued ball exactly at (PEN_X, 0) for the strike
    taker.x = PEN_X - FOOT_AHEAD; taker.z = -FOOT_SIDE; taker.yaw = 0;
    const b = state.ball;
    b.x = PEN_X; b.y = BALL_R; b.z = 0; b.vx = 0; b.vy = 0; b.vz = 0; b.spin = 0;
    b.rolling = false;
    b.mode = "dribble"; b.ownerId = taker.id; b.lastTouchTeam = takerTeam; b.freeT = 0; b.intendedTargetId = null;
    if (state.userTeam !== null) {
      const myGk = findPlayer(`${state.userTeam === 0 ? "h" : "a"}-gk`);
      setControlled(taker.team === state.userTeam ? taker.id : myGk?.id ?? state.controlledId);
    }
    so.stage = "walkup"; so.stageT = 0; so.aim = [0, 0.8]; so.power = 0;
  }

  function stepShootout(dt: number, input: UserInputFrame) {
    const so = state.shootout!;
    so.stageT += dt;
    const taker = findPlayer(state.ball.ownerId);
    const defendingGk = (state.players as PlayerInternal[]).find((p) => p.isKeeper && p.team !== so.takerTeam);
    const userShooting = state.userTeam !== null && so.takerTeam === state.userTeam;

    if (so.stage === "walkup" && so.stageT > 0.9) { so.stage = "aim"; so.stageT = 0; }

    if (so.stage === "aim" && taker) {
      // aim placement across the mouth: W/S pick a post (screen up/down),
      // D/A pick height, SPACE charges then releases the kick.
      if (userShooting) {
        so.aim[0] = clamp(so.aim[0] - input.move[1] * dt * 3.6, -GOAL_HALF_W + 0.35, GOAL_HALF_W - 0.35);
        so.aim[1] = clamp(so.aim[1] + input.move[0] * dt * 2.0, 0.2, GOAL_H - 0.35);
        if (input.shootHeld) { so.power = clamp(so.power + dt / 0.9, 0.15, 1); }
        if (input.shootReleased || (so.power > 0.99 && !input.shootHeld)) {
          firePenalty(so.power > 0.05 ? so.power : 0.4, so.aim);
        }
      } else {
        // CPU taker: brief wind-up then a placed finish
        so.power = clamp(so.stageT / 1.1, 0, 1);
        if (so.stageT > 0.9) {
          const corner = rng() < 0.5 ? -1 : 1;
          so.aim = [corner * (GOAL_HALF_W - 0.55 - rng() * 0.6), 0.45 + rng() * 1.3];
          firePenalty(0.55 + rng() * 0.4, so.aim);
        }
      }
    }

    void stepBallFlight(dt);

    if (so.stage === "kick" && state.ball.mode === "dead" && so.stageT > 0.4) { so.stage = "decided"; so.stageT = 0; }
    // safety: a live ball that never resolved (post rebound ping-pong) settles as a miss/save
    if (so.stage === "kick" && so.stageT > 2.6 && state.ball.mode !== "dead") {
      resolvePenalty(so.pendingMiss ? "miss" : "save");
      so.stage = "decided"; so.stageT = 0;
    }
    if (so.stage === "decided" && so.stageT > 1.5) {
      so.taken[so.takerTeam]++;
      // alternate; round ends after team1 takes theirs
      if (so.takerTeam === 1) so.round++;
      // decided early?
      const decided = shootoutDecided();
      if (decided !== null) {
        state.winner = decided;
        so.stage = "done";
        emit({ type: "fulltime", label: `shootout over — ${so.scores[0]}-${so.scores[1]}`, severity: "success" });
        state.phase = "ended"; state.phaseT = 0;
        if (state.mode === "shootout") {
          // lab mode keeps state; modes.ts reads scores
        }
        return;
      }
      so.takerTeam = labPens ? (state.userTeam ?? 0) : (so.takerTeam === 0 ? 1 : 0);
      setupPenalty();
      emit({ type: "penalty", team: so.takerTeam, label: `penalty ${so.taken[0] + so.taken[1] + 1}`, severity: "info" });
    }
  }

  function shootoutDecided(): TeamId | null {
    const so = state.shootout!;
    if (labPens) {
      // lab format: one side takes five; "done" is the outcome
      const tt = so.takerTeam;
      if (so.taken[tt] >= 5) return tt;
      return null;
    }
    // Regulation (five each): stop as soon as one side cannot be caught.
    if (so.taken[0] < 5 || so.taken[1] < 5) {
      const rem0 = Math.max(0, 5 - so.taken[0]);
      const rem1 = Math.max(0, 5 - so.taken[1]);
      if (so.scores[0] > so.scores[1] + rem1) return 0;
      if (so.scores[1] > so.scores[0] + rem0) return 1;
      return null;
    }
    // Sudden death: decide only after both sides have taken the same number of kicks.
    if (so.taken[0] === so.taken[1] && so.scores[0] !== so.scores[1]) return so.scores[0] > so.scores[1] ? 0 : 1;
    return null;
  }

  function firePenalty(power: number, aim: [number, number]) {
    const so = state.shootout!;
    const taker = findPlayer(state.ball.ownerId);
    if (!taker) return;
    // aim[0] = z placement in mouth, aim[1] = height
    // accuracy error shrinks with power but wild aims can miss the frame; the error is applied to the strike itself
    const err = (1 - power) * 0.5 * (rng() < 0.5 ? -1 : 1) + (rng() - 0.5) * 0.22;
    const zAtLine = aim[0] + err * 1.4;
    const yAtLine = clamp(aim[1] + (rng() - 0.5) * (0.5 + (1 - power) * 0.6), 0.05, GOAL_H + 1.2);
    const missesFrame = Math.abs(zAtLine) > GOAL_HALF_W - 0.1 || yAtLine > GOAL_H - 0.1;
    const target: [number, number] = [PITCH_HX - 0.05, zAtLine];
    const dir = norm2(target[0] - state.ball.x, target[1] - state.ball.z);
    const kickPower = Math.max(0.5, power);
    const dist = dist2(state.ball.x, state.ball.z, target[0], target[1]);
    // loft from the target height: the launch angle whose drag-free arc crosses the line at yAtLine
    const liftDeg = penaltyLoftDeg(15 + kickPower * 9, dist, yAtLine) - (5 + kickPower * 6);
    // the swing starts now; the strike lands when the boot reaches the ball
    startKick(taker, dir, kickPower, { kind: "shot", aimLiftDeg: liftDeg });
    so.stage = "kick"; so.stageT = 0;
    so.pendingMiss = missesFrame;
    // CPU keeper guesses a side — better placement into the corners is harder to read
    const defGk = (state.players as PlayerInternal[]).find((p) => p.isKeeper && p.team !== taker.team);
    if (defGk && defGk.team !== state.userTeam) {
      // the keeper reads a soft or central kick more often; a misread dives the wrong way (a placed corner beats him)
      const reads = rng() < PEN_READ_BASE + (1 - power) * PEN_READ_SOFT;
      const correctSide = Math.abs(zAtLine) < 0.4 ? 0 : Math.sign(zAtLine);
      defGk.diveDir = reads ? correctSide : correctSide === 0 ? (rng() < 0.5 ? -1 : 1) : -correctSide;
      so.gkDive = defGk.diveDir;
    } else {
      so.gkDive = 0;
    }
    emit({ type: "penalty", team: taker.team, label: "penalty taken", severity: "info", position: [state.ball.x, 0.2, state.ball.z] });
  }

  function resolvePenalty(outcome: "goal" | "save" | "miss") {
    const so = state.shootout!;
    so.log[so.takerTeam].push(outcome === "goal" ? "in" : "out");
    if (outcome === "goal") {
      so.scores[so.takerTeam]++;
      so.resultText = "SCORED";
      emit({ type: "pen-goal", team: so.takerTeam, label: `pen scored — ${so.scores[0]}-${so.scores[1]}`, severity: "success" });
    } else {
      so.resultText = outcome === "save" ? "SAVED" : "OFF TARGET";
      emit({ type: outcome === "save" ? "pen-save" : "pen-miss", team: so.takerTeam, label: outcome === "save" ? "penalty saved" : "penalty missed", severity: "warn" });
    }
    state.ball.mode = "dead";
    state.ball.rolling = false;
  }

  /* --------------------------- out / walls ------------------------ */

  function outOfBounds() {
    const b = state.ball;
    const v = VENUES[state.venue];
    // Walled cage: bounce off the boards, play on.
    if (v.walled) {
      const mx = PITCH_HX - BALL_R, mz = PITCH_HZ - BALL_R;
      let bounced = false;
      // the end walls stop at the posts (scene.ts CAGE_GOAL_GAP): a ball inside the goal mouth is not bounced, so
      // the goal test sees it cross the line (FC-10)
      const inMouth = Math.abs(b.z) < GOAL_HALF_W - 0.06 && b.y < GOAL_H - 0.05;
      if (Math.abs(b.x) > mx && !inMouth) { b.x = Math.sign(b.x) * mx; b.vx = -b.vx * 0.55; b.vz *= 0.85; bounced = true; }
      if (Math.abs(b.z) > mz) { b.z = Math.sign(b.z) * mz; b.vz = -b.vz * 0.55; b.vx *= 0.85; bounced = true; }
      if (bounced) {
        emit({ type: "wall", label: "off the boards", severity: "info", position: [b.x, b.y, b.z] });
        if (Math.hypot(b.vx, b.vz) < 2.2) { b.mode = "loose"; }
      }
      return;
    }
    const last = b.lastTouchTeam;
    const other: TeamId = last === 0 ? 1 : 0;
    // side-line out → kick-in
    if (Math.abs(b.z) > PITCH_HZ && Math.abs(b.x) <= PITCH_HX) {
      state.restartKind = "kickin"; state.restartTeam = other;
      state.restartSpot = [clamp(b.x, -PITCH_HX + 1, PITCH_HX - 1), Math.sign(b.z) * (PITCH_HZ - 0.4)];
      state.phase = "restart"; state.phaseT = 0;
      b.mode = "dead";
      emit({ type: "throwin", team: other, label: "kick-in", severity: "info" });
      return;
    }
    // goal line out
    if (Math.abs(b.x) > PITCH_HX) {
      const defendingTeam: TeamId = b.x > 0 ? 1 : 0;   // goal at +X is defended by team 1
      if (last === defendingTeam) {
        // corner for the attackers
        state.restartKind = "corner"; state.restartTeam = other;
        state.restartSpot = [Math.sign(b.x) * (PITCH_HX - 0.5), Math.sign(b.z || 1) * (PITCH_HZ - 0.5)];
        state.corners[other]++;
        emit({ type: "corner", team: other, label: "corner", severity: "info" });
      } else {
        state.restartKind = "goalkick"; state.restartTeam = defendingTeam;
        state.restartSpot = [Math.sign(b.x) * (PITCH_HX - 5.5), 0];
        emit({ type: "goalkick", team: defendingTeam, label: "goal kick", severity: "info" });
      }
      state.phase = "restart"; state.phaseT = 0;
      b.mode = "dead";
      return;
    }
  }

  function stepRestart(dt: number) {
    state.restartT += dt;
    const spot = state.restartSpot!;
    const team = state.restartTeam!;
    const taker = nearestOf(team, spot[0], spot[1], false);
    if (!taker) {
      // nobody on that side to take it (never in a match): drop the ball on the spot and play on
      const b = state.ball;
      b.x = spot[0]; b.z = spot[1]; b.y = BALL_R; b.vx = 0; b.vy = 0; b.vz = 0; b.mode = "loose"; b.ownerId = null;
      state.phase = "live"; state.phaseT = 0;
      return;
    }
    // walk the taker to the spot fast
    const to = norm2(spot[0] - taker.x, spot[1] - taker.z);
    const d = dist2(taker.x, taker.z, spot[0], spot[1]);
    if (d > 0.5) { taker.vx = to[0] * 4.5; taker.vz = to[1] * 4.5; taker.x += taker.vx * dt; taker.z += taker.vz * dt; }
    const b = state.ball;
    b.x = lerp(b.x, spot[0], Math.min(1, dt * 10));
    b.z = lerp(b.z, spot[1], Math.min(1, dt * 10));
    b.y = BALL_R; b.vx = 0; b.vy = 0; b.vz = 0; b.spin = 0; b.rolling = false;
    if (state.restartT < 0.95) return;

    if (state.restartKind === "goalkick") {
      const gk = (state.players as PlayerInternal[]).find((p) => p.team === team && p.isKeeper) ?? taker;
      gk.x = spot[0]; gk.z = spot[1];
      giveBall(gk, false);
      gk.holdT = 0.001; // distribute quickly next frame
      state.phase = "live"; state.phaseT = 0;
    } else if (state.restartKind === "corner") {
      giveBall(taker, false);
      // auto-cross into the box centre-high — launched off the boot at contact
      const goalSign = -state.attackSign[team];
      const cx = goalSign * (PITCH_HX - 3.4);
      startKick(taker, norm2(cx - taker.x, 0 - taker.z), 0.9, { kind: "cross" });
      state.phase = "live"; state.phaseT = 0;
    } else {
      // kick-in: short pass to nearest open teammate
      giveBall(taker, false);
      const target = choosePassTarget(taker, [state.attackSign[team], 0], false);
      if (target) startKick(taker, norm2(target.lead[0] - taker.x, target.lead[1] - taker.z), 0.55, { kind: "pass", targetId: target.p.id, targetDist: dist2(taker.x, taker.z, target.lead[0], target.lead[1]) });
      state.phase = "live"; state.phaseT = 0;
    }
  }

  /** Nearest player of `team` to (x, z); undefined when the team has nobody on the pitch (Touch Lab fields one player). */
  function nearestOf(team: TeamId, x: number, z: number, includeGk: boolean): PlayerInternal | undefined {
    let best: PlayerInternal | undefined;
    let bd = Infinity;
    for (const p of state.players as PlayerInternal[]) {
      if (p.team !== team || (!includeGk && p.isKeeper)) continue;
      const d = dist2(p.x, p.z, x, z);
      if (d < bd) { bd = d; best = p; }
    }
    return best ?? (state.players as PlayerInternal[]).find((p) => p.team === team);
  }

  /** Touch Lab: the ball left the pitch or went in. No restart and no score: a fresh ball rolls in from the left. */
  function labRefeed(reason: string) {
    const b = state.ball;
    b.x = -6; b.y = BALL_R; b.z = 0; b.vx = 4; b.vy = 0; b.vz = 0; b.spin = 0;
    b.mode = "loose"; b.ownerId = null; b.kickerId = null; b.freeT = 0; b.rolling = false;
    b.lastShot = "none"; b.intendedTargetId = null; b.trail.length = 0;
    state.phase = "live"; state.phaseT = 0;
    emit({ type: "out", label: `${reason} — fresh ball`, severity: "info", position: [b.x, b.y, b.z] });
  }

  /* --------------------------- ball flight ------------------------ */

  function stepBallFlight(dt: number) {
    const b = state.ball;
    b.freeT += dt;
    if (b.mode === "held") {
      const gk = findPlayer(b.ownerId);
      if (gk) { b.x = gk.x + Math.cos(gk.yaw) * 0.45; b.z = gk.z + Math.sin(gk.yaw) * 0.45; b.y = 0.95; }
      return true;
    }
    if (b.mode === "dribble" || b.mode === "controlled") {
      const o = owner() as PlayerInternal | undefined;
      if (!o) { b.mode = "loose"; return true; }
      b.controlT = Math.max(0, b.controlT - dt);
      if (b.mode === "controlled" && b.controlT <= 0) b.mode = "dribble";
      // a swing in progress owns the ball: glued to the kicking boot until the
      // contact frame — no drift, no floating, no launch before the foot arrives
      const pend = o.pendKick;
      if (pend) {
        const f = footWorld(o);
        b.x = lerp(b.x, f[0], Math.min(1, dt * 30));
        b.z = lerp(b.z, f[1], Math.min(1, dt * 30));
        b.y = BALL_R; b.vx = o.vx; b.vz = o.vz; b.vy = 0;
        pend.minFootDist = Math.min(pend.minFootDist, dist2(b.x, b.z, f[0], f[1]));
        if (pend.T - o.kickT >= pend.contactAt) launchKick(o, pend);
        return true;
      }
      // dribble-stick: ball rides at the kicking-side foot, not floating ahead
      const ahead = o.skill === "chop" && o.skillT > 0 ? 0.8
        : 0.40 + (o.speed > RUN_SPEED + 0.4 ? 0.16 : 0);
      const c = Math.cos(o.yaw), s = Math.sin(o.yaw);
      const tx = o.x + c * ahead - s * FOOT_SIDE;
      const tz = o.z + s * ahead + c * FOOT_SIDE;
      b.x = lerp(b.x, tx, Math.min(1, dt * 13));
      b.z = lerp(b.z, tz, Math.min(1, dt * 13));
      b.y = BALL_R; b.vx = o.vx; b.vz = o.vz; b.vy = 0; b.spin = 0;
      b.rolling = false;
      spinBall(b, b.vz / BALL_R, 0, -b.vx / BALL_R, dt);
      state.possessionTeam = o.team;
      return true;
    }
    if (b.mode === "dead") return true;

    // loose / flight — integrate (drag, Magnus, bounce, roll: see ballPhysics.ts)
    const px0 = b.x, pz0 = b.z, py0 = b.y;
    const impact = stepFreeBall(b, dt);
    if (impact > 0) emit({ type: "bounce", label: "bounce", severity: "info", position: [b.x, b.y, b.z], value: impact });

    // goal posts / bar — swept against the goal-line plane, so a fast strike cannot step past a post between two frames
    for (const gx of [-PITCH_HX, PITCH_HX]) {
      const crossed = (px0 - gx) * (b.x - gx) <= 0 && px0 !== b.x;
      const near = Math.abs(b.x - gx) <= 0.38;
      if (!crossed && !near) continue;
      // where the ball was when it met the plane (or where it is now when it only skims it)
      const t = crossed ? clamp((gx - px0) / (b.x - px0), 0, 1) : 1;
      const cz = lerp(pz0, b.z, t), cy = lerp(py0, b.y, t);
      const post = Math.abs(Math.abs(cz) - GOAL_HALF_W) < 0.16 && cy < GOAL_H;
      const bar = Math.abs(cy - GOAL_H) < 0.18 && Math.abs(cz) < GOAL_HALF_W + 0.1;
      if (post && Math.sign(b.vx) === Math.sign(gx)) {
        b.x = gx - Math.sign(b.vx) * 0.24; b.z = cz; b.y = Math.max(BALL_R, cy); b.vx = -b.vx * 0.5; b.vz *= 0.6;
        emit({ type: "post", label: "off the post", severity: "warn", position: [b.x, b.y, b.z] });
        continue;
      }
      if (bar && b.vy > 0) {
        b.y = GOAL_H - 0.18; b.vy = -b.vy * 0.45; b.vx *= 0.72;
        emit({ type: "crossbar", label: "off the bar", severity: "warn", position: [b.x, b.y, b.z] });
        continue;
      }
    }

    // goal!
    if (Math.abs(b.x) > PITCH_HX + 0.1 && Math.abs(b.z) < GOAL_HALF_W - 0.06 && b.y < GOAL_H - 0.05) {
      const scoringTeam: TeamId = b.x > 0 ? 0 : 1; // goal at +X belongs to team 1
      if (state.phase === "shootout") { resolvePenalty("goal"); return true; }
      if (state.mode === "touch") { labRefeed("in the net"); return true; }
      goal(scoringTeam, b.lastToucherId);
      return true;
    }

    // keeper catch / outfield trap
    for (const p of state.players as PlayerInternal[]) {
      if (p.id === b.kickerId && b.freeT < 0.4) continue;   // kicker can't instantly re-trap
      if (p.stunT > 0 || p.slideT > 0) continue;            // a beaten or sliding player cannot gather it
      // open play: a keeper gathers what reaches his body or a full-stretch dive, so placed shots beat him (2-4 goals a
      // CPU match); penalties keep the full reach (their conversion is tuned through the read chance instead)
      const reach = p.isKeeper
        ? (state.phase === "shootout" ? KEEPER_REACH + (p.diveT > 0 ? 0.5 : 0) : OPEN_KEEPER_REACH + (p.diveT > 0 ? OPEN_DIVE_REACH : 0))
        : TRAP_R;
      const maxH = p.isKeeper ? 2.3 : TRAP_H;
      const d = dist2(p.x, p.z, b.x, b.z);
      if (d < reach && b.y < maxH) {
        if (p.isKeeper && (b.mode === "flight" || Math.hypot(b.vx, b.vz) > 3)) {
          // keeper gathers — a save only for a shot still in flight towards his goal
          const towardOwnGoal = Math.sign(b.vx) === -state.attackSign[p.team] || state.phase === "shootout";
          if (b.lastShot === "shot" && b.mode === "flight" && towardOwnGoal) {
            state.saves[p.team]++;
            emit({ type: "save", team: p.team, playerId: p.id, label: "keeper save", severity: "success", position: [b.x, b.y, b.z] });
            if (state.phase === "shootout") { resolvePenalty("save"); return true; }
          }
          b.lastShot = "none";
          b.ownerId = p.id; b.mode = "held"; b.lastTouchTeam = p.team; b.lastToucherId = p.id; p.holdT = KEEPER_HOLD;
          p.vx = 0; p.vz = 0;
          state.possessionTeam = p.team;
          if (state.userTeam !== null && p.team === state.userTeam) {
            const mate = nearestOf(p.team, 0, 0, false);
            if (mate) setControlled(mate.id);
          }
          return true;
        }
        if (b.mode === "flight" && b.lastShot === "shot" && p.team !== b.lastTouchTeam) {
          // outfield block: pops loose
          b.vx = -b.vx * 0.35; b.vz *= 0.5; b.vy = Math.abs(b.vy) * 0.4; b.mode = "loose";
          b.lastTouchTeam = p.team; b.lastToucherId = p.id; b.lastShot = "none";
          return true;
        }
        // a bullet strike is not controllable at point-blank range: outfield
        // traps need the ball slowed (or arriving as their intended pass)
        const bs = Math.hypot(b.vx, b.vz);
        if (bs > 11.5 && b.intendedTargetId !== p.id) continue;
        if (bs > 17 && b.intendedTargetId === p.id) continue;
        giveBall(p, true);
        b.lastShot = "none";
        return true;
      }
    }

    // slide-tackle dispossession happens in player step (contact with dribbler)

    // out of bounds
    if (Math.abs(b.x) > PITCH_HX + 0.2 || Math.abs(b.z) > PITCH_HZ + 0.2) {
      if (state.phase === "shootout") { resolvePenalty("miss"); return true; }
      if (state.mode === "touch") { labRefeed("out of play"); return true; }
      outOfBounds();
    }
    return true;
  }

  /* --------------------------- players ---------------------------- */

  function applyCommand(p: PlayerInternal, c: PlayerCommand, dt: number) {
    // timers
    p.slideT = Math.max(0, p.slideT - dt);
    p.slideCooldown = Math.max(0, p.slideCooldown - dt);
    p.kickT = Math.max(0, p.kickT - dt);
    p.skillT = Math.max(0, p.skillT - dt);
    p.celebrateT = Math.max(0, p.celebrateT - dt);
    p.stunT = Math.max(0, p.stunT - dt);
    p.trapT = Math.max(0, p.trapT - dt);
    p.diveT = Math.max(0, p.diveT - dt);

    // possession lost mid-swing (tackle, steal, keeper claim): the swing plays out as a whiff and must not fire
    // later, when this player next gets the ball, along a stale direction. A stun cancels the swing outright.
    if (p.pendKick && (state.ball.ownerId !== p.id || p.stunT > 0)) {
      p.pendKick = null;
      if (p.stunT > 0) p.kickT = 0;
    }

    const stunned = p.stunT > 0;
    const sliding = p.slideT > 0;
    const celebrating = p.celebrateT > 0.2;

    // keeper dive commit
    if (p.isKeeper && c.dive !== undefined && c.dive !== 0 && p.diveT <= 0) {
      p.diveT = 0.72;
      p.diveDir = Math.sign(c.dive);
      p.diveVx = p.diveDir * 5.4;
    }
    if (p.diveT > 0 && p.isKeeper) {
      p.z += p.diveVx * dt * (p.diveT / 0.72);   // decelerating lunge
      p.z = clamp(p.z, -GOAL_HALF_W - 0.4, GOAL_HALF_W + 0.4);
      p.vx = 0; p.vz = p.diveVx * (p.diveT / 0.72);
      // shootout pens all go at the +X goal → keeper faces the spot (-X)
      p.yaw = state.phase === "shootout" ? Math.PI : (state.attackSign[p.team] > 0 ? 0 : Math.PI);
      p.gait += dt * 6;
      return;
    }

    if (sliding) {
      p.x += p.slideDir[0] * SLIDE_SPEED * (p.slideT / SLIDE_TIME) * dt;
      p.z += p.slideDir[1] * SLIDE_SPEED * (p.slideT / SLIDE_TIME) * dt;
      p.vx = p.slideDir[0] * SLIDE_SPEED * (p.slideT / SLIDE_TIME);
      p.vz = p.slideDir[1] * SLIDE_SPEED * (p.slideT / SLIDE_TIME);
      p.yaw = Math.atan2(p.slideDir[1], p.slideDir[0]);
      // contact → win the ball: once per slide, and never from a keeper holding it in his hands
      const b = state.ball;
      const o = owner();
      if (!p.slideWon && o && o.team !== p.team && b.mode !== "held" && dist2(p.x, p.z, o.x, o.z) < 0.8) {
        p.slideWon = true;
        o.stunT = 0.55;
        b.ownerId = null; b.mode = "loose"; b.freeT = 0;
        b.vx = p.slideDir[0] * 4.4; b.vz = p.slideDir[1] * 4.4; b.y = BALL_R;
        b.lastTouchTeam = p.team; b.lastToucherId = p.id; b.kickerId = p.id; b.lastShot = "none";
        emit({ type: "tackle", team: p.team, playerId: p.id, label: "slide tackle wins it", severity: "success", position: [b.x, b.y, b.z] });
      }
      return;
    }

    if (stunned || celebrating) {
      p.vx *= Math.exp(-6 * dt); p.vz *= Math.exp(-6 * dt);
      p.x += p.vx * dt; p.z += p.vz * dt;
      if (celebrating) p.gait += dt * 8;
      return;
    }

    // movement — a swing in progress plants the kicker: big damping so the
    // strike reads as a planted hit rather than a kick on the run
    const windup = p.pendKick !== null;
    const sprinting = c.sprint && p.stamina > 0.06;
    const cap = p.isKeeper ? GK_SPEED : sprinting ? SPRINT_SPEED : RUN_SPEED;
    const mv = c.move;
    const ml = len2(mv[0], mv[1]);
    const dir: [number, number] = ml > 1 ? [mv[0] / ml, mv[1] / ml] : [mv[0], mv[1]];
    const skillBoost = p.skillT > 0 && p.skill === "stepover" ? 1.25 : 1;
    const accelRate = p.controlled && ml > 0.05 ? Math.max(ACCEL, 28) : ACCEL;
    if (windup) {
      // planted: the standing foot stays on the ground for the whole swing (the baked kick clips hold it still)
      const k = Math.min(1, dt * KICK_PLANT_RATE);
      p.vx = lerp(p.vx, 0, k);
      p.vz = lerp(p.vz, 0, k);
    } else {
      p.vx = lerp(p.vx, dir[0] * cap * Math.min(1, ml) * skillBoost, Math.min(1, dt * accelRate));
      p.vz = lerp(p.vz, dir[1] * cap * Math.min(1, ml) * skillBoost, Math.min(1, dt * accelRate));
    }
    p.x += p.vx * dt; p.z += p.vz * dt;
    p.x = clamp(p.x, -PITCH_HX - 0.6, PITCH_HX + 0.6);
    p.z = clamp(p.z, -PITCH_HZ - 0.4, PITCH_HZ + 0.4);
    p.speed = Math.hypot(p.vx, p.vz);
    if (windup || p.speed > 0.4) {
      // a swing turns the kicker to face the kick so the boot drives the ball along its line
      const want = windup ? Math.atan2(p.pendKick!.dir[1], p.pendKick!.dir[0]) : Math.atan2(p.vz, p.vx);
      let d = want - p.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      p.yaw += d * Math.min(1, dt * (windup ? KICK_TURN_RATE : 11));
    }
    p.gait += p.speed * dt * 1.35;

    // stamina
    p.stamina = clamp(p.stamina + (sprinting && ml > 0.2 ? -dt * 0.16 : dt * 0.09), 0, 1);

    // skill moves (on-ball — not mid-swing)
    const b = state.ball;
    const mine = b.ownerId === p.id && !p.pendKick;
    if (mine && c.skill === "stepover" && p.skillT <= 0) {
      p.skill = "stepover"; p.skillT = 0.42;
      emit({ type: "skill", team: p.team, playerId: p.id, label: "step-over", severity: "info", position: [p.x, 0.4, p.z] });
    } else if (mine && c.skill === "chop" && p.skillT <= 0) {
      p.skill = "chop"; p.skillT = 0.4;
      const lat = norm2(-Math.sin(p.yaw), Math.cos(p.yaw));
      const side = ml > 0.2 ? Math.sign(dir[0] * lat[0] + dir[1] * lat[1]) || 1 : 1;
      releaseBall("loose");
      b.vx = lat[0] * side * 5.2 + p.vx * 0.4; b.vz = lat[1] * side * 5.2 + p.vz * 0.4;
      b.lastTouchTeam = p.team;
      emit({ type: "skill", team: p.team, playerId: p.id, label: "chop — cuts it back", severity: "info", position: [p.x, 0.4, p.z] });
    }

    // slide tackle (defending)
    if (c.slide && !mine && p.slideCooldown <= 0 && p.slideT <= 0 && !p.isKeeper) {
      const o = owner();
      const tx = o ? o.x - p.x : state.ball.x - p.x;
      const tz = o ? o.z - p.z : state.ball.z - p.z;
      const d = len2(tx, tz);
      if (d < 3.4) {
        p.slideDir = norm2(tx, tz); p.slideT = SLIDE_TIME; p.slideCooldown = 1.5; p.slideWon = false;
        emit({ type: "tackle", team: p.team, playerId: p.id, label: "slide tackle", severity: "info", position: [p.x, 0.2, p.z] });
      }
    }

    // kicks (require the ball) — the command starts the swing; contact launches
    // (only in live play: the ball launches in stepBallFlight, which does not run during a kickoff countdown, so a swing
    // started there would finish on screen a second before the ball moved)
    if (mine && (b.mode === "dribble" || b.mode === "controlled") && !p.pendKick && (state.phase === "live" || state.phase === "extratime")) {
      if (c.pass) {
        const aim: [number, number] = ml > 0.25 ? dir : [Math.cos(p.yaw), Math.sin(p.yaw)];
        // a CPU pass names its receiver (ai.ts bestPassLane, never the keeper); the user's pass is picked from the aim
        const named = c.passTo ? (state.players as PlayerInternal[]).find((m) => m.id === c.passTo && m.team === p.team && m.id !== p.id) : undefined;
        const target = named ? leadFor(p, named, c.pass === "driven") : choosePassTarget(p, aim, c.pass === "driven");
        if (target) {
          startKick(p, norm2(target.lead[0] - p.x, target.lead[1] - p.z), c.pass === "driven" ? 0.85 : 0.55, {
            kind: c.pass === "driven" ? "driven" : "pass", targetId: target.p.id,
            targetDist: dist2(p.x, p.z, target.lead[0], target.lead[1])
          });
          // receiver starts for it
          target.p.replanT = 0;
        }
      } else if (c.shoot !== undefined) {
        const power = clamp(c.shoot, 0.15, 1);
        // aim into the goal the team attacks
        const gSign = state.attackSign[p.team];
        const gx = gSign * PITCH_HX;
        const lat = clamp(c.shootAim?.lateral ?? 0, -1, 1);
        const tz = lat * (GOAL_HALF_W - 0.45);
        startKick(p, norm2(gx - p.x, tz - p.z), power, {
          kind: "shot",
          aimLiftDeg: (c.shootAim?.lift ?? 0) * 4,
          spin: lat * -7.5  // release direction curls the flight
        });
      }
    }
  }

  /* --------------------------- main step -------------------------- */

  function step(dt: number, input: UserInputFrame): SimEvent[] {
    events.length = 0;
    if (state.paused) return events;
    const b = state.ball;
    state.phaseT += dt;
    state.simT += dt;
    state.goalFlashT = Math.max(0, state.goalFlashT - dt);

    const hasUserInput =
      Math.hypot(input.move[0], input.move[1]) > 0.05 ||
      input.sprint ||
      input.passShort ||
      input.passDriven ||
      input.shootHeld ||
      input.shootReleased ||
      input.skillStepover ||
      input.skillChop ||
      input.switchPlayer ||
      chargeHeld;

    switch (state.phase) {
      case "kickoff":
        if (state.userTeam !== null && !autopilot && state.kickoffTeam === state.userTeam) {
          if (hasUserInput) {
            state.phase = "live";
            state.phaseT = 0;
            if (!b.ownerId) {
              const fw = nearestOf(state.kickoffTeam, 0, 0, false);
              if (fw) giveBall(fw, false);
            }
          } else {
            // Wait in static formation until the user moves/passes/shoots or enables autopilot
            for (const p of state.players as PlayerInternal[]) {
              applyCommand(p, { move: [0, 0], sprint: false }, dt);
            }
            return events;
          }
        } else if (state.phaseT > 1.0 || hasUserInput) {
          state.phase = "live";
          state.phaseT = 0;
          if (!b.ownerId) {
            const fw = nearestOf(state.kickoffTeam, 0, 0, false);
            if (fw) giveBall(fw, false);
          }
        } else {
          for (const p of state.players as PlayerInternal[]) {
            applyCommand(p, { move: [0, 0], sprint: false }, dt);
          }
          return events;
        }
        break;
      case "live":
        break;
      case "extratime":
        // golden-goal banner: play is held and the clock stays at 0, then a fresh kickoff by the side that did not
        // kick off the second half
        if (state.phaseT > 2.4) {
          state.clock = 0;
          startKickoff(secondHalfKickoff === 0 ? 1 : 0);
          return events;
        }
        for (const p of state.players as PlayerInternal[]) applyCommand(p, { move: [0, 0], sprint: false }, dt);
        publishPossession(dt);
        return events;
      case "goal":
        if (state.phaseT > 3.0) endGoalPhase();
        break;
      case "halftime":
        if (state.phaseT > 2.6) {
          state.half = 2; state.clock = 0;
          state.attackSign = [-state.attackSign[0], -state.attackSign[1]];
          secondHalfKickoff = firstHalfKickoff === 0 ? 1 : 0;
          startKickoff(secondHalfKickoff);
        }
        break;
      case "shootout":
        stepShootout(dt, input);
        for (const p of state.players as PlayerInternal[]) {
          const so = state.shootout;
          let cmd: PlayerCommand = { move: [0, 0], sprint: false };
          if (p.isKeeper && so) {
            const defendingUser = p.team !== so.takerTeam && state.userTeam !== null && p.team === state.userTeam;
            if (so.stage === "kick" && so.stageT > 0.08) {
              if (defendingUser) {
                // user keeper picks a side with W/S (screen up/down = world ∓Z)
                const side = input.move[1] !== 0 ? Math.sign(input.move[1]) : 0;
                cmd = { move: [0, 0], sprint: false, dive: side === 0 ? undefined : (side as -1 | 1) };
              } else if (p.team !== so.takerTeam && p.diveT <= 0 && so.gkDive !== 0) {
                cmd = { move: [0, 0], sprint: false, dive: (so.gkDive >= 0 ? 1 : -1) as -1 | 1 };
                so.gkDive = 0;
              }
            }
          }
          applyCommand(p, cmd, dt);
        }
        publishPossession(dt);
        return events;
      case "restart":
        stepRestart(dt);
        for (const p of state.players as PlayerInternal[]) applyCommand(p, { move: [0, 0], sprint: false }, dt);
        return events;
      case "ended":
        for (const p of state.players as PlayerInternal[]) applyCommand(p, { move: [0, 0], sprint: false }, dt);
        return events;
      case "idle":
      default:
        return events;
    }

    // ------- live / kickoff / ET-banner play -------
    if (state.phase === "goal" || state.phase === "halftime") {
      // celebrations tick down, everyone else holds still — no AI steering
      for (const p of state.players as PlayerInternal[]) {
        applyCommand(p, { move: [0, 0], sprint: false }, dt);
      }
      publishPossession(dt);
      return events;
    }

    state.clock += dt;
    if (state.clock >= clockLimit() && state.phase === "live") timeUp();

    // commands: AI for everyone except the controlled player (when autopilot is off)
    keeperRushHeld = Boolean(
      state.userTeam !== null &&
      input.sprint &&
      state.possessionTeam !== state.userTeam &&
      (state.ball.mode === "loose" || state.ball.mode === "flight") &&
      state.ball.x * state.attackSign[state.userTeam] < -PITCH_HX * 0.25
    );

    for (const p of state.players as PlayerInternal[]) {
      let cmd: PlayerCommand;
      if (state.userTeam !== null && !autopilot && p.id === state.controlledId) {
        cmd = userCommand(p, input);
      } else {
        cmd = planCommand(state, p, dt, keeperRushHeld, aiDifficulty(state.userTeam, p.team, cfg.difficulty), rng);
      }
      (p as PlayerInternal).cmd = cmd;
      applyCommand(p, cmd, dt);
    }

    // ball
    if (state.phase === "live" || state.phase === "extratime") {
      stepBallFlight(dt);
    }

    // keeper distribution — the throw becomes a swing: ball to the boot, then struck
    if (b.mode === "held") {
      const gk = findPlayer(b.ownerId);
      if (gk) {
        gk.holdT -= dt;
        b.x = gk.x + Math.cos(gk.yaw) * 0.4;
        b.z = gk.z + Math.sin(gk.yaw) * 0.4;
        b.y = 0.95;
        if (gk.holdT <= 0) {
          giveBall(gk, false);
          const target = choosePassTarget(gk, [state.attackSign[gk.team], 0], true);
          if (target) {
            startKick(gk, norm2(target.lead[0] - gk.x, target.lead[1] - gk.z), 0.9, { kind: "driven", targetId: target.p.id, targetDist: dist2(gk.x, gk.z, target.lead[0], target.lead[1]) });
          } else {
            startKick(gk, [state.attackSign[gk.team], 0], 0.8, { kind: "clearance" });
          }
        }
      }
    }

    // trail buffer (sample ~each 3rd frame worth of motion)
    if (b.mode === "flight" || Math.hypot(b.vx, b.vz) > 1.5) {
      b.trail.push([b.x, b.y, b.z]);
      if (b.trail.length > 18) b.trail.shift();
    } else if (b.trail.length) b.trail.length = 0;

    publishPossession(dt);
    return events;
  }

  function publishPossession(dt: number) {
    const o = owner();
    if (o) state.possession[o.team] += dt;
    else if (state.ball.lastTouchTeam !== null) state.possession[state.ball.lastTouchTeam] += dt * 0.5;
  }

  function userCommand(p: PlayerInternal, input: UserInputFrame): PlayerCommand {
    const b = state.ball;
    const mine = b.ownerId === p.id;
    const defending = !mine && (state.possessionTeam !== state.userTeam || b.mode === "loose" || b.mode === "flight");

    // charge the shot while held — the swing only starts on release
    if (mine && input.shootHeld) {
      charge = clamp(charge + dt0 / 0.65, 0.25, 1);
      chargeHeld = true;
    }

    const hasDir = Math.hypot(input.move[0], input.move[1]) > 0.05;
    let mv: [number, number] = [0, 0];
    if (hasDir) {
      mv = input.move;
    } else if (assist && mine) {
      mv = [state.attackSign[p.team], Math.sin(state.clock * 1.6) * 0.32];
    } else if (assist && (b.mode === "loose" || b.mode === "flight")) {
      const dx = b.x - p.x, dz = b.z - p.z, d = Math.hypot(dx, dz) || 1;
      mv = [dx / d, dz / d];
    }
    // Shift sprints (and drains stamina); without it the player runs
    const cmd: PlayerCommand = { move: mv, sprint: input.sprint };
    if (mine) {
      if (input.passShort) cmd.pass = "short";
      else if (input.passDriven) cmd.pass = "driven";
      else if (input.skillStepover) cmd.skill = "stepover";
      else if (input.skillChop) cmd.skill = "chop";
      if ((input.shootReleased && chargeHeld) || (input.shootHeld && charge >= 1)) {
        const lateral = clamp(input.move[1], -1, 1);
        const lift = clamp(-input.move[0], -1, 1);
        cmd.shoot = charge;
        cmd.shootAim = { lateral, lift };
        charge = 0; chargeHeld = false;
      } else if (input.shootReleased) {
        cmd.shoot = 0.45; cmd.shootAim = { lateral: clamp(input.move[1], -1, 1), lift: 0 };
      }
    } else {
      charge = 0; chargeHeld = false;
      if (input.skillChop && defending) cmd.slide = true;
    }
    return cmd;
  }

  /* --------------------------- public ------------------------------ */

  return {
    state,
    get chargeLevel() { return chargeHeld ? charge : 0; },
    get autopilot() { return autopilot; },
    setAutopilot(on: boolean) { autopilot = on; },
    get assist() { return assist; },
    setAssist(on: boolean) { assist = on; },
    get seed() { return seed; },
    setUserCelebration(kind: number) { userCelebration = clamp(kind | 0, 0, 3); },
    step(dt: number, input: UserInputFrame): SimEvent[] {
      dt0 = dt;
      // player switching
      if (input.switchPlayer && state.userTeam !== null && state.phase === "live") {
        pickControlled();
      }
      // auto-switch: follow the ball carrier on defense
      if (state.userTeam !== null) {
        const cur = findPlayer(state.controlledId);
        const ownerP = owner();
        if (ownerP && ownerP.team === state.userTeam && state.controlledId !== ownerP.id) {
          setControlled(ownerP.id);
        } else if (!cur || (state.possessionTeam !== state.userTeam && cur.isKeeper)) {
          pickControlled();
          setControlled(state.controlledId);
        }
      }
      return step(dt, input);
    },
    startMatch(c: MatchConfig) {
      cfg = c;
      state.mode = c.mode;
      state.venue = c.venue;
      state.userTeam = c.userTeam;
      state.score = [0, 0]; state.half = 1; state.clock = 0;
      state.attackSign = [1, -1];
      state.possession = [0, 0]; state.possessionTeam = null;
      state.shotsOn = [0, 0]; state.saves = [0, 0]; state.corners = [0, 0];
      state.winner = null; state.shootout = null; state.goldenGoal = c.goldenGoal;
      state.paused = false; state.kicks = 0; state.lastScorer = null;
      charge = 0; chargeHeld = false;
      labPens = false;
      // reseed per match: a match replays from (seed, inputs); the seed is published in the evidence
      seed = (c.seed ?? (SIM_SEED + matchIndex * 0x9e3779b1)) >>> 0;
      matchIndex++;
      rng = makeRng(seed);
      spawnTeams();
      firstHalfKickoff = c.userTeam === null ? ((rng() < 0.5) ? 0 : 1) : c.userTeam;
      secondHalfKickoff = firstHalfKickoff === 0 ? 1 : 0;
      startKickoff(firstHalfKickoff);
    },
    togglePause() {
      state.paused = !state.paused;
      return state.paused;
    },
    spawnLab(kind: "shootout" | "touch") {
      if (kind === "shootout") {
        state.mode = "shootout";
        if (!state.players.length) spawnTeams();
        labPens = true;
        state.userTeam = state.userTeam ?? 0;
        beginShootout();
      } else {
        state.mode = "touch";
        state.phase = "live"; state.phaseT = 0;
        // touch lab: one player, ball fed in
        state.players = (state.players as PlayerInternal[]).length ? state.players : (spawnTeams(), state.players);
        const me = (state.players as PlayerInternal[]).find((p) => p.team === 0 && p.role === "FW")!;
        state.players = [me];
        me.x = 0; me.z = 0; me.vx = 0; me.vz = 0; me.controlled = true;
        state.userTeam = 0; state.controlledId = me.id;
        const b = state.ball;
        b.x = -6; b.y = BALL_R; b.z = 0; b.vx = 4; b.vy = 0; b.vz = 0; b.mode = "loose"; b.ownerId = null; b.freeT = 0; b.rolling = false;
      }
    },
    spawnIdle() {
      state.mode = "menu"; state.phase = "idle"; state.phaseT = 0;
      state.score = [0, 0]; state.half = 1; state.clock = 0;
      state.attackSign = [1, -1];
      state.shootout = null; state.winner = null; state.paused = false;
      spawnTeams();
      toAnchors("all", true);
      const b = state.ball;
      b.x = 0; b.y = BALL_R; b.z = 0; b.vx = 0; b.vy = 0; b.vz = 0; b.spin = 0; b.rolling = false;
      b.mode = "dead"; b.ownerId = null; b.trail.length = 0;
    }
  };
}
