# Renderer Material Matrix

Version: 1.0.5

Material support is implemented across the rendering, assets, and materials packages.

## Current Code

- `packages/rendering/src/Material.ts`
- `packages/rendering/src/PBRMaterial.ts`
- `packages/rendering/src/MaterialPresets.ts`
- `packages/rendering/src/ShaderLibrary.ts`
- `packages/assets/src/GLTFLoader.ts`
- `packages/assets/src/GLTFRenderResources.ts`
- `packages/materials/src/index.ts`

## Covered Areas

- Basic material instances and PBR material inputs.
- Metallic/roughness, normal, occlusion, emissive, alpha, double-sided, and texture-slot data from glTF.
- Selected physical material extensions including clearcoat, sheen, transmission, specular, and volume metadata.
- Render-state sorting, blending, culling, and material/texture binding diagnostics.
- Current route coverage for material extensions, transmission, texture anisotropy, variants, and material studio workflows.

## Boundaries

The renderer does not claim exact shader equivalence for every low-level renderer code material or every glTF extension. Claims must name the material feature, route/test evidence, and current roadmap items.
