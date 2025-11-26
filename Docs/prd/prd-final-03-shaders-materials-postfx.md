# G3D 5.0 PRD – Part 3: Shaders, Materials, PostFX

**Parent Document:** `PRD-Final-00-Overview.md`

---

## 6. Shader System

---

## 6.1 `src/shaders/` – Shader System

### Directory Structure

```
src/shaders/
├── ShaderLibrary.ts
├── ShaderCompiler.ts
├── ShaderChunkRegistry.ts
├── ShaderChunkCache.ts
├── GLSLCodeGenerator.ts
├── WGSLCodeGenerator.ts
├── graph/
│   ├── ShaderGraph.ts
│   ├── ShaderNode.ts
│   ├── ShaderEdge.ts
│   ├── NodeLibrary.ts
│   ├── GraphSerializer.ts
│   └── GraphValidator.ts
├── chunks/
│   ├── common.glsl
│   ├── pbr.glsl
│   ├── lighting.glsl
│   ├── shadow.glsl
│   ├── ssgi.glsl
│   ├── ssr.glsl
│   ├── ao.glsl
│   ├── volumetric.glsl
│   ├── fxaa.glsl
│   ├── smaa.glsl
│   ├── taa.glsl
│   ├── bloom.glsl
│   ├── dof.glsl
│   ├── motion_blur.glsl
│   ├── chromatic.glsl
│   ├── film_grain.glsl
│   ├── tone_mapping.glsl
│   ├── color_grading.glsl
│   ├── outline.glsl
│   ├── hair.glsl
│   ├── cloth.glsl
│   ├── ocean.glsl
│   ├── volumetric_particles.glsl
│   ├── caustics.glsl
│   ├── parallax_occlusion.glsl
│   ├── matcap.glsl
│   └── toon.glsl
├── compute/
│   ├── particle_update.wgsl
│   ├── particle_spawn.wgsl
│   ├── particle_cull.wgsl
│   ├── cloth_solve.wgsl
│   ├── sph_solve.wgsl
│   ├── mpm_p2g.wgsl
│   ├── mpm_grid.wgsl
│   ├── mpm_g2p.wgsl
│   ├── voronoi_compute.wgsl
│   ├── fem_tetrahedral.wgsl
│   ├── gpu_culling.wgsl
│   ├── volume_density.wgsl
│   ├── caustics_photon_trace.wgsl
│   ├── caustics_accumulate.wgsl
│   └── caustics_blur.wgsl
└── index.ts
```

---

### 6.1.1 `src/shaders/ShaderLibrary.ts`

**Role:** Central registry and access point for all shader programs.

**Public API:**
```typescript
class ShaderLibrary {
  // Registration
  static register(id: string, shader: ShaderProgram): void;
  static registerFromChunks(id: string, chunks: string[], defines?: Record<string, string>): void;

  // Access
  static get(id: string): ShaderProgram;
  static getVariant(id: string, defines: Record<string, string>): ShaderProgram;
  static has(id: string): boolean;

  // Management
  static preload(ids: string[]): Promise<void>;
  static clear(): void;

  // Statistics
  static getStats(): ShaderStats;
}

interface ShaderProgram {
  readonly id: string;
  readonly vertexSource: string;
  readonly fragmentSource: string;
  readonly computeSource?: string;
  readonly uniforms: UniformDescriptor[];
  readonly attributes: AttributeDescriptor[];
}
```

**Dependencies:**
- Depends on: `ShaderChunkRegistry`, `ShaderCompiler`
- Depended by: `MaterialLibrary`, all render passes

**Implementation Checklist:**
- [ ] Shader registration by unique ID
- [ ] Variant generation via define combinations
- [ ] Variant caching to avoid recompilation
- [ ] Async preloading for batch compilation
- [ ] Hot reload support in development
- [ ] Uniform/attribute introspection
- [ ] Statistics: shader count, variant count, memory
- [ ] **Tests:** Registration, variant generation, caching

---

### 6.1.2 `src/shaders/ShaderCompiler.ts`

**Role:** Compiles shader source for GPU.

**Public API:**
```typescript
class ShaderCompiler {
  static compile(
    source: string,
    type: 'vertex' | 'fragment' | 'compute',
    target: 'glsl' | 'wgsl'
  ): CompileResult;

  static link(
    vertex: CompiledShader,
    fragment: CompiledShader
  ): LinkedProgram;

  static validate(source: string, type: string): ValidationResult;
}

interface CompileResult {
  success: boolean;
  shader?: CompiledShader;
  errors?: CompileError[];
  warnings?: CompileWarning[];
}

interface CompileError {
  line: number;
  column: number;
  message: string;
  source: string;
}
```

