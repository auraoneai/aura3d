# G3D 5.0 PRD – Part 2: Rendering

**Parent Document:** `PRD-Final-00-Overview.md`

---

## 5. Rendering

---

## 5.1 `src/rendering/` – Renderer & RenderGraph

### Directory Structure

```
src/rendering/
├── Renderer.ts
├── RenderGraph.ts
├── RenderContext.ts
├── RenderDevice.ts
├── BackbufferManager.ts
├── FrameResources.ts
├── GBuffer.ts
├── ViewData.ts
├── DrawListBuilder.ts
├── DebugDraw.ts
├── backends/
│   ├── WebGLDevice.ts
│   └── WebGPUDevice.ts
├── passes/
│   ├── GeometryPass.ts
│   ├── ShadowMapPass.ts
│   ├── LightingPass.ts
│   ├── ForwardTransparentPass.ts
│   ├── SkyPass.ts
│   ├── OceanPass.ts
│   ├── TerrainPass.ts
│   ├── VoxelPass.ts
│   ├── ParticlePass.ts
│   ├── VolumetricLightingPass.ts
│   ├── SSAOPass.ts
│   ├── SSRPass.ts
│   ├── SSGIPass.ts
│   ├── BloomPass.ts
│   ├── DOFPass.ts
│   ├── MotionBlurPass.ts
│   ├── ChromaticAberrationPass.ts
│   ├── FilmGrainPass.ts
│   ├── ColorGradingPass.ts
│   ├── TAAPass.ts
│   ├── SMAAPass.ts
│   ├── FXAAPass.ts
│   ├── OutlinePass.ts
│   ├── MLPostProcessPass.ts
│   └── DebugOverlayPass.ts
├── culling/
│   ├── ViewFrustumCuller.ts
│   ├── GPUCulling.ts
│   └── HiZCulling.ts
├── debug/
│   ├── RenderDocIntegration.ts
│   └── RenderGraphVisualizer.ts
└── index.ts
```

---

### 5.1.1 `src/rendering/Renderer.ts`

**Role:** Public rendering API, orchestrates render graph execution.

**Public API:**
```typescript
class Renderer {
  // Initialization
  initialize(canvas: HTMLCanvasElement, config: RenderingConfig): Promise<void>;
  dispose(): void;

  // Frame lifecycle
  beginFrame(frameInfo: FrameInfo): void;
  render(scene: RenderScene): void;
  endFrame(): void;

  // Configuration
  resize(width: number, height: number): void;
  setQuality(preset: QualityPreset): void;
  getCapabilities(): RenderCapabilities;

  // State access
  get device(): RenderDevice;
  get renderGraph(): RenderGraph;
  get statistics(): RenderStatistics;

  // Debug
  enableDebugOverlay(enabled: boolean): void;
  captureFrame(): Promise<FrameCapture>;
}

interface RenderingConfig {
  preferredBackend: 'webgpu' | 'webgl2' | 'auto';
  antialias: 'none' | 'fxaa' | 'smaa' | 'taa' | 'msaa';
  hdr: boolean;
  shadowQuality: 'off' | 'low' | 'medium' | 'high' | 'ultra';
  ssao: boolean;
  ssr: boolean;
  ssgi: boolean;
  bloom: boolean;
  dof: boolean;
  motionBlur: boolean;
  volumetrics: boolean;
}

interface RenderStatistics {
  drawCalls: number;
  triangles: number;
  vertices: number;
  textureMemory: number;
  bufferMemory: number;
  shaderSwitches: number;
  passCount: number;
  gpuTime: number;
}
```

**Dependencies:**
- Depends on: `RenderGraph`, `RenderDevice`, `BackbufferManager`, `FrameResources`
- Depended by: `Engine`, `RenderSystem`

**Implementation Checklist:**
- [ ] Backend selection: WebGPU if available, WebGL2 fallback
- [ ] Canvas context creation with appropriate attributes
- [ ] `initialize()` creates device, render graph, and all passes
- [ ] `resize()` recreates all resolution-dependent resources
- [ ] `beginFrame()` acquires backbuffer and clears frame state
- [ ] `render()` executes render graph with scene data
- [ ] `endFrame()` presents to screen and collects statistics
- [ ] Quality presets map to pass enable/disable and settings
- [ ] HDR rendering with tone mapping
- [ ] Reverse-Z depth buffer for improved precision
- [ ] sRGB output with proper gamma
- [ ] Frame capture for debugging (screenshot, GPU capture)
- [ ] **Performance:** Frame setup overhead < 0.5ms
- [ ] **Tests:** Integration tests for initialization, resize, render

---

### 5.1.2 `src/rendering/RenderGraph.ts`

**Role:** DAG-based render pass orchestration with automatic resource management.

