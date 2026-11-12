# Asset attribution

None of these comes from the original game.

1. All 3D vehicles, railcar bogies, passengers, townsfolk, coastal houses, clock towers, lighthouses, stone keeps, watchtowers, crates, lamps, islands, track, flora, and weather are authored 100% procedurally in TypeScript on `@aura3d/engine` (`art/proceduralModels.ts`, `townkit.ts`, and `world.ts`). Zero Meshy or external `.glb` files are bundled or fetched.
2. Environment lighting uses CC0 Poly Haven sky HDRIs:

| File | Source | License |
| --- | --- | --- |
| sky.hdr | Poly Haven `kloppenheim_06_puresky` (1k), `public/hdri/kloppenheim_06_puresky_1k.hdr` | CC0-1.0 |
| cinema-warm.cube | Procedural 16^3 display grading LUT authored in code (`apps/showcase-port-shared/vfx-pack.ts`) | AuraOne authored |
