# PRD 04: Materials, Textures and glTF Fidelity

Program: Aura3D visual-quality autopsy and rebuild (branch `aura3d-quality-rebuild/audit`).
Status: Draft for implementation. Owner track: rendering + assets + engine agent-api.
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

Gate: this PRD is not complete when tests pass, routes return 200, screenshots are non-blank, or a
parity matrix is green. It is complete only when the material benchmark scenes and the listed games,
judged visually against three r185 by a vision model and a human reviewer, meet the thresholds in
section 16. Aura3D is not Three.js-quality today; nothing in this document may be cited as evidence
that it is until those thresholds are met.

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
E20–E22, E24, E29–E32 at the cited lines; E4, E9, E29 and E32 were corrected. Line numbers drift: every task
in §14 names the symbol as well as the line, and the symbol wins if they disagree.

| # | Defect | Location | Observed code |
|---|---|---|---|
| E1 | Tint is hard-wired to replace textures | `packages/engine/src/agent-api/index.ts:13567-13580` | `...(node.material?.color ? { tint: { baseColor, replaceSurfaceTextures: true, ...` (no opt-out) |
| E2 | Tint disables maps and adds glow on every material | `packages/engine/src/production-runtime/TypedGLBActor.ts:477-515` | `u_baseColorTextureEnabled=0`, `u_metallicRoughnessTextureEnabled=0`, `emissiveStrength ?? 0.28`, `roughness ?? 0.38`, `metallic ?? 0.16`; `/joint/i` name special case |
| E3 | `material.pbr` always sets a color | `index.ts:2415-2420` | `color: "#d7dee8"` before `...options` |
| E4 | Route-local raw-uniform material pokes | `apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts:3372-3415` (setup, `collectFighterFlashMaterials`), `3441-3473` (hit-flash pulse/restore) | `material.setParameter("u_baseColor", ...)`, `u_roughness`, `u_specularFactor`, `u_environmentIntensity 1.16` keyed off material-name substrings (`ranger` → outfit, `regular`/`superhero` → skin, `hair`, lines 3379-3381); the flash adds `+flashAmount*1.1` env intensity and `+1.6` emissive strength |
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
| E32 | Emissive defaults | `index.ts:2443-2450`, `2494-2500`; engine fallback at **three** sites: `index.ts:14391` (textured C1 path), `14896` and `14912` (primitive material) | `emissive` body `#111827` and no `emissiveIntensity`, so the effective strength is the engine fallback `emissiveIntensity ?? (emissive ? 1.35 : 0)`; `neon` 2.8 |
| E33 | No alpha-to-coverage | repo-wide `rg SAMPLE_ALPHA_TO_COVERAGE` returns 0 `[r03]` | MASK uses hard `discard` |
| E34 | Fake-parity stubs that look like a material compiler | `packages/rendering/src/production-runtime/shaders/chunks/*.glsl`, `wgsl/pbr.wgsl`, `production-runtime/materials/{GLTFMaterialAdapter,MaterialCompiler,PBRShaderFeatures}.ts`, `packages/rendering/src/materials/TransmissionPass.ts:19-44`, `packages/assets/src/loaders/KTX2Loader.ts:3-6` `[r03, r11]` | unregistered / CPU single-sample / diagnostic-only |
| E35 | Support matrix overclaims | `packages/assets/src/GLTFExtensionSupport.ts:39-68`; `packages/engine/src/material-physical/PhysicalMaterialSpec.ts:43-52` `[r03]` | `KHR_materials_ior` "runtime-supported" |
| E36 | No texture size clamp; 4096² Meshy maps | research/03 §5.3, research/11 §1 | 9 of 120 referenced GLBs carry 4096² images; ≈200 MB VRAM per Meshy hero |

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

- `@aura3d/rendering`: shader library, chunks, materials, samplers, devices, transmission target, KTX2 upload.
- `@aura3d/assets`: glTF render-resource mapping, tangents, KTX2 transcoder, decoders, variants, extension support matrix.
- `@aura3d/engine`: `agent-api` material spec, presets, the `model()` override API, the production primitive material path, `TypedGLBActor`.
- `@aura3d/materials`: presets must be rebuilt on real inputs or removed (research/08 §2: "50 PBR materials" from `Array.from({length:50})`).
- `apps/aura-clash-showcase`, `apps/wow-webgpu-product-viewer`, and every showcase that passes `material:` to `model()` (research/03 §9 lists 26 nodes).
- `benchmarks/quality-rebuild` (new scenes, shared with PRD 12).
- `packages/aura3d-cli` (only to stop advertising unsupported extensions; asset encoding is PRD 05).

---

## 5. Affected files and directories

Modify:
- `packages/rendering/src/ShaderChunks.ts`: replace the BRDF helpers (`a3dPbrF0`, the direct BRDF, `a3dApplyAdvancedPbrLobes`, scalar iridescence and anisotropy).
- `packages/rendering/src/ShaderLibrary.ts`: textured PBR (2062-3238), skinned-lit (564-1058, 1090-1588), instanced PBR (100-480).
- `packages/rendering/src/ShaderLibraryCore.ts`: scalar PBR (291-784).
- `packages/rendering/src/TexturedPBRMaterial.ts`, `PBRMaterial`, `InstancedPBRMaterial`, `SkinnedLitMaterial`: uniform sets, defaults (`:460` LUT off, `:468` transmission energy).
- `packages/rendering/src/Sampler.ts`: named presets. Defaults stay as they are for API stability (see §11).
- `packages/rendering/src/WebGL2Device.ts`: compressed sRGB formats, extension probing, A2C state, mip generation for RGBA16F target.
- `packages/rendering/src/WebGPUDevice.ts`: remove hacks (3555-3588, 3665, 3675-3691, 3738-3773). Port the BSDF in WGSL (PRD 11 owns the WebGPU backend; this PRD owns the material WGSL).
- `packages/rendering/src/ForwardPass.ts`: transmission pass ordering, clustered binding for every variant (251-258).
- `packages/rendering/src/BRDFLut.ts`: add the r185 DFG LUT (`createDFGLut`, ported from `DFGLUTData.js`). No sheen LUT; r185 uses the analytic `IBLSheenBRDF`.
- `packages/assets/src/GLTFRenderResources.ts`: tangents (1216-1262), glass rewrites (1743-1769, 1840, 2026), default material (1660-1673), sampler (2196-2213), KTX2 call (2222-2227), variants (1141).
- `packages/assets/src/KTX2BasisTextureTranscoder.ts`, `GLTFCompressionDecoders.ts`, `GLTFExtensionSupport.ts`.
- `packages/assets/src/asset-corpus/ProductionGLTFRenderPipeline.ts:75`: decoder and variant pass-through.
- `packages/engine/src/production-runtime/TypedGLBActor.ts`: override model, decoders, variants.
- `packages/engine/src/agent-api/index.ts`: `AuraMaterialSpec` (1027-1120), `AuraModelOptions` (1235), `model()` (2098), `material.*` (2414-2640), tint bridge (13560-13580), primitive material and texture path (14040-14460, 14877-14940), SDF text sampler (14529).
- `packages/engine/src/material-physical/PhysicalMaterialSpec.ts`: the matrix must reflect conformance results.
- `apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts:3370-3415`; `apps/wow-webgpu-product-viewer/src/main.ts:51-66`.

Add:
- `packages/rendering/src/shaders/physical/` (GLSL chunk sources as TS string modules): `bsdf_common.glsl.ts`, `physical_direct.glsl.ts`, `physical_ibl.glsl.ts`, `clearcoat.glsl.ts`, `sheen.glsl.ts`, `iridescence.glsl.ts`, `anisotropy.glsl.ts`, `transmission.glsl.ts`, `tangent_frame.glsl.ts`, `uv_transform.glsl.ts`.
- `packages/rendering/src/shaders/physical-wgsl/`: WGSL equivalents.
- `packages/rendering/src/materials/PhysicalFeatureKey.ts`: feature bitmask → defines → program cache key.
- `packages/rendering/src/TransmissionRenderTarget.ts`.
- `packages/rendering/src/ProceduralMaterialTextures.ts`: generators for the 4 agent-API kinds.
- `packages/assets/src/MikkTSpaceTangents.ts`, plus a vendored `mikktspace` wasm (MIT, as used by three) loaded lazily.
- `packages/assets/src/KTX2TargetSelection.ts`.
- `packages/engine/src/production-runtime/ModelMaterialOverrides.ts`.
- Tests: see §15.

Delete (after the replacement lands and the support matrix is updated):
- `packages/rendering/src/production-runtime/shaders/chunks/{brdf,ibl,pbr.frag,pbr.vert,shadows}.glsl`, `production-runtime/shaders/wgsl/pbr.wgsl`.
- `packages/rendering/src/production-runtime/materials/{GLTFMaterialAdapter,MaterialCompiler,PBRShaderFeatures}.ts` (or rewrite them as thin re-exports of the real implementation).
- `packages/rendering/src/materials/TransmissionPass.ts` (`evaluateExternalParityTransmission` CPU function). Move it to `tests/` as a reference oracle if a test needs it.
- `packages/assets/src/loaders/KTX2Loader.ts` stub. Replace it with a real re-export.

---

## 6. Architecture proposal

### 6.1 Target architecture

```
glTF / AuraMaterialSpec / material.* preset
        │  (no heuristics, no rewrites; spec-exact mapping)
        ▼
PhysicalMaterialDescriptor  (one CPU struct for scalar, textured, instanced, skinned)
        │  featureKey = bitmask(maps present, extensions active, skinning, instancing, morph,
        │                       alphaMode, A2C, transmission-target, clustered, shadows)
        ▼
PhysicalProgramCache  → GLSL/WGSL assembled from shaders/physical/* chunks with #defines
        │
        ▼
ForwardPass: opaque → (if any visible transmissive) TransmissionRenderTarget capture+mips
             → transmissive → blended → post (PRD 03)
```

Principles:
- **One BSDF.** `aura3d/pbr`, `aura3d/instanced-pbr`, `aura3d/pbr-textured` (all 10 variants) and
  `aura3d/skinned-lit` (4/8 influences) all become one physical program family. Vertex features
  (skinning, instancing, morph) and fragment features (extensions, maps) are orthogonal defines.
  This removes the separate skinned shader that never got the extensions (E26).
- **Spec-exact import.** The glTF → descriptor mapping copies factors, textures, samplers,
  texCoord and the KHR_texture_transform of every slot verbatim. Asset-specific behaviour is not
  allowed in shared code. If a test asset needs a workaround, the asset gets fixed.
- **Per-frame uniform data vs compile-time features.** Features that change cost (extension lobes,
  transmission, clustered lights, A2C) are compile-time defines selected by the feature key.
  Per-material scalars stay uniforms. Runtime float-uniform branching on feature toggles
  (`step(0.5, u_xTextureEnabled)` for whole lobes) is removed for lobes. It may stay for per-map
  enable flags inside an already compiled lobe.
- **Override, don't replace.** Public model material changes become a *material override layer*
  that multiplies onto authored data per sub-material, with explicit opt-in to replacement.
- **Fail loudly.** A requested feature that cannot render (unsupported decoder, procedural kind
  without a generator, a light over budget) produces a structured diagnostic in
  `app.diagnostics().materials` and, in `strict` mode, an error. It never silently records the input
  and keeps going.

### 6.2 Recommendations with cost profile

Costs are relative to the current shipping path at 1080p. "+X ms" is a budget ceiling verified in §17,
not a measurement. Absolute millisecond ceilings are verified on the §17 reference devices; the
macos-14 CI runner (ANGLE Metal on a virtualized Apple-silicon VM, no timer queries) only enforces the
relative frame-time deltas defined in §17.

**R1. Tint semantics: multiply, keep textures, no auto-emissive, per-material targeting.**
`model(asset, { material: { color } })` multiplies `baseColorFactor` by `color` and leaves every
texture, roughness, metallic and emissive value untouched unless that field is given explicitly.
`replaceTextures: true` restores the flatten behaviour. Overrides can target material names.
The `/joint/i` special case is deleted.
- Visual benefit: high. Restores authored albedo, roughness and normal detail on the 26 tinted model
  nodes, and removes the self-glow that keeps tinted models from ever going dark in shadow.
- GPU: 0. CPU: 0 (one-time uniform writes). Memory: 0. Bundle: +≈1 KB. Mobile: neutral.
- Fallback: none needed. Legacy behaviour is available through `replaceTextures: true`.

**R2. Delete asset-specific hacks and fudge constants.** This covers E10–E14, E16–E23, the
`roughEnvironmentFloor` / stripe terms (E19), the `mix(1.1,0.65,r)` env scale, the Duck route clamp
(E21), and the `/joint/i` tint branch.

Deletion is sequenced so no lobe is left unscaled without its replacement:
- Phase 1 (no replacement needed): E18 red gate, E19 stripes/floor, E20 WebGPU Duck gates, E21 Duck
  route clamp, E23 clearcoat-shell cull override, the `/joint/i` branch.
- Phase 2 (with the R3 core): E10/E11 clearcoat floors and coat-normal blend, E15 fixed F0, E16 advanced-lobes darkening.
- Phase 3 (with the R3 lobes): E12 sheen fudge, E13 anisotropy suppression, the cosine-palette iridescence.
- Phase 4 (with R4): E14 transmission blend, E17 fake dispersion, E22 glass import rewrite. Deleting E22
  before a non-black transmission path exists would turn the affected glass from dark plastic into a
  ≤58% blend over nothing, so it waits for `A3D_TRANSMISSION_ENV` at minimum.
- Visual benefit: high. Removes the milky clearcoat veil, the red-paint recolor and the dark glass,
  and restores roughness response.
- GPU: −3 to −8% fragment ALU on textured materials (fewer instructions). CPU: 0. Memory: 0.
- Bundle: −10 to −20 KB of shader source (`ShaderLibrary.ts` is 175 KB raw today).
- Mobile: positive.
- Fallback: none. Hacks are not a feature. Assets that depended on them are re-authored (§10).

