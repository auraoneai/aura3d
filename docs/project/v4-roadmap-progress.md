# V4 Progress

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


Current status: complete
Current milestone: complete
Last verified command: `pnpm v4:release`
Last verified at: `2026-05-14T13:17:06.078Z`

## Completed Milestones

- [x] Milestone 0 - V4 Truth, Progress, And Failure Ledger
- [x] Milestone 1 - Reference Assets, Environments, And Visual Targets
- [x] Milestone 2 - HDR, Color Management, And Tone Mapping
- [x] Milestone 3 - IBL / Environment Pipeline
- [x] Milestone 4 - Physical Material Matrix
- [x] Milestone 5 - Shadows, AO, And Postprocess
- [x] Milestone 6 - Production glTF Corpus
- [x] Milestone 7 - Flagship Product Configurator
- [x] Milestone 8 - Material Studio Pro
- [x] Milestone 9 - Interior Scene / Scene Studio Pro
- [x] Milestone 10 - Asset Studio Pro
- [x] Milestone 11 - Character / Animation Studio Pro
- [x] Milestone 12 - Interactive Showcase Pro
- [x] Milestone 13 - Public V4 App API
- [x] Milestone 14 - Installable Product SDK And Templates
- [x] Milestone 15 - Same-Scene Three.js Visual Parity
- [x] Milestone 16 - Examples, Tutorials, And Gallery
- [x] Milestone 17 - Package And External Consumer Proof
- [x] Milestone 18 - Documentation And Claim Registry
- [x] Milestone 19 - Release Readiness

## Completed Milestone 0 Evidence

Milestone 0 - V4 Truth, Progress, And Failure Ledger

- [x] `docs/project/v4-roadmap-visual-engine-plan.md`
- [x] `docs/project/v4-roadmap-status.md`
- [x] `docs/project/v4-roadmap-progress.md`
- [x] `docs/project/v4-roadmap-blocked-claims.md`
- [x] `docs/project/v4-roadmap-visual-failures.md`
- [x] `tools/v4-truth/index.ts`
- [x] `tools/v4-progress/index.ts`
- [x] `v4:truth` script
- [x] `v4:progress` script
- [x] Verify Milestone 0 exit command.

## Completed Milestone 1 Evidence

Milestone 1 - Reference Assets, Environments, And Visual Targets

- [x] `fixtures/v4/manifest.json`
- [x] `fixtures/v4/environments/manifest.json`
- [x] `fixtures/v4/products/manifest.json`
- [x] `fixtures/v4/materials/manifest.json`
- [x] `fixtures/v4/scenes/manifest.json`
- [x] `fixtures/v4/characters/manifest.json`
- [x] `docs/project/v4-roadmap-reference-visual-targets.md`
- [x] `tools/v4-fixture-readiness/index.ts`
- [x] Add `v4:fixtures` script.
- [x] Verify Milestone 1 exit command.

## Completed Milestone 2 Evidence

Milestone 2 - HDR, Color Management, And Tone Mapping

- [x] `packages/rendering/src/ColorManagement.ts`
- [x] `packages/rendering/src/HDRRenderPipeline.ts`
- [x] `packages/rendering/src/ToneMapping.ts`
- [x] `packages/rendering/src/Exposure.ts`
- [x] `packages/rendering/src/RenderDebugViews.ts`
- [x] `tests/unit/rendering/v4-color-management.test.ts`
- [x] `tests/browser/v4-hdr-pipeline.spec.ts`
- [x] `tools/v4-hdr-readiness/index.ts`
- [x] Add `v4:hdr` script.
- [x] Verify Milestone 2 exit command.

## Completed Milestone 3 Evidence

Milestone 3 - IBL / Environment Pipeline

- [x] `packages/rendering/src/EnvironmentPipeline.ts`
- [x] `packages/rendering/src/IBL.ts`
- [x] `packages/rendering/src/PMREM.ts`
- [x] `packages/rendering/src/BRDFLut.ts`
- [x] `fixtures/v4/environments/manifest.json`
- [x] `tests/unit/rendering/v4-ibl.test.ts`
- [x] `tests/browser/v4-ibl-visual.spec.ts`
- [x] `tools/v4-ibl-readiness/index.ts`
- [x] Add `v4:ibl` script.
- [x] Verify Milestone 3 exit command.

