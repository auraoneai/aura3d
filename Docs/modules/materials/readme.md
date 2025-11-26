# G3D 5.0 Material System

Comprehensive material system implementing PRD Section 7.1 - Materials.

## Overview

The G3D Material System provides a flexible, extensible framework for defining how surfaces appear when rendered. All materials support both WebGPU and WebGL2 backends and integrate seamlessly with the shader system.

## Architecture

### Base Classes

#### `Material.ts` (~500 lines)
Abstract base class for all materials providing:
- Shader access via `getShader()` and `getShaderVariant(defines)`
- Parameter management with type checking and validation
- Render state control (renderQueue, blendMode, cullMode, depth)
- GPU resource binding via `bind(device, context)`
- Material cloning and serialization

#### `MaterialInstance.ts` (~350 lines)
Per-entity parameter overrides:
- Memory efficient (only stores differences from base material)
- Allows many entities to share a base material
- Override management with `setParameter()`, `getParameter()`, `clearOverride()`
- Separate bind groups for instance-specific parameters

---

## Material Types

### PBR Materials

#### `StandardPBRMaterial.ts` (~500 lines)
Full physically-based rendering workflow:
- **Albedo**: Base color with optional texture map
- **Metallic-Roughness**: PBR workflow with texture support
- **Normal Mapping**: Surface detail with configurable intensity
- **Ambient Occlusion**: AO map with intensity control
- **Emission**: Emissive surfaces with HDR support
- **Detail Textures**: Secondary albedo/normal with separate UV tiling
- **Alpha Modes**: Opaque, mask (cutoff), and blend
- **IBL Integration**: Environment maps, irradiance, BRDF LUT
- **Shadow Receiving**: Full shadow support

**Shader Features**:
- GGX distribution function
- Smith geometric shadowing
- Fresnel-Schlick approximation
- Energy-conserving BRDF

---

### NPR Materials

#### `ToonMaterial.ts` (~400 lines)
Non-photorealistic cel-shaded rendering:
- **Discrete Lighting Bands**: Configurable band count (2-10)
- **Outline Rendering**: Screen-space or mesh expansion methods
- **Rim Lighting**: Configurable color, power, and intensity
- **Specular Bands**: Discrete specular highlights
- **Hatching Patterns**: Cross-hatching texture support
- **Shadow Colors**: Customizable shadow tint

**Use Cases**: Anime-style games, stylized visuals, comic book aesthetics

---

### Specialized Materials

#### `SubsurfaceMaterial.ts` (~400 lines)
Subsurface scattering for translucent materials:
- **SSS Approximation**: Diffusion profile-based scattering
- **Configurable Parameters**: Color, radius, intensity
- **Thickness Maps**: Per-pixel thickness variation
- **Screen-Space Blur**: Post-process SSS blur
- **Transmission**: Light passing through the material

**Use Cases**: Skin, wax, marble, jade, leaves, fruit

---

#### `HairMaterial.ts` (~450 lines)
Anisotropic hair shading:
- **Shading Models**: Kajiya-Kay or Marschner
- **Dual Specular Lobes**: Primary and secondary highlights
- **Shift Maps**: Per-strand highlight variation
- **Transmission**: Light through hair fibers
- **Anisotropic Highlights**: Elongated specular along hair direction

**Use Cases**: Character hair, fur, grass, fabric fibers

---

#### `ClothMaterial.ts` (~400 lines)
Fabric and textile rendering:
- **Sheen Layer**: Velvet and silk appearance
- **Subsurface Scattering**: Soft light diffusion
- **Anisotropic Reflections**: Weave pattern highlights
- **Fuzz/Fiber Detail**: Micro-fiber surface detail

**Use Cases**: Clothing, upholstery, carpets, curtains

---

#### `TransmissionMaterial.ts` (~400 lines)
Transparent and refractive materials:
- **Refraction**: Configurable index of refraction (IOR)
- **Chromatic Dispersion**: Rainbow effect (optional)
- **Absorption**: Beer's law depth-based coloring
- **Thickness Maps**: Per-pixel thickness variation
- **Fresnel**: Physically accurate reflection/transmission

**Use Cases**: Glass, water, ice, crystal, plastic

---