**R3. Unified physical BSDF ported from three r185 semantics.** This includes:
- IOR-driven F0
- `KHR_materials_specular` on top of the IOR F0
- direct multiscatter (`BRDF_GGX_Multiscatter`, which in r185 reads the DFG LUT at both NdotV and NdotL)
- the r185 DFG LUT itself (`DFGLUTData.js`: 16×16 RG16F, sampled at `(roughness, NdotV)`), ported as data, not regenerated
- Lambert base diffuse with the r185 `(1 − totalScatteringDielectric)` indirect weight (r185 uses `BRDF_Lambert`; Aura's Burley is kept only as an opt-in define, because acceptance compares against r185)
- geometric specular AA (`geometryRoughness`)
- clearcoat as a separate lobe with base attenuation `(1 − cc·Fcc)` and roughness floor 0.0525
- sheen: Charlie D, Neubelt V, IBL sheen via r185's analytic `IBLSheenBRDF` fit (Estevez–Kulla), energy compensation `1 − max3(sheenColor)·IBLSheenBRDF`
- glTF anisotropy: `alphaT = mix(α², 1, aniso²)` and a bent-normal IBL
- iridescence that replaces Fresnel
- emissive_strength
- correct unlit

It is implemented once in `shaders/physical/*` and compiled into every program.
- Visual benefit: very high. This is the scene-defining fix for 04, 07, the coat on 02, and every car paint, fabric, brushed metal and soap-film asset.
- GPU, all features off: ≈ current base cost. Specular AA adds 4 derivative ops. Direct multiscatter adds 2 LUT fetches per light (V and L); the V fetch is shared with IBL.
- GPU, all extensions on: ≤ +25% fragment cost vs the current atlas variant, because it replaces the existing fudge lobes.
- CPU: program-cache compile cost (see R5). Memory: +1 LUT 16×16 RG16F (1 KB). No sheen LUT (r185 uses the analytic fit on every tier).
- Bundle: net ≈ 0 to −10 KB (replaces duplicated code in 4 shader families; the LUT data is ≈1.4 KB as a hex array).
- Mobile: extension lobes compile only when used. Low tier replaces the iridescence film with Schlick (§17).
- Fallback: none needed for the LUT. RG16F is texture-filterable in WebGL2 core (ES 3.0) and `rg16float` is filterable in WebGPU. A device that fails to create it is a context error, reported as `material-program-fallback`.

**R4. Real transmission.**
- A `TransmissionRenderTarget` (opaque scene colour, linear HDR RGBA16F, full mip chain) is
  captured once per frame after the opaque pass, but only when any visible material has
  `transmission > 0`.
- Transmissive materials sample it at `lod = log2(viewportSize) · applyIorToRoughness(roughness, ior)`,
  matching three's `getTransmissionSample`.
- Refraction direction comes from `refract(−v, n, 1/ior)` scaled by `thickness · modelScale`.
- Volume attenuation is Beer–Lambert with `attenuationDistance` in world units.
- Dispersion uses per-channel IOR `ior ± halfSpread` with `halfSpread = (ior − 1) · 0.025 · dispersion`
  (three r185 formula), giving 3 samples.
- `material.glass` defaults to `opacity: 1, transmission: 1`.
- The glass import rewrite (E22) is deleted.

Costs and fallback:
- Visual benefit: very high for glass, visors, bottles and water features. It fixes 05 (black bowl) and car windows.
- GPU: ≤1.0 ms (Medium, half-res target) and ≤1.5 ms (High, full-res) at 1080p for capture + mip generation. Per-pixel cost: 1 sample, or 3 with dispersion.
- CPU: one extra pass submission. Memory: 1080p RGBA16F + mips ≈ 22 MB full-res, ≈ 5.5 MB half-res.
- Bundle: +≈4 KB. Mobile: Low tier disables the target.
- Fallback: Low tier refracts the prefiltered environment with correct Fresnel and Beer attenuation. Transmissive surfaces must never render black: if both the target and the env map are missing, they fall back to the `ambient` term with `alpha = 1 − transmission·(1 − F)`.

**R5. Generated shader variants (feature key + program cache) and no light cap on extension materials.**
- `PhysicalFeatureKey` builds defines from material and draw state.
- Programs compile lazily per key. On WebGL2 they compile asynchronously with
  `KHR_parallel_shader_compile` when available. Every key reachable from a loaded asset (its
  materials × the current light/shadow state) is compiled before the model's `ready` promise
  resolves, so first frames never use a substitute. A key that first appears at runtime (an override
  toggles a lobe, a 17th light appears) keeps drawing with the draw's previous program until the new
  one links, for at most 3 frames, and logs `material-program-pending`. It never draws with an
  unrelated program.
- `A3D_PBR_DISABLE_CLUSTERED_LIGHTING` is removed from extension variants. Every program supports
  both the uniform path (≤16) and the clustered path (>16) using the same light data.
- PRD 02 owns cluster quality (3D slices, GPU build). This PRD owns the requirement that a material
  never evaluates fewer lights than the base variant does.
- Visual benefit: high for multi-light scenes. Gallery Shift's ~31 and Courier's ~20 lights reach GLB materials.
- GPU: clustered loop cost is identical to the base variant's today. CPU: compile on first use, ≤ 40 ms per program on M1. Programs are cached per session; `app.precompileMaterials()` warms them.
- Memory: ≤ 64 live programs in a typical game. Bundle: −(hand variant table).
- Mobile: program count matters, so the Low tier merges rarely used extension features into the nearest superset key.
- Fallback: if a program fails to link, use the nearest superset key and log `material-program-fallback`.

**R6. Texture sampling correctness and anisotropy defaults.**
- Primitive and SDF text samplers become `linear-mipmap-linear` with `repeat` and anisotropy taken from the tier.
- `wrap` is exposed per slot on `AuraMaterialSpec`.
- In-shader `fract()` wrapping is replaced by hardware wrap, including the `mirrored-repeat` sampler mode.
- The atlas variant samples with `textureGrad(uvUnwrapped derivatives)`.
- Default anisotropy: Low 4, Medium 8, High 16, Ultra 16, clamped to the device maximum.
  `textureAnisotropy` stays as an override.
- Visual benefit: high. Ground and wall textures can tile without shimmer, seams disappear on
  KHR_texture_transform scale > 1, and games can stop painting with emissive.
- GPU: aniso 16 vs 8 costs ≤ +3% of texture bandwidth on desktop. Mips are already generated, so sampling them costs nothing extra.
- CPU: 0. Memory: 0, since mips already exist (index.ts:14373 counts mip bytes). Bundle: +≈0.5 KB.
- Mobile: aniso 4 on the Low tier.
- Fallback: devices without `EXT_texture_filter_anisotropic` use trilinear only.

**R7. KHR_texture_transform everywhere.**
- Per-slot offset, rotation, scale and texCoord override in every program, including skinned (E26).
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
- When a primitive has a normal map, no TANGENT attribute and indexed TEXCOORD_n, run MikkTSpace
  (vendored from `node_modules/three/examples/jsm/libs/mikktspace.module.js` r185, the `mikktspace` npm
  build, MIT; the license header is copied with it. three uses the same module in
  `BufferGeometryUtils.computeMikkTSpaceTangents`, which defaults `negateSign = true` for glTF UV
  convention; Aura must match that sign) in a worker at load time.
- Without wasm, use a per-pixel derivative tangent frame (three's `getTangentFrame`).
- In the vertex shader, transform tangents by `mat3(u_model)`, not the normal matrix. In the
  fragment shader, re-orthogonalize: `T = normalize(T − N·dot(N,T))`, `B = cross(N,T)·w`.
- Visual benefit: medium-high on Meshy, Substance and Blender heroes: no seam shading, correct normal maps under non-uniform scale.
- GPU: +3 ALU. CPU: worker, ≤ 40 ms per 100k vertices on M1, cached by asset hash for the session.
- Memory: +16 bytes per vertex for generated tangents (already the case today). Bundle: r185's `mikktspace.module.js` is 48.8 KB raw (wasm inlined as base64); lazy-loaded only when needed; gzip size is measured and recorded when vendored.
- Mobile: worker-based. Low tier uses the derivative frame without wasm.
- Fallback: derivative frame. PRD 05 bakes TANGENT at `assets add`, so runtime generation becomes rare.

**R9. KTX2/Basis done properly.**
- `selectKTX2TargetFormat(caps)` picks, in order: ASTC 4x4, then BC7, then ETC2, then BC3/ETC1. RGBA8 is used only when no compressed format is supported.
- Formats are probed with `WEBGL_compressed_texture_astc`, `EXT_texture_compression_bptc`, `WEBGL_compressed_texture_etc` and `WEBGL_compressed_texture_s3tc(_srgb)`.
- Each file is transcoded once, to that target.
- Color-space intent is preserved through transcode, and the matching sRGB internal format is used (`COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR`, `COMPRESSED_SRGB_ALPHA_BPTC_UNORM_EXT`, `COMPRESSED_SRGB8_ALPHA8_ETC2_EAC`, `COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT`).
- The transcoder is bundled locally (no `unpkg` fetch, E27) and runs in a worker pool of size `min(2, hardwareConcurrency − 1)`.
- Visual benefit: medium. Base color is no longer washed out on compressed upload, and the asset pipeline (PRD 05) can ship compressed textures safely.
- GPU: −50 to −75% texture memory bandwidth with compression. CPU: −50% transcode time, since there is no double transcode.
- Memory: −4× to −8× VRAM versus RGBA8. Bundle: r185's `libs/basis/basis_transcoder.wasm` is 527 KB raw and `basis_transcoder.js` 57.5 KB raw; both lazy-loaded only when a KTX2 texture is present (gzip measured at vendoring).
- Mobile: strongly positive (ASTC/ETC2).
- Fallback: RGBA8, logged as `ktx2-uncompressed-fallback`.

**R10. Draco/Meshopt decoder injection on the `model()` path.** `createTypedGLBActor` checks
`extensionsRequired` / `extensionsUsed` and lazily loads local decoders, then passes them through
`loadProductionGLTFRenderPipeline`. This is decode-only; encoding is PRD 05.
- Visual benefit: indirect. It lets the asset pipeline ship decimated, compressed assets.
- GPU: 0. CPU: decode in a worker. Memory: transient.
- Bundle (r185 raw sizes): Meshopt `meshopt_decoder.module.js` 29 KB; Draco `draco_decoder.wasm` 286 KB + `draco_wasm_wrapper.js` 59 KB. Both lazy; gzip measured at vendoring.
- Mobile: positive (smaller downloads).
- Fallback: a clear load error naming the extension. It does not throw from deep inside `GLTFLoader.ts:1312`.

**R11. KHR_materials_variants reachable from the public API.** `model(asset, { variant })`,
`handle.setMaterialVariant(name)` and `handle.materialVariants()`.
- Visual benefit: low-medium (product configurators, team colours without tinting).
- GPU: 0. CPU: material rebinding on switch. Memory: all variant materials resident (already true in the asset layer). Bundle: +≈1 KB.
- Mobile: neutral. Fallback: an unknown variant leaves the default materials in place and logs an error.

**R12. Procedural material textures actually applied.**
- Implement generators for `fabric-normal`, `rubber-roughness`, `brushed-metal-anisotropy` and
  `plastic-micro-scratch` in `ProceduralMaterialTextures.ts`.
- Each generator is CPU-side, deterministic and seeded. It produces a 512² tileable image
  (256² on the Low tier) with mips and `repeat`, cached per `(kind, scale, strength, contrast, seed)`.
- The images are bound to the requested slot: normal, roughness, anisotropy (rg direction, b strength) or roughness+normal.
- Visual benefit: medium. The fabric, brushedMetal, blackRubber and frostedGlass presets start rendering their intended micro-detail.
- GPU: 1 extra fetch per slot. CPU: ≤ 8 ms per texture once. Memory: 512² RGBA8 + mips ≈ 1.4 MB each, so ≤ 6 MB for all 4 kinds.
- Bundle: +≈4 KB. Mobile: 256² on Low.
- Fallback: if generation fails, a material diagnostic is emitted and the scalar material is kept. In strict mode, generation failure is an error.

**R13. Alpha-to-coverage for MASK under MSAA.** When MSAA is active and `alphaMode === "MASK"`,
enable `SAMPLE_ALPHA_TO_COVERAGE` and output r185's `alphatest_fragment` form:
`a = smoothstep(cutoff, cutoff + fwidth(a), a); if (a == 0.0) discard;`. Otherwise keep `discard`.
- Visual benefit: medium for foliage, hair, fences and decals (research/03 §8).
- GPU: negligible. CPU: a state toggle. Memory: 0. Bundle: <1 KB. Mobile: same (A2C is core in WebGL2 and WebGPU). Fallback: `discard` when MSAA is off.

**R14. Unlit correctness.** `KHR_materials_unlit` outputs `baseColorFactor · baseColorTexture ·
COLOR_0`, goes through the same output transform as lit materials (tone mapping and output colour
space owned by PRD 01/03), and is never modified by environment, fog-tint hacks or emissive defaults.
The asset policy that heroes must not be unlit belongs to PRD 05/13. This PRD only guarantees that
unlit renders exactly as authored.
- Visual benefit: low by itself; it removes env/fog tinting from unlit cards. GPU: −(lighting loop) for unlit draws. CPU: 0. Memory: 0. Bundle: ≈0 (one define). Mobile: neutral. Fallback: none; unlit has no unsupported inputs.

**R15. Preset defaults that stop rewarding glow.**
- `material.emissive` defaults to `emissiveIntensity: 1.0` and a body colour equal to `color` or a mid-grey, instead of `#111827`.
- `material.neon` defaults to intensity 2.0.
- `material.pbr` no longer injects `color`. It leaves `color` undefined, which renders as the glTF default white (R1 makes this harmless for models).
- `material.glass` defaults to `opacity 1`.
- `material.metal` drops `envMapIntensity 1.45` (PRD 02 owns IBL energy).
- The engine fallback `emissiveIntensity ?? (emissive ? 1.35 : 0)` becomes `?? (emissive ? 1.0 : 0)` at all three sites (`index.ts:14391`, `14896`, `14912`).
- Visual benefit: medium. Scenes stop defaulting to glowing toy plastic.
- GPU, CPU, memory, bundle: 0. Mobile: neutral.
- Fallback: games that depend on the old look pin values explicitly (§10).

**R16. Texture budgets and size clamp at upload.**
- Clamp every texture to `min(MAX_TEXTURE_SIZE, tierMaxDim)` (Low 1024, Medium 2048, High 4096, Ultra 4096) by GPU blit-downsample before mip generation.
- Enforce the tier memory budget (Low 128 MiB, Medium 256 MiB, which is the current default at
  `index.ts:14598-14600`, High 512 MiB, Ultra 1 GiB) by dropping top mips of the largest textures first.
- Emit a `texture-budget-exceeded` diagnostic listing the textures.
- Visual benefit: no loss at game camera distances. It prevents OOM and black frames on mobile.
- GPU: one-time blit. CPU: 0 (GPU downscale). Memory: Meshy hero 4096² ×3 ≈ 268 MB → 2048² ≈ 67 MB on Medium.
- Bundle: +≈2 KB. Mobile: required.
- Fallback: if the blit is unsupported, a CPU canvas downscale in a worker.

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

### 7.1 `@aura3d/engine` agent API (`packages/engine/src/agent-api/index.ts`)

```ts
/** Wrap mode for a texture slot. Hardware sampler wrap; never emulated in-shader except atlas. */
export type AuraTextureWrap = "repeat" | "clamp" | "mirror";

export interface AuraTextureSampling {
  readonly wrap?: AuraTextureWrap | { readonly u: AuraTextureWrap; readonly v: AuraTextureWrap };
  /** Default "trilinear". "nearest" is for pixel art only. */
  readonly filter?: "trilinear" | "bilinear" | "nearest";
  /** Overrides the tier default (Low 4, Medium 8, High 16, Ultra 16). Clamped to device max. */
  readonly anisotropy?: number;
}

export interface AuraMaterialSpec {
  // ...existing fields kept...
  /** KHR_materials_specular. Defaults 1 / white. */
  readonly specularIntensity?: number;
  readonly specularColor?: AuraColor;
  readonly specularIntensityMap?: AuraAssetRef<"texture">;   // alpha channel, per spec
  readonly specularColorMap?: AuraAssetRef<"texture">;       // sRGB
  /** KHR_materials_dispersion (Abbe-derived spread, glTF units). Default 0. */
  readonly dispersion?: number;
  readonly transmissionMap?: AuraAssetRef<"texture">;        // R
  readonly thicknessMap?: AuraAssetRef<"texture">;           // G
  readonly iridescenceIOR?: number;                          // existing; now reaches the film model
  /** glTF alpha mode. Default: "OPAQUE" unless opacity < 1, then "BLEND". */
  readonly alphaMode?: "OPAQUE" | "MASK" | "BLEND";
  readonly alphaCutoff?: number;                             // default 0.5
  /** MASK only; default true when MSAA is on. */
  readonly alphaToCoverage?: boolean;
  readonly doubleSided?: boolean;
  readonly unlit?: boolean;
  /** Default sampling for every slot on this material; per-slot override below. */
  readonly sampling?: AuraTextureSampling;
  readonly slotSampling?: Partial<Record<AuraMaterialTextureSlot, AuraTextureSampling>>;
}

export type AuraMaterialTextureSlot =
  | "baseColor" | "normal" | "metallicRoughness" | "occlusion" | "emissive"
  | "clearcoat" | "clearcoatRoughness" | "clearcoatNormal"
  | "sheenColor" | "sheenRoughness" | "specularIntensity" | "specularColor"
  | "transmission" | "thickness" | "iridescence" | "iridescenceThickness" | "anisotropy";

/** Model material override: applied on top of authored glTF materials. */
export interface AuraModelMaterialOverride {
  /**
   * Which glTF materials this applies to. Omitted = all. String = exact material name,
   * RegExp = name match, array = any of. Matched against glTF material.name.
   */
  readonly target?: string | RegExp | readonly (string | RegExp)[];
  /** Multiplies baseColorFactor (three.js `material.color` semantics). Textures are kept. */
  readonly color?: AuraColor;
  /** "multiply" (default) or "replace" baseColorFactor. Neither touches textures. */
  readonly colorMode?: "multiply" | "replace";
  /** Opt-in legacy flatten: disables baseColor + metallicRoughness textures on targets. */
  readonly replaceTextures?: boolean;
  /** Absolute factor overrides (glTF factors multiply their textures, per spec). */
  readonly roughness?: number;
  readonly metallic?: number;
  readonly emissive?: AuraColor;            // no default; never auto-derived from color
  readonly emissiveIntensity?: number;
  readonly clearcoat?: number;
  readonly clearcoatRoughness?: number;
  readonly envMapIntensity?: number;
  readonly opacity?: number;
}

export interface AuraModelOptions extends AuraTransformSpec {
  // ...existing...
  /**
   * Back-compat: an AuraMaterialSpec here is interpreted as a single all-materials
   * AuraModelMaterialOverride (color → multiply). See §11.
   */
  readonly material?: AuraMaterialSpec | AuraModelMaterialOverride;
  /** Ordered list; later entries win per field. */
  readonly materialOverrides?: readonly AuraModelMaterialOverride[];
  /** KHR_materials_variants name. Unknown name → diagnostic error, default materials kept. */
  readonly variant?: string;
}

/** Runtime handle additions (AuraRuntimeNodeHandle for model nodes). */
export interface AuraModelMaterialHandle {
  materialNames(): readonly string[];
  materialVariants(): readonly string[];
  setMaterialVariant(name: string | null): void;
  setMaterialOverrides(overrides: readonly AuraModelMaterialOverride[]): void;
  /** Per-material resolved state for tests and agents (factors, enabled maps, featureKey). */
  inspectMaterials(): readonly AuraResolvedMaterialInfo[];
}

export interface AuraResolvedMaterialInfo {
  readonly name: string;
  readonly featureKey: string;
  readonly baseColorFactor: readonly [number, number, number, number];
  readonly enabledMaps: readonly AuraMaterialTextureSlot[];
  readonly extensions: readonly string[];
  readonly lightsEvaluated: "uniform-16" | "clustered";
  readonly warnings: readonly string[];
}

/** Material diagnostics surfaced through app.diagnostics(). */
export interface AuraMaterialDiagnostics {
  readonly programs: number;
  readonly programCompileMs: number;
  readonly transmissionTargetActive: boolean;
  /** Lights the base variant would evaluate but some material program did not. Must be 0 (§9.8). */
  readonly lightsDroppedByMaterial: number;
  /** Which rollout paths ran (§22), so captures record them. */
  readonly paths: { readonly materialModel: string; readonly transmission: string; readonly ktx2: string; readonly tangents: string };
  readonly textureBytes: number;
  readonly textureBudgetBytes: number;
  readonly downscaledTextures: readonly { id: string; from: number; to: number }[];
  readonly issues: readonly AuraMaterialIssue[];
}
export interface AuraMaterialIssue {
  readonly code:
    | "procedural-texture-failed" | "ktx2-uncompressed-fallback" | "decoder-missing"
    | "variant-unknown" | "material-program-fallback" | "texture-budget-exceeded"
    | "tangent-derivative-fallback" | "material-program-pending" | "webgpu-material-approximate"
    | "transmission-ldr-capture";
  readonly target: string;
  readonly message: string;
}

/** Create-app options (`createAuraApp({ renderer: { ... } })`). */
export interface AuraRendererMaterialOptions {
  /** "strict" turns AuraMaterialIssue entries into thrown errors (used by CI and templates). */
  readonly materialStrictness?: "warn" | "strict";
  /** R3 rollout flag (§10.5, §22). Default "legacy" for one cycle, then "physical-r185". */
  readonly materialModel?: "legacy" | "physical-r185";
  /** R4 (§22). "auto" = tier default; "env" = env-refraction fallback only; "off" = no transmission lobe. */
  readonly transmission?: "auto" | "env" | "off";
  /** R13 global switch (§22). Default true when MSAA is on. */
  readonly alphaToCoverage?: boolean;
  /** Phase 0 debug views; output is the raw channel, no tone mapping. `*Effective` = value after all clamps. */
  readonly debugView?: "baseColor" | "normal" | "roughness" | "metallic" | "clearcoat" | "clearcoatRoughness"
    | "clearcoatRoughnessEffective" | "sheen" | "F0" | "tangent" | "anisotropyDirection";
}
```

Changed semantics:
- `material.pbr(options)` no longer sets `color`. `material.emissive` defaults
  `emissiveIntensity: 1`. `material.neon` defaults 2.0. `material.glass` defaults `opacity: 1`.
- `AuraProceduralTextureSpec` (`index.ts:932-937`) is unchanged in shape and now rendered.
  `seed?: number` is added.
- `textureAnisotropy` stays as an alias for `sampling.anisotropy` and is marked `@deprecated`.

Removed:
- The internal hard-coded `replaceSurfaceTextures: true` at `index.ts:13570`.
- The `/joint/i` branch in `applyMaterialTint`.

### 7.2 `@aura3d/engine` production runtime (`TypedGLBActor.ts`)

```ts
export interface TypedGLBActorOptions {
  // ...existing...
  readonly materialOverrides?: readonly TypedGLBActorMaterialOverride[];
  readonly variant?: string;
  readonly decoders?: GLTFDecoderSet;            // default: lazy local decoders (R10)
  readonly textureBudget?: TextureBudgetPolicy;   // from quality tier (R16)
}
export interface TypedGLBActorMaterialOverride {
  readonly target?: (materialName: string) => boolean;
  readonly baseColorMultiply?: readonly [number, number, number, number];
  readonly baseColorReplace?: readonly [number, number, number, number];
  readonly replaceTextures?: boolean;
  readonly roughness?: number;
  readonly metallic?: number;
  readonly emissiveColor?: readonly [number, number, number];
  readonly emissiveStrength?: number;
  readonly clearcoat?: number;
  readonly clearcoatRoughness?: number;
  readonly envMapIntensity?: number;
  readonly opacity?: number;
}
export interface TypedGLBActor {
  // ...existing...
  setMaterialOverrides(overrides: readonly TypedGLBActorMaterialOverride[]): void; // re-applies from authored snapshot
  setMaterialVariant(name: string | null): void;
  materialVariants(): readonly string[];
}
/** @deprecated use materialOverrides; kept one minor version, maps to replaceTextures:true. */
export interface TypedGLBActorTintOptions { /* unchanged shape */ }
```

Overrides always re-apply from an **authored snapshot** of each material's parameters taken at load
time. They are idempotent and never accumulate. The current `setTint` mutates in place, so repeated
calls compound.

### 7.3 `@aura3d/rendering`

```ts
// Sampler.ts: presets; constructor defaults unchanged (see §11).
export class Sampler {
  static trilinear(options?: { wrap?: TextureAddressMode | [TextureAddressMode, TextureAddressMode]; anisotropy?: number }): Sampler;
  static fromGLTF(info: GLTFSamplerInfo | undefined, anisotropy: number): Sampler;
}
export type TextureAddressMode = "repeat" | "clamp-to-edge" | "mirrored-repeat";

// PhysicalFeatureKey.ts
export interface PhysicalFeatureSet {
  readonly maps: ReadonlySet<PhysicalMapSlot>;
  readonly lobes: ReadonlySet<"clearcoat" | "sheen" | "iridescence" | "anisotropy" | "transmission" | "volume" | "dispersion" | "specular" | "diffuseTransmission">;
  readonly vertex: { skinning: 0 | 4 | 8; instancing: boolean; morphTargets: number; vertexColor: boolean; uv1: boolean };
  readonly alpha: "opaque" | "mask" | "mask-a2c" | "blend";
  readonly unlit: boolean;
  readonly lighting: { clustered: boolean; shadows: "none" | "dir" | "dir+spot" | "dir+spot+point" };
  readonly transmissionTarget: boolean;
  readonly tangentSource: "attribute" | "derivative";
}
export function physicalFeatureKey(set: PhysicalFeatureSet): string;
export function physicalDefines(set: PhysicalFeatureSet): Readonly<Record<string, string | true>>;
export class PhysicalProgramCache {
  constructor(device: GraphicsDevice, options?: { maxPrograms?: number; parallelCompile?: boolean });
  get(set: PhysicalFeatureSet): CompiledProgram | Promise<CompiledProgram>;
  precompile(sets: Iterable<PhysicalFeatureSet>): Promise<void>;
  stats(): { programs: number; compileMs: number; fallbacks: number };
}

// PhysicalMaterial (replaces TexturedPBRMaterial/PBRMaterial/InstancedPBRMaterial/SkinnedLitMaterial internals;
// the four class names remain as thin subclasses for compatibility).
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
  readonly alphaMode: "OPAQUE" | "MASK" | "BLEND"; readonly alphaCutoff: number; readonly alphaToCoverage: boolean;
  readonly doubleSided: boolean; readonly unlit: boolean;
  readonly textures: Partial<Record<PhysicalMapSlot, { texture: Texture; sampler: Sampler; texCoord: 0 | 1; transform?: Mat3 }>>;
}

// TransmissionRenderTarget.ts
export class TransmissionRenderTarget {
  constructor(device: GraphicsDevice, options: { scale: 0.5 | 1; format: "rgba16f" | "rgba8" });
  resize(width: number, height: number): void;
  captureFrom(sceneColor: RenderTarget): void;      // blit + generateMipmap
  readonly texture: Texture; readonly mipCount: number;
  dispose(): void;
}

// BRDFLut.ts
/** r185 DFGLUTData.js ported verbatim: 16×16 RG16F, R = scale (F0 term), G = bias (F90 term),
 *  sampled at vec2(roughness, NdotV), linear filtering, clamp-to-edge. Ess = R + G. */
export function createDFGLut(device: GraphicsDevice): Texture;

// ProceduralMaterialTextures.ts
export type ProceduralMaterialKind = "fabric-normal" | "rubber-roughness" | "brushed-metal-anisotropy" | "plastic-micro-scratch";
export function generateProceduralMaterialTexture(
  kind: ProceduralMaterialKind,
  params: { scale: number; strength: number; contrast?: number; direction?: Vec3; seed?: number; size?: 256 | 512 | 1024 }
): { data: Uint8Array; width: number; height: number; colorSpace: "linear"; slot: "normal" | "roughness" | "anisotropy" };
```

### 7.4 `@aura3d/assets`

```ts
// MikkTSpaceTangents.ts
export function generateMikkTSpaceTangents(input: {
  positions: Float32Array; normals: Float32Array; uvs: Float32Array; indices?: Uint32Array | Uint16Array;
}): Promise<Float32Array>;                      // xyzw, w = handedness; runs in worker
export function mikkTSpaceAvailable(): boolean;

// KTX2TargetSelection.ts
export type KTX2TargetFormat = "astc-4x4" | "bc7" | "etc2-rgba8" | "bc3" | "etc1" | "rgba8";
export interface CompressedTextureCaps { astc: boolean; bptc: boolean; etc: boolean; s3tc: boolean; s3tcSrgb: boolean }
export function detectCompressedTextureCaps(gl: WebGL2RenderingContext): CompressedTextureCaps;
export function selectKTX2TargetFormat(caps: CompressedTextureCaps, hasAlpha: boolean): KTX2TargetFormat;

// KTX2BasisTextureTranscoder.ts (changed)
export interface KTX2BasisTextureTranscoderOptions {
  readonly targetFormat: KTX2TargetFormat;       // now required; no "etc2" default
  readonly colorSpace: "srgb" | "linear";        // preserved into DecodedGLTFImage.colorSpace
  readonly transcoderUrl?: string;               // default: bundled local asset URL; never a CDN
  /** removed: includeFallback (no double transcode) */
}

// GLTFRenderResources.ts (changed)
export interface GLTFRenderResourceOptions {
  // ...existing materialVariant kept...
  readonly tangents?: "mikktspace" | "derivative";        // default "mikktspace"
  readonly textureBudget?: TextureBudgetPolicy;
  readonly anisotropy?: number;
}
export interface TextureBudgetPolicy { readonly maxDimension: number; readonly maxBytes: number }

// GLTFExtensionSupport.ts (changed): generated
export type GLTFExtensionStatus = "conformant" | "approximate" | "unsupported";
export interface GLTFExtensionSupportEntry { readonly name: string; readonly status: GLTFExtensionStatus; readonly test: string; readonly notes?: string }
```

Removed from `@aura3d/assets`:
- `usesUnbackedScalarTransmission`, `renderPbrBaseColorFactor`, `renderPbrRoughnessFactor` and
  `usesOpaqueDoubleSidedClearcoatShell` (internal).
- The `KTX2LoaderThreeCompat` stub, replaced by a real `KTX2Loader` re-export.
- The `includeFallback` option.

---

## 8. Shader changes

All GLSL lives in `packages/rendering/src/shaders/physical/*.glsl.ts` and is assembled by
`PhysicalProgramCache`. Every function named below has a WGSL twin in `shaders/physical-wgsl/` with the
same name prefix (`a3d_`) and identical math. The WGSL twin is enforced by a shared numeric test
(§15.1, U-BSDF-PARITY).

### 8.1 Deleted

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

### 8.2 `bsdf_common`

```glsl
// Inputs assembled once per fragment.
struct A3DPhysical {
  vec3  diffuseColor;      // baseColor.rgb * (1 - metallic)
  float roughness;         // after geometry-roughness widening
  vec3  specularColor;     // F0
  float specularF90;
  float ior;
  float clearcoat; float clearcoatRoughness; vec3 clearcoatNormal;
  vec3  sheenColor; float sheenRoughness;
  float iridescence; float iridescenceIOR; float iridescenceThickness; vec3 iridescenceFresnel; vec3 iridescenceF0;
  float anisotropy; vec3 anisotropyT; vec3 anisotropyB; float alphaT;
  float transmission; float thickness; float attenuationDistance; vec3 attenuationColor; float dispersion;
};

// Geometric specular AA (three r185 lights_physical_fragment.glsl.js:6-11).
float a3dGeometryRoughness(vec3 nonPerturbedNormal) {
  vec3 dxy = max(abs(dFdx(nonPerturbedNormal)), abs(dFdy(nonPerturbedNormal)));
  return max(max(dxy.x, dxy.y), dxy.z);
}
// roughness = min(max(roughness, 0.0525) + geometryRoughness, 1.0)

// IOR-driven F0 with KHR_materials_specular (r185 lights_physical_fragment.glsl.js:45).
// specularF90   = mix(specularIntensity, 1.0, metallic);
// specularColor = mix(min(pow2((ior - 1.0) / (ior + 1.0)) * specularColorFactor, vec3(1.0)) * specularIntensity,
//                     baseColor.rgb, metallic);
```

- The NDF and visibility functions stay (`ShaderChunks.ts:65-81` are equivalent to three). The NDF
  clamp `max(r, 0.045)` becomes the r185 `0.0525` floor applied in material setup.
- **DFG LUT:** `u_dfgLut` is the r185 `DFGLUTData.js` table (16×16 RG16F) sampled at
  `vec2(roughness, NdotV)`. The existing Aura LUT (`BRDFLut.ts` `createExternalParityBrdfLut`, sampled at
  `vec2(nDotV, roughness)` in `ShaderLibrary.ts:397, 983`) uses the **transposed** axis order; every
  call site is switched to the r185 order in the same change, and the old generator is deleted.
- **Direct multiscatter** (r185 `BRDF_GGX_Multiscatter`, `lights_physical_pars_fragment.glsl.js:424-460`):
  ```glsl
  vec2 dfgV = texture(u_dfgLut, vec2(roughness, NdotV)).rg;
  vec2 dfgL = texture(u_dfgLut, vec2(roughness, NdotL)).rg;
  vec3 FssEssV = F0 * dfgV.x + F90 * dfgV.y;   vec3 FssEssL = F0 * dfgL.x + F90 * dfgL.y;
  float EmsV = 1.0 - (dfgV.x + dfgV.y);        float EmsL = 1.0 - (dfgL.x + dfgL.y);
  vec3 Favg = F0 + (1.0 - F0) * 0.047619;
  vec3 Fms  = FssEssV * FssEssL * Favg / (1.0 - EmsV * EmsL * Favg + EPSILON);
  specularDirect = BRDF_GGX(...) + Fms * EmsV * EmsL;
  ```
  IBL multiscatter uses r185 `computeMultiscattering` (single LUT fetch at NdotV). The LUT is now
  **always bound**: the `TexturedPBRMaterial.ts:460` default (`u_environmentBrdfLutEnabled = 0` when no
  LUT is passed) is removed, and binding is guaranteed by the program, not by ForwardPass overrides.
- **Diffuse:** default to r185 `BRDF_Lambert(diffuseColor)` for direct light, and
  `diffuseColor · (1 − totalScatteringDielectric) · irradiance/π` for indirect (r185
  `RE_IndirectSpecular_Physical`). Aura's current Burley lobe (`ShaderChunks.ts:83`) is kept only behind
  `A3D_DIFFUSE_BURLEY`, off by default, because every acceptance comparison is against r185.
- **Specular occlusion:** r185 `computeSpecularOcclusion(NdotV, ao, roughness) = saturate(pow(NdotV + ao, exp2(−16·roughness − 1)) − 1 + ao)`
  (`lights_physical_pars_fragment.glsl.js:651`, applied in `aomap_fragment`) multiplies indirect
  specular in every family; `ao` multiplies indirect diffuse. This unifies the skinned/textured difference noted in research/03 §2.

### 8.3 `clearcoat`

- `clearcoatRoughness = min(max(factor · tex.g, 0.0525) + geometryRoughness, 1.0)`. `clearcoat = factor · tex.r`.
- The clearcoat normal is the **full** perturbed normal from `clearcoatNormalTexture` with
  `clearcoatNormalScale`, built on the geometry TBN (not on the base mapped normal). Without a coat
  normal texture, it is the geometry normal, per the glTF spec.
- The direct coat term is a GGX lobe with `F0 = 0.04`, `F90 = 1`. The indirect coat term samples the
  prefiltered env at `clearcoatRoughness`.
- Composition (r185 `meshphysical.glsl.js:210-212`):
  `Fcc = F_Schlick(0.04, 1.0, dot(Ncc, V)); out = out·(1 − clearcoat·Fcc) + clearcoat·(ccDirect + ccIndirect)`.
- The scalar path's `mix(sampled, clearcoatSampled, clearcoat)` replacement of the base env
  specular (ShaderLibraryCore.ts ~640) is removed. The layering above is the only path.

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
- The skinned, instanced and scalar families use the same function. The `0.0` placeholder passed at
  `ShaderLibrary.ts:3031` is removed.

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
  always exists (PRD 02 guarantees a default env).
- `KHR_materials_diffuse_transmission`: keep the current base-colour lerp approximation, but rename
  its status to `approximate` in the support matrix. A real back-lit implementation is out of scope.

### 8.8 `tangent_frame` and normals

- VS (every family):
  `v_tangent = vec4(normalize(mat3(skinnedModel) * a_tangent.xyz), a_tangent.w)`, where
  `skinnedModel = u_model · instanceMatrix · skinMatrix` as applicable. This replaces
  `mat3(u_normalMatrix)` at `ShaderLibrary.ts:602, 1132, 2112, 2118`.
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

### 8.10 Lighting loop

```glsl
#ifdef A3D_CLUSTERED
  int count = u_clusteredLightEnabled > 0.5 ? clusterCount : min(int(u_lightCount), A3D_MAX_UNIFORM_LIGHTS);
#else
  int count = min(int(u_lightCount), A3D_MAX_UNIFORM_LIGHTS);
#endif
```

`A3D_CLUSTERED` is set for every feature key whenever the frame has more than `A3D_MAX_UNIFORM_LIGHTS`
(16) lights. It is never disabled because a material uses extensions. PRD 02 owns the cluster grid
itself (`ClusteredForwardLighting.ts`).

### 8.11 Alpha

- MASK + A2C (r185 `alphatest_fragment.glsl.js`): `a = smoothstep(cutoff, cutoff + fwidth(a), a); if (a == 0.0) discard;`.
  The `SAMPLE_ALPHA_TO_COVERAGE` state is set by the device when the program key has `mask-a2c`.
- MASK without MSAA: `if (a < cutoff) discard;` (existing).

### 8.12 WGSL

The `physical-wgsl` modules mirror 8.2–8.11 one-to-one:
- `textureSampleLevel` for LOD.
- `dpdx/dpdy` for geometry roughness and the derivative frame.
- Per-slot `mat3x3<f32>` in a material uniform struct.
- Light data from the same packed buffer as WebGL2, with the WebGPU cluster path from PRD 11.

The WebGPU PBR path ships only when its U-BSDF-PARITY and browser conformance scenes pass. Until
then, `backend: "webgpu"` keeps using its current code with the hacks removed, and logs
`webgpu-material-approximate`.

---

## 9. Rendering changes

1. **Pass order in `ForwardPass`:**
   - opaque + MASK, front-to-back
   - **transmission capture**, only if `visibleTransmissiveCount > 0`: blit the resolved scene colour
     to `TransmissionRenderTarget`, then `generateMipmap`
   - transmissive materials, back-to-front, with depth write on (they are surfaces, not blends) and
     shadow receive on
   - BLEND, back-to-front, with depth write off
   - post (PRD 03)

   The capture uses the linear HDR scene target from PRD 01. If PRD 01's target is still RGBA8
   sRGB, the capture is RGBA8 and the High/Ultra tiers report `transmission-ldr-capture` until PRD 01
   lands.
2. **Transmissive objects do not see each other.** This matches three r185, which also captures
   opaques only. It is documented as a limitation; a two-layer capture is out of scope.
3. **Program cache replaces the variant table.** `createDefaultShaderLibrary()`
   (`ShaderLibrary.ts:52`) registers the physical family through `PhysicalProgramCache`. The 10
   named `DEFAULT_TEXTURED_PBR_*_VARIANT` constants stay as aliases to feature keys for one minor
   version.
4. **Device state:**
   - `WebGL2Device` adds `SAMPLE_ALPHA_TO_COVERAGE` handling.
   - It adds sRGB compressed internal formats: ASTC `0x93D0`, BPTC sRGB `0x8E8D`,
     ETC2 sRGB8_ALPHA8 `0x9279` and S3TC sRGB DXT5 `0x8C4F`.
   - It probes extensions once at context creation. ETC2 is never assumed (E28).
5. **Samplers:**
   - GLB textures keep `GLTFRenderResources.ts:2196-2213` behaviour, with anisotropy from the tier.
   - Primitive, SDF-text and procedural textures use `Sampler.trilinear({ wrap })`.
   - The default environment's sampler bug (`ExternalParityRenderPreset.ts:169`) belongs to PRD 02;
     this PRD's acceptance depends on it.
6. **LUT binding:** `u_dfgLut` is bound in every program from a renderer-owned texture created once.
7. **Texture upload clamp (R16):** inside `WebGL2Device.createTexture`. If
   `max(w, h) > policy.maxDimension`, upload to a temporary texture, blit-downsample with linear
   filtering by powers of 2, then generate mips. KTX2 textures drop top levels instead of resampling.
8. **Diagnostics:** `ForwardPass` reports `programs`, `programCompileMs`, `transmissionTargetActive`,
   `lightsDroppedByMaterial` (must be 0) and texture bytes into `AuraMaterialDiagnostics`.

---

## 10. Migration plan

Order matters. Each step is shippable on its own.

1. **Add an authored-material snapshot to `TypedGLBActor`**, and keep the current behaviour behind it.
   Add `inspectMaterials()` and `app.diagnostics().materials`. This step changes no pixels; it adds
   observability for every following step.
2. **Flip the tint semantics (R1) in one change, together with migrating the games:**
   - courier-rush: `main.ts:386-398` traffic cars and `city.ts:700-715` sedan.
   - gravity-post: `main.ts:492-499`.
   - siege-golf: `main.ts:64-70, 329`.
   - deep-recovery: 6 model calls.
   - skyline-runner: 3 calls.
   - aurora-lander, neon-swarm, patrol-wing, turbo-drift-circuit, pulse-tunnel: art-review calls.
   - data-galaxy, material-asset-inspector, product-configurator, webgpu-particle-lab, asset-audition.

   For each call site, decide one of:
   - (a) drop `color` because the authored textures are the intent;
   - (b) keep `color` as a multiply (team or variant colour);
   - (c) add `replaceTextures: true` only where an untextured flat look is the explicit art direction,
     with a comment naming the art-direction reason.

   Remove every implicit emissive glow unless the material has a real emissive intent. The per-site
   list is produced by `rg -n -U --type ts "model\([^;]*?material:" apps/*/src` (the `-U` multiline
   flag is required because most call sites span lines, e.g. `apps/showcase-courier-rush/src/main.ts:386-398`);
   the resulting list is committed to `evidence/prd-04/tint-migration.md` before any edit. On this
   branch the command reports 39 matches; it over-matches (a lazy span can reach a later `material:`),
   so each hit is confirmed by hand, and variable-passed specs such as siege-golf's
   `paintedTimberMaterial` (`main.ts:64-70`, used at `:329`) are followed to their definition.
3. **Migrate Aura Clash's raw uniform pokes** (`AuraClashArenaApp.ts:3372-3415` setup and `3441-3473`
   hit flash) to `actor.setMaterialOverrides([...])`, using target functions for `ranger` / `regular|superhero` /
   `hair`. The hit-flash effect uses an override layer that is pushed and popped. Coordinate with PRD 09.
4. **Remove the asset-specific hacks (R2, Phase 1 subset) and the Duck route clamp** (`apps/wow-webgpu-product-viewer/src/main.ts:51-66`).
   Lobe fudge constants are removed later, in the phase that replaces each lobe (R2 sequencing).
   The Duck route renders the stock Duck with no material edits. Any route whose evidence capture
   changes is re-captured, and the old evidence is marked superseded, not "regressed".
5. **Physical BSDF (R3) behind `renderer.materialModel: "physical-r185"`,** default off for one
   development cycle, while CI renders both. Then default it on; the legacy path is deleted only after
   Phase 7 sign-off (§22), not merely at the next minor version.
6. **Presets (R15):**
   - Update `material.*`.
   - In the same PR, adjust the showcase sites that relied on `material.emissive` defaults:
     418 calls exist, and they are counted and reviewed by script.
   - Sites that intentionally want glow pin `emissiveIntensity` explicitly. The codemod
     `tools/codemods/pin-emissive-defaults.mjs` (new; `tools/codemods/` does not exist yet) inserts
     `emissiveIntensity: 1.35` where it was implicit, in `material.emissive(...)` calls **and** in any
     material object literal that sets `emissive` without `emissiveIntensity` (those also hit the
     `?? 1.35` engine fallback at `index.ts:14391, 14896, 14912`). Changing the default is then a
     no-op for existing sites until each game is rebuilt in PRD 14. The PR records the codemod's
     edit count and `git diff --stat`.
7. **glTF glass import rewrite removed (E22), in Phase 4 only,** in the same change that lands at
   least the `A3D_TRANSMISSION_ENV` path. Glass in assets that relied on the rewrite then renders as
   glass (R4), never as a ≤58% blend over nothing. E23 (clearcoat-shell cull override) has no such
   dependency and is removed in Phase 1.
8. **Support matrix regeneration (R17)** after the conformance suite runs.
9. **Delete the fake stubs (E34)** last, after `rg` shows zero imports.

---

## 11. Backward compatibility

| Change | Break? | Compatibility path |
|---|---|---|
| `model({material:{color}})` multiplies instead of flattening | **Visual break (intended)** | `replaceTextures: true` reproduces the old flat look, but **not** the auto-glow (deliberately not reproducible without explicit `emissive`). One minor version emits a one-time console note `aura3d: model material color now multiplies authored textures; pass replaceTextures:true for the legacy flatten` per app when a typed model receives `color` |
| `material.pbr()` no longer sets `color` | Behaviour change for primitives that relied on `#d7dee8` | The primitive default colour in `createProductionPrimitiveMaterial` becomes `#d7dee8` when `color` is undefined, so primitive pixels are unchanged |
| `material.emissive/neon/glass/metal` defaults | Visual change | The codemod (§10.6) pins old values in existing apps. The new defaults apply to new code |
| `Sampler` constructor defaults | **No change** | Defaults stay `linear`/clamp/aniso 1 for low-level users. Only engine call sites switch to `Sampler.trilinear` |
| `TypedGLBActorTintOptions` / `setTint` | Deprecated | Mapped to `setMaterialOverrides([{ baseColorReplace, replaceTextures }])`. Removed in the next major version |
| `textureAnisotropy` | Deprecated alias | Maps to `sampling.anisotropy` |
| Named textured variants | Deprecated aliases | Map to feature keys |
| KTX2 transcoder `targetFormat` default and `includeFallback` | API break (internal-ish, exported) | The default is computed from caps when the caller passes a GL context. `includeFallback` is accepted and ignored with a deprecation warning for one minor version |
| Extension support matrix statuses | Strings change | `"runtime-supported"` maps to `"conformant"` only where the conformance test passes |
| Fake stubs deleted | Exports removed | Listed in the CHANGELOG. Verify no app or template imports them first |
| Light evaluation on extension materials | Visual change (more lights) | None needed; this is a correctness fix |

---

## 12. Dependencies on other PRDs

| PRD | Dependency | Direction |
|---|---|---|
| 01 Rendering Core / Color / HDR / PBR | Linear HDR scene colour target (needed for the transmission capture); output colour transform for unlit/lit consistency; the instancing `node.size` bug (`index.ts:14747`, research/22), which 06/16 scenes need fixed to judge instanced materials; primitive tessellation and UVs (research/22: 16×12 sphere, 24-segment cylinder) for 02/06 | 04 depends on 01 |
| 02 Lighting / IBL / Reflections / Shadows | Mipmapped sampler and HDR default environment (research/03 §4; research/19 C10). Without it, roughness response cannot pass 04/06/07. Also cluster quality for >16 lights and shadow receiving on transmissive surfaces | 04 depends on 02 for acceptance (not for implementation) |
| 03 Postprocessing / AA / Tone Mapping | MSAA state for A2C, tone-mapping operator and exposure (research/19 C12) affecting all material comparisons | 04 depends on 03 for acceptance |
| 05 Asset Pipeline | KTX2/UASTC/ETC1S encoding, MikkTSpace bake at `assets add`, texture resize, re-authoring the 13 unlit 4-tri cards and 71 untextured release models (research/19 C19), and removing the texture-waiver regex | 05 depends on 04 for runtime decode (R9/R10) and on R8 tangents. 04's game acceptance depends on 05 |
| 06 Animation / Characters / Skinning | Unified physical program must keep 4/8-influence skinning and morph targets bit-compatible | Shared work, 04 leads the shader merge |
| 07 VFX / Particles | Additive/unlit particle materials must not be routed through the physical program | Coordination |
| 09 Shared Game Runtime | Aura Clash override migration; game-level material helper conventions | 09 consumes R1 API |
| 10 World Building | Tiled ground/wall materials (R6) and procedural maps (R12) are the building blocks | 10 depends on 04 |
| 11 WebGPU / Perf Tiers | Tier definitions (Low/Medium/High/Ultra) and the WGSL backend | 04 consumes tier definitions and provides material WGSL |
| 12 Visual Benchmark Infra | New benchmark scenes `prd04-*` (10 scenes) (§16.1), vision-judge job, masked metrics. Scene IDs follow PRD 12 §9.4 (`<owner>-<slug>`; IDs `01`–`18` frozen) because PRD 02 (`19-reflection-probe`), PRD 05 (`19-asset-lod-transition`, `20-lookdev-hero`), PRD 06 (`19`–`22`) and PRD 03 (`19`–`25`) would otherwise collide on bare numbers; the slug ID is the stable key | 04 depends on 12 for acceptance tooling. 04 supplies scene specs |
| 13 Agent Authoring | Skills and templates: no `replaceTextures` by default, no glow-as-readability, prefer textured PBR and HDRI | 13 depends on 04 API |
| 14 18-Game Rebuild | Per-game material rework | 14 depends on 04 |
| 15 API Consolidation | Deprecation and removal schedule; `@aura3d/materials` fate | Coordination |

### 12.1 Third-party code

All of it is vendored from the installed three r185 package (`node_modules/three@0.185.1`), copied with
its license file into `packages/*/vendor/<lib>/`, served from the app origin, and lazy-loaded. No new
npm dependency is added, and no CDN URL is allowed at runtime.

| Library | Source in r185 | Used by | License (verify the copied LICENSE at vendoring) |
|---|---|---|---|
| MikkTSpace | `examples/jsm/libs/mikktspace.module.js` | R8 | MIT (npm `mikktspace` build of the zlib-licensed reference) |
| Basis Universal transcoder | `examples/jsm/libs/basis/basis_transcoder.{js,wasm}` | R9 | Apache-2.0 |
| Draco decoder | `examples/jsm/libs/draco/draco_{decoder.wasm,wasm_wrapper.js}` | R10 | Apache-2.0 |
| meshoptimizer decoder | `examples/jsm/libs/meshopt_decoder.module.js` | R10 | MIT |
| DFG LUT data | `src/renderers/shaders/DFGLUTData.js` | R3 | MIT (three.js) |

`three` stays a dev dependency (it is already one); it is used only by tests (`Matrix3.setUvTransform`
comparison, r185 reference values) and the benchmark's three side.

---

## 13. Implementation phases

Each phase's exit criteria must be met on a GH Actions macos-14 run (ANGLE Metal), with the run ID
recorded in `docs/project/aura3d-quality-rebuild/evidence/prd-04/<phase>.md`.

**Phase 0: Oracle and observability (no pixel change).**
- Work: `inspectMaterials()`; `app.diagnostics().materials`; material debug views (`debugView:
  "baseColor" | "normal" | "roughness" | "metallic" | "clearcoat" | "clearcoatRoughness" | "sheen" | "F0" | "tangent"`);
  new benchmark scenes `prd04-*` (10 scenes) spec'd in `benchmarks/quality-rebuild/shared/scenes.ts` (owned with PRD 12).
- Exit:
  - All 28 scenes (the existing `01`–`18` plus `prd04-*` (10 scenes)) capture on both engines.
  - Baseline vision-judge scores are recorded.
  - `inspectMaterials()` on CourierRush traffic cars shows `enabledMaps` without `baseColor`, confirming the baseline defect.

**Phase 1: Stop the damage (R1, R2 Phase-1 subset, R6, R15, R16, E23 removal).** E22 is not in this phase (R2 sequencing).
- Exit:
  - Tint-white test: a textured GLB with `color: "#ffffff"` renders with masked SSIM ≥ 0.999 against the same GLB with no material, **and** the red-tint detail-retention test (§14) passes. The white test alone cannot fail an implementation that ignores `color`.
  - `rg` on `packages/rendering/src` finds no `sourcePaint`, `productProp`, `materialRedPaintGate`, `horizonStripe` or `0.98, 0.12, 0.075`. This is a regression guard, not quality evidence.
  - `prd04-tiled-ground`: `texture-tiling.spec.ts` FFT seam test passes, and the vision judge classifies seams and shimmer as `equivalent` to three.
  - The Duck route renders the stock Duck: every material's factors in `inspectMaterials()` equal the glTF JSON, and no `u_productColorSmoothing` / transmission-zeroing uniform is written (unit test on the route's material library after load).
  - No game is classified worse than baseline on material_quality by the vision judge, except where the change is the intended R1 tint flip; each such exception is listed in `tint-migration.md` with its (a)/(b)/(c) decision.

