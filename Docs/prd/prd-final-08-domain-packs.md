# G3D 5.0 PRD – Part 8: Domain Packs

**Parent Document:** `PRD-Final-00-Overview.md`

---

## 18. Scientific Visualization

---

## 18.1 `src/scientific/` – Scientific Visualization

### Directory Structure

```
src/scientific/
├── field/
│   ├── FieldManager.ts
│   ├── FieldData.ts
│   ├── VectorFieldRenderer.ts
│   ├── ScalarFieldRenderer.ts
│   ├── StreamlineIntegrator.ts
│   ├── ParticleTracer.ts
│   ├── FieldProbe.ts
│   ├── FieldDataLoader.ts
│   ├── ColorMap.ts
│   └── MarchingCubesTables.ts
├── climate/
│   ├── ClimateSystem.ts
│   ├── ClimateGrid.ts
│   ├── TemperatureSimulator.ts
│   ├── PressureHumiditySimulator.ts
│   ├── WindSimulator.ts
│   ├── WeatherEventGenerator.ts
│   └── ClimateZone.ts
└── index.ts
```

---

### 18.1.1 `src/scientific/field/FieldManager.ts`

**Role:** Manages scientific field data visualization.

**Public API:**
```typescript
class FieldManager {
  // Data loading
  loadField(path: string, type: FieldType): Promise<FieldData>;
  unloadField(field: FieldData): void;

  // Visualization
  createVectorFieldVis(field: FieldData, config: VectorVisConfig): VectorFieldRenderer;
  createScalarFieldVis(field: FieldData, config: ScalarVisConfig): ScalarFieldRenderer;
  createStreamlines(field: FieldData, config: StreamlineConfig): StreamlineIntegrator;

  // Probing
  createProbe(field: FieldData): FieldProbe;

  // Update
  update(dt: number): void;
}

type FieldType = 'scalar3d' | 'vector3d' | 'scalar2d' | 'vector2d';
```

**Dependencies:**
- Depends on: Field rendering components
- Depended by: Scientific applications

**Implementation Checklist:**
- [ ] Field data loading (VTK, NetCDF, raw)
- [ ] Multiple visualization modes
- [ ] Interactive probing
- [ ] Time-varying data support
- [ ] **Tests:** Data loading, visualization

---

### 18.1.2 `src/scientific/field/VectorFieldRenderer.ts`

**Role:** Renders 3D vector fields.

**Public API:**
```typescript
class VectorFieldRenderer {
  // Configuration
  glyphType: 'arrow' | 'cone' | 'line' | 'hedgehog';
  glyphScale: number;
  colorMapping: ColorMap;
  densityReduction: number;  // Subsample factor

  // Rendering modes
  showGlyphs: boolean;
  showStreamlines: boolean;
  showParticles: boolean;

  // Update
  setData(field: FieldData): void;
  render(context: RenderContext): void;
}
```

**Implementation Checklist:**
- [ ] Arrow glyphs with direction/magnitude
- [ ] Color by magnitude or component
- [ ] Density reduction for large fields
- [ ] GPU instanced rendering
- [ ] **Performance:** 1M vectors @ 30 FPS

---

### 18.1.3 `src/scientific/field/StreamlineIntegrator.ts`

**Role:** Computes streamlines through vector fields.

**Public API:**
```typescript
class StreamlineIntegrator {
  // Configuration
  integrationMethod: 'euler' | 'rk2' | 'rk4';
  stepSize: number;
  maxSteps: number;
  seedStrategy: 'grid' | 'random' | 'custom';

  // Generation
  generateStreamlines(seedPoints?: Vector3[]): Streamline[];
  generateStreamsurface(seedCurve: Vector3[]): Mesh;

  // Rendering
  getLineMesh(): Mesh;
  getTubeMesh(radius: number): Mesh;
}

interface Streamline {
  points: Vector3[];
  magnitudes: number[];
  times: number[];
}
```

**Implementation Checklist:**
- [ ] Runge-Kutta integration
- [ ] Adaptive step size
- [ ] Seed point strategies
- [ ] Stream surface generation
- [ ] Tube rendering
- [ ] **Tests:** Integration accuracy

---

### 18.1.4 `src/scientific/field/ColorMap.ts`

**Role:** Scientific color mapping.

