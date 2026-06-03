# Aura3D

[![npm version](https://img.shields.io/npm/v/@aura3d/engine.svg)](https://www.npmjs.com/package/@aura3d/engine)
[![npm downloads](https://img.shields.io/npm/dm/@aura3d/engine.svg)](https://www.npmjs.com/package/@aura3d/engine)
[![license: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-browser%203D-3178c6.svg)](https://www.typescriptlang.org/)

Aura3D is an agent-friendly TypeScript browser 3D SDK for prompt-to-code scenes, GLB/glTF product viewers, Vite templates, typed asset workflows, diagnostics, screenshots, and static deployment checks.

Describe the 3D scene. Bring the GLB when you have one. Keep the TypeScript.

Aura3D helps AI coding agents build real browser 3D apps with public TypeScript APIs, generated primitive scene kits, typed GLB/glTF assets, route-health diagnostics, screenshot evidence, and deploy checks. It is not an LLM, not an asset store, and not a hidden scene generator. It is source code plus typed assets.

## Install

Scaffold a browser 3D app:

```bash
npx create-aura3d@latest my-scene --template product-viewer
cd my-scene
npm run dev
```

Install the engine directly:

```bash
npm install @aura3d/engine
```

Add a typed GLB/glTF asset when the prompt includes a real model:

```bash
npx @aura3d/cli@latest assets add ./assets/robot.glb --name robot
```

## Use Aura3D for

- AI-generated browser 3D scenes that remain editable TypeScript.
- Typed GLB/glTF product viewers and product configurators.
- Vite 3D starter apps with route health and screenshot tests.
- Agent-authored scenes with public imports instead of invented APIs.
- Static-deployed 3D apps with asset and deploy checks.
- Prompt-to-3D workflows where screenshots and diagnostics matter.

## 30-second product viewer

```ts
import { createAuraApp, lights, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  scene: scene()
    .add(model(assets.robot))
    .add(lights.studio()),
  diagnostics: { overlay: true }
});
```

The safe API uses generated refs such as `assets.robot`. Do not write `model("robot")`, hand-written GLB URLs, or invented asset ids.

## Prompt-to-3D scene kits

Use scene kits when an AI prompt asks for generated 3D systems rather than a supplied model.

```ts
import { createAuraApp, sceneKits } from "@aura3d/engine";

const kit = sceneKits.physicsPlayground();
createAuraApp("#app", kit.toAppOptions());
console.log(kit.diagnostics, kit.evidence);
```

Maintained scene-kit families include physics playgrounds, particle fountains, solar systems, neon tunnels, 3D data visualizations, mini golf, material labs, city blocks, humanoid walks, and typed product viewers.

## Packages

- `@aura3d/engine`: public agent-facing TypeScript browser 3D SDK.
- `@aura3d/cli`: typed GLB/glTF asset workflow, diagnostics, and deploy checks.
- `@aura3d/react`: optional thin React adapter.
- `create-aura3d`: Vite templates for product viewers, cinematic scenes, and mini-games.

## Aura3D vs manual renderer code

Aura3D is not a drop-in replacement for manual renderer code. Use Aura3D when an AI coding agent needs a smaller, stable, documented scene API, typed GLB/glTF assets, starter templates, diagnostics, screenshots, and deployment checks.

Use manual renderer code when you need full engine-level control, custom renderer internals, the broadest plugin ecosystem, or direct access to every manual renderer code primitive.

Safe positioning: Aura3D is an agent-friendly manual renderer code alternative for prompt-to-code workflows, not a proven blanket manual renderer code replacement or benchmark-superiority claim.

## Documentation

- Agent manual: [docs/agents/README.md](docs/agents/README.md)
- Agent quickstart: [docs/agents/agent-quickstart.md](docs/agents/agent-quickstart.md)
- Prompt-to-3D workflow: [docs/agents/prompt-to-3d-workflow.md](docs/agents/prompt-to-3d-workflow.md)
- Asset workflow: [docs/agents/asset-workflow.md](docs/agents/asset-workflow.md)
- Prompt recipes: [docs/agents/benchmark-recipes.md](docs/agents/benchmark-recipes.md)
- Public API: [docs/api/public-api.md](docs/api/public-api.md)
- manual renderer code comparison: [docs/comparisons/manual renderer code.md](docs/comparisons/manual renderer code.md)
- Claim boundaries: [docs/project/claim-guidelines.md](docs/project/claim-guidelines.md)

## Verification

```bash
pnpm run check:release
```

Release and benchmark claims are evidence-scoped. Internal checks, nonblank screenshots, or self-authored visual QA do not prove that Aura3D beats manual renderer code.

## Contributing

Star the repo if you want agent-friendly browser 3D tooling. Open issues with the prompt, package version, asset source or license, commands run, route-health output, screenshots, and deploy context.

## Boundary

Aura3D can truthfully claim an agent-friendly browser 3D SDK with typed assets, scene kits, diagnostics, screenshots, templates, and deploy checks. Do not claim Aura3D beats manual renderer code, is faster than manual renderer code, is a full manual renderer code replacement, or has passed the frozen external benchmark unless the required neutral benchmark artifacts exist.