**Public API:**
```typescript
class RenderGraph {
  // Setup
  addPass(pass: RenderPass): void;
  removePass(passName: string): void;
  getPass<T extends RenderPass>(name: string): T | undefined;

  // Execution
  compile(): void;          // Build execution order
  execute(context: RenderContext): void;

  // Resources
  createTexture(desc: TextureDesc): TransientTexture;
  createBuffer(desc: BufferDesc): TransientBuffer;
  importTexture(texture: GPUTexture, desc: TextureDesc): ImportedTexture;

  // Debug
  getVisualization(): GraphVisualization;
}

interface RenderPass {
  readonly name: string;
  readonly enabled: boolean;

  setup(graph: RenderGraph): void;    // Declare resources
  execute(context: RenderContext): void;
}

interface TransientTexture {
  readonly handle: number;
  read(): TextureView;
  write(): TextureView;
}
```

**Dependencies:**
- Depends on: `RenderContext`, `RenderDevice`, all passes
- Depended by: `Renderer`

**Implementation Checklist:**
- [ ] Automatic resource allocation and aliasing
- [ ] Pass dependency tracking from resource reads/writes
- [ ] Topological sort for execution order
- [ ] Resource lifetime tracking for optimal reuse
- [ ] Barrier/transition insertion for GPU synchronization
- [ ] Dead pass elimination (output not used)
- [ ] Compile once, execute each frame (unless passes change)
- [ ] Standard film-quality pipeline order:
  1. Depth pre-pass (optional)
  2. Shadow maps (cascaded, point, spot)
  3. G-buffer / Geometry
  4. SSAO
  5. Lighting (deferred or clustered forward)
  6. SSGI
  7. SSR
  8. Volumetric lighting
  9. Sky / Environment
  10. Transparent objects
  11. Particles
  12. Post-processing chain
  13. UI overlay
  14. Debug overlays
- [ ] Pass hot-reload support for development
- [ ] **Performance:** Compile < 1ms, per-frame overhead < 0.1ms
- [ ] **Tests:** Graph compilation tests, resource aliasing tests

---

### 5.1.3 `src/rendering/RenderContext.ts`

**Role:** Per-frame rendering state and command recording.

**Public API:**
```typescript
class RenderContext {
  // Frame state
  readonly frameIndex: number;
  readonly deltaTime: number;
  readonly scene: RenderScene;
  readonly viewData: ViewData;

  // Resources
  readonly frameResources: FrameResources;
  readonly gbuffer: GBuffer;

  // Command recording
  beginRenderPass(desc: RenderPassDesc): RenderPassEncoder;
  beginComputePass(): ComputePassEncoder;

  // Utilities
  getTemporaryTexture(desc: TextureDesc): GPUTexture;
  releaseTemporaryTexture(texture: GPUTexture): void;

  // Statistics
  recordDrawCall(triangles: number): void;
}
```

**Dependencies:**
- Depends on: `RenderDevice`, `FrameResources`, `ViewData`, `GBuffer`
- Depended by: All render passes

**Implementation Checklist:**
- [ ] Encapsulates all per-frame state
- [ ] Temporary texture pool with frame-based lifetime
- [ ] Statistics collection without overhead
- [ ] View-specific data (matrices, frustum) readily accessible

---

### 5.1.4 `src/rendering/RenderDevice.ts`

**Role:** Abstract interface for GPU operations.

**Public API:**
```typescript
interface RenderDevice {
  readonly type: 'webgpu' | 'webgl2';
  readonly capabilities: DeviceCapabilities;

  // Resources
  createBuffer(desc: BufferDesc): GPUBuffer;
  createTexture(desc: TextureDesc): GPUTexture;
  createSampler(desc: SamplerDesc): GPUSampler;
  createShader(desc: ShaderDesc): GPUShader;
  createPipeline(desc: PipelineDesc): GPUPipeline;
  createBindGroup(desc: BindGroupDesc): GPUBindGroup;

  // Commands
  createCommandEncoder(): CommandEncoder;
  submit(commands: CommandBuffer[]): void;

  // Synchronization
  waitForGPU(): Promise<void>;

  // Cleanup
  destroy(resource: GPUResource): void;
  dispose(): void;
}

interface DeviceCapabilities {
  maxTextureSize: number;
  maxTextureLayers: number;
  maxColorAttachments: number;
  maxUniformBufferSize: number;
  maxStorageBufferSize: number;
  maxComputeWorkgroupSize: [number, number, number];
  supportsCompute: boolean;
  supportsTimestampQueries: boolean;
  supportsDepth32Float: boolean;
  supportsBC: boolean;
  supportsASTC: boolean;
}
```

**Dependencies:**
- Depends on: WebGPU or WebGL2 API
- Depended by: `Renderer`, all passes, material system

