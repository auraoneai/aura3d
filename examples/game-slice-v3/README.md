# Game Slice V3

This example is a small realtime viewport slice built from public G3D APIs.

It uses `createInteractiveSceneWorkflow()` from `@galileo3d/workflows` and the public renderer loop. It is not positioned as a full game-engine replacement; it is the minimal proof that the workflow and renderer can power a realtime product surface.

Run the browser gate:

```sh
pnpm exec playwright test tests/browser/v3-examples.spec.ts -g "game-slice-v3"
```
