# Asset attribution (CC0)

Not from the original game. The runner model is the Aura3D catalog asset `auraClashPlayerRig`
(public/aura-assets/auraClashPlayerRig.3318d671.glb), derived from Quaternius "Modular Character Outfits - Fantasy"
(quaternius.itch.io/modular-character-outfits-fantasy): a 65-joint humanoid with Sprint, Jump, Crouch, Idle, Hit and Death clips.
License CC0-1.0. Used until the Meshy art pass below, then removed from the tree (`runner-rig.glb` is gone; the catalog id remains `auraClashPlayerRig`).

## Meshy-generated models (2026-10-23)

Not from the original game. Generated from original text prompts through the AuraOne Meshy account via Kiro Prism (no image input, no
reference to the original's characters or assets). Ownership and commercial-use terms are those of the account's Meshy plan at generation
time (recorded per asset in `provenance/<name>.rights.json`; Meshy task ids in `provenance/<name>.meta.json`). Not CC0.

| File | Role | Size | Triangles (verts) | Prompt (gist) |
| --- | --- | --- | --- | --- |
| `runner.glb` | Rigged hero, outfit atlas recoloured to teal and silver (see provenance/runner.recolor.json) (replaces the catalog `runner-rig.glb`) | 4.6 MB | 20,472 verts, 24 joints | young martial-arts hero, spiky dark hair, orange outfit, blue sash and wristbands |
| `gate.glb` | Check-in arch (`arch` entities) | 1.4 MB | 23,408 verts | horned stone gateway arch, carved ring emblem |
| `barrier.glb` | Barrier hazard | 1.2 MB | 22,740 verts | low stone barrier with glowing jade crystal posts |
| `ogre.glb` | Oni hazard | 1.3 MB | 21,457 verts | stylised horned ogre guardian with a club |
| `cart.glb` | Sweeper hazard | 2.0 MB | 39,250 verts | rustic wooden hand cart with a lantern |
| `feast.glb` | Feast pickup | 2.1 MB | 41,301 verts | platter of dumplings and fruit with a golden orb |
| `lantern.glb` | Roadside lanterns | 1.2 MB | 16,478 verts | stone lantern post with a glowing amber lantern |
| `island.glb` | Floating-island decor | 2.2 MB | 46,955 verts | small floating rock island with trees |

The runner's clips are Meshy rig clips merged into one GLB (`Run_Loop` basic running, `Idle_Loop` action 0, `Jump_Loop` 466 Regular_Jump,
`Slide_Loop` 516 slide_light, `Flight_Loop` 501 Leap_of_Faith, `Dive_Loop` 506 Dive_Down_and_Land, `Hit_React` 178 Hit_Reaction).
Every model was post-processed with meshopt-free dedup/weld/simplify and 1024 px textures (`/tmp/meshy/optimize.mjs` settings in PORTING-NOTES.md).
A `crystal` power-up model was generated (30 credits) but not used: the six power-up kinds need per-kind glow colours the model cannot take.
