/**
 * Strange Orbit race simulation: pure, deterministic and framework-free (depends
 * only on this folder's `Vec3`/course/track modules, never on the engine).
 *
 * Ported from the original's `src/race.js`, `gravity.js`, `skate-loop.js`,
 * `jump.js` and `race-order.js`. The step function keeps the original's input →
 * state semantics and evaluation order; see PORTING-NOTES.md for the (few)
 * documented divergences. There is no randomness anywhere in the simulation:
 * rivals use per-rival seeds and `Math.sin`, so identical inputs reproduce the
 * same race exactly. The original steps it at a fixed 1/60 s (`STEP`).
 */
import {
  COURSE_LENGTH,
  BIKE_RAMPS,
  DIFFICULTY,
  EQUIPMENT,
  GATES,
  ISLAND_TILES,
  OPAL,
  RESONANCE_GATES,
  RIDERS,
  RIVAL_NAMES,
  SKATE_LOOPS,
  SPLIT,
  applyRouteTransitions,
  clamp,
  collectibles,
  courseById,
  groundHeight,
  islandHeight,
  islandRecoverS,
  islandSurface,
  meteorLane,
  normalizeDifficulty,
  rampAt,
  rampHeightAt,
  rampsFor,
  rivalForcedLane,
  routeOffset,
  smoothstep01,
  trackLane,
  wrapS,
  type CourseDef,
  type Difficulty,
  type DifficultyRules,
  type IslandTile,
  type LoopDef,
  type Mode,
  type Ramp,
  type Collectible,
  type Route,
  type Vehicle
} from "./course";
import { createImpactWorld, type ImpactWorld } from "@aura3d/engine/game";
import { impactColliders } from "./obstacles";
import { findReentry, findUndersideBlock } from "./reentry";
import { activeCourse, centrifugalDrift, mainFrame, routeFrame, routeLengthScale, setActiveCourse, surfaceNoise } from "./track";
import { Vec3 } from "./vec3";

/** The original's fixed simulation step. */
export const STEP = 1 / 60;

export type Phase = "menu" | "countdown" | "racing" | "paused" | "finished" | "lost";

export interface Input {
  pedal?: boolean;
  brake?: boolean;
  steer?: number;
  boost?: boolean;
  jump?: boolean;
  gravity?: boolean;
}

export interface RaceEvent { type: string; text?: string; mult?: number; gate?: number; impact?: number; colliderId?: string; point?: [number, number, number]; normal?: [number, number, number] }

export interface Air {
  height: number;
  vy: number;
  age: number;
  peak?: number;
  launchSpeed?: number;
  platform?: boolean;
  fromTile?: number;
  ramp?: string | null;
  trick?: { elapsed: number; duration: number };
  crossedGap?: boolean;
}

export interface Flight {
  mode: "drift" | "sling";
  position: Vec3;
  velocity: Vec3;
  up: Vec3;
  forward: Vec3;
  age: number;
  elapsed: number;
  startS: number;
  route: Route;
  from?: Vec3;
  target?: Vec3;
}

export interface LoopState { def: LoopDef; t: number; lane: number; startS: number }

export interface Rival {
  route: Route;
  air: Air | null;
  name: string;
  s: number;
  lane: number;
  speed: number;
  seed: number;
  finished: boolean;
  energy: number;
  hitCooldown: number;
  lateral: number;
  boosting?: boolean;
  cornerClock?: number;
  cornerSpeed?: number;
  lean?: number;
  finishTime?: number;
  recoveries?: number;
  /** Seconds of landing surge left (balance "cup" only; the original's rivals never surge). */
  surge?: number;
}

export interface RaceEnd {
  /** Cup: 1st gold, 2nd silver, 3rd bronze, 4th to 6th none. Time trial: by finish time. */
  medal: "gold" | "silver" | "bronze" | null;
  goals: boolean[];
  place: number;
  time: number;
  score: number;
}

/**
 * `"cup"` (default) is the shipped rival tuning: faster rivals per difficulty, a landing surge at the resonance
 * crystals and a catch-up when the player leads by more than 120 m. `"original"` keeps the original game's rivals
 * bit for bit; the recorded-race replay (`evidence/crayon-capture/strange-orbit-reference.json`) uses it.
 */
export type RivalBalance = "cup" | "original";

/** Rival pace multiplier per difficulty under the `"cup"` balance (the original's `rules.ai` is 0.86 / 0.96 / 1.0). */
export const CUP_RIVAL_PACE: Readonly<Record<Difficulty, number>> = { explorer: 0.98, racer: 1.12, expert: 1.25 };
/** Catch-up: a rival more than `start` metres behind the player gains `rate` m/s per metre over it, up to `max` m/s. */
export const RIVAL_CATCH_UP = { start: 120, rate: 0.06, max: 10 } as const;
/** Free mode keeps this many recent lap times and checkpoints; older collected-item keys are pruned at each lap. */
export const FREE_MODE_HISTORY = 20;

export interface RaceState {
  balance: RivalBalance;
  groundedS: number | null;
  groundedRoute: Route | null;
  gravityRescueReady: boolean;
  heading: number;
  steerRate: number;
  route: Route;
  gatesPassed: number;
  courseId: string;
  round: number;
  equipment: string;
  difficulty: Difficulty;
  rules: DifficultyRules;
  course: CourseDef;
  hits: number;
  /** Solid-scenery impacts during zero-G flight (every contact above `IMPACT.minSpeed`, penalised or not). */
  impacts: number;
  edgeTime: number;
  edgeWarning: boolean;
  shortcutTime: number;
  shortcut: boolean;
  recording: number[][];
  recordClock: number;
  vehicle: Vehicle;
  loop: LoopState | null;
  loops: number;
  tricks: number;
  air: Air | null;
  jumpHeld: boolean;
  jumpCooldown: number;
  jumpBuffer: number;
  stunts: number;
  stuntsCollected: Set<string>;
  checkpointsCollected: Set<number>;
  gravityCharges: number;
  gravityTime: number;
  gravityHeld: boolean;
  flight: Flight | null;
  phase: Phase;
  resumePhase?: Phase | null;
  rider: number;
  mode: Mode;
  laps: number;
  s: number;
  lane: number;
  lateral: number;
  speed: number;
  time: number;
  energy: number;
  dust: number;
  score: number;
  surge: number;
  resonance: number;
  resonanceChain: number;
  nearMisses: number;
  lean: number;
  boostTime: number;
  draftTime: number;
  boosting: boolean;
  drafting: boolean;
  pushing?: boolean;
  combo: number;
  comboTime: number;
  hitCooldown: number;
  respawns: number;
  reentries?: number;
  lap: number;
  checkpoint: number;
  countdown: number;
  place: number;
  bestLap: number;
  lapStart: number;
  lapTimes: number[];
  collected: Set<string>;
  rivals: Rival[];
  events: RaceEvent[];
  end: RaceEnd | null;
}

export interface RaceOptions {
  rider?: number;
  mode?: Mode;
  difficulty?: string;
  vehicle?: Vehicle;
  courseId?: string;
  equipment?: string;
  round?: number;
  /** Rival tuning; default `"cup"`. */
  balance?: RivalBalance;
}

