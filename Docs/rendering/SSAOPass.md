# SSAO Pass - Screen-Space Ambient Occlusion

## Overview

The `SSAOPass` implements high-quality screen-space ambient occlusion for the G3D deferred rendering pipeline. It calculates ambient occlusion by sampling the depth buffer in a hemisphere around each pixel's surface normal, providing realistic shadowing in crevices and contact areas.

## Features

- **Hemisphere Sampling**: Samples depth in a hemisphere oriented around the surface normal
- **Normal-Oriented Kernel**: Uses G-Buffer normals to align samples with surface geometry
- **Random Rotation**: 4x4 tiled noise texture prevents banding artifacts
- **Bilateral Blur**: Depth-aware separable blur preserves edges while denoising
- **Quality Presets**: Low (8 samples), Medium (16), High (32), Ultra (64 samples)
- **Configurable Parameters**: Runtime-adjustable radius, intensity, bias, and blur

## Algorithm

### Pass 1: SSAO Calculation

1. **Reconstruct View-Space Position** from depth buffer
2. **Decode Surface Normal** from G-Buffer (octahedron encoding)
3. **Generate TBN Matrix** using random rotation vector
4. **Sample Hemisphere** around normal:
   - Transform sample kernel by TBN matrix
   - Offset by sampling radius
   - Project to screen space
   - Compare depths with bias
5. **Calculate Occlusion** factor (0.0 = fully occluded, 1.0 = no occlusion)

### Pass 2: Horizontal Bilateral Blur

- Blur occlusion texture horizontally
- Weight samples by depth difference (preserve edges)
- Configurable blur radius

### Pass 3: Vertical Bilateral Blur

- Blur horizontally-blurred texture vertically
- Final output: smooth occlusion texture
- Ready for multiplication with lighting

## Integration

### Automatic Integration (Deferred Pipeline)

The SSAO pass is automatically created and initialized when using deferred rendering:

```typescript
const renderer = await Renderer.create({
  canvas,
  renderMode: RenderMode.Deferred,  // SSAO enabled by default
  quality: QualityPreset.High,
});
```

### Manual Configuration

```typescript
// Access SSAO pass from renderer
const ssaoPass = renderer.ssaoPass;

if (ssaoPass) {
  // Configure parameters
  ssaoPass.setRadius(0.5);       // Sampling radius (view space)
  ssaoPass.setIntensity(1.2);    // Occlusion intensity multiplier
  ssaoPass.setBlurRadius(4);     // Denoise blur radius (pixels)
  ssaoPass.setEnabled(true);     // Enable/disable pass
}
```

### Pipeline Position

```
Deferred Rendering Pipeline:
1. Shadow Pass          → Shadow maps
2. G-Buffer Pass        → Depth, normals, albedo, roughness
3. SSAO Pass            → Occlusion texture ← YOU ARE HERE
4. Lighting Pass        → Combines lighting with AO
5. Skybox Pass          → Environment
6. Forward Pass         → Transparents
7. Post-Processing      → Bloom, tone mapping, AA
```

## Constructor

```typescript
constructor(config: SSAOPassConfig)
```

### SSAOPassConfig

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `width` | `number` | *required* | Render target width |
| `height` | `number` | *required* | Render target height |
| `sampleCount` | `number` | `16` | Number of samples per pixel |
| `radius` | `number` | `0.5` | Sampling radius in view space |
| `intensity` | `number` | `1.0` | Occlusion intensity multiplier |
| `bias` | `number` | `0.025` | Depth bias to prevent self-occlusion |
| `blurRadius` | `number` | `4.0` | Blur kernel radius for denoising |
| `quality` | `SSAOQuality` | `Medium` | Quality preset (overrides sampleCount) |
| `enabled` | `boolean` | `true` | Enable/disable effect |

## Methods

### Setup and Configuration

#### `setContext(gl: WebGL2RenderingContext): void`
Sets the WebGL context. Required before `setup()`.

