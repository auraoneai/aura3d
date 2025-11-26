G3D 5.0 – World-Class Web Engine

Master PRD – Single Source of Truth

All implementation of G3D 5.0 must conform to this document.
No TODOs, no stubs, no “minimal first” versions. Every file listed here must exist and be fully implemented.

⸻

1. Vision & Hard Constraints

1.1 Vision

G3D 5.0 is a web-native, Unity/Unreal-class engine with:
	•	Film-quality rendering (PBR + advanced materials, GI, volumetrics).
	•	Full physics & simulation stack (rigid, soft, cloth, fluids, fracture, GPU physics).
	•	Advanced animation (motion matching, procedural, full-body IK, facial, ML).
	•	Rich AI/ML (behavior trees, navigation, ML NPCs, CV, procedural content).
	•	Complete world & domain support (terrain, streaming, voxel, weather, scientific, medical, BIM, XR, e-commerce).
	•	Batteries-included UX & infra (UI, networking, visual scripting, editor, profiling, asset pipeline, cloud).

1.2 Non-Negotiable Rules
	1.	No “basic engine”.
All core abstractions (renderer, ECS, materials, physics, animation, etc.) must be designed from the start to support the full feature set enumerated in this PRD.
	2.	Single canonical implementation per major subsystem.
One renderer, one physics engine interface, one unified particle system, one uniform manager, etc.
	3.	No stubs / TODOs / placeholders.
Every file listed here is implemented to production quality when created.
	4.	No untracked files.
If it’s not in this PRD, either:
	•	You add it here first, or
	•	You don’t create it.

⸻

2. Runtime Spine & Layering

2.1 Main Loop Order

The engine loop must follow this order for each frame:

update(dt):
  1. core/Time.update()
  2. input/InputSystem.update(dt)
  3. ecs World: Core gameplay systems (AI, gameplay, animation controllers)
  4. physics/PhysicsSystem.step(dt)
  5. simulation/ advanced sims (fluids, cloth, MPM, fracture, etc.)
  6. scene/SceneSyncSystem.update(dt)       // Build RenderScene + PhysicsScene views
  7. audio/AudioSystem.update(dt)
  8. net/NetReplicationSystem.update(dt)
  9. rendering/Renderer.beginFrame()
  10. rendering/RenderGraph.executeAll()
  11. ui/UISystem.render()
  12. profiling/Profiler.tick(dt)
  13. rendering/Renderer.endFrame()

Rules:
	•	No rendering in systems 1–8.
	•	No gameplay/physics logic in RenderGraph passes.
	•	All cross-subsystem interactions go via ECS components or explicit interfaces.

2.2 Layering

From lowest to highest:
	1.	core / math
	2.	ecs
	3.	platform
	4.	rendering / physics / audio / net / input
	5.	scene / animation / vfx / world / ai
	6.	ui / tools / editor / scripting / analytics / cloud
	7.	domain packs (scientific, medical, BIM, XR, ecommerce, collab)

Higher layers may depend on lower; never the reverse.

⸻

3. Directory & File Layout (Top-Level Overview)

Engine root:

src/
  core/
  math/
  ecs/
  platform/
  rendering/
  shaders/
  materials/
  textures/
  postfx/
  lighting/
  environment/
  animation/
  physics/
  simulation/
  vfx/
  particles/
  ocean/
  terrain/
  voxel/
  world/
  weather/
  scientific/
  medical/
  architecture/
  ecommerce/
  xr/
  ai/
  net/
  input/
  ui/
  audio/
  assets/
  serialization/
  timeline/
  profiling/
  optimization/
  streaming/
  scripting/
  editor/
  analytics/
  cloud/
  localization/
  utilities/
  types/
  constants/
  index.ts
  version.ts

The next sections define every file under these directories and their tasks. For file groups with many variants, we list all file names and then provide a shared group checklist to avoid duplication.

⸻

4. Core, Math, ECS

4.1 src/core/ – Engine Foundation

src/core/
  Engine.ts
  EngineConfig.ts
  Time.ts
  Logger.ts
  ObjectPool.ts
  EventBus.ts
  TaskScheduler.ts
  Diagnostics.ts
  Panic.ts
  Assert.ts
  Random.ts
  IdGenerator.ts
  BuildInfo.ts
  index.ts