/** Fresh race state in the `menu` phase (the original's `lp`). */
export function createRace(options: RaceOptions = {}): RaceState {
  const { rider = 0, mode = "cup", difficulty = "racer", vehicle = "bike", courseId = "painted", equipment = "balanced", round = 0, balance = "cup" } = options;
  const course = courseById(courseId);
  setActiveCourse(course.id);
  const level = normalizeDifficulty(difficulty);
  const rules = DIFFICULTY[level];
  return {
    balance: balance === "original" ? "original" : "cup",
    groundedS: null,
    groundedRoute: null,
    gravityRescueReady: false,
    heading: 0,
    steerRate: 0,
    route: "main",
    gatesPassed: 0,
    courseId: course.id,
    round,
    equipment,
    difficulty: level,
    rules,
    course,
    hits: 0,
    impacts: 0,
    edgeTime: 0,
    edgeWarning: false,
    shortcutTime: 0,
    shortcut: false,
    recording: [],
    recordClock: 0,
    vehicle: vehicle === "skate" ? "skate" : "bike",
    loop: null,
    loops: 0,
    tricks: 0,
    air: null,
    jumpHeld: false,
    jumpCooldown: 0,
    jumpBuffer: 0,
    stunts: 0,
    stuntsCollected: new Set(),
    checkpointsCollected: new Set(),
    gravityCharges: rules.charges,
    gravityTime: 0,
    gravityHeld: false,
    flight: null,
    phase: "menu",
    rider,
    mode,
    laps: mode === "trial" ? course.trialLaps : course.laps,
    s: 0,
    lane: 0,
    lateral: 0,
    speed: 0,
    time: 0,
    energy: 55,
    dust: 0,
    score: 0,
    surge: 0,
    resonance: 0,
    resonanceChain: 0,
    nearMisses: 0,
    lean: 0,
    boostTime: 0,
    draftTime: 0,
    boosting: false,
    drafting: false,
    combo: 0,
    comboTime: 0,
    hitCooldown: 0,
    respawns: 0,
    lap: 1,
    checkpoint: 0,
    countdown: 3.2,
    place: 6,
    bestLap: Infinity,
    lapStart: 0,
    lapTimes: [],
    collected: new Set(),
    rivals: Array.from({ length: mode === "trial" ? 0 : 5 }, (_, t): Rival => ({
      route: "main",
      air: null,
      name: RIVAL_NAMES[t]!,
      s: 9 + t * 5,
      lane: (t % 3 - 1) * 4.5,
      speed: 0,
      seed: t,
      finished: false,
      energy: 55,
      hitCooldown: 0,
      lateral: 0
    })),
    events: [],
    end: null
  };
}

/** Begin the countdown from the menu. */
export function startCountdown(state: RaceState): void {
  state.phase = "countdown";
  state.events.push({ type: "countdown", text: "Find your rhythm." });
}

/** Toggle pause; returns whether the phase changed. */
export function togglePause(state: RaceState): boolean {
  if (state.phase === "racing" || state.phase === "countdown") {
    state.resumePhase = state.phase;
    state.phase = "paused";
    return true;
  }
  if (state.phase === "paused") {
    state.phase = state.resumePhase ?? "racing";
    state.resumePhase = null;
    return true;
  }
  return false;
}

export function formatTime(seconds: number): string {
  return Number.isFinite(seconds) ? `${Math.floor(seconds / 60)}:${(seconds % 60).toFixed(2).padStart(5, "0")}` : "—";
}

/* ------------------------------------------------------------------ race order */

export interface Standing { id: number; name: string; s: number; finished: boolean; finishTime: number }
export interface RankedStanding extends Standing { place: number; gap: string }

function standingOf(entity: RaceState | Rival, id = 0): Standing {
  if (id === 0) {
    const e = entity as RaceState;
    return { id, name: "YOU", s: e.s, finished: e.phase === "finished", finishTime: e.end?.time ?? e.time };
  }
  const r = entity as Rival;
  return { id, name: r.name, s: r.s, finished: !!r.finished, finishTime: r.finishTime ?? Infinity };
}

const compareStandings = (a: Standing, b: Standing): number =>
  a.finished === b.finished
    ? a.finished ? a.finishTime - b.finishTime || a.id - b.id : b.s - a.s || a.id - b.id
    : a.finished ? -1 : 1;

export function raceOrder(state: RaceState): RankedStanding[] {
  const ordered = [standingOf(state), ...state.rivals.map((r, i) => standingOf(r, i + 1))].sort(compareStandings);
  return ordered.map((entry, place, all) => ({
    ...entry,
    place: place + 1,
    gap: entry.finished ? "FIN"
      : place === 0 ? "LEAD"
        : all[0]!.s - entry.s >= 1450 ? `+${Math.floor((all[0]!.s - entry.s) / COURSE_LENGTH)} LAP`
          : `+${Math.round(Math.max(0, all[0]!.s - entry.s))}m`
  }));
}

export function placeOf(state: RaceState): number {
  const me = standingOf(state);
  return 1 + state.rivals.filter((r, i) => compareStandings(standingOf(r, i + 1), me) < 0).length;
}

/* ------------------------------------------------------------------ gravity / zero-G */

const GRAVITY_DEFAULTS = { charges: 3, duration: 6, driftLimit: 12, slingTime: 1.65 } as const;

const JUMP = { gravity: 14, platformGravity: 30, fieldHeight: 8.5, cooldown: 0.35, buffer: 0.24, coyote: 0.1 } as const;

function enterFlight(e: RaceState, t: number = e.s): void {
  impactWorld().reset();
  const frame = routeFrame(e.s, e.route);
  const air = e.air;
  const forward = frame.tangent.clone().multiplyScalar(Math.cos(e.heading || 0)).addScaledVector(frame.side, Math.sin(e.heading || 0));
  e.flight = {
    mode: "drift",
    position: frame.p.clone()
      .addScaledVector(frame.side, e.lane)
      .addScaledVector(frame.up, 0.12 + surfaceNoise(e.s, trackLane(e.s, e.lane, e.route)) + (air?.height ?? groundHeight(e.s, e.lane, e.route, e.vehicle) ?? 0)),
    velocity: forward.clone()
      .multiplyScalar(e.speed * 0.8)
      .addScaledVector(frame.side, (e.lateral - Math.sin(e.heading || 0) * e.speed) * 1.6)
      .addScaledVector(frame.up, air ? air.vy : 3.5),
    up: frame.up.clone(),
    forward,
    age: 0,
    elapsed: 0,
    startS: islandRecoverS(
      e.route === "islands" && e.groundedRoute === e.route && e.groundedS! <= t && t - e.groundedS! < 200 ? e.groundedS! : t,
      e.route
    ),
    route: e.route
  };
  e.air = null;
  e.jumpBuffer = 0;
  e.boosting = false;
  e.surge = 0;
  e.combo = 0;
  e.resonanceChain = 0;
  e.events.push({ type: "launch", text: "ZERO G · steer · hold Space to rise, S to sink · G to sling back" });
}

/** True when an island rider has dropped below the platform plane (falling between tiles). */
function fellOffIsland(e: RaceState): boolean {
  if (!e.air || e.route !== "islands" || e.air.vy >= 0) return false;
  const base = e.groundedRoute === e.route ? e.groundedS! : e.s;
  const floor = groundHeight(e.s, e.lane, e.route, e.vehicle) ?? islandHeight(islandRecoverS(base, e.route), e.route) ?? 0;
  return e.air.height < floor - 0.35;
}

export function canUseGravity(e: RaceState): boolean {
  const aloft = !!e.flight || fellOffIsland(e);
  if (e.flight?.mode === "sling") return false;
  return aloft ? (e.gravityTime > 0 && e.gravityRescueReady) || e.gravityCharges > 0 : e.gravityCharges > 0 && e.gravityTime <= 0;
}

