# Asset provenance — Splat Turf

- `GT-Walsheim-Bold.woff2`: GT Walsheim Bold, from the AuraOne licensed font library (HUD, popups, cards).
  Byte copy of the Chroma Roll example's `assets/GT-Walsheim-Bold.woff2` (sha256
  `d5ab0311ce5ef91c83710164c5674dda2796ebb703a7a6441f0d77c9b2779a1e`, 41492 bytes).

## Backdrop models (art pass, 2026-11-07)

Floating islands and balloons drifting past the causeway (`src/scenery.ts`). Byte copies of the Meshy toy-style
models already admitted for Chroma Roll (the splat-rush-port example), generated 2026-10-23 through the AuraOne Meshy
account via Kiro Prism from original text prompts (Meshy plan terms at generation time; not CC0, no exclusivity
claimed). Admitted here with `aura3d assets add --role backdrop --quality candidate`; rights evidence is the
matching `<name>.rights.json` / `.meta.json`, copied next to this file under `provenance/` from the Chroma Roll example's
`assets/provenance/`.

| File | Source | Rights evidence |
| --- | --- | --- |
| `islandTree.8857f4dc.glb` | Chroma Roll `assets/models/island-tree.glb` | `island-tree.rights.json` |
| `islandTower.a38933a2.glb` | Chroma Roll `assets/models/island-tower.glb` | `island-tower.rights.json` |
| `balloon.905a8cb9.glb` | Chroma Roll `assets/models/balloon.glb` | `balloon.rights.json` |
| `paintPotIsland.e942c632.glb` | Chroma Roll `assets/models/paint-pot-island.glb` | `paint-pot-island.rights.json` |
| `paletteIsland.bbbbb408.glb` | Chroma Roll route `public/aura-assets/chroma-palette-island.glb` | `chroma-palette-island.rights.json` |
| `easelIsland.6f6d5f35.glb` | Chroma Roll route `public/aura-assets/chroma-easel-island.glb` | `chroma-easel-island.rights.json` |

All other visuals are procedural (kit shaders + `src/meshes.ts`, `src/scenery.ts`, `src/art/haze.ts`); all audio is
synthesized by the engine audio kit. No external asset URLs.
