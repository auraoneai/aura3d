# 04 — Lighting, IBL, and shadows: forensic audit

Branch `aura3d-quality-rebuild/audit`. Scope: light types and units, punctual falloff, clustered lighting, light caps, PMREM/IBL, BRDF LUT, environment intensity and rotation, HDRI loading, background versus lighting environment, reflection probes, shadows (resolution, filtering, bias, cascades, stabilization, point and spot), contact shadows, AO, specular occlusion, and light probes. The audit also establishes the defaults a user gets with no explicit lighting.

Method: I traced the root `createAuraApp` render path from scene node to GLSL and read the shader source strings, the CPU prefilter code, sampler descriptors, and default values. Tests, evidence JSON, and README claims got no credit. The reference is three.js r185 (`node_modules/three`, version `0.185.1`). I ran nothing in a browser.

---

## 0. TL;DR — why the games look flat, ranked by pixel impact

1. **`lights.ambient()` switches IBL off completely.** 24 of 26 `apps/showcase-*` call `lights.ambient(...)`, and only 4 add an `environments.*` node. When a scene has ambient lights and no environment node, the root bridge returns `environmentMapIntensity: 0, environmentMapSpecularIntensity: 0` with no map and no procedural map (`packages/engine/src/agent-api/index.ts:12701-12716`). Those scenes therefore get no environment reflections and no sky/ground diffuse gradient. Surfaces receive a uniform ambient color plus direct lights. This is the textbook "PS1/N64 look".
2. **Aura's ambient is π× stronger than three.js ambient.** In Aura the ambient term is `kd * albedo * color * intensity * hemi(0.35..1)` (`ShaderLibraryCore.ts:622-634` plus `ShaderChunks.ts:212`). In three.js it is `irradiance * BRDF_Lambert = color * intensity * albedo / π` (`three/src/renderers/shaders/ShaderChunk/lights_pars_begin.glsl.js:48-52`, `lights_physical_pars_fragment.glsl.js:563`). So `ambient 1.25` in courier-rush equals roughly three `AmbientLight(…, 3.9)`: a flat wash that drowns every directional cue.
3. **Shadows are drawn at 32% strength by default.** `createProductionRuntimeShadowOptions` sets `strength` to 0.32 for games (0.38 for city-day, 0.24 for product/material) (`agent-api/index.ts:12966-12968`). The shader applies `mix(1, 1-occlusion, strength)` (`ShaderLibraryCore.ts:530`, `ShaderLibrary.ts:2530`). three.js `LightShadow.intensity` defaults to 1. Worked example for courier-rush (section 6.6): fully shadowed ground is only about 10% darker than lit ground. Shadows are effectively invisible.
4. **The default/preset environment map ignores roughness.** The procedural IBL bundle binds a GGX-prefiltered mip chain through `new Sampler({ minFilter: "linear", ... })` (`ExternalParityRenderPreset.ts:163-169`). A WebGL2 sampler object overrides texture parameters (`WebGL2Device.ts:3823`), and `GL_LINEAR` minification reads only level 0. `textureLod(..., roughness * 4)` therefore always returns the sharp 128×64 level. Every `environments.studio/productHero/...` scene and every no-light default scene reflects the same unfiltered map at every roughness, and the "diffuse" lookup (max LOD) also reads level 0, so it is just an unconvolved per-normal texel.
5. **The preset environments are 128×64 LDR textures.** They are generated gradients tone-mapped with Reinhard into 8-bit sRGB before prefiltering (`ExternalParityRenderPreset.ts:137-151`, `EnvironmentMapResources.ts:153-172`). Reflected radiance cannot exceed 1.0, so there are no hot highlights. Metals look gray-plastic, and clearcoat has nothing bright to reflect.
6. **The HDRI path squashes diffuse IBL toward a constant.** The CPU PMREM blends each level toward the global average radiance by `min(0.82, roughness⁴·0.82)` (`production-runtime/environment/PMREMGenerator.ts:345-350`). The diffuse term samples the roughest mip, which is 1×1 per face at roughness 1 and therefore 82% global average. The sky-above/ground-below cue is mostly erased, and the remaining signal is a six-value "ambient cube".
7. **No sky background from the environment.** The root path never submits an environment background. The background is `clearColor` from `snapshot.background` (`agent-api/index.ts:13592-13595`). Every game shows a flat colored void unless it builds sky geometry.
8. **The single directional shadow map is fit to the whole scene's bounds every frame** (`Renderer.ts:1964-1986`). There is no camera-frustum fit and no texel snapping, so large levels get low texel density and shimmer. Filtering is manual nearest-sampled grid PCF (9 or 16 taps) (`ShadowPass.ts:141`, `ShadowMap.ts:221-245`), which produces stair-stepped penumbrae. CSM exists but the root never sets `cascadeCount`, and its implementation picks one cascade **per draw item by object center** (`ForwardPass.ts:834-854`), which is incorrect for any large ground mesh.
9. **AO is cosmetic.** The "SSAO" pass compares 8 raw non-linear depth texels 1–8 px away with no normals and no view-space radius (`WebGL2Device.ts:3092-3128`). It is an edge darkener at best and a no-op at worst. "Contact shadows" in diagnostics are counted from node **names** containing `"contact shadow"`, `"footprint"`, or `"glow pool"` (`agent-api/index.ts:4485-4487`). The diagnostic `mapType: "pcf-soft"` is a hard-coded string (`agent-api/index.ts:4614`).
10. **Point and spot lights are tiny in practice.** Point range is hard-coded to `10 * scale` (`agent-api/index.ts:13244`), falloff is clamped at d² ≥ 1 m², spot `decay` is accepted and then ignored, the default point intensity is 2, and nothing documents units. Game point lights (intensity 0.12–2.3) contribute almost nothing next to the π-scaled ambient.

Net assessment: the BRDF math (GGX/Smith-correlated/Burley, split-sum with multi-scatter) is respectable. The **defaults, the data feeding it, and the composition rules** are what produce the generational gap. Most of the damage is bucket B (defaults) and bucket E (agents reach for `lights.ambient`, the skills never warn them), sitting on a few real A-bucket bugs: the sampler mip bug, the PMREM average blend, missing background, broken CSM, and fake SSAO.

