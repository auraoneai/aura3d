# Q-11-6 — lane 11 owns `AuraRendererQualityProfile` values in `app/rendererOptions.ts`

- **Requester:** lane 15 (PRD-15 T5.7, CCR-15-1)
- **Owner:** lane 11
- **SLA:** 2 working days
- **Files:** `packages/engine/src/agent-api/app/rendererOptions.ts`, `packages/engine/src/agent-api/nodes/types.ts` (interface `AuraRendererQualityProfile`)

## What

CCR-15-1 deprecated the renderer-selection vocabulary on the public surface.
`AuraRendererQualityProfile`'s root-facing value fields — `supportedInRoot`,
`blockedInRoot`, `claimBoundary`, `requestedFeatures`, `maxRecommendedDrawCalls` —
now carry `@deprecated` JSDoc pointing here, and are removed in 4.0.0 (T8.1).

The profile values themselves (which features a level supports/blocks, claim
boundaries, draw-call budgets) are quality-tier data. Per PRD-15 §6.6 that is
lane 11's `renderer.quality` (C-27) surface, not root config.

## Ask

Fold the profile values in `app/rendererOptions.ts` into the C-27
quality-level contract (`renderer.quality`), so `types.ts` can stop exporting
them at 4.0.0. No behaviour change is requested now — the deprecation is
annotation-only until T8.1 removal.

## Notes

- `AuraRendererMode` and `AuraRendererFallbackMode` are already `@deprecated`
  (CCR-15-1, Phase 4) and are also removed in 4.0.0.
- `AuraRendererQualityProfileId` stays: it is the id by which `quality`
  selects a level.