**Implementation Checklist:**
- [ ] Unified interface hiding WebGPU vs WebGL2 differences
- [ ] Resource handle management with reference counting
- [ ] Pipeline state caching
- [ ] Shader compilation with error reporting
- [ ] Bind group layout inference
- [ ] Automatic barrier insertion (WebGL2 simulation)
- [ ] GPU timing queries where supported
- [ ] Memory usage tracking

---

### 5.1.5 `src/rendering/backends/WebGPUDevice.ts`

**Role:** WebGPU implementation of RenderDevice.

**Public API:**
```typescript
class WebGPUDevice implements RenderDevice {
  static isSupported(): boolean;
  static create(canvas: HTMLCanvasElement): Promise<WebGPUDevice>;
}
```

**Dependencies:**
- Depends on: WebGPU API (`navigator.gpu`)
- Depended by: `Renderer`

**Implementation Checklist:**
- [ ] Implements all `RenderDevice` methods
- [ ] Feature detection and capability reporting
- [ ] Adapter and device creation with fallback options
- [ ] Preferred canvas format detection
- [ ] Command buffer batching for efficiency
- [ ] Pipeline layout sharing
- [ ] Bind group caching by hash
- [ ] Timestamp query support where available
- [ ] Lost device handling and recovery
- [ ] Debug labels on all resources
- [ ] **Tests:** Device creation, resource lifecycle, rendering

---

### 5.1.6 `src/rendering/backends/WebGLDevice.ts`

**Role:** WebGL2 implementation of RenderDevice.

**Public API:**
```typescript
class WebGLDevice implements RenderDevice {
  static isSupported(): boolean;
  static create(canvas: HTMLCanvasElement): Promise<WebGLDevice>;
}
```

**Dependencies:**
- Depends on: WebGL2 API
- Depended by: `Renderer`

**Implementation Checklist:**
- [ ] Implements all `RenderDevice` methods
- [ ] Extension detection (EXT_color_buffer_float, OES_texture_float_linear, etc.)
- [ ] VAO pooling and management
- [ ] Uniform buffer objects (UBOs) for constant data
- [ ] Texture unit management
- [ ] State diffing to minimize GL calls
- [ ] Simulated compute via transform feedback or texture ping-pong
- [ ] Framebuffer object caching
- [ ] Context loss handling
- [ ] WebGL debug extension integration
- [ ] **Performance:** State change overhead < 0.01ms
- [ ] **Tests:** All major features, fallback paths

---

### 5.1.7 `src/rendering/BackbufferManager.ts`

**Role:** Manages swap chain and presentation.

**Public API:**
```typescript
class BackbufferManager {
  initialize(device: RenderDevice, canvas: HTMLCanvasElement): void;
  resize(width: number, height: number): void;

  acquireBackbuffer(): GPUTexture;
  present(): void;

  get width(): number;
  get height(): number;
  get format(): TextureFormat;
}
```

**Dependencies:**
- Depends on: `RenderDevice`
- Depended by: `Renderer`

**Implementation Checklist:**
- [ ] Swap chain configuration (present mode, format)
- [ ] Resize handling with resource recreation
- [ ] Pixel ratio / device scale factor support
- [ ] V-sync control where possible
- [ ] Frame pacing hints

---

### 5.1.8 `src/rendering/FrameResources.ts`

**Role:** Per-frame transient GPU resources.

**Public API:**
```typescript
class FrameResources {
  beginFrame(): void;
  endFrame(): void;

  getUniformBuffer(size: number): GPUBuffer;
  getDynamicOffset(alignment: number, size: number): { buffer: GPUBuffer; offset: number };

  reset(): void;
}
```

**Dependencies:**
- Depends on: `RenderDevice`
- Depended by: `RenderContext`, passes

**Implementation Checklist:**
- [ ] Ring buffer for per-frame uniform data
- [ ] Double/triple buffering to avoid GPU stalls
- [ ] Alignment handling for uniform buffers
- [ ] Memory pooling with configurable size
- [ ] Overflow handling with warning

---

### 5.1.9 `src/rendering/GBuffer.ts`

**Role:** Geometry buffer for deferred rendering.

**Public API:**
```typescript
class GBuffer {
  initialize(device: RenderDevice, width: number, height: number): void;
  resize(width: number, height: number): void;
  dispose(): void;

  // Textures
  get albedo(): GPUTexture;       // RGB: albedo, A: metallic
  get normal(): GPUTexture;       // RG: encoded normal, BA: roughness/AO
  get depth(): GPUTexture;        // R32F or D32F
  get velocity(): GPUTexture;     // RG16F motion vectors
  get emissive(): GPUTexture;     // RGB: emissive

  // Bind group for lighting pass
  get bindGroup(): GPUBindGroup;
}
```