function useGravity(e: RaceState): boolean {
  if (!canUseGravity(e)) return false;
  if (!e.flight && fellOffIsland(e)) enterFlight(e);
  if (!(e.flight && e.gravityTime > 0 && e.gravityRescueReady)) e.gravityCharges--;
  e.gravityTime = 0;
  e.gravityRescueReady = false;
  if (e.flight) {
    const f = e.flight;
    f.mode = "sling";
    f.from = f.position.clone();
    f.elapsed = 0;
    const target = routeFrame(f.startS, f.route);
    f.target = target.p.addScaledVector(target.up, 0.05 + surfaceNoise(f.startS, trackLane(f.startS, 0, f.route)) + (islandHeight(f.startS, f.route) || 0));
    e.events.push({ type: "sling", text: "Gravity sling · hold on!" });
  } else {
    e.gravityRescueReady = true;
    e.gravityTime = e.rules?.duration || GRAVITY_DEFAULTS.duration;
    e.events.push({ type: "gravity", text: `Gravity lock · ${e.gravityTime} seconds of extra grip` });
  }
  return true;
}

/** Rider sphere and bounce tuning for collisions with solid scenery in zero-G flight. */
const IMPACT = { radius: 0.8, restitution: 0.4, friction: 0.18, minSpeed: 3, energyLoss: 10, cooldown: 1 };

let impactCache: { readonly id: string; readonly world: ImpactWorld } | undefined;

function impactWorld(): ImpactWorld {
  const id = activeCourse().id;
  if (!impactCache || impactCache.id !== id) {
    impactCache = { id, world: createImpactWorld({ colliders: impactColliders(), restitution: IMPACT.restitution, friction: IMPACT.friction, eventMinSpeed: IMPACT.minSpeed }) };
  }
  return impactCache.world;
}

interface FlightStrike { readonly colliderId: string; readonly tag?: string; readonly point: [number, number, number]; readonly normal: [number, number, number]; readonly speed: number }

/** Count a solid impact and apply the moon-rock penalty (once per cooldown). */
function registerImpact(e: RaceState, strike: FlightStrike): void {
  e.impacts++;
  if (e.hitCooldown > 0) return;
  e.hits++;
  e.energy = Math.max(0, e.energy - IMPACT.energyLoss);
  e.combo = 0;
  e.hitCooldown = IMPACT.cooldown;
  e.events.push({
    type: "hit",
    text: `Crashed into the ${strike.tag ?? "scenery"} · steer clear`,
    impact: strike.speed,
    colliderId: strike.colliderId,
    point: strike.point,
    normal: strike.normal
  });
}

/** Bounce the drifter off the underside of a strip (the library impact world collides spheres and boxes only). */
function bounceOffUnderside(e: RaceState, f: Flight, point: Vec3, normal: Vec3): void {
  f.position.copy(point).addScaledVector(normal, IMPACT.radius + 0.02);
  const vn = f.velocity.dot(normal);
  if (vn >= 0) return;
  f.velocity.addScaledVector(normal, -(1 + IMPACT.restitution) * vn);
  const slide = f.velocity.clone().addScaledVector(normal, -f.velocity.dot(normal));
  f.velocity.addScaledVector(slide, -IMPACT.friction);
  if (-vn < IMPACT.minSpeed) return;
  registerImpact(e, { colliderId: "track-underside", tag: "underside of the track", point: [point.x, point.y, point.z], normal: [normal.x, normal.y, normal.z], speed: -vn });
}

/** Advance zero-G flight; returns true when the rider re-entered the track. */
function stepFlight(e: RaceState, dt: number, input: Input): boolean | undefined {
  const f = e.flight!;
  e.boosting = false;
  e.drafting = false;
  e.pushing = !!input.pedal;
  if (f.mode === "drift") {
    const turn = Math.max(-1, Math.min(1, input.steer || 0)) * -1.05 * dt;
    f.forward.applyAxisAngle(f.up, turn);
    f.velocity.applyAxisAngle(f.up, turn);
    if (input.pedal) f.velocity.addScaledVector(f.forward, 5 * dt);
    f.velocity.addScaledVector(f.up, (Number(!!input.jump) - Number(!!input.brake)) * 9 * dt);
    if (f.velocity.length() > 65) f.velocity.setLength(65);
    const previous = f.position.clone();
    f.age += dt;
    const body = { position: [f.position.x, f.position.y, f.position.z] as [number, number, number], velocity: [f.velocity.x, f.velocity.y, f.velocity.z] as [number, number, number], radius: IMPACT.radius };
    const strikes = impactWorld().step(body, dt);
    f.position.set(body.position[0], body.position[1], body.position[2]);
    f.velocity.set(body.velocity[0], body.velocity[1], body.velocity[2]);
    for (const strike of strikes) registerImpact(e, strike);
    const under = f.age > 0.12 && findUndersideBlock(previous, f.position, e.vehicle, IMPACT.radius);
    if (under) bounceOffUnderside(e, f, under.point, under.normal);
    const hit = f.age > 0.12 && findReentry(previous, f.position, e.vehicle, e.s);
    if (hit) {
      const frame = hit.frame;
      const along = f.velocity.dot(frame.tangent);
      const across = f.velocity.dot(frame.side);
      const speed = Math.hypot(along, across);
      e.s = hit.s;
      e.route = hit.route;
      e.lane = hit.lane;
      e.speed = speed < 1 ? 0 : Math.min(61, speed);
      e.heading = speed < 1 ? Math.atan2(f.forward.dot(frame.side), f.forward.dot(frame.tangent)) : Math.atan2(across, along);
      e.lateral = e.speed ? across : 0;
      e.lean = 0;
      e.steerRate = 0;
      e.flight = null;
      e.air = null;
      e.groundedS = e.s;
      e.groundedRoute = e.route;
      e.jumpCooldown = 0;
      e.jumpBuffer = 0;
      e.jumpHeld = !!input.jump;
      e.edgeTime = 0;
      e.edgeWarning = false;
      if (e.gravityTime <= 0) e.gravityRescueReady = false;
      e.gravityTime = Math.max(e.gravityTime, 0.5);
      e.hitCooldown = Math.max(e.hitCooldown, 0.5);
      e.reentries = (e.reentries || 0) + 1;
      e.events.push({ type: "land", text: "BACK ON TRACK · no gravity charge used" });
      return true;
    }
    if (f.age >= (e.rules?.rescue || GRAVITY_DEFAULTS.driftLimit)) {
      e.phase = "lost";
      e.events.push({ type: "lost", text: "Lost in orbit. Try another line." });
    }
  } else {
    f.elapsed += dt;
    const p = Math.min(1, f.elapsed / GRAVITY_DEFAULTS.slingTime);
    const eased = p * p * (3 - 2 * p);
    f.position.lerpVectors(f.from!, f.target!, eased).addScaledVector(f.up, Math.sin(p * Math.PI) * Math.min(14, f.from!.distanceTo(f.target!) * 0.15));
    if (p >= 1) {
      e.s = f.startS;
      e.route = f.route;
      e.groundedS = e.s;
      e.groundedRoute = e.route;
      e.lane = 0;
      e.lateral = 0;
      e.lean = 0;
      e.heading = 0;
      e.steerRate = 0;
      e.speed = f.route === "islands" ? 24 : 28;
      e.flight = null;
      e.air = null;
      e.jumpCooldown = 0;
      e.jumpBuffer = 0;
      e.edgeTime = 0;
      e.edgeWarning = false;
      e.gravityTime = 2;
      e.hitCooldown = 2;
      e.respawns++;
      e.events.push({ type: "land", text: "Back in orbit · 2 seconds of landing grip" });
    }
  }
  return undefined;
}

/* ------------------------------------------------------------------ loops (skate only) */

/** Frame along a skate loop at fraction `t` (lane offset `laneOffset`). */
export function loopFrame(def: LoopDef, t: number, laneOffset = 0): { p: Vec3; tangent: Vec3; side: Vec3; up: Vec3 } {
  const base = mainFrame(def.s);
  const at = (u: number): Vec3 => {
    const f = mainFrame(def.s + def.length * u);
    const a = u * Math.PI * 2;
    return f.p
      .addScaledVector(base.tangent, def.radius * Math.sin(a))
      .addScaledVector(base.up, def.radius * (1 - Math.cos(a)))
      .addScaledVector(f.side, def.lane + laneOffset + Math.sin(a) * def.width * 0.9);
  };
  const p = at(t);
  const tangent = at(t + 1e-4).sub(at(t - 1e-4)).normalize();
  const up = new Vec3().crossVectors(base.side, tangent).normalize();
  const side = new Vec3().crossVectors(tangent, up).normalize();
  return { p, tangent, side, up };
}

