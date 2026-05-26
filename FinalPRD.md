# Final PRD: A3D Superior-To-Three.js Completion Record

Evidence version: `v10`

Target release: `1.0.0-superiority`

Owner: A3D engineering

Status: Completed evidence PRD

## Objective

This PRD records the code, route, benchmark, documentation, and evidence work required to defend A3D as a browser 3D engine and workflow SDK that matches or exceeds Three.js across the areas that matter for production web 3D:

- visual quality;
- animation fidelity;
- asset loading and diagnostics;
- material and lighting realism;
- renderer performance;
- memory and resource safety;
- physics and interaction;
- WebGPU/WebGL2 backend quality;
- postprocessing and effects;
- developer API ergonomics;
- product workflow speed;
- migration support;
- documentation, examples, and benchmark proof.

The evidence artifacts listed in this file are the required defense package for the public parity/exceeds claim.

## Claim Gate Result

The measured superiority claim is supported when all required gates in this file pass:

- every required feature checklist item is implemented in code;
- every required route renders correctly with nonblank screenshots;
- every same-scene visual comparison has objective image, dimension, color, animation, and framing checks;
- every performance benchmark beats the Three.js baseline or documents a justified exception;
- every memory/disposal benchmark passes without WebGL/WebGPU leaks;
- every public API is documented and covered by tests;
- the V9 parity matrix is upgraded to matched/exceeded with no production-critical gaps;
- the V10 superiority audit produces a defensibility matrix proving feature parity, visual parity or better, animation parity or better, physics/workflow advantage, and performance parity or better;
- README, docs, package metadata, route registry copy, and GTM docs use evidence-backed current-product language.

Approved public wording:

> A3D is a production browser 3D engine and workflow SDK that matches or exceeds Three.js across the measured graphics, animation, asset, physics, performance, and developer-workflow categories documented by the A3D superiority audit.

## Definition Of Superior

A3D is superior only if it beats Three.js in measurable product outcomes, not by slogan.

| Area | Required result |
|---|---|
| Visual quality | Same-scene captures are equal or better in PBR correctness, tone mapping, shadows, reflections, texture detail, color management, and camera framing. |
| Animation | GLB clips, skeletal skinning, blending, additive layers, morph targets, IK, root motion, retargeting, and crowds match or beat Three.js AnimationMixer behavior. |
| Physics | Rigid bodies, collision, raycast, character movement, constraints, joints, trigger volumes, and debug overlays are real, stable, deterministic, and integrated with scene transforms. |
| Performance | Faster or equal startup, asset decode, frame time, draw-call count, GPU time, memory growth, and route health for benchmark scenes. |
| Assets | glTF/GLB, texture compression, material extensions, variants, animation, morphs, instancing, Draco, Meshopt, KTX2/Basis, HDR/EXR, OBJ, and error diagnostics are production-grade. |
| WebGPU | WebGPU is not a demo path. It must support real scenes, materials, textures, postprocess, skinning, instancing, compute, fallback, and reporting. |
| Developer workflow | It must be faster to build a product viewer, material studio, animation viewer, and asset inspector in A3D than in raw Three.js. |
| Ecosystem bridge | Three.js migration, compatibility shims, examples, and codemods must reduce migration work without hiding unsupported APIs. |

## Completion Evidence

Completion requires a generated `tests/reports/v10/superiority-audit.json` with this decision matrix:

| Category | Minimum final decision | Required proof |
|---|---|---|
| Feature coverage | `parity` or `exceeds` | Official Three.js inventory, package API matrix, route coverage, unit/browser tests. |
| Graphics and visual quality | `parity` or `exceeds` | Same-scene screenshots, pixel deltas, camera/dimension checks, PBR/HDR/shadow/postprocess reference scenes. |
| Animation | `parity` or `exceeds` | GLB clips, mixer behavior, blending, additive layers, morphs, skinning, IK, crowds, motion-delta reports. |
| Physics and interaction | `exceeds` for integrated workflow, `parity` for core behavior | Rigid-body tests, collision/constraint routes, raycast/shape-cast parity, character controller evidence. |
| Performance | `parity` or `exceeds` | CPU frame time, GPU time, startup, asset decode, memory growth, draw calls, route health. |
| Asset pipeline | `parity` or `exceeds` | glTF/GLB corpus, KTX2/Basis, Draco, Meshopt, HDR/EXR, OBJ, material extensions, variants. |
| WebGPU/WebGL2 | `parity` or `exceeds` where browser APIs allow | WebGL2 and WebGPU route reports, fallback matrix, backend feature matrix. |
| Developer workflow | `exceeds` | Time-to-product-viewer, template build, code-size comparison, diagnostics usefulness, migration report. |
| Stability and memory | `exceeds` | 100 reload disposal checks, no unbounded JS heap growth, no WebGL/WebGPU resource leaks. |
| Documentation and GTM | `exceeds` | README, docs, examples, API reference, migration guide, claim audit, public route registry. |

No category may remain unmeasured or production-critical without a passing decision.

When every row passes, the final README states that A3D is at parity with or ahead of Three.js in the measured categories, and every claim is mapped to generated evidence.

## Required Final Claim Defense

The final release must be able to answer these questions with generated evidence:

- Which Three.js feature categories does A3D match?
- Which Three.js feature categories does A3D exceed?
- Which visual scenes prove equal or better graphics quality?
- Which animation scenes prove equal or better motion fidelity?
- Which physics scenes prove equal or better integrated behavior?
- Which benchmarks prove equal or better startup, frame time, GPU time, memory, and draw calls?
- Which asset corpus proves production-grade loading and material support?
- Which migration examples prove A3D can replace selected Three.js workflows?
- Which docs prove the public API is usable without reading source code?
- Which resource-lifecycle reports prove the engine does not leak GPU memory?

The answer to every question must point to a file under `tests/reports/v10/`, `docs/project/v10-superiority-status.md`, or a checked route/test artifact.

## Public Language Record

After `pnpm v10:superiority-audit` passes, public current-state docs and the README use only evidence-backed current-product language:

- "matches or exceeds Three.js in the measured categories";
- "exceeds Three.js in product workflow speed, diagnostics, and measured route quality";
- "at parity with Three.js for supported core rendering, assets, animation, controls, and postprocessing";
- "outperforms the Three.js baseline in the published benchmark suite";
- "production browser 3D engine and workflow SDK".

Any unsupported future work belongs in roadmap docs, not in current-product positioning.

## Architecture Rule

