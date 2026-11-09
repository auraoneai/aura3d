# Shape Shift Sprint: asset provenance

- `GT-Walsheim-Bold.woff2`: GT Walsheim Bold, from the AuraOne licensed font library (HUD, popups, cards).
  Byte copy of `examples/splat-rush-port/assets/GT-Walsheim-Bold.woff2`
  (sha256 `d5ab0311ce5ef91c83710164c5674dda2796ebb703a7a6441f0d77c9b2779a1e`, 41492 bytes).

## Backdrop models (Meshy-07 dressing, 2026-11-09)

Toy backdrop dressing drifting past the sky bridge (`src/scenery.ts` `MESHY_PIECES`, mounted in `src/world.ts`).
Generated 2026-11-09 through the AuraOne Meshy account via Kiro Prism from original text prompts (GU47 WP-36,
Meshy plan terms at generation time; not CC0, no exclusivity claimed). Decimated for the route (meshoptimizer
simplify, textures 512 px); rights evidence is the matching `provenance/<name>.rights.json` / `.meta.json`
(Meshy task record, signed download query strings stripped).

| File | Source row | Tris | Rights evidence |
| --- | --- | --- | --- |
| `toyCastleIsland.df8dcbc8.glb` | `shape-shift-sprint/sssFloatingIsland` | 18,776 | `toyCastleIsland.rights.json` |
| `toyBlockTower.7f6db496.glb` | `shape-shift-sprint/sssToyBlockTowerB` | 13,176 | `toyBlockTower.rights.json` |

All other geometry is procedural (`geometry.dynamic`, see `src/meshes.ts`, `src/scenery.ts`); no external asset URLs.