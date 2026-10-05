# 03 — PBR, Material Fidelity and glTF Material Pipeline (forensic audit)

Branch: `aura3d-quality-rebuild/audit`. Scope: the BRDF that actually reaches pixels, material defaults, texture
handling, normal mapping, every KHR material extension, alpha, compression decoders, the glTF → runtime
material mapping, and how the 18+ showcase games actually use (or bypass) all of it. Reference for comparison:
three.js r185 (`node_modules/three` is 0.185.1 in this repo, so the comparisons below were checked against
the real source rather than recalled from memory).

Method: I read shader source strings, uniform defaults, and the mount path that `createAuraApp` actually
runs. I ignored README files, support matrices, and evidence JSON except where I'm quoting them to show a
claim is wrong. I ran no browsers or builds. The only scripts were small node GLB-header parsers over
`public/aura-assets/*.glb`.

---

## 0. Executive verdict

The core metal/rough BRDF is fine: GGX D, height-correlated Smith visibility and Schlick F, with split-sum
multiscatter on the IBL term. Shader math is not why the games look like Atari. The look comes from what
surrounds that core:

1. **Default IBL is a 128×64 LDR gradient, sampled with a non-mipmapped sampler.** Every GGX-prefiltered
   mip is therefore ignored. Rough and polished metals reflect the same sharp, featureless gradient, so
   "metal" reads as flat plastic. No showcase game uses an HDRI (0 occurrences).
2. **Tinting a model drops its textures.** `model(asset, { material: { color } })` turns off the base-color
   and metal-rough textures on every material in the GLB. It then forces roughness 0.38, metallic 0.16, and
   a self-emissive glow equal to the tint color at strength 0.28. 26 model nodes in the showcases go
   through this path. The result is single-color, softly glowing toy plastic.
3. **Textures on primitives can't tile and have no mipmaps.** The primitive texture sampler is
   `new Sampler({ maxAnisotropy })`, which defaults to `minFilter:"linear"` and `clamp-to-edge`. A tiled
   ground or wall texture either streaks or shimmers, so the games avoid textures entirely: 4 texture
   references across all showcase source, 0 normal maps.
4. **Procedural texture inputs are silently discarded.** This covers `fabric-normal`, `brushed-metal`,
   `rubber-roughness` and `plastic-micro-scratch`, which the built-in `material.fabric`, `brushedMetal`,
   `blackRubber` and `frostedGlass` presets depend on. The runtime logs "has no rasterizer; recorded only".
5. **Agents fall back on emissive.** The games use `material.emissive(...)` 418 times plus
   `material.neon(...)` 68 times, against 306 `material.pbr`. Emissive defaults to 1.35 strength and neon to
   2.8. The authoring agents compensate for weak lighting and material response by making surfaces glow.
6. **Agent-generated GLB "art builders" emit `KHR_materials_unlit`.** 16 of the 120 GLBs the showcases
   actually reference are unlit, including the hero characters for Skyline, Blockfall, Neon Swarm and
   Aurora. 56 of the 120 have no texture at all.
7. **The extension implementations are mostly fudge-factor lobes, not the glTF/three formulations.** Sheen
   is scaled by 0.012. Anisotropy uses the *clearcoat* roughness and cuts the base specular to 18%.
   Transmission has no scene-color refraction in any shipping variant; glass is a ≤58% blend at 8% energy.
   Dispersion is a fixed RGB tint. IOR never reaches the base F0. In the skinned (character) shaders,
   clearcoat and sheen lobes are not evaluated at all; they only darken the base color.
8. **Asset-specific hacks are baked into the shared shaders.** The textured PBR shader has a "source paint"
   gate that recolors and caps red base colors to `(0.98,0.12,0.075)`. The WebGPU shader has
   "productPropOrangeGate" logic that flattens normals by color, and a hard-coded light direction.
9. **Missing modern defaults that three r185 has:** geometric specular AA (`geometryRoughness`),
   direct-light multiscatter (`BRDF_GGX_Multiscatter` with the DFG LUT), clearcoat base attenuation
   `(1 - cc·Fcc)`, sheen energy compensation, real transmission render-target refraction, and an IOR-driven
   F0.

How the causes split across the buckets:
- A (renderer): the extension lobes, transmission, missing specular AA and missing direct multiscatter.
- B (defaults): the env sampler, primitive sampler, tint behavior, and emissive defaults.
- C (assets): unlit/untextured GLBs and low-res textures.
- D (game implementation): emissive everywhere, no HDRI, no textures.
- E (agent authoring): agents generate unlit GLBs and reach for glow, because nothing in the engine
  rewards real PBR inputs.

---

## 1. Which code actually renders pixels

`createAuraApp` (packages/engine/src/agent-api/index.ts:11126) mounts
`createProductionSceneRenderer` (index.ts:12523). In production mode that calls
`createProductionRuntimeSceneRenderer` (index.ts:13540). That function:

- builds GLB actors through `createTypedGLBActor` → `loadProductionGLTFRenderPipeline`
  (packages/assets/src/asset-corpus/ProductionGLTFRenderPipeline.ts:75) → `createGLTFRenderResources`
  (packages/assets/src/GLTFRenderResources.ts). Materials are `TexturedPBRMaterial`, `PBRMaterial`,
  `SkinnedLitMaterial`, `InstancedPBRMaterial`, or Unlit (GLTFRenderResources.ts:1506-1672).
- builds primitives through `createProductionPrimitiveMaterial` (index.ts:14877), producing
  `PBRMaterial` / `InstancedPBRMaterial`. An async "C1 upgrade" later swaps in a `TexturedPBRMaterial` when
  texture refs resolve (index.ts:14290-14460).
- renders through `ProductionRuntimeRenderer` → `ProductionWebGL2Renderer` → `Renderer` → `ForwardPass`,
  using `createDefaultShaderLibrary()` (packages/rendering/src/ShaderLibrary.ts:52).

Shaders that actually ship on this path (all in ShaderLibrary.ts / ShaderLibraryCore.ts / ShaderChunks.ts):

| Shader | Source | Used by |
|---|---|---|
| `aura3d/pbr` (lean scalar PBR) | ShaderLibraryCore.ts:291-784 | untextured primitives, untextured GLB materials |
| `aura3d/instanced-pbr` | ShaderLibrary.ts:100-480 | `instances.*`, instanced GLB materials |
| `aura3d/pbr-textured` + 10 define variants | ShaderLibrary.ts:2062-3238 | textured GLB materials, upgraded primitives |
| `aura3d/skinned-lit` (4- and 8-influence) | ShaderLibrary.ts:564-1058, 1090-1588 | every skinned character |
| `pbr_common` chunk | ShaderChunks.ts:32-460 | BRDF helpers for all of the above |
| WebGPU inline WGSL | WebGPUDevice.ts:3500-3780 | `backend:"webgpu"` only |