**Dependencies:**
- Depends on: `RenderDevice`
- Depended by: `ShaderLibrary`

**Implementation Checklist:**
- [ ] GLSL ES 3.0 compilation for WebGL2
- [ ] WGSL compilation for WebGPU
- [ ] Error parsing with line numbers
- [ ] Warning extraction
- [ ] Preprocessor expansion (#include, #define, #ifdef)
- [ ] Source mapping for debug
- [ ] **Performance:** Compilation < 100ms per shader

---

### 6.1.3 `src/shaders/ShaderChunkRegistry.ts`

**Role:** Manages reusable shader code chunks.

**Public API:**
```typescript
class ShaderChunkRegistry {
  static register(name: string, source: string, dependencies?: string[]): void;
  static get(name: string): string;
  static resolve(name: string): string;  // With dependencies inlined
  static getDependencyOrder(names: string[]): string[];

  static getAll(): Map<string, ShaderChunk>;
}

interface ShaderChunk {
  name: string;
  source: string;
  dependencies: string[];
}
```

**Dependencies:**
- Depends on: None
- Depended by: `ShaderLibrary`, `ShaderCompiler`

**Implementation Checklist:**
- [ ] Chunk registration with dependency declaration
- [ ] Topological sort for include order
- [ ] Circular dependency detection
- [ ] #include directive resolution
- [ ] Duplicate include prevention
- [ ] **Tests:** Dependency resolution, circular detection

---

### 6.1.4 `src/shaders/ShaderChunkCache.ts`

**Role:** Caches compiled shader chunks.

**Public API:**
```typescript
class ShaderChunkCache {
  static get(key: string): CachedChunk | undefined;
  static set(key: string, chunk: CachedChunk): void;
  static invalidate(name: string): void;
  static clear(): void;

  get size(): number;
  get hitRate(): number;
}
```

**Implementation Checklist:**
- [ ] LRU eviction policy
- [ ] Cache key includes defines and target
- [ ] Invalidation cascades to dependents
- [ ] Statistics: hits, misses, evictions

---

### 6.1.5 `src/shaders/GLSLCodeGenerator.ts`

**Role:** Generates GLSL from shader graph or templates.

**Public API:**
```typescript
class GLSLCodeGenerator {
  generate(graph: ShaderGraph): GLSLOutput;
  generateFromTemplate(template: string, params: Record<string, any>): string;
}

interface GLSLOutput {
  vertex: string;
  fragment: string;
  defines: Record<string, string>;
}
```

**Dependencies:**
- Depends on: `ShaderGraph`, `ShaderChunkRegistry`
- Depended by: `ShaderLibrary`, material system

**Implementation Checklist:**
- [ ] Shader graph to GLSL ES 3.0 conversion
- [ ] Automatic varying generation
- [ ] Uniform buffer layout generation
- [ ] Texture sampler management
- [ ] Precision qualifiers (highp/mediump/lowp)
- [ ] Extension requirements detection

---

### 6.1.6 `src/shaders/WGSLCodeGenerator.ts`

**Role:** Generates WGSL from shader graph or templates.

**Public API:**
```typescript
class WGSLCodeGenerator {
  generate(graph: ShaderGraph): WGSLOutput;
  generateFromTemplate(template: string, params: Record<string, any>): string;
}

interface WGSLOutput {
  vertex: string;
  fragment: string;
  compute?: string;
  bindings: BindingLayout;
}
```

**Dependencies:**
- Depends on: `ShaderGraph`, `ShaderChunkRegistry`
- Depended by: `ShaderLibrary`, material system

**Implementation Checklist:**
- [ ] Shader graph to WGSL conversion
- [ ] Bind group layout generation
- [ ] Storage buffer support
- [ ] Compute shader generation
- [ ] Workgroup size optimization

---

## 6.2 Shader Graph

### 6.2.1 `src/shaders/graph/ShaderGraph.ts`

**Role:** Node-based visual shader representation.

**Public API:**
```typescript
class ShaderGraph {
  readonly nodes: Map<string, ShaderNode>;
  readonly edges: ShaderEdge[];

  // Construction
  addNode(node: ShaderNode): string;
  removeNode(id: string): void;
  connect(from: NodeOutput, to: NodeInput): ShaderEdge;
  disconnect(edge: ShaderEdge): void;

  // Access
  getNode(id: string): ShaderNode | undefined;
  getOutputNode(): ShaderNode;

  // Compilation
  compile(target: 'glsl' | 'wgsl'): CompiledShader;
  validate(): ValidationResult;

  // Serialization
  serialize(): SerializedGraph;
  static deserialize(data: SerializedGraph): ShaderGraph;
}
```

**Dependencies:**
- Depends on: `ShaderNode`, `ShaderEdge`, `NodeLibrary`
- Depended by: Material editor, `ShaderLibrary`

**Implementation Checklist:**
- [ ] DAG structure with input/output ports
- [ ] Type checking on connections
- [ ] Automatic type promotion where safe
- [ ] Dead node elimination
- [ ] Constant folding optimization
- [ ] Output node determines final values
- [ ] Serialization for save/load
- [ ] **Tests:** Graph construction, validation, compilation

---

### 6.2.2 `src/shaders/graph/ShaderNode.ts`

**Role:** Base class for shader graph nodes.

**Public API:**
```typescript
abstract class ShaderNode {
  readonly id: string;
  readonly type: string;
  readonly inputs: NodeInput[];
  readonly outputs: NodeOutput[];

  abstract generateCode(context: CodeGenContext): string;
}

interface NodeInput {
  name: string;
  type: ShaderType;
  defaultValue?: any;
  connection?: NodeOutput;
}

interface NodeOutput {
  name: string;
  type: ShaderType;
}

type ShaderType = 'float' | 'vec2' | 'vec3' | 'vec4' | 'mat3' | 'mat4' | 'sampler2D' | 'samplerCube';
```

**Dependencies:**
- Depends on: None
- Depended by: `ShaderGraph`, all node implementations

**Implementation Checklist:**
- [ ] Unique ID generation
- [ ] Input/output port definitions
- [ ] Default value support
- [ ] Code generation abstract method
- [ ] Type inference

---

### 6.2.3 `src/shaders/graph/NodeLibrary.ts`

**Role:** Collection of all available shader nodes.

**Public API:**
```typescript
class NodeLibrary {
  static register(category: string, nodeType: typeof ShaderNode): void;
  static create(type: string): ShaderNode;
  static getCategories(): string[];
  static getNodesInCategory(category: string): NodeInfo[];
}

// Built-in node categories:
// - Math: Add, Subtract, Multiply, Divide, Power, Sqrt, Abs, Sign, Floor, Ceil, Fract, Mod, Min, Max, Clamp, Lerp, Step, Smoothstep
// - Vector: Split, Combine, Normalize, Dot, Cross, Length, Distance, Reflect, Refract
// - Texture: Sample2D, SampleCube, SampleNormal, Triplanar
// - UV: TilingOffset, Rotate, Parallax
// - Color: HSV, Contrast, Saturation, Blend
// - PBR: FresnelSchlick, GGX, Lambert, CookTorrance
// - Utility: Time, ViewDirection, WorldPosition, ScreenPosition
```

**Implementation Checklist:**
- [ ] All standard math operations
- [ ] Vector manipulation nodes
- [ ] Texture sampling nodes
- [ ] UV transformation nodes
- [ ] PBR function nodes
- [ ] Utility/input nodes
- [ ] Custom node registration
- [ ] **Tests:** All built-in nodes

---

### 6.2.4 `src/shaders/graph/GraphValidator.ts`

**Role:** Validates shader graph correctness.

**Public API:**
```typescript
class GraphValidator {
  static validate(graph: ShaderGraph): ValidationResult;
}

interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

interface ValidationError {
  nodeId: string;
  message: string;
  type: 'type_mismatch' | 'missing_connection' | 'cycle_detected' | 'invalid_value';
}
```

**Implementation Checklist:**
- [ ] Type compatibility checking
- [ ] Required connection validation
- [ ] Cycle detection
- [ ] Unreachable node detection
- [ ] Value range validation

---

## 6.3 Shader Chunks

### 6.3.0 Shader Chunk Group Checklist

**All files in `src/shaders/chunks/` must provide:**

- [ ] Well-documented GLSL code with comments
- [ ] Dependency declarations via `#pragma requires`
- [ ] Configurable via `#ifdef` defines
- [ ] No hardcoded magic numbers (use uniforms or constants)
- [ ] Optimized for target GPUs (minimize branching)
- [ ] Matching WGSL version where applicable

---

### 6.3.1 `src/shaders/chunks/common.glsl`

**Role:** Common utilities used by all shaders.

**Provides:**
```glsl
// Constants
const float PI = 3.14159265359;
const float TWO_PI = 6.28318530718;
const float HALF_PI = 1.57079632679;
const float EPSILON = 1e-6;

// Encoding/Decoding
vec3 decodeNormal(vec2 encoded);
vec2 encodeNormal(vec3 normal);
float linearizeDepth(float depth, float near, float far);
vec3 reconstructPosition(vec2 uv, float depth, mat4 invViewProj);

// Utilities
float saturate(float x);
vec3 saturate(vec3 x);
float luminance(vec3 color);
vec3 sRGBToLinear(vec3 srgb);
vec3 linearToSRGB(vec3 linear);
```

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Octahedron normal encoding/decoding
- [ ] Depth linearization for perspective/ortho
- [ ] Position reconstruction from depth
- [ ] Color space conversions

---

### 6.3.2 `src/shaders/chunks/pbr.glsl`

**Role:** Physically-based rendering functions.

**Provides:**
```glsl
// BRDF
float D_GGX(float NdotH, float roughness);
float G_SmithGGX(float NdotV, float NdotL, float roughness);
vec3 F_Schlick(float VdotH, vec3 F0);
vec3 F_SchlickRoughness(float cosTheta, vec3 F0, float roughness);

// Full BRDF evaluation
vec3 BRDF_Specular(vec3 N, vec3 V, vec3 L, float roughness, vec3 F0);
vec3 BRDF_Diffuse(vec3 albedo);

// IBL
vec3 IBL_Specular(vec3 N, vec3 V, float roughness, vec3 F0, samplerCube envMap, sampler2D brdfLUT);
vec3 IBL_Diffuse(vec3 N, vec3 albedo, samplerCube irradianceMap);
```

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] GGX distribution function
- [ ] Height-correlated Smith G
- [ ] Fresnel with roughness factor
- [ ] Energy-conserving diffuse (optional Lambert/Disney)
- [ ] Split-sum IBL approximation
- [ ] BRDF LUT generation utility

