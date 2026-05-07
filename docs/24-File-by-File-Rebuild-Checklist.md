# File-By-File Rebuild Checklist

## Purpose
This is the master implementation checklist for rebuilding Galileo3D one file at a time. Each item maps to the PRD documents and includes purpose, dependencies, tests, and completion criteria. Future agents should not implement outside this checklist without updating the relevant PRD.

## Global Gates For Every File
Before marking any file complete:

- It lives in the target package from `03-Target-Repository-Structure.md`.
- It imports only allowed packages.
- It exports only approved public APIs or package-private helpers.
- It has unit tests for edge cases.
- It has integration/browser/visual tests where required by its PRD.
- It has no placeholder implementation, backup copy, or silent fallback hiding failure.
- It disposes resources if it owns resources.
- It has acceptance criteria checked in the corresponding PRD.

## Phase 0: Repository And Tooling

| File | Purpose | Dependencies | Required Tests | Completion Checklist |
|---|---|---|---|---|
| `package.json` | Workspace scripts and exports | pnpm | script smoke | `typecheck`, `test`, `test:browser`, `test:visual`, `build`, `verify` exist |
| `pnpm-workspace.yaml` | Workspace package discovery | none | install smoke | all `packages/*` included |
| `tsconfig.base.json` | strict shared TS rules | TypeScript | typecheck fixture | strict mode, no implicit any, declaration compatible |
| `tsconfig.build.json` | build declarations | TS base | build smoke | declarations emitted |
| `vitest.config.ts` | unit/integration test config | Vitest | sample test discovered | unit and integration globs configured |
| `playwright.config.ts` | browser/visual tests | Playwright | browser smoke | local examples can be served and tested |
| `eslint.config.js` | lint and import boundaries | ESLint | invalid import fixture | forbidden imports fail |
| `tools/verify-boundaries/index.ts` | dependency graph validation | TS parser | valid/invalid fixture | cycles and layer violations fail |
| `tools/verify-exports/index.ts` | package export validation | package metadata | missing export fixture | barrels match export map |
| `tools/verify-shaders/index.ts` | shader marker/source validation | rendering test device later | wrong marker fixture | shader source markers preserved |
| `tools/visual-baseline/index.ts` | screenshot/canvas validation | Playwright | blank canvas fixture | nonblank and expected-region checks work |
| `tools/package-size/index.ts` | bundle size report | build output | report smoke | JSON size report produced |

## Phase 1: Math

| File | Purpose | Dependencies | Required Tests | Completion Checklist |
|---|---|---|---|---|
| `packages/math/src/Vector2.ts` | 2D vector | none | arithmetic, normalize zero | immutable-safe methods documented |
| `packages/math/src/Vector3.ts` | 3D vector | none | dot/cross/normalize | no allocation surprises in hot helpers |
| `packages/math/src/Vector4.ts` | 4D vector | none | lerp, transform | used for colors/planes safely |
| `packages/math/src/Matrix3.ts` | 3x3 matrix | vectors | inverse singular | determinant/inverse tested |
| `packages/math/src/Matrix4.ts` | 4x4 transform/projection | vectors/quaternion | compose/decompose/inverse | projection helpers match references |
| `packages/math/src/Quaternion.ts` | rotations | Vector3 | slerp, normalize, matrix conversion | handles identity and opposite vectors |
| `packages/math/src/Color.ts` | linear/sRGB color | none | conversions | color space explicit |
| `packages/math/src/Ray.ts` | ray intersections | Vector3, Plane, Box3, Sphere | hit/miss | no placeholder raycast behavior |
| `packages/math/src/Plane.ts` | geometric plane | Vector3 | distance/project/intersect | normal normalization documented |
| `packages/math/src/Box3.ts` | AABB | Vector3 | union/intersection/transform | empty box behavior explicit |
| `packages/math/src/Sphere.ts` | bounding sphere | Vector3 | contains/intersection | invalid radius rejected |
| `packages/math/src/Frustum.ts` | camera frustum | Matrix4, Plane | contains box/sphere | extracted from view-projection |
| `packages/math/src/Transform.ts` | TRS helper | Vector3, Quaternion, Matrix4 | compose/decompose | parent/world composition tested |
| `packages/math/src/Interpolation.ts` | lerp/smooth helpers | vectors | boundary values | no hidden clamp unless named |
| `packages/math/src/Easing.ts` | easing functions | none | known curve values | invalid args throw |
| `packages/math/src/Random.ts` | seeded RNG | none | deterministic sequences | seed behavior documented |
| `packages/math/src/index.ts` | public exports | math files | export smoke | no private helpers exported |

