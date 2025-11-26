/**
 * @module Rendering
 * @packageDocumentation
 * @description
 * Complete GPU-accelerated rendering system for G3D 5.0 graphics engine.
 *
 * The G3D rendering module provides a comprehensive, production-ready graphics pipeline
 * with modern rendering features, flexible architecture, and excellent performance.
 * Built on WebGL2 and WebGPU backends, it supports both forward and deferred rendering,
 * physically-based materials, advanced lighting, post-processing, and debugging tools.
 *
 * ## Architecture Overview
 *
 * The rendering system is organized into several interconnected subsystems:
 *
 * ### Core Components
 * - **Renderer**: Main rendering orchestrator, manages render loop and pipeline
 * - **RenderSystem**: ECS integration for entity-component rendering
 * - **RenderSettings**: Quality presets, feature toggles, and runtime configuration
 * - **ResourceManager**: GPU resource lifecycle, caching, and memory management
 * - **RenderProfiler**: Performance monitoring, frame statistics, and bottleneck detection
 *
 * ### GPU Abstraction Layer
 * Hardware-agnostic interface supporting WebGL2 and WebGPU:
 * - **GPUDevice**: Device creation, capability detection, feature support
 * - **GPUBuffer**: Vertex, index, and uniform buffer management
 * - **GPUTexture**: 2D/3D/Cube textures with mipmapping and compression
 * - **GPUSampler**: Texture filtering and addressing modes
 * - **GPUPipeline**: Render pipeline state objects
 * - **GPUCommandEncoder**: Command buffer recording and submission
 *
 * ### Shader System
 * Complete shader authoring, compilation, and management:
 * - **Shader**: Compiled shader programs with introspection
 * - **ShaderLibrary**: Async loading, caching, and variant generation
 * - **ShaderPreprocessor**: #include directives, defines, conditionals
 * - **ShaderChunks**: Reusable GLSL/WGSL code snippets library
 * - **ShaderGenerator**: Programmatic shader generation from material templates
 * - **UniformBuffer**: std140/std430 layout with automatic packing
 *
 * ### Pipeline System
 * Flexible render graph with automatic resource tracking:
 * - **RenderGraph**: DAG-based render pass execution with auto-barriers
 * - **RenderPass**: Configurable render pass with attachment management
 * - **RenderTarget**: Framebuffer abstraction with multiple attachments
 * - **RenderPipeline**: PSO with shader, state, and vertex layout
 * - **RenderQueue**: Draw call sorting and batching
 * - **DrawCall**: Renderable instance with material and transform
 *
 * ### Geometry System
 * Efficient mesh representation and procedural generation:
 * - **Mesh**: GPU-ready geometry with submeshes, LODs, and skinning
 * - **VertexFormat**: Flexible vertex attribute layout system
 * - **VertexBuffer/IndexBuffer**: Typed array-backed buffer management
 * - **MeshBuilder**: Fluent API for programmatic mesh construction
 * - **GeometryGenerator**: Primitives (sphere, box, cylinder, etc.)
 * - **MeshOptimizer**: Vertex cache optimization and simplification
 *
 * ### Material System
 * PBR materials with shader-based customization:
 * - **Material**: PBR material with texture slots and parameters
 * - **ShaderMaterial**: Custom shaders with parameter binding
 * - **MaterialLibrary**: Material asset management and sharing
 *
 * ### Texture System
 * Comprehensive texture loading and management:
 * - **Texture**: 2D/3D/Cube texture with mipmaps
 * - **TextureLoader**: Async loading with format detection
 * - **RenderTexture**: Renderable texture targets
 * - **TextureAtlas**: Sprite sheet packing and UV mapping
 *
 * ### Camera System
 * Flexible camera projection and control:
 * - **Camera**: Perspective/orthographic projection with frustum
 * - **CameraController**: Orbit, first-person, and fly controls
 * - **CameraRig**: Multi-camera setups and smooth transitions
 *
 * ### View System
 * Per-view rendering configuration:
 * - **View**: Viewport configuration with scissor and clear
 * - **ViewUniforms**: Per-view uniform data (matrices, time, etc.)
 * - **VisibilitySet**: Culled objects visible from a view
 *
 * ### Render Passes
 * Specialized rendering passes for different techniques:
 * - **DepthPrePass**: Early-Z pass for improved fragment culling
 * - **GBufferPass**: Deferred rendering geometry buffer generation
 * - **ShadowPass**: Cascaded/omnidirectional shadow map rendering
 * - **LightingPass**: Deferred/forward lighting computation
 * - **ForwardPass**: Traditional forward rendering pass
 * - **SkyboxPass**: Skybox/procedural sky rendering
 *
 * ### Scene Graph
 * Hierarchical scene organization:
 * - **Scene**: Root scene container with environment settings
 * - **SceneNode**: Transform hierarchy with component attachment
 *
 * ### Culling System
 * Spatial acceleration and visibility determination:
 * - **FrustumCuller**: View frustum culling with bounding volumes
 * - **OcclusionCuller**: Hardware occlusion queries
 * - **BVH**: Bounding Volume Hierarchy for ray tracing
 * - **Octree**: Spatial partitioning for broad-phase culling
 *
 * ### Lighting System
 * Comprehensive lighting with shadows:
 * - **Light**: Base light class with shadow configuration
 * - **DirectionalLight**: Sun/moon lights with cascaded shadows
 * - **PointLight**: Omnidirectional lights with cube shadows
 * - **SpotLight**: Cone lights with projective textures
 * - **AreaLight**: Physically-based area lights (LTC)
 * - **LightProbe**: Image-based lighting with parallax correction
 * - **ShadowMapper**: Shadow map generation and filtering
 * - **LightManager**: Light culling, sorting, and GPU buffer management
 *
 * ### Post-Processing
 * Screen-space effects for image enhancement:
 * - **PostProcessStack**: Effect chaining with resource management
 * - **Bloom**: HDR bloom with threshold and lens effects
 * - **SSAO**: Screen-space ambient occlusion (HBAO+)
 * - **TAA**: Temporal anti-aliasing with jitter
 * - **ToneMapping**: HDR to LDR mapping (ACES, Reinhard, etc.)
 * - **DepthOfField**: Physically-based DoF with bokeh
 * - **MotionBlur**: Per-object motion blur
 * - **ColorGrading**: LUT-based color correction
 * - **FXAA**: Fast approximate anti-aliasing
 *
 * ### Debug Tools
 * Visual debugging and performance analysis:
 * - **DebugRenderer**: Wireframe, normals, tangents, bounds visualization
 * - **DebugOverlay**: On-screen stats, graphs, and diagnostics
 *
 * ## Quick Start Example
 *
 * ```typescript
 * import {
 *   Renderer,
 *   RenderSettings,
 *   QualityPreset,
 *   Scene,
 *   SceneNode,
 *   Camera,
 *   DirectionalLight,
 *   Material,
 *   Mesh,
 *   GeometryGenerator,
 *   PostProcessStack,
 *   Bloom,
 *   ToneMapping,
 *   ToneMappingOperator,
 *   FXAA
 * } from '@g3d/rendering';
 *
 * // Create renderer with high quality preset
 * const renderer = await Renderer.create({
 *   canvas: document.getElementById('canvas') as HTMLCanvasElement,
 *   quality: QualityPreset.High,
 *   enableProfiler: true
 * });
 *
 * // Configure rendering settings
 * renderer.settings.antiAliasing = AntiAliasingMode.TAA;
 * renderer.settings.shadowQuality = ShadowQuality.High;
 * renderer.settings.bloomQuality = BloomQuality.High;
 *
 * // Create scene
 * const scene = new Scene('MainScene');
 * scene.environment.ambientColor.set(0.2, 0.2, 0.3);
 * scene.environment.skyboxIntensity = 1.0;
 *
 * // Setup camera
 * const camera = new Camera();
 * camera.setPerspective(75, canvas.width / canvas.height, 0.1, 1000);
 * camera.position.set(0, 5, 10);
 * camera.lookAt(0, 0, 0);
 *
 * // Add directional light (sun)
 * const sun = new DirectionalLight();
 * sun.color.set(1.0, 0.95, 0.9);
 * sun.intensity = 3.0;
 * sun.direction.set(-1, -2, -1).normalize();
 * sun.castShadows = true;
 * sun.shadowCascades = 4;
 * scene.addLight(sun);
 *
 * // Create mesh with material
 * const sphereMesh = GeometryGenerator.sphere(1.0, 32, 16);
 * const material = new Material();
 * material.albedo.set(1, 0, 0);
 * material.metallic = 0.8;
 * material.roughness = 0.2;
 *
 * const sphereNode = new SceneNode('Sphere');
 * sphereNode.setMesh(sphereMesh);
 * sphereNode.setMaterial(material);
 * scene.root.addChild(sphereNode);
 *
 * // Setup post-processing
 * const postProcess = new PostProcessStack({
 *   width: canvas.width,
 *   height: canvas.height,
 *   hdr: true
 * });
 * postProcess.addEffect(new Bloom({ threshold: 1.0, intensity: 0.5 }));
 * postProcess.addEffect(new ToneMapping({ operator: ToneMappingOperator.ACES }));
 * postProcess.addEffect(new FXAA());
 * postProcess.initialize(renderer.device);
 *
 * // Render loop
 * let lastTime = 0;
 * function render(time: number) {
 *   const deltaTime = (time - lastTime) * 0.001;
 *   lastTime = time;
 *
 *   // Rotate sphere
 *   sphereNode.rotation.y += deltaTime;
 *   sphereNode.updateTransform();
 *
 *   // Render scene
 *   renderer.render(scene, camera);
 *
 *   // Get frame stats
 *   const stats = renderer.profiler.getFrameStats();
 *   console.log(`FPS: ${stats.fps}, Draw Calls: ${stats.drawCalls}`);
 *
 *   requestAnimationFrame(render);
 * }
 * requestAnimationFrame(render);
 * ```
 *
 * ## Deferred Rendering Example
 *
 * ```typescript
 * import {
 *   Renderer,
 *   RenderGraph,
 *   DepthPrePass,
 *   GBufferPass,
 *   LightingPass,
 *   ForwardPass,
 *   Scene,
 *   Camera
 * } from '@g3d/rendering';
 *
 * const renderer = await Renderer.create({ canvas });
 * const graph = new RenderGraph();
 *
 * // Build deferred pipeline
 * const depthPrePass = new DepthPrePass({
 *   width: canvas.width,
 *   height: canvas.height
 * });
 *
 * const gBufferPass = new GBufferPass({
 *   width: canvas.width,
 *   height: canvas.height,
 *   layout: GBufferLayout.Optimized // RGB: albedo+metallic, RGBA: normal+roughness
 * });
 *
 * const lightingPass = new LightingPass({
 *   maxLights: 256,
 *   enableShadows: true,
 *   enableIBL: true
 * });
 *
 * const forwardPass = new ForwardPass({
 *   transparentOnly: true
 * });
 *
 * // Connect passes
 * graph.addPass('depth', depthPrePass);
 * graph.addPass('gbuffer', gBufferPass, ['depth']);
 * graph.addPass('lighting', lightingPass, ['gbuffer']);
 * graph.addPass('forward', forwardPass, ['lighting', 'depth']);
 *
 * // Compile graph
 * graph.compile(renderer.device);
 *
 * // Render
 * function render() {
 *   graph.execute({
 *     scene,
 *     camera,
 *     deltaTime: 0.016
 *   });
 * }
 * ```
 *
 * ## Advanced Material Example
 *
 * ```typescript
 * import {
 *   ShaderMaterial,
 *   ShaderLibrary,
 *   ShaderGenerator,
 *   Texture,
 *   TextureLoader
 * } from '@g3d/rendering';
 *
 * // Load textures
 * const albedoMap = await TextureLoader.load('textures/albedo.png', { sRGB: true });
 * const normalMap = await TextureLoader.load('textures/normal.png');
 * const roughnessMap = await TextureLoader.load('textures/roughness.png');
 *
 * // Generate custom PBR shader
 * const generator = new ShaderGenerator();
 * const shaderSource = generator.generatePBR({
 *   albedoMap: true,
 *   normalMap: true,
 *   roughnessMap: true,
 *   metallicMap: false,
 *   aoMap: true,
 *   emissiveMap: false,
 *   numLights: 4,
 *   receiveShadows: true,
 *   skinning: false
 * });
 *
 * // Create shader material
 * const material = new ShaderMaterial({
 *   shader: shaderSource,
 *   uniforms: {
 *     albedoMap: { type: 'texture', value: albedoMap },
 *     normalMap: { type: 'texture', value: normalMap },
 *     roughnessMap: { type: 'texture', value: roughnessMap },
 *     albedoTint: { type: 'vec3', value: [1, 1, 1] },
 *     roughnessScale: { type: 'float', value: 1.0 },
 *     metallicValue: { type: 'float', value: 0.0 }
 *   },
 *   depthWrite: true,
 *   depthTest: true,
 *   cullMode: CullMode.Back
 * });
 * ```
 *
 * ## Performance Tips
 *
 * ### Draw Call Optimization
 * - Use instancing for repeated objects (same mesh/material)
 * - Batch static geometry with MeshBuilder
 * - Sort opaque objects front-to-back to leverage early-Z
 * - Sort transparent objects back-to-front for correct blending
 *
 * ### GPU Resource Management
 * - Enable ResourceManager caching to avoid duplicate uploads
 * - Use appropriate eviction policies (LRU for textures, LFU for geometry)
 * - Stream large resources asynchronously
 * - Share materials and textures between objects
 * - Use texture atlases for small textures
 *
 * ### Culling Optimization
 * - Use hierarchical frustum culling with BVH/Octree
 * - Enable occlusion culling for dense scenes
 * - Implement LOD system for distant objects
 * - Cull lights outside camera frustum
 *
 * ### Shader Optimization
 * - Minimize uniform buffer updates
 * - Use shader variants instead of conditionals
 * - Precompile shaders during loading screens
 * - Cache shader compilation results
 *
 * ### Post-Processing Optimization
 * - Disable unused effects
 * - Use lower quality for mobile/low-end devices
 * - Render effects at reduced resolution (e.g., bloom at half-res)
 * - Chain effects to minimize texture reads
 *
 * ### Profiling
 * - Enable RenderProfiler to identify bottlenecks
 * - Monitor GPU/CPU frame time ratio
 * - Watch for performance warnings
 * - Use DebugRenderer to visualize overdraw
 *
 * ## Threading Model
 *
 * The rendering system is designed to work with the main thread and supports
 * asynchronous resource loading:
 *
 * - **Main Thread**: Command recording, state management, render loop
 * - **Background Loading**: Texture/mesh loading via Workers (optional)
 * - **GPU Thread**: Command execution (driver-managed)
 *
 * ## Browser Support
 *
 * - **WebGL 2.0**: Chrome 56+, Firefox 51+, Safari 15+, Edge 79+
 * - **WebGPU**: Chrome 113+, Edge 113+ (experimental in Firefox/Safari)
 *
 * ## Memory Management
 *
 * All GPU resources implement the disposable pattern:
 *
 * ```typescript
 * // Always dispose when done
 * mesh.dispose();
 * texture.dispose();
 * material.dispose();
 * renderer.dispose();
 *
 * // ResourceManager handles automatic cleanup
 * renderer.resourceManager.setEvictionPolicy(EvictionPolicy.LRU);
 * renderer.resourceManager.setMaxMemory(512 * 1024 * 1024); // 512 MB
 * ```
 *
 * @author G3D Team
 * @version 5.0.0
 * @license MIT
 */

