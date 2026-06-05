import type { FighterSide, Vec2 } from "./GameTypes";

export type HitStrength = "light" | "heavy" | "special";

export interface HitVolume {
  id: string;
  owner: FighterSide;
  strength: HitStrength;
  center: Vec2;
  radius: number;
  damage: number;
  guardDamage: number;
  stunMs: number;
  activeUntilMs: number;
}

export interface HurtVolume {
  owner: FighterSide;
  center: Vec2;
  radius: number;
  guarding: boolean;
}

export interface HitResolution {
  hit: boolean;
  blocked: boolean;
  damage: number;
  guardDamage: number;
  stunMs: number;
}

export function resolveHit(hit: HitVolume, hurt: HurtVolume): HitResolution {
  const dx = hit.center.x - hurt.center.x;
  const dy = hit.center.y - hurt.center.y;
  const overlap = Math.hypot(dx, dy) <= hit.radius + hurt.radius;

  if (!overlap || hit.owner === hurt.owner) {
    return {
      hit: false,
      blocked: false,
      damage: 0,
      guardDamage: 0,
      stunMs: 0,
    };
  }

  if (hurt.guarding) {
    return {
      hit: true,
      blocked: true,
      damage: Math.round(hit.damage * 0.18),
      guardDamage: hit.guardDamage,
      stunMs: Math.round(hit.stunMs * 0.35),
    };
  }

  return {
    hit: true,
    blocked: false,
    damage: hit.damage,
    guardDamage: hit.guardDamage,
    stunMs: hit.stunMs,
  };
}
