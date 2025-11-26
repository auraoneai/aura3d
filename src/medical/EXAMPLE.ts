/**
 * EXAMPLE.ts - Comprehensive Medical Imaging Module Usage Examples
 *
 * This file demonstrates the complete workflow of the G3D Medical Imaging module,
 * from loading DICOM files to rendering volumes, extracting surfaces, and
 * performing measurements.
 */

import {
  VolumeData,
  VolumeRenderer,
  DICOMLoader,
  TransferFunction,
  MPRSlicer,
  IsosurfaceExtractor,
  MedicalTools,
  Camera
} from './index';

// ============================================================================
// Example 1: Basic DICOM Loading and Volume Rendering
// ============================================================================

async function example1_BasicVolumeRendering(
  gl: WebGL2RenderingContext,
  dicomFiles: File[]
): Promise<void> {
  console.log('Example 1: Basic Volume Rendering');

  // Step 1: Load DICOM series
  const loader = new DICOMLoader();
  const volume = await loader.loadSeries(dicomFiles);

  console.log(`Loaded volume: ${volume.getWidth()}x${volume.getHeight()}x${volume.getDepth()}`);
  console.log(`Spacing: ${volume.getSpacing()}`);
  console.log(`Metadata:`, volume.getMetadata());

  // Step 2: Create transfer function for CT bone visualization
  const tf = TransferFunction.preset('CT_BONE');

  // Step 3: Initialize renderer
  const renderer = new VolumeRenderer(gl);
  renderer.setVolume(volume);
  renderer.setTransferFunction(tf);
  renderer.setRenderMode('DVR');

  // Step 4: Configure render settings
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

  // Step 5: Setup camera
  const camera: Camera = {
    position: [0, 0, -500],
    target: [0, 0, 0],
    up: [0, 1, 0],
    fov: Math.PI / 4,
    aspect: 1.0,
    near: 0.1,
    far: 1000
  };

  // Step 6: Render
  renderer.render(camera);

  console.log('Rendering complete!');
}

// ============================================================================
// Example 2: Multi-Planar Reconstruction (MPR)
// ============================================================================

async function example2_MPRViewer(
  volume: VolumeData
): Promise<void> {
  console.log('Example 2: Multi-Planar Reconstruction');

  // Create MPR slicer
  const slicer = new MPRSlicer(volume);
  slicer.setInterpolationMode('linear');

  const [width, height, depth] = volume.getDimensions();

  // Get orthogonal slices at center
  const axialSlice = slicer.getSlice('axial', Math.floor(depth / 2));
  const sagittalSlice = slicer.getSlice('sagittal', Math.floor(width / 2));
  const coronalSlice = slicer.getSlice('coronal', Math.floor(height / 2));

  console.log(`Axial slice: ${axialSlice.width}x${axialSlice.height}`);
  console.log(`Sagittal slice: ${sagittalSlice.width}x${sagittalSlice.height}`);
  console.log(`Coronal slice: ${coronalSlice.width}x${coronalSlice.height}`);

  // Convert slices to RGBA for display
  const [windowCenter, windowWidth] = volume.getWindow();
  const axialRGBA = slicer.toRGBA(axialSlice, windowCenter, windowWidth);
  const sagittalRGBA = slicer.toRGBA(sagittalSlice, windowCenter, windowWidth);
  const coronalRGBA = slicer.toRGBA(coronalSlice, windowCenter, windowWidth);

  // Get oblique slice
  const obliqueSlice = slicer.getObliqueSlice(
    [width / 2, height / 2, depth / 2], // origin at center
    [0.707, 0.707, 0],                  // 45-degree rotation
    512,                                 // width
    512,                                 // height
    [1, 1]                              // pixel spacing
  );

  console.log(`Oblique slice: ${obliqueSlice.width}x${obliqueSlice.height}`);

  // MIP slab rendering
  const mipSlab = slicer.getSlice('axial', Math.floor(depth / 2), {
    thickness: 10,
    mode: 'MIP'
  });

  console.log('MPR slicing complete!');
}