## Phase 1: Core

| File | Purpose | Dependencies | Required Tests | Completion Checklist |
|---|---|---|---|---|
| `packages/core/src/Errors.ts` | typed errors | none | code/cause tests | all subsystems can use common error shape |
| `packages/core/src/Disposable.ts` | disposal contract | none | repeat/LIFO dispose | async and sync disposal handled |
| `packages/core/src/ResourceScope.ts` | scoped resource ownership | Disposable | nested disposal | leak snapshot available |
| `packages/core/src/EngineConfig.ts` | config validation | Errors | defaults/invalid | resolved config is readonly |
| `packages/core/src/Time.ts` | frame timing | none | scaled/unscaled/clamped | delta spike handling |
| `packages/core/src/FixedStepAccumulator.ts` | fixed-step math | Time | deterministic sequences | max catch-up steps |
| `packages/core/src/EventBus.ts` | typed events | Errors | once/unsub/error | listener mutation during emit handled |
| `packages/core/src/Logger.ts` | structured logs | none | filter/sinks | sink failure contained |
| `packages/core/src/Diagnostics.ts` | metrics snapshots | Time | counters/timers | immutable snapshots |
| `packages/core/src/TaskQueue.ts` | safe async finalization | Errors | cancellation/order | failure propagation |
| `packages/core/src/Scheduler.ts` | phase/dependency scheduler | Errors, Diagnostics | order/cycle/missing dep | hardcoded priority not required |
| `packages/core/src/EngineLoop.ts` | RAF/manual stepping | Time, accumulator | pause/resume/manual | browser and manual modes |
| `packages/core/src/Engine.ts` | public lifecycle owner | all core | init/start/stop/dispose | plugin rollback and no hidden globals |
| `packages/core/src/index.ts` | public exports | core files | export smoke | no private scheduler internals exported unless approved |

## Phase 2: Scene

| File | Purpose | Dependencies | Required Tests | Completion Checklist |
|---|---|---|---|---|
| `packages/scene/src/SceneNode.ts` | node hierarchy and local/world transform | core, math | add/remove/reparent/cycle | one transform owner |
| `packages/scene/src/Hierarchy.ts` | hierarchy operations | SceneNode | ancestor/reparent | rejects cycles |
| `packages/scene/src/TransformNode.ts` | dirty transform propagation | math | nested TRS | child dirty propagation |
| `packages/scene/src/Bounds.ts` | local/world bounds | math | transform bounds | empty and negative scale cases |
| `packages/scene/src/Scene.ts` | root and traversal | SceneNode | traversal/query/remove | mutation during traversal policy |
| `packages/scene/src/Camera.ts` | base camera | math | view/frustum | renderer read-only contract |
| `packages/scene/src/PerspectiveCamera.ts` | perspective projection | Camera | FOV/aspect/near/far | invalid config rejected |
| `packages/scene/src/OrthographicCamera.ts` | ortho projection | Camera | resize/zoom | projection stable |
| `packages/scene/src/Light.ts` | base light data | math | intensity/layers | no renderer coupling |
| `packages/scene/src/DirectionalLight.ts` | directional light | Light | direction from transform | shadow config data only |
| `packages/scene/src/PointLight.ts` | point light | Light | range attenuation | bounds available |
| `packages/scene/src/SpotLight.ts` | spot light | Light | cone validation | angle/penumbra stable |
| `packages/scene/src/Renderable.ts` | geometry/material attachment | core | missing handle validation | renderer can collect |
| `packages/scene/src/SceneQuery.ts` | node queries | Scene | name/type/bounds tests | updates after removal |
| `packages/scene/src/SceneSerializer.ts` | scene roundtrip | scene files | simple hierarchy roundtrip | stable IDs/remapping |
| `packages/scene/src/index.ts` | public exports | scene files | export smoke | package surface small |