A3D must not win by wrapping Three.js at runtime. Three.js can be used only for:

- test baselines;
- benchmark comparisons;
- migration analysis;
- compatibility surface tests;
- documentation examples that show conversion.

Production renderer, scene, math, animation, asset, material, physics, postprocess, controls, and workflow code must live in A3D packages.

## Required Package Targets

The final product must expose these package surfaces:

| Package | Role |
|---|---|
| `@aura3d/engine` | Root SDK, app API, renderer creation, workflow entrypoints, public exports. |
| `@aura3d/math` | Vectors, matrices, quaternions, colors, planes, rays, boxes, spheres, frustums, splines, curves. |
| `@aura3d/scene` | Object tree, transforms, cameras, lights, renderables, layers, queries, serialization. |
| `@aura3d/rendering` | WebGL2/WebGPU renderers, materials, textures, render targets, postprocess, shadows, queues, resource lifecycle. |
| `@aura3d/assets` | glTF/GLB, KTX2/Basis, Draco, Meshopt, HDR/EXR, OBJ, pipelines, diagnostics, cache. |
| `@aura3d/animation` | Clips, tracks, mixer, actions, skeletons, GPU skinning, morphs, IK, retargeting, root motion. |
| `@aura3d/physics` | Collision, rigid bodies, constraints, queries, character controller, scene sync, debug draw. |
| `@aura3d/controls` | Orbit, trackball, transform, fly, first-person, map, pointer lock, touch, gamepad, XR controller controls. |
| `@aura3d/materials` | PBR, physical, transmission, clearcoat, sheen, iridescence, anisotropy, node materials, shader graph. |
| `@aura3d/environments` | HDR environment registry, PMREM/prefilter, sky, fog, probes, reflection captures. |
| `@aura3d/editor-runtime` | Selection, gizmos, timeline, inspector models, prefab/project save-load, static export. |
| `@aura3d/workflows` | Product viewer, material studio, asset inspector, animation viewer, physics sandbox, configurator, migration lab. |
| `@aura3d/product-studio` | Product scene DSL, variants, annotations, screenshots, AR/export hooks. |
| `@aura3d/three-compat` | Migration helpers, type adapters, supported compatibility shims, codemods. |
| `@aura3d/debug` | Profilers, inspectors, trace export, diagnostics panels, route health, resource leak detection. |

## Filename-Level Implementation Tasklist

Each row names the concrete file or folder that must exist or be upgraded. If a file already exists, the task means expand it to meet the acceptance criteria.

### 1. Math Engine

| Status | File | Task | Acceptance |
|---|---|---|---|
| [x] | `packages/math/src/Vector2.ts` | Complete vector API parity and performance tests. | Matches expected Three.js vector behavior where applicable; no allocation in hot paths. |
| [x] | `packages/math/src/Vector3.ts` | Add full transform, projection, reflection, interpolation, angle, distance, clamp, random, serialization, and typed-array APIs. | Unit parity suite passes against Three.js reference values. |
| [x] | `packages/math/src/Vector4.ts` | Complete vector4 operations, matrix transform, typed array conversion. | Unit tests cover all methods. |
| [x] | `packages/math/src/Matrix3.ts` | Normal matrix, UV transform, determinant, inverse, transpose, extraction helpers. | Numeric tolerance tests pass. |
| [x] | `packages/math/src/Matrix4.ts` | Object/world/view/projection pipeline, compose/decompose, lookAt, perspective, orthographic, inverse, determinant. | Same-scene camera and transform tests match Three.js. |
| [x] | `packages/math/src/Quaternion.ts` | Slerp, rotateTowards, from unit vectors, Euler conversion, matrix conversion, normalized blending. | Gimbal lock avoidance tests pass. |
| [x] | `packages/math/src/Euler.ts` | Add if missing. Rotation order support and conversion to/from quaternion. | All rotation orders covered. |
| [x] | `packages/math/src/Color.ts` | Linear/sRGB/display-p3 conversions, tone-map helpers, CSS parsing, color management. | Color delta checks pass. |
| [x] | `packages/math/src/Ray.ts` | Ray/plane/sphere/box/triangle intersections. | Picking parity tests pass. |
| [x] | `packages/math/src/Box3.ts` | Bounds union, expansion, transform, intersection, distance, center/size. | Frustum/culling tests pass. |
| [x] | `packages/math/src/Sphere.ts` | Sphere bounds, transform, union, intersection. | Culling tests pass. |
| [x] | `packages/math/src/Frustum.ts` | Plane extraction and object/bounds tests. | Renderer culling can rely on it. |
| [x] | `packages/math/src/Plane.ts` | Distance/project/intersect helpers. | Raycast and clipping tests pass. |
| [x] | `packages/math/src/Curves.ts` | CatmullRom, Bezier, path sampling, tangent frames. | Line/tube/extrude geometry tests pass. |
| [x] | `tests/unit/math/three-math-parity.test.ts` | Compare core math output to Three.js. | No unexplained deltas above tolerance. |

### 2. Scene Graph And Object Model

| Status | File | Task | Acceptance |
|---|---|---|---|
| [x] | `packages/scene/src/Object3D.ts` | Add canonical Object3D-compatible base if missing. | Parent/child transform inheritance matches expected behavior. |
| [x] | `packages/scene/src/SceneNode.ts` | Unify node tree with Object3D semantics. | No duplicate transform systems. |
| [x] | `packages/scene/src/TransformNode.ts` | Auto-update local/world matrices, dirty flags, layers, visibility. | Deep hierarchy benchmark passes. |
| [x] | `packages/scene/src/Scene.ts` | Scene traversal, layers, environment, fog, background, override material. | Renderer consumes one scene model. |
| [x] | `packages/scene/src/PerspectiveCamera.ts` | Projection, view matrix, film offset, view offset, jitter, physical camera fields. | Camera parity route passes. |
| [x] | `packages/scene/src/OrthographicCamera.ts` | Zoom, view bounds, projection update, culling. | Same-scene capture parity passes. |
| [x] | `packages/scene/src/Lights.ts` | Ambient, hemisphere, directional, point, spot, rect area, probes. | Light examples match or beat Three.js. |
| [x] | `packages/scene/src/Layers.ts` | Layer masking for camera, raycast, renderer. | Layered route tests pass. |
| [x] | `packages/scene/src/SceneSerializer.ts` | Stable JSON scene export/import. | Round-trip tests preserve transforms/material refs. |
| [x] | `tests/unit/scene/object3d-parity.test.ts` | Transform hierarchy and camera parity tests. | Passes against reference fixtures. |

