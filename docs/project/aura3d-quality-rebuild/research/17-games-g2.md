# 17 — Games G2 code-level forensic audit

Scope: `apps/showcase-turbo-drift-circuit`, `apps/showcase-skyline-runner`,
`apps/showcase-courier-rush`, `apps/showcase-patrol-wing`.
Branch `aura3d-quality-rebuild/audit`, audited 2026-10-05.

Method: I read the route source (main.ts plus the scene/city/sky/scenery modules),
the engine bridge that turns route nodes into renderer state
(`packages/engine/src/agent-api/index.ts`), the renderer shadow/light paths
(`packages/rendering/src/Renderer.ts`, `ForwardPass.ts`, `LightUniforms.ts`), and
the actual GLB payloads (I parsed the glTF JSON chunk of every model asset these
routes load: triangles, materials, texture channels, image sizes, skins, clips).
I did not launch a browser, Playwright, Vite, or a test suite. Pixel claims below
come from code. Where a claim depends on runtime behaviour I could not observe,
it is marked **(unverified at runtime)**.

All four `G2-NOTES.md` files say the same thing: "Visual QA: NOT RUN
(environment-blocked)… SwiftShader black-canvas". All four `route-health.json`
files say `classification: "prototype-blocked"`, `publicShowcase: false`. So no
human-verified pixel evidence exists for any of these routes in this lane. Courier
and Patrol route-health files are stale (2026-09-02/03, and Patrol's source hash
no longer matches).

---

## 0. Executive findings (cross-game)

These causes apply to all four games and account for most of the "early console"
look. They are listed roughly by how much they change the final pixels.

| # | Root cause | Bucket | Evidence | Effect on pixels |
|---|---|---|---|---|
| X1 | **An ambient light silently turns IBL off.** If a scene has no `environments.*` node but has any `lights.ambient`, the bridge sets `environmentMapIntensity: 0, environmentMapSpecularIntensity: 0`. | A/B | `packages/engine/src/agent-api/index.ts:12693-12707` | Courier, Patrol and Skyline all add an ambient light and no environment, so they get **no specular image-based lighting at all**. Every `metallic`, `clearcoat` and `envMapIntensity` value they author reflects nothing. Metals render as dark flat colour. The PBR materials collapse into flat-shaded diffuse plus a flat ambient term, which is the main "Atari" signature. |
| X2 | **Tone-mapping exposure is hard-coded, and `colorGrade.exposure` does nothing.** The bridge always submits `toneMapping: { exposure: 1, whitePoint: 1, operator: "aces" }`. `effects.colorGrade` forwards only contrast and saturation. The node's own JSDoc says exposure is "recorded… (no native grade target yet)". | A | `index.ts:12898-12910`, `index.ts:3538-3556`, warning at `index.ts:4547` | Every route writes `colorGrade({ exposure: 1.04/1.05 })` and none of them get it. Agents tune scene brightness by over-driving ambient (1.16–1.25) and emissive values instead. The result is a flat, low-contrast, washed frame. Three.js has `renderer.toneMappingExposure` plus AgX/Neutral/ACES operators. Here a route can choose neither. |
| X3 | **Default pixel ratio is 1.** `configureCanvas(canvas, options.pixelRatio ?? profile.pixelRatio ?? devicePixelRatioSafe())`. The default profile `safe-basic` has `pixelRatio: 1`, so `devicePixelRatio` is never reached. | B | `index.ts:11133`, `index.ts:4249-4262`, `index.ts:4312` | Courier, Patrol and Turbo (normal play) render at CSS resolution. On a 2x display that is a quarter of the pixels, upscaled, with FXAA only. Skyline explicitly sets **`pixelRatio: 0.7`** (`skyline main.ts:1879`), which is about 12% of the native pixels on a retina screen. Edges are soft and jaggy. This alone looks one generation old. |
| X4 | **One directional shadow map, fitted to the bounds of every render item; CSM never enabled.** The root shadow options never set `cascadeCount`, and the renderer only uses CSM when `cascadeCount > 1`. Otherwise `createDirectionalShadowMatrix` fits an orthographic frustum to `collectShadowCoverageBounds(items)` over *all* items, including the ground plane. Map size is chosen from a heuristic node-position radius (1024/2048/4096). | A/B | `index.ts:12942-12974`, `Renderer.ts:1387-1398`, `Renderer.ts:1964-1986`, `Renderer.ts:2891-2893` | Turbo's ground box is `SCENE_SIZE*9 ≈ 500` units wide and the car is 0.96 units long. With 4096² that is about 0.14 units/texel, so the car's shadow is a 7×2-texel smudge. In capture mode the route forces `shadowSize: 512` (`turbo main.ts:2993`), about 1.1 units/texel, so the car shadow is **sub-texel and effectively absent**. That is why every route hand-builds "contact shadow" boxes and tori. Three.js routes would use a tight shadow camera or CSM. |
| X5 | **No sky.** None of the four routes uses an HDRI, `sky.dayNight`, or a physical sky. Backgrounds are a flat hex clear colour (`#030711`, `#254760`, `#df967d`, `#050916`) plus stacks of emissive boxes/spheres pretending to be sky bands, haze, sun and moon. | D/E | courier `main.ts:271`; patrol `main.ts:484-501`, `sky.ts:449-459`; skyline `main.ts:1315-1370`; turbo `main.ts:3000` | Unrelated flat backdrops. The environment light, if any, does not match the background. The horizon is a hard edge or a slab. |
| X6 | **`model(asset, { material: { color } })` throws away every texture on the GLB.** The bridge maps any override colour to `tint: { baseColor, replaceSurfaceTextures: true }`. | B/E | `index.ts:13567-13579` | Courier traffic: the Sketchfab sedan (14 PNG textures, BC+N+MR) and hatch (6 textures) render as single-colour lacquer `#e45b74` / `#54c8d9` (`courier main.ts:391-398`). The same happens to the pressure-gate sedan (`city.ts:705-714`) and the parcel (`main.ts:368`). Detailed textured assets are reduced to a solid-colour toy. |
| X7 | **Fog is cosmetic.** Exp² density is clamped to [0,1] and routes pass 0.0018–0.0042. At 60 units, `1-exp(-(0.0018*60)²)` ≈ 1.2% (Courier) and about 6% (Patrol). Turbo's scaled density is 0.0027. | D/E | `index.ts:12733-12759`; courier `main.ts:281`; patrol `main.ts:528`; turbo `main.ts:3375-3382` | No aerial perspective. Distant geometry has the same contrast as near geometry, which flattens depth. |
| X8 | **The world is built from primitives and flat-colour GLBs.** Trees are cylinder+sphere lollipops, crowds are boxes, tyre walls are tori, the city is boxes, clouds are glass spheres, the ocean is one plane. Turbo's track (`turboCircuitEnvironmentV2`, 75k tris, 28 materials) has **zero textures**: the asphalt is a flat colour named "asphalt aggregate variation". | C/D | asset scan in §5; turbo `main.ts:1194-1284` | The low-poly, untextured, uniform-roughness look is exactly the early-3D-console look the owner describes. |
| X9 | **Sprite cards in a 3D world.** Skyline's live player character (`skylineArcticRunnerHero`) is a **4-triangle, 8-vertex textured card** (one 1250×927 PNG). The ice ledges and winter backdrop are cards too. Turbo's `turboAlpineVenueBackdrop` is a card. | C/D | GLB scan §5 | Paper-cutout player and ledges next to a 3D flat-shaded Kenney world and a 3D skinned robot. Style is incoherent, there is no volume, and the "procedural pose" is a rotating card. |
| X10 | **Review-capture forks.** Each route builds a different scene, light rig, camera and post stack for `?capture=review` / `?capture=overview`. Courier swaps the whole city for a bespoke "review east-avenue canyon" set. Turbo adds a venue kit and treeline bands only in capture mode. The flag is referenced 17/18/51/92 times in Courier/Patrol/Skyline/Turbo. | G/E | courier `city.ts:762-773`; turbo `main.ts:3009-3061`, `:3354`; counts from `rg -c` | Evidence screenshots are not the game. Work went into staging a photo set rather than improving the shipped frame. |
| X11 | **All audio is offline-synthesised oscillator/noise WAV.** No sampled audio. Engine loops are never pitch-modulated (no playbackRate/rpm mapping anywhere in the four audio modules). Courier never plays its engine or ambience loop at all. | D | `scripts/build-sfx.mjs` headers in all four; courier `main.ts` cue census in §3.8 | Beeps and buzzes, which reinforce the retro read. |
| X12 | **The primitive budget is gamed through `instances.*`.** Turbo and Skyline route-health report `primitiveStatus.sourceOccurrences: 0`. Turbo actually has 43 `instances.box/sphere/cylinder/torus` calls plus `geometry.custom` puffs. Skyline has 23 primitive calls and 4 instance calls. Courier's `routePrimitiveCount` counts bollard/awning **GLB** nodes as primitives (`city.ts:797,815,822`). | G/E | route-health.json; `rg` counts in §5 | Gates reward re-labelling, not better assets. |

