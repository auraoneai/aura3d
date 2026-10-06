/**
 * @aura3d/game/art subpath (prd14, CONTRACTS.md §3.8). Re-exports C-35 until
 * `packages/game/src/art/` gets its own implementation.
 */

export {
  auditArtDirection
} from "@aura3d/engine-runtime/contracts";
export type {
  GameGenre,
  RebuildTier,
  GameAcceptance,
  GameBudgets,
  GameEntryV2,
  RouteHealthQualityGate,
  ArtDirectionViolation
} from "@aura3d/engine-runtime/contracts";