## Phase 3: ECS

| File | Purpose | Dependencies | Required Tests | Completion Checklist |
|---|---|---|---|---|
| `packages/ecs/src/Entity.ts` | generational IDs | none | create/destroy/reuse | stale IDs rejected |
| `packages/ecs/src/Component.ts` | component contract | none | metadata | no global side effects |
| `packages/ecs/src/ComponentRegistry.ts` | component type IDs | Component | duplicate/missing | reset or scoped registry for tests |
| `packages/ecs/src/SparseSet.ts` | sparse storage | Entity | invariants | dense/sparse sync |
| `packages/ecs/src/Bitset.ts` | signatures | none | include/exclude | scalable component IDs |
| `packages/ecs/src/ComponentStore.ts` | component storage | registry, sparse set | add/remove/get | iteration safe |
| `packages/ecs/src/Archetype.ts` | signature groups | bitset/store | transitions | empty cleanup |
| `packages/ecs/src/EntityManager.ts` | entity allocation | Entity | liveness/reuse | generation overflow policy |
| `packages/ecs/src/Query.ts` | cached queries | stores/bitsets | invalidation/iteration | no mutation corruption |
| `packages/ecs/src/CommandBuffer.ts` | deferred mutations | World later | temp entity refs | mutation during query supported |
| `packages/ecs/src/System.ts` | system contract | core scheduler types | lifecycle | phase/deps explicit |
| `packages/ecs/src/SystemScheduler.ts` | ECS scheduling | core Scheduler | cycle/order | no hardcoded priority reliance |
| `packages/ecs/src/World.ts` | ECS owner | all ECS | lifecycle/integration | command buffer integrated |
| `packages/ecs/src/ECSSerializer.ts` | snapshot/restore | registry/world | roundtrip/remap | version hook |
| `packages/ecs/src/ECSProfiler.ts` | stats | diagnostics | snapshot | query/system counts |
| `packages/ecs/src/components/TransformComponent.ts` | data transform | math | schema/serialize | bridge-friendly |
| `packages/ecs/src/components/NameComponent.ts` | labels | none | storage | debug only |
| `packages/ecs/src/components/TagComponent.ts` | tags | none | query tag | efficient enough |
| `packages/ecs/src/index.ts` | public exports | ECS files | export smoke | no private stores unless approved |

## Phase 4: Rendering Minimal

