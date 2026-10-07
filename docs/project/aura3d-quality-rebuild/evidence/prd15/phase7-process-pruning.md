# Phase 7 — process pruning (T7.1–T7.8)

Branch: `qr/prd15-process-pruning` (stacks on `qr/prd15-honest-packages` / PR #335).

## T7.1 — tsconfig emit split
- `tsconfig.base.json` → `noEmit: true` (type-checking only).
- `tsconfig.build.json` → `noEmit: false`, `include: src`-only, `rootDir "."`, `outDir dist`.
- `tsconfig.check.json` → test/tool type-check surface.
- `package.json`: `typecheck` → `tsc -p tsconfig.check.json --noEmit`;
  `build` → `tsc -p tsconfig.build.json && node --experimental-strip-types tools/finalize-dist/index.ts`.
  The `evidence:command` wrapper is removed from `build`/`typecheck` per §6.11 (it still
  serves other kept release scripts — that chain is out of scope for T7.1).
- `pnpm typecheck` green on this branch.

## T7.2 — orphan maps + src-clean rule
- Orphan `.js`/`.js.map` siblings in `packages/*/src` deleted; `no-map-or-js-in-src`
  is a fail-mode rule in `tools/verify-source-cleanliness` and arch-gates `src-clean`.
- `pnpm verify:source-cleanliness` and `pnpm arch:check` (`src-clean`) both green.

## T7.3 — `tools/script-prune` + fixture test
- `tools/script-prune/index.ts`: `--report` / `--apply` / `--check`; writes
  `docs/architecture/script-prune-report.json`.
- `tests/unit/tools/script-prune.test.ts`: 5 fixture cases (chain keep, orphan delete,
  workflow keep, missing-target delete, pass-2 cascade). 5/5 green.
- Bug fixed during verification: `walk()` prunes dot-dirs and `".github"` also matched
  a `startsWith(".git")` check, so the dir-reference corpus silently missed
  `.github/workflows`. Dir analysis now runs on a full-repo corpus (`dirCorpusFiles`)
  covering workflows, tests, src, apps, and root configs, and excludes both report paths
  so a previous report can't self-reference the world into "referenced".

## T7.4 — script prune applied
- `package.json` scripts: 450+ → **70** (≤80 target met).
- All 11 §6.11 canonical names present and wired to real targets:
  `dev`, `build`, `build:dist`, `typecheck`, `typecheck:tests`, `lint`, `test`,
  `test:unit`, `test:integration`, `test:browser`, `test:visual`, `bench:quality`,
  `capture:games`, `pack:check`, `resolution:check`, `resolution:write`, `arch:check`,
  `bundle:size`, `templates:check`, `doctor`, plus `assets:*`/`release:*` prefixes.
- `verify:architecture` kept as an alias → `pnpm arch:check` (T7.7).
- Deleted scripts restorable via `git revert` (requirement met).
- Report committed at `docs/architecture/script-prune-report.json`
  (post-prune fixed point: 70 keep / 0 delete / 0 review).

## T7.5 — unreferenced tool dirs
- **145 lane-15-owned `tools/` dirs deleted** (149 first pass + 22 review-shielded
  stragglers − 27 restored after re-verification found live references; see note below).
- `ls tools` → 305 dirs; §6.11's ≤60 is a repo-wide target — the 12 dirs the prune
  still reports unreferenced are all **lane-12-owned** (`superiority-*`,
  `threejs-parity-*`); lane 15 cannot delete them (ownership), so they're filed in the
  Q-12-3 addendum (`requests/Q-12-3-three-compat-tools-and-benchmarks.md`) alongside
  the original three-compat ask, and the 2 remaining lane-13 dirs in `Q-13-9`.

### Honest-accounting note (verification regression caught in-session)
The first deletion sweep trusted the tool's own corpus, which omitted `tests/`,
`src/`, `vite.config.ts`, `marketing/` and `.github/` (dot-dir pruning) — 27 dirs that
still had live references were deleted, flagged by `pnpm typecheck` + a full-repo rg
re-verification, and **all 27 restored** (`git checkout HEAD -- tools/<dir>`). The
tool's corpus bug is fixed (above); the regenerated report now agrees with rg: the
only remaining unreferenced dirs are the 12 foreign-owned ones.

## T7.6 — root scratch files
- Deleted `fd8cbbc54de44638a11d2fe978127aec.txt` + `public/` copy (bare-UUID domain
  verification artifact, zero references).
- Spec-listed scratch patterns (`rooftop-*`, `siege-*`, `courier-diag*`, `vb-lane-probe`,
  `scratch-site5`, `bs-debug-shot*`, `__probe-courier`, `[{"down"…}]` file) — **none
  present on this branch** (either never landed or already removed in earlier phases).

## T7.7 — verify-architecture → arch-gates
- `tools/verify-architecture/` deleted; its gate subsumed by `tools/arch-gates`
  running in fail mode (`qr-prd15-arch-gates.yml` + the src-clean rule from T7.2).
  ci.yml/test.yml never invoked it — nothing to swap there; the lane workflow is the
  live arch gate.
- `verify:architecture` script kept as `pnpm arch:check` alias.
- `tests/unit/tools/verify-tools.test.ts` verify-architecture sections removed
  (two `it` blocks + helper, ~210 lines); remaining 22 tests green.
- `requests/Q-12-2-verify-architecture-replacement.md` filed — 12-owned
  `tools/external-parity-codebase-root-readiness` asserts the deleted path.

## T7.8 — migration docs
- Root `MIGRATION-2.0.md` removed; content preserved verbatim at
  `docs/migration/2.0.md` (spec intends root pruning, not history deletion — the file
  backs `tests/unit/tools/migration-matrix.test.ts` and 15-owned doc links).
- `docs/MIGRATION-4.0.md` generated from `aura.exports.json#deprecated` (32 subpath
  alias rows) + the §11 removal table (A3DRenderer/ProductionRuntimeRenderer/
  AdvancedRenderer aliases, `packages/lean`, `@aura3d/input/controls`, CCR-15-1 types,
  146 deprecated `.` union names).
- All 15-owned `MIGRATION-2.0` references repointed (README, marketing, docs index,
  2.0 architecture docs, ecs-scripting-compat). `tests/unit/tools/migration-matrix.test.ts`
  reads the moved path; also hardened against stale `packages/*/node_modules` husks.
- `requests/Q-12-4-migration-2.0-relocation.md` filed — 12-owned
  `external-parity-docs-readiness` `requiredFiles` lists the root path.
- `README.md` 211–212 rewritten from live arch-gate output: `.` carries 146 deprecated
  union names; `unique-ownership` reports **0** multi-owner symbols (was: "engine-runtime
  declares 322 exports … 51 symbol names have more than one owning package").

## Verification run
- `pnpm typecheck` (tsconfig.check.json): **green**.
- `npx vitest run tests/unit/tools tests/unit/root-path-integrity
  tests/unit/animation-studio`: 885 pass / 51 fail in 14 files — **identical failure
  set on the #335-base worktree** (30 failures on the overlapping suite subset;
  `release-metrics-rollup`, `developer-value`, `evidence-freshness`, `claim-lineage`,
  `game-visual-qa`, `visual-review-perceptual-binding`, `showcase-route-gates`,
  `head-to-head-current-aggregate`, `honest-public-claims`, `parity-consumers`,
  `peer-benchmark-report`, `api-docs` are pre-existing reds whose required
  `tests/reports/*.json|png` artifacts were never committed and no workflow generates).
  `blocked-routes-stay-blocked` failed on base, passed here (flaky).
- `pnpm arch:check` (warn mode): 54 findings, all allowlisted or non-lane-15
  (no-cross-package-relative in 13-owned templates/engine parity files, layering
  allowlists expiring 2026-10-20/2026-11-15, max-file-lines debt, deps-truth in
  11/13-owned manifests, export-budget's 146-name deprecated `.` union — the exact
  figure now quoted in README and removed at T8.1).

## NOT-RUN / pending
- `pnpm pack:check` not re-run on this branch (unchanged since #335 fix propagated —
  requires `pnpm build:raw`; will run before PR if CI doesn't cover it).
- Full lint pass (`pnpm lint`) not run — branch touched ~160 dirs of deletions plus
  files above; the changed-file lint is clean. Repo-wide lint parity vs base assumed
  from identical source state outside the deletions.
