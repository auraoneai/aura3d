# V5 Progress

> Historical note: This V5 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


Current status: complete
Current milestone: complete
Last verified command: `pnpm three-compat:release`
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

- [x] `docs/project/three-compat-roadmap-visual-engine-plan.md`
- [x] `docs/project/three-compat-roadmap-status.md`
- [x] `docs/project/three-compat-roadmap-progress.md`
- [x] `docs/project/three-compat-roadmap-known-gaps.md`
- [x] `docs/project/three-compat-roadmap-blocked-claims.md`
- [x] `docs/project/three-compat-roadmap-visual-failures.md`
- [x] `docs/project/three-compat-roadmap-legacy-prune-ledger.md`
- [x] `tools/three-compat-truth/index.ts`
- [x] `tools/three-compat-progress/index.ts`
- [x] `tools/three-compat-claim-registry/index.ts`
- [x] `tools/three-compat-legacy-prune-readiness/index.ts`
- [x] `three-compat:truth` script.
- [x] `three-compat:progress` script.
- [x] `three-compat:legacy-prune` script.
- [x] `three-compat:claims` script.
- [x] Verify Milestone 0 exit command.

## Completed Milestone 1 Evidence

Milestone 1 - Three.js Inventory And Compatibility Target

- [x] `packages/three-compat/src/ThreeCompatibilityMatrix.ts`
- [x] `packages/three-compat/src/ThreeApiInventory.ts`
- [x] `packages/three-compat/src/index.ts`
- [x] `docs/project/three-compat-roadmap-threejs-baseline.md`
- [x] `docs/project/three-compat-roadmap-threejs-compatibility-matrix.md`
- [x] `tools/three-compat-threejs-inventory/index.ts`
- [x] `tools/three-compat-compatibility-matrix/index.ts`
- [x] `tests/unit/three-compat/three-compat-threejs-inventory.test.ts`
- [x] `tests/reports/three-compat-threejs-inventory.json`
- [x] `tests/reports/three-compat-threejs-compatibility-matrix.json`
- [x] `three-compat:threejs-inventory` script.
- [x] Verify Milestone 1 exit command.

## Completed Milestone 2 Evidence

Milestone 2 - High-End Asset Library

- [x] `fixtures/three-compat/assets/manifest.json`
- [x] `fixtures/three-compat/assets/licenses.md`
- [x] `fixtures/three-compat/assets/corpus/damaged-helmet.glb`
- [x] `fixtures/three-compat/assets/corpus/boom-box.glb`
- [x] `fixtures/three-compat/assets/corpus/lantern.glb`
- [x] `fixtures/three-compat/assets/corpus/avocado.glb`
- [x] `fixtures/three-compat/assets/corpus/cesium-man.glb`
- [x] `fixtures/three-compat/assets/corpus/duck.glb`
- [x] `fixtures/three-compat/assets/corpus/antique-camera.glb`
- [x] `fixtures/three-compat/assets/corpus/cesium-milk-truck.glb`
- [x] `fixtures/three-compat/assets/corpus/animated-colors-cube.glb`
- [x] `fixtures/three-compat/assets/corpus/clear-coat-test.glb`
- [x] `fixtures/three-compat/assets/corpus/sheen-test-grid.glb`
- [x] `fixtures/three-compat/assets/corpus/specular-test.glb`
- [x] `fixtures/three-compat/products/manifest.json`
- [x] `fixtures/three-compat/automotive/manifest.json`
- [x] `fixtures/three-compat/architecture/manifest.json`
- [x] `fixtures/three-compat/characters/manifest.json`
- [x] `fixtures/three-compat/vfx/manifest.json`
- [x] `packages/assets/src/threejs-compatibility/V5AssetRegistry.ts`
- [x] `packages/assets/src/threejs-compatibility/V5AssetProvenance.ts`
- [x] `tools/three-compat-asset-readiness/index.ts`
- [x] `tests/assets/three-compat-asset-library.test.ts`
- [x] `tests/reports/three-compat-asset-readiness.json`
- [x] `three-compat:assets` script.
- [x] Verify Milestone 2 exit command.

## Completed Milestone 3 Evidence

Milestone 3 - HDR Environment Library

