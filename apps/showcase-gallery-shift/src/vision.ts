/**
 * Gallery Shift vision system (PRD GS-05): FOV cones, line-of-sight with
 * occlusion through the public physics `raycast` query, a distance- and
 * light-scaled detection meter, and authored camera sweeps.
 *
 * The LOS test is NOT authored math against wall lists: every guard/camera
 * sighting casts `world.raycast(origin, direction, { maxDistance, ignoreBodies })`
 * against the collision world (walls, cases, pedestals occlude; sensors never
 * block vision because raycasts skip sensor colliders unless opted in). The
 * pure helpers below (cone test, fill/drain rates, sweep yaw) are exported for
 * deterministic unit tests.
 */
import type { SimWorld } from "./floor";
import { GUARD_FOV_DEGREES, GUARD_RANGE, CAMERA_FOV_DEGREES, CAMERA_RANGE, type CameraSpec, type LightPoolSpec } from "./floor";

// ------------------------------------------------------------ cone geometry --
export const GUARD_HALF_FOV = (GUARD_FOV_DEGREES / 2) * (Math.PI / 180);
export const CAMERA_HALF_FOV = (CAMERA_FOV_DEGREES / 2) * (Math.PI / 180);

/** Facing convention shared by guards and cameras: yaw 0 faces +Z, +yaw turns toward +X. */
export function facing(yaw: number): { readonly x: number; readonly z: number } {
  return { x: Math.sin(yaw), z: Math.cos(yaw) };
}

export function yawBetween(fromX: number, fromZ: number, toX: number, toZ: number): number {
  return Math.atan2(toX - fromX, toZ - fromZ);
}

/** True when the target lies inside the watcher's FOV cone and range (2D XZ). */
export function insideCone(
  watcherX: number,
  watcherZ: number,
  watcherYaw: number,
  targetX: number,
  targetZ: number,
  halfFovRad: number,
  range: number
): boolean {
  const dx = targetX - watcherX;
  const dz = targetZ - watcherZ;
  const distance = Math.hypot(dx, dz);
  if (distance > range || distance < 1e-6) return distance <= range && distance >= 0;
  const angle = Math.abs(normalizeAngle(yawBetween(watcherX, watcherZ, targetX, targetZ) - watcherYaw));
  return angle <= halfFovRad + 1e-9;
}

/** Wrap an angle into [-pi, pi]. */
export function normalizeAngle(angle: number): number {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= 2 * Math.PI;
  while (wrapped < -Math.PI) wrapped += 2 * Math.PI;
  return wrapped;
}

// ------------------------------------------------------------- camera sweep --
/** Authored deterministic sweep: centerYaw + amplitude * sin(2 pi t / period + phase). */
export function cameraYawAt(camera: CameraSpec, tSeconds: number): number {
  return camera.centerYaw + camera.amplitudeRad * Math.sin((2 * Math.PI * tSeconds) / camera.periodSeconds + camera.phase);
}

/**
 * Sweep window test for unit pins: at t=0 camera-1 (phase 0, amplitude 50deg)
 * sits exactly at centerYaw, at period/4 at maximum sweep, and returns to
 * centerYaw at period/2. `cameraFacesPoint` composes sweep yaw + cone test.
 */
export function cameraFacesPoint(camera: CameraSpec, tSeconds: number, x: number, z: number): boolean {
  return insideCone(camera.x, camera.z, cameraYawAt(camera, tSeconds), x, z, CAMERA_HALF_FOV, CAMERA_RANGE);
}

// ------------------------------------------------------------------- LOS ------
export interface LosSample {
  readonly occluded: boolean;
  /** Distance of the blocking hit when occluded. */
  readonly hitDistance: number | null;
}

export interface RaycastFn {
  (origin: readonly [number, number, number], direction: readonly [number, number, number], options?: {
    readonly maxDistance?: number;
    readonly includeSensors?: boolean;
    readonly ignoreBodies?: readonly number[];
  }): { readonly distance: number } | undefined;
}

