# PRD 02: Lighting, IBL, Reflections and Shadows

Program: Aura3D visual-quality autopsy and rebuild (branch `aura3d-quality-rebuild/audit`).
Status: Draft for implementation. Owner track: rendering (`packages/rendering`), engine agent-api
(`packages/engine/src/agent-api`), environments (`packages/environments`).
Reference implementation: three.js r185 (`node_modules/three` 0.185.1, installed in this repo). Port
semantics from `src/extras/PMREMGenerator.js`, `src/renderers/shaders/ShaderChunk/{lights_pars_begin,
lights_physical_pars_fragment,envmap_physical_pars_fragment,cube_uv_reflection_fragment,
shadowmap_pars_fragment,shadowmap_pars_vertex}.glsl.js`, `src/renderers/webgl/WebGLShadowMap.js`,
`examples/jsm/csm/CSM.js`, `examples/jsm/environments/RoomEnvironment.js`.

Evidence base: research/02, 04, 06, 18, 19, 21, 22, 23 under
`docs/project/aura3d-quality-rebuild/research/`, plus the capture evidence under
`docs/project/aura3d-quality-rebuild/evidence/` (GH Actions run 37289688772, macos-14, ANGLE Metal on an
Apple Paravirtual device).

Gate: this PRD is not done when tests pass, routes return 200, screenshots are non-blank, or a
capability matrix goes green. It is done only when the benchmark scenes and games listed in section 16,
judged visually against three r185 by a vision model **and** a named human reviewer, meet the
thresholds stated there. Aura3D is not Three.js-quality today. Nothing in this document may be cited
as evidence that it is until those thresholds are met.

---

## 1. Problem statement

Aura3D's direct BRDF is sound: GGX, height-correlated Smith, Burley diffuse, plus split-sum IBL with a
GGX BRDF LUT and Fdez-Agüera multi-scatter (research/04 §11). The games still look flat, ungrounded and
"early tech demo" because of everything the BRDF is fed and how the lighting terms are combined:

1. **Most games have no image-based lighting at all.** If a scene adds `lights.ambient()` and has no
   `environments.*` node, the bridge zeroes both environment-map intensities and binds no map. All 18
   games author `lights.ambient`, so **15 of 18 games get zero IBL** (research/18 C1, research/19 C1).
   Turbo Drift and Siege Golf add `environments.studio`, which silently drops their ambient instead.
   Aura Clash avoids the ambient branch by a different route: its root scene authors only a spot light,
   and the fighters render through a compatibility RenderSource (research/19 C1, Skeptic 2).
2. **The IBL that does exist is low-fidelity.** It has three defects:
   - The default and preset environments are 128×64 gradients, Reinhard-tonemapped to 8-bit sRGB
     *before* prefiltering.
   - On WebGL2 the map is bound with a non-mipmapped sampler, so every roughness reads level 0.
   - The "gameplay" preset tints all specular cyan `[0.2, 0.96, 1.0]`.

   The HDRI path has its own defects. Its CPU PMREM blends toward the global average by
   `roughness⁴·0.82`, and diffuse comes from a 1×1 mip. The SH9 irradiance is computed and never
   sampled (research/04 §5, research/19 C10).
3. **No sky is ever drawn.** The root bridge never sets `environmentBackground`, so every game's sky is a
   clear colour or hand-built geometry (research/19 C9).
4. **Shadows are invisible or wrong.** The defects are:
   - Strength defaults to 0.32 (0.24 for product scenes, 0.38 for city-day; research/19 C11).
   - The depth pass ignores skinning, instancing, batching, morphs and alpha cutout (research/19 C4).
   - One shadowed light per scene.
   - The single directional map is fit to camera-culled caster bounds with no texel snapping.
   - Filtering is a manual nearest-sample compare.
   - CSM cannot be reached from the root (research/19 C5).
   - Point shadows go through an 8-bit CPU readback every frame (research/04 §6.5).
   - There is no public shadow configuration.
5. **Ambient lighting is π× three.js and point lights are crippled.**
   - Ambient has no `1/π`, so the image is dominated by a directionless constant: about 58% of all
     light on the Courier Rush ground (research/04 §3.4).
   - Point lights have a hard-coded 10·scale range and a 1 m² near clamp.
   - Spot `decay` is accepted and ignored.
   - Rect and softbox lights are emitted as spot proxies (research/04 §3).
6. **Reflection and occlusion features are fake parity.**
   - `ReflectionProbe.ts` is never used.
   - Contact shadows are counted from node *names*, and the "pcf-soft" diagnostic is a hard-coded
     string (research/04 §9).
   - SSR runs on tone-mapped 8-bit data with a hard-coded near/far (research/05 §6.2, research/02
     §4).

Measured visual outcome, from the authoritative vision judgments:

- **Same-scene benchmark** (research/23). Aura3D scores 3–3.5 against three r185's 4.5–6 on every
  lighting scene: 09-outdoor 3.5 vs 5.5, 10-indoor 3.5 vs 4.5, 12-shadows 3.5 vs 5.5, 13-ibl-only 3.5
  vs 6, 15-animation-skinning 4.5 vs 5.5, 17-large-environment 3.0 vs 4.5, 18-game-scene 3.5 vs 5.
  06-metal-roughness-sweep scores 4 vs 7 and is labelled "hobby-engine IBL". 11-multiple-lights is the
  one equivalent scene (5 vs 5).
- **Shipped games** (research/21). Shadows scores are 0–2.5 in 17 of 18 games; only Siege Golf reaches
  4.5. ibl_reflections scores are 0–3 in all 18, and lighting scores are 1.5–5.

## 2. Evidence from current code (path:line)

All paths are relative to the repo root. Line numbers are at HEAD `c08d8acb` and were re-read for this
PRD.

| # | Defect | Location | Evidence |
|---|---|---|---|
| E1 | Ambient disables IBL | `packages/engine/src/agent-api/index.ts:12693-12707` | `preset: "authored-ambient"` returns `environmentMapIntensity: 0, environmentMapSpecularIntensity: 0`, with no map and no procedural map. |
| E2 | Environment node silently drops ambient | `index.ts:12638-12692`, `13211-13215` | The environment branch returns first, and the ambient descriptor returns `[]`. |
| E3 | Name-heuristic environment selection, including the teal preset | `index.ts:12708-12722`; `packages/rendering/src/ExternalParityRenderPreset.ts:588-606` | `category === "game" ? "gameplay"`. The gameplay preset uses `specularColor: [0.2, 0.96, 1]` and `horizonColor: [0.1, 0.72, 0.7]`. |
| E4 | Environment sampler is not mipmapped | `ExternalParityRenderPreset.ts:166-172`; `packages/rendering/src/Sampler.ts:27` | `new Sampler({ minFilter: "linear", ... })`, and the `Sampler` default `minFilter` is `"linear"`. WebGL2 reads level 0 only. WebGPU reads mips with nearest-level selection (research/19 C10). |
| E5 | LDR preset environment | `ExternalParityRenderPreset.ts:137-151`; `packages/rendering/src/EnvironmentMapResources.ts:153-172` | The environment is Reinhard-tonemapped and quantized to RGBA8 sRGB before the GGX prefilter. |
| E6 | CPU PMREM average blend | `packages/rendering/src/production-runtime/environment/PMREMGenerator.ts:345-350` | `wideLobeBlend = Math.min(0.82, roughness ** 4 * 0.82)` mixes each texel toward `averageRadiance`. |
| E7 | Diffuse IBL taken from the roughest specular mip | `packages/rendering/src/ShaderLibraryCore.ts:636-638` | `diffuseEnvironmentLod = mipCount - 1`. The SH9 output of `EnvironmentMapResources.ts:543-571` is never bound. |
| E8 | Fake hemisphere and π× ambient | `ShaderLibraryCore.ts:622-623, 634` | `environmentHemi = mix(0.35, 1.0, ...)`, and `ambientEnvironment` feeds `kd*albedo` with no `1/π` (research/18 §2). |
| E9 | Ad-hoc specular fudge | `ShaderLibraryCore.ts:645, 650` | Linear `roughness*(mips-1)` LOD and `* mix(1.1, 0.65, roughness)`. |
| E10 | No environment background on root | `index.ts:13586-13596` (clearColor only); `packages/rendering/src/Renderer.ts:268, 559, 649-656` | `environmentBackground` is never set in `packages/engine/src` (research/19 C9). |
| E11 | Fallback 3-light rig injected even when an HDRI is ready | `index.ts:13156-13165`, `13363-13401` | `createProductionRuntimeFallbackLights()` is called whenever there are no authored direct lights. It is the cause of the stray hotspot and shadows in 13-ibl-only and 14-particles (research/22 §13-14). |
| E12 | Shadow strength 0.24/0.32/0.38 | `index.ts:12966-12968`; shader `ShaderLibraryCore.ts:530` | `mix(1.0, 1.0 - occlusion, strength)`. GameRenderPreset hard-codes 0.38 (`packages/engine/src/production-runtime/GameRenderPreset.ts:344-347`). |
| E13 | Shadow map size taken from all node positions | `index.ts:12949-12960` | Parked FX nodes at y=-50…-70 push the map to 4096 (research/18 C2). |
| E14 | Bias heuristic in mismatched units, no normal bias | `index.ts:12986-13001` | Directional/point: `clamp(texelWorld*0.55, 0.00035, 0.004)` (a world-unit value used as normalized depth). 0.004 is about 0.24 m on a 60 m fit. Spot has a separate branch, `clamp(0.15/size, 0.00005, 0.00035)` plus `slopeBias 0.12`. Neither has a normal bias. |
| E15 | One caster per scene, implicit caster selection | `index.ts:13172-13199`, `13241-13245` | Priority directional 3 > spot 2 > point 1. Point lights are implicit casters (the stray shadow in 11-multiple-lights), yet the point descriptor hard-codes `shadowRequested: false` (`index.ts:13245`), so an author cannot *request* a point shadow either. |
| E16 | Point range hard-coded, decay ignored | `index.ts:13241` (`range: 10 * scale`), `13264` (spot `distance ?? 12`, no decay field) | `lights.point` exposes no `distance` or `decay` (`index.ts:3084-3092`). |
| E17 | Rect and softbox lights become spot proxies | `index.ts:13274-13296` | The `kind: "spot"` proxy means the area integrator at `ShaderChunks.ts:165-195` never runs on root. |
| E18 | Falloff near clamp of 1 m² | `ShaderLibraryCore.ts:733-735` | `rangeFalloff / max(d*d, 1.0)`. three uses `max(pow(d, decay), 0.01)`. |
| E19 | Depth pass is position-only | `packages/rendering/src/DepthPass.ts:15-27, 59-87`; shader `ShaderLibraryCore.ts:784-805` | It reads only `a_position` and one MVP, with no skin, morph, instance or discard. |
| E20 | Manual nearest-sample PCF, no hardware compare | `ShaderLibraryCore.ts:494-531`; `packages/rendering/src/ShadowPass.ts:142` | `texture(u_shadowMapTexture, uv+offset).r` against `receiverDepth` with a `nearest` sampler. `sampler2DShadow` and `TEXTURE_COMPARE_MODE` are absent from `rendering/src`. |
| E21 | Directional fit is camera-culled with no snapping | `Renderer.ts:1964-1986`, `623-625`; culling `2208-2209` | Casters that go off-screen vanish, and the fit box moves with the camera, which causes shimmer. |
| E22 | CSM unreachable, per-item cascade selection | `Renderer.ts:1387-1399`; `packages/rendering/src/ForwardPass.ts:834-854` | CSM requires `instanceof PerspectiveCamera` plus `cascadeCount>1`. The root passes `{viewProjectionMatrix}` and no `cascadeCount`. |
| E23 | Point shadows via CPU 8-bit readback | `Renderer.ts:1516-1603`, `1915-1931` | `readShadowFacePixels`, `Math.round(depth*255)`, re-upload every frame. |
| E24 | Spot shadow compiled out of 3 textured variants | `packages/rendering/src/ShaderLibrary.ts:2067, 2073, 2075` (guards at `2221, 2562, 3196`) | `A3D_PBR_NO_SPOT_SHADOW: true` on the clearcoat+sheen+anisotropy, clearcoat+transmission+volume and specular+sheen+anisotropy+iridescence variants. |
| E25 | Blob discs marketed as contact shadows | `index.ts:2366-2385` (`shadows.contact` = translucent cylinder), `4485-4487` (name counting) | Diagnostics infer "contact occlusion" from names that contain "footprint". |
| E26 | Hard-coded filter diagnostic | `index.ts:1829`, `4614` | `mapType: "pcf-soft"`. |
| E27 | `receiveShadow` stored but never read | `index.ts:1239, 1264, 1490, 1521`; no read in `ForwardPass.ts` or `Renderer.ts` | research/06 row 26. |
| E28 | `ReflectionProbe` unused, no prefilter | `packages/rendering/src/ReflectionProbe.ts` | No consumer in `agent-api` or apps (research/04 §5.7). |
| E29 | SSR on LDR with hard-coded depth range | `packages/rendering/src/WebGL2Device.ts:847-865, 3131-3208` | `{ near: 0.1, far: 1000 }` and a post-tonemap RGBA8 chain (research/05 §6.2). |
| E30 | HDRI prefilter on the main thread, 128 px cube | `packages/rendering/src/production-runtime/PBRHDRPipeline.ts:149-173` | 9-level equirect GGX plus a 128² cube with 32 samples, run synchronously at mount. |
| E31 | Instanced transforms omit `node.size` (affects shadows and lighting extents) | `index.ts:14747-14753`, `13976`; `ShaderLibraryCore.ts:258-261` | Confirmed engine bug (research/22 §16): instance translations are scaled by `size`. |
| E32 | Agents are taught the trap | `index.ts:18256`; `packages/create-aura3d/skills/*/SKILL.md` (`aura3d-browser-game`, `aura3d-core` teach `lights.studio()`) | The lint suggests `lights.ambient()`, and no skill warns that it kills IBL (research/04 §8). |
| E33 | No device counters for the "no stall" rules | `packages/rendering/src/RenderDevice.ts` (`RenderDeviceDiagnostics`) | There is no program-compile counter and no `readPixels` counter anywhere in `rendering/src`, so the compile-after-mount and no-readback rules in sections 14 and 17 cannot be measured today. |
| E34 | Two existing shadow modules not covered by the rewrite | `packages/rendering/src/shadows/ContactShadows.ts`, `shadows/SpotShadowMaps.ts` (consumed by `ForwardPass.ts`, `EnvironmentPlatform.ts`, `shadows/ShadowDebugViews.ts`) | `ContactShadows.ts` is an ExternalParity "layered-receiver-geometry" plan (blob layers, not a screen-space pass). `SpotShadowMaps.ts` is the current per-spot map path. Both have to be deleted or folded in, or they become a second shadow path. |
| E35 | Fragment uniform pressure | `ShaderLibraryCore.ts:704-713`, `LightUniforms.ts:4` | Lights already use `u_lightData[16*6]` = 96 vec4 on the uniform path. WebGL2 guarantees only `MAX_FRAGMENT_UNIFORM_VECTORS >= 224`, and common Mali/Adreno parts report 256-1024. Section 8 adds 32-light data (192 vec4), 64 local-shadow vec4, 4 cascade matrices (16 vec4) and SH (7 vec4). That does not fit in plain uniforms on minimum-spec devices; see the uniform-block and texture-unit budget in 6.10. |
| E36 | Texture-unit pressure | `ShaderLibrary.ts` (74 `uniform sampler*` declarations across programs) | WebGL2 guarantees only `MAX_TEXTURE_IMAGE_UNITS >= 16`. A fully featured textured PBR variant already binds material maps, the env map, the BRDF LUT and the cluster textures. This PRD adds cascade, atlas, contact mask, probe and irradiance-volume samplers, so a per-tier sampler budget is mandatory (6.10). |

Benchmark evidence (`docs/project/aura3d-quality-rebuild/evidence/benchmark/<scene>-side-by-side.jpg`,
`report.json`) ties the defects to pixels:

- **15-animation-skinning.** Aura shadows are about 9% darker than lit ground; three's are about 50%.
  Footprints are bind-pose (E12, E19; research/22 §15).
- **12-shadows.** The spot shadow set is absent because of the single slot (E15). Primary shadows are
  washed out (E12; research/23 §12).
- **13-ibl-only.** No sky (E10), an injected rig (E11), flat diffuse (E6, E7), and wrong roughness on
  gold (research/23 §13).
- **06-metal-roughness-sweep.** Blotchy mid-roughness, a dead roughness-1 sphere and a rim that
  persists at r=1 (E6, E7, E9; research/23 §06).
- **17-large-environment.** Half the edge density of three. The single 4096 map is fit over 90 m, at
  city-day strength 0.38 (E12, E21, E22; research/22 §17).

## 3. Root cause

1. **Composition rules, not math.** Lighting terms are *mutually exclusive* where they should be
   additive. An ambient light replaces the environment (E1), an environment replaces ambient (E2), and
   "no lights" injects a rig on top of a ready HDRI (E11). There is no single lighting contract that
   says how ambient, hemisphere, IBL diffuse, IBL specular, probes and punctual lights add.
2. **Defaults tuned to pass parity checks, not to look right.** Category-by-node-name heuristics pick
   environment presets, shadow strength and exposure (E3, E12, E13). Constants such as 0.32, 0.82,
   `mix(1.1, 0.65)` and `10*scale` were tuned until some evidence JSON passed. No default was judged
   against a reference frame (research/14, 15).
3. **Resource data cannot represent HDR or roughness.** LDR 8-bit environment source (E5), a
   non-mipmapped sampler default (E4), CPU prefilter shortcuts (E6, E30), and SH computed but unbound
   (E7).
4. **The shadow subsystem was built for one static mesh and one light.** It has one depth shader (E19),
   one slot (E15), one fit (E21), and manual compare (E20). Its cascade utilities exist but are wired
   per item (E22), and point shadows were made to "work" through readback (E23).
5. **Fake parity hides all of this.** Diagnostics report "pcf-soft", "contact shadows", "sh9-cosine"
   and `iblPixelBacked` from labels, names or allocation counts rather than from pixels (E25, E26;
   research/04 §9).
6. **Agents reach for the trap.** The engine lint and skills teach `lights.ambient()` and
   `lights.studio()`, and no skill teaches environment plus sun (E32).

## 4. Affected packages

| Package | Change class |
|---|---|
| `@aura3d/rendering` (`packages/rendering`) | Major: GPU PMREM, environment probe resource, shader IBL/lighting rewrite, shadow subsystem rewrite, background pass wiring, reflection/light probes, contact-shadow pass, SSR inputs |
| `@aura3d/engine` (`packages/engine`) | Major: agent-api light/environment/shadow/probe APIs, production bridge environment resolution, caster selection, diagnostics, fallback-rig removal, migration flag |
| `@aura3d/environments` (`packages/environments`) | Medium: preset registry backed by real HDRIs, `PMREMPreset.ts` / `HDRIEnvironment.ts` rewired to the GPU PMREM |
| `@aura3d/assets` (`packages/assets`) | Small: KTX2 HDR cube upload path for prebaked presets, which shares the transcoder fix with PRD 04/05 |
| `@aura3d/three-compat` (`packages/three-compat`) | Small: light-unit mapping and approximation-ledger rows updated |
| `aura3d-cli` / `create-aura3d` skills | Medium: skills and lint text, the `environments bake` verb (with PRD 05), the `migrate lighting` codemod |
| `@aura3d/lean` (`packages/lean`) | Decision only: lean intents stay inert until PRD 15 decides the lean fate. No lighting work lands here |

## 5. Affected files/directories

Rendering (`packages/rendering/src/`):

- New:
  - `environment/GPUPMREMGenerator.ts`
  - `environment/EnvironmentProbe.ts`
  - `environment/SphericalHarmonics.ts`
  - `environment/RoomEnvironmentScene.ts`
  - `environment/EnvironmentCache.ts`
  - `shadows/ShadowSystem.ts`
  - `shadows/ShadowAtlas.ts`
  - `shadows/DirectionalCascadeFitter.ts`
  - `shadows/ShadowCasterVariants.ts`
  - `shadows/ShadowFilterKernels.ts`
  - `passes/ContactShadowPass.ts`
  - `probes/ReflectionProbeSystem.ts`
  - `probes/IrradianceVolume.ts`
  - `shaders/chunks/lighting_ibl.glsl.ts`
  - `shaders/chunks/lighting_punctual.glsl.ts`
  - `shaders/chunks/shadow_receive.glsl.ts`
  - `shaders/chunks/shadow_caster.glsl.ts`
  - `shaders/chunks/sh9.glsl.ts`
  - `shaders/chunks/contact_shadow.glsl.ts`
- Modified:
  - `ShaderLibraryCore.ts`: lean PBR main 594-779, shadow factors 494-581, depth shader 784-805,
    background shader 808-889.
  - `ShaderLibrary.ts`: textured, skinned, instanced and normal-mapped variants share the new chunks.
    Remove `A3D_PBR_NO_SPOT_SHADOW`.
  - `ShaderChunks.ts`: ambient/IBL helpers 205-245, rect integrator 165-195.
  - `DepthPass.ts`, `ShadowPass.ts`, `ShadowMap.ts`, `CascadedShadowMaps.ts`,
    `shadows/CascadedShadowPipeline.ts`, `shadows/CascadeHysteresis.ts`.
  - `Renderer.ts`: shadow orchestration 1354-1603, fit 1964-1986, caster list 623-625, background
    649-656.
  - `ForwardPass.ts`: delete `selectForwardShadowMap` 834-854; uniform binding for probes, SH and
    shadow arrays.
  - `LightUniforms.ts`.
  - `Sampler.ts`: the default min filter becomes mip-aware.
  - `EnvironmentBackgroundPass.ts`.
  - `WebGL2Device.ts`: depth compare samplers, `sampler2DArrayShadow`, RGBA16F cube render targets,
    SSR depth range 847-865.
  - `WebGPUDevice.ts`: comparison samplers and `depth32float`, gated on PRD 11.
  - `ReflectionProbe.ts`: replaced by `probes/ReflectionProbeSystem.ts`.
  - `RenderDevice.ts` / `WebGL2Device.ts` / `LeanWebGL2Device.ts`: add `programCompileCount` and
    `readPixelsCalls` to `RenderDeviceDiagnostics` (E33). Both are monotonic counters incremented at
    `linkProgram` and `readPixels` call sites.
  - `shadows/SpotShadowMaps.ts`: folded into `ShadowAtlas` spot tiles, then deleted (E34).
  - `shadows/ContactShadows.ts` and its `ShadowDebugViews.ts` / `EnvironmentPlatform.ts` consumers:
    the ExternalParity layered-receiver plan is deleted. Screen-space contact shadows live only in
    `passes/ContactShadowPass.ts` (E34).
  - `production-runtime/PBRHDRPipeline.ts`, `production-runtime/environment/PMREMGenerator.ts`
    (deleted after migration), `production-runtime/environment/HDRLoader.ts`.