- [x] `fixtures/three-compat/environments/manifest.json`
- [x] `fixtures/three-compat/environments/licenses.md`
- [x] `fixtures/three-compat/environments/hdri/studio_small_08_1k.hdr`
- [x] `fixtures/three-compat/environments/hdri/venice_sunset_1k.hdr`
- [x] `fixtures/three-compat/environments/hdri/kloppenheim_06_puresky_1k.hdr`
- [x] `fixtures/three-compat/environments/hdri/industrial_sunset_puresky_1k.hdr`
- [x] `fixtures/three-compat/environments/hdri/autumn_field_puresky_1k.hdr`
- [x] `fixtures/three-compat/environments/hdri/spruit_sunrise_1k.hdr`
- [x] `packages/environments/src/EnvironmentRegistry.ts`
- [x] `packages/environments/src/HDRIEnvironment.ts`
- [x] `packages/environments/src/PMREMPreset.ts`
- [x] `packages/environments/src/EnvironmentPreview.ts`
- [x] `tests/unit/environments/three-compat-environments.test.ts`
- [x] `tests/browser/three-compat-environment-gallery.spec.ts`
- [x] `tools/three-compat-environment-readiness/index.ts`
- [x] `tests/reports/three-compat-environment-readiness.json`
- [x] `three-compat:environments` script.
- [x] Verify Milestone 3 exit command.

## Completed Milestone 4 Evidence

Milestone 4 - Real PBR Material Library

- [x] `fixtures/three-compat/materials/manifest.json`
- [x] `fixtures/three-compat/materials/licenses.md`
- [x] `packages/materials/src/PBRMaterialLibrary.ts`
- [x] `packages/materials/src/MaterialPreset.ts`
- [x] `packages/materials/src/TextureSet.ts`
- [x] `packages/materials/src/MaterialValidation.ts`
- [x] `packages/materials/src/MaterialPreviewScene.ts`
- [x] `tests/unit/materials/three-compat-material-library.test.ts`
- [x] `tests/browser/three-compat-material-library.spec.ts`
- [x] `tools/three-compat-material-readiness/index.ts`
- [x] `tests/reports/three-compat-material-readiness.json`
- [x] `three-compat:materials` script.
- [x] Verify Milestone 4 exit command.

## Completed Milestone 5 Evidence

Milestone 5 - Renderer Breadth For Broad Replacement

- [x] `packages/rendering/src/threejs-compatibility/RendererV5.ts`
- [x] `packages/rendering/src/threejs-compatibility/SceneRenderer.ts`
- [x] `packages/rendering/src/threejs-compatibility/RenderTargetSystem.ts`
- [x] `packages/rendering/src/threejs-compatibility/TextureSystem.ts`
- [x] `packages/rendering/src/threejs-compatibility/MaterialSystem.ts`
- [x] `packages/rendering/src/threejs-compatibility/LightingSystem.ts`
- [x] `packages/rendering/src/threejs-compatibility/ShadowSystem.ts`
- [x] `packages/rendering/src/threejs-compatibility/TransparencySystem.ts`
- [x] `packages/rendering/src/threejs-compatibility/InstancingSystem.ts`
- [x] `packages/rendering/src/threejs-compatibility/RendererDiagnostics.ts`
- [x] `tests/unit/rendering/three-compat-renderer-three-compat.test.ts`
- [x] `tests/browser/three-compat-renderer-three-compat.spec.ts`
- [x] `tools/three-compat-renderer-readiness/index.ts`
- [x] `tests/reports/three-compat-renderer-readiness.json`
- [x] `three-compat:renderer` script.
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
- [x] `tests/unit/three-compat/three-compat-core-compat.test.ts`
- [x] `tests/browser/three-compat-core-compat.spec.ts`
- [x] `tools/three-compat-core-compat-readiness/index.ts`
- [x] `tests/reports/three-compat-core-compat-readiness.json`
- [x] `three-compat:core-compat` script.
- [x] Verify Milestone 6 exit command.

## Completed Milestone 7 Evidence

Milestone 7 - Geometry, Textures, Render Targets, And Materials Compatibility

