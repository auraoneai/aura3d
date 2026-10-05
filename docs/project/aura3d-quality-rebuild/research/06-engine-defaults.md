# 06 — Engine Defaults Audit (what an app/agent gets without explicit configuration)

Branch: `aura3d-quality-rebuild/audit` · Scope: `packages/engine/src` (root `createAuraApp` + `agent-api`),
`packages/apps` (A3DApp), `packages/rendering/src`, `packages/lean`, `packages/environments`, game templates
and the `apps/showcase-*` games as consumers. Comparison baseline: three.js r185.1 (source in
`node_modules/three`, version checked in `node_modules/three/package.json`).

Method: every value below was read from the implementation (TS defaults, GLSL strings, render-loop wiring),
not from READMEs, evidence JSON or tests. Where a default is "metadata only" (reported in diagnostics but
never reaching a GPU uniform), it is flagged as such.

---

## 0. Executive summary

The root `createAuraApp` path has defaults that keep the final image flat, low-contrast, low-res and
reflection-free. The renderer underneath has most of the right building blocks (4x MSAA HDR target, ACES
fit matching three, GGX direct BRDF, PCF shadows, a real HDRI chain). The problem is the defaults, and how
the public API composes them:

1. Adding `lights.ambient()` turns off IBL entirely. With an ambient light and no `environments.*`
   node, the bridge sets `environmentMapIntensity: 0`, `environmentMapSpecularIntensity: 0`, no procedural
   map and no texture (`index.ts:12693-12707`). Result: no environment specular, so metals read black and
   dielectrics have no Fresnel sheen. Only flat ambient plus point and directional lights remain. 21 of 27
   showcase apps (and 3 of the 5 game templates) add `lights.ambient()` without an environment node. The
   engine's own lint warning tells agents to add `lights.ambient()` (`index.ts:18256`).
2. Shadows only remove 24-38% of the direct light. Root shadow `strength` is 0.32 by default, 0.38 for
   city-day and 0.24 for product/material (`index.ts:12966-12968`). The shader does
   `mix(1.0, 1.0 - occlusion, strength)` (`pbr-direct.frag.glsl:645`). A fully shadowed pixel keeps 68% of
   the key light. three.js r185 `LightShadow.intensity = 1` (`three/src/lights/LightShadow.js:41`), so shadows
   fully occlude the direct light. This is the main reason scenes look "unlit / floaty / no depth".
3. The default IBL is a 128x64 Reinhard-tonemapped RGBA8 gradient. `createExternalParityEnvironmentLighting`
   builds a 128x64 procedural sky gradient, tone-maps it with Reinhard into 8-bit sRGB, builds 5 specular
   mips and a 32x32 8-bit BRDF LUT (`ExternalParityRenderPreset.ts:137-151`,
   `EnvironmentMapResources.ts:525-531`). Highlights are clamped to ≤1.0 before the shader sees them
   (`EnvironmentMapResources.ts:273`), so even when IBL is on there is no HDR glint and nothing for bloom to
   catch. Diffuse IBL samples the roughest specular mip (`pbr-direct.frag.glsl:751-752`) and not the
   generated 16x8 irradiance map, which is never bound. The "gameplay" preset tints all game reflections
   cyan (`specularColor [0.2,0.96,1]`, horizon `[0.1,0.72,0.7]`, `ExternalParityRenderPreset.ts:588-606`).
4. Pixel ratio defaults to 1.0, so retina is rendered at half resolution. `configureCanvas(canvas,
   options.pixelRatio ?? profile.pixelRatio ?? devicePixelRatioSafe())` (`index.ts:11133`, `:12280`). Every
   profile defines `pixelRatio`, so `devicePixelRatioSafe()` is dead code. `safe-basic` (the default
   profile) is 1, and `production` and `cinematic` are 1.5. On a DPR-2 Mac the default canvas has a quarter
   of the native pixels, and 17 of 18 games then also add FXAA on top of 4x MSAA. three.js idiom:
   `renderer.setPixelRatio(Math.min(devicePixelRatio, 2))`.
5. Primitives are low-poly and untextured, and the capsule is a sphere. `sphere` is 12x16 segments
   (`index.ts:17361-17362`; three default 32x16, examples use 64x32). `capsule` returns
   `createSphereGeometry()` (`index.ts:17477-17479`). Cylinder (24 segments) and torus have no UVs or
   tangents, so they cannot be textured. Planes are a single 4-vertex quad with 0..1 UVs. The games
   contain 685 `primitives.*` calls vs 112 `model(assets…)` calls, so most of their pixels come from these
   meshes.
6. Textured primitives sample without mipmaps and clamp instead of repeat. The textured-primitive upgrade
   uses `new Sampler({ maxAnisotropy })` (`index.ts:14379-14381`). The `Sampler` defaults are
   `minFilter "linear"`, `addressU/V "clamp-to-edge"` (`Sampler.ts:27-30`). So textured floors shimmer
   (no mip chain sampled) and `texTransforms` tiling smears edge texels instead of repeating. three
   `Texture` default is `LinearMipmapLinearFilter` (`three/src/textures/Texture.js:48`). GLB textures do
   get trilinear and 8x anisotropy (`GLTFRenderResources.ts:2195-2213`). Only the root primitive path is
   broken.