// ============================================================================
// Core Renderer
// ============================================================================

/**
 * Main rendering system components.
 *
 * The core renderer provides the primary interface for rendering 3D scenes.
 * It orchestrates the rendering pipeline, manages GPU resources, and provides
 * frame statistics and profiling.
 */
export { Renderer, RendererBackend, RenderMode } from './Renderer';
export type { RendererConfig, RendererStats } from './Renderer';
export { RenderSystem } from './RenderSystem';
export type { MeshComponent, CameraComponent, LightComponent } from './RenderSystem';
export {
  RenderSettings,
  QualityPreset,
  ShadowQuality,
  AntiAliasingMode,
  AOQuality,
  BloomQuality,
} from './RenderSettings';
export type {
  RenderSettingsConfig,
} from './RenderSettings';
export {
  ResourceManager,
  ResourceType,
  EvictionPolicy,
} from './ResourceManager';
export type {
  ResourceCacheStats,
  ResourceManagerConfig,
} from './ResourceManager';
export {
  RenderProfiler,
} from './RenderProfiler';
export type {
  ProfileSample,
  FrameStats,
  PerformanceWarning as RenderPerformanceWarning,  // Renamed to avoid conflict with core.PerformanceWarning
  ProfilerConfig,
} from './RenderProfiler';

