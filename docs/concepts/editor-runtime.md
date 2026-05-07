# Editor Runtime

The editor runtime provides browser-first authoring primitives: selection, command history, project serialization, plugin extension points, play mode, import workflows, and static export smoke coverage.

## Runtime Boundary

Editor runtime code owns authoring state and commands. Exported apps should run through a smaller runtime path where possible instead of depending on the full editor UI.

## Plugin Boundary

Plugin APIs should expose panels, tools, importers, and runtime hooks without letting plugins bypass project serialization or claim verification. Public extension points need tests before they are documented as stable.

## Workflow Boundary

The current editor evidence is browser-first. It supports author, save, reload, run, import, and export slices. It does not claim to replace native game editors.

## Current Limits

Visual workflow screenshots, a complete profiler/resource inspector, timeline authoring, and a standalone exported-project runtime package remain incomplete unless separately verified.
