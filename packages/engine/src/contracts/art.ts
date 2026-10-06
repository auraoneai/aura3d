/**
 * C-35 — art direction and game acceptance schema (CONTRACTS.md). Provider: PRD 14.
 * Moves to `packages/game/src/art/contracts.ts` when PRD 09 creates packages/game;
 * `@aura3d/game/art` re-exports this file.
 */

import type { AuraQualityTier } from "@aura3d/rendering/contracts";

export type GameGenre = "fighting" | "falling-blocks" | "platformer" | "racing" | "golf-physics" | "lander" | "twin-stick" | "orbital-puzzle" | "vehicle-delivery" | "rhythm-runner" | "mech-fighting" | "pinball" | "basketball" | "stealth" | "underwater-salvage" | "flight" | "billiards" | "arena-shooter";
export type RebuildTier = "S-presentation" | "S-world" | "F";
export interface GameAcceptance { readonly minOverall: 7; readonly minVisualCategory: 5; readonly critical: Readonly<Record<string, number>>; readonly minNonVisual: { readonly sound_audio: 6; readonly controls: 7; readonly game_feel: 6.5; readonly loading_transitions: 6; readonly physics_feel?: 6 }; }
export interface GameBudgets { readonly transferToPlayableMB: number; readonly routeJsGzipKB: number; readonly drawCalls: Readonly<Record<AuraQualityTier, number>>; readonly gameLogicCpuMs: number; }
export interface GameEntryV2 { readonly wave: 0 | 1 | 2 | 3 | 4; readonly rebuildTier: RebuildTier; readonly artDirection: string; readonly requiredConditions: readonly { readonly shot: string; readonly expr: string; readonly deadlineMs: number }[]; readonly canvasBlankCheck: { readonly maxDarkFraction: number /* <= 0.97 */; readonly minDistinctColors: number; readonly reason?: string }; readonly acceptance: GameAcceptance; readonly budgets: GameBudgets; }
export interface RouteHealthQualityGate { readonly status: "unreviewed" | "in-rebuild" | "rejected" | "accepted" | "withdrawn"; readonly scorecard?: string; readonly acceptedAt?: string; readonly acceptedBy?: readonly string[]; }
// GameArtDirection, defineArtDirection, auditArtDirection, ArtDirectionSnapshot, ArtDirectionViolation: as PRD 14 provides list (frozen there).

export interface ArtDirectionViolation { readonly rule: string; readonly message: string; readonly nodes?: readonly string[]; }
/** PR 0a stub: returns [] with a PENDING marker until PRD 14 implements it. */
export function auditArtDirection(_direction: unknown, _snapshot: unknown): readonly (ArtDirectionViolation | "PENDING")[] {
  return ["PENDING"];
}
