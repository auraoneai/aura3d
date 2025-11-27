# Material System GPU Binding Implementation

## Overview

This document describes the GPU data upload implementation added to the G3D 5.0 material system. Previously, materials packed their properties into uniform buffers but never actually uploaded them to the GPU. This implementation fixes that critical gap.

## Changes Made

### 1. Material.ts - Core PBR Material

**Added: `bind(gl: WebGL2RenderingContext, program: WebGLProgram)` method**

This is the primary method that uploads material data to the GPU. It performs:

- **Uniform Upload**: Uploads all PBR properties as individual shader uniforms
  - `u_albedo`: vec3 - Base color
  - `u_metallic`: float - Metallic factor
  - `u_roughness`: float - Roughness factor
  - `u_ao`: float - Ambient occlusion
  - `u_emission`: vec3 - Emission color
  - `u_emissionIntensity`: float - Emission multiplier

- **Texture Binding**: Binds textures to appropriate texture units
  - Activates texture unit (`gl.activeTexture(GL_TEXTURE0 + unit)`)
  - Binds WebGL texture handle (`gl.bindTexture(GL_TEXTURE_2D, glTexture)`)
  - Sets sampler uniform (`gl.uniform1i(samplerLocation, unit)`)
  - Manages texture unit allocation automatically
  - Uploads texture flags (`u_hasAlbedoMap`, `u_hasNormalMap`, etc.)

- **Render State Application**: Applies material render state to WebGL
  - Culling mode (back/front/none)
  - Depth test function (less, lequal, always, etc.)
  - Depth write enable/disable
  - Alpha blending (blend/opaque/mask)

**Added: `applyRenderState(gl: WebGL2RenderingContext)` private method**

Handles render state configuration:

```typescript
// Culling
if (cullMode === CullMode.None) {
  gl.disable(gl.CULL_FACE);
} else {
  gl.enable(gl.CULL_FACE);
  gl.cullFace(cullMode === CullMode.Back ? gl.BACK : gl.FRONT);
}

// Depth test
gl.depthFunc(depthFuncMap[depthTest]);
gl.depthMask(depthWrite);

// Blending
if (alphaMode === AlphaMode.Blend) {
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
}
```

### 2. ShaderMaterial.ts - Custom Shader Material

**Added: `apply(gl: WebGL2RenderingContext, program: WebGLProgram)` method**

Implements type-specific uniform upload for custom shaders:

| Uniform Type | GLSL Type | Upload Method |
|-------------|-----------|---------------|
| Float | `float` | `gl.uniform1f()` |
| Vec2 | `vec2` | `gl.uniform2f()` or `gl.uniform2fv()` |
| Vec3 | `vec3` | `gl.uniform3f()` or `gl.uniform3fv()` |
| Vec4 | `vec4` | `gl.uniform4f()` or `gl.uniform4fv()` |
| Int | `int` | `gl.uniform1i()` |
| IVec2 | `ivec2` | `gl.uniform2i()` |
| IVec3 | `ivec3` | `gl.uniform3i()` |
| IVec4 | `ivec4` | `gl.uniform4i()` |
| Bool | `bool` | `gl.uniform1i()` (0 or 1) |
| Mat3 | `mat3` | `gl.uniformMatrix3fv()` |
| Mat4 | `mat4` | `gl.uniformMatrix4fv()` |
| Sampler2D | `sampler2D` | Texture binding + `gl.uniform1i()` |
| SamplerCube | `samplerCube` | Cubemap binding + `gl.uniform1i()` |

**Type Detection**

The method automatically detects value types:
- `Vector2`, `Vector3`, `Vector4` - Math vector classes
- `Color` - Treated as `vec4`
- `Matrix3`, `Matrix4` - Matrix classes
- `Texture` - Automatically determines 2D vs Cube
- `number` - Float or int based on type annotation
- `boolean` - Converted to 0/1
- `Float32Array` / `Array` - Used for array uniforms

**Texture Unit Management**

```typescript
let textureUnit = 0;
for (const [name, uniform] of this.uniforms) {
  if (uniform.type === UniformType.Sampler2D) {
    gl.activeTexture(gl.TEXTURE0 + textureUnit);
    gl.bindTexture(gl.TEXTURE_2D, texture.getGLTexture());
    gl.uniform1i(location, textureUnit);
    textureUnit++;
  }
}
```

