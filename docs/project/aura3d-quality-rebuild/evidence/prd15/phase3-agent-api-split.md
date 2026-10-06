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

## Verification

- `tsc -p tsconfig.build.json --noEmit`: **0 errors** (was 0 pre-move).
- Public surface parity: **785/785** exported names identical before/after
  (AST-level export-set comparison; nothing added, nothing missing).
- `eslint packages/engine/src/agent-api/**`: clean.
- `qr-ownership/check.mjs`: every new leaf resolves to owner 15.
- Unit suite `tests/unit/engine`: 465/471 pass. 6 failures, all
  environment-dependent artifact reads (`showcase-skyline-runner.json`,
  `production-runtime-external-consumer(-render).json` — Playwright-produced
  reports absent locally); `material-physical-mount-p3` updated to read
  `compiler/primitives.ts` (15-owned test) — 2/2 green.
- `Decals.ts:287` TS2322 seen mid-run was a cascade of the broken leaf imports;
  resolved — `Decals.ts` untouched (07-owned).

## NOT-RUN

- §16.1 6-app before/after captures — no app-capture lane exists yet
  (`qr-prd15-captures.yml` is Phase-5 work); unit + tsc are the local evidence.
- Full vitest suite (`tests/unit` beyond `engine/`) — same artifact-dependent
  classes; engine lane run above is the relevant slice.