---

## 1. The actual render path (what a game really runs)

| Step | Code | Notes |
|---|---|---|
| `createAuraApp(...)` → `createProductionSceneRenderer` | `agent-api/index.ts:12275`, `12523-12552` | The default quality profile is `"safe-basic"` (`:4312`), but its `rendererMode` is `"production"` (`:4253`), so **every** app uses the production bridge. If that bridge throws, it falls back to `createWebGLSceneRenderer`. |
| `createProductionRuntimeSceneRenderer` | `:13540` | `ProductionRuntimeRenderer.create({ backend: "webgl2", antialias: true, clearColor })` (`:13586-13596`). WebGPU is never selected on the root path. |
| Environment selection | `createProductionRuntimeEnvironment` `:12628-12731` | Three-way branch: authored environment node, then ambient lights, then a scene-category preset. |
| Direct lights | `createProductionRuntimeCollectedLights` `:13156-13165` | No authored lights produces a three-directional fallback rig (`:13342-13394`). |
| Shadows | `createProductionRuntimeShadowOptions` `:12942-12974` | Shadows are on whenever any light has `castsShadow`. The caster is chosen by priority (`:13174-13195`), so a directional casts even without `shadow: true`. |
| Renderer | `ProductionWebGL2Renderer` → `Renderer.ts` → `ForwardPass.ts` → `WebGL2Device.ts` | Forward, single pass per item. |
| Primitive shader | `aura3d/pbr-direct`, registered by `registerLeanPbrShader` (`ShaderLibraryCore.ts:291-781`) | Used by every `primitives.*` (most game geometry). No normal or AO maps, no spot-shadow override. |
| GLB/textured shader | `aura3d/pbr-textured` (`ShaderLibrary.ts:2063-3236`) | Used by typed GLB actors and textured primitives. 10 variants, all except the base define `A3D_PBR_DISABLE_CLUSTERED_LIGHTING` (`:2066-2075`). |
| Tone map | Inside every material shader (`ShaderLibraryCore.ts:588-593`, `ShaderLibrary.ts:2464-2469`) | Narkowicz ACES fit plus sRGB when `u_outputColorSpace ≥ 0.5`. Not audited here. |

`packages/rendering/src/shaders/pbr-direct.frag.glsl` (893 lines) is **not** what runs. `rg "pbr-direct.frag"` finds no importer, and the registered `aura3d/pbr-direct` is the inline string in `ShaderLibraryCore.ts`. Any audit or test reading the `.glsl` file is reading dead code.

---

## 2. Defaults when the user writes no lighting

### 2.1 No lights and no environment node

| Item | Value | Source |
|---|---|---|
| Direct lights | key directional `[1,.94,.82]` ×2.6 dir `[.44,-.64,-.63]` (casts shadow), fill `[.52,.64,.9]` ×0.64, rim `[.88,.94,1]` ×0.88 | `agent-api/index.ts:13342-13394` |
| Environment preset | Picked by `resolveRendererSceneCategory` from node names: `city-day`→`daylight`, `city-night`→`evening`, `game`→`gameplay`, `material`→`inspection`, otherwise `studio` | `:12717-12723` |
| `gameplay` preset | ambient `[.34,.42,.50]`×0.18; procedural sky `[.16,.38,.60]`, horizon `[.10,.72,.70]`, ground `[.08,.12,.18]`, **specular color `[0.2,0.96,1.0]` (cyan)**; procedural 0.46/0.74; texture 0.34/0.76 | `ExternalParityRenderPreset.ts:588-606` |
| Env texture | 128×64 generated gradient plus one softbox blob (2.5) plus a sine stripe, Reinhard-tonemapped (exposure 0.9) into RGBA8 sRGB, 5 "GGX" levels with 64 samples | `ExternalParityRenderPreset.ts:133-151`, `226-255` |
| Env sampler | `minFilter: "linear"` (no mipmap), so **only level 0 is ever sampled** | `ExternalParityRenderPreset.ts:163-169`; GL semantics in `WebGL2Device.ts:3815-3823`, `4140-4155` |
| BRDF LUT | 32×32 RGBA8, GGX importance-sampled split-sum | `EnvironmentMapResources.ts:579-656` |
| Shadow | enabled; size 1024 / 2048 / 4096 by scene radius (≤10 / ≤30 / >30); bias `clamp(2R/size·0.55, 0.00035, 0.004)`; grid PCF 9 taps r=1.2 or 16 taps r=1.5; nearest sampler; strength 0.32 | `agent-api/index.ts:12959-12974`, `12985-13000` |
| Background | `snapshot.background` solid clear color | `:13592-13595` |
| AO / SSAO | off | `:12831-12891` (only when `effects.ambientOcclusion/contactOcclusion` exists) |

In this mode the "game" category gets cyan-tinted procedural specular on every surface. Combined with the sampler bug, that is a sharp, roughness-independent cyan/teal gradient reflection.

### 2.2 With `lights.ambient()` and no environment node (what 20 of 26 showcases actually do: 24 use ambient, and 4 of those also add an `environments.*` node)

```ts
// agent-api/index.ts:12701-12716
const ambientLights = nodes.filter(... node.light === "ambient" && node.intensity > 0);
if (ambientLights.length > 0) {
  ...
  return { preset: "authored-ambient", ...,
    lighting: { color, intensity, environmentMapIntensity: 0, environmentMapSpecularIntensity: 0 } };
}
```

There is no `proceduralMap`, no `environmentMapTexture`, and no BRDF LUT. In `pbr-direct`, `proceduralEnvironmentWeight = step(0.0001, u_environmentMapIntensity) = 0` and `sampledEnvironmentWeight = 0`. The only surviving indirect term is:

```glsl
// ShaderLibraryCore.ts:622-623
float environmentHemi = mix(0.35, 1.0, clamp(normal.y * 0.5 + 0.5, 0.0, 1.0));
vec3 ambientEnvironment = u_environmentColor * u_environmentIntensity * environmentHemi;
```