| File | Purpose | Dependencies | Required Tests | Completion Checklist |
|---|---|---|---|---|
| `packages/rendering/src/RenderDevice.ts` | backend contract | core, math | mock conformance | no backend-specific leaks |
| `packages/rendering/src/RenderBackend.ts` | backend selection | RenderDevice | unavailable backend | clear fallback errors |
| `packages/rendering/src/WebGL2Device.ts` | WebGL2 implementation | RenderDevice | browser init/readback | context loss path |
| `packages/rendering/src/WebGPUDevice.ts` | future backend skeleton | RenderDevice | unavailable/fallback | no duplicate renderer |
| `packages/rendering/src/VertexFormat.ts` | vertex layouts | math | offset/stride | semantic mapping to shader attributes |
| `packages/rendering/src/VertexBuffer.ts` | vertex data/upload | VertexFormat, device | CPU layout, GPU readback | dirty range upload |
| `packages/rendering/src/IndexBuffer.ts` | index data/upload | device | 16/32-bit | out-of-range guard |
| `packages/rendering/src/Geometry.ts` | mesh geometry | buffers, bounds | triangle/cube | ownership/dispose |
| `packages/rendering/src/Texture.ts` | texture resource | device | upload/dispose | color space metadata |
| `packages/rendering/src/Sampler.ts` | sampler state | device | validation | backend mapping |
| `packages/rendering/src/ShaderModule.ts` | compiled shader | device | compile success/fail | source markers retained |
| `packages/rendering/src/ShaderPreprocessor.ts` | defines/includes | shader library | include cycle | line mapping |
| `packages/rendering/src/ShaderLibrary.ts` | one shader registry | preprocessor | duplicate/missing | no second registry |
| `packages/rendering/src/Material.ts` | material base | core | state validation | dirty tracking |
| `packages/rendering/src/MaterialInstance.ts` | overrides | Material | inheritance | override dirty tracking |
| `packages/rendering/src/MaterialBinding.ts` | uniform/texture binding | material, shader, device | wrong type/missing uniform | explicit diagnostics |
| `packages/rendering/src/UnlitMaterial.ts` | simple material | Material | flat color visual | first material path |
| `packages/rendering/src/RenderPass.ts` | pass interface | device | mock pass | declares reads/writes |
| `packages/rendering/src/RenderGraph.ts` | pass DAG | RenderPass | cycles/resource hazards | compiled execution plan |
| `packages/rendering/src/ForwardPass.ts` | simple drawing | scene, materials | cube visual | state reset |
| `packages/rendering/src/Renderer.ts` | public renderer | scene, device, graph | init/render/resize/dispose | empty scene safe |
| `packages/rendering/src/index.ts` | public exports | rendering files | export smoke | no deep private exports |

## Phase 5: Materials, Lighting, Shadows

| File | Purpose | Dependencies | Required Tests | Completion Checklist |
|---|---|---|---|---|
| `packages/rendering/src/UniformLayout.ts` | packed uniform layout | shader/material | offset/alignment | GPU upload verified |
| `packages/rendering/src/TextureBinding.ts` | texture binding | Texture/Sampler | missing texture | no silent success |
| `packages/rendering/src/PBRMaterial.ts` | standard PBR | MaterialBinding | schema and visual | normal/tangent validation |
| `packages/rendering/src/ShaderChunks.ts` | shared shader chunks | ShaderLibrary | compile all chunks | dependency cycles rejected |
| `packages/rendering/src/LightCollector.ts` | collect visible lights | scene lights | layer/order | max lights handled |
| `packages/rendering/src/LightUniforms.ts` | light data packing | UniformLayout | CPU/GPU values | no uniform upload ambiguity |
| `packages/rendering/src/ShadowMap.ts` | shadow resources | device | framebuffer complete | resize/dispose |
| `packages/rendering/src/DepthPass.ts` | depth-only pass | RenderPass | depth visual/readback | no state leak |
| `packages/rendering/src/ShadowPass.ts` | shadow rendering | DepthPass | shadow visual | no caster/light edge cases |
| `packages/rendering/src/CascadedShadowMaps.ts` | directional cascades | ShadowPass | split math | deferred until basic shadows pass |
| `packages/rendering/src/LightingDebug.ts` | light/shadow debug lines | debug pass | line data | visible in debug pass |

## Phase 6: Debug

| File | Purpose | Dependencies | Required Tests | Completion Checklist |
|---|---|---|---|---|
| `packages/debug/src/Profiler.ts` | CPU profiling | core diagnostics | nested markers | report snapshot |
| `packages/debug/src/GPUProfiler.ts` | GPU timings | rendering | unavailable path | no crash without extension |
| `packages/debug/src/DrawCallTracker.ts` | draw call stats | rendering hooks | call classification | catches zero draw call |
| `packages/debug/src/RenderStateInspector.ts` | render state snapshots | WebGL2Device | leak detection | before/after pass diff |
| `packages/debug/src/ShaderDiagnostics.ts` | shader info | ShaderModule | marker validation | compile logs exposed |
| `packages/debug/src/MaterialDiagnostics.ts` | material binding info | MaterialBinding | missing uniform | actionable diagnostics |
| `packages/debug/src/ResourceTracker.ts` | resource leak detection | core/render/assets | dispose leak test | structured report |
| `packages/debug/src/PhysicsDebugAdapter.ts` | physics debug lines | physics/render debug | line counts | no physics mutation |
| `packages/debug/src/AnimationInspector.ts` | animation snapshots | animation | mixer state | no runtime mutation |
| `packages/debug/src/ECSInspector.ts` | ECS snapshots | ecs | entity/query stats | stable schema |
| `packages/debug/src/DebugOverlay.ts` | browser overlay model | diagnostics | model generation | optional DOM adapter |
| `packages/debug/src/ReportExporter.ts` | JSON reports | all debug | deterministic output | command evidence friendly |
| `packages/debug/src/index.ts` | public exports | debug files | export smoke | no private internals exported |

