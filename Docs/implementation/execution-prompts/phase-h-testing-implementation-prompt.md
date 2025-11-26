# Phase H: Testing Implementation - REVISED Execution Prompt

## Overview

**Phase:** H - Comprehensive Test Suite Implementation  
**Status:** Post-Integration Phase (Phase G Complete)  
**Purpose:** Implement complete test suite per `PRD-Final-11-Testing-Phases.md`  
**Current State:** ~6% Complete (17/285 test files)  
**Reference Document:** `Docs/prd/prd-final-11-testing-phases.md`

**This phase implements:**
- ❌ Unit tests for all modules (~150 test files) - **0.7% complete (1/150)**
- ✅ Integration tests for cross-system interactions (~10 test files) - **100% complete**
- ❌ Performance benchmarks (~10 test files) - **0% complete**
- ❌ Visual regression tests (~10 test files) - **0% complete**
- ⚠️ Test infrastructure and fixtures - **60% complete**
- ⚠️ Coverage reporting and CI integration - **Partial**
- **Total Required: ~285 test files**  
- **Current: ~17 test files**  
- **Remaining: ~268 test files**

---

## Current State Assessment

### ✅ What's Already Done

1. **Test Infrastructure (60% Complete)**
   - ✅ Vitest installed and configured (`vitest.config.ts` exists)
   - ✅ Test scripts configured (`test`, `test:watch`, `test:coverage`)
   - ✅ Test utilities created (`src/tests/utils/MockCanvas.ts`, `TestHelpers.ts`)
   - ⚠️ Test fixtures directory structure needed
   - ⚠️ Golden images directory needed

2. **Integration Tests (100% Complete)** ✅
   - ✅ `DataFlowTest.ts` - Data flow integration tests (7 tests)
   - ✅ `SystemOrderTest.ts` - System execution order tests
   - ✅ `ECSIntegrationTest.ts` - ECS integration tests
   - ✅ `RenderingIntegration.ts` - Rendering integration
   - ✅ `PhysicsIntegration.ts` - Physics integration
   - ✅ `AnimationIntegration.ts` - Animation integration
   - ✅ `AIIntegration.ts` - AI integration
   - ✅ `AudioIntegration.ts` - Audio integration
   - ✅ `NetworkIntegration.ts` - Network integration
   - ✅ `CoreIntegration.ts` - Core integration
   - ✅ `CompleteGameLoop.test.ts` - E2E test

3. **Unit Tests (0.7% Complete)** ❌
   - ✅ `src/core/__tests__/Panic.test.ts` - Only 1 unit test exists
   - ❌ **149 unit test files missing**

---

## Execution Strategy: Phased Approach

### **Phase H.1: Minimum Viable Testing (MVP)** 🔴 CRITICAL
**Timeline:** 11-15 weeks (~3-4 months)  
**Goal:** Achieve 60-70% overall coverage, test critical systems  
**Priority:** Must-have for production readiness

### **Phase H.2: Complete Test Suite** 🟡 HIGH PRIORITY
**Timeline:** Additional 8-9 weeks (~2-2.5 months)  
**Goal:** Achieve 85%+ overall coverage, complete all test types  
**Priority:** Should-have for production-grade quality

---

## Phase H.1: Minimum Viable Testing (MVP) 🔴

### Objective
Implement tests for **critical modules only** to ensure production readiness. Focus on modules that are:
- Foundation of the engine (Math, Core, ECS)
- User-facing and performance-critical (Rendering, Physics)
- Required for basic functionality

### Success Criteria
- ✅ 60-70% overall coverage
- ✅ 100% Math module coverage
- ✅ 95% Core module coverage
- ✅ 95% ECS module coverage
- ✅ 90% Rendering module coverage
- ✅ 90% Physics module coverage
- ✅ All critical path tests passing
- ✅ CI/CD integration working

---

## Part 1: Complete Test Infrastructure Setup

### Task 1.1: Finalize Test Framework Configuration

**File:** `vitest.config.ts` (exists, needs verification)

