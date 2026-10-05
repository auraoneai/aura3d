# 20 — Per-game scorecards from code + pixel statistics (judge panel pass 1)

> Caveat: in this pass most subagent judges could not decode the PNGs (image reads returned empty), so these scores come from code research, report.json pixel statistics (luma, dark fraction, clipping) and fps. File 21 holds the true vision-model judgment of the screenshots and is authoritative for visual categories.

# Aura Clash Arena (`aura-clash-showcase`)

## 1. Final scorecard

No category had a judge gap above 2 points. The largest gap is 1.0, in material_quality, ibl_reflections, mobile_presentation, controls and lighting-adjacent categories, so no category triggered the screenshot override. I tried to view the screenshots anyway. Read returned empty content for the PNGs and for a re-encoded 1200 px JPEG, which is the same failure both judges hit. I re-ran the pixel analysis myself (canvas region x280-1640, y271-931) and it confirms Judge B's numbers: mean luma 42.8-43.9, p99.9 about 170, max 196-203, 27-29% of pixels under luma 20, mean RGB about 39/44/43, and 0% of pixels at 254 or above. Where the judges split, I leaned toward Judge B, whose values come from measured pixels.

| Category | Final | Judge A | Judge B | Justification |
|---|---|---|---|---|
| environment_world | 4.0 | 4.5 | 4.0 | Real textured city GLB, but scaled to 0.59 against 1.08 fighters, foreground props filtered out, and flat untextured floor and panel areas (std 0-1, measured). |
| modeling_assets | 5.0 | 5.5 | 5.0 | Proper 65-joint skinned Quaternius rigs, surrounded by primitive props and a 4-tri crowd card. |
| texture_quality | 5.0 | 5.0 | 5.0 | Real BC/N/MR sets, washed out by tint overrides; floor, boxes, hair and neon are untextured. |
| material_quality | 3.5 | 4.0 | 3.0 | Fighter MR maps replaced with flat values plus a flat emissive, giving a plastic look; the floor "sheen" is an unlit strip. |
| pbr_credibility | 3.0 | 3.5 | 3.0 | The BRDF is sound, but the frame never exceeds about 203/255, so speculars never reach white. |
| lighting | 3.0 | 3.0 | 3.0 | Camera-aligned 4.7-intensity point keys flatten form; the frame is murky low-key with 27-29% of pixels under luma 20. |
| shadows | 2.0 | 2.5 | 2.0 | Strength forced to 0.32, one 1024 map over the whole city block, and bind-pose shadows from the skinned fighters. |
| ambient_lighting | 3.0 | 3.0 | 3.0 | 128x64 LDR teal gradient with no AO; a uniform green-cyan lift is measured. |
| ibl_reflections | 1.5 | 2.0 | 1.0 | No HDRI, no SSR or planar reflections despite both existing in the engine; nothing reflects. |
| tone_mapping | 1.0 | 1.5 | 1.0 | rgba8 linear target with Reinhard fallback; measured max about 200 and zero clipped pixels confirm the 0.735 ceiling. |
| color_management | 3.0 | 3.0 | 3.0 | sRGB handling is correct, but 8-bit linear storage posterizes the darks (4-code floor steps). |
| anti_aliasing | 5.0 | 5.0 | 5.0 | 4x MSAA at DPR 1 on desktop; mobile capped at 1.75 on a 3x device; no TAA. |
| postprocessing | 1.5 | 1.5 | 2.0 | Bloom threshold 0.78 sits above the about-0.75 ceiling, so it never fires; the full post preset is dead code. |
| vfx | 2.0 | 2.0 | 2.0 | Opaque unlit spheres and capsules; the special-move frame has lower max luma (196) than the idle frame. |
| particles | 1.0 | 1.0 | 1.0 | The declared 128 particles are never read; only 8 mote spheres exist. |
| animation_quality | 6.0 | 6.0 | 6.0 | Strongest subsystem (inertialized blends, foot IK, springs, clip events), held back by a generic clip set. |
| character_presentation | 4.0 | 4.5 | 4.0 | Tinted, emissive-lifted fighters under frontal lights, at giant scale against the city. |
| camera | 4.0 | 4.5 | 4.0 | Works mechanically, but the 60° orthogonal side view flattens the scene into a theatre flat. |
| composition | 3.0 | 3.0 | 3.0 | The canvas covers 43% of the viewport inside a dashboard, with a flat floor band and a flat panel inside it. |
| scale_depth_perception | 3.0 | 3.0 | 3.0 | Fighters read as 3.4 m giants, with no foreground parallax and uniform fog. |
| atmospheric_effects | 3.0 | 3.0 | 3.0 | A uniform exp² teal veil only; no volumetrics, haze cards or rain. |
| gameplay_readability | 5.0 | 5.5 | 5.0 | Cyan and orange fighters are distinct, but murky values and weak VFX hurt hit confirmation. |
| ui_hud | 3.0 | 3.0 | 3.0 | A dev dashboard (nav, prose cards, key-legend strip, evidence panel), not a fighting HUD. |
| typography | 3.0 | 3.0 | 3.0 | Saira is named in CSS but never loaded, so text falls back to system fonts. |
| game_feel | 5.0 | 5.5 | 5.0 | The juice stack is real (hit-stop, shake, punch-in, flash) but is undercut by 11 fps and weak VFX. |
| controls | 5.5 | 6.0 | 5.0 | Full fighter key set and hits registered; no gamepad or touch, and the on-screen strip is a debug crutch. |
| physics_feel | 4.0 | 4.5 | 4.0 | Deterministic knockback (fine for the genre) with no secondary physics. |
| sound_audio | 4.0 | 4.0 | 4.0 | 11 CC0 samples on 4 buses; no music, announcer or crowd. |
| loading_transitions | 4.0 | 4.0 | 4.0 | About 12.7 MB and 3-11 s to ready; title, select and results screens are unwired; dev-facing status text. |
| polish_juice | 4.0 | 4.5 | 4.0 | Juice intent is capped by LDR VFX; dead modules make it feel unfinished. |
| mobile_presentation | 2.5 | 3.0 | 2.0 | 370x490 CSS canvas under about a third of a screen of HUD cards, a dead black band, no touch play. |
| performance | 3.0 | 3.0 | 3.0 | Measured rAF 11-13 fps against 57-60 for sibling games on the same runner; the engine counter falsely reports 60. |
| overall_visual_quality | 3.0 | 3.5 | 3.0 | Real assets and animation inside a pipeline that caps highlights at about 200/255; reads as a mid-2000s tech demo. |

## 2. What looks poor

All of this comes from pixel statistics and code; nobody could view the images.
- The frame is dim, grey-teal and flat. Canvas mean luma is about 43, with 27-29% of pixels under 20. The absolute maximum is 196-203 and no pixel clips, so neon, sparks and the 24-intensity spot never reach white.
- The frame carries a uniform green-cyan cast (mean RGB about 39/44/43).
- The darks posterize: the floor gradient steps in 4-code jumps (25, 29, 33, 36, 40).
- The bottom about 55 px of the canvas is a flat untextured floor box (std 0-1).
- A zero-variance dark panel sits at canvas x68-200, y165-330, part of the stage furniture or shadow-evidence slabs.
- The "wet neon" floor shows no reflections.
- Shadows are weak, blurry and in bind pose.
- Fighters are lit flat from the front, their costumes look like tinted glowing plastic, and they are oversized against a 59%-scale city.
- Hit and special VFX are opaque flat-colour primitives. The special frame is dimmer at the top end (max 196) than the hit frames.
- The game is a 1360x660 widget, 43% of the viewport, inside nav bars, prose cards and a key-legend strip.
- On mobile it is a small mid-screen box with HUD cards above it and a dead black band below.
- It runs at about 11 fps.

## 3. Why

Root-cause split: engine 30%, defaults 23%, game 24%, assets 11%, authoring 12%. These are the averages of the two judges' splits.

**Engine (30%).**
- `createSideViewGameRenderPreset` writes linear light into an rgba8 target, and the missing operator falls back to Reinhard. That caps output at sRGB 0.735, which the measured max of about 200 confirms, and bands the darks.
- The depth pass is not skinning-aware, so fighters cast bind-pose shadows.
- The root bridge overrides shadow strength to 0.32.
- The engine fps counter reports 60 against a measured 11.
- The renderer is not missing the capabilities it needs. HDR targets, the PMREM/HDRI path, SSR, PlanarReflection and SpriteFlipbook all exist; they are just not defaulted or wired.

**Defaults (23%).**
- No HDR or ACES default on game presets.
- A 128x64 LDR procedural IBL with no HDRI.
- Bloom threshold above the LDR ceiling.
- A 60° FOV camera.
- One 1024 shadow map fit over all casters.

**Game (24%).**
- Frontal point "flashlight" keys on each fighter.
- MR maps overridden with flat values, plus flat emissive on costumes.
- The arena mis-scaled at 0.5876 against fighters at 1.08, and foreground props filtered out.
- Primitive VFX, and the 128 declared particles never read.
- A dev-dashboard DOM shell, unloaded fonts, and a mobile DPR cap.

**Assets (11%).** The assets themselves are mostly decent: the rigs and the city GLB are fine, and they are rendered badly rather than weak. The weak exceptions are the 4-tri crowd card, untextured hair and neon, stock clips (including Zombie_Walk on the rival), and no music or announcer.

**Authoring (12%).** Visual evidence was captured at a 320 px backing width with the set dressing stripped, and the dead post preset was reported as live. Nobody evaluated the shipped image.

**Other questions from the brief:**
- Lighting, materials and post are all at fault. The camera is a secondary cause.
- The environment is under-authored: there is a backdrop but no foreground, no reflections and no sky.
- Animation is decent but simplistic in its clip vocabulary.
- Gameplay is visually empty at the moment of impact, because the VFX and highlights never pop.

## 4. Largest improvements (ranked)

1. **HDR pipeline.** Set the game presets to rgba16f with ACES or AgX (exposure about 1.1) and make that the default on HDR targets. Then raise neon and spark emissive to 3-8 and re-enable bloom with a soft threshold above 1.0. This fixes the ceiling, banding and dead bloom in one change.
2. **Shadows.**
   - Remove the root strength override and use 0.85-1.0.
   - Fit the shadow frustum to the fighters and the camera framing.
   - Exclude the backdrop from casters.
   - Add a skinned depth variant so fighters cast posed shadows.
   - Use hardware PCF.
3. **Lighting and IBL.**
   - Add a night-city HDRI through `environments.hdri`.
   - Delete the frontal point keys.
   - Use a warm overhead shadowed key with cool and magenta back rims.
4. **Presentation.**
   - Make the canvas full-bleed and remove the dashboard chrome from play.
   - Build a genre HUD (slanted bars, portraits, timer).
   - Load the Saira fonts.
   - Make mobile full-screen with touch controls and native DPR.
5. **VFX and particles.**
   - Replace the primitive sparks with additive HDR flipbook sprites, an impact light, shock rings, dust and trails.
   - Consume the declared 128 particles.
   - Wire up the real post preset.
6. **Reflections and floor.** Give the floor a wet-asphalt material with SSR or planar reflection, and restore the foreground props.
7. **Materials.** Stop the MR and emissive overrides and convey team colour through a rim or fresnel term instead.
8. **Camera and scale.** Use about 32° FOV with a -0.10 to -0.14 pitch, and bring the arena to roughly 1:1 with the fighters.
9. **Performance.** Profile the 11 fps (against about 60 for sibling games on the same runner) and fix the fps counter.
10. **Assets and audio.**
    - Replace the crowd card with instanced animated spectators, or remove it.
    - Use fight-specific clips instead of Zombie_Walk.
    - Add music, an announcer and crowd ambience.
11. **Process.** Capture evidence at native DPR with the shipped content, and delete or wire up the dead modules.

## 5. Verdict: save-through-polish

Both judges reached this verdict independently. The expensive parts are sound: the skinned, textured rigs, the inertialized animation with IK and springs, the clip-event hit windows, the juice systems and the textured arena GLB. The dominant failures are a small set of pipeline defaults (rgba8 with Reinhard, the shadow override, LDR IBL) plus game-layer compensations and chrome. Most of them are configuration or wiring changes to capabilities the engine already has.

Two items are real engineering work but contained: skinning-aware shadow depth, and the 5x performance gap. It would become a substantial rebuild if the performance gap turns out to be architectural, or if the art direction needs bespoke characters rather than stock rigs.

## 6. Capture caveats

- **No screenshot was viewed by anyone.** Both judges and this reconciliation got empty content from Read on every PNG and on re-encoded JPEGs. All visual claims come from numeric pixel analysis plus the code audit (17-games-g1). I independently re-verified the desktop canvas tone statistics. Anything about silhouettes, faces, texture detail or VFX shape is inferred from code. A reviewer who can see the images should spot-check these scores.
- **"01-title" is gameplay.** The round auto-starts, so there is no title screen in the captures.
- **Performance numbers are relative.** The runner is headless, 3-vCPU, with a paravirtual GPU, so absolute fps is pessimistic. The comparison with Orbital Defense and Vault Breakers at 57-60 fps on the same runner is the meaningful signal. I trust the rAF measure over the engine's reported 60.
- **The capture itself is valid.** No console errors, page errors, failed requests or blank shots. Gameplay state advanced (totalHits 0 to 22, health dropping, special used), so input reached the game.
- **The alt1 route matches the primary route.** /showcase/aura-clash/playable/ produced the same stats.

## 7. Screenshot evidence

Directory: `/tmp/qr/game-captures/out/aura-clash-showcase/`. None of these were viewed; descriptions come from numeric analysis and report.json.

- `contact-sheet.png` (2432x1450): grid of all shots.
- `desktop-1920x1080__01-title.png`: round already live, FIGHT callout.
  - Canvas mean luma 43.2, p99.9 169.6, max 198.7, 27.2% of pixels under 20, mean RGB 38/45/44, 0% clipped.
  - Nav and HUD cards above the canvas, control strip below.
- `desktop-1920x1080__02-opening.png`: 2 hits, player walking, HURT callout; same tonal profile (max about 209); 127 draw calls.
- `desktop-1920x1080__03-mid.png`: 19 hits, player 300 / rival 290; a red channel reaches 246 from a spark, but luma max is about 201 and there is no bloom.
- `desktop-1920x1080__04-action.png`: mid-hit, 21 hits.
  - Max luma 202.6, 28.7% of pixels under 20.
  - Flat floor band at the bottom (std 0-1) with 4-code banding.
  - Zero-variance panel at canvas x68-200, y165-330.
- `desktop-1920x1080__05-special.png`: special move; max luma 196.2, lower than the hit frames, so the special VFX add no highlight energy; stats otherwise match idle.
- `desktop-1280x720__01..05-*.png`: canvas 1248x458 letterbox strip; same low-key look; dashboard chrome takes a larger share of the frame.
- `alt1-1920x1080__01..05-*.png`: alternate route, statistically the same as the primary desktop shots.
- `mobile-390x844__01-title.png`: 1170x2532 device px; HUD and prose cards occupy about y0-900; canvas 370x490 CSS with a 648x857 backing (DPR 1.75 of 3).
- `mobile-390x844__02-opening.png`: textured floor and control band at about y1740-2000, then an empty black band from about y2040 to 2460 above the bottom nav; 3 hits.
- `mobile-390x844__03-mid.png`: same layout, 16 hits; the game view is a small mid-screen box and most of the screen is UI or dead space.

# Mech Hangar (`showcase-mech-hangar`)

## (1) Scorecard

No category differed by more than 2 points between judges; the largest gap was 1.0. Final = mean of the two judges. I tried to Read the PNGs myself, but they also came back empty for me, so I checked the one factual disagreement numerically (arena highlight clipping; see caveats).

| Category | Final | Judge A | Judge B | Justification |
|---|---|---|---|---|
| environment_world | 2.75 | 2.5 | 3 | About 190 untextured primitives and ~30 emissive strips, a "neon blockout"; 53-74% of 16px blocks are flat. |
| modeling_assets | 2 | 2 | 2 | JS-generated, flat-shaded, ~1.7k-tri mechs with no UVs, kitbashed onto an unrigged 100k-tri Meshy statue. |
| texture_quality | 1.75 | 1.5 | 2 | No textures anywhere except the hero GLB. |
| material_quality | 2.5 | 2 | 3 | Only color/rough/metal/clearcoat; with no environment the steel reads as grey-blue plastic, and emissive strips carry the look. |
| pbr_credibility | 2.5 | 2 | 3 | The BRDF is sound, but metals with zero IBL can't read as metal. |
| lighting | 3 | 3 | 3 | Four infinite directionals plus 0.72 ambient flatten both sets; the arena clips about 4% of pixels (verified). No key/fill hierarchy. |
| shadows | 2 | 2 | 2 | One 4096 map fitted over a 40-70 unit span (parked nodes at y=-60), strength 0.32, plus a fake emissive contact disc. |
| ambient_lighting | 2 | 2 | 2 | Constant ambient times a fake hemisphere factor; 8-bit SSAO is negligible. |
| ibl_reflections | 0.5 | 0 | 1 | lights.ambient forces IBL intensity and specular to 0; nothing reflects. |
| tone_mapping | 4.75 | 4.5 | 5 | Correct RGBA16F to ACES, but exposure 1.04 is ignored. Hangar is dim, arena clips. |
| color_management | 4.5 | 4 | 5 | Pipeline is correct; art direction is monochrome teal (about 1.4% warm pixels). |
| anti_aliasing | 5.25 | 5.5 | 5 | 1.5x render scale plus MSAA plus FXAA: clean but soft, and costly. Mobile renders at half native resolution. |
| postprocessing | 3.75 | 3.5 | 4 | Mild bloom and SSAO run in 8-bit after ACES, with a hard-step bright pass. Nothing adds mood. |
| vfx | 1.75 | 1.5 | 2 | Emissive spheres, grey balls and tori. The special changes 0.19% of pixels. |
| particles | 1.75 | 1.5 | 2 | Mesh spheres hidden by setting scale to 0.0001; no sprites, additive or soft particles. |
| animation_quality | 0.75 | 0.5 | 1 | None. Rigid statues with yaw-only rotation plus knockback translation. |
| character_presentation | 2 | 2 | 2 | Box armor fused to a static scan, ~1/3 frame height, recolor variants. |
| camera | 4.5 | 4 | 5 | Competent generic follow camera (FOV 54, 6.5 m) with punch and KO push-in. |
| composition | 3.5 | 3 | 4 | Hangar canvas is squeezed to 1590/1920 by DOM panels. The arena is center-weighted with a clipped mid band. |
| scale_depth_perception | 3 | 3 | 3 | No fog, flat wash, weak shadows, repetitive plates. |
| atmospheric_effects | 1.25 | 1.5 | 1 | No fog, haze, shafts or motes; flat #081522 background. |
| gameplay_readability | 4 | 4 | 4 | The HUD conveys state, but the scene doesn't: rigid poses and invisible hits, with both mechs in the same palette. |
| ui_hud | 3.75 | 3.5 | 4 | A developer inspector: monospace, "ASSET PASSPORT", asset keys shown to the player. |
| typography | 3 | 3 | 3 | SF Mono everywhere, no hierarchy, internal identifiers as copy. |
| game_feel | 3 | 3 | 3 | From code: hit-stop and punch exist, but there's no visual payoff, and 9 fps hurts it badly. |
| controls | 5 | 5 | 5 | From code: complete keyboard and touch mapping; inputs reached gameplay. |
| physics_feel | 2.25 | 2.5 | 2 | "physics: none"; scripted knockback nudges. |
| sound_audio | 2 | 2 | 2 | 10 oscillator-synthesized WAVs plus an ambient loop, no music. |
| loading_transitions | 4 | 4 | 4 | 28.5 MB before ready (27 MB hero), ready in ~4-5 s, countdown, context recreated on resize. |
| polish_juice | 2.25 | 2.5 | 2 | Juice hooks with no visible payoff; dev text exposed. |
| mobile_presentation | 3 | 3 | 3 | Half-resolution canvas, cramped hangar, clipped arena center, 32.5 fps. |
| performance | 2 | 2 | 2 | 9.3 fps at 1080p and 15.6 fps at 720p, while the engine overlay claims 60. Sibling games run ~60 on the same runner. |
| overall_visual_quality | 2.5 | 2.5 | 2.5 | Early-2000s tech-demo / developer-inspector look. |

## (2) What looks poor

- **The mechs.** Flat-shaded ~1.7k-tri box assemblies with no textures, glued 0.32 m in front of an unrigged 100k-tri Meshy statue. They stand rigid in every frame and never move a limb.
- **The hangar.** Very dark (mean luma ~30) and monochrome navy. DOM panels (stat holograms, ASSET PASSPORT listing `assets.mechChassisA`, "assembly validated") take ~17% of the width on desktop and ~half the height on mobile.
- **The arena.** A uniformly teal wash with a band of near-white clipped pixels (~4%, verified) through the middle, where the floor and emissive strips sit under 4 directionals plus 0.72 ambient. That band lowers contrast right where the fighters stand.
- **Metal.** The steel parts reflect nothing and read as plastic with point-light hotspots.
- **Shadows.** Faint and low-resolution. Grounding comes from an emissive fake disc.
- **Combat effects.** The heavy and special attacks have no visible VFX. 05-special differs from 04-action in 0.19% of pixels, and there is no flash, trail, spark sprite or impact light.
- **Environment.** No fog or atmosphere. Untextured primitive plates and pillars give no detail density or scale cues.
- **Visible symptoms of the frame rate.** 9 fps at 1080p, a soft half-resolution mobile canvas, and an fps counter that claims 60.

## (3) Why

Root-cause split (judge mean, rounded): engine 16%, defaults 12%, assets 35%, game 26%, authoring 11%.

- **Assets (35%): the assets themselves are weak, not just rendered badly.** The mech parts are procedurally scripted GLBs (144-608 tris per part, no UVs, textures or skeleton). The hero is an unrigged candidate scan, loaded twice at 27 MB each. The set dressing is 100% primitives.
- **Game (26%).**
  - Animation is simplistic to the point of nonexistent: yaw-only `setRotation`, and AnimationController is never used.
  - Gameplay is visually empty: VFX are mesh spheres and tori, and the special move has no visual.
  - Both sets live in one scene and share 12 lights, so the infinite directionals double-light everything. The pit blew out and was "fixed" by dimming the lights instead of separating the rigs.
  - The HUD is a debug inspector.
  - The forced 1.5x DPR plus ~190 unbatched draws tanks fps.
- **Defaults (12%).**
  - `lights.ambient` silently zeroes IBL and specular.
  - colorGrade exposure is ignored.
  - FXAA is stacked on MSAA.
  - Default shadow strength is 0.32.
