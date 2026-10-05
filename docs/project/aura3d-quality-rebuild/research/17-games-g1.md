# 17 — Games G1 forensic audit: Aura Clash Arena, Mech Hangar, Orbital Defense

Scope: `apps/aura-clash-showcase`, `apps/showcase-mech-hangar`, `apps/showcase-orbital-defense`.
Method: I read the source (entry, scene construction, render source, materials, lights, post, VFX,
HUD, audio). I parsed every primary GLB header and JSON chunk with a small node script, read the
engine code paths each game actually takes, and checked the evidence/test harness parameters. No
browser, dev server, or build was run. Scores are code-inferred and still need screenshot
correction.

Cross-references: `06-engine-defaults.md` (root defaults table), `04-lighting-ibl-shadows.md`,
`08-vfx-atmos-environments.md`, `11-asset-pipeline.md`, `12-agent-authoring.md`.

---

## 0. Executive summary

| Game | Render path | Primary visual content | Biggest single pixel killer | Verdict |
|---|---|---|---|---|
| Aura Clash Arena | `createAuraApp` root, with a `attachRootRenderSource` production-runtime compatibility source (`AuraClashArenaApp.ts:1502-1533`) | 2 Quaternius skinned rigs (27-35k tris, textured) + a textured city-block GLB (98.6k tris, 26 PBR maps) | **LDR pipeline.** `createSideViewGameRenderPreset` sets `targetFormat: "rgba8"` and no tone-map operator, so the renderer clamps linear light to 1.0 in an 8-bit target and then applies the **default Reinhard** operator. Peak scene white is ~0.735 sRGB (~188/255), and dark tones band | Save through polish (engine-level fix plus art direction) |
| Mech Hangar | root `createAuraApp` safe API, `qualityProfile: "production"` (`main.ts:703-788`) | A static, unrigged 100k-tri Meshy "hero" plus a JS-generated 144-608-tri flat-shaded "MH-2M" family, and ~190 primitive nodes of set dressing | **Assets.** The characters are rigid statues with yaw-only rotation, and the modular parts are procedurally generated boxes with 4-segment joints. Also `lights.ambient(0.72)` turns IBL off, and audio is oscillator-synthesized | Substantial rebuild of art, animation and audio. The code skeleton is reusable |
| Orbital Defense | root `createAuraApp`, default `safe-basic` profile (`main.ts:128-131`) | 100% primitives: 6 sphere/2 box/3 torus calls → 33 nodes; 12×16 spheres | **Everything.** No assets, no VFX, no audio, IBL killed by `lights.ambient(0.18)`, DPR 1, HUD `innerHTML` rebuilt every frame | Full rebuild, or delete |

Root causes, condensed:

- **Engine (A/B).** (1) The side-view game preset ships an LDR 8-bit linear forward target and inherits a
  Reinhard default operator. That is a hard brightness ceiling plus banding on the one flagship that
  uses real assets. (2) Root shadow strength is 0.32, and it **silently overrides** the preset's 0.38
  (`index.ts:14002`). (3) `lights.ambient` disables IBL (Mech Hangar, Orbital Defense). (4) The shadow
  map is a single map fit over all casters, which is bad for both Aura Clash's city block and Mech
  Hangar's two sets 34 m apart. (5) There is no particle/sprite/additive VFX path in use, so every
  "spark" is an opaque unlit sphere or capsule mesh.
- **Asset (C).** Aura Clash is the only one of the three with production-grade assets. Mech Hangar's
  "release" parts are 144-608 triangles, untextured and flat-shaded (`scripts/build-models.mjs:22-27`
  sets `SEGMENTS = 4` to stay under a "40 KB per-part release budget"). Its hero is an unrigged 27 MB
  Meshy candidate. The Aura Clash crowd is a 4-triangle unlit billboard card borrowed from another
  game ("Blockfall Reactor Mechanic").
- **Game (D).** Lighting is compensated by stacking lights: Aura Clash has 8 lights, including two
  point "keys" at 4.7/4.45 that follow the fighters, and Mech Hangar has 12 lights shared by two sets.
  VFX is geometric. The Aura Clash camera is a 60° FOV orthogonal side view at -3.4° pitch. The HUD is
  a web dashboard with explanatory prose and a control-button strip.
- **Authoring/process (E/G).** Effort went into evidence rather than pixels. `AuraClashArenaApp.ts`
  is 4,285 lines with 239 evidence/proof/probe/claim mentions. It has 15 Playwright specs and 27
  scripts. The visual-regression evidence is captured with `?auraTestDriver=1&capture=combat-impact`,
  which renders at a **320 px backing width** (`AuraClashArenaApp.ts:1524-1529`) and strips the crowd,
  stage furniture and signs (`:1375-1377`, `:1493`). So the "visual" proof never looked at the shipped
  image. A full `createAuraClashPostProcess()` preset (bloom 0.58, fog, grade, FXAA) exists but has
  **zero callers**, while its numbers are still reported as postprocess evidence
  (`GamePostProcess.ts:79-104`; consumers at `AuraClashArenaApp.ts:689, 2233, 3928`).

---

## 1. Aura Clash Arena (`apps/aura-clash-showcase`)

### 1.1 Route, boot and screenshot recipe

- Public route: `/showcase/aura-clash/playable/` (`src/routeLinks.ts:1`; `vercel.json` rewrites
  `/showcase/aura-clash/:path*` → `/apps/aura-clash-showcase/:path*`). Dev-relative: `/playable/`
  (Vite `base: "/"`).
- Entry: `src/main.ts` imports `showcaseProofBoot` and then dynamically imports
  `playable/AuraClashArenaApp` → `mountAuraClashArenaApp()`.
- There is no title or character-select screen in play. `ui/TitleScreen.ts`, `CharacterSelect.ts`,
  `ResultsPanel.ts`, `PauseMenu.ts` and `GameConfig.ts` have no importers (rg). The round starts
  immediately.
- Readiness: `window.__AURA_CLASH_ARENA_PROOF__.status === "running"` (harness
  `tests/helpers/auraClashArenaHarness.ts:212-215`). Also published: `window.__AURA3D_GAME_EVIDENCE__`
  (`AuraClashArenaApp.ts:3951`) and `window.__AURA_CLASH_VISUAL_REVIEW__`.
- Inputs: A/D move, W jump, S down, Space dash, Shift/Q block, J light, K heavy, L special, P pause,
  R reset (`:555-567`). Focus `.aca` first (`harness:211`).
- **Screenshot recipe for representative pixels:** load `/showcase/aura-clash/playable/` with **no**
  `auraTestDriver`, `capture`, or `debug` params. Wait for `status === "running"` plus about 2 s for
  shader warmup and the crowd. Focus `.aca`, hold D for 600 ms, then press J, K, J at 150 ms spacing
  and capture during the hit-stop (about 80 ms after the K connects). For a clean static frame,
  capture at about 1.5 s after running.
