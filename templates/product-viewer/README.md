# Aura3D Product Viewer

Agent-friendly product scene starter on the public `@aura3d/engine` API.

```bash
npm install
npm run dev
npx @aura3d/cli@latest assets add ./assets/product.glb --name product
npm run test
```

Edit `src/main.ts` to change the camera, plinth, typed product, and diagnostics.
Do not invent asset paths; after `assets add`, use `assets.product` from
`src/aura-assets.ts`.

The default scene composes the product on a plinth under the `product-studio`
look (studio HDRI, key light, neutral backdrop, grade) with `camera.frameAsset`
orbit autoframing — the subject fills 45–70% of frame height. Orbit interaction
is the only pointer control. It does not install physics, navigation, editor,
or Node-media systems.
