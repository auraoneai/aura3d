# Renderer Material Matrix

The renderer material surface is broader than the early `examples/material-lab` matrix. The current repo includes:

- `UnlitMaterial`, `TexturedUnlitMaterial`, `PBRMaterial`, `TexturedPBRMaterial`, `NormalMappedPBRMaterial`, `InstancedPBRMaterial`, `SkinnedLitMaterial`, `SkinnedUnlitMaterial`, and `MorphUnlitMaterial`;
- glTF metallic-roughness texture slots, normal maps, ORM/occlusion/emissive slots, alpha mask/blend state, double-sided state, UV transforms, and material variants;
- bounded physical-material helpers for clearcoat, sheen, specular, transmission, anisotropy, and transparent material evidence;
- render-state sorting and alpha utilities under `packages/rendering/src/materials`;
- v8 route coverage for material extensions, transmission, texture anisotropy, loader variants, and the flagship PBR viewer.

## Current Use Cases

- Render imported glTF/GLB assets with PBR textures in WebGL2.
- Build product configurators and material labs with variant selection and renderer diagnostics.
- Compare selected same-scene output against Three.js for flagship product scenes.
- Exercise material extension behavior in route-level demos before claiming broad loader parity.

## Current Evidence

- `tests/reports/v8-assets.json` records 20 v8 assets, 15 textured-PBR assets, 6 material-extension assets, texture transform coverage, and material-variant coverage.
- `tests/reports/current-routes-threejs-parity.json` records a same-scene A3D/Three.js flagship comparison. In that report A3D renders the chronograph watch with 48 draw calls, 100002 triangles, 37 textures, and 29 materials; Three.js renders the same asset with 41 draw calls, 199990 triangles, and 12 textures.
- `tests/reports/production-runtime-hd-flagship.json` records HD WebGL2 PBR output for composed real assets with HDR environment input and texture diagnostics.
- `tests/visual/rendering-material-matrix.spec.ts` still verifies the bounded material matrix scene.

## Known Gaps

- The material system does not yet prove full glTF extension parity. Treat `KHR_materials_transmission`, variants, texture transform, clearcoat, sheen, and specular as bounded coverage unless the specific route/report is cited.
- Large transparent scenes, order-independent transparency, SSR/refraction stacks, and production glass are not complete claims.
- Some v8 examples are route evidence, not polished product visuals. The v8 visual review accepts screenshots as route evidence and explicitly says not to use them as final proof of Three.js-level character or material quality.
- The same-scene Three.js comparison is useful, but it is still one flagship scene plus selected categories, not ecosystem-level parity.

## Verification

- `tests/reports/v8-assets.json`
- `tests/reports/current-routes-threejs-parity.json`
- `tests/reports/current-routes-visual-review.json`
- `tests/reports/production-runtime-hd-flagship.json`
- `tests/unit/rendering/pbr-lighting.test.ts`
- `tests/unit/rendering/material-binding.test.ts`
- `tests/visual/rendering-material-matrix.spec.ts`
