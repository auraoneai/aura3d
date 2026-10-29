/**
 * sim.ts — pure game brain for Aura Links 3D.
 *
 * Clubs, three-click swing meter, launch/spin/wind ball-flight integrator with
 * terrain bounce/roll + cup capture, stroke-play scoring (skins carried),
 * AI opponents and the 32-player Pro Circuit medal bracket.
 *
 * Pure TypeScript: no DOM, no engine imports, no three.js, no Math.random —
 * all randomness flows through the seeded `makeRng` LCG.
 *
 * Units: metres, seconds, radians. Frame conventions per types.ts.
 */

import type {
  BallEvent,
  BallState,
  ClubId,
  ClubSpec,
  CourseSpec,
  HoleScore,
  HoleSpec,
  LieKind,
  ScoreCard,
  ShotCommit,
  ShotEnv,
  SwingState,
  TourRival,
  TourRound,
  TourState,
  Vec3,
  WindState,
} from "./types";

/* ------------------------------------------------------------------ *
 *  Constants                                                          *
 * ------------------------------------------------------------------ */

const TAU = Math.PI * 2;
const DEG = Math.PI / 180;

/** metres beyond terrain.bounds that counts as out of bounds */
const OOB_MARGIN = 15;
/** max simulated seconds per stepBall call (frame hitch guard) */
const MAX_STEP_DT = 0.5;

/** vertical restitution by surface zone */
const RESTITUTION: Record<LieKind, number> = {
  tee: 0.38,
  green: 0.42,
  fringe: 0.4,
  fairway: 0.38,
  rough: 0.22,
  sand: 0.06,
  rock: 0.5,
  water: 0,
  oob: 0.3,
};

/** horizontal rolling friction deceleration by zone (m/s²) */
const FRICTION: Record<LieKind, number> = {
  tee: 2.4,
  green: 1.7,
  fringe: 1.9,
  fairway: 2.6,
  rough: 5.5,
  sand: 9,
  rock: 3.2,
  water: 0,
  oob: 4,
};

/** green-surface deceleration used for putt launch sizing (m/s²): the same value stepRoll applies, so a putt rolls the distance it was sized for */
const GREEN_FRICTION = FRICTION.green;

/** contact-quality multiplier on effective power by lie */
const LIE_PENALTY: Record<LieKind, number> = {
  tee: 1,
  green: 1,
  fringe: 0.97,
  fairway: 1,
  rough: 0.82,
  sand: 0.72,
  rock: 0.6,
  water: 0,
  oob: 0,
};

const v3 = (x: number, y: number, z: number): Vec3 => [x, y, z];

const isTerminal = (s: BallState["status"]): boolean =>
  s === "rest" || s === "holed" || s === "water" || s === "oob";

/* ------------------------------------------------------------------ *
 *  Clubs                                                              *
 * ------------------------------------------------------------------ */

export const CLUBS: Record<ClubId, ClubSpec> = {
  driver: { id: "driver", label: "Driver", carry: 240, launchDeg: 12, spin: 0.5, roll: 1.35, order: 0 },
  wood: { id: "wood", label: "3 Wood", carry: 215, launchDeg: 15, spin: 0.6, roll: 1.2, order: 1 },
  hybrid: { id: "hybrid", label: "Hybrid", carry: 190, launchDeg: 18, spin: 0.7, roll: 1.0, order: 2 },
  iron: { id: "iron", label: "7 Iron", carry: 150, launchDeg: 24, spin: 0.85, roll: 0.7, order: 3 },
  wedge: { id: "wedge", label: "Wedge", carry: 95, launchDeg: 38, spin: 1.15, roll: 0.35, order: 4 },
  putter: { id: "putter", label: "Putter", carry: 30, launchDeg: 0, spin: 0, roll: 1, order: 5, putter: true },
};

export const CLUB_ORDER: readonly ClubId[] = ["driver", "wood", "hybrid", "iron", "wedge", "putter"];

