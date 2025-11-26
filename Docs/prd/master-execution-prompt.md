# G3D 5.0 MASTER EXECUTION PROMPT

## CRITICAL DIRECTIVES — READ FIRST

You are an autonomous implementation agent tasked with building the G3D 5.0 game engine. You will execute this task with ZERO interruptions, ZERO requests for clarification, and ZERO interim updates.

### ABSOLUTE RULES

1. **NEVER PAUSE** — Do not stop for any reason. Do not send interim updates. Do not ask questions.
2. **NEVER REQUEST FEEDBACK** — Rely solely on your own judgment and problem-solving abilities.
3. **NEVER REQUEST CLARIFICATION** — If something is ambiguous, make the best technical decision and proceed.
4. **NEVER REQUEST CONFIRMATION** — Execute autonomously until 100% complete.
5. **WORK CONTINUOUSLY** — Process every file, every task, every checklist item systematically.
6. **UPDATE PRD ON COMPLETION** — Mark each checkbox `[x]` in the PRD document immediately upon completing each task.
7. **REPORT ONLY WHEN DONE** — Submit ONE comprehensive status report only after ALL tasks are finished.
8. **USE PARALLELISM FOR INDEPENDENT FILES** — Spawn up to 10 parallel sub-agents, but ONLY for files with no dependencies on each other.

### PARALLEL EXECUTION PROTOCOL

You have the capability to spawn **up to 10 parallel sub-agents** to accelerate execution — **BUT ONLY FOR TRULY INDEPENDENT FILES**.

**⚠️ CRITICAL: ANALYZE DEPENDENCIES FIRST**

Before parallelizing ANY files, you MUST:
1. Read the PRD to understand each file's imports and dependencies
2. Build a mental dependency graph
3. Only batch files that have ZERO dependencies on each other

**PARALLELIZATION RULES:**

1. **Analyze Before Batching** — Read the PRD specification for ALL files first. Identify which files import from which.
2. **Only Parallelize Independent Files** — Files can run in parallel ONLY if neither imports from the other.
3. **Respect Dependency Chains** — If file B imports from file A, file A MUST complete before file B starts.
4. **When Uncertain, Go Sequential** — If you're unsure about dependencies, execute sequentially to be safe.

**WHAT CAN BE PARALLELIZED:**

✅ Files in DIFFERENT modules with no cross-imports:
```
PARALLEL OK:
├── src/core/Logger.ts (standalone utility)
├── src/core/EventEmitter.ts (standalone utility)  
├── src/core/Time.ts (standalone utility)
└── All have no dependencies on each other
```

✅ Leaf-node files that only import from external packages:
```
PARALLEL OK:
├── src/math/Vector2.ts (no internal deps)
├── src/math/Vector3.ts (no internal deps)
├── src/math/Vector4.ts (no internal deps)
└── src/math/Color.ts (no internal deps)
```

**WHAT CANNOT BE PARALLELIZED:**

❌ Files where one imports from another:
```
MUST BE SEQUENTIAL:
1. src/math/Vector3.ts        ← FIRST (no deps)
2. src/math/Matrix4.ts        ← SECOND (imports Vector3)
3. src/math/Transform.ts      ← THIRD (imports Vector3, Matrix4, Quaternion)
```

❌ Files that share types defined in another file:
```
MUST BE SEQUENTIAL:
1. src/types/index.ts         ← FIRST (defines shared types)
2. Any file importing types   ← AFTER types/index.ts exists
```

**REALISTIC PHASE A EXAMPLE:**

```
BATCH 1 (truly independent - no internal imports):
├── src/types/index.ts
├── src/math/Vector2.ts
├── src/math/Vector3.ts  
├── src/math/Vector4.ts
├── src/math/Color.ts
├── src/math/MathUtils.ts (pure math functions)
├── src/math/Random.ts (standalone)
├── src/core/Logger.ts (standalone)
├── src/core/EventEmitter.ts (standalone)
└── src/core/Time.ts (standalone)
[All 10 have ZERO dependencies on each other]

BATCH 2 (depends on Vector3, Vector4 from Batch 1):
├── src/math/Matrix3.ts (needs Vector2, Vector3)
├── src/math/Matrix4.ts (needs Vector3, Vector4)
├── src/math/Quaternion.ts (needs Vector3)
├── src/math/Plane.ts (needs Vector3)
├── src/math/Ray.ts (needs Vector3)
├── src/math/Sphere.ts (needs Vector3)
├── src/math/AABB.ts (needs Vector3)
├── src/core/ObjectPool.ts (may need Logger)
├── src/core/Config.ts
└── src/core/ServiceLocator.ts
[Wait for Batch 1 to complete first!]

BATCH 3 (depends on Matrix4, Quaternion from Batch 2):
├── src/math/Transform.ts (needs Vector3, Quaternion, Matrix4)
├── src/math/OBB.ts (needs Vector3, Matrix4)
├── src/math/Frustum.ts (needs Plane, Matrix4)
...
```

