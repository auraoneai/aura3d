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
import { planCommand } from "./ai";

/* ------------------------------------------------------------------ *
 *  Dimensions live in ./dims (shared with ai.ts + scene.ts)           *
 * ------------------------------------------------------------------ */

export {
  PITCH_HX, PITCH_HZ, GOAL_HALF_W, GOAL_H, GOAL_DEPTH, BOX_DEPTH, BOX_HALF_W,
  PEN_X, CIRCLE_R, BALL_R
} from "./dims";
import {
  PITCH_HX, PITCH_HZ, GOAL_HALF_W, GOAL_H, PEN_X, BALL_R,
  HALF_LEN, ET_LEN, RUN_SPEED, SPRINT_SPEED, GK_SPEED, ACCEL,
  TRAP_R, TRAP_H, KICK_R, SLIDE_TIME, SLIDE_SPEED, KEEPER_REACH
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

/** deterministic per-match RNG */
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 0xffffffff; };
}

/* ------------------------------------------------------------------ */

export interface Sim {
  readonly state: MatchState;
  /** 0..1 while the user is charging a shot — drives the HUD meter. */
  readonly chargeLevel: number;
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
}

export function createSim(): Sim {
  const events: SimEvent[] = [];
  const rng = makeRng(0xf0a7ba11);
  let cfg: MatchConfig = {
    mode: "quick", venue: "munich", homeClub: "aurora", awayClub: "iron",
    userTeam: 0, difficulty: 0.6, goldenGoal: true, shootoutOnTie: true
  };
  let charge = 0;
  let chargeHeld = false;
  let dt0 = 1 / 60;
  let labPens = false;          // shootout lab: user takes every penalty
  let keeperRushHeld = false;   // user holds sprint off-ball → GK rushes out

  const emit = (e: SimEvent) => events.push(e);

  const state: MatchState = {
    mode: "menu", phase: "idle", phaseT: 0,
    half: 1, clock: 0, score: [0, 0], attackSign: [1, -1],
    ball: {
      x: 0, y: BALL_R, z: 0, vx: 0, vy: 0, vz: 0, spin: 0,
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
    ["gk", [-23.2, 0], "GK"],
    ["df0", [-13.5, -7.2], "DF"],
    ["df1", [-13.5, 7.2], "DF"],
    ["mf", [-5.5, 0], "MF"],
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
          kickT: 0, kickPower: 0, skillT: 0, skill: "none",
          celebrateT: 0, celebrateKind: 0, diveT: 0, diveDir: 0, diveVx: 0,
          stunT: 0, controlled: false, isKeeper: role === "GK", trapT: 0, holdT: 0,
          gait: Math.random() * 6,
          replanT: 0, cmd: { move: [0, 0], sprint: false }
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
      p.x = s * ax; p.z = az; p.vx = 0; p.vz = 0;
      p.yaw = s > 0 ? 0 : Math.PI;
      p.slideT = 0; p.skillT = 0; p.diveT = 0; p.stunT = 0; p.holdT = 0;
      p.kickT = 0; p.celebrateT = 0; p.trapT = 0;
    }
  }

  function startKickoff(team: TeamId) {
    toAnchors("all", true);
    const b = state.ball;
    b.x = 0; b.y = BALL_R; b.z = 0; b.vx = 0; b.vy = 0; b.vz = 0; b.spin = 0;
    b.mode = "dead"; b.ownerId = null; b.intendedTargetId = null; b.freeT = 0;
    b.lastShot = "none"; b.trail.length = 0;
    state.phase = "kickoff"; state.phaseT = 0; state.kickoffTeam = team;
    pickControlled();
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

  function kick(p: PlayerInternal, dir: [number, number], power: number, opts: {
    lift?: number; spin?: number; kind: BallState["lastShot"]; targetId?: string | null;
  }) {
    const b = state.ball;
    const speed = opts.kind === "shot" ? 12 + power * 13
      : opts.kind === "driven" ? 15 + power * 8
      : opts.kind === "cross" ? 13.5
      : 7 + power * 6.5;
    const dv = norm2(dir[0], dir[1]);
    b.x = p.x + dv[0] * (KICK_R * 0.6); b.z = p.z + dv[1] * (KICK_R * 0.6); b.y = BALL_R;
    b.vx = dv[0] * speed; b.vz = dv[1] * speed;
    b.vy = opts.lift ?? (opts.kind === "shot" ? 1.2 + power * 3.6 : opts.kind === "driven" ? 0.8 : 0.15);
    b.spin = opts.spin ?? 0;
    b.ownerId = null; b.mode = "flight"; b.freeT = 0;
    b.kickerId = p.id; b.lastToucherId = p.id; b.lastTouchTeam = p.team;
    b.intendedTargetId = opts.targetId ?? null;
    b.lastShot = opts.kind; b.shotPower = opts.kind === "shot" ? power : 0;
    p.kickT = 0.32; p.kickPower = power;
    state.kicks++;
    emit({
      type: opts.kind === "shot" ? "shot" : "pass", team: p.team, playerId: p.id,
      label: opts.kind === "shot" ? `shot — power ${(power * 100) | 0}%` : opts.kind === "driven" ? "driven pass" : "pass",
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
      const score = dot * 4 + open * 0.9 + forward * 0.12 - Math.abs(d - (driven ? 11 : 7)) * 0.25;
      if (score > bestScore) { bestScore = score; best = m; }
    }
    if (!best) return null;
    // lead the runner
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
    if (scorer) { scorer.celebrateT = 2.6; scorer.celebrateKind = (rng() * 4) | 0; }
    for (const p of state.players) if (p.team === team && !p.isKeeper) p.celebrateT = Math.max(p.celebrateT, 1.6);
    const golden = state.half === 3;
    emit({ type: "goal", team, playerId: scorerId ?? undefined, label: golden ? `GOLDEN GOAL — ${team === 0 ? "home" : "away"} wins it` : `GOAL — ${team === 0 ? "home" : "away"}`, severity: "success", position: [state.ball.x, 1, state.ball.z] });
    state.ball.mode = "dead"; state.ball.vx = 0; state.ball.vz = 0; state.ball.vy = 0;
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
      gkDive: 0, pendingMiss: false
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
      p.slideT = 0; p.diveT = 0; p.skillT = 0; p.stunT = 0; p.holdT = 0; p.kickT = 0; p.celebrateT = 0; p.trapT = 0;
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
    taker.x = PEN_X + 1.8; taker.z = 0; taker.yaw = 0;
    const b = state.ball;
    b.x = PEN_X; b.y = BALL_R; b.z = 0; b.vx = 0; b.vy = 0; b.vz = 0; b.spin = 0;
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
    const rem0 = Math.max(0, 5 - so.taken[0]);
    const rem1 = Math.max(0, 5 - so.taken[1]);
    if (so.scores[0] > so.scores[1] + rem1) return 0;
    if (so.scores[1] > so.scores[0] + rem0) return 1;
    if (so.taken[0] >= 5 && so.taken[1] >= 5 && so.taken[0] === so.taken[1]) {
      if (so.scores[0] !== so.scores[1]) return so.scores[0] > so.scores[1] ? 0 : 1;
      return null;
    }
    return null;
  }

  function firePenalty(power: number, aim: [number, number]) {
    const so = state.shootout!;
    const taker = findPlayer(state.ball.ownerId);
    if (!taker) return;
    // aim[0] = z placement in mouth, aim[1] = height
    const target: [number, number] = [PITCH_HX - 0.05, aim[0]];
    const dir = norm2(target[0] - state.ball.x, target[1] - state.ball.z);
    // accuracy error shrinks with power but wild aims can miss the frame
    const err = (1 - power) * 0.5 + (rng() - 0.5) * 0.22;
    const zAtLine = aim[0] + err * 1.4;
    const missesFrame = Math.abs(zAtLine) > GOAL_HALF_W - 0.1 || aim[1] > GOAL_H - 0.1;
    kick(taker, dir, Math.max(0.5, power), { lift: 0.6 + aim[1] * 1.15, kind: "shot" });
    so.stage = "kick"; so.stageT = 0;
    so.pendingMiss = missesFrame;
    // CPU keeper guesses a side — better placement into the corners is harder to read
    const defGk = (state.players as PlayerInternal[]).find((p) => p.isKeeper && p.team !== taker.team);
    if (defGk && defGk.team !== state.userTeam) {
      const reads = rng() < 0.38 + (1 - power) * 0.3;
      const correctSide = Math.abs(zAtLine) < 0.4 ? 0 : Math.sign(zAtLine);
      defGk.diveDir = reads ? correctSide : (rng() < 0.5 ? -1 : 1);
      so.gkDive = defGk.diveDir;
    } else {
      so.gkDive = 0;
    }
    emit({ type: "penalty", team: taker.team, label: "penalty taken", severity: "info", position: [state.ball.x, 0.2, state.ball.z] });
  }

  function resolvePenalty(outcome: "goal" | "save" | "miss") {
    const so = state.shootout!;
    if (outcome === "goal") {
      so.scores[so.takerTeam]++;
      so.resultText = "SCORED";
      emit({ type: "pen-goal", team: so.takerTeam, label: `pen scored — ${so.scores[0]}-${so.scores[1]}`, severity: "success" });
    } else {
      so.resultText = outcome === "save" ? "SAVED" : "OFF TARGET";
      emit({ type: outcome === "save" ? "pen-save" : "pen-miss", team: so.takerTeam, label: outcome === "save" ? "penalty saved" : "penalty missed", severity: "warn" });
    }
    state.ball.mode = "dead";
  }

  /* --------------------------- out / walls ------------------------ */

  function outOfBounds() {
    const b = state.ball;
    const v = VENUES[state.venue];
    // Walled cage: bounce off the boards, play on.
    if (v.walled) {
      const mx = PITCH_HX - BALL_R, mz = PITCH_HZ - BALL_R;
      let bounced = false;
      if (Math.abs(b.x) > mx) { b.x = Math.sign(b.x) * mx; b.vx = -b.vx * 0.58; bounced = true; }
      if (Math.abs(b.z) > mz) { b.z = Math.sign(b.z) * mz; b.vz = -b.vz * 0.58; bounced = true; }
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
    // walk the taker to the spot fast
    const to = norm2(spot[0] - taker.x, spot[1] - taker.z);
    const d = dist2(taker.x, taker.z, spot[0], spot[1]);
    if (d > 0.5) { taker.vx = to[0] * 4.5; taker.vz = to[1] * 4.5; taker.x += taker.vx * dt; taker.z += taker.vz * dt; }
    const b = state.ball;
    b.x = lerp(b.x, spot[0], Math.min(1, dt * 10));
    b.z = lerp(b.z, spot[1], Math.min(1, dt * 10));
    b.y = BALL_R; b.vx = 0; b.vy = 0; b.vz = 0; b.spin = 0;
    if (state.restartT < 0.95) return;

    if (state.restartKind === "goalkick") {
      const gk = (state.players as PlayerInternal[]).find((p) => p.team === team && p.isKeeper)!;
      gk.x = spot[0]; gk.z = spot[1];
      giveBall(gk, false);
      gk.holdT = 0.001; // distribute quickly next frame
      state.phase = "live"; state.phaseT = 0;
    } else if (state.restartKind === "corner") {
      giveBall(taker, false);
      // auto-cross into the box centre-high
      const goalSign = -state.attackSign[team];
      const cx = goalSign * (PITCH_HX - 3.4);
      kick(taker, norm2(cx - taker.x, 0 - taker.z), 0.9, { lift: 3.4, kind: "cross" });
      state.phase = "live"; state.phaseT = 0;
    } else {
      // kick-in: short pass to nearest open teammate
      giveBall(taker, false);
      const target = choosePassTarget(taker, [state.attackSign[team], 0], false);
      if (target) kick(taker, norm2(target.lead[0] - taker.x, target.lead[1] - taker.z), 0.55, { kind: "pass", targetId: target.p.id });
      state.phase = "live"; state.phaseT = 0;
    }
  }

  function nearestOf(team: TeamId, x: number, z: number, includeGk: boolean): PlayerInternal {
    let best: PlayerInternal | undefined;
    let bd = Infinity;
    for (const p of state.players as PlayerInternal[]) {
      if (p.team !== team || (!includeGk && p.isKeeper)) continue;
      const d = dist2(p.x, p.z, x, z);
      if (d < bd) { bd = d; best = p; }
    }
    return best ?? (state.players as PlayerInternal[]).find((p) => p.team === team)!;
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
      const o = owner();
      if (!o) { b.mode = "loose"; return true; }
      b.controlT = Math.max(0, b.controlT - dt);
      if (b.mode === "controlled" && b.controlT <= 0) b.mode = "dribble";
      // dribble-stick: ball rides ahead of the feet; sprint knocks it on
      const ahead = o.skill === "chop" && o.skillT > 0 ? 0.8 : 0.42 + (o.speed > RUN_SPEED + 0.4 ? 0.22 : 0);
      const tx = o.x + Math.cos(o.yaw) * ahead;
      const tz = o.z + Math.sin(o.yaw) * ahead;
      b.x = lerp(b.x, tx, Math.min(1, dt * 13));
      b.z = lerp(b.z, tz, Math.min(1, dt * 13));
      b.y = BALL_R; b.vx = o.vx; b.vz = o.vz; b.vy = 0; b.spin = 0;
      state.possessionTeam = o.team;
      return true;
    }
    if (b.mode === "dead") return true;

    // loose / flight — integrate
    b.vy -= 9.81 * dt;
    const drag = Math.exp(-0.10 * dt);
    b.vx *= drag; b.vy *= drag; b.vz *= drag;
    // Magnus curl: lateral accel perpendicular to travel
    const hv = Math.hypot(b.vx, b.vz);
    if (Math.abs(b.spin) > 0.05 && hv > 0.5) {
      const px = -b.vz / hv, pz = b.vx / hv;
      const mag = b.spin * 0.34 * Math.min(1.3, hv * 0.09);
      b.vx += px * mag * dt * 60 * 0.016;
      b.vz += pz * mag * dt * 60 * 0.016;
    }
    b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;

    // ground
    if (b.y <= BALL_R) {
      b.y = BALL_R;
      if (b.vy < -0.9) {
        b.vy = Math.abs(b.vy) * 0.58;
        emit({ type: "bounce", label: "bounce", severity: "info", position: [b.x, b.y, b.z], value: Math.abs(b.vy) });
      } else {
        b.vy = 0;
        if (b.mode === "flight" && Math.hypot(b.vx, b.vz) < 8) b.mode = "loose";
      }
      const roll = Math.exp(-(b.mode === "loose" ? 1.9 : 0.55) * dt);
      b.vx *= roll; b.vz *= roll; b.spin *= Math.exp(-2.2 * dt);
      if (b.mode === "loose" && Math.hypot(b.vx, b.vz) < 0.08) { b.vx = 0; b.vz = 0; }
    }

    // goal posts / bar — clank detection near each goal line
    for (const gx of [-PITCH_HX, PITCH_HX]) {
      if (Math.abs(b.x - gx) > 0.38) continue;
      const post = Math.abs(Math.abs(b.z) - GOAL_HALF_W) < 0.16 && b.y < GOAL_H;
      const bar = Math.abs(b.y - GOAL_H) < 0.18 && Math.abs(b.z) < GOAL_HALF_W + 0.1;
      if (post && Math.sign(b.vx) === Math.sign(gx)) {
        b.x = gx - Math.sign(b.vx) * 0.24; b.vx = -b.vx * 0.5; b.vz *= 0.6;
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
      goal(scoringTeam, b.lastToucherId);
      return true;
    }

    // keeper catch / outfield trap
    for (const p of state.players as PlayerInternal[]) {
      if (p.id === b.kickerId && b.freeT < 0.4) continue;   // kicker can't instantly re-trap
      const reach = p.isKeeper ? KEEPER_REACH + (p.diveT > 0 ? 0.5 : 0) : TRAP_R;
      const maxH = p.isKeeper ? 2.3 : TRAP_H;
      const d = dist2(p.x, p.z, b.x, b.z);
      if (d < reach && b.y < maxH) {
        if (p.isKeeper && (b.mode === "flight" || Math.hypot(b.vx, b.vz) > 3)) {
          // keeper gathers — a save if it was a shot
          if (b.lastShot === "shot") {
            state.saves[p.team]++;
            emit({ type: "save", team: p.team, playerId: p.id, label: "keeper save", severity: "success", position: [b.x, b.y, b.z] });
            if (state.phase === "shootout") { resolvePenalty("save"); return true; }
          }
          b.ownerId = p.id; b.mode = "held"; b.lastTouchTeam = p.team; p.holdT = 1.0;
          p.vx = 0; p.vz = 0;
          state.possessionTeam = p.team;
          if (state.userTeam !== null && p.team === state.userTeam) setControlled(nearestOf(p.team, 0, 0, false).id);
          return true;
        }
        if (b.mode === "flight" && b.lastShot === "shot" && p.team !== state.possessionTeam) {
          // outfield block: pops loose
          b.vx = -b.vx * 0.35; b.vz *= 0.5; b.vy = Math.abs(b.vy) * 0.4; b.mode = "loose";
          b.lastTouchTeam = p.team;
          return true;
        }
        giveBall(p, true);
        if (state.phase === "shootout") { /* taker regained a rebound — let play continue */ }
        return true;
      }
    }

    // slide-tackle dispossession happens in player step (contact with dribbler)

    // out of bounds
    if (Math.abs(b.x) > PITCH_HX + 0.2 || Math.abs(b.z) > PITCH_HZ + 0.2) {
      if (state.phase === "shootout") { resolvePenalty("miss"); return true; }
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
      // contact → win the ball
      const b = state.ball;
      const o = owner();
      if (o && o.team !== p.team && dist2(p.x, p.z, o.x, o.z) < 0.8) {
        o.stunT = 0.55;
        b.ownerId = null; b.mode = "loose"; b.freeT = 0;
        b.vx = p.slideDir[0] * 4.4; b.vz = p.slideDir[1] * 4.4; b.y = BALL_R;
        b.lastTouchTeam = p.team;
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

    // movement
    const sprinting = c.sprint && p.stamina > 0.06;
    const cap = p.isKeeper ? GK_SPEED : sprinting ? SPRINT_SPEED : RUN_SPEED;
    const mv = c.move;
    const ml = len2(mv[0], mv[1]);
    const dir: [number, number] = ml > 1 ? [mv[0] / ml, mv[1] / ml] : [mv[0], mv[1]];
    const skillBoost = p.skillT > 0 && p.skill === "stepover" ? 1.25 : 1;
    p.vx = lerp(p.vx, dir[0] * cap * Math.min(1, ml) * skillBoost, Math.min(1, dt * ACCEL));
    p.vz = lerp(p.vz, dir[1] * cap * Math.min(1, ml) * skillBoost, Math.min(1, dt * ACCEL));
    p.x += p.vx * dt; p.z += p.vz * dt;
    p.x = clamp(p.x, -PITCH_HX - 0.6, PITCH_HX + 0.6);
    p.z = clamp(p.z, -PITCH_HZ - 0.4, PITCH_HZ + 0.4);
    p.speed = Math.hypot(p.vx, p.vz);
    if (p.speed > 0.4) {
      const want = Math.atan2(p.vz, p.vx);
      let d = want - p.yaw;
      while (d > Math.PI) d -= Math.PI * 2;
      while (d < -Math.PI) d += Math.PI * 2;
      p.yaw += d * Math.min(1, dt * 11);
    }
    p.gait += p.speed * dt * 1.35;

    // stamina
    p.stamina = clamp(p.stamina + (sprinting && ml > 0.2 ? -dt * 0.16 : dt * 0.09), 0, 1);

    // skill moves (on-ball)
    const b = state.ball;
    const mine = b.ownerId === p.id;
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
        p.slideDir = norm2(tx, tz); p.slideT = SLIDE_TIME; p.slideCooldown = 1.5;
        emit({ type: "tackle", team: p.team, playerId: p.id, label: "slide tackle", severity: "info", position: [p.x, 0.2, p.z] });
      }
    }

    // kicks (require the ball)
    if (mine && (b.mode === "dribble" || b.mode === "controlled")) {
      if (c.pass) {
        const aim: [number, number] = ml > 0.25 ? dir : [Math.cos(p.yaw), Math.sin(p.yaw)];
        const target = choosePassTarget(p, aim, c.pass === "driven");
        if (target) {
          kick(p, norm2(target.lead[0] - p.x, target.lead[1] - p.z), c.pass === "driven" ? 0.85 : 0.55, {
            kind: c.pass === "driven" ? "driven" : "pass", targetId: target.p.id,
            lift: c.pass === "driven" ? 0.9 : 0.1
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
        kick(p, norm2(gx - p.x, tz - p.z), power, {
          kind: "shot",
          lift: 1.0 + power * 2.6 + (c.shootAim?.lift ?? 0) * 2.0,
          spin: lat * -7.5  // release direction curls the flight
        });
        state.shotsOn[p.team]++;
      }
    }
  }

  /* --------------------------- main step -------------------------- */

  function step(dt: number, input: UserInputFrame): SimEvent[] {
    events.length = 0;
    if (state.paused) return events;
    const b = state.ball;
    state.phaseT += dt;
    state.goalFlashT = Math.max(0, state.goalFlashT - dt);

    switch (state.phase) {
      case "kickoff":
        if (state.phaseT > 1.35) {
          state.phase = "live"; state.phaseT = 0;
          const fw = nearestOf(state.kickoffTeam, 0, 0, false);
          giveBall(fw, false);
        }
        break;
      case "live":
        break;
      case "extratime":
        // golden-goal banner, then a fresh kickoff
        if (state.phaseT > 2.4) startKickoff(0);
        break;
      case "goal":
        if (state.phaseT > 3.0) endGoalPhase();
        break;
      case "halftime":
        if (state.phaseT > 2.6) {
          state.half = 2; state.clock = 0;
          state.attackSign = [-state.attackSign[0], -state.attackSign[1]];
          startKickoff(state.kickoffTeam === 0 ? 1 : 0);
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
              } else if (p.diveT <= 0 && so.gkDive !== 0) {
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

    // commands: AI for everyone except the controlled player
    keeperRushHeld = Boolean(
      state.userTeam !== null &&
      input.sprint &&
      state.possessionTeam !== state.userTeam &&
      (state.ball.mode === "loose" || state.ball.mode === "flight") &&
      state.ball.x * state.attackSign[state.userTeam] < -PITCH_HX * 0.25
    );
    for (const p of state.players as PlayerInternal[]) {
      let cmd: PlayerCommand;
      if (state.userTeam !== null && p.id === state.controlledId) {
        cmd = userCommand(p, input);
      } else {
        cmd = planCommand(state, p, dt, keeperRushHeld, cfg.difficulty);
      }
      (p as PlayerInternal).cmd = cmd;
      applyCommand(p, cmd, dt);
    }

    // ball
    if (state.phase === "live" || state.phase === "extratime") {
      stepBallFlight(dt);
    }

    // keeper distribution
    if (b.mode === "held") {
      const gk = findPlayer(b.ownerId);
      if (gk) {
        gk.holdT -= dt;
        b.x = gk.x + Math.cos(gk.yaw) * 0.4;
        b.z = gk.z + Math.sin(gk.yaw) * 0.4;
        b.y = 0.95;
        if (gk.holdT <= 0) {
          const target = choosePassTarget(gk, [state.attackSign[gk.team], 0], true);
          if (target) {
            kick(gk, norm2(target.lead[0] - gk.x, target.lead[1] - gk.z), 0.9, { kind: "driven", targetId: target.p.id, lift: 1.4 });
          } else {
            kick(gk, [state.attackSign[gk.team], 0], 0.8, { kind: "driven", lift: 2.0 });
          }
          b.lastShot = "clearance";
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

    // charge the shot while held
    if (mine && input.shootHeld) { charge = clamp(charge + dt0 / 0.8, 0.1, 1); chargeHeld = true; }

    const cmd: PlayerCommand = { move: input.move, sprint: input.sprint };
    if (mine) {
      if (input.passShort) cmd.pass = "short";
      else if (input.passDriven) cmd.pass = "driven";
      else if (input.skillStepover) cmd.skill = "stepover";
      else if (input.skillChop) cmd.skill = "chop";
      if (input.shootReleased && chargeHeld) {
        const lateral = clamp(input.move[1], -1, 1);
        const lift = clamp(-input.move[0], -1, 1);
        cmd.shoot = charge;
        cmd.shootAim = { lateral, lift };
        charge = 0; chargeHeld = false;
      } else if (input.shootReleased) {
        cmd.shoot = 0.35; cmd.shootAim = { lateral: clamp(input.move[1], -1, 1), lift: 0 };
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
    step(dt: number, input: UserInputFrame): SimEvent[] {
      dt0 = dt;
      // player switching
      if (input.switchPlayer && state.userTeam !== null && state.phase === "live") {
        pickControlled();
      }
      // auto-switch: follow the ball carrier on defense
      if (state.userTeam !== null) {
        const cur = findPlayer(state.controlledId);
        const b = state.ball;
        const ownerP = owner();
        if (ownerP && ownerP.team === state.userTeam && state.controlledId !== ownerP.id) {
          setControlled(ownerP.id);
        } else if (!cur || (state.possessionTeam !== state.userTeam && cur.isKeeper)) {
          pickControlled();
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
      spawnTeams();
      startKickoff(c.userTeam === null ? ((rng() < 0.5) ? 0 : 1) : c.userTeam);
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
        b.x = -6; b.y = BALL_R; b.z = 0; b.vx = 4; b.vy = 0; b.vz = 0; b.mode = "loose"; b.ownerId = null; b.freeT = 0;
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
      b.x = 0; b.y = BALL_R; b.z = 0; b.vx = 0; b.vy = 0; b.vz = 0; b.spin = 0;
      b.mode = "dead"; b.ownerId = null; b.trail.length = 0;
    }
  };
}
