# V7 Gap Audit

> Historical note: This V7 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


This audit tracks the user's latest quality objection: the flagship product viewer still looked too low-resolution and the known gaps could not be treated as fixed by wording.

The stricter prompt-to-artifact completion checklist lives in `docs/project/v7-roadmap-completion-audit.md`.

## Current Deliverables

| Requirement | Current artifact | Status |
|---|---|---|
| Higher-resolution flagship product viewer | `tests/reports/v7/product-viewer/flagship-product-viewer-5120.png` | Improved, still not accepted as final visual bar |
| Runtime proof that the flagship app uses a high-resolution render target | `tests/reports/v7/product-viewer/flagship-product-viewer-5120.json` | Improved, still not accepted as final visual bar |
| Stronger flagship content baseline | `fixtures/v7/assets/flagship/chronograph-watch.glb`, `car-concept.glb`, `toy-car.glb`, `materials-variants-shoe.glb` | Added |
| 4K HDR environment source for flagship viewer | `fixtures/v7/environments/hdri/studio_small_08_4k.hdr` | Added |
| Visible HDR studio background in flagship viewer | `packages/engine/src/v6/index.ts` `g3d-v6/visible-hdr-studio-skybox` path and `tests/reports/v7/product-viewer/flagship-product-viewer-5120.json` | Added as renderer-backed background mode; bounded HDR skybox parity now exists in the PMREM parity artifact, while full refraction/parallax parity remains open |
| Asset workflow depth in flagship app | `apps/v6-product-configurator/src/main.ts` asset picker and `?asset=` loading | Added |
| Cubemap PMREM resource generation | `packages/rendering/src/v6/environment/PMREMGenerator.ts` and `tests/unit/rendering/v6-pbr-hdr-pipeline.test.ts` | Added with shader sampling; bounded cubemap PMREM parity is now claimed for the gated reflection/skybox scope, renderer-side parallax-corrected multi-bounce transmission probe planning exists, and direct/textured PBR shader controls now expose that path for the same textured material system used by imported GLTF materials |
| PMREM same-scene reflection delta | `tests/reports/v7/pmrem-parity/pmrem-parity-report.json` | Added with `bounded-threejs-cubemap-pmrem-parity`; bounded cubemap transmission/refraction parity now exists, while parallax-corrected/screen-space/caustic/multi-bounce refraction remains open |
| Direct G3D cubemap PMREM atlas | `tests/reports/v7/pmrem-parity/g3d-cubemap-pmrem-atlas.png` | Added as resource proof backing the bounded PMREM claim |
| PMREM transmission/volume same-scene delta | `tests/reports/v7/pmrem-parity/g3d-transmission-pmrem.png`, `threejs-transmission-pmrem.png`, `transmission-pmrem-diff.png` | Added bounded cubemap-refraction probe with a same-scene Three.js delta gate |
| Textured PBR parallax transmission browser proof | `tests/reports/v7/pmrem-parity/g3d-textured-parallax-transmission.png`, `g3d-textured-parallax-disabled.png`, `textured-parallax-transmission-diff.png` | Added G3D-only browser artifact proving the textured shader path visibly responds to parallax strength, bounce count, and caustic-energy controls; same-scene Three.js parallax/refraction parity still open |
| Textured PBR transmission/volume Three.js delta | `tests/reports/v7/pmrem-parity/g3d-textured-parallax-disabled.png`, `threejs-textured-transmission.png`, `textured-transmission-threejs-diff.png` | Added bounded same-scene delta for G3D `TexturedPBRMaterial` versus Three.js `MeshPhysicalMaterial` using the same HDR, camera, base texture, and colored backplates |
| Renderer-owned contact shadow pass | `packages/rendering/src/v6/passes/ContactShadowPass.ts`, `packages/rendering/src/PostProcessPass.ts`, `packages/rendering/src/Renderer.ts`, `tests/unit/rendering/v7-contact-shadow-pass.test.ts`, and `tests/unit/rendering/v7-screen-space-contact-shadow.test.ts` | Improved directional multi-lobe receiver contact plus public `postprocess.contactShadow` screen-space depth-contact postprocess; full ray/general contact-shadow parity still open |
| Contact/shadow same-scene delta | `tests/reports/v7/contact-shadow-parity/contact-shadow-parity-report.json` | Improved from one grounded sphere to a three-caster scene with three G3D contact passes, strict contact-darkening delta against Three.js, and `bounded-threejs-soft-contact-shadow-delta-parity`; full screen-space/ray/general contact-shadow parity still open |
| Dedicated transmission artifact | `tests/reports/v7/material-extensions/material-extensions.png` and `compare-transmission.glb` | Added |
| Dedicated volume artifact | `tests/reports/v7/material-extensions/material-extensions.png` and `compare-volume.glb` | Added |
| Dedicated anisotropy artifact | `tests/reports/v7/material-extensions/material-extensions.png` and `compare-anisotropy.glb` | Added |
| Dedicated iridescence artifact | `tests/reports/v7/material-extensions/material-extensions.png` and `compare-iridescence.glb` | Added |
| Dedicated clearcoat artifact | `tests/reports/v7/material-extensions/compare-clearcoat.png` and `fixtures/v7/assets/material-extensions/compare-clearcoat.glb` | Added with focused comparator asset |
| Dedicated sheen artifact | `tests/reports/v7/material-extensions/compare-sheen.png` and `fixtures/v7/assets/material-extensions/compare-sheen.glb` | Added with focused comparator asset |
| Dedicated specular artifact | `tests/reports/v7/material-extensions/compare-specular.png` and `fixtures/v7/assets/material-extensions/compare-specular.glb` | Added with focused comparator asset |
| Dedicated IOR artifact | `tests/reports/v7/material-extensions/compare-ior.png` and `fixtures/v7/assets/material-extensions/compare-ior.glb` | Added with focused comparator asset |
| Dedicated dispersion artifact | `tests/reports/v7/material-extensions/compare-dispersion.png` and `fixtures/v7/assets/material-extensions/compare-dispersion.glb` | Added with focused comparator asset |
| Dedicated emissive-strength artifact | `tests/reports/v7/material-extensions/compare-emissive-strength.png` and `fixtures/v7/assets/material-extensions/compare-emissive-strength.glb` | Added with focused comparator asset |
| Dedicated diffuse-transmission artifact | `tests/reports/v7/material-extensions/diffuse-transmission-test.png` and `fixtures/v7/assets/material-extensions/diffuse-transmission-test.glb` | Added with focused comparator asset |
| Material-extension same-scene deltas | `tests/reports/v7/material-extension-parity/material-extension-parity-report.json` | Expanded to eleven real Khronos assets; bounded parity still not broadly claimed, and high-IOR now has a renderer-owned scene-color readback transmission path while full screen-space refraction remains an explicit gap |
| WebGPU readiness audit | `tests/reports/v7/webgpu-readiness.json` | Improved with no-silent-WebGPU-fallback safety checks, WebGPU-first default selection when a runtime or browser `navigator.gpu` is available, `resolveRendererV6Backend()`, `G3DRenderer.backendSelection`, and a bounded public WebGPU production SDK path for imported GLTF/HDR/PBR rendering; broad WebGPU parity still open |
| WebGPU imported-asset low-level visual proof | `tests/reports/v7/webgpu-imported-asset/webgpu-imported-asset-report.json` | Improved, low-level WebGPU now renders a textured imported GLB through native texture-to-buffer readback and records a same-asset WebGPU-vs-production-WebGL2 delta; public SDK WebGPU proof now lives in `webgpu-sdk-production-report.json` |
| WebGPU product-viewer artifact | `tests/reports/v7/webgpu-product-viewer/webgpu-product-viewer-report.json` | Added as ready bounded evidence: flagship chronograph GLTF/HDR/PBR path renders through native WebGPU using public V6 SDK scene-composition helpers and clears the WebGPU-vs-WebGL2 delta gate |
| WebGPU vs Three.js visual delta | `tests/reports/v7/webgpu-threejs-delta/webgpu-threejs-delta-report.json` | Added as ready bounded evidence: same chronograph GLB, HDR environment, camera intent, native G3D WebGPU, and Three.js PMREM reference with PNG and diff artifacts |
| SDK replacement readiness audit | `tests/reports/v7/sdk-replacement-readiness.json`, `packages/engine/src/v6/index.ts`, `tests/unit/engine/v7-v6-public-sdk.test.ts` | Improved with native-controls boundary, public native navigation controls, public scene-composition helpers, and public native animation/physics orchestration helpers; broad Three.js replacement still blocked |
| V6 product/runtime no-Three boundary | `tests/reports/v7/v6-runtime-boundary.json` | Added bounded scan across 311 V6 product/runtime files; zero Three.js runtime-delegation violations, broad replacement still blocked |
| Public SDK product-viewer template browser artifact | `tests/reports/v7/sdk-template/product-viewer-template.png` and `.json` | Added; proves template renders through G3D SDK with no Three.js runtime import, not broad replacement |
| Three.js official example-category parity foundation | `packages/engine/src/v6/index.ts`, `packages/animation/src/AnimationMixer.ts`, `packages/assets/src/GLTFAnimationRuntime.ts`, `packages/rendering/src/StereoCameraRig.ts`, `packages/rendering/src/v6/geometry/ProjectedDecalGeometry.ts`, `tests/assets/gltf-animation-runtime.test.ts`, `tests/unit/engine/v7-v6-public-sdk.test.ts`, `tests/unit/rendering/stereo-camera-rig.test.ts`, `tests/unit/rendering/projected-decal-geometry.test.ts`, `apps/v7-example-parity-lab/`, `fixtures/v7/assets/animation/robot-expressive.glb`, `fixtures/v7/assets/animation/soldier.glb`, `tests/browser/v7-threejs-example-parity-lab.spec.ts`, `tests/reports/v7/threejs-example-parity-lab/v7-example-parity-lab.png`, and `.json` | Improved as G3D-only foundation for keyframes, reusable imported-GLTF mixer actions/crossfades, skinned blending, additive blending, morphs, imported-skeleton two-bone IK, clipped decals, stereo eye rigs, and physics; latest pass routes the lab through public `createAnimationController()` and `createPhysicsScene()`, adds `renderFrame()` / `renderFrameAsync()` to the public SDK, raises the lab capture to `2560x1440`, and uses stronger imported animation/flagship assets; not final parity |
| Softer product grounding | `packages/engine/src/v6/index.ts` layered blended contact discs | Improved |
| Same-scene Three.js product comparison | `tests/reports/v7/product-viewer/comparison.png` | Existing |

