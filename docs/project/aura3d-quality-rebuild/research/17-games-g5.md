# 17 — Game forensics, group 5: Gravity Post, Gallery Shift, Deep Recovery

Branch `aura3d-quality-rebuild/audit`. Code-level audit only. I ran nothing in a browser. Every claim below comes from reading the route source, the engine bridge code it calls, or parsing the actual GLB binaries with a small node script (`/tmp/g5/glb.mjs` and `/tmp/g5/img.mjs`, which read the JSON chunk plus PNG/JPEG headers of the embedded images). README files, `route-health.json`, and tests got no credit unless the code confirms them.

Engine-level facts reused from sibling reports (verified where cited):
- `lights.ambient()` with no `environments.*` node disables IBL completely (`packages/engine/src/agent-api/index.ts:12701-12716`, report 04 §2.2). None of these three games adds an environment node, and all three add ambient.
- Aura's ambient is about π× stronger than three.js `AmbientLight` (report 04 TL;DR #2).
- Shadow strength is 0.32 for games. There is one shadow caster per frame, and an explicit `shadow:true` wins (`index.ts:13172-13199`, report 04 #3).
- Root exposure is hard-coded to 1. `effects.colorGrade({ exposure })` is dropped (report 05 #5).
- The default `safe-basic` profile renders at pixelRatio 1 (report 02 #6, report 05 #1). None of these three routes sets `pixelRatio`.
- Point lights have a hard-coded range of `10*scale` and use `I/max(d²,1)` falloff. `lights.rect` is emitted as a spot proxy (report 04 §3).
- `effects.volumetricFog` pushes the whole post chain into a per-pixel CPU readback path (report 05 #7, report 08 §volumetric).

---

## 0. TL;DR

| | Gravity Post | Gallery Shift | Deep Recovery |
|---|---|---|---|
| Route | `/apps/showcase-gravity-post/` | `/apps/showcase-gallery-shift/` | `/apps/showcase-deep-recovery/` |
| Mount API | `createAuraApp` | `createGameApp` | `createAuraApp` |
| IBL / env | none (ambient kills it) | none | none |
| Background | flat `#0e3346` clear colour | flat `#05070d` | flat `#04141c` |
| Shadow caster | implicit: strongest directional at 0.32 strength | one static spot in a corner (`shadow:true`) | one static spot that does **not** follow the sub |
| Ambient total | 0.64 | **1.56** (0.38 + 1.18) | 1.18 |
| Light count | 8 | **~31** (above the 16-light GLB cap) | 16 (exactly at the cap) |
| Post | neonBloom 0.18 + kit bloom 0.32 + grade (exposure ignored) + FXAA | neonBloom 0.22 + fog + grade + FXAA | neonBloom 0.16 + fog + **volumetricFog (CPU path)** + grade + FXAA |
| Primitive instances (default route) | ~330 | ~45 plus 13 merged box meshes | ~200 |
| GLB nodes | 22 | 33 | 17 |
| Hero asset quality | courier skiff: beveled-box kitbash, 14k tris, **nine 32×32 stripe textures** | thief: **Kenney blocky character, 72 triangles, unlit** | sub: **2,068 flat-shaded tris, no UVs**, then flattened to one teal tint |
| Audio | 10 offline-synth WAVs (oscillator + LCG noise) | 11 offline-synth WAVs | 11 offline-synth WAVs on `HTMLAudioElement` |
| Code-inferred overall (mean of 13 axes) | 2.3 / 10 | 1.9 / 10 | 2.0 / 10 |
| Verdict | substantial rebuild (art) | substantial rebuild (art + camera + character) | substantial rebuild (whole world) |

Why these three look "Atari / early-Nintendo", ranked by pixel impact:

1. **Assets.** The "release-validated" heroes are procedural toys: a 72-triangle unlit blocky thief, a 2k-triangle faceted submarine with no UVs, and a box-kitbash skiff textured with 32×32 diagonal stripe swatches. Exhibits run 60–284 tris, pedestals 40 tris, and display cases are 24 tris (two boxes). The "museum world" GLB is 16.7k tris with zero textures. (C + E)
2. **No IBL, no sky, flat clear-colour backgrounds, a strong ambient wash, and near-invisible 0.32-strength shadows.** This is the PS1 lighting recipe: a directionless constant plus a few lambert lobes, with nothing reflected on any metallic or rough surface. (B + A)
3. **Material overrides destroy what detail exists.** `model(asset, { material: { color } })` sets `replaceSurfaceTextures: true` (`index.ts:13567-13580`, `TypedGLBActor.ts:498-501`). Gravity Post throws away the 14 × 1024² PBR textures on the 11.5 MB dock gate and replaces them with flat `#b7f4ff`. Deep Recovery collapses the sub's five material groups (yellow hull, glass, lamps, exhaust, dark trim) into one teal tint. (E, with an engine-API footgun)
4. **The world is built from primitives and emissive "fake light".** Rocks, decks, coral, chains, arches, sea floor (a squashed sphere), dust and star fields (individual spheres), trails, and predictions are all boxes, spheres, and tori. Almost every PBR material also carries `emissive` at 0.1–0.6 to compensate for weak lighting, which flattens shading further. (D + E)
5. **Evidence gaming.** All three routes carry a separate `?capture=review` composition with different lights (2–3× intensity), different cameras, different asset scales, review-only assets (Meshy candidates, MailPod, freightway), and nodes teleported 100–120 m away (`z + 120`) to clean up the frame. Agents iterated on the review artifact, not on what a player sees. (E/G)
6. **Cameras are static or rigid.** Gallery Shift has a fixed overview camera that never follows the thief. Deep Recovery uses `smoothing: 0`, a rigid follow. Gravity Post is a fixed top-down board at fov 41 from about 9.8 m, where the planets are 0.4–1 m spheres. None of the three has camera shake, FOV kick, or easing. (D)
7. **Animation is missing or broken.** The Gallery thief **never rotates to face its movement** (`thief.ts` has no yaw; `main.ts` sets only position), and guard-1 (Robotcand) has no clips and slides. Deep Recovery has no animation at all. Gravity Post has a velocity-derived bank and pitch only. (D)
8. **Audio is chiptune-grade.** Every cue is a sine, square, or saw oscillator plus LCG noise, baked offline into 16-bit WAVs. There is no music, no real samples, and no spatialisation. Gravity Post fakes loops by retriggering one-shots every 0.3–6.1 s. (C/D)

---

## 1. Gravity Post (`apps/showcase-gravity-post`)

### 1.1 Files read
`src/main.ts` (2,489 lines), `freightway.ts`, `pod.ts`, `stations.ts`, `contracts.ts`, `post-audio.ts`, `styles.css`, `index.html`, `README.md`, `route-health.json`, `scripts/build-courier-skiff.py`, `scripts/build-freight-district.py`, `scripts/build-sfx.mjs`. Engine: `prefabs.solarSystem` (`index.ts:6129-6237`), `model()` (`index.ts:2098-2125`), and the GLB tint path (`index.ts:13555-13584`).

### 1.2 Boot and screenshot harness recipe
- URL: `/apps/showcase-gravity-post/`. Public board is the default; `?capture=review` gives the evidence-only close lens (different scene, see §1.10). `?planetProbe` adds a pixel-probe hook.
- Readiness: `window.__GRAVITY_POST_EVIDENCE__.rendererMounted === true`. The alias `window.__AURA3D_SHOWCASE_GRAVITY_POST__` also works. `document.body.dataset.gravityPostReady === "true"` is set on the first evidence publish, *before* the renderer is up, so do not use it alone.
- Deterministic hooks:
  - `__GRAVITY_POST_STEP__(dt)` renders one frame.
  - `__GRAVITY_POST_SIM_STEP__(dt)` runs the simulation only.
  - `__GRAVITY_POST_CAPTURE__()` steps 1/30 s and returns a PNG dataURL atomically.
- Input to reach gameplay: **pointer drag is the only working launch.** Press on the canvas, drag about 120–190 px (`AIM_DRAG_PIXEL_RANGE = 190`, `main.ts:61`), and release. Prediction beads only show while dragging. The keyboard aim code (`steerKeyboardAim`, `launchActiveAim`, `main.ts:1447-1461`) is **never called**; A/D/Z/X are bound but dead. After launch, hold Space for 8× warp. Suggested shots:
  - (a) Idle board after 2 s.
  - (b) Mid-drag hold, pointerdown at centre then move to (-140, +60): shows the prediction line.
  - (c) After release, `SIM_STEP` × 120 then `CAPTURE`: shows the in-flight trail.
- HUD: `<aside id="hud">`. `innerHTML` is fully rebuilt **every frame** (`renderHud` is called from `updateGameplay`, `main.ts:2378`), and listeners are re-bound every frame.

### 1.3 Rendering APIs used versus left unused

| Feature | Used? | Exact config / evidence |
|---|---|---|
| Renderer profile | default `safe-basic`, pixelRatio 1 | no `renderer` option in `createAuraApp` (`main.ts:1243-1280`) |
| Background | flat clear colour | `.background(visualReviewCapture ? "#28546a" : "#0e3346")` (`main.ts:303`) |
| IBL / environment | **no** | no `environments.*`; ambient present, so env intensity is 0 |
| Ambient | yes | `lights.ambient({ intensity: 0.64, color: "#e0f4ff" })`; review 0.85 (`main.ts:1194`) |
| Directional | 2 | key `[2.4,6.2,3.2]` ×1.48 `#e9f7ff`; warm rake `[-4.2,3.6,-3.8]` ×0.42 `#ffc58d`; review 3.0 / 2.0 (`main.ts:1195-1196`) |
| Point | 5 + 1 from kit (+2 review) | solar rim 1.8, cyan 1.4, amber 1.3, courier key 4 (review 5.4), engine rim 2.2 (review 3.6) (`main.ts:1197-1201`); kit "warm solar key light" 0.75 (`index.ts:6147`) |
| Shadows | implicit | no `shadow:true`. The caster is picked by priority, so the key directional casts at strength 0.32. `castShadow:true` on planet GLBs. A primitive "contact shadow" cylinder fakes grounding (`main.ts:966-980`) |
| CSM | no | never set on root (report 02) |
| Tone mapping / exposure | ACES at fixed 1 | `effects.colorGrade({ exposure: 1.04, contrast: 1.06, saturation: 1.1 })` (`main.ts:1189`); exposure dropped |
| Bloom | 2 nodes | `neonBloom({ intensity 0.18, threshold 0.62, maxIntensity 0.9, antiBlowout, softKnee 0.5, shoulder 0.6 })` (`main.ts:1188`) **plus** the kit's `effects.bloom({ intensity 0.32, threshold 0.84 })`, kept by the filter `node.kind === "effect"` (`main.ts:281`) |
| AA | FXAA | `main.ts:1190` |
| Fog | trivially weak | `effects.fog({ density 0.005, color #0a2038 })` (`main.ts:1202`): about 0% at board distances |
| SSAO / SSR / DOF | no | — |
| Particles / VFX engine | no | sparks, dust, trails, and drones are individual primitives |
| Sky / stars | primitive spheres **inside the play volume** | kit stars: 84 spheres at y 0.12–1.2 within ±3.45 m (`index.ts:6159-6164`). No skybox or starfield shader |
| Labels | DOM `labels.anchor` | 6 bodies + 6 stations (`main.ts:1217-1240`) |

### 1.4 Primitives versus GLB (default public board)

Primitive call sites: 39 in `main.ts`. Approximate instances from the loops:

| Group | Instances | Source |
|---|---|---|
| Solar kit (filtered): sun core, corona, halo + 84 stars + 24 dust | 111 | `main.ts:280-285`, `index.ts:6143-6170` |
| Orbital dust spheres | 24 | `main.ts:312-322` |
| Orbit guide tori | 5 | `main.ts:325-335` |
| Planet atmosphere shells, rings, moons | 13 | `main.ts:366-428` |
| Well boundary + red exclusion tori | 12 | `main.ts:431-445` |
| Station capture pulse tori | 6 | `main.ts:505-514` |
| Gale Terminal deck / pylons / portal boxes and cylinders | ~21 | `main.ts:773-858` |
| Courier fittings (livery, beacon, restraints, scan ring) | 8 | `main.ts:986-1058` |
| Drive markers + rings | 8 | `main.ts:1064-1092` |
| Engine streaks + contact wakes + plume | 20 | `main.ts:1097-1144` |
| Prediction beads + actual-path beads | 78 | `main.ts:1147-1165` |
| Dock sparks + flyby drones | 14 | `main.ts:1168-1185` |
| Contact shadow cylinder | 1 | `main.ts:966` |
| **Total** | **~330** | |

GLB nodes: 5 planets, 6 dock beacons, 6 dock gates, 1 freight district, 1 skiff, 1 avatar, 2 parcels = **22**. `route-health.json` reports `primitiveStatus.sourceOccurrences: 40 / primitiveBudget: 40`, which counts *call sites*, not instances. The ~330 primitive instances and 471 draw calls (README) never appear in that budget.

### 1.5 Typed assets, measured from the binaries

| Asset | Tris | Textures | Materials | Rendered how |
|---|---|---|---|---|
| `gravityPostCourierSkiff` (hero, "release", CC0 "Aura3D synthesis") | 14,096 | **9 × 32×32 PNG** diagonal stripes (`build-courier-skiff.py:60-71`) | 10, no normal/ORM | as-is. Built from ~38 beveled `primitive_cube/cylinder/torus` calls in Blender |
| `gravityPostFreightDistrict` | 26,916 | **9 × 32×32** stripe PNG (`build-freight-district.py:117-120`) | 9 | as-is (default board only) |
| `gravityPostDockGate` (11.47 MB) | 29,000 | 14 × 1024² (baseColor, ORM, normal) | 5 | **override `material.pbr({ color "#b7f4ff", ... })`** (`main.ts:492-499`), so `replaceSurfaceTextures:true` and every texture is discarded |
| `gravityPostDockBeacon` (satellite, CC-BY) | 15,182 | 4 (normal maps) | 5 | as-is, scale 0.14 |
| `gravityPlanetEarth` (12.9 MB) | **3,072** | 2 × 4096×3072 | metallic 0.25 | fit to `visualRadius*4.8` (0.41–1.0 m). A 3k-tri sphere with a 4k texture rendered at about 40 px |
| `gravityPlanetJupiter` (11.5 MB) | 3,072 | 1 × 4k | — | same |
| `neonCourierAvatar` | 3,254 | 0 | **KHR_materials_unlit**, flat greys | static mannequin "seated" in the skiff |
| `courierParcel` | 216 | 3 | 1 | 1–4 copies |
| `gravityPostMailPod` / `gravityPostMeshyFreight` | 42k / 83k | 8 / 3 | — | **review lens only** |

So the "hero" is a 32×32-pixel-textured box kitbash, the textured planets are visually tiny, and the only high-quality textured asset (the gate) has its textures wiped by the game.

### 1.6 Camera
- Public: `camera.perspective({ position [0.3, 7.25, 6.65], target [0.28, 0.08, -0.55], fov 41 })` (`main.ts:1275-1279`). Distance is about 9.9 m and pitch about 47°. It is static: no follow, no zoom, no shake.
- Review: an oblique route lens at fov 56 from `PLAY_PLANE_Y + 1.9` (`main.ts:1251-1274`).
- Board extent is about ±3.5 m, so planets of 0.4–1 m read as dots. Three.js reference titles of this genre (Kerbal-style map views, *Orbit*-style puzzles) use an orthographic or orbit-controllable camera, zoom-to-pod, and slow drift.

### 1.7 VFX and juice
Everything is a rigid primitive moved by `setPosition`:
- 8 dock "sparks" that are spheres travelling on a fixed radial (`syncSparks`, `main.ts:2065-2081`)
- trails made of 7 boxes
- 12 wake boxes
- a thrust-plume box
- 6 flyby drones that are boxes orbiting

There are no particles, additive blending, flipbooks, screen shake, hit-stop, or chromatic flash, and no time-of-arrival effect beyond a torus "breathe" scale of `1.25 + sin(frame*0.35)*0.22` (`main.ts:2059`). The bloom on emissive beads is the only glow.

### 1.8 HUD
DOM side panel (`#hud`, `styles.css`): rounded 16 px cards on `rgba(7,12,24,0.7)`, Avenir/Segoe, text metrics, and HTML buttons. It is a generic dashboard layout, not game UI. It is rebuilt through `innerHTML` every frame, which is a perf and focus hazard: buttons are re-created 60×/s and hover states flicker. The review lens swaps metric labels (Speed→State, Score→Delivered) for screenshots (`main.ts:2171-2178`).

### 1.9 Audio
`post-audio.ts` uses `createGameAudio` with 4 buses and 10 cues, all from `scripts/build-sfx.mjs`: sine, triangle, saw, or square oscillators plus xorshift noise, 16-bit mono 44.1 kHz. Loops are faked by retriggering one-shots (`burn-loop` every 0.3 s, `warp-hum` 0.52 s, ambient 6.1 s; `post-audio.ts:48-58`). There is no music and no real samples.

### 1.10 Evidence-gaming surface (`?capture=review`)
Review mode changes:
- background
- ambient 0.64→0.85, key 1.48→3.0, rake 0.42→2.0, courier key 4→5.4, +2 locality points
- camera
- pod scale 1.7→0.94
- adds a review-only freightway (`freightway.ts`, 5 merged meshes), runway panels, the Meshy candidate, the MailPod shuttle, and shoulder parcels
- hides planets, rings, labels, and dust (scaled to 0.001)
- edits HUD labels

The `__AURA3D_COMPOSITION_PROBE__.settleSubjectPose()` hook can override the pod's *displayed* position onto the review corridor (`compositionPresentationOverride`, `main.ts:1369`, `2441-2443`). About 60% of the 2,489 lines are comments justifying review-frame tweaks. This is classic optimisation of a judge's artifact instead of the player's frame.

### 1.11 Root causes

| Bucket | Cause | Evidence |
|---|---|---|
| E/C | Hero and world GLBs synthesised by an agent in Blender from beveled cubes with 32×32 stripe textures, then labelled `quality: "release"` | `build-courier-skiff.py:60-71`; `route-health.json` primaryAssets |
| E | Material override wipes 14 real PBR textures on the gate | `main.ts:492-499` → `index.ts:13567-13570` → `TypedGLBActor.ts:498-501` |
| B/A | Ambient present, so no IBL; flat clear colour, no space skybox; shadows 0.32 | §1.3 |
| A | Exposure ignored; bloom duplicated; pixelRatio 1 | reports 02 and 05 |
| D | Planets are tiny 3k-tri spheres (0.4–1 m) under a 10 m top-down camera; the board reads as a diagram (rings, beads, dots) | `main.ts:346`, `1275` |
| D | Stars and dust are in-volume spheres, not a backdrop | `index.ts:6159-6170` |
| D | VFX are moved primitives; no particles | §1.7 |
| E/G | Effort went into the review lens, not the public frame | §1.10 |

### 1.12 Highest-leverage changes
1. Add a space HDRI or starfield skybox as background and IBL (`environments.*` with a real equirect) and remove `lights.ambient`. This gives specular on the skiff, gate, and planets.
2. Delete the gate `material` override, or add a tint mode that multiplies instead of replacing textures (engine fix: `tint.replaceSurfaceTextures` should default false).
3. Replace the skiff with a real authored or Meshy-textured craft (≥1k textures, normal/ORM). Make the planets 32k+ tri spheres at 3–5× screen size, with an atmosphere Fresnel shader instead of 0.16-opacity emissive shells.
4. Make the camera follow and zoom the pod in flight with damping, and return to the board on dock.
5. Use real particles for sparks, thrust, and trails (additive soft sprites, or a GPU ribbon trail for the path) instead of 78 bead spheres.
6. Diff-update the HUD instead of using `innerHTML` per frame. Wire the keyboard launch (Enter).
7. Delete the `?capture=review` divergence so evidence equals the player frame.

### 1.13 Scores (code-inferred, 0–10)

| env | assets | materials | lighting | shadows | IBL | post | VFX | animation | camera | HUD | audio | juice |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2 | 3 | 2 | 3 | 1 | 0 | 3 | 2 | 2 | 3 | 4 | 3 | 2 |

### 1.14 Verdict
**Substantial rebuild of the art layer; gameplay code is salvageable.** The integrator, prediction, contracts, and scoring are sound (`wells.ts`, `pod.ts`, `scoring.ts`). The scene graph in `main.ts` (lines 274–1240) should be rewritten around a skybox, IBL, real assets, a particle system, and one composition.

---

## 2. Gallery Shift (`apps/showcase-gallery-shift`)

### 2.1 Files read
`src/main.ts` (2,048), `environment.ts` (695), `floor.ts`, `guard.ts`, `thief.ts`, `vision.ts`, `heist-audio.ts`, `gallery-world-candidate.ts`, `styles.css`, `index.html`, `README.md`, `route-health.json`, `scripts/build-models.mjs`, `scripts/build-sfx.mjs`, `art-candidates/museum-world-aug31/generate_museum_world.py`.

### 2.2 Boot and screenshot harness recipe
- URL: `/apps/showcase-gallery-shift/`. Query params:
  - `?capture=review`: different lens and lights; hides the side panel.
  - `?debug=1`: enables `__GS_RESET_CAPTURE__` and `__GS_TELEPORT__(x,z)`.
  - `?debug=visual`: perception overlays.
- Readiness: `window.__GALLERY_SHIFT_EVIDENCE__.status === "ready"`, which requires `rendererDrawn && frameCount >= 90`. A 90-frame warmup self-runs via `app.step` once drawn (`main.ts:1591-1601`). The alias is `__AURA3D_SHOWCASE_GALLERY_SHIFT__`.
- Deterministic pump: `__GS_PUMP__(frames)`.
- Inputs:
  - The thief spawns at `(0, 4.55)` facing default.
  - Hold `KeyW` (keydown on window, no focus needed) for about 90 frames to walk north into the rotunda.
  - `Shift` toggles sneak, `X` sprints, hold `E` at a pedestal to lift.
  - Suggested shots: (a) the idle lobby after ready; (b) `W` held, `__GS_PUMP__(120)`; (c) `?debug=1` with `__GS_TELEPORT__(-7.5,-2.85)` near the archive pedestal, then hold E for 60 frames to show the lift bar.
- Note: the camera is static, so any frame shows the same framing.

### 2.3 Rendering APIs used versus left unused

| Feature | Used? | Exact config |
|---|---|---|
| Profile / DPR | `createGameApp` default, so `safe-basic`, pixelRatio 1 | `main.ts:1115-1139` |
| Background | flat `#05070d` | `main.ts:956` |
| IBL | **no** | — |
| Ambient | **two** ambient lights: `museum ambient fill` 0.38 `#c4e7ee` (review 0.06) (`main.ts:1067`) + `museum-ambient` **1.18** `#475569` (`environment.ts:612-619`) | total 1.56. The π-scaled wash dominates |
| Directional | 4: moon key ×1.05 `[4.8,8.6,5.2]`, cyan rim ×0.58 (`main.ts:1068-1069`); moonlight south ×1.36 `[-5,16,9]`, north ×1.26 `[5,16,-9]` (`environment.ts:621-631`) | four broad directionals from four quadrants flatten all form |
| Spot | 1: `rotunda guard spotlight` `[-8.5,2.6,4.5]→[-4,0,1]`, angle 0.5, penumbra 0.6, intensity 2.2, **shadow:true** (`main.ts:1070`) | the only shadow caster (explicit request wins, `index.ts:13180-13191`). It is static in the SW corner. The moon keys cast nothing |
| Rect | 4 softboxes 0.52–0.88 (`environment.ts:676-687`) | emitted as **spot proxies** (report 04) |
| Point | 9 env + 7 room practicals + 6 main = **22** | 0.72–2.8 intensity, range fixed 10 m, `1/d²` falloff |
| Light total | **~31** | `pbr-textured` (every GLB) is capped at 16 direct lights (report 04 §4). The excess is dropped or culled for the museum GLB and characters |
| Contact shadows | `shadows.contact` × 3 | footprint decals, opacity 0.46–0.5 |
| Bloom | `neonBloom({ intensity 0.22, softKnee 0.5, shoulder 0.6 })` | `main.ts:1063` |
| Fog | `fog({ density 0.009, intensity 0.18, #243b59 })` | effectively zero |
| Grade | `colorGrade({ exposure 1.04, contrast 1.06, saturation 1.08 })` | exposure dropped |
| AA | FXAA | — |
| SSAO | no | for an interior, this is the single most important missing cue |
| Text | `text3D(..., backend "sdf")` × 8 | world labels such as "PLAYER", "GUARD 1", "ARCHIVE" |

### 2.4 Primitives versus GLB
- Primitive calls in `main.ts`: box 9, torus 7, cylinder 2.
- Instances: floor-2 slab and 8 walls (9), 4 floor-2 lasers, 16 light-pool discs, exit pad and sign, alarm beacon, visor, thief focus ring, guard rings (2), 4 threat tori, objective ring. That is about 42 primitives.
- `geometry.custom`: 5 in `main.ts` + 11 in `environment.ts`. The environment ones are **hand-written box soup merged into meshes**. `addDetailBox` produces about 200 boxes across 7 merged meshes: architecture, artwork, luminous, floor grid, dark floor, furniture, cover (`environment.ts:42-330`). Patrol tracks and objective frames are also merged boxes.
- GLB nodes: museum 1, thief 1, guards 2, pedestals 3, exhibits 9, floor-1 cases 4, suite cases and exhibits 10, floor-2 cases 3. Total **33**.

### 2.5 Typed assets, measured

| Asset | Tris | UV | Textures | Materials | Notes |
|---|---|---|---|---|---|
| `showcaseRunnerGirl` (**player thief**) | **72** (six 12-tri cuboids) | yes | 1 × 1024² atlas (external URI `Textures/texture-e.png`) | **KHR_materials_unlit** | Kenney blocky character. Unlit, so no lighting or shadow response at all |
| `showcaseExpressiveRobot` (guard-2) | 3,237 | **none** | 0 | 3 flat (grey, orange `#964a0a`, black), roughness 0.9 | animated (Idle/Walking/Running) |
| `robotcand` (guard-1) | 100,612 | yes | 3 | 7, **KHR_materials_pbrSpecularGlossiness** (converted "with limits") | **no clips**, slides along patrol |
| `galleryShiftCutawayMuseumWorld` | 16,776 | yes | **0** | 14 flat-factor (limestone 0.50/0.57/0.62, terrazzo, marble…) | Blender-script world; no albedo, normal, or ORM, so walls and floors are uniform colour fields |
| `galleryShiftPedestal` | **40** | no | 0 | 1 | from `scripts/build-models.mjs` ("flat-shaded and indexed") |
| `galleryShiftDisplayCase` | **24** (two boxes) | no | 0 | base + "glass" (alpha 0.4) | — |
| `galleryShiftExhibitA/B/C` (the treasures) | 284 / 60 / 120 | no | 0 | 1 flat each | the heist objects are a lo-poly orb, a stacked block, and a capsule |
| `galleryThief` (Meshy, 50k, 15 MB) | — | — | 3 | — | **review lens only**, unrigged |

No `material` overrides are applied to the GLBs here. Instead, the route bolts on **box-mesh "identity harnesses"** (shoulder bars, chest plates, visors) in emissive cyan and red over the characters (`main.ts:196-251`, `977-998`, `557-567`) because the source characters "merge into the dark floor".

### 2.6 Lighting rig assessment
31 lights of 0.5–2.8 intensity plus a 1.56 ambient (about 4.9 in three.js units, report 04) gives a uniformly lit, shadowless room. The single shadow is a fixed spot in the south-west wing, aimed away from the main play lane. The localized-encounter system toggles room practicals on and off (`syncLocalizedEncounter`, `main.ts:1462-1495`), but with `I/d²` falloff and a 10 m range, a 0.72–1.1 point at 1.35 m height contributes about 0.4 at the floor directly below, against a π-scaled 1.56 ambient. The stealth fantasy of light pools and darkness is drawn as **emissive floor discs** (`lightPoolNodes`, opacity 0.12–0.20, `main.ts:743-771`), not light.

### 2.7 Camera
`camera.perspective({ position [0, 16.8, 17.2], target [0, 0.6, -0.6], fov 43 })`; review is `[0, 26, 2.5]` at fov 38 (`main.ts:1083-1111`). The camera is static for both floors and **never tracks the thief**. Distance is about 24.6 m and pitch about 46°. A 2.7 m-fit, 72-tri blocky character at 24 m on a 1× DPR canvas is about 100 px tall. There is no damping, zoom, shake, or alert framing.

### 2.8 Animation
- The thief's clips come from the Kenney asset (`idle`, `walk`, `sprint`, `pick-up`; sneak reuses `walk`; `thief.ts:37-46`). It crossfades 0.12 s.
- **The thief never rotates.** `syncCharacterVisuals` calls only `setPosition` for `"thief"` (`main.ts:1355`), and `thief.ts` has no yaw or facing field (`rg "yaw|rotation|angle|facing" thief.ts` returns nothing). The character moonwalks and strafes in every direction while facing the camera's default heading.
- Movement is 8-way digital (`moveX/moveZ ∈ {-1,0,1}`, `main.ts:1833-1834`).
- Guard-1 (Robotcand) has no clips, so it is a rigid statue that translates and yaws. Guard-2 uses real Walking and Running clips.

### 2.9 VFX and juice
- Vision cones are flat triangles: `ALERT_WEDGE_GEOMETRY` is one triangle with emissive 1.9 at 0.8 opacity, and `PATROL_WEDGE_GEOMETRY` is one triangle.
- The LOS beam is an extruded box; lasers are thin emissive boxes; the alarm is a cylinder toggled visible.
- `body.is-alarm` adds CSS red borders.
- There is no flashlight volumetric cone, dust in beams, alarm strobe light, caught slow-mo, or camera punch.

### 2.10 HUD
- A DOM grid with a right column `minmax(188px,214px)` panel (`styles.css:8-15`) and a top banner pill.
- It shows a detection meter, a mission rail, and **developer telemetry in the player HUD**: a "Backend / LOS rays / Occluded / Sensors / Steps" evidence strip (`main.ts:347-351`), and guard rows with `route 12.3m`, `0.85 m/s` (`main.ts:1231-1241`).
- World-space labels "PLAYER", "GUARD 1", "LIFT", and "EXIT" are rendered as 3D SDF text.
- Overall it reads as a debug dashboard.

### 2.11 Audio
`createGameAudio` wrapper with 11 cues from `scripts/build-sfx.mjs` (oscillators plus LCG noise with one-pole LP/HP filters). `ambientHall` loops. Footsteps use one `walk-step` cue for both thief and guards, driven by an authored gait phase. No music, samples, or 3D panning.

### 2.12 Root causes

| Bucket | Cause | Evidence |
|---|---|---|
| C/E | Player is a 72-tri unlit Minecraft-style figure; exhibits, cases, and pedestals are 24–284-tri agent-synthesised GLBs with flat colours and no UVs | §2.5 GLB parse |
| C/E | Museum shell has 14 flat colours and **zero textures**: no marble veining, wood grain, normal, or AO | `galleryShiftCutawayMuseumWorld.d7b2bcd6.glb` |
| B/A | Ambient 1.56 with no IBL, so it looks like a PS1 interior; 4 directionals from 4 sides remove modelling | §2.3 |
| A | 31 lights > 16-light cap on `pbr-textured`; rect lights become spot proxies; 10 m point range | report 04 §3–4 |
| A/B | Only one shadow, from a static corner spot, at 0.32 strength | `main.ts:1070`, `index.ts:13180` |
| A | No real SSAO, so no corner or contact darkening in an architectural interior | report 02 |
| D | Static camera far away; character never faces movement | §2.7–2.8 |
| D | Light pools and stealth darkness are faked with emissive discs | `main.ts:743-771` |
| E | Agents compensated for illegible assets by bolting on emissive box "harnesses", 3D text labels, and rings, which adds visual noise | `main.ts:196-251`, `841-886` |
| E/G | Review mode sets ambient to 0.06 and changes camera, scale (2.7→3.3), and lights: a different art direction from the shipped route | `main.ts:970`, `1067-1072`, `1101-1110` |

### 2.13 Highest-leverage changes
1. Replace the thief with a real rigged, lit (non-unlit) humanoid of ≥5k tris with PBR textures, plus a guard pair. **Add facing**: `setRotation(0, atan2(moveX, moveZ), 0)` with slerp. This is a one-line bug fix with a huge read.
2. Delete both ambients. Add a low-intensity interior HDRI for IBL, warm spot "gallery lights" with shadows on the guard flashlights (cone-following), and dark falloff. Engine: support ≥2 shadow casters or at least a following spot.
3. Re-author the museum with tiling PBR materials (marble, parquet, plaster) with normal and ORM maps; real display-case glass (transmission, or at least an env-reflective alpha with Fresnel); real exhibits (statues, vases, paintings from Poly Haven or Sketchfab CC0).
4. Use a follow camera with damping, slight look-ahead, and alert zoom.
5. Strip the developer telemetry from the HUD and remove the box harnesses and world-text labels once characters are legible.
6. Volumetric flashlight cones (additive cone mesh with noise) and an alarm strobe light.

### 2.14 Scores

| env | assets | materials | lighting | shadows | IBL | post | VFX | animation | camera | HUD | audio | juice |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 1 | 2 | 2 | 1 | 0 | 2 | 2 | 2 | 2 | 3 | 3 | 2 |

### 2.15 Verdict
**Substantial rebuild.** The floor layout, LOS raycasts, detection meter, and guard FSM (`floor.ts`, `vision.ts`, `guard.ts`) are good systems worth keeping. Every visual element should be replaced: characters, museum art, lighting, camera, and HUD.

---

## 3. Deep Recovery (`apps/showcase-deep-recovery`)

### 3.1 Files read
`src/main.ts` (1,090), `environment.ts` (953), `sub.ts`, `reef.ts`, `salvage.ts`, `sonar.ts`, `oxygen.ts`, `deep-audio.ts`, `styles.css`, `index.html` (128), `README.md`, `route-health.json`, `scripts/build-models.mjs`, `scripts/build-sfx.mjs`.

### 3.2 Boot and screenshot harness recipe
- URL: `/apps/showcase-deep-recovery/`; `?capture=review` gives the overhead "salvage chart" lens with a different world.
- Readiness: `window.__DEEP_RECOVERY_EVIDENCE__.status === "ready"`, which requires `frameCount >= 90 && drawCalls > 0` (or the review flag) (`main.ts:909`). The alias is `__AURA3D_SHOWCASE_DEEP_RECOVERY__`. `frameCount` only advances while `gameState === "playing"`.
- Hooks:
  - `__DR_PUMP__(n)` runs the sim only, without rendering.
  - `__DR_CAPTURE_PAUSE__()` pauses, then `stepAsync(0)` renders one frame.
  - `__DR_TELEPORT__(x,y,z)`.
- Inputs: the sub starts at `(0,-6,0)`. Controls are `W` thrust, `A/D` turn, `Q` dive / `E` surface, `Space` sonar ping, `F` grapple, `C` repair.
- Suggested shots:
  - (a) Spawn after ready.
  - (b) Hold `Q`+`W`, `__DR_PUMP__(240)`, press Space, `__DR_PUMP__(15)`, `__DR_CAPTURE_PAUSE__()`: descent with sonar ring.
  - (c) `__DR_TELEPORT__(-5,-12,-8)`, Space, capture: the chapel/wreck basin.

### 3.3 Rendering APIs used versus left unused

| Feature | Used? | Exact config |
|---|---|---|
| Profile / DPR | default `safe-basic`, pixelRatio 1 | `main.ts:478-484` |
| Background | flat `#04141c` | `main.ts:261` |
| IBL | no | — |
| Ambient | `#0b2d35` ×1.18 (review 0.52) | `environment.ts:38-42` |
| Directional | "surface-sunbeams" `[20,35,10]` ×1.92 `#78afb1`; "depth-fill" `[-15,-20,-15]` ×1.65 `#0f5362` (a *from-below* fill) | `environment.ts:43-52` |
| Spot | "sub searchlight" at **fixed world** `[0,-5.4,5.5]→[0,-8,-6]`, angle 0.42, intensity 8, **shadow:true** | `environment.ts:58-69`. Not a runtime node and not moved in `syncVisualNodes`, so the "searchlight" stays at the spawn point. It is the only shadow caster |
| Point | 13 default (+2 review): "sub-headlight-halo" ×7.2 also **fixed** at `[0,-6,5]`; wreck fills 11.5–15.5; chapel practicals 1.8–2.8 | `environment.ts:53-57`, `128-162`, `282`, `838-845` |
| Light total | 16 | exactly the `pbr-textured` cap |
| Bloom | `neonBloom({ 0.16, threshold 0.72, max 0.42, antiBlowout, softKnee 0.5 })` | `main.ts:268-277` |
| Fog | `fog({ density 0.02, intensity 0.42, #0a2e3a })` | about 7% at 20 m with the root mapping (report 02 §fog). Underwater with no real depth falloff |
| **Volumetric fog** | `volumetricFog({ density 0.12, color #1d4b57, intensity 0.38 })` | `main.ts:280-285`. Forces the CPU readback chain every frame; the radial blur is anchored at a fixed UV `[0.5,0.18]`; the authored colour is ignored (report 05 §6.5, report 08) |
| Grade | `colorGrade({ exposure 1.04, contrast 1.1, saturation 1.06 })` | exposure dropped |
| AA | FXAA | — |
| Water | none. No `water.*`, no caustics shader, no god-ray shafts | "caustics" are 5 emissive boxes at 0.1 opacity (`environment.ts:438-462`) |
| Particles | none. "Silt" is 12 spheres glued to fixed offsets **around the sub** that move with it (`main.ts:750-759`); 22 static "particulate" spheres | — |

### 3.4 Primitives versus GLB
- Primitive calls: env 64 (box 21, sphere 26, cylinder 7, torus 10) and main 7.
- Instances in default mode: about **200**, including:
  - mooring chain: 14 cylinders
  - coral spires and caps: 10
  - coral fans and beacons: 8
  - caustic slashes and particulates: 27
  - wreck ribs: 5 boxes
  - vents: 8
  - biocrystals: 5
  - island fragments: 8
  - settlement decks and lamps: 20
  - roof ribs, clerestory, and windows: 13
  - "false stars": 24
  - chart rings and lights: 9
  - route waypoints: 8
  - silt: 12
  - sonar markers: 14
  - sea-floor "plane": a **squashed sphere** `scale [20,0.88,15]` (`environment.ts:109-119`)
- GLB nodes: buoy 1, 5 wreck obstacles (including "reef-spire-1" and "reef-arch-1" rendered with the **same wreck hull GLB**), landmark wreck 1, distant wreck 1, sub 1, 8 crates. Total **17**, all instancing just 4 procedural meshes.

### 3.5 Typed assets, measured (all from `scripts/build-models.mjs`, which "generates high-fidelity CC0 GLB props")

| Asset | Tris | UV | Textures | Shading | Rendered how |
|---|---|---|---|---|---|
| `deepRecoverySub` (hero) | **2,068** | **none** | 0 | `addTriangle` writes per-face normals, so **faceted flat shading** | **override** `material.pbr({ color "#2ab0c0", emissive "#1596a8" ×0.55, metallic 0.46, clearcoat 0.2 })` (`main.ts:352-361`). All 5 authored materials (yellow hull `0.95,0.72,0.08`, glass, lamps, exhaust, dark trim) collapse into one teal emissive tint |
| `deepRecoveryWreckHull` | 1,192 | none | 0 | faceted | as-is ×5; override in review; distant copy override `#5c3b31` |
| `deepRecoveryCrateStandard` / `Heavy` | 232 / 240 | none | 0 | faceted | as-is (review: overridden) |
| `deepRecoveryBuoyBeacon` | 456 | none | 0 | faceted | as-is; review scale **0.001** |

The world is about 110 × 62 × 110 m (`reef.ts:93-100`) of dark water containing roughly 200 primitive props and 4 low-poly faceted meshes.

### 3.6 Camera
`camera.follow({ targetNode "camera-target", offset [6.4, 9.2, -15.4], targetOffset [-2, -3, -5.2], smoothing **0**, fov **62** })`; review is `[4.6,21.8,5.2]` at fov 47 (`main.ts:286-308`). The eye is `target + targetOffset + offset` (`index.ts:15632-15668`), about 19 m behind and above. `smoothing: 0` is a rigid lock with no lag, so turning snaps the whole world. The comment explains that this keeps the evidence harness deterministic (`main.ts:302-305`).

### 3.7 Animation and juice
- None animated: no propeller spin, no idle bob (`sub.ts` integrates pitch and roll, `main.ts:727` applies them), no crate sway beyond the tether integrator.
- The sonar is a flat cylinder scaled outward (`main.ts:800-810`). Contact markers are tori pulsing scale.
- Breach is a red sphere above the sub. Blackout is a modal.
- There are no bubbles, impact shake, hull-damage flashing, or light flicker on breach. The CSS `pulseWarning` keyframe only animates the HUD.

### 3.8 HUD
- A cleaner DOM overlay (`index.html` 128 lines) with `backdrop-filter: blur(12px)` cards, mono telemetry, meters, and a modal.
- This is the best-designed HUD of the three, but it is still a generic web dashboard with no diegetic sonar screen.

### 3.9 Audio
- `DeepAudioController` uses raw `HTMLAudioElement` per cue (`deep-audio.ts:18-40`), not the engine's `createGameAudio`.
- 11 cues are synthesised with `Math.sin`, square, and LCG noise (`build-sfx.mjs:84-165`).
- Ambience is a looped low rumble. There is no spatial audio or underwater filtering, and `sonar-return` is fired by `setTimeout(250)`.

### 3.10 Evidence-gaming surface
`?capture=review` changes:
- lights: ambient 1.18→0.52; points altered up to 12.4; 2 extra review keys
- camera, overhead
- moves about 40 nodes to `z + 100…140`, out of frame (`environment.ts:33`, `119`, `229-268`, `346`, `370-391`, `414-431`, `501`)
- shrinks the buoy to 0.001
- adds a review-only basin, sediment bands, debris, "persistent sonar echo" rings and bearings drawn as static geometry, and override-tinted crates
- `__AURA3D_COMPOSITION_PROBE__.settleSubjectPose()` teleports the sub and fires a ping

### 3.11 Root causes

| Bucket | Cause | Evidence |
|---|---|---|
| C/E | Every GLB is an agent-written per-triangle-normal faceted mesh with no UVs or textures (232–2,068 tris) | `scripts/build-models.mjs:20-35`; GLB parse |
| E | Hero sub's 5 materials flattened to one teal emissive by a `material` override | `main.ts:352-361`, `TypedGLBActor.ts:498` |
| D | World is ~200 primitives: a squashed-sphere seabed, cylinders as coral, boxes as caustics | §3.4 |
| D/E | Underwater "light" faked with emissive on almost every PBR material (rock emissive 0.26–0.46), so the image is uniformly self-lit and flat | `environment.ts:113-118`, `576-604` |
| A | `volumetricFog` is a CPU 8-bit radial blur with a fixed anchor; colour ignored; frame-time collapse | report 05 #7 |
| A/B | No IBL, no depth-graded fog with a real underwater model, no caustics or god rays | §3.3 |
| D | Searchlight and headlight are fixed in world space, not attached to the sub, so the one shadow caster is static | `environment.ts:53-69`; absent from `syncVisualNodes` |
| D | Rigid camera (smoothing 0) | `main.ts:305` |
| E/G | Massive review-lens divergence | §3.10 |

### 3.12 Highest-leverage changes
1. **Attach the headlight and searchlight to the sub** (runtime nodes, updated in `syncVisualNodes`). A moving shadowed cone in murk is *the* underwater look and costs nothing.
2. Replace the sub, wreck, and crates with textured authored assets: a submarine with normal maps, a ship wreck with rust PBR, barnacle decals. Remove the sub override, or make the engine tint multiply.
3. Build a seabed from a heightfield terrain with sand/rock PBR and real rock and coral meshes (instanced) instead of spheres and cylinders.
4. Write an underwater shader stack:
   - exponential depth-and-distance fog with blue-green absorption (in-shader, not the CPU volumetric)
   - a caustics projector (animated texture on the directional, or a decal)
   - screen-space god rays from the surface on the GPU
   - GPU particle marine snow
5. Delete `effects.volumetricFog` until it is a GPU pass.
6. Camera smoothing 0.1–0.2 with look-ahead. Bubble particles on thrust; shake and red flicker on breach.
7. Move audio onto `createGameAudio` with lowpass and reverb sends.

### 3.13 Scores

| env | assets | materials | lighting | shadows | IBL | post | VFX | animation | camera | HUD | audio | juice |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2 | 1 | 1 | 3 | 1 | 0 | 2 | 2 | 1 | 3 | 5 | 3 | 2 |

### 3.14 Verdict
**Substantial rebuild of the world, assets, and atmosphere.** Gameplay modules (`sub.ts`, `sonar.ts`, `salvage.ts`, `oxygen.ts`) and the HUD are reusable. `environment.ts` (953 lines of primitive set dressing, about half of it review-only) should be deleted and replaced.

---

## 4. Cross-game patterns

### 4.1 Capability ladder for what these three games actually touch

E = exists, W = works, P = public API, U = used by these games, D = good defaults, C = composes, M = modern quality, K = agents know to use it, X = examples demonstrate it.

| Capability | E | W | P | U | D | C | M | K | X | Note |
|---|---|---|---|---|---|---|---|---|---|---|
| IBL / environment | ✓ | ~ | ✓ | **✗ (0/3)** | ✗ | ✗ (ambient kills it) | ✗ | ✗ | ✗ | |
| Skybox / background env | ~ | ✗ root | ~ | ✗ | ✗ | — | ✗ | ✗ | ✗ | flat clear colours everywhere |
| Shadows | ✓ | ✓ | ✓ | 3/3 (1 caster each) | ✗ (0.32) | ✗ (one caster, static spots) | ✗ | ~ | ✗ | |
| Material tint on GLB | ✓ | ✓ | ✓ | 2/3 | **✗ (replaces textures)** | ✗ | ✗ | ✗ | ✗ | footgun |
| Particles | ✓ (engine) | ? | ✓ | **✗ (0/3)** | — | — | — | ✗ | ✗ | all VFX are moved primitives |
| volumetricFog | ✓ | CPU | ✓ | 1/3 | ✗ | ✗ | ✗ | ✗ | ✗ | |
| Follow camera smoothing | ✓ | ✓ | ✓ | 1/3, set to 0 | 0.18 default | ~ | ~ | ✗ | ✗ | |
| Character animation | ✓ | ✓ | ✓ | 1/3 | — | ✗ (no facing) | ✗ | ~ | ✗ | |
| Game audio | ✓ | ✓ | ✓ | 2/3 (3rd raw `<audio>`) | — | ✓ | ✗ (synth content) | ✓ | ✗ | |
| Exposure | ✗ (ignored) | — | fake | 3/3 pass it | — | — | — | — | — | |

### 4.2 Authoring anti-patterns seen in all three (bucket E)
1. **Agent-synthesised GLBs promoted as "release"**: procedural scripts (`build-models.mjs`, `build-*.py`) emit low-poly meshes with 32×32 or no textures, which are then registered with `assets add` and labelled `quality: "release"`, `release-validated-typed-primary-asset`. The asset gate validates provenance, hash, bounds, and orientation, never visual fidelity (texel density, tri count, PBR channel presence).
2. **Fixing legibility by adding emissive geometry** (rings, harnesses, labels, beacons) instead of fixing lighting, camera, and assets. The result is neon-diagram noise.
3. **Emissive on base PBR materials** (0.1–0.6) to fight dark scenes, which flattens shading.
4. **A separate `?capture=review` world**, with comments like "the review lens is intentionally larger", "move out of the review lens: z + 120", and composition-probe pose overrides. The evidence pipeline (route-primary probe, foreground pixels, readability score) is satisfied by a staged frame.
5. **Comment bloat**: roughly 50–60% of lines in `main.ts` and `environment.ts` are review-justification prose. That is the trace of iterating against an automated critic.
6. **Ambient-first lighting**: every route starts from `lights.ambient(≈1.2)` and stacks 8–31 weak points. The skills never warn that ambient disables IBL (report 04 #1).

### 4.3 Engine changes these games would immediately benefit from (bucket A/B)
- Make `model({ material })` default to *multiply tint, keep textures*, and require an explicit `replaceTextures: true`.
- Make ambient additive to IBL, and default-on a neutral studio or outdoor env (not cyan) even when ambient is authored.
- Shadow strength default 1.0; support ≥2 shadow casters; CSM on root.
- DPR default `min(devicePixelRatio, 2)`.
- Wire exposure.
- A GPU volumetric/height fog with an underwater preset; GPU god rays.
- Raise the 16-light cap on `pbr-textured`, or implement real clustered lighting for all variants.
- Route rect lights to the area-light integrator.
- An asset gate on visual fidelity: reject a `primaryVehicle` or `primaryCharacter` with <5k tris, no textures, or `KHR_materials_unlit`; flag textures <256 px.

### 4.4 Harness summary

| Game | URL | Ready signal | Steps to a representative frame |
|---|---|---|---|
| Gravity Post | `/apps/showcase-gravity-post/` | `__GRAVITY_POST_EVIDENCE__.rendererMounted === true` | wait 2 s → pointerdown at canvas centre → move (-140,+60) → screenshot (aim + prediction) → pointerup → `__GRAVITY_POST_SIM_STEP__(1/60)` ×120 → `__GRAVITY_POST_CAPTURE__()` (in flight). Keyboard launch does not work |
| Gallery Shift | `/apps/showcase-gallery-shift/` | `__GALLERY_SHIFT_EVIDENCE__.status === "ready"` | keydown `KeyW` → `__GS_PUMP__(120)` → keyup → screenshot. With `?debug=1`: `__GS_TELEPORT__(-7.5,-2.85)`, hold `KeyE`, pump 60 |
| Deep Recovery | `/apps/showcase-deep-recovery/` | `__DEEP_RECOVERY_EVIDENCE__.status === "ready"` | hold `KeyQ`+`KeyW` → `__DR_PUMP__(240)` → press `Space` → `__DR_PUMP__(15)` → `await __DR_CAPTURE_PAUSE__()` → screenshot |

For each, also capture `?capture=review` to document the divergence between the review frame and the player frame.

---

## 5. Score summary

| Game | env | assets | materials | lighting | shadows | IBL | post | VFX | anim | camera | HUD | audio | juice | mean |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Gravity Post | 2 | 3 | 2 | 3 | 1 | 0 | 3 | 2 | 2 | 3 | 4 | 3 | 2 | 2.3 |
| Gallery Shift | 3 | 1 | 2 | 2 | 1 | 0 | 2 | 2 | 2 | 2 | 3 | 3 | 2 | 1.9 |
| Deep Recovery | 2 | 1 | 1 | 3 | 1 | 0 | 2 | 2 | 1 | 3 | 5 | 3 | 2 | 2.0 |

These are preliminary, code-inferred scores, to be corrected against remote screenshots.