// ============================================================================
// GPU Abstraction Layer
// ============================================================================

/**
 * Hardware abstraction layer for WebGL2 and WebGPU.
 *
 * Provides a unified interface for GPU operations, allowing the engine to
 * target multiple graphics APIs with the same high-level code. Automatically
 * detects available features and provides graceful fallbacks.
 */
export {
  GPUDevice,
  GPUBackendType,
  GPUFeature,
  ShaderStage,
  BufferUsage,
  TextureUsage,
  TextureDimension,
  TextureViewDimension,
  TextureFormat,
  LoadOp,
  StoreOp,
  IndexFormat,
  VertexFormat,
  PrimitiveTopology,
  CullMode,
  FrontFace,
  CompareFunction,
  BlendFactor,
  BlendOperation,
  ColorWriteMask,
  StencilOperation,
} from './gpu/GPUDevice';
export type {
  GPULimits,
  GPUCapabilities,
  ShaderModule,
  ShaderModuleDescriptor,
} from './gpu/GPUDevice';

export { WebGPUDevice, createWebGPUDevice } from './gpu/WebGPUBackend';
export { WebGL2Device, createWebGL2Device } from './gpu/WebGL2Backend';
export { GPUBuffer } from './gpu/GPUBuffer';
export type { GPUBufferDescriptor } from './gpu/GPUBuffer';
export { GPUTexture } from './gpu/GPUTexture';
export type { GPUTextureDescriptor, GPUTextureView } from './gpu/GPUTexture';
export { GPUPipeline } from './gpu/GPUPipeline';
export type { RenderPipelineDescriptor as GPURenderPipelineDescriptor, ComputePipelineDescriptor as GPUComputePipelineDescriptor } from './gpu/GPUPipeline';
export { GPUSampler } from './gpu/GPUSampler';
export type { GPUSamplerDescriptor } from './gpu/GPUSampler';
export { GPUCommandEncoder } from './gpu/GPUCommandEncoder';

