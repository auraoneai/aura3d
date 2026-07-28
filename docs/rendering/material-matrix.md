# Renderer Material Matrix

Material support exists at multiple layers. Public docs must say which layer a
claim applies to.

| Feature | Root `createAuraApp` safe path | `@aura3d/rendering` / production-runtime packages | Claim rule |
| --- | --- | --- | --- |
| Base color / factor | Root-proven by `tests/browser/createAuraApp-material-pbr-contract.spec.ts` | Supported | Can be claimed with retained root screenshot evidence. |
| Base-color texture on typed GLB | Partial: typed textured assets render and metadata is retained, but controlled texture on/off proof is still missing | Supported | Can describe typed texture metadata and rendered textured assets; do not claim full texture-material parity. |
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
| Shadow maps / high-quality shadows | Basic/contact/source cues at root | Package support exists | Root production-shadow claims require pixel proof. |

## Current Rule

Root examples may say they use root-proven base color, limited
metallic/roughness material contrast, emissive color/intensity, typed material
metadata, studio lighting, and material diagnostics when they cite retained
evidence. They must not imply complete Three.js-style material parity, high-end
PBR, normal maps, clearcoat, glass/transmission, environment prefiltering, or
production shadow behavior unless the route imports only `@aura3d/engine` and
the captured pixels prove that feature.

Current retained root material evidence is written to
`tests/reports/createAuraApp-material-pbr-contract/material-contract.json`.
That evidence marks base color, limited metallic/roughness response, and
emissive color/intensity as root-proven; base-color texture inventory,
alpha/glass intent, and helper names such as `material.physical`,
`material.chrome`, and `material.glass` remain partial; normal-map,
double-sided, and clearcoat rendered-feature claims remain unsupported in the
root contract.

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
