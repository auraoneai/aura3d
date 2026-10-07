// apps/showcase-orbital-defense/src/gameplay/waves.ts — §5/§6.9.4 keep module.
// Pure wave / heat / shield rules extracted verbatim from the legacy entry.
// No engine or DOM imports: the v2 route re-uses this against `createGame`.

export interface EnemyState {
  id: string;
  angle: number;
  radius: number;
  speed: number;
  health: number;
  lane: number;
  active: boolean;
}

export interface ProjectileState {
  id: string;
  angle: number;
  radius: number;
  speed: number;
  active: boolean;
  ttl: number;
}

export interface ShieldPulse {
  angle: number;
  ttl: number;
}

export interface PlayerState {
  angle: number;
  heat: number;
  shieldCooldown: number;
  shieldPulses: ShieldPulse[];
}

export interface WaveState {
  score: number;
  wave: number;
  frameCount: number;
  planetIntegrity: number;
  replayChecksum: number;
  spawnTimer: number;
  player: PlayerState;
  enemies: EnemyState[];
  projectiles: ProjectileState[];
}

export const playerRadius = 2.65;
export const enemyIds = Array.from({ length: 10 }, (_, index) => `enemy-${index}`);
export const projectileIds = Array.from({ length: 14 }, (_, index) => `projectile-${index}`);
export const shieldIds = Array.from({ length: 5 }, (_, index) => `shield-${index}`);

export function createWaveState(): WaveState {
  const enemies: EnemyState[] = enemyIds.map((id, index) => ({
    id,
    angle: index * 0.72,
    radius: 4.4 + (index % 3) * 0.24,
    speed: 0.12 + index * 0.008,
    health: 1,
    lane: index % 3,
    active: index < 5
  }));
  const projectiles: ProjectileState[] = projectileIds.map((id) => ({
    id,
    angle: 0,
    radius: playerRadius,
    speed: 3.25,
    active: false,
    ttl: 0
  }));
  return {
    score: 0,
    wave: 1,
    frameCount: 0,
    planetIntegrity: 100,
    replayChecksum: 17,
    spawnTimer: 0,
    player: {
      angle: -Math.PI / 2,
      heat: 0,
      shieldCooldown: 0,
      shieldPulses: [] as ShieldPulse[]
    },
    enemies,
    projectiles
  };
}

export function resetGame(state: WaveState): void {
  state.score = 0;
  state.wave = 1;
  state.frameCount = 0;
  state.planetIntegrity = 100;
  state.replayChecksum = 17;
  state.spawnTimer = 0;
  state.player.angle = -Math.PI / 2;
  state.player.heat = 0;
  state.player.shieldCooldown = 0;
  state.player.shieldPulses = [];
  state.enemies.forEach((enemy, index) => {
    enemy.angle = index * 0.72;
    enemy.radius = 4.4 + (index % 3) * 0.24;
    enemy.speed = 0.12 + index * 0.008;
    enemy.health = 1;
    enemy.active = index < 5;
  });
  state.projectiles.forEach((projectile) => {
    projectile.active = false;
    projectile.ttl = 0;
    projectile.radius = playerRadius;
  });
}

export function fire(state: WaveState): void {
  if (state.player.heat > 90) return;
  const projectile = state.projectiles.find((candidate) => !candidate.active);
  if (!projectile) return;
  projectile.active = true;
  projectile.angle = state.player.angle;
  projectile.radius = playerRadius + 0.18;
  projectile.ttl = 1.45;
  state.player.heat = Math.min(100, state.player.heat + 13);
  state.replayChecksum = checksum(state.replayChecksum, 31 + Math.round(state.player.angle * 1000));
}

export function shield(state: WaveState): void {
  if (state.player.shieldCooldown > 0 || state.player.heat > 82) return;
  state.player.shieldPulses.push({ angle: state.player.angle, ttl: 1.2 });
  state.player.shieldCooldown = 1.8;
  state.player.heat = Math.min(100, state.player.heat + 22);
  state.replayChecksum = checksum(state.replayChecksum, 71 + Math.round(state.player.angle * 1000));
}