src/core/Engine.ts
	•	Responsibility: Main entry point, orchestration of all subsystems.
	•	Checklist:
	•	initialize(config: EngineConfig): Promise<void> wires ECS, Renderer, Physics, Audio, Net, UI, etc.
	•	start() / stop() / pause() manage main loop & Time.
	•	Owns single World instance and Renderer instance.
	•	Applies strict update order (Section 2.1).
	•	Exposes hooks: onBeforeUpdate, onAfterUpdate, onBeforeRender, onAfterRender.
	•	No allocations in per-frame path.

src/core/EngineConfig.ts
	•	Defines complete configuration for all subsystems (rendering, physics, AI, networking, etc.).
	•	Supports serialization & merging (defaults + overrides).
	•	Includes quality presets (low, medium, high, ultra) and platform heuristics.

src/core/Time.ts
	•	Maintains deltaTime, fixedDelta, frameIndex, timeScale.
	•	Implements fixed timestep accumulator for physics & sims.
	•	Handles ultra-slow frames (max N fixed steps per frame).

src/core/Logger.ts
	•	Structured logging with log levels and tagged categories.
	•	Can output to console, in-engine console, remote log sink.
	•	Configurable per-subsystem verbosity.

src/core/ObjectPool.ts
	•	Generic object pool with acquire() / release().
	•	Zero allocations after warm-up.
	•	Used by particles, short-lived math objects, ECS components where needed.

src/core/EventBus.ts
	•	Pub/sub for engine-level events (engine lifecycle, scene changes).
	•	Type-safe event registration.

src/core/TaskScheduler.ts
	•	Allows scheduling of background tasks (asset decoding, async jobs).
	•	Integrates with browser setTimeout/requestIdleCallback where available.

src/core/Diagnostics.ts
	•	Central diagnostics reporting API (asserts, warnings, perf warnings).
	•	Hooks into Logger, Profiler, and Editor overlays.

src/core/Panic.ts
	•	Hard-fail helper for unrecoverable situations.
	•	Can be overridden to show user-friendly fatal screens.

src/core/Assert.ts
	•	Assertion helpers stripped in production builds where appropriate.

src/core/Random.ts
	•	Engine-wide RNG abstraction (seedable; supports deterministic runs for replays/tests).

src/core/IdGenerator.ts
	•	Generates globally unique IDs for persistent entities/assets.

src/core/BuildInfo.ts
	•	Contains build-time constants (version, git commit, build date).

src/core/index.ts
	•	Re-exports all core API.

⸻

4.2 src/math/ – Core Mathematics

src/math/
  Vector2.ts
  Vector3.ts
  Vector4.ts
  Matrix3.ts
  Matrix4.ts
  Quaternion.ts
  Color.ts
  Rect.ts
  Box3.ts
  Sphere.ts
  Plane.ts
  Ray.ts
  Frustum.ts
  Transform.ts
  Spline.ts
  Interpolation.ts
  Easing.ts
  RandomMath.ts
  MathConstants.ts
  index.ts

Group Checklist for math primitives (Vector, Matrix, Quaternion, Color, etc.):**
	•	Implement full basic ops (add/sub/mul/div, dot, cross, normalize, length).
	•	Avoid allocations where possible (in-place variants).
	•	Provide static and instance APIs.
	•	Provide toArray/fromArray and serialization helpers.
	•	Unit tests with >90% coverage for numerical correctness.

Additional specific tasks:

src/math/Frustum.ts
	•	Extract frustum planes from projection×view.
	•	Intersection tests with Box3, Sphere, Ray.
	•	Used by culling systems.

src/math/Transform.ts
	•	Encapsulates position, rotation, scale.
	•	Builds local & world matrices and supports parent-child relationships (with ECS integration).

⸻

4.3 src/ecs/ – Entity Component System

