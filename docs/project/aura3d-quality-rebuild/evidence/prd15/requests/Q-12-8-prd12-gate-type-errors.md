# Q-12-8: prd12-gate.test.ts has 2 type errors (repo typecheck)

**To:** lane 12 (`tests/unit/contracts/impl/prd12-gate.test.ts` owner)
**From:** lane 15 (Phase 8 verification)
**Status:** FIXED ON qr/prd15-40-removal (courtesy fix; semantics-preserving)

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

## Resolution (lane 15, same branch)
1. Line 48: `G_REG_FLOORS.flip` → `G_REG_FLOORS.flip!` — the key is a fixed
   member of the const floor map; the `!` narrows `number | undefined` without
   changing the assertion.
2. Line 79: `verdict: "fail"` → `verdict: "regression"` — `"fail"` is not a
   `GateVerdict` literal; `"regression"` is the canonical non-passing verdict
   and exercises the identical refusal path under test.