**Phase 2: Unified physical core (R3 core, R5, R7, R8; skinned/instanced/scalar merged; E10/E11/E15/E16 deleted).**
- Scope: IOR F0, specular, spec-AA, direct multiscatter, clearcoat, emissive_strength, unlit, specular occlusion, tangents, UV transforms, generated variants, and clustered lights in every key.
- Exit:
  - 04-clearcoat Aura score ≥ three − 0.5, with no implementation-bug classification. Judged with the benchmark's own mipmapped HDRI, so this does not wait for PRD 02's engine default environment.
  - `prd04-texture-transform` and `prd04-normal-tangent` pass (§16).
  - 06 dielectric row: the rim at r = 1 is gone (mean luma of the outer 10% ring of the r = 1 dielectric sphere within 10% of three's). The mid-roughness metal blockiness may remain until PRD 02 lands.
  - `lightsDroppedByMaterial == 0` in Gallery Shift and Courier Rush captures.
  - Program count ≤ 64 per game route (Medium); first-frame compile stall ≤ 250 ms on the Medium reference device (M1), and on CI ≤ 2× the pre-change stall for the same route.

**Phase 3: Sheen, anisotropy and iridescence lobes (E12/E13 and cosine iridescence deleted).**
- Exit:
  - 07-sheen-fabric Aura ≥ three − 0.5, and the `physical-lobes-probe.spec.ts` sheen probe passes (§14).
  - `prd04-iridescence` and `prd04-anisotropy` at Aura ≥ three − 0.5; the anisotropy elongation probe passes (§15.2).
  - The source guard additionally finds no `a3dApplyAdvancedPbrLobes`, `a3dPbrIridescenceColor` or `a3dPbrAnisotropicDistribution`.

**Phase 4: Transmission, volume and dispersion (R4; E14/E17/E22 deleted).**
- Exit:
  - 05-transmission: the `transmission-probe.spec.ts` see-through probe passes (§14), and Aura ≥ three − 0.5.
  - `prd04-dispersion` (High tier): at the three prism edges, the masked per-channel centroid offset between R and B is ≥ 50% of three's and ≤ 150% of it, and Aura ≥ three − 1.0.
  - Transmission GPU cost is within §17.
  - The Low-tier env fallback never outputs a pixel with luma < 0.5× the env sample (pixel probe).
  - `gltf-material-mapping-spec-exact.test.ts` passes for CompareTransmission (no glass rewrite).

**Phase 5: Pipeline fidelity (R9, R10, R11, R12, R13).**
- Exit:
  - `prd04-ktx2` (UASTC base colour) vs PNG DamagedHelmet: masked ΔE2000 mean ≤ 2.0.
  - Draco and Meshopt variants of DamagedHelmet load via `model()`, and each renders within masked ΔE2000 mean ≤ 1.0 of the uncompressed GLB.
  - `prd04-variants` switches all 3 variants (ΔE ≥ 10 between variant mean colours, §14).
  - `material.fabric/brushedMetal/blackRubber/frostedGlass`: in the `normal` / `roughness` debug view on a 1 m sphere at 1280×720, the per-pixel standard deviation inside the sphere mask is ≥ 0.02 and ≥ 5× the Phase 0 baseline value for the same preset (recorded when the input is still dropped), and the vision judge names the micro-structure unprompted.
  - `prd04-alpha-mask`: `alpha-to-coverage.spec.ts` passes (edge gradient ≥ 2 px at MSAA 4×, vs 1 px with `discard`).

**Phase 6: WGSL port, stub deletion, truthful matrix (R17).**
- Exit:
  - U-BSDF-PARITY is green.
  - The WebGPU backend renders 03/04/05/07 within masked ΔE2000 mean ≤ 2 of WebGL2 Aura.
  - The support matrix is generated from the conformance results.
  - E34 files are deleted with zero import references.

**Phase 7: Game acceptance (with PRD 14).**
- Exit: §16.2 game criteria met for all 18 games, with vision-model and human sign-off recorded.

---

## 14. Task checklist

Phase 0
- [ ] `packages/engine/src/production-runtime/TypedGLBActor.ts`: in `createTypedGLBActor`, after `loadProductionGLTFRenderPipeline`, snapshot every material's parameters (`Material.getParameter` for every uniform name in `GLTFRenderResources.ts:257-263` slot table plus factors) into `authoredSnapshot: Map<Material, Record<string, unknown>>`. Test: `tests/unit/production-runtime/typed-glb-actor-snapshot.test.ts` asserts the snapshot equals the post-load parameters for `fixtures/asset-corpus/damaged-helmet.glb`.
- [ ] Add `inspectMaterials()` to `TypedGLBActor` and to the model runtime node handle in `index.ts`, returning `AuraResolvedMaterialInfo[]`. Test: `tests/unit/agent-api/model-inspect-materials.test.ts`.
- [ ] Add `materials: AuraMaterialDiagnostics` to `app.diagnostics()`. Test: the shape test in `tests/unit/agent-api/aura-app-handle.test.ts`.
- [ ] Add a `debugView` renderer option that compiles define `A3D_DEBUG_VIEW_<NAME>` and outputs the raw channel without tone mapping, taken after texture sampling and factor multiplication but **before** any floor or fudge (so it shows what the asset authored, and later shows the value the BSDF actually receives via a second view `<name>Effective`). Test: a browser probe renders ClearCoatTest with `debugView:"clearcoatRoughness"` and asserts row-3 stripe pixel variance > 0.01; with `"clearcoatRoughnessEffective"` on the baseline build it records the collapsed variance (E10) as the before-value.
- [ ] `benchmarks/quality-rebuild/shared/scenes.ts`: add scenes `prd04-*` (10 scenes) (§16.1) with specs for both engines, registered with `owner: "prd04"` in PRD 12's `shared/registry.ts` (until that lands, via the existing `base(id, index, ...)` helper in `scenes.ts`, with the slug ID as the stable key). Add the assets to `shared/assets.ts` (same `ModelAssetId` / `repoPath` / `provenance` shape as `clearCoatTest`) with sha256 and license. Files needed and not in the repo today (`fixtures/asset-corpus/` currently holds only antique-camera, avocado, boom-box, clear-coat-test, damaged-helmet, duck, sheen-test-grid): Khronos glTF-Sample-Assets `TextureTransformTest`, `NormalTangentMirrorTest`, `NormalTangentTest`, `IridescenceLamp`, `AnisotropyBarnLamp`, `AnisotropyRotationTest`, `DispersionTest`, `MaterialsVariantsShoe`, `AlphaBlendModeTest`, plus Draco and Meshopt encodings of DamagedHelmet and the KTX2 helmet. These are produced with PRD 05 tooling; if PRD 05's encoder has not landed by Phase 5, they are encoded once in CI with a pinned external encoder (no repo dependency added), committed as fixtures, and the exact command plus encoder version is recorded in `provenance`. Check each asset's own LICENSE (most are CC-BY 4.0; some are CC0 or have per-asset terms) and record attribution. Store GLBs in `fixtures/asset-corpus/` via LFS; extend the LFS pull list in `benchmarks/quality-rebuild/ci.sh`.

Phase 1: tint / override
- [ ] Create `packages/engine/src/production-runtime/ModelMaterialOverrides.ts` with `applyMaterialOverrides(snapshot, materials, overrides)`, re-applying from the snapshot (idempotent). Unit test: applying the same override twice yields identical parameters; `baseColorMultiply [0.5,0.5,0.5,1]` on helmet yields `u_baseColorFactor = authored*0.5` and `u_baseColorTextureEnabled` unchanged.
- [ ] `TypedGLBActor.ts:477-515`: replace `tintTypedGLBActorMaterials`/`applyMaterialTint` with `applyMaterialOverrides`. Delete the `/joint/i` branch. Delete the defaults `0.28`, `0.38` and `0.16`. Delete `emissive = baseColor` fallback at `:478`.
- [ ] `TypedGLBActor.ts`: implement `setTint` as a deprecated wrapper (`replaceTextures: true`, `baseColorReplace`).
- [ ] `index.ts:13567-13580`: build `materialOverrides` from `node.material` + `node.materialOverrides`. `color` → `baseColorMultiply` unless `colorMode:"replace"`. Never set `replaceTextures` unless the user passed it. Forward `emissive` only when present.
- [ ] `index.ts:1235` `AuraModelOptions`: add `materialOverrides`, `variant`. `index.ts:2098` `model()`: pass them to the node. `AuraModelNode` (`:1484`): add fields.
- [ ] Add `AuraModelMaterialOverride.target` matching (string exact / RegExp / array) against glTF `material.name` in the bridge. Unit test with a 2-material GLB fixture: target `"Body"` changes only Body.
- [ ] Browser test `tests/browser/model-material-override.spec.ts` (remote macos-14): render `damaged-helmet.glb` with no material and with `material:{color:"#ffffff"}` → SSIM ≥ 0.999. With `color:"#ff0000"`, the mean of R/G in the helmet mask rises vs baseline and the normal-map high-frequency energy (Laplacian variance in mask) is ≥ 90% of baseline.
- [ ] Migrate every `model(..., { material })` call site listed by the §10 step 2 command (39 raw matches on this branch, a superset of the 26 nodes in research/03 §9). Record the (a)/(b)/(c) decision per site in `docs/project/aura3d-quality-rebuild/evidence/prd-04/tint-migration.md`, one row per site with path:line, asset key, decision, and reason.
- [ ] `apps/aura-clash-showcase/src/playable/AuraClashArenaApp.ts:3372-3415` and `3441-3473`: replace `material.setParameter` pokes with `actor.setMaterialOverrides`. Hit flash becomes an additional override entry popped after the existing flash duration. Check whether the fighter GLBs have baseColor textures (`aura3d assets inspect`) and record the result in `tint-migration.md`.

Phase 1: hacks
- [ ] `ShaderLibrary.ts:2905-2955, 3061-3064, 3203`: delete `sourcePaint*` and `materialRedPaintGate`. `texturedBase = u_baseColor * decodedBaseColor * vertexColor`. AO multiplies indirect only.
- [ ] `ShaderLibrary.ts:379-383, 972-976, 1502-1506, 2655-2678`: delete stripe terms, `roughEnvironmentFloor`, and `mix(1.1,0.65,r)`.
- [ ] `WebGPUDevice.ts:3555-3588, 3665, 3675-3691, 3765, 3768-3773, 2234`: delete product gates, smoothing slot and `2.25`. Use the scene's directional lights from the light buffer (if the WebGPU light buffer is not wired, use the first directional light uniform and log `webgpu-material-approximate`).
- [ ] `apps/wow-webgpu-product-viewer/src/main.ts:51-66`: delete the material clamp loop.
- [ ] `GLTFRenderResources.ts:1751-1757`: delete `usesOpaqueDoubleSidedClearcoatShell` and its cull override (E23). (The E22 glass rewrite is deleted in Phase 4, below.)
- [ ] `GLTFRenderResources.ts:1660-1673`: default material = white `[1,1,1,1]`, metallic 1, roughness 1 (glTF spec defaults; r185 `GLTFLoader` `createDefaultMaterial` uses the same values).
- [ ] Unit test `tests/unit/assets/gltf-material-mapping-spec-exact.test.ts`: for each Khronos fixture except CompareTransmission (added in Phase 4), the descriptor factors equal the JSON factors exactly (no rewrites).
- [ ] Source regression guard `tests/unit/rendering/no-asset-specific-shader-constants.test.ts`: assert the shader sources do not contain `sourcePaint`, `productProp`, `RedPaintGate`, `horizonStripe` or `0.98, 0.12, 0.075`. Phase 3 adds `a3dApplyAdvancedPbrLobes`, `a3dPbrIridescenceColor` and `a3dPbrAnisotropicDistribution` to the list. The file header states that this guard is not quality evidence.

Phase 1: samplers, presets, budgets
- [ ] `Sampler.ts`: add `static trilinear({wrap, anisotropy})` and `static fromGLTF(info, aniso)`. Add `"mirrored-repeat"` to the address mode type. Map it in `WebGL2Device` to `MIRRORED_REPEAT` and in `WebGPUDevice` to `"mirror-repeat"`.
- [ ] `index.ts:14379-14381` and `index.ts:14529`: use `Sampler.trilinear({ wrap: spec.sampling?.wrap ?? "repeat", anisotropy: tierAniso })`. SDF text uses `wrap:"clamp"`.
- [ ] Add `sampling`/`slotSampling` to `AuraMaterialSpec` (`index.ts:1027`) and thread them into the C1 upgrade path (`index.ts:14290-14460`).
- [ ] `TexturedPBRMaterial.ts:1031-1036` (`u_*TextureWrap`): stop emitting wrap uniforms for non-atlas programs.
- [ ] Tier anisotropy: `resolveSamplerAnisotropy` lives in `packages/rendering/src/Sampler.ts:71` (re-exported by `packages/rendering/src/index.ts:387`; today's default is 8, `DEFAULT_SAMPLER_ANISOTROPY`). Add an optional `tier` field to `SamplerAnisotropyRequest`; when `desired` is undefined, default to `{Low:4, Medium:8, High:16, Ultra:16}[tier]`, clamped to `MAX_TEXTURE_MAX_ANISOTROPY_EXT`. Pass the app's resolved tier from both `index.ts:14380` and `14529`. Unit test per tier in `tests/unit/rendering/sampler-anisotropy-tier.test.ts`.
- [ ] `index.ts:2414-2640` presets: `pbr` no `color`; `emissive` `emissiveIntensity: options.emissiveIntensity ?? 1` and `color: options.color ?? "#808080"`; `neon` 2.0; `glass` `opacity ?? 1`; `metal` drop `envMapIntensity`. The primitive default colour `#d7dee8` moves to `createProductionPrimitiveMaterial` (`index.ts:14877`). Engine fallback `emissiveIntensity ?? (emissive ? 1.35 : 0)` → `?? (emissive ? 1 : 0)` at all three sites (`index.ts:14391, 14896, 14912`). Unit test `tests/unit/agent-api/material-presets-defaults.test.ts` asserts each preset's output object and the three resolved `emissiveStrength` values.
- [ ] Create `tools/codemods/pin-emissive-defaults.mjs`, which uses the TS compiler API to add `emissiveIntensity: 1.35` to `material.emissive(...)` calls and to material object literals that set `emissive` without `emissiveIntensity`, and `2.8` to `material.neon(...)` calls without one. Run it over `apps/` and commit the result in the same PR as the default change. Test: a fixture file run through the codemod matches a golden output.
- [ ] `WebGL2Device.createTexture`: implement the R16 clamp (blit-downsample by powers of 2 to `policy.maxDimension`), drop top mips for KTX2, and count bytes against `policy.maxBytes`. Unit test with a fake device: a 4096² input under the Medium policy uploads at 2048². Browser test: a Meshy hero renders at Medium with `textureBytes` ≤ 256 MiB.

Phase 2: physical core
- [ ] Create `packages/rendering/src/shaders/physical/` modules per §8.2–8.11, each exporting a GLSL string, with a header comment citing the r185 source file the formula is ported from.
- [ ] `BRDFLut.ts`: add `createDFGLut(device)` by porting the 512-value `Uint16Array` (256 RG half-float texels) from r185 `src/renderers/shaders/DFGLUTData.js` (16×16 RG16F, linear, clamp) with the three.js MIT notice. Switch every LUT read to `vec2(roughness, NdotV)` (the existing reads at `ShaderLibrary.ts:397, 983` use `vec2(nDotV, roughness)`), then delete `createExternalParityBrdfLut`. Unit test `tests/unit/rendering/dfg-lut.test.ts`: the ported array is byte-identical to `node_modules/three/src/renderers/shaders/DFGLUTData.js` (parse the module), and a JS bilinear lookup at (r=0.5, NdotV=0.5) matches three's `getDFGLUT()` data lookup exactly.
- [ ] Create `packages/rendering/src/materials/PhysicalFeatureKey.ts` with `physicalFeatureKey`/`physicalDefines` per §7.3. Unit test: key stability, and distinct keys for distinct feature sets.
- [ ] Create `PhysicalProgramCache` with lazy compile, `KHR_parallel_shader_compile` polling, a `precompile()` API and a superset fallback. Unit test with a mock device: a link failure falls back and increments `fallbacks`.
- [ ] Re-implement `TexturedPBRMaterial`, `PBRMaterial`, `InstancedPBRMaterial` and `SkinnedLitMaterial` as subclasses of a new `PhysicalMaterial` that produces a `PhysicalFeatureSet` from present textures and parameters. Keep the public constructor signatures.
- [ ] `ShaderLibrary.ts:2062-2075`: replace the variant table registration with `PhysicalProgramCache`. Keep the exported `DEFAULT_TEXTURED_PBR_*_VARIANT` constants as deprecated aliases resolving to keys.
- [ ] Remove `A3D_PBR_DISABLE_CLUSTERED_LIGHTING` and `A3D_PBR_DISABLE_TRANSMISSION_BACKDROP` from all programs. Implement §8.10. Browser test: 24 point lights and a clearcoat GLB; turning off light 20 changes pixels in its radius (proves light 20 is evaluated).
- [ ] Merge skinned-lit (`ShaderLibrary.ts:564-1058, 1090-1588`) into the physical VS with `A3D_SKINNING 4|8`. Browser test, two parts: (1) with the physical model **off** (`renderer.materialModel: "legacy"` lighting functions compiled into the merged program), `08-skinned-character` and `15-animation-skinning` body-region pixels are within masked ΔE2000 mean ≤ 1.0 of the pre-merge capture; this isolates the merge from the lobe changes. (2) With it on, the vision judge records no regression vs pre-merge, and the skinned-vertex positions (transform-feedback or CPU skin oracle) match pre-merge within 1e-5.
- [ ] Implement §8.8 tangents in the VS/FS of all families.
- [ ] Create `packages/assets/src/MikkTSpaceTangents.ts`: vendor `node_modules/three/examples/jsm/libs/mikktspace.module.js` (r185, MIT; copy its header) into `packages/assets/vendor/mikktspace/` and load it lazily in a worker. Replace `generateMeshTangents` (`GLTFRenderResources.ts:1216-1262`) as the default, keeping the old function only as `tangents:"legacy"` for tests. Unit test: for `NormalTangentMirrorTest` with its TANGENT attribute stripped, the generated tangents match the asset's authored (Blender/MikkTSpace-exported) TANGENT within 1e-3 per component after the glTF sign convention (`negateSign = true`, as in three's `computeMikkTSpaceTangents`); and three's `BufferGeometryUtils.computeMikkTSpaceTangents` on the same input produces identical output.
- [ ] Implement §8.9 UV transforms. CPU-side `uvTransformMatrix(offset, rotation, scale)` builds the glTF-spec `T·R·S`. Unit test (`tests/unit/rendering/uv-transform-matrix.test.ts`): (1) for 20 random inputs with `scale.x == scale.y`, equals three's `Matrix3.setUvTransform(ox, oy, sx, sy, r, 0, 0)` within 1e-6; (2) for non-uniform scale, equals the spec formula from the KHR_texture_transform README and is asserted to differ from three's when `r ≠ 0`, documenting the known three divergence.
- [ ] Implement §8.2 (IOR F0, specular, spec-AA, multiscatter direct, specular occlusion, Lambert default) and §8.3 clearcoat. In the same change delete E10/E11 (`ShaderLibrary.ts:2756, 2798, 2962-2973, 2995-2997`), E15 (`a3dPbrF0`, `ShaderChunks.ts:92-95`) and E16 (`a3dApplyAdvancedPbrLobes`, `ShaderChunks.ts:253-327`, plus every call site found by `rg a3dApplyAdvancedPbrLobes packages/rendering/src`).
- [ ] Unlit: physical key `unlit` outputs `baseColorFactor·tex·COLOR_0` through the shared output transform. Unit test: there is no env or light uniform read in the unlit program source.

Phase 3: lobes
- [ ] §8.4 sheen in `sheen.glsl.ts`; delete `ShaderLibrary.ts:2694-2806` sheen helpers.
- [ ] §8.5 anisotropy in `anisotropy.glsl.ts`; delete `ShaderLibrary.ts:2717-2718, 2766, 2807` aniso code.
- [ ] §8.6 iridescence in `iridescence.glsl.ts`; delete `ShaderLibrary.ts:2697-2717` film code and `ShaderChunks.ts:329-339`. §8.5 also deletes `ShaderChunks.ts:341-359` and the env streak at `:440-460`; extend the source guard with the Phase 3 tokens.
- [ ] Browser probe test `tests/browser/physical-lobes-probe.spec.ts`:
  - SheenTestGrid: green-channel mean per cell increases monotonically along sheenColor columns (≥ 3 of 3 steps) and the cell-mean spread across sheenRoughness rows is ≥ 0.02 **and** ≥ 50% of three's spread for the same cells. (An absolute-only threshold could pass with a nearly flat sheen.)
  - ClearCoatTest row 3: the coated-cell luminance standard deviation is ≥ 50% of three's.
  - AnisotropyBarnLamp metal at strength 1: highlight bounding-box aspect ≥ 2.0 and within ±25% of three's aspect.
  - Each probe is run once against the Phase 0 baseline build and must **fail** there; the failing baseline result is recorded in `evidence/prd-04/phase-3.md`. A probe that passes on the baseline is too weak and must be tightened before Phase 3 can exit.

Phase 4: transmission
- [ ] Create `packages/rendering/src/TransmissionRenderTarget.ts` per §7.3 (RGBA16F when `EXT_color_buffer_float` is available, else RGBA8; scale from tier).
- [ ] `ForwardPass.ts`: implement §9.1 pass order with `visibleTransmissiveCount` gating. Unit test with a mock pass graph: no capture when there are 0 transmissive items.
- [ ] §8.7 transmission/volume/dispersion. Replace the per-material `transmissionBackdropTexture` option (`TexturedPBRMaterial.ts:166-170, 338-346`, which today throws when combined with any extension variant) with the renderer-owned `TransmissionRenderTarget` bound as `u_transmissionSampler`; keep the option as a deprecated no-op for one minor version. `ProductionRuntimeRenderer.captureProof` (`production-runtime/ProductionRuntimeRenderer.ts:125-131`) is a proof readback and must not be used as a render input.
- [ ] Browser probe `tests/browser/transmission-probe.spec.ts`: CompareTransmission right bowl center pixel luma ≥ 0.6× checker luma behind it, and the checker pattern contrast is visible inside the bowl (|lightTile − darkTile| ≥ 0.25× unobstructed). Must fail on the Phase 0 baseline (black bowl); record that result.
- [ ] Delete `packages/rendering/src/materials/TransmissionPass.ts` CPU function (move it to `tests/unit/rendering/oracles/` if referenced).
- [ ] `GLTFRenderResources.ts:1743-1769, 1840, 2026`: delete `usesUnbackedScalarTransmission`, `renderPbrBaseColorFactor` and `renderPbrRoughnessFactor` (E22); pass authored factors and `transmissionFactor` (both `:1840` descriptor and `:2026` `setParameter` sites). Same PR as the transmission path above. Extend `gltf-material-mapping-spec-exact.test.ts` to CompareTransmission.

Phase 5: pipeline
- [ ] Create `packages/assets/src/KTX2TargetSelection.ts`.
- [ ] `KTX2BasisTextureTranscoder.ts`:
  - require `targetFormat`
  - preserve `colorSpace`
  - remove the RGBA8 double transcode
  - replace the unpkg fallback (`:22`) with the bundled transcoder URL
  - run it in a worker pool
- [ ] `WebGL2Device.ts:4117-4133` (`resolveCompressedTextureFormat`): add sRGB compressed formats and extension probing; today the `"etc2-rgba8unorm"` case (`:4127`) returns a format without checking `WEBGL_compressed_texture_etc`. Unit test: format mapping table (every `TextureCompressedFormat` × colour space → internal format or `null`). Browser test: `prd04-ktx2` ΔE.
- [ ] `TypedGLBActor.ts:183-191`: pass `dracoDecoder`/`meshoptDecoder` (lazy local loaders from `GLTFCompressionDecoders.ts`) when `extensionsUsed` contains them, plus `materialVariant: options.variant`. Browser test: Draco and Meshopt DamagedHelmet via `model()`.
- [ ] `model({variant})`, `setMaterialVariant`, `materialVariants()`. Browser test: MaterialsVariantsShoe switches 3 variants and each variant's mean colour differs by ΔE ≥ 10.
- [ ] Create `packages/rendering/src/ProceduralMaterialTextures.ts` with 4 generators:
  - fabric-normal: woven twill height → normal
  - rubber-roughness: fBm 4 octaves
  - brushed-metal-anisotropy: rg direction from `direction`, b strength from 1D streak noise
  - plastic-micro-scratch: random line segments into roughness

  All are tileable via periodic noise. Wire them into `index.ts:14040-14104` and `18262-18269`, replacing the "no rasterizer" warnings. Unit test: deterministic hash per seed; tileability (edge-column difference ≤ 1/255 between column 0 and column N, wrapping).
- [ ] A2C: `WebGL2Device` state plus the §8.11 shader path. Browser test `prd04-alpha-mask` (`alpha-to-coverage.spec.ts`).

Phase 6: WGSL and truthfulness
- [ ] Port `shaders/physical/*` to `shaders/physical-wgsl/*`. Add U-BSDF-PARITY (§15.1).
- [ ] Generate `GLTF_EXTENSION_SUPPORT_MATRIX` (`GLTFExtensionSupport.ts:39-68`) and `PHYSICAL_EXTENSION_MATRIX` (`PhysicalMaterialSpec.ts:43-52`) from `tests/reports/material-conformance.json` with a script `tools/generate-extension-matrix.mjs`. CI fails if the checked-in matrix differs from the generated one.
- [ ] Delete E34 files after `rg` shows zero imports. Update `packages/rendering/src/index.ts` exports.

Phase 7: games (with PRD 14)
- [ ] For each game in §16.2, capture before/after via `.github/workflows/quality-rebuild-capture.yml` and run the vision judge with the material rubric. Attach the results to `evidence/prd-04/games.md`.

---

## 15. Test requirements

All browser and GPU tests run remotely on GitHub Actions `macos-14` (ANGLE Metal), in
`.github/workflows/quality-rebuild-capture.yml` (new job `materials-conformance`) or a new
`.github/workflows/materials-conformance.yml` using the same GPU args (`--use-angle=metal
--enable-gpu --ignore-gpu-blocklist`). Policy forbids running local Playwright/Chromium for these
suites. Unit tests (vitest, no GPU) may run locally with `--maxWorkers=2` and also run in CI.

### 15.1 Unit (vitest, `tests/unit/**`)
- `rendering/physical-feature-key.test.ts`: key and defines determinism; superset fallback.
- `rendering/dfg-lut.test.ts`: ported LUT is byte-identical to r185 `DFGLUTData.js` (§14).
- **U-BSDF-PARITY** has two halves.
  - Unit half: `rendering/physical-bsdf-reference.ts` is a hand-written JS port of the r185
    formulas (`a3dGeometryRoughness`, F0, `D_Charlie`, `V_Neubelt`, `IBLSheenBRDF`,
    `D_GGX_Anisotropic`, `V_GGX_SmithCorrelated_Anisotropic`, `BRDF_GGX_Multiscatter`, `evalIridescence`,
    `computeSpecularOcclusion`, `a3dApplyIorToRoughness`, `a3dVolumeAttenuation`). The vitest file
    checks it against `tests/fixtures/bsdf/r185-golden.json`, a committed table produced once by the
    browser job evaluating three's own `THREE.ShaderChunk` GLSL functions (not Aura's ports) on the
    same grid. Regenerating the golden file requires a three version bump and is reviewed as such.
  - Browser half: `tests/browser/physical-bsdf-numeric.spec.ts` runs on remote macos-14. It renders
    each GLSL and WGSL function into an RGBA32F target over a 16×16×8 grid of (NdotV, NdotL,
    roughness, ior), reads it back, and asserts ≤ 1e-3 relative error against the JS reference.