- Deleted:
  - The `gameplay` / `evening` / `daylight` / `inspection` / `exhibit` / `softbox` procedural presets in
    `ExternalParityRenderPreset.ts:133-255, 560-700`, as defaults.
  - `shaders/pbr-direct.frag.glsl`: dead file, shared with PRD 01.
  - The CPU point-shadow atlas path.

Engine (`packages/engine/src/`):

- `agent-api/index.ts`:
  - Lights 3063-3156 and environments 4123-4190.
  - `shadows` 2366-2385.
  - Environment resolution 12628-12723.
  - Shadow options 12942-13001.
  - Light descriptors 13130-13401.
  - Renderer input 13586-13650 and 13990-14006.
  - HDRI upgrade 14190-14245.
  - Instancing 14747-14753.
  - Diagnostics 1829, 4485-4487, 4614.
  - Lint 18256.
- `production-runtime/GameRenderPreset.ts:344-347, 420-434`
- `agent-api/RootRuntimeSupport.ts:64-88`: tier wiring.

Environments: `packages/environments/src/{EnvironmentRegistry.ts,HDRIEnvironment.ts,PMREMPreset.ts}`.

Assets: `public/aura-environments/` (new, served through the asset manifest). Source HDRIs stay under
`fixtures/environment-corpus/hdri/`.

Skills: `packages/create-aura3d/skills/{aura3d-core,aura3d-browser-game,aura3d-materials-environments,
aura3d-threejs-migration,aura3d-scene-authoring}/SKILL.md` and the mirrored
`packages/aura3d-cli/skills/*`.

Tests:

- New unit tests under `tests/unit/rendering/`: `gpu-pmrem.test.ts`, `sh9-projection.test.ts`,
  `shadow-caster-variants.test.ts`, `cascade-fitter.test.ts`, `shadow-atlas.test.ts`,
  `light-units.test.ts`, `lighting-composition.test.ts`.
- New browser specs under `tests/browser/`: `lighting-quality-*.spec.ts`.
- Existing specs updated: `createAuraApp-shadow-contract.spec.ts`, `environment-background.spec.ts`,
  `production-runtime-hdr-ibl.spec.ts`, `external-parity-shadow-*.spec.ts`.

CI: `.github/workflows/quality-rebuild-capture.yml` (benchmark and game jobs) plus a new
`.github/workflows/lighting-quality.yml`, both on macos-14.

---

## 6. Architecture proposal

### 6.0 Renderer-decision independence

research/18 Q3 is still open: does Aura keep its own renderer, or build on three r185
`WebGPURenderer`? PRD 01 and PRD 11 decide. This PRD is written so that the **public API (section 7),
the lighting contract (6.1), the defaults (6.2) and the acceptance tests (sections 15-16) are identical
under either outcome**:

- **Track R (own renderer):** implement sections 8-9 in `packages/rendering`.
- **Track T (three-backed):** map the section 7 API onto `PMREMGenerator`, `scene.environment`,
  `scene.background`, `LightShadow`, `CSM`, `PointLight.decay/distance`, `RectAreaLight` and
  `LightProbe`. Tasks marked **[R]** in section 14 are then replaced by mapping tasks. Tasks marked
  **[R/T]** apply to both tracks.

Under either track, the deletions in section 10 and the agent-api changes are mandatory.

### 6.1 The lighting contract (single source of truth)

All lighting terms are **additive in linear HDR radiance**, and nothing disables anything else. Per
fragment:

```
Lo = Σ_direct  [ BRDF(n,v,l) · E_l · V_l ]                      // punctual + area lights
   + kd · albedo/π · ( E_SH(n) · I_diff · ao_d                    // environment diffuse (SH9)
                     + E_probe(n) )                               // irradiance volume (replaces E_SH where present)
   + kd · albedo/π · ( E_amb + E_hemi(n) ) · ao_d                 // ambient + hemisphere (three-compatible)
   + Fss·DFG · L_spec(R', r) · I_spec · SO(ao, NoV, r) · H(R', Ng) // env / reflection-probe / SSR specular
   + emissive
```

The terms are:

- `E_l = color · intensity · attenuation(d, decay, distance) · cone`, with the three r185 units in 6.3.
- `V_l` is the shadow visibility: `mix(1, shadowFactor · contactFactor, shadow.intensity)`, where
  `shadow.intensity` defaults to **1.0**.
- `E_SH` is the cosine-convolved SH9 irradiance from the active environment probe.
- `L_spec` is a prefiltered cube sampled at `roughnessToLod(r)`. Its source is, in priority order: SSR
  hit (High and Ultra only), box-projected reflection probe (blend of up to 2), then the global
  environment.
- `R'` is the reflection vector bent toward `n` by `r⁴`, as in three.
- `SO` is Lagarde specular occlusion from material AO and GTAO (PRD 03).
- `H` is horizon occlusion against the geometric normal.
- `DFG` comes from the PRD 04 DFG/multiscatter LUT.
- `ao_d` applies AO to **indirect diffuse only**. AO is never applied to direct light; the red-gated
  `directTextureOcclusion` is removed by PRD 04.

There is always an environment. If the author provides none, the **neutral room** environment (6.2)
is used. `environments.none()` is the only way to get zero IBL, and it is meant for deliberately
unlit or stylized scenes.

### 6.2 Environment system

```
EnvironmentSource ──► EnvironmentCache (key: url|preset, tier) ──► GPUPMREMGenerator ──► EnvironmentProbe
  .hdr (RGBE)                                                       equirect→cube         { specularCube RGBA16F,
  .ktx2 prebaked cube (RGB9E5/RGBA16F, mips)  ──(skip PMREM)──────────────────────────────►  mipCount, faceSize,
  generated neutral room (RoomEnvironmentScene)                     GGX FIS per mip        sh9 (27 floats),
  scene capture (sky systems, reflection probes)                    SH9 projection         intensity, rotation,
                                                                                            backgroundSource }
```

**Default: neutral room.** `RoomEnvironmentScene.ts` is a code-generated port of three's
`RoomEnvironment`: a box room, 6 emissive panels and props as boxes. The panel radiances are copied
verbatim from `node_modules/three/examples/jsm/environments/RoomEnvironment.js:106-136`
(50, 50, 17, 43, 20, 100). It
is rendered into a cube on the GPU at load and PMREM'd. It needs no network fetch and costs roughly
3 KB gz of code. It lights scenes but **is not drawn as background**; `scene().background(color)` keeps
working.

**Preset library: real HDRIs.** `environments.preset(name)` takes one of
`"studio" | "outdoor" | "sunset" | "night" | "indoor"`. Each preset is a CC0 HDRI admitted through the
PRD 05 pipeline, with source in `fixtures/environment-corpus/hdri/`. Candidates:

| Preset | Source HDRI | Status |
|---|---|---|
| studio | `studio_small_08_1k.hdr` | already in the repo |
| outdoor | `autumn_field_puresky_1k.hdr` | already in the repo |
| sunset | to be admitted (2k CC0) | candidate |
| night | to be admitted (2k CC0) | candidate |
| indoor | to be admitted (2k CC0) | candidate |

Kloppenheim 06 is already in the repo and is the fallback candidate for sunset. Each preset is
**prebaked offline** by `aura3d environments bake` (PRD 05) into:

- `<preset>.<tier>.ktx2`: a cube with prefiltered mips at RGB9E5_UFLOAT, Zstd-supercompressed. Face
  size is 128 for Low, 256 for Medium and High, and 512 for Ultra.
- `<preset>.sh9.json`: 27 floats.
- `<preset>.bg.ktx2`: a 2k equirect background for High and Ultra. Lower tiers use the cube's mip 0.

Prebaking removes runtime PMREM cost and JS prefilter hitches on mobile (E30). Runtime GPU PMREM is
used for user HDRIs (`environments.hdri`) and for captures.

**GPU PMREM.** It uses Filament-style filtered importance sampling into a real mipped cube, because
that maps to one draw per face per mip and to hardware trilinear sampling. This is **not** what three
r185 does, so "matches three" must be tested, not assumed. Three r185 (`src/extras/PMREMGenerator.js`)
uses GGX VNDF importance sampling (Heitz 2018, `GGX_SAMPLES = 256`) applied *incrementally* from the
previous LOD (`_applyGGXFilter`, lines 498-543). It writes into a packed cube-UV atlas with
`LOD_MIN = 4` (16 px) plus extra 16 px levels, and it maps roughness to mip with the piecewise-linear
`roughnessToMip` in `cube_uv_reflection_fragment.glsl.js:132-150`, not with `r·(2−r)`. The Phase 2
parity task in section 14 compares the two outputs at fixed roughness values:

1. **Equirect to cube.** Render the cube at face size `F = clamp(nextPow2(width/4), 128, tierMax)`,
   in RGBA16F, then call `generateMipmap`.
2. **Prefilter.** For each mip `m ∈ [0, N)`, where `N = log2(F) - log2(16) + 1` (the roughest level
   stays at **16 px**, matching three `LOD_MIN = 4`):
   - Set `r_m = lodToRoughness(m, N)`, the inverse of `lod = (N-1)·r·(2-r)`.
   - Run a GGX importance-sampled fragment pass with `S` samples (16/32/64 by tier).
   - Choose the source LOD per sample from the PDF (Křivánek & Colbert):
     `lodS = 0.5·log2(Ωs/Ωp) + 1`.
   - Mip 0 is copied unfiltered.
3. **SH9 projection.** Reduce the 16 px level of the source cube (pre-prefilter), weighted by solid
   angle, into a 9×1 RGBA16F texture over 2 reduction passes, entirely on the GPU with no readback.
   Then apply the Ramamoorthi–Hanrahan cosine-lobe constants (π, 2π/3, π/4).
4. **Cache.** Results are cached by `(url, tier)`. Computation is time-boxed. If generation exceeds the
   frame budget, the previous probe (or the neutral room) stays bound until the new one completes,
   which is never a black frame.

**Background.** `EnvironmentBackgroundPass` is wired by the root bridge whenever the active environment
has `background !== false`. It samples:

- the background equirect when one exists and `blurriness == 0`;
- otherwise the specular cube at `lod = roughnessToLod(blurriness)`.

Output is linear HDR into the RGBA16F scene target before tone mapping, so it is tone-mapped like the
scene; this fixes the asymmetry noted in research/22 §18. Fog does not apply to the background unless
`fog.affectsBackground: true`.

