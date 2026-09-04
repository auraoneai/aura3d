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

## Q0 shader deviation register (muse3jsparity-PRD Part Q, box 2)

Rule: any future deviation from the references below requires a documented
reason in this register AND an updated reference vector in
`tests/unit/rendering/shader-core-brdf-reference.test.ts` (or the sibling
`shader-brdf-reference` / `parity-deviations-q1` suites). The policy test
`tests/unit/rendering/shader-deviation-policy.test.ts` fails if an entry is
missing its reason or its pinning test. Audit basis: installed
`three@0.185.1` sources (`lights_physical_pars_fragment`,
`common`, `bsdfs` chunks), Disney 2012 BRDF notes, Heitz 2014 anisotropic
NDF, Estevez-Kulla 2017 sheen, Narkowicz ACES fit, sRGB specification.

- DIFFUSE-BURLEY — Status: intentional difference. Ours: Disney Burley with
  1/1.51 energy compensation (`a3dDiffuseBurley`). three r185 direct diffuse
  is bare `BRDF_Lambert` (`RECIPROCAL_PI * diffuse`, `RE_Direct_Physical`).
  Reason: Burley captures roughness-dependent retroreflection that Lambert
  misses; the 1/1.51 factor bounds diffuse energy at high roughness. Bound:
  at roughness 1 the response is exactly Disney Burley scaled by 1/1.51
  (pinned). Pinning test: shader-core-brdf-reference (Burley).
- GGX-DISTRIBUTION — Status: match. `a3dDistributionGGX` reproduces three
  `D_GGX` wherever the documented 0.045 floor and the shared EPSILON guard do
  not bind. Pinning test: shader-core-brdf-reference (GGX).
- SMITH-CORRELATED — Status: match. The lambdaV/lambdaL formulation is
  algebraically identical to three `V_GGX_SmithCorrelated` (gv/gl form);
  verified term-by-term against the installed source. Pinning test:
  shader-core-brdf-reference (Smith).
- FRESNEL-EXP2 — Status: intentional difference. Ours: original Schlick'94
  `pow(1-x, 5)`. three r185 `F_Schlick` evaluates the Epic `exp2`
  approximation (`common.glsl.js`). Reason: the pow form IS the reference
  approximation; the exp2 form is the optimization. Bound: max |pow5 - exp2|
  over dotVH in [0, 1] is 0.00377 < 0.004 (oracle scan, pinned).
  Pinning test: shader-core-brdf-reference (Schlick).
- CLEARCOAT-LOBE — Status: match. `F_Schlick(0.04) * D_GGX * V_SmithCorrelated`
  per three `BRDF_GGX_Clearcoat`, pinned term-by-term. Pinning test:
  shader-core-brdf-reference (clearcoat).
- ANISO-NDF — Status: match of form. Both the primitive
  (`a3dPbrAnisotropicDistribution`) and textured
  (`a3dTexturedPbrAnisotropicDistribution`) paths implement the aspect-ratio
  anisotropic-GGX NDF, algebraically identical to three
  `D_GGX_Anisotropic` (Heitz 2014 vector form); worst relative difference
  1.2e-15 over 200 randomized configurations (oracle scan). Difference that
  remains: the primitive path evaluates the lobe over the procedural XY
  frame (primitives carry no authored tangent attribute); the textured path
  uses the authored TBN. Pinning test: shader-brdf-reference (lobe vectors)
  + anisotropic-rotation-q1 browser spec (rotation response).
- ROUGHNESS-FLOOR-0.045 — Status: intentional difference, DECISION KEEP.
  three's unfloored form divides by zero at roughness 0 + nDotH 1; ours stays
  finite. Binds only below roughness 0.045. Pinning test:
  parity-deviations-q1 (roughness floor).
- SRGB-EXACT — Status: ours more exact than reference. Exact OETF in all 6
  encode sites; three r185 evaluates `pow(c, 0.41666)` (truncated 1/2.4) and
  trails the spec by ~4e-6. Bound: three-agreement within three's own
  precision (1e-5); gate not weakened. Pinning test:
  parity-deviations-q1 (0-255 sweep).
- IRIDESCENCE-COSINE — Status: bounded approximation. Cosine thin-film
  without Fresnel-weighted spectral integration (three `evalIridescence`).
  Reason: keep the cheap cosine form until a same-scene proof earns spectral
  integration (M1). Pinning test: shader-brdf-reference (iridescence).
- TRANSMISSION-TINT — Status: bounded, diagnosed. Forward-shader
  transmission is an albedo tint (no scene-color refraction); real
  transmission lives in `TransmissionPass`. Root marks `transmission`
  `rootSafeApi: "partial"` and `capabilityDiagnostics` warns. Reason: honest
  partial labeling beats a silent tint; the diagnostic retires only when B4
  lands with pixels. Pinning test: agent-api suite (diagnostic contract).
- RECT-QUADRATURE — Status: intentional difference. DECISION: LTC stays OUT
  for 2.1 — 2-point Gauss-Legendre quadrature, not LTC
  (`RectAreaLightUniformsLib`); bounded pixel proof recorded (25.026-degree
  orientation range, 3.776 elongation). Pinning test: shader-brdf-reference
  (quadrature offset constant).
- SHADOW-BIAS-DISCIPLINE — Status: superiority to protect. Per-PCF-sample
  tangent-scaled slope bias (not centre-only, not `(1 - NdotL)`-linear),
  clamped at 8. Reason: per-sample tangent scaling is the documented
  acne-free policy; regressing to centre-only bias reintroduces
  self-shadowing on wide kernels. Exceeds three's single-bias approach.
  Pinning test: shader-core-brdf-reference (shadow bias).

## Evidence map

- aggregate: `tests/reports/pbr-gltf-correctness/report.json`;
- structural root-material report: `tests/reports/material-structural-parity.json`;
- production transmission report: `tests/reports/pbr-gltf-correctness/transmission/report.json`;
- combined-card comparison: `tests/reports/runtime-parity/material-extension-parity/material-extension-parity-report.json`;
- real-loader same-fixture comparison: `tests/reports/threejs-parity/loader-material-extensions-parity.json`;
- current baseline: `tests/reports/current-threejs-baseline.json`.
