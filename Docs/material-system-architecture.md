# Material System Architecture

## Overview

The G3D 5.0 material system provides a complete GPU-integrated material pipeline with three complementary implementations.

## Class Hierarchy

```
Material (Base Class)
├── Properties: albedo, metallic, roughness, ao, emission
├── Textures: albedoMap, normalMap, metallicRoughnessMap, aoMap, emissionMap
├── State: alphaMode, cullMode, depthTest, depthWrite
└── Methods:
    ├── bind(gl, program) ➜ Uploads to GPU
    ├── setProperty(key, value)
    ├── setTexture(slot, texture)
    └── packUniforms()

StandardPBRMaterial (extends Material)
├── Inherits: All Material functionality
├── Adds: Convenience setters/getters
└── Methods:
    ├── setAlbedo(color)
    ├── setMetallic(value)
    ├── setRoughness(value)
    ├── createMetal(color, roughness)
    ├── createDielectric(color, roughness)
    └── fromPreset(name)

ShaderMaterial (Independent)
├── Custom shader code (vertex + fragment)
├── User-defined uniforms (Map<name, uniform>)
├── Shader defines/macros
└── Methods:
    ├── apply(gl, program) ➜ Uploads to GPU
    ├── setUniform(name, value)
    ├── setTexture(name, texture)
    └── updateShader(vertex, fragment)
```

## Data Flow

### Material Binding Pipeline

```
┌─────────────────┐
│  Application    │
│  (Game Code)    │
└────────┬────────┘
         │
         │ material.setProperty('albedo', color)
         │ material.setTexture('albedoMap', texture)
         ├─────────────────────────────────────┐
         │                                     │
         ▼                                     ▼
┌─────────────────┐                  ┌─────────────────┐
│  Material       │                  │ ShaderMaterial  │
│  Properties     │                  │ Custom Uniforms │
└────────┬────────┘                  └────────┬────────┘
         │                                     │
         │ uniformsDirty = true                │
         │                                     │
         ▼                                     ▼
┌─────────────────┐                  ┌─────────────────┐
│  packUniforms() │                  │  (stored in     │
│  Float32Array   │                  │   Map)          │
└────────┬────────┘                  └────────┬────────┘
         │                                     │
         │ material.bind(gl, program)          │ material.apply(gl, program)
         │                                     │
         ├─────────────────────────────────────┤
         │                                     │
         ▼                                     ▼
┌───────────────────────────────────────────────────┐
│         WebGL2 Rendering Context                  │
│                                                   │
│  • gl.uniform3f(u_albedo, r, g, b)               │
│  • gl.uniform1f(u_metallic, value)               │
│  • gl.uniform1f(u_roughness, value)              │
│  • gl.uniformMatrix4fv(u_transform, matrix)      │
│                                                   │
│  • gl.activeTexture(GL_TEXTURE0 + unit)          │
│  • gl.bindTexture(GL_TEXTURE_2D, texture)        │
│  • gl.uniform1i(u_albedoMap, unit)               │
│                                                   │
│  • gl.enable/disable(GL_CULL_FACE)               │
│  • gl.depthFunc(GL_LESS)                         │
│  • gl.blendFunc(GL_SRC_ALPHA, ...)               │
└───────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────┐
│   GPU Memory    │
│                 │
│  Uniform Buffer │
│  Texture Units  │
│  Render State   │
└─────────────────┘
```

## GPU Upload Details

### Material.bind() - PBR Material

```typescript
bind(gl: WebGL2RenderingContext, program: WebGLProgram): void {
  // 1. Pack uniforms if dirty
  if (this.uniformsDirty) {
    this.packUniforms();
  }

  // 2. Upload properties
  gl.uniform3f(u_albedo, r, g, b);
  gl.uniform1f(u_metallic, metallic);
  gl.uniform1f(u_roughness, roughness);
  // ... more properties

  // 3. Bind textures
  textureUnit = 0;
  if (albedoMap) {
    gl.activeTexture(GL_TEXTURE0 + textureUnit);
    gl.bindTexture(GL_TEXTURE_2D, albedoMap.glTexture);
    gl.uniform1i(u_albedoMap, textureUnit++);
  }
  // ... more textures

  // 4. Apply render state
  this.applyRenderState(gl);
}
```

