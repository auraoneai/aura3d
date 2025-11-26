# G3D 5.0 PRD – Part 7: World Systems

**Parent Document:** `PRD-Final-00-Overview.md`

---

## 13. Terrain System

---

## 13.1 `src/terrain/` – Terrain System

### Directory Structure

```
src/terrain/
├── Terrain.ts
├── TerrainData.ts
├── TerrainRenderer.ts
├── TerrainMaterial.ts
├── generation/
│   ├── TerrainGenerator.ts
│   ├── NoiseGenerator.ts
│   ├── ErosionSimulator.ts
│   ├── BiomeGenerator.ts
│   └── RiverGenerator.ts
├── heightmap/
│   ├── Heightmap.ts
│   ├── HeightmapImporter.ts
│   ├── HeightmapExporter.ts
│   └── HeightmapTools.ts
├── texturing/
│   ├── TerrainTexturing.ts
│   ├── SplatMap.ts
│   ├── TextureArray.ts
│   ├── TriplanarMapping.ts
│   └── DetailTextures.ts
├── vegetation/
│   ├── VegetationSystem.ts
│   ├── GrassRenderer.ts
│   ├── TreePlacer.ts
│   ├── Instancing.ts
│   └── WindAnimation.ts
├── lod/
│   ├── TerrainLOD.ts
│   ├── ChunkedTerrain.ts
│   ├── QuadTree.ts
│   ├── GeometryClipmaps.ts
│   └── MeshSimplification.ts
├── collision/
│   ├── TerrainCollider.ts
│   ├── HeightQuery.ts
│   └── RaycastTerrain.ts
└── index.ts
```

---

### 13.1.1 `src/terrain/Terrain.ts`

**Role:** Main terrain management class.

**Public API:**
```typescript
class Terrain {
  // Configuration
  readonly config: TerrainConfig;

  // Lifecycle
  initialize(config: TerrainConfig): void;
  dispose(): void;

  // Height data
  setHeightmap(heightmap: Heightmap): void;
  getHeight(x: number, z: number): number;
  getNormal(x: number, z: number): Vector3;

  // Texturing
  setSplatmap(splatmap: SplatMap): void;
  setLayerTexture(index: number, texture: Texture, scale: number): void;

  // Modification
  raiseHeight(x: number, z: number, radius: number, amount: number): void;
  smoothHeight(x: number, z: number, radius: number): void;
  paintTexture(x: number, z: number, radius: number, layerIndex: number, opacity: number): void;

  // LOD
  update(cameraPosition: Vector3): void;

  // Physics
  createCollider(): TerrainCollider;
}

interface TerrainConfig {
  width: number;
  height: number;
  resolution: number;      // Heightmap resolution
  maxHeight: number;
  chunkSize: number;
  lodLevels: number;
  textureArraySize: number;
}
```

**Dependencies:**
- Depends on: `TerrainData`, `TerrainRenderer`, `TerrainLOD`
- Depended by: `TerrainSystem`, level loading

**Implementation Checklist:**
- [ ] Heightmap-based terrain
- [ ] Height queries with interpolation
- [ ] Normal calculation
- [ ] Runtime modification
- [ ] Multi-layer texturing
- [ ] LOD management
- [ ] Physics collider generation
- [ ] **Performance:** 4km² terrain @ 60 FPS
- [ ] **Tests:** Height queries, modification

---

### 13.1.2 `src/terrain/generation/TerrainGenerator.ts`

**Role:** Procedural terrain generation.

**Public API:**
```typescript
class TerrainGenerator {
  // Generation
  generate(config: GenerationConfig): Heightmap;
  generateAsync(config: GenerationConfig): Promise<Heightmap>;

  // Layers
  addNoiseLayer(noise: NoiseConfig, operation: 'add' | 'multiply' | 'max'): void;
  clearLayers(): void;

  // Post-processing
  applyErosion(erosion: ErosionConfig): void;
}

interface GenerationConfig {
  width: number;
  height: number;
  seed: number;
  baseHeight: number;
  noiseScale: number;
  octaves: number;
  persistence: number;
  lacunarity: number;
}
```

**Dependencies:**
- Depends on: `NoiseGenerator`, `ErosionSimulator`
- Depended by: `Terrain`, editor

