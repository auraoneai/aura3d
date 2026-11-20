# Browser-First Editor Workflow

The editor workflow is browser-first and package-backed, but it is not documented as a full desktop editor replacement.

## Current Code

- `packages/editor-runtime/src/index.ts` (the editor app, `apps/editor`, was deleted in 5.7.0; the runtime package remains)
- `tests/browser/editor-*.spec.ts` (they mount `tests/browser/editor-browser-harness.html`)
- `tests/unit/editor/`

## Workflow

1. Use editor-runtime primitives for state, selection, commands, prefab, timeline, gizmo, export, and diagnostics.
2. Verify browser behavior with the editor Playwright specs before documenting a new editor feature as supported.

## Aura3D advantage