#### `setup(): void`
Initializes shaders, textures, and framebuffers. Call after `setContext()`.

#### `setGBufferTextures(depthTexture: WebGLTexture, normalTexture: WebGLTexture): void`
Sets G-Buffer input textures (depth and normals).

#### `updateCamera(camera: Camera): void`
Updates camera for projection matrix calculations.

### Runtime Parameters

#### `setRadius(radius: number): void`
Sets sampling radius in view space (0.1 - 2.0 recommended).

**Effect**: Larger radius = wider occlusion area, but may miss fine details.

#### `setIntensity(intensity: number): void`
Sets occlusion intensity multiplier (0.0 - 3.0).

**Effect**: Higher intensity = darker occlusion.

#### `setBlurRadius(blurRadius: number): void`
Sets blur kernel radius in pixels (0 - 8).

**Effect**: Larger radius = smoother result, but may blur edges.

#### `setEnabled(enabled: boolean): void`
Enables or disables the SSAO effect.

### Execution

#### `execute(renderQueue: RenderQueue, renderTarget: RenderTarget): void`
Executes the three-pass SSAO algorithm:
1. Calculate raw occlusion
2. Horizontal bilateral blur
3. Vertical bilateral blur

#### `getOcclusionTexture(): WebGLTexture | null`
Returns the final blurred occlusion texture (R8 format).
- **1.0** = No occlusion (fully lit)
- **0.0** = Full occlusion (fully shadowed)

### Cleanup

#### `resize(width: number, height: number): void`
Resizes render targets when viewport changes.

#### `cleanup(): void`
Destroys all GPU resources (shaders, textures, framebuffers).

## Quality Presets

| Preset | Samples | Use Case | Performance |
|--------|---------|----------|-------------|
| `Low` | 8 | Mobile, low-end GPUs | Fast |
| `Medium` | 16 | Desktop, mid-range GPUs | Balanced |
| `High` | 32 | High-end GPUs, quality mode | Slower |
| `Ultra` | 64 | Screenshots, cinematics | Very slow |

## Parameter Tuning Guide

### Radius

- **Small (0.1 - 0.3)**: Tight occlusion, detail in small crevices
- **Medium (0.4 - 0.7)**: Balanced, good for most scenes
- **Large (0.8 - 2.0)**: Wide occlusion, softer shadows

### Intensity

- **Low (0.5 - 0.8)**: Subtle AO, outdoor scenes
- **Medium (0.9 - 1.3)**: Balanced
- **High (1.4 - 3.0)**: Strong AO, indoor/cave scenes

### Bias

- **Too Low**: Self-occlusion artifacts (surface darkening)
- **Too High**: Loss of detail (occlusion gaps)
- **Recommended**: 0.01 - 0.05

### Blur Radius

- **0**: No blur, very noisy
- **2-4**: Balanced denoise
- **6-8**: Very smooth, may blur edges

## Shader Details

### SSAO Fragment Shader

The core SSAO calculation happens in `SSAO_FRAGMENT_SHADER`:

```glsl
// For each pixel:
1. Reconstruct view-space position from depth
2. Decode octahedron-encoded normal
3. Generate random TBN rotation matrix
4. For each sample in hemisphere:
   - Transform sample by TBN
   - Offset by radius
   - Project to screen space
   - Sample depth
   - Compare depths (with bias)
   - Accumulate occlusion with range check
5. Average and apply intensity
```

### Bilateral Blur Shaders

Separable blur in two passes (horizontal, then vertical):

```glsl
// For each pixel:
1. Sample center depth
2. For each tap in blur kernel:
   - Sample SSAO and depth
   - Calculate depth-based weight: exp(-depthDiff * 100)
   - Accumulate weighted occlusion
3. Normalize by total weight
```

## Performance Considerations

### GPU Cost

