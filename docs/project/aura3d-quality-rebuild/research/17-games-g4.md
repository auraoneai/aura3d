# 17 — Games group 4: Blockfall Reactor, Neon Swarm, Pulse Tunnel, Aurora Lander

Branch `aura3d-quality-rebuild/audit`. Scope: `apps/showcase-blockfall-reactor`, `apps/showcase-neon-swarm`,
`apps/showcase-pulse-tunnel`, `apps/showcase-aurora-lander`, the GLBs they load, and the engine code paths
they reach (`packages/engine/src/agent-api/index.ts`, `GameRuntime.ts`, `production-runtime/TypedGLBActor.ts`,
`packages/assets/src/GLTFRenderResources.ts`).

Method: I read the shipped `src/*.ts` scene construction, the material and light literals, and the runtime
update loops. I parsed every loaded GLB with a small node script that reads the JSON chunk, embedded image
headers, and samplers (`/tmp/glbinfo.mjs`, `/tmp/glbimg.mjs`, not committed). I also ran the existing
read-only audit `node tools/showcase-library/game-capture-parity.mjs`, with no `--json`, so no file was
written. I did not run a browser, dev server, build, or test suite. Every score below is inferred from code
and will be corrected later by screenshots.

Cross-references for engine behavior I did not re-derive here: `04-lighting-ibl-shadows.md` (ambient turns
off IBL, shadow strength 0.32, point range = 10 × scale) and `05-postfx-aa-tonemap-color.md` (DPR 1,
"FXAA" is a 4-tap cross blur, `colorGrade.exposure` is dropped, bloom knee 0.5 plus ×7 gain). When I cite
those effects below, I checked that the game actually hits the triggering configuration.

---

## 0. Executive summary

These four games are not held back by one missing feature. Six compounding failures produce the
"Atari / early-Nintendo" read, and only two of them are renderer bugs.

1. **The "authored GLB assets" are mostly flat image cards.** Of the 11 distinct model assets these routes
   load, 7 are either a 4-triangle unlit quad wrapping an AI-generated PNG (Blockfall arena, mechanic, and
   rival; Neon arena, courier, and moth; Aurora bay and lander) or agent-scripted primitive kitbashes
   (Pulse runner, sentry, and world; Aurora probe and beacon; the Mech Hangar weapon reused by Neon).
   `generated/*.glb` all report `verts=8 tris=4`, `KHR_materials_unlit`, and generator "deterministic
   review-art builder". Only three real third-party meshes reach play: the Blockfall cabinet (3.4k tris,
   whose "GAME OVER" marquee is covered by primitive boxes), the Neon barricade, and the Neon street lamp
   (272k tris, 16 MB, placed at the arena corners and mostly off camera).
2. **Pulse Tunnel's textures are pixel art by construction.** The Blender builder writes 128×128 panel PNGs
   and sets `image_node.interpolation = "Closest"`
   (`showcase-pulse-tunnel/scripts/build-encounter-finish-v11.py:89,105`). The GLBs carry sampler
   `magFilter 9728 / minFilter 9984` (NEAREST / NEAREST_MIPMAP_NEAREST). The engine honors it
   (`packages/assets/src/GLTFLoader.ts:1700-1711`, `GLTFRenderResources.ts:2196-2213`). Every textured hull
   is literally point-sampled 16-px panel cells.
3. **No game uses IBL, and every game turns it off.** All four call `lights.ambient()`, and none adds an
   `environments.*` node (zero matches across the four `src/` trees). Per 04 §0.1 that sets
   `environmentMapIntensity: 0`. Meanwhile the asset and material literals are heavily metallic: Pulse
   hulls use metallic 0.72–0.92, Blockfall rails 0.78–0.82, tetrominoes 0.24–0.30. Without an environment
   these render as black or flat plastic. Agents then compensate with 9–17 point lights per scene.
4. **Primitive geometry is the world.** I estimate about 460 primitive or instanced nodes in Blockfall,
   about 250 in Pulse, about 150 in Aurora, and about 70 in Neon (§5 table), against 0–3 real meshes in
   frame. Primitives use 12×16 spheres, 24-segment cylinders whose caps share radial normals, and a
   hard-coded thin torus (`tubeRadius 0.045`, `index.ts:17440-17475`). Custom geometry gets averaged
   per-vertex normals (`calculateCustomGeometryNormals`, `index.ts:15006-15017`), so Blockfall's
   "chamfered jewel" tile and Neon's faceted enemies shade as soft pillows instead of crisp facets.
5. **The evidence system shoots a different game from the one people play.** All four games build a
   different world under `?capture=review`. Pulse hides the whole tunnel, track, rocks, and backdrop, then
   adds 15 review-only builder arrays, 3 particle systems, and 7 lights that are 0 in play. Neon swaps the
   3D courier for an image card, removes every directional and ambient light, and adds 48 image-card
   moths. Blockfall hides the arcade room and changes camera and backdrop scale. The repo's own tool counts
   **ART-class drift branches: Pulse 24, Blockfall 8, Neon 4, Aurora 1**
   (`tools/showcase-library/game-capture-parity.mjs`). `check:capture-parity --fail-on-art` exists in
   `package.json:691`, but nothing in `.github/` wires it. Thumbnails use `?capture=review` for Blockfall
   (`tests/browser/showcase-game-thumbnails.spec.ts:57`).
6. **Juice is largely declared, not rendered.** In Neon Swarm, `cameraDirector.update()` is computed and
   then discarded (`main.ts:1667-1671`, `void cameraState;`). `combatFeel.cameraPunch()` is a no-op
   (`combat-feel.ts:133-137`, `void intensity;`). Seven `gameEffects.spawn(...)` calls
   (`main.ts:1148-1627`) feed a pure-data pool whose `update()` and `nodes()` are never called. Those
   shockwaves, flashes, dash trails, and aura bursts produce zero pixels. The engine has no runtime
   add-node API (`AuraRuntimeNodeRegistry` is get/require/has/ids/all only, `index.ts:10664-10670`), so
   `game.effects.nodes()` cannot be used without a full `setScene`. That is why every game pre-allocates
   FX as hidden primitives parked at y = -50 or -8.

Other high-impact game-level defects:

- Pulse Tunnel's camera is static (`main.ts:1589-1591`, never updated) and the world never scrolls. Only
  gates move. A runner with no camera motion and no parallax cannot convey speed.
- Neon's gameplay courier is a Sketchfab low-poly man with 3 unlit flat materials, re-tinted to one flat
  `#214f68` color by `model(..., { material })`. That option sets `replaceSurfaceTextures: true`
  (`index.ts:13567-13579`, `TypedGLBActor.ts:496-507`).
- Aurora's whole planet is a 96 m × 96 m untextured heightfield (65 × 65 grid at 1.5 m) in one roughness
  0.94 color, floating in a flat `#16283f` clear color. The aurora is opaque emissive boxes, because
  translucent emissive "contributed no light at all" (`aurora main.ts:563-566`, an engine transparency
  defect documented by the agent in a code comment).