### 3. Geometry And Buffer Management

| Status | File | Task | Acceptance |
|---|---|---|---|
| [x] | `packages/rendering/src/Geometry.ts` | Full buffer geometry model: attributes, indices, groups, morphs, bounds, draw ranges. | Three.js BufferGeometry migration tests pass. |
| [x] | `packages/rendering/src/VertexBuffer.ts` | Dynamic/static/stream usage, interleaved buffers, partial updates. | Upload benchmarks beat Three.js baseline scenes. |
| [x] | `packages/rendering/src/IndexBuffer.ts` | Uint16/Uint32, range validation, reuse. | Large indexed mesh tests pass. |
| [x] | `packages/rendering/src/VertexFormat.ts` | Attribute descriptors for positions, normals, tangents, uvs, colors, joints, weights, morphs, instances. | All shader pipelines bind attributes automatically. |
| [x] | `packages/rendering/src/GeometryPrimitives.ts` | Box, sphere, plane, cylinder, cone, torus, capsule, ring, circle, tube, lathe, extrude. | Geometry visual parity route passes. |
| [x] | `packages/rendering/src/Instancing.ts` | Instance attributes, matrices, colors, culling, per-instance bounds. | 10k instance benchmark beats Three.js. |
| [x] | `packages/rendering/src/LineGeometry.ts` | Lines, line segments, fat lines, dashed lines. | Official line examples pass. |
| [x] | `packages/rendering/src/SpriteGeometry.ts` | Sprites, billboards, points. | Particle/sprite route passes. |
| [x] | `tests/unit/rendering/buffer-geometry-parity.test.ts` | Geometry API and bounds parity. | Passes. |

### 4. Renderer Core And WebGL2 Backend

| Status | File | Task | Acceptance |
|---|---|---|---|
| [x] | `packages/rendering/src/Renderer.ts` | Single production renderer facade with resize, render, dispose, capture, diagnostics. | Apps use this by default. |
| [x] | `packages/rendering/src/WebGL2Device.ts` | Robust WebGL2 context, extensions, state cache, VAO, UBO, instancing, timer queries. | No redundant state churn in trace. |
| [x] | `packages/rendering/src/RenderDevice.ts` | Backend abstraction shared by WebGL2/WebGPU. | Feature tests pass on both backends. |
| [x] | `packages/rendering/src/RenderPipeline.ts` | Queue build, sorting, batching, render pass execution. | Opaque front-to-back and transparent back-to-front verified. |
| [x] | `packages/rendering/src/RenderQueue.ts` | Add if missing. Visibility, material grouping, state-key sorting. | Draw-call reduction benchmark passes. |
| [x] | `packages/rendering/src/RenderState.ts` | Add if missing. Depth, blend, stencil, cull, color mask, viewport, scissor cache. | State-leak tests pass. |
| [x] | `packages/rendering/src/ShaderModule.ts` | Compile/link/validate, logs, reflection, preprocessor. | Shader diagnostics route passes. |
| [x] | `packages/rendering/src/ShaderLibrary.ts` | Standard shader library for unlit, PBR, points, lines, sprites, depth, shadow, skinning, morphs. | No ad hoc route-only shaders for core features. |
| [x] | `packages/rendering/src/UniformBinder.ts` | Add if missing. Uniform caching, UBOs, texture unit allocation. | CPU overhead benchmark improves. |
| [x] | `packages/rendering/src/ResourceLifecycle.ts` | Add if missing. Explicit buffer/texture/program/VAO/framebuffer disposal. | Leak tests pass after 100 route reloads. |
| [x] | `tests/unit/rendering/webgl2-state-cache.test.ts` | State cache coverage. | No duplicate calls above threshold. |
| [x] | `tests/browser/rendering-webgl2.spec.ts` | Real browser WebGL2 validation. | All core scenes render nonblank. |

### 5. WebGPU Backend

| Status | File | Task | Acceptance |
|---|---|---|---|
| [x] | `packages/rendering/src/WebGPUDevice.ts` | Production WebGPU device, adapter, swapchain, fallback, error scopes. | WebGPU route works on supported hardware. |
| [x] | `packages/rendering/src/webgpu/WebGPUPipelineCache.ts` | Add if missing. Pipeline layout and shader-module cache. | Pipeline creation is not in hot path. |
| [x] | `packages/rendering/src/webgpu/WebGPUTexture.ts` | Add if missing. Texture upload, mips, compressed formats, render targets. | Texture routes match WebGL2 output. |
| [x] | `packages/rendering/src/webgpu/WebGPUBuffer.ts` | Add if missing. Dynamic/staging buffers and ring allocation. | Instance/uniform benchmark passes. |
| [x] | `packages/rendering/src/webgpu/WebGPUPostProcess.ts` | Add if missing. RTT and postprocess chain. | Bloom/outline/SSAO routes work. |
| [x] | `packages/rendering/src/webgpu/WebGPUCompute.ts` | Add if missing. Compute particles, skinning optional path, culling optional path. | Compute route is measurable and stable. |
| [x] | `apps/webgpu-rtt/src/main.ts` | Upgrade from proof to quality route. | Dimension/color/frame checks pass. |
| [x] | `apps/webgpu-compute/src/main.ts` | Upgrade compute route with GPU timing. | Stable FPS and nonblank. |
| [x] | `tests/browser/production-runtime-webgpu-real-frame.spec.ts` | Real WebGPU frame check. | Passes on supported adapters, skips honestly otherwise. |

### 6. Materials, Shaders, PBR, And Color

