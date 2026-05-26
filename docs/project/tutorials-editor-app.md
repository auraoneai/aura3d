# Tutorial: Browser Editor Workflow

This tutorial uses the current editor runtime and browser editor examples. It covers the verified browser-first workflow: author, save, reload, run, import, and export.

## Run The Examples

For the runtime validation example, open:

```text
/examples/09-editor-runtime/index.html
```

For the fuller editor app workflow, use the browser tests:

```sh
pnpm exec playwright test tests/browser/editor-app.spec.ts tests/browser/editor-import-workflow.spec.ts tests/browser/editor-play-mode.spec.ts tests/browser/editor-exported-project.spec.ts
```

## What It Uses

- `@aura3d/editor-runtime` for selection, commands, history, project state, and play-mode coordination.
- `@aura3d/editor` for browser editor UI workflows.
- Static exported project output for browser smoke validation.

## Implementation Shape

Authoring changes should flow through commands so save/reload and undo/redo observe the same state:

```ts
editor.execute(command);
const projectJson = editor.saveProject();
const restored = editor.loadProject(projectJson);
```

Directly mutating editor state outside commands should be limited to test fixtures or internal setup code.

## Current Limits

The current claim is browser-first authoring, not a Unity or Unreal replacement. Timeline authoring, a complete profiler/resource inspector, screenshot-rich workflow docs, and a standalone exported-project runtime package remain incomplete.
