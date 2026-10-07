# Q-07-3: `nodes/effects.ts` imports values from `@aura3d/rendering` — layering violation

**From:** lane 15 · **To:** lane 07 · **Filed:** 2026-10-06 · **Status:** OPEN

PRD-15 §6.3 layering: `nodes/` may not import `@aura3d/rendering` values
(type-only imports are allowed). The T3.14 `layering` arch gate is in fail
mode and flags your leaf:

- `packages/engine/src/agent-api/nodes/effects.ts` → `@aura3d/rendering`
  (value import)

## Requested change

Either move the value dependency behind a nodes-owned seam (nodes define
intent; rendering owns execution — inject or callback), or convert to a
type-only import. Until then the edge sits in
`tools/arch-gates/allowlist.json` (expires 2026-10-20) so the gate stays green.

SLA: 2 working days per CONTRACTS §6.5 — we don't block on it.
