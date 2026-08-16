# Getting Started

Version: 2.0.3

## Install

```sh
pnpm install
```

## Run The Local App Registry

```sh
pnpm exec vite --host 127.0.0.1 --port 5181 --strictPort
```

Open:

```text
http://127.0.0.1:5181/
```

## Useful Routes

Use the root registry at `http://127.0.0.1:5181/`. It is the single allowlist for local browser examples.

Current route groups are classified by evidence, not by how impressive the
title sounds:

- public root API examples that import from `@aura3d/engine`;
- showcase candidates that have route-health, typed asset, screenshot, and
  source-validation evidence;
- prototypes and diagnostics that must stay labeled as such;
- blocked or hidden routes that must not be used as public proof.

The legacy `examples/` tree and older standalone app route folders are pruned from the current checkout.

## Run The Marketing Site

The local marketing app embeds real routes from the root registry. Start the registry on port `5181`, then run:

```sh
cd marketing
npm run dev
```

Marketing route embeds use `data-route`, `data-demo`, and `data-quality="marketing"` attributes. The loader only starts the hero eagerly, lazy-loads below-fold stages, and limits concurrent iframe startup so heavy GLB/HDR routes do not compete with every other embedded route. See [Marketing Site](marketing-site.md).

## Minimal Public SDK Example

Acquire a real asset first:

```bash
npx @aura3d/cli@latest assets add ./assets/model.glb --name model
```

Then render the generated typed asset through the public root API:

```ts
import { camera, createAuraApp, lights, model, scene } from "@aura3d/engine";
import { assets } from "./src/aura-assets";

createAuraApp("#app", {
  scene: scene()
    .add(model(assets.model).position(0, 0, 0))
    .add(lights.studio())
    .camera(camera.perspective({ position: [2.5, 1.8, 3], target: [0, 0.8, 0] }))
});
```

Do not import `@aura3d/engine/advanced-runtime`, rendering internals,
`GLTFLoader`, or `three` in public examples. Those paths can be useful for
library development, but they are not proof that the public root API supports a
feature.

WebGL2 remains the default root quick-start backend. Native WebGPU can only be
claimed when adapter, backend, dispatch, render, telemetry, and screenshot
evidence all pass; otherwise the route must label its fallback honestly.

## Verify

```sh
pnpm typecheck
pnpm test:unit
pnpm test:browser
```

Run parity/report generators when evaluating claims:

```sh
pnpm webgpu
```