function tryEnterLoop(e: RaceState, prevS: number): boolean {
  if (e.vehicle !== "skate" || e.air || e.flight || e.loop) return false;
  const lap = Math.floor(prevS / COURSE_LENGTH);
  for (const def of SKATE_LOOPS) {
    const at = lap * COURSE_LENGTH + def.s;
    if (prevS < at && e.s >= at && Math.abs(e.lane - def.lane) < def.width / 2 && e.speed >= 20) {
      e.loop = { def, t: 0, lane: e.lane - def.lane, startS: at };
      e.s = at;
      e.events.push({ type: "loop", text: "LOOP LOCK · keep your momentum" });
      return true;
    }
  }
  return false;
}

function stepLoop(e: RaceState, input: Input, dt: number, jumpPressed: boolean, gravityPressed: boolean): void {
  const loop = e.loop!;
  const frame = loopFrame(loop.def, loop.t, loop.lane);
  if (gravityPressed) useGravity(e);
  e.pushing = !!input.pedal;
  e.drafting = false;
  e.boosting = !!input.boost && e.energy > 1;
  if (e.boosting) {
    e.energy = Math.max(0, e.energy - 20 * dt);
    e.boostTime += dt;
  }
  e.speed += ((input.pedal ? 6 : 0) + (e.boosting ? 9 : 0) - (input.brake ? 24 : 0) - 1 - frame.tangent.dot(mainFrame(loop.def.s).up) * 5) * dt;
  e.speed = Math.max(0, Math.min(55, e.speed));
  loop.lane += (input.steer || 0) * dt * 2.5;
  if (jumpPressed || Math.abs(loop.lane) > loop.def.width / 2 || (e.speed < 17 && e.gravityTime <= 0)) {
    e.s = loop.startS + loop.def.length * loop.t;
    enterFlight(e);
    const f = e.flight!;
    f.position.copy(frame.p).addScaledVector(frame.up, 0.1);
    f.velocity.copy(frame.tangent).multiplyScalar(e.speed).addScaledVector(frame.up, jumpPressed ? 7 : 1);
    f.forward.copy(frame.tangent);
    f.up.copy(frame.up);
    e.loop = null;
    e.events.push({ type: "launch", text: "LOOP RELEASE · G to sling back" });
    return;
  }
  if (e.gravityTime > 0) {
    loop.lane = Math.max(-1.5, Math.min(1.5, loop.lane));
    e.speed = Math.max(22, e.speed);
  }
  loop.t = Math.min(1, loop.t + dt * e.speed / (loop.def.length + Math.PI * 2 * loop.def.radius));
  e.s = loop.startS + loop.def.length * loop.t;
  if (loop.t >= 1) {
    e.s = loop.startS + loop.def.length;
    e.lane = loop.def.lane + loop.lane;
    e.lateral = 0;
    e.loop = null;
    e.loops++;
    e.score += 650;
    e.surge = 5;
    e.speed = Math.max(e.speed, 44);
    e.energy = Math.min(100, e.energy + 15);
    e.hitCooldown = 1;
    e.events.push({ type: "stunt", text: "FULL ORBIT · +650" });
  }
}

/* ------------------------------------------------------------------ jumping */

const airGravity = (route: Route, gravityLock = false, launchSpeed = 29): number =>
  (route === "islands" ? JUMP.platformGravity * Math.max(0.8, launchSpeed / 29) ** 2 : JUMP.gravity) + (gravityLock ? (route === "islands" ? 2 : 4) : 0);

const launchVelocity = (speed: number, route: Route, gravityLock = false): number =>
  route === "islands" ? 11.8 * Math.max(0.8, speed / 29) * airGravity(route, gravityLock, speed) / airGravity(route, false, speed) : 7.5 + speed * 0.025;

function jumpImpulse(e: RaceState, height: number): number {
  const base = launchVelocity(e.speed, e.route, e.gravityTime > 0);
  if (e.route !== "islands") return base;
  const tile = islandSurface(e.s, e.lane, e.vehicle)?.tile;
  const next = tile && ISLAND_TILES[tile.id + 1];
  if (!next) return base;
  const flightTime = (next.start - wrapS(e.s) + 2) / Math.max(3, e.speed) * 1.04;
  const needed = (next.height - height + 0.3) / flightTime + airGravity(e.route, e.gravityTime > 0, e.speed) * flightTime / 2;
  return Math.max(base, Math.min(16 * Math.max(0.8, e.speed / 29), needed));
}

function jump(e: RaceState): boolean {
  if (e.vehicle === "skate" && e.air && !e.air.trick && e.air.age > 0.12) {
    e.air.trick = { elapsed: 0, duration: e.route === "islands" ? 0.4 : 0.65 };
    e.events.push({ type: "jump", text: "Kickflip · catch the board before landing" });
    return true;
  }
  if ((e.air && !(e.air.platform && e.air.age <= JUMP.coyote)) || e.flight || e.jumpCooldown > 0 || e.speed < 3) return false;
  const height = (groundHeight(e.s, e.lane, e.route, e.vehicle) ?? e.air?.height ?? 0) + (e.route === "main" ? rampHeightAt(e.s, e.lane, e.vehicle) : 0);
  const ramp = e.route === "main" ? rampAt(e.s, e.lane, e.vehicle) : null;
  const rampBoost = ramp ? 2 * Math.sqrt(height * ramp.height) / ramp.length : 0;
  e.jumpBuffer = 0;
  e.air = {
    height,
    launchSpeed: e.speed,
    vy: jumpImpulse(e, height) + e.speed * rampBoost,
    age: 0,
    peak: height,
    ramp: ramp ? Math.floor(e.s / COURSE_LENGTH) + ":" + ramp.id : null
  };
  e.events.push({ type: "jump", text: "Airborne · steer gently, land inside the lane" });
  return true;
}

interface TileHit { height: number | null; half: number; tile: IslandTile | null; s: number; lane: number; blocked?: boolean }

function sweepIslands(prevS: number, curS: number, prevLane: number, curLane: number, prevHeight: number, curHeight: number, vehicle: Vehicle, ignoreTile: number | undefined): TileHit | null {
  const steps = Math.min(64, Math.max(2, Math.ceil(Math.abs(curS - prevS) / 0.35), Math.ceil(Math.abs(curHeight - prevHeight) / 0.3)));
  let last: { tile: IslandTile | null; clearance: number } | null = null;
  for (let u = 0; u <= steps; u++) {
    const d = u / steps;
    const s = prevS + (curS - prevS) * d;
    const lane = prevLane + (curLane - prevLane) * d;
    const h = prevHeight + (curHeight - prevHeight) * d;
    const surface = islandSurface(s, lane, vehicle);
    if (surface && (ignoreTile === undefined || surface.tile?.id !== ignoreTile)) {
      const clearance = h - (surface.height as number);
      const newTile = !last || last.tile !== surface.tile;
      if ((clearance <= 0.35 && clearance >= (newTile ? -1.8 : -0.35)) || (last && last.clearance >= 0 && clearance <= 0)) {
        return { ...surface, s, lane };
      }
      if (newTile && surface.tile && clearance < -1.8 && clearance > -5) return { ...surface, s, lane, blocked: true };
      last = { tile: surface.tile, clearance };
    } else {
      last = null;
    }
  }
  return null;
}

