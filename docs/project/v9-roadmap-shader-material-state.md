# V9 Shader, Material, And State System

G3D has a renderer-owned shader/material/state stack. It is strong enough for the matched V9 routes, but not a full clone of every Three.js material behavior.

## Real Code

- `packages/rendering/src/Material.ts`
- `packages/rendering/src/PBRMaterial.ts`
- `packages/rendering/src/UnlitMaterial.ts`
- `packages/rendering/src/ShaderModule.ts`
- `packages/rendering/src/ShaderProgramLibrary.ts`
- `packages/rendering/src/WebGL2StateCache.ts`
- `packages/rendering/src/production-runtime/materials/*`
- `packages/rendering/src/production-runtime/shaders/chunks/*`
- `packages/rendering/src/production-runtime/shaders/wgsl/*`

## What Is Supported

- Runtime shader compile/link/diagnostic paths.
- Material classes for unlit, PBR, textured PBR/unlit, skinned lit, and instanced materials.
- GLTF material adaptation for core PBR and several physical extensions.
- WebGL2 state caching for programs, VAOs, buffers, textures, samplers, depth, blend, cull, stencil, viewport, scissor, color write, and polygon offset.
- Diagnostics for render state and resource use.

## Evidence

- `tests/reports/v9/material-grid-parity.json`
- `tests/reports/v9/loader-material-extensions-parity.json`
- `tests/reports/v9/gltf-parity.json`
- `tests/reports/v9/physical-lights-parity.json`
- `tests/reports/v9/api-surface.json`

## Remaining Deltas

- Texture anisotropy remains partial.
- Visual differences remain visible in some material/lighting comparisons.
- WebGPU material routes remain partial.
- Full Three.js material catalog parity is not claimed.
