/**
 * G3D 5.0 - Post-Processing Effects
 *
 * Barrel export for all post-processing controllers and utilities.
 *
 * @module postfx
 */

// Core chain and context
// Note: PostProcessEffect is exported from rendering module to avoid duplicates
export {
  PostProcessChain,
  type PostProcessPreset,
  type RenderContext,
  type ChainStats,
} from './PostProcessChain';

// Anti-aliasing
export {
  AntiAliasingManager,
  type AAMode,
  type AAConfig,
  type AAStats,
} from './AntiAliasingManager';

export {
  FXAAController,
  type FXAAQuality,
  type FXAASettings,
} from './FXAAController';

export {
  SMAAController,
  type SMAAQuality,
  type SMAASettings,
} from './SMAAController';

export {
  TAAPassController,
  type JitterPattern,
  type TAASettings,
  type TAAPreset,
} from './TAAPassController';

// Tone mapping and color
// Note: ToneMappingOperator is exported from rendering module to avoid duplicates
export {
  ToneMappingController,
  type ToneMappingSettings,
  type ExposureHistogram,
  type ToneMappingPreset,
} from './ToneMappingController';

export {
  LUTLoader,
  type LUT,
  type LUTLoadOptions,
  type LUTStripFormat,
} from './LUTLoader';

// Effects
export {
  BloomController,
  type BloomSettings,
  type BloomPreset,
} from './BloomController';

// Note: BokehShape is exported from rendering module to avoid duplicates
export {
  DOFController,
  type DOFSettings,
  type DOFPreset,
} from './DOFController';

export {
  MotionBlurController,
  type MotionBlurSettings,
  type MotionBlurPreset,
} from './MotionBlurController';

export {
  VolumetricController,
  type VolumetricSettings,
  type VolumetricPreset,
} from './VolumetricController';

export {
  OutlineController,
  type OutlineMethod,
  type OutlineSettings,
  type OutlinePreset,
} from './OutlineController';

export {
  MLPostProcessController,
  type MLEffectType,
  type ModelStatus,
  type MLModel,
  type StyleTransferSettings,
  type SuperResolutionSettings,
  type MLPostProcessSettings,
} from './MLPostProcessController';
