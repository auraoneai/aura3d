import type { AuraBodyHandle, AuraPhysicsRuntime, GameEffectsController, GameInputController } from "@aura3d/engine";
import { ENEMIES } from "./enemies";
import { fireBus } from "./fire-bus";
import { MAG_SIZE, lookDirection, type FpsRunState } from "./state";
import { playerEye } from "./player";

const ENEMY_IDS = ENEMIES.map((enemy) => `enemy-${enemy.id}`);

const RANGE = 28;
const DAMAGE = 34;
const FIRE_COOLDOWN = 0.16;

export interface ShotTrace {
  readonly origin: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
  readonly yaw: number;
  readonly pitch: number;
  readonly end: readonly [number, number, number];
}

export function createWeaponClock(): { cooldown: number } {
  return { cooldown: 0 };
}

export function updateWeapon(
  state: FpsRunState,
  input: GameInputController,
  physics: AuraPhysicsRuntime,
  playerBody: AuraBodyHandle,
  effects: GameEffectsController,
  clock: { cooldown: number },
  dt: number,
  onHit: (enemyId: string, point: readonly [number, number, number]) => void,
  onShot: (shot: ShotTrace) => void
): void {
  clock.cooldown = Math.max(0, clock.cooldown - dt);
  const bus = fireBus();
  const wantFire = bus.queued || bus.held || input.pressed("fire") || input.held("fire");
  bus.queued = false;
  if (wantFire && clock.cooldown <= 0) {
    state.paused = false;
    const shot = fireHitscan(state, physics, playerBody, effects, onHit);
    if (shot) onShot(shot);
    clock.cooldown = FIRE_COOLDOWN;
  }
  if ((input.pressed("reload") || input.held("reload")) && state.status === "playing") {
    reload(state);
  }
}

export function fireHitscan(
  state: FpsRunState,
  physics: AuraPhysicsRuntime,
  playerBody: AuraBodyHandle,
  effects: GameEffectsController,
  onHit: (enemyId: string, point: readonly [number, number, number]) => void
): ShotTrace | null {
  if (state.ammo <= 0) {
    state.objective = "Empty mag. Press R to reload";
    return null;
  }
  state.ammo -= 1;
  state.shotsFired += 1;
  const origin = playerEye(playerBody);
  const direction = lookDirection(state.yaw, state.pitch);
  const hit = physics.queries.raycast(origin, direction, {
    maxDistance: RANGE,
    layers: ["enemy", "wall"],
    ignore: [playerBody.id]
  });
  const end: readonly [number, number, number] = hit
    ? hit.point
    : [
      origin[0] + direction[0] * RANGE,
      origin[1] + direction[1] * RANGE,
      origin[2] + direction[2] * RANGE
    ];
  if (!hit) {
    state.lastHitName = "";
    return { origin, direction, yaw: state.yaw, pitch: state.pitch, end };
  }
  const point = hit.point;
  const named = hit.nodeName ?? hit.body.nodeName ?? "";
  const matchedEnemy = ENEMY_IDS.find((id) => physics.bodies.get(id)?.id === hit.body.id) ?? (named.startsWith("enemy-") ? named : "");
  const name = matchedEnemy || named;
  state.lastHitName = name;
  if (name.startsWith("enemy-")) {
    state.hits += 1;
    effects.hitSpark(point, { ownerId: name, intensity: 1.1 });
    onHit(name, point);
  } else {
    effects.impactDecal(point, { ownerId: "wall", intensity: 0.55 });
  }
  return { origin, direction, yaw: state.yaw, pitch: state.pitch, end };
}

export function reload(state: FpsRunState): void {
  if (state.ammo >= MAG_SIZE || state.reserve <= 0) return;
  const need = MAG_SIZE - state.ammo;
  const take = Math.min(need, state.reserve);
  state.ammo += take;
  state.reserve -= take;
  state.reloads += 1;
  state.objective = "Magazine seated. Hunt the corridor";
}
