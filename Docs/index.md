# G3D 5.0 Documentation

Welcome to the G3D 5.0 documentation! This page serves as the central hub for all engine documentation.

## Quick Links

- [GitHub Repository](https://github.com/g3d/g3d)
- [NPM Package](https://npmjs.com/package/g3d)
- [Discord Community](https://discord.gg/g3d)
- [Twitter](https://twitter.com/g3dengine)

---

## Getting Started

### New to G3D?

Start here to learn the basics and create your first 3D application:

1. **[Getting Started Guide](./getting-started.md)** - Step-by-step tutorial for beginners
2. **[API Quick Reference](./api-quick-reference.md)** - Quick reference for common APIs
3. **[Architecture Overview](./architecture.md)** - Understanding the engine architecture

### Installation

```bash
# Using pnpm (recommended)
pnpm add g3d

# Using npm
npm install g3d

# Using yarn
yarn add g3d
```

### Quick Example

```typescript
import { Engine, Camera, Scene, DirectionalLight } from 'g3d';

async function main() {
  const canvas = document.querySelector('canvas')!;
  const engine = Engine.create({ canvas });
  await engine.init();

  const camera = new Camera();
  camera.setPerspective(75, canvas.width / canvas.height, 0.1, 1000);
  camera.position.set(0, 0, 5);

  const scene = new Scene('Main');
  scene.addLight(new DirectionalLight());

  engine.onUpdate = (deltaTime) => {
    engine.renderer.render(scene, camera);
  };

  engine.start();
}

main();
```

---

## Core Documentation

### Essential Guides

| Document | Description |
|----------|-------------|
| [Getting Started](./getting-started.md) | Step-by-step guide to create your first G3D app |
| [Architecture Overview](./architecture.md) | Deep dive into engine architecture and design |
| [API Quick Reference](./api-quick-reference.md) | Quick reference for commonly used APIs |

### Project Reports

| Document | Description |
|----------|-------------|
| [Integration Report](../INTEGRATION_REPORT.md) | Complete integration and verification report |
| [Final Status Report](../FINAL_STATUS.md) | Final project status and completion summary |
| [README](../README.md) | Project overview and features |

---

## Module Documentation

### Foundation Layer

#### Core Module
- **Engine**: Main engine class with lifecycle management
- **Time**: Time management and delta time
- **Logger**: Logging system with levels and colors
- **EventBus**: Event system for cross-component communication
- **ObjectPool**: Object pooling for memory management
- **Random**: Seedable random number generation
- **IdGenerator**: Unique ID generation

#### Math Module
- **Vector2/3/4**: 2D, 3D, and 4D vector math
- **Matrix3/4**: 3x3 and 4x4 matrix operations
- **Quaternion**: Rotation representation and operations
- **Color**: RGBA color with conversion utilities
- **Geometry**: Box3, Sphere, Plane, Ray, Frustum
- **Spline**: Bezier and Catmull-Rom splines
- **Easing**: Easing functions for animations

#### ECS Module
- **World**: Entity manager and system coordinator
- **Entity**: Unique entity IDs
- **Component**: Base component class
- **Archetype**: Component storage optimization
- **Query**: Fast entity queries with bitsets
- **System**: Base system class for game logic
- **CommandBuffer**: Deferred entity/component mutations

#### Types Module
- **TypedArrays**: Typed array type definitions
- **UtilityTypes**: DeepReadonly, DeepPartial, Nullable, etc.
- **Interfaces**: IPoolable, IDisposable, IClonable, etc.
- **Enums**: Rendering, physics, and animation enums
- **JSONTypes**: JSON serialization types

---

### Rendering Layer

#### Rendering Module
- **Renderer**: Main renderer orchestrator
- **GPU Backend**: WebGL2 and WebGPU abstraction
- **Shader**: Shader program management
- **Pipeline**: Render pipeline and graph
- **Geometry**: Mesh and geometry management
- **Material**: PBR and standard materials
- **Texture**: Texture loading and management
- **Camera**: Perspective and orthographic cameras
- **Lighting**: Directional, point, spot, area lights
- **Shadows**: Cascaded shadow maps
- **Culling**: Frustum and occlusion culling
- **Scene**: Scene graph management

#### Shader Module
- **Compiler**: GLSL/WGSL shader compilation
- **ChunkRegistry**: Reusable shader chunks
- **CodeGenerator**: GLSL and WGSL code generation
- **Preprocessor**: Include and define support

#### Post-Processing Module
- **Bloom**: HDR bloom effect
- **SSAO**: Screen-space ambient occlusion
- **DOF**: Depth of field
- **ToneMapping**: HDR tone mapping
- **ColorGrading**: Color correction

---

### Simulation Layer

#### Physics Module
- **PhysicsWorld**: Physics simulation world
- **RigidBody**: Dynamic, static, kinematic bodies
- **Collider**: Box, sphere, capsule, mesh colliders
- **Constraints**: Hinge, ball, fixed joints
- **Raycasting**: Physics raycasting
- **Materials**: Friction and restitution

#### Animation Module
- **Animation**: Animation clips and tracks
- **Mixer**: Animation playback and blending
- **StateMachine**: Hierarchical state machines
- **Skeleton**: Bone hierarchies
- **SkinnedMesh**: GPU-accelerated skinning
- **IK**: Inverse kinematics solvers

#### Simulation Module
- **Cloth**: Position-based dynamics cloth
- **SPH**: Smoothed particle hydrodynamics fluids
- **MPM**: Material point method simulation
- **FEM**: Finite element method soft bodies
- **Fracture**: Voronoi fracture system
- **Fire**: Volumetric fire simulation
- **Smoke**: Volumetric smoke simulation

---

### Game Systems Layer

#### AI Module
- **Navigation**: NavMesh generation and pathfinding
- **Pathfinder**: A* pathfinding algorithm
- **NavAgent**: Navigation agent with steering
- **Crowd**: Local avoidance (RVO/ORCA)
- **BehaviorTree**: Hierarchical behavior trees
- **StateMachine**: Finite state machines
- **Perception**: Sight and hearing sensors
- **Planning**: GOAP (Goal-Oriented Action Planning)

#### Particles Module
- **ParticleSystem**: CPU and GPU particles
- **Emitter**: Particle emission with shapes
- **Modules**: Velocity, color, size, rotation, forces
- **Renderer**: Billboard, mesh, trail rendering
- **LOD**: Level of detail for particles

#### Terrain Module
- **Terrain**: Large-scale terrain rendering
- **Heightmap**: Height data management
- **LOD**: Quadtree LOD system
- **Splatmap**: Multi-texture blending
- **Vegetation**: Grass and tree rendering
- **Editing**: Terrain editing tools

#### Voxel Module
- **VoxelWorld**: Chunk-based voxel world
- **Meshing**: Greedy meshing, marching cubes
- **Lighting**: Voxel lighting with AO
- **Physics**: Voxel collision detection

#### Ocean Module
- **Ocean**: FFT-based ocean simulation
- **Waves**: Gerstner waves
- **Foam**: Foam generation from Jacobian
- **Buoyancy**: Floating object physics
- **Underwater**: Caustics and fog

#### Weather Module
- **Weather**: Weather state machine
- **Rain**: Rain particle system
- **Snow**: Snow particle system
- **Wind**: Wind field simulation
- **Lightning**: Lightning generation
- **Fog**: Volumetric fog
- **TimeOfDay**: Day/night cycle

---

### Infrastructure Layer

#### Input Module
- **InputManager**: Multi-device input coordination
- **Actions**: Action mapping system
- **Keyboard**: Keyboard input
- **Mouse**: Mouse input with delta
- **Touch**: Multi-touch input
- **Gamepad**: Gamepad support
- **Gestures**: Gesture recognition

#### Audio Module
- **AudioContext**: Web Audio API wrapper
- **AudioSource**: 3D spatial audio sources
- **AudioListener**: Audio listener for 3D audio
- **Mixer**: Audio mixing with buses
- **Effects**: Reverb, delay, filter, compressor
- **Music**: Music system with crossfading

#### Assets Module
- **AssetLoader**: Async asset loading
- **AssetCache**: LRU cache for assets
- **Bundles**: Asset bundle management
- **Loaders**: glTF, OBJ, image, audio loaders
- **Processing**: Asset processing pipeline

#### UI Module
- **UICanvas**: Screen-space and world-space UI
- **UIElement**: Base UI element class
- **Components**: Button, text, image, slider, etc.
- **Layouts**: Horizontal, vertical, grid, flex, anchor
- **Events**: UI event handling

#### Networking Module
- **NetworkManager**: Session management
- **Transport**: WebSocket and WebRTC
- **Messages**: Message system with priorities
- **Replication**: Entity state replication
- **RPC**: Remote procedure calls
- **TimeSync**: Network time synchronization

#### World Module
- **SceneGraph**: Hierarchical scene organization
- **Octree**: Spatial partitioning
- **Streaming**: Level streaming for open worlds
- **Prefabs**: Prefab system for templates

#### Serialization Module
- **Serializer**: Binary and JSON serialization
- **SaveSystem**: Save slot management
- **Versioning**: Schema migration
- **Compression**: GZIP compression

---

### Domain Packs & Tooling

#### Scientific Visualization
- **FieldManager**: Scalar and vector field visualization
- **Climate**: Climate simulation
- **Streamlines**: Particle tracing
- **ColorMapping**: Scientific color maps

#### Medical Imaging
- **DICOMLoader**: DICOM file loading
- **VolumeRenderer**: GPU volume rendering
- **MPR**: Multi-planar reconstruction
- **Isosurface**: Marching cubes extraction

#### Architecture/BIM
- **SectionManager**: Section plane management
- **Clipping**: GPU clipping planes
- **Hatching**: Hatching pattern generation
- **BIM**: BIM metadata display

#### XR (Extended Reality)
- **XRSession**: WebXR session management
- **Controllers**: Hand and controller tracking
- **Foveated**: Fixed and dynamic foveated rendering
- **VRS**: Variable rate shading

#### E-Commerce
- **Turntable**: Product turntable controller
- **OrbitCamera**: Orbit camera controls
- **Presets**: Lighting presets (Studio, Outdoor)
- **Capture**: Screenshot and video capture
- **ARExport**: USDZ and GLB export for AR

#### Editor
- **EditorEngine**: Edit/play mode switching
- **Commands**: Undo/redo command pattern
- **Gizmos**: Transform gizmos
- **Selection**: Entity selection system
- **Inspectors**: Component inspectors

#### Visual Scripting
- **Graph**: Visual script graph
- **Nodes**: 60+ node types (events, flow, math, logic)
- **Compiler**: Graph compilation and optimization
- **Debugger**: Breakpoints and step-through

#### Timeline/Cinematics
- **Timeline**: Multi-track timeline
- **Tracks**: Animation, audio, camera tracks
- **Signals**: Event system for triggers
- **Director**: Playback control

#### Profiling
- **Profiler**: CPU and GPU profiling
- **Markers**: Profile markers and scopes
- **FlameGraph**: Flame graph visualization
- **Export**: Chrome trace export

#### Analytics
- **EventTracker**: Event tracking
- **SessionManager**: Session management
- **UserProfile**: User profiling
- **Consent**: GDPR consent management

#### Cloud Services
- **Authentication**: Email, OAuth, anonymous auth
- **CloudSave**: Cloud save with conflict resolution
- **Leaderboards**: Leaderboard system
- **Achievements**: Achievement system
- **RemoteConfig**: Remote configuration

#### Localization
- **StringTable**: Translation tables
- **Pluralization**: CLDR pluralization rules
- **Formatting**: Date and number formatting
- **HotSwap**: Runtime locale switching

---

## Examples

### Basic Examples

- **Hello World**: Minimal G3D application
- **Rotating Cube**: Basic rendering and animation
- **Multiple Objects**: Scene with multiple entities
- **Materials**: Different material types

### Rendering Examples

- **PBR Materials**: Physically-based rendering
- **Lighting**: Various light types
- **Shadows**: Shadow mapping
- **Post-Processing**: Post-processing effects stack
- **Instancing**: GPU instancing

### Physics Examples

- **Falling Boxes**: Basic rigid body physics
- **Constraints**: Joints and constraints
- **Raycasting**: Physics raycasting
- **Vehicle**: Vehicle physics

### Animation Examples

- **Skeletal Animation**: Character animation
- **State Machine**: Animation state machine
- **Blending**: Animation blending
- **IK**: Inverse kinematics

### Input Examples

- **Keyboard Control**: Character controller
- **Mouse Camera**: Mouse-look camera
- **Touch Input**: Touch controls for mobile
- **Gamepad**: Gamepad input

### Audio Examples

- **3D Audio**: Spatial audio positioning
- **Music System**: Background music with crossfade
- **Sound Effects**: Triggered sound effects

### Networking Examples

- **Multiplayer**: Simple multiplayer game
- **Chat**: Network chat system
- **State Sync**: Entity state synchronization

### AI Examples

- **Pathfinding**: A* pathfinding on NavMesh
- **Behavior Trees**: AI with behavior trees
- **Crowd**: Crowd simulation with avoidance

### Advanced Examples

- **Terrain**: Large-scale terrain
- **Voxels**: Minecraft-like voxel world
- **Ocean**: Ocean simulation
- **Weather**: Dynamic weather system
- **Particles**: Complex particle effects

---

## Browser Compatibility

| Browser | WebGL2 | WebGPU | Status |
|---------|--------|--------|--------|
| Chrome  | 56+    | 113+   | ✅ Full support |
| Firefox | 51+    | -      | ✅ WebGL2 only |
| Safari  | 15+    | -      | ✅ WebGL2 only |
| Edge    | 79+    | 113+   | ✅ Full support |

---

## Performance Targets

| System | Target | Description |
|--------|--------|-------------|
| Core ECS | 100k entities @ 120 FPS | Entity processing |
| Rendering | 10k draw calls @ 60 FPS | Draw call throughput |
| Physics | 1000 bodies @ 60 FPS | Rigid body simulation |
| Animation | 100 characters @ 60 FPS | Skeletal animation |
| AI | 1000 agents @ 60 FPS | Navigation and behaviors |
| Particles | 1M particles @ 60 FPS | GPU particles |

---

## Support

### Community

- **Discord**: [Join our Discord](https://discord.gg/g3d)
- **Twitter**: [@g3dengine](https://twitter.com/g3dengine)
- **GitHub Discussions**: [GitHub Discussions](https://github.com/g3d/g3d/discussions)

### Resources

- **API Reference**: TypeScript definitions in `src/index.ts`
- **Examples**: `/examples` directory
- **Source Code**: [GitHub Repository](https://github.com/g3d/g3d)
- **Issue Tracker**: [GitHub Issues](https://github.com/g3d/g3d/issues)

### Contributing

We welcome contributions! Please read our [Contributing Guide](../CONTRIBUTING.md) before submitting pull requests.

---

## License

G3D 5.0 is licensed under the MIT License. See [LICENSE](../LICENSE) for details.

---

**Made with ❤️ by the G3D Team**

*Last updated: November 25, 2025*