- **Do not** use `?auraTestDriver=1`. It sets `pixelRatio = min(1, 320/innerWidth)`, a 320 px
  backing store (`:1524-1529`), and enables training/evidence HUD mode (`clashFeel.ts:54-57`).
  `?capture=combat-impact` removes the crowd, the rendered stage furniture and the hanging signs
  (`:1375-1377`, `:1493`). `?spotlightProbe` drops the DPR and the crowd as well. Capture both modes
  only if you want to show the evidence gap.

### 1.2 Render architecture actually executed

1. `createAuraApp(canvas, { renderer: { mode: "production", qualityProfile: "production" },
   pixelRatio: min(DPR, 1.75), scene: createRootStageScene() })` (`:1516-1533`). The root scene holds
   4 `primitives.box` shadow-evidence props, 28 instanced crowd cards, and one `lights.spot`
   (`:1443-1501`). Background `#020406`.
2. All real content (arena GLB, fighters, VFX, stage furniture) comes through a **compatibility
   RenderSource** attached with `attachRootRenderSource` (`:1364-1423`, `:1502`). The root merges it
   in `createProductionRuntimeRendererInput` (`packages/engine/src/agent-api/index.ts:13853-14004`):
   - `postprocess`, `environmentLighting`, `environmentFog`, `cameraPolicy`, `collectedLights`: the
     source's values are used.
   - `shadow`: **the source value is discarded**. The `...(compatibility?.source)` spread is followed by
     `shadow: { ...createProductionRuntimeShadowOptions(...) }` (`index.ts:13991, 14002`), so the
     preset's `shadow.strength 0.38` becomes the root's 0.32 (`index.ts:12966-12968`).
3. The renderer preset is `createSideViewGameRenderPreset()`
   (`packages/engine/src/production-runtime/GameRenderPreset.ts:264-397`). The template
   `character-controller` uses it too (06 §3), so this is a shared engine default, not a game quirk.

### 1.3 Post / tone mapping / color pipeline (engine defect, P0)

Preset postprocess (`GameRenderPreset.ts:372-386`):

```ts
postprocess: {
  targetFormat: "rgba8",
  bloom: { threshold: 0.78, intensity: reducedMotion ? 0.18 : 0.32, radius: 2 },
  colorGrade: { contrast: 1.08, saturation: 1.04, vibrance: 0.12, vignette: 0.22, sharpening: 0.18 }
}
```

What the renderer does with it:

- `Renderer.ts:581-616` creates the forward color target in **`rgba8`** with 4× MSAA.
- With postprocess on, the forward pass writes **linear, un-tonemapped** color
  (`Renderer.ts:674` `outputColorSpace: postprocess ? "linear" : "srgb"`; the shader is
  `pbr-direct.frag.glsl:703-707`, `mix(color, srgb, step(0.5, u_outputColorSpace))`). Linear light
  therefore lands in an 8-bit UNORM target. Everything above 1.0 clips, and linear 0-0.05 (sRGB 0-0.25,
  the whole "neon night" shadow range) gets about 13 code values. The result is visible banding and
  posterized gradients in exactly the dark palette this game uses.
- `RendererPostprocessPlan.ts:183-184` pushes `tone-mapping` with `options = {}` because the preset
  has no `toneMapping` key. `WebGL2Device.ts:1906` then resolves
  `stringOption(toneOptions, "operator", "reinhard")`, and the only default injected is
  `{ outputColorSpace: "srgb" }` (`Renderer.ts:1093`). **The operator is Reinhard** (`x/(1+x)`), with
  white point 1 and exposure 1.
- Combined effect: the brightest possible scene pixel is linear 1.0 → Reinhard 0.5 → sRGB **0.735**.
  Contrast 1.08 lifts that to about 0.75, roughly 192/255. Neon signs, hit sparks and the 24-intensity
  stage spot all cap there. Mid-grey linear 0.18 maps to Reinhard 0.153 → sRGB 0.43, versus 0.50 for
  three's ACES at exposure 1 (computed with the repo's own ACES fit). The image is therefore darker,
  greyer and flatter than three's default ACES path, and has no specular "pop".
- three.js r185 equivalent: `WebGLRenderer` + `EffectComposer` uses a `HalfFloatType` render target by
  default, with `toneMapping = ACESFilmicToneMapping` (or AgX/Neutral) applied in `OutputPass` after
  bloom. HDR values up to about 10 survive into bloom and tone mapping.
- Dead alternative: `rendering/GamePostProcess.ts:79-104` `createAuraClashPostProcess()` (bloom 0.58,
  radius 0.42, `quality: "balanced"`, fog, colorGrade exposure 1.05, FXAA) has **no callers**. It is
  still the source of `createAuraClashPostProcessEvidence` (`:62-77`), which reports
  `bloomIntensity: 0.58` while the renderer runs 0.32. That is fake parity in the evidence.

Ladder, HDR/tonemap for this game: exists ✔ / works ✔ / public API ✔ (`toneMapping`, `targetFormat`)
/ used ✘ (the preset picks rgba8, and the operator is never set) / good default ✘ / composes ✘ /
modern ✘.

### 1.4 Lighting rig (exact)

Lights submitted per frame (`source.collectedLights`, `:1404`, plus the root spot):

| # | Light | Type | Color | Intensity | Range/angle | Shadow | Source |
|---|---|---|---|---|---|---|---|
| 1 | Overhead stage spot | spot | `#ffe0be` | **24** | angle 0.65, penumbra 0.4, distance 14, pos [-1.3,4.4,2.1] → [0,0.2,0] | yes | `:1496-1501` |
| 2 | `neon-key` (urban-neon ×1.24) | spot | [0.42,0.86,1] | 1.302 | π/5, range 10, pos [-3,4,2.5] | yes | `LightingRig.ts:272-277`, `:902` |
| 3 | `neon-magenta` | point | [1,0.2,0.66] | 0.93 | range 6 | no | same |
| 4 | `neon-rim` | directional | [0.64,0.72,1] | 0.496 | — | no | same |
| 5-6 | Per-fighter rim (player cyan / rival orange) | point | [0.18,0.92,1] / [1,0.34,0.08] | 2.05 / 1.95 | range 1.5 (0.82 × height), tracks fighter | no | `:920-930` |
| 7-8 | Per-fighter camera-side "key" | point | [0.78,0.96,1] / [1,0.84,0.66] | **4.7 / 4.45** | range 3.75 | no | `:942-952` |

Plus environment: procedural IBL `color [0.58,0.7,0.82]`, intensity 0.42, proceduralMap sky/horizon
teal, intensity 0.34, specular 0.92 (`GameRenderPreset.ts:290-302`). Per 06 §1 row 11, this is a
128×64 LDR gradient. No HDRI is used.

