# Lighting, shadows, environment, and color

Aura3D has a bounded production-runtime comparison for lighting, shadows,
environment processing, and display color. Run the complete gate with:

```bash
pnpm renderer:lighting-environment-color
```

The gate rebuilds distribution output, verifies `three@0.185.1` / r185 online,
runs 89 focused renderer tests, renders nine WebGL2 browser gates, rejects
evidence older than 30 minutes, and writes the aggregate receipt to
`tests/reports/lighting-environment-color/report.json`.

## Light types

The production renderer has measured paths for directional, point, spot, and
finite rectangular lights.

- The current-Three.js physical-light comparison uses one computed camera frame,
  identical point/spot descriptors, the same directional fill, the same scene
  dimensions, DPR 1, linear-lighting intent, ACES exposure 1, and sRGB output.
  Its inverse-square/range samples have zero measured delta at distances 1, 2,
  and 3 for the locked workload. The full-frame structural-similarity proxy is
  0.870; this is useful comparison evidence, not an assertion of pixel identity.
- The rectangular emitter is a finite, one-sided, size-dependent quadrature
  light. Changing its size or facing changes more than 1,000 pixels, and the
  wide forward-facing emitter is more than 1.15 times the small emitter's mean
  luminance and more than 1.8 times the back-facing result.

The rectangular light is not a Three.js LTC lookup-table identity, has no
rectangular-light shadow-map path, and is not automatically a root
`createAuraApp` capability.

## Directional shadows and CSM

The same-scene current-Three.js shadow gate renders a 2048-square Aura3D
directional shadow map with 16-tap PCF and a Three.js `PCFSoftShadowMap` control.
Both frames require visible contact darkening, nonblank/color-diverse output,
real draw calls, and retained PNG artifacts.

The CSM browser gate goes beyond a cascade count:

- four monotonic cascade ranges are rendered;
- a 16-sample PCF edge has seven measured penumbra levels;
- the caster footprint darkens by 39.106 RGB-sum units while the wider receiver
  changes by only 1.944, rejecting a global dark wash;
- a receiver-only negative control measures 0.024 mean darkening, guarding
  against shadow acne;
- a box seated exactly on its receiver produces 303 shadow-only receiver pixels
  with a one-pixel silhouette-to-shadow contact gap, guarding the tested setup
  against peter-panning;
- a sub-texel camera move retains all four snapped cascade centers, while a
  multi-texel move advances all four;
- the public CSM pipeline places four non-overlapping cascade allocations into
  its atlas at 100% utilization for the tested layout.

Those measurements prove the selected camera/light/caster workload. They do not
prove every world scale, camera speed, bias, light angle, or hardware driver.

## HDR, IBL, tone mapping, and background

The HDR browser gate creates and reads a real `rgba32f` WebGL2 render target. A
linear red value of 2.5 survives as overbright input and is tone mapped to byte
value 182 rather than clipped to white.

The PMREM comparison loads the same Radiance HDR fixture for Aura3D and current
Three.js. Aura3D converts the equirectangular source to a cubemap, performs GGX
importance-sampled prefiltering, and supplies eight mip levels plus a split-sum
BRDF LUT. On the locked metallic/roughness sphere row, mean delta is 6.499 and
the structural-similarity proxy is 0.975. The same-HDR background comparison has
a 0.957 structural-similarity proxy.

Color policy is explicit and tested: lighting calculations are linear;
base-color and emissive textures decode from sRGB; normal,
metallic/roughness, and occlusion data remain linear; selected comparisons use
ACES intent at exposure 1 and sRGB display output. These tests do not establish
OpenEXR support, physical Rayleigh/Mie atmosphere, global illumination, or
universal output equivalence.

Root IBL (muse3jsparity-PRD B3, 2026-09-03): `environments.hdri({ texture })`
resolves an authored Radiance `.hdr` post-mount through the HDR to cubemap to
GGX-prefilter to BRDF-LUT chain and reports `iblPixelBacked` only after the
live lighting object swaps; first frames render the honest studio procedural
fallback, and fetch/parse failures keep the fallback with a warning. The
optional `reflectionTexture` second probe owns the sharper specular mips while
`texture` keeps the roughest diffuse mip (reflection versus illumination at
the resource level; no second sampler is claimed). Per-material
`envMapIntensity` scales the sampled env-map response through the
`u_materialEnvironmentIntensity` uniform the forward pass never overwrites
(WebGL2; the experimental WebGPU path is unchanged). Evidence:
`tests/browser/root-ibl-b3.spec.ts`,
`tests/reports/root-ibl-b3/b3-probe.json` (HDRI-vs-procedural delta 0.6121,
dual-probe delta 0.0327, envMapIntensity 0-vs-2 delta 0.0346),
`tests/unit/rendering/dual-probe-environment.test.ts`,
`tests/unit/rendering/environment-preset-pack.test.ts` (indoor/outdoor/night
pack with measured exposure normalization; rebuilt normalized PMREM rows keep
real SSIM >= 0.975 against frozen references). EXR remains explicitly
unsupported.

## Contact-shadow terminology

Aura3D's product contact path is described as a **bounded receiver-contact
approximation**. It uses directional multi-lobe receiver geometry together with
a renderer-owned directional shadow map. It is not described as a general
screen-space, ray-traced, or universal contact-shadow system.

The same-scene current-Three.js contact gate records 54.856 Aura3D contact
darkening versus 54.907 for the locked Three.js control, with mean delta 11.892
and structural similarity 0.953. Those figures support the bounded wording;
they do not broaden its algorithmic scope.

Material occlusion maps, the bounded receiver-contact approximation, SSAO, and
directional shadow-map occlusion are distinct features. Documentation and
telemetry must not use one as proof of another.

## Evidence

- aggregate: `tests/reports/lighting-environment-color/report.json`;
- physical lights: `tests/reports/threejs-parity/physical-lights-parity.json`;
- rectangular light: `tests/reports/lighting-environment-color/rect-area-light.json`;
- directional shadow comparison: `tests/reports/threejs-parity/shadowmap-parity.json`;
- CSM quality: `tests/reports/external-parity-shadow-cascade-browser.json`;
- bounded contact comparison: `tests/reports/runtime-parity/contact-shadow-parity/contact-shadow-parity-report.json`;
- PMREM/skybox: `tests/reports/runtime-parity/pmrem-parity/pmrem-parity-report.json`;
- HDR target/tone mapping: `tests/reports/external-parity-hdr-browser.json`.
