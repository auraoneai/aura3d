# Editor Runtime

Version: `0.1.0-alpha.0`

The editor runtime provides browser-first authoring primitives without requiring every consumer to import the full editor UI. The public package is `@galileo3d/engine/editor-runtime`.

## Package Surface

Current exports include:

- command history and undo/redo command primitives;
- editor state storage and runtime snapshots;
- hierarchy, inspector, selection, and picking models;
- translate, rotate, scale, and generic gizmo helpers;
- prefab validation and instantiation helpers;
- material variant workflow state;
- timeline clips/tracks/model data;
- play-mode bridge;
- plugin host and contribution types;
- static export runtime helpers;
- diagnostics overlay models and accessibility/localization fixtures.

## Intended Use

Use editor-runtime when building:

- browser asset or scene editors;
- internal product-scene authoring tools;
- material variant editors;
- lightweight prefab or hierarchy panels;
- static exported previews;
- tests that need editor state without booting the full UI.

The package owns authoring state and commands. It should not own product routing, authentication, framework lifecycle, or renderer internals.

## App Boundary

The full editor UI under `apps/editor` consumes editor-runtime primitives and V9 rendering surfaces. Exported apps should depend on smaller runtime APIs where possible instead of carrying the full editor shell.

## Plugin Boundary

Plugin APIs should expose panels, tools, importers, scripting nodes, and runtime hooks through the plugin host. Plugins should not bypass project serialization, claim verification, or command-history ownership.

## Boundaries

Do not claim:

- Unity/Unreal editor replacement;
- complete visual scripting;
- complete timeline authoring;
- complete profiler/resource inspector;
- stable plugin ABI.

The current editor runtime is best described as an alpha browser authoring foundation with verified command, state, selection, prefab, gizmo, timeline, and export slices.

