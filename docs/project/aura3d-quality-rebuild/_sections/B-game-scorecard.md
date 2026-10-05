## 18-game scorecard

Sources. The 27 visual categories (everything except Feel, Ctrl, Phys, Audio, Load, Perf) come from research/21-game-vision-judgment.md. That is the authoritative vision pass over the shipped production screenshots: GH Actions run 37289688772, macos-14, ANGLE Metal on a paravirtual GPU, production origin aura3d.auraone.ai, sha c08d8acb. The six non-visual categories come from research/20-game-scorecards-code-pixelstats.md, rounded to the nearest 0.5 with ties going up. Performance was cross-checked against fps in evidence/games/report.slim.json.

"Mean" is the per-game mean of the 32 component categories, excluding Overall. The bottom row is the per-category mean across games. fps figures are relative: the runner is a 3-vCPU, 7 GB virtual M1. On that same runner, Orbital Defense and Vault Breakers sustain about 60 fps, so the runner is not the cap.

### 1. Summary table (0–10)

| Game | Env | Asset | Tex | Mat | PBR | Light | Shad | Amb | IBL | Tone | Color | AA | Post | VFX | Part | Anim | Char | Cam | Comp | Depth | Atmo | Read | HUD | Type | Feel | Ctrl | Phys | Audio | Load | Juice | Mob | Perf | Overall | Mean |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| Aura Clash Arena | 4 | 4 | 4 | 3 | 3 | 3 | 2 | 3 | 2 | 3 | 4 | 4 | 2 | 2 | 2 | 4 | 3 | 3 | 3 | 4 | 1 | 5 | 6 | 6 | 5 | 5.5 | 4 | 4 | 4 | 3 | 2 | 3 | 3 | 3.5 |
| Blockfall Reactor | 4 | 3 | 5 | 5 | 4 | 4 | 1 | 3 | 3 | 6 | 6 | 6 | 5 | 2 | 2 | 2 | 3 | 2 | 5 | 3 | 2 | 6 | 4 | 5 | 4 | 6 | 4 | 3 | 4 | 2 | 3 | 2 | 4 | 3.7 |
| Skyline Runner | 5 | 4 | 4 | 4 | 3 | 4 | 2 | 4 | 1 | 4 | 5 | 5 | 4 | 4 | 1 | 3 | 5 | 4 | 4 | 3 | 3 | 4 | 6 | 6 | 3 | 4 | 4 | 3 | 4 | 2 | 2 | 2 | 4 | 3.6 |
| Turbo Drift Circuit | 2.5 | 3.5 | 1.5 | 3 | 3 | 3.5 | 2.5 | 3.5 | 2.5 | 4 | 4.5 | 5 | 3.5 | 2 | 1.5 | 3 | 4 | 3.5 | 2.5 | 2.5 | 3 | 5 | 6.5 | 7 | 5 | 5 | 4 | 3 | 5 | 2.5 | 3 | 3 | 3 | 3.5 |
| Siege Golf | 3.5 | 3 | 2.5 | 3 | 2.5 | 4.5 | 4.5 | 4 | 1.5 | 5 | 5 | 6 | 4 | 3 | 1.5 | 3 | 1 | 4.5 | 3.5 | 3 | 2 | 6 | 4 | 6 | 4 | 5 | 6 | 3 | 3.5 | 3 | 3.5 | 3 | 3.5 | 3.7 |
| Aurora Lander | 1.5 | 4 | 1.5 | 2.5 | 2 | 2.5 | 1 | 3 | 1 | 3.5 | 4.5 | 5 | 3 | 2.5 | 1 | 3 | 3.5 | 2 | 1.5 | 1.5 | 1 | 4 | 5.5 | 5.5 | 3 | 5 | 4 | 3 | 5 | 2 | 4 | 6 | 2.5 | 3.1 |
| Neon Swarm | 2 | 3 | 3 | 3 | 3 | 3 | 2 | 2 | 1 | 4 | 4 | 5 | 4 | 2 | 1 | 2 | 3 | 4 | 3 | 2 | 2 | 2 | 5 | 5 | 3 | 5 | 4 | 3 | 4.5 | 2 | 3 | 4.5 | 2.5 | 3.1 |
| Gravity Post | 2.5 | 3 | 2.5 | 2 | 1.5 | 2 | 0.5 | 2 | 1 | 3 | 4 | 4 | 1 | 2 | 2 | 2 | 2.5 | 4 | 4 | 2 | 1 | 5 | 6 | 6 | 3 | 3 | 4 | 2 | 3 | 2.5 | 2.5 | 2 | 3 | 2.7 |
| Courier Rush | 2 | 4 | 3 | 3 | 2 | 3 | 1 | 3 | 1 | 2 | 4 | 5 | 2 | 3 | 1 | 3 | 2 | 3 | 3 | 3 | 1 | 2 | 6 | 6 | 2.5 | 5 | 3 | 1.5 | 4 | 2 | 3 | 2 | 2 | 2.8 |
| Pulse Tunnel | 3 | 3 | 1 | 3 | 3 | 3 | 1 | 2 | 3 | 4 | 5 | 5 | 2 | 1 | 2 | 2 | 2 | 2 | 2 | 4 | 1 | 2 | 5 | 5 | 3 | 5 | 3 | 5 | 4.5 | 2 | 1 | 3 | 3 | 2.9 |
| Mech Hangar | 2.5 | 3.5 | 2.5 | 3.5 | 3.5 | 3.5 | 2 | 3 | 2.5 | 5 | 5 | 5 | 4 | 1.5 | 1 | 3 | 3.5 | 3.5 | 3.5 | 3 | 1.5 | 5 | 4.5 | 4.5 | 3 | 5 | 2.5 | 2 | 4 | 2 | 1.5 | 2 | 3.5 | 3.2 |
| Vault Breakers | 2 | 2 | 1 | 2 | 1 | 2 | 1 | 2 | 0 | 4 | 4 | 5 | 1 | 1 | 0 | 3 | 1 | 4 | 4 | 3 | 1 | 3 | 5 | 5 | 4 | 5.5 | 6 | 3 | 4.5 | 1 | 3 | 7 | 2.5 | 2.8 |
| Rooftop Buckets | 3 | 3 | 2 | 3 | 3 | 5 | 2 | 4 | 2 | 4 | 5 | 5 | 4 | 4 | 3 | 3 | 5 | 4 | 4 | 4 | 2 | 6 | 6 | 5 | 3.5 | 5 | 6 | 2.5 | 4.5 | 3 | 3 | 3 | 4 | 3.8 |
| Gallery Shift | 4 | 3 | 2 | 3 | 2 | 4 | 2 | 3 | 1 | 4 | 5 | 5 | 4 | 2 | 1 | 3 | 2 | 4 | 3 | 4 | 1 | 4 | 4 | 5 | 2.5 | 4 | 3.5 | 2.5 | 3.5 | 2 | 2 | 2 | 3 | 3.0 |
| Deep Recovery | 2.5 | 2.5 | 1 | 2 | 1.5 | 2.5 | 1 | 2.5 | 1 | 3 | 4 | 5 | 3 | 3.5 | 3 | 2 | 1.5 | 2.5 | 2 | 2 | 1.5 | 3 | 6 | 6 | 1.5 | 3.5 | 2 | 2 | 3 | 3 | 3 | 0.5 | 2.5 | 2.6 |
| Patrol Wing | 2 | 4 | 3 | 4 | 3 | 3 | 2 | 3 | 1 | 4 | 5 | 5 | 3 | 2 | 2 | 4 | 6 | 3 | 2 | 1 | 1 | 3 | 6 | 6 | 3 | 4 | 2 | 3 | 4 | 3 | 3 | 5 | 3 | 3.3 |
| Bank Shot | 2 | 3 | 2 | 3 | 3 | 3 | 2 | 2 | 2 | 4 | 4 | 5 | 2 | 1 | 0 | 2 | 1 | 3 | 3 | 3 | 1 | 5 | 5 | 5 | 3 | 5 | 4.5 | 3 | 5 | 2 | 2 | 4 | 3 | 3.0 |
| Orbital Defense | 1 | 1 | 0.5 | 1.5 | 1 | 1.5 | 0 | 1.5 | 0 | 2.5 | 3.5 | 4 | 0.5 | 0.5 | 0 | 1 | 1 | 2 | 2 | 1 | 0 | 4 | 4 | 5 | 1 | 3.5 | 1.5 | 0 | 3 | 0.5 | 1 | 7 | 1.5 | 1.8 |
| **Mean** | **2.7** | **3.1** | **2.3** | **3.0** | **2.5** | **3.2** | **1.6** | **2.8** | **1.5** | **3.8** | **4.5** | **4.9** | **2.9** | **2.2** | **1.4** | **2.7** | **2.8** | **3.2** | **3.1** | **2.7** | **1.4** | **4.1** | **5.2** | **5.5** | **3.2** | **4.7** | **3.8** | **2.7** | **4.1** | **2.2** | **2.5** | **3.4** | **3.0** | **3.1** |

