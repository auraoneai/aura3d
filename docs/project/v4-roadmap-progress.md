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
- [x] `tools/external-parity-truth/index.ts`
- [x] `tools/external-parity-progress/index.ts`
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
- [x] `tools/external-parity-fixture-readiness/index.ts`
- [x] Add `v4:fixtures` script.
- [x] Verify Milestone 1 exit command.

## Completed Milestone 2 Evidence

Milestone 2 - HDR, Color Management, And Tone Mapping

- [x] `packages/rendering/src/ColorManagement.ts`
- [x] `packages/rendering/src/HDRRenderPipeline.ts`
- [x] `packages/rendering/src/ToneMapping.ts`
- [x] `packages/rendering/src/Exposure.ts`
- [x] `packages/rendering/src/RenderDebugViews.ts`
- [x] `tests/unit/rendering/external-parity-color-management.test.ts`
- [x] `tests/browser/external-parity-hdr-pipeline.spec.ts`
- [x] `tools/external-parity-hdr-readiness/index.ts`
- [x] Add `v4:hdr` script.
- [x] Verify Milestone 2 exit command.

## Completed Milestone 3 Evidence

Milestone 3 - IBL / Environment Pipeline

- [x] `packages/rendering/src/EnvironmentPipeline.ts`
- [x] `packages/rendering/src/IBL.ts`
- [x] `packages/rendering/src/PMREM.ts`
- [x] `packages/rendering/src/BRDFLut.ts`
- [x] `fixtures/v4/environments/manifest.json`
- [x] `tests/unit/rendering/external-parity-ibl.test.ts`
- [x] `tests/browser/external-parity-ibl-visual.spec.ts`
- [x] `tools/external-parity-ibl-readiness/index.ts`
- [x] Add `v4:ibl` script.
- [x] Verify Milestone 3 exit command.

## Completed Milestone 4 Evidence

Milestone 4 - Physical Material Matrix

- [x] `packages/rendering/src/materials/PhysicalMaterial.ts`
- [x] `packages/rendering/src/materials/MaterialExtensions.ts`
- [x] `packages/rendering/src/materials/AlphaSorting.ts`
- [x] `packages/rendering/src/materials/TransmissionPass.ts`
- [x] `tests/unit/rendering/external-parity-physical-material.test.ts`
- [x] `tests/browser/external-parity-material-matrix.spec.ts`
- [x] `tools/external-parity-pbr-readiness/index.ts`
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
- [x] `tests/browser/external-parity-shadow-quality.spec.ts`
- [x] `tests/browser/external-parity-postprocess-suite.spec.ts`
- [x] `tools/external-parity-shadow-readiness/index.ts`
- [x] `tools/external-parity-postprocess-readiness/index.ts`
- [x] `packages/rendering/src/performance/RendererStats.ts`
- [x] `packages/rendering/src/performance/ResourceBudget.ts`
- [x] `packages/rendering/src/performance/RenderItemSorting.ts`
- [x] `packages/rendering/src/performance/LOD.ts`
- [x] `tests/browser/external-parity-large-scene.spec.ts`
- [x] `tests/performance/external-parity-performance-baselines.ts`
- [x] `tools/external-parity-performance-readiness/index.ts`
- [x] Add `v4:lighting-post` script.
- [x] Add `v4:performance` script.
- [x] Verify Milestone 5 exit command.

## Completed Milestone 6 Evidence

Milestone 6 - Production glTF Corpus

- [x] `fixtures/v4/gltf-corpus/manifest.json`
- [x] `fixtures/v4/gltf-corpus/licenses.md`
- [x] `packages/assets/src/V4Corpus.ts`
- [x] `tests/assets/external-parity-gltf-loader-corpus.test.ts`
- [x] `tests/browser/external-parity-gltf-visual-corpus.spec.ts`
- [x] `tools/external-parity-gltf-corpus-readiness/index.ts`
- [x] Add `v4:gltf` script.
- [x] Verify Milestone 6 exit command.

## Completed Milestone 7 Evidence

Milestone 7 - Flagship Product Configurator

- [x] `fixtures/v4/products/premium-product/`
- [x] `apps/product-studio-pro/`
- [x] `examples/external-product-configurator/`
- [x] `benchmarks/external-parity/galileo/product-configurator.ts`
- [x] `benchmarks/external-parity/threejs/product-configurator.ts`
- [x] `tests/browser/external-parity-product-configurator.spec.ts`
- [x] `tools/external-parity-product-readiness/index.ts`
- [x] Add `v4:product` script.
- [x] Verify Milestone 7 exit command.

## Completed Milestone 8 Evidence

Milestone 8 - Material Studio Pro

- [x] `fixtures/v4/materials/material-library.json`
- [x] `fixtures/v4/materials/textures/`
- [x] `apps/material-studio-pro/`
- [x] `examples/external-material-studio/`
- [x] `benchmarks/external-parity/galileo/material-studio.ts`
- [x] `benchmarks/external-parity/threejs/material-studio.ts`
- [x] `tests/browser/external-parity-material-studio-pro.spec.ts`
- [x] `tools/external-parity-material-studio-readiness/index.ts`
- [x] Add `v4:material-studio` script.
- [x] Verify Milestone 8 exit command.

## Completed Milestone 9 Evidence

Milestone 9 - Interior Scene / Scene Studio Pro

- [x] `fixtures/v4/scenes/interior-gallery/`
- [x] `apps/scene-studio-pro/`
- [x] `examples/external-interior-scene/`
- [x] `benchmarks/external-parity/galileo/interior-scene.ts`
- [x] `benchmarks/external-parity/threejs/interior-scene.ts`
- [x] `tests/browser/external-parity-interior-scene.spec.ts`
- [x] `tools/external-parity-scene-readiness/index.ts`
- [x] Add `v4:scene` script.
- [x] Verify Milestone 9 exit command.