**Implementation Checklist:**
- [ ] Multi-octave noise generation
- [ ] Noise layer stacking
- [ ] Domain warping
- [ ] Ridged noise variant
- [ ] Seed-based reproducibility
- [ ] **Performance:** 4096x4096 < 5s

---

### 13.1.3 `src/terrain/generation/ErosionSimulator.ts`

**Role:** Hydraulic and thermal erosion.

**Public API:**
```typescript
class ErosionSimulator {
  // Simulation
  simulateHydraulic(heightmap: Heightmap, config: HydraulicConfig): void;
  simulateThermal(heightmap: Heightmap, config: ThermalConfig): void;

  // GPU acceleration
  simulateHydraulicGPU(heightmap: Heightmap, config: HydraulicConfig): void;
}

interface HydraulicConfig {
  iterations: number;
  rainAmount: number;
  sedimentCapacity: number;
  erosionRate: number;
  depositionRate: number;
  evaporationRate: number;
}

interface ThermalConfig {
  iterations: number;
  talusAngle: number;    // Angle of repose
  erosionRate: number;
}
```

**Implementation Checklist:**
- [ ] Particle-based hydraulic erosion
- [ ] Thermal weathering
- [ ] Sediment transport
- [ ] GPU compute path
- [ ] **Performance:** 1M iterations < 10s (GPU)

---

### 13.1.4 `src/terrain/texturing/SplatMap.ts`

**Role:** Multi-layer terrain texture blending.

**Public API:**
```typescript
class SplatMap {
  readonly width: number;
  readonly height: number;
  readonly layers: number;  // Max 16

  // Access
  getWeight(x: number, y: number, layer: number): number;
  setWeight(x: number, y: number, layer: number, weight: number): void;
  normalizeWeights(x: number, y: number): void;

  // Texture
  getTexture(): GPUTexture;  // RGBA8 per 4 layers

  // Painting
  paint(x: number, y: number, radius: number, layer: number, strength: number): void;
}
```

**Implementation Checklist:**
- [ ] Up to 16 texture layers
- [ ] RGBA texture packing (4 layers per texture)
- [ ] Weight normalization
- [ ] Smooth painting brush
- [ ] Trilinear blending at borders

---

### 13.1.5 `src/terrain/vegetation/VegetationSystem.ts`

**Role:** Grass, trees, and vegetation rendering.

**Public API:**
```typescript
class VegetationSystem {
  // Configuration
  setDensity(density: number): void;
  setDrawDistance(distance: number): void;

  // Grass
  addGrassType(type: GrassType): void;
  setGrassDensityMap(texture: Texture): void;

  // Trees
  addTreeType(type: TreeType): void;
  placeTree(position: Vector3, type: string): void;
  removeTreesInRadius(position: Vector3, radius: number): void;

  // Update
  update(camera: Camera): void;

  // Rendering
  getInstanceBuffers(): { grass: GPUBuffer; trees: GPUBuffer };
}

interface GrassType {
  name: string;
  texture: Texture;
  width: number;
  height: number;
  swayAmount: number;
}

interface TreeType {
  name: string;
  mesh: Mesh;
  lod1Mesh?: Mesh;
  lod2Mesh?: Mesh;
  billboardTexture?: Texture;
}
```

**Dependencies:**
- Depends on: `Terrain`, `Instancing`, `WindAnimation`
- Depended by: `TerrainSystem`

**Implementation Checklist:**
- [ ] GPU instanced grass rendering
- [ ] Grass billboards with wind
- [ ] Tree placement with density maps
- [ ] Tree LOD (mesh → billboard)
- [ ] View frustum culling
- [ ] Distance-based density falloff
- [ ] **Performance:** 1M grass blades @ 60 FPS

---

### 13.1.6 `src/terrain/lod/GeometryClipmaps.ts`

**Role:** Clipmap-based terrain LOD.

**Public API:**
```typescript
class GeometryClipmaps {
  // Configuration
  readonly levels: number;
  readonly gridSize: number;

  // Update
  update(cameraPosition: Vector3): void;

  // Rendering
  getLevelMeshes(): ClipMapLevel[];
}

interface ClipMapLevel {
  level: number;
  mesh: Mesh;
  scale: number;
  offset: Vector2;
}
```