- All audio is offline oscillator and noise synthesis (each `build-sfx.mjs` header says "No ... sampled
  material: every cue is synthesized from oscillators / noise"). That reinforces the chiptune era read.

**Verdicts:** Blockfall: save through polish, conditional on engine IBL, normals, and DPR fixes. Aurora:
save through polish plus an art pass. Neon Swarm: substantial presentation rebuild. Pulse Tunnel:
substantial rebuild (camera, world motion, assets).

---

## 1. Reaching a representative gameplay frame (remote screenshot harness)

| Game | Route | Boot / start | Inputs to representative frame | Query params | Readiness / evidence global |
|---|---|---|---|---|---|
| Blockfall Reactor | `/apps/showcase-blockfall-reactor/` | Boots straight into play. Attract mode starts only after 45 s idle. | A/D move, W/X/E rotate CW, Z/Q CCW, S soft drop, Space hard drop, C/Shift hold, P pause. A good frame: 5–6 hard drops (D, D, W, Space loop), then a soft drop. Shoot 60 ms after Space for lock FX. | `?capture=review` (different world, see §6), `?debug=1` (evidence overlay) | `window.__AURA3D_SHOWCASE_BLOCKFALL_REACTOR__`. Also `__AURA3D_BLOCKFALL_ACCEPTANCE_PROBE__.apply("quad" \| "single-clear" \| "level-up" \| "danger" \| "game-over")` stages exact beats deterministically, which is the best way to get a line-clear frame. |
| Neon Swarm | `/apps/showcase-neon-swarm/` | 3.2 s intermission (`INTERMISSION_FIRST_SECONDS`), then wave 1 auto-starts. | Hold J (fire), circle with WASD 4–6 s, wait for `kills > 0`. Space/K burst when charged, Shift dash. | `?capture=review` (different world) | `window.__NEON_SWARM_EVIDENCE__` (`.kills`, wave state) |
| Pulse Tunnel | `/apps/showcase-pulse-tunnel/` | Mounts in state `ready`. The first Space starts the run. | Space, wait ~2 s, then A/D lane, W jump, S slide. The finale (sentry, reactor world, rain) appears only in the `finale` section (`main.ts:2147`), so a ~90 s run is needed to see typed world assets in play. | `?capture=review` (different world, 24 ART branches), `?arena=candidate` (Meshy arena) | `window.__PULSE_TUNNEL_EVIDENCE__` (`.score`, section) |
| Aurora Lander | `/apps/showcase-aurora-lander/` | Phase `flying` at t=0. The probe falls untouched, so thrust immediately. | Hold W ~2 s, then pulse W+D. Touchdown or crash within ~7 s. G ghost, R restart, Space quick restart. | `?drop=1` (spawn 26 m above pad, zero velocity), `?drop=hard`, `?approach=…` (close approach), `?site=N`, `?capture=review` | `window.__AURORA_LANDER_EVIDENCE__` and `window.__AURA3D_SHOWCASE_AURORA_LANDER__` (both defined, `main.ts:397,401`). `.state` / `.phase` |

Harness recommendation: capture **both** the default URL and `?capture=review` for every game. The diff
between them is the single most informative artifact for this autopsy (§6).

---

## 2. Engine defaults these four games inherit

None of the four sets `pixelRatio`, a render profile, tone mapping, an environment, or a shadow config. All
mount through `createAuraApp` / `createGameApp` with only `diagnostics` and `physics` options
(`blockfall main.ts:661-670`, `neon main.ts:934-941`, `pulse main.ts:1369-1598`, `aurora main.ts:956-963`).

| Default reached | Value | Where | Effect in these games |
|---|---|---|---|
| Pixel ratio | profile constant 1.0 (safe-basic) | 05 §0.1 | Half-res on retina. All four also enable `effects.antiAlias({mode:"fxaa"})`, which is a cross blur (05 §0.2). |
| IBL | off when `lights.ambient` exists and there is no `environments.*` | 04 §0.1 | All four. Metals go black and dielectrics lose Fresnel. |
| Ambient scale | about π× three.js | 04 §0.2 | Neon ambient `#475569 @1.05`, Pulse `#1e1b4b @1.2`, Blockfall `#e0c5ff @0.58`, Aurora `#67e8f9 @0.4`. These are flat washes. Aurora's cyan ambient tints the whole regolith. |
| Shadow caster | one light: explicit `shadow:true`, else highest-priority/intensity directional | `index.ts:13172-13199` | Blockfall: "overhead arcade key" 1.05. Neon: "cyber-key-light" 2.0. Pulse: "corridor sun" 1.6 (in review mode it becomes the review fill, 1.18). Aurora: "moonlight key" 2.35, explicit. |
| Shadow strength | 0.32 (games) | `index.ts:12966-12968` | A fully shadowed pixel keeps 68% of the key light. three.js `LightShadow.intensity = 1`. |
| Shadow map size | from scene radius computed over **all** node positions (`index.ts:12949-12960`) | | Hidden FX pools parked at y=-50 (Blockfall, Aurora) and Aurora's planet at z=-196 inflate the radius. Per 04 §0.8 the ortho map is fit to whole-scene bounds, so texel density on the play area drops. I did not confirm whether hidden nodes enter the per-frame fit bounds; verify. |
| Tone map | ACES, exposure fixed at 1 | 05 §0.5 | Every game passes `colorGrade({exposure:1.05–1.06})`. It is silently dropped. |
| Bloom | knee 0.5 + "balanced" gain | 05 §0.3 | All four pass `softKnee: 0.5, quality: "balanced"`. Pulse gameplay `neonBloom intensity 0.82` gives a milky haze over the dark purple tunnel. |
| SSAO | depth-raw, effectively zero beyond ~1.5 m | 05 §0.4 | Blockfall `ambientOcclusion {0.46, 0.68}` and Neon `{0.34, 0.68}` pay for AO and get none. `contactOcclusion` is counted by node name (04 §0.9). |
| Primitive tessellation | sphere 12×16, cylinder 24 seg with cap normals shared with side verts, torus fixed tube 0.045 | `index.ts:17361-17475` | Aurora planet sphere at scale 15 shows visible facets. Cylinder caps (Pulse spires, Aurora beams, Blockfall reactor tube) shade with radial normals. Torus rings can only be thickened by non-uniform scale, which distorts normals. |
| Custom geometry normals | averaged per shared vertex | `index.ts:15006-15017` | Blockfall jewel tiles and Neon threat discs lose their facets (§3.1, §3.2). |
| Model material override | replaces all surface textures with one tint | `index.ts:13567-13579`, `TypedGLBActor.ts:477-507` | Neon courier (gameplay) and Aurora ghost. The tint path never sets opacity, so the Aurora "ghost translucency" `opacity: 0.32` (`aurora main.ts:769`) does not apply. The ghost renders as an opaque flat `#7dd3fc` probe. |
| Runtime node creation | none after mount (`AuraRuntimeNodeRegistry`, `index.ts:10664-10670`) | | Forces pre-allocated hidden pools for every FX, so pool sizes are small (10 sparks in Pulse, 12 dust puffs in Aurora). |

---

## 3. Per-game forensic

### 3.1 Blockfall Reactor

Files: `src/main.ts` (2374 lines), `src/reactor-scene.ts` (691), `src/board-view.ts` (390),
`src/clear-fx.ts` (192), `src/camera-feel.ts` (107), `src/reactor-audio.ts`, `src/styles.css` (555).
21 commits, 2026-07-01 → 2026-09-22.

**(1) Engine APIs used and left unused**

- Used: `createGameApp`, `scene().background("#24103a")`, `model()` ×7, `primitives.box/torus/cylinder/sphere`,
  `instances.box/sphere/torus/custom`, `geometry.custom/define`, `text3D` (scoreboard digits),
  `effects.neonBloom`, `ambientOcclusion`, `contactOcclusion`, `fog`, `colorGrade`, `antiAlias(fxaa)`,
  `lights.ambient/directional/point`, `camera.perspective`, `game.fallingBlocks`, `game.input`,
  `createGameAudio`.
- Exact post config (`main.ts:508-517, 645-650`): `neonBloom { intensity 0.26 (0.12 reduced), threshold
  0.55, maxIntensity 1.6, antiBlowout, quality "balanced", softKnee 0.5, shoulder 0.6 }`,
  `ambientOcclusion { intensity 0.46, radius 0.68 }`, `contactOcclusion { 0.34, 0.5 }`,
  `fog { density 0.028, color #0d0514, intensity 0.3 }`,
  `colorGrade { exposure 1.05, contrast 1.07, saturation 1.1 }` (exposure dropped), `antiAlias fxaa`.
- Unused: `environments.*` / IBL, explicit `shadow:true`, CSM, pixel ratio, `game.effects`,
  `game.cameraDirector`, `effects.particles`, `sky.*`, any texture on primitives, any animation
  controller.

**(2) Primitive vs. asset counts (gameplay, non-review)**

| Source | Nodes | Notes |
|---|---|---|
| `createLockedBlockNodes` | **200** `primitives.box` | Legacy per-cell nodes kept mounted (hidden) only so a boot probe can A/B draw calls (`main.ts:763-826`). |
| Board shell | ~20 nodes + **32** grid-line boxes | `reactor-scene.ts:371-513` |
| Arcade room | 16 nodes (12 instanced groups, about 90 instances) | Floor, wall, "neighbouring cabinets" (boxes), spectator spheres ×48, tier bands, floor tiles, podium boxes, braces, beacons (`reactor-scene.ts:167-369`) |
| Active / ghost / flash / beat / reactor | 4 + 4 + 20 + 4 + 10 | |
| Instanced tile pools | 8 (`instances.custom`) | 7 locked kinds × 48 + 1 active ×4 |
| Clear FX shards | **48** boxes | `clear-fx.ts:15,46-60`; size 0.026 world units |
| Scoreboard | ~80 `text3D` digit nodes | One node per digit per slot (`main.ts:834-846`) |
| Quad celebration | 10 | Word mesh, 6 tori, 3 spheres |
| **Total primitives / instanced / text** | **~460** | `route-health.json` reports `primitiveStatus.sourceOccurrences = 42 / budget 40`. It counts source lines, not nodes, so the budget is meaningless. |
| `model()` nodes | 7 | Cabinet ×1; arena card ×1; mechanic card ×2 and rival card ×2 (one pair parked at y=-50 for quad) |

**(3) Typed assets and how they render**

| Asset | Real content (parsed) | Render treatment |
|---|---|---|
| `showcaseBlockfallCabinet` (`public/aura-assets/showcaseBlockfallCabinet.679d52fe.glb`) | Sketchfab, 1 mesh, 3,693 v / 3,426 tris, 1 material with base, MR, normal, and emissive maps at 1024² | Rendered as authored, but the baked marquee reads "GAME OVER / RESTART?", so the route covers it with a box "live-session marquee plate" plus a custom "LIVE" word mesh and a header shroud box (`main.ts:548-567`, `reactor-scene.ts:457-465`). Placed behind the board at (-2.8, 0.42, -2.15), rotated -90°, so the playfield box occludes the hero cabinet. |
| `blockfallReactorArenaBackdrop` (`generated/blockfallReactorArena.glb`) | **8 v / 4 tris quad**, `KHR_materials_unlit`, one 1586×992 PNG | Fit to height 8.25 at z=-3.52 as `role: "primaryWorld"`. It is a painting behind the room's own box wall (wall at z=-3.6, card at -3.52). |
| `blockfallReactorMechanicHero` | 4-tri unlit alpha-MASK card, 1024×1536 PNG | "Mascots" standing on the floor with `castShadow: true`. A flat cutout casting a card-shaped shadow. |
| `blockfallReactorPlasmaRival` | 4-tri unlit alpha-MASK card, 1214×1295 PNG | Same |

No material overrides on models. The PNG cards are drawn unlit, so they ignore every light in the scene
and visibly do not belong to the lit primitive room.

**(4) Lighting rig** (`main.ts:651-657`; review values in parentheses)

| Light | Type | Color | Intensity | Position | Shadow |
|---|---|---|---|---|---|
| low arcade room wash | ambient | `#e0c5ff` | 0.58 (0.82) | n/a | n/a |
| overhead arcade key | directional | `#fff5dd` | 1.05 | (-1.2, 6.4, 4.2) | auto-selected caster, strength 0.32 |
| reactor green bounce | point | `#74ff91` | 1.28 (0.72 reduced) | (2.4, 2.1, 2.6) | no |
| magenta arcade rim | point | `#ff42c8` | 1.18 (1.68) | (-2.15, 3.3, 1.35) | no |
| cyan playfield spill | point | `#8ff7ff` | 1.42 (1.82) | (0, 2.5, 1.55) | no |
| warm floor practical | point | `#ffc15b` | 0.42 (0.76) | (0, -0.45, 0.9) | no |
| rival corner practical | point | `#ff72c9` | 0.68 (1.34) | (3.35, 1.35, 1.15) | no |

There is one weak key against five colored points and a π-scaled lavender ambient. With IBL off, the
roughness 0.2 tetrominoes (`reactor-scene.ts:30-38`, metallic 0.24–0.30) get only point-light specular
dots. Their metallic fraction removes diffuse without returning any reflection, and emissive 0.18–0.20
carries most of the color, so the result reads as matte toy blocks.

**(5) Camera** (`main.ts:479-489`): perspective, `position [0, 1.86, 8.45]`, `target [0, 1.82, 0.12]`,
**fov 32** desktop (33 review, 54 compact ≤620 px). Static, except `camera-feel.ts` punches on quad and
level-up (0.34 s damped offset, disabled under reduced motion). It is a dead-on orthographic-feeling
front view. The narrow FOV flattens all depth, so the 3D room reads as a backdrop poster.

**(6) VFX and juice**: line-clear shards (10–14 of 48 pooled boxes, 0.55 s life, about 2.6 cm cubes), a
clear-wave torus, row flash boxes, a level-up band, a game-over wash, a quad word with 6 rings and 3
jewels, a camera punch, and bloom 0.26. Hard drop gets only an audio cue (`main.ts:1214`). There is no
squash, no trail, no lock-flash per cell, no screen-space flash, and no particles API use.

**(7) HUD**: DOM overlay (`styles.css`: Inter/system and ui-monospace stacks, 7 box-shadows, 6
clip-paths, `backdrop-filter: blur(16px)`). There is also an in-world scoreboard of 80 pre-built text3D
digit nodes. This is the most deliberate HUD of the four, but it uses system fonts and no art.

**(8) Audio**: `createGameAudio` with a typed WAV manifest: 9 SFX, a hum loop, and 4 additive stems
(1.41 MB each, about 16 s mono 44.1 kHz). All are synthesized by `scripts/build-sfx.mjs` from
oscillators and noise. Stem layering per five levels is a good system with chiptune-grade content.

**(9) Root causes**

- Engine: IBL off via ambient; ambient π-scale; shadow 0.32; DPR 1 + blur FXAA; averaged normals destroy
  the bevel tile's facets (`reactor-scene.ts:44-58` shares the front ring between face and bevel, so the
  front-face normals tilt about 45° toward the sides); AO is a no-op; exposure dropped.