/**
 * Line-of-sight through the engine raycast facade. A solid hit strictly closer
 * than the target (with a small epsilon so the target's own collider edge or
 * float noise cannot self-report occlusion) means the wall/case blocks sight.
 */
export function lineOfSight(
  raycast: RaycastFn,
  fromX: number,
  fromY: number,
  fromZ: number,
  toX: number,
  toY: number,
  toZ: number,
  ignoreBodies: readonly number[] = []
): LosSample {
  const dx = toX - fromX;
  const dy = toY - fromY;
  const dz = toZ - fromZ;
  const distance = Math.hypot(dx, dy, dz);
  if (distance < 1e-6) return { occluded: false, hitDistance: null };
  const hit = raycast([fromX, fromY, fromZ], [dx / distance, dy / distance, dz / distance], {
    maxDistance: distance,
    includeSensors: false,
    ignoreBodies
  });
  if (hit && hit.distance < distance - 0.05) {
    return { occluded: true, hitDistance: hit.distance };
  }
  return { occluded: false, hitDistance: hit ? hit.distance : null };
}

/** Build the raycast function from the route's physics world (public surface). */
export function worldRaycast(world: SimWorld): RaycastFn {
  return (origin, direction, options) => world.raycast(origin, direction, options);
}

// -------------------------------------------------------- detection meter ----
export const SUSPICIOUS_THRESHOLD = 0.35;
export const ALERT_THRESHOLD = 0.7;
export const CAUGHT_THRESHOLD = 1;
/** Grace window (s) after losing sight before the meter starts draining. */
export const DETECTION_SUSTAIN_SECONDS = 0.6;
export const DETECTION_DRAIN_PER_SECOND = 0.28;
const BASE_GUARD_FILL_PER_SECOND = 0.42;
const BASE_CAMERA_FILL_PER_SECOND = 0.3;
/** Dark-floor floor light factor; bright pools scale toward 1.0. */
const LIGHT_FACTOR_DARK = 0.55;

/** Distance falloff: full close-range factor decaying to 0.08 at cone edge. */
export function distanceFactor(distance: number, range: number): number {
  return Math.max(0.08, Math.min(1, 1.15 - (0.95 * distance) / Math.max(1, range)));
}

/** Brightness at a point: the strongest overlapping light pool wins. */
export function brightnessAt(pools: readonly LightPoolSpec[], x: number, z: number): number {
  let brightest = 0;
  for (const pool of pools) {
    if (Math.hypot(x - pool.x, z - pool.z) <= pool.radius) {
      brightest = Math.max(brightest, pool.brightness);
    }
  }
  return brightest;
}

export function lightFactor(brightness: number): number {
  return LIGHT_FACTOR_DARK + (1 - LIGHT_FACTOR_DARK) * Math.max(0, Math.min(1, brightness));
}

/**
 * Guard fill rate (meter/second). Alert state fills 3x faster (PRD GS-05);
 * distance and light-pool brightness scale the fill.
 */
export function guardFillPerSecond(distance: number, brightness: number, alert: boolean): number {
  return BASE_GUARD_FILL_PER_SECOND * distanceFactor(distance, GUARD_RANGE) * lightFactor(brightness) * (alert ? 3 : 1);
}

/** Camera fill rate (meter/second): slower, no alert escalation from cameras. */
export function cameraFillPerSecond(distance: number, brightness: number): number {
  return BASE_CAMERA_FILL_PER_SECOND * distanceFactor(distance, CAMERA_RANGE) * lightFactor(brightness);
}

export interface DetectionMeterState {
  readonly value: number;
  readonly secondsSinceSeen: number;
}

/**
 * Deterministic meter advance: sum of observer fill rates while seen, a short
 * memory sustain, then linear drain. Pure — unit-pinned.
 */
