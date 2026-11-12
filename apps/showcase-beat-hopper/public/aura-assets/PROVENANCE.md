# Beat Hopper: asset provenance

- `GT-Walsheim-Bold.woff2`: GT Walsheim Bold, from the AuraOne licensed font library (HUD, popups, cards).
  Byte copy of `examples/splat-rush-port/assets/GT-Walsheim-Bold.woff2`
  (sha256 `d5ab0311ce5ef91c83710164c5674dda2796ebb703a7a6441f0d77c9b2779a1e`, 41492 bytes).

All 3D geometry — the articulated synth-skater bot (torso, pelvis, legs, head, visor, headphones, hover-skates),
corridor obstacles, equalizer towers, speaker stacks, DJ decks, and concert stage — is 100% procedural on
`@aura3d/engine` (`src/art/proceduralModels.ts`, `src/meshes.ts`, `src/stage.ts`). Zero `.glb` files or external asset URLs.
