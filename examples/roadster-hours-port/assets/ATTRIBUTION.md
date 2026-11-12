# Saltwind Highway (`roadster-hours-port`): asset attribution

All 3D hero vehicles, highway traffic vehicles, coastal scenery, foliage, boulders, and route landmarks are authored procedurally in TypeScript (`roadsterRig.ts`, `art/proceduralModels.ts`) on `@aura3d/engine`. Legacy fallback cars (`cars.baked.ts`) are baked from CC0 models (Quaternius via poly.pizza, Kenney racing kit).

## CC0 surface detail (GU47 RH47-10)

| file | source | licence | maps used |
| --- | --- | --- | --- |
| detail/asphalt.jpg | ambientCG Asphalt033, 1K-JPG (https://ambientcg.com/a/Asphalt033) | CC0-1.0 | Color (luminance), NormalGL |
| detail/limestone.jpg | ambientCG Rock063, 1K-JPG (https://ambientcg.com/a/Rock063) | CC0-1.0 | Color (luminance), NormalGL |
| detail/sandstone.jpg | ambientCG Rock064, 1K-JPG (https://ambientcg.com/a/Rock064) | CC0-1.0 | Color (luminance), NormalGL |

Packed to 512 px by `tools/pack-detail.mjs` (R = luminance detail re-centred on 0.5, G/B = normal x/y); sha256 and download urls in `detail/detail.json`.
