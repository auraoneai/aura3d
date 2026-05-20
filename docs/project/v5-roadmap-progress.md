# V5 Progress

> Historical note: This V5 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


Current status: complete
Current milestone: complete
Last verified command: `pnpm v5:release`
Last verified at: `2026-05-14T20:21:35.575Z`

## Completed Milestones

- [x] Milestone 0 - Truth, Progress, And Claim Ledger
- [x] Milestone 1 - Three.js Inventory And Compatibility Target
- [x] Milestone 2 - High-End Asset Library
- [x] Milestone 3 - HDR Environment Library
- [x] Milestone 4 - Real PBR Material Library
- [x] Milestone 5 - Renderer Breadth For Broad Replacement
- [x] Milestone 6 - Scene Graph, Math, Cameras, Lights, And Helpers
- [x] Milestone 7 - Geometry, Textures, Render Targets, And Materials Compatibility
- [x] Milestone 8 - Loader Ecosystem
- [x] Milestone 9 - Controls, Interaction, Picking, And Transform Tools
- [x] Milestone 10 - Animation, Skinning, Morph Targets, And Timeline
- [x] Milestone 11 - Postprocess, Composer, And Cinematic Pipeline
- [x] Milestone 12 - Shader Authoring, Custom Materials, And Nodes
- [x] Milestone 13 - Particles, VFX, Sprites, Lines, And Points
- [x] Milestone 14 - Performance, Large Scenes, Instancing, And BVH
- [x] Milestone 15 - Three.js Migration Layer And Codemods
- [x] Milestone 16 - Example Parity Suite
- [x] Milestone 17 - Same-Scene Three.js Visual And Runtime Parity
- [x] Milestone 18 - Developer Ergonomics And Documentation Depth
- [x] Milestone 19 - External Consumer, Package, Deployment, And Starter Proof
- [x] Milestone 20 - Release Readiness, Broad Replacement Claim Gate, And Completion Audit

## Completed Milestone 0 Evidence

Milestone 0 - Truth, Progress, And Claim Ledger

- [x] `docs/project/v5-roadmap-visual-engine-plan.md`
- [x] `docs/project/v5-roadmap-status.md`
- [x] `docs/project/v5-roadmap-progress.md`
- [x] `docs/project/v5-roadmap-known-gaps.md`
- [x] `docs/project/v5-roadmap-blocked-claims.md`
- [x] `docs/project/v5-roadmap-visual-failures.md`
- [x] `docs/project/v5-roadmap-legacy-prune-ledger.md`
- [x] `tools/v5-truth/index.ts`
- [x] `tools/v5-progress/index.ts`
- [x] `tools/v5-claim-registry/index.ts`
- [x] `tools/v5-legacy-prune-readiness/index.ts`
- [x] `v5:truth` script.
- [x] `v5:progress` script.
- [x] `v5:legacy-prune` script.
- [x] `v5:claims` script.
- [x] Verify Milestone 0 exit command.

## Completed Milestone 1 Evidence

Milestone 1 - Three.js Inventory And Compatibility Target

- [x] `packages/three-compat/src/ThreeCompatibilityMatrix.ts`
- [x] `packages/three-compat/src/ThreeApiInventory.ts`
- [x] `packages/three-compat/src/index.ts`
- [x] `docs/project/v5-roadmap-threejs-baseline.md`
- [x] `docs/project/v5-roadmap-threejs-compatibility-matrix.md`
- [x] `tools/v5-threejs-inventory/index.ts`
- [x] `tools/v5-compatibility-matrix/index.ts`
- [x] `tests/unit/three-compat/v5-threejs-inventory.test.ts`
- [x] `tests/reports/v5-threejs-inventory.json`
- [x] `tests/reports/v5-threejs-compatibility-matrix.json`
- [x] `v5:threejs-inventory` script.
- [x] Verify Milestone 1 exit command.

## Completed Milestone 2 Evidence

Milestone 2 - High-End Asset Library

