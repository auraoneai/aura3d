/**
 * Red Zone 3D — the football simulation core.
 *
 * Pure TypeScript, renderer-agnostic. `createSim` returns a state machine:
 *   preSnap → live → playOver → (next down | patChoice | kickoff | gameOver)
 *
 * Field space: world units are yards; attack direction `dir` (+1 → z=100,
 * -1 → z=0). The user team is always "home" on the HUD and always attacks
 * +z; the CPU attacks -z. Route stems are authored in attack space.
 */
import {
  FIELD, type AthleteState, type Club, type CoverageShell, type GameMode,
  type GameState, type PlayDef, type PlayType, type SimCommand, type SimEvents
} from "./types";
import { DEFENSE_ALIGN, MAN_ASSIGN, OFFENSE_ALIGN, ZONE_DROPS, drawPlaySheet, pickCoverage, playsByType } from "./plays";
import { stadiumById } from "./stadiums";

/* ------------------------------------------------------------------ */
/* Deterministic RNG + small math                                       */
/* ------------------------------------------------------------------ */

function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 0xffffffff;
  };
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const dist2d = (ax: number, az: number, bx: number, bz: number) => Math.hypot(ax - bx, az - bz);

/* ------------------------------------------------------------------ */
/* Tunables                                                             */
/* ------------------------------------------------------------------ */

const BASE_RUN = 7.1;
const PURSUIT = 7.55;
const QB_DROP_SPEED = 4.6;
const TACKLE_RADIUS = 1.05;
const HITSTICK_RADIUS = 1.55;
const CATCH_RADIUS = 1.7;
const DEF_CATCH_RADIUS = 1.5;
const GRAVITY = 26;
const QUARTER_LEN = 60;

function attrSet(rating: number, role: string): AthleteState["attrs"] {
  const bump = (v: number) => clamp(v * rating, 0.5, 1.15);
  switch (role) {
    case "qb": return { speed: bump(0.62), power: 0.8, hands: 0.75, aware: bump(0.95) };
    case "c": return { speed: 0.5, power: bump(0.98), hands: 0.72, aware: 0.75 };
    case "rb": return { speed: bump(0.88), power: bump(0.9), hands: 0.72, aware: 0.7 };
    case "wl": case "wr": case "sl": case "sr": return { speed: bump(0.95), power: 0.6, hands: bump(0.92), aware: 0.75 };
    case "dl1": case "dl2": return { speed: 0.62, power: bump(0.96), hands: 0.5, aware: 0.7 };
    case "lb1": case "lb2": return { speed: bump(0.74), power: bump(0.85), hands: 0.62, aware: bump(0.8) };
    case "cb1": case "cb2": case "s": return { speed: bump(0.92), power: 0.6, hands: bump(0.8), aware: bump(0.85) };
    default: return { speed: 0.7, power: 0.7, hands: 0.7, aware: 0.7 };
  }
}

function mkAthlete(id: string, slot: string, unit: "offense" | "defense", ai: "cpu" | "user", rating: number): AthleteState {
  return {
    id, slot, unit, ai,
    x: 0, z: 0, yaw: 0, speed: 0, tx: 0, tz: 0, vx: 0, vz: 0,
    pose: "stance2", poseT: 0, runPhase: 0, hasBall: false,
    routeT: 0, down: false, stunT: 0,
    attrs: attrSet(rating, slot)
  };
}

export interface SimOptions { events: SimEvents; seed?: number }
export interface StartOpts {
  venue: string;
  quarterLen?: number;
  difficulty?: number;
  patAuto?: boolean;
}

