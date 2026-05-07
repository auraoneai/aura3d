# Editor Runtime PRD

## Purpose
The editor runtime provides selection, commands, undo/redo, gizmos, picking, inspectors, and edit/play integration. It is not a full IDE or admin portal. It is an engine-side runtime layer that can support future editor UIs.

## Lessons From Failed Attempts
- Current and 2025 attempts had editor modules, gizmos, commands, inspectors, and picking.
- Old-G3D mixed editor, admin portal, enterprise UI, and platform systems, creating huge scope creep.
- Current source scans showed gizmo TODOs around world/component access.

Reuse conceptually:

- Command pattern.
- Gizmos.
- Picking.
- Inspectors.
- Edit/play state.

Discard:

- Full admin portal scope.
- Editor code that reaches into private subsystem internals.
- UI-first editor before runtime commands are testable.

## Target Architecture
The editor runtime consumes public engine APIs. UI frameworks can bind to editor state later.

## File-By-File Implementation Plan

### `packages/editor-runtime/src/EditorRuntime.ts`
- Purpose: editor state owner.
- Contains: selection, command history, mode, tool state.
- Tests: init/dispose and mode switching.

### `packages/editor-runtime/src/Selection.ts`
- Purpose: selected scene nodes/entities.
- Edge cases: object deleted while selected.
- Tests: selection changes and events.

### `packages/editor-runtime/src/Command.ts`
- Purpose: command interface.
- Tests: execute/undo contract.

### `packages/editor-runtime/src/CommandHistory.ts`
- Purpose: undo/redo stack, grouping.
- Edge cases: failed command, command merge.
- Tests: undo/redo and transaction rollback.

### `packages/editor-runtime/src/commands/TransformCommand.ts`
- Purpose: transform edit.
- Tests: undo restores exact local transform.

### `packages/editor-runtime/src/commands/CreateNodeCommand.ts`
- Purpose: create scene node.
- Tests: undo removes node and redo restores stable ID if configured.

### `packages/editor-runtime/src/commands/DeleteNodeCommand.ts`
- Purpose: delete scene node.
- Tests: undo restores hierarchy.

### `packages/editor-runtime/src/commands/SetPropertyCommand.ts`
- Purpose: typed property edit.
- Tests: invalid path rejection.

### `packages/editor-runtime/src/PickingService.ts`
- Purpose: scene picking through input ray and bounds/render ID.
- Tests: pick nearest object.

### `packages/editor-runtime/src/Gizmo.ts`
- Purpose: base gizmo contract.
- Tests: hit testing and drag lifecycle.

### `packages/editor-runtime/src/TranslateGizmo.ts`
- Purpose: move selected target.
- Tests: axis movement.

### `packages/editor-runtime/src/RotateGizmo.ts`
- Purpose: rotate selected target.
- Tests: angle calculation.

### `packages/editor-runtime/src/ScaleGizmo.ts`
- Purpose: scale selected target.
- Tests: axis/uniform scale.

### `packages/editor-runtime/src/InspectorModel.ts`
- Purpose: describe editable properties for UI.
- Tests: schema from scene node/material/light.

### `packages/editor-runtime/src/PlayModeBridge.ts`
- Purpose: snapshot scene and enter/exit play mode.
- Tests: play changes revert on exit if configured.

### `packages/editor-runtime/src/index.ts`
- Purpose: public exports.
- Tests: package export smoke.

## Acceptance Criteria
- Selection and commands work without UI.
- Undo/redo is deterministic.
- Transform gizmos edit scene nodes through commands.
- Picking works in a browser scene.
- Play mode can snapshot and restore a simple scene.

## Testing Checklist
- Unit: command history, selection, inspector model.
- Integration: picking and gizmo transform.
- Browser/visual: editor viewport gizmo demo.
- Regression: undo after delete restores hierarchy.

## Implementation Order
1. Runtime, selection, command history.
2. Transform/create/delete/set-property commands.
3. Picking.
4. Gizmo base and translate gizmo.
5. Rotate and scale gizmos.
6. Inspector model and play mode.

