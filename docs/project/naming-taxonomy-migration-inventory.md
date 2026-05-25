# Naming And Taxonomy Migration Inventory

Status: active inventory, no renames started
Last reviewed: 2026-05-25

This file is the checked-in migration map required before replacing historical `v1` through `v10` names with product taxonomy. It is intentionally an inventory and planning artifact only. Do not rename paths from this file until aliases, redirects, fixture/report readers, package exports, docs links, and focused tests are defined for the batch.

## Inventory Commands

Run these commands from the repository root before each migration batch:

```bash
rg --files -- .github apps docs examples fixtures packages release-artifacts templates tests tools package.json README.md tsconfig.base.json vitest.config.ts | rg '(^|/|[-_])v[0-9]+($|[-_/\.])'
find . -maxdepth 3 \( -path './node_modules' -o -path './.git' \) -prune -o -type d | sed 's#^./##' | rg '(^|/|[-_])v[0-9]+($|[-_/])'
rg -n 'v[0-9]+' package.json README.md docs apps packages tests tools fixtures templates .github tsconfig.base.json vitest.config.ts
pnpm exec tsx --tsconfig tsconfig.base.json tools/naming-taxonomy/index.ts --write
```

Current generated path inventory from 2026-05-25 found `1637` version-style repository file paths plus `658` version-style directory paths implied by those files in the scoped roots. The generated report is checked in at `docs/project/naming-taxonomy-migration-report.md` and currently classifies `3310` active reference records across package exports/file entries, package scripts, TypeScript/Vitest aliases, route links, fixture URLs, report readers, and versioned imports.

| Root | Version-Style File Count | Initial Classification |
| --- | ---: | --- |
| `.github` | 2 | CI workflow names. Require workflow rename/alias review. |
| `apps` | 216 | Active and historical browser routes plus shared app modules. High risk. |
| `docs` | 182 | Mostly historical project docs plus active tutorial names. Medium risk. |
| `examples` | 245 | Public example paths and quarantined example paths. High risk. |
| `fixtures` | 36 | Fixture URLs used by tests/apps/reports. High risk. |
| `packages` | 229 | Package exports, package source surfaces, and create-g3d templates. Highest risk. |
| `release-artifacts` | 93 | Historical release artifacts. Archive unless active readers depend on them. |
| `templates` | 78 | Starter templates. Medium risk. |
| `tests` | 269 | Browser specs, reports, and harnesses. High risk. |
| `tools` | 287 | Report generators, parity tools, audit scripts. High risk. |

## Generated Migration Report

`docs/project/naming-taxonomy-migration-report.md` is the current checked-in generated report. It records every repository file path found by the explicit scoped root scan plus every version-style directory path implied by those files, and gives each row either a contextual target path or an archival/generated-artifact reason.

The report also classifies active load-bearing references:

| Active Reference Kind | Count | Compatibility Decision |
| --- | ---: | --- |
| `fixture-url` | 381 | Keep current `fixtures/v*` fetch paths until manifest aliases or same-batch consumer updates exist. |
| `package-export` | 9 | Keep old `/v6` and `/v9` package exports as aliases until contextual exports and smoke tests exist. |
| `package-file-entry` | 18 | Keep old template/file allowlist entries until contextual template names and create-g3d aliases are proven. |
| `report-reader` | 1859 | Keep current generated evidence paths until readers support contextual aliases; `v9-advanced-gallery-report-audit` accepts `--report-dir`, but `v9-advanced-gallery-visual-review` still hardcodes `tests/reports/v9/advanced-examples-gallery`. |
| `route-link` | 387 | Keep current `/apps/v*` URLs until route redirects or a route registry alias layer exists. |
| `script` | 207 | Keep old package script commands as compatibility aliases until contextual successors and docs are in place. |
| `source-import` | 435 | Rename only with the corresponding file move, import update, and focused alias tests. |
| `tsconfig-alias` | 7 | Keep old workspace aliases until contextual package exports and tests cover consumers. |
| `vitest-alias` | 7 | Keep old test aliases until contextual package exports and tests cover consumers. |

## Classification Rules