## Phase 7: Physics

| File | Purpose | Dependencies | Required Tests | Completion Checklist |
|---|---|---|---|---|
| `packages/physics/src/Shape.ts` | shape descriptors | math | validation/bounds | box/sphere/capsule/plane |
| `packages/physics/src/RigidBody.ts` | body state | math | force/impulse/damping | dynamic/static/kinematic |
| `packages/physics/src/Collider.ts` | collider attachment | Shape | filters/sensors | material data |
| `packages/physics/src/PhysicsWorld.ts` | simulation owner | core/math | fall/collide/determinism | no render coupling |
| `packages/physics/src/PhysicsStepper.ts` | fixed-step bridge | core | repeated sequence | interpolation alpha |
| `packages/physics/src/CollisionEvents.ts` | contact stream | PhysicsWorld | begin/end once | removal edge case |
| `packages/physics/src/Raycast.ts` | ray/shape cast | math/world | hit/miss/all hits | no stub |
| `packages/physics/src/Constraint.ts` | joint constraints | bodies | fixed/hinge basics | invalid anchors |
| `packages/physics/src/ScenePhysicsBridge.ts` | sync scene nodes | scene, physics | dynamic/kinematic sync | parent scale policy |
| `packages/physics/src/ECSPhysicsBridge.ts` | sync ECS components | ecs, physics | component sync | ordering documented |
| `packages/physics/src/PhysicsDebugDraw.ts` | debug shapes | debug/render | shape lines | visible overlay |
| `packages/physics/src/index.ts` | public exports | physics files | export smoke | stable API |

## Phase 8: Animation

| File | Purpose | Dependencies | Required Tests | Completion Checklist |
|---|---|---|---|---|
| `packages/animation/src/Keyframe.ts` | keyframe data | math | serialization | typed key values |
| `packages/animation/src/AnimationTrack.ts` | sampled tracks | Keyframe | interpolation/bounds | vector/quaternion/scalar |
| `packages/animation/src/AnimationClip.ts` | clip asset | tracks | validation/duration | event list |
| `packages/animation/src/AnimationAction.ts` | playback instance | clip | loop/pause/stop | event timing |
| `packages/animation/src/AnimationMixer.ts` | runtime mixer | actions | update/crossfade | deterministic |
| `packages/animation/src/AnimationLayer.ts` | layered blending | mixer | weights/masks | additive later explicit |
| `packages/animation/src/Bone.ts` | bone metadata | math | hierarchy | bind pose data |
| `packages/animation/src/Skeleton.ts` | skeleton hierarchy | Bone | matrix palette | invalid parent rejected |
| `packages/animation/src/Skinning.ts` | skin matrices | Skeleton | palette output | renderer data contract |
| `packages/animation/src/BlendTree.ts` | blend weights | clips | weight sum | parameter outside range |
| `packages/animation/src/AnimationStateMachine.ts` | state transitions | actions | transition order | deterministic interruptions |
| `packages/animation/src/AnimationEvents.ts` | event dispatch | clip/action | loop crossing | once semantics |
| `packages/animation/src/SceneAnimationBridge.ts` | bind to scene | scene | animated node | missing target handling |
| `packages/animation/src/ECSAnimationBridge.ts` | bind to ECS | ecs | component animation | component removal |
| `packages/animation/src/index.ts` | public exports | animation files | export smoke | no advanced API until tested |