**Dead / fake shader sources (never registered on the render path):**
`packages/rendering/src/production-runtime/shaders/chunks/{brdf,ibl,pbr.frag,pbr.vert,shadows}.glsl` and
`production-runtime/shaders/wgsl/pbr.wgsl`. `pbr.frag.glsl` hard-codes `V`, `L`, the base color
`vec3(0.86,0.88,0.9)` and gamma 2.2. `ibl.glsl` returns constant colors. `pbr.wgsl` outputs
`abs(normal)`. No file references their markers (rg for `production-pbr-frag|production-brdf|production-ibl`
finds only the files themselves). The `production-runtime/materials/*.ts` files are stubs as well:
`GLTFMaterialAdapter.ts` returns `textures: {}` and `MaterialCompiler.ts` only string-concatenates
defines. These directories exist to make the architecture *look* like a three-style material compiler.

---

## 2. Core BRDF vs three.js r185

| Term | Aura3D (actual code) | three r185 (`lights_physical_pars_fragment.glsl.js`, `bsdfs.glsl.js`) | Verdict |
|---|---|---|---|
| NDF | GGX, `alpha = max(r,0.045)^2` (ShaderChunks.ts:65-72) | GGX, `alpha = r^2`, r clamped ≥0.0525 | Equivalent |
| Visibility | Height-correlated Smith (ShaderChunks.ts:74-81) | `V_GGX_SmithCorrelated` | Equivalent |
| Fresnel | Schlick; F90 = `max(specularFactor, maxF0)` (ShaderChunks.ts:48-52) | Schlick, F90 = `mix(specularIntensity,1,metalness)` | Close |
| Dielectric F0 | **`vec3(0.04)*specular*specularColor`** (ShaderChunks.ts:93). IOR ignored | `pow2((ior-1)/(ior+1)) * specularColor * specularIntensity` | **Wrong for KHR_materials_ior** |
| Diffuse | `(1-F)(1-metal)·albedo/π·Burley` (ShaderChunks.ts:123-124) | Lambert on `diffuseContribution` | Different but valid |
| Direct multiscatter | **None.** Single-scatter only (ShaderChunks.ts:97-126) | `BRDF_GGX_Multiscatter` with DFG LUT (Turquin) | **Missing**: rough metals lose 10-40% energy under direct light |
| IBL multiscatter | Fdez-Agüera split-sum when the LUT is bound (ShaderChunks.ts:217-245) | Same (`computeMultiscattering`) | Equivalent *if* a LUT is bound. Default material LUT is off (TexturedPBRMaterial.ts:460) and only arrives through ForwardPass overrides |
| Specular AA | **None.** No `dFdx(normal)` roughness widening anywhere in the PBR shaders | `geometryRoughness = max(dFdx/dFdy(nonPerturbedNormal))` added to roughness (lights_physical_fragment.glsl.js:6-11) | **Missing**: sparkling, aliasing highlights on small glossy props and silhouettes |
| Specular occlusion | AO multiplies diffuse env only (textured path); skinned path multiplies all env | `computeSpecularOcclusion` on indirect specular | Minor gap |
| AO on direct light | Textured path applies AO to direct light at up to 56%, depending on a "red paint gate" (ShaderLibrary.ts:3061-3064) | AO affects indirect only | Non-standard and asset-tuned |
| Light loop cap | 16 non-clustered lights (ShaderLibrary.ts:3145) | Compile-time light count | OK for games |
| Output | In-material Narkowicz ACES fit + sRGB encode when no postprocess (ShaderLibrary.ts:2466-2468) | Tone mapping in output pass, default NoToneMapping | Covered by another track; blending happens post-tonemap in the no-postprocess path |

Conclusion: the base lobe roughly matches three's 2019-era physical material. It's missing three's
2024-2025 additions (direct multiscatter, specular AA) and ignores IOR for F0. None of that alone would
cause the Atari look. Sections 3-7 cover what does.

---

## 3. Asset-specific hacks inside the general-purpose shaders

These are not physically based. They are tuned constants for a particular evidence asset, left in the
shader that every textured material uses.

### 3.1 "Source paint" red gate (textured PBR, WebGL2)

ShaderLibrary.ts:2905-2955:

```glsl
float sourcePaintMaterialGate = smoothstep(0.015, 0.09, u_materialEnvironmentSpecularScale)
  * smoothstep(0.18, 0.62, u_baseColor.r)
  * (1.0 - smoothstep(0.045, 0.16, max(u_baseColor.g, u_baseColor.b)));
...
vec3 sourcePaintTextureResponse = min(u_baseColor.rgb * vec3(mix(0.72,1.22,..), ...), vec3(0.98, 0.12, 0.075));
...
vec3 sourcePaintColorCap = mix(vec3(1.0), vec3(0.98, 0.12, 0.075), sourcePaintDetailGate);
texturedBase.rgb = clamp(min(sourcePaintDetailedBase, sourcePaintColorCap), vec3(0.0), vec3(1.0));
```

A textured material with a saturated red base factor gets its texture replaced by a luma-modulated red,
clamped to one specific red. Its normal map is also fed into the albedo (`sourcePaintNormalColorDetail`).
`materialRedPaintGate` (ShaderLibrary.ts:3061) separately changes how strongly AO darkens direct light.
`u_materialEnvironmentSpecularScale` defaults to 1, so the env-scale term doesn't hold the gate closed.
This looks like a tuning patch for the red concept car evidence asset (`wow-concept-car-cinema`,
`CarConceptMaterialStability.ts` in assets).

### 3.2 WebGPU "product prop" gates and fixed light

WebGPUDevice.ts:3665: `let lightDirection = normalize(vec3<f32>(0.36, 0.52, 0.78));` is the WebGPU PBR
direct key light, a constant. WebGPUDevice.ts:3675-3691: `productPropOrangeGate` and
`productPropBodyGate` recolor the albedo and **flatten the normal** toward +Y when the base color looks
orange or like a body color:
`normal = normalize(mix(normal, smoothedProductNormal, productBodyGate*0.46 + productOrangeGate*0.84))`.
The WebGPU path also has no clearcoat, sheen or anisotropy lobes (8 mentions in the file, all
uniform-packing) and uses `vec3(0.04)` F0 outside the atlas variant.

### 3.3 glTF importer heuristics that rewrite authored materials

- `usesUnbackedScalarTransmission` (GLTFRenderResources.ts:1743-1749) catches any OPAQUE material with
  `transmission.factor > 0.001`, no transmission texture and no volume, which describes most glass in real
  assets: car windows, bottles, visors. `renderPbrBaseColorFactor` (1759-1764) then **replaces the base
  color with `[0.028,0.036,0.044]`** if it is bright, `renderPbrRoughnessFactor` (1766-1769) **forces
  roughness ≥ 0.72**, and `transmissionFactor` is set to 0 (1840, 2026). Glass becomes dark, rough,
  opaque plastic.
