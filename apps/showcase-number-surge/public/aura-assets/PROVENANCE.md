# Asset provenance — Number Surge

- `GT-Walsheim-Bold.woff2`: GT Walsheim Bold, from the AuraOne licensed font library (HUD, popups, cards, canvas op labels and the ball number decal). Byte copy of `examples/splat-rush-port/assets/GT-Walsheim-Bold.woff2` (sha256 `d5ab0311ce5ef91c83710164c5674dda2796ebb703a7a6441f0d77c9b2779a1e`).

Gameplay geometry is procedural (`src/meshes.ts`); the roadside numerals and dice are procedural (`src/roadside.ts`) and the palms are Idol GLBs generated through fal from our own references (per-asset provenance in `assets/idol/*.idol.json`). All audio is synthesized at runtime (`src/audio.ts`). No external asset URLs.
