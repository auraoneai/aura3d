# Game Slice V3

This example is a small realtime viewport slice built from public A3D APIs.

It uses `createInteractiveSceneWorkflow()` from `@aura3d/workflows` and the public renderer loop. It is not positioned as a full game-engine replacement; it is the minimal proof that the workflow and renderer can power a realtime product surface.

Run the browser gate:

```sh
pnpm exec playwright test tests/browser/foundation-examples.spec.ts -g "foundation-game-slice"
```
