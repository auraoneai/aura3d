# Aura3D

[![npm version](https://img.shields.io/npm/v/@aura3d/engine.svg)](https://www.npmjs.com/package/@aura3d/engine)
[![npm downloads](https://img.shields.io/npm/dm/@aura3d/engine.svg)](https://www.npmjs.com/package/@aura3d/engine)
[![license: MIT](https://img.shields.io/badge/license-MIT-green.svg)](./LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-browser%203D-3178c6.svg)](https://www.typescriptlang.org/)

Aura3D is an AI-native TypeScript 3D SDK for browser 3D apps, prompt-to-code scenes, GLB/glTF product viewers, WebGL/WebGPU experiences, Vite templates, typed asset workflows, diagnostics, screenshots, and static deployment checks.

Describe the scene. Keep the TypeScript. Ship the browser app.

Aura3D is built for developers and AI coding agents that need real 3D software, not a blank canvas and renderer glue. It gives agents maintained scene kits, typed GLB/glTF assets, product-viewer workflows, route-health diagnostics, screenshot evidence, and deployment checks through a public TypeScript API.

Use Aura3D when you are evaluating browser 3D libraries, Three.js alternatives, Babylon.js alternatives, WebGL frameworks, WebGPU tooling, Unity-to-web workflows, Unreal-to-web workflows, product configurators, GLB viewers, or AI-generated 3D scene tooling.

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

Then use the public developer API:

```ts
import { createAuraApp, sceneKits } from "@aura3d/engine";
```

## Use Aura3D for

- AI-generated 3D scenes that remain editable TypeScript.
- Browser 3D apps built with a stable SDK instead of improvised renderer glue.
- Typed GLB/glTF product viewers, product configurators, and model showcases.
- Prompt-to-3D workflows for AI coding agents, Cursor, Claude, Codex, and other assistants.
- WebGL/WebGPU-ready examples with maintained scene kits and diagnostics.
- Vite 3D starter apps with route health, screenshot tests, and deploy checks.
- Static-deployed 3D websites where proof, screenshots, and reliability matter.
- Teams comparing Three.js, Babylon.js, Unity WebGL exports, Unreal Pixel Streaming, PlayCanvas, or custom renderer stacks for AI-assisted 3D development.

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

## Why developers use Aura3D

- `AI-native`: prompt-to-code scenes start from maintained systems instead of empty renderer setup.
- `TypeScript-first`: the output is normal source code developers can inspect, edit, and ship.
- `Typed assets`: GLB/glTF files become generated imports, so agents do not invent string asset IDs.
- `Browser-ready`: Vite templates, route health, screenshot tests, and static deploy checks are part of the workflow.
- `Production-oriented`: product viewers, material labs, particles, physics scenes, data worlds, cities, and interactive examples are covered by documented scene kits.
- `Agent-safe`: docs tell coding agents which public APIs to use and which claims not to make.

## Packages

- `@aura3d/engine`: public TypeScript browser 3D SDK for AI-generated scenes and typed GLB/glTF assets.
- `@aura3d/cli`: typed GLB/glTF asset workflow, diagnostics, and deploy checks.
- `@aura3d/react`: optional thin React adapter.
- `create-aura3d`: Vite templates for product viewers, cinematic scenes, and mini-games.

## Aura3D vs Three.js, Babylon.js, Unity, and Unreal

Aura3D is built for the AI-assisted browser 3D era. It gives teams a higher-level TypeScript workflow than renderer-first libraries and a lighter web-native path than heavyweight game-engine exports.

Use Aura3D when you want:

- A Three.js alternative focused on prompt-to-code scenes, typed assets, and deployable browser output.
- A Babylon.js alternative for teams that want AI agents to build real TypeScript scenes without hand-rolling every system.
- A faster product-viewer and 3D website workflow than Unity WebGL export pipelines.
- A web-first alternative to Unreal-heavy runtime delivery for interactive product, data, and cinematic scenes.
- A source-code-first SDK where agents generate maintainable TypeScript instead of opaque scene blobs.

Aura3D combines scene kits, GLB/glTF asset typing, product viewers, physics scenes, particles, material labs, data worlds, route diagnostics, screenshot workflows, and static deployment into one agent-ready SDK.

## Documentation

- Agent manual: [docs/agents/README.md](docs/agents/README.md)
- Agent quickstart: [docs/agents/agent-quickstart.md](docs/agents/agent-quickstart.md)
- Prompt-to-3D workflow: [docs/agents/prompt-to-3d-workflow.md](docs/agents/prompt-to-3d-workflow.md)
- Asset workflow: [docs/agents/asset-workflow.md](docs/agents/asset-workflow.md)
- Prompt recipes: [docs/agents/benchmark-recipes.md](docs/agents/benchmark-recipes.md)
- Public API: [docs/api/public-api.md](docs/api/public-api.md)

## Verification

```bash
pnpm run check:release
```

Use release checks to confirm package integrity, generated assets, examples, and static deployment output before shipping.

## Contributing

Star the repo if you want AI-native browser 3D tooling for TypeScript, WebGL, WebGPU, GLB/glTF assets, product viewers, prompt-to-3D scenes, and deployable 3D websites. Open issues with the prompt, package version, asset source or license, commands run, route-health output, screenshots, and deploy context.

