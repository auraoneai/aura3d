# Aura3D

Aura3D is the editable scene layer for agent-written browser 3D.

Agents write TypeScript/JavaScript. Users bring assets. Aura3D provides a
stable scene API, typed asset deployment CLI, templates, diagnostics,
screenshots, and static deployment checks.

## Quickstart

```bash
npx create-aura3d@latest my-scene --template product-viewer
cd my-scene
npx @aura3d/cli@latest assets add ./assets/robot.glb --name robot
npm run dev
```

## Hello World

```ts
import { createAuraApp, scene, model, lights } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  scene: scene().add(model(assets.robot)).add(lights.studio())
});
```

## Public Surfaces

- `@aura3d/engine`: `createAuraApp`, `scene`, `model`, `camera`, `lights`,
  `material`, `effects`, `timeline`, `interactions`, diagnostics, screenshots.
- `@aura3d/react`: optional thin React adapter with `AuraCanvas`, `Scene`,
  `Model`, `Camera`, `Lights`, and `Effect`.
- `@aura3d/cli`: `assets add`, `assets validate`, `assets typegen`,
  `assets thumbnail`, `doctor`, `check-deploy`, and `init --agent all`.
- `create-aura3d`: scaffolds `product-viewer`, `cinematic-scene`, and
  `mini-game`.

## Verification

```bash
pnpm run check:release
```

The release gate covers the agent API, asset CLI, agent docs, templates, examples,
devtools, deployment, docs site, bundle-size budgets, and marketing truth.

## Boundary

Aura3D is not an AI model and not an asset store. The public authoring model is
source code plus typed assets.