/** Air/platform physics for the player; returns early when a recovery flight starts. */
function stepAir(e: RaceState, prevS: number, dt: number, prevLane: number): void {
  if (!e.air && groundHeight(e.s, e.lane, e.route, e.vehicle) === null) {
    e.air = {
      height: groundHeight(prevS, prevLane, e.route, e.vehicle) || 0,
      vy: 0,
      age: 0,
      peak: 0,
      platform: true,
      fromTile: islandSurface(prevS, prevLane, e.vehicle)?.tile?.id
    };
  }
  if (!e.air && e.route === "main") {
    const lap = Math.floor(prevS / COURSE_LENGTH);
    for (const ramp of rampsFor(e.vehicle)) {
      const lip = lap * COURSE_LENGTH + ramp.s + ramp.length;
      if (prevS < lip && e.s >= lip && Math.abs(e.lane - ramp.lane) < ramp.width / 2) {
        e.air = { height: ramp.height, vy: e.speed * 2 * ramp.height / ramp.length, age: 0, peak: ramp.height, ramp: lap + ":" + ramp.id };
        e.events.push({ type: "jump", text: e.speed > 43 ? "BIG AIR · gravity sling on standby" : ramp.name + " · stick the landing" });
        break;
      }
    }
  }
  if (!e.air) return;
  const air = e.air;
  const previousHeight = air.height;
  air.age += dt;
  if (air.trick) air.trick.elapsed += dt;
  air.vy -= airGravity(e.route, e.gravityTime > 0, air.launchSpeed ?? e.speed) * dt;
  air.height += air.vy * dt;
  air.peak = Math.max(air.peak as number, air.height);
  let ground = groundHeight(e.s, e.lane, e.route, e.vehicle);
  if (ground === null) air.crossedGap = true;
  let tile: IslandTile | null | undefined = islandSurface(e.s, e.lane, e.vehicle)?.tile;
  let planted = false;
  let surfaceHeight = ground === null ? null : ground + (e.route === "main" ? rampHeightAt(e.s, e.lane, e.vehicle) : 0);
  if (e.route === "islands" && air.vy <= 0) {
    const hit = sweepIslands(prevS, e.s, prevLane, e.lane, previousHeight, air.height, e.vehicle, air.platform ? air.fromTile : undefined);
    if (hit) {
      if (hit.blocked) {
        e.s = Math.max(prevS, hit.s);
        e.lane = hit.lane;
        enterFlight(e, prevS);
        const f = e.flight!;
        f.velocity.addScaledVector(f.forward, -1.25 * f.velocity.dot(f.forward));
        e.hits++;
        e.events.push({ type: "hit", text: "Clipped the platform face · gravity sling to recover" });
        return;
      }
      e.s = Math.max(prevS, Math.min(e.s, hit.s));
      e.lane = hit.lane;
      tile = hit.tile;
      planted = true;
      ground = surfaceHeight = groundHeight(e.s, e.lane, e.route, e.vehicle) ?? (hit.height as number);
      air.height = surfaceHeight as number;
    }
  }
  if ((air.height > JUMP.fieldHeight && e.gravityTime <= 0) || air.height < -5) {
    enterFlight(e);
    return;
  }
  const stuntKey = air.ramp || "island:" + Math.floor(e.s / 1450) + ":" + (tile?.id ?? "exit");
  if (surfaceHeight !== null && air.vy < 0 && air.height <= surfaceHeight && (e.route !== "islands" || planted)) {
    e.air = null;
    e.groundedS = e.s;
    e.groundedRoute = e.route;
    e.jumpCooldown = e.route === "islands" ? 0 : JUMP.cooldown;
    if (air.trick) {
      if (air.trick.elapsed >= air.trick.duration) {
        e.score += 300;
        e.tricks++;
        if (e.route !== "islands") e.surge = Math.max(e.surge, 2.3);
        e.energy = Math.min(100, e.energy + 12);
        e.events.push({ type: "stunt", text: "KICKFLIP · +300" });
      } else {
        e.speed *= 0.55;
        e.events.push({ type: "hit", text: "Sketchy landing · finish the flip higher up" });
        return;
      }
    }
    e.hitCooldown = Math.max(e.hitCooldown, 0.25);
    if ((air.ramp || (e.route === "islands" && air.crossedGap)) && !e.stuntsCollected.has(stuntKey)) {
      e.stuntsCollected.add(stuntKey);
      e.stunts++;
      if (e.route !== "islands") e.surge = Math.max(e.surge, 1.8);
      const bonus = 250 + Math.round(air.age * 100);
      e.score += bonus;
      e.energy = Math.min(100, e.energy + 10);
      e.events.push({ type: "stunt", text: `Clean landing · +${bonus} · +10 stardust` });
    } else if (!air.trick) {
      e.events.push({ type: "land", text: "Wheels down. Keep your line." });
    }
  }
}

/* ------------------------------------------------------------------ rivals */

/** True when `x` rides just ahead of rival `r` in its lane (the same test, in the same order, as the original). */
const blocks = (x: Rival | RaceState, r: Rival): boolean => x.route === r.route && x.s > r.s && x.s - r.s < 18 && Math.abs(x.lane - r.lane) < 2.1;

/** Collectibles per course and route, filtered once instead of per rival per step (SO-E1). */
const routeCollectibles = new Map<string, readonly Collectible[]>();
function collectiblesOn(courseId: string, route: Route): readonly Collectible[] {
  const key = `${courseId}:${route}`;
  let list = routeCollectibles.get(key);
  if (!list) routeCollectibles.set(key, list = collectibles(courseId).filter((c) => c.route === route));
  return list;
}