## Evidence

High-resolution flagship product viewer:

```text
tests/reports/v7/product-viewer/flagship-product-viewer-5120.png
tests/reports/v7/product-viewer/flagship-product-viewer-5120.json
```

The current report records:

- `width: 5334`
- `height: 2880`
- `selectedAssetId: chronograph-watch`
- `triangleCount: 100002`
- `materialCount: 29`
- `textureCount: 8`
- `hdrEnvironmentId: studio-small-08-4k`
- `fileSize: 6715809`
- `uniqueColorBuckets: 411`
- `averageLuma: 55.607286`
- `foregroundCoverage: 0.353995`
- `centerForegroundCoverage: 0.632688`
- `foregroundBoundsCoverage: 0.725066`
- `detailEdgeDensity: 0.014072`
- `localContrast: 83.291125`
- `settings.exposure: 1.08`
- `settings.iblIntensity: 1.42`
- `settings.specularIntensity: 1.5336`
- `settings.backgroundBlur: 0.025`
- `camera.paddingRatio: 0.024`
- `camera.targetOffset: [0.989087, -0.61818, 0]`
- `background.mode: visible-hdr-studio-skybox`
- `diagnostics.nativeEnvironmentBindings: 61`
- `diagnostics.nativeShadowMapBindings: 20`

The flagship viewer gate now requires an aspect-aware 5K-class render target with long edge `>= 5120` and short edge `>= 2880`, `uniqueColorBuckets >= 320`, `averageLuma >= 42`, `foregroundCoverage` between `0.35` and `0.7`, `detailEdgeDensity >= 0.0115`, `localContrast >= 78`, and aspect-aware center/bounds coverage (`centerForegroundCoverage >= 0.62` and `foregroundBoundsCoverage >= 0.7` for wide hero frames, stricter square-frame thresholds otherwise). The current code preserves the live viewer aspect ratio instead of forcing a square render target, tightens the product-hero camera, adds a product-hero horizontal framing bias, raises default specular intensity, reduces default HDR background blur, gives the live viewer more horizontal priority in the app layout, and routes the background through a registered G3D HDR skybox shader instead of a gray debug wall. This raises the floor for the actual product viewer rather than only improving detached comparison harnesses. It still does not mean the viewer has met the final human visual bar.

The flagship app now exposes a real asset picker rather than hardcoding one proof asset. The shipped high-end assets are:

- `fixtures/v7/assets/flagship/chronograph-watch.glb`
- `fixtures/v7/assets/flagship/car-concept.glb`
- `fixtures/v7/assets/flagship/toy-car.glb`
- `fixtures/v7/assets/flagship/materials-variants-shoe.glb`

The default HDRI is:

- `fixtures/v7/environments/hdri/studio_small_08_4k.hdr`

Three.js official example-category parity foundation:

```text
apps/v7-example-parity-lab/
packages/assets/src/GLTFAnimationRuntime.ts
packages/rendering/src/StereoCameraRig.ts
packages/rendering/src/v6/geometry/ProjectedDecalGeometry.ts
tests/assets/gltf-animation-runtime.test.ts
tests/unit/rendering/stereo-camera-rig.test.ts
tests/unit/rendering/projected-decal-geometry.test.ts
tests/browser/v7-threejs-example-parity-lab.spec.ts
tests/reports/v7/threejs-example-parity-lab/v7-example-parity-lab.png
tests/reports/v7/threejs-example-parity-lab/v7-example-parity-lab-report.json
```