- Game: narrow-FOV straight-on camera; the hero cabinet is placed behind the board and its marquee
  covered; about 200 hidden legacy boxes exist for telemetry; the room is boxes and spheres.
- Asset: 3 of 4 "release" models are unlit AI-image quads; the real cabinet has wrong baked text.
- Authoring: agents optimized measured metrics such as luminance below 45, "well occupancy %"
  (`main.ts:434-444`), and draw-call A/B. Comments repeatedly raise material values to escape the "void"
  measurement (`reactor-scene.ts:94-99`) instead of adding an environment.

**(10) Highest-leverage changes**

1. Add `environments.*` (an HDR studio or arcade interior) and drop `lights.ambient`. Tetromino and rail
   metals then get reflections.
2. Fix custom-geometry normals (flat per-face option, or split vertices in `BLOCK_TILE_GEOMETRY`) so the
   jewel bevel catches light.
3. Replace the 3 image cards with real meshes: an arcade interior kit, and either rigged mascots or none.
   Re-texture or replace the cabinet so its marquee does not need occluder boxes.
4. Use a camera at fov 40–50 with a slight 3/4 yaw and slow idle drift so the room has parallax.
5. Delete the 200 `createLockedBlockNodes` boxes and the per-cell A/B probe.
6. Add a lock flash per cell, hard-drop trails and dust, and a particle burst on clear via a real
   particles API.

