# PRD 02: Lighting, IBL, Reflections and Shadows

Program: Aura3D visual-quality autopsy and rebuild (branch `aura3d-quality-rebuild/audit`).
Status: Draft for implementation, parallelized against `CONTRACTS.md` (PR 0 Contract Bootstrap). Lane: **PRD 02**.
Flag: `A3D_QR_LIGHTING` (sub-flags `_CSM`, `_PROBES`, `_CONTACT`). Owned paths: exactly CONTRACTS §4.1 row "02"
(listed in "Parallel execution" below). Provides C-09, C-10, C-11, C-12. Consumes C-01, C-02, C-05, C-08, C-13,
C-18, C-21, C-26, C-27, C-28, C-29, C-30, C-31, C-33, C-34, C-36, C-37, C-38, C-39, C-40 against their PR 0 stubs.
This lane never waits on another lane: every former "depends on PRD X" is a contract consumed against its stub, a
non-blocking request (CONTRACTS §6.5), or an integrated criterion evaluated at a checkpoint (CONTRACTS §7).
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
capability matrix goes green. Merges are gated by **Standalone acceptance** (16.1), which this lane can
pass alone with stubs. The visual-quality goal is **Integrated acceptance** (16.2-16.4): the benchmark
scenes and games judged against three r185 by a vision model **and** a named human reviewer at a
G-PANEL checkpoint (CONTRACTS §7). Integrated results never block a merge. Aura3D is not Three.js-quality
today. Nothing in this document, including a passing standalone gate, conformance test, metric threshold
or vision-only screening round, may be cited as evidence that it is. Only a G-PANEL round that meets the
16.2-16.4 thresholds supports a scoped claim (CONTRACTS §7 honesty rule).

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
PRD. They were spot-checked again at `7992a0dd` (later commits are docs-only) during parallelization: E1, E3,
E4, E6, E7, E8, E11, E12, E13, E14, E15, E16, E17, E18, E19 (`DepthPass.ts:59`), E20, E22, E23, E24, E26, E29,
E30, E31 and E32 all match. Ranges inside `index.ts`, `ForwardPass.ts`, `Renderer.ts` and `WebGL2Device.ts`
move to the carve-out modules of CONTRACTS §3.2-§3.5 in PR 0b; after that, cite the carve-out module and the
original range "(at `85aafcd0`)".

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
| E33 | No device counters for the "no stall" rules | `packages/rendering/src/RenderDevice.ts` (`RenderDeviceDiagnostics`) | There is no program-compile counter and no `readPixels` counter anywhere in `rendering/src`, so the compile-after-mount and no-readback rules in sections 14 and 17 cannot be measured today. Resolved by contract: C-28 `counters()` and `RenderDeviceDiagnostics.programCompileCount/readPixelsCalls` (PR 0a pre-declared; the PR 0b stub wraps `linkProgram`/`readPixels`). PRD 02 consumes them and adds no counter code. |
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
| `@aura3d/rendering` (`packages/rendering`) | Major, in PRD 02-owned files only: GPU PMREM, environment probe resource, lighting/shadow chunks registered through C-02, shadow subsystem rewrite (C-11), background pass, reflection/light probes, contact-shadow pass, sampler mapping (C-12). The frozen legacy shader libraries are not edited (CONTRACTS §3.7) |
| `@aura3d/engine` (`packages/engine`) | Major, in PRD 02-owned carve-outs: `nodes/{lights,environments,shadows,probes,sceneKits,effects.lighting}.ts`, `compiler/{environment,lights,shadows}.ts`, C-38 `app.lighting`, C-31 `lighting`/`shadows` sections, C-34 lint rule |
| `@aura3d/environments` (`packages/environments`) | Medium: `EnvironmentRegistry.ts`, `HDRIEnvironment.ts`, `PMREMPreset.ts` (owned) rewired to the GPU PMREM and real HDRIs |
| `@aura3d/assets` (`packages/assets`) | None owned. RGB9E5 KTX2 cube decode is consumed through C-16 (owner 05) or decoded by PRD 02's own `environment/Rgb9e5CubeDecode.ts`, which needs no Basis transcoder (6.2) |
| `@aura3d/three-compat` (`packages/three-compat`) | None owned (owner 15). Light-unit ledger rows are delivered as C-40 facts and a request (Q-15-3) |
| `aura3d-cli` | Lane-owned `packages/aura3d-cli/src/commands/prd02/` registers `migrate lighting` (C-39 codemod) and `environments bake` (C-39 command). Skills and templates are PRD 13's (R20); PRD 02 supplies C-40 facts |
| `@aura3d/lean` (`packages/lean`) | None. Owner 15; lean intents stay inert (request Q-15-4) |

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
  - `environment/workers/cpuPrefilter.ts` (Worker FIS prefilter, the no-float fallback)
  - `environment/Rgb9e5Cube.ts` (KTX2 RGB9E5 cube container reader for PRD 02's own prebaked presets; no Basis)
  - `environment/LightingSamplerBudget.ts` (real `resolveLightingSamplerBudget`, C-12)
  - `environment/EnvironmentProbeFactory.ts` (real `environmentProbeFactorySlot`, C-09)
  - `shadows/ShadowFrameUniforms.ts` (publishes `prd02.shadowFrameUniforms` on the C-01 blackboard, C-11)
  - `shadows/FrameContributors.ts` (C-01 contributors `prd02.shadows`, `prd02.background`, `prd02.contactShadows`, `prd02.probes`)
  - `src/lanes/prd02.ts` (lane barrel: every `slot.provide(real)` and registry call)
- Carved in PR 0b, owned by PRD 02 from then on (CONTRACTS §3.3-§3.5; the code arrives verbatim, PRD 02 then edits it):
  - `forward/Lighting.ts`: clustered-light setup, `applyClusteredLightingUniforms`, `selectForwardShadowMap`
    and the 0.65 strengths (`ForwardPass.ts:242-265, 294, 298, 834-854, 913/1048/1172` at `85aafcd0`).
  - `webgl2/Samplers.ts`: sampler min-filter/wrap mapping (`WebGL2Device.ts:~4139-4155`).
  - `renderer/ShadowOrchestration.ts`: `RendererShadowOptions` mapping, shadow orchestration including
    `executeRendererPointShadowMap`, `readShadowFacePixels` and the directional fit (`Renderer.ts:363-376,
    1354-1603, 1915-1931, 1964-1986`).
  - `renderer/Background.ts`: background wiring and `collectEnvironmentBackground` (`Renderer.ts:559, 649-656,
    728, 818-822, ~1806`).
- Modified (owned outright, CONTRACTS §4.1 row 02):
  - `DepthPass.ts` (variant composition, C-11 `registerDepthVariantFeature` consumer), `ShadowPass.ts`,
    `ShadowMap.ts`, `CascadedShadowMaps.ts`, `shadows/CascadedShadowPipeline.ts`, `shadows/CascadeHysteresis.ts`.
  - `LightUniforms.ts` (`MAX_DIRECT_LIGHTS`, the `AuraLights` block layout PRD 02 owns inside C-08).
  - `EnvironmentBackgroundPass.ts`, `EnvironmentBackgroundResources.ts`, `EnvironmentMapResources.ts`,
    `EnvironmentLighting.ts`, `EnvironmentPipeline.ts`, `EnvironmentPlatform.ts`, `ExternalParityRenderPreset.ts`
    (env binding sampler at :169 becomes `linear-mipmap-linear` under the flag).
  - `ReflectionProbe.ts`: replaced by `probes/ReflectionProbeSystem.ts`; capture code reused.
  - `ClusteredForwardLighting.ts`.
  - `shadows/SpotShadowMaps.ts`: folded into `ShadowAtlas` spot tiles, then deleted (E34).
  - `shadows/ContactShadows.ts` and `shadows/ShadowDebugViews.ts`: the ExternalParity layered-receiver plan is
    deleted. Screen-space contact shadows live only in `passes/ContactShadowPass.ts` (E34).
  - `production-runtime/PBRHDRPipeline.ts`, `production-runtime/environment/PMREMGenerator.ts` (deleted at
    flag removal), `production-runtime/environment/HDRLoader.ts`.
  - `shaders/pbr-direct.frag.glsl`: dead file, owned by PRD 02 (§4.1), deleted in Phase 7.
- Not edited by PRD 02 (owned by other lanes; reached through an extension point or a §12.3 request):
  - `ShaderLibrary.ts`, `ShaderLibraryCore.ts`, `ShaderChunks.ts` (01, frozen legacy §3.7). Lighting code goes
    into PRD 02 chunks registered through C-02; legacy-path fixes are requests Q-01-1..Q-01-4.
  - `ForwardPass.ts`, `Renderer.ts`, `WebGL2Device.ts` outside the carve-outs (01). Real camera (C-08
    `CameraLike`), RGBA16F/cube/2d-array/depth-only render targets (§3.4 `RenderTargetDescriptor` fields) and the
    depth prepass (C-01 `sceneDepthCopy`) are consumed through contracts.
  - `Sampler.ts` (04): the C-12 descriptor fields `compare`, `addressW`, `mirror` are pre-declared in PR 0a; PRD
    02 maps them in `webgl2/Samplers.ts`. The constructor default min filter is request Q-04-1.
  - `RenderDevice.ts`, `WebGPUDevice.ts`, `LeanWebGL2Device.ts` (11, 11, 15): counters come from C-28; WGSL
    twins ride on C-02 `ShaderChunk` entries; WebGPU depth-compare work is request Q-11-2.
  - `SceneOptimization.ts` (01): read only (static-batch metadata for `batched` caster keys).
- Deleted under the flag, removed at flag removal (CONTRACTS §5.4):
  - The `gameplay` / `evening` / `daylight` / `inspection` / `exhibit` / `softbox` procedural presets in
    `ExternalParityRenderPreset.ts:133-255, 560-700`, as defaults.
  - The CPU point-shadow readback path (now in `renderer/ShadowOrchestration.ts`).

Engine (`packages/engine/src/`), all PRD 02-owned carve-outs of `agent-api/index.ts` (CONTRACTS §3.2):

- `agent-api/nodes/lights.ts` (`lights`, `index.ts:3063-3159`), `nodes/environments.ts` (`environments`,
  `:4123-4190`, spreading PRD 10's empty `nodes/environments.world.ts`), `nodes/shadows.ts` (`shadows`,
  `:2366-2386`), `nodes/sceneKits.ts` (`makeSceneKit`/`sceneKits`, `:9841-10005`, R7), new
  `nodes/effects.lighting.ts` (`effects.contactShadows`, merged into `effects` by the C-36 spread) and new
  `nodes/probes.ts`.
- `agent-api/compiler/environment.ts` (`createProductionRuntimeEnvironment`, `:12628-12732`; becomes the
  `"legacy"` source of C-09 `resolveEnvironment`), `compiler/shadows.ts` (`createProductionRuntimeShadowOptions`,
  `:12942-12984`), `compiler/lights.ts` (fallback lights `:13363-13413` plus
  `createProductionRuntimeCollectedLight` `:13415`). New PRD 02 code in these files: `resolveShadowSystemConfig`,
  `selectShadowedLights`, the physical light-descriptor builder, `resolveLightingTier`, `readLightingModelFromUrl`
  and the `?a3dLighting=` kill-switch parser.
- Not edited by PRD 02: the light descriptors `index.ts:13130-13362`, `resolveProductionShadowCasterIndex`
  `:13172-13199`, `resolveProductionRuntimeShadowTuning` `:12986-13001`, renderer input `:13586-13650` and
  `:13842-14012`, `upgradeProductionEnvironmentHdri` `:14190-14245`, diagnostics `:1829, 4485-4487, 4614` and the
  types section `:1-2097` stay with PRD 15 (custodian). Under `A3D_QR_LIGHTING` they are bypassed, not edited:
  PRD 02 registers C-36 `NodeHandler`s for kinds `light`, `environment` and `probe` from its lane barrel, and the
  handler output replaces the legacy descriptors in the RenderSource. Instancing `:14747-14753` is PRD 15's R18
  fix. Lint `:18256` is PRD 13's (R8); PRD 02 registers a C-34 rule. `GameRenderPreset.ts` is PRD 11's (Q-11-1).
  `RootRuntimeSupport.ts` is PRD 15's; PRD 02's tier and URL helpers live in `compiler/lights.ts` (§4.2 row).

Environments: `packages/environments/src/{EnvironmentRegistry.ts,HDRIEnvironment.ts,PMREMPreset.ts}` (owned;
PRD 10 contributes only through `BiomeEnvironmentRegistry.ts` and C-09 sources).

Assets: `public/aura-environments/` (owned, new) holds the prebaked presets. Source HDRIs are read from
`fixtures/environment-corpus/hdri/` (owner 15, read only): `studio_small_08_1k.hdr`,
`autumn_field_puresky_1k.hdr`, `kloppenheim_06_puresky_1k.hdr` exist today. New CC0 2k HDRIs come from PRD
05's library (C-17, "HDRIs ≥6 at 2k for PRD 02/12") through request Q-05-1.

Skills and templates: none edited (R20). PRD 02 appends `F-02-*` rows to CONTRACTS Appendix B (C-40).

Tests (lane-created, so lane-owned per CONTRACTS §4.1 "creator"): `tests/qr/prd02/unit/*.test.ts`,
`tests/qr/prd02/browser/*.spec.ts`, `tests/unit/contracts/impl/prd02-*.test.ts`. Existing specs that import
PRD 02-owned modules (`createAuraApp-shadow-contract.spec.ts`, `environment-background.spec.ts`,
`production-runtime-hdr-ibl.spec.ts`, `external-parity-shadow-*.spec.ts`) are updated by PRD 02 only where their
first `packages/**` import is a PRD 02 file; otherwise PRD 02 adds a flag-on twin under `tests/qr/prd02/`.

Benchmarks: lane scenes in `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd02/` (C-30).

CI: `.github/workflows/lighting-quality.yml` (owned) and `.github/workflows/qr-prd02-*.yml` (lane), both on
macos-14. The shared `quality-rebuild-capture.yml` (12) is used through its `qr_flags` input only.

---

## 6. Architecture proposal

### 6.0 Renderer-decision independence

research/18 Q3 is still open: does Aura keep its own renderer, or build on three r185
`WebGPURenderer`? That decision is not an input to this lane. The backend is behind C-29 (renderer factory,
owner 11), and this PRD is written so that the **public API (section 7, frozen as C-10), the lighting contract
(6.1, frozen in C-09), the defaults (6.2) and the acceptance tests (sections 15-16) are identical under either
outcome**:

- **Track R (own renderer, the day-0 track):** implement sections 8-9 in PRD 02-owned files of
  `packages/rendering`, with shader code as C-02 chunks and frame work as C-01 contributors.
- **Track T (three-backed):** if a C-29 three-backed backend is ever registered, the section 7 API maps onto
  `PMREMGenerator`, `scene.environment`, `scene.background`, `LightShadow`, `CSM`, `PointLight.decay/distance`,
  `RectAreaLight` and `LightProbe` inside a PRD 02-owned adapter `packages/rendering/src/environment/threeMapping.ts`.
  Tasks marked **[R]** in section 14 are then replaced by mapping tasks. Tasks marked **[R/T]** apply to both.
  No PRD 02 task waits for this decision.

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
- `SO` is Lagarde specular occlusion from material AO and, when present, a GTAO texture that PRD 03 publishes
  on the C-01 blackboard under `prd03.ao` (request Q-03-1; C-13 does not freeze an AO output today). Until it
  exists, `SO` uses material AO only and `lighting.diagnostics().droppedFeatures` lists `gtao-input`.
- `H` is horizon occlusion against the geometric normal.
- `DFG` comes from the `u_dfgLut` binding (r185 16x16 RG16F) that PRD 01 owns in `BRDFLut.ts` and exposes
  through C-02 (CONTRACTS R4). PRD 02's chunk reads it by name and never ships a second LUT.
- `ao_d` applies AO to **indirect diffuse only**. AO is never applied to direct light. The legacy
  `directTextureOcclusion` heuristic lives in frozen `ShaderLibrary.ts` and stays on the flag-off path; it is
  absent from PRD 02's chunks by construction (removal from legacy is PRD 01's at flag removal, §3.7).

This formula is the semantics of C-09 (CONTRACTS C-09 "Indirect lighting is additive in linear HDR") and is
frozen there; this PRD is its provider.

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
`"studio" | "outdoor" | "sunset" | "night" | "indoor"`. Each preset is a CC0 HDRI. Day-0 sources are the three
already in `fixtures/environment-corpus/hdri/`; 2k CC0 candidates come from PRD 05's HDRI library (C-17,
request Q-05-1) and are swapped in by a registry hash change when they land:

| Preset | Day-0 source (in repo) | Later source (C-17 library) |
|---|---|---|
| studio | `studio_small_08_1k.hdr` | 2k studio, optional |
| outdoor | `autumn_field_puresky_1k.hdr` | 2k outdoor, optional |
| sunset | `kloppenheim_06_puresky_1k.hdr` | 2k CC0 sunset |
| night | `kloppenheim_06_puresky_1k.hdr` at intensity 0.05, rotated, tagged `stand-in` in the registry | 2k CC0 night |
| indoor | neutral room (`RoomEnvironmentScene`), tagged `stand-in` | 2k CC0 indoor |

Each preset is **prebaked offline** by `aura3d environments bake`, a C-39 command PRD 02 registers from its own
`packages/aura3d-cli/src/commands/prd02/environmentsBake.ts` (it reuses `GPUPMREMGenerator` math on the CPU
reference path, so it needs no browser), into `public/aura-environments/`:

- `<preset>.<tier>.ktx2`: a cube with prefiltered mips at RGB9E5_UFLOAT with **no supercompression**
  (transport compression is the server's gzip/brotli), so PRD 02's own `environment/Rgb9e5Cube.ts` reads it
  without the Basis transcoder or a Zstd decoder. Face size follows C-27 `environmentSize` (128 / 256 / 512 /
  1024 for Low / Medium / High / Ultra).
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
   angle, into a 9×1 RGBA16F texture over 2 reduction passes, entirely on the GPU with no readback. The
   stored coefficients are radiance SH (C-09 `sh9`); the Ramamoorthi–Hanrahan cosine-lobe constants (π, 2π/3,
   π/4) are applied at evaluation (`evaluateSH9Irradiance`, chunk `a3d_prd02_sh9`).
4. **Cache.** Results are cached by `(url, tier)`. Computation is time-boxed. If generation exceeds the
   frame budget, the previous probe (or the neutral room) stays bound until the new one completes,
   which is never a black frame.

**Background.** `EnvironmentBackgroundPass` is wired by the root bridge whenever the active environment
has `background !== false`. It samples:

- the background equirect when one exists and `blurriness == 0`;
- otherwise the specular cube at `lod = roughnessToLod(blurriness)`.

Output is linear HDR written to `FRAME_RESOURCES.sceneColor` before tone mapping (C-01 phase `background`), so
it is tone-mapped like the scene; this fixes the asymmetry noted in research/22 §18. With the C-05/C-01 stubs
(`A3D_QR_CORE` off) the scene target is the legacy one, and the pass writes what the legacy present path
expects; the HDR-correct result is part of integrated acceptance. A C-21 sky (owner 07), when its flag is on,
owns the `background` phase draw instead, and PRD 02's background pass yields (`visible` ignored, diagnostic
`BACKGROUND_YIELDED_TO_SKY`). Fog does not apply to the background unless the C-21 fog spec says so.

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
- The 16-light cap is lifted to 32, but **not** with plain uniforms (E35). Light data moves to the std140
  uniform block `AuraLights` (binding 1; the name is frozen by C-08 `AURA_LIGHTS_BLOCK_NAME`, and PRD 02 owns the
  layout inside it): 32 × 6 vec4 = 3 KB, inside WebGL2's guaranteed 16 KB `MAX_UNIFORM_BLOCK_SIZE`. Until C-08's
  `resources/UniformBlock.ts` packer is real (PRD 01), PRD 02 uploads the block with its own std140 packer in
  `forward/Lighting.ts`. The plain `u_lightData` array stays only for `legacy-3.0` (flag off). Clustering is the
  only path above 32. `A3D_PBR_DISABLE_CLUSTERED_LIGHTING` on the legacy textured variants is a frozen-legacy
  item already requested of PRD 01 by PRD 04 (Q-01-3 in PRD 04); PRD 02's chunks never define it. A froxel/GPU
  cluster rewrite is out of scope (PRD 11).

### 6.4 Shadow system

```
ShadowSystem.update(frame)
  ├─ selectShadowedLights(lights, tier.maxShadowedLights)        // explicit shadow:true first, then autoSun
  ├─ for directional (≤1):  DirectionalCascadeFitter → C cascades → sampler2DArrayShadow (DEPTH24/32F, layers=C)
  │                         (until the §3.4 RenderTargetDescriptor `dimension: "2d-array"` field is real, PRD 02
  │                          allocates one 2D depth target per cascade, as CONTRACTS §3.4 prescribes)
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

**Depth/caster variants** (`ShadowCasterVariants.ts`). The variant key is the frozen C-11
`ShadowCasterVariantKey`:

```ts
{ skinning: 0|4|8, skinningTexture: boolean, morphTargets: boolean, instanced: boolean, batched: boolean,
  alphaTest: boolean, alphaHash: boolean, doubleSided: boolean, features: Record<string, string|number|boolean> }
