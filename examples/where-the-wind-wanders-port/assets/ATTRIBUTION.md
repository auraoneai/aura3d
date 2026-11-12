# Asset provenance: The Bellkeeper's Walk (`where-the-wind-wanders-port`)

## 3D Characters, Architecture & Sanctuary Scenery (100% Procedural `@aura3d/engine`)

All characters, architecture, flora, and interactive props in `The Bellkeeper's Walk` are sculpted procedurally in code using `@aura3d/engine` multi-material assemblies (`art/proceduralModels.ts` on `apps/showcase-port-shared/proceduralKernel.ts`) — zero external `.glb` or Meshy 3D files are shipped:

- **Bellkeeper Wanderer (`hero`)**: Articulated multi-material `@aura3d/engine` character hierarchy (`latheMesh` woven reed/straw conical traveller hat with indigo hatband and braided chin cord, `icosphereSmoothMesh` serene head, `loftSectionsMesh` layered sage/slate/ochre woven wind-cloak & tunic, leather cross-body courier satchel, `tubeSweepMesh` carved wooden sanctuary staff with suspended gleaming brass chime bell and crimson/gold wind-ribbons, wrapped calf gaiters, and grounded leather boots).
- **Highland Sanctuary & Village (`belltower`, `belltower-bell`, `cottage`, `windmill`, `packhorse-bridge`, `wayside-shrine`)**: Multi-material ashlar masonry, limewash plaster, mortised oak timber, thatch/slate roofs, mullion glass, and patinated bronze sanctuary bell.
- **Meadow Flora & Props (`pine`, `oak`, `shrub`, `stones`, `letter`, `kite`, `wisp`, `boat`)**: Procedural multi-material wind-bent pines, gnarled oaks, heather/shrubs, rune standing stones, wax-sealed parchment letters, swallowtail kite, filigree wisp, and clinker sailing skiff.

## Environment HDRI & Fonts

- **Environment IBL (`assets/env/kloppenheim_06_puresky_1k.hdr`)**: Poly Haven `kloppenheim_06_puresky` (Greg Zaal & Jarod Guest, CC0 1.0 Universal; see `env-assets.ts`).
- **Typography (`assets/fonts/`)**: Licensed faces copied from `packages/game/src/fonts/` (documented in `assets/fonts/NOTICE.txt`).
