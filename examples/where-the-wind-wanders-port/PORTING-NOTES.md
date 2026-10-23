# Where the Wind Wanders on Aura3D: porting notes

Source of truth: `tests/fixtures/crayon/where-the-wind-wanders/game-module.mjs` (see PROVENANCE.md there).
Reference: `evidence/crayon-capture/where-the-wind-wanders-reference.json` (2 sessions of the original on ACR).
Measured look: `evidence/look-specs/where-the-wind-wanders.json` and `.features.json`.

## What is ported exactly (simulation parity)

`sim.ts` reproduces the original's `ashore` mode:

| Original | Port |
| --- | --- |
| walking speed `3.2 * dt`, dt = clamp(frame gap, 0, 0.04) | `WALK_SPEED`, `MAX_DT` |
| walk direction from the camera's matrixWorld right vector, flattened | `cameraAxes(cam)` from the camera's x/z offset |
| camera look target eases to (x + 2, z - 3.5) with `1 - exp(-2.5 dt)`; camera position eases to target + (-1.4, 4.5, 20.5) with `1 - exp(-3 dt)` | `CAMERA_FOLLOW`, `TARGET_RATE`, `CAMERA_RATE`; the lag tilts the walking axes by up to ~0.1 rad, so it is part of the trajectory |
| `Bs` clamp: bounds, cliff line at z = -13 east of x = 12 with jetty gaps, 7 circle colliders | `clampWalkable` |
| `_e2` rails (world edge, cliff line, 3 structure arcs of 21 points) + 8 fence rails, resolved by a sub-stepped 4-pass wall slide, radius 0.38 | `buildStaticRails`, `buildFenceRails`, `slideAlongRails` |
| letter reach 2.65, bell reach 3.1, bell needs 3 letters | `nearbyInteraction`, `interact` |
| facing hysteresis (`dl`) and stride (distance / 2.2) | `nextFacing`, `stride` |
| hop: takeoff 0.1 s, air 11.2/13 s, landing 0.16 s | `advanceHop` |

