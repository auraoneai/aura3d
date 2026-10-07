/**
 * @aura3d/game/art subpath (prd14, CONTRACTS.md §3.8). Re-exports the frozen
 * C-35 type surface from the engine contract and provides the real PRD 14
 * implementation of the provides list (`defineArtDirection`,
 * `auditArtDirection`, `snapshotForAudit`, `evaluateRequiredCondition`,
 * `canvasBlankCheck`), replacing the PR 0a `PENDING` stub.
 */

// Frozen C-35 surface (packages/engine/src/contracts/art.ts).
export type {
  GameGenre,
  RebuildTier,
  GameAcceptance,
  GameBudgets,
  GameEntryV2,
  RouteHealthQualityGate
} from "@aura3d/engine-runtime/contracts";

// Provides list (types + validator), this lane.
export {
  GAME_VISUAL_CATEGORY_LIST,
  GAME_GENRES,
  REBUILD_TIERS,
  defineArtDirection,
  AuraArtDirectionError
} from "./define";
export type {
  GameVisualCategory,
  AssetRole,
  ArtReference,
  ArtAssetRole,
  ArtLightingDesign,
  ArtFraming,
  GameArtDirection
} from "./define";

export { snapshotForAudit, assetManifestLike } from "./snapshot";
export type { ArtDirectionSnapshot, ArtDirectionSnapshotMaterial, AuraAssetManifestLike, AuraAssetManifestEntryLike } from "./snapshot";

export { auditArtDirection } from "./audit";
export type { ArtDirectionViolation, ArtDirectionRule, AuditArtDirectionOptions } from "./audit";

export { evaluateRequiredCondition } from "./acceptance/requiredConditions";
export type { RequiredConditionResult } from "./acceptance/requiredConditions";

export { canvasBlankCheck } from "./acceptance/canvasBlankCheck";
export type { CanvasMaskRect, CanvasBlankCheckLimits, CanvasBlankCheckResult } from "./acceptance/canvasBlankCheck";