The flip side: a cluster of renderer capabilities that would help exist in the
engine but these games never reach them. That covers HDRI IBL
(`environments.hdri`), CSM, SSR, DoF, motion blur, TAA, volumetric fog and
spot/point shadows, plus a `production` quality profile with `pixelRatio: 1.5`.
Some are gated by defaults the games do not override (X1–X4). The others are
unused by authoring choice.

---

## 1. Turbo Drift Circuit (`apps/showcase-turbo-drift-circuit`)

Size: `src/main.ts` 5,723 lines, `src/generated/game-geometry.ts` 27,868 lines
(generated certified geometry), plus 14 modules (about 8.6k hand-written lines).
Route: `/apps/showcase-turbo-drift-circuit/`.

### 1.1 Engine APIs used, and what is left unused

`createAuraApp` (`main.ts:2981`) with **no `renderer` option**. That means the
`safe-basic` profile and `pixelRatio 1`; capture mode also sets
`pixelRatio: 1, performanceQuality.shadowSize: 512` (`main.ts:2987-2994`).

Scene stack (`main.ts:2999-3420`):

| Feature | Authored value | What actually reaches the renderer |
|---|---|---|
| Environment | `environments.studio({ intensity: 1.24, color: "#ffd0a4" })` (`:3002`) | Procedural **studio** preset (`index.ts:12641`, maps to `createExternalParityEnvironmentLighting("studio")`). An indoor softbox IBL lighting an outdoor circuit. This is the only one of the four games with IBL. |
| Ambient | `lights.ambient({ intensity: 1.16, color "#ffe0c5" })` (`:3383`) | **Ignored.** An authored environment wins and ambient lights are never consulted (`index.ts:12638-12692` returns before the ambient branch). Dead parameter. |
| Key | directional `#ffc18e` 2.7 at `(-0.92,0.38,0.58)*55.5` | Becomes the shadow caster through the legacy slot (no explicit `shadow: true`; `index.ts:13180-13198`). |
| Rim | directional `#c6d9e8` 0.96 | no shadow |
| Points | pit fill 0.42, start red 0.18, green 0.12, apex cyan 0.34, exit amber 0.42 | range 10 each (`index.ts:13233-13248`). At 55-unit scale and intensities this low they are close to invisible. |
| Bloom | `neonBloom({ intensity: 0.34, softKnee: 0.5, shoulder: 0.6 })` (default threshold 0.68, radius 0.48 → 4 px kernel, `index.ts:12791-12795`) | on |
| AO | `ambientOcclusion({ intensity: 0.18, radius 0.48 })` → SSAO kernel 4 px | on |
| Contact AO | `contactOcclusion` (0.28/0.54) | Shadowed by `ambientOcclusion` (`authoredAmbientOcclusion ?? authoredContactOcclusion`, `index.ts:12837`), so it is a **dead node**. |
| Colour grade | exposure 1.05 (**dropped**), contrast 1.07, saturation 1.12 | contrast/saturation only |
| AA | fxaa | FXAA (no TAA, no MSAA path through post) |
| Fog | exp² density 0.028×(5.4/55.518) = **0.00272**, intensity 0.48 (`:3375`) | Under 2% at 50 units, effectively off |
| Tone map | none authored | ACES, exposure 1, whitePoint 1 (fixed) |
| Background | `#df967d` flat salmon (`scenery.ts:39`) | flat clear colour |

Unused: HDRI (`environments.hdri`), `sky.dayNight`, CSM (`cascadeCount`), SSR on
the asphalt, motion blur, DoF, TAA, volumetric fog, the `production` quality
profile and DPR.

### 1.2 Primitive vs authored asset census

`rg` counts in `src/` (excluding generated): `primitives.box` 1, other primitives
1, **`instances.*` 43**, `geometry.custom` 5, `model(` 9.

Instanced primitives make up the set dressing (`main.ts:1194-1284`): crowd
stands are boxes; trees are cylinder trunks plus sphere canopies with warm sphere
"accents"; roadside foliage and shrubs are spheres; tyre walls are tori; log
bundles are boxes; boulders are spheres; meadow flowers are emissive spheres.
Gantries and signage are instanced boxes and cylinders (`:1410-1601`, `:2145-2160`).
Contact shadows, drift ribbons, rear light bars and side markers are boxes
(`:3195-3332`). Smoke is spheres plus custom "billow" meshes (`:3421-3470`) plus
one `effects.particles` fountain (420 particles, `:2612`).

### 1.3 Typed assets and how they render

