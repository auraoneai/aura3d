# Target Repository Structure

## Purpose
This document defines the proposed clean repository layout for the Galileo3D rebuild. It should replace the prior broad, inconsistent, backup-file-heavy trees with a package-first structure that future agents can implement one file at a time.

## Top-Level Layout
```text
galileo3d/
  package.json
  pnpm-workspace.yaml
  tsconfig.base.json
  tsconfig.build.json
  vitest.config.ts
  playwright.config.ts
  eslint.config.js
  docs/
  examples/
  packages/
    core/
    math/
    scene/
    ecs/
    rendering/
    physics/
    animation/
    assets/
    input/
    audio/
    scripting/
    editor-runtime/
    debug/
    test-utils/
  tests/
    unit/
    integration/
    browser/
    visual/
    performance/
  tools/
    verify-exports/
    verify-boundaries/
    visual-baseline/
    package-size/
```

## Package Rules
Each package has:

```text
packages/<name>/
  package.json
  src/
    index.ts
  tests/
```

Package `src/index.ts` is the only public export barrel for that package unless a specific subpath is approved in `22-Build-Packaging-and-Distribution-PRD.md`.

## Package Responsibilities
| Package | Responsibility | May Import |
|---|---|---|
| `math` | vectors, matrices, quaternions, colors, rays, bounds, interpolation | none |
| `core` | engine lifecycle, time, events, logging, diagnostics, scheduler, errors | `math` |
| `scene` | scene graph, transforms, cameras, lights, renderable nodes, bounds | `core`, `math` |
| `ecs` | entity IDs, components, stores, queries, systems, scheduler, command buffer | `core`, `math` |
| `rendering` | device abstraction, resources, render graph, shaders, materials, passes | `core`, `math`, `scene` |
| `physics` | fixed-step simulation, colliders, bodies, constraints, scene/ECS bridges | `core`, `math`, `scene`, `ecs` bridge only |
| `animation` | clips, tracks, mixer, skeletons, state machines, scene/ECS bridges | `core`, `math`, `scene`, `ecs` bridge only |
| `assets` | loaders, cache, registry, import pipeline, dependency graph | `core`, `math`, typed resource interfaces |
| `input` | keyboard, pointer, touch, gamepad, action maps | `core`, `math` |
| `audio` | Web Audio graph, spatial audio, mixer, listener/source components | `core`, `math`, `scene` |
| `scripting` | behavior runtime and visual scripting graph execution | `core`, `math`, `scene`, `ecs` |
| `editor-runtime` | commands, selection, gizmos, inspectors, play/edit bridge | public engine packages |
| `debug` | profiler, overlays, draw-call tracker, validation hooks | public engine packages |
| `test-utils` | mocks, browser helpers, visual test utilities | test-only dependencies |

## Required Source Structure By Package

### `packages/core/src`
```text
Engine.ts
EngineConfig.ts
EngineLoop.ts
Time.ts
FixedStepAccumulator.ts
EventBus.ts
Scheduler.ts
TaskQueue.ts
Logger.ts
Diagnostics.ts
Errors.ts
Disposable.ts
ResourceScope.ts
index.ts
```

### `packages/math/src`
```text
Vector2.ts
Vector3.ts
Vector4.ts
Matrix3.ts
Matrix4.ts
Quaternion.ts
Color.ts
Ray.ts
Plane.ts
Box3.ts
Sphere.ts
Frustum.ts
Transform.ts
Interpolation.ts
Easing.ts
Random.ts
index.ts
```

### `packages/scene/src`
```text
Scene.ts
SceneNode.ts
TransformNode.ts
Hierarchy.ts
Bounds.ts
Camera.ts
PerspectiveCamera.ts
OrthographicCamera.ts
Light.ts
DirectionalLight.ts
PointLight.ts
SpotLight.ts
Renderable.ts
SceneQuery.ts
SceneSerializer.ts
index.ts
```

### `packages/rendering/src`
```text
Renderer.ts
RenderDevice.ts
RenderBackend.ts
WebGL2Device.ts
WebGPUDevice.ts
RenderGraph.ts
RenderPass.ts
FrameGraphResources.ts
Geometry.ts
VertexFormat.ts
VertexBuffer.ts
IndexBuffer.ts
Texture.ts
Sampler.ts
ShaderModule.ts
ShaderPreprocessor.ts
ShaderLibrary.ts
Material.ts
MaterialInstance.ts
PBRMaterial.ts
UnlitMaterial.ts
RenderQueue.ts
ForwardPass.ts
DepthPass.ts
PostProcessPass.ts
DebugRenderPass.ts
index.ts
```

### `packages/physics/src`
```text
PhysicsWorld.ts
PhysicsStepper.ts
RigidBody.ts
Collider.ts
Shape.ts
CollisionEvents.ts
Constraint.ts
Raycast.ts
ScenePhysicsBridge.ts
ECSPhysicsBridge.ts
PhysicsDebugDraw.ts
index.ts
```

### `packages/animation/src`
```text
AnimationClip.ts
AnimationTrack.ts
Keyframe.ts
AnimationMixer.ts
AnimationAction.ts
AnimationLayer.ts
Skeleton.ts
Bone.ts
Skinning.ts
BlendTree.ts
AnimationStateMachine.ts
AnimationEvents.ts
SceneAnimationBridge.ts
ECSAnimationBridge.ts
index.ts
```

### `packages/assets/src`
```text
AssetManager.ts
AssetRegistry.ts
AssetHandle.ts
AssetLoader.ts
LoadContext.ts
AssetCache.ts
AssetDependencyGraph.ts
GLTFLoader.ts
ImageLoader.ts
TextureLoader.ts
AudioLoader.ts
ShaderLoader.ts
MaterialLoader.ts
SceneLoader.ts
ImportPipeline.ts
WorkerAssetJobs.ts
index.ts
```

## Test Layout
```text
tests/unit/
  core/
  math/
  scene/
  ecs/
  rendering/
  physics/
  animation/
  assets/
tests/integration/
  engine-loop.test.ts
  scene-rendering.test.ts
  ecs-scene-bridge.test.ts
  physics-sync.test.ts
  animation-sync.test.ts
  asset-to-renderable.test.ts
tests/browser/
  webgl2-init.spec.ts
  render-basic-scene.spec.ts
  material-pbr.spec.ts
  shadow-basic.spec.ts
tests/visual/
  baselines/
  render-output.spec.ts
tests/performance/
  ecs-entities.bench.ts
  renderer-drawcalls.bench.ts
  physics-fixedstep.bench.ts
```

## Forbidden Structure
The rebuild must not contain:

- `*.bak` source files.
- Runtime code under `docs`, `reports`, or `examples/shared` that is imported by packages.
- Generated stubs in package source.
- Deprecated compatibility wrappers in the first rebuild.
- More than one public renderer entry point.
- More than one shader registry.
- More than one event bus.
- More than one transform hierarchy owner.