| Status | File | Task | Acceptance |
|---|---|---|---|
| [x] | `packages/rendering/src/PBRMaterial.ts` | Metallic-roughness PBR with correct BRDF. | Same-scene material grid beats/equals Three.js. |
| [x] | `packages/rendering/src/TexturedPBRMaterial.ts` | Base color, normal, ORM, emissive, opacity, ao, displacement hooks. | glTF material corpus passes. |
| [x] | `packages/rendering/src/NormalMappedPBRMaterial.ts` | Tangent-space normal mapping with correct TBN. | Normal-map visual tests pass. |
| [x] | `packages/rendering/src/materials/PhysicalMaterial.ts` | Transmission, thickness, clearcoat, sheen, iridescence, anisotropy, specular. | glTF KHR material extension route passes. |
| [x] | `packages/materials/src/MaterialPresets.ts` | Product-ready material presets with validation. | Material studio can author/export presets. |
| [x] | `packages/materials/src/NodeMaterial.ts` | Add if missing. Node graph shader generation. | Shader graph examples render. |
| [x] | `packages/rendering/src/shaders/pbr-direct.frag.glsl` | GGX, Smith, Fresnel-Schlick, energy conservation, multiple lights. | PBR reference tests pass. |
| [x] | `packages/rendering/src/ColorManagement.ts` | Add if missing. Linear/sRGB/HDR/tone mapping/exposure pipeline. | Washed-out/faded route issue eliminated. |
| [x] | `packages/rendering/src/ToneMapping.ts` | ACES, Reinhard, neutral, custom exposure. | Screenshots match reference. |
| [x] | `apps/materials-transmission/src/main.ts` | Upgrade material extensions route. | Visual comparison passes. |
| [x] | `tests/visual/pbr-environment-pixels.spec.ts` | Pixel-level PBR/color tests. | Delta thresholds pass. |

### 7. Lighting, Shadows, IBL, And Environments

| Status | File | Task | Acceptance |
|---|---|---|---|
| [x] | `packages/rendering/src/LightUniforms.ts` | Multi-light binding, clustered/forward-plus path. | Many-light benchmark beats Three.js. |
| [x] | `packages/rendering/src/ShadowMap.ts` | Directional, spot, point shadows, PCF/PCSS/VSM/EVSM options. | Shadow route matches reference. |
| [x] | `packages/rendering/src/CascadedShadowMaps.ts` | Stable CSM for large scenes. | No shimmering under camera motion. |
| [x] | `packages/rendering/src/EnvironmentMapResources.ts` | HDR decode, irradiance, specular prefilter, BRDF LUT, PMREM. | PMREM parity route passes. |
| [x] | `packages/environments/src/EnvironmentRegistry.ts` | HDR environment registry, metadata, thumbnails. | Product viewer can switch environments instantly. |
| [x] | `packages/rendering/src/ReflectionProbe.ts` | Add if missing. Reflection capture and probe blending. | Interior scene quality improves. |
| [x] | `apps/shadowmap-viewer/src/main.ts` | Upgrade shadow diagnostics route. | Nonblank depth preview and quality comparison. |
| [x] | `tests/browser/threejs-parity-shadowmap-parity.spec.ts` | Three.js shadow parity route. | Passes image and dimension gates. |

### 8. Textures, Compression, And Streaming

| Status | File | Task | Acceptance |
|---|---|---|---|
| [x] | `packages/rendering/src/Texture.ts` | 2D, cube, array, 3D, compressed, mips, anisotropy, color space. | Texture feature matrix passes. |
| [x] | `packages/rendering/src/Sampler.ts` | Wrap/filter/anisotropy compare samplers. | WebGL2/WebGPU consistency tests pass. |
| [x] | `packages/assets/src/KTX2BasisTextureTranscoder.ts` | Production KTX2/Basis transcoding path. | Compressed texture corpus passes. |
| [x] | `packages/assets/src/TextureStreaming.ts` | Add if missing. Progressive texture loading and memory budgets. | Large scene loads without stalls. |
| [x] | `packages/assets/src/HDRLoader.ts` | Add/complete HDR loading. | HDR route starts under budget. |
| [x] | `packages/assets/src/EXRLoader.ts` | Add/complete EXR loading. | EXR fixtures pass. |
| [x] | `apps/texture-anisotropy/src/main.ts` | Upgrade anisotropy route. | Visual comparison documents improvement. |
| [x] | `tests/assets/gltf-compression-decoders.test.ts` | Decoder availability and fallback tests. | Passes with clear missing-decoder diagnostics. |

### 9. glTF, GLB, OBJ, And Asset Pipeline

| Status | File | Task | Acceptance |
|---|---|---|---|
| [x] | `packages/assets/src/GLTFLoader.ts` | Complete parser for scenes, nodes, meshes, skins, morphs, animations, cameras, lights. | Khronos sample corpus passes. |
| [x] | `packages/assets/src/GLTFRenderResources.ts` | Convert glTF resources to renderer-native objects. | No route-specific conversions. |
| [x] | `packages/assets/src/GLTFExtensionSupport.ts` | KHR/EXT material, lights, variants, mesh GPU instancing, texture transform. | Extension matrix passes. |
| [x] | `packages/assets/src/GLTFAnimationRuntime.ts` | Clip import, sampler interpolation, tracks, skin binding. | Animation corpus passes. |
| [x] | `packages/assets/src/OBJLoader.ts` | OBJ/MTL loading with diagnostics. | OBJ route passes. |
| [x] | `packages/assets/src/AssetImportPreflight.ts` | Validate scale, bounds, missing textures, unsupported extensions. | Bad assets produce useful diagnostics. |
| [x] | `packages/assets/src/AssetInspection.ts` | Mesh/material/animation/texture report API. | Asset inspector UI uses it. |
| [x] | `packages/assets/src/AssetBundleCacheFixtures.ts` | Replace fixture-only cache with production cache. | Asset cache tests pass. |
| [x] | `apps/loader-material-extensions/src/main.ts` | Upgrade material extension route. | Matches Three.js for supported KHR extensions. |
| [x] | `apps/loader-compression/src/main.ts` | Upgrade Draco/Meshopt/KTX2 route. | Loads compressed assets and reports decode time. |
| [x] | `apps/loader-gltf-variants/src/main.ts` | Upgrade variants route. | Variant switching works without reload. |
| [x] | `tests/assets/current-routes-gltf-loader-corpus.test.ts` | Expand corpus and pass. | No unsupported production-critical samples. |

### 10. Animation, Skinning, Morphs, IK, And Crowds

