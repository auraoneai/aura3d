# @galileo3d/ecs

`@galileo3d/ecs` owns entity identity, component registration/storage, sparse-set and archetype data structures, queries, command buffering, systems, scheduling, serialization, profiling, and common transform/name/tag components.

## Public API

- `Entity`, `EntityManager`: deterministic entity allocation, liveness, and recycling.
- `Component`, `ComponentRegistry`, `ComponentStore`, `SparseSet`, `Bitset`, `Archetype`: component metadata and storage primitives.
- `Query`: include/exclude query execution over component stores.
- `CommandBuffer`: deferred entity and component mutation.
- `System`, `SystemScheduler`, `World`: ECS update ownership, phase ordering, and system execution.
- `ECSSerializer`, `ECSProfiler`: deterministic serialization and runtime stats.
- `TransformComponent`, `NameComponent`, `TagComponent`: common components for scene and gameplay integration.

## Verification

Entity lifecycle, component stores, queries, command buffers, scheduler behavior, serialization, profiling, and scene/ECS integration are covered by `tests/unit/ecs/runtime.test.ts` and `tests/integration/scene-ecs-contracts.test.ts`. Export and import consistency is covered by `pnpm verify:exports` and `pnpm verify:imports`.
