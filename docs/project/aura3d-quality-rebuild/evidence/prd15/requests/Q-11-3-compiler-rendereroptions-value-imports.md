# Q-11-3: `compiler/*` imports `app/rendererOptions.ts` values — layering violation

**From:** lane 15 · **To:** lane 11 · **Filed:** 2026-10-06 · **Status:** OPEN

PRD-15 §6.3 layering: `compiler/` may not import `app/` values. The T3.14
`layering` arch gate flags three edges into `app/rendererOptions.ts`:

- `packages/engine/src/agent-api/compiler/observations.ts`
- `packages/engine/src/agent-api/compiler/primitives.ts`
- `packages/engine/src/agent-api/compiler/renderer.ts`

All import `normalizeTextureBudgetBytes` (owned by your lane, per
QR_OWNERSHIP `app/rendererOptions.ts` → 11).

## Requested change

The helper is a compiler-side concern consumed by app/; the clean fix is
either (a) move `normalizeTextureBudgetBytes` (and any siblings the three
importers need) into a `compiler/`-visible home, or (b) invert the dependency
so app/ provides the value at call time. Until then the edges sit in
`tools/arch-gates/allowlist.json` (expires 2026-10-20).

SLA: 2 working days per CONTRACTS §6.5 — we don't block on it.
