# G3D 5.0 Shader System - Complete Examples

## Example 1: Basic Shader Creation

```typescript
import { Shader } from './rendering/shader';

// Create a simple shader
const simpleShader = new Shader({
  name: 'SimpleColor',
  source: {
    vertex: `#version 300 es
      precision highp float;

      in vec3 a_position;
      in vec3 a_color;

      uniform mat4 u_modelMatrix;
      uniform mat4 u_viewMatrix;
      uniform mat4 u_projectionMatrix;

      out vec3 v_color;

      void main() {
        v_color = a_color;
        gl_Position = u_projectionMatrix * u_viewMatrix * u_modelMatrix * vec4(a_position, 1.0);
      }
    `,
    fragment: `#version 300 es
      precision highp float;

      in vec3 v_color;
      out vec4 fragColor;

      void main() {
        fragColor = vec4(v_color, 1.0);
      }
    `
  },
  gl: gl
});

// Use the shader
simpleShader.bind();
simpleShader.setUniform('u_modelMatrix', modelMatrix);
simpleShader.setUniform('u_viewMatrix', viewMatrix);
simpleShader.setUniform('u_projectionMatrix', projectionMatrix);

// Draw
gl.drawArrays(gl.TRIANGLES, 0, vertexCount);

simpleShader.unbind();
```

## Example 2: Shader with Preprocessing

```typescript
import { Shader } from './rendering/shader';

const advancedShader = new Shader({
  name: 'AdvancedPBR',
  source: {
    vertex: `#version 300 es
      precision highp float;

      #include <common_math>

      in vec3 a_position;
      in vec3 a_normal;
      in vec2 a_texcoord;
      #ifdef USE_NORMAL_MAP
        in vec4 a_tangent;
      #endif

      uniform mat4 u_modelMatrix;
      uniform mat4 u_viewMatrix;
      uniform mat4 u_projectionMatrix;
      uniform mat3 u_normalMatrix;

      out vec3 v_worldPosition;
      out vec3 v_normal;
      out vec2 v_texcoord;
      #ifdef USE_NORMAL_MAP
        out mat3 v_TBN;
      #endif

      void main() {
        vec4 worldPos = u_modelMatrix * vec4(a_position, 1.0);
        v_worldPosition = worldPos.xyz;
        v_normal = normalize(u_normalMatrix * a_normal);
        v_texcoord = a_texcoord;

        #ifdef USE_NORMAL_MAP
          vec3 T = normalize(u_normalMatrix * a_tangent.xyz);
          vec3 N = v_normal;
          vec3 B = cross(N, T) * a_tangent.w;
          v_TBN = mat3(T, B, N);
        #endif

        gl_Position = u_projectionMatrix * u_viewMatrix * worldPos;
      }
    `,
    fragment: `#version 300 es
      precision highp float;

      #include <common_math>
      #include <pbr_brdf>
      #include <lighting_basic>

      #ifdef USE_SHADOWS
        #include <shadow_sampling>
      #endif

      in vec3 v_worldPosition;
      in vec3 v_normal;
      in vec2 v_texcoord;
      #ifdef USE_NORMAL_MAP
        in mat3 v_TBN;
      #endif

      uniform vec3 u_cameraPosition;
      uniform vec3 u_lightPosition;
      uniform vec3 u_lightColor;

      uniform sampler2D u_albedoMap;
      #ifdef USE_NORMAL_MAP
        uniform sampler2D u_normalMap;
      #endif

      out vec4 fragColor;

      void main() {
        vec4 albedo = texture(u_albedoMap, v_texcoord);

        #ifdef USE_NORMAL_MAP
          vec3 normal = texture(u_normalMap, v_texcoord).xyz * 2.0 - 1.0;
          normal = normalize(v_TBN * normal);
        #else
          vec3 normal = normalize(v_normal);
        #endif

        vec3 V = normalize(u_cameraPosition - v_worldPosition);
        vec3 L = normalize(u_lightPosition - v_worldPosition);

        vec3 color = cookTorranceBRDF(normal, V, L, albedo.rgb, 0.5, 0.5);

        fragColor = vec4(color, albedo.a);
      }
    `
  },
  defines: {
    USE_NORMAL_MAP: 1,
    USE_SHADOWS: 0,
    MAX_LIGHTS: 4
  },
  gl: gl
});
```

## Example 3: Shader Library Usage

