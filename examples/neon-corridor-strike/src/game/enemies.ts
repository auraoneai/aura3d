import type { AuraPhysicsRuntime } from "@aura3d/engine";
import type { FpsRunState } from "./state";

interface MutableNode {
  setPosition(x: number, y: number, z: number): unknown;
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

export const ENEMY_BODY_Y = 0.72;
export const ENEMY_VISUAL_Y = -0.45;

const AGGRO = 4.4;
const ATTACK = 1.35;
const CHASE = 2.15;
const PATROL = 1.1;
const TOUCH_DAMAGE = 10;
const ATTACK_COOLDOWN = 0.8;

const attackClock = new Map<string, number>();
const health = new Map<string, number>();

export function ensureEnemyBody(physics: AuraPhysicsRuntime, enemy: EnemySpec): void {
  const id = `enemy-${enemy.id}`;
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
  for (const enemy of ENEMIES) {
    health.set(`enemy-${enemy.id}`, 68);
    ensureEnemyBody(physics, enemy);
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

export function updateEnemies(
  state: FpsRunState,
  physics: AuraPhysicsRuntime,
  playerAt: readonly [number, number, number],
  nodes: { get(id: string): MutableNode | undefined },
  dt: number
): void {
  if (state.status !== "playing" || state.paused) return;
  for (const enemy of ENEMIES) {
    const id = `enemy-${enemy.id}`;
    const body = physics.bodies.get(id);
    const node = nodes.get(id);
    if (!body || state.killed.includes(id)) {
      node?.setVisible(false);
      if (body) physics.removeBody(id);
      continue;
    }
    const at = body.position();
    let x = at[0];
    let z = at[2];
    if (state.spawnGuard > 0) {
      body.setPosition([enemy.x, ENEMY_BODY_Y, enemy.z]);
      node?.setPosition(enemy.x, ENEMY_VISUAL_Y, enemy.z);
      node?.setVisible(true);
      continue;
    }
    const dx = playerAt[0] - x;
    const dz = playerAt[2] - z;
    const distance = Math.hypot(dx, dz);
    const cooldown = Math.max(0, (attackClock.get(id) ?? 0) - dt);
    attackClock.set(id, cooldown);
    if (distance < ATTACK) {
      if (cooldown <= 0) {
        state.hp = Math.max(0, state.hp - TOUCH_DAMAGE);
        attackClock.set(id, ATTACK_COOLDOWN);
      }
    } else if (distance < AGGRO) {
      x += (dx / distance) * CHASE * dt;
      z += (dz / distance) * CHASE * dt;
    } else {
      const targetX = Math.abs(x - enemy.x) < 0.35 ? enemy.patrol[0] : enemy.x;
      const dir = Math.sign(targetX - x) || 0;
      x += dir * PATROL * dt;
    }
    body.setPosition([x, ENEMY_BODY_Y, z]);
    node?.setPosition(x, ENEMY_VISUAL_Y, z);
    node?.setVisible(true);
  }
}