function stepRivals(e: RaceState, dt: number, allowContact: boolean): void {
  for (const r of e.rivals) {
    if (r.finished) continue;
    const here = wrapS(r.s);
    const half = routeOffset(r.s, r.route).half;
    const onRoute = collectiblesOn(e.courseId, r.route);
    const meteor = onRoute.find((c) => c.kind === "meteor" && c.s - here > 0 && c.s - here < 28);
    const dust = onRoute.find((c) => c.kind === "dust" && c.s - here > 0 && c.s - here < 24);
    const nearRamp = BIKE_RAMPS.some((ramp) => here > ramp.s - 25 && here < ramp.s + ramp.length + 8);
    const forced = rivalForcedLane(r.s, r.seed, Math.floor(r.s / COURSE_LENGTH));
    let targetLane = forced ?? (nearRamp ? 0 : dust ? dust.lane : Math.sin(r.s * 0.007 + r.seed * 1.8) * half * 0.55);
    const mistake = Math.sin(e.time * 0.37 + r.seed * 3.7) > 1 - e.rules.mistakes;
    if (forced === null && meteor && Math.abs(targetLane - meteorLane(meteor, e.time)) < 2.8 && !mistake) {
      targetLane = clamp(meteorLane(meteor, e.time) + (r.seed % 2 ? 3.1 : -3.1), -half + 0.7, half - 0.7);
    }
    let blocker: Rival | RaceState | undefined;
    for (const x of e.rivals) if (x !== r && blocks(x, r)) { blocker = x; break; }
    if (!blocker && blocks(e, r)) blocker = e;
    const slipstream = !!blocker;
    if (forced === null && blocker && blocker.s - r.s < 4) {
      targetLane = clamp(blocker.lane + (r.seed % 2 ? 2.4 : -2.4), -half + 0.6, half - 0.6);
    }
    r.energy = r.energy ?? 55;
    r.hitCooldown = Math.max(0, (r.hitCooldown || 0) - dt);
    r.boosting = !r.air && !mistake && r.speed > 5 && r.energy > (r.boosting ? 1 : 25) && !nearRamp && r.route !== "islands";
    const crawl = r.route === "islands" || (here > OPAL.start - 35 && here < OPAL.start && r.seed % 3 !== 0);
    const cup = e.balance === "cup";
    if (cup) r.surge = Math.max(0, (r.surge ?? 0) - dt);
    let cruise = crawl
      ? 28.5
      : (34 + (e.vehicle === "bike" ? 1.4 : -0.5) + (r.seed % 3 - 1)) * (cup ? CUP_RIVAL_PACE[e.difficulty] : e.rules.ai)
        + (r.route === "upper" ? 9 : r.route === "lower" ? 6 : 0)
        + (slipstream ? (e.vehicle === "bike" ? 6.5 : 4) : 0)
        + (r.boosting ? 20 : 0)
        + (cup && (r.surge ?? 0) > 0 ? 12 : 0);
    r.cornerClock = (r.cornerClock || 0) - dt;
    if (r.cornerClock <= 0) {
      r.cornerClock = 0.25;
      let curve = 0;
      for (const ahead of [0, 8, 20]) {
        const a = routeFrame(r.s + ahead, r.route);
        const b = routeFrame(r.s + ahead + 2, r.route);
        curve = Math.max(curve, Math.abs(Math.atan2(b.tangent.dot(a.side), b.tangent.dot(a.tangent))) / 2 * routeLengthScale(r.s + ahead, r.route));
      }
      r.cornerSpeed = Math.max(14, 0.8 / Math.max(0.001, curve));
    }
    cruise = Math.min(cruise, r.cornerSpeed as number) + (cup && e.mode === "cup" && !crawl ? rivalCatchUp(e.s - r.s) : 0);
    if (r.speed > (r.cornerSpeed as number) + 1) r.speed = Math.max(0, r.speed - 18 * dt);
    r.speed += (cruise - r.speed) * Math.min(1, dt * 0.55) - (crawl && r.speed > 29 ? 23 * dt : 0);
    r.energy = clamp(r.energy + (r.boosting ? -20 : slipstream ? 9 : 1.1) * dt, 0, 100);
    const lateralTarget = clamp((targetLane - r.lane) * (mistake ? 0.3 : e.difficulty === "expert" ? 1.1 : 0.7), -1, 1) * (4 + r.speed * 0.115) * (e.vehicle === "skate" ? 1.16 : 1);
    r.lateral = (r.lateral || 0) + (lateralTarget - (r.lateral || 0)) * Math.min(1, dt * 7);
    r.lane = clamp(r.lane + r.lateral * dt, -half + 0.25, half - 0.25);
    r.lean = clamp(r.lateral * 0.03, -0.24, 0.24);
    const prevS = r.s;
    if (r.route === "islands" && !r.air) {
      const tile = ISLAND_TILES.find((t) => here >= t.start && here < t.end);
      if (tile && tile.end - here < Math.max(5.8, r.speed * 0.22)) {
        r.air = { height: islandHeight(r.s, r.route) as number, launchSpeed: r.speed, vy: launchVelocity(r.speed, r.route), age: 0 };
      }
    }
    r.s += r.speed * dt * routeLengthScale(r.s, r.route);
    applyRouteTransitions(r, prevS);
    if (r.air) {
      r.air.age += dt;
      r.air.vy -= airGravity(r.route, false, r.air.launchSpeed) * dt;
      r.air.height += r.air.vy * dt;
      const surface = islandHeight(r.s, r.route);
      if (surface !== null && islandHeight(prevS, r.route) === null && r.air.height < surface - 0.55) {
        r.s = islandRecoverS(prevS, r.route);
        r.air = null;
        r.speed *= 0.55;
        r.energy = Math.max(0, r.energy - 12);
        r.recoveries = (r.recoveries || 0) + 1;
      } else if (surface !== null && r.air.vy < 0 && r.air.height <= surface) {
        r.air = null;
        r.energy = clamp(r.energy + 10, 0, 100);
      } else if (r.air.height < -4) {
        r.speed *= 0.65;
        r.air = null;
        r.s = islandRecoverS(r.s, r.route);
        r.lane = 0;
        r.recoveries = (r.recoveries || 0) + 1;
      }
    }
    r.finished = e.mode !== "free" && r.s >= e.laps * COURSE_LENGTH;
    if (r.finished) {
      r.s = e.laps * COURSE_LENGTH;
      r.finishTime = e.time;
      r.speed = 0;
    }
    for (const c of onRoute) {
      const at = Math.floor(prevS / COURSE_LENGTH) * COURSE_LENGTH + c.s;
      if (prevS < at && r.s >= at && !r.air) {
        const lane = c.kind === "meteor" ? meteorLane(c, e.time) : c.lane;
        if (Math.abs(r.lane - lane) < (c.kind === "dust" ? 1.8 : 1.35)) {
          if (c.kind === "dust") r.energy = clamp(r.energy + 7, 0, 100);
          else if (!r.hitCooldown) {
            r.speed *= 0.6;
            r.energy = Math.max(0, r.energy - 14);
            r.hitCooldown = 1.4;
          }
        }
      }
    }
    for (const gate of GATES) {
      const at = Math.floor(prevS / 1450) * 1450 + gate.s;
      if (prevS < at && r.s >= at) r.energy = clamp(r.energy + 10, 0, 100);
    }
    if (cup && r.route === "main" && !r.air) {
      for (const crystal of RESONANCE_GATES) {
        const at = Math.floor(prevS / COURSE_LENGTH) * COURSE_LENGTH + crystal.s;
        if (prevS < at && r.s >= at && Math.abs(r.lane - crystal.lane) < 2.7) r.surge = 2.6;
      }
    }
    if (allowContact && !r.air && r.route === e.route && Math.abs(r.s - e.s) < 1.35 && Math.abs(r.lane - e.lane) < 0.72 && e.hitCooldown <= 0) {
      e.hits++;
      e.speed *= 0.8;
      r.speed *= 0.9;
      e.hitCooldown = 1.2;
      e.combo = 0;
      e.events.push({ type: "hit", text: "Contact · recover your line" });
    }
  }
}

/** Extra rival cruise speed (m/s) when the player leads the rival by `lead` metres (cup balance only). */
export function rivalCatchUp(lead: number): number {
  return lead > RIVAL_CATCH_UP.start ? Math.min(RIVAL_CATCH_UP.max, (lead - RIVAL_CATCH_UP.start) * RIVAL_CATCH_UP.rate) : 0;
}

/** Medal for a cup finishing place: 1st gold, 2nd silver, 3rd bronze, otherwise none. */
export function medalForPlace(place: number): RaceEnd["medal"] {
  return place === 1 ? "gold" : place === 2 ? "silver" : place === 3 ? "bronze" : null;
}

/** Free mode: drop collected-item keys of laps before `lap - 1` and keep the last `FREE_MODE_HISTORY` lap times. */
export function pruneFreeModeHistory(e: RaceState, lap: number): void {
  for (const key of e.collected) {
    if (Number(key.slice(0, key.indexOf(":"))) < lap - 1) e.collected.delete(key);
  }
  if (e.lapTimes.length > FREE_MODE_HISTORY) e.lapTimes.splice(0, e.lapTimes.length - FREE_MODE_HISTORY);
}

/* ------------------------------------------------------------------ lap / finish */

