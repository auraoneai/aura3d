# G3D 5.0 PRD – Part 4: Physics & Simulation

**Parent Document:** `PRD-Final-00-Overview.md`

---

## 9. Physics

---

## 9.1 `src/physics/` – Physics System

### Directory Structure

```
src/physics/
├── PhysicsWorld.ts
├── PhysicsBackend.ts
├── CannonBackend.ts
├── RapierBackend.ts
├── AmmoBackend.ts
├── MockPhysicsWorld.ts
├── CollisionShape.ts
├── CollisionDetection.ts
├── ConstraintSolver.ts
├── RigidBody.ts
├── VehiclePhysics.ts
├── TireModel.ts
├── CharacterController.ts
├── PhysicsMaterial.ts
├── PhysicsDebugDraw.ts
└── index.ts
```

---

### 9.1.1 `src/physics/PhysicsWorld.ts`

**Role:** Main physics simulation container and API.

**Public API:**
```typescript
class PhysicsWorld {
  // Configuration
  readonly config: PhysicsConfig;
  gravity: Vector3;

  // Lifecycle
  initialize(config: PhysicsConfig): Promise<void>;
  step(dt: number): void;
  dispose(): void;

  // Bodies
  createRigidBody(desc: RigidBodyDesc): RigidBody;
  destroyRigidBody(body: RigidBody): void;
  getRigidBody(id: number): RigidBody | undefined;

  // Shapes
  createCollisionShape(desc: CollisionShapeDesc): CollisionShape;
  destroyCollisionShape(shape: CollisionShape): void;

  // Constraints
  createConstraint(desc: ConstraintDesc): Constraint;
  destroyConstraint(constraint: Constraint): void;

  // Queries
  raycast(origin: Vector3, direction: Vector3, maxDistance: number, filter?: CollisionFilter): RaycastHit | null;
  raycastAll(origin: Vector3, direction: Vector3, maxDistance: number, filter?: CollisionFilter): RaycastHit[];
  sphereCast(origin: Vector3, radius: number, direction: Vector3, maxDistance: number): RaycastHit | null;
  overlapSphere(center: Vector3, radius: number, filter?: CollisionFilter): RigidBody[];
  overlapBox(center: Vector3, halfExtents: Vector3, rotation: Quaternion, filter?: CollisionFilter): RigidBody[];

  // Events
  onCollisionEnter: Signal<(collision: CollisionEvent) => void>;
  onCollisionStay: Signal<(collision: CollisionEvent) => void>;
  onCollisionExit: Signal<(collision: CollisionEvent) => void>;
  onTriggerEnter: Signal<(trigger: TriggerEvent) => void>;
  onTriggerExit: Signal<(trigger: TriggerEvent) => void>;

  // Statistics
  get bodyCount(): number;
  get constraintCount(): number;
  get stepTime(): number;
}

interface PhysicsConfig {
  backend: 'cannon' | 'rapier' | 'ammo' | 'mock';
  gravity: Vector3;
  fixedTimestep: number;
  maxSubSteps: number;
  solverIterations: number;
  enableCCD: boolean;
  broadphase: 'naive' | 'sap' | 'bvh';
}

interface CollisionEvent {
  bodyA: RigidBody;
  bodyB: RigidBody;
  contacts: ContactPoint[];
  impulse: number;
}

interface ContactPoint {
  position: Vector3;
  normal: Vector3;
  penetration: number;
}
```

**Dependencies:**
- Depends on: `PhysicsBackend`, `RigidBody`, `CollisionShape`, `Constraint`
- Depended by: `PhysicsSystem`, game logic

**Implementation Checklist:**
- [ ] Backend abstraction (Cannon.js, Rapier, Ammo.js)
- [ ] Fixed timestep stepping with interpolation
- [ ] Rigid body lifecycle management
- [ ] Collision shape creation (all types)
- [ ] Constraint creation (joints, springs)
- [ ] Raycast and overlap queries
- [ ] Collision/trigger event dispatch
- [ ] CCD for fast-moving objects
- [ ] Collision filtering (layers, masks)
- [ ] **Performance:** 1000 active bodies @ 60 FPS
- [ ] **Performance:** Step time < 8ms
- [ ] **Tests:** Full API coverage, stress tests

---

### 9.1.2 `src/physics/PhysicsBackend.ts`

**Role:** Abstract interface for physics engine backends.

**Public API:**
```typescript
interface PhysicsBackend {
  readonly name: string;
  readonly version: string;

  initialize(config: PhysicsConfig): Promise<void>;
  dispose(): void;

  step(dt: number): void;

  createBody(desc: RigidBodyDesc): BackendBody;
  destroyBody(body: BackendBody): void;

  createShape(desc: CollisionShapeDesc): BackendShape;
  destroyShape(shape: BackendShape): void;

  createConstraint(desc: ConstraintDesc): BackendConstraint;
  destroyConstraint(constraint: BackendConstraint): void;

  raycast(origin: Vector3, direction: Vector3, maxDistance: number, filter?: CollisionFilter): RaycastHit | null;
  getCollisions(): CollisionEvent[];
}
```

