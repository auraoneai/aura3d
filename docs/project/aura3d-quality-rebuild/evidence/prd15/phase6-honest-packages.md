# Phase 6 — Honest packages (T6.1–T6.11)

Branch `qr/prd15-honest-packages` on top of T5 (`bf1789b0`). Per §6 the
dishonest packages are deleted outright and their migration surface is the CLI
codemod — no drop-in claims.

## T6.1 — `aura3d migrate three` codemod

`packages/aura3d-cli/src/migrate-three/` (5 modules + 4 ported adapter files):
`parse` (collect `from "three"`/`three/addons/*` imports + `THREE.*` usages),
`mappings` (construct → `@aura3d/engine` member table), `emit` (rewrite to
`import { … } from "@aura3d/engine"` + `// TODO(a3d-migrate)` comments on
unmappable lines), `report` (emits `{construct, line, mapping:
"exact"|"approximate"|"none", note}` rows; `none` rows never claim an
equivalent). Unit test `tests/unit/aura3d-cli/migrate-three.test.ts` covers
exact/approximate/none rows, specifier rewrites, and report shape.

## T6.2 — three-compat package deleted

`packages/three-compat/` deleted outright (PRD-15 §6.8 — no graceful
deprecation path). Removed from `aura.exports.json`, tsconfig paths, vite/
vitest aliases, verify-architecture lists, test enumerations; `README.md`'s
`@aura3d/three-compat` bullet removed. Paths 107→106; released packages 28→25.

Blast-radius fixes in lane-15-owned tables/tests: `tools/browser-entry-purity`,
`tools/bundle-scenarios`, `tools/final-subsystem-ownership` (adr-registry),
`tools/package-no-three-runtime`, `tools/current-routes-runtime-import-audit`,
`tools/public-surface-diff` (new `documented-prd15-6-honest-packages-deleted`
classification), `verify-architecture` + its fixture test (game package now
declared `private`), `migration-matrix` test, `runtime-edge-coverage` suite
list, `api-docs` expected list, root `package.json` (20 `three-compat:*`
scripts + `check:packed-migration-consumer` + dead test references).

Two owner-12 tools that *compiled* against the deleted package were repointed
to the new CLI codemod instead of deleted (`three-compat-migrate-three`,
`three-compat-migration-readiness`); the rest of the owner-12 surface is
documented in `requests/Q-12-3` (~22 remaining tool dirs + `benchmarks/three-compat/`).

## T6.3 — templates (request filed)

