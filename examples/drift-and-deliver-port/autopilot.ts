/**
 * Gridlock Courier autopilot (owner standard, Nov 18: `?autoplay=1` plays hands-free). A pure state -> Keys policy that drives
 * the same input path as a player: it routes along the street grid to the current drop-off (or the nearest coin when there is
 * no job), keeps to the street centre, slows and drifts through the turns, boosts on long straights and steers around the
 * traffic ahead. Reads only the sim state, so it never changes the sim or the recorded-reference parity.
 */
import { NO_KEYS, WORLD, type Keys } from "./sim";

/** Street centre lines (world.ts STREET_LINES): -450 .. 450 every 60 m, on both axes. */
const PITCH = WORLD.pitch;
const FIRST_LINE = -450;
const LAST_LINE = 450;

export interface AutoCar {
  x: number;
  z: number;
  heading: number;
  speed: number;
}
export interface AutoObstacle {
  x: number;
  z: number;
}
export interface AutoWorld {
  /** Current drop-off, or null between jobs. */
  job: { x: number; z: number } | null;
  pickups: readonly { x: number; z: number; taken: boolean }[];
  traffic: readonly AutoObstacle[];
}

export const nearestLine = (v: number): number => Math.max(FIRST_LINE, Math.min(LAST_LINE, Math.round((v - 30) / PITCH) * PITCH + 30));
const wrap = (a: number): number => Math.atan2(Math.sin(a), Math.cos(a));
/** Inside a street's paved width (with a margin) around centre line `line`. */
const onStreet = (v: number, line: number): boolean => Math.abs(v - line) < WORLD.streetHalf - 1;

/**
 * Which way to leave a mid-block position for the cross street: toward the target when it is clearly to one side, else
 * the way the car is already facing. (Full-run QA, Nov 18: with a drop-off level with the car, `sign(target - car)` flipped
 * every time the car crossed the target's coordinate and the autopilot circled one block for a whole ticket.)
 */
function crossDir(toTarget: number, facing: number): number {
  if (Math.abs(toTarget) > PITCH / 2) return Math.sign(toTarget);
  return facing >= 0 ? 1 : -1;
}

/**
 * Next point to drive at: a Manhattan route through one intersection. `target` sits on a street centre line (drop-offs and
 * coins do). Returns the waypoint and whether it is a turn (the car should slow for it).
 */
export function routeWaypoint(car: AutoCar, target: { x: number; z: number }): { x: number; z: number; turn: boolean } {
  const lx = nearestLine(car.x);
  const lz = nearestLine(car.z);
  const onV = onStreet(car.x, lx);
  const onH = onStreet(car.z, lz);
  const targetOnV = Math.abs(target.x - nearestLine(target.x)) < 1;
  const targetOnH = Math.abs(target.z - nearestLine(target.z)) < 1;
  // already on the target's street: straight at it
  if (targetOnV && onV && lx === target.x) return { x: target.x, z: target.z, turn: false };
  if (targetOnH && onH && lz === target.z) return { x: target.x, z: target.z, turn: false };
  if (targetOnV) {
    // reach the vertical street x = target.x along a horizontal street
    const row = onH ? lz : nearestLine(car.z + crossDir(target.z - car.z, Math.cos(car.heading)) * 20);
    if (Math.abs(car.z - row) > WORLD.streetHalf - 2) return { x: lx, z: row, turn: true };
    return { x: target.x, z: row, turn: true };
  }
  // reach the horizontal street z = target.z along a vertical street
  const col = onV ? lx : nearestLine(car.x + crossDir(target.x - car.x, Math.sin(car.heading)) * 20);
  if (Math.abs(car.x - col) > WORLD.streetHalf - 2) return { x: col, z: lz, turn: true };
  return { x: col, z: target.z, turn: true };
}

/** Where the autopilot heads: the drop-off, else the nearest coin still on the street. */
export function autopilotTarget(car: AutoCar, world: AutoWorld): { x: number; z: number } | null {
  if (world.job) return world.job;
  let best: { x: number; z: number } | null = null;
  let bestD = Infinity;
  for (const p of world.pickups) {
    if (p.taken) continue;
    const d = Math.abs(p.x - car.x) + Math.abs(p.z - car.z);
    if (d >= bestD) continue;
    bestD = d;
    // snap onto the nearer street centre line so the grid route can end on it
    best = Math.abs(p.x - nearestLine(p.x)) <= Math.abs(p.z - nearestLine(p.z)) ? { x: nearestLine(p.x), z: p.z } : { x: p.x, z: nearestLine(p.z) };
  }
  return best;
}

