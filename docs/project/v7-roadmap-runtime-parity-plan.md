# G3D V7: Build the Renderer Product, Not Another Screenshot

> Historical note: This V7 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


## Read This First

This is the seventh engine readiness prompt.

The prior prompts were written with the expectation that each reset would move G3D closer to a real product:

- `docs/project/v4-engine-readiness-plan.md`
- `docs/project/v2-roadmap-product-asset-pipeline-plan.md`
- `docs/project/v3-roadmap-product-workflow-plan.md`
- `docs/project/v4-roadmap-visual-engine-plan.md`
- `docs/project/three-compat-roadmap-visual-engine-plan.md`
- `docs/project/production-runtime-roadmap-production-renderer-plan.md`

That did not happen with enough clarity or discipline.

The repo accumulated examples, screenshots, reports, tests, galleries, visual gates, and partial renderer plumbing, but the result still did not consistently become the product we are actually trying to build. Too much work stopped at proof artifacts. Too many completion claims were based on tests, metrics, or screenshots that did not demonstrate a mature renderer library. The output improved in places, but it still did not meet the bar of a developer-facing Three.js alternative.

V7 must correct that pattern.

This prompt must not be interpreted as:

- "make a better screenshot"
- "make another gallery"
- "add more tests around the same weak output"
- "create another demo slice"
- "write another claim document"
- "generate another report that says PBR/HDR"
- "make one asset look somewhat better"

This prompt means:

> Build the actual renderer product, SDK surface, flagship viewer, asset pipeline, HDR/PBR/IBL workflow, controls, docs, examples, and same-scene Three.js comparison that prove G3D can be used by developers as a serious renderer library.

V7 must be dignified and direct: acknowledge what is not good enough, stop overclaiming, and build the missing product pieces by filename.

## Three.js Boundary

G3D is being built as a competitor to Three.js, not as a wrapper around Three.js.

This must be understood in the simplest possible terms:

```text
G3D = our renderer, our SDK, our asset pipeline, our runtime.
Three.js = competitor/reference baseline only.
```

Say it in the dumbest possible way so the work cannot drift again:

- We are not building a Three.js app.
- We are not wrapping Three.js.
- We are not importing Three.js inside the G3D product runtime.
- We are not using Three.js loaders, controls, materials, postprocess, skyboxes, PMREM, shadows, or renderer internals to make G3D look finished.
- We are creating a competing renderer and developer SDK named G3D.
- Three.js can stand next to G3D in a lab scene so we can compare output.
- Three.js cannot stand inside G3D as the thing doing the work.
- If a developer imports `@galileo3d/engine/production-runtime`, the rendered product path must be G3D code.
- If the only reason a screenshot looks good is because Three.js rendered it, that screenshot is not G3D proof.

Three.js may be used only for:

- same-scene comparison screenshots
- benchmark/reference output
- migration documentation
- API compatibility analysis
- proving whether G3D is good enough against an established renderer

Three.js must not be used for:

- G3D rendering
- G3D material evaluation
- G3D GLTF loading in product code
- G3D skybox/IBL/PBR implementation
- G3D app runtime
- G3D controls runtime
- G3D postprocess implementation
- hiding missing renderer features
- making G3D appear better than it is

Any G3D product path that renders through Three.js fails V7.

Any flagship viewer path that depends on Three.js for its actual G3D render fails V7.

Any SDK API that secretly delegates renderer behavior to Three.js fails V7.

Three.js comparison is allowed only as an external competitor baseline. It is not part of the G3D product implementation.

## Why V7 Exists

V6 improved the evidence path, but it still exposed the real product gap:

- A better helmet screenshot is not a product.
- A screenshot with visible HDR lighting is not a Three.js competitor.
- Pixel metrics are not a developer workflow.
- The GLB route is one evidence point within the V10 renderer SDK gate.
- Debug-gallery cleanup is not enough.

V7 exists because G3D needs a clear product objective that cannot collapse back into one-off visual proof.

The objective is:

**G3D Renderer: a production WebGL2/WebGPU rendering library and developer SDK for real-time 3D apps, with GLTF-first asset loading, HDR/PBR material fidelity, environment lighting, postprocessing, controls, scene composition, developer APIs, examples, and migration affordances from Three.js.**

The product is not "a screenshot of a helmet."

The product is:

> A developer can install G3D, load real GLTF/GLB assets and HDR environments, render them with high-quality PBR/IBL/PMREM/tone mapping/shadows/materials/postprocess, interact with the scene through controls, and ship a real viewer/app using a clean public API instead of raw Three.js.

