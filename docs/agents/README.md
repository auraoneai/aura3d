# Aura3D Agent Manual

Aura3D Agent Manual: browser 3D SDK for AI coding agents. Use this guide for prompt-to-3D TypeScript apps, typed GLB/glTF assets, scene kits, diagnostics, screenshots, and deploy checks.

Aura3D is the 3D SDK for AI coding agents.

Describe the scene. Bring the GLB. Own the TypeScript.

Aura3D gives agents a product-ready browser 3D surface instead of asking them
to improvise raw renderer glue. Agents write TypeScript/JavaScript using
`@aura3d/engine`; users bring authored GLB/glTF assets; the Aura3D CLI validates,
hashes, type-generates, screenshots, and deployment-checks the project.

The goal is simple: turn a prompt into a real app that a human team can inspect,
edit, build, screenshot, and ship.

## What Aura3D gives an agent

- A small public API for scenes, models, cameras, lights, materials, effects,
  timelines, interactions, physics, particles, charts, cities, characters, and
  product viewers.
- Prompt-plan helpers and scene kits so generated scenes begin with product
  intent instead of disconnected primitives.
- Typed GLB/glTF asset references so agents cannot invent asset URLs.
- Diagnostics, route-health checks, screenshots, and deployment checks so a
  generated scene has to prove it runs.
  scene generator. It is source code plus typed assets.

Read these first:

- `llms.txt`
- `docs/agents/prompt-to-3d-workflow.md`
- `docs/agents/benchmark-recipes.md`
- `docs/agents/api-surface.md`
- `docs/agents/asset-workflow.md`
- `docs/agents/cinematic-scene-quality.md`
- `docs/agents/templates.md`
- `docs/agents/deployment.md`
- `docs/agents/troubleshooting.md`
- `docs/agents/anti-hallucination-rules.md`

Golden path:

```bash
npx create-aura3d@latest my-scene --template product-viewer
cd my-scene
npx @aura3d/cli@latest assets add ./assets/robot.glb --name robot
npm run dev
npm run test
```

Safe asset pattern:

```ts
import { createAuraApp, lights, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  scene: scene().add(model(assets.robot)).add(lights.studio())
});
```

Benchmark rule: if a prompt matches `docs/agents/benchmark-recipes.md`, copy
the smallest matching recipe, run `npm run build`, and stop. Do not run a dev
server, Playwright, browser screenshots, or manual visual verification inside
the benchmark agent process.