**Implementation Checklist:**
- [ ] Nested grid levels
- [ ] Smooth level transitions (skirts)
- [ ] GPU vertex morphing
- [ ] Efficient updates on camera move
- [ ] **Performance:** Seamless LOD transitions

---

### 13.1.7 `src/terrain/collision/TerrainCollider.ts`

**Role:** Physics collision for terrain.

**Public API:**
```typescript
class TerrainCollider {
  // Creation
  static fromHeightmap(heightmap: Heightmap, scale: Vector3): TerrainCollider;

  // Queries
  raycast(origin: Vector3, direction: Vector3, maxDistance: number): RaycastHit | null;
  getHeightAt(x: number, z: number): number;
  getNormalAt(x: number, z: number): Vector3;

  // Physics integration
  toPhysicsShape(): HeightfieldShape;
}
```

**Implementation Checklist:**
- [ ] Heightfield collision shape
- [ ] Efficient raycast (quadtree)
- [ ] Height interpolation
- [ ] Normal computation

---

---

## 14. Voxel System

---

## 14.1 `src/voxel/` – Voxel System

### Directory Structure

```
src/voxel/
├── VoxelWorld.ts
├── WorldChunk.ts
├── ChunkManager.ts
├── GreedyMesher.ts
├── VoxelCollision.ts
├── VoxelTypes.ts
├── TerrainGenerator.ts
├── OctreeLOD.ts
├── VoxelLighting.ts
├── VoxelDestructionSystem.ts
├── DestructionDebrisGenerator.ts
├── StabilityChecker.ts
├── ChunkRemesher.ts
└── index.ts
```

---

### 14.1.1 `src/voxel/VoxelWorld.ts`

**Role:** Main voxel world container.

**Public API:**
```typescript
class VoxelWorld {
  // Configuration
  readonly config: VoxelWorldConfig;

  // Lifecycle
  initialize(config: VoxelWorldConfig): void;
  dispose(): void;

  // Voxel access
  getVoxel(x: number, y: number, z: number): VoxelType;
  setVoxel(x: number, y: number, z: number, type: VoxelType): void;
  setVoxelBatch(changes: VoxelChange[]): void;

  // Chunks
  getChunk(cx: number, cy: number, cz: number): WorldChunk | undefined;
  loadChunk(cx: number, cy: number, cz: number): Promise<WorldChunk>;
  unloadChunk(cx: number, cy: number, cz: number): void;

  // Queries
  raycast(origin: Vector3, direction: Vector3, maxDistance: number): VoxelRaycastHit | null;
  getVoxelsInBox(box: Box3): VoxelData[];

  // Update
  update(cameraPosition: Vector3): void;
}

interface VoxelWorldConfig {
  chunkSize: number;       // Typically 16 or 32
  worldHeight: number;     // In chunks
  loadDistance: number;    // Chunks
  unloadDistance: number;
}

interface VoxelRaycastHit {
  position: Vector3;
  normal: Vector3;
  voxelPosition: [number, number, number];
  voxelType: VoxelType;
  distance: number;
}
```

**Dependencies:**
- Depends on: `ChunkManager`, `GreedyMesher`, `VoxelLighting`
- Depended by: `VoxelSystem`

**Implementation Checklist:**
- [ ] Infinite world support (chunk streaming)
- [ ] Voxel get/set with chunk mapping
- [ ] Batch modifications for performance
- [ ] Raycast through voxel grid
- [ ] Chunk loading/unloading
- [ ] **Performance:** 64 loaded chunks @ 60 FPS
- [ ] **Tests:** Voxel access, streaming

---

### 14.1.2 `src/voxel/WorldChunk.ts`

**Role:** Single chunk of voxel data.

**Public API:**
```typescript
class WorldChunk {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly size: number;

  // Data
  readonly voxels: Uint8Array;  // Flat array

  // Access
  getVoxel(lx: number, ly: number, lz: number): VoxelType;
  setVoxel(lx: number, ly: number, lz: number, type: VoxelType): void;

  // State
  isDirty: boolean;
  isEmpty: boolean;

  // Mesh
  mesh: Mesh | null;
  needsRemesh: boolean;

  // Serialization
  serialize(): ArrayBuffer;
  static deserialize(data: ArrayBuffer): WorldChunk;
}
```

