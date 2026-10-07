# Q-10-1 — BiomeEnvironmentRegistry.ts relocation + VegetationScatter.ts decision

**Status:** OPEN
**Requesting lane:** 15 (PRD-15 Phase 6, honest packages T6.5)
**Owning lane:** 10 (PRD-10, world-building/environment systems)

## Request (per PRD request ledger)

1. Relocate `packages/environments/src/BiomeEnvironmentRegistry.ts`.
2. Decide orphan `VegetationScatter.ts` (delete vs keep/wire).

## What lane 15 actually found

- `packages/environments/src/BiomeEnvironmentRegistry.ts` **does not exist** and
  never existed in this checkout (no file by that name anywhere in `packages/`;
  only PRD-10/PRD-15/autopsy docs mention it). Nothing to relocate. If lane 10
  lands it later, it should not go into a revived `packages/environments` — the
  package is deleted in this PR; suggested home is lane 10's own package space.
- `packages/rendering/src/VegetationScatter.ts` exists (barrel-only orphan per
  T5.4's D-10 list — not 15-owned, so left untouched). Decision is lane 10's:
  delete it, or wire it and keep it.

For context: every other file under `packages/environments/` was 15-owned and
has been moved to `packages/engine/src/devtools/environments/` (see Q-02-2).