7. Exposure controls are ignored. Root tone mapping is hard-coded to `exposure: 1` (`index.ts:12898-12904`).
   The per-category "exposure presets" (`index.ts:4204-4214`) only appear in diagnostics.
   `effects.colorGrade({ exposure })` is recorded and then warned as unsupported (`index.ts:4547`), and 17
   showcase games set it.
8. The quality tier system mostly does nothing. Root renderer "quality profiles" (`safe-basic`,
   `production`, `cinematic`, `experimental-webgpu`, `index.ts:4248-4309`) differ in one live value,
   `pixelRatio` (1 / 1.5 / 1.5 / 1). Their `antialiasing`, `maxRecommendedDrawCalls`, `requestedFeatures`
   and `blockedInRoot` fields are diagnostics text. `A3DQualityPresets` (`draft/balanced/production`) only
   size a legacy `createA3DApp` canvas (`packages/apps/src/index.ts:74-92`), and no showcase or template uses
   that path. `renderer.qualityPresets()` "interactive/screenshot" with `shadowMap: "pcf-soft"` is pure
   metadata. The runtime always uses `filter: "pcf"` (`index.ts:12971`).
9. The default background is a near-black void and never shows the environment. The scene builder
   defaults to `#070b12` (`index.ts:4781`). Root never sets `environmentBackground`, and there is no grep
   hit in `agent-api/index.ts`, so even `environments.hdri()` lights the scene but the sky never appears.
   Fog is capped at ~52% opacity (`maxOpacity 0.25 + 0.5·0.55`) and its color is unrelated to the
   background color.
10. Bloom defaults are a 1-4 px single-scale blur. `quality` defaults to `"performance"`, which is
    `mipCount 1` (`NativeBloomPyramid.ts:34-61`). Radius 0.38 maps to a 3 px kernel
    (`index.ts:12791-12795`), and intensity is capped at 0.92 by "antiBlowout" (default on). `bloom.color`
    is accepted and dropped (`createProductionRuntimePostprocess` never reads it, `index.ts:12870-12885`).
    Games work around this by passing `quality: "balanced"`.

Combined, these produce the image the owner describes. A minimal or agent-authored scene gets: a black
void background, half-res pixels, chunky 12x16 spheres, flat Lambert-plus-point-light shading with no
reflections (because the agent added an ambient light), shadows that only dim the key light by a third,
and a fixed exposure. That is the "Atari / early-Nintendo" look, and it comes from defaults and
composition rules, not from missing shader features.

---

## 1. Default-settings table (root `createAuraApp`, no explicit config)