---

### 6.3.3 `src/shaders/chunks/lighting.glsl`

**Role:** Light calculation functions.

**Provides:**
```glsl
// Light structures
struct DirectionalLight { vec3 direction; vec3 color; float intensity; };
struct PointLight { vec3 position; vec3 color; float intensity; float range; };
struct SpotLight { vec3 position; vec3 direction; vec3 color; float intensity; float range; float innerAngle; float outerAngle; };
struct AreaLight { vec3 position; vec3 direction; vec3 color; float intensity; float width; float height; };

// Attenuation
float getDistanceAttenuation(float distance, float range);
float getSpotAttenuation(vec3 L, vec3 spotDir, float innerAngle, float outerAngle);

// Light evaluation
vec3 evaluateDirectionalLight(DirectionalLight light, vec3 N, vec3 V, vec3 albedo, float metallic, float roughness);
vec3 evaluatePointLight(PointLight light, vec3 worldPos, vec3 N, vec3 V, vec3 albedo, float metallic, float roughness);
vec3 evaluateSpotLight(SpotLight light, vec3 worldPos, vec3 N, vec3 V, vec3 albedo, float metallic, float roughness);
vec3 evaluateAreaLight(AreaLight light, vec3 worldPos, vec3 N, vec3 V, vec3 albedo, float metallic, float roughness);
```

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Physical attenuation (inverse square)
- [ ] Smooth distance falloff
- [ ] Spotlight cone with soft edge
- [ ] Area light via LTC approximation
- [ ] Clustered light access helpers

