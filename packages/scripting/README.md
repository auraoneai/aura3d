# @galileo3d/scripting

`@galileo3d/scripting` owns behavior attachment, behavior runtime phases, script context data, behavior registries, visual graph validation, graph serialization, and deterministic visual graph execution.

## Public API

- `Behavior`, `BehaviorHost`, `BehaviorRegistry`, `BehaviorSystem`: behavior lifecycle hooks, host ownership, factory lookup, update/fixed-update execution, and error capture.
- `ScriptContext`: structured runtime context passed into scripts.
- `VisualNode`, `VisualPort`, `validateNode`: node and port schema validation, including bounded `any` ports and default input values.
- `createVisualNode`, `listVisualNodeDefinitions`, `getVisualNodeDefinition`: deterministic visual scripting node catalog adapted from the old math, logic, flow-control, variable, and debug node surface.
- `VisualGraph`, `validateGraph`, `serializeGraph`, `deserializeGraph`: graph topology validation, typed ports, cycle rejection, and deterministic serialization.
- `VisualGraphExecutor`: dependency-ordered graph execution, typed output values, catalog node execution, and explicit Unity/Unreal visual-scripting claim blockers.

## Verification

Behavior phases, behavior attachment, scene/ECS scripting integration, graph/node/port validation, typed values, mismatch diagnostics, serialization, cycle rejection, deterministic execution, catalog math/logic/flow nodes, and browser scripting movement are covered by `tests/unit/workstream5-input-audio-scripting-editor.test.ts`, `tests/integration/scripting-scene-ecs.test.ts`, and `tests/browser/scripting-browser.spec.ts`. Export and import consistency is covered by `pnpm verify:exports` and `pnpm verify:imports`.
