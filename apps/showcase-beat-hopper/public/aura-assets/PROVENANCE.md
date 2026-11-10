# Beat Hopper: asset provenance

- `GT-Walsheim-Bold.woff2`: GT Walsheim Bold, from the AuraOne licensed font library (HUD, popups, cards).
  Byte copy of `examples/splat-rush-port/assets/GT-Walsheim-Bold.woff2`
  (sha256 `d5ab0311ce5ef91c83710164c5674dda2796ebb703a7a6441f0d77c9b2779a1e`, 41492 bytes).

## Stage dressing models (meshy07, 2026-11-09)

Club speaker stacks and a floating neon DJ deck beside the track (`src/dressing.ts`). Generated 2026-11-09 through
the AuraOne Meshy account via Kiro Prism from original text prompts (GU47 meshy07, `beat-hopper/<row>`; Meshy plan
terms at generation time; not CC0, no exclusivity claimed). The pipeline's optimized GLB was welded and simplified
(meshoptimizer, about 1/3 of the triangles; 1024 textures kept) and admitted with
`aura3d assets add --role set-dressing --quality candidate`. Rights evidence: `provenance/<row>.rights.json` and the
Meshy task record `provenance/<row>.meta.json`.

| File | Meshy row | Triangles | Rights evidence |
| --- | --- | --- | --- |
| `bhSpeakerStack.c6feff47.glb` | `bhSpeakerStack` | 9,126 | `bhSpeakerStack.rights.json` |
| `bhSpeakerStackB.fcbfbbce.glb` | `bhSpeakerStackB` | 9,996 | `bhSpeakerStackB.rights.json` |
| `bhTurntable.691cc740.glb` | `bhTurntable` | 12,084 | `bhTurntable.rights.json` |

All other geometry is procedural (`geometry.dynamic`, see `src/meshes.ts` and `src/stage.ts`); the hopper stays
procedural. No external asset URLs.