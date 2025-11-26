# Phase H: Testing Implementation - Execution Prompt

## Overview

**Phase:** H - Comprehensive Test Suite Implementation  
**Status:** Post-Integration Phase  
**Purpose:** Implement complete test suite per `PRD-Final-11-Testing-Phases.md`  
**Estimated Time:** 3-4 weeks  
**Reference Document:** `Docs/PRD-Final-11-Testing-Phases.md`

**This phase implements:**
- ✅ Unit tests for all modules (~150+ test files)
- ✅ Integration tests for cross-system interactions (~10+ test files)
- ✅ Performance benchmarks (~10+ test files)
- ✅ Visual regression tests (~10+ test files)
- ✅ Test infrastructure and fixtures
- ✅ Coverage reporting and CI integration
- ✅ **Total: ~180 test files**

---

## Testing Philosophy (from PRD)

### Non-Negotiable Testing Rules

```
TESTING_RULES:
  1. No file merges without passing tests
  2. No feature complete without 80%+ coverage
  3. No subsystem complete without integration tests
  4. No release without performance regression tests
  5. No visual changes without golden image comparison
  6. No API changes without documentation updates
```

### Coverage Targets

- **Core Module:** 95% coverage
- **Math Module:** 100% coverage
- **ECS Module:** 95% coverage
- **Rendering Module:** 90% coverage
- **Physics Module:** 90% coverage
- **Animation Module:** 85% coverage
- **AI Module:** 90% coverage
- **Infrastructure Modules:** 85% coverage
- **Overall Target:** 85%+ coverage

---

## Execution Strategy

### Phase H.1: Test Infrastructure Setup (Sequential)
- Setup test framework (Vitest)
- Configure coverage reporting
- Create test utilities and helpers
- Setup fixtures and test data

### Phase H.2: Unit Tests - Core & Math (Parallel)
- Core module tests (~8 test files)
- Math module tests (~18 test files)

### Phase H.3: Unit Tests - ECS & Rendering (Parallel)
- ECS module tests (~24 test files)
- Rendering module tests (~30 test files)

### Phase H.4: Unit Tests - Physics & Animation (Parallel)
- Physics module tests (~30 test files)
- Animation module tests (~30 test files)

### Phase H.5: Unit Tests - AI, World & Infrastructure (Parallel)
- AI module tests (~20 test files)
- World module tests (~20 test files)
- Infrastructure module tests (~30 test files)

### Phase H.6: Unit Tests - Domain Packs & Tooling (Parallel)
- Domain pack tests (~15 test files)
- Tooling tests (~20 test files)

### Phase H.7: Integration Tests (Sequential)
- Cross-system integration tests (~10 test files)

### Phase H.8: Performance Benchmarks (Sequential)
- Performance benchmark suite (~10 test files)

### Phase H.9: Visual Regression Tests (Sequential)
- Visual regression test suite (~10 test files)

### Phase H.10: Test Verification & CI Integration (Sequential)
- Verify all tests pass
- Setup CI/CD integration
- Generate coverage reports
- Final test suite validation

---

## Part 1: Test Infrastructure Setup

### Task 1.1: Setup Test Framework

**Framework:** Vitest (recommended) or Jest

