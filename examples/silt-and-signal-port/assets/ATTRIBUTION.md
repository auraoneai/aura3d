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

The tree, rocks and hero GLBs were re-packed with `@gltf-transform/core` (`NodeIO` read, then write as GLB) so their palette textures are embedded; geometry, materials and the hero's 27 animation clips are unchanged. `models/Textures/` is gone for that reason.
