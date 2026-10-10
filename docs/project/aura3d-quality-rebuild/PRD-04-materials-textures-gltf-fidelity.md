# PRD 04: Materials, Textures and glTF Fidelity

Program: Aura3D visual-quality autopsy and rebuild (branch `aura3d-quality-rebuild/audit`).
Status: Draft for implementation, revised for contracts-first parallel execution (2026-10-05, HEAD `85aafcd0`).
Lane: PRD 04. Flag: `A3D_QR_MATERIALS` (sub-flags `A3D_QR_MATERIALS_TRANSMISSION`, `A3D_QR_MATERIALS_KTX2`).
Contracts provided: C-03 (MaterialFeature lobe registry), C-15 (material spec additions + model material overrides).
Contracts consumed: C-01, C-02, C-04, C-05, C-09, C-11, C-12, C-16, C-18, C-27, C-28, C-29, C-30, C-31, C-32, C-33, C-36,
C-37, C-38, C-39, C-40 (§12). `CONTRACTS.md` is authoritative: where this PRD and `CONTRACTS.md` disagree on a
signature, owner or flag, `CONTRACTS.md` wins and this PRD is wrong. This lane never waits on another lane (§12.2).
Reference implementation: three.js r185 (`node_modules/three` 0.185.1 is installed in this repo; port
semantics from `src/renderers/shaders/ShaderChunk/lights_physical_pars_fragment.glsl.js`,
`lights_physical_fragment.glsl.js`, `bsdfs.glsl.js`, `ShaderLib/meshphysical.glsl.js`,
`transmission_pars_fragment.glsl.js`, `transmission_fragment.glsl.js`, `iridescence_fragment.glsl.js`,
`envmap_physical_pars_fragment.glsl.js` (anisotropic bent normal), `alphatest_fragment.glsl.js` (A2C),
`aomap_fragment.glsl.js` (specular occlusion), `src/renderers/shaders/DFGLUTData.js` (16×16 RG16F DFG LUT),
`src/math/Matrix3.js` (`setUvTransform`), `examples/jsm/loaders/KTX2Loader.js`,
`examples/jsm/libs/mikktspace.module.js`, `examples/jsm/libs/{basis,draco}/`, `examples/jsm/libs/meshopt_decoder.module.js`).
Every formula quoted below as "r185" was re-checked against those files on this branch; where this PRD
deliberately deviates from r185 it says so and names the reason.

Gate: this PRD is not complete when tests pass, routes return 200, screenshots are non-blank, a conformance
suite is green, or a parity matrix is green. Merging is gated by **standalone acceptance** (§16.1), which this lane
can pass alone. Completion is gated by **integrated acceptance** (§16.2, §16.3): the material benchmark scenes and the
listed games, judged against three r185 at a G-PANEL integration checkpoint (CONTRACTS §7; 2 humans + 1 vision
model, median of record). Aura3D is not Three.js-quality today (research/23 vision judgment: Aura mean 3.6 vs three r185 mean 5.4 across 18 same-input scenes, no scene equivalent).
Nothing in this document, and no standalone gate, may be cited as evidence that it is until a G-PANEL round meets
the integrated thresholds.

---

## 1. Problem statement

Aura3D's base GGX metal/rough lobe is roughly equivalent to three's (research/03 §2). Materials look
generations behind for other reasons. The material layer around that lobe is a mix of fudge factors,
asset-specific patches and silently dropped inputs, so authored glTF data and agent-authored
materials do not reach pixels as authored:

1. **The public tint destroys assets.** `model(asset, { material: { color } })` disables the base-color
   and metal-rough textures on every material in the GLB, and when no emissive is given it adds a
   self-glow equal to the tint at strength 0.28. `material.pbr()` always injects `color: "#d7dee8"`,
   so any material spec on a model triggers this. Verified in research/19 C3. Vision judgment: "clay
   mannequins" and "single-colour toy plastic" (research/21, Aura Clash, Courier Rush, Deep Recovery).
2. **Every KHR physical extension renders wrong.** All of these are confirmed by the same-scene
   benchmark (research/23):
   - Clearcoat has a 0.18–0.19 roughness floor and a milky, non-Fresnel veil: 04-clearcoat scored Aura 4.5 vs three 6.5.
   - Transmission comes out black because there is no scene-color refraction in any interactive variant: 05-transmission, Aura 3 vs 6.
   - Sheen is scaled ×0.012 and has no IBL term: 07-sheen-fabric, Aura 3 vs 6. Pass-1 scored it 3.5 vs 8 (research/22).
   - Anisotropy uses the clearcoat roughness and cuts the base specular to 18%.
   - IOR never reaches F0, and dispersion is a fixed RGB tint.
   - In skinned shaders, clearcoat and sheen aren't evaluated at all.
3. **Primitive textures can't tile or mip.** The sampler is linear, clamp-to-edge and non-mipmapped
   (`index.ts:14379`). As a result games avoid textures: 4 texture references and 0 normal maps
   across all showcase source (research/03 §10). Instead they paint with emissive: 418 `material.emissive`
   calls and 482 `emissiveIntensity` keys.
4. **Procedural material inputs are dropped.** The `fabric`, `brushedMetal`, `blackRubber` and
   `frostedGlass` presets each rely on a procedural texture that the runtime discards with "has no
   rasterizer; recorded only" (`index.ts:14163`, `18268`).
5. **Asset-specific hacks are compiled into the shared shaders.** These include:
   - The "source paint" red gate (`ShaderLibrary.ts:2905-2955`) and the red-gated AO on direct light.
   - Khronos Duck hue gates, a fixed light direction and a magic `2.25` in the WebGPU PBR shader
     (`WebGPUDevice.ts:3555-3588, 3665, 3765`; research/07 §1).
   - A glTF import rewrite that turns scalar-transmission glass into dark rough plastic
     (`GLTFRenderResources.ts:1743-1769`).
6. **Pipeline correctness gaps:**
   - Tangents are not MikkTSpace and are transformed by the normal matrix.
   - KTX2 base color is decoded as linear on compressed upload and transcoded twice. The transcoder
     loads from unpkg at runtime.
   - Draco and Meshopt are unreachable from `model()`, and so are `KHR_materials_variants`.
   - There is no alpha-to-coverage.
   - All 10 textured-PBR variants disable clustered lighting, so lights 17 and up are silently
     dropped on every extension material (research/18, which names Gallery Shift with ~31 lights and
     Courier with ~20).

The rebuild goal is that a glTF asset authored in Blender or Substance, or exported by Meshy, renders
in `createAuraApp` with the same material response three r185 gives it under the same lighting. It
must also be impossible for an agent to destroy that response through the default material API.

---

## 2. Evidence from current code

Every line below was read on this branch unless it is marked `[r03]`, which means it is cited from
research/03 and spot-checked against the surrounding code. Review pass (2026-10-05) re-read E1–E5, E8–E17,
E20–E22, E24, E29–E32 at the cited lines; E4, E9, E29 and E32 were corrected. Second review pass (2026-10-05, HEAD
`85aafcd0`, parallelization revision) re-read E1, E2, E3, E4, E5, E8, E9, E10, E12, E14, E15, E18, E20, E21, E22,
E23, E24, E27, E29, E30, E32 and the new rows E37–E41; corrections: E2 (the `emissive = baseColor` fallback is
`:479`, not `:478`), E4 (`collectFighterFlashMaterials` starts at `:3371`), E32 (the `:14391` fallback also fires on
`emissiveTexture`), and §14's former "add `mirrored-repeat`" task, which was wrong (E37). Line numbers drift: every
task in §14 names the symbol as well as the line, and the symbol wins if they disagree.

| # | Defect | Location | Observed code |
|---|---|---|---|
| E1 | Tint is hard-wired to replace textures | `packages/engine/src/agent-api/index.ts:13567-13580` | `...(node.material?.color ? { tint: { baseColor, replaceSurfaceTextures: true, ...` (no opt-out) |
| E2 | Tint disables maps and adds glow on every material | `packages/engine/src/production-runtime/TypedGLBActor.ts:478-515` (`tintTypedGLBActorMaterials` :478, `applyMaterialTint` :485) | `u_baseColorTextureEnabled=0`, `u_metallicRoughnessTextureEnabled=0`, `emissiveStrength ?? 0.28`, `roughness ?? 0.38`, `metallic ?? 0.16`; `emissive = tint.emissiveColor ?? baseColor` (:479); `/joint/i` name special case (:490) |
| E3 | `material.pbr` always sets a color | `index.ts:2415-2420` | `color: "#d7dee8"` before `...options` |
| E4 | Route-local raw-uniform material pokes | `apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts:3371-3415` (setup, `collectFighterFlashMaterials` :3371, `u_environmentIntensity 1.16` :3400), `3441-3473` (hit-flash pulse/restore, `+flashAmount*1.1` :3464) | `material.setParameter("u_baseColor", ...)`, `u_roughness`, `u_specularFactor`, `u_environmentIntensity 1.16` keyed off material-name substrings (`ranger` → outfit, `regular`/`superhero` → skin, `hair`); the flash adds `+flashAmount*1.1` env intensity and `+1.6` emissive strength |
| E5 | Primitive texture sampler: no mips, clamp | `index.ts:14379-14381`; SDF text `index.ts:14529`; defaults `packages/rendering/src/Sampler.ts:27-31` | `new Sampler({ maxAnisotropy })` → `minFilter "linear"`, `addressU/V "clamp-to-edge"` |
| E6 | In-shader UV wrap breaks derivatives | `packages/rendering/src/ShaderLibrary.ts:2444-2457` | `a3dTexturedPbrWrapCoordinate` (`fract`/mirror/clamp), then plain `texture()` |
| E7 | Procedural texture inputs dropped | `index.ts:14040-14104`, `14163`, `18268`; kinds `index.ts:926-930` | agent kinds `fabric-normal`, `rubber-roughness`, `brushed-metal-anisotropy`, `plastic-micro-scratch` have no generator. `packages/rendering/src/ProceduralTexture.ts:3-15` has 12 unrelated fixture kinds |
| E8 | All 10 textured variants compile out backdrop transmission and clustered lights | `ShaderLibrary.ts:2066-2075` | each variant defines `A3D_PBR_DISABLE_TRANSMISSION_BACKDROP: true, A3D_PBR_DISABLE_CLUSTERED_LIGHTING: true` |
| E9 | 16-light cap in extension variants | `ShaderLibrary.ts:3144-3146`; `packages/rendering/src/LightUniforms.ts:4` | `#else int count = min(int(u_lightCount), 16);`; `MAX_DIRECT_LIGHTS = 16`. The clustered branch itself caps at 64 lights per cluster (`min(..., 64)`, `:3143`); `ForwardPass.ts:251` only builds clusters when `lights.length > 16` |
| E10 | Clearcoat roughness floor; coat-roughness texture variation erased | `ShaderLibrary.ts:2973, 2995, 2997, 2756, 2798` | `max(clamp(u_clearcoatRoughnessFactor,0,1), 0.18)`. The texture **is** sampled (`.g`, 2995), then floored again: `max(clearcoatRoughness, 0.19 + (1.0 - clearcoatNormalBoost) * 0.12)` (2997). Low-roughness stripes in ClearCoatTest row 3 collapse to the floor, which is the "no stripes" result in research/23 04 #3 |
| E11 | Clearcoat normal blended at 26%; coat factor reduced by normal scale | `ShaderLibrary.ts:2964, 2969-2970` | `mix(mappedNormal, sampledClearcoatNormal, 0.26 * weight)`; `clearcoatNormalBoost` |
| E12 | Sheen fudge | `ShaderLibrary.ts:2765, 2804` | `sheenDistribution * sheenVisibility * 0.012 + sheenGrazing * 0.18`; env `mix(1.4, 0.75, r)` |
| E13 | Anisotropy suppresses base specular | `ShaderLibrary.ts:3208-3209` (direct), `3081` (env) `[r03]` | `a3dPbrDirectLight(...) * mix(1.0, 0.18, anisotropy)` |
| E14 | Transmission is a ≤58% blend at 8% energy | `ShaderLibrary.ts:3138`; `packages/rendering/src/TexturedPBRMaterial.ts:468` `[r03]` | `mix(shaded, shaded*0.72 + refr, T * mix(0.08, 0.58, energy))` |
| E15 | Fixed dielectric F0 (IOR ignored) | `packages/rendering/src/ShaderChunks.ts:92-95` | `vec3 dielectricF0 = vec3(0.04) * specular * specularColor;` |
| E16 | "Advanced lobes" darkening filter | `ShaderChunks.ts:253-327` | computes 5 lobes and returns `transmitted * dispersionTint * (1 - layerEnergy)`, where `layerEnergy ≤ 0.28` |
| E17 | Fake dispersion | `ShaderChunks.ts:319` | `mix(vec3(1), vec3(1.04,0.98,0.94), dispersion/100*T)` |
| E18 | Source-paint red gate | `ShaderLibrary.ts:2905-2955`; direct term `3203` | caps the albedo to `vec3(0.98,0.12,0.075)` and feeds normal-map XY into the albedo |
| E19 | Procedural "stripe" env spec plus ad-hoc scale | `ShaderLibrary.ts:2655-2661` (textured), `379-383`, `972-976`, `1502-1506` | `horizonStripe * 0.18` / `* 0.42`, plus `roughEnvironmentFloor = mix(0.012, 0.16, r)` |
| E20 | WebGPU Duck gates, fixed light | `packages/rendering/src/WebGPUDevice.ts:3567-3588, 3665, 3675`; uniform slot `2234` | `productPropOrangeGate`, `normalize(vec3<f32>(0.36,0.52,0.78))` |
| E21 | Duck route clamps every material | `apps/wow-webgpu-product-viewer/src/main.ts:51-66` | roughness ≥0.88, metallic ≤0.04, env-spec 0.08, `u_productColorSmoothing 1`, transmission off |
| E22 | Glass import rewrite | `packages/assets/src/GLTFRenderResources.ts:1743-1769` (+ `1840`, `2026` `[r03]`) | opaque scalar transmission → base `[0.028,0.036,0.044]`, roughness ≥0.72, transmission 0 |
| E23 | Clearcoat shell culling override | `GLTFRenderResources.ts:1751-1757` | double-sided + metallic + clearcoat → back-face cull |
| E24 | Non-MikkTSpace tangents | `GLTFRenderResources.ts:1216-1262` `[r03]` | per-vertex Lengyel accumulation over TEXCOORD_0 |
| E25 | Tangent transformed by the normal matrix | `ShaderLibrary.ts:2112, 2118, 602, 1132` `[r03]` | `v_tangent = vec4(mat3(u_normalMatrix) * a_tangent.xyz, a_tangent.w)` |
| E26 | Skinned shaders: base-only texture transform, no coat/sheen lobes | `ShaderLibrary.ts:564-1058, 1090-1588`; VS `594` `[r03]` | — |
| E27 | KTX2 tagged linear, ETC2 default, double transcode | `packages/assets/src/KTX2BasisTextureTranscoder.ts:30, 46-68`; CDN `:22` `[r11]` | `targetFormat ?? "etc2-rgba8unorm"`, `colorSpace: "linear"`, fallback RGBA8 always transcoded |
| E28 | Compressed formats non-sRGB, ETC2 unchecked | `packages/rendering/src/WebGL2Device.ts:4117-4133`, `3925-3946` `[r03]` | no `SRGB8_ALPHA8_ETC2_EAC` / `SRGB_ALPHA_S3TC` / `SRGB8_ALPHA8_ASTC_4x4` / BC7 sRGB |
| E29 | Decoders and variants never passed | `TypedGLBActor.ts:183-191` | `loadProductionGLTFRenderPipeline({ url, assetId, assetName, width, height, ...deduplicateIdenticalMaterials })`: no decoder or `materialVariant` field is ever passed |
| E30 | `model()` has no variant option | `index.ts:1235-1257` (`AuraModelOptions`), `2098-2123` | — |
| E31 | Glass preset double-counts see-through | `index.ts:2468-2483` | `opacity 0.24` **and** `transmission 1`, `envMapIntensity 1.85` |
| E32 | Emissive defaults | `index.ts:2443-2450`, `2494-2500`; engine fallback at **three** sites: `index.ts:14391` (textured C1 path; also fires when only an `emissiveTexture` is present), `14896` and `14912` (`createProductionPrimitiveMaterial`, :14877) | `emissive` body `#111827` and no `emissiveIntensity`, so the effective strength is the engine fallback `emissiveIntensity ?? (emissive ? 1.35 : 0)`; `neon` 2.8 |
| E33 | No alpha-to-coverage | repo-wide `rg SAMPLE_ALPHA_TO_COVERAGE` returns 0 `[r03]` | MASK uses hard `discard` |
| E34 | Fake-parity stubs that look like a material compiler | `packages/rendering/src/production-runtime/shaders/chunks/*.glsl`, `wgsl/pbr.wgsl`, `production-runtime/materials/{GLTFMaterialAdapter,MaterialCompiler,PBRShaderFeatures}.ts`, `packages/rendering/src/materials/TransmissionPass.ts:19-44`, `packages/assets/src/loaders/KTX2Loader.ts:3-6` `[r03, r11]` | unregistered / CPU single-sample / diagnostic-only |
| E35 | Support matrix overclaims | `packages/assets/src/GLTFExtensionSupport.ts:39-68`; `packages/engine/src/material-physical/PhysicalMaterialSpec.ts:43-52` `[r03]` | `KHR_materials_ior` "runtime-supported" |
| E36 | No texture size clamp; 4096² Meshy maps | research/03 §5.3, research/11 §1 | 9 of 120 referenced GLBs carry 4096² images; ≈200 MB VRAM per Meshy hero |
| E37 | `mirror-repeat` already exists; the earlier "add `mirrored-repeat`" task was wrong | `packages/rendering/src/Sampler.ts:9`; `WebGL2Device.ts:4157-4159` | `TextureAddressMode = "clamp-to-edge" \| "repeat" \| "mirror-repeat"`; `addressMode()` maps it to `MIRRORED_REPEAT` |
| E38 | Legacy in-shader wrap has no passthrough code, so a hardware `repeat` sampler alone cannot remove tile seams on the legacy textured shader | `ShaderLibrary.ts:2444-2451`; wrap uniforms from `TexturedPBRMaterial.ts:1031-1036` (`samplerWrapMode`) | modes: `>1.5` mirror via `mod`, `>0.5` `fract`, else `clamp(0,1)`. `fract` breaks derivatives at tile edges (mip seam) |
| E39 | WGSL Duck gates are driven only by the Duck route | `apps/wow-webgpu-product-viewer/src/main.ts:59` is the only writer of `u_productColorSmoothing` (repo `rg`); `WebGPUDevice.ts:2234` packs it into `data[170]` = `u_draw.materialFlags.z`, read by the gates at `:3675-3678` | deleting the route write sets the gate strength to 0 (`clamp(strength,0,1)` factor, `:3559`); the fixed light (`:3665`) and `2.25` (`:3765`) remain until the WebGPU owner deletes them |
| E40 | `model()` does not forward any new option | `index.ts:2098-2123` | the builder copies a fixed field list (`material`, `castShadow`, …, `wrinkle`); `materialOverrides` / `variant` would be dropped even once `AuraModelOptions` declares them |
| E41 | Emissive fallback and primitive default live in a region PRD 04 does not own | `index.ts:14877` `createProductionPrimitiveMaterial` (after the `compiler/primitives.ts` carve 14013-14755, so it stays in `index.ts`, owner PRD 15) | fallbacks at `:14896`, `:14912` |

Owners of the cited locations (CONTRACTS §4.1/§4.2): PRD 04 owns `TypedGLBActor.ts`, `GLTFRenderResources.ts` (except the
`gltf/ImageDecode.ts` carve, PRD 05), `Sampler.ts`, `TexturedPBRMaterial.ts` and the other material classes,
`production-runtime/materials/`, `materials/TransmissionPass.ts`, `material-physical/`, `GLTFExtensionSupport.ts`,
`apps/wow-webgpu-product-viewer/`, and the carved `index.ts` regions `nodes/material.ts` (2414-2724),
`compiler/modelMaterials.ts` (13560-13580) and `compiler/textures.ts` (14040-14104, 14163, 14290-14460, 14529).
Everything else cited above is owned by another lane and is changed only through a contract seam or a request (§12.3):
`ShaderLibrary.ts`/`ShaderLibraryCore.ts`/`ShaderChunks.ts`/`ForwardPass.ts`/`WebGL2Device.ts`/`BRDFLut.ts`/`production-runtime/shaders/chunks/` (01, legacy frozen),
`LightUniforms.ts`/`ClusteredForwardLighting.ts`/`ExternalParityRenderPreset.ts`/`webgl2/Samplers.ts` (02),
`KTX2BasisTextureTranscoder.ts`/`GLTFCompressionDecoders.ts`/`loaders/KTX2Loader.ts`/`webgl2/TextureFormats.ts`/`gltf/ImageDecode.ts` (05),
`webgl2/TextureUpload.ts` (06), `WebGPUDevice.ts`/`production-runtime/shaders/wgsl/pbr.wgsl` (11),
`index.ts:18253-18293` (13), every `apps/showcase-*` and `apps/aura-clash-showcase` file (14), and the rest of `index.ts` (15).

Benchmark and vision evidence (authoritative for visuals):

| Scene | Aura | three | Classification | Material defects named | Source |
|---|---|---|---|---|---|
| 02-pbr-product | 3.5 | 6 | implementation-bug | plinth translucent/ragged; clipped chrome; noisy wood specular (no spec-AA) | research/23 §02 |
| 03-damaged-helmet | 6.5 | 7 | minor deficiency | visor lobe over-blurred; metal flat/over-bright | research/23 §03 |
| 04-clearcoat | 4.5 | 6.5 | implementation-bug | coat roughness texture has no visible effect; milky veil; darker base | research/23 §04 |
| 05-transmission | 3 | 6 | implementation-bug | transmissive bowl renders opaque black | research/23 §05 |
| 06-metal-roughness-sweep | 4 | 7 | major deficiency | blocky mid-roughness (IBL, PRD 02); rim persists at r=1; aliasing | research/23 §06 |
| 07-sheen-fabric | 3 | 6 | implementation-bug | sheen nearly absent; sheenRoughness no effect | research/23 §07 |