**Dependencies:**
- Depends on: `RenderDevice`
- Depended by: `GeometryPass`, `LightingPass`, `SSAOPass`, `SSRPass`

**Implementation Checklist:**
- [ ] High-precision formats for PBR: RGBA16F or RGBA32F where needed
- [ ] Octahedron-encoded normals for compact storage
- [ ] Motion vectors for TAA and motion blur
- [ ] Thin G-buffer option for bandwidth optimization
- [ ] Optional extra buffers (clear coat, SSS, etc.)
- [ ] Automatic format selection based on capabilities

---

### 5.1.10 `src/rendering/ViewData.ts`

**Role:** Per-view rendering data (camera, matrices, etc.).

**Public API:**
```typescript
interface ViewData {
  // Matrices
  viewMatrix: Matrix4;
  projectionMatrix: Matrix4;
  viewProjectionMatrix: Matrix4;
  inverseViewMatrix: Matrix4;
  inverseProjectionMatrix: Matrix4;
  inverseViewProjectionMatrix: Matrix4;

  // Previous frame (for motion)
  prevViewProjectionMatrix: Matrix4;

  // Camera
  cameraPosition: Vector3;
  cameraDirection: Vector3;
  near: number;
  far: number;
  fov: number;

  // Jitter (for TAA)
  jitterX: number;
  jitterY: number;

  // Frustum
  frustum: Frustum;

  // Viewport
  viewport: { x: number; y: number; width: number; height: number };
}
```

**Dependencies:**
- Depends on: `Matrix4`, `Vector3`, `Frustum`
- Depended by: All render passes

**Implementation Checklist:**
- [ ] All matrix combinations pre-computed
- [ ] Previous frame matrices for temporal effects
- [ ] TAA jitter applied to projection
- [ ] Frustum extracted from view-projection

---

### 5.1.11 `src/rendering/DrawListBuilder.ts`

**Role:** Builds sorted draw lists for efficient rendering.

**Public API:**
```typescript
class DrawListBuilder {
  clear(): void;

  addOpaque(mesh: MeshInstance, material: Material, transform: Matrix4): void;
  addTransparent(mesh: MeshInstance, material: Material, transform: Matrix4, distance: number): void;

  getOpaqueList(): DrawList;
  getTransparentList(): DrawList;

  sort(): void;
}

interface DrawList {
  readonly count: number;
  [Symbol.iterator](): Iterator<DrawCall>;
}

interface DrawCall {
  mesh: MeshInstance;
  material: Material;
  transform: Matrix4;
  sortKey: number;
}
```

**Dependencies:**
- Depends on: None (data structures only)
- Depended by: `RenderSystem`, `GeometryPass`

**Implementation Checklist:**
- [ ] Opaque: front-to-back for depth rejection efficiency
- [ ] Opaque: material sorting for state change reduction
- [ ] Transparent: back-to-front for correct blending
- [ ] Sort key encoding: layer | depth | material | mesh
- [ ] Radix sort for O(n) performance
- [ ] **Performance:** Sort 10k objects < 1ms

---

### 5.1.12 `src/rendering/DebugDraw.ts`

**Role:** Immediate-mode debug visualization.

**Public API:**
```typescript
class DebugDraw {
  static drawLine(start: Vector3, end: Vector3, color: Color): void;
  static drawBox(box: Box3, color: Color, wireframe?: boolean): void;
  static drawSphere(center: Vector3, radius: number, color: Color): void;
  static drawFrustum(frustum: Frustum, color: Color): void;
  static drawAxis(transform: Matrix4, size: number): void;
  static drawText(position: Vector3, text: string, color: Color): void;

  // Persistent (survives frame)
  static drawLinePersistent(start: Vector3, end: Vector3, color: Color, duration: number): void;

  // Internal
  static render(context: RenderContext): void;
  static clear(): void;
}
```

**Dependencies:**
- Depends on: `RenderDevice`, `RenderContext`
- Depended by: Editor, debugging systems

**Implementation Checklist:**
- [ ] Batches lines/shapes for single draw call
- [ ] Depth-tested and non-depth-tested modes
- [ ] Persistent debug draws with duration
- [ ] Billboard text rendering
- [ ] Configurable line width where supported
- [ ] Zero overhead when no debug draws active

---

## 5.2 Render Passes

### 5.2.0 Render Pass Group Checklist

**All files in `src/rendering/passes/` must implement:**

- [ ] Implements `RenderPass` interface
- [ ] Unique `name` property
- [ ] `enabled` property for runtime toggle
- [ ] `setup()` declares all input/output resources
- [ ] `execute()` performs actual rendering
- [ ] Zero allocations in `execute()` hot path
- [ ] Quality settings exposed (where applicable)
- [ ] Statistics reported (triangles, time, etc.)
- [ ] Works with both WebGPU and WebGL2 backends
- [ ] Graceful degradation when features unavailable
- [ ] Integration tests with reference images