/** One step of the policy: the keys a decent player would hold now. */
export function autopilotKeys(car: AutoCar, world: AutoWorld): Keys {
  const keys: Keys = { ...NO_KEYS };
  const target = autopilotTarget(car, world);
  if (!target) return keys;
  const wp = routeWaypoint(car, target);
  const fx = Math.sin(car.heading);
  const fz = Math.cos(car.heading);
  let dx = wp.x - car.x;
  let dz = wp.z - car.z;
  const dist = Math.hypot(dx, dz);
  // keep to the street centre: on a straight leg aim 22 m ahead along the leg's centre line, not at its far end
  if (dist > 22) {
    const alongX = Math.abs(dx) > Math.abs(dz);
    const s = 22 / dist;
    if (alongX) { dx = dx * s; dz = wp.z - car.z; }
    else { dz = dz * s; dx = wp.x - car.x; }
  }
  // traffic ahead in the path: aim past it on the side with more room (cars keep right, so pass on their left)
  for (const t of world.traffic) {
    const rx = t.x - car.x;
    const rz = t.z - car.z;
    const ahead = rx * fx + rz * fz;
    if (ahead < 2 || ahead > 18) continue;
    const lateral = rx * fz - rz * fx; // + = obstacle on the car's left
    if (Math.abs(lateral) > 2.8) continue;
    const side = lateral > 0 ? -1 : 1; // swerve away
    // the lateral axis is (cos h, -sin h) = (fz, -fx): shift the aim point 3.6 m along it, away from the car
    dx += fz * side * 3.6;
    dz += -fx * side * 3.6;
    break;
  }
  const err = wrap(Math.atan2(dx, dz) - car.heading);
  if (err > 0.05) keys.a = true;
  else if (err < -0.05) keys.d = true;
  const speed = car.speed;
  // corner speed: slow for a turn waypoint that is near, crawl through a U-turn (the street is 17 m wide), drift sharp turns
  const wanted = Math.abs(err) > 1.2 ? 6 : wp.turn ? Math.max(15, Math.min(46, 13 + dist * 0.55)) : Math.max(12, Math.min(46, 8 + dist * 0.7));
  if (speed > wanted + 3) keys.s = true;
  else keys.w = true;
  if (Math.abs(err) > 0.45 && Math.abs(err) < 1.2 && speed > 16) keys.space = true;
  if (!wp.turn && dist > 90 && Math.abs(err) < 0.08 && speed > 20) keys.shift = true;
  else if (wp.turn && dist > 110 && Math.abs(err) < 0.08 && speed > 20) keys.shift = true;
  return keys;
}

/** Heading error (rad) from the car to its current aim, for the stateful wrapper. */
function headingError(car: AutoCar, world: AutoWorld): number {
  const target = autopilotTarget(car, world);
  if (!target) return 0;
  const wp = routeWaypoint(car, target);
  return wrap(Math.atan2(wp.x - car.x, wp.z - car.z) - car.heading);
}

/**
 * Stateful driver: `autopilotKeys` plus a K-turn when the nose is stuck against a wall or a car (it reverses with the
 * opposite lock for up to 1.1 s; the sim flips steering in reverse, so both legs turn the car toward its aim).
 */
const WATCH_S = 1.5;
const WATCH_M = 2;

export function createAutopilot(): { step(car: AutoCar, world: AutoWorld, dt: number): Keys; reset(): void } {
  let blocked = 0;
  let reverse = 0;
  // progress watchdog: wedged against a post the speed flickers above the stall threshold, so also check that the car
  // actually got somewhere over the last `WATCH_S` seconds while driving forward
  let watch = 0;
  let forced = 0;
  let anchor: { x: number; z: number } | null = null;
  return {
    reset() { blocked = 0; reverse = 0; watch = 0; forced = 0; anchor = null; },
    step(car, world, dt) {
      if (reverse > 0) {
        reverse -= dt;
        forced -= dt;
        const err = headingError(car, world);
        // a watchdog reverse backs off at least `forced` seconds even when the nose already points at the aim (it is
        // pinned against a post or a kerb corner right in front)
        if (Math.abs(err) < 0.35 && forced <= 0) reverse = 0;
        else return { ...NO_KEYS, s: true, a: err < 0, d: err > 0 };
      }
      const keys = autopilotKeys(car, world);
      blocked = keys.w && Math.abs(car.speed) < 1.5 ? blocked + dt : 0;
      if (blocked > 0.35) { blocked = 0; reverse = 1.1; }
      if (!anchor || !keys.w) { anchor = { x: car.x, z: car.z }; watch = 0; }
      else if ((watch += dt) >= WATCH_S) {
        if (Math.hypot(car.x - anchor.x, car.z - anchor.z) < WATCH_M) {
          reverse = 1.1;
          forced = 0.7;
        }
        anchor = { x: car.x, z: car.z };
        watch = 0;
      }
      return keys;
    }
  };
}