**(11) Code-inferred scores (0–10)**: environment 3 · assets 3 · materials 3 · lighting 3 · shadows 2 ·
IBL 0 · post 3 · VFX 3 · animation 2 · camera 3 · HUD 5 · audio 4 · juice 4.

**(12) Verdict: save through polish.** Gameplay, the instanced tile pools, the audio system, and the HUD
are sound. Most of the visual deficit is engine defaults (IBL, normals, DPR, AA) plus replacing the
cards.

---

### 3.2 Neon Swarm

Files: `src/main.ts` (2054), `swarm.ts` (628), `hud.ts` (256), `player.ts`, `combat-feel.ts` (150),
`environment.ts` (117), `arena.ts` (115), `swarm-audio.ts`, `styles.css` (366). 9 commits.

**(1) Engine APIs used and left unused**

- Used: `createAuraApp`, `model()`, `primitives.*`, `instances.box/sphere/custom`, `geometry.define`,
  `distanceLod`, `effects.bloom`, `ambientOcclusion`, `contactOcclusion`, `fog`, `colorGrade`,
  `antiAlias(fxaa)`, `lights.*`, `camera.follow`, `game.input`, `game.cameraDirector`, `game.effects`.
- Post (`main.ts:903-914`): `fog { density 0.02, color #070a14 }`; AO `{0.34, 0.68}` (review
  `{0.52, 0.82}`); `contactOcclusion {0.34, 0.5}`; `bloom { intensity 0.42, color #35e6ff, balanced,
  softKnee 0.5, shoulder 0.6 }` (skipped under reduced motion); `colorGrade { exposure 1.05, contrast
  1.08, saturation 1.12 }`; fxaa.
- Called but non-functional: `game.cameraDirector` (its state is discarded, `main.ts:1667-1671`) and
  `game.effects` (7 `spawn` calls; `update()` and `nodes()` are never called, so nothing renders;
  `GameRuntime.ts:2800-2879` shows it is a pure data pool).
- Unused: IBL, `effects.particles`, explicit shadows, SSR or reflections on the "wet asphalt", sky.

**(2) Primitive vs. asset counts (gameplay)**

`compactDefaultComposition = !visualReviewCapture` (`main.ts:186`), so normal play always gets the
reduced set. The window lattice, district canopy, garden lights, and medians are hidden or empty. Blades
drop to 6 and district ribs to 8.

| Category | Count |
|---|---|
| Ground and rails (street box 57×39, compact slab, 4 rails, lane strips) | 7 nodes |
| District ribs + window bands | 16 boxes |
| Rain-garden blades | 6 boxes |
| Courier accents (visor, core, shoulder torus, emitter, carbine core, muzzle ring, flash, core ring, burst radius, burst ring, aim vector, shot ray, impact ring) | 13 |
| Impact shards / burst spokes / pressure boundaries / pickup doors | 6 + 8 + 4 + ~3 |
| Enemy pools | 2 `instances.custom` (8- and 10-point extruded discs, 18 / 22 tris each) |
| Spark pool | 1 `instances.sphere` ×96 |
| **Primitive nodes** | **~70** |
| `model()` nodes | arena card (parked at y=-8), barricade ×14, street lamp ×4, courier ×1, carbine ×1 |

**(3) Typed assets**

| Asset | Parsed content | How it renders |
|---|---|---|
| `neonCourierAvatar` (gameplay player) | Sketchfab, 6,315 v / 3,254 tris, **3 unlit flat-color materials, no textures** | Overridden: `material.pbr({ color "#214f68", roughness 0.3, metallic 0.42, emissive "#2bd7e7" @0.24 })` (`main.ts:688-701`). The tint path disables all textures and paints every material one color. Static mesh with no skeleton or animation; it only translates and yaws. |
| `neonRainCourierHero` (review player) | 4-tri unlit BLEND card, 1303×1207 PNG | The same override applies (`color "#f0d8c5"`, `replaceSurfaceTextures: true`). Per `TypedGLBActor.ts:498-500` that disables the base-color texture, which should turn the card into a pale rectangle. Verify in the screenshot. |
| `neonCrownMothElite` (review only, ×48) | 4-tri unlit BLEND card, 1134×975 | Review-only image cards over the instanced enemies (`main.ts:878-891`) |
| `neonRainGardenArenaBackdrop` | 4-tri unlit card, 1586×992 | Gameplay: parked at y=-8 under the street. Review: it is the floor. |
| `neonBarricadeProp` ×14 | Sketchfab, 3,192 tris, 1024² base / MR / normal / emissive | As authored, fit to 2.7 |
| `neonStreetLampProp` ×4 | Sketchfab, **272,036 tris, 15.99 MB**, 27 meshes including flowers and pavement | At the arena corners (±22, ±13), outside a follow camera at distance 13.8. About 1.09 M tris, mostly off screen. |
| `mechWeaponA` (carbine) | 144 tris, flat colors, "modular family synth" | Accessory |

**(4) Lighting rig** (gameplay): from `environment.ts:15-35`: ambient `#475569 @1.05`, directional key
`#e0f2fe @2.0` at (8, 20, 8) (shadow caster), directional rim `#f43f5e @0.72` at (-8, 16, -12), point
`#38bdf8 @2.4` at (0, 4, 0). From `main.ts:620-635`: 4 lamp points `@16` at y=3.6, plus 5 street points
`@9, 9, 11, 13, 15`. That is 10 point lights at intensities 9–16 with an engine range of 10 × scale
(04 §0.10), over a grey-blue ambient wash.

Review mode: `createNeonSwarmDistrictDressing` is never called with `true`. `main.ts:254` passes `[]`
in review, so **review frames have no ambient and no directional light at all**. The `reviewCapture`
branch in `environment.ts:38-91` is dead code. Review frames are lit only by the 5 street points, which
barely matters because the arena, courier, and moths are unlit cards.