**Public API:**
```typescript
class ColorMap {
  // Built-in maps
  static readonly VIRIDIS: ColorMap;
  static readonly PLASMA: ColorMap;
  static readonly INFERNO: ColorMap;
  static readonly MAGMA: ColorMap;
  static readonly JET: ColorMap;
  static readonly RAINBOW: ColorMap;
  static readonly COOLWARM: ColorMap;

  // Custom
  static fromColors(colors: Color[], positions?: number[]): ColorMap;

  // Mapping
  map(value: number, min: number, max: number): Color;
  getTexture(): GPUTexture;
}
```

**Implementation Checklist:**
- [ ] Perceptually uniform color maps
- [ ] Diverging color maps
- [ ] Custom color map creation
- [ ] 1D texture for GPU sampling

---

### 18.1.5 `src/scientific/climate/ClimateSystem.ts`

**Role:** Climate simulation and visualization.

**Public API:**
```typescript
class ClimateSystem {
  // Grid
  readonly grid: ClimateGrid;

  // Simulation
  step(dt: number): void;
  setTimeScale(scale: number): void;

  // Data
  getTemperature(lat: number, lon: number): number;
  getPressure(lat: number, lon: number): number;
  getHumidity(lat: number, lon: number): number;
  getWindVector(lat: number, lon: number): Vector2;

  // Visualization
  getTemperatureTexture(): GPUTexture;
  getPressureTexture(): GPUTexture;
  getWindTexture(): GPUTexture;

  // Events
  getActiveWeatherEvents(): WeatherEvent[];
}
```

**Implementation Checklist:**
- [ ] Global climate grid
- [ ] Temperature simulation
- [ ] Pressure/wind dynamics
- [ ] Weather event generation
- [ ] **Performance:** 360x180 grid @ 60 FPS

---

---

## 19. Medical Imaging

---

## 19.1 `src/medical/` – Medical Imaging

### Directory Structure

```
src/medical/
├── VolumeData.ts
├── VolumeRenderer.ts
├── TransferFunction.ts
├── DICOMLoader.ts
├── MPRSlicer.ts
├── IsosurfaceExtractor.ts
├── MarchingCubesTable.ts
├── MedicalTools.ts
└── index.ts
```

---

### 19.1.1 `src/medical/VolumeRenderer.ts`

**Role:** GPU volume rendering for medical data.

**Public API:**
```typescript
class VolumeRenderer {
  // Data
  setVolume(volume: VolumeData): void;
  setTransferFunction(tf: TransferFunction): void;

  // Configuration
  stepSize: number;
  maxSteps: number;
  renderQuality: 'low' | 'medium' | 'high';

  // Rendering modes
  renderMode: 'dvr' | 'mip' | 'minip' | 'average';

  // Clipping
  setClipPlane(plane: Plane | null): void;
  setClipBox(box: Box3 | null): void;

  // Render
  render(context: RenderContext, camera: Camera): void;

  // Picking
  pick(screenX: number, screenY: number): VolumePick | null;
}

type RenderMode =
  | 'dvr'     // Direct volume rendering
  | 'mip'     // Maximum intensity projection
  | 'minip'   // Minimum intensity projection
  | 'average'; // Average intensity

interface VolumePick {
  worldPosition: Vector3;
  voxelPosition: [number, number, number];
  value: number;
}
```

**Dependencies:**
- Depends on: `VolumeData`, `TransferFunction`, compute/fragment shaders
- Depended by: Medical applications

**Implementation Checklist:**
- [ ] Ray marching volume rendering
- [ ] Transfer function application
- [ ] MIP/MinIP modes
- [ ] Clipping planes and boxes
- [ ] Early ray termination
- [ ] Pre-integrated transfer function
- [ ] **Performance:** 512³ volume @ 30 FPS
- [ ] **Tests:** Rendering modes, clipping

---

### 19.1.2 `src/medical/TransferFunction.ts`

**Role:** Maps scalar values to color and opacity.

**Public API:**
```typescript
class TransferFunction {
  // Control points
  addColorPoint(value: number, color: Color): void;
  addOpacityPoint(value: number, opacity: number): void;
  removePoint(index: number): void;
  clearPoints(): void;

  // Presets
  static createLinear(minColor: Color, maxColor: Color): TransferFunction;
  static createCT(): TransferFunction;    // CT Hounsfield units
  static createMRI(): TransferFunction;

  // Texture
  getTexture(): GPUTexture;  // 1D RGBA texture

  // Serialization
  toJSON(): TransferFunctionData;
  static fromJSON(data: TransferFunctionData): TransferFunction;
}
```

