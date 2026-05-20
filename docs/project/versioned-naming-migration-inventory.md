# Versioned Naming Migration Inventory Plan

Captured: 2026-05-19

Owner scope: naming/docs/legacy route health inventory only.

Status: inventory and migration plan only. No path, route, export, script, fixture, report, or source rename has been performed by this document.

## Source Directive

`execute.md` section 11 says the repository contains iterative names such as `v1` through `v10` and that those names are not product taxonomy. It requires an inventory before any rename, classification by dependency surface, compatibility aliases or redirects where needed, and exact verification after every rename batch.

The same section marks these high-risk areas:

- `apps/v8-*`, `apps/v9-*`, and `apps/v6-*`
- `examples/*-v1`, `examples/*-v3`, `examples/*-v4`, `examples/v5-*`, and `examples/v6`
- `fixtures/v2` through `fixtures/v9`
- `tools/v2-*` through `tools/v10-*`
- `tests/browser/v3-*` through `tests/browser/v9-*`
- `tests/reports/v7`, `tests/reports/v8`, and `tests/reports/v9`
- `docs/project/v2-*` through `docs/project/v10-*`
- root `package.json` scripts and public exports such as `./v6`, `./v9`, `./rendering/v6`, `./rendering/v9`, `./assets/v6`, and `./assets/v9`
- `templates/v4-*`, `templates/v5-*`, and `templates/v6-*`
- GitHub workflows with versioned names

## Machine-Readable Summary

```json
{
  "schema": "g3d-versioned-naming-migration-inventory-plan/v1",
  "capturedAt": "2026-05-19",
  "sourceDirective": "execute.md#11-naming-and-repository-taxonomy-migration",
  "renameStatus": "no-renames-performed",
  "scannedRoots": [
    "apps",
    "examples",
    "fixtures",
    "tools",
    "tests",
    "docs/project",
    "templates",
    "packages",
    "benchmarks",
    "release-artifacts",
    ".github",
    "README.md",
    "package.json"
  ],
  "matchTokens": ["v1", "v2", "v3", "v4", "v5", "v6", "v7", "v8", "v9", "v10", "wow"],
  "totalVersionedPathMatches": 3118,
  "classificationRequiredBeforeRename": true,
  "routeUrlRenameRequiresPlaywrightAndRegistryUpdate": true,
  "publicExportRenameRequiresSemverApiMigrationNotes": true,
  "reportPathRenameRequiresWriterReaderAndEvidenceReferenceUpdate": true
}
```

## Current Token Distribution

Counts below are path/name matches from the scanned roots, not unique product capabilities.

| Token | Path matches | Primary top-level locations |
| --- | ---: | --- |
| `v1` | 16 | `examples`, `tests` |
| `v2` | 52 | `fixtures`, `tools`, `tests`, `docs` |
| `v3` | 343 | `apps`, `examples`, `fixtures`, `tools`, `tests`, `docs`, `benchmarks` |
| `v4` | 686 | `examples`, `fixtures`, `tools`, `tests`, `docs`, `templates`, `packages`, `benchmarks`, `release-artifacts`, `.github` |
| `v5` | 652 | `apps`, `examples`, `fixtures`, `tools`, `tests`, `docs`, `templates`, `packages`, `benchmarks` |
| `v6` | 599 | `apps`, `examples`, `fixtures`, `tools`, `tests`, `docs`, `templates`, `packages`, `benchmarks` |
| `v7` | 68 | `apps`, `fixtures`, `tests`, `docs` |
| `v8` | 260 | `apps`, `fixtures`, `tools`, `tests`, `docs`, `packages`, `benchmarks` |
| `v9` | 374 | `apps`, `fixtures`, `tools`, `tests`, `docs`, `packages` |
| `v10` | 23 | `tools`, `docs` |
| `wow` | 78 | `apps`, `tests` |

## Current Path Class Inventory

