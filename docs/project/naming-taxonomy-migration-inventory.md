# Naming And Taxonomy Migration Inventory

Status: active inventory with contextual alias coverage
Last reviewed: 2026-05-25

This file is the checked-in migration map required before replacing historical `v1` through `v10` names with product taxonomy. It is intentionally an inventory and planning artifact only. Do not rename paths from this file until aliases, redirects, fixture/report readers, package exports, docs links, and focused tests are defined for the batch.

## Inventory Commands

Run these commands from the repository root before each migration batch:

```bash
rg --files -- .github apps docs examples fixtures packages release-artifacts templates tests tools package.json README.md tsconfig.base.json vite.config.ts vitest.config.ts | rg '(^|/|[-_])v[0-9]+($|[-_/\.])'
find . -maxdepth 3 \( -path './node_modules' -o -path './.git' \) -prune -o -type d | sed 's#^./##' | rg '(^|/|[-_])v[0-9]+($|[-_/])'
rg -n 'v[0-9]+' package.json README.md docs apps packages tests tools fixtures templates .github tsconfig.base.json vite.config.ts vitest.config.ts
pnpm exec tsx --tsconfig tsconfig.base.json tools/naming-taxonomy/index.ts --write
```

Current generated path inventory from 2026-05-25 found `1645` version-style repository file paths plus `660` version-style directory paths implied by those files in the scoped roots. The generated report is checked in at `docs/project/naming-taxonomy-migration-report.md` and currently classifies `3321` active reference records across package exports/file entries, package scripts, TypeScript/Vite/Vitest aliases, route links, fixture URLs, report readers, and versioned imports.

| Root | Version-Style File Count | Initial Classification |
| --- | ---: | --- |
| `.github` | 2 | CI workflow names. Require workflow rename/alias review. |
| `apps` | 216 | Active and historical browser routes plus shared app modules. High risk. |
| `docs` | 182 | Mostly historical project docs plus active tutorial names. Medium risk. |
| `examples` | 245 | Public example paths and quarantined example paths. High risk. |
| `fixtures` | 36 | Fixture URLs used by tests/apps/reports. High risk. |
| `packages` | 229 | Package exports, package source surfaces, and create-aura3d templates. Highest risk. |
| `release-artifacts` | 93 | Historical release artifacts. Archive unless active readers depend on them. |
| `templates` | 78 | Starter templates. Medium risk. |
| `tests` | 269 | Browser specs, reports, and harnesses. High risk. |
| `tools` | 287 | Report generators, parity tools, audit scripts. High risk. |

## Generated Migration Report

`docs/project/naming-taxonomy-migration-report.md` is the current checked-in generated report. It records every repository file path found by the explicit scoped root scan plus every version-style directory path implied by those files, and gives each row either a contextual target path or an archival/generated-artifact reason.

The report also classifies active load-bearing references:

| Active Reference Kind | Count | Compatibility Decision |
| --- | ---: | --- |
| `fixture-url` | 351 | Keep current `fixtures/v*` fetch paths until manifest aliases or same-batch consumer updates exist. |
| `package-export` | 18 | Contextual exports exist for production-runtime, advanced-runtime, asset-corpus, advanced-gallery, and workflows/production; legacy `/v6` and `/v9` exports remain compatibility aliases until removal. |
| `package-file-entry` | 18 | Keep old template/file allowlist entries until contextual template names and create-aura3d aliases are proven. |
| `report-reader` | 1854 | Advanced-gallery visual-review and report-audit support contextual report directories and legacy fallback; other report-reader batches still need owner-scoped aliases. |
| `route-link` | 266 | Public app route URLs have contextual `/apps/<capability>/` aliases for V5/V6/V7/V8/V9 surfaces; old `/apps/v*` routes remain compatibility aliases for historical links and tests. |
| `script` | 397 | Contextual command aliases exist for versioned phase script names, including `product-studio:*`, `foundation:*`, `external-parity:*`, `three-compat:*`, `production-runtime:*`, `current-routes:*`, `threejs-parity:*`, and `superiority:*`; old `v*` commands remain wrappers. |
| `source-import` | 376 | Public package imports in current gallery/WOW surfaces use contextual aliases; internal versioned source imports remain classified test/tool/historical records until file moves. |
| `tsconfig-alias` | 14 | Contextual and legacy workspace aliases coexist for production-runtime, advanced-runtime, asset-corpus, advanced-gallery, and workflows/production. |
| `vite-alias` | 14 | Contextual and legacy Vite aliases coexist and the Vite middleware rewrites contextual route/fixture URLs to legacy file-backed paths. |
| `vitest-alias` | 14 | Contextual and legacy Vitest aliases coexist for focused package import parity tests. |

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
| `apps/v9-advanced-examples-gallery` | `active-route` | `apps/advanced-examples-gallery` | Implemented contextual route alias, Playwright path updates, package scripts, and report tool path aliases. |
| `tests/reports/v9/advanced-examples-gallery` | `report-path` | `tests/reports/advanced-examples-gallery` | Implemented for the first batch: current capture writes contextual reports, and visual-review/report-audit readers accept contextual report dirs with legacy fallback. |
| `tools/v9-advanced-gallery-*` | `internal-tool` | `tools/advanced-gallery-*` | Package script aliases and docs updates. |
| `fixtures/advanced-gallery/assets/*` | `fixture-url` | `fixtures/advanced-gallery/assets/*` | Fixture manifest aliases and runtime fetch updates. |
| `fixtures/advanced-gallery/environments/*` | `fixture-url` | `fixtures/advanced-gallery/environments/*` | First-batch Vite fixture URL aliases and byte-hash browser tests are in place. |
| `apps/v8-*` | `active-route` / `historical-archive` | Capability names such as `apps/controls-orbit`, `apps/materials-transmission`, `apps/webgpu-compute` | Implemented Vite route aliases and public docs/root route updates; preserve any Three.js parity navigation. |
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

The current contextual alias batch covers public app routes, current advanced gallery evidence paths, advanced-gallery fixture fetches, public package aliases, and contextual package-script names. Physical versioned app/tool/test paths remain in place while broader V2 through V10 owner batches are classified. Do not remove legacy paths until their focused route/package/fixture/report-reader alias tests are in place and passing.