| # | Setting | Aura3D default (code) | three.js r185 typical good practice | Visual consequence |
|---|---|---|---|---|
| 1 | Pixel ratio | `profile.pixelRatio` = **1** for default `safe-basic` (`index.ts:4256`, used at `:11133`, `:12280`); `devicePixelRatioSafe()` (`:18699`, min(2,DPR)) unreachable | `setPixelRatio(Math.min(devicePixelRatio, 2))` | Half linear resolution on retina, so soft and blurry edges, mushy text and thin lines |
| 2 | Render-quality profile | `"safe-basic"` (`index.ts:4312`) | n/a | Only changes DPR. Label says "conservative feature profile", but features are identical |
| 3 | MSAA | 4x on the HDR forward target (`Renderer.ts:611`); context `antialias:true` (`index.ts:13591`) | `antialias:true` (4x) | OK. Becomes 1 sample when TAA is requested |
| 4 | Post AA | None unless `effects.antiAlias()`; games add FXAA on top of MSAA | MSAA, or SMAA/FXAA *instead* | MSAA+FXAA at DPR 1 is doubly soft |
| 5 | Output color space | sRGB (`index.ts:12903`) | `SRGBColorSpace` (`WebGLRenderer.js:304`) | OK |
| 6 | Tone mapping | ACES filmic, always on (root always submits postprocess, `index.ts:12862-12904`) | `NoToneMapping` default (`WebGLRenderer.js:269`); ACES or AgX/Neutral in examples | ACES matches three's fit exactly (`WebGL2Device.ts:3501-3517`). OK. The `agx`/`neutral` operators are scalar per-channel fakes (`:3541-3550`), not three's AgX matrix or Khronos PBR Neutral |
| 7 | Exposure | **Hard-coded 1** (`index.ts:12899`); category presets 0.78-1.24 are diagnostic-only (`:4204-4214`, consumed only at `:4481`, `:4587`); `colorGrade.exposure` ignored (`:4547`) | `toneMappingExposure` 1.0, tuned per scene | No way to brighten or darken a scene. Authors compensate with light intensities |
| 8 | HDR target | `rgba16f` (`index.ts:12864`) | HalfFloat RT for postprocessing | OK. But `GameRenderPreset` uses `rgba8` (`GameRenderPreset.ts:373`, `:450`), which clips before tonemapping |
| 9 | Environment (no light, no env node) | Procedural "studio/gameplay/daylight/evening/inspection" bundle picked by node **name substrings** (`index.ts:12708-12722`, `:4737-4765`) | `scene.environment = pmrem.fromScene(new RoomEnvironment()).texture` (256px cube faces, GGX, half-float) | 128x64 LDR gradient, so reflections are a vague blur with no highlights |
| 10 | Environment when `lights.ambient()` present | **IBL off**: `environmentMapIntensity:0, environmentMapSpecularIntensity:0`, no texture (`index.ts:12693-12707`) | AmbientLight adds to IBL and never disables `scene.environment` | **No specular reflections**. Metal reads as black/grey and plastic as chalk. Most important default defect |
| 11 | Env-map resolution / format | 128x64 equirect, RGBA8 sRGB after Reinhard, 5 mips, box/GGX prefilter of the *LDR* image (`ExternalParityRenderPreset.ts:137-151`, `EnvironmentMapResources.ts:261-276`) | PMREM 256 cube (CubeUV), HalfFloat, ~8 LODs | Mirror reflections pixelated at 128px. No HDR > 1, so no specular "pop" |
| 12 | Diffuse IBL | Samples top specular mip of env texture (`pbr-direct.frag.glsl:751-752`; identical in `ShaderLibrary.ts:368, :966, :1496`); generated SH/irradiance never bound | PMREM roughest LOD / SH irradiance | Acceptable approximation, but the generated 16x8 irradiance is dead work |
| 13 | Env intensity scalars (studio) | ambient 0.18, procedural map 0.5, spec 0.86, texture 0.44, texture spec 0.92, hdrExposure 0.86 (`ExternalParityRenderPreset.ts:607-625`) | `environmentIntensity` 1 | Under-exposed IBL, low fill, dim shadows sides |
| 14 | "gameplay" env preset | Teal sky/horizon, cyan spec `[0.2,0.96,1]` (`:588-606`) | Neutral | Every "game"-named scene without ambient gets cyan reflections, a neon/arcade cast |
| 15 | Background | `#070b12` near-black (`index.ts:4781`); clear color pre-inverted through ACES (`:13596`) | `scene.background` = color, or the env map itself | Void backdrop. Env never visible as sky (no `environmentBackground` in root) |
| 16 | Fallback direct lights (no lights authored) | key dir `[0.44,-0.64,-0.63]` 2.6 warm + fill 0.64 + rim 0.88 (`index.ts:13363-13413`) | Examples: Hemisphere 1-3 + Directional 3 | Reasonable. Fill is aligned with the default orbit camera axis (dot ≈ 1.0), which flattens form |
| 17 | `lights.ambient` | intensity 0.28 (`index.ts:3069`) | `AmbientLight(0x404040)` or Hemisphere | Also disables IBL (row 10) |
| 18 | `lights.directional` | intensity 1.5, pos [3,4,3], `shadow` undefined (`index.ts:3072-3081`) | `DirectionalLight(0xffffff, 3)` in r155+ examples | ~half of three's typical key. Diffuse = albedo/π·I·NdotL (same convention as three, `pbr-direct.frag.glsl:93-94`) |
| 19 | `lights.point` | intensity 2, **range fixed 10·scale** (`index.ts:3082-3090`, `:13241`); attenuation `range-window / max(d²,1)` (`pbr-direct.frag.glsl:847-850`) | `PointLight(color, intensity(cd), distance=0 → infinite, decay=2)` | With intensity 2, at 3 m E ≈ 0.22, so point lights are dim. No `distance` option exists in the helper. Games compensate with 15-48 point lights |
| 20 | `lights.spot` | intensity 8, angle π/6, penumbra 0.4, distance 12, `decay` accepted then dropped (not in descriptor `index.ts:13252-13271`) | `SpotLight(…, decay 2)` | `decay` silently ignored |
| 21 | rect/softbox | Spot-light proxies (`index.ts:13274-13296`); `ClusteredForward` rect path exists in shader | `RectAreaLight` + LTC | Softboxes are cones, not area lights. No soft broad highlights |
| 22 | Shadows enabled | Yes, if any light is a caster (fallback key or highest-priority authored directional) (`index.ts:12963-12964`) | Off by default; examples enable | OK |
| 23 | **Shadow strength** | **0.32** (city-day 0.38, product/material 0.24) (`index.ts:12966-12968`); renderer default 0.65 (`ForwardPass.ts:913`) | `shadow.intensity = 1` | Shadowed areas keep 68-76% of the key light, so there is almost no light/shadow contrast |
| 24 | Shadow map size | 1024 / 2048 / 4096 by *node-position* radius (`index.ts:12960`); governor default 1024 (`GameRenderPreset.ts:127`) | `mapSize 512` default, 1024-4096 in examples | OK in isolation. Single map fit over all casters (`Renderer.ts:1400-1402`). Cascades unreachable from root (needs a `PerspectiveCamera`, root passes a `CameraLike` matrix, `Renderer.ts:1387-1391`) → blurry, blocky shadows on large game levels |
| 25 | Shadow filter | `"pcf"` 9 taps (<2048) / 16 taps, radius 1.2/1.5 (`index.ts:12969-12971`); labels claim `pcf-soft` (`:4230`) | `PCFShadowMap` (r185 `WebGLShadowMap.js:89`) | Comparable |
| 26 | `receiveShadow` | Stored on nodes (`index.ts:2170`) but **never read by renderer** (no match in `ForwardPass.ts`/`Renderer.ts`) | honored | Can't opt a surface out |
| 27 | Camera | orbit, fov 45, distance 4, target [0,0.8,0], near 0.05, **far 100** (`index.ts:3223-3237`, `RootRuntimeSupport.ts:16-21`) | `PerspectiveCamera(50, a, 0.1, 2000)` | Far 100 clips large game worlds (Aura Clash comment `GameRenderPreset.ts:276-287` documents an arena clipped this way) |
| 28 | Follow camera | smoothing 0.18, fov 50 (`index.ts:3249-3264`) | n/a | OK |
| 29 | Orbit damping | 0.05 (`controls/src/OrbitControls.ts:52`) | 0.05 | OK |
| 30 | Primitive material | color `#d7dee8`, roughness 0.58, metal 0, env intensity 0.75, envMap 1 (`index.ts:14837-14870`, `:14906-14935`) | `MeshStandardMaterial` roughness 1, metalness 0, white | Fine, but pale grey-blue on a near-black void reads as "untextured CAD" |
| 31 | `material.pbr()` | color `#d7dee8`, roughness 0.55 (`index.ts:2415-2421`) | — | Same |
| 32 | Procedural normal/roughness maps in `material.*` (fabric, brushedMetal, blackRubber, frostedGlass, sneaker*) | **No rasterizer**. Recorded and warned, scalar material kept (`index.ts:14159-14165`) | real textures | The "detail" in those presets never reaches pixels |
| 33 | Sphere tessellation | 12 rows × 16 cols (`index.ts:17361-17362`) | 32×16 default, 64×32 typical | Faceted silhouettes and specular banding |
| 34 | Capsule | `= createSphereGeometry()` (`index.ts:17477-17479`) | `CapsuleGeometry(1,1,4,8)` | Capsule characters/pickups render as balls |
| 35 | Cylinder / torus | 24 segs / 48×10, **no UVs or tangents** (`index.ts:17405-17476`) | UVs always | Can't be textured |
| 36 | Plane | single quad, UV 0..1 (`index.ts:17287-17300`) | `PlaneGeometry(w,h,segs)` with UV 0..1 | With clamp sampler (row 37) a scaled floor cannot tile |
| 37 | Textured-primitive sampler | `new Sampler({maxAnisotropy})` → minFilter **linear (no mips)**, wrap **clamp** (`index.ts:14379-14381`, `Sampler.ts:27-30`) | `LinearMipmapLinear`, wrap per texture (Repeat when tiling), anisotropy set by app | Distance shimmer and moiré. Tiled ground textures smear |
| 38 | GLB texture sampler | trilinear, repeat, 8x aniso (`GLTFRenderResources.ts:2195-2213`) | glTF sampler or default; anisotropy usually `renderer.capabilities.getMaxAnisotropy()` | OK |
| 39 | Model tint | `model(asset,{material:{color}})` sets `replaceSurfaceTextures: true` (`index.ts:13567-13571`) | `material.color` multiplies `map` | Any tint wipes the GLB's albedo texture, leaving a flat colour |
| 40 | Model scale | normalized to unit bounds unless `scaleMode:"world"` (`index.ts:17808-17810`, `:17766-17789`) | no normalization | Not visual per se. Causes scale mismatches authors patch by hand |
| 41 | Bloom (when added) | intensity 0.35 capped to 0.92 (`antiBlowout` default true), threshold 0.7 author → 0.78 runtime fallback, radius 0.38 → 3 px, quality `performance` = 1 mip (`index.ts:3450-3468`, `:12870-12885`, `NativeBloomPyramid.ts:34-61`); `color` dropped | `UnrealBloomPass(res, strength 1.5, radius 0.4, threshold 0.85)` — 5 mips | Tight, faint halo instead of a wide soft glow |
| 42 | Fog (when added) | exp², density 0.12, color `#9fb7d9`, intensity 0.5 → maxOpacity 0.525 (`index.ts:12746-12759`) | `FogExp2(color, 0.0025-0.05)`, background = fog color, full opacity | Never fully fades distance. Fog color ≠ background, giving a milky band then a hard backdrop |
| 43 | SSAO (when added) | radius 0.42 → 3 px kernel, intensity 0.32, factor floor 0.18 (`index.ts:12886-12897`, `WebGL2Device.ts:3125`) | GTAO/SAO with world radius | Very subtle |
| 44 | Color grade | Only contrast/saturation honoured (`index.ts:12905-12910`) | — | exposure/shadows/highlights/LUT inert |
| 45 | Texture budget | 256 MiB (`index.ts:14598-14600`) | — | n/a |
| 46 | Physics | gravity −9.81, fixed 1/60, sleeping on, friction 0.5, restitution 0, damping 0 (`index.ts:11234-11240`, `:11279`, `RigidBody.ts:75-76`), maxSubSteps 5 | Rapier/cannon similar | OK. Not a visual factor |
| 47 | Continuous rendering | Static scenes render **one frame** unless timeline/camera/animation/particles/onFrame (`index.ts:12512-12521`) | rAF loop | Correct for perf. A route that forgets `onFrame` freezes |
| 48 | `preserveDrawingBuffer` | always true (`index.ts:13593`) | false | Perf cost only |

