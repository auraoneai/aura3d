# 17 — Games group 3: Siege Golf, Rooftop Buckets, Bank Shot, Vault Breakers (code-level forensic audit)

Branch `aura3d-quality-rebuild/audit`. Method: I read every `src/*.ts` scene/HUD/audio file for the four games, their
`README.md`, `route-health.json`, `scripts/build-*.{mjs,py}`, and the relevant engine bridge code in
`packages/engine/src/agent-api/index.ts`. I parsed every GLB's JSON chunk with a small node script to get meshes,
triangle counts, UVs, textures, skins and clips. Nothing was run in a browser. All scores are code-inferred and still
need screenshot correction. Engine facts already established by sibling reports (04 lighting, 05 post, 06 defaults,
11 assets) are cited and were spot-verified where they decide a game verdict (lines quoted below).

---

## 0. Executive summary

All four games are well-engineered physics toys: Rapier, deterministic hashes, reset proofs, pose sync. Their visual
layer, though, is built almost entirely from engine primitives with flat `material.pbr({color})` values. The few real
textured assets are either overridden to flat color, hidden, or only mounted in debug/review lanes. Each game then
lands in one of the engine's worst default traps:

| Trap (engine) | Siege Golf | Rooftop Buckets | Bank Shot | Vault Breakers |
|---|---|---|---|---|
| `lights.ambient` with no `environments.*` kills IBL (`index.ts:12693-12707`) | no (has `environments.studio`) | **yes** (amb 1.32) | **yes** (amb 0.24) | **yes** (amb 0.82) |
| Root shadow strength 0.32 (`index.ts:12966-12968`) | yes | yes | yes | yes |
| Default `safe-basic` profile → pixelRatio 1 (`index.ts:4256`) | **yes** (no `renderer` opt) | no (explicit `min(DPR,1.75)`) but **review = 640px backbuffer** | **yes** | no (`production` → 1.5) |
| `colorGrade.exposure` silently dropped | yes (1.02) | yes (1.04) | yes (1.05) | yes (1.05) |
| FXAA (cross-blur) on top of MSAA | yes | yes | yes | yes |
| `neonBloom softKnee 0.5` (mid-tone bloom, milky) | 0.055 (negligible) | 0.34 | 0.2 | 0.45, thr 0.62 |
| `model(asset,{material})` / `setMaterial` deletes GLB textures (`index.ts:13567-13580`) | crate (3 PBR maps) + planks → flat coral | ball, rim, backboard → flat every frame | — | ball → flat chrome every frame |
| Primitive sphere 12x16, capsule = sphere (`index.ts:17361`, `17477`) | hills, trees, mounds, dust | crowd heads (Blender), beacons | bulbs | — |

Rough breakdown of the root cause of "Atari / early-Nintendo" for this group:

- **D-game / E-authoring (~45%)**: worlds are box/sphere/torus kit-bashes. A sky made of three emissive boxes.
  Skylines of boxes with emissive strip boxes. A crowd of cube torsos and 12x8 sphere heads. "Posters" that are
  coloured boxes. Hero props painted over with flat color. Real textured or skinned assets are hidden. Athletes are
  rigid statues moved by squash-scale. Pool balls never rotate.
- **C-assets (~25%)**: 4 of 5 "world" GLBs are procedural synth (flat normals, 0 UVs, 0 textures, `baseColorFactor`
  only). The best assets in the repo for these games (Sketchfab textured pinball cabinet 7.9 MB, Meshy textured
  shooter 21.6 MB, textured flipper) are registered and typed but never rendered.
- **A/B-engine (~30%)**: no IBL when ambient exists, weak shadows, LDR 128x64 env, dropped exposure, fake SSAO, 1x
  pixel ratio. These cap even a well-dressed scene.

Verdicts: **Bank Shot** can be saved through polish (scope is a table and a room). **Siege Golf** keeps its gameplay
but needs its course-world asset and environment rebuilt. **Rooftop Buckets** and **Vault Breakers** need
substantial visual rebuilds (environment, characters/playfield art), keeping the simulation code.

---

## 1. Boot / route / capture-harness instructions

| Game | Route | Readiness signal | Query params (and what they really change) | Inputs → representative gameplay frame |
|---|---|---|---|---|
| Siege Golf | `/apps/showcase-siege-golf/` | `window.__SIEGE_GOLF_EVIDENCE__.mounted === true` and `frameCount > 60`. Also `__AURA3D_SHOWCASE_SIEGE_GOLF__`. `window.__SG_SHOT__()` returns a renderer dataURL | `?capture=review`: fixed aim lens `[5.4,5.2,11.4]` fov 42, 1.65x ball, adds 3 capsule "mascot mounds", **pauses the app on the first impact** (`main.ts:1458-1461`), hides panel controls. `?capture=evidence`: 480-frame result-card delay | No start screen. Opening camera is static. Press `ArrowLeft` once (switches to aim follow cam), hold `Space` ~1.2 s, release (→ flight cam). Capture at +0.6 s (flight) and +2.0 s (impact/dust). The result card appears ~45 frames after settle |
| Rooftop Buckets | `/apps/showcase-rooftop-buckets/` | `window.__ROOFTOP_BUCKETS_EVIDENCE__.mounted === true` | `?capture=review` renders a **different world** (pavilion terrace, warm brick, 3 extra text signs, different court finish, no skyline/sky boxes) **and forces backbuffer `pixelRatio = 640/innerWidth`** (`main.ts:738`). At 1440 px wide that is 0.44x, so review screenshots are upscaled 640-px renders. Do not judge quality from it. `?debug=animation` mounts the 191-joint skinned clip actors (otherwise never rendered) | Hold `Space` ~0.5 s (meter ping-pongs at 1.4/s, sweet zone ≈65-81%), release, capture at +0.35 s (arc) and +0.9 s (rim). `A`/`D` changes spot. A heat modal appears after clearing a heat |
| Bank Shot | `/apps/showcase-bank-shot/` | `window.__BANK_SHOT_EVIDENCE__.mounted === true`. Helpers: `__BS_PUMP__(frames)`, `__BS_SCENARIO__("pocket"\|"foul"\|"eight-finish"\|"rack-fail")`, `__BS_SHOT__()` | `?capture=review`: closer lens `[-0.34,2.18,2.18]` fov 39, ambient 0.1, AO 0.74, no felt guides. Portrait viewport (≤700 px or tall) switches to top-down fov 62 and removes the pendant fixture | Opening frame shows the rack with cue and aim line. Hold `Space` ~1 s, release (break), capture at +0.3 s and +1.0 s |
| Vault Breakers | `/apps/showcase-vault-breakers/` | `window.__VAULT_BREAKERS_EVIDENCE__.mounted === true` | `?capture=review`: lens `[0,5.9,5.15]` fov 46, panel styling. `?evidence=1`: shows the physics evidence strip | Hold `Space` ~1 s, release (plunger serve), wait ~1.5-2 s for the ball on the playfield, tap `A`/`D` flippers. Capture mid-play |

