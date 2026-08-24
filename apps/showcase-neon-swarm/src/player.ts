/**
 * Neon Swarm player: authored kinematic courier movement.
 *
 * Pure module. Movement is direct authored motion (route-local, NOT a physics
 * body claim): WASD/axes move the courier on the street plane, Shift dashes
 * with 0.25s i-frames and a 1.5s cooldown, and pulse fire is an overlap query
 * with a short cone plus cooldown - no projectiles, so the instancing budget
 * stays reserved for enemies (PRD section 5).
 */

export interface PlayerInputFrame {
  readonly moveX: number;
  readonly moveZ: number;
  readonly aimX: number;
  readonly aimZ: number;
  readonly firePressed: boolean;
  readonly dashPressed: boolean;
}

export interface PlayerState {
  x: number;
  z: number;
  vx: number;
  vz: number;
  hp: number;
  maxHp: number;
  aimX: number;
  aimZ: number;
  dashRemaining: number;
  dashCooldownRemaining: number;
  invulnerableRemaining: number;
  fireCooldownRemaining: number;
  hurtFlashRemaining: number;
  /** Accumulated sub-pip contact damage awaiting application. */
  contactDebt: number;
}

export interface PlayerTuning {
  moveSpeed: number;
  dashSpeed: number;
  dashDurationSeconds: number;
  dashCooldownSeconds: number;
  dashInvulnerableSeconds: number;
  fireCooldownSeconds: number;
  pulseDamage: number;
}

export const DEFAULT_PLAYER_TUNING: PlayerTuning = {
  moveSpeed: 7.4,
  dashSpeed: 21,
  dashDurationSeconds: 0.16,
  dashCooldownSeconds: 1.5,
  dashInvulnerableSeconds: 0.25,
  fireCooldownSeconds: 0.42,
  pulseDamage: 1
};

export const PLAYER_RADIUS = 0.55;

export function createPlayerState(maxHp = 6): PlayerState {
  return {
    x: 0,
    z: 3,
    vx: 0,
    vz: 0,
    hp: maxHp,
    maxHp,
    aimX: 0,
    aimZ: -1,
    dashRemaining: 0,
    dashCooldownRemaining: 0,
    invulnerableRemaining: 0,
    fireCooldownRemaining: 0,
    hurtFlashRemaining: 0,
    contactDebt: 0
  };
}

export interface PlayerStepResult {
  /** True when this frame started a dash (for FX/audio hooks). */
  dashed: boolean;
  /** True when this frame fired the pulse (for FX/audio hooks). */
  fired: boolean;
  /** Contact damage taken this frame (already applied to hp). */
  damageTaken: number;
}

export interface PlayerUpgrades {
  /** Multiplier applied to fire cooldown (lower fires faster). */
  fireRateMultiplier: number;
  /** Multiplier applied to dash cooldown (shorter waits). */
  dashCooldownMultiplier: number;
  /** Shield charges absorbing contact damage before hp. */
  shieldCharges: number;
}

export function createPlayerUpgrades(): PlayerUpgrades {
  return { fireRateMultiplier: 1, dashCooldownMultiplier: 1, shieldCharges: 0 };
}

function clampRect(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function stepPlayer(
  state: PlayerState,
  tuning: PlayerTuning,
  upgrades: PlayerUpgrades,
  input: PlayerInputFrame,
  dt: number,
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number }
): PlayerStepResult {
  const result: PlayerStepResult = { dashed: false, fired: false, damageTaken: 0 };

  state.dashCooldownRemaining = Math.max(0, state.dashCooldownRemaining - dt);
  state.invulnerableRemaining = Math.max(0, state.invulnerableRemaining - dt);
  state.fireCooldownRemaining = Math.max(0, state.fireCooldownRemaining - dt);
  state.hurtFlashRemaining = Math.max(0, state.hurtFlashRemaining - dt);

  if (input.aimX !== 0 || input.aimZ !== 0) {
    const len = Math.hypot(input.aimX, input.aimZ) || 1;
    state.aimX = input.aimX / len;
    state.aimZ = input.aimZ / len;
  }

  // Dash overrides normal movement for its short window.
  if (input.dashPressed && state.dashCooldownRemaining <= 0 && state.dashRemaining <= 0) {
    let dirX = state.aimX;
    let dirZ = state.aimZ;
    if (input.moveX !== 0 || input.moveZ !== 0) {
      const len = Math.hypot(input.moveX, input.moveZ) || 1;
      dirX = input.moveX / len;
      dirZ = input.moveZ / len;
    }
    state.vx = dirX * tuning.dashSpeed;
    state.vz = dirZ * tuning.dashSpeed;
    state.dashRemaining = tuning.dashDurationSeconds;
    state.invulnerableRemaining = Math.max(state.invulnerableRemaining, tuning.dashInvulnerableSeconds);
    state.dashCooldownRemaining = Math.max(
      state.dashCooldownRemaining,
      tuning.dashCooldownSeconds * upgrades.dashCooldownMultiplier
    );
    result.dashed = true;
  }

  if (state.dashRemaining > 0) {
    state.dashRemaining -= dt;
  } else {
    const len = Math.hypot(input.moveX, input.moveZ);
    if (len > 0.001) {
      const nx = input.moveX / Math.max(1, len);
      const nz = input.moveZ / Math.max(1, len);
      state.vx += (nx * tuning.moveSpeed - state.vx) * Math.min(1, dt * 12);
      state.vz += (nz * tuning.moveSpeed - state.vz) * Math.min(1, dt * 12);
    } else {
      state.vx *= Math.pow(0.0009, dt);
      state.vz *= Math.pow(0.0009, dt);
    }
  }

  state.x += state.vx * dt;
  state.z += state.vz * dt;
  state.x = clampRect(state.x, bounds.minX + PLAYER_RADIUS, bounds.maxX - PLAYER_RADIUS);
  state.z = clampRect(state.z, bounds.minZ + PLAYER_RADIUS, bounds.maxZ - PLAYER_RADIUS);

  if (input.firePressed && state.fireCooldownRemaining <= 0) {
    state.fireCooldownRemaining = tuning.fireCooldownSeconds * upgrades.fireRateMultiplier;
    result.fired = true;
  }

  return result;
}

/**
 * Contact damage from overlapping drones. Chip damage accumulates as debt and
 * lands in whole HP pips; shields absorb a whole-pip charge first; i-frames
 * block everything. Returns whole-pip damage actually dealt this frame.
 */
export function applyContactDamage(state: PlayerState, upgrades: PlayerUpgrades, damagePerSecond: number, dt: number): number {
  if (state.invulnerableRemaining > 0) return 0;
  state.contactDebt += damagePerSecond * dt;
  if (state.contactDebt < 1) return 0;
  let pips = Math.floor(state.contactDebt);
  state.contactDebt -= pips;
  if (upgrades.shieldCharges > 0 && pips > 0) {
    const absorbed = Math.min(upgrades.shieldCharges, pips);
    upgrades.shieldCharges -= absorbed;
    pips -= absorbed;
    state.invulnerableRemaining = 0.45;
  }
  if (pips <= 0) return 0;
  const applied = Math.min(state.hp, pips);
  state.hp -= applied;
  state.invulnerableRemaining = 0.5;
  state.hurtFlashRemaining = 0.28;
  return applied;
}
