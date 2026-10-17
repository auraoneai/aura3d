import type { GameCombatMove } from "@aura3d/engine";
import type { FighterDef } from "./fighters";

/** The public barrel doesn't export GameCollisionBox; derive it from the move contract. */
type CollisionBox = NonNullable<GameCombatMove["hitboxes"]>[number];

/**
 * Iron Crown move tables.
 *
 * Hitbox X offsets and knockback X are authored UNSIGNED (facing-relative):
 * the combat world mirrors hitboxes by attacker.facing and multiplies
 * knockback by attacker.facing itself. Stun/blockstun/recovery are FRAME
 * counts (decremented once per combat.update).
 */

export type AttackKind = "light" | "heavy" | "special" | "throw";

export interface IronMove extends GameCombatMove {
  readonly kind: AttackKind;
}

function box(id: string, x: number, y: number, w: number, h: number, reach: number): CollisionBox {
  return {
    id,
    offset: [x * reach, y, 0],
    size: [w * reach, h, 0.6]
  };
}

export function lightMove(fighter: FighterDef): IronMove {
  const r = fighter.stats.reach;
  return {
    kind: "light",
    id: `${fighter.id}-light`,
    name: `${fighter.name} — jab`,
    damage: 6 * fighter.stats.damage,
    guardDamage: 3,
    meterGain: 8 * fighter.stats.meterGain,
    hitStop: 0.05,
    hitStun: 13,
    blockStun: 8,
    recovery: 10,
    knockback: [0.16, 0, 0],
    activeFrames: [4, 8],
    durationFrames: 18,
    hitboxes: [box("jab", 0.74, 1.02, 0.82, 0.5, r)]
  };
}

export function heavyMove(fighter: FighterDef): IronMove {
  const r = fighter.stats.reach;
  return {
    kind: "heavy",
    id: `${fighter.id}-heavy`,
    name: `${fighter.name} — heavy`,
    damage: 12 * fighter.stats.damage,
    guardDamage: 7,
    meterGain: 13 * fighter.stats.meterGain,
    hitStop: 0.07,
    hitStun: 20,
    blockStun: 12,
    recovery: 19,
    knockback: [0.34, 0.22, 0],
    activeFrames: [9, 15],
    durationFrames: 32,
    hitboxes: [box("heavy", 0.86, 0.98, 1.05, 0.66, r)]
  };
}

/** Unblockable close-range throw. Tech window is handled by the app layer. */
export function throwMove(fighter: FighterDef): IronMove {
  return {
    kind: "throw",
    id: `${fighter.id}-throw`,
    name: `${fighter.name} — throw`,
    damage: 10 * fighter.stats.damage * (fighter.id === "boulder" ? 1.35 : 1),
    guardDamage: 0,
    meterGain: 12 * fighter.stats.meterGain,
    hitStop: 0.06,
    hitStun: 26,
    blockStun: 0,
    recovery: 22,
    knockback: [0.6, 0.5, 0],
    activeFrames: [6, 10],
    durationFrames: 30,
    blockable: false,
    hitboxes: [box("throw", 0.55, 0.9, 0.62, 1.1, 1)]
  };
}

const SPECIAL_TABLE: Record<
  FighterDef["special"]["fx"],
  { readonly damage: number; readonly hitStun: number; readonly reach: [x: number, y: number, w: number, h: number]; readonly active: readonly [number, number]; readonly duration: number; readonly knockback: readonly [number, number, number] }
> = {
  arc: { damage: 16, hitStun: 24, reach: [0.95, 1.0, 1.7, 0.9], active: [8, 22], duration: 46, knockback: [0.5, 0.35, 0] },
  storm: { damage: 14, hitStun: 22, reach: [0.8, 0.95, 1.35, 1.0], active: [5, 20], duration: 40, knockback: [0.42, 0.3, 0] },
  slam: { damage: 22, hitStun: 30, reach: [0.7, 0.9, 1.5, 1.4], active: [12, 22], duration: 52, knockback: [0.3, 0.9, 0] },
  lance: { damage: 15, hitStun: 24, reach: [1.35, 0.95, 2.5, 0.55], active: [10, 24], duration: 48, knockback: [0.55, 0.2, 0] },
  mischief: { damage: 13, hitStun: 26, reach: [0.85, 0.95, 1.4, 1.15], active: [6, 18], duration: 38, knockback: [0.35, 0.55, 0] },
  crown: { damage: 20, hitStun: 28, reach: [0.95, 1.0, 1.9, 1.15], active: [9, 24], duration: 50, knockback: [0.6, 0.45, 0] }
};

export function specialMove(fighter: FighterDef): IronMove {
  const spec = SPECIAL_TABLE[fighter.special.fx];
  const r = fighter.stats.reach;
  return {
    kind: "special",
    id: `${fighter.id}-special`,
    name: fighter.special.name,
    damage: spec.damage * fighter.stats.damage,
    guardDamage: Math.ceil(spec.damage * 0.3),
    meterGain: 0,
    hitStop: 0.09,
    hitStun: spec.hitStun,
    blockStun: 16,
    recovery: 26,
    knockback: [...spec.knockback] as [number, number, number],
    activeFrames: spec.active,
    durationFrames: spec.duration,
    hitboxes: [box("special", spec.reach[0], spec.reach[1], spec.reach[2], spec.reach[3], r)]
  };
}

export function moveFor(kind: AttackKind, fighter: FighterDef): IronMove {
  switch (kind) {
    case "light":
      return lightMove(fighter);
    case "heavy":
      return heavyMove(fighter);
    case "special":
      return specialMove(fighter);
    case "throw":
      return throwMove(fighter);
  }
}

/** Chip damage on blocked specials: 30% of raw damage, floored at 1, never kills. */
export function specialChip(move: IronMove): number {
  return Math.max(1, Math.ceil((move.damage ?? 0) * 0.3));
}

/** Frame-data line for the Combo Lab overlay. */
export function frameDataLine(move: IronMove): string {
  const [s, e] = move.activeFrames ?? [1, move.durationFrames ?? 1];
  const recovery = Math.max(0, (move.durationFrames ?? 0) - e);
  return `${move.name ?? move.id} · startup ${s}f · active ${e - s + 1}f · recovery ${recovery}f · dmg ${Math.round(move.damage ?? 0)} · stun ${move.hitStun ?? 0}f/${move.blockStun ?? 0}f`;
}
