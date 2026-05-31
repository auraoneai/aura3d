# Asset Workflow

Aura3D is an asset pipeline, not an asset catalog. Put user-approved files in
the project, then run:

```bash
npx @aura3d/cli@latest assets add ./assets/robot.glb --name robot
npx @aura3d/cli@latest assets validate
```

The CLI writes:

- `aura.assets.json`
- hashed files under `public/aura-assets/`
- thumbnails under `public/aura-assets/`
- `src/aura-assets.ts`

Agents should read `src/aura-assets.ts` before writing scene code.

For product-viewer prompts, use the generated typed ref directly:
`model(assets.product)` or `model(assets.sneaker)`. Do not use raw string ids
such as `model("sneaker")`; add the file with `assets add` first, then import
the generated `assets` object.
