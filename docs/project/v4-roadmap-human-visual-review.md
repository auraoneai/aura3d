# V4 Human Visual Review

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


Review date: 2026-05-14

This is a release-readiness review for the current V4 gallery. It is bounded to the supported V4 workflows and does not approve broad Three.js, Unity, Unreal, or full game-engine replacement claims.

## Product Configurator

- Screenshot: `tests/reports/external-gallery/product/external-product-configurator.png`
- Scene id: `external-product-configurator`
- App/example id: `examples/external-product-configurator`
- Renderer backend: WebGL2
- Resolution: captured browser screenshot
- Environment preset: catalog softbox
- Material mode: asset / variant proof
- Draw calls: recorded in `tests/reports/external-parity-product-readiness.json`
- Asset count: pinned BoomBox GLB product asset
- Warnings: see readiness report
- Source file path: `examples/external-product-configurator/ProductConfiguratorV4.ts`
- Premium product judgment: passes for bounded V4 product viewer proof.
- Lighting believable: yes, within the current studio-lighting preset.
- Materials distinguishable: yes, especially across variant evidence.
- Shadows credible: acceptable for the bounded product scene; not a broad shadow benchmark.
- Competitive with Three.js reference: supported by same-scene parity report.
- Still weak: final commercial polish would benefit from licensed HDR environments and richer product-specific UI.

## Material Studio

- Screenshot: `tests/reports/external-gallery/materials/external-material-studio.png`
- Scene id: `external-material-studio`
- App/example id: `examples/external-material-studio`
- Renderer backend: WebGL2
- Resolution: captured browser screenshot
- Environment preset: material studio lighting
- Material mode: metals / comparison
- Draw calls: recorded in `tests/reports/external-parity-material-studio-readiness.json`
- Asset count: procedural material review objects
- Warnings: see readiness report
- Source file path: `examples/external-material-studio/MaterialStudioV4.ts`
- Premium product judgment: passes for bounded material review proof.
- Lighting believable: yes for studio comparison.
- Materials distinguishable: yes.
- Shadows credible: acceptable for the current material proof.
- Competitive with Three.js reference: supported by same-scene material comparisons.
- Still weak: scan-texture realism remains a future quality target.

## Asset Gallery

- Screenshot: `tests/reports/external-gallery/assets/external-asset-gallery.png`
- Scene id: `external-asset-gallery`
- App/example id: `examples/external-asset-gallery`
- Renderer backend: WebGL2
- Resolution: captured browser screenshot
- Environment preset: neutral asset review
- Material mode: asset-authored materials
- Draw calls: recorded in `tests/reports/external-parity-asset-studio-readiness.json`
- Asset count: glTF corpus entries
- Warnings: see asset diagnostics report
- Source file path: `examples/external-asset-gallery/AssetGalleryV4.ts`
- Premium product judgment: passes for bounded asset review proof.
- Lighting believable: yes for inspection/review.
- Materials distinguishable: yes where the source asset exposes material variety.
- Shadows credible: acceptable for asset-review context.
- Competitive with Three.js reference: supported by asset-review same-scene parity.
- Still weak: not a full glTF ecosystem parity claim.

## Interior Scene

- Screenshot: `tests/reports/external-gallery/scenes/external-interior-scene.png`
- Scene id: `external-interior-scene`
- App/example id: `examples/external-interior-scene`
- Renderer backend: WebGL2
- Resolution: captured browser screenshot
- Environment preset: interior gallery
- Material mode: scene-authored PBR
- Draw calls: recorded in `tests/reports/external-parity-scene-readiness.json`
- Asset count: interior scene fixture
- Warnings: see readiness report
- Source file path: `examples/external-interior-scene/InteriorSceneV4.ts`
- Premium product judgment: passes for bounded interior/architecture proof.
- Lighting believable: yes, with gallery/night variants.
- Materials distinguishable: yes.
- Shadows credible: acceptable for V4 bounded proof.
- Competitive with Three.js reference: supported by gallery same-scene parity.
- Still weak: not a full architectural renderer or BIM workflow.

## Character Viewer

- Screenshot: `tests/reports/external-gallery/characters/external-character-viewer.png`
- Scene id: `external-character-viewer`
- App/example id: `examples/external-character-viewer`
- Renderer backend: WebGL2
- Resolution: captured browser screenshot
- Environment preset: character preview
- Material mode: character-authored materials
- Draw calls: recorded in `tests/reports/external-parity-character-readiness.json`
- Asset count: animated character fixture
- Warnings: see readiness report
- Source file path: `examples/external-character-viewer/CharacterViewerV4.ts`
- Premium product judgment: passes for bounded character preview proof.
- Lighting believable: yes for preview use.
- Materials distinguishable: acceptable for current character fixture.
- Shadows credible: acceptable for preview use.
- Competitive with Three.js reference: Three.js parity coverage is bounded to current workflow comparisons; full animation ecosystem parity remains blocked.
- Still weak: not a full animation/DCC pipeline.

## Interactive Showcase

- Screenshot: `tests/reports/external-gallery/interactive/external-interactive-showcase.png`
- Scene id: `external-interactive-showcase`
- App/example id: `examples/external-interactive-showcase`
- Renderer backend: WebGL2
- Resolution: captured browser screenshot
- Environment preset: interactive product lighting
- Material mode: selectable variants
- Draw calls: recorded in `tests/reports/external-parity-interactive-readiness.json`
- Asset count: interactive workflow objects
- Warnings: see readiness report
- Source file path: `examples/external-interactive-showcase/InteractiveShowcaseV4.ts`
- Premium product judgment: passes for lightweight interactive scene proof.
- Lighting believable: yes.
- Materials distinguishable: yes.
- Shadows credible: acceptable for current interaction proof.
- Competitive with Three.js reference: supported by fixed-state interactive same-scene parity.
- Still weak: not input-latency, long-run stability, or full game-engine proof.

