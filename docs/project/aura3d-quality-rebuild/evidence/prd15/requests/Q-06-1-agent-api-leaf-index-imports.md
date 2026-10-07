# Q-06-1: lane-06 agent-api leaves still import `../index.js` — repoint to leaf sources

**From:** lane 15 · **To:** lane 06 · **Filed:** 2026-10-06 · ****Status:** APPLIED BY LANE 15 (2026-10-06)

PRD-15 T3.1 split `agent-api/index.ts` (~14k lines) into leaf modules; the
barrel is now named re-exports only. Lane-15-owned leaves were repointed to
import from the leaf that owns each name; your lane's leaves still pull from
`../index.js` (or `./index.js` at the root level):

- `packages/engine/src/agent-api/compiler/animation.ts`

## Why it matters

- Each leaf→barrel edge is a 2-cycle with the barrel (`index → leaf` via
  `export {} from`, `leaf → index` via import). Type-only imports are safe,
  and function-body reads survive via live bindings — but anything read during
  the leaf's own module evaluation (object literals, `const x = name` aliases)
  hits TDZ/undefined under native ESM depending on load order.
- T3.14's `layering` arch gate and the `no-cycles` gate treat these as
  violations; they're on dated allowlists for now.

## Requested change

Repoint each imported name to the module that owns it — every name's home leaf
is visible in `packages/engine/src/agent-api/index.ts`'s own
`export { name } from "./<dir>/<file>.js"` clauses. Mechanical, no behavior
change; the barrel's public surface is unchanged.

SLA: 2 working days per CONTRACTS §6.5 — we don't block on it.

## Applied already (your file, minimal repoint)

`packages/engine/src/agent-api/humanoid-walk-runtime.ts` read `character` and
`sceneKits` at module evaluation (`export const character = rootCharacter`,
`rootSceneKits.humanoidWalk(...)` inside a body is fine but the const alias
made it order-fragile), so I repointed it myself:

- `character as rootCharacter` → `./nodes/character.js`
- `sceneKits as rootSceneKits` → `./nodes/sceneKits.js`
- `AuraSceneBuilder` → `./nodes/scene.js`; `AuraApp`, `AuraAppTarget`,
  `AuraCreateAppOptions`, `AuraSceneKit` → `./nodes/types.js`
- `export { createAuraApp }` → `./app/createAuraApp.js`

Same code, same exports — revert freely if your PRD wants it expressed
differently.

## Resolution

Lane 15 applied this repoint directly as part of the Phase-5 ESM-cycle repair
(the leaf→barrel edges were the load-bearing side of the TDZ crashes). The
change is the mechanical repoint this request describes — every imported name
now comes from the leaf that owns it. Filing left in place so the owner can
review; the request no longer blocks them.