- `assets/gltf-material-mapping-spec-exact.test.ts`: no import rewrites.
- `assets/mikktspace-tangents.test.ts`, `assets/ktx2-target-selection.test.ts`, `assets/ktx2-colorspace-preserved.test.ts`.
- `production-runtime/model-material-overrides.test.ts`: idempotence, targeting, multiply semantics, deprecated `setTint` mapping.
- `agent-api/material-presets-defaults.test.ts`; `agent-api/model-variant-option.test.ts`.
- `rendering/procedural-material-textures.test.ts`: determinism and tileability.
- `rendering/uv-transform-matrix.test.ts`: glTF-spec `T·R·S`; equals three `Matrix3.setUvTransform` for uniform scale, differs (asserted) for non-uniform scale with rotation.
- `rendering/no-asset-specific-shader-constants.test.ts`: regression guard only.

### 15.2 Browser (Playwright, remote macos-14)
- `tests/browser/model-material-override.spec.ts`: tint-white SSIM, red-tint detail retention.
- `tests/browser/physical-lobes-probe.spec.ts`: sheen monotonicity and spread, clearcoat roughness variance, anisotropy highlight elongation (§14 thresholds, each relative to three as well as absolute).
- `tests/browser/transmission-probe.spec.ts`: see-through probe; Low-tier env fallback never black.
- `tests/browser/light-count-extension-materials.spec.ts`: light 20 is evaluated on a clearcoat GLB.
- `tests/browser/ktx2-srgb.spec.ts`: KTX2 vs PNG ΔE, and an inverted control (the same texture deliberately uploaded as linear) must exceed ΔE 5, proving the test can detect the E27/E28 bug.
- `tests/browser/gltf-decoders-variants.spec.ts`: Draco, Meshopt, variants.
- `tests/browser/texture-tiling.spec.ts`: 20× tiled ground; FFT of a 256-px strip has no seam spikes at the tile frequency above the 3× median. Control: the same scene with clamp-to-edge forced must show the spike.
- `tests/browser/alpha-to-coverage.spec.ts`: edge gradient width ≥ 2 px under MSAA 4×; with A2C forced off the same edge must measure ≤ 1 px.
- `tests/browser/material-program-cache.spec.ts`: program count and compile time per game route.

