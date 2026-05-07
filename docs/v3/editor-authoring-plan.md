# Editor Authoring Plan

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

- [ ] Dockable or fixed panels suitable for repeated authoring work.
- [ ] Main menu or command palette for project, scene, asset, edit, view, play, export.
- [ ] Keyboard shortcuts for common editor commands.
- [ ] Undo/redo wired across scene, transform, material, import, and hierarchy operations.
- [ ] Autosave or explicit save state indicator.
- [ ] Error console and diagnostics panel.

## Viewport

- [ ] WebGL2 renderer-backed viewport.
- [ ] Orbit/pan/zoom/focus controls.
- [ ] Grid, axes, camera gizmo, selected object outline.
- [ ] Transform gizmos for translate/rotate/scale.
- [ ] Snapping for grid/angle/scale.
- [ ] Object picking through renderer/scene data.
- [ ] Multi-selection.
- [ ] View modes: shaded, wireframe/debug, collider, bounds, lighting, overdraw if supported.
- [ ] Play-mode viewport handoff and return.

## Hierarchy And Inspector

- [ ] Create/delete/duplicate nodes.
- [ ] Rename and reorder nodes.
- [ ] Parent/reparent nodes through drag/drop.
- [ ] Search/filter.
- [ ] Transform editor.
- [ ] Mesh renderer component editor.
- [ ] Material assignment and editing.
- [ ] Camera editor.
- [ ] Light editor.
- [ ] Physics body/collider editor.
- [ ] Animation component editor.
- [ ] Audio source/listener editor.
- [ ] Script/behavior component editor if scripting is claimed.

## Asset Browser And Import

- [ ] Folder tree and asset grid.
- [ ] Import glTF/GLB and dependencies.
- [ ] Thumbnail generation.
- [ ] Import status and warnings.
- [ ] Import settings: scale, orientation, material mode, texture mode, compression, animations, variants.
- [ ] Drag asset into viewport/hierarchy.
- [ ] Reimport asset.
- [ ] Asset dependency view.
- [ ] Delete/rename/move assets with project references updated.

## Project Format

- [ ] Versioned project JSON or binary format.
- [ ] Scene serialization with stable IDs.
- [ ] Asset reference serialization.
- [ ] Material overrides.
- [ ] Component serialization.
- [ ] Migration tests.
- [ ] Round-trip tests for save/load.
- [ ] Export format for static runtime app.

## Play Mode And Export

- [ ] Enter play mode from editor scene.
- [ ] Isolate runtime mutations from edit-mode scene.
- [ ] Stop play mode and restore edit state.
- [ ] Static export of authored project.
- [ ] Exported app loads without editor code.
- [ ] Browser smoke test for exported app.

## Required End-To-End Test

Add `tests/browser/editor-authoring-v3.spec.ts`:

- [ ] Open editor.
- [ ] Create new project.
- [ ] Import a real glTF asset.
- [ ] Drag asset into scene.
- [ ] Move/rotate/scale with gizmo.
- [ ] Edit material.
- [ ] Add light.
- [ ] Add camera.
- [ ] Add physics collider or script if supported.
- [ ] Enter play mode.
- [ ] Stop play mode.
- [ ] Save project.
- [ ] Reload editor and reopen project.
- [ ] Export static app.
- [ ] Open exported app and verify nonblank WebGL pixels.
- [ ] Store screenshot evidence for editor and exported app.

## Claim Rule

No Unity/Unreal-style authoring claim is allowed until the end-to-end test above passes and the authored app is visually credible.

