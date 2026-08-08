# @aura3d/navigation-recast

Optional Recast/Detour navigation for Aura3D, backed by exact
`recast-navigation@0.43.1`. Static worlds should normally build and serialize
their navmesh offline, then lazily initialize this package and import that data
at runtime. Runtime generation remains available for procedural worlds.

The package is absent from core, product, and arcade-game entries. It owns
navmesh generation, path queries, serialization, Detour crowd simulation, and
temporary-obstacle integration; it does not depend on Three.js.

## Public API

- `createRecastNavigation()` initializes the WASM runtime once and returns a
  thin factory/query adapter.
- `generateSolo()` creates a small-world navmesh from indexed triangle data.
- `import()` restores an offline-generated navmesh.
- `RecastNavMeshHandle` owns queries, serialization, and deterministic cleanup.
- `rawModule` and `rawNavMesh` are public escape hatches for advanced Detour
  operations without private imports.

## Verification

Run `pnpm exec vitest run tests/unit/navigation-recast` for generation, query,
serialization, lifecycle, and optional-boundary tests. Browser and worker
evidence is produced by the navigation bake-off before release.