---

### 6.3.4 `src/shaders/chunks/shadow.glsl`

**Role:** Shadow sampling and filtering.

**Provides:**
```glsl
// Shadow sampling
float sampleShadowMap(sampler2DShadow shadowMap, vec3 shadowCoord);
float sampleShadowMapPCF(sampler2DShadow shadowMap, vec3 shadowCoord, float filterRadius);
float sampleShadowMapPCSS(sampler2D shadowMap, vec3 shadowCoord, float lightSize);
float sampleCascadedShadow(sampler2DArrayShadow shadowMaps, vec3 worldPos, mat4[] cascadeMatrices, int cascadeCount);

// Utilities
int selectCascade(vec3 viewPos, float[] cascadeSplits, int cascadeCount);
vec3 getShadowCoord(vec3 worldPos, mat4 lightMatrix);
float applyShadowBias(float depth, vec3 normal, vec3 lightDir, float bias, float normalBias);
```

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Hardware PCF (sampler2DShadow)
- [ ] Poisson disk PCF
- [ ] PCSS for soft shadows
- [ ] Cascade selection with blending
- [ ] Slope-scaled bias
- [ ] Normal bias

---

### 6.3.5 `src/shaders/chunks/ssgi.glsl`

**Role:** Screen-space global illumination.

**Provides:**
```glsl
// SSGI functions
vec3 traceScreenSpaceRay(vec3 origin, vec3 direction, mat4 projection, sampler2D depthTex, int maxSteps);
vec3 sampleIndirectDiffuse(vec2 uv, vec3 normal, sampler2D colorTex, sampler2D depthTex, sampler2D normalTex);
vec3 denoiseSSGI(sampler2D ssgiTex, sampler2D normalTex, sampler2D depthTex, vec2 uv);
```

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Hi-Z accelerated ray marching
- [ ] Importance sampling hemisphere
- [ ] Temporal accumulation
- [ ] Joint bilateral denoising

