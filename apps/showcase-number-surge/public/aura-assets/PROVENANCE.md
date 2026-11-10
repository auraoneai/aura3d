# Asset provenance — Number Surge

- `GT-Walsheim-Bold.woff2`: GT Walsheim Bold, from the AuraOne licensed font library (HUD, popups, cards, canvas op labels and the ball number decal). Byte copy of `examples/splat-rush-port/assets/GT-Walsheim-Bold.woff2` (sha256 `d5ab0311ce5ef91c83710164c5674dda2796ebb703a7a6441f0d77c9b2779a1e`).

Gameplay geometry is procedural (`src/meshes.ts`); all audio is synthesized at runtime (`src/audio.ts`). No external asset URLs.
## Meshy roadside dressing (meshy07, 2026-11-09)

Generated through the AuraOne Meshy account via Kiro Prism from original text prompts (GU47 meshy07, `artifacts/gu47-meshy/number-surge/<row>`). Meshy plan terms at generation time; not CC0. Rights and task metadata per model in `provenance/<row>.{rights,meta}.json`. Optimized copies (weld + simplify, 1024 textures; `nsNeonPalm` textures resized to 512 to stay under 1.5 MB).

- `nsFloatingDice.1d7f7051.glb` — dark dice with copper pips (28,320 tris).
- `nsNumeralSeven.bf86a377.glb` — glossy numeral 7 on a base, tinted neon in the scene (26,468 tris).
- `nsNeonPalm.dafb5a98.glb` — curved palm on a base, tinted cyan in the scene (28,746 tris).
- `nsPinkPalm.bf0a8ea1.glb` — violet palm, tinted magenta in the scene (28,154 tris).