| Class | Directories | Files | Rename risk | Migration posture |
| --- | ---: | ---: | --- | --- |
| App route roots | 77 | 0 | Critical | Keep current URLs until aliases, route registry updates, and exact Playwright route specs are ready. |
| App route nested files | 79 | 241 | Critical | Rename only with app root migration; do not rewrite imported paths independently. |
| Example route roots | 19 | 0 | High | Treat as public local demo URLs. Add redirects or duplicate route aliases before moving. |
| Example nested files | 62 | 221 | High | Migrate with route root and tests together. |
| Fixture paths | 129 | 512 | Critical | Rename only after every manifest, loader test, browser test, and report writer reference is updated. |
| Tool paths | 247 | 283 | High | Scripts in `package.json` and report paths must move in the same batch. |
| Browser tests | 2 | 180 | Critical | Test filenames and embedded `page.goto()` URLs are route contracts until replaced. |
| Unit/integration/assets/performance/visual tests | 0 | 70 | High | Rename after import paths, report paths, and script lanes are mapped. |
| Generated report paths | 14 | 67 | Critical | Preserve existing evidence; new report aliases or migrations need writer/reader updates. |
| Project docs | 0 | 182 | Medium | Can be renamed after backlinks and docs index are updated. Historical docs may retain version labels. |
| Templates | 36 | 78 | High | Treat as public starter names. Migrate with create-g3d/template references. |
| Package source namespaces | 66 | 229 | Critical | Public exports and source folders require semver/API migration notes and compatibility aliases. |
| Benchmarks | 17 | 32 | High | Rename with script lanes and report references. |
| Release artifacts | 73 | 164 | High | Prefer immutable historical artifact names unless release packaging is rebuilt. |
| GitHub workflows | 0 | 2 | High | Rename only with badge/docs references and workflow trigger expectations. |

## Route URL Inventory

These roots are route-like or app-like names and must not be renamed without route aliases plus browser spec updates.

### `apps/` Versioned And WOW Roots

```text
apps/v3-common
apps/v5-animation-studio-pro
apps/v5-asset-studio-pro
apps/v5-controls-lab
apps/v5-large-scene-lab
apps/v5-material-studio-pro
apps/v5-postprocess-studio-pro
apps/v5-product-studio-pro
apps/v5-scene-studio-pro
apps/v5-shader-lab-pro
apps/v5-threejs-migration-lab
apps/v6-architecture-viewer
apps/v6-asset-inspector
apps/v6-automotive-configurator
apps/v6-character-viewer
apps/v6-cinematic-postprocess
apps/v6-common
apps/v6-large-scene-lab
apps/v6-material-studio
apps/v6-product-configurator
apps/v6-threejs-parity-lab
apps/v6-webgpu-lab
apps/v7-animation-keyframes
apps/v7-example-parity-lab
apps/v8-animation-keyframes
apps/v8-animation-multiple
apps/v8-animation-walk
apps/v8-camera
apps/v8-camera-multiple-views
apps/v8-controls-orbit
apps/v8-controls-trackball
apps/v8-controls-transform
apps/v8-decals
apps/v8-flagship-viewer
apps/v8-geometry-drawrange
apps/v8-instancing-performance
apps/v8-interactive-picking
apps/v8-lights-spotlight
apps/v8-lines-helpers
apps/v8-loader-compression
apps/v8-loader-gltf-variants
apps/v8-loader-instancing
apps/v8-loader-ktx2
apps/v8-loader-material-extensions
apps/v8-loader-obj
apps/v8-materials-transmission
apps/v8-parallax-barrier
apps/v8-physics-showcase
apps/v8-postprocessing-bloom
apps/v8-postprocessing-depth-outline
apps/v8-shadowmap-viewer
apps/v8-skinning-additive
apps/v8-skinning-blending
apps/v8-skinning-ik
apps/v8-skinning-morph
apps/v8-stereo-effects
apps/v8-texture-anisotropy
apps/v8-webgpu-compute
apps/v8-webgpu-instance-uniform
apps/v8-webgpu-materials
apps/v8-webgpu-rtt
apps/v8-webxr-interactions
apps/v9-advanced-examples-gallery
apps/v9-public-scene
apps/wow-astral-garden
apps/wow-common
apps/wow-crystal-cavern
apps/wow-kira-ik-room
apps/wow-material-cathedral
apps/wow-neon-city
apps/wow-ocean-temple
apps/wow-orbital-fleet
apps/wow-particle-vortex
apps/wow-physics-arena
apps/wow-quantum-stage
apps/wow-robot-parade
apps/wow-tokyo-keyframes
```

