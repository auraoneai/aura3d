import type { FighterRuntimeState } from "../state/GameTypes";
import type { HitStrength, HitVolume, HurtVolume } from "../state/HitRegistry";
import { resolveHit } from "../state/HitRegistry";

export interface AttackProfile {
  strength: HitStrength;
  reach: number;
  radius: number;
  damage: number;
  guardDamage: number;
  stunMs: number;
  activeMs: number;
}

export const attackProfiles: Record<HitStrength, AttackProfile> = {
  light: {
    strength: "light",
    reach: 0.75,
    radius: 0.42,
    damage: 6,
    guardDamage: 8,
    stunMs: 160,
    activeMs: 140,
  },
  heavy: {
    strength: "heavy",
    reach: 0.92,
    radius: 0.52,
    damage: 10,
    guardDamage: 18,
    stunMs: 260,
    activeMs: 190,
  },
  special: {
    strength: "special",
    reach: 1.35,
    radius: 0.72,
    damage: 56,
    guardDamage: 34,
    stunMs: 460,
    activeMs: 320,
  },
};

export function createHitVolume(fighter: FighterRuntimeState, strength: HitStrength, atMs: number): HitVolume {
  const profile = attackProfiles[strength];
  return {
    id: `${fighter.side}-${strength}-${atMs.toString(36)}`,
    owner: fighter.side,
    strength,
    center: {
      x: fighter.position.x + profile.reach * fighter.facing,
      y: fighter.position.y + 0.9,
    },
    radius: profile.radius,
    damage: profile.damage,
    guardDamage: profile.guardDamage,
    stunMs: profile.stunMs,
    activeUntilMs: atMs + profile.activeMs,
  };
}

export function createHurtVolume(fighter: FighterRuntimeState): HurtVolume {
  return {
    owner: fighter.side,
    center: {
      x: fighter.position.x,
      y: fighter.position.y + 0.85,
    },
    radius: 0.52,
    guarding: fighter.action === "guard",
  };
}

export function resolveFighterHit(attacker: FighterRuntimeState, defender: FighterRuntimeState, strength: HitStrength, atMs: number) {
  return resolveHit(createHitVolume(attacker, strength, atMs), createHurtVolume(defender));
}
