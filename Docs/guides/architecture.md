# G3D 5.0 Architecture Overview

## Table of Contents
1. [Introduction](#introduction)
2. [High-Level Architecture](#high-level-architecture)
3. [Module Dependency Graph](#module-dependency-graph)
4. [Data Flow](#data-flow)
5. [System Execution Order](#system-execution-order)
6. [Integration Points](#integration-points)
7. [Design Patterns](#design-patterns)
8. [Performance Considerations](#performance-considerations)

---

## Introduction

G3D 5.0 is built with a modular, layered architecture that separates concerns and promotes reusability. The engine follows a data-oriented design philosophy centered around an Entity Component System (ECS), with specialized systems for rendering, physics, animation, and more.

### Core Principles

1. **Data-Oriented Design**: Data and behavior are separated for better cache performance
2. **Modularity**: Each module is self-contained with clear interfaces
3. **Type Safety**: TypeScript provides compile-time type checking
4. **Performance**: Optimized for high-performance real-time applications
5. **Extensibility**: Easy to add new components and systems

---

## High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Application Layer                        │
│  (Game Code, Scientific Apps, Medical Viewers, E-commerce, etc) │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────────────┐
│                      Domain Packs Layer                         │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐      │
│  │Scientific│ Medical  │  Arch.   │    XR    │E-commerce│      │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘      │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────────────┐
│                      Tooling Layer                              │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐      │
│  │  Editor  │Scripting │ Timeline │Profiling │Analytics │      │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘      │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────────────┐
│                   Infrastructure Layer                          │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐      │
│  │  Input   │  Audio   │  Assets  │    UI    │    Net   │      │
│  ├──────────┼──────────┼──────────┼──────────┼──────────┤      │
│  │  World   │Materials │  Serial. │   Cloud  │   L10n   │      │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘      │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────────────┐
│                     Game Systems Layer                          │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐      │
│  │    AI    │Particles │ Terrain  │  Voxel   │  Ocean   │      │
│  ├──────────┼──────────┼──────────┼──────────┼──────────┤      │
│  │ Weather  │          │          │          │          │      │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘      │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────────────┐
│                    Simulation Layer                             │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐      │
│  │ Physics  │Animation │  Cloth   │  Fluid   │ Fracture │      │
│  ├──────────┼──────────┼──────────┼──────────┼──────────┤      │
│  │   Fire   │  Smoke   │ SoftBody │          │          │      │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘      │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────────────┐
│                     Rendering Layer                             │
│  ┌──────────┬──────────┬──────────┬──────────┬──────────┐      │
│  │Rendering │ Shaders  │ Post-FX  │Materials │          │      │
│  │  (WebGL2 │          │          │          │          │      │
│  │  WebGPU) │          │          │          │          │      │
│  └──────────┴──────────┴──────────┴──────────┴──────────┘      │
└───────────────────────────┬─────────────────────────────────────┘
                            │
┌───────────────────────────┴─────────────────────────────────────┐
│                     Foundation Layer                            │
│  ┌──────────┬──────────┬──────────┬──────────┐                 │
│  │   Core   │   Math   │   ECS    │  Types   │                 │
│  │(Engine,  │(Vector,  │(World,   │(Shared   │                 │
│  │ Time,    │ Matrix,  │ Entity,  │ Types &  │                 │
│  │ Events)  │  Quat)   │  Comp.)  │Interface)│                 │
│  └──────────┴──────────┴──────────┴──────────┘                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Module Dependency Graph

### Foundation Layer (No Dependencies)

```
core/
  ├── Engine.ts
  ├── Time.ts
  ├── Logger.ts
  ├── EventBus.ts
  ├── ObjectPool.ts
  ├── Panic.ts
  ├── Random.ts
  ├── IdGenerator.ts
  └── BuildInfo.ts

math/
  ├── Vector2.ts, Vector3.ts, Vector4.ts
  ├── Matrix3.ts, Matrix4.ts
  ├── Quaternion.ts
  ├── Color.ts
  ├── Box3.ts, Sphere.ts, Plane.ts, Ray.ts, Frustum.ts
  ├── Transform.ts
  ├── Spline.ts
  └── Easing.ts

types/
  ├── TypedArrays.ts
  ├── UtilityTypes.ts
  ├── Interfaces.ts
  ├── Enums.ts
  └── JSONTypes.ts
```

### ECS Layer (Depends on: core, math, types)

```
ecs/
  ├── World.ts
  ├── Entity.ts
  ├── Component.ts
  ├── Archetype.ts
  ├── Query.ts
  ├── System.ts
  ├── CommandBuffer.ts
  ├── Serializer.ts
  └── components/
      ├── TransformComponent.ts
      ├── HierarchyComponent.ts
      ├── NameComponent.ts
      └── TagComponent.ts
```

### Rendering Layer (Depends on: core, math, ecs, types)

```
rendering/
  ├── Renderer.ts
  ├── gpu/
  │   ├── GPUInterface.ts
  │   ├── WebGL2Backend.ts
  │   └── WebGPUBackend.ts
  ├── shader/
  │   ├── ShaderProgram.ts
  │   └── ShaderCache.ts
  ├── pipeline/
  │   ├── RenderPipeline.ts
  │   └── RenderGraph.ts
  ├── geometry/
  │   ├── Geometry.ts
  │   └── Mesh.ts
  ├── material/
  │   ├── Material.ts
  │   └── PBRMaterial.ts
  ├── texture/
  │   └── Texture.ts
  ├── camera/
  │   └── Camera.ts
  ├── lighting/
  │   ├── Light.ts
  │   ├── DirectionalLight.ts
  │   ├── PointLight.ts
  │   └── SpotLight.ts
  └── passes/
      ├── ShadowPass.ts
      ├── GeometryPass.ts
      ├── LightingPass.ts
      └── PostProcessPass.ts

shaders/
  ├── ShaderCompiler.ts
  ├── ShaderChunkRegistry.ts
  ├── GLSLCodeGenerator.ts
  └── WGSLCodeGenerator.ts

postfx/
  ├── PostProcessStack.ts
  ├── Bloom.ts
  ├── SSAO.ts
  ├── DOF.ts
  └── ToneMapping.ts
```

### Simulation Layer (Depends on: core, math, ecs, rendering)

```
physics/
  ├── PhysicsWorld.ts
  ├── RigidBody.ts
  ├── Collider.ts
  ├── Shapes.ts
  └── Constraints.ts

animation/
  ├── Animation.ts
  ├── AnimationMixer.ts
  ├── StateMachine.ts
  ├── Skeleton.ts
  └── SkinnedMesh.ts

simulation/
  ├── cloth/
  ├── sph/
  ├── mpm/
  ├── fem/
  ├── fracture/
  ├── fire/
  └── smoke/
```

### Game Systems Layer (Depends on: all lower layers)

```
ai/
  ├── navigation/
  ├── behavior/
  ├── perception/
  ├── planning/
  └── steering/

particles/
terrain/
voxel/
ocean/
weather/
```

### Infrastructure Layer (Depends on: core, math, ecs)

```
input/
audio/
assets/
ui/
net/
world/
materials/
serialization/
cloud/
localization/
```

### Tooling & Domain Packs (Depends on: all layers)

```
editor/
scripting/
timeline/
profiling/
analytics/
scientific/
medical/
architecture/
xr/
ecommerce/
```

---

## Data Flow

### Input to Rendering Pipeline

```
┌─────────────┐
│   Input     │ Keyboard, Mouse, Touch, Gamepad
│  Devices    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Input     │ Action mapping, Contexts
│  Manager    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Game      │ Player controller, AI, etc.
│   Logic     │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Physics   │ Rigid bodies, Constraints
│   System    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Animation   │ Skeletal animation, Blending
│   System    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Transform   │ Update world matrices
│   System    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Culling    │ Frustum, Occlusion culling
│   System    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Rendering  │ Draw calls, Shaders
│   System    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Post-     │ Bloom, SSAO, Tone mapping
│  Process    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│     UI      │ Screen-space UI
│   System    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Screen    │ Final frame
└─────────────┘
```

### ECS Component Flow

```
Component Data
      │
      ▼
┌─────────────┐
│  Archetype  │ Contiguous arrays of components
│   Storage   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Query     │ Bitset-based filtering
│   System    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Game      │ Process entities
│  Systems    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Command    │ Deferred mutations
│   Buffer    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Apply     │ Update archetypes
│  Commands   │
└─────────────┘
```

### Asset Loading Flow

```
Asset Request
      │
      ▼
┌─────────────┐
│   Asset     │ Check cache
│   Cache     │
└──────┬──────┘
       │
   Cache miss
       │
       ▼
┌─────────────┐
│   Asset     │ Load from URL
│   Loader    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│  Format     │ Parse glTF, OBJ, etc.
│   Parser    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│ Processing  │ Generate mipmaps, compress
│  Pipeline   │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│    GPU      │ Upload to GPU
│   Upload    │
└──────┬──────┘
       │
       ▼
┌─────────────┐
│   Cache     │ Store for reuse
│   Store     │
└─────────────┘
```

---

## System Execution Order

The engine executes systems in a fixed order each frame to ensure correct behavior:

```typescript
// Fixed timestep game loop
while (running) {
  const currentTime = performance.now();
  let deltaTime = currentTime - lastTime;
  lastTime = currentTime;

  // Accumulate time
  accumulator += deltaTime;

  // Fixed timestep updates
  while (accumulator >= fixedDeltaTime) {
    // 1. Input System
    inputManager.update(fixedDeltaTime);

    // 2. AI Systems
    navigationSystem.update(fixedDeltaTime);
    behaviorTreeSystem.update(fixedDeltaTime);
    perceptionSystem.update(fixedDeltaTime);

    // 3. Game Logic Systems
    gameplaySystems.forEach(sys => sys.update(fixedDeltaTime));

    // 4. Animation System
    animationSystem.update(fixedDeltaTime);

    // 5. Physics System
    physicsWorld.step(fixedDeltaTime);

    // 6. Transform System
    transformSystem.update(fixedDeltaTime);

    accumulator -= fixedDeltaTime;
  }

  // Variable timestep for rendering
  // 7. Particle System
  particleSystem.update(deltaTime);

  // 8. Audio System
  audioSystem.update(deltaTime);

  // 9. Culling System
  cullingSystem.update(camera);

  // 10. Rendering System
  renderSystem.render(scene, camera);

  // 11. Post-Processing
  postProcessStack.render(renderTarget);

  // 12. UI System
  uiSystem.render();

  // 13. Networking System
  networkManager.sendUpdates();

  // 14. Debug/Profiling
  profiler.endFrame();
}
```

### System Dependencies

```
Input System
  └─> Game Logic Systems
      ├─> AI Systems
      │   └─> Animation System
      │       └─> Physics System
      │           └─> Transform System
      │               └─> Culling System
      │                   └─> Rendering System
      │                       └─> Post-Processing
      │                           └─> UI System
      └─> Networking System
```

---

## Integration Points

### 1. ECS Integration

All major systems integrate with the ECS:

```typescript
// Transform component
class TransformComponent extends Component {
  position: Vector3;
  rotation: Quaternion;
  scale: Vector3;
  worldMatrix: Matrix4;
}

// Physics component
class RigidBodyComponent extends Component {
  body: RigidBody;
  mass: number;
  velocity: Vector3;
}

// Rendering component
class MeshComponent extends Component {
  mesh: Mesh;
  material: Material;
  castShadows: boolean;
}

// Systems query for components
const query = world.query([
  TransformComponent,
  RigidBodyComponent,
  MeshComponent
]);

for (const entity of query) {
  const transform = world.getComponent(entity, TransformComponent);
  const rigidBody = world.getComponent(entity, RigidBodyComponent);
  const mesh = world.getComponent(entity, MeshComponent);

  // Update transform from physics
  transform.position.copy(rigidBody.body.position);
  transform.rotation.copy(rigidBody.body.rotation);
}
```

### 2. Event System Integration

```typescript
// Physics events
eventBus.on('collision', (event: CollisionEvent) => {
  // Play sound
  audioSystem.playSound(event.contact.point, 'impact.wav');

  // Spawn particles
  particleSystem.emit(event.contact.point, 'debris');
});

// Input events
eventBus.on('action:jump', () => {
  // Apply force
  rigidBody.applyForce(Vector3.UP.scale(jumpForce));

  // Play animation
  animationMixer.play('jump');
});

// Asset loading events
eventBus.on('asset:loaded', (asset: Asset) => {
  // Update loading bar
  uiSystem.setProgress(asset.id, 1.0);
});
```

### 3. Rendering Integration

```typescript
// Rendering system integrates with:
// - ECS for entity data
// - Transform system for matrices
// - Material system for shaders
// - Texture system for images
// - Light system for lighting
// - Camera system for view/projection

class RenderSystem extends System {
  render(scene: Scene, camera: Camera) {
    // Update camera matrices
    camera.updateMatrices();

    // Culling
    const visibleEntities = this.cullEntities(scene, camera);

    // Sort by material for batching
    const sorted = this.sortByMaterial(visibleEntities);

    // Render each entity
    for (const entity of sorted) {
      const transform = this.getComponent(entity, TransformComponent);
      const mesh = this.getComponent(entity, MeshComponent);

      // Set uniforms
      this.setUniform('uModel', transform.worldMatrix);
      this.setUniform('uView', camera.viewMatrix);
      this.setUniform('uProjection', camera.projectionMatrix);

      // Draw
      this.draw(mesh);
    }
  }
}
```

### 4. Physics Integration

```typescript
// Physics system integrates with:
// - ECS for entity data
// - Transform system for positions
// - Collision system for detection
// - Event system for notifications

class PhysicsSystem extends System {
  update(deltaTime: number) {
    // Sync transforms to physics
    for (const entity of this.physicsQuery) {
      const transform = this.getComponent(entity, TransformComponent);
      const rigidBody = this.getComponent(entity, RigidBodyComponent);

      if (!rigidBody.body.isStatic()) {
        rigidBody.body.position.copy(transform.position);
        rigidBody.body.rotation.copy(transform.rotation);
      }
    }

    // Step physics simulation
    this.physicsWorld.step(deltaTime);

    // Sync physics back to transforms
    for (const entity of this.physicsQuery) {
      const transform = this.getComponent(entity, TransformComponent);
      const rigidBody = this.getComponent(entity, RigidBodyComponent);

      if (!rigidBody.body.isStatic()) {
        transform.position.copy(rigidBody.body.position);
        transform.rotation.copy(rigidBody.body.rotation);
      }
    }

    // Emit collision events
    for (const contact of this.physicsWorld.getContacts()) {
      this.eventBus.emit('collision', {
        entityA: contact.entityA,
        entityB: contact.entityB,
        contact: contact
      });
    }
  }
}
```

---

## Design Patterns

### 1. Entity Component System (ECS)

**Pattern**: Data-oriented design separating data from behavior

**Benefits**:
- Cache-friendly memory layout
- Easy to add/remove features
- Parallel processing friendly
- Clear separation of concerns

### 2. Command Pattern

**Used in**: Editor, Input system

**Benefits**:
- Undo/redo support
- Deferred execution
- Input buffering

### 3. Observer Pattern

**Used in**: Event system

**Benefits**:
- Loose coupling between systems
- Easy to add new listeners
- Cross-system communication

### 4. Factory Pattern

**Used in**: Asset loading, Entity creation

**Benefits**:
- Centralized object creation
- Type-safe construction
- Dependency injection

### 5. Object Pool Pattern

**Used in**: Physics, Particles, Audio

**Benefits**:
- Reduced GC pressure
- Predictable memory usage
- Better performance

### 6. Strategy Pattern

**Used in**: Rendering backends, AI behaviors

**Benefits**:
- Runtime algorithm selection
- Easy to add new strategies
- Clean interface separation

### 7. State Machine Pattern

**Used in**: Animation, AI, Game states

**Benefits**:
- Clear state transitions
- Easy to visualize
- Type-safe states

---

## Performance Considerations

### 1. Memory Layout

```typescript
// Bad: Array of objects (AoS)
class BadEntity {
  position: Vector3;
  velocity: Vector3;
  health: number;
}
const entities: BadEntity[] = [];

// Good: Struct of arrays (SoA)
class GoodArchetype {
  positions: Float32Array;   // Contiguous
  velocities: Float32Array;  // Contiguous
  healths: Float32Array;     // Contiguous
}
```

**Benefits**:
- Better cache locality
- SIMD-friendly
- Faster iteration

### 2. Draw Call Batching

```typescript
// Sort by material to minimize state changes
const batches = [];
let currentBatch = null;

for (const entity of visibleEntities) {
  const mesh = getComponent(entity, MeshComponent);

  if (!currentBatch || currentBatch.material !== mesh.material) {
    currentBatch = { material: mesh.material, meshes: [] };
    batches.push(currentBatch);
  }

  currentBatch.meshes.push(mesh);
}

// Render batches
for (const batch of batches) {
  setMaterial(batch.material);
  for (const mesh of batch.meshes) {
    drawMesh(mesh);
  }
}
```

### 3. Culling

```typescript
// Frustum culling
const frustum = camera.getFrustum();
const visibleEntities = [];

for (const entity of entities) {
  const bounds = getBounds(entity);
  if (frustum.intersects(bounds)) {
    visibleEntities.push(entity);
  }
}
```

### 4. LOD (Level of Detail)

```typescript
const distance = camera.position.distanceTo(entity.position);

if (distance < 10) {
  renderMesh(entity.highPolyMesh);
} else if (distance < 50) {
  renderMesh(entity.mediumPolyMesh);
} else {
  renderMesh(entity.lowPolyMesh);
}
```

### 5. Object Pooling

```typescript
class ParticlePool extends ObjectPool<Particle> {
  create(): Particle {
    return new Particle();
  }

  reset(particle: Particle): void {
    particle.position.set(0, 0, 0);
    particle.velocity.set(0, 0, 0);
    particle.lifetime = 0;
  }
}

// Usage
const particle = pool.acquire();
// ... use particle
pool.release(particle);
```

### 6. Shader Warming

```typescript
// Pre-compile critical shaders
async function warmShaders() {
  const criticalShaders = [
    'pbr.vert',
    'pbr.frag',
    'shadow.vert',
    'shadow.frag'
  ];

  for (const shader of criticalShaders) {
    await shaderCache.compile(shader);
  }
}
```

---

## Conclusion

G3D 5.0's architecture is designed for performance, modularity, and extensibility. The layered design with clear dependencies ensures maintainability, while the ECS core provides high performance for real-time applications.

Key architectural strengths:
- **Modular**: Easy to use only what you need
- **Performant**: Data-oriented design for cache efficiency
- **Extensible**: Easy to add new systems and components
- **Type-safe**: TypeScript provides compile-time safety
- **Well-integrated**: All systems work together seamlessly