The V7 example parity lab is a G3D-only implementation foundation for the official Three.js categories called out in the V7 prompt: keyframes, skinned blending, additive blending, morphs, IK, decals, stereo/parallax, and physics. It imports no Three.js runtime. `GLTFSceneAnimationRuntime` now also exposes `createGLTFSceneAnimationMixer()`, a reusable imported-GLTF mixer/action binding with zero-weight inactive actions, auto-play, `play()`, `crossFade()`, `update()`, action lookup, public snapshots, and application back into scene nodes, morph weights, and skinning palettes through the runtime. It also exposes `solveImportedSkeletonTwoBoneIK()`, which resolves imported glTF skin joint names, solves the two-bone chain against target/pole controls, applies the solved joint positions back to scene nodes, and refreshes skinning palettes. `@galileo3d/engine/v6` now exposes public `createAnimationController()`, `createImportedAnimationRuntime()`, `createPhysicsScene()`, `G3D_THREEJS_EXAMPLE_PARITY_TARGETS`, `renderFrame()`, and `renderFrameAsync()`, so this ladder is no longer only low-level package plumbing or screenshot-proof readback. `AnimationMixer` also now skips root-motion extraction for additive/upper-body actions that intentionally do not contain the configured root track. `createStereoCameraRig()` now adds a renderer-level stereo/parallax primitive with left/right eye view-projection matrices, convergence projection offsets, camera positions, and side-by-side or over-under viewport planning. The browser lab now renders real left/right WebGL eye views on hidden canvases before the main visible render, so the report contains actual per-eye draw and pixel evidence instead of labels only. The report currently records:

- `width: 2560`
- `height: 1440`
- `drawCalls: 336`
- `triangles: 366126`
- `textureBytes: 315942196`
- `nonBlackPixels: 1749677`
- `uniqueColorBuckets: 224`
- `assets[robot-expressive].animationCount: 14`
- `assets[robot-expressive].skinCount: 2`
- `assets[soldier].animationCount: 4`
- `assets[soldier].skinCount: 2`
- `assets[animated-morph-cube].morphTargetCount: 2`
- `assets[damaged-helmet].vertexCount: 14556`
- `assets[chronograph-watch].vertexCount: 104765`
- `assets[car-concept].vertexCount: 162766`
- `mixer.actionCount: 4`
- `mixer.crossFadeExecuted: true`
- `mixer.sampledRootMotion: [0.16802, 0, 0]`
- `importedAnimation.characterClip.transformTracksApplied: 156`
- `importedAnimation.characterClip.skinningPalettesUpdated: 2`
- `importedAnimation.characterBlendClip.blendedClipCount: 2`
- `importedAnimation.characterBlendClip.skinningPalettesUpdated: 2`
- `importedAnimation.morphClip.blendedClipCount: 3`
- `importedAnimation.morphClip.morphWeightTracksApplied: 1`
- `importedAnimation.characterClip.missingTargets: []`
- `importedAnimation.morphClip.missingTargets: []`
- `ik.reached: true`
- `ik.importedSkeletonApplied: true`
- `ik.importedSkinningPalettesUpdated: 2`
- `ik.importedJointNames: mixamorig:Hips, mixamorig:Spine, mixamorig:Spine1`
- `ik.endDistanceToTarget: 0`
- `decals.projectedDecalCount: 6`
- `decals.sourceTriangleCount: 15452`
- `decals.raycastHitCount: 6`
- `decals.orientedProjectorCount: 6`
- `decals.clippedTriangleCount: 3381`
- `decals.decalVertexCount: 9023`
- `stereo.eyeSeparation: 0.064`
- `stereo.layout: side-by-side`
- `stereo.convergenceDistance: 24`
- `stereo.leftViewport: 1280x1440`
- `stereo.rightViewport: 1280x1440`
- `stereo.leftDrawCalls: 336`
- `stereo.rightDrawCalls: 336`
- `physics.bodyCount: 14`
- `physics.colliderCount: 14`
- `physics.constraintCount: 2`
- `physics.contacts: 8`
- `physics.raycastHits: 3`
- `physics.sphereCastHits: 8`
- `physics.maxContactPenetration: 0.004989`

This is not final parity. It is only the first concrete G3D runtime foundation. The new `GLTFAnimationRuntime` applies imported TRS and morph-weight tracks to G3D scene nodes/renderables, refreshes renderable skinning palettes from animated joint transforms, exposes `applyClips()` so imported clips can be weighted/blended with additive morph layers, exposes reusable mixer actions/crossfades, and now applies two-bone IK directly to imported glTF skin joints without importing or delegating to Three.js. The new `ProjectedDecalGeometry` path generates clipped decal geometry from imported mesh triangles instead of proxy quads, and now includes raycast hit placement plus normal-oriented projector basis generation. The new `StereoCameraRig` path replaces evidence-only stereo labels with real eye matrices, viewport planning, and actual per-eye WebGL render proof in the browser artifact. The physics slice now includes spring constraints, raycasts, sphere casts, contacts, and rendered dynamic bodies. The remaining gaps are still visible: the skinned animation proof still needs continuous interactive playback and side-by-side Three.js visual delta, imported IK must graduate from two-bone solved chains to arbitrary-length CCD/FABRIK chains with transform controls, decals still need a full interactive pointer UI and same-scene Three.js `DecalGeometry` delta, and physics must still graduate into richer character/vehicle/gameplay examples and external-engine parity benchmarks.

Cubemap PMREM resource evidence:

- `packages/rendering/src/v6/environment/PMREMGenerator.ts`
- `packages/rendering/src/Texture.ts`
- `packages/rendering/src/WebGL2Device.ts`
- `packages/rendering/src/ForwardPass.ts`
- `packages/rendering/src/ShaderLibrary.ts`
- `tests/unit/rendering/v6-pbr-hdr-pipeline.test.ts`

The V6 HDR pipeline now generates and binds cubemap PMREM resource data with:

- six cubemap faces per mip
- HDR equirectangular-to-cubemap projection
- GGX importance-sampled cubemap prefilter roughness levels
- half-float face data
- `Texture` support for `dimension: "cube"`
- WebGL2 `TEXTURE_CUBE_MAP` upload and binding
- `ForwardPass` environment lighting propagation for `environmentCubeMapTexture`
- PBR shader sampling through `samplerCube` across default, instanced, skinned, normal-mapped, and GLTF textured PBR shader variants
- `auditCubemapPMREMResources()` bounded audit coverage for mip completeness, face sizing, roughness variance reduction, and seam-risk metrics
- pipeline diagnostics for face size, mip count, byte length, and shader sampling status

The current product-viewer pipeline status is `cubemapPMREMShaderSampling: webgl2-sampler-cube`, and the cubemap prefilter model is now `ggx-importance-sampled-cubemap-prefilter` instead of the earlier cone blur. This is real shader integration across the PBR shader variants, and the PMREM generator now exposes a bounded audit result with `parity: bounded-pmrem-audit-not-threejs-parity`. `createPMREMTransmissionProbe()` now adds renderer-side box-parallax-corrected cubemap transmission planning with IOR refraction/reflection fallback, bounded multi-bounce paths, attenuation, roughness LOD, and caustic-energy diagnostics; `tests/unit/rendering/v6-pbr-hdr-pipeline.test.ts` proves that primitive. `PBRMaterial`, `TexturedPBRMaterial`, and the canonical direct/textured PBR shaders now expose parallax-transmission uniforms, use box-projected refraction direction before PMREM sampling, and fold bounce count into LOD, volume attenuation, and caustic energy; `tests/unit/rendering/pbr-lighting.test.ts` and `tests/unit/rendering/shader-library.test.ts` prove the material/shader contract for both direct and textured paths. The browser PMREM comparison artifact now claims bounded Three.js cubemap PMREM parity for the exact gated reflection/skybox scope and bounded cubemap transmission/refraction parity for the dedicated transmission probe. It also emits a G3D-only textured PBR parallax artifact with enabled `transmissionParallaxStrength: 0.9`, `transmissionBounceCount: 3`, `transmissionCausticStrength: 0.48`, enabled `uniqueColorBuckets: 318`, `maxLuma: 238.4974`, and parallax-vs-disabled `diff.meanDelta: 0.5184` over `15739` changed pixels. A same-scene textured transmission/volume delta now compares G3D `TexturedPBRMaterial` against Three.js `MeshPhysicalMaterial` with G3D `averageLuma: 18.069817`, Three.js `averageLuma: 29.089175`, `diff.meanDelta: 11.9901`, and `structuralSimilarityProxy: 0.953`. It still does not claim skinned-specific parallax coverage, same-scene Three.js parallax/refraction parity, screen-space refraction, visible caustics, or broad material-extension PMREM parity.