- [x] `fixtures/v5/assets/manifest.json`
- [x] `fixtures/v5/assets/licenses.md`
- [x] `fixtures/v5/assets/corpus/damaged-helmet.glb`
- [x] `fixtures/v5/assets/corpus/boom-box.glb`
- [x] `fixtures/v5/assets/corpus/lantern.glb`
- [x] `fixtures/v5/assets/corpus/avocado.glb`
- [x] `fixtures/v5/assets/corpus/cesium-man.glb`
- [x] `fixtures/v5/assets/corpus/duck.glb`
- [x] `fixtures/v5/assets/corpus/antique-camera.glb`
- [x] `fixtures/v5/assets/corpus/cesium-milk-truck.glb`
- [x] `fixtures/v5/assets/corpus/animated-colors-cube.glb`
- [x] `fixtures/v5/assets/corpus/clear-coat-test.glb`
- [x] `fixtures/v5/assets/corpus/sheen-test-grid.glb`
- [x] `fixtures/v5/assets/corpus/specular-test.glb`
- [x] `fixtures/v5/products/manifest.json`
- [x] `fixtures/v5/automotive/manifest.json`
- [x] `fixtures/v5/architecture/manifest.json`
- [x] `fixtures/v5/characters/manifest.json`
- [x] `fixtures/v5/vfx/manifest.json`
- [x] `packages/assets/src/v5/V5AssetRegistry.ts`
- [x] `packages/assets/src/v5/V5AssetProvenance.ts`
- [x] `tools/v5-asset-readiness/index.ts`
- [x] `tests/assets/v5-asset-library.test.ts`
- [x] `tests/reports/v5-asset-readiness.json`
- [x] `v5:assets` script.
- [x] Verify Milestone 2 exit command.

## Completed Milestone 3 Evidence

Milestone 3 - HDR Environment Library

- [x] `fixtures/v5/environments/manifest.json`
- [x] `fixtures/v5/environments/licenses.md`
- [x] `fixtures/v5/environments/hdri/studio_small_08_1k.hdr`
- [x] `fixtures/v5/environments/hdri/venice_sunset_1k.hdr`
- [x] `fixtures/v5/environments/hdri/kloppenheim_06_puresky_1k.hdr`
- [x] `fixtures/v5/environments/hdri/industrial_sunset_puresky_1k.hdr`
- [x] `fixtures/v5/environments/hdri/autumn_field_puresky_1k.hdr`
- [x] `fixtures/v5/environments/hdri/spruit_sunrise_1k.hdr`
- [x] `packages/environments/src/EnvironmentRegistry.ts`
- [x] `packages/environments/src/HDRIEnvironment.ts`
- [x] `packages/environments/src/PMREMPreset.ts`
- [x] `packages/environments/src/EnvironmentPreview.ts`
- [x] `tests/unit/environments/v5-environments.test.ts`
- [x] `tests/browser/v5-environment-gallery.spec.ts`
- [x] `tools/v5-environment-readiness/index.ts`
- [x] `tests/reports/v5-environment-readiness.json`
- [x] `v5:environments` script.
- [x] Verify Milestone 3 exit command.

## Completed Milestone 4 Evidence

Milestone 4 - Real PBR Material Library

- [x] `fixtures/v5/materials/manifest.json`
- [x] `fixtures/v5/materials/licenses.md`
- [x] `packages/materials/src/PBRMaterialLibrary.ts`
- [x] `packages/materials/src/MaterialPreset.ts`
- [x] `packages/materials/src/TextureSet.ts`
- [x] `packages/materials/src/MaterialValidation.ts`
- [x] `packages/materials/src/MaterialPreviewScene.ts`
- [x] `tests/unit/materials/v5-material-library.test.ts`
- [x] `tests/browser/v5-material-library.spec.ts`
- [x] `tools/v5-material-readiness/index.ts`
- [x] `tests/reports/v5-material-readiness.json`
- [x] `v5:materials` script.
- [x] Verify Milestone 4 exit command.

## Completed Milestone 5 Evidence

Milestone 5 - Renderer Breadth For Broad Replacement

