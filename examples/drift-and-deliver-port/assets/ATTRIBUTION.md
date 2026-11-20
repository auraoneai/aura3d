# Asset attribution

| File | Source | License |
| --- | --- | --- |
| `sky.hdr` | Poly Haven `kloppenheim_06_puresky` (1k) | CC0-1.0 |

All 3D vehicles (`courier`, `sedan`, `hatch`, `van`, `truck`), coastal landmarks (`clocktower`, `lighthouse`), street furniture (`lamp`, `signal`, `shelter`, `hydrant`, `watertank`), trees, palms, pedestrians, and city blocks in `Gridlock Courier` (`drift-and-deliver-port`) are authored procedurally in TypeScript on `@aura3d/engine` (`art/proceduralModels.ts`, `vehicles.ts`, and `city.ts`). The most-seen of them are drawn as Idol GLBs generated through fal from our own reference images (`assets/idol/*.glb`, per-asset provenance in `assets/idol/*.idol.json`); `?idol=0` keeps the procedural set.
