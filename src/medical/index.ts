/**
 * G3D Medical Imaging Module
 *
 * A comprehensive medical imaging toolkit for the G3D 5.0 game engine.
 * Provides GPU-accelerated volume rendering, DICOM loading, multi-planar
 * reconstruction, isosurface extraction, and measurement tools.
 *
 * @module medical
 * @version 5.0.0
 *
 * @example Basic Volume Rendering
 * ```typescript
 * import { DICOMLoader, VolumeRenderer, TransferFunction } from '@g3d/medical';
 *
 * // Load DICOM series
 * const loader = new DICOMLoader();
 * const volume = await loader.loadSeries(dicomFiles);
 *
 * // Create transfer function
 * const tf = TransferFunction.preset('CT_BONE');
 *
 * // Setup renderer
 * const renderer = new VolumeRenderer(gl);
 * renderer.setVolume(volume);
 * renderer.setTransferFunction(tf);
 * renderer.setRenderMode('DVR');
 *
 * // Render
 * const camera = {
 *   position: [0, 0, -500],
 *   target: [0, 0, 0],
 *   up: [0, 1, 0],
 *   fov: Math.PI / 4,
 *   aspect: canvas.width / canvas.height,
 *   near: 0.1,
 *   far: 1000
 * };
 * renderer.render(camera);
 * ```
 *
 * @example Multi-Planar Reconstruction
 * ```typescript
 * import { MPRSlicer } from '@g3d/medical';
 *
 * const slicer = new MPRSlicer(volume);
 * slicer.setInterpolationMode('linear');
 *
 * // Get orthogonal slices
 * const axialSlice = slicer.getSlice('axial', 128);
 * const sagittalSlice = slicer.getSlice('sagittal', 256);
 * const coronalSlice = slicer.getSlice('coronal', 256);
 *
 * // Get oblique slice
 * const obliqueSlice = slicer.getObliqueSlice(
 *   [128, 128, 128],  // origin
 *   [0.707, 0.707, 0], // normal
 *   512, 512,          // dimensions
 *   [1, 1]             // spacing
 * );
 *
 * // Convert to displayable image
 * const rgba = slicer.toRGBA(axialSlice, 400, 1000);
 * ```
 *
 * @example Isosurface Extraction
 * ```typescript
 * import { IsosurfaceExtractor } from '@g3d/medical';
 *
 * const extractor = new IsosurfaceExtractor(volume);
 *
 * // Extract bone surface (CT)
 * const boneMesh = extractor.extract(500, {
 *   smoothNormals: true,
 *   useGradientNormals: true
 * });
 *
 * console.log(`Generated ${boneMesh.triangleCount} triangles`);
 * console.log(`Vertices: ${boneMesh.vertexCount}`);
 *
 * // Use mesh for rendering
 * const geometry = new THREE.BufferGeometry();
 * geometry.setAttribute('position', new THREE.BufferAttribute(boneMesh.vertices, 3));
 * geometry.setAttribute('normal', new THREE.BufferAttribute(boneMesh.normals, 3));
 * geometry.setIndex(new THREE.BufferAttribute(boneMesh.indices, 1));
 * ```
 *
 * @example Medical Measurements
 * ```typescript
 * import { MedicalTools } from '@g3d/medical';
 *
 * const tools = new MedicalTools(volume);
 *
 * // Distance measurement
 * const distId = tools.createDistanceMeasurement(
 *   [100, 100, 50],
 *   [150, 150, 50],
 *   'Lesion diameter'
 * );
 *
 * // Angle measurement
 * const angleId = tools.createAngleMeasurement(
 *   [128, 128, 64], // vertex
 *   [100, 128, 64], // point1
 *   [128, 100, 64], // point2
 *   'Joint angle'
 * );
 *
 * // ROI statistics
 * const roiId = tools.createROI(
 *   [[100, 100], [150, 100], [150, 150], [100, 150]],
 *   64,
 *   'Tumor ROI'
 * );
 *
 * const roi = tools.getAnnotation(roiId);
 * console.log(`Mean HU: ${roi.statistics?.mean}`);
 * console.log(`Std Dev: ${roi.statistics?.std}`);
 * console.log(`Area: ${roi.statistics?.area} mm²`);
 * ```
 *
 * @example Custom Transfer Function
 * ```typescript
 * import { TransferFunction } from '@g3d/medical';
 *
 * // Create custom transfer function
 * const tf = new TransferFunction(-1024, 3071);
 *
 * // Add control points
 * tf.addControlPoint(-1024, [0, 0, 0, 0]);     // Air - transparent
 * tf.addControlPoint(-500, [0.5, 0.3, 0.2, 0]); // Fat - transparent
 * tf.addControlPoint(0, [0.8, 0.6, 0.5, 0.3]);  // Soft tissue
 * tf.addControlPoint(500, [1.0, 0.9, 0.8, 0.8]); // Bone
 * tf.addControlPoint(3071, [1.0, 1.0, 1.0, 1.0]); // Max
 *
 * // Enable gradient opacity
 * tf.setGradientOpacity(true, 0.5);
 *
 * // Generate texture for GPU
 * const texture = tf.generateTexture(256);
 * ```
 *
 * @example Slab MIP
 * ```typescript
 * import { MPRSlicer } from '@g3d/medical';
 *
 * const slicer = new MPRSlicer(volume);
 *
 * // Maximum Intensity Projection with 5mm slab
 * const mipSlice = slicer.getSlice('axial', 128, {
 *   thickness: 5,
 *   mode: 'MIP'
 * });
 *
 * // Average intensity projection
 * const avgSlice = slicer.getSlice('axial', 128, {
 *   thickness: 3,
 *   mode: 'AVERAGE'
 * });
 * ```
 *
 * @example Performance Optimization
 * ```typescript
 * import { VolumeRenderer } from '@g3d/medical';
 *
 * const renderer = new VolumeRenderer(gl);
 *
 * // Optimize for performance
 * renderer.setSettings({
 *   stepSize: 0.01,           // Larger steps = faster but lower quality
 *   alphaThreshold: 0.95,     // Early ray termination threshold
 *   enableShading: true,      // Disable for speed
 *   ambientLight: 0.3,
 *   diffuseLight: 0.6,
 *   specularLight: 0.3,
 *   shininess: 32.0,
 *   lightDirection: [0.5, 0.5, 1.0]
 * });
 *
 * // Use MIP for faster preview
 * renderer.setRenderMode('MIP');
 * ```
 */