// ============================================================================
// Example 3: Isosurface Extraction (Marching Cubes)
// ============================================================================

async function example3_IsosurfaceExtraction(
  volume: VolumeData
): Promise<void> {
  console.log('Example 3: Isosurface Extraction');

  const extractor = new IsosurfaceExtractor(volume);

  // Extract bone surface at HU 500
  console.log('Extracting bone surface...');
  const startTime = performance.now();

  const boneMesh = extractor.extract(500, {
    smoothNormals: true,
    useGradientNormals: true
  });

  const extractTime = performance.now() - startTime;

  console.log(`Extraction time: ${extractTime.toFixed(2)}ms`);
  console.log(`Vertices: ${boneMesh.vertexCount}`);
  console.log(`Triangles: ${boneMesh.triangleCount}`);
  console.log(`Vertex buffer size: ${boneMesh.vertices.byteLength / 1024}KB`);
  console.log(`Normal buffer size: ${boneMesh.normals.byteLength / 1024}KB`);

  // Extract multiple surfaces
  const isovalues = [300, 500, 700]; // Different tissue densities
  const meshes = extractor.extractMultiple(isovalues);

  console.log(`Extracted ${meshes.length} surfaces`);

  // Simplify mesh for LOD
  const simplifiedMesh = extractor.simplify(boneMesh, 0.5);
  console.log(`Simplified to ${simplifiedMesh.triangleCount} triangles`);
}

// ============================================================================
// Example 4: Medical Measurements and Annotations
// ============================================================================

async function example4_MedicalMeasurements(
  volume: VolumeData
): Promise<void> {
  console.log('Example 4: Medical Measurements');

  const tools = new MedicalTools(volume);

  // Distance measurement (e.g., lesion diameter)
  const point1: [number, number, number] = [100, 100, 50];
  const point2: [number, number, number] = [150, 150, 50];
  const distance = tools.measureDistance(point1, point2);
  console.log(`Distance: ${distance.toFixed(2)} mm`);

  // Create distance annotation
  const distId = tools.createDistanceMeasurement(
    point1,
    point2,
    'Lesion diameter'
  );

  // Angle measurement (e.g., joint angle)
  const vertex: [number, number, number] = [128, 128, 64];
  const arm1: [number, number, number] = [100, 128, 64];
  const arm2: [number, number, number] = [128, 100, 64];
  const angle = tools.measureAngle(vertex, arm1, arm2);
  console.log(`Angle: ${angle.toFixed(2)} degrees`);

  // Create angle annotation
  const angleId = tools.createAngleMeasurement(
    vertex,
    arm1,
    arm2,
    'Joint angle'
  );

  // Area measurement (e.g., cross-sectional area)
  const polygon: [number, number][] = [
    [100, 100],
    [150, 100],
    [150, 150],
    [100, 150]
  ];
  const area = tools.measureArea(polygon, 64);
  console.log(`Area: ${area.toFixed(2)} mm²`);

  // ROI statistics
  const roiId = tools.createROI(polygon, 64, 'Tumor ROI');
  const roi = tools.getAnnotation(roiId);

  if (roi && roi.statistics) {
    console.log('ROI Statistics:');
    console.log(`  Mean HU: ${roi.statistics.mean.toFixed(2)}`);
    console.log(`  Std Dev: ${roi.statistics.std.toFixed(2)}`);
    console.log(`  Min: ${roi.statistics.min.toFixed(2)}`);
    console.log(`  Max: ${roi.statistics.max.toFixed(2)}`);
    console.log(`  Median: ${roi.statistics.median.toFixed(2)}`);
    console.log(`  Area: ${roi.statistics.area.toFixed(2)} mm²`);
    console.log(`  Pixels: ${roi.statistics.pixelCount}`);
  }

  // Hounsfield Unit readout
  const point: [number, number, number] = [128, 128, 64];
  const hu = tools.getHounsfieldUnit(point);
  console.log(`HU at [128, 128, 64]: ${hu}`);

  // Get all annotations
  const allAnnotations = tools.getAllAnnotations();
  console.log(`Total annotations: ${allAnnotations.length}`);

  // Export annotations to JSON
  const jsonExport = tools.exportAnnotations();
  console.log('Annotations exported to JSON');

  // Import annotations from JSON
  tools.clearAnnotations();
  tools.importAnnotations(jsonExport);
  console.log('Annotations imported from JSON');
}