**Dependencies:**
- Depends on: None (interface)
- Depended by: `PhysicsWorld`, all backend implementations

**Implementation Checklist:**
- [ ] Clean abstraction hiding backend specifics
- [ ] Lifecycle methods
- [ ] Object creation/destruction
- [ ] Query interface
- [ ] Collision event collection

---

### 9.1.3 `src/physics/CannonBackend.ts`

**Role:** Cannon.js physics backend implementation.

**Public API:**
```typescript
class CannonBackend implements PhysicsBackend {
  readonly name = 'cannon';
  // ... implements PhysicsBackend
}
```

**Dependencies:**
- Depends on: cannon-es library
- Depended by: `PhysicsWorld`

**Implementation Checklist:**
- [ ] All `PhysicsBackend` methods implemented
- [ ] Shape mapping: box, sphere, cylinder, convex, trimesh, heightfield
- [ ] Constraint mapping: point-to-point, hinge, lock, distance
- [ ] Material properties (friction, restitution)
- [ ] Sleep/wake management
- [ ] Broadphase configuration
- [ ] **Tests:** All shape types, constraints, queries

---

### 9.1.4 `src/physics/RapierBackend.ts`

**Role:** Rapier physics backend implementation (WASM).

**Public API:**
```typescript
class RapierBackend implements PhysicsBackend {
  readonly name = 'rapier';
  // ... implements PhysicsBackend
}
```

**Dependencies:**
- Depends on: @dimforge/rapier3d-compat library
- Depended by: `PhysicsWorld`

**Implementation Checklist:**
- [ ] All `PhysicsBackend` methods implemented
- [ ] WASM initialization and module loading
- [ ] High-performance simulation (preferred backend)
- [ ] Full shape support including convex decomposition
- [ ] Advanced constraint types
- [ ] CCD support
- [ ] **Performance:** Best performance of all backends
- [ ] **Tests:** Full coverage, performance benchmarks

---

### 9.1.5 `src/physics/AmmoBackend.ts`

**Role:** Ammo.js (Bullet) physics backend implementation.

**Public API:**
```typescript
class AmmoBackend implements PhysicsBackend {
  readonly name = 'ammo';
  // ... implements PhysicsBackend
}
```

**Dependencies:**
- Depends on: ammo.js library
- Depended by: `PhysicsWorld`

**Implementation Checklist:**
- [ ] All `PhysicsBackend` methods implemented
- [ ] WASM/asm.js loading
- [ ] Full Bullet feature exposure
- [ ] Soft body support (unique to Ammo)
- [ ] Vehicle physics support
- [ ] **Tests:** Full coverage

---

### 9.1.6 `src/physics/MockPhysicsWorld.ts`

**Role:** Mock physics for testing without real simulation.

**Public API:**
```typescript
class MockPhysicsWorld implements PhysicsBackend {
  readonly name = 'mock';

  // Test helpers
  setNextRaycastResult(result: RaycastHit | null): void;
  triggerCollision(bodyA: RigidBody, bodyB: RigidBody): void;
  getCreatedBodies(): RigidBody[];
}
```

**Implementation Checklist:**
- [ ] No actual simulation
- [ ] Configurable query results
- [ ] Event triggering for tests
- [ ] Full interface compliance

---

### 9.1.7 `src/physics/CollisionShape.ts`

**Role:** Collision shape definitions.

**Public API:**
```typescript
abstract class CollisionShape {
  readonly type: CollisionShapeType;
  readonly id: number;

  // Transform
  offset: Vector3;
  rotation: Quaternion;

  // Properties
  get volume(): number;
  get boundingBox(): Box3;
  get boundingSphere(): Sphere;
}

class BoxShape extends CollisionShape {
  halfExtents: Vector3;
}

class SphereShape extends CollisionShape {
  radius: number;
}

class CapsuleShape extends CollisionShape {
  radius: number;
  height: number;
}

class CylinderShape extends CollisionShape {
  radius: number;
  height: number;
}

class ConeShape extends CollisionShape {
  radius: number;
  height: number;
}

class ConvexHullShape extends CollisionShape {
  constructor(vertices: Float32Array);
}

class TriangleMeshShape extends CollisionShape {
  constructor(vertices: Float32Array, indices: Uint32Array);
}

class HeightfieldShape extends CollisionShape {
  constructor(heightData: Float32Array, width: number, depth: number, scale: Vector3);
}

class CompoundShape extends CollisionShape {
  addChild(shape: CollisionShape, offset: Vector3, rotation: Quaternion): void;
  removeChild(shape: CollisionShape): void;
}

type CollisionShapeType = 'box' | 'sphere' | 'capsule' | 'cylinder' | 'cone' | 'convex' | 'trimesh' | 'heightfield' | 'compound';
```