Fog: exp², color [0.015,0.035,0.04], density `0.008 + 0.58·0.026 = 0.023`, maxOpacity
`0.2 + 0.58·0.42 = 0.44` (`:1406-1414`).

Observations:

- Fighter readability depends on two point lights glued in front of each fighter. That is a classic
  "flashlight on the actor" fix, and it flattens form (a frontal key aligned with the camera axis). It
  was needed because the base rig is dim, IBL is weak, and the LDR+Reinhard pipeline throws away the
  top of the range.
- `GameLighting.ts:28-49` `auraClashLightingPreset` and `createAuraClashLightRig()` (`:181-198`) are
  dead. The file's own comment admits it.
- Shadows: strength **0.32** (root override), map size 1024 (root nodes radius about 6.6 →
  `index.ts:12960`), PCF 9 taps, radius 1.2. The single map is fit over all casters
  (`Renderer.ts:1399-1402`, `createRendererOwnedShadowMatrix(light, options.items, ...)`), and casters
  include the consolidated city block. Arena items never set `castShadow: false`
  (`AuraClashArenaApp.ts:878-888`). The scaled block is about 22 units tall, so fighter shadows get
  roughly 40 texels/m. This is a **PLAUSIBLE** blurry/blobby contact shadow (needs screenshot). In
  shadow, 68% of the key remains. three.js r185 `LightShadow.intensity = 1`.
- The four root "shadow evidence" boxes (receiver panel, pylon, truss, floor slab, `:1443-1483`)
  exist to prove the root spotlight casts shadows. They are untextured `material.pbr` slabs in the
  shipped frame.

### 1.5 Assets and materials

Parsed with `/tmp/glbstat.mjs` (header + JSON chunk):

| Asset | Size | Tris | Skin | Clips | Maps | Notes |
|---|---|---|---|---|---|---|
| `auraClashPlayerRig.3318d671.glb` | 7.6 MB | 35,508 | 65 joints | 12 (Idle_Loop, Punch_Jab, Punch_Cross, Sword_Attack, Hit_Chest/Head, Death01, Jump_Loop, Walk/Sprint, Crouch_Idle, Sword_Block) | 8 images; Ranger outfit BC+N+MR; Female body BC+N+MR; hair untextured | Quaternius Universal Base Character family |
| `auraClashRivalRig.c8d844dc.glb` | 4.6 MB | 26,982 | 65 joints | 10 (Melee_Hook, Sword_Regular_A/Combo, Shield_Dash_RM, Hit_Knockback, LayToIdle, Zombie_Walk_Fwd_Loop…) | 6 images | Same family; walk is `Zombie_Walk_Fwd_Loop` |
| `arenaNeonDowntownTextured.312f2320.glb` | 8.7 MB | 98,592 | — | — | 26 images, BC+N+MR+AO on asphalt/trim/walls; `KHR_materials_emissive_strength`, `KHR_lights_punctual` | Neon signs `Neon_*` are untextured, m0 r0.5 |
| `auraClashSpectatorCard.a5b562b8.glb` | 119 KB | **4** | — | — | 1 unlit alpha image | Material name `Blockfall Reactor Mechanic-unlit-alpha`, a billboard sprite reused from another game |
| `fighter{KadeEmber,MaraVolt,…}.glb` (6) | ~0.66 MB | 15.6k | **none** | 0 | 0 (flat factors) | Unreferenced by `src` (rg). Dead roster |

Material handling:

- `collectFighterFlashMaterials` (`:3371-3425`) overrides every fighter material. Outfit
  `u_baseColor` becomes a tint ([0.56,0.78,0.9] for the player, [0.86,0.46,0.25] for the rival),
  multiplying the albedo texture. Outfit metallic 0.08/0.12 and roughness 0.48/0.56 replace the MR
  map's intent (metallic factor 1). The outfit gets a flat emissive [0.04,0.34,0.5]×0.16 (player) /
  [0.5,0.12,0.025]×0.2 (rival). `u_environmentIntensity` 1.16 and a small clearcoat are added. This is
  defensible art direction, but the flat emissive raises the blacks of the costume and reads as
  "glow-in-the-dark plastic", especially under Reinhard.
- The arena is consolidated with `deduplicateIdenticalMaterials: true` + `consolidateStaticMeshes`
  (`:785-888`). PBR maps are preserved. Named nodes `AuraClash_Sign_NEON ROOFTOP`,
  `AuraClash_Sign_FIGHT READY`, `Prop_ACUnit_*` and `Prop_Bollard_*` are filtered out (`:872-877`), so
  the set loses its foreground props.
- Arena scale: `arenaScale = (5.7·1.34)/13 = 0.5876` (`:837-844`), while fighters are scaled 1.08
  (`stage.fighterScale`, `:273`). Fighters are about 1.98 m in a city at 59% scale, which makes them
  read as about 3.4 m giants in a toy diorama. That is a scale-cue error humans pick up immediately.
- Route-authored furniture (`RenderedArenaStage.ts`): a 5.8×1.16 floor box (PBR, `baseColor
  [0.018,0.045,0.052]`, metallic 0.26, roughness 0.24, emissive 0.14), a riser box, `UnlitMaterial`
  1-2 cm rim/lane strips, 4 cylinder "practical" posts with unlit glow spheres (14×10), a barrier made
  of cylinders, and 8 mote spheres. The "floor reflection" toggle (`:197-199`) is a flat unlit cube
  strip (`floor-sheen`), not a reflection. No SSR or planar reflection is used, even though
  `PlanarReflection.ts` / `ScreenSpaceReflectionPass.ts` exist in the renderer.

Primitive vs asset census (code): `primitives.*` 4 (root boxes) + 15 direct `Geometry.*`
constructions (cubes, cylinders, uv-spheres and capsules for stage, VFX, crowd fallback) vs 3 primary
GLB loads + 1 instanced card. By pixel area the GLBs dominate: the city block fills the background and
the fighters fill about 2/3 of the frame height. **This is the only game of the three where authored
assets own the frame.**

### 1.6 Camera

- `cameraPolicy: "auto-frame"`, `yawRadians 0`, `pitchRadians -0.06` (-3.4°), padding 0.1,
  farPadding 12 (`GameRenderPreset.ts:270-289`). There is no `fovYRadians`, so it falls back to
  **π/3 = 60°** (`AuraClashArenaApp.ts:1239, 1401`).
- Frame bounds come from fighter envelopes: base ±2.3 × [-0.08, 1.98], expanded for edges and jumps
  (`:1179-1207`).
- Juice: `camera.shake({decay 8, maxOffset 0.045, maxRoll 0})`, `camera.punchIn({fovKick 7°,
  distanceKick 0.09, duration 0.13 s})`, `followRig damping 14` (`:1171-1177`). KO widens by 6% and
  lifts 0.14 (`:1278-1285`).
