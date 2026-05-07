# Entity Component System PRD

## Purpose
The ECS owns data-oriented runtime processing: entity IDs, component storage, queries, command buffers, systems, and scheduling integration. It exists to support large interactive applications without turning the scene graph into a monolithic behavior container.

## Lessons From Failed Attempts
- Current G3D had a real ECS shape, but E2E tests found component registration problems.
- `G3D2025` PRDs specified archetypes, queries, components, and systems, but dependency reports found core-to-ECS layer violations and system order reports found missing dependency enforcement.
- `Old-G3D` had repeated service/orchestrator and import-path problems that show why ECS must stay small and boundary-driven.

Reuse conceptually:

- Generational entity IDs.
- Component registry.
- Archetype or sparse-set storage.
- Queries and command buffer.
- Scheduler integration.

Discard:

- ECS importing core engine internals beyond public core APIs.
- Ad hoc component definitions inside systems when shared components are required.
- Unregistered test-only components in integration paths.

## Target Architecture
The ECS package is pure runtime data. It does not own rendering, physics, input, or animation. Bridges live in subsystem packages or integration packages.

Public API:

```ts
const world = new World();
const entity = world.createEntity();
world.add(entity, new TransformComponent());
world.systems.add(new MovementSystem());
world.update(frame);
```

## File-By-File Implementation Plan

### `packages/ecs/src/Entity.ts`
- Purpose: generational entity handles.
- Contains: `Entity`, `EntityId`, helpers.
- Edge cases: stale entity, generation overflow.
- Tests: create/destroy/reuse.

### `packages/ecs/src/World.ts`
- Purpose: ECS owner.
- Contains: entity manager, component stores, queries, systems, command buffer.
- Edge cases: modifying during iteration, destroyed entity access.
- Tests: lifecycle and command buffer.

### `packages/ecs/src/Component.ts`
- Purpose: component base contract and metadata.
- Contains: `Component`, `ComponentType`, optional lifecycle hooks.
- Tests: metadata validation.

### `packages/ecs/src/ComponentRegistry.ts`
- Purpose: map component classes to IDs and schemas.
- Edge cases: duplicate registration, anonymous classes, schema mismatch.
- Tests: registration and lookup.

### `packages/ecs/src/ComponentStore.ts`
- Purpose: storage abstraction.
- Contains: sparse and archetype-backed implementations if needed.
- Tests: add/remove/get/iterate.

### `packages/ecs/src/Archetype.ts`
- Purpose: group entities by component signature.
- Edge cases: transition churn, empty archetypes.
- Tests: archetype move correctness.

### `packages/ecs/src/SparseSet.ts`
- Purpose: fast entity-indexed storage.
- Tests: dense/sparse invariants.

### `packages/ecs/src/Bitset.ts`
- Purpose: component signatures and query masks.
- Tests: include/exclude matching.

### `packages/ecs/src/Query.ts`
- Purpose: cached query over component signatures.
- Edge cases: query invalidation after component add/remove.
- Tests: include/exclude, iteration, first/single behavior.

### `packages/ecs/src/System.ts`
- Purpose: base class/interface for systems.
- Contains: `System`, `SystemDescriptor`, phase/dependency metadata.
- Tests: lifecycle hooks.

### `packages/ecs/src/SystemScheduler.ts`
- Purpose: ECS system ordering using core scheduler concepts.
- Edge cases: cycle, dependency missing, same priority stable order.
- Tests: order and cycle failure.

### `packages/ecs/src/CommandBuffer.ts`
- Purpose: safe deferred mutations.
- Edge cases: temp entity references, command failure rollback.
- Tests: create/add/remove/destroy during iteration.

### `packages/ecs/src/EntityManager.ts`
- Purpose: entity allocation and liveness.
- Tests: max entity, reuse, validity.

### `packages/ecs/src/ECSSerializer.ts`
- Purpose: snapshot and restore ECS state.
- Edge cases: entity remapping, missing component type.
- Tests: roundtrip and version migration hooks.

### `packages/ecs/src/ECSProfiler.ts`
- Purpose: query/system/entity stats.
- Tests: metrics collection.

### `packages/ecs/src/components/TransformComponent.ts`
- Purpose: ECS-side transform data for data-oriented systems.
- Boundary: bridges sync this to scene nodes when requested.
- Tests: component schema and serialization.

### `packages/ecs/src/components/NameComponent.ts`
- Purpose: debug/name label.
- Tests: basic storage.

### `packages/ecs/src/components/TagComponent.ts`
- Purpose: tag-based filtering.
- Tests: query include tag.

### `packages/ecs/src/index.ts`
- Purpose: public ECS exports.
- Tests: package export smoke.

## Acceptance Criteria
- 100,000 entities can be created and iterated within the performance budget defined in `21-Testing-and-Validation-PRD.md`.
- Component registration is deterministic and test-safe.
- Queries update correctly after component transitions.
- Command buffer supports mutation during iteration.
- System scheduler enforces dependencies and rejects cycles.
- ECS package has no forbidden imports.

## Testing Checklist
- Unit: entity IDs, registry, stores, bitsets, query, command buffer.
- Integration: transform system, scheduler, serialization.
- Performance: entity creation, component add/remove, query iteration.
- Module exports: `@galileo3d/ecs` only public API.
- Regression: no hidden global registry leaking between tests unless reset API is explicit.

## Implementation Order
1. Entity and registry.
2. Stores and bitsets.
3. World and component operations.
4. Query.
5. Command buffer.
6. Systems and scheduler.
7. Serialization and profiler.

