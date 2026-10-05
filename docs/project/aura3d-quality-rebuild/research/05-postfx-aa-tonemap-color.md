# 05 — Postprocessing, Anti-Aliasing, Tone Mapping, Color Management

Audit scope: everything between "forward pass wrote a pixel" and "the browser composited the canvas":
post pipeline architecture, bloom, tone mapping and exposure, sRGB/linear handling, AA, SSAO/SSR/DOF/
motion blur/TAA, vignette/LUT/color grade, outline, device-pixel-ratio and render-resolution policy.

Method: I read the shader source strings and the call chain that the 18 showcase games actually reach
(`createAuraApp` → `startProductionRender` → `createProductionRuntimeSceneRenderer` →
`ProductionRuntimeRenderer` → `ProductionWebGL2Renderer` → `Renderer.render` → `WebGL2Device.presentLdrPostprocess`).
I did not trust README/parity/evidence files. Reference is three.js r185 (`node_modules/three` is 0.185.1).
No browsers or builds were run; two small `node -e` calculations were used to evaluate the actual
bloom/SSAO/ACES formulas with the actual default numbers.

---

## 0. Executive answer — why the games look old, from the post/color side

Ranked by how much each one costs in final pixels on a typical showcase frame:

| # | Cause | Bucket | Effect on pixels |
|---|---|---|---|
| 1 | `window.devicePixelRatio` is never used by default. `pixelRatio` resolves to the quality profile's constant (`safe-basic` = **1.0**, `production` = **1.5**) before the DPR fallback is ever reached. Skyline Runner forces **0.7**. | B-defaults | On a DPR-2 laptop/phone every game renders at 1/4 (or 0.56× for production) of native pixels and is upscaled by the compositor → soft, blocky, "low-res console" look. |
| 2 | The "FXAA" every game turns on is not FXAA. It is a 4-neighbour cross blur: if local luma range > 0.125, output = 25% center + 75% average(N,S,E,W). | A-renderer | Blurs every edge *and* every high-contrast texture detail on top of the 4× MSAA that already ran. Combined with #1 this is the smeared, out-of-focus look. |
| 3 | Bloom soft-knee convention `softKnee: 0.5` (the maximum the validator allows, copied into 16 of the showcase mains) plus a hidden ×7 "response gain" for `quality:"balanced"`. Knee becomes `smoothstep(threshold−0.5, threshold+0.5, luma)`, so mid-tones (linear luma 0.3–0.5) bloom. | B-defaults + D-game | Mid-grey lit surfaces get +80…125% added glow over their area (computed below). ACES then compresses it → milky, low-contrast, washed-out haze. This is the concrete "washed out" mechanism. |
| 4 | SSAO (used by 6 games) operates on **raw non-linear depth** with a raw-depth bias of 0.025. With the default camera (near 0.05, far 100) every depth discontinuity farther than ~1.5 m from the camera yields **exactly zero occlusion**. It is applied to tone-mapped LDR color and only ever darkens the far side of a silhouette. | A-renderer | Games pay for "AO" and get none. Objects float, no contact grounding — a core reason scenes read as flat early-3D. |
| 5 | Tone mapping is hard-wired: ACES, exposure **1**, whitePoint 1, no public API to change it. `effects.colorGrade({exposure})` (every game passes 1.02–1.06) is **silently dropped**; `shadows`, `highlights`, `lut`, `intensity`, `vignette`, `temperature` are dropped too. AgX and "Neutral" exist only as fake per-channel curves inside the device shader. | A + B | No exposure control, no modern AgX/Neutral rendering, no LUT grading. Every game has the same ACES-at-1.0 look with an ACES hue skew (cyan `#38d6ff` emissive → `160,224,234`). |
| 6 | Depth-based effects (SSAO, SSR, DOF, motion blur, TAA, outline) all run **after** tone mapping on 8-bit sRGB-encoded data ("byte kernels"). Many kernels are written to bit-match a CPU reference (integer LUTs, 24-bit "squareWords" arithmetic) rather than to look good. | A + F | AO darkens emissives/sky, DOF/blur average display-space colors (bokeh loses highlights), SSR reflects tone-mapped colors. Correct order in three.js/pmndrs is AO/SSR in linear HDR before tone mapping. |
| 7 | Any scene with `effects.volumetricFog()` (Deep Recovery) cannot use the fused GPU path and falls into the **CPU readback chain** every frame: `readFloatPixels` → JS bloom (hard threshold, quality/softKnee ignored) → JS tone map → JS god-ray → JS color grade → JS FXAA → upload. | A + F | Frame-time collapse plus a different, cruder bloom than the other games. |
| 8 | No output dithering anywhere in the LDR present path; dark exp² fog gradients on night scenes are quantized straight to 8 bits. | A | Visible banding in exactly the dark, foggy scenes most showcases use (courier, deep recovery, aurora, neon swarm). |
| 9 | Hex color parser accepts only `#rrggbb`. `#f80`, `"orange"`, `"rgb(...)"`, `"#rrggbbaa"` silently become `[0.02,0.025,0.035]` (near-black navy) with no warning. Numbers (`0xff8800`) are a type error. | A + E | Agent-authored colors in common CSS forms silently render black. |
| 10 | The scaffold an agent starts from (`templates/mini-game`, `@aura3d/lean`) has **no lights, no environment, no postprocess, no shadows**: `lights.directional(...).position(x,y,z)` returns an inert `{kind:"light"}` and discards all arguments. | E + F | New agent-built games start from an unlit, un-post-processed baseline; output relies on the shader's in-shader Narkowicz curve. |

What is **correct** (and must not be blamed): linear working space; sRGB→linear conversion of hex
material/instance/fog/env colors; glTF base-color/emissive textures uploaded as `SRGB8_ALPHA8` and data
maps as linear; HDR (`rgba16f`) forward target; 4× MSAA on that target preserved under
postprocessing; ACES Filmic matrix-for-matrix identical to three.js r185; no double tone mapping or
double gamma in the production path. The washed-out look is **not** a gamma bug in the production
path — it is bloom knee + ACES + hard-coded exposure + blur AA + low DPR. (There *is* a real double-gamma
bug, but only in the `safe-basic` fallback renderer — §4.4.)

---

## 1. The path the games actually run

### 1.1 Entry and renderer selection

- Every showcase calls `createAuraApp` from `@aura3d/engine` (agent-api). Templates `mini-game` and
  `product-viewer` use `@aura3d/lean` instead (§9).