Every probe that compares against a fixed threshold ships with a negative control (a baseline build
or a forced-bad configuration) that must fail it. A probe without a failing control is not accepted.

### 15.3 Conformance report
`tests/reports/material-conformance.json` is produced by the browser job. For each extension it
records pass/fail per probe and the benchmark scene judgments. It is the only input to the support
matrix generation (R17).

Explicitly not acceptable as evidence: source-token tests, a non-blank screenshot, a capability
log entry, or a parity matrix entry.

---

## 16. Visual acceptance tests

Reference: three.js r185 output of the same `benchmarks/quality-rebuild/shared/scenes.ts` spec, at
1280×720, DPR 1, captured in the same macos-14 job. Judging follows the research/23 protocol:
1. A vision model scores both images 0–10 on a "modern browser 3D" scale, classifies each difference
   as `equivalent` / `minor-aura3d-deficiency` / `major-aura3d-deficiency` / `implementation-bug` /
   `aura3d-better`, and checks harness fairness.
2. A **human reviewer** confirms or overrides the judgment and signs off.

Metrics are computed **inside a subject mask**, the three.js frame's non-background pixels dilated by 4 px.
Research/22 shows that full-frame SSIM flatters Aura because flat background makes up 54–78% of
the frame. Metrics can catch regressions, but they never pass a scene alone.