**Deleted:** the ExternalParity procedural preset bundles as defaults (including `gameplay`'s teal),
category-by-name environment selection, the HDRI first-frame "studio procedural" fallback (replaced by
neutral room), the CPU `PMREMGenerator.ts` average blend, the RGBA8 Reinhard environment encoding, and
the `*1.1` HDRI specular gain (`PBRHDRPipeline.ts:287, 429`).

### 6.3 Light units and punctual lights (three r185-compatible)

| Light | Intensity unit | Falloff | Default (new) | Default (old) |
|---|---|---|---|---|
| `ambient` | irradiance multiplier: contributes `color·intensity·albedo/π` | none | 0.3 (fill only; IBL is primary) | 0.28, with π× energy and IBL killed |
| `hemisphere` (new) | irradiance: `mix(ground, sky, dot(n, dir)·0.5+0.5)·intensity`, where `dir` is the normalized light position (default `+Y`), as in three `getHemisphereLightIrradiance` (`lights_pars_begin.glsl.js:202-210`) | none | sky `#bcd7ff`, ground `#4a4036`, 0 (opt-in) | fake 0.35–1.0 factor |
| `directional` | illuminance, in three's scale | none | 3 (inside the 2–4 range the benchmark specs use, `benchmarks/quality-rebuild/shared/scenes.ts:110, 125, 178, 190`) | 1.5 |
| `point` | luminous intensity (cd), or `power` in lm (`cd = lm/4π`) | `1/max(d^decay, 0.01) · window(d/distance)`; `distance = 0` means infinite | 8 cd, decay 2, distance 0 | 2, range 10·scale, clamp 1 m² |
| `spot` | cd, or `power` (`cd = lm/π`, as in three) | same as point, times the cone | 30 cd, decay 2, distance 0 | 8, distance 12, decay ignored |
| `rect` / `softbox` | luminance (nits) | LTC (Ultra/High) or 4-tap Gauss–Legendre integrator (Low/Medium) | 1.4 / 1.75 nits·scale | emitted as a spot proxy |

Additional rules:

- The window keeps the Frostbite form `saturate(1 - (d/distance)^4)^2` **only when `distance > 0`**.
- In the light loop, a light is range-culled before BRDF evaluation when `distance > 0` and the fragment
  is beyond `distance`.
- The 16-light cap is lifted to 32, but **not** with plain uniforms (E35). Light data moves to a
  std140 uniform block `A3DLights` (32 × 6 vec4 = 3 KB, inside WebGL2's guaranteed 16 KB
  `MAX_UNIFORM_BLOCK_SIZE`). The plain `u_lightData` array stays only for `legacy-3.0`. Clustering is
  the only path above 32,
  and PRD 04 removes `A3D_PBR_DISABLE_CLUSTERED_LIGHTING` from all variants. A froxel/GPU cluster
  rewrite is out of scope here (PRD 11).

### 6.4 Shadow system

```
ShadowSystem.update(frame)
  ├─ selectShadowedLights(lights, tier.maxShadowedLights)        // explicit shadow:true first, then autoSun
  ├─ for directional (≤1):  DirectionalCascadeFitter → C cascades → sampler2DArrayShadow (DEPTH24/32F, layers=C)
  ├─ for spot/point:        ShadowAtlas.allocate(tileSize by screen coverage) → spot: 1 tile; point: 6 tiles
  ├─ per cascade / tile:    cullCasters(allSceneItems, lightFrustum)  // NOT the camera-culled list
  │                         draw with ShadowCasterVariants[key(item)]
  └─ publish ShadowFrameUniforms { cascadeMatrices[4], splits, texelWorldSize[4], atlas tile rects/matrices }
```

**Caster selection.**

- `shadow: true` on any light requests a shadow.
- `lighting.autoSunShadow` defaults to `true`. It promotes the brightest directional light to a caster
  when no directional has an explicit `shadow` setting. This keeps game grounding for agents.
- Point, spot and rect lights **never** cast implicitly (fixes E15 and the 11-multiple-lights stray
  shadow).
- Lights beyond `tier.maxShadowedLights` drop their shadow by screen-space importance and emit a
  diagnostic warning that names them.

**Depth/caster variants** (`ShadowCasterVariants.ts`). The variant key is:

```ts
{ skinning: 0|4|8, skinningTexture: boolean, morphTargets: 0..8, instanced: boolean, batched: boolean,
  alphaTest: boolean, alphaHash: boolean, doubleSided: boolean }
```

Variants are compiled lazily and cached per device. Precompile is issued at mount for the keys present
in the scene, using `KHR_parallel_shader_compile` when available. Vertex stages reuse the forward
skinning, morph and instancing chunks verbatim, so the shadow pose equals the drawn pose.

- `alphaTest` samples base-color alpha times the factor and discards below `alphaCutoff`.
- `alphaHash` is a stochastic discard. It is used for blended materials that opt in with
  `castShadow: true`. Blended materials do not cast by default.
- Static batches draw N instances with their instance matrices (fixes E19 and research/19 C4 (c)(d)).

**Directional cascades** (`DirectionalCascadeFitter.ts`):

- Splits are practical, with `lambda = 0.75` by default and `maxDistance = min(camera.far, 150 m)` by
  default.
- Each cascade fits a **bounding sphere** to its frustum slice, which makes the fit rotation-invariant
  and avoids shimmer on camera rotation.
- The ortho projection is **snapped to the texel grid in light space**: the origin is rounded to
  `2·radius/mapSize`. This reuses the `computeStableCameraFits` snapping already in
  `CascadedShadowMaps.ts:198-201`.
- The near plane is extended back to the scene caster AABB along the light direction, so off-frustum
  casters still cast (pancaking).
- Cascade count is `"auto"`: 1 when the scene radius is ≤ 15 m, otherwise the tier value.
- **Per-fragment cascade selection** uses view depth against the split vector, with a 10% blend band.
  `selectForwardShadowMap` (`ForwardPass.ts:834-854`) is deleted.
- `fit: { center, extent }` gives a fixed box (three's manual `shadow.camera`) for bounded arenas, with
  no per-frame refit.

**Local light atlas** (`ShadowAtlas.ts`):

- A single depth atlas, sized per tier.
- Spot lights get one perspective tile with `fov = 2·angle` and `far = distance || computed`, where the
  computed far is where the intensity falls below 1/256.
- Point lights get 6 tiles on a cube-face layout with 1-texel guard borders. The shader selects the
  face and samples the tile. No readback, no 8-bit quantization (fixes E23). Three r185 instead
  renders a depth cube and samples it with `samplerCubeShadow` (`shadowmap_pars_fragment.glsl.js:265`),
  which has no seams but costs one sampler unit per point light. The atlas is chosen because of the
  16-unit budget (6.10). The seam test in section 14 is the guard for that trade-off. If the seam test
  cannot be met, the fallback is one `samplerCubeShadow` shared by at most 1 point light per draw, and
  the High tier `≤1 point` limit already allows it.
- Tile size is `clamp(nextPow2(screenCoverage · atlasSize/2), 256, 2048)`, re-allocated at most once
  per 30 frames to avoid popping.

**Filtering** (`ShadowFilterKernels.ts`). All tiers use a hardware compare sampler
(`TEXTURE_COMPARE_MODE = COMPARE_REF_TO_TEXTURE`, `LINEAR` filter, which gives 2×2 bilinear PCF per
tap).

| Tier | Kernel |
|---|---|
| Low | 1 tap (4-sample bilinear) |
| Medium | Castaño optimized 5×5 PCF (9 compare taps) |
| High | 16-tap Vogel disk rotated by interleaved gradient noise. Penumbra radius in world units = `softness`, default 1.5 texels |
| Ultra (opt-in `filter: "pcss"`) | PCSS: blocker search with 16 taps through a non-compare sampler bound to a second unit, then a variable Vogel filter (32 taps) scaled by `lightSize·(dReceiver − dBlocker)/dBlocker` |

The VSM option is dropped because of light-bleed risk on game content.

Three r185 reference: `PCFShadowMap` uses `sampler2DShadow` with a `LinearFilter` compare and 5
Vogel-disk taps rotated by interleaved gradient noise (`shadowmap_pars_fragment.glsl.js:94-147`), and
`PCFSoftShadowMap` is deprecated to it (`WebGLShadowMap.js:99-101`). The Medium/High kernels here
are therefore at least as wide as three's default. The three-side benchmark renders use three's
default `PCFShadowMap`, so penumbra-width comparisons in 16.3 are against that kernel.

**Bias.**

- The constant `bias` defaults to 0 (auto).
- `normalBias` is in **world units**. It defaults to `1.5 × texelWorldSize[cascade]`, and the receiver
  is offset along the geometric normal by `normalBias·(1 − NoL)`.
- The existing per-tap `tan θ` slope term is kept (research/04 §11).
- Bias heuristics derived from `sceneRadius` are deleted (E14). Map size comes from the tier, not from
  node positions (E13).

**Strength.** `shadow.intensity` defaults to 1.0, and so does the renderer default. 0.32, 0.24, 0.38
and 0.65 are deleted (E12, `ForwardPass.ts:913`, `GameRenderPreset.ts:346`).

**Receivers.** `receiveShadow: false` binds `shadowEnabled = 0` for that item, because the node field
is now read (E27).

### 6.5 Contact shadows

`ContactShadowPass` produces an R8 screen-space visibility mask after the depth prepass (PRD 01). For
each pixel it ray-marches up to 16 steps along the primary shadowed light's direction in view space,
over `length` (default 0.25 m), against linear depth with a `thickness` (default 0.05 m) test and
interleaved gradient noise jitter. It is applied **inside `V_l` of that light only** (6.1), never to
total colour.

Tier availability: Low off, Medium for the sun only, High and Ultra for the sun plus up to 2 spot
lights.

`shadows.contact()` blob discs are renamed `decals.blobShadow()`; `shadows.contact` stays as a
deprecated alias for one minor release. Diagnostics stop counting names as contact shadows (E25).

### 6.6 Reflection probes and light probes

- **Reflection probes** (`probes.reflection`):
  - A capture renders 6 HDR faces at the probe position. Shadows and the environment are on; the probe's
    own contribution is excluded. The capture is then PMREM'd on the GPU.
  - Update modes: `once` (default), `on-demand` via `app.lighting.updateProbe(name)`, or
    `every-n-frames`, time-sliced at 1 face per frame.
  - The shader box-projects `R'` against the probe box using the existing `a3dPbrBoxProjectedDirection`
    (`ShaderLibraryCore.ts:481-493`).
  - Each item selects its 2 nearest overlapping probes on the CPU, once per item per frame, weighted by
    box distance with `blendDistance`. Weights feed a per-draw uniform, and the global environment fills
    the remainder.
  - Probes are stored in a cube array texture when available (WebGPU). On WebGL2, which has no cube
    arrays, at most 2 probe cubes are bound per draw (8.2). More probes may be resident, but only the 2
    selected per item are bound.
- **Irradiance volume** (`probes.irradianceVolume`):
  - A grid of **SH L1** probes (4 coefficients × RGB = 12 floats per cell). Each probe is captured at
    32 px, SH-projected on the GPU, and stored in three RGBA16F 3D textures, one per colour channel,
    each texel holding `(L0, L1₋₁, L1₀, L1₁)`. L2 (27 floats) would need 7 RGBA textures per volume,
    which the 16-unit budget (6.10) cannot afford. The global environment keeps full SH9.
  - Sampling is trilinear. Leak reduction is a normal offset of 0.5·cell plus a simple visibility
    weight.
  - Inside the volume, `E_probe` replaces `E_SH`, with a smooth fade at the bounds. Baking is
    `once` or `on-demand`.
  - This is the first real GI-adjacent feature. Real GI (lightmaps, DDGI) is out of scope.
- `ReflectionProbe.ts` is replaced; its capture code is reused.

### 6.7 SSR in HDR

The SSR pass is owned by the PRD 03 HDR post chain. This PRD specifies its lighting integration:

- It runs before tone mapping on the RGBA16F scene colour of the **previous frame**, reprojected.
- It uses the real camera near and far (fixes E29).
- Rays are marched in view space against hierarchical depth when PRD 01 provides Hi-Z, and otherwise
  with linear steps plus binary refinement.
- It is roughness-aware: hit colour is fetched from a colour mip pyramid at `lod = roughnessToLod(r)`,
  and rays are skipped when `r > roughnessCutoff` (0.5).
- The result is composited as a *replacement* for `L_spec`, weighted by hit confidence (edge fade, ray
  length and thickness), so probe/environment specular fills misses. It is multiplied by `SO` and the
  `DFG` term, never added on top of environment specular.
- Availability: High and Ultra only.

### 6.8 Quality tiers (defaults; `lighting.quality: "auto"` picks from PRD 11 device tiering)

| Feature | Low (mobile / iGPU) | Medium | High (M1/3060-class) | Ultra |
|---|---|---|---|---|
| Env cube face / PMREM samples | 128 prebaked / 16 | 256 / 32 | 256 / 32 | 512 / 64 |
| Background | cube mip 0 | cube mip 0 | 2k equirect | 2k equirect |
| Diffuse | SH9 | SH9 | SH9 + irradiance volume | SH9 + irradiance volume |
| Sun cascades × size | 1 × 1024 (fit or auto) | 2 × 1536 | 3 × 2048 | 4 × 2048 |
| Local shadow atlas | none | 2048² (≤2 spot) | 4096×2048 (≤4 local, ≤1 point) | 4096² (≤8 local, ≤2 point) |
| Filter | HW 1-tap | Castaño 5×5 | Vogel 16 | Vogel 16 / PCSS opt-in |
| Contact shadows | off | sun | sun + 2 spot | sun + 2 spot |
| Reflection probes | global env only | ≤2, `once` | ≤4, `once`/`on-demand` | ≤4, `every-n-frames` allowed |
| SSR | off | off | on (half-res) | on (full-res) |
| Area lights | Gauss–Legendre 4-tap | Gauss–Legendre | LTC | LTC |

### 6.9 Cost cards for the major recommendations

The GPU figures are **estimates at 1920×1080 on a High-class GPU**. They must be replaced by
measurements in Phase 7 (see section 17 for the per-tier budgets).

| # | Recommendation | Visual benefit | GPU cost | CPU cost | Memory | Bundle (gz) | Mobile impact | Fallback |
|---|---|---|---|---|---|---|---|---|
| R1 | Ambient additive to IBL; delete `authored-ambient`; ambient `/π` | Restores reflections and Fresnel in 15/18 games. Removes the flat wash (58% → under 15% of ground light) | ≈0 (removes a branch) | 0 | 0 | −0.3 KB | None | `lighting.model: "legacy-3.0"` for one minor |
| R2 | Default neutral-room environment (GPU) | Every scene gets directional diffuse plus real HDR highlights (panel radiance up to 100, against ≤0.65 today) | 1–3 ms **once** at load (256 cube plus PMREM) | <1 ms once | 4.2 MB (256 RGBA16F cube, 5 mips: 87,296 texels/face × 6 × 8 B) plus 16 KB SH; 2.1 MB if stored RGB9E5 | +3 KB | 128 face on Low (RGB9E5): 0.5 MB, under 1 ms | Prebaked `neutral.ktx2` when float render targets are unavailable |
| R3 | GPU PMREM + correct sampler + `roughnessToLod` | Smooth roughness sweep, live rough metals, no blotches (06-sweep) | 2–6 ms once per HDRI (256), 8–20 ms (512) | 0 (no main-thread prefilter; removes a hitch of hundreds of ms, E30) | Same as R2 per probe | +6 KB, −9 KB from deleting the CPU PMREM and presets | Prebaked KTX2 on Low, no runtime PMREM | Worker-side CPU FIS prefilter (fixed algorithm) uploaded as RGBA16F |
| R4 | SH9 diffuse | Sky-tinted tops, earth-tinted bottoms (13-ibl-only white sphere) | +9 MADs per pixel, ≈0.05 ms | 0 | 27 floats | +1 KB | None | Roughest 16 px mip |
| R5 | HDRI background pass | Real sky in outdoor games (09, 13). Removes the "flat painted backdrop" | 0.2–0.4 ms (full-screen, 1 fetch) | 0 | 2k equirect RGB9E5 ≈ 8.4 MB on High/Ultra only (RGBA16F would be 16.8 MB) | +1 KB | Cube mip 0, 0 extra memory | Solid `scene().background(color)` |
| R6 | Real HDRI preset library (5) | Art-directable mood (sunset, night) without teal hacks | 0 at runtime (prebaked) | KTX2 transcode ≤ 15 ms per preset off the main thread | 0.5–8 MB per preset by tier | 0 (fetched lazily) | 128 face ≈ 0.3 MB download | Neutral room |
| R7 | Shadow intensity 1.0 + public config | Grounding returns: about 10% shadow contrast → about 50–70% (15, 18) | 0 | 0 | 0 | +0.5 KB | None | Per-light `intensity` |
| R8 | Depth-caster variants (skin, morph, instancing, batch, alpha) | Correct character, foliage and prop shadows | +5–20% shadow-pass vertex cost on skinned items | Variant lookup <0.05 ms | Variant programs ≈ 50–200 KB of driver memory | +4 KB | Compile stalls: precompile at mount | `castShadow: false` per item |
| R9 | HW-compare PCF / Vogel / PCSS | Smooth penumbrae, no stair-steps | Low 0.2, Med 0.5, High 0.9, Ultra PCSS 1.6 ms | 0 | 0 | +2 KB | 1-tap HW on Low | Medium kernel |
| R10 | Stable CSM on root + caster-aware culling | Crisp shadows across large levels, no shimmer, off-screen casters cast (17, Siege Golf fence banding) | +0.3 ms per extra cascade draw (geometry-bound) | Cascade fit and culling 0.1–0.4 ms | 3×2048² DEPTH24 = 50 MB (High) | +3 KB | 1 cascade at 1024 = 4 MB | Fixed `fit` box |
| R11 | Multiple shadowed lights (atlas) + GPU point shadows | Both shadow sets in 12-shadows. Lamp and torch shadows indoors. Removes 6 GPU→CPU stalls per frame | +0.3–0.6 ms per local light | Atlas packing <0.1 ms | Atlas 16–67 MB by tier | +3 KB, −2 KB readback code | Low: none | Sun-only shadows |
| R12 | Contact shadows | Small-scale grounding under feet, wheels and props | 0.3–0.6 ms (needs the prepass, PRD 01) | 0 | R8 full-res ≈ 2 MB | +2 KB | Off on Low | `decals.blobShadow()` |
| R13 | Reflection probes (box-projected) + irradiance volume | Correct interior reflections and indoor bounce light (10-indoor, Gallery Shift, Mech Hangar) | Capture 6 faces + PMREM ≈ 4–10 ms per probe (`once`). Runtime +0.1 ms | Probe selection <0.1 ms | 1.05 MB per 128 RGBA16F probe (4.2 MB at 256); L1 volume 8³ × 3 RGBA16F ≈ 12 KB | +6 KB | Off on Low | Global environment |
| R14 | SSR in HDR | Ground and floor reflections of emissives and objects (Courier, Pulse Tunnel wet streets) | 1.0–2.5 ms | 0 | Colour pyramid ≈ 22 MB (1080p RGBA16F with mips) | +3 KB (PRD 03 owns the pass) | Off below High | Probe/env specular |
| R15 | Physical point/spot units, decay, distance 0, area lights | Hot practicals, believable pools (10-indoor ceiling hotspots, neon in Courier) | ≈0, plus range culling saves ALU | 0 | LTC tables 2×64² RGBA16F = 64 KB (High+) | +2 KB | Gauss–Legendre area on Low | Legacy falloff under `legacy-3.0` |
| R16 | Delete the fallback rig, category heuristics and fake diagnostics | Removes stray hotspots and shadows (13, 14) and honest diagnostics | 0 | −0.2 ms (removes name scans per frame) | 0 | −4 KB | None | None needed |

The net bundle target is **≤ +15 KB gz** for the whole PRD. The root bundle is already 575 KB gz
against an 80 KB budget (research/18 §2), so deletions are mandatory, not optional.

### 6.10 WebGL2 resource-limit budget (per tier, binding on every lighting program)

The section 8 shaders must compile and link on a device that reports only the WebGL2 minimums
(`MAX_TEXTURE_IMAGE_UNITS = 16`, `MAX_FRAGMENT_UNIFORM_VECTORS = 224`,
`MAX_UNIFORM_BLOCK_SIZE = 16384`, `MAX_FRAGMENT_UNIFORM_BLOCKS = 12`) (E35, E36).

Uniform data:

- Light data (32 × 6 vec4) goes in the `A3DLights` uniform block.
- Shadow data (cascade matrices, splits, local-shadow tiles) goes in the `A3DShadows` block
  (≤ 4 KB).
- SH, ambient, hemisphere and probe data go in the `A3DEnvironment` block.
- Loose fragment uniforms per lighting program: ≤ 128 vec4 after this PRD.

Lighting-owned sampler units per draw (material maps keep the rest):

| Tier | Env cube | DFG LUT | Cascade compare | Cascade raw (PCSS) | Atlas compare | Atlas raw | Contact mask | Probe cubes | Irradiance vol | LTC LUTs | Total |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Low | 1 | 1 | 1 | 0 | 0 | 0 | 0 | 0 | 0 | 0 | **3** |
| Medium | 1 | 1 | 1 | 0 | 1 | 0 | 1 | 2 | 0 | 0 | **7** |
| High | 1 | 1 | 1 | 0 | 1 | 0 | 1 | 2 | 3 | 2 | **12** |
| Ultra (PCSS) | 1 | 1 | 1 | 1 | 1 | 1 | 1 | 2 | 3 | 2 | **14** |

Rules:

- The variant compiler sums lighting and material sampler counts per program. If the sum exceeds
  `MAX_TEXTURE_IMAGE_UNITS`, it drops features in a fixed order and records each drop in
  `lighting.diagnostics().droppedFeatures`. The order is: irradiance volume, then the second probe,
  then LTC (falls back to Gauss–Legendre), then PCSS raw samplers (falls back to Vogel). It never
  fails to link.
- On a 16-unit device, High and Ultra therefore downgrade per draw for materials with more than 4
  maps. That is acceptable and must be visible in diagnostics.

---

## 7. APIs to add, change and remove (TypeScript signatures)

### 7.1 Public agent API (`@aura3d/engine`, `packages/engine/src/agent-api/index.ts`)

```ts
// ---------- app-level ----------
export type AuraLightingModel = "physical" | "legacy-3.0";
export type AuraLightingTier = "low" | "medium" | "high" | "ultra";

export interface AuraLightingOptions {
  /** "physical" (default from 3.1). "legacy-3.0" restores 3.0 composition for ONE minor release; logs a deprecation warning. */
  readonly model?: AuraLightingModel;
  /** Promote the brightest directional light to a shadow caster when no directional sets `shadow`. Default true. */
  readonly autoSunShadow?: boolean;
  /** Default "auto": resolved from PRD 11 device tiering; else "medium". */
  readonly quality?: AuraLightingTier | "auto";
  /** Hard cap on shadowed lights; default from tier (section 6.8). */
  readonly maxShadowedLights?: number;
}
// createAuraApp(target, scene, options: AuraCreateAppOptions & { readonly lighting?: AuraLightingOptions })
// createGameApp(... same ...)

// ---------- environments ----------
export type AuraEnvironmentPresetName = "neutral" | "studio" | "outdoor" | "sunset" | "night" | "indoor";

export interface AuraEnvironmentBackgroundOptions {
  /** Draw the environment behind the scene. Default: true for preset/hdri/capture, false for neutral. */
  readonly visible?: boolean;
  /** 0 = sharp; 1 = roughest mip. Default 0. */
  readonly blurriness?: number;
  /** Multiplier on background radiance only. Default 1. */
  readonly intensity?: number;
  /** Radians; defaults to the environment rotation. */
  readonly rotation?: number;
}

export interface AuraEnvironmentOptions {
  readonly name?: string;
  /** Scales diffuse and specular IBL. Default 1 (was 1.15 studio etc.). */
  readonly intensity?: number;
  readonly diffuseIntensity?: number;   // default = intensity
  readonly specularIntensity?: number;  // default = intensity
  /** Radians about +Y. */
  readonly rotation?: number;
  readonly background?: boolean | AuraEnvironmentBackgroundOptions;
  /** Legacy tint; multiplies radiance. Deprecated for presets (use rotation/intensity). */
  readonly color?: AuraColor;
}

export const environments: {
  /** Real prebaked HDRI preset. */
  preset(name: AuraEnvironmentPresetName, options?: AuraEnvironmentOptions): AuraNodeBuilder<AuraEnvironmentNode>;
  /** Code-generated RoomEnvironment port; the implicit default. */
  neutral(options?: AuraEnvironmentOptions): AuraNodeBuilder<AuraEnvironmentNode>;
  /** Explicit zero-IBL opt-out (stylized/unlit scenes). */
  none(): AuraNodeBuilder<AuraEnvironmentNode>;
  /** User HDRI (.hdr RGBE, or .ktx2 cube). Existing signature extended with background. */
  hdri(options: AuraEnvironmentOptions & {
    readonly texture: AuraAssetRef<"texture">;
    readonly reflectionTexture?: AuraAssetRef<"texture">;
  }): AuraNodeBuilder<AuraEnvironmentNode>;
  /** Capture scene content (e.g. sky.dayNight from PRD 10) into the environment probe. */
  capture(options?: AuraEnvironmentOptions & {
    readonly position?: AuraVec3;
    readonly resolution?: 64 | 128 | 256;
    readonly update?: "once" | "on-demand" | { readonly everyNFrames: number };
    readonly include?: "sky-only" | "all";        // default "sky-only"
  }): AuraNodeBuilder<AuraEnvironmentNode>;
  // Legacy aliases kept (section 11): studio(), materialLab(), productHero(), nightCinematic(), metalStudio(), glassStudio(), forMaterial()
  presets(): readonly AuraEnvironmentMapPreset[];
};

export interface AuraEnvironmentNode {
  readonly kind: "environment";
  readonly environment: "preset" | "neutral" | "none" | "hdri" | "capture"
    | "studio" | "material-lab" | "product-hero" | "night-cinematic" | "metal-studio" | "glass-studio"; // legacy
  readonly preset?: AuraEnvironmentPresetName;
  readonly name?: string;
  readonly intensity: number;
  readonly diffuseIntensity?: number;
  readonly specularIntensity?: number;
  readonly rotation?: number;
  readonly background?: boolean | AuraEnvironmentBackgroundOptions;
  readonly texture?: AuraAssetRef<"texture">;
  readonly reflectionTexture?: AuraAssetRef<"texture">;
  readonly capture?: { readonly position: AuraVec3; readonly resolution: number; readonly update: unknown; readonly include: "sky-only" | "all" };
  readonly color?: AuraColor;
}

// scene().background(...) gains an environment form:
// scene().background(color: AuraColor | { readonly environment: true; readonly blurriness?: number; readonly intensity?: number })

// ---------- lights ----------
export interface AuraShadowOptions {
  /** 0..1 fraction of the light removed in full shadow. Default 1. */
  readonly intensity?: number;
  /** Per-light map or tile size; default from tier. */
  readonly mapSize?: 512 | 1024 | 2048 | 4096;
  /** Normalized-depth constant bias. Default 0 (auto). */
  readonly bias?: number;
  /** World-space normal offset in metres. Default auto = 1.5 × texel world size. */
  readonly normalBias?: number;
  readonly filter?: "hard" | "pcf" | "pcss";      // default "pcf"
  /** PCF radius in texels (pcf) or penumbra scale (pcss). Default 1.5. */
  readonly softness?: number;
  /** PCSS emitter size in metres. Default 0.5 (sun: angular 0.53° equivalent). */
  readonly lightSize?: number;
}
export interface AuraDirectionalShadowOptions extends AuraShadowOptions {
  readonly cascades?: 1 | 2 | 3 | 4 | "auto";     // default "auto"
  readonly maxDistance?: number;                  // default min(camera.far, 150)
  readonly splitLambda?: number;                  // default 0.75
  readonly blend?: number;                        // cascade blend band fraction, default 0.1
  /** Fixed light-space box (three's manual shadow.camera). Disables camera fit. */
  readonly fit?: "camera" | { readonly center: AuraVec3; readonly extent: number; readonly depth?: number };
}
export interface AuraLocalShadowOptions extends AuraShadowOptions {
  readonly near?: number;                         // default 0.05
}

export const lights: {
  ambient(options?: { name?: string; intensity?: number /* 0.3 */; color?: AuraColor }): AuraNodeBuilder<AuraLightNode>;
  hemisphere(options?: { name?: string; skyColor?: AuraColor; groundColor?: AuraColor; intensity?: number /* 1 */; position?: AuraVec3 /* sky direction, default [0, 1, 0] */ }): AuraNodeBuilder<AuraLightNode>;
  directional(options?: {
    name?: string; position?: AuraVec3; target?: AuraVec3; intensity?: number /* 3 */; color?: AuraColor;
    shadow?: boolean | AuraDirectionalShadowOptions;
  }): AuraNodeBuilder<AuraLightNode>;
  point(options?: {
    name?: string; position?: AuraVec3; intensity?: number /* 8 cd */; power?: number /* lm; overrides intensity */;
    distance?: number /* 0 = infinite */; decay?: number /* 2 */; color?: AuraColor;
    shadow?: boolean | AuraLocalShadowOptions;
  }): AuraNodeBuilder<AuraLightNode>;
  spot(options?: {
    name?: string; position?: AuraVec3; target?: AuraVec3; angle?: number; penumbra?: number;
    intensity?: number /* 30 cd */; power?: number; distance?: number /* 0 */; decay?: number /* 2 */; color?: AuraColor;
    shadow?: boolean | AuraLocalShadowOptions;
  }): AuraNodeBuilder<AuraLightNode>;
  rect(options?: { name?: string; position?: AuraVec3; target?: AuraVec3; intensity?: number /* nits */; color?: AuraColor; width?: number; height?: number; twoSided?: boolean }): AuraNodeBuilder<AuraLightNode>;
  softbox(/* same as rect */ options?: Parameters<typeof lights.rect>[0]): AuraNodeBuilder<AuraLightNode>;
  /** studio(): now = environments.preset("studio") is recommended; kept as 3 directionals, key casts by autoSunShadow. */
  studio(options?: { intensity?: number }): AuraNodeBuilder<AuraLightNode>;
  productStudio(options?: { intensity?: number }): AuraNodeBuilder<AuraLightNode>;
  materialLab(options?: { intensity?: number }): AuraNodeBuilder<AuraLightNode>;
};

export type AuraLightType = "ambient" | "hemisphere" | "directional" | "point" | "studio" | "rect" | "softbox" | "spot";
export interface AuraLightNode extends AuraTransformSpec {
  readonly kind: "light";
  readonly light: AuraLightType;
  readonly name?: string;
  readonly color?: AuraColor;
  readonly groundColor?: AuraColor;          // hemisphere
  readonly intensity: number;
  readonly power?: number;
  readonly width?: number;
  readonly height?: number;
  readonly twoSided?: boolean;
  readonly target?: AuraVec3;
  readonly angle?: number;
  readonly penumbra?: number;
  readonly distance?: number;
  readonly decay?: number;
  readonly shadow?: boolean | AuraDirectionalShadowOptions | AuraLocalShadowOptions;
}

// ---------- shadows / decals ----------
export const decals: {
  /** Was shadows.contact(). Art-directed blob; never reported as a rendering feature. */
  blobShadow(options?: { name?: string; position?: AuraVec3; footprint?: readonly [number, number]; opacity?: number; color?: AuraColor }): AuraNodeBuilder<AuraPrimitiveNode>;
};
/** @deprecated alias of decals.blobShadow; removed in 3.2. */
export const shadows: { contact: typeof decals.blobShadow };

// ---------- effects ----------
export interface AuraContactShadowOptions {
  readonly length?: number;     // metres, default 0.25
  readonly thickness?: number;  // metres, default 0.05
  readonly steps?: 8 | 12 | 16; // default 12 (Medium), 16 (High+)
  readonly intensity?: number;  // default 1
  readonly lights?: "sun" | "shadowed"; // default "sun"
}
// effects.contactShadows(options?: AuraContactShadowOptions): AuraNodeBuilder<AuraEffectNode>  (new; effect: "contact-shadows")
// effects.screenSpaceReflections({ maxDistance?, thickness?, roughnessCutoff? /*0.5*/, intensity?, resolution?: "half" | "full" }) — semantics per 6.7

// ---------- probes ----------
export interface AuraReflectionProbeOptions {
  readonly name: string;
  readonly position: AuraVec3;
  /** Parallax box (world AABB). Omit = infinite (no box projection). */
  readonly box?: { readonly min: AuraVec3; readonly max: AuraVec3 };
  readonly resolution?: 64 | 128 | 256;           // default 128
  readonly update?: "once" | "on-demand" | { readonly everyNFrames: number }; // default "once"
  readonly blendDistance?: number;                // default 1 m
  readonly priority?: number;                     // default 0
  readonly intensity?: number;                    // default 1
}
export interface AuraIrradianceVolumeOptions {
  readonly name: string;
  readonly bounds: { readonly min: AuraVec3; readonly max: AuraVec3 };
  readonly resolution: readonly [number, number, number]; // each 2..16
  readonly update?: "once" | "on-demand";
  readonly intensity?: number;
}
export const probes: {
  reflection(options: AuraReflectionProbeOptions): AuraNodeBuilder<AuraProbeNode>;
  irradianceVolume(options: AuraIrradianceVolumeOptions): AuraNodeBuilder<AuraProbeNode>;
};
export interface AuraProbeNode {
  readonly kind: "probe";
  readonly probe: "reflection" | "irradiance-volume";
  readonly name: string;
  readonly options: AuraReflectionProbeOptions | AuraIrradianceVolumeOptions;
}

// ---------- runtime ----------
export interface AuraLightingRuntime {
  updateProbe(name: string): Promise<void>;
  rebakeIrradiance(name?: string): Promise<void>;
  setEnvironmentRotation(radians: number): void;
  setEnvironmentIntensity(value: number): void;
  readonly diagnostics: () => AuraLightingDiagnostics;
}
// AuraApp gains: readonly lighting: AuraLightingRuntime

export interface AuraLightingDiagnostics {
  readonly model: AuraLightingModel;
  readonly tier: AuraLightingTier;
  readonly environment: {
    readonly source: "neutral" | "preset" | "hdri" | "capture" | "none";
    readonly preset?: AuraEnvironmentPresetName;
    readonly faceSize: number; readonly mipCount: number; readonly format: "rgba16f" | "rgb9e5";
    readonly shBound: boolean;                  // observed: SH uniform/texture bound in last frame
    readonly backgroundDrawn: boolean;          // observed: EnvironmentBackgroundPass executed
    readonly pmremGpuMs: number | null;         // timer-query measured, null if unsupported
  };
  readonly shadows: ReadonlyArray<{
    readonly light: string; readonly kind: "directional" | "spot" | "point";
    readonly cascades: number; readonly mapSize: number;
    readonly filter: "hard" | "pcf-hw-1" | "pcf-castano-5x5" | "pcf-vogel-16" | "pcss"; // derived from compiled program defines
    readonly intensity: number; readonly casterCount: number; readonly casterVariants: readonly string[];
    readonly sampled: boolean;                  // observed binding
  }>;
  readonly droppedShadowLights: readonly string[];
  readonly contactShadows: { readonly enabled: boolean; readonly passExecuted: boolean };
  readonly probes: ReadonlyArray<{ readonly name: string; readonly kind: string; readonly captured: boolean; readonly lastCaptureFrame: number }>;
  readonly lightsEvaluated: number; readonly lightsCulledByRange: number; readonly lightsDroppedByCap: readonly string[];
  /** Features removed per program by the 6.10 sampler budget, e.g. { program: "aura3d/pbr-textured:…", dropped: ["irradiance-volume"] }. */
  readonly droppedFeatures: ReadonlyArray<{ readonly program: string; readonly dropped: readonly string[] }>;
  /** Observed device counters (E33). */
  readonly programCompileCount: number; readonly readPixelsCalls: number;
}
```

### 7.2 Renderer API (`@aura3d/rendering`)

```ts
// environment/EnvironmentProbe.ts
export interface EnvironmentProbe {
  readonly kind: "environment-probe";
  readonly specularCube: Texture;            // cube, RGBA16F (or RGB9E5 sample-only from KTX2), mipCount levels
  readonly mipCount: number;                 // log2(faceSize) - 3   (16 px floor)
  readonly faceSize: 128 | 256 | 512;
  readonly sh9: Float32Array;                // length 27, irradiance (cosine-convolved), linear
  readonly shTexture: Texture | null;        // 9x1 RGBA16F when produced on GPU; sh9 mirrors it lazily
  readonly background: Texture | null;       // equirect for High/Ultra
  readonly source: "neutral" | "preset" | "hdri" | "capture";
  dispose(): void;
}

// environment/GPUPMREMGenerator.ts
export interface GPUPMREMOptions {
  readonly faceSize?: 128 | 256 | 512;       // default 256
  readonly sampleCount?: 16 | 32 | 64;       // default 32
  readonly minFaceSize?: 16;                 // fixed
}
export class GPUPMREMGenerator {
  constructor(device: RenderDevice, options?: GPUPMREMOptions);
  fromEquirect(source: Texture, options?: GPUPMREMOptions): EnvironmentProbe;
  fromCube(source: Texture, options?: GPUPMREMOptions): EnvironmentProbe;
  fromScene(renderFace: (face: 0 | 1 | 2 | 3 | 4 | 5, target: RenderTarget, viewProjection: Mat4) => void,
            options?: GPUPMREMOptions & { readonly position?: readonly [number, number, number] }): EnvironmentProbe;
  dispose(): void;
}
export function roughnessToLod(perceptualRoughness: number, mipCount: number): number;   // (mipCount-1) * r * (2 - r)
export function lodToRoughness(lod: number, mipCount: number): number;                   // inverse

// environment/SphericalHarmonics.ts
export function projectCubeToSH9(faces: readonly Float32Array[], faceSize: number): Float32Array; // CPU reference for tests + worker fallback
export function evaluateSH9Irradiance(sh9: Float32Array, normal: readonly [number, number, number]): [number, number, number];

// environment/EnvironmentCache.ts
export class EnvironmentCache {
  constructor(device: RenderDevice, pmrem: GPUPMREMGenerator);
  acquire(key: { readonly url?: string; readonly preset?: string; readonly tier: string }): Promise<EnvironmentProbe>;
  neutral(tier: string): EnvironmentProbe;   // synchronous, generated at first call
  release(probe: EnvironmentProbe): void;
}

// RenderSource (Renderer.ts:246-271) — replace environmentLighting procedural fields:
export interface RenderSource {
  // ...existing...
  readonly environmentProbe?: EnvironmentProbe | null;                    // NEW, required in "physical"
  readonly ambient?: { readonly color: readonly [number, number, number]; readonly intensity: number };   // irradiance
  readonly hemisphere?: { readonly sky: readonly [number, number, number]; readonly ground: readonly [number, number, number]; readonly intensity: number };
  readonly environmentBackground?: EnvironmentBackgroundOptions | false;   // existing field; root now sets it
  readonly reflectionProbes?: readonly ReflectionProbeResource[];
  readonly irradianceVolumes?: readonly IrradianceVolumeResource[];
  readonly shadows?: ShadowSystemConfig;                                    // replaces `shadow?: RendererShadowOptions`
  readonly contactShadows?: ContactShadowConfig | false;
}

// shadows/ShadowSystem.ts
export interface ShadowedLightConfig {
  readonly lightIndex: number;               // index into collectedLights
  readonly kind: "directional" | "spot" | "point";
  readonly intensity: number;                // default 1
  readonly mapSize: number;
  readonly bias: number;
  readonly normalBias: number | "auto";
  readonly filter: "hard" | "pcf" | "pcss";
  readonly softness: number;
  readonly lightSize: number;
  readonly cascades?: { readonly count: 1 | 2 | 3 | 4; readonly maxDistance: number; readonly lambda: number; readonly blend: number;
                        readonly fit: "camera" | { readonly center: readonly [number, number, number]; readonly extent: number; readonly depth?: number } };
  readonly near?: number;
}
export interface ShadowSystemConfig {
  readonly lights: readonly ShadowedLightConfig[];
  readonly atlasSize: readonly [number, number];   // local lights
  readonly cascadeArraySize: number;               // per-layer size
  readonly tier: "low" | "medium" | "high" | "ultra";
}
export class ShadowSystem {
  constructor(device: RenderDevice, library: ShaderLibrary);
  update(config: ShadowSystemConfig, sceneItems: readonly RenderItem[], camera: CameraLike & { readonly near: number; readonly far: number; readonly fov?: number; readonly aspect?: number; readonly viewMatrix: Mat4 }): ShadowFrameUniforms;
  dispose(): void;
}
export interface ShadowFrameUniforms {
  readonly cascadeTexture: Texture | null;            // DEPTH24 2D array
  readonly cascadeMatrices: Float32Array;             // 4 × mat4
  readonly cascadeSplits: Float32Array;               // vec4 view-space far distances
  readonly cascadeTexelWorld: Float32Array;           // vec4
  readonly atlasTexture: Texture | null;              // DEPTH24 2D
  readonly localShadowData: Float32Array;             // per local light: tile rect vec4 + matrix (spot) / 6 rects (point) + params
  readonly perLightShadowIndex: Int32Array;           // collectedLights index → shadow slot or -1
}

// shadows/ShadowCasterVariants.ts
export interface ShadowCasterVariantKey {
  readonly skinning: 0 | 4 | 8; readonly skinningTexture: boolean; readonly morphTargets: number;
  readonly instanced: boolean; readonly batched: boolean; readonly alphaTest: boolean; readonly alphaHash: boolean; readonly doubleSided: boolean;
}
export function resolveShadowCasterVariant(item: RenderItem): ShadowCasterVariantKey;
export function shadowCasterVariantId(key: ShadowCasterVariantKey): string;   // stable string for caching + diagnostics

// shadows/DirectionalCascadeFitter.ts
export function fitDirectionalCascades(input: {
  readonly cameraView: Mat4; readonly cameraProjection: Mat4; readonly near: number; readonly far: number;
  readonly lightDirection: readonly [number, number, number]; readonly mapSize: number;
  readonly count: 1 | 2 | 3 | 4; readonly maxDistance: number; readonly lambda: number;
  readonly casterBounds: { readonly min: readonly [number, number, number]; readonly max: readonly [number, number, number] };
}): ReadonlyArray<{ readonly viewProjection: Mat4; readonly splitFar: number; readonly texelWorldSize: number; readonly radius: number }>;

// shadows/ShadowAtlas.ts
export class ShadowAtlas {
  constructor(width: number, height: number);
  allocate(lightId: string, tileSize: number, tiles: 1 | 6): readonly { x: number; y: number; size: number }[] | null;
  release(lightId: string): void;
  reset(): void;
}

// passes/ContactShadowPass.ts
export interface ContactShadowConfig { readonly length: number; readonly thickness: number; readonly steps: number; readonly intensity: number; readonly lightIndices: readonly number[] }

// probes/ReflectionProbeSystem.ts, probes/IrradianceVolume.ts
export interface ReflectionProbeResource { readonly name: string; readonly probe: EnvironmentProbe; readonly position: readonly [number, number, number];
  readonly boxMin?: readonly [number, number, number]; readonly boxMax?: readonly [number, number, number]; readonly blendDistance: number; readonly priority: number; readonly intensity: number }
export interface IrradianceVolumeResource { readonly name: string; readonly textures: readonly [Texture, Texture, Texture];
  readonly boundsMin: readonly [number, number, number]; readonly boundsMax: readonly [number, number, number]; readonly resolution: readonly [number, number, number]; readonly intensity: number }

// Sampler.ts — change
// constructor default: minFilter = descriptor.minFilter ?? "linear-mipmap-linear"
// WebGL2Device/WebGPUDevice: when the bound texture has mipLevels === 1, downgrade *-mipmap-* to the non-mip filter (no incomplete-texture black).
export interface SamplerDescriptor { /* existing */ readonly compare?: "less-equal" | "greater-equal" }  // NEW: depth compare sampler
```

### 7.3 Removed or changed

| Symbol | Action |
|---|---|
| `createProductionRuntimeEnvironment` `authored-ambient` branch (`index.ts:12693-12707`) | Delete. Ambient becomes `RenderSource.ambient`. |
| Category preset selection (`index.ts:12708-12722`), `createExternalParityEnvironmentLighting("gameplay"\|…)` as defaults | Delete. ExternalParity presets move to `tests/fixtures` if a parity test still needs them; otherwise delete. |
| `createProductionRuntimeFallbackLights` (`index.ts:13363-13401`) | Delete. With no lights, the neutral environment lights the scene. |
| `createProductionRuntimeShadowOptions` strength, size and bias heuristics (`index.ts:12942-13001`) | Replace with `resolveShadowSystemConfig(snapshot, lights, tier)`. |
| `resolveProductionShadowCasterIndex` single slot (`index.ts:13172-13199`) | Replace with `selectShadowedLights(descriptors, { autoSunShadow, max })` that returns many slots. |
| `RendererShadowOptions` (`Renderer.ts:363-376`) | Keep as a deprecated input. Map to `ShadowSystemConfig` (`strength` → `intensity`). Remove in 3.2. |
| `selectForwardShadowMap` (`ForwardPass.ts:834-854`) | Delete. |
| `readShadowFacePixels` and `executeRendererPointShadowMap` CPU path (`Renderer.ts:1516-1603, 1915-1931`) | Delete. |
| `production-runtime/environment/PMREMGenerator.ts` | Delete after GPU PMREM lands. Keep the CPU FIS as `SphericalHarmonics.ts` and `workers/cpuPrefilter.ts` for the fallback only. |
| `RootEnvironmentMapPreset` intensity scalars (`index.ts:4216-4223`), the exposure presets as diagnostics labels (`index.ts:4204-4214`) | Delete the lighting fields. Exposure is PRD 03. |
| Diagnostics `mapType: "pcf-soft"` (`index.ts:1829, 4614`), name-counted contact shadows (`index.ts:4485-4487, 4533, 9317, 9337`) | Replace with `AuraLightingDiagnostics` (observed values). |
| Lint "add lights.studio() or lights.ambient()" (`index.ts:18256`) | Change to "Scene uses the neutral environment only; add `environments.preset(...)` and `lights.directional({ shadow: true })` for a key light." |
| `GameRenderPreset` shadow strength 0.38 and IBL-less top-down (`GameRenderPreset.ts:344-347, 420-434`) | Strength 1, and the environment comes from the scene (shared with PRD 09). |

---

## 8. Shader changes (GLSL ES 3.00; WGSL equivalents gated on PRD 11)

All shader programs (lean `aura3d/pbr-direct`, `pbr-textured` and its variants, skinned-lit,
skinned-lit-8, instanced-pbr, normal-mapped) **include the same chunks**. The copy-pasted lighting in
`ShaderLibrary.ts` and `ShaderLibraryCore.ts` is deleted (research/02 §3.4). Under Track T, these
chunks are replaced by three's `lights_*` and `envmap_*` chunks and the TSL equivalents.

### 8.1 `lighting_ibl.glsl.ts`

```glsl
uniform samplerCube u_envSpecular;          // RGBA16F, mips
uniform float u_envMipCount;                // N
uniform float u_envRotation;                // radians
uniform float u_envDiffuseIntensity;
uniform float u_envSpecularIntensity;
uniform vec4  u_envSH[7];                   // 27 coefficients packed (L0..L2 × rgb), cosine-convolved irradiance
uniform vec3  u_ambientIrradiance;          // ambient.color * ambient.intensity
uniform vec3  u_hemiSky; uniform vec3 u_hemiGround; // pre-multiplied by intensity
uniform vec3  u_hemiDirection;              // normalized; default (0,1,0)
// All u_env*, u_ambient*, u_hemi* values live in the std140 block A3DEnvironment (6.10); shown as loose uniforms for readability.

vec3 a3dRotateY(vec3 d, float a) { float c = cos(a), s = sin(a); return vec3(c*d.x - s*d.z, d.y, s*d.x + c*d.z); }
float a3dRoughnessToLod(float r) { return (u_envMipCount - 1.0) * r * (2.0 - r); }

vec3 a3dSH9Irradiance(vec3 n) {           // Ramamoorthi–Hanrahan; constants folded on CPU/GPU at projection time
  // unpack c[0..8] from u_envSH; E = c0 + c1*y + c2*z + c3*x + c4*xy + c5*yz + c6*(3z²-1) + c7*xz + c8*(x²-y²)
  ...
  return max(E, vec3(0.0));
}
vec3 a3dIndirectDiffuseIrradiance(vec3 n) {
  vec3 E = a3dSH9Irradiance(a3dRotateY(n, u_envRotation)) * u_envDiffuseIntensity;
  E += u_ambientIrradiance;
  E += mix(u_hemiGround, u_hemiSky, dot(n, u_hemiDirection) * 0.5 + 0.5);
  return E;                                 // caller multiplies by kd*albedo/PI and ao
}
vec3 a3dEnvSpecularRadiance(vec3 n, vec3 v, float r) {
  vec3 R = reflect(-v, n);
  R = normalize(mix(R, n, r * r * r * r)); // three getIBLRadiance bend
  return textureLod(u_envSpecular, a3dRotateY(R, u_envRotation), a3dRoughnessToLod(r)).rgb * u_envSpecularIntensity;
}
float a3dSpecularOcclusion(float NoV, float ao, float r) {     // Lagarde 2014
  return clamp(pow(NoV + ao, exp2(-16.0 * r - 1.0)) - 1.0 + ao, 0.0, 1.0);
}
float a3dHorizonOcclusion(vec3 R, vec3 Ng) { float h = min(1.0 + dot(R, Ng), 1.0); return h * h; }
```

Deleted from the shaders:

- `environmentHemi` (`ShaderLibraryCore.ts:622`).
- The procedural sky/horizon/ground diffuse and `reflectionBand` specular (`:624-644`).
- The equirect env sampling path for lighting (`:440-445, 476-480`). Equirect stays only for the
  background pass.
- The `mix(1.1, 0.65, roughness)` and `mix(1.1, 0.85, …)` gains (`:650, 654`).
- `u_environmentColor` as an additive constant. It is replaced by `u_ambientIrradiance`, which is
  divided by π at the use site.

Diffuse use site: `indirectDiffuse = a3dIndirectDiffuseIrradiance(n) * kd * albedo * (1.0/PI) * aoDiffuse`.

Specular use site:

```glsl
spec = a3dEnvSpecularRadiance(...) * (F0*dfg.x + f90*dfg.y) * multiscatter
       * a3dSpecularOcclusion(NoV, ao, r) * a3dHorizonOcclusion(R, Ng);
```

`dfg` and `multiscatter` come from PRD 04's DFG LUT. In 3.1, before PRD 04 lands, the existing
`ShaderChunks.ts:217-245` helper is used. The RG16F LUT is always bound; it is never `(1, 0)`.

### 8.2 Reflection probes and irradiance volume (in `lighting_ibl`)

```glsl
uniform samplerCube u_probeSpecular0; uniform samplerCube u_probeSpecular1;   // WebGL2: 2 per draw
uniform vec4 u_probeBoxMin[2]; uniform vec4 u_probeBoxMax[2];                  // w = enabled
uniform vec4 u_probePosWeight[2];                                              // xyz capture pos, w weight (CPU)
uniform highp sampler3D u_irrVol0; uniform highp sampler3D u_irrVol1; uniform highp sampler3D u_irrVol2; // SH L1 per channel: R, G, B; texel = (L0, L1-1, L10, L11)
uniform vec3 u_irrVolMin; uniform vec3 u_irrVolMax; uniform float u_irrVolEnabled;
// specular: L = w0*probe0(boxProject(R)) + w1*probe1(...) + (1-w0-w1)*env(R)
// diffuse:  inside volume (fade 1 cell at border) E_probe replaces SH env term; ambient+hemi still add.
```

`boxProject` reuses `a3dPbrBoxProjectedDirection` (`ShaderLibraryCore.ts:481-493`), using the capture
position rather than the box centre (fixes the centre assumption at `:491`).

### 8.3 `lighting_punctual.glsl.ts`

```glsl
float a3dDistanceFalloff(float d, float cutoff, float decay) {          // three r185 lights_pars_begin
  float f = 1.0 / max(pow(d, decay), 0.01);
  if (cutoff > 0.0) { float x = d / cutoff; float w = clamp(1.0 - x*x*x*x, 0.0, 1.0); f *= w * w; }
  return f;
}
```

The light data layout gains a `decay` slot. Each light stays at 6 vec4, with `decay` packed into
`spotShadowLayer.w`.

- The loop computes `if (cutoff > 0.0 && d > cutoff) continue;` **before** the BRDF.
- The cap rises to 32 lights through the std140 block
  `layout(std140) uniform A3DLights { vec4 lightData[192]; vec4 lightMeta; };` (3 KB, see 6.10). The
  loose `u_lightData[96]` array is kept only under `legacy-3.0`.
- Lights with `kind > 2.5` (area) go to the existing `a3dPbrRectAreaLight` integrator on Low/Medium,
  and to the LTC integrator on High/Ultra. LTC uses two 64×64 RGBA16F LUTs from three
  `RectAreaLightTexturesLib`, which is MIT and must be attributed.

`directLightIntensity` multiplies by `a3dShadowVisibility(lightIndex)` (8.4), which is 1.0 when the
light is unshadowed.

### 8.4 `shadow_receive.glsl.ts`

```glsl
uniform highp sampler2DArrayShadow u_cascadeShadow;      // compare sampler (LINEAR, COMPARE_REF_TO_TEXTURE, LEQUAL)
uniform highp sampler2DArray       u_cascadeDepthRaw;    // same texture, non-compare sampler (PCSS blocker search only)
uniform mat4  u_cascadeMatrix[4];
uniform vec4  u_cascadeSplits;                           // view-space far per cascade
uniform vec4  u_cascadeTexelWorld;
uniform float u_cascadeCount; uniform float u_cascadeBlend;
uniform vec4  u_sunShadowParams;                         // x intensity, y bias, z normalBias(-1 auto), w softness
uniform highp sampler2DShadow u_localShadowAtlas;
uniform highp sampler2D       u_localShadowAtlasRaw;
uniform vec4  u_localShadowData[/* 8 lights × 8 vec4 */ 64];
// u_cascade*, u_sunShadowParams and u_localShadowData live in the std140 block A3DShadows (6.10).

float a3dIGN(vec2 p) { return fract(52.9829189 * fract(dot(p, vec2(0.06711056, 0.00583715)))); }
vec2  a3dVogel(int i, int n, float phi) { float r = sqrt((float(i) + 0.5) / float(n)); float t = float(i) * 2.39996323 + phi; return r * vec2(cos(t), sin(t)); }

float a3dCascadeVisibility(int c, vec3 worldPos, vec3 Ng, float NoL) {
  float nb = u_sunShadowParams.z < 0.0 ? 1.5 * u_cascadeTexelWorld[c] : u_sunShadowParams.z;
  vec4 lp = u_cascadeMatrix[c] * vec4(worldPos + Ng * nb * (1.0 - NoL), 1.0);
  vec3 p = lp.xyz / lp.w * 0.5 + 0.5;
  float ref = p.z - u_sunShadowParams.y;
#if A3D_SHADOW_FILTER == 0      // HW 1-tap
  return texture(u_cascadeShadow, vec4(p.xy, float(c), ref));
#elif A3D_SHADOW_FILTER == 1    // Castaño 5x5 (9 bilinear compare taps, weights per Castaño 2013)
  ...
#elif A3D_SHADOW_FILTER == 2    // Vogel 16, IGN rotation
  float phi = a3dIGN(gl_FragCoord.xy) * 6.2831853; vec2 rad = u_sunShadowParams.w * u_cascadeTexelWorld[c] / u_cascadeTexelWorld[0] * texelSize;
  float s = 0.0; for (int i = 0; i < 16; ++i) s += texture(u_cascadeShadow, vec4(p.xy + a3dVogel(i,16,phi) * rad, float(c), ref)); return s / 16.0;
#else                           // PCSS: blocker search 16 via u_cascadeDepthRaw, then Vogel 32 with penumbra = lightSize*(ref-avgBlocker)/avgBlocker
  ...
#endif
}
float a3dSunShadow(vec3 worldPos, vec3 Ng, float NoL, float viewDepth) {
  int c = 0; for (int i = 0; i < 3; ++i) { if (viewDepth > u_cascadeSplits[i] && float(i + 1) < u_cascadeCount) c = i + 1; }
  if (viewDepth > u_cascadeSplits[int(u_cascadeCount) - 1]) return 1.0;       // beyond maxDistance: lit (fade last 10%)
  float v = a3dCascadeVisibility(c, worldPos, Ng, NoL);
  float bandStart = u_cascadeSplits[c] * (1.0 - u_cascadeBlend);
  if (viewDepth > bandStart && float(c + 1) < u_cascadeCount) {
    float t = (viewDepth - bandStart) / (u_cascadeSplits[c] - bandStart);
    v = mix(v, a3dCascadeVisibility(c + 1, worldPos, Ng, NoL), t);
  }
  return mix(1.0, v, u_sunShadowParams.x);                                   // intensity default 1.0
}
// Local lights: spot → tile matrix in u_localShadowData; point → face = a3dPointShadowFaceIndex(dir) (kept, ShaderLibraryCore.ts:532-537), tile rect + face matrix;
// same filter switch against u_localShadowAtlas with 1-texel guard clamp: uv = clamp(uv, rect.xy + 0.5/atlas, rect.xy + rect.zw - 0.5/atlas).
float a3dShadowVisibility(int lightIndex) { /* routes by u_localShadowData slot; returns 1.0 if unshadowed */ }
```

`receiveShadow == false` sets `u_receiveShadow = 0.0`, so `a3dShadowVisibility` returns 1.0. The
contact-shadow mask is multiplied in for the lights listed in `ContactShadowConfig.lightIndices`:
`v *= mix(1.0, texelFetch(u_contactShadowMask, ivec2(gl_FragCoord.xy), 0).r, u_contactIntensity)`.

Deleted: `a3dForwardShadowFactor` and `a3dPointShadowFactor` (`ShaderLibraryCore.ts:494-581`) and
their copies in `ShaderLibrary.ts:225-315, 822, 1352, 1840, 2530`; the `u_shadowPcfSamples[32]`
uniform arrays; and the `A3D_PBR_NO_SPOT_SHADOW` define.

### 8.5 `shadow_caster.glsl.ts` (depth variants)

The vertex shader includes the same `skinning_vertex`, `morph_vertex` and `instancing_vertex` chunks
as the forward programs:

```glsl
#ifdef A3D_INSTANCED   mat4 inst = a_instanceMatrix;  /* or u_instanceMatrices[gl_InstanceID] ≤64 */  #else mat4 inst = mat4(1.0); #endif
#ifdef A3D_MORPH       pos += morphDelta(...);  #endif
#ifdef A3D_SKINNED     pos = (skinMatrix(a_joints, a_weights) * vec4(pos, 1.0)).xyz; #endif
gl_Position = u_lightViewProjection * u_modelMatrix * inst * vec4(pos, 1.0);
```

Composition order is **model × instance**. That keeps the forward convention, with the PRD 01
`size`-into-instance fix (E31) applied so the shadow matches the drawn geometry.

Fragment shader: under `A3D_ALPHA_TEST`, sample `u_baseColorTexture` at `v_uv` and
`if (a * u_baseColorFactor.a < u_alphaCutoff) discard;`. Under `A3D_ALPHA_HASH`, use the hashed-alpha
threshold of Wyman & McGuire 2017 against world position. With no colour attachment, the colour output
is removed and the wasted RGBA8 colour attachment in `ShadowPass.ts:165-171` is deleted. WebGL2
allows a framebuffer whose only attachment is a depth texture, so no colour attachment is needed. Call
`drawBuffers([NONE])` and `readBuffer(NONE)` on it so drivers do not warn about missing colour
outputs.

### 8.6 `contact_shadow.glsl.ts` (full-screen, after the depth prepass)

```glsl
uniform highp sampler2D u_linearDepth;  uniform mat4 u_projection; uniform mat4 u_invProjection;
uniform vec3 u_lightDirView; uniform float u_length; uniform float u_thickness; uniform int u_steps;
// p0 = viewPos(uv); step = u_lightDirView * u_length / steps; jitter start by IGN;
// for i < steps: p += step; uvp = project(p); dScene = linearDepth(uvp); if (p.z behind dScene and (dScene - p.z) < u_thickness) { occl = 1 - (i/steps)^2 fade; break; }
// edge fade near screen border; out R8 = 1 - occl
```

### 8.7 PMREM and SH shaders (`GPUPMREMGenerator`)

- **`equirectToCube.frag`.** Per-face direction from the face basis. Sample the RGBE- or
  RGBA16F-decoded equirect with `textureLod(…, 0)`.
- **`ggxPrefilter.frag`.** `S` Hammersley samples. GGX importance-samples `H` around `N = V = R`
  (Karis split-sum assumption). PDF-based source LOD:

  ```
  lodS = max(0.5*log2((1/(S*pdf)) / (4π/(6·F²))) + 1, 0)
  ```

  Weight by `NoL`, then `textureLod(u_source, L, lodS)`. Output RGBA16F. Mip 0 is a copy.
- **`shProject.frag`.** Pass 1: one fragment per (face, 4×4 block) of the 16 px level accumulates the
  9 basis values times radiance times the solid angle `dω = 4/((1+u²+v²)^{3/2}·F²)`. Pass 2 reduces to
  9 texels. The final multiply by the cosine-lobe constants `{π, 2π/3, 2π/3, 2π/3, π/4 …}` happens in
  pass 2, so the shader stores irradiance directly.
- **`environmentBackground.frag`** (replaces `ShaderLibraryCore.ts:808-889`). Under
  `A3D_BG_EQUIRECT`, sample the equirect at lod 0. Otherwise use
  `textureLod(u_envSpecular, rotY(dir), a3dRoughnessToLod(blurriness))`. Multiply by `u_bgIntensity`
  and write linear HDR. No in-shader tone map: the Narkowicz ACES at `ShaderLibraryCore.ts:588-593` is
  removed from every lighting shader, and tone mapping is owned by PRD 03.

### 8.8 WGSL (Track R, WebGPU path; executes only after PRD 11 makes WebGPU a real backend)

The mappings are:

- `texture_depth_2d_array` + `sampler_comparison` + `textureSampleCompareLevel`
- `texture_cube<f32>` + `textureSampleLevel`
- `texture_3d<f32>` for the irradiance volume
- `depth32float` targets

No regex GLSL→WGSL marker translation (research/07 §2) may be used for these programs.

---

## 9. Rendering changes (frame order and resource lifetime)

Per frame, under the "physical" model:

1. **Resolve lighting state** (CPU, engine bridge, `createProductionRuntimeRendererInput`,
   `index.ts:13990-14006`):
   - Environment node → `EnvironmentCache.acquire` (async; the neutral probe is bound until it
     resolves).
   - Ambient and hemisphere irradiance.
   - Collected lights with units.
   - `ShadowSystemConfig` from the lights plus the tier.
   - Probe list.
   - `environmentBackground` when the environment's background is visible.

   The bridge stops spreading `compatibility.source` over lighting fields. Compatibility sources may
   still provide `environmentProbe`, but not legacy procedural maps.
2. **Probe maintenance.** Time-sliced reflection-probe face captures, with at most 1 face per frame on
   High and 6 on Ultra, and irradiance-volume bakes on demand. Capture uses the forward pass with
   probes disabled, to avoid feedback.
3. **Shadow pass** (`ShadowSystem.update`):
   - Collect casters from the **full scene item list** after LOD selection but **before camera
     frustum culling** (fixes E21). Cull them per cascade or tile frustum.
   - Draw with variant programs.
   - The cascade array and atlas are allocated once per tier change, not per frame.
   - `Renderer.ts:1354-1603` is replaced by one call.
4. **Depth/normal prepass** (PRD 01). Required on Medium and above for contact shadows, GTAO
   (PRD 03) and SSR.
5. **Contact shadow pass** (Medium+), producing the R8 mask.
6. **Background pass** into the RGBA16F scene target, at depth = far, so depth-tested pixels pass only
   where nothing was drawn. With a prepass the background draws after opaque, using a depth-equal-far
   test to save fill.
7. **Forward opaque.** Per-frame lighting uniforms come from a UBO, coordinated with PRD 11 (the
   uniform-architecture item, research/07 §10.4). Per-draw state is limited to probe weights and
   `receiveShadow`.
8. **Transparent forward.** Same lighting. Shadows are received, and blended casters cast only through
   `alphaHash`.
9. **SSR** (High+, PRD 03 chain, pre-tonemap). Then PRD 03 tone mapping and the rest of post.

Resource lifetime:

- Environment probes are reference-counted in `EnvironmentCache`, with the tier-dependent resident
  limit from section 14 (3, or 2 on Medium with RGBA16F probes).
- On a tier change the cube is regenerated at the new face size.
- Prebaked KTX2 presets are transcoded in the existing KTX2 worker (PRD 04/05 fixes the transcoder
  host).
- On device loss, the probes and the shadow system are recreated from cache keys.

---

## 10. Migration plan

1. **Flag first.** Land `lighting.model` with both paths behind it.
   - 3.1.0-next: the default is `"physical"` in benchmarks, the quality-rebuild harnesses and every
     rebuilt game (PRD 14). It stays `"legacy-3.0"` for external callers until 3.1.0 final.
   - 3.1.0 final: the default is `"physical"`, and `"legacy-3.0"` logs a deprecation warning.
   - 3.2.0: the legacy path and all items in 7.3 are deleted.
2. **Codemod** `aura3d migrate lighting` (`packages/aura3d-cli`). It operates on the AST through the
   existing CLI parser utilities and prints a per-file report. Its rewrites are:
   - `shadows.contact(` → `decals.blobShadow(`.
   - `lights.point({...})` gains `distance: 10 * scale` only when the file opts into `--preserve-range`.
     Otherwise it is left as-is, with a report line saying the light is now infinite-range with decay 2.
   - `lights.ambient({ intensity: x })` is kept, with a report line: "ambient is now 1/π of 3.0 and adds
     to IBL; expect brighter specular and less flat fill. Consider removing ambient if an environment is
     present."
   - `environments.studio()` and the other legacy calls stay as-is; they resolve to aliases
     (section 11).
   - Any `effects.colorGrade({ exposure })` is left for PRD 03.
   - Scenes with neither an environment nor lights are reported as "now lit by the neutral environment
     only, with no shadows; add `lights.directional({ shadow: true })` for grounding".
3. **First-party content:**
   - Run the codemod over `apps/showcase-*`, `apps/aura-clash-showcase`, `templates/*`,
     `packages/create-aura3d/templates/*` and `examples/*`. Commit the result per app.
   - Per-game art direction (choosing a preset, a sun direction, removing point-light spam) is PRD 14
     work. This PRD only guarantees the A/B capture in section 16.
4. **Scene kits** (`index.ts:10152-10245`) and prompt plans switch from ambient+directional to
   `environments.preset(...)` + `lights.directional({ shadow: true })`. This is coordinated with PRD 13.
5. **Skills** (PRD 13 owns the text; this PRD supplies the facts):
   - `aura3d-core`, `aura3d-browser-game` and `aura3d-scene-authoring` teach environment preset + sun +
     optional ambient, and the units table.
   - `aura3d-threejs-migration` maps three intensities 1:1, because units now match, and maps
     `AmbientLight` and `HemisphereLight` 1:1.
6. **three-compat ledger** (`packages/three-compat`). Remove the approximation entries for point
   distance/decay, ambient scale, shadow intensity and env background, and add entries for anything
   not yet matched (VSM, `shadow.radius` semantics).

---

## 11. Backward compatibility

| Surface | 3.1 behaviour | Break? |
|---|---|---|
| `lights.ambient(...)` | Accepted. Adds `color·intensity·albedo/π` on top of IBL. | Visual change (intended). `legacy-3.0` restores it for one minor. |
| `lights.directional({ shadow: boolean })` | `true` → default `AuraDirectionalShadowOptions`. `false` → never casts. `undefined` → may be promoted by `autoSunShadow`. | No API break. Shadow intensity 1.0 is a visual change. |
| `lights.point/spot` with no distance or decay | Infinite range, decay 2. The default intensities change only when omitted. | Visual change. The codemod's `--preserve-range` option keeps the old range. |
| `lights.rect/softbox` | Real area light, no longer a spot proxy. The spot cone disappears. | Visual change. |
| `environments.studio/materialLab/productHero/metalStudio/glassStudio` | Aliases: `preset("studio")` with intensity 1, rotation 0. `nightCinematic` → `preset("night")`. `color` is still honoured as a radiance tint. Background defaults to **false** for aliases, so existing scenes keep their clear colour. | Visual change in reflections (intended). No API break. |
| `environments.hdri(...)` | Same options. Background defaults to **true**. `reflectionTexture` is still supported as a second probe. | Visual change: the sky appears. |
| `shadows.contact(...)` | Deprecated alias of `decals.blobShadow`. No longer counted as a "contact shadow" in diagnostics. | Diagnostics change. |
| `RendererShadowOptions` on direct `Renderer` users | Mapped: `strength` → `intensity` (the default changes 0.65 → 1.0), `cascadeCount` → `cascades.count`, `filterKernel` ignored with a warning. | Visual change. Removed in 3.2. |
| `diagnostics().renderer.shadows.mapType` | Replaced by `lighting.diagnostics().shadows[i].filter`. The old key stays one minor with the *derived* value. | Schema change. Evidence tools updated in PRD 12. |
| Scenes with no lights | Lit by the neutral environment only. No fallback rig and no shadow. | Visual change (intended). The lint warns. |
| `compatibility.source` with legacy `environmentLighting` procedural maps | Honoured only under `legacy-3.0`. Under `physical` it warns and the environment probe is used. | Aura Clash migration falls under PRD 09/14. |

Anything not listed keeps its current behaviour.

---

## 12. Dependencies on other PRDs

| PRD | Needed from it | Needed by it |
|---|---|---|
| 01 Rendering core / scene graph / color / HDR / PBR | RGBA16F scene target on every path; depth+normal prepass; real camera near/far/projection available to the renderer (removes the `{viewProjectionMatrix}`-only `CameraLike`); instanced `size` fix (E31); one forward pipeline (the lean fork and the silent fallback removed); renderer-track decision (6.0) | The lighting contract (6.1) and the shared shader chunks |
| 03 Postprocessing / AA / tone mapping | Exposure wiring; tone mapping moved out of material shaders; GTAO/AO as input to `SO` and `ao_d`; the SSR pass on the HDR chain; colour pyramid | HDR background radiance; un-tone-mapped lighting output; SSR composite rule (6.7) |
| 04 Materials / textures / glTF | DFG + multiscatter LUT (RG16F); removal of the red-paint and AO-on-direct heuristics; clustered binding on all variants; alpha cutoff/hash material fields for caster variants | IBL chunks, the env sampler fix, specular occlusion |
| 05 Asset pipeline | `aura3d environments bake` (HDR → KTX2 cube with RGB9E5 mips + SH JSON); CC0 HDRI admission (sunset/night/indoor); a KTX2 transcoder that is not hosted on unpkg | The preset format spec (6.2) |
| 06 Animation / skinning | A shared skinning/morph vertex chunk and a palette-texture contract | Skinned caster variants |
| 07 VFX / atmospherics | — | Environment probe and sun direction for volumetrics and fog colour; contact-shadow light index |
| 09 Shared game runtime | GameRenderPreset alignment (strength, IBL); Aura Clash compat source migration | Defaults any game kit inherits |
| 10 World building / environment systems | Sky systems that render into `environments.capture` | Environment capture API |
| 11 WebGPU / GPU architecture / tiers | Device tiering for `quality: "auto"`; UBO uniform architecture; GPU timer queries; WebGPU backend reality (gates 8.8) | Per-tier lighting cost data |
| 12 Visual benchmark + regression | Region-masked metrics, viewable image export (the research/22 Read failures), vision+human review workflow, baseline storage | Scenes and thresholds (section 16) |
| 13 Agent authoring / skills | Skill and lint rewrites | Units table, recommended recipe |
| 14 18-game rebuild | — | This PRD's defaults are the floor every rebuilt game starts from |
| 15 API / package consolidation | Final placement of `decals`, `probes` and `environments` in the public surface; lean fate | API shape |

---

## 13. Implementation phases

Each phase lands behind `lighting.model: "physical"` and keeps `legacy-3.0` green until Phase 8.

**Phase 0: Baseline and harness hardening (no engine change).**

- Capture the current 18 benchmark scenes and 18 games at the pinned SHA into
  `docs/project/aura3d-quality-rebuild/evidence/lighting-baseline/`.
- Add the region metrics from section 16.3 to `benchmarks/quality-rebuild/capture.mjs`.
- Add the "fixed-defaults" A/B capture switch to `tools/quality-rebuild-capture`.

*Exit:* the baseline report.json and side-by-sides are committed, and the region metrics reproduce
research/22's shadow numbers within ±10% (scene 15: about 9% vs about 50% shadow luma drop).

**Phase 1: Composition and defaults (the highest pixels-per-hour).**

- Make ambient additive with `/π`.
- Delete `authored-ambient`, the fallback rig, the category presets and the teal preset.
- Make the neutral environment (CPU-generated, uploaded RGBA16F, first version) the default.
- Fix the sampler default.
- Make shadow intensity 1.0.
- Add explicit caster rules (`autoSunShadow`; no point implicit caster).
- Honour `receiveShadow`.
- Fix the point/spot units, decay and distance.
- Route rect and softbox to the area integrator.
- Make the diagnostics observed.

*Exit:*

- 13-ibl-only shows no punctual hotspot and no shadow.
- 11-multiple-lights has no stray shadow.
- Scene 15 shadow-region luma drop is ≥ 40% (three ≈ 50%).
- The 06 sweep high-frequency energy is monotonic in roughness (16.3).
- Unit tests in 15.1 for composition and units pass on macos-14 CI.

**Phase 2: GPU PMREM, SH9, HDRI background, preset library.**

- `GPUPMREMGenerator`, `EnvironmentProbe`, `EnvironmentCache`, SH9.
- The background pass wired on root.
- Prebaked KTX2 presets for 5 names (depends on PRD 05's bake verb). Until then the presets are runtime
  PMREM'd from `.hdr`.
- Delete the CPU PMREM and the ExternalParity defaults.

*Exit:*

- 06 sweep, 09 and 13 meet their section 16 thresholds.
- The PMREM of a 1k HDRI takes ≤ 6 ms GPU on High (timer query) and causes no main-thread task over
  50 ms during environment load (Long Tasks API).
- The sky band in 09 and 13 has luma std ≥ 0.7× three's.

**Phase 3: Shadow caster variants and the hardware-compare filter.**

- `ShadowCasterVariants` (skin, morph, instancing, batch, alpha test/hash), with precompile at mount.
- The compare sampler and filter kernels by tier.
- World-space normal bias.
- Delete the old shadow factor functions.

*Exit:*

- 15-animation-skinning footprint IoU against three's shadow mask is ≥ 0.75.
- 16-instancing shadows cast per instance. Test with `castShadow` on in a variant of scene 16.
- An alpha-tested foliage card casts a cutout shadow (new unit/browser fixture).
- No acne or peter-panning in 12-shadows under human review.

**Phase 4: Stable CSM on root + multiple shadowed lights + GPU point shadows.**

- `DirectionalCascadeFitter` (sphere fit, texel snap, caster-extended near plane), per-fragment
  selection with blend.
- `ShadowAtlas` with spot and point tiles.
- Caster culling per light frustum from the full scene list.
- Delete `selectForwardShadowMap` and the readback path.

*Exit:*

- 12-shadows shows both shadow sets (16.3 metric).
- 17-large-environment strong-edge density is ≥ 0.8× three's.
- The shimmer metric passes (16.3).
- No `readPixels` call during a frame (instrumented device counter = 0).

**Phase 5: Contact shadows + reflection probes + irradiance volume + LTC area lights.**

*Exit:*

- 10-indoor table/cup shadow region drop is ≥ 0.7× three's.
- A new probe fixture scene (box room with a mirror floor and an emissive panel) shows a box-projected
  reflection aligned within 2 px of a three `CubeCamera` + PMREM reference.
- Irradiance volume: a red-wall fixture shows red bounce on a white sphere, with the hue angle within
  15° of the reference (bake produced by three `LightProbeGenerator` per cell).

**Phase 6: SSR integration (with PRD 03).**

*Exit:*

- A wet-floor fixture shows reflected emissive strips whose energy (sum of luma in the reflection
  region) is within 25% of the three `SSRPass` reference on the same HDR input.
- No reflection of tone-mapped values: a pixel test where an HDR emissive at 20 reflects at above 1.0
  pre-tonemap.

**Phase 7: Tiers, performance and mobile.**

- Tier wiring, measured budgets (section 17), the mobile device runs (section 19), and the Low-tier
  prebaked path.

*Exit:* every budget in section 17 is met on the named reference devices, or a waiver is signed by the
human reviewer with the measured number.

**Phase 8: Migration and deletion.**

- Run the codemod across first-party content.
- Make "physical" the default.
- Run the game A/B capture (16.2).
- Hand the skill facts to PRD 13.
- Delete the legacy path in 3.2.

*Exit:* section 21 is complete.

---

## 14. Task checklist

Legend: **[R]** own-renderer track only. **[R/T]** both tracks (under T the task becomes "configure the
three object accordingly and test"). Unit tests run with `pnpm exec vitest run <file>`. Browser specs
run remotely on GH Actions macos-14 (section 15).

### Phase 0
- [ ] [R/T] Add `regionMetrics` to `benchmarks/quality-rebuild/capture.mjs`. It computes per-scene masks defined in a new `benchmarks/quality-rebuild/shared/regions.ts`: shadow-receiver mask (from a three-side render with shadows on/off differenced at >8 luma), sky band (rows above the horizon given per scene), subject mask, specular-sphere masks for scene 06. It writes `report.json.scenes[i].regions`.
- [ ] [R/T] Add `--lighting-defaults=physical|legacy` to `tools/quality-rebuild-capture/capture-games.mjs`. It passes `?lighting=physical` to each game. Each game's `createAuraApp` call reads it through a shared helper `readLightingModelFromUrl()` added to `packages/engine/src/agent-api/RootRuntimeSupport.ts`.
- [ ] [R/T] Commit baseline captures to `docs/project/aura3d-quality-rebuild/evidence/lighting-baseline/` (JPEG side-by-sides plus slim report). Write the README with the GH run id.
- [ ] [R/T] Add a JPEG + PNG dual export in `benchmarks/quality-rebuild/capture.mjs`: 1280×720 8-bit sRGB JPEG at q90, so vision reviewers can open the images (research/22 reported empty Reads).
- [ ] [R/T] Per-game lighting inventory. `tools/quality-rebuild-capture/capture-games.mjs` writes each game's runtime `collectedLights` (kind, intensity, range, caster flag), environment preset and shadow options to `report.json.games[i].lighting`. This replaces the source-grep inventory in the 16.2 per-game table. Test: the report contains 18 entries, each with `lighting.lights.length > 0`.
- [ ] [R/T] Add per-game region masks to `tools/quality-rebuild-capture/games.json` (receiver floor, hero subject and, for Orbital Defense and Gravity Post, planet halves), so that the 16.2 metrics are computable.

### Phase 1: composition, defaults, units
- [ ] [R/T] Add `lighting?: AuraLightingOptions` to `createAuraApp` / `createGameApp` (`index.ts` ≈11129, 11818) and thread the `model` through the bridge. Legacy keeps the old code paths until Phase 8. Test: `model: "legacy-3.0"` produces a RenderSource deep-equal to the baseline for scene 01 (golden JSON in `tests/unit/engine/lighting-legacy-golden.test.ts`, a CPU-side RenderSource snapshot, not pixels).
- [ ] [R/T] Neutral environment v1. **These first three tasks gate every other Phase 1 task.** `packages/rendering/src/environment/RoomEnvironmentScene.ts` generates the room geometry and emissive panels as a port of three `RoomEnvironment.js` with its panel radiances (50, 50, 17, 43, 20, 100) and the MIT attribution in the file header. Phase 2 has not landed at this point, so the room is rendered on the GPU into a 6-face RGBA16F cube with the existing forward pass. It is read back once (a load-time readback, which section 17's steady-state rule allows) and prefiltered by the CPU FIS prefilter in a Worker (`packages/rendering/src/environment/workers/cpuPrefilter.ts`, with no average blend) and uploaded as an RGBA16F cube with mips. Test: the probe's mip-0 max radiance is ≥ 50 (HDR preserved), and SH L0 > 0.
- [ ] [R] Add the `EnvironmentProbe` interface (7.2) and the `RenderSource.environmentProbe`, `ambient` and `hemisphere` fields (`Renderer.ts:246-271`). Bind them in `ForwardPass.ts` under `model: "physical"` only. Test: a RenderSource with `environmentProbe` set and `environmentLighting` unset renders a non-black chrome sphere (browser, `lighting-quality-units.spec.ts`).
- [ ] [R/T] Delete the `authored-ambient` branch in `createProductionRuntimeEnvironment` (`packages/engine/src/agent-api/index.ts:12693-12707`). Return `{ ambient: { color, intensity } }` alongside the environment. Unit test `tests/unit/rendering/lighting-composition.test.ts`: a snapshot with `lights.ambient(0.5)` and no environment yields `environmentProbe.source === "neutral"`, `ambient.intensity === 0.5`, and specular IBL intensity > 0.
- [ ] [R/T] Make `environments.*` and `lights.ambient` additive (`index.ts:12638-12692`, `13211-13215`). Test: environment + ambient yields both terms in the `RenderSource`.
- [ ] [R/T] Delete the category preset selection (`index.ts:12708-12722`) and the gameplay/daylight/evening/inspection/exhibit/softbox cases in `ExternalParityRenderPreset.ts:560-700` used as defaults. Any remaining parity test that imports them is moved to `tests/fixtures/legacy-external-parity-presets.ts`, or the test is deleted with a note in the PR. Test: `rg '"gameplay"' packages/` returns 0 hits in `src`.
- [ ] [R] Implement the `ambient` / `hemisphere` uniforms (`u_ambientIrradiance`, `u_hemiSky`, `u_hemiGround`) in `ForwardPass.ts`. Replace `u_environmentColor` / `u_environmentIntensity` usage at `ShaderLibraryCore.ts:622-623` with `a3dIndirectDiffuseIrradiance` (8.1). Apply `kd*albedo/PI` at the use site. Unit test: CPU reference evaluation of a white Lambert plane under ambient 1.0 gives outgoing radiance `albedo/π` within 1e-4 (pixel readback in the browser spec `lighting-quality-units.spec.ts`).
- [ ] [R/T] Add `lights.hemisphere()` to `index.ts` lights (3063-3156) and the `AuraLightType` union (1542). Wire it into the RenderSource. Test: with the default direction, an up-facing normal receives `sky·I` and a down-facing normal receives `ground·I`. With `position: [1, 0, 0]`, a +X normal receives `sky·I`. The CPU mirror matches three r185 `getHemisphereLightIrradiance` within 1e-6.
- [ ] [R/T] Delete `createProductionRuntimeFallbackLights` (`index.ts:13363-13401`) and its call (`13159`). Test: a no-light scene has `collectedLights.length === 0`, the neutral env is bound, and there is no shadow map allocated (`diagnostics.shadows.length === 0`).
- [ ] [R] Change the `Sampler` default `minFilter` to `"linear-mipmap-linear"` (`packages/rendering/src/Sampler.ts:27`). In `WebGL2Device.ts` (min filter mapping near 4139-4155) and `LeanWebGL2Device.ts` (≈3602), downgrade to `LINEAR` when the texture has 1 level. Set the env binding explicitly to `linear-mipmap-linear` (`ExternalParityRenderPreset.ts:169` until it is deleted). Browser test: rough (0.8) and smooth (0.05) chrome spheres under the same env differ in high-frequency energy by ≥ 4×.
- [ ] [R/T] Replace `createProductionRuntimeShadowOptions` (`index.ts:12942-12974`) and `resolveProductionRuntimeShadowTuning` (`12986-13001`) with `resolveShadowSystemConfig(snapshot, descriptors, tier)`: intensity 1.0, size from the tier table, bias 0, normalBias auto. Delete the scene-radius size derivation (12949-12960). Unit test: the config contains no `strength < 1` for any category, and size is independent of parked node positions at y=-70.
- [ ] [R/T] Replace `resolveProductionShadowCasterIndex` (`index.ts:13172-13199`) with `selectShadowedLights(descriptors, { autoSunShadow, max })`. Rules: explicit `shadow: true` first; `autoSunShadow` promotes only directionals; point/spot/rect never implicit; respect `max`; return dropped names. Rewrite the existing unit tests (`rg resolveProductionShadowCasterIndex tests/`) to the new function, adding cases for "ambient + 10 points → no caster" and "sun + spot both `shadow: true` → 2 casters".
- [ ] [R] Make `GameRenderPreset.ts:344-347` strength 1.0. Remove the IBL-less top-down override at 420-434 (coordinate with PRD 09).
- [ ] [R] Remove the renderer default strength 0.65 in `ForwardPass.ts:913, 1048, 1172` and `WebGPUDevice.ts:2215, 2280, 2811`, replacing it with 1.0.
- [ ] [R/T] Honour `receiveShadow` by threading `node.receiveShadow` into `RenderItem` (new field `receiveShadow?: boolean` in `ForwardPass.ts` RenderItem, ≈24-48) and setting `u_receiveShadow`. Browser test: a plane with `receiveShadow: false` has a luma drop < 2% under a caster.
- [ ] [R/T] Point/spot units. Add `distance`, `decay` and `power` to `lights.point` (`index.ts:3084-3092`) and `decay`/`power` to `lights.spot`. Descriptors (`13233-13272`) carry `range = distance ?? 0`, `decay = decay ?? 2`, and `intensity = power ? power/(4π) (point) | power/π (spot) : intensity`. Delete `10 * productionRuntimeLightMaxScale`. Change the defaults to 8 cd and 30 cd. Replace the point descriptor's hard-coded `shadowRequested: false` (`index.ts:13245`) with `shadowRequested: node.shadow === true || typeof node.shadow === "object"` and `shadowDisabled: node.shadow === false`, matching spot. Unit test: `lights.point({ distance: 4, decay: 1, power: 400 })` yields a descriptor with `range === 4`, `decay === 1`, `intensity ≈ 400/(4π)` (1e-9), and `lights.point({ shadow: true })` yields `shadowRequested === true`.
- [ ] [R] Shader falloff: replace `ShaderLibraryCore.ts:732-735` and `ShaderLibrary.ts:3183-3186` with `a3dDistanceFalloff` (8.3). Pack `decay` into the light data. Add a range test before the BRDF. Unit test `tests/unit/rendering/light-units.test.ts`: CPU mirror of the GLSL formula matches three r185 `getDistanceAttenuation` for d ∈ {0.05, 0.3, 1, 5, 20} m and decay ∈ {0, 1, 2}, within 1e-6.
- [ ] [R] Raise the light cap to 32 by moving light data to the std140 `A3DLights` block (8.3, 6.10): `LightUniforms.ts:4` `MAX_DIRECT_LIGHTS`, the loop bound and the `min(int(u_lightCount), 16)` cap at `ShaderLibraryCore.ts:704-705`, plus the copies in `ShaderLibrary.ts`. Make clustering engage above 32 (`ForwardPass.ts:251-258`). Report `lightsDroppedByCap` in diagnostics. Test: every lighting program links on a device mock that reports `MAX_FRAGMENT_UNIFORM_VECTORS = 224` and `MAX_TEXTURE_IMAGE_UNITS = 16`. The spec `lighting-quality-units.spec.ts` asserts that a 32-point-light scene evaluates 32 lights (`lightsEvaluated === 32`).
- [ ] [R] Resource-limit budget (6.10): add a `resolveLightingSamplerBudget(programDefines, materialSamplerCount, deviceLimits)` pure function in `packages/rendering/src/shadows/ShadowSystem.ts` (or a sibling `LightingBudget.ts`) that applies the drop order and returns `droppedFeatures`. Unit test `lighting-budget.test.ts`: on 16 units, a High-tier material with 7 maps drops `irradiance-volume` first, then `probe-1`, and never exceeds 16.
- [ ] [R/T] Rect/softbox: emit `kind: "rect"` descriptors instead of spot proxies (`index.ts:13274-13296`), with `right`/`up` vectors and width/height. In the shader, `kind > 2.5` already routes to `a3dPbrRectAreaLight` (`ShaderLibraryCore.ts:717-724`). Browser test: a softbox over a plane produces a rectangular (not elliptical) highlight footprint, measured by the aspect ratio of the luma>50% region within 20% of width/height.
- [ ] [R/T] Diagnostics: replace `mapType: "pcf-soft"` (`index.ts:1829, 4614`) with filter names derived from compiled program defines. Delete the name-based contact shadow counting (`index.ts:4485-4487, 4533`) and the product-QA name check (`9317, 9337`), replacing it with `lighting.diagnostics().contactShadows.passExecuted`. Implement `AuraLightingDiagnostics` (7.1). Test: a scene with a primitive named "contact shadow footprint" reports `contactShadows.enabled === false`.
- [ ] [R/T] Lint: change the text at `index.ts:18256` per 7.3. Add a lint warning when `lights.ambient.intensity > 1` while an environment is present ("ambient above 1 flattens IBL").

### Phase 2: GPU PMREM, SH, background, presets
- [ ] [R] Implement `GPUPMREMGenerator` (7.2) in `packages/rendering/src/environment/GPUPMREMGenerator.ts` with the shaders in 8.7. Allocate the cube with `texStorage2D(TEXTURE_CUBE_MAP, mipCount, RGBA16F, F, F)`. Render per face per mip via FBO attachment of the cube face level. Require `EXT_color_buffer_float` (or `EXT_color_buffer_half_float`); otherwise fall back to the Worker CPU path. Unit test `gpu-pmrem.test.ts` (logic): `roughnessToLod`/`lodToRoughness` round-trip within 1e-6; mip count for F=256 is 5 (256→16).
- [ ] [R] Browser spec `tests/browser/lighting-quality-pmrem.spec.ts`: for `fixtures/environment-corpus/hdri/studio_small_08_1k.hdr`, read back each mip's mean and max radiance. Means stay within 5% of mip 0 (energy conservation). Max decreases monotonically. Mip N-1 (16 px) still has a top/bottom face luminance ratio ≥ 1.5 when the source has a bright top (directionality preserved, the inverse of the 0.82 blend bug).
- [ ] [R] PMREM parity against three r185 (same spec file). Render a mirror sphere in the three benchmark app with `PMREMGenerator.fromEquirectangular(studio_small_08_1k)` for roughness ∈ {0, 0.25, 0.5, 0.75, 1}, and the same sphere in Aura. Compare the mean RGB in a fixed reflection-direction window (the sphere's centre 10% disc and the 45° ring). Pass: each window's linear-luma mean is within 10% of three's, and the high-frequency energy ordering across roughness matches. The test fails today because of the 0.82 blend and the level-0-only sampler, which is its broken control.
- [ ] [R] Implement `SphericalHarmonics.ts`: CPU `projectCubeToSH9` (reference) and GPU `shProject.frag` (8.7). Unit test `sh9-projection.test.ts`: for a synthetic cube with radiance `max(0, y)`, the SH irradiance at n=+Y matches the analytic cosine-convolved value within 2%. For a constant radiance L, irradiance = πL within 1%.
- [ ] [R] Bind SH in all lighting programs (`u_envSH[7]`). Delete `diffuseEnvironmentLod = mipCount-1` paths (`ShaderLibraryCore.ts:636-638`; `ShaderLibrary.ts:368, 966, 1496, 2643-2644`). Browser test (13-ibl-only fixture): the white sphere's top-hemisphere mean has a B/R ratio ≥ 1.05 and the bottom-hemisphere ratio ≤ the top ratio (sky tint).
- [ ] [R] Implement `lighting_ibl.glsl.ts` (8.1) and include it in `ShaderLibraryCore.ts` lean PBR and all `ShaderLibrary.ts` lighting programs. Delete the procedural sky/horizon/specular-band code (`ShaderLibraryCore.ts:624-644`) and the `mix(1.1, 0.65)` / `mix(1.1, 0.85)` gains (`:650, :654`, plus copies). Delete `u_environmentMapTexture` (equirect) from lighting programs.
- [ ] [R/T] Implement `EnvironmentCache` (`packages/rendering/src/environment/EnvironmentCache.ts`) with `acquire`, `neutral` and `release`, ref-counted, keyed by `(url|preset, tier)`. The resident limit is 3 on Low, High and Ultra, and 2 on Medium when any resident probe is RGBA16F (section 17 memory derivation). Unit test: double acquire returns the same probe; release to 0 disposes after the LRU limit; on Medium, acquiring a third RGBA16F probe evicts the least recently used one.
- [ ] [R/T] Engine bridge: replace `upgradeProductionEnvironmentHdri` (`index.ts:14190-14245`) with an `EnvironmentCache.acquire` that swaps `environmentProbe` when ready. Delete the `lighting.intensity: 0.08` replacements (`PBRHDRPipeline.ts:261, 404`) and the `*1.1` specular gains (`:287, :429`). Test: an HDRI scene reports `environment.source: "hdri"` after resolve, and the neutral source before.
- [ ] [R/T] Background: in `createProductionRuntimeRendererInput` (`index.ts:13990-14006`), set `environmentBackground` when the active env has `background.visible`. Rewrite the `EnvironmentBackgroundPass` shader (`ShaderLibraryCore.ts:808-889`) per 8.7, outputting linear HDR. Update `tests/browser/environment-background.spec.ts`: scene 13 sky band luma std ≥ 0.7× three's; `scene().background("#123")` with `environments.preset("studio")` (alias default `background: false`) keeps the solid colour.
- [ ] [R/T] Add `environments.preset/neutral/none/capture` (7.1) to `index.ts` (4123-4190) and map the legacy aliases per section 11. Unit test: each alias yields `environment: "preset"` with the documented preset and `background: false`.
- [ ] [R/T] Preset assets: add `packages/environments/src/EnvironmentRegistry.ts` entries for the 5 presets, with URL, license (CC0) and source file. Until PRD 05's bake verb exists, serve `.hdr` and PMREM at runtime. Afterwards serve `<preset>.<tier>.ktx2` + `.sh9.json` from `public/aura-environments/`. Test: the registry validator checks every entry has a license and a SHA-256.
- [ ] [R] KTX2 cube upload: `packages/assets` KTX2 path supports `VK_FORMAT_E5B9G9R9_UFLOAT_PACK32` cube with mips → WebGL2 `RGB9_E5` (`texStorage2D(..., RGB9_E5)`), sampled with `linear-mipmap-linear`. Test: decoded texel equals the source within RGB9E5 precision (≤ 1/256 relative).
- [ ] [R] Delete `packages/rendering/src/production-runtime/environment/PMREMGenerator.ts` and its exports once no import remains (`rg "environment/PMREMGenerator"`). Delete the ExternalParity procedural bundle functions (`ExternalParityRenderPreset.ts:133-255`) if unused after the parity-test move.
- [ ] [R] Remove the in-shader ACES/sRGB (`a3dPbrEncodeOutput`, `ShaderLibraryCore.ts:582-593`) from the lighting programs once PRD 03 guarantees a post output pass on every path. Until then it stays behind `u_outputColorSpace`, with a comment linking PRD 03.

### Phase 3: caster variants, HW compare
- [ ] [R] Device counters (E33). Add `programCompileCount` and `readPixelsCalls` to `RenderDeviceDiagnostics` (`packages/rendering/src/RenderDevice.ts`). Increment them in `WebGL2Device.ts` and `LeanWebGL2Device.ts` at every `linkProgram` and `readPixels` call. Surface them in `lighting.diagnostics()`. Unit test (device mock): one program creation increments `programCompileCount` by 1, and one `readShadowFacePixels` call (still present until Phase 4) increments `readPixelsCalls`. **This task gates the precompile and no-readback tests below.**
- [ ] [R] Create `packages/rendering/src/shadows/ShadowCasterVariants.ts` with `resolveShadowCasterVariant(item)` reading `item.skinning`, `item.morphTargets`, `item.instanceTransforms`, batching flags and `item.material` alpha mode/cutoff. Unit test `shadow-caster-variants.test.ts`: a skinned item → `skinning: 4|8`; a static-batched item (from `SceneOptimization.ts:209-216`) → `batched: true, instanced: true`; a MASK material → `alphaTest: true`; BLEND + `castShadow: true` → `alphaHash: true`; BLEND default → excluded.
- [ ] [R] Create `shaders/chunks/shadow_caster.glsl.ts` (8.5), reusing the forward skinning/morph/instancing chunks (extract them from `ShaderLibrary.ts:565, 1091, 101` into shared chunks; coordinate with PRD 06). Register `aura3d/depth:<variantId>` programs.
- [ ] [R] Rewrite `DepthPass.drawCaster` (`DepthPass.ts:59-87`) to select the variant program, bind skinning palettes (same uniforms or texture as `ForwardPass.applySkinningUniforms`, `ForwardPass.ts:437`), bind morph weights, issue an instanced draw with `instanceCount`, and bind the base-color texture + cutoff for alpha variants. Browser test `tests/browser/lighting-quality-casters.spec.ts`:
  - (a) a skinned Soldier at Walk t=1.25 s has a shadow mask IoU ≥ 0.75 against three.
  - (b) a 3×3 static batch of boxes casts 9 shadows (connected components = 9).
  - (c) a 16-instance row casts 16.
  - (d) an alpha-tested leaf-card texture casts a shadow whose filled ratio equals the texture's opaque ratio ±10%.
- [ ] [R] Precompile caster variants at mount. Collect variant keys from initial render items in `Renderer` and compile with `KHR_parallel_shader_compile` polling. Diagnostics list `casterVariants`. Test: no shader compile occurs during frames 2–120 of a static scene (`programCompileCount` delta = 0).
- [ ] [R] WebGL2 compare sampler: add `compare?: "less-equal"` to `SamplerDescriptor` (`Sampler.ts`). In `WebGL2Device.ts` sampler creation, set `TEXTURE_COMPARE_MODE = COMPARE_REF_TO_TEXTURE`, `TEXTURE_COMPARE_FUNC = LEQUAL`, `LINEAR` min/mag. Bind the same depth texture on a second unit with a non-compare `NEAREST` sampler for PCSS. Unit test (device mock): sampler parameters are issued. Browser test: a hard-edge shadow with filter `"hard"` shows bilinear (2-texel) transition width, not 1-texel stair-steps.
- [ ] [R] Implement `ShadowFilterKernels.ts` (Castaño 5×5 weights, Vogel 16/32) and `shadow_receive.glsl.ts` (8.4). Delete `a3dForwardShadowFactor` / `a3dPointShadowFactor` (`ShaderLibraryCore.ts:494-581`) and copies in `ShaderLibrary.ts` (225-315, 822, 1352, 1840, 2530). Remove `A3D_PBR_NO_SPOT_SHADOW` (`ShaderLibrary.ts:2067, 2073, 2075` and the `#ifndef` guards at 2221, 2562, 3196). Test: `rg "A3D_PBR_NO_SPOT_SHADOW|u_shadowPcfSamples" packages/rendering/src` returns 0.
- [ ] [R] Remove the RGBA8 colour attachment from shadow targets (`ShadowPass.ts:165-171`, `WebGL2Device.ts:663-676`): a depth-only FBO with `drawBuffers([NONE])`. Test: shadow target memory reported in diagnostics drops by `4·size²` bytes.

### Phase 4: CSM on root, atlas, GPU point shadows
- [ ] [R] Pass a real camera to the renderer. The bridge (`index.ts:14006`) passes `{ viewMatrix, projectionMatrix, near, far, fov, aspect, position }`. `Renderer.resolveCamera` (≈2936-2975) accepts this `CameraLike` for CSM, which removes the `instanceof PerspectiveCamera` gate (`Renderer.ts:1387-1391`). Coordinated with PRD 01. Unit test: CSM runs with a plain-object camera.
- [ ] [R] Create `shadows/DirectionalCascadeFitter.ts` (7.2): practical splits, a bounding sphere per slice, texel snap (reuse `CascadedShadowMaps.ts:198-201`), and the near plane extended to the caster AABB. Unit test `cascade-fitter.test.ts`: (a) rotating the camera 10° in yaw does not change a cascade's radius (≤ 1e-5 relative); (b) translating the camera by 0.3 texel moves the snapped origin by 0 or 1 texel exactly; (c) a caster 50 m behind the camera along the light direction is inside the light depth range.
- [ ] [R] Create `shadows/ShadowSystem.ts` and `ShadowAtlas.ts` (7.2). Replace `Renderer.ts:1354-1603` with `ShadowSystem.update`. Allocate the cascade array as `texStorage3D(TEXTURE_2D_ARRAY, 1, DEPTH_COMPONENT24, S, S, C)`. Unit test `shadow-atlas.test.ts`: packing 2 spot + 1 point at High fills without overlap, and a re-allocation within 30 frames returns the same rects.
- [ ] [R] Caster culling from the full list. In `Renderer.ts` (623-625, 2208-2209), pass the pre-frustum-cull item list (after LOD) to `ShadowSystem` and cull per light frustum. Browser test: a tall pole behind the camera still casts into view (shadow pixels > 0 in the receiver region).
- [ ] [R] Delete `selectForwardShadowMap` (`ForwardPass.ts:298, 834-854`). Implement per-fragment cascade selection with blend (8.4). Browser test: on a 200 m ground plane with 4 cascades, shadows of identical poles at 5, 30, 80 and 140 m are all present.
- [ ] [R] Point lights: render 6 faces into atlas tiles with 90° fov plus a 1-texel guard. Delete `readShadowFacePixels` and the CPU blit (`Renderer.ts:1516-1603, 1915-1931`). Browser test: `readPixelsCalls` (Phase 3 counter) delta = 0 over 60 frames in a point-shadow scene; the shadow is continuous across cube-face seams (no gap > 1 px along a seam crossing). If the seam criterion fails, switch to the `samplerCubeShadow` fallback in 6.4 and rerun.
- [ ] [R] Fold `shadows/SpotShadowMaps.ts` into `ShadowAtlas` spot tiles and delete it (E34). Test: `rg "SpotShadowMaps" packages/rendering/src` returns 0, and the existing spot-shadow assertions in `createAuraApp-shadow-contract.spec.ts` still pass.
- [ ] [R/T] Public shadow options. `lights.directional/spot/point({ shadow: {...} })` per 7.1 flow into `ShadowedLightConfig`. Unit test: every field round-trips into the RenderSource config.
- [ ] [R/T] Shimmer test `tests/browser/lighting-quality-shadow-stability.spec.ts`: scene 17 with the camera dollied 0.01 m per frame for 60 frames. Mean absolute frame-to-frame difference inside a static shadow-edge mask is ≤ 1.5/255. Fails today (fit moves with culling).

### Phase 5: contact shadows, probes, area LTC
- [ ] [R] Create `passes/ContactShadowPass.ts` + `shaders/chunks/contact_shadow.glsl.ts` (8.6), consuming the PRD 01 linear depth. Add `effects.contactShadows()` (7.1). Browser test: a 0.2 m cube on a plane lit at a grazing sun has a contact darkening band ≥ 30% luma drop within 3 cm of the base with contact shadows on, < 5% off. Contact shadows do not darken the lit side (luma on the sun-facing face changes < 1%). Delete the ExternalParity `shadows/ContactShadows.ts` plan and its consumers (E34). Test: `rg "createExternalParityContactShadow" packages/*/src` returns 0.
- [ ] [R/T] Rename `shadows.contact` to `decals.blobShadow` (`index.ts:2366-2385`), keeping the alias with `@deprecated`. Update the 10 first-party call sites via the codemod.
- [ ] [R] Create `probes/ReflectionProbeSystem.ts` reusing the `ReflectionProbe.ts` capture code: HDR capture, `GPUPMREMGenerator.fromCube`, per-item 2-probe selection, box projection with the capture position (8.2). Add `probes.reflection()`. Browser test (new fixture `benchmarks/quality-rebuild/` scene `19-reflection-probe` added in coordination with PRD 12): the box-projected reflection of a wall stripe on a glossy floor aligns with the three reference within 2 px.
- [ ] [R] Create `probes/IrradianceVolume.ts`: per-cell 32 px capture → GPU SH L1 projection → 3 RGBA16F 3D textures (one per colour channel, 6.6), trilinear, with normal offset. Add `probes.irradianceVolume()`. Browser test: red-wall bounce hue on a white sphere is within 15° of the reference.
- [ ] [R] LTC area lights on High/Ultra: add the LTC LUTs (2× 64×64 RGBA16F, from three `RectAreaLightTexturesLib.js`, MIT notice). Use the Gauss–Legendre integrator on Low/Medium. Unit test: LUT checksums; the integrator matches LTC within 10% total energy on a reference plane.

### Phase 6: SSR (with PRD 03)
- [ ] [R] Pass the real camera near/far to SSR (`WebGL2Device.ts:865`); delete the `{ near: 0.1, far: 1000 }` literal. Move SSR before tone mapping on RGBA16F (PRD 03 owns the chain order). Composite per 6.7 using hit confidence, replacing `L_spec` in a full-screen resolve that reads per-pixel `F·DFG·SO` from a G-buffer-lite target (roughness + F0 packed RG8 from the prepass, PRD 01). Browser test: HDR emissive 20 reflects above 1.0 pre-tonemap; reflection energy within 25% of three `SSRPass` on the wet-floor fixture.

### Phase 7: tiers, perf, mobile
- [ ] [R/T] Implement `resolveLightingTier(device)` in `packages/engine/src/agent-api/RootRuntimeSupport.ts`, consuming PRD 11 tiering, with `lighting.quality` overriding. Apply the 6.8 table. Unit test: each tier yields exactly the 6.8 values.
- [ ] [R/T] Add GPU timer-query spans (`EXT_disjoint_timer_query_webgl2`): `pmrem`, `shadow.cascade[i]`, `shadow.local`, `contactShadow`, `background`, `forward`, `ssr`. Expose them in `lighting.diagnostics()`. Record them in the benchmark report.
- [ ] [R/T] Run the section 17 budget suite on the reference devices (section 19). Commit `docs/project/aura3d-quality-rebuild/evidence/lighting-perf/<device>.json`.

### Phase 8: migration
- [ ] [R/T] Implement `aura3d migrate lighting` in `packages/aura3d-cli/src` per section 10.2, with fixtures and tests in `packages/aura3d-cli/tests/migrate-lighting.test.ts` (input/expected file pairs for each rewrite rule).
- [ ] [R/T] Run the codemod on `apps/showcase-*`, `apps/aura-clash-showcase`, `templates/*`, `packages/create-aura3d/templates/*` and `examples/*`. One commit per app. CI capture of each app before and after.
- [ ] [R/T] Update scene kits (`index.ts:10152-10245`) to `environments.preset(...)` + `lights.directional({ shadow: true })` and drop ambient.
- [ ] [R/T] Hand the units table, recipe and pitfalls to PRD 13 for `packages/create-aura3d/skills/{aura3d-core,aura3d-browser-game,aura3d-scene-authoring,aura3d-materials-environments,aura3d-threejs-migration}/SKILL.md` and the `packages/aura3d-cli/skills` mirrors.
- [ ] [R/T] Flip the default to `"physical"`. In 3.2, delete the `legacy-3.0` paths and every symbol in 7.3. Test: `rg "authored-ambient|createProductionRuntimeFallbackLights|selectForwardShadowMap|readShadowFacePixels|wideLobeBlend" packages/` returns 0.
- [ ] [R] Delete the dead `packages/rendering/src/shaders/pbr-direct.frag.glsl` (shared with PRD 01; whichever lands first).

---

## 15. Test requirements

### 15.1 Unit tests (vitest, `tests/unit/rendering/` and `tests/unit/engine/`)

These are light enough to run locally per policy, and they run in CI on every PR:

- `lighting-composition.test.ts`: every combination of {none, ambient, hemisphere, env node, hdri,
  none()} × {no lights, sun, sun+spot} produces the expected RenderSource terms. No term zeroes
  another.
- `light-units.test.ts`: falloff parity with three r185, the power→cd conversion, range culling.
- `gpu-pmrem.test.ts`: LOD mapping, mip-count math, cache keys.
- `sh9-projection.test.ts`: analytic SH cases.
- `shadow-caster-variants.test.ts`, `cascade-fitter.test.ts`, `shadow-atlas.test.ts`.
- `select-shadowed-lights.test.ts`: caster rules.
- `lighting-diagnostics.test.ts`: diagnostics are derived from observed device state (mock device),
  never from names.
- `lighting-budget.test.ts`: the 6.10 sampler and uniform budget, including the drop order.
- `lighting-legacy-golden.test.ts`: `legacy-3.0` RenderSource unchanged.

### 15.2 Browser tests (Playwright)

Browser tests run **remotely only**: GH Actions macos-14 (ANGLE Metal), with the
`.github/workflows/lighting-quality.yml` job modelled on `quality-rebuild-capture.yml`, which already
pins Chromium and the ANGLE flags. They never run locally (the policy forbids local browser
automation), and they never run on SwiftShader.

- New: `tests/browser/lighting-quality-{units,pmrem,ibl,background,casters,shadow-stability,csm,atlas,contact,probes,ssr}.spec.ts`.
- Updated: `createAuraApp-shadow-contract.spec.ts`, `environment-background.spec.ts`,
  `production-runtime-hdr-ibl.spec.ts`, `external-parity-shadow-quality.spec.ts`,
  `external-parity-shadow-cascade-evidence.spec.ts`, `root-ibl-b3-harness`.
- Each spec asserts **pixel measurements** (region luma, IoU, energy, monotonicity) against thresholds
  or against a three r185 render of the same fixture. Allocation counts and labels never count.
- Each spec includes a **broken-control** case (research/14 §7): it must fail when the feature is
  disabled. For example, `shadow.intensity: 0` must fail the grounding assertion, and
  `environments.none()` must fail the IBL assertion.
- The benchmark job (`benchmarks/quality-rebuild/ci.sh`) runs per PR touching `packages/rendering/**`
  or the lighting paths in `packages/engine/src/agent-api/**`. The 18-game capture runs nightly and on
  PRs labelled `lighting`.

### 15.3 Performance tests

`tests/performance/lighting-tiers.spec.ts` runs per tier on the reference devices (section 19) via the
remote device runs. It records the timer-query spans from Phase 7 and fails on budget overrun beyond
10%. The GH macos-14 paravirtual GPU is **not** a performance reference (games run 0.5–60 fps there,
evidence/games/report.slim.json). It is used only for regressions relative to the baseline on the same
runner: a delta above 15% fails.

---

## 16. Visual acceptance tests

Every acceptance run produces Aura and three r185 side-by-sides from `benchmarks/quality-rebuild`
(same `SceneSpec`, `shared/scenes.ts`) and game captures from `tools/quality-rebuild-capture`. Both are
judged by:

1. **Region metrics** (16.3), which are automated and must pass.
2. **A vision model** using the research/23 rubric (image descriptions, a differences table with
   classification, scores, and fairness notes). The images must be viewable JPEGs (Phase 0 task); a
   judgment produced without viewing the image is invalid.
3. **A named human reviewer**, who signs `docs/project/aura3d-quality-rebuild/evidence/lighting-acceptance/<run-id>/REVIEW.md`
   with per-scene pass/fail. A scene passes only if both (2) and (3) pass. Disagreement goes to a
   second human reviewer.

### 16.1 Benchmark scenes (reference: three r185 render of the same spec)

Score thresholds use the research/23 vision scale. The "major" lighting differences listed in
research/23 must be reclassified as `equivalent` or `minor` by both reviewers.

| Scene | Today Aura / three (research/23) | Required Aura score | Criterion judged | Must-disappear differences |
|---|---|---|---|---|
| 06-metal-roughness-sweep | 4 / 7 | ≥ 6.5 | Smooth, monotonic specular blur; r=1 metal shows a top-to-bottom gradient | "blocky mid-roughness", "dead roughness-1 end" (Fresnel rim vs roughness is shared with PRD 04) |
| 09-outdoor-environment | 3.5 / 5.5 | ≥ 5.0 | HDRI sky visible; sun key-to-fill ratio; shadow contrast; specular sheen | flat sky, washed-out shadows, no specular, horizon shadow streaks |
| 10-indoor-environment | 3.5 / 4.5 | ≥ 4.5 | Table/cup spot shadow crisp; ceiling hotspots reach the ACES shoulder | "spot shadow effectively failing", dim hotspots |
| 11-multiple-lights | 5 / 5 | ≥ 5.0 (no regression) | Falloff and pools equivalent; no unrequested shadow | none may be added |
| 12-shadows | 3.5 / 5.5 | ≥ 5.0 | Both shadow sets present; full-strength primary shadows; contact definition | second light shadows absent, washed-out primary shadows (the cylinder cap is PRD 01) |
| 13-ibl-only | 3.5 / 6 | ≥ 5.5 | HDRI background; sky-tinted diffuse on white; roughness-correct gold; no punctual hotspot or shadow | flat sky, flat diffuse, stray shadows (faceting is PRD 01, AA is PRD 03) |
| 15-animation-skinning | 4.5 / 5.5 | ≥ 5.0 | Character shadows match the animated pose and darkness | "mushy shadows that undermine grounding" |
| 17-large-environment | 3.0 / 4.5 | ≥ 4.5 | Crisp CSM shadows over the full depth; lit/shaded face separation | "no visible shadows, weak directional lighting" |
| 18-game-scene | 3.5 / 5 | ≥ 4.5 | Player grounding shadow; no shadow streak artifact | missing grounding shadow, shadow streak (bloom is PRD 03) |
| 02-pbr-product, 08-skinned-character | 3.5 / 6, 3.5 / 5 | lighting-attributed differences reclassified `equivalent`/`minor` | grounding shadow present | "shadows essentially missing", "missing character shadow" |
| 16-instancing (with a shadowed-sun variant `16b-instancing-shadowed` added to `shared/scenes.ts`) | 2.5 / 4.5 | geometry fix is PRD 01; no score gate here | one cast shadow per instance: shadow connected-component count in the receiver mask equals the instance count, and is within ±1 of three's count | "instances cast no shadow" (in 16b) |
| 20-no-lights (new in `shared/scenes.ts`: scene 02's product with no lights and no environment; the three side uses `scene.environment = pmrem.fromScene(new RoomEnvironment())`) | n/a (new) | no score gate | subject mean linear luma within ±25% of three's; unrequested shadow pixels ≤ 0.1%; top/bottom luma ratio on the subject ≥ 0.8× three's (directional neutral light, not a flat wash) | "flat", "unlit", "black" |

### 16.2 Games (reference: research/21 rubric; target bar: a well-built modern three.js browser game)

Capture: `tools/quality-rebuild-capture` on GH Actions macos-14, contact and mid frames as in the
existing evidence/games set, run twice: (a) the shipped game with `?lighting=physical` and the codemod
applied but **no art changes**, and (b) the baseline.

**PRD 02 floor (defaults only).** Judged on research/21 categories `lighting`, `shadows`,
`ambient_lighting` and `ibl_reflections`:

- `shadows` ≥ 3 in at least 14 of 18 games. Today 17 of 18 are ≤ 2.5.
- `ibl_reflections` ≥ 3 in at least 14 of 18 games. Today 18 of 18 are ≤ 3, and 10 are ≤ 1.
- No game regresses by more than 0.5 in any of the 26 research/21 categories. A regression is a
  failure even when lighting improves (for example, neon games blowing out from added IBL).
- Orbital Defense and Gravity Post (shadows 0 and 0.5, no terminator) already author a directional
  light (`apps/showcase-orbital-defense/src/main.ts:95`, `apps/showcase-gravity-post/src/main.ts:1195`),
  so `autoSunShadow` promotes it with no code change. They must show a measurable day/night
  terminator on the largest planet: the mean linear luma of the sun-facing half of the planet disc is
  ≥ 3× the mean of the far half (region masks added to `games.json`). If a planet uses an unlit or
  emissive-only material, so that no lighting change can produce a terminator, the game is recorded as
  "PRD 14 art scope" in REVIEW.md and is excluded from that check only. It is not excluded from the
  14-of-18 counts.

**Per-game expected impact of the defaults** (inventory from `rg` over each `apps/<game>/src` at
`c08d8acb`; today's scores from `_sections/B-game-scorecard.md`). Every game authors `lights.ambient`,
so every game except Turbo Drift and Siege Golf moves from zero IBL to the neutral environment. The
column "PRD 02 risk" names the specific default change that is most likely to cause a 16.2 regression
in that game, so the A/B reviewer checks it first.

| Game | Light / Shad / IBL today | Authored lights (approx. call count) | Shadow source after PRD 02 | Expected gain | PRD 02 risk to check in A/B |
|---|---|---|---|---|---|
| aura-clash-showcase | 3 / 2 / 2 | ambient, 1 dir, 2 point, 1 spot; compat RenderSource | auto sun; skinned casters (Phase 3) | real fighter shadows replace foot decals | compat source ignored under `physical` (11); 0.38 → 1.0 strength |
| blockfall-reactor | 4 / 1 / 3 | ambient, 1 dir, 5 point | auto sun; instanced block casters | block grounding, env reflections on glossy blocks | neon emissives plus added IBL lift the black floor |
| skyline-runner | 4 / 2 / 1 | ambient, 1 dir, 3 point, `lights.studio` | auto sun (studio key may compete: brightest directional wins) | snow-level sun shadows | `lights.studio` plus act rigs: several directionals stack |
| turbo-drift-circuit | 3.5 / 2.5 / 2.5 | ambient, 2 dir, 5 point, `environments.studio` | auto sun with CSM over the 500-unit ground | the car's shadow stops being sub-texel; instanced scenery casts | the studio alias now draws no background, which is unchanged; check the night-section point falloff |
| siege-golf | 4.5 / 4.5 / 1.5 | ambient, 3 dir (1 `shadow: true`), 4 point, `environments.studio` | explicit sun, CSM | fence banding fixed; reflections | must not regress its 4.5 shadows (CSM sphere fit softness) |
| aurora-lander | 2.5 / 1 / 1 | ambient, 3 dir (1 `shadow: true`), 2 point | explicit sun | lander-to-ground shadow | ground rarely on screen, so the shadows score may not move |
| neon-swarm | 3 / 2 / 1 | ambient, 2 dir, 7 point | auto sun; instanced swarm casters | swarm shadows | added IBL on a black arena; 7 points become infinite-range |
| gravity-post | 2 / 0.5 / 1 | ambient, 2 dir, 7 point | auto sun | terminator (see above) | point lights near geometry become hotter (1/d², 0.01 clamp) |
| courier-rush | 3 / 1 / 1 | ambient, 2 dir (1 `shadow: true`), ≈21 point | explicit sun | wet asphalt and clearcoat IBL (was black) | 21 points: uniform path is now 32, so check `lightsDroppedByCap`; blow-out from many infinite-range points |
| pulse-tunnel | 3 / 1 / 3 | ambient, 3 dir, ≈14 point | auto sun | tunnel grounding | 14 infinite-range points over-brighten; bloom interaction (PRD 03) |
| mech-hangar | 3.5 / 2 / 2.5 | ambient, 3 dir, 6 point | auto sun | mech cast shadows; probe-ready interior | broad spot wash already flat; check that ambient /π does not make it murkier |
| vault-breakers | 2 / 1 / 0 | ambient, 3 dir, 5 point | auto sun | first IBL in the game | 60 fps baseline: check the FPS guard |
| rooftop-buckets | 5 / 2 / 2 | ambient, 3 dir, 6 point, 2 rect/softbox | auto sun | rect lights become true area lights | softbox spot-proxy cones disappear (11), so check the court fill |
| gallery-shift | 4 / 2 / 1 | 2 ambient, 4 dir (1 `shadow: true`), ≈15 point, 1 spot, 4 rect, 2 `shadows.contact` | explicit; lighthouse adds spot shadows | lighthouse game (16.2) | blob decals are no longer counted as contact shadows |
| deep-recovery | 2.5 / 1 / 1 | ambient, 2 dir, ≈15 point, 1 spot (`shadow: true`) | explicit spot plus auto sun (2 casters) | underwater grounding | already 0.5–3.6 fps: a second caster can breach the 0.85× FPS guard, so `maxShadowedLights` may need to be 1 |
| patrol-wing | 3 / 2 / 1 | ambient, **no directional**, 3 point, 1 spot (`shadow: true`) | explicit spot only (no auto sun) | aircraft spot shadow | "sun warm catch" is a point light at (20, 24, 30): with decay 2 it is about 43 m from the origin and nearly vanishes. The codemod report must flag it |
| bank-shot | 3 / 2 / 2 | ambient, 2 dir, 6 point, 1 rect | auto sun | ball shadows on felt | coloured point hotspots get stronger near the rails |
| orbital-defense | 1.5 / 0 / 0 | ambient, 1 dir, 2 point | auto sun | terminator (see above) | none beyond the terminator rule |

The "approx. call count" column counts `lights.<kind>(` occurrences in source, including branches
that may not mount together. Phase 0 replaces it with the runtime `collectedLights` dump per game.

**Lighthouse games.** These demonstrate the PRD 02 recipe with a PRD 14 art pass limited to lighting
nodes, and must reach `lighting` ≥ 6, `shadows` ≥ 6 and `ibl_reflections` ≥ 5:

| Game | Lighting pass | Today: lighting / shadows / ibl_reflections |
|---|---|---|
| `showcase-siege-golf` | outdoor preset + sun with stable CSM; checks the fence shadow banding | 4.5 / 4.5 / 1.5 |
| `showcase-gallery-shift` | indoor preset + reflection probes + spot shadows + irradiance volume | 4 / 2 / 1 |
| `aura-clash-showcase` | night/studio preset + skinned caster shadows replacing foot decals | 3 / 2 / 2 |

The final "competitive with modern three.js" gate per game belongs to PRD 14. PRD 02 cannot claim it.

### 16.3 Automated region metrics (must pass before human review)

These metrics are computed by the Phase 0 `regionMetrics`, with three r185 as the reference.

| Metric | Scenes | Threshold |
|---|---|---|
| Shadow-receiver luma drop `1 − mean(shadowed)/mean(lit)` | 01, 08, 12, 15, 17, 18 | within ±20% (relative) of three's drop. Scene 15: three ≈ 50%, so Aura must be 40–60% |
| Second-caster coverage: count of shadow pixels in the spot-only shadow mask | 12 | ≥ 0.7× three |
| Shadow mask IoU (character) | 08, 15 | ≥ 0.75 |
| Strong-edge density (gradient > 20) in the building band | 17 | ≥ 0.8× three (today ≈ 0.53×) |
| Sky-band luma std | 09, 13 | ≥ 0.7× three (today Aura std 0.0 and 3.8 vs 11.5 and 12.9) |
| Specular high-frequency energy per sphere | 06 | strictly decreasing with roughness for metals; r=1 metal vertical luma gradient ≥ 0.5× three |
| Diffuse sky tint, white sphere top-hemisphere B/R | 13 | ≥ 0.9× three's ratio |
| Unrequested shadow pixels (spec has no shadow): pixels whose luma drops by > 8/255 between an Aura render and the same Aura render with `shadow.intensity` forced to 0 on every light | 11, 13, 14 | ≤ 0.1% of frame |
| Mean frame-to-frame diff in static shadow-edge mask, 60-frame dolly | 17 | ≤ 1.5/255 |
| Clipping fraction near practical lights | 10 | within ±50% of three's (three 0.73%, Aura 0% today) |

Global SSIM, PSNR and MAD are recorded but are **never** acceptance criteria; research/22 shows they
overstate parity on every lighting scene.

---

## 17. Performance budgets

Budgets are for **lighting-owned work only**: environment, shadows, contact shadows, background,
probes, SSR composite and the light-loop ALU increment over the 3.0 forward shader. Each is measured by
GPU timer queries on the section 19 reference devices at the tier's default resolution. CPU budgets
are per frame on the main thread. Bundle is gzip of the root `.` entry, measured by the existing size
check (PRD 15). The memory column counts lighting-owned GPU resources.

| Tier | Resolution × DPR cap | GPU ms (total lighting) | of which shadows | contact | background | SSR | CPU ms | GPU memory | Env download | Load-time GPU work | Bundle delta |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Low (mobile mid, iGPU) | 1280×720 × 1.0 | ≤ 2.5 | ≤ 1.0 | off | ≤ 0.15 | off | ≤ 0.5 | ≤ 12 MB | ≤ 0.4 MB per preset | 0 ms (prebaked) | ≤ +15 KB gz (shared) |
| Medium | 1920×1080 × 1.0 | ≤ 4.0 | ≤ 1.8 | ≤ 0.4 | ≤ 0.2 | off | ≤ 0.8 | ≤ 50 MB | ≤ 1.5 MB | ≤ 10 ms once (user HDRI PMREM) | ≤ +15 KB gz (shared) |
| High (M1 / RTX 3060-class) | 1920×1080 × 1.5 | ≤ 6.5 | ≤ 3.0 | ≤ 0.6 | ≤ 0.3 | ≤ 1.5 (half-res) | ≤ 1.2 | ≤ 130 MB | ≤ 1.5 MB, plus 8 MB background (lazy) | ≤ 15 ms once per HDRI; probes ≤ 10 ms each (`once`) | ≤ +15 KB gz (shared), plus LTC LUT 64 KB fetched lazily |
| Ultra | 2560×1440 × 2.0 | ≤ 10.0 | ≤ 4.5 (PCSS) | ≤ 0.8 | ≤ 0.4 | ≤ 2.5 | ≤ 1.5 | ≤ 220 MB | ≤ 6 MB | ≤ 40 ms once (512 PMREM) | same as High |

Memory is derived from 6.8, 6.9 and 6.10. Depth formats count 4 B per texel. A 256 cube with 5 mips
is 2.1 MB as RGB9E5 (prebaked presets) and 4.2 MB as RGBA16F (runtime GPU PMREM of user HDRIs or
captures):

- Medium: 3 resident 256 environment probes (6.3 MB as RGB9E5; 12.6 MB if all three are runtime
  RGBA16F), 2×1536² cascades (18.9 MB), 2048² atlas (16.8 MB), contact mask (2 MB) and 2 reflection
  probes at 128 RGBA16F (2.1 MB). That totals 46.1 MB, or 52.4 MB in the worst case. The Medium
  budget is therefore **≤ 50 MB with prebaked presets**. When a user HDRI is resident,
  `EnvironmentCache` keeps at most 2 probes on Medium, giving 4.2 + 2.1 = 6.3 MB.
- High: environment probes (6.3 MB), 2k RGB9E5 background (8.4 MB), 3×2048² cascades (50.3 MB),
  4096×2048 atlas (33.5 MB), 4 probes at 128 RGBA16F (4.2 MB), contact mask (2 MB), SSR pyramid
  (22 MB). That totals 126.7 MB, inside 130 MB under the same 2-probe rule for user HDRIs.
- Low: one 128 RGB9E5 cube (0.5 MB) plus 1×1024² cascade (4.2 MB), 4.7 MB in total.

**Measurement method where timer queries are missing.** `EXT_disjoint_timer_query_webgl2` is not
exposed by Safari (macOS or iOS), is disabled by default in Firefox, and is absent on many Android
drivers. On those devices the GPU columns are measured by *toggle deltas*:

1. Render the scene for 600 frames with the feature on and 600 with it off, using the `?a3dLighting=`
   kill switches (22).
2. Use the median `requestAnimationFrame` interval at an uncapped workload, with the resolution
   raised until the frame is GPU-bound (frame time ≥ 20 ms with every feature off).
3. The budget figure is the median difference.

The method is recorded per number in `lighting-perf/<device>.json` as `"timer-query"` or
`"toggle-delta"`.

Rules:

- No frame may contain a main-thread task over 50 ms caused by lighting (Long Tasks API), including
  environment swap and probe capture.
- No shader compile may happen after the first 2 frames for a static scene (variant precompile).
- No GPU→CPU readback during steady-state frames (instrumented counter = 0).
- **Mobile.** At 10 minutes of a thermal soak on the reference devices, the Low-tier budgets hold
  within 20%.
- **Regression guard on the existing games.** On the same macos-14 runner, games' median FPS with
  `?lighting=physical` is ≥ 0.85× the baseline in report.slim.json. Several games already run at
  5–15 fps there, and Deep Recovery at 0.5–3.6 fps. A lighting PR must not be the reason a game gets
  slower. Root-causing the existing slowness is PRD 11.

---

## 18. Browser coverage

| Browser / engine | Where it runs | Required |
|---|---|---|
| Chrome stable (ANGLE Metal) | GH Actions macos-14 (`quality-rebuild-capture.yml`, `lighting-quality.yml`) | All unit + browser specs, benchmark, game captures |
| Chrome stable (ANGLE D3D11) | Remote GPU Windows VM (Azure NV-class through `az-auraone-gurbaksh` per the funding policy, provisioned by `setup-auraone-shared-cloud-tools.sh`). GH windows runners have no GPU, and SwiftShader is not acceptable | Browser specs + benchmark, nightly |
| Edge stable | Same Windows VM | Smoke: benchmark scenes 12, 13, 17 |
| Firefox stable | GH Actions macos-14 | Browser specs. Benchmark scenes 06, 09, 12, 13, 15, 17 |
| Safari / WebKit | Playwright WebKit on macos-14 (CI), plus real Safari 17+ on macOS through the remote device farm (section 19) for sign-off | Browser specs. Benchmark subset as for Firefox |
| WebGPU (Chrome) | Only after PRD 11 declares the WebGPU backend real | WGSL paths (8.8) behind a flag. Not an acceptance requirement for this PRD |

Required WebGL2 capabilities and fallbacks:

- `EXT_color_buffer_float` or `EXT_color_buffer_half_float` (GPU PMREM, RGBA16F scene target). Without
  it: prebaked KTX2 presets plus the Worker CPU prefilter for user HDRIs, and the lighting tier is
  capped at Low.
- RGBA16F filtering, which is core in WebGL2.
- Depth compare samplers, which are core in WebGL2.
- `KHR_parallel_shader_compile` (optional; without it, compile synchronously during the loading screen).
- `EXT_disjoint_timer_query_webgl2` (optional; absent on Safari, off by default in Firefox, and absent
  on many Android drivers. Budgets there use the section 17 toggle-delta method).
- `EXT_texture_filter_anisotropic`, owned by PRD 04.

Every fallback is reported in `lighting.diagnostics()` and is visible in the capture report.

---

## 19. Mobile coverage

No mobile device has ever been tested (research/18 §2). This PRD requires real devices. Emulated
viewports in desktop Chromium do not count. The device runs are remote: AWS Device Farm (or an
equivalent) provisioned through `/Users/gurbakshchahal/AuraOne/scripts/setup-auraone-shared-aws.sh`
under the `auraone-production-operator` profile, with resources tagged and torn down after each run.

| Class | Reference devices | Browser | Tier expected | Must pass |
|---|---|---|---|---|
| iOS high | iPhone 13 / 14 (A15) | Safari 17+ | Medium | Budgets; scenes 09, 12, 13, 15, 18; 3 lighthouse games |
| iOS mid | iPhone 11 (A13) | Safari 16.4+ | Low | Low budgets; no float-render fallback crash; scenes 12, 13, 18 |
| Android high | Pixel 8 (Mali-G715) or Galaxy S23 (Adreno 740) | Chrome stable | Medium | Same as iOS high |
| Android mid | Galaxy A54 (Mali-G68) or Pixel 6a (Mali-G78) | Chrome stable | Low | Same as iOS mid |

Mobile-specific requirements:

- Low tier uses prebaked presets with no runtime PMREM, 1 cascade, the hardware 1-tap filter, no
  contact shadows, no SSR, no realtime probes, and the Gauss–Legendre area-light integrator.
- On a context loss during a soak, the environment and shadow resources are recreated without a black
  frame longer than 1 s.
- Memory: total lighting GPU memory is ≤ 12 MB at Low. Each preset download is ≤ 0.4 MB at Low.

---

## 20. Screenshots and evidence required

All evidence is committed under `docs/project/aura3d-quality-rebuild/evidence/` with the GH run id and
the SHA:

1. `lighting-baseline/` (Phase 0): 18 benchmark side-by-sides (JPEG), 18×2 game frames, region-metric
   JSON.
2. `lighting-acceptance/<run-id>/`:
   - 18 benchmark side-by-sides with diff images.
   - Region-metric JSON.
   - Vision-model judgments in the research/23 format, one file per scene.
   - Human `REVIEW.md`.
   - Game A/B pairs (contact + mid, baseline vs physical) for all 18, plus the 3 lighthouse games.
   - The research/21-format scorecards for the lighting categories.
3. `lighting-acceptance/<run-id>/broken-controls/`: the same captures with `shadow.intensity: 0`,
   `environments.none()` and `background: false`, proving the metrics detect the absence.
4. `lighting-perf/<device>.json` for each section 19 device, plus macos-14 runner deltas.
5. A shadow-stability GIF or MP4 (60 frames) for scene 17 and Siege Golf, before and after.
6. Fixture renders for the probes (box-projection fixture, red-wall bounce) and the contact-shadow
   fixture, against their three references.
7. `lighting.diagnostics()` JSON dumps for each benchmark scene, showing observed values (filter,
   `shBound`, `backgroundDrawn`, caster variants, `readPixelsCalls: 0`).

Evidence produced from review-mode URLs (`?capture=review`) is not acceptable for the game criteria.
Game evidence must come from the shipped lane (research/18 Q9).

---

## 21. Completion criteria

All of the following must hold:

1. Every task in section 14 is checked, with its named test merged and green on GH Actions macos-14.
2. Section 16.3 region metrics pass for every listed scene on Chrome/macos-14, and for the subset on
   Firefox, WebKit and Windows Chrome.
3. Section 16.1 scores are met, and the must-disappear differences are reclassified, by both the
   vision model and the human reviewer.
4. Section 16.2 floor is met for the 18 games, and lighthouse thresholds for the 3 lighthouse games.
5. Section 17 budgets are met on the section 19 devices, or a signed waiver records the measured
   numbers.
6. `rg` deletion checks return 0:

   ```
   authored-ambient|createProductionRuntimeFallbackLights|selectForwardShadowMap|readShadowFacePixels|wideLobeBlend|A3D_PBR_NO_SPOT_SHADOW|"pcf-soft"|includes\("contact shadow"\)|SpotShadowMaps|createExternalParityContactShadow
   ```

   This check covers `packages/*/src`.
7. `lighting.model: "physical"` is the default, and the `legacy-3.0` removal is scheduled in the 3.2
   milestone with an issue link.
8. PRD 13 has merged the skill updates that consume the facts in this PRD. An agent-authored scene from the `create-aura3d` `mini-game` / `racing-starter` templates on the
   engine path has an environment and a shadowed sun. Check it by running
   `lighting-composition.test.ts`'s scaffold case: scaffold the template, build its scene snapshot, and
   assert `environment.source !== "neutral"` and that one directional is in
   `selectShadowedLights(...)`.
9. No README, release note or showcase text claims Three.js-quality lighting. The claim registry
   (`docs/project/claim-guidelines.md`) gains entries scoped to the measured scenes only.

---

## 22. Rollback considerations

- **Single switch.** Flipping the default `lighting.model` back to `"legacy-3.0"` is a one-line revert
  in `normalizeCreateAppRendererOptions` (`index.ts` ≈4315-4327). Both paths coexist until 3.2, so a
  rollback needs no asset or data migration. No persistent user data is involved.
- **Per-subsystem kill switches** (internal, not public API) are `?a3dLighting=` URL flags read by
  `RootRuntimeSupport.ts`:
  - `pmrem=cpu`: Worker prefilter.
  - `shadowFilter=legacy-grid`: kept until Phase 8.
  - `csm=off`: single fitted map, still texel-snapped.
  - `atlas=off`: sun-only shadows.
  - `contact=off`.
  - `probes=off`.
  - `ssr=off`.
  - `shadows=off` and `background=off`, used by the section 17 toggle-delta measurement.

  These exist so a production regression in one subsystem can be isolated without reverting the rest.
- **Assets.** If a preset fetch fails or the CDN is down, the neutral environment stays bound and a
  warning is logged. The page is never black. Preset files are content-hashed, so a bad bake is rolled
  back by repointing the registry hash.
- **Codemod.** It runs one commit per app, so a single app can be reverted independently.
- **Deployment.** Any production redeploy of the showcase apps follows
  `/Users/gurbakshchahal/AuraOne/AuraOne-Deploy-Final-PERMANENT.md`, and the rollback is the runbook's
  rollback. This PRD defines no separate deploy procedure.

---

## 23. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| The renderer track switches to three-backed (PRD 01/11) mid-implementation | Medium | Track R tasks wasted | Phase 1 tasks are mostly engine-side [R/T]. Do Phase 2+ [R] work only after the PRD 01 decision. Acceptance is track-independent (6.0) |
| Adding IBL to 15 games blows out neon/emissive games or makes them look different from their art intent | High | Category regressions | 16.2 no-regression rule. `environments.preset("night")` and intensity guidance. PRD 14 art pass |
| Shader variant explosion (casters × lighting variants) increases compile stalls | Medium | Hitches; worse on mobile | Precompile at mount; `KHR_parallel_shader_compile`; cap caster variants via shared vertex chunks; measure compile counts in diagnostics |
| Half-float render targets are unsupported or broken on some mobile GPUs | Low–Medium | No GPU PMREM | Prebaked KTX2 presets plus the Worker CPU prefilter. Tier capped at Low |
| Shadow memory on Ultra/High exceeds budget on 4 GB devices | Medium | OOM / context loss | Tier table; `mapSize` cap; atlas reallocation on tier downgrade; context-loss recovery test |
| CSM sphere fit wastes resolution compared with a tight fit | Medium | Softer near shadows | `fit` override for arenas; 4 cascades on High+; measure 17 and Siege Golf |
| The macos-14 paravirtual GPU is not representative for performance | Certain | Wrong budgets | Budgets measured only on the section 19 devices; the runner is used for deltas only |
| Vision-model judgments are produced without viewing the images (as in research/22) | Medium | Invalid acceptance | JPEG export task; reviewers must quote image content; human sign-off is mandatory |
| HDRI licensing or provenance for new presets | Low | Legal | CC0 only. Registry stores license and SHA. Admission through the PRD 05 pipeline |
| Ambient `/π` breaks third-party scenes that tuned around it | Medium | Darker fill | One-minor `legacy-3.0`; codemod report; migration guide in `docs/project/migration.md` |
| Removing the fallback rig makes zero-light scenes look dull | Medium | Agent scenes regress | Neutral environment lights them. Lint and skills teach sun + preset (PRD 13). The no-light benchmark row 20-no-lights (16.1) gates it |
| Lighting programs exceed WebGL2 minimum uniform or sampler limits on mobile (E35, E36) | High without 6.10 | Link failure, which means a black or missing material on some devices | Uniform blocks; per-tier sampler table; deterministic drop order; link test against a 16-unit/224-vector device mock |
| Point-heavy games (Courier Rush ≈21 points, Pulse Tunnel ≈14, Gallery Shift and Deep Recovery ≈15) blow out or lose fill when points become infinite-range with decay 2 | High | Category regressions in 16.2 | Codemod `--preserve-range` per game; the per-game risk column in 16.2; the A/B reviewer checks these games first |
| GPU timer queries unavailable on Safari/iOS and Firefox | Certain | Budgets unmeasurable on iOS | The 17 toggle-delta method (below the budget table) |
| Existing slow games (Deep Recovery at 0.5–3.6 fps) get slower with full-strength multi-light shadows | Medium | Unplayable | 0.85× FPS regression guard; `maxShadowedLights` tiering; dropped-light diagnostics |

---

## 24. Explicitly out of scope

| Item | Where it goes |
|---|---|
| Global illumination: lightmaps/baking, DDGI, SSGI, voxel GI. The irradiance volume here is a static probe grid only | Future PRD; research/18 §2 notes the UV1 slot exists |
| AO algorithm (GTAO/SAO) and AO compositing. This PRD only consumes AO as `ao_d` and `SO` | PRD 03 |
| Tone mapping, exposure, colour grading, bloom | PRD 03 |
| SSR pass implementation and post chain ordering. This PRD specifies only the integration in 6.7 | PRD 03 |
| BRDF lobes, DFG LUT, clearcoat/sheen/transmission IBL terms, material AO heuristics, clustered binding per variant | PRD 04 |
| HDRI bake tooling, KTX2 transcoder hosting, asset admission | PRD 05 |
| Volumetric lighting, light shafts, fog scattering, particles lit by lights | PRD 07 |
| Physical sky/atmosphere and day/night. This PRD provides `environments.capture` only | PRD 10 |
| WebGPU backend architecture, froxel/GPU clustered lighting, UBO architecture, device tiering heuristics | PRD 11 |
| Per-game art direction and the final per-game competitiveness verdict | PRD 14 |
| Lean (`@aura3d/lean`) lighting. Its intents remain inert until PRD 15 decides its future | PRD 15 |
| Ray-traced shadows or reflections, VSM/ESM shadow filtering, shadow-map caching for static geometry | Not planned; revisit after Phase 7 data |