### 3. StandardPBRMaterial.ts - NEW FILE

A specialized PBR material implementation extending the base `Material` class with:

**Convenience API**

```typescript
// Setter methods
material.setAlbedo(new Color(1, 0, 0));
material.setMetallic(0.8);
material.setRoughness(0.3);
material.setEmission(new Color(0, 1, 0));
material.setEmissionIntensity(2.0);

// Texture setters
material.setAlbedoMap(texture);
material.setNormalMap(normalTexture);
material.setMetallicRoughnessMap(mrTexture);
```

**Factory Methods**

```typescript
// Create metallic material
const gold = StandardPBRMaterial.createMetal(
  new Color(1.0, 0.782, 0.344),
  0.3 // roughness
);

// Create dielectric material
const plastic = StandardPBRMaterial.createDielectric(
  new Color(0.8, 0.1, 0.1),
  0.4 // roughness
);

// Create emissive material
const neon = StandardPBRMaterial.createEmissive(
  new Color(0, 1, 0.5),
  3.0 // intensity
);
```

**Material Presets**

```typescript
const gold = StandardPBRMaterial.fromPreset('gold');
const silver = StandardPBRMaterial.fromPreset('silver');
const copper = StandardPBRMaterial.fromPreset('copper');
const iron = StandardPBRMaterial.fromPreset('iron');
const plasticRed = StandardPBRMaterial.fromPreset('plastic-red');
const plasticBlue = StandardPBRMaterial.fromPreset('plastic-blue');
const rubber = StandardPBRMaterial.fromPreset('rubber');
const wood = StandardPBRMaterial.fromPreset('wood');
```

**Available Presets**

| Preset | Albedo | Metallic | Roughness | Description |
|--------|--------|----------|-----------|-------------|
| gold | (1.0, 0.782, 0.344) | 1.0 | 0.3 | Shiny gold metal |
| silver | (0.972, 0.960, 0.915) | 1.0 | 0.2 | Polished silver |
| copper | (0.955, 0.637, 0.538) | 1.0 | 0.4 | Copper metal |
| iron | (0.560, 0.570, 0.580) | 1.0 | 0.5 | Iron/steel |
| plastic-red | (0.8, 0.1, 0.1) | 0.0 | 0.4 | Red plastic |
| plastic-blue | (0.1, 0.3, 0.8) | 0.0 | 0.4 | Blue plastic |
| rubber | (0.2, 0.2, 0.2) | 0.0 | 0.9 | Black rubber |
| wood | (0.6, 0.4, 0.2) | 0.0 | 0.7 | Wood surface |

## Integration with Renderer

The material system is designed to work with the PBR shader in `Renderer.ts`:

```typescript
// In render loop
const gl = renderer.getDevice().getGL();
const program = pbrShader.getProgram();

// Bind material (uploads uniforms and textures)
material.bind(gl, program);

// Render mesh
mesh.render();
```

## Usage Examples

### Basic PBR Material

```typescript
import { Material } from 'g3d';
import { Color } from 'g3d';

const material = new Material({
  name: 'MyMaterial',
  properties: {
    albedo: new Color(0.8, 0.2, 0.1),
    metallic: 0.7,
    roughness: 0.3,
    ao: 1.0,
  },
});

// Upload to GPU
const gl = renderer.getDevice().getGL();
const program = shader.getProgram();
material.bind(gl, program);
```

### Textured Material

```typescript
import { Material } from 'g3d';

const material = new Material({
  name: 'TexturedMaterial',
  properties: {
    albedo: new Color(1, 1, 1),
    metallic: 0.0,
    roughness: 0.5,
  },
});

// Load and set textures
const albedoTex = await textureLoader.load('albedo.png');
const normalTex = await textureLoader.load('normal.png');
const mrTex = await textureLoader.load('metallic_roughness.png');

material.setTexture('albedoMap', albedoTex);
material.setTexture('normalMap', normalTex);
material.setTexture('metallicRoughnessMap', mrTex);

// Bind will automatically handle texture upload
material.bind(gl, program);
```

### Custom Shader Material

