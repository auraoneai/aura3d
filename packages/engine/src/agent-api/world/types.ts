/**
 * PRD-10 §7.1.1 — shared types for the `world.*` agent API surface.
 * C-26 frozen members are re-exported from `contracts/world.ts`, not redeclared.
 */
export type {
  AuraBiomeId,
  AuraBiomeRig,
  AuraWindSpec,
  AuraWorldQueries,
  GroundRaycaster,
  AuraHeightQuery
} from "../../contracts/world.js"; // C-26
export type AuraWorldQualityTier = import("../../contracts/world.js").AuraWorldQualityTier; // = C-27 AuraQualityTier

export interface AuraTierValue<T> {
  readonly low?: T;
  readonly medium?: T;
  readonly high?: T;
  readonly ultra?: T;
}
/** Scalar applies to all tiers; object form resolves against `app.quality.tier` (C-27). */
export type AuraTiered<T> = T | AuraTierValue<T>;

export interface AuraWorldNodeBase {
  readonly name?: string;
  /** Diagnostics: counted from submitted draws, never from node metadata. */
  readonly diagnosticsLabel?: string;
}