- Default quality profile: `resolveRendererQualityProfile(id ?? "safe-basic")`
  (`packages/engine/src/agent-api/index.ts:4310`). Despite the name, `safe-basic.rendererMode` is
  `"production"` (`index.ts:4249-4262`), so the default *is* the production bridge.
- `createProductionSceneRenderer` (`index.ts:12523`) → `createProductionRuntimeSceneRenderer`
  (`index.ts:13540`) → `ProductionRuntimeRenderer.create({ backend: "webgl2", antialias: true,
  preserveDrawingBuffer: true, clearColor: colorToAcesInputClearColor(background) })`
  (`index.ts:13586-13597`). **Backend is hard-coded to WebGL2** for root apps; the WebGPU post shaders
  (`packages/rendering/src/webgpu/WebGPUPostShaders.ts`, which contain a more genuine FXAA 3.11
  console core at `:262`) are never reached by a game.
- If the production bridge throws, it silently falls back to `createWebGLSceneRenderer`
  (`index.ts:12545-12549`), the "safe-basic" Blinn-Phong renderer (§4.4), recording only a warning.

### 1.2 Postprocess is always on in the bridge

`createProductionRuntimePostprocess` (`index.ts:12797-12935`) **always** returns:

```ts
targetFormat: "rgba16f",                       // index.ts:12864
toneMapping: { exposure: 1, whitePoint: 1, operator: "aces",
               inputColorSpace: "linear", outputColorSpace: "srgb" },   // index.ts:12898-12904
```

Bloom/SSAO/color-grade/outline/FXAA/SSR/DOF/TAA/motion-blur/volumetric are added only when the scene
contains the matching `effects.*` node. So the minimum pipeline is: forward → rgba16f MSAA target →
resolve → fullscreen ACES + sRGB encode → canvas.

### 1.3 Frame graph in `Renderer.render` (`packages/rendering/src/Renderer.ts:560-700`)

1. Allocate/reuse forward target `renderer-forward-color`: `format rgba16f`, `sampleCount`
   = `4` unless TAA (`1`) (`Renderer.ts:611`, `:928-944`). Depth = sampleable texture if a depth pass
   is requested.
2. Shadow pass, clear, optional `EnvironmentBackgroundPass` (output linear), `ForwardPass` with
   `outputColorSpace: "linear"` when post is on (`Renderer.ts:674`).
3. `executePostprocess` (`Renderer.ts:977`): builds the pass list in fixed order
   (`RendererPostprocessPlan.ts:178-223`):

   `bloom → tone-mapping → volumetric-light → color-grade → chromatic-aberration → film-grain →
   depth-of-field → motion-blur → contact-shadow → ssao → ssr → taa → outline → fxaa`

4. If every pass is in the fusable set (`Renderer.ts:2111-2134`: bloom, tone-mapping, color-grade,
   dof, motion-blur, ssao, ssr, taa, outline, fxaa) → `device.presentLdrPostprocess` (GPU).
   Otherwise → per-pass loop that uses `readFloatPixels`/`readPixels` and JS kernels
   (`Renderer.ts:993-1067`, `:1245-1275`). `volumetric-light`, `chromatic-aberration`, `film-grain`,
   `contact-shadow` are **not** fusable → CPU path.

### 1.4 GPU present (`WebGL2Device.presentLdrPostprocess`, `WebGL2Device.ts:871-1110`)

- Resolve MSAA (blit, NEAREST) → bloom (single-scale or pyramid) → if any spatial pass: draw
  tone-map+grade into a ping-pong target, then DOF → motion blur → SSAO → SSR → TAA → outline,
  each a full-screen pass on the ping-pong pair → final draw to canvas with FXAA.
- Ping-pong textures are float only when `sourceIsHdr && bloom` (`:946-948`); otherwise rgba8.
- Architecture verdict: a **fixed-order, hand-coded uber-chain** inside the device, not a composer and
  not a render graph. There is a `RenderGraph` class but post does not use it; `EffectComposer`
  (`packages/rendering/src/postprocess/EffectComposer.ts`) exists but is a **CPU readback composer**
  (`EffectComposer.ts:149-160, 315-333`) and is not on the game path. Users cannot insert passes,
  reorder them, write custom full-screen shaders, or pick formats.

Comparison, three.js r185: `RenderPipeline`/`PostProcessing` node graph (WebGPU) or
`EffectComposer` + `RenderPass` + `OutputPass` (WebGL) with arbitrary user passes, explicit HDR
`HalfFloatType` targets, MSAA via `samples`, and tone mapping/color-space conversion in `OutputPass`.
pmndrs `postprocessing` merges effects into one `EffectPass` with per-effect blend functions.

---

## 2. Tone mapping and exposure

### 2.1 What runs

LDR present fragment shader (`WebGL2Device.ts:3453-3633`):

```glsl
vec3 acesFilmic(vec3 color) {
  // Match current Three.js ACESFilmicToneMapping.
  ... acesInput * (color / 0.6) ... acesRrtAndOdtFit ... acesOutput ...
}
vec3 applyToneMapping(vec3 color) {
  vec3 decoded = decodeColor(color);
  vec3 mapped = u_toneOperator == 2
    ? acesFilmic(max(vec3(0.0), decoded * u_exposure) / max(0.0001, u_whitePoint))
    : vec3(toneMapChannel(decoded.r), toneMapChannel(decoded.g), toneMapChannel(decoded.b));
  return encodeColor(mapped);     // clamp → piecewise sRGB OETF
}
```

The ACES matrices and RRT/ODT fit are identical to three.js `tonemapping_pars_fragment.glsl.js:46-70`
(I diffed the constants). Computed through the actual formula (node):

| Linear input | Display output (8-bit) |
|---|---|
| white 1.0 | 226,226,226 |
| mid-grey 0.18 | 127,127,127 |
| `#ff8800` (unlit) | 238,159,36 |
| `#38d6ff` × 1.35 (`material.emissive` default strength) | 160,224,234 |
| `#ff42c8` × 1.35 | 255,111,218 |

So ACES is *correct* — but a pure white surface displays at 226, and saturated cyan emissives skew to
pastel. That is what ACES does; it is why modern three.js work moved to AgX/Neutral for anything that
must keep brand/UI color fidelity.

### 2.2 Operators "available"

`toneMappingOperatorId` (`WebGL2Device.ts:4736-4744`): linear, reinhard, aces, filmic, uncharted2,
agx, neutral. Actual implementations:

| Operator | Aura implementation | three.js r185 | Verdict |
|---|---|---|---|
| ACES | Hill fit, `/0.6`, matrices (`:3507-3523`) | identical | real |
| AgX | `log2(1+x)/log2(17)` then smoothstep, **per channel** (`:3541-3545`) | inset matrix → log2 encode in [-12.47,4.03] EV → 6th-order sigmoid polynomial → outset matrix → linearize (`:113-168`) | **fake** — no inset/outset, no sigmoid; hue-skews exactly the way AgX is designed not to |
| Neutral | `min(1, x(1+x/7.5)/(1+x))` per channel (`:3547-3550`) | Khronos PBR Neutral: min-channel offset, peak compression, desaturation 0.15 (`:170-200`) | **fake** — not the Khronos curve |
| Reinhard | `x/(1+x)` per channel | same | real |
| filmic / uncharted2 | per-channel legacy curves | `CineonToneMapping` etc. | legacy |

None of these are reachable from `createAuraApp`: `AuraCreateAppOptions` has no tone-mapping,
exposure, or output-color-space field (only `pixelRatio`, `index.ts:10798`). The bridge always sends
`operator:"aces"`. **Grade: exists / technically works (ACES only) / no public API / not configurable
by games / AgX+Neutral fake.**

### 2.3 Exposure

- Bridge: `exposure: 1` hard-coded (`index.ts:12899`).
- `effects.colorGrade({ exposure })` stores the value (`index.ts:3549`) and then the bridge drops it:
  `colorGrade: { contrast, saturation }` only (`index.ts:12905-12910`). The engine knows: it emits
  `"color-grade exposure is recorded but has no native grade target yet; contrast/saturation execute"`
  into diagnostics warnings (`index.ts:4547`). Every game passes `exposure: 1.02…1.06` believing it works
  (e.g. `apps/showcase-courier-rush/src/main.ts:297`, `showcase-gravity-post/src/main.ts:1189`).
- Scene-category exposure presets (`index.ts:4204-4214`: neon 1.18, city-night 1.22, space 1.24 …) are
  computed into `diagnostics.renderer.exposure` (`index.ts:4481`) and **printed in the overlay as
  `tone: aces-filmic @ <preset>`** (`index.ts:18657`) but are never sent to the renderer. Diagnostics
  claim an exposure that is not applied → fake parity.
- No auto-exposure / eye adaptation anywhere.

three.js: `renderer.toneMappingExposure` (default 1) is a first-class uniform; pmndrs has
`ToneMappingEffect` with adaptive luminance.

### 2.4 Background color pre-inversion hack

`colorToAcesInputClearColor` (`index.ts:15400-15418`) runs the authored background hex through an
inverse ACES fit and a `toeCompensation = 0.6 + 0.06·smoothstep(...)` fudge so that after ACES the
clear color "comes out" as authored. Works for flat clear colors only; fog, environment background,
and every surface still go through ACES. It is a symptom: rather than letting authors choose
`NoToneMapping`/Neutral for UI-like color fidelity, the engine inverts its own tone curve per color.

### 2.5 Two different tone curves depending on path

- Post path (all root apps): Hill ACES above.
- No-post path (`@aura3d/lean`, low-level `Renderer` without `postprocess`): the forward PBR shader's
  `a3dPbrEncodeOutput` uses **Narkowicz** `(x(2.51x+.03))/(x(2.43x+.59)+.14)` without the customary
  `×0.6` pre-scale (`ShaderLibrary.ts:406-411`, `ShaderLibraryCore.ts:588-593`).
- Safe-basic fallback: Reinhard + `pow(1/2.2)` (§4.4).

The same scene therefore looks different depending on which entry point an agent picked.

---

## 3. sRGB output and double-application analysis

I traced every encode/decode on the production path to answer "is gamma or tone mapping applied twice?"

| Stage | What happens | Evidence |
|---|---|---|
| Hex material color | `#rrggbb` → /255 → `srgbToLinearChannel` | `index.ts:15383-15394`, used by `resolveProductionPrimitiveScalars` |
| Instance colors | `colorToLinearRgba` | `index.ts:14756-14761` |
| Fog / env / ambient colors | `colorToLinearRgb` | `index.ts:12749` (fog), `:12679` (env), `:12697` (ambient) |
| glTF baseColor / emissive / sheenColor / specularColor textures | `getTexture(..., "srgb")` → `SRGB8_ALPHA8` | `packages/assets/src/GLTFRenderResources.ts:1588-1592, 1925-1945`; `WebGL2Device.ts:4066-4068` |
| glTF normal / MR / occlusion / transmission | `"linear"` | same file `:1589-1591` |
| Image decode | `createImageBitmap(..., colorSpaceConversion:"none")` + `UNPACK_COLORSPACE_CONVERSION_WEBGL = NONE` | `GLTFRenderResources.ts:2232-2237`; `WebGL2Device.ts:3913` |
| Forward shader output with post | `u_outputColorSpace = 0` → raw linear HDR | `ForwardPass.ts:502-515`, `Renderer.ts:674` |
| Unlit/instanced-unlit shaders | write `u_baseColor * vertexColor` raw (no `u_outputColorSpace`) — correct for linear target, **too dark if ever used without post** | `ShaderLibrary.ts:85-96, 520-531, 554-560` |
| Present | decode (inputColorSpace linear → no-op) → ACES → clamp → sRGB OETF once | `WebGL2Device.ts:3480-3487, 3563-3569` |
| Color grade | after encode, in display space, clamp | `WebGL2Device.ts:3571-3586` |

**Conclusion: no double tone mapping and no double gamma in the production path.** The forward pass
does not tone map when post is on, and the present shader encodes exactly once.

Real color-management defects found:

1. **Safe-basic fallback double-gamma** (§4.4): sRGB hex → used as linear → `pow(1/2.2)` → washed out.
2. **Compressed sRGB textures are never decoded**: `resolveCompressedTextureFormat`
   (`WebGL2Device.ts:4117-4134`) only maps to UNORM formats (`COMPRESSED_RGBA_S3TC_DXT*`,
   `0x9278 = COMPRESSED_RGBA8_ETC2_EAC`, `COMPRESSED_RGBA_ASTC_4x4_KHR`); there is no
   `*_SRGB*` variant and no shader-side decode. A KTX2 base-color texture would be sampled as linear →
   too bright/desaturated after sRGB encode. Latent today (no showcase ships `.ktx2`), but it is exactly
   the "washed out" signature the moment the KTX2 performance guidance in the skills is followed.