The screenshot is only one artifact of that product.

## The Objective In One Sentence

V7 must turn G3D into a usable, documented, public WebGL2/WebGPU GLTF/HDR/PBR renderer SDK with a flagship interactive product viewer that uses the public API and proves, through same-scene Three.js comparison, where G3D is ready and where gaps remain.

Everything else is secondary.

## The Product We Are Actually Creating

Create a product with three connected parts:

1. **Renderer SDK**
   - A public package surface developers can import.
   - A coherent renderer API.
   - Real WebGL2 production behavior.
   - WebGPU coverage with explicit gaps.
   - Real diagnostics that help developers ship apps.

2. **GLTF/HDR/PBR Workflow**
   - Real GLB/GLTF loading.
   - Real texture and sampler handling.
   - Real material extension handling where supported.
   - Real HDR environment loading.
   - Real IBL/PMREM-style lighting.
   - Real skybox/background rendering.
   - Real tone mapping, shadows, and postprocess controls.

3. **Flagship Developer App**
   - A real interactive product viewer.
   - Built using the public SDK API.
   - Uses real assets and environments.
   - Has controls, presets, material/environment panels, and screenshot export.
   - Has a same-scene Three.js comparison that documents the truth.

If the work does not improve one of these three product parts, it is not V7 progress.

## Non-Negotiable Objective

Build a production-grade G3D renderer package and flagship GLTF viewer that developers can use as a serious alternative to Three.js for the documented scope.

V7 is not complete until the repo contains:

1. A coherent renderer SDK API.
2. A real GLTF/HDR/PBR render pipeline.
3. A flagship product viewer using that public API.
4. A material/asset workflow that is useful to developers.
5. A same-scene Three.js comparison using the same asset, camera, HDRI, tone mapping target, and documented deltas.
6. Docs/examples/templates that teach developers how to use the product.

Do not spend this reset creating another gallery of weak screenshots.

## Product Definition

Create:

**G3D Renderer**

A production WebGL2/WebGPU rendering library for real-time 3D apps, with:

- GLTF-first asset loading.
- Robust GLB/GLTF rendering.
- HDR environment loading.
- PMREM-style IBL prefiltering.
- Physically based materials.
- Tone mapping and color management.
- Direct lighting and shadows.
- Skybox/background controls.
- Postprocess stack.
- Orbit/camera controls.
- Scene composition helpers.
- Developer-facing renderer API.
- Examples/templates.
- Three.js migration and comparison tooling.

The developer-facing experience should feel like:

```ts
import {
  G3DRenderer,
  loadGltfScene,
  loadHdrEnvironment,
  createOrbitControls,
  createProductViewer
} from "@galileo3d/engine/production-runtime";

const viewer = await createProductViewer({
  canvas,
  asset: await loadGltfScene("/assets/DamagedHelmet.glb"),
  environment: await loadHdrEnvironment("/hdr/studio_small_08_1k.hdr"),
  camera: {
    preset: "product-hero",
    orbit: true
  },
  lighting: {
    ibl: true,
    shadows: true
  },
  postprocess: {
    toneMapping: "aces",
    bloom: true,
    fxaa: true
  }
});

viewer.render();
```

If this kind of API cannot be used by the flagship app, the product is not real yet.

## Current Screenshot Rejection

The current product configurator screenshot is not good enough and must not be treated as the V7 bar.

The rejected screenshot still shows:

- a viewport that reads as a low-detail demo composition instead of a premium renderer product
- a gray-box studio that overpowers the asset instead of a calibrated HDR showroom
- material response that is improved but still not undeniably high-end PBR
- weak grounding/contact integration
- insufficient visible PMREM/IBL reflection quality
- a UI that proves controls exist but not that the renderer has reached a mature visual standard

Do not answer this objection by increasing PNG resolution only. A larger low-quality render is still a low-quality render.

Be extremely literal about this: if the visible result still looks flat, gray-boxed, low-detail, or Lambert-like, then the work failed even if the canvas is 3200px, 3840px, or larger. "High resolution" means both pixel resolution and rendered fidelity:

- the asset must fill the frame with readable texture detail
- the HDR environment must create visible, plausible specular reflections
- the background/stage must look like a calibrated product showroom, not a debug wall
- the material response must visibly separate metal, glass/transmission, rough plastic, clearcoat, emissive, and normal detail
- contact and grounding must make the asset feel integrated into the scene
- screenshot metrics cannot override human visual rejection

