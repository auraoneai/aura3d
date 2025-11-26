/**
 * E-Commerce Module - Complete product visualization system for G3D 5.0
 *
 * The E-Commerce module provides a comprehensive suite of tools for creating
 * interactive product viewers with turntable rotation, AR export, and capture capabilities.
 *
 * ## Features
 *
 * ### Turntable System
 * - **OrbitCamera**: Spherical coordinate camera with touch/mouse controls
 * - **TurntableController**: Auto-rotation with pause on interaction
 * - **LightingPresetManager**: Professional lighting presets (Studio, Outdoor, Soft, Dramatic, Neutral)
 * - **HotspotManager**: Interactive 3D annotations with tooltips
 * - **CaptureManager**: High-res screenshots (up to 4K) and video recording
 * - **ARExporter**: AR Quick Look (iOS USDZ) and Scene Viewer (Android GLB) export
 * - **BatchProcessor**: Batch process multiple products with parallel execution
 *
 * ## Quick Start
 *
 * @example
 * ```typescript
 * import {
 *   OrbitCamera,
 *   TurntableController,
 *   LightingPresetManager,
 *   HotspotManager,
 *   CaptureManager,
 *   ARExporter
 * } from './ecommerce';
 * import { Vector3 } from './math/Vector3';
 *
 * // 1. Setup Camera
 * const camera = new OrbitCamera({
 *   target: new Vector3(0, 0, 0),
 *   distance: 5,
 *   minDistance: 2,
 *   maxDistance: 10,
 *   damping: 0.05,
 *   enableTouch: true,
 *   enableMouse: true,
 *   domElement: canvas
 * });
 *
 * // 2. Setup Turntable
 * const turntable = new TurntableController(camera, {
 *   autoRotate: true,
 *   speed: 0.5,
 *   pauseOnInteraction: true,
 *   resumeDelay: 2000
 * });
 *
 * // 3. Apply Lighting
 * const lighting = new LightingPresetManager();
 * await lighting.applyPreset('studio');
 *
 * // 4. Add Hotspots
 * const hotspots = new HotspotManager(canvas);
 * hotspots.add({
 *   id: 'feature1',
 *   position: new Vector3(0, 0.5, 0),
 *   label: 'Premium Material',
 *   content: 'Handcrafted from genuine Italian leather',
 *   onClick: (hotspot) => {
 *     console.log('Clicked:', hotspot.label);
 *   }
 * });
 *
 * // 5. Animation Loop
 * function animate(deltaTime: number) {
 *   camera.update(deltaTime);
 *   turntable.update(deltaTime);
 *   hotspots.update(camera.viewMatrix, projectionMatrix, camera.position);
 *   renderer.render();
 *   requestAnimationFrame(animate);
 * }
 * animate(0);
 * ```
 *
 * ## Capture Screenshots
 *
 * @example
 * ```typescript
 * const capture = new CaptureManager(renderer, canvas);
 *
 * // High-resolution screenshot
 * const screenshot = await capture.takeScreenshot({
 *   width: 2048,
 *   height: 2048,
 *   format: 'png',
 *   transparentBackground: false
 * });
 *
 * // Download
 * capture.downloadImage(screenshot, 'product.png');
 *
 * // Record 360° spin
 * const frames = await capture.record360Spin({
 *   duration: 4,
 *   frameRate: 30,
 *   width: 1920,
 *   height: 1080
 * }, (current, total) => {
 *   console.log(`Capturing ${current}/${total}`);
 * });
 * ```
 *
 * ## AR Export
 *
 * @example
 * ```typescript
 * const arExporter = new ARExporter();
 *
 * // Auto-detect platform and export
 * await arExporter.exportForPlatform(modelData, {
 *   title: 'Premium Headphones',
 *   autoLaunch: true
 * });
 *
 * // Export specific formats
 * const usdzBlob = await arExporter.exportUSDZ(modelData);
 * const glbBlob = await arExporter.exportGLB(modelData);
 *
 * // Launch AR viewer
 * if (arExporter.platform === 'ios') {
 *   arExporter.launchARQuickLook(usdzBlob, 'product.usdz');
 * } else if (arExporter.platform === 'android') {
 *   arExporter.launchSceneViewer(glbBlob, 'product.glb', 'Product Name');
 * }
 * ```
 *
 * ## Batch Processing
 *
 * @example
 * ```typescript
 * const processor = new BatchProcessor();
 * processor.setCaptureManager(capture);
 *
 * // Add tasks
 * processor.addTask({
 *   id: 'product1',
 *   model: modelData1,
 *   operations: ['thumbnail', 'ar-export', '360-spin'],
 *   config: {
 *     thumbnail: { width: 256, height: 256 },
 *     arExport: { formats: ['usdz', 'glb'] },
 *     spin360: { duration: 4, frameRate: 30 }
 *   }
 * });
 *
 * processor.addTask({
 *   id: 'product2',
 *   model: modelData2,
 *   operations: ['all']
 * });
 *
 * // Process with progress
 * const results = await processor.process({
 *   parallel: 2,
 *   onProgress: (current, total, task) => {
 *     console.log(`Processing ${current}/${total}: ${task.id}`);
 *   }
 * });
 *
 * // Export manifest
 * await processor.exportManifest(results, 'batch-results.json');
 * ```
 *
 * ## Lighting Presets
 *
 * Available presets:
 * - **studio**: Classic 3-point lighting for product photography
 * - **outdoor**: Natural daylight simulation
 * - **soft**: Diffused, even illumination
 * - **dramatic**: High contrast with rim lighting
 * - **neutral**: Balanced, true-to-color lighting
 *
 * @example
 * ```typescript
 * const lighting = new LightingPresetManager();
 *
 * // Apply preset
 * await lighting.applyPreset('studio');
 *
 * // Smooth transition
 * await lighting.transitionToPreset('outdoor', 1.0);
 *
 * // Create custom preset
 * lighting.createCustomPreset('myPreset', {
 *   ambient: { color: [1, 1, 1], intensity: 0.3 },
 *   key: { color: [1, 0.95, 0.9], intensity: 1.5, position: [2, 3, 2] },
 *   fill: { color: [0.9, 0.95, 1], intensity: 0.5, position: [-2, 1, 1] }
 * });
 * ```
 *
 * ## Performance
 *
 * - Smooth 60 FPS turntable rotation
 * - Touch and mouse input with damping
 * - High-resolution capture up to 4K
 * - AR export < 1s for typical models
 * - Parallel batch processing
 * - Mobile-optimized
 *
 * ## Browser Support
 *
 * - Chrome 90+ (desktop and mobile)
 * - Safari 14+ (iOS AR Quick Look support)
 * - Firefox 88+
 * - Edge 90+
 *
 * @module ecommerce
 */

// Re-export all turntable components
export {
  OrbitCamera,
  type OrbitCameraConfig,
  type CameraState,
  TurntableController,
  type TurntableConfig,
  type RotationDirection,
  LightingPresetManager,
  type LightingPresetData,
  type LightConfig,
  type PresetName,
  HotspotManager,
  Hotspot,
  type HotspotConfig,
  type HotspotScreenPosition,
  CaptureManager,
  type ScreenshotConfig,
  type VideoRecordingConfig,
  type Spin360Config,
  type CaptureFrame,
  type ImageFormat,
  ARExporter,
  type ARExportConfig,
  type USDZConfig,
  type GLBConfig,
  type ARPlatform,
  type ARFormat,
  type ModelData,
  type MaterialData,
  BatchProcessor,
  type BatchTask,
  type TaskResult,
  type BatchProcessConfig,
  type ProcessManifest,
  type ProcessOperation
} from './turntable';