// ============================================================================
// Example 5: Custom Transfer Function
// ============================================================================

async function example5_CustomTransferFunction(): Promise<void> {
  console.log('Example 5: Custom Transfer Function');

  // Create custom transfer function for CT visualization
  const tf = new TransferFunction(-1024, 3071);

  // Define control points for different tissue types
  tf.addControlPoint(-1024, [0, 0, 0, 0]);         // Air - transparent
  tf.addControlPoint(-500, [0.3, 0.15, 0.1, 0]);   // Fat - transparent
  tf.addControlPoint(-100, [0.6, 0.4, 0.3, 0.2]);  // Soft tissue - faint
  tf.addControlPoint(100, [0.8, 0.5, 0.4, 0.5]);   // Muscle - visible
  tf.addControlPoint(500, [0.95, 0.85, 0.75, 0.8]); // Bone - bright
  tf.addControlPoint(3071, [1.0, 1.0, 1.0, 1.0]);  // Maximum - opaque

  // Enable gradient-based opacity modulation
  tf.setGradientOpacity(true, 0.5);

  // Generate texture for GPU
  const texture = tf.generateTexture(256);
  console.log(`Generated transfer function texture: ${texture.length} bytes`);

  // Clone transfer function
  const tfClone = tf.clone();
  console.log('Transfer function cloned');

  // Get control points
  const controlPoints = tf.getControlPoints();
  console.log(`Control points: ${controlPoints.length}`);

  // Test color mapping
  const testValue = 500; // Bone
  const color = tf.getColor(testValue);
  console.log(`Color at HU ${testValue}: RGBA(${color[0].toFixed(2)}, ${color[1].toFixed(2)}, ${color[2].toFixed(2)}, ${color[3].toFixed(2)})`);
}

// ============================================================================
// Example 6: Advanced Rendering Modes
// ============================================================================

async function example6_AdvancedRendering(
  gl: WebGL2RenderingContext,
  volume: VolumeData,
  camera: Camera
): Promise<void> {
  console.log('Example 6: Advanced Rendering Modes');

  const renderer = new VolumeRenderer(gl);
  renderer.setVolume(volume);

  const tf = TransferFunction.preset('CT_BONE');
  renderer.setTransferFunction(tf);

  // Direct Volume Rendering (DVR)
  console.log('Rendering with DVR...');
  renderer.setRenderMode('DVR');
  renderer.render(camera);

  // Maximum Intensity Projection (MIP)
  console.log('Rendering with MIP...');
  renderer.setRenderMode('MIP');
  renderer.render(camera);

  // Minimum Intensity Projection
  console.log('Rendering with MinIP...');
  renderer.setRenderMode('MinIP');
  renderer.render(camera);

  // Average Intensity
  console.log('Rendering with Average...');
  renderer.setRenderMode('AVERAGE');
  renderer.render(camera);

  // Adjust render quality
  renderer.setSettings({
    stepSize: 0.01,        // Larger steps = faster, lower quality
    alphaThreshold: 0.95,  // Early termination
    enableShading: false   // Disable for speed
  });

  console.log('Rendering modes complete!');
}

// ============================================================================
// Example 7: Performance Benchmarking
// ============================================================================