## Phase 9: Assets

| File | Purpose | Dependencies | Required Tests | Completion Checklist |
|---|---|---|---|---|
| `packages/assets/src/AssetHandle.ts` | typed handle | core disposable | retain/release | disposed access guard |
| `packages/assets/src/AssetLoader.ts` | loader interface | core errors | mock loader | dependencies explicit |
| `packages/assets/src/LoadContext.ts` | request context | core | abort/URL resolution | dependency chain errors |
| `packages/assets/src/AssetRegistry.ts` | loader registry | loader | duplicate/missing | scoped for tests |
| `packages/assets/src/AssetCache.ts` | cached loads | handles | hit/retry/release | failed load policy |
| `packages/assets/src/AssetDependencyGraph.ts` | dependency ownership | handles | release order | cycle detection |
| `packages/assets/src/AssetManager.ts` | public API | registry/cache | duplicate in-flight | cancellation |
| `packages/assets/src/ImageLoader.ts` | image decode | browser | data URL/abort | no Node-only assumptions |
| `packages/assets/src/TextureLoader.ts` | texture asset | rendering | upload/dispose | color space metadata |
| `packages/assets/src/ShaderLoader.ts` | shader source | rendering shader library | marker | source retained |
| `packages/assets/src/MaterialLoader.ts` | material descriptors | rendering material | JSON to material | schema validation |
| `packages/assets/src/AudioLoader.ts` | audio decode | audio | mocked decode | browser unlock separate |
| `packages/assets/src/GLTFLoader.ts` | glTF/GLB | scene/render/animation | triangle/texture/animation fixtures | unsupported extension errors |
| `packages/assets/src/SceneLoader.ts` | native scene load | scene/assets | simple scene | stable IDs |
| `packages/assets/src/ImportPipeline.ts` | preprocessing hooks | loaders | stage order | failure rollback |
| `packages/assets/src/WorkerAssetJobs.ts` | worker boundary | import pipeline | unavailable fallback | cancellation |
| `packages/assets/src/index.ts` | public exports | asset files | export smoke | no exotic loaders exported |

## Phase 10: Input, Controls, Audio

| File | Purpose | Dependencies | Required Tests | Completion Checklist |
|---|---|---|---|---|
| `packages/input/src/InputSnapshot.ts` | per-frame state | none | pressed/down/released | immutable snapshot |
| `packages/input/src/KeyboardDevice.ts` | keyboard | browser events | repeat/blur | keyup loss handled |
| `packages/input/src/PointerDevice.ts` | pointer/mouse/touch | browser events | buttons/wheel/touch | DPR conversion |
| `packages/input/src/GamepadDevice.ts` | gamepad polling | navigator | connect/deadzone | mocked gamepads |
| `packages/input/src/ActionMap.ts` | actions/axes | devices | chords/alternatives | named actions |
| `packages/input/src/InputSystem.ts` | public input owner | devices | focus/dispose | listener cleanup |
| `packages/input/src/GestureRecognizer.ts` | gestures | pointer | pinch/pan/tap | optional after basics |
| `packages/input/src/PickingRay.ts` | screen to ray | scene camera/math | center/corners | projection correct |
| `packages/input/src/InteractionSystem.ts` | hover/click/drag | picking/scene | removed target | no scene mutation by default |
| `packages/input/src/controls/OrbitControls.ts` | orbit camera | input/scene | rotate/pan/zoom | dispose listeners |
| `packages/input/src/controls/FirstPersonControls.ts` | FPS camera | input/scene | movement/look | pitch clamp |
| `packages/input/src/controls/ThirdPersonFollowControls.ts` | follow camera | input/scene | damping | target removal |
| `packages/input/src/controls/EditorFlyControls.ts` | editor fly | input/scene | speed/focus | editor use |
| `packages/input/src/controls/CameraRig.ts` | camera state blend | scene/math | blend/shake | no renderer coupling |
| `packages/input/src/index.ts` | public exports | input files | export smoke | stable API |
| `packages/audio/src/AudioContextManager.ts` | context lifecycle | Web Audio | unlock/suspend | browser constraints |
| `packages/audio/src/AudioClip.ts` | decoded audio | assets/audio | metadata | dispose |
| `packages/audio/src/AudioSource.ts` | playback | context/clip | state transitions | play before load guarded |
| `packages/audio/src/AudioListener.ts` | listener | scene/math | transform sync | camera bridge |
| `packages/audio/src/SpatialAudio.ts` | panner | listener/source | distance model | node graph |
| `packages/audio/src/AudioBus.ts` | bus gain | context | routing | mute/solo |
| `packages/audio/src/AudioMixer.ts` | bus graph | buses | routing | master output |
| `packages/audio/src/AudioEffect.ts` | effect contract | context | connect/disconnect | no leaks |
| `packages/audio/src/effects/Reverb.ts` | convolver | AudioEffect | node graph | optional impulse loading later |
| `packages/audio/src/effects/Filter.ts` | filter | AudioEffect | params | validates ranges |
| `packages/audio/src/SceneAudioBridge.ts` | source/listener sync | scene/audio | transform update | no separate hierarchy |
| `packages/audio/src/AudioSystem.ts` | public audio owner | audio files | lifecycle | unlock required |
| `packages/audio/src/index.ts` | public exports | audio files | export smoke | stable API |