- Assessment: the camera is functionally solid. Visually, it is a perfectly orthogonal 60° side view.
  Modern 2.5D fighters (SF6, Tekken 8, even three.js demos) use a 25-40° FOV, a slight down-tilt of
  about 5-8°, and a dolly that keeps the background parallax-rich. At 60° and orthogonal, the city
  block reads like a flat theatre flat, and the dramatic distance compression a telephoto gives is lost.

### 1.7 VFX and juice

- Hit sparks (`createSparkItems`, `:3570-3640`): one `uvSphere(0.5,18,10)` core plus 6-10
  `capsule(0.12,1)` shards, all `UnlitMaterial` with **flat** colors (`[1,0.86,0.3,0.92]` etc.), life
  **0.18 s** (`:1071`), scale ≤0.54. These are opaque geometric meshes, not additive sprites, and
  have no texture, soft particles, flipbook, distortion or light emission. Under the LDR/Reinhard cap
  they top out at about 75% brightness.
- Ground "aura": a flattened unlit sphere disc at alpha 0.26 under each fighter (`:3551-3568`). The
  special move adds a swelling halo plus crescent capsules (`:3500-3549`).
- Victim flash: base color and emissive driven toward orange on hit (`:3430-3475`). This is good, and
  real material juice.
- Hit-stop (`clashHitStopSeconds`), shake, punch-in, crowd cheer bounce, spring-joint hanging signs
  (`SpringJointSigns.ts`, unlit), and a text3D round/KO ceremony (`RoundCeremony.ts`).
- Ambient particles: the preset declares 128 ambient particles (`GameRenderPreset.ts:331-338`), and
  `"ambient-particles"` is listed in the measured `enabledFeatures` (`:358-367`).
  **`renderPreset.particles` is never read** (rg). The only "particles" are 8 mote spheres
  (`RenderedArenaStage.ts:169-175`). This is fake parity in the performance-budget contract.
- `rendering/HitSparkVfx.ts` (px-radius sparks, label colors) is only consumed by
  `fighters/AuraBurstDirector.ts`, which has no importer. Dead.
- Missing versus a modern three.js fighter: additive billboard and flipbook sparks
  (`SpriteFlipbook.ts` exists in the renderer, but this game does not use it), screen-space
  distortion/shock rings, chromatic punch, motion trails, dust on landing, light flashes (a transient
  point light at impact), and HDR bloom on impacts.

### 1.8 Animation

- Real skinned GLB clips played every frame, with inertialized move transitions (`:367-382`,
  `fighterInertializedWeights`), foot-lock, spring body sway (`fighterSecondaryMotion.ts`), and
  clip-event bridges for sfx/vfx/camera impulses (`:1046-1106`).
- Clip vocabulary is generic Quaternius locomotion and melee (`Punch_Jab`, `Sword_Attack`,
  `Melee_Hook`). The rival walks with `Zombie_Walk_Fwd_Loop`. There are no fighting-game anticipation
  or follow-through poses, no hit-reaction variety beyond 2-3 clips, and no faces or visemes.
- This is the strongest subsystem of the three games. It is limited by the source clip library, not
  the engine.

### 1.9 HUD / CSS

