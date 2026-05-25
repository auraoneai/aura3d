# Tutorial: Material Studio V3

This tutorial maps to `examples/foundation-material-studio`. It demonstrates a public material review workflow that creates PBR, textured PBR, and normal-mapped render items.

## Core API

```ts
import { createMaterialStudioWorkflow } from "@galileo3d/workflows";

const workflow = createMaterialStudioWorkflow({ mode: "comparison" });
renderer.render(workflow.source, workflow.camera);
```

## What The Workflow Covers

- PBR material setup.
- Textured PBR material setup.
- Normal map material setup.
- Environment lighting and postprocess.
- A feature checklist for app diagnostics and browser evidence.

## Verification

```sh
pnpm exec playwright test tests/browser/foundation-examples.spec.ts -g "foundation-material-studio"
```
