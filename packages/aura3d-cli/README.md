# @aura3d/cli

Aura3D CLI for typed GLB/glTF assets, asset provenance, validation,
diagnostics, screenshots, and deploy checks.

```bash
npx @aura3d/cli@latest doctor
```

## Asset Workflow

Add a local GLB/glTF asset and generate typed references:

```bash
npx @aura3d/cli@latest assets add ./assets/robot.glb --name robot
npx @aura3d/cli@latest assets typegen
```

Search the Aura3D asset catalog:

```bash
npx @aura3d/cli@latest assets search "battle-worn knight helmet"
```

Resolve a verified catalog candidate into the local typed asset pipeline:

```bash
npx @aura3d/cli@latest assets resolve "battle-worn knight helmet" --name helmet
```

Then render the generated asset reference from a public Aura3D route:

```ts
import { createAuraApp, lights, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  scene: scene().add(model(assets.helmet)).add(lights.studio())
});
```

## Commands

Common commands:

```bash
npx @aura3d/cli@latest assets add ./model.glb --name model
npx @aura3d/cli@latest assets search "studio robot" --json
npx @aura3d/cli@latest assets resolve "studio robot" --name robot
npx @aura3d/cli@latest assets inspect ./model.glb --animation --humanoid
npx @aura3d/cli@latest assets validate --source --release
npx @aura3d/cli@latest assets validate-game --profile fighting-character --asset fighter
npx @aura3d/cli@latest assets validate-animation --clips idle,walk,run
npx @aura3d/cli@latest assets assemble-character --name hero --body heroBody --part hair=heroHair
npx @aura3d/cli@latest check-deploy --dist dist
npx @aura3d/cli@latest init --agent all
```

## What It Writes

The asset commands maintain:

- `aura.assets.json` for asset manifest, source, license, quality, role, and
  provenance metadata;
- `src/aura-assets.ts` for generated TypeScript asset references;
- copied asset files under the configured public asset directory.

Public Aura3D examples should use generated `assets.name` references and
`model(assets.name)`. Avoid raw `.glb` or `.gltf` URLs, guessed model IDs,
direct loader code, and primitive-only primary subjects for named real objects.

## Package Roles

- `@aura3d/cli`: asset pipeline, validation, provenance, diagnostics, and
  deploy checks.
- `create-aura3d`: Vite starter scaffolds.
- `@aura3d/engine`: public browser 3D runtime APIs such as `createAuraApp`.

The CLI proves CLI asset-pipeline behavior. Renderer, game, animation, WebGPU,
PBR, postprocess, skinning, and morph-target claims still need matching browser
or package evidence for the exact API path being claimed.

## Links

- Website: https://aura3d.auraone.ai
- Repository: https://github.com/auraoneai/aura3d
- Engine package: https://www.npmjs.com/package/@aura3d/engine
- Scaffolder package: https://www.npmjs.com/package/create-aura3d
