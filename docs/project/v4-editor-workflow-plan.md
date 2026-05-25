# V4 Editor Workflow Plan

> Historical note: This V4 document is retained as project history after the V9 parity reset. Current planning, claim boundaries, and code-backed parity status live in `docs/project/v9-roadmap-status.md`, `docs/project/v9-roadmap-parity-matrix.md`, and `docs/project/v9-roadmap-three-js-parity-plan.md`. Treat unchecked tasks or old claims here as historical unless they are restated in the V9 docs.


The editor only supports a Unity/Unreal-style workflow claim if it authors a real-looking local app end-to-end.

## Editor App

- [x] Improve viewport layout, navigation, fit-to-selection, grid, selection, outline, and gizmo usability.
- [x] Persist hierarchy operations through save/load/export.
- [x] Persist inspector edits for transform, mesh, material, light, camera, physics, animation, script, audio, and particles.
- [x] Add material editing with real texture slots and live viewport updates.
- [x] Add import settings that affect loaded assets.
- [x] Add prefab/reusable object workflow.
- [x] Add play mode with isolated runtime state and reset on exit.
- [x] Add profiler/debug panels with renderer, physics, animation, script, audio, asset, and error diagnostics.

## Editor-Authored V4 App

Path: `examples/external-editor-authored-app`

- [x] Create the app through the browser editor workflow.
- [x] Include imported model asset.
- [x] Include edited material.
- [x] Include lights and camera.
- [x] Include physics or scripting.
- [x] Include play mode behavior.
- [x] Export as a static local app without editor code.
- [x] Add smoke test for exported app.
- [x] Add screenshot showing visually credible output.

## Tests

- [x] Add Playwright flow: open editor, create project, import asset, place object, edit material, add light/camera, save, reload, enter play mode, export, open exported app.
- [x] Add unit tests for project serialization and static export.
- [x] Add report `tests/reports/external-parity-editor-authoring.json`.

## Claim Boundary

- [x] Allow only "browser-first local authoring workflow" after gates pass.
- [x] Keep "Unity replacement", "Unreal replacement", and broad "Unity/Unreal for the web" blocked.