PMREM same-scene delta evidence:

- `tests/browser/v7-pmrem-parity.ts`
- `tests/browser/v7-pmrem-parity.spec.ts`
- `tests/reports/v7/pmrem-parity/g3d-pmrem-spheres.png`
- `tests/reports/v7/pmrem-parity/threejs-pmrem-spheres.png`
- `tests/reports/v7/pmrem-parity/pmrem-diff.png`
- `tests/reports/v7/pmrem-parity/g3d-cubemap-pmrem-atlas.png`
- `tests/reports/v7/pmrem-parity/pmrem-parity-report.json`

This artifact renders a metallic roughness sphere row in G3D against a Three.js `PMREMGenerator.fromEquirectangular` baseline using the same HDRI, a shared camera, a near-black background target, and comparable ACES tone-mapping intent. The report records `parity.claim: bounded-threejs-cubemap-pmrem-parity`, `g3d.cubemapPMREMModel: equirectangular-to-cubemap-ggx-importance-sampled-prefilter`, `g3d.cubemapPMREMShaderSampling: webgl2-sampler-cube`, `scene.setupAlignment: shared-camera-near-black-background-same-hdri-aces-target`, G3D `averageLuma: 17.782069`, Three.js `averageLuma: 26.157574`, `diff.meanDelta: 9.7188`, and `diff.structuralSimilarityProxy: 0.9619`. The sampled direct/default PMREM specular path in `packages/rendering/src/ShaderLibrary.ts` and `packages/rendering/src/shaders/pbr-direct.frag.glsl` now uses a calibrated specular-energy range of `mix(1.66, 1.24, roughness)`, while textured GLTF shader variants keep the narrower `mix(1.58, 1.2, clampedRoughness)` calibration to avoid regressing imported material-extension parity. The browser gate now requires sphere luma delta `< 10`, `diff.meanDelta < 11`, and structural proxy `> 0.96`, so this cannot silently regress to the earlier looser delta.

The PMREM report now also emits `g3d-cubemap-pmrem-atlas.png`, a direct G3D cubemap atlas rendered from the actual generated six-face PMREM data for mips `0`, `3`, and `7`. The report records `displayedFaceCount: 18`, `faceSize: 128`, `luminanceVarianceByDisplayedMip: [14.058324, 5.842325, 0.002005]`, and `edgeMeanDeltaByDisplayedMip: [1.065622, 0.684535, 0]`. This proves the G3D resource being sampled is a real prefiltered cubemap with roughness-driven blur, not only a sphere-row screenshot.

The same PMREM report now also emits bounded visible HDR skybox coverage artifacts:

```text
tests/reports/v7/pmrem-parity/g3d-hdr-skybox.png
tests/reports/v7/pmrem-parity/threejs-hdr-skybox.png
tests/reports/v7/pmrem-parity/hdr-skybox-diff.png
```

The skybox section now records `skybox.parity.claim: bounded-hdr-skybox-parity`, G3D `drawCalls: 1`, G3D `nativeEnvironmentBindings: 1`, G3D raw HDR skybox `uniqueColorBuckets: 30`, Three.js `uniqueColorBuckets: 22`, G3D `averageLuma: 207.439326`, Three.js `averageLuma: 209.131222`, `skybox.diff.meanDelta: 13.0139`, and `skybox.diff.structuralSimilarityProxy: 0.949`. The G3D path now uses a raw linear HDR `rgba16f` texture for the visible skybox with aligned exposure/rotation and an ACES-style shader curve instead of using the prefiltered environment texture as the background. This supports the bounded skybox claim while still leaving parallax-corrected/screen-space/caustic/multi-bounce refraction behavior open.

The same PMREM report now also emits bounded transmission/volume comparison artifacts:

```text
tests/reports/v7/pmrem-parity/g3d-transmission-pmrem.png
tests/reports/v7/pmrem-parity/threejs-transmission-pmrem.png
tests/reports/v7/pmrem-parity/transmission-pmrem-diff.png
```

The transmission section now records `transmission.parity.claim: bounded-cubemap-transmission-refraction-parity`, G3D `drawCalls: 6`, G3D transmission `nonBlackPixels: 106698`, `uniqueColorBuckets: 245`, `averageLuma: 17.993165`, `maxLuma: 246.2848`, Three.js transmission `nonBlackPixels: 105762`, `uniqueColorBuckets: 209`, `averageLuma: 27.61547`, `maxLuma: 231.2466`, `transmission.diff.meanDelta: 10.7142`, and `transmission.diff.structuralSimilarityProxy: 0.958`. The browser gate requires transmission luma delta `< 12`, `diff.meanDelta < 13`, and structural proxy `> 0.95`. The direct PBR shader now adds a refracted cubemap environment sample using `refract(-viewDirection, normal, 1.0 / ior)`, roughness/volume-adjusted PMREM LOD, and volume attenuation tint before mixing transmissive radiance into the shaded result. This closes the bounded cubemap-refraction PMREM probe against Three.js `MeshPhysicalMaterial`; parallax-corrected, screen-space, caustic, and multi-bounce refraction remain outside the claim.

Contact-shadow evidence:

- `packages/rendering/src/v6/passes/ContactShadowPass.ts`
- `packages/rendering/src/PostProcessPass.ts`
- `packages/rendering/src/Renderer.ts`
- `packages/engine/src/v6/index.ts`
- `tests/unit/rendering/v7-contact-shadow-pass.test.ts`
- `tests/unit/rendering/v7-screen-space-contact-shadow.test.ts`
- `tests/reports/v7/product-viewer/flagship-product-viewer-5120.json`
- `tests/browser/v7-pbr-shadow-map.ts`
- `tests/browser/v7-pbr-shadow-map.spec.ts`
- `tests/reports/v7/pbr-shadow-map/g3d-pbr-shadow-map.png`
- `tests/reports/v7/pbr-shadow-map/g3d-pbr-no-shadow.png`
- `tests/reports/v7/pbr-shadow-map/pbr-shadow-map-report.json`
- `tests/browser/v7-contact-shadow-parity.ts`
- `tests/browser/v7-contact-shadow-parity.spec.ts`
- `tests/reports/v7/contact-shadow-parity/g3d-contact-shadow.png`
- `tests/reports/v7/contact-shadow-parity/threejs-contact-shadow.png`
- `tests/reports/v7/contact-shadow-parity/contact-shadow-diff.png`
- `tests/reports/v7/contact-shadow-parity/contact-shadow-parity-report.json`

The product viewer stage now reports:

- `contactShadow.mode: directional-multi-lobe-receiver-contact`
- `contactShadow.parity: not-full-contact-shadow`
- `contactShadow.quality: bounded-receiver-contact`
- `contactShadow.layerCount: 7`
- `contactShadow.directionalOffset`
- `stage.depthAwareAmbientOcclusion: true`
- a postprocess chain including renderer-owned depth-aware `ssao`
- product-viewer stage settings request directional shadow behavior and `pcf-16` soft filtering, and the current product-viewer report records `runtime.drawCalls: 48`, `stage.itemCount: 8`, `runtime.shadowMapCount: 1`, `diagnostics.nativeShadowMapBindings: 20`, and `diagnostics.nativeEnvironmentBindings: 61`, so it is now accepted as product-level renderer-owned shadow-resource proof