Desktop 1920x1080 fps on the runner, from report.slim.json:
- 0.5: Deep Recovery
- 6.4 to 7.6: Gravity Post 6.4, Siege Golf 7.1, Courier Rush 7.1, Rooftop Buckets 7.6
- 9.3 to 11.4: Mech Hangar 9.3, Blockfall Reactor 9.8, Gallery Shift 10.1, Aura Clash Arena 11.1, Skyline Runner 11.4
- 14.9 to 25.8: Bank Shot 14.9, Patrol Wing 15.8, Turbo Drift Circuit 19.7, Pulse Tunnel 23.5, Neon Swarm 25.8
- 52 to 60: Aurora Lander 52.2, Vault Breakers 57.4, Orbital Defense 59.6

The engine's own fps telemetry reports 60 in every slow game (research/20). The engine defects cited below are shorthand for findings in research/19:
- **ambient-kills-IBL:** `lights.ambient` with no `environments.*` node zeroes IBL diffuse and specular (`packages/engine/src/agent-api/index.ts:12693-12707`, zeros at :12705). It hits 15 of 18 games. Aura Clash avoids it through its own bridge path. Siege Golf and Turbo Drift author `environments.studio`, but that is a 128x64 LDR probe (C10).
- **exposure-dropped:** root tone mapping is fixed to ACES at exposure 1 (`index.ts:12898-12904`), and `colorGrade.exposure` is discarded in 16 games (C12).
- **DPR-1:** the default safe-basic profile sets `pixelRatio: 1` (`index.ts:4256`), and that value wins over devicePixelRatio. This affects about 13-14 games (C2).
- **tint-wipe:** `model(asset, {material:{color}})` hard-codes `replaceSurfaceTextures: true` (`index.ts:13570`), which disables albedo and metal-roughness maps (C3).
- **effects-zero-px:** particles, rain, snow, flipbook and beam are non-pixel-backed on the production bridge (`index.ts:13723`). No game wires `game.effects().nodes()`, and there is only alpha-over blending (C8).
- **shadow-0.32:** root shadow strength is `0.32` (`index.ts:12966-12968`). The depth pass ignores skinning, instancing and alpha (DepthPass.ts:59-87), and the root path never runs CSM (C4, C5, C11).
- **no-sky:** the root path never draws an environment background, only a solid clear colour (C9).
- **bloom-knee:** softKnee 0.5 with a ×7 balanced gain blooms mid-tones, and the threshold is clamped to ≤1 (C13).
- **fake-AA/AO:** "FXAA" is a 4-tap cross blur stacked on 4x MSAA, and SSAO is about zero at gameplay depth (C14).

---

### 2. Per-game findings

The attribution lines below give two splits:
- **Code split** (research/20): engine / defaults / assets / game / authoring.
- **Vision split** (research/21): authoring / camera / defaults / assets / engine limits. A vision judge cannot see a silently disabled feature, so it books engine defaults as "authoring".

Verdict wording follows research/21; research/20's verdict is noted where it differs.

#### Aura Clash Arena (`aura-clash-showcase`) — overall 3, mean 3.5, 11.1 fps
- **What looks poor:**
  - The fighters fill about 30% of the frame height, inside a canvas that covers about 43% of the viewport in a web dashboard.
  - Flat team tints erase the textures, the lighting is murky with no rim, and there is a sourceless floor hotspot.
  - There are no cast shadows, reflections, fog or impact VFX.
  - The "2 HIT" and "3 HIT" plates cover the impact point, and the dash ghosting reads as a glitch.
  - On mobile a third of the canvas is black and the controls are keyboard hints.