The current browser screenshot with a large gray wall, a small asset, and weak PBR response is rejected. Do not call that a flagship renderer output.

The next work must improve renderer fidelity and product workflow:

- cubemap PMREM sampling across every PBR shader path, not only one material route
- high-quality HDR environment/background rendering with exposure, rotation, and blur controls
- visible metal/roughness/normal/AO/emissive/clearcoat/sheen/specular/transmission behavior on real imported assets
- real grounded contact behavior, shadows, and depth-aware occlusion
- curated product-stage composition with real camera/framing presets
- same-scene Three.js reference output used only as competitor baseline, not as G3D runtime
- developer API and docs that prove the app is built as an SDK product

If the output still looks like a low-resolution or Lambert-style demo after these changes, V7 is not done.

## High-Resolution Means Render Fidelity, Not Just More Pixels

The phrase "high resolution" must not be reduced to canvas size.

V7 must treat the current screenshot objection literally:

- the product in the hero view must be large enough to inspect material detail without zooming
- the foreground asset must be framed as the subject, not a small object sitting in a gray debug volume
- texture detail, normal maps, roughness variation, metallic response, emissive detail, and transparent/transmissive surfaces must be visibly readable
- HDR lighting must create obvious environment response on reflective materials
- the skybox/background must look like a deliberate HDR studio or showroom, not a flat wall
- shadows/contact/grounding must survive close inspection
- UI panels must not be allowed to hide the fact that the rendered output is weak
- screenshots must include both high export resolution and high scene fidelity

Minimum visual artifact expectations:

| Artifact | Minimum expectation |
|---|---|
| Interactive viewer | clean 2K/retina interactive rendering without visibly soft or blocky asset detail |
| Flagship export | 5K-class or better screenshot with the asset filling the frame and real material detail visible |
| Close-up material proof | tight crop/export that shows normal, roughness, metallic, emissive, and transparent/transmissive behavior |
| HDR/IBL proof | same asset under at least two HDR environments with visible reflection and exposure differences |
| Comparison proof | G3D and Three.js side by side using the same GLB, HDRI, camera, exposure, tone mapping intent, and documented deltas |

The acceptance decision is visual first and metric second.

Metrics can support the decision, but they cannot override it. If the output still looks soft, flat, gray, low-poly, Lambert-like, or visually below a serious Three.js viewer, then the artifact fails even if tests pass.

## Current State vs Required Product Bar

| Area | Current State | Required Product Bar |
|---|---|---|
| GLB loading | Loads real GLB in some harnesses | Robust GLTF/GLB loader with extensions, animation, skins, morphs, texture transforms, variants, and diagnostics |
| PBR | Some material response visible | Correct metal/roughness workflow, normal maps, AO, emissive, clearcoat, sheen, specular, transmission where supported |
| HDR/IBL | Visible HDR backdrop now exists | Proper PMREM-style environment prefiltering, calibrated exposure, visible reflections, background controls |
| Skybox | Visible, but rough | Correct equirect/cubemap background, exposure, rotation, blur, tone mapping |
| Shadows | Not product-grade | Contact shadows, directional shadows, soft PCF, product grounding |
| Postprocess | Some plumbing | ACES/filmic, bloom, FXAA/TAA where possible, color grading, sharpening |
| Scene quality | Better than debug scene | Real product showroom composition, curated camera, floor, lighting, controls |
| Developer workflow | Not proven by screenshots | Public API, docs, examples, templates, migration guide |
| Three.js competition | Not achieved | Same asset/environment side-by-side against Three.js with known deltas documented |
| Product identity | Still fuzzy | Renderer SDK + flagship viewer + material/asset workflow |

V7 must close these gaps with implementation, not prose.

## Three.js Example Parity Ladder

V7 must also target the official Three.js example categories that expose the current G3D weakness most clearly:

- `webgl_animation_keyframes`
- `webgl_animation_skinning_blending`
- `webgl_animation_skinning_additive_blending`
- `webgl_animation_skinning_ik`
- `webgl_animation_skinning_morph`
- `webgl_animation_multiple`
- `webgl_animation_walk`
- `webgl_decals`
- `webgl_effects_parallaxbarrier`
- `webgl_effects_stereo`

The goal is not to import Three.js to make these examples work. The goal is to build the G3D systems that can compete with those examples:

- native G3D keyframe playback
- native G3D animation mixer, crossfades, additive actions, masks, and clip controls
- native G3D skinned mesh deformation driven by imported GLTF animation
- native G3D morph target animation driven by imported GLTF weights
- native G3D IK solvers connected to imported skeletons and transform controls
- native G3D decal projection with raycast hit testing and clipped decal geometry
- native G3D stereo/parallax render effects through real multi-camera compositors
- native G3D physics examples with collision, constraints, contact reporting, and rendered state

The first implemented artifact for this ladder is:

- `apps/example-parity-lab/`
- `packages/assets/src/GLTFAnimationRuntime.ts`
- `packages/rendering/src/production-runtime/geometry/ProjectedDecalGeometry.ts`
- `tests/assets/gltf-animation-runtime.test.ts`
- `tests/unit/rendering/projected-decal-geometry.test.ts`
- `tests/browser/runtime-parity-threejs-example-parity-lab.spec.ts`
- `tests/reports/v7/threejs-example-parity-lab/example-parity-lab.png`
- `tests/reports/v7/threejs-example-parity-lab/example-parity-lab-report.json`

This app is intentionally G3D-only. It imports no Three.js runtime. It currently loads real GLB assets, renders Cesium Man, Damaged Helmet, and Animated Morph Cube through the G3D GLTF/PBR/HDR pipeline, applies imported GLTF TRS and morph-weight animation tracks through `GLTFAnimationRuntime`, refreshes renderable skinning palettes from animated joint transforms for the skinned GLB path, generates clipped decal geometry from imported helmet mesh triangles through `ProjectedDecalGeometry`, steps the G3D animation mixer with crossfade/additive/root-motion evidence, runs the G3D IK solver, renders stereo/physics evidence, and captures a real 1920x1080 WebGL2 canvas artifact.

Do not overclaim this artifact. It is the first implemented foundation, not final parity.

The current missing work for this ladder is still substantial:

- broaden imported GLTF skinning playback from this first sampled-pose proof into continuous interactive playback with side-by-side Three.js visual deltas
- expand imported morph-weight animation beyond the first lab asset into production character/facial morph assets
- expand clipped mesh decals into interactive raycast placement with an oriented projector basis and same-scene Three.js `DecalGeometry` delta
- replace stereo evidence panels with a real two-camera stereo/parallax compositor
- replace small physics evidence stacks with richer interactive physics examples and external-engine benchmark comparison
- add dedicated apps or views for animation blending, additive blending, IK, morphs, decals, stereo/parallax, and physics rather than hiding everything in one lab

V7 cannot be called a Three.js example competitor until these categories produce visually impressive, interactive G3D examples that can stand next to the official Three.js examples without relying on Three.js runtime code.

## What Not To Do

Do not declare completion because:

- A screenshot is nonblank.
- A PNG is large.
- Pixel entropy is high.
- `uniqueColorBuckets` increased.
- A GLB loaded once.
- A debug app says `status: ready`.
- A report says `PBR/HDR`.
- A hidden test asset was loaded but not visibly rendered.
- The output is better than the previous bad screenshot.

Those are supporting facts only. They are not the product.

Do not build:

- Another one-off screenshot harness.
- Another fake gallery.
- Another diagnostic page that developers cannot use.
- Another markdown-only claim registry.
- Another primitive-only scene.
- Another hardcoded visual proof path.

Build the renderer product.

## Required Architecture

The implementation must converge on these product layers:

1. **Renderer Core**
   - Owns WebGL2/WebGPU backends.
   - Owns render passes, frame graph, GPU resources, shader compilation, render targets, and frame diagnostics.

2. **Asset Pipeline**
   - Loads GLTF/GLB.
   - Creates renderable scenes from asset data.
   - Handles textures, samplers, material extensions, animation, skinning, morph targets, and diagnostics.

3. **Environment Pipeline**
   - Loads HDR.
   - Produces PMREM-style IBL resources.
   - Provides skybox/background rendering.
   - Provides exposure, rotation, blur, and tone mapping controls.

4. **Material System**
   - Supports glTF metallic-roughness PBR.
   - Supports texture transforms and multiple texcoord sets.
   - Supports normal, AO, emissive, clearcoat, sheen, specular, and transmission where supported.
   - Clearly reports unsupported material features.

5. **Viewer/Workflow Layer**
   - Provides a flagship product viewer app.
   - Provides orbit controls, camera presets, scene presets, material inspection, exposure/environment controls, and screenshot export.
   - Uses the public SDK API, not private harness-only code.

6. **Developer Product Surface**
   - Public package exports.
   - Docs.
   - Examples.
   - Templates.
   - Migration notes from Three.js.