```typescript
import { ShaderLibrary, initShaderLibrary } from './rendering/shader';

// Initialize global library
const library = initShaderLibrary(gl, {
  baseUrl: '/assets/shaders',
  extensions: {
    vertex: '.vert.glsl',
    fragment: '.frag.glsl'
  }
});

// Register built-in shaders
library.registerBuiltin({
  name: 'pbr',
  source: pbrShaderSource,
  defines: {
    USE_IBL: 1
  }
});

library.registerBuiltin({
  name: 'unlit',
  source: unlitShaderSource
});

// Load shader from URL
const terrainShader = await library.load('terrain', {
  defines: {
    USE_HEIGHT_MAP: 1,
    DETAIL_LAYERS: 3
  }
});

// Get shader variants
const pbrBase = library.get('pbr');
const pbrWithShadows = library.getVariant('pbr', {
  USE_IBL: 1,
  USE_SHADOWS: 1
});
const pbrWithNormalMap = library.getVariant('pbr', {
  USE_IBL: 1,
  USE_NORMAL_MAP: 1,
  USE_SHADOWS: 1
});

// Preload multiple shaders
await library.preload(['pbr', 'unlit', 'skybox', 'water']);

// Get library stats
const stats = library.getStats();
console.log(`Loaded ${stats.shaders} shaders, ${stats.variants} variants`);
```

## Example 4: Uniform Buffers

```typescript
import { UniformBuffer, UniformLayout, UniformType } from './rendering/shader';
import { Matrix4, Vector3, Vector2 } from './math';

// Create camera uniform buffer
const cameraUBO = new UniformBuffer({
  name: 'CameraUniforms',
  binding: 0,
  layout: UniformLayout.Std140,
  fields: [
    { name: 'viewMatrix', type: UniformType.Mat4 },
    { name: 'projectionMatrix', type: UniformType.Mat4 },
    { name: 'viewProjectionMatrix', type: UniformType.Mat4 },
    { name: 'position', type: UniformType.Vec3 },
    { name: 'direction', type: UniformType.Vec3 },
    { name: 'nearFar', type: UniformType.Vec2 },
    { name: 'viewport', type: UniformType.Vec2 }
  ]
});

// Create lights uniform buffer
const lightsUBO = new UniformBuffer({
  name: 'LightUniforms',
  binding: 1,
  layout: UniformLayout.Std140,
  fields: [
    { name: 'positions', type: UniformType.Vec3, arraySize: 4 },
    { name: 'colors', type: UniformType.Vec3, arraySize: 4 },
    { name: 'intensities', type: UniformType.Float, arraySize: 4 },
    { name: 'count', type: UniformType.Int }
  ]
});

// Update camera uniforms
function updateCameraUniforms(camera: Camera) {
  cameraUBO.setMat4('viewMatrix', camera.viewMatrix);
  cameraUBO.setMat4('projectionMatrix', camera.projectionMatrix);
  cameraUBO.setMat4('viewProjectionMatrix', camera.viewProjectionMatrix);
  cameraUBO.setVec3('position', camera.position);
  cameraUBO.setVec3('direction', camera.forward);
  cameraUBO.setVec2('nearFar', new Vector2(camera.near, camera.far));
  cameraUBO.setVec2('viewport', new Vector2(canvas.width, canvas.height));

  // Upload to GPU (only if dirty)
  if (cameraUBO.isDirty) {
    const data = cameraUBO.getData();
    gl.bindBuffer(gl.UNIFORM_BUFFER, cameraBufferGL);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, data);
    cameraUBO.clearDirty();
  }
}

// Update light uniforms
function updateLightUniforms(lights: Light[]) {
  const positions = lights.map(l => l.position);
  const colors = lights.map(l => l.color);
  const intensities = lights.map(l => l.intensity);

  lightsUBO.setVec3Array('positions', positions);
  lightsUBO.setVec3Array('colors', colors);
  lightsUBO.setFloatArray('intensities', intensities);
  lightsUBO.setInt('count', lights.length);

  if (lightsUBO.isDirty) {
    const data = lightsUBO.getData();
    gl.bindBuffer(gl.UNIFORM_BUFFER, lightsBufferGL);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, data);
    lightsUBO.clearDirty();
  }
}
```

## Example 5: Shader Generator

```typescript
import { ShaderGenerator, ShaderLanguage } from './rendering/shader';

const generator = new ShaderGenerator(ShaderLanguage.GLSL300);

// Generate PBR shader with all features
const fullPBRShader = generator.generatePBR({
  useNormalMap: true,
  useMetallicRoughnessMap: true,
  useAO: true,
  useEmissive: true,
  numLights: 3
});

const pbrShader = new Shader({
  name: 'GeneratedPBR',
  source: fullPBRShader,
  gl: gl
});

// Generate simple unlit shader
const unlitShader = generator.generateUnlit();

const unlitProgram = new Shader({
  name: 'GeneratedUnlit',
  source: unlitShader,
  gl: gl
});

// Generate skybox shader
const skyboxShader = generator.generateSkybox();

const skyboxProgram = new Shader({
  name: 'GeneratedSkybox',
  source: skyboxShader,
  gl: gl
});
```