- The DOM page shell (`AuraClashArenaApp.ts:499-620`, `playable.css` 1,101 lines, `styles.css` 1,310
  lines) has a nav bar (Playable / Evidence / Deploy check / GitHub / npm / Tweaks), two "cards" with
  **explanatory prose** ("Skinned GLB fighter driven by Aura3D production animation runtime.",
  "Independent second GLB instance with its own clips, spacing, and hit windows."), a 96 px clock
  column, an 11-button control strip, a status topline ("Loading skinned GLB animation runtime /
  clips pending"), toast text, and a collapsible evidence `<details>`.
- The stage is a section inside a page, not a full-bleed game view. The comment at `:569-575` measures
  the arena at **53.1%** of the frame.
- Fonts: `"Saira"` / `"Saira Condensed"` are named (`playable.css:15, 191, 294, 413`), but no
  `@font-face` or Google Fonts link exists in the app (rg). Text falls back to Impact/Inter/system.
  Monospace is used for numbers.
- Assessment: it reads as a dev-tools dashboard wrapped around a game. A modern fighting HUD is a
  full-bleed canvas with slanted health bars, a portrait, a timer medallion and minimal text.

### 1.10 Audio

- 11 real samples (Kenney CC0 impact/interface/sci-fi packs, `.ogg`, 4.8-25 KB, plus one 201 KB jump)
  through `createGameAudio` with 4 buses (music/sfx/voice/ui) and KO ducking
  (`auraClashAudioManifest.ts:1-60`; `AuraClashArenaApp.ts:3687-3701`).
- There is no music bed, no announcer voice (despite a `voice` bus), no crowd ambience, and no
  per-move whooshes. Hits are generic Kenney impacts.

### 1.11 Root causes (Aura Clash)

| Bucket | Cause | Evidence |
|---|---|---|
| A renderer | No HDR/tone-mapping path is chosen for game presets. The forward pass stores linear light in 8 bits | `Renderer.ts:581-616, 674`; `pbr-direct.frag.glsl:703-707` |
| B defaults | Default tone operator = Reinhard whenever `toneMapping` is `{}` | `WebGL2Device.ts:1906`; `RendererPostprocessPlan.ts:183-184` |
| B defaults | Side-view preset: `targetFormat "rgba8"`, shadow 0.38 (then overridden to 0.32), bloom 0.32 @ threshold 0.78, IBL 0.34 LDR | `GameRenderPreset.ts:290-386` |
| B/F | Root silently replaces the compatibility source's `shadow` | `index.ts:13991-14002` |
| A | Single shadow map fit to all casters, no CSM reachable from root | `Renderer.ts:1387-1402`; 06 row 24 |
| A/F | No sprite/additive particle path used by the game. The renderer has `SpriteFlipbook.ts`, but there is no game-kit VFX API that produces it | §1.7 |
| C | Crowd = 4-tri unlit card from another game. Roster GLBs are unskinned and untextured | GLB parse |
| D | 60° FOV orthogonal camera; 59%-scale city vs 108% fighters; foreground props filtered out; per-fighter flashlight keys | `:837-844, 872-877, 942-952` |
| D | Flat emissive on costumes and flat-color geometric VFX | `:3403-3413, 3485-3493` |
| E/G | Evidence captured at 320 px with set dressing removed; dead post preset reported as evidence; 128-particle claim unconsumed | `:1524-1529, 1375-1377`; `GamePostProcess.ts:62-77` |

### 1.12 Highest-leverage changes (ordered by pixels/hour)

1. **Engine:** change `GameRenderPreset` (side-view and top-down, `:373`, `:450`) to
   `targetFormat: "rgba16f"` and `toneMapping: { operator: "aces", exposure: 1 }`, or better, make the
   Renderer default operator `"aces"` whenever an HDR target is used. Expected result: correct
   highlights, no dark banding, bloom that catches emissive signs at >1.0. Then raise the sign/spark
   emissive strengths to 3-8.
2. **Engine:** stop root from overriding `compatibility.source.shadow`. Raise the default shadow
   strength to 0.85-1.0 for games. Fit the shadow frustum to the camera-frame bounds or the fighters
   (`cameraFrameBounds` is known), not all casters. Exclude the backdrop from casters.
3. **Game:** delete the per-fighter 4.7 point keys once (1) and (2) land. Use a real 3-point rig
   (warm overhead key spot with shadows, cool back rims) plus an HDRI (`environments.hdri` with a
   night-city HDR) for IBL. Set `fovYRadians` to about 0.55 rad (32°) and pitch to -0.10.
4. **Game/asset:** fix the arena-to-fighter scale (target about 1:1 metres). Restore foreground props
   for depth. Add planar/SSR floor reflections, or at least a reflection probe, for the wet-neon look.
5. **VFX:** replace sphere and capsule sparks with additive flipbook sprites, a short-lived impact
   point light, and an HDR emissive core so bloom fires. Add a shock ring and landing dust.
6. **HUD:** make the canvas full-bleed. Remove prose cards, the nav and the control strip from play.
   Load the named fonts.
7. **Asset:** replace the crowd card with instanced low-poly skinned or vertex-animated spectators
   (or remove it). Add a music bed and an announcer.
8. **Process:** capture visual evidence at native DPR with the shipped content (no `auraTestDriver`).
   Delete dead `GameLighting`/`GamePostProcess`/`HitSparkVfx`/UI modules, or wire them up.

### 1.13 Preliminary scores (0-10, code-inferred)

| Environment | Assets | Materials | Lighting | Shadows | IBL | Post | VFX | Animation | Camera | HUD | Audio | Juice |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 5 | 6 | 4 | 3 | 3 | 2 | 1 | 2 | 6 | 5 | 3 | 4 | 6 |

Verdict: **save through polish**. The assets, animation and combat feel are a viable base. Most of
the "Atari" gap is engine pipeline (LDR + Reinhard + weak shadows + LDR IBL) plus art direction
(camera, scale, VFX). Expect a large visible jump from items 1-3 alone.

---

## 2. Mech Hangar (`apps/showcase-mech-hangar`)

### 2.1 Route, boot and screenshot recipe

- Route: `/apps/showcase-mech-hangar/` (README, `showcase-index/index.html:124`). Root `public/` is
  the `publicDir` (`vite.config.ts`). `route-health.json`: classification `prototype-blocked`,
  `publicShowcase: false`, "hold until independent human visual review".
- Readiness: `window.__MECH_HANGAR_EVIDENCE__.status` is `"ready"` in the hangar (when
  `catalogReady`) and `"playing"` in the arena (`main.ts:1377, 1422`). Test hooks:
  `__MECH_HANGAR_SIM_TICK__`, `__MECH_HANGAR_SET_TIME_WARP__`, `__MECH_HANGAR_VALIDATION_PROBE__`.
- Query param: `?capture=review` (`main.ts:61-63`) switches the camera to distance 5.55, offset
  [0,1.82,4.62], FOV 52, smoothing 0.
- Inputs: Hangar uses 1-4 for slot, ←/→ to cycle, Enter to lock in (validates, then
  `enterArena()`, `main.ts:1081-1098`), and mouse drag to orbit. Arena uses A/D, Space jump-thrust,
  J/K/L, Shift guard, P, R rematch, Backspace back.
- **Screenshot recipe:** (a) the hangar frame after `status === "ready"` plus 1.5 s. (b) Press Enter,
  wait 2 s, hold D for 800 ms, press J then K, and capture about 100 ms after the K connect. Also
  capture the hangar with `?capture=review` for parity with stored evidence
  (`tests/reports/mech-hangar/*.png`).

### 2.2 Render setup (exact)

`createAuraApp("#app", …)` (`main.ts:703-788`):

- `renderer: { mode: "production", qualityProfile: "production", fallback: "safe-basic" }` → DPR 1.5
  (06 row 1). No explicit `pixelRatio`.
- Background `#081522`. No `environments.*` node.
- Effects: `bloom { intensity 0.2, threshold 0.72, maxIntensity 0.6, quality "balanced", radius 0.38 }`;
  `colorGrade { exposure 1.04 (ignored by root, 06 row 7), contrast 1.06, saturation 1.08 }`;
  `antiAlias fxaa` (on top of MSAA); `contactOcclusion { intensity 0.4, radius 0.6 }` (maps to SSAO
  with a ~3 px kernel, 06 row 43).
- Root pipeline: rgba16f, **ACES**, exposure fixed at 1 (06 rows 6-8). Unlike Aura Clash, this game
  gets the correct HDR path, because it does not use the side-view preset.
- **`lights.ambient({ intensity 0.72, color "#89a9c4" })` (`:722`) → IBL is switched off**
  (`index.ts:12693-12707`: `environmentMapIntensity: 0, environmentMapSpecularIntensity: 0`). Every
  `metallic 0.5-0.7` steel surface in the scene (parts, pillars, truss, turntable `metallic 0.58`) has
  no environment reflection. It renders as flat grey-blue plus point-light hot spots.

### 2.3 Lighting rig (all 12 lights shared by both sets)

| Light | Type | Pos | Intensity | Color |
|---|---|---|---|---|
| workshop cool key | directional | [4.2,5.4,3.2] | 1.55 | `#d7ebff` |
| warm practical L | point (range 10 fixed) | [-2.6,2.3,1.9] | 3.65 | `#ffb454` |
| warm practical R | point | [2.7,2.1,-1.4] | 3.05 | `#ff9a3d` |
| workshop frontal fill | point | [-2.9,3.2,3.4] | 3.75 | `#a9e1ff` |
| global fill | **ambient** | — | 0.72 | `#89a9c4` |
| floodlight north | directional | [0,7.4,-37.4] | 1.1 | `#eaf4ff` |
| floodlight south | directional | [2.4,6.4,-30.4] | 0.8 | `#cfe2ff` |
| arena front key | point | [0,4.2,-27.5] | 2.1 | `#d8ecff` |
| arena blue rim | point | [-4.8,2.5,-37.8] | 2.4 | `#47cfff` |
| arena warm rim | point | [4.8,2.2,-35.8] | 2.0 | `#ff7a5c` |

(`main.ts:718-732`; 10 listed, plus root-added caster logic.)

- Directionals are infinite, so the hangar's key and the arena's floodlights light **both** sets.
  That means 4 directional lights plus 0.72 ambient on every surface. That is a flat, multi-shadowless
  wash. The comment at `:723-727` records the pit floor "blowing out past pure white" and the
  intensities being reduced, which is the symptom.
- Shadows: no light has `shadow` set, so root picks the highest-priority directional. Strength 0.32
  (06 row 23). Map size: scene radius is measured from node positions, and parked parts sit at y=-60
  and sparks at y=-70 (`main.ts:200, 228, 247`), so radius > 30 → **4096**, fit over all casters.
  The casters span the hangar (z≈0) and the pit (z≈-34), roughly 40+ units, so mech shadows get very
  low texel density (PLAUSIBLE). The game paints a fake **contact-shadow disc** (`main.ts:366-380`,
  `contactShadowMaterial = material.emissive(...)`, a flattened cylinder scaled [1.6,0.012,1.6]) as a
  substitute.

### 2.4 Assets (exact)

| Asset | Size | Tris | Textures | Skin/anim | Notes |
|---|---|---|---|---|---|
| `mechChassisA..D.glb` | 23 KB | **400** each | none | none | 4 materials: armor m0.52 r0.42, frame, joints, "identity energy" |
| `mechArmsA..D.glb` | 32 KB | **608** | none | none | |
| `mechLegsA..D.glb` | 31 KB | **576** | none | none | |
| `mechWeaponA..D.glb` | 10 KB | **144** | none | none | |
| `mechHeroDecimated.0e52ceb3.glb` (root `public/aura-assets`) | **27.3 MB** | 99,999 | 3 images (BC+N+MR) | **none** | Meshy output, single mesh, `quality: "candidate"` (`main.ts:1281`) |

- The 16 "release" parts are generated by JS (`scripts/build-models.mjs`): hand-placed quads and
  triangles with one face normal per quad (flat shading, `:63-80`), `SEGMENTS = 4` joints "to stay
  below the 40 KB per-part release budget" (`:22-27`), and flat colors (`COLORS.armor [0.18,0.31,0.43]`
  etc., `:35-46`). A whole mech is about **1,728 triangles with no textures and no UVs**, which is
  PS1-era density. Variants A and D have identical triangle counts (400/400), so they are parameter
  tweaks, not different designs.