Environment specular is **zero**. `a3dPbrEnvironmentLightSplitSum` with `brdf=(1,0)` and specularRadiance 0 makes metals black in shadow and leaves dielectrics with no Fresnel rim. Only punctual highlights remain.

### 2.3 With an `environments.*` node

The preset bundle is scaled by the node intensity (`agent-api/index.ts:12681-12698`). **Ambient lights are then silently ignored**: the environment branch returns before the ambient branch, and the ambient light descriptor returns `[]` (`:13208-13212`). Because of the sampler bug (2.1), these scenes still get roughness-independent LDR reflections.

### 2.4 With `environments.hdri({ texture })`

The first frames use the studio procedural fallback. After an async fetch, `upgradeProductionEnvironmentHdri` (`:14190-14243`) builds:
- an RGBA16F equirect, CPU-GGX-prefiltered with 16 samples into 9 levels (`PBRHDRPipeline.ts:149-168`);
- a 128-px RGBA16F cubemap PMREM, CPU-GGX with 32 samples and 8 levels (128→1) (`PBRHDRPipeline.ts:169-173`), sampled with `linear-mipmap-linear` (correct);
- a 64×64 BRDF LUT;
- `lighting.intensity: 0.08` ambient and a weak procedural map (`PBRHDRPipeline.ts:263-273`) **replacing** the authored environment color.

All prefiltering runs **on the main thread in JS** at mount. Zero showcases use this path (`rg environments.hdri apps/showcase-*` returns nothing), and `aura.assets.json` contains no `.hdr` entry. The only HDRIs in the repo are four 1k fixtures under `fixtures/`.

### 2.5 Comparison with three.js r185 defaults

three.js with no lights and no `scene.environment` renders MeshStandardMaterial black. Aura's fallback is more generous, so the problem is not missing defaults. Its defaults are low-fidelity (LDR, unfiltered), weakly shadowed, and **mutually exclusive with the most common user action** (adding ambient).

---

## 3. Light types, units, and falloff

### 3.1 Inventory

| Public API (`agent-api/index.ts:3063-3156`) | Renderer kind | Default intensity | Notes |
|---|---|---|---|
| `lights.ambient` | env-intent (not a light) | 0.28 | Kills IBL (2.2). π× brighter than three. |
| `lights.directional` | directional | 1.5 | Default position [3,4,3]; `shadow` optional. Casts by default via the priority rule. |
| `lights.point` | point | 2 | **No `distance`/`decay` option.** Range = `10 * scale` (`:13244`). |
| `lights.spot` | spot | 8 | `distance` (12) is used. **`decay` is accepted but never read**: the descriptor at `:13258-13276` has no decay field. |
| `lights.studio` | 3 directionals (key, fill ×0.32, rim ×0.54) | 1 | `:13308-13341`. Direct only, no IBL. |
| `lights.rect` / `softbox` | **spot proxy** in the descriptor (`:13279-13301`), kind `spot` | 1.4 / 1.75 | The shader has a 4-tap Gauss–Legendre rect integrator (`ShaderChunks.ts:165-195`, kind > 2.5), but the root bridge emits `kind: "spot"` for rect/softbox, so the root path never uses the area-light code. |
| hemisphere | none | — | There is no `HemisphereLight`. The fake hemisphere is the `environmentHemi` 0.35–1.0 factor. |

### 3.2 Units

