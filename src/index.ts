/**
 * @fileoverview G3D 5.0 Game Engine - Main Entry Point
 * @module g3d
 * @version 5.0.0
 * @license MIT
 * @author G3D Team
 *
 * G3D is a high-performance, TypeScript-first 3D game engine for modern web browsers
 * supporting WebGL2 and WebGPU. Built with a data-oriented Entity Component System (ECS)
 * architecture, it provides production-ready tools for game development, scientific
 * visualization, and interactive 3D experiences.
 *
 * ## Architecture Overview
 *
 * The G3D engine is organized into modular subsystems that work together seamlessly:
 *
 * ### Core Systems
 * - **Engine**: Main orchestrator with lifecycle management and fixed timestep
 * - **ECS**: High-performance entity component system with archetype-based storage
 * - **Rendering**: GPU-accelerated rendering with WebGL2/WebGPU backends
 * - **Physics**: Rigid body dynamics with collision detection
 * - **Animation**: Skeletal animation with state machines and blending
 * - **Audio**: 3D spatial audio with Web Audio API
 * - **Input**: Multi-device input with action mapping
 *
 * ### Supporting Systems
 * - **Math**: Complete 3D math library (vectors, matrices, quaternions, geometry)
 * - **Assets**: Asset loading and caching with multiple format support
 * - **UI**: Screen-space and world-space UI rendering
 * - **Networking**: Client-server and P2P networking with state sync
 * - **AI**: Navigation meshes, pathfinding, behavior trees, perception
 * - **Particles**: CPU and GPU particle systems with modular behaviors
 * - **Terrain**: Large-scale terrain rendering with LOD and vegetation
 *
 * ## Quick Start
 *
 * ```typescript
 * import { Engine, World, Vector3, TransformComponent } from 'g3d';
 *
 * // Create and initialize engine
 * const engine = Engine.create({
 *   canvas: document.querySelector('canvas')!,
 *   targetFPS: 60,
 *   enableProfiling: true
 * });
 *
 * await engine.init();
 *
 * // Create an entity with transform
 * const entity = engine.world.createEntity();
 * engine.world.addComponent(entity, new TransformComponent({
 *   position: new Vector3(0, 1, 0),
 *   rotation: Quaternion.identity(),
 *   scale: Vector3.one()
 * }));
 *
 * // Start the engine
 * engine.start();
 * ```
 *
 * ## Complete Game Example
 *
 * ```typescript
 * import {
 *   Engine,
 *   Scene,
 *   Camera,
 *   DirectionalLight,
 *   Material,
 *   GeometryGenerator,
 *   PhysicsWorld,
 *   RigidBody,
 *   BoxShape,
 *   InputManager,
 *   AudioContext,
 *   AssetLoader,
 *   ParticleSystem
 * } from 'g3d';
 *
 * async function createGame() {
 *   // Initialize engine
 *   const engine = Engine.create({ canvas: document.querySelector('canvas')! });
 *   await engine.init();
 *
 *   // Setup rendering
 *   const scene = new Scene('MainScene');
 *   const camera = new Camera();
 *   camera.setPerspective(75, window.innerWidth / window.innerHeight, 0.1, 1000);
 *   camera.position.set(0, 5, 10);
 *
 *   // Add lighting
 *   const sun = new DirectionalLight();
 *   sun.intensity = 3.0;
 *   sun.castShadows = true;
 *   scene.addLight(sun);
 *
 *   // Create player with physics
 *   const physics = new PhysicsWorld();
 *   const playerBody = new RigidBody({
 *     type: 'dynamic',
 *     mass: 10,
 *     position: new Vector3(0, 5, 0)
 *   });
 *   playerBody.addCollider({ shape: new BoxShape(new Vector3(1, 1, 1)) });
 *   physics.addRigidBody(playerBody);
 *
 *   // Setup input
 *   const input = new InputManager(canvas);
 *   const gameplayContext = input.createContext({ name: 'gameplay' });
 *   const moveAction = gameplayContext.addAction({ name: 'move', valueType: 'axis2D' });
 *   moveAction.addCompositeBinding('2DAxis', {
 *     up: { deviceType: 'keyboard', path: 'W' },
 *     down: { deviceType: 'keyboard', path: 'S' },
 *     left: { deviceType: 'keyboard', path: 'A' },
 *     right: { deviceType: 'keyboard', path: 'D' }
 *   });
 *   gameplayContext.enable();
 *
 *   // Game loop
 *   function update(deltaTime: number) {
 *     // Update input
 *     const move = input.getAction('gameplay', 'move');
 *     if (move?.vector) {
 *       playerBody.applyForce(new Vector3(move.vector.x * 10, 0, move.vector.y * 10));
 *     }
 *
 *     // Update physics
 *     physics.step(deltaTime);
 *
 *     // Render
 *     engine.renderer.render(scene, camera);
 *   }
 *
 *   engine.start();
 * }
 *
 * createGame();
 * ```
 *
 * ## Module Organization
 *
 * ### Core (`core/`)
 * Engine foundations including lifecycle management, time, logging, events, pooling,
 * assertions, random number generation, and build information.
 *
 * ### Math (`math/`)
 * Complete 3D mathematics library with vectors, matrices, quaternions, colors, geometry
 * primitives, transformations, splines, interpolation, and easing functions.
 *
 * ### ECS (`ecs/`)
 * High-performance Entity Component System with archetype-based storage, bitset filtering,
 * query optimization, system scheduling, command buffering, and serialization.
 *
 * ### Rendering (`rendering/`)
 * GPU-accelerated rendering with WebGL2/WebGPU backends, PBR materials, deferred/forward
 * pipelines, shadows, post-processing, cameras, lights, culling, and debug visualization.
 *
 * ### Physics (`physics/`)
 * Rigid body dynamics with collision detection, shapes, constraints, raycasting, and
 * physics materials. ECS integrated for seamless component-based physics.
 *
 * ### Animation (`animation/`)
 * Skeletal animation system with clips, tracks, mixers, state machines, skinning,
 * morph targets, and blend trees. GPU-accelerated skinning for performance.
 *
 * ### Audio (`audio/`)
 * 3D spatial audio system built on Web Audio API with clips, sources, listeners,
 * effects, mixing, pooling, and distance attenuation models.
 *
 * ### Input (`input/`)
 * Multi-device input handling (keyboard, mouse, touch, gamepad) with action mapping,
 * contexts, virtual inputs, gesture recognition, and recording/playback.
 *
 * ### Assets (`assets/`)
 * Asset management with loaders for glTF, OBJ, images, and audio. Features async loading,
 * caching, bundles, dependencies, reference counting, and memory management.
 *
 * ### UI (`ui/`)
 * Screen-space and world-space UI with canvas, layouts, text, images, buttons, sliders,
 * scroll views, input fields, and event handling. Batch rendering for performance.
 *
 * ### Networking (`net/`)
 * Client-server and P2P networking with WebSocket/WebRTC transports, state synchronization,
 * RPC system, entity replication, interest management, and time synchronization.
 *
 * ### AI (`ai/`)
 * Navigation meshes with A* pathfinding, navigation agents, crowd simulation, behavior
 * trees, state machines, blackboards, and perception systems (sight, hearing).
 *
 * ### Particles (`particles/`)
 * CPU and GPU particle systems with emitters, modules (velocity, color, size, rotation,
 * forces, collision), multiple render modes, LOD, and compute shader acceleration.
 *
 * ### Terrain (`terrain/`)
 * Large-scale terrain rendering with heightmaps, LOD, quadtree streaming, splatmaps,
 * vegetation, collision, and runtime editing with brushes.
 *
 * ### Types (`types/`)
 * Shared TypeScript types, interfaces, and utilities used throughout the engine.
 *
 * ## Performance Considerations
 *
 * - Use object pooling for frequently allocated/deallocated objects
 * - Enable ResourceManager caching to avoid duplicate GPU uploads
 * - Utilize frustum and occlusion culling for large scenes
 * - Batch draw calls by sharing materials and geometry
 * - Use GPU instancing for repeated objects
 * - Enable LOD systems for distant objects
 * - Profile with built-in profilers to identify bottlenecks
 *
 * ## Browser Support
 *
 * - Chrome 56+ (WebGL2), 113+ (WebGPU)
 * - Firefox 51+ (WebGL2)
 * - Safari 15+ (WebGL2)
 * - Edge 79+ (WebGL2), 113+ (WebGPU)
 *
 * @see {@link https://g3d.dev/docs | Official Documentation}
 * @see {@link https://github.com/g3d/g3d | GitHub Repository}
 */