- **Why (engine):**
  - The side-view preset renders into rgba8 with the Reinhard fallback (C15). Max luma is about 200 and 0% of pixels clip.
  - The bloom threshold of 0.78 sits above that ceiling, so bloom never fires.
  - Skinned fighters cast bind-pose shadows, and shadow strength is 0.38.
  - Aura Clash does not hit ambient-kills-IBL, but it gets only a 128x64 LDR generated probe.
- **Why (game):**
  - Frontal point "flashlight" keys, MR maps replaced with flat values, and the arena scaled to 0.59 against 1.08 fighters.
  - The 128 declared particles are never read.
  - Saira is named in CSS but never loaded.
- **Attribution:** code split 30/23/11/24/12; vision split 35/25/20/12/8.
- **Assets:** good assets rendered badly. The 65-joint Quaternius rigs, the city GLB and the strongest animation in the fleet (score 6 in research/20) are undercut by the tint and the LDR pipe. The weak exceptions are a 4-tri crowd card and the stock clips.
- **Missing renderer capability:** HDR and ACES on the game preset, skinned shadow casters, and pixel-backed VFX. SSR, planar reflection and HDRI exist but are not wired.
- **Largest wins:**
  1. HDR target plus ACES on the preset, with exposure honoured.
  2. Remove the tints and use rim or fresnel for team identity.
  3. A full-bleed canvas with a side-on camera framing the fighters at 45-60% of frame height.
  4. One shadowed key with contact AO.
  5. Hit flash, sparks and hitstop wired to pixels.
- **Verdict:** substantial rebuild of the presentation layer. Research/20 said save-through-polish, because the rigs, animation and juice code are real.
- **Evidence:** `evidence/games/aura-clash-showcase-mid.jpg`, `-contact.jpg`.

#### Blockfall Reactor (`showcase-blockfall-reactor`) — overall 4, mean 3.7, 9.8 fps
- **What looks poor:**
  - A locked, dead-on camera makes it read as a 2D web Tetris.
  - The backdrop cabinets and mascot are flat image cards (the mascot sits on a magenta rectangle).
  - There are no shadows or AO, and the lower 25% of the frame is a dead navy void.
  - The mid and action frames are near-identical. One orange ring is the only VFX in the whole set.
  - A centre hotspot and a vertical streak read as debug artifacts.
- **Why:**
  - 3 of 4 models are 4-tri `KHR_materials_unlit` cards (C19). The cabinet mesh is hidden behind cards.
  - ambient-kills-IBL means the glossy blocks have nothing to reflect.
  - Bloom threshold 0.55 with softKnee 0.5 starts at linear luma 0.05.
  - AO is a no-op (C14).
  - Hidden performance costs: 200 hidden legacy boxes, about 80 text3D digits and 3 WebGL contexts.
- **Attribution:** code split 22/25/21/22/10; vision split 35/20/15/25/5.
- **Assets:** weak. The jelly-block shader is the best-scoring material in the fleet (5).
- **Missing renderer capability:** instanced shadow casters, working SSAO, real FXAA or SMAA, IBL when ambient is present, and pooled runtime FX.
- **Largest wins:**
  1. Tilt the camera 8-12°, add idle drift and punch on clears.
  2. Make the well a real bezel with contact shadows and a reflective floor.
  3. Replace the cards with lit 3D cabinets, or parallax layers with matched lighting.
  4. GPU particle bursts on lock and clear.
  5. Thin the gridlines and outline the ghost piece.
- **Verdict:** substantial rebuild of the presentation layer. Research/20 called it borderline polish.
- **Evidence:** `evidence/games/showcase-blockfall-reactor-mid.jpg`, `-contact.jpg`.

#### Skyline Runner (`showcase-skyline-runner`) — overall 4, mean 3.6, 11.4 fps
- **What looks poor:**
  - An illustration-grade painted backdrop sits behind flat-shaded primitive 3D, so the 3D reads as stickers.
  - A floating untextured tree slab sits top-centre.
  - Grey bars under the platforms look like visible collision volumes.
  - Olive coins on dark blue have almost no contrast, and the pickups clip to white.
  - There are no shadows, and no snow particles in a snow level.
  - Lives reads 0 while play continues.
- **Why:**
  - The hero is a 4-tri card. The 48k textured runner is tint-wiped and used only as the ghost, and an 80k Meshy hero is loaded but unused.
  - The route sets `pixelRatio` 0.7.
  - Guide-box overlays are on in public play, the world has `castShadow:false`, and five act light rigs plus `lights.studio` are mounted at once.
  - Engine causes: ambient-kills-IBL, exposure-dropped, and only the first fog node honoured (`index.ts:12743`).
- **Attribution:** code split 20/15/25/25/15; vision split 35/20/15/25/5.
- **Assets:** both weak and rendered badly. Good assets exist in the repo, but the route ships the card.
- **Authoring:** 51-92 `?capture=review` forks meant the art went into evidence frames, not the shipped frame.
- **Largest wins:**
  1. Delete the slab and the grey bars.
  2. Swap in the textured runner without the tint.
  3. Fog and a key light matched to the painted plate.
  4. ACES highlight rolloff and a raised bloom threshold.
  5. Snowfall and contact shadows.
  6. A landscape mobile layout at DPR ≥2.
- **Verdict:** substantial rebuild of the 3D layer. The art direction, backdrop and HUD can be kept.
- **Evidence:** `evidence/games/showcase-skyline-runner-mid.jpg`, `-contact.jpg`.

#### Turbo Drift Circuit (`showcase-turbo-drift-circuit`) — overall 3, mean 3.5, 19.7 fps
- **What looks poor:**
  - 50-65% of every frame is an untextured flat grey ground.
  - The track is stacked paper-cut slabs, and one slab floats.
  - Trees are sphere-on-stick, and the gantry and stands are boxes.
  - A translucent tan drift ellipse reads as a debug gizmo, and skid marks are discs.
  - A milky haze sits over the scene, with clipped highlights and over-wide bloom.
  - The car is faceted. The "GGhost OFF" label is a text bug.
- **Why:**
  - The track GLB has 0 textures and 28 flat materials. The hero car (5.4k tris, base colour only) is worse than the opponent (31k).
  - The indoor studio IBL is applied to an outdoor scene, the clear colour is flat #df967d, and fog is 0.0027.
  - The single uncascaded shadow map is fitted to a 500-unit ground, so the car's shadow is sub-texel. The shadow pass also ignores the 43 instanced scenery calls.
  - `driftParticleCloud` draws zero pixels (effects-zero-px).
