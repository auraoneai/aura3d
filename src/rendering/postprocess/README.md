# G3D 5.0 Post-Processing System

Complete production-ready post-processing system for the G3D 5.0 rendering engine.

## Overview

This module provides a comprehensive suite of screen-space post-processing effects with automatic texture management, effect ordering, and quality presets.

## Architecture

### Core Classes

- **PostProcessEffect** - Abstract base class for all effects
- **PostProcessStack** - Effect chain manager with automatic ping-pong rendering

### Effects Implemented

1. **Bloom** (~540 lines)
   - HDR bloom with threshold extraction
   - Gaussian blur with 13-tap downsampling
   - Progressive mip chain (up to 7 levels)
   - Tent filter upsampling
   - Configurable threshold, intensity, and radius

2. **SSAO** (~594 lines)
   - Screen-space ambient occlusion
   - Hemisphere sampling (8-64 samples)
   - Normal-oriented kernel
   - Bilateral blur for denoising
   - Depth-aware filtering

3. **TAA** (~566 lines)
   - Temporal anti-aliasing
   - Halton sequence jitter pattern
   - Motion vector reprojection
   - Neighborhood clamping in YCoCg space
   - Velocity-based weighting
   - Sharpening pass

4. **ToneMapping** (~405 lines)
   - HDR to LDR conversion
   - 6 operators: None, Reinhard, ReinhardExtended, ACES, Neutral, Uncharted2
   - Manual and auto-exposure
   - White point adjustment
   - Gamma correction

5. **DepthOfField** (~585 lines)
   - Physically-based DoF
   - Circle of Confusion calculation
   - Separate foreground/background blur
   - Poisson disk sampling for bokeh
   - Configurable focus distance and aperture

6. **MotionBlur** (~487 lines)
   - Per-object motion blur
   - Velocity buffer sampling
   - Tile-based optimization (32x32 tiles)
   - Depth-aware blending
   - Temporal jitter for stability

7. **ColorGrading** (~443 lines)
   - Lift/Gamma/Gain controls
   - Saturation, contrast, brightness
   - Temperature and tint adjustment
   - Vignette effect
   - 3D LUT support

8. **FXAA** (~421 lines)
   - Fast approximate anti-aliasing
   - Edge detection with luminance
   - Subpixel anti-aliasing
   - 4 quality presets (Low, Medium, High, Ultra)
   - Configurable edge thresholds

## Usage

### Basic Setup

```typescript
import {
  PostProcessStack,
  Bloom,
  SSAO,
  TAA,
  ToneMapping,
  ToneMappingOperator,
  EffectQuality
} from './rendering/postprocess';

// Create stack
const stack = new PostProcessStack({
  width: 1920,
  height: 1080,
  hdr: true,
  quality: EffectQuality.High
});

// Add effects in order
stack.addEffect(new SSAO({ radius: 0.5, samples: 32 }));
stack.addEffect(new TAA({ blendFactor: 0.9 }));
stack.addEffect(new Bloom({ threshold: 1.0, intensity: 0.8 }));
stack.addEffect(new ToneMapping({ operator: ToneMappingOperator.ACES }));

// Initialize
stack.initialize(gl);

// Render
const output = stack.render(inputTexture, deltaTime);
```

### Runtime Adjustments

```typescript
// Get effect and adjust parameters
const bloom = stack.getEffect('Bloom');
bloom?.setParameter('threshold', 1.2);
bloom?.setParameter('intensity', 0.6);

// Enable/disable effects
stack.disableEffect('DepthOfField');
stack.enableEffect('MotionBlur');

// Change quality
stack.setQuality(EffectQuality.Ultra);
```

### Window Resize

```typescript
window.addEventListener('resize', () => {
  stack.resize(window.innerWidth, window.innerHeight);
});
```

## Features

### Automatic Resource Management
- Texture pooling for ping-pong rendering
- Automatic mip chain creation
- Smart texture format selection (HDR/LDR)

### Quality Presets
- Low - Fast, suitable for mobile/integrated GPUs
- Medium - Balanced performance and quality
- High - High quality for discrete GPUs
- Ultra - Maximum quality for screenshots/cinematics

### Effect Ordering
- Priority-based effect ordering
- Automatic dependency resolution
- Enable/disable per-effect

### Performance Optimizations
- Efficient texture ping-ponging
- Tile-based optimization (motion blur)
- Bilateral filtering (SSAO, motion blur)
- Adaptive sample counts
- Early-out conditions

## Technical Details

### Shader Language
All shaders use GLSL 300 ES for WebGL2 compatibility.

### Texture Formats
- HDR effects: RGBA16F
- LDR effects: RGBA8
- Depth: Depth24 or Depth32F
- SSAO: R8 (single channel)

### Sample Counts (Quality-dependent)
- Low: 8-16 samples
- Medium: 16-32 samples
- High: 32-64 samples
- Ultra: 64-128 samples

### Mip Chains
- Bloom: 3-7 levels
- DoF: 2-4 levels
- Motion blur: 2x2 tile reduction

## Integration Notes

### Required Buffers
- **SSAO**: Depth buffer, normal buffer (G-buffer)
- **TAA**: Motion vector buffer, depth buffer
- **DepthOfField**: Depth buffer
- **MotionBlur**: Motion vector buffer, depth buffer

### Render Pipeline Integration

```typescript
// 1. Render scene to HDR buffer
renderer.setRenderTarget(sceneTarget);
renderer.render(scene, camera);

// 2. Generate G-buffer (for SSAO)
renderer.renderGBuffer(scene, camera, gBuffer);

// 3. Generate motion vectors (for TAA/MotionBlur)
renderer.renderMotionVectors(scene, camera, motionBuffer);

// 4. Apply post-processing
const output = stack.render(sceneTarget, deltaTime);

// 5. Present to screen
renderer.present(output);
```

## Performance Guidelines

### Mobile/Integrated GPUs
- Use Low or Medium quality
- Disable expensive effects (SSAO, DoF, MotionBlur)
- Reduce resolution (render at 0.75x, upscale)
- Limit to 3-4 effects

### Discrete GPUs
- Use High or Ultra quality
- Enable all effects
- Full resolution rendering
- Up to 8 effects in chain

### Profiling
Use the stack's debug info for performance monitoring:

```typescript
const info = stack.getDebugInfo();
console.log(`Effects rendered: ${info.effectsRendered}/${info.effectCount}`);
console.log(`Frame: ${info.frameCount}`);
```

## File Summary

| File | Lines | Description |
|------|-------|-------------|
| PostProcessEffect.ts | 444 | Base class for all effects |
| PostProcessStack.ts | 542 | Effect chain manager |
| Bloom.ts | 540 | Bloom/glow effect |
| SSAO.ts | 594 | Ambient occlusion |
| TAA.ts | 566 | Temporal anti-aliasing |
| ToneMapping.ts | 405 | HDR to LDR conversion |
| DepthOfField.ts | 585 | Depth-based blur |
| MotionBlur.ts | 487 | Motion-based blur |
| ColorGrading.ts | 443 | Color correction |
| FXAA.ts | 421 | Fast anti-aliasing |
| index.ts | 77 | Barrel export |
| **Total** | **5,104** | **Complete system** |

## License

Part of the G3D 5.0 rendering engine.