**Required Configuration:**
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts', 'tests/**/*.spec.ts', 'src/**/__tests__/**/*.test.ts'],
    exclude: ['node_modules/', 'dist/', '**/*.bench.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html', 'lcov'],
      exclude: [
        'node_modules/',
        'tests/',
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/index.ts',
        '**/*.d.ts',
        'src/tests/**',
      ],
      thresholds: {
        lines: 60,      // MVP: Lower threshold initially
        functions: 60,
        branches: 55,
        statements: 60,
      },
      // Per-module thresholds for critical modules
      '100': {
        'src/math/**': { lines: 100 },      // Math: 100%
        'src/core/**': { lines: 95 },        // Core: 95%
        'src/ecs/**': { lines: 95 },         // ECS: 95%
        'src/rendering/**': { lines: 90 },   // Rendering: 90%
        'src/physics/**': { lines: 90 },     // Physics: 90%
      },
    },
    testTimeout: 10000,
    hookTimeout: 10000,
  },
});
```

**Verification Checklist:**
- [ ] Verify `vitest.config.ts` exists and is properly configured
- [ ] Test scripts work (`pnpm test`, `pnpm test:watch`, `pnpm test:coverage`)
- [ ] Coverage reporting generates HTML reports
- [ ] Test environment properly configured for DOM APIs

---

### Task 1.2: Complete Test Utilities

**File:** `tests/utils/test-helpers.ts` (exists, needs expansion)

**Current State:** Basic utilities exist (`MockCanvas.ts`, `TestHelpers.ts`)

**Required Additions:**
- [ ] `createMockWebGL2Context()` - Mock WebGL2RenderingContext
- [ ] `createMockWebGPUDevice()` - Mock GPUDevice
- [ ] `createMockAudioContext()` - Mock AudioContext
- [ ] `waitForFrame()` - Wait for next animation frame
- [ ] `createTestEntity()` - Create test entity with components
- [ ] `createTestWorld()` - Create test ECS world
- [ ] `createTestRenderer()` - Create test renderer instance
- [ ] `createTestPhysicsWorld()` - Create test physics world
- [ ] `expectVector3Close()` - Vector3 assertion with epsilon
- [ ] `expectMatrix4Close()` - Matrix4 assertion with epsilon
- [ ] `expectQuaternionClose()` - Quaternion assertion with epsilon
- [ ] `expectColorClose()` - Color assertion with epsilon
- [ ] `mockTime()` - Mock performance.now() for deterministic tests
- [ ] `createMockFile()` - Mock File/Blob for asset loading tests
- [ ] `createMockImage()` - Mock Image for texture loading tests

**Example Implementation:**
```typescript
import { Vector3 } from '../../src/math/Vector3';
import { Matrix4 } from '../../src/math/Matrix4';
import { Quaternion } from '../../src/math/Quaternion';
import { Color } from '../../src/math/Color';

const EPSILON = 1e-6;

export function expectVector3Close(
  actual: Vector3,
  expected: Vector3,
  epsilon: number = EPSILON
): void {
  expect(Math.abs(actual.x - expected.x)).toBeLessThan(epsilon);
  expect(Math.abs(actual.y - expected.y)).toBeLessThan(epsilon);
  expect(Math.abs(actual.z - expected.z)).toBeLessThan(epsilon);
}

export function expectMatrix4Close(
  actual: Matrix4,
  expected: Matrix4,
  epsilon: number = EPSILON
): void {
  for (let i = 0; i < 16; i++) {
    expect(Math.abs(actual.elements[i] - expected.elements[i])).toBeLessThan(epsilon);
  }
}

export function expectQuaternionClose(
  actual: Quaternion,
  expected: Quaternion,
  epsilon: number = EPSILON
): void {
  expect(Math.abs(actual.x - expected.x)).toBeLessThan(epsilon);
  expect(Math.abs(actual.y - expected.y)).toBeLessThan(epsilon);
  expect(Math.abs(actual.z - expected.z)).toBeLessThan(epsilon);
  expect(Math.abs(actual.w - expected.w)).toBeLessThan(epsilon);
}

export function mockTime(now: number = 0): () => void {
  const originalNow = performance.now;
  performance.now = () => now;
  
  return () => {
    performance.now = originalNow;
  };
}
```

---

### Task 1.3: Create Test Fixtures Directory Structure

**Directory:** `tests/fixtures/`

**Required Structure:**
```
tests/
├── fixtures/
│   ├── models/
│   │   ├── cube.gltf
│   │   ├── sphere.gltf
│   │   └── simple-scene.gltf
│   ├── textures/
│   │   ├── test-diffuse.png
│   │   ├── test-normal.png
│   │   └── test-roughness.png
│   ├── shaders/
│   │   ├── test-vertex.glsl
│   │   └── test-fragment.glsl
│   ├── audio/
│   │   └── test-sound.mp3
│   └── configs/
│       └── test-config.json
├── utils/
│   └── test-helpers.ts
└── visual/
    └── golden/          # For visual regression tests (Phase H.2)