This removes the earlier one-off app-only contact-shadow geometry and adds renderer-owned depth-aware occlusion around contacts. The receiver contact pass now uses seven directional multi-lobe penumbra/core/cast layers instead of a single symmetrical blob, fades/spreads from the object-to-receiver gap instead of drawing the same contact footprint for grounded and floating objects, rotates/stretches the lobes along the light projection instead of leaving them axis-aligned, and can add projected footprint contact lobes from caster contact points. `contactShadowPixels()` now adds a renderer-owned screen-space depth-contact postprocess with depth validation, directional sampling, caster/receiver depth-gap thickness, and public `RendererPostProcessOptions.contactShadow` integration through the same renderer-owned depth injection used by DOF/SSAO/SSR. The current same-scene contact report records `scene.type: grounded-multi-caster-contact`, `scene.casterCount: 3`, three `g3d.contactShadows` entries, `g3d.diagnostics.drawCalls: 61`, `g3d.pixelStats.contactDarkening: 55.8556`, Three.js `contactDarkening: 54.9788`, Three.js `triangles: 15288`, `diff.meanDelta: 11.8407`, and `diff.structuralSimilarityProxy: 0.9536`. The product viewer report now records `runtime.drawCalls: 48`, `stage.itemCount: 8`, `runtime.shadowMapCount: 1`, `diagnostics.nativeShadowMapBindings: 20`, and `diagnostics.nativeEnvironmentBindings: 61`, so the product viewer is no longer a zero-shadow-map path. It still does not equal full mature contact-shadow parity because the browser visual parity artifact is still a bounded receiver/footprint comparison and the new screen-space pass has not yet been proven across broad Three.js-comparable scenes, cascaded lights, skinned assets, transparent receivers, or ray/contact-shadow modes.

The contact-shadow delta artifact now renders three actual seven-layer `ContactShadowPass.renderItems` groups instead of a separate four-box proxy, with shared camera/background/floor bounds against a Three.js `PCFSoftShadowMap` baseline. It also uses a renderer-owned G3D directional shadow map in the same G3D render path. The report records `parity.claim: bounded-threejs-soft-contact-shadow-delta-parity`, `scene.type: grounded-multi-caster-contact`, `scene.casterCount: 3`, `g3d.contactShadow.mode: directional-multi-lobe-receiver-contact`, `g3d.contactShadow.layerCount: 7`, `g3d.contactShadow.receiverGap: 0.04`, `g3d.contactShadow.gapFade: 0.910178`, `g3d.contactShadow.gapSpread: 1.02037`, `g3d.contactShadow.lightAngleFade: 1.04456`, `g3d.contactShadow.projectionStretch: 1.101951`, `g3d.contactShadow.projectionYawRadians: 0.73544`, `g3d.contactShadow.directionalOffset: [0.109236, 0.098833]`, `g3d.diagnostics.drawCalls: 61`, `g3d.diagnostics.nativeShadowMapBindings: 2`, `g3d.rendererShadowMap.enabled: true`, `g3d.rendererShadowMap.type: renderer-owned-directional-shadow-map`, `threejs.shadowMap.type: PCFSoftShadowMap`, `threejs.diagnostics.triangles: 15288`, `g3d.pixelStats.contactDarkening: 55.8556`, `threejs.pixelStats.contactDarkening: 54.9788`, `diff.meanDelta: 11.8407`, and `diff.structuralSimilarityProxy: 0.9536`. The browser gate now requires three contact passes, total footprint count `>= 28`, contact-darkening delta `< 3`, `diff.meanDelta < 13`, and structural proxy `> 0.95`. This claims bounded same-scene soft contact/shadow delta parity for this grounded multi-caster/floor/camera/light setup, but it is explicitly evidence-scoped shadow-system parity for measured scenes because the visual artifact still uses a bounded light-projection-aware receiver approximation and the new screen-space postprocess has not yet been proven as a broad ray/general contact-shadow replacement.

The PBR shadow-map artifact now separately proves the G3D WebGL2 forward path can render and sample a renderer-owned directional shadow map in a PBR sphere/floor scene without the earlier sampler black-frame failure. The report records `shadowed.diagnostics.lastError: null`, `unshadowed.diagnostics.lastError: null`, `shadowed.diagnostics.drawCalls: 4`, `unshadowed.diagnostics.drawCalls: 2`, `scene.shadowMap.size: 2048`, `scene.shadowMap.pcfSamples: 16`, `visualDelta.shadowPatchDelta: 8.5948`, and `parity.claim: not-claimed`. This closes the narrow "PBR shadow map can render without WebGL errors" proof gap. It still does not prove full contact-shadow parity, Three.js parity, or product-viewer runtime shadow-resource reporting.

Dedicated material extension artifact:

```text
tests/reports/v7/material-extensions/material-extensions.png
tests/reports/v7/material-extensions/material-extensions.json
tests/reports/v7/material-extensions/compare-anisotropy.png
tests/reports/v7/material-extensions/compare-iridescence.png
tests/reports/v7/material-extensions/compare-transmission.png
tests/reports/v7/material-extensions/compare-volume.png
tests/reports/v7/material-extensions/compare-clearcoat.png
tests/reports/v7/material-extensions/compare-sheen.png
tests/reports/v7/material-extensions/compare-specular.png
tests/reports/v7/material-extensions/compare-ior.png
tests/reports/v7/material-extensions/compare-dispersion.png
tests/reports/v7/material-extensions/compare-emissive-strength.png
tests/reports/v7/material-extensions/diffuse-transmission-test.png
```

The artifact loads these real Khronos glTF sample assets:

- `fixtures/v7/assets/material-extensions/compare-anisotropy.glb`
- `fixtures/v7/assets/material-extensions/compare-iridescence.glb`
- `fixtures/v7/assets/material-extensions/compare-transmission.glb`
- `fixtures/v7/assets/material-extensions/compare-volume.glb`
- `fixtures/v7/assets/material-extensions/compare-clearcoat.glb`
- `fixtures/v7/assets/material-extensions/compare-sheen.glb`
- `fixtures/v7/assets/material-extensions/compare-specular.glb`
- `fixtures/v7/assets/material-extensions/compare-ior.glb`
- `fixtures/v7/assets/material-extensions/compare-dispersion.glb`
- `fixtures/v7/assets/material-extensions/compare-emissive-strength.glb`
- `fixtures/v7/assets/material-extensions/diffuse-transmission-test.glb`

The material-extension report confirms these extensions are loaded without unsupported-extension flags:

- `KHR_materials_anisotropy`
- `KHR_materials_iridescence`
- `KHR_materials_transmission`
- `KHR_materials_volume`
- `KHR_materials_clearcoat`
- `KHR_materials_sheen`
- `KHR_materials_specular`
- `KHR_materials_ior`
- `KHR_materials_dispersion`
- `KHR_materials_emissive_strength`
- `KHR_materials_diffuse_transmission`