// ============================================================================
// Shader System
// ============================================================================

/**
 * Comprehensive shader authoring, compilation, and management system.
 *
 * Provides tools for shader creation, preprocessing, variant generation,
 * and runtime management. Supports both GLSL (WebGL2) and WGSL (WebGPU)
 * with automatic translation where needed.
 */
export { Shader, ShaderType } from './shader/Shader';
export type { ShaderSource, ShaderOptions, ShaderError, UniformInfo, AttributeInfo, UniformValue } from './shader/Shader';
export { ShaderLibrary, initShaderLibrary, getShaderLibrary } from './shader/ShaderLibrary';
export type { ShaderLoadOptions, BuiltinShaderDescriptor } from './shader/ShaderLibrary';
export { ShaderChunks, ShaderLanguage } from './shader/ShaderChunks';
export type { IShaderChunk } from './shader/ShaderChunks';
export { ShaderPreprocessor, preprocessShader } from './shader/ShaderPreprocessor';
export type { DefinesMap, PreprocessorOptions, PreprocessorResult } from './shader/ShaderPreprocessor';
export { ShaderGenerator, ShaderNodeType } from './shader/ShaderGenerator';
export type { ShaderNode, ShaderNodeConnection, ShaderGraph, MaterialTemplate } from './shader/ShaderGenerator';
export { UniformBuffer, UniformType, UniformLayout } from './shader/UniformBuffer';
export type { UniformField, UniformBufferDescriptor } from './shader/UniformBuffer';

