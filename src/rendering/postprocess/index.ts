/**
 * @module PostProcess
 * @description Post-processing system for G3D 5.0 rendering engine.
 * Provides a complete suite of screen-space effects for enhancing rendered images.
 *
 * @example
 * ```typescript
 * import {
 *   PostProcessStack,
 *   Bloom,
 *   SSAO,
 *   TAA,
 *   ToneMapping,
 *   ToneMappingOperator,
 *   DepthOfField,
 *   MotionBlur,
 *   ColorGrading,
 *   FXAA,
 *   EffectQuality
 * } from './rendering/postprocess';
 *
 * // Create post-process stack
 * const stack = new PostProcessStack({
 *   width: 1920,
 *   height: 1080,
 *   hdr: true,
 *   quality: EffectQuality.High
 * });
 *
 * // Add effects in desired order
 * stack.addEffect(new SSAO({ radius: 0.5, samples: 32 }));
 * stack.addEffect(new TAA({ blendFactor: 0.9 }));
 * stack.addEffect(new DepthOfField({ focusDistance: 10.0, fStop: 2.8 }));
 * stack.addEffect(new MotionBlur({ intensity: 0.8 }));
 * stack.addEffect(new Bloom({ threshold: 1.0, intensity: 0.8 }));
 * stack.addEffect(new ToneMapping({ operator: ToneMappingOperator.ACES }));
 * stack.addEffect(new ColorGrading({ saturation: 1.1, contrast: 1.05 }));
 * stack.addEffect(new FXAA({ preset: FXAAPreset.High }));
 *
 * // Initialize with WebGL context
 * stack.initialize(gl);
 *
 * // Render effects
 * function render() {
 *   // Render scene to input texture
 *   renderer.render(scene, camera, sceneTexture);
 *
 *   // Apply post-processing
 *   const output = stack.render(sceneTexture, deltaTime);
 *
 *   // Present to screen
 *   renderer.present(output);
 * }
 *
 * // Handle window resize
 * window.addEventListener('resize', () => {
 *   stack.resize(window.innerWidth, window.innerHeight);
 * });
 *
 * // Cleanup
 * stack.dispose();
 * ```
 */

// Core classes
export { PostProcessEffect, EffectQuality } from './PostProcessEffect';
export type { EffectParameters, UniformParameter, TextureSpec } from './PostProcessEffect';
export { PostProcessStack } from './PostProcessStack';
export type { PostProcessStackConfig } from './PostProcessStack';

// Effects
export { Bloom } from './Bloom';
export type { BloomParameters } from './Bloom';
export { SSAO } from './SSAO';
export type { SSAOParameters } from './SSAO';
export { TAA } from './TAA';
export type { TAAParameters } from './TAA';
export { ToneMapping, ToneMappingOperator } from './ToneMapping';
export type { ToneMappingParameters } from './ToneMapping';
export { DepthOfField, BokehShape } from './DepthOfField';
export type { DepthOfFieldParameters } from './DepthOfField';
export { MotionBlur } from './MotionBlur';
export type { MotionBlurParameters } from './MotionBlur';
export { ColorGrading } from './ColorGrading';
export type { ColorGradingParameters } from './ColorGrading';
export { FXAA, FXAAPreset } from './FXAA';
export type { FXAAParameters } from './FXAA';