## Required File Work

Work by filename. Do not hide the product in browser tests only.

### Renderer Core

Implement or harden:

- `packages/rendering/src/production-runtime/RendererV6.ts`
- `packages/rendering/src/production-runtime/ProductionWebGL2Renderer.ts`
- `packages/rendering/src/production-runtime/WebGPUProductionRenderer.ts`
- `packages/rendering/src/production-runtime/backends/RendererBackend.ts`
- `packages/rendering/src/production-runtime/backends/WebGL2RendererBackend.ts`
- `packages/rendering/src/production-runtime/backends/WebGPURendererBackend.ts`
- `packages/rendering/src/production-runtime/framegraph/FrameGraph.ts`
- `packages/rendering/src/production-runtime/framegraph/RenderPass.ts`
- `packages/rendering/src/production-runtime/resources/GPUBuffer.ts`
- `packages/rendering/src/production-runtime/resources/GPUTexture.ts`
- `packages/rendering/src/production-runtime/resources/RenderTarget.ts`
- `packages/rendering/src/production-runtime/resources/ResourceCache.ts`
- `packages/rendering/src/production-runtime/diagnostics/FrameCapture.ts`
- `packages/rendering/src/production-runtime/diagnostics/RendererStats.ts`
- `packages/rendering/src/production-runtime/diagnostics/GPUCapabilities.ts`
- `packages/rendering/src/index.ts`

Required outcome:

- A real public `G3DRenderer`/`RendererV6` API exists.
- The flagship viewer uses this API.
- Browser tests are not the only consumers.
- WebGL2 is production-grade for the documented scope.
- WebGPU has explicit coverage and explicit gaps.

### GLTF Asset Pipeline

Implement or harden:

- `packages/assets/src/GLTFLoader.ts`
- `packages/assets/src/GLTFRenderResources.ts`
- `packages/assets/src/loadRenderableAsset.ts`
- `packages/assets/src/createRenderableScene.ts`
- `packages/assets/src/asset-corpus/GLTFSceneLoader.ts`
- `packages/assets/src/asset-corpus/TextureLoaderV6.ts`
- `packages/assets/src/asset-corpus/KTX2TextureLoaderV6.ts`
- `packages/assets/src/asset-corpus/HDRTextureLoaderV6.ts`
- `packages/assets/src/asset-corpus/AssetPipelineV6.ts`
- `packages/assets/src/asset-corpus/index.ts`
- `packages/assets/src/index.ts`

Required outcome:

- `loadGltfScene()` returns a renderable scene object that can be passed directly to the renderer/viewer.
- GLB/GLTF metadata includes meshes, primitives, materials, textures, images, animations, skins, morph targets, extensions, warnings, and unsupported features.
- Texture transform, sampler wrap/filtering, normal maps, metallic-roughness, AO, emissive, and material extension texture paths are preserved.
- Loader failures are actionable, not silent fallbacks.

### PBR/HDR/IBL Pipeline

Implement or harden:

- `packages/rendering/src/EnvironmentMapResources.ts`
- `packages/rendering/src/production-runtime/PBRHDRPipeline.ts`
- `packages/rendering/src/production-runtime/environment/HDRLoader.ts`
- `packages/rendering/src/production-runtime/environment/EnvironmentMap.ts`
- `packages/rendering/src/production-runtime/environment/PMREMGenerator.ts`
- `packages/rendering/src/production-runtime/passes/SkyboxPass.ts`
- `packages/rendering/src/production-runtime/passes/ToneMappingPass.ts`
- `packages/rendering/src/BRDFLut.ts`
- `packages/rendering/src/ShaderLibrary.ts`
- `packages/rendering/src/ShaderChunks.ts`
- `packages/rendering/src/shaders/pbr-direct.frag.glsl`
- `packages/rendering/src/TexturedPBRMaterial.ts`
- `packages/rendering/src/PBRMaterial.ts`

Required outcome:

- HDR environment loading is not just a report; it visibly affects scene lighting and reflections.
- Skybox/background rendering is part of the renderer product, not a test-only hack.
- Environment controls exist: rotation, exposure, background visibility, background blur, IBL intensity, specular intensity.
- PMREM/prefiltering is documented honestly. If not true cube PMREM parity yet, the known gap must be stated.
- PBR material behavior is visually inspectable and configurable.

### Lighting, Shadows, and Postprocess

Implement or harden:

- `packages/rendering/src/production-runtime/passes/DepthPrepass.ts`
- `packages/rendering/src/production-runtime/passes/ShadowPass.ts`
- `packages/rendering/src/production-runtime/passes/OpaquePass.ts`
- `packages/rendering/src/production-runtime/passes/TransparentPass.ts`
- `packages/rendering/src/ShadowMap.ts`
- `packages/rendering/src/ShadowPass.ts`
- `packages/rendering/src/CascadedShadowMaps.ts`
- `packages/rendering/src/production-runtime/postprocess/EffectComposerV6.ts`
- `packages/rendering/src/production-runtime/postprocess/BloomPass.ts`
- `packages/rendering/src/production-runtime/postprocess/SSAOPass.ts`
- `packages/rendering/src/production-runtime/postprocess/DOFPass.ts`
- `packages/rendering/src/production-runtime/postprocess/FXAAPass.ts`
- `packages/rendering/src/production-runtime/postprocess/ColorGradingPass.ts`
- `packages/rendering/src/PostProcessPass.ts`
- `packages/rendering/src/ToneMapping.ts`
- `packages/rendering/src/ColorManagement.ts`

Required outcome:

- The flagship viewer has grounded assets with visible contact/shadow behavior.
- Directional shadows and soft filtering are usable.
- Tone mapping and color management are configurable.
- Bloom/FXAA/color grade are accessible through the public viewer API.
- Postprocess is not just a hidden render-target test.

### Controls and Interaction

Implement or harden:

- `packages/controls/`
- `packages/input/src/controls/OrbitControls.ts`
- `packages/input/src/controls/SceneCameraAdapter.ts`
- `packages/input/src/index.ts`
- `packages/scene/src/PerspectiveCamera.ts`
- `packages/scene/src/Camera.ts`
- `packages/rendering/src/CameraFraming.ts`

Required outcome:

- Orbit/pan/zoom controls exist and work in the flagship viewer.
- Camera presets exist for product hero, asset inspection, material inspection, and comparison.
- Controls are part of the SDK surface, not browser-test-only code.

### Public SDK and Engine Exports

Implement or harden:

- `packages/engine/src/production-runtime/index.ts`
- `packages/engine/src/index.ts`
- `packages/rendering/src/production-runtime/index.ts`
- `packages/assets/src/asset-corpus/index.ts`
- `packages/create-g3d/`
- `package.json`
- `tsconfig.base.json`

Required public imports:

```ts
import { G3DRenderer } from "@galileo3d/engine/production-runtime";
import { loadGltfScene, loadHdrEnvironment } from "@galileo3d/engine/production-runtime";
import { createOrbitControls } from "@galileo3d/engine/production-runtime";
import { createProductViewer } from "@galileo3d/engine/production-runtime";
```

Required outcome:

- External package consumers can import the V6 SDK.
- The flagship app uses the same public API a developer would use.
- No private-only test harness can be counted as product proof.

### Flagship Viewer App

Build the actual product surface:

- `apps/product-configurator/`
- `apps/asset-inspector/`
- `apps/material-studio/`
- `apps/common/`
- `examples/production-runtime-examples/product-viewer/`
- `examples/production-runtime-examples/asset-inspector/`
- `examples/production-runtime-examples/material-studio/`
- `templates/production-product-viewer/`

Required flagship viewer:

`apps/product-configurator/` must become the primary proof app.

It must include:

- Real GLB loading.
- Real HDR environment selection.
- Visible skybox/background controls.
- Orbit/pan/zoom.
- Camera presets.
- Exposure control.
- IBL intensity control.
- Background blur/visibility control.
- Material inspection panel.
- Texture/material diagnostics.
- Shadows toggle.
- Postprocess toggles.
- Screenshot export.
- Same-scene Three.js comparison link/report.

The viewer must not be a static screenshot page.

### Three.js Comparison

Implement or harden:

- `tests/browser/v7-threejs-parity.ts`
- `tests/browser/v7-threejs-parity.spec.ts`
- `tools/v7-threejs-parity/`
- `tools/v7-threejs-parity-readiness/`
- `benchmarks/threejs/src/scenes/product-configurator.ts`
- `benchmarks/galileo/src/scenes/product-configurator.ts`
- `docs/project/production-runtime-roadmap-threejs-parity.md`

Required outcome:

- Same GLB.
- Same HDRI.
- Same camera.
- Same tone mapping target.
- Same approximate exposure.
- Same screenshot resolution.
- G3D and Three.js outputs are shown side by side.
- Differences are documented honestly.
- Unsupported features are named.