- `usesOpaqueDoubleSidedClearcoatShell` (1751-1757) forces back-face culling on double-sided, metallic,
  clear-coated materials.
- `createDefaultGLTFMaterial` (1660-1673) substitutes grey `[0.76,0.74,0.72]` with roughness 0.85 for
  missing materials. The spec says white with roughness 1. Defensible, but it is a deviation.

---

## 4. Environment / IBL inputs as seen by materials (affects every material)

The full IBL audit belongs to another track. This section covers only what each material receives.

- With no `environment` node, or with any non-HDRI preset, `createProductionRuntimeEnvironment`
  (index.ts:12628) uses `createExternalParityEnvironmentLighting(preset)`
  (packages/rendering/src/ExternalParityRenderPreset.ts:133). That function:
  - generates a **128×64 procedural gradient** (`createExternalParityGeneratedHdrEnvironmentMapSource(preset,128,64)`, line 137);
  - tone-maps it with **Reinhard into 8-bit sRGB** (`toneMapping:"reinhard", outputColorSpace:"srgb"`, line 141-145). The
    environment is LDR, so specular reflections can never exceed 1.0 and polished surfaces never show hot highlights from the sky;
  - GGX-prefilters 5 specular levels (EnvironmentMapResources.ts:233, a real GGX importance-sampled filter);
  - **then binds them with `new Sampler({ minFilter: "linear", ... })`** (line 169). In WebGL2 a non-mipmap
    minification filter samples level_base only, so every `textureLod(..., roughness*(mips-1))` in the PBR
    shaders (e.g. ShaderLibrary.ts:2659-2660) returns the **sharp base level** at every roughness. The
    "diffuse" lookup at `lod = mipCount-1` (ShaderLibrary.ts:2643) also gets the base level. It is a point
    sample of the gradient in the normal direction, not irradiance.
- The textured shader keeps a procedural "stripes" specular term
  (`horizonStripe/sideStripe/overheadStripe`, ShaderLibrary.ts:2667-2672) that is added to the sampled
  specular. This is fake studio-softbox banding.
- Sampled specular is multiplied by an ad-hoc `mix(1.1, 0.65, roughness)` (ShaderLibrary.ts:2678).
- The HDRI path (`upgradeProductionEnvironmentHdri` → PBRHDRPipeline.ts:273,416) *does* use
  `linear-mipmap-linear` and RGBE/linear HDR. **No showcase game uses it**: `rg hdri apps/showcase-*/src`
  returns 0 matches, and `environments.*(` is used 5 times in total.

**Visual impact:** all metals, clearcoats and glossy plastics show a smooth, blurry-looking gradient with
no detail, no hot spots and no roughness variation. That's the main reason "PBR" surfaces look like
1990s Gouraud plastic even though the BRDF itself is correct.

---

## 5. Textures: color space, mips, filtering, wrap, limits

### 5.1 Color space

| Slot | glTF import (GLTFRenderResources.ts) | Upload | Shader decode | Verdict |
|---|---|---|---|---|
| baseColor | `"srgb"` (1594) | `SRGB8_ALPHA8` when `colorSpace==="srgb"` (WebGL2Device.ts:4067) | `a3dTexturedPbrDecodeSrgb` is the identity (ShaderLibrary.ts:2470), relying on hardware decode | Correct for PNG/JPG/WebP |
| emissive | `"srgb"` | SRGB8_ALPHA8 | identity | Correct |
| normal / MR / AO / clearcoat* / transmission / thickness / iridescence* / anisotropy / sheenRoughness | `"linear"` | RGBA8 | none | Correct |
| sheenColor / specularColor / diffuseTransmissionColor | `"srgb"` (1484, 1949) | SRGB8 | identity | Correct |
| **KTX2/Basis compressed** | requested "srgb", but the transcoder returns `colorSpace:"linear"` (KTX2BasisTextureTranscoder.ts:61-68) | Compressed internal formats are all non-sRGB: `0x9278` RGBA8_ETC2_EAC, `COMPRESSED_RGBA_S3TC_DXT5_EXT`, `COMPRESSED_RGBA_ASTC_4x4_KHR` (WebGL2Device.ts:4117-4133). No `SRGB8_ALPHA8_ETC2_EAC` / `SRGB_ALPHA_S3TC` / `SRGB8_ALPHA8_ASTC` | identity | **Wrong**: on GPUs that accept the compressed upload, KTX2 base color is sampled as linear and looks washed out. The RGBA8 fallback path is correct |

ETC2 is assumed available with no extension check (WebGL2Device.ts:4127-4128). On desktop the upload
fails, `readError()` catches it and the code falls back to RGBA8 (3925-3946). Every KTX2 image is
therefore transcoded twice, to ETC2 and to RGBA8 (KTX2BasisTextureTranscoder.ts:39, 57), and desktop users
get uncompressed RGBA8. three r185's KTX2Loader picks the target with `detectSupport(renderer)` and
preserves sRGB.

### 5.2 Mipmaps and anisotropic filtering

- `Sampler` defaults: `minFilter "linear"`, `clamp-to-edge`, `maxAnisotropy 1` (packages/rendering/src/Sampler.ts:26-31).
- **GLB textures:** `createSampler` (GLTFRenderResources.ts:2196-2213) uses `linear-mipmap-linear`,
  `repeat` and anisotropy 8 when the glTF has no sampler, or the authored filters when it does.
  `generateMipmap` runs for image sources (WebGL2Device.ts:3957-3958). **Correct**, and comparable to
  three, which uses anisotropy 1 by default, so Aura is better here.
- **Primitive textures (the C1 upgrade):** `const textureSampler = new Sampler({ maxAnisotropy: ... })`
  (index.ts:14379-14381). That is **`minFilter:"linear"` (no mip sampling) and `clamp-to-edge`**. Mips are
  generated but never sampled, and anisotropy without a mip chain does little. SDF text has the same issue
  (index.ts:14529).
- **Wrap is clamped, so primitives can't tile.** `u_baseColorTextureWrap = samplerWrapMode(sampler)`
  (TexturedPBRMaterial.ts:1031-1036) evaluates to clamp for that sampler. The engine API has no wrap
  option for primitive textures (rg `textureWrap|addressU|wrapS` in index.ts: none). Any
  `texTransforms.scale > 1` on a ground plane streaks the edge texels.
