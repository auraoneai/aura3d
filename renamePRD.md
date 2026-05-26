# Aura3D / A3D Rename Completion Record

Status: completed for committed source, package, docs, fixture paths, generated dist, and release metadata.

Scope: this record replaces the original planning prompt. It is intentionally sanitized so the committed tree does not reintroduce legacy brand literals while documenting the completed Aura3D/A3D state.

## Completion Checklist

- [x] Public product name is Aura3D across active source, package metadata, docs, examples, templates, workflows, and reports that are committed.
- [x] Short product identifier is A3D across runtime names, create package APIs, comments, package metadata, and committed documentation.
- [x] Package scopes and imports use `@aura3d/*`.
- [x] Create package and CLI references use `create-aura3d` / `npm create aura3d@latest`.
- [x] Adapter, app, and quality-preset class/file names use A3D naming.
- [x] Product, workflow, environment, and asset fixture directories have been flattened away from numbered fixture roots.
- [x] Actual directory scan for `v1` through `v9` directory basenames is clean outside dependency caches.
- [x] Removed fixture path references such as numbered fixture roots and numbered asset fixture roots are clean outside generated reports.
- [x] Root package export map includes the Aura3D runtime, advanced runtime, workflow, asset-corpus, production-runtime asset alias, and create package surfaces.
- [x] `@aura3d/three-compat` exposes migration target subpaths for controls, loaders, and postprocessing.
- [x] `packages/create-aura3d` includes the production and three-compat template names in its public template union.
- [x] Generated `dist` output has been rebuilt after the final source changes.
- [x] Release tarball was regenerated as `release-artifacts/aura3d-engine-1.0.0.tgz`.
- [x] Release artifact manifest has been updated to the current tarball SHA-256.
- [x] No `.png`, `.jpg`, `.jpeg`, or `.csv` files are intended to be staged or committed for this rename.

## Final Verification Commands

These are the verification commands used for the final gate. They are written in terms of the legacy-token inventory pattern without listing those literals in this committed completion record.

```sh
pnpm typecheck
pnpm build
pnpm exec vitest run tests/unit/rendering/current-routes-pmrem.test.ts tests/unit/engine/runtime-parity-production-runtime-public-sdk.test.ts --reporter=dot
pnpm exec vitest run tests/unit/assets/asset-bundle-cache-fixtures.test.ts tests/unit/assets/scene-analysis-fixtures.test.ts tests/unit/assets/asset-import-preflight.test.ts tests/unit/rendering/external-parity-ibl.test.ts --reporter=dot
pnpm exec playwright test tests/browser/product-demos.spec.ts -g "product demo reaches ready" --reporter=line
pnpm exec playwright test tests/browser/product-demos.spec.ts -g "LOD selection|game slice responds to pointer" --reporter=line
pnpm pack --pack-destination release-artifacts
pnpm exec tsx --tsconfig tsconfig.base.json tools/versioned-release-verification/index.ts
```

The final source scans are intentionally kept as shell variables here to avoid storing deprecated literals in the repo:

```sh
LEGACY_PATTERN='<legacy-brand-and-create-package-token-regex>'
rg --hidden --no-ignore -n "$LEGACY_PATTERN" . \
  -g '!**/.git/**' \
  -g '!**/node_modules/**' \
  -g '!tests/reports/**' \
  -g '!**/*.png' \
  -g '!**/*.jpg' \
  -g '!**/*.jpeg' \
  -g '!**/*.csv'

find . -path './.git' -prune -o -path './node_modules' -prune -o \
  -type d \( -name 'v1' -o -name 'v2' -o -name 'v3' -o -name 'v4' -o -name 'v5' -o -name 'v6' -o -name 'v7' -o -name 'v8' -o -name 'v9' \) -print

rg --hidden --no-ignore -n 'fixtures/(assets/)?v[1-9](/|$)|/fixtures/(assets/)?v[1-9](/|$)|fixtures/external-engine-baselines/v[1-9](/|$)' . \
  -g '!**/.git/**' \
  -g '!**/node_modules/**' \
  -g '!tests/reports/**'
```

## Verification Results

- [x] Legacy brand/content scan returned no matches outside generated reports and excluded binary/image/CSV files.
- [x] Legacy path/name scan returned no matches outside dependency caches.
- [x] Numbered directory scan returned no actual `v1` through `v9` directory basenames outside dependency caches.
- [x] Numbered fixture path scan returned no matches outside generated reports.
- [x] `pnpm typecheck` passed.
- [x] `pnpm build` passed and finalized dist exports.
- [x] Focused asset/IBL unit tests passed: 4 files, 12 tests.
- [x] Focused HDR/PMREM SDK unit rerun passed: 2 files, 15 tests.
- [x] Product demo browser readiness passed: 3 tests.
- [x] Product demo targeted browser interactions passed after fixture-path runtime fixes: 2 tests.
- [x] Versioned release verification passed with zero violations.

Note: a full unit run reached 188 passing files and 1172 passing tests, with two HDR-heavy tests timing out at the default 5 second per-test limit under full-suite contention. The exact two files were rerun in isolation and passed.

## Commit Boundary

Commit all source, docs, package metadata, generated dist, fixture-path, report metadata, and release-manifest changes required for the Aura3D/A3D rename.

Do not stage or commit:

- image files: `*.png`, `*.jpg`, `*.jpeg`
- CSV files: `*.csv`
- transient unit JSON output unless explicitly reviewed for commit inclusion

Release artifact policy:

- The current Aura3D tarball exists on disk and is verified by SHA-256 in `docs/project/release-artifacts.json`.
- Older tarball artifacts removed from the worktree should be staged only if the commit intentionally drops obsolete release artifacts.

External metadata note:

- The checkout directory and remote repository URL are outside the committed source tree. They can be renamed outside Git after the source rename commit lands.
