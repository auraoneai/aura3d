# G3D Medical Imaging Module

A comprehensive, production-ready medical imaging toolkit for the G3D 5.0 game engine. This module provides GPU-accelerated volume rendering, DICOM loading, multi-planar reconstruction, isosurface extraction, and medical measurement tools.

## Features

- **GPU-Accelerated Volume Rendering**: 512³ volumes @ 30 FPS
- **DICOM Part 10 Support**: Load and parse medical imaging files
- **Multi-Planar Reconstruction (MPR)**: Extract orthogonal and oblique slices
- **Isosurface Extraction**: Marching cubes algorithm (256³ < 2s)
- **Medical Measurement Tools**: Distance, angle, area, ROI statistics
- **Transfer Function Presets**: CT Bone, Soft Tissue, MRI Brain, Angio, Cardiac
- **WebGL2 3D Textures**: High-performance GPU rendering
- **Multiple Render Modes**: DVR, MIP, MinIP, Average

## Installation

```bash
npm install @g3d/medical
```

## Quick Start

### Basic Volume Rendering

```typescript
import { DICOMLoader, VolumeRenderer, TransferFunction } from '@g3d/medical';

// Load DICOM series
const loader = new DICOMLoader();
const volume = await loader.loadSeries(dicomFiles);

// Create transfer function
const tf = TransferFunction.preset('CT_BONE');

// Setup renderer
const renderer = new VolumeRenderer(gl);
renderer.setVolume(volume);
renderer.setTransferFunction(tf);
renderer.setRenderMode('DVR');

// Render
const camera = {
  position: [0, 0, -500],
  target: [0, 0, 0],
  up: [0, 1, 0],
  fov: Math.PI / 4,
  aspect: canvas.width / canvas.height,
  near: 0.1,
  far: 1000
};

renderer.render(camera);
```

### Multi-Planar Reconstruction

```typescript
import { MPRSlicer } from '@g3d/medical';

const slicer = new MPRSlicer(volume);
slicer.setInterpolationMode('linear');

// Get orthogonal slices
const axialSlice = slicer.getSlice('axial', 128);
const sagittalSlice = slicer.getSlice('sagittal', 256);
const coronalSlice = slicer.getSlice('coronal', 256);

// Convert to displayable image
const rgba = slicer.toRGBA(axialSlice, 400, 1000);
```

### Isosurface Extraction

```typescript
import { IsosurfaceExtractor } from '@g3d/medical';

const extractor = new IsosurfaceExtractor(volume);

// Extract bone surface (CT)
const boneMesh = extractor.extract(500, {
  smoothNormals: true,
  useGradientNormals: true
});

console.log(`Generated ${boneMesh.triangleCount} triangles`);
```

### Medical Measurements

```typescript
import { MedicalTools } from '@g3d/medical';

const tools = new MedicalTools(volume);

// Distance measurement
const distId = tools.createDistanceMeasurement(
  [100, 100, 50],
  [150, 150, 50],
  'Lesion diameter'
);

// ROI statistics
const roiId = tools.createROI(
  [[100, 100], [150, 100], [150, 150], [100, 150]],
  64,
  'Tumor ROI'
);

const roi = tools.getAnnotation(roiId);
console.log(`Mean HU: ${roi.statistics?.mean}`);
console.log(`Area: ${roi.statistics?.area} mm²`);
```

## API Reference

### VolumeData

3D volumetric data container with voxel access and manipulation.

```typescript
const volume = new VolumeData(512, 512, 200, 'Uint16');
volume.setSpacing(0.5, 0.5, 1.0); // mm
volume.setVoxel(100, 100, 50, 1500);
const value = volume.getVoxel(100, 100, 50);
const gradient = volume.getGradient(100, 100, 50);
```

**Key Methods:**
- `getVoxel(x, y, z)`: Get voxel value
- `setVoxel(x, y, z, value)`: Set voxel value
- `getVoxelInterpolated(x, y, z)`: Trilinear interpolation
- `getSlice(axis, index)`: Extract 2D slice
- `getGradient(x, y, z)`: Calculate gradient
- `setSpacing(x, y, z)`: Set voxel spacing
- `setWindow(center, width)`: Set display window

### TransferFunction

Maps scalar values to RGBA colors for volume rendering.

```typescript
// Use preset
const tf = TransferFunction.preset('CT_BONE');

// Or create custom
const tf = new TransferFunction(-1024, 3071);
tf.addControlPoint(-1024, [0, 0, 0, 0]);
tf.addControlPoint(500, [1, 0.9, 0.8, 0.8]);
tf.setGradientOpacity(true, 0.5);

// Generate GPU texture
const texture = tf.generateTexture(256);
```

**Presets:**
- `CT_BONE`: Bone visualization
- `CT_SOFT_TISSUE`: Soft tissue
- `MRI_BRAIN`: Brain imaging
- `CT_ANGIO`: Angiography
- `CT_CARDIAC`: Cardiac imaging

### VolumeRenderer

GPU-accelerated volume rendering with WebGL2.

```typescript
const renderer = new VolumeRenderer(gl);
renderer.setVolume(volume);
renderer.setTransferFunction(tf);
renderer.setRenderMode('DVR');

renderer.setSettings({
  stepSize: 0.005,
  alphaThreshold: 0.95,
  enableShading: true,
  ambientLight: 0.3,
  diffuseLight: 0.6,
  specularLight: 0.3,
  shininess: 32.0,
  lightDirection: [0.5, 0.5, 1.0]
});

renderer.render(camera);
```

**Render Modes:**
- `DVR`: Direct Volume Rendering
- `MIP`: Maximum Intensity Projection
- `MinIP`: Minimum Intensity Projection
- `AVERAGE`: Average Intensity