- **Attribution:** code split 25/15/30/19/11; vision split 30/15/15/30/10.
- **Assets:** weak.
- **Missing renderer capability:** CSM on the root path, instanced shadows, HDR bloom, and a `ProceduralTexture` rasteriser (those maps are silently dropped). The game's 92 capture-mode branches are also a factor.
- **Largest wins:**
  1. A spline-extruded road with tiling PBR asphalt and a rubbered racing line.
  2. A sunset HDRI used for both sky and IBL, plus cascaded shadows.
  3. Clearcoat car paint with smooth normals.
  4. Ribbon skids and smoke drawn as real pixels.
  5. Instanced trackside barriers and fencing.
- **Verdict:** substantial rebuild.
- **Evidence:** `evidence/games/showcase-turbo-drift-circuit-mid.jpg`, `-contact.jpg`.

#### Siege Golf (`showcase-siege-golf`) — overall 3.5, mean 3.7, 7.1 fps (p95 1,100 ms)
- **What looks poor:**
  - The world reads as greybox: a castle made of identical cubes, box and ellipsoid trees, squashed-sphere hills, and an infinite green plane.
  - A giant blue ellipsoid sits unexplained behind the goal.
  - The textured crates clash with the flat colour around them.
  - The goal, obstacles and signs all share coral, so the colour hierarchy fails.
  - A debug slider panel ships, and the mobile 3D view is blurred under the modal.
  - It has the best shadows in the fleet (4.5), because a directional sun plus an environment node is present.
- **Why:**
  - Assets: about 130 primitives plus a course GLB with no UVs and flat normals.
  - tint-wipe deletes the crate and plank PBR maps.
  - The LDR peach studio probe is used outdoors, exposure is dropped, and FXAA runs over MSAA.
  - `app.setScene` rebuilds the scene on every camera phase, which causes the 1.1 s P95 stalls and hard cuts.
- **Attribution:** code split 13.5/17.5/25/29/15; vision split 25/15/20/35/5.
- **Assets:** weak, plus game code that makes the good crates look bad.
- **Capture:** the 1920 frames 03-mid, 04-action and 05-charge are identical (luma 154.3, 594 colours). That is a genuine stall or duplicate, not missing VFX alone.
- **Largest wins:**
  1. A cohesive stylized asset kit with a shared trim atlas.
  2. HDRI sky and IBL with a warm low sun.
  3. Terrain heightfield, backdrop and fog.
  4. One reserved hue for the goal.
  5. Replace the debug panel with an in-world aim arrow.
  6. Stop rebuilding the scene per camera phase.
- **Verdict:** substantial rebuild of art and scene. The physics (6) and controls can be kept.
- **Evidence:** `evidence/games/showcase-siege-golf-mid.jpg`, `-contact.jpg`.

#### Aurora Lander (`showcase-aurora-lander`) — overall 2.5, mean 3.1, 52.2 fps
- **What looks poor:**
  - 85-95% of every frame is flat navy, and the terrain is missing in 3 of 4 captures.
  - The game is called "Aurora" and has no aurora, sky gradient or horizon.
  - The lander is about 4% of the frame, in teal plastic.
  - The exhaust is a static capsule mesh offset from the nozzle.
  - Clipped white sits next to murky mid-blue, and one haloed "star" looks like a debug dot.
  - A "PROTOTYPE" sidebar ships.
- **Why:**
  - no-sky.
  - ambient-kills-IBL.
  - Additive or transparent emissive does not composite (alpha-over only), which forced opaque aurora boxes.
  - The tint path drops opacity, so the ghost is opaque.
  - Shadows at strength 0.32 with nearest compare and a whole-scene fit are effectively invisible.
  - There is no particle path.
  - DPR-1.
  - Agents nudged emissive and background values to hit mean-luma targets (`main.ts:594-597`).
- **Attribution:** code split 28/15/20/25/12; vision split 40/25/10/20/5.
- **Assets:** weak. The 460-tri flat probe, 66-tri beacons and the 4-tri card lander hero have no textures or normal maps (C19).
- **Missing renderer capability:** sky and atmosphere, additive blending, GPU particles, usable shadows.
- **Largest wins:**
  1. An altitude-adaptive camera that keeps the pad in frame.
  2. A sky gradient plus shader aurora ribbons.
  3. Full-width layered terrain with haze.
  4. A shadowed key light and the exhaust as a point light.
  5. A tapered cone with a particle plume and dust.
- **Verdict:** substantial rebuild. Polish caps it at about 4.
- **Evidence:** `evidence/games/showcase-aurora-lander-mid.jpg`, `-contact.jpg`.
- **Capture:** the landing condition was never hit, so 04-action shows no action.

#### Neon Swarm (`showcase-neon-swarm`) — overall 2.5, mean 3.1, 25.8 fps
- **What looks poor:**
  - Pure-black ellipses dominate every frame and read as rendering errors.
  - Enemies are tiny, flat, non-emissive pale hexagons.
  - The hero prop is an off-theme photoscanned road barricade.
  - The floor is a void with no grid or gloss.
  - The player is dark-on-dark with a static pose.
  - About half the frame is crushed black (dark fraction 0.40-0.60).
  - Score rises with nothing visible happening.
- **Why:**
  - ambient-kills-IBL, with ambient about π×.
  - The depth pass ignores instancing, so the swarm casts no shadows.
  - Raw-depth SSAO is about zero.
  - tint-wipe strips the courier's textures.
  - cameraDirector, cameraPunch and 7 effect spawns are wired to nothing (effects-zero-px).
  - The visual gate is `minimumNonBlackPixels: 1500`.
- **Attribution:** code split 26/16/23/25/10; vision split 35/15/12/30/8.
- **Assets:** weak. The enemies are programmatic discs, half the assets are 4-tri cards, and the default avatar is an untextured waived asset (C19).
- **Missing renderer capability:** runtime FX spawning or pooling, instanced shadows, HDR bloom, IBL alongside ambient.
- **Largest wins:**
  1. A glossy floor with SSR and an emissive grid.
  2. Emissive hostile drones with soft contact shadows instead of black blobs.
  3. On-theme barriers.
  4. A rim-lit, animated player.
  5. Hit particles and hitstop.
- **Verdict:** substantial rebuild.
- **Evidence:** `evidence/games/showcase-neon-swarm-mid.jpg`, `-contact.jpg`.
- **Capture:** the kill condition was never hit at 1920 or 1280.

