# Q-13-11 → to:prd13 (qr-request, CONTRACTS §6.5)

**Files:** `packages/aura3d-cli/src/look/lint-static.ts` (13-owned),
`tests/unit/cli/look-lint.test.ts` (15-owned — its fixture input feeds the rule)
**Contract served:** PRD-15 T8.1 — `@aura3d/lean` is removed in 4.0.0. The
`look/lean-import` rule (~line 122) stays correct — a lean import is still an
error — but the rule text and the test fixture name may want renaming now that
the specifier can never resolve.

## Requested change (optional, owner decides)

Two options, either is acceptable to lane 15:

1. Keep the rule as-is — it correctly errors on any lingering `@aura3d/lean`
   import, which remains invalid in 4.0.0. No change needed; close this
   request.
2. If you want the diagnostic text freshened, update
   `lint-static.ts` line ~123's message and `look-lint.test.ts`'s
   `import { game } from "@aura3d/lean/game";` fixture + `look/lean-import`
   rule-id expectations together. (Renaming the rule id is a breaking change
   for suppressions, so option 1 is the smaller diff.)

## rg -l output

```
packages/aura3d-cli/src/look/lint-static.ts   (13-owned — this request)
tests/unit/cli/look-lint.test.ts              (15-owned — fixture only)
```

## Until merged

Nothing is blocked. The rule stays live and correct in 4.0.0; this request is
bookkeeping for the §6.6 audit trail.