All four use `createGameApp` → `createAuraApp` (`index.ts:11818-11827`). Rooftop and Vault set
`renderer: { mode: "production", qualityProfile: "production" }`. Siege Golf and Bank Shot pass nothing, so they get
`safe-basic` at **pixelRatio 1**. Bank Shot's `route-health.json` nevertheless says `"mode": "production with
safe-basic fallback"`, which is the evidence file disagreeing with the code.

---

## 2. Siege Golf: Wrecking Green (`apps/showcase-siege-golf`)

### 2.1 Rendering API usage and exact config (`src/main.ts:819-861`)

```ts
scene().background("#8ecfe8")                         // flat sky color, no sky dome
  environments.studio({ intensity: 0.72, color: "#ffe2b8" })   // procedural 128x64 LDR "studio" IBL
  effects.neonBloom({ intensity: 0.055, quality: "balanced", softKnee: 0.5, shoulder: 0.6 })
  effects.fog({ density: 0.016, color: "#a9d6e6", intensity: 0.42 })  // maxOpacity 0.25+0.42*0.55 = 0.48
  effects.colorGrade({ exposure: 1.02, contrast: 1.12, saturation: 1.1 }) // exposure dropped
  effects.antiAlias({ mode: "fxaa" })
  lights.ambient(0.24)        // silently IGNORED: env branch returns first (index.ts:12660-12692)
  lights.directional("low golden sun key", "#ffd28a", 2.9, shadow: true).position(-7.5, 8.2, 5.0)
  lights.directional("cool hill fill", 0.55), directional("sky rim back-light", 0.9)
  lights.point x4 (0.34-0.8)  // with range=10, d²≥1 clamp: ~0.1-0.3 irradiance at 1.5-2 m
```

- Only game in the group with IBL, and it is the procedural LDR "studio" probe tinted peach. It is not a daylight
  sky, so reflections on a golden-hour exterior come from a studio softbox gradient.
- Shadows are on with an explicit `shadow: true` sun. Strength 0.32 (root, not overridable) means shadowed grass keeps
  68% of the sun. One map is fit over the scene radius: hills at r≈27-37 m plus `valley meadow floor` 70x70 give
  sceneRadius > 30, so the map is 4096 spread over ~70 m, about 1.7 cm/texel at best, 9-tap PCF.
- **Not used**: `environments.hdri`, `sky.dayNight`/sky dome, CSM, any texture on primitives, `instances.*`,
  particles, `effects.ambientOcclusion`, DOF, vignette.
- Renderer profile: default `safe-basic` → **pixelRatio 1** (`route-health.json:9-13` admits `"mode": "safe-basic"`).
- `app.setScene(buildHoleScene(...))` is called on **every camera-phase change** (`main.ts:975-985`): opening → aim →
  flight → settle. Each shot therefore tears down and rebuilds the entire scene graph (world GLB, ~100 primitive
  nodes, lights) up to 3 times. That causes hitch/pop risk and is also why the evidence probe had to work around
  "a second asynchronous GLB scene" (`main.ts:944-949`).

### 2.2 Primitives vs authored GLB

Static call sites: `primitives.box` 15, `sphere` 11, `torus` 7, `plane` 1, `capsule` 1. `model(` 4. Expanded per
hole (hole 1, one cup):

| Group | Nodes | Kind |
|---|---|---|
| Valley environment (`buildValleyEnvironment`, `main.ts:739-796`) | 1 plane (70x70) + 14 hill **spheres** + 12 tree **spheres** = 27 | primitives, flat pbr colors |
| Set dressing (`buildSetDressing`, `main.ts:441-679`) | causeway 4 boxes, 3 contact "patch" spheres, tee torus, beacon torus, dais 2 boxes, goal frame 3 boxes, flag pole + banner 2 boxes, beacon torus + spire box, 2 halo tori, 2 hedge spheres ≈ 22 primitives; 2 planks + 2 barrels + 4 crates = 8 GLB | 73% primitive |
| Gameplay visuals (`visualNodes`) | physics bodies (typed crate/barrel/plank/ball or primitive by hole), 8 trail spheres, 17 aim boxes, 2 strike tori, 3 chevron boxes, club shaft/head boxes + grip sphere, 12 dust spheres, 36 ghost spheres ≈ 81 primitive pool nodes | primitives |
| World | 1 `siegeGolfCourseWorld` GLB | **procedural synth** |

So about 130 primitive nodes against about 14 GLB instances. The single "world" GLB is itself made of boxes,
cylinders and slopes.

### 2.3 Typed assets and how they render

| Asset | Source | Tris | UV | Textures | Render path |
|---|---|---|---|---|---|
| `siegeGolfCourseWorld` | `scripts/build-course-world.mjs` (procedural: `box()`, `cyl(…12 seg)`, `slope()`, **per-triangle flat normals**, `tri()` at :22-27) | 4,032 | **0** | **0** (9 materials, `baseColorFactor` only) | `role: primaryWorld` |
| `siegeGolfBall` | Sketchfab | **76,800** | yes | **0** | untextured; 76.8k tris for a 16 cm ball |
| `siegeWoodenCrate` | Sketchfab | 636 | yes | **3 (base/normal/MR/AO)** | **overridden** `paintedTimberMaterial` `#f26b4f` in physics visuals (`main.ts:329`). The engine sets `replaceSurfaceTextures: true` (`index.ts:13567-13570`), so the crate's wood maps are deleted and it renders as a coral box. Dressing crates (`authoredAsset(... painted=false)`) keep their textures |
| `siegeWoodenBarrel` | Sketchfab | 846 | yes | 1 base | textured, kept |
| `siegePlankSet` | Sketchfab | **12** (a quad stack) | yes | 2 (base+normal) | the two "challenge planks" are `painted=true` (`main.ts:554-569`), so normal and base maps are deleted → flat coral slabs |

