/**
 * The closed-loop keyboard controller the reference capture used (tools/crayon-capture/silt-and-signal-lib.ts
 * `siltPolicy`), kept here so the port can fly itself (`?autopilot=1`). A unit test pins the two together.
 */
import { visitCollidersInZBand } from "./collide";
import { IDLE, objectiveOf, targetOf, type Input, type Sim } from "./sim";

export interface PolicyParams {
  steerDeadband: number;
  cruiseAltitude: number;
  liftBand: number;
  boost: boolean;
  brakeDistance: number;
  holdDistance: number;
}

export const DEFAULT_POLICY: PolicyParams = { steerDeadband: 0.06, cruiseAltitude: 9, liftBand: 1.5, boost: false, brakeDistance: 20, holdDistance: 22 };

export function autopilot(sim: Sim, p: PolicyParams = DEFAULT_POLICY): Input {
  const { state, flight } = sim;
  if (state.scene || state.completed) return { ...IDLE };
  const target = targetOf(state);
  const o = objectiveOf(state);
  const desired = Math.atan2(-(target.x - state.x), -(target.z - state.z));
  let err = desired - state.yaw;
  while (err > Math.PI) err -= 2 * Math.PI;
  while (err < -Math.PI) err += 2 * Math.PI;
  const steer = err > p.steerDeadband ? -1 : err < -p.steerDeadband ? 1 : 0;
  const goal = Math.max(target.y, p.cruiseAltitude);
  const lift = state.y < goal - p.liftBand ? 1 : state.y > goal + p.liftBand ? -1 : 0;
  const last = state.point === o.points.length - 1;
  const distance = Math.hypot(target.x - state.x, target.z - state.z);
  const hold = (o.kind === "care" || o.kind === "resonate" || o.kind === "relay" || o.kind === "tow" || o.kind === "portal") && last;
  const near = hold && distance < p.brakeDistance;
  const interact = hold && distance < p.holdDistance && Math.abs(flight.speed) < 4;
  return { throttle: near ? 0 : 1, steer, lift, brake: near, boost: p.boost && !near, interact };
}

/* ------------------------------------------------------------------ `?autoplay=1` (hands-free viewer mode) */

/** Heading rate (rad/s) at full steer for a speed, from the flight model (sim.ts flightStep). */
const turnRate = (speed: number): number => 0.65 / (1 + Math.abs(speed) * 0.008);

/**
 * The `?autoplay=1` pilot: the reference controller's targeting and hold logic, flown the way a decent player flies it.
 * Steering is proportional instead of bang-bang, and it slows for a turn it could not make at speed (the turn radius
 * v / turnRate(v) has to fit the arc to the next ring), so it threads the village corners instead of orbiting into the
 * houses; it boosts on long straight legs. Inputs only (the normal input path); the reference `autopilot` is unchanged.
 */