- [x] `packages/rendering/src/v5/RendererV5.ts`
- [x] `packages/rendering/src/v5/SceneRenderer.ts`
- [x] `packages/rendering/src/v5/RenderTargetSystem.ts`
- [x] `packages/rendering/src/v5/TextureSystem.ts`
- [x] `packages/rendering/src/v5/MaterialSystem.ts`
- [x] `packages/rendering/src/v5/LightingSystem.ts`
- [x] `packages/rendering/src/v5/ShadowSystem.ts`
- [x] `packages/rendering/src/v5/TransparencySystem.ts`
- [x] `packages/rendering/src/v5/InstancingSystem.ts`
- [x] `packages/rendering/src/v5/RendererDiagnostics.ts`
- [x] `tests/unit/rendering/v5-renderer-v5.test.ts`
- [x] `tests/browser/v5-renderer-v5.spec.ts`
- [x] `tools/v5-renderer-readiness/index.ts`
- [x] `tests/reports/v5-renderer-readiness.json`
- [x] `v5:renderer` script.
- [x] Verify Milestone 5 exit command.

## Completed Milestone 6 Evidence

Milestone 6 - Scene Graph, Math, Cameras, Lights, And Helpers

- [x] `packages/three-compat/src/core/Object3DCompat.ts`
- [x] `packages/three-compat/src/core/SceneCompat.ts`
- [x] `packages/three-compat/src/core/RaycasterCompat.ts`
- [x] `packages/three-compat/src/math/index.ts`
- [x] `packages/three-compat/src/cameras/index.ts`
- [x] `packages/three-compat/src/lights/index.ts`
- [x] `packages/three-compat/src/helpers/index.ts`
- [x] `tests/unit/three-compat/v5-core-compat.test.ts`
- [x] `tests/browser/v5-core-compat.spec.ts`
- [x] `tools/v5-core-compat-readiness/index.ts`
- [x] `tests/reports/v5-core-compat-readiness.json`
- [x] `v5:core-compat` script.
- [x] Verify Milestone 6 exit command.

## Completed Milestone 7 Evidence

Milestone 7 - Geometry, Textures, Render Targets, And Materials Compatibility

- [x] `packages/three-compat/src/geometries/index.ts`
- [x] `packages/three-compat/src/textures/index.ts`
- [x] `packages/three-compat/src/materials/index.ts`
- [x] `packages/three-compat/src/render-targets/index.ts`
- [x] `tests/unit/three-compat/v5-material-geometry-compat.test.ts`
- [x] `tests/browser/v5-material-geometry-compat.spec.ts`
- [x] `tools/v5-material-geometry-compat-readiness/index.ts`
- [x] `tests/reports/v5-material-geometry-compat-readiness.json`
- [x] `v5:material-geometry-compat` script.
- [x] Verify Milestone 7 exit command.

## Completed Milestone 8 Evidence

Milestone 8 - Loader Ecosystem

- [x] `packages/assets/src/loaders/GLTFLoaderV5.ts`
- [x] `packages/assets/src/loaders/OBJLoader.ts`
- [x] `packages/assets/src/loaders/MTLLoader.ts`
- [x] `packages/assets/src/loaders/HDRLoader.ts`
- [x] `packages/assets/src/loaders/EXRLoader.ts`
- [x] `packages/assets/src/loaders/KTX2Loader.ts`
- [x] `packages/assets/src/loaders/TextureLoader.ts`
- [x] `packages/assets/src/loaders/CubeTextureLoader.ts`
- [x] `packages/assets/src/loaders/LoaderDiagnostics.ts`
- [x] `packages/three-compat/src/loaders/index.ts`
- [x] `fixtures/v5/loaders/sample.obj`
- [x] `fixtures/v5/loaders/sample.mtl`
- [x] `tests/assets/v5-loader-corpus.test.ts`
- [x] `tests/browser/v5-loader-corpus.spec.ts`
- [x] `tools/v5-loader-readiness/index.ts`
- [x] `tests/reports/v5-loader-readiness.json`
- [x] `v5:loaders` script.
- [x] Verify Milestone 8 exit command.

## Completed Milestone 9 Evidence

Milestone 9 - Controls, Interaction, Picking, And Transform Tools

