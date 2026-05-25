# Interactive Scene V3

This example demonstrates a public interactive workflow with a realtime update loop.

It uses `createInteractiveSceneWorkflow()` and renders the workflow's `update(timeSeconds)` output. The page exposes frame count, draw calls, rendered item count, and the workflow feature checklist for browser tests.

Run the browser gate:

```sh
pnpm exec playwright test tests/browser/foundation-examples.spec.ts -g "foundation-interactive-scene"
```
