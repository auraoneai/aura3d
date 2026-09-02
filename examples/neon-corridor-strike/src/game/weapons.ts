import type { AuraBodyHandle, AuraPhysicsRuntime, GameEffectsController, GameInputController } from "@aura3d/engine";
import { ENEMIES } from "./enemies";
import { fireBus } from "./fire-bus";
import { MAG_SIZE, lookDirection, type FpsRunState } from "./state";
import { playerEye } from "./player";

const ENEMY_IDS = ENEMIES.map((enemy) => "enemy-" + enemy.id);

const RANGE = 28;
const DAMAGE = 34;
const FIRE_COOLDOWN = 0.16;
/** Authored reload window: fire is blocked until the mag is seated. */
export const RELOAD_TIME = 0.9;

export interface ShotTrace {
  readonly origin: readonly [number, number, number];
  readonly direction: readonly [number, number, number];
  readonly yaw: number;
  readonly pitch: number;
  readonly end: readonly [number, number, number];
}

export interface WeaponClock {
  cooldown: number;
  /** Viewmodel recoil energy, drained each frame. */
  recoil: number;
}

export interface WeaponEvents {
  readonly onReloadStart?: () => void;
  readonly onReloadComplete?: () => void;
  readonly onDryFire?: () => void;
  /** NC-A1: fired after ANY confirmed impact (enemy or wall), with the hit point. */
  readonly onImpactPoint?: (point: readonly [number, number, number]) => void;
}

export function createWeaponClock(): WeaponClock {
  return { cooldown: 0, recoil: 0 };
}

export function updateWeapon(
  state: FpsRunState,
  input: GameInputController,
  physics: AuraPhysicsRuntime,
  playerBody: AuraBodyHandle,
  effects: GameEffectsController,
  clock: WeaponClock,
  dt: number,
  onHit: (enemyId: string, point: readonly [number, number, number]) => void,
  onShot: (shot: ShotTrace) => void,
  events: WeaponEvents = {}
): void {
  clock.cooldown = Math.max(0, clock.cooldown - dt);
  clock.recoil = Math.max(0, clock.recoil - dt * 5);

  // Timed reload: the mag seats after an authored window, not instantly.
  if (state.reloadClock > 0) {
    state.reloadClock = Math.max(0, state.reloadClock - dt);
    if (state.reloadClock === 0) {
      seatMagazine(state);
      state.reloadJustFinished = true;
      events.onReloadComplete?.();
    }
  }

  const bus = fireBus();
  // Keyboard fire is semi-automatic: one physical key-down produces one shot.
  // Keeping `input.held("fire")` here allowed a loaded software-rendered frame
  // to consume several rounds before the key-up event was observed. The touch
  // fire button retains its deliberate hold-to-fire behavior through bus.held.
  const wantFire = bus.queued || bus.held || input.pressed("fire");
  bus.queued = false;
  if (wantFire && state.status === "playing" && state.reloadClock <= 0) {
    if (state.ammo <= 0) {
      // Empty mag is a deny click, not silence.
      if (clock.cooldown <= 0) {
        state.dryFirePulse = 0.22;
        events.onDryFire?.();
        clock.cooldown = FIRE_COOLDOWN;
      }
    } else if (clock.cooldown <= 0) {
      state.paused = false;
      const shot = fireHitscan(state, physics, playerBody, effects, onHit, events.onImpactPoint);
      if (shot) {
        onShot(shot);
        clock.recoil = 1;
      }
      clock.cooldown = FIRE_COOLDOWN;
    }
  }
  if ((input.pressed("reload") || input.held("reload")) && state.status === "playing") {
    startReload(state, events);
  }
}

export function startReload(state: FpsRunState, events: WeaponEvents = {}): void {
  if (state.reloadClock > 0) return;
  if (state.ammo >= MAG_SIZE || state.reserve <= 0) return;
  state.reloadClock = RELOAD_TIME;
  events.onReloadStart?.();
}

function seatMagazine(state: FpsRunState): void {
  const need = MAG_SIZE - state.ammo;
  const take = Math.min(need, state.reserve);
  state.ammo += take;
  state.reserve -= take;
  state.reloads += 1;
  state.objective = "Magazine seated. Hunt the corridor";
}

export function fireHitscan(
  state: FpsRunState,
  physics: AuraPhysicsRuntime,
  playerBody: AuraBodyHandle,
  effects: GameEffectsController,
  onHit: (enemyId: string, point: readonly [number, number, number]) => void,
  afterImpact?: (point: readonly [number, number, number]) => void
): ShotTrace | null {
  if (state.ammo <= 0 || state.reloadClock > 0) {
    if (state.ammo <= 0) state.objective = "Empty mag. Press R to reload";
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
  // NC-A1 cosmetic scatter hook: confirmed impact point drives debris impulses.
  afterImpact?.(point);
  const named = hit.nodeName ?? hit.body.nodeName ?? "";
  const matchedEnemy = ENEMY_IDS.find((id) => physics.bodies.get(id)?.id === hit.body.id) ?? (named.startsWith("enemy-") ? named : "");
  const name = matchedEnemy || named;
  state.lastHitName = name;
  if (name.startsWith("enemy-")) {
    state.hits += 1;
    state.hitMarker = 0.16;
    // The endpoint is an authored hit, not just a raycast counter. Give the
    // renderer-owned spark a warm, compact envelope that matches the Warden
    // warning plates while the static shot-impact ring carries the longer
    // causal read through the review frame.
    effects.hitSpark(point, {
      ownerId: name,
      color: "#ffd166",
      intensity: 1.55,
      duration: 0.28,
      radius: 0.34
    });
    onHit(name, point);
  } else {
    effects.impactDecal(point, { ownerId: "wall", intensity: 0.55 });
  }
  return { origin, direction, yaw: state.yaw, pitch: state.pitch, end };
}

/** Kept for compatibility: instant reload path used by tests/tools. */
export function reload(state: FpsRunState): void {
  if (state.ammo >= MAG_SIZE || state.reserve <= 0) return;
  seatMagazine(state);
}
