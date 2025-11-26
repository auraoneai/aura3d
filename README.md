# G3D 5.0 Game Engine

A high-performance, TypeScript-first 3D game engine for modern web browsers supporting WebGL2 and WebGPU.

## Features

### Core Systems
- **ECS Architecture**: High-performance entity component system with archetype-based storage
- **Math Library**: Complete 3D math (vectors, matrices, quaternions, geometry)
- **Event System**: Type-safe event bus for cross-system communication
- **Time Management**: Fixed timestep game loop with delta time smoothing
- **Object Pooling**: Automatic pooling for frequently allocated objects

### Rendering
- **Multi-Backend**: WebGL2 and WebGPU support with unified API
- **PBR Materials**: Physically-based rendering with IBL (Image-Based Lighting)
- **Post-Processing**: Bloom, SSAO, DOF, tone mapping, color grading
- **Shadows**: Cascaded shadow maps with PCF soft shadows
- **Deferred/Forward**: Flexible rendering pipelines
- **Instancing**: GPU instancing for repeated geometry
- **Culling**: Frustum and occlusion culling

### Physics & Simulation
- **Rigid Body Physics**: Full 3D physics simulation with constraints
- **Cloth Simulation**: Position-based dynamics for cloth and soft bodies
- **Fluid Simulation**: SPH (Smoothed Particle Hydrodynamics) and MPM (Material Point Method)
- **Fracture System**: Voronoi-based destruction and fragmentation
- **Soft Bodies**: FEM (Finite Element Method) deformable bodies
- **Fire & Smoke**: Volumetric simulation with GPU acceleration

### Animation
- **Skeletal Animation**: GPU-accelerated skinning with bone hierarchies
- **Blend Trees**: Complex animation blending with parameters
- **State Machines**: Hierarchical animation state machines with transitions
- **Root Motion**: Full root motion support for character movement
- **Morph Targets**: Blend shape animation
- **IK (Inverse Kinematics)**: Multi-segment IK solvers

### AI Systems
- **Navigation**: NavMesh generation and pathfinding with A*
- **Behavior Trees**: Hierarchical behavior trees with composites and decorators
- **State Machines**: Finite state machines for AI logic
- **Perception**: Sight and hearing sensors with memory
- **Crowd Simulation**: RVO/ORCA local avoidance
- **Steering**: Seek, flee, pursue, evade, wander behaviors
- **Planning**: GOAP (Goal-Oriented Action Planning)

### World Systems
- **Terrain**: Large-scale terrain with LOD, splatmaps, and vegetation
- **Voxels**: Chunk-based voxel worlds with greedy meshing
- **Ocean**: FFT-based ocean simulation with foam and buoyancy
- **Weather**: Dynamic weather system with rain, snow, wind, and lightning
- **Day/Night**: Time of day with atmospheric scattering
- **Level Streaming**: Seamless world streaming for open worlds

### Infrastructure
- **Networking**: Client/server and P2P with state synchronization
- **Input**: Multi-device input (keyboard, mouse, touch, gamepad) with action mapping
- **UI**: Component-based UI system with layouts and events
- **Audio**: 3D spatial audio with reverb and effects
- **Assets**: Asset loading and caching with multiple format support
- **Serialization**: Binary and JSON serialization with versioning

### Domain Packs
- **Scientific**: Field visualization, climate simulation, particle tracing
- **Medical**: Volume rendering, DICOM support, MPR (Multi-Planar Reconstruction)
- **Architecture**: Section planes, BIM integration, hatching patterns
- **XR**: WebXR with hand tracking and foveated rendering
- **E-Commerce**: Product viewers, turntable, AR export (USDZ/GLB)

### Tooling
- **Editor**: Scene editing with transform gizmos and selection
- **Scripting**: Visual scripting system with 60+ node types
- **Timeline**: Cinematic sequences with multi-track timeline
- **Profiling**: CPU/GPU profiling with flame graphs
- **Analytics**: Event tracking with privacy controls
- **Cloud**: Authentication, cloud saves, leaderboards

## Quick Start

```typescript
import { Engine, Vector3, TransformComponent, MeshComponent } from 'g3d';

// Create engine
const engine = Engine.create({
  canvas: document.querySelector('canvas')!,
  targetFPS: 60
});
await engine.init();

// Create entity
const entity = engine.world.createEntity();
engine.world.addComponent(entity, new TransformComponent({
  position: new Vector3(0, 0, 0)
}));

// Start game loop
engine.start();
```

## Installation

```bash
npm install g3d
```

Or with pnpm:

```bash
pnpm add g3d
```

## Documentation

- [Getting Started](./docs/getting-started.md)
- [Architecture Overview](./docs/architecture.md)
- [API Quick Reference](./docs/api-quick-reference.md)
- [Integration Report](./INTEGRATION_REPORT.md)
- [Examples](./examples/)

## Project Structure

