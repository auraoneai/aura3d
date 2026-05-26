# @aura3d/editor

`@aura3d/editor` is the canonical public editor package. It exposes the runtime editor surface implemented in `@aura3d/editor-runtime` from the target `packages/editor/**` package path while keeping editor UI concerns outside the runtime packages.

## Public API

- `EditorRuntime`, `EditorMode`: mode switching, selection ownership, history, material variant workflow ownership, and disposal.
- `Command`, `CommandHistory`, `CommandContext`: execute/undo/redo contracts with rollback on failed command execution.
- `Selection`: ordered selection state and listener notifications.
- `PickingService`: deterministic target hit selection and pick result ordering.
- `InspectorModel`: editable inspector property projection.
- `MaterialVariantWorkflow`: editor-owned glTF/material variant selection state and render-resource option projection.
- `PlayModeBridge`: snapshot capture/restore for edit/play mode boundaries.
- `Gizmo`, `TranslateGizmo`, `RotateGizmo`, `ScaleGizmo`: transform handles, hit testing, and drag application.
- `CreateNodeCommand`, `DeleteNodeCommand`, `SetPropertyCommand`, `TransformCommand`: built-in editor commands.

## Verification

The canonical editor package is covered by `tests/unit/public-api-contracts.test.ts`, which imports `EditorRuntime` through `@aura3d/editor`. The underlying runtime contracts are covered by `tests/unit/workstream5-input-audio-scripting-editor.test.ts`, `packages/editor-runtime/tests/editor-runtime.test.ts`, and `tests/browser/editor-browser.spec.ts`, including editor-owned material variant selection. Export, import, architecture, and boundary consistency is covered by `pnpm verify:exports`, `pnpm verify:imports`, `pnpm verify:architecture`, and `pnpm verify:boundaries`.
