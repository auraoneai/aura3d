export type AuraClashActionSlot = "light" | "heavy" | "special" | "guard" | "dash";

export type FighterMoveKind =
  | "strike"
  | "launcher"
  | "projectile"
  | "rushdown"
  | "grapple"
  | "counter"
  | "guard"
  | "movement"
  | "trap"
  | "buff"
  | "antiAir"
  | "areaControl";

export type FighterMoveRange = "close" | "mid" | "long" | "full-stage";

export type FighterFrameData = Readonly<{
  startupMs: number;
  activeMs: number;
  recoveryMs: number;
  cooldownMs: number;
}>;

export type FighterHitTuning = Readonly<{
  damage: number;
  guardDamage: number;
  meterGain: number;
  meterCost: number;
  stunMs: number;
  pushback: number;
  launch: number;
  hitAdvantageMs: number;
  blockAdvantageMs: number;
  cancellableInto: readonly AuraClashActionSlot[];
  comboTags: readonly string[];
}>;

export type FighterMove = Readonly<{
  id: string;
  name: string;
  input: AuraClashActionSlot;
  kind: FighterMoveKind;
  range: FighterMoveRange;
  description: string;
  gameplayNote: string;
  accessibilityCue: string;
  vfxMotifs: readonly string[];
  frame: FighterFrameData;
  hit: FighterHitTuning;
}>;

export type FighterMoveKit = Readonly<{
  archetype: string;
  combatStyleTags: readonly string[];
  baseAttacks: Readonly<{
    light: FighterMove;
    heavy: FighterMove;
    guard: FighterMove;
    dash: FighterMove;
  }>;
  signature: FighterMove;
}>;