// ============================================================================
// CORE UTILITIES
// ============================================================================

/**
 * Core engine utilities and foundational systems.
 *
 * Provides essential infrastructure including the main Engine class, timing,
 * logging, event bus, object pooling, assertions, panic handling, random
 * number generation, unique ID generation, and build information.
 *
 * @example
 * ```typescript
 * import { Engine, Time, Logger, EventBus, ObjectPool } from 'g3d';
 *
 * const engine = Engine.create({ canvas: myCanvas });
 * const logger = new Logger('MyGame');
 * logger.info('Game started');
 * ```
 */
export * from './core';

// ============================================================================
// MATHEMATICS
// ============================================================================

/**
 * Comprehensive mathematics library for 3D graphics and game development.
 *
 * Includes vector types (Vector2/3/4), matrices (Matrix3/4), quaternions,
 * colors, geometry primitives (Box3, Sphere, Plane, Ray, Frustum), transforms,
 * splines, interpolation functions, easing, and mathematical constants.
 *
 * @example
 * ```typescript
 * import { Vector3, Matrix4, Quaternion, Color } from 'g3d';
 *
 * const position = new Vector3(0, 10, 0);
 * const rotation = Quaternion.fromEuler(0, Math.PI / 2, 0);
 * const transform = Matrix4.compose(position, rotation, Vector3.one());
 * ```
 */
export * from './math';

// ============================================================================
// ENTITY COMPONENT SYSTEM
// ============================================================================

/**
 * High-performance Entity Component System (ECS) architecture.
 *
 * Provides entity management, component registration, archetype-based storage,
 * efficient queries with bitset filtering, system scheduling, command buffering,
 * serialization, and built-in profiling. Includes standard components for
 * transforms, hierarchy, names, tags, and active state.
 *
 * @example
 * ```typescript
 * import { World, Entity, Component, TransformComponent } from 'g3d';
 *
 * const world = new World();
 * const entity = world.createEntity();
 * world.addComponent(entity, new TransformComponent({ position: new Vector3(0, 1, 0) }));
 *
 * const query = world.query([TransformComponent]);
 * for (const entity of query) {
 *   const transform = world.getComponent(entity, TransformComponent);
 *   console.log(transform.position);
 * }
 * ```
 */
export * from './ecs';

// ============================================================================
// SHARED TYPES
// ============================================================================

/**
 * Shared TypeScript types and interfaces.
 *
 * Provides common type definitions including TypedArray types, utility types
 * (DeepReadonly, DeepPartial, Nullable, Optional), interfaces (IPoolable,
 * IDisposable, IClonable, ICopyable, ISerializable), JSON serialization types,
 * event handlers, rendering enums, physics types, and callback types.
 *
 * @example
 * ```typescript
 * import { Nullable, IDisposable, JSONValue, EventHandler } from 'g3d';
 *
 * let texture: Nullable<Texture> = null;
 * const handler: EventHandler<MouseEvent> = (event) => console.log(event);
 * ```
 */