```

**Verification Checklist:**
- [ ] `tests/fixtures/` directory created
- [ ] Subdirectories created (models, textures, shaders, audio, configs)
- [ ] Minimal test assets added (can be simple/placeholder files)

---

## Part 2: Unit Tests - Math Module 🔴 CRITICAL

**Priority:** 🔴 **HIGHEST** - Math is foundation of entire engine  
**Target Coverage:** 100%  
**Estimated Time:** 2-3 weeks  
**Test Files:** 18 files

### Why Critical
- All rendering, physics, and animation depend on math correctness
- Mathematical errors propagate throughout the engine
- 100% coverage target (highest of all modules)

### Task 2.1: Vector Tests (4 files)

**Files to Create:**
- [ ] `tests/unit/math/Vector2.test.ts` - Vector2 operations
- [ ] `tests/unit/math/Vector3.test.ts` - Vector3 operations
- [ ] `tests/unit/math/Vector4.test.ts` - Vector4 operations
- [ ] `tests/unit/math/Color.test.ts` - Color operations

**Test Coverage Requirements:**

#### Vector2.test.ts
- [ ] Constructor (default, with values, copy)
- [ ] Basic operations (add, subtract, multiply, divide)
- [ ] Scalar operations (scale, multiplyScalar, divideScalar)
- [ ] Dot product, cross product (with Vector3)
- [ ] Length operations (length, lengthSq, normalize)
- [ ] Distance operations (distanceTo, distanceToSquared)
- [ ] Angle operations (angle, angleTo)
- [ ] Clamping (clamp, clampLength)
- [ ] Lerp and slerp
- [ ] Equality checks (equals, equalsEpsilon)
- [ ] Edge cases (zero vector, unit vectors, very large values, NaN, Infinity)

#### Vector3.test.ts
- [ ] All Vector2 tests plus:
- [ ] Cross product (with Vector3)
- [ ] Reflect and refract
- [ ] Project and reject
- [ ] Spherical coordinates (toSpherical, fromSpherical)
- [ ] Euler angles (toEuler, fromEuler)
- [ ] Transform operations (applyMatrix3, applyMatrix4, applyQuaternion)

#### Vector4.test.ts
- [ ] All Vector3 tests plus:
- [ ] Homogeneous coordinates (w component)
- [ ] Perspective divide

#### Color.test.ts
- [ ] Constructor (RGB, RGBA, hex, CSS)
- [ ] Color space conversions (RGB, HSL, HSV)
- [ ] Color operations (add, multiply, lerp)
- [ ] Gamma correction
- [ ] Color constants (white, black, red, green, blue, etc.)

**Example Test Structure:**
```typescript
import { describe, it, expect } from 'vitest';
import { Vector3 } from '../../../src/math/Vector3';
import { expectVector3Close } from '../../utils/test-helpers';

describe('Vector3', () => {
  describe('constructor', () => {
    it('should create vector with default values', () => {
      const v = new Vector3();
      expect(v.x).toBe(0);
      expect(v.y).toBe(0);
      expect(v.z).toBe(0);
    });

    it('should create vector with specified values', () => {
      const v = new Vector3(1, 2, 3);
      expect(v.x).toBe(1);
      expect(v.y).toBe(2);
      expect(v.z).toBe(3);
    });
  });

  describe('add', () => {
    it('should add two vectors', () => {
      const a = new Vector3(1, 2, 3);
      const b = new Vector3(4, 5, 6);
      a.add(b);
      expectVector3Close(a, new Vector3(5, 7, 9));
    });

    it('should handle zero vector', () => {
      const a = new Vector3(1, 2, 3);
      const zero = new Vector3(0, 0, 0);
      a.add(zero);
      expectVector3Close(a, new Vector3(1, 2, 3));
    });
  });

  // ... more tests
});
```

---

### Task 2.2: Matrix Tests (4 files)

**Files to Create:**
- [ ] `tests/unit/math/Matrix3.test.ts` - 3x3 matrix operations
- [ ] `tests/unit/math/Matrix4.test.ts` - 4x4 matrix operations
- [ ] `tests/unit/math/MatrixUtils.test.ts` - Matrix utilities
- [ ] `tests/unit/math/Transform.test.ts` - Transform operations

**Test Coverage Requirements:**

#### Matrix3.test.ts
- [ ] Constructor (identity, from array, from Matrix4)
- [ ] Basic operations (add, subtract, multiply, multiplyScalar)
- [ ] Matrix multiplication (multiplyMatrices, premultiply, postmultiply)
- [ ] Determinant and inverse
- [ ] Transpose
- [ ] Scale, rotation, translation extraction
- [ ] Decomposition (getScale, getRotation, getPosition)
- [ ] Equality checks
- [ ] Edge cases (singular matrices, zero matrix, identity)

#### Matrix4.test.ts
- [ ] All Matrix3 tests plus:
- [ ] Projection matrices (perspective, orthographic, frustum)
- [ ] View matrices (lookAt)
- [ ] Compose/decompose (from position, rotation, scale)
- [ ] Transform operations (transformPoint, transformVector, transformDirection)
- [ ] Extract projection parameters
- [ ] Extract view parameters

**Example Test Structure:**
```typescript
import { describe, it, expect } from 'vitest';
import { Matrix4 } from '../../../src/math/Matrix4';
import { Vector3 } from '../../../src/math/Vector3';
import { Quaternion } from '../../../src/math/Quaternion';
import { expectMatrix4Close } from '../../utils/test-helpers';

