# PBR and glTF correctness

Aura3D has a bounded, current comparison for its PBR and glTF paths. The
canonical command is:

```bash
pnpm renderer:pbr-gltf-correctness
```

The command rebuilds package output before measuring it, verifies the current
npm Three.js baseline online, checks shader/source synchronization, runs
physical-behavior assertions, runs focused loader and compression suites,
renders three browser comparisons, and writes the aggregate receipt to
`tests/reports/pbr-gltf-correctness/report.json`. It fails if any browser
receipt is more than 30 minutes old when aggregated.

## Capability boundary

This proof spans three explicitly different surfaces:

- `createAuraApp` root safe API: primitive anisotropy, sheen, iridescence, and
  clearcoat are measured from rendered WebGL2 pixels. Primitive transmission is
  not claimed because that single-pass path has no scene-color input.
- `production-runtime`: textured PBR/glTF materials, scene-color transmission,
  volume attenuation, IOR response, authored tangent anisotropy, and loader
  integration are exercised through the production WebGL2 renderer.
- `rendering` and asset packages: material channels, extension parsing,
  render-state mapping, shader variants, compression hooks, skinning, and morph
  data have focused unit and asset tests.

These scopes must not be collapsed into a claim that every feature is available
through root `createAuraApp` or that Aura3D implements the whole Three.js/glTF
ecosystem.

## Structural gates

Whole-image similarity alone is not accepted as physical-material proof. The
gate measures the behavior each feature is supposed to produce:

| Feature | Required behavior | Current measured result |
| --- | --- | --- |
| Anisotropy, root primitive | Highlight elongation at least 1.35, rotation response at least 20 degrees, and at least 1.2 times isotropic elongation | 4.548 maximum elongation, 133.718-degree orientation range, 2.905 times isotropic |
| Anisotropy, textured PBR | Authored tangent-frame rotation at least 20 degrees and elongation at least 1.35 | 25.026-degree orientation range and 3.776 maximum elongation |
| Sheen | Grazing-to-center response increases monotonically from strength 0 to 0.5 to 1 | Ratios 0.830, 0.913, and 0.977 with stable center luminance |
| Iridescence | View-angle sweep changes hue at least 15 degrees in total with one step of at least 5 degrees | 18.922-degree total change and 10.529-degree maximum step |
| Clearcoat | A distinct peak lobe appears instead of uniform brightening | 1.450 peak gain and 0.009 bright-region ratio |
| Transmission/IOR | Scene-color displacement changes with IOR | 1,490 changed subject pixels |
| Backdrop composition | Transmitted subject retains multiple background regions | Four dominant-color transitions |
| Volume attenuation | Shorter attenuation distance lowers energy and increases the expected tint bias | Luma 47.411 to 40.494; blue bias 17.669 to 34.143 |

The shader and loader suites additionally cover base color,
metallic/roughness, normal, occlusion, emissive, clearcoat factor/roughness and
normal maps, specular, texture transforms, material variants, punctual lights,
unlit materials, tangents, vertex colors, color-space use, alpha modes,
double-sided state, skinning, and morph targets.

Draco, Meshopt, and KTX2/Basis are supported as optional, explicitly injected
decoder paths. They are not bundled into the core runtime. A test that merely
declares an extension without running its decoder hook is not compression
proof.

## Current Three.js comparison

The comparator is verified online as `three@0.185.1` / r185. Two kinds of
comparison are retained:

1. A same-fixture loader card uses the actual current Three.js `GLTFLoader` and
   renderer beside Aura3D. It validates the same fixture hash, material imports,
   draw calls, nonblank output, and a structural-similarity floor.
2. An eleven-extension combined card renders Aura3D and current Three.js with
   the same camera and card. Every case records luma, mean delta, changed pixels,
   structural similarity, draw calls, and nonblank/color-diversity checks.

The combined-card report intentionally repeats one combined material under its
eleven extension metadata labels. It demonstrates combined-card coverage; it
does not pretend to be eleven isolated feature fixtures. The separate
structural gates above supply isolated behavioral evidence for anisotropy,
sheen, iridescence, clearcoat, transmission, volume, IOR, and attenuation.

## Invalid measurements

Blank, camera-only, and wrong-scale frames fail rather than count as evidence.
The production transmission gate requires more than 4,000 subject-region
pixels and more than 12 color buckets. The current-Three comparison requires
more than 5,000 nonblack pixels for both renderers, per-case color diversity,
draw calls, texture allocation, and nonblank PNG artifacts. A similarity score
cannot rescue a frame that fails those validity conditions.

## Explicit limits

- Transmission is screen-space renderer-owned scene-color composition. It does
  not implement recursive refraction, depth ray marching, off-screen recovery,
  path tracing, or physical caustic projection.
- Spectral dispersion is not claimed. `KHR_materials_dispersion` is parsed and
  retained with limits; true spectral dispersion remains blocked.
- `KHR_materials_variants` can be loaded and selected at runtime, but broad
  authoring and persistence workflow parity is not claimed.
- Optional decoder hooks do not equal the breadth of the Three.js companion
  asset-tool ecosystem.
- This receipt supports per-feature, per-path statements. It does not support
  “universal Three.js replacement,” “full glTF parity,” or a universal quality
  or performance score.

## Evidence map

- aggregate: `tests/reports/pbr-gltf-correctness/report.json`;
- structural root-material report: `tests/reports/material-structural-parity.json`;
- production transmission report: `tests/reports/pbr-gltf-correctness/transmission/report.json`;
- combined-card comparison: `tests/reports/runtime-parity/material-extension-parity/material-extension-parity-report.json`;
- real-loader same-fixture comparison: `tests/reports/threejs-parity/loader-material-extensions-parity.json`;
- current baseline: `tests/reports/current-threejs-baseline.json`.