async function example7_PerformanceBenchmark(
  volume: VolumeData
): Promise<void> {
  console.log('Example 7: Performance Benchmarking');

  const [width, height, depth] = volume.getDimensions();
  console.log(`Volume size: ${width}x${height}x${depth}`);

  // Benchmark voxel access
  console.log('Benchmarking voxel access...');
  const voxelStart = performance.now();
  let sum = 0;
  for (let i = 0; i < 1000000; i++) {
    const x = Math.floor(Math.random() * width);
    const y = Math.floor(Math.random() * height);
    const z = Math.floor(Math.random() * depth);
    sum += volume.getVoxel(x, y, z);
  }
  const voxelTime = performance.now() - voxelStart;
  console.log(`1M voxel accesses: ${voxelTime.toFixed(2)}ms`);

  // Benchmark interpolation
  console.log('Benchmarking trilinear interpolation...');
  const interpStart = performance.now();
  sum = 0;
  for (let i = 0; i < 100000; i++) {
    const x = Math.random() * (width - 1);
    const y = Math.random() * (height - 1);
    const z = Math.random() * (depth - 1);
    sum += volume.getVoxelInterpolated(x, y, z);
  }
  const interpTime = performance.now() - interpStart;
  console.log(`100K interpolated accesses: ${interpTime.toFixed(2)}ms`);

  // Benchmark gradient calculation
  console.log('Benchmarking gradient calculation...');
  const gradStart = performance.now();
  for (let i = 0; i < 10000; i++) {
    const x = Math.floor(Math.random() * (width - 2)) + 1;
    const y = Math.floor(Math.random() * (height - 2)) + 1;
    const z = Math.floor(Math.random() * (depth - 2)) + 1;
    volume.getGradient(x, y, z);
  }
  const gradTime = performance.now() - gradStart;
  console.log(`10K gradient calculations: ${gradTime.toFixed(2)}ms`);

  // Benchmark slice extraction
  console.log('Benchmarking slice extraction...');
  const sliceStart = performance.now();
  for (let i = 0; i < 100; i++) {
    const z = Math.floor(Math.random() * depth);
    volume.getSlice('z', z);
  }
  const sliceTime = performance.now() - sliceStart;
  console.log(`100 slice extractions: ${sliceTime.toFixed(2)}ms`);

  console.log('Benchmarking complete!');
}

// ============================================================================
// Main Example Runner
// ============================================================================

export async function runAllExamples(
  gl: WebGL2RenderingContext,
  dicomFiles: File[]
): Promise<void> {
  console.log('===== G3D Medical Imaging Module Examples =====\n');

  try {
    // Example 1: Basic rendering
    await example1_BasicVolumeRendering(gl, dicomFiles);
    console.log('\n---\n');

    // Load volume for remaining examples
    const loader = new DICOMLoader();
    const volume = await loader.loadSeries(dicomFiles);

    // Example 2: MPR
    await example2_MPRViewer(volume);
    console.log('\n---\n');

    // Example 3: Isosurface
    await example3_IsosurfaceExtraction(volume);
    console.log('\n---\n');

    // Example 4: Measurements
    await example4_MedicalMeasurements(volume);
    console.log('\n---\n');

    // Example 5: Custom TF
    await example5_CustomTransferFunction();
    console.log('\n---\n');

    // Example 6: Advanced rendering
    const camera: Camera = {
      position: [0, 0, -500],
      target: [0, 0, 0],
      up: [0, 1, 0],
      fov: Math.PI / 4,
      aspect: 1.0,
      near: 0.1,
      far: 1000
    };
    await example6_AdvancedRendering(gl, volume, camera);
    console.log('\n---\n');

    // Example 7: Benchmarks
    await example7_PerformanceBenchmark(volume);

    console.log('\n===== All Examples Complete! =====');
  } catch (error) {
    console.error('Error running examples:', error);
  }
}

// Export individual examples
export {
  example1_BasicVolumeRendering,
  example2_MPRViewer,
  example3_IsosurfaceExtraction,
  example4_MedicalMeasurements,
  example5_CustomTransferFunction,
  example6_AdvancedRendering,
  example7_PerformanceBenchmark
};
