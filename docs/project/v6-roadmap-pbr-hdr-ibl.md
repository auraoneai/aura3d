# PBR, HDR, And IBL In V6

> Historical note: This V6 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


The public HDR entrypoint is:

```ts
import { loadHdrEnvironment } from "@galileo3d/engine/production-runtime";

const environment = await loadHdrEnvironment({
  url: "/fixtures/environment-corpus/hdri/studio_small_08_1k.hdr",
  id: "studio-small-08",
  intensity: 1.2,
  toneMapping: { operator: "filmic", exposure: 1.08, whitePoint: 11.2 }
});
```

The V6 HDR path parses real Radiance HDR files and produces:

- linear environment resources
- diffuse irradiance resources
- specular prefilter mip levels
- BRDF LUT
- environment lighting bindings
- tone-mapping policy
- diagnostics

The product viewer exposes:

- environment selection
- exposure
- IBL intensity
- specular intensity
- environment rotation
- background visibility
- background blur/softness
- bloom
- FXAA
- color grading through SDK settings

The current viewer background controls toggle product-stage backdrop render items, tune backdrop softness, and rotate the sampled HDR environment used by materials. This is visible renderer input, but it is not yet a full equirectangular/cubemap skybox pass with mature skybox blur and exact PMREM background parity.

## Material Scope

The GLTF render path surfaces:

- metallic/roughness
- normal maps
- occlusion
- emissive
- clearcoat
- sheen
- specular
- transmission and volume as bounded features requiring visual proof

## Known Gaps

The current prefiltering path is PMREM-style and diagnostic-backed, but exact Three.js cube PMREM parity is not claimed. True skybox/background parity is also not claimed yet. Transmission, volume, anisotropy, iridescence, and variants require focused visual proof before broad parity claims.