## Example 6: Complete Rendering Pipeline

```typescript
import {
  ShaderLibrary,
  Shader,
  UniformBuffer,
  UniformLayout,
  UniformType,
  ShaderGenerator
} from './rendering/shader';
import { Matrix4, Vector3 } from './math';

// Setup shader library
const library = new ShaderLibrary(gl, {
  baseUrl: '/shaders'
});

// Generate and register PBR shader
const generator = new ShaderGenerator();
const pbrSource = generator.generatePBR({
  useNormalMap: true,
  useMetallicRoughnessMap: true,
  numLights: 4
});

library.registerBuiltin({
  name: 'pbr',
  source: pbrSource
});

// Setup uniform buffers
const sceneUBO = new UniformBuffer({
  name: 'SceneUniforms',
  binding: 0,
  layout: UniformLayout.Std140,
  fields: [
    { name: 'viewMatrix', type: UniformType.Mat4 },
    { name: 'projectionMatrix', type: UniformType.Mat4 },
    { name: 'cameraPosition', type: UniformType.Vec3 },
    { name: 'time', type: UniformType.Float }
  ]
});

const lightUBO = new UniformBuffer({
  name: 'LightUniforms',
  binding: 1,
  layout: UniformLayout.Std140,
  fields: [
    { name: 'positions', type: UniformType.Vec3, arraySize: 4 },
    { name: 'colors', type: UniformType.Vec3, arraySize: 4 }
  ]
});

// Create WebGL uniform buffers
const sceneBuffer = gl.createBuffer();
gl.bindBuffer(gl.UNIFORM_BUFFER, sceneBuffer);
gl.bufferData(gl.UNIFORM_BUFFER, sceneUBO.size, gl.DYNAMIC_DRAW);
gl.bindBufferBase(gl.UNIFORM_BUFFER, 0, sceneBuffer);

const lightBuffer = gl.createBuffer();
gl.bindBuffer(gl.UNIFORM_BUFFER, lightBuffer);
gl.bufferData(gl.UNIFORM_BUFFER, lightUBO.size, gl.DYNAMIC_DRAW);
gl.bindBufferBase(gl.UNIFORM_BUFFER, 1, lightBuffer);

// Render loop
function render(time: number) {
  // Update scene uniforms
  sceneUBO.setMat4('viewMatrix', camera.viewMatrix);
  sceneUBO.setMat4('projectionMatrix', camera.projectionMatrix);
  sceneUBO.setVec3('cameraPosition', camera.position);
  sceneUBO.setFloat('time', time);

  if (sceneUBO.isDirty) {
    gl.bindBuffer(gl.UNIFORM_BUFFER, sceneBuffer);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, sceneUBO.getData());
    sceneUBO.clearDirty();
  }

  // Update light uniforms
  lightUBO.setVec3Array('positions', lights.map(l => l.position));
  lightUBO.setVec3Array('colors', lights.map(l => l.color));

  if (lightUBO.isDirty) {
    gl.bindBuffer(gl.UNIFORM_BUFFER, lightBuffer);
    gl.bufferSubData(gl.UNIFORM_BUFFER, 0, lightUBO.getData());
    lightUBO.clearDirty();
  }

  // Get appropriate shader variant based on material
  let shader: Shader;
  if (material.hasNormalMap) {
    shader = library.getVariant('pbr', { USE_NORMAL_MAP: 1 })!;
  } else {
    shader = library.get('pbr')!;
  }

  // Render
  shader.bind();
  shader.setUniform('u_modelMatrix', modelMatrix);

  // Bind textures
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, albedoTexture);
  shader.setUniform('u_albedoMap', 0);

  if (material.hasNormalMap) {
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, normalTexture);
    shader.setUniform('u_normalMap', 1);
  }

  // Draw
  gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0);

  shader.unbind();

  requestAnimationFrame(render);
}
```

## Example 7: Hot Reload

```typescript
import { ShaderLibrary } from './rendering/shader';

const library = new ShaderLibrary(gl);

// Load initial shader
const shader = await library.load('pbr');

// Setup file watcher (in development)
if (process.env.NODE_ENV === 'development') {
  // Watch for shader file changes
  fileWatcher.on('change', async (filename) => {
    if (filename.endsWith('.glsl')) {
      const shaderName = path.basename(filename, '.vert.glsl');

      try {
        // Reload shader
        const reloaded = await library.reload(shaderName);
        console.log(`Hot reloaded shader: ${shaderName}`);

        // Shader is automatically updated in all places using it
      } catch (error) {
        console.error(`Failed to reload shader: ${shaderName}`, error);
      }
    }
  });
}
```

