# MeshBVH responsibilities (WS-4.5)

**Decision: `MeshBVH` stays, and stays in `packages/physics`.** It is not physics
duplication, and the solver decision does not touch it.

The PRD's revision-1 assumption was that a new solver's own BVH would make ours redundant.
Measured, that would have deleted a module whose consumers are almost entirely *not*
physics contact.

## Method

Every reference to `MeshBVH`, `buildMeshBVH`, `raycastMesh`, `raycastMeshBruteForce`,
`MeshSurfaceQuery` and `createMeshSurfaceQuery` outside `MeshBVH.ts` itself, classified by
what the consumer is *for* rather than by which package it sits in. Counts are `git grep`
occurrences, excluding `tests/reports/`.

## Responsibility table

| Consumer | Refs | Responsibility | Made redundant by a solver? |
| --- | --- | --- | --- |
| `SurfaceQuery.ts` | 4 | **Static geometry analysis.** Builds one BVH per mesh and raycasts down to sample terrain height, normal and slope. | No. This answers "how high is the ground at (x,z)" without a body, a collider or a step. |
| `engine/src/agent-api/GameSceneGeometryBindings.ts` | 5 | **Asset admission / scene authoring.** Derives a walkable surface from an authored mesh and caches it per node, so a route can place things on terrain. | No. Runs at author time, before any body exists. |
| `engine/src/agent-api/index.ts` | 4 | **Public re-export.** Surfaces `buildMeshBVH` / `raycastMesh` / `MeshBVH` on the agent API as *geometry queries*, explicitly documented there as importing only `Shape`'s types. | No. Deleting it is a public API break. |
| `physics/src/solverless.ts` | 4 | **Bundle boundary.** The `./physics/solverless` subpath exists so a scene with no bodies does not pull the solver; mesh queries are on the solver-free side of it. | No — the opposite: coupling it to the solver would undo the subpath's reason for existing. |
| `create-aura3d/src/showcase-spec-types.ts` | 2 | **Scaffold contract.** Generated showcase specs emit mesh data in exactly the shape `createMeshSurfaceQuery` accepts, so no route-side conversion is needed. | No. Template-facing. |
| `engine/src/agent-api/PhysicsRuntime.ts` | 1 | **Diagnostic pointer.** An error message directing mesh-backed ground at `createMeshSurfaceQuery`. | No. |
| `physics/src/Raycast.ts` | 3 | **Raycasting** against `mesh` colliders — the public `raycast`/`sphereCast` path. | Partly. A solver with its own mesh raycast could serve this one row. |
| `tests/unit/physics/mesh-surface-query.test.ts` | 26 | Tests of the above. | No. |
| `tests/unit/physics/vehicle-mesh-contact.test.ts` | 5 | **Physics contact.** Vehicle wheels against track geometry. | Yes, in principle. |
| `tests/unit/physics/turbo-drift-real-circuit-contact.test.ts` | 1 | **Physics contact**, same as above. | Yes, in principle. |
| `docs/api/public-api.md`, `docs/concepts/physics.md`, `docs/architecture/extension-points.md` | 5 | **Documentation-generator dependency** (R8 point 3). | No. |

## Conclusion

Seven of the eleven consumer groups have nothing to do with contact resolution. Of the two
that do, both reach it through `SurfaceQuery`, which the vehicle layer uses for *sampling*
rather than for solving contacts — and WS-4.4 retains that layer unchanged.

Only the `Raycast.ts` mesh-collider row could be served by a solver's own acceleration
structure, and replacing it would mean routing a public `raycast` through the backend and
so putting a backend type one step from the public surface, which WS-4.1 forbids.

`MeshBVH.ts` imports exactly one thing: `type Vec3` from `Shape.js`. It has no dependency
on the solver, is unchanged across the whole of Phase 4, and is reachable through a
subpath that exists specifically to avoid loading the solver.

### Does it move out of `packages/physics`?

The PRD allows for it. **No, for now** — moving it would break the
`@aura3d/physics/solverless` subpath that `GameSceneGeometryBindings` imports, for a
purely cosmetic gain, during a phase whose job is to reduce risk. Revisit if a
`@aura3d/geometry` package is created for other reasons; the module is already free of
physics imports, so the move is a rename rather than an untangle.