### 16.1 Benchmark scenes

| Scene | Asset / content | Judged criterion | Threshold (all required) |
|---|---|---|---|
| 02-pbr-product | AntiqueCamera on plinth | Chrome roughness gradient, wood specular without sparkle (spec-AA), opaque plinth | Aura ≥ three − 0.5; no `implementation-bug`; the plinth is classified `equivalent` (if the plinth cause is primitive geometry, PRD 01 must land first) |
| 03-damaged-helmet | DamagedHelmet, IBL only | Visor lobe crispness, metal contrast | Aura ≥ three − 0.3; masked ΔE2000 mean ≤ 3.0 |
| 04-clearcoat | ClearCoatTest | Coat roughness texture visible (row 3); no milky veil; coat normal rings (row 6) | Aura ≥ three − 0.5; differences #2–#4 of research/23 §04 are classified `equivalent` |
| 05-transmission | CompareTransmission | Refracted checker through the right bowl; Fresnel rim | Aura ≥ three − 0.5; probe of §14 passes |
| 06-metal-roughness-sweep | primitives | Dielectric rim fades with roughness; no aliasing (spec-AA) | Rim and aliasing items are `equivalent`. Mid-roughness metal blur is accepted only after PRD 02 |
| 07-sheen-fabric | SheenTestGrid | Sheen grows with colour; spreads with roughness; matte base | Aura ≥ three − 0.5; differences #1–#3 of research/23 §07 are `equivalent` |
| 08-skinned-character | CesiumMan | No regression from the shader merge; correct texture transform | Score ≥ pre-merge score **and** ≥ three − 0.5; the merge-isolation ΔE test of §14 passes |
| prd04-texture-transform (new) | Khronos TextureTransformTest | All 9 tiles show the "correct" arrow orientation | Every tile matches three; any mismatch is a fail. Pixel probe: each tile's arrow-centroid angle within ±5° of three's |
| prd04-normal-tangent (new) | Khronos NormalTangentMirrorTest + NormalTangentTest | Mirrored-UV normal maps light consistently | Vision: `equivalent`; masked ΔE2000 mean ≤ 3; left/right mirrored halves differ by ≤ 2 ΔE (a seam or flipped-bitangent bug produces ≥ 10) |
| prd04-iridescence (new) | Khronos IridescenceLamp | Thin-film hue shift with view angle and thickness map | Aura ≥ three − 0.5; mean hue of the film region at 3 camera angles within ±15° of three's at each angle |
| prd04-anisotropy (new) | Khronos AnisotropyBarnLamp + AnisotropyRotationTest | Elongated highlights following direction texture | Aura ≥ three − 0.5; rotation test: highlight major-axis angle per disc within ±10° of three's |
| prd04-dispersion (new) | Khronos DispersionTest | Chromatic separation through prisms | Aura ≥ three − 1.0 (High tier); R–B centroid offset at the prism edges 50–150% of three's (§13 Phase 4) |
| prd04-variants (new) | Khronos MaterialsVariantsShoe | 3 variants render as authored | All 3 `equivalent`; each variant within masked ΔE2000 mean ≤ 3 of three's same variant |
| prd04-ktx2 (new) | DamagedHelmet re-encoded KTX2 with **UASTC for every map** (base colour included) so the test isolates colour-space handling from codec loss; an ETC1S-base variant is captured as informational only | Base colour not washed out vs PNG version | Masked ΔE2000 mean ≤ 2.0 vs Aura PNG render; Aura ≥ three − 0.3 |
| prd04-tiled-ground (new) | 40 m plane, 1 m tiling CC0 ground texture set (base/normal/rough), grazing camera | No seams, no shimmer, anisotropic sharpness at distance | `texture-tiling.spec.ts` passes; vision `equivalent` at anisotropy 16; sharper than three's default aniso 1 is reported as `aura3d-better` and must not count as a regression. The three side is also captured with `texture.anisotropy = 16` and that pair must be `equivalent` |
| prd04-tinted-hero (new) | Meshy hero (`courierVanMeshyV2Decimated`) with `color:"#e85d75"` vs three `material.color.set()` on each material | Texture detail retained under tint, no self-glow | Vision `equivalent`; masked Laplacian variance ≥ 90% of three's; mean luma of the shadowed side ≤ 1.1× three's (catches self-glow); human confirms "not toy plastic" |
| prd04-alpha-mask (new) | Khronos AlphaBlendModeTest + foliage card set | MASK edges under MSAA | Aura ≥ three − 0.5; `alpha-to-coverage.spec.ts` passes |

