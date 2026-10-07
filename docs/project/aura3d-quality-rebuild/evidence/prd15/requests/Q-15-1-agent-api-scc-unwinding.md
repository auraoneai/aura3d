# Q-15-1 — unwind the agent-api 100-file SCC (lane 15 self-tracking)

**Filed by:** Lane 15 (PRD-15 T6.11)
**Status:** open — allowlisted until 2026-11-15 (`tools/arch-gates/allowlist.json`)
**Lane:** 15 (agent-api architecture is lane-15 owned)

## Debt

The `no-cycles` arch gate computes one SCC of size 100 spanning
`packages/engine/src/agent-api/{*,app/*,compiler/*,nodes/*,devtools/*}` —
the compiler/nodes/app leaf web created by the T3.1–T3.8 barrel split still
imports back into the aggregate graph, so nearly every leaf sits in a single
cycle. The T5.9 `lazyNamespace` deferral fixed the ESM *runtime* crash
(TDZ) but not the *static* import-graph cycle.

Edge-allowlisted leaf→barrel repoints (Q-02-1, Q-06-1, …) shrink the SCC as
owners land them; the remaining core is the nodes↔compiler↔app interplay
(`nodes/scene.ts` ↔ `compiler/*` ↔ `app/createAuraApp.ts` ↔ root leaves like
`GameRuntime.ts`/`AnimationDirector.ts`).

## What is NOT the answer

Splitting the barrel further or adding indirection does not break an SCC —
someone must invert actual dependency directions (compiler reads node
specs, nodes never read compiler internals; app composes, never is composed).

## Tracks

- T3.9/T3.14 put the gate into fail mode precisely so this debt is visible;
  this entry records the debt with expiry rather than hiding it.
- Candidate phase: dedicated PRD follow-up "agent-api SCC unwinding" or
  Phase 7/8 scope. Reported in `phase6-honest-packages.md` per T6.11's
  honest-evidence rule.
