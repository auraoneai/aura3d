# Renderer Material Matrix

Material support exists at multiple layers. Public docs must say which layer a
claim applies to.

| Feature | Root `createAuraApp` safe path | `@aura3d/rendering` / production-runtime packages | Claim rule |
| --- | --- | --- | --- |
| Base color / factor | Root-proven by `tests/browser/createAuraApp-material-pbr-contract.spec.ts` | Supported | Can be claimed with retained root screenshot evidence. |
| Base-color texture on typed GLB | Root-proven by the controlled texture on/off comparison in `tests/browser/createAuraApp-material-pbr-contract.spec.ts` | Supported | Can claim that root samples base-color textures, citing the retained on/off measurement; this is not full texture-material parity. |
| Metallic/roughness values | Root-proven for visible material contrast only; not full PBR parity | Broader package support | Claim limited metallic/roughness response with the root material contract, not full PBR. |
| Normal maps | Unsupported in the root material contract | Package support exists | Claim only package/internal support unless a root-only test proves sampled normal-map pixels. |
| Emissive color/maps | Root-proven for emissive color/intensity; emissive maps and bloom are separate | Package support exists | Distinguish emissive material color from pixel-backed bloom or emissive texture support. |
| Alpha / opacity | Partial: opacity/glass intent is accepted, but transparent blending and sorting are not proven | Package support exists | Verify alpha behavior in screenshots before claiming transparency. |
| Double-sided materials | Source/import metadata at root | Package support exists | Claim only if the tested route shows backface behavior. |
| Clearcoat | Material spec/inspector intent at root; root contract measured no clearcoat-specific visible delta | Package support exists | Do not claim rendered clearcoat from root until pixel evidence proves it. |
| Sheen | Material spec/inspector intent at root | Package support exists | Treat as partial unless screenshot-proven. |
| Transmission / glass / volume | Partial intent at root | Bounded scene-color refraction has production-runtime/WebGL2 pixel proof | Do not claim real refraction/transmission through root without root-only pixels; do not extend the package proof to physical caustics or recursive/off-screen refraction. |
| Variants | Asset/material metadata and route logic | Package/workflow support | Claim selected variant behavior only when tested. |
| HDR/IBL / PMREM | Requested/source diagnostics at root | RGBE file loading and bounded GGX PMREM have production-runtime/rendering proof | Root claim requires root-only browser evidence and diagnostics. |
| Single directional PCF shadow map | Root-proven by `tests/browser/createAuraApp-shadow-contract.spec.ts`: rendered, sampled, pixel-measured floor darkening, stable across resize and DPR | Package support exists | Can claim one root directional PCF shadow map with the retained contract. Does not extend to cascades, point/spot shadow maps, or Three.js shadow parity. |
| Cascaded directional / point / spot shadow maps | Not proven through root | Package support exists | Root claims for cascades or point/spot shadows still require their own root-only pixel proof. |

## Current Rule

Root examples may say they use root-proven base color, limited
metallic/roughness material contrast, emissive color/intensity, typed material
metadata, studio lighting, and material diagnostics when they cite retained
evidence. They must not imply complete Three.js-style material parity, high-end
PBR, normal maps, clearcoat, glass/transmission, environment prefiltering, or
broader production shadow behavior unless the route imports only `@aura3d/engine`
and the captured pixels prove that feature. Root routes may additionally claim
sampled base-color textures and a single directional PCF shadow map, because both
now have retained root-only pixel evidence.

Current retained root material evidence is written to
`tests/reports/createAuraApp-material-pbr-contract/material-contract.json`.
That evidence marks base color, limited metallic/roughness response, emissive
color/intensity, and **sampled base-color textures** as root-proven. The texture
claim rests on a controlled on/off comparison of the same typed asset at the same
camera and lighting: 48.4% of the compared region changed, mean chroma 18.6
textured versus 8.1 with an achromatic flat override, and brightness-normalized
local variation 0.188 versus 0.092. A negative control confirms the same gate does
not fire for two flat-coloured material variants, so it cannot be satisfied by an
arbitrary material swap.

