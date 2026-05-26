# Editor Diagnostics Workflow

This workflow records the bounded editor evidence for profiler, resource, shader, and viewport overlay diagnostics.

## Steps

1. Start the local browser test server through Playwright.
2. Open `apps/editor/index.html`.
3. Wait for `window.__AURA3D_EDITOR_APP__.getState().status` to become `ready`.
4. Click `Move X` in the viewport toolbar to perform an editor operation through the public runtime command history.
5. Confirm the profiler reports draw calls, triangle count, tracked resources, physics bodies, shader diagnostics, and resource diagnostics.
6. Confirm the viewport HUD reports draw calls and warning count.
7. Capture `editor-workflow-diagnostics.png` as a Playwright test artifact from `tests/visual/editor-workflows.spec.ts`.
8. Capture `editor-app-pixels.png` as a Playwright test artifact from `tests/visual/editor-app-pixels.spec.ts`.

## Verified Boundaries

- The profiler panel reads diagnostics from `EditorRuntime.diagnostics.snapshot()`.
- The viewport updates diagnostics through `EditorRuntime.diagnostics.update(...)` after rendering.
- Resource diagnostics include scene nodes, imported assets, and the selected material shader preview.
- The named editor app pixel spec verifies nonblank overlay pixels, node fill pixels, selected outline pixels, and move-gizmo axis pixels from the editor-authored viewport overlay.
- The integration replay test loads `examples/editor-authored-project/project.json`, rebuilds a scene, serializes it, exports it, and verifies the generated runtime does not load the editor app global.
- Static export `runtime.js` generation is owned by `@aura3d/editor-runtime` through `createStaticExportRuntime()`, then consumed by the editor app exporter.

## Known Limits

- Diagnostics are editor-preview diagnostics, not a GPU vendor profiler.
- Shader diagnostics currently validate the selected material preview inputs and do not compile arbitrary user shader graphs.
- The static exported runtime is still a smoke-test runtime for checked-in authored projects; it is not a production asset bundler.

## Evidence Commands

```sh
pnpm exec vitest run tests/integration/editor-authored-project-replay.test.ts
pnpm exec playwright test tests/visual/editor-workflows.spec.ts
pnpm exec playwright test tests/visual/editor-app-pixels.spec.ts
pnpm typecheck
```