// ============================================================================
// Pipeline System
// ============================================================================

/**
 * Render pipeline management and render graph execution.
 *
 * The pipeline system provides a flexible, graph-based approach to defining
 * render passes, managing GPU state, and executing complex rendering pipelines.
 * Supports both deferred and forward rendering with automatic resource barriers.
 */
export {
  RenderTarget,
  TextureFormat as RTTextureFormat,
  LoadAction,
  StoreAction,
} from './pipeline/RenderTarget';
export type {
  RenderTargetDescriptor,
} from './pipeline/RenderTarget';

export {
  RenderPass,
} from './pipeline/RenderPass';
export type {
  RenderPassDescriptor,
  AttachmentReference,
  PassDependency,
} from './pipeline/RenderPass';

export {
  RenderPipeline,
} from './pipeline/RenderPipeline';

export {
  PipelineState,
} from './pipeline/PipelineState';
export type {
  BlendState,
} from './pipeline/PipelineState';

export {
  RenderQueue,
} from './pipeline/RenderQueue';

export {
  DrawCall,
} from './pipeline/DrawCall';

export {
  RenderGraph,
} from './pipeline/RenderGraph';
export type {
  RenderGraphOptions,
  RenderGraphStats,
} from './pipeline/RenderGraph';

// ============================================================================
// Geometry System
// ============================================================================