### DICOMLoader

Load and parse DICOM Part 10 files.

```typescript
const loader = new DICOMLoader();

// Load single file
const image = await loader.loadFile(file);

// Load series
const volume = await loader.loadSeries(fileArray);

// Access metadata
const metadata = volume.getMetadata();
console.log(metadata.patientName);
console.log(metadata.modality);
```

**Supported:**
- DICOM Part 10 format
- Uncompressed pixel data
- Multi-frame images
- Rescale slope/intercept
- Window/level settings
- Pixel spacing and orientation

### MPRSlicer

Multi-planar reconstruction with various interpolation modes.

```typescript
const slicer = new MPRSlicer(volume);
slicer.setInterpolationMode('linear');

// Orthogonal slices
const axial = slicer.getSlice('axial', 128);
const sagittal = slicer.getSlice('sagittal', 256);
const coronal = slicer.getSlice('coronal', 256);

// Oblique slice
const oblique = slicer.getObliqueSlice(
  [128, 128, 128],  // origin
  [0.707, 0.707, 0], // normal
  512, 512,          // dimensions
  [1, 1]             // spacing
);

// Slab MIP
const mip = slicer.getSlice('axial', 128, {
  thickness: 5,
  mode: 'MIP'
});

// Convert to RGBA
const rgba = slicer.toRGBA(axial, 400, 1000);
```

**Interpolation Modes:**
- `nearest`: Nearest neighbor
- `linear`: Trilinear interpolation
- `cubic`: Bicubic interpolation

### IsosurfaceExtractor

Marching cubes isosurface extraction.

```typescript
const extractor = new IsosurfaceExtractor(volume);

const mesh = extractor.extract(500, {
  smoothNormals: true,
  useGradientNormals: true,
  bounds: {
    minX: 0, maxX: 512,
    minY: 0, maxY: 512,
    minZ: 0, maxZ: 200
  }
});

// Simplify mesh
const simplified = extractor.simplify(mesh, 0.5);

// Extract multiple isovalues
const meshes = extractor.extractMultiple([300, 500, 700]);
```

### MedicalTools

Measurement and annotation tools.

```typescript
const tools = new MedicalTools(volume);

// Distance
const distance = tools.measureDistance([0, 0, 0], [10, 10, 10]);

// Angle
const angle = tools.measureAngle(
  [128, 128, 64], // vertex
  [100, 128, 64], // point1
  [128, 100, 64]  // point2
);

// Area
const area = tools.measureArea(
  [[0, 0], [10, 0], [10, 10], [0, 10]],
  64
);

// Hounsfield Unit
const hu = tools.getHounsfieldUnit([128, 128, 64]);

// ROI Statistics
const stats = tools.calculateROIStats(polygon, 64, true);
console.log(stats.mean, stats.std, stats.median);
console.log(stats.histogram);

// Annotations
const id = tools.createDistanceMeasurement([0, 0, 0], [10, 10, 10], 'Label');
const annotation = tools.getAnnotation(id);

// Export/Import
const json = tools.exportAnnotations();
tools.importAnnotations(json);
```

## Performance

- **Volume Rendering**: 512³ @ 30 FPS (WebGL2)
- **Isosurface Extraction**: 256³ < 2 seconds
- **DICOM Loading**: Multi-threaded parsing
- **MPR Slicing**: Real-time for 512³ volumes

## Architecture

```
medical/
├── VolumeData.ts           - 3D volume data container
├── TransferFunction.ts     - Color/opacity mapping
├── VolumeRenderer.ts       - GPU ray marching renderer
├── DICOMLoader.ts          - DICOM Part 10 parser
├── MPRSlicer.ts            - Multi-planar reconstruction
├── IsosurfaceExtractor.ts  - Marching cubes algorithm
├── MarchingCubesTable.ts   - Lookup tables
├── MedicalTools.ts         - Measurement tools
└── index.ts                - Module exports
```

## Technical Details

### Volume Rendering Pipeline

1. **Volume Upload**: 3D texture upload to GPU (WebGL2)
2. **Transfer Function**: 1D texture for color/opacity lookup
3. **Ray Marching**: Front-to-back compositing with early termination
4. **Gradient Shading**: Phong lighting with gradient normals
5. **Frame Output**: RGBA framebuffer

### Marching Cubes

1. **Cube Processing**: Iterate through volume grid
2. **Vertex Classification**: Inside/outside based on isovalue
3. **Edge Interpolation**: Linear interpolation for vertex positions
4. **Normal Calculation**: Gradient-based or face normals
5. **Mesh Generation**: Triangle list with normals

### DICOM Parsing

1. **File Reading**: ArrayBuffer input
2. **Tag Parsing**: Group/element tag extraction
3. **VR Detection**: Explicit/implicit value representation
4. **Pixel Data**: TypedArray extraction with rescale
5. **Volume Construction**: 3D volume assembly from series

## Examples

See the `examples/` directory for complete working examples:

- `basic-rendering.ts`: Simple volume rendering
- `mpr-viewer.ts`: Multi-planar viewer
- `surface-extraction.ts`: Isosurface visualization
- `measurements.ts`: Measurement tools
- `dicom-viewer.ts`: Complete DICOM viewer

## Requirements

- WebGL2 support
- TypeScript 4.0+
- Modern browser with 3D texture support

## License

MIT License - see LICENSE file for details

## Credits

Created for G3D 5.0 game engine.

Based on:
- Marching Cubes algorithm by Lorensen & Cline (1987)
- DICOM standard (NEMA)
- WebGL2 3D textures specification
