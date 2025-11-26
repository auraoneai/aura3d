# G3D 5.0 PRD — Part 11: Testing & Implementation Phases

> **Companion to**: `PRD-Final-00-Overview.md` through `PRD-Final-10-Tooling.md`
> **Scope**: Testing requirements, performance budgets, and phased implementation plan

---

## Table of Contents
1. [Testing Philosophy](#1-testing-philosophy)
2. [Unit Testing Requirements](#2-unit-testing-requirements)
3. [Integration Testing](#3-integration-testing)
4. [Performance Testing](#4-performance-testing)
5. [Visual Regression Testing](#5-visual-regression-testing)
6. [Platform Testing Matrix](#6-platform-testing-matrix)
7. [Performance Budgets](#7-performance-budgets)
8. [Implementation Phases](#8-implementation-phases)
9. [Phase Completion Criteria](#9-phase-completion-criteria)
10. [Master Checklist](#10-master-checklist)

---

## 1. Testing Philosophy

### 1.1 Non-Negotiable Testing Rules

```
TESTING_RULES:
  1. No file merges without passing tests
  2. No feature complete without 80%+ coverage
  3. No subsystem complete without integration tests
  4. No release without performance regression tests
  5. No visual changes without golden image comparison
  6. No API changes without documentation updates
```

### 1.2 Testing Directory Structure

```
tests/
├── unit/
│   ├── core/
│   │   ├── Engine.test.ts
│   │   ├── Time.test.ts
│   │   ├── Logger.test.ts
│   │   └── ObjectPool.test.ts
│   ├── math/
│   │   ├── Vector2.test.ts
│   │   ├── Vector3.test.ts
│   │   ├── Vector4.test.ts
│   │   ├── Matrix3.test.ts
│   │   ├── Matrix4.test.ts
│   │   ├── Quaternion.test.ts
│   │   ├── AABB.test.ts
│   │   ├── OBB.test.ts
│   │   ├── Sphere.test.ts
│   │   ├── Ray.test.ts
│   │   ├── Plane.test.ts
│   │   ├── Frustum.test.ts
│   │   ├── Transform.test.ts
│   │   ├── Color.test.ts
│   │   ├── Curve.test.ts
│   │   ├── Spline.test.ts
│   │   ├── Noise.test.ts
│   │   └── Random.test.ts
│   ├── ecs/
│   │   ├── World.test.ts
│   │   ├── Entity.test.ts
│   │   ├── Component.test.ts
│   │   ├── System.test.ts
│   │   ├── Archetype.test.ts
│   │   ├── Query.test.ts
│   │   ├── Scheduler.test.ts
│   │   └── Serializer.test.ts
│   ├── rendering/
│   │   ├── Renderer.test.ts
│   │   ├── RenderGraph.test.ts
│   │   ├── Camera.test.ts
│   │   ├── Mesh.test.ts
│   │   ├── Texture.test.ts
│   │   ├── RenderTarget.test.ts
│   │   └── culling/
│   │       ├── FrustumCuller.test.ts
│   │       ├── OcclusionCuller.test.ts
│   │       └── LODSelector.test.ts
│   ├── shaders/
│   │   ├── ShaderCompiler.test.ts
│   │   ├── ShaderGraph.test.ts
│   │   ├── UniformBuffer.test.ts
│   │   └── ShaderCache.test.ts
│   ├── materials/
│   │   ├── Material.test.ts
│   │   ├── MaterialLibrary.test.ts
│   │   └── MaterialInstance.test.ts
│   ├── physics/
│   │   ├── PhysicsWorld.test.ts
│   │   ├── RigidBody.test.ts
│   │   ├── Collider.test.ts
│   │   ├── Raycast.test.ts
│   │   ├── Joints.test.ts
│   │   └── CharacterController.test.ts
│   ├── animation/
│   │   ├── AnimationClip.test.ts
│   │   ├── AnimationMixer.test.ts
│   │   ├── StateMachine.test.ts
│   │   ├── BlendTree.test.ts
│   │   ├── IKSolver.test.ts
│   │   └── MotionMatching.test.ts
│   ├── ai/
│   │   ├── NavMesh.test.ts
│   │   ├── Pathfinder.test.ts
│   │   ├── BehaviorTree.test.ts
│   │   ├── FSM.test.ts
│   │   ├── SteeringBehaviors.test.ts
│   │   └── GOAP.test.ts
│   ├── world/
│   │   ├── terrain/
│   │   │   ├── HeightmapTerrain.test.ts
│   │   │   ├── TerrainLOD.test.ts
│   │   │   └── VegetationSystem.test.ts
│   │   ├── voxel/
│   │   │   ├── VoxelChunk.test.ts
│   │   │   └── GreedyMesher.test.ts
│   │   └── ocean/
│   │       └── FFTOcean.test.ts
│   ├── infrastructure/
│   │   ├── network/
│   │   │   ├── NetworkManager.test.ts
│   │   │   ├── Replication.test.ts
│   │   │   └── Prediction.test.ts
│   │   ├── input/
│   │   │   ├── InputManager.test.ts
│   │   │   └── ActionMapping.test.ts
│   │   ├── ui/
│   │   │   ├── UIElement.test.ts
│   │   │   ├── Layout.test.ts
│   │   │   └── UIRenderer.test.ts
│   │   ├── audio/
│   │   │   ├── AudioEngine.test.ts
│   │   │   └── SpatialAudio.test.ts
│   │   └── assets/
│   │       ├── AssetLoader.test.ts
│   │       └── AssetCache.test.ts
│   └── tooling/
│       ├── editor/
│       │   ├── Selection.test.ts
│       │   ├── History.test.ts
│       │   └── Gizmos.test.ts
│       └── visual-scripting/
│           ├── Graph.test.ts
│           └── Executor.test.ts
├── integration/
│   ├── ecs-rendering.test.ts
│   ├── physics-animation.test.ts
│   ├── ai-navigation.test.ts
│   ├── network-replication.test.ts
│   ├── input-gameplay.test.ts
│   ├── audio-spatial.test.ts
│   └── full-scene.test.ts
├── performance/
│   ├── benchmarks/
│   │   ├── ecs-throughput.bench.ts
│   │   ├── rendering-drawcalls.bench.ts
│   │   ├── physics-simulation.bench.ts
│   │   ├── animation-skinning.bench.ts
│   │   ├── ai-pathfinding.bench.ts
│   │   └── particle-system.bench.ts
│   └── stress/
│       ├── entity-stress.test.ts
│       ├── draw-call-stress.test.ts
│       ├── particle-stress.test.ts
│       └── physics-stress.test.ts
├── visual/
│   ├── golden/
│   │   ├── pbr-materials/
│   │   ├── lighting/
│   │   ├── shadows/
│   │   ├── post-processing/
│   │   └── ui/
│   └── snapshots/
│       └── .gitkeep
├── e2e/
│   ├── editor-workflow.test.ts
│   ├── game-loop.test.ts
│   └── asset-pipeline.test.ts
└── fixtures/
    ├── models/
    ├── textures/
    ├── scenes/
    └── configs/
```

---

## 2. Unit Testing Requirements

### 2.1 Core Module Tests

#### `tests/unit/core/Engine.test.ts`

```typescript
// Required Test Cases
describe('Engine', () => {
  describe('initialization', () => {
    test('creates with default config');
    test('creates with custom config');
    test('throws on invalid canvas');
    test('initializes subsystems in correct order');
    test('emits ready event after initialization');
  });

  describe('main loop', () => {
    test('updates at target frame rate');
    test('calls systems in correct order');
    test('handles frame time spikes');
    test('respects pause state');
    test('accumulates time correctly for fixed step');
  });

  describe('lifecycle', () => {
    test('starts and stops cleanly');
    test('disposes all resources on destroy');
    test('handles multiple start/stop cycles');
    test('emits lifecycle events');
  });
});
```

**Coverage Target**: 95%

#### `tests/unit/core/ObjectPool.test.ts`

```typescript
describe('ObjectPool', () => {
  describe('allocation', () => {
    test('acquires objects from pool');
    test('creates new objects when pool empty');
    test('respects maximum pool size');
    test('resets objects on acquire');
  });

  describe('release', () => {
    test('returns objects to pool');
    test('calls reset on release');
    test('handles double release gracefully');
    test('prunes excess objects');
  });

  describe('performance', () => {
    test('zero allocation after warmup');
    test('handles 10000 acquire/release cycles');
  });
});
```

**Coverage Target**: 100%

### 2.2 Math Module Tests

#### `tests/unit/math/Matrix4.test.ts`

```typescript
describe('Matrix4', () => {
  describe('construction', () => {
    test('creates identity matrix');
    test('creates from array');
    test('creates from columns');
    test('clones correctly');
  });

  describe('operations', () => {
    test('multiplies matrices correctly');
    test('inverts invertible matrix');
    test('returns null for singular matrix');
    test('transposes correctly');
    test('calculates determinant');
  });

  describe('transforms', () => {
    test('creates translation matrix');
    test('creates rotation from euler');
    test('creates rotation from quaternion');
    test('creates scale matrix');
    test('creates TRS composite');
    test('decomposes TRS correctly');
  });

  describe('projections', () => {
    test('creates perspective projection');
    test('creates orthographic projection');
    test('creates look-at matrix');
  });

  describe('edge cases', () => {
    test('handles near-zero values');
    test('handles very large values');
    test('maintains numerical stability');
  });
});
```

**Coverage Target**: 100%

### 2.3 ECS Module Tests

#### `tests/unit/ecs/World.test.ts`

```typescript
describe('World', () => {
  describe('entity management', () => {
    test('creates entities with unique IDs');
    test('destroys entities and recycles IDs');
    test('handles bulk entity creation');
    test('validates entity existence');
  });

  describe('component operations', () => {
    test('adds component to entity');
    test('removes component from entity');
    test('gets component from entity');
    test('checks component existence');
    test('handles component not found');
  });

  describe('queries', () => {
    test('creates query with component requirements');
    test('returns matching entities');
    test('updates query on entity changes');
    test('handles complex queries with exclusions');
    test('caches query results');
  });

  describe('systems', () => {
    test('registers systems');
    test('executes systems in priority order');
    test('passes delta time to systems');
    test('enables/disables systems');
  });

  describe('performance', () => {
    test('handles 100000 entities');
    test('iterates 100000 entities under 1ms');
    test('archetypes reduce iteration overhead');
  });
});
```

**Coverage Target**: 95%

### 2.4 Rendering Module Tests

#### `tests/unit/rendering/RenderGraph.test.ts`

```typescript
describe('RenderGraph', () => {
  describe('construction', () => {
    test('creates empty graph');
    test('adds render passes');
    test('connects pass outputs to inputs');
    test('validates resource compatibility');
  });

  describe('compilation', () => {
    test('topologically sorts passes');
    test('detects cycles');
    test('culls unused passes');
    test('merges compatible passes');
    test('allocates transient resources');
  });

  describe('execution', () => {
    test('executes passes in order');
    test('binds resources correctly');
    test('handles conditional passes');
    test('profiles pass timing');
  });

  describe('resource management', () => {
    test('reuses transient textures');
    test('respects resource lifetimes');
    test('handles resize events');
  });
});
```

**Coverage Target**: 90%

### 2.5 Physics Module Tests

#### `tests/unit/physics/PhysicsWorld.test.ts`

```typescript
describe('PhysicsWorld', () => {
  describe('simulation', () => {
    test('steps simulation at fixed rate');
    test('applies gravity correctly');
    test('handles sub-stepping');
    test('synchronizes with render frame');
  });

  describe('rigid bodies', () => {
    test('creates static body');
    test('creates dynamic body');
    test('creates kinematic body');
    test('applies forces and impulses');
    test('respects mass and inertia');
  });

  describe('collision detection', () => {
    test('detects sphere-sphere collision');
    test('detects box-box collision');
    test('detects mesh-mesh collision');
    test('generates contact points');
    test('respects collision layers');
  });

  describe('queries', () => {
    test('performs raycast');
    test('performs spherecast');
    test('performs overlap test');
    test('filters by layer mask');
  });

  describe('constraints', () => {
    test('creates fixed joint');
    test('creates hinge joint');
    test('creates ball joint');
    test('respects joint limits');
    test('applies joint motors');
  });
});
```

**Coverage Target**: 90%

### 2.6 Animation Module Tests

#### `tests/unit/animation/MotionMatching.test.ts`

```typescript
describe('MotionMatching', () => {
  describe('database', () => {
    test('builds from animation clips');
    test('extracts feature vectors');
    test('builds KD-tree index');
    test('serializes and deserializes');
  });

  describe('matching', () => {
    test('finds best matching pose');
    test('respects trajectory weight');
    test('respects pose weight');
    test('handles missing features gracefully');
  });

  describe('blending', () => {
    test('blends between matched poses');
    test('maintains foot contact');
    test('avoids foot sliding');
    test('respects blend time');
  });

  describe('performance', () => {
    test('searches 10000 poses under 1ms');
    test('handles real-time updates');
  });
});
```

**Coverage Target**: 85%

### 2.7 AI Module Tests

#### `tests/unit/ai/BehaviorTree.test.ts`

```typescript
describe('BehaviorTree', () => {
  describe('nodes', () => {
    test('action node executes task');
    test('condition node evaluates predicate');
    test('sequence runs children in order');
    test('selector tries children until success');
    test('parallel runs children concurrently');
  });

  describe('execution', () => {
    test('returns success on completion');
    test('returns failure on fail');
    test('returns running for async tasks');
    test('resumes running nodes');
    test('respects abort conditions');
  });

  describe('decorators', () => {
    test('inverter flips result');
    test('repeater loops N times');
    test('timeout limits execution');
    test('cooldown prevents re-entry');
  });

  describe('blackboard', () => {
    test('shares data between nodes');
    test('scopes data by subtree');
    test('notifies on data change');
  });
});
```

**Coverage Target**: 90%

---

## 3. Integration Testing

### 3.1 ECS-Rendering Integration

#### `tests/integration/ecs-rendering.test.ts`

```typescript
describe('ECS-Rendering Integration', () => {
  test('renders entities with MeshComponent', async () => {
    const world = new World();
    const renderer = new Renderer(canvas);

    const entity = world.createEntity();
    world.addComponent(entity, new TransformComponent());
    world.addComponent(entity, new MeshComponent(cubeMesh));
    world.addComponent(entity, new MaterialComponent(defaultMaterial));

    const renderSystem = new RenderSystem(renderer);
    world.addSystem(renderSystem);

    world.update(16);

    const snapshot = await renderer.captureSnapshot();
    expect(snapshot).toMatchGoldenImage('cube-default');
  });

  test('culls entities outside frustum', () => {
    // Create 1000 entities, only 10 in view
    // Verify only 10 draw calls
  });

  test('batches entities with same material', () => {
    // Create 100 entities with same material
    // Verify single draw call
  });

  test('sorts transparent entities back-to-front', () => {
    // Create overlapping transparent objects
    // Verify correct render order
  });
});
```

### 3.2 Physics-Animation Integration

#### `tests/integration/physics-animation.test.ts`

```typescript
describe('Physics-Animation Integration', () => {
  test('ragdoll follows physics simulation', () => {
    // Create character with skeleton
    // Enable ragdoll mode
    // Verify bones follow rigid bodies
  });

  test('animated character collides with world', () => {
    // Create animated character
    // Move through environment
    // Verify collision response
  });

  test('IK targets track physics objects', () => {
    // Create IK chain targeting moving object
    // Simulate physics
    // Verify IK solution follows target
  });

  test('cloth simulation attaches to animated skeleton', () => {
    // Create character with cloth
    // Play walk animation
    // Verify cloth responds to movement
  });
});
```

### 3.3 AI-Navigation Integration

#### `tests/integration/ai-navigation.test.ts`

```typescript
describe('AI-Navigation Integration', () => {
  test('agents follow NavMesh paths', () => {
    // Build NavMesh from level geometry
    // Create agent with path to goal
    // Verify agent reaches goal
  });

  test('agents avoid each other with RVO', () => {
    // Create crossing paths for multiple agents
    // Simulate crowd movement
    // Verify no collisions
  });

  test('agents replan on obstacle change', () => {
    // Create path through door
    // Close door mid-path
    // Verify agent finds alternate route
  });

  test('behavior tree drives navigation', () => {
    // Create patrol behavior
    // Verify agent visits waypoints
    // Interrupt with higher priority task
    // Verify agent responds
  });
});
```

### 3.4 Network-Replication Integration

#### `tests/integration/network-replication.test.ts`

```typescript
describe('Network-Replication Integration', () => {
  test('entity spawns on all clients', async () => {
    // Server creates entity
    // Verify entity appears on client
    // Verify components match
  });

  test('transform updates replicate', async () => {
    // Server moves entity
    // Verify client receives update
    // Verify interpolation smooths movement
  });

  test('client prediction prevents lag', async () => {
    // Client sends input
    // Simulate network delay
    // Verify immediate local response
    // Verify reconciliation on server ack
  });

  test('state rollback corrects misprediction', async () => {
    // Client predicts movement
    // Server disagrees (collision)
    // Verify client corrects position
  });
});
```

### 3.5 Full Scene Integration

#### `tests/integration/full-scene.test.ts`

```typescript
describe('Full Scene Integration', () => {
  test('loads and renders complete scene', async () => {
    const scene = await Scene.load('test-scene.g3d');

    // Verify all entities loaded
    expect(scene.entityCount).toBe(1500);

    // Verify rendering
    const frame = await scene.renderFrame();
    expect(frame).toMatchGoldenImage('test-scene-frame0');

    // Verify physics initialized
    expect(scene.physicsWorld.bodyCount).toBe(200);

    // Verify AI ready
    expect(scene.navMesh.isValid).toBe(true);
  });

  test('runs 60 seconds without memory leak', async () => {
    const initialMemory = performance.memory?.usedJSHeapSize;

    for (let i = 0; i < 3600; i++) {
      scene.update(16.67);
    }

    // Force GC if available
    if (global.gc) global.gc();

    const finalMemory = performance.memory?.usedJSHeapSize;
    const growth = (finalMemory - initialMemory) / initialMemory;

    expect(growth).toBeLessThan(0.1); // Max 10% growth
  });

  test('maintains 60 FPS under load', async () => {
    const frameTimes: number[] = [];

    for (let i = 0; i < 600; i++) {
      const start = performance.now();
      scene.update(16.67);
      scene.render();
      frameTimes.push(performance.now() - start);
    }

    const p95 = percentile(frameTimes, 95);
    expect(p95).toBeLessThan(16.67);
  });
});
```

---

## 4. Performance Testing

### 4.1 Benchmark Suite

#### `tests/performance/benchmarks/ecs-throughput.bench.ts`

```typescript
describe('ECS Throughput Benchmarks', () => {
  benchmark('iterate 100k entities with 1 component', () => {
    world.query(Position).forEach(([pos]) => {
      pos.x += 1;
    });
  }, {
    target: 0.5, // ms
    iterations: 1000
  });

  benchmark('iterate 100k entities with 5 components', () => {
    world.query(Position, Velocity, Health, Damage, Team).forEach(
      ([pos, vel, hp, dmg, team]) => {
        pos.x += vel.x;
      }
    );
  }, {
    target: 2, // ms
    iterations: 1000
  });

  benchmark('create/destroy 10k entities', () => {
    const entities = [];
    for (let i = 0; i < 10000; i++) {
      entities.push(world.createEntity());
    }
    for (const e of entities) {
      world.destroyEntity(e);
    }
  }, {
    target: 10, // ms
    iterations: 100
  });

  benchmark('add/remove components 10k times', () => {
    for (let i = 0; i < 10000; i++) {
      world.addComponent(entities[i], new Velocity());
    }
    for (let i = 0; i < 10000; i++) {
      world.removeComponent(entities[i], Velocity);
    }
  }, {
    target: 5, // ms
    iterations: 100
  });
});
```

#### `tests/performance/benchmarks/rendering-drawcalls.bench.ts`

```typescript
describe('Rendering Benchmarks', () => {
  benchmark('render 10k draw calls', async () => {
    await renderer.render(scene10k);
  }, {
    target: 16.67, // 60 FPS
    iterations: 100
  });

  benchmark('frustum cull 100k objects', () => {
    culler.cull(objects100k, camera.frustum);
  }, {
    target: 2, // ms
    iterations: 100
  });

  benchmark('sort 10k transparent objects', () => {
    sorter.sort(transparentObjects, camera.position);
  }, {
    target: 1, // ms
    iterations: 100
  });

  benchmark('GPU skinning 100 characters', async () => {
    await renderer.render(scene100Characters);
  }, {
    target: 5, // ms
    iterations: 100
  });
});
```

#### `tests/performance/benchmarks/physics-simulation.bench.ts`

```typescript
describe('Physics Benchmarks', () => {
  benchmark('simulate 1000 rigid bodies', () => {
    physicsWorld.step(1/60);
  }, {
    target: 5, // ms
    iterations: 600 // 10 seconds
  });

  benchmark('raycast against 10k objects', () => {
    for (let i = 0; i < 100; i++) {
      physicsWorld.raycast(randomRay(), 1000);
    }
  }, {
    target: 2, // ms for 100 raycasts
    iterations: 100
  });

  benchmark('broad phase 10k dynamic bodies', () => {
    broadPhase.update(bodies10k);
    broadPhase.computePairs();
  }, {
    target: 2, // ms
    iterations: 100
  });
});
```

#### `tests/performance/benchmarks/particle-system.bench.ts`

```typescript
describe('Particle System Benchmarks', () => {
  benchmark('update 1M particles', () => {
    particleSystem.update(16.67);
  }, {
    target: 8, // ms
    iterations: 100
  });

  benchmark('emit 100k particles', () => {
    emitter.emit(100000);
  }, {
    target: 2, // ms
    iterations: 100
  });

  benchmark('sort 1M particles for alpha', () => {
    particleSystem.sortByDepth(camera);
  }, {
    target: 5, // ms
    iterations: 100
  });

  benchmark('GPU particle simulation', async () => {
    await gpuParticles.simulate(16.67);
  }, {
    target: 2, // ms
    iterations: 100
  });
});
```

### 4.2 Stress Tests

#### `tests/performance/stress/entity-stress.test.ts`

```typescript
describe('Entity Stress Tests', () => {
  test('handles 1 million entities', () => {
    const world = new World();

    for (let i = 0; i < 1000000; i++) {
      const e = world.createEntity();
      world.addComponent(e, new Position(i, 0, 0));
    }

    expect(world.entityCount).toBe(1000000);

    // Query should still be fast
    const start = performance.now();
    let count = 0;
    world.query(Position).forEach(() => count++);
    const elapsed = performance.now() - start;

    expect(count).toBe(1000000);
    expect(elapsed).toBeLessThan(50); // 50ms max for 1M iteration
  });

  test('rapid entity create/destroy cycle', () => {
    const world = new World();

    // Simulate 10 minutes of gameplay with entity churn
    for (let frame = 0; frame < 36000; frame++) {
      // Create 10 entities
      for (let i = 0; i < 10; i++) {
        const e = world.createEntity();
        world.addComponent(e, new Position());
      }

      // Destroy 10 random entities
      const entities = Array.from(world.entities);
      for (let i = 0; i < Math.min(10, entities.length); i++) {
        const idx = Math.floor(Math.random() * entities.length);
        world.destroyEntity(entities[idx]);
        entities.splice(idx, 1);
      }

      world.update(16.67);
    }

    // Should not have memory issues
    expect(world.entityCount).toBeLessThan(100000);
  });
});
```

---

## 5. Visual Regression Testing

### 5.1 Golden Image System

#### `tests/visual/VisualTestRunner.ts`

```typescript
export class VisualTestRunner {
  private goldenDir = 'tests/visual/golden';
  private snapshotDir = 'tests/visual/snapshots';
  private threshold = 0.001; // 0.1% pixel difference allowed

  async compareToGolden(
    name: string,
    rendered: ImageData
  ): Promise<VisualTestResult> {
    const goldenPath = `${this.goldenDir}/${name}.png`;
    const snapshotPath = `${this.snapshotDir}/${name}.png`;

    const golden = await loadImage(goldenPath);
    await saveImage(snapshotPath, rendered);

    const diff = pixelDiff(golden, rendered);
    const diffPercent = diff.differentPixels / diff.totalPixels;

    if (diffPercent > this.threshold) {
      await saveImage(`${this.snapshotDir}/${name}-diff.png`, diff.image);
      return {
        passed: false,
        message: `${(diffPercent * 100).toFixed(2)}% pixels differ`,
        diffImage: `${name}-diff.png`
      };
    }

    return { passed: true };
  }

  async updateGolden(name: string, rendered: ImageData): Promise<void> {
    const goldenPath = `${this.goldenDir}/${name}.png`;
    await saveImage(goldenPath, rendered);
  }
}
```

### 5.2 Visual Test Cases

#### `tests/visual/pbr-materials.visual.ts`

```typescript
describe('PBR Materials Visual Tests', () => {
  const testCases = [
    { name: 'pbr-metal-rough-0.0', metallic: 1.0, roughness: 0.0 },
    { name: 'pbr-metal-rough-0.25', metallic: 1.0, roughness: 0.25 },
    { name: 'pbr-metal-rough-0.5', metallic: 1.0, roughness: 0.5 },
    { name: 'pbr-metal-rough-0.75', metallic: 1.0, roughness: 0.75 },
    { name: 'pbr-metal-rough-1.0', metallic: 1.0, roughness: 1.0 },
    { name: 'pbr-dielectric-rough-0.0', metallic: 0.0, roughness: 0.0 },
    { name: 'pbr-dielectric-rough-0.5', metallic: 0.0, roughness: 0.5 },
    { name: 'pbr-dielectric-rough-1.0', metallic: 0.0, roughness: 1.0 },
  ];

  for (const tc of testCases) {
    test(`renders ${tc.name} correctly`, async () => {
      const material = new PBRMaterial({
        baseColor: new Color(0.8, 0.1, 0.1),
        metallic: tc.metallic,
        roughness: tc.roughness
      });

      const scene = createMaterialTestScene(material);
      const frame = await renderer.render(scene);

      await expect(frame).toMatchGoldenImage(`pbr-materials/${tc.name}`);
    });
  }
});
```

#### `tests/visual/lighting.visual.ts`

```typescript
describe('Lighting Visual Tests', () => {
  test('directional light with shadows', async () => {
    const scene = createShadowTestScene();
    scene.addLight(new DirectionalLight({
      direction: new Vector3(-1, -1, -1),
      color: Color.WHITE,
      castShadows: true
    }));

    const frame = await renderer.render(scene);
    await expect(frame).toMatchGoldenImage('lighting/directional-shadows');
  });

  test('point light attenuation', async () => {
    const scene = createLightingTestScene();
    scene.addLight(new PointLight({
      position: new Vector3(0, 2, 0),
      color: Color.WHITE,
      range: 10
    }));

    const frame = await renderer.render(scene);
    await expect(frame).toMatchGoldenImage('lighting/point-attenuation');
  });

  test('spot light cone', async () => {
    const scene = createLightingTestScene();
    scene.addLight(new SpotLight({
      position: new Vector3(0, 5, 0),
      direction: new Vector3(0, -1, 0),
      innerAngle: 15,
      outerAngle: 30
    }));

    const frame = await renderer.render(scene);
    await expect(frame).toMatchGoldenImage('lighting/spot-cone');
  });

  test('IBL environment lighting', async () => {
    const scene = createMaterialTestScene(defaultPBRMaterial);
    scene.environment = await loadHDRI('studio.hdr');

    const frame = await renderer.render(scene);
    await expect(frame).toMatchGoldenImage('lighting/ibl-studio');
  });
});
```

#### `tests/visual/post-processing.visual.ts`

```typescript
describe('Post Processing Visual Tests', () => {
  test('bloom effect', async () => {
    scene.postProcessing.bloom = { intensity: 1.0, threshold: 0.8 };
    const frame = await renderer.render(scene);
    await expect(frame).toMatchGoldenImage('post-fx/bloom');
  });

  test('depth of field', async () => {
    scene.postProcessing.dof = {
      focusDistance: 5,
      aperture: 2.8,
      focalLength: 50
    };
    const frame = await renderer.render(scene);
    await expect(frame).toMatchGoldenImage('post-fx/dof');
  });

  test('SSAO', async () => {
    scene.postProcessing.ssao = { radius: 0.5, intensity: 1.0 };
    const frame = await renderer.render(scene);
    await expect(frame).toMatchGoldenImage('post-fx/ssao');
  });

  test('SSR', async () => {
    scene.postProcessing.ssr = { maxDistance: 10, thickness: 0.1 };
    const frame = await renderer.render(scene);
    await expect(frame).toMatchGoldenImage('post-fx/ssr');
  });

  test('TAA', async () => {
    scene.postProcessing.taa = { jitterScale: 1.0 };
    // Render multiple frames to test temporal stability
    for (let i = 0; i < 16; i++) {
      await renderer.render(scene);
    }
    const frame = await renderer.render(scene);
    await expect(frame).toMatchGoldenImage('post-fx/taa');
  });

  test('color grading LUT', async () => {
    scene.postProcessing.colorGrading = {
      lut: await loadTexture('cinematic.cube')
    };
    const frame = await renderer.render(scene);
    await expect(frame).toMatchGoldenImage('post-fx/color-grading');
  });
});
```

---

## 6. Platform Testing Matrix

### 6.1 Browser Support Matrix

| Feature | Chrome 120+ | Firefox 120+ | Safari 17+ | Edge 120+ |
|---------|------------|--------------|------------|-----------|
| WebGL2 | ✅ | ✅ | ✅ | ✅ |
| WebGPU | ✅ | 🔶 (flag) | 🔶 (preview) | ✅ |
| SharedArrayBuffer | ✅ | ✅ | ✅ | ✅ |
| OffscreenCanvas | ✅ | ✅ | ✅ | ✅ |
| Web Audio API | ✅ | ✅ | ✅ | ✅ |
| WebXR | ✅ | ✅ | ❌ | ✅ |
| WebCodecs | ✅ | 🔶 | ❌ | ✅ |
| WASM SIMD | ✅ | ✅ | ✅ | ✅ |

### 6.2 Device Testing Matrix

```
devices:
  desktop:
    - name: "High-end Gaming PC"
      gpu: "RTX 4090"
      target_fps: 120
      target_resolution: 4K

    - name: "Mid-range Desktop"
      gpu: "RTX 3060"
      target_fps: 60
      target_resolution: 1440p

    - name: "Integrated Graphics"
      gpu: "Intel UHD 770"
      target_fps: 30
      target_resolution: 1080p

  mobile:
    - name: "iPhone 15 Pro"
      gpu: "Apple A17 Pro"
      target_fps: 60
      target_resolution: "native"

    - name: "Samsung S24 Ultra"
      gpu: "Adreno 750"
      target_fps: 60
      target_resolution: "native"

    - name: "Budget Android"
      gpu: "Mali-G57"
      target_fps: 30
      target_resolution: "720p"

  xr:
    - name: "Meta Quest 3"
      target_fps: 72
      target_resolution: "per-eye native"

    - name: "Apple Vision Pro"
      target_fps: 90
      target_resolution: "per-eye native"
```

### 6.3 CI Platform Tests

#### `.github/workflows/platform-tests.yml`

```yaml
name: Platform Tests

on: [push, pull_request]

jobs:
  chrome-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: browser-actions/setup-chrome@v1
        with:
          chrome-version: stable
      - run: npm ci
      - run: npm run test:chrome

  firefox-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: browser-actions/setup-firefox@v1
        with:
          firefox-version: latest
      - run: npm ci
      - run: npm run test:firefox

  safari-tests:
    runs-on: macos-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm ci
      - run: npm run test:safari

  visual-regression:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: browser-actions/setup-chrome@v1
      - run: npm ci
      - run: npm run test:visual
      - uses: actions/upload-artifact@v4
        if: failure()
        with:
          name: visual-diffs
          path: tests/visual/snapshots/*-diff.png
```

---

## 7. Performance Budgets

### 7.1 Frame Budget Breakdown (16.67ms target)

```
FRAME_BUDGET_60FPS:
  total: 16.67ms

  breakdown:
    input_processing: 0.5ms
    ecs_update: 2.0ms
    physics_step: 3.0ms
    animation_update: 2.0ms
    ai_update: 1.5ms
    render_graph_execute: 6.0ms
    audio_update: 0.5ms
    gc_allowance: 1.17ms

  sub_budgets:
    physics:
      broad_phase: 0.5ms
      narrow_phase: 1.5ms
      solver: 1.0ms

    render:
      culling: 1.0ms
      sorting: 0.5ms
      draw_calls: 4.0ms
      post_processing: 0.5ms
```

### 7.2 Memory Budgets

```
MEMORY_BUDGET:
  total_js_heap: 512MB

  breakdown:
    ecs_world: 64MB
    mesh_data: 128MB
    texture_cache: 128MB
    animation_data: 32MB
    physics_world: 32MB
    audio_buffers: 32MB
    ui_system: 16MB
    misc: 80MB

  gpu_memory:
    textures: 1024MB
    vertex_buffers: 256MB
    index_buffers: 64MB
    uniform_buffers: 32MB
    render_targets: 512MB

  limits:
    max_texture_size: 4096x4096
    max_mesh_vertices: 10_000_000
    max_active_sounds: 64
    max_ui_elements: 10_000
```

### 7.3 Loading Budgets

```
LOADING_BUDGET:
  initial_load:
    engine_core: 500KB
    shaders_compiled: 200KB
    default_assets: 1MB
    total_blocking: 1.7MB
    target_time: 2s

  scene_load:
    small_scene: 5MB / 3s
    medium_scene: 25MB / 8s
    large_scene: 100MB / 20s

  streaming:
    texture_budget: 32MB/s
    mesh_budget: 16MB/s
    audio_budget: 8MB/s
```

### 7.4 Subsystem-Specific Budgets

```
SUBSYSTEM_BUDGETS:
  ecs:
    max_entities: 1_000_000
    iteration_per_100k: 1ms
    component_add: 0.001ms
    entity_create: 0.01ms

  rendering:
    max_draw_calls: 10_000
    max_triangles: 10_000_000
    max_lights: 1024
    max_shadow_casters: 16

  physics:
    max_rigid_bodies: 10_000
    max_contacts: 50_000
    max_raycasts_per_frame: 1000

  animation:
    max_skinned_meshes: 200
    max_bones_total: 20_000
    max_blend_shapes: 100

  particles:
    max_particles: 1_000_000
    max_emitters: 1000

  ai:
    max_nav_agents: 1000
    max_behavior_trees: 500
    pathfind_per_frame: 100

  audio:
    max_simultaneous_sounds: 64
    max_reverb_zones: 8

  ui:
    max_elements: 10_000
    max_draw_calls: 100
```

---

## 8. Implementation Phases

### Phase A: Core Foundation (Weeks 1-4)

**Scope**: Essential infrastructure required by all other systems

**Directories**:
```
src/
├── core/           (100% complete)
├── math/           (100% complete)
├── ecs/            (100% complete)
└── types/          (100% complete)
```

**Files**: ~50 files

**Detailed Checklist**:

#### Core (`src/core/`)
- [ ] **Engine.ts**
  - [ ] Initialization sequence with subsystem registration
  - [ ] Main loop with requestAnimationFrame
  - [ ] Fixed timestep accumulator
  - [ ] Pause/resume functionality
  - [ ] Event emission for lifecycle
  - [ ] Clean disposal of all resources
  - [ ] Unit tests passing
  - [ ] Integration test with ECS

- [ ] **Time.ts**
  - [ ] deltaTime calculation
  - [ ] fixedDeltaTime with accumulator
  - [ ] timeScale support
  - [ ] frameCount tracking
  - [ ] Performance.now wrapper
  - [ ] Unit tests passing

- [ ] **Logger.ts**
  - [ ] Log levels (debug, info, warn, error)
  - [ ] Namespaced loggers
  - [ ] Console output with formatting
  - [ ] Log filtering
  - [ ] Performance logging
  - [ ] Unit tests passing

- [ ] **ObjectPool.ts**
  - [ ] Generic type support
  - [ ] Factory function injection
  - [ ] Reset function injection
  - [ ] Max size limiting
  - [ ] Zero allocation after warmup
  - [ ] Unit tests passing
  - [ ] Performance benchmark passing

#### Math (`src/math/`)
- [ ] **Vector2.ts** - All operations, unit tests, benchmarks
- [ ] **Vector3.ts** - All operations, unit tests, benchmarks
- [ ] **Vector4.ts** - All operations, unit tests, benchmarks
- [ ] **Matrix3.ts** - All operations, unit tests
- [ ] **Matrix4.ts** - All operations, projections, decomposition, unit tests
- [ ] **Quaternion.ts** - All operations, slerp, fromEuler, unit tests
- [ ] **AABB.ts** - Intersection tests, merge, expand, unit tests
- [ ] **OBB.ts** - SAT intersection, transform, unit tests
- [ ] **Sphere.ts** - All intersections, unit tests
- [ ] **Ray.ts** - All intersections, unit tests
- [ ] **Plane.ts** - Distance, intersection, unit tests
- [ ] **Frustum.ts** - Contains tests, extraction from matrix, unit tests
- [ ] **Transform.ts** - TRS composition, hierarchy, unit tests
- [ ] **Color.ts** - Conversion, blending, unit tests
- [ ] **Curve.ts** - Bezier, Catmull-Rom, sampling, unit tests
- [ ] **Spline.ts** - Multi-segment curves, length, unit tests
- [ ] **Noise.ts** - Perlin, Simplex, FBM, unit tests
- [ ] **Random.ts** - Seeded PRNG, distributions, unit tests

#### ECS (`src/ecs/`)
- [ ] **World.ts**
  - [ ] Entity creation/destruction with ID recycling
  - [ ] Component storage with archetypes
  - [ ] Query system with caching
  - [ ] System registration and ordering
  - [ ] Event dispatch
  - [ ] Serialization support
  - [ ] Unit tests passing
  - [ ] Performance benchmarks passing (100k entities @ 120 FPS)

- [ ] **Entity.ts** - ID management, generation tracking, unit tests
- [ ] **Component.ts** - Base class, registration, schema, unit tests
- [ ] **System.ts** - Base class, priority, enabled state, unit tests
- [ ] **Archetype.ts** - Component signature, chunk storage, unit tests
- [ ] **Query.ts** - Include/exclude, iteration, caching, unit tests
- [ ] **Scheduler.ts** - Priority execution, parallel groups, unit tests
- [ ] **Serializer.ts** - JSON/binary serialization, unit tests

**Phase A Completion Criteria**:
- [ ] All 50 files implemented with no TODOs
- [ ] Unit test coverage > 95%
- [ ] Performance benchmarks passing
- [ ] No memory leaks in 10-minute stress test
- [ ] Documentation generated
- [ ] Integration test: Create 100k entities, iterate, destroy

---

### Phase B: Rendering Pipeline (Weeks 5-10)

**Scope**: Complete rendering system with WebGL2 and WebGPU backends

**Directories**:
```
src/
├── rendering/
│   ├── core/           (100% complete)
│   ├── backends/       (100% complete)
│   ├── passes/         (100% complete)
│   └── culling/        (100% complete)
├── shaders/
│   ├── compiler/       (100% complete)
│   ├── chunks/         (100% complete)
│   └── compute/        (100% complete)
└── materials/
    ├── core/           (100% complete)
    └── types/          (100% complete)
```

**Files**: ~150 files

**Detailed Checklist**:

#### Rendering Core
- [ ] **Renderer.ts** - Backend abstraction, frame submission, unit tests
- [ ] **RenderGraph.ts** - Pass management, compilation, culling, unit tests
- [ ] **Camera.ts** - Projection modes, frustum extraction, unit tests
- [ ] **Mesh.ts** - Vertex formats, submeshes, bounds, unit tests
- [ ] **Texture.ts** - All formats, sampling, mipmaps, unit tests
- [ ] **RenderTarget.ts** - Attachments, MSAA, resize, unit tests
- [ ] **Pipeline.ts** - State management, caching, unit tests
- [ ] **UniformBuffer.ts** - Layout, updates, binding, unit tests
- [ ] **GeometryBuffer.ts** - G-buffer management, unit tests
- [ ] **BatchRenderer.ts** - Instancing, sorting, unit tests

#### Backends
- [ ] **WebGL2Backend.ts** - Full implementation, all features
- [ ] **WebGPUBackend.ts** - Full implementation, compute support
- [ ] **BackendFactory.ts** - Feature detection, fallback

#### Render Passes (25 passes)
- [ ] **GeometryPass.ts** - G-buffer filling, visual test
- [ ] **ShadowPass.ts** - CSM, PCF, visual test
- [ ] **LightingPass.ts** - Deferred/forward, visual test
- [ ] **SSAOPass.ts** - GTAO implementation, visual test
- [ ] **SSRPass.ts** - Hi-Z tracing, visual test
- [ ] **SSGIPass.ts** - Screen-space GI, visual test
- [ ] **BloomPass.ts** - Downsample/upsample, visual test
- [ ] **DOFPass.ts** - Bokeh simulation, visual test
- [ ] **MotionBlurPass.ts** - Per-object/camera, visual test
- [ ] **TAAPass.ts** - Temporal accumulation, visual test
- [ ] **TonemapPass.ts** - Multiple operators, visual test
- [ ] **FXAAPass.ts** - Edge detection, visual test
- [ ] **VolumetricPass.ts** - Ray marching, visual test
- [ ] **TransparencyPass.ts** - OIT, visual test
- [ ] **SkyPass.ts** - Procedural/cubemap, visual test
- [ ] **AtmospherePass.ts** - Rayleigh/Mie, visual test
- [ ] **CloudPass.ts** - Volumetric clouds, visual test
- [ ] **DecalPass.ts** - Deferred decals, visual test
- [ ] **OutlinePass.ts** - Object outlines, visual test
- [ ] **WireframePass.ts** - Debug wireframe, visual test
- [ ] **GizmoPass.ts** - Editor gizmos, visual test
- [ ] **DebugPass.ts** - Buffer visualization, visual test
- [ ] **UIPass.ts** - 2D UI rendering, visual test
- [ ] **TextPass.ts** - SDF text, visual test
- [ ] **CompositePass.ts** - Final composition, visual test

#### Culling
- [ ] **FrustumCuller.ts** - AABB/OBB/Sphere tests, unit tests
- [ ] **OcclusionCuller.ts** - Hi-Z culling, GPU queries, unit tests
- [ ] **LODSelector.ts** - Screen-size LOD, hysteresis, unit tests
- [ ] **DistanceCuller.ts** - Max distance culling, unit tests

#### Shaders
- [ ] **ShaderCompiler.ts** - GLSL generation, includes, unit tests
- [ ] **ShaderGraph.ts** - Node-based generation, unit tests
- [ ] **ShaderCache.ts** - Compiled shader caching, unit tests
- [ ] All 27 shader chunks implemented
- [ ] All 15 compute shaders implemented

#### Materials
- [ ] **Material.ts** - Base class, properties, unit tests
- [ ] **MaterialLibrary.ts** - Registration, lookup, unit tests
- [ ] **MaterialInstance.ts** - Override support, unit tests
- [ ] All 24 material types implemented with visual tests

**Phase B Completion Criteria**:
- [ ] All 150 files implemented with no TODOs
- [ ] Unit test coverage > 90%
- [ ] All visual regression tests passing
- [ ] Performance: 10k draw calls @ 60 FPS
- [ ] Both WebGL2 and WebGPU backends functional
- [ ] Integration test: Load and render PBR scene

---

### Phase C: Physics & Animation (Weeks 11-16)

**Scope**: Physics simulation and animation systems

**Directories**:
```
src/
├── physics/
│   ├── core/           (100% complete)
│   ├── backends/       (100% complete)
│   ├── collision/      (100% complete)
│   ├── dynamics/       (100% complete)
│   └── simulation/     (100% complete)
└── animation/
    ├── core/           (100% complete)
    ├── skeletal/       (100% complete)
    ├── ik/             (100% complete)
    └── procedural/     (100% complete)
```

**Files**: ~120 files

**Detailed Checklist**:

#### Physics Core
- [ ] **PhysicsWorld.ts** - Simulation loop, sub-stepping, unit tests
- [ ] **RigidBody.ts** - All body types, forces, unit tests
- [ ] **Collider.ts** - All shapes, compound, unit tests
- [ ] **PhysicsMaterial.ts** - Friction, restitution, unit tests
- [ ] **ContactSolver.ts** - Impulse resolution, unit tests
- [ ] **BroadPhase.ts** - BVH/Grid, pair generation, unit tests
- [ ] **NarrowPhase.ts** - GJK/EPA, contact points, unit tests

#### Physics Backends
- [ ] **CannonBackend.ts** - Full integration
- [ ] **RapierBackend.ts** - Full integration with WASM
- [ ] **AmmoBackend.ts** - Bullet physics integration

#### Collision
- [ ] All primitive collision detectors
- [ ] Mesh-mesh collision with BVH
- [ ] Continuous collision detection
- [ ] Trigger volumes

#### Dynamics
- [ ] **CharacterController.ts** - Ground detection, slopes, stairs, unit tests
- [ ] **VehiclePhysics.ts** - Wheel simulation, suspension, unit tests
- [ ] All joint types implemented

#### Simulation
- [ ] **ClothSimulation.ts** - PBD solver, visual test
- [ ] **SoftBodySimulation.ts** - Volume preservation, visual test
- [ ] **FluidSimulation.ts** - SPH solver, visual test
- [ ] **MPMSimulation.ts** - Material point method, visual test
- [ ] **RopeSimulation.ts** - Distance constraints, visual test

#### Animation Core
- [ ] **AnimationClip.ts** - Keyframes, interpolation, unit tests
- [ ] **AnimationMixer.ts** - Blending, layers, unit tests
- [ ] **AnimationTrack.ts** - All track types, unit tests
- [ ] **AnimationEvent.ts** - Callbacks, foot events, unit tests

#### Skeletal Animation
- [ ] **Skeleton.ts** - Bone hierarchy, bind pose, unit tests
- [ ] **SkinnedMesh.ts** - GPU skinning, visual test
- [ ] **StateMachine.ts** - Transitions, conditions, unit tests
- [ ] **BlendTree.ts** - 1D/2D blending, unit tests
- [ ] **MotionMatching.ts** - Full implementation, unit tests, visual test
- [ ] **AnimationRetargeting.ts** - Different skeletons, visual test
- [ ] **RootMotion.ts** - Animation-driven movement, unit tests

#### IK
- [ ] **CCDSolver.ts** - Chain IK, visual test
- [ ] **FABRIKSolver.ts** - Multi-chain IK, visual test
- [ ] **FullBodyIK.ts** - Full skeleton IK, visual test
- [ ] **LookAtIK.ts** - Head/eye tracking, visual test
- [ ] **FootIK.ts** - Ground alignment, visual test

#### Procedural Animation
- [ ] **ProceduralWalk.ts** - Gait generation, visual test
- [ ] **SpringBones.ts** - Dynamic bones, visual test
- [ ] **JigglePhysics.ts** - Soft body dynamics, visual test

**Phase C Completion Criteria**:
- [ ] All 120 files implemented with no TODOs
- [ ] Unit test coverage > 85%
- [ ] Physics: 1000 bodies @ 60 FPS
- [ ] Animation: 100 skinned characters @ 60 FPS
- [ ] Integration test: Ragdoll falling on animated character

---

### Phase D: AI & World Systems (Weeks 17-22)

**Scope**: AI, navigation, terrain, ocean, weather

**Directories**:
```
src/
├── ai/
│   ├── navigation/     (100% complete)
│   ├── behavior/       (100% complete)
│   ├── perception/     (100% complete)
│   └── ml/             (100% complete)
└── world/
    ├── terrain/        (100% complete)
    ├── voxel/          (100% complete)
    ├── ocean/          (100% complete)
    └── weather/        (100% complete)
```

**Files**: ~100 files

**Detailed Checklist**:

#### Navigation
- [ ] **NavMesh.ts** - Generation, serialization, unit tests
- [ ] **NavMeshBuilder.ts** - Voxelization, region building, unit tests
- [ ] **Pathfinder.ts** - A* with string pulling, unit tests
- [ ] **NavMeshQuery.ts** - Point/ray queries, unit tests
- [ ] **CrowdManager.ts** - RVO/ORCA avoidance, visual test
- [ ] **NavMeshAgent.ts** - Steering, corridor, unit tests
- [ ] **OffMeshLink.ts** - Jumps, ladders, unit tests
- [ ] **DynamicObstacles.ts** - Runtime updates, unit tests

#### Behavior
- [ ] **BehaviorTree.ts** - All node types, unit tests
- [ ] **BTNodes.ts** - All decorators, composites, unit tests
- [ ] **Blackboard.ts** - Data sharing, scopes, unit tests
- [ ] **FSM.ts** - States, transitions, unit tests
- [ ] **GOAP.ts** - Action planning, unit tests
- [ ] **HTNPlanner.ts** - Hierarchical planning, unit tests
- [ ] **UtilityAI.ts** - Consideration scoring, unit tests

#### Perception
- [ ] **SightSensor.ts** - FOV, occlusion, unit tests
- [ ] **HearingSensor.ts** - Sound propagation, unit tests
- [ ] **ProximitySensor.ts** - Range detection, unit tests
- [ ] **MemorySystem.ts** - Knowledge persistence, unit tests
- [ ] **StimulusManager.ts** - Event broadcasting, unit tests

#### ML
- [ ] **ONNXInference.ts** - Model loading, execution, unit tests
- [ ] **TensorUtils.ts** - Data conversion, unit tests
- [ ] **MLAnimator.ts** - Neural motion synthesis, visual test
- [ ] **ComputerVision.ts** - Image classification, unit tests

#### Terrain
- [ ] **HeightmapTerrain.ts** - LOD, splatmap, visual test
- [ ] **TerrainLOD.ts** - CDLOD/Geoclipmaps, visual test
- [ ] **ErosionSimulator.ts** - Hydraulic erosion, visual test
- [ ] **VegetationSystem.ts** - Instanced foliage, visual test
- [ ] **TerrainPhysics.ts** - Collision mesh, unit tests
- [ ] **TerrainStreaming.ts** - Tile loading, unit tests

#### Voxel
- [ ] **VoxelWorld.ts** - Chunk management, unit tests
- [ ] **VoxelChunk.ts** - Data storage, unit tests
- [ ] **GreedyMesher.ts** - Optimized meshing, unit tests
- [ ] **MarchingCubes.ts** - Smooth terrain, visual test
- [ ] **VoxelPhysics.ts** - Block collision, unit tests
- [ ] **VoxelDestruction.ts** - Runtime modification, visual test

#### Ocean
- [ ] **FFTOcean.ts** - Phillips spectrum, visual test
- [ ] **GerstnerWaves.ts** - Analytical waves, visual test
- [ ] **OceanRenderer.ts** - Projection grid, visual test
- [ ] **WaterPhysics.ts** - Buoyancy, unit tests
- [ ] **Foam.ts** - Jacobian-based foam, visual test
- [ ] **Underwater.ts** - Caustics, fog, visual test

#### Weather
- [ ] **WeatherSystem.ts** - State transitions, unit tests
- [ ] **RainRenderer.ts** - GPU particles, visual test
- [ ] **SnowRenderer.ts** - Accumulation, visual test
- [ ] **LightningSystem.ts** - Bolt generation, visual test
- [ ] **WindSystem.ts** - Global/local wind, unit tests
- [ ] **FogSystem.ts** - Volumetric fog, visual test

**Phase D Completion Criteria**:
- [ ] All 100 files implemented with no TODOs
- [ ] Unit test coverage > 85%
- [ ] AI: 1000 agents with pathfinding @ 60 FPS
- [ ] Terrain: 100km² streaming @ 60 FPS
- [ ] Ocean: FFT ocean with buoyancy @ 60 FPS
- [ ] Integration test: Open world with AI, terrain, weather

---

### Phase E: Infrastructure (Weeks 23-28)

**Scope**: Networking, input, UI, audio, assets

**Directories**:
```
src/
├── network/           (100% complete)
├── input/             (100% complete)
├── ui/                (100% complete)
├── audio/             (100% complete)
└── assets/            (100% complete)
```

**Files**: ~100 files

**Detailed Checklist**:

#### Networking
- [ ] **NetworkManager.ts** - Connection management, unit tests
- [ ] **Replication.ts** - Entity sync, delta compression, unit tests
- [ ] **RPCSystem.ts** - Remote calls, unit tests
- [ ] **Prediction.ts** - Client-side prediction, unit tests
- [ ] **Reconciliation.ts** - Server authority, unit tests
- [ ] **Interpolation.ts** - Smooth remote entities, unit tests
- [ ] **VoiceChat.ts** - WebRTC integration, unit tests
- [ ] **Matchmaking.ts** - Lobby system, unit tests

#### Input
- [ ] **InputManager.ts** - Device abstraction, unit tests
- [ ] **ActionMapping.ts** - Input actions, unit tests
- [ ] **KeyboardInput.ts** - Key events, unit tests
- [ ] **MouseInput.ts** - Position, buttons, wheel, unit tests
- [ ] **GamepadInput.ts** - Standard mapping, unit tests
- [ ] **TouchInput.ts** - Multi-touch, gestures, unit tests
- [ ] **XRInput.ts** - Controllers, hand tracking, unit tests
- [ ] **InputRecorder.ts** - Replay system, unit tests

#### UI
- [ ] **UIElement.ts** - Base class, lifecycle, unit tests
- [ ] **UIRenderer.ts** - Batched rendering, visual test
- [ ] **Layout.ts** - Flexbox implementation, visual test
- [ ] **Panel.ts** - Container element, visual test
- [ ] **Button.ts** - Click handling, visual test
- [ ] **Label.ts** - Text rendering, visual test
- [ ] **Image.ts** - Sprite rendering, visual test
- [ ] **Slider.ts** - Value control, visual test
- [ ] **ScrollView.ts** - Scrollable content, visual test
- [ ] **Dropdown.ts** - Selection menu, visual test
- [ ] **Modal.ts** - Popup dialogs, visual test
- [ ] **Theme.ts** - Style system, visual test

#### Audio
- [ ] **AudioEngine.ts** - Web Audio wrapper, unit tests
- [ ] **SpatialAudio.ts** - 3D positioning, unit tests
- [ ] **AudioSource.ts** - Playback control, unit tests
- [ ] **AudioListener.ts** - Receiver position, unit tests
- [ ] **AudioMixer.ts** - Channels, ducking, unit tests
- [ ] **ReverbZone.ts** - Environmental audio, unit tests
- [ ] **AudioOcclusion.ts** - Sound obstruction, unit tests
- [ ] **MusicSystem.ts** - Adaptive music, unit tests
- [ ] **BeatDetection.ts** - Rhythm analysis, unit tests

#### Assets
- [ ] **AssetLoader.ts** - Generic loading, unit tests
- [ ] **AssetCache.ts** - LRU caching, unit tests
- [ ] **AssetBundle.ts** - Packaged assets, unit tests
- [ ] **GLTFLoader.ts** - Full spec support, unit tests
- [ ] **TextureLoader.ts** - All formats, unit tests
- [ ] **AudioLoader.ts** - All formats, unit tests
- [ ] **AssetStreaming.ts** - Progressive loading, unit tests
- [ ] **AssetDatabase.ts** - Editor asset management, unit tests

**Phase E Completion Criteria**:
- [ ] All 100 files implemented with no TODOs
- [ ] Unit test coverage > 85%
- [ ] Network: 16-player game with prediction
- [ ] UI: 10k elements @ 60 FPS
- [ ] Audio: 64 simultaneous spatial sounds
- [ ] Integration test: Multiplayer game with full UI

---

### Phase F: Tooling & Polish (Weeks 29-36)

**Scope**: Editor, visual scripting, profiling, domain packs

**Directories**:
```
src/
├── editor/            (100% complete)
├── visual-scripting/  (100% complete)
├── timeline/          (100% complete)
├── profiling/         (100% complete)
├── analytics/         (100% complete)
├── cloud/             (100% complete)
├── localization/      (100% complete)
└── domain-packs/      (100% complete)
```

**Files**: ~200 files

**Detailed Checklist**:

#### Editor
- [ ] All selection tools
- [ ] All transform gizmos
- [ ] History/undo system
- [ ] Scene hierarchy
- [ ] Property inspector
- [ ] Asset browser
- [ ] Prefab system
- [ ] Multi-selection editing

#### Visual Scripting
- [ ] Graph editor
- [ ] All node types (100+)
- [ ] Execution engine
- [ ] Debugging tools
- [ ] Code generation

#### Timeline
- [ ] Track system
- [ ] Keyframe editing
- [ ] Curve editor
- [ ] Cinematic playback
- [ ] Camera sequencing

#### Profiling
- [ ] GPU profiler
- [ ] CPU profiler
- [ ] Memory profiler
- [ ] Network profiler
- [ ] Debug overlays

#### Domain Packs
- [ ] Scientific visualization
- [ ] Medical imaging
- [ ] Architecture/BIM
- [ ] XR support
- [ ] E-commerce

**Phase F Completion Criteria**:
- [ ] All 200 files implemented with no TODOs
- [ ] Unit test coverage > 80%
- [ ] Editor fully functional
- [ ] Visual scripting can create complete game
- [ ] All domain packs verified
- [ ] Full documentation

---

## 9. Phase Completion Criteria

### 9.1 Universal Completion Requirements

Every phase must meet these criteria before considered complete:

```
COMPLETION_REQUIREMENTS:
  code:
    - All files in scope implemented
    - No TODO comments in code
    - No placeholder implementations
    - No stub functions
    - All TypeScript types defined
    - No 'any' types (except justified)

  testing:
    - Unit test coverage > target%
    - All integration tests passing
    - Performance benchmarks meeting targets
    - Visual regression tests passing
    - No memory leaks detected

  documentation:
    - All public APIs documented
    - Usage examples provided
    - Architecture diagrams updated
    - CHANGELOG updated

  review:
    - Code review completed
    - Security review passed
    - Performance review passed
    - API review passed
```

### 9.2 Phase Sign-off Checklist

#### Phase A Sign-off
- [ ] Core initialization and shutdown clean
- [ ] Math operations verified against reference implementations
- [ ] ECS handles 100k entities at 120 FPS
- [ ] All object pools tested for zero-allocation after warmup
- [ ] Memory profiling shows no leaks over 10 minutes

#### Phase B Sign-off
- [ ] WebGL2 backend renders all test scenes correctly
- [ ] WebGPU backend renders all test scenes correctly
- [ ] Render graph handles all pass dependencies
- [ ] All 25 render passes produce correct output
- [ ] 10k draw calls achieved at 60 FPS
- [ ] All materials visually validated

#### Phase C Sign-off
- [ ] Physics simulation stable over 10 minutes
- [ ] 1000 rigid bodies at 60 FPS
- [ ] Character controller handles all terrain types
- [ ] Animation blending smooth and artifact-free
- [ ] Motion matching produces natural motion
- [ ] IK solvers reach all targets
- [ ] Ragdoll transitions smoothly from animation

#### Phase D Sign-off
- [ ] NavMesh generates correctly for test levels
- [ ] 1000 AI agents navigate without collision
- [ ] Behavior trees execute complex behaviors
- [ ] Terrain renders at 100km² at 60 FPS
- [ ] Ocean simulation realistic at 60 FPS
- [ ] Weather transitions smooth

#### Phase E Sign-off
- [ ] 16-player networking stable
- [ ] Client prediction feels responsive
- [ ] All input devices supported
- [ ] UI layout matches design specs
- [ ] All UI interactions responsive
- [ ] Spatial audio positioned correctly
- [ ] Asset streaming maintains frame rate

#### Phase F Sign-off
- [ ] Editor enables full game creation
- [ ] Visual scripting creates playable game
- [ ] Timeline creates cinematic sequence
- [ ] Profiler identifies bottlenecks accurately
- [ ] All domain packs functional
- [ ] Full documentation complete

---

## 10. Master Checklist

### 10.1 File Count Summary

| Category | Target Files | Phase |
|----------|--------------|-------|
| Core | 8 | A |
| Math | 18 | A |
| ECS | 24 | A |
| Types | ~50 | A |
| **Phase A Total** | **~100** | |
| Rendering | 60 | B |
| Shaders | 50 | B |
| Materials | 40 | B |
| **Phase B Total** | **~150** | |
| Physics | 60 | C |
| Animation | 60 | C |
| **Phase C Total** | **~120** | |
| AI | 50 | D |
| World | 50 | D |
| **Phase D Total** | **~100** | |
| Infrastructure | 100 | E |
| **Phase E Total** | **~100** | |
| Tooling | 200 | F |
| **Phase F Total** | **~200** | |
| Tests | 180 | All |
| **GRAND TOTAL** | **~950** | |

### 10.2 Critical Path Items

These items block multiple other systems and must be prioritized:

```
CRITICAL_PATH:
  1. Engine.ts → All systems
  2. World.ts (ECS) → All gameplay systems
  3. Renderer.ts → All visual systems
  4. RenderGraph.ts → All render passes
  5. PhysicsWorld.ts → All physics features
  6. AnimationMixer.ts → All animation features
  7. NavMesh.ts → All AI navigation
  8. NetworkManager.ts → All multiplayer features
  9. AssetLoader.ts → All content loading
  10. UIRenderer.ts → All UI features
```

### 10.3 Risk Registry

| Risk | Impact | Mitigation |
|------|--------|------------|
| WebGPU browser support | High | Maintain WebGL2 fallback |
| Performance on mobile | High | Aggressive LOD, reduced features |
| WASM physics bundle size | Medium | Lazy loading, code splitting |
| Cross-browser shader differences | Medium | Extensive testing matrix |
| Memory constraints on mobile | High | Streaming, unloading, pools |
| Complex AI CPU usage | Medium | Job system, LOD AI |

### 10.4 Final Delivery Checklist

- [ ] All 950+ source files implemented
- [ ] All 180+ test files implemented
- [ ] Zero TODO/FIXME comments in codebase
- [ ] Unit test coverage > 85% overall
- [ ] All visual regression tests passing
- [ ] All performance benchmarks meeting targets
- [ ] Memory leak free (verified with 1-hour soak test)
- [ ] Works on all target browsers
- [ ] Works on all target devices
- [ ] Full API documentation generated
- [ ] Getting started guide complete
- [ ] Example projects working
- [ ] Migration guide from v4 complete
- [ ] Performance tuning guide complete
- [ ] Security audit passed
- [ ] License compliance verified

---

## Document Navigation

| Document | Content |
|----------|---------|
| `PRD-Final-00-Overview.md` | Vision, rules, structure |
| `PRD-Final-01-Core-Math-ECS.md` | Foundation systems |
| `PRD-Final-02-Rendering.md` | Rendering pipeline |
| `PRD-Final-03-Shaders-Materials-PostFX.md` | Visual systems |
| `PRD-Final-04-Physics-Simulation.md` | Physics engine |
| `PRD-Final-05-Animation.md` | Animation systems |
| `PRD-Final-06-AI-ML.md` | AI and machine learning |
| `PRD-Final-07-World-Systems.md` | Terrain, ocean, weather |
| `PRD-Final-08-Domain-Packs.md` | Specialized domains |
| `PRD-Final-09-Infrastructure.md` | Networking, input, UI, audio |
| `PRD-Final-10-Tooling.md` | Editor, scripting, profiling |
| **`PRD-Final-11-Testing-Phases.md`** | **Testing & phases (this doc)** |

---

**END OF G3D 5.0 PRD SERIES**

*Total estimated implementation: ~950 files across 12 documents*
*No stubs. No TODOs. No placeholders. Ship-ready specifications.*