**Implementation Checklist:**
- [ ] Flat array storage (size³)
- [ ] Local coordinate access
- [ ] Dirty flag for remeshing
- [ ] Empty chunk optimization
- [ ] Binary serialization

---

### 14.1.3 `src/voxel/GreedyMesher.ts`

**Role:** Efficient voxel mesh generation.

**Public API:**
```typescript
class GreedyMesher {
  // Meshing
  mesh(chunk: WorldChunk, neighbors: WorldChunk[]): MeshData;
  meshAsync(chunk: WorldChunk, neighbors: WorldChunk[]): Promise<MeshData>;

  // Configuration
  enableAO: boolean;        // Ambient occlusion
  enableGreedy: boolean;    // Greedy mesh optimization
}

interface MeshData {
  vertices: Float32Array;
  indices: Uint32Array;
  normals: Float32Array;
  uvs: Float32Array;
  colors?: Float32Array;    // Per-vertex AO
}
```

**Implementation Checklist:**
- [ ] Face culling (hidden faces)
- [ ] Greedy meshing (face merging)
- [ ] Per-vertex ambient occlusion
- [ ] Neighbor chunk boundary handling
- [ ] Multi-threaded meshing (Web Worker)
- [ ] **Performance:** 32³ chunk < 5ms

---

### 14.1.4 `src/voxel/VoxelLighting.ts`

**Role:** Voxel world lighting system.

**Public API:**
```typescript
class VoxelLighting {
  // Propagation
  propagateSunlight(world: VoxelWorld, chunk: WorldChunk): void;
  propagateTorchlight(world: VoxelWorld, position: Vector3, intensity: number): void;

  // Queries
  getLightLevel(x: number, y: number, z: number): number;
  getSkyLight(x: number, y: number, z: number): number;
  getTorchLight(x: number, y: number, z: number): number;
}
```

**Implementation Checklist:**
- [ ] Sunlight propagation (top-down)
- [ ] Torch light propagation (flood fill)
- [ ] Smooth lighting interpolation
- [ ] Light removal on block place
- [ ] **Performance:** Chunk lighting < 2ms

---

### 14.1.5 `src/voxel/VoxelDestructionSystem.ts`

**Role:** Voxel destruction and physics.

**Public API:**
```typescript
class VoxelDestructionSystem {
  // Destruction
  destroyVoxel(world: VoxelWorld, x: number, y: number, z: number): DestructionResult;
  destroyRadius(world: VoxelWorld, center: Vector3, radius: number): DestructionResult;
  explode(world: VoxelWorld, center: Vector3, power: number): DestructionResult;

  // Stability
  checkStability(world: VoxelWorld, region: Box3): UnstableRegion[];
}

interface DestructionResult {
  removedVoxels: VoxelData[];
  debris: DebrisData[];
  unstableRegions: UnstableRegion[];
}

interface DebrisData {
  position: Vector3;
  velocity: Vector3;
  voxelType: VoxelType;
  mesh: Mesh;
}
```

**Implementation Checklist:**
- [ ] Single voxel destruction
- [ ] Radius destruction
- [ ] Explosion with falloff
- [ ] Debris generation
- [ ] Structural stability check
- [ ] **Tests:** Destruction patterns

---

### 14.1.6 `src/voxel/StabilityChecker.ts`

**Role:** Structural stability for voxel buildings.

**Public API:**
```typescript
class StabilityChecker {
  // Analysis
  analyze(world: VoxelWorld, region: Box3): StabilityResult;

  // Configuration
  maxUnsupportedSpan: number;
  gravityStrength: number;
}

interface StabilityResult {
  stable: boolean;
  unsupportedVoxels: Vector3[];
  fallPredictions: FallPrediction[];
}

interface FallPrediction {
  region: Box3;
  fallDirection: Vector3;
  fallTime: number;
}
```

**Implementation Checklist:**
- [ ] Support propagation from ground
- [ ] Floating detection
- [ ] Collapse prediction
- [ ] Material strength consideration