function checkLapsAndFinish(e: RaceState, prevS: number): void {
  const prevLap = Math.floor(prevS / COURSE_LENGTH);
  const lap = Math.floor(e.s / COURSE_LENGTH);
  if (lap > prevLap && lap >= e.lap) {
    e.gravityCharges = Math.min(e.rules.charges, e.gravityCharges + 1);
    const lapTime = e.time - e.lapStart;
    e.lapTimes.push(lapTime);
    e.bestLap = Math.min(e.bestLap, lapTime);
    e.lapStart = e.time;
    e.lap = lap + 1;
    e.events.push({ type: "lap", text: lap === e.laps - 1 ? "Final orbit. Make it beautiful." : "One orbit closer." });
    if (e.mode === "free") pruneFreeModeHistory(e, lap);
  }
  e.place = e.mode === "trial" ? 1 : placeOf(e);
  if (e.mode !== "free" && e.s >= e.laps * COURSE_LENGTH) {
    e.s = e.laps * COURSE_LENGTH;
    e.lap = e.laps;
    e.phase = "finished";
    e.place = placeOf(e);
    e.boosting = false;
    const distance = e.laps * COURSE_LENGTH;
    const medal: RaceEnd["medal"] = e.mode === "trial"
      ? e.time < distance / 37 ? "gold" : e.time < distance / 31 ? "silver" : "bronze"
      : medalForPlace(e.place);
    const goals = [e.dust >= 25, e.draftTime >= 8, e.boostTime >= 10];
    e.score = Math.round(e.score + goals.filter(Boolean).length * 750 + (7 - e.place) * 400);
    e.end = { medal, goals, place: e.place, time: e.time, score: e.score };
    e.events.push({ type: "finish", text: "An orbit to remember." });
  }
}

/* ------------------------------------------------------------------ the step */

/** Advance the race by `dt` seconds (the original clamps to 0..0.05 and steps at 1/60). */
export function stepRace(e: RaceState, input: Input, dtIn: number): void {
  const dt = clamp(dtIn, 0, 0.05);
  e.events.length = 0;
  if (e.phase === "countdown") {
    const before = Math.ceil(e.countdown);
    e.countdown -= dt;
    if (Math.ceil(e.countdown) !== before) e.events.push({ type: "tick" });
    if (e.countdown <= 0) {
      e.phase = "racing";
      e.events.push({ type: "go", text: "Leave a little stardust." });
    }
    return;
  }
  if (e.phase !== "racing") return;

  const prevLane = e.lane;
  const rider = RIDERS[e.rider]!;
  const equipment = EQUIPMENT.find((q) => q.id === e.equipment) || EQUIPMENT[0]!;
  const prevS = e.s;
  const lapIndex = Math.floor(prevS / COURSE_LENGTH);
  e.time += dt;
  e.recordClock += dt;
  if (e.mode === "trial" && e.recordClock >= 0.2) {
    e.recordClock = 0;
    if (e.recording.length < 6000) {
      e.recording.push([
        +e.time.toFixed(3),
        +e.s.toFixed(2),
        +e.lane.toFixed(2),
        +(e.air?.height ?? (groundHeight(e.s, e.lane, e.route, e.vehicle) || 0) + (e.route === "main" ? rampHeightAt(e.s, e.lane, e.vehicle) : 0)).toFixed(2),
        e.flight || e.loop ? 1 : 0,
        ["main", "upper", "lower", "islands", "bypass"].indexOf(e.route)
      ]);
    }
  }
  e.surge = Math.max(0, e.surge - dt);
  e.hitCooldown = Math.max(0, e.hitCooldown - dt);
  e.comboTime = Math.max(0, e.comboTime - dt);
  if (!e.comboTime) e.combo = 0;
  e.jumpCooldown = Math.max(0, e.jumpCooldown - dt);

  const jumpPressed = !!input.jump && !e.jumpHeld;
  e.jumpHeld = !!input.jump;
  const gravityPressed = !!input.gravity && !e.gravityHeld;
  e.gravityHeld = !!input.gravity;
  e.gravityTime = Math.max(0, e.gravityTime - dt);
  if (gravityPressed && !e.loop) useGravity(e);

  if (e.loop) {
    stepLoop(e, input, dt, jumpPressed, gravityPressed);
    stepRivals(e, dt, false);
    e.place = placeOf(e);
    return;
  }
  if (e.flight) {
    stepRivals(e, dt, false);
    if (stepFlight(e, dt, input)) checkLapsAndFinish(e, prevS);
    e.place = placeOf(e);
    return;
  }

  if (!e.air && groundHeight(e.s, e.lane, e.route, e.vehicle) !== null) {
    e.groundedS = e.s;
    e.groundedRoute = e.route;
  }
  e.jumpBuffer = Math.max(0, (e.jumpBuffer || 0) - dt);
  if (jumpPressed) {
    if ((e.air && e.air.vy > 0) || (e.air?.platform && e.air.age <= JUMP.coyote)) jump(e);
    else e.jumpBuffer = JUMP.buffer;
  }
  if (e.jumpBuffer > 0 && !e.air && jump(e)) e.jumpBuffer = 0;

  e.drafting = !e.air && e.rivals.some((r) => (r.route || "main") === e.route && !r.air && r.s - e.s > 1.8 && r.s - e.s < 20 && Math.abs(r.lane - e.lane) < 2.1);
  e.boosting = !e.air && !!input.pedal && !!input.boost && e.energy > (e.boosting ? 0.4 : 8) && e.speed > 5;
  e.pushing = !!input.pedal;

  const pedal = Number(!!input.pedal);
  const brake = Number(!!input.brake);
  const target = pedal
    ? 34 + rider.speed + equipment.speed + (e.vehicle === "bike" ? 1.4 : -0.5)
      + (e.route === "upper" ? 9 : e.route === "lower" ? 6 : 0) * smoothstep01(Math.min(wrapS(e.s) - SPLIT.start, SPLIT.end - wrapS(e.s)) / 18)
      + (e.drafting ? (e.vehicle === "bike" ? 6.5 : 4) : 0)
      + (e.boosting ? 20 * rider.boost * equipment.boost : 0)
      + (e.surge > 0 && e.route !== "islands" ? 12 : 0)
    : 0;
  if (e.air) e.speed += (-e.speed * 0.06 - brake * 16) * dt;
  else if (pedal) e.speed += ((target - e.speed) * 0.55 - brake * 23) * dt;
  else e.speed = e.speed * Math.exp(-dt * (brake ? 8 : 3.8)) - (brake ? 10 : 1.2) * dt;
  e.speed = clamp(e.speed, 0, 61);
  if (e.boosting) {
    e.energy -= 20 * dt;
    e.boostTime += dt;
  } else {
    e.energy += dt * (e.drafting ? 9 : 1.1);
  }
  e.energy = clamp(e.energy, 0, 100);
  if (e.drafting) {
    e.draftTime += dt;
    e.score += dt * 8;
  }

  const drift = centrifugalDrift(e.s, 42, e.route);
  if (!e.air && Math.abs(drift) > 3.5 && e.speed > 38 && !e.boosting) e.speed -= Math.abs(drift) * dt * 0.08;

  const steer = clamp(input.steer || 0, -1, 1);
  const handling = rider.handling * equipment.handling * (e.vehicle === "skate" ? 1.08 : 1);
  e.steerRate = steer * (1.15 + Math.min(e.speed, 45) * 0.015) * Math.min(1, 35 / Math.max(1, e.speed)) * handling * clamp(e.speed / 10, 0, 1) * (e.air ? 0.7 : 1);
  e.heading = (e.heading || 0) + e.steerRate * dt;
  const frame = routeFrame(e.s, e.route);
  const heading = frame.tangent.clone().multiplyScalar(Math.cos(e.heading)).addScaledVector(frame.side, Math.sin(e.heading));
  e.lateral = Math.sin(e.heading) * e.speed;
  e.lane += e.lateral * dt;
  const leanTarget = clamp(e.steerRate * 0.18, -0.24, 0.24) * clamp(e.speed / 12, 0, 1);
  e.lean += (leanTarget - e.lean) * (1 - Math.exp(-dt * 9));

  const half = routeOffset(e.s, e.route).half;
  if (e.gravityTime > 0) {
    e.lane = clamp(e.lane, -half + 0.35, half - 0.35);
    if (Math.abs(e.lane) >= half - 0.35) e.lateral = 0;
  } else if (Math.abs(e.lane) > half - 0.45) {
    e.edgeTime += dt;
    e.edgeWarning = true;
    e.speed = Math.max(0, e.speed - 3 * dt);
    if (e.edgeTime > e.rules.edgeGrace || Math.abs(e.lane) > half + 1.5) {
      enterFlight(e);
      stepRivals(e, dt, false);
      return;
    }
  } else {
    e.edgeTime = 0;
    e.edgeWarning = false;
  }

  e.shortcut = e.route === "upper" || e.route === "lower";
  e.s += e.speed * dt * routeLengthScale(e.s, e.route) * Math.max(0, Math.cos(e.heading));
  if (e.shortcut) e.shortcutTime += dt;
  applyRouteTransitions(e, prevS);
  if (e.s !== prevS) {
    const next = routeFrame(e.s, e.route);
    e.heading = Math.atan2(heading.dot(next.side), heading.dot(next.tangent));
  }
  for (const section of [SPLIT, OPAL]) {
    const at = lapIndex * COURSE_LENGTH + section.start - 28;
    if (prevS < at && e.s >= at) {
      e.events.push({ type: "route", text: section === SPLIT ? "SPLIT AHEAD · left climbs / right dives" : "OPAL STEPS · left to jump / right to bypass" });
    }
  }
  if (e.route === "main" && tryEnterLoop(e, prevS)) {
    stepRivals(e, dt, false);
    return;
  }
  stepAir(e, prevS, dt, prevLane);
  if (e.jumpBuffer > 0 && !e.air && !e.flight && jump(e)) e.jumpBuffer = 0;
  if (e.flight) {
    stepRivals(e, dt, false);
    return;
  }
  stepRivals(e, dt, !e.air || e.air.height < 1.5);

  for (const c of collectibles(e.courseId)) {
    if (c.route !== e.route) continue;
    for (let lap = lapIndex; lap <= Math.floor(e.s / COURSE_LENGTH); lap++) {
      const at = c.s + lap * COURSE_LENGTH;
      const key = lap + ":" + c.id;
      const lane = c.kind === "meteor" ? meteorLane(c, e.time) : c.lane;
      if (e.air && e.air.height > 1.6 || at < prevS - 0.8 || at > e.s + 0.8 || e.collected.has(key) || Math.abs(lane - e.lane) > (c.kind === "dust" ? 1.8 : 1.35)) continue;
      e.collected.add(key);
      if (c.kind === "meteor") {
        if (e.hitCooldown <= 0) {
          e.hits++;
          e.speed *= e.difficulty === "explorer" ? 0.75 : 0.56;
          e.energy = Math.max(0, e.energy - 14);
          e.combo = 0;
          e.hitCooldown = 1.4;
          e.events.push({ type: "hit", text: "Moon rock! Find a clear line." });
        }
      } else {
        e.dust++;
        e.energy = clamp(e.energy + 7, 0, 100);
        e.combo++;
        e.comboTime = 3.6;
        const mult = 1 + Math.min(3, Math.floor(e.combo / 4));
        e.score += 60 * mult;
        e.events.push({ type: "dust", mult });
      }
    }
  }
  for (const crystal of RESONANCE_GATES) {
    if (e.route !== "main") continue;
    const at = lapIndex * COURSE_LENGTH + crystal.s;
    if (prevS < at && e.s >= at) {
      if ((!e.air || e.air.height < 2.7) && Math.abs(e.lane - crystal.lane) < 2.7) {
        e.resonance++;
        e.resonanceChain++;
        e.surge = 2.6;
        e.energy = clamp(e.energy + 12, 0, 100);
        const bonus = 200 + Math.min(e.resonanceChain, 5) * 100;
        e.score += bonus;
        e.events.push({ type: "resonance", text: `Crystal resonance ×${e.resonanceChain} · +${bonus} · free surge` });
      } else {
        e.resonanceChain = 0;
      }
    }
  }
  for (const c of collectibles(e.courseId)) {
    if (c.kind !== "meteor" || c.route !== e.route) continue;
    const at = lapIndex * COURSE_LENGTH + c.s;
    if (prevS < at && e.s >= at) {
      const gap = Math.abs(meteorLane(c, e.time) - e.lane);
      if (!e.air && gap > 1.5 && gap < 3.3 && e.hitCooldown <= 0) {
        e.nearMisses++;
        e.energy = clamp(e.energy + 5, 0, 100);
        e.score += 125;
        e.events.push({ type: "nearMiss", text: "Close orbit · +125 · +5 stardust" });
      }
    }
  }
  for (const gate of GATES) {
    const at = lapIndex * COURSE_LENGTH + gate.s;
    if (prevS < at && e.s >= at && !e.checkpointsCollected.has(at)) {
      if (e.route === "main" && Math.abs(e.lane) < 12 && (e.air?.height || 0) < 11) {
        e.checkpointsCollected.add(at);
        e.checkpoint++;
        e.gatesPassed++;
        e.energy = clamp(e.energy + 10, 0, 100);
        e.score += 150;
        e.events.push({ type: "gate", gate: gate.s, text: gate.name + " · +10 stardust" });
      } else {
        e.s = at - 5;
        enterFlight(e);
        e.events.push({ type: "missedGate", text: "Missed checkpoint · gravity sling back to the approach" });
        return;
      }
    }
  }
  checkLapsAndFinish(e, prevS);
}