---

### 6.3.6 Additional Chunks

**All remaining chunks follow group checklist. Key implementations:**

- **ssr.glsl:** Screen-space reflection ray marching, roughness-based blur
- **ao.glsl:** HBAO/GTAO hemisphere sampling, spatial blur
- **volumetric.glsl:** Ray marching, in-scattering, beer's law
- **taa.glsl:** History sampling, velocity rejection, clamping
- **bloom.glsl:** Threshold, downscale, blur, upscale
- **dof.glsl:** CoC calculation, gather blur, bokeh
- **motion_blur.glsl:** Velocity tile, directional blur
- **tone_mapping.glsl:** ACES, Reinhard, Uncharted curves
- **color_grading.glsl:** LUT sampling, temperature, contrast
- **hair.glsl:** Marschner model, kajiya-kay
- **cloth.glsl:** Velvet BRDF, subsurface approximation
- **ocean.glsl:** FFT displacement, foam, underwater fog
- **toon.glsl:** Cel shading, outline, hatching
- **parallax_occlusion.glsl:** POM ray marching, self-shadowing

---

## 6.4 Compute Shaders

### 6.4.0 Compute Shader Group Checklist

**All files in `src/shaders/compute/` must provide:**

- [ ] WGSL source (primary) with GLSL fallback where possible
- [ ] Clearly defined workgroup sizes
- [ ] Buffer layout documentation
- [ ] Atomic operations where needed
- [ ] Memory barriers correctly placed
- [ ] Performance optimized (minimize divergence)

---

### 6.4.1 `src/shaders/compute/particle_update.wgsl`

**Role:** GPU particle position/velocity update.

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Integration (Euler, Verlet, or RK4)
- [ ] Force accumulation
- [ ] Lifetime update and death
- [ ] Bounds checking
- [ ] Collision response (simple)
- [ ] **Performance:** 1M particles < 2ms

---

### 6.4.2 `src/shaders/compute/cloth_solve.wgsl`

**Role:** GPU cloth PBD solver.

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Distance constraints
- [ ] Bending constraints
- [ ] Collision constraints
- [ ] Multiple iterations
- [ ] **Performance:** 100k particles @ 60 FPS

---

### 6.4.3 `src/shaders/compute/sph_solve.wgsl`

**Role:** SPH fluid solver.

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Neighbor search (spatial hash)
- [ ] Density calculation
- [ ] Pressure forces
- [ ] Viscosity forces
- [ ] Surface tension (optional)
- [ ] **Performance:** 100k particles @ 60 FPS

---

### 6.4.4 `src/shaders/compute/mpm_p2g.wgsl` / `mpm_grid.wgsl` / `mpm_g2p.wgsl`

**Role:** Material Point Method simulation.

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Particle-to-grid transfer (APIC)
- [ ] Grid operations (velocity update, boundaries)
- [ ] Grid-to-particle transfer
- [ ] Deformation gradient update
- [ ] Multiple material models (elastic, fluid, sand)
- [ ] **Performance:** 500k particles @ 30 FPS

---

### 6.4.5 `src/shaders/compute/gpu_culling.wgsl`

**Role:** GPU-accelerated frustum/occlusion culling.

**Implementation Checklist:**
- [ ] All group checklist items
- [ ] Frustum-sphere test
- [ ] Frustum-AABB test
- [ ] Hi-Z occlusion test
- [ ] Indirect draw buffer generation
- [ ] Atomic counter for visible count
- [ ] **Performance:** 1M instances < 1ms

---

---

## 7. Material System

---

## 7.1 `src/materials/` – Material System

### Directory Structure

```
src/materials/
├── Material.ts
├── MaterialInstance.ts
├── MaterialLibrary.ts
├── StandardPBRMaterial.ts
├── UnlitMaterial.ts
├── SkyboxMaterial.ts
├── DepthOnlyMaterial.ts
├── WireframeMaterial.ts
├── PhongMaterial.ts
├── BlinnPhongMaterial.ts
├── ToonMaterial.ts
├── MatCapMaterial.ts
├── IridescenceMaterial.ts
├── AnisotropicMaterial.ts
├── SubsurfaceMaterial.ts
├── SheenMaterial.ts
├── CarPaintMaterial.ts
├── ClothMaterial.ts
├── HairMaterial.ts
├── SurfaceDetailMaterial.ts
├── TransmissionMaterial.ts
├── VolumetricMaterial.ts
├── OceanMaterial.ts
├── TerrainMaterial.ts
├── VoxelMaterial.ts
├── ParticleMaterial.ts
├── VolumetricParticleMaterial.ts
├── MedicalVolumeMaterial.ts
├── SHLightingMaterial.ts
├── RectAreaLightMaterial.ts
├── ParallaxOcclusionMaterial.ts
├── LayeredMaterial.ts
├── MaterialPresets.ts
└── index.ts
```

