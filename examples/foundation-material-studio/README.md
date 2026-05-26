# Material Studio Foundation

This example demonstrates the public material workflow for PBR review.

It uses `createMaterialStudioWorkflow()` from `@aura3d/workflows` and renders the returned `source` with the public renderer. The scene includes multiple material types so the screenshot evidence is useful for visual QA, not just a blank smoke test.

Run the browser gate:

```sh
pnpm exec playwright test tests/browser/foundation-examples.spec.ts -g "foundation-material-studio"
```
