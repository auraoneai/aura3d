# Versioned Naming Migration Inventory Plan

Captured: 2026-05-19

Owner scope: naming/docs/legacy route health inventory only.

Status: inventory and migration plan only. No path, route, export, script, fixture, report, or source rename has been performed by this document.

## Source Directive

`execute.md` section 11 says the repository contains iterative names such as `v1` through `v10` and that those names are not product taxonomy. It requires an inventory before any rename, classification by dependency surface, compatibility aliases or redirects where needed, and exact verification after every rename batch.

The same section marks these high-risk areas:

- `apps/v8-*`, `apps/v9-*`, and `apps/production-runtime-*`
- `examples/*-v1`, `examples/*-v3`, `examples/*-v4`, `examples/three-compat-examples-*`, and `examples/production-runtime-examples`
- older versioned fixture roots through `fixtures/advanced-gallery`
- `tools/v2-*` through `tools/v10-*`
- `tests/browser/v3-*` through `tests/browser/v9-*`
- `tests/reports/v7`, `tests/reports/v8`, and `tests/reports/v9`
- `docs/project/v2-*` through `docs/project/v10-*`
- root `package.json` scripts and public exports such as `./production-runtime`, `./v9`, `./rendering/production-runtime`, `./rendering/v9`, `./assets/production-runtime`, and `./assets/v9`
- `templates/v4-*`, `templates/three-compat-*`, and `templates/production-runtime-*`
- GitHub workflows with versioned names

## Machine-Readable Summary