### ShaderMaterial.apply() - Custom Shader

```typescript
apply(gl: WebGL2RenderingContext, program: WebGLProgram): void {
  textureUnit = 0;

  for (const [name, uniform] of this.uniforms) {
    const location = gl.getUniformLocation(program, name);

    switch (uniform.type) {
      case UniformType.Float:
        gl.uniform1f(location, value);
        break;
      case UniformType.Vec3:
        gl.uniform3f(location, x, y, z);
        break;
      case UniformType.Mat4:
        gl.uniformMatrix4fv(location, false, matrix);
        break;
      case UniformType.Sampler2D:
        gl.activeTexture(GL_TEXTURE0 + textureUnit);
        gl.bindTexture(GL_TEXTURE_2D, texture);
        gl.uniform1i(location, textureUnit++);
        break;
      // ... more types
    }
  }
}
```

## Texture Unit Management

```
┌──────────────────────────────────────────────────┐
│           WebGL Texture Units (0-15+)            │
├──────────────────────────────────────────────────┤
│ Unit 0: Albedo Map        ← gl.activeTexture(0) │
│ Unit 1: Normal Map        ← gl.activeTexture(1) │
│ Unit 2: Metallic/Rough    ← gl.activeTexture(2) │
│ Unit 3: AO Map            ← gl.activeTexture(3) │
│ Unit 4: Emission Map      ← gl.activeTexture(4) │
│ Unit 5: Shadow Map        ← gl.activeTexture(5) │
│ Unit 6: Env Map           ← gl.activeTexture(6) │
│ Unit 7: ...               ← gl.activeTexture(7) │
└──────────────────────────────────────────────────┘
         │
         │ Sequential allocation by Material.bind()
         │ or ShaderMaterial.apply()
         │
         ▼
┌──────────────────────────────────────────────────┐
│              Shader Samplers                     │
├──────────────────────────────────────────────────┤
│ uniform sampler2D u_albedoMap;      // Unit 0   │
│ uniform sampler2D u_normalMap;      // Unit 1   │
│ uniform sampler2D u_metallicRough;  // Unit 2   │
│ uniform sampler2D u_aoMap;          // Unit 3   │
│ uniform sampler2D u_emissionMap;    // Unit 4   │
└──────────────────────────────────────────────────┘
```

## Render State Management

```
┌────────────────────────────────────┐
│     Material Render State          │
├────────────────────────────────────┤
│ alphaMode: Opaque / Blend / Mask   │
│ cullMode: Back / Front / None      │
│ depthTest: Less / LessEqual / ...  │
│ depthWrite: true / false           │
│ doubleSided: true / false          │
└────────┬───────────────────────────┘
         │
         │ applyRenderState(gl)
         │
         ▼
┌────────────────────────────────────┐
│      WebGL State Machine           │
├────────────────────────────────────┤
│ Culling:                           │
│   gl.enable(CULL_FACE)             │
│   gl.cullFace(BACK)                │
│                                    │
│ Depth:                             │
│   gl.depthFunc(LESS)               │
│   gl.depthMask(true)               │
│                                    │
│ Blending:                          │
│   gl.enable(BLEND)                 │
│   gl.blendFunc(SRC_ALPHA, ...)     │
└────────────────────────────────────┘
```

## Usage Patterns

### Pattern 1: PBR Material with Textures

```typescript
// Create material
const material = new Material({
  properties: {
    albedo: new Color(1, 1, 1),
    metallic: 0.0,
    roughness: 0.5,
  },
});

// Load textures
const albedo = await loader.load('albedo.png');
const normal = await loader.load('normal.png');

material.setTexture('albedoMap', albedo);
material.setTexture('normalMap', normal);

// Render loop
gl.useProgram(pbrShader);
material.bind(gl, pbrShader);
mesh.render();
```

