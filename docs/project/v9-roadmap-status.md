# V9 Status

Status: code construction started.

The next work remains code construction, not more claim machinery.

## Current Evidence

- Inventory report: `tests/reports/v9/threejs-inventory.json`
- Code backlog: `docs/project/v9-roadmap-code-backlog.md`
- Inventory doc: `docs/project/v9-roadmap-threejs-inventory.md`
- Parity matrix: `docs/project/v9-roadmap-parity-matrix.md`
- Claim boundary: `docs/project/v9-roadmap-claim-boundary.md`
- Public imported glTF mixer controls: `packages/assets/src/GLTFAnimationRuntime.ts`
- Public animation motion-quality tracker: `packages/animation/src/MotionQuality.ts`
- Animation route suite now requires canvas frame-difference motion evidence for animation/skinning routes: `tests/browser/current-routes-animation-examples.spec.ts`
- Keyframes route now uses the public mixer path: `apps/animation-keyframes/src/scene.ts`
- Keyframes route publishes motion samples, time range, pose diversity, and healthy-motion diagnostics: `apps/animation-keyframes/src/main.ts`
- Skinning blend route now uses public mixer clip actions: `apps/skinning-blending/src/main.ts`
- Skinning blend route publishes motion samples, time range, pose diversity, and healthy-motion diagnostics: `apps/skinning-blending/src/main.ts`
- Hardware skinning now has a public bone hierarchy, inherited skeleton world-matrix update, inverse bind matrices, and matrix-palette generation: `packages/animation/src/Bone.ts`, `packages/animation/src/Skeleton.ts`, `packages/animation/src/Skinning.ts`
- glTF `JOINTS_0` and `WEIGHTS_0` import into G3D vertex `joints` and `weights` attributes and the render-resource path builds skinned vertex formats for imported assets: `packages/assets/src/GLTFLoader.ts`, `packages/assets/src/GLTFRenderResources.ts`
- glTF `JOINTS_1` / `WEIGHTS_1` are now reported as explicit unsupported skinning-extra-influence diagnostics instead of being silently counted as full skinning import: `packages/assets/src/GLTFLoader.ts`, `tests/assets/gltf-animation-corpus.test.ts`
- glTF skins without authored inverse-bind matrices now report the identity fallback through `skinning-default-inverse-bind-matrices`: `packages/assets/src/GLTFLoader.ts`, `tests/assets/gltf-animation-corpus.test.ts`
- ForwardPass now validates skinning geometry before GPU submission, including missing joint/weight attributes, four-influence layouts, finite integer joint indices, in-palette joint references, and normalized non-negative weights: `packages/rendering/src/ForwardPass.ts`, `tests/unit/rendering/renderer.test.ts`
- ForwardPass now has a per-frame skinning palette upload manager and tests proving distinct palettes bind for multiple skinned characters in one frame: `packages/rendering/src/ForwardPass.ts`, `tests/unit/rendering/renderer.test.ts`
- Imported renderables can share one glTF skin and animated joint tree while receiving refreshed per-renderable palettes: `packages/assets/src/GLTFAnimationRuntime.ts`, `tests/assets/gltf-animation-runtime.test.ts`
- Skinned shader variants perform weighted joint-matrix vertex transforms and normal/tangent skinning through GPU uniforms: `packages/rendering/src/ShaderLibrary.ts`
- Morph target and skinning composition is now documented and tested as morph-then-skin, including renderer draw submission, picking/culling bounds, and GLTF framing bounds: `packages/rendering/src/ForwardPass.ts`, `packages/rendering/src/SkinningBounds.ts`, `packages/assets/src/GLTFRenderResources.ts`, `tests/unit/rendering/renderer.test.ts`, `docs/project/v9-roadmap-skinning-limits.md`
- Hardware skinning limits are documented honestly: current uniform-array palettes support 64 joints, over-limit glTF skins report `skinning-palette-limit-fallback`, data-texture skinning remains open, and extra influence sets are diagnostic-only: `docs/project/v9-roadmap-skinning-limits.md`
- Additive skinning route now uses public mixer sample blending: `apps/skinning-additive/src/main.ts`
- Additive skinning route publishes motion samples, time range, pose diversity, and healthy-motion diagnostics: `apps/skinning-additive/src/main.ts`
- IK route now uses the public imported skeleton IK controller: `apps/skinning-ik/src/main.ts`
- IK route publishes motion samples, time range, pose diversity, and healthy-motion diagnostics: `apps/skinning-ik/src/main.ts`
- Multiple-animation route now uses the public imported clone sampler: `apps/animation-multiple/src/main.ts`
- Multiple-animation route publishes motion samples, time range, pose diversity, and healthy-motion diagnostics: `apps/animation-multiple/src/main.ts`
- Walk route now uses public root-motion locomotion controls: `apps/animation-walk/src/main.ts`
- Walk route publishes motion samples, time range, pose diversity, and healthy-motion diagnostics: `apps/animation-walk/src/main.ts`
- Morph target route now uses the public imported morph target controller: `apps/skinning-morph/src/main.ts`
- Morph target route publishes motion samples, time range, pose diversity, and healthy-motion diagnostics: `apps/skinning-morph/src/main.ts`
- Math and scene foundation support is documented and tested across first-party vectors, matrices, quaternions, Euler compatibility, projection, look-at, TRS decompose, frustum/ray/bounds math, Object3D-style hierarchy, matrix auto-update, manual local matrix mode, camera projection, and renderer transform uniforms: `docs/project/v9-roadmap-math-scene-foundation.md`, `tests/unit/math/vector-matrix.test.ts`, `tests/unit/scene/hierarchy-serialization.test.ts`, `tests/unit/rendering/scene-transform-uniforms.test.ts`
- Geometry and buffer management support is documented and tested across public vertex descriptors, interleaved vertex buffers, finite attribute validation, typed index buffers, usage hints, dynamic dirty-range updates, geometry bounds, primitive builders, morph/skinning bounds, and explicit buffer disposal: `docs/project/v9-roadmap-geometry-buffer-management.md`, `tests/unit/rendering/geometry-primitives.test.ts`, `tests/unit/rendering/vertex-buffer.test.ts`, `tests/unit/rendering/index-buffer.test.ts`
- Shader, material, and WebGL state foundations are documented and tested across shader source variants, GLSL compile/link diagnostics, shader reflection, material schemas, material instances, uniform/attribute/texture binding diagnostics, render-state descriptors, WebGL2 state caching, and renderer draw-state leak coverage: `docs/project/v9-roadmap-shader-material-state.md`, `tests/unit/rendering/material-binding.test.ts`, `tests/unit/rendering/shader-library.test.ts`, `tests/unit/rendering/webgl2-state-cache.test.ts`, `tests/unit/rendering/render-state-leaks.test.ts`, `tests/unit/rendering/renderer.test.ts`
- Render loop, camera, culling, and draw-path foundations are documented and tested across resize/DPR, animation loops, camera projection/view-projection, scene traversal, world-matrix updates before culling, frustum rejection, render-list construction, drawElements/drawArrays/instanced submissions, queue sorting, BVH broad-phase queries, and diagnostics: `docs/project/v9-roadmap-render-loop-camera-culling.md`, `tests/unit/rendering/renderer.test.ts`, `tests/unit/rendering/camera-framing.test.ts`, `tests/unit/rendering/scene-optimization.test.ts`, `tests/unit/scene/camera-frustum.test.ts`, `tests/unit/rendering/render-queue-sorting.test.ts`
- Advanced render management is documented and tested across opaque front-to-back sorting, transparent back-to-front sorting, batch diagnostics, WebGL2 native instanced draws, per-instance matrix attributes, divisor binding/reset behavior, state-cache diagnostics, and instancing limits: `docs/project/v9-roadmap-advanced-render-management.md`, `tests/unit/rendering/render-queue-sorting.test.ts`, `tests/unit/rendering/current-routes-webgl2-hot-path.test.ts`, `tests/unit/rendering/scene-optimization.test.ts`, `tests/unit/rendering/render-state-leaks.test.ts`
- PBR and IBL implementation boundaries are now documented against concrete shader/resource files, including Cook-Torrance BRDF, GGX/Smith/Fresnel, physical material lobes, HDR decode, diffuse irradiance, specular prefiltering, BRDF LUTs, environment rotation/intensity, and current approximation limits: `docs/project/v9-roadmap-pbr-ibl.md`
- Postprocess pipeline support is now documented against concrete render-target, renderer, WebGL2, composer, and pass code, including FBO color/depth attachments, fullscreen presentation, renderer-owned ordered target chains, public reusable ping-pong composer targets, depth bindings, explicit bloom bright/horizontal/vertical/composite stages, per-backend unsupported-effect diagnostics, and remaining boundaries: `docs/project/v9-roadmap-postprocess-pipeline.md`
- Asset loader pipeline support is tested across GLTF/GLB buffers, accessors, meshes, nodes, skins, animations, cameras, lights, material extensions, KTX2/Basis hooks, HDR/EXR/OBJ loaders, asset caches, render-resource conversion, auto-bounds/framing metadata, and public renderable-scene APIs: `packages/assets/src/GLTFLoader.ts`, `packages/assets/src/GLTFRenderResources.ts`, `packages/assets/src/loadRenderableAsset.ts`, `packages/assets/src/createRenderableScene.ts`, `tests/assets/current-routes-gltf-loader-corpus.test.ts`, `tests/assets/foundation-render-resources.test.ts`
- GLTFLoader normalizes imported `WEIGHTS_0` rows before GPU skinning, matching Three.js-style loader behavior and preventing malformed-but-common GLB skin data from tripping the renderer contract: `packages/assets/src/GLTFLoader.ts`, `tests/assets/current-routes-gltf-loader-corpus.test.ts`
- glTF loader extension support matrix is public package code: `packages/assets/src/GLTFExtensionSupport.ts`
- Loader compression route decodes EXT_meshopt_compression and KHR_draco_mesh_compression through public loader hooks, including real browser draco3d WASM coverage: `apps/loader-compression/src/main.ts`
- Opt-in Khronos compressed asset tests pass with real meshoptimizer and draco3d packages: `tests/assets/gltf-optional-external-decoders.test.ts`
- Loader instancing route renders required EXT_mesh_gpu_instancing data through public loader/runtime hooks: `apps/loader-instancing/src/main.ts`
- Loader material-extension route renders required clearcoat, sheen, and transmission glTF extensions through public loader/runtime hooks: `apps/loader-material-extensions/src/main.ts`
- Loader GLTF variants route selects KHR_materials_variants through public GLTF render resources: `apps/loader-gltf-variants/src/main.ts`
- Loader KTX2 route transcodes required KHR_texture_basisu data into G3D compressed texture resources with fallback mips: `apps/loader-ktx2/src/main.ts`
- Loader OBJ route parses native OBJ geometry through public OBJLoader and renders the converted GLTF resources: `apps/loader-obj/src/main.ts`
- Public render queue sorter drives ForwardPass opaque front-to-back and transparent back-to-front ordering with focused tests: `packages/rendering/src/performance/RenderItemSorting.ts`
- Public render queue plans now report object count, estimated draw calls, total instances, batchable groups, largest batch, material switches, and pipeline transitions: `packages/rendering/src/performance/RenderItemSorting.ts`, `tests/unit/rendering/render-queue-sorting.test.ts`
- Renderer scene collection now reports submitted, visible, culled, and frustum-tested object counts in RenderDeviceDiagnostics for sync and async render paths: `packages/rendering/src/Renderer.ts`, `tests/unit/rendering/renderer.test.ts`
- Resource lifecycle support is documented and tested across material disposal, render-target texture accounting, renderer/device disposal, WebGL delete calls, and repeated renderer load/unload cycles: `docs/project/v9-roadmap-resource-lifecycle.md`, `tests/unit/rendering/resource-lifetime.test.ts`, `tests/unit/rendering/render-state-leaks.test.ts`
- ForwardPass now routes oversized instanced render items through per-instance matrix vertex attributes while WebGL2Device issues native drawElementsInstanced/drawArraysInstanced calls with divisor-bound attributes and reports nativeInstancedSubmissions diagnostics: `packages/rendering/src/ForwardPass.ts`, `packages/rendering/src/ShaderLibrary.ts`, `packages/rendering/src/WebGL2Device.ts`, `tests/unit/rendering/renderer.test.ts`, `tests/unit/rendering/current-routes-webgl2-hot-path.test.ts`
- WebGL2Device now uses the public WebGL2StateCache on the hot path for program, VAO, framebuffer, viewport, scissor, buffer, texture, sampler, depth, cull, blend, stencil, color-write, and polygon-offset state, caches VAO setup for repeated draws, caches WebGL sampler objects by public Sampler descriptors, deletes cached VAOs and samplers on device disposal, and publishes state-cache diagnostics through RenderDeviceDiagnostics: `packages/rendering/src/WebGL2StateCache.ts`, `packages/rendering/src/WebGL2Device.ts`
- Renderer-owned postprocess now returns pass count, renderer-owned render-target count, texture count, and target dimensions in RenderDeviceDiagnostics: `packages/rendering/src/Renderer.ts`, `packages/rendering/src/RenderDevice.ts`, `tests/unit/rendering/renderer.test.ts`
- SceneOptimization now exposes a public static bounds BVH with broad-phase branch rejection, rebuild-based dynamic updates, accelerated bounds raycasts, and traversal diagnostics for total, visible, culled, node, bounds-test, leaf-test, hit, and traversal-time counts: `packages/rendering/src/SceneOptimization.ts`, `tests/unit/rendering/scene-optimization.test.ts`
- RenderDeviceDiagnostics now reports live buffer bytes and approximate GPU memory bytes alongside buffer, texture, shader/program, and render-target counts: `packages/rendering/src/RenderDevice.ts`, `packages/rendering/src/WebGL2Device.ts`, `packages/rendering/src/WebGPUDevice.ts`, `tests/unit/rendering/resource-lifetime.test.ts`
- Instancing performance route renders thousands of dynamic public Scene.createInstancedMesh instances through G3DRenderer with per-instance matrix and color attributes: `apps/instancing-performance/src/main.ts`, `packages/scene/src/Renderable.ts`, `packages/rendering/src/Renderer.ts`
- Texture anisotropy route proves WebGL anisotropic sampler uploads through public TextureBinding/Sampler code: `apps/texture-anisotropy/src/main.ts`
- Interactive picking route proves public camera-ray, transformed cube, and point-cloud threshold scene picking: `apps/interactive-picking/src/main.ts`
- Decals route now builds ellipse-clipped surface decals through public ProjectedDecalGeometry and createRaycastProjectedDecalGeometry instead of route-local cylinder/rectangle stand-ins, its decal PBR materials use alpha blending, disabled depth writes, no culling, and polygon offset with browser diagnostics, and `tests/browser/threejs-parity-decals-parity.spec.ts` compares the same scene against actual Three.js DecalGeometry projector output: `apps/decals/src/main.ts`
- Trackball controls route proves public TrackballControls rotate/pan/dolly/roll state in a rendered browser example: `apps/controls-trackball/src/main.ts`
- Geometry drawRange route proves indexed and array draw ranges through public RenderItem drawRange code: `apps/geometry-drawrange/src/main.ts`
- Geometry, lines, points, sprites, and helper scope is explicit: generated primitives, line/point topology, point-threshold parity, Three-compatible sprite/point objects, instancing, and debug helper line builders are supported, while fat-line parity remains scoped: `packages/rendering/src/Geometry.ts`, `packages/three-compat/src/core/Object3DCompat.ts`, `packages/debug/src/SceneHelpers.ts`, `docs/project/v9-roadmap-geometry-lines-points-sprites-scope.md`
- Scene package exports Object3D, Group, Mesh, SkinnedMesh, InstancedMesh, and manual matrixAutoUpdate controls over the existing transform/renderable tree: `packages/scene/src/Object3D.ts`
- Materials transmission route proves PBRMaterial transmission/IOR/volume uniforms through renderer-owned WebGL2 shading: `apps/materials-transmission/src/main.ts`
- Spotlight route proves Scene SpotLight collection, local PBR lighting uniforms, and renderer-owned shadow request: `apps/lights-spotlight/src/main.ts`
- Shadowmap viewer route proves ShadowPass depth texture readback and diagnostic preview: `apps/shadowmap-viewer/src/main.ts`
- Camera multiple views route proves separate WebGL DOM elements and distinct cameras rendering one shared G3D scene definition: `apps/camera-multiple-views/src/main.ts`
- Stereo and parallax routes now drive left/right views through public createStereoCameraRig and public stereo effect planning APIs with browser diagnostics proving the public paths: `packages/rendering/src/StereoEffects.ts`, `apps/stereo-effects/src/main.ts`, `apps/parallax-barrier/src/main.ts`
- WebGPU RTT route proves public WebGPU render-target draw/readback/present/disposal behavior through package code: `apps/webgpu-rtt/src/main.ts`
- WebGPU compute route proves public WebGPUParticleBackend storage-buffer compute dispatch and CPU-reference readback parity: `apps/webgpu-compute/src/main.ts`
- WebGPU materials route proves public PBR and textured PBR material rendering through the G3D WebGPU backend: `apps/webgpu-materials/src/main.ts`
- WebGPU instance-uniform route proves public InstancedPBRMaterial per-instance uniform matrices through one G3D WebGPU instanced draw: `apps/webgpu-instance-uniform/src/main.ts`
- WebXR interactions route proves public WebXRSessionController session negotiation, controller input sampling, and AR hit-test sampling with injected XR evidence: `apps/webxr-interactions/src/main.ts`
- Postprocessing bloom route runs renderer-owned bloom/tone-mapping/FXAA over real WebGL2 scene pixels: `apps/postprocessing-bloom/src/main.ts`
- Depth postprocess route runs renderer-owned depth-of-field, SSAO, and outline over real WebGL2 scene pixels: `apps/postprocessing-depth-outline/src/main.ts`