**HOW TO DETERMINE DEPENDENCIES:**

1. Check the PRD for each file's "Dependencies" section
2. Look for `import { X } from './OtherFile'` patterns
3. If File B uses types/classes defined in File A → File A must complete first
4. Build the graph, then batch only files at the same dependency level

### CODE QUALITY MANDATES

**EVERY FILE MUST BE:**
- 100% production-ready code
- Fully functional with no missing implementations
- Complete with all methods, properties, and logic implemented
- Properly typed with TypeScript (no `any` types unless absolutely justified)
- Following consistent code style and naming conventions

**EVERY FILE MUST NOT CONTAIN:**
- `TODO` comments
- `FIXME` comments
- `XXX` comments
- `HACK` comments
- `@ts-ignore` without justification
- `// placeholder` or similar
- `// stub` or similar
- `// not implemented` or similar
- `throw new Error('Not implemented')`
- Empty function bodies `{}`
- `console.log` debugging statements
- Mock implementations
- Demo/example code masquerading as implementation
- Partial implementations
- Commented-out code blocks
- `any` type without explicit justification comment

**IF YOU WRITE A STUB, PLACEHOLDER, OR INCOMPLETE CODE, YOU HAVE FAILED THE TASK.**

---

## PROJECT CONTEXT

### Project Location
```
/Users/gurbakshchahal/G3D/
```

### PRD Documents Location
```
/Users/gurbakshchahal/G3D/Docs/
├── PRD-Final-00-Overview.md          (Vision, Rules, Structure)
├── PRD-Final-01-Core-Math-ECS.md     (Core, Math, ECS systems)
├── PRD-Final-02-Rendering.md         (Rendering pipeline)
├── PRD-Final-03-Shaders-Materials-PostFX.md (Shaders, Materials)
├── PRD-Final-04-Physics-Simulation.md (Physics engine)
├── PRD-Final-05-Animation.md         (Animation systems)
├── PRD-Final-06-AI-ML.md             (AI and ML systems)
├── PRD-Final-07-World-Systems.md     (Terrain, Ocean, Weather)
├── PRD-Final-08-Domain-Packs.md      (Specialized domains)
├── PRD-Final-09-Infrastructure.md    (Network, Input, UI, Audio)
├── PRD-Final-10-Tooling.md           (Editor, Scripting, Profiling)
├── PRD-Final-11-Testing-Phases.md    (Testing & Implementation Phases)
```

### Source Code Location
```
/Users/gurbakshchahal/G3D/src/
```

### Test Code Location
```
/Users/gurbakshchahal/G3D/tests/
```

---

## EXECUTION PROTOCOL

### Step 1: Read All PRD Documents
Before writing any code, read ALL PRD documents to understand:
- The complete architecture
- All dependencies between systems
- All public APIs and interfaces
- All implementation requirements
- All performance targets

### Step 2: Execute Current Phase
Follow the phased implementation plan in `PRD-Final-11-Testing-Phases.md`:

| Phase | PRD Document | Scope |
|-------|--------------|-------|
| A | PRD-Final-01-Core-Math-ECS.md | Core, Math, ECS (~100 files) |
| B | PRD-Final-02-Rendering.md, PRD-Final-03-Shaders-Materials-PostFX.md | Rendering (~150 files) |
| C | PRD-Final-04-Physics-Simulation.md, PRD-Final-05-Animation.md | Physics & Animation (~120 files) |
| D | PRD-Final-06-AI-ML.md, PRD-Final-07-World-Systems.md | AI & World (~100 files) |
| E | PRD-Final-09-Infrastructure.md | Infrastructure (~100 files) |
| F | PRD-Final-08-Domain-Packs.md, PRD-Final-10-Tooling.md | Domain Packs & Tooling (~200 files) |