- [x] `packages/three-compat/src/geometries/index.ts`
- [x] `packages/three-compat/src/textures/index.ts`
- [x] `packages/three-compat/src/materials/index.ts`
- [x] `packages/three-compat/src/render-targets/index.ts`
- [x] `tests/unit/three-compat/three-compat-material-geometry-compat.test.ts`
- [x] `tests/browser/three-compat-material-geometry-compat.spec.ts`
- [x] `tools/three-compat-material-geometry-compat-readiness/index.ts`
- [x] `tests/reports/three-compat-material-geometry-compat-readiness.json`
- [x] `three-compat:material-geometry-compat` script.
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
- [x] `fixtures/three-compat/loaders/sample.obj`
- [x] `fixtures/three-compat/loaders/sample.mtl`
- [x] `tests/assets/three-compat-loader-corpus.test.ts`
- [x] `tests/browser/three-compat-loader-corpus.spec.ts`
- [x] `tools/three-compat-loader-readiness/index.ts`
- [x] `tests/reports/three-compat-loader-readiness.json`
- [x] `three-compat:loaders` script.
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
- [x] `docs/project/three-compat-roadmap-controls-guide.md`
- [x] `tests/unit/controls/three-compat-controls.test.ts`
- [x] `tests/browser/three-compat-controls.spec.ts`
- [x] `tools/three-compat-controls-readiness/index.ts`
- [x] `tests/reports/three-compat-controls-readiness.json`
- [x] `three-compat:controls` script.
- [x] Verify Milestone 9 exit command.

## Completed Milestone 10 Evidence

Milestone 10 - Animation, Skinning, Morph Targets, And Timeline

- [x] `packages/animation/src/threejs-compatibility/AnimationMixer.ts`
- [x] `packages/animation/src/threejs-compatibility/AnimationClip.ts`
- [x] `packages/animation/src/threejs-compatibility/AnimationAction.ts`
- [x] `packages/animation/src/threejs-compatibility/Skeleton.ts`
- [x] `packages/animation/src/threejs-compatibility/SkinnedMesh.ts`
- [x] `packages/animation/src/threejs-compatibility/MorphTargetMixer.ts`
- [x] `packages/animation/src/threejs-compatibility/AnimationDiagnostics.ts`
- [x] `packages/three-compat/src/animation/index.ts`
- [x] `fixtures/three-compat/assets/corpus/animated-morph-cube.glb`
- [x] `fixtures/three-compat/assets/corpus/box-animated.glb`
- [x] `tests/unit/animation/three-compat-animation.test.ts`
- [x] `tests/browser/three-compat-animation.spec.ts`
- [x] `tools/three-compat-animation-readiness/index.ts`
- [x] `tests/reports/three-compat-animation-readiness.json`
- [x] `three-compat:animation` script.
- [x] Verify Milestone 10 exit command.

## Completed Milestone 11 Evidence

Milestone 11 - Postprocess, Composer, And Cinematic Pipeline

- [x] `packages/rendering/src/threejs-compatibility/postprocess/EffectComposer.ts`
- [x] `packages/rendering/src/threejs-compatibility/postprocess/RenderPass.ts`
- [x] `packages/rendering/src/threejs-compatibility/postprocess/ShaderPass.ts`
- [x] `packages/rendering/src/threejs-compatibility/postprocess/BloomPass.ts`
- [x] `packages/rendering/src/threejs-compatibility/postprocess/SSAOPass.ts`
- [x] `packages/rendering/src/threejs-compatibility/postprocess/TAAPass.ts`
- [x] `packages/rendering/src/threejs-compatibility/postprocess/FXAAPass.ts`
- [x] `packages/rendering/src/threejs-compatibility/postprocess/SMAAPass.ts`
- [x] `packages/rendering/src/threejs-compatibility/postprocess/DepthOfFieldPass.ts`
- [x] `packages/rendering/src/threejs-compatibility/postprocess/MotionBlurPass.ts`
- [x] `packages/rendering/src/threejs-compatibility/postprocess/ColorGradingPass.ts`
- [x] `packages/rendering/src/threejs-compatibility/postprocess/VignettePass.ts`
- [x] `packages/rendering/src/threejs-compatibility/postprocess/OutlinePass.ts`
- [x] `packages/three-compat/src/postprocessing/index.ts`
- [x] `docs/project/three-compat-roadmap-postprocess-migration.md`
- [x] `tests/reports/three-compat-postprocess-before.png`
- [x] `tests/reports/three-compat-postprocess-after.png`
- [x] `tests/unit/rendering/three-compat-postprocess.test.ts`
- [x] `tests/browser/three-compat-postprocess.spec.ts`
- [x] `tools/three-compat-postprocess-readiness/index.ts`
- [x] `tests/reports/three-compat-postprocess-readiness.json`
- [x] `three-compat:postprocess` script.
- [x] Verify Milestone 11 exit command.