- [x] `packages/controls/src/OrbitControls.ts`
- [x] `packages/controls/src/TrackballControls.ts`
- [x] `packages/controls/src/FlyControls.ts`
- [x] `packages/controls/src/FirstPersonControls.ts`
- [x] `packages/controls/src/MapControls.ts`
- [x] `packages/controls/src/PointerLockControls.ts`
- [x] `packages/controls/src/DragControls.ts`
- [x] `packages/controls/src/TransformControls.ts`
- [x] `packages/controls/src/SelectionManager.ts`
- [x] `packages/controls/src/Picking.ts`
- [x] `packages/three-compat/src/controls/index.ts`
- [x] `docs/project/v5-roadmap-controls-guide.md`
- [x] `tests/unit/controls/v5-controls.test.ts`
- [x] `tests/browser/v5-controls.spec.ts`
- [x] `tools/v5-controls-readiness/index.ts`
- [x] `tests/reports/v5-controls-readiness.json`
- [x] `v5:controls` script.
- [x] Verify Milestone 9 exit command.

## Completed Milestone 10 Evidence

Milestone 10 - Animation, Skinning, Morph Targets, And Timeline

- [x] `packages/animation/src/v5/AnimationMixer.ts`
- [x] `packages/animation/src/v5/AnimationClip.ts`
- [x] `packages/animation/src/v5/AnimationAction.ts`
- [x] `packages/animation/src/v5/Skeleton.ts`
- [x] `packages/animation/src/v5/SkinnedMesh.ts`
- [x] `packages/animation/src/v5/MorphTargetMixer.ts`
- [x] `packages/animation/src/v5/AnimationDiagnostics.ts`
- [x] `packages/three-compat/src/animation/index.ts`
- [x] `fixtures/v5/assets/corpus/animated-morph-cube.glb`
- [x] `fixtures/v5/assets/corpus/box-animated.glb`
- [x] `tests/unit/animation/v5-animation.test.ts`
- [x] `tests/browser/v5-animation.spec.ts`
- [x] `tools/v5-animation-readiness/index.ts`
- [x] `tests/reports/v5-animation-readiness.json`
- [x] `v5:animation` script.
- [x] Verify Milestone 10 exit command.

## Completed Milestone 11 Evidence

Milestone 11 - Postprocess, Composer, And Cinematic Pipeline

- [x] `packages/rendering/src/v5/postprocess/EffectComposer.ts`
- [x] `packages/rendering/src/v5/postprocess/RenderPass.ts`
- [x] `packages/rendering/src/v5/postprocess/ShaderPass.ts`
- [x] `packages/rendering/src/v5/postprocess/BloomPass.ts`
- [x] `packages/rendering/src/v5/postprocess/SSAOPass.ts`
- [x] `packages/rendering/src/v5/postprocess/TAAPass.ts`
- [x] `packages/rendering/src/v5/postprocess/FXAAPass.ts`
- [x] `packages/rendering/src/v5/postprocess/SMAAPass.ts`
- [x] `packages/rendering/src/v5/postprocess/DepthOfFieldPass.ts`
- [x] `packages/rendering/src/v5/postprocess/MotionBlurPass.ts`
- [x] `packages/rendering/src/v5/postprocess/ColorGradingPass.ts`
- [x] `packages/rendering/src/v5/postprocess/VignettePass.ts`
- [x] `packages/rendering/src/v5/postprocess/OutlinePass.ts`
- [x] `packages/three-compat/src/postprocessing/index.ts`
- [x] `docs/project/v5-roadmap-postprocess-migration.md`
- [x] `tests/reports/v5-postprocess-before.png`
- [x] `tests/reports/v5-postprocess-after.png`
- [x] `tests/unit/rendering/v5-postprocess.test.ts`
- [x] `tests/browser/v5-postprocess.spec.ts`
- [x] `tools/v5-postprocess-readiness/index.ts`
- [x] `tests/reports/v5-postprocess-readiness.json`
- [x] `v5:postprocess` script.
- [x] Verify Milestone 11 exit command.

## Completed Milestone 12 Evidence

Milestone 12 - Shader Authoring, Custom Materials, And Nodes