---

### 7.1.1 `src/materials/Material.ts`

**Role:** Base class for all materials.

**Public API:**
```typescript
abstract class Material {
  readonly id: string;
  readonly name: string;

  // Shader
  abstract getShader(): ShaderProgram;
  abstract getShaderVariant(defines: Record<string, string>): ShaderProgram;

  // Parameters
  abstract getParameters(): MaterialParameter[];
  setParameter(name: string, value: any): void;
  getParameter(name: string): any;

  // Render state
  renderQueue: RenderQueue;
  blendMode: BlendMode;
  cullMode: CullMode;
  depthTest: boolean;
  depthWrite: boolean;

  // Binding
  bind(device: RenderDevice, context: RenderContext): GPUBindGroup;

  // Cloning
  clone(): Material;
}

enum RenderQueue { BACKGROUND = 1000, OPAQUE = 2000, TRANSPARENT = 3000, OVERLAY = 4000 }
enum BlendMode { OPAQUE, ALPHA, ADDITIVE, MULTIPLY, PREMULTIPLIED }
enum CullMode { NONE, FRONT, BACK }

interface MaterialParameter {
  name: string;
  type: 'float' | 'vec2' | 'vec3' | 'vec4' | 'mat4' | 'texture2d' | 'textureCube';
  defaultValue: any;
  range?: [number, number];
  description?: string;
}
```

**Dependencies:**
- Depends on: `ShaderLibrary`, `RenderDevice`
- Depended by: All material implementations, `RenderSystem`

**Implementation Checklist:**
- [ ] Abstract shader access
- [ ] Parameter management with type checking
- [ ] Render state configuration
- [ ] Bind group creation and caching
- [ ] Material cloning for instances
- [ ] Dirty tracking for rebind optimization
- [ ] **Tests:** Parameter setting, binding, cloning

---

### 7.1.2 `src/materials/MaterialInstance.ts`

**Role:** Per-entity material parameter overrides.

**Public API:**
```typescript
class MaterialInstance {
  readonly baseMaterial: Material;

  // Override parameters
  setParameter(name: string, value: any): void;
  getParameter(name: string): any;
  clearOverride(name: string): void;
  clearAllOverrides(): void;

  // Access
  getEffectiveParameter(name: string): any;
  getOverrides(): Map<string, any>;

  // Binding
  bind(device: RenderDevice, context: RenderContext): GPUBindGroup;
}
```

**Dependencies:**
- Depends on: `Material`
- Depended by: `MaterialComponent`, rendering

**Implementation Checklist:**
- [ ] Inherits from base material
- [ ] Override storage
- [ ] Effective value resolution
- [ ] Separate bind group for overrides
- [ ] Memory efficient (only stores differences)

---

### 7.1.3 `src/materials/MaterialLibrary.ts`

**Role:** Central material registration and access.

**Public API:**
```typescript
class MaterialLibrary {
  static register(material: Material): void;
  static get(id: string): Material | undefined;
  static getAll(): Material[];
  static createInstance(materialId: string): MaterialInstance;

  static loadFromAsset(assetId: string): Promise<Material>;
  static saveToAsset(material: Material): Promise<string>;
}
```

**Dependencies:**
- Depends on: `Material`, asset system
- Depended by: Asset loading, editor

**Implementation Checklist:**
- [ ] Material registration by ID
- [ ] Instance factory
- [ ] Asset serialization/deserialization
- [ ] Built-in materials pre-registered

---

### 7.1.4 `src/materials/StandardPBRMaterial.ts`

**Role:** Standard physically-based rendering material.

**Public API:**
```typescript
class StandardPBRMaterial extends Material {
  // Base color
  albedo: Color;
  albedoMap: Texture | null;

  // PBR properties
  metallic: number;
  metallicMap: Texture | null;
  roughness: number;
  roughnessMap: Texture | null;

  // Normal mapping
  normalMap: Texture | null;
  normalScale: number;

  // Occlusion
  aoMap: Texture | null;
  aoIntensity: number;

  // Emission
  emissive: Color;
  emissiveMap: Texture | null;
  emissiveIntensity: number;

  // Detail
  detailAlbedoMap: Texture | null;
  detailNormalMap: Texture | null;
  detailTiling: Vector2;

  // Alpha
  alphaMode: 'opaque' | 'mask' | 'blend';
  alphaCutoff: number;

  // UV
  tiling: Vector2;
  offset: Vector2;
}
```

