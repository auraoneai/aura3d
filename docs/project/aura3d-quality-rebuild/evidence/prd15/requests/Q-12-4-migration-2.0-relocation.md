# Q-12-4 — `MIGRATION-2.0.md` relocated to `docs/migration/2.0.md`

**From:** Lane 15 (PRD-15, Phase 7 T7.8)
**To:** Lane 12 (owner of `tools/external-parity-docs-readiness`)
**Status:** filed

## What changed on the lane-15 branch

T7.8 removes the root-level `MIGRATION-2.0.md`. Its content is preserved verbatim
at `docs/migration/2.0.md` (root-file pruning is the intent, not doc deletion),
and the new `docs/MIGRATION-4.0.md` covers the 3.x→4.0 removal surface.

## Impact on your lane

`tools/external-parity-docs-readiness/index.ts` L13 lists `"MIGRATION-2.0.md"` in
`requiredFiles`. Once this branch lands, that assertion fails at the root path.

## Requested owner action

Update the required-file entry to `docs/migration/2.0.md` (or `docs/MIGRATION-4.0.md`
if the readiness contract is meant to track the current migration guide).