---

## 2. Trace: the out-of-the-box visual floor

Minimal program an agent writes (matches the `hello-world` / skill examples):

```ts
const app = createAuraApp("#app", {
  scene: scene().add(model(assets.robot))       // no lights, no env, no background, no camera
});
```

What executes:

1. `createAuraApp` (`index.ts:11126`). `normalizeCreateAppRendererOptions(undefined)` resolves the
   `safe-basic` profile (`:4312`), mode `"production"`, and `configureCanvas(canvas, 1, true)` (`:11133`).
   Backing store = CSS size × 1 (min 320×220) (`:18105-18120`).
2. Scene snapshot: background `#070b12` (`:4781`), camera `camera.orbit()`, which gives eye ≈
   `[2.48, 2.48, 3.12]`, target `[0,0.8,0]`, fov 45, near 0.05, far 100 (`:3223-3237`).
3. `startProductionRender` → `createProductionRuntimeSceneRenderer` (`:13540`). The model is normalized to
   unit size, sitting on y=0 (`:17766-17789`). `ProductionRuntimeRenderer.create({antialias:true,
   clearColor: ACES-inverse(#070b12)})`.
4. Environment (`createProductionRuntimeEnvironment`, `:12628`): no env node and no ambient, so the
   category comes from node names. "robot" matches nothing, background luminance < 0.08 gives `"neon"`,
   which falls through to the `"studio"` preset (`:12710-12715`). The studio bundle is a 128×64 LDR gradient:
   ambient 0.18 `[0.44,0.48,0.54]`, procedural map 0.5, sampled texture 0.44 / spec 0.92.
