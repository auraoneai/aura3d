# Asset attribution (CC0)

All assets are CC0 and come from the Aura3D curated library (`aura.library.json`), not from the original game.

| File | Source | License |
| --- | --- | --- |
| models/tree.glb | Kenney Mini Forest Tree (kenney.nl) | CC0-1.0 |
| models/rocks.glb | Kenney Mini Forest Rocks (kenney.nl) | CC0-1.0 |
| models/house.glb | Kenney Small Building (kenney.nl) | CC0 |
| models/lamp.glb | Kenney Road Kit street lamp (kenney.nl) | CC0 |
| models/board.glb | Kenney Skateboard (kenney.nl) | CC0 |
| models/hero.glb | Aura3D animation-starter "Hero Character" (Kenney) | CC0-1.0 |
| textures/{grass,ground,paving,rock,bricks}_*.jpg | ambientCG Grass005, Ground112, PavingStones151, Rock064, Bricks075A, 1K JPG Color/NormalGL/Roughness (ambientcg.com) | CC0 |
| textures/plaster_*.jpg | ambientCG PaintedPlaster017, 1K JPG (library `acg-paintedplaster017`). Color is levelled to a mean of 243 with its variation scaled 4x (the source is a flat grey, mean 190, std 3, which would halve the wall tint); NormalGL and Roughness are resized to 512x256 | CC0 |

The tree, rocks and hero GLBs were re-packed with `@gltf-transform/core` (`NodeIO` read, then write as GLB) so their palette textures are embedded; geometry, materials and the hero's 27 animation clips are unchanged. `models/Textures/` is gone for that reason.


## Meshy-generated models (2026-10-23)

Generated through Kiro Prism from original text prompts (never from images of the original game). Rights basis: the AuraOne Meshy account plan terms at generation time (see `assets/provenance/<name>.rights.json`); not CC0, not exclusive. Optimised with meshopt-free dedup/weld/simplify and 1024 px textures; admitted with `aura3d assets import-meshy` + `validate --require-license` (`failures: []`).

| File | Prompt gist | Task ids (preview / refine) |
| --- | --- | --- |
| models/courier.glb | a young sky courier in a sand flight suit, A-pose (rigged: remesh 12k, rig, idle action 0, walk and run clips from the rig set) | 01a169d2-edc6-74b7-86b4-18ceedd672b1 / 01a169d3-9f05-7407-b658-4eeb7f49b538 |
| models/hoverboard.glb | sleek hover board, sand deck, copper trim, teal thruster strips | 01a169d4-b417-7770-a302-832d343aa0c1 / 01a169d5-5d7d-70fe-889b-4786f5a90459 |
| models/canyonrocks.glb | eroded red-sandstone canyon boulder cluster | 01a169d2-f0f5-7594-974a-1aa6210dc827 / 01a169d3-edd8-758a-b7d7-dde627124771 |
| models/pillar.glb | wind-carved sandstone pillar | 01a169ce-bca4-775a-8ea1-cd5da2ac4fda / 01a169cf-6d76-75e9-a750-b00673e0e6e8 |
| models/aqueduct.glb | ruined sandstone aqueduct, three arches | 01a169d6-174a-71b1-b5a0-d5d3d10a4f9a / 01a169d6-dbcb-74bb-b1b7-d71a669d246b |
| models/gatehouse.glb | sandstone gatehouse, two towers, wooden gate | 01a169d0-545f-77b5-956f-e338dbdd4136 / 01a169d1-9920-74ae-8b1d-9a44a618a8e1 |
| models/lantern.glb | iron post with bronze lantern | 01a169d4-f1e5-7203-80a7-45142d6ebadc / 01a169d5-6543-7645-856e-1a103744e53a |
| models/ringgate.glb | stone ring gate between two towers (used as the canyon gate landmark) | 01a169d0-54ea-73a8-98f1-840078db28f9 / 01a169d1-9a11-71b1-85ef-6cda4f95eac0 |
