/** Optional Gaussian splat and scalar volume rendering. */
export { GaussianSplatRenderer, gaussianSphericalHarmonicBasis, gaussianSplatGpuInstanceBytes, GAUSSIAN_SPLAT_DEFAULT_MAX_GPU_BYTES, GAUSSIAN_SPLAT_DEFAULT_MAX_SPLATS } from "./GaussianSplatRenderer.js";
export type { GaussianSplatCloud, GaussianSplatRenderOptions, GaussianSplatDrawInput, GaussianSplatFrame, GaussianSplatPreparedFrame, GaussianSplatTransparentRun } from "./GaussianSplatRenderer.js";
export { VolumeRenderer, buildVolumeTransferTable } from "./VolumeRenderer.js";
export { WebGPUScalarVolumeRenderer } from "./webgpu/ScalarVolumePass.js";
export type { WebGPUScalarVolumeDraw } from "./webgpu/ScalarVolumePass.js";
export type { VolumeDimensions, VolumePlane, VolumeColor, VolumeSamples, VolumeTransferStop, ScalarVolumeData, VolumeRendererOptions, VolumeRenderMode, VolumeDrawOptions, VolumeRendererDiagnostics, VolumeFrameLease } from "./VolumeRenderer.js";
export type { ScalarVolumeBounds, ScalarVolumeDrawRecord } from "./renderer/ScalarVolumeFrame.js";