## Binding Code Parity Floor

V9 cannot claim full Three.js parity or that G3D exceeds Three.js in every sense until these systems exist as public package/runtime code:

- First-party math engine: vectors, matrices, quaternions, rays, bounds, frustums, projection, and transform math.
- Scene graph: Object3D-style hierarchy, inherited transforms, matrix auto-update traversal, cameras, lights, visibility, render order, and disposal.
- Geometry and GPU buffers: vertex attributes, interleaved buffers, index buffers, dynamic updates, GLTF attributes, instancing attributes, and buffer disposal.
- Shader/material/state system: GLSL compile/link/validate, uniform/attribute/texture binding, public materials, and CPU-side WebGL state caching.
- Renderer/camera/draw pipeline: render loop, resize/DPR, view-projection updates, frustum culling, render queue construction, sorting, and drawElements/drawArrays dispatch.
- Advanced render management: opaque front-to-back sorting, transparent back-to-front sorting, batching where valid, instanced rendering, per-instance attributes, and draw/state diagnostics.
- Hardware animation: bone hierarchy, inverse bind matrices, JOINTS/WEIGHTS import, GPU skinning palette upload, shader skinning, normal/tangent skinning, and multi-character palette diagnostics.
- PBR and IBL: Cook-Torrance BRDF, GGX, Smith, Fresnel-Schlick, metallic/roughness, normal/AO/emissive/physical extensions, HDR environment preparation, irradiance, prefiltered specular, and BRDF LUT or documented equivalent.
- Postprocess and render targets: FBO abstraction, render-to-texture, fullscreen passes, ping-pong composer chain, depth texture routing, bloom bright/blur/composite passes, and resize/disposal behavior.
- Spatial scale and memory: bounds, BVH/octree or equivalent acceleration, broad-phase culling, raycast acceleration, explicit dispose(), WebGL delete calls, ownership rules, teardown, diagnostics, and leak tests.

## Next Action

Continue down the high-priority backlog by moving remaining walk/morph/loader/material behavior out of route-local code and into package/runtime APIs.