---

### 5.2.1 `src/rendering/passes/GeometryPass.ts`

**Role:** Renders opaque geometry to G-buffer.

**Public API:**
```typescript
class GeometryPass implements RenderPass {
  readonly name = 'GeometryPass';
  enabled: boolean;

  setup(graph: RenderGraph): void;
  execute(context: RenderContext): void;
}
```

**Dependencies:**
- Depends on: `GBuffer`, `DrawListBuilder`, materials
- Depended by: `LightingPass`, `SSAOPass`

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Outputs: albedo, normal, roughness/metallic, depth, velocity
- [ ] Material batching by shader variant
- [ ] Instanced rendering where applicable
- [ ] Skinned mesh support
- [ ] Double-sided material handling
- [ ] Alpha-tested geometry (separate from opaque)
- [ ] Motion vectors from current/previous transforms
- [ ] **Performance:** 100k triangles < 2ms

---

### 5.2.2 `src/rendering/passes/ShadowMapPass.ts`

**Role:** Renders shadow maps for all light sources.

**Public API:**
```typescript
class ShadowMapPass implements RenderPass {
  readonly name = 'ShadowMapPass';
  enabled: boolean;

  // Configuration
  cascadeCount: number;           // For directional (2-4)
  shadowMapResolution: number;    // Per cascade/light
  pcfSamples: number;

  setup(graph: RenderGraph): void;
  execute(context: RenderContext): void;
}
```

**Dependencies:**
- Depends on: `DrawListBuilder`, lights
- Depended by: `LightingPass`

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Cascaded shadow maps for directional lights
  - [ ] Automatic cascade split (logarithmic/practical)
  - [ ] Stable cascade boundaries (no shadow swimming)
- [ ] Cube map shadows for point lights
- [ ] 2D shadow maps for spot lights
- [ ] Shadow atlas for multiple lights
- [ ] Depth bias and normal bias to prevent acne
- [ ] VSM or ESM for soft shadows (optional)
- [ ] Shadow map caching for static lights
- [ ] **Performance:** 4 cascades @ 2048 < 3ms

---

### 5.2.3 `src/rendering/passes/LightingPass.ts`

**Role:** Deferred lighting calculation.

**Public API:**
```typescript
class LightingPass implements RenderPass {
  readonly name = 'LightingPass';
  enabled: boolean;

  // Modes
  lightingMode: 'deferred' | 'tiled' | 'clustered';

  setup(graph: RenderGraph): void;
  execute(context: RenderContext): void;
}
```

**Dependencies:**
- Depends on: `GBuffer`, `ShadowMapPass` output, lights
- Depended by: Post-processing passes

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Full-screen deferred pass reading G-buffer
- [ ] PBR lighting (Cook-Torrance BRDF)
- [ ] Multiple directional lights
- [ ] Point lights with attenuation
- [ ] Spot lights with cone falloff
- [ ] Area lights (LTC approximation)
- [ ] Shadow sampling with PCF/PCSS
- [ ] Image-based lighting (environment maps)
- [ ] Light probes and SH lighting
- [ ] Tiled/clustered deferred for many lights
- [ ] Light culling on GPU (compute)
- [ ] **Performance:** 100 lights < 3ms (clustered)

---

### 5.2.4 `src/rendering/passes/ForwardTransparentPass.ts`

**Role:** Renders transparent objects with forward shading.

**Public API:**
```typescript
class ForwardTransparentPass implements RenderPass {
  readonly name = 'ForwardTransparentPass';
  enabled: boolean;

  // OIT options
  useOIT: boolean;
  oitLayers: number;

  setup(graph: RenderGraph): void;
  execute(context: RenderContext): void;
}
```

**Dependencies:**
- Depends on: `LightingPass` output (for lighting data), depth buffer
- Depended by: Post-processing

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Back-to-front sorted rendering
- [ ] Per-object lighting (forward shading)
- [ ] Refraction sampling (scene color behind)
- [ ] Order-independent transparency (OIT) option:
  - [ ] Weighted blended OIT
  - [ ] Per-pixel linked lists (WebGPU only)
- [ ] Proper depth handling (write, test, or both)
- [ ] Transmission materials (glass, water)

---

### 5.2.5 `src/rendering/passes/SkyPass.ts`

**Role:** Renders sky and environment background.

**Public API:**
```typescript
class SkyPass implements RenderPass {
  readonly name = 'SkyPass';
  enabled: boolean;

  // Sky types
  skyType: 'skybox' | 'procedural' | 'atmospheric';

  setup(graph: RenderGraph): void;
  execute(context: RenderContext): void;
}
```