**Dependencies:**
- Depends on: `Material`, `pbr.glsl`, `lighting.glsl`
- Depended by: Most game objects

**Implementation Checklist:**
- [ ] Full PBR workflow (metallic-roughness)
- [ ] All texture maps optional (falls back to uniforms)
- [ ] Normal map with configurable scale
- [ ] Detail textures with separate UV
- [ ] Alpha modes: opaque, mask (cutoff), blend
- [ ] Emission with intensity multiplier
- [ ] IBL integration
- [ ] Shadow receiving
- [ ] **Tests:** All combinations, visual regression

---

### 7.1.5 Material Group Checklist

**All concrete materials must implement:**

- [ ] Extends `Material` base class
- [ ] Implements `getShader()` returning appropriate shader
- [ ] Implements `getParameters()` with full metadata
- [ ] All parameters with sensible defaults
- [ ] Shader variant generation for feature combinations
- [ ] Works with both WebGPU and WebGL2
- [ ] Documentation with visual examples
- [ ] Unit tests for parameter validation

---

### 7.1.6 Specialized Materials

**Key material implementations:**

#### `ToonMaterial.ts`
- [ ] Discrete lighting bands (configurable count)
- [ ] Outline rendering (screen-space or mesh expansion)
- [ ] Rim lighting
- [ ] Specular highlight bands
- [ ] Hatching/cross-hatching patterns

#### `SubsurfaceMaterial.ts`
- [ ] Subsurface scattering approximation
- [ ] Configurable SSS color and radius
- [ ] Thickness map support
- [ ] Screen-space SSS blur

#### `HairMaterial.ts`
- [ ] Kajiya-Kay or Marschner model
- [ ] Anisotropic highlights
- [ ] Multiple specular lobes
- [ ] Shift map for highlight variation
- [ ] Transmission through hair

#### `ClothMaterial.ts`
- [ ] Sheen layer (velvet, silk)
- [ ] Subsurface scattering
- [ ] Anisotropic reflections (weave patterns)
- [ ] Fuzz/fiber detail

#### `CarPaintMaterial.ts`
- [ ] Metallic base layer
- [ ] Clear coat layer
- [ ] Flake layer (metallic particles)
- [ ] Fresnel-based color shift