export type { Ramp };

/* ------------------------------------------------------------------ deterministic drivers */

/** A scripted input: `input` applies for `from <= time < to` (seconds of race time). */
export interface InputSegment { from: number; to: number; input: Input }

export function scriptedInput(script: readonly InputSegment[], time: number): Input {
  const merged: Input = {};
  for (const segment of script) if (time >= segment.from && time < segment.to) Object.assign(merged, segment.input);
  return merged;
}

/**
 * A simple deterministic driver used by tests and the `?autopilot=1` hook: holds
 * the pedal, steers toward a target lane (right of centre ahead of the opal
 * split so the rider takes the bypass instead of the jump-only island route) and
 * boosts when the stardust meter allows.
 */
export function autopilot(e: RaceState): Input {
  const here = wrapS(e.s);
  let targetLane = 0;
  if (e.route === "main" && here > OPAL.start - 120 && here < OPAL.start + 30) targetLane = 5;
  else if (e.route === "bypass") targetLane = 0;
  const steer = clamp((targetLane - e.lane) * 0.6 - e.heading * 1.5, -1, 1);
  return { pedal: true, steer, boost: e.energy > 40 };
}

/**
 * Decode a run-length input script (`<steps>x[PBOJG-] s=<steer>` per line, one step =
 * 1/60 s, countdown steps included). P pedal, B brake, O boost, J jump, G gravity.
 */
export function decodeInputScript(text: string): Input[] {
  const inputs: Input[] = [];
  for (const line of text.trim().split("\n")) {
    const m = /^(\d+)x([PBOJG-]+) s=(-?[\d.]+)$/.exec(line.trim());
    if (!m) throw new Error(`unrecognised input script line: ${line}`);
    const flags = m[2]!;
    const input: Input = { pedal: flags.includes("P"), brake: flags.includes("B"), boost: flags.includes("O"), jump: flags.includes("J"), gravity: flags.includes("G"), steer: Number(m[3]) };
    for (let i = 0; i < Number(m[1]); i++) inputs.push(input);
  }
  return inputs;
}

/** Run `state` forward with fixed 1/60 steps until `until(state)` or `maxSteps`; returns steps taken. */
export function runFixed(state: RaceState, driver: (s: RaceState) => Input, until: (s: RaceState) => boolean, maxSteps: number): number {
  let steps = 0;
  while (steps < maxSteps && !until(state)) {
    stepRace(state, driver(state), STEP);
    steps++;
  }
  return steps;
}

export { Vec3 };