## Phase 11: Scripting And Editor Runtime

| File | Purpose | Dependencies | Required Tests | Completion Checklist |
|---|---|---|---|---|
| `packages/scripting/src/Behavior.ts` | behavior contract | core | hook order | phase hooks explicit |
| `packages/scripting/src/ScriptContext.ts` | behavior context | engine APIs | services by phase | safe access |
| `packages/scripting/src/BehaviorHost.ts` | attach behaviors | scene/ecs | attach/detach | destroyed host edge |
| `packages/scripting/src/BehaviorSystem.ts` | scheduled execution | core scheduler | phase/error handling | failures contained |
| `packages/scripting/src/BehaviorRegistry.ts` | serialize behavior types | Behavior | duplicate/missing | no hidden globals |
| `packages/scripting/src/VisualGraph.ts` | graph model | core | validate graph | no broad node catalog yet |
| `packages/scripting/src/VisualNode.ts` | node schema | graph | port validation | typed ports |
| `packages/scripting/src/VisualGraphExecutor.ts` | minimal graph execution | graph | deterministic simple graph | limited nodes only |
| `packages/scripting/src/index.ts` | public exports | scripting files | export smoke | minimal API |
| `packages/editor-runtime/src/EditorRuntime.ts` | editor state owner | public packages | mode init/dispose | no admin portal scope |
| `packages/editor-runtime/src/Selection.ts` | selection model | scene/ecs | delete selected | event emitted |
| `packages/editor-runtime/src/Command.ts` | command contract | core | execute/undo | typed command result |
| `packages/editor-runtime/src/CommandHistory.ts` | undo/redo | Command | transactions/merge | rollback on failure |
| `packages/editor-runtime/src/commands/TransformCommand.ts` | transform edit | scene/math | undo exact | command only mutator |
| `packages/editor-runtime/src/commands/CreateNodeCommand.ts` | node creation | scene | undo/redo | hierarchy stable |
| `packages/editor-runtime/src/commands/DeleteNodeCommand.ts` | node deletion | scene | undo restore | children restored |
| `packages/editor-runtime/src/commands/SetPropertyCommand.ts` | property edit | inspector | invalid path | typed validation |
| `packages/editor-runtime/src/PickingService.ts` | picking | input/render/scene | nearest object | no renderer private API |
| `packages/editor-runtime/src/Gizmo.ts` | gizmo base | input/scene | hit/drag | lifecycle |
| `packages/editor-runtime/src/TranslateGizmo.ts` | move gizmo | Gizmo/commands | axis move | uses command history |
| `packages/editor-runtime/src/RotateGizmo.ts` | rotate gizmo | Gizmo/commands | angle | uses command history |
| `packages/editor-runtime/src/ScaleGizmo.ts` | scale gizmo | Gizmo/commands | uniform/axis | uses command history |
| `packages/editor-runtime/src/InspectorModel.ts` | property schema | scene/render | node/material schema | UI independent |
| `packages/editor-runtime/src/PlayModeBridge.ts` | play/edit snapshot | scene/ecs | restore | deterministic mode exit |
| `packages/editor-runtime/src/index.ts` | public exports | editor files | export smoke | runtime only |