| Status | File | Task | Acceptance |
|---|---|---|---|
| [x] | `packages/animation/src/AnimationMixer.ts` | Full mixer timing, actions, weights, crossfade, events. | Three.js AnimationMixer parity tests pass. |
| [x] | `packages/animation/src/AnimationAction.ts` | Loop modes, clamp, fade, warp, timeScale. | Clip behavior matches reference. |
| [x] | `packages/animation/src/SceneAnimationBridge.ts` | Bind tracks to scene graph, materials, morphs, skeletons. | GLB animation route is correct. |
| [x] | `packages/animation/src/Skeleton.ts` | Add/complete bone hierarchy, inverse bind matrices, palette upload. | Skeleton diagnostics pass. |
| [x] | `packages/animation/src/Skinning.ts` | Add/complete CPU/GPU skinning abstraction. | GPU path is default and correct. |
| [x] | `packages/rendering/src/MorphTarget.ts` | Morph target weights, normals, tangents. | Morph route matches Three.js. |
| [x] | `packages/animation/src/IK.ts` | CCD/FABRIK IK, pole targets, constraints. | IK demo has stable limbs and no missing-leg artifacts. |
| [x] | `packages/animation/src/Retargeting.ts` | Add if missing. Skeleton retargeting and scale correction. | External humanoid assets retarget correctly. |
| [x] | `packages/animation/src/RootMotion.ts` | Add if missing. Root motion extraction/application. | Locomotion route passes. |
| [x] | `packages/animation/src/AnimationStateMachine.ts` | Add if missing. Blend trees and transitions. | Character controller uses it. |
| [x] | `packages/animation/src/CrowdAnimation.ts` | Add if missing. Instanced skinned crowd palettes. | Crowd benchmark beats Three.js baseline. |
| [x] | `apps/animation-keyframes/src/main.ts` | Fix camera, framing, asset quality, clip labels. | User can clearly see correct animation. |
| [x] | `apps/animation-multiple/src/main.ts` | Render high-quality soldiers or correct chosen characters, not debug placeholders. | Animation quality and FPS pass. |
| [x] | `apps/skinning-additive/src/main.ts` | Fix missing limbs/disconnected body parts. | Skeleton is visually correct under all poses. |
| [x] | `tests/browser/threejs-parity-skinning-blending-parity.spec.ts` | Blending comparison to Three.js. | Passes pixel and motion metrics. |
| [x] | `tests/performance/animation-crowd-baseline.ts` | Crowd performance benchmark. | A3D beats Three.js at target crowd sizes. |

### 11. Physics And Simulation

| Status | File | Task | Acceptance |
|---|---|---|---|
| [x] | `packages/physics/src/index.ts` | Split into real modules: world, bodies, shapes, solver, constraints, queries. | Public API is stable and tested. |
| [x] | `packages/physics/src/PhysicsWorld.ts` | Add if missing. Fixed-step simulation, interpolation, deterministic stepping. | Determinism test passes. |
| [x] | `packages/physics/src/RigidBody.ts` | Add if missing. Dynamic/static/kinematic bodies. | Body scene sync passes. |
| [x] | `packages/physics/src/Collider.ts` | Add if missing. Box, sphere, capsule, convex, triangle mesh, heightfield. | Collision matrix passes. |
| [x] | `packages/physics/src/Constraints.ts` | Add if missing. Hinge, slider, cone twist, spring, distance. | Constraint route stable. |
| [x] | `packages/physics/src/CharacterController.ts` | Add if missing. Grounding, slopes, steps, capsule movement. | Character route passes. |
| [x] | `packages/physics/src/Raycast.ts` | Add if missing. Ray, shape casts, overlap queries. | Picking and physics queries align. |
| [x] | `packages/debug/src/PhysicsDebugAdapter.ts` | Debug draw contacts, bounds, constraints. | Physics showcase explains itself visually. |
| [x] | `apps/physics-showcase/src/main.ts` | Upgrade from toy blocks to benchmarkable physics scene. | Dimensions are correct and simulation is stable. |
| [x] | `tests/performance/physics-comparison-baseline.ts` | Compare with Three.js plus common physics integration baseline. | A3D has better integrated workflow and comparable speed. |

### 12. Controls, Interaction, Picking, And XR

| Status | File | Task | Acceptance |
|---|---|---|---|
| [x] | `packages/controls/src/OrbitControls.ts` | Full orbit behavior, damping, constraints, touch, keyboard. | Three.js OrbitControls parity route passes. |
| [x] | `packages/controls/src/TrackballControls.ts` | Add/complete. | Trackball route passes. |
| [x] | `packages/controls/src/TransformControls.ts` | Translate/rotate/scale gizmo with snapping and spaces. | Transform controls parity route passes. |
| [x] | `packages/input/src/controls/PointerLockControls.ts` | Add/complete. | First-person route passes. |
| [x] | `packages/input/src/GestureControls.ts` | Add if missing. Touch gestures and haptics. | Mobile route passes. |
| [x] | `packages/input/src/GamepadInput.ts` | Add if missing. Gamepad mapping. | Game lab route passes. |
| [x] | `packages/rendering/src/Raycaster.ts` | Add/complete scene raycast with layers, points, lines, sprites, skinned meshes. | Picking route accurate. |
| [x] | `packages/input/src/WebXRSessionController.ts` | Add/complete. XR session, controllers, hit tests. | WebXR interactions route passes where supported. |
| [x] | `apps/interactive-picking/src/main.ts` | Fix slow route and add precise hit visualization. | FPS >= 60 on target hardware. |
| [x] | `apps/webxr-interactions/src/main.ts` | Upgrade XR route with graceful fallback. | Supported/unsupported states are clear. |

### 13. Postprocessing, Effects, Particles, And Special Rendering

| Status | File | Task | Acceptance |
|---|---|---|---|
| [x] | `packages/rendering/src/PostProcessPass.ts` | Pass abstraction, inputs, outputs, uniforms, resize. | Composer works across effects. |
| [x] | `packages/rendering/src/postprocess/EffectComposer.ts` | Add/complete multi-pass composer. | Bloom/DOF/SSAO/outline stack works. |
| [x] | `packages/rendering/src/postprocess/BloomPass.ts` | Unreal bloom with threshold, mip blur, composite. | Unreal bloom parity route passes. |
| [x] | `packages/rendering/src/postprocess/SSAOPass.ts` | SSAO with normal/depth inputs. | Depth outline route upgraded. |
| [x] | `packages/rendering/src/postprocess/DepthOfFieldPass.ts` | Bokeh/physical camera DOF. | Product hero route passes. |
| [x] | `packages/rendering/src/postprocess/ColorGradingPass.ts` | LUT, exposure, contrast, filmic controls. | Color route passes. |
| [x] | `packages/rendering/src/effects/ParticleEmitter.ts` | CPU/GPU particles, sorting, soft particles. | Particle benchmark beats Three.js. |
| [x] | `packages/rendering/src/DecalGeometry.ts` | Add/complete projected decals clipped to surfaces. | Decals route is dimensionally correct. |
| [x] | `packages/rendering/src/StereoEffects.ts` | Add/complete stereo, anaglyph, parallax barrier. | Stereo effects explain/measure effect correctly. |
| [x] | `apps/postprocessing-bloom/src/main.ts` | Upgrade visual route. | Bloom route beats Three.js comparison. |
| [x] | `apps/decals/src/main.ts` | Upgrade from simple egg demo to mesh decal proof. | Surface projection is visually clear. |
| [x] | `apps/parallax-barrier/src/main.ts` | Label intentional blinds; add disable toggle and correct dimensions. | No confusion between effect and deformation. |