| Asset | Tris | Materials/textures | Rendered how |
|---|---|---|---|
| `showcaseCc0FormulaRaceCar` (hero) | **5,464** | 1 material, base-colour texture only (no N/MR/AO) | un-tinted, `targetMaxDimension 0.96` |
| `showcaseCcByFormulaOpponent` | 31,176 | 13 materials, 3 BC textures | un-tinted |
| `turboCircuitEnvironmentV2` (the rendered track and venue) | 75,504 | **28 flat materials, 0 textures** (Blender-script generated, `scripts/build-circuit-environment-v2.py`) | Rendered with five node groups hidden (pines, bark, tyre walls, autumn foliage, `main.ts:3117-3133`) |
| `turboFormulaCircuit` ×2 | 4,112 | 9 flat | `visible: false` (contact authority only) |
| `turboHairpinVenueKit` | 3,764 | 13 flat | **capture mode only** (`:3024`) |
| `showcaseTsukubaCircuit` relief | 17,407 | 21 mats, 22 small PNGs (256–1024) | capture only, and disabled (`supplementalTsukubaReliefEnabled = false`, `:621`) |
| `turboAlpineVenueBackdrop` | **4 (card)** | 1 PNG 1536×1024 | capture plus `?venuePlate=1` only |
| ghost | hero car with `material.pbr({ color })` | textures replaced (X6) | translucent tint |

In normal play the whole visible world is one untextured flat-colour GLB plus
instanced lollipop primitives, on a 500-unit box ground plane. The ground's
"normal" is `proceduralTexture("plastic-micro-scratch")` and its roughness map is
`"rubber-roughness"` (`:3076-3077`): plastic-scratch and rubber patterns on grass.

### 1.4 Lighting rig

Summarised above. Two notes. First, IBL is the studio preset tinted `#ffd0a4` at
1.24, so car reflections show studio softboxes, not sky or track. Second, the key
light position scales with `SCENE_SIZE` (`scenery.ts:48`). Shadow caster: key
directional. Map size: `sceneRadius > 30 ? 4096`, where sceneRadius comes from node
`position+scale` (`index.ts:12949-12960`); the ground scale of 500 dominates. In
capture mode it is 512. Strength 0.32, PCF 16 samples, radius 1.5. Ortho bounds
are fitted over all items, including the 500-unit ground (X4). Result: the car's
self and contact shadow is about 7×2 texels in play and sub-texel in capture.

### 1.5 Camera

`camera.follow` chase (`main.ts:2805-2831`). FOV **62** (`:2701`). Distance
`max(heroFraming.distance, CAR_SCENE_HEIGHT*5.2)`, height
`max(heroFraming.height, CAR_SCENE_HEIGHT*2.1)` (`:2669-2670`), smoothing 0.18
(`:2695`). `resolveChaseFraming` targets 18–24% vertical subject occupancy
(`:196`). There is trauma shake (`camera.shake({ decay 1.6, maxOffset 0.14 })`),
punch-in (`fovKick 6, distanceKick 0.45`, `:641-642`), a finish-camera blend and
an off-track nudge. The camera is competent. FOV 62 with a 0.96-unit car makes
the car small; the comments say this was tuned to pass an automated
"composition gate" (`:2696-2700`), not for feel.

### 1.6 VFX and juice

There are drift ribbons (box decals), drift smoke (2 opaque-ish spheres plus N
custom billows plus one particle fountain), boost rings, speed lines
(`turboFeel.speedLines`), trauma shake, punch-in, start lights and a ghost. This
is the most juice of the four games. Code comments document workarounds for
engine limits: "the primitive path carries no alpha" (`:3253-3256`) and
"WebGL particle backend keeps fountain billboards at a small fixed base size"
(`:2615-2618`). **(unverified at runtime)**: the production primitive path does
read `material.opacity` (`index.ts:14521`), so these comments may be stale. Either
way, the agents designed around them.

### 1.7 HUD

DOM `#panel` overlay (`index.html`, `hud.ts` 271 lines, `styles.css` 491 lines).
It has metric pills, lap times and touch controls, set in system Inter. It is a
dashboard look, not diegetic or racing-styled. Raw solver telemetry was kept out
deliberately (`hud.ts:96`).

### 1.8 Audio

`createGameAudio` with buses player/engine/wind/music/ui (`turbo-audio.ts:52-60`).
All WAVs are synthesised by `scripts/build-sfx.mjs` (oscillators and filtered
noise, CC0 "Aura3D synthesis"). The engine is "gated by throttle presence"
(`:123`): on/off, with **no pitch/rpm mapping**. There is a music loop with
ducking.

### 1.9 Root causes

- Engine: X2 (no exposure), X4 (shadow fit and no CSM means no car shadows), X3
  (DPR 1), the IBL preset set (no outdoor/sky preset short of authoring an HDRI),
  and the `ambientOcclusion` vs `contactOcclusion` mutual exclusion.
- Asset: the track/venue GLB has zero textures; the hero car is 5.4k tris with a
  BC-only texture (the opponent is six times richer than the hero); there is no
  textured grass/asphalt/kerb set; trees are not real assets.
- Game: a flat salmon background with no sky; procedural plastic/rubber normals
  on grass; lollipop trees; fog density about 0; a studio IBL for an outdoor scene;
  ambient 1.16 that does nothing.
- Authoring: 92 `visualCaptureCamera` branches. The hairpin venue kit is mounted
  only for capture. Comments like "correctly failed the public composition gate"
  show the camera FOV was tuned to satisfy a gate.

### 1.10 Highest-leverage changes

1. Engine: honour `colorGrade.exposure` (or add `toneMapping: { operator, exposure }`
   to the scene), and default DPR to `min(devicePixelRatio, 2)`.
2. Engine: enable CSM by default for directional casters when the scene radius is
   more than 20× the camera subject size, or fit the single map to the camera
   frustum instead of all items.
3. Asset: replace `turboCircuitEnvironmentV2` with a textured circuit (asphalt
   albedo/normal/roughness, kerb decals, grass), or texture it through UV-mapped
   tiling materials. Replace the lollipop trees with instanced pine/deciduous GLBs.
   Swap the hero to the 31k-tri opponent-quality car or better.
4. Game: an outdoor HDRI through `environments.hdri` (with background) instead of
   `studio` plus a flat `#df967d`; a real fog density (about 0.02 at this scale);
   delete the ambient light.
5. Remove the capture forks so shipped play equals the reviewed frame.

### 1.11 Preliminary code-inferred scores (0–10)

| env | assets | materials | lighting | shadows | IBL | post | VFX | anim | camera | HUD | audio | juice |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 4 | 3 | 4 | 2 | 3 | 4 | 4 | 3 | 6 | 4 | 3 | 6 |

### 1.12 Verdict

**Substantial rebuild of the world/art layer; keep the gameplay.** The
racing/lap/AI/ghost/juice systems are worth keeping. The visible world (track
GLB, scenery, sky, lighting) has to be replaced, and the 5.7k-line main.ts should
shrink once the capture forks go. Polish alone cannot fix an untextured track and
a 5k-tri hero.

### 1.13 Harness recipe

- URL: `/apps/showcase-turbo-drift-circuit/` (the shipped frame; do **not** use
  `?capture=overview`, which is a different scene). Optional `?debug=1` shows the
  diagnostics overlay. `?evidenceDriver=1` runs the scripted acceptance driver
  (autopilot-like); use it to get motion without a human.
