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
`model(assets.product)` or the exact generated key in `src/aura-assets.ts`.
Do not use raw string ids such as `model("product")`; add the file with
`assets add` first, then import the generated `assets` object. A correct
hard-prompt product workflow is:

```bash
npx @aura3d/cli@latest assets add ./assets/product.glb --name product
sed -n '1,120p' src/aura-assets.ts
```

```ts
import { model, prefabs, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

scene()
  .addMany(prefabs.productStage())
  .add(model(assets.product).position(0, 0.54, -0.65).animate({ clip: "turntable", speed: 0.42 }));
```

If the generated module does not contain the expected asset key, stop and fix
the asset import. Do not fall back to a made-up id, string URL, or placeholder
path.
