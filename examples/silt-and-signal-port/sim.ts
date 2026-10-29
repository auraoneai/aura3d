/**
 * Silt & Signal on Aura3D: the pure simulation.
 *
 * A port of the original's gameplay core from the captured bundle (see
 * tests/fixtures/crayon/silt-and-signal/logic-extract.js: `Eo`, `e0`, `Mx`, `$T`, `zn`, `zi`, `_o`):
 * the hover-bike flight model (throttle / steer / lift / boost / brake, energy, bank, vertical
 * speed) and the objective state machine (reach each point inside its radius, hold for
 * care / resonate / relay / lift / tow / portal, timed gates, stealth ceilings, wake speeds).
 * No rendering, no DOM, no randomness: `stepSim` is a fixed-timestep function of (state, input).
 *
 * Chapter 0 runs in the original's physical world (`world-ch0.ts`: terrain floor, platforms, ramps and the 1400 measured
 * colliders, resolved by `collide.ts`). Chapters 1-6 use the rendered terrain as the floor and a collider for every scattered
 * prop (`terrainPhysics` in terrain.ts). Not ported (documented in PORTING-NOTES.md): creature / exploration ticks (so no
 * field notes or the perks they unlock), the chapter-1 spillway recovery, scenes and voice.
 */
import { CHAPTERS, type Objective, type Point } from "./chapters-data";
import { sweep, type Collider } from "./collide";
import { chapterWorld } from "./world-ch0";
import { terrainPhysics } from "./terrain";

export const STEP = 1 / 60;

export interface Input {
  throttle: number;
  steer: number;
  lift: number;
  brake: boolean;
  boost: boolean;
  interact: boolean;
}

export const IDLE: Input = { throttle: 0, steer: 0, lift: 0, brake: false, boost: false, interact: false };

/** The original's `Z` (play state), reduced to what the simulation reads and writes. */
export interface PlayState {
  chapter: number;
  objective: number;
  point: number;
  hold: number;
  x: number;
  y: number;
  z: number;
  yaw: number;
  restored: string[];
  towing: boolean;
  completed: boolean;
  scene: string | null;
  line: number;
  elapsed: number;
  pendingChapter: number | null;
}

/** The original's `rn` (flight state), from `Eo()`. */
export interface FlightState {
  speed: number;
  turn: number;
  bank: number;
  vertical: number;
  energy: number;
  boosting: boolean;
  boostLocked: boolean;
  boostMode: "Cruise" | "Turbo";
  thrust: number;
  liftInput: number;
  impacts: number;
  collisionCooldown: number;
}

export interface World {
  /** terrain / structure height under (x, z); the rider may not go below `floor + 2.4` */
  floor(x: number, z: number, y: number): number;
  /** hard ceiling (the original uses `r.ceiling || 205`) */
  ceiling: number;
  /** round and box colliders the rider is pushed out of */
  colliders?: readonly Collider[];
  /** chapter length: z is clamped to [-length - 50, 150] */
  length: number;
}

export interface Sim {
  state: PlayState;
  flight: FlightState;
  world: World;
  /** global game clock (`qn` in the original): drives timed gates */
  time: number;
  /**
   * Optional frame clock in ms. The original derives dt from consecutive requestAnimationFrame timestamps,
   * `min(0.05, (t2 - t1) / 1000)`; with a clock the port does the same arithmetic, so float rounding in long
   * holds (150 accumulated steps for a 2.5 s hold) lands on the same step as the original.
   */
  clockMs?: number;
  /** number of steps taken */
  steps: number;
  /** events produced by the most recent step */
  events: SimEvent[];
}

export type SimEvent = { type: "point" } | { type: "attach" } | { type: "complete"; objective: string } | { type: "impact"; speed: number };

export const createFlight = (): FlightState => ({
  speed: 0,
  turn: 0,
  bank: 0,
  vertical: 0,
  energy: 1,
  boosting: false,
  boostLocked: false,
  boostMode: "Cruise",
  thrust: 0,
  liftInput: 0,
  impacts: 0,
  collisionCooldown: 0
});

const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));

export const objectiveOf = (state: Pick<PlayState, "chapter" | "objective">): Objective =>
  (CHAPTERS[state.chapter] as (typeof CHAPTERS)[number]).objectives[state.objective] as Objective;

export const targetOf = (state: Pick<PlayState, "chapter" | "objective" | "point">): Point =>
  objectiveOf(state).points[state.point] as Point;

/** Timed gates are open while `time % period < open` (original `_o`). */
export const gateOpen = (time: number, objective: Objective): boolean => time % (objective.period || 11) < (objective.open || 7);