/* ------------------------------------------------------------------ *
 *  Swing meter — classic three-click state machine                    *
 * ------------------------------------------------------------------ *
 *  Phases used: idle → power → accuracy → committed.
 *  - power:    meter sweeps 0→1 over ~1.15s then HOLDS at 1 (no punish).
 *  - accuracy: meter IS the needle value, sweeping +1 → -1 over ~0.9s.
 *  - press 3 locks v = needle. Inside the dead-centre strip |v| <= deadZone
 *    the shot is pure: accuracy 0 and spin 0. Outside it,
 *    accuracy = (|v|-deadZone)/(1-deadZone) and spin = sign(v)·accuracy:
 *    off-centre draws (-) / fades (+). Needle reaching -1 auto-commits
 *    (snap hook).
 *  The dead zone is the difficulty's pure strip (wide for amateur, narrow
 *  for legend); the meter never presses itself.
 */

const POWER_SWEEP_S = 1.15;
const ACC_SWEEP_S = 0.9;
/** default dead-centre strip of the accuracy needle that produces a pure, zero-spin strike */
export const ACC_DEAD_ZONE = 0.12;

const idleSwing = (): SwingState => ({
  phase: "idle",
  meter: 0,
  power: null,
  accuracy: null,
  spin: null,
  sweepDir: 1,
});

/** needle result → (accuracy, spin) for a given pure strip half-width */
export function needleResult(v: number, deadZone: number = ACC_DEAD_ZONE): { accuracy: number; spin: number } {
  const dz = Math.min(0.9, Math.max(0, deadZone));
  const a = Math.min(1, Math.abs(v));
  const off = a <= dz ? 0 : (a - dz) / (1 - dz);
  return { accuracy: off, spin: off === 0 ? 0 : Math.sign(v) * off };
}

export function createSwingMeter(options: { deadZone?: number } = {}): {
  state(): SwingState;
  press(): SwingState;
  tick(dt: number): SwingState;
  reset(): void;
  setDeadZone(deadZone: number): void;
  deadZone(): number;
} {
  let s: SwingState = idleSwing();
  let deadZone = options.deadZone ?? ACC_DEAD_ZONE;

  const commit = (v: number): SwingState => {
    const { accuracy, spin } = needleResult(v, deadZone);
    s = {
      phase: "committed",
      meter: v,
      power: s.power ?? 1,
      accuracy,
      spin,
      sweepDir: s.sweepDir,
    };
    return s;
  };

  return {
    state(): SwingState {
      return s;
    },
    press(): SwingState {
      if (s.phase === "idle") {
        s = { ...idleSwing(), phase: "power" };
      } else if (s.phase === "power") {
        // lock power, needle restarts at +1 sweeping back toward -1
        s = { phase: "accuracy", meter: 1, power: s.meter, accuracy: null, spin: null, sweepDir: -1 };
      } else if (s.phase === "accuracy") {
        commit(s.meter);
      }
      // "committed" (and any other phase) → press is a no-op
      return s;
    },
    tick(dt: number): SwingState {
      if (dt <= 0) return s;
      if (s.phase === "power") {
        const m = s.meter + dt / POWER_SWEEP_S;
        // clamp + hold at 1 — let the player hang at max power
        s = { ...s, meter: m >= 1 ? 1 : m };
      } else if (s.phase === "accuracy") {
        // needle travels +1 → -1 (range of 2) over ACC_SWEEP_S
        const v = s.meter - (2 * dt) / ACC_SWEEP_S;
        if (v <= -1) return commit(-1); // ran off the end → snap hook auto-commit
        s = { ...s, meter: v };
      }
      return s;
    },
    reset(): void {
      s = idleSwing();
    },
    setDeadZone(dz: number): void {
      deadZone = dz;
    },
    deadZone(): number {
      return deadZone;
    },
  };
}

/* ------------------------------------------------------------------ *
 *  Lies & club suggestion                                             *
 * ------------------------------------------------------------------ */

export function liePenalty(lie: LieKind): number {
  return LIE_PENALTY[lie];
}

/**
 * Caddie pick: the shortest-carrying club that still covers dist·1.05
 * (a touch of margin so a pure strike gets there). Putter on/around the
 * green or for very short shots from a clean lie. From sand/rough the
 * longest suggestion is capped at iron — unless dist > 180, where the
 * hybrid's extra forgiveness wins.
 */