**Dependencies:**
- Depends on: `Vector3`, `Quaternion`, `Box3`, `Sphere`
- Depended by: `PhysicsWorld`, `ColliderComponent`

**Implementation Checklist:**
- [ ] All primitive shapes
- [ ] Convex hull from point cloud
- [ ] Triangle mesh for static geometry
- [ ] Heightfield for terrain
- [ ] Compound shapes for complex objects
- [ ] Volume and bounds calculation
- [ ] Serialization support

---

### 9.1.8 `src/physics/RigidBody.ts`

**Role:** Physics rigid body representation.

**Public API:**
```typescript
class RigidBody {
  readonly id: number;

  // Type
  bodyType: 'dynamic' | 'kinematic' | 'static';

  // Transform
  get position(): Vector3;
  set position(value: Vector3);
  get rotation(): Quaternion;
  set rotation(value: Quaternion);

  // Velocity
  get linearVelocity(): Vector3;
  set linearVelocity(value: Vector3);
  get angularVelocity(): Vector3;
  set angularVelocity(value: Vector3);

  // Properties
  mass: number;
  linearDamping: number;
  angularDamping: number;
  gravityScale: number;

  // Constraints
  freezePosition: [boolean, boolean, boolean];  // X, Y, Z
  freezeRotation: [boolean, boolean, boolean];

  // Shapes
  addShape(shape: CollisionShape): void;
  removeShape(shape: CollisionShape): void;
  get shapes(): CollisionShape[];

  // Forces
  applyForce(force: Vector3, worldPoint?: Vector3): void;
  applyImpulse(impulse: Vector3, worldPoint?: Vector3): void;
  applyTorque(torque: Vector3): void;

  // State
  isSleeping: boolean;
  wake(): void;
  sleep(): void;

  // Collision
  collisionLayer: number;
  collisionMask: number;
  isTrigger: boolean;

  // User data
  userData: any;
}
```

**Dependencies:**
- Depends on: `CollisionShape`, `Vector3`, `Quaternion`
- Depended by: `PhysicsWorld`, `RigidBodyComponent`

**Implementation Checklist:**
- [ ] All body types (dynamic, kinematic, static)
- [ ] Transform get/set with interpolation
- [ ] Velocity manipulation
- [ ] Mass and inertia computation
- [ ] Damping (linear, angular)
- [ ] Axis constraints
- [ ] Force/impulse application
- [ ] Sleep state management
- [ ] Collision filtering
- [ ] **Tests:** All properties, force application

---

### 9.1.9 `src/physics/VehiclePhysics.ts`

**Role:** Vehicle simulation with realistic handling.

**Public API:**
```typescript
class VehiclePhysics {
  readonly chassis: RigidBody;
  readonly wheels: VehicleWheel[];

  // Configuration
  readonly config: VehicleConfig;

  // Control inputs
  setThrottle(value: number): void;      // 0 to 1
  setBrake(value: number): void;         // 0 to 1
  setSteering(value: number): void;      // -1 to 1 (left to right)
  setHandbrake(active: boolean): void;

  // State
  get speed(): number;
  get rpm(): number;
  get gear(): number;
  get isGrounded(): boolean;

  // Update
  update(dt: number): void;
}

interface VehicleConfig {
  mass: number;
  wheelBase: number;
  trackWidth: number;
  centerOfMass: Vector3;

  engine: EngineConfig;
  transmission: TransmissionConfig;
  suspension: SuspensionConfig;
  wheels: WheelConfig[];
}

interface VehicleWheel {
  readonly index: number;
  position: Vector3;
  rotation: Quaternion;
  rpm: number;
  slip: number;
  isGrounded: boolean;
  groundHit: RaycastHit | null;
}
```

**Dependencies:**
- Depends on: `RigidBody`, `TireModel`, `PhysicsWorld`
- Depended by: `VehicleComponent`

**Implementation Checklist:**
- [ ] Raycast-based wheel suspension
- [ ] Tire friction model (Pacejka or simplified)
- [ ] Engine torque curve
- [ ] Transmission (automatic/manual)
- [ ] Differential (open, limited-slip, locked)
- [ ] Steering with Ackermann geometry
- [ ] Anti-roll bars
- [ ] Aerodynamic drag and downforce
- [ ] **Performance:** 10 vehicles @ 60 FPS
- [ ] **Tests:** Handling characteristics, edge cases

---

### 9.1.10 `src/physics/TireModel.ts`

**Role:** Tire friction and slip calculation.

**Public API:**
```typescript
class TireModel {
  // Pacejka magic formula parameters
  B: number;  // Stiffness
  C: number;  // Shape
  D: number;  // Peak
  E: number;  // Curvature

  // Calculate forces
  calculateLongitudinalForce(slip: number, load: number): number;
  calculateLateralForce(slipAngle: number, load: number): number;
  combinedForces(slip: number, slipAngle: number, load: number): { fx: number; fy: number };
}

// Presets
const TirePresets = {
  street: TireModel;
  sport: TireModel;
  racing: TireModel;
  offroad: TireModel;
};
```