Replaying the original's recorded key script (2,098 steps, three letters and the bell) through `sim.ts` matches the
original's trajectory with a worst difference of 7e-10 world units, below the original's own session-to-session
spread (1e-9). Virtual frames are 16.7 ms (the original's 60 fps throttle would otherwise skip frames). The art pass
changed no simulation file: `sim.ts` is byte-identical and the replay tests are unchanged.

## Rendering (art pass)

Everything is authored in code; no original art, audio or text is used. The look is matched to the numbers measured
from the original (look spec): warm key light from (-35, 60, 28), hemisphere sky `#e5f2cf` over ground `#395730`,
exp2 fog `#b8d0bd`, ACES tone mapping with exposure about 1.2, bloom and a grade. Every `material.custom` program shares
one lighting model (`shaders.ts` `COMMON`) and writes linear HDR; the engine's ACES output stage tone maps all of them
the same way.

| Piece | How it is drawn |
| --- | --- |
| Terrain | 0.8 m grid, 68k triangles, painted brush strokes and wild-flower speckle in the fragment shader, baked tree and building shadows in the vertex tint, a carved stream bed, beach and cliff edge, distant ridges |
| Foliage | one merged mesh of about 19k alpha-cut cards (two crossed per plant) in seven kinds: grass tuft, flower, fern, reed, flowering shrub, broad-leaf rosette, flower spike; wind sway per card from `sway`, `phase`, `kind` attributes; cards within a few metres of the lens or of the traveller dissolve with a dither so nothing hides the walker |
| Trees and buildings | merged into one `PROP` mesh (about 130k triangles): pines with jagged skirts, round trees from clustered noisy blobs, the old oak, a timber-framed cottage with ivy and flower boxes, a stone-and-timber windmill with gallery, stairs and cloth sails (the sails spin as their own node), fences, signs, rocks, the jetty with a lantern, the bell frame, the far shore and the isle with a lighthouse. Wood grain, plaster, roof tiles, leaves, bark, stone and cloth are procedural per-vertex `kind` patterns on metre uvs |
| Sky | dome that follows the camera: gradient, painted clouds, sun glow |
| Water | lake shader with shallow-to-deep colour, fresnel, glints and breathing foam lines along the shore; the stream is a ribbon with its own flow shader |
| Traveller | one skinned-in-the-vertex-shader mesh (limbs swing from a gait phase driven by the sim's stride, cloak flutters, hop tucks the legs and squashes), a contact shadow, and a companion wisp with a glow |
| Letters, bell, lanterns | glowing envelopes with halo and beam billboards, a swinging bell that glows once rung, lantern glows |
| Atmosphere | drifting pollen billboards (additive), bloom, colour grade, light vignette |

Draw calls: about 20 (terrain, sea, sky, foliage, stream, scenery, sails, bell, boat, traveller, shadow, wisp, glows).
Static asset weight: 0 bytes (no model, texture or audio files).

## Features added

- Title card with controls (Enter or the button; `?start=1` and `?manual=1` skip it), pause (Esc or P), journal (J) that
  keeps the text of each letter you find, story captions, sound toggle (M), on-screen pad and Hop/Act buttons on touch devices.
  All text is the port's own writing.
- Synthesised audio (Web Audio only): breathing wind, a shore wash that swells near the water, birds, grass footsteps,
  hop and landing, a letter chime per letter and an inharmonic bell ring. Starts on the first user gesture; off in `manual` mode.
- A presentation-only voyage epilogue: nine seconds after the bell rings a boat leaves the jetty for Stillwater Isle
  (camera follows, closing card, "Keep wandering" returns to the valley). It never touches the simulation.

## Not ported (gaps)

- The original's painted sprite art and hand-placed layout: foliage placement is the port's own seeded scatter, trees and
  props are procedural low-poly, and the picture is much simpler than the original's roughly 1.1 M triangle painted scene.
- Real reflections on the water, the bench, save slots (`wind-wanders-v2` local storage), the original's own journal wording,
  the island trail on Stillwater Isle (only the voyage to it is shown), and the `playtest` autopilot (it only runs on localhost).
- The stream is visual only: the simulation (and the original's recorded run) walks straight over it.
- Height (y) is visual only; the simulation is x/z, so the port's y differs from the original's carved terrain.

## Hooks

`window.__AURA_WIND__`: `state()`, `applyInput(keys, act)`, `stepFrames(n, keys)`, `runScript(segments)`, `reset()`,
`routeHealth()`, `frame()`, `pixels()`, plus capture helpers `teleport(x, z)` and `epilogue(seconds | null)`. `?manual=1` stops
the real-time loop so tests step the simulation themselves (the follow camera still eases per step).

## Engine note

A custom shader that declares an attribute it never reads (the GLSL compiler optimises it out) makes the renderer silently
skip the whole draw: `MaterialBinding.bind` compares `requiredAttributes` (every declared `in`) with the program's active
attributes. The traveller was invisible until the unused `sway`/`phase` attributes were dropped from its mesh and shader.
`toGeometryInput` in `meshkit.ts` now emits only the attributes a program reads.

## Meshy model pass (2026-10-23)

Ten Meshy-generated models (text prompts only, through Kiro Prism; prompts, ops, sizes and rights basis in `assets/ATTRIBUTION.md`, task ids in `assets/provenance/`) replace the procedural stand-ins: the traveller (rigged, Idle/Walk/Run merged from the rig's own clips, driven by the sim's walk/hop state), two cottages, 535 instanced pines, 127 instanced round trees, garden shrubs, two standing-stone landmarks, the bell frame, the three letters, the epilogue boat and the wisp. `models.ts` is the model layer (`model-assets.ts` is generated: same-origin pathnames + sha256, as the production bridge requires); `scenery.ts` records placements instead of building the replaced geometry (`buildScenery(seed, replace)`), and `buildWorld({ models: false })` restores the all-procedural scene. The simulation is untouched (54 unit tests, replay worst delta 7.0e-10, remote spec 2/2).

Kept procedural on purpose: the windmill (its animated sails), jetty (tied to the simulation's walkable gaps), terrain, foliage cards, water, sky. Generated but unused: jetty, windmill, post lantern. Trees are static (the procedural trees swayed in the wind).

Cost: 362 credits of the 800 cap (ledger tag `wind`), including the probe clips. Asset weight 15.7 MB (hero 3.97 MB, cottage 2.70 MB, the rest 0.8-1.7 MB each). Draw calls 30 (was about 23); triangles roughly 1.2 M, mostly the instanced trees. Software GL takes about 4.8 s per frame (was 2.7 s): not a GPU number.

Blind judge (model, not a human; seed 20261023, 4 states x 12 passes): the original is still picked 48/48. Structural distance to the original (4 frames), art-pass -> Meshy: luma JSD 0.060 -> 0.051, RGB JSD 0.554 -> 0.495, palette distance 0.113 -> 0.114, edge-density ratio 0.53 -> 0.75, luma mean delta 2.6 -> -3.6. Before/after sheets: `evidence/where-the-wind-wanders-port/compare-meshy-*.jpg` (frames `meshy-before/`, `meshy-after/`).

Remaining differences: the traveller is dark and realistic next to the painted scene, static trees, no painted texture detail on the new models, the wisp reads pink rather than violet, fewer hills.
