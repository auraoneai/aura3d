# create-aura3d

Start a real Aura3D browser app in one command.

`create-aura3d` gives you a Vite project with editable TypeScript, typed
GLB/glTF assets, route-health tests, screenshot checks, and deploy-ready
structure. It is built for developers and coding agents that need to move from
prompt to working 3D app without hand-assembling renderer boilerplate.

```bash
npx create-aura3d@latest my-product --template product-viewer
cd my-product
npm run dev
```

## Pick A Starting Point

```bash
npx create-aura3d@latest my-product --template product-viewer
npx create-aura3d@latest my-scene --template cinematic-scene
npx create-aura3d@latest my-game --template mini-game
npx create-aura3d@latest my-racer --template racing-starter
npx create-aura3d@latest my-puzzle --template falling-blocks-starter
npx create-aura3d@latest my-fighter --template fighting-game
npx create-aura3d@latest my-episode --template prompt-animation-channel
npx create-aura3d@latest my-studio --template animation-studio
npx create-aura3d@latest my-character --template character-controller
npx create-aura3d@latest my-migration --template custom-scene
```

Run the full list at any time:

```bash
npx create-aura3d@latest --help
```

## Why Use It

- **You get an app, not a blank canvas.** Templates ship with Vite, source,
  scripts, test files, and `@aura3d/engine@4.0.1` imports wired up.
- **Assets stay typed.** Generated projects use `src/aura-assets.ts` so scene
  code renders `model(assets.product)` instead of guessed URLs or string IDs.
- **Complete 4.0.0 effects & looks built in.** Every scaffold has immediate access to the 28+ `effects.*` post-processing, atmospheric, volumetric, weather, and GPU/CPU particle builders (`effects.bloom`, `effects.ambientOcclusion`, `effects.contactShadows`, `effects.screenSpaceReflections`, `effects.depthOfField`, `effects.volumetricFog`, `effects.particles`, `effects.rain`, `effects.snow`) plus 8 `looks.preset` / `looks.appOptions` art-direction recipes and `game.feel` combat/arcade juice.
- **AI output stays maintainable.** Coding agents can generate scenes while
  developers keep normal TypeScript, package scripts, and browser tests.
- **Proof is part of the starter.** Route-health, screenshot, gameplay, composition, and deploy checks are included out of the box.
- **Static deploys are first-class.** Build output is a browser app you can
  deploy like any Vite project.

Aura3D `4.0.0` scaffolds pin the consolidated `@aura3d/engine@4.0.1` dependency graph across all 24 active public packages (with all `< 4.0.0` versions and legacy compatibility packages deprecated in full on npm).

## Add A Real Model

Add a local GLB/glTF asset:

```bash
npx @aura3d/cli@4.0.1 assets add ./assets/sneaker.glb --name sneaker
```

Or resolve a catalog candidate or Meshy 3D PBR model:

```bash
npx @aura3d/cli@4.0.1 assets search "battle-worn knight helmet"
npx @aura3d/cli@4.0.1 assets resolve "battle-worn knight helmet" --name helmet
```

Then render the generated typed reference with `4.0.0` studio lighting and effects:

```ts
import { createAuraApp, effects, lights, looks, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  ...looks.appOptions("studio-product"),
  scene: scene()
    .add(model(assets.sneaker))
    .add(lights.studio())
    .add(effects.bloom({ intensity: 0.24 }))
    .add(effects.ambientOcclusion({ intensity: 0.35, radius: 0.5 }))
    .add(effects.contactShadows({ opacity: 0.45, blur: 1.6 }))
});
```

## What It Creates

Most templates include:

- `npm run dev` for local Vite development;
- `npm run build` for static output;
- `npm run test` for route-health, screenshot, or gameplay checks;
- `src/main.ts` with public `@aura3d/engine` imports;
- `src/aura-assets.ts` for generated typed asset references;
- template-local test and project files you can keep editing.

## Best For

- product viewers and configurators;
- cinematic 3D landing pages;
- browser-native game prototypes;
- prompt-authored animation channels;
- episode and animation-studio workflows;
- character controller prototypes;
- Three.js migration experiments that need a source-owned starter.

## Links

- Website: https://aura3d.auraone.ai
- Repository: https://github.com/auraoneai/aura3d
- Engine package: https://www.npmjs.com/package/@aura3d/engine
- CLI package: https://www.npmjs.com/package/@aura3d/cli
