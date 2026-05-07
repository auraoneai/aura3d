# Renderer Material Matrix

`examples/material-lab` is the bounded material stress scene for this slice. It renders through `Renderer` + `WebGL2Device` using a scene camera, scene lights, node transforms, geometry resources, and material resources.

The lab covers:

- base color through `UnlitMaterial`
- vertex colors through the default `a_color` shader path
- normal mapping through `NormalMappedPBRMaterial`
- metallic-roughness, occlusion, and emissive texture slots through `TexturedPBRMaterial`
- alpha mask through `TexturedUnlitMaterial` plus `u_alphaCutoff`
- alpha blend through transparent PBR render state
- double-sided rendering through `cullMode: "none"`
- UV transforms through textured material transform uniforms

## Limits

- This is a material-matrix validation scene, not coverage for every glTF material extension or alpha-sorting strategy.
- The current glTF render-resource material path still supports one primary UV path per draw.
- Large mixed transparent scenes are not claimed.

## Verification

- `tests/unit/rendering/pbr-lighting.test.ts` validates textured PBR slots and UV transform uniforms.
- `tests/unit/rendering/material-binding.test.ts` validates texture binding schema and transform metadata.
- `tests/visual/rendering-material-matrix.spec.ts` verifies browser pixels from `examples/material-lab`.