## Phase 12: Particles And Effects

| File | Purpose | Dependencies | Required Tests | Completion Checklist |
|---|---|---|---|---|
| `packages/rendering/src/effects/Particle.ts` | particle data | math | defaults | explicit layout |
| `packages/rendering/src/effects/ParticleEmitter.ts` | emission | Random/math | seeded counts | bursts/rate |
| `packages/rendering/src/effects/ParticleModule.ts` | module contract | particle | order | deterministic |
| `packages/rendering/src/effects/VelocityModule.ts` | velocity | module | sampled velocity | lifetime aware |
| `packages/rendering/src/effects/ColorModule.ts` | color over life | module/color | gradient | visual distinct |
| `packages/rendering/src/effects/SizeModule.ts` | size over life | module | curve | min/max |
| `packages/rendering/src/effects/ForceModule.ts` | forces | module/math | gravity/wind | fixed delta |
| `packages/rendering/src/effects/CollisionModule.ts` | collision | physics optional | plane bounce | no stub |
| `packages/rendering/src/effects/TrailModule.ts` | trails | geometry/debug lines | trail geometry | after line rendering proven |
| `packages/rendering/src/effects/ParticleRenderer.ts` | render particles | render graph/material | visible sprites | participates in graph |
| `packages/rendering/src/effects/GPUParticleBackend.ts` | future backend | device | unavailable fallback | not implemented as fake success |
| `packages/rendering/src/effects/ParticleSystem.ts` | runtime owner | all particle files | spawn/update/death | stats exposed |

## Phase 13: Examples

| File | Purpose | Dependencies | Required Tests | Completion Checklist |
|---|---|---|---|---|
| `examples/shared/exampleHarness.ts` | consistent example runtime | engine packages | smoke | errors surfaced |
| `examples/shared/visualCheck.ts` | canvas validation | Playwright | blank detection | expected regions |
| `examples/00-basic-triangle/main.ts` | renderer proof | rendering | browser/visual | colored triangle |
| `examples/01-basic-scene/main.ts` | scene/render proof | scene/render | browser/visual | nested cubes/grid |
| `examples/02-materials-pbr/main.ts` | material proof | render/material | visual | PBR grid distinct |
| `examples/03-shadows/main.ts` | shadow proof | lighting/shadows | visual | visible shadow |
| `examples/04-physics-stack/main.ts` | physics sync proof | physics/render | browser/visual | stack settles |
| `examples/05-animation-character/main.ts` | animation proof | animation/render | visual | looped animation |
| `examples/06-asset-gltf/main.ts` | asset proof | assets/render | browser/visual | glTF visible |
| `examples/07-input-controls/main.ts` | controls proof | input/scene | browser | camera moves |
| `examples/08-audio-spatial/main.ts` | audio proof | audio/scene | browser/manual+automated state | unlock/playback |
| `examples/09-editor-runtime/main.ts` | editor runtime proof | editor/input/render | browser | select/move/undo |
| `examples/10-particles/main.ts` | particles proof | particles/render | visual/perf | seeded visible effect |

## Final Release Checklist
- `pnpm typecheck` passes.
- `pnpm test` passes.
- `pnpm test:browser` passes.
- `pnpm test:visual` passes.
- `pnpm verify` passes.
- Boundary report has zero violations.
- Export report has zero missing or unintended exports.
- Shader marker report proves expected sources.
- Visual report has no blank or mismatched baselines.
- Performance report records baselines for ECS, renderer, physics, animation, particles.
- Source tree contains no `*.bak`, generated stubs, duplicate owner systems, or deprecated compatibility wrappers.