/**
 * What `silt.qa.chapter(chapter, objective)` does to the state: the rider starts 40 m behind the
 * objective's first point at its altitude, with the earlier objectives of the chapter restored.
 */
export function createSim(chapter: number, objective: number, world?: Partial<World>, start?: Partial<Pick<PlayState, "x" | "y" | "z" | "yaw">> & { clockMs?: number; time?: number }): Sim {
  const ch = CHAPTERS[chapter] as (typeof CHAPTERS)[number];
  const state: PlayState = {
    chapter,
    objective,
    point: 0,
    hold: 0,
    x: 0,
    y: 0,
    z: 0,
    yaw: 0,
    restored: ch.objectives.slice(0, objective).map((o) => o.id),
    towing: false,
    completed: false,
    scene: null,
    line: 0,
    elapsed: 0,
    pendingChapter: null
  };
  const t = targetOf(state);
  state.x = start?.x ?? t.x;
  state.y = start?.y ?? t.y;
  state.z = start?.z ?? t.z + 40;
  state.yaw = start?.yaw ?? 0;
  return {
    state,
    flight: createFlight(),
    world: { floor: () => 0.6, ceiling: 205, length: ch.length, ...(chapter === 0 ? chapterWorld(0) : terrainPhysics(chapter)), ...world },
    time: start?.time ?? 0,
    ...(start?.clockMs !== undefined ? { clockMs: start.clockMs } : {}),
    steps: 0,
    events: []
  };
}

/** The flight model: original `e0`. Returns true when a collision impact was registered. */
export function flightStep(state: PlayState, flight: FlightState, input: Input, dtIn: number, world: World): boolean {
  const n = Math.min(dtIn, 0.05);
  const s = clamp(input.throttle || 0, -1, 1);
  const o = clamp(input.steer || 0, -1, 1);
  const a = input.lift || 0;
  if (!input.boost && flight.energy >= 0.18) flight.boostLocked = false;
  const wantsBoost = !!input.boost && !input.brake && s > 0;
  const hasEnergy = flight.energy > (flight.boosting ? 0.025 : 0.18);
  if (wantsBoost && !hasEnergy) flight.boostLocked = true;
  flight.boosting = wantsBoost && !flight.boostLocked && hasEnergy;
  flight.energy = clamp(flight.energy + n * (flight.boosting ? -0.14 : 0.09), 0, 1);
  const top = flight.boosting ? 76 : 42;
  const target = input.brake ? 0 : s > 0 ? top * s : 13 * s;
  if (input.brake) flight.speed *= Math.exp(-n * 6);
  flight.speed += (target - flight.speed) * (1 - Math.exp(-n * (s ? 1 : 1.9)));
  flight.turn += (o - flight.turn) * (1 - Math.exp(-n * 5));
  const f = 0.65 / (1 + Math.abs(flight.speed) * 0.008);
  state.yaw -= flight.turn * f * n * (flight.speed < -0.5 ? -1 : 1);
  flight.bank += (-flight.turn * Math.min(0.68, 0.2 + Math.abs(flight.speed) * 0.014) - flight.bank) * (1 - Math.exp(-n * 5));
  flight.vertical += (a * 22 - flight.vertical) * (1 - Math.exp(-n * 3.4));
  const previousX = state.x, previousZ = state.z;
  state.x -= Math.sin(state.yaw) * flight.speed * n;
  state.z -= Math.cos(state.yaw) * flight.speed * n;
  // the world-edge clamp comes before the floor test, so the floor is read where the rider ends up (the original clamps after)
  state.x = clamp(state.x, -640, 640);
  state.z = clamp(state.z, -world.length - 50, 150);
  state.y = clamp(state.y + flight.vertical * n, world.floor(state.x, state.z, state.y) + 2.4, world.ceiling || 205);
  flight.collisionCooldown = Math.max(0, flight.collisionCooldown - n);
  let impact = false;
  if (world.colliders && sweep(state, { x: previousX, z: previousZ }, world.colliders, { radius: 1.85, halfHeight: 1, offsets: [-2.2, 0, 2.7, 5.4], yaw: state.yaw }) > 0) {
    // a push can move the rider onto higher ground (a hillside in chapters 1-6): keep it above the floor there too
    state.y = Math.max(state.y, world.floor(state.x, state.z, state.y) + 2.4);
    if (flight.collisionCooldown === 0 && Math.abs(flight.speed) > 4) {
      impact = true;
      flight.impacts++;
      flight.collisionCooldown = 0.7;
    }
    flight.speed *= 0.82;
  }
  flight.thrust = Math.abs(s);
  flight.liftInput = a;
  flight.boostMode = flight.boosting ? "Turbo" : "Cruise";
  return impact;
}