export function suggestClub(lie: LieKind, dist: number): ClubId {
  const shortGrass = lie === "tee" || lie === "fairway" || lie === "green" || lie === "fringe";
  if (lie === "green" || lie === "fringe" || (dist < 18 && shortGrass)) return "putter";

  const penalized = lie === "sand" || lie === "rough";
  if (penalized && dist > 180) return "hybrid";

  const need = dist * 1.05;
  let best: ClubId | null = null;
  for (const id of CLUB_ORDER) {
    const c = CLUBS[id];
    if (c.putter) continue;
    if (penalized && c.order < CLUBS.iron.order) continue; // cap at iron
    if (c.carry >= need && (best === null || c.carry < CLUBS[best].carry)) best = id;
  }
  if (best !== null) return best;
  // nothing reaches → longest permitted club
  return penalized ? "iron" : "driver";
}

/* ------------------------------------------------------------------ *
 *  Ball flight                                                        *
 * ------------------------------------------------------------------ *
 *  ClubSpec.roll is carried on the ball via a private WeakMap so the
 *  post-landing rollout multiplier can be applied on first ground
 *  contact without widening the BallState contract. Callers that rebuild
 *  a BallState via spread simply get roll=1 (neutral).
 */

const rollFactorOf = new WeakMap<BallState, number>();
const rollAppliedTo = new WeakSet<BallState>();

/** clone `b` with `patch`, propagating private rollout metadata */
function nextBall(b: BallState, patch: Partial<BallState>): BallState {
  const n: BallState = { ...b, ...patch };
  const r = rollFactorOf.get(b);
  if (r !== undefined) rollFactorOf.set(n, r);
  if (rollAppliedTo.has(b)) rollAppliedTo.add(n);
  return n;
}

export function launchBall(commit: ShotCommit, env: ShotEnv): BallState {
  const club = commit.club;
  const g = env.gravity;
  const effectivePower = commit.power * env.liePenalty;
  const targetCarry = club.carry * effectivePower;
  // spawn on the tee box — callers reposition for non-tee lies via spread
  const start = env.terrain.tee;

  if (club.putter) {
    // horizontal-only speed sized for `targetCarry` metres of green rollout
    const v0 = Math.sqrt(2 * GREEN_FRICTION * Math.max(0, targetCarry));
    const ball: BallState = {
      pos: start,
      vel: v3(Math.sin(commit.aimYaw) * v0, 0, Math.cos(commit.aimYaw) * v0),
      curve: 0,
      backspin: 0,
      status: "roll",
      carry: 0,
      bounces: 0,
    };
    rollFactorOf.set(ball, club.roll);
    return ball;
  }

  const launch = club.launchDeg * DEG;
  const sin2 = Math.sin(2 * launch);
  // vacuum projectile speed that carries `targetCarry` at this loft
  const v0 = targetCarry > 0 && sin2 > 1e-6 ? Math.sqrt((targetCarry * g) / sin2) : 0;
  // accuracy error pushes the shot off line (~5° at full miss)
  const dirYaw = commit.aimYaw + commit.accuracy * 0.09;
  const cL = Math.cos(launch);
  const ball: BallState = {
    pos: start,
    vel: v3(v0 * Math.sin(dirYaw) * cL, v0 * Math.sin(launch), v0 * Math.cos(dirYaw) * cL),
    // spin strength scales with the club's spin factor
    curve: commit.spin * (0.55 + club.spin * 0.45),
    backspin: club.spin * commit.power,
    status: "flight",
    carry: 0,
    bounces: 0,
  };
  rollFactorOf.set(ball, club.roll);
  return ball;
}

