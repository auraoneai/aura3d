# Editor Runtime

Version: `1.0.0`

Editor-runtime code provides reusable browser authoring primitives. It is separate from the full `apps/editor` shell.

## Code

- `packages/editor-runtime/src/index.ts`
- `packages/editor/src/index.ts`
- `apps/editor/`
- `tests/unit/tools/editor*` and editor browser specs under `tests/browser/`

## Current Areas

- Selection and editor state.
- Command history.
- Prefab and scene authoring primitives.
- Gizmo/timeline-facing runtime helpers.
- Static export and diagnostics helpers.

## Boundary

The editor runtime is a package surface, not a complete product guarantee for a Unity/Unreal-style editor. UI behavior must be verified against `apps/editor/` and browser tests before being documented as supported.

## Current Limits

Editor-runtime docs cover reusable primitives and known app integration points. Full editor-product claims, authoring UX guarantees, and broad export/import workflows require app-level browser tests and generated evidence.

## Current Limits

- Editor-runtime docs cover package primitives; complete DCC-style editor workflows require app-level browser evidence before being presented as supported.