Root shadow evidence is written to
`tests/reports/createAuraApp-shadow-contract/shadow-contract.json`. It proves one
directional PCF shadow map that is requested, rendered into a depth target,
sampled by a shader, and visible as measured floor darkening against a
same-lighting no-caster control, with coverage stable within 10.1% across five
backing-store sizes and three device pixel ratios.

Alpha/glass intent and helper names such as `material.physical`,
`material.chrome`, and `material.glass` remain partial; normal-map,
double-sided, and clearcoat rendered-feature claims remain unsupported in the
root contract.

Root shadow diagnostics report device-observed state rather than a source
constant. `app.diagnostics().renderer?.shadows` separates `requested` (a
shadow-casting light was collected) from `mapRendered` (a shadow depth target was
allocated) and `mapSampled` (a shader bound and sampled the map). `enabled` is
true only when a mounted runtime actually sampled a shadow map, so an unmounted
scene plan cannot report shadow support.

## Public Diagnostics

Use `material.capabilityDiagnostics(...)` before making a material claim:

```ts
import { material, renderer } from "@aura3d/engine";

const glassReport = material.capabilityDiagnostics(material.clearGlass());
const profiles = renderer.qualityProfiles();
```

The material report lists `requestedFeatures`, `partialRequestedFeatures`,
`unsupportedRequestedFeatures`, per-feature root/production-runtime support, and
claim rules. A partial feature is allowed in source, but it is not a launch or
marketing claim until a browser screenshot proves the pixels for that feature.

`app.diagnostics().renderer?.materialCapabilities` exposes the same report for
materials actually present in the mounted scene.

## Superiority (K1 · 2026-09-04)

- WIN: same-scene Aura-vs-r185 captures earned in-run (see
  `pbr-gltf-correctness.md` Superiority for receipt paths); the library K1
  matrix maps 750 three.js source files + 425 jsm + 61 TSL files with every
  GAP owned and every OUT reasoned
  (`tests/reports/muse3jsparity/matrix-check.json`).
- LOSS: the capture pair carries the disclosed material-response delta; the
  matrix still records PARTIAL 15 / GAP 4 (controls→N2/F1, objects→B4/D3,
  render-bundles→J2, lights→Q1.6/B5) — none of those rows are claimed here.

## Physical lobe support matrix (5.0)

`EXTERNAL_PARITY_MATERIAL_EXTENSION_SUPPORT`
(`packages/rendering/src/materials/MaterialExtensions.ts`, mirrored by the
engine's `PHYSICAL_EXTENSION_MATRIX`) lists clearcoat, sheen, specular,
transmission, volume, IOR, anisotropy, iridescence, emissive strength, texture
transform and multi-UV as `supported` in the generated WebGL2 and WebGPU
programs. Each lobe map has its own texture transform and UV0/UV1 selection;
colour maps (sheen colour, specular colour, diffuse-transmission colour) are
sRGB and all other lobe maps are linear data. The diagnostic text keeps the
non-claims: no caustics or multi-bounce refraction, no in-volume scattering,
no full spectral iridescence, no inter-layer coat scattering.
`analyzeMaterialExtensionCombination` still reports per-draw limits (missing
UV channels, texture-binding limits, missing transmission backdrop and the
experimental WebGPU backend).

**Authored tangents.** When geometry carries a `TANGENT` attribute, the base
normal map, the clearcoat normal map and anisotropy use the authored frame in
both backends: `T` is the tangent made orthogonal to the interpolated normal,
`B = sign(w) * cross(N, T)`, and back faces of double-sided materials use the
negated frame. The UV-derivative frame is used only for geometry without
tangents. The reference construction is `authoredTangentFrame` in
`packages/rendering/src/materials/authoredTangent.ts`.

**Independent WebGPU preview** (`a3d.independentPhysicalPreview`). The preview
accepts every lobe combination the default WebGPU program accepts. When preview
sheen is combined with other lobes, the iridescence and anisotropy per-light
terms use the sheen's per-light compensation, and transmission and diffuse
transmission use its view-side compensation. Clearcoat layers over the result.
The sheen's indirect term uses the same diffuse irradiance as the substrate:
uniform ambient, environment, hemisphere, local probe, irradiance volume,
probe grid, voxel or baked lightmap. For non-uniform lighting this is the
uniform-environment equivalent of the cosine-weighted irradiance.
