# Implementation Roadmap

## Purpose
This roadmap sequences the rebuild so future agents do not repeat the prior breadth-first failures. Each phase has a build target, acceptance gate, and "do not start yet" boundary.

## Roadmap Principles
- Build one vertical slice at a time.
- Do not implement advanced subsystems before their dependencies pass tests.
- Do not add demos that bypass public APIs.
- Do not mark a phase complete from documentation alone.
- Do not expand scope because old attempts had files for it.

## Phase 0: Repository And Verification Harness
Goal: create the clean workspace and enforcement tools before engine code.

Deliverables:

- Workspace package layout from `03-Target-Repository-Structure.md`.
- Strict TypeScript config.
- Unit and integration test harness.
- Playwright browser harness.
- Boundary verifier.
- Export verifier.
- Shader marker verifier skeleton.
- Visual baseline harness with blank-canvas detection.

Acceptance gate:

- `pnpm typecheck` passes on empty packages.
- `pnpm test` runs sample tests.
- Boundary verifier fails on a known invalid fixture and passes on valid fixture.
- Export verifier checks public barrels.

Do not start:

- Rendering implementation beyond test fixtures.
- Physics, animation, assets, editor, or examples.

## Phase 1: Core And Math Foundation
Goal: create deterministic lifecycle primitives and math types.

Deliverables:

- `packages/math` primitives: vectors, matrices, quaternion, color, ray, plane, bounds, frustum, transform, interpolation.
- `packages/core` lifecycle: config, errors, disposable stack, time, fixed accumulator, event bus, scheduler, diagnostics, engine loop.

Acceptance gate:

- Unit tests for all math operations and edge cases.
- Core lifecycle tests pass.
- Scheduler dependency/cycle tests pass.
- Manual engine stepping is deterministic.
- No forbidden imports.

Do not start:

- Renderer, physics, animation, scene integration beyond simple mocks.

## Phase 2: Scene Graph
Goal: create the author-facing object hierarchy and camera/light data.

Deliverables:

- Scene, scene node, hierarchy, transforms, bounds, scene queries.
- Perspective and orthographic cameras.
- Base/direct/point/spot lights as data.
- Scene serialization for simple hierarchy.

Acceptance gate:

- Transform hierarchy tests pass.
- Reparent/cycle tests pass.
- Camera/frustum tests pass.
- Scene traversal returns renderable/camera/light lists without mutation.

Do not start:

- Complex culling, shadows, editor gizmos.

## Phase 3: ECS Runtime
Goal: create data-oriented runtime with explicit scheduling.

Deliverables:

- Entity IDs, entity manager, component registry, stores, bitsets, archetypes/sparse sets, queries.
- World, command buffer, systems, system scheduler, serializer, profiler.
- Minimal components: transform, name, tag.

Acceptance gate:

- Entity/component/query lifecycle tests pass.
- Command buffer mutation during iteration works.
- Scheduler phase/dependency validation works.
- 100,000 entity iteration benchmark baseline recorded.

Do not start:

- ECS render/physics/animation systems until subsystem bridges exist.

## Phase 4: Renderer Minimal Vertical Slice
Goal: draw real pixels in browser through the canonical renderer.

Deliverables:

- RenderDevice interface and mock device.
- WebGL2Device.
- VertexFormat, VertexBuffer, IndexBuffer, Geometry.
- ShaderModule, ShaderPreprocessor, ShaderLibrary.
- UnlitMaterial, MaterialBinding.
- Renderer and ForwardPass.
- Basic visual examples: triangle and cube.

Acceptance gate:

- WebGL2 initializes in Playwright.
- Buffer upload/readback test passes.
- Triangle visual baseline passes.
- Cube visual baseline passes.
- Shader source marker verification passes.
- No backup renderer files or duplicate shader registries.

Do not start:

- PBR, shadows, postprocessing, particles.

## Phase 5: Materials And Basic Lighting
Goal: make shading correct and diagnosable.

Deliverables:

- PBRMaterial.
- UniformLayout and TextureBinding.
- LightCollector and LightUniforms.
- Directional, point, spot lighting in shader path.
- Material and shader diagnostics.
- PBR sphere grid example.

Acceptance gate:

- Material binding GPU verification passes.
- PBR visual baseline passes.
- Wrong shader marker test fails as expected.
- Light uniforms reach shader and affect visible output.

Do not start:

- Shadows or advanced postprocessing until direct lighting is stable.

## Phase 6: Shadows And Debug Rendering
Goal: add first advanced render feature only after base renderer is stable.

Deliverables:

- DepthPass.
- ShadowMap.
- ShadowPass.
- Basic shadowed cube example.
- DebugRenderPass and debug line rendering.
- Render state inspector.

Acceptance gate:

- Shadow visual baseline passes.
- Debug lines are visible.
- Render state leak tests pass.
- Shadow pass handles no-caster/no-light cases.

Do not start:

- Cascaded shadows, GI, volumetrics, toon, advanced postFX.

## Phase 7: Physics Vertical Slice
Goal: deterministic rigidbody simulation visible in scene.

Deliverables:

- PhysicsWorld, PhysicsStepper, RigidBody, Collider, Shape.
- Collision events.
- Raycast.
- ScenePhysicsBridge.
- ECSPhysicsBridge.
- PhysicsDebugDraw.
- Falling cube and stack examples.

Acceptance gate:

- Deterministic replay passes.
- Ground collision test passes.
- Raycast is real and tested.
- Scene-sync visual example passes.
- Debug draw visible.

Do not start:

- Cloth, fluids, soft bodies, vehicles.

## Phase 8: Animation Vertical Slice
Goal: deterministic animation sampling visible in scene.

Deliverables:

- Keyframe, AnimationTrack, AnimationClip.
- AnimationAction, AnimationMixer, AnimationLayer.
- SceneAnimationBridge and ECSAnimationBridge.
- Skeleton, Bone, Skinning matrix palette.
- StateMachine and BlendTree basics.
- Animated cube and simple skeletal examples.

Acceptance gate:

- Track interpolation tests pass.
- Mixer loop/crossfade tests pass.
- Scene/ECS bridge tests pass.
- Skeleton matrix palette test passes.
- Visual animation baseline passes.

Do not start:

- Motion matching, advanced IK, timeline editor.

## Phase 9: Assets
Goal: load real external resources into scene and renderer.

Deliverables:

- AssetManager, registry, handles, cache, dependency graph.
- Image, texture, shader, material, audio loaders.
- Minimal glTF loader for mesh/material/texture.
- SceneLoader and import pipeline skeleton.
- glTF example.

Acceptance gate:

- Duplicate load shares one promise.
- Release disposes dependency graph.
- Minimal glTF triangle and textured asset render.
- Failed dependency reports typed error.

Do not start:

- FBX, KTX2/Basis, streaming, asset marketplace, neural/quantum/blockchain loaders.

## Phase 10: Input, Controls, Audio
Goal: make the engine interactive and audible through stable public APIs.

Deliverables:

- InputSystem, snapshots, keyboard, pointer, gamepad, action map.
- Orbit and first-person controls.
- Picking ray and interaction system.
- AudioSystem, context manager, source, listener, mixer, buses, spatial bridge.
- Input and audio examples.

Acceptance gate:

- Input transitions correct.
- Controls move camera in browser.
- Picking ray selects scene object.
- Audio context unlock and playback work in browser.
- Spatial source follows scene transform.

Do not start:

- Complex gestures, audio reactive rendering.

## Phase 11: Scripting And Editor Runtime
Goal: add runtime behavior and editor manipulation without UI sprawl.

Deliverables:

- Behavior, BehaviorHost, BehaviorSystem, ScriptContext.
- Visual graph validation skeleton.
- EditorRuntime, Selection, Command, CommandHistory.
- Transform/Create/Delete/SetProperty commands.
- Picking service and translate/rotate/scale gizmos.
- PlayModeBridge.
- Editor runtime example.

Acceptance gate:

- Behavior phase order tests pass.
- Commands undo/redo exactly.
- Gizmo modifies selection through commands.
- Play mode snapshot/restore works.

Do not start:

- Full editor UI, admin portal, marketplace, cloud tooling.

## Phase 12: Particles And First Effects
Goal: add effects after renderer/material/debug paths are mature.

Deliverables:

- CPU particle system, emitter, particle data.
- Velocity, color, size, force, collision modules.
- Particle renderer and visual examples.
- Debug stats.

Acceptance gate:

- Seeded particle simulation deterministic.
- Particle visual baseline passes.
- Performance baseline recorded.
- Collision module works against plane.

Do not start:

- GPU simulation until CPU path and render graph integration pass.

## Phase 13: Packaging And Release Candidate
Goal: make a consumable package.

Deliverables:

- Final package exports.
- Dist build.
- Type declarations.
- Sample app imports every public subpath.
- Release verification report generated from command outputs.

Acceptance gate:

- `pnpm verify` passes full suite.
- Package import smoke tests pass.
- Browser examples pass.
- Visual baselines pass.
- Performance baselines recorded.
- No forbidden imports, no duplicate owners, no source backup files.

## Post-Rebuild Backlog
Only after the release candidate:

- WebGPU parity backend.
- Cascaded shadows.
- Postprocessing stack.
- Terrain.
- Voxels.
- Networking.
- Timeline/cinematics.
- Advanced IK.
- Cloth/fluid/soft body simulation.
- Domain packs.
- Editor UI.