- [x] `packages/rendering/src/v5/shaders/ShaderMaterial.ts`
- [x] `packages/rendering/src/v5/shaders/RawShaderMaterial.ts`
- [x] `packages/rendering/src/v5/shaders/Uniforms.ts`
- [x] `packages/rendering/src/v5/shaders/ShaderChunksV5.ts`
- [x] `packages/rendering/src/v5/shaders/NodeMaterial.ts`
- [x] `packages/rendering/src/v5/shaders/ShaderDiagnostics.ts`
- [x] `packages/three-compat/src/shaders/index.ts`
- [x] `apps/v5-shader-lab-pro/index.html`
- [x] `apps/v5-shader-lab-pro/src/main.ts`
- [x] `tests/unit/rendering/v5-shaders.test.ts`
- [x] `tests/browser/v5-shader-lab.spec.ts`
- [x] `tools/v5-shader-readiness/index.ts`
- [x] `tests/reports/v5-shader-readiness.json`
- [x] `v5:shaders` script.
- [x] Verify Milestone 12 exit command.

## Completed Milestone 13 Evidence

Milestone 13 - Particles, VFX, Sprites, Lines, And Points

- [x] `packages/rendering/src/v5/vfx/ParticleSystem.ts`
- [x] `packages/rendering/src/v5/vfx/GPUPointCloud.ts`
- [x] `packages/rendering/src/v5/vfx/SpriteSystem.ts`
- [x] `packages/rendering/src/v5/vfx/LineRenderer.ts`
- [x] `packages/rendering/src/v5/vfx/TrailRenderer.ts`
- [x] `packages/rendering/src/v5/vfx/VFXDiagnostics.ts`
- [x] `tests/unit/rendering/v5-vfx.test.ts`
- [x] `tests/browser/v5-vfx.spec.ts`
- [x] `tools/v5-vfx-readiness/index.ts`
- [x] `tests/reports/v5-vfx-readiness.json`
- [x] `v5:vfx` script.
- [x] Verify Milestone 13 exit command.

## Completed Milestone 14 Evidence

Milestone 14 - Performance, Large Scenes, Instancing, And BVH

- [x] `packages/rendering/src/v5/performance/Instancing.ts`
- [x] `packages/rendering/src/v5/performance/FrustumCulling.ts`
- [x] `packages/rendering/src/v5/performance/OcclusionCulling.ts`
- [x] `packages/rendering/src/v5/performance/BVH.ts`
- [x] `packages/rendering/src/v5/performance/RaycastAcceleration.ts`
- [x] `packages/rendering/src/v5/performance/LODSystem.ts`
- [x] `packages/rendering/src/v5/performance/TextureStreaming.ts`
- [x] `packages/rendering/src/v5/performance/RendererProfiler.ts`
- [x] `tests/performance/v5-performance-baselines.ts`
- [x] `tests/browser/v5-large-scene.spec.ts`
- [x] `tests/browser/v5-raycast-bvh.spec.ts`
- [x] `tools/v5-performance-readiness/index.ts`
- [x] `tests/reports/v5-performance-baselines.json`
- [x] `tests/reports/v5-performance-readiness.json`
- [x] `v5:performance` script.
- [x] Verify Milestone 14 exit command.

## Completed Milestone 15 Evidence

Milestone 15 - Three.js Migration Layer And Codemods

- [x] `packages/three-compat/src/index.ts`
- [x] `packages/three-compat/src/migration/ImportMap.ts`
- [x] `packages/three-compat/src/migration/ThreeToG3DAdapter.ts`
- [x] `packages/three-compat/src/migration/CompatibilityWarnings.ts`
- [x] `tools/v5-migrate-three/index.ts`
- [x] `tools/v5-threejs-example-migrator/index.ts`
- [x] `tests/unit/three-compat/v5-migration.test.ts`
- [x] `tests/integration/v5-threejs-migration.test.ts`
- [x] `tests/browser/v5-threejs-migration.spec.ts`
- [x] `tools/v5-migration-readiness/index.ts`
- [x] `tests/reports/v5-migrated-three-example.ts`
- [x] `tests/reports/v5-migration-readiness.json`
- [x] `v5:migration` script.
- [x] Verify Milestone 15 exit command.

## Completed Milestone 16 Evidence

Milestone 16 - Example Parity Suite