#### `OceanMaterial.ts` (~450 lines)
Advanced water rendering:
- **FFT Displacement**: Wave height maps
- **Foam Generation**: Wave peak and shore foam
- **Subsurface Scattering**: Light through water
- **Reflection/Refraction**: Dual-layer rendering
- **Depth-Based Color**: Shallow to deep water transition
- **Caustics**: Optional underwater light patterns

**Use Cases**: Oceans, lakes, rivers, pools

---

#### `TerrainMaterial.ts` (~400 lines)
Multi-layer terrain blending:
- **Splat Maps**: Up to 16 layer support (4 per splat map)
- **Triplanar Mapping**: Eliminate UV stretching on steep slopes
- **Height-Based Blending**: Natural layer transitions
- **Detail Textures**: Per-layer normal/roughness
- **Distance LOD**: Far texture simplification

**Use Cases**: Landscapes, ground surfaces, cliffs

---

## Material Presets

### `MaterialPresets.ts` (~350 lines)

Pre-configured materials with physically accurate values:

#### Metals
- **Gold**: F0 = (1.022, 0.782, 0.344), Metallic = 1.0, Roughness = 0.2
- **Silver**: F0 = (0.972, 0.960, 0.915), Metallic = 1.0, Roughness = 0.15
- **Copper**: F0 = (0.955, 0.638, 0.538), Metallic = 1.0, Roughness = 0.25
- **Iron**: F0 = (0.560, 0.570, 0.580), Metallic = 1.0, Roughness = 0.4
- **Aluminum**: F0 = (0.913, 0.921, 0.925), Metallic = 1.0, Roughness = 0.3

#### Non-Metals
- **Plastic**: Roughness = 0.5
- **Rubber**: Roughness = 0.9
- **Wood**: Roughness = 0.7
- **Concrete**: Roughness = 0.85
- **Fabric**: Cloth material with sheen

#### Special
- **Glass**: Transmission = 1.0, IOR = 1.5
- **Water**: Ocean material with waves
- **Skin**: Subsurface scattering
- **Eye**: High SSS intensity
- **Hair**: Anisotropic shading

### Usage

```typescript
import { MaterialPresets } from './materials';

// Use preset directly
const goldMaterial = MaterialPresets.gold;

// Create with overrides
const roughGold = MaterialPresets.create('gold', { roughness: 0.5 });

// Custom glass
const crown = MaterialPresets.create('glass', { ior: 1.52 });
```

---

## Common Workflows

### Creating a Custom PBR Material

```typescript
import { StandardPBRMaterial } from './materials';
import { Color } from '../math/Color';
import { Vector2 } from '../math/Vector2';

const material = new StandardPBRMaterial('MyMaterial');
material.albedo = new Color(0.8, 0.2, 0.2);
material.metallic = 0.0;
material.roughness = 0.5;
material.emissive = new Color(1, 0, 0);
material.emissiveIntensity = 2.0;
material.tiling = new Vector2(2, 2);
```

### Using Material Instances

```typescript
import { MaterialInstance } from './materials';

// Create base material
const baseMaterial = MaterialPresets.create('plastic');

// Create instances for different entities
const redPlastic = new MaterialInstance(baseMaterial);
redPlastic.setParameter('albedo', new Color(1, 0, 0));

const bluePlastic = new MaterialInstance(baseMaterial);
bluePlastic.setParameter('albedo', new Color(0, 0, 1));

// Instances share shader but have different colors
// Memory efficient!
```

### Material with Textures

```typescript
const material = new StandardPBRMaterial('Textured');

// Load textures (assuming texture loading system)
material.albedoMap = await loadTexture('diffuse.png');
material.normalMap = await loadTexture('normal.png');
material.metallicMap = await loadTexture('metallic.png');
material.roughnessMap = await loadTexture('roughness.png');
material.aoMap = await loadTexture('ao.png');

// Configure
material.normalScale = 1.5;
material.aoIntensity = 0.8;
```

---

## Render State

All materials expose render state properties:

```typescript
material.renderQueue = RenderQueue.TRANSPARENT;
material.blendMode = BlendMode.ALPHA;
material.cullMode = CullMode.BACK;
material.depthTest = true;
material.depthWrite = false;
```

### Render Queue Priorities
- `BACKGROUND = 1000`: Skybox, background
- `OPAQUE = 2000`: Most solid objects
- `TRANSPARENT = 3000`: Glass, water, particles
- `OVERLAY = 4000`: UI, screen effects