export function stepBall(ball: BallState, env: ShotEnv, dt: number): { ball: BallState; events: BallEvent[] } {
  if (dt <= 0 || isTerminal(ball.status)) return { ball, events: [] };
  const events: BallEvent[] = [];

  // Substep: keep each integration slice ≤ 1/120 s when the ball is moving
  // fast so turf contact + cup capture can't be tunnelled through.
  const total = Math.min(dt, MAX_STEP_DT);
  const speed = Math.hypot(ball.vel[0], ball.vel[1], ball.vel[2]);
  const maxH = speed > 15 ? 1 / 120 : 1 / 60;
  const n = Math.max(1, Math.ceil(total / maxH));
  const h = total / n;

  let cur = ball;
  for (let i = 0; i < n; i++) {
    if (cur.status === "flight") {
      cur = stepFlight(cur, env, h, events);
    } else if (cur.status === "roll") {
      cur = stepRoll(cur, env, h, events);
    } else {
      break;
    }
    if (isTerminal(cur.status)) break;
  }
  return { ball: cur, events };
}

function outOfBounds(env: ShotEnv, x: number, z: number): boolean {
  const b = env.terrain.bounds;
  return x < b.minX - OOB_MARGIN || x > b.maxX + OOB_MARGIN || z < b.minZ - OOB_MARGIN || z > b.maxZ + OOB_MARGIN;
}

function stepFlight(b: BallState, env: ShotEnv, h: number, events: BallEvent[]): BallState {
  const g = env.gravity;
  const rho = env.airDensity;
  let [vx, vy, vz] = b.vel;
  let [px, py, pz] = b.pos;

  // gravity
  vy -= g * h;

  // magnus — lateral accel perpendicular to horizontal velocity.
  // curve > 0 (fade) drifts right of travel: right-of-heading (hx,hz) is (hz,-hx).
  const hs = Math.hypot(vx, vz);
  if (hs > 1e-6) {
    const aLat = b.curve * 2.2 * rho;
    const vx0 = vx;
    vx += aLat * (vz / hs) * h;
    vz += aLat * (-vx0 / hs) * h;
  }

  // drag — horizontal bleeds harder than vertical
  const dH = 1 - 0.06 * rho * h;
  vx *= dH;
  vz *= dH;
  vy *= 1 - 0.02 * rho * h;

  // wind — grips high-spin balls more
  const grip = (0.35 + b.backspin * 0.25) * rho;
  vx += env.wind.speed * Math.sin(env.wind.yaw) * grip * h;
  vz += env.wind.speed * Math.cos(env.wind.yaw) * grip * h;

  // integrate
  const ox = px;
  const oz = pz;
  px += vx * h;
  py += vy * h;
  pz += vz * h;
  const carry = b.carry + Math.hypot(px - ox, pz - oz);

  // flew out of the world
  if (outOfBounds(env, px, pz)) {
    events.push({ kind: "oob", pos: v3(px, py, pz) });
    return nextBall(b, { pos: v3(px, py, pz), vel: v3(vx, vy, vz), carry, status: "oob" });
  }

  const ground = env.terrain.height(px, pz);
  if (py > ground) {
    return nextBall(b, { pos: v3(px, py, pz), vel: v3(vx, vy, vz), carry });
  }

  // at/below the surface — clamp first
  py = ground;
  if (vy > 0) {
    // skimming up out of a dip — keep flying
    return nextBall(b, { pos: v3(px, py, pz), vel: v3(vx, vy, vz), carry });
  }

  const zone = env.terrain.zone(px, pz);
  const pos = v3(px, py, pz);

  if (zone === "water") {
    events.push({ kind: "water", pos });
    return nextBall(b, { pos, vel: v3(vx, 0, vz), carry, status: "water" });
  }

  // slammed straight into the cup
  if (env.terrain.cupDistance(px, pz) < 0.11 && Math.hypot(vx, vz) < 3) {
    events.push({ kind: "holed", pos: env.terrain.cup });
    return nextBall(b, { pos: env.terrain.cup, vel: v3(0, 0, 0), carry, status: "holed" });
  }

  // first ground contact: club rollout multiplier on residual speed
  if (!rollAppliedTo.has(b)) {
    const rf = rollFactorOf.get(b) ?? 1;
    vx *= rf;
    vz *= rf;
  }

  // real backspin check on the first green bounce
  if (zone === "green" && b.bounces === 0) {
    const chk = Math.max(0.05, 1 - b.backspin * 0.9);
    vx *= chk;
    vz *= chk;
  }

  const rest = RESTITUTION[zone];
  vy = -vy * rest;
  const hMul = zone === "green" || zone === "fairway" ? 0.55 : 0.35;
  vx *= hMul;
  vz *= hMul;

  const spd = Math.hypot(vx, vy, vz);
  if (spd < 2.2) {
    events.push({ kind: "rollout", pos, zone });
    const n = nextBall(b, { pos, vel: v3(vx, 0, vz), carry, status: "roll" });
    rollAppliedTo.add(n);
    return n;
  }

  events.push({ kind: "bounce", pos, zone });
  const n = nextBall(b, { pos, vel: v3(vx, vy, vz), carry, bounces: b.bounces + 1 });
  rollAppliedTo.add(n);
  return n;
}

