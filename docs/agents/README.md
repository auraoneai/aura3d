# Aura3D Agent Manual

Aura3D is the editable scene layer between AI coding agents and browser 3D.
Agents write TypeScript/JavaScript using `@aura3d/engine`; users bring assets;
the Aura3D CLI validates, hashes, type-generates, screenshots, and deployment
checks the project.

Read these first:

- `llms.txt`
- `docs/agents/benchmark-recipes.md`
- `docs/agents/api-surface.md`
- `docs/agents/asset-workflow.md`
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