- [x] `examples/v5/`
- [x] `examples/v5/catalog.json`
- [x] `examples/v5/index.html`
- [x] `examples/v5/basic-scene/`
- [x] `examples/v5/materials-physical/`
- [x] `examples/v5/gltf-loader/`
- [x] `examples/v5/obj-loader/`
- [x] `examples/v5/hdr-environment/`
- [x] `examples/v5/postprocess-bloom/`
- [x] `examples/v5/postprocess-dof/`
- [x] `examples/v5/controls-orbit/`
- [x] `examples/v5/controls-transform/`
- [x] `examples/v5/animation-skinning/`
- [x] `examples/v5/morph-targets/`
- [x] `examples/v5/particles/`
- [x] `examples/v5/sprites/`
- [x] `examples/v5/lines/`
- [x] `examples/v5/instancing/`
- [x] `examples/v5/raycasting/`
- [x] `examples/v5/shader-material/`
- [x] `examples/v5/render-targets/`
- [x] `examples/v5/large-scene/`
- [x] `examples/v5/product-configurator/`
- [x] `examples/v5/architecture-interior/`
- [x] `examples/v5/automotive-configurator/`
- [x] `examples/v5/threejs-migrated-custom-scene/`
- [x] `examples/v5-product-configurator/`
- [x] `examples/v5-material-browser/`
- [x] `examples/v5-asset-gallery/`
- [x] `examples/v5-shader-lab/`
- [x] `examples/v5-postprocess-cinema/`
- [x] `examples/v5-large-scene/`
- [x] `examples/v5-controls-lab/`
- [x] `examples/v5-animation-viewer/`
- [x] `tests/browser/v5-examples.spec.ts`
- [x] `tools/v5-examples-readiness/index.ts`
- [x] `tools/v5-example-parity/index.ts`
- [x] `tests/reports/v5-example-parity.json`
- [x] `tests/reports/v5-examples-readiness.json`
- [x] `v5:examples` script.
- [x] Verify Milestone 16 exit command.

## Completed Milestone 17 Evidence

Milestone 17 - Same-Scene Three.js Visual And Runtime Parity

- [x] `benchmarks/v5/shared/`
- [x] `benchmarks/v5/galileo/`
- [x] `benchmarks/v5/threejs/`
- [x] `tests/browser/v5-threejs-visual-parity.spec.ts`
- [x] `tests/browser/v5-threejs-runtime-parity.spec.ts`
- [x] `tools/v5-threejs-visual-parity/index.ts`
- [x] `tools/v5-threejs-runtime-parity/index.ts`
- [x] `tests/reports/v5-threejs-visual-parity.json`
- [x] `tests/reports/v5-threejs-runtime-parity.json`
- [x] `v5:compare-threejs` script.
- [x] Verify Milestone 17 exit command.

## Completed Milestone 18 Evidence

Milestone 18 - Developer Ergonomics And Documentation Depth

- [x] `docs/project/v5-roadmap-getting-started.md`
- [x] `docs/project/v5-roadmap-api-reference.md`
- [x] `docs/project/v5-roadmap-threejs-migration-guide.md`
- [x] `docs/project/v5-roadmap-examples-index.md`
- [x] `docs/project/v5-roadmap-templates-index.md`
- [x] `docs/project/v5-roadmap-troubleshooting.md`
- [x] `docs/project/v5-roadmap-performance-guide.md`
- [x] `docs/project/v5-roadmap-asset-pipeline-guide.md`
- [x] `docs/project/v5-roadmap-controls-guide.md`
- [x] `docs/project/v5-roadmap-shader-authoring-guide.md`
- [x] `docs/project/v5-roadmap-release-notes.md`
- [x] `docs/project/v5-roadmap-docs-manifest.json`
- [x] `tests/unit/tools/v5-docs.test.ts`
- [x] `tools/v5-docs-readiness/index.ts`
- [x] `tests/reports/v5-docs-readiness.json`
- [x] `v5:docs` script.
- [x] Verify Milestone 18 exit command.

## Completed Milestone 19 Evidence

Milestone 19 - External Consumer, Package, Deployment, And Starter Proof

