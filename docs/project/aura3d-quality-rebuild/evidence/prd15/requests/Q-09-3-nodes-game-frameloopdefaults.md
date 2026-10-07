# Q-09-3: `nodes/game/index.ts` imports `app/frameLoopDefaults.ts` — layering violation

**From:** lane 15 · **To:** lane 09 · **Filed:** 2026-10-06 · **Status:** OPEN

PRD-15 §6.3 layering: `nodes/` may not import `app/` values. The T3.14
`layering` arch gate flags:

- `packages/engine/src/agent-api/nodes/game/index.ts` →
  `../app/frameLoopDefaults.ts` (value import)

## Requested change

Frame-loop defaults are app-layer policy; the nodes layer should receive them
via injection or read them from a nodes-owned config surface. Options: move
the defaults into a `nodes/`-owned module, or have `app/` pass them in. Until
then the edge is in `tools/arch-gates/allowlist.json` (expires 2026-10-20).

SLA: 2 working days per CONTRACTS §6.5 — we don't block on it.
