# Polarity Orbs: asset provenance

- `GT-Walsheim-Bold.woff2`: GT Walsheim Bold, from the AuraOne licensed font library (HUD, popups, cards).
  Byte copy of `examples/splat-rush-port/assets/GT-Walsheim-Bold.woff2`
  (sha256 `d5ab0311ce5ef91c83710164c5674dda2796ebb703a7a6441f0d77c9b2779a1e`, 41492 bytes).

## Backdrop models (Meshy-07, 2026-11-09)

Drifting backdrop pieces beyond the road edges (`src/backdrop.ts`). Generated 2026-11-09 through the AuraOne Meshy
account via Kiro Prism from original text prompts (GU47 WP-36, `polarity-orbs/<row>`; Meshy plan terms at generation
time; not CC0, no exclusivity claimed). Each was decimated (weld + meshopt simplify to about 7k vertices) with
textures downscaled to 512 px; the three blue-pole pieces had their base-colour texture hue-rotated 215 degrees (red to
blue) at admission. Geometry otherwise as generated. Admitted with `aura3d assets add --role backdrop --quality
candidate`; rights evidence and Meshy task metadata are under `provenance/`.

| File | Meshy row | Change | Rights evidence |
| --- | --- | --- | --- |
| `poChargeCoil.48974808.glb` | `poTeslaCoil` (renamed: no third-party names in bundled ids) | decimated, 512 px | `po-charge-coil.rights.json` |
| `poCrystalRed.f0c5b5fe.glb` | `poCrystalRed` | decimated, 512 px | `po-crystal-red.rights.json` |
| `poCrystalIslandB.ba529b43.glb` | `poCrystalIslandB` | decimated, 512 px | `po-crystal-island-b.rights.json` |
| `poCrystalBlue.f51e02e5.glb` | `poCrystalBlue` | decimated, 512 px, hue to blue | `po-crystal-blue.rights.json` |
| `poCrystalIsland.22a698c8.glb` | `poCrystalIsland` | decimated, 512 px, hue to blue | `po-crystal-island.rights.json` |
| `poMagnet.fc2c4e1a.glb` | `poMagnet` | decimated, 512 px, hue to blue | `po-magnet.rights.json` |

All other visuals are procedural geometry and canvas textures generated at runtime; no external asset URLs.