- [x] `tools/v5-package-smoke/index.ts`
- [x] `tools/v5-external-consumer/index.ts`
- [x] `tools/v5-external-vite-build/index.ts`
- [x] `tools/v5-static-preview-smoke/index.ts`
- [x] `tests/browser/v5-external-consumer-static.spec.ts`
- [x] `tests/reports/v5-external-consumer/`
- [x] `tests/reports/v5-package-smoke.json`
- [x] `tests/reports/v5-external-consumer.json`
- [x] `tests/reports/v5-external-vite-build.json`
- [x] `tests/reports/v5-static-preview-smoke.json`
- [x] `tests/reports/v5-external-consumer/static-preview.png`
- [x] `v5:package` script.
- [x] Verify Milestone 19 exit command.

## Completed Required App Suite Evidence

- [x] `apps/v5-product-studio-pro`
- [x] `apps/v5-material-studio-pro`
- [x] `apps/v5-asset-studio-pro`
- [x] `apps/v5-scene-studio-pro`
- [x] `apps/v5-animation-studio-pro`
- [x] `apps/v5-postprocess-studio-pro`
- [x] `apps/v5-shader-lab-pro`
- [x] `apps/v5-threejs-migration-lab`
- [x] `apps/v5-large-scene-lab`
- [x] `apps/v5-controls-lab`
- [x] `tools/v5-app-suite-readiness/index.ts`
- [x] `tests/reports/v5-app-suite-readiness.json`
- [x] `v5:app-suite` script.

## Completed Required Template Evidence

- [x] `templates/v5-premium-product-viewer/`
- [x] `templates/v5-architecture-interior/`
- [x] `templates/v5-material-authoring/`
- [x] `templates/v5-asset-inspector/`
- [x] `templates/v5-character-viewer/`
- [x] `templates/v5-postprocess-scene/`
- [x] `templates/v5-custom-threejs-migration/`
- [x] `templates/v5-large-scene/`
- [x] `packages/create-g3d/templates/v5-premium-product-viewer/`
- [x] `packages/create-g3d/templates/v5-architecture-interior/`
- [x] `packages/create-g3d/templates/v5-material-authoring/`
- [x] `packages/create-g3d/templates/v5-asset-inspector/`
- [x] `packages/create-g3d/templates/v5-character-viewer/`
- [x] `packages/create-g3d/templates/v5-postprocess-scene/`
- [x] `packages/create-g3d/templates/v5-custom-threejs-migration/`
- [x] `packages/create-g3d/templates/v5-large-scene/`
- [x] `tests/integration/v5-create-g3d.test.ts`
- [x] `tests/browser/v5-templates.spec.ts`
- [x] `tools/v5-template-readiness/index.ts`
- [x] `tests/reports/v5-template-readiness.json`
- [x] `v5:templates` script.

## Active Milestone

Milestone 20 - Release Readiness, Broad Replacement Claim Gate, And Completion Audit

- [x] `tools/v5-release-readiness/index.ts`
- [x] `tools/v5-broad-replacement-readiness/index.ts`
- [x] `tools/v5-completion-audit/index.ts`
- [x] `tests/reports/v5-release-readiness.json`
- [x] `tests/reports/v5-broad-replacement-readiness.json`
- [x] `tests/reports/v5-completion-audit.json`
- [x] Add `v5:release` script.
- [x] Verify Milestone 20 exit command.

## Known Gaps

- Broad Three.js replacement is not achieved until the V5 compatibility matrix, migration tooling, examples, visuals, package proof, docs, and release audit pass.
- Full Three.js API parity remains blocked.
- Unity, Unreal, and full game engine replacement claims remain blocked.
- Full Three.js ecosystem replacement remains blocked.
- Full WebGPU parity remains blocked.
- Broad performance superiority remains blocked.
- Full glTF ecosystem parity remains blocked.
- Full commercial DCC pipeline parity remains blocked.

## Blocked Claims

- Full Three.js API replacement.
- Full Three.js ecosystem replacement.
- Unity replacement.
- Unreal replacement.
- Full game engine replacement.
- Full WebGPU parity.
- Broad performance superiority.
- Full glTF ecosystem parity.
- Full commercial DCC pipeline parity.