/**
 * Mesh representation, vertex formats, and procedural generation.
 *
 * Provides efficient storage and manipulation of 3D geometry, including
 * support for LODs, skinning, morph targets, and procedural generation.
 * Includes optimization tools for improved GPU performance.
 */
export { Mesh } from './geometry/Mesh';
export { VertexBuffer } from './geometry/VertexBuffer';
export { IndexBuffer } from './geometry/IndexBuffer';
export { VertexFormat as GeomVertexFormat } from './geometry/VertexFormat';
export type { VertexAttribute as GeomVertexAttribute } from './geometry/VertexFormat';
export { MeshBuilder } from './geometry/MeshBuilder';
export { MeshOptimizer } from './geometry/MeshOptimizer';
export { GeometryGenerator } from './geometry/GeometryGenerator';

// ============================================================================
// Material System
// ============================================================================

/**
 * Material definition and management.
 *
 * Materials define the visual appearance of surfaces, including albedo,
 * roughness, metallic properties, and textures. Supports both standard
 * PBR materials and custom shader materials.
 */
export { Material } from './material/Material';
export type { MaterialDescriptor } from './material/Material';
export { ShaderMaterial } from './material/ShaderMaterial';
export { MaterialLibrary } from './material/MaterialLibrary';

// ============================================================================
// Texture System
// ============================================================================