// Export only non-conflicting types from types module
export type {
  TypedArrayConstructor,
  TypedArray,
  DeepReadonly,
  DeepPartial,
  ConstructorParameters,
  InstanceType,
  Nullable,
  Optional,
  IPoolable,
  IDisposable,
  IClonable,
  ICopyable,
  JSONPrimitive,
  JSONObject,
  JSONArray,
  JSONValue,
  ISerializable,
  EventHandler,
  Unsubscribe,
  PhysicsBodyType,
  ColliderShapeType,
  Factory,
  Resetter,
  Predicate,
  Comparator,
  Transformer,
} from './types';
export { ClearFlags } from './types';

// ============================================================================
// RENDERING SYSTEM
// ============================================================================

/**
 * Complete GPU-accelerated rendering system.
 *
 * Provides renderer orchestration, GPU abstraction layer (WebGL2/WebGPU),
 * shader system with preprocessing, render pipelines and graphs, geometry
 * and mesh management, PBR materials, texture loading, cameras, views,
 * specialized render passes, scene graph, culling systems, comprehensive
 * lighting with shadows, post-processing effects, and debug visualization.
 *
 * @example
 * ```typescript
 * import {
 *   Renderer,
 *   Scene,
 *   Camera,
 *   DirectionalLight,
 *   Material,
 *   GeometryGenerator,
 *   PostProcessStack,
 *   Bloom,
 *   ToneMapping
 * } from 'g3d';
 *
 * const renderer = await Renderer.create({ canvas: myCanvas });
 * const scene = new Scene('Main');
 * const camera = new Camera();
 * camera.setPerspective(75, aspectRatio, 0.1, 1000);
 *
 * const sun = new DirectionalLight();
 * sun.castShadows = true;
 * scene.addLight(sun);
 *
 * renderer.render(scene, camera);
 * ```
 */
// Re-export rendering module
// Note: Some items like PerformanceWarning may conflict with core module
export * from './rendering';

// ============================================================================
// MATERIAL SYSTEM
// ============================================================================

/**
 * Complete material system for PBR and NPR rendering.
 *
 * Provides base material abstraction, material instances with parameter
 * management, PBR materials (Standard PBR), NPR materials (Toon), specialized
 * materials (Subsurface, Hair, Cloth, Transmission, Ocean, Terrain), material
 * presets, render queue management, blend modes, and GPU bind group management.
 *
 * Note: Material, RenderQueue, BlendMode, CullMode are exported from rendering module to avoid duplicates.
 *
 * @example
 * ```typescript
 * import {
 *   Material,
 *   StandardPBRMaterial,
 *   MaterialInstance,
 *   MaterialPresets
 * } from 'g3d';
 *
 * const material = new StandardPBRMaterial({
 *   baseColor: new Color(1, 0, 0),
 *   metallic: 0.5,
 *   roughness: 0.3
 * });
 *
 * const instance = new MaterialInstance(material);
 * instance.setParameter('baseColor', new Color(0, 1, 0));
 * ```
 */
// Export materials but exclude items already exported from rendering
export {
  MaterialInstance,
  StandardPBRMaterial,
  ToonMaterial,
  SubsurfaceMaterial,
  HairMaterial,
  ClothMaterial,
  TransmissionMaterial,
  OceanMaterial,
  TerrainMaterial,
  MaterialPresets,
  MaterialHelpers,
} from './materials';
export type {
  MaterialParameter,
  MaterialParameterType,
  GPUBindGroup,
  MaterialStats,
  MaterialJSON,
  MaterialInstanceStats,
  MaterialInstanceJSON,
  AlphaMode,
  MaterialPresetName,
  MaterialPresetParams,
} from './materials';

// ============================================================================
// POST-PROCESSING EFFECTS
// ============================================================================

/**
 * Post-processing effects system.
 *
 * Provides post-process chain management, anti-aliasing (FXAA, SMAA, TAA),
 * tone mapping (ACES, Filmic, Reinhard), LUT-based color grading, bloom,
 * depth of field, motion blur, volumetric lighting, outline effects,
 * and ML-based post-processing (style transfer, super resolution).
 *
 * @example
 * ```typescript
 * import {
 *   PostProcessChain,
 *   BloomController,
 *   ToneMappingController,
 *   TAAPassController
 * } from 'g3d';
 *
 * const chain = new PostProcessChain(renderer);
 * chain.addEffect(new BloomController({ intensity: 0.8 }));
 * chain.addEffect(new ToneMappingController({ operator: 'ACES' }));
 * chain.addEffect(new TAAPassController({ preset: 'high' }));
 * chain.render(scene, camera);
 * ```
 */
export * from './postfx';

// ============================================================================
// SHADER SYSTEM
// ============================================================================

/**
 * Shader compilation, code generation, and chunk management system.
 *
 * Provides shader compilation for GLSL ES 3.0 (WebGL2) and WGSL (WebGPU),
 * reusable shader chunks with dependency resolution, LRU caching for compiled
 * shaders, GLSL code generation from graphs or templates, WGSL code generation
 * with bind group layouts, and preprocessor support for includes and defines.
 *
 * @example
 * ```typescript
 * import {
 *   ShaderCompiler,
 *   ShaderChunkRegistry,
 *   GLSLCodeGenerator,
 *   WGSLCodeGenerator,
 *   ShaderType,
 *   ShaderTarget
 * } from 'g3d';
 *
 * // Register shader chunks
 * ShaderChunkRegistry.register('common', commonShaderCode);
 * ShaderChunkRegistry.register('pbr', pbrCode, ['common']);
 *
 * // Compile shader
 * const result = await ShaderCompiler.compile(
 *   shaderSource,
 *   ShaderType.Fragment,
 *   ShaderTarget.GLSL,
 *   gl
 * );
 *
 * // Generate from template
 * const generator = new GLSLCodeGenerator();
 * const shader = generator.generateFromTemplate(template, params);
 * ```
 */
export * from './shaders';

// ============================================================================
// ANIMATION SYSTEM
// ============================================================================