- **In-shader wrapping breaks derivatives.** The textured shader wraps UVs itself
  (`a3dTexturedPbrWrapCoordinate`: `fract` / mirror / clamp, ShaderLibrary.ts:2444-2457) and then calls
  plain `texture()` (e.g. 2902). On a mipmapped GLB texture with REPEAT, `fract(uv)` creates a UV
  discontinuity at every tile boundary. Implicit-derivative LOD selection then picks the smallest mip along
  that one-pixel seam, which shows up as **visible seam lines on tiled UVs** (KHR_texture_transform
  scale > 1, or UVs outside 0-1). three relies on hardware wrap and never does this. Fix: let the sampler
  wrap, or use `textureGrad` with derivatives of the unwrapped UV.

### 5.3 Size limits

There's no downscaling of GLB textures to `MAX_TEXTURE_SIZE`, and no budget. Of the 120 showcase GLBs
actually referenced, 9 carry 4096² images and 3 carry 2048² (scan of `public/aura-assets`). Uncompressed
with mips, a 4096² RGBA8 texture is about 89 MB, and the Meshy heroes ship 3 such maps
(base/normal/MR). That's a perf and OOM risk on mobile and doesn't help visuals at game camera
distances. Primitive textures get a soft "streaming budget" warning only (index.ts:13665-13672).

---

## 6. Normal mapping and tangents

- Tangent source: authored TANGENT if present, otherwise **per-vertex Lengyel accumulation over
  TEXCOORD_0** (`generateMeshTangents`, GLTFRenderResources.ts:1216-1262), with Gram-Schmidt and
  handedness from the bitangent. **Not MikkTSpace.** Normal maps baked in MikkTSpace (Blender, Substance,
  Meshy) will show seam and shading errors on generated tangents, and the "generated-tangent-uv-mismatch"
  diagnostic (608-616) only reports the TEXCOORD_1 case. three r185 uses the authored tangents or falls
  back to a **per-pixel derivative (cotangent) frame** (`getTangentFrame` in `normal_fragment_begin`),
  which is robust at seams. Aura's per-vertex accumulation is worse than three's fallback for split-UV
  meshes.
- Only 22 of the 120 used GLBs carry TANGENT. The rest use generated tangents.
- **Tangents are transformed by the normal matrix** (inverse-transpose), not the model matrix:
  `v_tangent = vec4(mat3(u_normalMatrix) * a_tangent.xyz, a_tangent.w)` (ShaderLibrary.ts:2118, 2112,
  1677, 1684; skinned 602, 1132). The fragment shader doesn't re-orthogonalize T against N
  (`a3dTexturedPbrApplyNormalSample`, 2489-2494, normalizes T and computes B = N×T). Under non-uniform
  scale the TBN skews. The games scale boxes non-uniformly all the time (e.g. courier road
  `[4.6, 0.08, 34]`, apps/showcase-courier-rush/src/city.ts:177), so normal maps on those would shade wrong.
- Normal scale is applied to XY only, glTF convention (+Y), and `gl_FrontFacing` flips for double-sided.
  All correct.
- Clearcoat normal is blended **only 26%** toward the sampled clearcoat normal
  (`mix(mappedNormal, sampledClearcoatNormal, 0.26 * weight)`, ShaderLibrary.ts:2969). The clearcoat
  *factor* is also reduced as clearcoat normal scale rises (`clearcoatNormalBoost`, 2963-2971).

---

## 7. KHR material extensions: parsed → reaches shader → correct?

Legend: P = parsed by GLTFLoader, S = reaches a shader uniform, C = matches the glTF spec / three r185.

| Extension | P | S | C | What actually happens (evidence) | three r185 |
|---|---|---|---|---|---|
| KHR_materials_emissive_strength | ✔ | ✔ | ✔ | `u_emissiveColor*u_emissiveStrength*tex` (ShaderLibrary.ts:3070) | same |
| KHR_texture_transform | ✔ | ✔ textured; partial skinned | ⚠ | Textured: per-slot offset/scale/rotation, `uv*scale → rotate(+r) → +offset` (2436-2442). Skinned: **only the baseColor transform is applied, and to all maps** (VS line 594). Rotation sign is opposite to three's `setUvTransform` (Matrix3.js:394-403 rotates by −r), so non-zero rotation needs verification against Khronos `TextureTransformTest` | per-texture transform via `uvTransform` |
| KHR_materials_unlit | ✔ | ✔ | ✔ | `UnlitMaterial` / `TexturedUnlitMaterial` (GLTFRenderResources.ts:1550-1572) | same |
| KHR_materials_ior | ✔ | refraction only | ✘ | `u_ior` drives `refract()` and the iridescence substrate F0, but **base dielectric F0 is a constant 0.04** (ShaderChunks.ts:93). The support matrix labels it "runtime-supported" (GLTFExtensionSupport.ts:57), which is false | drives F0 |
| KHR_materials_specular | ✔ | ✔ | ≈ | Scales F0 and F90; specularTexture `.a` and specularColorTexture sRGB are correct (3006-3007). Combined with fixed 0.04 F0 instead of the IOR-derived value | same, IOR-based |
| KHR_materials_clearcoat | ✔ | ✔ | ✘ approx | Textured: roughness floor **0.18-0.19** (2756, 2973, 2984), so mirror lacquer is impossible. Clearcoat normal blended at 26%. Lobe is **added without base attenuation**. Base also darkened by `layerEnergy = clearcoat*0.08` (ShaderChunks.ts:324). Env clearcoat uses `F_SchlickRoughness`. Scalar path: env clearcoat replaces base specular by `mix(sampled, clearcoatSampled, clearcoat)` (ShaderLibraryCore.ts ~l.640). **Skinned: no clearcoat lobe at all** | separate lobe, `outgoing*(1-cc·Fcc)+cc·spec`, roughness floor 0.0525 |
| KHR_materials_sheen | ✔ | ✔ | ✘ fudge | Charlie D, but direct term is `D·V·0.012 + pow(1-NdV,12)·0.18` (2765). Env term is `pow(1-NdV,8)·mix(1.4,0.75,r)` (2804-2806). No energy compensation. Skinned: none | Charlie + `IBLSheenBRDF` + `sheenEnergyComp` |
| KHR_materials_anisotropy | ✔ | ✔ | ✘ | Additive lobe on top of the isotropic one. Base direct and env specular are both **multiplied by `mix(1.0,0.18,anisotropy)`** (3081, 3208). The aniso NDF is called with **clearcoat roughness** (2766). The env lobe uses a hard-coded direction `vec3(0.42,0.78,0.46)` (2807). The scalar path uses a fixed world-XY frame and a Gaussian `*6.0` lobe (ShaderChunks.ts:425-450). Texture channel mapping (rg direction, b strength) is correct | `alphaT = mix(α,1,aniso²)` replaces the isotropic lobe, with an aniso IBL bent normal |
| KHR_materials_iridescence | ✔ | ✔ textured; fake scalar | ≈ / ✘ | Textured: two-interface Airy film per RGB wavelength (650/510/475 nm) (2697-2717), applied as an additive `(filmF - schlickF)` lobe, so it can subtract energy. Scalar primitives: **cosine palette** `0.5+0.5cos(phase+…)` (ShaderChunks.ts:329-339). Lobe call site passes `0.0` for iridescence into `a3dApplyAdvancedPbrLobes` (3031) | `evalIridescence` replaces F in `computeMultiscatteringIridescence` |
| KHR_materials_transmission | ✔ | ✔ | ✘ | **No scene-color refraction in any variant.** All 10 textured variants define `A3D_PBR_DISABLE_TRANSMISSION_BACKDROP` (2066-2075). The backdrop exists only in the base variant and is fed by `captureProof` CPU `readPixels` → CPU mips (ProductionWebGL2Renderer.ts ~100-130), not the interactive frame. Refraction samples the env map only. Final `shaded = mix(shaded, shaded*0.72 + refr, T*mix(0.08,0.58,energy))` (3138). Default energy **0.08** (TexturedPBRMaterial.ts:468). Opaque scalar-transmission GLB glass is turned into dark rough plastic (§3.3) | transmission render target of opaques with mip LOD from roughness/IOR, `getIBLVolumeRefraction` |
| KHR_materials_volume | ✔ | ✔ | ≈ | Beer-Lambert `pow(attenuationColor, thickness/distance)`, thickness `.g`, no world scale | same Beer, scaled by model matrix |
| KHR_materials_dispersion | ✔ | ✔ | ✘ | `dispersionTint = mix(1, vec3(1.04,0.98,0.94), dispersion/100*T)` (ShaderChunks.ts:319). A fixed tint | per-channel IOR spread in refraction |
| KHR_materials_diffuse_transmission | ✔ | ✔ | ✘ approx | Lerps base color toward the diffuse transmission color (ShaderChunks.ts:301). No back-lighting | (three: not core in r185 WebGL) |
| KHR_materials_pbrSpecularGlossiness | ✔ | converted | ≈ | Converted to metal/rough at load | dropped from three core |
| KHR_materials_variants | ✔ | ✘ in apps | — | `materialVariant` exists in `GLTFRenderResourceOptions` but `createTypedGLBActor` never passes it (TypedGLBActor.ts:184-191), and `model()` has no variant option. Unreachable from `createAuraApp` | `GLTFLoader` + `selectVariant` |
| KHR_texture_basisu (KTX2) | ✔ | ✔ | ✘ color | See §5.1: sRGB lost on compressed upload, double transcode, ETC2 assumed | `KTX2Loader` with sRGB formats |
| KHR_draco_mesh_compression | ✔ | ✘ in apps | — | Needs an injected decoder. `TypedGLBActor` passes none (TypedGLBActor.ts:184-191), so **any Draco GLB fails in createAuraApp**. `ensureAssetDecoders` defaults "draco/meshopt off" (AssetDecoders.ts:13) | DRACOLoader opt-in, same shape but documented |
| EXT/KHR_meshopt_compression | ✔ | ✘ in apps | — | Same: no decoder injected | `setMeshoptDecoder` |
| Alpha-to-coverage | — | ✘ | — | No `SAMPLE_ALPHA_TO_COVERAGE` anywhere (rg). MASK is a hard `discard` | `material.alphaToCoverage` |