---

---

## 15. Ocean System

---

## 15.1 `src/ocean/` – Ocean System

### Directory Structure

```
src/ocean/
├── OceanSystem.ts
├── OceanFFT.ts
├── PhillipsSpectrum.ts
├── WaveCascade.ts
├── OceanLOD.ts
├── QuadTree.ts
├── FoamRenderer.ts
├── GerstnerWaveSystem.ts
├── OceanMesh.ts
├── OceanRenderer.ts
├── OceanConfig.ts
└── index.ts
```

---

### 15.1.1 `src/ocean/OceanSystem.ts`

**Role:** Main ocean simulation and rendering.

**Public API:**
```typescript
class OceanSystem {
  // Configuration
  readonly config: OceanConfig;

  // Lifecycle
  initialize(config: OceanConfig): void;
  update(dt: number, cameraPosition: Vector3): void;
  dispose(): void;

  // State
  get displacementTexture(): GPUTexture;
  get normalTexture(): GPUTexture;
  get foamTexture(): GPUTexture;

  // Queries
  getHeightAt(x: number, z: number): number;
  getNormalAt(x: number, z: number): Vector3;
  getWaveVelocityAt(x: number, z: number): Vector3;

  // Buoyancy
  calculateBuoyancy(bounds: Box3, mass: number): BuoyancyResult;
}

interface OceanConfig {
  size: number;              // World size
  resolution: number;        // FFT resolution (256, 512, 1024)
  windSpeed: number;
  windDirection: Vector2;
  choppiness: number;
  waveScale: number;
  foamThreshold: number;
  cascadeCount: number;      // Detail levels (typically 3-4)
}

interface BuoyancyResult {
  force: Vector3;
  torque: Vector3;
  submergedVolume: number;
}
```

**Dependencies:**
- Depends on: `OceanFFT`, `WaveCascade`, `OceanLOD`, `FoamRenderer`
- Depended by: `OceanComponent`

**Implementation Checklist:**
- [ ] FFT-based wave simulation
- [ ] Multiple cascade levels (detail)
- [ ] Height and normal queries
- [ ] Buoyancy calculation
- [ ] Foam generation
- [ ] LOD-based mesh
- [ ] **Performance:** 1024 FFT @ 60 FPS
- [ ] **Tests:** Height accuracy, buoyancy

---

### 15.1.2 `src/ocean/OceanFFT.ts`

**Role:** FFT wave spectrum computation.

**Public API:**
```typescript
class OceanFFT {
  // Configuration
  readonly resolution: number;

  // Spectrum
  initializeSpectrum(spectrum: WaveSpectrum): void;
  updateSpectrum(time: number): void;

  // FFT
  computeFFT(): void;

  // Output
  get displacementMap(): GPUTexture;
  get normalMap(): GPUTexture;
  get foamMap(): GPUTexture;
}

interface WaveSpectrum {
  type: 'phillips' | 'jonswap' | 'pierson-moskowitz';
  windSpeed: number;
  windDirection: Vector2;
  fetch?: number;           // For JONSWAP
  spreadBlend?: number;
}
```

**Dependencies:**
- Depends on: `PhillipsSpectrum`, compute shaders
- Depended by: `OceanSystem`

**Implementation Checklist:**
- [ ] Initial spectrum generation
- [ ] Time-evolving complex amplitudes
- [ ] 2D FFT via compute shader
- [ ] Displacement X, Y, Z
- [ ] Normal from gradients
- [ ] Jacobian for foam
- [ ] **Performance:** 512² FFT < 2ms

---

### 15.1.3 `src/ocean/WaveCascade.ts`

**Role:** Multi-resolution wave detail.

**Public API:**
```typescript
class WaveCascade {
  readonly level: number;
  readonly scale: number;
  readonly fft: OceanFFT;

  // Update
  update(time: number): void;

  // Blending
  getBlendWeight(distance: number): number;
}
```

**Implementation Checklist:**
- [ ] Different frequency ranges per cascade
- [ ] Seamless blending between cascades
- [ ] LOD-based cascade selection

---

### 15.1.4 `src/ocean/GerstnerWaveSystem.ts`