describe('Matrix4', () => {
  describe('constructor', () => {
    it('should create identity matrix', () => {
      const m = new Matrix4();
      expect(m.elements[0]).toBe(1);
      expect(m.elements[5]).toBe(1);
      expect(m.elements[10]).toBe(1);
      expect(m.elements[15]).toBe(1);
    });
  });

  describe('makePerspective', () => {
    it('should create perspective projection matrix', () => {
      const m = new Matrix4();
      m.makePerspective(75, 16/9, 0.1, 1000);
      // Verify matrix elements
    });
  });

  // ... more tests
});
```

---

### Task 2.3: Quaternion Tests (2 files)

**Files to Create:**
- [ ] `tests/unit/math/Quaternion.test.ts` - Quaternion operations
- [ ] `tests/unit/math/Euler.test.ts` - Euler angle conversions

**Test Coverage Requirements:**

#### Quaternion.test.ts
- [ ] Constructor (identity, from axis-angle, from euler, from matrix)
- [ ] Basic operations (add, multiply, conjugate, inverse)
- [ ] Normalization (normalize, length, lengthSq)
- [ ] Rotation operations (setFromAxisAngle, setFromEuler, setFromRotationMatrix)
- [ ] Slerp and nlerp
- [ ] To/from euler conversions
- [ ] To/from matrix conversions
- [ ] Transform operations (multiplyVector3)
- [ ] Equality checks
- [ ] Edge cases (identity quaternion, 180-degree rotations, gimbal lock)

---

### Task 2.4: Geometry Tests (4 files)

**Files to Create:**
- [ ] `tests/unit/math/Box3.test.ts` - Axis-aligned bounding box
- [ ] `tests/unit/math/Sphere.test.ts` - Sphere geometry
- [ ] `tests/unit/math/Plane.test.ts` - Plane geometry
- [ ] `tests/unit/math/Ray.test.ts` - Ray geometry

**Test Coverage Requirements:**

#### Box3.test.ts
- [ ] Constructor (empty, from points, from center and size)
- [ ] Set operations (setFromPoints, setFromCenterAndSize, setFromObject)
- [ ] Expand operations (expandByPoint, expandByScalar, expandByVector)
- [ ] Intersection tests (intersectsBox, intersectsSphere, intersectsPlane)
- [ ] Contains tests (containsPoint, containsBox, containsSphere)
- [ ] Clamp operations (clampPoint)
- [ ] Distance operations (distanceToPoint)
- [ ] Union operations (union)
- [ ] Edge cases (empty box, zero-size box, infinite box)

#### Sphere.test.ts
- [ ] Constructor (default, from center and radius)
- [ ] Set operations (setFromPoints, setFromBox)
- [ ] Intersection tests (intersectsBox, intersectsSphere, intersectsPlane)
- [ ] Contains tests (containsPoint)
- [ ] Distance operations (distanceToPoint)
- [ ] Edge cases (zero radius, very large radius)

#### Plane.test.ts
- [ ] Constructor (from normal and constant, from normal and point)
- [ ] Normalize operations
- [ ] Distance operations (distanceToPoint)
- [ ] Project operations (projectPoint)
- [ ] Intersection tests (intersectsBox, intersectsSphere, intersectsRay)
- [ ] Edge cases (zero normal, infinite plane)

#### Ray.test.ts
- [ ] Constructor (from origin and direction)
- [ ] Distance operations (distanceToPoint, distanceSqToPoint)
- [ ] Intersection tests (intersectsBox, intersectsSphere, intersectsPlane)
- [ ] Closest point operations (closestPointToPoint)
- [ ] Edge cases (zero direction, parallel rays)

---

### Task 2.5: Math Utilities Tests (4 files)

**Files to Create:**
- [ ] `tests/unit/math/MathUtils.test.ts` - Math utilities
- [ ] `tests/unit/math/Interpolation.test.ts` - Interpolation functions
- [ ] `tests/unit/math/Easing.test.ts` - Easing functions
- [ ] `tests/unit/math/Spline.test.ts` - Spline curves

**Test Coverage Requirements:**

#### MathUtils.test.ts
- [ ] Clamp, lerp, smoothstep
- [ ] Deg/rad conversions
- [ ] Random number generation
- [ ] Precision comparisons (isZero, isEqual)
- [ ] Edge cases (NaN, Infinity, very large/small numbers)

---

## Part 3: Unit Tests - Core Module 🔴 CRITICAL

**Priority:** 🔴 **CRITICAL** - Engine foundation  
**Target Coverage:** 95%  
**Estimated Time:** 1 week  
**Test Files:** 8 files  
**Current:** 1 file (`Panic.test.ts`)

### Task 3.1: Core System Tests (8 files)

**Files to Create:**
- [ ] `tests/unit/core/Engine.test.ts` - Engine lifecycle
- [ ] `tests/unit/core/Time.test.ts` - Time management
- [ ] `tests/unit/core/Logger.test.ts` - Logging system
- [ ] `tests/unit/core/ObjectPool.test.ts` - Object pooling
- [ ] `tests/unit/core/EventBus.test.ts` - Event system
- [ ] `tests/unit/core/TaskScheduler.test.ts` - Task scheduling
- [ ] `tests/unit/core/Diagnostics.test.ts` - Diagnostics
- [ ] `tests/unit/core/Assert.test.ts` - Assertions

**Test Coverage Requirements:**

#### Engine.test.ts
- [ ] Engine creation (create, constructor)
- [ ] Initialization (init, await init)
- [ ] Lifecycle (start, stop, pause, resume)
- [ ] Update loop (fixed timestep, variable timestep)
- [ ] System registration (addSystem, removeSystem)
- [ ] Event hooks (onUpdate, onRender, onResize)
- [ ] Cleanup (dispose, destroy)
- [ ] Edge cases (double init, double start, cleanup without init)

#### Time.test.ts
- [ ] Time tracking (deltaTime, elapsedTime)
- [ ] Fixed timestep accumulator
- [ ] Frame rate limiting
- [ ] Time scaling (timeScale)
- [ ] Pause/unpause behavior
- [ ] Edge cases (very large deltaTime, zero deltaTime, negative deltaTime)

#### Logger.test.ts
- [ ] Log levels (debug, info, warn, error)
- [ ] Log formatting
- [ ] Log filtering
- [ ] Log output (console, file, custom)
- [ ] Context tracking
- [ ] Edge cases (circular references, very long messages)

#### ObjectPool.test.ts
- [ ] Pool creation and configuration
- [ ] Object acquisition (acquire)
- [ ] Object release (release)
- [ ] Pool growth (auto-expand)
- [ ] Pool cleanup (clear, dispose)
- [ ] Edge cases (release without acquire, double release)

#### EventBus.test.ts
- [ ] Event subscription (on, once)
- [ ] Event emission (emit)
- [ ] Event unsubscription (off)
- [ ] Event priority
- [ ] Event context
- [ ] Edge cases (circular events, unsubscribed events)

---

## Part 4: Unit Tests - ECS Module 🔴 CRITICAL

**Priority:** 🔴 **CRITICAL** - Core architecture  
**Target Coverage:** 95%  
**Estimated Time:** 2-3 weeks  
**Test Files:** 24 files

### Task 4.1: ECS Core Tests (8 files)

**Files to Create:**
- [ ] `tests/unit/ecs/World.test.ts` - World management
- [ ] `tests/unit/ecs/Entity.test.ts` - Entity operations
- [ ] `tests/unit/ecs/Component.test.ts` - Component base class
- [ ] `tests/unit/ecs/Archetype.test.ts` - Archetype system
- [ ] `tests/unit/ecs/Query.test.ts` - Query system
- [ ] `tests/unit/ecs/System.test.ts` - System base class
- [ ] `tests/unit/ecs/CommandBuffer.test.ts` - Command buffering
- [ ] `tests/unit/ecs/Serialization.test.ts` - ECS serialization

**Test Coverage Requirements:**

#### World.test.ts
- [ ] World creation and initialization
- [ ] Entity creation (createEntity, createEntities)
- [ ] Entity destruction (destroyEntity, destroyEntities)
- [ ] Component operations (addComponent, getComponent, removeComponent, hasComponent)
- [ ] Query creation and execution
- [ ] System registration and execution
- [ ] Command buffer flushing
- [ ] Edge cases (destroyed entities, invalid entities, component conflicts)

#### Query.test.ts
- [ ] Single component queries
- [ ] Multi-component queries (AND logic)
- [ ] Complex queries (all, any, none)
- [ ] Query iteration
- [ ] Query caching
- [ ] Query invalidation on component changes
- [ ] Edge cases (empty queries, queries with no matches)

#### Archetype.test.ts
- [ ] Archetype creation and lookup
- [ ] Component signature matching
- [ ] Entity archetype transitions
- [ ] Archetype storage
- [ ] Edge cases (empty archetypes, large archetypes)

---

### Task 4.2: ECS Component Tests (8 files)

**Files to Create:**
- [ ] `tests/unit/ecs/components/TransformComponent.test.ts`
- [ ] `tests/unit/ecs/components/HierarchyComponent.test.ts`
- [ ] `tests/unit/ecs/components/NameComponent.test.ts`
- [ ] `tests/unit/ecs/components/TagComponent.test.ts`
- [ ] `tests/unit/ecs/components/ActiveComponent.test.ts`
- [ ] `tests/unit/ecs/components/MeshComponent.test.ts`
- [ ] `tests/unit/ecs/components/CameraComponent.test.ts`
- [ ] `tests/unit/ecs/components/LightComponent.test.ts`

---

### Task 4.3: ECS System Tests (8 files)

**Files to Create:**
- [ ] `tests/unit/ecs/systems/TransformSystem.test.ts`
- [ ] `tests/unit/ecs/systems/HierarchySystem.test.ts`
- [ ] `tests/unit/ecs/systems/ActiveSystem.test.ts`
- [ ] `tests/unit/ecs/systems/RenderSystem.test.ts`
- [ ] `tests/unit/ecs/systems/CullingSystem.test.ts`
- [ ] `tests/unit/ecs/systems/PhysicsSystem.test.ts`
- [ ] `tests/unit/ecs/systems/AnimationSystem.test.ts`
- [ ] `tests/unit/ecs/systems/AISystem.test.ts`

---

## Part 5: Unit Tests - Rendering Module 🔴 CRITICAL

**Priority:** 🔴 **CRITICAL** - User-facing, performance-critical  
**Target Coverage:** 90%  
**Estimated Time:** 3-4 weeks  
**Test Files:** 30 files

### Task 5.1: Rendering Core Tests (10 files)

**Files to Create:**
- [ ] `tests/unit/rendering/Renderer.test.ts` - Renderer orchestration
- [ ] `tests/unit/rendering/WebGL2Renderer.test.ts` - WebGL2 backend
- [ ] `tests/unit/rendering/WebGPURenderer.test.ts` - WebGPU backend
- [ ] `tests/unit/rendering/GPUBuffer.test.ts` - GPU buffer management
- [ ] `tests/unit/rendering/GPUTexture.test.ts` - Texture management
- [ ] `tests/unit/rendering/GPUShader.test.ts` - Shader management
- [ ] `tests/unit/rendering/RenderGraph.test.ts` - Render graph
- [ ] `tests/unit/rendering/RenderPass.test.ts` - Render passes
- [ ] `tests/unit/rendering/Scene.test.ts` - Scene management
- [ ] `tests/unit/rendering/Camera.test.ts` - Camera system

---

### Task 5.2: Rendering Components Tests (10 files)

**Files to Create:**
- [ ] `tests/unit/rendering/Mesh.test.ts` - Mesh rendering
- [ ] `tests/unit/rendering/Geometry.test.ts` - Geometry management
- [ ] `tests/unit/rendering/Material.test.ts` - Material system
- [ ] `tests/unit/rendering/Light.test.ts` - Lighting system
- [ ] `tests/unit/rendering/Shadow.test.ts` - Shadow mapping
- [ ] `tests/unit/rendering/Culling.test.ts` - Culling system
- [ ] `tests/unit/rendering/Batching.test.ts` - Draw call batching
- [ ] `tests/unit/rendering/Instancing.test.ts` - GPU instancing
- [ ] `tests/unit/rendering/LOD.test.ts` - Level of detail
- [ ] `tests/unit/rendering/Debug.test.ts` - Debug visualization

---

### Task 5.3: Rendering Pipeline Tests (10 files)

**Files to Create:**
- [ ] `tests/unit/rendering/passes/ShadowPass.test.ts`
- [ ] `tests/unit/rendering/passes/GeometryPass.test.ts`
- [ ] `tests/unit/rendering/passes/LightingPass.test.ts`
- [ ] `tests/unit/rendering/passes/PostProcessPass.test.ts`
- [ ] `tests/unit/rendering/passes/TransparentPass.test.ts`
- [ ] `tests/unit/rendering/passes/UIPass.test.ts`
- [ ] `tests/unit/rendering/pipelines/ForwardPipeline.test.ts`
- [ ] `tests/unit/rendering/pipelines/DeferredPipeline.test.ts`
- [ ] `tests/unit/rendering/pipelines/ForwardPlusPipeline.test.ts`
- [ ] `tests/unit/rendering/pipelines/TiledDeferredPipeline.test.ts`

---

## Part 6: Unit Tests - Physics Module 🔴 CRITICAL

**Priority:** 🔴 **CRITICAL** - Simulation correctness  
**Target Coverage:** 90%  
**Estimated Time:** 3-4 weeks  
**Test Files:** 30 files

### Task 6.1: Physics Core Tests (10 files)

**Files to Create:**
- [ ] `tests/unit/physics/PhysicsWorld.test.ts` - Physics world
- [ ] `tests/unit/physics/RigidBody.test.ts` - Rigid body dynamics
- [ ] `tests/unit/physics/Collider.test.ts` - Collider system
- [ ] `tests/unit/physics/CollisionDetection.test.ts` - Collision detection
- [ ] `tests/unit/physics/CollisionResponse.test.ts` - Collision response
- [ ] `tests/unit/physics/Constraint.test.ts` - Constraints
- [ ] `tests/unit/physics/Raycast.test.ts` - Raycasting
- [ ] `tests/unit/physics/PhysicsMaterial.test.ts` - Physics materials
- [ ] `tests/unit/physics/BroadPhase.test.ts` - Broad phase collision
- [ ] `tests/unit/physics/NarrowPhase.test.ts` - Narrow phase collision

---

### Task 6.2: Physics Shapes Tests (10 files)

**Files to Create:**
- [ ] `tests/unit/physics/shapes/BoxShape.test.ts`
- [ ] `tests/unit/physics/shapes/SphereShape.test.ts`
- [ ] `tests/unit/physics/shapes/CapsuleShape.test.ts`
- [ ] `tests/unit/physics/shapes/CylinderShape.test.ts`
- [ ] `tests/unit/physics/shapes/PlaneShape.test.ts`
- [ ] `tests/unit/physics/shapes/MeshShape.test.ts`
- [ ] `tests/unit/physics/shapes/CompoundShape.test.ts`
- [ ] `tests/unit/physics/shapes/HeightfieldShape.test.ts`
- [ ] `tests/unit/physics/shapes/ShapeUtils.test.ts`
- [ ] `tests/unit/physics/shapes/CollisionShapes.test.ts`

---

### Task 6.3: Physics Integration Tests (10 files)

**Files to Create:**
- [ ] `tests/unit/physics/integration/ECSPHysics.test.ts` - ECS integration
- [ ] `tests/unit/physics/integration/RenderingPhysics.test.ts` - Rendering integration
- [ ] `tests/unit/physics/integration/AnimationPhysics.test.ts` - Animation integration
- [ ] `tests/unit/physics/integration/Performance.test.ts` - Performance tests
- [ ] `tests/unit/physics/integration/Stress.test.ts` - Stress tests
- [ ] `tests/unit/physics/integration/EdgeCases.test.ts` - Edge cases
- [ ] `tests/unit/physics/integration/Stability.test.ts` - Stability tests
- [ ] `tests/unit/physics/integration/Precision.test.ts` - Precision tests
- [ ] `tests/unit/physics/integration/Memory.test.ts` - Memory tests
- [ ] `tests/unit/physics/integration/Threading.test.ts` - Threading tests (if applicable)

---

## Part 7: Test Verification & CI Integration

### Task 7.1: Verify All Tests Pass

**Verification Steps:**
- [ ] Run all unit tests: `pnpm test`
- [ ] Verify all tests pass (no failures)
- [ ] Check test execution time (should be < 30 seconds for MVP)
- [ ] Verify test isolation (no test dependencies)
- [ ] Check for flaky tests (run multiple times)

---

### Task 7.2: Coverage Reporting

**Verification Steps:**
- [ ] Generate coverage report: `pnpm test:coverage`
- [ ] Verify coverage thresholds met:
  - Math: 100%
  - Core: 95%
  - ECS: 95%
  - Rendering: 90%
  - Physics: 90%
  - Overall: 60-70%
- [ ] Review coverage report HTML
- [ ] Identify coverage gaps
- [ ] Document coverage gaps for future improvement

---

### Task 7.3: CI/CD Integration

**File:** `.github/workflows/test.yml`

**Required Configuration:**
```yaml
name: Tests