```

The morph target count is not a key field; it is a value inside `features` contributed by the C-18 `deform`
depth feature that PRD 06 registers through `registerDepthVariantFeature` (`prd06.deform`). Variants are
compiled lazily and cached per device. Precompile is issued at mount for the keys present in the scene, using
C-28 `compileAsync` (`KHR_parallel_shader_compile` when the real C-28 is present; synchronous with the stub).
Vertex stages compose the C-11 depth features in `DepthPass.ts`, so the shadow pose equals the drawn pose as soon
as the deform feature that also drives the forward pass is registered.

With the C-18 stub (no `prd06.deform` feature yet), PRD 02 ships its own minimal depth features
`prd02.depthInstancing`, `prd02.depthAlpha` and `prd02.depthSkinning`. The last one is a 4/8-joint linear-blend
skin that reads the palette from the `RenderItem` skinning fields (`contracts/renderItem.ts`) with the same
layout the forward pass uploads; it imports no PRD 06 or PRD 01 module (CONTRACTS §6.2). When `prd06.deform` is
registered and `A3D_QR_ANIMATION` is on, it supersedes `prd02.depthSkinning` (and adds morphs), so caster and
forward deformation come from one chunk. That is enough for the standalone skinned-shadow IoU test (16.1); the
C-11 browser conformance spec covers the PRD 06 feature at integration.

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
- **Per-fragment cascade selection** uses view depth against the split vector, with a 10% blend band, inside
  the `a3d_prd02_shadow_receive` chunk (C-02). It becomes visible on production draws when the C-02 generator is
  real (`A3D_QR_CORE=v2`). On the legacy path (C-02 stub), `selectForwardShadowMap` (now in PRD 02's
  `forward/Lighting.ts`) keeps per-item selection but picks from the stable, snapped cascades; it is deleted at
  flag removal.
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
tap), expressed as the C-12 `SamplerDescriptor.compare` field and mapped in PRD 02's `webgl2/Samplers.ts`.
Compare samplers bind only for programs that include the `a3d_prd02_shadow_receive` chunk; the frozen legacy
receive code (`ShaderLibraryCore.ts:494-531`, which reads `.r` against a `nearest` sampler) keeps its
non-compare binding, so the flag-off path is pixel-identical. The C-27 `shadow.filter` value maps to kernels:
`pcf2` → Low kernel, `pcf3` → Medium kernel, `pcf5` → High kernel; PCSS is the C-10 opt-in `filter: "pcss"`.

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
default `PCFShadowMap`, so penumbra-width comparisons in 16.4 are against that kernel.

**Bias.**

- The constant `bias` defaults to 0 (auto).
- `normalBias` is in **world units**. It defaults to `1.5 × texelWorldSize[cascade]`, and the receiver
  is offset along the geometric normal by `normalBias·(1 − NoL)`.
- The existing per-tap `tan θ` slope term is kept (research/04 §11).
- Bias heuristics derived from `sceneRadius` are deleted (E14). Map size comes from the tier, not from
  node positions (E13).

**Strength.** `shadow.intensity` defaults to 1.0, and so does the renderer default under `model: "physical"`
(C-10 semantics). 0.32, 0.24 and 0.38 (engine side, `compiler/shadows.ts`) and 0.65 (`forward/Lighting.ts`,
was `ForwardPass.ts:913, 1048, 1172`) are replaced by 1.0 under the flag. The `GameRenderPreset.ts:346` 0.38
(owner 11) is request Q-11-1. Until it lands, routes whose shadow options flow through PRD 02's
`compiler/shadows.ts` get 1.0 under `A3D_QR_LIGHTING`; routes that pass `GameRenderPreset` shadow options
straight to the renderer keep 0.38, and that case is evaluated only at integration (E12).

**Receivers.** `receiveShadow: false` binds `shadowEnabled = 0` for that item in `forward/Lighting.ts`, because
the node field is now read through `RenderItem.receiveShadow?` (pre-declared in PR 0a, CONTRACTS §3.3) (E27).

### 6.5 Contact shadows

`ContactShadowPass` produces an R8 screen-space visibility mask in the C-01 `after-opaque` phase
(contributor `prd02.contactShadows`, sub-flag `A3D_QR_LIGHTING_CONTACT`). It reads `FRAME_RESOURCES.sceneDepthCopy`
when C-01 is real. With the C-01 stub (`sceneDepth.available === false`), it renders its own camera-space
depth with PRD 02's `DepthPass` at half resolution (cost counted in the contact budget, 17) so the lane is not
blocked on the prepass. Near/far come from the C-08 `CameraLike` the shadow carve-out already receives. For
each pixel it ray-marches up to 16 steps along the primary shadowed light's direction in view space,
over `length` (default 0.25 m), against linear depth with a `thickness` (default 0.05 m) test and
interleaved gradient noise jitter. It is applied **inside `V_l` of that light only** (6.1), never to
total colour, through the `a3d_prd02_contact_shadow` chunk, so the visible effect needs the C-02 generator
(integrated). The mask itself is tested standalone.

Tier availability is C-27 `shadow.contact` (true on Ultra only in the frozen table). PRD 02 asks for Medium
(sun only) and High (sun + up to 2 spot) in request Q-11-3; until then apps opt in with
`effects.contactShadows()`, which forces it on at any tier except Low.

`shadows.contact()` blob discs are renamed `decals.blobShadow()` (signature frozen in C-10); `shadows.contact`
stays as a deprecated alias for one minor release. The implementation lives in PRD 02's `nodes/shadows.ts`
as `blobShadow`. Exposing it on the `decals` namespace (`agent-api/Decals.ts`, owner 07) is request Q-07-1;
until it lands, `shadows.contact` is the working entry point and nothing waits. Diagnostics stop counting names
as contact shadows (E25) through PRD 02's C-31 `shadows` section.

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

The SSR pass is owned by PRD 03 and registers through C-13 (`registerPostPass`, `insertAt: "before-tonemap"`,
sub-flag `A3D_QR_POST_SSR`). PRD 02 implements no SSR code. It provides the inputs and specifies the lighting
integration, which PRD 03 consumes:

- It runs before tone mapping on the linear-HDR scene colour of the **previous frame**, reprojected.
- It uses the real camera near and far from C-08 / C-13 `depthRange` (fixes E29; the `{ near: 0.1, far: 1000 }`
  literal at `WebGL2Device.ts:865` is a known C-08 stub defect, request Q-03-2).
- Rays are marched in view space against hierarchical depth when C-01 provides it, and otherwise
  with linear steps plus binary refinement.
- It is roughness-aware: hit colour is fetched from a colour mip pyramid at `lod = roughnessToLod(r)`,
  and rays are skipped when `r > roughnessCutoff` (0.5).
- The result is composited as a *replacement* for `L_spec`, weighted by hit confidence (edge fade, ray
  length and thickness), so probe/environment specular fills misses. It is multiplied by `SO` and the
  `DFG` term, never added on top of environment specular.
- Availability: C-27 `ssr` (off on Low and Medium, `medium` on High, `high` on Ultra).
- PRD 02 publishes what the composite needs on the C-01 blackboard: `prd02.envSpecular` (the active
  `EnvironmentProbe`) and `prd02.roughnessToLod` parameters. Whether SSR replaces `L_spec` correctly is an
  integrated criterion (16.2), never a PRD 02 merge gate.

### 6.8 Quality tiers (C-27 values consumed; `lighting.quality: "auto"` resolves through C-27)

The tier type is `AuraQualityTier` from `packages/rendering/src/contracts/quality.ts` (R1); PRD 02 defines no
tier type of its own. `resolveLightingTier` (PRD 02, `compiler/lights.ts`) reads `SceneCompileContext.quality`
(C-36), which carries the C-27 settings; `lighting.quality` and per-light options override it. The C-27 data
ships real in PR 0a, so this table is usable on day 0 ("auto" = `high` on desktop, `medium` on coarse pointer,
per the C-27 stub). Rows marked **C-27** are the frozen PRD 11 values; rows marked **02** are PRD 02-derived.
Where PRD 02 prefers a different value, the C-27 value is used and the preference is request Q-11-3.

| Feature | Src | Low (mobile / iGPU) | Medium | High (M1/3060-class) | Ultra |
|---|---|---|---|---|---|
| Env cube face (`environmentSize`) | C-27 | 128 | 256 | 512 | 1024 |
| PMREM samples | 02 | 16 (prebaked) | 32 | 32 | 64 |
| Background | 02 | cube mip 0 | cube mip 0 | 2k equirect | 2k equirect |
| Diffuse | 02 | SH9 | SH9 | SH9 + irradiance volume | SH9 + irradiance volume |
| Sun cascades × `mapSize` | C-27 | 1 × 1024 | 2 × 2048 | 3 × 2048 | 4 × 4096 |
| `localShadowLights` (atlas) | C-27 | 0 | 1 (2048×1024 atlas) | 2 (2048² atlas, ≤1 point) | 4 (4096² atlas, ≤2 point) |
| Filter (`shadow.filter`) | C-27 → 02 kernel | `pcf2` → HW 1-tap | `pcf3` → Castaño 5×5 | `pcf5` → Vogel 16 | `pcf5` → Vogel 16; PCSS opt-in |
| Contact shadows (`shadow.contact`) | C-27 | off | off (opt-in) | off (opt-in) | sun + 2 spot |
| Reflection probes | 02 | global env only | ≤2, `once` | ≤4, `once`/`on-demand` | ≤4, `every-n-frames` allowed |
| SSR (`ssr`, PRD 03 pass) | C-27 | off | off | medium (half-res) | high (full-res) |
| Area lights | 02 | Gauss–Legendre 4-tap | Gauss–Legendre | LTC | LTC |

PRD 02 preferences filed as Q-11-3 (non-blocking): contact shadows on Medium (sun) and High (sun + 2 spot);
Ultra `environmentSize` 512 to cap memory (see 17); Medium `mapSize` 1536 is withdrawn because the C-27
`mapSize` union is `1024 | 2048 | 4096`.

### 6.9 Cost cards for the major recommendations

The GPU figures are **estimates at 1920×1080 on a High-class GPU**. They must be replaced by
measurements in Phase 7 (see section 17 for the per-tier budgets).

| # | Recommendation | Visual benefit | GPU cost | CPU cost | Memory | Bundle (gz) | Mobile impact | Fallback |
|---|---|---|---|---|---|---|---|---|
| R1 | Ambient additive to IBL; delete `authored-ambient`; ambient `/π` | Restores reflections and Fresnel in 15/18 games. Removes the flat wash (58% → under 15% of ground light) | ≈0 (removes a branch) | 0 | 0 | −0.3 KB | None | `A3D_QR_LIGHTING` off (= `lighting.model: "legacy-3.0"`) |
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
| R12 | Contact shadows | Small-scale grounding under feet, wheels and props | 0.3–0.6 ms (with C-01 `sceneDepthCopy`; +0.2–0.4 ms for PRD 02's own half-res depth while C-01 is a stub) | 0 | R8 full-res ≈ 2 MB | +2 KB | Off on Low | `decals.blobShadow()` |
| R13 | Reflection probes (box-projected) + irradiance volume | Correct interior reflections and indoor bounce light (10-indoor, Gallery Shift, Mech Hangar) | Capture 6 faces + PMREM ≈ 4–10 ms per probe (`once`). Runtime +0.1 ms | Probe selection <0.1 ms | 1.05 MB per 128 RGBA16F probe (4.2 MB at 256); L1 volume 8³ × 3 RGBA16F ≈ 12 KB | +6 KB | Off on Low | Global environment |
| R14 | SSR in HDR | Ground and floor reflections of emissives and objects (Courier, Pulse Tunnel wet streets) | 1.0–2.5 ms | 0 | Colour pyramid ≈ 22 MB (1080p RGBA16F with mips) | +3 KB (counted against PRD 03, which owns the C-13 pass; PRD 02 adds ≈0.3 KB of blackboard inputs) | Off below High | Probe/env specular |
| R15 | Physical point/spot units, decay, distance 0, area lights | Hot practicals, believable pools (10-indoor ceiling hotspots, neon in Courier) | ≈0, plus range culling saves ALU | 0 | LTC tables 2×64² RGBA16F = 64 KB (High+) | +2 KB | Gauss–Legendre area on Low | Legacy falloff under `legacy-3.0` |
| R16 | Delete the fallback rig, category heuristics and fake diagnostics | Removes stray hotspots and shadows (13, 14) and honest diagnostics | 0 | −0.2 ms (removes name scans per frame) | 0 | −4 KB | None | None needed |

The net bundle target is **≤ +15 KB gz** for the whole PRD. The root bundle is already 575 KB gz
against an 80 KB budget (research/18 §2), so deletions are mandatory, not optional.

### 6.10 WebGL2 resource-limit budget (per tier, binding on every lighting program)

The section 8 shaders must compile and link on a device that reports only the WebGL2 minimums
(`MAX_TEXTURE_IMAGE_UNITS = 16`, `MAX_FRAGMENT_UNIFORM_VECTORS = 224`,
`MAX_UNIFORM_BLOCK_SIZE = 16384`, `MAX_FRAGMENT_UNIFORM_BLOCKS = 12`) (E35, E36).

Uniform data:

- Light data (32 × 6 vec4) goes in the `AuraLights` uniform block.
- Shadow data (cascade matrices, splits, local-shadow tiles) goes in the `A3DShadows` block
  (≤ 4 KB). Its CPU-side source is C-11 `ShadowFrameUniforms`, published under `prd02.shadowFrameUniforms`.
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

- The variant compiler sums lighting and material sampler counts per program (material counts come from C-03
  `MaterialLobe.samplerSlots`, owner 04, and the material's own maps). If the sum exceeds
  `MAX_TEXTURE_IMAGE_UNITS`, it first applies two PRD 02-local **downgrades** that keep the feature:
  PCSS → Vogel (frees the raw cascade and raw atlas units), then LTC → Gauss–Legendre (frees 2 units). If still
  over, it drops features in the frozen C-12 `LIGHTING_SAMPLER_DROP_ORDER`: `contact-shadow`,
  `irradiance-volume`, `reflection-probe-2`, `local-shadow-atlas`, `sh-texture`, `cascade-3`, then the PRD 04
  lobes. Every downgrade and drop is recorded in `lighting.diagnostics().droppedFeatures`. It never fails to
  link. The two downgrades are not members of the C-12 tuple; adding `"pcss-raw"` and `"ltc"` as reportable
  names is the additive CCR-02-1 (new union members consumers may ignore).
- The pure function is the real `resolveLightingSamplerBudget` of C-12, in PRD 02's
  `environment/LightingSamplerBudget.ts`. Its stub (`{ droppedFeatures: [] }`) stays the flag-off result.
- On a 16-unit device, High and Ultra therefore downgrade per draw for materials with more than 4
  maps. That is acceptable and must be visible in diagnostics.

---

## 7. APIs to add, change and remove (TypeScript signatures)

### 7.1 Public agent API (`@aura3d/engine`; builders in PRD 02's `agent-api/nodes/*.ts`)

Where each signature lives:
- Frozen in C-10 (`packages/engine/src/contracts/lighting.ts`, PR 0a): `AuraLightingModel`,
  `AuraLightingOptions`, `AuraShadowOptions`, `AuraDirectionalShadowOptions`, `AuraLocalShadowOptions`,
  `AuraLightsApiAdditions`, `AuraLightingDiagnostics`, `AuraLightingRuntime`; `AuraCreateAppOptions.lighting` and
  `AuraLightType` `"hemisphere"` are pre-declared in the `index.ts` types section by PR 0a. The copies below
  must stay identical to C-10; any change is a CCR (CONTRACTS §6.4).
- Frozen in C-09 (`packages/engine/src/contracts/environment.ts`): `AuraEnvironmentSourceResolution`,
  `registerEnvironmentSource`, `resolveEnvironment`.
- PRD 02-owned (no contract): the builder implementations in `nodes/{lights,environments,shadows,probes,
  effects.lighting}.ts`, and the new environment types below (`AuraEnvironmentPresetName`,
  `AuraEnvironmentBackgroundOptions`, the extended `AuraEnvironmentOptions`/`AuraEnvironmentNode` fields). The
  new node fields are optional additions to types in the frozen `index.ts` types section, so they go through
  the additive CCR-02-2 (PRD 15 merges within one working day, §6.4). Until it merges, they are declared in
  `nodes/environments.ts` as `AuraEnvironmentNodeV2 extends AuraEnvironmentNode` and the C-36 handler reads
  that type; nothing waits.

```ts
// ---------- app-level ----------
export type AuraLightingModel = "physical" | "legacy-3.0";          // C-10
// Tier type: AuraQualityTier from contracts/quality.ts (C-27, R1). No lighting-specific tier type.

export interface AuraLightingOptions {                              // C-10, verbatim semantics
  /** Default "physical" when A3D_QR_LIGHTING is on, "legacy-3.0" otherwise; ?aura-lighting=legacy-3.0 forces legacy. */
  readonly model?: AuraLightingModel;
  /** Promote the brightest directional light to a shadow caster when no directional sets `shadow`. Default true. */
  readonly autoSunShadow?: boolean;
  /** Default "auto": the C-27 resolved tier (SceneCompileContext.quality). */
  readonly quality?: AuraQualityTier | "auto";
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
  /** Capture scene content (e.g. a C-21 sky from PRD 07, a PRD 10 biome sky) into the environment probe.
   *  With the C-21 stub the sky renders its horizon colour into each face (skyBackgroundSlot.stub). */
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
/** @deprecated alias of decals.blobShadow; removed at A3D_QR_LIGHTING flag removal (CONTRACTS §5.4). Implemented in nodes/shadows.ts; `decals` exposure is Q-07-1. */
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

// ---------- runtime (C-10, frozen; exposed as AuraApp.lighting through the C-38 app-extension registry) ----------
export interface AuraLightingRuntime {
  updateProbe(name: string): Promise<void>;
  rebakeIrradiance(name?: string): Promise<void>;
  setEnvironmentRotation(radians: number): void;
  setEnvironmentIntensity(value: number): void;
  diagnostics(): AuraLightingDiagnostics;
}
// registerAppExtension({ member: "lighting", owner: "prd02", flag: "A3D_QR_LIGHTING", create }) in packages/engine/src/lanes/prd02.ts

// C-10 frozen fields (must match CONTRACTS C-10 exactly):
export interface AuraLightingDiagnostics {
  readonly environment: { readonly source: string; readonly faceSize: number; readonly mipCount: number; readonly format: string; readonly shBound: boolean; readonly backgroundDrawn: boolean; readonly pmremGpuMs: number | null };
  readonly shadows: readonly { readonly light: string; readonly filter: string; readonly casterVariants: readonly string[]; readonly sampled: boolean }[];
  readonly droppedFeatures: readonly string[];          // "<programKey>:<feature>", e.g. "a3d:pbr:…:irradiance-volume"
  readonly contactShadows: { readonly passExecuted: boolean };
  readonly programCompileCount: number;                 // from C-28 RenderDeviceDiagnostics
  readonly readPixelsCalls: number;                     // from C-28 RenderDeviceDiagnostics
}
// PRD 02 extensions, proposed as the additive CCR-02-3 (all optional, so C-10 consumers may ignore them).
// Until it merges they are reported only in the C-31 "lighting" / "shadows" diagnostics sections PRD 02 registers.
export interface AuraLightingDiagnosticsExtras {
  readonly model?: AuraLightingModel;
  readonly tier?: AuraQualityTier;
  readonly environmentPreset?: AuraEnvironmentPresetName;
  readonly shadowDetail?: ReadonlyArray<{
    readonly light: string; readonly kind: "directional" | "spot" | "point";
    readonly cascades: number; readonly mapSize: number;
    readonly filterKernel: "hard" | "pcf-hw-1" | "pcf-castano-5x5" | "pcf-vogel-16" | "pcss"; // derived from compiled program defines
    readonly intensity: number; readonly casterCount: number;
  }>;
  readonly droppedShadowLights?: readonly string[];
  readonly contactShadowsEnabled?: boolean;
  readonly probes?: ReadonlyArray<{ readonly name: string; readonly kind: string; readonly captured: boolean; readonly lastCaptureFrame: number }>;
  readonly lightsEvaluated?: number; readonly lightsCulledByRange?: number; readonly lightsDroppedByCap?: readonly string[];
}
```

### 7.2 Renderer API (`@aura3d/rendering`)

`EnvironmentProbe`, `EnvironmentCaptureRequest`, `EnvironmentProbeFactory`, `environmentProbeFactorySlot`,
`projectCubeToSH9`, `evaluateSH9Irradiance`, `SH9_CHUNK` are frozen in C-09
(`packages/rendering/src/contracts/environment.ts`); `ShadowCasterVariantKey`, `resolveShadowCasterVariant`,
`shadowCasterVariantId`, `DepthVariantFeature`, `registerDepthVariantFeature`, `ShadowFrameUniforms`,
`SHADOW_BLACKBOARD_KEY`, `SHADOW_LOOKUP_CHUNK`, `registerSkinnedBoundsProvider` in C-11
(`contracts/shadows.ts`); the sampler additions and budget functions in C-12 (`contracts/sampling.ts`). PRD 02's
real implementations are registered with `slot.provide(real)` in `packages/rendering/src/lanes/prd02.ts`. The
`RenderSource` fields below are pre-declared by PR 0a in `contracts/renderSource.ts` (CONTRACTS §3.5). Everything
else in this section is PRD 02-owned and not a contract.

```ts
// environment/EnvironmentProbe.ts — implements C-09 EnvironmentProbe (faceSize 128|256|512|1024;
// source "neutral"|"preset"|"hdri"|"capture"|"sky"|"space-bake"|"legacy"). Notes on PRD 02's real values:
//   specularCube: cube, RGBA16F (or RGB9E5 sample-only from PRD 02's prebaked KTX2), mipCount levels
//   mipCount:     log2(faceSize) - 3   (16 px floor)
//   sh9:          length 27, linear RADIANCE SH (C-09); the cosine-lobe constants are applied in
//                 evaluateSH9Irradiance and in the a3d_prd02_sh9 chunk, never baked into sh9
//   shTexture:    9x1 RGBA16F when produced on GPU; sh9 mirrors it lazily
//   background:   equirect for High/Ultra