- Ready signal: `window.__AURA3D_SHOWCASE_TURBO_DRIFT_CIRCUIT__` (`main.ts:4109`).
  Its `status` starts as `"ready"` (`:3794`) at definition time, before
  `app.ready()`, and later mirrors `raceSnapshot.status` (`:4391`). Wait for a
  canvas plus `status !== "ready"` after input, or for
  `startLightsComplete === true`.
- Inputs: press and hold `W` (throttle) to start the light sequence, which runs
  3 × 1 s steps (`feel.ts:24`). Keep holding `W` for about 4–6 s after GO.
  Hold `A`/`D` plus `Space` for a drift frame. `G` toggles the ghost, `R` resets.

---

## 2. Skyline Runner (`apps/showcase-skyline-runner`)

`src/main.ts` 3,974 lines, plus 19 modules. Route: `/apps/showcase-skyline-runner/`.
The README calls it a five-act side-scroller. `route-health` blockers include
`visual-review-verdict-not-pass:needs-work`.

### 2.1 Engine APIs used, and what is left unused

`createAuraApp` with `renderer: { mode: "production", qualityProfile: "safe-basic", fallback: "safe-basic" }`
and **`pixelRatio: 0.7`** (`main.ts:1875-1879`).

| Feature | Value | Reaches renderer |
|---|---|---|
| Environment | none | Ambient present, so **IBL off** (X1) |
| Ambient | per act, for example act 0 `#91a9bd` 0.36 (`act-palette.ts:57-58`); act 1 0.76 | Becomes flat env diffuse |
| Key | directional per act, for example act 0 `#ffc39d` 1.08 at `(-3,5,4)` | Five directionals mounted (one per act), toggled; the legacy caster slot picks a shadow light |
| Checkpoint point | per act, 0.68–0.75 | |
| `lights.studio({ intensity: 0.86 })` (`:2098`) | key/fill/rim spot proxies | A product-photography rig inside a platformer |
| Hero rim point | `#ffb38e` 1.45 | |
| Bloom | `neonBloom({ intensity: 0.1 })`, 0 in review | Barely on |
| SSAO | `ambientOcclusion({ intensity: 0.2 })` | Kernel `round(0.42*8)=3` px |
| Contact AO | dead node (shadowed by ambientOcclusion) | |
| Colour grade | exposure 1.04 (**dropped**), contrast 1.06, saturation 1.1 | |
| Fog | per act, act 0 density 0.009 / intensity 0.12; acts 1–3 about 0.025 / 0.45 | One fog node per act is mounted, but the bridge uses `nodes.find` for the **first** fog node only (`index.ts:12743`) **(unverified whether act toggling changes which is first)** |
| Background | `#050916` plus box "sky bands" at emissiveIntensity 0.04 | |

Unused: HDRI/IBL, sky, CSM, SSR/DoF/motion blur, DPR above 1.

### 2.2 Primitive vs asset census

`primitives.box` 9, other primitives 14 (tori, capsules and spheres for feedback
markers, pickups, a moon and a contact-shadow torus), `instances.*` 4 (starfield
spheres, ledge underlays), `geometry.custom` 1 (shard gem), `model(` 10. Plus
`game.platformerPresentationSurfaces({ mode: "asset-overlay", guideVisibility: "public" })`
(`:1960-1971`), which overlays flat guide boxes (`platformColor #173353`, trim
`#58e5f4`) on every platform in **normal play**. The source comment admits it
"repaint[s] the authored ledges as a row of pale untextured boxes" and it is
suppressed only in review (`:1952-1959`).

### 2.3 Typed assets and how they render

| Asset | Tris | Material | Role/render |
|---|---|---|---|
| **`skylineArcticRunnerHero`** (live player) | **4 (card)** | 1 PNG 1250×927, BC only | `model(..., targetHeight)` with procedural yaw/lean/sway (`:1785-1795`, `:3488-3494`). `availableClips: []` (`:924-928`). |
| `skylineHeroRunner` (ghost only) | 47,999 | BC+N+MR, 4096/2048 JPEG | Override material `color #21c4df` (textures replaced, X6), opacity 0.62 |
| `skylineHeroMeshyV2` | 80,000 | BC+N+MR | not referenced in src |
| `showcaseKenneyVerdantPlatformerWorld` | 16,060 | 11 flat materials, **0 textures** | primary world, `castShadow: false` |
| `showcaseExpressiveRobot` (sentries) | 3,237, 2 skins / 43 joints, 14 clips | 3 flat | `.animate({ clip: "Standing", loop: true })` |
| `skylineIceLedge{Compact,Medium,Long}` | **4 each (cards)** | PNG strips | lift cards plus review ledges |
| `skylineWinterParallaxBackdrop` | **4 (card)** | PNG 1672×941, scaled `[1, 1.9, 1]` (stretched 1.9× vertically, `:1244`) | backdrop |
| `showcaseTeaHouse` | 118,271 | 76 untextured phong-converted mats | district landmark |
| `propPineTree` | 44,884 | spec-gloss | dressing |

The result is a 2D paper-doll hero and paper ledges on a flat-shaded Kenney world
and an untextured robot, against a stretched painted card. There are three
incompatible art styles in one frame.

Animation: the engine comment at `:3495-3498` says root "does not yet drive skinned
GLB playback". In fact the root path now calls `entry.actor.playClip(...)`
(`index.ts:15119`), so that comment is **stale (unverified at runtime)**. The hero
is a card either way, so it cannot animate.

### 2.4 Lighting

Covered in 2.1. Practically, the world has no textures and no IBL, so lighting is
Lambert-like diffuse plus a flat ambient (0.36 in act 0). Act 0 deliberately goes
"nocturne" (`act-palette.ts:39-45`). Every other act's palette is hand-picked
pastel hex. The studio rig adds frontal spots.

### 2.5 Camera

`skylineCameraTuning(compact)` side-scroll follow with lead and vertical follow.
The review override is distance 3.15, height 0.18, lookAhead 0.62,
targetHeight 0.62, **fov 41** (`:994-1018`). No shake on landing or defeat beyond
the event markers (`feel.ts` has a juice probe). **(unverified)**

### 2.6 VFX and juice

There are nine event "feedback markers": emissive tori, capsules and boxes at
opacity 0.76, shown for 0.36–1.05 s (`:947-983`). Also 21 `runtimeEffects.*` /
particle calls (game.effects pools), a sparkle pool, ember volleys (capsules),
shard gems, a flow ribbon (a box) and a chain ring (a torus). The feedback is
mostly geometric badges, not particles or sprites with motion.

### 2.7 HUD

A DOM `#panel` "runner-panel" overlay, Inter, plus an act title card. The panel
copy includes claim text (`hud.ts:49`). Generic web-app styling, 758 CSS lines.

### 2.8 Audio

Synthesised WAVs (`scripts/build-sfx.mjs`, `Math.random` noise), with per-district
ambience beds (ambienceGrove/Steel/Crown) and a theme. Nine event cues. No dynamic
mixing beyond loops.

### 2.9 Root causes

