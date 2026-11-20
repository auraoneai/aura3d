# Asset attribution

None of these comes from the original game.

1. All 3D vehicles, railcar bogies, passengers, townsfolk, coastal houses, clock towers, lighthouses, stone keeps, watchtowers, crates, lamps, islands, track, flora, and weather are authored procedurally in TypeScript on `@aura3d/engine` (`art/proceduralModels.ts`, `townkit.ts`, and `world.ts`). Since the Nov 2026 Idol pass the tram, riders, motorman, townsfolk and town set pieces are drawn as Idol GLBs generated through fal from our own reference images (`idolModels.ts`, files and `*.idol.json` provenance in `apps/showcase-last-train-port/assets/idol/`).
2. Environment lighting uses CC0 Poly Haven sky HDRIs:

| File | Source | License |
| --- | --- | --- |
| sky.hdr | Poly Haven `kloppenheim_06_puresky` (1k), `public/hdri/kloppenheim_06_puresky_1k.hdr` | CC0-1.0 |
| cinema-warm.cube | Procedural 16^3 display grading LUT authored in code (`apps/showcase-port-shared/vfx-pack.ts`) | AuraOne authored |