```
G3D/
├── src/
│   ├── core/           # Engine core (Engine, Time, Logger, Events)
│   ├── math/           # 3D math library (Vector, Matrix, Quaternion)
│   ├── ecs/            # Entity Component System
│   ├── rendering/      # Rendering system (WebGL2/WebGPU)
│   ├── physics/        # Physics simulation
│   ├── animation/      # Animation system
│   ├── audio/          # Audio system
│   ├── input/          # Input handling
│   ├── assets/         # Asset management
│   ├── ui/             # UI system
│   ├── net/            # Networking
│   ├── ai/             # AI and navigation
│   ├── particles/      # Particle systems
│   ├── terrain/        # Terrain rendering
│   ├── simulation/     # Advanced simulations
│   ├── voxel/          # Voxel worlds
│   ├── ocean/          # Ocean simulation
│   ├── weather/        # Weather system
│   ├── world/          # World management
│   ├── shaders/        # Shader system
│   ├── postfx/         # Post-processing
│   ├── materials/      # Material system
│   ├── serialization/  # Serialization
│   ├── scientific/     # Scientific visualization
│   ├── medical/        # Medical imaging
│   ├── architecture/   # Architecture/BIM
│   ├── xr/             # WebXR
│   ├── ecommerce/      # E-commerce
│   ├── editor/         # Editor tools
│   ├── scripting/      # Visual scripting
│   ├── timeline/       # Timeline/cinematics
│   ├── profiling/      # Profiling tools
│   ├── analytics/      # Analytics
│   ├── cloud/          # Cloud services
│   ├── localization/   # Localization
│   └── types/          # Shared types
├── tests/              # Test suites
├── docs/               # Documentation
└── examples/           # Example projects
```

## Browser Support

| Browser | WebGL2 | WebGPU |
|---------|--------|--------|
| Chrome  | 56+    | 113+   |
| Firefox | 51+    | -      |
| Safari  | 15+    | -      |
| Edge    | 79+    | 113+   |

## Performance Targets

- **Core ECS**: 100,000+ entities @ 120 FPS
- **Rendering**: 10,000+ draw calls @ 60 FPS
- **Physics**: 1,000+ rigid bodies @ 60 FPS
- **Animation**: 100+ skinned characters @ 60 FPS
- **AI**: 1,000+ agents @ 60 FPS
- **Particles**: 1,000,000+ particles @ 60 FPS

## Examples

### Complete Game Example

```typescript
import {
  Engine,
  Scene,
  Camera,
  DirectionalLight,
  Material,
  GeometryGenerator,
  PhysicsWorld,
  RigidBody,
  BoxShape,
  InputManager,
  AudioContext,
  AssetLoader,
  ParticleSystem
} from 'g3d';

async function createGame() {
  // Initialize engine
  const engine = Engine.create({ canvas: document.querySelector('canvas')! });
  await engine.init();

  // Setup rendering
  const scene = new Scene('MainScene');
  const camera = new Camera();
  camera.setPerspective(75, window.innerWidth / window.innerHeight, 0.1, 1000);
  camera.position.set(0, 5, 10);

  // Add lighting
  const sun = new DirectionalLight();
  sun.intensity = 3.0;
  sun.castShadows = true;
  scene.addLight(sun);

  // Create player with physics
  const physics = new PhysicsWorld();
  const playerBody = new RigidBody({
    type: 'dynamic',
    mass: 10,
    position: new Vector3(0, 5, 0)
  });
  playerBody.addCollider({ shape: new BoxShape(new Vector3(1, 1, 1)) });
  physics.addRigidBody(playerBody);

  // Setup input
  const input = new InputManager(canvas);
  const gameplayContext = input.createContext({ name: 'gameplay' });
  const moveAction = gameplayContext.addAction({ name: 'move', valueType: 'axis2D' });
  moveAction.addCompositeBinding('2DAxis', {
    up: { deviceType: 'keyboard', path: 'W' },
    down: { deviceType: 'keyboard', path: 'S' },
    left: { deviceType: 'keyboard', path: 'A' },
    right: { deviceType: 'keyboard', path: 'D' }
  });
  gameplayContext.enable();

  // Game loop
  function update(deltaTime: number) {
    // Update input
    const move = input.getAction('gameplay', 'move');
    if (move?.vector) {
      playerBody.applyForce(new Vector3(move.vector.x * 10, 0, move.vector.y * 10));
    }

    // Update physics
    physics.step(deltaTime);

    // Render
    engine.renderer.render(scene, camera);
  }

  engine.start();
}

createGame();
```

## Development

### Type Checking

```bash
pnpm typecheck        # Type check once
pnpm typecheck:watch  # Type check on changes
pnpm typecheck:strict # Strict mode type checking
```

### Building

```bash
pnpm build            # Build once
pnpm build:watch      # Build on changes
pnpm clean            # Clean build artifacts
```

### Testing

```bash
pnpm test             # Run tests
pnpm test:watch       # Run tests on changes
pnpm test:coverage    # Generate coverage report
```

## Contributing

Contributions are welcome! Please read our [Contributing Guide](./CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](./LICENSE) for details.

## Credits

Built with TypeScript, WebGL2, and WebGPU.

Special thanks to the open source community for inspiration and tools.

## Links

- [Documentation](https://g3d.dev/docs)
- [GitHub Repository](https://github.com/g3d/g3d)
- [Examples](https://g3d.dev/examples)
- [Discord Community](https://discord.gg/g3d)
- [Twitter](https://twitter.com/g3dengine)

---

Made with care by the G3D Team
