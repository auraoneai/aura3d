# Browser-First Editor Workflow

Version: `1.0.0`

The editor workflow is browser-first and package-backed, but it is not documented as a full desktop editor replacement.

## Current Code

- `packages/editor-runtime/src/index.ts`
- `packages/editor/src/index.ts`
- `tests/browser/editor-*.spec.ts`
- `tests/unit/tools/editor*`

## Workflow

1. Use editor-runtime primitives for state, selection, commands, prefab, timeline, gizmo, export, and diagnostics.
2. Verify browser behavior with the editor Playwright specs before documenting a new editor feature as supported.

## Boundary

The current editor docs cover package/runtime primitives and browser test harness behavior only. They do not claim Unity/Unreal-style editor parity.