3. **Hex parser is `#rrggbb`-only** (`colorToClearColor`, `index.ts:15383-15389`):
   ```ts
   if (typeof color === "string" && /^#[0-9a-f]{6}$/i.test(color)) { ... }
   return [0.02, 0.025, 0.035, 1];
   ```
   `AuraColor` is typed `` `#${string}` | string `` (`index.ts:917`), so `"#f80"`, `"orange"`,
   `"rgb(255,136,0)"`, `"#ff8800cc"` all type-check and silently render near-black. Numeric
   `0xff8800` (the three.js idiom) does not type-check. three.js `Color` accepts hex numbers, all CSS
   forms and named colors, and converts via `ColorManagement` from sRGB.
4. **Vertex colors**: glTF `COLOR_0` is linear by spec and is multiplied raw — correct. There is no API
   to declare sRGB vertex colors for procedural meshes (three.js has the same limitation unless the user
   converts), so not a defect.

---

## 4. Anti-aliasing and resolution

### 4.1 DPR / render resolution (the single biggest pixel-count loss)

```ts
// index.ts:11133 (createAuraApp) and index.ts:12280 (startProductionRender)
options.pixelRatio ?? rendererSelection.profile.pixelRatio ?? devicePixelRatioSafe()
```

`profile.pixelRatio` is always a number (`safe-basic` 1, `production` 1.5, `cinematic` 1.5,
`experimental-webgpu` 1 — `index.ts:4249-4310`), so `devicePixelRatioSafe()` (`index.ts:18699`,
`min(2, max(1, dpr))`) is **dead code**. Consequences:

| Game | pixelRatio actually used | Pixels vs native at DPR 2 |
|---|---|---|
| courier-rush, gravity-post, neon-swarm, patrol-wing, siege-golf, bank-shot, blockfall, aurora-lander, deep-recovery, orbital-defense, meshy-relic-pilot, gallery-shift, pulse-tunnel | 1.0 (safe-basic default) | 25% |
| turbo-drift (gameplay) | 1.0 — comment at `showcase-turbo-drift-circuit/src/main.ts:2983-2986` says "Public gameplay keeps its renderer-selected device pixel ratio", which is false | 25% |
| vault-breakers, rooftop-buckets (`min(dpr,1.75)`), mech-hangar | 1.5–1.75 | 56–77% |
| skyline-runner | **0.7** forced (`showcase-skyline-runner/src/main.ts:1879`, to pass a software-GPU CI budget) | 12% |
| data-galaxy | 1 forced | 25% |

The ratio is captured once at mount; `resizeRenderer` (`index.ts:12294-12310`) reuses the same
constant so DPR changes (moving windows between displays, pinch zoom) are ignored. `configureCanvas`
also floors the backing store at 320×220 (`index.ts:18105-18120`).

three.js: `renderer.setPixelRatio(window.devicePixelRatio)` is the universal idiom in every example;
r3f defaults `dpr=[1,2]`. Aura's default is the opposite.

### 4.2 MSAA

- Forward HDR target: `sampleCount = 4` (`Renderer.ts:611`), multisample renderbuffer in the target's
  own internal format (`RGBA16F` for HDR, `WebGL2Device.ts:680-692`), resolved by `blitFramebuffer`
  NEAREST before post (`WebGL2Device.ts:769-786`). **MSAA is not lost when postprocessing is on** —
  good, and better than three.js's `EffectComposer` default (which needs `samples` set manually).
- Resolve happens in linear HDR before ACES: bright/dark edges alias after tone mapping (same as
  three.js; the fix in modern engines is a tonemapped resolve or TAA).
- The canvas context is *also* created `antialias:true` (`index.ts:13591`) and
  `preserveDrawingBuffer:true` for all apps (`:13595`). The default framebuffer only ever receives one
  full-screen triangle, so its MSAA is pure memory/bandwidth waste, and `preserveDrawingBuffer` defeats
  the browser's swap-chain discard optimization every frame — a cost paid so screenshot evidence can
  read the canvas.
- TAA forces `sampleCount 1` (`Renderer.ts:607-611`).

### 4.3 The "FXAA" pass (used by all 16+ games that call `effects.antiAlias({mode:"fxaa"})`)

`WebGL2Device.ts:3611-3631`:

```glsl
vec3 north = finalColorAt(v_uv + vec2(0.0, -u_texelSize.y));
... south, west, east ...
float minLuma = min(centerLuma, ...); float maxLuma = max(centerLuma, ...);
if (maxLuma - minLuma < u_edgeThreshold) { outColor = vec4(center, alpha); return; }
vec3 average = (north + south + west + east) * 0.25;
outColor = vec4(mix(center, average, clamp(u_subpixelBlend, 0.0, 1.0)), alpha);
```

with defaults `edgeThreshold 0.125`, `subpixelBlend 0.75` (`WebGL2Device.ts:1921-1922`); the bridge
passes `fxaa: {}` (`index.ts:12924`) so defaults always apply.

This is **not FXAA**: no edge-direction detection, no perpendicular search along the edge, no end-of-span
detection, no sub-pixel aliasing estimate. It is "if contrast > 12.5%, replace the pixel with 75% of a
4-tap plus-shaped box blur". Real FXAA 3.11 (three.js `FXAAShader`/`FXAANode`) blends along the edge
tangent only, leaving texture interiors and orthogonal detail intact. Effects:

- Every texture detail with >12.5% local luma contrast (text, panel lines, decals, specular glints,
  window grids) is blurred 75%. That includes the 4× MSAA result that was already antialiased.
- Thin features 1 px wide (wires, rails, lane markers) are averaged with background → they fade.
- Per pixel the shader evaluates `finalColorAt` 5 times, each of which evaluates tone map + grade (and,
  with sharpening, 5 more taps) → up to 25 texture fetches + 25 ACES evaluations per pixel.

Grade: exists / runs / public API / used by every game / **bad algorithm and on by convention** /
composes / **degrades quality** / agents copy it believing it is FXAA.

### 4.4 Safe-basic fallback renderer (silent fallback target)

`createWebGLSceneRenderer` (`index.ts:15982+`) fragment shader (`index.ts:16820-16924`):

- view direction is a constant `normalize(vec3(0.0, 0.34, 1.0))` — not the camera;
- Blinn-Phong with fixed `pow` exponents, hemisphere fake environment;
- primitive color = `colorToRgb(...)` (`index.ts:16484`, `:17911`) — **sRGB bytes used as linear**;
- output `color/(color+1)` then `pow(color, 1/2.2)` (`index.ts:16923-16924`).