#### Gravity Post (`showcase-gravity-post`) — overall 3, mean 2.7, 6.4 fps
- **What looks poor:**
  - The sun is a flat sprite that lights nothing, and two planets (Rust, Gale) render pure black.
  - Overlapping translucent cyan rings flatten into a teal mass.
  - Asset styles clash: photo cardboard, a photoreal Earth, a voxel truck and particle-noise stations.
  - The ship plus box is about 3× a planet's diameter and occludes the stations.
  - The backdrop is a flat teal board. There is no post or VFX (post score 1).
  - The box detaches from the ship.
- **Why:**
  - ambient-kills-IBL and no-sky.
  - About 330 un-instanced primitives give 1,200+ draws, which explains the 6 fps.
  - The HUD rebuilds innerHTML every frame.
  - tint-wipe wipes the one good asset (the dock gate, C3).
  - Spheres are tessellated at 16x12.
  - Keyboard launch is dead (controls 3).
- **Attribution:** code split 15/20/27/23/15; vision split 40/12/15/30/3.
- **Assets:** weak. The hero and district are agent kitbash with 32x32 stripe textures.
- **Missing renderer capability:** GPU particles and ribbons, and automatic instancing of repeated primitives.
- **Largest wins:**
  1. A point light at the sun with a lit standard material, so the planets get terminators.
  2. A deep-space skybox with parallax stars.
  3. Thin additive orbit lines.
  4. One art language, rescaled.
  5. Instancing to fix the fps.
- **Verdict:** substantial rebuild of the visual layer.
- **Evidence:** `evidence/games/showcase-gravity-post-mid.jpg`, `-contact.jpg`.

#### Courier Rush (`showcase-courier-rush`) — overall 2, mean 2.8, 7.1 fps (1920), 5.0 (1280), 8.1 (mobile)
- **What looks poor:**
  - The one working desktop frame shows untextured navy box buildings.
  - A bloom-blown centreline splits the frame, and the hero van is clipped to a white blob.
  - There are no shadows, no reflections on a "wet" night street, no fog and no sky.
  - On mobile the HUD covers 35-40% of the screen.
- **Black frames (1920 run):** `03-mid` and `04-action` are black. Report data: meanLuma 1.7, darkFraction 0.968, 158 colours, byte-identical, timer frozen at 57.5. The page error is `RenderDeviceError: Render context is lost` at `assertAlive`/`setRenderTarget`.
- **Is that a real defect?** It is a real production robustness defect, not a capture-script artifact:
  - The engine has no `webglcontextlost` restore path, so a lost context stays black permanently with no recovery UI.
  - The trigger was environmental: a paravirtual GPU, 7 GB of memory, about 1,530 draw calls and 30 MB of resources.
  - The same build rendered in the 1280 and mobile runs, so the black screen is not deterministic on all hardware.
  - The harness reported `blankShots: []` and `likelyBlank: false` because the HUD still draws. The blank detector is blind to a black world under a live DOM HUD.
  - The vision overall of 2 is pulled down by these frames; the working frame alone scores about 3.5.
- **Why:**
  - ambient-kills-IBL zeroes the authored wet asphalt and clearcoat (IBL 0 in research/20).
  - exposure-dropped, plus neonBloom at threshold 0.68 with ×7 gain.
  - Group scale is composed incorrectly (C6), which collapses the scale-6 `city.block` kit.
  - tint-wipe on the traffic cars.
  - Rain is 30 static boxes, and the engine and ambience audio loops are never played (audio 1.5).
- **Attribution:** code split 30/20/20/20/10; vision split 35/12/20/8/25 (engine limits weighted up for the context loss).
- **Assets:** the van is good but rendered badly; the city is weak.
- **Largest wins:**
  1. Context-loss restore, plus a harness check that the canvas region is not uniformly black.
  2. Real IBL plus SSR on the road.
  3. A textured modular city kit.
  4. Batch about 1,500 draws down to a few hundred.
  5. An HDR bloom threshold above 1.
- **Verdict:** substantial rebuild.
- **Evidence:** `evidence/games/showcase-courier-rush-mid.jpg`, `-contact.jpg`. The mid shot is a black frame.

#### Pulse Tunnel (`showcase-pulse-tunnel`) — overall 3, mean 2.9, 23.5 fps
- **What looks poor:**
  - The hero craft fills about 45% of the screen width at lane centre and blocks incoming obstacles.
  - The hero is a near-black glossy blob.
  - The "neon" is flat emissive boxes with no glow or spill, and there is no floor reflection.
  - The background is a void.
  - A full-height blue centre-column artifact runs through the sky and HUD.
  - Frames at 178 m and 1,488 m look identical.
  - The mobile canvas is 374x187 CSS (report.slim.json) on a 390x844 screen. This is a real layout defect, and mobile scores 1.
- **Why:**
  - High-metallic materials (0.72-0.92) under ambient-kills-IBL render black. The finale reactor arches were hidden because of this.
  - Good CC0 PBR kits were rejected because they were judged under the broken renderer.
  - The camera is a static literal.
  - Particles exist only in review mode, so players get about 10 tiny spheres.
  - The bloom threshold is clamped to ≤1.
- **Attribution:** code split 22/20/18/29/11; vision split 30/25/20/20/5.
- **Assets:** both weak (procedural kitbash with 128 px NEAREST textures) and rendered badly. Audio is the best in the fleet (5).
- **Largest wins:**
  1. A 100dvh canvas and anchored HUD on mobile.
  2. Raise and pull back the chase cam, so the hero is 15-20% of the width.
  3. HDR emissive above 1 with selective bloom.
  4. A planar or SSR floor with moving lights.
  5. A synthwave sky and fog, with the column artifact removed.
- **Verdict:** substantial rebuild of the presentation layer. Research/21 estimates about 6/10 is reachable without new engine features if IBL works.
- **Evidence:** `evidence/games/showcase-pulse-tunnel-mid.jpg`, `-contact.jpg`.

#### Mech Hangar (`showcase-mech-hangar`) — overall 3.5, mean 3.2, 9.3 fps
- **What looks poor:**
  - Untextured cube clusters intersect a good mech model and make it look worse.
  - An "Asset passport" provenance panel ships to players.
  - The hangar is a floor plane in a void, and the arena is a flat blue wall.
  - There are no shadows or AO, so the mechs float on blob discs.
  - The metal reflects nothing.
  - The action frame has no projectiles, hits or shake.
  - The emissive strips are blown out.
  - The mobile FOV crops the fighters (mobile 1.5).
