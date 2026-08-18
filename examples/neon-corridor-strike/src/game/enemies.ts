import type { AuraPhysicsRuntime } from "@aura3d/engine";
import type { FpsRunState } from "./state";

interface MutableNode {
  setPosition(x: number, y: number, z: number): unknown;
  setRotation(x: number, y: number, z: number): unknown;
  setVisible(visible: boolean): unknown;
}

export interface EnemySpec {
  readonly id: string;
  readonly asset: "impA" | "impB";
  readonly x: number;
  readonly z: number;
  readonly patrol: readonly [number, number];
}

export const ENEMIES: readonly EnemySpec[] = [
  { id: "e1", asset: "impA", x: 0, z: 0.6, patrol: [-1.2, 0.6] },
  { id: "e2", asset: "impB", x: 2.1, z: -0.4, patrol: [1.2, -0.4] },
  { id: "e3", asset: "impA", x: -2.1, z: -2.6, patrol: [-1.2, -2.6] },
  { id: "e4", asset: "impB", x: 2.1, z: -6.4, patrol: [1.2, -6.4] }
];

/** Capsule height for hitscan + proximity. Never copy this onto the visual mesh. */
export const ENEMY_BODY_Y = 0.72;
/** Visual mesh height. Catalog pedestals stay buried below the floor. */
export const ENEMY_VISUAL_Y = -0.45;

/**
 * When the spawn guard expires the corridor wakes up: every hostile rushes the
 * player. Deterministic on purpose — the playable spec relies on the guard
 * window for its opening shots and on the swarm for the fail state.
 */
const ALARM_TEXT = "The corridor wakes up. Clear it or reach the exit";
const ATTACK = 2.2;
const ATTACK_LUNGE = 0.35;
const CHASE = 3.5;
const TOUCH_DAMAGE = 25;
const ATTACK_COOLDOWN = 0.4;
/** Authored tell before the damage frame: a read, not a surprise overlap. */
const TELEGRAPH = 0.42;
/** Flinch window after a non-fatal hit (visual node only, never the capsule). */
const FLINCH = 0.2;
/** Crumple window before the corpse hides. Instant hide is the floor, not the target. */
const DEATH_CRUMPLE = 0.55;

const attackClock = new Map<string, number>();
const telegraphClock = new Map<string, number>();
const flinchClock = new Map<string, number>();
const dyingClock = new Map<string, number>();
const health = new Map<string, number>();
const facing = new Map<string, number>();
let alarmed = false;

export interface EnemyEvents {
  readonly onPlayerDamaged?: () => void;
  readonly onAlarm?: () => void;
}

export function ensureEnemyBody(physics: AuraPhysicsRuntime, enemy: EnemySpec): void {
  const id = "enemy-" + enemy.id;
  const existing = physics.bodies.get(id);
  if (existing) {
    existing.teleport([enemy.x, ENEMY_BODY_Y, enemy.z]);
    return;
  }
  physics.createBody({
    name: id,
    type: "kinematic",
    shape: "capsule",
    radius: 0.55,
    halfHeight: 0.85,
    position: [enemy.x, ENEMY_BODY_Y, enemy.z],
    layer: "enemy"
  });
}

export function resetEnemies(physics: AuraPhysicsRuntime): void {
  health.clear();
  attackClock.clear();
  telegraphClock.clear();
  flinchClock.clear();
  dyingClock.clear();
  facing.clear();
  alarmed = false;
  for (const enemy of ENEMIES) {
    health.set("enemy-" + enemy.id, 68);
    ensureEnemyBody(physics, enemy);
  }
}

/** Non-fatal hits flinch the visual node; fatal hits start the crumple. */
export function registerHitReaction(id: string, killed: boolean): void {
  if (killed) {
    dyingClock.set(id, DEATH_CRUMPLE);
  } else {
    flinchClock.set(id, FLINCH);
  }
}

export function damageEnemy(id: string, amount: number, state: FpsRunState): boolean {
  if (state.killed.includes(id)) return false;
  const next = (health.get(id) ?? 68) - amount;
  health.set(id, next);
  if (next > 0) return false;
  state.killed.push(id);
  state.kills += 1;
  state.score += 100;
  return true;
}

function yawToward(fromX: number, fromZ: number, toX: number, toZ: number): number {
  // lookDirection(yaw, 0) = (-sin(yaw), 0, -cos(yaw)); solve yaw facing the player.
  return Math.atan2(-(toX - fromX), -(toZ - fromZ));
}