**Dependencies:**
- Depends on: Environment data, depth buffer
- Depended by: `LightingPass` (for IBL), compositing

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Cubemap skybox rendering
- [ ] Procedural sky (Preetham or Hosek-Wilkie model)
- [ ] Atmospheric scattering (Rayleigh + Mie)
- [ ] Sun disk rendering
- [ ] Dynamic time-of-day
- [ ] Skybox mip level selection for roughness reflection
- [ ] Infinite depth projection (no near/far clipping)

---

### 5.2.6 `src/rendering/passes/SSAOPass.ts`

**Role:** Screen-space ambient occlusion.

**Public API:**
```typescript
class SSAOPass implements RenderPass {
  readonly name = 'SSAOPass';
  enabled: boolean;

  // Configuration
  radius: number;
  samples: number;
  power: number;
  bias: number;

  setup(graph: RenderGraph): void;
  execute(context: RenderContext): void;
}
```

**Dependencies:**
- Depends on: G-buffer depth, normals
- Depended by: `LightingPass` (modulates AO)

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] HBAO+ or GTAO algorithm
- [ ] Configurable radius and sample count
- [ ] View-space hemisphere sampling
- [ ] Bilateral blur to reduce noise
- [ ] Half-resolution option for performance
- [ ] Temporal accumulation option
- [ ] **Performance:** Full resolution < 2ms

---

### 5.2.7 `src/rendering/passes/SSRPass.ts`

**Role:** Screen-space reflections.

**Public API:**
```typescript
class SSRPass implements RenderPass {
  readonly name = 'SSRPass';
  enabled: boolean;

  // Configuration
  maxSteps: number;
  thickness: number;
  fadeDistance: number;

  setup(graph: RenderGraph): void;
  execute(context: RenderContext): void;
}
```

**Dependencies:**
- Depends on: G-buffer, scene color, depth
- Depended by: Compositing

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Hierarchical ray marching (Hi-Z)
- [ ] Stochastic sampling for rough reflections
- [ ] Edge fading to hide artifacts
- [ ] Temporal reprojection from previous frame
- [ ] Fallback to environment cubemap
- [ ] Glossy reflections via cone tracing approximation
- [ ] **Performance:** < 3ms at full resolution

---

### 5.2.8 `src/rendering/passes/SSGIPass.ts`

**Role:** Screen-space global illumination.

**Public API:**
```typescript
class SSGIPass implements RenderPass {
  readonly name = 'SSGIPass';
  enabled: boolean;

  // Configuration
  bounces: number;
  rayCount: number;
  temporalWeight: number;

  setup(graph: RenderGraph): void;
  execute(context: RenderContext): void;
}
```

**Dependencies:**
- Depends on: G-buffer, scene color, depth
- Depended by: `LightingPass` (indirect diffuse)

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Multi-bounce indirect diffuse lighting
- [ ] Screen-space ray tracing
- [ ] Importance sampling based on normal hemisphere
- [ ] Temporal accumulation with motion rejection
- [ ] Spatial denoising (joint bilateral)
- [ ] Half-resolution tracing with smart upscale
- [ ] Blend with light probes for off-screen
- [ ] **Performance:** < 4ms with temporal

---

### 5.2.9 `src/rendering/passes/VolumetricLightingPass.ts`

**Role:** Volumetric fog and light shafts.

**Public API:**
```typescript
class VolumetricLightingPass implements RenderPass {
  readonly name = 'VolumetricLightingPass';
  enabled: boolean;

  // Configuration
  fogDensity: number;
  scatteringCoeff: number;
  extinctionCoeff: number;
  anisotropy: number;  // Mie scattering G parameter

  setup(graph: RenderGraph): void;
  execute(context: RenderContext): void;
}
```

**Dependencies:**
- Depends on: Shadow maps, depth, lights
- Depended by: Compositing

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Froxel-based volumetric rendering
- [ ] Ray marching through volume
- [ ] In-scattering from all light sources
- [ ] Height-based fog density
- [ ] Temporal reprojection for stability
- [ ] Downsampled computation with bilateral upscale
- [ ] God rays / light shafts effect
- [ ] **Performance:** < 3ms at 1080p

---

### 5.2.10 `src/rendering/passes/BloomPass.ts`

**Role:** HDR bloom effect.

**Public API:**
```typescript
class BloomPass implements RenderPass {
  readonly name = 'BloomPass';
  enabled: boolean;

  // Configuration
  threshold: number;
  intensity: number;
  radius: number;
  softKnee: number;

  setup(graph: RenderGraph): void;
  execute(context: RenderContext): void;
}
```