## Completed Milestone 10 Evidence

Milestone 10 - Asset Studio Pro

- [x] `apps/asset-studio-pro/`
- [x] `examples/external-asset-gallery/`
- [x] Corpus browser UI.
- [x] Asset diagnostics UI.
- [x] `tests/browser/external-parity-asset-studio-pro.spec.ts`
- [x] `tools/external-parity-asset-studio-readiness/index.ts`
- [x] Add `v4:asset-studio` script.
- [x] Verify Milestone 10 exit command.

## Completed Milestone 11 Evidence

Milestone 11 - Character / Animation Studio Pro

- [x] Character fixture.
- [x] `apps/animation-studio-pro/`
- [x] `examples/external-character-viewer/`
- [x] Timeline/scrub UI.
- [x] `tests/browser/external-parity-character-viewer.spec.ts`
- [x] `tools/external-parity-character-readiness/index.ts`
- [x] Add `v4:character` script.
- [x] Verify Milestone 11 exit command.

## Completed Milestone 12 Evidence

Milestone 12 - Interactive Showcase Pro

- [x] Interactive showcase app.
- [x] `examples/external-interactive-showcase/`
- [x] Camera controls.
- [x] Selection/variant interaction.
- [x] `tests/browser/external-parity-interactive-showcase.spec.ts`
- [x] `tools/external-parity-interactive-readiness/index.ts`
- [x] Add `v4:interactive` script.
- [x] Verify Milestone 12 exit command.

## Completed Milestone 13 Evidence

Milestone 13 - Public V4 App API

- [x] `createG3DApp`.
- [x] `packages/engine/src/G3DApp.ts`
- [x] `packages/engine/src/G3DQualityPresets.ts`
- [x] `packages/workflows/src/workflow-foundation/index.ts`
- [x] Quality presets.
- [x] Workflow presets.
- [x] Diagnostics.
- [x] Public docs.
- [x] `tests/unit/engine/external-parity-app-api.test.ts`
- [x] `tests/browser/external-parity-public-api-app.spec.ts`
- [x] `tools/external-parity-api-readiness/index.ts`
- [x] Add `v4:api` script.
- [x] Verify Milestone 13 exit command.

## Completed Milestone 14 Evidence

Milestone 14 - Installable Product SDK And Templates

- [x] `packages/engine` root product API.
- [x] `packages/create-g3d` project scaffolder.
- [x] `templates/external-parity-product-viewer/`
- [x] `templates/external-parity-material-studio/`
- [x] `templates/external-parity-asset-gallery/`
- [x] `templates/external-parity-interactive-scene/`
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
- [x] `tests/unit/engine/external-parity-public-api-stability.test.ts`
- [x] `tests/integration/external-parity-create-g3d.test.ts`
- [x] `tests/browser/external-parity-template-product-viewer.spec.ts`
- [x] `tools/external-parity-template-readiness/index.ts`
- [x] `tools/external-parity-external-vite-build/index.ts`
- [x] `tools/external-parity-static-preview-smoke/index.ts`
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
- [x] `tests/browser/external-parity-threejs-visual-parity.spec.ts`
- [x] `tools/external-parity-threejs-visual-parity/index.ts`
- [x] Add `v4:compare-threejs` script.
- [x] Verify Milestone 15 exit command.

## Completed Milestone 16 Evidence

Milestone 16 - Examples, Tutorials, And Gallery

- [x] V4 examples.
- [x] V4 tutorials.
- [x] `examples/external-hdr-ibl/`
- [x] `examples/external-postprocess/`
- [x] `docs/project/tutorials-v4-hdr-ibl.md`
- [x] `docs/project/tutorials-v4-product-configurator.md`
- [x] `docs/project/tutorials-external-parity-material-studio.md`
- [x] `docs/project/tutorials-external-parity-asset-gallery.md`
- [x] `docs/project/tutorials-v4-interior-scene.md`
- [x] `docs/project/tutorials-v4-character-viewer.md`
- [x] `docs/project/tutorials-v4-performance.md`
- [x] Screenshot gallery.
- [x] Screenshot group aliases for `interior`, `character`, `threejs-comparison`, `debug-views`, and `postprocess`.
- [x] Visual QA report.
- [x] `tests/browser/external-parity-examples.spec.ts`
- [x] `tools/external-parity-examples-readiness/index.ts`
- [x] `tools/external-parity-screenshot-gallery/index.ts`
- [x] `tools/external-parity-roadmap-visual-quality/index.ts`
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
- [x] `tools/external-parity-package-smoke/index.ts`
- [x] `tools/external-parity-external-consumer/index.ts`
- [x] `tools/external-parity-external-vite-build/index.ts`
- [x] `tools/external-parity-static-preview-smoke/index.ts`
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
- [x] `docs/project/external-parity-roadmap-visual-quality-status.md`
- [x] `docs/project/v4-roadmap-threejs-parity-status.md`
- [x] `docs/project/v4-roadmap-supported-workflows.md`
- [x] `docs/project/v4-roadmap-known-gaps.md`
- [x] `docs/project/v4-roadmap-release-notes.md`
- [x] README update.
- [x] `tools/external-parity-docs-readiness/index.ts`
- [x] `tools/external-parity-claim-registry/index.ts`
- [x] Add `v4:docs` script.
- [x] Verify Milestone 18 exit command.

## Completed Milestone 19 Evidence

Milestone 19 - Release Readiness

- [x] `tools/external-parity-release-readiness/index.ts`
- [x] `tools/external-parity-roadmap-completion-audit/index.ts`
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