## Completed Milestone 4 Evidence

Milestone 4 - Physical Material Matrix

- [x] `packages/rendering/src/materials/PhysicalMaterial.ts`
- [x] `packages/rendering/src/materials/MaterialExtensions.ts`
- [x] `packages/rendering/src/materials/AlphaSorting.ts`
- [x] `packages/rendering/src/materials/TransmissionPass.ts`
- [x] `tests/unit/rendering/v4-physical-material.test.ts`
- [x] `tests/browser/v4-material-matrix.spec.ts`
- [x] `tools/v4-pbr-readiness/index.ts`
- [x] Add `v4:pbr` script.
- [x] Verify Milestone 4 exit command.

## Completed Milestone 5 Evidence

Milestone 5 - Shadows, AO, And Postprocess

- [x] `packages/rendering/src/shadows/ContactShadows.ts`
- [x] `packages/rendering/src/shadows/CascadedShadowPipeline.ts`
- [x] `packages/rendering/src/shadows/ShadowDebugViews.ts`
- [x] `packages/rendering/src/postprocess/BloomPass.ts`
- [x] `packages/rendering/src/postprocess/SSAOPass.ts`
- [x] `packages/rendering/src/postprocess/DepthOfFieldPass.ts`
- [x] `packages/rendering/src/postprocess/ColorGradingPass.ts`
- [x] `tests/browser/v4-shadow-quality.spec.ts`
- [x] `tests/browser/v4-postprocess-suite.spec.ts`
- [x] `tools/v4-shadow-readiness/index.ts`
- [x] `tools/v4-postprocess-readiness/index.ts`
- [x] `packages/rendering/src/performance/RendererStats.ts`
- [x] `packages/rendering/src/performance/ResourceBudget.ts`
- [x] `packages/rendering/src/performance/RenderItemSorting.ts`
- [x] `packages/rendering/src/performance/LOD.ts`
- [x] `tests/browser/v4-large-scene.spec.ts`
- [x] `tests/performance/v4-performance-baselines.ts`
- [x] `tools/v4-performance-readiness/index.ts`
- [x] Add `v4:lighting-post` script.
- [x] Add `v4:performance` script.
- [x] Verify Milestone 5 exit command.

## Completed Milestone 6 Evidence

Milestone 6 - Production glTF Corpus

- [x] `fixtures/v4/gltf-corpus/manifest.json`
- [x] `fixtures/v4/gltf-corpus/licenses.md`
- [x] `packages/assets/src/V4Corpus.ts`
- [x] `tests/assets/v4-gltf-loader-corpus.test.ts`
- [x] `tests/browser/v4-gltf-visual-corpus.spec.ts`
- [x] `tools/v4-gltf-corpus-readiness/index.ts`
- [x] Add `v4:gltf` script.
- [x] Verify Milestone 6 exit command.

## Completed Milestone 7 Evidence

Milestone 7 - Flagship Product Configurator

- [x] `fixtures/v4/products/premium-product/`
- [x] `apps/product-studio-pro/`
- [x] `examples/product-configurator-v4/`
- [x] `benchmarks/v4/galileo/product-configurator.ts`
- [x] `benchmarks/v4/threejs/product-configurator.ts`
- [x] `tests/browser/v4-product-configurator.spec.ts`
- [x] `tools/v4-product-readiness/index.ts`
- [x] Add `v4:product` script.
- [x] Verify Milestone 7 exit command.

## Completed Milestone 8 Evidence

Milestone 8 - Material Studio Pro

- [x] `fixtures/v4/materials/material-library.json`
- [x] `fixtures/v4/materials/textures/`
- [x] `apps/material-studio-pro/`
- [x] `examples/material-studio-v4/`
- [x] `benchmarks/v4/galileo/material-studio.ts`
- [x] `benchmarks/v4/threejs/material-studio.ts`
- [x] `tests/browser/v4-material-studio-pro.spec.ts`
- [x] `tools/v4-material-studio-readiness/index.ts`
- [x] Add `v4:material-studio` script.
- [x] Verify Milestone 8 exit command.

## Completed Milestone 9 Evidence

Milestone 9 - Interior Scene / Scene Studio Pro