**Dependencies:**
- Depends on: HDR scene color
- Depended by: Tone mapping

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Brightness threshold with soft knee
- [ ] Progressive downsampling (mip chain)
- [ ] Gaussian blur at each mip level
- [ ] Progressive upsampling with blending
- [ ] Additive blend with scene
- [ ] Lens dirt texture overlay (optional)
- [ ] **Performance:** < 1ms

---

### 5.2.11 `src/rendering/passes/DOFPass.ts`

**Role:** Depth of field effect.

**Public API:**
```typescript
class DOFPass implements RenderPass {
  readonly name = 'DOFPass';
  enabled: boolean;

  // Configuration
  focusDistance: number;
  aperture: number;      // F-stop
  focalLength: number;   // mm
  bokehShape: 'circle' | 'hexagon' | 'custom';

  setup(graph: RenderGraph): void;
  execute(context: RenderContext): void;
}
```

**Dependencies:**
- Depends on: Scene color, depth
- Depended by: Post-processing chain

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Physically-based CoC (circle of confusion) calculation
- [ ] Bokeh shape simulation
- [ ] Separated near/far field handling
- [ ] Gather-based approach for quality
- [ ] Temporal stability
- [ ] Auto-focus option (depth at screen center)
- [ ] **Performance:** < 3ms

---

### 5.2.12 `src/rendering/passes/MotionBlurPass.ts`

**Role:** Motion blur from camera and object movement.

**Public API:**
```typescript
class MotionBlurPass implements RenderPass {
  readonly name = 'MotionBlurPass';
  enabled: boolean;

  // Configuration
  samples: number;
  velocityScale: number;
  maxVelocity: number;

  setup(graph: RenderGraph): void;
  execute(context: RenderContext): void;
}
```

**Dependencies:**
- Depends on: Scene color, velocity buffer, depth
- Depended by: Post-processing chain

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Per-pixel motion vectors
- [ ] Camera motion blur
- [ ] Object motion blur
- [ ] Variable-length blur based on velocity
- [ ] Velocity tile optimization
- [ ] Background blur separation
- [ ] **Performance:** < 2ms

---

### 5.2.13 `src/rendering/passes/TAAPass.ts`

**Role:** Temporal anti-aliasing.

**Public API:**
```typescript
class TAAPass implements RenderPass {
  readonly name = 'TAAPass';
  enabled: boolean;

  // Configuration
  jitterPattern: 'halton' | 'r2' | 'random';
  feedbackFactor: number;
  sharpness: number;

  setup(graph: RenderGraph): void;
  execute(context: RenderContext): void;
}
```

**Dependencies:**
- Depends on: Scene color, velocity, depth, history buffer
- Depended by: Final output

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Sub-pixel jitter pattern (Halton 2,3)
- [ ] History buffer reprojection
- [ ] Velocity-based rejection
- [ ] Color neighborhood clamping (AABB or variance)
- [ ] Sharpening filter (optional)
- [ ] HDR-aware blending
- [ ] Reset on scene changes
- [ ] **Performance:** < 1ms

---

### 5.2.14 `src/rendering/passes/SMAAPass.ts`

**Role:** Subpixel morphological anti-aliasing.

**Public API:**
```typescript
class SMAAPass implements RenderPass {
  readonly name = 'SMAAPass';
  enabled: boolean;

  quality: 'low' | 'medium' | 'high' | 'ultra';

  setup(graph: RenderGraph): void;
  execute(context: RenderContext): void;
}
```

**Dependencies:**
- Depends on: Scene color
- Depended by: Final output

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Edge detection pass
- [ ] Blend weight calculation
- [ ] Neighborhood blending
- [ ] Area and search textures included
- [ ] Predicated thresholding option
- [ ] **Performance:** < 1.5ms at high quality

---

### 5.2.15 `src/rendering/passes/FXAAPass.ts`

**Role:** Fast approximate anti-aliasing.

**Public API:**
```typescript
class FXAAPass implements RenderPass {
  readonly name = 'FXAAPass';
  enabled: boolean;

  quality: 'low' | 'medium' | 'high';

  setup(graph: RenderGraph): void;
  execute(context: RenderContext): void;
}
```

**Dependencies:**
- Depends on: Scene color (with luma in alpha or computed)
- Depended by: Final output

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] FXAA 3.11 implementation
- [ ] Quality presets affecting search iterations
- [ ] Luminance in alpha or compute on the fly
- [ ] **Performance:** < 0.5ms

---

### 5.2.16 `src/rendering/passes/ColorGradingPass.ts`

**Role:** Final color correction and tone mapping.