- Engine: X1 (ambient means no IBL), X2, the X3 default plus the route's 0.7,
  `contactOcclusion` dead when SSAO present, and first-fog-only selection.
- Asset: the **hero is a 2-triangle card**; platforms are cards or flat Kenney
  meshes; no PBR textures on any world surface; the backdrop is a stretched PNG.
- Game: public guide-box overlay on platforms; box sky bands; five act light rigs
  mounted at once; a studio light rig.
- Authoring: 51 review branches (the review lens drops ambient to 0.08 and key to
  0.16 for a "nocturne" that play never shows, `:1396-1401`); a 3.9k-line main.ts
  dominated by evidence plumbing and stale comments.

### 2.10 Highest-leverage changes

1. Replace the card hero with a rigged, animated 3D character (the 48k Meshy
   runner, rigged through the meshy-cli/aura3d-character-animation flow, or a
   Kenney/Quaternius rigged mascot), and drive real clips.
2. Choose one art style. Either full 3D (textured modular platform kit plus a
   parallax 3D background) or a deliberate 2.5D sprite game with consistent cards.
   Do not mix.
3. Remove `pixelRatio: 0.7`, remove the public guide overlay, and remove
   `lights.studio`. Add `environments.hdri` (dusk HDRI) so the materials get
   specular.
4. Swap the box sky bands for an HDRI background or a gradient sky shader.

### 2.11 Scores

| env | assets | materials | lighting | shadows | IBL | post | VFX | anim | camera | HUD | audio | juice |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 3 | 2 | 2 | 3 | 3 | 0 | 3 | 4 | 2 | 5 | 4 | 4 | 4 |

### 2.12 Verdict

**Substantial rebuild of presentation.** The platformer kit wiring, level
layout/acts and sensors are reusable. The hero, world art, sky and lighting are
not salvageable by polish.

### 2.13 Harness recipe

- URL: `/apps/showcase-skyline-runner/` (avoid `?capture=review`). Optional
  `?juiceProbe=1` fires a scripted juice event (`main.ts:122-126`).
- Ready: `window.__AURA3D_SHOWCASE_SKYLINE_RUNNER__` (`:3298`). `status` is
  `"ready"` at definition and switches to `"running"` once the loop runs (`:3526`).
  Wait for `status === "running"`. `window.__AURA3D_SKYLINE_PUMP__` offers
  deterministic stepping (`:3370`).
- Inputs: hold `D`/`ArrowRight` for about 2 s, press `Space`/`W` to jump (an
  airborne frame about 0.3 s after the press), `KeyJ` fires embers, `Shift`/`K`
  dashes, `R` resets.

---

## 3. Courier Rush (`apps/showcase-courier-rush`)

`main.ts` 1,492 lines, `city.ts` 902, `traffic.ts` 453. Route:
`/apps/showcase-courier-rush/`.

### 3.1 Engine APIs used, and what is left unused

`createAuraApp` with no `renderer` option (safe-basic, DPR 1) (`main.ts:264`).

| Feature | Value (`main.ts:270-313`) | Reaches renderer |
|---|---|---|
| Background | `#030711` | flat |
| Environment | none | Ambient present, so **IBL off** (X1) |
| Ambient | `#7f9cb5` **1.25** | Flat env diffuse. A strong uniform lift that kills form. |
| Moon key | directional `#d8f5ff` 2.5 `shadow: true` at (-18,26,8) | Shadow caster |
| City glow fill | directional `#36bdd2` 1.35 | |
| Point lights | 6 in main (1.1–2.1), 8 in `skylineDressingNodes` (1.35–2.15, `city.ts:424-433`), 3 in street signature (2.0–2.3, `city.ts:531-533`), 1 pressure key 4.0 (`city.ts:699`), 3 in review corridor (4.2–5.2) | About 20 direct lights, so the clustered path is used (more than 16, `ForwardPass.ts:251`). Range 10, no shadows. |
| Fog | density **0.0018**, intensity 0.44 | About 1% at 60 units: off |
| Bloom | `neonBloom({ intensity 0.44, quality "balanced", softKnee 0.5, shoulder 0.6 })`, threshold 0.68 | on |
| Grade | exposure 1.05 (dropped), contrast 1.1, saturation 1.12 | |
| AA | fxaa | |

Many materials set `envMapIntensity` 0.7–1.16 and `clearcoat` 0.3–0.56: "wet
asphalt" `roughness 0.24, metallic 0.48, clearcoat 0.56` (`city.ts:100`). With IBL
forced to 0 and no SSR, **none of the wet-road reflections can appear**. The route
fakes them with emissive "road reflection" slivers (`city.ts:238-249`) and
emissive "tyre contact reflection" boxes (`main.ts:443-457`).

Unused: environments/HDRI, SSR (the obvious wet-street tool), point/spot shadows,
CSM, volumetric fog (a natural fit for night haze plus practicals), DoF, motion
blur, TAA, DPR.

### 3.2 Primitive vs asset census

`primitives.box` 39, other primitives 6, `instances.box` 18, `model(` 7, lights 24.
The static world is `city.block({ timeOfDay: "night", blocks: 20 })` scaled 6×
(`city.ts:760,769`). That kit is itself all primitives: a plane plus box roads,
box sidewalks, box curbs, emissive box stripes, cylinder/sphere lamps, instanced
box towers, and **emissive boxes named "visible dark night road evidence"** and
"warm amber streetlight pool" standing in for light pools
(`index.ts:5842-5935`, prefab). On top: 10 box towers with box "windows"
(`city.ts:268-304`), box billboards and posts, 4 box portals, 30 box "rain
traces" (`city.ts:369-387`), box overhead guides, box crosswalk/curb/bay
instancing, a torus zone ring and a cylinder beacon, plus per-frame van
attachments (box headlight "pools", box speed streaks, box tyre contacts, box
livery trim, box bumper, cylinder roof beacon, torus/box impact FX, box traffic
headlights).

### 3.3 Typed assets and how they render

| Asset | Tris | Textures | Render |
|---|---|---|---|
| `courierVanMeshyV2Decimated` (player) | 80,000 | BC+N+MR, 2048 JPEG | un-tinted (good), yaw-only transform, wheels not separate meshes (1 mesh), so no wheel spin, suspension or roll |
| `courierVan` (depot dressing) | 6,963 | 10 PNG 1K | un-tinted |
| `courierTrafficSedan` | 21,556 | 14 PNG (BC/N/MR) | **override `color #e45b74`, textures replaced** (`main.ts:391-398`) |
| `courierTrafficHatch` | 10,101 | 6 PNG | **override `color #54c8d9`, textures replaced** |
| `courierParcel` | 216 | BC+N+MR 1K | override `#f5ad4f`, textures replaced (`main.ts:368`) |
| `courierZoneBollard` | 632 | BC+N+MR | un-tinted |
| `courierZoneAwning` | 466 | N only | un-tinted |

The good assets (Sketchfab textured traffic) are deliberately flattened to
single-colour toys. The van is the only rich asset on screen, and it sits in a
box world with no IBL.

### 3.4 Lighting rig