`a3dApplyAdvancedPbrLobes` (ShaderChunks.ts:253-327) deserves its own mention. It computes
`specularLobe`, `clearcoatLobe`, `sheenLobe`, `anisotropyLobe` and `iridescenceLobe` from magic constants
(0.018, 0.46, 0.022, 0.045, 0.05, 0.18, 0.025, 0.085…). **None of them is returned.** The function returns
only `layeredBase = transmitted * dispersionTint * (1 - layerEnergy)`, so its only effect on pixels is to
darken the base by up to 28% and desaturate transmissive bases by 35%. Every extension parameter feeds it
on every PBR shader path, which makes it a darkening filter presented as a layering model.

---

## 8. Alpha, double-sided, vertex colors

- **MASK:** `u_alphaCutoff = alphaCutoff`, then `discard` (GLTFRenderResources.ts:1771-1773;
  ShaderLibrary.ts:3233). Correct. No A2C, so foliage and hair alias heavily under MSAA.
- **BLEND:** blend on, depthWrite off. "Effectively opaque BLEND" is demoted to opaque when there's no
  base texture and alpha ≥ 0.996 (1726-1735). That's a sensible fix for Sketchfab exports.
- **Double-sided:** `cullMode: "none"` plus `gl_FrontFacing` normal flip. Correct. It's overridden to
  back-face culling by the two heuristics in §3.3.
- **Vertex colors:** `a_color` multiplies the base color. The default attribute is `(1,1,1,1)` when absent
  (WebGL2Device.ts:4307-4309). COLOR_0 is treated as linear, which is correct.
- **Primitive opacity:** `blend = opacity < 0.999` with `cullMode none` for every translucent primitive
  (index.ts:14905-14909). `material.glass()` defaults to `opacity 0.24` *and* `transmission 1`
  (index.ts:2468-2483), so glass is a 24%-alpha blended surface that also receives a ≤58% fallback
  transmission mix. That's double-counted see-through, which ends up looking like thin tinted cellophane.

---

## 9. The tint path: the biggest single "toy" multiplier

index.ts:13566-13580 → `createTypedGLBActor({ tint: { baseColor, replaceSurfaceTextures: true, emissiveColor?, emissiveStrength?, roughness?, metallic?, clearcoat? } })`.
It triggers whenever `node.material?.color` is set on a model.

`applyMaterialTint` (packages/engine/src/production-runtime/TypedGLBActor.ts:484-513), applied to **every**
material in the GLB:

```ts
material.setParameter("u_baseColor", color);
if (tint.replaceSurfaceTextures) {
  material.setParameter("u_baseColorTextureEnabled", 0);
  material.setParameter("u_metallicRoughnessTextureEnabled", 0);
}
material.setParameter("u_emissiveColor", glow);          // glow = emissiveColor ?? baseColor
const emissiveStrength = tint.emissiveStrength ?? 0.28;  // self-illumination by default
material.setParameter("u_roughness", tint.roughness ?? 0.38);
material.setParameter("u_metallic",  tint.metallic  ?? 0.16);
```

Effects:
- Every sub-material (body, glass, tires, chrome, lights) gets the **same color**, roughness and metallic.
- Base-color and MR textures are disabled. The normal map stays, so a single flat color appears over bumps.
- When no `emissive` is given, the tint color is also used as emissive at 0.28, so the model glows in its
  own color. It never gets properly dark in shadow, which gives the flat "lit-from-within" look.
- `material.pbr({...})` always sets `color: "#d7dee8"` by default (index.ts:2415-2420), so **any**
  `material:` on a model (even one only meant to change roughness) triggers the full texture replacement.