export function updateEnemies(
  state: FpsRunState,
  physics: AuraPhysicsRuntime,
  playerAt: readonly [number, number, number],
  nodes: { get(id: string): MutableNode | undefined },
  dt: number,
  events: EnemyEvents = {}
): void {
  if (state.status !== "playing" || state.paused) return;

  if (!alarmed && state.spawnGuard <= 0) {
    alarmed = true;
    if (state.objective === "Clear the corridor or reach the exit") {
      state.objective = ALARM_TEXT;
    }
    events.onAlarm?.();
  }

  for (const enemy of ENEMIES) {
    const id = "enemy-" + enemy.id;
    const body = physics.bodies.get(id);
    const node = nodes.get(id);

    // Death crumple: the capsule is already gone, the mesh gets weight.
    if (state.killed.includes(id)) {
      const remaining = dyingClock.get(id);
      if (remaining === undefined || remaining <= 0) {
        node?.setVisible(false);
        if (body) physics.removeBody(id);
        continue;
      }
      dyingClock.set(id, remaining - dt);
      const t = 1 - Math.max(0, remaining - dt) / DEATH_CRUMPLE;
      const at = body ? body.position() : [enemy.x, ENEMY_BODY_Y, enemy.z];
      const yaw = facing.get(id) ?? 0;
      node?.setVisible(true);
      node?.setRotation(-1.35 * t, yaw, 0.25 * t);
      node?.setPosition(at[0], ENEMY_VISUAL_Y - 0.5 * t, at[2]);
      continue;
    }

    if (!body) continue;
    const at = body.position();
    let x = at[0];
    let z = at[2];

    if (state.spawnGuard > 0) {
      // Dormant: pinned to spawn, facing the entrance, reading as a set piece.
      body.setPosition([enemy.x, ENEMY_BODY_Y, enemy.z]);
      const yaw = yawToward(enemy.x, enemy.z, playerAt[0], playerAt[2]);
      facing.set(id, yaw);
      node?.setPosition(enemy.x, ENEMY_VISUAL_Y, enemy.z);
      node?.setRotation(0, yaw, 0);
      node?.setVisible(true);
      continue;
    }

    const dx = playerAt[0] - x;
    const dz = playerAt[2] - z;
    const distance = Math.hypot(dx, dz);
    const cooldown = Math.max(0, (attackClock.get(id) ?? 0) - dt);
    attackClock.set(id, cooldown);
    const flinch = Math.max(0, (flinchClock.get(id) ?? 0) - dt);
    flinchClock.set(id, flinch);
    const yaw = yawToward(x, z, playerAt[0], playerAt[2]);
    facing.set(id, yaw);

    let telegraph = Math.max(0, (telegraphClock.get(id) ?? 0) - dt);

    if (alarmed && distance > ATTACK) {
      // Rush with intent: straight at the player.
      x += (dx / distance) * CHASE * dt;
      z += (dz / distance) * CHASE * dt;
      telegraph = 0;
    } else if (alarmed) {
      // In attack range: telegraph, then land the swipe if the player stayed.
      if (telegraph <= 0 && cooldown <= 0) {
        telegraph = TELEGRAPH;
      }
      if (telegraph > 0) {
        telegraphClock.set(id, telegraph);
        if (telegraph <= dt && distance < ATTACK + ATTACK_LUNGE) {
          state.hp = Math.max(0, state.hp - TOUCH_DAMAGE);
          state.damageFlash = 0.5;
          attackClock.set(id, ATTACK_COOLDOWN);
          events.onPlayerDamaged?.();
        }
      }
    } else {
      const targetX = Math.abs(x - enemy.x) < 0.35 ? enemy.patrol[0] : enemy.x;
      const dir = Math.sign(targetX - x) || 0;
      x += dir * 1.1 * dt;
    }

    body.setPosition([x, ENEMY_BODY_Y, z]);

    // Flinch recoils the visual node; it never moves the capsule.
    const flinchK = flinch > 0 ? flinch / FLINCH : 0;
    const backX = Math.sin(yaw) * 0.14 * flinchK;
    const backZ = Math.cos(yaw) * 0.14 * flinchK;
    // Telegraph lean: wind up toward the player so the swipe is readable.
    const telegraphLean = telegraph > 0 ? Math.sin((1 - telegraph / TELEGRAPH) * Math.PI) : 0;
    node?.setRotation(0.22 * telegraphLean - 0.18 * (flinch > 0 ? 1 : 0), yaw, 0);
    node?.setPosition(
      x + backX - Math.sin(yaw) * 0.12 * telegraphLean,
      ENEMY_VISUAL_Y,
      z + backZ - Math.cos(yaw) * 0.12 * telegraphLean
    );
    node?.setVisible(true);
  }
}