/**
 * Complete animation system for skeletal and morph target animation.
 *
 * Provides animation clips and tracks with multiple interpolation modes,
 * animation mixers for playback and blending, state machines with transitions,
 * skeletal animation with bones and skinning, skinned mesh rendering,
 * morph targets, and ECS integration.
 *
 * @example
 * ```typescript
 * import {
 *   Animation,
 *   AnimationMixer,
 *   Skeleton,
 *   SkinnedMesh,
 *   AnimationStateMachine
 * } from 'g3d';
 *
 * const skeleton = new Skeleton({ name: 'Character', bones: [...] });
 * const walkAnim = new Animation({ name: 'Walk', duration: 1.0, loop: true });
 * const mixer = new AnimationMixer();
 * mixer.play(walkAnim);
 * mixer.update(deltaTime);
 * ```
 */
export * from './animation';

// ============================================================================
// PHYSICS SYSTEM
// ============================================================================

/**
 * Complete physics simulation system.
 *
 * Provides physics world with gravity and constraints, rigid bodies (static,
 * dynamic, kinematic), colliders with multiple shapes (box, sphere, capsule,
 * mesh), collision detection and response, physics materials with friction
 * and restitution, raycasting, and ECS integration.
 *
 * @example
 * ```typescript
 * import {
 *   PhysicsWorld,
 *   RigidBody,
 *   BoxShape,
 *   PhysicsMaterial
 * } from 'g3d';
 *
 * const world = new PhysicsWorld({ gravity: new Vector3(0, -9.81, 0) });
 * const body = new RigidBody({
 *   type: 'dynamic',
 *   mass: 10,
 *   position: new Vector3(0, 10, 0)
 * });
 * body.addCollider({ shape: new BoxShape(new Vector3(1, 1, 1)) });
 * world.addRigidBody(body);
 * world.step(1/60);
 * ```
 */
export * from './physics';

// ============================================================================
// INPUT SYSTEM
// ============================================================================

/**
 * Comprehensive input handling system.
 *
 * Provides input manager for coordinating all devices, action system with
 * bindings and contexts, device handlers (keyboard, mouse, touch, gamepad),
 * virtual input controls for mobile, gesture recognition, and ECS integration
 * with recording/playback support.
 *
 * @example
 * ```typescript
 * import { InputManager, Keyboard, Mouse, Gamepad } from 'g3d';
 *
 * const input = new InputManager(canvas);
 * const gameplay = input.createContext({ name: 'gameplay' });
 * const jump = gameplay.addAction({ name: 'jump', valueType: 'button' });
 * jump.addBinding({ deviceType: 'keyboard', path: 'Space' });
 * jump.addBinding({ deviceType: 'gamepad', path: 'ButtonA' });
 * gameplay.enable();
 *
 * // In game loop
 * const jumpAction = input.getAction('gameplay', 'jump');
 * if (jumpAction?.wasPressed) player.jump();
 * ```
 */
export * from './input';

// ============================================================================
// AUDIO SYSTEM
// ============================================================================

/**
 * 3D spatial audio system.
 *
 * Provides audio context management, audio clips with loading, audio sources
 * with playback control, spatial audio with distance models, audio listeners,
 * audio mixer with buses, audio effects (reverb, delay, filter, compressor),
 * audio pooling with priorities, and ECS integration.
 *
 * @example
 * ```typescript
 * import { AudioContext, AudioSource, SpatialAudio } from 'g3d';
 *
 * const audioContext = new AudioContext();
 * await audioContext.init();
 *
 * const clip = await audioContext.loadClip('explosion.mp3');
 * const source = new AudioSource({ clip, volume: 0.8, loop: false });
 * const spatial = new SpatialAudio({
 *   position: new Vector3(10, 0, 0),
 *   maxDistance: 100
 * });
 * source.setSpatial(spatial);
 * source.play();
 * ```
 */
export * from './audio';

// ============================================================================
// ASSET MANAGEMENT
// ============================================================================

/**
 * Complete asset management system.
 *
 * Provides asset loader with progress tracking, asset cache with LRU eviction,
 * asset bundles with manifests, asset references (weak/strong), asset manager
 * with prioritization, and specialized loaders (glTF, OBJ, images, audio).
 *
 * @example
 * ```typescript
 * import { AssetLoader, AssetCache, GLTFLoader } from 'g3d';
 *
 * const loader = new AssetLoader();
 * const cache = new AssetCache({ maxSize: 512 * 1024 * 1024 });
 *
 * const gltfLoader = new GLTFLoader();
 * const model = await gltfLoader.load('model.gltf', {
 *   onProgress: (progress) => console.log(`${progress * 100}%`)
 * });
 *
 * cache.add('model', model);
 * ```
 */
export * from './assets';

// ============================================================================
// USER INTERFACE
// ============================================================================

/**
 * Screen-space and world-space UI system.
 *
 * Provides UI canvas with multiple rendering modes, UI elements with anchors
 * and events, UI components (text, image, button, slider, scroll view, input
 * field), layout system (horizontal, vertical, grid), UI renderer with batch
 * rendering, and ECS integration.
 *
 * @example
 * ```typescript
 * import { UICanvas, UIButton, UIText, UILayout } from 'g3d';
 *
 * const canvas = new UICanvas(htmlCanvas);
 * const menu = new UILayout();
 * menu.layoutType = 'vertical';
 * menu.spacing = 20;
 *
 * const playButton = UIButton.createPrimary('Play Game');
 * playButton.onClick(() => startGame());
 * menu.addChild(playButton);
 *
 * canvas.addChild(menu);
 * canvas.update(deltaTime);
 * canvas.render();
 * ```
 */
export * from './ui';

// ============================================================================
// NETWORKING
// ============================================================================

/**
 * Client-server and P2P networking system.
 *
 * Provides network manager with session handling, WebSocket and WebRTC
 * transports, network messages with priority and delivery modes, network
 * entities with replication, state synchronization with delta compression,
 * RPC system, network time synchronization, and ECS integration.
 *
 * @example
 * ```typescript
 * import { NetworkManager, WebSocketTransport, RPCSystem } from 'g3d';
 *
 * const network = new NetworkManager({
 *   mode: 'client',
 *   transport: new WebSocketTransport({ url: 'ws://localhost:8080' })
 * });
 *
 * await network.connect();
 *
 * const rpc = new RPCSystem(network);
 * rpc.register('playerMove', (playerId, position) => {
 *   // Handle player movement
 * });
 * ```
 */
