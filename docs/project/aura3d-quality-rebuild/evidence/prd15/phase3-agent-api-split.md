# Phase 3 — `agent-api/index.ts` split evidence (T3.1–T3.8)

**Date:** 2026-10-06 · **Branch:** `qr/prd15-agent-api-split` (stacked on
`qr/prd15-renderer-imports`)

## What landed

`agent-api/index.ts`: 13,934 → 1,496 lines. 61 leaf files written under
`agent-api/{nodes,compiler,app,devtools}/` by a deterministic TypeScript-AST
mover (single splice commit — deviation from T3.3's per-builder commits; every
statement text is byte-verbatim via `getFullStart()` ranges, imports
auto-derived by free-identifier scan).

- `nodes/types.ts` — the frozen types section, moved under CCR-15-2 (CONTRACTS
  §3.2 sentence amended; `index.ts` re-exports every name).
- `nodes/builder.ts` — `AuraNodeBuilder` (T3.2).
- `nodes/*.ts` — all 15-owned builders per §3.2 (`assets`, `model`,
  `primitives`, `text3d`, `groups`, `interactions`, `ui`, `labels`, `scene`,
  `physics`, `charts`, `city`, `solar`, `prefabs/*`, `animation`, `character`,
  `product`, `neon`, `games`, `editor`, `geometry`, `visualScripting`,
  `materialTools`, `gameFeel`, `timeline`, `promptPlans`,
  `effects.composite.ts`, `environments.composite.ts` — composites keep the
  `effects = {...vfx, ...post, ...lighting}` / `environments = {...}` spreads).
- `devtools/*` — `lazySystems`, `sceneKitDiagnostics`, `runtimeEvidence`,
  `routeHealth`, `sceneEvidence`, `performanceEvidence`, `diagnostics`,
  `diagnosticPreview`, `rendererDiagnostics` (T3.5).
- `app/*` — `errors`, `liveApps`, `createAuraGameRuntime`, `screenshot`,
  `frameLoop`, `mountRenderer`, `canvas`, `routeState`, `platform` (T3.6).
- `compiler/*` — `observations`, `text`, `primitives` (appended to the PR 0b-1
  carve), `actors`, `color`, `effects`, `camera`, `webglRuntime`,
  `gltfRuntime`, `geometry`, `labels`, plus `sceneMath.ts` (T3.7/T3.8).

`sceneMath.ts` is a Phase-3 addition, not in §6.3: 22 private helpers
(`multiply4`, `translation`, `scaling`, `rotationXYZ`, `isPositiveFinite`,
`primitiveSize`, `animatedPosition`, `mixRgb`, `scaleRgb`, `clampRgb`, `mix3`,
`flattenSceneNodes`, `normalizeQuaternion`, `slerpQuaternion`,
`rotationQuaternion`, `transformPositions`, `boundsFromPositions`, `mergeBounds`,
`applyAuraParentTransform`, `composeAuraTransform`, `hasAuraTransform`,
`scaleToVec3`) moved out of the pending Q-01-5 range because they are
referenced by other `compiler/`/`nodes/` leaves and cannot stay private in the
public barrel. 15-owned; lane 01 may absorb them when it takes Q-01-5.

## Pending (per spec's own contingency)

- **Q-01-5** — 13 statements (`createViewProjection`, `createModelMatrix`,
  `shouldNormalizeModelNode`, `isModelTransformAnimationClip`,
  `isOrthographicCameraMode`, `identity4`, `colorToRgb`, `clamp01`, `normalize3`,
  `flattenSceneSnapshot` + private `transformNormals`, `resolveModelFitScale`,
  `animatedRotation`) stay in `index.ts` until lane 01 moves them to
  `compiler/sceneGraph.ts`. Request filed at
  `evidence/prd15/requests/Q-01-5-scenegraph-range.md`; `max-file-lines` gate
  config will list the range by line.
- **Q-07-1** — `Decals.ts` barrel imports → `./nodes/builder.js` +
  `./nodes/types.js`. Filed at `evidence/prd15/requests/Q-07-1-decals-builder-import.md`;
  `no-cycles` allowlists the `Decals.ts ↔ index.ts` SCC until it lands.
- **CCR-15-2** — types-section move filed as the `ccr`-labelled PR; CONTRACTS.md
  §3.2 sentence amended in the same change.

## Rework (post-first-push, commit 2)

The mechanical split was reworked after runtime probes exposed eval-time
capture edges the static map missed:

- **`export *` removed entirely** — all 2,093 names exported explicitly via
  252 topo-sorted `export {}`/`export type {}` clauses; index.ts is 412 lines
  (the overage vs the ≤300 T3.9 target is the pending Q-01-5 scenegraph range,
  lines ~15–140, excluded by line in the gate config).