- The hero mech is a static, unrigged 100k-tri statue placed 0.32 m in front of the procedural family
  so the two "connect" (`main.ts:209-232`, `HERO_FORWARD 0.32`). The README calls the procedural
  parts the visible silhouette, and the code comment says the hero is "the dominant silhouette". The
  result is a kitbash of a scanned-looking Meshy body and box armor.
- Mounting: all 16 parts × 2 sides + 2 heroes = **34 model nodes** are always in the scene. Inactive
  ones are hidden with `setVisible(false)`, and all are initially parked at y=-60 (`:200`).
- Fit: parts are normalized with `scaleMode: "fit"` to slot heights (`:176-185`).
- Primitive census (`main.ts`): 28 `primitives.box` + 5 `cylinder` + 3 `sphere` + 9 `torus` call
  sites, expanded through `Array.from`/`flatMap` to about **190 primitive nodes** (12 sparks, 10 dust,
  8 impact rings, 20 deck plates/seams, 24 center plates/seams, 14 back-wall panels/lights, 10 bay
  pillars/strips, 6 pit pillars, 6 suspended rails, 6 warning stripes, 5 lane marks, rims, rings,
  team markers, weapon accents, hardpoint collars, foot seals, contact discs, and so on) plus text3D
  signs. Set dressing is 100% untextured primitives. `material.pbr` uses only color, roughness,
  metallic and clearcoat. ~30 `material.emissive` strips and panels at intensities 0.42-2.35 carry the
  look ("neon blockout").
- Primitive vs asset ratio: 45 primitive call sites (~190 nodes) vs 2 `model(` call sites (34 nodes).
  By pixel area, primitives own most of the frame: floor, walls, pit, truss.

### 2.5 Camera

`camera.follow({ targetNode: "mech-cam-anchor", distance 6.55, offsetMode "target-yaw",
offset [0,1.66,5.28], fov 54 (53 reduced motion), smoothing 0.16 })` (`:772-787`). The anchor is
moved for punch, KO push-in and turntable orbit (`arena/feel.ts`, `:1498`). It is reasonable and
generic. A 54° FOV at 6.5 m frames a 4.2 m pit with two 1.9 m mechs at roughly 1/3 frame height.

### 2.6 VFX and juice

- 12 spark spheres (`material.emissive` `#ffb454` ×2.2), 10 dust spheres (`material.pbr` grey,
  roughness 1, i.e. opaque grey balls), and 8 emissive torus "impact rings", driven per frame by
  runtime handles with gravity (`arena/feel.ts:1-60`, `main.ts:240-265`). Hidden by scale 0.0001.
  Spheres are 12×16 (06 row 33).
- Camera punch, KO push-in, hit-stop frames (light 4, heavy 7, special 9, `arena/mech-fight.ts:36-38`).
- No muzzle flash, beam, projectile trail, smoke, sprite flipbook, or impact light.

### 2.7 Animation

- **None.** Mechs are rigid. `handle.setRotation(0, t.yaw, 0)` (`main.ts:892, 938`) applies yaw only.
  Strikes are bout-state windows. The visual is translation by knockback
  (`mech-fight.ts:205-206`, `victim.x -= facing·knockback·0.22`, `vy += 0.35·knockback`). There are no
  limb poses, no walk cycle, no recoil and no secondary motion. `characterAssembly` builds a socket
  plan, but nothing animates the sockets. A mech fighter with no limb motion is the single strongest
  "early console" cue in this game.

### 2.8 HUD

DOM chrome (`hud.ts` 319 lines, `styles.css` 390 lines): monospace `"SF Mono"…` everywhere
(`styles.css:20`), blur-backdrop panels, gradient bars, a stat "hologram" panel and an asset passport
panel. In the hangar, the side-column layout limits the canvas to about 3/4 width (`main.ts:1090-1094`
comment). It reads as a developer inspector, not a game.

### 2.9 Audio

10 WAV cues **synthesized from oscillators and xorshift noise** in `scripts/build-sfx.mjs`
(`:1-50`, "every cue is synthesized from oscillators / noise", 16-bit mono 44.1 kHz). Sizes are
15-88 KB, plus a 278 KB ambient loop. Played through `createGameAudio` on 4 buses (`hangar-audio.ts`).
This is literally the chiptune-era technique. There is no music.

### 2.10 Root causes (Mech Hangar)

| Bucket | Cause |
|---|---|
| C asset | Procedurally scripted, flat-shaded, untextured, 144-608-tri parts labeled `release`. The hero is unrigged and a candidate. The 40 KB budget enforces low poly |
| D game | No animation at all; ~190 primitive nodes of blockout set dressing; two sets in one scene sharing 4 directionals |
| B defaults | `lights.ambient` kills IBL; shadow strength 0.32; colorGrade exposure ignored; FXAA on MSAA; 12×16 spheres for particles |
| A renderer | Single shadow map over a ~70-unit caster span (parked nodes included in the radius); no sprite/additive particle path used |
| E authoring | The agent satisfied the "typed asset" gate by *generating* GLBs in JS rather than sourcing or commissioning art. The gates (`check-modular-family.mjs`) certify socket metrics, not visual quality |
| D audio | Oscillator SFX |