export function advanceDetection(
  state: DetectionMeterState,
  fillPerSecond: number,
  dt: number
): DetectionMeterState {
  const value = Math.max(0, Math.min(1, state.value));
  if (fillPerSecond > 0) {
    return { value: Math.min(1, value + fillPerSecond * dt), secondsSinceSeen: 0 };
  }
  if (state.secondsSinceSeen < DETECTION_SUSTAIN_SECONDS) {
    return { value, secondsSinceSeen: state.secondsSinceSeen + dt };
  }
  return { value: Math.max(0, value - DETECTION_DRAIN_PER_SECOND * dt), secondsSinceSeen: state.secondsSinceSeen + dt };
}

// -------------------------------------------------------------- VisionSystem --
export type WatcherKind = "guard" | "camera";

export interface WatcherSample {
  readonly kind: WatcherKind;
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly yaw: number;
  readonly seesThief: boolean;
  readonly fillPerSecond: number;
  readonly occluded: boolean;
}

export interface VisionSample {
  readonly watchers: readonly WatcherSample[];
  readonly thiefSeen: boolean;
  readonly totalFillPerSecond: number;
  readonly losRayCount: number;
  readonly occlusionCount: number;
  /** True when at least one watcher had the thief in cone but occluded. */
  readonly anyOccludedCone: boolean;
}

export interface WatcherPose {
  readonly kind: WatcherKind;
  readonly id: string;
  readonly x: number;
  readonly z: number;
  readonly eyeY: number;
  readonly yaw: number;
  readonly halfFov: number;
  readonly range: number;
}

export interface VisionCounters {
  losRayCount: number;
  occlusionCount: number;
}

/**
 * Samples every watcher against the thief in cone range. Only watchers whose
 * cone contains the thief spend a raycast (the occlusion proof), and counters
 * accumulate for evidence. Floor-wide laser alert bursts scale guard fill like
 * the alert state (route wiring in main.ts passes alert=true during bursts).
 */
export function sampleVision(
  raycast: RaycastFn,
  watchers: readonly WatcherPose[],
  thiefX: number,
  thiefZ: number,
  thiefEyeY: number,
  brightness: number,
  ignoreBodies: readonly number[],
  counters: VisionCounters,
  alertBurst: boolean
): VisionSample {
  const samples: WatcherSample[] = [];
  let losRayCount = 0;
  let occlusionCount = 0;
  let anyOccludedCone = false;
  let thiefSeen = false;
  let totalFill = 0;
  for (const watcher of watchers) {
    const inCone = insideCone(watcher.x, watcher.z, watcher.yaw, thiefX, thiefZ, watcher.halfFov, watcher.range);
    if (!inCone) {
      samples.push({ kind: watcher.kind, id: watcher.id, x: watcher.x, z: watcher.z, yaw: watcher.yaw, seesThief: false, fillPerSecond: 0, occluded: false });
      continue;
    }
    losRayCount += 1;
    counters.losRayCount += 1;
    const los = lineOfSight(raycast, watcher.x, watcher.eyeY, watcher.z, thiefX, thiefEyeY, thiefZ, ignoreBodies);
    if (los.occluded) {
      occlusionCount += 1;
      counters.occlusionCount += 1;
      anyOccludedCone = true;
      samples.push({ kind: watcher.kind, id: watcher.id, x: watcher.x, z: watcher.z, yaw: watcher.yaw, seesThief: false, fillPerSecond: 0, occluded: true });
      continue;
    }
    thiefSeen = true;
    const distance = Math.hypot(thiefX - watcher.x, thiefZ - watcher.z);
    const fill = watcher.kind === "guard"
      ? guardFillPerSecond(distance, brightness, alertBurst)
      : cameraFillPerSecond(distance, brightness);
    totalFill += fill;
    samples.push({ kind: watcher.kind, id: watcher.id, x: watcher.x, z: watcher.z, yaw: watcher.yaw, seesThief: true, fillPerSecond: fill, occluded: false });
  }
  return { watchers: samples, thiefSeen, totalFillPerSecond: totalFill, losRayCount, occlusionCount, anyOccludedCone };
}
