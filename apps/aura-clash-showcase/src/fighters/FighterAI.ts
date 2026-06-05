import type { FighterControllerInput } from "./FighterController";
import type { FighterRuntimeState } from "../state/GameTypes";

export interface FighterAIProfile {
  id: string;
  label: string;
  preferredRange: number;
  aggression: number;
  guardChance: number;
  specialThreshold: number;
}

export const defaultAIProfiles: FighterAIProfile[] = [
  {
    id: "rook-pressure",
    label: "Rook pressure",
    preferredRange: 0.85,
    aggression: 0.66,
    guardChance: 0.24,
    specialThreshold: 70,
  },
  {
    id: "nyx-counter",
    label: "Nyx counter",
    preferredRange: 1.1,
    aggression: 0.48,
    guardChance: 0.38,
    specialThreshold: 64,
  },
  {
    id: "jin-space",
    label: "Jin space control",
    preferredRange: 1.25,
    aggression: 0.52,
    guardChance: 0.28,
    specialThreshold: 60,
  },
];

export function chooseFighterAIInput(
  ai: FighterRuntimeState,
  target: FighterRuntimeState,
  atMs: number,
  profile: FighterAIProfile = defaultAIProfiles[0]!,
): FighterControllerInput {
  const distance = Math.abs(ai.position.x - target.position.x);
  const cycle = Math.sin(atMs / 470) * 0.5 + 0.5;
  const move: -1 | 0 | 1 =
    distance > profile.preferredRange + 0.18 ? (ai.position.x > target.position.x ? -1 : 1) : distance < profile.preferredRange - 0.2 ? (ai.position.x > target.position.x ? 1 : -1) : 0;

  return {
    move,
    jump: false,
    dash: distance > profile.preferredRange + 0.7 && cycle > 0.68,
    guard: cycle < profile.guardChance,
    light: distance <= profile.preferredRange && cycle > 1 - profile.aggression,
    heavy: distance <= profile.preferredRange * 0.92 && cycle > 0.78,
    special: ai.stats.aura >= profile.specialThreshold && distance <= profile.preferredRange * 1.15 && cycle > 0.82,
  };
}
