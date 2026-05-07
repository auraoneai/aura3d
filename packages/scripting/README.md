# @galileo3d/scripting

`@galileo3d/scripting` owns behavior attachment, behavior runtime phases, script context data, behavior registries, visual graph validation, graph serialization, and deterministic visual graph execution.

## Public API

- `Behavior`, `BehaviorHost`, `BehaviorRegistry`, `BehaviorSystem`: behavior lifecycle hooks, host ownership, factory lookup, update/fixed-update execution, and error capture.
- `ScriptContext`: structured runtime context passed into scripts.
- `VisualNode`, `VisualPort`, `validateNode`: node and port schema validation.
- `VisualGraph`, `validateGraph`, `serializeGraph`, `deserializeGraph`: graph topology validation, typed ports, cycle rejection, and deterministic serialization.
- `VisualGraphExecutor`: dependency-ordered graph execution and typed output values.

## Verification

Behavior phases, behavior attachment, scene/ECS scripting integration, graph/node/port validation, typed values, mismatch diagnostics, serialization, cycle rejection, deterministic execution, and browser scripting movement are covered by `tests/unit/workstream5-input-audio-scripting-editor.test.ts`, `tests/integration/scripting-scene-ecs.test.ts`, and `tests/browser/scripting-browser.spec.ts`. Export and import consistency is covered by `pnpm verify:exports` and `pnpm verify:imports`.