- **SSAO Pass**: ~0.5-2ms @ 1080p (depends on sample count)
- **Bilateral Blur**: ~0.3-0.5ms @ 1080p
- **Total**: ~0.8-2.5ms per frame

### Optimizations

1. **Reduce Sample Count**: Use quality presets
2. **Lower Resolution**: Render SSAO at half-res, upscale
3. **Reduce Blur Radius**: Smaller kernel = faster
4. **Disable for Distance**: Skip SSAO for far objects

### Memory Usage

- **Noise Texture**: 4x4 RGB16F = 384 bytes (negligible)
- **SSAO Texture**: width × height × 1 byte (R8)
- **Blur Textures**: 2 × (width × height × 1 byte)
- **Total**: ~3 MB @ 1080p

## Common Issues

### Artifacts

**Banding**: Increase sample count or check noise texture is properly tiled.

**Self-Occlusion**: Increase bias parameter (0.025 → 0.05).

**Halo Effect**: Reduce sampling radius or increase blur radius.

**Noisy Result**: Increase blur radius or sample count.

### Integration Issues

**No Occlusion Visible**: Check `setGBufferTextures()` was called with correct depth/normal textures.

**Black Screen**: Verify G-Buffer normal texture uses octahedron encoding.

**Performance Drop**: Reduce sample count or use lower quality preset.

## Example Usage

### Basic Setup

```typescript
// Create SSAO pass
const ssaoPass = new SSAOPass({
  width: 1920,
  height: 1080,
  quality: SSAOQuality.High,
  radius: 0.5,
  intensity: 1.0,
});

// Initialize with GL context
ssaoPass.setContext(gl);
ssaoPass.setup();

// Set G-Buffer inputs
ssaoPass.setGBufferTextures(gbuffer.depth, gbuffer.normal);

// Update camera each frame
ssaoPass.updateCamera(camera);

// Execute pass
ssaoPass.execute(emptyQueue, null);

// Get result for lighting pass
const aoTexture = ssaoPass.getOcclusionTexture();
```

### Runtime Parameter Adjustment

```typescript
// Toggle SSAO on/off
ssaoPass.setEnabled(true);

// Adjust for indoor scene (stronger AO)
ssaoPass.setIntensity(1.5);
ssaoPass.setRadius(0.3);

// Adjust for outdoor scene (subtle AO)
ssaoPass.setIntensity(0.8);
ssaoPass.setRadius(0.7);

// Fine-tune denoising
ssaoPass.setBlurRadius(6);
```

### Quality Scaling

```typescript
// Quality settings based on performance target
function setSSAOQuality(targetFPS: number) {
  if (targetFPS >= 60) {
    ssaoPass.setQuality(SSAOQuality.High);    // 32 samples
  } else if (targetFPS >= 30) {
    ssaoPass.setQuality(SSAOQuality.Medium);  // 16 samples
  } else {
    ssaoPass.setQuality(SSAOQuality.Low);     // 8 samples
  }
}
```

## Integration with Lighting Pass

The SSAO occlusion texture should be multiplied with the ambient lighting term:

```glsl
// In lighting pass fragment shader
float ao = texture(u_ssaoTexture, v_texcoord).r;

// Apply to ambient/IBL only (not direct lighting)
vec3 ambient = ambientColor * albedo * ao;

// Final color
vec3 color = ambient + directLighting + emission;
```

## References

- [SSAO Tutorial - John Chapman](http://john-chapman-graphics.blogspot.com/2013/01/ssao-tutorial.html)
- [Crytek SSAO - GDC 2008](https://www.crytek.com/download/Sousa_Graphics_Gems_CryENGINE3.pdf)
- [Learn OpenGL - SSAO](https://learnopengl.com/Advanced-Lighting/SSAO)

## See Also

- [GBufferPass.md](./GBufferPass.md) - G-Buffer generation
- [LightingPass.md](./LightingPass.md) - Deferred lighting
- [RenderPipeline.md](./RenderPipeline.md) - Overall pipeline architecture