src/ecs/
  World.ts
  Entity.ts
  Component.ts
  System.ts
  Query.ts
  Archetype.ts
  ComponentStore.ts
  ComponentRegistry.ts
  SystemScheduler.ts
  CommandBuffer.ts
  EntityManager.ts
  SparseSet.ts
  Bitset.ts
  ECSSerializer.ts
  ECSProfiler.ts
  components/
    TransformComponent.ts
    MeshComponent.ts
    MaterialComponent.ts
    CameraComponent.ts
    LightComponent.ts
    RigidBodyComponent.ts
    ColliderComponent.ts
    AudioSourceComponent.ts
    NetworkIdentityComponent.ts
    ScriptComponent.ts
    TagComponent.ts
    ParticleEmitterComponent.ts
    VolumeComponent.ts
    TerrainChunkComponent.ts
    VoxelChunkComponent.ts
    OceanComponent.ts
    WeatherZoneComponent.ts
    CrowdAgentComponent.ts
    AIStateComponent.ts
    AnimationStateComponent.ts
    FacialRigComponent.ts
    MotionMatchingComponent.ts
    SoftBodyComponent.ts
    ClothComponent.ts
    FluidComponent.ts
    VehicleComponent.ts
    CharacterControllerComponent.ts
    XRViewComponent.ts
  systems/
    TransformSystem.ts
    RenderSystem.ts
    CullingSystem.ts
    AnimationSystem.ts
    PhysicsSystem.ts
    SoftBodySystem.ts
    ClothSystem.ts
    FluidSystem.ts
    FractureSystem.ts
    CrowdSystem.ts
    AISystem.ts
    NavigationSystem.ts
    WeatherSystem.ts
    OceanSystem.ts
    TerrainSystem.ts
    VoxelSystem.ts
    AudioSystem.ts
    NetReplicationSystem.ts
    NetPredictionSystem.ts
    UISystem.ts
    ScriptingSystem.ts
    TimelineSystem.ts
    StreamingSystem.ts
    XRSystem.ts
    ProfilingSystem.ts
  index.ts

Core ECS files
src/ecs/World.ts
	•	Stores all entities, component stores, and systems.
	•	Provides createEntity(), destroyEntity(), addComponent, removeComponent.
	•	Orchestrates system updates by phase (PrePhysics, Physics, PostPhysics, PreRender, etc.).
	•	Supports serialization hooks.

src/ecs/System.ts
	•	Base class/interface for all systems:
	•	update(world: World, dt: number): void
	•	phase: SystemPhase
	•	Optional initialize, shutdown.
	•	Registered in SystemScheduler.

src/ecs/Query.ts
	•	Bitmask-based entity querying.
	•	Caches matching archetypes for fast iteration.

src/ecs/Archetype.ts
	•	Stores entities with identical component sets in tightly packed arrays.
	•	Efficient iteration; columnar storage.

src/ecs/ComponentStore.ts
	•	Manages storage and reuse for a specific component type.

src/ecs/CommandBuffer.ts
	•	Records structural changes (add/remove components, create/destroy entities) to be applied safely at sync points.

src/ecs/ECSSerializer.ts
	•	Serializes & deserializes ECS state for save/load and network snapshots.

src/ecs/ECSProfiler.ts
	•	Tracks per-system execution time & entity counts.

