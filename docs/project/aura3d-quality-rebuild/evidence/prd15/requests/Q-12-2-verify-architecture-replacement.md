# Q-12-2 — `tools/verify-architecture` replaced by arch-gates fail mode

**From:** Lane 15 (PRD-15, Phase 7 T7.7)
**To:** Lane 12 (owner of `tools/external-parity-codebase-root-readiness`)
**Status:** filed

## What changed on the lane-15 branch

`tools/verify-architecture/` is deleted. Its gate (root-layout/scripts/exports assertion)
is superseded by `tools/arch-gates/` running in **fail mode** (`pnpm arch:check`,
`.github/workflows/qr-prd15-arch-gates.yml`, plus the arch-gates rules in ci/test lanes).
The `verify:architecture` package.json script remains as a compatibility alias that now
runs `pnpm arch:check`.

## Impact on your lane

`tools/external-parity-codebase-root-readiness/index.ts` still asserts the old surface in
three places:

- **L159** — expects the release command chain to contain `pnpm verify:architecture`
  (the script name still exists and resolves, so this keeps passing, but it now maps to
  arch-gates rather than the deleted tool).
- **L175 / L558** — fixture assertions that `tools/verify-architecture/index.ts` exists.
  These will fail once your lane rebases onto a tree containing this deletion.

## Requested owner action

Update `tools/external-parity-codebase-root-readiness` to assert `tools/arch-gates/index.ts`
(and `tests/reports/architecture.json` → whichever report path arch-gates emits) instead of
`tools/verify-architecture`. The `verify:architecture` script alias is kept deliberately so
no script-name reference needs to change.

Lane 15 cannot edit your tool (cross-lane file), so this is filed as a qr-request per the
ownership rules rather than patched in place.