**Implementation Checklist:**
- [ ] Pacejka magic formula implementation
- [ ] Combined slip handling
- [ ] Load sensitivity
- [ ] Temperature effects (optional)
- [ ] Wear modeling (optional)
- [ ] Preset configurations

---

### 9.1.11 `src/physics/CharacterController.ts`

**Role:** Character movement physics with collision.

**Public API:**
```typescript
class CharacterController {
  // Configuration
  height: number;
  radius: number;
  slopeLimit: number;
  stepOffset: number;
  skinWidth: number;

  // State
  get isGrounded(): boolean;
  get groundNormal(): Vector3;
  get velocity(): Vector3;

  // Movement
  move(displacement: Vector3): CollisionFlags;
  setPosition(position: Vector3): void;
  getPosition(): Vector3;

  // Callbacks
  onControllerColliderHit: Signal<(hit: ControllerColliderHit) => void>;
}

interface ControllerColliderHit {
  collider: RigidBody;
  point: Vector3;
  normal: Vector3;
  moveDirection: Vector3;
}

enum CollisionFlags {
  NONE = 0,
  SIDES = 1,
  ABOVE = 2,
  BELOW = 4
}
```

**Dependencies:**
- Depends on: `PhysicsWorld`, `CollisionShape`
- Depended by: `CharacterControllerComponent`

**Implementation Checklist:**
- [ ] Capsule-based collision
- [ ] Ground detection with slope handling
- [ ] Step climbing
- [ ] Sliding on steep surfaces
- [ ] Pushback from dynamic objects
- [ ] Moving platform support
- [ ] **Tests:** Ground states, collisions, slopes

---

### 9.1.12 `src/physics/PhysicsMaterial.ts`

**Role:** Surface physics properties.

**Public API:**
```typescript
class PhysicsMaterial {
  readonly id: string;

  friction: number;           // 0 to 1
  restitution: number;        // Bounciness, 0 to 1
  frictionCombine: CombineMode;
  restitutionCombine: CombineMode;
}

enum CombineMode {
  AVERAGE,
  MINIMUM,
  MAXIMUM,
  MULTIPLY
}

// Presets
const PhysicsMaterialPresets = {
  default: PhysicsMaterial;
  ice: PhysicsMaterial;
  rubber: PhysicsMaterial;
  metal: PhysicsMaterial;
  wood: PhysicsMaterial;
  bouncy: PhysicsMaterial;
};
```

**Implementation Checklist:**
- [ ] Friction coefficient
- [ ] Restitution (bounciness)
- [ ] Combine mode for collisions
- [ ] Material presets

---

### 9.1.13 `src/physics/ConstraintSolver.ts`

**Role:** Constraint solving utilities and types.

**Public API:**
```typescript
// Constraint types
class PointToPointConstraint {
  bodyA: RigidBody;
  bodyB: RigidBody;
  pivotA: Vector3;
  pivotB: Vector3;
}

class HingeConstraint {
  bodyA: RigidBody;
  bodyB: RigidBody;
  pivotA: Vector3;
  pivotB: Vector3;
  axisA: Vector3;
  axisB: Vector3;
  lowerLimit: number;
  upperLimit: number;
  motorEnabled: boolean;
  motorTargetVelocity: number;
  motorMaxForce: number;
}

class SliderConstraint {
  bodyA: RigidBody;
  bodyB: RigidBody;
  axis: Vector3;
  lowerLimit: number;
  upperLimit: number;
}

class ConeTwistConstraint {
  bodyA: RigidBody;
  bodyB: RigidBody;
  swingSpan1: number;
  swingSpan2: number;
  twistSpan: number;
}

class SpringConstraint {
  bodyA: RigidBody;
  bodyB: RigidBody;
  stiffness: number;
  damping: number;
  restLength: number;
}

class FixedConstraint {
  bodyA: RigidBody;
  bodyB: RigidBody;
}
```

**Implementation Checklist:**
- [ ] Point-to-point (ball joint)
- [ ] Hinge with limits and motor
- [ ] Slider (prismatic)
- [ ] Cone twist (ragdoll joints)
- [ ] Spring (damped)
- [ ] Fixed (weld)
- [ ] Break force threshold

---

### 9.1.14 `src/physics/PhysicsDebugDraw.ts`

**Role:** Debug visualization for physics.

**Public API:**
```typescript
class PhysicsDebugDraw {
  enabled: boolean;

  // What to draw
  drawShapes: boolean;
  drawBoundingBoxes: boolean;
  drawContactPoints: boolean;
  drawConstraints: boolean;
  drawCenterOfMass: boolean;
  drawVelocities: boolean;
  drawSleepState: boolean;

  // Colors
  staticColor: Color;
  dynamicColor: Color;
  kinematicColor: Color;
  triggerColor: Color;
  sleepingColor: Color;
  contactColor: Color;

  // Render
  render(world: PhysicsWorld, context: RenderContext): void;
}
```