Night: ambient 1.25 plus two directionals plus about 20 range-10 point lights.
Without IBL every PBR surface is diffuse plus point-light specular highlights. The
ambient of 1.25 flattens all form (the comment at `:299-301` says it was raised
because "street was reading as black-on-black void"). The real fix is lit
emissive windows feeding bloom and an HDRI or night env, not a flat lift. The
shadow map is fitted to the scaled kit (about 120 units) at 4096², so about
0.035 units/texel. Usable for the van, but only the moon casts.

### 3.5 Camera

`camera.follow` with `offset [0.22, 4.45, 9.45]`, `targetOffset [0, 1.22, -1.05]`,
**fov 56**, smoothing 0.12 (`main.ts:237-259`, `van.ts:87-93`). The camera sits
about 10.4 units from a 2.7-unit van, about 25° downward: a high, distant
board-game view that makes the van small and the box city the subject. It has a
drop look-back blend (`chaseOffsetForBlend`). No shake on strike, no speed FOV.

### 3.6 VFX and juice

`game.effects` with `ringShockwave` on drop and `hitSpark` on strike (3 calls
total), a torus/box impact ember, box speed streaks, a pulsing zone ring
(`1 ± 0.05`) and a strike DOM flash. Minimal.

### 3.7 HUD

A DOM `#panel` dispatch card, timer bar, strike pips, combo chip, SVG nav arrow,
radio toasts and touch buttons (`hud.ts:34-65`). Inter, fixed overlay. Readable
but generic.

### 3.8 Audio

Ten synthesised cues. **`engine` and `ambient-city` loops are defined
(`courier-audio.ts:105-106`) but never cued.** The cue census in `main.ts`
(`rg 'playCue\("'`) is dispatch×3, drop, early-bonus, horn, pickup, shift-clear,
shift-fail×2, strike. So the van is silent and the city has no ambience.

### 3.9 Root causes

- Engine: X1 (ambient means IBL zero), so the wet-road and clearcoat intent is
  impossible; X2; X3; `city.block` prefab is primitive boxes with emissive slabs
  faking light pools (an engine default/prefab quality problem); no SSR by default
  for wet scenes.
- Asset: no textured city kit (buildings, road and sidewalk materials).
- Game: textured traffic flattened by colour override; ambient 1.25; fog about 0;
  a distant high camera; about 80 box dressing nodes.
- Authoring: the review fork replaces the city with a hand-built canyon set
  (`city.ts:762-773`), so screenshots never show the shipped city. Comments
  narrate repeated bloom-blob firefighting (`main.ts:282-296`, `:410-418`).

### 3.10 Highest-leverage changes

1. Engine: do not zero IBL when an ambient light is present. Treat ambient as an
   additive term on top of a default environment, or ship a `night-city` IBL
   default.
2. Add `environments.hdri` (night city HDRI) plus `effects.screenSpaceReflections`
   on the road. Drop ambient to about 0.2. Use real fog density (about 0.03) or
   volumetric fog.
3. Remove the colour overrides on traffic (use `tint` without
   `replaceSurfaceTextures`, or none).
4. Replace `city.block` with a textured modular city kit (CC0 Kenney City /
   Quaternius), with emissive window textures.
5. Wire the engine loop with rpm-mapped playback rate and the ambience bed.
6. Pull the camera to about 6 units, about 12°, FOV 60, with speed-FOV and strike
   shake.

### 3.11 Scores

| env | assets | materials | lighting | shadows | IBL | post | VFX | anim | camera | HUD | audio | juice |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2 | 4 | 2 | 3 | 4 | 0 | 4 | 2 | 1 | 3 | 5 | 2 | 2 |

### 3.12 Verdict

**Substantial rebuild of the world.** Dispatch, traffic and the arcade van are
fine (unit-tested). The city must be replaced with real assets and the lighting
redone. Once X1 is fixed in the engine, a polish pass on lighting plus overrides
would visibly help, but the box city caps quality at about 4/10.

### 3.13 Harness recipe

- URL: `/apps/showcase-courier-rush/` (avoid `?capture=review`, a different set).
  `?autopilot=1` drives the authored legs. `?timerScale=` scales timers.
  `?debug=1` shows the overlay.
- Ready: `window.__AURA3D_ROUTE_READY__.ready === true` and
  `document.body.dataset.aura3dReady === "true"` (`main.ts:1483-1490`), plus
  `window.__COURIER_RUSH_EVIDENCE__`. `window.__COURIER_RUSH_DEBUG__.pump(n)` and
  `.present()` give deterministic stepping.
- Inputs: hold `W` for 3–4 s (spawn faces the first dock, `SPAWN_POSE z 18.6
  heading -π/2`). Optionally tap `A`/`D`. With `?autopilot=1` just wait about
  5–8 s. A keydown or pointerdown unlocks audio.

---

## 4. Patrol Wing (`apps/showcase-patrol-wing`)

`main.ts` 1,652 lines, `sky.ts` 868, `flight.ts` 435. Route: `/apps/showcase-patrol-wing/`.

### 4.1 Engine APIs used, and what is left unused

`createGameApp` (a pass-through to `createAuraApp`, `index.ts:11820`). No renderer
option, so safe-basic and DPR 1.

| Feature | Value | Reaches renderer |
|---|---|---|
| Background | `#254760` (`main.ts:520`) | flat |
| Environment | none | Ambient present, so **IBL off** (X1) |
| Ambient | `#b8ced5` 0.56 (`sky.ts:234`) | flat |
| Directionals | day `#ffd0a0` 2.15, dusk `#ff9c66` 1.0, night `#9db8ff` 0.72, toggled per patrol (`sky.ts:235-265`) | none `shadow: true`; a spot light claims the caster slot |
| Spot | landing spot at (0,14,12) to (0,8,0), angle 0.5, distance 60, intensity 3.2, **shadow true** (`main.ts:532`) | The **only** shadow: a perspective cone around the pad. The plane in flight elsewhere casts nothing. |
| Points | sun catch 2.2, aircraft rim 2.3, horizon fill 1.55, pad glow 0.8 | Static positions; they do not follow the plane |
| Fog | density 0.0042, intensity 0.42 | About 6% at 60 units |
| Bloom | `neonBloom({ intensity 0.12, threshold 0.84, maxIntensity 0.34 })` | nearly off |
| Grade | exposure 1.04 (dropped), contrast 1.06, saturation 1.1 | |

Unused: sky/HDRI (a flight game with no sky), water material (`water.*` exists
per skill docs but the ocean is a `material.pbr` plane), CSM, volumetric
clouds/fog, motion blur, DPR.

### 4.2 Primitive vs asset census