- **Engine (16%).**
  - The single uncascaded shadow map is fitted over all casters, including parked off-screen nodes, with no texel snapping.
  - SSAO, FXAA and bloom run in 8-bit after the tonemap, and the bloom bright pass is a clamped hard step.
  - There is no sprite/additive/flipbook particle path in use (`effects.flipbook` exists but isn't used here).
  - Per-draw uniform/VBO churn in ForwardPass.
  - The fps counter reports 60 while the real rate is 9.
  - The core BRDF and HDR/ACES path are fine.
- **Authoring (11%).** The "typed asset" gate was met by generating GLBs in code. The gates certify socket metrics, not visual quality.
- **Fault summary.**
  - Lighting: yes (wash and clipping).
  - Camera: mostly no (generic, but OK).
  - Materials: yes (no environment, no maps).
  - Post: minor.
  - Environment: under-authored.
  - Renderer capability gaps: cascaded and texel-snapped shadows, HDR-space post, soft-knee bloom, ambient that adds to IBL instead of replacing it, and a truthful fps counter.

## (4) Largest improvements (ranked)

1. Replace the MH-2M parts and Meshy statue with 2-4 rigged, UV'd, PBR-textured modular mechs (shared skeleton, socket bones).
2. Author animation clips through AnimationController: idle, walk, light, heavy, special, guard, hit-react, KO, plus recoil and secondary motion.
3. Remove `lights.ambient(0.72)`, add an industrial HDRI via `environments.hdri`, and split the hangar and arena light rigs (enable per mode). Use 1 shadowed key plus practicals, and re-expose the pit until it stops clipping. Engine side: make ambient add to IBL instead of replacing it, and warn when metals render with no environment.
4. Performance:
   - Cap the render scale, or drop the 1.5x on DPR-1 displays; mobile DPR at most 2.
   - Remove FXAA-on-MSAA.
   - Instance or batch the primitives.
   - Drop the duplicate 100k-tri heroes and the always-mounted hidden models.
   - Fix ForwardPass per-draw churn and the fps counter.
5. Combat VFX: additive flipbook sparks, muzzle flashes, beam trails, smoke, impact point lights and screen flash. The special must own the frame.
6. Textured hangar kit (trim sheets, decals, greebles, cables), plus height fog, volumetric shafts and dust motes.
7. Art-direct the palette with warm/cool team identities and warm practicals against the cool steel.
8. Shadows: exclude parked nodes from the fit, raise strength to 0.6-0.8, add cascades, texel snapping and hardware PCF, and drop the fake disc.
9. Post: run it in HDR/16F before the tonemap, use a soft-knee bloom, honor exposure, add a deliberate vignette.
10. Game HUD: full-bleed canvas, a display face, fighting-game bars, debug panels behind a toggle, and a bottom-sheet part picker on mobile. Replace the oscillator SFX with recorded foley and add music.

## (5) Verdict

**substantial-rebuild.** Both judges agree.

- **Why not save-through-polish:** the core content (mech models, the absence of animation, the primitive environment, VFX) has to be replaced, not tuned.
- **Why not full-rebuild:** the game structure is reusable. That includes bout logic, controls, the camera rig, hit-stop and punch hooks, the audio bus routing, the hangar builder flow, and a correct HDR/ACES pipeline.
- **Plus engine fixes:** the engine fixes (shadow fit, HDR post, ambient vs IBL, the draw path) are needed alongside the rebuild.

## (6) Capture caveats

- **Nobody saw the frames.** Both judges, and I, got empty Read payloads for every PNG, so no one has looked at the screenshots by eye.
  - Scores rest on pixel statistics, frame diffs and code research (17-games-g1.md, 02-render-core-frame-trace.md).
  - Silhouettes, edge quality and HUD layout are inferred, not observed.
- **Arena highlights: I re-measured, and B is right.**
  - Judge A described the arena as having "few bright pixels". Its 0.1-0.4% bright figure is the hangar's.
  - My PIL check confirms Judge B:
    - Desktop arena (02b and 05): ~4.0-4.4% of pixels have luma above 230 (p99 ~234).
    - Mobile 03: 4.7% (p99 ~251).
    - Hangar 01: 0.15%.
- **The capture itself is valid.**
  - No blank shots, console/page errors or failed requests.
  - Inputs reached gameplay (arena, fighting, playerMoveId heavy then special).
  - The 0.19% diff between 04 and 05 could partly be a timing miss, but most likely the special just has very little visual.
- **Performance context.** The runner is a headless 3-vCPU virtual M1 with a paravirtual GPU. Sibling games hit ~60 fps on it, so the 9.3 fps here is a real relative gap. The engine-reported 60 fps is wrong.
- **Files not captured.** Mobile 04 and 05 were not captured, by design. Desktop 1280x720 01/02/04/05 exist but neither judge analyzed them.

## (7) Screenshot evidence

All in /tmp/qr/game-captures/out/showcase-mech-hangar/:

- `contact-sheet.png`: overview of all shots (2432x1200).
- `desktop-1920x1080__01-title.png`: dark hangar (luma ~30), default Aegis build. Canvas is 1590 CSS px wide beside the DOM builder column with ASSET PASSPORT.
- `desktop-1920x1080__02-opening.png`: hangar after swapping in Vanguard Hull/Gauntlets; only a small regional pixel change.
- `desktop-1920x1080__02b-arena-opening.png`: arena at full width, teal wash, ~4% clipped mid band, DOM guard/power HUD, 190 draws, 2880x1620 render.
- `desktop-1920x1080__03-mid.png`: mid-fight. ~20-25% of pixels changed (movement/camera), same flat lighting.
- `desktop-1920x1080__04-action.png`: heavy attack, no visible flash/VFX colors.
- `desktop-1920x1080__05-special.png`: special attack, 0.19% pixel change vs 04, so effectively invisible.
- `desktop-1280x720__03-mid.png`: same look at 720p, rendered at 1920x1080, 15.6 fps.
- `desktop-1280x720__01-title.png`, `__02-opening.png`, `__02b-arena-opening.png`, `__04-action.png`, `__05-special.png`: present but not analyzed.
- `mobile-390x844__01-title.png` and `__02-opening.png`: cramped 585x676 hangar canvas under the panel stack, dark.
- `mobile-390x844__02b-arena-opening.png`: arena 585x1266 (half native resolution), brighter and washed out (luma ~93).
- `mobile-390x844__03-mid.png`: near-white clipping in the center band where the fighters stand (4.7% of pixels with luma above 230), 32.5 fps.

# Orbital Defense (`showcase-orbital-defense`)

## Final scorecard: Orbital Defense (showcase-orbital-defense)

None of the 33 categories had judges more than 2 points apart. The largest gaps were 0.5 points, so no category needed a tie-break. I still tried to open two PNGs with Read (`desktop-1920x1080__04-action.png`, `mobile-390x844__03-mid.png`). Both came back empty, so the final scores reconcile the two judges' numeric pixel analysis and code findings, not a direct look at the images.

| Category | Final | Judge A | Judge B | Justification |
|---|---|---|---|---|
| environment_world | 0.5 | 1 | 0.5 | 87–94% of each frame is the flat #05080f clear color, with no sky, stars or nebula. Both measurements describe an empty void. |
| modeling_assets | 0.5 | 0.5 | 0.5 | 0 GLBs. 33 primitive nodes (12x16 spheres, tori, boxes). Drones are pink balls. |
| texture_quality | 0 | 0 | 0 | No textures anywhere. |
| material_quality | 1 | 1 | 1 | Everything visible is flat emissive. The opaque 1.13x emissive shell hides the only PBR surface (the planet). |
| pbr_credibility | 0.5 | 0.5 | 0.5 | No visible specular or Fresnel. The metal stations are tiny and have no IBL to reflect. |
| lighting | 1 | 1.5 | 1 | The lights exist, but there is no lit surface on screen: no terminator, rim or day/night side. |
| shadows | 0 | 0 | 0 | None authored, none visible. |
| ambient_lighting | 0.5 | 0.5 | 0.5 | `lights.ambient(0.18)` silently turns IBL off, leaving flat fill only. |
| ibl_reflections | 0 | 0 | 0 | IBL is disabled and there is no HDRI. |
| tone_mapping | 3 | 3 | 3 | The rgba16f + ACES path works and nothing clips, but there are no highlights for it to roll off. |
| color_management | 3 | 3 | 3 | The palette is coherent but uses stock Tailwind colors. No gamma errors, but nothing to grade. |
| anti_aliasing | 2.5 | 3 | 2.5 | MSAA is on, but DPR is pinned to 1. The disc edge steps hard (204→9 luma in 1–2 px) and the hairline tori shimmer. |
| postprocessing | 1.5 | 1.5 | 1.5 | Bloom 0.32 at 1-mip quality has no visible halo, and its color param is dropped. Fog is invisible against the void. |
| vfx | 0 | 0 | 0 | No explosions, muzzle flash or trails. The evidence's "particle-heavy" claim is false. |
| particles | 0 | 0 | 0 | No particle or flipbook usage. |
| animation_quality | 1 | 1 | 1 | Translation along polar paths only. Nothing spins or has secondary motion. |
| character_presentation | 0.5 | 0.5 | 0.5 | The player and enemies are a few-pixel emissive spheres with no silhouette. |
| camera | 2.5 | 2.5 | 2.5 | Static fov 42. The planet is centered but small (~14% of frame). Stray orbit drags move the view. No shake or punch. |
| composition | 1.5 | 1.5 | 1.5 | A small disc in an empty frame with HUD in the corners. On mobile the HUD covers the top half. |
| scale_depth_perception | 1 | 1 | 1 | No parallax, size reference or shading falloff. Everything reads as flat 2D vector shapes. |
| atmospheric_effects | 0.5 | 0.5 | 0.5 | The "atmosphere" is an opaque emissive ball, not a Fresnel or additive limb. |
| gameplay_readability | 3 | 3 | 3 | Cyan-friendly / pink-hostile color coding works, but entities are a few pixels across and there is no hit feedback. |
| ui_hud | 2 | 2 | 2 | Generic panels showing debug data (checksum, SYSTEMS list). innerHTML is rebuilt every frame, which breaks the buttons. |
| typography | 2.5 | 2.5 | 3 | Default sans with weak hierarchy, made worse by the engineering strings. |
| game_feel | 1 | 1 | 1 | From code: no shake, hit-stop or popups. Kills just vanish. |
| controls | 3.5 | 3.5 | 3.5 | Keyboard loop works (score went 0→166). HUD buttons are dead, orbit conflicts with play, no touch controls. |
| physics_feel | 1.5 | 2 | 1.5 | Kinematic radius checks with no momentum, knockback or impact response. |
| sound_audio | 0 | 0 | 0 | Silent: no `createGameAudio`, no audio assets. |
| loading_transitions | 3 | 3 | 3 | Ready in ~0.3 s with no errors, but no title screen, intro or wave transitions. |
| polish_juice | 0 | 0.5 | 0 | No feedback, tweening, banners or flashes. The shield is only a torus toggle. |
| mobile_presentation | 1 | 1 | 1 | Renders at 1x on a 3x device. HUD covers the top half. No touch input, so it is unplayable. |
| performance | 7 | 7 | 7 | 60 fps, 8–16 draw calls, ~15–20 MB heap. Trivial content, so this says little about engine efficiency. |
| overall_visual_quality | 1 | 1 | 1 | A placeholder vector-era sketch: a flat teal disc, hairline rings and dots on black. |

## What looks poor

- **Empty frame:** 87–94% of every desktop frame is flat #05080f. There are no stars, nebula, skybox or depth layers.
- **Planet:** the center is a uniform, unlit teal/cyan disc (~#94DFD6 / #678286 depending on capture) with one bright blotch. This is the opaque emissive "atmosphere" shell covering the real planet, so there is no surface detail, terminator, rim or limb glow.
- **Rings and actors:** two hairline tori cross the equator and alias. The player, drones and bolts are untextured spheres a few pixels wide, and drones read as pink dots.
- **Combat and shield:** combat produces no visible change. The five desktop shots are nearly identical (meanLuma 14.8–15.2) and brightFraction stays ~0.006 during the action shot. Kills just make dots disappear, and the shield pulse adds only a faint dark tint.
- **Bloom:** bloom does nothing visible. The disc edge drops from 204 to 9 luma in 1–2 px with no halo.
- **HUD:** generic dark dashboard panels in the corners show a replay checksum, a SYSTEMS list and "one mounted Aura app runtime" to the player.
- **Mobile:** HUD panels fill the top ~half to two-thirds of the screen and the play field is squeezed into a strip. The canvas is rendered at 390x844 and upscaled 3x, so it looks soft. There are no touch controls.

## Why

Root-cause split (average of both judges): engine 5%, defaults 20%, assets 32%, game 25%, authoring 18%.

- **Assets (32%): the assets are weak, not badly rendered.** The scene has 0 GLBs, 0 textures and 0 VFX sheets, only 12x16 primitives. No rendering fix can make a pink sphere read as a drone.
- **Game (25%): the content is under-authored.**
  - The main art choice, an opaque emissive shell at 1.13x, deletes the only lit surface.
  - Animation is translation-only.
  - Gameplay is visually empty: no hit, kill, damage or shield feedback, and no audio.
  - The HUD is rebuilt with innerHTML every frame and was designed as a debug panel, not for players.
  - The camera is static and far out, and orbit stays enabled during play.
- **Defaults (20%): lighting, materials, post and AA are all hurt by engine defaults.**
  - `lights.ambient()` silently disables IBL.
  - The safe-basic profile pins DPR to 1.
  - Bloom defaults to 1-mip performance quality and drops `color`.
  - Emissives sit near LDR, so the HDR/ACES/bloom path has nothing to work with.
  - Fog is capped and pointless against a void.
- **Authoring (18%): the work was optimized for evidence, not pixels.** It targeted evidence globals and claim text (including the false "particle-heavy" claim), recorded the route as blocked instead of sourcing art, and never looked critically at the frames.
- **Engine (5%): no missing renderer capability is the cause.** The engine already has `SpriteFlipbook`/`effects.flipbook`, an HDR target with ACES, bloom, IBL/HDRI environments and GLB loading. It just isn't used. The engine-side problems are the silent IBL kill, the dropped bloom color param and the DPR-1 profile cap, which sit at the boundary between engine and defaults. There are no console errors, banding or broken rendering.

## Largest improvements (ranked)

1. **Planet:** delete the opaque emissive shell. Replace it with a 64+ segment planet with albedo, normal, night-lights and cloud maps, lit by one hard sun directional light so it shows a terminator. Add a transparent additive Fresnel atmosphere limb.
2. **Environment:** add a space HDRI/skybox, a parallax starfield and nebula layers, and remove `lights.ambient(0.18)` so IBL comes back and the metal stations reflect something. This fills the 87–94% void.
3. **Actors:** replace the sphere actors with GLB models: an interceptor, 2–3 drone silhouettes and modeled stations, scaled up 2–3x for readability. Give them spin, banking and thruster glow.
4. **VFX:** use `effects.flipbook` and additive particles for muzzle flash, bolt trails, drone explosions with debris and shockwave, planet-impact flashes and shield ripples. Push emissives above 1.0 so bloom actually fires.
5. **Render settings:** set pixelRatio to min(DPR, 2) with dynamic resolution on mobile, bloom quality balanced or higher with the color param honored, and finer sphere and torus tessellation.
6. **HUD:** render it once and update only the text nodes, which also fixes the dead Reset/Pause buttons. Remove the checksum and SYSTEMS list. Use a diegetic integrity ring around the planet, a heat gauge, a display typeface and a slim mobile top bar.
7. **Juice:** add camera shake and punch, hit-stop, score popups, wave banners, a planet damage flash, and a title / game-over flow.
8. **Audio:** use `createGameAudio` for fire, explosion, shield and alarm SFX, plus a music bed.
9. **Mobile:** add touch rotate/fire/shield controls and a portrait framing where the planet fills the screen width.
10. **Camera:** lock or remove `interactions.orbit()` during play. Pull the camera in or tilt it so the planet and rings fill 50–60% of frame height.
11. **Engine defaults:** `lights.ambient` should not silently kill IBL, safe-basic should not cap high-DPR devices at 1, and default bloom should use more than one mip.

## Verdict: full-rebuild

Both judges independently chose full-rebuild, and I agree. Nothing on screen is worth keeping visually:

- Every visible asset is a placeholder primitive.
- The one art decision (the emissive shell) is wrong.
- VFX, particles, audio, textures, environment and juice are all at 0 and have to be built from nothing.
- The HUD has to be redesigned as well as restyled, and mobile needs a new layout and new input.

Polish can't save it because there is nothing to polish. Only the gameplay loop (rotate, fire, shield, reset, pause), deterministic replay and performance headroom carry over. The engine fixes it needs are small default changes, not new capabilities, so the rebuild is content and authoring work on the existing renderer.

## Capture caveats

- **No direct viewing:** neither judge could view the PNGs (Read returned empty), and my own attempts on `desktop-1920x1080__04-action.png` and `mobile-390x844__03-mid.png` also returned empty. Every visual claim comes from numeric pixel analysis (histograms, luma grids, edge profiles), `report.json` and code research. Fine details such as the exact aliasing and how HUD text renders are not directly verified.
- **Inconsistent measurements:** void fraction is 87% (A) vs 94% (B), and disc extent is ~480x360 (A) vs ~600x240 (B). These likely come from different thresholds or bounding methods (B's box probably includes the rings). The conclusion is the same either way.
- **Local build, not production:** production returns 404, so this capture is a local build served from 127.0.0.1 or the runner.
- **Capture is otherwise clean:** 60 fps, 8–16 draw calls, no console, page or request errors. Scripted input reached gameplay (score 0→166, action condition hit).
- **Stills limit some scores:** game feel, physics, controls and audio scores come from code and capture data, not from what the frames show.
- **Coverage:** desktop 1920 and 1280 have 5 shots each and mobile has 3. Neither judge reported on the 1280x720 01/02/04/05 shots.

## Screenshot evidence

All files are in `/tmp/qr/game-captures/out/showcase-orbital-defense/`.

- `contact-sheet.png`: all 13 tiles share one layout, a central bright disc on near-black with HUD in the corners.
- `desktop-1920x1080__01-title.png`: 87–94% void, a uniform teal disc, HUD panels top-left and top-right, score 0, 6 drones, meanLuma 14.8.
- `desktop-1920x1080__02-opening.png`: the same as title. Score 166 and one projectile, which is too small to change the frame statistics.
- `desktop-1920x1080__03-mid.png`: the same composition with tiny drone dots near the ring tips. No visual change from the earlier shots.
- `desktop-1920x1080__04-action.png`: saturated pixels double to ~10.4k (drone clusters and bolts) but brightFraction stays ~0.0065. Hard 204→9 disc edge, no bloom or explosion.
- `desktop-1920x1080__05-shield.png`: the shield adds a faint #303039 tint (~17k px) and otherwise matches 04. The shield effect does not read.
- `desktop-1280x720__01-title.png`, `__02-opening.png`, `__04-action.png`, `__05-shield.png`: captured but not individually analyzed by either judge.
- `desktop-1280x720__03-mid.png`: the same scene scaled down. Disc #5a6b6e, meanLuma 17.9, 15 draw calls.
- `mobile-390x844__01-title.png`: 1170x2532 output from a 390x844 backing canvas. HUD panel fill (#191c25, ~687k px) covers the top ~half over the planet, and the bottom third is empty.
- `mobile-390x844__02-opening.png`: HUD panels (#313a40) still dominate the upper screen, the play area is squeezed, and there are no touch controls.
- `mobile-390x844__03-mid.png`: the top 4 of 6 grid rows are HUD color (~#1a2530), then a narrow scene band, then black. About 13% non-background.

# Turbo Drift Circuit (`showcase-turbo-drift-circuit`)

| Category | Final | Judge A | Judge B | Justification |
|---|---|---|---|---|
| environment_world | 3 | 3 | 3 | One untextured GLB (28 flat materials, 0 textures), sphere-on-cylinder trees, box crowds and torus tyre walls on a 500-unit box ground; road std is about 2.7 per channel. |
| modeling_assets | 3 | 4 | 3 | The hero car (5.4k tris, base colour only) is the weakest model on screen at 1/6 the opponent's density, and the scenery is primitives counted as instances. |
| texture_quality | 2 | 2 | 2 | No textures on track or venue; the procedural normal/roughness maps never rasterise (27 "recorded only" warnings). |
| material_quality | 3 | 3 | 3 | Flat scalar PBR; grass and asphalt differ only by albedo, and roughness is uniform. |
| pbr_credibility | 3 | 3 | 3 | The BRDF is sound, but its inputs are untextured scalars lit by an LDR indoor studio IBL outdoors. |
| lighting | 4 | 4 | 4 | Key plus rim is a reasonable intent, but the ambient is dead, the point lights are invisible, mean luma is 70-93, and only 0.2% of pixels are bright. |
| shadows | 2 | 2 | 2 | One shadow map covers the 500-unit ground with no CSM, so the car shadow is about 7x2 texels; the shadow pass skips instances; contact shadows are faked with boxes. |
| ambient_lighting | 3 | 3 | 3 | A flat warm studio IBL fill; the 8-tap post-tonemap SSAO contributes almost nothing and the contactOcclusion node is dead. |
| ibl_reflections | 2 | 3 | 2 | The procedural indoor softbox is 8-bit and does not match the outdoor scene or the salmon backdrop, and there is no SSR. Judge B's lower score fits the mismatch better. |
| tone_mapping | 3 | 4 | 3 | ACES is fixed at exposure 1 and the authored exposure is dropped; blacks are lifted (nothing below 5) and almost nothing clips. Muddy compression supports the lower score. |
| color_management | 4 | 4 | 4 | The sRGB path is correct, but the palette is desaturated mud (saturation 0.15-0.23) under a flat salmon band. |
| anti_aliasing | 3 | 4 | 3 | FXAA only at DPR 1; mobile renders at 1/9 of native pixels and is upscaled. The mobile softness decides it. |
| postprocessing | 3 | 3 | 4 | Nothing reaches the 0.68 bloom threshold, so bloom is invisible; SSAO is negligible; no motion blur or DoF in a racer. The chain adds nothing visible. |
| vfx | 4 | 4 | 4 | Drift ribbons, smoke, boost rings and speed lines exist but are built from boxes and spheres. |
| particles | 3 | 3 | 3 | One 420-particle fountain with fixed-size billboards and opaque sphere smoke; no soft or lit particles. |
| animation_quality | 3 | 3 | 3 | Rigid car transforms with no wheel steer, suspension or body roll; crowds and flags are static. |
| character_presentation | 3 | 3 | 3 | The hero car fills about 18-24% of frame height, reads small and low-fidelity, and has no grounding. |
| camera | 6 | 6 | 6 | A competent chase rig (smoothing, shake, FOV punch, finish blend), but FOV and distance were tuned for a composition gate. |
| composition | 4 | 4 | 4 | Flat horizontal bands of sky, mud and HUD; no focal lighting on the car; the HUD band takes a large share of the frame. |
| scale_depth_perception | 3 | 3 | 3 | Fog density 0.0027 is effectively off, so there is no aerial perspective, and the sky is a flat clear colour. |
| atmospheric_effects | 2 | 2 | 2 | No sky dome, sun, haze, dust or volumetrics. |
| gameplay_readability | 5 | 5 | 5 | Road and kerbs read and the HUD tracks gate, gap and position, but low contrast hurts reading the racing line. |
| ui_hud | 4 | 4 | 4 | An information-rich DOM web dashboard, not a racing HUD; it eats screen space. |
| typography | 4 | 4 | 4 | System Inter pills in a landing-page title style, with no motorsport display face. |
| game_feel | 5 | 5 | 5 | Plenty of juice in code (countdown, drift, ghost, shake), undercut by about 20 fps. |
| controls | 5 | 5 | 5 | Full keyboard and touch set works; the start lights advance only while throttle is held, which is odd. |
| physics_feel | 4 | 5 | 4 | Arcade solver with Rapier collision, not observable from stills; speed reads 4.92 at both 02 and 03, so it is capped or stale. Took the conservative score. |
| sound_audio | 3 | 3 | 3 | Synthesised oscillator WAVs; the engine loop switches on and off with no RPM pitch. |
| loading_transitions | 5 | 5 | 5 | Ready in about 4.1 s with 3.6 MB and zero errors; a start-light ceremony but no designed loader; 3+ WebGL contexts. |
| polish_juice | 5 | 5 | 5 | Many juice systems, but primitive VFX on an untextured world mutes them. |
| mobile_presentation | 3 | 3 | 3 | DPR 1 on a DPR 3 device (11% of native pixels), HUD and touch controls crowd the portrait view, and the 04-action shot is missing. |
| performance | 3 | 3 | 3 | 19.7 fps at 1080p (p95 83 ms) against about 60 for sibling games on the same runner, with only about 130 draw calls; engine telemetry falsely reports 60. |
| overall_visual_quality | 3 | 3 | 3 | Untextured flat-colour track, flat salmon backdrop, lollipop scenery, no shadows, muddy tone. Reads as an early-2000s tech demo. |

No category differs between the judges by more than 2 points; the largest gap is 1. Where they differed by 1, I picked the score that better fit the shared evidence. I tried to read the PNGs myself and got empty results, the same as both judges.

## What looks poor
- The sky is a flat salmon/peach clear-colour strip (#df9e86 to #eca88c) with no gradient, sun, clouds or horizon falloff.
- The asphalt and ground are a large flat grey-brown area: road std is about 2-6 luma steps, with no aggregate, tyre marks, wear or kerb paint detail.
- Foliage is olive "lollipop" blobs (sphere on cylinder). Crowds are boxes and tyre walls are tori.
- The red hero car is a small patch in the centre-left with no visible cast shadow, so it floats.
- Tone is murky and low-contrast: mean luma 70-93, no true blacks, 0.2% bright pixels, saturation 0.15-0.23. The intended "golden hour" reads as mud.
- There is no depth falloff: far geometry has the same contrast as near geometry.
- Bloom, AO and fog are all effectively invisible.
- A dense DOM dashboard HUD and a navy control strip cover the bottom of the frame and look like a web page.
- Mobile renders at 1x on a 3x screen, so it is blurry and crowded by HUD and touch controls.
- Desktop stutters at about 20 fps.

## Why
Root-cause split: engine 25%, defaults 15%, assets 30%, game 19%, authoring 11%.

- **Assets (30%): the assets themselves are weak, not just badly rendered.** The track is a Blender-script GLB with zero textures and 28 flat materials. The hero car (5.4k tris, base colour only) is worse than the opponent (31k tris). The scenery is 43 instanced primitive calls.
- **Engine (25%): the renderer is missing needed capabilities.**
  - No CSM on the root path, and the single shadow map is fitted to the 500-unit ground, so the car shadow is sub-texel.
  - The shadow pass ignores instancing.
  - colorGrade.exposure is dropped and ACES is fixed; there is no AgX/Neutral option.
  - Generated IBL is LDR and 8-bit-quantised before lighting.
  - Post runs in RGBA8 after tonemapping.
  - Bloom is a single 4 px blur.
  - ProceduralTexture has no rasteriser, so those maps are silently dropped.
  - AO and contact-AO are mutually exclusive.
  - fps telemetry is wrong.
- **Defaults (15%):** the safe-basic profile sets pixelRatio 1 and FXAA only, which is what causes the 1/9-resolution mobile render.
- **Game (19%): lighting, environment and post are mis-authored.**
  - Indoor studio IBL on an outdoor scene.
  - Flat #df967d clear colour instead of a sky or HDRI.
  - Fog at 0.0027, effectively off.
  - Dead 1.16 ambient and invisible point lights.
  - Bloom threshold that nothing reaches.
  - Plastic-scratch maps assigned to grass.
- **Environment is under-authored:** no grandstands, fencing, gravel traps or decals.
- **Animation is simplistic:** rigid bodies with no wheel steer or suspension.
- **Gameplay is visually empty:** the systems exist, but primitive VFX means they don't land.
- **Camera:** competent, but FOV was tuned to a gate, so the car is small.
- **Authoring (11%):** 92 capture-mode branches put art into the evidence frames rather than the shipped frame, and gate-chasing beat art direction.

## Largest improvements (ranked)
1. **Textured circuit:** replace turboCircuitEnvironmentV2 with tiling asphalt albedo, normal and roughness (aggregate and tyre marks), kerb and paint decals, grass and gravel materials, and real GLB barriers, fencing and grandstands.
2. **Outdoor lighting:** use an outdoor HDRI (environments.hdri) as both background and IBL, add a sun disc and horizon gradient, raise fog to about 0.02 with a sky-matched colour, and delete the dead ambient.
3. **Engine shadows:** fit shadows to the camera frustum or enable CSM with texel snapping, make the shadow pass support instancing, and drop the fake box contact shadows.
4. **Engine tone and post:** honour exposure or expose the tonemapping operator (AgX/Neutral), run post in HDR before tonemapping, and use multi-mip bloom.
5. **Engine default DPR:** set DPR to min(devicePixelRatio, 2) and add MSAA or TAA. This fixes mobile.
6. **Hero car:** at least opponent quality, with normal, metal-roughness and AO maps, clearcoat paint, spinning and steering wheels, and body roll.
7. **Performance:** profile the 20 fps result (post chain, 4096 shadow over the 500-unit bounds, CPU cost) and fix the fps telemetry.
8. **Foliage and crowds:** replace lollipop trees and box crowds with alpha-cutout foliage GLBs and crowd cards or meshes, and fix or drop the procedural maps.
9. **Racing HUD:** speed/tach dial, minimap, motorsport typography, and a slim mobile control strip in safe areas.
10. **Authoring cleanup:** remove the 92 capture forks, retune FOV for feel with speed-dependent FOV, and add sampled engine audio with RPM pitch mapping.

## Verdict
**substantial-rebuild.** The game logic, controls, camera rig and juice systems are worth keeping, so a full rebuild isn't justified. Polish alone can't fix it, though: the whole visible world and the hero asset have to be replaced, and the renderer needs real capability work (shadows, HDR post, exposure, DPR, procedural texture rasterisation, instanced shadows) before any re-authoring will show on screen. Both judges reached the same verdict independently.

## Capture caveats
- Neither judge nor I could view any image: the Read tool returned empty for every PNG. All visual claims are inferred from numeric pixel statistics, HUD text, report.json and the code audit, so smoke appearance, silhouettes and HUD layout are unverified by eye.
- The mobile run has only 3 of 4 shots (04-action is missing; confirmed in the directory listing). Judge B's statement that no shots were missing is wrong.
- The evidence speed is 4.92 at both 02-opening and 03-mid, so one snapshot may be stale.
- The engine reports 60 fps while the harness measured 19.7; I treated the harness number as authoritative.
- The runner is a headless paravirtual-GPU macOS machine, so absolute fps is pessimistic, but the gap to sibling games stands.
- Captures are from the production URL at pixelRatio 1.

## Screenshot evidence
All files are in `/tmp/qr/game-captures/out/showcase-turbo-drift-circuit/`.
- `contact-sheet.png` / `contact-sheet.html`: index of all shots; 0 console errors, 0 page errors, 0 failed requests.
- `desktop-1920x1080__01-title.png`: title and countdown at speed 0, L93. Peach sky band, grey-brown midground, dark HUD band; 158 draw calls.
- `desktop-1920x1080__02-opening.png`: t=2.1 s, banding nearly identical to the title, HUD shows 177 km/h; 131 draw calls.
- `desktop-1920x1080__03-mid.png`: t=9.6 s held drift, L73. #222-#333 greys make up 37% of pixels; flat road (std about 2.7); red car accent (#9b1921), yellow kerb (#eedc55), olive foliage; drift smoke flagged.
- `desktop-1920x1080__04-action.png`: completely flat salmon sky field (#e09f86, std 9), khaki midground, car and kerb accents at bottom centre, navy control strip; highest contrast (luma std 47.5).
- `desktop-1280x720__01-title.png`, `__02-opening.png`, `__04-action.png`: lower-resolution versions of the same states; not individually analysed by either judge.
- `desktop-1280x720__03-mid.png`: same drift at 720p, L69, 93 draw calls, 23.2 fps. p99 Laplacian of 136 indicates aliased edges.
- `mobile-390x844__01-title.png`: 1170x2532 image upscaled from a 390x844 canvas; very soft (mean gradient about 0.5); HUD band in the bottom quarter.
- `mobile-390x844__02-opening.png`: salmon sky band, red car at about 55% height, blue touch controls along the bottom.
- `mobile-390x844__03-mid.png`: darker drift frame with flat grey asphalt (std 2-8) on the right half; upscale blur throughout.

# Skyline Runner (`showcase-skyline-runner`)

# Skyline Runner (showcase-skyline-runner): final visual scorecard

Neither I nor either judge could view the screenshots. The Read tool returned empty results for `desktop-1920x1080__03-mid.png` and `mobile-390x844__03-mid.png`. All visual evidence below therefore comes from the judges' PIL colour dumps, `report.json`, and the code research. No category differed by more than 2 points, so no screenshot tie-break was required. The one 2-point split (controls) I settled from `/tmp/qr/game-captures/out/report.json`: `moveChangesX` is `false` in some probes and `true` in others.

## (1) Scorecard

| Category | Final | Judge A | Judge B | Justification |
|---|---|---|---|---|
| environment_world | 3 | 3 | 3 | Untextured flat-shaded Kenney kit, 4-triangle ledge cards, a 1.9x-stretched backdrop card and emissive box "sky bands". The frame is almost all one blue hue. |
| modeling_assets | 2 | 2 | 2 | The live hero is a 4-triangle PNG card. Three clashing styles share the frame: paper card, flat low-poly, and untextured high-poly (tea house, robot). |
| texture_quality | 2 | 2 | 2 | The world has 0 textures. The only textures are the card PNGs. The ghost's 4K PBR maps are discarded by a colour override. |
| material_quality | 2 | 2 | 2 | Flat colour materials, including 76 untextured phong-converted ones. Authored metal and clearcoat values do nothing without IBL. |
| pbr_credibility | 1 | 1 | 1 | Engine bug X1 (ambient light with no environment) zeroes specular, so everything reads as diffuse plastic. |
| lighting | 3 | 3 | 3 | Five act directionals plus a studio rig plus point lights over a heavy flat ambient. There is no clear key light and little modelling of form. |
| shadows | 2 | 2 | 2 | The world does not cast shadows. One shadow map is fitted to all bounds, and a fake torus serves as the contact shadow. |
| ambient_lighting | 2 | 2 | 2 | A constant ambient term of 0.36 to 0.76. SSAO is set too weak to matter and the contact-AO node does nothing. |
| ibl_reflections | 0 | 0 | 0 | No HDRI. IBL is forced off by X1, so there are no reflections at all. |
| tone_mapping | 3 | 3 | 3 | Fixed ACES at exposure 1, and the grade's exposure setting is dropped. Mid-grey image with under 1% highlights. |
| color_management | 3 | 3 | 3 | A near-monochrome saturated royal blue (~70% of pixels in four blue clusters). Poor separation between hero, platforms and background. |
| anti_aliasing | 2 | 2 | 2 | pixelRatio 0.7: the canvas is 1344x756 at 1080p and 320x591 on a 1170x2532 phone (~5-6% of native pixels). |
| postprocessing | 3 | 3 | 3 | Bloom 0.1, weak SSAO and a contrast/saturation grade. Only the first fog node is used. Low impact but no artifacts. |
| vfx | 2 | 3 | 2 | Feedback is emissive tori, capsules and boxes shown as badges for 0.36-1.05 s. Geometric placeholders, not authored effects. |
| particles | 2 | 3 | 2 | The particle pool exists but is built from primitives. No sprite or flipbook effects, and no ember or sentry events fired during capture. |
| animation_quality | 1 | 1 | 1 | The card hero has procedural sway only and no clips (`availableClips: []`). The only skinned motion is the robot's "Standing" loop. |
| character_presentation | 1 | 1 | 1 | A paper-doll card hero in a 3D world. This is the worst single failure. |
| camera | 4 | 5 | 4 | A functional side-scroll follow with lead, but no shake. The coarse frames are nearly identical, so the camera barely moved. |
| composition | 3 | 3 | 3 | A uniform blue field with no focal hierarchy. A DOM strip takes the bottom ~1/6 on desktop and a dark panel sits at the bottom on mobile. |
| scale_depth_perception | 2 | 2 | 3 | Flat card backdrop, weak fog (density 0.009), no AO and no world shadows. Depth reads as layered cutouts. |
| atmospheric_effects | 2 | 2 | 3 | Only the first fog node reaches the renderer. The sky is a hex clear colour plus emissive boxes. No physical sky or haze. |
| gameplay_readability | 3 | 3 | 3 | Guide boxes make platforms readable but look like debug geometry. The blue wash hurts hazard contrast. Repeated deaths near spawn. |
| ui_hud | 4 | 4 | 4 | A functional generic DOM panel with a full key legend and claim text. Too big on mobile. |
| typography | 4 | 4 | 4 | Clean default Inter with no game-specific display type. |
| game_feel | 3 | 3 | 3 | From code and data: Rapier controller, badge feedback, no shake. Checkpoint and finish were never reached. |
| controls | 4 | 5 | 3 | The binding set is rich and `jumpChangesY` is always true. But `moveChangesX` is mixed true/false across probes, `resetWorks` and `pauseFreezesSimulation` are always false, and x keeps snapping back to spawn. |
| physics_feel | 4 | 4 | 4 | The Rapier kinematic capsule is solid on paper. Frequent early deaths suggest unforgiving tuning. Not observable in stills. |
| sound_audio | 3 | 3 | 3 | From code: synthesised oscillator and noise WAVs plus ambience beds. No sampled audio or dynamic mixing. |
| loading_transitions | 4 | 4 | 4 | First draw at ~4.2-4.9 s and 33 MB at ready, including unused heavy assets. There is an act title card but no designed loader. |
| polish_juice | 2 | 3 | 2 | No shake, squash/stretch or hit-stop. Guide boxes cover the authored ledges. Effort went into review-capture forks instead. |
| mobile_presentation | 2 | 2 | 2 | 320x591 backing on a DPR-3 phone. The HUD panel eats the screen and the scene is small and flat blue. |
| performance | 2 | 3 | 2 | 11.4-13.5 fps measured (p50 83 ms, p99 300 ms) against ~60 fps for peer games on the same runner. The engine's fps:60 counter is wrong. |
| overall_visual_quality | 2 | 2 | 2 | Cards in an untextured flat world, no IBL, sub-native resolution and a monochrome blue grade. Early tech-demo tier. |

## (2) What looks poor
- **The hero:** a flat 4-triangle PNG card that reads as a pink and white blob. It has no volume and does not change when the camera angle does.
- **Mixed art styles:** card ledges and a backdrop stretched 1.9x vertically sit on an untextured flat-shaded Kenney world, next to an untextured skinned robot and a 118k-triangle untextured tea house.
- **Debug look:** pale untextured guide boxes are painted over every ledge in normal play.
- **Colour and value:** the frame is a single saturated royal-blue wash (#003fb8, #005cd5, #0068e5). Mean luma is ~97-100 with about 1% darks and under 1% highlights, so there is no value hierarchy.
- **Sky:** there is none, only a hex clear colour and emissive box bands.
- **Materials:** metals and clearcoats reflect nothing.
- **Shadows:** a fake torus provides the contact shadow and the world casts none.
- **Resolution:** everything is soft and upscaled from a 0.7 render scale. Mobile is the worst at ~5% of native pixels.
- **Feedback:** geometric emissive tori and capsules used as badges.
- **HUD:** a generic Inter web panel and key legend across the bottom ~1/6 of desktop and a large dark block on mobile.
- **Play:** the runner died 4-5 times near spawn at 11-13 fps and never progressed.

## (3) Why
Root-cause split, averaged from both judges: engine 20%, defaults 15%, assets 25%, game 25%, authoring 15%.

- **Assets (25%).** Both the asset choice and the rendering are at fault.
  - The shipped hero is a weak asset: a 4-triangle card.
  - A decent 48k-triangle textured runner exists but is rendered badly. A flat #21c4df override at 62% opacity strips its PBR maps, and it is used only as the ghost.
  - The 80k Meshy V2 hero is loaded but unused.
  - The world kit and tea house are untextured, so those assets are weak in themselves.
- **Game (25%).**
  - The route sets pixelRatio 0.7 and the safe-basic profile.
  - It enables guide-box overlays in public play.
  - It sets `castShadow: false` on the world.
  - It mounts five act light rigs plus `lights.studio` at once.
  - It uses no sky or HDRI, primitive sky bands, and a hand-picked monochrome palette.
- **Engine (20%).** The renderer lacks two capabilities the game needs: a default environment/IBL and DPR-aware resolution.
  - X1: an ambient light with no environment forces environment-map intensity and specular to 0 (`agent-api/index.ts:12693-12707`).
  - The grade's exposure setting is dropped, and tone mapping is fixed ACES with no AgX or Neutral option.
  - Only the first fog node is honoured (`index.ts:12743`).
  - The contact-AO node does nothing.
  - The fps telemetry reports 60 when the real rate is ~12.
- **Defaults (15%).** Safe-basic pins pixelRatio to 1 and ignores devicePixelRatio. FXAA is the only AA, and the SSAO kernel does not scale with resolution.
- **Authoring (15%).** 51-92 `capture=review` forks and a ~3.9k-line `main.ts` put effort into evidence instead of the shipped frame. Primitive gates were gamed via `instances.*`.

Fault by area:
- **Lighting:** too many lights, no key light and over-driven ambient.
- **Camera:** generic but adequate.
- **Materials:** inert without IBL.
- **Post:** weak but not harmful.
- **Environment:** under-authored, with no sky, depth layering or texture.
- **Animation:** simplistic, procedural sway on a card.
- **Gameplay:** visually empty. The VFX are primitives and the deaths at spawn mean no later acts were ever shown.
- **Performance:** likely route-side CPU/JS cost (308 MB heap, 33 MB of assets, multiple rigs, evidence plumbing in the loop), since peer games reach ~60 fps on the same runner.

## (4) Largest improvements (ranked)
1. Replace the card hero with the existing 48k `skylineHeroRunner` or the Meshy V2. Rig it via meshy-cli, play real run/jump/dash/land clips through AnimationController, and remove the colour override.
2. Fix engine X1 and add an HDRI (`environments.hdri`) as both sky and IBL. Remove the box sky bands and the stretched backdrop, or rebuild it as properly sized layered parallax.
3. Commit to one art style: a textured modular PBR platform kit instead of card ledges and the flat Kenney kit. Remove the public guide-box overlay.
4. Drop pixelRatio 0.7 and use min(DPR, 2) with dynamic resolution. Change the engine's safe-basic default to match and add MSAA or TAA.
5. Profile and fix the ~12 fps result: drop the unused tea-house and 80k Meshy loads, take the evidence plumbing out of the frame loop, and fix the fps counter.
6. Rebuild lighting: one key directional with CSM, world `castShadow` on, a hemisphere or IBL fill, and remove the studio rig and redundant act rigs. Pass grade exposure through to tone mapping and expose AgX/Neutral.
7. Restructure the palette: dark foreground silhouettes, a warm rim on the hero, cool desaturated distance, and real fog density. Honour per-act fog nodes.
8. Replace the badge VFX with flipbook effects (dust on land, dash trail, ember impact) and add shake, hit-stop and squash/stretch.
9. Tune the level: clearer gap and hazard reads, coyote time and jump buffering. Fix reset and pause.
10. Make a compact game HUD: hide the legend after a few seconds, shrink the mobile panel, remove claim text, use a display typeface.
11. Delete the `capture=review` forks so screenshots show the shipped game.

## (5) Verdict
**Substantial rebuild.** Both judges agree. The engine path works: Rapier controller, input, HUD, audio cues, act structure. But the core of the visual presentation has to be replaced: the hero, platforms, sky and environment, lighting rig, and render resolution. Two engine fixes (X1/IBL and pixelRatio defaults) are also required. Polish alone cannot turn a card hero in an untextured monochrome world into credible 3D. It does not need a full rebuild, because the game logic, physics, controls and level structure can be kept.

## (6) Capture caveats
- No screenshot could be viewed by me or either judge, since the Read tool returned empty results. Every visual statement comes from PIL colour grids and palettes, `report.json` stats and code research. Confidence is lower on composition, aliasing and asset-look scores.
- The scripted held-run plus periodic-jump input died repeatedly near spawn: player x stayed at 0.80-1.42 and kept snapping back to the 0.7995 spawn value, with deaths at 4-5. The mid and action shots therefore show the respawn area, not later acts.
- `moveChangesX` is mixed true/false across probes. `resetWorks`, `pauseFreezesSimulation`, `checkpointProgression` and `finishProgression` are false in every probe.
- Performance was measured on a headless 3-vCPU virtual M1 with a paravirtual GPU. The comparison against peer games holds; the absolute numbers do not represent user hardware.
- Game feel, controls, physics, audio and loading were scored from code and report data, not from stills.

## (7) Screenshot evidence
All files are in `/tmp/qr/game-captures/out/showcase-skyline-runner/`. Contents come from pixel stats, since none could be viewed.

| File | What it shows |
|---|---|
| `contact-sheet.png` (2432x1200) and `contact-sheet.html` | Overview of all shots. |
| `desktop-1920x1080__01-title.png` | Blue-dominant frame (four blue clusters ~74%) with a pale #d9dce8 HUD/legend band at the bottom (~16%). Mean luma 99, 1169 colours, canvas 1344x756. Player at spawn, 125 draw calls. |
| `desktop-1920x1080__02-opening.png` | Nearly identical to the title shot, so the camera barely moved. Player x 1.42, already 1 death by 2.3 s. |
| `desktop-1920x1080__03-mid.png` | Blue field with a pink and white card hero left of centre (#fff0f3 to #f6dce0), a beige patch at the left edge and a pale legend band at the bottom. Score 50, deaths 4. |
| `desktop-1920x1080__04-action.png` | Same palette. Player snapped back to spawn x 0.7995, deaths 5. |
| `desktop-1280x720__01-title.png`, `__02-opening.png`, `__04-action.png` | 720p counterparts. Neither judge described them. |
| `desktop-1280x720__03-mid.png` | Same blue palette with a bright cell (hero) left of centre. Canvas 896x504, player at spawn. |
| `mobile-390x844__01-title.png` | Blue field (#0060dc ~25%) with dark navy bands at top and bottom. Lowest colour variety (745). Canvas 320x591 on a 1170x2532 backbuffer. |
| `mobile-390x844__02-opening.png` | Palette almost identical to the title shot. Player falling into a gap (y -0.97, vy -8.4). |
| `mobile-390x844__03-mid.png` | Mostly blue, hero blob about 60% down, dark slate HUD/controls panel over the bottom ~15-20%. Player grounded at x 0.90. |

# Courier Rush (`showcase-courier-rush`)

| Category | Final | Judge A | Judge B | Justification |
|---|---|---|---|---|
| environment_world | 2 | 2 | 2 | A city.block prefab built from untextured boxes, with emissive slabs faking light pools. About half of each desktop frame is near-black void and there is no sky. |
| modeling_assets | 3 | 3 | 3 | The only real asset is the 80k-tri Meshy van, which is a single mesh with no separate wheels. Everything else is primitives, and the traffic cars are flattened to solid colour. |
| texture_quality | 2 | 2 | 2 | The city has no textures at all. The X6 colour override throws away the traffic and parcel textures. Only the van keeps its 2K PBR set. |
| material_quality | 2 | 2 | 2 | Wet asphalt, clearcoat and metal values are authored but reflect nothing because IBL is zeroed. Surfaces read as flat diffuse plus point-light hotspots. |
| pbr_credibility | 1.5 | 1 | 2 | The BRDF core is sound, but with no specular environment metals and clearcoat render as plastic. The fake emissive "reflection" slivers contradict the lighting. |
| lighting | 3 | 3 | 3 | A flat 1.25 ambient wash plus scattered range-10 point lights. The frame is split between crushed black and blown hotspots. |
| shadows | 3.5 | 4 | 3 | One 4096 moon map is adequate on the van. Point lights cast no shadows, and the shadow pass skips instanced props. |
| ambient_lighting | 2 | 2 | 2 | Constant ambient with no environment term or useful AO, so every surface gets the same fill. |
| ibl_reflections | 0 | 0 | 0 | The ambient-light bridge (X1) forces IBL to 0, and there is no HDRI or SSR. A "wet street" with no reflections at all. |
| tone_mapping | 3.5 | 4 | 3 | ACES on a 16F target, but exposure is hard-coded (X2). Highlights clip (the 1280 mid shot) and shadows crush to black. |
| color_management | 4 | 4 | 4 | sRGB plumbing is correct. The palette is a narrow, oversaturated teal/navy neon on black with no grade, and post runs in 8-bit after ACES. |
| anti_aliasing | 3 | 3 | 3 | DPR is pinned to 1 with FXAA only. Mobile renders a 390x844 buffer upscaled 3x (canvas w=390 at DPR 3 is confirmed in the report). |
| postprocessing | 3 | 3 | 3 | neonBloom (threshold 0.68 clamped, softKnee 0.5) blows out large slabs. Fog density 0.0018 is effectively off. No SSR or DoF. |
| vfx | 2 | 2 | 2 | Two game.effects calls, a box/torus ember, box speed streaks and a pulsing torus ring. |
| particles | 1 | 1 | 1 | No real particle systems: rain is 30 static boxes and speed lines are boxes. |
| animation_quality | 1 | 1 | 1 | The van only yaws, with no wheel spin, suspension or body roll. Traffic slides rigidly. Both judges took this from code. |
| character_presentation | 2.5 | 3 | 2 | There are no characters. The hero van is the one decent asset, but it is small in frame and has no motion life. |
| camera | 3 | 3 | 3 | A high (10.4u), 25-degree, FOV 56 board-game follow cam with no speed-FOV, shake or look-ahead. |
| composition | 3 | 3 | 3 | A centred grey road column between dead black masses, with no focal hierarchy. On mobile the HUD dominates. |
| scale_depth_perception | 2 | 2 | 2 | No aerial perspective (fog is about 0). The uniform ambient and repeated undetailed boxes read as toy scale. |
| atmospheric_effects | 1.5 | 1 | 2 | Static box rain, no haze or volumetrics, no wet sheen, and a flat #030711 clear colour for sky. |
| gameplay_readability | 5 | 5 | 5 | The dispatch card, job counter, timer, strikes, zone ring and nav arrow make the objectives clear. The dark world and bloom blowout hurt reading traffic and curbs. |
| ui_hud | 5 | 5 | 5 | A functional, generic DOM HUD with touch buttons. It covers too much of the mobile viewport. |
| typography | 5 | 5 | 5 | Clean default Inter with no brand voice. |
| game_feel | 2.5 | 3 | 3 | An arcade kinematic van, but no shake, no speed FOV and a silent engine. Measured 5-8 fps (see performance) pulls the practical feel below 3. |
| controls | 5 | 5 | 5 | WASD/arrows, handbrake, interact and touch all work. The harness drove pickup, carry and strikes. |
| physics_feel | 3 | 3 | 3 | No physics world. A kinematic car with no weight transfer, and collisions are strikes rather than impacts. |
| sound_audio | 1.5 | 1 | 2 | Ten oscillator cues. The engine and ambient-city loops are defined but never played. |
| loading_transitions | 4 | 4 | 4 | Ready at 3.6-8.3 s with no designed intro. The 1920 run lost its WebGL context and went black with no recovery UI. |
| polish_juice | 2 | 2 | 2 | A DOM strike flash, a ring pulse and two effect calls. No shake, no hitstop and no audio feedback loop. |
| mobile_presentation | 3 | 3 | 3 | It is functional, but it renders at 1/9 of native pixels, and the HUD and touch panels crowd the playfield. |
| performance | 2 | 5 | 2 | I checked report.json and judge B is right. The harness measured 7.1, 5.0 and 8.1 fps (p50 frame time 116-183 ms) against 57-60 fps for Orbital Defense and Vault Breakers on the same runner. The engine's "fps: 60" is a broken self-report. On top of that: about 1,530 draw calls at title, and the 1920 run lost its context. |
| overall_visual_quality | 2.5 | 2.5 | 2.5 | A programmer-art box city in a black void with neon emissives, blown bloom, no reflections and CSS-resolution rendering. One good van. |

## What looks poor

- Half the desktop frame is near-black void (dark fraction 0.34-0.46). The rest is a narrow grey road corridor and flat dark-teal box masses. There is no facade texture, no sky, and more than 70% of 8x8 blocks are flat.
- Emissive slabs stand in for light pools and road reflections. Bloom blows them into contiguous white/yellow clipped blocks (in 1280 mid, an area of about 160x270 px at 245 or above).
- The "wet asphalt" night street shows zero reflections, and metal and clearcoat look like plastic.
- Traffic cars are single-colour lacquer toys. Rain is 30 static boxes. Speed streaks are boxes.
- The hero van is small under a high, distant camera, and has no wheel spin, suspension or body roll.
- Fog is effectively off, so there is no depth falloff and no haze around the practical lights.
- Edges are soft and jaggy because of DPR 1 plus FXAA. Mobile is a 3x upscale, and its HUD and touch panels dominate the portrait frame.
- At 1920x1080 the WebGL context was lost, and the 03-mid and 04-action frames are identical black frames.
- The game runs at 5-8 fps.

## Why

Root-cause split: engine 30%, defaults 20%, assets 20%, game 20%, authoring 10%. This is about the judges' mean, with engine weighted up for the context-loss, fps-counter and batching defects.

- **Engine (30%).**
  - Whenever an ambient light exists, X1 zeroes all IBL and specular. That makes the authored wet-street look impossible.
  - X2 hard-codes exposure and drops colorGrade.exposure.
  - The bloom bright pass clamps the threshold to [0,1] with a hard step, and post runs in 8-bit after ACES.
  - The shadow pass ignores instanced and batched geometry.
  - X6: model() colour overrides replace GLB textures.
  - There is no webglcontextlost restore path, so the 1920 run goes permanently black.
  - The fps counter self-reports 60 while real frames take 116-183 ms.
  - There is no automatic static batching, which leaves about 1,500 draw calls.
  - The renderer lacks capabilities this genre needs: SSR, real particle rain, volumetric haze, and an HDR-correct bloom.
- **Defaults (20%).** The safe-basic profile pins DPR to 1. city.block, the agent-facing "night city" prefab, is itself primitive boxes with emissive fakes. There is no default night environment.
- **Assets (20%).** The van is good but rendered badly: no IBL, and a single mesh that blocks wheel animation. There is no textured modular city kit. The traffic assets are decent but get rendered as flat colour.
- **Game (20%).**
  - Ambient was pushed to 1.25 to fight the black void.
  - Colour overrides strip the traffic textures.
  - Fog density is set to 0.0018.
  - The camera is high and distant (10.4u).
  - About 80 box dressing nodes.
  - The engine and ambience loops are never played.
  - Gameplay is visually empty: no traffic life, no splashes or smoke, and almost no juice.
- **Authoring (10%).** Effort went into the ?capture=review fork and into firefighting bloom blobs rather than fixing the lighting model of the shipped frame. The environment is under-authored and the animation is simplistic.

## Largest improvements

1. **Engine IBL and environment.** Stop zeroing IBL when an ambient light is present, and ship a night-city HDRI default. Author environments.hdri and add SSR on the road, then delete the emissive reflection and tyre-contact slivers.
2. **Performance and stability.** Batch or instance the static city to cut about 1,500 draw calls to a few hundred, and re-measure against the roughly 60 fps sibling games. Handle webglcontextlost and restore. Fix the engine fps counter.
3. **City kit.** Replace the city.block boxes with a textured modular city kit (CC0 Kenney or Quaternius) with emissive window maps, signage, sidewalks, props and wet-road decals.
4. **Lighting and tone.** Drop ambient to about 0.15-0.2. Wire colorGrade.exposure through. Use an unclamped HDR bloom threshold above 1 with softKnee about 0.1-0.2. Set real fog density around 0.02-0.03, or add volumetric haze.
5. **Traffic textures.** Remove the colour overrides on traffic and parcel, or tint without replaceSurfaceTextures.
6. **Resolution.** Use pixelRatio min(DPR, 2) and add TAA or MSAA alongside FXAA.
7. **Camera.** Pull to about 6u at about 12 degrees, FOV 60, with speed-FOV and strike shake.
8. **Van and atmosphere.** Split the wheels for spin and steer, add suspension roll and pitch, and add tyre smoke, splashes and real particle rain.
9. **Audio.** Cue the engine loop with rpm-mapped playbackRate and the ambient-city bed, and replace the oscillator cues with sampled SFX.
10. **Mobile HUD.** Shrink and translucify the HUD and touch panels, and give them a brand type and colour system.
11. **Evidence.** Delete the ?capture=review fork so screenshots show the shipped game.

## Verdict

**substantial-rebuild.** Both judges independently reached this. The gameplay loop, controls, HUD and objective chain work and can be kept, and so can the van asset. What looks poor is structural, though, not polish:

- The world is primitive boxes.
- Engine defaults make the core look impossible: no IBL in a wet-night-street concept.
- Performance is 5-8 fps, about 8x worse than sibling games on the same runner.
- There is a context-loss crash with no recovery.

Fixing it means replacing the environment kit, re-lighting from scratch, rebatching the scene, and engine fixes (X1, X2, bloom, context restore, DPR). That is too much to call polish. It is not a full rebuild, because the gameplay code, assets pipeline and HUD survive.

## Capture caveats

- **Nobody actually saw the images.** The Read tool returned empty content for every PNG for me too, the same as for both judges. All visual statements come from pixel statistics in report.json and the judges' numpy/PIL analyses, plus code research. Fine-detail claims are inferred, including whether the clipped block in 1280 mid is bloom or a HUD element.
- **The performance disagreement was settled from data.** I resolved it from report.json, not from screenshots. The measured fps of 7.1, 5.0 and 8.1 (p50 frame time 183, 183 and 116 ms) comes from the harness. The engine's "fps: 60" is a broken self-report, so judge A's 60 fps claim is wrong.
- **Desktop 1920x1080 run.** The context was lost about 8-10 s in (CONTEXT_LOST_WEBGL, then RenderDeviceError in setRenderTarget). Shots 03 and 04 are identical black frames (both 208,859 bytes, luma 1.7), and the strike condition was not hit.
- **Desktop 1280x720 run.** It completed and the strike was hit at 11.5 s. Draw calls drop from about 1,530 at title to 436-545 in mid/action, which suggests culling or a different camera view; the mid shot's luma of 106 with dark fraction 0.07 points the same way.
- **Mobile run.** There is no 04 shot. Draw calls fall from 1,015 to 213.
- **Runner.** Headless 3-vCPU, ANGLE Metal paravirtual GPU, production URL. Siblings reach about 60 fps on it, so the frame-rate gap is real rather than a runner artefact.

## Screenshot evidence

All in `/tmp/qr/game-captures/out/showcase-courier-rush/`. Metrics are from `/tmp/qr/game-captures/out/report.json` (games[8]).

- contact-sheet.png and contact-sheet.html: composite of all shots, mostly dark tiles, two black 1920 tiles and bright mobile tiles.
- desktop-1920x1080__01-title.png: spawn, awaitingPickup. Luma 42, dark 0.46, 1,530 draw calls. Black left third, grey road column, teal box masses, DOM dispatch card.
- desktop-1920x1080__02-opening.png: van moving. Luma 44, dark 0.41, small orange beacon accent.
- desktop-1920x1080__03-mid.png: black frame (luma 1.7) after context loss.
- desktop-1920x1080__04-action.png: byte-identical black frame. The sim froze and no strike happened.
- desktop-1280x720__01-title.png: luma 46, dark 0.40, 1,535 draw calls. Same layout as 1920 title.
- desktop-1280x720__02-opening.png: luma 49, dark 0.34. Opening drive.
- desktop-1280x720__03-mid.png: carrying, speed 10.4. Luma 106, bright 0.064, a large clipped white/yellow bloom block in the upper-centre/right, 436 draw calls.
- desktop-1280x720__04-action.png: strike reached. Luma 56.5, dark 0.53, 545 draw calls.
- mobile-390x844__01-title.png: 1170x2532 image of a 390x844 buffer. Luma 104, bright 0.10. HUD and touch panels dominate.
- mobile-390x844__02-opening.png: carrying (touch pickup worked). Luma 108, 3x-upscale signature.
- mobile-390x844__03-mid.png: job 2, strikes 2. Luma 90, bright centre bloom blob, grey HUD rows, 213 draw calls.

# Patrol Wing (`showcase-patrol-wing`)

| Category | Final | Judge A | Judge B | Justification |
|---|---|---|---|---|
| environment_world | 2 | 2 | 2 | Untextured 40x40 island, a flat ocean plane and a flat sky color fill most airborne frames. |
| modeling_assets | 3 | 3 | 3 | The 60k-tri Meshy hero is good; the 108-tri script drones and primitive props are poor. |
| texture_quality | 2 | 2 | 2 | Only the aircraft and rocks/conifers are textured. Terrain, ocean, pad and drones are flat color. |
| material_quality | 2 | 2 | 2 | With IBL zeroed (X1), the ocean and metals reflect nothing and everything reads as flat diffuse. |
| pbr_credibility | 2 | 2 | 2 | The BRDF core is sound, but with no specular IBL or Fresnel the water and metal are not credible. |
| lighting | 3 | 3 | 3 | Warm key plus flat ambient. Point lights are static, the sun disc is misaligned with the key, contrast is low. |
| shadows | 1 | 1 | 1 | Only a pad spot light casts shadows. The plane casts nothing in flight. |
| ambient_lighting | 2 | 2 | 2 | Constant ambient with a fake hemisphere factor. No sky/ground bounce, no SH. |
| ibl_reflections | 0 | 0 | 0 | IBL is forced off by ambient-without-environment (X1). No HDRI. |
| tone_mapping | 4 | 4 | 4 | ACES on HDR works. Authored exposure is dropped (X2) and the image is under-driven with almost no highlights. |
| color_management | 5 | 5 | 5 | Linear/sRGB pipeline is correct. The murky navy palette is an authoring problem. |
| anti_aliasing | 4 | 4 | 4 | MSAA, but DPR is capped at 1, so mobile renders at about 1/9 of native pixels and is soft. |
| postprocessing | 2 | 2 | 2 | Bloom 0.12 is effectively off, fog is cosmetic (~6% at 60u), no aerial perspective or speed effects. |
| vfx | 2 | 2 | 2 | Muzzle, tracer, impact and wake effects are single emissive primitives teleported into place. |
| particles | 1 | 1 | 1 | Zero particle or flipbook usage. No smoke, contrails or explosions. |
| animation_quality | 3 | 3 | 3 | Arcade transforms only, no control-surface animation. The plane hovers at 0 airspeed. |
| character_presentation | 3 | 3 | 4 | The hero GLB is credible, but it is tiny in frame, its metals read dark and it has no shadow or rim that follows it. |
| camera | 3 | 3 | 3 | FOV 47, no bank roll, no speed FOV. Airborne shots frame empty sky with no horizon. |
| composition | 2 | 2 | 2 | Small plane on a monochrome field. The right glass panel takes about 14% of the width. |
| scale_depth_perception | 2 | 2 | 2 | No aerial perspective, sky gradient, cloud parallax or ground reference in flight. |
| atmospheric_effects | 1 | 2 | 1 | No sky model, HDRI or volumetrics. Clouds are glass spheres and sky bands/haze are emissive boxes. |
| gameplay_readability | 3 | 3 | 3 | Objective text is clear, but there is no on-screen orientation or target cue once airborne. |
| ui_hud | 3 | 3 | 3 | Functional glass panel, but it shows a debug evidence strip and a "PROTOTYPE" label. Mobile uses 11 buttons. |
| typography | 4 | 4 | 4 | Legible, generic web UI type. Judged from DOM only. |
| game_feel | 3 | 3 | 3 | No aerodynamics, no shake, no speed FOV. Hovering at 0 airspeed kills momentum. |
| controls | 4 | 4 | 4 | Complete key map plus touch. The pitch convention and crash risk make takeoff unforgiving. |
| physics_feel | 2 | 2 | 2 | No flight sim (Rapier is used only for sensors). Holds altitude at 0 airspeed. |
| sound_audio | 3 | 3 | 3 | Synthesized WAVs. The engine bed follows throttle in volume but not in pitch. |
| loading_transitions | 4 | 4 | 5 | Ready in about 3-5s with no errors, but step() runs before the renderer mounts (empty frame) and there is no transition polish. |
| polish_juice | 2 | 2 | 2 | No shake, speed lines or particles. Debug copy and capture forks are shipped. |
| mobile_presentation | 3 | 3 | 3 | 59.4fps, but a 1x backing store on a DPR-3 screen plus a dense control block. |
| performance | 5 | 4 | 7 | Measured 15.8fps at 1080p (p50 66.6ms, 60/80 frames over 33ms), 54.8 at 720p, 59.4 on mobile. Better than most of the fleet on this weak runner, but not "60 across all runs". |
| overall_visual_quality | 2 | 2 | 2 | Reads as an early tech demo. Only the hero GLB is near modern quality. |

Performance was the only category where the judges were more than 2 points apart. I could not settle it by looking at the screenshots: every Read of the PNGs, including the contact sheet, returned empty. I used report.json instead. Judge B's "holds 60 fps across all runs" comes from the engine's self-reported fps (60 everywhere). The harness measured 15.8 / 54.8 / 59.4. Across the fleet on the same runner, Orbital Defense (59.6), Vault Breakers (57.4) and Aurora Lander (52.2) hold up at 1080p, while most others score 0.5-26. Patrol Wing's 1080p collapse is real and resolution-dependent, so 5 is the honest middle. The 1-point differences were resolved toward the better-evidenced judge: atmospheric 1 (no sky model at all), character 3 (the plane is tiny and dark in frame), loading 4 (empty first frame).

## What looks poor

- Airborne frames (03-mid, 04-action, 05-banked-fire) are dominated by one exact color, RGB (28,68,97). I measured 69% of the full 1080p mid frame, 67% of the 720p action frame and 62% of the 720p banked-fire frame, HUD included. That color runs top to bottom with no gradient, horizon, clouds, sun or terrain. The plane is a small dark blob in the center.
- On the pad (01/02) the island is flat, untextured green facets, and the ocean is a flat plane with no reflection.
- The palette is muddy and low-contrast: mean luma about 55-74, bright fraction 0-0.4% in flight.
- The atmosphere is built from primitives: clouds are 7 translucent glass spheres, and sky bands, haze and speed streaks are floating emissive boxes.
- The hero aircraft's metals read dark because nothing reflects, and nothing casts a shadow in flight.
- Enemies are 108-tri faceted polyhedra. Muzzle, tracer, impact and wake effects are single emissive blobs, with no smoke, contrails or explosions.
- A 276px dark glass panel on the right carries debug copy ("Backend", "Flight mode authored", "Sensors") and an "AURA3D PROTOTYPE" label.
- Mobile is visibly soft (1x render on a 3x screen), and an 11-button touch block takes the bottom ~17-20%.
- 1080p desktop drops to 15.8fps.

## Why

Attribution: engine 18%, defaults 22%, assets 17%, game 33%, authoring 10%.

- **Assets:** the hero aircraft is a good asset that is rendered badly; its metal and roughness channels need IBL, which is zeroed. The drones (108-tri script output) and all props/VFX (primitives) are weak assets.
- **Lighting:** the fault is mostly defaults plus game choices. An ambient light with no environment node silently disables IBL (X1). The sun disc is misaligned with the key light, and the point lights are static.
- **Camera:** the game's fault. FOV 47, no bank roll or speed kick, and nothing keeps the horizon in frame, so climbing frames pure background.
- **Materials:** the PBR values are reasonable (ocean metallic 0.28 / roughness 0.2), but they have nothing to reflect.
- **Post:** under-tuned. Bloom 0.12 with an 0.84 threshold, fog clamped to cosmetic levels, authored exposure dropped (X2), post-after-tonemap runs in 8-bit.
- **Environment:** badly under-authored. The game never uses environments.hdri, sky.dayNight or the engine water surface, and builds the sky from a clear color plus boxes and spheres.
- **Animation:** simplistic. Transform-only arcade flight with no stall model, so the plane hovers at 0 airspeed.
- **Gameplay:** visually empty in the action shots. No rings passed and no drones spawned in 03-05.
- **Renderer capability gaps:**
  - A single shadow map with no working CSM and nearest-compare sampling on the root bridge path.
  - The safe-basic default caps DPR at 1 (X3).
  - Resolution-dependent cost: the 1080p vs 720p gap with under 230 draw calls points to fill or post cost.
  - The engine fps counter reports 60 when the measured rate is 15.8.

The BRDF core and HDR target are fine, so the shading math is not the limit.

## Largest improvements

1. **Sky and IBL.** Use a golden-hour HDRI via environments.hdri, or sky.dayNight, as both background and environment, and delete lights.ambient. On the engine side, fix X1 so an ambient light no longer zeroes IBL. This fixes the empty airborne frames, hero metals and water in one move.
2. **Water and terrain.**
   - Replace the ocean with the engine water surface (normals, Fresnel, env/SSR reflection).
   - Replace the island with a 128+ splat-textured heightfield.
   - Add distant islands or coastline as a horizon reference.
3. **Flight and camera.** Enforce a minimum airspeed or stall/sink when throttle is cut. Use FOV 60-70 with a speed kick, roll-follow on bank, and keep the horizon framed.
4. **Resolution and performance.** Default DPR to min(dpr, 2) with adaptive resolution, profile the 1080p fill/post cost, and make the engine fps counter report measured frame time.
5. **Atmosphere.** Real aerial-perspective or height fog (density about 0.015-0.02) and billboard or volumetric clouds. Delete the glass spheres and emissive sky boxes, and align the sun with the key light.
6. **Enemies and VFX.** 5k+ tri PBR drone GLBs, particle contrails and smoke, flipbook explosions, and bloom actually enabled (threshold about 1.0 HDR, intensity 0.3-0.5). Stage ring 1 and the drone waves early.
7. **Shadows.** A directional shadow fitted to the plane (CSM or camera-following), or at minimum a contact/blob shadow.
8. **HUD.** Remove the evidence strip, the PROTOTYPE label and the capture forks (X10). Shrink to a compact flight HUD, and use a stick plus 2-3 buttons on mobile.
9. **Audio.** Map engine pitch to throttle/airspeed and add speed-scaled wind.

## Verdict

Substantial rebuild. The engine core (BRDF, HDR, ACES, linear pipeline) and the hero GLB are usable, so a full rebuild is not warranted. But polish alone will not save it:
- The sky, ocean, terrain, clouds, enemies and every VFX element are placeholders that must be replaced, not tuned.
- The flight model needs a stall/airspeed rule.
- Three engine defaults (X1 IBL suppression, X3 DPR 1, cosmetic fog/bloom clamps) need fixes at the engine level.

Roughly 60-70% of what is on screen gets replaced.

## Capture caveats

- Neither judge nor I could view any image; the Read tool returned empty for every PNG. All visual claims rest on PIL pixel statistics, report.json state, DOM text and the code research. Composition, typography, material look and VFX scores are lower-confidence.
- Judge B's 94-97% flat-color figure was probably canvas-only. My whole-frame measurement, HUD included, is 62-69%.
- Gameplay coverage is weak: by 03-05 the script had released throttle, leaving the plane at altitude about 35 and airspeed 0-3, with 0 rings passed and no live drones. Even so, empty sky is what a player who pulls up actually sees.
- Capture ran on a GitHub Actions headless runner (Apple M1 virtual, 3 vCPU, ANGLE Metal). Most games run under 26fps at 1080p there, so absolute fps is runner-depressed. The 1080p-vs-720p ratio for Patrol Wing still stands.
- Mobile has only 3 shots.
- No console, page or request errors were reported in the judges' evidence; the only engine warning was step() running before the renderer mounted.

## Screenshot evidence

All files are in /tmp/qr/game-captures/out/showcase-patrol-wing/.
- contact-sheet.png (and contact-sheet.html): overview of every shot. Not viewable.
- desktop-1920x1080__01-title.png: preflight on the pad. Pad tans, olive island greens and a flat navy field; dark HUD panel on the right; 79 draw calls.
- desktop-1920x1080__02-opening.png: takeoff (airspeed 21, alt 3). Island in the lower half, emissive sun cell top-right, about 50% flat sky.
- desktop-1920x1080__03-mid.png: alt 35.7, airspeed 3.4. 69% of the frame is exact RGB (28,68,97); tiny plane, no world; 19 draw calls.
- desktop-1920x1080__04-action.png: airspeed 0.3, 11 shots fired. Nearly empty navy frame with faint orange VFX; 3 draw calls.
- desktop-1920x1080__05-banked-fire.png: bank with fire. Orange emissive blobs (~5.8%) and some terrain creeping in; 226 draw calls.
- desktop-1280x720__01-title.png and desktop-1280x720__02-opening.png: 720p equivalents of the pad and takeoff shots. Not inspected individually.
- desktop-1280x720__03-mid.png: same empty-sky state as the 1080p mid shot.
- desktop-1280x720__04-action.png: 67% flat (28,68,97).
- desktop-1280x720__05-banked-fire.png: 62% flat (28,68,97).
- mobile-390x844__01-title.png: pad and island mid-frame, flat navy above, dark touch panel at the bottom. 374x650 backing store upscaled to 1170x2532.
- mobile-390x844__02-opening.png: muted green/brown horizon band, soft upscaled image.
- mobile-390x844__03-mid.png: airborne flat navy, small plane, control block at the bottom.
- /tmp/qr/game-captures/out/report.json: measured fps (15.8 / 54.8 / 59.4) vs the engine's self-reported 60, and fleet-wide 1080p fps for comparison.

# Siege Golf (`showcase-siege-golf`)

## 1. Scorecard

No category differs by more than 2 points between the judges; the largest gap is 1.0 (postprocessing). Under the rule, no tie-break was needed, so each final score is the mean of the two judges. I still tried to view the PNGs myself (`desktop-1920x1080__02-opening.png`, `mobile-390x844__02-opening.png`). Read returned an empty result for both, as it did for both judges. No final score comes from looking at the images.

| Category | Final | Judge A | Judge B | Justification |
|---|---|---|---|---|
| environment_world | 2.5 | 2.5 | 2.5 | Flat hex-colour sky over a 70x70 plane, 26 primitive hill and tree spheres, and a 4k-tri course GLB with flat normals and no UVs. |
| modeling_assets | 2.75 | 3 | 2.5 | About 130 primitives to about 14 GLBs. Only the barrel and the dressing crates are real authored props. The putter is boxes. |
| texture_quality | 1.5 | 1.5 | 1.5 | The world has 0 textures. The crate and plank PBR maps are deleted by the painted-material override (replaceSurfaceTextures). |
| material_quality | 2.5 | 2.5 | 2.5 | Flat `material.pbr({color})` everywhere. Grass, wood and stone differ only by hue. |
| pbr_credibility | 3 | 3 | 3 | The BRDF is sound, but its inputs are flat albedo and a peach studio probe reflected outdoors. |
| lighting | 3.75 | 4 | 3.5 | The key/fill/rim plan is sensible, but the result is a bright, even midday look (luma 145-154), not golden hour. |
| shadows | 3 | 3 | 3 | Fixed strength 0.32 on one 4096 map stretched over about 70 m. Objects float. |
| ambient_lighting | 3.25 | 3 | 3.5 | The studio IBL replaces ambient. No AO. |
| ibl_reflections | 2.5 | 2.5 | 2.5 | LDR 128x64 procedural studio probe quantized to 8 bits. No HDRI, no sky reflection. |
| tone_mapping | 3.75 | 4 | 3.5 | ACES on RGBA16F, but exposure is dropped and contrast/saturation clip the sky (17-28% of pixels at 250 or above). |
| color_management | 4.25 | 4.5 | 4 | sRGB is correct. The palette is coherent but monotone cyan and green, with no warm tones. |
| anti_aliasing | 4 | 4 | 4 | MSAA plus FXAA double-blurs. Mobile renders at 1x and is upscaled 3x. |
| postprocessing | 3.5 | 3 | 4 | Negligible bloom, flat cyan fog and FXAA. No AO, DOF or vignette. Post runs in 8 bits after ACES. |
| vfx | 2 | 2 | 2 | Trail, dust and aim line are built from spheres and boxes. No debris, splinters or cloth. |
| particles | 1.5 | 1.5 | 1.5 | No particle system. Pools of opaque spheres with no alpha falloff. |
| animation_quality | 3.75 | 4 | 3.5 | Rapier toppling is real. No swing, flag motion or foliage motion. Hard camera cuts. Scored from code. |
| character_presentation | 1 | 1 | 1 | No golfer. The avatar is a box-primitive putter. |
| camera | 3.75 | 4 | 3.5 | Phase framings are reasonable, but every change is a hard cut through a scene rebuild. The 0.16 m ball is too small to read. |
| composition | 4 | 4 | 4 | Workable horizon split (sky about 25%). Weak focal hierarchy. HUD intrudes, especially on mobile. |
| scale_depth_perception | 3.25 | 3.5 | 3 | Some fog depth. Identical faceted spheres give no scale cues. Ball and targets are too small. |
| atmospheric_effects | 3 | 3 | 3 | Single-tint exponential fog only. No sky gradient, sun disc or clouds. |
| gameplay_readability | 4.75 | 4.5 | 5 | Emissive aim line, rings and coral targets read well, and the HUD stats are clear. The ball is tiny and debug sliders add noise. |
| ui_hud | 3.75 | 3.5 | 4 | The DOM HUD works, but it shows solver/debug controls and reads like a tool panel. |
| typography | 4.25 | 4 | 4.5 | Legible but generic system font. Stars are text glyphs. No display face. |
| game_feel | 3.75 | 4 | 3.5 | Decent charge-release-topple loop. No hit-stop or shake. Rebuild hitches (P95 1100 ms). |
| controls | 5 | 5 | 5 | Clear, deterministic keyboard and mobile scheme, muddied by the exposed solver sliders. |
| physics_feel | 6 | 6 | 6 | Rapier rigid bodies and jointed stacks. The strongest system in the game. |
| sound_audio | 3 | 3 | 3 | Nine oscillator-synthesized WAVs. No recorded foley, no ambience. |
| loading_transitions | 3.5 | 3.5 | 3.5 | First draw at 2.2-3.9 s, no start screen, hard-cut rebuilds, and a renderSize [0,0] frame. |
| polish_juice | 2.5 | 2.5 | 2.5 | Only a star card, sphere dust and a sphere trail. |
| mobile_presentation | 2.25 | 2 | 2.5 | 1x render upscaled 3x. Dark HUD panels plus a bottom bar squeeze the 3D view. |
| performance | 2.75 | 3 | 2.5 | Harness-measured 7.1, 13.7 and 21.9 fps against about 60 for sibling games on the same runner. The cause is stalls from setScene rebuilds. |
| overall_visual_quality | 3 | 3 | 3 | Early-2000s tech-demo diorama. Only the physics feels modern. |

## 2. What looks poor

- **Sky:** one flat, clipped cyan colour (#a6e8ff / 167,232,255) across the top 22-30% of every frame. No gradient, clouds, sun disc or warm tone, so the "golden-hour-siege-yard" thesis is visually absent.
- **Ground and horizon:** large untextured mid-green fields (#509050, #70b070) with very low edge density (0.2-0.5% of pixels). The horizon is lumpy faceted sphere hills, and the trees are identical faceted spheres.
- **Course:** a flat-shaded procedural GLB of boxes, cylinders and slopes.
- **Props:** crates and planks render as flat coral boxes because their wood textures are painted over.
- **Ball:** too small to read at play distance.
- **Effects:** dust is opaque beige marbles, the trail is spheres, the aim line is a row of boxes, and the putter is three boxes.
- **Grounding:** shadows are faint (68% of the sun survives in shadow) and there is no AO, so objects float.
- **Fog:** uniform pale-cyan fog flattens depth.
- **Overall tone:** high-key image (mean luma 145-154) with no dark values.
- **Desktop HUD:** the right panel shows debug solver controls ("Aim offset 0.000", "Set power 1.900", "Strike set shot (J)").
- **Mobile:** the image is soft and blocky (84% of 3x3 blocks are uniform, which means a 1x render). Dark HUD blocks dominate the top and a control bar takes the bottom.

## 3. Why

Root-cause split (judge mean):

| Cause | Share |
|---|---|
| Engine | 13.5% |
| Defaults | 17.5% |
| Assets | 25% |
| Game | 29% |
| Authoring | 15% |

- **Assets are weak, not rendered badly.** The world is about 130 primitives plus a course GLB with no UVs and flat normals, so it cannot hold textures. There are no terrain, foliage, sky or golfer assets. The ball is 76.8k tris but has no texture. The barrel and dressing crates are the only decent assets.
- **Game code makes good assets look bad.** The painted-material override deletes the crate and plank PBR maps. That is a game choice, made worse by engine behaviour: replaceSurfaceTextures deletes maps instead of multiplying the tint.
- **Lighting is at fault.** It is a midday-bright setup with no low warm sun, and the point lights are invisible.
- **Materials are at fault.** Everything is flat colour with no roughness or normal variation.
- **IBL is at fault.** It is an LDR peach studio probe used for an outdoor scene.
- **Post is at fault.** FXAA runs over MSAA, post runs in 8 bits after ACES, there is no AO, and the colour grade drops exposure while contrast and saturation clip the sky.
- **Camera is at fault, through game architecture.** `app.setScene` rebuilds the whole scene on every camera phase. That causes the hard cuts, the 1.1 s P95 stalls, the 7 fps reading and the 0x0 render frame.
- **Engine defaults cap quality:**
  - safe-basic pixelRatio 1 (the cause of the mobile blur)
  - shadow strength fixed at 0.32
  - colorGrade exposure ignored
  - FXAA left on alongside MSAA
  - lights.ambient silently ignored when IBL is present
- **The environment is under-authored.** It has no sky dome, no HDRI, no splat terrain and no foliage instancing, and the fog colour is not matched to a sky.
- **Animation is simplistic.** Rigid toppling is the only real motion. There is no swing, no cloth and no foliage motion.
- **Gameplay is visually empty.** There are no hit-stop, shake, debris, splinter or sink effects.
- **Missing renderer capabilities:** no particle or billboard system in use, no contact-hardening or cascaded shadows, no exposed shadow strength, and no HDR post chain. These are real gaps, but they matter less than content and game architecture. The GGX/ACES/RGBA16F core is not the bottleneck.

## 4. Largest improvements, ranked

1. Build one persistent scene and blend between the phase cameras instead of calling `setScene` per phase. This removes the 1 s stalls, the 0x0 frames and the hard cuts.
2. Replace the course GLB and the 26 hill and tree spheres with a UV-mapped, smooth-normal terrain using splatted grass, dirt and stone PBR textures, plus instanced real hedge and tree GLBs and authored siege walls.
3. Add a golden-hour outdoor HDRI (`environments.hdri`) or `sky.dayNight`, shown as the background or a sky dome. Remove the studio probe and the flat background. Use a low warm sun with long shadows and match the fog to the horizon colour.
4. Keep the crate and plank PBR maps: drop the painted override, or add an engine tint-multiply mode. Replace the ball with a low-poly mesh plus a dimple normal map, and give it an outline or highlight so it reads.
5. Engine defaults:
   - shadow strength about 0.8-0.9, with tighter fitting or cascaded shadow maps (CSM)
   - pixelRatio `min(devicePixelRatio, 2)`
   - honour colorGrade exposure
   - turn FXAA off when MSAA is on
   - enable ambient occlusion
6. HUD: put the solver/debug controls behind a flag, collapse the mobile panel into a compact top strip, and use a game display font and icon stars.
7. Juice: soft-alpha dust sprites, splinter debris, 60-100 ms hit-stop, light camera shake, flag cloth, and a burst plus camera push when the hole is sunk.
8. Add a golfer or a rigged club swing, and recorded foley and ambience.

## 5. Verdict

**substantial-rebuild.** Both judges agree. Physics, controls and the BRDF/ACES core are sound and can stay, so a full rebuild is not justified. Polish alone cannot work: the world, terrain, sky and VFX content has to be replaced rather than tuned, the course mesh has no UVs so it cannot even take textures, and the per-phase scene rebuild is an architectural flaw that drives performance and camera problems. Engine defaults also need fixing, and those fixes help every game.

## 6. Capture caveats

- **Nobody visually inspected a screenshot.** Read returned empty for every PNG for both judges and for my own attempts. All visual claims rest on numeric pixel analysis, report.json and the code research. Composition, character and mobile-layout judgements are lower confidence.
- **The judges disagree on mobile HUD coverage.** A estimates a panel about 55% wide across the top 45%; B estimates dark blocks over about 30% of the top. Both agree the HUD heavily intrudes.
- **Three 1920 shots are frozen.** `desktop-1920x1080__03-mid`, `__04-action` and `__05-charge` are byte-identical (same size, 646,595 bytes). The game sat on the hole-complete card, so no action or charge-meter state was captured at 1920.
- **One 1280 shot caught a rebuild.** At 1280, `05-charge` recorded renderSize [0,0] and fps 0 mid-rebuild.
- **The fps figures conflict.** The engine self-reports 60 fps, but the harness measured 7-22 fps on a headless 3-vCPU virtual M1 with a paravirtual GPU. Use the harness numbers only for comparison with sibling games.
- **Some shots were never analysed.** `desktop-1280x720__01-title`, `__02-opening`, `__04-action` and `contact-sheet.png` (2432x1200) were not analysed by either judge.
- **Some scores are code-based.** Animation, game feel, controls, physics and sound cannot be seen in stills; they were scored from code.

## 7. Screenshot evidence

All files are in `/tmp/qr/game-captures/out/showcase-siege-golf/`.

| File | What it shows |
|---|---|
| `contact-sheet.png` | Composite of all shots, 2432x1200. Not inspected. |
| `desktop-1920x1080__01-title.png` | Flat cyan sky over the top quarter, green fields with coral clusters, a dark right HUD panel with debug sliders. 135 draw calls. |
| `desktop-1920x1080__02-opening.png` | Ball in flight. Coral targets and painted crates on the causeway, white dotted aim row, 4 dust puffs. 100 draw calls. |
| `desktop-1920x1080__03-mid.png` | Hole-complete card bottom-left ("1 stroke, par 2, ★★★"). Sky up to 25-30% of the frame, about 28% of pixels clipped. |
| `desktop-1920x1080__04-action.png` | Byte-identical to 03-mid (frozen). |
| `desktop-1920x1080__05-charge.png` | Byte-identical to 03-mid. No charge meter captured. |
| `desktop-1280x720__03-mid.png` | Second stroke in flight, mean luma 137, 21% clipped. 74 draw calls. |
| `desktop-1280x720__05-charge.png` | Aiming state while the engine reports renderSize [0,0] and fps 0. Heavier dark HUD area. |
| `desktop-1280x720__01-title.png`, `__02-opening.png`, `__04-action.png` | Not analysed. |
| `mobile-390x844__01-title.png` | 1170x2532 screenshot of a 1x backbuffer. Dark HUD panel at the top, "Hold to charge" bar at the bottom. Mean luma 125. |
| `mobile-390x844__02-opening.png` | Ball in flight. Large coral shape centre-frame, dark HUD over the top and right, coral control buttons. Mean luma about 107. |
| `mobile-390x844__03-mid.png` | Hole-complete card. 84% uniform 3x3 blocks confirm the 3x upscale. |

# Rooftop Buckets (`showcase-rooftop-buckets`)

# Rooftop Buckets (showcase-rooftop-buckets): final scorecard

## 1. Scorecard

| Category | Final | Judge A | Judge B | Justification |
|---|---|---|---|---|
| environment_world | 2.25 | 2 | 2.5 | The sky is three emissive box bands, the skyline is box towers with box window strips, and the crowd is cubes with sphere heads. My pixel check agrees: the top sixth is a flat [40,40,55] and colour changes in discrete steps. |
| modeling_assets | 2.75 | 3 | 2.5 | The backboard is a 12-tri box, the ball and rim are synth meshes and the venue is 1,280 tris. The good skinned 44k players and the 50k Meshy shooter are hidden. |
| texture_quality | 2 | 2 | 2 | Only the athlete albedo is textured. setMaterial wipes the GLB textures every frame. |
| material_quality | 2.5 | 2.5 | 2.5 | Flat material.pbr colours everywhere. Clearcoat and metal have nothing to reflect. |
| pbr_credibility | 2.25 | 2 | 2.5 | The BRDF is sound, but IBL and specular are zeroed because ambient is set with no environment. Ambient 1.32 dominates. |
| lighting | 3 | 3 | 3 | 11 lights are swamped by a lavender ambient. There is no key/fill hierarchy, and the play rig differs from the review rig. |
| shadows | 2.25 | 2.5 | 2 | One implicit directional shadow at a fixed 0.32 strength, plus 0.5-opacity ellipsoid blob shadows. Grounding is weak. |
| ambient_lighting | 2 | 2 | 2 | Constant ambient of 1.32 in #8098c8 with a fake hemisphere factor. No AO or IBL diffuse. |
| ibl_reflections | 0.25 | 0 | 0.5 | environmentMapIntensity is 0 and no HDRI is authored. Nothing reflects. |
| tone_mapping | 3.75 | 4 | 3.5 | ACES on RGBA16F, but the exposure setting is dropped and the image is mid-dark (luma about 76). Judge B overstated clipping: luma ≥250 is 0.2-1.1% and sits mostly in the HUD band. Still, a flat near-white block at y≈280-360 above the rim suggests an untextured, over-bright backboard or meter card. |
| color_management | 4.25 | 4.5 | 4 | The sRGB pipeline is correct. The dusk palette is coherent but over-unified into a low-contrast purple wash. |
| anti_aliasing | 4 | 4 | 4 | MSAA plus FXAA blurs twice. The mobile 683x1477 backbuffer is upscaled about 1.7x. |
| postprocessing | 2.75 | 2.5 | 3 | softKnee 0.5 bloom gives a milky mid-tone veil. Fog 0.005 does nothing visible. Post after ACES runs in 8-bit. |
| vfx | 2.25 | 2.5 | 2 | Sphere/box aim ribbon, torus halo, box rays and a net of 8 rigid cylinders. |
| particles | 0.5 | 0.5 | 0.5 | No particle systems anywhere. |
| animation_quality | 1.5 | 1.5 | 1.5 | Static statues driven by root rotation, squash-scale and sin sway. shooterAnimation was "Ready" in every capture. |
| character_presentation | 2.25 | 2 | 2.5 | Textured but rigid, scaled to 1.34-1.4x, with blob shadows. The defender is hidden in captures. |
| camera | 3 | 3 | 3 | One fixed camera at about 9 m with fov 48. No follow, shot cam or replay. 03 vs 04 differ by a mean abs diff of 2.7, which confirms the framing never moves. |
| composition | 3.5 | 3.5 | 3.5 | Centred hoop between HUD bands. The upper third is flat dark bands. The framing was fixed by hiding and scaling nodes. |
| scale_depth_perception | 3 | 3 | 3 | Fog is effectively zero, the skyline layers are flat, the ball is tiny and the athletes are enlarged. |
| atmospheric_effects | 1.5 | 1.5 | 1.5 | No visible fog, haze, shafts, stars or city glow. |
| gameplay_readability | 5 | 5 | 5 | Meter with a sweet zone, aim ribbon, shot clock and score/target are all present. The tiny ball hurts it. |
| ui_hud | 4.75 | 4.5 | 5 | Well structured, but generic rounded dashboard cards and a "Rapier Rim Physics" tech subtitle. |
| typography | 4.25 | 4 | 4.5 | Legible system sans. No display or broadcast face. |
| game_feel | 3.25 | 3.5 | 3 | Charge/release works and rim FX fires. No payoff on a make, and 0 makes were captured. |
| controls | 5 | 5 | 5 | Clear keyboard and 7 touch buttons. The meter timing is tight. |
| physics_feel | 5.75 | 6 | 5.5 | Rapier ball, compound rim/backboard colliders and a pass sensor. The strongest system in the game. |
| sound_audio | 2.5 | 2.5 | 2.5 | Synthesized WAVs played through raw new Audio(), cutting each other off. No ambience bed. |
| loading_transitions | 4.5 | 4 | 5 | Ready in about 3.1 s at 5 MB with no errors. No title or loading screen, and one empty frame from step-before-mount. |
| polish_juice | 2.25 | 2.5 | 2 | No particles, net motion, shake or celebration. |
| mobile_presentation | 3.5 | 3.5 | 3.5 | Portrait at 137 draws with touch buttons. Soft upscale, tiny court, and a heavy HUD share. |
| performance | 3 | 3 | 7 | Gap >2, so I decided it from report.json. The measured rAF rate is 7.6 fps at 1080p (p50 133 ms, 38 of 39 frames over 50 ms), 12.2 at 720p and 11.1 on mobile. The "fps: 60" Judge B used is the engine's self-reported value. Orbital Defense (about 59-60), Vault Breakers (about 57-59) and Aurora Lander (about 49-60) run far faster on the same runner, though many siblings are also at 7-15. |
| overall_visual_quality | 2.5 | 2.5 | 2.5 | A box-kit diorama washed in lavender with flat PBR, no IBL and statue athletes. Tech-demo tier. |

## 2. What looks poor
- The world is primitives. The sky is three hard-edged emissive bands (navy, magenta, orange) that step rather than blend. The skyline is box towers with box window strips. The crowd is cube torsos with sphere heads.
- The hero props are flat colour. The ball is plain orange with no seams or pebbling. The rim is untextured. In the centre column at y≈280-360 there is a flat near-white block, about [244,248,250] with no variation, which is most likely the backboard (or the meter card) reading as a blank white slab.
- A blue-violet ambient flattens the frame into a lavender/purple wash. The mid band averages about [89,91,111], with low local contrast and no specular highlights on steel or lacquer.
- Grounding is dark ellipsoid blobs. There are no readable cast shadows and no AO.
- The athletes are rigid statues that squash-scale and sway instead of animating.
- The fixed far camera makes the ball a few pixels across. Frames 03, 04 and 05 are near-identical (mean abs diff 2.7-3.9).
- The VFX are dotted sphere/box ribbons, tori and box rays. There are no particles and the net never deforms.
- Bloom adds a milky veil to the mid-tones, and fog is invisible.
- The HUD is generic dashboard cards with tech-marketing copy.
- Mobile is soft (683x1477 upscaled to 1170x2532), and the HUD crowds the narrow frame.

## 3. Why
Root-cause split (average of the two judges, which differed by 3 points or less per bucket): game code 34%, assets 21%, engine defaults 16%, authoring process 15%, engine capability 13%.

- **Assets: the assets themselves are weak, not just rendered badly.** The 12-tri backboard, 1,280-tri venue, untextured court, synth ball/rim and cube crowd are poor content. The exception is the good assets (skinned 191-joint textured players, Meshy shooter): they exist but are hidden. Separately, setMaterial overwrites GLB materials every frame, so even good textures are thrown away. That is bad rendering of assets, caused by the game code.
- **Lighting, camera, materials and post are all at fault.**
  - Lighting: ambient 1.32 is far too large, the rig is 11 lights, and there is no key light with shadow:true.
  - Camera: one fixed distant shot.
  - Materials: flat-colour PBR with no environment to reflect.
  - Post: softKnee bloom, invisible fog, and FXAA on top of MSAA.
- **The environment is under-authored.** The sky is boxes, there is no HDRI or sky dome, no skyline impostor, no atmosphere, and the crowd is placeholder.
- **Animation is simplistic.** Transform hacks on static meshes. The 4-clip rigged actors only mount under ?debug=animation.
- **Gameplay is visually empty.** A make produces no visual payoff (no net ripple, camera punch, particles or crowd reaction), and none was captured.
- **Engine defaults.** lights.ambient without an environment silently zeroes IBL and specular. Ambient is π-scaled. Root shadow strength is fixed at 0.32. colorGrade exposure is dropped. The neonBloom softKnee preset blooms mid-tones.
- **Engine capability gaps.**
  - The shadow pass ignores skinning.
  - The shadow map is fitted to camera-culled bounds with nearest-compare PCF.
  - There is a possible clip-sampling/bind-pose issue for skinned actors.
  - There is no particle system in use and no engine audio bus in use (whether those are missing or merely unused needs confirming).
  - The self-reported fps (60) disagrees with the measured rAF (7.6), which is an engine diagnostics bug.
- **Authoring.** Agents hid and scaled nodes to pass screenshots and kept separate review and play worlds, instead of building a single venue.

## 4. Largest improvements (ranked)
1. **Render the real skinned, textured athletes** with Ready/Shoot/Land/Contest clips, and delete the squash-scaled statues. Fix any engine clip-sampling/bind-pose bug and skinned-shadow support while doing this.
2. **Fix the lighting setup.**
   - Remove lights.ambient and author a night-city environments.hdri for IBL.
   - Cut the rig to one shadow-casting key, one rim and 2-3 practical floods.
   - Make shadow strength overridable (about 0.8).
   - Fix the engine trap where ambient zeroes IBL.
3. **Replace the box sky, box skyline and cube crowd** with an HDRI or sky dome, a textured skyline impostor with emissive window textures, and an instanced sprite or animated crowd.
4. **Stop setMaterial wiping GLB textures.** Ship a textured ball (seams plus pebble normal), a glass-and-frame backboard and a deforming net.
5. **Fix performance from 7.6 to 60 fps.** Instance or merge the roughly 200 primitive draws, cut the light count, and fix the self-reported-fps diagnostic.
6. **Add camera work:** ball-follow or rim cam on release, make replay or punch-in, and move the default framing closer.
7. **Add GPU particles** (swish sparks, ON FIRE flames, confetti), net ripple and rim/backboard shake.
8. **Fix post:** softKnee 0 with an HDR threshold, honour exposure, use MSAA or FXAA but not both, add visible distance haze, and raise the mobile pixelRatio cap or use dynamic resolution.
9. **Unify the review and play worlds.** Restyle the HUD as a sports-broadcast scorebug with a display face and drop the tech subtitle.
10. **Route audio through the engine bus** with polyphonic sampled ball/rim/swish sounds plus crowd and city ambience.

## 5. Verdict
**Substantial-rebuild.**

The parts worth keeping are real and solid: Rapier physics (5.75), controls, meter and readability (5), and HUD structure. Better assets already exist in the repo but are hidden.

Polish alone cannot fix it, because nearly every visual layer has to be replaced:
- environment geometry
- hero props
- the light rig and IBL
- animation (switching to the skinned actors)
- VFX and particles
- camera
- a 7x performance gap

Several root causes are also engine-side (ambient disabling IBL, fixed shadow strength, shadow pass ignoring skinning, dropped exposure). A full rebuild is not needed, because the gameplay loop, physics and input architecture are sound and carry over.

## 6. Capture caveats
- Nobody, including me, has visually inspected the screenshots. Every Read of the PNGs and of downscaled JPEGs (/tmp/qr/rbr/d03.jpg, /tmp/qr/rb/*.jpg) returned an empty payload in this session, and one attached mobile image came with no visible content. All visual claims come from pixel statistics (band means, clipping, frame diffs, centre-column samples), report.json, and the code audit (17-games-g3 §3). A sighted pass is still needed to confirm the white block is the backboard, the lavender wash, and HUD overlap on mobile.
- No make was ever captured. The action condition `makes > s` was never met, so swish, celebration, ON FIRE, the heat modal and the defender were never shown. The defender reports "hidden".
- "01-title" is a gameplay frame, because the game has no title screen.
- The step-before-mount warning shows that one empty frame was rendered.
- Runner: headless Chromium 147 on a 3-vCPU Apple M1 (Virtual) with an ANGLE Metal paravirtual GPU (GitHub run 37289688772, sha c08d8acb). Absolute fps is runner-depressed, but the relative gap to Orbital Defense and Vault Breakers on the same runner is real.
- Judge B's clipping figures (3.5-7.5%) did not reproduce. I measured 0.2-1.1% of pixels at luma ≥250.
- The mobile run has no 04-action shot. 1280x720 has a full set of five shots, which neither judge used except 03.
- The capture used the production URL, not ?capture=review.
- Scratch files are in /tmp/qr/rbr/ and /tmp/qr/rb/.

## 7. Screenshot evidence
All files are in /tmp/qr/game-captures/out/showcase-rooftop-buckets/. Descriptions are inferred from pixel and evidence data.
- contact-sheet.png (2432x1200): grid of all viewports. Mean luma 39 because of the dark sheet background.
- desktop-1920x1080__01-title.png: first gameplay frame (no title screen), state Ready, score 0, luma 75.4, 191 draws, flat navy top sixth [40,40,55].
- desktop-1920x1080__02-opening.png: weak shot in flight at charge 0.19, luma 78.4, 189 draws.
- desktop-1920x1080__03-mid.png:
  - box-band sky steps at y≈0-240
  - flat near-white block [244,248,250] at y≈280-360, x≈920-1020 (probable untextured backboard or meter card), with an orange rim/ball tone beside it
  - purple court band [65,34,101] at y≈640-800
  - HUD whites at y≈1000-1080, where the clipped pixels concentrate
  - last result: brick
- desktop-1920x1080__04-action.png: rim contact FX active but nearly identical to 03 (diff 2.7). No make captured.
- desktop-1920x1080__05-charge.png: charging at 0.58 power, luma 75.7, 198 draws, diff 3.9 from 03.
- desktop-1280x720__01 through __05: same framing and banding at 720p. 03 and 04 are identical (luma 77.4, clipping 0.34%).
- mobile-390x844__01-title.png: 1170x2532 screenshot from a 683x1477 backbuffer, 137 draws, top sixth [27,36,56].
- mobile-390x844__02-opening.png: luma 80.0, mid band [96,88,107].
- mobile-390x844__03-mid.png: effectively identical to mobile 01, 2 misses.
- mobile-390x844__05-charge.png: matches mobile 02 statistically, brick result.
- /tmp/qr/game-captures/out/report.json: source for the measured rAF fps (7.6 / 12.2 / 11.1), engine-reported fps 60, draw calls, makes 0, shooterAnimation "Ready", and ready at 3061 ms.

# Bank Shot (`showcase-bank-shot`)

Reconciled scorecard: Bank Shot (showcase-bank-shot)

Only one category had judges more than 2 points apart: performance (A 3, B 7). I tried to settle it visually. Reading the PNGs and a downscaled JPEG copy (/tmp/bs_mid.jpg, now deleted) returned empty, so I could not view any screenshot. I decided the split from the harness metrics in /tmp/qr/game-captures/out/report.json instead. The harness measured 14.9 fps at 1920x1080 (p50 frame 66.7 ms; 67 of 76 frames took over 50 ms). Judge B's "60 fps" is the in-engine counter, which does not match what the harness measured. For all other categories the final score is the judges' average, rounded to the nearest 0.5.

## 1. Scores

| category | final | judge A | judge B | justification |
|---|---|---|---|---|
| environment_world | 2 | 2 | 2.5 | The room is about 56 unlit primitives (box walls, box "posters") that fade to black; it does not read as a pool hall. |
| modeling_assets | 4 | 4 | 4 | The 10k-tri synth table and balls with extruded numbers are decent; the 170-tri faceted cue and primitive room are not. |
| texture_quality | 1 | 1 | 1.5 | No UVs or textures anywhere: flat colour felt, no wood grain, no decals. |
| material_quality | 3 | 3 | 3 | Lacquer and clearcoat are authored well, but render as flat plastic without IBL; the felt is a uniform saturated navy. |
| pbr_credibility | 2.5 | 2 | 3 | Glossy surfaces have nothing to reflect, so highlights are point-light pinpoints only (brightFraction 0.001). |
| lighting | 3 | 3 | 3.5 | The pendant pool is the right idea, but the falloff to black is too steep and the neon rims don't suit the genre. |
| shadows | 2 | 2 | 2.5 | The only caster is the oblique directional rim at strength 0.32; the overhead lamp casts nothing, so blob cylinders fake contact. |
| ambient_lighting | 2 | 2 | 2.5 | A flat ambient of 0.24 replaces the environment and the surroundings crush to black. |
| ibl_reflections | 0.5 | 0 | 1 | IBL is off because lights.ambient disables it, so the balls' defining reflections are missing. |
| tone_mapping | 3.5 | 3 | 4 | ACES with no blowout, but mean luma is about 18–22 and colorGrade.exposure is silently dropped. |
| color_management | 4 | 4 | 4 | The sRGB output looks correct; the palette is a cold navy/neon "SaaS noir" rather than a warm pool hall. |
| anti_aliasing | 3 | 3 | 3.5 | The safe-basic profile renders at pixelRatio 1 with FXAA on top of MSAA, which softens 5.7 cm balls and the rail diamonds. |
| postprocessing | 3 | 2 | 4 | Bloom softKnee 0.5 lifts mid-tones, AO is a near no-op, the exposure grade is a no-op, and dark gradients likely band. |
| vfx | 1 | 1 | 1.5 | Only aim and bank lines plus a DOM toast; no strike, chalk or pocket effects. |
| particles | 0 | 0 | 0.5 | None. |
| animation_quality | 1 | 1 | 1.5 | The balls never rotate and slide like pucks; the cue only translates linearly. |
| character_presentation | 0.5 | 1 | 0 | There is no character or hand; the cue is the only actor. |
| camera | 3 | 3 | 3.5 | One fixed oblique camera with no aim, follow or pocket cams; portrait switches to top-down. |
| composition | 3 | 3 | 4 | The table fills only about 12% of the frame, and about 40–50% of the frame is black void (harness darkFraction 0.50). |
| scale_depth_perception | 3 | 3 | 3.5 | The table floats in a void with weak contact cues; only perspective gives depth. |
| atmospheric_effects | 2 | 2 | 2 | The fog matches the background colour, so it has no visible effect; there is no haze in the lamp cone. |
| gameplay_readability | 5 | 5 | 5 | Distinct saturated balls with numbers, aim and bank lines, and a power meter with a sweet zone; low exposure and DPR 1 soften them. |
| ui_hud | 3 | 3 | 3.5 | A glassmorphism admin panel with 7 buttons and a Backend/Sensors/Bodies debug strip visible to players. |
| typography | 4 | 4 | 4 | Legible generic uppercase sans with no display face or theme. |
| game_feel | 3 | 3 | 3 | The charge, sweet-zone and combo structure exists, but there is no impact feedback, roll or camera response. |
| controls | 5 | 5 | 5 | Keyboard aim, spin and charge work deterministically; there is no mouse or touch drag-aim. |
| physics_feel | 4.5 | 5 | 4.5 | The Rapier simulation is sound, but authored spin and non-rotating visuals undercut it. |
| sound_audio | 3 | 3 | 3 | Ten synthesized oscillator WAVs; no sampled ball clacks. |
| loading_transitions | 5 | 5 | 5 | Ready in about 1.2–1.65 s with no errors; there is no intro, and the renderer warns that step() ran before mount. |
| polish_juice | 1 | 1 | 1.5 | Juice is essentially a toast, and the debug strip is visible to players. |
| mobile_presentation | 2.5 | 2 | 3 | The table is a small top-down patch in the top 30–40% of the screen, the HUD takes the bottom half, and the image is soft. |
| performance | 4 | 3 | 7 | Disputed. The harness measured 14.9 fps at 1080p even at DPR 1 with about 193 draws. Orbital Defense (59.6) and Vault Breakers (57.4) reach about 60 on the same runner, so Bank Shot is genuinely slow; the runner is busy (many games measured 6–25 fps), which keeps it above 3. |
| overall_visual_quality | 3 | 3 | 3 | A dark tech demo: a navy rectangle with plastic dots in a black void beside a dashboard panel. |

## 2. What looks poor

- About half the 1080p frame is near-black (darkFraction 0.50, mean luma about 18 of 255). The room is effectively invisible.
- The table is small, left of centre, and covers about 12% of the frame. A slate glass dashboard takes the right edge.
- The felt is a flat saturated royal blue with no cloth texture. The rails are flat brown with no wood grain.
- The balls read as matte plastic: almost no speculars (brightFraction 0.001), no environment reflection, no Fresnel rim.
- Shadows are faint and fall sideways from the rim light, with opaque blob discs under the balls.
- The balls slide without rolling, so the numbers stay fixed on top.
- Between shots only 1–4% of pixels change. There is no strike flash, no pocketing moment, and nothing was potted in any capture.
- Cyan, magenta and teal neon rims clash with the bar mood.
- A Backend/Sensors/Bodies debug strip and "AURA3D PROTOTYPE" text are visible to players.
- On mobile the table is a small top-down patch, the HUD takes the bottom half, and the image is soft with low colour detail (about 433–536 distinct 4-bit colours).

## 3. Why

Root-cause split (judge average, rounded): engine 18% · defaults 20% · game 31% · assets 20% · authoring 11%.

- **Engine (18%):** Any lights.ambient without an environment silently disables IBL. shadowPriority ranks the directional light above point and spot lights, so the overhead lamp cannot cast shadows. colorGrade.exposure is dropped. The AO pass is roughly a no-op and contactOcclusion is diagnostics-only. FXAA is stacked on MSAA. The renderer does lack needed capabilities here: ambient plus IBL together, and point/spot shadow casters while a directional light is present.
- **Defaults (20%):** With no renderer option the game gets the safe-basic profile at pixelRatio 1. Root shadow strength is 0.32. Bloom softKnee is 0.5. Without a scene option, the result is underexposed and soft.
- **Assets (20%):** The table geometry is fine, but the assets are weak in another way: none have UVs or textures. The cue is a 170-tri faceted mesh and the room is box primitives. So the assets are both weak (untextured, low-poly cue) and rendered badly (no IBL for the lacquer and clearcoat materials).
- **Game (31%):**
  - Ball rotation is never synced to the visuals.
  - The neon rim tints and the dark fog/background are content choices.
  - The camera is fixed and wastes most of the frame.
  - Gameplay looks empty: no VFX, particles, pocket drop or hit feedback.
  - The HUD is a SaaS dashboard with a debug strip.
  - Audio is oscillator-only.
  - Performance is poor for a one-table scene.
- **Authoring (11%):** The agent rated its own box room "10/10 complete", and a route-health file claims production mode. The environment is clearly under-authored.

By area:

| area | assessment |
|---|---|
| Lighting | at fault: too steep a falloff, wrong tints |
| Camera | at fault: fixed and wide |
| Materials | authored correctly, but no IBL so they fail |
| Post | at fault: mid-tone bloom, no-op AO and exposure |
| Environment | under-authored |
| Animation | simplistic |
| Gameplay visuals | empty |

## 4. Largest improvements (ranked)

1. Replace lights.ambient with environments.hdri using a warm pool-hall interior. Separately, fix the engine so ambient adds to IBL instead of turning it off. This is the biggest material gain.
2. Render at full resolution: qualityProfile "production" (DPR min(device, 2)), drop FXAA when MSAA is on, and make colorGrade.exposure apply. Lift mean luma to about 60–80.
3. Copy the Rapier body rotation into syncVisuals so the balls roll. This is the biggest motion fix.
4. Make the overhead pendant spot lights the shadow casters: fix shadowPriority, set strength to about 0.9–1.0, and remove the blob cylinders.
5. Texture the table: baize albedo plus a fine normal map, walnut grain under clearcoat, leather pockets, UVs, and a cue of 2k+ tris.
6. Dress the room: textured floor and walls, a GLB pendant with an emissive shade, a cue rack, bar back and stools. Use a warm tungsten fill instead of the neon rims, and add lamp-cone haze.
7. Rework the camera: frame the table at 40% or more of the screen, add a low aim/follow cam and a break kick, an optional pocket cam, and drag-to-aim.
8. Rebuild the HUD as a compact themed overlay: remove the debug strip, use a display typeface, and give the table at least 60% of the height on mobile.
9. Add juice: strike flash and hit-stop, a chalk puff, pocket drop and rattle, a score pop, and sampled clack, cushion and pocket audio.
10. Bloom threshold of 1 or more with knee 0.2 or less, dithering against banding, and profiling of the 15 fps one-table scene.

## 5. Verdict

**save-through-polish.** Both judges agree. The underlying pieces work: Rapier physics, a deterministic rules loop, readable gameplay, a decent table mesh, and fast loading. Most of the visual failure comes from a few engine and default traps (IBL disabled by ambient, wrong shadow caster, DPR 1, dropped exposure) and from missing content work (textures, ball rotation, room dressing, juice, HUD). None of it needs a new architecture. The room and HUD need real rebuilding work within that polish pass, and two engine fixes are prerequisites: ambient-plus-IBL and the shadowPriority ordering.

## 6. Capture caveats

- Neither judge nor I could view the images; the Read tool returned empty for every PNG and for JPEG copies. All visual statements come from pixel statistics (luma, darkFraction, brightFraction, colour bins, frame diffs), report.json state and the code audit. Facets, AA artefacts and typography are inferred, not observed.
- The pot condition was never hit in either desktop run (it waited about 4 s; score 0). There is no real pocketing or action frame. Mobile has no 04-action shot.
- Performance: the harness measured 14.9 fps at 1080p, while the in-engine counter reports 60. Judge A's 25.8 (720p) and 26.1 (mobile) come from their own analysis; I did not re-check them. The runner is a headless 3-vCPU host with a paravirtual GPU and heavy contention, but peer games still reach about 60 on it.
- darkFraction is 0.50 by the harness metric; Judge A's 35% figure counts only luma below 2.
- The engine warned that step() ran before the renderer mounted (one empty frame). No capture is blank.

## 7. Screenshot evidence

All files are in /tmp/qr/game-captures/out/showcase-bank-shot/. Descriptions come from metrics, not viewing.

| file | what it shows |
|---|---|
| contact-sheet.png | 2432x1200; about 82% near-black colour bins, so all thumbnails are dark. |
| desktop-1920x1080__01-title.png | Aiming state with 16 balls racked; mean luma 18.7, dark 0.497, bright 0.001; table left of centre, HUD on the right. |
| desktop-1920x1080__02-opening.png | About 1.7 s after the break; luma 17.9; about 2.6–3.9% of pixels changed. |
| desktop-1920x1080__05-charge.png | Charge meter and cue pull-back; luma 18.0. |
| desktop-1920x1080__03-mid.png | Balls displaced, nothing potted; luma 18.0, dark 0.509. |
| desktop-1920x1080__04-action.png | Pot condition not hit, balls settling; luma 18.5. |
| desktop-1280x720__01–05 | Same composition; luma about 20.5–21.9, dark about 0.40; table relatively larger. |
| mobile-390x844__01-title.png | 1170x2532 at DPR 3; small top-down table near the top, HUD in the bottom half; luma 21.2, 465 distinct 4-bit colours. |
| mobile-390x844__02-opening.png / 03-mid.png | Same layout; luma 20.0. |
| mobile-390x844__05-charge.png | Meter visible; luma 22.1. |

# Vault Breakers (`showcase-vault-breakers`)

## 1. Scorecard

Both judges' scores are within 1 point of each other in every category, so no category triggered an adjudication. Each final score is the mean of the two judges. I tried to Read the PNGs directly as a cross-check, but they returned empty results, so these scores are not confirmed visually.

| Category | Final | Judge A | Judge B | Justification |
|---|---|---|---|---|
| environment_world | 2.25 | 2.5 | 2 | About 13 primitives plus a 1,012-tri untextured synth table; 83% of 8x8 blocks are flat; no room or arcade context |
| modeling_assets | 2.5 | 2.5 | 2.5 | Every rendered GLB is a 0-UV synth; the textured Sketchfab and Higan cabinets ship but are never used |
| texture_quality | 1 | 1 | 1 | Nothing is textured; the playfield is one flat colour |
| material_quality | 2 | 2 | 2 | Flat `material.pbr` colours and emissive boxes; the ball's material is replaced by setMaterial on every state change |
| pbr_credibility | 1.5 | 1.5 | 1.5 | The metallic 0.96 ball and the metallic/clearcoat floor have nothing to reflect, so they read as matte |
| lighting | 2.75 | 3 | 2.5 | Three coloured directional lights wash the table; no local insert lights or light under plastics |
| shadows | 2 | 2 | 2 | One implicit directional shadow at the default strength of 0.32; posts and ball are barely grounded |
| ambient_lighting | 2 | 2 | 2 | Constant violet ambient that disables IBL; fake SSAO; contactOcclusion does nothing |
| ibl_reflections | 0 | 0 | 0 | No environment node, so there is no IBL, SSR or planar reflection |
| tone_mapping | 3.25 | 3.5 | 3 | ACES is applied but exposure is dropped; max luma 221 and 0% bright pixels, so the image is a murky mid-tone |
| color_management | 4 | 4 | 4 | Correct sRGB/HDR16F pipeline, but the palette is a blue/magenta duotone with poor hierarchy |
| anti_aliasing | 5 | 5 | 5 | 1.5x supersample plus 4x MSAA, then FXAA blurs it; mobile renders at half native resolution |
| postprocessing | 2.75 | 2.5 | 3 | Bloom (softKnee 0.5, threshold 0.62) glows mid-tones into haze; fog veil; 8-bit fake SSAO |
| vfx | 2 | 2 | 2 | A single expanding emissive torus is the only hit effect |
| particles | 0.5 | 0.5 | 0.5 | No particles; they are not wired on the production bridge |
| animation_quality | 3.5 | 3.5 | 3.5 | Motorised flippers and the vault door are rigid and correct; no secondary motion |
| character_presentation | 1 | 1 | 1 | The ball is the hero and it reads as a dark, tinted, hard-to-find disc |
| camera | 3.5 | 3.5 | 3.5 | Fixed at [0,5.15,7.35] fov 50; no tracking or shake; under 1% of pixels change between frames |
| composition | 3.25 | 3.5 | 3 | Bright marquee band pulls the eye; large low-contrast field; 300px dev panel beside it |
| scale_depth_perception | 2.75 | 3 | 2.5 | Flat shading, weak shadows and fog leave only geometry outlines as depth cues |
| atmospheric_effects | 2.5 | 2.5 | 2.5 | Purple fog plus bloom read as generic murk |
| gameplay_readability | 3 | 3 | 3 | The ball has low contrast; in frame diffs the impact ring is more visible than the ball |
| ui_hud | 4 | 4 | 4 | Functional DOM side panel, but a dev layout rather than a backglass/DMD |
| typography | 4 | 4 | 4 | Crisp uppercase-only SDF gold text plus a generic sans; nothing pinball-specific |
| game_feel | 4 | 4 | 4 | From code: real physics and missions, score 0 → 1300 → 1525; little juice |
| controls | 5.25 | 5.5 | 5 | From code and harness: plunger, flippers, nudge, pause and reset all work; 0 touch events on mobile |
| physics_feel | 5.75 | 6 | 5.5 | Rapier, 32-33 bodies, motorised hinges, sensors, deterministic reset; the strongest system |
| sound_audio | 3 | 3 | 3 | 11 synthesized WAVs; no music or mechanical foley |
| loading_transitions | 4.25 | 4 | 4.5 | First draw at about 1.2-1.9s, 1.8MB, no errors; step() ran before mount; no attract sequence |
| polish_juice | 2 | 2 | 2 | No shake, flashes, insert chases, DMD animation or particles |
| mobile_presentation | 2.75 | 2.5 | 3 | Canvas is 374x460 CSS (about 55% of the height) at half native DPR; drained by the 03 shot |
| performance | 7 | 7 | 7 | About 57-59fps, 150 draw calls; the headroom is unspent because the scene is cheap |
| overall_visual_quality | 2.5 | 2.5 | 2.5 | Neon-tinted programmer-art blockout, far below modern browser pinball |

## 2. What looks poor

- **Playfield.** The most important surface in pinball is one flat, untextured slate or grey-blue colour (about RGB 54-62, 67-74, 83-87). It has no printed art, insert lamps, plastics, ramps or rubbers. 75-83% of 8x8 blocks have luma std below 1.
- **Colour.** The frame is a two-hue wash from coloured directional lights, blue (210-240°) plus magenta. There are almost no warm accents beyond a few red targets.
- **Contrast.** The image is milky and compressed. Playfield luma never drops below about 60, max luma is 221, and no pixel clips, so there are no specular glints. Mid-tone bloom and purple fog lift the blacks.
- **The ball.** The chrome ball has no environment, so it shows as a dark, cyan-tinted disc with a cream outline around a flat #364353 interior (about 40x28px at 1920). It is hard to find against the field.
- **The "reflective" floor** reflects nothing.
- **Lamps and targets** are floating emissive boxes and beacon cubes.
- **VFX.** The only effect is one cyan impact torus (about 350x150px). There are no sparks, flashes or light shows.
- **Camera.** It is fully static. Attract and play frames are nearly identical (under 1% of pixels change).
- **Composition.** A bright cyan marquee/score band across the top steals focus. The HUD is a 300px developer side panel, not a backglass or DMD.
- **Mobile.** The game is a small 374x460 CSS window rendered at half native density above a large dark DOM panel.

## 3. Why

| Cause | Share | What it covers |
|---|---|---|
| Assets | 26.5% | The rendered assets are themselves weak. They are not good assets rendered badly: every GLB in use is a 0-UV, 0-texture procedural synth. Better assets (Sketchfab cabinet with 12 PBR maps, Higan cabinet, textured flipper) ship typed and hashed but are never referenced. |
| Game implementation | 27.5% | Coloured directional washes instead of local insert and bumper lights; emissive boxes as lamps; one torus as all the VFX; fixed camera; setMaterial churn on the ball; ball given an emissive tint instead of real chrome. |
| Engine defaults | 17.5% | `lights.ambient` disables IBL (index.ts:12691-12706); shadow strength 0.32; bloom softKnee 0.5 blooms mid-tones and threshold is clamped to [0,1]; `colorGrade.exposure` silently dropped; FXAA on top of MSAA; mobile DPR capped at 1.5x. |
| Authoring | 15% | Nobody authored playfield art. Bloom and fog settings were copied as "neon" cargo. Agents trusted false comments ("Real catalog pinball cabinet — textured") and no-op effects (contactOcclusion, exposure). |
| Engine capability | 13.5% | Particles are not wired on the production bridge. AO is 8-tap raw-depth, 8-bit and post-tonemap. Shadow path is nearest-sampled with no cascades. No SSR or planar reflection. The core BRDF and HDR target are not the bottleneck. |

The share column averages the judges (A: engine 15, defaults 17, assets 25, game 28, authoring 15; B: 12, 18, 28, 27, 15).

- **Lighting, camera, materials and post are all at fault.** Lighting is a tint wash, materials have nothing to reflect, post adds haze, and the camera is static.
- **The environment is badly under-authored:** primitives on a dark #030308 background.
- **Animation is simplistic:** rigid flipper and door motion only.
- **Gameplay is visually empty:** the mechanics underneath (physics, missions, scoring) work, but nothing on screen reacts to them.
- **The renderer is missing capabilities** for production particles, real contact and AO, and planar/SSR reflections. The IBL that already exists would fix the ball if the ambient default stopped disabling it.

## 4. Largest improvements (ranked)

1. **Playfield and cabinet.** Swap the synth table for the shipped vaultBreakersCabinet (or Higan) shell. Author a 2k-4k printed playfield texture on a UV'd plane aligned to the physics plane, with an emissive insert mask driven by mission state. Delete the false "textured" comments.
2. **Reflections.** Remove `lights.ambient` and add a dark-arcade HDRI through `environments.hdri`, so the ball becomes real chrome (no emissive tint) and the rails and floor reflect. Engine fix: ambient must not disable IBL.
3. **Lighting and shadows.** Replace the three coloured directionals with one neutral key plus local point/spot lights for inserts and bumpers. Raise shadow strength to 1.0 with a tight frustum over the playfield.
4. **Post chain.** Bloom threshold of at least 1.0 in linear HDR, knee 0.2 or lower, and lift the 0.88 maxIntensity cap. Cut fog to near zero. Honour exposure. Drop FXAA when MSAA is on.
5. **Real parts and juice.** Model the inserts, plastics, posts, rubbers and ramps, and use the textured flipper. Wire production particles for bumper sparks and flashes, insert chases, a vault-open burst, a multiball strobe and tilt/nudge shake. Animate the plunger.
6. **Ball readability.** Add an env highlight, a contact shadow and an optional trail, plus a slight ball-follow tilt or dolly and a multiball pull-back.
7. **HUD and mobile.** Make the HUD a backglass/DMD with a dot-matrix font. On mobile, render at min(DPR,2), give the canvas the full screen, overlay the HUD, and add touch flipper zones.

## 5. Verdict: substantial-rebuild

Both judges reached this independently.

- **Keep:** the physics, input, mission, scoring and reset systems (physics 5.75, controls 5.25) and the performance headroom.
- **Rebuild:** the entire visual layer. That means asset choice (synth → textured cabinet), playfield art that does not exist yet, the lighting rig, IBL setup, the post chain, VFX, camera behaviour and HUD.

Polish alone cannot get there, because the main deficit is missing content (no texture or art at all), not mis-tuned parameters. A full rebuild is not warranted, because the gameplay core works and better assets are already in the repo.

## 6. Capture caveats

- **Nobody has visually checked the images.** Neither judge could see them; their Read calls returned empty for every PNG and for downscaled JPEG copies. My own Reads of `mobile-390x844__02-opening.png` and `desktop-1920x1080__04-action.png` also returned empty, and no image content reached me. Every observation comes from pixel statistics (luma and hue histograms, flat-block ratios, frame diffs), report.json and code reports 17 and 02. Ball appearance, panel styling and typography are inferred, so a sighted reviewer should spot-check them.
- **The judges' hue numbers disagree:**
  - Judge A: 70-94% of saturated pixels blue.
  - Judge B: about 40-45% blue and 41-49% magenta at 1920.
  - Mobile: both measured a majority of blue.

  The duotone conclusion holds either way.
- **The black-level figures do not conflict.** Judge A's floor of about 60 is the playfield; Judge B's 6.9 is the whole canvas.
- **Several shots missed what they were meant to show:**
  - 1920 title and opening are statistically identical: the camera is static and the ball is not distinguishable.
  - At 1280 the action condition never fired and the ball drained to await-serve.
  - Mobile 03 is in await-serve with 0 touch events, so mobile mid-play was not captured.
- **Runtime notes:** the engine warned that step() ran before the renderer mounted (one blank first frame). The runner is a headless 3-vCPU paravirtual GPU, so fps only means something relative to other games.
- **Captures are otherwise valid:** 0 console, page or request errors, no missing shots, and inputs reached gameplay.

## 7. Screenshot evidence

All files are in /tmp/qr/game-captures/out/showcase-vault-breakers/:
- **contact-sheet.png / contact-sheet.html:** 2432x1200 grid of the 11 shots. Metadata gives L53.8, sigma 37.1 at 1920, 57.4fps and 0 errors.
- **desktop-1920x1080__01-title.png:** attract state. Canvas at x about 13-1591, DOM panel at about 1606-1904, bright cyan marquee/score band at the top, magenta side walls, flat slate playfield. Median luma 59.6, max 221.
- **desktop-1920x1080__02-opening.png:** ball served. Table identical to the title; about 5.7k px changed, only in the score strip and panel.
- **desktop-1920x1080__03-mid.png:** score 1300, flippers raised. Cyan impact torus about 350x150px at x 630-976, y 758-908.
- **desktop-1920x1080__04-action.png:** score 1525. Small element (probably the ball) with a cream outline around a flat #364353 interior near (1000,684), plus the shrinking ring. Max luma still 221.
- **desktop-1280x720__01-title.png, __02-opening.png:** captured, but neither judge analysed them in detail; per report.json the canvas is 938x692 CSS with a 1407x1038 backbuffer.
- **desktop-1280x720__03-mid.png:** score 1300. 75% flat blocks, same duotone, mean luma 58.4.
- **desktop-1280x720__04-action.png:** await-serve. The ball drained and the action condition never fired.
- **mobile-390x844__01-title.png:** canvas at the top 460 CSS px (about 54-55% of the height), dark DOM panel below. Backbuffer 561x689 at DPR 3.
- **mobile-390x844__02-opening.png:** score 500, in play. p50 luma about 32, mostly blue hue.
- **mobile-390x844__03-mid.png:** score 1150, await-serve (drained), 0 touch events. 77% flat blocks.

# Blockfall Reactor (`showcase-blockfall-reactor`)

## 1. Scorecard

No category differed by more than 2 points between the judges, so no category required a tie-break. Neither judge could view the images (Read returned empty), and my own Reads of the PNG and a JPEG re-encode also came back empty. To check their claims I ran my own pixel analysis: 3x3 region mean colors and mid-to-action frame diffs. Final scores combine both judges' scores with that measured evidence.

| category | final | judge A | judge B | justification |
|---|---|---|---|---|
| environment_world | 3 | 3 | 3 | About 460 primitive boxes and spheres plus a 4-tri unlit painted backdrop card. Region means are uniform navy/teal (#0b344c center, #12223e bottom-left), so it reads as a poster behind a box set. |
| modeling_assets | 2 | 3 | 2 | The only real mesh (3.4k-tri cabinet) is hidden behind the board. 3 of 4 models are 4-tri unlit cards. Averaged normals make the tiles look like pillows. |
| texture_quality | 3 | 3 | 3 | Primitives are untextured. The cabinet's 1024² set is occluded. 1-1.5k cards are stretched over 8-14 world units and softened by DPR 1 and blur-FXAA. |
| material_quality | 3 | 3 | 3 | The metallic 0.8 rails and glossy tiles have no environment to reflect, so they read as dark plastic. Unlit cards don't match the lit primitives. |
| pbr_credibility | 2 | 2 | 2 | Ambient light forces environmentMapIntensity 0, so there's no specular IBL or Fresnel. Emissive carries the color. |
| lighting | 3 | 3 | 3 | π-scaled lavender ambient plus a weak 1.05 key plus several colored points give a flat wash. Mean luma is about 55, with no key/fill/rim structure. |
| shadows | 2 | 2 | 2 | Strength 0.32 leaves 68% light in shadow. Instanced tiles likely cast nothing. Cards cast rectangles. |
| ambient_lighting | 2 | 2 | 2 | Constant ambient. SSAO is effectively a no-op, so there's no contact grounding. |
| ibl_reflections | 0 | 0 | 0 | No environment, and IBL is disabled by ambient. Zero reflections. |
| tone_mapping | 4 | 4 | 4 | ACES avoids clipping, but the image is low-key and muddy. The colorGrade exposure of 1.05 is silently dropped. |
| color_management | 4 | 4 | 4 | The pipeline is correct, but the palette is a narrow navy/teal plus muted maroon band with no accent hierarchy. Grading in 8-bit after tone mapping risks banding. |
| anti_aliasing | 3 | 3 | 3 | DPR 1 plus a 4-tap cross-blur "FXAA". The 1920 capture is softer per pixel than the 1280 one. |
| postprocessing | 3 | 3 | 3 | Bloom 0.26 with softKnee 0.5 gives haze. AO costs time and shows nothing. Fog adds murk. Exposure is dropped. |
| vfx | 2 | 2 | 3 | My measurement: mid to action (60 ms after a hard drop) differs by a mean of 1.6/255 at 1080p, and only 2.0% of pixels change by more than 16. The lock impact is effectively invisible. |
| particles | 1 | 1 | 2 | No particles API is used, only 48 pooled 2.6 cm box shards on line clear. Nothing seen in the captures. |
| animation_quality | 2 | 2 | 3 | Static camera and static mascot cards. No lock pop, squash or tween visible in the captures. |
| character_presentation | 1 | 1 | 1 | The "characters" are flat unlit cutout cards that cast card-shaped shadows. |
| camera | 3 | 3 | 4 | fov 32, dead-on and static. The camera punch only fires on quad/level-up. Depth flattens. |
| composition | 4 | 4 | 4 | The well is centered with the HUD at the sides. The right third is a muted maroon card region (#5f3640 / #604155). The hero cabinet is occluded. |
| scale_depth_perception | 3 | 3 | 3 | Narrow FOV, no parallax, a backdrop card at nearly wall depth, no AO. Fog is the only depth cue. |
| atmospheric_effects | 2 | 2 | 3 | Fog density 0.028 at 0.3 is barely perceptible. No volumetrics or haze. |
| gameplay_readability | 6 | 6 | 6 | Grid, ghost piece, hold/next and full stats are present. Pieces have only moderate contrast against the teal well. |
| ui_hud | 5 | 5 | 5 | Thorough clip-path/blur panels and callouts, but dashboard-like. The DOM HUD and the 3D scoreboard duplicate each other. |
| typography | 4 | 4 | 5 | System/Inter and ui-monospace only. Developer-facing labels ("48f gravity", "B2B off"). |
| game_feel | 4 | 4 | 5 | Solid fallingBlocks rules, but hard drop is audio-only and the measured frame rate is 10-14 fps. |
| controls | 6 | 6 | 6 | A complete conventional mapping plus touch rows. Input registered during the capture (score 0 to 251). |
| physics_feel | 4 | 4 | 5 | Grid logic. Rapier adds no visible physical response. Shards are tiny. |
| sound_audio | 3 | 4 | 3 | Good stem/manifest architecture, but every sound is synthesized from oscillators or noise, so it reads as chiptune. |
| loading_transitions | 4 | 4 | 4 | 15 MB transferred, first draw 3.7 s, ready 5.7 s. No title or intro. Step-before-mount warning. 3 WebGL contexts. |
| polish_juice | 3 | 3 | 3 | Only rare quad/B2B events get feedback. Move, rotate, lock and hard drop produce nothing visible. |
| mobile_presentation | 2 | 3 | 2 | 390x844 backing store on a DPR-3 device (1/9 of native pixels), Laplacian energy about half of desktop, 14.4 fps. |
| performance | 2 | 3 | 2 | 9.8 / 12.2 / 14.4 fps measured (p99 384 ms) against 50-60 for sibling games on the same runner. The engine overlay falsely reports 60. |
| overall_visual_quality | 3 | 3 | 3 | Programmer-art tech demo: flat navy wash, box room, painted cards, no reflections, soft image, invisible impact FX. |

## 2. What looks poor

- The frame is a straight-on, static, fov-32 view of a dark teal-navy well. Measured region means are #0b344c to #1c3d55 in the center and #12223e / #1f213a in the bottom corners. Overall luma is about 55/255 with almost no highlights.
- The right third is a flat, muted maroon/mauve painted AI card (#5f3640 to #604155). It is not a modeled space, and it ignores the scene lights.
- The "arcade room" is boxes and 48 sphere "spectators". The mascots are 4-tri cutout cards that cast rectangular shadows.
- The one real asset, the cabinet, sits behind the board, and boxes cover its marquee.
- Tetromino "jewels" are matte emissive pillows: the bevels are melted by averaged normals and there's no sparkle or reflection. The 0.8-metallic rails reflect nothing.
- Shadows are faint and there's no contact AO, so tiles and board float.
- A hard drop changes about 2% of pixels: no flash, dust, trail, shake or lock pop.
- The whole image is soft from DPR 1 plus blur-FXAA. Mobile is a visibly 3x-upscaled 390x844 render.
- The HUD is tidy but uses system fonts and developer labels.
- Real frame rate is 10-14 fps.

## 3. Why

Root-cause split: engine 22%, defaults 25%, assets 21%, game 22%, authoring 10%.

- **Assets: weak in themselves, not just rendered badly.** Three of four models are unlit 4-tri image quads and the world is primitives. The cabinet is a decent mid-poly mesh but is hidden and covered, so it is rendered badly through placement.
- **Lighting: at fault.** The ambient wash is π-scaled, the key is weak and the point lights are all equal, so there's no shaped key-light mood.
- **Camera: at fault.** Narrow FOV, front-on and static, so there's no parallax.
- **Materials: at fault.** Gloss and metal values are set, but nothing exists to reflect. The unlit/lit mix makes it worse.
- **Post: at fault.** Bloom is haze-only, AO is a no-op, the FXAA is a blur, and exposure is dropped.
- **Environment: severely under-authored.** It's a backdrop card in front of a box wall, with a dead floor band.
- **Animation: simplistic.** Static cards, a static camera, and no tile animation beyond grid snaps.
- **Gameplay: visually empty in ordinary moments.** Feedback exists only on rare quad/level-up events.
- **Renderer capabilities it lacks:**
  - a default HDR/IBL path when ambient is present
  - DPR above 1 under safe-basic
  - real FXAA/SMAA
  - working SSAO
  - flat or crease normals for geometry.custom
  - instanced shadow casting
  - runtime node spawning or a particles pool usable by games
  - fps telemetry that reports real rAF
- **Game-side performance causes:** 200 hidden legacy boxes, about 80 text3D digits, 3 WebGL contexts, and paid-for no-op AO.
- **Authoring:** the evidence was tuned on a separate `?capture=review` world, so the play path was never visually reviewed.

## 4. Largest improvements (ranked)

1. **Engine/defaults:** install a neutral HDR PMREM environment even when ambient is set, and remove `lights.ambient` from this game. Tiles, rails and the cabinet glass then get reflections and Fresnel. This is the biggest single visual gain.
2. **Engine:** set DPR to min(devicePixelRatio, 2), and replace the cross-blur FXAA with real FXAA/SMAA, or rely on MSAA. This fixes desktop softness and the 3x mobile upscale.
3. **Performance:** delete the 200 hidden boxes and the A/B probe, replace the text3D digits with a DOM or texture scoreboard, find the 3 WebGL contexts, drop the no-op AO, and fix fps telemetry. Target 55-60 fps parity with Vault Breakers and Orbital Defense.
4. **Assets/environment:** remove the unlit cards. Build a modeled arcade or reactor-chamber kit with emissive strips and signage. Bring the cabinet forward as the hero frame with a re-authored marquee.
5. **Juice (needs an engine particles/spawn API):** lock flash per cell, drop trail, landing sparks or dust, 2-4 px shake, well-edge glow, and a full-row light sweep plus particles on clear.
6. **Tile geometry/material:** flat or crease normals so the chamfers catch crisp highlights, then low-roughness gem materials with clearcoat and an emissive core.
7. **Lighting/shadows/post:** one shaped key plus a rim and fill instead of the equal points. Shadow strength about 0.8-1. Exclude parked FX from shadow bounds. HDR-threshold bloom without the 0.5 knee. Honor exposure. Add a vignette and an accent hierarchy so pieces pop.
8. **Camera/composition:** fov 40-50, a slight 3/4 yaw, an idle drift, a lit well frame, and fill or crop the dead floor band.
9. **HUD/typography:** a display typeface with an arcade/reactor identity, player-facing labels, and score-pop and count-up animations.
10. **Audio:** sampled or processed impacts and a produced music bed on top of the existing stem system.
11. **Evidence:** retire the capture-review world swap, enforce capture parity in CI, and capture the real play path.

## 5. Verdict: save-through-polish (borderline)

The core is sound and worth keeping: the game.fallingBlocks rules (hold, B2B, combo), the input and touch mapping, the HUD structure and the audio architecture.

Most of the poor look comes from engine defaults (IBL, DPR, AA, AO, shadows, normals). Those fixes land once in the engine and benefit every game.

The game-side work is a replacement of the presentation layer, not a code rewrite: swap the cards and primitives for a modeled kit, re-light, re-frame the camera, add juice, and clean up performance.

It's borderline because almost every visible art element gets replaced. If the engine fixes in items 1, 2 and 5 don't land, this effectively becomes a substantial rebuild of the art layer.

## 6. Capture caveats

- **No direct viewing.** Neither judge nor I could view the PNGs; every Read, including a JPEG re-encode, returned empty. Visual claims rest on pixel statistics (region means, palettes, diffs, edge and Laplacian energy), report.json, and code research. A human eye-check is still needed.
- **Muted right third.** My region means show the right third is a muted maroon/mauve (luma about 60-70), not the vivid magenta judge A described.
- **No title screen.** The game boots straight into play, so "01-title" is a gameplay frame at score 0.
- **Clear FX not captured.** No line-clear or quad celebration FX were captured. `__AURA3D_BLOCKFALL_ACCEPTANCE_PROBE__.apply('quad')` would stage them.
- **Runner.** Headless 3-vCPU paravirtual-GPU runner. Absolute fps is depressed, but sibling games reach 50-60 there, so the fps gap is a real regression. The engine overlay's 60 fps is wrong.
- **Mobile DPR.** The 390x844-at-DPR-3 mobile backing store is engine/game behavior, not a harness artifact.

## 7. Screenshot evidence

All under `/tmp/qr/game-captures/out/showcase-blockfall-reactor/`:

- `contact-sheet.png` / `contact-sheet.html`: index of 4 shots at 1080p, 4 at 720p and 3 mobile, all non-blank, 0 errors.
- `desktop-1920x1080__01-title.png`: gameplay at t=0, score 0. Luma 53.6. Top-left HUD region #35536a, center #0a3249, right #5d343f to #5f4054.
- `desktop-1920x1080__02-opening.png`: t≈2.5 s, score 112, 1 line. Layout unchanged, luma 54.3.
- `desktop-1920x1080__03-mid.png`: the stack has grown (center cell #1c3d55). Navy well, maroon card on the right, dark bottom band (#12223e / #1f213a).
- `desktop-1920x1080__04-action.png`: 60 ms after a hard drop. Versus mid: mean diff 1.61, 2.0% of pixels change by more than 16, bbox (644,56)-(1858,768). No visible lock or impact FX.
- `desktop-1280x720__01..04`: same composition at luma 53.9-56.1. Mid to action diff is 2.37 mean and 2.96% of pixels. Sharper per pixel than 1080p.
- `mobile-390x844__01-title.png`: 1170x2532 image from a 390x844 backing store. HUD bands at the top, teal well (#114a5e / #18405d), touch rows at the bottom.
- `mobile-390x844__02-opening.png`: luma 57.5, similar layout. The top-center HUD band is brightest.
- `mobile-390x844__03-mid.png`: luma 57.6. The stack is visible in the well (#25506b). Detail is low and upscaled (about 1460 distinct colors against about 2470 on desktop).

# Neon Swarm (`showcase-neon-swarm`)

# Neon Swarm (showcase-neon-swarm): final reconciled scorecard

Neither judge could view any pixels, and I couldn't either. Reading the PNGs and a downscaled JPEG copy returned empty results each time. Scores therefore rest on both judges' numeric pixel analysis, the code research, and `/tmp/qr/game-captures/out/report.json`. The judges disagreed by more than 2 points in one category only, performance. I settled it from report.json.

## 1. Scorecard

| Category | Final | Judge A | Judge B | Justification |
|---|---|---|---|---|
| environment_world | 2.25 | 2 | 2.5 | A 57x39 box street with box ribs and blades. The frame is a black void over a flat teal slab, and the only detailed props (272k-tri lamps) are off camera. |
| modeling_assets | 2 | 2 | 2 | Enemies are 18-22-tri extruded discs, the hero is a static unrigged low-poly man, and 3 of 6 assets are 4-tri image cards. |
| texture_quality | 1.75 | 2 | 1.5 | The tint override (`replaceSurfaceTextures`) strips the courier's textures. Everything else is untextured except the off-focus barricade. |
| material_quality | 2 | 2 | 2 | One flat tint per object. The "wet asphalt" has no reflection or roughness variation. |
| pbr_credibility | 2 | 2 | 2 | Metallic 0.42 with no IBL shades as dull plastic. Averaged normals make the enemies look like pillows. |
| lighting | 3 | 3 | 3 | 10 point lights at 9-16 over an ambient of about π× three.js give muddy pools. Mean luma is 22-35 and under 1% of pixels are bright. |
| shadows | 2 | 2 | 2 | One caster at strength 0.32. Instanced enemies cast nothing because the depth pass ignores instancing. |
| ambient_lighting | 2.25 | 2 | 2.5 | A flat grey-blue ambient wash with a fake hemisphere factor. SSAO contributes about zero. |
| ibl_reflections | 0.25 | 0 | 0.5 | No environment node and IBL is forced to 0. A wet neon street with zero reflections is a core art-direction miss. |
| tone_mapping | 3.25 | 3 | 3.5 | Fixed ACES, and colorGrade exposure is dropped. The image is crushed low-key (40-60% dark pixels) with no punchy highlights. |
| color_management | 3.75 | 4 | 3.5 | The navy/teal/magenta palette is coherent, but only about 2% of pixels are strongly saturated, so the neon reads muddy. sRGB handling is correct. |
| anti_aliasing | 3.25 | 3 | 3.5 | FXAA layered on MSAA softens desktop edges. Mobile renders at 1/9 of native resolution, confirmed by B's upscale-block test. |
| postprocessing | 3 | 3 | 3 | Single-scale bloom with a soft knee gives milky haze. AO costs time with no visible result, and fog only darkens. |
| vfx | 2 | 2 | 2 | The 7 game.effects spawns render zero pixels. Only sparks, a box ray and a torus ring are visible. |
| particles | 2 | 2 | 2 | A pool of 96 tiny spheres. No effects.particles, sprites or trails. |
| animation_quality | 1.25 | 1 | 1.5 | The static hero only translates and yaws. Enemies bob on a sine. No hit or death animation. |
| character_presentation | 1.75 | 2 | 1.5 | A flat #214f68 mannequin about 1/20 of frame height, with no silhouette identity. |
| camera | 3 | 3 | 3 | A rigid follow camera (smoothing 0 on desktop). cameraDirector output and cameraPunch are discarded. |
| composition | 3 | 3 | 3 | The upper ~40% is empty void, HUD panels sit in the corners, and there is no value hierarchy toward the player or threats. |
| scale_depth_perception | 2.75 | 3 | 2.5 | A flat floor, a black backdrop, weak shadows and no AO leave few depth cues. |
| atmospheric_effects | 2.75 | 3 | 2.5 | Fog only. No rain despite the "rain garden" theme, no volumetrics, no sky. |
| gameplay_readability | 4 | 4 | 4 | Emissive enemies separate from the floor, but low luma and haze make the 36 tiny drones hard to parse. |
| ui_hud | 3.5 | 3 | 4 | A functional DOM stat grid with blur that reads as an admin dashboard, not a game HUD. |
| typography | 3.5 | 3 | 4 | A legible system font stack with no display face for a neon arcade identity. |
| game_feel | 2.75 | 3 | 2.5 | Scored from code: no hit-stop, no camera punch, effects never rendered. The run got 0 kills. |
| controls | 5 | 5 | 5 | Scored from code: a sensible twin-stick scheme with an input buffer. No touch controls; aim may be unforgiving. |
| physics_feel | 3.75 | 4 | 3.5 | Kinematic steering suits the genre, but there is no knockback or impulse response. |
| sound_audio | 3 | 3 | 3 | Scored from code: 13 oscillator/noise WAVs, no music. Prototype-grade. |
| loading_transitions | 4.25 | 4 | 4.5 | First draw at about 3.2-3.8s with no errors. 16.4 MB is mostly the off-screen lamp GLB. No loader art. |
| polish_juice | 2 | 2 | 2 | Juice is declared but not rendered: shockwaves, flashes, trails and camera impacts produce no pixels. |
| mobile_presentation | 2.75 | 3 | 2.5 | A 390x844 backbuffer on a DPR-3 device is blurry, the desktop HUD crowds the top third, and there are no touch controls. |
| performance | 4.5 | 4 | 7 | Settled from report.json (see below). |
| overall_visual_quality | 2.5 | 2.5 | 2.5 | A murky primitive arena with a flat mannequin, disc enemies, no reflections and unrendered FX. Tech-demo grade. |

**How the performance disagreement was settled.** Judge B's 7 relied on `engine[].fps: 60`. That value reads 60 on every shot of every run, so it is a nominal counter, not a measurement. The harness's measured `runs[].fps` gives:

- 1920x1080: 25.8 fps, p50 33.4ms, p95 53.2ms, 65 of 131 frames over 33ms.
- 1280x720: 39 fps, p95 50ms.
- Mobile: 41.8 fps.

On the same runner, Orbital Defense holds 59.6/60/58.8 and Vault Breakers 57.4/59/59.4, so Judge A's reading is correct. I score it 4.5 rather than 4 because the game is mid-to-upper within the fleet, where many games sit at 5-15 fps. It is still poor for about 55 draw calls on a trivial scene: mobile renders at 1/9 resolution, and the scene still loads 1.09M lamp tris that sit off screen.

## 2. What looks poor

- **Dark, empty frame.** The upper ~40% is a near-black void over a flat teal-blue box floor that has only a smooth point-light gradient. Mean luma is 22-35/255, 40-60% of pixels are near black, and only about 2% are strongly saturated.
- **Neon that doesn't glow.** The brightest element near screen center is a desaturated grey-cyan bloom blob (sampled 73,105,114), not crisp neon.
- **Weak characters.** Enemies are tiny smooth-shaded 8/10-gon discs whose facets have been smoothed into pillows. The player is a small static mannequin painted one color, sliding without animation.
- **Missing world features.** No reflections on the "wet" street, no visible shadows or contact grounding, no rain, no sky.
- **No visible combat feedback.** No hit flash, death burst, dash trail or screen shake. Only small spark specks and a thin ring.
- **Generic HUD.** A system-font dashboard grid in the corners.
- **Blurry mobile.** Mobile is upscaled 3x and is soft and blocky.

## 3. Why

Attribution, averaging the two judges: engine 26%, defaults 16%, assets 23%, game 25%, authoring 10%.

**Engine (26%)**
- IBL is forced off whenever `lights.ambient` exists, and ambient is about π-scaled.
- Shadow strength is 0.32, and the depth pass ignores instancing, so the swarm casts no shadows.
- Bloom is single-scale with the threshold clamped to [0,1].
- SSAO is depth-raw, runs in 8-bit after tone mapping, and yields about zero.
- colorGrade exposure is dropped.
- Custom-geometry normals are averaged.
- The model material override wipes textures.
- There is no runtime node-spawn API.
- The renderer lacks four needed capabilities: runtime spawning or pooled rendering of FX, instanced shadow casting, usable HDR bloom, and IBL coexisting with ambient light.

**Defaults (16%)**
- pixelRatio is pinned at 1 (safe-basic), which causes the mobile 1/9-resolution render.
- FXAA is layered on MSAA.
- The bloom preset is softKnee 0.5 "balanced".
- Fog density 0.02 only darkens.

**Assets (23%)**
- The assets themselves are weak, not just badly rendered. The enemies are programmatic discs, half the assets are 4-tri unlit image cards, and the hero is unrigged.
- The two decent assets are rendered or placed badly. The courier's textures are stripped by the tint, and the lamps sit off camera.

**Game (25%)**
- cameraDirector, cameraPunch and the 7 effect spawns are wired to nothing, so the gameplay is visually empty of feedback.
- Animation is simplistic: translate and yaw only.
- The environment is under-authored. The compact composition hides the canopy and lattice, and there is no sky or rain.
- The lighting is a brute-force rig of 10 point lights over flat ambient.

**Authoring (10%)**
- `?capture=review` renders a different world, with 4 ART drift branches.
- The visual gate is only `minimumNonBlackPixels: 1500`, so agents optimized for evidence rather than pixels.

**Which factors are at fault**
- Lighting, materials and post are all at fault.
- The camera is serviceable in angle but rigid and juiceless.

## 4. Largest improvements (ranked)

1. **Wire the juice that already exists.** Add an engine runtime or pooled spawn bridge so game.effects renders. Apply cameraDirector output (shake, lead, impact zoom) and cameraPunch. Add enemy hit flash, hit-stop and additive death bursts.
2. **Add an HDR night-city environment.** Use an HDRI/PMREM, stop zeroing IBL when ambient exists, and give the street a low-roughness wet material with SSR or a planar reflection.
3. **Rebuild bloom and the light rig.** Use HDR multi-scale bloom with a threshold above 1.0, emissive values above 1 on enemies, pulses and rings, and fewer, purposeful key and rim lights in place of the 10 point lights. Honor colorGrade exposure.
4. **Replace the hero.** Use a rigged, textured character with run, strafe, fire and dash clips on an AnimationController. Fix the tint override so it preserves texture maps.
5. **Replace the enemy discs.** Author 2-3 drone meshes with emissive maps and hard-edged normals, and fix the averaged-normals bug in the engine.
6. **Author a real arena.** Use a neon-district kit in frame (signage, emissive windows, puddle decals) plus rain particles and a city skyline. Decimate the lamps and move them on screen, or drop them.
7. **Fix resolution and anti-aliasing.** Set pixelRatio to min(DPR, 2), drop FXAA over MSAA, and add touch controls.
8. **Fix shadows and AO.** Make the depth pass instancing-aware, raise strength to 1, and use linear-depth GTAO run in HDR.
9. **Redesign the HUD.** Use an arcade overlay with a display face, large score and combo, diegetic HP pips, and a mobile layout.
10. **Fix capture parity and visual QA.** Retire the divergent review world, put `check:capture-parity --fail-on-art` in CI, and replace the pixel-count gate with real visual QA.
11. **Upgrade audio.** Replace the oscillator SFX with sampled, layered synthwave SFX and add a music bed.

## 5. Verdict: substantial-rebuild

Both judges agree on this verdict, and I concur.

The gameplay core and controls are sound and keep their value: twin-stick input, an input buffer, and combo, graze and burst logic. The scheme is coherent, and performance is mid-to-upper within the fleet.

Polish alone cannot get there, though. Nearly every visual layer needs replacement:

- All the character and enemy assets.
- The environment kit.
- The lighting and IBL approach.
- The bloom.
- The FX rendering path, which needs a new engine API.
- Animation.
- The HUD.

Several of these block on engine fixes. A full rebuild is not warranted because the game logic, the input layer and the existing juice systems can be kept and finally wired to rendering.

## 6. Capture caveats

- **No pixels viewed.** None of the 3 reviewers could view the images; reading them returned empty results. Visual scores come from numeric pixel analysis (luma, saturation, palettes, ASCII luminance maps, an upscale-block test), report.json and code. A human spot-check is needed.
- **No action shots.** The kills > 0 wait timed out (about 6.3s) on both desktop runs, so the 04-action shots show no kill FX.
- **No burst shots.** 05-burst shows the player dead with bursts = 0 (charge 3-7%), so no burst VFX was captured. The 1280x720 run may already have been dead at 04.
- **Ignore the engine fps field.** The engine-reported `fps: 60` is a constant and not usable. Use the measured `runs[].fps` instead.
- **Weak test GPU.** Headless paravirtual GPU on a 3-vCPU runner. Absolute fps is indicative only, so compare against peers.
- **Mobile blur is real.** Mobile used deviceScaleFactor 3, but the engine renders a 390x844 backbuffer. That is engine behavior, not a harness artifact.
- **Route captured.** The production route was captured, not `?capture=review`.

## 7. Screenshot evidence

All files are in `/tmp/qr/game-captures/out/showcase-neon-swarm/`. What each shows is inferred from stats and state, since none could be viewed.

- `contact-sheet.png` (2432x1200): a grid of all shots. Not viewable.
- `desktop-1920x1080__01-title.png`: intermission, 0 drones. Luma 22.4, 60% dark, 1% bright, with the HUD as the main bright content.
- `desktop-1920x1080__02-opening.png`: wave 1, 7 drones, pickup active. Luma 25.4, 48% dark, 0.4% bright, faint teal floor wash.
- `desktop-1920x1080__03-mid.png`: 36 drones, 0 kills. Black void in the upper ~40%, HUD top left and right, a grey-cyan hotspot at center, a pink-lavender emissive element above it, teal floor gradient below.
- `desktop-1920x1080__04-action.png`: 36 drones, hp 1, 0 kills. Not a true action shot (the kill wait failed); a few more bright specks.
- `desktop-1920x1080__05-burst.png`: the player is dead with no burst, so it shows the game-over overlay with bright bars and a ring structure top left.
- `desktop-1280x720__01-title.png` / `__02-opening.png` / `__03-mid.png` / `__04-action.png` / `__05-burst.png`: the same layout at 1280x720. The 03-mid shot has luma 34.7, 33% dark and 49 draw calls; 04 and 05 are likely post-death.
- `mobile-390x844__01-title.png`: the brightest shot (luma 53). Intro and HUD panels with cyan UI fill the portrait screen, and 11% of pixels are saturated, mostly UI.
- `mobile-390x844__02-opening.png`: 5 drones, 43% dark, 32 draw calls, 3x upscaled backbuffer.
- `mobile-390x844__03-mid.png`: 36 drones. HUD crowds the top third, with a central bloom blob and a teal floor. The upscale test (intra-block difference 0.49 vs 0.97 across blocks) confirms the 1/9 resolution.
- `/tmp/qr/game-captures/out/report.json`: source for the measured fps that settled performance.

# Pulse Tunnel (`showcase-pulse-tunnel`)

## 1. Final scorecard (0–10)

No category differed by more than 2 points; the largest gap was 1.0. That meant no tie-break was needed. I still tried to view the PNGs myself, but the Read tool returned no viewable content (see section 6). Final scores are the judge average, rounded down to the nearer 0.5 where the more evidence-backed judge was lower.

| category | final | judge A | judge B | justification |
|---|---|---|---|---|
| environment_world | 2 | 2.5 | 2 | About 250 static primitive boxes, cylinders and slabs. The world never scrolls. All saturated pixels are cyan, blue or violet. |
| modeling_assets | 2.5 | 3 | 2 | The runner is a Blender procedural kitbash (16k tris). The lane is primitive boxes. Spire cylinders shade wrong. CC0 kits were rejected. |
| texture_quality | 1 | 1.5 | 1 | 128px NEAREST-filtered textures with planar UVs `(x*0.34)%1` tile across multi-metre hulls, giving literal 8-bit point sampling. |
| material_quality | 1.5 | 2 | 1 | Metallic 0.72–0.92 with no IBL renders near-black. The reactor arches are hidden because they read as a "black canopy". |
| pbr_credibility | 1 | 1.5 | 1 | The BRDF is fine but its inputs are degenerate: metals have nothing to reflect and ambient is a flat wash. |
| lighting | 2 | 2.5 | 2 | A saturated cyan #38bdf8 key over navy ambient, with 6 of 17 lights at 0. No key/fill/rim separation and 0% warm pixels. |
| shadows | 1 | 1.5 | 1 | One nearest-compare map at 0.32 strength with no cascades. Contact shadows on the lane are effectively absent. |
| ambient_lighting | 2 | 2 | 2 | Constant ambient (about π× three.js) times a fake hemisphere factor. No AO or GI. |
| ibl_reflections | 0 | 0.5 | 0 | IBL is fully off: ambient present with no environment sets env specular to 0. |
| tone_mapping | 3 | 3.5 | 3 | ACES at fixed exposure, with the game's colorGrade exposure silently dropped. Median luma 7 vs p95 150, and about 2% of emissives clip. |
| color_management | 3 | 3.5 | 3 | The sRGB pipeline is correct. The palette is a monochrome, oversaturated cyan-violet with a blue grade on top. |
| anti_aliasing | 3 | 3.5 | 3 | DPR 1 plus FXAA over MSAA makes frames soft (low gradient energy at 1080p). Mobile renders at 1/9 native pixels. |
| postprocessing | 3 | 3 | 3 | Bloom with softKnee 0.5 and threshold clamped to [0,1] gives a milky haze. Fog 0.065 eats depth. Post runs in 8-bit, so banding is likely. |
| vfx | 2 | 2.5 | 2 | Gameplay gets only 10 graze spheres, an emissive swap, a fog pulse and a shield orb. The rich VFX run only under `?capture=review`. |
| particles | 1 | 1.5 | 1 | No particle systems in gameplay: no streaks, exhaust or debris. |
| animation_quality | 2 | 3 | 2 | Rigid transform tweens only. Frames 10 s apart differ by a mean of 0.30 luma, with 0.3% of pixels changed. |
| character_presentation | 2 | 2.5 | 2 | The hero craft is a small near-black metallic silhouette with no rim light. |
| camera | 1 | 1.5 | 1 | A fixed literal [0,0.72,3.8] at FOV 50, never updated: no follow, lean, FOV kick or shake. |
| composition | 3 | 3.5 | 3 | Centred vanishing-point corridor, but the side slabs dominate and the game sits in a dashboard card. |
| scale_depth_perception | 2 | 2.5 | 2 | No parallax because the world is static. Dense fog flattens depth. |
| atmospheric_effects | 3 | 3 | 3 | The fog pulses on the downbeat, which is a good idea, but it is a flat purple exp2 wash with no height fog or volumetrics. |
| gameplay_readability | 4 | 4 | 4 | Emissive gates are legible on the dark background. The ship is hard to locate, gates and ship share hues, and hits are weakly telegraphed. |
| ui_hud | 3.5 | 4 | 3 | A functional DOM stat panel and touch buttons, laid out as a web dashboard. SECTION stays "intro" at 1500 m. |
| typography | 3 | 3.5 | 3 | Segoe UI plus system monospace, with no display face. |
| game_feel | 3 | 3 | 3 | Scored from code: beat-clocked gates are solid, but there is no camera juice, hit-stop or shake. |
| controls | 5 | 5 | 5 | Scored from code and report: A/D/W/S/P/R plus touch. Deterministic, and inputs registered. |
| physics_feel | 3 | 3 | 3 | Deliberately non-physical scripted curves with no weight or squash. |
| sound_audio | 5 | 5.5 | 5 | Scored from code: 4 synth stems and 9 SFX, with the beat clock about 1 ms from audio. Functional but simple synthesis. |
| loading_transitions | 4.5 | 4.5 | 5 | Ready in about 1.3–1.7 s at 2.2 MB with no errors. No title card or transitions. |
| polish_juice | 2 | 2.5 | 2 | The best juice is review-only (85 review branches). Gameplay ships without it. |
| mobile_presentation | 1 | 1.5 | 1 | The canvas is a 374x187 CSS strip, about 22% of screen height, with a 374x220 backing store (aspect mismatch) at DPR 1. Mean luma about 10. |
| performance | 3 | 3.5 | 3 | Measured 23.5 fps at 1080p (p95 68 ms) against about 60 fps for peers on the same runner. About 250 un-instanced draws. The HUD wrongly reports 60. |
| overall_visual_quality | 2 | 2.5 | 2 | A dark, static, two-hue box corridor with a black point-sampled ship, bloom haze and fog. It reads as a tech demo. |

## 2. What looks poor

- **Dark, two-hue frame.** The scene is a navy/purple field: median luma 7/255, about 54% near-black pixels, and every saturated pixel cyan, blue or violet. Flat cyan slab grids fill the left third and magenta slab grids fill the right third. The centre is a tunnel of emissive rectangles and gate bars.
- **Invisible hero.** The craft is a small near-black silhouette at the bottom centre with no rim light. Its 128px nearest-filtered panels show as pixel grids.
- **No motion.** Nothing moves except the gates and the ship. The camera is locked and the world never scrolls, so frames 10 s apart are almost pixel-identical and there is no sense of speed.
- **Washed-out contrast.** Milky bloom haze plus dense purple fog wash out what contrast exists, while emissives hard-clip.
- **Soft image.** Rendering at DPR 1 with FXAA makes it soft at 1080p.
- **No hit feedback.** Shields fell from 3 to 1 with no visible hit VFX.
- **Dashboard framing.** The game sits in a rounded web card with a system-font stat panel, not full-bleed.
- **Mobile is broken.** It is a tiny, slightly stretched, near-black strip covering about 22% of an 844px screen, at 1/9 native pixel density.

## 3. Why

Attribution: engine 22%, defaults 20%, assets 18%, game 29%, authoring 11%.

- **Asset weak or rendered badly? Both.**
  - The asset itself is weak: a procedural kitbash with 128px NEAREST textures and planar UVs, and primitive boxes for the world.
  - It is also rendered badly: high-metallic materials with zero IBL turn black. The finale reactor arches were hidden for this reason. Real CC0 PBR kits were rejected because they were judged under the broken renderer.
- **Lighting is at fault (game and defaults).** A saturated cyan key over navy ambient, 6 lights at 0, no warm or neutral reference, and ambient at about π× three.js.
- **Camera is at fault (game).** It is a static literal with no follow, lean, FOV kick or shake. This is the single biggest presentation failure for a runner.
- **Materials are at fault (engine default plus game).** IBL is zeroed whenever only ambient is present. Content chose metallic 0.72–0.92 regardless.
- **Post is at fault (engine and game).**
  - Engine: bloom threshold clamped to [0,1], post runs in 8-bit after tone mapping, colorGrade exposure is dropped, and FXAA is applied on top of MSAA.
  - Game: softKnee 0.5, bloom intensity 0.82 and fog 0.065.
- **Environment under-authored: yes.** About 250 static un-instanced primitives. The typed reactor world exists only in the finale.
- **Animation simplistic: yes.** Transform tweens only, with no secondary motion.
- **Gameplay visually empty: yes.** Particles, impacts and good lights exist only in review mode, so players get 10 tiny spheres.
- **Renderer lacks capabilities: yes, partly.**
  - No default IBL.
  - Broken shadow fit and cascades.
  - No HDR bloom threshold.
  - pixelRatio forced to 1 by the safe-basic profile.
  - No runtime node creation, which forces tiny FX pools.
  - No warning on NEAREST filtering of hero textures.
  - A wrong fps counter.
- **Authoring.** The agent critic loop judged assets under the no-IBL renderer, rejected the good kits, and fixed review mode instead of play mode.

## 4. Largest improvements (ranked)

1. **Make the world move.** Add a segment conveyor that recycles hue frames, pylons and slabs toward the camera. Add a chase camera with lag, lane-change roll, FOV kick on beat or boost, and shake on hits.
2. **Turn on IBL.** Use an HDR PMREM environment (RGBA16F, intensity about 1) on the gameplay route, and make it the engine default when only ambient exists. Then un-hide the reactor arches.
3. **Relight gameplay.**
   - Use a neutral or warm key with a strong cyan/magenta rim on the ship.
   - Cut ambient to about 0.3 and fog from 0.065 to about 0.02.
   - Remove the blue grade, set shadow strength to 1.0, and add an accent hue per section.
4. **Move review-only content into gameplay.** Ship the particles, shards, trails, rays and lights. Add speed streaks, an exhaust trail, and hit-stop plus a screen flash on shield loss. Then delete the review branches.
5. **Replace the textures.** Use 1–2K linear-mipmapped albedo/ORM/normal maps with proper UVs. Re-evaluate the Quaternius CC0 kits under the fixed renderer.
6. **Fix bloom and post.** Use a threshold above 1 in HDR (remove the clamp), softKnee about 0.1–0.2 and intensity about 0.3. Honour colorGrade exposure and run post on float targets.
7. **Fix resolution and AA.** Default pixelRatio to `min(DPR, 2)` and replace FXAA with SMAA or TAA.
8. **Go full-bleed.** Remove the dashboard card, overlay a game HUD with a display typeface, and fix the mobile canvas (backing-store aspect, portrait-filling viewport, DPR).
9. **Fix performance.** Instance the roughly 250 primitives, reach 60 fps at 1080p, and fix the engine's fps counter.

## 5. Verdict: substantial-rebuild

Both judges agree. The core loop is worth keeping: deterministic controls, beat-clocked gates with about 1 ms drift, the synth audio and fast load. Everything visual has to be rebuilt, though:

- The camera and the static world are architectural, not tuning.
- The asset set (point-sampled kitbash, primitive world) needs to be replaced.
- Lighting and the palette need to be re-authored.
- The VFX need to be ported out of review mode.
- The layout needs to be rebuilt for full-bleed and mobile.
- Several engine defaults have to be fixed first: IBL, bloom clamp, DPR, shadows.

Polish alone can't fix a static camera, a static world and black metallic assets. A full rebuild isn't needed because the gameplay, audio and input systems work.

## 6. Capture caveats

- **No direct viewing.** The Read tool returned empty content for every PNG, for both judges and in my own reconciliation attempt. All visual judgments come from numeric pixel analysis (luma percentiles, hue histograms, clipping, gradient energy, frame differencing), report.json, DOM text and code research. Banding, edge aliasing and bloom shape are inferred, not seen.
- **Finale never captured.** All shots fall in the "intro" section, even at about 1500 m. The sentry, reactor world and rain were never captured.
- **Blind inputs.** Inputs cost 2 shields, but the run never failed.
- **Performance context.** The runner is a headless 3-vCPU virtual M1 with a paravirtual GPU, so absolute fps is pessimistic. The relative gap to Orbital Defense and Vault Breakers on the same runner is real. The engine HUD's 60 fps contradicts the measured 23–31 fps.
- **Extra canvas.** A third 300x150 WebGL2 context appears at about 3.6–4.4 s, probably a probe canvas.
- **Code-scored categories.** Game feel, controls, physics, sound and loading are scored from code and report, not from the stills.

## 7. Screenshot evidence

All files are in `/tmp/qr/game-captures/out/showcase-pulse-tunnel/`.

- `contact-sheet.png`: 2432x1200 sheet of the desktop and mobile shots. The frames are near-identical dark navy compositions.
- `desktop-1920x1080__01-title.png`: "PRESS ANY KEY" ready state. A cyan band over a magenta bar frames the tunnel mouth, with cyan slabs left and magenta slabs right. Luma mean 32, median 12. About 1.8% of pixels clipped.
- `desktop-1920x1080__02-opening.png`: running at 210 m with 3 shields. Median luma 7 and 54% dark pixels. Hue split is cyan 39%, blue 22%, violet 30%. Soft (gradient energy 1.15).
- `desktop-1920x1080__03-mid.png`: 1451 m with shields at 1 and no visible hit VFX. The top third is darkest (luma 21) and the middle band brightest (44). Gates are closer.
- `desktop-1920x1080__04-action.png`: 1516 m. Almost pixel-identical to 02 (mean diff 0.30), which shows the static camera and world.
- `desktop-1280x720__01..04`: same composition at a 1246x701 canvas. Sharper per pixel (gradient energy about 2.06), with the same murk and the section still "intro".
- `mobile-390x844__01-title.png`: 1170x2532 capture. Lit content only in rows about 21–615 (about 24% of height). The rest is a near-black panel. Mean luma 10.
- `mobile-390x844__02-opening.png`: 221 m. A tiny cyan/blue strip with mean luma 9.8.
- `mobile-390x844__03-mid.png`: 1498 m with shields at 1. Very dark apart from emissive peaks (max luma 239).

# Aurora Lander (`showcase-aurora-lander`)

## (1) Scorecard

No category had the judges more than 2 points apart. Performance had the largest gap (exactly 2), so I checked it against `report.json`. Judge A's measured numbers are correct. Judge B used the engine's self-reported `fps: 60`, which disagrees with the harness's rAF frame-time measurement. I tried to Read the PNGs directly and got empty results, the same failure both judges reported. Final scores therefore rest on the judges' pixel statistics plus `report.json`.

| Category | Final | A | B | Justification |
|---|---|---|---|---|
| environment_world | 2 | 2 | 2 | After spawn, 85–98% of the canvas is flat clear color #0e233e. The world is a 96 m untextured heightfield with no horizon or sky. |
| modeling_assets | 2 | 2 | 2 | 460-tri flat-color probe, 66-tri beacons, 12x16 primitive spheres, box-strut gantry, 4-tri image cards. |
| texture_quality | 1 | 1 | 1 | Gameplay surfaces have no textures. The only PNG cards are hidden or parked during play. |
| material_quality | 2 | 2 | 2 | One roughness-0.94 regolith color and a flat-tinted hull. The ghost renders opaque because the tint path drops opacity. |
| pbr_credibility | 2 | 2 | 2 | The BRDF is sound, but with no environment, flat albedo and no normal maps it reads as unlit plastic. Gantry undersides crush to #000. |
| lighting | 3 | 3 | 3 | The rig structure is fine (key 2.35, rim, bounce). In frame it collapses into a cyan ambient wash with no slope shading and no plume light. |
| shadows | 2 | 3 | 2 | Shadows are enabled, but strength 0.32 plus an ortho fit inflated by the far planet and nodes parked at y=-50 leave no visible contact shadow in any shot. |
| ambient_lighting | 2 | 2 | 2 | Flat cyan ambient at 0.4 (about pi-scaled), no hemisphere, no AO (the AO pass is a no-op). |
| ibl_reflections | 0 | 0 | 0 | `lights.ambient` forces environmentMapIntensity to 0. Nothing is reflected. |
| tone_mapping | 4 | 4 | 4 | ACES does not clip (bright fraction 0.2% or less), but the image sits at luma 31–35 with no highlights. Engine drops colorGrade exposure. |
| color_management | 3 | 4 | 3 | Fog, clear color, rim and ambient all converge on navy/cyan, so there is no figure-ground or warm/cool separation. 4-bit color count falls from 434 to 196. |
| anti_aliasing | 4 | 4 | 5 | 4x MSAA gives clean ramps, but the "FXAA" is a 4-tap blur and mobile renders at DPR 1 on a 3x device. |
| postprocessing | 3 | 3 | 3 | Bloom 0.22 at x7 gain turns the plume into a blob bigger than the craft. Fog erases the terrain instead of adding depth. Post runs in 8-bit. |
| vfx | 2 | 2 | 2 | The plume is one stretched sphere. Dust is 12 spheres, debris 10 boxes, and the aurora is opaque emissive slabs. |
| particles | 1 | 1 | 1 | There is no particle system, only pre-allocated primitive pools (72 sphere snow nodes). |
| animation_quality | 2 | 2 | 2 | Rigid probe with no legs, gimbal or RCS puffs. Motion is transform-only (judged from code). |
| character_presentation | 2 | 2 | 2 | The hero craft is about 100–200 px at spawn and shrinks to a few dozen px. Generic capsule silhouette with no panel detail. |
| camera | 2 | 3 | 2 | Fixed-offset follow with no altitude framing or look-ahead to the pad. The ground leaves the frame within about 8 s. This is the defining defect for a lander. |
| composition | 2 | 2 | 2 | A centred dot in a void. The title frame is a crude gantry. The briefing column takes 252 px (13%) of desktop width; the canvas is 1668 px wide. |
| scale_depth_perception | 2 | 2 | 2 | No horizon, aerial perspective, terrain detail or ground shadow. Altitude is readable only from the HUD. |
| atmospheric_effects | 2 | 2 | 2 | Fog matches the clear color, the aurora is opaque boxes, and the stars and planet are primitives. |
| gameplay_readability | 3 | 3 | 3 | HUD values are precise, but the pad is off screen at spawn (a beam was added to compensate) and the ground vanishes at altitude. |
| ui_hud | 5 | 5 | 5 | Clean mono instrument chips plus a fuel bar. Genre-appropriate but plain, and the side column reads like a dev dashboard. |
| typography | 4 | 5 | 4 | Generic system mono stack with no display face. The "PROTOTYPE · AUTHORED ARCADE DYNAMICS" label is visible to players. |
| game_feel | 3 | 4 | 3 | Systems are solid (grading, ghost, campaign, gust telegraph), but there is no shake, nozzle light or touchdown juice. From code only. |
| controls | 5 | 5 | 5 | Complete keyboard and touch RCS mapping. Inputs reached gameplay (fuel went from 1.0 to 0.915). |
| physics_feel | 4 | 5 | 4 | Rapier heightfield plus arcade dynamics. Touchdown was never observed. Held thrust climbs from 64 m to 135 m, which suggests generous thrust. |
| sound_audio | 3 | 4 | 3 | 10 synthesized oscillator/noise SFX with no sampled material. From code only. |
| loading_transitions | 5 | 5 | 5 | Ready in about 1.6–2.3 s, 22 resources, about 4 MB, zero errors or failed requests. No intro or transition polish. |
| polish_juice | 2 | 2 | 2 | No nozzle light, shake, impact flash or particles. The ghost is opaque. The only juice is a CSS gust pulse. |
| mobile_presentation | 3 | 3 | 3 | The canvas is 390x557 (66% of height) rendered at 1x on a DPR-3 device, so 1/9 of native pixels. The HUD stacks below. |
| performance | 6 | 6 | 8 | `report.json` rAF data: 1080p 52.2 fps (p95 33.4 ms, 12 frames >33 ms); 720p 49 fps (max 106 ms, 25 frames >33 ms); mobile 59.6 fps. That is weak for 13–73 draw calls. B used the engine's self-reported 60. |
| overall_visual_quality | 2 | 2 | 2 | An early tech demo: a small flat capsule and a bloom blob in a flat navy void. |

## (2) What looks poor

- After the title frame, almost the whole screen is one flat navy (#0e233e). Non-background pixels drop from 47% (t=0) to 15% (2 s), 4.4% (8.9 s) and 2.2% (16 s). The frame color count falls from 434 to 196.
- The craft is a small, flat-shaded 460-tri capsule. Its thrust is a stretched sphere that bloom inflates into a glowing blob larger than the craft.
- The terrain is a faint low-contrast teal strip (mean RGB about 10,62,57, std about 3–12) with no texture, slope shading, horizon or edge treatment. Navy fog makes it dissolve into the background.
- The title frame is dominated by an axis-aligned box-strut gantry whose undersides crush to pure black (about 18k #000 pixels).
- The sky is the clear color with sphere stars, a faceted 12x16 planet and opaque emissive box "aurora".
- There are no reflections, no visible probe shadow, no particles and no nozzle light. The replay ghost is an opaque blue probe.
- From about 8 s the camera has lost the ground entirely. The 04-action frames are an empty navy screen with a dot.
- On mobile, a 557-px-tall canvas renders at 1x on a 3x screen, with the HUD and briefing stacked below it.

## (3) Why

Root-cause split: engine 28%, defaults 15%, assets 20%, game 25%, authoring 12%.

- **Engine (28%).** The renderer is missing capabilities this game needs:
  - `lights.ambient` forces IBL to 0, so nothing has reflections.
  - The root render path has no sky or atmosphere, so the background falls back to the clear color.
  - Transparent and additive emissive does not composite, which forced the opaque aurora boxes.
  - The model tint path drops opacity, which makes the ghost opaque.
  - Shadows use strength 0.32, nearest-compare filtering, no cascades and a whole-scene ortho fit, so they are effectively invisible.
  - There is no particle system and no runtime node API, so every effect is a pre-allocated primitive.
  - Primitives are coarse, "FXAA" is a 4-tap blur, bloom has x7 gain, post runs in 8-bit, and colorGrade exposure is dropped.
- **Defaults (15%).** The safe-basic profile forces pixelRatio 1, which is why mobile renders at 1/9 of native pixels. Ambient is about pi-scaled compared with three.js. Bloom knee and gain are too aggressive for the plume.
- **Assets (20%).** The assets themselves are weak, not merely rendered badly. The 460-tri flat probe, 66-tri beacons and box-strut gantry have no textures or normal maps. Better rendering would not rescue them.
- **Game (25%).** The world is under-authored: a 96 m island in one color with nothing beyond it. Fog, clear color, rim and ambient are all tuned to the same navy/cyan, which removes figure-ground contrast. The camera is the biggest single fault: a fixed follow with no altitude framing or pad look-ahead. Every effect is a single primitive, so gameplay is visually empty once the craft leaves the ground. Animation is simplistic (rigid body, no articulated parts).
- **Authoring (12%).** Agents nudged emissive and background values to hit mean-luma targets (main.ts:594-597) instead of adding an environment, a sky and a terrain material.
- **Lighting, camera, materials and post are all at fault.** Lighting energy sits in ambient instead of the key light. Materials are flat. Post bloom distorts the plume, and fog hides depth instead of creating it.

## (4) Largest improvements, ranked

1. **Altitude-aware camera.** Pull back and pitch down as altitude rises, look ahead toward the pad, and keep the surface and pad in frame at all times. Without this, every other fix stays off screen.
2. **Night environment and sky.** Engine: let `lights.ambient` coexist with IBL and provide a default HDR night environment and sky. Game: author a starfield/sky dome with sky value and hue separated from the terrain. Cut cyan ambient to a low hemisphere fill and move the energy into the moonlight key.
3. **Terrain.** Triplanar regolith albedo, normal and roughness maps plus a detail normal. Add slope- and height-based color variation, far LOD rings or a horizon skirt, and height fog colored differently from the sky so it gives aerial perspective.
4. **Shadows.** Raise strength to about 0.7–1.0, fit the shadow camera tightly to the play area while excluding parked nodes and the far planet, and use PCF. Add a probe contact shadow, which is the main altitude cue for a lander.
5. **Transparent and additive emissive.** Fix the engine path, then replace the box aurora with noise-scrolled additive ribbon curtains and a matching colored moving light.
6. **Particles and juice.** Engine particle or runtime-node API, then a GPU plume and dust, a throttle-scaled nozzle point light, a touchdown dust ring, camera shake and an impact flash. Retune bloom knee and gain so the plume stops blowing out.
7. **Hero assets.** A textured, panel-lined lander at 2–5k tris with articulated legs and RCS nozzles, lit pad markings, and a properly modeled bay in place of the box gantry.
8. **Resolution, mobile layout and ghost.** Set pixelRatio to min(DPR, 2), make the mobile canvas full-viewport with the HUD overlaid, replace the 4-tap FXAA with real FXAA/SMAA, and honor opacity in the tint path so the ghost is translucent.
9. **HUD.** Add a velocity vector and altitude tape, warning-color states and a display face for titles. Make the briefing column a collapsible overlay and hide the PROTOTYPE label.
10. **CPU overhead.** Investigate it at about 150 primitive nodes: the 49–52 fps desktop result at 13–73 draw calls is lower than peer games reach on the same runner.

## (5) Verdict: substantial-rebuild

The gameplay layer is worth keeping: physics, grading, ghost replay, the 3-site campaign, controls, the HUD structure and loading are all competent. The visual layer, however, is mostly absent rather than under-polished. There is no environment, sky, terrain material, real hero asset, particle FX or usable camera framing. Fixing that means new authoring and new assets on top of engine capability work (IBL with ambient, transparent emissive, particles, shadow fit, DPR), not tuning existing content.

Judge A's "save-through-polish" holds only in the narrow sense that the game code needs no rebuild. Judge B's call matches the scale of the visual work. A full rebuild is not justified, because the systems underneath are sound.

## (6) Capture caveats

- I could not view any image. The Read tool returned empty for the PNGs I tried (desktop 1080p 01-title and 03-mid), just as both judges reported for every PNG and the contact sheet. All visual claims come from pixel statistics, ASCII luma maps, `report.json` and code research (17-games-g4 §3.4). Treat composition detail as inferred.
- The harness held thrust, so the probe climbed from about 64 m to 123 m (1080p) or 135 m (720p) and never touched down. The action condition never fired (`hit: false`) and no landing, crash, dust or grading screen was captured. This exaggerates the emptiness of frames 03 and 04, but it also exposes a real camera defect.
- Performance comes from a headless 3-vCPU virtual M1 with a paravirtual GPU, so numbers are only meaningful relative to other games on the same runner. The engine's self-reported fps (60) disagrees with the harness's rAF measurement (49–52 on desktop). I used the rAF numbers.
- Animation, game feel, physics, controls and audio scores come from code research, not from stills.
- Mobile has only three shots (no 04-action).

## (7) Screenshot evidence

All files are in /tmp/qr/game-captures/out/showcase-aurora-lander/.

- contact-sheet.png: grid of all shots (not viewable).
- desktop-1920x1080__01-title.png (t=0, alt 64.8 m, luma 35.2, 434 colors, 68 draws): box-strut gantry, pad rings and beams in the upper half; a probe below; a flat teal/navy slab in the lower 45% (std about 3); a briefing column at the right 13%; pure-black gantry undersides.
- desktop-1920x1080__02-opening.png (2.0 s, 60.7 m, 299 colors, 20 draws): the probe at centre with a bloom plume blob larger than the craft, a faint teal terrain band at the bottom 15%, and flat #0e233e everywhere else.
- desktop-1920x1080__03-mid.png (8.9 s, 94.5 m, 359 colors): a small probe and plume upper-centre, the ground nearly gone, about 95.6% clear color.
- desktop-1920x1080__04-action.png (16.3 s, 123.2 m, 196 colors): a tiny probe in a completely empty navy frame with no terrain, pad or touchdown.
- desktop-1280x720__01-title.png (alt 66.5 m, 418 colors): same layout as the 1080p title.
- desktop-1280x720__02-opening.png (64.0 m, 468 colors): HUD strip at top, plume streak at centre, otherwise navy.
- desktop-1280x720__03-mid.png (102.1 m): probe and plume upper-centre, about 7% non-background.
- desktop-1280x720__04-action.png (135.2 m, 204 colors): a probe dot on navy, no landing.
- mobile-390x844__01-title.png (luma 40.6, 421 colors): HUD chips on top, gantry and pad scene in a canvas covering 66% of height rendered at 1x on DPR 3, with the briefing and RCS buttons stacked below.
- mobile-390x844__02-opening.png (61.9 m, 299 colors): probe and plume blob, a faint terrain strip, HUD and RCS panel in the bottom third.
- mobile-390x844__03-mid.png (96.4 m, 313 colors): the canvas almost uniform navy (centre std about 4); structure appears only in the HUD and the panel below.

# Gravity Post (`showcase-gravity-post`)

| category | final score | judge A | judge B | one-line justification |
|---|---|---|---|---|
| environment_world | 2 | 2 | 2 | A single flat teal clear colour fills about 58-70% of the frame. There is no skybox, and the stars are spheres inside the play volume. |
| modeling_assets | 2 | 3 | 2 | The hero skiff is a beveled-box kitbash, the planets are 3k-tri spheres, and the courier is a mannequin. The one good asset, the gate, is shown at 0.14 scale with its textures thrown away. |
| texture_quality | 2 | 2 | 2 | 32x32 stripe PNGs on the hero and district. The gate's 14x1024² PBR set is discarded and the 4k planet textures end up as 40 px dots. |
| material_quality | 2 | 2 | 2 | A flat #b7f4ff tint replaces the gate's maps, and emissive at 0.1-0.6 everywhere flattens the shading. Nothing reads as metal or hull. |
| pbr_credibility | 1.5 | 1 | 2 | The BRDF core is sound, but with no environment and a lot of emissive fill everything reads as plastic. |
| lighting | 3 | 3 | 3 | Ambient wash plus Lambert lobes. Mean luma is about 50 with no clear key/fill hierarchy. |
| shadows | 1 | 1 | 1 | One implicit 0.32-strength directional and a primitive cylinder as a fake contact shadow. Shadows are effectively invisible. |
| ambient_lighting | 2 | 2 | 2 | A flat constant times a fake hemisphere factor. No AO or GI. |
| ibl_reflections | 0 | 0 | 0 | lights.ambient() sets environment intensity to 0, so nothing reflects anything. |
| tone_mapping | 4 | 4 | 4 | ACES with no clipping, but exposure is fixed at 1 and the colorGrade exposure of 1.04 is dropped, so the frame is dim. |
| color_management | 4 | 4 | 4 | The sRGB pipeline is correct. The palette is monotone teal/navy with little hue separation. |
| anti_aliasing | 3.5 | 4 | 3 | Desktop with MSAA/FXAA at DPR 1 is acceptable. Mobile at a 1/9 pixel budget is soft. |
| postprocessing | 3 | 3 | 3 | Two blooms stacked, near-zero fog, then FXAA. Restrained, but adds nothing deliberate. |
| vfx | 2 | 2 | 2 | Sparks, trails and plume are rigid boxes and spheres moved with setPosition. |
| particles | 1 | 1 | 1 | No particle system. Beads and dust are individual spheres. |
| animation_quality | 2 | 2 | 2 | The pod only banks and pitches from velocity, the tori pulse on a sine, and the avatar is static. |
| character_presentation | 1.5 | 2 | 1 | An unlit grey mannequin in a box ship that is unreadable under a 10 m top-down camera. |
| camera | 2.5 | 3 | 2 | Fixed perspective at about 9.9 m, pitch 47°. No follow, zoom, damping or shake. |
| composition | 3 | 3 | 3 | I confirmed the dead left quarter: edge density is 0.3 in columns 0-480 vs about 2 in the centre. Subjects are small and the HUD is on the right. |
| scale_depth_perception | 2 | 2 | 2 | Planets read as dots. Fog is about 0% and there is no parallax backdrop. |
| atmospheric_effects | 1.5 | 2 | 1 | Fog is effectively off, and the atmospheres are 0.16-opacity emissive shells, not Fresnel. |
| gameplay_readability | 5 | 5 | 5 | The cyan prediction, cream route, exclusion tori and DOM labels read clearly as a diagram. This is the strongest axis. |
| ui_hud | 4 | 4 | 4 | Generic rounded-card DOM dashboard. innerHTML is rebuilt every frame, so hover flickers. |
| typography | 4 | 4 | 4 | Clean Avenir/Segoe system stack with no game identity, and the copy is dev-speak. |
| game_feel | 3 | 3 | 3 | The drag-launch loop works (docked, score 1129). No shake, hit-stop or dock payoff, and it runs at 6-8 fps. |
| controls | 3 | 3 | 3 | Launch works only by pointer drag. launchActiveAim is never called, so the keyboard cannot launch. |
| physics_feel | 4 | 4 | 4 | Deterministic arcade inverse-distance gravity with accurate prediction. |
| sound_audio | 2 | 2 | 2 | 10 oscillator/noise WAVs with loops faked by retriggering. No music or spatialisation. |
| loading_transitions | 3 | 3 | 3 | 46.8 MB and about 9.9 s to ready, mostly textures for dot-sized objects. No authored transitions. |
| polish_juice | 2 | 2 | 2 | No particles, flash, easing or dock celebration. |
| mobile_presentation | 2.5 | 3 | 2 | A 372x403 canvas at pixelRatio 1 on a DPR 3 screen fills under half the viewport, and the HUD takes the rest. |
| performance | 2 | 6 | 2 | Decided from report.json. The harness measured 6.4 / 7.1 / 7.9 fps (p50 150 ms, p95 217 ms) against about 60 fps for Orbital Defense and Vault Breakers on the same runner. The engine's "60" is its own self-report, and it is wrong. The scene makes 1,230-1,294 draw calls. |
| overall_visual_quality | 2 | 2.5 | 2 | A dim teal programmer-art orbital diagram next to a generic dashboard, at about early-2000s tech-demo level. |

## What looks poor
- A dim, nearly single-colour teal/navy frame (mean luma about 50, under 1.2% bright pixels). One flat clear colour covers most of the canvas, and the left quarter is empty, with essentially zero edges.
- The playfield is a schematic seen from a fixed top-down camera: thin orbit tori, planets as 40 px dots, bead-chain prediction lines, and star and dust spheres floating inside the board.
- The hero is a box-kitbash skiff with 32x32 stripe textures carrying an unlit grey mannequin, too small to read. The dock gates are flat pale-cyan tints.
- Nothing reflects, shadows can't be seen, there is no fog and no sky. Every VFX is a sliding primitive. The dock shows no visible flash or burst: shots 04 and 05 are almost pixel-identical.
- A generic rounded-card HTML dashboard sits on the right.
- On mobile the 3D view is a small, blurry box rendered at a third of native resolution in the top half of the screen, with the HUD below.
- It runs at 6-8 fps on a runner where comparable games hold 60.

## Why
Attribution: engine 15%, defaults 20%, assets 27%, game 23%, authoring 15%.
- **Assets (27%).** The assets themselves are weak, not just rendered badly. The hero and district are agent-synthesised kitbash with 32x32 stripe textures, the planets are low-poly spheres, and the avatar is a mannequin. The one good asset, the gate, is rendered badly because the game's material override (replaceSurfaceTextures:true) wipes its PBR maps.
- **Game code (23%).**
  - lights.ambient() kills IBL completely.
  - There is no environments.* node or skybox.
  - The board is built from about 330 un-instanced primitives, which causes the 1,200+ draw calls and the 6 fps.
  - The HUD rebuilds innerHTML every frame.
  - Keyboard launch is dead.
- **Authoring (15%).** The environment is under-authored. Lights, camera and assets were tuned for a separate ?capture=review lens rather than the frame the player sees. The camera is static at 10 m, which shrinks the planets to dots. Animation is simplistic, and the gameplay is visually empty: no particles and no dock beat.
- **Defaults (20%).**
  - safe-basic pins pixelRatio to 1, which causes the 1/9 mobile pixel budget.
  - Ambient forces IBL to zero.
  - Shadow strength defaults to 0.32.
  - colorGrade exposure is silently dropped.
  - Repeated primitives are not instanced automatically.
- **Engine (15%).**
  - Shadow maps are nearest-sampled and unsnapped, with no cascades.
  - The bloom threshold is clamped to [0,1] with a hard-step bright pass.
  - Spheres are tessellated at 16x12.
  - The fps counter reports 60 when frames take 150 ms.
  - No renderer capability is truly missing, since the PMREM/IBL path exists. But there is no GPU particle or ribbon system available to use.
- **Lighting, materials and post are all at fault.** Emissive stands in for light, there are no reflections, and the post stack runs two blooms.
- **Camera and composition are at fault.**

## Largest improvements
1. Add a space HDRI/starfield via environments.* as both background and IBL, and remove lights.ambient(). Move the stars into the sky.
2. Fix performance: instance the beads, stars, dust and tori, diff-update the HUD, and aim for under 200 draw calls and about 60 fps. Fix the engine fps counter.
3. Delete the gate material override, and make tint multiply in the engine. Replace the skiff, mannequin and district with authored or Meshy assets at 1-2k textures with normal and ORM maps.
4. Add a damped follow-and-zoom camera in flight that eases back to the board on dock. Show planets at 3-5x their current screen size with Fresnel atmospheres, and remove the dead left band.
5. Add a GPU ribbon trail and additive sprite particles for thrust, dock burst and warp, replacing the bead spheres.
6. Set pixelRatio to min(DPR, 2). Give mobile a full-viewport canvas with an overlay HUD.
7. Light and post: a sun key with visible shadows (PCF, texel snapping), less emissive, a single HDR bloom, and honour colorGrade exposure.
8. Restyle the HUD as game UI with a display face and player-facing copy. Wire keyboard launch. Add real SFX and music. Delete the ?capture=review divergence. Downscale the 4k planet textures.

## Verdict
substantial-rebuild. The gameplay loop, prediction physics and readability (5/10) are worth keeping. But every visual layer needs replacing rather than tuning: the hero and district assets, the environment and IBL, the camera, the VFX system, the HUD, and the scene structure that drives the 6 fps draw-call cost. The engine core (BRDF, ACES, sRGB, PMREM path) is sound, so a full rebuild isn't needed.

## Capture caveats
- Read returned empty content for every PNG, for both judges and for me. So no frame was inspected by eye. All visual scores rest on pixel statistics (colour clusters, luma and edge-density grids, frame diffs), report.json, and the code research reports. I re-checked the empty left band and the dark composition by column-wise luma and edge analysis on 03-mid and 04-action.
- I settled the performance disagreement from the harness frame-timing data in /tmp/qr/game-captures/out/report.json, not from the screenshots. Judge A had used the engine's self-reported 60 fps.
- The runner is a headless 3-vCPU virtual M1 with a paravirtual GPU, so absolute fps is pessimistic. The gap against other games on the same runner is still real.
- 04-action and 05-late-coast are both post-dock and nearly identical, so no late-coast gameplay was captured.
- Mobile 03-mid is already docked.
- The capture was otherwise valid: real progression from ready to aiming, coasting and docked (scores 1129 and 1168), with no console, page or request errors.

## Screenshot evidence (all in /tmp/qr/game-captures/out/showcase-gravity-post/)
- contact-sheet.png: overview of all shots (could not be viewed).
- desktop-1920x1080__01-title.png: ready state. Luma 50.5, 684 colours, flat teal background, HUD at x about 1600-1905, 1,264 draw calls.
- desktop-1920x1080__02a-aim.png: aiming. The prediction beads change only 0.41% of pixels.
- desktop-1920x1080__02-opening.png: coasting. Trail and path appear, 5.1% of pixels change.
- desktop-1920x1080__03-mid.png: in flight. Flat colour covers 58.5% of the frame, the left quarter has edge density 0.3, the centre luma is about 62.
- desktop-1920x1080__04-action.png: docked, score 1129. No dock VFX signature.
- desktop-1920x1080__05-late-coast.png: same docked state as 04, so the scene is static after the dock.
- desktop-1280x720__01-title / 02a-aim / 02-opening / 03-mid / 04-action / 05-late-coast.png: same composition at a smaller size (03-mid luma 49.4). 04 and 05 are byte-identical in size.
- mobile-390x844__01-title.png: 372x403 canvas at pixelRatio 1 on DPR 3. Black and HUD dominate the screen.
- mobile-390x844__02a-aim.png: aiming, almost no visible feedback.
- mobile-390x844__02-opening.png: coasting, with the HUD filling the lower half.
- mobile-390x844__03-mid.png: already docked, score 1168. An amber status card sits in the HUD band.

# Gallery Shift (`showcase-gallery-shift`)

## Gallery Shift (showcase-gallery-shift): final reconciled scorecard

No category differed by more than 2 points between the judges; the largest gap is 1.0 (postprocessing, composition, game_feel). The adjudication rule therefore never triggered. I still opened two screenshots to cross-check (`mobile-390x844__01-title.png` and `desktop-1920x1080__03-mid.png`). Read returned empty content for both, the same failure both judges hit. Final scores are reconciled from the judges' numeric pixel analysis, OCR, report.json and the code research, not from my own viewing.

### 1. Scorecard

| category | final | judge A | judge B | justification |
|---|---|---|---|---|
| environment_world | 2.5 | 2.5 | 2.5 | A 16.7k-tri, untextured, 14-flat-colour museum shell plus about 200 merged boxes, floating in a #05070d void; reads as a blockout. |
| modeling_assets | 1.5 | 1.5 | 1.5 | 72-tri Kenney thief, 24-284-tri exhibits, cases and pedestals, a 100k-tri guard with no clips, and a 3k untextured guard; styles don't match. |
| texture_quality | 1 | 1 | 1 | The world has zero textures and props have no UVs; the only texture is the unlit thief's 1024 atlas. |
| material_quality | 1.5 | 1.5 | 1.5 | Flat-factor colour fields with no normal or ORM maps, alpha-0.4 glass with no Fresnel, and emissive box "harnesses" bolted onto the characters. |
| pbr_credibility | 1.5 | 1.5 | 1.5 | No IBL, ambient 1.56 (about 4.9 in three.js units) dominates, and an unlit player sits beside lit guards; everything looks like matte plastic. |
| lighting | 2 | 2 | 2 | About 31 lights against a 16-light cap, four quadrant directionals that flatten form, and light pools faked with emissive discs. |
| shadows | 1 | 1 | 1 | One static corner spot shadow aimed away from play at strength 0.32; skinned meshes cast no shadow; only blob decals ground anything. |
| ambient_lighting | 1.5 | 1.5 | 1.5 | Two ambients totalling 1.56 and no SSAO, so the interior has no corner or contact occlusion. |
| ibl_reflections | 0 | 0 | 0 | No environment node, and the ambient light zeroes IBL in the engine; nothing reflects. |
| tone_mapping | 3 | 3.5 | 3 | ACES is clean with about 0.1% clipping, but the image is dim (mean luma about 38, 48% dark) with no highlight energy; grade exposure is dropped. |
| color_management | 3 | 3.5 | 3 | A coherent navy/slate/cyan palette with 2-3% saturated pixels; monotone, and it doesn't separate lit from dark zones. |
| anti_aliasing | 3 | 3 | 3 | FXAA only at pixelRatio 1; acceptable on desktop, soft on mobile from the 3x upscale. |
| postprocessing | 2 | 2 | 3 | Bloom 0.22 is invisible, fog 0.009 is invisible, no SSAO/DOF/vignette, grade exposure ignored. B's reasons agree that the stack "adds almost nothing", so I took the lower score. |
| vfx | 1.5 | 2 | 1.5 | Single-triangle emissive cones, box lasers and beams, a toggled cylinder alarm; no volumetrics or strobe. |
| particles | 0.5 | 0.5 | 0.5 | No particle systems. |
| animation_quality | 1.5 | 1.5 | 1.5 | The thief has no yaw and moonwalks; guard-1 slides as an unanimated statue; only guard-2 has walk/run clips. |
| character_presentation | 1 | 1 | 1 | A 72-tri unlit hero about 100 px tall, which needs emissive harness boxes and "PLAYER" text labels to be seen. |
| camera | 1.5 | 2 | 1.5 | Fixed overview at about 24.6 m that never follows the player, with no damping, zoom or shake; framing is identical across all shots, and about half the canvas is void. |
| composition | 2.5 | 3 | 2 | A centred, legible cutaway, but a small subject, large black bands above and below, a 238 px side panel, and clutter from labels and rings. |
| scale_depth_perception | 2 | 2.5 | 2 | Only wall silhouettes give depth (no AO, fog or texture gradients), and the character-to-architecture scale is ambiguous. |
| atmospheric_effects | 1 | 1.5 | 1 | Fog has no visible effect and there is no haze, beams or dust in a night-gallery stealth game. |
| gameplay_readability | 4 | 4 | 4 | Cones, detection meter, objective banner and labels make the systems legible, but through debug-style overlays rather than lighting. |
| ui_hud | 3 | 3 | 3 | Developer telemetry in the player HUD ("Backend rapier", "LOS rays 75", guard m/s), a PROTOTYPE tag, and touch buttons on desktop. |
| typography | 4 | 4 | 4 | Clean, consistent uppercase tracked sans; dense hierarchy, awkward wrapping, and soft SDF world text at 1x. |
| game_feel | 2.5 | 2 | 3 | From code: solid LOS/FSM/lift systems, undermined by no facing, a static camera, no juice and 10-15 fps. |
| controls | 4 | 4 | 4 | Reasonable WASD/sneak/sprint/hold-E scheme, documented in the HUD; digital 8-way only; touch unverified. |
| physics_feel | 3.5 | 3.5 | 4 | Rapier colliders, 75 LOS rays and sensors work; movement is kinematic with no visible physical reactions. |
| sound_audio | 2.5 | 2.5 | 2.5 | 11 oscillator/noise synth WAVs, one shared footstep cue, no music, no spatialisation. |
| loading_transitions | 3.5 | 4 | 3.5 | No errors and about 4.2 MB ready in 5-7 s, but a step-before-mount empty frame and no designed intro or transition. |
| polish_juice | 1.5 | 1.5 | 1.5 | The alarm is a CSS red border; no shake, slow-mo, strobe, particles or lift flourish. |
| mobile_presentation | 1.5 | 2 | 1.5 | A 374x344 render upscaled 3x at DPR 3, a 3D view on roughly 29-40% of the screen, stacked HUD and a dead band, at 15.5 fps. |
| performance | 2 | 2 | 2 | 10.1 / 14.5 / 15.5 fps measured, against about 60 fps for sibling games on the same runner, for a trivial scene; the self-reported "fps 60" is wrong. |
| overall_visual_quality | 1.9 | 2 | 1.8 | An untextured, IBL-less, ambient-washed low-poly diorama in a void, seen from a static distant camera with a debug HUD; programmer-art tech demo. |

### 2. What looks poor
- About 50-60% of every frame is a near-black #000006/#05070d void. The museum is a small grey-cyan cutaway diorama floating in it, with empty bands above (about 18%) and below (about 35%).
- Surfaces collapse to about six flat colour fields: navy floor, slate walls, pale limestone #9fafb1. There is no veining, grain, wear, normal detail or texture.
- Nothing reflects. Glass cases are flat alpha-0.4 boxes, and "marble" and metal read as matte plastic under a heavy flat ambient wash.
- There is effectively no shadow or AO. Characters and props float, room corners and floor/wall junctions have no darkening, and depth reads only from wall silhouettes.
- The stealth "light pools" are glowing floor discs and the vision cones are single flat emissive triangles. Light and dark, the core stealth language, is not rendered as light.
- The hero is a 72-tri unlit Minecraft-style cuboid, about 100 px tall, that never turns toward its movement. It is decorated with emissive box shoulder bars and visors plus a floating "PLAYER" label. Guard-1 slides as a statue. Exhibits are 24-284-tri primitives.
- The camera is fixed at about 24.6 m. Frames 01 to 04 differ by only 2-5% of pixels, so every shot has the same framing.
- The HUD is a developer dashboard ("Backend rapier", "LOS rays 75 - Occluded 75", "Sensors 0 - Steps 18", "guard-1 IDLE route 25.0m 1.50 m/s") with an "AURA3D PROTOTYPE" tag. Touch buttons show on desktop, and a 238 px side panel narrows the canvas.
- On mobile the 3D view is a blurry 3x upscale (374x344 at pixelRatio 1 on a DPR-3 screen) in the top portion of the screen, with stacked HUD cards and a dead black band below.
- It runs at 10 fps at 1080p, about 6x worse than sibling games on the same runner.

### 3. Why
Attribution (average of the two judges): **assets 30%, game 20%, defaults 18%, authoring 17%, engine 15%.**

- **Assets (30%).** The assets themselves are weak, not just rendered badly: an untextured Blender-script museum, a 72-tri unlit Kenney hero, agent-generated 24-284-tri props, a guard with no clips, and a guard with no UVs. Even perfect rendering would not rescue them.
- **Game implementation (20%).** The camera is static and distant, the thief has no yaw (a one-line bug), light pools are faked with emissive discs, and four quadrant directionals remove all modelling. Debug telemetry sits in the player HUD, and the 10 fps is likely route-level overhead (lights over the cap, per-frame DOM work, 75 raycasts; not profiled).
- **Engine defaults (18%).**
  - Any ambient light silently disables IBL.
  - Ambient is about π times three.js units, so 1.56 washes out the scene.
  - `safe-basic` renders at pixelRatio 1, which causes the mobile 3x upscale.
  - The 16-light cap silently drops part of the 31-light rig.
  - Game shadow strength is hard-coded at 0.32.
  - `colorGrade` exposure is dropped.
- **Authoring (17%).** The agent compensated for illegibility with harnesses, rings and 3D text instead of fixing the art. It also tuned a separate `?capture=review` composition (ambient 0.06, different camera) rather than the shipped route, so the shipped frame was never iterated on.
- **Engine capability gaps (15%).** The renderer lacks capabilities this game needs:
  - shadows from skinned meshes
  - more than one shadow caster
  - true rect area lights (they become spot proxies)
  - configurable point-light range (fixed at 10 m)
  - pre-tonemap HDR SSAO (the current one is post-tonemap, 8-bit and unused)
  - a correct fps counter
- **Diagnosis by area.**
  - Lighting and materials: the main rendering faults (no IBL, ambient wash, faked light pools, flat materials).
  - Camera: at fault (static and distant).
  - Post: neutral to negligible.
  - Environment: under-authored.
  - Animation: simplistic and buggy.
  - Gameplay: visually empty of feedback (no VFX, particles or juice), and readable only through overlays.

### 4. Largest improvements (ranked)
1. **Hero and guards.** Replace the 72-tri unlit thief with a lit, rigged, PBR-textured humanoid of 5k tris or more, and give both guards walk/run/alert clips. Add facing with `setRotation(0, atan2(moveX, moveZ), 0)` plus slerp.
2. **Lighting.** Delete both ambients and the four quadrant directionals. Add an interior HDRI through `environments.*` for IBL, warm gallery spots over the artworks, and shadow-casting guard flashlights. Let the darkness be dark and remove the emissive pool discs.
3. **Museum art.** Re-author it with tiling PBR sets (veined marble, parquet, plaster with normal and ORM maps). Replace the exhibits with real CC0 statues, vases and paintings, and make the cases env-reflective Fresnel glass.
4. **Camera.** Use a damped follow camera at about 10-12 m with look-ahead and an alert zoom or punch, and frame out the void. Then remove the harness boxes and world labels.
5. **Engine fixes.**
   - Ambient must not zero IBL, and ambient units should be normalised.
   - Warn on or raise the 16-light cap.
   - Support skinned shadow casters and 2-4 shadow lights.
   - Make shadow strength configurable.
   - Add pre-tonemap SSAO.
   - Add true rect lights.
6. **HUD.** Strip the dev telemetry and the PROTOTYPE tag, hide touch buttons on desktop, and turn the side column into a slim overlay so the canvas fills the viewport.
7. **Resolution and mobile.** Render at devicePixelRatio capped at 2 and use SMAA or TAA. On mobile, give the canvas the full screen with an overlay HUD.
8. **Performance.** Profile the 10 fps at 1080p (lights, DOM, raycasts, 206 draw calls) and fix the self-reported fps counter.
9. **VFX and juice.** Volumetric noise-textured cones, dust particles, an alarm strobe light, lift-success VFX, and a detection shake or slow-mo.
10. **Audio.** Recorded footsteps, ambience and alarm, a tension music layer, and spatial panning.
11. **Capture route.** Remove the `?capture=review` divergence so the evidence equals the player's frame.

### 5. Verdict: **substantial-rebuild**
Both judges reached this independently. Every visual asset, the lighting rig, the camera and the HUD need replacement or re-authoring. Polish cannot rescue a 72-tri unlit hero, an untextured world and an IBL-less ambient wash.

A full rebuild isn't warranted. The gameplay systems (Rapier colliders, LOS raycasts, guard FSM, detection meter, hold-to-lift, objectives), the controls, the asset pipeline and the loading are sound and readable, and they can stay while the art, lighting, camera, HUD and performance layers are rebuilt on top. Several engine defaults and gaps also need fixing, or a rebuilt scene would hit the same ceiling.

### 6. Capture caveats
- Neither judge could view any PNG: Read returned empty for all of them, and for JPEG re-encodes. My own Read of two PNGs also returned empty. All visual scores rest on pixel statistics (luma maps, palette quantisation, clip and saturation fractions, frame diffs), tesseract OCR, report.json and code report 17, not on eyeballing.
- The static camera makes all shots near-identical (2-5% pixel change). Blind input produced little movement, detection peaked at 0.048, and lift progress was 0, so the lift bar, alarm and caught states were never exercised.
- The runner is a headless 3-vCPU virtual M1 with a paravirtual GPU, so absolute fps is pessimistic. The comparison is still valid, because Orbital Defense and Vault Breakers held about 60 fps on the same runner.
- The engine's self-reported "fps 60" contradicts the harness rAF measurement (p50 100 ms).
- The engine warned that `step()` was called before the renderer mounted, which drew one empty frame.
- Capture health was otherwise clean: no console, page or network errors, 33 assets ready, state "playing".

### 7. Screenshot evidence
All files are in `/tmp/qr/game-captures/out/showcase-gallery-shift/`. Descriptions come from the judges' numeric analysis and OCR, because none of the images rendered.
- `contact-sheet.png` (plus `contact-sheet.html`): 2432x1200 composite. About 68% is #111111 sheet background, with dark thumbnails of all shots.
- `desktop-1920x1080__01-title.png`: canvas 1682x1064 plus a 238 px right panel. A centred cutaway diorama with black void above and below. Mean luma 37.9, 48% dark pixels, 0.1-0.4% bright. OCR: "STEALTH LINK // OBJECTIVE 1/3 // CLEAN", "LIFT 1 OF 3 - AVOID THE CONES", "AURA3D PROTOTYPE / Gallery Shift".
- `desktop-1920x1080__02-opening.png`: about 2-3% of pixels changed from 01, from small actor movement. Identical framing.
- `desktop-1920x1080__03-mid.png`: about 5% changed. Cyan cluster from the harness and cones. OCR shows the dev telemetry ("Backend rapier", "LOS rays 75 - Occluded 75", "Sensors 0 - Steps 18", "guard-1 IDLE route 25.0m 1.50 m/s", "guard-2 IDLE") and the touch-button row on desktop.
- `desktop-1920x1080__04-action.png`: about 4-5% changed, same framing. A cyan cell in the lower right suggests a cone or ring moved. Detection 0, no lift, no bloom or clip.
- `desktop-1280x720__01-title.png`, `__02-opening.png`, `__04-action.png`: same layout at 1280. Not individually analysed by either judge.
- `desktop-1280x720__03-mid.png`: canvas 1042x704 (the side panel takes about 238 px). Mean luma 43, saturation 2%. Detection reached 0.048 in the 1280 run's action shot.
- `mobile-390x844__01-title.png`: 1170x2532 device px. The 3D view is a 374x344 CSS strip at the top, rendered at pixelRatio 1 and upscaled 3x. Below it are stacked HUD cards (banner, PROTOTYPE, FLOOR/EXHIBITS/SCORE, GHOST/GAIT/EXIT, touch buttons), then a black band in the bottom ~13%.
- `mobile-390x844__02-opening.png`: same layout, with a slightly darker diorama (luma 33.5).
- `mobile-390x844__03-mid.png`: same layout, luma 33.9, saturation 0.8%, detection 0.0054.

# Deep Recovery (`showcase-deep-recovery`)

## Deep Recovery (showcase-deep-recovery): final visual scorecard

No category differed by more than 2 points between the judges. The largest gaps were 1.0 point, in anti-aliasing, game feel and controls. So nothing needed adjudicating: each final score is the mean of the two judges, rounded to the nearest 0.5. I tried to view the screenshots anyway (`desktop-1920x1080__03-mid.png`), and the Read returned empty, as it did for both judges. These scores therefore rest on pixel statistics, report.json and code research, not on looking at the images.

### 1. Scorecard (0-10)

| Category | Final | Judge A | Judge B | Justification |
|---|---|---|---|---|
| environment_world | 1.5 | 2 | 1.5 | 59-81% of each frame is near-black void. The world is about 200 primitives, a squashed-sphere seabed and 4 faceted GLBs. |
| modeling_assets | 1 | 1 | 1 | The hero sub is 2,068 flat-shaded tris with no UVs. The wreck GLB is reused as reef spires and arches. Placeholder grade. |
| texture_quality | 0 | 0 | 0.5 | No textures or UVs anywhere. |
| material_quality | 1 | 1 | 1 | An override collapses the sub's 5 materials into one teal emissive. Emissive rocks flatten all shading. |
| pbr_credibility | 1 | 1 | 1 | The sub is metallic 0.46 with clearcoat but has no IBL to reflect. Emissive-everywhere reads as unlit plastic. |
| lighting | 2 | 2 | 2 | 16 lights at the cap, but the searchlight and headlight stay fixed at spawn. Flat luma, no light pool. |
| shadows | 1 | 1 | 1 | One static spot shadow at spawn, game shadow strength 0.32. Nothing readable once the sub moves. |
| ambient_lighting | 2 | 2 | 2 | Uniform teal ambient at 1.18 with no IBL diffuse and no meaningful AO. |
| ibl_reflections | 0 | 0 | 0 | The engine sets envIntensity to 0 when an ambient light exists, so IBL is off. |
| tone_mapping | 3 | 3 | 3 | ACES on an RGBA16F target is fine, but the image sits in the bottom ~15% of the range and the authored exposure is dropped. |
| color_management | 3 | 3 | 3 | The pipeline is coherent, but the palette is one cyan hue with under 0.6% warm pixels. No accent colour survives. |
| anti_aliasing | 3.5 | 3 | 4 | MSAA plus FXAA is fine on desktop. Mobile renders at 1x on a DPR-3 screen and is upscaled 3x. |
| postprocessing | 1.5 | 1 | 1.5 | Bloom blows emissives into blobs, fog is too weak, and the CPU-readback volumetric fog costs the most and adds the least. |
| vfx | 1.5 | 1 | 1.5 | Sonar is a flat expanding cylinder, contacts are tori, a breach is a red sphere. No bubbles, caustics or god rays. |
| particles | 0.5 | 0 | 0.5 | No particle system. "Silt" is 34 static or sub-locked spheres. |
| animation_quality | 1 | 1 | 0.5 | No propeller spin, bob or flicker in code, and the route renders as a 0.5-1 fps slideshow. |
| character_presentation | 1 | 1 | 1 | The sub is a small faceted teal blob 19 m from the camera, with its yellow livery lost. |
| camera | 2 | 2 | 2.5 | Rigid follow (smoothing 0) at fov 62 from far back. Turns snap; no look-ahead or shake. |
| composition | 1.5 | 2 | 1.5 | No focal hierarchy. The brightest regions are HUD cards and corners, not the sub or wreck. |
| scale_depth_perception | 1.5 | 2 | 1.5 | No depth-graded fog, seabed detail or parallax particulate. Objects float in black. |
| atmospheric_effects | 1.5 | 2 | 1.5 | No caustics, light shafts, marine snow or absorption model. The volumetric fog is a mis-anchored CPU blur. |
| gameplay_readability | 3 | 3 | 3 | The HUD is clear, but the world is too dark to read. You navigate by HUD, not by the scene. |
| ui_hud | 5 | 5 | 5 | Well-structured backdrop-blur telemetry cards. Competent but generic web dashboard, not diegetic. |
| typography | 5 | 5 | 5 | Clean mono telemetry with uppercase labels. Stock type. |
| game_feel | 1.5 | 1 | 2 | Unplayable at the measured 0.5-3.6 fps. Even at full rate there is no camera smoothing or juice (from code). |
| controls | 3.5 | 3 | 4 | Full keyboard set via a raw keydown handler. No touch or gamepad, and 1-2 s input latency at the measured rate. |
| physics_feel | 2 | 2 | 2 | Authored tether integrator, no solver. The grapple never engaged in the capture (towMass 0). |
| sound_audio | 2 | 2 | 2.5 | 11 oscillator/noise WAVs on HTMLAudioElement. No music, spatialisation or underwater lowpass. |
| loading_transitions | 3 | 3 | 3 | Fast load (2.7 MB, no errors), but no title or intro treatment. The game's status stayed "loading". |
| polish_juice | 1 | 1 | 1.5 | Only a CSS HUD pulse. No shake, bubbles, flicker or reward VFX. |
| mobile_presentation | 2 | 2 | 2 | 3x upscaled and soft, 3.6 fps, desktop HUD squeezed into portrait, no touch controls. |
| performance | 0.5 | 0 | 0.5 | Measured 0.5 fps at 1080p, 1.1 at 720p, 3.6 on mobile, while the engine reports 60. Peers ran at about 60 fps on the same runner. |
| overall_visual_quality | 1.5 | 1.5 | 1.5 | A near-black cyan void with emissive primitives and a de-liveried faceted sub. Below the early-2000s underwater bar. |

### 2. What looks poor

- **Void.** 59-81% of every desktop frame is near-black (#000810, the graded #04141c clear colour). Mean RGB is about 6-10 / 21-32 / 30-42, and edge density is about 2%.
- **No focal subject.** The brightest pixels are HUD text and cards plus a few bloomed emissive blobs (1-2.6% clipped), not the sub or the wreck.
- **Monochrome palette.** A single saturated cyan (mean saturation 0.93) with under 0.6% warm pixels. The sub's authored yellow hull is tinted teal, so the hero blends into the water.
- **Primitive geometry.** The seabed is a squashed sphere, coral is cylinders, "caustics" are translucent boxes, "silt" is spheres. Four untextured, faceted, procedurally generated GLBs.
- **Lighting left behind.** The searchlight and headlight stay at spawn, so in shots 03-05 the sub drifts away from its own light. There is no moving light cone, no readable shadow and no reflection.
- **No underwater atmosphere.** No god rays, caustics, marine snow, bubbles or depth-graded absorption. The sonar is a flat expanding disc.
- **Mobile is soft.** The 390x844 canvas is shown on a DPR-3 screen, 3x upscaled (82% of horizontal neighbours are identical).
- **Motion is a slideshow.** 0.5-1.1 fps on desktop. The "grapple" and "action" shots show no grapple, and the mission never got past wreck-approach.

### 3. Why

Root-cause split: engine 20%, defaults 14%, assets 26%, game 25%, authoring 15%.

- **Assets (26%): the assets themselves are weak, not just badly rendered.** `build-models.mjs` is agent-generated and emits 232-2,068-tri meshes with per-face normals and no UVs or textures, yet they are labelled "release". The asset gate checks provenance, not fidelity. Rendering then makes them worse: the material override wipes the sub's livery.
- **Game code (25%).**
  - Emissive on almost everything stands in for lighting.
  - The searchlight and headlight are never synced to the sub.
  - The `replaceSurfaceTextures` override flattens the sub's materials.
  - Camera smoothing is 0, chosen for harness determinism.
  - The environment is about 200 primitives, so it is under-authored.
- **Authoring process (15%).**
  - Iteration targeted a separate `?capture=review` composition (about 40 nodes moved, different lights), not the player view.
  - Animation is effectively absent: no propeller, bob or flicker, so it is not even simplistic.
  - Audio and juice were never built.
  - Gameplay is visually empty: contacts show up through the HUD and tori, not as scene objects.
- **Engine defaults (14%).**
  - An ambient light with no environment node sets envIntensity to 0, so IBL is off.
  - Ambient is about pi times the three.js equivalent.
  - Game shadow strength is 0.32.
  - The safe-basic profile forces pixelRatio 1, which causes the mobile upscale.
  - The authored colour-grade exposure is ignored.
- **Engine renderer (20%).**
  - volumetricFog is a per-frame CPU 8-bit readback with a fixed UV anchor that ignores its authored colour. It is the prime suspect for the collapse, because frame time scales with pixel count.
  - The fps telemetry reports 60 while real frames take about 1.9 s.
  - The bloom threshold is clamped to [0,1] with a hard-step bright pass.
  - Post runs in 8-bit after tone mapping.
  - Shadows use no cascades on the root path and ignore instancing.

Capability the renderer lacks for this genre: a GPU underwater stack (absorption fog, projected caustics, god rays, GPU particles). Lighting, camera, materials and post are all at fault. Materials and lighting are the bigger visual problem; post is the bigger performance problem.

### 4. Largest improvements (ranked)

1. **Fix the frame rate first.** Remove the CPU volumetricFog, profile the route back to 60 fps, and fix the engine fps telemetry. Nothing else matters at 0.5 fps.
2. **Attach the shadow-casting searchlight and the headlight to the sub**, updated every frame. This is the signature underwater shot and costs nothing.
3. **Restore the sub's materials and cut fake light.** Remove the teal override (or make the tint multiply), strip emissive from rocks and props, and give the hull a warm yellow accent.
4. **Replace the procedural GLBs with authored, textured PBR assets with smooth normals:** a liveried sub, a rusted and barnacled wreck, proper crates.
5. **Turn on IBL and fix the light balance.** Add a dim underwater HDR/PMREM, cut ambient from 1.18 to about 0.2, raise shadow strength to 0.8-1.0, and fix the bloom threshold and knee.
6. **Build a GPU underwater stack:** blue-green depth/distance absorption fog matched to the background, animated caustics, screen-space god rays, marine snow and thrust bubbles.
7. **Rebuild the environment** as heightfield terrain with sand/rock PBR and instanced rock and coral. Delete the primitive `environment.ts` and the `?capture=review` world.
8. **Fix the tonal range** so the sub and wreck are the brightest scene elements.
9. **Fix mobile:** set pixelRatio to min(devicePixelRatio, 2) and fix the safe-basic default, then add touch controls and a portrait HUD layout.
10. **Camera and feel:** smoothing 0.1-0.2, look-ahead, a closer offset, shake and red flicker on breach, propeller spin, and a shader sonar ring.
11. **Audio:** move to engine audio with an underwater lowpass and reverb, real samples, and a music bed.

### 5. Verdict: substantial-rebuild

Judge A said full-rebuild and Judge B said substantial-rebuild. I side with B. What has to be thrown away is the content (every asset, the environment, the lighting rig, the material setup, the post/atmosphere stack) plus targeted engine fixes. What can be kept is the game logic, mission flow, HUD and typography (the best-scoring parts), input mapping, and the engine's core BRDF and pipeline. Orbital Defense and Vault Breakers reach about 60 fps on the same engine and runner, so the platform is not fundamentally broken; the frame collapse is specific to this route. Polish cannot save it, because there are no textures, the asset fidelity is placeholder-grade, the environment is primitives, and it runs at 0.5 fps. But nothing requires discarding the game architecture.

### 6. Capture caveats

- **No direct viewing.** Neither judge could view any PNG or JPEG (every Read came back empty), and my own attempt failed the same way. All visual judgements come from pixel statistics, report.json state and bodyText, and the code research (17-games-g5 §3, reports 02/05/08). Treat them as lower confidence than a true visual review.
- **Slideshow capture.** Frames ran at 0.5-1.1 fps on desktop and 3.6 on mobile. Only 12-79 frames rendered in 13-80 s, and the game's evidence status never left "loading" (it needs frameCount 90).
- **Shots don't match their labels.** The mission never passed wreck-approach. Depth stayed at about 2-6 m, so the 15 m dive goal was never reached. towMassKg stayed 0, so the "grapple" and "action" shots show no grapple. The "title" shot is t=0 gameplay; there is no title screen.
- **Engine fps is unreliable.** It reported 60 throughout, contradicting the measured frame times.
- **Runner and coverage.** Headless paravirtual GPU on a 3-vCPU VM, so read the numbers relative to peers. A third 300x150 WebGL context appeared at 7-29 s. Only 3 mobile shots exist. The judges did not analyse the 1280x720 01/02/04/05 shots.

### 7. Screenshot evidence

All in /tmp/qr/game-captures/out/showcase-deep-recovery/. Contents are inferred from pixel statistics, not viewed.

- `contact-sheet.png`: 2432x1200 composite of the shots. Not viewable.
- `desktop-1920x1080__01-title.png`: t=0 gameplay, not a title screen. 55-67% near-black. HUD reads oxygen 100%, hull 100%, depth 6.0 m, "DESCEND TO 15 M · PULSE SONAR". Lit clusters at centre-left and lower-right. 316 draw calls.
- `desktop-1920x1080__02-opening.png`: t=5.5 s, almost identical to 01 (frameCount went only 12 to 22). Speed 3.8 m/s. 308 draw calls.
- `desktop-1920x1080__03-mid.png`: t=39 s, wreck-approach after 1 sonar ping with 8 returns. 59-72% void, 2.65% clipped white (HUD plus bloom). Bright bottom corners. 235 draw calls.
- `desktop-1920x1080__04-action.png`: t=63 s, the darkest shot (mean luma 18.7, 66-80% near-black). The sub has drifted from the spawn lights. 173 draw calls.
- `desktop-1920x1080__05-grapple.png`: t=80 s, 66-81% void. One bright blob bottom-right. No grapple (towMass 0). 152 draw calls.
- `desktop-1280x720__03-mid.png`: t=20.8 s, wreck-approach after a ping. Flat luma grid of 18-33 with no focal peak. 198 draw calls.
- `desktop-1280x720__01-title.png`, `__02-opening.png`, `__04-action.png`, `__05-grapple.png`: present but not analysed by either judge.
- `mobile-390x844__01-title.png`: 1170x2532 image from a 390x844 canvas, so 3x upscaled. HUD cards dominate the top-left (luma about 58). Mean luma 36.9.
- `mobile-390x844__02-opening.png`: HUD-dominated top-left (60.7), dark centre-right (12). 149 draw calls. 3.6 fps.
- `mobile-390x844__03-mid.png`: after a ping. 82% of horizontal neighbours are identical (upscale). Lit content in the lower half. Depth 2.2 m. 86 draw calls.