**Implementation Checklist:**
- [ ] Shape wireframe rendering
- [ ] Contact point visualization
- [ ] Constraint line drawing
- [ ] Velocity vectors
- [ ] Sleep state coloring
- [ ] Configurable colors and options

---

---

## 10. Simulation Systems

---

## 10.1 `src/simulation/` – Advanced Simulations

### Directory Structure

```
src/simulation/
├── mpm/
│   ├── MPMFluidSimulation.ts
│   ├── MPMConfig.ts
│   ├── P2GTransfer.ts
│   ├── G2PTransfer.ts
│   ├── Grid.ts
│   ├── ParticleBuffer.ts
│   ├── MaterialModels.ts
│   ├── APICMethod.ts
│   └── DeformationGradient.ts
├── sph/
│   ├── SPHFluidFramework.ts
│   ├── SPHSolver.ts
│   ├── SPHKernels.ts
│   ├── SpatialGrid.ts
│   ├── SecondaryParticles.ts
│   └── FluidRenderer.ts
├── cloth/
│   ├── ClothSimulation.ts
│   ├── PBDSolver.ts
│   ├── ClothCollisionSystem.ts
│   └── ClothTearingSystem.ts
├── softbody/
│   ├── SoftBody.ts
│   ├── SoftBodyParticle.ts
│   ├── SoftBodySolver.ts
│   ├── TetMeshGenerator.ts
│   ├── CollisionDetection.ts
│   └── SoftBodyGPU.ts
├── fracture/
│   ├── VoronoiFractureSystem.ts
│   ├── DelaunayTriangulation.ts
│   ├── VoronoiMath.ts
│   ├── GeometryClipper.ts
│   ├── GPUVoronoiFracture.ts
│   ├── HierarchicalFractureSystem.ts
│   ├── FragmentTree.ts
│   ├── DamageAccumulation.ts
│   └── PrecomputedFracture.ts
├── fire/
│   ├── FireSimulation.ts
│   ├── FireConfig.ts
│   ├── TemperatureField.ts
│   ├── CombustionChemistry.ts
│   ├── TurbulenceSimulation.ts
│   ├── SparkGeneration.ts
│   ├── HeatShimmer.ts
│   └── FireParticleSystem.ts
├── smoke/
│   ├── SmokeSimulation.ts
│   ├── SmokeGrid.ts
│   ├── BuoyancyForces.ts
│   └── SmokeRenderer.ts
├── fem/
│   ├── TetrahedralSolver.ts
│   └── TetrahedralMesh.ts
└── index.ts
```

---

## 10.2 MPM (Material Point Method)

### 10.2.1 `src/simulation/mpm/MPMFluidSimulation.ts`

**Role:** Material Point Method simulation for fluids, snow, sand.

**Public API:**
```typescript
class MPMFluidSimulation {
  // Configuration
  readonly config: MPMConfig;

  // Lifecycle
  initialize(config: MPMConfig): void;
  reset(): void;
  dispose(): void;

  // Simulation
  step(dt: number): void;

  // Particles
  addParticles(positions: Vector3[], velocities: Vector3[], material: MPMMaterial): void;
  removeParticlesInRegion(bounds: Box3): void;
  getParticleCount(): number;
  getParticlePositions(): Float32Array;
  getParticleVelocities(): Float32Array;

  // Boundaries
  addCollider(shape: CollisionShape): void;
  removeCollider(shape: CollisionShape): void;

  // GPU access
  getParticleBuffer(): GPUBuffer;
}

interface MPMConfig {
  gridResolution: [number, number, number];
  cellSize: number;
  particlesPerCell: number;
  materialType: 'elastic' | 'fluid' | 'snow' | 'sand';
  gravity: Vector3;
  useGPU: boolean;
}
```

**Dependencies:**
- Depends on: `Grid`, `ParticleBuffer`, `MaterialModels`, compute shaders
- Depended by: `FluidSystem`

**Implementation Checklist:**
- [ ] Particle-to-grid (P2G) transfer with APIC
- [ ] Grid velocity update (forces, boundaries)
- [ ] Grid-to-particle (G2P) transfer
- [ ] Deformation gradient evolution
- [ ] Multiple material models:
  - [ ] Neo-Hookean elastic
  - [ ] FLIP/PIC fluid
  - [ ] Snow (plasticity, hardening)
  - [ ] Granular (friction, cohesion)
- [ ] Boundary collision handling
- [ ] CPU and GPU paths
- [ ] **Performance:** 500k particles @ 30 FPS (GPU)
- [ ] **Performance:** 50k particles @ 60 FPS (CPU)
- [ ] **Tests:** Conservation laws, stability

---

### 10.2.2 `src/simulation/mpm/MaterialModels.ts`

**Role:** Constitutive material models for MPM.