function stepRoll(b: BallState, env: ShotEnv, h: number, events: BallEvent[]): BallState {
  let [px, , pz] = b.pos;
  let [vx, , vz] = b.vel;

  if (outOfBounds(env, px, pz)) {
    const pos = v3(px, env.terrain.height(px, pz), pz);
    events.push({ kind: "oob", pos });
    return nextBall(b, { pos, vel: v3(0, 0, 0), status: "oob" });
  }

  const zone = env.terrain.zone(px, pz);
  const py = env.terrain.height(px, pz);

  if (zone === "water") {
    const pos = v3(px, py, pz);
    events.push({ kind: "water", pos });
    return nextBall(b, { pos, vel: v3(0, 0, 0), status: "water" });
  }
  if (zone === "oob") {
    const pos = v3(px, py, pz);
    events.push({ kind: "oob", pos });
    return nextBall(b, { pos, vel: v3(0, 0, 0), status: "oob" });
  }

  // slope pull — balls break downhill (the read on greens)
  const sl = env.terrain.slope(px, pz);
  vx += -sl[0] * 1.6 * h;
  vz += -sl[1] * 1.6 * h;

  // rolling friction — decelerate toward stop, never reverse
  const f = FRICTION[zone];
  const sp = Math.hypot(vx, vz);
  if (sp > 1e-9) {
    const k = Math.max(0, sp - f * h) / sp;
    vx *= k;
    vz *= k;
  }

  // integrate along the ground
  const ox = px;
  const oz = pz;
  px += vx * h;
  pz += vz * h;
  let ground = env.terrain.height(px, pz);
  const zone2 = env.terrain.zone(px, pz);

  if (outOfBounds(env, px, pz) || zone2 === "oob") {
    const pos = v3(px, ground, pz);
    events.push({ kind: "oob", pos });
    return nextBall(b, { pos, vel: v3(0, 0, 0), status: "oob" });
  }
  if (zone2 === "water") {
    const pos = v3(px, ground, pz);
    events.push({ kind: "water", pos });
    return nextBall(b, { pos, vel: v3(0, 0, 0), status: "water" });
  }

  // --- cup logic ------------------------------------------------------
  // Swept test: the closest approach of this step's segment to the cup, so
  // the outcome does not depend on the frame rate.
  const cup = env.terrain.cup;
  let speed = Math.hypot(vx, vz);
  const pass = closestApproach(ox, oz, px, pz, cup[0], cup[2]);

  if (pass.dist < CUP_CAPTURE_R && speed < CUP_CAPTURE_SPEED) {
    // capture — drop it in
    events.push({ kind: "holed", pos: cup });
    return nextBall(b, { pos: cup, vel: v3(0, 0, 0), status: "holed" });
  }
  if (pass.dist < CUP_LIP_R && speed >= CUP_CAPTURE_SPEED && pass.inSegment) {
    // lip-out — too hot: the ball catches the lip and is deflected sideways,
    // never back toward the player. Dead centre deflects most and loses most.
    const out = lipOutVelocity(vx, vz, pass.side, pass.dist / CUP_LIP_R);
    vx = out[0];
    vz = out[1];
    // continue from the closest point with the time left in this step
    const rest = (1 - pass.u) * h;
    px = pass.x + vx * rest;
    pz = pass.z + vz * rest;
    ground = env.terrain.height(px, pz);
    events.push({ kind: "lip", pos: v3(pass.x, cup[1], pass.z) });
  } else {
    const cd = env.terrain.cupDistance(px, pz);
    if (cd < 0.35 && cd > 1e-6 && speed < 4.5 && zone2 === "green") {
      // cup rattle — gentle pull toward the hole on close slow passes
      const ux = (cup[0] - px) / cd;
      const uz = (cup[2] - pz) / cd;
      vx += ux * 3.0 * h;
      vz += uz * 3.0 * h;
    }
  }

  speed = Math.hypot(vx, vz);
  const slopePull = Math.hypot(sl[0], sl[1]) * 1.6;
  if (speed < 0.25 && slopePull <= f) {
    // came to rest (and the slope can't restart it)
    const pos = v3(px, ground, pz);
    events.push({ kind: "rest", pos, zone: zone2 });
    return nextBall(b, { pos, vel: v3(0, 0, 0), status: "rest" });
  }

  return nextBall(b, { pos: v3(px, ground, pz), vel: v3(vx, 0, vz), status: "roll" });
}