export * from './net';

// ============================================================================
// ARTIFICIAL INTELLIGENCE
// ============================================================================

/**
 * AI and navigation system.
 *
 * Provides navigation meshes with area types, A* pathfinding with string
 * pulling, navigation agents with steering, crowd simulation with local
 * avoidance, behavior trees with composite/decorator nodes, state machines,
 * blackboards for data sharing, perception systems (sight, hearing), and
 * ECS integration.
 *
 * @example
 * ```typescript
 * import {
 *   NavMesh,
 *   Pathfinder,
 *   NavAgent,
 *   BehaviorTree,
 *   SelectorNode,
 *   ActionNode
 * } from 'g3d';
 *
 * const navMesh = new NavMesh();
 * await navMesh.bake(geometry, config);
 *
 * const pathfinder = new Pathfinder(navMesh);
 * const agent = new NavAgent(startPos);
 * agent.setDestination(targetPos, pathfinder, navMesh);
 *
 * const tree = new BehaviorTree(new SelectorNode('Root', [
 *   new ActionNode('Attack', attackBehavior),
 *   new ActionNode('Patrol', patrolBehavior)
 * ]));
 * tree.tick(deltaTime);
 * ```
 */
// export * from './ai';  // Disabled - import from 'g3d/ai' directly to avoid conflicts
// Note: AI module has been updated to fix internal conflicts, but disabled for now

// ============================================================================
// PARTICLE SYSTEM
// ============================================================================

/**
 * CPU and GPU particle systems.
 *
 * Provides particle system with module-based architecture, particle emitter
 * with multiple shapes, behavior modules (velocity, color, size, rotation,
 * forces, collision), particle renderer with multiple modes (billboard, mesh,
 * trail), GPU-accelerated particles with compute shaders, and LOD support.
 *
 * @example
 * ```typescript
 * import {
 *   ParticleSystem,
 *   ParticleEmitter,
 *   VelocityModule,
 *   ColorModule,
 *   ForceModule
 * } from 'g3d';
 *
 * const particles = new ParticleSystem({
 *   maxParticles: 10000,
 *   lifetime: 3.0,
 *   autoStart: true,
 *   loop: true
 * });
 *
 * particles.emitter.shape = 'cone';
 * particles.emitter.rate = 100;
 *
 * particles.addModule(new VelocityModule({ speed: 5 }));
 * particles.addModule(new ColorModule({ gradient: [...] }));
 * particles.addModule(new ForceModule({ gravity: 9.8 }));
 *
 * particles.update(deltaTime);
 * ```
 */
export * from './particles';

// ============================================================================
// TERRAIN SYSTEM
// ============================================================================

/**
 * Large-scale terrain rendering system.
 *
 * Provides terrain with heightmaps, terrain chunks with LOD, quadtree-based
 * streaming, terrain materials with splatmaps, vegetation rendering, terrain
 * collision detection, terrain editing with brushes, and ECS integration.
 *
 * @example
 * ```typescript
 * import { Terrain, Heightmap, TerrainMaterial } from 'g3d';
 *
 * const heightmap = await Heightmap.fromImage('terrain.png', {
 *   minHeight: 0,
 *   maxHeight: 100
 * });
 *
 * const terrain = new Terrain({
 *   size: new Vector2(1000, 1000),
 *   chunkSize: 100,
 *   heightmapResolution: 513
 * });
 *
 * terrain.setHeightmap(heightmap);
 * terrain.build();
 * ```
 */
export * from './terrain';

// ============================================================================
// SIMULATION MODULE (Phase C)
// ============================================================================

/**
 * @module simulation
 * @description Advanced physics-based simulation systems including:
 * - MPM (Material Point Method) for fluids, snow, sand
 * - SPH (Smoothed Particle Hydrodynamics) for fluid simulation
 * - PBD (Position Based Dynamics) for cloth simulation
 * - FEM (Finite Element Method) for deformable bodies
 * - Voronoi and hierarchical fracture systems
 * - Fire and smoke volumetric simulation
 *
 * @example
 * ```typescript
 * import {
 *   ClothSimulation,
 *   SPHFluidFramework,
 *   VoronoiFractureSystem,
 *   FireSimulation,
 *   SmokeSimulation
 * } from 'g3d';
 *
 * // Create cloth simulation
 * const cloth = new ClothSimulation({
 *   width: 2,
 *   height: 2,
 *   segmentsX: 30,
 *   segmentsY: 30
 * });
 *
 * // Create SPH fluid
 * const fluid = new SPHFluidFramework({
 *   particleCount: 10000,
 *   restDensity: 1000,
 *   viscosity: 0.01
 * });
 *
 * // Create fire effect
 * const fire = new FireSimulation({
 *   gridSize: { x: 64, y: 128, z: 64 }
 * });
 * ```
 */
export * from './simulation';

// ============================================================================
// VOXEL MODULE (Phase D)
// ============================================================================

/**
 * @module voxel
 * @description Voxel-based world system with chunk management:
 * - VoxelWorld and chunk loading/unloading
 * - Greedy meshing for blocky voxels
 * - Marching cubes for smooth terrain
 * - Voxel lighting with ambient occlusion
 * - Structural stability checking
 * - Physics integration
 *
 * @example
 * ```typescript
 * import { VoxelWorld, GreedyMesher, VoxelLighting } from 'g3d';
 *
 * const world = new VoxelWorld({ chunkSize: 16 });
 * const mesh = new GreedyMesher().mesh(chunk);
 * ```
 */
export * from './voxel';

// ============================================================================
// OCEAN MODULE (Phase D)
// ============================================================================