**Public API:**
```typescript
interface MPMMaterial {
  readonly type: string;
  computeStress(F: Matrix3, particle: MPMParticle): Matrix3;
  projectDeformation(F: Matrix3, particle: MPMParticle): Matrix3;
}

class NeoHookeanMaterial implements MPMMaterial {
  E: number;      // Young's modulus
  nu: number;     // Poisson's ratio
}

class FluidMaterial implements MPMMaterial {
  viscosity: number;
  bulkModulus: number;
}

class SnowMaterial implements MPMMaterial {
  E: number;
  nu: number;
  thetaC: number;    // Critical compression
  thetaS: number;    // Critical stretch
  hardeningCoeff: number;
}

class SandMaterial implements MPMMaterial {
  E: number;
  nu: number;
  frictionAngle: number;
  cohesion: number;
}
```

**Implementation Checklist:**
- [ ] Neo-Hookean for elastic solids
- [ ] FLIP/PIC for incompressible fluids
- [ ] Snow model with plasticity
- [ ] Drucker-Prager for sand/granular
- [ ] Stress tensor computation
- [ ] Deformation projection (plasticity)

---

## 10.3 SPH (Smoothed Particle Hydrodynamics)

### 10.3.1 `src/simulation/sph/SPHFluidFramework.ts`

**Role:** SPH fluid simulation system.

**Public API:**
```typescript
class SPHFluidFramework {
  // Configuration
  readonly config: SPHConfig;

  // Lifecycle
  initialize(config: SPHConfig): void;
  step(dt: number): void;
  dispose(): void;

  // Particles
  addFluid(bounds: Box3, particleSpacing: number): void;
  addParticles(positions: Vector3[]): void;
  getParticleCount(): number;
  getParticleData(): SPHParticleData;

  // Boundaries
  addBoundary(shape: CollisionShape): void;
  removeBoundary(shape: CollisionShape): void;

  // Emitters
  addEmitter(emitter: FluidEmitter): void;
  removeEmitter(emitter: FluidEmitter): void;

  // GPU
  getPositionBuffer(): GPUBuffer;
  getVelocityBuffer(): GPUBuffer;
}

interface SPHConfig {
  restDensity: number;
  particleMass: number;
  smoothingRadius: number;
  viscosity: number;
  surfaceTension: number;
  gravity: Vector3;
  timeStep: number;
  useGPU: boolean;
}
```

**Dependencies:**
- Depends on: `SPHSolver`, `SPHKernels`, `SpatialGrid`, compute shaders
- Depended by: `FluidSystem`

**Implementation Checklist:**
- [ ] Neighbor search via spatial hashing
- [ ] Density computation (poly6 kernel)
- [ ] Pressure forces (spiky kernel)
- [ ] Viscosity forces (viscosity kernel)
- [ ] Surface tension
- [ ] Boundary handling (particles or SDF)
- [ ] PCISPH or DFSPH for incompressibility
- [ ] CPU and GPU implementations
- [ ] **Performance:** 100k particles @ 60 FPS (GPU)
- [ ] **Tests:** Incompressibility, stability

---

### 10.3.2 `src/simulation/sph/SPHKernels.ts`

**Role:** SPH smoothing kernel functions.

**Public API:**
```typescript
const SPHKernels = {
  // Standard kernels
  poly6(r: number, h: number): number;
  poly6Gradient(r: Vector3, h: number): Vector3;

  spiky(r: number, h: number): number;
  spikyGradient(r: Vector3, h: number): Vector3;

  viscosity(r: number, h: number): number;
  viscosityLaplacian(r: number, h: number): number;

  // Cubic spline (alternative)
  cubicSpline(r: number, h: number): number;
  cubicSplineGradient(r: Vector3, h: number): Vector3;
};
```

**Implementation Checklist:**
- [ ] All kernel functions
- [ ] Gradient computation
- [ ] Laplacian computation
- [ ] Optimized for GPU (no branches)

---

### 10.3.3 `src/simulation/sph/FluidRenderer.ts`

**Role:** Renders SPH fluid with screen-space techniques.

**Public API:**
```typescript
class FluidRenderer {
  // Configuration
  particleRadius: number;
  fluidColor: Color;
  refractionStrength: number;
  specularPower: number;

  // Render
  render(particles: GPUBuffer, count: number, context: RenderContext): void;
}
```

**Implementation Checklist:**
- [ ] Point sprite rendering
- [ ] Depth smoothing (bilateral filter)
- [ ] Normal reconstruction from depth
- [ ] Thickness buffer for transparency
- [ ] Screen-space refraction
- [ ] Foam/spray particles
- [ ] **Performance:** 100k particles < 5ms

---

## 10.4 Cloth Simulation

### 10.4.1 `src/simulation/cloth/ClothSimulation.ts`

**Role:** Position-based dynamics cloth simulation.