/** Marks the current objective restored and advances (original `$T`). */
function completeObjective(state: PlayState): Objective {
  const o = objectiveOf(state);
  state.restored = [...new Set([...state.restored, o.id])];
  state.hold = 0;
  state.point = 0;
  state.towing = false;
  if (o.scene) {
    state.scene = o.scene;
    state.line = 0;
  }
  const ch = CHAPTERS[state.chapter] as (typeof CHAPTERS)[number];
  if (o.kind === "portal") state.pendingChapter = state.chapter + 1;
  else if (o.kind === "finish") {
    state.completed = true;
    state.scene = null;
  } else state.objective = Math.min(state.objective + 1, ch.objectives.length - 1);
  return o;
}

/** Objective progression: original `Mx`. */
export function progressStep(state: PlayState, flight: FlightState, dt: number, input: Input, time: number, neriDistance = 0): SimEvent | null {
  if (state.scene || state.completed) return null;
  const o = objectiveOf(state);
  const a = targetOf(state);
  const inside = Math.hypot(state.x - a.x, state.z - a.z) < o.radius && Math.abs(state.y - a.y) < (o.kind === "climb" || state.chapter === 4 ? 19 : 11);
  const last = state.point === o.points.length - 1;
  let ok = inside;
  if (o.kind === "timed") ok &&= gateOpen(time, o);
  if (o.kind === "stealth") ok &&= state.y < (o.maxY || 19);
  if (o.kind === "wake") ok &&= Math.abs(flight.speed) > (o.minSpeed ?? 0) && state.y < (o.maxY ?? Infinity);
  if (o.kind === "pollen") ok &&= flight.speed > 5;
  if (o.kind === "herd") ok &&= neriDistance < 42;
  if (o.kind === "care" || o.kind === "resonate" || o.kind === "relay") ok &&= Math.abs(flight.speed) < 5 && input.interact;
  if (o.kind === "lift") ok &&= Math.abs(flight.speed) < 6 && input.lift > 0;
  if (o.kind === "tow" && !state.towing) ok &&= Math.abs(flight.speed) < 5 && input.interact;
  if (o.kind === "portal" && last) ok &&= Math.abs(flight.speed) < 12 && input.interact;
  const needsHold = o.kind === "care" || o.kind === "resonate" || o.kind === "relay" || o.kind === "lift" || (o.kind === "tow" && !state.towing) || (o.kind === "portal" && last);
  if (!ok) {
    state.hold = 0;
    return null;
  }
  if (needsHold) {
    state.hold += dt;
    if (state.hold < (o.hold || 1.2)) return null;
  }
  if (o.kind === "tow" && !state.towing) {
    state.towing = true;
    state.point = 1;
    state.hold = 0;
    return { type: "attach" };
  }
  if (last) return { type: "complete", objective: completeObjective(state).id };
  state.point++;
  state.hold = 0;
  return { type: "point" };
}

/** One fixed step of play, in the original's frame order (`qv`): elapsed, flight, then progression. */
export function stepSim(sim: Sim, input: Input, dt: number = STEP): SimEvent[] {
  const { state, flight, world } = sim;
  sim.events = [];
  let step = dt;
  if (sim.clockMs !== undefined) {
    const previous = sim.clockMs;
    sim.clockMs = previous + dt * 1000;
    step = (sim.clockMs - previous) / 1000;
  }
  const t = Math.max(0, Math.min(0.05, step));
  sim.time += t;
  sim.steps++;
  if (state.scene || state.completed) {
    flight.speed *= state.scene ? Math.exp(-t * 3) : 1;
    return sim.events;
  }
  state.elapsed += t;
  const o = objectiveOf(state);
  const tgt = targetOf(state);
  const lifting = o.kind === "lift" && Math.hypot(state.x - tgt.x, state.z - tgt.z) < o.radius && Math.abs(flight.speed) < 6 && input.lift > 0;
  const speedBefore = Math.abs(flight.speed);
  if (flightStep(state, flight, lifting ? { ...input, lift: 0 } : input, t, world)) sim.events.push({ type: "impact", speed: speedBefore });
  if (lifting) flight.liftInput = 1;
  const ev = progressStep(state, flight, t, input, sim.time);
  if (ev) sim.events.push(ev);
  return sim.events;
}