The game's own README says "Primitives (felt, rails, cup rings, aim ticks, trail puffs) are set dressing around the
typed models" (`README.md:109`), which understates the situation: the environment is entirely primitives plus a
flat-shaded synth.

### 2.4 Lighting rig

3 directional (2.9 warm sun with shadow, 0.55 cool fill, 0.9 rim) + 4 point (0.34-0.8) + IBL studio 0.72 (ambient
ignored). The thinking is reasonable (key/fill/rim). The point lights are cosmetic: at intensity 0.5-0.8 with a
`/max(d²,1)` falloff and a 10 m window they add ≤0.3 irradiance, versus a sun at 2.9·NdotL/π ≈ 0.6-0.9 on albedo.
The "red target cloth bounce" (0.34) is invisible.

### 2.5 Camera

| Phase | Kind | Desktop pos / offset | Target | FOV | Smoothing |
|---|---|---|---|---|---|
| opening | perspective | `[4.3,5.35,9.25]` | `[0.06,0.52,min(mid,-3.05)]` | 44 | – |
| aim | follow `golf-ball` | offset `[3.4,2.9,5.8]` | targetOffset `[0,0.05,-1.6]` | 46 | 0.12 |
| flight | follow | `[0,3.2,7.6]` | `[0,0.18,-2.6]` | 54 | 0.22 |
| settle | perspective | `[4.35,4.85,7.35]` | cup+2.15 z | 43 | – |

Phase changes are hard cuts via full scene rebuild, so they cannot blend. The ball is 0.16 m at 7-9 m. That is why
the composition probe inflates it 2.4x (`COMPOSITION_BALL_SCALE`, `main.ts:63`) and review inflates it 1.65x.
**The evidence frames show a ball size that never exists in play.**

### 2.6 VFX and juice

- Trail: 8 emissive spheres, scale 0.22·life, spawned every 3 frames only when power ≥1.5 and speed > 4.
- Impact dust: 12-sphere pool, 4 per burst, opaque-ish pbr spheres (opacity 0.58, roughness 1) drifting 0.18 m/s up.
  That reads as beige marbles, not dust: no billboards, no soft particles, no alpha falloff over life
  (`main.ts:1435-1479`).
- Aim guide: 17 emissive boxes, a coral/ivory dotted line. Strike rings (2 tori) plus 3 chevrons. Box-primitive putter.
- Best-solution ghost: 36 emissive spheres.
- No camera shake, no hit-stop (except the review-only pause), no screen flash, no slow-mo on topple, no
  splinter/debris, no flag cloth motion, no grass.
- Real strength: Rapier toppling of jointed stacks is genuine motion and the most "modern" thing in the frame.

### 2.7 HUD

DOM `#hud` banner + result card + mobile controls, and a 196 px right-side `#panel`. It shows a 6-cell stat grid, a
power meter, and **precision sliders labelled "Aim offset 0.000 / Set power 1.900"** with a "Strike set shot (J)"
button (`main.ts:111-117`). Those are debug/solver controls in the player HUD. An evidence strip (backend, bodies,
pose hash) is hidden by CSS (`styles.css:88-90`). Font: Avenir Next/system. The stars use the text "★★☆". The HUD is
legible, but reads like a tool, not a game.

### 2.8 Audio

