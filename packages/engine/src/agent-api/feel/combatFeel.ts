/**
 * F-6 (combat leg): maps a landed combat move onto the fighting feel preset
 * names (`hit-light` / `hit-heavy` / `ko` / `block` / `whiff`). Lane-08 owns
 * this mapping; the fighting kit (`game-kits/fighting.ts`, lane-05) calls
 * `emitCombatFeel` from its hit resolution when a feel bus is bound.
 */
import type { AuraFeelBus } from "../../contracts/time.js";

export interface CombatFeelMove {
  /** Normalized move strength, 0..1 (light < 0.5 <= heavy). */
  readonly strength: number;
  /** Move ended the round. */
  readonly ko?: boolean;
  /** Defender blocked the hit. */
  readonly blocked?: boolean;
  /** Move missed entirely — no contact. */
  readonly whiff?: boolean;
}

export type CombatFeelEvent = "hit-light" | "hit-heavy" | "ko" | "block" | "whiff";

export function combatFeelEvent(move: CombatFeelMove): CombatFeelEvent {
  if (move.whiff) return "whiff";
  if (move.blocked) return "block";
  if (move.ko) return "ko";
  return move.strength < 0.5 ? "hit-light" : "hit-heavy";
}

export function emitCombatFeel(
  bus: Pick<AuraFeelBus, "emit">,
  move: CombatFeelMove,
  options?: { readonly position?: readonly [number, number, number] }
): CombatFeelEvent {
  const event = combatFeelEvent(move);
  bus.emit(event, { position: options?.position, strength: Math.min(1, Math.max(0, move.strength)) });
  return event;
}