Do not claim parity if the screenshot does not show it.

### Docs and Examples

Implement or harden:

- `docs/project/production-runtime-roadmap-renderer-production-runtime.md`
- `docs/project/production-runtime-roadmap-gltf-loading.md`
- `docs/project/production-runtime-roadmap-pbr-hdr-ibl.md`
- `docs/project/production-runtime-roadmap-product-viewer.md`
- `docs/project/production-runtime-roadmap-threejs-migration.md`
- `docs/project/production-runtime-roadmap-known-gaps.md`
- `docs/project/tutorials-product-configurator.md`
- `docs/project/tutorials-asset-viewer.md`
- `docs/project/tutorials-material-studio.md`
- `README.md`

Required outcome:

- A developer can read the docs and build the flagship viewer workflow.
- Docs include code snippets that compile against the public API.
- Known gaps are direct and specific.
- No marketing claim outruns actual renderer evidence.

## Flagship Acceptance Artifact

V7 must produce one primary acceptance artifact:

**A flagship G3D product viewer that renders the same real asset and environment in G3D and Three.js.**

Required artifact paths:

- `tests/reports/v7/product-viewer/g3d-product-viewer.png`
- `tests/reports/v7/product-viewer/threejs-product-viewer.png`
- `tests/reports/v7/product-viewer/comparison.png`
- `tests/reports/v7/product-viewer/product-viewer-report.json`
- `docs/project/production-runtime-roadmap-product-viewer.md`

The artifact must show:

- Imported real GLB.
- Same HDRI in both engines.
- Same camera/framing.
- Same tone mapping target or documented difference.
- Visible material/reflection response.
- Visible grounded shadow/contact behavior.
- Real controls in the app.
- Developer API used by the app.

This is still not the whole product, but it is the correct flagship acceptance surface.

## Implementation Checklist

Use this checklist as the work order.

### Phase 1: Product API

- [ ] Create public `G3DRenderer` / `RendererV6` API.
- [ ] Create public `loadGltfScene()` API.
- [ ] Create public `loadHdrEnvironment()` API.
- [ ] Create public `createOrbitControls()` API.
- [ ] Create public `createProductViewer()` API.
- [ ] Export all of the above from `@galileo3d/engine/production-runtime`.
- [ ] Make the flagship viewer use only the public API.

### Phase 2: GLTF Render Fidelity

- [ ] Verify GLB mesh/material/texture data flows through `GLTFLoader.ts`.
- [ ] Verify `GLTFRenderResources.ts` creates real render items for imported meshes.
- [ ] Preserve sampler wrap/filtering.
- [ ] Preserve texture transforms.
- [ ] Preserve normal maps.
- [ ] Preserve metallic-roughness maps.
- [ ] Preserve AO/emissive maps.
- [ ] Preserve clearcoat/sheen/specular extension data where supported.
- [ ] Report unsupported extension data clearly.

### Phase 3: HDR/IBL/Skybox

- [ ] Load real Radiance HDR files through public API.
- [ ] Generate diffuse irradiance resources.
- [ ] Generate specular prefilter resources.
- [ ] Generate/use BRDF LUT.
- [ ] Render visible skybox/background through renderer pass or product-level renderer API.
- [ ] Add environment rotation control.
- [ ] Add exposure control.
- [ ] Add IBL diffuse/specular intensity controls.
- [ ] Add background visibility and blur controls.

### Phase 4: Materials

- [ ] Make metal/roughness response visibly correct enough to compare.
- [ ] Make normal map detail visible.
- [ ] Keep AO on indirect lighting, not direct light.
- [ ] Show emissive behavior.
- [ ] Show clearcoat behavior.
- [ ] Show sheen behavior.
- [ ] Show specular extension behavior.
- [ ] Add material inspection UI in the flagship viewer.

Evidence:

- `tests/reports/production-runtime-hd-materials/pbr-materials-hd.png`
- `tests/reports/production-runtime-hd-materials.json`
- `tests/browser/production-runtime-hd-materials.spec.ts`
- `docs/project/production-runtime-roadmap-pbr-materials.md`

This prior evidence is not enough to close V7. Treat it as a baseline to surpass with stronger renderer output, dedicated material-extension scenes, and honest same-scene comparison.

### Phase 5: Lighting/Shadows/Postprocess