`primitives.box` 19, other primitives 12 (spheres, cylinders, tori), `geometry.custom`
2 (island heightfield 40×40 grid and cliff skirt, in sky.ts; the counter missed
these because they are `geometry\n.custom`), `model(` 4 call sites. The world is an
analytic heightfield island with `material.pbr #557a4d` and **no texture, no
splat, no normal detail**; a 40-cell grid over 60 units (1.5-unit facets,
`sky.ts:136-187`); an ocean that is one 90×90 plane, `metallic 0.28 roughness 0.2`,
with no waves, normals or reflection (`sky.ts:329-338`); clouds that are 7
`material.glass` spheres at opacity 0.24 (`sky.ts:304-327`); a sun that is an
emissive sphere (`:450-459`); a radar tower made of cylinders; runway posts and
lights that are cylinders and spheres; "sky ribbons" that are emissive boxes
(`main.ts:484-501`); haze banks that are flattened spheres (`main.ts:462-473`); and
16 floating emissive "speed streak" boxes in the sky (`main.ts:505-518`).

### 4.3 Typed assets and how they render

| Asset | Tris | Textures | Use |
|---|---|---|---|
| `patrolAircraftMeshy` (player) | 60,000 | BC+N+MR (3 images) | un-tinted. Under no IBL the MR channel's metal parts read dark. |
| ghost | same, override `color #9fd8ff` 0.32 opacity | textures replaced | |
| `patrolWingDroneA/B` (enemies) | **108 tris each**, 4 flat materials | none | script-synthesised (`scripts/build-models.mjs`, "flat-shaded, indexed"). The enemies are 108-triangle flat-shaded polyhedra. |
| `patrolWingPadBeacon` | 88 tris, flat | none | pad |
| `patrolWingPlane` | 220 tris | none | registered, not used as hero |
| `propRockA/B`, `propConifer` (38 placements) | 30,006 / 10,596 / 724 | textured | dressing |

### 4.4 Lighting

Covered in 4.1. A golden-hour key at 2.15 with ambient 0.56 and no IBL gives
flat, unshaded water and terrain. There is no sun disc tied to the key direction
(the emissive sun sphere is at (-29,21,-58), while the key comes from (-30,26,18)).

### 4.5 Camera

Chase `offset [0, 2.5, 7.25]`, `targetOffset [0.34, 0.6, -0.7]`, **fov 47**,
smoothing 0.06, `subjectEmphasis 0.82` (`main.ts:433-452`). Cockpit toggle `C`.
No banking camera roll and no speed FOV. A narrow 47° FOV in a flight game reduces
the sense of speed.

### 4.6 VFX and juice

Muzzle flash, impact core, ring and shockwave, debris shards and tracer are all
single emissive primitives teleported into place (`main.ts:397-413`). There are 8
box wake segments, 8 box pressure streaks, 6 box drone exhaust segments, and 8
sphere orbs with box trails. **Zero `effects.particles`/`game.effects` calls**
(census 0). There are no smoke trails, explosion sprites or flipbooks.

### 4.7 HUD

`ui.html` banner plus a result card, and a 276-px right-side glass panel
(`styles.css:79-82`). The panel includes an **"evidence-strip" with "Backend
<code>", "Flight mode authored", "Sensors"** (`main.ts:136-140`): debug/evidence
copy in the player HUD. There is a stat grid, throttle and hull bars, and a full
list of touch buttons.

### 4.8 Audio

Synthesised WAVs; the engine bed is volume-mapped to throttle
(`wing-audio.ts:120-163`) but not pitch-mapped.

### 4.9 Root causes

- Engine: X1, X2, X3; the spot-shadow-only choice means no plane shadow; no
  water/sky defaults.
- Asset: enemies are 108-tri script-generated meshes; the terrain is untextured;
  there is no cloud or sky asset.
- Game: the ocean is a flat plane; glass-sphere clouds; box streaks floating in
  the sky; a narrow FOV; primitive VFX.
- Authoring: an evidence strip in the HUD; review-only geometry (coast beacons,
  `sky.ts:587-605`).

### 4.10 Highest-leverage changes

1. Sky plus IBL: an outdoor HDRI (`environments.hdri`) used as background and
   environment, or `sky.dayNight`. Remove the ambient.
2. Ocean: use the engine `water` surface (or a normal-mapped scrolling water
   material plus SSR or env reflection). The island needs a splat-textured terrain
   (grass/rock/sand by slope and height) at a resolution of 128+.
3. Enemies: real drone GLBs (catalog or Meshy), at least 5k tris, PBR.
4. VFX: particle smoke trails, flipbook explosions (`aura3d-game-art`), tracer
   glow.
5. Camera: FOV 60–70 with speed kick, plus slight roll follow. Remove the
   evidence strip.

### 4.11 Scores

| env | assets | materials | lighting | shadows | IBL | post | VFX | anim | camera | HUD | audio | juice |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 2 | 3 | 2 | 3 | 1 | 0 | 2 | 2 | 3 | 4 | 3 | 3 | 3 |

### 4.12 Verdict

**Substantial rebuild** of environment, enemies and VFX. Keep the flight model,
the ring/sensor layer, patrol grading and the ghost.

### 4.13 Harness recipe

- URL: `/apps/showcase-patrol-wing/` (avoid `?capture=review`).
- Ready: `window.__PATROL_WING_EVIDENCE__`, also exposed as
  `__AURA3D_SHOWCASE_PATROL_WING__` (`main.ts:82-85, 991`); `status: "ready"`
  (`:925`). Deterministic hooks: `window.__PW_PUMP__(frames)`,
  `window.__PW_SCENARIO__("takeoff"|"ring-run"|"drone-pass"|"drone-hit"|"canyon"|"low-hull"|"approach")`
  (`:1017-1190`), `__PW_SHOT__`. Note that scenarios stage the camera and actor.
- Inputs (manual): hold `Shift` (throttle up) for 2–3 s on the pad, then
  hold `S` (pitch up) for about 1 s to lift off, release, and wait 2 s. `Space`
  fires, `C` toggles the cockpit view.

---

## 5. Asset payload scan (GLB JSON chunk parse)

| key | KB | tris | materials | textures |
|---|---|---|---|---|
| courierVanMeshyV2Decimated | 9,509 | 80,000 | 1 BC+N+MR | 3× 2048 JPEG |
| courierTrafficSedan | 8,147 | 21,556 | 8 | 14 PNG (1024/512), **discarded by override** |
| courierTrafficHatch | 3,183 | 10,101 | 3 | 6 PNG, **discarded** |
| courierVan | 3,871 | 6,963 | 9 | 10 PNG |
| courierParcel | 1,141 | 216 | 1 | 3 PNG, **discarded** |
| patrolAircraftMeshy | 19,419 | 60,000 | 1 BC+N+MR | 3 |
| patrolWingDroneA/B | 12 | **108** | 4 flat | 0 |
| patrolWingPadBeacon | 10 | 88 | 3 flat | 0 |
| skylineArcticRunnerHero | 1,338 | **4** | 1 BC | 1 PNG 1250×927 |
| skylineIceLedge* | 220–502 | **4** | 1 BC | 1 PNG |
| skylineWinterParallaxBackdrop | 1,898 | **4** | 1 BC | 1 PNG |
| skylineHeroRunner (ghost) | 20,269 | 47,999 | BC+N+MR | 4096/2048 JPEG, **discarded by override** |
| showcaseKenneyVerdantPlatformerWorld | 1,293 | 16,060 | 11 flat | 0 |
| showcaseExpressiveRobot | 453 | 3,237 | 3 flat | 0 (14 clips, 2 skins) |
| showcaseTeaHouse | 6,131 | 118,271 | ~76 flat (phong-converted) | 0 |
| turboCircuitEnvironmentV2 | 5,024 | 75,504 | 28 flat | **0** |
| turboFormulaCircuit | 346 | 4,112 | 9 flat | 0 (hidden) |
| turboHairpinVenueKit | 317 | 3,764 | 13 flat | 0 (capture-only) |
| turboAlpineVenueBackdrop | 2,070 | **4** | 1 BC | 1 PNG |
| showcaseCc0FormulaRaceCar (hero) | 243 | 5,464 | 1 BC | 1 |
| showcaseCcByFormulaOpponent | 1,732 | 31,176 | 13 | 3 |

