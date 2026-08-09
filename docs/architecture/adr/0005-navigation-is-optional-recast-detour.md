# ADR 0005: Navigation is optional Recast/Detour

- **Date:** 2026-08-08
- **Status:** accepted
- **Workstream:** WS-2.2

## Context

Aura3D previously published an in-house grid pathfinder, quadratic neighbor-scan
crowd simulator, and local steering algorithms from `@aura3d/physics`. They did
not generate or query a 3D navmesh, serialize a Detour mesh, support tile-cache
obstacles, or provide a worker-transfer contract. Keeping them beside the
selected adapter created overlapping subsystem ownership.

## The four R11 questions

1. **Does Three.js already solve this?** No. Three.js does not ship navigation.
2. **Does another mature ecosystem library solve this?** Yes. Recast/Detour is
   the mature owner, with a current browser/WASM integration in
   `recast-navigation@0.43.1`.
3. **Does this create lasting differentiation for Aura3D?** The navigation
   algorithms do not. Typed asset linkage, lifecycle, diagnostics, and
   agent-safe composition do.
4. **Does this belong above or below the public API?** Below Aura3D's typed
   optional adapter and outside every recommended core/product/arcade entry.

## Decision

Adopt exact `recast-navigation@0.43.1` behind optional
`@aura3d/navigation-recast`. Static worlds prefer offline generation and
serialized navmeshes. Runtime generation remains for procedural worlds and may
run in a worker. Recast/Detour owns navmesh generation, path queries, crowds,
and temporary obstacles. Yuka is not selected: its older package does not
replace navmesh generation or Detour obstacle/crowd coverage.

The major-version migration removes the displaced in-house exports after their
consumers move to Recast/Detour or route-local direct-objective logic and R8
proves the deletion safe. They cannot support current competitive navigation
claims, remain as a second implementation, or return as an undocumented
compatibility layer.

## Consequences

- Navigation adds no bytes or WASM when it is not installed.
- Advanced Detour use goes through documented escape hatches, not private paths.
- A second recommended navmesh, crowd, or obstacle owner is a gate failure.
- The removal is a declared major-version breaking change with migration notes.

## Evidence

The retained bake-off covers generation, query, crowds, temporary obstacles,
worker transfer, serialization/import, dynamic updates, memory, determinism,
browser loading, disposal, and bundle cost. Historical measurements for the
removed implementation are frozen in the committed report; current runs execute
only the selected Recast/Detour candidate.
