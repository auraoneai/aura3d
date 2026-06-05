import { resolveAttack, type AuraClashMoveKind } from "./HitboxSystem";
import type { KinematicBody } from "./KinematicBody";
import type { AuraClashRuntimeEvent } from "./types";

const SPECIAL_METER_COST = 35;

export interface CombatantVitals {
  health: number;
  guard: number;
  meter: number;
}

export interface CombatResolverResult {
  attacker: CombatantVitals;
  defender: CombatantVitals;
  events: AuraClashRuntimeEvent[];
}

export function resolveCombatAction(options: {
  attackerBody: KinematicBody;
  defenderBody: KinematicBody;
  attackerVitals: CombatantVitals;
  defenderVitals: CombatantVitals;
  move: AuraClashMoveKind;
  atMs: number;
  defenderGuarding: boolean;
}): CombatResolverResult {
  if (options.move === "special" && options.attackerVitals.meter < SPECIAL_METER_COST) {
    return {
      attacker: options.attackerVitals,
      defender: options.defenderVitals,
      events: [
        {
          id: `special-failed-${options.atMs.toString(36)}`,
          type: "attack",
          atMs: options.atMs,
          label: "special failed: insufficient meter",
          payload: {
            kind: "special",
            currentMeter: options.attackerVitals.meter,
            requiredMeter: SPECIAL_METER_COST,
            damageApplied: false,
            meterSpent: false,
          },
        },
      ],
    };
  }

  const attack = resolveAttack(
    options.attackerBody,
    options.defenderBody,
    options.move,
    options.atMs,
    options.defenderGuarding,
  );
  const attackerMeterAfterCost =
    options.move === "special"
      ? options.attackerVitals.meter - SPECIAL_METER_COST
      : options.attackerVitals.meter;

  if (!attack.hit) {
    return {
      attacker: {
        ...options.attackerVitals,
        meter: clamp(attackerMeterAfterCost + (options.move === "special" ? 0 : 4)),
      },
      defender: options.defenderVitals,
      events: [attack.event],
    };
  }

  const damage = attack.guarded ? Math.ceil(attack.frame.guardDamage * 0.22) : attack.frame.damage;
  const guardDamage = attack.guarded ? attack.frame.guardDamage : Math.ceil(attack.frame.guardDamage * 0.42);
  const knockbackScale = attack.guarded ? 0.48 : 1;
  const appliedKnockback = {
    x: attack.frame.knockback.x * options.attackerBody.facing * knockbackScale,
    y: attack.frame.knockback.y * knockbackScale,
  };

  options.defenderBody.move(
    {
      knockback: appliedKnockback,
    },
    1 / 60,
  );
  const impactEvent: AuraClashRuntimeEvent = {
    ...attack.event,
    payload: {
      ...attack.event.payload,
      damage,
      guardDamage,
      appliedKnockback,
      reaction: attack.guarded ? "guard" : attack.frame.stun > 0.36 ? "knockdown" : "hit",
      damageApplied: true,
    },
  };

  return {
    attacker: {
      ...options.attackerVitals,
      meter: clamp(attackerMeterAfterCost + (options.move === "special" ? 0 : attack.guarded ? 6 : 12)),
    },
    defender: {
      health: clamp(options.defenderVitals.health - damage),
      guard: clamp(options.defenderVitals.guard - guardDamage),
      meter: clamp(options.defenderVitals.meter + 8),
    },
    events: [impactEvent],
  };
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, value));
}