- [x] `fixtures/v4/scenes/interior-gallery/`
- [x] `apps/scene-studio-pro/`
- [x] `examples/interior-scene-v4/`
- [x] `benchmarks/v4/galileo/interior-scene.ts`
- [x] `benchmarks/v4/threejs/interior-scene.ts`
- [x] `tests/browser/v4-interior-scene.spec.ts`
- [x] `tools/v4-scene-readiness/index.ts`
- [x] Add `v4:scene` script.
- [x] Verify Milestone 9 exit command.

## Completed Milestone 10 Evidence

Milestone 10 - Asset Studio Pro

- [x] `apps/asset-studio-pro/`
- [x] `examples/asset-gallery-v4/`
- [x] Corpus browser UI.
- [x] Asset diagnostics UI.
- [x] `tests/browser/v4-asset-studio-pro.spec.ts`
- [x] `tools/v4-asset-studio-readiness/index.ts`
- [x] Add `v4:asset-studio` script.
- [x] Verify Milestone 10 exit command.

## Completed Milestone 11 Evidence

Milestone 11 - Character / Animation Studio Pro

- [x] Character fixture.
- [x] `apps/animation-studio-pro/`
- [x] `examples/character-viewer-v4/`
- [x] Timeline/scrub UI.
- [x] `tests/browser/v4-character-viewer.spec.ts`
- [x] `tools/v4-character-readiness/index.ts`
- [x] Add `v4:character` script.
- [x] Verify Milestone 11 exit command.

## Completed Milestone 12 Evidence

Milestone 12 - Interactive Showcase Pro

- [x] Interactive showcase app.
- [x] `examples/interactive-showcase-v4/`
- [x] Camera controls.
- [x] Selection/variant interaction.
- [x] `tests/browser/v4-interactive-showcase.spec.ts`
- [x] `tools/v4-interactive-readiness/index.ts`
- [x] Add `v4:interactive` script.
- [x] Verify Milestone 12 exit command.

## Completed Milestone 13 Evidence

Milestone 13 - Public V4 App API

- [x] `createG3DApp`.
- [x] `packages/engine/src/G3DApp.ts`
- [x] `packages/engine/src/G3DQualityPresets.ts`
- [x] `packages/workflows/src/v4/index.ts`
- [x] Quality presets.
- [x] Workflow presets.
- [x] Diagnostics.
- [x] Public docs.
- [x] `tests/unit/engine/v4-app-api.test.ts`
- [x] `tests/browser/v4-public-api-app.spec.ts`
- [x] `tools/v4-api-readiness/index.ts`
- [x] Add `v4:api` script.
- [x] Verify Milestone 13 exit command.

## Completed Milestone 14 Evidence

Milestone 14 - Installable Product SDK And Templates

- [x] `packages/engine` root product API.
- [x] `packages/create-g3d` project scaffolder.
- [x] `templates/v4-product-viewer/`
- [x] `templates/v4-material-studio/`
- [x] `templates/v4-asset-gallery/`
- [x] `templates/v4-interactive-scene/`
- [x] `packages/create-g3d/templates/product-viewer/`
- [x] `packages/create-g3d/templates/material-studio/`
- [x] `packages/create-g3d/templates/asset-gallery/`
- [x] `packages/create-g3d/templates/interactive-scene/`
- [x] V4 templates render through public root `@galileo3d/engine` APIs.
- [x] External Vite production build proof from a packed package.
- [x] Static preview proof.
- [x] Template docs.
- [x] `tests/reports/v4-create-g3d-templates.json`
- [x] Template screenshots for product viewer, material studio, asset gallery, and interactive scene.
- [x] `tests/unit/engine/v4-public-api-stability.test.ts`
- [x] `tests/integration/v4-create-g3d.test.ts`
- [x] `tests/browser/v4-template-product-viewer.spec.ts`
- [x] `tools/v4-template-readiness/index.ts`
- [x] `tools/v4-external-vite-build/index.ts`
- [x] `tools/v4-static-preview-smoke/index.ts`
- [x] Add `v4:templates` script.
- [x] Verify Milestone 14 exit command.

## Completed Milestone 15 Evidence

Milestone 15 - Same-Scene Three.js Visual Parity

- [x] 7 same-scene comparisons, including large-scene performance.
- [x] Diff images.
- [x] Visual scoring.
- [x] Line counts.
- [x] Runtime stats.
- [x] Gap report.
- [x] `tests/browser/v4-threejs-visual-parity.spec.ts`
- [x] `tools/v4-threejs-visual-parity/index.ts`
- [x] Add `v4:compare-threejs` script.
- [x] Verify Milestone 15 exit command.