- **Why:**
  - The mech parts are scripted GLBs: 144-608 tris, with no UVs, textures or skeleton. Their suitabilityReason uses the waiver phrase "intentionally untextured stylized flat-color" (C19).
  - The hero is an unrigged scan loaded twice at 27 MB each.
  - Both sets share one scene and 12 lights, so everything is double-lit.
  - Animation is yaw-only.
  - ambient-kills-IBL.
  - A forced 1.5x DPR plus about 190 unbatched draws.
- **Attribution:** code split 16/12/35/26/11; vision split 35/15/15/30/5.
- **Assets:** weak.
- **Largest wins:**
  1. Authored socketed parts, or material swaps on the base mech.
  2. Shadowed key, contact shadows, HDRI and SSR.
  3. Dressed sets.
  4. Muzzle, tracer and impact VFX with hitstop.
  5. A fighting camera that frames both mechs.
  6. Delete the asset passport.
- **Verdict:** substantial rebuild.
- **Evidence:** `evidence/games/showcase-mech-hangar-mid.jpg`, `-contact.jpg`.

#### Vault Breakers (`showcase-vault-breakers`) — overall 2.5, mean 2.8, 57.4 fps
- **What looks poor:**
  - The ball is never clearly visible: it is a dark, tinted disc about 40x28 px.
  - Every part is a raw primitive.
  - The "neon" doesn't glow (post 1).
  - The playfield is one untextured grey plane, about 60% of the 3D frame.
  - IBL is 0 and particles are 0, and score changes produce no in-world reaction.
  - Under 1% of pixels change between frames.
  - On mobile the prompt says "HOLD SPACE" on a touch device.
- **Why:**
  - Every rendered GLB is a 0-UV synth. The shipped Sketchfab cabinet (12 PBR maps) and the Higan cabinet are typed and hashed but never referenced.
  - Code comments falsely claim "textured".
  - ambient-kills-IBL turns the metallic 0.96 chrome ball matte.
  - Three coloured directional lights wash the table.
  - A single torus is the only VFX, and particles are not wired on the production bridge.
- **Attribution:** code split 13.5/17.5/26.5/27.5/15; vision split 40/10/15/30/5.
- **Assets:** weak as used. Better assets exist in-repo but go unused.
- **Performance:** 7, the best in the fleet, but only because the scene is cheap.
- **Largest wins:**
  1. A chrome ball under an HDRI, with a contact shadow and trail.
  2. Emissive neon with selective bloom and lamp inserts.
  3. An authored playfield texture under clearcoat.
  4. A tight-frustum shadow plus AO.
  5. Use the textured cabinet.
- **Verdict:** substantial rebuild of the whole visual layer.
- **Evidence:** `evidence/games/showcase-vault-breakers-mid.jpg`, `-contact.jpg`.

#### Rooftop Buckets (`showcase-rooftop-buckets`) — overall 4, mean 3.8 (highest), 7.6 fps
- **What looks poor:**
  - The crowd is cube torsos topped with brown faceted icospheres, filling about 35% of the frame.
  - Brown lumps sit on every bleacher tread.
  - There is no rooftop and no dusk: it is an enclosed black box.
  - The backboard is a full-white emissive quad, so the hoop is a clipped blob.
  - There are no floor reflections, shadows or AO.
  - The arc VFX is a solid tube drawn over the player, and a ghosted player appears in the action frame.
  - "07DUSK" has a kerning collision.
- **Why:**
  - The backboard is 12 tris, the venue 1,280 tris, and the court is untextured.
  - The good 191-joint textured players exist but mount only under `?debug=animation`.
  - `setMaterial` overwrites GLB materials every frame.
  - Ambient 1.32 with ambient-kills-IBL, and 11 lights with no shadowed key.
  - neonBloom softKnee blooms mid-tones.
  - The depth pass ignores skinning.
- **Attribution:** code split, using research/20's buckets: engine capability 13 / defaults 16 / assets 21 / game code 34 / authoring 15. Vision split 40/12/15/30/3.
- **Assets:** weak, and the good ones are hidden.
- **Largest wins:**
  1. Silhouette crowd cards or instanced people, and open the far wall to a dusk skyline.
  2. A reflective court.
  3. A glass backboard with a real hoop.
  4. Shadowed key plus rim light.
  5. Bloom threshold above 1 and a tapered arc ribbon.
  6. An over-the-shoulder camera with make or miss reactions.
- **Verdict:** substantial rebuild of the art layer.
- **Evidence:** `evidence/games/showcase-rooftop-buckets-mid.jpg`, `-contact.jpg`.
- **Capture:** the make condition was never hit.

#### Gallery Shift (`showcase-gallery-shift`) — overall 3, mean 3.0, 10.1 fps
- **What looks poor:**
  - Axis-aligned box architecture with no texture or art, in a "private gallery".
  - No floor reflections or shadows.
  - The HUD says "AVOID THE CONES", but no cones render. A stray blue trapezoid outside the building is probably a mis-parented cone mesh.
  - The voxel player, white mech guard and gold barrel guard look like three different games.
  - The "TREASUR'" text is clipped.
  - Characters are under 1% of the screen, and about 25% of the viewport is an empty plinth plus black void.
  - Rapier/LOS debug telemetry ships.
- **Why:**
  - The thief and guard-2 are bound with `AnimationController({clipRegistry})`. Each frame produces an empty pose, so the renderer applies `applyRetargetedPose(emptyPose)` and the characters freeze (C16, `index.ts:13871`). Gallery Shift is the only showcase game that hits this.
  - ambient-kills-IBL, with ambient 1.56 at about π×.
  - The 16-light cap silently drops part of the 31-light rig.
  - The thief has no yaw (a one-line bug).
  - A separate `?capture=review` composition was tuned instead of the shipped route.
- **Attribution:** code split 15/18/30/20/17; vision split 35/20/15/25/5.
- **Assets:** weak. The museum is an untextured Blender-script build, and the hero is a 72-tri unlit Kenney model.
- **Missing renderer capability:** skinned shadows, multiple shadow casters, true rect area lights, configurable point-light range.
- **Largest wins:**
  1. Visible, correctly parented vision cones.
  2. A glossy textured floor with env map and SSR.
  3. Shadow-casting spots and flashlights.
  4. Tighter camera framing.
  5. One art style.