Usage: the per-game counts from a small AST-ish scan of `model(...)` calls that contain `material:` are
courier-rush 3, deep-recovery 6, skyline-runner 3, siege-golf 2, data-galaxy 2,
material-asset-inspector 2, plus 1 each in aurora, gravity-post, neon-swarm, patrol-wing,
product-configurator, turbo-drift and webgpu-particle-lab, for **26 tinted model nodes**. Example:
courier traffic cars (apps/showcase-courier-rush/src/main.ts:386-398) and the pressure-gate sedan
(city.ts:700-715), where every part becomes `#e85d75` lacquer with a `#4a1024` glow.

three.js equivalent: agents doing `mesh.material.color.set()` in three.js tint *multiplicatively* over the
map and keep per-material identity. Aura's API replaces them.

---

## 10. Built-in material presets and what games use

`material.*` (index.ts:2414-2640) is the agent-facing material vocabulary. Defaults:

| Preset | Notable defaults | Problem |
|---|---|---|
| `pbr` | color `#d7dee8`, roughness 0.55 | grey default. Its color triggers texture replacement on models (§9) |
| `emissive` | color `#111827` (near-black), emissive = color | Engine applies `emissiveIntensity ?? 1.35` (index.ts:14896, 14391). A black body with glow |
| `neon` | emissiveIntensity **2.8**, color `#0a1020` | |
| `glowingEmissive` | emissiveIntensity **3.4** | |
| `metal` | roughness 0.12, metallic 1, envMapIntensity 1.45 | With the §4 LDR non-mip env it reflects a smooth gradient: chrome reads as grey plastic |
| `glass` / `clearGlass` | opacity 0.24/0.2 **and** transmission 1 | §8 double counting. No refraction |
| `fabric`, `brushedMetal`, `blackRubber`, `frostedGlass` | depend on `proceduralTexture(...)` normal/roughness maps | **Dropped at runtime**: `procedural texture … has no rasterizer; recorded only, scalar material retained` (index.ts:18262-18269, 14159) |
| `clearcoatPaint` | red `#ef233c`, clearcoatRoughness 0.018 | Textured path clamps clearcoat roughness to ≥0.18. The red default sits in the §3.1 gate's range |

Showcase usage (rg over `apps/showcase-*/src`):

| Pattern | Count |
|---|---|
| `material.emissive(` | **418** |
| `material.pbr(` | 306 |
| `material.neon(` | 68 |
| `material.metal(` | 32 |
| `material.proceduralTexture(` | 11 (all dropped) |
| `material.clearcoatPaint(` | 10 |
| `material.glass(` / `clearGlass(` | 6 / 3 |
| `material.physical(` | **0** |
| `emissiveIntensity` | 482 |
| texture/map keys (`texture:`, `map:`) | 4 |
| `normalMap` / normal asset refs | **0** |
| `hdri` | **0** |
| `environments.*(` | 5 |

Courier Rush's city.ts alone has 27 hard-coded `emissive: "#…"` strings, covering road lanes, curbs,
"reflected color" planes, rain streaks and window boxes. The games paint with emissive boxes because
textured primitives can't tile (§5.2), procedural maps are dropped (§10), and metals look dead (§4).

`packages/materials` (`GameReadyMaterialLibrary`, `PBRMaterialLibrary`) is imported by **no** showcase or
template (`rg @aura3d/materials apps/showcase-*/src templates/*/src` returns nothing).

---

## 11. Asset survey (GLBs the showcases actually reference)

I resolved every `assets.<key>` in `apps/showcase-*/src` through `src/aura-assets.ts` to
`public/aura-assets/*.glb`, which gave 120 files, and parsed their JSON chunks.

| Metric | Value |
|---|---|
| GLBs | 120 |
| GLBs with any baseColorTexture | 63 (**56 have no texture images at all**) |
| GLBs with normal maps | 32 |
| GLBs with MR texture / AO / emissive texture | 26 / 8 / 7 |
| GLBs with authored TANGENT | 22 |
| `KHR_materials_unlit` | **16** |
| clearcoat / specular / transmission / sheen / iridescence | 2 / 2 / 1 / 0 / 0 |
| Draco / meshopt / KTX2 | 0 / 0 / 0 |
| Texture resolution histogram (max per file) | 0 px ×56, 32-256 ×8, 512-1536 ×36, 1586-2048 ×7, 4096 ×9 |

The unlit GLBs are mostly **generated by the agents' own "deterministic review-art builders"**
(the glTF `asset.generator` string): auroraExtractionLanderHero, auroraExtractionBayBackdrop,
blockfallReactorMechanicHero, blockfallReactorPlasmaRival, blockfallReactorArenaBackdrop,
neonRainCourierHero, neonCrownMothElite, neonRainGardenArenaBackdrop, skylineArcticRunnerHero,
skylineIceLedge{Compact,Medium,Long}, skylineWinterParallaxBackdrop, turboAlpineVenueBackdrop. Two more come
from Sketchfab/UnityGLTF: neonCourierAvatar and showcaseRunnerGirl. These **heroes and arenas are unlit
cards or meshes with painted lighting**, and no renderer improvement will change them. This is an E/C
failure: the authoring path made "looks OK in a screenshot right now" cheaper than "lit correctly".

The texture-bearing GLBs (Meshy heroes: courierVanMeshyV2Decimated, mechHeroDecimated,
patrolAircraftMeshy, skylineHeroRunner, rooftopShooterMeshyV1, gravityPostMeshyFreight, pulseArena,
galleryThief) are single-material base+normal+MR at 2048-4096. three.js would render them well with a
real HDRI. In Aura they're limited by §4 (environment) and, when tinted, by §9.

---

## 12. Capability ladder

Rungs: Exists / Works / Public API / Used by apps / Good defaults / Composes / Modern quality /
Agents know it / Examples demonstrate it.