sRGB-as-linear plus a gamma encode = the classic double-gamma washed-out look. This renderer is reached
whenever the production bridge throws (`index.ts:12545`) or when a route passes `mode:"safe-basic"`
(art-review scripts in `apps/showcase-pulse-tunnel/art-review/*.ts`). Only a warning string records it.

### 4.5 TAA (opt-in, used by no showcase)

`WebGL2Device.ts:3313-3409`: velocity-reprojected history with Catmull-Rom (cubic) history sampling,
3×3 neighbourhood min/max clamp, depth-tag rejection, displacement-scaled confidence, and a fixed 1.04
unsharp in presentation. It is the most "real" spatial effect in the device. Caveats: runs on LDR
tonemapped data (common, acceptable), plain AABB clamp (no variance clip / YCoCg), only rigid opaque
geometry gets velocity ("Unsupported deforming/transparent geometry emits a named warning",
`index.ts:3557-3560`), so skinned characters and particles ghost or are excluded. three.js r185 has
`TRAANode`/`TAARenderPass` (WebGPU path has velocity + variance clipping).

### 4.6 SMAA

Not implemented on any path. three.js has `SMAAPass`/`SMAANode`.

---

## 5. Bloom

### 5.1 Plumbing

`effects.bloom` / `effects.neonBloom` (`index.ts:3482-3493`) → bridge
(`index.ts:12866-12884`):

```ts
threshold: clamp(authored ?? 0.78, 0, 1),
intensity: clamp(authored ?? 0.3, 0, 2),
radius: resolveNativeBloomRadius(authored),   // index.ts:12791: radius<=1 ? round(r*8) : round(r); clamp 1..4
quality, softKnee, shoulder (passed through if authored)
```

Dropped by the bridge: `color` (neonBloom default `#ff42c8`), `antiBlowout`, `maxIntensity`
(Patrol Wing relies on `maxIntensity: 0.34, antiBlowout: true` — not honored).

Device defaults (`normalizeNativeBloomOptions`, `WebGL2Device.ts:4481-4509`): threshold 0.75,
intensity 0.35, radius 1, softKnee 0, shoulder 0, **quality "performance"** when unset
(`NativeBloomPyramid.ts:34-37`). Validator throws for `softKnee > 0.5` — which is why the courier
comment (`showcase-courier-rush/src/main.ts:288-295`) calls 0.5 "the maximum legal value and the
repo-wide convention" after a black-canvas incident.

### 5.2 Algorithms

| Quality | What runs | Spread |
|---|---|---|
| `performance` (default when `quality` unset) | full-res bright extract → full-res separable Gaussian, radius 1–4 px → composite | **1–4 px** halo: imperceptible "glow" on everything except tiny emissives |
| `balanced` (what the games request) | full-res extract → 3 mips (½, ¼, ⅛) via 4-tap bilinear box downsample → per-mip Gaussian radius `[6,10,14]·r/4` → weighted accumulate `[0.55,0.30,0.15]` → composite × **7** | up to ≈ 11 px × 8 ≈ 90 px |
| `cinematic` | 5 mips, weights `[0.4,0.25,0.16,0.11,0.08]`, composite × **17** | larger |

HDR bright extract (`WebGL2Device.ts:2838-2850`):

```glsl
float luma = dot(source.rgb, vec3(0.2126, 0.7152, 0.0722));
float kneeLow = max(u_threshold - u_softKnee, 0.0);
float kneeHigh = min(u_threshold + u_softKnee, 1.0);
float weight = u_softKnee <= 0.0 ? step(...) : smoothstep(kneeLow, kneeHigh, luma);
outColor = source * weight;
```

- Reads the **HDR** linear buffer (good), but threshold is clamped to `[0,1]` linear, so HDR
  highlights are never separated from lit diffuse — there is no "only >1.0 blooms" physically based mode.
- No Karis average / firefly suppression on the first downsample → single bright specular pixels flicker
  as they move (visible "sparkle" on wet/metal surfaces).
- 4-tap box downsample, no 13-tap (COD) or tent upsample chain; mips are accumulated by bilinear
  fetch, not progressively upsampled → blocky ⅛-res bloom under motion.
- The ×7 / ×17 response gain (`NativeBloomPyramid.ts:106-109`) is a constant "calibrated against the
  frozen r185 ACES/sRGB workload" — i.e. tuned to match a screenshot, not physically derived.
- The LDR (rgba8) bloom path uses packed bit-LUT textures for the threshold and a 256×256 composite LUT
  (`:2851-2873`, `:2945-2957`) — engineered to bit-match a CPU reference, not for visual quality.

### 5.3 Why bloom washes the image out — numbers

Using the actual bridge/device math with the values the games pass (knee from `softKnee:0.5`, gain ×7
for `balanced`), uniform-area energy added relative to the surface's own luminance:

| Game setting | Knee window | Effective gain | luma 0.3 | luma 0.5 | luma 0.8 | luma 1.0 |
|---|---|---|---|---|---|---|
| neonBloom 0.34, thr 0.68 (turbo, rooftop) | 0.18–1.00 | 2.38 | +14% | **+80%** | +202% | +238% |
| neonBloom 0.44, thr 0.68 (courier) | 0.18–1.00 | 3.08 | +18% | **+104%** | +262% | +308% |
| neonBloom 0.45, thr 0.62 (vault breakers) | 0.12–1.00 | 3.15 | +34% | **+125%** | +274% | +315% |
| bloom 0.20, thr 0.72 (mech hangar) | 0.22–1.00 | 1.40 | +4% | +41% | +117% | +140% |

A normally lit diffuse surface (linear luma ~0.3–0.5) is not a "highlight", yet it receives
+15…125% added, blurred light. ACES then compresses the sum toward its shoulder. Result: the whole
frame lifts and softens — the milky, low-contrast look. three.js `UnrealBloomPass` uses
`LuminosityHighPassShader` with `smoothWidth 0.01` (a near-hard threshold) and is usually fed only
emissives > 1.0 in HDR; pmndrs `BloomEffect` defaults `luminanceThreshold` ≈ 1 with `luminanceSmoothing`
0.03 and `mipmapBlur`. The "convention" here is two orders of magnitude softer.

### 5.4 CPU bloom (Deep Recovery path)

`bloomFloatPixels` (`PostProcessPass.ts:1694-1740`): hard `luma >= threshold`, single-scale separable
blur radius 1–4 px, ignores `quality`, `softKnee`, `shoulder`. So Deep Recovery's
`quality:"balanced", softKnee:0.5` bloom is replaced by a 1–4 px hard-threshold glow, computed in JS
on a full float readback every frame.