export function spawnEnemy(state: WaveState): void {
  const enemy = state.enemies.find((candidate) => !candidate.active);
  if (!enemy) return;
  enemy.active = true;
  enemy.angle = ((state.wave * 1.7 + state.frameCount * 0.017 + enemy.lane) % (Math.PI * 2));
  enemy.radius = 4.75 + enemy.lane * 0.22;
  enemy.speed = 0.16 + state.wave * 0.012 + enemy.lane * 0.018;
  enemy.health = state.wave >= 4 ? 2 : 1;
}

export interface WaveActions {
  readonly rotate: number;
  readonly fire: boolean;
  readonly shield: boolean;
}

export function updateWaves(state: WaveState, dt: number, actions: WaveActions): void {
  state.frameCount += 1;
  state.player.angle += actions.rotate * dt * 2.85;
  state.player.heat = Math.max(0, state.player.heat - dt * 17);
  state.player.shieldCooldown = Math.max(0, state.player.shieldCooldown - dt);
  if (actions.fire) fire(state);
  if (actions.shield) shield(state);

  state.spawnTimer -= dt;
  if (state.spawnTimer <= 0) {
    spawnEnemy(state);
    state.spawnTimer = Math.max(0.72, 1.8 - state.wave * 0.11);
  }
  state.wave = 1 + Math.floor(state.score / 450);

  for (const projectile of state.projectiles) {
    if (!projectile.active) continue;
    projectile.radius += projectile.speed * dt;
    projectile.ttl -= dt;
    if (projectile.ttl <= 0 || projectile.radius > 5.4) projectile.active = false;
  }

  for (const shieldPulse of state.player.shieldPulses) shieldPulse.ttl -= dt;
  state.player.shieldPulses = state.player.shieldPulses.filter((pulse) => pulse.ttl > 0);

  for (const enemy of state.enemies) {
    if (!enemy.active) continue;
    enemy.angle += enemy.speed * dt * (enemy.lane % 2 === 0 ? 1 : -1);
    enemy.radius -= dt * (0.28 + state.wave * 0.025);

    for (const projectile of state.projectiles) {
      if (!projectile.active) continue;
      if (Math.abs(wrapAngle(projectile.angle - enemy.angle)) < 0.16 && Math.abs(projectile.radius - enemy.radius) < 0.32) {
        projectile.active = false;
        enemy.health -= 1;
        state.score += 75 + state.wave * 8;
        state.replayChecksum = checksum(state.replayChecksum, Math.round(state.score + enemy.radius * 100 + enemy.angle * 100));
      }
    }

    for (const pulse of state.player.shieldPulses) {
      if (Math.abs(wrapAngle(pulse.angle - enemy.angle)) < 0.32 && enemy.radius < 3.25) {
        enemy.health = 0;
        state.score += 38;
        state.replayChecksum = checksum(state.replayChecksum, Math.round(state.score + pulse.ttl * 100));
      }
    }

    if (enemy.health <= 0) {
      enemy.active = false;
      enemy.radius = 8;
    }
    if (enemy.radius <= 1.2) {
      enemy.active = false;
      enemy.radius = 8;
      state.planetIntegrity = Math.max(0, state.planetIntegrity - 8);
      state.replayChecksum = checksum(state.replayChecksum, 9000 + state.planetIntegrity);
    }
  }
}

export type Vec3 = readonly [number, number, number];

export function polar(angle: number, radius: number, z: number): Vec3 {
  return [Math.cos(angle) * radius, Math.sin(angle) * radius, z];
}

export function wrapAngle(angle: number): number {
  let wrapped = angle;
  while (wrapped > Math.PI) wrapped -= Math.PI * 2;
  while (wrapped < -Math.PI) wrapped += Math.PI * 2;
  return wrapped;
}

export function checksum(seed: number, value: number): number {
  return (seed * 1664525 + value + 1013904223) >>> 0;
}
