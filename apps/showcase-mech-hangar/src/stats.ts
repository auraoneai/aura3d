/**
 * Mech Hangar stat aggregation + rival loadouts.
 *
 * The aggregation is the honest part->outcome bridge: every value a bout consumes
 * (hp, speed, guard, power, damage) is derived from the selected parts' authored
 * stat deltas. Nothing here reads the DOM or the renderer; unit tests drive it
 * directly to prove builds change fight outcomes.
 */
import { PART_OPTIONS, type BuildSelection, type MechSlot, type PartDef, selectedParts } from "./parts-catalog";

export interface MechStats {
  readonly hpMax: number;
  readonly moveSpeed: number;
  readonly jumpThrust: number;
  readonly guardMax: number;
  readonly powerMax: number;
  readonly specialCost: number;
  readonly lightDamage: number;
  readonly heavyDamage: number;
  readonly specialDamage: number;
}

/**
 * Authored mapping (PRD section 5): chassis->armor, legs->speed, arms->guard,
 * weapon->power/special cost. Formulas are linear in the part deltas so the bars
 * and the fight math move together and stay explainable.
 */
export function aggregateStats(selection: BuildSelection): MechStats {
  const [chassis, arms, legs, weapon] = selectedParts(selection);
  const armor = chassis.stats.armor + legs.stats.armor;
  const speed = legs.stats.speed - chassis.stats.speed;
  const guard = arms.stats.guard;
  const power = weapon.stats.power;
  return {
    hpMax: Math.round(78 + chassis.stats.armor * 16 + legs.stats.armor * 6),
    moveSpeed: round4(1.32 + speed * 0.14),
    jumpThrust: round4(4.7 + speed * 0.16),
    guardMax: Math.round(34 + guard * 12),
    powerMax: Math.round(56 + weapon.stats.power * 10),
    specialCost: Math.round(26 + weapon.stats.specialCost * 7),
    lightDamage: round4(5.5 + power * 1.15),
    heavyDamage: round4(10 + power * 2.05),
    specialDamage: round4(17 + power * 3.25)
  };
}

function round4(value: number): number {
  return Math.round(value * 1e4) / 1e4;
}

/** Rival mechs are fixed loadouts so balance is testable (PRD section 5). */
export interface RivalLoadout {
  readonly id: string;
  readonly displayName: string;
  readonly selection: BuildSelection;
}

export const RIVAL_LOADOUTS: readonly RivalLoadout[] = [
  {
    id: "sparrow",
    displayName: "SPARROW-9",
    // Fast legs + light hull: the keep-away rival pokes and retreats.
    selection: { chassis: 3, arms: 0, legs: 3, weapon: 0 }
  },
  {
    id: "bulwark",
    displayName: "BULWARK",
    // Heavy hull + big guards: the balanced rival trades blows.
    selection: { chassis: 1, arms: 2, legs: 2, weapon: 1 }
  },
  {
    id: "reaper",
    displayName: "REAPER-7",
    // Hard hitter: the rushdown rival wants to end it fast.
    selection: { chassis: 2, arms: 1, legs: 1, weapon: 2 }
  }
];

export function rivalLoadoutForBout(boutIndex: number): RivalLoadout {
  return RIVAL_LOADOUTS[boutIndex % RIVAL_LOADOUTS.length]!;
}

/**
 * Rematch aggression presets (PRD section 3): 0.35 keep-away -> 0.55 balanced ->
 * 0.8 rushdown. attackBias is the authored preset value surfaced in evidence; the
 * engine-facing knobs map onto createCombatAi's profiles plus spacing/reaction so
 * each preset produces measurably different fights.
 */
export interface AggressionPreset {
  readonly id: string;
  readonly label: string;
  /** Authored preset value from the PRD (0.35 / 0.55 / 0.8). */
  readonly attackBias: number;
  /** createCombatAi aggression profile. */
  readonly engineAggression: "defensive" | "balanced" | "aggressive";
  /** World units the rival tries to hold. */
  readonly preferredRange: number;
  readonly reactionFrames: number;
  readonly cooldownFrames: number;
}

export const AGGRESSION_PRESETS: readonly AggressionPreset[] = [
  {
    id: "keep-away",
    label: "KEEP-AWAY 0.35",
    attackBias: 0.35,
    engineAggression: "defensive",
    preferredRange: 2.9,
    reactionFrames: 16,
    cooldownFrames: 26
  },
  {
    id: "balanced",
    label: "BALANCED 0.55",
    attackBias: 0.55,
    engineAggression: "balanced",
    preferredRange: 2.05,
    reactionFrames: 12,
    cooldownFrames: 18
  },
  {
    id: "rushdown",
    label: "RUSHDOWN 0.8",
    attackBias: 0.8,
    engineAggression: "aggressive",
    preferredRange: 1.4,
    reactionFrames: 8,
    cooldownFrames: 10
  }
];

export function presetForBout(boutIndex: number): AggressionPreset {
  return AGGRESSION_PRESETS[boutIndex % AGGRESSION_PRESETS.length]!;
}

export function slotLabel(slot: MechSlot): string {
  return slot.charAt(0).toUpperCase() + slot.slice(1);
}

export function describeSelection(selection: BuildSelection): readonly PartDef[] {
  return selectedParts(selection);
}

export function optionsForSlot(slot: MechSlot): readonly PartDef[] {
  return PART_OPTIONS[slot];
}