- [ ] Add grounded product stage.
- [ ] Add direct key/fill/rim lighting controls or presets.
- [ ] Add directional shadows.
- [ ] Add soft shadow filtering.
- [ ] Add contact-shadow-like grounding if available.
- [ ] Add ACES/filmic tone mapping option.
- [ ] Add FXAA option.
- [ ] Add bloom option.
- [ ] Add color grading/sharpening option.

### Phase 6: Controls and Viewer Workflow

- [ ] Add orbit/pan/zoom.
- [ ] Add reset camera.
- [ ] Add camera presets.
- [ ] Add environment picker.
- [ ] Add exposure slider.
- [ ] Add IBL controls.
- [ ] Add material diagnostics panel.
- [ ] Add screenshot capture.
- [ ] Add same-scene comparison mode/link.

### Phase 7: Same-Scene Three.js Comparison

- [ ] Render G3D version.
- [ ] Render Three.js version.
- [ ] Use the same GLB.
- [ ] Use the same HDRI.
- [ ] Use the same camera.
- [ ] Use comparable tone mapping and exposure.
- [ ] Save both screenshots.
- [ ] Save side-by-side comparison.
- [ ] Document visual differences.
- [ ] Do not claim equality where the image does not support it.

### Phase 8: Docs/Templates

- [ ] Write product viewer tutorial.
- [ ] Write GLTF loading docs.
- [ ] Write HDR/IBL docs.
- [ ] Write material support docs.
- [ ] Write Three.js migration docs.
- [ ] Create `templates/production-product-viewer/`.
- [ ] Verify external consumer can import and run the public API.

## Acceptance Criteria

V7 can only be considered complete when all of the following are true:

- [ ] A developer-facing public SDK API exists and is used by the flagship app.
- [ ] A real GLB renders through G3D with real textures/materials.
- [ ] A real HDRI visibly lights the asset and renders as background/skybox.
- [ ] PBR material response is visible and inspectable.
- [ ] Shadows or contact grounding are visible.
- [ ] Tone mapping/postprocess controls exist.
- [ ] Orbit controls exist.
- [ ] The app is interactive, not a static screenshot harness.
- [ ] G3D and Three.js render the same scene side by side.
- [ ] Known gaps are documented.
- [ ] Docs/examples show how a developer uses the API.
- [ ] The final report does not use screenshot metrics as the primary claim.

## Completion Report Required

When the work is reported complete, the final response must include these sections:

1. **Product Created**
   - Name the product surface that now exists.
   - Explain how a developer uses it.
   - Include the public import paths.

2. **Files Implemented**
   - List every product file changed or created.
   - Separate renderer, assets, controls, app, docs, examples, and tests.

3. **Flagship Viewer**
   - Give the app path.
   - Give the local URL or command to run it.
   - Describe the real user workflow: load asset, orbit, change environment, adjust exposure, inspect material, capture screenshot.

4. **Renderer Evidence**
   - State the backend used.
   - State the GLB/HDRI used.
   - State the PBR material features visibly exercised.
   - State the shadow/postprocess features visibly exercised.

5. **Three.js Comparison**
   - Provide the G3D screenshot path.
   - Provide the Three.js screenshot path.
   - Provide the side-by-side comparison path.
   - State what is equal, what is worse, and what is still missing.

6. **Known Gaps**
   - List unsupported GLTF/material/rendering features.
   - Do not hide gaps behind metrics.
   - Do not claim broad Three.js replacement if the comparison does not support it.

7. **Verification**
   - Include the exact commands run.
   - Include whether they passed.
   - If repo-wide typecheck cannot pass because of unrelated existing worktree errors, say so and name the scoped verification that did pass.

If the final response cannot fill out these sections with concrete files and artifacts, V7 is not complete.

## Failure Conditions

V7 fails if any of the following happen:

- The main output is another standalone screenshot harness.
- The flagship viewer uses private test-only helpers instead of the public SDK API.
- The comparison does not render the same asset/environment in both G3D and Three.js.
- The report claims PBR/HDR quality but the screenshot looks flat, tiny, blank, gray-boxed, or debug-like.
- The app cannot be interacted with through real controls.
- The docs show APIs that do not compile or are not exported.
- The implementation hides unsupported material or renderer features.
- The final answer says "complete" without a usable app, public API, and comparison artifact.

## Final Rule

Do not stop at "we improved the screenshot."

The target is a renderer product:

> G3D Renderer must be a usable, documented, public WebGL2/WebGPU GLTF/HDR/PBR SDK with a flagship viewer that proves developers can build real-time 3D apps with it instead of Three.js for the documented workflows.

If the work does not improve that product surface, it is not V7 progress.