**Role:** Simple Gerstner wave alternative.

**Public API:**
```typescript
class GerstnerWaveSystem {
  // Waves
  addWave(wave: GerstnerWave): void;
  removeWave(index: number): void;
  clearWaves(): void;

  // Evaluation
  getDisplacement(x: number, z: number, time: number): Vector3;
  getNormal(x: number, z: number, time: number): Vector3;
}

interface GerstnerWave {
  direction: Vector2;
  steepness: number;
  wavelength: number;
  speed: number;
}
```

**Implementation Checklist:**
- [ ] Multiple wave summation
- [ ] Configurable wave parameters
- [ ] Analytical displacement
- [ ] Faster than FFT (lower quality)

---

### 15.1.5 `src/ocean/FoamRenderer.ts`

**Role:** Ocean foam visualization.

**Public API:**
```typescript
class FoamRenderer {
  // Configuration
  foamTexture: Texture;
  foamIntensity: number;
  foamDissipation: number;

  // Update
  update(jacobianMap: GPUTexture, dt: number): void;

  // Output
  get foamMap(): GPUTexture;
}
```

**Implementation Checklist:**
- [ ] Jacobian-based foam generation
- [ ] Foam persistence and decay
- [ ] Shore foam enhancement
- [ ] Wake foam from objects

---

---

## 16. Weather System

---

## 16.1 `src/weather/` – Weather System

### Directory Structure

```
src/weather/
├── WeatherSystem.ts
├── WeatherState.ts
├── WeatherPreset.ts
├── WeatherTransition.ts
├── TimeOfDay.ts
├── RainSystem.ts
├── SnowSystem.ts
├── HailSystem.ts
├── WindField.ts
├── VolumetricFogSystem.ts
├── LightningSystem.ts
├── WetnessSystem.ts
├── RainShaderResources.ts
└── index.ts
```

---

### 16.1.1 `src/weather/WeatherSystem.ts`

**Role:** Central weather coordination.

**Public API:**
```typescript
class WeatherSystem {
  // State
  get currentWeather(): WeatherState;
  get targetWeather(): WeatherState | null;
  get transitionProgress(): number;

  // Control
  setWeather(preset: WeatherPreset, transitionTime?: number): void;
  setTimeOfDay(hours: number): void;

  // Components
  readonly rain: RainSystem;
  readonly snow: SnowSystem;
  readonly wind: WindField;
  readonly fog: VolumetricFogSystem;
  readonly lightning: LightningSystem;
  readonly wetness: WetnessSystem;

  // Update
  update(dt: number): void;

  // Events
  onWeatherChange: Signal<(from: WeatherState, to: WeatherState) => void>;
  onLightningStrike: Signal<(position: Vector3) => void>;
}
```

**Dependencies:**
- Depends on: All weather subsystems
- Depended by: `WeatherZoneComponent`

**Implementation Checklist:**
- [ ] Weather state management
- [ ] Smooth transitions between presets
- [ ] Time-of-day integration
- [ ] Component coordination
- [ ] Event dispatch
- [ ] **Tests:** Transitions, component sync

---

### 16.1.2 `src/weather/WeatherPreset.ts`

**Role:** Predefined weather configurations.

**Public API:**
```typescript
interface WeatherPreset {
  name: string;

  // Sky
  skyColor: Color;
  horizonColor: Color;
  sunIntensity: number;
  cloudCoverage: number;
  cloudSpeed: number;

  // Precipitation
  precipitationType: 'none' | 'rain' | 'snow' | 'hail';
  precipitationIntensity: number;

  // Atmosphere
  fogDensity: number;
  fogColor: Color;
  windSpeed: number;
  windDirection: Vector2;

  // Lighting
  ambientIntensity: number;
  lightningFrequency: number;  // Strikes per minute
}

const WeatherPresets = {
  CLEAR: WeatherPreset;
  CLOUDY: WeatherPreset;
  OVERCAST: WeatherPreset;
  LIGHT_RAIN: WeatherPreset;
  HEAVY_RAIN: WeatherPreset;
  THUNDERSTORM: WeatherPreset;
  LIGHT_SNOW: WeatherPreset;
  BLIZZARD: WeatherPreset;
  FOG: WeatherPreset;
};
```