Game evidence (research/21 vision judgment): Aura Clash texture_quality 4 ("character textures are
erased by flat tint overrides"); Aurora Lander texture 1.5, material 2.5; Bank Shot texture 2,
material 3; Gallery Shift texture 2, material 3 ("gold reads as yellow plastic"); Deep Recovery
texture 1 ("flat tint plus one dithered ring texture"); Gravity Post material 2. Asset-side causes
(unlit 4-tri cards, untextured script meshes, regex texture waiver) are confirmed in research/19 C19
and are owned by PRD 05 / PRD 13, not this PRD.

---

## 3. Root cause

1. **Evidence-driven tuning instead of reference semantics.** Constants such as `0.012`, `0.18`,
   `0.26`, `0.72` and `vec3(0.98,0.12,0.075)` were tuned until a specific evidence asset (the red
   concept car, the Duck, the product prop) matched a capture. They were never derived from the glTF
   spec or the three r185 formulas (research/01 epoch notes; research/03 §3). Nothing compared a
   *different* asset against a reference renderer, so per-asset tuning looked like progress.
2. **The variant system is hand-enumerated.** Because the uber-shader has exactly 10 named
   `#define` combinations (`ShaderLibrary.ts:2066-2075`), each new feature had to be wedged into
   them. Expensive paths (backdrop, clustered lights) were disabled wholesale to stay under compile
   and uniform limits. This produced the 16-light cap and the black-glass result.
3. **The public API is designed for legibility, not authoring.** `model({material:{color}})` was
   built to make a model *read* as a colour in a screenshot (flat albedo plus glow). The API does
   not distinguish "tint" from "replace", and no default rewarded keeping textures.
4. **Silent degradation.** Procedural textures, decoders, variants and clustered lights on extension
   materials all degrade with a warning string or nothing at all. They don't fail, so neither agents
   nor gates notice.
5. **Two shader families.** Skinned characters use a separate shader (`ShaderLibrary.ts:564-1588`)
   that never received the extension work, so the most important on-screen objects (heroes) are the
   least correctly shaded.

---

## 4. Affected packages

Ownership follows CONTRACTS §4. "Own" = PRD 04 is the single writer. "Seam" = PRD 04 contributes through a contract
registry or hook without editing the host file. "Request" = PRD 04 asks the owner (§12.3) and never waits.

- `@aura3d/rendering`: own material classes, `materials/`, `shaders/{physical,physical-wgsl}/`, `Sampler.ts`,
  `TransmissionRenderTarget.ts`, `forward/Transmission.ts`, `textures/TextureBudget.ts`, `ProceduralMaterialTextures.ts`,
  `production-runtime/materials/`, `IBL.ts`, `NormalMappedPBRMaterial.ts`. Seam into the program generator (C-02/C-03),
  frame graph (C-01), render state (C-04), texture upload (`applyTextureBudget`, §3.4). Request for legacy shaders,
  `BRDFLut.ts`, `ForwardPass.ts`, `WebGL2Device.ts` (01) and `WebGPUDevice.ts` (11).
- `@aura3d/assets`: own `GLTFRenderResources.ts`, `GLTFExtensionSupport.ts`, `MikkTSpaceTangents.ts`,
  `asset-corpus/ProductionGLTFRenderPipeline.ts`. Consume C-16 for KTX2 targets, transcoding and decoders (PRD 05 owns
  `KTX2*`, `GLTFCompressionDecoders.ts`, `vendor/`, `loaders/`, `gltf/ImageDecode.ts`).
- `@aura3d/engine`: own `production-runtime/{TypedGLBActor,ModelMaterialOverrides}.ts`, `production-runtime/actor/`
  (default; not `extensions.ts` (15), `TypedGLBActorAnimation.ts` (06), `TypedGLBActorLod.ts` (05)), `material-physical/`,
  `agent-api/compiler/{modelMaterials,textures}.ts`, `agent-api/nodes/material.ts`. Seam: C-15 types pre-declared in
  `index.ts` by PR 0a; C-31 `materials` diagnostics section; C-37 `materials` node-handle member; C-38 renderer options.
- `@aura3d/aura3d-cli`: own `src/commands/prd04/` only (C-39 codemod and command registration).
- `@aura3d/materials` (owner 15): not touched. Its fate is PRD 15's decision (§24).
- Apps: own `apps/wow-webgpu-product-viewer/`. Showcase games and Aura Clash are PRD 14's; other `apps/` defaults are 15's.
- Benchmarks: own `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd04/`. The shared harness is PRD 12's.

---

## 5. Affected files and directories

### 5.1 Owned by PRD 04 (modify)

| File | Change |
|---|---|
| `packages/engine/src/production-runtime/TypedGLBActor.ts` | authored snapshot, `setMaterialOverrides`, variants, C-16 decoder injection, deprecated `setTint` wrapper (edits start after PR 0b-3 merges, ≤ day 2) |
| `packages/engine/src/agent-api/compiler/modelMaterials.ts` (carve of `index.ts:13560-13580`, `applyModelTintBridge`) | flag-gated override lowering |
| `packages/engine/src/agent-api/compiler/textures.ts` (carve of `index.ts:14040-14104, 14163, 14290-14460, 14529`) | trilinear repeat samplers, tier anisotropy, procedural generators, `:14391` emissive fallback, SDF sampler |
| `packages/engine/src/agent-api/nodes/material.ts` (carve of `index.ts:2414-2724`) | preset-default marker (R15) |
| `packages/engine/src/material-physical/PhysicalMaterialSpec.ts` | `PHYSICAL_EXTENSION_MATRIX` generated |
| `packages/rendering/src/Sampler.ts` | `Sampler.trilinear`, `Sampler.fromGLTF`, tier input to `resolveSamplerAnisotropy` |
| `packages/rendering/src/{TexturedPBRMaterial,PBRMaterial,InstancedPBRMaterial,SkinnedLitMaterial,NormalMappedPBRMaterial}.ts` | implement C-03 `ProgramFeatureSource.programFeatures()`; legacy uniforms unchanged with the flag off |
| `packages/rendering/src/production-runtime/materials/{GLTFMaterialAdapter,MaterialCompiler,PBRShaderFeatures}.ts` | E34 stubs: delete, or thin re-exports of `materials/PhysicalMaterial.ts` |
| `packages/rendering/src/materials/TransmissionPass.ts` | E34: move the CPU function to `tests/qr/prd04/oracles/`, delete the module |
| `packages/assets/src/GLTFRenderResources.ts` | spec-exact import (E22 flag+path gated, E23, default material), colour-space intent per image, tangents option, anisotropy, `materialVariant` pass-through (:1141 already resolves variants) |
| `packages/assets/src/GLTFExtensionSupport.ts` | generated (CONTRACTS §4.3) |
| `packages/assets/src/asset-corpus/ProductionGLTFRenderPipeline.ts` (`loadProductionGLTFRenderPipeline` :75) | `decoders`, `materialVariant`, `textureBudget`, `tangents` pass-through |
| `apps/wow-webgpu-product-viewer/src/main.ts:51-67` | delete the material clamp loop (E21, E39) |
| `fixtures/asset-corpus/` | new Khronos fixtures (§14 P1-9) |

### 5.2 Owned by PRD 04 (add)

- `packages/rendering/src/shaders/physical/`: `bsdf_lobes_common.glsl.ts`, `specular_ior.glsl.ts`, `clearcoat.glsl.ts`,
  `sheen.glsl.ts`, `iridescence.glsl.ts`, `anisotropy.glsl.ts`, `transmission.glsl.ts`, `volume.glsl.ts`,
  `dispersion.glsl.ts`, `emissive_strength.glsl.ts`, `unlit.glsl.ts`, `tangent_frame.glsl.ts`, `uv_transform.glsl.ts`,
  `alpha_a2c.glsl.ts`, `debug_view.glsl.ts`, `index.ts` (registers chunks via C-02 `registerShaderChunk`, names
  `a3d_prd04_<name>`).
- `packages/rendering/src/shaders/physical-wgsl/`: WGSL twins, attached as `ShaderChunk.wgsl`.
- `packages/rendering/src/materials/PhysicalMaterial.ts` (descriptor + `ProgramFeatureSource`), `materials/lobes.ts`
  (C-03 `registerMaterialLobe` calls), `materials/PhysicalFeatures.ts` (descriptor → `ProgramFeatures` partial;
  `PhysicalFeatureSet` type alias), `materials/features.ts` (C-02 `ShaderFeature`s: `prd04.uvTransform`,
  `prd04.tangentFrame`, `prd04.alphaToCoverage`, `prd04.transmissionTarget`, `prd04.debugView`).
- `packages/rendering/src/TransmissionRenderTarget.ts`, `forward/Transmission.ts` (C-01 contributor `prd04.transmission`).
- `packages/rendering/src/textures/TextureBudget.ts` (`applyTextureBudget(desc, policy)`; PR 0b-2 ships the identity stub here).
- `packages/rendering/src/ProceduralMaterialTextures.ts`.
- `packages/assets/src/MikkTSpaceTangents.ts` (module injected; the vendored file itself is PRD 05's, §12.3).
- `packages/engine/src/production-runtime/ModelMaterialOverrides.ts`.
- `packages/engine/src/production-runtime/actor/TypedGLBActorMaterials.ts` (C-15 real; C-37 `materials` member;
  `actorsByNodeId` lane-internal lookup), `production-runtime/actor/materialDiagnostics.ts` (C-31 `materials` section).
- Lane barrels `packages/{rendering,engine,assets}/src/lanes/prd04.ts` (all `provide()`/`register*()` calls).
- `packages/engine/src/agent-api/compiler/diagnosticOnly.prd04.ts` (C-36 entries, removed as each field is wired).
- `packages/aura3d-cli/src/commands/prd04/{index,pinEmissiveDefaults,modelTintReport}.ts` (C-39).
- `tools/codemods/pin-emissive-defaults.mjs`, `tools/generate-extension-matrix.mjs`.
- `benchmarks/quality-rebuild/scenes/prd04/{index,assets}.ts`, `benchmarks/quality-rebuild/aura3d/scenes/prd04/*.ts`,
  `benchmarks/quality-rebuild/three/scenes/prd04/*.ts`.
- `.github/workflows/qr-prd04-materials.yml` (macos-14, ANGLE Metal; §15).
- Tests: `tests/qr/prd04/{unit,browser,oracles,shims,fixtures}/`, `tests/unit/contracts/impl/prd04-*.test.ts`.
- Evidence: `docs/project/aura3d-quality-rebuild/evidence/prd-04/`.

### 5.3 Not edited by PRD 04 (seam or request, §12.3)

`ShaderLibrary.ts`, `ShaderLibraryCore.ts`, `ShaderChunks.ts` (frozen legacy, 01), `BRDFLut.ts` (01), `ForwardPass.ts`
(01), `WebGL2Device.ts` (01), `WebGPUDevice.ts` (11), `LightUniforms.ts`/`ClusteredForwardLighting.ts` (02),
`KTX2BasisTextureTranscoder.ts`/`KTX2TargetSelection.ts`/`GLTFCompressionDecoders.ts`/`loaders/KTX2Loader.ts`/`vendor/`
(05), `webgl2/TextureUpload.ts` (06), `packages/rendering/src/index.ts` and `agent-api/index.ts` outside the carves (15),
`benchmarks/quality-rebuild/shared/*`, `ci.sh`, `.github/workflows/quality-rebuild-capture.yml` (12), every game route
(14), templates and skills (13).

Deleted only by their owners, on request, after `rg` shows zero imports: `production-runtime/shaders/chunks/*.glsl`
(01), `production-runtime/shaders/wgsl/pbr.wgsl` (11), `packages/assets/src/loaders/KTX2Loader.ts` stub (05).

---

## 6. Architecture proposal

### 6.1 Target architecture

```
glTF / AuraMaterialSpec / material.* preset / AuraModelMaterialOverride (C-15)
        │  (no heuristics, no rewrites; spec-exact mapping; overrides re-applied from an authored snapshot)
        ▼
PhysicalMaterialDescriptor (materials/PhysicalMaterial.ts; one CPU struct for scalar, textured, instanced, skinned)
        │  ProgramFeatureSource.programFeatures(ctx)  (C-03)  → ProgramFeatures partial (C-02):
        │     maps + uvSet/transform, alphaMode, doubleSided, lighting lit/unlit,
        │     extensions: MaterialExtensionFeature[] from registered PRD 04 lobes
        ▼
ProgramCache + ProgramGenerator (C-02, PRD 01)  — the only program cache in the program (CONTRACTS §0 R3)
        │  base `brdf` chunk + u_dfgLut (PRD 01), lighting/IBL/shadow chunks (PRD 02), deform (PRD 06),
        │  PRD 04 lobe chunks spliced at fragment:material / fragment:indirect, PRD 04 features at
        │  fragment:alpha / fragment:normal / vertex:pars
        ▼
Frame graph (C-01): opaque (01) → `transmission` phase: prd04.transmission captures aura.scene.color into
TransmissionRenderTarget + mips → transmissive → transparent → post-hdr (03) → output (01)
```

Principles:
- **One BSDF, contributed as lobes.** PRD 01 owns the base lobe (`brdf` chunk: `PhysicalMaterial` struct, `F_Schlick`,
  `V_GGX_SmithCorrelated`, `D_GGX`, `a3dDFG`, `a3dDirectSpecular`, `a3dDirectLight`; C-02) and the program cache.
  PRD 04 owns every extension lobe (C-03 ids `specular`, `ior`, `clearcoat`, `sheen`, `iridescence`, `anisotropy`,
  `transmission`, `volume`, `dispersion`, `emissive-strength`, `unlit`), the material-side descriptor, and the
  feature mapping. Skinned, instanced, morph and scalar draws all reach the same lobes because the generator composes
  vertex features (C-18, C-07) orthogonally; that removes the separate skinned shader that never got the extensions (E26).
- **Spec-exact import.** The glTF → descriptor mapping copies factors, textures, samplers, texCoord and the
  KHR_texture_transform of every slot verbatim. Asset-specific behaviour is not allowed in shared code. If a test asset
  needs a workaround, the asset gets fixed.
- **Compile-time features, per-frame uniforms.** Lobes, transmission, A2C and texture-transform presence are feature
  bits in `ProgramFeatures`. Per-material scalars stay uniforms bound by `MaterialLobe.bind`.
- **Override, don't replace.** Public model material changes are an override layer that multiplies onto authored
  data per sub-material, with explicit opt-in to replacement (C-15).
- **Fail loudly.** A requested feature that cannot render (unsupported decoder, procedural kind without a generator,
  sampler budget overflow, lobe without a generated program) produces a structured issue in
  `app.diagnostics().materials` (C-31) and a C-36 degradation (`extension-lobe-pending`, `capability-degraded`), and an
  error under `A3D_QR_STRICT`. It never silently records the input and keeps going.
- **Flag-off identity.** With `A3D_QR_MATERIALS` off, every PRD 04 path returns the stub (C-03/C-15) and pixels are
  identical to `85aafcd0` (CONTRACTS §6.1). With it on but `A3D_QR_CORE` not `v2`, draws still use the frozen legacy
  shaders, so only the PRD 04 changes that live in PRD 04-owned CPU code are visible (§16.1); lobe chunks have no render
  effect and `diagnostics().materials.paths.materialModel` reports `"legacy"` (C-03 stub semantics).

### 6.2 Recommendations with cost profile

Costs are relative to the current shipping path at 1080p. "+X ms" is a budget ceiling verified in §17,
not a measurement. Absolute millisecond ceilings are verified on the §17 reference devices; the
macos-14 CI runner (ANGLE Metal on a virtualized Apple-silicon VM, no timer queries) only enforces the
relative frame-time deltas defined in §17.

**R1. Tint semantics: multiply, keep textures, no auto-emissive, per-material targeting.**
`model(asset, { material: { color } })` multiplies `baseColorFactor` by `color` and leaves every
texture, roughness, metallic and emissive value untouched unless that field is given explicitly.
`replaceTextures: true` restores the flatten behaviour. Overrides can target material names.
The `/joint/i` special case is deleted. Lives entirely in PRD 04-owned code (`compiler/modelMaterials.ts`,
`TypedGLBActor.ts`, `ModelMaterialOverrides.ts`), so it is visible standalone with `A3D_QR_MATERIALS` on; with the
flag off the C-15 stub keeps today's flatten. Provides C-15.
- Visual benefit: high. Restores authored albedo, roughness and normal detail on the 26 tinted model
  nodes, and removes the self-glow that keeps tinted models from ever going dark in shadow.
- GPU: 0. CPU: 0 (one-time uniform writes). Memory: 0. Bundle: +≈1 KB. Mobile: neutral.
- Fallback: none needed. Legacy behaviour is available through `materialOverrides: [{ color, replaceTextures: true }]`.

**R2. No asset-specific hacks or fudge constants in any PRD 04 path.** This covers E10–E14, E16–E23, the
`roughEnvironmentFloor` / stripe terms (E19), the `mix(1.1,0.65,r)` env scale, the Duck route clamp
(E21), and the `/joint/i` tint branch.

Ownership decides how each is removed:
- PRD 04-owned code, removed by this lane: E21 Duck route clamp (also neutralises the E20 WGSL gates, E39), E23
  clearcoat-shell cull override, the `/joint/i` branch and the `0.28/0.38/0.16` tint defaults (E2), E22 glass import
  rewrite (only on draws that have a generated transmission lobe; see R4 sequencing), E31 glass preset double count.
- Generated programs: PRD 04's lobe chunks are written from r185 and never contain E10–E17. A source guard over
  `shaders/physical*/**` and `materials/**` enforces it.
- Frozen legacy shaders (`ShaderLibrary.ts`, `ShaderChunks.ts`, owner 01): not edited by PRD 04. PRD 01 deletes them when
  `A3D_QR_CORE` is removed (CONTRACTS §3.7, §5.4). The two hacks that distort authored assets on the legacy path, E18
  (red gate) and E19 (stripes/floor), go as a legacy patch request: gate them behind a uniform that PRD 04's material
  classes set only with the flag on (§12.3 Q-01-1), so flag-off pixels do not change.
- WebGPU (`WebGPUDevice.ts`, owner 11): deletion of the gate functions, fixed light and `2.25` is request Q-11-1.

Sequencing rule kept from the earlier draft: E22 is not removed on a draw until that draw has a non-black
transmission path (a generated program with the `transmission` lobe, or the env-refraction fallback). Removing it
under the legacy shader would turn the affected glass from dark plastic into a ≤58% blend over nothing.
- Visual benefit: high. Removes the milky clearcoat veil, the red-paint recolor and the dark glass,
  and restores roughness response.
- GPU: −3 to −8% fragment ALU on textured materials (fewer instructions). CPU: 0. Memory: 0.
- Bundle: −10 to −20 KB of shader source once PRD 01 removes the legacy path (`ShaderLibrary.ts` is 175 KB raw today).
- Mobile: positive.
- Fallback: none. Hacks are not a feature. Assets that depended on them are re-authored (§10).

**R3. Physical lobes ported from three r185 semantics, contributed through C-03.**

Split of the r185 physical model between lanes (CONTRACTS §0 R3/R4, C-02):
- PRD 01 (consumed, C-02 `brdf` chunk): `PhysicalMaterial` struct, GGX D/V, Schlick, the r185 DFG LUT (`DFGLUTData.js`,
  16×16 RG16F, sampled at `(roughness, NdotV)`, bound as `u_dfgLut`), direct multiscatter (`BRDF_GGX_Multiscatter`, LUT
  at both NdotV and NdotL), geometric specular AA (`ProgramFeatures.specularAntialiasing`), Lambert default diffuse
  (`ProgramFeatures.diffuseModel`). PRD 04 supplies the JS reference and r185 golden values for these as a request
  (Q-01-5) and tests its own lobes against a test-only r185 `brdf` shim until PRD 01's chunk is registered.
- PRD 04 (provided, C-03 lobes): `ior` (IOR-driven F0, `specularF90`), `specular` (`KHR_materials_specular` on top of the
  IOR F0), `clearcoat` (separate lobe, base attenuation `(1 − cc·Fcc)`, roughness floor 0.0525), `sheen` (Charlie D,
  Neubelt V, IBL sheen via r185's analytic `IBLSheenBRDF` fit (Estevez–Kulla), energy compensation
  `1 − max3(sheenColor)·IBLSheenBRDF`), `anisotropy` (`alphaT = mix(α², 1, aniso²)`, bent-normal IBL direction),
  `iridescence` (replaces Fresnel), `transmission`/`volume`/`dispersion` (R4), `emissive-strength`, `unlit` (R14).

Each lobe is a `MaterialLobe` (C-03) with `feature()`, `bind()`, `samplerSlots` and chunk names, written once in
`shaders/physical/*` with a WGSL twin. Chunks add energy only through `PhysicalMaterial` fields at
`fragment:material` and `fragment:indirect` (C-03 invariant).
- Visual benefit: very high. This is the scene-defining fix for 04, 07, the coat on 02, and every car paint, fabric,
  brushed metal and soap-film asset. Visible only on generated programs (`A3D_QR_CORE=v2` + C-02 real), so its visual
  acceptance is integrated (§16.2); its numeric correctness is standalone (ChunkHarness, §16.1 S5).
- GPU, all lobes off: 0 (no chunk spliced). All extensions on: ≤ +25% fragment cost vs the current atlas variant.
- CPU: lobe `feature()`/`bind()` per material on change only. Memory: 0 (the DFG LUT is PRD 01's). No sheen LUT.
- Bundle: ≈ +12 KB raw GLSL + WGSL for all lobes before gzip; net negative once PRD 01 removes the legacy families.
- Mobile: lobe chunks compile only when the material uses them. Low tier replaces the iridescence film with Schlick
  (feature bit, §17). Sampler slots are counted against C-12 `resolveLightingSamplerBudget`; overflow drops lobes in
  `LIGHTING_SAMPLER_DROP_ORDER` and reports `extension-lobe-pending`.
- Fallback: a lobe with no generated program (C-02 stub) has no render effect and reports
  `paths.materialModel: "legacy"`; the legacy shader keeps drawing.

**R4. Real transmission.**
- `forward/Transmission.ts` registers the C-01 frame contributor `prd04.transmission` (phase `transmission`, flag
  `A3D_QR_MATERIALS_TRANSMISSION`). When any visible item's `programFeatures()` includes the `transmission` lobe, it
  copies `FRAME_RESOURCES.sceneColor` (`aura.scene.color`, RGBA16F under `A3D_QR_CORE=v2`, else the legacy target) into
  a `TransmissionRenderTarget` (linear, full mip chain) and generates mips. No capture otherwise.
- The `transmission` lobe samples it at `lod = log2(viewportSize) · applyIorToRoughness(roughness, ior)`,
  matching three's `getTransmissionSample`. The sampler is bound by the `prd04.transmissionTarget` ShaderFeature
  (`bindUniforms`), which reads the target the contributor published on the C-01 blackboard key
  `prd04.transmissionTarget`.
- Refraction direction comes from `refract(−v, n, 1/ior)` scaled by `thickness · modelScale`.
- Volume attenuation is Beer–Lambert with `attenuationDistance` in world units.
- Dispersion uses per-channel IOR `ior ± halfSpread` with `halfSpread = (ior − 1) · 0.025 · dispersion`
  (three r185 formula), giving 3 samples.
- `material.glass` defaults to `opacity: 1, transmission: 1` (flag-gated, R15).
- The glass import rewrite (E22) is skipped for a material exactly when its draw resolves to a generated program with
  the `transmission` lobe (or `renderer.transmission: "env"`); otherwise the legacy rewrite stays (R2 sequencing).
- Ordering: with the C-01 stub, the `transmission` phase runs after the single `ForwardPass`, so transmissive items are
  already drawn before the capture (CONTRACTS C-01 stub deviation). Correct capture-then-transmissive order needs C-01 real (ForwardPass split, provider 01) and a transmissive queue placed after the `transmission` phase (request Q-01-6). Until
  then, capture correctness is standalone (§16.1 S10) and the 05-transmission look is integrated.

Costs and fallback:
- Visual benefit: very high for glass, visors, bottles and water features. It fixes 05 (black bowl) and car windows.
- GPU: ≤1.0 ms (Medium, half-res target) and ≤1.5 ms (High, full-res) at 1080p for capture + mip generation. Per-pixel cost: 1 sample, or 3 with dispersion.
- CPU: one extra pass submission. Memory: 1080p RGBA16F + mips ≈ 22 MB full-res, ≈ 5.5 MB half-res.
- Bundle: +≈4 KB. Mobile: Low tier disables the target.
- Fallback: Low tier refracts the C-09 environment probe (`neutral(tier)` is guaranteed to exist) with correct Fresnel
  and Beer attenuation. Transmissive surfaces must never render black: if both the target and the env probe are
  missing, they fall back to the `ambient` term with `alpha = 1 − transmission·(1 − F)`.

**R5. Program features, not a second program cache; no light cap on extension materials.**
- PRD 04 does not ship a program cache (CONTRACTS §0 R3). `PhysicalMaterial.programFeatures(ctx)` (C-03
  `ProgramFeatureSource`) returns maps, alpha mode, lit/unlit and `extensions: MaterialExtensionFeature[]` from the
  registered lobes. PRD 01's `ProgramCache`/`ProgramWarmup` compile, cache, warm and fall back (C-02, C-28 `compileAsync`).
  `PhysicalFeatureSet` stays only as a type alias of that return type.
- Invariants PRD 04 owns: `programFeatures()` never sets or omits the light fields (they are excluded from its return
  type by C-03), so no material can force the uniform-16 path; the material reports `lightsEvaluated` from the
  program's `lights.clustered` bit; `lightsDroppedByMaterial` counts items whose program had `clustered: false` while
  the frame had more than 16 lights.
- The legacy textured variants compile out clustered lights (`A3D_PBR_DISABLE_CLUSTERED_LIGHTING`, E8). Removing that
  define is PRD 01's legacy code (request Q-01-3, declared correctness fix per CONTRACTS §6.1).
- PRD 02 owns cluster quality (`ClusteredForwardLighting.ts`, `forward/Lighting.ts`).
- Visual benefit: high for multi-light scenes. Gallery Shift's ~31 and Courier's ~20 lights reach GLB materials.
- GPU: clustered loop cost identical to the base variant's. CPU: feature computation per material on change.
- Memory: 0 in PRD 04. Program-count budget per tier is enforced from C-28 counters (§17).
- Mobile: Low tier merges rarely used lobes into the nearest superset by emitting fewer feature bits (iridescence →
  Schlick, dispersion off).
- Fallback: PRD 01's superset fallback; PRD 04 reports `material-program-fallback` from `ProgramHandle.status`.

**R6. Texture sampling correctness and anisotropy defaults.**
- Primitive (`compiler/textures.ts`, ex-`index.ts:14379-14381`) and SDF text (ex-`:14529`) samplers become
  `Sampler.trilinear()`: `linear-mipmap-linear`, `repeat` (`clamp-to-edge` for SDF text), anisotropy from the tier.
- `sampling` / `slotSampling` on `AuraMaterialSpec` (C-15, C-12 `AuraTextureSampling`: `wrap` `"repeat" | "clamp" | "mirror"`).
  `"mirror"` maps to the existing `"mirror-repeat"` address mode (E37). No new address mode is added.
- Default anisotropy: Low 4, Medium 8, High 16, Ultra 16 (C-27 `anisotropy`, CONTRACTS §0 R9), clamped to the device
  maximum. `textureAnisotropy` stays as an override.
- Generated programs use hardware wrap (`uv_transform` chunk, no `fract`). The legacy textured shader always applies
  in-shader wrap (E38), which leaves a 1-px mip seam at tile edges even with a repeat sampler. A passthrough wrap code is
  request Q-01-2; until it lands, the seam metric is integrated and only shimmer is standalone (§16.1 S6).
- Visual benefit: high. Ground and wall textures can tile without shimmer, seams disappear on
  KHR_texture_transform scale > 1, and games can stop painting with emissive.
- GPU: aniso 16 vs 8 costs ≤ +3% of texture bandwidth on desktop. Mips are already generated, so sampling them costs nothing extra.
- CPU: 0. Memory: 0, since mips already exist (index.ts:14373 counts mip bytes). Bundle: +≈0.5 KB.
- Mobile: aniso 4 on the Low tier.
- Fallback: devices without `EXT_texture_filter_anisotropic` use trilinear only.

**R7. KHR_texture_transform everywhere.**
- Per-slot offset, rotation, scale and texCoord override in every generated program, including skinned (E26),
  through the `prd04.uvTransform` ShaderFeature and C-02 `TextureSlotFeature { uvSet, transform }`.
- The matrix follows the glTF `KHR_texture_transform` spec: `M = T(offset) · R(rotation) · S(scale)` with
  `R = [[cos r, sin r], [−sin r, cos r]]`, i.e. scale first, then rotate, then offset. three r185's
  `Matrix3.setUvTransform(offset, repeat, rotation, center=0)` builds `S · R` instead (rows scaled by
  `sx`, `sy`; `Matrix3.js:394-406`), which equals the spec only when `scale.x == scale.y`. Aura follows
  the spec; the divergence from three for non-uniform scale with non-zero rotation is recorded in the
  support matrix notes and is not an acceptance failure. Aura's current shader order (`uv·scale → rotate → +offset`,
  research/03 §7) is already the spec order; only the rotation sign must be checked against Khronos `TextureTransformTest`.
- Transforms are computed CPU-side as a `mat3` per slot, which avoids per-fragment trig.
- Visual benefit: medium. Required for trim sheets, atlases and decals.
- GPU: −(trig per slot). CPU: 1 mat3 per slot on change. Memory: negligible. Bundle: negligible.
- Mobile: positive. Fallback: none.

**R8. Tangents: MikkTSpace, model-matrix transform, Gram–Schmidt.**
- When a primitive has a normal map, no TANGENT attribute and indexed TEXCOORD_n, `GLTFRenderResources.ts` calls
  `generateMikkTSpaceTangents` (`MikkTSpaceTangents.ts`) in a worker at load time. The module is r185's
  `examples/jsm/libs/mikktspace.module.js` (npm `mikktspace` build, MIT), vendored by PRD 05 into
  `packages/assets/vendor/mikktspace/` (request Q-05-1) and injected with `setMikkTSpaceModule()`. three's
  `BufferGeometryUtils.computeMikkTSpaceTangents` defaults `negateSign = true` for the glTF UV convention; Aura matches it.
  Until the vendored file lands, the runtime keeps today's `generateMeshTangents` (`GLTFRenderResources.ts:1216`); unit
  tests load the module from `node_modules/three` (dev dependency only).
- Generated programs: `tangent_frame` chunk transforms tangents by `mat3(model)`, not the normal matrix, and
  re-orthogonalises in the fragment shader (`T = normalize(T − N·dot(N,T))`, `B = cross(N,T)·w`); without a TANGENT
  attribute it uses three's `getTangentFrame` derivative frame. The legacy normal-matrix transform (E25) is PRD 01's
  frozen code (request Q-01-4).
- Visual benefit: medium-high on Meshy, Substance and Blender heroes: no seam shading, correct normal maps under non-uniform scale.
- GPU: +3 ALU. CPU: worker, ≤ 40 ms per 100k vertices on M1, cached by asset hash for the session.
- Memory: +16 bytes per vertex for generated tangents (already the case today). Bundle: r185's `mikktspace.module.js` is 48.8 KB raw (wasm inlined as base64); lazy-loaded only when needed; gzip size is measured and recorded when vendored.
- Mobile: worker-based. Low tier uses the derivative frame without wasm.
- Fallback: derivative frame. PRD 05 bakes TANGENT at `assets add`, so runtime generation becomes rare.

**R9. KTX2/Basis colour-space fidelity (consumer of C-16).**
- PRD 05 owns target selection (`selectKTX2TargetFormat(caps, source, hasAlpha, colorSpace)`, CONTRACTS §0 R6), the
  transcoder, worker pool, local decoder URLs (no `unpkg`, E27) and the sRGB internal formats in `webgl2/TextureFormats.ts`.
- PRD 04 owns the material side: `GLTFRenderResources.ts` computes the colour-space intent of every image from the slots
  that reference it (sRGB: baseColor, emissive, sheenColor, specularColor; linear: everything else; an image used by
  both is a conflict reported as an issue and decoded linear) and passes it into the C-16 decode options. Today
  `DecodedGLTFImage.colorSpace` comes back `"linear"` from the RGBA8 path (`KTX2BasisTextureTranscoder.ts:46-50`), so a
  wrong-colour-space upload is the visible defect (E27, E28).
- Visual benefit: medium. Base colour is no longer washed out on compressed upload, and the asset pipeline can ship
  compressed textures safely.
- GPU: −50 to −75% texture bandwidth with compression. CPU: −50% transcode (no double transcode, PRD 05). Memory: −4× to −8× VRAM.
- Bundle: 0 in PRD 04 (the transcoder is PRD 05's lazy chunk). Mobile: strongly positive (ASTC/ETC2).
- Fallback: RGBA8, reported as `ktx2-uncompressed-fallback`. Kill switch `A3D_QR_MATERIALS_KTX2=0` forces RGBA8.

**R10. Draco/Meshopt decoder injection on the `model()` path (consumer of C-16).** `createTypedGLBActor` reads
`extensionsUsed`, calls C-16 `AssetDecoderRegistry.require(["draco" | "meshopt" | "ktx2"])` and passes the set through
`loadProductionGLTFRenderPipeline`. The C-16 stub wraps today's `GLTFCompressionDecoders.ts` loaders, so this works on
day 0; local vendored decoders arrive with PRD 05's real implementation. Decode-only; encoding is PRD 05.
- Visual benefit: indirect. It lets the asset pipeline ship decimated, compressed assets.
- GPU: 0. CPU: decode in a worker. Memory: transient.
- Bundle (r185 raw sizes, PRD 05's lazy chunks): Meshopt `meshopt_decoder.module.js` 29 KB; Draco `draco_decoder.wasm` 286 KB + `draco_wasm_wrapper.js` 59 KB.
- Mobile: positive (smaller downloads).
- Fallback: `AssetDecoderUnavailable` (C-16) surfaced as a `decoder-missing` material issue naming the extension. It
  does not throw from deep inside `GLTFLoader.ts:1312`.

**R11. KHR_materials_variants reachable from the public API.** `handle.materials.setMaterialVariant(name)` and
`handle.materials.materialVariants()` (C-15/C-37) on day 0; `model(asset, { variant })` once PRD 15 forwards the option
from `model()` (E40, request Q-15-1). `GLTFRenderResources.ts:1141` already resolves `mesh.materialVariants`; the actor
rebinds by rebuilding the per-primitive material binding from the asset with `materialVariant`.
- Visual benefit: low-medium (product configurators, team colours without tinting).
- GPU: 0. CPU: material rebinding on switch. Memory: all variant materials resident (already true in the asset layer). Bundle: +≈1 KB.
- Mobile: neutral. Fallback: an unknown variant leaves the default materials in place and reports `variant-unknown`.

**R12. Procedural material textures actually applied.**
- Implement generators for `fabric-normal`, `rubber-roughness`, `brushed-metal-anisotropy` and
  `plastic-micro-scratch` in `ProceduralMaterialTextures.ts`.
- Each generator is CPU-side, deterministic and seeded. It produces a 512² tileable image
  (256² on the Low tier) with mips and `repeat`, cached per `(kind, scale, strength, contrast, seed)`.
- The images are bound to the requested slot in `compiler/textures.ts` (ex-`index.ts:14040-14104`, `:14163`):
  normal, roughness, anisotropy (rg direction, b strength) or roughness+normal. This replaces the "has no rasterizer;
  recorded only" path at `:14163`. The duplicate authoring-time warning at `index.ts:18268` lives in
  `collectGeneratedCodeWarnings` (PRD 13, C-34) and is removed by request Q-13-1 once PRD 04's path is real.
- `seed?: number` on `AuraProceduralTextureSpec` (`index.ts:927-937`, frozen types) is an additive CCR (CCR-04-1);
  until it merges, the seed is a hash of `(kind, scale, strength, contrast, direction)`.
- Visual benefit: medium. The fabric, brushedMetal, blackRubber and frostedGlass presets start rendering their intended
  micro-detail. Normal and roughness maps reach the legacy textured shader, so this is visible standalone; the
  anisotropy-direction map needs the `anisotropy` lobe (integrated).
- GPU: 1 extra fetch per slot. CPU: ≤ 8 ms per texture once. Memory: 512² RGBA8 + mips ≈ 1.4 MB each, so ≤ 6 MB for all 4 kinds.
- Bundle: +≈4 KB. Mobile: 256² on Low.
- Fallback: if generation fails, a `procedural-texture-failed` issue is emitted and the scalar material is kept. Under
  `A3D_QR_STRICT`, generation failure is an error.

**R13. Alpha-to-coverage for MASK under MSAA.** When `tier.msaaSamples > 0` (C-27) and `alphaMode === "mask"`, the
`prd04.alphaToCoverage` ShaderFeature (C-02, hook `fragment:alpha`) emits r185's `alphatest_fragment` form
`a = smoothstep(cutoff, cutoff + fwidth(a), a); if (a == 0.0) discard;`, and the material requests
`RenderCommandState.alphaToCoverage: true` (C-04; PRD 01 applies it in `WebGL2Device`, PRD 11 in WebGPU). ForwardPass
copying the material's request into the command state is request Q-01-6. Otherwise `discard`.
- Visual benefit: medium for foliage, hair, fences and decals (research/03 §8).
- GPU: negligible. CPU: a state toggle. Memory: 0. Bundle: <1 KB. Mobile: same (A2C is core in WebGL2 and WebGPU).
  Fallback: `discard` when MSAA is off or C-04 is still the stub (which ignores `alphaToCoverage`).

**R14. Unlit correctness.** The `unlit` lobe sets `ProgramFeatures.lighting: "unlit"` and outputs
`baseColorFactor · baseColorTexture · COLOR_0` through the single output transform (C-05, PRD 01). It is never modified by
environment, fog-tint hacks or emissive defaults. The asset policy that heroes must not be unlit belongs to PRD 05/13.
This PRD only guarantees that unlit renders exactly as authored.
- Visual benefit: low by itself; it removes env/fog tinting from unlit cards. GPU: −(lighting loop) for unlit draws. CPU: 0. Memory: 0. Bundle: ≈0 (one feature bit). Mobile: neutral. Fallback: none; unlit has no unsupported inputs.

**R15. Preset defaults that stop rewarding glow (flag-gated).**
- `material.emissive` defaults to `emissiveIntensity: 1.0` and a body colour equal to `color` or `#808080`, instead of `#111827`.
- `material.neon` defaults to intensity 2.0.
- `material.pbr` no longer contributes `color` to models: the injected `#d7dee8` is ignored by the model bridge, so the
  glTF base colour shows (R1).
- `material.glass` defaults to `opacity 1` (with `transmission 1`).
- `material.metal` drops `envMapIntensity 1.45` (PRD 02 owns IBL energy).
- The engine fallback `emissiveIntensity ?? (emissive ? 1.35 : 0)` becomes `?? (emissive ? 1.0 : 0)`.

Flag-off identity forces a specific mechanism, because presets run at authoring time without flags:
`nodes/material.ts` keeps returning today's objects and records which fields each preset defaulted under an enumerable
symbol key `AURA_PRESET_DEFAULTS` (survives object spread; ignored by `JSON.stringify`, so snapshot hashes do not
change). `compiler/modelMaterials.ts` and `compiler/textures.ts` (PRD 04) resolve those fields to the new defaults only
when `ctx.flags.on("A3D_QR_MATERIALS")`, via `resolveMaterialSpecDefaults(spec, flags)`. That covers models and the
textured C1 path (`:14391`). The primitive path (`createProductionPrimitiveMaterial`, `index.ts:14877`, fallbacks
`:14896`/`:14912`) is PRD 15's code (E41): request Q-15-2 asks it to call `resolveMaterialSpecDefaults`. If any existing
deep-equality test of preset output fails because of the symbol key, the marker becomes a `WeakMap` keyed by the
returned object (spread loses it; the codemod pins those sites anyway).
- Visual benefit: medium. Scenes stop defaulting to glowing toy plastic.
- GPU, CPU, memory, bundle: 0. Mobile: neutral.
- Fallback: the `pin-emissive-defaults` codemod (C-39) pins old values; PRD 14 applies it per route (§10).

**R16. Texture budgets and size clamp at upload.**
- `textures/TextureBudget.ts` implements `applyTextureBudget(desc, policy)`, the seam PR 0b-2 places in PRD 06's
  `webgl2/TextureUpload.ts` (CONTRACTS §3.4; identity stub until PRD 04 provides it). Policy comes from C-27:
  `maxTextureSize` (Low 1024, Medium 2048, High 4096, Ultra 4096) and `textureBudgetBytes` (128 MiB / 256 MiB / 512 MiB /
  1 GiB; 256 MiB is today's default at `index.ts:14598-14603`).
- Images over `maxTextureSize` are downscaled by powers of 2 before upload (`createImageBitmap` with `resizeWidth/Height`
  and `resizeQuality: "high"` for bitmaps; box filter for typed arrays). KTX2 textures drop top mip levels instead of
  resampling.
- When the per-device byte total would exceed the budget, the largest textures lose top mips first, and a
  `texture-budget-exceeded` issue lists them.
- Visual benefit: no loss at game camera distances. It prevents OOM and black frames on mobile.
- GPU: 0 (CPU-side, before upload). CPU: one-time resize, worker-capable via `createImageBitmap`. Memory: Meshy hero 4096² ×3 ≈ 268 MB → 2048² ≈ 67 MB on Medium.
- Bundle: +≈2 KB. Mobile: required.
- Fallback: if `createImageBitmap` resize options are unsupported (older Safari), an `OffscreenCanvas` `drawImage` downscale.

**R17. Truthful capability reporting.** `GLTF_EXTENSION_SUPPORT_MATRIX` and
`PHYSICAL_EXTENSION_MATRIX` are generated from the conformance results of §15.3, with no hand-typed
"runtime-supported" entries. Every extension has a status of `conformant`, `approximate` or
`unsupported`, plus a link to its test.
- Visual benefit: indirect, because agents stop relying on fake features. GPU, memory, mobile: 0.
  CPU: 0 at runtime (the matrix is generated at build time). Bundle: ≈0 (the generated table replaces the hand-typed one).
  Fallback: if `tests/reports/material-conformance.json` is missing, generation fails CI rather than
  emitting a stale or optimistic matrix.

---

## 7. APIs to add, change and remove

Frozen contract surfaces are quoted from `CONTRACTS.md` and are not redefined here. PR 0a pre-declares every C-15 field
on the existing types as optional and inert (`@qrOwner prd04 @contract C-15`), so consumers compile against them on
day 0. PRD 04 wires them; until then they sit in `compiler/diagnosticOnly.prd04.ts` (C-36). Any field below that is not
in C-12/C-15 is marked **CCR** and is an additive optional-field CCR (CONTRACTS §6.4); none of them blocks work.

### 7.1 `@aura3d/engine` (C-15, file `packages/engine/src/contracts/materials.ts`, custodian 15)

```ts
// C-12 (sampling.ts), consumed:
export type AuraTextureWrap = "repeat" | "clamp" | "mirror";      // "mirror" → existing "mirror-repeat" (E37)
export interface AuraTextureSampling { readonly wrap?: AuraTextureWrap; readonly filter?: "trilinear" | "bilinear" | "nearest"; readonly anisotropy?: number; }

// C-15 AuraMaterialSpec additions (index.ts:1027-1120), owner tags as in CONTRACTS:
//   specularIntensity?, specularColor?, specularIntensityMap? (A channel), specularColorMap? (sRGB)
//   dispersion?, transmissionMap? (R), thicknessMap? (G)
//   alphaMode?: "opaque" | "mask" | "blend"   (default "opaque" unless opacity < 1, then "blend"; CONTRACTS §0 R12: PRD 04 owns semantics)
//   alphaCutoff? (default 0.5); alphaToCoverage? (mask only; default true when tier.msaaSamples > 0); doubleSided?; unlit?
//   sampling?: AuraTextureSampling; slotSampling?: Partial<Record<AuraMaterialTextureSlot, AuraTextureSampling>>
//   ior? (owner tag PRD 01 in C-15; PRD 04's `ior` lobe consumes it)
export type AuraMaterialTextureSlot =
  | "baseColor" | "normal" | "metallicRoughness" | "occlusion" | "emissive"
  | "clearcoat" | "clearcoatRoughness" | "clearcoatNormal"
  | "sheenColor" | "sheenRoughness" | "specularIntensity" | "specularColor"
  | "transmission" | "thickness" | "iridescence" | "iridescenceThickness" | "anisotropy";

export interface AuraModelMaterialOverride {                       // C-15, verbatim
  readonly target?: string | RegExp | readonly (string | RegExp)[]; // glTF material.name; string = exact; omitted = all
  readonly color?: AuraColor; readonly colorMode?: "multiply" | "replace"; readonly replaceTextures?: boolean;
  readonly roughness?: number; readonly metallic?: number; readonly emissive?: AuraColor; readonly emissiveIntensity?: number;
  readonly clearcoat?: number; readonly clearcoatRoughness?: number; readonly envMapIntensity?: number; readonly opacity?: number;
}
// AuraModelOptions additions (C-15): materialOverrides?: readonly AuraModelMaterialOverride[]; variant?: string
// AuraModelOptions.material stays `AuraMaterialSpec` (no union). With A3D_QR_MATERIALS on it lowers to one all-materials
// override: color → multiply, no replaceTextures, emissive only if given. Legacy flatten = materialOverrides [{ color, replaceTextures: true }].

export interface AuraResolvedMaterialInfo { readonly name: string; readonly featureKey: string; readonly baseColorFactor: readonly [number, number, number, number]; readonly enabledMaps: readonly string[]; readonly extensions: readonly string[]; readonly lightsEvaluated: "uniform-16" | "clustered"; readonly warnings: readonly string[]; }
export interface AuraModelMaterialHandle {
  materialNames(): readonly string[]; materialVariants(): readonly string[]; setMaterialVariant(name: string | null): void;
  setMaterialOverrides(o: readonly AuraModelMaterialOverride[]): void;   // idempotent, re-applied from the authored snapshot
  inspectMaterials(): readonly AuraResolvedMaterialInfo[];
}
// AuraRuntimeNodeHandle.materials?: AuraModelMaterialHandle   (C-37 extension member "materials", model nodes only)

export interface AuraRendererMaterialOptions {                      // C-15; fields pre-declared on AuraCreateAppRendererOptions by C-38
  readonly materialStrictness?: "warn" | "strict";                 // default "strict" iff A3D_QR_STRICT
  readonly materialModel?: "legacy" | "physical-r185";             // alias of A3D_QR_MATERIALS (CONTRACTS §5.1)
  readonly transmission?: "auto" | "env" | "off";                  // alias of A3D_QR_MATERIALS_TRANSMISSION (off = "off")
  readonly alphaToCoverage?: boolean;
  readonly debugView?: "baseColor" | "normal" | "roughness" | "metallic" | "clearcoat" | "clearcoatRoughness" | "clearcoatRoughnessEffective" | "sheen" | "F0" | "tangent" | "anisotropyDirection";
}
export interface AuraMaterialDiagnostics {                          // C-15; reported via C-31 section key "materials"
  readonly programs: number; readonly programCompileMs: number; readonly transmissionTargetActive: boolean;
  readonly lightsDroppedByMaterial: number;                        // must be 0 (§21)
  readonly paths: { readonly materialModel: string; readonly transmission: string; readonly ktx2: string; readonly tangents: string };
  readonly textureBytes: number; readonly textureBudgetBytes: number; readonly downscaledTextures: number;
  readonly issues: readonly { readonly code: string; readonly material: string; readonly message: string }[];
}
```

Issue codes used in `issues[].code` (strings; no contract change): `procedural-texture-failed`, `ktx2-uncompressed-fallback`,
`decoder-missing`, `variant-unknown`, `material-program-fallback`, `material-program-pending`, `texture-budget-exceeded`,
`tangent-derivative-fallback`, `webgpu-material-approximate`, `transmission-ldr-capture`, `colorspace-conflict`,
`lobe-dropped-sampler-budget`. The per-texture downscale list is reported in `issues` (`texture-budget-exceeded`
messages), because C-15 types `downscaledTextures` as a count. Measured-only rule (C-31): `programs` and
`programCompileMs` are read from C-02 `ProgramCacheLike.stats()` (`compiled`, `compileMsTotal`, both measured by the
stub that wraps `ShaderLibrary` and by PRD 01's real cache); `textureBytes` from C-28 `counters().textureBytes`. A value
that cannot be measured is never filled with a constant: CCR-04-2 widens the affected C-15 numeric fields to
`number | null`, and until it merges the section omits nothing but adds issue `material-program-pending` with the
message `measurement unavailable: <field>`.

Lane additions (PRD 04 public helpers, exported from the engine lane barrel `lanes/prd04.ts`):

```ts
export const AURA_PRESET_DEFAULTS: unique symbol;                  // R15 marker key
export function resolveMaterialSpecDefaults(spec: AuraMaterialSpec, flags: QrFlags): AuraMaterialSpec;
```

Changed semantics (all only with `A3D_QR_MATERIALS` on):
- `model({ material: { color } })` multiplies authored base colour and keeps textures (R1).
- Preset defaults per R15. `material.pbr`'s injected colour is ignored on models.
- `AuraProceduralTextureSpec` (`index.ts:927-937`) renders. **CCR-04-1**: add `seed?: number`.
- `textureAnisotropy` stays as an alias for `sampling.anisotropy` and is marked `@deprecated` (JSDoc in the frozen type
  section is a doc-only CCR bundled with CCR-04-1).

Removed (flag on): the hard-coded `replaceSurfaceTextures: true` (ex-`index.ts:13570`, now in `compiler/modelMaterials.ts`)
and the `/joint/i` branch in `applyMaterialTint`. Both remain the C-15 stub path while the flag is off.

### 7.2 `@aura3d/engine` production runtime (`TypedGLBActor.ts`, owned)

```ts
// TypedGLBActorOptions additions are pre-declared in PR 0a (CONTRACTS §3.6): materialOverrides?, variant?, decoders?, textureBudget?, maxTextureSize?, lod? (lod is PRD 05's)
export interface TypedGLBActorOptions {
  readonly materialOverrides?: readonly TypedGLBActorMaterialOverride[];
  readonly variant?: string;
  readonly decoders?: AuraAssetDecoderSet;          // C-16; default: AssetDecoderRegistry.require(extensionsUsed)
  readonly textureBudget?: TextureBudgetPolicy;     // default from C-27 tier settings
  readonly maxTextureSize?: number;
}
export interface TypedGLBActorMaterialOverride {
  readonly target?: (materialName: string) => boolean;
  readonly baseColorMultiply?: readonly [number, number, number, number];
  readonly baseColorReplace?: readonly [number, number, number, number];
  readonly replaceTextures?: boolean;
  readonly roughness?: number; readonly metallic?: number;
  readonly emissiveColor?: readonly [number, number, number]; readonly emissiveStrength?: number;
  readonly clearcoat?: number; readonly clearcoatRoughness?: number;
  readonly envMapIntensity?: number; readonly opacity?: number;
}
export interface TypedGLBActor {
  // ...existing...
  setMaterialOverrides(overrides: readonly TypedGLBActorMaterialOverride[]): void; // re-applies from authored snapshot
  setMaterialVariant(name: string | null): void;
  materialVariants(): readonly string[];
  inspectMaterials(): readonly AuraResolvedMaterialInfo[];
}
/** @deprecated use materialOverrides; kept one minor version, maps to replaceTextures:true. Stays the C-15 stub path. */
export interface TypedGLBActorTintOptions { /* unchanged shape */ }

// ModelMaterialOverrides.ts (pure)
export type AuthoredMaterialSnapshot = ReadonlyMap<string /* material.name + index */, Readonly<Record<string, unknown>>>;
export function snapshotMaterials(materials: Iterable<Material>): AuthoredMaterialSnapshot;
export function applyMaterialOverrides(snapshot: AuthoredMaterialSnapshot, materials: Iterable<Material>, overrides: readonly TypedGLBActorMaterialOverride[]): void;
export function lowerModelMaterialOverrides(spec: AuraMaterialSpec | undefined, overrides: readonly AuraModelMaterialOverride[] | undefined): TypedGLBActorMaterialOverride[];
```

Overrides always re-apply from the authored snapshot taken at load. They are idempotent and never accumulate. The
current `setTint` mutates in place, so repeated calls compound.

### 7.3 `@aura3d/rendering`

```ts
// Sampler.ts (owned). Constructor defaults unchanged (§11). TextureAddressMode is unchanged (already has "mirror-repeat", Sampler.ts:9).
export class Sampler {
  static trilinear(options?: { wrap?: TextureAddressMode | readonly [TextureAddressMode, TextureAddressMode]; anisotropy?: number }): Sampler;
  static fromGLTF(info: GLTFSamplerInfo | undefined, anisotropy: number): Sampler;
}
// resolveSamplerAnisotropy (Sampler.ts:71) gains optional `tier?: AuraQualityTier` and `deviceMax?: number` on its request;
// when `desired` is undefined and `tier` is given it delegates to the C-12 contract function (L4/M8/H16/U16, clamped).

// materials/PhysicalMaterial.ts (C-03 real)
export interface PhysicalMaterialDescriptor {
  readonly baseColorFactor: Vec4; readonly metallicFactor: number; readonly roughnessFactor: number;
  readonly emissiveFactor: Vec3; readonly emissiveStrength: number;
  readonly normalScale: number; readonly occlusionStrength: number;
  readonly ior: number;                                            // default 1.5
  readonly specular?: { factor: number; colorFactor: Vec3 };
  readonly clearcoat?: { factor: number; roughnessFactor: number; normalScale: number };
  readonly sheen?: { colorFactor: Vec3; roughnessFactor: number };
  readonly iridescence?: { factor: number; ior: number; thicknessMin: number; thicknessMax: number };
  readonly anisotropy?: { strength: number; rotation: number };
  readonly transmission?: { factor: number };
  readonly volume?: { thicknessFactor: number; attenuationDistance: number; attenuationColor: Vec3 };
  readonly dispersion?: number;
  readonly diffuseTransmission?: { factor: number; colorFactor: Vec3 };
  readonly alphaMode: "opaque" | "mask" | "blend"; readonly alphaCutoff: number; readonly alphaToCoverage: boolean;
  readonly doubleSided: boolean; readonly unlit: boolean;
  readonly textures: Partial<Record<PhysicalMapSlot, { texture: Texture; sampler: Sampler; texCoord: 0 | 1; transform?: Mat3 }>>;
}
export abstract class PhysicalMaterial extends Material implements ProgramFeatureSource {   // C-03
  readonly descriptor: PhysicalMaterialDescriptor;
  programFeatures(ctx: MaterialFeatureContext): ReturnType<ProgramFeatureSource["programFeatures"]>;
}
export type PhysicalFeatureSet = ReturnType<ProgramFeatureSource["programFeatures"]>;    // alias only (CONTRACTS App. A)
// TexturedPBRMaterial, PBRMaterial, InstancedPBRMaterial, SkinnedLitMaterial keep their constructors and legacy uniforms
// and additionally implement programFeatures() from a descriptor built from their options.

// materials/lobes.ts: one registerMaterialLobe() call per C-03 id listed in R3, owner "prd04", flag "A3D_QR_MATERIALS".

// TransmissionRenderTarget.ts
export class TransmissionRenderTarget {
  constructor(device: RenderDevice, options: { scale: 0.5 | 1; format: "rgba16f" | "rgba8" });
  resize(width: number, height: number): void;
  captureFrom(sceneColor: Texture): void;      // copy + generateMipmap; no readback
  readonly texture: Texture; readonly mipCount: number;
  dispose(): void;
}
// forward/Transmission.ts
export const prd04TransmissionContributor: FrameContributor;   // id "prd04.transmission", phases ["transmission"], flag "A3D_QR_MATERIALS_TRANSMISSION"

// textures/TextureBudget.ts (seam host, CONTRACTS §3.4)
export interface TextureBudgetPolicy { readonly maxDimension: number; readonly maxBytes: number }
export function applyTextureBudget(desc: TextureDescriptor, policy: TextureBudgetPolicy): TextureDescriptor;   // pure except per-device byte ledger
export function textureBudgetReport(device: RenderDevice): { readonly textureBytes: number; readonly downscaled: readonly { id: string; from: number; to: number }[] };

// ProceduralMaterialTextures.ts
export type ProceduralMaterialKind = "fabric-normal" | "rubber-roughness" | "brushed-metal-anisotropy" | "plastic-micro-scratch";
export function generateProceduralMaterialTexture(
  kind: ProceduralMaterialKind,
  params: { scale: number; strength: number; contrast?: number; direction?: Vec3; seed?: number; size?: 256 | 512 | 1024 }
): { data: Uint8Array; width: number; height: number; colorSpace: "linear"; slot: "normal" | "roughness" | "anisotropy" };
```

Removed from the earlier draft because another lane owns them: `PhysicalProgramCache` (use C-02 `ProgramCache`),
`physicalFeatureKey`/`physicalDefines` (use C-02 `computeProgramKey`/`generateProgram`), `createDFGLut` (PRD 01,
`BRDFLut.ts`, C-02 `u_dfgLut`).

### 7.4 `@aura3d/assets`

```ts
// MikkTSpaceTangents.ts (owned)
export function setMikkTSpaceModule(mod: { generateTangents(p: Float32Array, n: Float32Array, uv: Float32Array): Float32Array; ready: Promise<void> }): void;
export function generateMikkTSpaceTangents(input: {
  positions: Float32Array; normals: Float32Array; uvs: Float32Array; indices?: Uint32Array | Uint16Array;
}): Promise<Float32Array>;                      // xyzw, w = handedness, glTF sign (negateSign = true); runs in worker
export function mikkTSpaceAvailable(): boolean;

// GLTFRenderResources.ts (owned). GLTFRenderResourceOptions gains, pre-declared in PR 0a:
//   tangents?: "mikktspace" | "derivative" | "legacy"   (default "legacy" with the flag off, "mikktspace" with it on and the module present)
//   textureBudget?: TextureBudgetPolicy; anisotropy?: number
// plus internal: imageColorSpaceIntent(asset): ReadonlyMap<imageIndex, "srgb" | "linear" | "conflict">, passed to C-16 decode options.

// GLTFExtensionSupport.ts (owned, generated)
export type GLTFExtensionStatus = "conformant" | "approximate" | "unsupported";
export interface GLTFExtensionSupportEntry { readonly name: string; readonly status: GLTFExtensionStatus; readonly test: string; readonly notes?: string }
```

Consumed from C-16 (PRD 05), not defined here: `selectKTX2TargetFormat(caps, source, hasAlpha, colorSpace)`,
`KTX2BasisTextureTranscoderOptions { targetFormat; colorSpace; maxDimension?; transcoderUrl }`, `AssetDecoderRegistry`,
`AuraAssetDecoderSet`, `AssetDecoderUnavailable`, `CompressedTextureCapabilities`. The earlier draft's
`KTX2TargetSelection.ts`, `detectCompressedTextureCaps`, `KTX2TargetFormat` and transcoder option changes are withdrawn
(CONTRACTS §0 R6).

Removed from `@aura3d/assets` by PRD 04 (flag on; deleted at flag removal): `usesUnbackedScalarTransmission`,
`renderPbrBaseColorFactor`, `renderPbrRoughnessFactor`, `usesOpaqueDoubleSidedClearcoatShell` (internal).

---

## 8. Shader changes

All PRD 04 GLSL lives in `packages/rendering/src/shaders/physical/*.glsl.ts` as C-02 `ShaderChunk`s named
`a3d_prd04_<name>` (owner `"prd04"`), registered from the rendering lane barrel and spliced by PRD 01's generator at the
hook points named per chunk. Every function below has a WGSL twin in `shaders/physical-wgsl/` (attached as
`ShaderChunk.wgsl`) with the same `a3d_` name and identical math, enforced by U-BSDF-PARITY (§15.1). Each module's header
comment cites the r185 file it is ported from.

Ownership boundary (CONTRACTS C-02, §0 R4): §8.2's base items marked **[01]** are the PRD 01 `brdf` chunk. PRD 04 does
not write them; it supplies their r185 JS reference and golden table (request Q-01-5) and, until PRD 01 registers the
chunk, its ChunkHarness tests compile against a test-only transcription `tests/qr/prd04/shims/brdf_r185.glsl.ts`.

### 8.1 Not ported (legacy terms that never appear in PRD 04 chunks)

These live in the frozen legacy shaders owned by PRD 01 (`ShaderLibrary.ts`, `ShaderChunks.ts`) and by PRD 11
(`WebGPUDevice.ts`). PRD 04 does not edit those files. The terms below are absent from every PRD 04 chunk, which the
source guard `tests/qr/prd04/unit/no-asset-specific-shader-constants.test.ts` asserts over `shaders/physical*/**` and
`materials/**`. They are deleted from the legacy files by their owners when `A3D_QR_CORE` is removed (CONTRACTS §5.4),
earlier only where §12.3 lists a request.

- `a3dApplyAdvancedPbrLobes` (`ShaderChunks.ts:253-327`) and every call site.
- The scalar cosine-palette iridescence (`a3dPbrIridescenceColor`, `ShaderChunks.ts:329-339`) and the scalar
  anisotropy lobes: the fixed world-XY-frame NDF `a3dPbrAnisotropicDistribution` (`ShaderChunks.ts:341-359`,
  `alphaT = alpha/aspect` with `aspect = sqrt(1 − 0.92·aniso)`) and the Gaussian env streak inside
  `a3dPbrExtensionEnvironmentLight` (`ShaderChunks.ts:440-460`). The scalar Charlie helper
  `a3dPbrCharlieSheen` (`:361-366`, `alpha` floored at 0.07) is replaced by the r185 `D_Charlie`.
- The `sourcePaint*` block (`ShaderLibrary.ts:2905-2955`), `sourcePaintDirectDetail` in the direct
  loop (`:3203`), and `materialRedPaintGate` (`:3061-3064`). AO stops affecting direct light;
  occlusion multiplies indirect diffuse and indirect specular (via specular occlusion) only.
- The procedural stripe specular (`horizonStripe`, `sideStripe`, `overheadStripe`) and
  `roughEnvironmentFloor` in all 4 families (`ShaderLibrary.ts:379-383, 972-976, 1502-1506, 2655-2672`),
  plus the `mix(1.1, 0.65, roughness)` env scale (`:2678`).
- The clearcoat floors `0.18` / `0.19 + …` (`:2756, 2798, 2973, 2997`), the `0.26` coat-normal blend
  (`:2969`) and `clearcoatNormalBoost` (`:2964, 2970`).
- The sheen `* 0.012 + pow(1−NdV,12)·0.18` (`:2765`) and env `pow(1−NdV,8)·mix(1.4,0.75,r)` (`:2804-2806`).
- The anisotropy `mix(1.0, 0.18, anisotropy)` on base direct and env specular (`:3081, 3208`), the
  clearcoat-roughness aniso NDF call (`:2766`) and the hard-coded env direction `vec3(0.42,0.78,0.46)` (`:2807`).
- The transmission blend `shaded*0.72 + refr` with `mix(0.08,0.58,energy)` (`:3138`), and
  `u_transmissionFallbackEnergy`, `u_transmissionParallaxStrength`, `u_transmissionBounceCount` and
  `u_transmissionCausticStrength` (uniforms that only exist for the fudge path; see `main.ts:62-65`
  of the Duck route).
- `a3dTexturedPbrWrapCoordinate` / `a3dTexturedPbrWrapUv` (`:2444-2457`) for non-atlas sampling.
- WGSL: `productPropBodyGate`, `productPropOrangeGate`, `productPropAlbedo`, `smoothedProductNormal`
  (`WebGPUDevice.ts:3555-3588, 3675-3691`), the constant `lightDirection` (`:3665`), the `2.25`
  direct multiplier (`:3765`), and uniform slot `data[170]` `u_productColorSmoothing` (`:2234`).

### 8.2 `bsdf_lobes_common` and `specular_ior`

```glsl
// PhysicalMaterial (C-02 brdf chunk, PRD 01) is the struct every lobe writes into. PRD 04 needs these fields on it;
// any field PRD 01's struct lacks is an additive request (Q-01-5), and until then lobes keep them in a PRD 04-local
// struct `A3DPrd04Lobes` declared in bsdf_lobes_common.glsl.ts:
//   float ior;
//   float clearcoat; float clearcoatRoughness; vec3 clearcoatNormal;
//   vec3  sheenColor; float sheenRoughness;
//   float iridescence; float iridescenceIOR; float iridescenceThickness; vec3 iridescenceFresnel; vec3 iridescenceF0;
//   float anisotropy; vec3 anisotropyT; vec3 anisotropyB; float alphaT;
//   float transmission; float thickness; float attenuationDistance; vec3 attenuationColor; float dispersion;

// [01] Geometric specular AA (three r185 lights_physical_fragment.glsl.js:6-11), ProgramFeatures.specularAntialiasing:
//   geometryRoughness = max3(max(abs(dFdx(Ngeo)), abs(dFdy(Ngeo)))); roughness = min(max(roughness, 0.0525) + geometryRoughness, 1.0)

// PRD 04 `ior` + `specular` lobes, hook fragment:material (r185 lights_physical_fragment.glsl.js:45):
// specularF90   = mix(specularIntensity, 1.0, metallic);
// specularColor = mix(min(pow2((ior - 1.0) / (ior + 1.0)) * specularColorFactor, vec3(1.0)) * specularIntensity,
//                     baseColor.rgb, metallic);
```

- **[01]** NDF/visibility: today's `ShaderChunks.ts:65-81` equal three's; the r185 `0.0525` floor replaces `max(r, 0.045)`.
- **[01]** DFG LUT: `u_dfgLut` is the r185 `DFGLUTData.js` table (16×16 RG16F) sampled at `vec2(roughness, NdotV)`.
  The existing Aura LUT (`BRDFLut.ts` `createExternalParityBrdfLut`, sampled at `vec2(nDotV, roughness)` in
  `ShaderLibrary.ts:397, 983`) uses the **transposed** axis order. Every PRD 04 lobe that reads the LUT calls `a3dDFG`
  from the brdf chunk and never samples `u_dfgLut` directly, so the axis order is decided in one place.
- **[01]** Direct multiscatter (r185 `BRDF_GGX_Multiscatter`, `lights_physical_pars_fragment.glsl.js:424-460`):
  ```glsl
  vec2 dfgV = texture(u_dfgLut, vec2(roughness, NdotV)).rg;
  vec2 dfgL = texture(u_dfgLut, vec2(roughness, NdotL)).rg;
  vec3 FssEssV = F0 * dfgV.x + F90 * dfgV.y;   vec3 FssEssL = F0 * dfgL.x + F90 * dfgL.y;
  float EmsV = 1.0 - (dfgV.x + dfgV.y);        float EmsL = 1.0 - (dfgL.x + dfgL.y);
  vec3 Favg = F0 + (1.0 - F0) * 0.047619;
  vec3 Fms  = FssEssV * FssEssL * Favg / (1.0 - EmsV * EmsL * Favg + EPSILON);
  specularDirect = BRDF_GGX(...) + Fms * EmsV * EmsL;
  ```
  IBL multiscatter uses r185 `computeMultiscattering` (single LUT fetch at NdotV).
- **[01]** Diffuse: r185 `BRDF_Lambert(diffuseColor)` direct; `diffuseColor · (1 − totalScatteringDielectric) · irradiance/π`
  indirect; Burley only as `ProgramFeatures.diffuseModel: "burley"`.
- **[02]** Specular occlusion: r185 `computeSpecularOcclusion(NdotV, ao, roughness) = saturate(pow(NdotV + ao, exp2(−16·roughness − 1)) − 1 + ao)`
  (`lights_physical_pars_fragment.glsl.js:651`) multiplies indirect specular; `ao` multiplies indirect diffuse. The IBL
  chunk is PRD 02's (request Q-02-1). PRD 04's lobes use the same factor for their own indirect terms (coat, sheen).
- The legacy `TexturedPBRMaterial.ts:460` default (`u_environmentBrdfLutEnabled = 0` when no LUT is passed) stays on the
  legacy path; generated programs bind `u_dfgLut` always (PRD 01).

### 8.3 `clearcoat`

- `clearcoatRoughness = min(max(factor · tex.g, 0.0525) + geometryRoughness, 1.0)`. `clearcoat = factor · tex.r`.
- The clearcoat normal is the **full** perturbed normal from `clearcoatNormalTexture` with
  `clearcoatNormalScale`, built on the geometry TBN (not on the base mapped normal). Without a coat
  normal texture, it is the geometry normal, per the glTF spec.
- The direct coat term is a GGX lobe with `F0 = 0.04`, `F90 = 1`. The indirect coat term samples the
  prefiltered env at `clearcoatRoughness`.
- Composition (r185 `meshphysical.glsl.js:210-212`):
  `Fcc = F_Schlick(0.04, 1.0, dot(Ncc, V)); out = out·(1 − clearcoat·Fcc) + clearcoat·(ccDirect + ccIndirect)`.
- The legacy scalar path's `mix(sampled, clearcoatSampled, clearcoat)` replacement of the base env
  specular (`ShaderLibraryCore.ts`, PRD 01 frozen) is not ported. The layering above is the only path in generated programs.

### 8.4 `sheen`

- Inputs (r185 `lights_physical_fragment.glsl.js:110-125`): `sheenColor = factor · tex.rgb` (sRGB-decoded),
  `sheenRoughness = clamp(factor, 0.0001, 1.0) · tex.a`. There is no 0.07 floor on the material value;
  the only floor is `sin2h ≥ 0.0078125` inside `D_Charlie`, which uses `alpha = sheenRoughness²`.
- Direct: `sheenDirect += irradiance · BRDF_Sheen(L, V, N, sheenColor, sheenRoughness)` where
  `BRDF_Sheen = sheenColor · D_Charlie(sheenRoughness, NdotH) · V_Neubelt(NdotV, NdotL)`. Then, before
  the base lobes are evaluated, `irradiance *= 1 − max3(sheenColor) · max(IBLSheenBRDF(N,V,r), IBLSheenBRDF(N,L,r))`
  (r185 `RE_Direct_Physical`, `:542-553`).
- Indirect: `sheenIndirect += irradiance · sheenColor · IBLSheenBRDF(N, V, sheenRoughness) / π`, using the
  r185 analytic fit (`IBLSheenBRDF`, `:361-375`, Estevez–Kulla) on every tier. Indirect diffuse and
  indirect specular are both scaled by `1 − max3(sheenColor) · IBLSheenBRDF(N, V, r)` (`:631-637`).
- Composition: `out += sheenDirect + sheenIndirect` (r185 `meshphysical.glsl.js:202`), before the clearcoat layering.
- The skinned family gets the same function (E26 fixed by unification).

### 8.5 `anisotropy`

- Direction (r185 `lights_physical_fragment.glsl.js:128-158`): the CPU passes
  `anisotropyVector = strength · (cos rotation, sin rotation)`. With a map,
  `anisotropyV = mat2(av.x, av.y, −av.y, av.x) · normalize(tex.rg·2 − 1) · tex.b`; without one,
  `anisotropyV = anisotropyVector`. Then `anisotropy = length(anisotropyV)`; if 0, `anisotropyV = (1,0)`,
  else `anisotropyV /= anisotropy; anisotropy = saturate(anisotropy)`.
  `T = tbn[0]·anisotropyV.x + tbn[1]·anisotropyV.y` and `B = tbn[1]·anisotropyV.x − tbn[0]·anisotropyV.y`.
- `alphaT = mix(alpha², 1.0, anisotropy²)` with `alphaB = alpha²` (r185).
  Use `D_GGX_Anisotropic` and `V_GGX_SmithCorrelated_Anisotropic`. This lobe **replaces** the isotropic
  lobe when the feature is compiled. It is not added on top, and base specular is not scaled.
- IBL (r185 `envmap_physical_pars_fragment.glsl.js:52-56`): bent normal
  `bent = normalize(cross(cross(B, V), B)); bent = normalize(mix(bent, N, pow4(1 − anisotropy·(1 − roughness))))`.
  Sample the prefiltered env along `reflect(−V, bent)`.
- The scalar-primitive anisotropy that used a fixed world-XY frame (`ShaderChunks.ts:341-359, 440-460`) is
  deleted. Primitives without UV tangents use the derivative tangent frame.

### 8.6 `iridescence`

- Thickness is `mix(thicknessMin, thicknessMax, tex.g)` and the factor is `factor · tex.r`. The
  existing two-interface Airy evaluation (`ShaderLibrary.ts:2697-2717`) is replaced by r185
  `evalIridescence(1.0, iridescenceIOR, NdotV, thickness, F0)`, which uses the spectral Fourier
  evaluation, not 3 fixed wavelengths.
- Usage: `F = mix(F_Schlick, iridescenceFresnel, iridescence)` in the direct lobe (r185 `BRDF_GGX`,
  `lights_physical_pars_fragment.glsl.js:172`). r185 evaluates the film twice, once against the
  dielectric F0 and once against the metal F0 (`iridescenceFresnelDielectric` / `iridescenceFresnelMetallic`),
  and IBL calls `computeMultiscatteringIridescence` for each before mixing by metalness (`:604-605`);
  Aura ports that split as-is. This replaces the additive `(filmF − schlickF)` lobe, which
  could subtract energy.
- Skinned, instanced and scalar draws reach the same chunk through the generator. The legacy `0.0` placeholder at
  `ShaderLibrary.ts:3031` is not ported.

### 8.7 `transmission` + `volume` + `dispersion`

```glsl
#ifdef A3D_TRANSMISSION
uniform sampler2D u_transmissionSampler;   // TransmissionRenderTarget, linear HDR, mipmapped
uniform vec2  u_transmissionSamplerSize;
vec3 a3dVolumeTransmissionRay(vec3 n, vec3 v, float thickness, float ior, mat4 model) {
  vec3 dir = refract(-v, normalize(n), 1.0 / ior);
  vec3 modelScale = vec3(length(model[0].xyz), length(model[1].xyz), length(model[2].xyz));
  return normalize(dir) * thickness * modelScale;
}
float a3dApplyIorToRoughness(float r, float ior) { return r * clamp(ior * 2.0 - 2.0, 0.0, 1.0); }
vec4 a3dTransmissionSample(vec2 uv, float r, float ior) {
  float lod = log2(u_transmissionSamplerSize.x) * a3dApplyIorToRoughness(r, ior);
  return textureLod(u_transmissionSampler, uv, lod);           // r185 always uses textureBicubic; Aura: bicubic on High/Ultra, bilinear on Medium (documented deviation, judged in 05-transmission)
}
vec3 a3dVolumeAttenuation(float dist, vec3 color, float attDist) {
  if (isinf(attDist)) return vec3(1.0);
  return exp(-(-log(color) / attDist) * dist);
}
#endif
```

- Dispersion (`A3D_DISPERSION`): `halfSpread = (ior − 1)·0.025·dispersion`, with
  `iors = vec3(ior − halfSpread, ior, ior + halfSpread)`. Trace 3 refraction rays and take one
  channel from each sample (r185 `getIBLVolumeRefraction`).
- Composition (r185 `transmission_pars_fragment.glsl.js:200-232`, `transmission_fragment.glsl.js`):
  `transmittance = diffuseColor · volumeAttenuation(length(ray), attenuationColor, attenuationDistance)`;
  `F = EnvironmentBRDF(n, v, specularColor, specularF90, roughness)`;
  `transmitted = vec4((1 − F) · transmittance · sample.rgb, 1 − (1 − sample.a) · avg(transmittance))`;
  `totalDiffuse = mix(totalDiffuse, transmitted.rgb, transmission)`. Specular is unaffected. The
  thickness map uses channel G and the transmission map channel R, as in r185.
- Low-tier fallback (`A3D_TRANSMISSION_ENV`): sample the prefiltered env along the refracted ray at
  `applyIorToRoughness` LOD with the same attenuation. Black output is impossible because the env
  always exists (C-09 `EnvironmentProbeFactory.neutral(tier)`; with the C-09 stub the legacy environment texture is
  used, and if no environment is bound at all the `ambient` fallback of R4 applies).
- `KHR_materials_diffuse_transmission`: keep the current base-colour lerp approximation, but rename
  its status to `approximate` in the support matrix. A real back-lit implementation is out of scope.

### 8.8 `tangent_frame` and normals

- VS (ShaderFeature `prd04.tangentFrame`, hook `vertex:world`, ordered after the C-18 `vertex:deform` hook; identity under the C-18 stub):
  `v_tangent = vec4(normalize(mat3(skinnedModel) * a_tangent.xyz), a_tangent.w)`, where
  `skinnedModel = u_model · instanceMatrix · skinMatrix` as applicable (skin matrix from PRD 06's deform chunk, C-18).
  The legacy shaders' `mat3(u_normalMatrix)` at `ShaderLibrary.ts:602, 1132, 2112, 2118` is PRD 01's (Q-01-4).
- FS: `N = normalize(v_normal)`, then `T = normalize(v_tangent.xyz − N·dot(N, v_tangent.xyz))`, then
  `B = cross(N, T)·v_tangent.w`. With `A3D_TANGENT_DERIVATIVE`, build the frame with r185
  `getTangentFrame(−vViewPosition, N, uv)` from `dFdx/dFdy` of position and uv.
- Double-sided: flip N, T and B when `!gl_FrontFacing` (existing behaviour, extended to T/B).

### 8.9 `uv_transform`

- Per slot, `uniform mat3 u_<slot>UvTransform;` plus `uniform int u_<slot>TexCoord;`. Each is
  computed in the FS as `vec2 uv = (u_xUvTransform · vec3(texCoord == 1 ? v_uv1 : v_uv0, 1.0)).xy;`.
  The FS is used rather than the VS to stay under `MAX_VARYING_VECTORS` (15 on WebGL2) when many slots
  are active.
- The CPU builds the matrix per the glTF spec, `T · R · S` with `R = [[c, s], [−s, c]]` (see R7). For
  uniform scale this is numerically identical to three's
  `Matrix3.setUvTransform(offset.x, offset.y, scale.x, scale.y, rotation, 0, 0)`; for non-uniform scale with
  rotation it intentionally differs (three applies `S · R`).
- Texture lookups use `texture(sampler, uv)`, so wrapping is done by the hardware sampler. Only
  `A3D_PBR_EXTENSION_ATLAS` keeps manual wrap, and it uses `textureGrad(atlas, wrapped, dFdx(uv), dFdy(uv))`.

### 8.10 Lighting loop (consumed, C-02/C-10)

The light loop and its `ProgramFeatures.lights.clustered` bit belong to PRD 01/02. PRD 04's requirement is an
invariant, tested in `tests/unit/contracts/impl/prd04-lobes.test.ts`: `programFeatures()` cannot express the light
fields (C-03 omits them), and no PRD 04 `ShaderFeature` emits a define that caps or disables lights. For every program
the generator builds, `lights.clustered` is true whenever the frame has more than 16 lights, independent of which
lobes are active. On the legacy path, the textured variants' `A3D_PBR_DISABLE_CLUSTERED_LIGHTING` (E8) is PRD 01's
(request Q-01-3).

### 8.11 Alpha (`alpha_a2c`, ShaderFeature `prd04.alphaToCoverage`, hook `fragment:alpha`)

- MASK + A2C (r185 `alphatest_fragment.glsl.js`): `a = smoothstep(cutoff, cutoff + fwidth(a), a); if (a == 0.0) discard;`.
  Selected when `alphaMode === "mask" && alphaToCoverage && tier.msaaSamples > 0`. The material requests
  `RenderCommandState.alphaToCoverage: true` (C-04).
- MASK without MSAA: `if (a < cutoff) discard;`.

### 8.12 WGSL

The `physical-wgsl` modules mirror 8.2–8.11 one-to-one:
- `textureSampleLevel` for LOD.
- `dpdx/dpdy` for geometry roughness and the derivative frame.
- Per-slot `mat3x3<f32>` in a material uniform struct.
- Light data from PRD 11's WebGPU light/cluster path (C-29 real).

Validation: standalone, every twin is parsed by `tools/wgsl-validate` (PRD 11) when present, otherwise by
`GPUDevice.createShaderModule(...).getCompilationInfo()` in Chromium on macos-14 (skipped with a recorded reason when
the runner exposes no WebGPU adapter). Numeric parity on WebGPU draws is integrated (C-29 real). Until then
`backend: "webgpu"` keeps PRD 11's current code, and PRD 04 reports `webgpu-material-approximate`.

---

## 9. Rendering changes

Every rendering change reaches the frame through a contract seam; PRD 04 edits no PRD 01/02/05/06/11 file.

1. **Frame graph (C-01).** `prd04.transmission` registers for phase `transmission` (flag `A3D_QR_MATERIALS_TRANSMISSION`):
   - `collect`-free; `passes("transmission", ctx)` returns one copy-and-mip pass when any `ctx.items` entry's material
     reports the `transmission` lobe, else `[]`.
   - Reads `aura.scene.color`; writes the lane resource `prd04.transmission.color` (namespaced, so no RenderGraph
     write conflict). Publishes the target on `ctx.blackboard.set("prd04.transmissionTarget", target)`.
   - Target format: RGBA16F when `ctx.device.probe?.halfFloatColorBuffer` (C-28), else RGBA8 with issue
     `transmission-ldr-capture`. Scale: 0.5 on Medium, 1 on High/Ultra, none on Low (C-27 tier).
   - No readback (C-28 `readbacks` must stay 0).
   - Final pass order (opaque + MASK → capture → transmissive back-to-front with depth write and shadow receive →
     BLEND → post → output) is the integrated order, active when C-01 is real (ForwardPass split) plus a transmissive
     queue after the `transmission` phase (non-blocking request Q-01-6). Against the C-01 stub the lane registers its
     `transmission` contributor and proves capture + back-to-front ordering in its own lane scenes (standalone). Transmissive objects do not see each other (matches r185).
2. **Programs (C-02/C-03).** Lobes, the transmission sampler binding, UV transforms, tangent frame, A2C and debug views
   are registered ShaderFeatures/lobes. The 10 named `DEFAULT_TEXTURED_PBR_*_VARIANT` constants stay in PRD 01's legacy
   library; generated programs ignore them.
3. **Render state (C-04).** Materials request `alphaToCoverage`; PRD 01 applies it.
4. **Samplers.** GLB textures keep `GLTFRenderResources.ts` `createSampler` (:2196) behaviour plus tier anisotropy.
   Primitive, SDF-text and procedural textures use `Sampler.trilinear({ wrap })`. Device mapping is unchanged
   (`WebGL2Device.ts:4139-4159`, PRD 02 after the `webgl2/Samplers.ts` carve). The default environment's sampler bug
   (`ExternalParityRenderPreset.ts:169`) belongs to PRD 02 (C-09).
5. **Texture upload (seam).** `applyTextureBudget` (R16) is called by PRD 06's `webgl2/TextureUpload.ts` for every
   upload. KTX2 textures drop top levels instead of resampling.
6. **Compressed formats (C-16).** sRGB internal formats (ASTC `0x93D0`, BPTC sRGB `0x8E8D`, ETC2 sRGB8_ALPHA8
   `0x9279`, S3TC sRGB DXT5 `0x8C4F`) and extension probing are PRD 05's `webgl2/TextureFormats.ts`. PRD 04 supplies the
   per-image colour-space intent.
7. **Diagnostics (C-31).** `production-runtime/actor/materialDiagnostics.ts` registers section key `"materials"`
   returning `AuraMaterialDiagnostics` from observed state only.

---

## 10. Migration plan

Each step merges to main behind `A3D_QR_MATERIALS` (or a sub-flag) with flag-off pixel identity (CONTRACTS §6.1). Route
and template edits are executed by their owners (PRD 14, PRD 13) from PRD 04's codemods and reports (CONTRACTS §0 R20/R21).

1. **Observability first.** Authored-material snapshot in `TypedGLBActor`, `inspectMaterials()`, the `materials`
   diagnostics section and the C-37 `materials` handle member. No pixel change with the flag on or off.
2. **Tint semantics (R1), flag-gated.** `compiler/modelMaterials.ts` lowers `node.material` through
   `lowerModelMaterialOverrides` when the flag is on; flag off keeps the stub (`setTint` with
   `replaceSurfaceTextures: true`). Before any route opts in, PRD 04 publishes
   `evidence/prd-04/tint-migration.md`: one row per call site with path:line, asset key, recommended decision and reason:
   - (a) drop `color` because the authored textures are the intent;
   - (b) keep `color` as a multiply (team or variant colour);
   - (c) `materialOverrides: [{ color, replaceTextures: true }]` only where an untextured flat look is the explicit art
     direction, with a comment naming the reason.

   The site list comes from `aura3d codemod prd04-model-tint-report 'apps/*/src/**/*.ts' --report` (C-39, pure AST
   transform, multiline-safe, follows identifiers such as siege-golf's `paintedTimberMaterial` `main.ts:64-70` used at
   `:329` to their definition). The earlier `rg -U` command over-matched (39 raw matches vs 26 nodes in research/03 §9);
   the codemod row count is recorded instead. Sites: courier-rush `main.ts:386-398`, `city.ts:700-715`; gravity-post
   `main.ts:492-499`; siege-golf `main.ts:64-70, 329`; deep-recovery (6 calls); skyline-runner (3 calls); aurora-lander,
   neon-swarm, patrol-wing, turbo-drift-circuit, pulse-tunnel (art-review calls); data-galaxy, material-asset-inspector,
   product-configurator, webgpu-particle-lab, asset-audition. PRD 14 applies decisions for `apps/showcase-*`;
   PRD 15 for the `apps/` default sites (request Q-15-3).
3. **Aura Clash.** PRD 14 replaces the `material.setParameter` pokes (`AuraClashArenaApp.ts:3371-3415`, hit flash
   `3441-3473`) with `actor.setMaterialOverrides([...])` (target functions for `ranger` / `regular|superhero` / `hair`;
   hit flash = an extra entry pushed and popped). PRD 04 attaches the exact patch to request Q-14-2 and records in
   `tint-migration.md` whether the fighter GLBs carry baseColor textures (`aura3d assets inspect`).
4. **PRD 04-owned hack removal.** Duck route clamp (`apps/wow-webgpu-product-viewer/src/main.ts:51-67`; declared
   correctness fix, the route's captures are re-baselined and old evidence marked superseded, not "regressed"), E23,
   `/joint/i`, tint defaults. Legacy-shader and WGSL hacks: requests Q-01-1, Q-11-1.
5. **Physical lobes (R3/R4)** register behind `A3D_QR_MATERIALS`; visible when `A3D_QR_CORE=v2` routes draws through
   the generator. Flag lifecycle per CONTRACTS §5.3: `dev` → `standalone-accepted` (§16.1 passes) →
   `integrated-accepted` (§16.2 at a G-PANEL) → `default-on` after two clean checkpoints → off path removed (§5.4).
6. **Presets (R15).** `nodes/material.ts` marker + compiler resolution, same PR as the codemod
   `pin-emissive-defaults` (C-39 name `pin-emissive-defaults`, implementation `tools/codemods/pin-emissive-defaults.mjs`):
   adds `emissiveIntensity: 1.35` to `material.emissive(...)` calls and to material object literals that set `emissive`
   without `emissiveIntensity` (those also hit the `?? 1.35` fallbacks at `index.ts:14391, 14896, 14912`), and `2.8` to
   `material.neon(...)` calls without one. PRD 14 runs it per route when the route opts into the flag; its report rows
   and `git diff --stat` are attached to the route PR.
7. **glTF glass rewrite (E22)** skipped per draw only where the draw has a transmission path (R4).
8. **Support matrix regeneration (R17)** after the conformance suite runs.
9. **E34 deletion**: PRD 04 deletes its own (`production-runtime/materials/*`, `materials/TransmissionPass.ts`) after
   `rg` shows zero imports; the others are requests (Q-01-7, Q-11-2, Q-05-3).

---

## 11. Backward compatibility

| Change | Break? | Compatibility path |
|---|---|---|
| `model({material:{color}})` multiplies instead of flattening | **Visual change, flag-gated.** Flag off: identical to today. Flag on: multiply | `materialOverrides: [{ color, replaceTextures: true }]` reproduces the flat look, but **not** the auto-glow (deliberately not reproducible without explicit `emissive`). While the flag is `standalone-accepted`/`integrated-accepted`, a one-time console note per app: `aura3d: model material color multiplies authored textures under A3D_QR_MATERIALS; pass materialOverrides [{color, replaceTextures:true}] for the legacy flatten` |
| `material.pbr()` colour on models | Flag-gated | Primitives keep `#d7dee8` (the preset object is unchanged); only the model bridge ignores the preset-defaulted colour |
| `material.emissive/neon/glass/metal` defaults | Flag-gated visual change | Preset objects unchanged; new defaults resolved in the compiler under the flag. The codemod (§10.6) pins old values per route |
| `Sampler` constructor defaults | **No change** | Defaults stay `linear`/clamp/aniso 1 for low-level users. Only engine call sites switch to `Sampler.trilinear`, under the flag |
| `TypedGLBActorTintOptions` / `setTint` | Deprecated | Kept as the C-15 stub path; mapped to `setMaterialOverrides([{ baseColorReplace, replaceTextures: true }])` under the flag. Removed in the next major version |
| `textureAnisotropy` | Deprecated alias | Maps to `sampling.anisotropy` |
| Named textured variants | Unchanged (PRD 01 legacy) | Generated programs do not use them |
| KTX2 options | None in PRD 04 | C-16 (PRD 05) owns the transcoder option changes |
| Extension support matrix statuses | Strings change | `"runtime-supported"` maps to `"conformant"` only where the conformance test passes |
| Fake stubs deleted | Exports removed | PRD 15 removes re-exports from `packages/rendering/src/index.ts` (Q-15-4); listed in the CHANGELOG |
| Light evaluation on extension materials | Visual change (more lights) on generated programs, and on legacy once Q-01-3 lands | None needed; correctness fix |
| `GLTFRenderResources` default material | Flag-gated | Flag off keeps `[0.76,0.74,0.72]`, metallic 0, roughness 0.85 (`:1660-1666`); flag on uses glTF spec defaults |

---

## 12. Contracts consumed / provided, and dependencies

The earlier "depends on PRD X" table is replaced by contracts. PRD 04 builds against each consumed contract's PR 0a stub
and never waits for the provider's real implementation. What a stub can and cannot show decides whether a criterion
is standalone (§16.1) or integrated (§16.2).

### 12.1 Contracts provided

| ID | Surface PRD 04 provides | Stub that must keep working (PR 0a, CONTRACTS) | Real (PRD 04) | Consumers |
|---|---|---|---|---|
| C-03 | MaterialFeature lobe registry: `registerMaterialLobe`, `materialLobes`, `ProgramFeatureSource` on material classes | Registry real; lobes have no render effect until C-02 is real; `materials.paths.materialModel = "legacy"` | `shaders/physical/*.glsl.ts`, `materials/PhysicalMaterial.ts`, `materials/lobes.ts`, `tests/reports/material-conformance.json` | 01, 06, 07, 10, 13 |
| C-15 | `AuraMaterialSpec` additions, `AuraModelMaterialOverride`, `AuraModelMaterialHandle`, `AuraResolvedMaterialInfo`, `AuraRendererMaterialOptions`, `AuraMaterialDiagnostics` | `materialOverrides` lowers to `setTint` for `color` only, other fields listed in `DIAGNOSTIC_ONLY_FIELDS` (owner 4); `inspectMaterials` returns names + `featureKey: "legacy"` | `ModelMaterialOverrides.ts`, `actor/TypedGLBActorMaterials.ts`, `compiler/modelMaterials.ts` | 09, 10, 13, 14 |

Registry entries PRD 04 provides into other contracts: C-01 contributor `prd04.transmission`; C-02 chunks `a3d_prd04_*`
and features `prd04.*`; C-31 section `materials`; C-37 member `materials`; C-39 codemods `pin-emissive-defaults`,
`prd04-model-tint-report`; C-30 scenes `prd04-*`; C-40 facts `F-04-*`; seam host `applyTextureBudget` (CONTRACTS §3.4,
identity stub in `textures/TextureBudget.ts`). Generated file: `GLTF_EXTENSION_SUPPORT_MATRIX` (CONTRACTS §4.3).

Both conformance suites (`tests/unit/contracts/C-03-material-lobes.test.ts`, `C-15-materials.test.ts`,
`tests/browser/contracts/C-03-lobes-compile.spec.ts`, `C-15-override.spec.ts`) are PRD 15-owned and must pass for
`stub` and `real`. PRD 04 adds `tests/unit/contracts/impl/prd04-{lobes,overrides}.test.ts`.

### 12.2 Contracts consumed

| ID | What PRD 04 uses | Day-0 stub behaviour PRD 04 relies on | Becomes real in | Effect on acceptance |
|---|---|---|---|---|
| C-01 | `transmission` phase, `FRAME_RESOURCES.sceneColor`, blackboard | Phase runs after the single ForwardPass | PRD 01 | capture standalone; correct refraction order integrated |
| C-02 | `ProgramFeatures`, `registerShaderChunk/Feature`, `ProgramCache`, `brdf` chunk, `u_dfgLut`, `ChunkHarness` | Registries real; `generateProgram` throws `PROGRAM_GENERATOR_PENDING`; cache wraps `ShaderLibrary` | PRD 01 (`A3D_QR_CORE=v2`) | lobe numerics standalone in ChunkHarness; lobe pixels integrated |
| C-04 | `RenderCommandState.alphaToCoverage` | Ignored by `WebGL2Device` | PRD 01 | A2C integrated |
| C-05 | single output transform for unlit and lit | Legacy present shader | PRD 01 | unlit-vs-lit consistency integrated |
| C-09 | `EnvironmentProbe` for lobe IBL; `neutral(tier)` for the env-refraction fallback | Legacy environment | PRD 02 | IBL-correct lobes integrated |
| C-11 | shadow receive on transmissive surfaces | Legacy shadow lookup | PRD 02 | integrated |
| C-12 | `AuraTextureSampling`, `resolveSamplerAnisotropy` (R9 table), `resolveLightingSamplerBudget` | Anisotropy table real (pure); budget returns `{ droppedFeatures: [] }`; device mapping unchanged | PRD 02 | anisotropy standalone; sampler budget integrated |
| C-16 | `selectKTX2TargetFormat`, `AssetDecoderRegistry`, sRGB formats | Target table real (pure); registry wraps `GLTFCompressionDecoders.ts`; format function verbatim | PRD 05 | Draco/Meshopt load standalone; KTX2 sRGB ΔE integrated |
| C-18 | skinning/morph deform chunk order before `prd04.tangentFrame` | Registry real | PRD 06 | skinned lobes integrated |
| C-27 | `QUALITY_TIERS` (`maxTextureSize`, `textureBudgetBytes`, `anisotropy`, `msaaSamples`), `app.quality` | Ships real (data); `"auto"` → high desktop / medium coarse pointer | PRD 11 | standalone (the hard-build dependency on PRD 11 in the conflict map is resolved by the real PR 0a data) |
| C-28 | `probe.halfFloatColorBuffer`, `counters()`, `compileAsync` | Probe partial; counters partial; sync compile | PRD 11 | standalone (readbacks = 0, textureBytes) |
| C-29 | WebGPU backend | Today's backend selection | PRD 11 | WGSL parity integrated |
| C-30 | lane scene indices, `<owner>-<slug>` ids, `ReadyPayloadV2.qrFlags` | Registry wraps the 18 scenes + lane indices | PRD 12 | standalone (own scenes) |
| C-31 | `registerDiagnosticsSection("materials")` | Section present with null/empty values | PRD 12 schema | standalone |
| C-32 / C-33 | judgement schema, capture `--flags` | Today's capture scripts + `--flags` passthrough | PRD 12 | standalone screening; acceptance only at G-PANEL |
| C-36 | `SceneCompileContext.flags/quality`, degradations, `DIAGNOSTIC_ONLY_FIELDS`, `registerOptionCoverage` | Wraps the moved legacy compiler | PRD 15 | standalone |
| C-37 | `registerNodeHandleExtension("materials")` | Extension stubs present | PRD 15 | standalone |
| C-38 | renderer options pre-declared | Real in PR 0 | PRD 15 | standalone |
| C-39 | `registerCodemod`, `registerCliCommand` | Real in PR 0 | PRD 15 | standalone |
| C-40 | facts F-04-* for PRD 13 | n/a | — | — |

Resolved conflicts from CONTRACTS §0 that changed this PRD: R3 (no `PhysicalProgramCache`), R4 (DFG LUT is PRD 01's),
R6 (KTX2 target selection is PRD 05's 4-arg version), R9 (anisotropy L4/M8/H16/U16 frozen), R12 (PRD 04 owns
`alphaMode/alphaCutoff` semantics), R21 (routes are PRD 14's; PRD 04 ships codemods/reports).

### 12.3 Requests to other lanes (non-blocking)

Filed as `qr-request` + `to:prdNN` issues (CONTRACTS §6.5). PRD 04 never waits: each item names what PRD 04 does in the
meantime and which criterion moves to the next checkpoint after it lands.

| ID | To | File / change | Contract | Meanwhile |
|---|---|---|---|---|
| Q-01-1 | 01 | Legacy patch: multiply `sourcePaintMaterialGate`, `materialRedPaintGate` (`ShaderLibrary.ts:2905-2955, 3061-3064, 3203`) and the stripe/floor terms (`:379-383, 972-976, 1502-1506, 2655-2678`) by `(1.0 - u_a3dPrd04HackFree)`; PRD 04 material classes set the uniform to 1 only with `A3D_QR_MATERIALS` on, so flag-off pixels are unchanged | §3.7 | legacy textured materials keep the red gate under the flag; recorded in `inspectMaterials().warnings` |
| Q-01-2 | 01 | Legacy patch: `a3dTexturedPbrWrapCoordinate` (`ShaderLibrary.ts:2444`) adds `if (mode > 2.5) return value;`; PRD 04's `TexturedPBRMaterial.samplerWrapMode` emits `3.0` for hardware-wrapped non-atlas slots with the flag on | §3.7, C-12 | seam metric integrated (§16.2) |
| Q-01-3 | 01 | Remove `A3D_PBR_DISABLE_CLUSTERED_LIGHTING` from the 10 textured variants (`ShaderLibrary.ts:2066-2075`), declared correctness fix (CONTRACTS §6.1), PRD 12 re-baselines | §3.7 | `lightsDroppedByMaterial` reported, gated only at integrated checkpoints |
| Q-01-4 | 01 | Legacy tangent transform by `mat3(u_model)` instead of `u_normalMatrix` (`ShaderLibrary.ts:602, 1132, 2112, 2118`) | §3.7 | generated `tangent_frame` only |
| Q-01-5 | 01 | `brdf` chunk per r185 (DFG LUT `DFGLUTData.js` byte-identical in `BRDFLut.ts`, axis `(roughness, NdotV)`, multiscatter, spec-AA, Lambert) and `PhysicalMaterial` fields of §8.2; PRD 04 attaches `tests/qr/prd04/oracles/physical-bsdf-reference.ts`, the r185 golden JSON and a byte-identity test for the LUT | C-02 | lobes tested against `tests/qr/prd04/shims/brdf_r185.glsl.ts` |
| Q-01-6 | 01 | ForwardPass: copy `material.renderState.alphaToCoverage` into `RenderCommandState`; transmissive queue drawn after the C-01 `transmission` phase in the split ForwardPass | C-01, C-04 | A2C and refraction order integrated |
| Q-01-7 → [#769] | 01 | Delete `production-runtime/shaders/chunks/{brdf,ibl,pbr.frag,pbr.vert,shadows}.glsl` (E34) once unimported | — | — |
| Q-02-1 | 02 | IBL chunk applies r185 `computeSpecularOcclusion` with the material `ao`; transmissive surfaces receive shadows (C-11); env sampler fix `ExternalParityRenderPreset.ts:169` | C-09, C-11 | integrated |
| Q-05-1 | 05 | Vendor r185 `examples/jsm/libs/mikktspace.module.js` (MIT header) into `packages/assets/vendor/mikktspace/`, add to `LICENSE-THIRD-PARTY` | C-16 | runtime keeps `generateMeshTangents`; unit tests load from `node_modules/three` |
| Q-05-2 | 05 | Honour the per-image `colorSpace` intent PRD 04 passes to `gltf/ImageDecode.ts`/transcoder; encode fixtures (UASTC-all-maps DamagedHelmet KTX2, Draco, Meshopt) with pinned encoders | C-16, C-17 | PRD 04 lane CI encodes once with a pinned external encoder, commits to `fixtures/asset-corpus/`, records command + version in `provenance` |
| Q-05-3 → [#772] | 05 | Replace the `loaders/KTX2Loader.ts` stub with a real re-export (E34) | C-16 | — |
| Q-06-1 | 06 | Confirm `applyTextureBudget` call in `webgl2/TextureUpload.ts` (PR 0b-2) and the deform chunk order before `prd04.tangentFrame`; review scenes 08/15 | C-18 | — |
| Q-11-1 | 11 | Delete `productPropBodyGate/OrangeGate/Albedo`, `smoothedProductNormal`, fixed `lightDirection`, `2.25`, `data[170]` (`WebGPUDevice.ts:3555-3588, 3665, 3675-3691, 3765, 2234`) | C-29 | gates already inert once PRD 04 deletes the Duck route write (E39) |
| Q-11-2 → [#771] | 11 | Delete `production-runtime/shaders/wgsl/pbr.wgsl` stub (E34); WGSL generator target consumes `ShaderChunk.wgsl` twins | C-02, C-29 | — |
| Q-12-1 | 12 | Add the new `fixtures/asset-corpus/` LFS paths to `benchmarks/quality-rebuild/ci.sh`; material rubric prompt lines for §16.2 criteria | C-30, C-32 | lane workflow pulls LFS itself |
| Q-13-1 | 13 | Remove the "procedural texture … has no rasterizer" generated-code warning (`index.ts:18262-18269`) when the C-15 real path is active; skills from facts F-04-*; no template passes `replaceTextures: true` | C-34, C-40 | — |
| Q-14-1 | 14 | Per-route: apply §10.2 decisions, run `pin-emissive-defaults`, opt into `A3D_QR_MATERIALS` | R21 | standalone acceptance uses lane scenes, not routes |
| Q-14-2 | 14 | Aura Clash override migration (patch attached) | C-15 | — |
| Q-15-1 | 15 | `model()` (`index.ts:2098-2123`) forwards `materialOverrides` and `variant`; `AuraModelNode` (`:1484`) declares them | C-15 | runtime `handle.materials.setMaterialOverrides/setMaterialVariant` |
| Q-15-2 | 15 | `createProductionPrimitiveMaterial` (`index.ts:14877`) calls `resolveMaterialSpecDefaults(spec, flags)` and uses it for the `:14896`/`:14912` fallbacks | C-36 | primitive emissive defaults unchanged until it lands |
| Q-15-3 | 15 | Apply §10.2 decisions in `apps/` default sites (data-galaxy, material-asset-inspector, product-configurator, asset-audition) | R21 | — |
| Q-15-4 → [#774] | 15 | Remove E34 re-exports from `packages/rendering/src/index.ts`; decide `@aura3d/materials` fate | — | — |
| CCR-04-1 | 15 + consumer | `AuraProceduralTextureSpec.seed?: number`; `@deprecated` JSDoc on `textureAnisotropy` | C-15 | seed hashed from params |
| CCR-04-2 | 15 + consumer | `AuraMaterialDiagnostics` numeric fields that can be unmeasurable become `number \| null` | C-15, C-31 | issue `material-program-pending` |

| QR-04-01 → [#770] | 01 | `aura.scene.color` producer for the transmission phase reads edge (`Transmission.ts` currently reads `aura.scene.color.opaque`/`color` by graph flavor) | C-01 | reads edge declared on the produced resource names |
| QR-04-02 → [#775] | 15 | `createAuraApp`/`model()` forwards `renderer.transmission` to `setTypedGLBActorQrTransmissionMode` (`TypedGLBActor.ts:222-238`) | C-36 | harnesses set the mode directly; flag-on reachability via dev-server URL until it lands |
| QR-04-03 → [#776] | 15 | `model()` forwards `textureBudgetBytes`/`maxTextureSize`/decoders/variant/tangents into `TypedGLBActor` options | C-27 | harnesses pass options on the pipeline directly (prd04-assets.ts URL params) |
| QR-04-04 → [#777] | 05 | CI-0 typecheck breaker `tests/qr/prd05/route-bundle-no-asset-metadata.test.ts:48` (TS2339) | — | lane typecheck scoped to lane tsconfig; repo gate unchanged |
| QR-04-05 → [#778] | 12 | CI-0 typecheck breaker `tests/unit/contracts/impl/prd12-variants.test.ts:73` (TS18048) | — | same |
| QR-04-06 → [#779] | 15 | CI-0 typecheck breakers `tests/browser/production-runtime-production-scene-tools.ts:151`, `route-cue-maps.test.ts:21-28`, `tests/unit/tools/*` | — | same |
| QR-04-07 → [#773] | 05 | MikkTSpace vendored module as a lazy chunk; install `setMikkTSpaceModule`/`setMikkTSpaceWorkerFactory` on demand | C-16 | `generateMeshTangents` fallback stays; T0-18(f) timeouts added |

PRD 09 consumes C-15 for game kits and needs no request.

### 12.4 Third-party code

Vendored only from the installed three r185 package (`node_modules/three@0.185.1`), copied with its license file,
served from the app origin, and lazy-loaded. No new npm dependency and no CDN URL at runtime. The vendor directory is
PRD 05's (`packages/assets/vendor/`); PRD 04 consumes the files.

| Library | Source in r185 | Used by | Vendored by | License (verify the copied LICENSE at vendoring) |
|---|---|---|---|---|
| MikkTSpace | `examples/jsm/libs/mikktspace.module.js` | R8 | PRD 05 (Q-05-1) | MIT (npm `mikktspace` build of the zlib-licensed reference) |
| Basis Universal transcoder | `examples/jsm/libs/basis/basis_transcoder.{js,wasm}` | R9 | PRD 05 (C-16) | Apache-2.0 |
| Draco decoder | `examples/jsm/libs/draco/draco_{decoder.wasm,wasm_wrapper.js}` | R10 | PRD 05 (C-16) | Apache-2.0 |
| meshoptimizer decoder | `examples/jsm/libs/meshopt_decoder.module.js` | R10 | PRD 05 (C-16) | MIT |
| DFG LUT data | `src/renderers/shaders/DFGLUTData.js` | R3 | PRD 01 (Q-01-5) | MIT (three.js) |

`three` stays a dev dependency (it already is); PRD 04 uses it only in tests (`Matrix3.setUvTransform`,
`computeMikkTSpaceTangents`, r185 `ShaderChunk` golden generation) and the benchmark's three side.

---

## Parallel execution

### Day-0 start conditions

PRD 04 starts on 2026-10-05 from the PR 0a branch (CONTRACTS §3.9). The only prerequisites are PR 0a artifacts:
`packages/rendering/src/contracts/{core,program,materialLobes,blend,sampling,quality,device,frameGraph,textureFormats}.ts`,
`packages/engine/src/contracts/{flags,materials,diagnostics,compiler,runtimeNodes,app}.ts`, `packages/assets/src/contracts/decoders.ts`,
the C-15 pre-declared fields, the lane barrels `src/lanes/prd04.ts`, `compiler/diagnosticOnly.prd04.ts`,
`benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd04/index.ts`, `packages/aura3d-cli/src/commands/prd04/index.ts`,
`ChunkHarness.ts`, and the conformance harness. Nothing from any other lane's real implementation is needed.

Work in new PRD 04 files starts on day 0. Edits to carved or seam-hosting regions start when the PR 0b part containing
them merges (≤ 2026-10-07); until then the replacement is written in PRD 04's own module and wired after the merge:
- PR 0b-1: `compiler/modelMaterials.ts`, `compiler/textures.ts`, `nodes/material.ts`, C-31/C-36/C-37/C-38 seams.
- PR 0b-2: `textures/TextureBudget.ts` seam in `webgl2/TextureUpload.ts`, C-01 `FrameGraph.ts`, C-12, C-16 seams.
- PR 0b-3: `TypedGLBActor.ts` extension hook, `GLTFRenderResources.ts` `gltf/ImageDecode.ts` carve, C-39 fallthrough, capture `--flags`.

### Owned files and directories (must match CONTRACTS §4.1)

`packages/rendering/src/materials/`, `packages/rendering/src/shaders/{physical,physical-wgsl}/`,
`packages/rendering/src/forward/Transmission.ts`, `packages/rendering/src/textures/TextureBudget.ts`,
`packages/rendering/src/production-runtime/materials/`, `packages/rendering/src/{PBRMaterial,TexturedPBRMaterial,InstancedPBRMaterial,SkinnedLitMaterial,NormalMappedPBRMaterial,IBL,ProceduralMaterialTextures,TransmissionRenderTarget,Sampler}.ts`;
`packages/assets/src/{GLTFRenderResources,GLTFExtensionSupport,MikkTSpaceTangents}.ts`, `packages/assets/src/asset-corpus/ProductionGLTFRenderPipeline.ts`;
`packages/engine/src/production-runtime/{TypedGLBActor,ModelMaterialOverrides}.ts`, `packages/engine/src/production-runtime/actor/` (default),
`packages/engine/src/material-physical/`, `packages/engine/src/agent-api/compiler/{modelMaterials,textures}.ts`, `packages/engine/src/agent-api/nodes/material.ts`;
`apps/wow-webgpu-product-viewer/`; `fixtures/asset-corpus/`; `tools/codemods/pin-emissive-defaults.mjs`, `tools/generate-extension-matrix.mjs`.
Lane-generic (CONTRACTS §4.1 "lane NN"): this PRD file, `docs/project/aura3d-quality-rebuild/evidence/{prd04,prd-04}/`,
`packages/*/src/lanes/prd04.ts`, `agent-api/compiler/diagnosticOnly.prd04.ts`, `packages/aura3d-cli/src/commands/prd04/`,
`benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd04/`, `.github/workflows/qr-prd04-*.yml`, `tests/qr/prd04/`,
`tests/unit/contracts/impl/prd04-*`. Generated: `GLTF_EXTENSION_SUPPORT_MATRIX`.

Tasks of the earlier draft that edited files owned by other lanes were moved to §12.3 requests: `ShaderLibrary.ts`,
`ShaderChunks.ts`, `ShaderLibraryCore.ts`, `BRDFLut.ts`, `ForwardPass.ts`, `WebGL2Device.ts` (01); `WebGPUDevice.ts` (11);
`KTX2BasisTextureTranscoder.ts`, `KTX2TargetSelection.ts`, `GLTFCompressionDecoders.ts`, `loaders/KTX2Loader.ts`, `vendor/` (05);
`benchmarks/quality-rebuild/shared/{scenes,assets}.ts`, `ci.sh`, `quality-rebuild-capture.yml` (12); `AuraClashArenaApp.ts`
and showcase routes (14); `index.ts` outside the carves, `packages/rendering/src/index.ts` (15);
`collectGeneratedCodeWarnings` (13).

### Feature flags

| Flag | Values | Gates | PRD-local alias |
|---|---|---|---|
| `A3D_QR_MATERIALS` | bool | every PRD 04 behaviour change: override semantics, presets, samplers, procedural textures, spec-exact import, MikkTSpace default, texture budget, lobe registration, diagnostics `paths` | `renderer.materialModel: "physical-r185"` (on) / `"legacy"` (off) |
| `A3D_QR_MATERIALS_TRANSMISSION` | bool | `prd04.transmission` contributor and the `transmission`/`volume`/`dispersion` lobes | `renderer.transmission: "auto"` (on), `"env"` (on, Low-tier path forced), `"off"` (off) |
| `A3D_QR_MATERIALS_KTX2` | bool | compressed upload of KTX2 material textures (off = RGBA8) | `assets.ktx2: "compressed" \| "rgba8"` |

Per-option switches that are not flags: `alphaToCoverage`, `GLTFRenderResourceOptions.tangents`, `materialStrictness`
(default `"strict"` iff `A3D_QR_STRICT`), `debugView`. Lobe visibility additionally requires `A3D_QR_CORE=v2` (C-03).

### Stubs used

C-01 (phase after single ForwardPass), C-02 (`PROGRAM_GENERATOR_PENDING`, cache wraps `ShaderLibrary`, ChunkHarness real),
C-04 (A2C ignored), C-05 (legacy present), C-09 (legacy env), C-11, C-12 (anisotropy table real, budget empty), C-16
(pure target table, registry over existing decoders), C-18, C-27 (real data), C-28 (partial counters, sync compile),
C-29, C-30, C-31, C-36, C-37, C-38/C-39 (real). PRD 04's own stubs (C-03, C-15) stay the flag-off path until §5.4 removal.

### Integration checkpoints

Integrated acceptance (§16.2, §16.3) is evaluated only at CONTRACTS §7 checkpoints with `A3D_QR_MATERIALS` on inside
`qr_flags=all`, and never blocks a PRD 04 merge:
- IC-0 (2026-10-08): flags `none` baseline; PRD 04 records per-scene and per-game baselines from it.
- IC-1 (2026-10-15), IC-2 (10-22), IC-3 (10-29): screening (vision-only, recorded, cannot accept).
- IC-4 (2026-11-05), IC-8 (2026-12-03), IC-12 (2026-12-31): G-PANEL rounds; the only rounds that can move
  `A3D_QR_MATERIALS` to `integrated-accepted` and that can satisfy §16.2/§16.3. Leave-one-out (`all,-materials`)
  attributes regressions.
A checkpoint failure becomes a `qr-ic-regression` issue against the owning lane (CONTRACTS §7).

---

## 13. Implementation phases

Each phase's exit criteria are met on a GitHub Actions macos-14 run (Chromium, ANGLE Metal) of
`.github/workflows/qr-prd04-materials.yml`, with the run ID recorded in
`docs/project/aura3d-quality-rebuild/evidence/prd-04/<phase>.md`. Phase 1 starts on day 0. Phases 3, 4, 5 and 6 depend
only on Phase 1 outputs and the PR 0b merges, not on each other, and run in parallel inside the lane. No phase waits for
another lane; integrated criteria are evaluated at checkpoints (§16.2) and never gate a phase exit.

**Phase 1: Day-0 work in new files only (2026-10-05 →).**
- Work: lobe chunks + r185 oracle + brdf shim (§8, `shaders/physical/`, `tests/qr/prd04/`); `ModelMaterialOverrides.ts`
  (pure); `ProceduralMaterialTextures.ts`; `MikkTSpaceTangents.ts` (injected module); `textures/TextureBudget.ts` pure
  functions; `TransmissionRenderTarget.ts`; lane scenes `prd04-*` and fixtures; codemods `pin-emissive-defaults`,
  `prd04-model-tint-report`; `qr-prd04-materials.yml`; flag-`none` baseline capture of every lane scene and the
  negative-control runs (§15.4).
- Exit:
  - `pnpm typecheck:raw`, `pnpm lint`, unit tests green; C-03/C-15 conformance green on stubs.
  - Every `a3d_prd04_*` chunk compiles in ChunkHarness on macos-14 (with the brdf shim if PRD 01's chunk is not registered).
  - All 10 `prd04-*` scenes capture on both engines with flags `none`; baselines committed to `evidence/prd-04/phase-1.md`.
  - `tint-migration.md` committed with the codemod report rows.

**Phase 2: Production-path wiring, flag-gated (after PR 0b-1/0b-3, ≤ 2026-10-07 →).**
- Scope: R1 (bridge, actor snapshot, overrides, deprecated `setTint`), C-37 `materials` member, C-31 section, R6
  samplers + tier anisotropy, R12 procedural binding, R15 marker + resolution, R16 budget, spec-exact import (E23,
  default material), Duck route clamp removal, C-15 `provide()`.
- Exit: standalone S1, S2 (C-15), S3, S4, S6, S7, S9, S13, S15, S16 (§16.1).

**Phase 3: Lobes and `ProgramFeatureSource` (C-03 real).**
- Scope: `PhysicalMaterial`, material-class `programFeatures()`, `materials/lobes.ts`, ShaderFeatures
  `prd04.uvTransform`, `prd04.tangentFrame`, `prd04.debugView`; source guard.
- Exit: S2 (C-03 real), S5 (§16.1); `tests/browser/contracts/C-03-lobes-compile.spec.ts` green for `real`.

**Phase 4: Transmission (R4).**
- Scope: `forward/Transmission.ts` contributor, `prd04.transmissionTarget` feature, `transmission`/`volume`/`dispersion`
  lobes, env-refraction fallback chunk, E22 path-gated skip.
- Exit: S10 (§16.1); `gltf-material-mapping-spec-exact` extended to CompareTransmission for generated-path materials.

**Phase 5: Pipeline fidelity (R8, R9, R10, R11, R13).**
- Scope: MikkTSpace default under the flag, colour-space intent, C-16 decoder injection, variants, `prd04.alphaToCoverage`.
- Exit: S8, S11, S12 (§16.1).

**Phase 6: WGSL twins and truthful matrix (R17).**
- Scope: `shaders/physical-wgsl/*`, `tools/generate-extension-matrix.mjs`, PRD 04-owned E34 deletions.
- Exit: S14 (§16.1); every twin passes WGSL validation; the matrix regenerates identically with `--check`; `rg`
  shows zero imports of the deleted PRD 04 files.

**Phase 7: Integrated acceptance (checkpoint-driven, never blocks merges).**
- Exit (= completion, §21): §16.2 and §16.3 met at a G-PANEL round with `A3D_QR_MATERIALS` on in `all`, vision + human
  sign-off recorded; flag reaches `integrated-accepted`, then `default-on` after two clean checkpoints.

---

## 14. Task checklist

Tests live under `tests/qr/prd04/` (lane-owned) unless named `tests/unit/contracts/impl/prd04-*`. "flag" means
`ctx.flags.on("A3D_QR_MATERIALS")` resolved via C-36 `SceneCompileContext.flags` or `resolveQrFlags`.

Phase 1 (day 0)
- [ ] P1-1 `packages/rendering/src/shaders/physical/{bsdf_lobes_common,specular_ior,clearcoat,sheen,iridescence,anisotropy,transmission,volume,dispersion,emissive_strength,unlit,tangent_frame,uv_transform,alpha_a2c,debug_view}.glsl.ts`: one exported `ShaderChunk` each (`name: "a3d_prd04_<file>"`, `owner: "prd04"`, `stage`, `requires: ["brdf"]` where the brdf chunk is used), math per §8.2–8.11, header comment naming the r185 source file and line range. `index.ts` calls `registerShaderChunk` for each from `packages/rendering/src/lanes/prd04.ts`.
- [ ] P1-2 `tests/qr/prd04/shims/brdf_r185.glsl.ts`: test-only `brdf` chunk transcribed from r185 `bsdfs.glsl.js` and `lights_physical_pars_fragment.glsl.js` (`F_Schlick`, `V_GGX_SmithCorrelated`, `D_GGX`, `BRDF_GGX_Multiscatter`, `DFGApprox` via a LUT uniform), registered by the test only when `shaderChunk("brdf")` is undefined.
- [ ] P1-3 `tests/qr/prd04/oracles/physical-bsdf-reference.ts`: JS port of `D_Charlie`, `V_Neubelt`, `IBLSheenBRDF`, `D_GGX_Anisotropic`, `V_GGX_SmithCorrelated_Anisotropic`, `evalIridescence`, `computeSpecularOcclusion`, `a3dApplyIorToRoughness`, `a3dVolumeAttenuation`, IOR F0, clearcoat composition. `tests/qr/prd04/fixtures/bsdf/r185-golden.json` generated once by `tests/qr/prd04/browser/generate-r185-golden.spec.ts`, which compiles three's own `THREE.ShaderChunk` functions in ChunkHarness on a 16×16×8 (NdotV, NdotL, roughness, ior) grid; regeneration requires a three version bump. Unit test `tests/qr/prd04/unit/physical-bsdf-reference.test.ts`: oracle vs golden ≤ 1e-4 relative.
- [ ] P1-4 `packages/engine/src/production-runtime/ModelMaterialOverrides.ts`: `snapshotMaterials`, `applyMaterialOverrides`, `lowerModelMaterialOverrides` per §7.2. Snapshot keys: material name + library index; values: every uniform in `GLTF_DIAGNOSTIC_TEXTURE_BINDINGS` (`GLTFRenderResources.ts:257`) plus `u_baseColor`, `u_roughness`, `u_metallic`, `u_emissiveColor`, `u_emissiveStrength`, `u_clearcoatFactor`, `u_clearcoatRoughnessFactor`, `u_environmentIntensity`, `u_opacity`. Test `tests/qr/prd04/unit/model-material-overrides.test.ts` with `MockRenderDevice`-backed materials: same override twice → identical parameters; `baseColorMultiply [0.5,0.5,0.5,1]` → `u_baseColor = authored*0.5`, `u_baseColorTextureEnabled` unchanged; `target` string exact / RegExp / array; later entry wins per field; `replaceTextures` disables only baseColor + metallicRoughness; no emissive change unless given.
- [ ] P1-5 `packages/rendering/src/ProceduralMaterialTextures.ts`: `fabric-normal` (twill height field from two periodic sine weaves → Sobel normal), `rubber-roughness` (4-octave periodic value-noise fBm), `brushed-metal-anisotropy` (rg = `direction` projected to tangent plane, b = 1D periodic streak noise), `plastic-micro-scratch` (seeded line segments rasterised into roughness, wrapped). Test `tests/qr/prd04/unit/procedural-material-textures.test.ts`: identical SHA-256 per (kind, params, seed) across two runs; column 0 vs column N−1 wrap difference ≤ 1/255; row likewise.
- [ ] P1-6 `packages/assets/src/MikkTSpaceTangents.ts`: `setMikkTSpaceModule`, `generateMikkTSpaceTangents` (worker via `new Worker(new URL(...), { type: "module" })`, inline fallback when `Worker` is undefined), `mikkTSpaceAvailable`. Test `tests/qr/prd04/unit/mikktspace-tangents.test.ts` injecting `node_modules/three/examples/jsm/libs/mikktspace.module.js`: for `NormalTangentMirrorTest` with TANGENT stripped, output equals the authored TANGENT within 1e-3 per component and equals three's `BufferGeometryUtils.computeMikkTSpaceTangents(geometry, mikktspace, true)` exactly.
- [ ] P1-7 `packages/rendering/src/textures/TextureBudget.ts`: `applyTextureBudget(desc, policy)` (power-of-2 downscale to `maxDimension`; KTX2 drops leading mip levels; per-device ledger in a `WeakMap<RenderDevice, Ledger>`; largest-first top-mip drop beyond `maxBytes`), `textureBudgetReport`. Test `tests/qr/prd04/unit/texture-budget.test.ts`: 4096² RGBA8 under Medium policy → 2048²; 5-level KTX2 4096² → starts at level 1; 300 MiB of inputs under 256 MiB → largest textures lose top mips first and the ledger ≤ 256 MiB.
- [ ] P1-8 `packages/rendering/src/TransmissionRenderTarget.ts` per §7.3. Unit test with `MockRenderDevice`: `resize` recreates only on size change; `mipCount = floor(log2(max(w,h))) + 1`; `dispose` releases the texture.
- [ ] P1-9 `fixtures/asset-corpus/`: add Khronos glTF-Sample-Assets `TextureTransformTest`, `NormalTangentMirrorTest`, `NormalTangentTest`, `IridescenceLamp`, `AnisotropyBarnLamp`, `AnisotropyRotationTest`, `DispersionTest`, `MaterialsVariantsShoe`, `AlphaBlendModeTest`, `CompareTransmission` (if absent) via LFS, each with its own LICENSE/attribution (most CC-BY 4.0; some CC0 or per-asset) recorded in `benchmarks/quality-rebuild/scenes/prd04/assets.ts` (`ModelAssetId`/`repoPath`/`provenance`/sha256, same shape as `clearCoatTest` in `shared/assets.ts`). Today the corpus holds only antique-camera, avocado, boom-box, clear-coat-test, damaged-helmet, duck, sheen-test-grid. Draco, Meshopt and UASTC-all-maps KTX2 encodings of DamagedHelmet: produced by PRD 05 tooling if available (Q-05-2), otherwise once in `qr-prd04-materials.yml` with a pinned external encoder (`gltf-transform` CLI at an exact version, invoked via its own pinned `npx --package` spec in CI only, no repo dependency), committed, command and version recorded in `provenance`.
- [ ] P1-10 `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd04/`: the 10 scenes of §16 (`prd04-texture-transform`, `prd04-normal-tangent`, `prd04-iridescence`, `prd04-anisotropy`, `prd04-dispersion`, `prd04-variants`, `prd04-ktx2`, `prd04-tiled-ground`, `prd04-tinted-hero`, `prd04-alpha-mask`) with C-30 fields `owner: "prd04"`, `referenceProfile: "contract"`, `masks: ["object-id"]`, `primaryCriterion`, `primaryRegion: "subject"`, `qrFlags: ["materials"]`, both engine adapters; `prd04-tiled-ground` also declares `strip: { frames: 12, intervalMs: 50, orbitDegrees: 6 }`. Unit test: ids unique, `prd04-` prefix, both adapters present (runs inside C-30 conformance).
- [ ] P1-11 `tools/codemods/pin-emissive-defaults.mjs` (TS compiler API; pure `transform(source, fileName)`), registered as C-39 codemod `pin-emissive-defaults` from `packages/aura3d-cli/src/commands/prd04/pinEmissiveDefaults.ts`. Golden test `tests/qr/prd04/unit/pin-emissive-defaults.test.ts`: fixture covering `material.emissive({...})`, `material.neon()`, an object literal with `emissive` and no `emissiveIntensity`, and one that already pins → exact golden output and row list.
- [ ] P1-12 `packages/aura3d-cli/src/commands/prd04/modelTintReport.ts`: C-39 codemod `prd04-model-tint-report` (report-only rows: file, line, asset expression, `material` source incl. followed identifier, `color`/`emissive` presence). Run over `apps/*/src/**/*.ts`; commit rows plus recommended (a)/(b)/(c) decisions to `evidence/prd-04/tint-migration.md`.
- [ ] P1-13 `.github/workflows/qr-prd04-materials.yml`: `macos-14`, Chromium `--use-angle=metal --enable-gpu --ignore-gpu-blocklist`, LFS pull of `fixtures/asset-corpus/`, jobs `unit` (`vitest run tests/qr/prd04 tests/unit/contracts`), `browser` (Playwright `tests/qr/prd04/browser`), `capture` (`pnpm quality:capture --scenes prd04-*,02-pbr-product,03-damaged-helmet,04-clearcoat,05-transmission,06-metal-roughness-sweep,07-sheen-fabric,08-skinned-character --flags <input>`), artifact upload of `tests/reports/material-conformance.json` and captures.

Phase 2 (production path, flag-gated)
- [ ] P2-1 `TypedGLBActor.ts` `createTypedGLBActor` (:184): after `loadProductionGLTFRenderPipeline` (:185-192) call `snapshotMaterials(pipeline.resources.materialLibrary.values())`; store on the actor. Add `setMaterialOverrides`, `inspectMaterials` per §7.2. Test `tests/qr/prd04/unit/typed-glb-actor-snapshot.test.ts` (`fixtures/asset-corpus/damaged-helmet.glb`): snapshot equals post-load parameters; `setMaterialOverrides([])` restores them exactly.
- [ ] P2-2 `TypedGLBActor.ts`: with the flag on, `setTint` → `setMaterialOverrides([{ baseColorReplace: tint.baseColor, replaceTextures: true, ...explicit fields }])`; with it off, the existing `tintTypedGLBActorMaterials`/`applyMaterialTint` (:478-515) run unchanged (C-15 stub). The `/joint/i` branch, the `0.28/0.38/0.16` defaults and the `emissive = baseColor` fallback (:479) are never reached with the flag on. Test: flag-off `setTint` parameters byte-equal to `85aafcd0` behaviour; flag-on applies no emissive when none given.
- [ ] P2-3 `agent-api/compiler/modelMaterials.ts` `applyModelTintBridge`: flag on → `materialOverrides: lowerModelMaterialOverrides(node.material, node.materialOverrides)` with `color` → `baseColorMultiply` unless `colorMode: "replace"`, `replaceTextures` only when passed, `emissive` only when present, preset-defaulted colour (`AURA_PRESET_DEFAULTS`) ignored; flag off → today's `tint` object with `replaceSurfaceTextures: true`. Test `tests/qr/prd04/unit/model-tint-bridge.test.ts` (both flag states, 2-material fixture: target `"Body"` changes only Body).
- [ ] P2-4 `production-runtime/actor/TypedGLBActorMaterials.ts`: `registerTypedGLBActorExtension({ id: "prd04.materials", owner: "prd04", flag: "A3D_QR_MATERIALS", onLoad })` records actors by node id; `registerNodeHandleExtension({ member: "materials", appliesTo: ["model"], ... })` returns `AuraModelMaterialHandle` bound to that actor; `slot.provide()` for C-15 from `packages/engine/src/lanes/prd04.ts`. Test: C-15 conformance `real`; `handle.materials.inspectMaterials()` on the helmet lists `baseColor` in `enabledMaps` after a flag-on colour override.
- [ ] P2-5 `production-runtime/actor/materialDiagnostics.ts`: `registerDiagnosticsSection({ id: "prd04.materials", key: "materials", owner: "prd04", flag: "A3D_QR_MATERIALS", collect })` filling `AuraMaterialDiagnostics` from `ProgramCacheLike.stats()`, C-28 counters, `textureBudgetReport`, the contributor state and the issue log. Test `tests/qr/prd04/unit/material-diagnostics-section.test.ts`: schema-valid under C-31 conformance; no field is a constant when its source is unavailable (asserts the `material-program-pending` issue instead).
- [ ] P2-6 `Sampler.ts`: `static trilinear`, `static fromGLTF`; `resolveSamplerAnisotropy` (:71) accepts `tier`/`deviceMax` and delegates to C-12 when `desired` is undefined. Test `tests/qr/prd04/unit/sampler-trilinear-tier.test.ts`: each tier → 4/8/16/16 clamped to `deviceMax`; `wrap: "mirror"` → `"mirror-repeat"`; constructor defaults unchanged.
- [ ] P2-7 `compiler/textures.ts`: flag on → the C1 sampler (ex-`index.ts:14379-14381`) becomes `Sampler.trilinear({ wrap: map(spec.sampling?.wrap ?? "repeat"), anisotropy: resolveSamplerAnisotropy({ desired: spec.sampling?.anisotropy ?? spec.textureAnisotropy, tier: ctx.quality.tier, deviceMax }).applied })`, `slotSampling` per slot; SDF text (ex-`:14529`) uses `wrap: "clamp"`; flag off unchanged. Test: RenderSource snapshot for a textured primitive differs only in sampler fields between flag states.
- [ ] P2-8 `TexturedPBRMaterial.ts` `samplerWrapMode` (:1031-1036): new constructor option `hardwareWrap?: boolean` (set by `compiler/textures.ts` under the flag) emits wrap code `3.0` for non-atlas slots. Because today's legacy shader treats any code > 1.5 as mirror (E38), the option is honoured only when the registered legacy textured shader source contains the Q-01-2 passthrough (`mode > 2.5`); otherwise it is ignored and `hardware-wrap-pending` is added to `inspectMaterials().warnings`. Test: uniform values for both cases, using a stub shader source with and without the passthrough line.
- [ ] P2-9 `compiler/textures.ts` procedural path (ex-`index.ts:14040-14104`, `:14163`): flag on → `generateProceduralMaterialTexture(kind, params)` uploaded as a mipmapped `Texture` with `Sampler.trilinear({ wrap: "repeat" })`, bound to normal/roughness (anisotropy map stored for the lobe), cached per params in a module `Map`; failure → `procedural-texture-failed` issue + scalar material. Flag off: the existing "has no rasterizer; recorded only" warning. Test: `material.fabric()` sphere RenderSource has a normal texture bound with the flag on.
- [ ] P2-10 `nodes/material.ts` (ex-`index.ts:2414-2724`): attach `AURA_PRESET_DEFAULTS` (enumerable symbol) listing defaulted fields on every preset result; export `resolveMaterialSpecDefaults(spec, flags)` implementing R15 (emissive 1.0 + `color ?? "#808080"`, neon 2.0, glass opacity 1, metal no `envMapIntensity`, pbr colour ignored on models). `compiler/textures.ts` `:14391` fallback becomes `?? (emissive || emissiveTexture ? (flag ? 1.0 : 1.35) : 0)`. Test `tests/qr/prd04/unit/material-presets-defaults.test.ts`: preset outputs deep-equal to `85aafcd0` ignoring the symbol key; resolved specs per R15 under the flag; `tests/unit/public-api-contracts.test.ts` still green.
- [ ] P2-11 `textures/TextureBudget.ts` wired: `applyTextureBudget` receives the C-27 policy (`maxTextureSize`, `textureBudgetBytes`) from `app.quality.settings` via `GLTFRenderResourceOptions.textureBudget` and the C1 path. Browser test `tests/qr/prd04/browser/texture-budget.spec.ts`: Meshy hero `courierVanMeshyV2Decimated` at `?aura3d-quality=medium` reports `materials.textureBytes` ≤ 256 MiB, `downscaledTextures` > 0, no `webglcontextlost`.
- [ ] P2-12 `GLTFRenderResources.ts` (flag on): delete the E23 cull override path (`usesOpaqueDoubleSidedClearcoatShell`, :1752-1758, and its call); default material (:1660-1666) = baseColor `[1,1,1,1]`, metallic 1, roughness 1 (glTF spec; r185 `GLTFLoader` `createDefaultMaterial`). Flag off unchanged. Test `tests/qr/prd04/unit/gltf-material-mapping-spec-exact.test.ts`: for each Khronos fixture except CompareTransmission, descriptor factors equal JSON factors exactly with the flag on.
- [ ] P2-13 `apps/wow-webgpu-product-viewer/src/main.ts:51-67`: delete the material clamp loop (declared correctness fix in the PR description; PRD 12 re-baselines the route). Test `tests/qr/prd04/unit/duck-route-materials.test.ts`: after load, every material's factors equal the glTF JSON and no `u_productColorSmoothing` or transmission-zeroing uniform is written.
- [ ] P2-14 `compiler/diagnosticOnly.prd04.ts`: remove each C-15 field as it is wired; register option-coverage rows (`registerOptionCoverage`) for `model.material.color`, `model.materialOverrides`, `material.sampling.wrap`, `material.sampling.anisotropy`, `material.alphaMode`.

Phase 3 (lobes)
- [ ] P3-1 `materials/PhysicalMaterial.ts` + `materials/PhysicalFeatures.ts`: descriptor → `programFeatures(ctx)` (maps with `uvSet`/`transform`, `alphaMode`, `doubleSided`, `vertexColors`, `lighting`, `extensions` from `materialLobes(ctx.flags)`). The 5 material classes implement it from their options. Test `tests/unit/contracts/impl/prd04-lobes.test.ts`: `computeProgramKey` stable for equal descriptors, distinct for each lobe toggle; no light/shadow/env fields produced.
- [ ] P3-2 `materials/lobes.ts`: `registerMaterialLobe` for `ior`, `specular`, `clearcoat`, `sheen`, `iridescence`, `anisotropy`, `transmission`, `volume`, `dispersion`, `emissive-strength`, `unlit`, each with `glTFExtension`, `samplerSlots`, `bind()` mapping descriptor → uniforms; Low tier: `iridescence` feature bit `film: false` (Schlick). `provide()` C-03 from the rendering lane barrel.
- [ ] P3-3 `materials/features.ts`: ShaderFeatures `prd04.uvTransform` (hook `fragment:pars`, per-slot `mat3` from `uvTransformMatrix(offset, rotation, scale)` = glTF `T·R·S`), `prd04.tangentFrame` (`vertex:world` + `fragment:normal`), `prd04.debugView` (`fragment:end`, define `A3D_PRD04_DEBUG_VIEW_<NAME>`, raw channel without tone mapping; `<name>Effective` reads the value the lobe receives). Test `tests/qr/prd04/unit/uv-transform-matrix.test.ts`: 20 random uniform-scale inputs equal three `Matrix3.setUvTransform(ox, oy, sx, sy, r, 0, 0)` within 1e-6; non-uniform scale with `r ≠ 0` equals the KHR_texture_transform README formula and differs from three (asserted).
- [ ] P3-4 Browser `tests/qr/prd04/browser/physical-lobes-numeric.spec.ts` (U-BSDF-PARITY browser half): each lobe function rendered by ChunkHarness into an RGBA32F target over the golden grid, read back in the test-only path, ≤ 1e-3 relative error vs `r185-golden.json`.
- [ ] P3-5 Source guard `tests/qr/prd04/unit/no-asset-specific-shader-constants.test.ts` over `packages/rendering/src/shaders/physical*/**` and `packages/rendering/src/materials/**`: no `sourcePaint`, `productProp`, `RedPaintGate`, `horizonStripe`, `roughEnvironmentFloor`, `0.98, 0.12, 0.075`, `0.012`, `clearcoatNormalBoost`, `a3dApplyAdvancedPbrLobes`, `a3dPbrIridescenceColor`, `a3dPbrAnisotropicDistribution`. Header states it is a regression guard, not quality evidence.

Phase 4 (transmission)
- [ ] P4-1 `forward/Transmission.ts` per §9.1; registered from the rendering lane barrel. Unit test with a mock `FrameContributorContext`: 0 passes when no item has the `transmission` lobe; 1 pass otherwise; blackboard key set; RGBA8 + `transmission-ldr-capture` when `halfFloatColorBuffer` is false.
- [ ] P4-2 `transmission.glsl.ts`/`volume.glsl.ts`/`dispersion.glsl.ts` per §8.7, plus `prd04.transmissionTarget` feature `bindUniforms`. The per-material `transmissionBackdropTexture` option (`TexturedPBRMaterial.ts:166-170, 338-346`) stays as-is on the legacy path; generated programs never read it. `ProductionRuntimeRenderer.captureProof` (`production-runtime/ProductionRuntimeRenderer.ts:125-131`) is a proof readback and is never a render input.
- [ ] P4-3 `GLTFRenderResources.ts:1744-1750, 1840, 2026`: `usesUnbackedScalarTransmission` returns false (no rewrite) exactly when the flag and `A3D_QR_MATERIALS_TRANSMISSION` are on **and** `programCacheSlot.provided` (C-02 real) or `renderer.transmission === "env"`; otherwise unchanged. Extend `gltf-material-mapping-spec-exact.test.ts` to CompareTransmission under those conditions.
- [ ] P4-4 Browser `tests/qr/prd04/browser/transmission-capture.spec.ts`: on `05-transmission` with the flag on, `diagnostics().materials.transmissionTargetActive === true`, target `mipCount` = full chain, C-28 `readbacks === 0`; on `03-damaged-helmet` (no transmission) `transmissionTargetActive === false`.
- [ ] P4-5 Move `evaluateExternalParityTransmission` (`materials/TransmissionPass.ts:19-44`) to `tests/qr/prd04/oracles/` if referenced, delete the module once `rg` shows zero imports outside tests.

Phase 5 (pipeline)
- [ ] P5-1 `GLTFRenderResources.ts`: `imageColorSpaceIntent(asset)` from material slot usage; pass `colorSpace` into the C-16 decode options for every image; `colorspace-conflict` issue for images used as both. Test `tests/qr/prd04/unit/gltf-image-colorspace-intent.test.ts` on DamagedHelmet (baseColor/emissive sRGB; normal/MR/occlusion linear).
- [ ] P5-2 `TypedGLBActor.ts` + `ProductionGLTFRenderPipeline.ts:75`: read `extensionsUsed`; `await decoderRegistry.require([...])` (C-16; stub wraps `GLTFCompressionDecoders.ts`); pass decoders, `materialVariant: options.variant`, `textureBudget`, `tangents` through. `AssetDecoderUnavailable` → `decoder-missing` issue and a load error naming the extension. Browser test `tests/qr/prd04/browser/gltf-decoders-variants.spec.ts`: Draco and Meshopt DamagedHelmet via `model()` load and render within masked ΔE2000 mean ≤ 1.0 of the uncompressed GLB on the same build.
- [ ] P5-3 Variants: `setMaterialVariant`/`materialVariants` rebuild primitive→material bindings using `GLTFRenderResources.ts:1141` resolution. Same browser spec: MaterialsVariantsShoe 3 variants, mean subject colour pairwise ΔE2000 ≥ 10; unknown name → `variant-unknown`, default kept.
- [ ] P5-4 MikkTSpace default: `GLTFRenderResources.ts` uses `generateMikkTSpaceTangents` instead of `generateMeshTangents` (:1216) when flag on, `tangents !== "legacy"` and `mikkTSpaceAvailable()`; else keeps the legacy function and reports `tangent-derivative-fallback` only when a generated program will use the derivative frame.
- [ ] P5-5 `alpha_a2c.glsl.ts` + `prd04.alphaToCoverage` feature + material `renderState.alphaToCoverage` request (C-04). Unit test: feature selected iff `alphaMode === "mask" && alphaToCoverage && tier.msaaSamples > 0`.

Phase 6 (WGSL, truthfulness)
- [ ] P6-1 `shaders/physical-wgsl/*.wgsl.ts` twins attached to each chunk's `wgsl`. Test: WGSL validation per §8.12; numeric half of U-BSDF-PARITY on WebGPU recorded as integrated.
- [ ] P6-2 `tools/generate-extension-matrix.mjs`: writes `GLTF_EXTENSION_SUPPORT_MATRIX` (`GLTFExtensionSupport.ts:39-68`) and `PHYSICAL_EXTENSION_MATRIX` (`PhysicalMaterialSpec.ts:43-52`) from `tests/reports/material-conformance.json`; `--check` mode used in `qr-prd04-materials.yml`; fails when the report is missing. An extension is `conformant` only with a passing probe **and** an integrated G-PANEL scene result; until then at most `approximate`.
- [ ] P6-3 Delete `production-runtime/materials/{GLTFMaterialAdapter,MaterialCompiler,PBRShaderFeatures}.ts` (or thin re-exports of `materials/PhysicalMaterial.ts`) after `rg` shows zero imports; file Q-15-4 for barrel exports.

Phase 7 (integrated, checkpoint-driven)
- [ ] P7-1 Append facts F-04-01..F-04-06 to CONTRACTS Appendix B (append-only): override semantics, preset defaults, anisotropy table, procedural kinds, `alphaMode` semantics, `inspectMaterials()` shape; each `proposed` until a test or capture run id is cited.
- [ ] P7-2 For each G-PANEL round, attach the §16.2/§16.3 results to `evidence/prd-04/IC-<k>.md` from the round's `PanelRoundRecord`; file `qr-request`s for any integrated failure attributed to another lane by leave-one-out.

---

## 15. Test requirements

All browser and GPU tests run remotely on GitHub Actions `macos-14` (Chromium, ANGLE Metal; `--use-angle=metal
--enable-gpu --ignore-gpu-blocklist`) in the lane workflow `.github/workflows/qr-prd04-materials.yml`, with the same
runner class as `quality-rebuild-capture.yml` (run 37289688772). Policy forbids local Playwright/Chromium for these
suites. Unit tests (vitest, no GPU) may run locally with `--maxWorkers=2` and also run in CI. Every PR also runs the
program-wide `qr-contracts.yml` checks and the flag-off sentinel identity check (CONTRACTS §6.1).

### 15.1 Unit (vitest)
- `tests/unit/contracts/impl/prd04-lobes.test.ts`, `prd04-overrides.test.ts`: C-03/C-15 real-implementation cases
  (key round-trip, sampler-slot counting, override precedence, texture preserved on multiply).
- **U-BSDF-PARITY** unit half: `tests/qr/prd04/unit/physical-bsdf-reference.test.ts` (oracle vs r185 golden).
- `tests/qr/prd04/unit/`: `model-material-overrides`, `typed-glb-actor-snapshot`, `model-tint-bridge`,
  `material-diagnostics-section`, `sampler-trilinear-tier`, `material-presets-defaults`, `texture-budget`,
  `procedural-material-textures`, `mikktspace-tangents`, `uv-transform-matrix`, `gltf-material-mapping-spec-exact`,
  `gltf-image-colorspace-intent`, `duck-route-materials`, `pin-emissive-defaults`, `no-asset-specific-shader-constants`
  (regression guard only).

### 15.2 Browser (Playwright, remote macos-14)
- `physical-lobes-numeric.spec.ts` (U-BSDF-PARITY browser half; ChunkHarness, RGBA32F, ≤ 1e-3 relative).
- `generate-r185-golden.spec.ts` (run on three version bumps only).
- `model-material-override.spec.ts`: tint-white SSIM, red-tint detail retention, self-glow (§16.1 S3).
- `texture-tiling.spec.ts`: shimmer (standalone) and FFT seam (integrated) on `prd04-tiled-ground`.
- `procedural-material-detail.spec.ts` (§16.1 S7).
- `texture-budget.spec.ts`, `transmission-capture.spec.ts`, `gltf-decoders-variants.spec.ts`.
- Integrated-only specs, run with `--flags all` at checkpoints and on demand: `physical-lobes-probe.spec.ts`
  (sheen/clearcoat/anisotropy probes), `transmission-probe.spec.ts`, `light-count-extension-materials.spec.ts`,
  `ktx2-srgb.spec.ts`, `alpha-to-coverage.spec.ts`, `skinned-merge-isolation.spec.ts`.

### 15.3 Conformance report
`tests/reports/material-conformance.json` is produced by the lane browser job. For each extension it records pass/fail
per probe, whether the run was standalone or integrated (`qrFlags`), and the latest G-PANEL scene judgement id. It is the
only input to the support matrix generation (R17).

### 15.4 Negative controls
Every probe with a fixed threshold ships with a control that must fail it, recorded in
`evidence/prd-04/probes/<probe>-control.json`: the flag-`none` build for standalone probes, a forced-bad configuration
otherwise (e.g. clamp-to-edge forced for the seam FFT; texture deliberately uploaded linear for KTX2 ΔE, which must exceed
ΔE 5; A2C forced off, edge ≤ 1 px; Phase 1 baseline for every lobe probe). A probe that passes its control is too weak and
is tightened before the phase exits.

Explicitly not acceptable as evidence: source-token tests, a non-blank screenshot, a capability log entry, a conformance
suite, or a parity matrix entry.

---

## 16. Visual acceptance tests

Reference: three.js r185 output of the same scene spec, 1280×720, DPR 1, captured in the same macos-14 job. Judging
follows research/23 and C-32: a vision model scores both images 0–10, classifies each difference (`equivalent` /
`minor-aura3d-deficiency` / `major-aura3d-deficiency` / `implementation-bug` / `aura3d-better`) and checks harness
fairness; human reviewers confirm or override. Metrics are computed **inside a subject mask** (three frame's
non-background pixels dilated by 4 px; research/22 shows full-frame SSIM flatters Aura because background is 54–78%
of the frame). Every vision threshold is paired with a pixel metric, and neither passes a scene alone.

### 16.1 Standalone acceptance (this lane alone; gates PRD 04 merges and `standalone-accepted`)

Run with `A3D_QR_MATERIALS` on (and the sub-flag where named), every other flag off, all other contracts on stubs, in
`qr-prd04-materials.yml`. These criteria prove that PRD 04's own code does what it says on the current renderer. They are
engineering gates plus vision **screening**; none of them is a Three.js-quality claim.

| ID | Scene / test | Criterion | Threshold | Control that must fail |
|---|---|---|---|---|
| S1 | 6 sentinel scenes (`benchmarks/quality-rebuild/sentinels.json`) | flag-off identity | per-image ΔE2000 p99 ≤ IC-0 noise floor | — |
| S2 | C-03, C-15 conformance | stub and real | all green | — |
| S3 | `model-material-override.spec.ts` on `damaged-helmet.glb` + `prd04-tinted-hero` (Meshy `courierVanMeshyV2Decimated`, `color:"#e85d75"`) | textures kept, no self-glow | white tint: masked SSIM ≥ 0.999 vs untinted Aura; red tint: masked Laplacian variance ≥ 90% of untinted Aura and mean R/G ratio rises; shadow-side mean luma ≤ 1.1× untinted Aura; `inspectMaterials()` lists `baseColor`; vision screening classifies "texture detail lost under tint" as absent; human confirms "not toy plastic" | flag off fails the Laplacian and shadow-luma checks |
| S4 | `gltf-material-mapping-spec-exact` + `duck-route-materials` | spec-exact import | descriptor factors equal glTF JSON for every Khronos fixture except CompareTransmission; Duck route writes no clamp uniform | flag off differs on the default material / Duck |
| S5 | `physical-lobes-numeric.spec.ts` | lobe math equals r185 | ≤ 1e-3 relative on the full grid for every lobe; every chunk compiles in ChunkHarness on macos-14 | a deliberately perturbed constant (sheen `* 0.012`) fails |
| S6 | `prd04-tiled-ground` (40 m plane, 1 m CC0 tiling set, grazing camera, 12-frame strip) | shimmer | temporal per-pixel luma std-dev in the far third of the subject mask ≤ 50% of the flag-off value; anisotropy reported 16 on High, 8 on Medium | flag off (clamp, non-mipmapped) fails |
| S7 | `procedural-material-detail.spec.ts`: `material.fabric/brushedMetal/blackRubber/frostedGlass` on a 1 m sphere, 1280×720 | micro-structure reaches pixels | masked Laplacian variance ≥ 3× the flag-off value per preset; vision screening names the structure unprompted | flag off (input dropped) fails |
| S8 | `mikktspace-tangents.test.ts` | tangents | equals authored TANGENT ≤ 1e-3 and three's output exactly | `generateMeshTangents` output fails the authored comparison on NormalTangentMirrorTest |
| S9 | `texture-budget.spec.ts` | budget | Medium: `textureBytes` ≤ 256 MiB, max dimension 2048, no context loss | budget disabled exceeds 256 MiB |
| S10 | `transmission-capture.spec.ts` (`A3D_QR_MATERIALS_TRANSMISSION`) | capture | active only with a transmissive item; full mip chain; `readbacks == 0` | contributor forced on `03` fails the "inactive" check |
| S11 | `prd04-variants` (MaterialsVariantsShoe) | variants switch | pairwise masked mean ΔE2000 ≥ 10 between the 3 variants; `variant-unknown` on a bad name | flag off: `setMaterialVariant` is a no-op, ΔE < 1 |
| S12 | `gltf-decoders-variants.spec.ts` | Draco/Meshopt via `model()` | each loads; masked ΔE2000 mean ≤ 1.0 vs uncompressed on the same build | — (load failure is the control) |
| S13 | `material-presets-defaults.test.ts` + `pin-emissive-defaults` golden | presets | resolved values per R15 under the flag; preset objects unchanged; codemod golden exact | — |
| S14 | `generate-extension-matrix.mjs --check` | truthful matrix | regenerated matrix identical; no `conformant` without integrated evidence | hand-edited entry fails `--check` |
| S15 | `material-diagnostics-section.test.ts` | diagnostics | C-31 schema-valid; observed values only | — |
| S16 | §17 CI ratios on `18-game-scene` and Gallery Shift | no perf regression | median frame time flag on ≤ 1.10× flag off (300 frames) | — |

### 16.2 Integrated acceptance: benchmark scenes (checkpoints only; never blocks)

Evaluated at G-PANEL rounds (IC-4, IC-8, IC-12, …) with `qr_flags=all`. Contracts the result depends on are listed so a
miss is attributed correctly (leave-one-out `all,-materials` separates PRD 04's contribution).

| Scene | Depends on (contracts) | Judged criterion | Threshold (all required) |
|---|---|---|---|
| 02-pbr-product | C-02, C-03, C-07 (primitive tessellation, PRD 01), C-09 | Chrome roughness gradient, wood specular without sparkle (spec-AA), opaque plinth | Aura ≥ three − 0.5; no `implementation-bug`; plinth `equivalent` |
| 03-damaged-helmet | C-02, C-03, C-09, C-16 | Visor lobe crispness, metal contrast | Aura ≥ three − 0.3; masked ΔE2000 mean ≤ 3.0 |
| 04-clearcoat | C-02, C-03, C-09 | Coat roughness texture visible (row 3); no milky veil; coat normal rings (row 6) | Aura ≥ three − 0.5; research/23 §04 differences #2–#4 `equivalent`; `physical-lobes-probe` clearcoat row-3 coated-cell luminance std-dev ≥ 50% of three's |
| 05-transmission | C-01 real (split + transmissive queue, Q-01-6), C-02, C-03, C-05 | Refracted checker through the right bowl; Fresnel rim | Aura ≥ three − 0.5; `transmission-probe`: right-bowl centre luma ≥ 0.6× checker luma behind it and |light − dark tile| ≥ 0.25× unobstructed |
| 06-metal-roughness-sweep | C-02, C-07, C-09 | Dielectric rim fades with roughness; no aliasing | rim and aliasing items `equivalent`; outer 10% ring mean luma of the r = 1 dielectric sphere within 10% of three's |
| 07-sheen-fabric | C-02, C-03, C-09 | Sheen grows with colour; spreads with roughness; matte base | Aura ≥ three − 0.5; research/23 §07 #1–#3 `equivalent`; SheenTestGrid green mean rises ≥ 3 of 3 steps along sheenColor, sheenRoughness row spread ≥ 0.02 and ≥ 50% of three's |
| 08-skinned-character | C-02, C-18 | No regression from skinned lobes; correct texture transform | score ≥ IC-0 score and ≥ three − 0.5; skinned-vertex positions match the CPU skin oracle within 1e-5 |
| prd04-texture-transform | C-02 | All 9 tiles show the "correct" arrow | every tile matches three; arrow-centroid angle within ±5° |
| prd04-normal-tangent | C-02 (tangent_frame), Q-05-1 | Mirrored-UV normal maps light consistently | vision `equivalent`; masked ΔE2000 mean ≤ 3; mirrored halves differ by ≤ 2 ΔE (a bitangent bug gives ≥ 10) |
| prd04-iridescence | C-02, C-03, C-09 | Thin-film hue shift with view angle and thickness map | Aura ≥ three − 0.5; film-region mean hue at 3 angles within ±15° of three's |
| prd04-anisotropy | C-02, C-03, C-09 | Elongated highlights following the direction texture | Aura ≥ three − 0.5; per-disc major-axis angle within ±10°; AnisotropyBarnLamp highlight aspect ≥ 2.0 and within ±25% of three's |
| prd04-dispersion | C-01, C-02, C-03 | Chromatic separation through prisms (High tier) | Aura ≥ three − 1.0; R–B centroid offset at prism edges 50–150% of three's |
| prd04-variants | C-02, C-09 | 3 variants as authored | all 3 `equivalent`; each within masked ΔE2000 mean ≤ 3 of three's same variant |
| prd04-ktx2 | C-16 real (sRGB formats, local transcoder) | Base colour not washed out vs PNG (UASTC for every map; ETC1S-base variant informational) | masked ΔE2000 mean ≤ 2.0 vs Aura PNG render; Aura ≥ three − 0.3; inverted-colour-space control > ΔE 5 |
| prd04-tiled-ground | Q-01-2 or C-02 (`uv_transform`) | No seams, no shimmer, anisotropic sharpness | `texture-tiling` FFT: no spike at the tile frequency above 3× median (clamp control shows it); vision `equivalent` at aniso 16 vs three with `texture.anisotropy = 16`; sharper than three's default aniso 1 is `aura3d-better`, not a regression |
| prd04-tinted-hero | C-02, C-09 | Texture detail retained under tint vs three `material.color.set()` per material | vision `equivalent`; masked Laplacian variance ≥ 90% of three's; shadow-side luma ≤ 1.1× three's |
| prd04-alpha-mask | C-04 real, C-27 MSAA | MASK edges under MSAA | Aura ≥ three − 0.5; edge gradient ≥ 2 px at MSAA 4× (≤ 1 px with A2C forced off) |
| all extension scenes | C-02, C-10 | lights reach extension materials | `light-count-extension-materials`: 24 point lights + clearcoat GLB; turning off light 20 changes pixels in its radius; `lightsDroppedByMaterial == 0` |
| 03/04/05/07 on WebGPU | C-29 real | WGSL parity | masked ΔE2000 mean ≤ 2 vs WebGL2 Aura |

### 16.3 Integrated acceptance: games (checkpoints only; never blocks)

Captured with `tools/quality-rebuild-capture/` (desktop 1920×1080 and 1280×720, mobile viewports from `games.json`)
and judged with the research/21 rubric at G-PANEL rounds. Visual categories: texture_quality, material_quality and
pbr_credibility. Each route is judged with its own `qrFlags` (PRD 14 opt-in) and with `all`; PRD 04's outcome is the
`all` capture, attributed by leave-one-out. Baselines are research/21 (texture / material / pbr). Where the gap is
asset-side, the required outcome is limited to what PRD 04 controls; the rest is PRD 05/14's. Every outcome includes a
machine check that does not depend on the vision judge. A pass needs the vision score and human sign-off; a human "no"
overrides a passing score.

| Game | Baseline t / m / p | Material-specific issue | PRD-04 lever | Required outcome |
|---|---|---|---|---|
| aura-clash-showcase | 4 / 3 / 3 | Fighter "clay mannequin" from raw-uniform overrides (E4) | R1 overrides (Q-14-2 migration), skinned lobes (C-18) | texture_quality ≥ 6; the judge no longer reports erased character textures; `inspectMaterials()` on both fighters lists `baseColor` in `enabledMaps` |
| showcase-aurora-lander | 1.5 / 2.5 / 2 | Flat teal lander, matte terrain | R1, R15, R3 | pbr_credibility ≥ 3.5; no lander material has `emissiveStrength > 0` unless authored emissive |
| showcase-bank-shot | 2 / 3 / 3 | Felt has no fiber or sheen; rails read as plastic | R3 sheen, R12 `fabric-normal`, R6 | material_quality ≥ 4.5; felt `extensions` contains `KHR_materials_sheen` and a procedural normal is bound |
| showcase-blockfall-reactor | 5 / 5 / 4 | Strongest current material; risk is regression | R3, R15 | no category below baseline; block `featureKey` unchanged or a superset |
| showcase-courier-rush | 3 / 3 / 2 | Tinted traffic cars, ~20 lights, emissive-painted city | R1, R5 (+ Q-01-3), R15 | traffic cars show authored textures; `lightsDroppedByMaterial = 0`; material_quality ≥ 5 |
| showcase-deep-recovery | 1 / 2 / 1.5 | 6 tinted models, flat translucent teal | R1, R4, R15 | texture_quality ≥ 4 after the R1 migration (asset swap may be needed, PRD 05); no transmissive pixel black (probe) |
| showcase-gallery-shift | 2 / 3 / 2 | ~31 lights > cap; "gold reads as yellow plastic" | R5, R3 IOR F0 + C-02 multiscatter | gold reads as metal; gold `metallic ≥ 0.9`, no emissive; `lightsDroppedByMaterial = 0`; material_quality ≥ 5 |
| showcase-gravity-post | 2.5 / 2 / 1.5 | Tinted dock gate; "everything unlit, flat or translucent" | R1, R14, R4 | gate retains textures; material_quality ≥ 4 |
| showcase-mech-hangar | 2.5 / 3.5 / 3.5 | Untextured script meshes (asset-side) | R3, R15 | no category below baseline; mech hero pbr_credibility ≥ 4.5; mean frame luma within ±10% of baseline |
| showcase-neon-swarm | 3 / 3 / 3 | "Black blobs look like missing materials" | R1, diagnostics | zero material issues under `A3D_QR_STRICT`; no 32×32 region with luma < 0.01 inside a lit subject mask |
| showcase-orbital-defense | 0.5 / 1.5 / 1 | No textures anywhere (asset-side) | R6 + R12 available to PRD 14 | no category below baseline; no PRD 04 score threshold |
| showcase-patrol-wing | 3 / 4 / 3 | Textured Meshy hero `patrolAircraftMeshy`; world untextured | R8, R9, R16 | hero material_quality ≥ 6 (needs C-09 real); hero texture bytes within tier budget |
| showcase-pulse-tunnel | 1 / 3 / 3 | Glossy clearcoat vehicle; over-driven neon | R3 clearcoat, R15 | hero material_quality ≥ 6 (needs C-09 real); codemod-pinned neon values unchanged until PRD 14 changes them |
| showcase-rooftop-buckets | 2 / 3 / 3 | Backboard emissive instead of glass; hero `rooftopShooterMeshyV1` | R4, R15 | backboard `extensions` contains `KHR_materials_transmission`, no emissive; hero material_quality ≥ 6 |
| showcase-siege-golf | 2.5 / 3 / 2.5 | Tinted crate with auto-glow | R1 | crate shadow-side luma ≤ 1.1× an untinted reference render; textures visible |
| showcase-skyline-runner | 4 / 4 / 3 | 3 tinted model calls; ice/snow have no spec | R1, C-02 spec-AA | pbr_credibility ≥ 4; tinted models list `baseColor` in `enabledMaps` |
| showcase-turbo-drift-circuit | 1.5 / 3 / 3 | Car paint clips; asphalt has no micro-roughness | R3 clearcoat, R6 | car body `featureKey` includes `clearcoat`; < 0.5% of car-body-mask pixels saturated in each of 3 captures; clearcoat reads as lacquer |
| showcase-vault-breakers | 1 / 2 / 1 | Matte single-colour plastic | R12 `rubber-roughness`, R3, R4 | no category below baseline; no PRD 04 score threshold |

---

## 17. Performance budgets

Tier definitions and the per-tier values for texture size, texture budget, anisotropy and MSAA are C-27
(`QUALITY_TIERS`, PRD 11; frozen table in CONTRACTS). Reference devices:
- Low: Intel UHD 620 laptop or Adreno 610-class Android, 1280×720.
- Medium: M1 8-core GPU or Adreno 650, 1920×1080.
- High: M1 Pro or RTX 3060, 2560×1440.
- Ultra: RTX 4070+, 3840×2160.

Budgets are **incremental material cost** on the game-scene benchmark (18) and on the heaviest material game
(Gallery Shift), measured with GPU timer queries (`EXT_disjoint_timer_query_webgl2`, C-28 real) where available. On
macos-14 CI, where timer queries are not exposed under ANGLE Metal, budgets are checked as the relative frame-time
ratios below the table.

Context: the current shipped games run at 5–15 fps on the macos-14 runner (Deep Recovery 0.5–1 fps; Orbital Defense
and Vault Breakers ~60 fps; `evidence/games/report.slim.json`). Material work must not be blamed for, or hide, those
costs, so each budget is a delta.

| Item | Low | Medium | High | Ultra |
|---|---|---|---|---|
| PRD 04 lobes on generated programs vs the same program with `A3D_QR_MATERIALS` off (all opaque materials) | ≤ +0.3 ms | ≤ +0.5 ms | ≤ +0.8 ms | ≤ +1.2 ms |
| Clearcoat+sheen+aniso+iridescence (per 10% screen coverage) | iridescence off → Schlick; ≤ +0.2 ms | ≤ +0.3 ms | ≤ +0.4 ms | ≤ +0.6 ms |
| Transmission capture + mips | off (env fallback) | half-res ≤ 1.0 ms | full-res ≤ 1.5 ms | full-res + bicubic ≤ 2.5 ms |
| Dispersion (3 samples) | off | off | on, ≤ +0.3 ms | on, ≤ +0.5 ms |
| A2C | 0 | ≤ 0.05 ms | ≤ 0.05 ms | ≤ 0.05 ms |
| CPU per frame (override application, `programFeatures()` on change) | ≤ 0.1 ms | ≤ 0.1 ms | ≤ 0.1 ms | ≤ 0.1 ms |
| Distinct PRD 04 lobe feature combinations per game route (counted from `programFeatures()`; total program budget is PRD 01/11's) | ≤ 16 | ≤ 32 | ≤ 48 | ≤ 64 |
| Texture memory budget (C-27 `textureBudgetBytes`) | 128 MiB | 256 MiB | 512 MiB | 1 GiB |
| Max texture dimension (C-27 `maxTextureSize`) | 1024 | 2048 | 4096 | 4096 |
| Transmission target memory | 0 | ≈ 5.5 MB | ≈ 39 MB (1440p) | ≈ 88 MB (4K) |
| Default anisotropy (C-27 `anisotropy`, R9) | 4 | 8 | 16 | 16 |
| MikkTSpace (per 100k verts, worker) | derivative frame only | ≤ 60 ms | ≤ 40 ms | ≤ 40 ms |
| Procedural texture generation (512², 256² on Low) | ≤ 8 ms each | ≤ 8 ms | ≤ 8 ms | ≤ 8 ms |

KTX2 transcode time is PRD 05's budget (C-16). Program compile time and total program count are PRD 01's (C-02) and
PRD 11's (C-27/C-28) budgets; PRD 04's share is the lobe-combination row above.

Bundle sizes are gzip, measured by the repo's bundle-size check (`BUNDLE_SIZES` / `aura3d check-deploy`):
- PRD 04 code in core `@aura3d/engine` + `@aura3d/rendering`: net **≤ +15 KB** with `A3D_QR_MATERIALS` code included
  (lobe chunks, WGSL twins, override layer, budget, procedural generators), checked in the lane workflow against the
  `85aafcd0` baseline.
- Lazy chunks are PRD 05's vendored files (MikkTSpace 48.8 KB raw; basis transcoder 527 KB wasm + 57.5 KB JS; Meshopt
  29 KB; Draco 286 KB wasm + 59 KB wrapper), fetched only when needed, from the app origin. CDN fetches are not allowed.

CI enforcement (macos-14): for `18-game-scene` and Gallery Shift, the median frame time over 300 frames with
`A3D_QR_MATERIALS` on must be ≤ 1.10× the same build with it off (standalone, S16), and with `qr_flags=all` ≤ 1.10×
`all,-materials` and ≤ 1.15× with `A3D_QR_MATERIALS_TRANSMISSION` on vs off (integrated). Texture bytes and lobe
combinations are exact and enforced from `AuraMaterialDiagnostics`. The ms columns are verified on the reference devices
(§19) once per G-PANEL round and recorded in `perf/<tier>.json`.

---

## 18. Browser coverage

| Browser | Backend | Required |
|---|---|---|
| Chrome stable (macOS, ANGLE Metal) | WebGL2 | All tests. Primary CI target (macos-14) |
| Chrome stable (Windows, ANGLE D3D11) | WebGL2 | Benchmarks 03/04/05/07/prd04-ktx2 captured at each G-PANEL round via a `windows-latest` job in `qr-prd04-materials.yml` (software/WARP adapter if no GPU; labelled and not used for vision scoring). Check that BC7/S3TC sRGB formats are selected once C-16 is real |
| Safari 17+ (macOS, Apple silicon) | WebGL2 | Manual run per G-PANEL round on a real Mac: 04, 05, 07, prd04-ktx2, prd04-tiled-ground; record screenshots. Check ASTC/ETC2 sRGB selection; check `createImageBitmap` resize fallback (R16) |
| Firefox stable | WebGL2 | Smoke: 03, 05, prd04-tiled-ground; `EXT_texture_filter_anisotropic` and `KHR_parallel_shader_compile` absence handling |
| Chrome stable | WebGPU | Integrated only (C-29 real): 03/04/05/07 within ΔE ≤ 2 of Aura WebGL2 |

Required capability fallbacks:
- No `EXT_color_buffer_float` / half-float colour buffer: RGBA8 transmission target + `transmission-ldr-capture`.
- No anisotropic filtering: trilinear.
- No `KHR_parallel_shader_compile`: synchronous compile (PRD 01's cache).
- No compressed formats: RGBA8 with `ktx2-uncompressed-fallback`.

---

## 19. Mobile coverage

- iOS Safari 17+ (A15-class or newer) and Android Chrome (Adreno 650 / Mali-G78 class), run manually per G-PANEL round
  on real devices, or through a device-farm job if PRD 11/12 provision one. Playwright mobile emulation on macos-14 is
  for layout only, never for GPU judgments.
- Low tier on mobile (C-27 default for coarse-pointer devices is `medium`; the Low column applies when PRD 11 tiers the
  device Low):
  - transmission env fallback, no dispersion
  - iridescence → Schlick
  - anisotropy 4
  - 1024 max texture size, 128 MiB texture budget
  - derivative tangents if the MikkTSpace module is not yet loaded
  - ASTC (iOS) or ETC2/ASTC (Android) KTX2 targets (C-16)
  - lobe sampler slots counted against `resolveLightingSamplerBudget` (C-12) with the device's `MAX_TEXTURE_IMAGE_UNITS`
    (16 on many Mali/Adreno parts); overflow drops lobes in `LIGHTING_SAMPLER_DROP_ORDER`
- Standalone on real devices: `prd04-tiled-ground` shimmer (S6) and a Meshy hero (`patrolAircraftMeshy`) loading within
  the 128 MiB budget without `webglcontextlost` (S9).
- Integrated on real devices: 05-transmission and prd04-tiled-ground without black pixels or seams; zero
  `material-program-fallback` and no compile errors across the §16.3 games' mobile captures.
- Per recommendation on mobile: R1/R2/R7/R13/R14/R15/R17 have no mobile-specific behaviour; R3 drops the iridescence film;
  R4 uses env refraction; R5 emits fewer lobe bits; R6 caps anisotropy at 4; R8 prefers the derivative frame until the
  worker result arrives; R9 selects ASTC/ETC2; R10/R11 unchanged; R12 generates 256²; R16 clamps to 1024.

---

## 20. Screenshots and evidence required

Under `docs/project/aura3d-quality-rebuild/evidence/prd-04/` (lane-owned):
- `<phase>.md`: GH Actions run ID of `qr-prd04-materials.yml`, commit SHA, flag set, and the §16.1 results table.
- `IC-<k>.md` per checkpoint: capture run ID, `PanelRoundRecord` reference, §16.2/§16.3 results, leave-one-out
  attribution, open `qr-request`s.
- `benchmark/<scene>-side-by-side.jpg`, `<scene>-diff.jpg` and masked metrics JSON for every §16.1 and §16.2 scene.
- `debug-views/<scene>-<view>.jpg` (integrated, C-02 real) for 04 (clearcoat, clearcoatRoughness,
  clearcoatRoughnessEffective), 07 (sheen), prd04-normal-tangent (tangent), prd04-anisotropy (anisotropyDirection).
- `games/<id>-before.jpg` / `<id>-after.jpg` (contact + mid shots) for all 18 §16.3 games with flags `none` and `all`,
  plus the `inspectMaterials()` JSON for each tinted model and the §16.3 machine-check results.
- `probes/<probe>-control.json`: the negative-control result for every probe (§15.4), showing it fails.
- `perf/<tier>.json`: the §17 deltas.
- `tint-migration.md`: per-call-site rows and decisions (§10.2).
- `material-conformance.json`: copied from the CI artifact.

These are evidence for review. They are not a quality claim by themselves.

---

## 21. Completion criteria

Merge readiness (each PR): §16.1 rows touched by the PR pass, plus `qr-contracts.yml` and the flag-off sentinel check.

Lane `standalone-accepted` (CONTRACTS §5.3): all §16.1 rows S1–S16 pass in one `qr-prd04-materials.yml` run on main.

Program completion (all on the final commit, judged at a G-PANEL round):
1. Every §16.2 scene meets its threshold with `qr_flags=all`, vision + human sign-off recorded.
2. Every §16.3 game meets its material outcome at a G-PANEL round with `qr_flags=all` on whatever v2 routes lane 14 has on main (integrated criterion; it never gates lane 04's standalone acceptance or merges), with human sign-off.
3. No PRD 04 code path contains asset-specific branches (source guard + review); `inspectMaterials()` on every Khronos
   fixture shows factors equal to the authored JSON.
4. `lightsDroppedByMaterial == 0` on all 18 games.
5. The support matrices are generated from conformance results; no extension is `conformant` without a passing
   integrated benchmark scene.
6. The §17 CI ratios are met on macos-14, and the ms budgets on the Medium reference device and a Low real device, with
   `perf/<tier>.json` committed.
7. PRD 04-owned E34 stubs are deleted; requests Q-01-7, Q-11-2, Q-05-3 are closed or listed as open in the checkpoint report.
8. `A3D_QR_MATERIALS` reached `default-on`, and the off path (C-03/C-15 stubs as live paths, `setTint` flatten,
   E22 rewrite, legacy tangents) is removed per CONTRACTS §5.4.
9. Facts F-04-* are `verified`; PRD 13 templates use the override API and none passes `replaceTextures: true` by default.

---

## 22. Rollback considerations

- **Lane flag:** `A3D_QR_MATERIALS` off returns every PRD 04 path to the C-03/C-15 stubs (today's behaviour). URL
  `?a3d-qr=all,-materials` or env `A3D_QR=all,-materials` excludes it per capture (CONTRACTS §5.2). After `default-on`,
  `-materials` remains as a deprecated opt-out until removal.
- **Tint semantics:** per call site `materialOverrides: [{ color, replaceTextures: true }]`. The global hard-coded
  flatten is not restored once the flag is removed.
- **Transmission:** `A3D_QR_MATERIALS_TRANSMISSION=0` or `renderer.transmission: "env"`; `"env"` is still non-black.
- **KTX2 compressed upload:** `A3D_QR_MATERIALS_KTX2=0` (alias `assets.ktx2: "rgba8"`) if a driver mis-decodes a format.
- **MikkTSpace:** `GLTFRenderResourceOptions.tangents: "legacy" | "derivative"`.
- **Diffuse lobe:** Burley via C-02 `diffuseModel: "burley"` (PRD 01) if the judge attributes a regression to Lambert.
- **Alpha-to-coverage:** `alphaToCoverage: false` per material or `renderer.alphaToCoverage: false`.
- **Procedural material textures:** `materialStrictness: "warn"` plus a per-kind disable list returns that preset to its
  scalar material with a `procedural-texture-failed` issue.
- **Hack removal is not rolled back.** If an evidence capture changes, the evidence is re-captured. Restoring
  asset-specific code is forbidden.
- Every path is reported in `app.diagnostics().materials.paths` and `diagnostics().qrFlags`, so captures record which
  path ran.

---

## 23. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Lobes are invisible until C-02 is real, so most visual payoff lands only at checkpoints | High | Medium | Standalone acceptance covers everything PRD 04 can prove on the legacy path (§16.1); lobe numerics are proven in ChunkHarness; integrated scores are tracked from IC-1 screening |
| Correct lobes look flat until C-09 (PRD 02 environment) is real | High | Medium | Integrated rows list C-09; benchmark scenes use their own mipmapped HDRI; leave-one-out separates the causes |
| Flag-on legacy path shows an inconsistent mix (multiply tint + legacy fudge lobes) | Medium | Medium | Q-01-1 gates the worst legacy hacks; diagnostics `paths.materialModel` records `legacy`; routes opt in only at `standalone-accepted` |
| Games tuned around the tint glow and emissive defaults go dark | High | Medium | Codemod pins old emissive values; per-site tint review; PRD 14 re-lights |
| Lobe combinations multiply program count on mobile | Medium | High | Per-tier lobe-combination budget (§17); Low emits fewer bits; PRD 01 superset fallback |
| WebGL2 sampler limits with all extension maps + shadows + env + LUT + transmission | Medium | High | C-12 sampler budget with the fixed drop order; `lobe-dropped-sampler-budget` issue; matrix status `approximate` |
| Preset symbol marker breaks an existing deep-equality test | Low | Low | Fallback to a `WeakMap` marker (R15); codemod covers spread sites |
| Requests to other lanes slip (Q-01-*, Q-05-*, Q-15-*) | Medium | Medium | Each has a documented meantime path; affected criteria are integrated and move to the next checkpoint; unresolved requests are listed in checkpoint reports |
| Transmission capture cost in scenes with many glass objects | Medium | Medium | One capture per frame regardless of count; half-res on Medium |
| Khronos sample-asset licensing (some are not CC0) | Low | Low | License per asset in `scenes/prd04/assets.ts`; only redistributable assets in the repo |
| Human/vision judgment variance | Medium | Medium | G-PANEL 2 humans + 1 vision model, median of record; fixed specs and seeds |
| Skinned lobes regress animation | Medium | High | Integrated 08/15 rows; PRD 06 review (Q-06-1) |
| Deliberate r185 deviations (spec-order UV transform for non-uniform scale, bilinear transmission on Medium) read as bugs by the judge | Medium | Low | Listed in support-matrix `notes` and the judge prompt; TextureTransformTest uses uniform scale |
| Draco/Meshopt/KTX2 fixtures depend on PRD 05 encoders | Medium | Medium | One-off pinned CI encode committed as fixtures (P1-9) |

---

## 24. Explicitly out of scope

- The program generator, program cache, base `brdf` chunk, DFG LUT, Lambert/Burley, spec-AA and multiscatter (PRD 01, C-02).
- Frozen legacy shader edits (PRD 01), except as §12.3 requests.
- Environment/IBL generation, PMREM quality, default HDRI, env sampler fix, specular occlusion in the IBL chunk, cluster
  quality (PRD 02).
- Tone mapping, exposure, bloom, AA passes (PRD 03). A2C render state application is PRD 01's (C-04); PRD 04 owns only
  the material request and shader feature.
- KTX2 target selection, transcoding, decoders, vendoring, sRGB internal formats, asset encoding, re-authoring,
  decimation, texture resizing at `assets add`, and replacing unlit cards and untextured script meshes (PRD 05).
- WebGPU device code and WGSL generator target (PRD 11). PRD 04 supplies WGSL twins only.
- Route and template edits (PRD 14, PRD 13). PRD 04 supplies codemods, reports and facts.
- The instancing `node.size` bug (`index.ts:14747`, PRD 15 per CONTRACTS §0 R18) and primitive tessellation (PRD 01).
- Real `KHR_materials_diffuse_transmission` back-lighting, subsurface scattering, layered transmission (transmissive
  seen through transmissive), screen-space caustics.
- `KHR_materials_pbrSpecularGlossiness` beyond the existing conversion.
- Node-based/custom shader material authoring (`shader: "solar-sun"` etc. keep working unchanged).
- The `@aura3d/materials` package (PRD 15 decides between deletion and a rebuild on the new API). Until then it must not
  be advertised as "50 PBR materials" (research/08 §2).
