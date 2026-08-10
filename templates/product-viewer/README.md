# Aura3D Product Viewer

Agent-friendly product scene starter using the public `@aura3d/lean/product`
API.

```bash
npm install
npm run dev
npx @aura3d/cli@latest assets add ./assets/product.glb --name product
npm run test
```

Edit `src/main.ts` to change the camera, material, studio environment, plinth,
typed product, and diagnostics. Do not
invent asset paths; after `assets add`, use `assets.product` from
`src/aura-assets.ts`. The default scene composes the product, plinth, floor,
studio environment, and orbit interaction directly through the lean product
entry. It does not install physics, navigation, editor, or Node-media systems.