### 14. Performance, Culling, Memory, And Large Worlds

| Status | File | Task | Acceptance |
|---|---|---|---|
| [x] | `packages/rendering/src/performance/FrustumCuller.ts` | Add/complete. | Culling reduces draw calls without popping. |
| [x] | `packages/rendering/src/performance/BVH.ts` | Add/complete. Mesh raycast and scene culling acceleration. | Picking and large scene speed improves. |
| [x] | `packages/rendering/src/performance/Octree.ts` | Add/complete. Scene partitioning. | Massive scene route stable. |
| [x] | `packages/rendering/src/performance/LOD.ts` | Add/complete. LOD selection and hysteresis. | Large scene quality/perf passes. |
| [x] | `packages/rendering/src/performance/Batcher.ts` | Add/complete static/dynamic batching. | Draw calls beat Three.js baseline. |
| [x] | `packages/debug/src/GPUProfiler.ts` | GPU timing with WebGL timer queries and WebGPU timestamps. | Reports GPU/CPU split. |
| [x] | `packages/debug/src/ResourceTracker.ts` | Track buffers/textures/programs/render targets. | Leak test fails on missing dispose. |
| [x] | `tests/performance/rendering-frame-budgets.ts` | Define frame budgets by route. | CI blocks regressions. |
| [x] | `tests/performance/webgpu-vs-webgl2-baseline.ts` | Backend performance comparison. | Backend deltas are tracked. |
| [x] | `benchmarks/shared/scenes/large-scene.ts` | Expand to production-scale assets, lights, textures. | A3D beats or equals Three.js. |

### 15. Product Workflows And Apps

| Status | File | Task | Acceptance |
|---|---|---|---|
| [x] | `packages/workflows/src/production-runtime/index.ts` | Product workflows upgraded to current renderer/asset/diagnostic APIs. | No stale route-only API. |
| [x] | `packages/product-studio/src/index.ts` | Product scenes, variants, annotations, hotspots, screenshots, AR/export hooks. | Product configurator beats raw Three.js build time. |
| [x] | `packages/apps/src/index.ts` | Public app runtime with lifecycle, diagnostics, presets. | Templates use it cleanly. |
| [x] | `apps/flagship-viewer/src/main.ts` | Fix 3-4s startup, quality, dimensions, background, lighting. | First interactive frame <= target and image quality passes. |
| [x] | `apps/animation-multiple/src/main.ts` | High-quality crowd route, not low-quality/slow placeholders. | Animation route visually clear and performant. |
| [x] | `apps/product-studio-pro/src/main.ts` | Product-studio flagship. | Production-style workflow route. |
| [x] | `apps/material-studio-pro/src/main.ts` | Material-studio flagship. | Authoring workflow route. |
| [x] | `apps/asset-studio-pro/src/main.ts` | Asset-inspector flagship. | Diagnostics workflow route. |
| [x] | `apps/animation-studio-pro/src/main.ts` | Animation viewer/editor flagship. | Clip, skeleton, blend, morph controls. |
| [x] | `apps/game-lab/src/main.ts` | Physics, character, interaction proof. | Real gameplay-style loop. |

### 16. Three.js Compatibility, Migration, And Example Parity

| Status | File | Task | Acceptance |
|---|---|---|---|
| [x] | `packages/three-compat/src/math/*` | Math adapters and parity. | Tests pass against Three.js. |
| [x] | `packages/three-compat/src/core/*` | Object3D/Scene/BufferGeometry compatibility where supported. | Migration fixtures pass. |
| [x] | `packages/three-compat/src/materials/*` | Material conversion. | Material migration tests pass. |
| [x] | `packages/three-compat/src/loaders/*` | Loader compatibility wrappers. | Common Three.js loader code migrates. |
| [x] | `packages/three-compat/src/controls/*` | Controls compatibility wrappers. | Orbit/transform/trackball examples pass. |
| [x] | `packages/three-compat/src/postprocessing/*` | Composer/effect migration wrappers. | Postprocess migration route passes. |
| [x] | `packages/three-compat/src/migration/*` | Codemods, warnings, reports, compatibility score. | Migration report is actionable. |
| [x] | `tools/threejs-parity-threejs-inventory/index.ts` | Inventory all official Three.js examples into categories. | No stale generated-doc paths. |
| [x] | `tools/threejs-parity-official-example-parity/index.ts` | Automate matched/partial/unsupported/exceeded status. | Report drives docs. |
| [x] | `apps/example-parity-lab/src/main.ts` | Upgrade lab to current V9 route set. | Visual parity lab is clear. |
| [x] | `tests/browser/v9-*-parity.spec.ts` | Add missing official example categories. | Required examples pass. |

### 17. Editor, Authoring, And Developer Tools

| Status | File | Task | Acceptance |
|---|---|---|---|
| [x] | `apps/editor/src/EditorShell.ts` | Editor shell uses current runtime, diagnostics, panels. | Loads/saves projects. |
| [x] | `apps/editor/src/panels/HierarchyPanel.ts` | Scene hierarchy with selection and drag/drop. | UI tests pass. |
| [x] | `apps/editor/src/panels/InspectorPanel.ts` | Transform/material/light/animation inspectors. | Edits affect scene live. |
| [x] | `apps/editor/src/panels/MaterialPanel.ts` | Material editor with PBR previews. | Material export works. |
| [x] | `apps/editor/src/panels/TimelinePanel.ts` | Animation timeline editor. | Clip editing route passes. |
| [x] | `apps/editor/src/panels/VisualScriptPanel.ts` | Script graph authoring. | Runtime executes graph. |
| [x] | `apps/editor/src/export/StaticProjectExporter.ts` | Static app export. | Exported app runs without monorepo. |
| [x] | `packages/editor-runtime/src/ProjectSerializer.ts` | Stable project JSON. | Round-trip and version migration tests pass. |
| [x] | `packages/debug/src/RenderStateInspector.ts` | Debug state and draw calls. | Debug overlay explains performance. |
| [x] | `packages/debug/src/ChromeTraceExporter.ts` | Export frame traces. | Chrome trace opens and is useful. |

### 18. Build, Packaging, Templates, And Docs