### 2.11 Highest-leverage changes

1. Replace the MH-2M family with real modular mech kits: textured, about 5-20k tris per part, rigged
   at the sockets. Or drop modularity and use 2-4 rigged, animated mechs (Meshy rig + animate, or
   Quaternius/Kenney mech packs). Animate walk, strike, recoil and hit reactions.
2. Remove `lights.ambient`. Add `environments.hdri` (industrial hangar HDR) and keep 1 key directional
   with shadows plus 2-3 practicals per set. Put hangar and arena in separate scenes (`setScene`), or
   restrict lights with `layerMask`.
3. Replace primitive set dressing with a hangar GLB kit (catwalks, gantries, crates, cables, decals),
   textured with tiling trims.
4. VFX: additive spark sprites, muzzle flash, smoke flipbooks, and impact lights. Real metal-hit and
   servo samples plus music.
5. HUD: a full-bleed canvas with a game-styled overlay, and the passport moved behind a toggle.

### 2.12 Preliminary scores

| Environment | Assets | Materials | Lighting | Shadows | IBL | Post | VFX | Animation | Camera | HUD | Audio | Juice |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2 | 2 | 2 | 3 | 2 | 0 | 4 | 2 | 0 | 4 | 3 | 2 | 4 |

Verdict: **substantial rebuild** of art, animation, lighting and audio. Keep the bout sim
(`arena/mech-fight.ts`), `createCombatAi` wiring, assembly validation and input map.

---

## 3. Orbital Defense (`apps/showcase-orbital-defense`)

### 3.1 Route, boot, screenshot recipe

- Route: `/apps/showcase-orbital-defense/` (served by the root Vite multi-page config; the app has no
  `package.json` or `vite.config.ts`). `route-health.json`: `classification "blocked"`,
  `publicShowcase false`, `primaryAssets []`, desktop/mobile screenshot `null`. Not deployed or listed.
- Readiness: `window.__AURA3D_SHOWCASE_ORBITAL_DEFENSE__.status` is `"ready"` at boot and
  `"running"` after the first update, plus `document.body.dataset.aura3dShowcaseReady = "true"`
  (`main.ts:379-396`).
- Inputs: A/← and D/→ rotate, Space fire, Q shield, R reset, P pause. `interactions.orbit()` is also
  mounted, so a mouse drag moves the camera.
- **Screenshot recipe:** load, wait 3 s (5 drones spawn immediately and more every 1.8 s), hold D for
  1 s while pressing Space 4× at 200 ms, then capture.

### 3.2 Everything in the scene (`main.ts:82-131`)

| Element | Primitive | Material | Scale |
|---|---|---|---|
| Planet core | sphere (12×16) | `material.pbr #1a4862 r0.62 m0.04` | 1.03 |
| Atmosphere | sphere | `material.emissive #0b2230 / #2dd4bf` (opaque, scale 1.13, so it **completely hides the planet**) | 1.13 |
| Inner/outer orbital rings | torus | emissive `#38bdf8` / `#a78bfa` | [2.05,2.05,0.03], [3.1,3.1,0.025] |
| 2 defense stations | box | pbr metallic 0.55/0.46 | 0.28×0.14 |
| Player interceptor + aim bead | sphere | emissive | 0.18×0.18×0.28 |
| 10 drones | sphere | emissive `#fb7185` | 0.16 |
| 14 bolts | sphere | emissive `#67e8f9` | 0.055 |
| 5 shield segments | torus | emissive | 0.35 |

- Lights: `ambient 0.18` (→ **IBL off**), point `#75f2cf` 2.7 @ [-2.8,3.2,3.4], point `#facc15` 1.6,
  directional 1.1 (no shadow flag; root may pick it as caster).
- Effects: `bloom { intensity 0.32, color "#75f2cf" }` (color is dropped, quality defaults to
  `performance` = 1 mip, 06 row 41); `fog { density 0.024 }` (capped at ~52% opacity).
- Camera: `camera.perspective({ position [0,0.42,6.6], target 0, fov 42 })` + `interactions.orbit()`.
- Renderer: default profile `safe-basic` → **DPR 1** (06 row 1). No `renderer` option at all.
- Background `#05080f`. No skybox, starfield, planet texture, or nebula.

Primitive vs asset: 11 primitive call sites → **33 nodes; 0 GLB, 0 textures**. Even the "planet" is
a 12×16 sphere hidden inside an opaque emissive shell.

### 3.3 VFX / animation / audio / HUD

- VFX: **none**. Enemies vanish when killed (`enemy.radius = 8`, `:300-303`). Nothing explodes, and
  there is no muzzle flash or trail. The `systems` array claims "particle-heavy impact presentation"
  (`:74`). This is a false claim in route evidence.
- Animation: positional only. Drones translate along polar paths and nothing rotates visibly (spheres).
- Audio: **none** (no `createGameAudio`, no assets).
- HUD: `renderHud()` rebuilds `hud.innerHTML` **every frame** (`:313, 341-377`) and re-binds the
  click listeners every frame. That causes layout thrash, and the Reset/Pause buttons are effectively
  unclickable because the element is replaced under the cursor. The HUD prints a "Checksum" and a
  "Systems" list to the player. Styling is generic panels (`styles.css` 181 lines).
- Game feel: no screen shake, hit-stop, score popups, or planet-damage feedback.

### 3.4 Root causes and verdict

All 5 buckets: no assets (C), a primitive-only design (D), every bad root default (B: ambient kills
IBL, DPR 1, 1-mip bloom, color dropped, 12×16 spheres), no VFX API (A/F), and agent authoring that
produced a "sketch" and documented its blocked status rather than sourcing assets (E). Scores:

| Environment | Assets | Materials | Lighting | Shadows | IBL | Post | VFX | Animation | Camera | HUD | Audio | Juice |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | 0 | 1 | 2 | 0 | 0 | 2 | 0 | 1 | 3 | 1 | 0 | 0 |

Verdict: **full rebuild or delete.** About 430 lines of deterministic wave logic are reusable. A
modern version needs: an HDRI or space skybox with a starfield; a textured planet (albedo/normal/night
lights plus a Fresnel atmosphere shader, transparent and additive); GLB stations, interceptor and
drones; additive particle explosions plus bloom at HDR intensities; and audio.

---

## 4. Capability ladder across the three games

Ladder columns: exists / works / public API / used by these games / good default / composes /
modern / agents know / examples demonstrate.

