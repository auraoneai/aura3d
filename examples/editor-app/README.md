# Editor App

The browser editor application lives under `apps/editor`. This example entry documents how to find the editor-facing workflow from the examples index without treating it as an externally hosted product.

## Run

Open the editor app through the local development workflow used by the browser tests:

```text
apps/editor/index.html
```

Related checked evidence:

- `tests/browser/editor-app.spec.ts`
- `tests/browser/editor-import-workflow.spec.ts`
- `tests/browser/editor-play-mode.spec.ts`
- `tests/browser/editor-exported-project.spec.ts`
- `tests/visual/editor-app-pixels.spec.ts`
- `tests/visual/editor-workflows.spec.ts`

## Current Boundary

The editor app is a browser-first authoring slice with hierarchy, inspector, import, play mode, profiler/debug, plugin, and export evidence. It is not evidence for broad Unity/Unreal workflow parity outside the scoped v2 claim language.
