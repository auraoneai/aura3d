# PRD-13 PR D evidence — T1.9–T1.13

Branch: `qr/prd13-prompt-plan-v2` (stacked on `qr/prd13-looks-lint-maps` / PR #173).
Flag: `A3D_QR_LOOKS` (behaviour changes only when on; flag-off paths byte-identical).

## T1.9 — rewritten `promptRecipes` (flag-on bodies)

`nodes/prompt/promptRecipes.ts`: each recipe takes an optional `look`.
`look === undefined` → the legacy body byte-identical (flag-off census unchanged).
With a look: `aura-look:<id>` group supplies environment/key/rim/post; the recipe
adds a textured material-preset ground plus authored props. No `lights.ambient`,
no primitive HUD (mini-game health pips / timer / objective bars deleted), no
names matching `fakeEffectNames` stems ("wet reflection" / "puddle streak" /
"rain splash" primitives replaced by named practicals and hazard/coin props).

Test (`tests/unit/agent-api/prompt-plan-v2.test.ts`, "T1.9 rewritten recipes"):
per-sceneType census — ambient count 0, 0 `isFakeEffectName` name hits,
0 lookLint error-severity findings, `aura-look:<id>` group present, procedural
normal/roughness-map ground present; no-look call returns the legacy body
(ambient present, structurally different from look-passed output).

## T1.10 — `compilePromptPlanV2` + flag-on `compilePromptPlan`

`nodes/prompt/promptPlanV2.ts`: look resolution `plan.look > environment >
lighting > sceneType-default`; camera → C-22 rig name with recipe fallback;
style → post grade (`PROMPT_PLAN_STYLE_TO_GRADE` + optional post preset);
effects applied or listed in `report.rejected` (reject mode throws
`AuraPromptPlanError`); `visualSystems` = compiled-snapshot census;
`repairHints` = `lookLint` findings + rejection records.
`compilePromptPlan` gains `options?`; `A3D_QR_LOOKS` on → v2 pipeline narrowed
to the 1.0 report shape (honest `effects`/`visualSystems`/`repairHints`).
Strict default: `A3D_QR_LOOKS_PROMPT_STRICT=1` or `A3D_PROMPT_PLAN_STRICT=1`.

Note: `promptPlanToScene` keeps its owner-15 single-arg signature; the
options-aware variant is `promptPlanToSceneV2`.

Test: same file — (a) product-viewer + `["rain","fog"]` warn → fog applied,
rain `rejected` `unsupported-effect`, census lacks rain; (b) reject mode throws
`unsupported-effect` / `hud-is-dom`; (c) `"misty forest at dusk"` → `golden-hour`;
(d) 500-plan sweep never throws, all report 2.0 with bounded rejection codes;
(e) flag off → 1.0 pipeline output unchanged for the existing fixture;
mapping-table rows all reachable.

## T1.11 — `structuralQA` + deprecated markers

`looks/structuralQA.ts`: validators return the additive
`{ deprecated: true, kind: "structural-name-heuristic" }` (old keys unchanged);
new `structuralQA.{material,neon,charts,character,city,product,solar}` returns
`{ kind, ok, checks }` with renamed keys (e.g. `chromeReflectsEnvironment` →
`chromeReflectionNodesNamed`). `material`/`charts` annotate `visualQA` with the
base type inside owner-15 files — runtime keys present; widening the
annotations is filed (Q-15-* in the qr-request batch).

Test: `tests/unit/agent-api/structural-qa.test.ts` — marker keys on all 7
surfaces, renamed checks only, all check values boolean.

## T1.12 — bundle delta

`tests/qr/prd13/bundle-delta.test.ts` (+ `vitest.qr-prd13.config.ts` — the repo
config's include list is prd15-owned): esbuild-bundles
`packages/engine/src/lanes/prd13.ts`, minify+gzip, ≤ **12 KB** budget.
Delta = lane-authored modules only (carved `promptPlan.ts`/`promptRecipes.ts`/
`structuralQA.ts` and every non-lane import external). Measured **10.7 KB gz**
(mappings + v2 + looks/lint/providers). The PRD's 9 KB estimate predates
T1.9–T1.11 code; budget documented in the test.

Workflow: `.github/workflows/qr-prd13-authoring.yml` (ubuntu: typecheck,
lane-scoped eslint + vitest, delta suite). Q-11-1 filed to mirror the entry in
`tools/bundle-size`.

## T1.13 — C-31 `"look"` section + C-36 `"look"` NodeHandler + `provide()`

`looks/lookDiagnostics.ts`: `DiagnosticsSection` id/key `"look"`, owner prd13,
flag `A3D_QR_LOOKS`. Flag off → `{ id: null, expansion: "none",
missingContracts: [], lint: [] }`; flag on → resolved look id, expansion,
missing contracts, `lookLint` findings for the app snapshot.

`looks/lookNodeHandler.ts`: `NodeHandler` kind `"look"`, owner prd13, flag
`A3D_QR_LOOKS`. Always tags `look.<id>` into features and records
`out.set("look", {id, expansion, missingContracts})`; dispatches each v0 child
through `nodeHandlerFor` (so C-09/C-13/C-26-aware handlers compile them);
records `capability-degraded` when v1 contracts are stubbed or a child kind
has no handler.

`lanes/prd13.ts`: exports the lane surface + `providePrd13Contracts()` —
registers the section and handler once (idempotent guard), invoked at barrel
load.

Test: `tests/unit/contracts/impl/prd13-looks.test.ts` — section returns the
flag-off empty value; handler emits `look.product-studio` +
`capability-degraded` under stubs; `nodeHandlerFor("look").owner === "prd13"`;
`providePrd13Contracts()` idempotent. `C-34-looks.test.ts` /
`C-36-compiler.test.ts` stay green (41 contract files, 61 tests).

## Local verification

- `pnpm exec vitest run tests/unit/agent-api tests/unit/contracts` — all lane
  tests green (124 incl. existing agent-api + looks/lint). 3 unrelated
  agent-api files (`paused-render-clock`, `production-bridge-boundary`,
  `canvas2d`) fail identically on the clean PR C commit — pre-existing, not
  this PR.
- `pnpm exec tsc -p tsconfig.build.json --noEmit` — clean.
- `pnpm exec eslint <touched files>` — clean.
- Bundle delta: 10,727 B gz vs 12 KB budget.

## qr-request issues filed

- Q-04-1: `@deprecated` JSDoc on `material.visualQA` (nodes/material.ts).
- Q-15-2: `@deprecated` JSDoc on the other six `visualQA` surfaces + widening
  `material`/`charts` `visualQA` return-type annotations for the additive keys.
- Q-11-1: `lanes/prd13.ts` entry for `tools/bundle-size`.
- `lights.ambient()` hits outside PRD-13 paths (tests/browser harnesses,
  tests/clean-room mains, tools/agent-dogfood) — prd02's ambient-flattens rule
  will flag them once lanes land.

## NOT RUN

- Browser captures (remote-only lane; unit-level scene snapshots cover the
  recipe census here).
- `qr-prd13-authoring.yml` on GitHub — needs the merge to run on main; the
  same commands were verified locally.

## Fixes folded into this PR

- `looks.ts`: `defineAuraAssets` moved off module top level (lazy) — the new
  `promptRecipes → looks` import evaluated it inside `agent-api/index.ts`'s
  TDZ (`auraAssetRefBrand`), breaking every index entry point.
- `promptPlanMappings.ts`: dusk/golden row moved above the forest row so the
  §6.3 fixture `"misty forest at dusk"` resolves `golden-hour`.