Every hit must be assigned exactly one classification before it can be renamed:

| Classification | Meaning | Rename Rule |
| --- | --- | --- |
| `public-api` | Package export, documented import path, or externally referenced route. | Add alias/deprecation first, then migrate docs/tests. |
| `active-route` | Browser app URL or Vite app route used by Playwright or docs. | Add route redirect or route registry alias before path rename. |
| `fixture-url` | Asset path fetched by runtime/tests. | Add manifest alias or update every fetch/reference in same batch. |
| `report-path` | Generated screenshot/JSON path consumed by review/audit/docs. | Add report-reader compatibility before moving historical artifacts. |
| `test-harness` | Browser/unit test file or harness. | Rename only with updated imports, scripts, snapshots, and CI references. |
| `internal-tool` | Script/tool path not exported. | Rename with package script and docs updates in same batch. |
| `historical-archive` | Frozen evidence from previous phases. | Leave versioned; mark archival instead of renaming. |
| `temporary-artifact` | Build output, cache, dist, or disposable generated file. | Exclude from product taxonomy; clean separately if appropriate. |

## Initial Migration Map

No path in this table is approved for immediate rename. The target names are proposed taxonomy targets that still need alias tests and dependency scans.

| Current Pattern | Classification | Proposed Target | Required Compatibility |
| --- | --- | --- | --- |
| `apps/v9-advanced-examples-gallery` | `active-route` | `apps/advanced-examples-gallery` or `apps/cinematic-examples-gallery` | Vite route alias, Playwright path updates, package scripts, report tool path aliases. |
| `tests/reports/v9/advanced-examples-gallery` | `report-path` | `tests/reports/advanced-examples-gallery` | Historical report reader and current review/audit path compatibility. |
| `tools/v9-advanced-gallery-*` | `internal-tool` | `tools/advanced-gallery-*` | Package script aliases and docs updates. |
| `fixtures/v9/assets/*` | `fixture-url` | `fixtures/advanced-gallery/assets/*` | Fixture manifest aliases and runtime fetch updates. |
| `fixtures/v9/environments/*` | `fixture-url` | `fixtures/environments/advanced-gallery/*` | Environment manifest aliases and background evidence updates. |
| `apps/v8-*` | `active-route` / `historical-archive` | Capability names such as `apps/controls-orbit`, `apps/materials-transmission`, `apps/webgpu-compute` | Playwright route aliases; preserve any Three.js parity navigation. |
| `tests/browser/v8-*` | `test-harness` | Capability-based browser specs | Update test references and any report path assumptions. |
| `docs/project/v2-*` through `docs/project/v10-*` | `historical-archive` unless linked as active directives | Keep versioned but add archive index, or migrate active docs to contextual names. | Documentation index must mark archival status. |
| `packages/*/v6` and package exports containing `/v6` or `/v9` | `public-api` | Capability namespace such as `/rendering/environment` | Semver/API migration notes plus export aliases. |
| `examples/*-v1` through `examples/*-v6` | `public-api` / `historical-archive` | Capability names such as `examples/product-viewer`, `examples/material-studio` | Example index aliases and docs updates. |
| `.github/workflows/v4-*` | `internal-tool` | Workflow names by release function | CI badge/link updates. |

## Required Batch Gates

Before any rename batch:

- [ ] Re-run the inventory commands and save the changed count in this file.
- [ ] Classify every path touched by the batch.
- [ ] Add aliases or redirects before moving public routes/exports.
- [ ] Update package scripts, Playwright routes, docs links, report readers, fixture URLs, and generated evidence references in the same batch.
- [ ] Run `pnpm exec tsc -p tsconfig.build.json --noEmit --pretty false`.
- [ ] Run affected unit tests and affected browser route specs.
- [ ] Run the renamed or aliased advanced-gallery review/audit tools if the batch touches gallery paths.

## Current Decision

Do not start the rename migration while Product Configurator and Data Galaxy are failed. The active value of this inventory is to prevent blind renames and to give future workers a concrete migration map. Product/Data source-owned recovery, renderer/material/platform gates, and report correctness remain higher priority.
