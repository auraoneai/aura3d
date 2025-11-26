/**
 * Turntable Module - Product visualization components
 *
 * Provides complete turntable/360° product viewer functionality including:
 * - Orbit camera controls with touch/mouse support
 * - Auto-rotation with pause on interaction
 * - Lighting presets (Studio, Outdoor, Soft, Dramatic, Neutral)
 * - Interactive 3D hotspots
 * - High-resolution capture (up to 4K)
 * - AR export (USDZ for iOS, GLB for Android)
 * - Batch processing for multiple products
 *
 * @module ecommerce/turntable
 */

export { OrbitCamera, type OrbitCameraConfig, type CameraState } from './OrbitCamera';
export { TurntableController, type TurntableConfig, type RotationDirection } from './TurntableController';
export { LightingPresetManager, type LightingPresetData, type LightConfig, type PresetName } from './LightingPresetManager';
export { HotspotManager, Hotspot, type HotspotConfig, type HotspotScreenPosition } from './HotspotManager';
export { CaptureManager, type ScreenshotConfig, type VideoRecordingConfig, type Spin360Config, type CaptureFrame, type ImageFormat } from './CaptureManager';
export { ARExporter, type ARExportConfig, type USDZConfig, type GLBConfig, type ARPlatform, type ARFormat, type ModelData, type MaterialData } from './ARExporter';
export { BatchProcessor, type BatchTask, type TaskResult, type BatchProcessConfig, type ProcessManifest, type ProcessOperation } from './BatchProcessor';