| Capability | Ex | Wk | API | Used | Def | Comp | Modern | Agents | Examples |
|---|---|---|---|---|---|---|---|---|---|
| GGX metal/rough base lobe | ✔ | ✔ | ✔ | ✔ | ✔ | ✔ | ≈ (no ms direct, no spec-AA) | ✔ | ✔ |
| Base-color/normal/MR textures on GLB | ✔ | ✔ | ✔ | ✔ (63 GLBs) | ✔ mips+aniso8 | ✘ (killed by tint) | ≈ (non-Mikk tangents) | ≈ | ✔ |
| Textures on primitives | ✔ | ≈ | ✔ | ✘ (4 uses) | **✘ no mips, clamp** | ✘ | ✘ | ✘ | ✘ |
| Procedural texture maps | ✔ (API) | **✘ dropped** | ✔ | 11 uses → 0 pixels | — | — | — | believed working | ✘ |
| IBL reflections (default env) | ✔ | ≈ (base mip only) | ✔ | ✔ | **✘ LDR 128×64, linear sampler** | ✔ | ✘ | ✘ | ✘ |
| HDRI IBL | ✔ | ✔ | ✔ | **✘ 0 games** | ✔ | ? | ✔ | ✘ | some wow-* apps |
| Model tint | ✔ | ✔ | ✔ | 26 nodes | **✘ replaces textures + glow** | ✘ | ✘ | used heavily | ✘ |
| Clearcoat | ✔ | ≈ | ✔ | 10 presets, 2 GLBs | ✘ roughness floor 0.18 | ✘ skinned none | ✘ | ≈ | ≈ |
| Sheen | ✔ | ✘ (×0.012) | ✔ | ~0 | — | ✘ | ✘ | ✘ | wow-sheen-grid |
| Anisotropy | ✔ | ✘ (wrong roughness, base ×0.18) | ✔ | brushedMetal | ✘ | ✘ | ✘ | ✘ | texture-anisotropy app |
| Iridescence | ✔ | ≈ textured / ✘ scalar | ✔ | 0 | — | ✘ | ✘ | ✘ | ≈ |
| Transmission/volume | ✔ | ✘ no refraction | ✔ | glass 9× | ✘ energy 0.08 + opacity 0.24 | ✘ | ✘ | ✘ | materials-transmission |
| IOR | ✔ | ✘ not in F0 | ✔ | — | — | — | ✘ | — | — |
| Dispersion | ✔ | ✘ tint | ✔ | 0 | — | — | ✘ | — | — |
| Variants | ✔ | ✔ (asset layer) | ✘ not via createAuraApp | 0 | — | — | — | — | loader-gltf-variants (direct API) |
| KTX2 | ✔ | ≈ (sRGB wrong compressed) | ✔ | 0 | ETC2 default | — | ✘ | ≈ | loader-ktx2 |
| Draco / Meshopt | ✔ | ✔ if injected | ✔ | 0 | **off; actor never injects** | ✘ | — | — | loader-compression |
| Specular AA | ✘ | — | — | — | — | — | — | — | — |
| Alpha-to-coverage | ✘ | — | — | — | — | — | — | — | — |
| Unlit | ✔ | ✔ | ✔ | **16 GLBs incl. heroes** | — | — | anti-pattern | over-used | — |

---

## 13. Fake-parity inventory (support appears to exist but doesn't generalize)

1. `production-runtime/shaders/chunks/*.glsl` and `wgsl/pbr.wgsl` are toy shaders with fixed lights, a
   fixed color and `abs(normal)`. Unregistered, but they look like the production shader set.
2. `production-runtime/materials/GLTFMaterialAdapter.ts` (`textures: {}`), `MaterialCompiler.ts`, and
   `PBRShaderFeatures.ts` (`PRODUCTION_PBR_SHADER_FEATURES` all `true`) are stubs claiming every feature.
3. `rendering/src/materials/TransmissionPass.ts`: `evaluateExternalParityTransmission` is a **CPU function
   on one RGB sample** with Reinhard. It isn't a render pass.
4. `a3dApplyAdvancedPbrLobes` computes five lobes and returns none of them (ShaderChunks.ts:253-327).
5. Transmission backdrop refraction exists only in the base textured variant, fed from `captureProof` CPU
   readback. Every interactive variant compiles it out (`A3D_PBR_DISABLE_TRANSMISSION_BACKDROP`).
6. The default environment computes GGX-prefiltered mips and then binds a non-mip sampler
   (ExternalParityRenderPreset.ts:169).
7. Procedural textures in material presets: API, docs and presets exist; the runtime discards them.
8. `GLTF_EXTENSION_SUPPORT_MATRIX` (GLTFExtensionSupport.ts:39-68) marks `KHR_materials_ior` and
   `KHR_texture_transform` "runtime-supported". IOR isn't in F0, and texture transform is base-only in
   skinned shaders. Draco/Meshopt/KTX2 are "decoder-required", but the app path never supplies a decoder.
9. `PHYSICAL_EXTENSION_MATRIX` (engine/src/material-physical/PhysicalMaterialSpec.ts:43-52) describes
   anisotropy as "aspect-ratio anisotropic-GGX… browser-proven". The proof is that rotation changes
   pixels, not that the response is correct.
10. The WebGPU PBR path has a constant light direction and product-specific color/normal gates.
11. `packages/materials` presets and probes: tested, never used by games.
12. KTX2 "supported", but compressed sRGB textures decode as linear.

---

## 14. Recommendations (ordered by pixels per unit of work)

### P0
1. **Fix the default environment.** Bind the generated env with `linear-mipmap-linear` (one line,
   ExternalParityRenderPreset.ts:169). Then generate it as **RGBA16F / RGBE HDR, not Reinhard-tonemapped
   sRGB**, at ≥256×128. Better still, ship one small HDRI (a studio and an outdoor sky, KTX2/RGBE ~200 KB)
   as the **default** environment for every `createAuraApp` scene, like three's `RoomEnvironment`
   via PMREM. Make game templates add `environments.hdri(...)` by default.
2. **Change the tint semantics.** `model(asset, { material: { color } })` should *multiply* the base factor
   and keep textures (three semantics). Require an explicit `replaceTextures: true` to flatten. Drop the
   default `emissiveStrength 0.28` self-glow (TypedGLBActor.ts:504) and the forced roughness/metallic
   (506-507). Apply overrides per sub-material, optionally by material-name match, rather than to all of
   them.
3. **Primitive texture sampler:** use `linear-mipmap-linear`, `repeat`, anisotropy 8 (index.ts:14379,
   14529). Expose `wrap` on `AuraMaterialSpec`. Remove the in-shader `fract` wrapping
   (ShaderLibrary.ts:2444-2457) or use `textureGrad`.
4. **Remove the asset-specific gates** from the shared shaders: the `sourcePaint*` and
   `materialRedPaintGate` blocks (ShaderLibrary.ts:2905-2955, 3061-3064), and WebGPU
   `productProp*Gate`, `smoothedProductNormal` and the constant `lightDirection` (WebGPUDevice.ts:3665-3691).
   Remove the glTF import rewrites `renderPbrBaseColorFactor` / `renderPbrRoughnessFactor` /
   `usesUnbackedScalarTransmission` (GLTFRenderResources.ts:1743-1769). Render glass as transmission.
5. **Rasterize procedural textures** (ProceduralTexture.ts already exists in rendering) on the
   production path, or remove them from the presets so agents stop depending on them.

### P1
6. Port three r185's `lights_physical_*` semantics into `pbr_common`: IOR-driven F0, direct
   `BRDF_GGX_Multiscatter`, `geometryRoughness` specular AA, clearcoat layering
   `(1 - cc·Fcc)`, clearcoat roughness floor 0.0525, sheen with `IBLSheenBRDF` and energy compensation,
   glTF anisotropy (`alphaT = mix(α,1,a²)`, bent-normal IBL), and iridescence-replaces-Fresnel. Delete
   `a3dApplyAdvancedPbrLobes` and all the `* 0.012`, `* 0.18`, `* 0.72` constants.
