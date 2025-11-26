/**
 * G3D 5.0 Foveated Rendering Module
 *
 * Complete foveated rendering system with eye tracking, fixed and dynamic
 * foveation, variable rate shading, multi-resolution rendering, and gaze-based LOD.
 *
 * @example
 * ```typescript
 * import {
 *   EyeTracker,
 *   FoveatedRenderer,
 *   FixedFoveatedRenderer,
 *   VariableRateShadingManager,
 *   MultiResolutionRenderer,
 *   GazeBasedLOD
 * } from './foveated';
 *
 * // Eye tracking
 * const eyeTracker = new EyeTracker({ smoothing: 0.3 });
 *
 * // Dynamic foveated rendering
 * const foveated = new FoveatedRenderer({
 *   centerRadius: 0.2,
 *   falloffCurve: 'gaussian'
 * });
 *
 * // Fixed foveated rendering (no eye tracking needed)
 * const fixedFoveated = new FixedFoveatedRenderer({
 *   rings: [
 *     { radius: 0.3, quality: 1.0 },
 *     { radius: 0.6, quality: 0.5 },
 *     { radius: 1.0, quality: 0.25 }
 *   ]
 * });
 *
 * // Variable rate shading (WebGPU)
 * const vrs = new VariableRateShadingManager({
 *   centerRate: '1x1',
 *   peripheralRate: '4x4'
 * });
 *
 * // Multi-resolution rendering
 * const multiRes = new MultiResolutionRenderer({
 *   regions: [
 *     { radius: 0.25, resolution: 1.0 },
 *     { radius: 0.5, resolution: 0.5 },
 *     { radius: 1.0, resolution: 0.25 }
 *   ]
 * });
 *
 * // Gaze-based LOD
 * const gazeLOD = new GazeBasedLOD({
 *   highDetailRadius: 0.2,
 *   mediumDetailRadius: 0.5
 * });
 * ```
 *
 * @module foveated
 */

// Eye tracking
export { EyeTracker } from './EyeTracker';
export type {
  EyeTrackerOptions,
  GazePosition,
  FixationState,
  SaccadeState
} from './EyeTracker';

// Fixed foveated rendering
export { FixedFoveatedRenderer } from './FixedFoveatedRenderer';
export type {
  QualityRing,
  FixedFoveatedOptions
} from './FixedFoveatedRenderer';

// Dynamic foveated rendering
export { FoveatedRenderer } from './FoveatedRenderer';
export type {
  FalloffCurve,
  FoveatedRendererOptions
} from './FoveatedRenderer';

// Variable rate shading
export { VariableRateShadingManager } from './VariableRateShadingManager';
export type {
  ShadingRate,
  VRSOptions
} from './VariableRateShadingManager';

// Multi-resolution rendering
export { MultiResolutionRenderer } from './MultiResolutionRenderer';
export type {
  ResolutionRegion,
  MultiResolutionOptions
} from './MultiResolutionRenderer';

// Gaze-based LOD
export { GazeBasedLOD } from './GazeBasedLOD';
export type {
  LODLevel,
  LODConfig,
  GazeBasedLODOptions
} from './GazeBasedLOD';