## Example 8: Error Handling

```typescript
import { Shader, ShaderError } from './rendering/shader';

function createShaderWithErrorHandling(source: ShaderSource): Shader | null {
  const shader = new Shader({
    name: 'MyShader',
    source: source,
    gl: gl
  });

  if (!shader.isReady) {
    const errors = shader.getErrors();

    console.error('Shader compilation failed!');
    for (const error of errors) {
      console.error(`${error.shaderType} shader error:`);
      console.error(`  Line ${error.line}: ${error.message}`);
      if (error.snippet) {
        console.error('  Code:');
        console.error(error.snippet);
      }
    }

    shader.dispose();
    return null;
  }

  return shader;
}

// Usage
const shader = createShaderWithErrorHandling({
  vertex: vertexSource,
  fragment: fragmentSource
});

if (shader) {
  // Shader is ready to use
  shader.bind();
  // ...
}
```

## Example 9: Custom Shader Chunks

```typescript
import { ShaderChunks, ShaderLanguage } from './rendering/shader';

// Register custom chunk
ShaderChunks.registerChunk({
  name: 'custom_fog',
  glsl: `
    // Linear fog calculation
    vec3 applyFog(vec3 color, float distance, vec3 fogColor, float fogStart, float fogEnd) {
      float fogFactor = clamp((fogEnd - distance) / (fogEnd - fogStart), 0.0, 1.0);
      return mix(fogColor, color, fogFactor);
    }

    // Exponential fog
    vec3 applyExpFog(vec3 color, float distance, vec3 fogColor, float fogDensity) {
      float fogFactor = exp(-distance * fogDensity);
      return mix(fogColor, color, fogFactor);
    }
  `,
  wgsl: `
    // Linear fog calculation
    fn applyFog(color: vec3<f32>, distance: f32, fogColor: vec3<f32>, fogStart: f32, fogEnd: f32) -> vec3<f32> {
      let fogFactor = clamp((fogEnd - distance) / (fogEnd - fogStart), 0.0, 1.0);
      return mix(fogColor, color, fogFactor);
    }

    // Exponential fog
    fn applyExpFog(color: vec3<f32>, distance: f32, fogColor: vec3<f32>, fogDensity: f32) -> vec3<f32> {
      let fogFactor = exp(-distance * fogDensity);
      return mix(fogColor, color, fogFactor);
    }
  `,
  dependencies: ['common_math']
});

// Use in shader
const shaderWithFog = new Shader({
  name: 'FogShader',
  source: {
    vertex: `...`,
    fragment: `#version 300 es
      precision highp float;

      #include <common_math>
      #include <custom_fog>

      in vec3 v_worldPosition;
      uniform vec3 u_cameraPosition;
      uniform vec3 u_fogColor;
      uniform float u_fogStart;
      uniform float u_fogEnd;

      out vec4 fragColor;

      void main() {
        vec3 color = vec3(1.0, 0.0, 0.0); // Base color
        float distance = length(v_worldPosition - u_cameraPosition);
        color = applyFog(color, distance, u_fogColor, u_fogStart, u_fogEnd);
        fragColor = vec4(color, 1.0);
      }
    `
  },
  gl: gl
});
```

## Example 10: Shader Introspection

```typescript
import { Shader } from './rendering/shader';

const shader = new Shader({
  name: 'IntrospectionTest',
  source: shaderSource,
  gl: gl
});

// Get all uniforms
const uniforms = shader.getAllUniforms();
console.log('Uniforms:');
for (const uniform of uniforms) {
  console.log(`  ${uniform.name}: ${uniform.type} (size: ${uniform.size})`);
}

// Get all attributes
const attributes = shader.getAllAttributes();
console.log('Attributes:');
for (const attr of attributes) {
  console.log(`  ${attr.name}: ${attr.type} at location ${attr.location}`);
}

// Check for specific uniform
const mvpUniform = shader.getUniform('u_mvpMatrix');
if (mvpUniform) {
  console.log(`MVP matrix is ${mvpUniform.type}`);
}

// Set uniforms safely
if (shader.getUniform('u_modelMatrix')) {
  shader.setUniform('u_modelMatrix', modelMatrix);
}

if (shader.getUniform('u_color')) {
  shader.setUniform('u_color', new Vector3(1, 0, 0));
}
```