/** cup capture radius (m): ball centre inside this at low speed drops */
export const CUP_CAPTURE_R = 0.1;
/** above this ground speed (m/s) a ball over the cup does not drop */
export const CUP_CAPTURE_SPEED = 2.6;
/** a fast ball whose path passes this close to the cup centre catches the lip */
export const CUP_LIP_R = 0.05;
const LIP_MIN_DEG = 25;
const LIP_MAX_DEG = 60;

/** closest approach of segment (ax,az)→(bx,bz) to point (cx,cz) */
export function closestApproach(
  ax: number, az: number, bx: number, bz: number, cx: number, cz: number
): { dist: number; u: number; x: number; z: number; side: number; inSegment: boolean } {
  const dx = bx - ax;
  const dz = bz - az;
  const l2 = dx * dx + dz * dz;
  const raw = l2 > 1e-12 ? ((cx - ax) * dx + (cz - az) * dz) / l2 : 1;
  const u = Math.max(0, Math.min(1, raw));
  const x = ax + dx * u;
  const z = az + dz * u;
  // side: which side of the travel line the cup centre sits (+1 right, -1 left)
  // dot of the cup vector with the right-of-travel normal (dz, -dx)
  const right = (cx - ax) * dz - (cz - az) * dx;
  return { dist: Math.hypot(cx - x, cz - z), u, x, z, side: right >= 0 ? 1 : -1, inSegment: raw > 0 && raw <= 1 };
}

/**
 * Lip-out: rotate the travel direction away from the cup by 25° (grazing the
 * lip) to 60° (dead centre) and keep 80% (grazing) to 60% (dead centre) of the
 * speed. `offset` is the miss distance as a fraction of CUP_LIP_R (0..1).
 * `cupSide` is the side of the travel line the cup is on; the ball turns the
 * other way. Never reverses the ball.
 */
export function lipOutVelocity(vx: number, vz: number, cupSide: number, offset: number): [number, number] {
  const o = Math.max(0, Math.min(1, offset));
  const deg = LIP_MAX_DEG - (LIP_MAX_DEG - LIP_MIN_DEG) * o;
  const keep = 0.6 + 0.2 * o;
  // positive angle turns toward +right of travel: right-of-heading (hx,hz) is (hz,-hx)
  const turn = -cupSide * deg * DEG; // away from the cup
  const c = Math.cos(turn);
  const s = Math.sin(turn);
  // rotate heading by `turn` toward its right-hand side
  const nx = vx * c + vz * s;
  const nz = vz * c - vx * s;
  return [nx * keep, nz * keep];
}

/* ------------------------------------------------------------------ *
 *  Wind                                                               *
 * ------------------------------------------------------------------ */

export function rollWind(course: CourseSpec, rng: () => number): WindState {
  return {
    yaw: rng() * TAU,
    speed: course.wind.baseSpeed + course.wind.gust * rng(),
  };
}

/* ------------------------------------------------------------------ *
 *  Scoring                                                            *
 * ------------------------------------------------------------------ */