Ladder: exists ✓ / works ✓ / public API ✓ / used by games ✓ / good defaults ✗ (performance tier
default, 0.5 knee convention) / composes partially (bridge drops color/maxIntensity; CPU path differs) /
modern quality ✗ / agents know how to use it ✗ / examples demonstrate it ✗
(`apps/postprocessing-bloom` is two triangles on the low-level `Renderer`, threshold 0.08, Reinhard,
`apps/postprocessing-bloom/src/main.ts:100-104`).

---

## 6. SSAO / GTAO, SSR, DOF, motion blur, volumetric, outline

### 6.1 SSAO (`WebGL2Device.ts:3091-3129`)

```glsl
float centerDepth = depthAt(pixel);
for 3x3 ring at offset u_radius px (8 taps):
  occlusion += clamp((centerDepth - sampleDepth - u_bias) / (0.14 + u_radius*0.04), 0, 1);
float factor = max(0.18, 1.0 - (occlusion/samples) * u_intensity * 0.72);
outColor = source.rgb * factor;     // applied to tone-mapped LDR colour
```

- Depth is the **raw non-linear** depth buffer value. The code comment admits it:
  "SSAO keeps its legacy response (documented partial)" (`WebGL2Device.ts:902-904`). SSR and DOF were
  linearized; SSAO was not.
- Bridge: `radius = round((authored ?? 0.42) * 8)` → 1..8 px, `intensity ≤ 1`, `bias 0.025`
  (`index.ts:12886-12896`).
- Default camera near 0.05, far 100 (`RootRuntimeSupport.ts:16-21`). Computed per-tap occlusion
  (radius 5) with the real formula:

| Near surface z | Far surface z | Raw depth diff | Per-tap occlusion |
|---|---|---|---|
| 10 | 11 | 0.00045 | **0.0000** |
| 3 | 10 | 0.01167 | **0.0000** |
| 8 | 30 | 0.00459 | **0.0000** |
| 1.5 | 10 | 0.02835 | 0.0098 |
| 1 | 10 | 0.04502 | 0.0589 |

  With game cameras 6–25 units from the action, SSAO contributes **nothing**. Where it does fire
  (within ~1.5 m of the lens) it darkens the *background* pixel next to a near silhouette (center deeper
  than sample) → a halo, not contact occlusion. No normals, no hemisphere, no noise rotation, no blur.
- Applied after ACES on display-space color and multiplies emissives/sky too.
- `effects.contactOcclusion` maps to the *same* SSAO pass (`index.ts:12856-12859`), so the 5 games that
  author both get one no-op pass.

three.js r185: `GTAOPass` / `GTAONode` (horizon-based, view-space normals, denoise), `SAOPass`, N8AO in
the ecosystem — all linear-depth, view-space, applied to lighting/HDR before tone mapping.

**Grade: exists / runs / public / used by 6 games / produces ~zero pixels / fake parity.**

### 6.2 SSR (`WebGL2Device.ts:3131-3208`)

Linear view-space ray march (≤64 steps) + 5-step binary refinement, thickness test, edge fade,
roughness from a normal mask or a constant 0.25 with `dFdx/dFdy` normals. Reasonable 2010-era SSR.
Issues: runs on tone-mapped LDR (reflections of display colors, highlights already clipped), single
ray, no roughness cone/blur, no temporal resolve → noisy/sharp mirror look on everything. Bridge fixes
`maxDistance 18` (`index.ts:12925-12930`). Not used by any showcase.

### 6.3 DOF (`WebGL2Device.ts:3210-3262`)

Linearized depth, CoC from `|depth−focus|−range`, uniform disc gather radius ≤ 8 px (≤ 201 taps).
No near/far layer separation, no CoC-weighted gather (foreground bleeds), no highlight bokeh (LDR input
already clipped). three.js `BokehPass`/`DepthOfFieldNode` are also simple but run pre-tonemap in the
node pipeline. Not used by showcases.

### 6.4 Motion blur (`WebGL2Device.ts:3264-3299`)

Per-pixel velocity, ≤16 nearest-texel taps, velocity clamped ±64 px, in LDR. Acceptable but no tile
max/neighbour max, so silhouettes don't blur outward. Not used by showcases.

### 6.5 Volumetric "fog" (`VolumetricFog.ts:105-144` → `volumetricLightPixels`)

The "volumetric-light" pass is a screen-space radial (GPU Gems 3 crepuscular) blur from a fixed
screen position `lightPosition ?? [0.5, 0.18]`, decay 0.94, exposure 1.1 — not a froxel/raymarched
volume. It is **CPU-only** (`Renderer.ts:1259-1260`), not fusable (`Renderer.ts:2115`), and drags the
whole chain into readback mode. The authored `color` is ignored (`resolveVolumetricFog` reads
`params.lightColor`, which the bridge never passes; `index.ts:12810-12822`). Used by Deep Recovery
(`apps/showcase-deep-recovery/src/main.ts:280-285`).

### 6.6 Outline (`WebGL2Device.ts:2990-3060+`)

Full-frame Sobel on final 8-bit luma with 24-bit limb arithmetic to bit-match a CPU kernel, then a
blend LUT. It outlines **every luminance edge in the image**, not selected objects. three.js
`OutlinePass` is selection-based (mask + edge detect + glow), which is what game "highlight the
interactable" needs. Not used by showcases.

### 6.7 Color grade / vignette / LUT

The present shader supports contrast (pivot 0.5 in display space), temperature/tint offsets,
saturation, vibrance, vignette, sharpening (`WebGL2Device.ts:3571-3600`). The bridge forwards only
`contrast` and `saturation` (`index.ts:12905-12910`). `vignette`, `temperature`, `tint`, `vibrance`,
`sharpening`, `exposure`, `shadows`, `highlights`, `lut` are unreachable from `createAuraApp`.
No 3D LUT support exists on the GPU path at all. Neon Swarm fakes a vignette with a DOM overlay
(`apps/showcase-neon-swarm/src/hud.ts:104-253`). three.js: `LUTPass`/`Lut3DNode`, `ColorCorrection`,
`VignetteShader`.

### 6.8 Chromatic aberration, film grain, contact-shadow post

CPU-only kernels (`Renderer.ts:1253-1264`); not fusable; not exposed by the bridge.

---

## 7. Banding and dithering

- No dither in the present shader (`WebGL2Device.ts:3453-3633`), the forward shaders, or the bloom
  composite. Grep for `dither` in `WebGL2Device.ts`, `ShaderLibrary.ts`, `ShaderLibraryCore.ts` returns
  nothing; only the CPU volumetric pass has a `dither` flag.