**Configuration File:** `vitest.config.ts`

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/index.ts',
      ],
      thresholds: {
        lines: 85,
        functions: 85,
        branches: 80,
        statements: 85,
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
```

**Verification Checklist:**
- [ ] Vitest installed and configured
- [ ] Test scripts added to `package.json`
- [ ] Coverage reporting configured
- [ ] Test environment setup (jsdom for DOM APIs)
- [ ] Test timeout configured appropriately

---

### Task 1.2: Create Test Utilities

**File:** `tests/utils/test-helpers.ts`

**Required Utilities:**
- [ ] `createMockCanvas()` - Creates mock HTMLCanvasElement
- [ ] `createMockWebGLContext()` - Creates mock WebGL2RenderingContext
- [ ] `createMockWebGPUDevice()` - Creates mock GPUDevice
- [ ] `waitForFrame()` - Waits for next animation frame
- [ ] `createTestEntity()` - Creates test entity with components
- [ ] `createTestWorld()` - Creates test ECS world
- [ ] `createTestRenderer()` - Creates test renderer instance
- [ ] `createTestPhysicsWorld()` - Creates test physics world
- [ ] `expectVector3Close()` - Vector3 assertion with epsilon
- [ ] `expectMatrix4Close()` - Matrix4 assertion with epsilon
- [ ] `expectQuaternionClose()` - Quaternion assertion with epsilon
- [ ] `mockTime()` - Mocks performance.now() for deterministic tests
- [ ] `createMockAudioContext()` - Creates mock AudioContext

**Example:**
```typescript
export function createMockCanvas(): HTMLCanvasElement {
  const canvas = {
    width: 800,
    height: 600,
    getContext: jest.fn(),
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
  } as unknown as HTMLCanvasElement;
  return canvas;
}

export function expectVector3Close(
  actual: Vector3,
  expected: Vector3,
  epsilon: number = 1e-6
): void {
  expect(Math.abs(actual.x - expected.x)).toBeLessThan(epsilon);
  expect(Math.abs(actual.y - expected.y)).toBeLessThan(epsilon);
  expect(Math.abs(actual.z - expected.z)).toBeLessThan(epsilon);
}
```

---

### Task 1.3: Create Test Fixtures

**Directory:** `tests/fixtures/`

**Required Fixtures:**
- [ ] `fixtures/models/` - Test 3D models (glTF, OBJ)
- [ ] `fixtures/textures/` - Test textures (PNG, JPG)
- [ ] `fixtures/scenes/` - Test scene files
- [ ] `fixtures/configs/` - Test configuration files
- [ ] `fixtures/audio/` - Test audio files
- [ ] `fixtures/shaders/` - Test shader files

**Verification Checklist:**
- [ ] All fixture directories created
- [ ] Sample test assets added
- [ ] Fixture loading utilities created
- [ ] Fixtures documented

---

## Part 2: Unit Tests - Core & Math Modules

### Task 2.1: Core Module Tests

**Target Coverage:** 95%

**Test Files to Create:**

#### `tests/unit/core/Engine.test.ts`
- [ ] Initialization tests
  - [ ] Creates with default config
  - [ ] Creates with custom config
  - [ ] Throws on invalid canvas
  - [ ] Initializes subsystems in correct order
  - [ ] Emits ready event after initialization
- [ ] Main loop tests
  - [ ] Updates at target frame rate
  - [ ] Calls systems in correct order
  - [ ] Handles frame time spikes
  - [ ] Respects pause state
  - [ ] Accumulates time correctly for fixed step
- [ ] Lifecycle tests
  - [ ] Starts and stops cleanly
  - [ ] Disposes all resources on destroy
  - [ ] Handles multiple start/stop cycles
  - [ ] Emits lifecycle events

#### `tests/unit/core/Time.test.ts`
- [ ] Frame timing tests
- [ ] Fixed timestep accumulator tests
- [ ] Time scaling tests
- [ ] Max delta time capping tests

#### `tests/unit/core/Logger.test.ts`
- [ ] Log level filtering tests
- [ ] Category-based logging tests
- [ ] Sink routing tests
- [ ] Rate limiting tests

#### `tests/unit/core/ObjectPool.test.ts`
- [ ] Allocation tests (acquires from pool, creates new when empty)
- [ ] Release tests (returns to pool, calls reset)
- [ ] Performance tests (zero allocation after warmup)
- [ ] Double-release detection tests

#### `tests/unit/core/EventBus.test.ts`
- [ ] Subscribe/unsubscribe tests
- [ ] Event emission tests
- [ ] Handler error handling tests
- [ ] Memory leak detection tests

#### `tests/unit/core/TaskScheduler.test.ts`
- [ ] Task scheduling tests
- [ ] Priority ordering tests
- [ ] Time-budgeted execution tests
- [ ] Task cancellation tests

#### `tests/unit/core/Diagnostics.test.ts`
- [ ] Metric registration tests
- [ ] Report generation tests
- [ ] Threshold warning tests

#### `tests/unit/core/Assert.test.ts`
- [ ] All assertion types tested
- [ ] Error messages verified
- [ ] Type narrowing verified

**Verification:**
- [ ] All 8 test files created
- [ ] Coverage > 95% for core module
- [ ] All tests pass

---

### Task 2.2: Math Module Tests

**Target Coverage:** 100%

**Test Files to Create:**

#### `tests/unit/math/Vector2.test.ts`
- [ ] Construction tests
- [ ] Basic operations (add, sub, mul, scale, dot, cross)
- [ ] Length and normalization tests
- [ ] Lerp and angle tests
- [ ] Rotate and perpendicular tests
- [ ] Edge cases (zero vector, very large values)

#### `tests/unit/math/Vector3.test.ts`
- [ ] Construction tests
- [ ] Basic operations (add, sub, mul, scale, dot, cross)
- [ ] Length and normalization tests
- [ ] Lerp and slerp tests
- [ ] Project, reject, reflect tests
- [ ] Matrix/quaternion application tests
- [ ] Edge cases

#### `tests/unit/math/Vector4.test.ts`
- [ ] Construction tests
- [ ] Basic operations
- [ ] Swizzle accessors tests
- [ ] Perspective divide tests

#### `tests/unit/math/Matrix3.test.ts`
- [ ] Construction tests
- [ ] Multiplication tests
- [ ] Transpose and invert tests
- [ ] Determinant tests
- [ ] Transform extraction tests
- [ ] Normal matrix tests

#### `tests/unit/math/Matrix4.test.ts`
- [ ] Construction tests
- [ ] Multiplication tests
- [ ] Transpose and invert tests
- [ ] Decomposition tests (TRS)
- [ ] Transform builders (translation, rotation, scale)
- [ ] View/projection matrix tests (lookAt, perspective, orthographic)
- [ ] Edge cases (near-zero determinant, very large values)

#### `tests/unit/math/Quaternion.test.ts`
- [ ] Construction tests
- [ ] Multiplication tests
- [ ] Conjugate and invert tests
- [ ] Normalization tests
- [ ] Slerp tests (shortest path)
- [ ] Conversion tests (axis-angle, euler, matrix)
- [ ] Edge cases (gimbal lock)

#### `tests/unit/math/Color.test.ts`
- [ ] Construction tests
- [ ] Color space conversions (sRGB ↔ Linear)
- [ ] HSL/HSV conversions
- [ ] Hex and CSS parsing
- [ ] Operations (add, multiply, lerp)

#### `tests/unit/math/Box3.test.ts`
- [ ] Construction tests
- [ ] Contains/intersects tests
- [ ] Union and intersection tests
- [ ] Matrix transformation tests

#### `tests/unit/math/Sphere.test.ts`
- [ ] Construction tests
- [ ] Contains/intersects tests
- [ ] Set from points tests (Ritter's algorithm)
- [ ] Matrix transformation tests

#### `tests/unit/math/Plane.test.ts`
- [ ] Construction tests
- [ ] Distance calculations
- [ ] Intersection tests
- [ ] Matrix transformation tests

#### `tests/unit/math/Ray.test.ts`
- [ ] Construction tests
- [ ] Intersection tests (sphere, box, plane, triangle)
- [ ] Distance calculations
- [ ] Camera ray generation tests

#### `tests/unit/math/Frustum.test.ts`
- [ ] Construction from projection matrix
- [ ] Culling tests (point, box, sphere)
- [ ] Corner extraction tests

#### `tests/unit/math/Transform.test.ts`
- [ ] Construction tests
- [ ] Matrix computation tests
- [ ] Hierarchy tests
- [ ] World matrix updates
- [ ] LookAt tests

#### `tests/unit/math/Spline.test.ts`
- [ ] Construction tests
- [ ] Point evaluation tests
- [ ] Tangent calculation tests
- [ ] Arc-length parameterization tests
- [ ] Different spline types (Catmull-Rom, Bezier, B-spline)

#### `tests/unit/math/Interpolation.test.ts`
- [ ] Lerp tests
- [ ] Smoothstep tests
- [ ] Angle lerp tests
- [ ] SmoothDamp tests
- [ ] Bezier/Catmull-Rom tests

#### `tests/unit/math/Easing.test.ts`
- [ ] All 30 standard easing functions tested
- [ ] Bezier easing tests
- [ ] Keyframe easing tests

#### `tests/unit/math/RandomMath.test.ts`
- [ ] Point generation tests (circle, sphere, box)
- [ ] Direction generation tests
- [ ] Noise function tests (Perlin, Simplex, Worley)
- [ ] Distribution quality tests

#### `tests/unit/math/MathConstants.test.ts`
- [ ] All constants verified
- [ ] Utility functions tested

**Verification:**
- [ ] All 18 test files created
- [ ] Coverage = 100% for math module
- [ ] All tests pass
- [ ] Numerical precision verified

---

## Part 3: Unit Tests - ECS & Rendering Modules

### Task 3.1: ECS Module Tests

**Target Coverage:** 95%

**Test Files to Create:**

#### `tests/unit/ecs/World.test.ts`
- [ ] Entity management tests
  - [ ] Creates entities with unique IDs
  - [ ] Destroys entities and recycles IDs
  - [ ] Handles bulk entity creation
  - [ ] Validates entity existence
- [ ] Component operations tests
  - [ ] Adds component to entity
  - [ ] Removes component from entity
  - [ ] Gets component from entity
  - [ ] Checks component existence
- [ ] Query tests
  - [ ] Creates query with component requirements
  - [ ] Returns matching entities
  - [ ] Updates query on entity changes
  - [ ] Handles complex queries with exclusions
  - [ ] Caches query results
- [ ] System tests
  - [ ] Registers systems
  - [ ] Executes systems in priority order
  - [ ] Passes delta time to systems
  - [ ] Enables/disables systems
- [ ] Performance tests
  - [ ] Handles 100k entities
  - [ ] Iterates 100k entities under 1ms
  - [ ] Archetypes reduce iteration overhead

#### `tests/unit/ecs/Entity.test.ts`
- [ ] Entity ID generation tests
- [ ] Entity validation tests
- [ ] Entity comparison tests

#### `tests/unit/ecs/Component.test.ts`
- [ ] Component registration tests
- [ ] Component type definition tests
- [ ] Component serialization tests

#### `tests/unit/ecs/System.test.ts`
- [ ] System lifecycle tests
- [ ] System execution tests
- [ ] System dependencies tests

#### `tests/unit/ecs/Archetype.test.ts`
- [ ] Archetype creation tests
- [ ] Entity storage tests
- [ ] Component array access tests
- [ ] Entity movement between archetypes

#### `tests/unit/ecs/Query.test.ts`
- [ ] Query creation tests
- [ ] Query iteration tests
- [ ] Query filtering tests
- [ ] Query caching tests

#### `tests/unit/ecs/ComponentStore.test.ts`
- [ ] Component pooling tests
- [ ] Component creation/release tests

#### `tests/unit/ecs/SystemScheduler.test.ts`
- [ ] System scheduling tests
- [ ] Dependency resolution tests
- [ ] Phase execution tests

#### `tests/unit/ecs/CommandBuffer.test.ts`
- [ ] Command buffering tests
- [ ] Command execution tests
- [ ] Deferred operations tests

#### `tests/unit/ecs/ECSSerializer.test.ts`
- [ ] Serialization tests
- [ ] Deserialization tests
- [ ] Round-trip tests

**Plus tests for all ECS components (~15 test files):**
- [ ] `TransformComponent.test.ts`
- [ ] `MeshComponent.test.ts`
- [ ] `MaterialComponent.test.ts`
- [ ] `CameraComponent.test.ts`
- [ ] `LightComponent.test.ts`
- [ ] `RigidBodyComponent.test.ts`
- [ ] `ColliderComponent.test.ts`
- [ ] `AudioSourceComponent.test.ts`
- [ ] `NetworkIdentityComponent.test.ts`
- [ ] `ScriptComponent.test.ts`
- [ ] `TagComponent.test.ts`
- [ ] `ParticleEmitterComponent.test.ts`
- [ ] `VolumeComponent.test.ts`
- [ ] `TerrainChunkComponent.test.ts`
- [ ] `VoxelChunkComponent.test.ts`

**Plus tests for all ECS systems (~10 test files):**
- [ ] `TransformSystem.test.ts`
- [ ] `RenderSystem.test.ts`
- [ ] `CullingSystem.test.ts`
- [ ] `AnimationSystem.test.ts`
- [ ] `PhysicsSystem.test.ts`
- [ ] `AISystem.test.ts`
- [ ] `AudioSystem.test.ts`
- [ ] `NetReplicationSystem.test.ts`
- [ ] `UISystem.test.ts`
- [ ] `ScriptingSystem.test.ts`

**Verification:**
- [ ] All ~24 test files created
- [ ] Coverage > 95% for ECS module
- [ ] All tests pass
- [ ] Performance tests meet targets

---

### Task 3.2: Rendering Module Tests

**Target Coverage:** 90%

**Test Files to Create:**

#### `tests/unit/rendering/Renderer.test.ts`
- [ ] Initialization tests
- [ ] Frame lifecycle tests
- [ ] Resize tests
- [ ] Quality preset tests
- [ ] Statistics collection tests

#### `tests/unit/rendering/RenderGraph.test.ts`
- [ ] Construction tests
- [ ] Pass addition/removal tests
- [ ] Resource declaration tests
- [ ] Compilation tests (topological sort, cycle detection)
- [ ] Execution tests
- [ ] Resource management tests

#### `tests/unit/rendering/Camera.test.ts`
- [ ] Perspective camera tests
- [ ] Orthographic camera tests
- [ ] View matrix tests
- [ ] Projection matrix tests
- [ ] Frustum extraction tests

#### `tests/unit/rendering/Mesh.test.ts`
- [ ] Geometry creation tests
- [ ] Index buffer tests
- [ ] Vertex buffer tests
- [ ] Attribute tests

#### `tests/unit/rendering/Texture.test.ts`
- [ ] Texture creation tests
- [ ] Format tests
- [ ] Mipmap generation tests
- [ ] Upload tests

#### `tests/unit/rendering/RenderTarget.test.ts`
- [ ] Render target creation tests
- [ ] Attachment tests
- [ ] Clear tests

#### `tests/unit/rendering/culling/FrustumCuller.test.ts`
- [ ] Sphere culling tests
- [ ] Box culling tests
- [ ] Performance tests (100k objects < 2ms)

#### `tests/unit/rendering/culling/OcclusionCuller.test.ts`
- [ ] Hi-Z building tests
- [ ] Occlusion query tests

#### `tests/unit/rendering/culling/LODSelector.test.ts`
- [ ] LOD selection tests
- [ ] Distance-based LOD tests

**Plus tests for all render passes (~20 test files):**
- [ ] `GeometryPass.test.ts`
- [ ] `ShadowMapPass.test.ts`
- [ ] `LightingPass.test.ts`
- [ ] `SSAOPass.test.ts`
- [ ] `SSRPass.test.ts`
- [ ] `SSGIPass.test.ts`
- [ ] `BloomPass.test.ts`
- [ ] `DOFPass.test.ts`
- [ ] `MotionBlurPass.test.ts`
- [ ] `TAAPass.test.ts`
- [ ] `SMAAPass.test.ts`
- [ ] `FXAAPass.test.ts`
- [ ] `ColorGradingPass.test.ts`
- [ ] `VolumetricLightingPass.test.ts`
- [ ] `SkyPass.test.ts`
- [ ] `ForwardTransparentPass.test.ts`
- [ ] `OceanPass.test.ts`
- [ ] `TerrainPass.test.ts`
- [ ] `VoxelPass.test.ts`
- [ ] `ParticlePass.test.ts`

**Verification:**
- [ ] All ~30 test files created
- [ ] Coverage > 90% for rendering module
- [ ] All tests pass
- [ ] Visual output verified where applicable

---

## Part 4: Unit Tests - Physics & Animation Modules

### Task 4.1: Physics Module Tests

**Target Coverage:** 90%

**Test Files to Create:**

#### `tests/unit/physics/PhysicsWorld.test.ts`
- [ ] Simulation tests
  - [ ] Steps simulation at fixed rate
  - [ ] Applies gravity correctly
  - [ ] Handles sub-stepping
  - [ ] Synchronizes with render frame
- [ ] Rigid body tests
  - [ ] Creates static/dynamic/kinematic bodies
  - [ ] Applies forces and impulses
  - [ ] Respects mass and inertia
- [ ] Collision detection tests
  - [ ] Detects sphere-sphere collision
  - [ ] Detects box-box collision
  - [ ] Detects mesh-mesh collision
  - [ ] Generates contact points
  - [ ] Respects collision layers
- [ ] Query tests
  - [ ] Performs raycast
  - [ ] Performs spherecast
  - [ ] Performs overlap test
  - [ ] Filters by layer mask
- [ ] Constraint tests
  - [ ] Creates fixed/hinge/ball joints
  - [ ] Respects joint limits
  - [ ] Applies joint motors

#### `tests/unit/physics/RigidBody.test.ts`
- [ ] Body type tests
- [ ] Mass and inertia tests
- [ ] Force application tests
- [ ] Velocity tests
- [ ] Transform sync tests

#### `tests/unit/physics/Collider.test.ts`
- [ ] Shape creation tests (box, sphere, capsule, mesh)
- [ ] Collision detection tests
- [ ] Trigger tests
- [ ] Layer/mask tests

#### `tests/unit/physics/Raycast.test.ts`
- [ ] Raycast tests
- [ ] Spherecast tests
- [ ] Overlap tests
- [ ] Filter tests

#### `tests/unit/physics/Joints.test.ts`
- [ ] Fixed joint tests
- [ ] Hinge joint tests
- [ ] Ball joint tests
- [ ] Spring joint tests
- [ ] Joint limit tests

#### `tests/unit/physics/CharacterController.test.ts`
- [ ] Movement tests
- [ ] Collision response tests
- [ ] Step-up tests
- [ ] Slope handling tests

**Plus tests for physics backends (~5 test files):**
- [ ] `CannonBackend.test.ts`
- [ ] `RapierBackend.test.ts`
- [ ] `AmmoBackend.test.ts`

**Plus tests for collision shapes (~10 test files):**
- [ ] `BoxShape.test.ts`
- [ ] `SphereShape.test.ts`
- [ ] `CapsuleShape.test.ts`
- [ ] `MeshShape.test.ts`
- [ ] `ConvexHullShape.test.ts`

**Verification:**
- [ ] All ~30 test files created
- [ ] Coverage > 90% for physics module
- [ ] All tests pass
- [ ] Simulation stability verified

---

### Task 4.2: Animation Module Tests

**Target Coverage:** 85%

**Test Files to Create:**

#### `tests/unit/animation/AnimationClip.test.ts`
- [ ] Clip creation tests
- [ ] Track addition tests
- [ ] Duration tests
- [ ] Playback tests

#### `tests/unit/animation/AnimationMixer.test.ts`
- [ ] Mixer creation tests
- [ ] Clip playback tests
- [ ] Blending tests
- [ ] Time control tests

#### `tests/unit/animation/StateMachine.test.ts`
- [ ] State creation tests
- [ ] Transition tests
- [ ] Condition evaluation tests
- [ ] State entry/exit tests

#### `tests/unit/animation/BlendTree.test.ts`
- [ ] Blend tree creation tests
- [ ] Weight calculation tests
- [ ] Blend node tests

#### `tests/unit/animation/MotionMatching.test.ts`
- [ ] Database building tests
- [ ] Feature extraction tests
- [ ] Matching tests
- [ ] Blending tests
- [ ] Performance tests (searches 10000 poses under 1ms)

#### `tests/unit/animation/IKSolver.test.ts`
- [ ] TwoBoneIK tests
- [ ] FABRIK tests
- [ ] CCD tests
- [ ] FullBodyIK tests
- [ ] Performance tests (< 0.1ms per chain)

#### `tests/unit/animation/Skeleton.test.ts`
- [ ] Bone hierarchy tests
- [ ] Bone matrix calculation tests
- [ ] Skinning tests

#### `tests/unit/animation/SkinnedMesh.test.ts`
- [ ] Skinning calculation tests
- [ ] GPU skinning tests

**Plus tests for procedural animation (~5 test files):**
- [ ] `ProceduralWalk.test.ts`
- [ ] `SpringBones.test.ts`
- [ ] `JigglePhysics.test.ts`

**Verification:**
- [ ] All ~30 test files created
- [ ] Coverage > 85% for animation module
- [ ] All tests pass
- [ ] Visual output verified where applicable

---

## Part 5: Unit Tests - AI, World & Infrastructure

### Task 5.1: AI Module Tests

**Target Coverage:** 90%

**Test Files to Create:**

#### `tests/unit/ai/NavMesh.test.ts`
- [ ] NavMesh building tests
- [ ] Triangle generation tests
- [ ] Region generation tests
- [ ] Serialization tests

#### `tests/unit/ai/Pathfinder.test.ts`
- [ ] A* pathfinding tests
- [ ] Path smoothing tests
- [ ] Performance tests (100 pathfind requests per frame)

#### `tests/unit/ai/BehaviorTree.test.ts`
- [ ] Node execution tests
- [ ] Sequence/selector/parallel tests
- [ ] Decorator tests
- [ ] Blackboard tests

#### `tests/unit/ai/FSM.test.ts`
- [ ] State machine tests
- [ ] Transition tests
- [ ] State entry/exit tests

#### `tests/unit/ai/SteeringBehaviors.test.ts`
- [ ] Seek/flee tests
- [ ] Arrive tests
- [ ] Wander tests
- [ ] Obstacle avoidance tests

#### `tests/unit/ai/GOAP.test.ts`
- [ ] Planning tests
- [ ] Action execution tests
- [ ] Goal satisfaction tests

**Plus tests for other AI systems (~10 test files):**
- [ ] `HTNPlanner.test.ts`
- [ ] `UtilityAI.test.ts`
- [ ] `CrowdManager.test.ts`
- [ ] `NavMeshAgent.test.ts`
- [ ] `PerceptionSystem.test.ts`
- [ ] `MemorySystem.test.ts`
- [ ] `ONNXInference.test.ts`
- [ ] `MLAnimator.test.ts`

**Verification:**
- [ ] All ~20 test files created
- [ ] Coverage > 90% for AI module
- [ ] All tests pass

---

### Task 5.2: World Module Tests

**Target Coverage:** 85%

**Test Files to Create:**

#### `tests/unit/world/terrain/HeightmapTerrain.test.ts`
- [ ] Terrain generation tests
- [ ] Heightmap loading tests
- [ ] LOD tests
- [ ] Streaming tests

#### `tests/unit/world/terrain/TerrainLOD.test.ts`
- [ ] LOD selection tests
- [ ] LOD transition tests

#### `tests/unit/world/terrain/VegetationSystem.test.ts`
- [ ] Vegetation placement tests
- [ ] Culling tests

#### `tests/unit/world/voxel/VoxelChunk.test.ts`
- [ ] Chunk creation tests
- [ ] Block manipulation tests
- [ ] Meshing tests

#### `tests/unit/world/voxel/GreedyMesher.test.ts`
- [ ] Meshing algorithm tests
- [ ] Face merging tests

#### `tests/unit/world/ocean/FFTOcean.test.ts`
- [ ] FFT calculation tests
- [ ] Wave generation tests
- [ ] Performance tests (FFT @ 60 FPS)

**Plus tests for other world systems (~10 test files):**
- [ ] `WeatherSystem.test.ts`
- [ ] `WorldManager.test.ts`
- [ ] `StreamingSystem.test.ts`

**Verification:**
- [ ] All ~20 test files created
- [ ] Coverage > 85% for world module
- [ ] All tests pass

---

### Task 5.3: Infrastructure Module Tests

**Target Coverage:** 85%

**Test Files to Create:**

#### `tests/unit/infrastructure/network/NetworkManager.test.ts`
- [ ] Connection tests
- [ ] Message sending tests
- [ ] State sync tests

#### `tests/unit/infrastructure/network/Replication.test.ts`
- [ ] Entity replication tests
- [ ] Component sync tests

#### `tests/unit/infrastructure/network/Prediction.test.ts`
- [ ] Client prediction tests
- [ ] Reconciliation tests

#### `tests/unit/infrastructure/input/InputManager.test.ts`
- [ ] Input device tests
- [ ] Action mapping tests
- [ ] Context switching tests

#### `tests/unit/infrastructure/input/ActionMapping.test.ts`
- [ ] Action creation tests
- [ ] Binding tests
- [ ] Value reading tests

#### `tests/unit/infrastructure/ui/UIElement.test.ts`
- [ ] Element creation tests
- [ ] Layout tests
- [ ] Event handling tests

#### `tests/unit/infrastructure/ui/Layout.test.ts`
- [ ] Layout calculation tests
- [ ] Constraint tests

#### `tests/unit/infrastructure/ui/UIRenderer.test.ts`
- [ ] Rendering tests
- [ ] Batch rendering tests

#### `tests/unit/infrastructure/audio/AudioEngine.test.ts`
- [ ] Audio context tests
- [ ] Clip playback tests

#### `tests/unit/infrastructure/audio/SpatialAudio.test.ts`
- [ ] 3D positioning tests
- [ ] Attenuation tests

#### `tests/unit/infrastructure/assets/AssetLoader.test.ts`
- [ ] Asset loading tests
- [ ] Format support tests

#### `tests/unit/infrastructure/assets/AssetCache.test.ts`
- [ ] Caching tests
- [ ] LRU eviction tests

**Plus tests for other infrastructure modules (~15 test files):**
- [ ] Serialization tests
- [ ] Timeline tests
- [ ] Profiling tests
- [ ] Analytics tests
- [ ] Cloud service tests
- [ ] Localization tests

**Verification:**
- [ ] All ~30 test files created
- [ ] Coverage > 85% for infrastructure modules
- [ ] All tests pass

---

## Part 6: Unit Tests - Domain Packs & Tooling

### Task 6.1: Domain Pack Tests

**Target Coverage:** 80%

**Test Files to Create:**

#### `tests/unit/domain-packs/scientific/VectorFieldRenderer.test.ts`
- [ ] Field rendering tests
- [ ] Streamline tests

#### `tests/unit/domain-packs/medical/VolumeRenderer.test.ts`
- [ ] Volume rendering tests
- [ ] DICOM loading tests

#### `tests/unit/domain-packs/architecture/SectionCutRenderer.test.ts`
- [ ] Section cut tests
- [ ] BIM metadata tests

#### `tests/unit/domain-packs/xr/XRSession.test.ts`
- [ ] XR session tests
- [ ] Hand tracking tests

#### `tests/unit/domain-packs/ecommerce/TurntableController.test.ts`
- [ ] Turntable tests
- [ ] AR export tests

**Plus tests for other domain packs (~10 test files)**

**Verification:**
- [ ] All ~15 test files created
- [ ] Coverage > 80% for domain packs
- [ ] All tests pass

---

### Task 6.2: Tooling Tests

**Target Coverage:** 80%

**Test Files to Create:**

#### `tests/unit/tooling/editor/Selection.test.ts`
- [ ] Selection tests
- [ ] Multi-selection tests

#### `tests/unit/tooling/editor/History.test.ts`
- [ ] Undo/redo tests
- [ ] History stack tests

#### `tests/unit/tooling/editor/Gizmos.test.ts`
- [ ] Gizmo rendering tests
- [ ] Transform gizmo tests

#### `tests/unit/tooling/visual-scripting/Graph.test.ts`
- [ ] Graph creation tests
- [ ] Node connection tests

#### `tests/unit/tooling/visual-scripting/Executor.test.ts`
- [ ] Graph execution tests
- [ ] Node evaluation tests

**Plus tests for other tooling modules (~15 test files):**
- [ ] Timeline tests
- [ ] Profiling tests
- [ ] Analytics tests

**Verification:**
- [ ] All ~20 test files created
- [ ] Coverage > 80% for tooling modules
- [ ] All tests pass

---

## Part 7: Integration Tests

### Task 7.1: Cross-System Integration Tests

**Target:** ~10 integration test files

**Test Files to Create:**

#### `tests/integration/ecs-rendering.test.ts`
- [ ] Renders entities with MeshComponent
- [ ] Culls entities outside frustum
- [ ] Batches entities with same material
- [ ] Sorts transparent entities back-to-front

#### `tests/integration/physics-animation.test.ts`
- [ ] Ragdoll follows physics simulation
- [ ] Animated character collides with world
- [ ] IK targets track physics objects
- [ ] Cloth simulation attaches to animated skeleton

#### `tests/integration/ai-navigation.test.ts`
- [ ] Agents follow NavMesh paths
- [ ] Agents avoid each other with RVO
- [ ] Agents replan on obstacle change
- [ ] Behavior tree drives navigation

#### `tests/integration/network-replication.test.ts`
- [ ] Entity spawns on all clients
- [ ] Transform updates replicate
- [ ] Client prediction prevents lag
- [ ] State rollback corrects misprediction

#### `tests/integration/input-gameplay.test.ts`
- [ ] Input events trigger gameplay actions
- [ ] Input maps to physics forces
- [ ] Input contexts switch correctly

#### `tests/integration/audio-spatial.test.ts`
- [ ] Spatial audio positions correctly
- [ ] Audio follows moving objects
- [ ] Audio occludes correctly

#### `tests/integration/full-scene.test.ts`
- [ ] Loads and renders complete scene
- [ ] Runs 60 seconds without memory leak
- [ ] Maintains 60 FPS under load

**Plus additional integration tests (~3 test files):**
- [ ] `world-rendering.test.ts`
- [ ] `animation-rendering.test.ts`
- [ ] `physics-rendering.test.ts`

**Verification:**
- [ ] All ~10 integration test files created
- [ ] All integration tests pass
- [ ] Cross-system interactions verified

---

## Part 8: Performance Benchmarks

### Task 8.1: Performance Benchmark Suite

**Target:** ~10 benchmark files

**Test Files to Create:**

#### `tests/performance/benchmarks/ecs-throughput.bench.ts`
- [ ] Iterate 100k entities with 1 component (< 0.5ms)
- [ ] Iterate 100k entities with 5 components (< 2ms)
- [ ] Create/destroy 10k entities (< 10ms)
- [ ] Add/remove components 10k times (< 5ms)

#### `tests/performance/benchmarks/rendering-drawcalls.bench.ts`
- [ ] Render 10k draw calls (< 16.67ms for 60 FPS)
- [ ] Frustum cull 100k objects (< 2ms)
- [ ] Sort 10k transparent objects (< 1ms)
- [ ] GPU skinning 100 characters (< 5ms)

#### `tests/performance/benchmarks/physics-simulation.bench.ts`
- [ ] Simulate 1000 rigid bodies (< 16.67ms for 60 FPS)
- [ ] Collision detection 1000 pairs (< 1ms)
- [ ] Raycast 1000 queries (< 1ms)

#### `tests/performance/benchmarks/animation-skinning.bench.ts`
- [ ] Skin 100 characters (< 5ms)
- [ ] Update 100 state machines (< 1ms)
- [ ] Motion matching search (< 1ms)

#### `tests/performance/benchmarks/ai-pathfinding.bench.ts`
- [ ] Pathfind 100 requests (< 16.67ms for 60 FPS)
- [ ] Update 1000 AI agents (< 16.67ms)

#### `tests/performance/benchmarks/particle-system.bench.ts`
- [ ] Update 1M particles (< 2ms)
- [ ] Render 1M particles (< 5ms)

**Plus additional benchmarks (~4 test files):**
- [ ] `terrain-rendering.bench.ts`
- [ ] `ocean-simulation.bench.ts`
- [ ] `ui-rendering.bench.ts`
- [ ] `audio-processing.bench.ts`

**Verification:**
- [ ] All ~10 benchmark files created
- [ ] All benchmarks meet performance targets
- [ ] Performance regression detection setup

---

## Part 9: Visual Regression Tests

### Task 9.1: Visual Regression Test Suite

**Target:** ~10 visual test files

**Test Files to Create:**

#### `tests/visual/pbr-materials.test.ts`
- [ ] Standard PBR material rendering
- [ ] Metallic/roughness workflow
- [ ] Normal mapping
- [ ] Emission

#### `tests/visual/lighting.test.ts`
- [ ] Directional light
- [ ] Point light
- [ ] Spot light
- [ ] Area light
- [ ] IBL

#### `tests/visual/shadows.test.ts`
- [ ] Cascaded shadow maps
- [ ] Point light shadows
- [ ] Spot light shadows
- [ ] Shadow quality levels

#### `tests/visual/post-processing.test.ts`
- [ ] Bloom
- [ ] SSAO
- [ ] SSR
- [ ] DOF
- [ ] Motion blur
- [ ] TAA

#### `tests/visual/ui.test.ts`
- [ ] UI rendering
- [ ] Layout systems
- [ ] Text rendering

**Plus additional visual tests (~5 test files):**
- [ ] `animation.test.ts`
- [ ] `particles.test.ts`
- [ ] `terrain.test.ts`
- [ ] `ocean.test.ts`
- [ ] `weather.test.ts`

**Golden Images:**
- [ ] Create golden image directory structure
- [ ] Generate initial golden images
- [ ] Setup golden image comparison tool

**Verification:**
- [ ] All ~10 visual test files created
- [ ] Golden images generated
- [ ] Visual comparison tool configured
- [ ] All visual tests pass

---

## Part 10: Test Verification & CI Integration

### Task 10.1: Verify All Tests Pass

**Verification Checklist:**
- [ ] All unit tests pass (150+ test files)
- [ ] All integration tests pass (10+ test files)
- [ ] All performance benchmarks meet targets (10+ test files)
- [ ] All visual regression tests pass (10+ test files)
- [ ] Total test count: ~180 test files

**Commands:**
```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test suite
npm test -- unit/core
npm test -- integration
npm test -- performance
npm test -- visual
```

---

### Task 10.2: Coverage Reporting

**Coverage Targets:**
- [ ] Overall coverage > 85%
- [ ] Core module > 95%
- [ ] Math module = 100%
- [ ] ECS module > 95%
- [ ] Rendering module > 90%
- [ ] Physics module > 90%
- [ ] Animation module > 85%
- [ ] AI module > 90%
- [ ] Infrastructure modules > 85%

**Coverage Report:**
- [ ] Generate HTML coverage report
- [ ] Generate JSON coverage report
- [ ] Verify coverage thresholds met
- [ ] Document coverage gaps

---

### Task 10.3: CI/CD Integration

**CI Configuration:** `.github/workflows/test.yml`

```yaml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test -- --coverage
      - uses: codecov/codecov-action@v3
        with:
          files: ./coverage/coverage-final.json
```

**Verification Checklist:**
- [ ] CI configuration created
- [ ] Tests run on push/PR
- [ ] Coverage uploaded to codecov
- [ ] Test results visible in PRs

---

### Task 10.4: Test Documentation

**Documentation to Create:**
- [ ] Test structure documentation
- [ ] How to write tests guide
- [ ] How to run tests guide
- [ ] Coverage interpretation guide
- [ ] Performance benchmark guide
- [ ] Visual regression test guide

---

## Execution Checklist

### Phase H.1: Test Infrastructure
- [ ] Task 1.1: Setup Test Framework
- [ ] Task 1.2: Create Test Utilities
- [ ] Task 1.3: Create Test Fixtures

### Phase H.2: Unit Tests - Core & Math
- [ ] Task 2.1: Core Module Tests (8 files)
- [ ] Task 2.2: Math Module Tests (18 files)

### Phase H.3: Unit Tests - ECS & Rendering
- [ ] Task 3.1: ECS Module Tests (24 files)
- [ ] Task 3.2: Rendering Module Tests (30 files)

### Phase H.4: Unit Tests - Physics & Animation
- [ ] Task 4.1: Physics Module Tests (30 files)
- [ ] Task 4.2: Animation Module Tests (30 files)

### Phase H.5: Unit Tests - AI, World & Infrastructure
- [ ] Task 5.1: AI Module Tests (20 files)
- [ ] Task 5.2: World Module Tests (20 files)
- [ ] Task 5.3: Infrastructure Module Tests (30 files)

### Phase H.6: Unit Tests - Domain Packs & Tooling
- [ ] Task 6.1: Domain Pack Tests (15 files)
- [ ] Task 6.2: Tooling Tests (20 files)

### Phase H.7: Integration Tests
- [ ] Task 7.1: Cross-System Integration Tests (10 files)

### Phase H.8: Performance Benchmarks
- [ ] Task 8.1: Performance Benchmark Suite (10 files)

### Phase H.9: Visual Regression Tests
- [ ] Task 9.1: Visual Regression Test Suite (10 files)

### Phase H.10: Test Verification & CI
- [ ] Task 10.1: Verify All Tests Pass
- [ ] Task 10.2: Coverage Reporting
- [ ] Task 10.3: CI/CD Integration
- [ ] Task 10.4: Test Documentation

---

## Success Criteria

**Phase H is complete when:**

1. ✅ **All ~180 test files created**
2. ✅ **All unit tests pass** (150+ files)
3. ✅ **All integration tests pass** (10+ files)
4. ✅ **All performance benchmarks meet targets** (10+ files)
5. ✅ **All visual regression tests pass** (10+ files)
6. ✅ **Overall coverage > 85%**
7. ✅ **Module-specific coverage targets met**
8. ✅ **CI/CD integration working**
9. ✅ **Test documentation complete**
10. ✅ **Test suite ready for continuous use**

---

## Test File Count Summary

| Category | Test Files | Coverage Target |
|----------|-----------|-----------------|
| Core | 8 | 95% |
| Math | 18 | 100% |
| ECS | 24 | 95% |
| Rendering | 30 | 90% |
| Physics | 30 | 90% |
| Animation | 30 | 85% |
| AI | 20 | 90% |
| World | 20 | 85% |
| Infrastructure | 30 | 85% |
| Domain Packs | 15 | 80% |
| Tooling | 20 | 80% |
| Integration | 10 | N/A |
| Performance | 10 | N/A |
| Visual | 10 | N/A |
| **TOTAL** | **~285** | **85%+** |

---

## Notes

- **Follow PRD-Final-11-Testing-Phases.md** for detailed test requirements
- **Use test utilities** from `tests/utils/` for consistency
- **Mock external dependencies** (WebGL, WebGPU, AudioContext)
- **Test edge cases** (zero values, very large values, NaN, Infinity)
- **Verify performance targets** are met
- **Generate golden images** for visual regression tests
- **Document test coverage gaps** for future improvement

---

**READY TO EXECUTE PHASE H!**

This phase implements the comprehensive test suite ensuring G3D 5.0 is thoroughly tested and production-ready.