- **Shim blocks**: `nodes/game/index.ts` composes the `game` object literal at
  module-eval from 16 presentation factories it imports from `../../index.js`
  → captured `undefined` mid-cycle. Fixed via `export function` shims in
  index.ts (hoisted ⇒ defined during index's own eval); clause entries removed.
- **34 lane-15-owned leaves repointed** from `../index.js`/`./index.js` to the
  leaf owning each name (name→module map derived from the barrel's own
  clauses). Foreign leaves filed as Q-02-1, Q-03-1, Q-04-2, Q-06-1, Q-07-2,
  Q-08-1, Q-09-2, Q-10-1, Q-11-2, Q-13-8 (`requests/`); owner-06's
  `humanoid-walk-runtime.ts` was repointed here and documented in Q-06-1.
- **Tooling fixes**: `tools/deletion-safety` `bindsSymbol` now treats
  `export interface X {…}` declarations as non-import/export edges (was
  reading member lists as binding lists); `tools/packed-consumer-check`
  emits a consumer `vite.config.ts` externalizing `@loaders.gl/*` until
  Q-05-8 lands the real dep; `tools/claim-lineage` root-surface probe scans
  the agent-api tree instead of the single index.ts.
- **Parity re-verified**: 0 names missing vs pre-split `5cf3a712` reference
  (shim fns replace clause names 1:1).


## T3.9/T3.14 — arch gates in fail mode (2026-10-06, commit 3)

`tools/arch-gates` gained three rules plus an `enforced` flag: `max-file-lines`
(≤2,500 per `packages/*/src` .ts; index.ts capped at 300 excluding the pending
Q-01-5 range recorded by line — lines 28–162 — in the rule config),
`layering` (PRD §6.3 verbatim: nodes→{compiler,app,devtools,@aura3d/rendering
values}, compiler→{app,devtools}, all→devtools except `public/devtools.ts`),
and `no-cycles` (Tarjan SCC over value edges inside agent-api). Enforced
findings exit 1 regardless of `--strict`; allowlisted ones warn.

Real violations found and dispositioned:

- **Fixed (15-owned):** `compiler/*`→`app/errors.ts` broken by moving
  `AuraRuntimeError` verbatim to `compiler/errors.ts` (app re-exports);
  all `*→devtools/*` edges collapsed through the new `public/devtools.ts`
  leaf (the single legal importer); `nodes/types.ts` (2,871 > cap) split —
  tail decls moved verbatim to `nodes/types/runtime.ts`, types.ts now 2,322.
- **Allowlisted to 2026-10-20 (foreign-owned):** 19 foreign leaf→index
  no-cycles edges (the filed Q-* requests), the 104-member intra-leaf SCC
  and the `nodes/prompt/` pair SCC (pre-existing coupling surfaced by the
  split), 9 layering edges — filed Q-07-3, Q-09-3, Q-10-2, Q-11-3.
- Three 15-owned `nodes/{sky,text3d,weather}.ts` → `@aura3d/rendering` value
  imports are allowlisted under this lane's own debt (evidence trail).

`pnpm exec tsx tools/arch-gates/index.ts`: **0 enforced findings** (55 warns).
Fixture tests `tests/qr/prd15/arch-gates-rules.test.ts` 9/9 — bad/clean
fixtures per rule, the live ≤300-line assertion (277 effective), and a
zero-enforced sweep of the real tree.

## Verification

- `tsc -p tsconfig.build.json --noEmit`: **0 errors** (re-verified post-rework).
- Public surface parity: **0 names missing** vs the pre-split `5cf3a712`
  reference (`published-union` test green: in-repo and published `.` export
  sets identical).
- `eslint` over all 120 changed files: clean.
- `qr-ownership/check.mjs`: every new leaf resolves to owner 15 except
  `compiler/lights.ts` (owner 02 mapping rule — new file created by this
  split; documented in CCR-15-2).
- Unit suite: every residual failure is identical-or-better vs `origin/main`
  (`/tmp/a3d-main` worktree, same file set) — env/artifact ENOENTs for
  CI-generated `tests/reports/**` fixtures and the contract-stub marker scan
  (63 vs main's 66). No split-caused regressions.
- `public-game-geometry` 11/11, `published-union` 1/1, `converted-feature-docs`
  5/5, `deletion-safety` 16/16 — the probes that caught the rework.

## NOT-RUN

- §16.1 6-app before/after captures — no app-capture lane exists yet
  (`qr-prd15-captures.yml` is Phase-5 work); unit + tsc are the local evidence.
- Full vitest suite (`tests/unit` beyond `engine/`) — same artifact-dependent
  classes; engine lane run above is the relevant slice.