- Intermediate ping-pong targets are rgba8 sRGB-encoded when bloom is absent; with SSAO/SSR/DOF the
  tone-mapped image is quantized to 8 bits *before* further filtering, then re-quantized.
- Showcases are dominantly dark (backgrounds `#030711`, `#04141c`, `#010508`) with exp² fog — the worst
  case for 8-bit banding. three.js materials have `dithering: true`; pmndrs `EffectPass` has
  `dithering`. A 1-LSB triangular noise before the final 8-bit write would remove it.

---

## 8. Capability ladder summary

Ladder columns: E exists · W technically works · P public API (`createAuraApp`) · U used by games ·
D good defaults · C composes · Q modern visual quality · K agents know to use it · X examples demonstrate.

| Capability | E | W | P | U | D | C | Q | K | X | Notes |
|---|---|---|---|---|---|---|---|---|---|---|
| HDR rgba16f forward target | ✓ | ✓ | implicit | ✓ | ✓ | ✓ | ✓ | – | – | solid |
| MSAA 4× under post | ✓ | ✓ | implicit | ✓ | ✓ | ✓ | ✓ | – | – | solid; canvas MSAA wasted |
| ACES Filmic | ✓ | ✓ | forced | ✓ | ~ | ✓ | ✓ (ACES) | ✗ | ✗ | identical to three.js |
| AgX / Neutral | fake | ✗ | ✗ | ✗ | – | – | ✗ | ✗ | ✗ | per-channel stand-ins |
| Exposure | ✓ (device) | ✓ | **✗ (dropped)** | believed | ✗ | ✗ | – | ✗ | ✗ | `colorGrade.exposure` ignored; overlay lies |
| sRGB output encode | ✓ | ✓ | implicit | ✓ | ✓ | ✓ | ✓ | – | – | single encode, correct |
| Hex color → linear | ✓ | `#rrggbb` only | ✓ | ✓ | ✗ | ✓ | – | ✗ | – | other CSS forms → black |
| Texture color space | ✓ | ✓ (RGBA8) / ✗ (compressed) | implicit | ✓ | ✓ | ~ | ✓ | – | – | KTX2 sRGB bug latent |
| DPR | ✓ | ✓ | ✓ | overridden | **✗** | ✓ | – | ✗ | ✗ | DPR fallback unreachable |
| FXAA | ✓ | ✓ | ✓ | 16+ games | ✗ | ✓ | **✗ (blur)** | ✗ | ✗ | not FXAA |
| SMAA | ✗ | | | | | | | | | |
| TAA | ✓ | rigid only | ✓ | ✗ | – | ~ | ~ | ✗ | ✗ | best spatial effect, unused |
| Bloom | ✓ | ✓ | ✓ | ✓ | ✗ | ~ | ✗ | ✗ | ✗ | knee/gain wash; perf default 1–4 px |
| SSAO | ✓ | numerically ~0 | ✓ | 6 games | ✗ | ✗ (LDR) | ✗ | ✗ | ✗ | fake parity |
| SSR | ✓ | ✓ | ✓ | ✗ | – | LDR | ~ | ✗ | ✗ | |
| DOF | ✓ | ✓ | ✓ | ✗ | – | LDR | ✗ | ✗ | ✗ | |
| Motion blur | ✓ | ✓ | ✓ | ✗ | – | LDR | ~ | ✗ | ✗ | |
| Volumetric light | ✓ | CPU | ✓ | 1 game | ✗ | ✗ | ✗ | ✗ | ✗ | god-ray, readback |
| Outline | ✓ | ✓ | ✓ | ✗ | – | – | ✗ (all edges) | ✗ | ✗ | not selection-based |
| Color grade | ✓ | ✓ | contrast/sat only | ✓ | ~ | ✓ | ~ | ✗ | ✗ | |
| Vignette | ✓ | ✓ | ✗ | DOM fake | – | – | – | ✗ | ✗ | |
| LUT | ✗ (GPU) | | API field dropped | | | | | | | |
| Dithering | ✗ | | | | | | | | | |
| Custom post pass | ✗ | | | | | | | | | fixed uber-chain |

---

## 9. Agent-authoring and template findings (E)

1. **Cargo-culted recipe.** 16 showcase mains contain the identical tail
   `neonBloom({ quality:"balanced", softKnee:0.5, shoulder:0.6 })` + `colorGrade({ exposure:1.0x, contrast:1.0x, saturation:1.1 })` + `antiAlias({ mode:"fxaa" })`
   (`rg -c "softKnee: 0.5" apps/showcase-*/src/main.ts` → 16 files). Two of its three knobs are
   counter-productive (soft knee, fake FXAA) and the third's headline parameter (exposure) is dropped.
2. **False beliefs encoded in comments**: turbo-drift asserts gameplay uses "renderer-selected device
   pixel ratio" (`showcase-turbo-drift-circuit/src/main.ts:2983-2986`); courier documents softKnee 0.5 as
   a legality limit rather than a look decision (`showcase-courier-rush/src/main.ts:288-295`);
   courier/skyline comments describe repeated "giant white bloom blob" fixes by lowering intensity —
   treating the symptom of the 0.5 knee + ×7 gain.
3. **No skill guidance** on tone mapping, exposure, DPR, AA choice, bloom thresholds or banding. The only
   skill mention is the migration table row "`EffectComposer` bloom → `effects.bloom(...)`"
   (`packages/aura3d-cli/skills/aura3d-threejs-migration/SKILL.md:55`).
4. **Silent drops instead of errors**: `colorGrade.exposure/lut/shadows/highlights`, bloom
   `color/maxIntensity/antiBlowout`, volumetric `color`, unsupported hex forms — all accepted, none
   rendered, at most a diagnostics warning nobody reads.
5. **Lean scaffold is inert**: `templates/mini-game/src/main.ts:1-12,68` imports `@aura3d/lean/game`;
   `lights.directional(_options).position(_x,_y,_z)` returns `{kind:"light"}` and discards everything
   (`packages/lean/src/base.ts:252-259`); `createAuraAppWithRenderer` submits only primitive render
   items with no lights, environment, shadows or postprocess (`base.ts:386-415`). It does read DPR
   (`base.ts:495`) — ironically the only entry point that does — but never resizes after mount.

---

## 10. Fake-parity inventory (support appears to exist; not a production implementation)