/**
 * Texture loading, management, and rendering.
 *
 * Handles 2D, 3D, and cube textures with support for mipmapping, compression,
 * and various pixel formats. Includes asynchronous loading and texture atlasing.
 */
export {
  Texture,
  TextureType,
  TextureWrap,
  TextureFilter,
} from './texture/Texture';
export type {
  TextureDescriptor,
} from './texture/Texture';

export { RenderTexture } from './texture/RenderTexture';
export type { RenderTextureDescriptor } from './texture/RenderTexture';
export { TextureLoader } from './texture/TextureLoader';
export type { TextureLoadOptions } from './texture/TextureLoader';
export { TextureAtlas } from './texture/TextureAtlas';

// ============================================================================
// Camera System
// ============================================================================

/**
 * Camera projection and control.
 *
 * Provides perspective and orthographic cameras with frustum culling,
 * interactive controllers, and multi-camera rigs for complex setups.
 */
export { Camera, ProjectionType } from './camera/Camera';
export type { ICameraController } from './camera/CameraController';
export { CameraRig } from './camera/CameraRig';

// ============================================================================
// View System
// ============================================================================

/**
 * Per-view rendering configuration.
 *
 * Views define viewport regions, clear operations, and per-view uniform data.
 * Multiple views can be rendered in a single frame for split-screen or
 * picture-in-picture effects.
 */
export { View } from './view/View';
export { ViewUniforms } from './view/ViewUniforms';
export type { ViewUniformData } from './view/ViewUniforms';
export { VisibilitySet } from './view/VisibilitySet';

// ============================================================================
// Render Passes
// ============================================================================

/**
 * Specialized rendering passes.
 *
 * Pre-built render passes for common rendering techniques including depth
 * pre-pass, deferred GBuffer generation, shadow mapping, lighting, and skybox.
 */
export { GBufferPass } from './passes/GBufferPass';
export type { GBufferLayout, GBufferPassConfig } from './passes/GBufferPass';
export { LightingPass } from './passes/LightingPass';
export type { LightingPassConfig } from './passes/LightingPass';
export { ShadowPass, ShadowMapType } from './passes/ShadowPass';
export type { ShadowPassConfig, ShadowMapDescriptor, CascadeConfig } from './passes/ShadowPass';
export { ForwardPass } from './passes/ForwardPass';
export type { ForwardPassConfig } from './passes/ForwardPass';
export { SkyboxPass, SkyboxType } from './passes/SkyboxPass';
export type { SkyboxPassConfig, AtmosphereParams } from './passes/SkyboxPass';
export { DepthPrePass } from './passes/DepthPrePass';
export type { DepthPrePassConfig } from './passes/DepthPrePass';

// ============================================================================
// Scene Graph
// ============================================================================

/**
 * Hierarchical scene organization.
 *
 * Scene graph provides transform hierarchy, component attachment, and
 * scene-wide settings like environment maps and ambient lighting.
 */
export { Scene } from './scene/Scene';
export type { SceneEnvironment, SerializedScene } from './scene/Scene';
export { SceneNode } from './scene/SceneNode';

// ============================================================================
// Culling System
// ============================================================================

/**
 * Visibility determination and spatial acceleration.
 *
 * Culling systems reduce rendering workload by determining which objects
 * are visible from the camera. Includes frustum culling, occlusion culling,
 * and spatial data structures like BVH and octrees.
 */
export { FrustumCuller, CullingResult } from './culling/FrustumCuller';
export { OcclusionCuller } from './culling/OcclusionCuller';
export { BVH } from './culling/BVH';
export { Octree } from './culling/Octree';

// ============================================================================
// Lighting System
// ============================================================================

/**
 * Comprehensive lighting with shadows.
 *
 * Supports multiple light types with physically-based attenuation, shadowing,
 * and image-based lighting. Light manager handles culling and GPU buffer
 * management for efficient rendering of many lights.
 */