```typescript
import { ShaderMaterial, UniformType } from 'g3d';
import { Vector3, Matrix4 } from 'g3d';

const customShader = new ShaderMaterial({
  name: 'CustomEffect',
  vertex: vertexShaderSource,
  fragment: fragmentShaderSource,
});

// Set uniforms
customShader.setUniform('uTime', 1.5);
customShader.setUniform('uColor', new Vector3(1, 0, 0));
customShader.setUniform('uTransform', Matrix4.identity());
customShader.setUniform('uLightCount', 3);

// Apply to GPU
customShader.apply(gl, program);
```

### StandardPBRMaterial

```typescript
import { StandardPBRMaterial } from 'g3d';
import { Color } from 'g3d';

// Using preset
const gold = StandardPBRMaterial.fromPreset('gold');

// Custom material
const custom = new StandardPBRMaterial({
  name: 'CustomPBR',
  albedo: new Color(0.8, 0.2, 0.1),
  metallic: 0.5,
  roughness: 0.4,
});

// Update at runtime
custom.setRoughness(0.6);
custom.setAlbedo(new Color(0.9, 0.3, 0.2));

// Bind inherits from Material
custom.bind(gl, program);
```

## Performance Considerations

### Uniform Location Caching

The current implementation queries uniform locations on every bind. For production use, consider caching:

```typescript
private uniformLocations = new Map<string, WebGLUniformLocation>();

bind(gl: WebGL2RenderingContext, program: WebGLProgram): void {
  if (!this.uniformLocations.has('u_albedo')) {
    this.uniformLocations.set('u_albedo', gl.getUniformLocation(program, 'u_albedo'));
  }
  const loc = this.uniformLocations.get('u_albedo');
  gl.uniform3f(loc, r, g, b);
}
```

### Dirty State Tracking

The material system tracks dirty state to avoid redundant uniform uploads:

```typescript
// Only pack uniforms if properties changed
if (this.uniformsDirty) {
  this.packUniforms();
}
```

### Texture Unit Management

Texture units are allocated sequentially starting from 0. For complex scenes with many textures, consider:
- Global texture unit manager
- Texture atlas to reduce texture count
- Texture streaming for large datasets

## Shader Compatibility

The material system expects the following uniform naming convention in shaders:

### Material Properties
- `u_albedo`: vec3
- `u_metallic`: float
- `u_roughness`: float
- `u_ao`: float
- `u_emission`: vec3
- `u_emissionIntensity`: float

### Texture Flags
- `u_hasAlbedoMap`: int (0 or 1)
- `u_hasNormalMap`: int (0 or 1)
- `u_hasMetallicRoughnessMap`: int (0 or 1)
- `u_hasAOMap`: int (0 or 1)
- `u_hasEmissionMap`: int (0 or 1)

### Texture Samplers
- `u_albedoMap`: sampler2D
- `u_normalMap`: sampler2D
- `u_metallicRoughnessMap`: sampler2D
- `u_aoMap`: sampler2D
- `u_emissionMap`: sampler2D

## Testing

A comprehensive test file is provided at `examples/material-gpu-binding-test.ts` demonstrating:
1. Material.bind() PBR material upload
2. ShaderMaterial.apply() custom shader uniforms
3. StandardPBRMaterial convenience API
4. Texture binding workflow
5. Render state management

Run with:
```bash
npm run dev examples/material-gpu-binding-test.ts
```

## Future Enhancements

Potential improvements for future versions:

1. **Uniform Buffer Objects (UBOs)**
   - Pack all material properties into a single UBO
   - Reduces uniform upload overhead
   - Better for many materials

2. **Material Instancing**
   - Share uniform data across multiple draw calls
   - Reduce state changes

3. **Bindless Textures**
   - Use bindless texture extension when available
   - Eliminates texture unit limitations

4. **Material Variants**
   - Pre-compiled shader variants based on features
   - Faster runtime switching

5. **Material Batching**
   - Sort and batch materials by properties
   - Minimize state changes

## Conclusion

The material system now properly uploads data to the GPU through:
- `Material.bind()` for PBR materials
- `ShaderMaterial.apply()` for custom shaders
- `StandardPBRMaterial` for convenient PBR workflow

All materials integrate seamlessly with the PBR shader pipeline in the renderer.