### `examples/` Versioned Roots

```text
examples/asset-gallery-v4
examples/asset-viewer-v1
examples/asset-viewer-v3
examples/character-viewer-v4
examples/game-slice-v3
examples/hdr-ibl-v4
examples/interactive-scene-v3
examples/interactive-showcase-v4
examples/interior-scene-v4
examples/material-studio-v1
examples/material-studio-v3
examples/material-studio-v4
examples/postprocess-v4
examples/product-configurator-v3
examples/product-configurator-v4
examples/product-viewer-v1
examples/rendering-showcase-v1
examples/v5
examples/v6
```

### Current Report Roots

```text
tests/reports/v7
tests/reports/v8
tests/reports/v8/animation
tests/reports/v9
tests/reports/v9/advanced-examples-gallery
tests/reports/v9/advanced-examples-gallery-authored
tests/reports/v9/advanced-examples-gallery-authored-v2
tests/reports/v9/advanced-examples-gallery-authored-v3
tests/reports/v9/advanced-examples-gallery-authored-v4
tests/reports/v9/advanced-examples-gallery-authored-v5
tests/reports/v9/advanced-examples-gallery-ui-v2
tests/reports/wow-authored
tests/reports/wow-kira-ik-room
tests/reports/wow-showcase
```

## Public API And Script Inventory

Root `package.json` currently exposes versioned public API entry points:

```text
./assets/v6
./assets/v9
./rendering/v6
./rendering/v9
./v6
./v9
./workflows/v6
```

It also contains 203 versioned or `wow` script keys. These are automation contracts because docs, CI, release gates, and workers call them by name. Script migration should use aliases first, then deprecate old names only after all docs and workflows stop using them.

## Legacy Route Health Notes

Existing route-health coverage is itself versioned and must move after the route migration map is stable:

- `package.json` has `v8:route-health` calling `tests/browser/v8-route-health.spec.ts`, `tests/browser/v8-v7-animation-route-health.spec.ts`, and `tools/v8-route-health/index.ts`.
- `tools/v8-route-health/index.ts` writes `tests/reports/v8-route-health.json` and discovers route links from `/apps/` and `/examples/`.
- `tests/browser/v8-route-health.spec.ts` expects root registry links including `/apps/v8-animation-keyframes/`, `/apps/v8-skinning-blending/`, `/apps/v8-camera/`, and `/apps/v8-parallax-barrier/`.
- `tests/browser/v8-v7-animation-route-health.spec.ts` directly verifies `/apps/v7-animation-keyframes/`.
- `package.json` has `v9:route-health` calling `tools/v9-route-health/index.ts`.
- `package.json` has `wow:screenshots` calling `tests/browser/wow-showcase-screenshots.spec.ts`.
- `tests/browser/wow-showcase-screenshots.spec.ts` directly verifies `/apps/wow-kira-ik-room/` and writes `tests/reports/wow-authored/authored-quality-report.json`.

These should become taxonomy-neutral health checks only after route aliases exist. Until then, they are the safety net that prevents a naming cleanup from breaking already fragile visual/demo routes.

## Classification Strategy

Classify each versioned or `wow` occurrence before deciding whether it can move:

| Class | Detection rule | Rename rule |
| --- | --- | --- |
| Public API | `package.json` exports, package source namespace imported by consumers, documented import specifiers | Do not remove. Add taxonomy-neutral exports first, keep old export aliases, document semver migration. |
| Route URL | `apps/*`, `examples/*`, `templates/*` served by Vite, `page.goto()` targets, root route registry entries | Do not rename in place. Add alias/redirect route, update registry and Playwright specs, then move content. |
| Fixture path | `fixtures/**`, GLB/HDR/manifest paths in source, tests, reports, docs | Rename only with manifest and loader/test updates; preserve provenance labels if version is historical. |
| Generated report path | `tests/reports/**`, report writer constants, README evidence references, visual-review metadata | Prefer immutable old evidence. If moved, update writers, readers, audits, README references, and hash metadata together. |
| Test file | `tests/**/*.spec.ts`, `tests/**/*.test.ts`, browser HTML harnesses | Rename with script lanes, imports, report paths, and route URLs. |
| Internal tool | `tools/v*-*`, tool schemas, generated report writer IDs | Alias scripts first. Rename tool directory only after consumers and report schema names are evaluated. |
| Historical doc | `docs/project/v*-*`, old execution prompts, release notes, audits | Usually keep version label as historical provenance. Add taxonomy-neutral index pages instead of rewriting history. |
| Temporary artifact | stale reports, old authored screenshots, focused-run folders, quarantine outputs | Do not rename. Decide keep/delete/archive in a separate cleanup with evidence-retention rules. |
| Workflow | `.github/workflows/v*-*.yml`, release artifact workflow copies | Rename only with badge/docs references and release handoff expectations. |