- **Verdict:** substantial rebuild.
- **Evidence:** `evidence/games/showcase-gallery-shift-mid.jpg`, `-contact.jpg`.

#### Deep Recovery (`showcase-deep-recovery`) — overall 2.5, mean 2.6, 0.5 fps (1920), 1.1 (1280), 3.6 (mobile)
- **What looks poor:**
  - Translucent teal cylinders, slabs and discs float in a black void.
  - There is no seabed, reef or water volume.
  - Emissive caps clip to white and bloom into blobs.
  - The diagonal cyan streaks read as projectiles.
  - "Shallow Reef, 4.8 m" looks abyssal.
  - The player sub is unidentifiable.
  - There is a smeared, label-like sprite in the ring VFX.
- **Performance:** the fps collapse is real and scales with pixel count: p50 frame time is 1,917 ms at 1920, 850 ms at 1280 and 282 ms on mobile. research/20 names the prime suspect as `volumetricFog`, which does a per-frame CPU 8-bit readback. This is the worst production defect in the fleet after Courier Rush's context loss.
- **Why:**
  - The meshes come from agent-generated `build-models.mjs`: 232-2,068 tris, per-face normals, no UVs, registered as "release".
  - tint-wipe on the sub's livery.
  - Emissive is used everywhere in place of lighting.
  - ambient-kills-IBL.
  - Camera smoothing is 0 for harness determinism.
- **Attribution:** code split 20/14/26/25/15; vision split 40/15/15/25/5.
- **Assets:** weak.
- **Missing renderer capability:** a GPU underwater stack (absorption fog, projected caustics, god rays, GPU particles).
- **Largest wins:**
  1. Fix the fog cost.
  2. Turquoise-to-deep depth-keyed fog, god rays and marine snow.
  3. Authored opaque PBR seabed, wreck and sub.
  4. Cut emissive 3-5×.
  5. A chase cam at a 15-25° pitch.
- **Verdict:** substantial rebuild. One research/20 judge said full rebuild.
- **Evidence:** `evidence/games/showcase-deep-recovery-mid.jpg`, `-contact.jpg`.

#### Patrol Wing (`showcase-patrol-wing`) — overall 3, mean 3.3, 15.8 fps (1920) vs 54.8 (1280)
- **What looks poor:**
  - The sky is a flat clear colour with nothing that reads as "evening".
  - Once airborne the camera sees no world, and there is no ocean.
  - The terrain is faceted untextured green, and the runway slab floats with a black underside.
  - There are no shadows.
  - The canopy and paint have nothing to reflect.
  - A blown white square sits inside the ring gate.
  - Debug text ships: "Backend rapier / Flight mode authored".
- **Why:**
  - ambient-kills-IBL means the good hero GLB's metal and roughness channels have nothing to work with.
  - The game never uses `environments.hdri`, `sky.dayNight` or the engine water surface.
  - The sun disc is misaligned with the key light.
  - FOV 47 with no horizon hold.
  - Transform-only flight with no stall model, so the plane hovers at 0 airspeed.
  - The 1080p vs 720p fps gap at under 230 draws points to fill or post cost.
- **Attribution:** code split 18/22/17/33/10; vision split 45/25/15/12/3.
- **Assets:** the hero is good but rendered badly; the drones (108-tri) and props are weak.
- **Capture:** the autopilot let throttle decay to 0, so no rings or drones appear in 03-05. That is partly capture choreography, but the gameplay objects that do appear are unreadable.
- **Largest wins:**
  1. A sunset HDRI as both sky and IBL.
  2. Ocean to the horizon with fog.
  3. Splat-textured terrain with an embedded runway.
  4. Fitted sun shadows.
  5. A chase cam with look-ahead.
  6. Torus ring gates and contrails.
- **Verdict:** substantial rebuild of environment, lighting and camera.
- **Evidence:** `evidence/games/showcase-patrol-wing-mid.jpg`, `-contact.jpg`.

#### Bank Shot (`showcase-bank-shot`) — overall 3, mean 3.0, 14.9 fps
- **What looks poor:**
  - The table floats in a near-black void, with about 40% of the frame empty.
  - There is no cue stick.
  - The felt is flat royal blue with no lamp pool, and the rails are orange plastic.
  - Cyan and magenta glints contradict the "one lamp" fiction.
  - There are no ball shadows or AO.
  - Balls have no numbers or stripes, so suits are unreadable.
  - The camera never moves, and the "…" placeholders and "Backend rapier, Bodies 34" debug text ship.
- **Why:**
  - ambient-kills-IBL, so the authored lacquer and clearcoat fail.
  - `shadowPriority` ranks the directional light above the spot, so the overhead lamp cannot cast.
  - The AO pass is about a no-op and `contactOcclusion` is diagnostics-only (C14).
  - DPR-1.
  - Ball rotation is never synced to the visuals.
  - Audio is oscillator-only.
- **Attribution:** code split 18/20/20/31/11; vision split 40/15/15/25/5.
- **Assets:** both weak (no UVs, a 170-tri faceted cue) and rendered badly.
- **Missing renderer capability:** point and spot shadow casters alongside a directional light, and ambient plus IBL together.
- **Largest wins:**
  1. One overhead spot with soft shadows and contact shadows.
  2. A dim bar HDRI with clearcoat balls and rails.
  3. Numbered and striped balls, a modeled cue with strike animation, and felt with sheen.
  4. A pool-hall room falling into darkness.
  5. A cue-follow camera.
- **Verdict:** substantial rebuild. Research/20 said save-through-polish, because the physics, rules and loading are fine.
- **Evidence:** `evidence/games/showcase-bank-shot-mid.jpg`, `-contact.jpg`.

#### Orbital Defense (`showcase-orbital-defense`) — overall 1.5, mean 1.8 (lowest), 59.6 fps
- **What looks poor:**
  - Primitives are the final art: the planet is visibly polygonal at 1080p, with pastel flat fills.
  - There is no sun direction, terminator, or planet-ring shadow.
  - The background is a pure clear-colour void.
  - VFX 0.5, particles 0, atmosphere 0, and audio 0.
  - About 80% of the pixels are black or UI.
  - Debug and marketing text ships ("one mounted Aura app", "Checksum: 3486416317").
  - Drones render under the HUD panels.