- `AgX` and `neutral` operators in the device shader (`WebGL2Device.ts:3541-3550`).
- "FXAA" (`WebGL2Device.ts:3611-3631`) — a thresholded cross blur.
- SSAO — raw-depth, numerically zero at gameplay distances (`WebGL2Device.ts:3091-3129`).
- Exposure: overlay prints `tone: aces-filmic @ <category exposure>` (`index.ts:18657`) while the
  renderer always uses 1 (`index.ts:12899`); `colorGrade.exposure` dropped (`index.ts:4547`).
- `packages/rendering/src/cinematic/*Pass.ts` (Bloom, Vignette, FilmGrain, DepthHaze) — pure data
  descriptors carrying `rendererOwnedEvidence` flags, no pixel work.
- `packages/rendering/src/postprocess/SSAOPass.ts` `runExternalParitySSAO` — defaults to a synthetic
  depth buffer with a hard-coded square in the middle (`SSAOPass.ts:12-20`);
  `production-runtime/postprocess/SSAOPass.ts` uses `createProductionDepthProxy` when no depth is given.
- `postprocess/EffectComposer.ts` — three.js-named, but every pass is a JS readback kernel.
- Profile metadata: `safe-basic.blockedInRoot` lists "postprocess pass chain" (`index.ts:4259`) while
  the bridge runs a postprocess chain for it; `cinematic.status:"fallback-only"` with
  `blockedInRoot: ["renderer-owned bloom pass", ...]` while bloom runs.
- `devicePixelRatioSafe()` (`index.ts:18699`) — present, unreachable.
- WebGPU post shaders (more faithful FXAA) — unreachable from games (bridge hard-codes WebGL2).

---

## 11. Recommendations

### P0 — change the pixels of all 18 games immediately

1. **DPR default**: resolve `pixelRatio = options.pixelRatio ?? min(devicePixelRatio, profile.maxPixelRatio ?? 2)`;
   turn profile `pixelRatio` into a *cap*, re-evaluate on resize and `matchMedia('(resolution: ...)')`
   change. Add dynamic resolution scaling driven by frame time instead of CI-motivated constants like
   Skyline's 0.7. Expected gain: 2–4× more shaded pixels on HiDPI displays.
2. **Replace the fake FXAA** with real FXAA 3.11 (port three.js `FXAAShader` or the existing WGSL core)
   or SMAA; run it *only* when MSAA is unavailable or TAA is off; never default `subpixelBlend 0.75`.
   Better: make MSAA 4× the default AA and treat FXAA as an opt-in for performance tiers.
3. **Bloom defaults**: physically based HDR bloom — threshold in linear HDR units (allow > 1, default
   ~1.0), knee ≤ 0.1, Karis-averaged 13-tap downsample + tent upsample over 5–6 mips (three.js
   `UnrealBloomPass`/`BloomNode`, pmndrs `mipmapBlur`). Remove the ×7/×17 response gains; make
   `quality:"balanced"` the default instead of the 1–4 px `performance` tier. Lower the `softKnee`
   validator max or reinterpret it, and strip `softKnee:0.5` from the showcases.
4. **Honor exposure**: wire `colorGrade.exposure` (or better a top-level `toneMapping: { operator,
   exposure }` option on `createAuraApp`) into `u_exposure`; error on unsupported fields instead of
   warning. Make diagnostics report the exposure actually sent.
5. **Replace SSAO** with GTAO/SAO in view space using linear depth + reconstructed or G-buffer normals,
   half-res with bilateral blur, applied to the HDR lighting before tone mapping (or at least to the
   linear forward target). Until then, stop advertising/allowing `ambientOcclusion` as a feature.

### P1

6. Move AO, SSR, DOF, motion blur and volumetrics **before** tone mapping on the rgba16f chain; keep only
   FXAA/SMAA, grain, vignette, LUT after the OETF.
7. Implement real AgX (three.js `AgXToneMapping`) and Khronos PBR Neutral; expose operator choice;
   consider AgX or Neutral as the default for product/material scenes and keep ACES for games.
   Delete `colorToAcesInputClearColor` once authors can choose a fidelity-preserving operator.
8. Add triangular-PDF dither (±1 LSB) in the final present shader.
9. Make every pass GPU-native or reject it: port volumetric-light, chromatic aberration, film grain to
   the device chain; never fall back to per-frame `readPixels` in an interactive app.
10. Replace the fixed uber-chain with a small composable pass list (or adopt a node pipeline) so
    LUT, vignette, selection outline and custom passes can be added without editing `WebGL2Device`.
11. Color parsing: accept numbers (`0xff8800`), `#rgb`, `#rrggbbaa`, CSS named and `rgb()/hsl()`;
    throw on unparseable input. Single shared parser for engine, lean and fallback.
12. Fix the safe-basic fallback: decode sRGB → linear, use the real camera view vector, and make a
    failed production mount a hard, visible error in dev builds rather than a silent visual downgrade.

### P2

13. Add `*_SRGB` compressed internal formats (`COMPRESSED_SRGB8_ALPHA8_ETC2_EAC`,
    `COMPRESSED_SRGB_ALPHA_S3TC_DXT5_EXT`, `COMPRESSED_SRGB8_ALPHA8_ASTC_4x4_KHR`) before shipping KTX2.
14. Drop `antialias:true` on the canvas when rendering through an offscreen MSAA target, and make
    `preserveDrawingBuffer` a capture-mode-only option.
15. Unify the three tone curves (post ACES, forward Narkowicz, fallback Reinhard+2.2) behind one
    `toneMapping` setting used by every entry point including `@aura3d/lean`.
16. Selection-based outline (stencil/mask) for gameplay highlighting.
17. Write a postfx skill section: correct defaults, what each effect costs, and explicit "do not" rules
    (no soft-knee bloom on lit surfaces, no FXAA on top of MSAA, pass DPR).

---

## 12. Keep (sound subsystems)

- Linear workflow and hex→linear conversion for materials, instances, fog, env, ambient.
- glTF texture color-space assignment per slot and `SRGB8_ALPHA8` upload; `colorSpaceConversion:"none"`.
- rgba16f HDR forward target with 4× MSAA preserved under post and resolved via blit.
- ACES Filmic implementation (matches three.js r185 exactly).
- Single-encode present path — no double tone mapping/gamma in production.
- TAA accumulation shader structure (cubic history, neighbourhood clamp, depth rejection) as a base.
- SSR ray-march + binary refinement and linearized-depth DOF as starting points once moved pre-tonemap.
- `NativeBloomPyramid` planning math (mip sizing, byte accounting) — keep the planner, replace the
  kernels/weights/gain.
- Anisotropic filtering support and mip generation in `WebGL2Device`.