## Migration Batches

1. Freeze and manifest: generate a full machine-readable manifest from the commands below and commit it as the baseline for the migration PR.
2. Docs-only taxonomy: add taxonomy-neutral docs indexes that point to historical `v*` docs; do not rename historical docs yet.
3. Script aliases: add new script aliases in `package.json` while keeping every existing `v*` and `wow` script. Verify old and new aliases invoke the same commands.
4. Public export aliases: add taxonomy-neutral package exports while preserving `./v6`, `./v9`, `./rendering/v6`, `./rendering/v9`, `./assets/v6`, `./assets/v9`, and `./workflows/v6`.
5. Route alias layer: add route aliases/redirects for app, example, and template URLs. Update route registry and specs to assert both legacy and taxonomy-neutral URLs during the transition.
6. Report writer migration: only after route aliases pass, move report writers/readers to taxonomy-neutral report roots while preserving old evidence or writing compatibility copies.
7. Fixture migration: move fixtures last, because source, tests, tools, docs, and generated evidence all depend on stable fixture paths.
8. Deprecation cleanup: remove old names only after at least one release cycle where old and new names both pass verification.

## Verification Gates Per Batch

Minimum gates from `execute.md` section 11:

```text
pnpm typecheck
pnpm verify:imports
pnpm exec playwright test <exact affected route specs> --reporter=line
```

Additional gates by class:

| Class moved | Required additional checks |
| --- | --- |
| Public API | package build, package smoke, external consumer smoke, docs import scan |
| Route URL | affected Playwright specs, route-health specs, root route registry inspection |
| Report path | report writer lane, report audit, README evidence reference scan |
| Fixture path | asset tests, browser specs consuming fixture, manifest/provenance scan |
| Tool path | script lane using old and new names, generated report schema check |
| Template path | create-g3d integration test and external Vite build |
| Workflow | workflow YAML lint or dry-run equivalent plus README badge/reference scan |

## Refresh Commands

Run these before any rename batch and save the output as the batch manifest:

```sh
rg -n '(^|[-_/\.])(v1|v2|v3|v4|v5|v6|v7|v8|v9|v10|wow)(?=$|[-_/\.])' \
  apps examples fixtures tools tests docs/project templates packages benchmarks release-artifacts .github README.md package.json
```

```sh
find apps examples fixtures tools tests docs/project templates packages benchmarks release-artifacts .github \
  -path '*/node_modules' -prune -o -print | \
  rg '(^|[-_/\.])(v1|v2|v3|v4|v5|v6|v7|v8|v9|v10|wow)(?=$|[-_/\.])'
```

```sh
rg -n '/apps/(v[0-9]+|wow)-|/examples/.*v[0-9]|/templates/v[0-9]|/tests/browser/v[0-9]|tests/reports/(v[0-9]+|wow)' \
  README.md package.json tests apps examples tools docs/project
```

## Immediate No-Rename Recommendations

- Do not rename `apps/v8-*` before the V9 parity specs stop navigating to V8 route URLs.
- Do not rename `apps/wow-*` before `wow:screenshots` has taxonomy-neutral aliases and current screenshot evidence.
- Do not rename `tests/reports/v9/**` while the V9 advanced gallery remains a blocked candidate evidence surface.
- Do not rename public exports such as `./v6` or `./v9` until replacement exports are added and documented.
- Keep historical `docs/project/v*-*` filenames unless the document is an active current-status page; historical version labels are useful provenance.