**Public API:**
```typescript
class ColorGradingPass implements RenderPass {
  readonly name = 'ColorGradingPass';
  enabled: boolean;

  // Tone mapping
  toneMapper: 'aces' | 'reinhard' | 'uncharted2' | 'none';
  exposure: number;

  // Color grading
  temperature: number;
  tint: number;
  saturation: number;
  contrast: number;
  gamma: number;

  // LUT
  lutTexture: GPUTexture | null;
  lutContribution: number;

  setup(graph: RenderGraph): void;
  execute(context: RenderContext): void;
}
```

**Dependencies:**
- Depends on: HDR scene color
- Depended by: Final output (sRGB)

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] ACES filmic tone mapping (default)
- [ ] Exposure control (EV)
- [ ] White balance (temperature/tint)
- [ ] S-curve contrast
- [ ] 3D LUT support (32³)
- [ ] Output to sRGB with proper gamma
- [ ] Dithering to prevent banding
- [ ] **Performance:** < 0.5ms

---

### 5.2.17 Additional Passes

**Remaining passes follow group checklist with specific implementations:**

- **OceanPass.ts:** FFT ocean rendering, foam, underwater
- **TerrainPass.ts:** Terrain LOD, splatmapping, detail textures
- **VoxelPass.ts:** Greedy meshing, AO, colored voxels
- **ParticlePass.ts:** GPU particle rendering, soft particles
- **ChromaticAberrationPass.ts:** Lateral CA, distortion
- **FilmGrainPass.ts:** Animated noise overlay
- **OutlinePass.ts:** Object outlines (jump flood or edge detection)
- **MLPostProcessPass.ts:** Neural network style transfer, super-resolution
- **DebugOverlayPass.ts:** G-buffer visualization, wireframe, stats

---

## 5.3 Culling

### 5.3.1 `src/rendering/culling/ViewFrustumCuller.ts`

**Role:** CPU-based view frustum culling.

**Public API:**
```typescript
class ViewFrustumCuller {
  cull(frustum: Frustum, objects: CullableObject[]): CullableObject[];
  cullAsync(frustum: Frustum, objects: CullableObject[]): Promise<CullableObject[]>;

  get culledCount(): number;
  get visibleCount(): number;
}
```

**Implementation Checklist:**
- [ ] Sphere-frustum test (fast rejection)
- [ ] Box-frustum test for edge cases
- [ ] Hierarchical culling with BVH
- [ ] Async path for background processing
- [ ] **Performance:** 100k objects < 2ms

---

### 5.3.2 `src/rendering/culling/GPUCulling.ts`

**Role:** GPU-accelerated visibility culling.

**Public API:**
```typescript
class GPUCulling {
  initialize(device: RenderDevice): void;

  cull(
    instances: GPUBuffer,
    instanceCount: number,
    frustum: Frustum
  ): Promise<GPUBuffer>;  // Returns visible instance buffer

  get visibleCount(): number;
}
```

**Implementation Checklist:**
- [ ] Compute shader culling on GPU
- [ ] Indirect draw buffer generation
- [ ] Atomic counter for visible count
- [ ] Works with instanced rendering
- [ ] **Performance:** 1M instances < 1ms

---

### 5.3.3 `src/rendering/culling/HiZCulling.ts`

**Role:** Hierarchical-Z occlusion culling.

**Public API:**
```typescript
class HiZCulling {
  buildHiZ(depth: GPUTexture): void;
  testOccluded(bounds: Box3, viewProjection: Matrix4): boolean;
  testOccludedGPU(boundsBuffer: GPUBuffer): GPUBuffer;

  get hiZTexture(): GPUTexture;
}
```

**Implementation Checklist:**
- [ ] Depth buffer downsampling (max filter)
- [ ] Conservative rasterization bounds
- [ ] GPU readback for CPU queries (async)
- [ ] GPU-only path for compute culling
- [ ] **Performance:** Hi-Z build < 0.5ms

---

## 5.4 Debug Tools

### 5.4.1 `src/rendering/debug/RenderDocIntegration.ts`

**Role:** RenderDoc GPU capture integration.

**Implementation Checklist:**
- [ ] Frame capture API hooks
- [ ] Marker push/pop for pass names
- [ ] Resource naming for debugging
- [ ] Works with WebGPU/WebGL debug extensions

---

### 5.4.2 `src/rendering/debug/RenderGraphVisualizer.ts`

**Role:** Visual representation of render graph.

**Implementation Checklist:**
- [ ] DAG visualization with passes as nodes
- [ ] Resource flow edges
- [ ] Timing overlay
- [ ] Export to image/SVG

---

### 5.4.3 `src/rendering/index.ts`

**Role:** Barrel export for rendering module.

**Implementation Checklist:**
- [ ] Re-exports all public APIs
- [ ] Re-exports passes (for custom graphs)
- [ ] Tree-shakeable

---

## Next Document

Continue to `PRD-Final-03-Shaders-Materials-PostFX.md` for Shader, Material, and PostFX specifications.