export function autoplayPilot(sim: Sim): Input {
  const { state, flight } = sim;
  const o = objectiveOf(state);
  // wake and stealth objectives only count below their ceiling: fly them low
  const ceiling = o.kind === "wake" || o.kind === "stealth" ? (o.maxY ?? 19) - 3 : Number.POSITIVE_INFINITY;
  const base = autopilot(sim, { ...DEFAULT_POLICY, cruiseAltitude: Math.min(10, ceiling) });
  if (o.kind === "wake" || o.kind === "stealth") base.lift = state.y > ceiling ? -1 : state.y < Math.min(ceiling, 4) ? 1 : 0;
  if (state.scene || state.completed || base.brake || base.interact) return base;
  const target = targetOf(state);
  const last = state.point === o.points.length - 1;
  if (o.kind === "care" || o.kind === "resonate" || o.kind === "relay") {
    // these hold at every point, not only the last: stop on it and hold interact
    const d = Math.hypot(target.x - state.x, target.z - state.z);
    if (d < 18) return { throttle: 0, steer: 0, lift: base.lift, brake: Math.abs(flight.speed) > 3, boost: false, interact: Math.abs(flight.speed) < 4 };
  }
  if (o.kind === "tow" && !state.towing) {
    // hook the shell: stop beside it and hold interact (the reference controller only stops at an objective's last point)
    const d = Math.hypot(target.x - state.x, target.z - state.z);
    if (d < 20) return { throttle: 0, steer: 0, lift: base.lift, brake: Math.abs(flight.speed) > 3, boost: false, interact: Math.abs(flight.speed) < 4 };
  }
  if (o.kind === "lift" && last) {
    // lift: stop on the point, then hold a gentle climb (lift > 0) inside the height band for the hold time
    const d = Math.hypot(target.x - state.x, target.z - state.z);
    if (d < o.radius * 0.6) {
      const dy = target.y - state.y;
      const lift = dy > 5 ? 1 : dy < -5 ? -1 : 0.05;
      return { throttle: 0, steer: 0, lift, brake: Math.abs(flight.speed) > 3, boost: false, interact: false };
    }
  }
  const toTarget = Math.atan2(-(target.x - state.x), -(target.z - state.z));
  const distance = Math.hypot(target.x - state.x, target.z - state.z);
  // fly around the piers, trees, rocks and lamps between here and the target instead of through them
  const avoid = avoidObstacles(sim, toTarget, distance);
  const desired = toTarget + avoid.offset;
  let err = desired - state.yaw;
  while (err > Math.PI) err -= 2 * Math.PI;
  while (err < -Math.PI) err += 2 * Math.PI;
  const steer = Math.max(-1, Math.min(1, -err * 2.2));
  // the arc that reaches the target from here has radius distance / (2 sin|err|); fly no faster than that radius allows
  const radius = Math.abs(err) < 1e-3 ? Number.POSITIVE_INFINITY : distance / (2 * Math.sin(Math.min(Math.PI / 2, Math.abs(err))));
  let speed = 42;
  // close to the target it may crawl (a 6 m turn circle at 4 m/s) so it never orbits a ring it overshot (a timed gate
  // that was shut as it flew through); further out 10 m/s is the floor
  const floor = distance < 45 ? 4 : 10;
  while (speed > floor && speed / turnRate(speed) > radius * 0.9) speed -= 2;
  // turning back towards a target behind: a slow, tight U-turn instead of an 85 m loop that flies away from it first
  if (Math.abs(err) > 1.4) speed = Math.min(speed, 12);
  // an obstacle close ahead on the current heading: slow so the turn away fits in the free distance
  speed = Math.min(speed, Math.max(3, avoid.ahead * 0.8));
  const boost = Math.abs(err) < 0.08 && distance > 140 && flight.energy > 0.5 && avoid.ahead >= AVOID_LOOKAHEAD;
  const throttle = boost ? 1 : speed / 42;
  const brake = flight.speed > speed + 10;
  return { throttle: brake ? 0 : throttle, steer, lift: base.lift, brake, boost: boost && !brake, interact: base.interact };
}

/** The rider's collision radius (sim.ts sweep) plus the berth the autoplay pilot keeps from an obstacle (metres). */
export const AVOID_CLEARANCE = 1.85 + 1.4;
/** Heading offsets (rad) the pilot tries, nearest the target bearing first. */
const AVOID_OFFSETS = [0, 0.12, -0.12, 0.25, -0.25, 0.4, -0.4, 0.6, -0.6, 0.85, -0.85];
/** How far ahead (metres) the pilot looks for obstacles. */
const AVOID_LOOKAHEAD = 70;

/**
 * Free distance along a heading before the rider's swept corridor (AVOID_CLEARANCE wide each side) meets a collider that
 * overlaps its flight height; `limit` when clear. Reads the sim world only.
 */
