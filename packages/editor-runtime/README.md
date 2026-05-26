# @aura3d/editor-runtime

`@aura3d/editor-runtime` owns editor command history, selection state, picking, inspector models, play-mode snapshots, and transform gizmos for runtime editor workflows.

## Public API

- `EditorRuntime`, `EditorMode`: mode switching, public selection methods, command execution, inspector edit execution, picking, translate-gizmo drag execution, diagnostics snapshots, material variant workflow ownership, and disposal.
- `Command`, `CommandHistory`, `CommandContext`: execute/undo/redo contracts with rollback on failed command execution.
- `Selection`: ordered selection state and listener notifications.
- `PickingService`: deterministic target hit selection and pick result ordering.
- `InspectorModel`: editable inspector property projection and typed set-property command creation.
- `MaterialVariantWorkflow`: editor-owned glTF/material variant selection state and render-resource option projection.
- `PlayModeBridge`: snapshot capture/restore for edit/play mode boundaries.
- `Gizmo`, `TranslateGizmo`, `RotateGizmo`, `ScaleGizmo`: transform handles, hit testing, and drag application.
- `createStaticExportHtml`, `createStaticExportRuntime`: package-owned static export shell/runtime generation for checked editor-authored project smoke tests without loading the editor app.
- `CreateNodeCommand`, `DeleteNodeCommand`, `SetPropertyCommand`, `TransformCommand`: built-in editor commands.

## Verification

Editor selection, command rollback, undo/redo, inspector edits, material variant workflow selection, picking, play-mode snapshots, translate/rotate/scale gizmos, keyboard shortcut contracts, browser editor pixels, editor public-runtime boundary enforcement, editor-authored provenance, and package-owned static export runtime generation are covered by `tests/unit/workstream5-input-audio-scripting-editor.test.ts`, `packages/editor-runtime/tests/editor-runtime.test.ts`, `tests/unit/editor/project-serializer.test.ts`, `tests/unit/editor/public-runtime-boundary.test.ts`, `tests/integration/editor-authored-project-replay.test.ts`, `tests/browser/editor-browser.spec.ts`, and `tests/visual/editor-app-pixels.spec.ts`. Export and import consistency is covered by `pnpm verify:exports` and `pnpm verify:imports`.
