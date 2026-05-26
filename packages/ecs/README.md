# @aura3d/ecs

`@aura3d/ecs` owns entity identity, component registration/storage, sparse-set and archetype data structures, queries, command buffering, systems, scheduling, serialization, profiling, and common transform/name/tag components.

## Public API

- `Entity`, `EntityManager`: deterministic entity allocation, liveness, and recycling.
- `Component`, `ComponentRegistry`, `ComponentStore`, `SparseSet`, `Bitset`, `Archetype`: component metadata and storage primitives.
- `Query`: include/exclude query execution over component stores.
- `CommandBuffer`: deferred entity and component mutation.
- `System`, `SystemScheduler`, `World`: ECS update ownership, phase ordering, and system execution.
- `ECSSerializer`, `ECSProfiler`: deterministic serialization and runtime stats.
- `TransformComponent`, `NameComponent`, `TagComponent`, `ActiveComponent`, `HierarchyComponent`: common components for scene, gameplay, active-state, and parent/child integration.
- `ActiveSystem`, `HierarchySystem`: active-in-hierarchy propagation, cycle-safe parenting, traversal, sibling ordering, and hierarchy validation.

## Verification

Entity lifecycle, component stores, queries, command buffers, scheduler behavior, hierarchy/active systems, serialization, profiling, and scene/ECS integration are covered by `tests/unit/ecs/runtime.test.ts` and `tests/integration/scene-ecs-contracts.test.ts`. Export and import consistency is covered by `pnpm verify:exports` and `pnpm verify:imports`.