## Product Viewer Template / External Consumer

- Screenshot: `tests/reports/external-gallery/templates/external-parity-product-viewer.png`
- External screenshot: `tests/reports/external-parity-external-consumer/external-consumer.png`
- Scene id: `external-parity-product-viewer`
- App/example id: `templates/external-parity-product-viewer`
- Renderer backend: WebGL2
- Resolution: captured browser screenshots
- Environment preset: gallery neutral HDR intent
- Material mode: workflow-authored
- Draw calls: recorded in template and external consumer reports
- Asset count: external consumer loads pinned BoomBox GLB
- Warnings: see external consumer diagnostics
- Source file path: `templates/external-parity-product-viewer/src/main.ts`
- Premium product judgment: passes for installable product proof.
- Lighting believable: yes for template proof.
- Materials distinguishable: yes in the external asset consumer proof.
- Shadows credible: acceptable for template proof.
- Competitive with Three.js reference: package path supports the same V4 workflows compared in parity reports.
- Still weak: final published `npm create a3d@latest` distribution remains a release/distribution operation outside this local proof.

## Material Studio Template

- Screenshot: `tests/reports/external-gallery/templates/external-parity-material-studio.png`
- Scene id: `external-parity-material-studio`
- App/example id: `templates/external-parity-material-studio`
- Renderer backend: WebGL2
- Resolution: captured browser screenshot
- Environment preset: studio softbox HDR
- Material mode: physical material matrix
- Draw calls: recorded in template reports
- Asset count: material review objects
- Warnings: see `tests/reports/external-parity-template-readiness.json`
- Source file path: `templates/external-parity-material-studio/src/main.ts`
- Premium product judgment: passes as a real starter app for material review.
- Lighting believable: yes for bounded material comparison.
- Materials distinguishable: yes.
- Shadows credible: acceptable for the template proof.
- Competitive with Three.js reference: supports the same public workflow surface used by parity scenes.
- Still weak: starter app polish is intentionally below the pro app.

## Asset Gallery Template

- Screenshot: `tests/reports/external-gallery/templates/external-parity-asset-gallery.png`
- Scene id: `external-parity-asset-gallery`
- App/example id: `templates/external-parity-asset-gallery`
- Renderer backend: WebGL2
- Resolution: captured browser screenshot
- Environment preset: neutral asset review
- Material mode: asset-authored materials and diagnostics
- Draw calls: recorded in template reports
- Asset count: template asset set
- Warnings: see `tests/reports/external-parity-template-readiness.json`
- Source file path: `templates/external-parity-asset-gallery/src/main.ts`
- Premium product judgment: passes as a real starter app for asset review.
- Lighting believable: yes for inspection.
- Materials distinguishable: yes where assets expose material variety.
- Shadows credible: acceptable for review.
- Competitive with Three.js reference: supports the same public workflow surface used by parity scenes.
- Still weak: remaining glTF ecosystem extension coverage.

## Interactive Scene Template

- Screenshot: `tests/reports/external-gallery/templates/external-parity-interactive-scene.png`
- Scene id: `external-parity-interactive-scene`
- App/example id: `templates/external-parity-interactive-scene`
- Renderer backend: WebGL2
- Resolution: captured browser screenshot
- Environment preset: interactive workflow preset
- Material mode: selectable variants
- Draw calls: recorded in template reports
- Asset count: interactive workflow objects
- Warnings: see `tests/reports/external-parity-template-readiness.json`
- Source file path: `templates/external-parity-interactive-scene/src/main.ts`
- Premium product judgment: passes as a real starter app for interactive product scenes.
- Lighting believable: yes.
- Materials distinguishable: yes.
- Shadows credible: acceptable for current proof.
- Competitive with Three.js reference: supports the same public workflow surface used by parity scenes.
- Still weak: not a game-engine input or physics benchmark.

## Large Scene Performance

- Screenshot: `tests/reports/external-gallery/performance/large-scene-performance.png`
- Scene id: `large-scene-performance`
- App/example id: `tests/browser/external-parity-large-scene.spec.ts`
- Renderer backend: WebGL2
- Resolution: captured browser screenshot
- Environment preset: large-scene benchmark
- Material mode: large-scene performance materials
- Draw calls: recorded in `tests/reports/external-parity-performance-readiness.json`
- Asset count: recorded in `tests/reports/v4-large-scene-browser.json`
- Warnings: see performance readiness report
- Source file path: `tests/browser/external-parity-large-scene.spec.ts`
- Premium product judgment: passes as performance proof, not as a hero marketing screenshot.
- Lighting believable: acceptable for benchmark evidence.
- Materials distinguishable: acceptable for benchmark evidence.
- Shadows credible: not the primary purpose of this screenshot.
- Competitive with Three.js reference: supported by `tests/reports/external-parity-threejs-visual-parity/large-scene-performance-a3d.png`.
- Still weak: broad performance superiority remains blocked beyond the measured V4 scenes.

## Release Judgment

No reviewed flagship scene is rejected as primitive test output. The current visual proof is credible for the supported V4 workflow claims, with the known gaps preserved in `docs/project/v4-roadmap-known-gaps.md` and `docs/project/v4-roadmap-blocked-claims.md`.