// environment/GPUPMREMGenerator.ts
export interface GPUPMREMOptions {
  readonly faceSize?: 128 | 256 | 512 | 1024; // default: C-27 environmentSize for the tier
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
  constructor(device: RenderDevice, factory: EnvironmentProbeFactory /* C-09 slot value */);
  acquire(key: { readonly url?: string; readonly preset?: string; readonly tier: AuraQualityTier }): Promise<EnvironmentProbe>;
  neutral(tier: AuraQualityTier): EnvironmentProbe;   // synchronous, generated at first call (= factory.neutral)
  release(probe: EnvironmentProbe): void;
}

// RenderSource (contracts/renderSource.ts; fields pre-declared by PR 0a, CONTRACTS §3.5):
export interface RenderSource {
  // ...existing...
  readonly environmentProbe?: EnvironmentProbe | null;                    // required when model "physical"
  readonly ambient?: { readonly color: readonly [number, number, number]; readonly intensity: number };   // irradiance
  readonly hemisphere?: { readonly sky: readonly [number, number, number]; readonly ground: readonly [number, number, number]; readonly intensity: number };
  readonly environmentBackground?: EnvironmentBackgroundOptions | false;   // existing field; PRD 02's renderer/Background.ts now sets it
  readonly reflectionProbes?: readonly ReflectionProbeResource[];
  readonly irradianceVolumes?: readonly IrradianceVolumeResource[];
  readonly shadows?: ShadowSystemConfig;                                    // supersedes `shadow?: RendererShadowOptions` under the flag
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
  readonly tier: AuraQualityTier;                  // C-27
}
export class ShadowSystem {
  // Depth programs come from DepthPass variant composition over registered C-11 depth features; no legacy ShaderLibrary dependency.
  constructor(device: RenderDevice);
  update(config: ShadowSystemConfig, sceneItems: readonly RenderItem[], camera: CameraLike /* C-08 */ & { readonly near: number; readonly far: number; readonly viewMatrix: Mat4 }): ShadowFrameUniforms;
  dispose(): void;
}
// ShadowFrameUniforms: frozen in C-11 (cascadeTexture, cascadeMatrices[4×mat4], cascadeSplits, cascadeTexelWorld,
// atlasTexture, localShadowData, perLightShadowIndex). With the §3.4 2d-array target pending, cascadeTexture is the
// cascade-0 target and the others are published as `prd02.cascadeTextures` on the C-01 blackboard.

// shadows/ShadowCasterVariants.ts — real implementations of the C-11 functions:
//   resolveShadowCasterVariant(item: RenderItem, flags: QrFlags): ShadowCasterVariantKey
//   shadowCasterVariantId(key: ShadowCasterVariantKey): string   // stable; part of the depth program key

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

// Sampling (C-12, contracts/sampling.ts; fields pre-declared on SamplerDescriptor by PR 0a):
//   SamplerDescriptor.compare?: "less-equal" | "greater-equal"; addressW?; mirror?
// PRD 02's webgl2/Samplers.ts (real C-12 device mapping): honours `compare` (COMPARE_REF_TO_TEXTURE + func),
//   `mirror` (MIRRORED_REPEAT), and downgrades *-mipmap-* to the non-mip filter when the bound texture has
//   mipLevels === 1 (no incomplete-texture black). WebGPU mapping is request Q-11-2.
// The Sampler constructor default (Sampler.ts:27, owner 04) stays "linear"; PRD 02 sets "linear-mipmap-linear"
//   explicitly on every environment/probe binding it creates, and asks PRD 04 for the default change (Q-04-1).
```

### 7.3 Removed or changed

Every action applies only with `A3D_QR_LIGHTING` on. The flag-off path is untouched until the flag is
`default-on` for two checkpoints; then PRD 02 deletes the off path in one PR (CONTRACTS §5.4). "Where" names the
owning file after PR 0b.

| Symbol | Where (owner) | Action |
|---|---|---|
| `createProductionRuntimeEnvironment` `authored-ambient` branch (`index.ts:12693-12707` at `85aafcd0`) | `compiler/environment.ts` (02) | Becomes the C-09 `"legacy"` source only. Under the flag `resolveEnvironment` returns `ambient` additively (`RenderSource.ambient`). |
| Category preset selection (`index.ts:12708-12722`), `createExternalParityEnvironmentLighting("gameplay"\|…)` as defaults | `compiler/environment.ts`, `ExternalParityRenderPreset.ts` (02) | Bypassed under the flag; the `"neutral-room"` source (priority 0) is the floor. Deleted at flag removal; parity tests that still need them get a PRD 02-owned copy in `tests/qr/prd02/fixtures/legacy-external-parity-presets.ts`. |
| `createProductionRuntimeFallbackLights` (`index.ts:13363-13401`) | `compiler/lights.ts` (02) | Returns `[]` under the flag. With no lights, the neutral environment lights the scene. |
| `createProductionRuntimeShadowOptions` strength and size heuristics (`index.ts:12942-12984`) | `compiler/shadows.ts` (02) | Replaced under the flag by `resolveShadowSystemConfig(snapshot, lights, tier)`. |
| `resolveProductionRuntimeShadowTuning` bias heuristic (`index.ts:12986-13001`) | `index.ts` (15) | Not edited. Bypassed: `resolveShadowSystemConfig` does not call it. Deletion at flag removal is request Q-15-1. |
| `resolveProductionShadowCasterIndex` single slot (`index.ts:13172-13199`) | `index.ts` (15) | Not edited. Under the flag, `compiler/shadows.ts` recomputes casters with `selectShadowedLights(descriptors, { autoSunShadow, max })`, which returns many slots and ignores the legacy single index. Deletion at flag removal is Q-15-1. |
| Point descriptor `shadowRequested: false`, `range: 10 * scale` (`index.ts:13241-13245`) and the rect/softbox spot proxies (`:13274-13296`) | `index.ts` (15) | Not edited. Under the flag, PRD 02's C-36 `light` `NodeHandler` emits physical descriptors (distance, decay, power, rect kind, per-light shadow request) and the legacy descriptor function is not called. |
| `RendererShadowOptions` (`Renderer.ts:363-376`) | `renderer/ShadowOrchestration.ts` (02) | Kept as a deprecated input, mapped to `ShadowSystemConfig` (`strength` → `intensity`). Removed at flag removal. |
| `selectForwardShadowMap` (`ForwardPass.ts:834-854`) | `forward/Lighting.ts` (02) | Kept on the legacy path (stable cascades); superseded by per-fragment selection in the chunk; deleted at flag removal. |
| `readShadowFacePixels` and `executeRendererPointShadowMap` CPU path (`Renderer.ts:1516-1603, 1915-1931`) | `renderer/ShadowOrchestration.ts` (02) | Not executed under the flag (atlas tiles instead). Deleted at flag removal. |
| `production-runtime/environment/PMREMGenerator.ts` | 02 | Remains the C-09 stub's backing. Deleted at flag removal. The CPU FIS survives as `environment/workers/cpuPrefilter.ts` (fallback only). |
| `RootEnvironmentMapPreset` intensity scalars (`index.ts:4216-4223`) | `index.ts` (15) | Not edited; ignored under the flag (the C-09 resolution carries intensity). Deletion is Q-15-1. Exposure presets (`:4204-4214`) are PRD 01's `app/colorManagement.ts`. |
| Diagnostics `mapType: "pcf-soft"` (`index.ts:1829, 4614`), name-counted contact shadows (`index.ts:4485-4487, 4533, 9317, 9337`) | types and evidence helpers (15) | Not edited. PRD 02 registers C-31 sections `lighting` and `shadows` with observed values; the old keys stay derived for one minor. Removing the name heuristics is request Q-15-2. |
| Lint "add lights.studio() or lights.ambient()" (`index.ts:18256`) | `looks/generatedCodeWarnings.ts` (13, R8) | Not edited. PRD 02 registers the C-34 rule `look/ambient-flattens` (ambient intensity > 1 with an environment present) and supplies the replacement text as fact F-02-03. |
| `GameRenderPreset` shadow strength 0.38 and IBL-less top-down (`GameRenderPreset.ts:344-347, 420-434`) | 11 | Request Q-11-1 (strength 1 under `A3D_QR_LIGHTING`; environment from the scene). |

---

## 8. Shader changes (GLSL ES 3.00; WGSL twins carried on the same C-02 chunk entries)

All lighting code is written as **C-02 shader chunks and features in PRD 02-owned files**
`packages/rendering/src/shaders/chunks/{lighting_ibl,lighting_punctual,shadow_receive,shadow_caster,sh9,contact_shadow}.glsl.ts`
(CONTRACTS §4.1 row 02), registered from `src/lanes/prd02.ts` with `registerShaderChunk` /
`registerShaderFeature` at the hook points `fragment:lights` and `fragment:indirect` (C-02), plus C-11 depth
features for `shadow_caster`. Chunk names: `a3d_prd02_lighting_ibl`, `a3d_prd02_lighting_punctual`,
`a3d_prd02_shadow_receive`, `a3d_prd02_shadow_lookup` (= C-11 `SHADOW_LOOKUP_CHUNK`), `a3d_prd02_sh9`
(= C-09 `SH9_CHUNK`), `a3d_prd02_contact_shadow`.

- **Frozen legacy.** `ShaderLibrary.ts`, `ShaderLibraryCore.ts` and `ShaderChunks.ts` (owner 01) are the flag-off
  path and are not edited by PRD 02 (CONTRACTS §3.7). The copy-pasted lighting there (research/02 §3.4) is
  deleted by PRD 01 when `A3D_QR_CORE` is removed. The "Deleted" notes below name what PRD 02's chunks replace;
  they are not PRD 02 edits.
- **Visibility.** The chunks reach production draws when the C-02 generator is real (`A3D_QR_CORE=v2`). With the
  C-02 stub (`generateProgram` throws `PROGRAM_GENERATOR_PENDING`), each chunk is compiled and numerically tested
  in `contracts/testing/ChunkHarness.ts` against a CPU reference and three r185 formulas (standalone, 16.1).
- **Legacy-path patches** that PRD 02 wants before the generator is real are requests Q-01-1..Q-01-4 (§12.3).
  They are guarded by a uniform PRD 02 sets only with its flag on, so flag-off pixels are unchanged.
- **WGSL.** Each chunk entry carries an optional `wgsl` twin; validation runs through `tools/wgsl-validate/`
  (owner 11). The WebGPU path executes only when C-29 reports a real WebGPU backend (`A3D_QR_WEBGPU`).
- Under Track T, these chunks are replaced by three's `lights_*` and `envmap_*` chunks and the TSL equivalents.

### 8.1 `lighting_ibl.glsl.ts`

```glsl
uniform samplerCube u_envSpecular;          // RGBA16F, mips
uniform float u_envMipCount;                // N
uniform float u_envRotation;                // radians
uniform float u_envDiffuseIntensity;
uniform float u_envSpecularIntensity;
uniform vec4  u_envSH[7];                   // 27 coefficients packed (L0..L2 × rgb); cosine constants folded at upload from the C-09 radiance sh9
uniform vec3  u_ambientIrradiance;          // ambient.color * ambient.intensity
uniform vec3  u_hemiSky; uniform vec3 u_hemiGround; // pre-multiplied by intensity
uniform vec3  u_hemiDirection;              // normalized; default (0,1,0)
// All u_env*, u_ambient*, u_hemi* values live in the std140 block A3DEnvironment (6.10); shown as loose uniforms for readability.

vec3 a3dRotateY(vec3 d, float a) { float c = cos(a), s = sin(a); return vec3(c*d.x - s*d.z, d.y, s*d.x + c*d.z); }
float a3dRoughnessToLod(float r) { return (u_envMipCount - 1.0) * r * (2.0 - r); }

vec3 a3dSH9Irradiance(vec3 n) {           // Ramamoorthi–Hanrahan; constants folded at upload (u_envSH)
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

`dfg` and `multiscatter` come from PRD 01's `u_dfgLut` (C-02, R4), which PRD 04's lobes also read. While
the C-02 `brdf` chunk is a stub, the ChunkHarness binds an r185-identical RG16F LUT from
`tests/qr/prd02/shims/dfgLut.ts` (copied from three r185 `DFGLUTData.js`, MIT notice). The LUT is always
bound; it is never `(1, 0)`.

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
  `layout(std140) uniform AuraLights { vec4 lightData[192]; vec4 lightMeta; };` (3 KB, see 6.10). The
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

Composition order is **model × instance**. That keeps the forward convention. The `size`-into-instance fix
(E31) is PRD 15's R18 correctness fix in `compiler/primitives.ts`; because the depth variant reads the same
instance matrices as the forward pass, the shadow matches the drawn geometry with or without it.

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
  9 texels of **radiance** SH (the C-09 `sh9` semantics). The cosine-lobe constants
  `{π, 2π/3, 2π/3, 2π/3, π/4 …}` are folded when `u_envSH` is uploaded, never stored in `sh9`.
- **`environmentBackground.frag`** (replaces `ShaderLibraryCore.ts:808-889`). Under
  `A3D_BG_EQUIRECT`, sample the equirect at lod 0. Otherwise use
  `textureLod(u_envSpecular, rotY(dir), a3dRoughnessToLod(blurriness))`. Multiply by `u_bgIntensity`
  and write linear HDR. No in-shader tone map: the chunks never call the Narkowicz ACES at
  `ShaderLibraryCore.ts:588-593` (frozen legacy), and the single tone map is PRD 01's `OutputPass` (C-05, R2).
  With the C-05 stub the legacy present path tone-maps the frame; the background pass writes what that path
  expects, and HDR-correct background output is integrated acceptance.

### 8.8 WGSL (Track R, WebGPU path; executes only when C-29 reports a real WebGPU backend, `A3D_QR_WEBGPU`)

The mappings are:

- `texture_depth_2d_array` + `sampler_comparison` + `textureSampleCompareLevel`
- `texture_cube<f32>` + `textureSampleLevel`
- `texture_3d<f32>` for the irradiance volume
- `depth32float` targets

No regex GLSL→WGSL marker translation (research/07 §2) may be used for these programs.

---

## 9. Rendering changes (frame order and resource lifetime)

Per frame, under the "physical" model (`A3D_QR_LIGHTING` on). Each step names the C-01 phase and contributor id
it runs in; nothing is inserted into PRD 01-owned files.

1. **Resolve lighting state** (CPU, engine). The C-36 compile/update stub (wrapping the moved
   `createProductionRuntimeRendererInput`, `compiler/renderInput.ts`, owner 15) calls PRD 02's
   `compiler/{environment,lights,shadows}.ts` and the PRD 02 `NodeHandler`s for `light`, `environment` and
   `probe`, which write through `RenderSourceContributions.set(...)`:
   - Environment: C-09 `resolveEnvironment(snapshot, tier, flags)` → `EnvironmentCache.acquire` (async; the
     neutral probe is bound until it resolves).
   - Ambient and hemisphere irradiance.
   - Collected lights with units.
   - `ShadowSystemConfig` from the lights plus the C-27 tier.
   - Probe list.
   - `environmentBackground` when the environment's background is visible.

   Under the flag the PRD 02 output wins over `compatibility.source` for lighting fields. Compatibility sources
   may still provide `environmentProbe`, but not legacy procedural maps.
2. **Probe maintenance** (phase `collect`, contributor `prd02.probes`, sub-flag `A3D_QR_LIGHTING_PROBES`).
   Time-sliced reflection-probe face captures, with at most 1 face per frame on High and 6 on Ultra, and
   irradiance-volume bakes on demand, through C-09 `EnvironmentCaptureRequest.renderFace`. Capture renders with
   probes disabled, to avoid feedback.
3. **Shadow pass** (phase `shadows`, contributor `prd02.shadows`, `ShadowSystem.update`):
   - Collect casters from the **full scene item list** after LOD selection but **before camera frustum
     culling** (fixes E21). The list is snapshotted in phase `collect` (the C-01 stub runs it right after
     `collectRenderItemsWithDiagnostics`, `Renderer.ts:555`). If PRD 11 moves culling earlier, request Q-11-4
     asks it to publish the pre-cull list on the blackboard. Cull per cascade or tile frustum.
   - Draw with variant programs (C-11).
   - The cascade targets and atlas are allocated once per tier change, not per frame.
   - The legacy orchestration in `renderer/ShadowOrchestration.ts` (carved `Renderer.ts:1354-1603`) is skipped
     under the flag; `prd02.shadowFrameUniforms` is published on the blackboard (C-11).
4. **Depth/normal prepass** (PRD 01, C-01 `sceneDepthCopy`). Consumed when real. With the stub, the contact
   pass renders its own half-res camera depth (6.5).
5. **Contact shadow pass** (phase `after-opaque`, contributor `prd02.contactShadows`, sub-flag
   `A3D_QR_LIGHTING_CONTACT`), producing the R8 mask. With the C-01 stub `after-opaque` runs after the single
   ForwardPass, so the mask is one frame late; the chunk samples last frame's mask (documented deviation,
   diagnostic `CONTACT_MASK_PREVIOUS_FRAME`) until PRD 01 splits the pass (Q-01-6; PRD 02 does not wait for it).
6. **Background pass** (phase `background`, contributor `prd02.background`; the stub inserts it after the
   `EnvironmentBackgroundPass` `addPass` at `Renderer.ts:650`). Depth = far, so depth-tested pixels pass only
   where nothing was drawn. A C-21 sky with its flag on takes this slot instead (6.2).
7. **Forward opaque** (PRD 01, reserved phase). Per-frame lighting uniforms come from the `AuraLights` block
   (C-08 name, PRD 02 layout). Per-draw state is limited to probe weights and `receiveShadow`, bound by PRD 02's
   `forward/Lighting.ts`.
8. **Transparent forward.** Same lighting. Shadows are received, and blended casters cast only through
   `alphaHash`.