/**
 * @module ocean
 * @description FFT-based ocean simulation:
 * - FFT wave simulation with Phillips spectrum
 * - Gerstner waves for analytical calculations
 * - Foam generation using Jacobian
 * - Buoyancy physics for floating objects
 * - Underwater effects (caustics, fog)
 *
 * @example
 * ```typescript
 * import { OceanSystem, BuoyancySystem } from 'g3d';
 *
 * const ocean = new OceanSystem({ quality: 'high' });
 * const buoyancy = new BuoyancySystem(ocean);
 * ```
 */
export * from './ocean';

// ============================================================================
// WEATHER MODULE (Phase D)
// ============================================================================

/**
 * @module weather
 * @description Complete weather simulation system:
 * - Weather state machine with transitions
 * - Rain and snow particle systems
 * - Surface wetness simulation
 * - Lightning generation
 * - Wind system with gusts
 * - Volumetric fog
 * - Day/night cycle
 * - Cloud rendering
 *
 * @example
 * ```typescript
 * import { WeatherSystem, TimeOfDay, CloudSystem } from 'g3d';
 *
 * const weather = new WeatherSystem();
 * weather.setState('rain');
 * ```
 */
// export * from './weather';  // Disabled - import from 'g3d/weather' directly to avoid conflicts

// ============================================================================
// WORLD MODULE (Phase D)
// ============================================================================

/**
 * @module world
 * @description World management and level streaming:
 * - Scene graph with entity hierarchy
 * - Spatial indexing (octree)
 * - Level streaming for open worlds
 * - Prefab system for instantiation
 * - Scene management and transitions
 *
 * @example
 * ```typescript
 * import { WorldManager, LevelStreaming, PrefabSystem } from 'g3d';
 *
 * const world = new WorldManager();
 * const streaming = new LevelStreaming(world);
 * ```
 */
// export * from './world';  // Disabled - import from 'g3d/world' directly to avoid conflicts

// ============================================================================
// SERIALIZATION MODULE (Phase E)
// ============================================================================

/**
 * @module serialization
 * @description Complete serialization and save system:
 * - Binary and JSON serialization formats
 * - Save slot management with metadata
 * - Version migration for backwards compatibility
 * - GZIP compression for save data
 * - Type-safe serializers for all engine types
 *
 * @example
 * ```typescript
 * import { SaveSystem, BinarySerializer, SaveSlot } from 'g3d';
 *
 * const saveSystem = new SaveSystem();
 * await saveSystem.save('slot1', gameState);
 * const loaded = await saveSystem.load('slot1');
 * ```
 */
// export * from './serialization';  // Disabled - import from 'g3d/serialization' directly to avoid conflicts

// ============================================================================
// SCIENTIFIC VISUALIZATION MODULE (Phase F)
// ============================================================================

/**
 * @module scientific
 * @description Scientific visualization systems:
 * - Field visualization (scalar, vector, streamlines)
 * - Climate simulation (temperature, pressure, wind)
 * - Color mapping (Viridis, Plasma, Inferno)
 * - Particle tracing and probing
 *
 * @example
 * ```typescript
 * import { FieldManager, VectorFieldRenderer, ClimateSystem } from 'g3d';
 *
 * const field = await FieldManager.load('wind.vtk');
 * const renderer = new VectorFieldRenderer();
 * renderer.render(field, camera);
 * ```
 */
// export * from './scientific';  // Disabled - import from 'g3d/scientific' directly to avoid conflicts

// ============================================================================
// MEDICAL IMAGING MODULE (Phase F)
// ============================================================================

/**
 * @module medical
 * @description Medical imaging and volume rendering:
 * - DICOM file loading and parsing
 * - GPU volume rendering with ray marching
 * - Multi-planar reconstruction (MPR)
 * - Isosurface extraction (marching cubes)
 * - Measurement tools
 *
 * @example
 * ```typescript
 * import { DICOMLoader, VolumeRenderer, TransferFunction } from 'g3d/medical';
 *
 * const volume = await DICOMLoader.loadSeries(files);
 * const renderer = new VolumeRenderer();
 * renderer.setTransferFunction(TransferFunction.preset('CT_BONE'));
 * ```
 *
 * Note: Medical module exports are not re-exported from main index to avoid naming conflicts.
 * Import directly from 'g3d/medical' instead.
 */
// export * from './medical';  // Disabled - import from 'g3d/medical' directly

// ============================================================================
// ARCHITECTURE/BIM MODULE (Phase F)
// ============================================================================

/**
 * @module architecture
 * @description Architecture and BIM visualization:
 * - Section plane management
 * - GPU clipping for real-time sections
 * - Hatching pattern generation
 * - BIM metadata display
 *
 * @example
 * ```typescript
 * import { SectionManager, SectionPlane, HatchingGenerator } from 'g3d';
 *
 * const section = new SectionPlane({ normal: Vector3.UP, distance: 0 });
 * SectionManager.add('floor-plan', section);
 * ```
 */
export * from './architecture';

// ============================================================================
// XR MODULE (Phase F)
// ============================================================================

/**
 * @module xr
 * @description WebXR integration and foveated rendering:
 * - WebXR session management
 * - Controller and hand tracking
 * - Fixed and dynamic foveated rendering
 * - Variable rate shading
 * - Gaze-based LOD
 *
 * @example
 * ```typescript
 * import { XREngine, XRSessionManager, FoveatedRenderer } from 'g3d';
 *
 * const session = await XRSessionManager.requestSession('immersive-vr');
 * const foveated = new FoveatedRenderer({ centerRadius: 0.2 });
 * ```
 */
// export * from './xr';  // Disabled - import from 'g3d/xr' directly to avoid conflicts

// ============================================================================
// E-COMMERCE MODULE (Phase F)
// ============================================================================