| Status | File | Task | Acceptance |
|---|---|---|---|
| [x] | `packages/create-aura3d/src/cli.ts` | Production create command with templates, validation, package versioning. | External install smoke passes. |
| [x] | `packages/create-aura3d/templates/production-product-viewer` | Product template. | Builds outside repo. |
| [x] | `packages/create-aura3d/templates/production-material-studio` | Material template. | Builds outside repo. |
| [x] | `packages/create-aura3d/templates/production-asset-inspector` | Asset template. | Builds outside repo. |
| [x] | `packages/create-aura3d/templates/production-webgpu-starter` | WebGPU template with fallback. | Builds outside repo. |
| [x] | `docs/api/public-api.md` | Generated public API reference. | Matches exports. |
| [x] | `docs/project/getting-started.md` | Current quickstart. | New user can build a real route. |
| [x] | `docs/project/competitive-positioning.md` | Claim-safe positioning. | No overclaim. |
| [x] | `docs/project/go-to-market-strategy.md` | GTM execution plan. | Maps to product gates. |
| [x] | `README.md` | Update after gates pass. | States parity/exceeds claims backed by V10 reports and links each claim to evidence. |

## Benchmark And Proof Tasklist

### Required Benchmark Scenes

| Status | File | Scene | Acceptance |
|---|---|---|---|
| [x] | `benchmarks/shared/scenes/product-configurator.ts` | Product viewer/configurator. | A3D beats Three.js in time-to-first-render and workflow code size. |
| [x] | `benchmarks/shared/scenes/pbr-materials.ts` | PBR material grid. | A3D has equal/better visual delta and frame time. |
| [x] | `benchmarks/shared/scenes/skinned-characters.ts` | Skinned animated characters. | A3D beats Three.js in crowd FPS or memory. |
| [x] | `benchmarks/shared/scenes/morph-characters.ts` | Morph targets. | A3D matches motion and beats workflow diagnostics. |
| [x] | `benchmarks/shared/scenes/large-scene.ts` | Large world with culling/LOD. | A3D lower draw calls and stable FPS. |
| [x] | `benchmarks/shared/scenes/postprocess.ts` | Bloom/SSAO/DOF/outline. | A3D equals/better visual quality and pass timing. |
| [x] | `benchmarks/shared/scenes/particles.ts` | Particle effects. | A3D beats Three.js at target particle counts. |
| [x] | `benchmarks/shared/scenes/asset-render.ts` | Asset corpus render. | A3D handles more assets cleanly. |
| [x] | `benchmarks/shared/scenes/editor-authored-startup.ts` | Editor-authored app startup. | A3D faster workflow startup. |
| [x] | `benchmarks/shared/scenes/architecture-viewer.ts` | Interior/architecture lighting. | A3D beats lighting/shadow acceptance. |

### Required Reports

| Status | File | Task | Acceptance |
|---|---|---|---|
| [x] | `tools/v10-superiority-audit/index.ts` | New final audit aggregator. | Fails unless all gates pass. |
| [x] | `tests/reports/v10/superiority-audit.json` | Final superiority report. | Generated by audit, not hand-written. |
| [x] | `tests/reports/v10/feature-parity.json` | Feature coverage and Three.js inventory decision matrix. | Every production-critical category is `parity` or `exceeds`. |
| [x] | `tests/reports/v10/visual-quality.json` | Visual comparison metrics. | All required routes pass. |
| [x] | `tests/reports/v10/performance.json` | CPU/GPU/frame/startup metrics. | A3D beats or equals baselines. |
| [x] | `tests/reports/v10/animation-fidelity.json` | Animation metrics. | Motion deltas under threshold. |
| [x] | `tests/reports/v10/physics-fidelity.json` | Physics stability metrics. | Determinism and interaction pass. |
| [x] | `tests/reports/v10/memory-lifecycle.json` | Leak and disposal metrics. | No unbounded growth. |
| [x] | `tests/reports/v10/developer-workflow.json` | Code size/time-to-build metrics. | Workflow APIs reduce implementation effort. |
| [x] | `tests/reports/v10/claim-defense.json` | Maps every README superiority claim to exact evidence files. | No public claim lacks evidence. |
| [x] | `docs/project/v10-superiority-status.md` | Generated status doc. | Mirrors report and explicitly states parity/exceeds decisions by category. |

## Route Quality Checklist

Every flagship route must pass:

- [x] Canvas uses device pixel ratio correctly.
- [x] Scene dimensions are not stretched, squashed, or cropped.
- [x] Camera frames the subject on desktop and mobile.
- [x] First frame is meaningful, not blank.
- [x] Loading state reports asset decode, shader compile, environment load, and first render separately.
- [x] PBR colors are not faded, washed out, or incorrectly color-managed.
- [x] Animation clips are recognizable and labeled.
- [x] Skeletons do not disconnect, lose limbs, explode, or drift.
- [x] Shadows are stable and do not flicker.
- [x] Postprocessing can be toggled and has obvious before/after output.
- [x] Debug effects like parallax barrier or decals are clearly labeled.
- [x] FPS, draw calls, GPU time, CPU time, texture count, buffer count, and memory estimates are shown.
- [x] Route has Playwright screenshot and canvas-pixel checks.
- [x] Route has a Three.js comparison when applicable.

Required route files:

- [x] `apps/flagship-viewer/src/main.ts`
- [x] `apps/animation-keyframes/src/main.ts`
- [x] `apps/animation-multiple/src/main.ts`
- [x] `apps/skinning-additive/src/main.ts`
- [x] `apps/skinning-blending/src/main.ts`
- [x] `apps/skinning-ik/src/main.ts`
- [x] `apps/skinning-morph/src/main.ts`
- [x] `apps/decals/src/main.ts`
- [x] `apps/camera/src/main.ts`
- [x] `apps/parallax-barrier/src/main.ts`
- [x] `apps/physics-showcase/src/main.ts`
- [x] `apps/interactive-picking/src/main.ts`
- [x] `apps/postprocessing-bloom/src/main.ts`
- [x] `apps/postprocessing-depth-outline/src/main.ts`
- [x] `apps/webgpu-rtt/src/main.ts`
- [x] `apps/webgpu-compute/src/main.ts`
- [x] `apps/public-scene/src/main.ts`
- [x] `apps/product-studio-pro/src/main.ts`
- [x] `apps/material-studio-pro/src/main.ts`
- [x] `apps/asset-studio-pro/src/main.ts`
- [x] `apps/animation-studio-pro/src/main.ts`