Nine WAVs synthesized offline from oscillators/filtered noise (`scripts/build-sfx.mjs` header: "No network downloads,
no sampled material: every cue is synthesized from oscillators / filtered noise"). Played via engine
`createGameAudio` buses (sfx/ambient/ui) and gesture-unlocked. No recorded foley (club thock, wood crack, crowd, birds).

### 2.9 Root causes

- **Asset (C)**: the hero world is a 4k-tri flat-normal synth with no UVs, so it cannot carry grass, stone or wood
  textures, and per-face normals guarantee a faceted look. No textured grass, hedge or stone exists anywhere.
- **Game (D)**: the horizon is 26 untextured **spheres** at 12x16 segments scaled to 7-10 m, which are visibly
  faceted and identically colored. The sky is a flat color. Fairway paint is two flat boxes. Hedges are spheres.
  Dust is opaque spheres. Hero crate textures are painted over.
- **Engine (A/B)**: studio LDR IBL instead of daylight. Shadow strength 0.32. Pixel ratio 1. Exposure dropped. FXAA
  blur. Capsule = sphere. No sky dome or `environmentBackground` support in root.
- **Authoring (E)**: the agent iterated on composition comments ("lime course mascot mounds", "pull the horizon
  down") and probe hacks (ball inflation, review-only freeze) instead of acquiring terrain/foliage/sky assets. The
  code repeatedly optimizes for the route-primary pixel-diff probe.

### 2.10 Highest-leverage changes

1. Replace `siegeGolfCourseWorld` with a UV-mapped terrain mesh (smooth normals, tiled grass/stone/dirt PBR via
   texture splat or vertex-color blend) and real hedge/tree GLBs (instanced). Delete the 26 hill/tree spheres.
2. `environments.hdri` with a real outdoor golden-hour HDRI, and engine support for showing it as background (or a
   sky dome). Delete `background("#8ecfe8")`.
3. Remove `paintedTimberMaterial` overrides (or add a tint-multiply mode in the engine) so the crate and plank maps
   survive.
4. Stop rebuilding the scene per camera phase. Use one scene and switch camera specs (or blend).
5. Engine: shadow strength 1, DPR `min(devicePixelRatio,2)`, honor exposure, drop FXAA when MSAA is on.
6. Dust → camera-facing alpha-soft sprite particles. Add wood-splinter debris, a brief hit-stop and a light camera
   shake on topple.

### 2.11 Scores (code-inferred, 0-10)

| env | assets | materials | lighting | shadows | IBL | post | VFX | animation | camera | HUD | audio | juice |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2.5 | 3 | 2.5 | 4 | 3.5 | 3 | 3 | 2 | 4 (physics) | 4.5 | 4 | 3 | 3 |

### 2.12 Verdict

Keep the gameplay and physics (`structures.ts`, `hole-flow.ts`, `shot.ts`). Do a **substantial environment/asset
rebuild** (world, sky, foliage, props) plus a camera-architecture fix. This is not salvageable by tuning colors: every
past "visual pass" changed hex values on primitives.

---

## 3. Rooftop Buckets (`apps/showcase-rooftop-buckets`)

### 3.1 Rendering API usage and exact config (`src/main.ts:368-412`, `:731-743`)

```ts
scene().background("#20183f")
  effects.fog({ density: 0.005, color: "#24173f", intensity: 0.14 })   // ~0 visible
  effects.neonBloom({ intensity: 0.34, quality: "balanced", softKnee: 0.5, shoulder: 0.6 }) // milky mid-tone bloom (05 §bloom: +80% at luma 0.4)
  effects.colorGrade({ exposure: 1.04, contrast: 1.06, saturation: 1.1 })
  effects.antiAlias({ mode: "fxaa" })
  lights.ambient("#8098c8", 1.32 normal / 0.72 review)  // => IBL OFF; ambient ≈ π× three ⇒ ~three AmbientLight 4.1
  lights.directional("#fff3d6", 3.6).position(8,20,10)  // implicit shadow caster (priority 3, highest intensity)
  lights.directional("#4aa8d8", 1.45), directional("#f59e0b", 1.2)
  lights.point x6 (1.15-4.4), lights.rect x2 (0.72, 0.42) → spot-light proxies (04 §rect)
createGameApp({ pixelRatio: review ? min(1, 640/innerWidth) : min(DPR,1.75),
                renderer: { mode: "production", qualityProfile: "production" } })
```

- **IBL is off.** `lights.ambient` is present and there is no `environments.*` node, so the bridge returns
  `environmentMapIntensity: 0, environmentMapSpecularIntensity: 0` (`index.ts:12693-12707`, verified). The
  `clearcoat: 0.72` backboard, `metallic: 0.82-0.9` stanchion/fence/antenna steel, and `clearcoat` court finish all
  have nothing to reflect. Metals render as dark grey/black with point-light glints only.
- Ambient 1.32 of blue-violet light is the largest single term in the frame, which flattens the night look into a
  uniform lavender wash.
- Shadows: no light sets `shadow:true`. `resolveProductionShadowCasterIndex` picks the 3.6 directional
  (`index.ts:13172-13198`) at strength 0.32. The athletes' "contact shadows" are dark ellipsoid spheres at opacity 0.5
  (`main.ts:582-589`).
- **Not used**: environments/HDRI, sky, particles, AO, CSM, textures on any primitive, any skinned animation in normal
  play.

### 3.2 Primitives vs authored GLB

`environment.ts` alone has 51 `primitives.*`/`instances.*` call sites, which expand to well over 200 boxes in normal
play: 13 skyline buildings, 52 window-strip boxes, 7 antenna cylinders + 7 beacon spheres, 3 **sky backdrop boxes**,
billboard, parapet, fence, HVAC, facade with 4 mortar rows, 9 brick breaks, 3x6 window frame boxes, pavilion
families, seat-back families, and the scoreboard fascia. `main.ts` adds about 75 more primitive FX/aim nodes (25 aim
spheres, 24 aim segment boxes, 8 contact rays, 6 release rays, ~8 tori, spot cylinders).

The sky is literally (`environment.ts:22-55`):

```ts
primitives.box({ material: emissive "#172554" }).position(0,32,-38).scale([120,28,0.5])  // top band
primitives.box({ material: emissive "#701a75" }).position(0,16,-37.5).scale([120,18,0.5]) // horizon band
primitives.box({ material: emissive "#c2410c" }).position(0,5,-37).scale([120,12,0.5])    // glow band
```

Three hard-edged colour bands, with no gradient, stars, clouds or city lights.

GLB instances in normal play: `rooftopVenueV2`, `rooftopCourt`, `rooftopBackboard`, `rooftopRim`,
`rooftopAthleteShooter`, `rooftopAthleteDefender`, `rooftopBall` (7 visible). `rooftopShooterMeshyV1` is mounted
`visible: false`. `rooftopLayupScorer` and `rooftopDefender` (skinned) exist only under `?debug=animation`.

### 3.3 Typed assets and how they render

| Asset | Origin | Tris | UV | Tex | Skin/clips | How rendered |
|---|---|---|---|---|---|---|
| `rooftopCourt` | Blender script `build-production-art.py` | 10,900 / 203 meshes | yes | **0** | – | the court plus a **crowd made of `primitive_cube_add` torsos and 12x8 `uv_sphere` heads** (`build-production-art.py:357-384`) |
| `rooftopVenueV2` | Blender script | **1,280** / 48 meshes | yes | 0 | – | towers/bleachers as boxes. 13 nodes hidden in review (`main.ts:162-179`), including a "giant near-black orb" cylinder prop |
| `rooftopBackboard` | "Rooftop Buckets Synthesizer" | **12** (a box) | 0 | 0 | – | `setMaterial(backboardMaterial)` every frame (`main.ts:1239`) |
| `rooftopRim` | synth | 360 | 0 | 0 | – | `setMaterial(rimMaterial)` emissive orange every frame (`:1223`) |
| `rooftopBall` | synth | 504 | 0 | 0 | – | `setMaterial(orange/gold)` every frame (`:1184`). No seams/pebble, flat orange pbr |
| `rooftopAthleteShooter` / `Defender` | Objaverse CC-BY derivative | 15,432 | yes | 6 tex / 1 img | **skins 0, clips 0** | **visible athletes are static posed meshes.** "Animation" is root `setRotation`/non-uniform `setScale` squash (`main.ts:1110-1125`, `1269-1276`) plus a `sin(t·1.8)·0.028` idle sway |
| `rooftopLayupScorer` / `rooftopDefender` | CC-BY, 191-joint | 44,612 | yes | 47 PBR maps (T/N/MR/AO) | 1 skin, 4 clips each | mounted **only** with `?debug=animation`, and even then `visible: false` (`main.ts:502-536`). Normal play never renders them |
| `rooftopShooterMeshyV1` | Meshy, 50k tris | 50,000 | yes | 3 JPEG (base/MR/N), 21.6 MB | – | `visible: false` always (`main.ts:571-581`) |
| `rooftopShooter`, `rooftopShooterV2`, `rooftopDefenderV2` | synth/Blender | 4-8k | some | 0 | clips | **not referenced** in `main.ts`; shipped dead weight |

The repo contains textured, skinned, clip-bearing basketball players. The route renders rigid statues and stretches
them.

### 3.4 Lighting rig

11 direct lights (3 dir, 6 point, 2 "rect" → spot proxies) plus ambient 1.32. Normal-vs-review intensities differ on
every light (e.g. back directional 1.45 vs 0.52, ambient 1.32 vs 0.72), so the "approved" review look is not the
play look. Point lights at 1.15-4.4 at 3-5 m give 0.05-0.4 irradiance, which is small against ambient.

### 3.5 Camera

Single fixed `camera.perspective`: normal `[1.6,4.35,10.25]` → `[-0.22,1.9,1.3]` fov 48. Review `[4.35,3.45,7.2]` →
`[-0.86,1.55,1.18]` fov 46. No ball follow, no shot cam, no replay cam on a make, no shake or zoom. With the court at
~9 m from the lens, a 0.28-scaled ball is a few pixels at DPR 1.75.

### 3.6 VFX and juice

All primitive, emissive (`main.ts:614-707`): 25 aim spheres + 24 segment boxes (dotted ribbon), flight halo torus,
2 velocity streak boxes (review only), contact torus + 8 box "rays", 6 release box rays, contest link box + 2 tori +
1 spark box, fire/outcome tori on the backboard. A "net" made of 8 thin cylinders + 1 torus, with no deformation on a
swish. No particles, no confetti or fire particles for "ON FIRE", no net ripple, no backboard shake, no crowd
reaction, no camera punch.

### 3.7 HUD

The best HUD of the group in structure: top bar (title + heat/fire badges, score/target/streak/heat time), centre
shot meter with sweet-zone, bottom controls + shot clock card, modal. It is still generic web-dashboard styling
(rounded `hud-panel` cards, kbd hints, 7 touch buttons), and the subtitle reads "Rooftop Court at Dusk · Rapier Rim
Physics". That is tech marketing text in the player HUD.

### 3.8 Audio

10 WAVs synthesized from noise and oscillators (`scripts/build-sfx.mjs:1-17`), played through raw `new Audio(url)`
elements (`buckets-audio.ts:44-48`), not even the engine audio bus. Re-triggering sets `currentTime = 0` on a single
element per cue, so overlapping hits cut each other off. No crowd, city ambience bed or sampled ball bounce.

### 3.9 Root causes

- **Game (D)**: sky, skyline, windows, crowd and facade are all boxes with emissive strips. There are two parallel
  worlds (review vs normal) with diverging dressing, light intensities and pixel ratio. Typed ball/rim/backboard
  materials are replaced every frame.
- **Animation (D)**: textured, skinned, clipped athletes are deliberately hidden ("its imported bind-pose frame reads
  as a T", `main.ts:510-514`). Visible athletes are static meshes squash-scaled. This alone makes characters read as
  cardboard.
- **Asset (C)**: the backboard is a 12-triangle box. Ball and rim are untextured synth. The crowd is cubes plus
  spheres in the court GLB. The venue is 1,280 tris.
- **Engine (A/B)**: IBL off due to ambient; ambient π-scaled; bloom knee → milky; exposure dropped; FXAA. The
  skinned-clip "bind-pose T" problem suggests the clip-sampling path (`.animate({captureTime})`) was not trusted.
  Report 09 covers that path; worth confirming on screenshots.
- **Authoring (E)**: the code comments document a long sequence of composition patches: hiding nodes that "read as a
  giant near-black orb" or "a solid orange card", scaling the court 0.68x for review, raising athlete scale to 1.34 /
  1.4 for "screen weight". The agent fixed screenshots by hiding and scaling things rather than building a venue.

### 3.10 Highest-leverage changes

1. Render the real skinned athletes with their clips (fix the clip sampling/bind-pose issue in the engine if it
   exists) and delete the static presentation derivatives.
2. Replace the box sky, skyline and crowd with: an HDRI or night sky dome, a skyline billboard/impostor texture (or
   a city GLB with emissive window textures), and a crowd made of instanced textured cards or animated low-poly
   characters.
3. Remove `lights.ambient` and add `environments.hdri` (night city) so metals and clearcoat reflect. Cut the lights
   to key + 2-3 practicals.
4. Textured basketball GLB (seams, pebble normal map) and a real rim/backboard/net asset with net cloth deformation
   on make (vertex animation is enough).
5. Unify review and normal lanes: one world, one light rig, one pixel ratio.
6. Juice: net ripple, a ball-follow shot camera with a replay slow-mo on swish, flame/spark particles for ON FIRE,
   crowd audio swell.

### 3.11 Scores (code-inferred)

| env | assets | materials | lighting | shadows | IBL | post | VFX | animation | camera | HUD | audio | juice |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2 | 3.5 | 2.5 | 3 | 2.5 | 0 | 2.5 | 2.5 | 1.5 | 3 | 4.5 | 2.5 | 3.5 |

### 3.12 Verdict

**Substantial rebuild** of venue, characters and lighting. Keep `hoop-sim.ts`, `shot.ts`, `rim.ts`, `scoring.ts` and
the state machine.

---

## 4. Bank Shot (`apps/showcase-bank-shot`)

### 4.1 Rendering API usage and exact config (`src/main.ts:303-368`, `:371-393`)

```ts
scene().background("#10182a")
  effects.neonBloom({ intensity: 0.2, quality: "balanced", softKnee: 0.5, shoulder: 0.6 })
  effects.colorGrade({ exposure: 1.05, contrast: 1.07, saturation: 1.1 })   // exposure dropped
  effects.antiAlias({ mode: "fxaa" })
  effects.ambientOcclusion({ intensity: review ? 0.74 : 0.26 })  // raw-depth 8-tap edge darkener (04 §AO): ≈ no-op at 2.5 m
  effects.contactOcclusion({ intensity: 0.36, radius: 0.52 })    // diagnostics-only name-count (04 §AO)
  effects.fog({ density: 0.011, color: "#10182a", intensity: 0.16 })
  lights.ambient("#35435a", 0.24 / review 0.1)       // => IBL OFF
  lights.point pendant-mid 4.85 @(-1.2,1.55,0.92), head 3.6, foot 3.6
  lights.rect softbox 1.8 (→ spot proxy) @(0,2.25,0.15)
  lights.directional "cool rim key" #83bdff 1.35 @(3.2,4.5,2.2)  // becomes the ONLY shadow caster
  lights.directional warm fill 0.32, point x3 colored rims 0.62-0.72
createGameApp({ /* no renderer option */ })          // safe-basic → pixelRatio 1
```

- **IBL off** (ambient present). The balls are authored as lacquer (`roughness 0.055, clearcoat 0.94,
  clearcoatRoughness 0.042`, `scripts/build-models.mjs:526-529`). The rails as walnut clearcoat 0.76-0.82. With no env
  specular, a pool ball's defining look (window/lamp reflection, Fresnel rim) is missing. Only point-light pinpoints
  remain.
- **Wrong shadow caster.** Pool lighting is overhead pendants, but point and rect lights rank below directional in
  `shadowPriority` (`index.ts:13227`, `13244`, `13267`). The shadow therefore comes from the oblique 1.35 "cool rim
  key" at strength 0.32. Balls cast faint, sideways shadows, and the game substitutes a dark blob cylinder per ball
  (`ball-shadow-NN`, opacity 0.72, `main.ts:234-247`).
- Pixel ratio 1 on a scene whose detail is 5.7 cm balls, numbers and rail diamonds, then FXAA cross-blur on top. This
  is where Bank Shot loses the most per-pixel quality.

### 4.2 Primitives vs authored GLB

`environment.ts`: floor box, rug 2 boxes, 4 walls x (lower+upper) 8 boxes + chair rail, **posters = 2 gold boxes + 2
flat-colour boxes** (`environment.ts:189-197`), pendant 3 cylinders + 3 shades (cylinders) + 3 tori + 3 bulb spheres,
18 diamond boxes, 6 pocket tori, 2 chalk boxes ≈ **56 primitives**. `main.ts`: 16 contact-shadow cylinders, 4 felt
guide boxes, 2 aim boxes. GLB: 1 table + 16 balls + 1 cue + 1 ghost ball = 19 instances.

### 4.3 Typed assets

All synthesized in `scripts/build-models.mjs` (no UVs, no textures):

| Asset | Tris | Materials | Notes |
|---|---|---|---|
| `bankShotTable` | 10,060 / 14 meshes | felt `[0.012,0.055,0.245]` r0.86, felt-weave (a "shallow triangulated nap", :306-313), rails walnut clearcoat, pockets | the most carefully authored synth in the group, but felt has no cloth texture/normal map, and wood has no grain |
| `bankShotBall00-15` | 1,800-1,830 | solid/stripe caps+band, identity patch + **number as extruded mesh** | numbers are geometry, so they stay crisp. No texture means no wear or decal |
| `bankShotCue` | **170** | tip/shaft/butt flat | 170-tri cue at hero distance is visibly faceted |

No material overrides on the balls, except the ghost ball's `setMaterial(GHOST_MATERIAL)`.

### 4.4 Lighting rig

As above: 3 pendant points (3.6-4.85 at ~1.5 m → E ≈ 1.6-2.2, which is good), a softbox spot proxy, 2 directional,
3 tinted rim points (cyan/magenta/teal at 0.6-0.7 → "Midnight Slate / Aurora Noir" neon tints on a pool table).
Sensible in intent, but the most important light (the lamp) cannot cast shadows.

### 4.5 Camera

Fixed perspective `[-0.067,2.514,2.641]` → `[0.32,-0.02,0]` fov 48 (review `[-0.34,2.18,2.18]` fov 39; portrait
`[-3.8,7.2,0]` fov 62). No cue-follow, no low shot cam, no orbit to aim, no pocket cam.

### 4.6 VFX and juice

Essentially none: aim line + bank line (2 thin boxes), cue pull-back, DOM toast "BALL 7 DOWN". **Balls never
rotate.** `syncVisuals` sets only position (`main.ts:741-745`; `rg setRotation` finds no ball rotation). The rack
slides like hockey pucks with fixed number patches. No chalk puff, pocket rattle animation, cue-strike flash or camera
shake on the break.

### 4.7 HUD

Side panel with a 9-cell stat grid, power meter with sweet zone, mission line, 7 buttons, and **an evidence strip
"Backend / Sensors / Bodies" visible to players** (`styles.css:105`, no hide rule). Glassmorphism dashboard styling
(`rgba(15,23,42,0.58)` + blur). It reads as a SaaS admin panel.

### 4.8 Audio

10 synthesized WAVs (oscillator/noise), engine audio. A pool game lives on sampled ball clacks, and these are synthetic.

### 4.9 Root causes

- **Engine (A/B)**: IBL off for a scene whose whole material story is reflective lacquer. Directional-first shadow
  priority makes the lamp unable to shadow. Pixel ratio 1. FXAA. Fake AO.
- **Game (D)**: balls don't roll. The room is boxes with flat "posters". Neon tint rims. A visible debug strip.
- **Asset (C)**: no felt or wood textures, a 170-tri cue, and no textured room props (lamp, cue rack, bar, chairs).
- **Authoring (E)**: the comment "complete 10/10 visual environment" (`environment.ts:10`) above a box room shows
  the agent grading its own primitives as finished.

### 4.10 Highest-leverage changes

1. Delete `lights.ambient` and add `environments.hdri` (an interior/bar HDRI), so the lacquer immediately reads.
2. Apply the Rapier ball rotation (quaternion → `setRotation`). That is a one-line class of fix.
3. Make the lamp a shadow caster: spot lights with `shadow: true` (the engine supports a spot shadow path,
   `index.ts:13664`) aimed down from the pendant positions, and remove the oblique directional caster.
4. Felt texture with normal map plus walnut wood PBR on the table (needs UVs in `build-models.mjs` or a catalog
   table). Textured room GLB (bar back, cue rack, framed prints with images).
5. `renderer: { qualityProfile: "production" }` or the engine DPR fix. Drop FXAA.
6. Juice: break camera shake, chalk puff sprite, ball-in-pocket drop animation, sampled clack audio.

### 4.11 Scores (code-inferred)

| env | assets | materials | lighting | shadows | IBL | post | VFX | animation | camera | HUD | audio | juice |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2.5 | 4.5 | 3.5 | 4 | 2 | 0 | 2.5 | 1 | 2 | 3.5 | 3 | 3 | 2 |

### 4.12 Verdict

**Save through polish.** The table and ball assets and the camera framing are close. IBL, rolling balls, lamp
shadows, textures and DPR would move it the furthest per hour of any game in this group.

---

## 5. Vault Breakers (`apps/showcase-vault-breakers`)

### 5.1 Rendering API usage and exact config (`src/environment.ts:5-60`, `src/main.ts:348-392`)

```ts
scene().background("#030308")
  lights.ambient("#18152c", 0.82)                 // => IBL OFF
  lights.directional warm key 3.6 @(-3.2,6.2,3.4)  // implicit shadow caster, strength 0.32
  lights.directional cyan rim 2.2, magenta fill 1.15
  lights.point x5 (1.05-4.5)
  material.reflectiveFloor({ envMapIntensity: 1.2, metallic 0.62, clearcoat 0.5 })  // nothing to reflect (no IBL, no SSR/planar)
  effects.neonBloom({ intensity: 0.45, threshold: 0.62, radius: 0.5, maxIntensity: 0.88, quality: "balanced", softKnee: 0.5 })
  effects.ambientOcclusion({ intensity: 0.3, radius: 0.62 }), effects.contactOcclusion(0.36)
  effects.fog({ density: 0.018, color: "#190e2b", intensity: 0.24 })
  effects.colorGrade({ exposure: 1.05, contrast: 1.07, saturation: 1.1 }), effects.antiAlias("fxaa")
createGameApp({ renderer: { mode: "production", qualityProfile: "production" } })  // DPR 1.5
```

- **The chrome ball renders without environment.** `liveBallMaterial = material.metal({ metallic 0.96, roughness 0.12,
  envMapIntensity 1.6, emissive #39dfff 0.42 })` is applied via `setMaterial` (`main.ts:131-139`, `:435`). A metal
  with no IBL has ~zero diffuse and only point/directional specular highlights. The pinball, the hero of the game,
  renders as a dark disc with a cyan emissive tint.
- `reflectiveFloor` is a name, not a reflection. It is a roughness-0.2 metal box with no env, no SSR and no planar
  reflection.
- Bloom at threshold 0.62 + knee 0.5 means the 05 report's computed +125% glow at mid-grey luma for this exact config
  (`05-postfx…:410`). Combined with emissive everything, that produces the "neon haze" look.

### 5.2 Primitives vs authored GLB

Environment: ~13 primitives (floor, rear wall, 2 neon rails, marquee + edge, 4 floor lane lights, underglow torus).
`table.ts` physics visuals: 23 static/dynamic bodies, most rendered as primitives through `primitiveNode`
(`main.ts:212-239`, pbr roughness 0.8 / emissive), plus targets as emissive boxes. `main.ts` adds 6 mission-state
beacon boxes, 5 bank lamp boxes, 1 impact torus, and **60+ `text3D` SDF digit nodes** for the score reel
(`scoreboard.ts`). GLB: table, mechanisms, vault door, 2 flippers, ball(s).

### 5.3 Typed assets

| Asset | Origin | Tris | UV | Tex | Used? |
|---|---|---|---|---|---|
| `vaultBreakersTable` | synth "build-models REVAMP" | **1,012** / 8 meshes | 0 | 0 | yes. Comment says "Real catalog pinball cabinet — textured, multi-material, proper geometry" (`environment.ts:53-55`), which is **false**: it is a 1k-tri flat-colour synth |
| `vaultBreakersMechanisms` | synth | 5,436 | 0 | 0 | yes |
| `vaultBreakersVaultDoor` | synth | 386 | 0 | 0 | yes |
| `vaultBreakersFlipper` | synth | 1,256 | 0 | 0 | yes |
| `vaultBreakersBall` | synth | 960 | 0 | 0 | yes, material replaced every state change |
| `vaultBreakersCabinet` | **Sketchfab, 12 PBR textures (T/N/MR/AO), 7.9 MB** | 5,616 | yes | 12 | **NO**, not referenced in `src/` |
| `vaultBreakersCabinetHigan` | Sketchfab, palette texture | 23,632 | yes | 1 | **NO** |
| `vaultBreakersFlipperReal` | Sketchfab, base+emissive | 1,084 | yes | 1 | **NO** |

The pinball playfield, the single most important visual in any pinball game (printed art, lit inserts, plastics,
ramps), is an untextured flat `playfield-material`. The only textured cabinets in the repo for this game are shipped,
typed, hashed and unused.

### 5.4 Lighting rig

3 directional (3.6 warm key, 2.2 cyan, 1.15 magenta) + 5 points (1.05-4.5) + ambient 0.82 dark violet. A real pinball
reads from GI-under-plastics and insert lights. Here, colored directional washes tint everything.

### 5.5 Camera

Fixed perspective normal `[0,5.15,7.35]` → `[0,-0.05,-0.38]` fov 50. Review `[0,5.9,5.15]` fov 46. The comment
history (`main.ts:364-382`) documents the ball being "an almost invisible grey dot". The camera was moved closer, but
a dark untextured chrome ball remains hard to read. No ball-tracking tilt and no multiball cam.

### 5.6 VFX and juice

One impact torus that scales out over 0.42 s, in three emissive colors. Bank lamps swap materials. The vault door
swings (rotation). Mission beacon boxes toggle. No sparks, bumper flash rings beyond the single torus, lit insert
chases, light shows on mode start, DMD animation, flipper trails or screen shake on tilt.

### 5.7 HUD

300 px side panel (`styles.css:27-28`: `flex: 0 0 300px`) with stat grid, plunger meter, mission line, controls and
buttons. The evidence strip is hidden unless `?evidence=1`. The in-world 3D SDF score reel is a nice idea, but uses
uppercase-only text3D with emissive gold. No DMD-style backglass.

### 5.8 Audio

11 synthesized WAVs, engine audio buses.

### 5.9 Root causes

- **Asset (C) + authoring (E)**: the game uses a 1k-tri flat synth table while three textured Sketchfab assets sit
  unused, and a comment claims the synth is the textured catalog cabinet. Nothing provides playfield art.
- **Engine (A/B)**: IBL off makes the chrome ball and "reflective" floor dark. Bloom knee hazes the neon. Shadows are
  weak.
- **Game (D)**: neon-tinted directional washes, emissive boxes as lamps, and a single ring as all the VFX.

### 5.10 Highest-leverage changes

1. Use `vaultBreakersCabinet` (or Higan) as the cabinet shell and author a **textured playfield** (2k-4k art texture
   with lit-insert emissive mask) on a UV'd plane aligned to the physics plane.
2. Remove ambient and add a dark-arcade HDRI so the chrome ball reflects. Give the ball a real chrome look (env + no
   emissive tint).
3. Light inserts as emissive texture regions driven by mission state, instead of floating boxes.
4. Particles for bumper hits and the vault opening. Camera nudge on tilt. Multiball light show.
5. Engine: bloom knee/threshold sanity (threshold ≥1 in linear HDR), shadow strength 1.

### 5.11 Scores (code-inferred)

| env | assets | materials | lighting | shadows | IBL | post | VFX | animation | camera | HUD | audio | juice |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2.5 | 2.5 | 2 | 3 | 2.5 | 0 | 2.5 | 2 | 3.5 (flippers/door) | 3.5 | 3.5 | 3 | 2.5 |

### 5.12 Verdict

**Substantial visual rebuild** (cabinet, playfield art, insert lighting, ball material). Keep the physics (`table.ts`,
`flippers.ts`, `ball-flow.ts`, `missions.ts`, `scoring.ts`), which is solid and documented.

---

## 6. Cross-game capability ladder (this group)

Ladder: exists / works / public API / used by these games / good defaults / composes / modern quality / agents know /
examples demonstrate.

| Capability | exists | works | API | used (of 4) | good default | composes | modern | agents know | demo'd |
|---|---|---|---|---|---|---|---|---|---|
| IBL (procedural) | ✓ | ~ (LDR 128x64) | `environments.studio` | 1 (siege) | ✗ (off with ambient) | ✗ (ambient kills it) | ✗ | ✗ | ✗ |
| HDRI IBL | ✓ | ~ | `environments.hdri` | 0 | – | ✗ (no background) | ~ | ✗ | ✗ |
| Directional shadows | ✓ | ✓ | `shadow:true` | 1 explicit, 4 implicit | ✗ (strength 0.32) | ✗ (lamp can't win priority) | ✗ | ~ | ~ |
| Spot shadows | ✓ | ? | `lights.spot({shadow})` | 0 | – | – | – | ✗ | ✗ |
| Skinned clips | ✓ | ? | `.animate()` / `play()` | 1 (debug-only, hidden) | – | ✗ (bind-pose T complaint) | – | ✗ | ✗ |
| Textured GLB | ✓ | ✓ | `model()` | 3, but overridden/hidden | – | ✗ (`material` deletes maps) | ✓ | ✗ | ~ |
| Particles | ✓ (CPU) | not on prod bridge (08 §) | `effects.particles` | 0 | – | ✗ | – | ✗ | ✗ |
| Sky | ✓ (`sky.dayNight`) | ? | yes | 0 | – | – | – | ✗ | ✗ |
| Tone-map/exposure | ACES fixed | ✓ | `colorGrade.exposure` dropped | 4 (no-op) | ✗ | ✗ | ✗ | ✗ (they set it) | ✗ |
| AO | 8-tap raw depth | ✗ | `effects.ambientOcclusion` | 2 | ✗ | ✗ | ✗ | believed | ✗ |
| Bloom | ✓ | ✓ | `neonBloom` | 4 | ✗ (knee 0.5 → milky) | ~ | ✗ | copied cargo | – |
| Primitive textures | ✓ | ✗ (no mips, clamp) | `material.pbr({map})` | 0 | – | – | – | ✗ | ✗ |
| Instancing | ✓ | ✓ | `instances.*` | 1 (rooftop) | – | ✓ | – | ~ | – |
| Text3D SDF | ✓ | ✓ | `text3D` | 2 | – | ✓ | ~ | ✓ | – |

---

## 7. Fake parity / misleading claims found

1. `vault environment.ts:53` "Real catalog pinball cabinet — textured, multi-material": the asset is a 1,012-tri
   untextured synth. The textured catalog cabinets are unused.
2. Rooftop "Release-probed, textured 191-joint athletes with genuine authored basketball clips" (`main.ts:497`):
   never visible in normal play or review. Visible athletes have 0 skins / 0 clips.
3. Bank `environment.ts:10` "complete 10/10 visual environment" and rooftop `main.ts:414` "10/10 Surrounding
   Skyscraper Skyline": box geometry.
4. Bank Shot `route-health.json` "production with safe-basic fallback", but the code passes no renderer options, so
   it runs `safe-basic`.
5. `effects.colorGrade({exposure})` in all four, and `effects.contactOcclusion` in two: both no-ops (05/04 reports).
6. `material.reflectiveFloor` (vault): no reflection without IBL/SSR.
7. Evidence/composition probes inflate the hero (siege ball 2.4x / 1.65x, rooftop athletes 1.4x and court 0.68x,
   bank balls 2.9x radius visual scale) and use separate review worlds (rooftop), lights (all four) and pixel ratio
   (rooftop 640 px). Review-lane screenshots are not the shipped game.

## 8. Unused / dead assets to delete or promote

- `rooftopShooter`, `rooftopShooterV2`, `rooftopDefenderV2` (not referenced). `rooftopLayupScorer` and
  `rooftopDefender` (9.9 MB each, debug-only). `rooftopShooterMeshyV1` (21.6 MB, always hidden). These should be
  promoted (with clips) or deleted.
- `vaultBreakersCabinet` (7.9 MB), `vaultBreakersCabinetHigan`, `vaultBreakersFlipperReal`: promote.
- `.candidate-assets/` in rooftop: candidate dumps with Python derivation scripts inside an app directory.

## 9. Engine vs game vs asset vs authoring split (group-level)

| Bucket | Share | Main evidence |
|---|---|---|
| A renderer | 15% | LDR 128x64 env, fake SSAO, FXAA cross-blur, no sky/background from env, mid-tone bloom knee |
| B defaults | 15% | ambient kills IBL, shadow 0.32, DPR 1, exposure dropped, directional-first shadow priority, primitive spheres 12x16 |
| C assets | 25% | 4/5 world GLBs synthesized flat; 12-tri backboard; 170-tri cue; cube-and-sphere crowd |
| D game | 30% | box skies/skylines/rooms; flat overrides on textured props; static athletes; non-rolling balls; primitive VFX; scene rebuild per camera phase |
| E authoring | 15% | hiding/scaling to satisfy probes; review-only worlds; textured assets left unused; self-graded "10/10" comments |

## 10. Recommendations (priority order for this group)

1. Engine B-fixes first (they lift all four at once): ambient must not disable IBL; shadow strength 1; DPR
   `min(devicePixelRatio, 2)` for all profiles; honor exposure; no FXAA over MSAA; bloom threshold in linear HDR ≥1
   with knee ≤0.2 by default; allow point/spot to win shadow priority when `shadow:true`.
2. Bank Shot polish (fastest visible win): HDRI, ball rotation, spot-lamp shadows, felt/wood textures, hide the
   evidence strip.
3. Vault Breakers: textured cabinet + playfield art + insert emissive map + HDRI chrome ball.
4. Siege Golf: textured terrain world + foliage + HDRI sky; remove paint overrides; one scene with camera switching.
5. Rooftop Buckets: animated skinned athletes, night-city HDRI/sky, real venue/crowd assets, unified review/normal
   lanes, net animation.
6. Policy for agents: forbid `model(asset,{material})` on textured assets (lint) and forbid primitive skies/skylines.
   Require `environments.hdri` for any scene with metallic/clearcoat materials. Require review captures to use the
   shipped lane (same world, lights and DPR).