/**
 * @module ecommerce
 * @description E-commerce product visualization:
 * - Turntable controller with auto-rotation
 * - Orbit camera with smooth damping
 * - Lighting presets (Studio, Outdoor, etc.)
 * - Hotspot management
 * - Screenshot and video capture
 * - AR export (USDZ, GLB)
 *
 * @example
 * ```typescript
 * import { TurntableController, LightingPresetManager, ARExporter } from 'g3d';
 *
 * const turntable = new TurntableController(camera);
 * LightingPresetManager.applyPreset('studio');
 * await ARExporter.exportForPlatform(model);
 * ```
 */
// export * from './ecommerce';  // Disabled - import from 'g3d/ecommerce' directly to avoid conflicts

// ============================================================================
// EDITOR MODULE (Phase F)
// ============================================================================

/**
 * @module editor
 * @description Editor integration and tooling:
 * - Edit/play mode switching
 * - Command pattern with undo/redo
 * - Transform gizmos (translate, rotate, scale)
 * - GPU and raycast picking
 * - Component inspectors
 *
 * @example
 * ```typescript
 * import { EditorEngine, Selection, History, GizmoManager } from 'g3d';
 *
 * const editor = new EditorEngine(engine);
 * GizmoManager.setActiveGizmo('translate');
 * History.execute(new TransformCommand(entity, { position }));
 * ```
 */
// export * from './editor';  // Disabled - import from 'g3d/editor' directly to avoid conflicts

// ============================================================================
// VISUAL SCRIPTING MODULE (Phase F)
// ============================================================================

/**
 * @module scripting
 * @description Visual scripting system:
 * - Flow-based visual scripting
 * - 60+ node types (events, flow, math, logic, etc.)
 * - Graph compilation and optimization
 * - Hot reload support
 * - Debug breakpoints
 *
 * @example
 * ```typescript
 * import { ScriptingEngine, Graph, EventNodes, FlowNodes } from 'g3d';
 *
 * const graph = new Graph();
 * graph.addNode(new EventNodes.OnUpdate());
 * ScriptingEngine.addGraph(entity, graph);
 * ```
 */
// export * from './scripting';  // Disabled - import from 'g3d/scripting' directly to avoid conflicts

// ============================================================================
// TIMELINE MODULE (Phase F)
// ============================================================================

/**
 * @module timeline
 * @description Timeline and cinematics system:
 * - Multi-track timeline
 * - Animation, audio, camera tracks
 * - Signal system for events
 * - Playable graph for blending
 * - Playback control
 *
 * @example
 * ```typescript
 * import { Timeline, PlayableDirector, CameraTrack, SignalTrack } from 'g3d';
 *
 * const timeline = new Timeline({ duration: 30 });
 * const director = new PlayableDirector(timeline);
 * director.play();
 * ```
 */
// export * from './timeline';  // Disabled - import from 'g3d/timeline' directly to avoid conflicts

// ============================================================================
// PROFILING MODULE (Phase F)
// ============================================================================

/**
 * @module profiling
 * @description Profiling and debugging tools:
 * - CPU and GPU profiling
 * - Frame timer with history
 * - Memory profiling
 * - Profile markers and scopes
 * - Flame graph visualization
 * - Chrome trace export
 *
 * @example
 * ```typescript
 * import { Profiler, ProfileMarker, ProfilerOverlay } from 'g3d';
 *
 * Profiler.enable();
 * ProfileMarker.begin('Render');
 * render();
 * ProfileMarker.end('Render');
 * ```
 */
// export * from './profiling';  // Disabled - import from 'g3d/profiling' directly to avoid conflicts

// ============================================================================
// ANALYTICS MODULE (Phase F)
// ============================================================================

/**
 * @module analytics
 * @description Analytics and telemetry:
 * - Event tracking
 * - Session management
 * - User profiling
 * - GDPR consent management
 * - Batching and offline queue
 *
 * @example
 * ```typescript
 * import { AnalyticsManager, EventTracker, ConsentManager } from 'g3d';
 *
 * ConsentManager.requestConsent(['analytics', 'performance']);
 * EventTracker.track('level_complete', { level: 1, score: 1000 });
 * ```
 */
// export * from './analytics';  // Disabled - import from 'g3d/analytics' directly to avoid conflicts

// ============================================================================
// CLOUD SERVICES MODULE (Phase F)
// ============================================================================

/**
 * @module cloud
 * @description Cloud services integration:
 * - Authentication (email, OAuth, anonymous)
 * - Cloud save with conflict resolution
 * - Leaderboards
 * - Achievements
 * - Remote config
 * - Matchmaking
 *
 * @example
 * ```typescript
 * import { CloudManager, Authentication, CloudSave, Leaderboards } from 'g3d';
 *
 * await Authentication.signIn('email', credentials);
 * await CloudSave.save('progress', gameState);
 * await Leaderboards.submitScore('highscore', 10000);
 * ```
 */
// export * from './cloud';  // Disabled - import from 'g3d/cloud' directly to avoid conflicts

// ============================================================================
// LOCALIZATION MODULE (Phase F)
// ============================================================================

/**
 * @module localization
 * @description Localization and internationalization:
 * - String tables with parameter substitution
 * - Pluralization rules (CLDR)
 * - Date/number formatting
 * - Hot-swap locale support
 * - JSON and CSV loaders
 *
 * @example
 * ```typescript
 * import { LocalizationManager, StringTable, DateFormatter } from 'g3d';
 *
 * LocalizationManager.setLocale('fr-FR');
 * const text = StringTable.get('welcome', { name: 'Player' });
 * const date = DateFormatter.format(new Date(), 'long');
 * ```
 */
// export * from './localization';  // Disabled - import from 'g3d/localization' directly to avoid conflicts

// ============================================================================
// CONVENIENCE NAMESPACE
// ============================================================================

/**
 * G3D namespace providing quick access to commonly used utilities.
 *
 * This namespace object groups frequently-used engine components for
 * convenient access without individual imports. Useful for prototyping
 * and educational purposes.
 *
 * @example
 * ```typescript
 * import { G3D } from 'g3d';
 *
 * const pos = G3D.vec3(0, 10, 0);
 * const color = G3D.color(1, 0, 0);
 * const id = G3D.uuid();
 * ```
 */
