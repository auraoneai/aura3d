# create-aura3d

Scaffold Vite browser 3D apps with Aura3D, typed GLB/glTF assets, route-health
tests, and screenshot-ready starter templates.

```bash
npx create-aura3d@latest my-scene --template product-viewer
cd my-scene
npm run dev
```

## What It Creates

`create-aura3d` copies a complete starter project that uses public
`@aura3d/engine` imports, generated typed assets from `src/aura-assets.ts`,
browser route-health tests, and template-local project files. Most public
starter templates also include a route README or template notes when the
template needs extra operating guidance.

Use it for:

- GLB/glTF product viewers and product configurators;
- cinematic browser 3D scenes;
- browser-native game prototype routes with input, HUD state, tests, and reset;
- prompt-animation and episode-builder scaffolds;
- animation-studio projects for scene, cast, shot, and render-package workflows.

Aura3D starter templates are source projects. You keep normal TypeScript,
Vite, Playwright tests, and asset manifests after generation.

## Templates

```bash
npx create-aura3d@latest my-product --template product-viewer
npx create-aura3d@latest my-scene --template cinematic-scene
npx create-aura3d@latest my-game --template mini-game
npx create-aura3d@latest my-racer --template racing-starter
npx create-aura3d@latest my-blocks --template falling-blocks-starter
npx create-aura3d@latest my-fighter --template fighting-game
npx create-aura3d@latest my-channel --template animation-channel
npx create-aura3d@latest my-episode --template prompt-animation-channel
npx create-aura3d@latest my-studio --template animation-studio
npx create-aura3d@latest my-builder --template episode-builder
npx create-aura3d@latest my-character --template character-controller
```

Additional three-compat templates are available for explicit migration and
compatibility work:

```bash
npx create-aura3d@latest my-migration --template three-compat-custom-threejs-migration
```

Run `npx create-aura3d@latest --help` for the full template list shipped by
your installed version.

## Typed Assets

Public Aura3D examples should render typed assets, not guessed URLs or raw
model IDs.

Add a local model:

```bash
npx @aura3d/cli@latest assets add ./assets/robot.glb --name robot
```

Or resolve a catalog asset:

```bash
npx @aura3d/cli@latest assets search "battle-worn knight helmet"
npx @aura3d/cli@latest assets resolve "battle-worn knight helmet" --name helmet
```

Then use the generated asset reference:

```ts
import { createAuraApp, lights, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  scene: scene().add(model(assets.helmet)).add(lights.studio())
});
```

## Template Checks

Most templates include:

- `npm run dev` for local Vite development;
- `npm run build` for static output;
- `npm run test` for route-health, screenshot, or gameplay checks;
- `tests/route-health.spec.ts` for browser evidence;
- typed asset guidance in the generated README.

## Public Claim Boundary

The scaffold package is a template and CLI surface. It does not by itself prove
production renderer parity, native WebGPU rendering, full PBR material parity,
postprocess, skinned animation, morph targets, or production-quality game kits.
Only claim those capabilities when the generated route has matching browser
evidence for the exact API path being used.

For public examples, avoid raw `.glb` or `.gltf` URLs, direct `three` imports,
`GLTFLoader`, primitive-only primary subjects for named objects, and CSS or DOM
effects that stand in for rendered Aura3D scene output.

## Links

- Website: https://aura3d.auraone.ai
- Repository: https://github.com/auraoneai/aura3d
- Template docs: https://github.com/auraoneai/aura3d/blob/main/docs/templates/create-aura3d-templates.md
- Engine package: https://www.npmjs.com/package/@aura3d/engine
