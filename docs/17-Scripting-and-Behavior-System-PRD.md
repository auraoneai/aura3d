# Scripting And Behavior System PRD

## Purpose
Scripting provides reusable runtime behaviors and a future visual scripting graph. It allows applications to attach update logic to scene nodes or ECS entities without hiding scheduling or dependency order.

## Lessons From Failed Attempts
- Current and 2025 attempts included scripting and visual scripting with many nodes.
- Broad node catalogs were created before core engine acceptance was proven.
- Old-G3D accumulated orchestrators and service layers that made activation unclear.

Reuse conceptually:

- Behavior runtime.
- Visual graph concept.
- Hot reload and debug hooks later.

Discard:

- Large node catalogs before a small deterministic behavior API exists.
- Scripts that directly mutate renderer internals.
- Hidden global behavior registries.

## Target Architecture
Phase 1 is code-based behaviors. Visual scripting is built on the same behavior runtime after core behavior scheduling is stable.

## File-By-File Implementation Plan

### `packages/scripting/src/Behavior.ts`
- Purpose: base behavior contract.
- Contains: lifecycle hooks `onStart`, `onUpdate`, `onFixedUpdate`, `onDestroy`.
- Tests: hook order.

### `packages/scripting/src/BehaviorHost.ts`
- Purpose: attach behaviors to scene nodes or entities.
- Edge cases: host destroyed during update.
- Tests: attach/detach.

### `packages/scripting/src/BehaviorSystem.ts`
- Purpose: scheduled execution of behaviors.
- Tests: phase order and error handling.

### `packages/scripting/src/ScriptContext.ts`
- Purpose: safe context exposed to behaviors.
- Tests: services available by phase.

### `packages/scripting/src/BehaviorRegistry.ts`
- Purpose: optional registration for serialization.
- Tests: duplicate and missing behavior.

### `packages/scripting/src/VisualGraph.ts`
- Purpose: future visual scripting graph model.
- Initial scope: graph data and validation only.
- Tests: node/edge validation.

### `packages/scripting/src/VisualNode.ts`
- Purpose: base node schema.
- Tests: port validation.

### `packages/scripting/src/VisualGraphExecutor.ts`
- Purpose: execute validated graph later.
- Initial scope: simple event/flow/math nodes only.
- Tests: deterministic execution.

### `packages/scripting/src/index.ts`
- Purpose: public exports.
- Tests: package export smoke.

## Acceptance Criteria
- Behaviors run in declared scheduler phases.
- Behavior errors are captured and reported without corrupting scheduler state.
- Behaviors can be attached/detached and disposed.
- Visual graph validation works before broad node implementation.

## Testing Checklist
- Unit: lifecycle hooks, registry, graph validation.
- Integration: behavior moves scene node, behavior updates ECS component.
- Browser/runtime: simple behavior demo.
- Regression: disabled behavior does not update.

## Implementation Order
1. Behavior and context.
2. Host and system.
3. Registry and serialization hooks.
4. Minimal visual graph validation.
5. Minimal graph executor.

