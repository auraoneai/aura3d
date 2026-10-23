# Asset attribution

The previous CC0 character rig (Aura3D catalog `auraClashPlayerRig`) was replaced by the generated characters below and is no longer shipped.


## Generated models (Meshy text-to-3D through Kiro Prism, 2026-10-23)

Text prompts only (no image input, no original-game names or art). Output terms are those of the AuraOne Meshy plan at generation time (`assets/provenance/*.rights.json`); no CC0 or exclusivity is claimed. Characters: text-to-3D preview + PBR refine, Meshy remesh, Meshy rigging (24-joint humanoid), then Meshy animation-library actions merged into one GLB per character under canonical clip names. Props: text-to-3D + PBR refine, Meshy remesh to a low triangle budget, 512 px textures. Task ids (not signed URLs) below.

| File | Prompt (own words) | Refine task | Remesh task | Rig task | Library action id -> clip | Size / triangles |
| --- | --- | --- | --- | --- | --- | --- |
| hero.glb | a lean young ninja hero, stylised game character, dark indigo jacket and trousers with an orange scarf and wrist wraps, plain blank metal forehead guard, cloth sandals, confident athletic build, A-pose, full body, clean hand-painted PBR textures | 01a169ce-c672-70ac-929d-a0bc7ba411fc | see ledger | n/a | basic running -> run, 0 -> idle, 13 -> jump, 524 -> slide, 96 -> punch, 239 -> sword, 178 -> hit, 189 -> death | 3.9 MB / 12393 |
| sage.glb | a ninja in a warm ochre and burnt-orange sage robe with dark red trim and a black sash, bold dark eye markings, short spiky hair, plain forehead guard, stylised game character, A-pose, full body, hand-painted PBR textures | 01a169d3-68bb-73ff-a768-ff3207bd0e0c | see ledger | n/a | basic running -> run, 0 -> idle, 13 -> jump, 524 -> slide, 96 -> punch, 239 -> sword, 178 -> hit, 189 -> death | 2.8 MB / 12352 |
| soldier.glb | a masked foot-soldier ninja enemy, slate-grey and charcoal tunic with a face cloth and light shoulder plates, wrapped legs, stylised game character, A-pose, full body, hand-painted PBR textures | 01a169d1-a013-74e2-a439-bcdf674ba4fe | see ledger | n/a | basic running -> run, 0 -> idle, 178 -> hit, 4 -> sword, 192 -> jab, 147 -> block | 1.9 MB / 10390 |
| brute.glb | a huge burly brute warrior boss, broad shoulders and thick arms, moss-green and iron-grey heavy armour with spiked shoulder plates and a horned helmet, stylised game character, A-pose, full body, hand-painted PBR textures | 01a169ce-c0f0-7318-85e1-02ea5f934d35 | see ledger | n/a | basic running -> run, 0 -> idle, 178 -> hit, 128 -> punch | 2.8 MB / 15608 |
| houseA.glb | a two-storey timber-framed village house with cream plaster walls, dark wooden beams, wooden shutters, a small chimney and a curved blue-grey clay tile gable roof, stylised hand-painted game asset, no base | 01a169e2-d7ba-7141-a868-e905b4582807 | see ledger | n/a | n/a | 0.9 MB / 3764 |
| houseB.glb | a narrow three-storey townhouse with warm sand plaster, dark timber bands, a small wooden balcony and a steep red-brown tiled roof, stylised hand-painted game asset, no base | 01a169e5-94b9-71b0-95d4-4587340d7b74 | see ledger | n/a | n/a | 1.0 MB / 3932 |
| tower.glb | a round stone watchtower with a conical dark slate tile roof, small arched windows and a wooden door, stylised hand-painted game asset, no base | 01a169e8-a858-76f9-aa78-2ca5a14316ab | see ledger | n/a | n/a | 0.9 MB / 3937 |
| gate.glb | a traditional wooden village gate with two thick pillars, a crossbeam and a curved tiled roof canopy, stylised hand-painted game asset, no base | 01a169eb-5172-76d0-a71e-88ee33b73f5c | see ledger | n/a | n/a | 1.0 MB / 3488 |
| pine.glb | a stylised pine tree with layered dark green boughs and a rough brown trunk, hand-painted game asset, no base | 01a169eb-4115-77e8-9107-ca5441a3bc27 | see ledger | n/a | n/a | 1.0 MB / 1588 |
| lantern.glb | a tall wooden lamp post with a hanging paper lantern glowing warm orange, stylised hand-painted game asset, no base | 01a169f4-66c6-7493-b466-536a5c6307d4 | see ledger | n/a | n/a | 0.7 MB / 1351 |
| oak.glb | a stylised broadleaf oak tree with a thick gnarled trunk and a rounded lush green canopy, hand-painted game asset, no base | 01a16a17-ee1b-70f7-8914-7b1b3f80dd9d | see ledger | n/a | n/a | 1.0 MB / 1372 |

Credits for this game come from `/tmp/meshy/ledger.jsonl` (game tag `ninja`); the unused `bridge` and an early duplicate soldier/sage/brute preview are recorded there too. Raw downloads and the un-optimised GLBs stay in the ignored `artifacts/meshy/` directory.