**Public API:**
```typescript
class ClothSimulation {
  // Configuration
  readonly config: ClothConfig;

  // Lifecycle
  initialize(mesh: ClothMesh, config: ClothConfig): void;
  step(dt: number): void;
  dispose(): void;

  // Particles
  getParticleCount(): number;
  getParticlePositions(): Float32Array;
  getNormals(): Float32Array;

  // Constraints
  pinParticle(index: number, position: Vector3): void;
  unpinParticle(index: number): void;
  attachToBody(indices: number[], body: RigidBody): void;

  // Wind
  setWind(direction: Vector3, strength: number): void;

  // GPU
  getPositionBuffer(): GPUBuffer;
  getNormalBuffer(): GPUBuffer;
}

interface ClothConfig {
  stretchStiffness: number;
  bendStiffness: number;
  damping: number;
  gravity: Vector3;
  iterations: number;
  substeps: number;
  useGPU: boolean;
}
```

**Dependencies:**
- Depends on: `PBDSolver`, `ClothCollisionSystem`, compute shaders
- Depended by: `ClothComponent`, `ClothSystem`

**Implementation Checklist:**
- [ ] PBD constraint solver
- [ ] Distance constraints (stretch)
- [ ] Bending constraints
- [ ] Collision with shapes
- [ ] Self-collision (optional)
- [ ] Pinned vertices
- [ ] Wind forces
- [ ] CPU and GPU implementations
- [ ] **Performance:** 100k particles @ 60 FPS (GPU)
- [ ] **Tests:** Stability, collision handling

---

### 10.4.2 `src/simulation/cloth/ClothTearingSystem.ts`

**Role:** Cloth tearing and cutting.

**Public API:**
```typescript
class ClothTearingSystem {
  // Configuration
  tearThreshold: number;

  // Operations
  checkAndTear(cloth: ClothSimulation): TearEvent[];
  cut(cloth: ClothSimulation, planeOrigin: Vector3, planeNormal: Vector3): void;

  // Events
  onTear: Signal<(event: TearEvent) => void>;
}

interface TearEvent {
  position: Vector3;
  constraintIndex: number;
}
```

**Implementation Checklist:**
- [ ] Strain-based tear detection
- [ ] Constraint removal
- [ ] Mesh topology update
- [ ] Cut plane intersection
- [ ] Edge splitting

---

## 10.5 Soft Body

### 10.5.1 `src/simulation/softbody/SoftBody.ts`

**Role:** Deformable solid body simulation.

**Public API:**
```typescript
class SoftBody {
  // Configuration
  readonly config: SoftBodyConfig;

  // Lifecycle
  initialize(mesh: Mesh, config: SoftBodyConfig): void;
  step(dt: number): void;
  dispose(): void;

  // State
  getDeformedPositions(): Float32Array;
  getDeformedNormals(): Float32Array;
  getVelocities(): Float32Array;

  // Attachment
  attachToRigidBody(body: RigidBody, vertices: number[]): void;

  // Forces
  applyForce(force: Vector3, worldPoint: Vector3): void;
  applyImpulse(impulse: Vector3, worldPoint: Vector3): void;
}

interface SoftBodyConfig {
  mass: number;
  stiffness: number;
  damping: number;
  volumePreservation: number;
  iterations: number;
  useGPU: boolean;
}
```

**Dependencies:**
- Depends on: `SoftBodySolver`, `TetMeshGenerator`
- Depended by: `SoftBodyComponent`

**Implementation Checklist:**
- [ ] Tetrahedral mesh generation
- [ ] Volume preservation constraints
- [ ] Shape matching
- [ ] Collision with rigid bodies
- [ ] Self-collision (optional)
- [ ] Attachment points
- [ ] CPU and GPU paths
- [ ] **Performance:** 10k tetrahedra @ 60 FPS

---

## 10.6 Fracture

### 10.6.1 `src/simulation/fracture/VoronoiFractureSystem.ts`

**Role:** Voronoi-based mesh fracturing.

**Public API:**
```typescript
class VoronoiFractureSystem {
  // Fracture operations
  fracture(mesh: Mesh, impactPoint: Vector3, impactForce: number): FractureResult;
  fractureWithPattern(mesh: Mesh, pattern: FracturePattern): FractureResult;
  precomputeFracture(mesh: Mesh, cellCount: number): PrecomputedFracture;

  // Configuration
  minFragmentSize: number;
  maxFragments: number;
}

interface FractureResult {
  fragments: MeshFragment[];
  interiorFaces: Face[];
  debris: DebrisData[];
}

interface MeshFragment {
  mesh: Mesh;
  volume: number;
  centerOfMass: Vector3;
  convexHull: ConvexHullShape;
}
```

**Dependencies:**
- Depends on: `VoronoiMath`, `DelaunayTriangulation`, `GeometryClipper`
- Depended by: `FractureSystem`

**Implementation Checklist:**
- [ ] Voronoi cell generation from impact point
- [ ] Mesh clipping against Voronoi cells
- [ ] Interior face generation with UVs
- [ ] Convex hull computation for physics
- [ ] Fragment mass/inertia calculation
- [ ] Pattern-based fracture (radial, grid)
- [ ] Precomputation for performance
- [ ] GPU acceleration (compute)
- [ ] **Performance:** 100 fragments < 50ms (precomputed < 5ms)
- [ ] **Tests:** Mesh validity, physics correctness