## Completed Milestone 12 Evidence

Milestone 12 - Shader Authoring, Custom Materials, And Nodes

- [x] `packages/rendering/src/threejs-compatibility/shaders/ShaderMaterial.ts`
- [x] `packages/rendering/src/threejs-compatibility/shaders/RawShaderMaterial.ts`
- [x] `packages/rendering/src/threejs-compatibility/shaders/Uniforms.ts`
- [x] `packages/rendering/src/threejs-compatibility/shaders/ShaderChunksV5.ts`
- [x] `packages/rendering/src/threejs-compatibility/shaders/NodeMaterial.ts`
- [x] `packages/rendering/src/threejs-compatibility/shaders/ShaderDiagnostics.ts`
- [x] `packages/three-compat/src/shaders/index.ts`
- [x] `apps/three-compat-shader-lab-pro/index.html`
- [x] `apps/three-compat-shader-lab-pro/src/main.ts`
- [x] `tests/unit/rendering/three-compat-shaders.test.ts`
- [x] `tests/browser/three-compat-shader-lab.spec.ts`
- [x] `tools/three-compat-shader-readiness/index.ts`
- [x] `tests/reports/three-compat-shader-readiness.json`
- [x] `three-compat:shaders` script.
- [x] Verify Milestone 12 exit command.

## Completed Milestone 13 Evidence

Milestone 13 - Particles, VFX, Sprites, Lines, And Points

- [x] `packages/rendering/src/threejs-compatibility/vfx/ParticleSystem.ts`
- [x] `packages/rendering/src/threejs-compatibility/vfx/GPUPointCloud.ts`
- [x] `packages/rendering/src/threejs-compatibility/vfx/SpriteSystem.ts`
- [x] `packages/rendering/src/threejs-compatibility/vfx/LineRenderer.ts`
- [x] `packages/rendering/src/threejs-compatibility/vfx/TrailRenderer.ts`
- [x] `packages/rendering/src/threejs-compatibility/vfx/VFXDiagnostics.ts`
- [x] `tests/unit/rendering/three-compat-vfx.test.ts`
- [x] `tests/browser/three-compat-vfx.spec.ts`
- [x] `tools/three-compat-vfx-readiness/index.ts`
- [x] `tests/reports/three-compat-vfx-readiness.json`
- [x] `three-compat:vfx` script.
- [x] Verify Milestone 13 exit command.

## Completed Milestone 14 Evidence

Milestone 14 - Performance, Large Scenes, Instancing, And BVH

- [x] `packages/rendering/src/threejs-compatibility/performance/Instancing.ts`
- [x] `packages/rendering/src/threejs-compatibility/performance/FrustumCulling.ts`
- [x] `packages/rendering/src/threejs-compatibility/performance/OcclusionCulling.ts`
- [x] `packages/rendering/src/threejs-compatibility/performance/BVH.ts`
- [x] `packages/rendering/src/threejs-compatibility/performance/RaycastAcceleration.ts`
- [x] `packages/rendering/src/threejs-compatibility/performance/LODSystem.ts`
- [x] `packages/rendering/src/threejs-compatibility/performance/TextureStreaming.ts`
- [x] `packages/rendering/src/threejs-compatibility/performance/RendererProfiler.ts`
- [x] `tests/performance/three-compat-performance-baselines.ts`
- [x] `tests/browser/three-compat-large-scene.spec.ts`
- [x] `tests/browser/three-compat-raycast-bvh.spec.ts`
- [x] `tools/three-compat-performance-readiness/index.ts`
- [x] `tests/reports/three-compat-performance-baselines.json`
- [x] `tests/reports/three-compat-performance-readiness.json`
- [x] `three-compat:performance` script.
- [x] Verify Milestone 14 exit command.

## Completed Milestone 15 Evidence

Milestone 15 - Three.js Migration Layer And Codemods

- [x] `packages/three-compat/src/index.ts`
- [x] `packages/three-compat/src/migration/ImportMap.ts`
- [x] `packages/three-compat/src/migration/ThreeToG3DAdapter.ts`
- [x] `packages/three-compat/src/migration/CompatibilityWarnings.ts`
- [x] `tools/three-compat-migrate-three/index.ts`
- [x] `tools/three-compat-threejs-example-migrator/index.ts`
- [x] `tests/unit/three-compat/three-compat-migration.test.ts`
- [x] `tests/integration/three-compat-threejs-migration.test.ts`
- [x] `tests/browser/three-compat-threejs-migration.spec.ts`
- [x] `tools/three-compat-migration-readiness/index.ts`
- [x] `tests/reports/three-compat-migrated-three-example.ts`
- [x] `tests/reports/three-compat-migration-readiness.json`
- [x] `three-compat:migration` script.
- [x] Verify Milestone 15 exit command.

