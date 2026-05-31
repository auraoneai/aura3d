# Aura3D Product Viewer

Agent-friendly product scene starter using the public `@aura3d/engine` API.

```bash
npm install
npm run dev
npx @aura3d/cli@latest assets add ./assets/product.glb --name product
npm run test
```

Edit `src/main.ts` to change camera, material, lights, and diagnostics. Do not
invent asset paths; after `assets add`, use `assets.product` from
`src/aura-assets.ts`. The default scene uses `prefabs.productStage()` so a
replacement product keeps the plinth, contact shadow, fit-to-bounds brackets,
softboxes, reflection cards, and turntable/orbit evidence.