**(5) Camera** (`main.ts:916-928`): `camera.follow { target "neon-player", distance 13.8 (12.4),
offset [0, 9.1, 4.8] ([0, 9.2, 3.6]), fov 53 (47), smoothing 0.14 (0 on desktop ≥1400×880 and in
review) }`. On a desktop screenshot rig the camera is rigidly locked to the player, with no lag, lead,
look-ahead, or shake (`cameraDirector` is computed and discarded).

**(6) VFX / juice**: a 96-sphere spark pool (0.13 size, gravity -7.5, bounce), a pulse ray box, an
impact torus, 6 shards, 8 burst spokes, a muzzle-flash sphere, and enemy bob `sin(t·3.1)·0.09`
(`swarm.ts:422`). Declared but not rendered: camera impacts ×3 sites, `ring-shockwave` ×4, `shockwave`,
`impact-flash`, `dash-trail`, `aura-burst`. No death dissolve, no hit-stop, no enemy flash.

**(7) HUD**: DOM `innerHTML` panels (`hud.ts:77-96`) with a stat grid (Wave, Score, Best, Drones out,
Shield, Dash, Burst), a combo bar, and HP pips. Font stack "Segoe UI", Helvetica, Arial;
`backdrop-filter: blur(6px)`. It reads as a dashboard, not a game HUD.

**(8) Audio**: 13 typed WAVs synthesized from oscillators and noise (`scripts/build-sfx.mjs:2-6`),
including a 317 KB ambient hum. No music.

**(9) Root causes**

- Engine: IBL off; π ambient; shadow 0.32; no runtime add-node API, which makes `game.effects` unusable;
  the model tint override destroys textures; averaged normals soften the enemy facets; DPR and blur AA.
- Game: the camera director and effects are wired to nothing; the player is a flat-tinted low-poly
  static mannequin; enemies are extruded 8-gon discs with an emissive tint; the arena is a 57×39 box
  floor with box ribs; the expensive lamp props sit off camera.
- Asset: 3 of 6 distinct assets are unlit image cards; the only character asset is unlit and untextured.
- Authoring / evidence: `route-health.json` still describes enemy pools as `instances.capsule` /
  `instances.box` (stale). The current code is `instances.custom` (`main.ts:856-872`). The performance
  gate's visual criterion is `minimumNonBlackPixels: 1500` (`performance-report.json`).

**(10) Highest-leverage changes**

1. Apply `cameraDirector` state to the camera (shake, lead, impact zoom) and render `game.effects`.
   That needs an engine runtime spawn API or a fixed-pool bridge in `GameRuntime`.
2. Replace the courier with a rigged, textured character on an animation controller (run, strafe, fire),
   and stop the flat `material` override.
3. Replace the enemy discs with 2–3 authored low-poly creature meshes using emissive maps, and add hit
   flash plus death bursts.
4. Add an HDR night environment and a reflective wet-ground material (SSR or planar). Remove ambient.
5. Move the 272k-tri lamps into frame or decimate them. Build the arena from a real kit.

**(11) Scores**: environment 2 · assets 2 · materials 2 · lighting 3 · shadows 2 · IBL 0 · post 3 ·
VFX 2 · animation 1 · camera 2 · HUD 3 · audio 3 · juice 2.

**(12) Verdict: substantial presentation rebuild.** Keep `swarm.ts` steering, waves, the input buffer,
and the instancing approach. Replace the player, enemies, arena, the camera feel wiring, and the FX
rendering.

---

### 3.3 Pulse Tunnel

Files: `src/main.ts` (2628), `gates.ts`, `beat-clock.ts`, `patterns.ts`, `player.ts`, `hud.ts`,
`tunnel-audio.ts`, `styles.css`. Builders: 11 Blender Python scripts (`build-*-v2..v11.py`).
`art-review/` is 82 MB of rejected V3–V10 candidates. 15 commits.

**(1) Engine APIs used and left unused**

- Used: `createAuraApp`, `prefabs.neonTunnel({ rings: 8 })` (filtered), `primitives.*`, `model()` ×3
  (+1 candidate), `effects.neonBloom`, `colorGrade`, `antiAlias(fxaa)`, `fog` (runtime-pulsed),
  `effects.particles` ×3 (**review only**), `lights.*`, `camera.perspective`.
- Post (`main.ts:1469-1472`), gameplay values: `neonBloom { intensity 0.82 (0.2 reduced), threshold
  0.74, maxIntensity 0.72, balanced, softKnee 0.5 }`; `colorGrade { 1.05, 1.07, 1.12 }`; fxaa;
  `fog { density 0.065, color #241044 }`. Review: bloom 0.16, fog 0.009.
- Unused in gameplay: particles, IBL, explicit shadows, any camera motion, speed lines, motion blur, FOV
  kick.

**(2) Primitive vs. asset counts (gameplay)**

| Category | Count | Source |
|---|---|---|
| Section hue frames | 4 sections × 4 rings × 4 sides = **64** boxes | `main.ts:181-207` |
| Gates (top, bottom, core × 8 slots) | 24 emissive boxes | `main.ts:264-282` |
| Graze sparks | 10 spheres (0.04) | `:284-298` |
| Depth pylons | 14 boxes | `:301-312` |
| Cavern "basalt" slabs / spires / lava seams | 22 boxes / 14 cylinders / 12 boxes | `:425-499` |
| Rain strokes (finale) | 30 boxes 1.4 cm wide | `:501-521` |
| Floor ledges | 8 boxes | `:523-537` |
| Finale arena builders, beacon torus, 4 shield vanes, 18 projectile cylinders | ~30+ | `:313-418, 570+` |
| Track planes, hover plane, glow sphere, hit orb | 6 | `:1500-1585` |
| `prefabs.neonTunnel` nodes | rails, washes, streaks, braces (ring tori filtered) | `:1364-1367` |
| **Primitive nodes** | **~250** | |
| `model()` | runner (always), sentry + reactor world (**finale only**, `main.ts:2162-2163`) | |

**(3) Typed assets**

| Asset | Parsed | Notes |
|---|---|---|
| `pulseRunnerCraft` | 33 meshes, 14,344 v / 16,484 tris, 6 materials; 2 textures **128×128, NEAREST / NEAREST_MIPMAP_NEAREST** | Built from Blender `loft` / `prism` / `sphere` / `torus` / `cylinder` / `box` calls (`build-encounter-finish-v11.py:137-212`). Hull: base (0.32, 0.58, 0.64) × dark panel texture, **metallic 0.72**, roughness 0.22. Underframe: metallic 0.88. Without IBL this is near black. |
| `pulseTerminalSentry` | 66 meshes, 32,676 tris, 128² nearest textures | Gunmetal shell metallic 0.82, obsidian 0.92 |
| `pulseReactorEncounterWorld` | 276 meshes, 72,748 tris, 3 textures 128² nearest | Only visible in the finale. In review, 8 arches × 15 parts plus overhead cabinets are hidden via `hiddenNodeNames` because they "project as a single black canopy" (`main.ts:340-363`). That is a direct symptom of no IBL on metallic 0.72–0.88 surfaces. |
| `pulseArena` | Meshy decimated, `quality: candidate` | Only with `?arena=candidate` |