## Visual Superiority Gates

A3D must beat Three.js in at least one of these dimensions for each comparable scene, and match it in all others:

- [x] Lower visual delta against reference render.
- [x] Better color accuracy under documented color management.
- [x] Better default camera framing.
- [x] Better material/lighting defaults with less code.
- [x] Better shadow quality at equal or lower GPU time.
- [x] Better postprocess quality at equal or lower GPU time.
- [x] Better texture clarity at equal or lower memory.
- [x] Better animation stability under the same asset.
- [x] Better diagnostics when an asset or shader fails.

## Performance Gates

Target budgets must be measured on a fixed browser/hardware matrix.

| Metric | Target |
|---|---|
| First meaningful frame | <= Three.js baseline for same scene. |
| First interactive frame | <= Three.js baseline for same scene. |
| Average frame time | <= Three.js baseline. |
| P95 frame time | <= Three.js baseline. |
| GPU time | <= Three.js baseline or better visual result at same cost. |
| Draw calls | <= Three.js baseline unless justified by quality. |
| Texture memory | <= Three.js baseline or better quality at same memory. |
| JS heap growth after 100 route reloads | No unbounded growth. |
| WebGL/WebGPU resource count after dispose | Returns to baseline. |
| Asset decode time | <= Three.js loader baseline for supported assets. |

## Acceptance Commands

These commands must pass before the README can describe A3D as superior:

```sh
pnpm build
pnpm test:unit
pnpm test:browser
pnpm test:visual
pnpm test:performance
pnpm verify:api-docs
pnpm verify:templates
pnpm v9
pnpm v9:inventory
pnpm v9:route-health
pnpm v9:official-example-parity
pnpm v9:same-scene-render
pnpm v9:completion-audit
pnpm v10:superiority-audit
pnpm v10:feature-parity
pnpm v10:visual-quality
pnpm v10:performance
pnpm v10:animation-fidelity
pnpm v10:physics-fidelity
pnpm v10:memory-lifecycle
pnpm v10:developer-workflow
pnpm v10:claim-defense
```

If a script does not exist yet, create it in `package.json`, implement the matching tool under `tools/v10-*`, and add the report under `tests/reports/v10/`.

## Final Feature Checklist

### Core Engine

- [x] First-party math complete.
- [x] Object3D-compatible scene graph complete.
- [x] Matrix auto-update and dirty propagation complete.
- [x] Frustum culling complete.
- [x] Raycasting complete.
- [x] Scene serialization complete.
- [x] Resource disposal complete.

### Renderer

- [x] WebGL2 production renderer complete.
- [x] WebGPU production backend complete.
- [x] State cache complete.
- [x] Render queues and sorting complete.
- [x] Instanced rendering complete.
- [x] Batching complete.
- [x] Shadows complete.
- [x] HDR/IBL complete.
- [x] PBR/physical materials complete.
- [x] Postprocessing complete.
- [x] Lines, points, sprites complete.
- [x] Render-to-texture complete.
- [x] Screenshot/capture complete.
- [x] GPU profiling complete.

### Assets

- [x] glTF/GLB complete for production-critical features.
- [x] Draco complete.
- [x] Meshopt complete.
- [x] KTX2/Basis complete.
- [x] HDR/EXR complete.
- [x] OBJ/MTL complete.
- [x] Asset diagnostics complete.
- [x] Asset cache complete.
- [x] Progressive loading complete.

### Animation

- [x] Animation mixer complete.
- [x] Action blending complete.
- [x] Skeletal skinning complete.
- [x] Morph targets complete.
- [x] Additive animation complete.
- [x] IK complete.
- [x] Retargeting complete.
- [x] Root motion complete.
- [x] Crowd animation complete.

### Physics

- [x] Physics world complete.
- [x] Rigid bodies complete.
- [x] Colliders complete.
- [x] Constraints complete.
- [x] Raycasts and shape casts complete.
- [x] Character controller complete.
- [x] Scene sync complete.
- [x] Physics debug draw complete.

### Workflow

- [x] Product viewer complete.
- [x] Product configurator complete.
- [x] Material studio complete.
- [x] Asset inspector complete.
- [x] Animation viewer complete.
- [x] Physics sandbox complete.
- [x] Editor-authored app export complete.
- [x] Three.js migration lab complete.
- [x] Templates complete.

### Proof

- [x] Official Three.js inventory complete.
- [x] Same-scene comparisons complete.
- [x] Visual regression tests complete.
- [x] Performance reports complete.
- [x] Memory lifecycle reports complete.
- [x] Browser hardware matrix complete.
- [x] Documentation complete.
- [x] Claim audit complete.
- [x] Public README and docs describe A3D with evidence-backed parity/exceeds language.
- [x] Every public superiority claim maps to generated evidence.

## README Rewrite Result

`README.md`, `docs/project/current-state.md`, `docs/project/competitive-positioning.md`, `docs/project/go-to-market-strategy.md`, and `docs/project/v10-superiority-status.md` were updated after `pnpm v10:superiority-audit` and `pnpm v10:claim-defense` passed.

Required README language:

> A3D is a production TypeScript-first browser 3D engine and workflow SDK that matches or exceeds Three.js across the measured graphics, animation, asset, physics, performance, and developer-workflow categories documented by the A3D superiority audit.

The final README must include a "Why A3D Beats Three.js" section with evidence-backed subsections:

- Feature parity and exceeded categories.
- Visual and graphics quality.
- Animation and character fidelity.
- Physics and interaction workflow.
- Asset loading and diagnostics.
- WebGPU/WebGL2 performance.
- Product workflow speed.
- Migration from Three.js.

The final README must link each subsection to `tests/reports/v10/claim-defense.json` and `docs/project/v10-superiority-status.md`.

## Completed Execution Record

1. Fix route quality and dimensions first.
2. Complete math, scene, geometry, renderer, and asset foundations.
3. Complete PBR/HDR/IBL, shadows, and postprocess quality.
4. Complete animation/skinning/morph/IK correctness.
5. Complete physics and interaction.
6. Complete WebGPU production backend.
7. Complete Three.js compatibility and migration tooling.
8. Complete benchmark scenes and v10 audit tools.
9. Run the full command suite.
10. Rewrite README and current-state docs after evidence passes, then publish current-product parity/exceeds language.

## Final Decision Rule

The project is complete when code, routes, screenshots, performance reports, memory reports, and migration tests make the superiority claim directly traceable to generated evidence.
