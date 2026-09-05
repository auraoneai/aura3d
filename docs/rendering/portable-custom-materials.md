# Portable Custom Materials

Status: supported public `@aura3d/rendering` extension API in Aura3D 2.0.

`PortableShaderMaterial` is the supported custom-material path for selected
WebGL2/WebGPU workloads. One material owns paired GLSL ES 3.00 and WGSL stages,
a typed uniform/resource schema, render state, live replacement, diagnostics,
and disposal. It renders through `Renderer` and `ForwardPass`; application code
does not create `WebGLProgram`, `GPUDevice`, pipelines, uniform buffers, bind
groups, or renderer-private objects.

This is a ShaderMaterial-class extension surface. It is not a claim of general
Three.js TSL/node-material parity. The current r185 control remains materially
more concise and composable because one TSL expression graph targets both
backends; Aura3D intentionally requires explicit GLSL and WGSL implementations.

## Contract

Create one shader library and give the same instance to the material and
renderer:

```ts
import {
  PortableShaderMaterial,
  Renderer,
  createDefaultShaderLibrary
} from "@aura3d/rendering";

const shaderLibrary = createDefaultShaderLibrary();
const material = new PortableShaderMaterial({
  shaderLibrary,
  name: "pulse",
  sources: {
    glsl: {
      vertex: `#version 300 es
layout(location=0) in vec3 a_position;
uniform mat4 u_modelViewProjection;
void main(){gl_Position=u_modelViewProjection*vec4(a_position,1.0);}`,
      fragment: `#version 300 es
precision highp float;
uniform float u_time;
uniform vec3 u_color;
out vec4 outColor;
void main(){outColor=vec4(u_color*(.75+.25*sin(u_time)),1.0);}`
    },
    wgsl: {
      vertex: `/* @aura3d-bindings */
@vertex fn vs_main(@location(0) p:vec3<f32>)->@builtin(position) vec4<f32>{
  let clip=aura.u_modelViewProjection*vec4<f32>(p,1.0);
  return vec4<f32>(clip.xy,clip.z*.5+clip.w*.5,clip.w);
}`,
      fragment: `/* @aura3d-bindings */
@fragment fn fs_main()->@location(0) vec4<f32>{
  return vec4<f32>(aura.u_color*(.75+.25*sin(aura.u_time)),1.0);
}`
    }
  },
  uniforms: [
    { name: "u_time", kind: "float", value: 0 },
    { name: "u_color", kind: "vec3", value: [0.2, 0.7, 1] }
  ]
});

const renderer = await Renderer.create({
  backend: "webgpu",
  canvas,
  shaderLibrary
});
```

The WGSL marker is replaced with an engine-owned uniform struct and bind-group
declarations. Numeric values are read as `aura.<name>`. A `texture2d` named
`u_signal` is read as `u_signalTexture` and `u_signalSampler`. Supported binding
kinds are `float`, `vec2`, `vec3`, `vec4`, `mat4`, and `texture2d`. Cube textures,
storage resources, compute stages, and arbitrary bind groups are not part of
this selected portable contract.

The renderer supplies `u_modelViewProjection`, `u_modelMatrix`, and
`u_normalMatrix`. GLSL must declare the built-ins it uses. WGSL receives them in
the generated `aura` uniform struct.

## Diagnostics, live replacement, and disposal

- Construction rejects duplicate/reserved names, unsupported binding kinds,
  missing required GLSL uniforms, missing WGSL binding markers, and missing
  WGSL stage entry points with `PortableShaderCompilationError.diagnostics`.
- `material.compile(device)` normalizes synchronous WebGL compile/link errors,
  including driver logs.
- `await material.compileAsync(device)` uses native WebGPU
  `GPUShaderModule.getCompilationInfo()` and returns stage/line/column messages
  before creating the live program.
- `material.hotReload(nextSources)` validates both backend implementations and
  replaces them atomically. A failed replacement leaves the live shader intact.
  `ShaderLibrary` revisions invalidate and dispose renderer-owned cached shader
  programs before the next draw.
- `material.dispose()` unregisters its owned shader, clears parameters, advances
  the library revision, and makes further use an error. Renderer/device disposal
  remains responsible for backend resources it owns.

## Proven workloads and current Three.js control

The public lab demonstrates three nontrivial materials:

1. animated position-field plasma with a normal-driven rim;
2. analytic topographic and UV contour bands;
3. texture-sampled procedural dissolve with a threshold edge.

The browser gate runs all three through real WebGL2 and native WebGPU, requires
three native WebGPU submissions, three native pipelines, and a native sampled
texture binding, verifies pixel-changing hot replacement, exercises GLSL and
WGSL compiler diagnostics, and verifies disposal. The locked control runs the
same workload classes with `three@0.185.1`, `WebGPURenderer`,
`MeshBasicNodeMaterial`, and TSL through both backends.

| Dimension | Three.js r185 TSL control | Aura3D portable material |
| --- | --- | --- |
| Authored representation | One backend-neutral TSL graph | Explicit paired GLSL/WGSL |
| Route source, non-comment lines | 73 | 204 |
| Typed values/resources | TSL nodes/uniforms/textures | Runtime schema plus TS descriptor types |
| WebGL2/WebGPU | One graph through WebGPURenderer backends | One material object, backend-specific stages |
| Invalid source | Node graph/build or renderer diagnostic | Structural preflight plus native GLSL/WGSL diagnostics |
| Live change | Reassign graph/material nodes | Atomic `hotReload()` of both stages |
| General node ecosystem | Mature and extensive | Not claimed |

The line count is the complete executable route source, not a normalized
shader-only score. It is recorded to prevent the comparison from hiding the
paired-source authoring cost. Screenshots demonstrate successful and distinct
output; independently authored effects are not asserted to be pixel-equivalent.

Evidence:

- example: `examples/custom-material-lab/`;
- current Three.js control: `benchmark/current-threejs/portable-materials/`;
- browser test: `tests/browser/portable-custom-materials.spec.ts`;
- unit test: `tests/unit/rendering/portable-shader-material.test.ts`;
- report: `tests/reports/portable-custom-materials/comparison.json`;
- gate: `pnpm renderer:portable-materials`.

## Superiority (K1 · 2026-09-04)

- No K1 superiority claimed here: the package-level comparison above stands
  on its own gate, and the custom-material-shader workload was not among the
  K1 measured workloads. A shader-quality win will be claimed only with a
  same-scene capture receipt.
