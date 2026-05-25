# Editor Authoring Plan

> Historical note: This V3 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


## Goal

Build a usable browser-first editor application. Editor-runtime APIs are not enough for a Unity/Unreal-style claim. The claim requires a user to author a real local app through a browser UI.

## Required File Areas

Expected primary code areas:

- `apps/editor/index.html`
- `apps/editor/src/main.ts`
- `apps/editor/src/EditorShell.ts`
- `apps/editor/src/viewport/EditorViewport.ts`
- `apps/editor/src/panels/HierarchyPanel.ts`
- `apps/editor/src/panels/InspectorPanel.ts`
- `apps/editor/src/panels/AssetBrowserPanel.ts`
- `apps/editor/src/panels/ProfilerPanel.ts`
- `apps/editor/src/panels/ConsolePanel.ts`
- `apps/editor/src/panels/MaterialPanel.ts`
- `apps/editor/src/import/ImportSettingsPanel.ts`
- `apps/editor/src/project/ProjectSerializer.ts`
- `apps/editor/src/project/ProjectStore.ts`
- `apps/editor/src/gizmos/*`
- `apps/editor/src/playmode/*`
- `apps/editor/src/export/*`
- `packages/editor-runtime/src/*`

## Editor Shell

- [x] Dockable or fixed panels suitable for repeated authoring work.
- [x] Main menu or command palette for project, scene, asset, edit, view, play, export.
- [x] Keyboard shortcuts for common editor commands.
- [x] Undo/redo wired across scene, transform, material, import, and hierarchy operations.
- [x] Autosave or explicit save state indicator.
- [x] Error console and diagnostics panel.

## Viewport

- [x] WebGL2 renderer-backed viewport.
- [x] Orbit/pan/zoom/focus controls.
- [x] Grid, axes, camera gizmo, selected object outline.
- [x] Transform gizmos for translate/rotate/scale.
- [x] Snapping for grid/angle/scale.
- [x] Object picking through renderer/scene data.
- [x] Multi-selection.
- [x] View modes: shaded, wireframe/debug, collider, bounds, lighting, overdraw if supported.
- [x] Play-mode viewport handoff and return.

## Hierarchy And Inspector

- [x] Create/delete/duplicate nodes.
- [x] Rename and reorder nodes.
- [x] Parent/reparent nodes through drag/drop.
- [x] Search/filter.
- [x] Transform editor.
- [x] Mesh renderer component editor.
- [x] Material assignment and editing.
- [x] Camera editor.
- [x] Light editor.
- [x] Physics body/collider editor.
- [x] Animation component editor.
- [x] Audio source/listener editor.
- [x] Script/behavior component editor if scripting is claimed.

## Asset Browser And Import

- [x] Folder tree and asset grid.
- [x] Import glTF/GLB and dependencies.
- [x] Thumbnail generation.
- [x] Import status and warnings.
- [x] Import settings: scale, orientation, material mode, texture mode, compression, animations, variants.
- [x] Drag asset into viewport/hierarchy.
- [x] Reimport asset.
- [x] Asset dependency view.
- [x] Delete/rename/move assets with project references updated.

## Project Format

- [x] Versioned project JSON or binary format.
- [x] Scene serialization with stable IDs.
- [x] Asset reference serialization.
- [x] Material overrides.
- [x] Component serialization.
- [x] Migration tests.
- [x] Round-trip tests for save/load.
- [x] Export format for static runtime app.

## Play Mode And Export

- [x] Enter play mode from editor scene.
- [x] Isolate runtime mutations from edit-mode scene.
- [x] Stop play mode and restore edit state.
- [x] Static export of authored project.
- [x] Exported app loads without editor code.
- [x] Browser smoke test for exported app.

## Required End-To-End Test

Add `tests/browser/editor-authoring-foundation.spec.ts`:

- [x] Open editor.
- [x] Create new project.
- [x] Import a real glTF asset.
- [x] Drag asset into scene.
- [x] Move/rotate/scale with gizmo.
- [x] Edit material.
- [x] Add light.
- [x] Add camera.
- [x] Add physics collider or script if supported.
- [x] Enter play mode.
- [x] Stop play mode.
- [x] Save project.
- [x] Reload editor and reopen project.
- [x] Export static app.
- [x] Open exported app and verify nonblank WebGL pixels.
- [x] Store screenshot evidence for editor and exported app.

## Claim Rule

No Unity/Unreal-style authoring claim is allowed until the end-to-end test above passes and the authored app is visually credible.