Benchmarks `prd04-*` (10 scenes) are specified by this PRD and built by PRD 12. Every vision threshold above is
paired with at least one pixel metric so a lenient judge cannot pass a scene alone; the pixel metric
alone also cannot pass it (§16 preamble).

### 16.2 Games

Captured with `tools/quality-rebuild-capture/` (desktop 1920×1080 and 1280×720, plus mobile viewports
from `games.json`) and judged with the research/21 rubric. The **visual categories are
texture_quality, material_quality and pbr_credibility**. Thresholds apply to those categories after
Phase 7. The art-direction and asset rework that lifts the other categories is PRD 14's job.

All 18 games in `tools/quality-rebuild-capture/games.json` are listed. Baseline scores are research/21
(texture / material / pbr). "PRD-04 lever" is what this PRD changes in that game; where the gap is
asset-side, the required outcome is limited to what PRD 04 controls and the rest is assigned to PRD 05/14.
Every outcome includes a machine check that does not depend on the vision judge.

| Game | Baseline t / m / p | Material-specific issue | PRD-04 lever | Required outcome |
|---|---|---|---|---|
| aura-clash-showcase | 4 / 3 / 3 | Fighter "clay mannequin" from raw-uniform overrides (E4) | R1 overrides, E4 migration, skinned unification (E26) | texture_quality ≥ 6; the judge no longer reports erased character textures; `inspectMaterials()` on both fighters lists `baseColor` in `enabledMaps` |
| showcase-aurora-lander | 1.5 / 2.5 / 2 | Flat teal lander, matte terrain | R1 (art-review tint calls), R15 presets, R3 metal/rough | pbr_credibility ≥ 3.5; no material on the lander has `emissiveStrength > 0` unless authored emissive (inspectMaterials) |
| showcase-bank-shot | 2 / 3 / 3 | Felt has no fiber or sheen; rails read as plastic | R3 sheen, R12 `fabric-normal` for felt, R6 tiling | material_quality ≥ 4.5; felt material uses sheen and a procedural normal (inspectMaterials `extensions` contains `KHR_materials_sheen`) |
| showcase-blockfall-reactor | 5 / 5 / 4 | Strongest current material (candy blocks); risk is regression | R3 transmission/clearcoat on blocks, R15 | No category below baseline; block `featureKey` unchanged or a superset |
| showcase-courier-rush | 3 / 3 / 2 | Tinted traffic cars, ~20 lights, emissive-painted city | R1, R5 clustered on every key, R15 | Traffic cars show authored textures (inspectMaterials and vision); `lightsDroppedByMaterial = 0`; material_quality ≥ 5 |
| showcase-deep-recovery | 1 / 2 / 1.5 | 6 tinted models, flat translucent teal | R1, R4 (translucent → transmission where intended), R15 | texture_quality ≥ 4 after the R1 migration (an asset swap may be needed via PRD 05); no transmissive pixel is black (probe) |
| showcase-gallery-shift | 2 / 3 / 2 | ~31 lights > cap; "gold reads as yellow plastic" | R5, R3 IOR F0 / multiscatter | Gold reads as metal (vision); gold material `metallic ≥ 0.9` and no emissive (inspectMaterials); `lightsDroppedByMaterial = 0`; material_quality ≥ 5 |
| showcase-gravity-post | 2.5 / 2 / 1.5 | Tinted dock gate; "everything unlit, flat or translucent" | R1, R14 unlit correctness, R4 | Gate retains textures; material_quality ≥ 4 (asset rework in PRD 14 raises it further) |
| showcase-mech-hangar | 2.5 / 3.5 / 3.5 | Untextured script meshes (asset-side); mech metal has some spec | R3, R15 | No category below baseline; mech hero `pbr_credibility` ≥ 4.5; mean frame luma within ±10% of baseline (R15 must not brighten) |
| showcase-neon-swarm | 3 / 3 / 3 | Flat-shaded enemies, "black blobs look like missing materials" | R1 (art-review calls), R17 diagnostics surface missing inputs | Zero `AuraMaterialIssue` entries in strict mode; no material renders as pure black (probe: no 32×32 region with luma < 0.01 inside a lit subject mask) |
| showcase-orbital-defense | 0.5 / 1.5 / 1 | No textures anywhere (asset-side) | R6 tiling + R12 procedural maps become available to PRD 14 | No category below baseline; PRD 04 imposes no score threshold (texture work is PRD 05/14) |
| showcase-patrol-wing | 3 / 4 / 3 | Textured Meshy hero `patrolAircraftMeshy`; world untextured | R8 tangents, R9 KTX2, R16 clamp | Hero material_quality ≥ 6 with PRD 02 environment in place; hero texture bytes within the tier budget |
| showcase-pulse-tunnel | 1 / 3 / 3 | Glossy clearcoat vehicle; over-driven neon | R3 clearcoat, R15 neon default | Hero material_quality ≥ 6 with PRD 02 environment; codemod-pinned neon values unchanged until PRD 14 |
| showcase-rooftop-buckets | 2 / 3 / 3 | Backboard emissive instead of glass; hero `rooftopShooterMeshyV1` | R4 transmission, R15 | Backboard renders as transmissive glass (inspectMaterials `extensions` contains `KHR_materials_transmission`, no emissive); hero material_quality ≥ 6 |
| showcase-siege-golf | 2.5 / 3 / 2.5 | Tinted crate with auto-glow | R1 (no auto-emissive) | Crate has no self-glow in shadow: crate shadow-side luma ≤ 1.1× an untinted reference render; textures visible |
| showcase-skyline-runner | 4 / 4 / 3 | 3 tinted model calls; ice/snow have no spec | R1, R3 spec-AA and roughness response | pbr_credibility ≥ 4; tinted models list `baseColor` in `enabledMaps` |
| showcase-turbo-drift-circuit | 1.5 / 3 / 3 | Car paint clips; asphalt has no micro-roughness | R3 clearcoat + multiscatter, R6 tiling | Clearcoat reads as lacquer (vision); car body `featureKey` includes `clearcoat`; fewer than 0.5% of car-body-mask pixels saturated (any channel = 255) in each of 3 captures |
| showcase-vault-breakers | 1 / 2 / 1 | Matte single-colour plastic; no metal/rubber/glass | R12 `rubber-roughness`, R3 metal, R4 glass | No category below baseline; PRD 04 imposes no score threshold (playfield art is PRD 14) |