## Completed Milestone 16 Evidence

Milestone 16 - Examples, Tutorials, And Gallery

- [x] V4 examples.
- [x] V4 tutorials.
- [x] `examples/hdr-ibl-v4/`
- [x] `examples/postprocess-v4/`
- [x] `docs/project/tutorials-v4-hdr-ibl.md`
- [x] `docs/project/tutorials-v4-product-configurator.md`
- [x] `docs/project/tutorials-v4-material-studio.md`
- [x] `docs/project/tutorials-v4-asset-gallery.md`
- [x] `docs/project/tutorials-v4-interior-scene.md`
- [x] `docs/project/tutorials-v4-character-viewer.md`
- [x] `docs/project/tutorials-v4-performance.md`
- [x] Screenshot gallery.
- [x] Screenshot group aliases for `interior`, `character`, `threejs-comparison`, `debug-views`, and `postprocess`.
- [x] Visual QA report.
- [x] `tests/browser/v4-examples.spec.ts`
- [x] `tools/v4-examples-readiness/index.ts`
- [x] `tools/v4-screenshot-gallery/index.ts`
- [x] `tools/v4-roadmap-visual-quality/index.ts`
- [x] Add `v4:examples` script.
- [x] Verify Milestone 16 exit command.

## Completed Milestone 17 Evidence

Milestone 17 - Package And External Consumer Proof

- [x] Package smoke.
- [x] External Vite app.
- [x] External app renders flagship scene.
- [x] External app loads asset.
- [x] External app captures screenshot.
- [x] External app runs from production build/static preview.
- [x] External app imports only public package APIs.
- [x] `tools/v4-package-smoke/index.ts`
- [x] `tools/v4-external-consumer/index.ts`
- [x] `tools/v4-external-vite-build/index.ts`
- [x] `tools/v4-static-preview-smoke/index.ts`
- [x] Add `v4:package` script.
- [x] Verify Milestone 17 exit command.

## Completed Milestone 18 Evidence

Milestone 18 - Documentation And Claim Registry

- [x] `docs/project/v4-roadmap-product-positioning.md`
- [x] `docs/project/v4-roadmap-getting-started.md`
- [x] `docs/project/v4-roadmap-product-viewer-guide.md`
- [x] `docs/project/v4-roadmap-material-authoring-guide.md`
- [x] `docs/project/v4-roadmap-asset-pipeline-guide.md`
- [x] `docs/project/v4-roadmap-hdr-ibl-guide.md`
- [x] `docs/project/v4-roadmap-threejs-migration-guide.md`
- [x] `docs/project/v4-roadmap-visual-quality-status.md`
- [x] `docs/project/v4-roadmap-threejs-parity-status.md`
- [x] `docs/project/v4-roadmap-supported-workflows.md`
- [x] `docs/project/v4-roadmap-known-gaps.md`
- [x] `docs/project/v4-roadmap-release-notes.md`
- [x] README update.
- [x] `tools/v4-docs-readiness/index.ts`
- [x] `tools/v4-claim-registry/index.ts`
- [x] Add `v4:docs` script.
- [x] Verify Milestone 18 exit command.

## Completed Milestone 19 Evidence

Milestone 19 - Release Readiness

- [x] `tools/v4-release-readiness/index.ts`
- [x] `tools/v4-roadmap-completion-audit/index.ts`
- [x] `docs/project/v4-roadmap-human-visual-review.md`
- [x] Add `v4:release` script.
- [x] Verify Milestone 19 exit command.

## Active Milestone

None - V4 release is complete.

## Known Gaps

- Broad Three.js replacement remains blocked until full API, ecosystem, performance, and long-tail compatibility parity are proven.
- Full Three.js API replacement remains blocked.
- Unity, Unreal, and full game engine replacement claims remain blocked.
- Full glTF ecosystem parity, full WebGPU parity, and full commercial DCC pipeline parity remain blocked.

## Blocked Claims

- Broad Three.js replacement.
- Full Three.js API replacement.
- Unity replacement.
- Unreal replacement.
- Full game engine replacement.
- Full glTF ecosystem parity.
- Full WebGPU parity.
- Broad performance superiority.
- Full commercial DCC pipeline parity.