**Implementation Checklist:**
- [ ] All preset definitions
- [ ] Custom preset creation
- [ ] Preset blending

---

### 16.1.3 `src/weather/RainSystem.ts`

**Role:** Rain particle simulation and rendering.

**Public API:**
```typescript
class RainSystem {
  // Configuration
  intensity: number;         // 0-1
  dropSize: number;
  windInfluence: number;

  // State
  enabled: boolean;

  // Update
  update(dt: number, cameraPosition: Vector3): void;

  // Rendering
  render(context: RenderContext): void;

  // Audio integration
  getIntensityForAudio(): number;
}
```

**Dependencies:**
- Depends on: `WindField`, particle system
- Depended by: `WeatherSystem`

**Implementation Checklist:**
- [ ] GPU particle rain
- [ ] Wind-affected falling
- [ ] Splash particles on impact
- [ ] View-frustum optimization
- [ ] Intensity variation
- [ ] **Performance:** 100k drops @ 60 FPS

---

### 16.1.4 `src/weather/WetnessSystem.ts`

**Role:** Surface wetness accumulation.

**Public API:**
```typescript
class WetnessSystem {
  // State
  globalWetness: number;     // 0-1

  // Update
  update(dt: number, precipitation: number, drying: number): void;

  // Material integration
  getWetnessAt(position: Vector3): number;
  getWetnessTexture(): GPUTexture;  // For shader sampling
}
```

**Implementation Checklist:**
- [ ] Wetness accumulation over time
- [ ] Drying based on conditions
- [ ] Per-surface wetness (exposed vs covered)
- [ ] Material darkening effect
- [ ] Puddle formation

---

### 16.1.5 `src/weather/LightningSystem.ts`

**Role:** Lightning bolt generation and effects.

**Public API:**
```typescript
class LightningSystem {
  // Configuration
  frequency: number;         // Strikes per minute
  flashIntensity: number;
  boltDuration: number;

  // Manual trigger
  strike(position?: Vector3): void;

  // State
  get isFlashing(): boolean;
  get currentBolt(): LightningBolt | null;

  // Update
  update(dt: number): void;
}

interface LightningBolt {
  start: Vector3;
  end: Vector3;
  branches: Vector3[][];
  intensity: number;
}
```

**Implementation Checklist:**
- [ ] Procedural bolt generation
- [ ] Branch fractal patterns
- [ ] Screen flash effect
- [ ] Thunder audio sync
- [ ] Random timing with frequency

---

### 16.1.6 `src/weather/TimeOfDay.ts`

**Role:** Day/night cycle management.

**Public API:**
```typescript
class TimeOfDay {
  // Time
  get hours(): number;       // 0-24
  get normalizedTime(): number;  // 0-1
  set hours(value: number);

  // Speed
  timeScale: number;         // Real-time multiplier

  // Sun/Moon
  get sunDirection(): Vector3;
  get moonDirection(): Vector3;
  get sunIntensity(): number;
  get moonIntensity(): number;

  // Colors
  get skyColor(): Color;
  get ambientColor(): Color;
  get fogColor(): Color;

  // Update
  update(dt: number): void;
}
```

**Implementation Checklist:**
- [ ] Continuous time progression
- [ ] Sun position calculation
- [ ] Moon phase support
- [ ] Color gradients for sky
- [ ] Configurable cycle duration

---

---

## 17. World Management

---

## 17.1 `src/world/` – World Management

### Directory Structure

```
src/world/
├── WorldManager.ts
├── Scene.ts
├── SceneLoader.ts
├── SceneGraph.ts
├── SpatialIndex.ts
├── Octree.ts
├── BVH.ts
├── WorldBounds.ts
├── PortalSystem.ts
├── LevelStreaming.ts
├── WorldPartition.ts
├── PrefabSystem.ts
├── PrefabInstance.ts
└── index.ts
```

---

### 17.1.1 `src/world/WorldManager.ts`

**Role:** High-level world coordination.