**Implementation Checklist:**
- [ ] Piecewise linear interpolation
- [ ] Separate color and opacity curves
- [ ] Medical imaging presets (CT, MRI)
- [ ] 1D texture generation
- [ ] Serialization

---

### 19.1.3 `src/medical/DICOMLoader.ts`

**Role:** Loads DICOM medical image files.

**Public API:**
```typescript
class DICOMLoader {
  // Loading
  static load(files: File[]): Promise<VolumeData>;
  static loadFromUrl(urls: string[]): Promise<VolumeData>;
  static loadSeries(directoryUrl: string): Promise<VolumeData>;

  // Metadata
  static readMetadata(file: File): Promise<DICOMMetadata>;
}

interface DICOMMetadata {
  patientName?: string;
  patientId?: string;
  studyDate?: Date;
  modality: string;           // CT, MRI, etc.
  sliceThickness: number;
  pixelSpacing: [number, number];
  windowCenter?: number;
  windowWidth?: number;
  rows: number;
  columns: number;
  sliceCount: number;
}
```

**Dependencies:**
- Depends on: DICOM parsing library
- Depended by: Medical applications

**Implementation Checklist:**
- [ ] DICOM file parsing
- [ ] Series sorting by slice location
- [ ] Window/level extraction
- [ ] Multi-frame support
- [ ] Compression handling (JPEG, RLE)
- [ ] **Tests:** Various DICOM files

---

### 19.1.4 `src/medical/MPRSlicer.ts`

**Role:** Multi-planar reconstruction (MPR) slicing.

**Public API:**
```typescript
class MPRSlicer {
  // Volume
  setVolume(volume: VolumeData): void;

  // Slice planes
  setAxialSlice(position: number): void;
  setSagittalSlice(position: number): void;
  setCoronalSlice(position: number): void;
  setObliqueSlice(origin: Vector3, normal: Vector3): void;

  // Rendering
  getAxialTexture(): GPUTexture;
  getSagittalTexture(): GPUTexture;
  getCoronalTexture(): GPUTexture;
  getObliqueTexture(): GPUTexture;

  // Measurements
  measureDistance(p1: Vector3, p2: Vector3): number;
  measureAngle(p1: Vector3, p2: Vector3, p3: Vector3): number;
}
```

**Implementation Checklist:**
- [ ] Axial/Sagittal/Coronal views
- [ ] Oblique arbitrary slicing
- [ ] Interpolated sampling
- [ ] Window/level adjustment
- [ ] Measurement tools

---

### 19.1.5 `src/medical/IsosurfaceExtractor.ts`

**Role:** Marching cubes isosurface extraction.

**Public API:**
```typescript
class IsosurfaceExtractor {
  // Extraction
  extract(volume: VolumeData, isovalue: number): Mesh;
  extractMultiple(volume: VolumeData, isovalues: number[]): Mesh[];

  // Configuration
  smoothNormals: boolean;
  decimation: number;        // 0-1, mesh simplification

  // GPU acceleration
  extractGPU(volume: VolumeData, isovalue: number): Promise<Mesh>;
}
```

**Implementation Checklist:**
- [ ] Classic marching cubes algorithm
- [ ] Lookup table optimization
- [ ] Normal smoothing
- [ ] Mesh decimation
- [ ] GPU compute path
- [ ] **Performance:** 512³ extraction < 2s

---

---

## 20. Architecture / BIM

---

## 20.1 `src/architecture/` – Architecture/BIM

### Directory Structure

```
src/architecture/
├── section/
│   ├── SectionManager.ts
│   ├── SectionFillGenerator.ts
│   ├── ClippingShaderController.ts
│   ├── HatchingGenerator.ts
│   ├── BIMMetadataDisplay.ts
│   ├── SectionPlane.ts
│   ├── SectionPlaneHelper.ts
│   ├── SectionConfig.ts
│   ├── SectionTypes.ts
│   └── index.ts
└── index.ts
```

---

### 20.1.1 `src/architecture/section/SectionManager.ts`

**Role:** Manages architectural section cuts.