5. Lights: none authored, so `createProductionRuntimeFallbackLights` (`:13363`) adds key 2.6 (casts shadow),
   fill 0.64 and rim 0.88.
6. Shadows: `strength 0.32` ("neon" category), size 1024 (radius from node positions ≈ 1), PCF 9 taps.
   There is no ground to receive the shadow anyway.
7. Postprocess: always submitted: rgba16f, 4× MSAA, ACES @ exposure 1 → sRGB. No bloom/AO/AA.
8. If the scene is static, **one frame is rendered and the loop stops** (`:12369`, `:12512`).

Resulting image: a unit-sized model floating in a near-black void, lit by a warm key from camera-left
plus a headlight-like fill. Reflections are a blurry gradient with nothing brighter than ~1.0 before
tonemap, there is no floor, no contact grounding, and no visible sky. On a DPR-2 display it is half
resolution.

The common agent "improvement" makes it worse. The engine warns
`"Scene has no lights. Suggested fix: add lights.studio() or lights.ambient()."` (`index.ts:18256`). The
templates (`racing-starter/src/main.ts:215`, `falling-blocks-starter/src/main.ts:249`,
`character-controller/src/main.ts:60`) and the built-in prompt recipes (`index.ts:10152, 10182, 10227,
10243`) all add `lights.ambient(...)`. As soon as that node exists, IBL turns off
(`index.ts:12693-12707`) and the lit result becomes ambient-flat + Lambert/GGX from point and
directional lights only.

Shader-level effect, from `pbr-direct.frag.glsl:737-759`: with `u_environmentMapIntensity = 0` and
`u_environmentMapTextureEnabled = 0`, `proceduralEnvironmentWeight = 0` and `sampledEnvironmentWeight = 0`.
So `extensionSpecular = 0` and the only indirect term is `u_environmentColor·intensity·hemi(0.35..1)` on
the diffuse lobe. A `material.metal()` (`metallic 1`) then has kd = 0 and zero environment specular. It
renders black except where a point/directional light's GGX lobe lands.

---

## 3. Quality-tier systems: exist vs wired