**Public API:**
```typescript
class WorldManager {
  // Scenes
  loadScene(scenePath: string): Promise<Scene>;
  unloadScene(scene: Scene): void;
  get activeScene(): Scene | null;
  get loadedScenes(): Scene[];

  // Streaming
  setStreamingOrigin(position: Vector3): void;
  get streamingProgress(): number;

  // Spatial queries
  queryBox(box: Box3): Entity[];
  querySphere(center: Vector3, radius: number): Entity[];
  queryFrustum(frustum: Frustum): Entity[];
  raycast(ray: Ray, maxDistance: number): RaycastHit[];

  // Prefabs
  instantiatePrefab(prefabId: string, position: Vector3, rotation?: Quaternion): Entity;
}
```

**Dependencies:**
- Depends on: `Scene`, `SceneLoader`, `SpatialIndex`, `LevelStreaming`, `PrefabSystem`
- Depended by: `Engine`, game systems

**Implementation Checklist:**
- [ ] Multi-scene support
- [ ] Async scene loading
- [ ] Spatial query acceleration
- [ ] Streaming coordination
- [ ] Prefab instantiation
- [ ] **Tests:** Scene lifecycle, queries

---

### 17.1.2 `src/world/SpatialIndex.ts`

**Role:** Spatial acceleration structure management.

**Public API:**
```typescript
class SpatialIndex {
  // Structure
  rebuild(entities: Entity[]): void;
  insert(entity: Entity, bounds: Box3): void;
  remove(entity: Entity): void;
  update(entity: Entity, newBounds: Box3): void;

  // Queries
  queryBox(box: Box3): Entity[];
  querySphere(center: Vector3, radius: number): Entity[];
  queryFrustum(frustum: Frustum): Entity[];
  queryRay(origin: Vector3, direction: Vector3, maxDistance: number): RaycastResult[];

  // Statistics
  get nodeCount(): number;
  get entityCount(): number;
}
```

**Implementation Checklist:**
- [ ] Octree or BVH backend
- [ ] Dynamic updates
- [ ] Efficient queries
- [ ] Rebuild on major changes
- [ ] **Performance:** 100k entities, query < 1ms

---

### 17.1.3 `src/world/LevelStreaming.ts`

**Role:** Streaming level loading/unloading.

**Public API:**
```typescript
class LevelStreaming {
  // Configuration
  streamingDistance: number;
  unloadDistance: number;

  // Cells
  registerCell(cell: StreamingCell): void;
  unregisterCell(cell: StreamingCell): void;

  // Update
  update(viewerPosition: Vector3): void;

  // State
  get loadingCells(): StreamingCell[];
  get loadedCells(): StreamingCell[];

  // Events
  onCellLoaded: Signal<(cell: StreamingCell) => void>;
  onCellUnloaded: Signal<(cell: StreamingCell) => void>;
}

interface StreamingCell {
  id: string;
  bounds: Box3;
  assetPath: string;
  priority: number;
  loaded: boolean;
}
```

**Implementation Checklist:**
- [ ] Distance-based loading
- [ ] Priority queue for loading order
- [ ] Async asset loading
- [ ] Smooth object spawning
- [ ] Memory budget management
- [ ] **Tests:** Streaming behavior

---

### 17.1.4 `src/world/PrefabSystem.ts`

**Role:** Prefab management and instantiation.

**Public API:**
```typescript
class PrefabSystem {
  // Registration
  registerPrefab(prefab: Prefab): void;
  unregisterPrefab(id: string): void;
  getPrefab(id: string): Prefab | undefined;

  // Instantiation
  instantiate(prefabId: string, parent?: Entity): Entity;
  instantiateAt(prefabId: string, position: Vector3, rotation?: Quaternion): Entity;

  // Pooling
  enablePooling(prefabId: string, poolSize: number): void;
  returnToPool(instance: Entity): void;
}

interface Prefab {
  id: string;
  name: string;
  entities: EntityData[];
  rootEntity: number;  // Index into entities
}
```

**Implementation Checklist:**
- [ ] Prefab definition format
- [ ] Recursive entity creation
- [ ] Component deserialization
- [ ] Object pooling support
- [ ] Nested prefab support
- [ ] **Tests:** Instantiation, pooling

---

---

## Next Document

Continue to `PRD-Final-08-Domain-Packs.md` for Domain Pack specifications.
