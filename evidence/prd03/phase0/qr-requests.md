# Lane 03 Phase 0 — qr-request / ccr tracking

Requests lane 03 cannot satisfy inside its own ownership boundary
(CONTRACTS.md §4). Status column is updated as issues are answered.

| # | To | Ask | Blocked on | Status |
|---|---|---|---|---|
| QR-03-1 (filed #787) | prd15 (QR_OWNERSHIP.json owner) | Add per-lane test slots so `tests/qr/prdNN/**`, `tests/unit/**/prdNN-*.test.ts`, `tests/browser/post-*`/`prdNN-*` specs resolve to their lane instead of default owner 15. PRD-03 §305 assigns `tests/qr/prd03/**` and `tests/unit/rendering/post-*.test.ts` to lane 03 explicitly; the current checker resolves them to 15, so Phase 0 tests landed under `tests/unit/contracts/impl/prd03-*.test.ts` and `tests/browser/qr-prd03-capture-dsf2.spec.ts` (both resolve to 03). | Nothing — workaround in place; `tests/qr/prd03/` moves back once the map accepts it | FILED #787 |
| QR-03-2 | prd12 (router/scenes custodian) | Route lane scene ids (`<owner>-<slug>` from `shared/registry.ALL_SCENES`) in `benchmarks/quality-rebuild/main.ts` and `shared/scenes.ts`: (a) `getSceneSpec` must fall back to `ALL_SCENES` when `sceneSpecs` misses; (b) `window.__QR_SCENES__` should be `sceneIds ∪ ALL_SCENES` (or expose lane ids separately); (c) the adapter glob needs `aura3d/scenes/**/*.ts` + `three/scenes/**/*.ts` and a lookup that resolves `./${engine}/${sceneId}.ts` then `./${engine}/scenes/${sceneId.split('-')[0]}/${sceneId}.ts`. | `prd03-*` lane scenes cannot be captured until this lands (adapters and specs are committed and registered) | OPEN |
| QR-03-3 | owner of `tools/bundle-size/` (default 15) | `check:bundle-size` is broken on main since PR 0a (2fa08680): `aura3d-source-alias` in `tools/bundle-size/index.ts` has no entry for `@aura3d/rendering/contracts` or `@aura3d/rendering/contracts/flags.state`, so esbuild fails on `createAuraApp.ts:15`, `contracts/app.ts:7`, `contracts/diagnostics.ts:7`, `contracts/flags.ts:13`, `agent-api/postBridge.ts:28`. Needs alias rows → `packages/rendering/src/contracts/index.ts` and `packages/rendering/src/contracts/flags.state.ts`. | `evidence/prd03/phase0/bundle.json` has the gated-target list but no measured baseline (recorded as targets-recorded/blocked-on-tool) | OPEN |
| QR-03-4 | prd12 (Q-12-1) | `desktop-1440x900@2` viewport + `backingRatio = w / cssW` in the slim capture report. Until then `tests/browser/qr-prd03-capture-dsf2.spec.ts` records `canvas.width / clientWidth` per game route on GitHub macos-14. | DSF2 baselines are ratio-only until this lands | OPEN |
| QR-03-5 | prd15 | C-39 codemod dispatch: `packages/aura3d-cli/src/cli.ts` has no `codemod` verb, so `registerCodemod(postV2Codemod)` (registered in `packages/aura3d-cli/src/commands/prd03/index.ts`) is unreachable from the CLI today. Needs the `codemod` command wired to `commands/registry.ts`. | post-v2 codemod is registered + unit-tested but not CLI-invocable | OPEN |

## CCR tracking (declared per CONTRACTS.md §4)

| # | Path touched | Change | Status |
|---|---|---|---|
| CCR-03-7 | `packages/engine/src/agent-api/compiler/renderInput.ts` (owner 15) | Review P2 on PR #133: `createProductionRuntimePostprocess` gains optional `attach?: {canvas}` and `renderInput.ts` passes `{canvas}` so the submitted-record store keys records by the owning app's canvas — a second app's compile can no longer overwrite the first app's `post`/`exposure` diagnostics. Additive only; flag-off unchanged. | LANDED (this PR) |

## Flag-off guarantee notes

- `registerDiagnosticsSection` sections collect unconditionally (by C-31
  design) — `post`/`exposure` now report what the **legacy** chain executes
  with the flag off; this is the PRD-required truthful-diagnostics behavior,
  not a pixel change.
- `Prd03PostSurface` with the flag off is a strict no-op (same behavior as
  `StubPostSurface`).
- `PRD03_DIAGNOSTIC_ONLY_FIELDS` only marks fields diagnostic-only that never
  executed anyway (effect.colorGrade.exposure/shadows/highlights/lut,
  effect.antiAlias.intensity) — documented in `diagnosticOnly.prd03.ts`.