| System | Location | Tiers | What actually changes at runtime | Grade |
|---|---|---|---|---|
| A3D app quality presets | `packages/apps/src/index.ts:17-92`, re-exported `packages/engine/src/A3DQualityPresets.ts` | draft / balanced / production | Canvas width/height (960×540 / 1280×720 / 1600×1000), `antialias`, `preserveDrawingBuffer`. `targetFormat` is reported but **not passed** to `Renderer.create` (`apps/src/index.ts:99-107`). Only used by `createA3DApp`, which no showcase/template calls | exists, public API. Not used by generated apps |
| Root renderer quality profiles | `agent-api/index.ts:4248-4309` | safe-basic / production / cinematic / experimental-webgpu | **pixelRatio only** (1 / 1.5 / 1.5 / 1). `antialiasing`, `requestedFeatures`, `blockedInRoot`, `maxRecommendedDrawCalls` are diagnostics strings | exists, public API. Used by some games (`qualityProfile:"production"`), but it is effectively a DPR knob |
| Renderer quality presets | `agent-api/index.ts:4225-4246` (`renderer.qualityPresets()`, `screenshotQuality()`) | interactive / screenshot | **Nothing**. No consumer in apps/templates/examples (grep). `shadowMap:"pcf-soft"` contradicts runtime `"pcf"` | metadata only (fake parity) |
| Scene exposure presets | `agent-api/index.ts:4204-4214` | 9 categories | Reported in `diagnostics().renderer.exposure`. **Never reaches `u_exposure`** (runtime constant 1 at `:12899`) | metadata only (fake parity) |
| Color-management preset | `agent-api/index.ts:4192-4202` | — | `defaultExposure: 1.05` is **not applied** | metadata only |
| Environment map presets | `agent-api/index.ts:4216-4223` | 6 | Intensities feed `environments.*` builders. The mapping to actual lighting goes through `presetByEnvironment` (`:12640-12650`) to 5 ExternalParity descriptors (e.g. "glass-studio" and "product-hero" both → "softbox") | partial |
| Root performance quality | `RootRuntimeSupport.ts:66-88`; `app.setPerformanceQuality` | continuous (resolutionScale ≤1, particleScale, lodBias, shadowSize 256-4096) | Live: backing size, LOD bias, particle pool, shadow size | real, but can only *lower* quality (`resolutionScale ≤ 1`) |
| Game performance governor | `production-runtime/GameRenderPreset.ts:123-224` | steps for res/particles/LOD/shadow | Real pure function; consumed via `performanceQuality` (turbo-drift). Only degrades from 1024 shadow / 1.0 res | real, degrade-only |
| Bloom quality | `NativeBloomPyramid.ts:9-61` | performance / balanced / cinematic | Real mip pyramid (1/3/5 mips). **Default performance (1 mip)** | real. Bad default |
| Volumetric fog quality | `resolveVolumetricFog` | off/… | real | n/a |
| Lighting defaults | `rendering/src/LightingDefaults.ts:16-55` | studioProduct / outdoorDay / interiorGallery / gameNight | Exposure 1.0-1.28, filmic, grade, bloom. **Not used by root `createAuraApp`** (only `wow-*`/examples and product-studio) | exists. Not on the default path |
| Side-view / top-down game render presets | `GameRenderPreset.ts:264-466` | 2 | Used by Aura Clash + character-controller template. `rgba8` target, shadow strength 0.38, IBL-less top-down (`:420-423`) | used. Bad defaults |

Conclusion: there is no Low/Medium/High/Ultra system that raises visual quality. Every "tier" is either
a DPR value, a canvas size, a degrade-only governor, or diagnostics text. Nothing turns on HDR IBL,
contact AO, bloom pyramid, cascaded shadows, higher env resolution or DPR-native rendering as a
"high" tier.

---

## 4. Consumer census (what the shipped games actually get)

Scanned `apps/showcase-*/src/**/*.ts` and `apps/aura-clash-showcase/src` (27 dirs with code).

| Default pitfall | Games affected | Evidence |
|---|---|---|
| `lights.ambient()` with **no** `environments.*` → IBL off | 21: asset-audition, aurora-lander, bank-shot, blockfall-reactor, courier-rush, deep-recovery, digital-twin-ops, gallery-shift, gravity-post, mech-hangar, meshy-relic-pilot, neon-swarm, orbital-defense, patrol-wing, pulse-tunnel (12 ambient nodes), rooftop-buckets, skyline-runner, smart-city-control, vault-breakers, webgpu-particle-lab, aura-clash | rg census in this audit. Only cinematic-architecture, product-configurator, siege-golf and turbo-drift add `environments.studio/productHero/nightCinematic`. **0** use `environments.hdri` |
| `effects.colorGrade({ exposure })` ignored | 17 (aurora-lander, bank-shot, blockfall, courier-rush, gallery-shift, gravity-post, deep-recovery, mech-hangar, rooftop-buckets, pulse-tunnel, siege-golf, turbo-drift, aura-clash, patrol-wing, skyline-runner, vault-breakers, neon-swarm) | e.g. `showcase-courier-rush/src/main.ts:297` |
| Sub-native DPR | default (1.0) for every game not passing `pixelRatio`/`qualityProfile:"production"`; explicit 0.7 in skyline-runner (`main.ts:1879`), 1 in turbo-drift (`:2988`), data-galaxy (`:159`), pulse-tunnel (7×) | rg census |
| FXAA on top of MSAA | 16 add `effects.antiAlias({mode:"fxaa"})` | rg census |
| Point-light spam to fake fill/bounce | pulse-tunnel 48, courier-rush 21, deep-recovery 15, gallery-shift 15, gravity-post 10 | rg census. Consistent with dim fixed-range point lights and IBL being off |
| Primitive-built worlds | 685 `primitives.*` vs 112 `model(assets…)` calls | rg count |
| Bloom default overridden | 14 pass `quality:"balanced"`, so authors noticed the default was weak | rg census |
| Near-black backgrounds | ~22 of 27 use `#02…`–`#10…` | rg census |

Templates (`packages/create-aura3d/templates`): `racing-starter`, `falling-blocks-starter`,
`character-controller` = ambient + one directional, no env, so no IBL. `fighting-game` = `lights.studio` +
bloom, no env. Only `product-viewer` adds `environments.studio()`. Agents copy templates, so they inherit
the no-reflection look.

The prompt-recipe compiler (`promptRecipes`, `index.ts:10147-10250`) bakes in the "neon arcade" art
direction: dark `#030711` background, `material.emissive` on rails/coins/arrows/hazards, ambient 0.16, 2
point lights. The "cinematic" recipe fakes wet reflections with emissive boxes ("amber wet reflection",
"cyan wet reflection"), a direct symptom of the engine having no reflection path in that configuration.

---

## 5. Ladder grading of default-related capabilities

