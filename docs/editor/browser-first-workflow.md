# Browser-First Editor Workflow

This document scopes the current Galileo3D editor application to a browser-first TypeScript authoring workflow. It is not a claim that the project replaces broad native game editors or high-end DCC pipelines.

## Current Verified Workflow

The checked editor slice supports a bounded authoring loop:

- Open `apps/editor/index.html` through the local browser test server.
- Create, select, rename, delete, and reparent scene nodes in the hierarchy panel.
- Edit transform, material, light, camera, physics, and script fields in the inspector.
- Import the built-in sample glTF asset, review import settings, and place the imported asset into the scene.
- Pick and move a selected scene node in the viewport.
- Inspect profiler, resource, shader/material, and viewport HUD diagnostics sourced from `EditorRuntime.updateDiagnostics()` and `EditorRuntime.diagnosticsSnapshot()`.
- Save and reload a versioned project JSON document.
- Enter and exit play mode with project snapshot restore.
- Export the scene as static `index.html`, `project.json`, and `runtime.js` files.
- Replay and run the checked-in exported sample from `examples/editor-authored-project`.

All editor UI operations in `apps/editor/src` are routed through public `EditorRuntime` APIs. The shell and panels use `select`, `currentSelection`, `clearSelection`, `setPickTargets`, `pick`, `translateTarget`, `updateDiagnostics`, `diagnosticsSnapshot`, and command execution methods instead of reaching into runtime selection, command-history, picking, gizmo, or diagnostics internals.

The checked-in `examples/editor-authored-project/project.json` includes `metadata.provenance` with the editor workflow name, runtime package, ordered authoring operations, and deterministic `evidenceHash` `g3d-prov-29e66ba9`. `ProjectSerializer.verifyEditorAuthoredProvenance()` validates that log, requires `EditorRuntime.*` operations plus static export evidence, and rejects hash mismatches.

Current verification:

- `npx playwright test tests/browser/editor-app.spec.ts tests/browser/editor-import-workflow.spec.ts tests/browser/editor-play-mode.spec.ts tests/browser/editor-exported-project.spec.ts`
- `npx playwright test tests/visual/editor-workflows.spec.ts tests/visual/editor-app-pixels.spec.ts`
- `npx -y -p vitest@3.1.3 vitest run tests/unit/editor/project-serializer.test.ts tests/unit/editor/plugin-api.test.ts tests/integration/project-save-load.test.ts tests/integration/editor-authored-project-replay.test.ts`
- `npx -y -p vitest@3.1.3 vitest run tests/unit/editor/public-runtime-boundary.test.ts`
- `pnpm typecheck`

The diagnostics workflow and screenshot capture steps are documented in `docs/editor/diagnostics-workflow.md`.

## Plugin Surface

The current plugin host is intentionally small. Plugins can register:

- panels;
- tools;
- importers;
- scripting node descriptors.

The API is a registry and discovery surface for editor UI composition. It does not yet provide sandboxing, async activation hooks, package loading, plugin version negotiation, or compatibility guarantees.

## Static Export Scope

The static export workflow generates a minimal runtime that can display the authored project without loading the editor shell. The export HTML/runtime string generation is owned by `@galileo3d/editor-runtime` (`createStaticExportHtml()` and `createStaticExportRuntime()`), and the editor app exporter packages those strings with the saved project JSON. It is suitable for smoke testing project save/load/export wiring.

The current export is not a full build pipeline. It does not bundle external assets, optimize textures, code-split scripts, emit deployment manifests, or integrate with hosting providers.

## Prefab And Composition Status

Prefab and reusable composition authoring are future work. The current project format stores scene nodes, parent relationships, transform values, and authoring fields directly in one versioned JSON document.

Before prefab claims are made, the editor needs:

- a prefab or composition schema;
- instance override tracking;
- nested composition validation;
- migration tests;
- authoring UI for creating, applying, and unpacking prefabs.

## Claim Boundary

The allowed wording for this slice is:

> Galileo3D has a browser-first editor prototype slice for TypeScript-centric scene authoring, project JSON save/load, play-mode snapshot restore, and static export smoke testing.

Do not describe the current editor as production-ready, as a broad native-editor replacement, or as evidence for a general Unity or Unreal replacement claim. Any future competitive claim must remain limited to browser-first TypeScript workflows and must cite current browser tests, exported-project smoke tests, known limits, and comparison evidence.