The texture generator (`build-encounter-finish-v11.py:74-89`) writes 16-px cells with 2-px seams and a
deterministic ±4 "grain", and sets interpolation to "Closest" (`:105`). The planar UV is
`(x·0.34) % 1`, so it tiles a 128² image across multi-meter hulls with hard nearest sampling. This is
the most literal "8-bit" artifact in the four games.

The provenance notes show the asset loop rejected real Quaternius CC0 kits (V9/V10, with 1–2 K
PBR / ORM / normal textures in `art-review/external-source/quaternius/*`) through "label-hidden critic"
reviews (`art-review/quaternius-presentation-v10-PROVENANCE.md`: "rejected ... not registered"). It
then shipped the V11 procedural kitbash. The critic judged real assets rendered without IBL and with
blur AA. Engine deficiencies likely caused real assets to lose to procedural ones.

**(4) Lighting rig** (`main.ts:1478-1499`), gameplay (review in parentheses):

| Light | Type | Color | Intensity |
|---|---|---|---|
| corridor sun | directional (shadow caster) | `#38bdf8` (`#c0e1f2`) | 1.6 (0.88) |
| terminal warm edge | directional | `#ffc08a` | 0.34 (0.72) |
| corridor ambient | ambient | `#1e1b4b` (`#5a537b`) | 1.2 (0.72) |
| review actor neutral fill | directional | `#d9f4ff` | **0** (1.18) |
| runner cyan fill / front key / underside | point ×3 | cyan, white | 1.15, 0.7, 0.7 |
| sentry warm fill, terminal amber, magenta rim, deck cyan, exchange impact, arena warm edge | point ×6 | | **0 in gameplay** (0.66–1.72 review) |
| cavern practicals ×3 | point | cyan, magenta, ember | 1.35, 1.25, 1.1 |
| finale core rose / arena cyan | point ×2 | | 3.4 / 2.2 (1.5 / 1.65) |

That is 17 authored lights, 6 of them at intensity 0 in the playable route. The key is a saturated
cyan `#38bdf8` "sun". With a cyan key, a navy ambient, purple fog, and cyan/magenta emissives, the
gameplay palette collapses to two hues.

**(5) Camera** (`main.ts:1589-1591`): gameplay `perspective { position [0, 0.72, 3.8], target
[0, 0.32, -8], fov 50 }`. Review: `[0.10, 2.72, 6.55] → [0.02, 0.92, -2.02], fov 47`. **The camera is
never updated at runtime.** A search for `camera` finds only this literal. The world is static: hue
frames, pylons, rocks, spires, and ledges never move. Only gates (`handle.setPosition(x, y, z)`), the
ship (lane x, jump y, bank roll), sparks, and finale rain move. The speed read comes only from gates
approaching, with no parallax, streaks, or FOV.

**(6) VFX / juice**: a shield-hit orb, 10 graze sparks, a gate pre-flash material swap (emissive
1.2 → 2.8), a fog pulse on downbeat, ship blink, and lane bank. Finale: 18 projectile cylinders,
beacon spin, and rain. Review only: 3 particle systems, impact shards, bursts, rays, waves, and
trails (`main.ts:1264-1360, 1408-1467`). The best-looking VFX code in this game is gated off for
players.

**(7) HUD**: the canvas sits in a 16:9 rounded card (`.pulse-viewport`: 14 px radius, 1 px cyan
border, `box-shadow 0 0 32px`) above an `<aside>` stat panel in a flex column (`index.html:16-21`,
`styles.css:16-47`). It is a web dashboard layout, not full-bleed. Font "Segoe UI" plus ui-monospace.

**(8) Audio**: 4 synthesized stems (air, bass, drums, lead; 3.97 MB each) and 9 SFX, all oscillator and
noise synthesis (`scripts/build-sfx.mjs`, `build-music.mjs`). A beat clock with measured tolerance
(`beat-clock.ts`) drives gates. This is functionally the best audio system of the four.

**(9) Root causes**

- Engine: IBL off with metallic 0.72–0.92 assets; NEAREST honored without warning for 128² textures;
  bloom knee 0.5 / ×7 over a dark scene; exp² fog at 0.065; DPR and blur AA.
- Game: static camera; static world; the playable lane is boxes and planes; FX and particles exist only
  in review.
- Asset: procedural Blender kitbash with point-sampled 128² textures; the typed world appears only in
  the finale.
- Authoring: 11 asset iterations and 82 MB of rejected candidates; 85 review-mode references in
  `main.ts`; review-only lighting fixes instead of fixing the play lighting.

**(10) Highest-leverage changes**

1. Make the world scroll: a segment conveyor for tunnel rings, pylons, and rocks. Add a chase camera
   with FOV kick on boost and a lane-change roll, plus speed streaks.
2. Ship the review-only particles, impacts, and lights in gameplay, then delete the review branches.
3. Rebuild the ship and sentry textures at 1–2 K with linear-mipmap filtering, or reconsider the
   Quaternius kit once IBL works.
4. Add an HDR environment; drop the saturated-cyan key for a neutral key plus colored practicals.
5. Use a full-bleed canvas with an overlay HUD.

**(11) Scores**: environment 2 · assets 2 · materials 1 · lighting 2 · shadows 1 · IBL 0 · post 3 ·
VFX 2 · animation 2 · camera 1 · HUD 3 · audio 5 · juice 2.

**(12) Verdict: substantial rebuild** of presentation and the motion model. Keep `beat-clock.ts`,
`patterns.ts`, gate logic, and the audio stems.

---

### 3.4 Aurora Lander

Files: `src/main.ts` (1857), `terrain.ts` (249), `sites.ts`, `lander.ts`, `ghost.ts`, `touchdown.ts`,
`prediction.ts`, `hud.ts`, `lander-audio.ts`, `styles.css` (341); `scripts/build-models.mjs` (346). 17
commits.

**(1) Engine APIs used and left unused**

- Used: `createAuraApp`, `geometry.custom` (heightfield), `createMeshSurfaceQuery`, Rapier heightfield,
  `primitives.*`, `model()`, `text3D(..., { backend: "sdf" })`, `effects.fog`, `bloom`, `colorGrade`,
  `antiAlias(fxaa)`, `lights.*` with **explicit `shadow: true`** (the only one of the four),
  `camera.follow`, `game.inputReplay`.
- Post (`main.ts:911-914`): `fog { "valley haze", #16283f, density 0.0021, intensity 0.42 }`;
  `bloom { intensity 0.22, threshold 0.72, maxIntensity 0.6, balanced, softKnee 0.5 }`;
  `colorGrade { 1.06, 1.05, 1.12 }`; fxaa.
- Unused: IBL, `sky.*` or `sky.dayNight`, `weather` (snow is 72 hand-moved spheres), `effects.particles`
  (plume is one stretched sphere, dust is 12 spheres), terrain textures or splat, AO.

**(2) Primitive vs. asset counts**

| Category | Count |
|---|---|
| Per site ×3: terrain custom mesh, pad torus, 4 approach spheres, 3 beam cylinders, text3D | 30 |
| Sky: planet sphere (scale 15), ring torus (scale 30×30×0.7), **16 star spheres (scale 1.5)**, aurora curtain boxes | ~25 |
| Feedback: plume sphere, 12 dust spheres, 10 debris boxes, shockwave torus, prediction torus | 25 |
| **Whiteout snow: 72 spheres** (0.035) | 72 |
| Extraction tableau: text3D, halo, infrastructure boxes | ~10+ |
| **Primitive nodes** | **~150** |
| `model()` | probe, ghost probe, beacon ×6, extraction-lander card (review only), bay card (campaign clear) |