9. **SSR** (PRD 03's C-13 pass, `before-tonemap`, C-27 `ssr`). Then the single tone map in OutputPass (C-05).

Resource lifetime:

- Environment probes are reference-counted in `EnvironmentCache`, with the tier-dependent resident
  limit from section 17 (3; 2 on Medium when any resident probe is RGBA16F; always 2 on Ultra).
- On a tier change the cube is regenerated at the new face size.
- Prebaked presets are RGB9E5 KTX2 without supercompression, read by PRD 02's `environment/Rgb9e5Cube.ts`
  in a Worker; no Basis transcoder is involved (6.2).
- On device loss, the probes and the shadow system are recreated from cache keys, hooked through C-29
  `onDeviceRestored` (stub: today's context-restore path).

---

## 10. Migration plan

1. **Flag first.** `A3D_QR_LIGHTING` (alias `lighting.model`) gates both paths. Its default moves only through
   the CONTRACTS §5.3 states, which the PRD 15 custodian records at checkpoints:
   - `dev` → `standalone-accepted` when 16.1 passes in PRD 02's own CI. From then on PRD 14 routes and PRD 13
     templates may opt in; benchmarks and lane scenes already run it via `qrFlags`.
   - `integrated-accepted` when 16.2-16.4 pass at a G-PANEL round: on for new apps and templates.
   - `default-on` after two clean checkpoints; `legacy-3.0` (`?a3d-qr=-lighting`) logs a deprecation warning.
   - Two checkpoints later PRD 02 removes the off path and every 7.3 item in one PR (§5.4).
2. **Codemod** `aura3d migrate lighting`, registered through C-39 (`registerCodemod`) from PRD 02's
   `packages/aura3d-cli/src/commands/prd02/migrateLighting.ts`. It operates on the AST through the existing CLI
   parser utilities and prints a per-file report. Its rewrites are:
   - `shadows.contact(` → `decals.blobShadow(` (only once Q-07-1 has landed; before that it is a report line).
   - `lights.point({...})` gains `distance: 10 * scale` only when the file opts into `--preserve-range`.
     Otherwise it is left as-is, with a report line saying the light is now infinite-range with decay 2.
   - `lights.ambient({ intensity: x })` is kept, with a report line: "ambient is now 1/π of 3.0 and adds
     to IBL; expect brighter specular and less flat fill. Consider removing ambient if an environment is
     present."
   - `environments.studio()` and the other legacy calls stay as-is; they resolve to aliases
     (section 11).
   - Any `effects.colorGrade({ exposure })` is left untouched (exposure is C-05/C-13, owners 01/03).
   - Scenes with neither an environment nor lights are reported as "now lit by the neutral environment
     only, with no shadows; add `lights.directional({ shadow: true })` for grounding".
3. **First-party content (R20, R21: PRD 02 writes no route, template or example file):**
   - PRD 02 runs the codemod in report mode over `apps/showcase-*`, `apps/aura-clash-showcase`, `templates/*`,
     `packages/create-aura3d/templates/*` and `examples/*` and commits the reports to
     `docs/project/aura3d-quality-rebuild/evidence/prd02/migrate-lighting/<app>.md`.
   - PRD 14 applies them per route (Q-14-1) and PRD 13 per template (Q-13-1), each opting into
     `A3D_QR_LIGHTING` in its own source. Per-game art direction (preset choice, sun direction, removing
     point-light spam) is PRD 14 work.
   - The A/B game capture in 16.3 does not need any of this: it runs the shipped routes with
     `qr_flags=lighting` through `quality-rebuild-capture.yml`'s `qr_flags` input (C-33), so it measures the
     defaults alone.
4. **Scene kits.** PRD 02 owns `nodes/sceneKits.ts` (`makeSceneKit`/`sceneKits`, `index.ts:9841-10005`, R7).
   Under the flag, kits switch from ambient + directional to `environments.preset(...)` +
   `lights.directional({ shadow: true })`. Prompt recipes (`index.ts:10103-10363`) are PRD 13's; PRD 02 hands
   the recipe over as fact F-02-02 (C-40). The old task pointing at `index.ts:10152-10245` is withdrawn (R7).
5. **Skills** (PRD 13 owns the text, R20; PRD 02 appends verified C-40 rows F-02-01..F-02-06 to CONTRACTS
   Appendix B):
   - `aura3d-core`, `aura3d-browser-game` and `aura3d-scene-authoring` teach environment preset + sun +
     optional ambient, and the units table.
   - `aura3d-threejs-migration` maps three intensities 1:1, because units now match, and maps
     `AmbientLight` and `HemisphereLight` 1:1.
6. **three-compat ledger** (`packages/three-compat`, owner 15). Request Q-15-3: remove the approximation
   entries for point distance/decay, ambient scale, shadow intensity and env background once their facts are
   `verified`, and add entries for anything not yet matched (VSM, `shadow.radius` semantics).

---

## 11. Backward compatibility

| Surface | 3.1 behaviour | Break? |
|---|---|---|
| `lights.ambient(...)` | Accepted. Adds `color·intensity·albedo/π` on top of IBL. | Visual change (intended). Flag off (`legacy-3.0`) restores it until §5.4 removal. |
| `lights.directional({ shadow: boolean })` | `true` → default `AuraDirectionalShadowOptions`. `false` → never casts. `undefined` → may be promoted by `autoSunShadow`. | No API break. Shadow intensity 1.0 is a visual change. |
| `lights.point/spot` with no distance or decay | Infinite range, decay 2. The default intensities change only when omitted. | Visual change. The codemod's `--preserve-range` option keeps the old range. |
| `lights.rect/softbox` | Real area light, no longer a spot proxy. The spot cone disappears. | Visual change. |
| `environments.studio/materialLab/productHero/metalStudio/glassStudio` | Aliases: `preset("studio")` with intensity 1, rotation 0. `nightCinematic` → `preset("night")`. `color` is still honoured as a radiance tint. Background defaults to **false** for aliases, so existing scenes keep their clear colour. | Visual change in reflections (intended). No API break. |
| `environments.hdri(...)` | Same options. Background defaults to **true**. `reflectionTexture` is still supported as a second probe. | Visual change: the sky appears. |
| `shadows.contact(...)` | Deprecated alias of `decals.blobShadow`. No longer counted as a "contact shadow" in diagnostics. | Diagnostics change. |
| `RendererShadowOptions` on direct `Renderer` users | Mapped: `strength` → `intensity` (the default changes 0.65 → 1.0), `cascadeCount` → `cascades.count`, `filterKernel` ignored with a warning. | Visual change. Removed at flag removal (CONTRACTS §5.4). |
| `diagnostics().renderer.shadows.mapType` | Superseded by `lighting.diagnostics().shadows[i].filter` and PRD 02's C-31 `shadows` section. The old key stays one minor with the *derived* value. | Schema change. PRD 12 reads the C-31 section schema, so no evidence-tool edit is needed from PRD 02. |
| Scenes with no lights | Lit by the neutral environment only. No fallback rig and no shadow. | Visual change (intended). The C-34 rule and the PRD 13 lint warn. |
| `compatibility.source` with legacy `environmentLighting` procedural maps | Honoured only with the flag off. Under `physical` it warns and the environment probe is used. | Aura Clash route migration is PRD 14's (R21, Q-14-1). |

Anything not listed keeps its current behaviour.

---

## 12. Contracts consumed / provided

The earlier "Dependencies on other PRDs" table is replaced by contracts. PRD 02 builds against each consumed
contract's PR 0 stub and never waits for the provider's real implementation. What a stub can and cannot show
decides whether a criterion is standalone (16.1) or integrated (16.2-16.4). Resolved conflicts from CONTRACTS §0
that changed this PRD: R1 (tier type is C-27's), R4 (DFG LUT is PRD 01's), R7 (PRD 02 owns scene kits, not
prompt recipes), R8 (PRD 02 registers a lookLint rule instead of editing `index.ts:18256`), R9 (anisotropy table
in C-12 is L4/M8/H16/U16), R20 (no template/skill edits), R21 (no route edits), R22 (no `games.json` edits).

### 12.1 Contracts provided

| ID | Name | Provider / consumers | Stub that must keep working (PR 0, CONTRACTS) | Real (PRD 02) |
|---|---|---|---|---|
| C-09 | EnvironmentSource / EnvironmentProbe | 02 → 04, 07, 10, 13 | `resolveEnvironment` runs the moved verbatim `createProductionRuntimeEnvironment` as `{ kind: "legacy" }` (ambient-replaces-IBL preserved with the flag off); `environmentProbeFactorySlot.stub` wraps `production-runtime/environment/PMREMGenerator.ts` with CPU `sh9` and `source: "legacy"`; `a3dSampleIrradianceSH` stub = hemisphere pair from SH bands 0/1 | `environment/{EnvironmentProbe,EnvironmentProbeFactory,GPUPMREMGenerator,EnvironmentCache,SphericalHarmonics,RoomEnvironmentScene}.ts`; sources `prd02.explicit` (400) and `prd02.neutral-room` (0); `environments.preset/neutral/none/hdri/capture`; chunk `a3d_prd02_sh9` |
| C-10 | Lighting API + lighting runtime | 02 → 10, 12, 13, 14 | `hemisphere` lowers to two 0.5 directional fills with `capability-degraded`; `distance`/`decay`/`power` inert and listed in `DIAGNOSTIC_ONLY_FIELDS`; `app.lighting.diagnostics()` reports `getShadowEvidence` (`Renderer.ts:442`) values, unknown fields `null` | physical units, hemisphere, shadowed local lights, CSM, contact shadows, probes; `app.lighting` via C-38; PRD 02's `compiler/diagnosticOnly.prd02.ts` entries removed as each field is wired |
| C-11 | ShadowCaster depth-variant hook + shadow lookup | 02 → 06, 07, 10, 11 | `resolveShadowCasterVariant` fills only `instanced`/`doubleSided` (today's `registerLeanDepthShader`, `ShaderLibraryCore.ts:784-806`); registered depth features stored; `a3dSunShadowAt` returns 1.0 | `shadows/{ShadowSystem,ShadowCasterVariants,DirectionalCascadeFitter,ShadowAtlas,ShadowFilterKernels,ShadowFrameUniforms}.ts`, `DepthPass.ts` variant composition, chunk `a3d_prd02_shadow_lookup`, blackboard `prd02.shadowFrameUniforms` |
| C-12 | Sampler / texture-sampling descriptors | 02 → 04, 05, 10 | descriptor fields inert in the device (today's mapping `WebGL2Device.ts:4139-4155`); `resolveSamplerAnisotropy` real (R9 table); `resolveLightingSamplerBudget` returns `{ droppedFeatures: [] }` | `webgl2/Samplers.ts` (compare, mirror, addressW, 1-mip downgrade); `environment/LightingSamplerBudget.ts` |

Conformance suites (PRD 15-owned, must pass for `stub` and `real`): `tests/unit/contracts/C-09-environment.test.ts`,
`C-10-lighting.test.ts`, `C-11-shadow-variants.test.ts`, `C-12-sampling.test.ts`, and
`tests/browser/contracts/{C-09-probe,C-10-lighting,C-11-skinned-shadow,C-12-sampler}.spec.ts`. PRD 02 adds
`tests/unit/contracts/impl/prd02-{environment,lighting,shadows,sampling}.test.ts`.

Registry entries PRD 02 provides into other contracts: C-01 contributors `prd02.probes` (`collect`),
`prd02.shadows` (`shadows`), `prd02.background` (`background`), `prd02.contactShadows` (`after-opaque`); C-02
chunks `a3d_prd02_*` and features `prd02.*`; C-11 depth features `prd02.depthInstancing`, `prd02.depthAlpha`,
`prd02.depthSkinning`; C-31 sections `lighting` and `shadows`; C-34 rule `look/ambient-flattens`; C-36
`NodeHandler`s for `light`, `environment`, `probe` and option-coverage rows for every lights/environments/shadows
field; C-38 member `lighting`; C-39 codemod `migrate lighting` and command `environments bake`; C-30 scenes
`prd02-*`; C-40 facts `F-02-*`.

### 12.2 Contracts consumed

| ID | Name | Provider | Stub behaviour PRD 02 relies on (day 0) | Effect on acceptance |
|---|---|---|---|---|
| C-01 | FrameGraph phase hooks | 01 | Contributors run at the stub positions (`collect` after `Renderer.ts:555`, `shadows` after :622, `background` after :650, `after-opaque` after the single ForwardPass); `sceneDepth` is `{ texture: null, available: false }` | standalone: own depth for contact mask; integrated: same-frame mask with real `sceneDepthCopy` |
| C-02 | ProgramFeatures, chunk registry, ProgramCache, `u_dfgLut`, ChunkHarness | 01 | Registries real; `generateProgram` throws `PROGRAM_GENERATOR_PENDING`; cache wraps `ShaderLibrary` | chunk numerics standalone in ChunkHarness; chunk pixels on production draws integrated (`A3D_QR_CORE=v2`) |
| C-05 | Output: HDR target, tone map, background coverage | 01 | Legacy present path and legacy scene target | HDR-correct background and lighting output integrated |
| C-08 | Frame uniforms, `CameraLike`, `AuraLights` name | 01 | `buffer: null`; renderer resolve accepts a plain `CameraLike` (PRD 02 removes the `instanceof` gate in its own carve-out); `{0.1, 1000}` literal remains for post | standalone (CSM from plain camera; own std140 packer for `AuraLights`) |
| C-13 | PostPass registry | 03 | Passes stored; legacy chain runs | SSR composite integrated |
| C-18 | Deformation resources, deform chunk | 06 | Registry real; no `prd06.deform` depth feature yet | standalone skinned casters via `prd02.depthSkinning`; morph casters integrated |
| C-21 | Sky / fog / atmosphere | 07 | `sky.*` lowers to `sky.dayNight`; `skyBackgroundSlot.stub.renderToCubeFace` clears to the horizon colour; `onSkyChanged` callable | `environments.capture({ include: "sky-only" })` standalone on the stub sky; sky-driven IBL integrated |
| C-26 | World queries / biome | 10 | Biome source not registered | biome-driven environments integrated |
| C-27 | QualityTier settings | 11 | Ships real data in PR 0a; `"auto"` → `high` desktop / `medium` coarse pointer | standalone |
| C-28 | Device probe, counters, compileAsync | 11 | `counters()` partial (`readbacks`, `programCompiles` counted by wrapping); `compileAsync` resolves after a sync compile; probe partial (PRD 02 also checks `EXT_color_buffer_float`/`_half_float` itself) | standalone (no-readback and no-compile-after-mount rules) |
| C-29 | Renderer factory / backends / device lifecycle | 11 | Today's backend selection; context-restore path | WGSL paths integrated |
| C-30 | Benchmark scene registry | 12 | Registry wraps the 18 base scenes plus lane indices | standalone (lane scenes `prd02-*`) |
| C-31 | Diagnostics sections | 12 | Sections present with null/empty values | standalone |
| C-32 / C-33 | Judgement schema, capture harness, `--flags` | 12 | Today's capture scripts with `--flags`/`qr_flags` passthrough | standalone screening; acceptance only at G-PANEL |
| C-34 | Looks + lookLint registry | 13 | Registry and host real after PR 0b | standalone (rule registered and unit-tested) |
| C-36 | SceneCompiler extension points | 15 | `compileScene` wraps the moved legacy compiler; registered handlers for existing kinds run only with their flag on | standalone |
| C-37 | RuntimeNode add/remove | 15 | `add`/`remove` via remount (`RUNTIME_ADD_REMOUNT`) | standalone (probes added at runtime) |
| C-38 | App surface extension registry | 15 | Real in PR 0 | standalone |
| C-39 | CLI command and codemod registry | 15 | Real in PR 0 | standalone |
| C-40 | Facts handoff | each lane → 13 | Document table | none (skills consume `verified` rows) |

### 12.3 Requests to other lanes (non-blocking)

Filed as `qr-request` + `to:prdNN` issues (CONTRACTS §6.5). PRD 02 never waits: each row says what PRD 02 does
meanwhile and which criterion moves to the next checkpoint after the request lands.

| ID | To | File / change | Contract | Meanwhile |
|---|---|---|---|---|
| Q-01-1 | 01 | Legacy patch (§3.7): in `ShaderLibraryCore.ts:622-623, 634` and copies, multiply the fake hemisphere and the π× ambient by `(1.0 - u_a3dPrd02Physical)` and add `u_a3dPrd02AmbientIrradiance * albedo / PI`; PRD 02 sets the uniform to 1 only with the flag on | §3.7, C-09 | ambient `/π` is applied CPU-side in `forward/Lighting.ts` by scaling the uploaded ambient by `1/π` under the flag; hemisphere stays the C-10 stub lowering |
| Q-01-2 | 01 | Legacy patch: falloff `max(d*d, 1.0)` → `max(pow(d, decay), 0.01)` with decay from a spare light-data lane, guarded by `u_a3dPrd02Physical` (`ShaderLibraryCore.ts:732-735`, `ShaderLibrary.ts:3183-3186`) | §3.7, C-10 | units and range are CPU-correct; near-clamp parity is integrated (chunk path) |
| Q-01-3 | 01 | Legacy patch: diffuse env LOD `mipCount-1` → SH9 when `u_a3dPrd02ShBound > 0.5` (`ShaderLibraryCore.ts:636-638`; `ShaderLibrary.ts:368, 966, 1496, 2643-2644`) | §3.7, C-09 | SH9 diffuse visible only through the chunk (integrated) |
| Q-01-4 | 01 | Remove `A3D_PBR_NO_SPOT_SHADOW` from the 3 textured variants (`ShaderLibrary.ts:2067, 2073, 2075`; guards 2221, 2562, 3196) as a declared correctness fix (§6.1); PRD 12 re-baselines | §3.7 | spot shadows absent on those 3 variants until it lands |
| Q-01-5 | 01 | Implement the §3.4 `RenderTargetDescriptor` fields PRD 02 uses: `dimension: "cube" \| "2d-array"`, `layers`, `depthOnly`, `depthCompare` (also removes the RGBA8 colour attachment of shadow targets, `WebGL2Device.ts:663-676`) | §3.4 | one 2D depth target per cascade; 6 2D targets copied into a cube via `copyTexSubImage` for PMREM; shadow targets keep the colour attachment |
| Q-01-6 | 01 | Publish `sceneDepthCopy` from the split ForwardPass and run `after-opaque` before transparents | C-01 | PRD 02's own half-res depth; mask one frame late |
| Q-03-1 | 03 | Publish the GTAO texture as `prd03.ao` on the C-01 blackboard (linear-hdr post input) | C-01, C-13 | `SO` from material AO only; `droppedFeatures` lists `gtao-input` |
| Q-03-2 | 03 | SSR pass: real `depthRange` from C-08, run `before-tonemap`, read `prd02.envSpecular`/`prd02.roughnessToLod`, composite as a `L_spec` replacement per 6.7 | C-13, C-08 | SSR criteria are integrated only |
| Q-04-1 | 04 | `Sampler.ts:27` constructor default `minFilter` → `"linear-mipmap-linear"` with the 1-mip downgrade that PRD 02's `webgl2/Samplers.ts` now provides | C-12 | PRD 02 sets the filter explicitly on all lighting bindings |
| Q-05-1 | 05 | Admit 2k CC0 HDRIs for sunset, night and indoor (plus optional 2k studio/outdoor) into the C-17 library with license + SHA | C-17 | day-0 presets use the 3 in-repo 1k HDRIs and the neutral room, tagged `stand-in` (6.2) |
| Q-07-1 | 07 | Spread `blobShadow` from PRD 02's `nodes/shadows.ts` into the `decals` namespace (`agent-api/Decals.ts`) | C-10 | `shadows.contact` remains the entry point |
| Q-11-1 | 11 | `GameRenderPreset.ts:344-347` strength 0.38 → 1.0 and remove the IBL-less top-down override (`:420-434`) when `A3D_QR_LIGHTING` is on | C-27 | routes that bypass `compiler/shadows.ts` keep 0.38 (integrated) |
| Q-11-2 | 11 | `WebGPUDevice.ts`: comparison samplers, `depth32float`, the 0.65 strengths at `:2215, 2280, 2811` → 1.0 under the flag, and the C-12 field mapping | C-12, C-29 | WebGPU is not an acceptance path for PRD 02 (18) |
| Q-11-3 | 11 | C-27 table data: contact shadows on Medium (sun) and High (sun + 2 spot); Ultra `environmentSize` 512 (memory, 17) | C-27 | C-27 values are used; apps opt in with `effects.contactShadows()` |
| Q-11-4 | 11 | If `renderer/CullingBatching.ts` moves culling before the C-01 `collect` phase, publish the pre-cull item list on the blackboard | C-01 | PRD 02 snapshots items in `collect` |
| Q-12-1 | 12 | Register PRD 02's region masks (`shadow-receiver`, `sky`, `metal` MaskIds) for base scenes 01, 06, 08, 09, 10, 12, 13, 15, 17, 18 in the C-30 registry, and add the "unrequested shadow" broken control to the metrics | C-30, C-33 | PRD 02 computes masks for its own `prd02-*` copies of those scenes (16.1) |
| Q-13-1 | 13 | Apply the `migrate lighting` report and F-02-* facts to templates and skills; replace `index.ts:18256` text with F-02-03 | C-34, C-40, R20 | none needed for PRD 02 acceptance |
| Q-14-1 | 14 | Per route: apply the `migrate lighting` report, opt into `A3D_QR_LIGHTING`, Aura Clash compat-source migration; add the planet-half region masks for Orbital Defense and Gravity Post to `games.json` | R21, R22, C-35 | game criteria are integrated only |
| Q-15-1 | 15 | At PRD 02 flag removal: delete `resolveProductionRuntimeShadowTuning` (`index.ts:12986-13001`), `resolveProductionShadowCasterIndex` (`:13172-13199`), the legacy light-descriptor branches (`:13233-13296`), `RootEnvironmentMapPreset` intensity scalars (`:4216-4223`) | C-36 | bypassed under the flag |
| Q-15-2 | 15 | Remove name-based contact-shadow counting (`index.ts:4485-4487, 4533, 9317, 9337`) and derive `mapType` (`:1829, 4614`) from the C-31 `shadows` section | C-31 | old keys reported as derived values |
| Q-15-3 | 15 | `packages/three-compat` approximation-ledger rows for light units, ambient, shadow intensity, env background | C-40 | facts F-02-04/05 carry the data |
| Q-15-4 | 15 | Lean (`packages/lean`, `LeanWebGL2Device.ts:≈3602`): keep lighting intents inert; port the 1-mip sampler downgrade if lean survives | — | none |
| Q-15-5 | 15 | `compiler/primitives.ts`: copy `node.receiveShadow` into `RenderItem.receiveShadow` (E27) | C-36, §3.3 | PRD 02 tests use lane fixtures that set the field |
| Q-04-2 | 04 | `TypedGLBActor` render items: copy the node's `receiveShadow` and `castShadow` | §3.6 | model receivers always receive |
| Q-06-1 | 06 | `webgl2/TextureUpload.ts`: accept `RGB9_E5` (cube, mips) as an internal format for float data | — | PRD 02 expands RGB9E5 to RGBA16F in its Worker |

### 12.4 Contract Change Requests (additive only, CONTRACTS §6.4)

| ID | Contract | Change | Meanwhile |
|---|---|---|---|
| CCR-02-1 | C-12 | Add `"pcss-raw"` and `"ltc"` as reportable downgrade names alongside `LIGHTING_SAMPLER_DROP_ORDER` | reported as `downgrade:pcss-raw` strings in `droppedFeatures` |
| CCR-02-2 | C-10 / §3.2 types | Optional fields on `AuraEnvironmentNode` (`preset`, `diffuseIntensity`, `specularIntensity`, `background` object, `capture`) and `environment` union members `"preset" \| "neutral" \| "none" \| "capture"` | `AuraEnvironmentNodeV2` in `nodes/environments.ts` |
| CCR-02-3 | C-10 | Optional `AuraLightingDiagnostics` extras (7.1) | extras live in the C-31 `lighting`/`shadows` sections |

---

## Parallel execution

### Day-0 start conditions

PRD 02 starts on 2026-10-05 from the PR 0a branch (CONTRACTS §3.9). The only prerequisites are PR 0a
artifacts: `packages/rendering/src/contracts/{core,frameGraph,program,frameUniforms,environment,shadows,sampling,
post,deform,atmosphere,quality,device,rendererFactory,renderItem,renderSource}.ts` and `testing/ChunkHarness.ts`;
`packages/engine/src/contracts/{flags,environment,lighting,diagnostics,looks,compiler,runtimeNodes,app}.ts` and
their `stubs/`; the C-10/C-12 pre-declared fields; the lane barrels `packages/{rendering,engine}/src/lanes/prd02.ts`;
`agent-api/compiler/diagnosticOnly.prd02.ts`; `benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd02/index.ts`;
`packages/aura3d-cli/src/commands/prd02/index.ts`; and the conformance harness. Nothing from any other lane's
real implementation is needed, ever.

Work in new PRD 02 files starts on day 0. Edits to carved regions start when the PR 0b part containing them
merges (≤ 2026-10-07); until then the replacement is written in PRD 02's own new module and wired after the merge:
- PR 0b-1: `agent-api/nodes/{lights,environments,shadows,sceneKits,effects.lighting}.ts`,
  `agent-api/compiler/{environment,lights,shadows}.ts`, and the C-31/C-34/C-36/C-38 seams.
- PR 0b-2: `forward/Lighting.ts`, `webgl2/Samplers.ts`, `renderer/{ShadowOrchestration,Background}.ts`, the
  C-01 `FrameGraph.ts` dispatcher, C-09/C-11/C-12/C-28 seams.
- PR 0b-3: C-39 CLI fallthrough, capture plugins and `qr_flags` (C-33).

If a carve-out is dropped from PR 0b (CONTRACTS §3.9 size rule), its region stays with the hot-file owner and the
PRD 02 change becomes a request; PRD 02 keeps working in its new modules and C-01/C-36 registrations, which need no
carve-out.

### Owned files and directories (must match CONTRACTS §4.1 row 02)

`packages/rendering/src/{environment,probes,shadows}/`, `packages/rendering/src/passes/ContactShadowPass.ts`,
`packages/rendering/src/renderer/{ShadowOrchestration,Background}.ts`, `packages/rendering/src/forward/Lighting.ts`,
`packages/rendering/src/webgl2/Samplers.ts`, `packages/rendering/src/shaders/chunks/{contact_shadow,lighting_*,sh9,shadow_*}`,
`packages/rendering/src/shaders/pbr-direct.frag.glsl`, `packages/rendering/src/{DepthPass,ShadowPass,ShadowMap,CascadedShadowMaps,EnvironmentMapResources,EnvironmentLighting,EnvironmentBackgroundPass,EnvironmentBackgroundResources,EnvironmentPipeline,EnvironmentPlatform,ExternalParityRenderPreset,LightUniforms,ReflectionProbe,ClusteredForwardLighting}.ts`,
`packages/rendering/src/production-runtime/environment/`, `packages/rendering/src/production-runtime/PBRHDRPipeline.ts`;
`packages/environments/src/{EnvironmentRegistry,HDRIEnvironment,PMREMPreset}.ts`;
`packages/engine/src/agent-api/compiler/{environment,lights,shadows}.ts`,
`packages/engine/src/agent-api/nodes/{shadows,lights,environments,sceneKits,effects.lighting,probes}.ts`;
`public/aura-environments/`; `.github/workflows/lighting-quality.yml`.
Lane-generic (CONTRACTS §4.1 "lane NN"): this PRD file, `docs/project/aura3d-quality-rebuild/evidence/{prd02,prd-02}/`,
`packages/*/src/lanes/prd02.ts`, `agent-api/compiler/diagnosticOnly.prd02.ts`, `packages/aura3d-cli/src/commands/prd02/`,
`benchmarks/quality-rebuild/{scenes,aura3d/scenes,three/scenes}/prd02/`, `.github/workflows/qr-prd02-*.yml`,
`tests/qr/prd02/`, `tests/unit/contracts/impl/prd02-*`.

Tasks of the earlier draft that edited files owned by other lanes were converted to extension points or moved to
§12.3: `ShaderLibrary.ts`, `ShaderLibraryCore.ts`, `ShaderChunks.ts`, `ForwardPass.ts` and `Renderer.ts` outside the
carve-outs, `WebGL2Device.ts` render-target and SSR code (01); `Sampler.ts` default (04); `GameRenderPreset.ts`,
`RenderDevice.ts`, `WebGPUDevice.ts` (11); `LeanWebGL2Device.ts`, `RootRuntimeSupport.ts`, `index.ts` outside the
carves, `packages/three-compat` (15); `agent-api/Decals.ts` (07); `index.ts:18256` lint and every template and
skill (13); `benchmarks/quality-rebuild/{capture.mjs,shared/scenes.ts}`, `tools/quality-rebuild-capture/capture-games.mjs` (12);
`tools/quality-rebuild-capture/games.json` and all routes (14); KTX2 transcoder code (05).

### Extension points used in files owned by others

| Extension point | Host file (owner) | PRD 02 registration (in its own files) |
|---|---|---|
| C-01 `registerFrameContributor` | `renderer/FrameGraph.ts` (01) | `prd02.probes`, `prd02.shadows`, `prd02.background`, `prd02.contactShadows` from `shadows/FrameContributors.ts` |
| C-02 `registerShaderChunk` / `registerShaderFeature` | `program/` (01) | `a3d_prd02_*` chunks, `prd02.*` features |
| C-11 `registerDepthVariantFeature` | `DepthPass.ts` (02, host and consumer) | `prd02.depthInstancing`, `prd02.depthAlpha`, `prd02.depthSkinning` |
| C-09 `registerEnvironmentSource` | `compiler/environment.ts` (02) | `prd02.explicit`, `prd02.neutral-room` |
| C-36 `registerNodeHandler`, `registerOptionCoverage`, `DIAGNOSTIC_ONLY_FIELDS` | `compiler/` index (15) | handlers `light`, `environment`, `probe`; coverage rows; `diagnosticOnly.prd02.ts` |
| C-36 `effects` spread | `agent-api/index.ts` (15) | `lightingEffectBuilders` from `nodes/effects.lighting.ts` |
| C-37 `registerNodeHandleExtension` | `app/runtimeNodes.ts` (15) | none required; probes use `add/remove` |
| C-38 `registerAppExtension` | `app/createAuraApp.ts` (15) | member `lighting` |
| C-31 `registerDiagnosticsSection` | diagnostics host (12 schema, 15 host) | sections `lighting`, `shadows` |
| C-34 `registerLookLintRule` | `looks/` (13) | `look/ambient-flattens` |
| C-39 `registerCodemod` / `registerCliCommand` | `packages/aura3d-cli/src/commands/registry.ts` (15) | `migrate lighting`, `environments bake` |
| C-30 lane scene index | `benchmarks/quality-rebuild/shared/registry.ts` (12) | `prd02-*` scenes (16.1) |
| C-33 capture `--flags` / `qr_flags` | `capture.mjs`, `capture-games.mjs`, `quality-rebuild-capture.yml` (12) | runs with `lighting` / `all` / `none` |
| C-40 Appendix B rows | `CONTRACTS.md` (15; appends allowed) | `F-02-01..F-02-06` |

### Feature flags

| Flag | Values | Gates | PRD-local alias |
|---|---|---|---|
| `A3D_QR_LIGHTING` | bool | every PRD 02 behaviour change: C-09/C-10/C-11/C-12 real implementations, composition, neutral room, units, caster selection, shadow strength 1.0, background, diagnostics sections, lint rule | `lighting.model: "physical"` (on) / `"legacy-3.0"` (off); URL `?aura-lighting=legacy-3.0` |
| `A3D_QR_LIGHTING_CSM` | bool | cascades > 1 and per-fragment cascade selection; off = one stable, texel-snapped fitted map | `?a3dLighting=csm=off` |
| `A3D_QR_LIGHTING_PROBES` | bool | reflection probes, irradiance volumes, `prd02.probes` contributor | `?a3dLighting=probes=off` |
| `A3D_QR_LIGHTING_CONTACT` | bool | `prd02.contactShadows` contributor and chunk | `?a3dLighting=contact=off` |

Internal kill switches that are not flags (parsed in `compiler/lights.ts`): `pmrem=cpu`, `atlas=off`,
`shadowFilter=legacy-grid`, `shadows=off`, `background=off` (22).

### Stubs used

C-01 (stub phase positions, no scene depth), C-02 (`PROGRAM_GENERATOR_PENDING`, cache wraps `ShaderLibrary`,
ChunkHarness real), C-05 (legacy present), C-08 (`buffer: null`), C-13 (passes stored), C-18 (no deform depth
feature), C-21 (`sky.dayNight` lowering, horizon-colour capture), C-26 (no biome source), C-27 (real data), C-28
(partial counters, sync `compileAsync`), C-29 (today's backend), C-30, C-31, C-33, C-34, C-36, C-37 (remount),
C-38/C-39 (real). PRD 02's own stubs (C-09, C-10, C-11, C-12) stay the flag-off path until §5.4 removal.

### Integration checkpoints

Integrated acceptance (16.2-16.4) is evaluated only at CONTRACTS §7 checkpoints with `A3D_QR_LIGHTING` on inside
`qr_flags=all`, and never blocks a PRD 02 merge:
- IC-0 (2026-10-08): flags `none` baseline; PRD 02 records its per-scene and per-game baselines from it in
  `evidence/prd02/lighting-baseline/` (it reproduces research/23 and research/21).
- IC-1 (2026-10-15), IC-2 (10-22), IC-3 (10-29): weekly screening (vision-only, recorded, cannot accept).
- IC-4 (2026-11-05), IC-8 (2026-12-03), IC-12 (2026-12-31): G-PANEL rounds, the only rounds that can move
  `A3D_QR_LIGHTING` to `integrated-accepted` and satisfy 16.2-16.4. Leave-one-out (`all,-lighting`) attributes
  regressions.
- A checkpoint failure becomes a `qr-ic-regression` issue against the owning lane (CONTRACTS §7). Integrated
  criteria that depend on an open §12.3 request are evaluated at the first checkpoint after it lands.

---

## 13. Implementation phases

Each phase lands behind `A3D_QR_LIGHTING` (flag off = today's pixels, checked by the CONTRACTS §6.1 sentinel
identity run on every PR touching `packages/rendering/**` or `packages/engine/**`). Exit criteria are met on a
GitHub Actions macos-14 run (Chromium, ANGLE Metal) of `.github/workflows/lighting-quality.yml`, with the run id
recorded in `docs/project/aura3d-quality-rebuild/evidence/prd02/<phase>.md`. Phases 0 and 1 start on day 0.
Phases 3, 4 and 5 depend only on Phase 1-2 outputs and their PR 0b part, not on each other except where noted,
and run in parallel inside the lane. No phase waits for another lane; integrated criteria (16.2-16.4) are
evaluated at checkpoints and never gate a phase exit. "S-n" refers to 16.1.

**Phase 0: Lane harness and baseline (day 0, 2026-10-05 →; lane-owned files only).**

- Lane scenes in `benchmarks/quality-rebuild/scenes/prd02/` with Aura and three adapters in
  `aura3d/scenes/prd02/` and `three/scenes/prd02/` (C-30 ids `prd02-*`): copies of base scenes 06, 09, 10, 11,
  12, 13, 15, 17, 18 with PRD 02 masks, plus `prd02-16b-instancing-shadowed`, `prd02-no-lights`,
  `prd02-reflection-probe`, `prd02-red-wall-bounce`, `prd02-contact-cube`, `prd02-caster-fixtures`
  (skinned Soldier, 3×3 batch, 16 instances, alpha leaf card), `prd02-csm-poles`, `prd02-softbox`,
  `prd02-wet-floor` (integrated SSR fixture).
- `tests/qr/prd02/metrics/regionMetrics.ts`: the 16.4 metrics over capture outputs, with masks from the lane
  scene specs (`shadow-receiver`, `sky`, `metal`, subject), JPEG 1280×720 q90 export for reviewers.
- `.github/workflows/lighting-quality.yml`: unit + browser + lane-scene capture on macos-14 through the C-33
  `--flags` passthrough, run with `qr_flags=none` and `qr_flags=lighting`.

*Exit:* the flag-`none` baseline of every `prd02-*` scene on both engines is committed to
`evidence/prd02/lighting-baseline/` with the run id, and the metrics reproduce research/22's shadow numbers within
±10% on `prd02-15` (about 9% vs about 50% shadow luma drop).

**Phase 1: Day-0 work in new files only (2026-10-05 →).**

- Pure modules: `environment/SphericalHarmonics.ts` (C-09 `projectCubeToSH9`/`evaluateSH9Irradiance`),
  `environment/RoomEnvironmentScene.ts`, `environment/workers/cpuPrefilter.ts`, `environment/Rgb9e5Cube.ts`,
  `environment/LightingSamplerBudget.ts`, `shadows/{DirectionalCascadeFitter,ShadowAtlas,ShadowCasterVariants,
  ShadowFilterKernels}.ts` (logic only), the light-unit conversions and `selectShadowedLights`,
  `resolveShadowSystemConfig`, `resolveLightingTier` (written in a new module, wired into `compiler/*.ts` after
  PR 0b-1).
- All chunk files `shaders/chunks/{lighting_ibl,lighting_punctual,shadow_receive,shadow_caster,sh9,
  contact_shadow}.glsl.ts`, compiled and evaluated in ChunkHarness with the `tests/qr/prd02/shims/dfgLut.ts` LUT.
- C-39 registrations: `migrate lighting` (report mode) and `environments bake`; prebaked
  `public/aura-environments/` presets from the 3 in-repo HDRIs and the neutral room.
- C-34 rule `look/ambient-flattens`; C-31 section definitions; C-40 rows F-02-01..06 as `proposed`.

*Exit:* `pnpm typecheck:raw`, `pnpm lint`, unit tests green; C-09..C-12 conformance green on stubs; every
`a3d_prd02_*` chunk compiles in ChunkHarness on macos-14 (S14); S7 unit cases (SH, LOD mapping) pass.

**Phase 2: Engine composition, flag-gated (after PR 0b-1, ≤ 2026-10-07 →).**

- `compiler/environment.ts`: register `prd02.explicit` and `prd02.neutral-room` C-09 sources; ambient
  additive; category presets bypassed. `compiler/lights.ts`: fallback rig `[]` under the flag; tier, URL and
  kill-switch helpers. `compiler/shadows.ts`: `resolveShadowSystemConfig` + `selectShadowedLights`.
- C-36 `NodeHandler`s for `light`, `environment`, `probe`; builders in `nodes/{lights,environments,shadows,
  probes,effects.lighting,sceneKits}.ts`; option-coverage rows; `diagnosticOnly.prd02.ts` shrinks as fields wire.
- C-38 `app.lighting`; C-31 sections registered.

*Exit:* S1, S2 (engine half), S3 (engine half), S9 (CPU half), S15, S16.

**Phase 3: Environment and sampler wiring (after PR 0b-2 →).**

- `webgl2/Samplers.ts` real C-12 mapping (compare, mirror, 1-mip downgrade); C-12 `provide(real)`.
- Neutral-room probe v1: rendered on the GPU into RGBA16F faces through C-09 `EnvironmentCaptureRequest`, read
  back **once at load** (allowed by 17), prefiltered by the Worker FIS and uploaded with mips. For the frozen
  legacy shader path it is also written as a mipped RGBA16F equirect through `EnvironmentMapResources.ts`
  (owned), so the legacy IBL code samples it with `linear-mipmap-linear`.
- `GPUPMREMGenerator`, `EnvironmentCache`, `EnvironmentProbeFactory`; C-09 `provide(real)`.
- `renderer/Background.ts` sets `environmentBackground`; `prd02.background` contributor; `EnvironmentBackgroundPass`
  shader rewritten (owned file).
- `forward/Lighting.ts`: strength 1.0, ambient `/π` CPU-side, `receiveShadow`, `AuraLights` std140 packer.

*Exit:* S2, S7, S8, S10.

**Phase 4: Shadow system (after PR 0b-2; uses Phase 3's compare samplers).**

- `DepthPass.ts` variant composition with the `prd02.depth*` features; precompile through C-28 `compileAsync`.
- `ShadowSystem` in the `prd02.shadows` contributor; `renderer/ShadowOrchestration.ts` removes the
  `instanceof PerspectiveCamera` gate (C-08) and skips the legacy path under the flag; stable texel-snapped fit;
  caster list from the `collect` snapshot; `ShadowAtlas` spot/point tiles rendered on the GPU (no readback);
  C-11 `provide(real)` and `prd02.shadowFrameUniforms` published.

*Exit:* S3, S4, S5, S6, S13.

**Phase 5: Contact shadows, probes, irradiance volume, area lights (after PR 0b-2 →).**

- `passes/ContactShadowPass.ts` in `after-opaque` with its own half-res depth while C-01 is a stub.
- `probes/ReflectionProbeSystem.ts` (reusing `ReflectionProbe.ts` capture), `probes/IrradianceVolume.ts`,
  `prd02.probes` contributor; LTC LUTs (three `RectAreaLightTexturesLib.js`, MIT) in `lighting_punctual`.

*Exit:* S11, S12; S9 (rect footprint).

**Phase 6: Tiers, performance and mobile (any time after Phase 4).**

- C-27 tier wiring, per-tier measurements on lane scenes (timer queries when C-28 is real, toggle deltas
  otherwise, 17), the mobile device runs (19), the Low-tier prebaked path.

*Exit:* S17: every 17 budget met on the 19 reference devices for the `prd02-*` scenes, or a waiver signed by the
human reviewer with the measured number.

**Phase 7: Integrated acceptance and migration (checkpoint-driven; never blocks merges).**

- At each checkpoint: read the IC report for `all` vs `none` and `all,-lighting`; file fixes against PRD 02.
- Move facts F-02-* to `verified` with run ids; hand `migrate lighting` reports to PRD 13/14 (Q-13-1, Q-14-1).
- After two clean `default-on` checkpoints: delete the flag-off path and every 7.3 item (CONTRACTS §5.4).

*Exit:* section 21 "Integrated completion".

---

## 14. Task checklist

Legend: **[R]** own-renderer track only. **[R/T]** both tracks (under T the task becomes "configure the
three object accordingly and test"). Every task edits only PRD 02-owned files (Parallel execution) or registers
through a contract; tasks that need another lane's file are in §12.3. Every behaviour change is gated by
`A3D_QR_LIGHTING` (or the named sub-flag) and has a flag-off assertion. Unit tests run with
`pnpm exec vitest run <file>` (light enough for local runs per policy) and in CI; browser specs and captures run
remotely on GH Actions macos-14 only (section 15). New tests go under `tests/qr/prd02/`.

### Phase 0 (day 0): lane harness
- [ ] [R/T] Create `benchmarks/quality-rebuild/scenes/prd02/index.ts` entries (ids per Phase 0 list, `owner: "prd02"`, `qrFlags: ["lighting"]`) with Aura adapters in `aura3d/scenes/prd02/` and three r185 adapters in `three/scenes/prd02/`. Each spec declares its masks (`shadow-receiver` from a three-side render with shadows on/off differenced at > 8 luma, `sky` rows above the horizon, `metal` sphere discs for 06, subject). Test: `tests/unit/contracts/C-30-bench-registry.test.ts` passes with the new ids; `tests/qr/prd02/unit/scenes.test.ts` asserts every scene has ≥ 1 mask.
- [ ] [R/T] Write `tests/qr/prd02/metrics/regionMetrics.ts` implementing every 16.4 metric over a capture directory and writing `report.json.scenes[i].regions`, plus a JPEG 1280×720 q90 export of each frame for reviewers. Test: on a synthetic pair (lit/shadowed squares at known luma), the shadow-drop metric equals the analytic value within 1e-3.
- [ ] [R/T] Create `.github/workflows/lighting-quality.yml` (macos-14, Chromium pinned as in `quality-rebuild-capture.yml`, ANGLE Metal): jobs `unit`, `browser` (`tests/qr/prd02/browser/*.spec.ts`), `lane-capture` (lane scenes via `capture.mjs --flags none` and `--flags lighting`). Test: one green run id recorded.
- [ ] [R/T] Commit the flag-`none` baseline of all `prd02-*` scenes on both engines to `docs/project/aura3d-quality-rebuild/evidence/prd02/lighting-baseline/` (JPEG side-by-sides, slim report, README with the run id). Exit check: `prd02-15` shadow drop ≈ 9% (Aura) vs ≈ 50% (three) within ±10%.
- [ ] [R/T] Per-game lighting inventory without touching capture code (owner 12): the C-31 `lighting` section that PRD 02 registers (Phase 2) reports runtime `collectedLights` (kind, intensity, range, caster flag), environment source and shadow config, and every C-33 game capture already records C-31 sections. Test: a mounted game-like fixture's diagnostics JSON contains `lighting.environment.source` and one entry per collected light.

### Phase 1 (day 0): new files only
- [x] [R/T] `packages/rendering/src/environment/SphericalHarmonics.ts`: CPU `projectCubeToSH9` / `evaluateSH9Irradiance` per C-09 (radiance SH stored; cosine constants at evaluation). Test `tests/qr/prd02/unit/sh9-projection.test.ts`: for a synthetic cube with radiance `max(0, y)`, irradiance at n=+Y matches the analytic cosine-convolved value within 2%; constant radiance L gives πL within 1%; C-09 conformance "constant cube equals the constant ±1e-3" passes for `real`.
- [x] [R/T] `environment/RoomEnvironmentScene.ts`: port of three `RoomEnvironment.js` (box room, 6 emissive panels with radiances 50, 50, 17, 43, 20, 100 from `node_modules/three/examples/jsm/environments/RoomEnvironment.js:106-136`, props as boxes), MIT attribution in the header, emitting plain geometry + emissive descriptors. Test: panel count 6 and radiance list equal to the r185 file (parsed in the test).
- [x] [R/T] `environment/workers/cpuPrefilter.ts`: GGX filtered-importance-sampling prefilter with no average blend (fixes E6), mip floor 16 px, `roughnessToLod`/`lodToRoughness` (`(N-1)·r·(2-r)`). Test `gpu-pmrem-math.test.ts`: round-trip within 1e-6; mip count for F=256 is 5; prefiltering a cube with a bright top keeps the 16 px top/bottom luminance ratio ≥ 1.5.
- [x] [R/T] `environment/Rgb9e5Cube.ts`: read a KTX2 container with `VK_FORMAT_E5B9G9R9_UFLOAT_PACK32`, cube, mips, no supercompression; reject supercompressed files with `ENV_KTX2_SUPERCOMPRESSED`. Test: decode of a generated fixture equals the source within RGB9E5 precision (≤ 1/256 relative).
- [x] [R/T] `environment/LightingSamplerBudget.ts`: real C-12 `resolveLightingSamplerBudget` with the 6.10 downgrades then `LIGHTING_SAMPLER_DROP_ORDER`. Test `lighting-budget.test.ts`: on 16 units a High-tier program with 7 material maps first downgrades `pcss-raw` and `ltc`, then drops `contact-shadow`, then `irradiance-volume`, and never exceeds 16; order is deterministic (C-12 conformance).
- [x] [R/T] Light-unit and caster-selection logic. Days 0-2 it is written in PRD 02's lane barrel `packages/engine/src/lanes/prd02.ts` (owned); after PR 0b-1 it moves verbatim into `compiler/lights.ts` (descriptors) and `compiler/shadows.ts` (selection, config). Functions: `physicalLightDescriptor(node)` (point `cd = lm/4π`, spot `cd = lm/π`, `range = distance ?? 0`, `decay = decay ?? 2`, defaults 8 cd / 30 cd, rect/softbox as `kind: "rect"` with `right`/`up` and width/height, `shadowRequested = shadow === true || typeof shadow === "object"`, `shadowDisabled = shadow === false`), `selectShadowedLights(descriptors, { autoSunShadow, max })`, `resolveShadowSystemConfig(snapshot, descriptors, tier)`. Tests `light-units.test.ts` and `select-shadowed-lights.test.ts`: `lights.point({ distance: 4, decay: 1, power: 400 })` → `range 4, decay 1, intensity ≈ 400/(4π)` (1e-9); "ambient + 10 points → no caster"; "sun + spot both `shadow: true` → 2 casters"; autoSun promotes only directionals; `max` respected with dropped names returned; config has no `strength < 1` for any category and its size is independent of parked nodes at y=-70.
- [ ] [R] Chunk files `packages/rendering/src/shaders/chunks/{lighting_ibl,lighting_punctual,shadow_receive,shadow_caster,sh9,contact_shadow}.glsl.ts` per 8.1-8.6 (ambient and hemisphere through `a3dIndirectDiffuseIrradiance` with `kd·albedo/π` at the use site; falloff `a3dDistanceFalloff` = three `getDistanceAttenuation`; range test before the BRDF; 32 lights from the `AuraLights` block; per-fragment cascade selection; Castaño/Vogel/PCSS kernels). Register them from `packages/rendering/src/lanes/prd02.ts` via C-02. Tests in ChunkHarness (macos-14 browser job): every chunk compiles on a device mock reporting `MAX_FRAGMENT_UNIFORM_VECTORS = 224` and `MAX_TEXTURE_IMAGE_UNITS = 16`; the white-Lambert-plane-under-ambient-1.0 case outputs `albedo/π` within 1e-4; the falloff CPU mirror matches r185 for d ∈ {0.05, 0.3, 1, 5, 20} m, decay ∈ {0, 1, 2} within 1e-6; the hemisphere CPU mirror matches `getHemisphereLightIrradiance` within 1e-6 (default `+Y` and `position: [1, 0, 0]`); a 32-point-light program evaluates 32 lights.
- [ ] [R/T] Logic halves of `shadows/{DirectionalCascadeFitter,ShadowAtlas,ShadowCasterVariants,ShadowFilterKernels}.ts`. Tests: `cascade-fitter.test.ts` (10° camera yaw leaves each cascade radius unchanged ≤ 1e-5 relative; a 0.3-texel camera translation moves the snapped origin by exactly 0 or 1 texel; a caster 50 m behind the camera along the light is inside the light depth range); `shadow-atlas.test.ts` (2 spot + 1 point at High pack without overlap; re-allocation within 30 frames returns the same rects); `shadow-caster-variants.test.ts` (skinned → `skinning: 4|8`; static batch from `SceneOptimization.ts:209-216` metadata → `batched: true, instanced: true`; MASK → `alphaTest`; BLEND + `castShadow: true` → `alphaHash`; BLEND default → excluded; id stable across runs; a registered depth feature appears in `features` (C-11 conformance)).
- [x] [R/T] C-39 registrations in `packages/aura3d-cli/src/commands/prd02/`: `environmentsBake.ts` (HDR → `<preset>.<tier>.ktx2` RGB9E5 cube with mips, `.sh9.json`, `.bg.ktx2`; CPU FIS from `cpuPrefilter.ts`) and `migrateLighting.ts` (section 10.2 rules, report mode by default, `--write` for opted-in callers). Tests `tests/qr/prd02/unit/migrate-lighting.test.ts` (input/expected pairs per rule) and `environments-bake.test.ts` (bake of `studio_small_08_1k.hdr` at 128 produces 4 mips and 27 SH floats; SH matches `projectCubeToSH9` of the same cube within 1e-4).
- [x] [R/T] Bake and commit day-0 presets to `public/aura-environments/` with `packages/environments/src/EnvironmentRegistry.ts` entries (URL, license CC0, source file, SHA-256, `stand-in` tag where 6.2 says so). Test: the registry validator checks every entry has a license and a SHA-256 matching the file.
- [x] [R/T] C-34 rule `look/ambient-flattens` (ambient intensity > 1 while an environment is present) registered from the lane barrel; fact rows F-02-01..F-02-06 appended to CONTRACTS Appendix B as `proposed` (F-02-01 ambient additive; F-02-02 recipe preset + sun + optional ambient; F-02-03 replacement lint text "Scene uses the neutral environment only; add `environments.preset(...)` and `lights.directional({ shadow: true })` for a key light."; F-02-04 units table; F-02-05 three-compat 1:1 mapping; F-02-06 shadow defaults). Test: the rule fires on a fixture with `lights.ambient({ intensity: 1.5 })` + `environments.preset("studio")` and not without the environment.

### Phase 2 (after PR 0b-1): engine composition behind the flag
- [x] [R/T] `compiler/environment.ts`: register C-09 sources `prd02.explicit` (400, from `environments.*` nodes) and `prd02.neutral-room` (0); ambient returned additively; category preset selection (`:12708-12722` at `85aafcd0`) and the `authored-ambient` branch (`:12693-12707`) run only for the `"legacy"` source. Test `lighting-composition.test.ts`: every combination of {none, ambient, hemisphere, env node, hdri, `none()`} × {no lights, sun, sun+spot} with the flag on yields the expected terms and no term zeroes another; `lights.ambient(0.5)` alone yields `environmentProbe.source === "neutral"`, `ambient.intensity === 0.5`, specular IBL intensity > 0; with the flag off the RenderSource is deep-equal to the `85aafcd0` golden for base scene 01 (`lighting-legacy-golden.test.ts`, CPU snapshot). *(landed `qr/prd02-engine-composition`; evidence/prd02/phase-2.md)*
- [x] [R/T] `compiler/lights.ts`: `createProductionRuntimeFallbackLights` returns `[]` under the flag; add `resolveLightingTier(ctx)` (reads `SceneCompileContext.quality`, `lighting.quality` override, 6.8), `readLightingModelFromUrl()` (`?aura-lighting=`) and the `?a3dLighting=` kill-switch parser. Test: a no-light scene has `collectedLights.length === 0`, the neutral env is bound, no shadow map is allocated; each tier yields exactly the 6.8 values. *(landed `qr/prd02-engine-composition`; evidence/prd02/phase-2.md)*
- [x] [R/T] C-36 `NodeHandler`s for kinds `light`, `environment`, `probe` (owner `prd02`, flag `A3D_QR_LIGHTING`), emitting `physicalLightDescriptor` output, `hemisphere` irradiance, environment and probe resources through `RenderSourceContributions`. Option-coverage rows for every `lights.*`, `environments.*`, `shadows.*`, `probes.*`, `effects.contactShadows` field; remove the corresponding `diagnosticOnly.prd02.ts` entries. Test: `tests/unit/agent-api/optionCoverage.test.ts` passes for PRD 02 builders; flag off → handlers not invoked (C-36 conformance). *(landed `qr/prd02-engine-composition`; evidence/prd02/phase-2.md)*
- [x] [R/T] Builders in `nodes/lights.ts` (`hemisphere`, `distance`/`decay`/`power`, `shadow` options per C-10), `nodes/environments.ts` (`preset/neutral/none/capture`, legacy aliases per section 11 with `background: false`), `nodes/shadows.ts` (`blobShadow`, `contact` deprecated alias), `nodes/probes.ts`, `nodes/effects.lighting.ts` (`contactShadows`), `nodes/sceneKits.ts` (preset + shadowed sun under the flag, R7). Tests: each alias yields `environment: "preset"` with the documented preset and `background: false`; every shadow option round-trips into `ShadowSystemConfig`; C-36 duplicate-key test for the `effects` spread passes. *(landed `qr/prd02-engine-composition`; evidence/prd02/phase-2.md)*
- [x] [R/T] `compiler/shadows.ts`: under the flag call `selectShadowedLights` + `resolveShadowSystemConfig` (strength 1.0, size from C-27, bias 0, normalBias auto) instead of the legacy heuristics; the legacy `resolveProductionShadowCasterIndex`/`resolveProductionRuntimeShadowTuning` (15-owned) are not called. Test: as in Phase 1 plus "flag off → byte-identical legacy options for the 18 base snapshots". *(landed `qr/prd02-engine-composition`; evidence/prd02/phase-2.md)*
- [ ] [R/T] `receiveShadow`: `forward/Lighting.ts` binds `shadowEnabled = 0` when `RenderItem.receiveShadow === false` (PR 0a field). Populating the field is request Q-15-5 (`compiler/primitives.ts` copies `node.receiveShadow`) and Q-04-2 (`TypedGLBActor` items). Meanwhile PRD 02's lane scene sets `receiveShadow` on its own `RenderItem`s through a C-01 `collect` contributor in the test fixture. Browser test: a plane with `receiveShadow: false` has a luma drop < 2% under a caster.
- [x] [R/T] C-38 `app.lighting` (`updateProbe`, `rebakeIrradiance`, `setEnvironmentRotation`, `setEnvironmentIntensity`, `diagnostics`) and C-31 sections `lighting`/`shadows` with observed values only (filter from compiled defines, `shBound`, `backgroundDrawn`, caster variants, counters from C-28). Test `lighting-diagnostics.test.ts` (mock device): a primitive named "contact shadow footprint" reports `contactShadows.passExecuted === false`; no field is derived from a node name. *(landed `qr/prd02-engine-composition`; evidence/prd02/phase-2.md)*
### Phase 3 (after PR 0b-2): environment, background and sampler wiring
- [x] [R] `webgl2/Samplers.ts` (carved `WebGL2Device.ts:~4139-4155`): real C-12 mapping (`compare` → `TEXTURE_COMPARE_MODE = COMPARE_REF_TO_TEXTURE` + `LEQUAL`/`GEQUAL` with `LINEAR`; `mirror` → `MIRRORED_REPEAT`; `addressW`; `*-mipmap-*` downgraded to the non-mip filter when the texture has 1 level). `provide(real)` for C-12 in the lane barrel. Tests: device-mock unit test that the sampler parameters are issued; flag-off mapping byte-identical; browser `tests/browser/contracts/C-12-sampler.spec.ts` green for `real` *(code landed `qr/prd02-engine-composition`; evidence/prd02/phase-3.md — C-12 has no ContractSlot (frozen file); flag-gated mapping + device-mock test land here; browser C-12 spec requested from prd15, capture pending)*
- [x] [R] Mip-mapped environment bindings: every binding PRD 02 creates (`ExternalParityRenderPreset.ts:169`, `EnvironmentMapResources.ts`, probes) uses `minFilter: "linear-mipmap-linear"` under the flag. Browser test `tests/qr/prd02/browser/ibl-roughness.spec.ts` on `prd02-06`: rough (0.8) and smooth (0.05) chrome spheres under the same env differ in high-frequency energy by ≥ 4×; broken control: flag off fails it. *(code landed `qr/prd02-engine-composition`; evidence/prd02/phase-3.md — spec `tests/qr/prd02/browser/ibl-roughness.spec.ts` written, capture pending)*
- [x] [R] Neutral-room probe v1 (C-09 `factory.neutral(tier)`): render `RoomEnvironmentScene` into 6 RGBA16F faces through `EnvironmentCaptureRequest.renderFace` (2D targets while Q-01-5 is open), read back **once at load**, prefilter in the Worker, upload as a mipped cube; for the legacy path also write a mipped RGBA16F equirect via `EnvironmentMapResources.ts` with the HDR kept linear (no Reinhard, no RGBA8; fixes E5 under the flag). Test: mip-0 max radiance ≥ 50, SH L0 > 0; `readPixelsCalls` delta = 0 after frame 2. *(code landed `qr/prd02-engine-composition`; evidence/prd02/phase-3.md — mip-0 ≥ 50 / SH L0 > 0 covered by prd02-env-factory tests; `readPixelsCalls` delta + Worker-offload await C-28/Q-01-5)*
- [x] [R] `GPUPMREMGenerator` (7.2, 8.7): `texStorage2D(TEXTURE_CUBE_MAP, mipCount, RGBA16F, F, F)` once Q-01-5 lands, until then 6 per-face 2D RGBA16F targets assembled with `copyTexSubImage2D`; requires `EXT_color_buffer_float` or `_half_float`, else the Worker path. Browser spec `tests/qr/prd02/browser/pmrem.spec.ts` on `studio_small_08_1k.hdr`: per-mip means within 5% of mip 0; max monotonically decreasing; mip N-1 top/bottom ratio ≥ 1.5. Parity sub-test against three r185 `PMREMGenerator.fromEquirectangular` on a mirror sphere rendered by a ChunkHarness program at roughness {0, 0.25, 0.5, 0.75, 1}: each window's linear-luma mean within 10% of three's, high-frequency ordering identical; broken control: the stub factory (0.82 blend, level-0 sampler) fails it. *(code landed `qr/prd02-engine-composition`; evidence/prd02/phase-3.md — v1 GPU-gate + CPU-prefilter fallback landed; `pmrem.spec.ts` + parity sub-test pending)*
- [x] [R/T] `EnvironmentCache` (`acquire`, `neutral`, `release`; ref-counted; key `(url|preset, tier)`; resident limit 3, or 2 on Medium when any resident probe is RGBA16F, and always 2 on Ultra). `EnvironmentProbeFactory` real; C-09 `provide(real)`. Test: double acquire returns the same probe; release to 0 disposes after the LRU limit; a third RGBA16F probe on Medium evicts the LRU one. HDRI upgrade: `compiler/environment.ts` swaps `environmentProbe` when `acquire` resolves (the 15-owned `upgradeProductionEnvironmentHdri`, `index.ts:14190-14245`, is not called under the flag); `PBRHDRPipeline.ts:261, 404` `0.08` replacements and `:287, 429` `*1.1` gains are skipped under the flag. Test: an HDRI scene reports `environment.source: "hdri"` after resolve and `"neutral"` before; no main-thread task > 50 ms during the swap (Long Tasks API). *(code landed `qr/prd02-engine-composition`; evidence/prd02/phase-3.md — hdri swap unit-tested; Long-Task >50 ms browser check pending)*
- [x] [R/T] Background: `renderer/Background.ts` sets `environmentBackground` from the C-09 resolution when `background.visible`; `prd02.background` contributor; `EnvironmentBackgroundPass.ts` shader per 8.7 (equirect at lod 0 or cube at `roughnessToLod(blurriness)`, linear output, yields to a C-21 sky). Test `tests/qr/prd02/browser/background.spec.ts`: `prd02-13` sky-band luma std ≥ 0.7× three's; `scene().background("#123")` with `environments.preset("studio")` keeps the solid colour; broken control `background: false` fails the sky metric. *(code landed `qr/prd02-engine-composition`; evidence/prd02/phase-3.md — `background.spec.ts` pending)*
- [x] [R] `forward/Lighting.ts` (carved): under the flag, directional/spot/point shadow strength 1.0 instead of 0.65 (`ForwardPass.ts:913, 1048, 1172` at `85aafcd0`); ambient uploaded × `1/π` (until Q-01-1 lands, then the uniform path); `receiveShadow` binding; the `AuraLights` std140 packer (32 × 6 vec4) for chunk programs, with the legacy `u_lightData` path unchanged; clustering above 32 (`ForwardPass.ts:251-258` logic now in this file). Report `lightsEvaluated`/`lightsDroppedByCap` in the C-31 section. Test: flag-off uniform uploads byte-identical on the 18 base snapshots (device mock); flag-on `prd02-15` shadow-region luma drop 40–60% (S3). *(code landed `qr/prd02-engine-composition`; evidence/prd02/phase-3.md — 18-snapshot byte-identical flag-off test pending)*
- [x] [R/T] Rect/softbox on the legacy path: the PRD 02 `light` handler emits `kind: "rect"` descriptors (no spot proxy, E17); legacy `kind > 2.5` already routes to `a3dPbrRectAreaLight` (`ShaderLibraryCore.ts:717-724`), so no shader edit. Browser test on `prd02-softbox`: the luma > 50% highlight region's aspect ratio is within 20% of width/height (rectangular, not elliptical); flag off fails it. *(code landed `qr/prd02-engine-composition`; evidence/prd02/phase-3.md — `kind: "rect-area"` descriptors + `descriptorToAuraLightData` landed; `prd02-softbox` aspect-ratio spec pending)*

- [x] [R] Prebaked-preset upload: `Rgb9e5Cube.ts` output is uploaded as an `RGB9_E5` cube when the device texture path accepts that internal format (request Q-06-1 to `webgl2/TextureUpload.ts`); until then the Worker expands it to RGBA16F (2× memory, accounted in 17). Test: decoded texel equals the source within RGB9E5 precision (≤ 1/256 relative); sampled with `linear-mipmap-linear` *(code landed `qr/prd02-engine-composition`; evidence/prd02/phase-3.md — Worker→RGBA16F path landed + tested; native RGB9_E5 cube blocked on Q-06-1 (to:prd11))*
- [x] [R] SH binding for chunk programs: upload `u_envSH[7]` (cosine constants folded) in the `A3DEnvironment` block from the bound probe; report `shBound` from the actual upload. ChunkHarness browser test on the `prd02-13` white-sphere fixture: top-hemisphere B/R ≥ 1.05 and bottom ≤ top (sky tint). Visible on production draws only with C-02 real (integrated I-3). *(code landed `qr/prd02-engine-composition`; evidence/prd02/phase-3.md — folded SH packer + §8.1-verbatim uniforms + shBound landed; ChunkHarness `prd02-13` B/R test pending)*

### Phase 4 (after PR 0b-2): shadow system
- [x] [R] Counters are consumed, not added (E33 → C-28): `lighting.diagnostics().programCompileCount/readPixelsCalls` read `RenderDeviceDiagnostics` (C-28 stub wraps `linkProgram`/`readPixels`). Test (device mock): one program creation increments `programCompileCount` by 1; one legacy `readShadowFacePixels` call (flag off) increments `readPixelsCalls`. This gates the precompile and no-readback tests below. *(code landed `qr/prd02-engine-composition`; evidence/prd02/phase-4.md — diagnostics reads `getDiagnostics()`; `attachDevice` hook wired through `bindPrd02EnvironmentProbe`; mock has no counters so the counter-delta assertions are browser-pending)*
- [x] [R] `DepthPass.ts`: compose depth programs from the C-11 key and registered `DepthVariantFeature`s (`prd02.depthInstancing`, `prd02.depthAlpha`, `prd02.depthSkinning`, and `prd06.deform` when present); bind skinning palettes from the `RenderItem` skinning fields, issue instanced draws with `instanceCount`, bind base-color texture + cutoff for alpha variants; `provide(real)` for C-11 `resolveShadowCasterVariant`. Browser test `tests/qr/prd02/browser/casters.spec.ts` on `prd02-caster-fixtures`: (a) skinned Soldier at Walk t=1.25 s shadow-mask IoU ≥ 0.75 against three; (b) 3×3 static batch casts 9 shadows (connected components = 9); (c) a 16-instance row casts 16; (d) an alpha-tested leaf card's shadow filled ratio equals the texture's opaque ratio ±10%. Broken control: flag off fails (a)-(d). *(code landed `qr/prd02-engine-composition`; evidence/prd02/phase-4.md — `resolvePrd02ShadowCasterVariant` real impl (contract stub is a plain function — qr-request for a provider slot to:prd01); `casters.spec.ts` pending)*
- [x] [R] Precompile caster variants at mount through C-28 `compileAsync` for the keys of the initial render items; diagnostics list `casterVariants`. Test: `programCompileCount` delta = 0 over frames 2–120 of `prd02-15` (static camera). *(code landed `qr/prd02-engine-composition`; evidence/prd02/phase-4.md — `precompile` uses `compileAsync`; `casterVariants` in diagnostics; programCompileCount delta browser-pending)*
- [x] [R] `ShadowSystem` + `ShadowFrameUniforms` in the `prd02.shadows` contributor; `renderer/ShadowOrchestration.ts` skips its legacy body under the flag, accepts a plain C-08 `CameraLike` (removes the `instanceof PerspectiveCamera` gate, `Renderer.ts:1387-1391` at `85aafcd0`) and maps `RendererShadowOptions` → `ShadowSystemConfig`. Cascades are one 2D depth target each until Q-01-5. Test: CSM runs with a plain-object camera (unit, device mock); `prd02.shadowFrameUniforms` is on the blackboard after the `shadows` phase. *(code landed `qr/prd02-engine-composition`; evidence/prd02/phase-4.md — contributor publishes blackboard key; legacy body skipped + plain-CameraLike accepted; mock-device test green)*
- [x] [R] Stable fit and caster list: `DirectionalCascadeFitter` output drives the legacy receive (per-item selection in `forward/Lighting.ts` from stable cascades) and the chunk (per-fragment); casters come from the `collect` snapshot (pre-cull). Browser tests on `prd02-17`: shimmer, 60-frame 0.01 m dolly, mean abs frame-to-frame difference in the static shadow-edge mask ≤ 1.5/255 (fails today); a tall pole behind the camera still casts into view (shadow pixels > 0 in the receiver mask). *(code landed `qr/prd02-engine-composition`; evidence/prd02/phase-4.md — texel-snap + pole-behind-camera unit-tested; `prd02-17` browser spec pending)*
- [x] [R] `ShadowAtlas` spot and point tiles rendered on the GPU (point: 6 tiles, 90° fov, 1-texel guard); the legacy CPU readback path is not executed under the flag. Fold `shadows/SpotShadowMaps.ts` into atlas spot tiles (deleted at flag removal, E34). Tests: `readPixelsCalls` delta = 0 over 60 frames in a point-shadow lane scene; each tile's depth equals a CPU-rasterized reference within 1e-3 (test-only readback after the measured window); seam continuity (no gap > 1 px along a seam crossing) in a ChunkHarness receive program, else switch to the `samplerCubeShadow` fallback (6.4) and rerun. *(code landed `qr/prd02-engine-composition`; evidence/prd02/phase-4.md — GPU tiles + scissor, no CPU readback on the flag path; tile-depth/browser checks pending)*
- [x] [R] Filter kernels and compare sampling in `a3d_prd02_shadow_receive` (8.4) with `ShadowFilterKernels.ts` weights; normal bias in world units. ChunkHarness browser test: filter `"hard"` gives a 2-texel bilinear transition, not 1-texel steps; Medium kernel penumbra ≥ three `PCFShadowMap`'s on the same map. *(code landed `qr/prd02-engine-composition`; evidence/prd02/phase-4.md — named sampler2DShadow samplers + 3 kernels + world-unit normal bias; ChunkHarness spec pending)*
- [ ] [R] Shadow targets without a colour attachment once Q-01-5 provides `depthOnly`; `ShadowPass.ts:165-171` (owned) then requests `depthOnly: true`. Test: shadow-target memory in the C-31 section drops by `4·size²` bytes.

### Phase 5 (after PR 0b-2): contact shadows, probes, area lights
- [x] [R] `passes/ContactShadowPass.ts` + `a3d_prd02_contact_shadow` (8.6) as the `prd02.contactShadows` contributor (`after-opaque`, sub-flag `A3D_QR_LIGHTING_CONTACT`), reading C-01 `sceneDepthCopy` when available, else its own half-res depth via `DepthPass`; `effects.contactShadows()` in `nodes/effects.lighting.ts`. Browser test on `prd02-contact-cube` (0.2 m cube, grazing sun), measured on the R8 mask (debug view): ≥ 30% darkening within 3 cm of the base with the pass on, < 5% off; < 1% change on the sun-facing face. Delete the ExternalParity `shadows/ContactShadows.ts` plan from PRD 02-owned consumers (`ShadowDebugViews.ts`, `EnvironmentPlatform.ts`) under the flag (E34); removal at flag removal is checked by `rg "createExternalParityContactShadow" packages/*/src` = 0. *(code landed `qr/prd02-engine-composition`; evidence/prd02/phase-5.md — unit suite green; `prd02-contact-cube` R8-mask spec pending)*
- [x] [R/T] `nodes/shadows.ts`: `blobShadow` implementation + `shadows.contact` `@deprecated` alias (C-10); `decals` exposure is Q-07-1. The codemod reports the first-party `shadows.contact` call sites (applied by PRD 14/13). *(landed `qr/prd02-engine-composition`; evidence/prd02/phase-5.md — codemod emits exact→`shadows.blobShadow` rows; E34 flag-gated plan removal in `EnvironmentPlatform`/`ShadowDebugViews`)*
- [x] [R] `probes/ReflectionProbeSystem.ts` (reusing `ReflectionProbe.ts` capture): HDR capture via C-09 `EnvironmentCaptureRequest`, `GPUPMREMGenerator.fromCube`, per-item 2-probe selection, box projection with the capture position (8.2); `probes.reflection()`; `prd02.probes` contributor (sub-flag `A3D_QR_LIGHTING_PROBES`). ChunkHarness browser test on `prd02-reflection-probe` (box room, mirror floor, emissive panel): the box-projected reflection of a wall stripe aligns with a three `CubeCamera` + PMREM reference within 2 px. *(code landed `qr/prd02-engine-composition`; evidence/prd02/phase-5.md — spec pending)*
- [x] [R] `probes/IrradianceVolume.ts`: per-cell 32 px capture → GPU SH L1 → 3 RGBA16F 3D textures, trilinear, normal offset; `probes.irradianceVolume()`. ChunkHarness browser test on `prd02-red-wall-bounce`: red-wall bounce hue on a white sphere within 15° of a three `LightProbeGenerator` per-cell reference. *(code landed `qr/prd02-engine-composition`; evidence/prd02/phase-5.md — spec pending)*
- [x] [R] LTC area lights in `a3d_prd02_lighting_punctual` on High/Ultra (2× 64×64 RGBA16F LUTs from three `RectAreaLightTexturesLib.js`, MIT notice, fetched lazily); Gauss–Legendre on Low/Medium. Unit test: LUT checksums; integrator within 10% total energy of LTC on a reference plane. *(code landed `qr/prd02-engine-composition`; evidence/prd02/phase-5.md — lazy LUT fetch + checksum + ≤10% integrator test green; LTC specular seam pending with composed program)*

### Phase 6: tiers, performance, mobile
- [x] [R/T] `resolveLightingTier` applies the 6.8 table from C-27 settings with `lighting.quality` and per-light overrides (Phase 2 test covers values). Tier change reallocates cascades/atlas once and regenerates the probe at the new face size; test: no allocation on frames without a tier change (C-28 `renderTargetsCreated` delta 0). *(code landed `qr/prd02-engine-composition`; evidence/prd02/phase-6.md)*
- [x] [R/T] Timing spans `pmrem`, `shadow.cascade[i]`, `shadow.local`, `contactShadow`, `background`, `probes` in the C-31 `lighting` section, from C-28 timer queries when real, else `null` and the 17 toggle-delta method. Recorded in the lane capture report. *(code landed `qr/prd02-engine-composition`; evidence/prd02/phase-6.md — spans null: no per-pass timer API on RenderDevice; toggle-delta capture pending lane run)*
- [ ] [R/T] Run the section 17 budget suite on the `prd02-*` scenes on the section 19 devices; commit `docs/project/aura3d-quality-rebuild/evidence/prd02/lighting-perf/<device>.json` (method per number).

### Phase 7: integrated acceptance and migration (checkpoint-driven; never blocks merges)
- [ ] [R/T] After each checkpoint, write `evidence/prd02/checkpoints/IC-<k>.md`: the 16.2-16.4 rows with flags `all`, `none` and `all,-lighting`, open §12.3 requests, and the `qr-ic-regression` issues filed.
- [x] [R/T] Move facts F-02-01..06 to `verified` with the run id of the passing test (C-40); notify PRD 13 (Q-13-1). *(verified in CONTRACTS App. B; vitest 2026-10-06T16:55Z `qr/prd02-engine-composition` — backing tests named per row)*
- [x] [R/T] Run `aura3d migrate lighting` in report mode over `apps/showcase-*`, `apps/aura-clash-showcase`, `templates/*`, `packages/create-aura3d/templates/*`, `examples/*`; commit the reports to `evidence/prd02/migrate-lighting/`; hand them to PRD 14 (Q-14-1) and PRD 13 (Q-13-1). *(code landed `qr/prd02-engine-composition`; evidence/prd02/migrate-lighting/ — 96 roots, 334 rows, report mode; `aura3d codemod` dispatch gap in cli.ts → qr-request to:prd15; lane `migrate lighting` CliCommand registered as the reachable surface)*
- [ ] [R] Delete the dead `packages/rendering/src/shaders/pbr-direct.frag.glsl` (PRD 02-owned, §4.1). Test: `rg "pbr-direct.frag.glsl" packages` returns 0. This is dead code and changes no pixel. *(blocked: `tests/unit/rendering/shader-library.test.ts` sync-reads the packaged .glsl pair — lane-15 test, not owned; qr-request to:prd15 logged in evidence/prd02/qr-requests.md; QR_OWNERSHIP.json also lacks the §4.1 file-level carve-out to lane 02)*
- [ ] [R/T] Flag removal PR (only after `A3D_QR_LIGHTING` is `default-on` for two checkpoints, CONTRACTS §5.4): delete the flag-off branches in PRD 02-owned files and file Q-15-1/Q-15-2 for the custodian deletions. Test: `rg "authored-ambient|createProductionRuntimeFallbackLights|selectForwardShadowMap|readShadowFacePixels|wideLobeBlend" packages/*/src` returns 0 once Q-15-1 has also landed.

---

## 15. Test requirements (remote GH Actions macos-14)

### 15.1 Unit tests (vitest, `tests/qr/prd02/unit/`)

These are light enough to run locally per policy, and they run in CI on every PR:

- `lighting-composition.test.ts`: every combination of {none, ambient, hemisphere, env node, hdri,
  none()} × {no lights, sun, sun+spot} produces the expected RenderSource terms with the flag on. No term
  zeroes another.
- `light-units.test.ts`: falloff parity with three r185, the power→cd conversion, range culling.
- `gpu-pmrem-math.test.ts`: LOD mapping, mip-count math, cache keys.
- `sh9-projection.test.ts`: analytic SH cases.
- `shadow-caster-variants.test.ts`, `cascade-fitter.test.ts`, `shadow-atlas.test.ts`.
- `select-shadowed-lights.test.ts`: caster rules.
- `lighting-diagnostics.test.ts`: diagnostics are derived from observed device state (mock device),
  never from names.
- `lighting-budget.test.ts`: the 6.10 sampler and uniform budget, including the C-12 drop order.
- `lighting-legacy-golden.test.ts`: flag off → RenderSource byte-equal to `85aafcd0` for the 18 base
  snapshots.
- `migrate-lighting.test.ts`, `environments-bake.test.ts`, `rgb9e5-cube.test.ts`.
- Contract impl tests `tests/unit/contracts/impl/prd02-{environment,lighting,shadows,sampling}.test.ts`, plus the
  PRD 15-owned C-09..C-12 conformance suites run for `stub` and `real`.

All PRD 02 unit tests live under `tests/qr/prd02/unit/` (lane-owned).

### 15.2 Browser tests (Playwright)

Browser tests run **remotely only**: GH Actions macos-14 (ANGLE Metal), with the
`.github/workflows/lighting-quality.yml` job modelled on `quality-rebuild-capture.yml`, which already
pins Chromium and the ANGLE flags. They never run locally (the policy forbids local browser
automation), and they never run on SwiftShader.

- New (lane-owned): `tests/qr/prd02/browser/{chunks,ibl-roughness,pmrem,background,casters,shadow-stability,atlas,contact,probes,softbox,receive-shadow}.spec.ts`. ChunkHarness specs run with the C-02 stub; production-path specs run each lane scene with `qr_flags=lighting`.
- Existing specs (`createAuraApp-shadow-contract.spec.ts`, `environment-background.spec.ts`,
  `production-runtime-hdr-ibl.spec.ts`, `external-parity-shadow-quality.spec.ts`,
  `external-parity-shadow-cascade-evidence.spec.ts`, `root-ibl-b3-harness`) must stay green with the flag
  off. PRD 02 adds flag-on twins under `tests/qr/prd02/browser/legacy-twins/` rather than editing specs it does
  not own (CONTRACTS §4.1 "creator").
- Each spec asserts **pixel measurements** (region luma, IoU, energy, monotonicity) against thresholds
  or against a three r185 render of the same fixture. Allocation counts and labels never count.
- Each spec includes a **broken-control** case (research/14 §7): it must fail when the feature is
  disabled. For example, `shadow.intensity: 0` must fail the grounding assertion,
  `environments.none()` must fail the IBL assertion, and flag off must fail every flag-on assertion.
- `lighting-quality.yml` runs on every PR labelled `lane:prd02` and nightly. The shared benchmark and
  18-game captures are PRD 12's checkpoint runs (CONTRACTS §7); PRD 02 does not change their triggers.

### 15.3 Performance tests

`tests/qr/prd02/performance/lighting-tiers.spec.ts` runs per tier on the reference devices (section 19) via the
remote device runs. It records the timing spans from Phase 6 and fails on budget overrun beyond
10%. The GH macos-14 paravirtual GPU is **not** a performance reference (games run 0.5–60 fps there,
evidence/games/report.slim.json). It is used only for regressions relative to the baseline on the same
runner: a delta above 15% fails.

---

## 16. Visual acceptance tests

Two kinds of acceptance, per CONTRACTS §8:
- **Standalone acceptance (16.1)** is passable by PRD 02 alone, with every consumed contract on its stub,
  in `lighting-quality.yml` on macos-14 using lane scenes `prd02-*`, ChunkHarness programs and the production
  path with `qr_flags=lighting`. It gates PRD 02 merges (each phase's S-items) and the flag's move to
  `standalone-accepted`. It is engineering evidence only; it supports no claim of three.js quality.
- **Integrated acceptance (16.2-16.4)** depends on other lanes' real implementations (C-01, C-02, C-05, C-13,
  C-18, C-21, C-26) and on route/template adoption (PRD 13/14). It is evaluated only at CONTRACTS §7 checkpoints
  with `qr_flags=all` (plus `none` and `all,-lighting` for attribution), and only G-PANEL rounds can pass it. It
  never blocks a PRD 02 merge.

Integrated runs produce Aura and three r185 side-by-sides from `benchmarks/quality-rebuild` (the C-30 registry)
and game captures from `tools/quality-rebuild-capture` (C-33), both dispatched by PRD 12. They are judged by:

1. **Region metrics** (16.4), which are automated and must pass.
2. **A vision model** using the research/23 rubric (image descriptions, a differences table with
   classification, scores, and fairness notes), through C-32 `judgeWithPrism`. The images must be viewable
   JPEGs; a judgment produced without viewing the image is invalid.
3. **A named human reviewer**, who signs `docs/project/aura3d-quality-rebuild/evidence/prd02/lighting-acceptance/<run-id>/REVIEW.md`
   with per-scene pass/fail. A scene passes only if both (2) and (3) pass. Disagreement goes to a
   second human reviewer.

### 16.1 Standalone acceptance (PRD 02 alone, stubs; gates merges and `standalone-accepted`)

All on macos-14 Chromium (ANGLE Metal) unless noted; each has a broken control (flag off or feature off fails).
These rows are engineering evidence only; passing all of them supports no claim of three.js-level visual quality
(only a G-PANEL integrated round can, CONTRACTS §7).

| ID | Criterion | Where measured | Threshold |
|---|---|---|---|
| S1 | Lighting composition: no term zeroes another; ambient additive; flag-off RenderSource identical | `lighting-composition.test.ts`, `lighting-legacy-golden.test.ts` | all cases; byte-equal on 18 base snapshots |
| S2 | Neutral room is HDR and directional, and lights a no-light scene | probe test; `prd02-no-lights` vs three `pmrem.fromScene(new RoomEnvironment())` | mip-0 max ≥ 50, SH L0 > 0; subject mean linear luma within ±25% of three; unrequested shadow pixels ≤ 0.1%; subject top/bottom luma ratio ≥ 0.8× three |
| S3 | Full-strength shadows, no unrequested shadows or hotspots | `prd02-15`, `prd02-11`, `prd02-13` on the production path | `prd02-15` shadow-region drop 40–60% (three ≈ 50%); `prd02-11`/`prd02-13` unrequested shadow pixels ≤ 0.1%; `prd02-13` no punctual hotspot (max luma ≤ env-only render + 2/255) |
| S4 | Caster variants | `casters.spec.ts` on `prd02-caster-fixtures`, `prd02-16b-instancing-shadowed` | skinned IoU ≥ 0.75 vs three; 9/9 batch and 16/16 instance components (±1 of three); alpha card ±10% |
| S5 | Stable shadows and off-screen casters | `shadow-stability.spec.ts` on `prd02-17`; cascade-fitter unit test | dolly diff ≤ 1.5/255; pole behind camera casts; fitter invariants exact |
| S6 | GPU local-light shadows without readback | `atlas.spec.ts` | `readPixelsCalls` delta 0 over 60 frames; tile depth vs CPU reference ≤ 1e-3; seam gap ≤ 1 px |
| S7 | PMREM and SH correctness, and parity with three r185 | `pmrem.spec.ts`, `sh9-projection.test.ts` | per-mip mean within 5%; max monotonic; 16 px top/bottom ≥ 1.5; mirror-sphere windows within 10% of three at 5 roughness values; SH analytic cases within 2%/1% |
| S8 | Background drawn from the environment | `background.spec.ts` on `prd02-13`, `prd02-09` | sky-band luma std ≥ 0.7× three; solid `scene().background` preserved with alias presets |
| S9 | Physical units and area lights | `light-units.test.ts` (CPU), `softbox.spec.ts` | r185 falloff parity 1e-6; lm→cd exact; rect footprint aspect within 20% |
| S10 | Roughness-correct IBL on the production path | `ibl-roughness.spec.ts` on `prd02-06` | rough vs smooth HF energy ≥ 4×; metal HF energy strictly decreasing with roughness |
| S11 | Contact-shadow mask | `contact.spec.ts` on `prd02-contact-cube` | ≥ 30% within 3 cm of base, < 5% off, < 1% on lit face |
| S12 | Reflection probes and irradiance volume | `probes.spec.ts` (ChunkHarness programs) | box-projected stripe within 2 px of three; red bounce hue within 15° |
| S13 | No stalls | C-28 counters on `prd02-15` and an HDRI swap | 0 compiles over frames 2–120; 0 readbacks in steady state; no lighting main-thread task > 50 ms |
| S14 | Resource limits | ChunkHarness on a 16-unit / 224-vector device mock; `lighting-budget.test.ts` | every PRD 02 program links; deterministic C-12 drop order; never > 16 units |
| S15 | Honest diagnostics | `lighting-diagnostics.test.ts`; C-31 schema check | no name-derived field; filter from compiled defines; `shBound`/`backgroundDrawn` observed |
| S16 | Flag-off identity | CONTRACTS §6.1 sentinel run with `qr_flags=none` | ΔE2000 p99 ≤ IC-0 noise on the 6 sentinels |
| S17 | Per-tier budgets | section 17 suite on `prd02-*` scenes, section 19 devices | every 17 budget, or a signed waiver with the measured number |
| S18 | Contracts | C-09..C-12 conformance (stub and real); `prd02-*` impl tests | green |

### 16.2 Integrated acceptance: benchmark scenes (checkpoints only; never blocks)

Reference: three r185 render of the same spec, base scenes from the C-30 registry with `qr_flags=all`.
Integrated because the visible chunk-based IBL/CSM/contact terms need the C-02 generator (01), HDR output needs
C-05 (01), SSR needs C-13 (03), sky-driven IBL needs C-21 (07), skinned/morph casters on production rigs need
C-18 (06), and the 18 base scenes are PRD 12's (Q-12-1 for masks).

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
| 16-instancing (shadowed-sun variant is the lane scene `prd02-16b-instancing-shadowed`) | 2.5 / 4.5 | instance-size fix is PRD 15's R18; no score gate here | one cast shadow per instance: shadow connected-component count in the receiver mask equals the instance count, and is within ±1 of three's count | "instances cast no shadow" (in 16b) |
| `prd02-no-lights` (scene 02's product with no lights and no environment; the three side uses `scene.environment = pmrem.fromScene(new RoomEnvironment())`) | n/a (lane scene) | no score gate | as S2, re-measured with `qr_flags=all` | "flat", "unlit", "black" |
| `prd02-csm-poles` (200 m ground, 4 cascades) | n/a | no score gate | shadows of identical poles at 5, 30, 80 and 140 m all present (needs per-fragment selection in the chunk, C-02) | "far shadows missing" |
| Wet-floor SSR fixture (`prd02-wet-floor`) | n/a | no score gate | reflected emissive energy within 25% of three `SSRPass` on the same HDR input; an HDR emissive at 20 reflects > 1.0 pre-tonemap (PRD 03's pass, Q-03-2) | "reflects tone-mapped values" |

### 16.3 Integrated acceptance: games (checkpoints only; never blocks)

Reference: research/21 rubric; target bar: a well-built modern three.js browser game. Capture: PRD 12's
checkpoint run of `quality-rebuild-capture.yml` on GH Actions macos-14 (C-33), contact and mid frames as in the
existing evidence/games set, for (a) the shipped routes with `qr_flags=lighting` and **no art changes** (this
isolates the PRD 02 defaults without any route edit) and (b) `qr_flags=none`. Routes that later adopt the flag
in their own source (PRD 14, Q-14-1) are also scored with their `games.json` `qrFlags`.

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
  ≥ 3× the mean of the far half (region masks requested in Q-14-1; until they exist the check is recorded as
  "not measurable" and evaluated at the next checkpoint). If a planet uses an unlit or
  emissive-only material, so that no lighting change can produce a terminator, the game is recorded as
  "PRD 14 art scope" in REVIEW.md and is excluded from that check only. It is not excluded from the
  14-of-18 counts.

**Per-game expected impact of the defaults** (inventory from `rg` over each `apps/<game>/src` at
`c08d8acb`; today's scores from `_sections/B-game-scorecard.md`). Every game authors `lights.ambient`,
so every game except Turbo Drift and Siege Golf moves from zero IBL to the neutral environment. The
column "PRD 02 risk" names the specific default change that is most likely to cause a 16.3 regression
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
| gallery-shift | 4 / 2 / 1 | 2 ambient, 4 dir (1 `shadow: true`), ≈15 point, 1 spot, 4 rect, 2 `shadows.contact` | explicit; lighthouse adds spot shadows | lighthouse game (16.3) | blob decals are no longer counted as contact shadows |
| deep-recovery | 2.5 / 1 / 1 | ambient, 2 dir, ≈15 point, 1 spot (`shadow: true`) | explicit spot plus auto sun (2 casters) | underwater grounding | already 0.5–3.6 fps: a second caster can breach the 0.85× FPS guard, so `maxShadowedLights` may need to be 1 |
| patrol-wing | 3 / 2 / 1 | ambient, **no directional**, 3 point, 1 spot (`shadow: true`) | explicit spot only (no auto sun) | aircraft spot shadow | "sun warm catch" is a point light at (20, 24, 30): with decay 2 it is about 43 m from the origin and nearly vanishes. The codemod report must flag it |
| bank-shot | 3 / 2 / 2 | ambient, 2 dir, 6 point, 1 rect | auto sun | ball shadows on felt | coloured point hotspots get stronger near the rails |
| orbital-defense | 1.5 / 0 / 0 | ambient, 1 dir, 2 point | auto sun | terminator (see above) | none beyond the terminator rule |

The "approx. call count" column counts `lights.<kind>(` occurrences in source, including branches
that may not mount together. The C-31 `lighting` section in each checkpoint capture replaces it with the
runtime `collectedLights` per game.

**Lighthouse games.** These demonstrate the PRD 02 recipe with a PRD 14 art pass limited to lighting
nodes, and must reach `lighting` ≥ 6, `shadows` ≥ 6 and `ibl_reflections` ≥ 5:

| Game | Lighting pass | Today: lighting / shadows / ibl_reflections |
|---|---|---|
| `showcase-siege-golf` | outdoor preset + sun with stable CSM; checks the fence shadow banding | 4.5 / 4.5 / 1.5 |
| `showcase-gallery-shift` | indoor preset + reflection probes + spot shadows + irradiance volume | 4 / 2 / 1 |
| `aura-clash-showcase` | night/studio preset + skinned caster shadows replacing foot decals | 3 / 2 / 2 |

The final "competitive with modern three.js" gate per game belongs to PRD 14. PRD 02 cannot claim it.

### 16.4 Integrated acceptance: automated region metrics (must pass before human review)

These metrics are computed by PRD 02's `tests/qr/prd02/metrics/regionMetrics.ts` (and by PRD 12's
`tools/quality-gate/metrics/metrics.py` at checkpoints once Q-12-1 lands), with three r185 as the reference. On
base scenes they are integrated; the same metrics on the `prd02-*` copies with `qr_flags=lighting` are the
standalone S-items of 16.1.

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
| Medium | 1920×1080 × 1.0 | ≤ 4.0 | ≤ 1.8 | opt-in ≤ 0.4 | ≤ 0.2 | off | ≤ 0.8 | ≤ 55 MB | ≤ 1.5 MB | ≤ 10 ms once (user HDRI PMREM) | ≤ +15 KB gz (shared) |
| High (M1 / RTX 3060-class) | 1920×1080 × 1.5 | ≤ 6.5 | ≤ 3.0 | opt-in ≤ 0.6 | ≤ 0.3 | PRD 03's (C-13) | ≤ 1.2 | ≤ 130 MB | ≤ 3 MB, plus 8 MB background (lazy) | ≤ 15 ms once per HDRI; probes ≤ 10 ms each (`once`) | ≤ +15 KB gz (shared), plus LTC LUT 64 KB fetched lazily |
| Ultra | 2560×1440 × 2.0 | ≤ 10.0 | ≤ 4.5 (PCSS) | ≤ 0.8 | ≤ 0.4 | PRD 03's (C-13) | ≤ 1.5 | ≤ 480 MB (C-27 values; ≈ 381 MB if Q-11-3's 512 environment lands; ≈ 230 MB with an app-level `shadow.mapSize: 2048`) | ≤ 12 MB | ≤ 60 ms once (1024 PMREM) | same as High |

Memory is derived from the C-27 values in 6.8 and from 6.9 and 6.10. Depth formats count 4 B per texel. A 256 cube
with 5 mips is 2.1 MB as RGB9E5 (prebaked presets) and 4.2 MB as RGBA16F (runtime GPU PMREM of user HDRIs or
captures, and prebaked presets while Q-06-1 is open); a 512 cube is 8.4 / 16.8 MB; a 1024 cube 33.5 / 67 MB.
SSR memory is PRD 03's and is excluded:

- Medium: 3 resident 256 environment probes (6.3 MB as RGB9E5), 2×2048² cascades (33.5 MB), a 2048×1024 atlas
  for 1 local light (8.4 MB) and 2 reflection probes at 128 RGBA16F (2.1 MB): 50.3 MB. When a user HDRI is
  resident, `EnvironmentCache` keeps at most 2 probes on Medium. Budget **≤ 55 MB**.
- High: 3 resident 512 RGB9E5 probes (25.2 MB), 2k RGB9E5 background (8.4 MB), 3×2048² cascades (50.3 MB), a
  2048² atlas for 2 local lights (16.8 MB), 4 probes at 128 RGBA16F (4.2 MB): 104.9 MB, inside 130 MB.
- Ultra: 2 resident 1024 RGB9E5 probes (67 MB; resident limit 2 at Ultra), background (8.4 MB), 4×4096²
  cascades (268.4 MB), a 4096² atlas (67.1 MB), 4 probes at 256 RGBA16F (16.8 MB), contact mask at 2560×1440
  R8 (3.7 MB): 431.4 MB. Budget **≤ 480 MB**. This exceeds the 220 MB of the PRD-local draft because C-27 fixes
  Ultra at `mapSize` 4096 × 4 cascades and `environmentSize` 1024; Q-11-3 asks for 512, and apps may override
  `shadow.mapSize` per light (C-10).
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
| WebGPU (Chrome) | Only when C-29 reports a real WebGPU backend (`A3D_QR_WEBGPU`, owner 11) | WGSL twins (8.8) behind that flag. Not an acceptance requirement for this PRD |

Required WebGL2 capabilities and fallbacks:

- `EXT_color_buffer_float` or `EXT_color_buffer_half_float` (GPU PMREM, RGBA16F scene target). Without
  it: prebaked KTX2 presets plus the Worker CPU prefilter for user HDRIs, and the lighting tier is
  capped at Low.
- RGBA16F filtering, which is core in WebGL2.
- Depth compare samplers, which are core in WebGL2.
- `KHR_parallel_shader_compile` (optional; without it, compile synchronously during the loading screen).
- `EXT_disjoint_timer_query_webgl2` (optional; absent on Safari, off by default in Firefox, and absent
  on many Android drivers. Budgets there use the section 17 toggle-delta method).
- `EXT_texture_filter_anisotropic`: consumed through C-12 `resolveSamplerAnisotropy` (R9 table); material use is PRD 04's.

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

All evidence is committed under the lane-owned `docs/project/aura3d-quality-rebuild/evidence/prd02/` with the GH
run id and the SHA (checkpoint records themselves are PRD 12's, `benchmarks/quality-rebuild/history/rounds/IC-<k>.json`):

1. `prd02/lighting-baseline/` (Phase 0): side-by-sides (JPEG) of every `prd02-*` scene on both engines with
   flags `none`, region-metric JSON; plus the IC-0 per-scene and per-game numbers copied from PRD 12's record.
2. `prd02/<phase>.md` for each phase: the S-items passed, with run ids (standalone evidence).
3. `prd02/lighting-acceptance/<run-id>/` (integrated, one per G-PANEL round):
   - 18 benchmark side-by-sides with diff images.
   - Region-metric JSON.
   - Vision-model judgments in the research/23 format, one file per scene.
   - Human `REVIEW.md`.
   - Game A/B pairs (contact + mid, `none` vs `lighting`) for all 18, plus the 3 lighthouse games.
   - The research/21-format scorecards for the lighting categories.
4. `prd02/lighting-acceptance/<run-id>/broken-controls/`: the same captures with `shadow.intensity: 0`,
   `environments.none()` and `background: false`, proving the metrics detect the absence.
5. `prd02/lighting-perf/<device>.json` for each section 19 device, plus macos-14 runner deltas.
6. A shadow-stability GIF or MP4 (60 frames) for `prd02-17` (standalone) and Siege Golf (integrated), before and after.
7. Fixture renders for the probes (box-projection fixture, red-wall bounce) and the contact-shadow
   fixture, against their three references.
8. `lighting.diagnostics()` / C-31 `lighting` + `shadows` JSON for each scene, showing observed values (filter,
   `shBound`, `backgroundDrawn`, caster variants, `readPixelsCalls: 0`).
9. `prd02/checkpoints/IC-<k>.md` per checkpoint and `prd02/migrate-lighting/<app>.md` reports.

Evidence produced from review-mode URLs (`?capture=review`) is not acceptable for the game criteria.
Game evidence must come from the shipped lane (research/18 Q9).

---

## 21. Completion criteria

**Standalone completion** (PRD 02 alone; moves `A3D_QR_LIGHTING` to `standalone-accepted`):

1. Every task in section 14 Phases 0-6 is checked, with its named test merged and green on GH Actions macos-14.
2. S1-S18 (16.1) pass on Chrome/macos-14; S2, S3, S7, S8, S10 also on the Firefox, WebKit and Windows Chrome
   subsets (18).
3. C-09, C-10, C-11, C-12 conformance is green for `stub` and `real`; the flag-off sentinel identity holds.
4. Facts F-02-01..06 are `verified` in CONTRACTS Appendix B with run ids.
5. No README, release note or showcase text claims Three.js-quality lighting. The claim registry
   (`docs/project/claim-guidelines.md`, owner 12) gains entries scoped to the measured scenes only, via request.

**Integrated completion** (checkpoint-evaluated; moves the flag to `integrated-accepted`, never blocks merges):

6. Section 16.4 region metrics pass on the base scenes with `qr_flags=all` on Chrome/macos-14 at a G-PANEL round,
   and for the subset on Firefox, WebKit and Windows Chrome.
7. Section 16.2 scores are met, and the must-disappear differences are reclassified, by both the vision model and
   the human reviewer.
8. Section 16.3 floor is met for the 18 games, and lighthouse thresholds for the 3 lighthouse games.
9. An agent-authored scene from the `create-aura3d` `mini-game` / `racing-starter` templates (integrated; evaluated
   on whatever template state lane 13 has on main, Q-13-1 being a non-blocking request) has an environment and a shadowed sun: scaffold the template, build its scene snapshot,
   assert `environment.source !== "neutral"` and one directional in `selectShadowedLights(...)`.

**Removal** (after `default-on` for two checkpoints, CONTRACTS §5.4): the `rg` deletion check returns 0 over
`packages/*/src` once PRD 02's removal PR and Q-01-4, Q-15-1, Q-15-2 have landed:

```
authored-ambient|createProductionRuntimeFallbackLights|selectForwardShadowMap|readShadowFacePixels|wideLobeBlend|A3D_PBR_NO_SPOT_SHADOW|"pcf-soft"|includes\("contact shadow"\)|SpotShadowMaps|createExternalParityContactShadow
```

## 22. Rollback considerations

- **Single switch.** `A3D_QR_LIGHTING` off (`?a3d-qr=-lighting`, `A3D_QR_LIGHTING=0`, or
  `lighting.model: "legacy-3.0"`) restores today's behaviour exactly, because every PRD 02 change is behind it and
  the flag-off path is pixel-identical (S16). The default is a flag state in the custodian-owned
  `contracts/flags.state.ts`, moved only at checkpoints; a rollback of the default is a one-line state change by
  PRD 15 from the checkpoint record. Both paths coexist until §5.4 removal, so a rollback needs no asset or data
  migration. No persistent user data is involved.
- **Sub-flags** `A3D_QR_LIGHTING_CSM`, `_PROBES`, `_CONTACT` isolate the riskiest subsystems.
- **Per-subsystem kill switches** (internal, not public API) are `?a3dLighting=` URL values parsed in PRD
  02's `compiler/lights.ts`:
  - `pmrem=cpu`: Worker prefilter.
  - `shadowFilter=legacy-grid`: kept until flag removal.
  - `csm=off`: single fitted map, still texel-snapped.
  - `atlas=off`: sun-only shadows.
  - `contact=off`.
  - `probes=off`.
  - `shadows=off` and `background=off`, used by the section 17 toggle-delta measurement.

  These exist so a production regression in one subsystem can be isolated without reverting the rest. SSR is
  switched by PRD 03's `A3D_QR_POST_SSR`.
- **Assets.** If a preset fetch fails or the CDN is down, the neutral environment stays bound and a
  warning is logged. The page is never black. Preset files are content-hashed, so a bad bake is rolled
  back by repointing the registry hash.
- **Codemod.** PRD 02 ships reports only; route and template owners (14, 13) apply them one commit per app, so a
  single app can be reverted independently.
- **Deployment.** Any production redeploy of the showcase apps follows
  `/Users/gurbakshchahal/AuraOne/AuraOne-Deploy-Final-PERMANENT.md`, and the rollback is the runbook's
  rollback. This PRD defines no separate deploy procedure.

---

## 23. Risks

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| The renderer track switches to three-backed (C-29, owner 11) mid-implementation | Medium | Track R tasks wasted | Not a wait condition. Engine-side [R/T] work, contracts, tests and acceptance are track-independent (6.0); [R] work is mostly chunks and contributors that a Track T adapter replaces in PRD 02's own `environment/threeMapping.ts` |
| Contract stubs hide most visible gains until other lanes land (C-02 generator, C-05 HDR, C-01 depth) | High | Standalone pixels improve less than integrated | Standalone acceptance is limited to what the stubs can show (16.1); the rest is integrated (16.2-16.4); legacy-path requests Q-01-1..4 move some gains earlier without blocking |
| Carve-out dropped from PR 0b (CONTRACTS §3.9) | Low | PRD 02 cannot edit that region | Work continues in PRD 02 modules and C-01/C-36 registrations; the change becomes a §6.5 request |
| Adding IBL to 15 games blows out neon/emissive games or makes them look different from their art intent | High | Category regressions | 16.3 no-regression rule (integrated). `environments.preset("night")` and intensity guidance as facts. PRD 14 art pass via Q-14-1 |
| Shader variant explosion (casters × lighting variants) increases compile stalls | Medium | Hitches; worse on mobile | Precompile at mount through C-28 `compileAsync`; cap caster variants via shared depth features; measure compile counts (S13) |
| Half-float render targets are unsupported or broken on some mobile GPUs | Low–Medium | No GPU PMREM | Prebaked RGB9E5 presets plus the Worker CPU prefilter. Tier capped at Low |
| Shadow memory on Ultra/High exceeds budget on 4 GB devices | Medium | OOM / context loss | C-27 table plus Q-11-3; per-light `mapSize` cap (C-10); atlas reallocation on tier downgrade; context-loss recovery test via C-29 |
| CSM sphere fit wastes resolution compared with a tight fit | Medium | Softer near shadows | `fit` override for arenas; 4 cascades on Ultra; measure `prd02-17` (standalone) and Siege Golf (integrated) |
| The macos-14 paravirtual GPU is not representative for performance | Certain | Wrong budgets | Budgets measured only on the section 19 devices; the runner is used for deltas only |
| Vision-model judgments are produced without viewing the images (as in research/22) | Medium | Invalid acceptance | JPEG export in the lane metrics; reviewers must quote image content; human sign-off is mandatory |
| HDRI licensing or provenance for new presets | Low | Legal | CC0 only. Registry stores license and SHA. New HDRIs come through PRD 05's C-17 admission (Q-05-1); day-0 presets use in-repo files |
| Ambient `/π` breaks third-party scenes that tuned around it | Medium | Darker fill | Flag off restores it until §5.4 removal; codemod report; migration guide via request to PRD 15 (`docs/project/migration.md`) |
| Removing the fallback rig makes zero-light scenes look dull | Medium | Agent scenes regress | Neutral environment lights them. The C-34 rule and PRD 13 skills teach sun + preset (F-02-02). `prd02-no-lights` (S2) gates it |
| Lighting programs exceed WebGL2 minimum uniform or sampler limits on mobile (E35, E36) | High without 6.10 | Link failure, which means a black or missing material on some devices | Uniform blocks; per-tier sampler table; deterministic C-12 drop order; link test against a 16-unit/224-vector device mock (S14) |
| Point-heavy games (Courier Rush ≈21 points, Pulse Tunnel ≈14, Gallery Shift and Deep Recovery ≈15) blow out or lose fill when points become infinite-range with decay 2 | High | Category regressions in 16.3 | Codemod `--preserve-range` report per game; the per-game risk column in 16.3; the A/B reviewer checks these games first |
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
| BRDF lobes, clearcoat/sheen/transmission IBL terms, material AO heuristics, clustered binding per variant | PRD 04 (C-03) |
| DFG LUT (`BRDFLut.ts`, `u_dfgLut`) | PRD 01 (C-02, R4) |
| HDRI admission, KTX2 Basis transcoder hosting | PRD 05 (C-16, C-17); PRD 02 bakes its own RGB9E5 presets (6.2) |
| Volumetric lighting, light shafts, fog scattering, particles lit by lights | PRD 07 |
| Physical sky/atmosphere and day/night. This PRD provides `environments.capture` only | PRD 07 (C-21); biome composition PRD 10 (C-26) |
| WebGPU backend architecture, froxel/GPU clustered lighting, UBO architecture, device tiering heuristics | PRD 11 |
| Per-game art direction and the final per-game competitiveness verdict | PRD 14 |
| Lean (`@aura3d/lean`) lighting. Its intents remain inert (Q-15-4) | PRD 15 |
| SSR pass, GTAO, tone mapping inside material shaders | PRD 03 (C-13), PRD 01 (C-05) |
| Ray-traced shadows or reflections, VSM/ESM shadow filtering, shadow-map caching for static geometry | Not planned; revisit after Phase 6 data |