// Core volume data structures
export { VolumeData } from './VolumeData';
export type { VoxelType, VolumeMetadata } from './VolumeData';

// Transfer function for volume rendering
export {
  TransferFunction
} from './TransferFunction';
export type {
  ControlPoint,
  TransferFunctionPreset
} from './TransferFunction';

// GPU-accelerated volume renderer
export {
  VolumeRenderer
} from './VolumeRenderer';
export type {
  RenderMode,
  Camera,
  RenderSettings
} from './VolumeRenderer';

// DICOM file loading
export {
  DICOMLoader
} from './DICOMLoader';
export type {
  DICOMTag,
  DICOMImage
} from './DICOMLoader';

// Multi-planar reconstruction
export {
  MPRSlicer
} from './MPRSlicer';
export type {
  SliceOrientation,
  InterpolationMode,
  SliceData,
  SlabSettings
} from './MPRSlicer';

// Isosurface extraction (Marching Cubes)
export {
  IsosurfaceExtractor
} from './IsosurfaceExtractor';
export type {
  MeshGeometry,
  ExtractOptions
} from './IsosurfaceExtractor';

// Marching cubes lookup tables
export {
  EDGE_TABLE,
  TRIANGLE_TABLE,
  EDGE_VERTICES,
  CUBE_VERTICES
} from './MarchingCubesTable';

// Medical measurement and annotation tools
export {
  MedicalTools
} from './MedicalTools';
export type {
  Point2D,
  Point3D,
  Measurement,
  ROIStatistics,
  Annotation
} from './MedicalTools';

/**
 * Module version
 */
export const VERSION = '5.0.0';

/**
 * Module metadata
 */
export const METADATA = {
  name: 'G3D Medical Imaging',
  version: VERSION,
  description: 'Advanced medical imaging toolkit for G3D 5.0',
  features: [
    'GPU-accelerated volume rendering (512³ @ 30 FPS)',
    'DICOM Part 10 file loading',
    'Multi-planar reconstruction (MPR)',
    'Isosurface extraction (Marching Cubes)',
    'Medical measurement tools',
    'Transfer function presets',
    'WebGL2 3D texture support'
  ],
  performance: {
    volumeRendering: '512³ @ 30 FPS',
    isosurfaceExtraction: '256³ < 2 seconds',
    dicomLoading: 'Multi-threaded parsing'
  }
};