#### `TransmissionMaterial.ts`
- [ ] Refraction with IOR
- [ ] Chromatic dispersion (optional)
- [ ] Absorption (Beer's law)
- [ ] Thickness-based effects

#### `OceanMaterial.ts`
- [ ] FFT displacement mapping
- [ ] Foam generation and rendering
- [ ] Subsurface scattering
- [ ] Reflection/refraction
- [ ] Depth-based color absorption

#### `TerrainMaterial.ts`
- [ ] Splat map blending (4-16 layers)
- [ ] Triplanar mapping option
- [ ] Height-based blending
- [ ] Detail textures
- [ ] Distance-based LOD

#### `VolumetricMaterial.ts`
- [ ] Ray marching parameters
- [ ] Density texture (3D)
- [ ] Absorption and scattering coefficients
- [ ] Light integration

---

### 7.1.7 `src/materials/MaterialPresets.ts`

**Role:** Pre-configured material instances for common use cases.

**Public API:**
```typescript
const MaterialPresets = {
  // Metals
  gold: StandardPBRMaterial;
  silver: StandardPBRMaterial;
  copper: StandardPBRMaterial;
  iron: StandardPBRMaterial;
  aluminum: StandardPBRMaterial;

  // Non-metals
  plastic: StandardPBRMaterial;
  rubber: StandardPBRMaterial;
  wood: StandardPBRMaterial;
  concrete: StandardPBRMaterial;
  fabric: ClothMaterial;

  // Special
  glass: TransmissionMaterial;
  water: OceanMaterial;
  skin: SubsurfaceMaterial;
  eye: SubsurfaceMaterial;
  hair: HairMaterial;

  // Create custom
  create(preset: string, overrides?: Partial<MaterialParams>): Material;
};
```

**Implementation Checklist:**
- [ ] Physically accurate values for common materials
- [ ] All presets tested visually
- [ ] Override capability for customization

---

---

## 8. Post-Processing

---

## 8.1 `src/postfx/` – Post-Processing Controllers

### Directory Structure

```
src/postfx/
├── PostProcessChain.ts
├── AntiAliasingManager.ts
├── TAAPassController.ts
├── ToneMappingController.ts
├── LUTLoader.ts
├── FXAAController.ts
├── SMAAController.ts
├── BloomController.ts
├── DOFController.ts
├── MotionBlurController.ts
├── VolumetricController.ts
├── OutlineController.ts
├── MLPostProcessController.ts
└── index.ts
```

---

### 8.1.1 `src/postfx/PostProcessChain.ts`

**Role:** Manages post-processing pass sequence.

**Public API:**
```typescript
class PostProcessChain {
  // Configuration
  addEffect(effect: PostProcessEffect, order?: number): void;
  removeEffect(effect: PostProcessEffect): void;
  setEffectEnabled(effect: PostProcessEffect, enabled: boolean): void;
  reorderEffect(effect: PostProcessEffect, newOrder: number): void;

  // Presets
  applyPreset(preset: PostProcessPreset): void;

  // Execution
  execute(context: RenderContext): void;

  // Access
  getEffects(): PostProcessEffect[];
  getEffect<T extends PostProcessEffect>(type: new (...args: any[]) => T): T | undefined;
}

interface PostProcessEffect {
  readonly name: string;
  readonly order: number;
  enabled: boolean;
  execute(context: RenderContext): void;
}

interface PostProcessPreset {
  name: string;
  effects: { type: string; settings: Record<string, any> }[];
}
```

**Dependencies:**
- Depends on: All post-process controllers
- Depended by: `Renderer`

**Implementation Checklist:**
- [ ] Effect ordering and insertion
- [ ] Enable/disable individual effects
- [ ] Preset system for quick configuration
- [ ] Effect-specific settings exposure
- [ ] **Tests:** Chain ordering, preset application

---

### 8.1.2 `src/postfx/AntiAliasingManager.ts`

**Role:** Manages anti-aliasing mode selection.

**Public API:**
```typescript
class AntiAliasingManager {
  // Mode selection
  setMode(mode: 'none' | 'fxaa' | 'smaa' | 'taa'): void;
  getMode(): string;

  // Per-mode settings
  setFXAAQuality(quality: 'low' | 'medium' | 'high'): void;
  setSMAAQuality(quality: 'low' | 'medium' | 'high' | 'ultra'): void;
  setTAASettings(settings: TAASettings): void;

  // Integration
  getActiveController(): FXAAController | SMAAController | TAAPassController | null;
}
```

**Implementation Checklist:**
- [ ] Mode switching at runtime
- [ ] Per-mode quality settings
- [ ] TAA jitter pattern integration
- [ ] Resource management on mode change

---

### 8.1.3 `src/postfx/ToneMappingController.ts`

**Role:** High-level tone mapping configuration.

**Public API:**
```typescript
class ToneMappingController {
  // Operators
  setOperator(operator: 'aces' | 'reinhard' | 'uncharted2' | 'agx' | 'neutral'): void;

  // Exposure
  exposure: number;
  autoExposure: boolean;
  adaptationSpeed: number;
  minExposure: number;
  maxExposure: number;

  // White balance
  temperature: number;
  tint: number;

  // Histogram
  getHistogram(): Float32Array;
  getAverageluminance(): number;
}
```

**Implementation Checklist:**
- [ ] Multiple tone mapping operators
- [ ] Auto-exposure via luminance histogram
- [ ] Smooth exposure adaptation
- [ ] White balance adjustment
- [ ] Histogram computation (GPU)

---

### 8.1.4 `src/postfx/LUTLoader.ts`

**Role:** Loads and manages color lookup tables.

**Public API:**
```typescript
class LUTLoader {
  static load(url: string): Promise<LUT>;
  static loadFromImage(image: HTMLImageElement): LUT;
  static createIdentity(size: number): LUT;
  static blend(lut1: LUT, lut2: LUT, factor: number): LUT;
}

interface LUT {
  texture: GPUTexture;
  size: number;
  name: string;
}
```

**Implementation Checklist:**
- [ ] Load from strip image (common format)
- [ ] Load from 3D texture file
- [ ] Identity LUT generation
- [ ] LUT blending for transitions
- [ ] sRGB/Linear handling

---

### 8.1.5 Controller Group Checklist

**All controller files must implement:**

- [ ] High-level API for pass configuration
- [ ] Sensible defaults
- [ ] Runtime parameter updates
- [ ] Quality presets where applicable
- [ ] Statistics/metrics exposure
- [ ] Integration with PostProcessChain

---

---

## Next Document

Continue to `PRD-Final-04-Physics-Simulation.md` for Physics and Simulation specifications.