```json
{
  "schema": "a3d-versioned-naming-migration-inventory-plan/v1",
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
  "matchTokens": ["v1", "v2", "v3", "v4", "three-compat", "production-runtime", "v7", "v8", "v9", "v10", "wow"],
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
| `three-compat` | 652 | `apps`, `examples`, `fixtures`, `tools`, `tests`, `docs`, `templates`, `packages`, `benchmarks` |
| `production-runtime` | 599 | `apps`, `examples`, `fixtures`, `tools`, `tests`, `docs`, `templates`, `packages`, `benchmarks` |
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
| Templates | 36 | 78 | High | Treat as public starter names. Migrate with create-aura3d/template references. |
| Package source namespaces | 66 | 229 | Critical | Public exports and source folders require semver/API migration notes and compatibility aliases. |
| Benchmarks | 17 | 32 | High | Rename with script lanes and report references. |
| Release artifacts | 73 | 164 | High | Prefer immutable historical artifact names unless release packaging is rebuilt. |
| GitHub workflows | 0 | 2 | High | Rename only with badge/docs references and workflow trigger expectations. |

## Route URL Inventory

These roots are route-like or app-like names and must not be renamed without route aliases plus browser spec updates.

### `apps/` Versioned And WOW Roots

```text
apps/legacy-common
apps/three-compat-animation-studio-pro
apps/three-compat-asset-studio-pro
apps/three-compat-controls-lab
apps/three-compat-large-scene-lab
apps/three-compat-material-studio-pro
apps/three-compat-postprocess-studio-pro
apps/three-compat-product-studio-pro
apps/three-compat-scene-studio-pro
apps/three-compat-shader-lab-pro
apps/three-compat-threejs-migration-lab
apps/architecture-viewer
apps/asset-inspector
apps/automotive-configurator
apps/character-viewer
apps/cinematic-postprocess
apps/common
apps/large-scene-lab
apps/material-studio
apps/product-configurator
apps/threejs-parity-lab
apps/webgpu-lab
apps/regression-animation-keyframes
apps/example-parity-lab
apps/animation-keyframes
apps/animation-multiple
apps/animation-walk
apps/camera
apps/camera-multiple-views
apps/controls-orbit
apps/controls-trackball
apps/controls-transform
apps/decals
apps/flagship-viewer
apps/geometry-drawrange
apps/instancing-performance
apps/interactive-picking
apps/lights-spotlight
apps/lines-helpers
apps/loader-compression
apps/loader-gltf-variants
apps/loader-instancing
apps/loader-ktx2
apps/loader-material-extensions
apps/loader-obj
apps/materials-transmission
apps/parallax-barrier
apps/physics-showcase
apps/postprocessing-bloom
apps/postprocessing-depth-outline
apps/shadowmap-viewer
apps/skinning-additive
apps/skinning-blending
apps/skinning-ik
apps/skinning-morph
apps/stereo-effects
apps/texture-anisotropy
apps/webgpu-compute
apps/webgpu-instance-uniform
apps/webgpu-materials
apps/webgpu-rtt
apps/webxr-interactions
apps/advanced-examples-gallery
apps/public-scene
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
examples/external-asset-gallery
examples/legacy-asset-viewer
examples/foundation-asset-viewer
examples/external-character-viewer
examples/foundation-game-slice
examples/external-hdr-ibl
examples/foundation-interactive-scene
examples/external-interactive-showcase
examples/external-interior-scene
examples/legacy-material-studio
examples/foundation-material-studio
examples/external-material-studio
examples/external-postprocess
examples/foundation-product-configurator
examples/external-product-configurator
examples/legacy-product-viewer
examples/legacy-rendering-showcase
examples/three-compat-examples
examples/production-runtime-examples
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
tests/reports/v9/advanced-examples-gallery-authored-three-compat
tests/reports/v9/advanced-examples-gallery-ui-v2
tests/reports/wow-authored
tests/reports/wow-kira-ik-room
tests/reports/wow-showcase
```

## Public API And Script Inventory

Root `package.json` currently exposes versioned public API entry points:

```text
./assets/production-runtime
./assets/v9
./rendering/production-runtime
./rendering/v9
./production-runtime
./v9
./workflows/production-runtime
```

It also contains 203 versioned or `wow` script keys. These are automation contracts because docs, CI, release gates, and workers call them by name. Script migration should use aliases first, then deprecate old names only after all docs and workflows stop using them.

## Legacy Route Health Notes

Existing route-health coverage is itself versioned and must move after the route migration map is stable:

- `package.json` has `v8:route-health` calling `tests/browser/current-routes-route-health.spec.ts`, `tests/browser/current-routes-runtime-parity-animation-route-health.spec.ts`, and `tools/current-routes-route-health/index.ts`.
- `tools/current-routes-route-health/index.ts` writes `tests/reports/current-routes-route-health.json` and discovers route links from `/apps/` and `/examples/`.
- `tests/browser/current-routes-route-health.spec.ts` expects root registry links including `/apps/animation-keyframes/`, `/apps/skinning-blending/`, `/apps/camera/`, and `/apps/parallax-barrier/`.
- `tests/browser/current-routes-runtime-parity-animation-route-health.spec.ts` directly verifies `/apps/regression-animation-keyframes/`.
- `package.json` has `v9:route-health` calling `tools/threejs-parity-route-health/index.ts`.
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
4. Public export aliases: add taxonomy-neutral package exports while preserving `./production-runtime`, `./v9`, `./rendering/production-runtime`, `./rendering/v9`, `./assets/production-runtime`, `./assets/v9`, and `./workflows/production-runtime`.
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
| Template path | create-aura3d integration test and external Vite build |
| Workflow | workflow YAML lint or dry-run equivalent plus README badge/reference scan |

## Refresh Commands

Run these before any rename batch and save the output as the batch manifest:

```sh
rg -n '(^|[-_/\.])(v1|v2|v3|v4|three-compat|production-runtime|v7|v8|v9|v10|wow)(?=$|[-_/\.])' \
  apps examples fixtures tools tests docs/project templates packages benchmarks release-artifacts .github README.md package.json
```

```sh
find apps examples fixtures tools tests docs/project templates packages benchmarks release-artifacts .github \
  -path '*/node_modules' -prune -o -print | \
  rg '(^|[-_/\.])(v1|v2|v3|v4|three-compat|production-runtime|v7|v8|v9|v10|wow)(?=$|[-_/\.])'
```

```sh
rg -n '/apps/(v[0-9]+|wow)-|/examples/.*v[0-9]|/templates/v[0-9]|/tests/browser/v[0-9]|tests/reports/(v[0-9]+|wow)' \
  README.md package.json tests apps examples tools docs/project
```

## Immediate No-Rename Recommendations

- Do not rename `apps/v8-*` before the V9 parity specs stop navigating to V8 route URLs.
- Do not rename `apps/wow-*` before `wow:screenshots` has taxonomy-neutral aliases and current screenshot evidence.
- Do not rename `tests/reports/v9/**` while the V9 advanced gallery remains a blocked candidate evidence surface.
- Do not rename public exports such as `./production-runtime` or `./v9` until replacement exports are added and documented.
- Keep historical `docs/project/v*-*` filenames unless the document is an active current-status page; historical version labels are useful provenance.