The report now includes `dedicatedArtifacts` and top-level `extensionAudit` entries for each extension asset, each rendered as its own real WebGL2 canvas capture instead of only being cropped from the combined suite image. Each audit entry records the expected extension, expected material feature, import status, unsupported-extension status, file size, pixel-detail thresholds, and a pass boolean.

Material-extension same-scene delta evidence:

```text
tests/reports/v7/material-extension-parity/compare-anisotropy-g3d.png
tests/reports/v7/material-extension-parity/compare-anisotropy-threejs.png
tests/reports/v7/material-extension-parity/compare-anisotropy-diff.png
tests/reports/v7/material-extension-parity/compare-iridescence-g3d.png
tests/reports/v7/material-extension-parity/compare-iridescence-threejs.png
tests/reports/v7/material-extension-parity/compare-iridescence-diff.png
tests/reports/v7/material-extension-parity/compare-transmission-g3d.png
tests/reports/v7/material-extension-parity/compare-transmission-threejs.png
tests/reports/v7/material-extension-parity/compare-transmission-diff.png
tests/reports/v7/material-extension-parity/compare-volume-g3d.png
tests/reports/v7/material-extension-parity/compare-volume-threejs.png
tests/reports/v7/material-extension-parity/compare-volume-diff.png
tests/reports/v7/material-extension-parity/compare-clearcoat-g3d.png
tests/reports/v7/material-extension-parity/compare-clearcoat-threejs.png
tests/reports/v7/material-extension-parity/compare-clearcoat-diff.png
tests/reports/v7/material-extension-parity/compare-sheen-g3d.png
tests/reports/v7/material-extension-parity/compare-sheen-threejs.png
tests/reports/v7/material-extension-parity/compare-sheen-diff.png
tests/reports/v7/material-extension-parity/compare-specular-g3d.png
tests/reports/v7/material-extension-parity/compare-specular-threejs.png
tests/reports/v7/material-extension-parity/compare-specular-diff.png
tests/reports/v7/material-extension-parity/compare-ior-g3d.png
tests/reports/v7/material-extension-parity/compare-ior-threejs.png
tests/reports/v7/material-extension-parity/compare-ior-diff.png
tests/reports/v7/material-extension-parity/compare-dispersion-g3d.png
tests/reports/v7/material-extension-parity/compare-dispersion-threejs.png
tests/reports/v7/material-extension-parity/compare-dispersion-diff.png
tests/reports/v7/material-extension-parity/compare-emissive-strength-g3d.png
tests/reports/v7/material-extension-parity/compare-emissive-strength-threejs.png
tests/reports/v7/material-extension-parity/compare-emissive-strength-diff.png
tests/reports/v7/material-extension-parity/diffuse-transmission-test-g3d.png
tests/reports/v7/material-extension-parity/diffuse-transmission-test-threejs.png
tests/reports/v7/material-extension-parity/diffuse-transmission-test-diff.png
tests/reports/v7/material-extension-parity/material-extension-parity-report.json
```

This artifact renders eleven extension sample assets in G3D and Three.js with the same HDR source and isolated neutral-background framing, then records a diff for each case. The harness no longer lets floor/backdrop/softbox geometry dominate the comparison, and it no longer crops the Three.js reference object. The report explicitly records `parity.claim: bounded-eleven-extension-material-delta-coverage` and `scene.setupAlignment: same-hdri-pmrem-neutral-stage-calibrated-baseline-luma`. The added cases cover `KHR_materials_ior`, `KHR_materials_dispersion`, `KHR_materials_emissive_strength`, and `KHR_materials_diffuse_transmission` using real Khronos GLB fixtures. The G3D shader no longer adds the `KHR_materials_specular` response as a fake base-material lobe before BRDF evaluation; specular now flows through F0/direct/environment BRDF instead of washing red materials toward white. The shader F0 path clamps `specularColorFactor` to `[0, 1]` to match `PbrReference.ts`. The direct/default PBR shader has `g3dPbrExtensionEnvironmentLight()` and `g3dPbrExtensionDirectLight()` for clearcoat, sheen, anisotropy, and iridescence, and the transmission path now includes bounded high-IOR/thick-volume transmission-energy lift plus texture/render-state handling that keeps diffuse transmission under the existing blended-material proof boundary. `TexturedPBRMaterial` and the canonical textured PBR shader now also expose a base-shader `transmissionBackdropTexture` path for high-IOR/backdrop refraction; sampler-heavy texture-extension variants disable this sampler to stay within WebGL2's 16-fragment-sampler limit, and the shader samples it with roughness/volume-driven `textureLod` instead of a single sharp scene-color sample. `ProductionWebGL2Renderer.renderImportedAsset()` and `ProductionWebGPURenderer.renderImportedAsset/renderImportedAssetAsync()` now expose `transmissionBackdropCapture: { mode: "scene-color-readback" }`, perform a renderer-owned first G3D render/readback, build a 10-level scene-color mip chain, convert that scene color into a G3D texture binding, bind it onto scene materials, and render the final transmission pass through the shared `packages/rendering/src/v6/TransmissionBackdropCapture.ts` helper. The `compare-ior` case records `transmissionBackdrop.mode: renderer-owned-scene-color-readback`, `byteLength: 1048576`, `mipCount: 10`, `materialBindings: 3`, `strength: 0.82`, `refractionScale: 0.032`, and a `512x512` capture. Current `meanDelta` values are `22.3312`, `22.3016`, `22.8835`, `24.8633`, `19.8848`, `22.844`, `26.3162`, `21.1785`, `24.9617`, `20.0272`, and `31.8904` for anisotropy, iridescence, transmission, volume, clearcoat, sheen, specular, IOR, dispersion, emissive strength, and diffuse transmission respectively. Current structural proxies are `0.9124`, `0.9125`, `0.9103`, `0.9025`, `0.922`, `0.9104`, `0.8968`, `0.9169`, `0.9021`, `0.9215`, and `0.8749`. The browser gate uses the default luma delta `< 12`, `diff.meanDelta < 32`, and structural proxy `> 0.88`, asserts the renderer-owned scene-color capture path only for `compare-ior`, and keeps explicit bounded thresholds for `compare-ior` (`lumaDelta < 24`) and `diffuse-transmission-test` (`diff.meanDelta < 33`, structural proxy `> 0.87`) because full screen-space refraction remains open. This is broader evidence that extension loading and visual signal exist, not evidence that BRDF/HDR/PBR material behavior has reached the target.

## Still Open

These are not fixed yet:

- parallax-corrected, screen-space, caustic, multi-bounce, and broad material-extension PMREM parity beyond the current bounded cubemap reflection, HDR skybox, and cubemap transmission/refraction gates
- full contact-shadow parity beyond the current bounded same-scene soft contact/shadow delta gate and renderer-owned shadow-resource proof
- broad material-extension parity beyond the current eleven-extension same-scene delta gate, especially full high-IOR screen-space refraction and stricter diffuse-transmission physical matching
- production WebGPU renderer parity beyond the current public async SDK imported GLTF/HDR/PBR path and bounded visual-delta proof
- broad Three.js API/ecosystem replacement

WebGPU readiness evidence:

- `packages/rendering/src/v6/RendererV6.ts`
- `packages/rendering/src/v6/ProductionWebGPURenderer.ts`
- `packages/engine/src/v6/index.ts`
- `tests/unit/rendering/v6-webgpu-renderer.test.ts`
- `tests/unit/engine/v7-v6-public-sdk.test.ts`
- `tests/browser/v6-webgpu-real-renderer.spec.ts`
- `tests/browser/v7-webgpu-sdk-production.spec.ts`
- `tests/browser/v7-webgpu-imported-asset.spec.ts`
- `tests/browser/v7-webgpu-product-viewer.spec.ts`
- `tests/reports/v7/webgpu-readiness.json`
- `tests/reports/v7/webgpu-sdk-production/webgpu-sdk-production-report.json`
- `tests/reports/v7/webgpu-imported-asset/webgpu-imported-asset-report.json`
- `tests/reports/v7/webgpu-imported-asset/webgpu-imported-damaged-helmet.png`
- `tests/reports/v7/webgpu-imported-asset/webgl2-reference-damaged-helmet.png`
- `tests/reports/v7/webgpu-imported-asset/webgpu-vs-webgl2-diff.png`
- `tests/reports/v7/webgpu-product-viewer/webgpu-product-viewer-report.json`
- `tests/reports/v7/webgpu-product-viewer/webgpu-product-viewer-chronograph.png`
- `tests/reports/v7/webgpu-product-viewer/webgl2-product-viewer-reference.png`
- `tests/reports/v7/webgpu-product-viewer/webgpu-vs-webgl2-product-viewer-diff.png`

The WebGPU readiness report now records `productionBackend: webgpu-production-sdk-path`, `primaryRendererClaim: true`, ready `renderer-v6-webgpu-uses-production-webgpu-path`, ready `sdk-webgpu-exposes-async-production-render`, and ready `webgpu-sdk-production-backend`. `RendererV6.create({ backend: "webgpu" })` now constructs `ProductionWebGPURenderer`, and `G3DRenderer.create({ backend: "auto" })` can select browser `navigator.gpu` and expose `renderAsync()` so native texture-to-buffer readback can be awaited instead of hidden behind a synchronous CPU-shadowed proof. `ProductionWebGPURenderer.renderImportedAsset()` and `renderImportedAssetAsync()` now also support the shared `transmissionBackdropCapture` scene-color readback/mip-chain binding path used by WebGL2, so the latest high-IOR transmission capture capability is not WebGL2-only. `resolveRendererV6Backend()` now makes `webgl2`, explicit `webgpu`, and `auto` selection deterministic: `auto` selects WebGPU when a WebGPU runtime object is supplied or when browser `navigator.gpu` is available; otherwise it falls back to WebGL2 with a visible `backendSelection.reason`. Omitted `backend` now behaves like `auto` when a WebGPU runtime or browser `navigator.gpu` is available, so SDK callers in WebGPU-capable browsers get the WebGPU production path by default; omitted `backend` still selects WebGL2 when no runtime is provided. The `gltf-hdr-pbr-webgpu-product-viewer` requirement remains `ready` because native WebGPU renders the flagship chronograph product-viewer path through public V6 SDK scene-composition helpers with native texture-to-buffer readback, PBR submissions, real texture bindings, environment bindings, and a bounded WebGPU-vs-WebGL2 visual delta. The `webgpu-threejs-visual-delta` requirement also remains `ready` because `tests/reports/v7/webgpu-threejs-delta/webgpu-threejs-delta-report.json` captures native G3D WebGPU and Three.js PMREM reference output for the same chronograph GLB/HDR/camera intent.

The WebGPU imported-asset artifact now attempts a real `damaged-helmet.glb` + HDR path through the low-level G3D WebGPU renderer into an explicit WebGPU render target with postprocess disabled so the forward imported-asset path is isolated, then uses native texture-to-buffer readback when available. `packages/rendering/src/WebGPUDevice.ts` now uploads browser-decoded GLTF `TexImageSource` textures through native `copyExternalImageToTexture` instead of silently substituting fallback white/flat textures, fills the native draw uniform buffer with the real model matrix and camera position, shades generated PBR WGSL in world space for reflection/view vectors, and keeps diagnostic counters tied to real material texture bindings. The same browser run now creates separate GLTF render resources for a production WebGL2 reference path, which avoids cross-device buffer ownership and gives a real backend delta instead of only a nonblack WebGPU screenshot. The report records `availability.status: available`, `status: ready`, `readbackMode: native-webgpu-texture-to-buffer`, `nativePbrSubmissions: 1`, `nativeTextureBindings: 4`, `nativeEnvironmentBindings: 2`, `lastError: null`, native WebGPU `nonBlackPixels: 96879`, `uniqueColorBuckets: 101`, `averageLuma: 25.339912`, `maxLuma: 255`, WebGL2 reference `nonBlackPixels: 93514`, `uniqueColorBuckets: 620`, `averageLuma: 12.595619`, `maxLuma: 255`, and WebGPU-vs-WebGL2 `diff.meanDelta: 14.4038`, `changedPixels: 93343`, `structuralSimilarityProxy: 0.9435`. The artifacts are:

```text
tests/reports/v7/webgpu-imported-asset/webgpu-imported-damaged-helmet.png
tests/reports/v7/webgpu-imported-asset/webgl2-reference-damaged-helmet.png
tests/reports/v7/webgpu-imported-asset/webgpu-vs-webgl2-diff.png
```

The WebGPU product-viewer artifact uses the public V6 SDK scene-composition path (`loadGltfScene`, `loadHdrEnvironment`, `createGroundedStage`, `createCameraFrame`, and `createStudioLighting`) to render `chronograph-watch.glb` with the 4K HDR studio environment through native WebGPU, then renders an independent WebGL2 reference with separate resources. `packages/rendering/src/WebGPUDevice.ts` now applies a WebGPU clip-depth conversion for generated native WGSL shaders, native alpha blending/transmission uniforms for generated PBR shaders, real model matrices for non-instanced native PBR draws, camera-position-driven view/reflection vectors in generated PBR WGSL, and renderer-contract row normalization for native texture-to-buffer readback. The current artifact records `status: ready`, `readbackMode: native-webgpu-texture-to-buffer`, WebGPU `drawCalls: 28`, `nativePbrSubmissions: 21`, `nativeTextureBindings: 32`, `nativeEnvironmentBindings: 42`, `nonBlackPixels: 386227`, `uniqueColorBuckets: 189`, `averageLuma: 59.571902`, WebGL2 reference `averageLuma: 68.640065`, and WebGPU-vs-WebGL2 `meanDelta: 19.7892`, `changedPixels: 336435`, `structuralSimilarityProxy: 0.9224`.

The public WebGPU SDK production artifact now uses `G3DRenderer.create({ backend: "auto" })` and `renderAsync()` directly, without importing the low-level `Renderer`, without manually passing a WebGPU runtime object, and without importing Three.js. `tests/reports/v7/webgpu-sdk-production/webgpu-sdk-production-report.json` records `status: ready`, `productionClaim: public-sdk-webgpu-production-path`, `sdkPath.g3dRendererBackend: webgpu`, `sdkPath.backendSelection.requestedBackend: auto`, `sdkPath.backendSelection.selectedBackend: webgpu`, `sdkPath.backendSelection.reason: backend='auto' selected WebGPU because navigator.gpu is available in the current browser runtime.`, `sdkPath.renderAsync: true`, `lowLevelRendererImportedDirectly: false`, `threeJsRuntime: false`, `summary.pass: true`, `summary.missing: []`, `proof.backend: webgpu`, `drawCalls: 20`, `nativePbrSubmissions: 20`, `nativeTextureBindings: 32`, `nativeEnvironmentBindings: 40`, `nonBlackPixels: 229107`, `uniqueColorBuckets: 178`, and `maxLuma: 255`. This closes the specific "WebGPU is only coverage/gap reporting" blocker for the bounded imported GLTF/HDR/PBR SDK path. It does not close broad WebGPU parity for the whole renderer ecosystem, postprocess matrix, or all examples.