**Public API:**
```typescript
class SectionManager {
  // Section planes
  createSectionPlane(config: SectionPlaneConfig): SectionPlane;
  destroySectionPlane(plane: SectionPlane): void;
  get activePlanes(): SectionPlane[];

  // Rendering
  enableSectionRendering(enabled: boolean): void;
  setSectionFill(material: Material): void;

  // Export
  exportSection(plane: SectionPlane, format: '2d' | 'svg' | 'dxf'): Promise<Blob>;
}

interface SectionPlaneConfig {
  origin: Vector3;
  normal: Vector3;
  showFill: boolean;
  showHatching: boolean;
  fillColor: Color;
  lineWeight: number;
}
```

**Dependencies:**
- Depends on: `SectionPlane`, `SectionFillGenerator`, `ClippingShaderController`
- Depended by: BIM applications

**Implementation Checklist:**
- [ ] Multiple section planes
- [ ] Real-time clipping
- [ ] Section fill rendering
- [ ] Hatching patterns
- [ ] 2D export (SVG, DXF)
- [ ] **Tests:** Clipping, export

---

### 20.1.2 `src/architecture/section/SectionFillGenerator.ts`

**Role:** Generates filled surfaces at section cuts.

**Public API:**
```typescript
class SectionFillGenerator {
  // Generation
  generateFill(meshes: Mesh[], plane: Plane): SectionFill;

  // Configuration
  capStyle: 'solid' | 'hatched' | 'none';
  hatchPattern: HatchPattern;
  hatchScale: number;
}

interface SectionFill {
  mesh: Mesh;           // Cap geometry
  outline: Vector3[];   // Section line
  islands: Vector3[][]; // Interior holes
}
```

**Implementation Checklist:**
- [ ] Mesh-plane intersection
- [ ] Contour extraction
- [ ] Triangulation of section
- [ ] Hole handling
- [ ] Hatching overlay

---

### 20.1.3 `src/architecture/section/BIMMetadataDisplay.ts`

**Role:** Displays BIM metadata on selection.

**Public API:**
```typescript
class BIMMetadataDisplay {
  // Selection
  selectElement(entity: Entity): void;
  clearSelection(): void;

  // Display
  showPanel(position: Vector2): void;
  hidePanel(): void;

  // Data
  getMetadata(entity: Entity): BIMMetadata | null;
  setMetadata(entity: Entity, metadata: BIMMetadata): void;
}

interface BIMMetadata {
  ifcClass: string;         // e.g., "IfcWall"
  globalId: string;
  name: string;
  description?: string;
  properties: Map<string, string | number>;
  quantities?: Map<string, number>;
}
```

**Implementation Checklist:**
- [ ] IFC class display
- [ ] Property listing
- [ ] Quantity display
- [ ] Custom property editing

---

---

## 21. XR (VR/AR)

---

## 21.1 `src/xr/` – XR System

### Directory Structure

```
src/xr/
├── XREngine.ts
├── XRSessionManager.ts
├── XRInputSystem.ts
├── foveated/
│   ├── EyeTracker.ts
│   ├── VariableRateShadingManager.ts
│   ├── MultiResolutionRenderer.ts
│   ├── GazeBasedLOD.ts
│   ├── FixedFoveatedRenderer.ts
│   ├── FoveatedRenderer.ts
│   └── index.ts
└── index.ts
```

---

### 21.1.1 `src/xr/XREngine.ts`

**Role:** Main XR integration layer.

**Public API:**
```typescript
class XREngine {
  // Session
  requestSession(mode: XRSessionMode): Promise<boolean>;
  endSession(): void;
  get isPresenting(): boolean;
  get sessionMode(): XRSessionMode | null;

  // Reference space
  setReferenceSpace(type: XRReferenceSpaceType): void;
  get referenceSpace(): XRReferenceSpace | null;

  // Rendering
  get leftEyeCamera(): Camera;
  get rightEyeCamera(): Camera;
  get framebuffer(): GPUTexture;

  // Input
  readonly input: XRInputSystem;

  // Foveated rendering
  readonly foveated: FoveatedRenderer;

  // Events
  onSessionStart: Signal<() => void>;
  onSessionEnd: Signal<() => void>;
  onVisibilityChange: Signal<(visible: boolean) => void>;
}

type XRSessionMode = 'inline' | 'immersive-vr' | 'immersive-ar';
```

