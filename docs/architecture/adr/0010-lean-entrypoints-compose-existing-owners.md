# ADR 0010: Lean entrypoints compose existing owners

- **Date:** 2026-08-11
- **Status:** accepted for Aura3D 2.0.0
- **Workstream:** 2.0 public-surface consolidation

## Context

Product and game starters need smaller import surfaces, but a second renderer,
scene graph, physics engine, asset loader, or game runtime would create duplicate
ownership. The `@aura3d/lean` package and root lean adapters therefore need an
explicit architectural boundary.

## Decision

`@aura3d/lean`, `lean`, `lean-product`, `lean-game`, and `ArcadeRuntime` are
composition entrypoints only. They delegate scene, rendering, input, physics,
assets, materials, and runtime behavior to the existing package owners. They may
choose defaults and reduce dependency reach, but may not implement competing
subsystems or claim capabilities their delegates do not prove.

## Evidence

Package-graph and boundary gates enforce dependency direction. Lean browser and
package-smoke tests prove the public entries, while final subsystem ownership
evidence rejects duplicate owners.
