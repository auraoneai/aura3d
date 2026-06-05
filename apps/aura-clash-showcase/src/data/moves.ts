import { auraClashMoveFrames } from "../game";

export const auraClashMoves = Object.values(auraClashMoveFrames).map((move) => ({
  id: move.kind,
  label: move.kind === "light" ? "Light Combo" : move.kind === "heavy" ? "Heavy Strike" : "Aura Burst",
  startup: move.startup,
  active: move.active,
  recovery: move.recovery,
  damage: move.damage,
  guardDamage: move.guardDamage,
  stun: move.stun,
  knockback: move.knockback,
  reach: move.reach,
}));

export type AuraClashMoveData = (typeof auraClashMoves)[number];