export function createSim(opts: SimOptions) {
  const ev = opts.events;
  const rng = makeRng(opts.seed ?? 0x7ed2f00d);
  const state = freshState();
  let quarterLen = QUARTER_LEN;
  let difficulty = 1.0;
  let sheet: readonly [PlayDef, PlayDef, PlayDef] | null = null;
  let selectedCard = 0;
  let preSnapT = 0;
  let playOverT = 0;
  let kickoffT = 0;
  let patT = 0;
  let huddleDone = false;
  let cpuCallDone = false;
  let jukeT = 0;
  let truckT = 0;
  let diveT = 0;
  let diveDir = 0;
  let blockShed: Record<string, number> = {};
  let throwCooldown = 0;
  let fumbleResolveT = 0;
  let turnoverDuringPlay = false;
  let pendingTwo = false;
  let labReps = { total: 0, made: 0, perfect: 0 };
  let tackleLab = { rep: 0, best: 99, total: 0, allowed: 0 };

  function freshState(): GameState {
    const clubA = { id: "forge" } as unknown as Club;
    return {
      mode: "idle", phase: "idle", venue: "friday",
      quarter: 1, clock: QUARTER_LEN, clockRunning: false,
      down: 1, toGo: 10, los: FIELD.DRIVE_START, firstDownLine: FIELD.DRIVE_START + 10,
      dir: 1, possession: "user", ballSpotX: 0,
      userTeam: clubA, cpuTeam: clubA,
      score: { home: 0, away: 0 },
      athletes: [], ball: { kind: "dead", x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, aimX: 0, aimZ: 0, flightT: 0, eta: 0 },
      coverage: "cover2", snapT: 0, throwCharge: 0,
      aim: { x: 0, z: 0 },
      overReason: "", lastCall: "", lastGain: 0, ot: false, gameT: 0, pressure: 0,
      studio: { clubId: "forge", jersey: "#f2a71b", pants: "#1c2430", helmet: "#1c2430", visor: "#f2a71b" },
      stats: { passYds: 0, rushYds: 0, plays: 0, turnovers: 0, sacks: 0, ints: 0, fumbles: 0, tds: 0 }
    };
  }

  /* ---------------- team / venue / mode setup ---------------- */

  function startGame(mode: GameMode, userTeam: Club, cpuTeam: Club, o: StartOpts) {
    const s = state;
    s.mode = mode;
    s.userTeam = userTeam;
    s.cpuTeam = cpuTeam;
    s.venue = o.venue;
    quarterLen = o.quarterLen ?? QUARTER_LEN;
    difficulty = o.difficulty ?? 1.0;
    s.quarter = 1; s.clock = quarterLen; s.ot = false;
    s.score = { home: 0, away: 0 };
    s.stats = { passYds: 0, rushYds: 0, plays: 0, turnovers: 0, sacks: 0, ints: 0, fumbles: 0, tds: 0 };
    s.gameT = 0;
    pendingTwo = false;
    labReps = { total: 0, made: 0, perfect: 0 };
    tackleLab = { rep: 0, best: 99, total: 0, allowed: 0 };
    if (mode === "routelab") {
      s.labScore = { made: 0, total: 0, perfect: 0, rep: 1, reps: 8, grade: "—" };
      startDrive("user", 62, true);
      s.phase = "preSnap";
    } else if (mode === "tacklelab") {
      s.labScore = { made: 0, total: 0, perfect: 0, rep: 1, reps: 6, grade: "—" };
      startLabRep();
      s.phase = "live";
      s.snapT = 0;
    } else {
      startDrive("user", FIELD.DRIVE_START, true);
      s.phase = "preSnap";
    }
    ev.call("system", `${mode === "quickplay" ? "quick play kickoff" : mode === "series" ? "gridiron series" : mode === "routelab" ? "route lab" : "tackle lab"} — ${userTeam.name} vs ${cpuTeam.name}`, "info");
  }

  function setVenue(id: string) { state.venue = id; }

  const offClub = (): Club => state.possession === "user" ? state.userTeam : state.cpuTeam;
  const defClub = (): Club => state.possession === "user" ? state.cpuTeam : state.userTeam;
  const goalZ = () => (state.dir === 1 ? FIELD.GOAL_FAR : FIELD.GOAL_NEAR);
  const goalLineCrossed = (z: number) => (state.dir === 1 ? z >= FIELD.GOAL_FAR : z <= FIELD.GOAL_NEAR);
  const ownGoalCrossed = (z: number) => (state.dir === 1 ? z <= FIELD.GOAL_NEAR : z >= FIELD.GOAL_FAR);

  function startDrive(poss: "user" | "cpu", los: number, resetDowns: boolean) {
    const s = state;
    s.possession = poss;
    s.dir = poss === "user" ? 1 : -1;
    s.los = clamp(los, 3, 97);
    if (resetDowns) {
      s.down = 1;
      s.toGo = s.dir === 1 ? Math.min(10, FIELD.GOAL_FAR - s.los) : Math.min(10, s.los);
      s.firstDownLine = s.los + s.toGo * s.dir;
    }
    s.ballSpotX = 0;
    s.ball = { kind: "dead", x: s.ballSpotX, y: 0.32, z: s.los, vx: 0, vy: 0, vz: 0, aimX: 0, aimZ: 0, flightT: 0, eta: 0 };
    s.userControlled = poss === "cpu" ? "def-s" : "off-qb";
    s.carrier = undefined;
    s.qbId = "off-qb";
    s.coverage = "cover2";
    s.clockRunning = false;
    turnoverDuringPlay = false;
    huddleDone = true; cpuCallDone = false; preSnapT = 0; selectedCard = 0;
    lineup();
    if (poss === "user") {
      refreshSheet();
      pickPlay(selectedCard);
    }
  }

  /* ---------------- lineup ---------------- */

  function lineup() {
    const s = state;
    s.athletes = [];
    const offRating = offClub().rating;
    const defRating = defClub().rating * difficulty;
    const px = s.ballSpotX;

    for (const a of OFFENSE_ALIGN) {
      const userSteers = s.possession === "user" && a.slot === "qb";
      const at = mkAthlete(`off-${a.slot}`, a.slot, "offense", userSteers ? "user" : "cpu", offRating);
      at.x = clamp(px + a.dx, -FIELD.HALF_WIDTH - 1, FIELD.HALF_WIDTH + 1);
      at.z = s.los + a.dz * s.dir;
      at.yaw = s.dir === 1 ? 0 : Math.PI;
      at.tx = at.x; at.tz = at.z;
      at.pose = a.stance === "three" ? "stance3" : "stance2";
      s.athletes.push(at);
    }
    s.coverage = pickCoverage(defClub(), rng, { longYards: s.toGo > 7, lateDown: s.down >= 3 });
    const shell = DEFENSE_ALIGN[s.coverage] ?? DEFENSE_ALIGN.cover2;
    for (const a of shell) {
      const userSteers = s.possession === "cpu" && a.slot === "s";
      const at = mkAthlete(`def-${a.slot}`, a.slot, "defense", userSteers ? "user" : "cpu", defRating);
      at.x = clamp(px + a.dx, -FIELD.HALF_WIDTH - 1, FIELD.HALF_WIDTH + 1);
      at.z = s.los + a.dz * s.dir;
      at.yaw = s.dir === 1 ? Math.PI : 0;
      at.tx = at.x; at.tz = at.z;
      at.pose = a.slot.startsWith("dl") ? "stance3" : "stance2";
      if (s.coverage === "man" || s.coverage === "blitz") {
        at.coverageTarget = MAN_ASSIGN[at.slot];
        const tgt = at.coverageTarget ? s.athletes.find((o) => o.slot === at.coverageTarget && o.unit === "offense") : undefined;
        if (tgt) {
          at.x = clamp(tgt.x + (rng() - 0.5) * 1.2, -FIELD.HALF_WIDTH - 1, FIELD.HALF_WIDTH + 1);
          at.z = tgt.z + 1.4 * s.dir;
        }
      }
      s.athletes.push(at);
    }
    s.ball.x = px; s.ball.z = s.los; s.ball.y = 0.32;
    s.aim.x = px; s.aim.z = s.los + 6 * s.dir;
    s.userControlled = s.possession === "cpu" ? "def-s" : "off-qb";
    s.qbId = "off-qb";
  }

  const byId = (id: string | undefined) => (id ? state.athletes.find((a) => a.id === id) : undefined);
  const carrier = () => byId(state.carrier);
  const qb = () => byId(state.qbId);

  /* ---------------- play selection ---------------- */

  function refreshSheet() {
    const s = state;
    if (s.mode === "routelab") {
      const shorts = playsByType("short"), deeps = playsByType("deep");
      sheet = [shorts[Math.floor(rng() * shorts.length)]!, deeps[Math.floor(rng() * deeps.length)]!, shorts[Math.floor(rng() * shorts.length)]!];
    } else {
      const drawn = [...drawPlaySheet(offClub(), rng)];
      // Ensure default card 0 is a pass play so snapping via WASD/Space keeps the QB in dropback/scramble
      if (drawn[0]?.type === "run") {
        const passIdx = drawn.findIndex((p) => p.type !== "run");
        if (passIdx > 0) {
          const tmp = drawn[0]!;
          drawn[0] = drawn[passIdx]!;
          drawn[passIdx] = tmp;
        }
      }
      sheet = [drawn[0]!, drawn[1]!, drawn[2]!] as const;
    }
  }

  function pickPlay(i: number) {
    if (!sheet) refreshSheet();
    selectedCard = clamp(i, 0, 2);
    const def = sheet![selectedCard]!;
    state.play = { def, card: selectedCard };
    return def;
  }

  function cpuPickPlay(): PlayDef {
    const s = state;
    const club = offClub();
    let [wR, wS] = club.callWeights;
    const trailing = s.possession === "cpu" ? s.score.away < s.score.home : s.score.home < s.score.away;
    const late = s.quarter >= 4 && s.clock < 40;
    let type: PlayType = "short";
    let r = rng();
    if (trailing && late) { wR = 0.08; wS = 0.42; }
    if (s.down >= 3 && s.toGo > 6) { wR *= 0.25; wS += 0.2; }
    if (r < wR) type = "run";
    else if (r < wR + wS) type = "short";
    else type = "deep";
    const bucket = playsByType(type);
    return bucket[Math.floor(rng() * bucket.length)]!;
  }

  /* ---------------- snap ---------------- */

  function snap() {
    const s = state;
    if (!s.play) pickPlay(s.possession === "cpu" ? Math.floor(rng() * 3) : selectedCard);
    const def = s.play!.def;
    s.snapT = 0;
    s.phase = "live";
    s.clockRunning = true;
    s.pressure = 0;
    blockShed = {};
    jukeT = truckT = diveT = 0; throwCooldown = 0; fumbleResolveT = 0;
    turnoverDuringPlay = false;
    ev.cue("snap");
    ev.juice("snap", { position: [s.ballSpotX, 1, s.los] });

    const qbAt = s.athletes.find((a) => a.slot === "qb")!;
    s.qbId = qbAt.id;
    qbAt.hasBall = true;
    s.ball.kind = "held"; s.ball.holder = qbAt.id;

    for (const a of s.athletes) {
      a.routeT = 0; a.down = false; a.stunT = 0; a.poseT = 0;
      if (a.unit === "offense") {
        a.route = def.routes?.[a.slot];
        if (def.type === "run") a.pose = a.slot === "qb" ? "idle" : "block";
        else a.pose = a.slot === "qb" || a.slot === "c" ? "block" : "run";
      } else {
        a.pose = "run";
      }
    }

    if (def.type === "run") {
      const carrierSlot = def.id === "jet-sweep" ? "sr" : "rb";
      const cAt = s.athletes.find((a) => a.slot === carrierSlot)!;
      qbAt.hasBall = false;
      cAt.hasBall = true;
      s.ball.holder = cAt.id;
      s.carrier = cAt.id;
      cAt.pose = "run";
      if (s.possession === "user") { s.userControlled = cAt.id; cAt.ai = "user"; }
      ev.call("play", `${def.name} — handoff ${carrierSlot.toUpperCase()}`, "info");
    } else {
      if (s.possession === "user") s.userControlled = qbAt.id;
      ev.call("play", `${def.name} — ${def.type === "deep" ? "shot called" : "quick game"}`, "info");
    }
    s.stats.plays += 1;
  }

  /* ---------------- per-frame step ---------------- */

  function step(dt: number, cmd: SimCommand) {
    const s = state;
    if (s.phase === "idle" || s.phase === "gameOver") return;
    dt = clamp(dt, 0, 0.05);
    s.gameT += dt;

    if (cmd.pause && s.mode !== "idle") {
      if (s.phase !== "paused") { s.phase = "paused"; ev.call("system", "paused", "info"); }
      else { s.phase = "preSnap"; ev.call("system", "resumed", "info"); }
      return;
    }
    if (s.phase === "paused") return;

    for (const a of s.athletes) a.poseT += dt;

    switch (s.phase) {
      case "preSnap": stepPreSnap(dt, cmd); break;
      case "live": stepLive(dt, cmd); break;
      case "playOver": stepPlayOver(dt); break;
      case "patChoice": stepPat(dt, cmd); break;
      case "kickoff": stepKickoff(dt); break;
    }

    if (s.clockRunning && s.mode !== "routelab" && s.mode !== "tacklelab") {
      if (s.ot) s.clock += dt;
      else {
        s.clock -= dt;
        if (s.clock <= 0) endQuarter();
      }
    }
  }

  function endQuarter() {
    const s = state;
    s.clockRunning = false;
    if (s.quarter < 4) {
      s.quarter += 1;
      s.clock = quarterLen;
      ev.call("clock", `end of Q${s.quarter - 1} — ${s.score.away}-${s.score.home}`, "info");
      ev.cue("quarter");
    } else if (s.score.home === s.score.away) {
      s.ot = true;
      s.quarter = 5;
      s.clock = 0;
      ev.bigCall("OVERTIME — FIRST SCORE WINS");
      ev.call("clock", "overtime — first score wins", "warn");
      ev.cue("ot");
      const toss = rng() < 0.5 ? "user" : "cpu";
      startDrive(toss, FIELD.DRIVE_START, true);
      s.phase = "preSnap";
    } else {
      endGame();
    }
  }

  function endGame() {
    const s = state;
    s.phase = "gameOver";
    s.clockRunning = false;
    const winner = s.score.home > s.score.away ? "user" : s.score.away > s.score.home ? "cpu" : "tie";
    ev.bigCall(winner === "user" ? "VICTORY!" : winner === "cpu" ? "FINAL" : "TIE GAME");
    ev.call("final", `final: ${s.userTeam.abbr} ${s.score.home} — ${s.score.away} ${s.cpuTeam.abbr}`, winner === "user" ? "success" : "warn");
    ev.cue(winner === "user" ? "win" : "lose");
    ev.juice(winner === "user" ? "matchWin" : "gameWin", { position: [0, 2, s.los] });
  }

  /* ---------------- pre-snap ---------------- */

  function stepPreSnap(dt: number, cmd: SimCommand) {
    const s = state;
    preSnapT += dt;
    huddleDone = true;

    if (s.possession === "user") {
      s.clockRunning = false;
      if (!sheet) {
        refreshSheet();
        pickPlay(selectedCard);
      }
      if (cmd.audible) {
        selectedCard = (selectedCard + 1) % 3;
        pickPlay(selectedCard);
        ev.cue("audible");
        ev.call("playcall", `audible → ${s.play!.def.name}`, "info");
      }
      if (cmd.pickCard !== undefined) {
        pickPlay(cmd.pickCard);
        ev.cue("confirm");
        snap();
        stepLive(dt, cmd);
        return;
      }
      const hasMoveInput = Math.hypot(cmd.moveX ?? 0, cmd.moveZ ?? 0) > 0.05;
      if (cmd.snap || hasMoveInput) {
        if (!s.play || (hasMoveInput && s.play.def.type === "run")) {
          // Ensure QB stays the ball carrier in dropback/scramble when snapping via movement keys
          const passCardIdx = sheet?.findIndex((p) => p.type !== "run") ?? 0;
          pickPlay(passCardIdx >= 0 ? passCardIdx : selectedCard);
        }
        snap();
        stepLive(dt, cmd);
        return;
      }
    } else {
      if (!cpuCallDone && preSnapT > 1.0 + rng() * 1.4) {
        s.play = { def: cpuPickPlay(), card: -1 };
        cpuCallDone = true;
      }
      if (cpuCallDone && preSnapT > 2.0 + rng() * 1.6) snap();
      if (preSnapT > 8) { if (!s.play) s.play = { def: cpuPickPlay(), card: -1 }; snap(); }
    }
  }

  /* ---------------- live play ---------------- */

  function stepLive(dt: number, cmd: SimCommand) {
    const s = state;
    s.snapT += dt;
    jukeT = Math.max(0, jukeT - dt);
    truckT = Math.max(0, truckT - dt);
    throwCooldown = Math.max(0, throwCooldown - dt);

    // steer the user-controlled athlete
    const ctl = byId(s.userControlled);
    const cmdX = cmd.moveX ?? 0;
    const cmdZ = cmd.moveZ ?? 0;
    if (ctl && !ctl.down) {
      const mag = clamp(Math.hypot(cmdX, cmdZ), 0, 1);
      const isUserQbWithBall =
        s.possession === "user" &&
        ctl.slot === "qb" &&
        s.ball.kind === "held" &&
        s.ball.holder === ctl.id;
      if (mag > 0.05) {
        const spd = moveSpeed(ctl) * (0.65 + 0.35 * mag);
        const mx = cmdX / (mag || 1);
        const mz = (cmdZ * s.dir) / (mag || 1);
        ctl.tx = ctl.x + mx * 6;
        ctl.tz = ctl.z + mz * 6;
        steerTo(ctl, dt, spd);
        if (ctl.pose !== "throw" && ctl.pose !== "reach") ctl.pose = "run";
      } else if (!isUserQbWithBall) {
        ctl.vx *= Math.pow(0.0001, dt); ctl.vz *= Math.pow(0.0001, dt);
        ctl.x += ctl.vx * dt; ctl.z += ctl.vz * dt;
        ctl.speed = Math.hypot(ctl.vx, ctl.vz);
        if (ctl.pose === "run" || ctl.pose === "backpedal") ctl.pose = "idle";
      }
      clampField(ctl);
    }

    const def = s.play?.def;
    if (def?.type !== "run") updateQb(dt, cmd);
    updateReceivers(dt);
    updateBlockers(dt);
    updateDefense(dt, cmd);
    updateBall(dt);

    // CPU carrier brain (whoever holds the ball and isn't user-steered)
    const c = carrier();
    if (c && !c.down && c.id !== s.userControlled) cpuCarrier(c, dt);

    // user carrier actions
    if (c && !c.down && c.id === s.userControlled && c.ai === "user") {
      if (cmd.juke && jukeT <= 0 && truckT <= 0 && diveT <= 0) {
        jukeT = 0.32;
        const side = cmdX !== 0 ? Math.sign(cmdX) : rng() < 0.5 ? -1 : 1;
        c.vx += side * 5.6;
        ev.juice("juke", { position: [c.x, 0.4, c.z], strength: 0.6 });
        ev.call("move", "juke!", "info");
      }
      if (cmd.truck && truckT <= 0 && jukeT <= 0 && diveT <= 0) {
        truckT = 0.5;
        ev.juice("truck", { position: [c.x, 0.6, c.z], strength: 0.7 });
        ev.call("move", "truck mode — bring the boom", "info");
      }
      if (cmd.dive && diveT <= 0) {
        diveT = 0.42;
        diveDir = s.dir;
        c.pose = "tackle"; c.poseT = 0;
        ev.juice("dive", { position: [c.x, 0.5, c.z], strength: 0.5 });
      }
    }
    if (c && diveT > 0) {
      diveT -= dt;
      c.z += diveDir * 7.2 * dt;
      if (diveT <= 0) downCarrier("dive");
    }
  }

  function moveSpeed(a: AthleteState): number {
    const base = a.unit === "defense" ? PURSUIT : BASE_RUN;
    return base * (0.72 + a.attrs.speed * 0.4) * (truckT > 0 && a.hasBall ? 0.92 : 1);
  }

  function steerTo(a: AthleteState, dt: number, speed: number) {
    const dx = a.tx - a.x, dz = a.tz - a.z;
    const d = Math.hypot(dx, dz);
    if (d < 0.25) {
      a.vx *= Math.pow(0.0005, dt);
      a.vz *= Math.pow(0.0005, dt);
      a.speed = Math.hypot(a.vx, a.vz);
      return;
    }
    const ux = dx / d, uz = dz / d;
    const arriveScale = d < 0.9 ? clamp(d / 0.9, 0.25, 1) : 1;
    const targetVx = ux * speed * arriveScale, targetVz = uz * speed * arriveScale;
    const accel = a.ai === "user" ? 68 : 34;
    a.vx += clamp(targetVx - a.vx, -accel * dt, accel * dt);
    a.vz += clamp(targetVz - a.vz, -accel * dt, accel * dt);
    a.x += a.vx * dt;
    a.z += a.vz * dt;
    const curSpd = Math.hypot(a.vx, a.vz);
    a.speed = curSpd;
    if (curSpd > 0.65) {
      const targetYaw = Math.atan2(a.vx, a.vz);
      let dyaw = targetYaw - a.yaw;
      while (dyaw > Math.PI) dyaw -= Math.PI * 2;
      while (dyaw < -Math.PI) dyaw += Math.PI * 2;
      a.yaw += dyaw * Math.min(1, dt * 10);
    }
    a.runPhase += curSpd * dt * 1.6;
  }

  function clampField(a: AthleteState) {
    a.x = clamp(a.x, -FIELD.HALF_WIDTH - 3.5, FIELD.HALF_WIDTH + 3.5);
    a.z = clamp(a.z, -FIELD.ENDZONE_DEPTH - 6, FIELD.GOAL_FAR + FIELD.ENDZONE_DEPTH + 6);
  }

  /* ---------------- QB / pass ---------------- */

  function updateQb(dt: number, cmd: SimCommand) {
    const s = state;
    const q = qb();
    if (!q || s.ball.kind !== "held" || s.ball.holder !== q.id || q.down) return;
    const pastLos = s.dir === 1 ? q.z > s.los + 2.5 : q.z < s.los - 2.5;
    if (s.carrier === q.id && pastLos) return; // QB already tucked and ran past LOS
    const userBall = s.possession === "user";

    if (!userBall) {
      // CPU QB drop-back then read
      const dropZ = s.los - 6.5 * s.dir;
      if (Math.abs(q.z - dropZ) > 0.5 && s.snapT < 2.0) {
        q.tx = q.x; q.tz = dropZ;
        steerTo(q, dt, QB_DROP_SPEED);
        q.pose = "backpedal";
      } else {
        q.pose = "idle";
      }
      const def = s.play?.def;
      const paDelay = def?.playAction ?? 0;
      const readAt = (def?.timing ?? 2.0) + paDelay + (rng() * 0.3 - 0.15);
      if ((s.snapT >= readAt || s.pressure > 0.82) && throwCooldown <= 0) {
        const target = cpuChooseTarget();
        if (target && s.pressure < 0.95) {
          throwBall(q, 0.55 + rng() * 0.4, target);
        } else if (s.snapT > readAt + 1.4) {
          if (rng() < 0.42) { s.carrier = q.id; ev.call("play", "QB scrambles!", "info"); }
          else throwBall(q, 0.8, undefined, true);
        }
        throwCooldown = 1.6;
      }
      return;
    }

    // User QB — brief 3-step pocket dropback on snap, then active pocket/scramble progression if WASD is not held
    const mvx = cmd.moveX ?? 0, mvz = (cmd.moveZ ?? 0) * s.dir;
    const mMag = Math.hypot(mvx, mvz);
    if (mMag <= 0.05) {
      if (s.snapT < 0.42) {
        const dropZ = s.los - 3.6 * s.dir;
        q.tx = q.x;
        q.tz = dropZ;
        steerTo(q, dt, QB_DROP_SPEED);
        q.pose = "run";
      } else {
        // Automatic pocket climb / scramble forward when no directional key is held
        const open = cpuChooseTarget();
        const laneX = open ? clamp(open.x * 0.25, -6, 6) : Math.sin(s.snapT * 1.4) * 2.5;
        q.tx = laneX;
        q.tz = q.z + s.dir * 8;
        steerTo(q, dt, moveSpeed(q) * 0.9);
        q.pose = "run";
      }
    }

    const dirX = mMag > 0.05 ? mvx / mMag : 0;
    const dirZ = mMag > 0.05 ? mvz / mMag : s.dir;
    s.aim.x = clamp(q.x + dirX * 11, -FIELD.HALF_WIDTH, FIELD.HALF_WIDTH);
    s.aim.z = clamp(q.z + dirZ * 11, -14, 116);
    const best = nearestReceiverTo(s.aim.x, s.aim.z, 18) ?? cpuChooseTarget();
    if (best) { s.aim.x = best.x; s.aim.z = best.z; s.aim.target = best.id; }
    else s.aim.target = undefined;

    if (cmd.throwReceiverIndex !== undefined && s.snapT > 0.08 && throwCooldown <= 0) {
      const slotOrder = ["wl", "sl", "sr", "wr", "rb"];
      const preferredSlot = slotOrder[cmd.throwReceiverIndex];
      const bySlot = preferredSlot
        ? s.athletes.find((a) => a.unit === "offense" && a.slot === preferredSlot && !a.down)
        : undefined;
      const target = bySlot ?? best ?? cpuChooseTarget();
      throwBall(q, 0.78, target);
      s.throwCharge = 0;
      throwCooldown = 0.4;
      return;
    }

    if (cmd.throwPressed && s.snapT > 0.1 && throwCooldown <= 0) {
      const target = best ?? cpuChooseTarget();
      throwBall(q, 0.78, target);
      s.throwCharge = 0;
      throwCooldown = 0.4;
      return;
    }

    if (cmd.throwHeld && s.snapT > 0.12) {
      s.throwCharge = clamp(s.throwCharge + dt / 0.65, 0, 1);
      q.pose = "throw";
    }
    if (cmd.throwReleased && s.throwCharge > 0.05 && throwCooldown <= 0) {
      const target = best ?? cpuChooseTarget();
      throwBall(q, Math.max(0.65, s.throwCharge), target);
      s.throwCharge = 0;
      throwCooldown = 0.4;
      return;
    } else if (!cmd.throwHeld) s.throwCharge = 0;

    // scramble past LOS → becomes carrier
    if (s.dir === 1 ? q.z > s.los + 0.4 : q.z < s.los - 0.4) {
      if (s.carrier !== q.id) {
        s.carrier = q.id;
        ev.call("play", "QB tucks it and runs!", "info");
      }
    }
  }

  function nearestReceiverTo(x: number, z: number, maxD: number): AthleteState | undefined {
    let best: AthleteState | undefined;
    let bd = maxD;
    for (const a of state.athletes) {
      if (a.unit !== "offense" || a.slot === "qb" || a.down || a.hasBall) continue;
      const d = dist2d(a.x, a.z, x, z);
      if (d < bd) { bd = d; best = a; }
    }
    return best;
  }

  function separation(a: AthleteState): number {
    let dmin = 99;
    for (const d of state.athletes) {
      if (d.unit !== "defense" || d.down) continue;
      dmin = Math.min(dmin, dist2d(d.x, d.z, a.x, a.z));
    }
    return dmin;
  }

  function cpuChooseTarget(): AthleteState | undefined {
    const s = state;
    let best: AthleteState | undefined;
    let bestScore = -1;
    for (const a of s.athletes) {
      if (a.unit !== "offense" || a.slot === "qb" || a.down) continue;
      const sep = separation(a);
      const depth = Math.abs(a.z - s.los);
      const sticksBonus = s.down >= 3 ? ((a.z - s.firstDownLine) * s.dir > -2 ? 0.8 : 0) : 0;
      const score = sep * 1.4 + depth * 0.05 + (a.route ? 0.4 : 0) + sticksBonus;
      if (score > bestScore) { bestScore = score; best = a; }
    }
    return best;
  }

  function throwBall(q: AthleteState, power: number, forcedTarget?: AthleteState, throwAway = false) {
    const s = state;
    const thinAir = stadiumById(s.venue).thinAir;
    let tx: number, tz: number, tid: string | undefined;
    const tgt = forcedTarget ?? (s.aim.target ? byId(s.aim.target) : nearestReceiverTo(s.aim.x, s.aim.z, 10));
    if (throwAway || !tgt) {
      tx = throwAway ? q.x + (rng() - 0.5) * 8 : s.aim.x;
      tz = throwAway ? q.z + s.dir * 26 : s.aim.z;
      tid = undefined;
    } else {
      const dxT = tgt.x - q.x, dzT = tgt.z - q.z;
      const dd = Math.hypot(dxT, dzT);
      const eta = clamp(dd / (thinAir ? 27 : 22), 0.38, 2.4);
      tx = clamp(tgt.x + tgt.vx * eta * 0.85, -FIELD.HALF_WIDTH, FIELD.HALF_WIDTH);
      tz = tgt.z + tgt.vz * eta * 0.85;
      tid = tgt.id;
    }
    const dx = tx - q.x, dz = tz - q.z;
    const dd = Math.hypot(dx, dz);
    const eta = clamp(dd / (thinAir ? 27 : 22), 0.38, 2.6);
    const weak = power < 0.35;
    const T = eta * (weak ? 1.22 : power > 0.85 ? 0.92 : 1.0);
    q.hasBall = false;
    q.pose = "throw"; q.poseT = 0;
    s.ball = {
      kind: "air", x: q.x, y: 1.85, z: q.z,
      vx: dx / T, vy: (1.35 - 1.85 + 0.5 * GRAVITY * T * T) / T, vz: dz / T,
      aimX: tx, aimZ: tz, flightT: 0, eta: T, thrownAt: s.snapT, targetId: tid
    };
    if (s.possession === "user") s.userControlled = undefined;
    ev.cue("throw");
    ev.juice("throw", { position: [q.x, 1.6, q.z], strength: 0.4 + power * 0.6 });
    ev.call("pass", power > 0.8 ? "deep shot in the air!" : "ball away —", "info");
    s.pressure = 0;
  }

  /* ---------------- receivers ---------------- */

  function updateReceivers(dt: number) {
    const s = state;
    for (const a of s.athletes) {
      if (a.unit !== "offense" || a.slot === "qb" || a.down || a.hasBall || a.id === s.userControlled) continue;
      const r = a.route;
      if (r && s.ball.kind !== "loose") {
        a.routeT += dt;
        const t = clamp(a.routeT / r.stemTime, 0, 1);
        const segs = r.stem.length;
        const ft = t * (segs - 1);
        const i = Math.min(segs - 2, Math.max(0, Math.floor(ft)));
        const lt = ft - i;
        const [dx0, dz0] = r.stem[i]!;
        const [dx1, dz1] = r.stem[Math.min(segs - 1, i + 1)]!;
        const dx = lerp(dx0, dx1, lt), dz = lerp(dz0, dz1, lt);
        const align = OFFENSE_ALIGN.find((o) => o.slot === a.slot);
        const ax = align?.dx ?? 0;
        a.tx = clamp(s.ballSpotX + ax + dx, -FIELD.HALF_WIDTH + 0.4, FIELD.HALF_WIDTH - 0.4);
        a.tz = s.los + dz * s.dir;
        steerTo(a, dt, moveSpeed(a) * (a.slot === "c" ? 0.55 : 1));
        a.pose = "run";
        if (a.routeT >= r.stemTime) {
          const d = nearestDefenderTo(a.x, a.z);
          if (d && dist2d(d.x, d.z, a.x, a.z) < 3) {
            a.tx = clamp(a.x + (a.x - d.x) * 0.4 + (rng() - 0.5), -FIELD.HALF_WIDTH, FIELD.HALF_WIDTH);
            a.tz = a.z + s.dir * 4;
          } else {
            a.tz = a.z + s.dir * 3.5;
          }
        }
      } else if (!a.down && !a.hasBall && a.slot !== "qb") {
        // run-path followers on run plays
        const def = s.play?.def;
        if (def?.type === "run" && def.runPath && (s.carrier !== a.id)) {
          // non-carriers block; carrier path handled by carrier logic
          a.pose = "block";
        }
      }
    }
  }

  function nearestDefenderTo(x: number, z: number): AthleteState | undefined {
    let best: AthleteState | undefined, bd = 1e9;
    for (const d of state.athletes) {
      if (d.unit !== "defense" || d.down || d.stunT > 0) continue;
      const dd = dist2d(d.x, d.z, x, z);
      if (dd < bd) { bd = dd; best = d; }
    }
    return best;
  }

  /* ---------------- blockers ---------------- */

  function updateBlockers(dt: number) {
    const s = state;
    const def = s.play?.def;
    for (const b of s.athletes) {
      if (b.unit !== "offense" || b.down || b.hasBall) continue;
      const isBlocker = def?.type === "run"
        ? b.slot !== "qb" && b.id !== s.carrier && !b.route
        : b.slot === "c" || (b.slot === "rb" && !b.route && !b.hasBall);
      if (!isBlocker || b.id === s.userControlled) continue;
      if (!b.engaged) {
        const d = nearestDefenderTo(b.x, b.z);
        if (d && dist2d(d.x, d.z, b.x, b.z) < 2.6 && !d.down) {
          b.engaged = d.id;
          d.engaged = b.id;
          blockShed[d.id] = 1.4 + rng() * 1.8 * b.attrs.power;
        } else {
          // Pass-pro step forward/lateral toward nearest rusher
          b.tx = b.x;
          b.tz = b.z + s.dir * 1.8;
          steerTo(b, dt, 2.8);
          b.pose = "block";
        }
      }
      if (b.engaged) {
        const d = byId(b.engaged);
        if (!d || d.down) { b.engaged = undefined; continue; }
        // Drive engaged block smoothly upfield without zero-distance oscillation
        b.tx = b.x + (d.x - b.x) * 0.35;
        b.tz = b.z + s.dir * 2.2;
        steerTo(b, dt, 2.6);
        b.pose = "block";
        d.x = lerp(d.x, b.x + Math.sin(b.yaw) * 0.75, Math.min(1, dt * 6));
        d.z = lerp(d.z, b.z + s.dir * 0.85, Math.min(1, dt * 6));
        d.vx = b.vx;
        d.vz = b.vz;
        d.speed = b.speed;
        blockShed[d.id] = (blockShed[d.id] ?? 1) - dt;
        if (blockShed[d.id] <= 0) {
          b.engaged = undefined;
          d.engaged = undefined;
          d.stunT = 0.2;
        }
      }
    }
  }

  /* ---------------- defense AI ---------------- */

  function updateDefense(dt: number, cmd: SimCommand) {
    const s = state;
    const c = carrier();
    const ballAir = s.ball.kind === "air";
    for (const d of s.athletes) {
      if (d.unit !== "defense" || d.down) continue;
      if (d.stunT > 0) { d.stunT -= dt; d.pose = "down"; continue; }
      if (d.engaged) {
        const b = byId(d.engaged);
        if (b && !b.down) {
          d.pose = "block";
          continue;
        }
        d.engaged = undefined;
      }
      if (d.id === s.userControlled) {
        if (c && cmd.tackle && dist2d(d.x, d.z, c.x, c.z) < TACKLE_RADIUS + 0.25) {
          resolveTackle(d, c, "wrap");
        } else if (c && cmd.hitStick && dist2d(d.x, d.z, c.x, c.z) < HITSTICK_RADIUS + 0.3) {
          resolveTackle(d, c, "hitstick");
        } else if (ballAir && cmd.ballHawk) {
          d.tx = s.ball.aimX; d.tz = s.ball.aimZ;
          s.ball.pickBonus = true;
          steerTo(d, dt, moveSpeed(d) * 1.14);
          d.pose = "reach";
        } else if (d.pose !== "reach" && (c || ballAir)) {
          d.pose = "run";
        }
        continue;
      }
      if (ballAir) {
        d.tx = s.ball.aimX + (rng() - 0.5) * 1.4;
        d.tz = s.ball.aimZ + (rng() - 0.5) * 1.4;
        steerTo(d, dt, moveSpeed(d) * 1.05);
        d.pose = "run";
        continue;
      }
      if (c) {
        const dd = dist2d(d.x, d.z, c.x, c.z);
        const lead = clamp(dd / 9, 0, 1.1);
        d.tx = c.x + c.vx * lead;
        d.tz = c.z + c.vz * lead;
        steerTo(d, dt, moveSpeed(d) * (d.slot.startsWith("dl") && s.snapT < 0.7 ? 0.9 : 1));
        d.pose = "run";
        if (dd < TACKLE_RADIUS && diveT <= 0) resolveTackle(d, c, "wrap");
        else if (dd < HITSTICK_RADIUS * 0.8 && truckT <= 0 && rng() < dt * 0.5 && defClub().identity === "blitz-heavy") {
          resolveTackle(d, c, "hitstick");
        }
        continue;
      }
      if (s.ball.kind === "held" || s.ball.kind === "dead") {
        const rush = d.slot.startsWith("dl") || (s.coverage === "blitz" && s.snapT > 0.55 && (d.slot.startsWith("lb") || d.slot === "s"));
        if (rush && s.ball.holder) {
          const q = byId(s.ball.holder);
          if (q && !q.down) {
            d.tx = q.x; d.tz = q.z;
            steerTo(d, dt, moveSpeed(d) * 0.96);
            d.pose = "run";
            const dd = dist2d(d.x, d.z, q.x, q.z);
            s.pressure = Math.max(s.pressure, 1 - dd / 8);
            if (dd < 0.95 && s.ball.kind === "held" && s.ball.holder === q.id) {
              if (s.carrier === q.id) resolveTackle(d, q, "wrap");
              else {
                q.down = true; q.pose = "down";
                s.stats.sacks += 1;
                ev.call("down", `sacked! ${d.slot.toUpperCase()} got home`, "warn");
                ev.cue("sack");
                downCarrier("sack", q);
              }
            }
            continue;
          }
        }
        if (s.coverage === "man" || s.coverage === "blitz") {
          const tgtSlot = MAN_ASSIGN[d.slot] ?? d.coverageTarget;
          const tgt = tgtSlot ? s.athletes.find((a) => a.unit === "offense" && a.slot === tgtSlot) : undefined;
          if (tgt && !tgt.down) {
            const trail = 0.9 + (1 - d.attrs.aware) * 1.4;
            d.tx = tgt.x + tgt.vx * 0.12;
            d.tz = tgt.z + s.dir * trail;
            steerTo(d, dt, moveSpeed(d) * (dist2d(d.x, d.z, tgt.x, tgt.z) > 4 ? 1.02 : 0.9));
            d.pose = "run";
            continue;
          }
        }
        const drop = ZONE_DROPS[s.coverage]?.[d.slot];
        if (drop && !d.slot.startsWith("dl")) {
          const near = nearestReceiverTo(d.x, d.z, 10);
          if (near && s.snapT > 0.75) {
            d.tx = near.x + near.vx * 0.15;
            d.tz = near.z + s.dir * 1.4;
          } else {
            d.tx = s.ballSpotX + drop[0];
            d.tz = s.los + drop[1] * s.dir;
          }
          steerTo(d, dt, moveSpeed(d) * 0.88);
          d.pose = "run";
          continue;
        }
      }
      d.pose = "idle";
    }
  }

  function cpuCarrier(c: AthleteState, dt: number) {
    const s = state;
    const d = nearestDefenderTo(c.x, c.z);
    let tx = c.x, tz = c.z + s.dir * 8;
    if (d) {
      const dd = dist2d(d.x, d.z, c.x, c.z);
      if (dd < 5) {
        const away = c.x - d.x;
        tx = c.x + Math.sign(away || (rng() - 0.5)) * (dd < 2 ? 6 : 3);
        if (dd < 2.2 && rng() < dt * 6) {
          c.vx += Math.sign(away || 1) * 4.5;
          ev.juice("juke", { position: [c.x, 0.4, c.z], strength: 0.4 });
        }
      }
    }
    tx = clamp(tx, -FIELD.HALF_WIDTH + 0.5, FIELD.HALF_WIDTH - 0.5);
    c.tx = tx; c.tz = tz;
    steerTo(c, dt, moveSpeed(c));
    if (c.pose !== "down") c.pose = "run";
    if (Math.abs(c.z - goalZ()) < 5) c.z += s.dir * 1.2 * dt * 8;
  }

  /* ---------------- ball ---------------- */

  function updateBall(dt: number) {
    const s = state;
    const b = s.ball;
    if (b.kind === "held") {
      const h = byId(b.holder);
      if (h) { b.x = h.x + Math.sin(h.yaw) * 0.35; b.y = 1.05; b.z = h.z + Math.cos(h.yaw) * 0.35; }
      return;
    }
    if (b.kind === "air") {
      const thinAir = stadiumById(s.venue).thinAir;
      const drag = Math.exp(-(thinAir ? 0.008 : 0.05) * dt);
      b.vx *= drag; b.vz *= drag;
      b.vy -= GRAVITY * (thinAir ? 0.86 : 1) * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      b.flightT += dt;
      if (b.flightT >= b.eta * 0.92 || b.y <= 1.15) resolveCatch();
      return;
    }
    if (b.kind === "loose") {
      b.vy -= GRAVITY * dt;
      b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      if (b.y <= 0.24) { b.y = 0.24; b.vy = Math.abs(b.vy) * 0.35; b.vx *= 0.6; b.vz *= 0.6; }
      b.x = clamp(b.x, -FIELD.HALF_WIDTH, FIELD.HALF_WIDTH);
      b.z = clamp(b.z, -FIELD.ENDZONE_DEPTH, FIELD.GOAL_FAR + FIELD.ENDZONE_DEPTH);
      fumbleResolveT += dt;
      for (const a of s.athletes) {
        if (a.down) continue;
        a.tx = b.x; a.tz = b.z;
        steerTo(a, dt, moveSpeed(a) * 0.98);
        if (dist2d(a.x, a.z, b.x, b.z) < 0.9 && fumbleResolveT > 0.18) {
          recoverFumble(a);
          return;
        }
      }
      if (fumbleResolveT > 6) whistle("fumble out");
    }
  }

  function resolveCatch() {
    const s = state;
    const b = s.ball;
    const landX = b.x, landZ = b.z;
    let wr: AthleteState | undefined; let wd = 99;
    let df: AthleteState | undefined; let dd = 99;
    for (const a of s.athletes) {
      if (a.down) continue;
      const d = dist2d(a.x, a.z, landX, landZ);
      if (a.unit === "offense" && a.slot !== "qb") {
        if (d < wd) { wd = d; wr = a; }
      }
      if (a.unit === "defense" && d < dd) { dd = d; df = a; }
    }
    if (b.targetId) {
      const t = byId(b.targetId);
      if (t && !t.down) { wr = t; wd = Math.min(wd, dist2d(t.x, t.z, landX, landZ)); }
    }
    const inEndZone = goalLineCrossed(landZ) || (wr ? goalLineCrossed(wr.z) : false);
    const catchWindow = wr?.route && b.thrownAt !== undefined
      ? (b.thrownAt >= wr.route.window[0] - 0.15 && b.thrownAt <= wr.route.window[1] + 0.9 ? 0.25 : 0)
      : 0;
    const defBonus = b.pickBonus ? 0.55 : 0;

    if (wr && wd < CATCH_RADIUS && dd > wd + 0.55) {
      completePass(wr, inEndZone, wd < 0.9 ? "perfect" : "catch");
      return;
    }
    if (wr && df && wd < CATCH_RADIUS && dd < DEF_CATCH_RADIUS + defBonus + 0.6) {
      const offScore = wr.attrs.hands + catchWindow + (rng() - 0.5) * 0.5;
      const defScore = df.attrs.aware + defBonus + (rng() - 0.5) * 0.5;
      if (defScore > offScore + 0.25) { interception(df); return; }
      if (offScore >= defScore) { completePass(wr, inEndZone, "contested"); return; }
      b.kind = "loose";
      b.vx = (rng() - 0.5) * 5; b.vz = (rng() - 0.5) * 5; b.vy = 3;
      fumbleResolveT = 0;
      ev.call("catch", "tipped ball — it's live!", "warn");
      ev.juice("tip", { position: [landX, 1.4, landZ] });
      return;
    }
    if (df && dd < DEF_CATCH_RADIUS + defBonus && (!wr || dd < wd)) {
      interception(df);
      return;
    }
    b.kind = "dead";
    ev.call("catch", "incomplete", "warn");
    ev.cue("incomplete");
    ev.juice("incomplete", { position: [landX, 0.4, landZ] });
    whistle("incomplete");
  }

  function completePass(wr: AthleteState, inEndZone: boolean, quality: string) {
    const s = state;
    wr.hasBall = true;
    s.ball.kind = "held"; s.ball.holder = wr.id;
    s.carrier = wr.id;
    wr.pose = "reach"; wr.poseT = 0;
    if (s.possession === "user") { s.userControlled = wr.id; wr.ai = "user"; }
    const yds = Math.round((wr.z - s.los) * s.dir);
    ev.cue("catch");
    ev.juice("catch", { position: [wr.x, 1.2, wr.z], strength: quality === "perfect" ? 0.9 : 0.6 });
    ev.call("catch", quality === "perfect" ? `dime! ${wr.slot.toUpperCase()} for ${yds}` : `complete to ${wr.slot.toUpperCase()} — ${yds} yards`, "success");
    if (s.mode === "routelab") {
      labReps.made += quality !== "contested" ? 1 : 0.5;
      if (quality === "perfect") labReps.perfect += 1;
    }
    if (inEndZone) { touchdown(wr); return; }
    if (s.mode === "routelab") whistle("lab rep");
  }

  function interception(df: AthleteState) {
    const s = state;
    df.hasBall = true;
    s.ball.kind = "held"; s.ball.holder = df.id;
    s.possession = s.possession === "user" ? "cpu" : "user";
    s.dir = s.possession === "user" ? 1 : -1;
    s.carrier = df.id;
    s.userControlled = s.possession === "cpu" ? undefined : df.id;
    df.ai = s.possession === "user" ? "user" : "cpu";
    s.stats.ints += 1; s.stats.turnovers += 1;
    turnoverDuringPlay = true;
    ev.bigCall("INTERCEPTED!");
    ev.call("turnover", `${df.slot.toUpperCase()} picks it off — return live!`, "warn");
    ev.cue("turnover");
    ev.juice("interception", { position: [df.x, 1.4, df.z], strength: 1 });
    df.pose = "run";
    if (goalLineCrossed(df.z)) touchdown(df);
  }

  function recoverFumble(a: AthleteState) {
    const s = state;
    a.hasBall = true;
    s.ball.kind = "held"; s.ball.holder = a.id;
    s.stats.fumbles += 1;
    if (a.unit === "defense") {
      s.possession = s.possession === "user" ? "cpu" : "user";
      s.dir = s.possession === "user" ? 1 : -1;
      s.stats.turnovers += 1;
      turnoverDuringPlay = true;
      ev.bigCall("FUMBLE — TURNOVER!");
      ev.call("turnover", `${a.slot.toUpperCase()} falls on it — defense ball!`, "warn");
      ev.cue("turnover");
    } else {
      ev.call("turnover", `${a.slot.toUpperCase()} recovers the fumble`, "info");
      ev.cue("whistle");
    }
    s.carrier = a.id;
    s.userControlled = s.possession === "user" ? a.id : s.possession === "cpu" ? "def-s" : undefined;
    if (a.unit === "defense" && s.possession === "cpu") a.ai = "cpu";
    a.pose = "run";
    whistle("fumble recovered");
  }

  /* ---------------- tackle / whistle / scores ---------------- */

  function resolveTackle(d: AthleteState, c: AthleteState, kind: "wrap" | "hitstick") {
    const s = state;
    if (c.down || diveT > 0 || !c.hasBall) return;
    if (jukeT > 0 && c.ai === "user") {
      d.pose = "tackle"; d.stunT = 0.55;
      ev.call("move", `${d.slot.toUpperCase()} whiffs on the juke!`, "success");
      ev.juice("whiff", { position: [c.x, 0.5, c.z] });
      return;
    }
    if (truckT > 0 && c.ai === "user" && kind === "wrap" && rng() < 0.75) {
      d.down = true; d.pose = "down"; d.stunT = 0.9;
      truckT = 0;
      ev.call("move", `trucked through ${d.slot.toUpperCase()}!`, "success");
      ev.juice("truckHit", { position: [c.x, 0.8, c.z], strength: 0.9 });
      ev.cue("bigHit");
      return;
    }
    if (kind === "hitstick") {
      c.down = true; c.pose = "down";
      d.pose = "tackle";
      const fumble = rng() < 0.18 + (1 - c.attrs.power) * 0.1;
      ev.juice("hitstick", { position: [c.x, 0.9, c.z], strength: 1 });
      ev.cue("bigHit");
      if (fumble) {
        c.hasBall = false;
        s.ball.kind = "loose"; s.ball.holder = undefined;
        s.ball.vx = (rng() - 0.5) * 6; s.ball.vz = (rng() - 0.5) * 6; s.ball.vy = 4;
        fumbleResolveT = 0;
        ev.bigCall("FUMBLE!");
        ev.call("turnover", "hit-stick jarred it loose!", "warn");
        return;
      }
      ev.call("tackle", `${d.slot.toUpperCase()} lays the hit-stick!`, "success");
      downCarrier("tackle", c);
      return;
    }
    c.down = true; c.pose = "down";
    d.pose = "tackle";
    ev.cue("hit");
    ev.juice("tackle", { position: [c.x, 0.6, c.z], strength: 0.55 });
    downCarrier("tackle", c);
  }

  function downCarrier(reason: string, who?: AthleteState) {
    const s = state;
    const c = who ?? carrier();
    if (!c) return;
    c.down = true;
    c.hasBall = false;
    s.ball.kind = "dead";
    s.ball.x = c.x; s.ball.z = c.z; s.ball.y = 0.3;
    whistle(reason);
  }

  function whistle(reason: string) {
    const s = state;
    if (s.phase !== "live") return;
    s.phase = "playOver";
    playOverT = 0;
    s.clockRunning = false;
    const c = carrier();
    const endZ = c && (reason === "tackle" || reason === "dive" || reason === "sack") ? c.z : s.ball.z;
    const gain = Math.round((endZ - s.los) * s.dir);
    s.lastGain = reason === "incomplete" ? 0 : gain;
    s.overReason = reason;
    if (reason !== "lab rep") {
      ev.cue("whistle");
      if (reason !== "incomplete" && reason !== "fumble recovered") {
        ev.call("down", `${reason === "sack" ? "sack" : reason} — ${gain >= 0 ? "+" : ""}${gain} yards`, gain > 8 ? "success" : "info");
      }
    }
  }

  function touchdown(c: AthleteState) {
    const s = state;
    const userScore = s.possession === "user";
    if (pendingTwo) {
      pendingTwo = false;
      if (userScore) s.score.home += 2; else s.score.away += 2;
      ev.bigCall("TWO-POINT CONVERSION!");
      ev.call("score", "2-point conversion good!", "success");
      ev.cue("td");
      c.pose = "celebrate"; c.poseT = 0;
      if (s.ot) { endGame(); return; }
      afterScore();
      return;
    }
    if (userScore) s.score.home += 6; else s.score.away += 6;
    s.stats.tds += 1;
    c.pose = "celebrate"; c.poseT = 0;
    ev.bigCall("TOUCHDOWN!");
    ev.call("score", `${userScore ? s.userTeam.name : s.cpuTeam.name} touchdown — ${s.score.home}-${s.score.away}`, "success");
    ev.cue("td");
    ev.juice("touchdown", { position: [c.x, 1, c.z], strength: 1 });
    if (s.ot) { endGame(); return; }
    if (s.mode === "routelab" || s.mode === "tacklelab") {
      s.phase = "playOver"; playOverT = 0;
      return;
    }
    s.phase = "patChoice";
    patT = 0;
    s.clockRunning = false;
  }

  function stepPlayOver(dt: number) {
    const s = state;
    playOverT += dt;
    const wait = 0.85;
    if (playOverT < wait) return;

    if (s.mode === "tacklelab" || s.mode === "routelab") { labNextRep(); return; }

    // failed 2-point try → resume normal flow
    if (pendingTwo) {
      pendingTwo = false;
      ev.call("pat", "conversion fails", "warn");
      afterScore();
      return;
    }

    const c = carrier();
    const cDowned = s.overReason === "tackle" || s.overReason === "dive" || s.overReason === "sack" || s.overReason === "fumble recovered";
    const endZ = s.overReason === "incomplete" ? s.los : cDowned && c ? c.z : s.ball.z;
    const gain = Math.round((endZ - s.los) * s.dir);
    const spot = clamp(s.overReason === "incomplete" ? s.los : endZ, FIELD.GOAL_NEAR + 0.4, FIELD.GOAL_FAR - 0.4);
    const firstDown = cDowned && gain >= s.toGo;
    const turnoverOnDowns = s.down >= 4 && (s.overReason === "incomplete" || gain < s.toGo);

    if (s.overReason !== "incomplete" && gain !== 0) {
      if (s.play?.def.type === "run") s.stats.rushYds += Math.max(0, gain);
      else s.stats.passYds += Math.max(0, gain);
    }

    s.ballSpotX = Math.abs(s.ball.x) > FIELD.HALF_WIDTH
      ? Math.sign(s.ball.x) * (FIELD.HALF_WIDTH - 0.5)
      : clamp(s.ball.x, -FIELD.HASH_X, FIELD.HASH_X);

    // safety: carrier downed in his own end zone
    if (cDowned && c && ownGoalCrossed(c.z)) {
      if (s.possession === "user") s.score.away += 2; else s.score.home += 2;
      ev.bigCall("SAFETY!");
      ev.call("score", "safety — 2 points", "warn");
      ev.cue("safety");
      if (s.ot) { endGame(); return; }
      startDrive(s.possession === "user" ? "cpu" : "user", FIELD.DRIVE_START, true);
      s.phase = "kickoff"; kickoffT = 0;
      return;
    }

    if (turnoverDuringPlay || turnoverOnDowns) {
      if (turnoverOnDowns && !turnoverDuringPlay) {
        ev.bigCall("TURNOVER ON DOWNS");
        ev.call("turnover", "turnover on downs", "warn");
        s.stats.turnovers += 1;
        s.possession = s.possession === "user" ? "cpu" : "user";
        s.dir = s.possession === "user" ? 1 : -1;
      }
      // new drive at the spot — touchback if recovered in own end zone
      let newLos = spot;
      if (ownGoalCrossed(endZ) || (s.dir === 1 && endZ <= FIELD.GOAL_NEAR) || (s.dir === -1 && endZ >= FIELD.GOAL_FAR)) newLos = FIELD.DRIVE_START;
      // clamp into the new offense's field position (they attack the other way)
      newLos = s.dir === 1 ? clamp(newLos, 3, 96) : clamp(newLos, 4, 97);
      startDrive(s.possession, newLos, true);
      s.phase = "preSnap";
      return;
    }

    if (firstDown) {
      s.down = 1;
      s.los = spot;
      s.toGo = s.dir === 1 ? Math.min(10, FIELD.GOAL_FAR - spot) : Math.min(10, spot);
      s.firstDownLine = s.los + s.toGo * s.dir;
      ev.call("down", "first down!", "success");
      ev.cue("firstdown");
    } else {
      s.down = Math.min(4, s.down + 1);
      s.los = spot;
      s.toGo = Math.max(0.5, s.toGo - gain);
      s.firstDownLine = s.los + s.toGo * s.dir;
      if (s.down === 4) ev.call("down", `4th & ${Math.ceil(s.toGo)} — pressure down`, "warn");
    }
    preSnapT = 0; huddleDone = true; cpuCallDone = false; selectedCard = 0;
    lineup();
    if (s.possession === "user") {
      refreshSheet();
      pickPlay(selectedCard);
    }
    s.phase = "preSnap";
  }

  function stepPat(dt: number, cmd: SimCommand) {
    const s = state;
    patT += dt;
    if (patT < 0.9) return;
    const userScore = s.possession === "user";
    let goTwo: boolean | null = null;
    if (userScore) {
      if (cmd.patGo) goTwo = true;
      else if (cmd.patKick) goTwo = false;
      else if (patT >= 9) goTwo = false;
      else return; // wait for the choice
    } else {
      const deficit = s.score.home - (s.score.away - 6);
      goTwo = (Math.abs(deficit) === 2 && s.quarter >= 4) ? true : false;
    }
    if (goTwo) {
      ev.call("pat", "going for two!", "warn");
      pendingTwo = true;
      startDrive(s.possession, s.dir === 1 ? FIELD.GOAL_FAR - FIELD.PAT_SPOT : FIELD.GOAL_NEAR + FIELD.PAT_SPOT, true);
      s.toGo = FIELD.PAT_SPOT;
      s.firstDownLine = goalZ();
      s.phase = "preSnap";
      return;
    }
    if (userScore) s.score.home += 1; else s.score.away += 1;
    ev.call("pat", "extra point good", "success");
    ev.cue("pat");
    afterScore();
  }

  function afterScore() {
    const s = state;
    if (s.ot) { endGame(); return; }
    if (s.mode === "routelab" || s.mode === "tacklelab") { labNextRep(); return; }
    startDrive(s.possession === "user" ? "cpu" : "user", FIELD.DRIVE_START, true);
    s.phase = "kickoff";
    kickoffT = 0;
    ev.call("kickoff", `kickoff — ${s.possession === "user" ? s.userTeam.abbr : s.cpuTeam.abbr} ball at the ${FIELD.DRIVE_START}`, "info");
  }

  function stepKickoff(dt: number) {
    kickoffT += dt;
    if (kickoffT > 1.6) { state.phase = "preSnap"; }
  }

  /* ---------------- labs ---------------- */

  function startLabRep() {
    const s = state;
    s.athletes = [];
    s.dir = 1;
    s.los = 58;
    s.ballSpotX = 0;
    s.play = undefined;
    s.qbId = undefined;
    s.carrier = undefined;
    s.ball = { kind: "dead", x: 0, y: 0.3, z: 58, vx: 0, vy: 0, vz: 0, aimX: 0, aimZ: 0, flightT: 0, eta: 0 };
    if (s.mode === "tacklelab") {
      const repSpread = 14 + tackleLab.rep * 3;
      const rb = mkAthlete("off-rb", "rb", "offense", "cpu", s.cpuTeam.rating);
      rb.x = (rng() - 0.5) * 16;
      rb.z = 62;
      rb.pose = "run";
      const sAt = mkAthlete("def-s", "s", "defense", "user", s.userTeam.rating);
      sAt.x = rb.x + (rng() - 0.5) * 6;
      sAt.z = 62 - repSpread;
      const cb = mkAthlete("def-cb1", "cb1", "defense", "cpu", s.userTeam.rating * 0.9);
      cb.x = rb.x + 9; cb.z = 66;
      const lb = mkAthlete("def-lb1", "lb1", "defense", "cpu", s.userTeam.rating * 0.85);
      lb.x = rb.x - 10; lb.z = 70;
      rb.hasBall = true;
      s.carrier = rb.id;
      s.userControlled = sAt.id;
      s.ball.kind = "held"; s.ball.holder = rb.id;
      s.athletes = [rb, sAt, cb, lb];
      ev.call("lab", `tackle lab rep ${tackleLab.rep + 1}/6 — run him down`, "info");
    } else {
      lineup();
      s.possession = "user";
      sheet = null;
    }
  }

  function labNextRep() {
    const s = state;
    if (s.mode === "routelab") {
      labReps.total += 1;
      if (labReps.total >= 8) { endLab(); return; }
      s.labScore = { made: labReps.made, total: labReps.total, perfect: labReps.perfect, rep: labReps.total + 1, reps: 8, grade: "—" };
      startLabRep();
      s.phase = "preSnap"; preSnapT = 0; huddleDone = false;
    } else if (s.mode === "tacklelab") {
      const c = carrier();
      const allowed = c ? Math.max(0, Math.round(c.z - 62)) : 0;
      tackleLab.allowed += allowed;
      tackleLab.best = Math.min(tackleLab.best, allowed);
      tackleLab.total += 1;
      ev.call("lab", `rep done — allowed ${allowed} yards`, allowed <= 4 ? "success" : "info");
      if (tackleLab.total >= 6) { endLab(); return; }
      tackleLab.rep += 1;
      startLabRep();
      s.phase = "live"; s.snapT = 0;
    }
  }

  function gradeLab(made: number, of: number): string {
    const r = made / of;
    return r >= 0.85 ? "S" : r >= 0.65 ? "A" : r >= 0.45 ? "B" : r >= 0.25 ? "C" : "D";
  }

  function endLab() {
    const s = state;
    if (s.mode === "routelab") {
      const g = gradeLab(labReps.made, labReps.total || 1);
      s.labScore = { made: labReps.made, total: labReps.total, perfect: labReps.perfect, rep: labReps.total, reps: 8, grade: g };
      ev.bigCall(`ROUTE LAB — GRADE ${g}`);
      ev.call("lab", `route lab complete: ${labReps.made}/${labReps.total} · grade ${g}`, "success");
    } else {
      const avg = tackleLab.allowed / Math.max(1, tackleLab.total);
      const g = avg <= 4 ? "S" : avg <= 8 ? "A" : avg <= 14 ? "B" : avg <= 22 ? "C" : "D";
      s.labScore = { made: 6, total: tackleLab.total, perfect: tackleLab.best, rep: tackleLab.total, reps: 6, grade: g };
      ev.bigCall(`TACKLE LAB — GRADE ${g}`);
      ev.call("lab", `tackle lab complete: avg ${avg.toFixed(1)}y allowed · grade ${g}`, "success");
    }
    s.phase = "gameOver";
    ev.cue("win");
  }

  /* ---------------- public API ---------------- */

  return {
    state,
    startGame,
    setVenue,
    step,
    selectCard: (i: number) => { selectedCard = clamp(i, 0, 2); if (sheet) pickPlay(selectedCard); },
    audible: () => {
      if (state.phase === "preSnap" && state.possession === "user") {
        selectedCard = (selectedCard + 1) % 3;
        if (sheet) pickPlay(selectedCard);
        ev.cue("audible");
      }
    },
    snapNow: () => { if (state.phase === "preSnap") { if (!state.play) pickPlay(selectedCard); snap(); } },
    getSheet: () => sheet,
    getSelectedCard: () => selectedCard,
    labState: () => ({ route: labReps, tackle: tackleLab }),
    stopGame: () => { state.phase = "idle"; state.mode = "idle"; state.clockRunning = false; },
    pendingConversion: () => pendingTwo,
    rng
  };
}

export type Sim = ReturnType<typeof createSim>;