export function scoreLabel(par: number, strokes: number): string {
  if (strokes === 1) return "ace";
  const diff = strokes - par;
  if (diff <= -4) return "albatross+";
  if (diff === -3) return "albatross";
  if (diff === -2) return "eagle";
  if (diff === -1) return "birdie";
  if (diff === 0) return "par";
  if (diff === 1) return "bogey";
  if (diff === 2) return "double";
  if (diff === 3) return "triple";
  return `+${diff}`;
}

export function createScoreCard(course: CourseSpec): ScoreCard {
  let totalPar = 0;
  const holes: HoleScore[] = course.holes.map((h) => {
    totalPar += h.par;
    return { hole: h.number, par: h.par, strokes: 0, putts: 0, label: "" };
  });
  return { courseId: course.id, holes, totalStrokes: 0, totalPar, toPar: 0, skins: 0 };
}

export function recordHole(card: ScoreCard, hole: HoleSpec, strokes: number, putts: number): ScoreCard {
  const entry: HoleScore = {
    hole: hole.number,
    par: hole.par,
    strokes,
    putts,
    label: scoreLabel(hole.par, strokes),
  };
  const holes = card.holes.some((hs) => hs.hole === hole.number)
    ? card.holes.map((hs) => (hs.hole === hole.number ? entry : hs))
    : [...card.holes, entry].sort((a, b) => a.hole - b.hole);

  let totalStrokes = 0;
  let toPar = 0;
  for (const hs of holes) {
    if (hs.label === "") continue; // unplayed seed row
    totalStrokes += hs.strokes;
    toPar += hs.strokes - hs.par;
  }
  // skins purse is owned by the caller — preserve verbatim
  return { ...card, holes, totalStrokes, toPar };
}

/* ------------------------------------------------------------------ *
 *  Seeded RNG — 32-bit LCG, the only randomness in this module        *
 * ------------------------------------------------------------------ */

export function makeRng(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    // divide by 2^32 so the result is in [0, 1): a shuffle index floor(rng()*n) never reaches n
    return s / 4294967296;
  };
}

/* ------------------------------------------------------------------ *
 *  AI                                                                 *
 * ------------------------------------------------------------------ */

/**
 * One hole for a CPU golfer. Expected ≈ par + (1-skill)·2.2 with
 * triangular variance; skilled players (skill > 0.7) take birdies with
 * ~skill·0.35 probability and the occasional par-5 eagle. Clamp [1, par+6].
 */
export function aiHoleScore(par: number, skill: number, rng: () => number): number {
  const s = Math.min(1, Math.max(0, skill));

  if (s > 0.7 && rng() < s * 0.35) {
    if (par === 5 && rng() < 0.07) return par - 2; // rare eagle
    return par - 1; // birdie
  }

  const mean = par + (1 - s) * 2.2;
  const noise = (rng() + rng() + rng()) / 3 - 0.5; // ~[-0.5, 0.5]
  const floor = s > 0.7 ? par : 1; // birdies only via the branch above
  const score = Math.round(mean + noise * 3.4);
  return Math.max(floor, Math.min(par + 6, score));
}

/* ------------------------------------------------------------------ *
 *  Pro Circuit — 32-player medal bracket                              *
 * ------------------------------------------------------------------ */

const TOUR_PARS: readonly number[] = [4, 3, 4, 5, 4, 3, 4, 5, 4];
const TOUR_PAR_TOTAL = TOUR_PARS.reduce((a, b) => a + b, 0); // 36
const ROUND_ORDER: readonly TourRound[] = ["r32", "r16", "qtr", "semi", "final", "champion"];
export const PLAYER_NAME = "You";

const RIVAL_NAMES: readonly string[] = [
  "Alba MacDowell", "Sten Olafsson", "Kobe Tanigawa", "Viktor Halvorsen",
  "Marco Bellini", "Duncan Craig", "Pablo Serrano", "Henrik Lundqvist",
  "Rory Delaney", "Tomas Bergeron", "Aksel Bjornstad", "Joaquin Mira",
  "Callum Fairbairn", "Nils Andersen", "Diego Fuente", "Ewan Sinclair",
  "Lars Vestergaard", "Silas Moreau", "Otto Lindgren", "Mateo Vidal",
  "Hamish Bruce", "Emil Kronholm", "Soren Aabye", "Felix Marchetti",
  "Bram DeVries", "Riku Toivonen", "Casper Nielsen", "Theo Castellan",
  "Ivan Petrov", "Jonas Ekstrom", "Lachlan Muir", "Petar Kovac",
];

