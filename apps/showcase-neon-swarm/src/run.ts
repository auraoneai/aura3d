/**
 * Neon Swarm's finite five-stage campaign contract.
 *
 * This module is deliberately pure: the live route, unit fixtures, browser
 * evidence, and retained outcome hash all consume the same progression and
 * upgrade rules. Renderer state never decides whether a run was completed.
 */
import type { PlayerUpgrades } from "./player";
import type { PickupKind } from "./pickups";

export const MAX_CAMPAIGN_WAVES = 5;
export const FINALE_SURVIVAL_SECONDS = 46;

export type CampaignStage = "opening" | "upgrade" | "compression" | "elite" | "finale";
export type CampaignTerminalState = "intermission" | "complete";

const STAGES: readonly CampaignStage[] = ["opening", "upgrade", "compression", "elite", "finale"];
const ARENA_INSETS: readonly number[] = [0, 0, 3.5, 4.5, 5.5];

export function campaignStage(wave: number): CampaignStage {
  const index = Math.max(0, Math.min(MAX_CAMPAIGN_WAVES - 1, Math.floor(wave) - 1));
  return STAGES[index]!;
}

/** Shrinks each side of the playable rectangle from wave three onward. */
export function arenaInsetForWave(wave: number): number {
  const index = Math.max(0, Math.min(MAX_CAMPAIGN_WAVES - 1, Math.floor(wave) - 1));
  return ARENA_INSETS[index]!;
}

export function isFinaleWave(wave: number): boolean {
  return Math.floor(wave) === MAX_CAMPAIGN_WAVES;
}

export function stateAfterWaveClear(wave: number): CampaignTerminalState {
  return isFinaleWave(wave) ? "complete" : "intermission";
}

/** Apply exactly one intermission choice; returns a copy for pure fixtures. */
export function upgradedPlayer(current: Readonly<PlayerUpgrades>, kind: PickupKind): PlayerUpgrades {
  const next: PlayerUpgrades = { ...current };
  if (kind === "fire-rate") next.fireRateMultiplier = Math.max(0.34, next.fireRateMultiplier * 0.74);
  else if (kind === "dash-cooldown") next.dashCooldownMultiplier = Math.max(0.35, next.dashCooldownMultiplier * 0.7);
  else next.shieldCharges += 1;
  return next;
}

export interface OutcomeHashInput {
  readonly seed: number;
  readonly state: "dead" | "complete";
  readonly wave: number;
  readonly score: number;
  readonly kills: number;
  readonly maxCombo: number;
  readonly hp: number;
  readonly upgrades: Readonly<PlayerUpgrades>;
  readonly waveChecksums: readonly number[];
}

/**
 * Stable FNV-1a digest of gameplay truth. No clock, DOM, renderer diagnostic,
 * or floating-point frame timestamp enters the digest.
 */
export function outcomeHash(input: OutcomeHashInput): string {
  const token = [
    input.seed >>> 0,
    input.state,
    Math.floor(input.wave),
    Math.floor(input.score),
    Math.floor(input.kills),
    Math.floor(input.maxCombo),
    Math.floor(input.hp),
    input.upgrades.fireRateMultiplier.toFixed(6),
    input.upgrades.dashCooldownMultiplier.toFixed(6),
    Math.floor(input.upgrades.shieldCharges),
    input.waveChecksums.map((value) => value >>> 0).join(",")
  ].join("|");
  let hash = 0x811c9dc5;
  for (let i = 0; i < token.length; i += 1) {
    hash ^= token.charCodeAt(i);
    hash = Math.imul(hash, 16777619) >>> 0;
  }
  return "fnv1a32-" + hash.toString(16).padStart(8, "0");
}