**Dependencies:**
- Depends on: WebXR API, `XRSessionManager`, `XRInputSystem`, `FoveatedRenderer`
- Depended by: XR applications

**Implementation Checklist:**
- [ ] WebXR session management
- [ ] Stereo camera setup
- [ ] Reference space configuration
- [ ] Frame loop integration
- [ ] Layer support
- [ ] **Tests:** Session lifecycle

---

### 21.1.2 `src/xr/XRInputSystem.ts`

**Role:** XR controller and hand tracking input.

**Public API:**
```typescript
class XRInputSystem {
  // Controllers
  get leftController(): XRController | null;
  get rightController(): XRController | null;

  // Hand tracking
  get leftHand(): XRHand | null;
  get rightHand(): XRHand | null;
  handTrackingEnabled: boolean;

  // Events
  onSelectStart: Signal<(controller: XRController) => void>;
  onSelectEnd: Signal<(controller: XRController) => void>;
  onSqueezeStart: Signal<(controller: XRController) => void>;
  onSqueezeEnd: Signal<(controller: XRController) => void>;

  // Update
  update(frame: XRFrame): void;
}

interface XRController {
  handedness: 'left' | 'right';
  position: Vector3;
  rotation: Quaternion;
  gamepad: Gamepad | null;
  targetRaySpace: XRSpace;
  gripSpace: XRSpace;
}

interface XRHand {
  joints: Map<XRHandJoint, XRJointPose>;
  getPinchStrength(): number;
  getGripStrength(): number;
}
```

**Implementation Checklist:**
- [ ] Controller tracking
- [ ] Hand tracking (where supported)
- [ ] Gamepad button/axis mapping
- [ ] Ray and grip poses
- [ ] Haptic feedback
- [ ] **Tests:** Input events

---

### 21.1.3 `src/xr/foveated/FoveatedRenderer.ts`

**Role:** Foveated rendering for VR performance.

**Public API:**
```typescript
class FoveatedRenderer {
  // Mode
  mode: 'none' | 'fixed' | 'dynamic';

  // Fixed foveated
  fixedFoveationLevel: number;  // 0-4

  // Dynamic (eye-tracked)
  setGazePoint(point: Vector2): void;  // Normalized
  foveaRadius: number;
  peripheralDetail: number;

  // Integration
  applyToRenderGraph(graph: RenderGraph): void;

  // Statistics
  get pixelSavings(): number;  // Percentage reduction
}
```

**Implementation Checklist:**
- [ ] Fixed foveated rendering (ring-based)
- [ ] Dynamic gaze-based foveation
- [ ] Variable rate shading (where supported)
- [ ] Multi-resolution rendering fallback
- [ ] **Performance:** 30-50% pixel reduction

---

---

## 22. E-Commerce

---

## 22.1 `src/ecommerce/` – E-Commerce Features

### Directory Structure

```
src/ecommerce/
├── turntable/
│   ├── TurntableController.ts
│   ├── OrbitCamera.ts
│   ├── LightingPresetManager.ts
│   ├── HotspotManager.ts
│   ├── CaptureManager.ts
│   ├── ARExporter.ts
│   ├── BatchProcessor.ts
│   └── index.ts
└── index.ts
```

---

### 22.1.1 `src/ecommerce/turntable/TurntableController.ts`

**Role:** Product visualization turntable.

**Public API:**
```typescript
class TurntableController {
  // Configuration
  autoRotate: boolean;
  autoRotateSpeed: number;
  enableZoom: boolean;
  enablePan: boolean;
  minDistance: number;
  maxDistance: number;

  // Model
  setModel(model: Entity): void;
  fitToView(): void;

  // Interaction
  setRotation(yaw: number, pitch: number): void;
  setZoom(distance: number): void;

  // Animation
  rotateTo(yaw: number, pitch: number, duration: number): Promise<void>;
  zoomTo(distance: number, duration: number): Promise<void>;

  // Update
  update(dt: number): void;
}
```

**Dependencies:**
- Depends on: `OrbitCamera`, input system
- Depended by: Product viewers

**Implementation Checklist:**
- [ ] Smooth orbit controls
- [ ] Auto-rotation with pause on interaction
- [ ] Zoom limits
- [ ] Touch gesture support
- [ ] Animated transitions
- [ ] **Tests:** Interaction modes

