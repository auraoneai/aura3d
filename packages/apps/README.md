# @aura3d/apps

`@aura3d/apps` owns high-level Aura3D app workflow presets for asset viewers,
product configurators, material studios, scene showcases, and interactive
scenes.

## Public API

- `createA3DApp`: creates an app shell with an Aura3D `Engine`, optional
  renderer, quality presets, workflow execution, diagnostics, and disposal.
- `A3D_APP_WORKFLOW_PRESETS`: the supported workflow preset IDs.
- `resolveA3DAppQualityPreset`: resolves draft, balanced, and production-sized
  app quality settings.
- `renderWorkflow(...)`: runs one of the package workflow presets and renders it
  when the app owns a canvas-backed renderer.

## Workflow Presets

- `asset-viewer`
- `product-configurator`
- `material-studio`
- `scene-showcase`
- `interactive-scene`

This package composes `@aura3d/core`, `@aura3d/rendering`, and
`@aura3d/workflows`. It is a workflow/app shell package, not the root
agent-authored `createAuraApp` safe API.

## Verification

Use the package through its exported workflow/app APIs and keep public examples
bounded to the evidence for the workflow being rendered. Root public examples
should still import from `@aura3d/engine` unless the task explicitly targets
workflow internals.