Ladder: exists / works / public API / used by generated apps / good defaults / composes / modern quality /
agents know / examples demonstrate.

| Capability | exists | works | API | used | good default | composes | modern | agents know | examples |
|---|---|---|---|---|---|---|---|---|---|
| ACES tone mapping | ✔ | ✔ | implicit | ✔ (always) | ✔ | ✔ | ✔ (matches three fit) | — | ✔ |
| Exposure control | ✔ (uniform) | ✔ in renderer | ✘ in root (ignored) | ✘ | ✘ (constant 1) | ✘ | ✘ | ✘ (17 games set a no-op) | ✘ |
| IBL (procedural) | ✔ | ✔ | implicit | partial | ✘ (LDR 128×64) | ✘ (killed by ambient) | ✘ | ✘ | ✘ |
| IBL (HDRI) | ✔ | ✔ (real HDR chain, `upgradeProductionEnvironmentHdri` `:14190`) | `environments.hdri` | ✘ (0 games) | n/a | partial (no background) | probably | skill mentions it | ✘ in games |
| Environment as visible background | renderer has `EnvironmentBackgroundPass` | ✔ in renderer | ✘ in root | ✘ | ✘ | ✘ | ✘ | ✘ | ✘ |
| Shadows | ✔ | ✔ | `shadow:true` | ✔ | ✘ (strength 0.24-0.38) | partial (single map, no CSM from root) | ✘ | ✘ | ✘ |
| MSAA | ✔ | ✔ | implicit | ✔ | ✔ | ✔ (off when TAA) | ✔ | — | — |
| DPR | ✔ | ✔ | `pixelRatio` | partial | ✘ (1.0) | ✔ | ✘ | ✘ (games pick 0.7-1.35) | ✘ |
| Bloom pyramid | ✔ | ✔ | `quality` | ✔ (14 opt in) | ✘ (`performance`) | partial (`color` dropped) | partial | partial | partial |
| Fog | ✔ | ✔ | `effects.fog` | ✔ | ✘ (opacity cap 0.525, no bg match) | ✘ | ✘ | — | — |
| Procedural material maps | spec only | ✘ (no rasterizer) | ✔ | ✔ (fabric/rubber/brushedMetal presets) | ✘ | ✘ | ✘ | ✘ | ✘ |
| Primitive textures | ✔ | partial | ✔ | some | ✘ (no mips, clamp) | ✘ (cyl/torus no UV) | ✘ | ✘ | ✘ |
| Quality tiers | ✔ (×5 systems) | metadata | ✔ | ✔ (DPR only) | ✘ | ✘ | ✘ | ✘ | ✘ |
| Point/spot lights | ✔ | ✔ | ✔ | ✔ | ✘ (fixed 10 m range, `decay` dropped) | ✔ (clustered >16) | partial | — | — |
| Area lights | shader has rect path | ✔ in renderer | `lights.rect/softbox` → spot proxies | ✔ | ✘ | ✘ | ✘ | ✘ | ✘ |

---

## 6. three.js r185 reference points used

- `WebGLRenderer`: `toneMapping = NoToneMapping` (`src/renderers/WebGLRenderer.js:269`),
  `toneMappingExposure = 1.0` (`:277`), `_outputColorSpace = SRGBColorSpace` (`:304`).
- `WebGLShadowMap.type = PCFShadowMap` (`src/renderers/webgl/WebGLShadowMap.js:89`).
- `LightShadow.intensity = 1`, `bias = 0`, `normalBias = 0`, `radius = 1`, `mapSize = 512²`
  (`src/lights/LightShadow.js:41-104`).
- `PerspectiveCamera(fov = 50, aspect = 1, near = 0.1, far = 2000)` (`src/cameras/PerspectiveCamera.js:33`).
- `SphereGeometry(radius = 1, widthSegments = 32, heightSegments = 16)` (`src/geometries/SphereGeometry.js:31`).
- `Texture` default `minFilter = LinearMipmapLinearFilter` (`src/textures/Texture.js:48`).
- Common practice in examples (knowledge, r150+): `renderer.setPixelRatio(window.devicePixelRatio)` (often
  `Math.min(...,2)`); `scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture`
  (PMREM 256-px CubeUV, HalfFloat); `DirectionalLight` intensity ~3 with physically correct lights;
  `UnrealBloomPass(strength 1.5, radius 0.4, threshold 0.85)` with 5 mips; `scene.fog` colour =
  `scene.background`; `AgXToneMapping`/`NeutralToneMapping` as real matrix/curve implementations.

---

## 7. Root-cause classification

| Finding | Bucket |
|---|---|
| Ambient light disables IBL | B-defaults (+ F-architecture: ambient modelled as an *environment replacement*) |
| Lint warning recommends `lights.ambient()`; templates/recipes add it | E-agent-authoring (+ B) |
| Shadow strength 0.24-0.38 | B-defaults |
| LDR 128×64 Reinhard IBL as the default environment | A-renderer (resource pipeline) + B |
| Default DPR 1 / profile system that only sets DPR | B-defaults |
| Low-tess sphere, capsule = sphere, untextureable cyl/torus | A/B (primitive generators) |
| No-mip clamp sampler on textured primitives | A-renderer bug (engine bridge) |
| Exposure presets / colorGrade exposure ignored | F-architecture (fake parity) |
| Quality tiers mostly metadata | F-architecture / G-evidence |
| Env never shown as background; fog cap | B / A |
| Bloom default single-mip, color dropped | B |
| Procedural material maps never rasterized | A (fake parity) |
| Model tint replaces textures | B |
| Name-substring scene categories select lighting | F-architecture |
| Games set no-op exposure, spam point lights, sub-native DPR, FXAA+MSAA | D-game / E (consequence of above) |

