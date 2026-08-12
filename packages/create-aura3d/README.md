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
npx create-aura3d@latest my-migration --template three-compat-custom-threejs-migration
```

Run the full list at any time:

```bash
npx create-aura3d@latest --help
```

## Why Use It

- **You get an app, not a blank canvas.** Templates ship with Vite, source,
  scripts, test files, and Aura3D imports wired up.
- **Assets stay typed.** Generated projects use `src/aura-assets.ts` so scene
  code renders `model(assets.product)` instead of guessed URLs or string IDs.
- **AI output stays maintainable.** Coding agents can generate scenes while
  developers keep normal TypeScript, package scripts, and browser tests.
- **Proof is part of the starter.** Route-health, screenshot, gameplay, composition, generated geometry-contract, or template checks are included where the template needs them.
- **Game routes fail closed.** Public racing/platformer generation uses certified assets and compiler-emitted geometry contracts rather than guessed route-local rectangles or centerlines.
- **Static deploys are first-class.** Build output is a browser app you can
  deploy like any Vite project.

Aura3D 2.0 verifies all 19 registered templates twice: 149/149 checks against
workspace source and 149/149 checks in clean projects that install the exact
packed 2.0.0 dependency graph. Those lifecycles cover install, typecheck,
production build, browser load, meaningful interaction, static preview,
screenshot, route health, and deploy behavior. They prove the scaffold
contracts, not universal visual quality or Three.js ecosystem parity.

## Add A Real Model

Add a local GLB/glTF asset:

```bash
npx @aura3d/cli@latest assets add ./assets/sneaker.glb --name sneaker
```

Or resolve a catalog candidate:

```bash
npx @aura3d/cli@latest assets search "battle-worn knight helmet"
npx @aura3d/cli@latest assets resolve "battle-worn knight helmet" --name helmet
```

Then render the generated typed reference:

```ts
import { createAuraApp, lights, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  scene: scene().add(model(assets.sneaker)).add(lights.studio())
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