---

### 10.6.2 `src/simulation/fracture/HierarchicalFractureSystem.ts`

**Role:** Multi-level fracture for progressive destruction.

**Public API:**
```typescript
class HierarchicalFractureSystem {
  // Build hierarchy
  buildFragmentTree(mesh: Mesh, levels: number): FragmentTree;

  // Runtime fracture
  fractureNode(tree: FragmentTree, nodeId: number, force: number): FractureResult;

  // Damage accumulation
  accumulateDamage(tree: FragmentTree, nodeId: number, damage: number): void;
  getDamage(tree: FragmentTree, nodeId: number): number;
}

interface FragmentTree {
  root: FragmentNode;
  levels: number;
  totalNodes: number;
}

interface FragmentNode {
  id: number;
  mesh: Mesh;
  children: FragmentNode[];
  damage: number;
  threshold: number;
}
```

**Implementation Checklist:**
- [ ] Hierarchical Voronoi subdivision
- [ ] Progressive fracture activation
- [ ] Damage accumulation model
- [ ] Threshold-based breaking
- [ ] Efficient tree traversal

---

## 10.7 Fire & Smoke

### 10.7.1 `src/simulation/fire/FireSimulation.ts`

**Role:** Fire and combustion simulation.

**Public API:**
```typescript
class FireSimulation {
  // Configuration
  readonly config: FireConfig;

  // Lifecycle
  initialize(config: FireConfig): void;
  step(dt: number): void;
  dispose(): void;

  // Sources
  addSource(position: Vector3, intensity: number, radius: number): FireSource;
  removeSource(source: FireSource): void;

  // State
  getTemperatureField(): Float32Array;
  getVelocityField(): Float32Array;
  getDensityField(): Float32Array;

  // Rendering data
  getFireParticles(): GPUBuffer;
  getSmokeParticles(): GPUBuffer;
}

interface FireConfig {
  gridResolution: [number, number, number];
  cellSize: number;
  fuelBurnRate: number;
  heatOutput: number;
  turbulence: number;
  smokeDensity: number;
}
```

**Dependencies:**
- Depends on: `TemperatureField`, `TurbulenceSimulation`, `FireParticleSystem`
- Depended by: VFX system

**Implementation Checklist:**
- [ ] Temperature advection-diffusion
- [ ] Buoyancy forces
- [ ] Combustion model
- [ ] Fuel consumption
- [ ] Turbulence injection (curl noise)
- [ ] Particle emission from hot regions
- [ ] Smoke generation
- [ ] **Performance:** 64³ grid @ 60 FPS

---

### 10.7.2 `src/simulation/smoke/SmokeSimulation.ts`

**Role:** Smoke and gas simulation.

**Public API:**
```typescript
class SmokeSimulation {
  // Configuration
  readonly config: SmokeConfig;

  // Lifecycle
  initialize(config: SmokeConfig): void;
  step(dt: number): void;
  dispose(): void;

  // Emitters
  addEmitter(position: Vector3, rate: number, velocity: Vector3): SmokeEmitter;
  removeEmitter(emitter: SmokeEmitter): void;

  // Density field
  getDensityTexture(): GPUTexture;
  getVelocityTexture(): GPUTexture;
}

interface SmokeConfig {
  gridResolution: [number, number, number];
  dissipation: number;
  buoyancy: number;
  turbulence: number;
  vorticityConfinement: number;
}
```

**Implementation Checklist:**
- [ ] Semi-Lagrangian advection
- [ ] Pressure projection (incompressibility)
- [ ] Buoyancy based on density
- [ ] Vorticity confinement
- [ ] Dissipation over time
- [ ] Obstacle boundaries
- [ ] **Performance:** 128³ grid @ 30 FPS

---

## 10.8 FEM (Finite Element Method)

### 10.8.1 `src/simulation/fem/TetrahedralSolver.ts`

**Role:** FEM solver for deformable bodies.

**Public API:**
```typescript
class TetrahedralSolver {
  // Configuration
  youngModulus: number;
  poissonRatio: number;
  damping: number;

  // Lifecycle
  initialize(mesh: TetrahedralMesh): void;
  step(dt: number): void;

  // State
  getDeformedPositions(): Float32Array;
  getStresses(): Float32Array;

  // Forces
  applyForce(nodeIndex: number, force: Vector3): void;
  fixNode(nodeIndex: number): void;
}
```

**Implementation Checklist:**
- [ ] Corotational FEM
- [ ] Linear and nonlinear elasticity
- [ ] Implicit integration (stability)
- [ ] Sparse matrix solver
- [ ] Fixed boundary conditions
- [ ] **Performance:** 10k elements @ 60 FPS

---

---

## Next Document

Continue to `PRD-Final-05-Animation.md` for Animation specifications.