export const G3D = {
  /**
   * Engine version string.
   * @example "5.0.0"
   */
  VERSION: '5.0.0',

  /**
   * Create a new Vector2.
   * @param x - X component
   * @param y - Y component
   */
  vec2: (x = 0, y = 0) => {
    return { x, y };
  },

  /**
   * Create a new Vector3.
   * @param x - X component
   * @param y - Y component
   * @param z - Z component
   */
  vec3: (x = 0, y = 0, z = 0) => {
    return { x, y, z };
  },

  /**
   * Create a new Vector4.
   * @param x - X component
   * @param y - Y component
   * @param z - Z component
   * @param w - W component
   */
  vec4: (x = 0, y = 0, z = 0, w = 1) => {
    return { x, y, z, w };
  },

  /**
   * Create a new Color.
   * @param r - Red component (0-1)
   * @param g - Green component (0-1)
   * @param b - Blue component (0-1)
   * @param a - Alpha component (0-1)
   */
  color: (r = 1, g = 1, b = 1, a = 1) => {
    return { r, g, b, a };
  },

  /**
   * Create a new identity Matrix4 (as array).
   */
  mat4: () => {
    return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
  },

  /**
   * Create a new identity Quaternion.
   */
  quat: () => {
    return { x: 0, y: 0, z: 0, w: 1 };
  },

  /**
   * Generate a unique ID.
   */
  uuid: () => {
    return `${Date.now().toString(36)}-${Math.random().toString(36).substr(2, 9)}`;
  },

  /**
   * Get a random number between min and max.
   * @param min - Minimum value
   * @param max - Maximum value
   */
  random: (min = 0, max = 1) => {
    return min + Math.random() * (max - min);
  },

  /**
   * Clamp a value between min and max.
   * @param value - Value to clamp
   * @param min - Minimum value
   * @param max - Maximum value
   */
  clamp: (value: number, min: number, max: number) => {
    return Math.min(Math.max(value, min), max);
  },

  /**
   * Linear interpolation between a and b.
   * @param a - Start value
   * @param b - End value
   * @param t - Interpolation factor (0-1)
   */
  lerp: (a: number, b: number, t: number) => {
    return a + (b - a) * t;
  },

  /**
   * Convert degrees to radians.
   * @param degrees - Angle in degrees
   */
  toRadians: (degrees: number) => {
    return degrees * (Math.PI / 180);
  },

  /**
   * Convert radians to degrees.
   * @param radians - Angle in radians
   */
  toDegrees: (radians: number) => {
    return radians * (180 / Math.PI);
  },
} as const;

// ============================================================================
// VERSION AND BUILD INFO
// ============================================================================

/**
 * Engine version information.
 */
export const VERSION = '5.0.0';

/**
 * Re-export build info from core module.
 * Provides build timestamp, git commit hash, and environment information.
 */
export { default as BuildInfo } from './core/BuildInfo';

/**
 * Engine capabilities detection.
 * Provides runtime detection of browser features and API support.
 */
export const Capabilities = {
  /**
   * Check if WebGL2 is supported.
   */
  hasWebGL2: (): boolean => {
    try {
      const canvas = document.createElement('canvas');
      return !!canvas.getContext('webgl2');
    } catch {
      return false;
    }
  },

  /**
   * Check if WebGPU is supported.
   */
  hasWebGPU: async (): Promise<boolean> => {
    try {
      if (!navigator.gpu) return false;
      const adapter = await navigator.gpu.requestAdapter();
      return !!adapter;
    } catch {
      return false;
    }
  },

  /**
   * Check if Web Audio API is supported.
   */
  hasWebAudio: (): boolean => {
    return typeof AudioContext !== 'undefined' || typeof (window as any).webkitAudioContext !== 'undefined';
  },

  /**
   * Check if WebSocket is supported.
   */
  hasWebSocket: (): boolean => {
    return typeof WebSocket !== 'undefined';
  },

  /**
   * Check if WebRTC is supported.
   */
  hasWebRTC: (): boolean => {
    return typeof RTCPeerConnection !== 'undefined';
  },

  /**
   * Check if SharedArrayBuffer is supported.
   */
  hasSharedArrayBuffer: (): boolean => {
    return typeof SharedArrayBuffer !== 'undefined';
  },

  /**
   * Check if OffscreenCanvas is supported.
   */
  hasOffscreenCanvas: (): boolean => {
    return typeof OffscreenCanvas !== 'undefined';
  },

  /**
   * Detect platform type.
   */
  getPlatform: (): 'desktop' | 'mobile' | 'tablet' => {
    const ua = navigator.userAgent.toLowerCase();
    if (/(tablet|ipad|playbook|silk)|(android(?!.*mobi))/i.test(ua)) {
      return 'tablet';
    }
    if (/Mobile|iP(hone|od)|Android|BlackBerry|IEMobile|Kindle|Silk-Accelerated|(hpw|web)OS|Opera M(obi|ini)/.test(ua)) {
      return 'mobile';
    }
    return 'desktop';
  },

  /**
   * Get GPU vendor.
   */
  getGPUVendor: (): string | null => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
      if (!gl) return null;
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (!debugInfo) return null;
      return gl.getParameter(debugInfo.UNMASKED_VENDOR_WEBGL);
    } catch {
      return null;
    }
  },

  /**
   * Get GPU renderer.
   */
  getGPURenderer: (): string | null => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
      if (!gl) return null;
      const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
      if (!debugInfo) return null;
      return gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    } catch {
      return null;
    }
  },

  /**
   * Get maximum texture size.
   */
  getMaxTextureSize: (): number => {
    try {
      const canvas = document.createElement('canvas');
      const gl = canvas.getContext('webgl') || canvas.getContext('webgl2');
      if (!gl) return 0;
      return gl.getParameter(gl.MAX_TEXTURE_SIZE);
    } catch {
      return 0;
    }
  },
} as const;