**(3) Typed assets**

| Asset | Parsed | Render |
|---|---|---|
| `auroraLanderProbe` | **1,380 v / 460 tris**, 4 flat-color materials (hull `[0.62, 0.72, 0.66]` metallic 0.05 / roughness 0.55), no textures; "build-models (original CC0)" | Player. Rigid, no animation, scaled to `LANDER_TARGET_SIZE`. |
| ghost (same GLB) | | `material.pbr({ color "#7dd3fc", opacity 0.32 })` goes through the tint path, which has no opacity, so it renders as an **opaque flat blue** probe instead of a translucent ghost (`main.ts:762-773`, `TypedGLBActor.ts:484-514`) |
| `auroraPadBeacon` ×6 | 198 v / **66 tris**, 3 flat materials | Pad props |
| `auroraExtractionLanderHero` | 4-tri unlit BLEND card, 984×918 PNG | `visible: visualReviewCapture`, parked at y=-50 |
| `auroraExtractionBayBackdrop` | 4-tri unlit card, 1586×992 | Campaign-clear backdrop, 50 m card |

**(4) Lighting rig** (`main.ts:918-931`): ambient `#67e8f9 @0.4`; directional "regolith bounce fill"
`#2f4a3d @0.55` at (14, **-26**, 18), an upward light that only touches undersides; directional
"moonlight key" `#d9e4fb @2.35` at (-38, 62, -22), **shadow: true**; directional rim `#5eead4 @1.35`
at (30, 40, 36); 2 points at site 3, `#ffb454 @2.2` (9.2 review) and `#67e8f9 @1.8` (5.6). The
structure is reasonable (key, rim, bounce), but the strength 0.32 shadow and the cyan π-ambient flatten
the terrain.

**(5) Camera** (`main.ts:932-950`): `follow { distance 15 (10.6), offset [0, 5.8, 13.2]
([6.8, 5.9, 8.25]), targetOffset [0, 0, 0], fov 58 (46), smoothing 0.05 (0) }`. The comments document
measured iterations (pitch 27° → 23°, "probe at ~100 px"). It has no altitude-dependent framing and no
look-ahead toward the pad. A light objective beam was added because the pad is off screen at spawn
(`main.ts:692-701`).

**(6) VFX / juice**: the thrust plume is a sphere scaled `[0.45, 2.4, 0.45] × throttle`; 12 dust spheres
cycle within 11 m of the ground; 10 debris boxes and a shockwave torus on crash; a prediction torus;
72 snow spheres; and a CSS `gust-pulse` animation. No particles, heat shimmer, light from the plume
(no point light at the nozzle), or camera shake on touchdown.

**(7) HUD**: absolute overlay "chips" (SITE, SCORE, ALT, V/S, H/S, ATT, FUEL bar, HULL) in "SF Mono" /
Cascadia / Consolas, plus a briefing column (`.shell` flex). It is clean and instrument-like, the most
genre-appropriate HUD of the four, but plain.

**(8) Audio**: 10 SFX, including a 123 KB thrust loop and a 141 KB wind ambience, synthesized from
oscillators and filtered noise (`scripts/build-sfx.mjs:2-6`).

**(9) Root causes**

- Engine: IBL off; transparent emissive does not composite as light (the agent's note at
  `main.ts:555-566` led to opaque aurora slabs); 12×16 spheres for a 30 m-diameter planet; shadow 0.32;
  no sky / atmosphere in the root path (04 §0.7), so the background is clear color `#16283f`; scene
  radius inflated by the planet at z=-196 and parked nodes at y=-50.
- Game: the terrain is a 96 m tile with no extent beyond (`sites.ts:50-54`: 65 × 65 cells × 1.5 m,
  height scale 9) and one flat PBR color `#3f5546` / `#585043` at roughness 0.94; the sky is
  hand-placed spheres and boxes; FX are single primitives.
- Asset: a 460-tri probe and 66-tri beacons with flat colors, no textures, and no panel detail.
- Authoring: comments show agents chasing measured luma ("mean luma ~23", `main.ts:594-597`) by raising
  background and emissive values, instead of adding an environment and a sky.

**(10) Highest-leverage changes**

1. Use `sky.*` or an HDR night environment with stars plus a real aurora shader: a vertical ribbon with
   additive blend and noise scroll. Fix the transparent-emissive path in the engine.
2. Texture the terrain: triplanar regolith albedo, normal, and roughness plus a detail normal. Extend
   it with low-res far rings or a horizon skirt so there is no visible edge.
3. Replace the probe and beacons with a textured, panel-lined lander (2–5 K tris, normal map). Add a
   nozzle point light that scales with thrust and a GPU particle plume and dust.
4. Fix the model tint path so `opacity` is honored, which gives a translucent ghost.
5. Use instanced or particles snow and drop the 72 sphere nodes.

**(11) Scores**: environment 3 · assets 2 · materials 2 · lighting 4 · shadows 3 · IBL 0 · post 3 ·
VFX 2 · animation 2 · camera 4 · HUD 5 · audio 4 · juice 3.

**(12) Verdict: save through polish plus an art pass.** The deterministic flight model, Rapier
heightfield, BVH surface query, replay ghost, and campaign are solid. Visual uplift comes from
environment, terrain material, lander asset, and particles, not structure.

---

## 4. Cross-game findings tables

### 4.1 Capability ladder (these four games)

| Capability | exists | works | public API | used by these games | good default | composes | modern quality | agents know | examples show |
|---|---|---|---|---|---|---|---|---|---|
| IBL / environment | ✓ | partial (04) | ✓ | **0 / 4** | ✗ (off with ambient) | ✗ | ✗ (128×64 LDR) | ✗ | ✗ |
| Shadows | ✓ | ✓ | ✓ | 4 / 4 (auto) | ✗ (0.32) | partial | ✗ | partial (1 / 4 explicit) | ✗ |
| Particles | ✓ | ? | ✓ | Pulse review only | n/a | ✗ (review only) | ? | partial | ✗ |
| `game.effects` | ✓ | data only | ✓ | Neon (7 spawns) | n/a | **✗ (no runtime add)** | ✗ | ✗ (thinks it renders) | ✗ |
| `game.cameraDirector` | ✓ | data only | ✓ | Neon | n/a | ✗ (output discarded) | ✗ | ✗ | ✗ |
| Model material override | ✓ | destructive | ✓ | Neon, Aurora | ✗ (drops textures and opacity) | ✗ | ✗ | ✗ | ✗ |
| Custom geometry | ✓ | ✓ | ✓ | Blockfall, Neon, Aurora | ✗ (smooth normals) | ✓ | ✗ | partial | ✗ |
| Texture filtering | ✓ | ✓ | GLB only | Pulse (nearest) | ✗ (no warning) | ✓ | ✗ | ✗ | ✗ |
| Tone map / exposure | ✓ | fixed | ✗ (dropped) | 4 / 4 pass exposure | ✗ | ✗ | ✗ | ✗ | ✗ |
| AO | ✓ | ✗ (≈0) | ✓ | Blockfall, Neon | ✗ | ✗ | ✗ | ✗ | ✗ |
| Skeletal animation | ✓ (09) | n/a | ✓ | **0 / 4** | n/a | n/a | n/a | ✗ | ✗ |