Component files (group checklist)
All src/ecs/components/*Component.ts:
	•	Define component data as TS types/classes (POD where possible).
	•	Provide default constructors and reset methods.
	•	Provide serialization & deserialization methods or schema descriptors.
	•	Registered with ComponentRegistry.

Example extras:
	•	MotionMatchingComponent.ts:
	•	Stores reference to motion database entry, current trajectory target, blending weights.
	•	FacialRigComponent.ts:
	•	Stores blendshape weights & FACS action unit states.

System files (group checklist)
All src/ecs/systems/*System.ts:
	•	Extend System.
	•	Define their queries explicitly (e.g. TransformSystem queries TransformComponent).
	•	Make no assumptions about global singletons; only use World and dependencies defined via injection or managers.
	•	Zero allocations in update.

Examples with specific tasks:

src/ecs/systems/RenderSystem.ts
	•	Translates ECS render components into RenderScene objects for renderer.
	•	Aggregates visible meshes, lights, probes, environment volumes.
	•	No GPU calls; pure data preparation.

src/ecs/systems/PhysicsSystem.ts
	•	Syncs transforms to physics world before stepping.
	•	Steps unified physics engine & GPU physics subsystems.
	•	Writes back positions/rotations to ECS.

⸻

5. Rendering, Shaders, Materials, PostFX

5.1 src/rendering/ – Renderer & RenderGraph

src/rendering/
  Renderer.ts
  RenderGraph.ts
  RenderContext.ts
  RenderDevice.ts
  BackbufferManager.ts
  FrameResources.ts
  GBuffer.ts
  ViewData.ts
  DrawListBuilder.ts
  DebugDraw.ts
  backends/
    WebGLDevice.ts
    WebGPUDevice.ts
  passes/
    GeometryPass.ts
    ShadowMapPass.ts
    LightingPass.ts
    ForwardTransparentPass.ts
    SkyPass.ts
    OceanPass.ts
    TerrainPass.ts
    VoxelPass.ts
    ParticlePass.ts
    VolumetricLightingPass.ts
    SSAOPass.ts
    SSRPass.ts
    SSGIPass.ts
    BloomPass.ts
    DOFPass.ts
    MotionBlurPass.ts
    ChromaticAberrationPass.ts
    FilmGrainPass.ts
    ColorGradingPass.ts
    TAAPass.ts
    SMAAPass.ts
    FXAAPass.ts
    OutlinePass.ts
    MLPostProcessPass.ts
    DebugOverlayPass.ts
  culling/
    ViewFrustumCuller.ts
    GPUCulling.ts
    HiZCulling.ts
  debug/
    RenderDocIntegration.ts
    RenderGraphVisualizer.ts
  index.ts

src/rendering/Renderer.ts
	•	Public render API:
	•	initialize(canvas, config)
	•	resize(width, height)
	•	render(frameInfo: FrameInfo)
	•	Owns RenderGraph and RenderDevice.
	•	Handles backend selection (WebGPU preferred, WebGL2 fallback).
	•	Cooperates with ECS & RenderSystem via RenderScene data.

src/rendering/RenderGraph.ts
	•	DAG of RenderPass nodes.
	•	Allocates and reuses render targets.
	•	Defines canonical film-quality chain:
	1.	Geometry/Depth
	2.	Shadows
	3.	Lighting (deferred or clustered)
	4.	GI/SSAO/SSGI
	5.	Reflections (SSR/Hybrid)
	6.	Volumetrics
	7.	Transparent & particles
	8.	PostFX chain (Bloom → DOF → Motion Blur → Chromatic → TAA/SMAA/FXAA → Color grading)
	9.	Debug overlays

Backend files (backends/)
	•	WebGLDevice.ts:
	•	Encapsulates all WebGL2 calls (buffers, textures, shaders).
	•	WebGPUDevice.ts:
	•	Encapsulates all WebGPU API usage.

Group checklist:
	•	Provide a consistent RenderDevice interface for creating buffers, textures, pipelines, and issuing draw/compute calls.
	•	Abstract GL/GPU specifics from passes and materials.

Pass files (passes/*.ts)
Each pass:
	•	Implements RenderPass interface: setup(graph) + execute(ctx).
	•	Declares inputs/outputs (render targets, depth, textures).
	•	Binds appropriate shaders & uniforms/materials.
	•	Zero ECS/game logic here.

Examples:
	•	SSGIPass.ts:
	•	Implements multi-bounce screen-space GI with temporal accumulation and spatial denoise.
	•	TAAPass.ts:
	•	Uses motion vectors and jitter patterns; history buffers.

⸻

5.2 src/shaders/ – Shader System

src/shaders/
  ShaderLibrary.ts
  ShaderCompiler.ts
  ShaderChunkRegistry.ts
  ShaderChunkCache.ts
  GLSLCodeGenerator.ts
  WGSLCodeGenerator.ts
  graph/
    ShaderGraph.ts
    ShaderNode.ts
    ShaderEdge.ts
    NodeLibrary.ts
    GraphSerializer.ts
    GraphValidator.ts
  chunks/
    common.glsl
    pbr.glsl
    lighting.glsl
    shadow.glsl
    ssgi.glsl
    ssr.glsl
    ao.glsl
    volumetric.glsl
    fxaa.glsl
    smaa.glsl
    taa.glsl
    bloom.glsl
    dof.glsl
    motion_blur.glsl
    chromatic.glsl
    film_grain.glsl
    tone_mapping.glsl
    color_grading.glsl
    outline.glsl
    hair.glsl
    cloth.glsl
    ocean.glsl
    volumetric_particles.glsl
    caustics.glsl
    parallax_occlusion.glsl
    matcap.glsl
    toon.glsl
  compute/
    particle_update.wgsl
    particle_spawn.wgsl
    particle_cull.wgsl
    cloth_solve.wgsl
    sph_solve.wgsl
    mpm_p2g.wgsl
    mpm_grid.wgsl
    mpm_g2p.wgsl
    voronoi_compute.wgsl
    fem_tetrahedral.wgsl
    gpu_culling.wgsl
    volume_density.wgsl
    caustics_photon_trace.wgsl
    caustics_accumulate.wgsl
    caustics_blur.wgsl
  index.ts

Group checklist:
	•	ShaderLibrary indexes all shader programs by ID and assembles them from chunks.
	•	ShaderChunkRegistry defines dependencies between chunks and ensures correct assembly order.
	•	ShaderGraph supports node-based shader generation (PBR, unlit, custom templates).

All compute shaders must implement the algorithms described (particles, SPH, MPM, GPU culling, caustics, FEM, etc.).

⸻

5.3 src/materials/ – Material System

src/materials/
  Material.ts
  MaterialInstance.ts
  MaterialLibrary.ts
  StandardPBRMaterial.ts
  UnlitMaterial.ts
  SkyboxMaterial.ts
  DepthOnlyMaterial.ts
  WireframeMaterial.ts
  PhongMaterial.ts
  BlinnPhongMaterial.ts
  ToonMaterial.ts
  MatCapMaterial.ts
  IridescenceMaterial.ts
  AnisotropicMaterial.ts
  SubsurfaceMaterial.ts
  SheenMaterial.ts
  CarPaintMaterial.ts
  ClothMaterial.ts
  HairMaterial.ts
  SurfaceDetailMaterial.ts
  TransmissionMaterial.ts
  VolumetricMaterial.ts
  OceanMaterial.ts
  TerrainMaterial.ts
  VoxelMaterial.ts
  ParticleMaterial.ts
  VolumetricParticleMaterial.ts
  MedicalVolumeMaterial.ts
  SHLightingMaterial.ts
  RectAreaLightMaterial.ts
  ParallaxOcclusionMaterial.ts
  LayeredMaterial.ts
  MaterialPresets.ts
  index.ts

Group base checklist:
	•	Material.ts:
	•	Defines abstract interface for binding to RenderDevice.
	•	Holds parameter definitions (scalars, vectors, textures, toggles).
	•	MaterialInstance.ts:
	•	Concrete instance of material with specific parameter values.
	•	MaterialLibrary.ts:
	•	Manages registration and lookup of materials.

Each concrete material (PBR, Toon, Hair, Cloth, etc.):
	•	Implements parameters and binds appropriate shaders.
	•	Integrates with shader chunk system.
	•	Matches feature sets described (cloth BRDF, hair Marschner, car paint layers, SSS, etc.).

⸻

5.4 src/postfx/ – Post-Processing Suite

src/postfx/
  PostProcessChain.ts
  AntiAliasingManager.ts
  TAAPassController.ts
  ToneMappingController.ts
  LUTLoader.ts
  FXAAController.ts
  SMAAController.ts
  BloomController.ts
  DOFController.ts
  MotionBlurController.ts
  VolumetricController.ts
  OutlineController.ts
  MLPostProcessController.ts
  index.ts

Each controller:
	•	Exposes high-level config API for that pass (quality presets, thresholds, enables).
	•	Bridges ECS/game/UI config into RenderGraph parameters.

⸻

6. Physics & Simulation

6.1 src/physics/

src/physics/
  PhysicsWorld.ts
  PhysicsBackend.ts
  CannonBackend.ts
  RapierBackend.ts
  AmmoBackend.ts
  MockPhysicsWorld.ts
  CollisionShape.ts
  CollisionDetection.ts
  ConstraintSolver.ts
  RigidBody.ts
  VehiclePhysics.ts
  TireModel.ts
  CharacterController.ts
  PhysicsMaterial.ts
  PhysicsDebugDraw.ts
  index.ts

Checklist highlights:
	•	PhysicsWorld.ts:
	•	Wraps chosen backend; provides engine-agnostic API.
	•	ConstraintSolver.ts:
	•	Implements static/kinetic friction, constraints, XPBD as needed.
	•	VehiclePhysics.ts / TireModel.ts:
	•	Realistic vehicle simulation as per spec.

6.2 src/simulation/

src/simulation/
  mpm/
    MPMFluidSimulation.ts
    MPMConfig.ts
    P2GTransfer.ts
    G2PTransfer.ts
    Grid.ts
    ParticleBuffer.ts
    MaterialModels.ts
    APICMethod.ts
    DeformationGradient.ts
  sph/
    SPHFluidFramework.ts
    SPHSolver.ts
    SPHKernels.ts
    SpatialGrid.ts
    SecondaryParticles.ts
    FluidRenderer.ts
  cloth/
    ClothSimulation.ts
    PBDSolver.ts
    ClothCollisionSystem.ts
    ClothTearingSystem.ts
  softbody/
    SoftBody.ts
    SoftBodyParticle.ts
    SoftBodySolver.ts
    TetMeshGenerator.ts
    CollisionDetection.ts
    SoftBodyGPU.ts
  fracture/
    VoronoiFractureSystem.ts
    DelaunayTriangulation.ts
    VoronoiMath.ts
    GeometryClipper.ts
    GPUVoronoiFracture.ts
    HierarchicalFractureSystem.ts
    FragmentTree.ts
    DamageAccumulation.ts
    PrecomputedFracture.ts
  fire/
    FireSimulation.ts
    FireConfig.ts
    TemperatureField.ts
    CombustionChemistry.ts
    TurbulenceSimulation.ts
    SparkGeneration.ts
    HeatShimmer.ts
    FireParticleSystem.ts
  smoke/
    SmokeSimulation.ts
    SmokeGrid.ts
    BuoyancyForces.ts
    SmokeRenderer.ts
  fem/
    TetrahedralSolver.ts
    TetrahedralMesh.ts
  index.ts

Group checklists:
	•	Each simulation system implements:
	•	ECS components, CPU & GPU paths, performance targets from spec.
	•	Integration with rendering (passes) and physics where appropriate.

⸻

7. Animation

src/animation/
  AnimationSystem.ts
  AnimationClip.ts
  AnimationMixer.ts
  AnimationStateMachine.ts
  BlendTree.ts
  BlendNode.ts
  AnimationLayer.ts
  MotionMatchingSystem.ts
  MotionDatabase.ts
  MotionMatcher.ts
  KDTree.ts
  MotionFeatures.ts
  TrajectoryGenerator.ts
  FootIKSolver.ts
  ProceduralAnimationSystem.ts
  LocomotionGenerator.ts
  SecondaryMotionSystem.ts
  BreathingGenerator.ts
  SpringBoneSystem.ts
  SpringBoneChain.ts
  IK/
    CCDSolver.ts
    FABRIKSolver.ts
    TwoBoneIKSolver.ts
    FullBodyIKSolver.ts
  facial/
    FacialAnimationSystem.ts
    BlendShapeController.ts
    FacialRig.ts
    ExpressionLibrary.ts
    LipSyncSystem.ts
  hand/
    HandPoseGenerator.ts
    FingerIKSolver.ts
    GripTypeSolver.ts
    GestureLibrary.ts
  mocap/
    MocapImporter.ts
    MocapRetargeting.ts
    MocapTools.ts
  ml/
    MLAnimationSystem.ts
    TextToMotion.ts
    MotionData.ts
  index.ts

Each of these must implement the full motion-matching, IK, procedural, facial, hand pose, breathing, etc. behaviors described earlier.

⸻

8. AI, ML, Navigation

src/ai/
  AIManager.ts
  navigation/
    NavMesh.ts
    NavMeshGenerator.ts
    NavAgent.ts
    PathFinder.ts
    PathFollower.ts
    ObstacleAvoidance.ts
    CrowdManager.ts
    NavigationMeshVolume.ts
  behavior/
    BehaviorTree.ts
    BTNode.ts
    BTComposite.ts
    BTDecorator.ts
    BTAction.ts
    BTCondition.ts
    Blackboard.ts
  fsm/
    StateMachine.ts
    State.ts
    Transition.ts
    StateCondition.ts
    HierarchicalFSM.ts
  steering/
    SteeringBehavior.ts
    Seek.ts
    Flee.ts
    Wander.ts
    Pursuit.ts
    Evade.ts
    Flock.ts
    Formation.ts
    SteeringPipeline.ts
  perception/
    SensorSystem.ts
    VisionSensor.ts
    HearingSensor.ts
    ProximitySensor.ts
    MemorySystem.ts
  planning/
    GOAPPlanner.ts
    HTNPlanner.ts
    UtilityAI.ts
    DecisionTree.ts
  ml/
    ONNXRuntimeWrapper.ts
    ModelManager.ts
    FeatureExtractor.ts
    PolicyNetwork.ts
    RewardFunction.ts
    BehaviorCloningAgent.ts
    RLAgent.ts
    NPCController.ts
    NeuralPathfinder.ts
    NeuralArchitecture.ts
  cultural/
    CulturalBehaviorSystem.ts
    Culture.ts
    SocialNormSystem.ts
    ProxemicsSystem.ts
    CommunicationStyleSystem.ts
    DecisionMakingSystem.ts
    CulturePresets.ts
  lsystem/
    LSystemManager.ts
    LSystemParser.ts
    DOLSystem.ts
    ContextSensitiveLSystem.ts
    StochasticLSystem.ts
    ParametricLSystem.ts
    TurtleInterpreter.ts
    BehaviorInterpreter.ts
    LSystemMeshGenerator.ts
    GrammarLibrary.ts
  computervision/
    CVSystem.ts
    ModelLoader.ts
    InferenceEngine.ts
    ImageClassifier.ts
    ObjectDetector.ts
    PoseEstimator.ts
    SceneAnalyzer.ts
    ObjectTracker.ts
    Visualization.ts
  balancing/
    BalancingSystem.ts
    AppliedBalanceChange.ts
  smart/
    SmartSystemsFramework.ts
    EventSystem.ts
    PlayerProfile.ts
    BehaviorAnalyzer.ts
    DifficultyAdjuster.ts
    ContentGenerator.ts
  index.ts

Each of these maps directly to the ML NPC behavior system, neural pathfinding, CV AI, L-system AI, cultural behavior, etc.

⸻

9. World, Terrain, Voxel, Ocean, Weather, Scientific, Medical, XR, Ecommerce

Due to length, I’ll outline their structure and expectations; the files names are derived from your catalog:

9.1 Terrain

src/terrain/
  Terrain.ts
  TerrainData.ts
  TerrainRenderer.ts
  TerrainMaterial.ts
  generation/
    TerrainGenerator.ts
    NoiseGenerator.ts
    ErosionSimulator.ts
    BiomeGenerator.ts
    RiverGenerator.ts
  heightmap/
    Heightmap.ts
    HeightmapImporter.ts
    HeightmapExporter.ts
    HeightmapTools.ts
  texturing/
    TerrainTexturing.ts
    SplatMap.ts
    TextureArray.ts
    TriplanarMapping.ts
    DetailTextures.ts
  vegetation/
    VegetationSystem.ts
    GrassRenderer.ts
    TreePlacer.ts
    Instancing.ts
    WindAnimation.ts
  lod/
    TerrainLOD.ts
    ChunkedTerrain.ts
    QuadTree.ts
    GeometryClipmaps.ts
    MeshSimplification.ts
  collision/
    TerrainCollider.ts
    HeightQuery.ts
    RaycastTerrain.ts
  index.ts

9.2 Voxel

src/voxel/
  VoxelWorld.ts
  WorldChunk.ts
  ChunkManager.ts
  GreedyMesher.ts
  VoxelCollision.ts
  VoxelTypes.ts
  TerrainGenerator.ts
  OctreeLOD.ts
  VoxelLighting.ts
  VoxelDestructionSystem.ts
  DestructionDebrisGenerator.ts
  StabilityChecker.ts
  ChunkRemesher.ts
  index.ts

9.3 Ocean

src/ocean/
  OceanSystem.ts
  OceanFFT.ts
  PhillipsSpectrum.ts
  WaveCascade.ts
  OceanLOD.ts
  QuadTree.ts
  FoamRenderer.ts
  GerstnerWaveSystem.ts
  OceanMesh.ts
  OceanRenderer.ts
  OceanConfig.ts
  index.ts

9.4 Weather

src/weather/
  WeatherSystem.ts
  WeatherState.ts
  WeatherPreset.ts
  WeatherTransition.ts
  TimeOfDay.ts
  RainSystem.ts
  SnowSystem.ts
  HailSystem.ts
  WindField.ts
  VolumetricFogSystem.ts
  LightningSystem.ts
  WetnessSystem.ts
  RainShaderResources.ts
  index.ts

9.5 Scientific & Medical

src/scientific/
  field/
    FieldManager.ts
    FieldData.ts
    VectorFieldRenderer.ts
    ScalarFieldRenderer.ts
    StreamlineIntegrator.ts
    ParticleTracer.ts
    FieldProbe.ts
    FieldDataLoader.ts
    ColorMap.ts
    MarchingCubesTables.ts
  climate/
    ClimateSystem.ts
    ClimateGrid.ts
    TemperatureSimulator.ts
    PressureHumiditySimulator.ts
    WindSimulator.ts
    WeatherEventGenerator.ts
    ClimateZone.ts
  index.ts

src/medical/
  VolumeData.ts
  VolumeRenderer.ts
  TransferFunction.ts
  DICOMLoader.ts
  MPRSlicer.ts
  IsosurfaceExtractor.ts
  MarchingCubesTable.ts
  MedicalTools.ts
  index.ts

9.6 Architecture & BIM

src/architecture/
  section/
    SectionManager.ts
    SectionFillGenerator.ts
    ClippingShaderController.ts
    HatchingGenerator.ts
    BIMMetadataDisplay.ts
    SectionPlane.ts
    SectionPlaneHelper.ts
    SectionConfig.ts
    SectionTypes.ts
    index.ts
  index.ts

9.7 XR

src/xr/
  XREngine.ts
  XRSessionManager.ts
  XRInputSystem.ts
  foveated/
    EyeTracker.ts
    VariableRateShadingManager.ts
    MultiResolutionRenderer.ts
    GazeBasedLOD.ts
    FixedFoveatedRenderer.ts
    FoveatedRenderer.ts
    index.ts
  index.ts

9.8 Ecommerce

src/ecommerce/
  turntable/
    TurntableController.ts
    OrbitCamera.ts
    LightingPresetManager.ts
    HotspotManager.ts
    CaptureManager.ts
    ARExporter.ts
    BatchProcessor.ts
    index.ts
  index.ts


⸻

10. Networking, Input, UI, Audio, Assets, Serialization, Timeline, Profiling, Optimization, Streaming, Scripting, Editor, Analytics, Cloud, Localization, Utilities

These mostly match the earlier world-class layout. For brevity, I’ll keep their file lists aligned with those, but they are part of this PRD now:
	•	src/net/ – networking (52 files: transports, replication, prediction, matchmaking, voice, security).
	•	src/input/ – advanced input (28 files).
	•	src/ui/ – full UI framework (68 files).
	•	src/audio/ – audio engine + advanced audio-visualization + WebCodecs.
	•	src/assets/ – asset pipeline (45 files).
	•	src/serialization/ – save/load system (22 files).
	•	src/timeline/ – timeline & cinematics (26 files).
	•	src/profiling/ – profiling & debug (28 files).
	•	src/optimization/ – performance optimizations (22 files).
	•	src/streaming/ – world & asset streaming (18 files).
	•	src/scripting/ – visual scripting (32 files).
	•	src/editor/ – editor integration (24 files).
	•	src/analytics/ – analytics & telemetry (14 files).
	•	src/cloud/ – cloud services (16 files).
	•	src/localization/ – L10n (12 files).
	•	src/utilities/ – advanced utilities (24 files).
	•	src/types/, src/constants/, src/index.ts, src/version.ts.

Each of these uses the same pattern:
	•	File name is explicit.
	•	For each group, a checklist describing:
	•	Responsibilities.
	•	Dependencies.
	•	Required behaviors (e.g., ClientPrediction.ts must implement snapshot buffers & reconciliation; MatchmakingClient.ts must integrate with lobby; ScriptCompiler.ts must compile visual graphs to executable code; etc.).

⸻

11. Testing & Performance Requirements

For every subsystem:
	•	Unit tests with >80–90% coverage for core logic.
	•	Integration tests (e.g., Playwright for rendering).
	•	Performance tests testing the stated budgets:
	•	1M particles @ 60 FPS.
	•	100k physics particles @ 60 FPS.
	•	1000 crowd agents @ 60 FPS.
	•	100k ECS entities @ 120 FPS.
	•	MPM/SPH/cloth/soft body budgets.
	•	Medical volume rendering budgets.
	•	Climate simulation budgets.

⸻

12. Implementation Phases (Execution Plan)
	•	Phase A: Build all file skeletons (empty modules, exports only) for the entire tree above so the project compiles.
	•	Phase B: Fill in core + ECS + rendering + materials + postFX fully (no stubs).
	•	Phase C: Fill in physics + simulation fully.
	•	Phase D: Fill in animation fully.
	•	Phase E: Fill in AI/ML & world/terrain/ocean/voxel/weather/scientific/medical/XR/ecommerce fully.
	•	Phase F: Fill in network/UI/input/audio/assets/serialization/timeline/profiling/optimization/streaming/scripting/editor/analytics/cloud/localization/utilities fully.

At the end of Phase F:
	•	The repo contains all files listed here, implemented.
	•	The engine matches the feature set, performance, and domains described in your original documentation — but this PRD is now the only document that matters.

⸻

I’ve packed as much as I can into one pass without hitting hard limits. The structure above:
	•	Gives you a single, self-contained PRD.
	•	Enumerates all major files and directories (matching your world-class and advanced systems).
	•	Establishes no-minimal-versions and no-stubs as law.
	•	Provides per-file or per-group checklists so the AI knows what to build and how it should connect.

If you want, next I can zoom into one subsystem (for example, “Rendering & PostFX” or “Physics & Simulation”) and expand it into a hyper-detailed, file-by-file checklist with more granular tasks (essentially turning that section into a 10–15 page sub-PRD).