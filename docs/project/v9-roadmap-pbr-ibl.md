# V9 PBR And IBL

G3D has PBR/HDR/IBL-facing code and matched tracked routes for several material examples. It does not yet prove better material quality than Three.js across the board.

## Real Code

- `packages/rendering/src/PBRMaterial.ts`
- `packages/rendering/src/production-runtime/materials/*`
- `packages/rendering/src/production-runtime/environment/*`
- `packages/rendering/src/production-runtime/shaders/chunks/brdf.glsl`
- `packages/rendering/src/production-runtime/shaders/chunks/ibl.glsl`
- `packages/rendering/src/production-runtime/shaders/chunks/pbr.frag.glsl`
- `packages/rendering/src/production-runtime/shaders/chunks/pbr.vert.glsl`
- `packages/assets/src/GLTFRenderResources.ts`
- `packages/assets/src/GLTFExtensionSupport.ts`

## What Is Supported

- Metallic/roughness PBR route support.
- HDR/environment-map route support.
- Physical material extensions for clearcoat, sheen, and transmission in scoped routes.
- Shadow and physical-light route evidence.
- GLTF material adaptation into G3D renderer resources.

## Evidence

- `tests/reports/v9/gltf-parity.json`
- `tests/reports/v9/loader-material-extensions-parity.json`
- `tests/reports/v9/material-grid-parity.json`
- `tests/reports/v9/physical-lights-parity.json`
- `tests/reports/v9/shadowmap-parity.json`

## Remaining Deltas

- Texture anisotropy remains partial.
- Some reports show different luma, contrast, and pixel distributions than Three.js; those are evidence of deltas, not superiority.
- WebGPU materials remain partial.
- Full Three.js physical-material behavior, tone mapping, and IBL parity are not globally claimed.