Nothing declares units. Effective conventions read off the GLSL:
- Directional: `L·n * I * (albedo/π + spec)` → I is irradiance (lux-like) in arbitrary scale. Same convention as three.js (`lights_physical` uses `irradiance = dotNL * directLight.color`).
- Point/spot: `I / max(d², 1) * window(d/range)` → candela-like, except for the 1 m² clamp.
- Ambient: `I * albedo` (no 1/π) → **radiance-scaled, π× three's**.
- Environment: `sampled * envIntensity` → radiance (matches three's `PI * envColor * BRDF_Lambert` after cancellation).

There is no exposure-in-EV, no lux/candela/lumen API, and no physically based camera. three.js r155+ has used physically correct intensities (candela/lux, `decay = 2`) by default.

### 3.3 Punctual falloff in GLSL

```glsl
// ShaderLibraryCore.ts:732-735 and ShaderLibrary.ts:3183-3186 (identical)
float rangeFalloff = clamp(1.0 - pow(distanceToLight / range, 4.0), 0.0, 1.0);
rangeFalloff *= rangeFalloff;
attenuation = rangeFalloff / max(distanceToLight * distanceToLight, 1.0);
```

three.js r185 (`lights_pars_begin.glsl.js:56-67`):

```glsl
float distanceFalloff = 1.0 / max( pow( lightDistance, decayExponent ), 0.01 );
if ( cutoffDistance > 0.0 ) distanceFalloff *= pow2( saturate( 1.0 - pow4( lightDistance / cutoffDistance ) ) );
```

| | Aura | three r185 |
|---|---|---|
| Near clamp | d ≥ **1 m** | d ≥ 0.1 m |
| Decay | fixed 2 | configurable (`decay`, default 2) |
| Cutoff | always (`range` = 10·scale for point) | optional (`distance=0` means infinite) |
| Window | Frostbite | Frostbite |

Visual effect: a point light 0.3 m from a surface is 11× dimmer than in three.js, so close practicals and neon strips cannot produce hot pools. Lights beyond 10 m contribute zero.

Spot cone: `smoothstep(cos(angle), cos(angle·(1-penumbra)), cosθ)` (`ShaderLibraryCore.ts:737-742`). This matches three's `getSpotAttenuation` in spirit.

### 3.4 Quantified example: courier-rush (`apps/showcase-courier-rush/src/main.ts:302-313`)

`ambient #7f9cb5 ×1.25`, `moonlight directional ×2.5 shadow:true at (-18,26,8)`, `city glow directional ×1.35 at (20,18,16)`, plus ~30 point lights at intensity 1.1–5.2 (`city.ts:250-699`).

For a flat ground with albedo *a*, ignoring specular:
- ambient: 1.25 × hemi(1.0) × a = **1.25a**
- moon: 2.5 × n·l(0.80) / π × a = **0.64a**
- city glow: 1.35 × 0.57 / π × a = **0.25a**
- typical point at 3 m: 2.0 × (1−(0.3)⁴)² / 9 / π × a ≈ **0.14a**

Ambient is 58% of all light, so the image is dominated by a directionless constant.

---

## 4. Light count, clustering, and the forward loop

| Fact | Evidence |
|---|---|
| Uniform path cap: 16 lights (`u_lightData[96]` vec4 = 16 × 6) | `ShaderLibraryCore.ts:394`, `705`; `LightUniforms.ts:4` `MAX_DIRECT_LIGHTS = 16` |
| Clustering only when `lights.length > 16` | `ForwardPass.ts:251-258` |
| Clusters are **2D screen tiles of 64 px with no depth slices** | `ClusteredForwardLighting.ts:6`, `77-79`, mode `"screen-tile-texture-grid"` |
| Built on the **CPU every frame**, textures created and disposed per frame | `ForwardPass.ts:251-266` |
| Per-cluster cap 64 | `ClusteredForwardLighting.ts:7` |
| **All 9 extension variants of `pbr-textured` define `A3D_PBR_DISABLE_CLUSTERED_LIGHTING`** and hard-cap at 16 | `ShaderLibrary.ts:2066-2075`, `3144-3146` |
| Every light is evaluated with no culling when ≤16 (no range test before the BRDF) | loop `ShaderLibraryCore.ts:706-774` |

Grade: clustered lighting exists, technically works, and is used by scenes with >16 lights (courier-rush, pulse-tunnel). It is 2D-only, CPU-rebuilt per frame, and disabled on any GLB with extension textures. three.js has no clustering; it compiles exact light counts and has no 16 cap. Aura's approach does not buy visual quality, because the lights it enables are too dim (3.3).

---

## 5. IBL, PMREM, BRDF LUT, and HDRI

### 5.1 Specular prefilter — three implementations, none matching three.js

| Path | Where | Source format | Filter | Sizes | Shader-sampled correctly? |
|---|---|---|---|---|---|
| Preset/procedural (`environments.*`, defaults) | `EnvironmentMapResources.ts:245-282` → `SpecularPrefilter.ts` | 128×64 **RGBA8 sRGB, Reinhard-tonemapped LDR** | GGX importance, 64 samples, per level | 128×64 … 8×4 (5 levels) | **No.** The sampler is `linear`, so level 0 only. |
| HDRI equirect | `PBRHDRPipeline.ts:166-168` | RGBA16F linear | GGX, 16 samples | source res, 9 levels | Superseded by the cube when the cube is bound (`mix(eq, cube, step(.5, cubeEnabled))`) |
| HDRI cube | `production-runtime/environment/PMREMGenerator.ts:118-149`, `282-351` | RGBA16F | GGX, **32 samples, point-sampled bilinear from the full-res equirect, no PDF-based source-LOD**, then **blend toward global average by roughness⁴·0.82** | 128² … 1² (8 levels), roughness = mip/7 | Yes (`linear-mipmap-linear`) |

three.js r185 `PMREMGenerator`:
- GPU, from a cube of size `equirect.width / 4` (`PMREMGenerator.js:268`): a 1k HDRI gives a 256 face and 2k gives 512. Aura is fixed at 128.
- Successive separable Gaussian blurs (≤20 samples per pass, `MAX_SAMPLES = 20`) on progressively downsampled mips, so there is no point-sampling noise.
- `LOD_MIN = 4`: the roughest levels stay at a **16-px** face with extra sigma levels (`EXTRA_LOD_SIGMA`). Diffuse irradiance comes from a 16-px roughness-1 level, so it stays directional.
- Shader: `getIBLRadiance` bends the reflection vector toward the normal by `pow4(roughness)` (`envmap_physical_pars_fragment.glsl.js:29`), and `textureCubeUV` uses a non-linear roughness→mip map.

Aura's specific defects:
1. **The average blend** (`PMREMGenerator.ts:345-350`): `wideLobeBlend = min(0.82, roughness**4 * 0.82)`. At roughness 1 the texel is 82% scene-average. This is invisible in tests that check "variance decreases with mip" but deadly to the look: rough objects stop picking up sky-blue tops and earth-tinted bottoms.
2. **The 1×1 roughest face** feeds diffuse (`ShaderLibrary.ts:2643-2644`, `diffuseEnvironmentLod = mipCount-1`). Diffuse irradiance is six numbers. WebGL2 seamless cube filtering smooths edges slightly, but there is no real cosine convolution.
3. **The computed SH9 / cosine irradiance is never sampled.** `createEnvironmentMapResourceSet` builds `diffuseIrradiance` (diagnostics say `"sh9-cosine-convolved"` / `"cosine-weighted-hemisphere"`, `EnvironmentMapResources.ts:543-571`, `PBRHDRPipeline.ts:198-199`), but no shader has an irradiance sampler or SH uniforms (`rg "Irradiance|sh9" ShaderLibrary.ts ForwardPass.ts WebGL2Device.ts` finds no binding). This is fake parity: it is computed, reported, and unused.
4. **Linear LOD mapping** `lod = roughness * (mips-1)` (`ShaderLibrary.ts:2666`) with a `mix(1.1, 0.65, roughness)` fudge on sampled specular (`:2669`, `ShaderLibraryCore.ts:650`). It is ad-hoc rather than energy-derived.
5. **32 point samples** across a 1k/2k equirect for mid-roughness lobes alias bright sources (the sun) into speckle and blotches, with no source-mip filtering (Křivánek filtered importance sampling).
6. **No horizon or specular occlusion** and no normal-bent reflection vector.

### 5.2 The procedural preset map is LDR and unfiltered

`createExternalParityEnvironmentLighting` (`ExternalParityRenderPreset.ts:133-151`) calls `createEnvironmentMapResourceSet({…, encoding: "linear-hdr"}, { toneMapping: "reinhard", exposure: 0.86–0.9, specularLevels: 5 })`. `encodeLinearHdrEnvironmentToRgba8` Reinhard-maps and quantizes to 8 bits (`EnvironmentMapResources.ts:153-172`), so the "HDR highlight" of 2.5–3.15 lands at about 0.7. The shader then multiplies by `environmentTextureSpecularIntensity` 0.72–0.95. **The brightest possible env reflection is about 0.65 linear before materials.** three.js `RoomEnvironment` reaches emissive values of 50+ on its light panels.

Then the sampler bug: `minFilter: "linear"` (`ExternalParityRenderPreset.ts:165`). `Sampler.ts:27` defaults `minFilter` to `"linear"`, and WebGL2 sampler objects override texture state. `textureLod` with a non-mipmap minification filter reads the base level only. Every preset environment therefore:
- gives rough and smooth materials the same sharp reflection;
- gives "diffuse IBL" an unconvolved per-normal lookup (the softbox blob shows as a diffuse hotspot).

The same default affects ordinary material textures (`new Sampler({ maxAnisotropy })` at `agent-api/index.ts:14385-14387` gets `minFilter: "linear"`). That belongs to the materials/assets audit but shares the root cause: `Sampler`'s default.

### 5.3 BRDF LUT

`generateApproximateBrdfLutPixels` is real (Hammersley + GGX importance + Smith-correlated, `EnvironmentMapResources.ts:589-697`). It is 32² for presets and 64² for HDRI, stored RGBA8. The shader uses Fdez-Agüera multi-scatter (`ShaderChunks.ts:217-245`), which is good and comparable to three's `computeMultiscattering`. Grade: technically works, used, good. In the ambient-only path (2.2) there is **no LUT bound**, and the shader falls back to `brdf = (1,0)`, i.e. Schlick-roughness only.

### 5.4 Intensity, rotation, and dual probe

- Rotation: `u_environmentMapTextureRotation` (turns/revolution) applied to both equirect UV and cube direction (`ShaderLibrary.ts:2602-2618`). It works. The default procedural presets ship non-zero rotations (0.06–0.32).
- Intensity: the HDRI path sets `environmentMapSpecularIntensity = intensity * 1.1` (`PBRHDRPipeline.ts:281`), an unexplained +10%.
- Dual probe (separate illumination and reflection HDRIs): implemented at the resource level by splicing the roughest mip (`PBRHDRPipeline.ts:296-330`). It is novel but unused.

### 5.5 HDRI loading

- RGBE `.hdr` with RLE: implemented (`PBRHDRPipeline.ts:108-135`, `HDRLoader.ts`).
- EXR: **explicitly unsupported** (`EnvironmentPlatform.ts:287-294`). three.js ships `EXRLoader` and `UltraHDRLoader`.
- KTX2/HDR cubemaps: not on this path.
- The upgrade is async and post-mount, and prefiltering is synchronous JS on the main thread (a 2k HDRI does 9-level GGX at full res plus a cube PMREM). Expect a visible hitch.

### 5.6 Background versus lighting environment

The root production path never sets an environment background. There is a `registerLeanEnvironmentBackgroundShader` (`ShaderLibraryCore.ts:808-889`) and an `EnvironmentBackgroundPass`, but `createProductionRuntimeSceneRenderer` passes only `clearColor` (`agent-api/index.ts:13586-13596`). `rg environmentBackground agent-api/index.ts` returns nothing. three.js equivalent: `scene.background = texture; scene.backgroundBlurriness; backgroundIntensity`. Every Aura game sky is a flat color (or hand-made geometry), which is a major contributor to the "old" look.

### 5.7 Reflection probes and light probes

- `ReflectionProbe.ts` (291 lines) can capture 6 faces into a cube and returns `EnvironmentLightingOptions`. It has **no prefilter** (raw cube, no GGX mips), **no per-object probe selection, no blending, and no box projection for probes** (box projection exists only for transmission parallax). It is not referenced by `agent-api` or any app.
- Light probes / SH: none. three.js has `LightProbe` plus `LightProbeGenerator`.

### 5.8 AO texture, specular occlusion, and red-paint hacks in the GLB shader

`pbr-textured` (`ShaderLibrary.ts:2959`, `2964`, `3064`, `3073`):
- AO is applied to IBL diffuse (correct), **never to IBL specular** (no specular occlusion; three applies `computeSpecularOcclusion`), and **partially to direct light** through `directTextureOcclusion = mix(1, ao, baseColorTextureWeight * mix(0.2, 0.56, redPaintGate))`. That is physically wrong and gated on how *red* the base color is.
- `sourcePaint*` / `materialRedPaintGate` (`:2905-2955`, `3061-3065`, `3203`): a large block of heuristics keyed to `u_baseColor.r > 0.18 && max(g,b) < 0.16`, with a hard-coded color cap `vec3(0.98, 0.12, 0.075)`. This is a benchmark-specific overfit (a red car-paint parity case) living in the production GLB shader. It modulates base color, direct intensity, and AO for any red-ish material in any game.

---

## 6. Shadows

### 6.1 Selection and enablement

- One caster per frame (`resolveProductionShadowCasterIndex`, `agent-api/index.ts:13174-13195`). Directional (priority 3) beats spot (2), which beats point (1). An explicit `shadow: true` wins, and any `shadow: false` with no explicit true disables shadows scene-wide.
- So: **one shadowed light per scene**. three.js allows any number of shadowed lights (each with its own map).

### 6.2 Directional

| Aspect | Aura | three r185 |
|---|---|---|
| Fit | Ortho fit to bounds of **all render items** (casters and receivers, including huge ground or sky meshes), padding 8% (`Renderer.ts:1964-1986`, `2891-2903`) | User-set `shadow.camera` ortho box (manual) or CSM addon |
| Stabilization | **None** for the single map (no texel snapping, refit every frame) | none built-in for the manual camera (it is static, so no shimmer) |
| Size | 1024/2048/4096 by heuristic scene radius from node positions (`:12959`) | `mapSize` default 512 |
| Depth | `DEPTH_COMPONENT24` texture (`WebGL2Device.ts:668`) | depth texture |
| Compare | **Manual** `texture(...).r` compare with a `nearest` sampler (`ShadowPass.ts:141`) | hardware `sampler2DShadow` (bilinear compare) |
| Filter | Grid PCF 3×3 (r 1.2) or 4×4 (r 1.5), binary taps (`ShadowMap.ts:221-245`). Poisson available but not selected. | `PCFShadowMap` (hardware PCF), `VSMShadowMap`, `BasicShadowMap`; PCSS in examples |
| Bias | constant `clamp(texelWorld·0.55, 3.5e-4, 4e-3)` **in normalized depth**, computed from a *world-space* texel size (`:12991-12993`); slope term `tan(θ)·slopeBias·texel·tapDistance` (the root sets no slopeBias for directional) | `bias`, `normalBias` (world-space offset along the normal) |
| Normal bias | **none** | `shadow.normalBias` |
| Strength | **0.32 default** | `shadow.intensity = 1` |

The bias unit mismatch: normalized ortho depth spans the light-space depth range of the whole scene. With a 60 m deep fit, 0.004 normalized is about 0.24 m of bias, which produces peter-panning on large levels. Small scenes clamp to 3.5e-4 and get acne at grazing angles, because the root sets no slope bias for directional lights.

### 6.3 Cascaded shadow maps

`CascadedShadowMaps.ts` (526 lines), `CascadeHysteresis.ts`, and `computeStableCameraFits` with `stabilize` all exist, and `Renderer.executeRendererCascadedShadowMap` runs when `cascadeCount > 1` (`Renderer.ts:1387-1398`, `1440-1510`). However:
1. The **root never sets `cascadeCount`** (`rg cascadeCount agent-api/index.ts` returns nothing), so the default is 1 and games never get CSM.
2. Cascade selection is **per draw item, using the item's bounding-box center depth** (`ForwardPass.ts:834-854`). The shader samples one `u_shadowMapMatrix`, and fragments outside that cascade's UV return 1.0 (unshadowed) (`ShaderLibraryCore.ts:499`). A ground plane spanning all cascades therefore gets one cascade and loses shadows elsewhere. This is not CSM in the industry sense, where selection is per fragment with blending.
3. `casters: [], receivers: []` are passed to the fitter (`Renderer.ts:1476-1478`), so there is no caster-aware near-plane extension.

Grade: exists / technically runs / not used by generated apps / does not compose.

### 6.4 Spot

A perspective map with `fov = 2·angle` and `far = range` (`Renderer.ts:1871-1877`). Bias `clamp(0.15/size, 5e-5, 3.5e-4)` with slope 0.12 (`agent-api/index.ts:12985-12990`). The `pbr-textured` base variant has a dedicated `a3dTexturedPbrSpotShadowFactor`. **Four** textured variants define `A3D_PBR_NO_SPOT_SHADOW` (`ShaderLibrary.ts:2067`, `2073`, `2075`): clearcoat+sheen+anisotropy, clearcoat+transmission, and specular+sheen+anisotropy+iridescence. GLBs using those extensions get no spot shadow at all.

### 6.5 Point

Six perspective faces are rendered, then **read back to the CPU** (`readShadowFacePixels`, `Renderer.ts:1915-1930`), **quantized to 8 bits** (`Math.round(depth*255)`), blitted into an RGBA8 3×2 atlas, and re-uploaded (`Renderer.ts:1540-1577`). Every frame. 256 depth levels across `[0.01, range]` with perspective non-linear depth gives severe acne or peter-panning, and the GPU→CPU sync stalls the pipeline. three.js renders point shadows straight into a cube or atlas depth target on the GPU.

### 6.6 Visibility quantified (courier-rush)

Using 3.4: lit = 1.25 + 0.64 + 0.25 = 2.14a. Fully occluded by moonlight shadow = 1.25 + 0.64·(1−0.32) + 0.25 = 1.93a. **Shadow contrast ≈ 9.8%.** After ACES, that is a barely perceptible tint. three.js with intensity-1 shadows and a 0.4 ambient (π-corrected) would show about 70% contrast.

### 6.7 Contact shadows and AO

- `effects.ambientOcclusion()` sets `ssao: { radius: round(r·8) px ∈ [1,8], intensity 0.32, bias 0.025 }` (`agent-api/index.ts:12880-12890`).
- The GLSL (`WebGL2Device.ts:3092-3128`) uses an 8-tap ring at ±radius px, compares **raw hyperbolic depth-buffer values**, uses `(center - sample - 0.025) / (0.14 + r·0.04)`, and floors the result at 0.18. Raw depth differences between adjacent surfaces in perspective are about 1e-4 to 1e-3 at mid range, well below the 0.025 bias. Occlusion therefore only fires at large silhouette discontinuities, where it darkens the *far* side, producing halos. There are no normals, no hemisphere, no world radius, no blur, and no temporal accumulation. It multiplies **total** color (direct and emissive included). three.js r185 offers `SSAOPass`, `SAOPass`, `GTAOPass` (horizon-based, normal-aware, denoised), and TSL `ao()`.
- `ContactShadows.ts` (`shadows/`) and the `contact-shadow` postprocess run `contactShadowPixels` on CPU-side pixel arrays (`Renderer.ts:1263-1264`). The root never requests them.
- Diagnostics count "contact shadows" from **node names** (`agent-api/index.ts:4485`) and flag `occlusion.contactOcclusion = true` when any node is named "footprint" (`:4487`). These are dark blob planes masquerading as a rendering feature.

---

## 7. Capability ladder

Columns: E exists · W technically works · P public API · U used by generated apps or games · D good defaults · C composes · M modern visual quality · K agents know to use it · X examples demonstrate it. Values: ✓ yes, ~ partial, ✗ no.

| Capability | E | W | P | U | D | C | M | K | X | Key evidence |
|---|---|---|---|---|---|---|---|---|---|---|
| GGX/Smith/Burley direct BRDF | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | n/a | ✓ | `ShaderChunks.ts:65-126` |
| Directional light | ✓ | ✓ | ✓ | ✓ | ~ | ✓ | ~ | ✓ | ✓ | `:3072-3081` |
| Point light falloff | ✓ | ✓ | ~ (no distance/decay) | ✓ | ✗ (range 10, clamp 1 m) | ~ | ✗ | ✗ | ~ | `:13244`, `ShaderLibraryCore.ts:735` |
| Spot light | ✓ | ✓ | ~ (decay ignored) | ~ | ~ | ~ | ~ | ~ | ~ | `:13258-13276` |
| Rect/area light | ✓ (shader) | ~ | ✓ | ~ | ✗ (root emits spot proxy) | ✗ | ✗ | ✗ | ✗ | `:13279-13301` |
| Physical units | ✗ | – | ✗ | – | – | – | – | ✗ | ✗ | no unit anywhere |
| Ambient light | ✓ | ✓ | ✓ | ✓ (24/26) | ✗ (π×, kills IBL) | ✗ | ✗ | ✗ | – | `:12701-12716` |
| Hemisphere light | ✗ (fake factor) | – | ✗ | – | – | – | – | – | – | `ShaderLibraryCore.ts:622` |
| Clustered forward | ✓ | ✓ | internal | ~ (>16 lights) | – | ✗ (disabled in 9 GLB variants) | ✗ (2D, CPU) | ✗ | ✗ | `ForwardPass.ts:251` |
| Preset IBL (`environments.*`) | ✓ | ~ | ✓ | ✗ (4/26) | ✗ (LDR, mip bug) | ✗ (ambient excluded) | ✗ | ~ | ~ | `ExternalParityRenderPreset.ts:133-169` |
| HDRI IBL | ✓ | ✓ | ✓ | ✗ (0/26) | ~ | ~ | ✗ (128 px, avg-blend, 1×1 diffuse) | ~ | ✗ | `PBRHDRPipeline.ts`, `PMREMGenerator.ts:345` |
| SH / irradiance map | ✓ (computed) | ✗ (never sampled) | ✗ | ✗ | – | – | – | – | – | `EnvironmentMapResources.ts:543` |
| BRDF LUT + multiscatter | ✓ | ✓ | internal | ~ (not in ambient path) | ✓ | ~ | ✓ | – | – | `ShaderChunks.ts:217-245` |
| Env rotation/intensity | ✓ | ✓ | ✓ | ~ | ✓ | ✓ | – | ✓ | ~ | `ShaderLibrary.ts:2602-2618` |
| EXR | ✗ | – | ✗ | – | – | – | – | – | – | `EnvironmentPlatform.ts:287-294` |
| Env background / skybox | ✓ (shader) | ? | ✗ (root) | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | `agent-api/index.ts:13586-13596` |
| Reflection probes | ✓ (capture) | ~ (no prefilter) | ✗ | ✗ | – | ✗ | ✗ | ✗ | ✗ | `ReflectionProbe.ts` |
| Light probes | ✗ | – | – | – | – | – | – | – | – | — |
| Directional shadow | ✓ | ✓ | ✓ | ✓ | ✗ (strength .32, whole-scene fit) | ~ | ✗ | ~ | ~ | `:12942-12974`, `Renderer.ts:1964` |
| PCF soft | ~ (manual grid, nearest) | ✓ | ~ | ✓ | ~ | ✓ | ✗ | – | – | `ShadowMap.ts:221` |
| VSM/PCSS | ✗ | – | – | – | – | – | – | – | – | — |
| Normal bias | ✗ | – | ✗ | – | – | – | – | – | – | — |
| CSM | ✓ | ~ | ✗ (root) | ✗ | ✗ | ✗ (per-item select) | ✗ | ✗ | ~ (`apps/shadow-cascade-evidence`) | `ForwardPass.ts:834-854` |
| Spot shadow | ✓ | ✓ | ✓ | ~ | ~ | ✗ (4 GLB variants drop it) | ~ | ~ | ✓ | `ShaderLibrary.ts:2067-2075` |
| Point shadow | ✓ | ~ (8-bit CPU) | implicit | ~ | ✗ | ✗ | ✗ | ✗ | ✗ | `Renderer.ts:1540-1577`, `1921` |
| SSAO | ✓ | ~ | ✓ | ~ (8/26) | ✗ | ✗ | ✗ | ~ | ✗ | `WebGL2Device.ts:3092-3128` |
| Contact shadows | name-count | ✗ | ✗ | "✓" by name | – | – | ✗ | ✗ | ✗ | `agent-api/index.ts:4485` |
| Specular occlusion | ✗ | – | – | – | – | – | – | – | – | `ShaderLibrary.ts:3074` |

---

## 8. Agent-authoring layer (bucket E)

- `aura3d-browser-game/SKILL.md:41`, `aura3d-core/SKILL.md:37,49`, `aura3d-assets/SKILL.md:85`, and `aura3d-character-animation/SKILL.md:58` all teach `.add(lights.studio())`, a three-directional direct-only rig with no environment.
- No skill states that `lights.ambient` disables IBL, that ambient is π× three's, that shadows default to 32% strength, or that point lights cut off at 10 m. The `aura3d-materials-environments` skill (`:37-40`) lists `environments.*` for *materials* routes, not games.
- `aura3d-threejs-migration/SKILL.md:51` maps "Lights → `lights.*`" with no unit conversion. Agents porting `new THREE.AmbientLight(0xffffff, 0.5)` get roughly 1.57 three-equivalent.
- Scene kits themselves combine ambient with direct lights and no environment (`agent-api/index.ts:10152-10156`, `10182-10186`, `10227-10229`, `10243-10245`), so generated code inherits the ambient→no-IBL trap from first-party examples.
- Showcase census (`rg -o` over `apps/showcase-*`): `lights.ambient` in 24/26, `environments.*` in 4/26 (cinematic-architecture, product-configurator, turbo-drift-circuit, siege-golf), `environments.hdri` in 0/26, `shadow: true` in 6/26 (aurora-lander, courier-rush, deep-recovery, gallery-shift, patrol-wing, siege-golf; the others still cast shadows through the priority rule), `effects.ambientOcclusion` in 8/26. Point-light-heavy scenes: pulse-tunnel 48, courier-rush ~30, gallery-shift 18, deep-recovery 15.

---

## 9. Fake parity (support that looks present but is not a production implementation)

1. **Diffuse irradiance SH9 / cosine maps** are computed and reported in diagnostics (`diffuseIrradianceModel: "sh9-cosine-convolved"`) but never sampled.
2. **`mapType: "pcf-soft"`** is a hard-coded diagnostic string (`agent-api/index.ts:4614`). The actual filter is a nearest-sampled grid.
3. **"Contact shadows" and contact-occlusion** are inferred from node names (`:4485-4487`).
4. **"SSAO"** is an 8-tap raw-depth edge darkener (`WebGL2Device.ts:3092-3128`).
5. **The preset "GGX-prefiltered" mip chain** is never read, because the sampler is non-mipmapped (`ExternalParityRenderPreset.ts:165`).
6. **CSM** has stable fits and hysteresis classes, but the root never enables it and selection is per item.
7. **Rect/softbox area lights**: the shader integrator exists, but the root emits spot proxies.
8. **Spot `decay`** is accepted in the public options and ignored.
9. **The "safe-basic" profile** says `blockedInRoot: ["production PBR parity", … "postprocess pass chain"]`, yet runs the same production renderer (`agent-api/index.ts:4249-4262`). The profile only changes labels.
10. **`ReflectionProbe`** does cube capture without prefilter, selection, or blending, and is unused.
11. **`shaders/pbr-direct.frag.glsl`** is dead source, distinct from the registered inline shader.
12. **`sourcePaint`/`materialRedPaintGate` heuristics** in the GLB shader exist to pass a specific red-paint comparison, not to implement a BRDF.

---

## 10. Recommendations (ordered by pixels-per-hour)

### P0 — fix defaults and blocking bugs (days)
1. **Make ambient additive to IBL, never exclusive.** Delete the `authored-ambient` early return (`agent-api/index.ts:12701-12716`). Always resolve an environment (default preset or HDRI) and add ambient on top. Divide ambient by π in the shader to match three (or rescale the public API and migrate call sites).
2. **Fix the env sampler.** Use `minFilter: "linear-mipmap-linear"` for every environment binding (`ExternalParityRenderPreset.ts:165`), and change `Sampler`'s default to mipmapped when a texture has more than one level. Add a pixel test: rough versus smooth sphere reflections must differ.
3. **Ship a real default HDR environment.** Make it float (RGBA16F) and at least 256 px per face, either a RoomEnvironment-style emissive-box scene rendered on the GPU or a bundled 1k CC0 HDRI. Remove the Reinhard→8-bit step for lighting data.
4. **Shadow strength defaults to 1.0.** Expose `shadow.intensity` and add a normal-offset bias in world units. Switch to hardware comparison (`sampler2DShadow` + `TEXTURE_COMPARE_MODE`, linear filter) with a 5×5 or Vogel-disk kernel.
5. **Draw the environment as background** by default when an HDRI or preset is present (with `backgroundBlurriness` and `backgroundIntensity`). Allow a separate `background` color override.

### P1 — make IBL and shadows modern (1–2 weeks)
6. **Replace the CPU PMREM with a GPU PMREM** equivalent to three's: cube from equirect at width/4, Gaussian blur chain, LOD_MIN 16 px, and a non-linear roughness→mip mapping. Remove the average-blend hack. Sample diffuse from the 16-px roughness-1 level or from SH9 (which is already computed — bind it).
7. **Camera-fit CSM with per-fragment cascade selection** (3–4 cascades, texel-snapped, blend band), enabled by default for directional lights in scenes with radius above about 20 m. Delete `selectForwardShadowMap` per-item selection.
8. **GPU point shadows** with a depth cube or a depth-texture atlas, no CPU readback, no 8-bit quantization.
9. **Lights.** Add point `distance` (0 = infinite) and `decay`, honor spot `decay`, clamp falloff at 0.01 like three, and document candela/lux. Route rect/softbox to the existing area-light integrator. Raise or remove the 16-light cap and do range culling in the loop.
10. **Real AO.** Implement GTAO or SAO with normals reconstructed from depth, a world-space radius, a bilateral blur, and application to indirect light only. Add specular occlusion (Lagarde) from AO. Remove name-based contact-shadow diagnostics, and either implement GPU contact shadows (screen-space ray march along the light direction) or drop the claim.

### P2 — hygiene
11. Delete the `sourcePaint*` / red-paint gates from `pbr-textured`, and apply the AO texture only to indirect light.
12. Delete or regenerate `shaders/pbr-direct.frag.glsl` from the registered source.
13. Add EXR (or UltraHDR) loading, and move HDRI prefiltering to the GPU or a worker.
14. Rewrite skills: games should start from `environments.*` or an HDRI plus one shadowed directional, without `lights.ambient`. Document units, falloff, and the migration factor from three.js.
15. Make diagnostics device-derived (filter type, AO algorithm) instead of hard-coded strings or name heuristics.

---

## 11. What is sound and should be kept

- The direct BRDF core (`ShaderChunks.ts:43-126`): Schlick with an f90 specular extension, GGX with a 0.045 floor, height-correlated Smith visibility, and Burley diffuse.
- Split-sum IBL with a GGX-integrated BRDF LUT plus Fdez-Agüera multi-scatter compensation (`ShaderChunks.ts:217-245`, `EnvironmentMapResources.ts:589-697`).
- The Radiance RGBE parser with RLE decoding (`PBRHDRPipeline.ts:108-135`) and RGBA16F cube upload with explicit mips (`WebGL2Device.ts:4030`).
- The per-tap slope-scaled bias formulation (`tan θ` × tap distance) in the shadow shaders. It needs a normal-offset companion, not replacement.
- The Frostbite range window on punctual lights (keep it, but make the cutoff optional).
- The device-observed shadow diagnostics (`mapRendered`/`mapSampled` from actual target allocation and binding, `agent-api/index.ts:13010-13030`). That is the right pattern; extend it to AO and IBL.
- The CSM split math and stable-fit utilities (`CascadedShadowMaps.ts`, `CascadeHysteresis.ts`). They are reusable once selection moves per fragment.
- The four-tap Gauss–Legendre rect-light integrator (`ShaderChunks.ts:165-195`) as a stopgap until LTC.
- Environment rotation handling, which is consistent for equirect and cube.