A pass requires both the vision-model score and a human reviewer's sign-off. A human "no" overrides
a passing score.

---

## 17. Performance budgets

Tier definitions come from PRD 11. Reference devices are:
- Low: Intel UHD 620 laptop or Adreno 610-class Android, 1280×720.
- Medium: M1 8-core GPU or Adreno 650, 1920×1080.
- High: M1 Pro or RTX 3060, 2560×1440.
- Ultra: RTX 4070+, 3840×2160.

Budgets are **incremental material cost** on the game-scene benchmark (18) and on the heaviest
material game (Gallery Shift), measured with GPU timer queries (`EXT_disjoint_timer_query_webgl2`)
where available. On macos-14 CI, where timer queries are not exposed under ANGLE Metal, budgets are
checked as the relative frame-time ratios defined below the table.

Context: the current shipped games run at 5–15 fps on the macos-14 runner (Deep Recovery 0.5–1 fps;
Orbital Defense and Vault Breakers ~60 fps; `evidence/games/report.slim.json`). Material work
must not be blamed for, or hide, those costs, so each budget is a delta.

| Item | Low | Medium | High | Ultra |
|---|---|---|---|---|
| Physical BSDF vs current shaders (all opaque materials) | ≤ +0.3 ms | ≤ +0.5 ms | ≤ +0.8 ms | ≤ +1.2 ms |
| Clearcoat+sheen+aniso+iridescence (per 10% screen coverage) | iridescence off → Schlick; ≤ +0.2 ms | ≤ +0.3 ms | ≤ +0.4 ms | ≤ +0.6 ms |
| Transmission capture + mips | off (env fallback) | half-res ≤ 1.0 ms | full-res ≤ 1.5 ms | full-res + bicubic ≤ 2.5 ms |
| Dispersion (3 samples) | off | off | on, ≤ +0.3 ms | on, ≤ +0.5 ms |
| A2C | 0 | ≤ 0.05 ms | ≤ 0.05 ms | ≤ 0.05 ms |
| CPU per frame (override application, feature-key lookup) | ≤ 0.1 ms | ≤ 0.1 ms | ≤ 0.1 ms | ≤ 0.1 ms |
| Program compile (first use, per program, main thread) | ≤ 60 ms | ≤ 40 ms | ≤ 30 ms | ≤ 30 ms |
| Programs per game route | ≤ 32 | ≤ 64 | ≤ 96 | ≤ 128 |
| Texture memory budget | 128 MiB | 256 MiB | 512 MiB | 1 GiB |
| Max texture dimension | 1024 | 2048 | 4096 | 4096 |
| Transmission target memory | 0 | ≈ 5.5 MB | ≈ 39 MB (1440p) | ≈ 88 MB (4K) |
| Default anisotropy | 4 | 8 | 16 | 16 |
| MikkTSpace (per 100k verts, worker) | derivative frame only | ≤ 60 ms | ≤ 40 ms | ≤ 40 ms |
| KTX2 transcode (2048² UASTC, worker) | ≤ 120 ms | ≤ 60 ms | ≤ 40 ms | ≤ 40 ms |

Bundle sizes are gzip, measured by the repo's existing bundle-size check (`BUNDLE_SIZES` / `aura3d check-deploy`, per the aura3d-performance skill):
- Core `@aura3d/engine` + `@aura3d/rendering`: net **≤ +15 KB**. This covers new chunks, the program
  cache and the DFG LUT, offset by deleting the variant table, hacks and stubs. It is checked in CI
  against the pre-PRD baseline.
- Lazy chunks, fetched only when needed (r185 raw sizes; gzip recorded at vendoring and then enforced
  at ≤ +5% of the recorded value): MikkTSpace 48.8 KB; basis transcoder 527 KB wasm + 57.5 KB JS;
  Meshopt 29 KB; Draco 286 KB wasm + 59 KB wrapper. All are served from the app origin. CDN
  fetches are not allowed.

CI enforcement (macos-14, where absolute ms cannot be trusted): for 18-game-scene and Gallery Shift,
the median frame time over 300 frames with the physical model on must be ≤ 1.10× the same build with
`renderer.materialModel: "legacy"`, and ≤ 1.15× with transmission active vs `renderer.transmission: "off"`.
Program count and texture bytes are exact and are enforced from `AuraMaterialDiagnostics`. The ms
columns above are verified on the reference devices (§19) once per phase and recorded in `perf/<tier>.json`.

---

## 18. Browser coverage

| Browser | Backend | Required |
|---|---|---|
| Chrome stable (macOS, ANGLE Metal) | WebGL2 | All tests. Primary CI target (macos-14) |
| Chrome stable (Windows, ANGLE D3D11) | WebGL2 | Benchmarks 03/04/05/07/prd04-ktx2 captured at least once per phase via a `windows-latest` job (software/WARP adapter if no GPU; results labelled as such and not used for vision scoring). Check that BC7/S3TC sRGB formats are selected |
| Safari 17+ (macOS, Apple silicon) | WebGL2 | Manual run per phase on a real Mac: 04, 05, 07, prd04-ktx2, prd04-tiled-ground; record screenshots. Check that ASTC/ETC2 sRGB formats are selected |
| Firefox stable | WebGL2 | Smoke: 03, 05, prd04-tiled-ground; check `EXT_texture_filter_anisotropic` and `KHR_parallel_shader_compile` absence handling |
| Chrome stable | WebGPU | Phase 6 only: 03/04/05/07 within ΔE ≤ 2 of Aura WebGL2 |

Required capability fallbacks:
- No `EXT_color_buffer_float`: RGBA8 transmission target.
- No anisotropic filtering: trilinear.
- No `KHR_parallel_shader_compile`: synchronous compile during load.
- No compressed formats: RGBA8 with a diagnostic.

---

## 19. Mobile coverage

- iOS Safari 17+ (A15-class or newer) and Android Chrome (Adreno 650 / Mali-G78 class). Run
  manually per phase on real devices, or through a device-farm job if PRD 11/12 provision one.
  Playwright mobile emulation on macos-14 is used for layout only, never for GPU judgments.
- Low tier on mobile (the default for mobile unless PRD 11 tiers the device Medium, e.g. Adreno 650 class, which then uses the Medium column of §17):
  - transmission env fallback, no dispersion
  - iridescence → Schlick
  - anisotropy 4
  - 1024 max texture size, 128 MiB texture budget
  - derivative tangents if the MikkTSpace wasm is not yet loaded
  - ASTC (iOS) or ETC2/ASTC (Android) KTX2 targets
  - program count ≤ 32 per route (superset merging); total sampler units per program ≤ the device's `MAX_TEXTURE_IMAGE_UNITS` (16 on many Mali/Adreno parts), checked by the feature key before compile
- Required on a real iOS device **and** a real Android device: 05-transmission and prd04-tiled-ground render without black pixels (probe as in §14) or seams (`texture-tiling.spec.ts` metric on the device capture); a Meshy hero (`patrolAircraftMeshy`) loads within the 128 MiB budget without `webglcontextlost`; `material-program-fallback` count = 0 and no compile errors in the console across the §16.2 games' mobile captures.
- Per recommendation on mobile: R1/R2/R7/R13/R14/R15/R17 have no mobile-specific behaviour; R3 drops iridescence film; R4 uses env refraction; R5 merges keys; R6 caps anisotropy at 4; R8 prefers the derivative frame until the worker result arrives; R9 selects ASTC/ETC2; R10/R11 unchanged; R12 generates 256²; R16 clamps to 1024.

---

## 20. Screenshots and evidence required

For each phase, under `docs/project/aura3d-quality-rebuild/evidence/prd-04/`:
- `<phase>.md`: the GH Actions run ID, commit SHA, and the table of scene scores (vision + human) vs baseline.
- `benchmark/<scene>-side-by-side.jpg`, `<scene>-diff.jpg` and masked metrics JSON for every scene in §16.1.
- `debug-views/<scene>-<view>.jpg` for 04 (clearcoat, clearcoatRoughness, clearcoatRoughnessEffective), 07 (sheen), prd04-normal-tangent (tangent), prd04-anisotropy (anisotropy direction).
- `games/<id>-before.jpg` / `<id>-after.jpg` (contact + mid shots) for all 18 §16.2 games, plus the `inspectMaterials()` JSON for each tinted model and the machine-check results from the §16.2 table.
- `probes/<probe>-baseline.json`: the negative-control (baseline or forced-bad) result for every §15.2 probe, showing it fails.
- `perf/<tier>.json`: the §17 deltas.
- `tint-migration.md`: the per-call-site decisions.
- `material-conformance.json`: copied from the CI artifact.

These are evidence for review. They are not a quality claim by themselves.

---

## 21. Completion criteria

All of the following, judged on the final commit:
1. Every §16.1 scene meets its threshold, with vision-model and human sign-off recorded.
2. Every §16.2 game meets its material outcome after PRD 14's rebuild pass, with human sign-off.
3. No shared shader or glTF import code contains asset-specific branches.
   `inspectMaterials()` on every Khronos fixture shows factors equal to the authored JSON.
4. `lightsDroppedByMaterial == 0` on all 18 games.
5. The support matrices are generated from conformance results, and no extension is marked
   `conformant` without a passing benchmark scene.
6. The §17 CI ratios are met on macos-14 for every phase, and the §17 millisecond budgets are met on the Medium reference device and spot-checked on a Low real device, with `perf/<tier>.json` committed.
7. E34 stubs are deleted. `rg` shows no imports.
8. PRD 13 skills and templates use the new override API. No template passes `replaceTextures: true`
   by default.

---

## 22. Rollback considerations

- **Physical BSDF** ships behind `renderer.materialModel: "legacy" | "physical-r185"` for one
  development cycle. Rollback flips the default. The legacy path is deleted only after Phase 7 sign-off.
- **Tint semantics:** rollback is per call site (`replaceTextures: true`). The global hard-coded
  flatten is not restored.
- **Transmission:** `renderer.transmission: "auto" | "env" | "off"`. Rollback sets `"env"`, which is
  still non-black.
- **KTX2 compressed upload:** `assets.ktx2: "compressed" | "rgba8"` kill switch if a driver mis-decodes a format.
- **MikkTSpace:** `tangents: "derivative"` kill switch.
- **Diffuse lobe:** `A3D_DIFFUSE_BURLEY` restores the current Burley base diffuse per program if the Lambert switch causes a regression the judge attributes to diffuse; it does not restore any other legacy term.
- **Alpha-to-coverage:** `alphaToCoverage: false` per material or `renderer.alphaToCoverage: false` globally returns to `discard`.
- **Procedural material textures:** if a generator misbehaves, `materialStrictness: "warn"` plus a per-kind disable returns that preset to its scalar material with a `procedural-texture-failed` diagnostic.
- **Program cache:** if compile stalls exceed budget, `precompile` during the loading screen.
  Rollback merges keys to supersets (fewer programs).
- **Hack removal is not rolled back.** If an evidence capture changes, the evidence is re-captured.
  Restoring asset-specific shader code is forbidden.
- Every flag is reported in `app.diagnostics().materials` so captures record which path ran.

---

## 23. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| Fixes look worse until PRD 02's environment lands: correct BRDFs under a 128×64 LDR non-mipmapped env still look flat | High | Medium | Sequence acceptance after PRD 02 Phase 1. Judge 03/04/05/07 with the benchmark's HDRI, which already uses the mipmapped HDRI path |
| Games tuned around the tint glow and emissive defaults go dark | High | Medium | Codemod pins old emissive values. The tint migration is reviewed per site. PRD 14 re-lights |
| Shader program explosion / compile stalls on mobile | Medium | High | Superset merging on Low, `precompile()`, parallel compile, program-count budget test |
| WebGL2 uniform/sampler limits (16 texture units on some mobile GPUs) with all extension maps + shadows + env + LUT + transmission | Medium | High | Feature key counts samplers. Above `MAX_TEXTURE_IMAGE_UNITS`, pack extension maps into the existing atlas variant (`A3D_PBR_EXTENSION_ATLAS`) and drop to `approximate` with a diagnostic |
| Transmission capture cost in scenes with many glass objects | Medium | Medium | One capture per frame regardless of count. Half-res on Medium |
| KTX2 sRGB formats mis-handled by specific drivers | Low | Medium | `ktx2-srgb.spec.ts` on each browser. Kill switch |
| Khronos sample-asset licensing (some are not CC0) | Low | Low | Record the license per asset in `shared/assets.ts`. Use only redistributable assets in the repo |
| Human/vision judgment variance | Medium | Medium | Two independent vision runs. Human tiebreak. Fixed scene specs and seeds |
| Skinned merge regresses animation | Medium | High | Scenes 08/15 gates plus PRD 06 review before merge |
| Removing `u_materialEnvironmentSpecularScale`-gated hacks shifts showcase looks broadly | High | Low | Expected and intended. Re-capture evidence |
| Deliberate r185 deviations (spec-order UV transform for non-uniform scale, bilinear transmission on Medium, Burley opt-in) are read as bugs by the judge | Medium | Low | Each deviation is listed in the support-matrix `notes` and the judge prompt; prd04-texture-transform uses TextureTransformTest, which has uniform scale, so it is unaffected |
| Lambert default changes every lit surface slightly vs current Burley | High | Low | Expected; it moves toward the reference. `A3D_DIFFUSE_BURLEY` rollback exists (§22) |
| Benchmark scene IDs collide with other PRDs | Was certain | Medium | Owner-prefixed `prd04-*` IDs per PRD 12 §9.4 (§12) |
| Draco/Meshopt/KTX2 fixtures depend on PRD 05 encoders | Medium | Medium | One-off pinned CI encode committed as fixtures (§14 Phase 0) |

---

## 24. Explicitly out of scope

- Environment/IBL generation, PMREM quality, default HDRI, env sampler fix (PRD 02).
- Tone mapping, exposure, bloom, AA passes (PRD 03), except A2C state, which this PRD owns.
- Asset encoding, re-authoring, decimation, texture resizing at `assets add`, and replacing unlit
  cards and untextured script meshes (PRD 05). This PRD only decodes and renders.
- The instancing `node.size` bug (`index.ts:14747`) and primitive tessellation (PRD 01).
- Real `KHR_materials_diffuse_transmission` back-lighting, subsurface scattering, layered transmission (transmissive seen through transmissive), screen-space caustics.
- `KHR_materials_pbrSpecularGlossiness` beyond the existing conversion.
- Node-based/custom shader material authoring (`shader: "solar-sun"` etc. keep working unchanged).
- The `@aura3d/materials` package's preset library rebuild. PRD 15 decides between deletion and a rebuild on the new API. Until then it must not be advertised as "50 PBR materials" (research/08 §2).
- Agent skill and template wording (PRD 13), beyond the API and defaults defined here.