### Pattern 2: Custom Effect with ShaderMaterial

```typescript
// Create custom shader
const shader = new ShaderMaterial({
  vertex: customVS,
  fragment: customFS,
});

// Set uniforms
shader.setUniform('uTime', time);
shader.setUniform('uColor', color);
shader.setUniform('uMainTex', texture);

// Render loop
gl.useProgram(shader.getProgram());
shader.apply(gl, shader.getProgram());
mesh.render();
```

### Pattern 3: StandardPBRMaterial Quick Setup

```typescript
// Preset material
const gold = StandardPBRMaterial.fromPreset('gold');

// Or custom
const plastic = new StandardPBRMaterial({
  albedo: new Color(0.8, 0.1, 0.1),
  roughness: 0.4,
});

// Update at runtime
plastic.setRoughness(0.6);

// Bind (inherited from Material)
plastic.bind(gl, pbrShader);
```

## Performance Characteristics

### Material.bind()
- **Time Complexity:** O(n) where n = number of textures
- **GPU Uploads:** ~6-10 uniforms + n textures
- **State Changes:** 3-5 GL state changes
- **Optimization:** Dirty flag prevents redundant uploads

### ShaderMaterial.apply()
- **Time Complexity:** O(m) where m = number of uniforms
- **GPU Uploads:** m uniforms + texture count
- **State Changes:** None (only data upload)
- **Optimization:** Skips optimized-out uniforms

### Render State
- **Time Complexity:** O(1)
- **State Changes:** 3-5 GL state changes
- **Optimization:** Should batch by material to minimize

## Memory Layout

### Material Uniform Buffer (Float32Array)

```
Offset | Type   | Name              | Size
-------|--------|-------------------|------
0-3    | vec4   | albedo (rgba)     | 4
4      | float  | metallic          | 1
5      | float  | roughness         | 1
6      | float  | ao                | 1
7      | float  | normalScale       | 1
8-10   | vec3   | emission (rgb)    | 3
11     | float  | emissionIntensity | 1
12     | float  | heightScale       | 1
13     | float  | alphaCutoff       | 1
14-15  | -      | (padding)         | 2
-------|--------|-------------------|------
Total: 16 floats = 64 bytes
```

## Integration Points

### With Renderer.ts

```typescript
// In renderSceneMeshes()
const material = node.material;

if (material instanceof Material) {
  // PBR material path
  material.bind(gl, this.simpleShaderProgram);
} else if (material instanceof ShaderMaterial) {
  // Custom shader path
  material.apply(gl, material.getProgram());
}

// Draw
gl.bindVertexArray(buffers.vao);
gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0);
```

### Shader Compatibility

Materials require these uniforms in shaders:

```glsl
// Material properties
uniform vec3 u_albedo;
uniform float u_metallic;
uniform float u_roughness;
uniform float u_ao;
uniform vec3 u_emission;
uniform float u_emissionIntensity;

// Texture flags (0 or 1)
uniform int u_hasAlbedoMap;
uniform int u_hasNormalMap;
uniform int u_hasMetallicRoughnessMap;
uniform int u_hasAOMap;
uniform int u_hasEmissionMap;

// Texture samplers
uniform sampler2D u_albedoMap;
uniform sampler2D u_normalMap;
uniform sampler2D u_metallicRoughnessMap;
uniform sampler2D u_aoMap;
uniform sampler2D u_emissionMap;
```

## Error Handling

Both `bind()` and `apply()` handle missing uniforms gracefully:

```typescript
const location = gl.getUniformLocation(program, name);
if (!location) {
  // Uniform doesn't exist or was optimized out
  continue; // Skip silently
}
```

This allows shaders to omit unused uniforms without causing errors.

## Summary

The material system provides:

1. **Material** - Complete PBR workflow with automatic GPU upload
2. **ShaderMaterial** - Flexible custom shader support
3. **StandardPBRMaterial** - High-level convenience API

All three implementations properly upload data to the GPU, resolving the critical "packed but never uploaded" issue.