The new WebGPU-vs-Three.js delta artifact uses the same `chronograph-watch.glb`, the same 4K studio HDR environment, G3D native WebGPU texture-to-buffer readback, and a Three.js PMREM reference. The report records `status: ready`, `productionClaim: not-claimed`, WebGPU `nativePbrSubmissions: 21`, `nativeTextureBindings: 32`, `nativeEnvironmentBindings: 42`, WebGPU `averageLuma: 59.571902`, Three.js `averageLuma: 39.157487`, Three.js `drawCalls: 37`, `triangles: 199942`, `textures: 12`, `pmremGenerator: true`, and WebGPU-vs-Three.js `meanDelta: 35.1157`, `changedPixels: 370452`, `structuralSimilarityProxy: 0.8623`. Artifacts:

```text
tests/reports/v7/webgpu-threejs-delta/webgpu-chronograph.png
tests/reports/v7/webgpu-threejs-delta/threejs-chronograph.png
tests/reports/v7/webgpu-threejs-delta/webgpu-vs-threejs-diff.png
```

This closes the specific black/white-clay native WebGPU imported-texture failure, the missing product-viewer WebGPU evidence, the missing WebGPU-vs-Three.js visual-delta artifact, and the missing public SDK WebGPU production path for imported GLTF/HDR/PBR rendering. It still does not prove broad WebGPU parity across every renderer feature, material extension, postprocess pass, browser/hardware matrix, or ecosystem workflow.

SDK replacement readiness evidence:

- `packages/engine/src/v6/index.ts`
- `packages/controls/src/NativeControlTypes.ts`
- `packages/controls/src/OrbitControls.ts`
- `packages/controls/src/FirstPersonControls.ts`
- `packages/controls/src/MapControls.ts`
- `packages/controls/src/TrackballControls.ts`
- `packages/controls/src/PointerLockControls.ts`
- `packages/controls/src/ControlState.ts`
- `packages/controls/src/DragControls.ts`
- `packages/controls/src/Picking.ts`
- `packages/controls/src/SelectionManager.ts`
- `packages/controls/src/TransformControls.ts`
- `packages/controls/package.json`
- `tests/unit/engine/v7-v6-public-sdk.test.ts`
- `tests/reports/v7/sdk-replacement-readiness.json`
- `tests/unit/engine/v7-v6-runtime-boundary.test.ts`
- `tests/reports/v7/v6-runtime-boundary.json`

The SDK readiness report now includes `native-controls-no-three-compat-runtime: true`, `public-sdk-native-navigation-controls: true`, and `public-sdk-scene-composition-helpers: true`. `@galileo3d/controls` no longer depends on `@galileo3d/three-compat`; the product controls path uses native structural control types instead of `Vector3Compat`, `Object3DCompat`, or `RaycasterCompat`. `@galileo3d/engine/v6` now exposes native `createOrbitControls`, `createFirstPersonControls`, `createMapControls`, `createTrackballControls`, and `createPointerLockControls`, and `tests/unit/engine/v7-v6-public-sdk.test.ts` verifies stable snapshots for each. The same SDK entrypoint now also exposes `createDirectionalLight`, `createStudioLighting`, `createGroundedStage`, `createCameraFrame`, and `createProductionRenderOptions`, and the flagship product viewer uses the public grounded-stage and camera-frame helpers instead of private-only stage/camera assembly.

The V6 runtime-boundary report records `schema: g3d-v7-v6-runtime-boundary/v1`, `claim: bounded-no-three-runtime-delegation`, `scannedFileCount: 311`, and zero violations across `packages/engine/src/v6`, `packages/rendering/src`, `packages/assets/src`, `packages/controls/src`, `apps/v6-product-configurator`, `templates/v6-product-viewer`, and `examples/v6`. The banned patterns cover direct Three.js imports, CommonJS `require("three")`, `THREE.` namespace use, `@galileo3d/three-compat` imports, and relative `three-compat` imports. This is a concrete product-boundary gate: Three.js can remain in comparison, migration, and reference harnesses, but it cannot be used to render the V6 product runtime. The report still does not make G3D a broad Three.js replacement because examples, migration coverage, production WebGPU, and broad same-scene parity are not proven.

The current viewer now has a higher-resolution output path, stronger flagship assets, a 4K HDR source, an asset-picker workflow, GGX cubemap PMREM resource generation with WebGL2 `samplerCube` binding across PBR shader variants, a PMREM-specific same-scene Three.js delta artifact with a bounded cubemap/skybox claim, a renderer-owned directional multi-lobe contact pass backed by depth-aware SSAO, product-level renderer-owned shadow-map bindings, a contact/shadow same-scene delta artifact that does not claim full shadow parity, a separate G3D-only PBR directional shadow-map artifact, stronger material-extension visual artifacts, a material-extension same-scene delta artifact, a public async WebGPU SDK production path for imported GLTF/HDR/PBR rendering, and a bounded SDK replacement-readiness report with native controls no longer tied to Three compatibility runtime plus public V6 native camera/navigation controls and public V6 scene-composition helpers. The remaining items above still require renderer implementation, stricter parity thresholds, and browser artifacts before they can be claimed.

## Verification Commands

```sh
pnpm typecheck
pnpm exec vitest run tests/unit/rendering/v6-pbr-hdr-pipeline.test.ts
pnpm exec vitest run tests/unit/rendering/v7-contact-shadow-pass.test.ts tests/unit/rendering/v6-pbr-hdr-pipeline.test.ts
pnpm exec vitest run tests/unit/rendering/v7-screen-space-contact-shadow.test.ts tests/unit/rendering/renderer.test.ts --reporter=verbose
pnpm exec vitest run --config tests/assets/vitest.config.ts tests/assets/gltf-animation-runtime.test.ts --reporter=verbose
pnpm exec vitest run tests/unit/rendering/stereo-camera-rig.test.ts --reporter=verbose
pnpm exec vitest run tests/unit/engine/v7-v6-runtime-boundary.test.ts tests/unit/engine/v7-v6-public-sdk.test.ts
pnpm exec playwright test tests/browser/v7-product-viewer.spec.ts -g "high-resolution|camera" --reporter=line
pnpm exec playwright test tests/browser/v7-product-viewer.spec.ts -g "high-resolution flagship" --reporter=line
pnpm exec playwright test tests/browser/v7-pmrem-parity.spec.ts --reporter=line
pnpm exec playwright test tests/browser/v7-material-extensions.spec.ts --reporter=line
pnpm exec playwright test tests/browser/v7-material-extension-parity.spec.ts --reporter=line
pnpm exec playwright test tests/browser/v7-contact-shadow-parity.spec.ts --reporter=line
pnpm exec playwright test tests/browser/v7-pbr-shadow-map.spec.ts --reporter=line
pnpm exec playwright test tests/browser/v7-webgpu-imported-asset.spec.ts --reporter=line
pnpm exec playwright test tests/browser/v7-webgpu-product-viewer.spec.ts --reporter=line
pnpm exec playwright test tests/browser/v7-webgpu-sdk-production.spec.ts tests/browser/v6-webgpu-real-renderer.spec.ts --reporter=line
pnpm build
```