`requests/Q-13-4`: delete `templates/three-compat-*` (8 dirs), rename the 8
`packages/create-aura3d/templates/three-compat-*` to §6.8 names
(architecture-interior, asset-inspector, character-viewer, custom-scene,
large-scene, material-authoring, postprocess-scene, premium-product-viewer),
add `templateAliases` warning map + unit test "`--template
three-compat-large-scene` scaffolds `large-scene` and prints the warning".
Lane 13 owns `packages/create-aura3d/**` + `templates/**` — filed with the
rename table and test spec.

## T6.4 — parity tests/scripts deleted

`tests/browser/three-compat-threejs-{visual,runtime}-parity.spec.ts` deleted +
all 20 `three-compat:*` root scripts removed. Remaining `three-compat-*` tool
dirs and `benchmarks/three-compat/` are lane-12-owned → `requests/Q-12-3`.

## T6.5–T6.9 — earlier tasks (landed this branch)

- T6.5 environments → `packages/engine/src/devtools/environments/` (+ `node.ts`,
  `production-runtime/` subtree); package deleted.
- T6.6 materials → `packages/engine/src/devtools/materials/`; package deleted.
- T6.7 editor → absorbed; package deleted.
- T6.8 controls split: `packages/controls/src/engine/*` (impl home) +
  `packages/input/src/controls/*` back-compat shims.
- T6.9 input/controls shim parity: `tests/qr/prd15/controls/controls-equivalence.test.ts`
  + `tests/qr/prd15/materials/*` equivalence coverage.

## T6.10 — corpus GLB parse unification (05-owned files, APPLIED BY LANE 15)

`packages/assets/src/GLTFLoader.ts`: internal `GLTFDocument` gained `version` +
`jsonChunkBytes`; new exported `parseGlbDocument(data, url)` +
`GLBDocumentInspection` (`{json, version, jsonChunkBytes, byteLength}`) wrapping
the canonical `parseGLB` chunk walk — exported via `index.ts`/`browser-index.ts`.

`ProductionAssetCorpus.inspectProductionGlb` and `AdvancedAssetCorpus.
inspectCurrentRoutesGlb` deleted their hand-rolled `GLB_MAGIC`/`readUInt32LE`
header reads and now call `parseGlbDocument`. Counting logic unchanged; the
unified path is stricter (full chunk-table walk + declared-length check).

Test: `tests/qr/prd15/assets/gltf-parse-equivalence.test.ts` — 5 committed GLB
fixtures × (accessor counts, material counts, version, non-GLB rejection)
identical through corpus inspection and `GLTFLoader.load`. 6/6 pass.

Requests: `Q-05-1` (records the lane-05 file edits + the PRD's owner-field
divergence), `Q-13-3` (`create-aura3d/templates/animation-studio/scripts/` local
GLB parsers → `@aura3d/engine/assets`).

## T6.11 — deps-truth gate + 15-owned manifest truth

New rule `tools/arch-gates/rules/depsTruth.ts` (wired into the gates runner):
declared workspace deps ↔ `src/` import graph, specifiers resolved through
`tsconfig.paths.generated.json` (single resolution truth) plus cross-package
relative escapes. Statement-position scanning only — codemod payload strings
and JSDoc examples don't count as usage. `@aura3d/engine` (root product package
name) satisfies a dep on `packages/engine`. Lane-15 manifests enforce; others
warn.

15-owned manifests fixed:
- root `package.json`: +`@aura3d/{asset-index,controls,lean,navigation-recast,
  physics-rapier}` devDeps (tools/tests/benchmarks/apps import them;
  `pnpm-lock.yaml` synced via `pnpm install`).
- `packages/core`: −`@aura3d/math` (never imported).
- `packages/editor-runtime`: −`@aura3d/engine` devDep (never imported).
- `packages/engine`: +`@aura3d/debug`, +`create-aura3d` (deprecated shim
  re-exports use them).

Residuals on foreign manifests → `requests/Q-ALL-1-deps-truth.md` with
per-package diffs (animation unused math; aura3d-cli missing rendering; game
unused rendering).

### Arch-gate debt surfaced while enforcing

- `layering` ×2 **fixed**: `compiler/textures.ts` repointed to the already-moved
  `compiler/errors.ts`; `app/createAuraGameRuntime.ts` +
  `app/frameLoopDefaults.ts` moved to `nodes/game/` (their only consumers) —
  the barrel now re-exports from there.
- `no-cycles`: prompt SCC-3 **fixed** (`interactionNode` → `promptRecipes.ts`,
  `promptPlanToScene` → `promptPlan.ts`; public names unchanged). The 100-file
  agent-api SCC is structural debt → allowlisted to 2026-11-15 with
  `requests/Q-15-1` (lane 15 owns unwinding it).
- `unique-ownership` ×4 allowlisted to 2026-11-15 with `requests/Q-15-2`
  (`AnimationAssetCategory`, `Vector3Like`, `clamp`, `RaycastHit` — genuinely
  different declarations; need owner renames, not silent dedup).

## Gate results

- `tools/arch-gates` (this branch): **0 enforced findings**; 54 warnings —
  the allowlisted/reported items above plus pre-existing warn-mode rules.
- `tsc -p tsconfig.build.packcheck.json --noEmit`: clean.
- `pnpm check:public-surface-diff`: PASS (last verified after T6.2 enumeration
  fixes; re-run in CI).
- Affected unit tests: agent-api 60/60, `migrate-three` tests green,
  `gltf-parse-equivalence` 6/6, verify-tools/migration-matrix/api-docs/runtime-
  edge-coverage enumerations updated.
- eslint on every changed file: clean.

## NOT-RUN

- `pnpm test` repo-wide: pre-existing environmental failures verified identical
  on `git stash` (git-exec tests need a real checkout context; `tests/reports`
  artifacts absent locally; the 71 `runtime-edge-coverage` stub-marker findings
  are PR-0a drift documented since Phase 1).
- Browser/axe captures for this phase: no rendered-pixel change (same argument
  as Phase 5); §16.3 captures remain owed from T4.3.
- `templates/**` + `create-aura3d/templates/**` edits: lane 13 (Q-13-4/Q-13-3).
- `benchmarks/three-compat/` + `tools/three-compat-*` deletion: lane 12 (Q-12-3).