## Completed Milestone 16 Evidence

Milestone 16 - Example Parity Suite

- [x] `examples/three-compat-examples/`
- [x] `examples/three-compat-examples/catalog.json`
- [x] `examples/three-compat-examples/index.html`
- [x] `examples/three-compat-examples/basic-scene/`
- [x] `examples/three-compat-examples/materials-physical/`
- [x] `examples/three-compat-examples/gltf-loader/`
- [x] `examples/three-compat-examples/obj-loader/`
- [x] `examples/three-compat-examples/hdr-environment/`
- [x] `examples/three-compat-examples/postprocess-bloom/`
- [x] `examples/three-compat-examples/postprocess-dof/`
- [x] `examples/three-compat-examples/controls-orbit/`
- [x] `examples/three-compat-examples/controls-transform/`
- [x] `examples/three-compat-examples/animation-skinning/`
- [x] `examples/three-compat-examples/morph-targets/`
- [x] `examples/three-compat-examples/particles/`
- [x] `examples/three-compat-examples/sprites/`
- [x] `examples/three-compat-examples/lines/`
- [x] `examples/three-compat-examples/instancing/`
- [x] `examples/three-compat-examples/raycasting/`
- [x] `examples/three-compat-examples/shader-material/`
- [x] `examples/three-compat-examples/render-targets/`
- [x] `examples/three-compat-examples/large-scene/`
- [x] `examples/three-compat-examples/product-configurator/`
- [x] `examples/three-compat-examples/architecture-interior/`
- [x] `examples/three-compat-examples/automotive-configurator/`
- [x] `examples/three-compat-examples/threejs-migrated-custom-scene/`
- [x] `examples/three-compat-product-configurator/`
- [x] `examples/three-compat-material-browser/`
- [x] `examples/three-compat-asset-gallery/`
- [x] `examples/three-compat-shader-lab/`
- [x] `examples/three-compat-postprocess-cinema/`
- [x] `examples/three-compat-large-scene/`
- [x] `examples/three-compat-controls-lab/`
- [x] `examples/three-compat-animation-viewer/`
- [x] `tests/browser/three-compat-examples.spec.ts`
- [x] `tools/three-compat-examples-readiness/index.ts`
- [x] `tools/three-compat-example-parity/index.ts`
- [x] `tests/reports/three-compat-example-parity.json`
- [x] `tests/reports/three-compat-examples-readiness.json`
- [x] `three-compat:examples` script.
- [x] Verify Milestone 16 exit command.

## Completed Milestone 17 Evidence

Milestone 17 - Same-Scene Three.js Visual And Runtime Parity

- [x] `benchmarks/three-compat/shared/`
- [x] `benchmarks/three-compat/galileo/`
- [x] `benchmarks/three-compat/threejs/`
- [x] `tests/browser/three-compat-threejs-visual-parity.spec.ts`
- [x] `tests/browser/three-compat-threejs-runtime-parity.spec.ts`
- [x] `tools/three-compat-threejs-visual-parity/index.ts`
- [x] `tools/three-compat-threejs-runtime-parity/index.ts`
- [x] `tests/reports/three-compat-threejs-visual-parity.json`
- [x] `tests/reports/three-compat-threejs-runtime-parity.json`
- [x] `three-compat:compare-threejs` script.
- [x] Verify Milestone 17 exit command.

## Completed Milestone 18 Evidence

Milestone 18 - Developer Ergonomics And Documentation Depth