Pattern: the "hero" asset is usually the only textured PBR item in frame. Worlds
are flat-colour or primitive. Several premium assets are neutered by override.

---

## 6. Capability ladder for these four games

(Y = yes, P = partial, N = no)

| Capability | exists | works | public API | used by these games | good default | composes | modern quality | agents know | examples show |
|---|---|---|---|---|---|---|---|---|---|
| HDRI IBL (`environments.hdri`) | Y | P (unverified) | Y | **N (0/4)** | N (no env by default; ambient zeroes it) | N (ambient kills it) | ? | N | N |
| Procedural env presets | Y | Y | Y | 1/4 (Turbo `studio`) | N (studio preset outdoors) | P | N | P | N |
| Tone-map exposure | renderer Y | Y | **N** (root hard-codes 1) | N | N | N | N | agents *think* `colorGrade.exposure` works | N |
| Tone-map operator choice | renderer has filmic/aces | Y | N at root | N | ACES only | – | P | N | N |
| Shadows (single map) | Y | Y | Y | 4/4 | P (fit to all items) | N (huge ground ruins it) | N | P | N |
| CSM | Y (`CascadedShadowMaps`) | ? | **N** (root never sets cascadeCount) | N | N | N | – | N | N |
| SSAO | Y | P | Y | 2/4 | kernel px mapping | P (kills contactOcclusion) | P | Y | P |
| Bloom | Y | Y | Y | 4/4 | threshold OK | Y | P | Y (overused, then halved) | Y |
| Fog | Y | Y | Y | 4/4 | N (routes author negligible density) | Y | N | P | N |
| SSR | Y | ? | Y | **0/4** | – | – | – | N | N |
| Particles | Y | P | Y | 1/4 (Turbo) plus game.effects in 2 | small fixed billboard size (per route comment, unverified) | P | N | P | N |
| DPR/hi-res | Y | Y | Y (`pixelRatio`) | N (Skyline sets 0.7) | **N (1)** | – | – | N | N |
| Skinned clips | Y (`playClip`) | P | Y | 1/4 (sentries) | – | – | – | stale belief "not driven" | N |
| Texture-preserving tint | N (colour means replace textures) | – | – | – | N | – | – | N | N |

---

## 7. Comparison to three.js r185 (from knowledge; `node_modules/three` is 0.185.1)

| Concern | three.js r185 common practice | These routes |
|---|---|---|
| Output | `renderer.setPixelRatio(min(devicePixelRatio, 2))`, MSAA or SMAA/TAA | DPR 1 (or 0.7), FXAA |
| Tone map | `ACESFilmic`/`AgX`/`Neutral` plus `toneMappingExposure` | ACES fixed, exposure 1 |
| Environment | `PMREMGenerator.fromScene(RoomEnvironment)` or an RGBE/EXR HDRI as `scene.environment` + `background` | none (3/4) or studio procedural |
| Ambient | rarely used; `HemisphereLight` if anything; never disables env | ambient replaces env |
| Shadows | `shadow.camera` sized to the play area, `PCFSoftShadowMap`/VSM, `CSM` addon for big worlds | one map fitted to all items |
| Sky | `Sky` addon (Preetham) or HDRI background | flat clear colour plus emissive boxes |
| Water | `Water`/`Water2` addon with normal maps plus reflection | flat PBR plane |
| Materials | `MeshStandardMaterial`/`MeshPhysicalMaterial` with full map sets; tinting multiplies `color` with `map` | colour override drops maps |

---

## 8. Fake parity (support appears to exist but does not reach pixels)

1. `effects.colorGrade({ exposure })`: accepted, recorded, warned, never applied
   (`index.ts:3538-3556`, `12905-12910`).
2. `envMapIntensity` and `clearcoat` on materials in any scene with an ambient
   light: IBL is zero (`index.ts:12693-12707`).
3. `effects.contactOcclusion` alongside `effects.ambientOcclusion`: the second is
   discarded (`index.ts:12837`).
4. `lights.ambient` alongside an environment node: ignored (`index.ts:12638-12692`).
5. CSM: implemented in `Renderer.ts:1440-1510` but unreachable from root
   (`cascadeCount` never set, `index.ts:12942-12974`).
6. `neonBloom({ color })`: the colour field is never forwarded to the renderer
   bloom options (`index.ts:12870-12884`).
7. The `safe-basic` profile's `blockedInRoot` lists "production PBR parity,
   postprocess pass chain", yet the routes author post. The labels are metadata
   and do not match actual gating, so agents cannot tell what is real
   (`index.ts:4249-4262`).
8. route-health `primitiveStatus.sourceOccurrences: 0` for Turbo and Skyline while
   both are primitive-heavy through `instances.*`.
9. Courier `primitiveCount` counts GLB bollard/awning nodes as primitives.
10. Review-capture scenes (`?capture=review|overview`) that differ structurally
    from the shipped scene.
11. "Wet asphalt" and "road reflections" in Courier: emissive slivers, not
    reflection.

---

## 9. Consolidated recommendations (highest leverage first)

1. **Engine defaults (B):** (a) never zero IBL because an ambient light exists;
   add a sensible default env per scene category. (b) Expose tone-map
   operator/exposure and honour `colorGrade.exposure`. (c) Default DPR to
   `min(devicePixelRatio, 2)`. (d) Fit directional shadows to the camera frustum
   and enable CSM for large scenes by default. (e) Make tinting multiply base
   colour, keeping maps, with an explicit `replaceTextures` opt-in.
2. **Asset pipeline (C):** a textured, modular environment kit per genre (circuit,
   city, island terrain, platformer), real enemy and hero meshes, and a rule that
   no 4-tri card may be a primary character.
3. **Game rebuilds (D):** HDRI sky plus env per route, real fog, SSR for
   wet/water, particle VFX, camera FOV/speed feel, engine audio with pitch, and
   removal of ambient-lift hacks.
4. **Authoring/evidence (E/G):** ban capture-only scene forks; make route-health
   count `instances.*` and `geometry.custom` as primitives; stop putting evidence
   copy in player HUDs; make the skill docs say explicitly "add
   `environments.hdri`; do not add `lights.ambient`".