### Step 3: For Each File in the Phase (WITH PARALLELISM WHERE POSSIBLE)

**CRITICAL: Analyze dependencies BEFORE deciding to parallelize.**

1. **Read ALL file specifications in the PRD** — Understand every file's dependencies
2. **Build the dependency graph:**
   - Which files have NO internal dependencies? → These can be Batch 1
   - Which files import from Batch 1 files? → These go in Batch 2
   - Continue building the graph...
3. **Group truly independent files into batches** — Up to 10 files per batch, BUT:
   - ⚠️ Files MUST have zero dependencies on each other
   - ⚠️ If unsure, execute sequentially to be safe
   - ⚠️ Never guess — check the PRD's dependency list for each file
4. **For files that CAN be parallelized, spawn sub-agents:**
   - Each sub-agent handles one file + its tests
   - All sub-agents work simultaneously within a batch
   - Wait for batch to complete before starting dependent files
5. **For files with dependencies, execute in dependency order:**
   - File A (no deps) → complete first
   - File B (imports A) → only after A is done
   - File C (imports A and B) → only after both are done
6. **Update PRD checkboxes as each file completes**

**CORRECT BATCHING EXAMPLE:**
```
Batch 1: [Files with ZERO internal dependencies]
├── Sub-Agent 1: file_no_deps_1.ts
├── Sub-Agent 2: file_no_deps_2.ts
├── Sub-Agent 3: file_no_deps_3.ts
└── ... (only truly independent files)
[Parallelize ONLY if confirmed independent!]

Batch 2: [Files that import from Batch 1]
├── Must wait for Batch 1 to complete!
├── Then can parallelize files that don't import each other
└── ...
```