export function freeDistance(sim: Pick<Sim, "state" | "world">, yaw: number, limit: number): number {
  const { state, world } = sim;
  const colliders = world.colliders;
  if (!colliders) return limit;
  const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
  let free = limit;
  const z0 = Math.min(state.z, state.z + fz * limit) - 12, z1 = Math.max(state.z, state.z + fz * limit) + 12;
  visitCollidersInZBand(colliders, z0, z1, (c) => {
    if (state.y + 1.6 < c.bottom || state.y - 1.6 > c.top) return;
    const rx = c.x - state.x, rz = c.z - state.z;
    const along = rx * fx + rz * fz;
    const r = c.halfX !== undefined && c.halfZ !== undefined ? Math.hypot(c.halfX, c.halfZ) : c.r;
    if (along < -r || along - r > free) return;
    const lat = Math.abs(rx * -fz + rz * fx);
    const clear = r + AVOID_CLEARANCE;
    if (lat >= clear) return;
    free = Math.max(0, Math.min(free, along - Math.sqrt(clear * clear - lat * lat)));
  });
  return free;
}

/**
 * The autoplay pilot's obstacle avoidance: the smallest heading offset from the target bearing whose corridor is clear up
 * to the target (or AVOID_LOOKAHEAD), else the offset with the most free distance; `ahead` is the free distance on the
 * current heading (the pilot slows when it is short).
 */
export function avoidObstacles(sim: Pick<Sim, "state" | "world">, bearing: number, targetDistance: number): { offset: number; ahead: number } {
  const limit = Math.min(AVOID_LOOKAHEAD, targetDistance + 4);
  let best = 0, bestFree = -1;
  for (const offset of AVOID_OFFSETS) {
    const free = freeDistance(sim, bearing + offset, limit);
    if (free >= limit) { best = offset; bestFree = free; break; }
    if (free > bestFree + 1) { best = offset; bestFree = free; }
  }
  return { offset: best, ahead: freeDistance(sim, sim.state.yaw, AVOID_LOOKAHEAD) };
}

/** How long a scene card or the results card stays up in autoplay before it continues (ms). */
export const AUTOPLAY_CARD_MS = 3000;
/** Seconds without progress (no ring, objective or hold gained, no metre closed on the target) before autoplay restarts the objective. */
export const AUTOPLAY_STUCK_SECONDS = 5;

/** The page search for a chapter change: keeps the viewer in autoplay; past the last chapter it loops to chapter 1. */
export function autoplayChapterSearch(chapter: number, autoplay: boolean, chapters = 7): string {
  const next = ((Math.trunc(chapter) % chapters) + chapters) % chapters;
  return `?chapter=${next}&start=1${autoplay ? "&autoplay=1" : ""}`;
}

/**
 * Detects a wedged autoplay flight: true once the controller has made no progress for AUTOPLAY_STUCK_SECONDS. Progress is a
 * new ring / objective, hold time gained, the target distance closing by a metre, or the heading turning 0.15 rad closer to it. Reads the sim only (never writes it).
 */
export function createAutoplayWatchdog(stuckSeconds = AUTOPLAY_STUCK_SECONDS): { update(sim: Sim, dt: number): boolean; reset(): void } {
  let key = "";
  let best = Number.POSITIVE_INFINITY;
  let bestErr = Number.POSITIVE_INFINITY;
  let hold = 0;
  let idle = 0;
  const reset = (): void => { key = ""; best = Number.POSITIVE_INFINITY; bestErr = Number.POSITIVE_INFINITY; hold = 0; idle = 0; };
  return {
    reset,
    update(sim, dt) {
      const { state } = sim;
      if (state.scene || state.completed) { idle = 0; return false; }
      const target = targetOf(state);
      const distance = Math.hypot(target.x - state.x, target.z - state.z);
      // the heading error to the target: a U-turn (about 5 s at any speed) closes no distance but is progress
      let err = Math.atan2(-(target.x - state.x), -(target.z - state.z)) - state.yaw;
      err = Math.abs(Math.atan2(Math.sin(err), Math.cos(err)));
      const k = `${state.chapter}:${state.objective}:${state.point}`;
      if (k !== key) { key = k; best = distance; bestErr = err; hold = state.hold; idle = 0; return false; }
      if (distance < best - 1 || state.hold > hold + 1e-6 || err < bestErr - 0.15) {
        best = Math.min(best, distance); bestErr = Math.min(bestErr, err); hold = Math.max(hold, state.hold); idle = 0; return false;
      }
      idle += dt;
      if (idle < stuckSeconds) return false;
      reset();
      return true;
    }
  };
}
