export type StatRating = number;

export type FighterStats = Readonly<{
  maxHealth: number;
  maxGuard: number;
  startingMeter: number;
  meterCap: number;
  attack: StatRating;
  defense: StatRating;
  speed: StatRating;
  technique: StatRating;
  range: StatRating;
  guardPressure: StatRating;
  meterBuild: StatRating;
  weight: StatRating;
}>;

export type ComboStarter = "light" | "heavy" | "special" | "guard" | "dash";

export type ComboRoute = Readonly<{
  id: string;
  label: string;
  starter: ComboStarter;
  sequence: readonly ComboStarter[];
  targetDamage: number;
  meterSwing: number;
  difficulty: "starter" | "standard" | "advanced" | "expert";
  notes: string;
}>;

export type FighterComboTuning = Readonly<{
  maxPracticalHits: number;
  hitConfirmWindowMs: number;
  cancelWindowMs: number;
  resetWindowMs: number;
  baseDamageScaling: readonly [number, number, number, number, number];
  hitstunDecayPerHit: number;
  guardPressureDecayPerHit: number;
  meterGainMultiplier: number;
  routes: readonly ComboRoute[];
}>;