### 4.2 Asset reality check

| Game | Distinct models | Image-card quads | Agent-scripted primitive kitbash | Real third-party mesh in frame | Total "release" tris in frame (approx.) |
|---|---|---|---|---|---|
| Blockfall | 4 | 3 | 0 | 1 (cabinet, marquee covered) | ~3.4 k + 3 quads |
| Neon Swarm | 7 | 3 (1 used in play, parked) | 1 (carbine, 144 tris) | 2 (barricade ×14; lamps ×4 mostly off camera) + courier (unlit, re-tinted) | ~45 k + off-screen 1.09 M |
| Pulse Tunnel | 3 (+1 candidate) | 0 | 3 (runner, sentry, world) | 0 | 16.5 k (runner) in play; +105 k in finale |
| Aurora Lander | 4 | 2 (review / campaign) | 2 (probe, beacon) | 0 | ~0.86 k |

### 4.3 Review-mode drift (`node tools/showcase-library/game-capture-parity.mjs`, read-only run)

| Route | ART | FRAMING | TRANSIENT | UNKNOWN | `visualReviewCapture` refs in src |
|---|---|---|---|---|---|
| showcase-pulse-tunnel | **24** | 4 | 7 | 49 | 85 |
| showcase-blockfall-reactor | 8 | 12 | 0 | 22 | 42 |
| showcase-neon-swarm | 4 | 5 | 0 | 50 | 60 |
| showcase-aurora-lander | 1 | 4 | 0 | 26 | 33 |

Concrete swaps: Pulse hides `tunnelBackdrop`, depth pylons, rocks, spires, lava, ledges, finale arena,
and track (scale 0.001), then adds 15 review builder arrays and 3 particle systems (`main.ts:1373-1467`).
Neon removes all district dressing and lights, swaps the courier GLB, and adds 48 moth cards
(`main.ts:254, 688, 878`). Blockfall drops `createArcadeRoomNodes()` and enlarges the backdrop card to
height 14.2 (`main.ts:528, 628`). Evidence code is 64–143 `evidence|proof` references per game.

---

## 5. Root-cause split (all four games)

| Bucket | Share of visual deficit (judgment) | Key items |
|---|---|---|
| A — renderer | ~25% | Averaged custom normals; cylinder cap normals; transparent emissive dropped (Aurora); AO no-op; blur "FXAA"; no sky background; NEAREST accepted silently |
| B — defaults | ~25% | Ambient disables IBL; π ambient; shadow 0.32; DPR 1; exposure dropped; bloom knee 0.5; 12×16 sphere |
| C — assets | ~20% | Unlit AI image cards as "release" models; agent Blender kitbash with 128² nearest textures; flat-color low-poly probes; Sketchfab models with wrong baked text or 16 MB off-screen lamps |
| D — game | ~20% | Static camera and world (Pulse); discarded camera director and effects (Neon); 96 m terrain island (Aurora); hidden legacy nodes; dashboard layouts |
| E — authoring / evidence | ~10% direct, but it enabled the rest | Review-only worlds; metrics like non-black pixels, luma thresholds, and primitive "source occurrences"; stale route-health; asset critic loops that rejected real kits rendered under broken lighting |
| F — architecture | multiplier | No runtime node creation forces pre-parked pools and makes `game.effects.nodes()` unusable; one shadow caster only; the model tint API conflates tint with texture removal |

---

## 6. Recommendations ranked by leverage across the group

1. **Engine (B):** make an environment the default when no environment is authored, even when ambient
   is present: a neutral HDR studio or night PMREM. Set shadow strength to 1. Use DPR `min(dpr, 2)`.
   Replace the cross-blur FXAA with real FXAA or SMAA, or remove it when MSAA is on. This lifts all
   four games without touching game code.
2. **Engine (A):** add flat-normal / crease-angle support to `geometry.define` / `custom`. Fix cylinder
   cap vertices. Raise primitive tessellation. Honor opacity in the model tint path, and add a
   `tint`-without-texture-removal mode. Fix transparent emissive compositing.
3. **Engine (F):** add a runtime spawn/despawn or pooled-node API so `game.effects.nodes()` and particles
   render. Make `cameraDirector` attachable to the scene camera.
4. **Evidence (G):** enforce `check:capture-parity --fail-on-art` in CI, and screenshot only the default
   route. Retire `?capture=review` world swaps in all four games. Replace "non-black pixels" with
   reference-image perceptual review.
5. **Assets (C):** ban `KHR_materials_unlit` image-card quads from `quality: release` model admission.
   Flag NEAREST samplers and textures under 512 px on hero assets in `assets validate --release`.
6. **Game (D):** Pulse needs a scrolling world and a moving camera. Neon needs camera feel and FX wired,
   plus a rigged hero. Aurora needs terrain texturing, horizon extent, and particle plumes. Blockfall
   needs FOV and parallax, real room assets, and deletion of the legacy per-cell nodes.

---

## 7. Evidence index (path:line)

- Image-card GLBs: `apps/showcase-*/generated/*.glb`, all `verts=8 tris=4 KHR_materials_unlit`
  (parsed). Builders: `scripts/build-review-art.mjs` (Blockfall, Neon) and
  `scripts/build-review-extraction-*.mjs` (Aurora).
- Pulse nearest textures: `apps/showcase-pulse-tunnel/scripts/build-encounter-finish-v11.py:74-107`;
  GLB samplers `{magFilter 9728, minFilter 9984}` (parsed); loader `packages/assets/src/GLTFLoader.ts:1700-1711`;
  `packages/assets/src/GLTFRenderResources.ts:2196-2213`.
- Model tint drops textures: `packages/engine/src/agent-api/index.ts:13567-13579`;
  `packages/engine/src/production-runtime/TypedGLBActor.ts:477-514`.
- Custom normals averaged: `packages/engine/src/agent-api/index.ts:15006-15017`. Primitive builders:
  `:17361-17479` (capsule = sphere at `:17477-17479`).
- Shadow caster and strength: `index.ts:12942-12974, 13156-13229`.
- No runtime add-node: `index.ts:10664-10670`. `game.effects` is data only: `GameRuntime.ts:2800-2879`.
- Neon discarded camera / effects: `apps/showcase-neon-swarm/src/main.ts:977-978, 1148-1627, 1667-1671`;
  `combat-feel.ts:133-137`.
- Neon review lights removed: `main.ts:254`; dead branch `environment.ts:38-91`.
- Pulse static camera: `apps/showcase-pulse-tunnel/src/main.ts:1589-1591`. Review-only builders:
  `:786-1360`. Lights at 0 in play: `:1485-1499`.
- Blockfall legacy 200 nodes: `apps/showcase-blockfall-reactor/src/reactor-scene.ts:516-528`;
  `main.ts:763-832`.
- Aurora transparent emissive note: `apps/showcase-aurora-lander/src/main.ts:555-566`. Ghost opacity
  ignored: `:762-773`. Terrain size: `src/sites.ts:50-54`.
- Synth audio: `apps/*/scripts/build-sfx.mjs:2-6` (all four).
- Capture parity tool: `tools/showcase-library/game-capture-parity.mjs`; `package.json:690-691`.
  Thumbnail uses review: `tests/browser/showcase-game-thumbnails.spec.ts:57`.