7. **Real transmission:** a per-frame opaque-scene color target with mips (three's
   `transmissionRenderTarget`), sampled with roughness/IOR LOD. Turn it on by default when any
   transmissive material is visible. Drop `opacity 0.24` from `material.glass`.
8. **One material shader:** fold skinned-lit into the textured PBR shader via defines, so characters get
   texture transforms, TEXCOORD_1, clearcoat and sheen. The current split means characters are the worst-shaded objects.
9. **Tangents:** use MikkTSpace, e.g. the `mikktspace` wasm that three's `BufferGeometryUtils` uses, or a
   per-pixel derivative TBN fallback like three's `getTangentFrame`. Transform tangents by the model
   matrix and Gram-Schmidt in the fragment shader.
10. **KTX2:** pick the target format from device caps, upload sRGB compressed formats
    (`SRGB8_ALPHA8_ETC2_EAC`, `SRGB_ALPHA_S3TC`/BC7 sRGB, `SRGB8_ALPHA8_ASTC_4x4`), and transcode once.
11. **Decoders:** `createTypedGLBActor` should lazily inject Draco/Meshopt decoders when
    `extensionsRequired` contains them. Expose `variant` on `model()`.
12. **Alpha-to-coverage** for MASK materials when MSAA is on.

### P2
13. Texture budget: downscale >2048 maps for game routes, or convert them to KTX2 at `assets add`.
14. Verify KHR_texture_transform rotation sign and S·R order against Khronos `TextureTransformTest` (Aura
    rotates by +r with scale-then-rotate, three by −r).
15. Delete the fake files listed in §13 (1-3) so audits and agents don't mistake them for the production
    implementation.

### E (agent authoring) changes that follow from the above
- Agent skills and templates should **forbid `KHR_materials_unlit` for heroes and world geometry**, and
  prefer `material.pbr` with textures over `material.emissive`. `assets validate-game` should flag
  unlit heroes, emissive-dominant scenes (e.g. more than 30% of materials emissive) and missing HDRIs.
- The in-repo "deterministic review-art builders" should emit lit PBR (base + normal + ORM), not unlit
  baked cards.
- `material.emissive` should default to `emissiveIntensity 1.0` and a non-black body color, so it stops
  being the easiest way to make something readable.

---

## 15. Key evidence index

| Claim | path:line |
|---|---|
| Fixed 0.04 F0, IOR ignored | packages/rendering/src/ShaderChunks.ts:92-95 |
| Direct BRDF single-scatter only | ShaderChunks.ts:97-126 |
| Split-sum multiscatter (IBL) | ShaderChunks.ts:217-245 |
| `a3dApplyAdvancedPbrLobes` returns only darkened base | ShaderChunks.ts:253-327 (return at 326) |
| Fake dispersion tint | ShaderChunks.ts:319 |
| Cosine-palette iridescence (scalar) | ShaderChunks.ts:329-339 |
| Textured PBR variants all disable backdrop | packages/rendering/src/ShaderLibrary.ts:2066-2075 |
| Tangent via normal matrix | ShaderLibrary.ts:2112, 2118, 602, 1132 |
| In-shader UV wrap | ShaderLibrary.ts:2444-2457, 2902 |
| sRGB decode is identity (relies on SRGB8 format) | ShaderLibrary.ts:2470-2472 |
| Procedural stripe specular | ShaderLibrary.ts:2667-2675 |
| Sheen ×0.012 fudge | ShaderLibrary.ts:2765 |
| Aniso NDF uses clearcoat roughness | ShaderLibrary.ts:2766 |
| Hard-coded env direction for aniso | ShaderLibrary.ts:2807 |
| Source-paint red gate / cap | ShaderLibrary.ts:2905-2955 |
| Clearcoat normal 26% blend / roughness floor 0.18 | ShaderLibrary.ts:2969, 2973, 2756 |
| AO on direct light gated by red | ShaderLibrary.ts:3061-3064 |
| Base specular ×0.18 under anisotropy | ShaderLibrary.ts:3081, 3208 |
| Transmission ≤58% blend | ShaderLibrary.ts:3138 |
| Skinned shaders lack extension lobes | ShaderLibrary.ts:564-1058 (no `a3dPbrExtension*` calls) |
| Default transmission energy 0.08, LUT off by default | packages/rendering/src/TexturedPBRMaterial.ts:460, 468 |
| Sampler defaults (linear, clamp, aniso 1) | packages/rendering/src/Sampler.ts:26-31 |
| Default env 128×64 Reinhard sRGB, linear sampler | packages/rendering/src/ExternalParityRenderPreset.ts:137-170 |
| Compressed formats non-sRGB; ETC2 unchecked | packages/rendering/src/WebGL2Device.ts:4117-4133 |
| KTX2 returns linear, ETC2 default, double transcode | packages/assets/src/KTX2BasisTextureTranscoder.ts:30, 39, 57-68 |
| GLB sampler defaults (good) | packages/assets/src/GLTFRenderResources.ts:2196-2213 |
| Non-Mikk tangent generation | GLTFRenderResources.ts:1216-1262 |
| Glass → dark rough opaque rewrite | GLTFRenderResources.ts:1743-1769, 1840, 2026 |
| Production pipeline passes no decoders/variant | packages/engine/src/production-runtime/TypedGLBActor.ts:184-191 |
| Tint replaces textures + adds glow | TypedGLBActor.ts:484-513; packages/engine/src/agent-api/index.ts:13566-13580 |
| Primitive texture sampler (no mips, clamp) | index.ts:14379-14381, 14529 |
| Primitive defaults (rough 0.58, emissive 1.35) | index.ts:14877-14940 |
| Procedural textures dropped | index.ts:14040-14104, 18262-18269 |
| Material preset defaults | index.ts:2414-2640 |
| WebGPU fixed light + product gates | packages/rendering/src/WebGPUDevice.ts:3665-3691 |
| Dead production shader chunks | packages/rendering/src/production-runtime/shaders/chunks/*.glsl, wgsl/pbr.wgsl |
| CPU "TransmissionPass" | packages/rendering/src/materials/TransmissionPass.ts:19-44 |
| three r185 specular AA | node_modules/three/src/renderers/shaders/ShaderChunk/lights_physical_fragment.glsl.js:6-11 |
| three r185 direct multiscatter | lights_physical_pars_fragment.glsl.js:423-460 |
| three r185 IOR F0 | lights_physical_fragment.glsl.js:45 |
| three r185 clearcoat layering | node_modules/three/src/renderers/shaders/ShaderLib/meshphysical.glsl.js:210-212 |
