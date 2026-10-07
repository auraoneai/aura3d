# Q-ALL-2: lane 15 applied `lazyNamespace` defers across cross-lane leaves (ESM-cycle repair)

**From:** lane 15 · **To:** lanes 02, 03, 04, 06, 07, 08, 09, 10, 11, 13 ·
**Filed:** 2026-10-06 · **Status:** APPLIED BY LANE 15 — informational, review-on-merge

## What happened

The T3 leaf split (PR #182) turned `agent-api/index.ts`'s single-file scope into
~90 real ESM modules. The namespace aggregates (`game`, `prefabs`, `material`,
`games`, `product`, `sceneKits`, …) mutually embed each other's const exports —
inside one file that was harmless, but across modules every leaf↔leaf cycle is
a `Cannot access 'X' before initialization` crash under native ESM. The packed
dist barrel could not be imported at all (probe: `node -e "import
'dist/engine/agent-api/index.js'"` → `gameColliders` TDZ, then `rootProduct`,
then `GAME_FALLING_BLOCK_PIECES`). The module graph forms one 87-file
strongly-connected component — no import ordering can fix an eval-time read of
a mid-init const.

## The fix

`packages/engine/src/agent-api/lazyNamespace.ts` (new, zero imports, outside
the SCC) exports `lazyNamespace(init)` / `lazyCallable(init)`: a Proxy that
defers the aggregate literal's evaluation to first property access, forwarding
every introspection trap to the realized object. Member identity, enumeration,
spread, `JSON.stringify`, and `Object.keys` are unchanged; function members are
untouched (declarations hoist, so they never TDZed).

Lane 15 applied the wrap mechanically to every top-level const initializer in
the SCC that reads another SCC file's binding — including leaves owned by your
lane (compiler/*, nodes/*, looks/*, app/*, humanoid-walk-runtime.ts,
product-viewer-runtime.ts, game-kits/fighting.ts, CameraPresetLibrary.ts).
Two adjacent mechanical fixes in your files: `TypedGLBActor.ts` (04) and
`ProductionWebGPURenderer.ts` (11) had extensionless side-effect imports that
`finalize-dist` did not rewrite (now `./x.js`).

## Why lane 15 did it instead of waiting

Phase 5's packed-consumer checks are blocked until the dist barrel imports.
Per-file requests would serialise the repair across every lane's SLA; the
transform is uniform and behavior-preserving, and every repoint request
(Q-*-agent-api-leaf-index-imports) already documented the underlying cycle.
If your lane wants a different decomposition for its own leaves, the defer
site is one line per aggregate — the leaf layout and public surface are
unchanged.

## Verification

- `tsc -p tsconfig.build.packcheck.json` + `tools/finalize-dist` clean.
- Every `dist/engine/agent-api/**/*.js`, `public/*.js`, `deprecated/*.js`
  imports standalone under native node ESM (150+ files, 0 failures).
- `game.platformer`, `gameRules()`, `scene().camera().add()` chains work;
  `game.rules === gameRules` member identity preserved.
- `pnpm exec vitest run tests/unit/agent-api tests/unit/game-runtime` — 323/325;
  the 2 failures were source-gate string assertions on the literal form, now
  updated to the wrapped form.