### Blend Modes
- `OPAQUE`: No blending
- `ALPHA`: Standard alpha blending
- `ADDITIVE`: Add to framebuffer (glow, fire)
- `MULTIPLY`: Multiply with framebuffer
- `PREMULTIPLIED`: Premultiplied alpha

---

## Shader Variants

Materials automatically generate shader variants based on features:

```typescript
// Shader automatically includes defines based on material state
material.normalMap = someTexture;  // Adds USE_NORMAL_MAP define
material.alphaMode = 'mask';       // Adds ALPHA_MODE_MASK define

// Get specific variant
const shader = material.getShaderVariant({
  USE_NORMAL_MAP: '1',
  USE_AO_MAP: '1',
  USE_IBL: '1'
});
```

---

## Performance Considerations

### Memory Efficiency
- Use `MaterialInstance` for per-entity variations
- Share base materials across many entities
- Only override parameters that differ

### Shader Variants
- Variants are cached automatically
- Minimize runtime variant generation
- Preload common variants during loading

### Texture Management
- Use texture atlases where possible
- Share textures between materials
- Implement texture streaming for large scenes

---

## Integration with Rendering

### Binding Materials

```typescript
// In render loop
const bindGroup = material.bind(device, context);

// Material automatically:
// - Creates GPU bind groups
// - Uploads uniform data
// - Binds textures
// - Caches for reuse
```

### Shader Integration

Materials work with the shader system:

```typescript
const shader = material.getShader();
const pipeline = device.createRenderPipeline({
  vertex: shader.vertexSource,
  fragment: shader.fragmentSource,
  // ... other pipeline state
});
```

---

## Extending the System

### Creating Custom Materials

```typescript
import { Material, MaterialParameter, GPUBindGroup } from './materials';

export class MyCustomMaterial extends Material {
  // Properties
  customColor: Color = new Color(1, 1, 1);
  customIntensity: number = 1.0;

  getShader(): ShaderProgram {
    return this.getShaderVariant({});
  }

  getShaderVariant(defines: Record<string, string>): ShaderProgram {
    // Generate or retrieve shader
    return {
      id: 'my_custom',
      vertexSource: '...',
      fragmentSource: '...',
      uniforms: [...],
      attributes: [...]
    };
  }

  getParameters(): MaterialParameter[] {
    return [
      {
        name: 'customColor',
        type: 'color',
        defaultValue: new Color(1, 1, 1),
        description: 'Custom color parameter'
      }
    ];
  }

  protected createBindGroup(device: RenderDevice, context: RenderContext): GPUBindGroup {
    // Create GPU resources
    return { webgpu: null, webgl: null };
  }

  protected createClone(): Material {
    const clone = new MyCustomMaterial(this.name);
    clone.customColor = this.customColor.clone();
    clone.customIntensity = this.customIntensity;
    return clone;
  }
}
```

---

## Testing

All materials should be tested for:
- Parameter validation and ranges
- Shader variant generation
- Binding and resource management
- Cloning and serialization
- Visual correctness (regression tests)

---

## Future Enhancements

Planned additions:
- Material layers/blending
- Procedural materials
- Material LOD
- Shader graph integration
- Hot reloading in editor
- Material templates
- GPU-driven material sorting

---

## References

- [PRD Section 7.1](../../Docs/PRD-Final-03-Shaders-Materials-PostFX.md)
- [Shader System](../shaders/)
- [Rendering System](../rendering/)

---

## File Summary

| File | Lines | Purpose |
|------|-------|---------|
| Material.ts | 500 | Base material class |
| MaterialInstance.ts | 350 | Per-entity overrides |
| StandardPBRMaterial.ts | 500 | PBR workflow |
| ToonMaterial.ts | 400 | Cel-shaded NPR |
| SubsurfaceMaterial.ts | 400 | SSS for translucent objects |
| HairMaterial.ts | 450 | Anisotropic hair |
| ClothMaterial.ts | 400 | Fabric shading |
| TransmissionMaterial.ts | 400 | Glass/refraction |
| OceanMaterial.ts | 450 | Advanced water |
| TerrainMaterial.ts | 400 | Multi-layer terrain |
| MaterialPresets.ts | 350 | Pre-configured materials |
| index.ts | 40 | Barrel exports |
| **TOTAL** | **~4,240 lines** | Complete material system |

---

**Status**: ✅ Complete - All PRD requirements implemented