| Capability | ex | works | API | used (AC/MH/OD) | good default | composes | modern | agents know | examples |
|---|---|---|---|---|---|---|---|---|---|
| HDR forward target (rgba16f) | ✔ | ✔ | `targetFormat` | ✘/✔(root)/✔(root) | ✘ in game preset | ✘ (preset overrides root) | ✔ when used | ✘ | ✘ |
| Tone-map operator ACES | ✔ | ✔ | `toneMapping.operator` | ✘ (Reinhard)/✔/✔ | ✘ (renderer default "reinhard") | partial | ✔ | ✘ | ✘ |
| Exposure | ✔ | ✔ (renderer) | ignored in root | ✘/✘ (1.04 dropped)/— | ✘ | ✘ | ✘ | ✘ | ✘ |
| IBL (procedural LDR) | ✔ | ✔ | implicit | ✔ weak/✘ (ambient)/✘ (ambient) | ✘ | ✘ | ✘ | ✘ | ✘ |
| IBL (HDRI) | ✔ | ✔ | `environments.hdri` | ✘/✘/✘ | — | partial | likely | skill mentions | ✘ |
| Shadows | ✔ | ✔ | `shadow` | ✔ 0.32 / ✔ 0.32 / implicit | ✘ | ✘ (override) | ✘ | ✘ | ✘ |
| CSM | ✔ | ✔ (needs PerspectiveCamera) | not via root | ✘/✘/✘ | — | ✘ | — | ✘ | ✘ |
| Bloom pyramid | ✔ | ✔ | `quality` | AC 0.32 (no quality key) / MH balanced 0.2 / OD performance | ✘ | partial | ✘ at these intensities | partial | partial |
| Additive/flipbook VFX | ✔ (`SpriteFlipbook.ts`) | ? | `effects.flipbook` (skill) | ✘/✘/✘ | — | — | — | skill exists, unused | ✘ |
| Planar/SSR reflections | ✔ | ? | renderer-level | ✘ (fake strip)/✘/✘ | — | — | — | ✘ | ✘ |
| Skinned GLB animation | ✔ | ✔ | `createTypedGLBActor` / `model` | ✔/✘/✘ | ✔ | ✔ | ✔ (clip-limited) | ✔ | ✔ AC |
| Camera juice (shake/punch) | ✔ | ✔ | `camera.shake/punchIn` | ✔/✔ (anchor)/✘ | ✔ | ✔ | ✔ | ✔ | ✔ |
| Real audio samples | ✔ | ✔ | `createGameAudio` | ✔ Kenney / ✘ synth / ✘ none | — | ✔ | partial | partial | partial |

---

## 5. Fake parity and dead code found

1. `createAuraClashPostProcess()` (`GamePostProcess.ts:79-104`) is never called. Its 0.58 bloom, fog
   and preset are reported as `postProcess` evidence (`AuraClashArenaApp.ts:689, 2233, 3928`), while
   the renderer runs `renderPreset.postprocess` (bloom 0.32, rgba8, Reinhard).
2. `auraClashLightingPreset` / `createAuraClashLightRig` (`GameLighting.ts`) is a dead rig, acknowledged
   in its own comment.
3. `SideViewGameRenderPreset.particles` (128 ambient particles) and `enabledFeatures:
   "ambient-particles"` are never consumed by the only consumer route.
4. `SideViewGameRenderPreset.shadow` (0.38) is overwritten by root (0.32). The preset's documented
   value is never rendered.
5. The Aura Clash "Floor reflections" toggle is a flat unlit cube strip (`RenderedArenaStage.ts:197-199`).
6. Aura Clash: 6 roster fighter GLBs (unskinned, untextured) plus `TitleScreen`, `CharacterSelect`,
   `ResultsPanel`, `PauseMenu`, `GameConfig`, `HitSparkVfx` and `AuraBurstDirector` are unreferenced
   by the shipped route.
7. Mech Hangar `effects.colorGrade({ exposure: 1.04 })` is a root no-op. The 16 MH-2M parts are
   labeled `quality: "release"` in `route-health.json` at 144-608 tris and untextured. The "contact
   shadow" is an emissive disc.
8. Orbital Defense evidence claims "particle-heavy impact presentation" and there are zero particles.
   `effects.bloom({ color })` is dropped.
9. Process: Aura Clash visual-regression and flagship screenshots use `?auraTestDriver=1` (320 px
   backing width) and `capture=combat-impact` (crowd, stage and signs removed). The evidence never
   represents shipped pixels.

---

## 6. Cross-game root-cause split

| Bucket | Share of visual gap (judgment) | Key items |
|---|---|---|
| A renderer / B defaults | ~40% for Aura Clash; ~25% for MH/OD | LDR+Reinhard game preset; ambient-kills-IBL; shadow 0.32 + root override + all-caster fit; 1-mip bloom; DPR 1 default; 12×16 spheres |
| C assets | ~10% AC; ~45% MH; ~50% OD | JS-generated parts; unrigged hero; 4-tri crowd card; zero assets in OD |
| D game implementation | ~30% | 60° orthogonal camera, scale mismatch, flashlight keys, geometric VFX, primitive blockout dressing, dashboard HUD, no mech animation |
| E/G authoring and evidence | ~20% (multiplier) | Gates certify metrics and structure, not pixels. Evidence captured at 320 px with content stripped. Effort spent on 239 evidence references in one file instead of art. Agents generate geometry in JS to satisfy "typed asset" gates |

---

## 7. Preserve

- Aura Clash combat sim, input buffering, deterministic replay, inertialized clip blending, foot-lock,
  secondary motion, clip-event bridge, camera shake/punch/follow rig, hit-stop and the victim-flash
  material pulse.
- Aura Clash asset choice: the Quaternius UBC rigs and the textured city block are a sound base.
- `consolidateStaticMeshes` + material dedup for static arenas (draw budget 91).
- Mech Hangar `arena/mech-fight.ts` bout rules, `createCombatAi` aggression presets, and
  `characterAssembly` validation.
- Orbital Defense wave/projectile logic (small and reusable).
- Engine pieces these games prove work: `createTypedGLBActor`, `createGameAudio` buses, root
  compatibility source bridge (after fixing the shadow override).

## 8. Delete or replace

- Replace `GameRenderPreset` postprocess `targetFormat: "rgba8"` (`:373`, `:450`) with rgba16f +
  explicit ACES. Change the renderer's default tone operator from `"reinhard"` to `"aces"`
  (`WebGL2Device.ts:1906`, and the LeanWebGL2Device equivalent at `:1860`).
- Fix the root override `shadow: {...}` at `index.ts:14002`, so a compatibility source's shadow
  options are respected.
- Delete or replace the Mech Hangar MH-2M generated parts and the synthesized SFX.
- Delete `showcase-orbital-defense` or rebuild it from scratch.
- Delete dead Aura Clash modules (§5.6) and the fake evidence sources (§5.1-5.3).
- Replace the Aura Clash crowd card with real crowd assets, or remove it.
- Stop using `auraTestDriver` and `capture=combat-impact` for any visual-quality evidence.