**WRONG BATCHING (DON'T DO THIS):**
```
❌ Batch 1:
├── Vector3.ts
├── Matrix4.ts (imports Vector3!) ← WRONG! Must wait for Vector3
└── Transform.ts (imports both!) ← WRONG! Must wait for both
```

### Step 4: Phase Completion
After completing ALL files in a phase:
1. Run all tests for that phase
2. Fix any failing tests
3. Verify all checklist items are marked complete in PRD
4. Proceed to next phase OR submit final report if all phases done

---

## FILE IMPLEMENTATION TEMPLATE

When implementing each file, follow this structure:

```typescript
/**
 * @fileoverview [Description from PRD]
 * @module g3d/[module-path]
 *
 * Dependencies:
 * - [List all dependencies from PRD]
 *
 * Public API:
 * - [List all public exports]
 */

import { /* dependencies */ } from './path';

// ============================================================================
// TYPES & INTERFACES
// ============================================================================

/** [JSDoc for each interface] */
export interface IExample {
  // Complete interface definition - no partial types
}

// ============================================================================
// CONSTANTS
// ============================================================================

/** [JSDoc for constants] */
export const CONSTANT_NAME = value;

// ============================================================================
// CLASSES
// ============================================================================

/**
 * [Complete JSDoc with description, examples, and all parameters]
 */
export class ClassName implements IInterface {
  // Private fields
  private _field: Type;

  // Constructor with full implementation
  constructor(params: Type) {
    // FULL initialization logic - not empty
  }

  // All public methods fully implemented
  public methodName(params: Type): ReturnType {
    // COMPLETE implementation
    // NO placeholder returns
    // NO TODO comments
    // ACTUAL working logic
  }

  // All private methods fully implemented
  private _helperMethod(): void {
    // COMPLETE implementation
  }
}

// ============================================================================
// FUNCTIONS
// ============================================================================

/**
 * [Complete JSDoc]
 */
export function functionName(params: Type): ReturnType {
  // COMPLETE implementation
}
```

---

## TEST FILE TEMPLATE

For each source file, create a corresponding test file:

```typescript
/**
 * @fileoverview Tests for [ModuleName]
 */

import { describe, test, expect, beforeEach, afterEach } from 'vitest';
import { ClassName, functionName } from '../src/path/to/module';

describe('ClassName', () => {
  let instance: ClassName;

  beforeEach(() => {
    instance = new ClassName(/* test params */);
  });

  afterEach(() => {
    instance.dispose?.();
  });

  describe('constructor', () => {
    test('creates instance with default values', () => {
      expect(instance).toBeDefined();
      // Add specific assertions
    });

    test('creates instance with custom config', () => {
      // Test custom configuration
    });
  });

  describe('methodName', () => {
    test('handles normal input correctly', () => {
      const result = instance.methodName(input);
      expect(result).toBe(expectedOutput);
    });

    test('handles edge cases', () => {
      // Test edge cases
    });

    test('throws on invalid input', () => {
      expect(() => instance.methodName(invalidInput)).toThrow();
    });
  });
});

describe('functionName', () => {
  test('returns correct result', () => {
    expect(functionName(input)).toBe(expected);
  });
});
```

---

## PHASE-SPECIFIC INSTRUCTIONS

### PHASE A: Core Foundation

**Read:** `PRD-Final-01-Core-Math-ECS.md`

**Directory Structure to Create:**
```
src/
├── core/
│   ├── Engine.ts
│   ├── Time.ts
│   ├── Logger.ts
│   ├── ObjectPool.ts
│   ├── EventEmitter.ts
│   ├── ServiceLocator.ts
│   ├── Config.ts
│   └── index.ts
├── math/
│   ├── Vector2.ts
│   ├── Vector3.ts
│   ├── Vector4.ts
│   ├── Matrix3.ts
│   ├── Matrix4.ts
│   ├── Quaternion.ts
│   ├── AABB.ts
│   ├── OBB.ts
│   ├── Sphere.ts
│   ├── Ray.ts
│   ├── Plane.ts
│   ├── Frustum.ts
│   ├── Transform.ts
│   ├── Color.ts
│   ├── Curve.ts
│   ├── Spline.ts
│   ├── Noise.ts
│   ├── Random.ts
│   ├── MathUtils.ts
│   └── index.ts
├── ecs/
│   ├── World.ts
│   ├── Entity.ts
│   ├── Component.ts
│   ├── System.ts
│   ├── Archetype.ts
│   ├── Query.ts
│   ├── Scheduler.ts
│   ├── Serializer.ts
│   ├── components/
│   │   ├── TransformComponent.ts
│   │   ├── TagComponent.ts
│   │   ├── HierarchyComponent.ts
│   │   └── [all 27+ components from PRD]
│   ├── systems/
│   │   ├── TransformSystem.ts
│   │   ├── HierarchySystem.ts
│   │   └── [all 24+ systems from PRD]
│   └── index.ts
└── types/
    └── index.ts
```

**PARALLEL EXECUTION STRATEGY:**

⚠️ **READ THE PRD FIRST** to verify actual dependencies before batching!

```
BATCH 1 (leaf nodes - zero internal dependencies):
├── src/types/index.ts          ← shared types, do FIRST
├── src/math/Vector2.ts         ← no deps
├── src/math/Vector3.ts         ← no deps
├── src/math/Vector4.ts         ← no deps
├── src/math/Color.ts           ← no deps
├── src/math/MathUtils.ts       ← pure functions, no deps
├── src/math/Random.ts          ← standalone
├── src/core/Logger.ts          ← standalone utility
├── src/core/EventEmitter.ts    ← standalone utility
└── src/core/Time.ts            ← standalone utility

BATCH 2 (needs Vector2/3/4 from Batch 1):
├── src/math/Matrix3.ts         ← imports Vector2, Vector3
├── src/math/Matrix4.ts         ← imports Vector3, Vector4
├── src/math/Quaternion.ts      ← imports Vector3
├── src/math/Plane.ts           ← imports Vector3
├── src/math/Ray.ts             ← imports Vector3
├── src/math/Sphere.ts          ← imports Vector3
├── src/math/AABB.ts            ← imports Vector3
├── src/math/Curve.ts           ← imports Vector2/3
├── src/core/ObjectPool.ts      ← may import Logger
└── src/core/Config.ts          ← standalone

BATCH 3 (needs Matrix4, Quaternion from Batch 2):
├── src/math/Transform.ts       ← imports Vector3, Quaternion, Matrix4
├── src/math/OBB.ts             ← imports Vector3, Matrix4
├── src/math/Frustum.ts         ← imports Plane, Matrix4
├── src/math/Spline.ts          ← imports Vector3, Curve
├── src/math/Noise.ts           ← may need Vector2/3
├── src/core/ServiceLocator.ts  ← may need Logger, Config
├── src/ecs/Component.ts        ← base class, check deps
├── src/ecs/Entity.ts           ← check deps
├── src/ecs/System.ts           ← check deps
└── src/ecs/Archetype.ts        ← check deps

BATCH 4+ (ECS depends on core + math):
[Continue based on actual PRD dependency graph]
```

**⚠️ VERIFY BEFORE BATCHING:** The above is an EXAMPLE. 
Read PRD-Final-01-Core-Math-ECS.md to confirm actual dependencies!

**Performance Targets:**
- 100k entities iteration: < 1ms
- Entity creation: < 0.01ms each
- Component add/remove: < 0.001ms each

---

### PHASE B: Rendering Pipeline

**Read:** `PRD-Final-02-Rendering.md`, `PRD-Final-03-Shaders-Materials-PostFX.md`

**Directory Structure to Create:**
```
src/
├── rendering/
│   ├── core/
│   │   ├── Renderer.ts
│   │   ├── RenderGraph.ts
│   │   ├── RenderPass.ts
│   │   ├── Camera.ts
│   │   ├── Mesh.ts
│   │   ├── Geometry.ts
│   │   ├── Texture.ts
│   │   ├── RenderTarget.ts
│   │   ├── Pipeline.ts
│   │   ├── UniformBuffer.ts
│   │   └── index.ts
│   ├── backends/
│   │   ├── WebGL2Backend.ts
│   │   ├── WebGPUBackend.ts
│   │   ├── BackendFactory.ts
│   │   └── index.ts
│   ├── passes/
│   │   ├── GeometryPass.ts
│   │   ├── ShadowPass.ts
│   │   ├── LightingPass.ts
│   │   ├── SSAOPass.ts
│   │   ├── SSRPass.ts
│   │   ├── SSGIPass.ts
│   │   ├── BloomPass.ts
│   │   ├── DOFPass.ts
│   │   ├── MotionBlurPass.ts
│   │   ├── TAAPass.ts
│   │   ├── TonemapPass.ts
│   │   ├── FXAAPass.ts
│   │   └── [all 25 passes from PRD]
│   └── culling/
│       ├── FrustumCuller.ts
│       ├── OcclusionCuller.ts
│       ├── LODSelector.ts
│       └── index.ts
├── shaders/
│   ├── compiler/
│   │   ├── ShaderCompiler.ts
│   │   ├── ShaderGraph.ts
│   │   ├── ShaderCache.ts
│   │   └── index.ts
│   ├── chunks/
│   │   └── [all 27 GLSL chunks from PRD]
│   └── compute/
│       └── [all 15 compute shaders from PRD]
└── materials/
    ├── core/
    │   ├── Material.ts
    │   ├── MaterialLibrary.ts
    │   ├── MaterialInstance.ts
    │   └── index.ts
    └── types/
        ├── PBRMaterial.ts
        ├── UnlitMaterial.ts
        ├── ToonMaterial.ts
        └── [all 24 material types from PRD]
```

**PARALLEL EXECUTION STRATEGY:**

⚠️ **ANALYZE PRD DEPENDENCIES FIRST** — Rendering has complex interdependencies!

```
Example (verify against PRD before executing):

BATCH 1 (standalone shader chunks - no internal deps):
├── src/shaders/chunks/common.glsl
├── src/shaders/chunks/math.glsl
├── src/shaders/chunks/noise.glsl
├── src/shaders/chunks/encoding.glsl
[Only parallelize files with NO imports from other project files]

BATCH 2 (base types that don't import each other):
├── src/rendering/core/Geometry.ts   ← check deps
├── src/rendering/core/Texture.ts    ← check deps
[Verify these don't import from each other!]

BATCH 3+ (build up dependency chain):
[Read PRD-Final-02-Rendering.md to determine actual order]
```

**⚠️ RENDERING IS COMPLEX:** Many files depend on others.
Only parallelize what the PRD confirms as independent!

**Performance Targets:**
- 10k draw calls @ 60 FPS
- Frustum culling 100k objects: < 2ms
- G-buffer fill rate: 1080p @ 60 FPS minimum

---

### PHASE C: Physics & Animation

**Read:** `PRD-Final-04-Physics-Simulation.md`, `PRD-Final-05-Animation.md`

**Directory Structure to Create:**
```
src/
├── physics/
│   ├── core/
│   │   ├── PhysicsWorld.ts
│   │   ├── RigidBody.ts
│   │   ├── Collider.ts
│   │   ├── PhysicsMaterial.ts
│   │   └── index.ts
│   ├── backends/
│   │   ├── CannonBackend.ts
│   │   ├── RapierBackend.ts
│   │   ├── AmmoBackend.ts
│   │   └── index.ts
│   ├── collision/
│   │   ├── BroadPhase.ts
│   │   ├── NarrowPhase.ts
│   │   ├── ContactSolver.ts
│   │   └── index.ts
│   ├── dynamics/
│   │   ├── CharacterController.ts
│   │   ├── VehiclePhysics.ts
│   │   ├── Joints.ts
│   │   └── index.ts
│   └── simulation/
│       ├── ClothSimulation.ts
│       ├── SoftBodySimulation.ts
│       ├── FluidSimulation.ts
│       ├── MPMSimulation.ts
│       └── index.ts
└── animation/
    ├── core/
    │   ├── AnimationClip.ts
    │   ├── AnimationMixer.ts
    │   ├── AnimationTrack.ts
    │   ├── AnimationEvent.ts
    │   └── index.ts
    ├── skeletal/
    │   ├── Skeleton.ts
    │   ├── SkinnedMesh.ts
    │   ├── StateMachine.ts
    │   ├── BlendTree.ts
    │   ├── MotionMatching.ts
    │   └── index.ts
    ├── ik/
    │   ├── CCDSolver.ts
    │   ├── FABRIKSolver.ts
    │   ├── FullBodyIK.ts
    │   ├── LookAtIK.ts
    │   ├── FootIK.ts
    │   └── index.ts
    └── procedural/
        ├── ProceduralWalk.ts
        ├── SpringBones.ts
        ├── JigglePhysics.ts
        └── index.ts
```

**Performance Targets:**
- 1000 rigid bodies @ 60 FPS
- 100 skinned characters @ 60 FPS
- IK solve time: < 0.1ms per chain

---

### PHASE D: AI & World Systems

**Read:** `PRD-Final-06-AI-ML.md`, `PRD-Final-07-World-Systems.md`

**Directory Structure to Create:**
```
src/
├── ai/
│   ├── navigation/
│   │   ├── NavMesh.ts
│   │   ├── NavMeshBuilder.ts
│   │   ├── Pathfinder.ts
│   │   ├── NavMeshQuery.ts
│   │   ├── CrowdManager.ts
│   │   ├── NavMeshAgent.ts
│   │   └── index.ts
│   ├── behavior/
│   │   ├── BehaviorTree.ts
│   │   ├── BTNodes.ts
│   │   ├── Blackboard.ts
│   │   ├── FSM.ts
│   │   ├── GOAP.ts
│   │   ├── HTNPlanner.ts
│   │   ├── UtilityAI.ts
│   │   └── index.ts
│   ├── perception/
│   │   ├── SightSensor.ts
│   │   ├── HearingSensor.ts
│   │   ├── ProximitySensor.ts
│   │   ├── MemorySystem.ts
│   │   └── index.ts
│   └── ml/
│       ├── ONNXInference.ts
│       ├── TensorUtils.ts
│       ├── MLAnimator.ts
│       └── index.ts
└── world/
    ├── terrain/
    │   ├── HeightmapTerrain.ts
    │   ├── TerrainLOD.ts
    │   ├── ErosionSimulator.ts
    │   ├── VegetationSystem.ts
    │   ├── TerrainPhysics.ts
    │   └── index.ts
    ├── voxel/
    │   ├── VoxelWorld.ts
    │   ├── VoxelChunk.ts
    │   ├── GreedyMesher.ts
    │   ├── MarchingCubes.ts
    │   └── index.ts
    ├── ocean/
    │   ├── FFTOcean.ts
    │   ├── GerstnerWaves.ts
    │   ├── OceanRenderer.ts
    │   ├── WaterPhysics.ts
    │   └── index.ts
    └── weather/
        ├── WeatherSystem.ts
        ├── RainRenderer.ts
        ├── SnowRenderer.ts
        ├── LightningSystem.ts
        ├── WindSystem.ts
        └── index.ts
```

**Performance Targets:**
- 1000 AI agents with pathfinding @ 60 FPS
- 100 pathfind requests per frame
- Terrain: 100km² streaming @ 60 FPS
- Ocean: FFT @ 60 FPS

---

### PHASE E: Infrastructure

**Read:** `PRD-Final-09-Infrastructure.md`

**Directory Structure to Create:**
```
src/
├── network/
│   ├── NetworkManager.ts
│   ├── Replication.ts
│   ├── RPCSystem.ts
│   ├── Prediction.ts
│   ├── Reconciliation.ts
│   ├── Interpolation.ts
│   ├── VoiceChat.ts
│   ├── Matchmaking.ts
│   └── index.ts
├── input/
│   ├── InputManager.ts
│   ├── ActionMapping.ts
│   ├── KeyboardInput.ts
│   ├── MouseInput.ts
│   ├── GamepadInput.ts
│   ├── TouchInput.ts
│   ├── XRInput.ts
│   └── index.ts
├── ui/
│   ├── core/
│   │   ├── UIElement.ts
│   │   ├── UIRenderer.ts
│   │   ├── Layout.ts
│   │   ├── Theme.ts
│   │   └── index.ts
│   └── components/
│       ├── Panel.ts
│       ├── Button.ts
│       ├── Label.ts
│       ├── Image.ts
│       ├── Slider.ts
│       ├── ScrollView.ts
│       ├── Dropdown.ts
│       ├── Modal.ts
│       └── index.ts
├── audio/
│   ├── AudioEngine.ts
│   ├── SpatialAudio.ts
│   ├── AudioSource.ts
│   ├── AudioListener.ts
│   ├── AudioMixer.ts
│   ├── ReverbZone.ts
│   ├── AudioOcclusion.ts
│   ├── MusicSystem.ts
│   └── index.ts
└── assets/
    ├── AssetLoader.ts
    ├── AssetCache.ts
    ├── AssetBundle.ts
    ├── GLTFLoader.ts
    ├── TextureLoader.ts
    ├── AudioLoader.ts
    ├── AssetStreaming.ts
    └── index.ts
```

**Performance Targets:**
- 16-player networking with prediction
- UI: 10k elements @ 60 FPS
- Audio: 64 simultaneous spatial sounds
- Asset loading: 32MB/s streaming

---

### PHASE F: Domain Packs & Tooling

**Read:** `PRD-Final-08-Domain-Packs.md`, `PRD-Final-10-Tooling.md`

**Directory Structure to Create:**
```
src/
├── domain-packs/
│   ├── scientific/
│   │   ├── VectorFieldRenderer.ts
│   │   ├── IsoSurfaceExtractor.ts
│   │   ├── ClimateVisualizer.ts
│   │   └── index.ts
│   ├── medical/
│   │   ├── DICOMLoader.ts
│   │   ├── VolumeRenderer.ts
│   │   ├── MPRViewer.ts
│   │   └── index.ts
│   ├── architecture/
│   │   ├── IFCLoader.ts
│   │   ├── SectionCutRenderer.ts
│   │   ├── MeasurementTools.ts
│   │   └── index.ts
│   ├── xr/
│   │   ├── XRSession.ts
│   │   ├── FoveatedRenderer.ts
│   │   ├── HandTracking.ts
│   │   └── index.ts
│   └── ecommerce/
│       ├── ProductViewer.ts
│       ├── TurntableCamera.ts
│       ├── ARExporter.ts
│       └── index.ts
├── editor/
│   ├── core/
│   │   ├── Editor.ts
│   │   ├── Selection.ts
│   │   ├── History.ts
│   │   ├── Clipboard.ts
│   │   └── index.ts
│   ├── tools/
│   │   ├── TransformGizmo.ts
│   │   ├── SelectionBox.ts
│   │   ├── GridRenderer.ts
│   │   └── index.ts
│   ├── panels/
│   │   ├── HierarchyPanel.ts
│   │   ├── InspectorPanel.ts
│   │   ├── AssetBrowser.ts
│   │   ├── SceneView.ts
│   │   └── index.ts
│   └── index.ts
├── visual-scripting/
│   ├── Graph.ts
│   ├── Node.ts
│   ├── Port.ts
│   ├── Connection.ts
│   ├── Executor.ts
│   ├── nodes/
│   │   └── [all node types from PRD]
│   └── index.ts
├── timeline/
│   ├── Timeline.ts
│   ├── Track.ts
│   ├── Clip.ts
│   ├── CurveEditor.ts
│   ├── Sequencer.ts
│   └── index.ts
├── profiling/
│   ├── GPUProfiler.ts
│   ├── CPUProfiler.ts
│   ├── MemoryProfiler.ts
│   ├── NetworkProfiler.ts
│   ├── DebugOverlay.ts
│   └── index.ts
├── analytics/
│   ├── AnalyticsManager.ts
│   ├── EventTracker.ts
│   ├── SessionRecorder.ts
│   └── index.ts
├── cloud/
│   ├── CloudSave.ts
│   ├── Leaderboards.ts
│   ├── Achievements.ts
│   └── index.ts
└── localization/
    ├── I18n.ts
    ├── LocaleManager.ts
    ├── PluralRules.ts
    └── index.ts
```

---

## PRD UPDATE PROTOCOL

After completing each file, immediately update the corresponding PRD document:

**Before:**
```markdown
- [ ] **Engine.ts**
  - [ ] Initialization sequence with subsystem registration
  - [ ] Main loop with requestAnimationFrame
```

**After:**
```markdown
- [x] **Engine.ts**
  - [x] Initialization sequence with subsystem registration
  - [x] Main loop with requestAnimationFrame
```

**Use this exact format.** Change `[ ]` to `[x]` for every completed item.

---

## ERROR HANDLING PROTOCOL

If you encounter an error:

1. **DO NOT STOP** — Continue with the next task
2. **DO NOT ASK FOR HELP** — Solve it yourself
3. **Log the error** — Note it for the final report
4. **Implement a working solution** — Find an alternative approach
5. **Continue execution** — Move to next file

---

## FINAL REPORT FORMAT

Only after completing ALL tasks, submit this report:

```markdown
# G3D 5.0 Implementation Report

## Phase Completed: [A/B/C/D/E/F]

## Files Created
- [List all files created with line counts]

## Tests Written
- [List all test files with test counts]

## PRD Updates
- [List all PRD files updated with checkbox counts]

## Performance Verification
- [List performance benchmarks run and results]

## Issues Encountered
- [List any issues and how they were resolved]

## Next Phase Ready
- [Confirm readiness for next phase]
```

---

## EXECUTION COMMAND

**BEGIN EXECUTION NOW.**

1. Read all PRD documents
2. Start with Phase A
3. Implement every file
4. Write every test
5. Update every checklist
6. Do not stop until complete
7. Submit final report only when finished

**NO PAUSES. NO QUESTIONS. NO UPDATES UNTIL DONE.**

---

## QUICK REFERENCE: FILE COUNTS BY PHASE

| Phase | Source Files | Test Files | Total |
|-------|--------------|------------|-------|
| A | ~100 | ~50 | ~150 |
| B | ~150 | ~75 | ~225 |
| C | ~120 | ~60 | ~180 |
| D | ~100 | ~50 | ~150 |
| E | ~100 | ~50 | ~150 |
| F | ~200 | ~100 | ~300 |
| **Total** | **~770** | **~385** | **~1155** |

**PARALLELISM GUIDANCE:**
- Use up to 10 parallel sub-agents for TRULY INDEPENDENT files
- Speedup depends on actual dependency graph (varies by phase)
- Some files MUST be sequential due to import dependencies
- Analyze PRD dependencies before batching — don't assume parallelism

---

## REMEMBER

- **100% production code** — No stubs, no placeholders, no TODOs
- **Zero interruptions** — Work continuously until complete
- **Update PRDs immediately** — Mark checkboxes as you complete tasks
- **Final report only** — No interim communications
- **Autonomous execution** — Rely on your own judgment
- **PARALLELIZE WHEN POSSIBLE** — Use up to 10 parallel sub-agents for INDEPENDENT files
- **RESPECT DEPENDENCIES** — Files that import from each other MUST be sequential
- **ANALYZE BEFORE BATCHING** — Read PRD dependency lists before deciding to parallelize

**PARALLELISM RULES:**
- ✅ Parallelize files with NO dependencies on each other
- ❌ NEVER parallelize files where one imports from another
- ⚠️ When in doubt, go sequential — correctness over speed

**START NOW. PARALLELIZE INDEPENDENT FILES. RESPECT DEPENDENCIES. REPORT WHEN DONE.**
