# Q-12-8: prd12-gate.test.ts has 2 type errors (repo typecheck)

**To:** lane 12 (`tests/unit/contracts/impl/prd12-gate.test.ts` owner)
**From:** lane 15 (Phase 8 verification)
**Status:** OPEN — left as-is on qr/prd15-40-removal

## Errors (`pnpm exec tsc -p tsconfig.check.json --noEmit`)
1. `tests/unit/contracts/impl/prd12-gate.test.ts(48,50)` — `TS2345`:
   `number | undefined` passed where `number` is required.
2. `tests/unit/contracts/impl/prd12-gate.test.ts(81,22)` — `TS2322`: the
   constructed record's `verdict: "fail"` is not assignable to
   `PanelRoundAggregate`'s `GateVerdict` (its literal set excludes "fail").

These are the last 2 remaining typecheck errors in the repo (down from 19 on
merged main — the other 17 were un-barreled agent-api names now published on
"." by lane 15). Both are inside the test's own assertions; fixing requires
choosing the intended semantics (`!`/default vs the correct GateVerdict
literal), which is lane 12's call.