export {
  Light,
  LightType,
  LightUnit,
  ShadowMode,
  ShadowQuality as LightShadowQuality,
  ShadowFilter,
} from './lighting/Light';
export type {
  CullingMask,
  ShadowConfig,
} from './lighting/Light';

export {
  DirectionalLight,
  CascadeSplitScheme,
} from './lighting/DirectionalLight';
export type {
  CascadeConfig as DirectionalCascadeConfig,
  AtmosphericScattering,
} from './lighting/DirectionalLight';

export { PointLight, AttenuationModel } from './lighting/PointLight';
export { SpotLight, AngularFalloffModel } from './lighting/SpotLight';
export type { ProjectiveTexture } from './lighting/SpotLight';
export { AreaLight, AreaLightShape, EmissionMode } from './lighting/AreaLight';
export type { LTCConfig, EmissionTexture } from './lighting/AreaLight';
export {
  LightProbe,
  ProbeType,
  ParallaxShape,
} from './lighting/LightProbe';
export type {
  SphericalHarmonics,
  ReflectionProbe,
  BlendConfig,
} from './lighting/LightProbe';

export { ShadowMapper } from './lighting/ShadowMapper';
export type { ShadowMapConfig, ShadowRenderData } from './lighting/ShadowMapper';
export {
  LightManager,
  CullingStrategy,
  SortMode as LightSortMode,
} from './lighting/LightManager';
export type {
  LightBudget,
  LightManagerConfig,
  VisibleLights,
  GPULightBuffer,
} from './lighting/LightManager';

// ============================================================================
// Post-Processing
// ============================================================================

/**
 * Screen-space image enhancement effects.
 *
 * Post-processing stack allows chaining multiple effects with automatic
 * resource management. Includes HDR bloom, ambient occlusion, temporal
 * anti-aliasing, tone mapping, depth of field, motion blur, and more.
 */
export {
  PostProcessEffect,
  EffectQuality,
} from './postprocess/PostProcessEffect';
export type {
  EffectParameters,
  UniformParameter,
  TextureSpec,
} from './postprocess/PostProcessEffect';

export { PostProcessStack } from './postprocess/PostProcessStack';
export type { PostProcessStackConfig } from './postprocess/PostProcessStack';
export { Bloom } from './postprocess/Bloom';
export type { BloomParameters } from './postprocess/Bloom';
export { SSAO } from './postprocess/SSAO';
export type { SSAOParameters } from './postprocess/SSAO';
export { TAA } from './postprocess/TAA';
export type { TAAParameters } from './postprocess/TAA';
export { ToneMapping, ToneMappingOperator } from './postprocess/ToneMapping';
export type { ToneMappingParameters } from './postprocess/ToneMapping';
export { DepthOfField, BokehShape } from './postprocess/DepthOfField';
export type { DepthOfFieldParameters } from './postprocess/DepthOfField';
export { MotionBlur } from './postprocess/MotionBlur';
export type { MotionBlurParameters } from './postprocess/MotionBlur';
export { ColorGrading } from './postprocess/ColorGrading';
export type { ColorGradingParameters } from './postprocess/ColorGrading';
export { FXAA, FXAAPreset } from './postprocess/FXAA';
export type { FXAAParameters } from './postprocess/FXAA';

// ============================================================================
// Debug Tools
// ============================================================================

/**
 * Visual debugging and diagnostics.
 *
 * Debug tools help visualize rendering data and diagnose performance issues.
 * Includes wireframe rendering, normal/tangent visualization, bounding volume
 * display, and on-screen performance overlay.
 */
export { DebugRenderer, DebugRenderMode } from './debug/DebugRenderer';
export type { DebugRendererConfig } from './debug/DebugRenderer';
export { DebugOverlay, OverlayPosition } from './debug/DebugOverlay';
export type { OverlayStyle, DebugOverlayConfig } from './debug/DebugOverlay';
