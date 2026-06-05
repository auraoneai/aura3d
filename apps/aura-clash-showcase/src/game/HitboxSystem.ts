import type { AuraClashRuntimeEvent } from "./types";
import type { KinematicBody } from "./KinematicBody";

export type AuraClashMoveKind = "light" | "heavy" | "special";

export interface AuraClashMoveFrame {
  kind: AuraClashMoveKind;
  startup: number;
  active: number;
  recovery: number;
  damage: number;
  guardDamage: number;
  stun: number;
  knockback: { x: number; y: number };
  reach: number;
  height: number;
}

export const auraClashMoveFrames: Record<AuraClashMoveKind, AuraClashMoveFrame> = {
  light: {
    kind: "light",
    startup: 0.07,
    active: 0.11,
    recovery: 0.16,
    damage: 6,
    guardDamage: 8,
    stun: 0.18,
    knockback: { x: 1.4, y: 0.5 },
    reach: 0.78,
    height: 0.82,
  },
  heavy: {
    kind: "heavy",
    startup: 0.12,
    active: 0.14,
    recovery: 0.28,
    damage: 13,
    guardDamage: 18,
    stun: 0.28,
    knockback: { x: 2.2, y: 0.8 },
    reach: 0.96,
    height: 0.86,
  },
  special: {
    kind: "special",
    startup: 0.16,
    active: 0.22,
    recovery: 0.46,
    damage: 26,
    guardDamage: 34,
    stun: 0.48,
    knockback: { x: 3.2, y: 1.2 },
    reach: 1.34,
    height: 0.95,
  },
};

export interface CombatResolution {
  hit: boolean;
  guarded: boolean;
  event: AuraClashRuntimeEvent;
  frame: AuraClashMoveFrame;
}

export function resolveAttack(
  attacker: KinematicBody,
  defender: KinematicBody,
  kind: AuraClashMoveKind,
  atMs: number,
  defenderGuarding: boolean,
): CombatResolution {
  const frame = auraClashMoveFrames[kind];
  const attackX = attacker.position.x + attacker.facing * frame.reach;
  const attackY = attacker.position.y + frame.height;
  const defenderX = defender.position.x;
  const defenderY = defender.position.y + defender.hurtboxHeight * 0.48;
  const dx = attackX - defenderX;
  const dy = attackY - defenderY;
  const distance = Math.hypot(dx, dy);
  const overlapRadius = defender.radius + 0.42;
  const overlaps = distance <= overlapRadius;
  const collision = {
    attackX,
    attackY,
    defenderX,
    defenderY,
    dx,
    dy,
    distance,
    overlapRadius,
    hurtboxHeight: defender.hurtboxHeight,
    defenderCrouching: defender.crouching,
    overlaps,
  };

  if (!overlaps) {
    return {
      hit: false,
      guarded: false,
      frame,
      event: {
        id: `miss-${kind}-${atMs.toString(36)}`,
        type: "miss",
        atMs,
        label: `${kind} whiffed`,
        payload: { kind, collision },
      },
    };
  }

  return {
    hit: true,
    guarded: defenderGuarding,
    frame,
    event: {
      id: `${defenderGuarding ? "guard" : "hit"}-${kind}-${atMs.toString(36)}`,
      type: defenderGuarding ? "guard" : "hit",
      atMs,
      label: defenderGuarding ? `${kind} guarded` : `${kind} connected`,
      payload: {
        kind,
        damage: defenderGuarding ? frame.guardDamage : frame.damage,
        stun: frame.stun,
        knockback: frame.knockback,
        collision,
      },
    },
  };
}
