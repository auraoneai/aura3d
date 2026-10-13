// Neon Corridor Strike — pure run rules (no DOM, no engine imports).
// This module is the headless fire-kill-win sim the salvage review found
// missing: look/move/fire/reload/win/reset are decided here against
// analytic target spheres, and src/main.ts only renders the result.

export type Vec3 = readonly [number, number, number];
export type RunStatus = "playing" | "won";

export interface TargetDef {
  readonly id: string;
  readonly center: Vec3;
  readonly radius: number;
  readonly maxHp: number;
}

export interface TargetState {
  readonly id: string;
  readonly center: Vec3;
  readonly radius: number;
  hp: number;
  alive: boolean;
}

export interface RunState {
  status: RunStatus;
  /** Player feet position on the corridor floor plane. */
  x: number;
  z: number;
  yaw: number;
  pitch: number;
  ammo: number;
  reloading: boolean;
  reloadClock: number;
  fireCooldown: number;
  shotsFired: number;
  hits: number;
  kills: number;
  score: number;
  resets: number;
  frame: number;
  targets: TargetState[];
}

export interface FireResult {
  readonly fired: boolean;
  readonly reason?: "cooldown" | "reloading" | "won" | "empty";
  readonly hitTargetId?: string;
  readonly killedTargetId?: string;
  readonly hitPoint?: Vec3;
  readonly won: boolean;
}

export const LOOK_SENS = 0.0024;
export const PITCH_LIMIT = 1.35;
export const EYE_HEIGHT = 1.6;
export const MAG_SIZE = 12;
export const RELOAD_SECONDS = 0.9;
export const FIRE_COOLDOWN_SECONDS = 0.18;
export const WALK_SPEED = 4.2;
export const SPRINT_SPEED = 6.5;
export const PLAYER_START = { x: 0, z: 9 } as const;
/** Walkable corridor interior (walls sit just outside these bounds). */
export const CORRIDOR = { minX: -2.2, maxX: 2.2, minZ: -14, maxZ: 10 } as const;

// Five hovering sentry drones down a straight neon corridor. The first sits
// dead ahead of spawn so the opening shot is a fair, learnable hit.
export const TARGETS: readonly TargetDef[] = [
  { id: "sentry-0", center: [0, 1.5, 2], radius: 0.55, maxHp: 2 },
  { id: "sentry-1", center: [-1.4, 1.4, -2], radius: 0.55, maxHp: 2 },
  { id: "sentry-2", center: [1.4, 1.7, -5], radius: 0.55, maxHp: 2 },
  { id: "sentry-3", center: [-1.2, 1.3, -8.5], radius: 0.55, maxHp: 2 },
  { id: "sentry-4", center: [0.8, 1.6, -12], radius: 0.55, maxHp: 2 }
];

export function createRun(): RunState {
  return {
    status: "playing",
    x: PLAYER_START.x,
    z: PLAYER_START.z,
    yaw: 0,
    pitch: 0,
    ammo: MAG_SIZE,
    reloading: false,
    reloadClock: 0,
    fireCooldown: 0,
    shotsFired: 0,
    hits: 0,
    kills: 0,
    score: 0,
    resets: 0,
    frame: 0,
    targets: TARGETS.map((def) => ({ id: def.id, center: def.center, radius: def.radius, hp: def.maxHp, alive: true }))
  };
}

/** Restore the baseline run in place; `resets` keeps counting across resets. */
export function resetRun(run: RunState): RunState {
  const fresh = createRun();
  run.status = fresh.status;
  run.x = fresh.x;
  run.z = fresh.z;
  run.yaw = fresh.yaw;
  run.pitch = fresh.pitch;
  run.ammo = fresh.ammo;
  run.reloading = fresh.reloading;
  run.reloadClock = fresh.reloadClock;
  run.fireCooldown = fresh.fireCooldown;
  run.shotsFired = fresh.shotsFired;
  run.hits = fresh.hits;
  run.kills = fresh.kills;
  run.score = fresh.score;
  run.targets = fresh.targets;
  run.resets += 1;
  return run;
}

/** E5 raw-pointer look: pixels this frame at LOOK_SENS rad/px. */
export function applyLook(run: RunState, dx: number, dy: number): void {
  run.yaw -= dx * LOOK_SENS;
  run.pitch = clamp(run.pitch - dy * LOOK_SENS, -PITCH_LIMIT, PITCH_LIMIT);
}

export function lookDirection(yaw: number, pitch: number): Vec3 {
  const cp = Math.cos(pitch);
  return [-Math.sin(yaw) * cp, Math.sin(pitch), -Math.cos(yaw) * cp];
}