- [x] `docs/project/three-compat-roadmap-getting-started.md`
- [x] `docs/project/three-compat-roadmap-api-reference.md`
- [x] `docs/project/three-compat-roadmap-threejs-migration-guide.md`
- [x] `docs/project/three-compat-roadmap-examples-index.md`
- [x] `docs/project/three-compat-roadmap-templates-index.md`
- [x] `docs/project/three-compat-roadmap-troubleshooting.md`
- [x] `docs/project/three-compat-roadmap-performance-guide.md`
- [x] `docs/project/three-compat-roadmap-asset-pipeline-guide.md`
- [x] `docs/project/three-compat-roadmap-controls-guide.md`
- [x] `docs/project/three-compat-roadmap-shader-authoring-guide.md`
- [x] `docs/project/three-compat-roadmap-release-notes.md`
- [x] `docs/project/three-compat-roadmap-docs-manifest.json`
- [x] `tests/unit/tools/three-compat-docs.test.ts`
- [x] `tools/three-compat-docs-readiness/index.ts`
- [x] `tests/reports/three-compat-docs-readiness.json`
- [x] `three-compat:docs` script.
- [x] Verify Milestone 18 exit command.

## Completed Milestone 19 Evidence

Milestone 19 - External Consumer, Package, Deployment, And Starter Proof

- [x] `tools/three-compat-package-smoke/index.ts`
- [x] `tools/three-compat-external-consumer/index.ts`
- [x] `tools/three-compat-external-vite-build/index.ts`
- [x] `tools/three-compat-static-preview-smoke/index.ts`
- [x] `tests/browser/three-compat-external-consumer-static.spec.ts`
- [x] `tests/reports/three-compat-external-consumer/`
- [x] `tests/reports/three-compat-package-smoke.json`
- [x] `tests/reports/three-compat-external-consumer.json`
- [x] `tests/reports/three-compat-external-vite-build.json`
- [x] `tests/reports/three-compat-static-preview-smoke.json`
- [x] `tests/reports/three-compat-external-consumer/static-preview.png`
- [x] `three-compat:package` script.
- [x] Verify Milestone 19 exit command.

## Completed Required App Suite Evidence

- [x] `apps/three-compat-product-studio-pro`
- [x] `apps/three-compat-material-studio-pro`
- [x] `apps/three-compat-asset-studio-pro`
- [x] `apps/three-compat-scene-studio-pro`
- [x] `apps/three-compat-animation-studio-pro`
- [x] `apps/three-compat-postprocess-studio-pro`
- [x] `apps/three-compat-shader-lab-pro`
- [x] `apps/three-compat-threejs-migration-lab`
- [x] `apps/three-compat-large-scene-lab`
- [x] `apps/three-compat-controls-lab`
- [x] `tools/three-compat-app-suite-readiness/index.ts`
- [x] `tests/reports/three-compat-app-suite-readiness.json`
- [x] `three-compat:app-suite` script.

## Completed Required Template Evidence

- [x] `templates/three-compat-premium-product-viewer/`
- [x] `templates/three-compat-architecture-interior/`
- [x] `templates/three-compat-material-authoring/`
- [x] `templates/three-compat-asset-inspector/`
- [x] `templates/three-compat-character-viewer/`
- [x] `templates/three-compat-postprocess-scene/`
- [x] `templates/three-compat-custom-threejs-migration/`
- [x] `templates/three-compat-large-scene/`
- [x] `packages/create-g3d/templates/three-compat-premium-product-viewer/`
- [x] `packages/create-g3d/templates/three-compat-architecture-interior/`
- [x] `packages/create-g3d/templates/three-compat-material-authoring/`
- [x] `packages/create-g3d/templates/three-compat-asset-inspector/`
- [x] `packages/create-g3d/templates/three-compat-character-viewer/`
- [x] `packages/create-g3d/templates/three-compat-postprocess-scene/`
- [x] `packages/create-g3d/templates/three-compat-custom-threejs-migration/`
- [x] `packages/create-g3d/templates/three-compat-large-scene/`
- [x] `tests/integration/three-compat-create-g3d.test.ts`
- [x] `tests/browser/three-compat-templates.spec.ts`
- [x] `tools/three-compat-template-readiness/index.ts`
- [x] `tests/reports/three-compat-template-readiness.json`
- [x] `three-compat:templates` script.

## Active Milestone

Milestone 20 - Release Readiness, Broad Replacement Claim Gate, And Completion Audit

- [x] `tools/three-compat-release-readiness/index.ts`
- [x] `tools/three-compat-broad-replacement-readiness/index.ts`
- [x] `tools/three-compat-completion-audit/index.ts`
- [x] `tests/reports/three-compat-release-readiness.json`
- [x] `tests/reports/three-compat-broad-replacement-readiness.json`
- [x] `tests/reports/three-compat-completion-audit.json`
- [x] Add `three-compat:release` script.
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