---

## 8. Recommendations (ordered by pixels gained per hour)

1. **Make ambient additive to IBL.** In `createProductionRuntimeEnvironment` (`index.ts:12693-12707`),
   pick the environment bundle first, then add ambient color·intensity to `lighting.color/intensity`.
   Never zero `environmentMapIntensity`. Provide an explicit `environments.none()` for authors who want
   to opt out.
2. **Shadow strength default 1.0** (or ≥0.85) for every category (`index.ts:12966-12968`,
   `GameRenderPreset.ts:346`, `:434`, `LightingDefaults.ts:24`). Expose `lights.directional({ shadow: {
   intensity, size, bias, normalBias } })`.
3. **Replace the default environment with an HDR RoomEnvironment-equivalent.** Generate a half-float cube
   (≥256 px faces) with real emissive "panels" (values 5-20) and prefilter in linear HDR (the RGBE /
   linear-hdr path already exists in `createEnvironmentMapResourceSet` via `textureEncoding: "rgbe"`).
   Drop the Reinhard-to-8-bit step (`ExternalParityRenderPreset.ts:142-145`). Remove the cyan "gameplay"
   tint. Bind the irradiance map that is already generated.
4. **DPR default = `min(devicePixelRatio, 2)`.** Remove `pixelRatio` from profiles, or make
   `options.pixelRatio ?? devicePixelRatioSafe()` win (`index.ts:11133`, `:12280`). Keep the governor for
   downscaling.
5. **Wire exposure.** Root `toneMapping.exposure` = `colorGrade.exposure ?? options.renderer.exposure ?? 1`
   (`index.ts:12898-12904`). Delete or wire the category presets.
6. **Fix the primitive sampler**: `new Sampler({ minFilter:"linear-mipmap-linear", magFilter:"linear",
   addressU:"repeat", addressV:"repeat", maxAnisotropy })` (`index.ts:14379`). Change the `Sampler`
   class default to trilinear to match three.
7. **Primitive quality**: sphere 32×24 minimum (64×32 for "hero" size), real capsule, UVs+tangents on
   cylinder/torus, subdivided plane option. Cheap, and visible in 685 call sites.
8. **Show the environment**: default `background` to the environment (blurred) when an env node or HDRI is
   present. Default fog colour to background and fog maxOpacity to 1.
9. **Bloom**: default `quality: "balanced"`, honor `color` or remove it from the API, and stop clamping
   intensity to 0.92 by default.
10. **Change the lint message** at `index.ts:18256` to recommend `environments.studio()` + one directional
    light. Update the `racing-starter`, `falling-blocks-starter` and `character-controller` templates and
    the `promptRecipes` the same way. Make `material.*` presets with procedural maps either rasterize the
    procedural texture on mount or stop advertising it.
11. **Real quality tiers**: one `quality: "low"|"medium"|"high"|"ultra"` option on `createAuraApp` that
    moves DPR, shadow size/cascades (pass a `PerspectiveCamera` into the renderer so CSM is reachable), env
    resolution, bloom pyramid, SSAO and TAA together. Delete the metadata-only presets
    (`rendererQualityPresets`, `sceneExposurePresets`, `rendererColorManagementPreset.defaultExposure`,
    `A3D_QUALITY_PRESET_SETTINGS`), or make them drive the runtime.
12. **Model tint** should multiply, not replace. Make `replaceSurfaceTextures` opt-in.
13. Honor `receiveShadow`, spot `decay`, and add `distance` to `lights.point` (`index.ts:13241`). Raise
    camera `far` default to ≥1000 (`RootRuntimeSupport.ts:18`).

---

## 9. What is sound (keep)

- ACES filmic implementation matches three.js (`WebGL2Device.ts:3501-3517`). Linear workflow and sRGB
  output are correct.
- 4x MSAA HDR (rgba16f) forward target with blit resolve (`Renderer.ts:611`, `WebGL2Device.ts:680-785`).
- Direct-light BRDF: GGX D, correlated Smith G, Schlick F, Burley diffuse, same 1/π convention as three
  (`pbr-direct.frag.glsl:66-95`). Split-sum with multi-scatter compensation (`:182-210`).
- GLB texture sampling (trilinear, 8x anisotropy, mip generation) (`GLTFRenderResources.ts:2195-2213`,
  `WebGL2Device.ts:3956-4003`).
- Real HDRI chain (`upgradeProductionEnvironmentHdri`, `index.ts:14190`). It just needs to be the default
  path or easy to reach.
- Bloom pyramid implementation (balanced/cinematic) and clustered forward lighting (>16 lights).
- Performance governor and `setPerformanceQuality` plumbing (degrade ordering is sensible).
- Physics defaults (gravity, fixed step, sleeping, substeps).