export function eyePosition(run: RunState): Vec3 {
  return [run.x, EYE_HEIGHT, run.z];
}

/** Yaw-relative WASD locomotion, clamped to the corridor interior. */
export function applyMove(
  run: RunState,
  input: { readonly forward: number; readonly strafe: number; readonly sprint: boolean },
  dt: number
): void {
  if (run.status !== "playing" || dt <= 0) return;
  const len = Math.hypot(input.forward, input.strafe);
  if (len === 0) return;
  const speed = (input.sprint ? SPRINT_SPEED : WALK_SPEED) * dt;
  const f = input.forward / Math.max(1, len);
  const s = input.strafe / Math.max(1, len);
  // Forward on the floor plane is (-sin yaw, -cos yaw); right is (cos yaw, -sin yaw).
  run.x = clamp(run.x + (-Math.sin(run.yaw) * f + Math.cos(run.yaw) * s) * speed, CORRIDOR.minX, CORRIDOR.maxX);
  run.z = clamp(run.z + (-Math.cos(run.yaw) * f - Math.sin(run.yaw) * s) * speed, CORRIDOR.minZ, CORRIDOR.maxZ);
}

/** Advance cooldown/reload clocks. An empty magazine auto-reloads. */
export function tickRun(run: RunState, dt: number): void {
  run.frame += 1;
  if (run.fireCooldown > 0) run.fireCooldown = Math.max(0, run.fireCooldown - dt);
  if (run.reloading) {
    run.reloadClock -= dt;
    if (run.reloadClock <= 0) {
      run.reloading = false;
      run.reloadClock = 0;
      run.ammo = MAG_SIZE;
    }
  }
}

/**
 * Hitscan from the eye along the look direction against alive target
 * spheres (nearest hit wins). The corridor is straight and every target
 * hangs in the open lane, so no wall-occlusion test is needed.
 */
export function tryFire(run: RunState): FireResult {
  if (run.status === "won") return { fired: false, reason: "won", won: true };
  if (run.reloading) return { fired: false, reason: "reloading", won: false };
  if (run.fireCooldown > 0) return { fired: false, reason: "cooldown", won: false };
  if (run.ammo <= 0) {
    run.reloading = true;
    run.reloadClock = RELOAD_SECONDS;
    return { fired: false, reason: "empty", won: false };
  }

  run.ammo -= 1;
  run.shotsFired += 1;
  run.fireCooldown = FIRE_COOLDOWN_SECONDS;
  if (run.ammo === 0) {
    run.reloading = true;
    run.reloadClock = RELOAD_SECONDS;
  }

  const origin = eyePosition(run);
  const dir = lookDirection(run.yaw, run.pitch);
  let best: { target: TargetState; t: number } | undefined;
  for (const target of run.targets) {
    if (!target.alive) continue;
    const t = raySphere(origin, dir, target.center, target.radius);
    if (t !== undefined && (best === undefined || t < best.t)) best = { target, t };
  }
  if (!best) return { fired: true, won: false };

  const { target, t } = best;
  target.hp -= 1;
  run.hits += 1;
  run.score += 25;
  const hitPoint: Vec3 = [origin[0] + dir[0] * t, origin[1] + dir[1] * t, origin[2] + dir[2] * t];
  if (target.hp > 0) return { fired: true, hitTargetId: target.id, hitPoint, won: false };

  target.alive = false;
  run.kills += 1;
  run.score += 100;
  const won = run.targets.every((candidate) => !candidate.alive);
  if (won) run.status = "won";
  return { fired: true, hitTargetId: target.id, killedTargetId: target.id, hitPoint, won };
}

/** Smallest positive ray parameter entering the sphere, if any. */
export function raySphere(origin: Vec3, dir: Vec3, center: Vec3, radius: number): number | undefined {
  const ox = center[0] - origin[0];
  const oy = center[1] - origin[1];
  const oz = center[2] - origin[2];
  const tca = ox * dir[0] + oy * dir[1] + oz * dir[2];
  const d2 = ox * ox + oy * oy + oz * oz - tca * tca;
  const r2 = radius * radius;
  if (d2 > r2) return undefined;
  const thc = Math.sqrt(r2 - d2);
  const t0 = tca - thc;
  if (t0 > 0) return t0;
  const t1 = tca + thc;
  return t1 > 0 ? t1 : undefined;
}

export function targetsAlive(run: RunState): number {
  return run.targets.filter((target) => target.alive).length;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