export function createTour(seed: number = 1): TourState {
  const rng = makeRng(seed);
  // shuffle names so bracket seed (strength order) isn't name-correlated
  const idx = RIVAL_NAMES.map((_, i) => i);
  for (let i = idx.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const t = idx[i];
    idx[i] = idx[j];
    idx[j] = t;
  }
  const last = idx.length - 1;
  const rivals: TourRival[] = idx.map((nameIdx, p) => ({
    seed: p + 1, // seed 1 = strongest
    name: RIVAL_NAMES[nameIdx],
    skill: 0.95 - (p / last) * 0.5, // 0.95 .. 0.45
    eliminated: false,
    score: 0,
  }));
  return { rivals, round: "r32", playerAlive: true, playerScore: 0, results: [] };
}

/**
 * Play one tour round. Every alive rival + the player (while alive) posts a
 * 9-hole medal score on TOUR_PARS; the top ~half of the rival field advances
 * (32→16→8→4→2→champion). The player advances while their cumulative score
 * is inside the cut; on the final, surviving as the lowest score = champion.
 * Player is always written into results for bracket display.
 */
export function advanceTour(tour: TourState, playerToPar: number): TourState {
  const rIdx = ROUND_ORDER.indexOf(tour.round);
  if (rIdx < 0 || rIdx >= ROUND_ORDER.length - 1) return tour; // already champion
  const nextRound = ROUND_ORDER[rIdx + 1];
  const isFinal = tour.round === "final";

  // deterministic per-round rng derived from tour state (no hidden state)
  const seedBits =
    (tour.rivals.reduce((a, r, i) => (a + r.seed * (i + 3)) | 0, 7) ^
      ((rIdx * 7919) | 0) ^
      ((tour.playerScore * 31) | 0)) >>>
    0;
  const rng = makeRng(seedBits);

  const newPlayerScore = tour.playerScore + playerToPar;
  const wasAlive = tour.playerAlive;

  // simulate this round for each surviving rival (cumulative toPar)
  const played = tour.rivals
    .filter((r) => !r.eliminated)
    .map((r) => {
      let round = 0;
      for (const p of TOUR_PARS) round += aiHoleScore(p, r.skill, rng);
      return { rival: r, total: r.score + (round - TOUR_PAR_TOTAL) };
    })
    .sort((a, b) => a.total - b.total); // lowest score first

  const advancing = new Set<number>();
  let playerAdvanced = false;

  if (isFinal) {
    // medal final — lowest cumulative score takes the title
    const bestRival = played.length > 0 ? played[0].total : Number.POSITIVE_INFINITY;
    playerAdvanced = wasAlive && newPlayerScore <= bestRival;
    if (!playerAdvanced && played.length > 0) advancing.add(played[0].rival.seed);
  } else {
    const advCount = Math.max(1, Math.ceil(played.length / 2));
    for (let i = 0; i < advCount && i < played.length; i++) advancing.add(played[i].rival.seed);
    const cutScore = played.length > 0 ? played[Math.min(advCount, played.length) - 1].total : 0;
    playerAdvanced = wasAlive && newPlayerScore <= cutScore;
  }

  const rivals: TourRival[] = tour.rivals.map((r) => {
    const p = played.find((e) => e.rival.seed === r.seed);
    if (!p) return r; // already eliminated — untouched
    return { ...r, score: p.total, eliminated: !advancing.has(r.seed) };
  });

  const rows = played.map((e) => ({
    round: tour.round,
    name: e.rival.name,
    score: e.total,
    advanced: advancing.has(e.rival.seed),
  }));
  rows.push({ round: tour.round, name: PLAYER_NAME, score: newPlayerScore, advanced: playerAdvanced });

  return {
    rivals,
    round: nextRound,
    playerAlive: isFinal ? playerAdvanced : wasAlive && playerAdvanced,
    playerScore: newPlayerScore,
    results: [...tour.results, ...rows],
  };
}