on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  test:
    runs-on: ubuntu-latest
    
    steps:
      - uses: actions/checkout@v3
      
      - name: Setup Node.js
        uses: actions/setup-node@v3
        with:
          node-version: '18'
          cache: 'pnpm'
      
      - name: Install pnpm
        uses: pnpm/action-setup@v2
        with:
          version: 8
      
      - name: Install dependencies
        run: pnpm install
      
      - name: Run tests
        run: pnpm test
      
      - name: Generate coverage
        run: pnpm test:coverage
      
      - name: Upload coverage
        uses: codecov/codecov-action@v3
        with:
          files: ./coverage/lcov.info
```

**Verification Checklist:**
- [ ] CI workflow file created
- [ ] Tests run on push/PR
- [ ] Coverage uploaded to codecov (or similar)
- [ ] Test failures block merges
- [ ] Coverage reports accessible

---

## Phase H.1 Success Criteria

**Phase H.1 (MVP) is complete when:**

1. ✅ **Test Infrastructure Complete**
   - Vitest fully configured
   - Test utilities complete
   - Test fixtures created
   - CI/CD integration working

2. ✅ **Critical Module Tests Complete**
   - Math: 100% coverage (18 test files)
   - Core: 95% coverage (8 test files)
   - ECS: 95% coverage (24 test files)
   - Rendering: 90% coverage (30 test files)
   - Physics: 90% coverage (30 test files)

3. ✅ **Coverage Targets Met**
   - Overall coverage: 60-70%
   - Module-specific targets met
   - Coverage reports generated

4. ✅ **All Tests Passing**
   - No test failures
   - No flaky tests
   - Test execution time acceptable

5. ✅ **CI/CD Working**
   - Tests run automatically
   - Coverage tracked
   - Failures block merges

**Total Test Files Created:** ~110 test files  
**Timeline:** 11-15 weeks (~3-4 months)

---

## Phase H.2: Complete Test Suite (Future)

**Note:** Phase H.2 will be implemented after Phase H.1 MVP is complete.

**Remaining Work:**
- Animation module tests (30 files) - 3 weeks
- AI module tests (20 files) - 2 weeks
- World module tests (20 files) - 2 weeks
- Infrastructure module tests (30 files) - 3 weeks
- Domain pack tests (15 files) - 1 week
- Tooling tests (20 files) - 2 weeks
- Performance benchmarks (10 files) - 1 week
- Visual regression tests (10 files) - 2 weeks

**Total Additional:** ~175 test files  
**Timeline:** Additional 8-9 weeks (~2-2.5 months)  
**Final Coverage Target:** 85%+

---

## Testing Best Practices

### 1. Test Structure
- Use `describe` blocks for grouping
- Use `it` or `test` for individual tests
- Follow AAA pattern (Arrange, Act, Assert)
- One assertion per test (when possible)

### 2. Test Naming
- Use descriptive test names
- Include what is being tested and expected outcome
- Example: `it('should add two vectors correctly')`

### 3. Test Isolation
- Each test should be independent
- No shared state between tests
- Use `beforeEach`/`afterEach` for setup/teardown

### 4. Edge Cases
- Test zero values
- Test very large values
- Test NaN and Infinity
- Test null/undefined
- Test empty arrays/objects
- Test boundary conditions

### 5. Mocking
- Mock external dependencies (WebGL, WebGPU, AudioContext)
- Use test utilities for common mocks
- Keep mocks simple and focused

### 6. Performance
- Keep unit tests fast (< 100ms each)
- Use performance tests for benchmarks
- Avoid async operations in unit tests when possible

---

## Notes

- **Follow PRD-Final-11-Testing-Phases.md** for detailed test requirements
- **Use test utilities** from `tests/utils/` for consistency
- **Mock external dependencies** (WebGL, WebGPU, AudioContext)
- **Test edge cases** (zero values, very large values, NaN, Infinity)
- **Document test coverage gaps** for future improvement
- **Prioritize critical modules** (Math, Core, ECS, Rendering, Physics)

---

## Execution Priority

### 🔴 Critical (Phase H.1 MVP)
1. Math module (100% coverage) - **START HERE**
2. Core module (95% coverage)
3. ECS module (95% coverage)
4. Rendering module (90% coverage)
5. Physics module (90% coverage)

### 🟡 High Priority (Phase H.2)
6. Animation module (85% coverage)
7. AI module (90% coverage)
8. Performance benchmarks
9. Visual regression tests

### 🟢 Medium Priority (Phase H.2)
10. World module (85% coverage)
11. Infrastructure modules (85% coverage)
12. Domain packs (80% coverage)
13. Tooling (80% coverage)

---

**READY TO EXECUTE PHASE H.1 (MVP)!**

This revised prompt focuses on **minimum viable testing** to achieve production readiness with critical modules tested first. Complete test suite (Phase H.2) can be implemented after MVP is complete.

**Estimated Timeline for MVP:** 11-15 weeks (~3-4 months)  
**Estimated Timeline for Complete:** Additional 8-9 weeks (~2-2.5 months)