- **Why:**
  - 0 GLBs, 0 textures, 0 VFX sheets.
  - An opaque emissive shell at 1.13× deletes the only lit surface.
  - ambient-kills-IBL.
  - DPR-1.
  - Bloom drops `color`.
  - A false "particle-heavy" claim in the claim text.
- **Attribution:** code split 5/20/32/25/18; vision split 25/15/20/35/5.
- **Assets:** weak. No rendering fix makes a pink sphere read as a drone.
- **Performance:** 7, an artifact of an empty scene.
- **Largest wins:**
  1. An HDR starfield skybox reused as IBL.
  2. A textured, tessellated planet with a fresnel atmosphere and a sun terminator.
  3. A modeled turret and drones.
  4. HDR emissive, bloom, trails and explosions.
  5. A tilted camera filling about 70% of the frame height.
- **Verdict:** full rebuild of the visual layer. The wave, heat and shield logic is kept.
- **Evidence:** `evidence/games/showcase-orbital-defense-mid.jpg`, `-contact.jpg`.

---

### 3. Aggregate observations

1. **No game is competitive.** The best overall visual score is 4/10 (Blockfall Reactor, Skyline Runner, Rooftop Buckets), and the fleet mean is 3.0. research/21 answers "competitive with a well-built modern three.js browser game?" with **No** for all 18. Per-game composite means range from 1.8 (Orbital Defense) to 3.8 (Rooftop Buckets).

2. **The lowest categories match the engine-default failures, in every genre.**
   - Particles 1.4, atmosphere 1.4, IBL 1.5, shadows 1.6, VFX 2.2, juice 2.2, textures 2.3, PBR 2.5.
   - These line up with effects-zero-px, no-sky, ambient-kills-IBL, shadow-0.32 plus the depth-pass gaps, and tint-wipe or untextured release assets.
   - The pattern is the same across fighting, puzzle, racing, golf, flight, pinball and pool. That uniformity points to a systemic cause, not 18 independent authoring failures.

3. **The highest categories are not 3D.** Typography 5.5, HUD 5.2, AA 4.9, controls 4.7 and colour 4.5 come from the DOM shell, input handling and MSAA. The parts that are working are the parts that don't go through the renderer's lighting path.

4. **The two attribution splits disagree, and both are right.**
   - Vision judges put engine rendering limits at 3-10% (25% only for Courier Rush), and authoring plus assets plus camera at about 75-85%.
   - Code judges put engine plus defaults at 25-53% (median about 37%).
   - The reconciliation: much of what looks like "nobody authored reflections, shadows or VFX" is authoring against defaults that silently throw the work away:
     - ambient-kills-IBL in 15 of 18 games
     - exposure dropped in 16
     - effect nodes producing zero pixels
     - shadow strength 0.32
     - DPR pinned at 1
     - tint wiping GLB maps
   - From a still frame, a feature that was silently discarded looks the same as one that was never authored. Pulse Tunnel is the clearest case: agents rejected good CC0 PBR kits because the renderer showed them as black.

5. **Assets are weak, and where good ones exist they go unused or are rendered badly.**
   - 71 of 131 release models have no textures, and 13 are 4-tri unlit cards. A regex on phrases like "stylized" or "flat-color" waives the texture gate (`packages/aura3d-cli/src/index.ts:3376-3382`, C19).
   - In at least 6 games better assets exist in-repo but are not used:
     - Aura Clash: rigs tinted.
     - Skyline Runner: textured runner used only as the ghost, Meshy hero unused.
     - Vault Breakers: Sketchfab cabinet never referenced.
     - Rooftop Buckets: skinned players only under `?debug`.
     - Courier Rush and Patrol Wing: hero assets with no IBL.
     - Pulse Tunnel: rejected kits.

6. **The shipped frame was never the frame being iterated on.**
   - Skyline Runner, Turbo Drift Circuit, Neon Swarm, Blockfall Reactor, Gallery Shift, Deep Recovery, Gravity Post and Courier Rush all maintain `?capture=review` forks (research/20). Skyline has 51-92 and Turbo 92.
   - Gates such as `minimumNonBlackPixels`, mean-luma targets and `likelyBlank` passed frames a human would reject. Courier Rush's black world scored `likelyBlank:false`.

7. **Performance is a real defect, not a runner artifact.**
   - 13 of 18 games run under 20 fps at 1920x1080, and 11 run under 15.
   - Orbital Defense and Vault Breakers hold about 60 fps on the same runner, so the runner is not the cap.
   - Causes are known per game: unbatched draws (Courier Rush about 1,530, Gravity Post 1,200+), per-camera-phase scene rebuilds (Siege Golf), and CPU fog readback (Deep Recovery, 0.5 fps).
   - The engine's fps telemetry self-reports 60 throughout, so nobody saw it.

8. **Production-defect inventory, separated from capture artifacts.**
   - Real defects:
     - Courier Rush: context loss with no restore.
     - Deep Recovery: fps collapse.
     - Pulse Tunnel: 374x187 mobile canvas.
     - Gallery Shift: frozen animation (C16) and missing vision cones.
     - Gravity Post: black planets and dead keyboard launch.
     - Skyline Runner: Lives-0 bug.
     - Turbo Drift Circuit: "GGhost" label.
     - Debug UI shipped to players in about 11 games.
   - Capture-choreography gaps, meaning "action" frames with no action:
     - Aurora Lander, Neon Swarm, Bank Shot and Rooftop Buckets: the trigger condition was never hit.
     - Patrol Wing: throttle decayed to 0.
     - Siege Golf: duplicate frames.
   - Even where choreography failed, C8 confirms the absent VFX are real: effect spawns produce no pixels.

9. **Mobile scores 2.5 on average.** DPR-1 renders a 390x844 buffer on 3x devices, about 1/9 of native pixels. On top of that, keyboard prompts appear on touch devices, desktop sidebars are simply stacked vertically, and the HUD covers 35-45% of the screen.

10. **Verdict distribution (research/21).**
    - 17 substantial rebuild, 1 full rebuild (Orbital Defense), 0 polish. Research/20's three "polish" calls (Aura Clash, Blockfall, Bank Shot) are overruled by the screenshots.
    - In every game the parts that survive are gameplay, physics (Siege Golf and Vault Breakers 6, Rooftop Buckets 6), controls and the HUD skeleton.
    - What gets rebuilt is the same list everywhere: lighting rig, IBL, sky, materials and textures, VFX, camera and environment. Engine defaults have to change first, or the rebuilt content will be silently discarded the same way.