---

### 22.1.2 `src/ecommerce/turntable/LightingPresetManager.ts`

**Role:** Lighting presets for product photography.

**Public API:**
```typescript
class LightingPresetManager {
  // Presets
  applyPreset(preset: LightingPreset): void;
  savePreset(name: string): LightingPreset;
  deletePreset(name: string): void;
  get presets(): LightingPreset[];

  // Built-in
  static readonly STUDIO: LightingPreset;
  static readonly OUTDOOR: LightingPreset;
  static readonly SOFT: LightingPreset;
  static readonly DRAMATIC: LightingPreset;
  static readonly PRODUCT: LightingPreset;
}

interface LightingPreset {
  name: string;
  environment: string;      // HDR environment map
  lights: LightConfig[];
  exposure: number;
  contrast: number;
}
```

**Implementation Checklist:**
- [ ] Preset definitions
- [ ] Smooth preset transitions
- [ ] Custom preset creation
- [ ] HDR environment switching

---

### 22.1.3 `src/ecommerce/turntable/HotspotManager.ts`

**Role:** Interactive hotspots on products.

**Public API:**
```typescript
class HotspotManager {
  // Hotspots
  addHotspot(config: HotspotConfig): Hotspot;
  removeHotspot(hotspot: Hotspot): void;
  get hotspots(): Hotspot[];

  // Interaction
  setHovered(hotspot: Hotspot | null): void;
  setSelected(hotspot: Hotspot | null): void;

  // Events
  onHotspotClick: Signal<(hotspot: Hotspot) => void>;
  onHotspotHover: Signal<(hotspot: Hotspot | null) => void>;

  // Update
  update(camera: Camera): void;
}

interface HotspotConfig {
  position: Vector3;
  label: string;
  description?: string;
  icon?: string;
  action?: () => void;
}

interface Hotspot {
  id: string;
  config: HotspotConfig;
  screenPosition: Vector2;
  visible: boolean;
  hovered: boolean;
  selected: boolean;
}
```

**Implementation Checklist:**
- [ ] 3D to 2D projection
- [ ] Visibility based on camera angle
- [ ] Hover/click detection
- [ ] Label rendering
- [ ] Occlusion handling

---

### 22.1.4 `src/ecommerce/turntable/CaptureManager.ts`

**Role:** Image and video capture for products.

**Public API:**
```typescript
class CaptureManager {
  // Screenshot
  captureImage(options?: CaptureOptions): Promise<Blob>;
  captureImageSequence(frames: number, rotation: number): Promise<Blob[]>;

  // Video
  startVideoCapture(options?: VideoOptions): void;
  stopVideoCapture(): Promise<Blob>;

  // 360° spin
  capture360(frameCount: number): Promise<Blob[]>;
}

interface CaptureOptions {
  width: number;
  height: number;
  format: 'png' | 'jpeg' | 'webp';
  quality: number;
  transparent: boolean;
}

interface VideoOptions {
  width: number;
  height: number;
  frameRate: number;
  bitrate: number;
  format: 'webm' | 'mp4';
}
```

**Implementation Checklist:**
- [ ] High-resolution screenshot
- [ ] Image sequence capture
- [ ] Video recording (MediaRecorder)
- [ ] 360° spin automation
- [ ] Transparent background support
- [ ] **Tests:** Output quality

---

### 22.1.5 `src/ecommerce/turntable/ARExporter.ts`

**Role:** Export models for AR viewing.

**Public API:**
```typescript
class ARExporter {
  // Export
  exportUSDZ(model: Entity, options?: USDZOptions): Promise<Blob>;
  exportGLB(model: Entity, options?: GLBOptions): Promise<Blob>;
  exportReality(model: Entity, options?: RealityOptions): Promise<Blob>;

  // AR Quick Look
  generateARQuickLookLink(usdzBlob: Blob): string;
}

interface USDZOptions {
  textureQuality: 'low' | 'medium' | 'high';
  includeAnimations: boolean;
}
```

**Implementation Checklist:**
- [ ] USDZ export for iOS
- [ ] GLB export for Android
- [ ] Texture optimization
- [ ] Animation inclusion
- [ ] AR Quick Look URL generation

---

---

## Next Document

Continue to `PRD-Final-09-Infrastructure.md` for Infrastructure specifications.
