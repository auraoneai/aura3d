# @aura3d/cli

Bring real 3D assets into a browser app without losing types, provenance, or
shipping confidence.

`@aura3d/cli` is the Aura3D command center for GLB/glTF projects. It finds
usable assets, copies local models into the right public path, records source
and license metadata, generates TypeScript references, validates game and
animation requirements, captures screenshots, and checks deploy output.

```bash
npx @aura3d/cli@latest doctor
```

## Why Developers Install It

- Real models, not placeholder primitives: add local GLB/glTF files or resolve
  catalog candidates into a typed asset manifest.
- TypeScript references by default: routes import `assets.robot` instead of
  hard-coded URLs that break later.
- Provenance travels with the app: source, license, quality, role, and hash
  metadata stay in `aura.assets.json`.
- Game and animation checks are built in: inspect clips, humanoid structure,
  fighting-character requirements, category-specific game geometry, and release readiness from the same tool.
- Certified game assets fail closed: racing tracks and platformer worlds need current hash-bound geometry probes, while route evidence binds the selected pair to retained screenshots and validator reports.
- Deployment is part of the workflow: validate assets, screenshots, and `dist`
  output before you publish.

## Add A Model

```bash
npx @aura3d/cli@latest assets add ./assets/robot.glb --name robot
npx @aura3d/cli@latest assets typegen
```

Then render the generated asset reference from a public Aura3D route:

```ts
import { createAuraApp, lights, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  scene: scene().add(model(assets.robot)).add(lights.studio())
});
```

## Find A Catalog Asset

```bash
npx @aura3d/cli@latest assets search "battle-worn knight helmet"
npx @aura3d/cli@latest assets resolve "battle-worn knight helmet" --name helmet
npx @aura3d/cli@latest assets typegen
```

`resolve` brings the chosen catalog result into the same typed local pipeline,
so the rest of the app still uses `model(assets.helmet)`.

## Command Shortlist

```bash
npx @aura3d/cli@latest assets add ./model.glb --name model
npx @aura3d/cli@latest assets search "studio robot" --json
npx @aura3d/cli@latest assets resolve "studio robot" --name robot
npx @aura3d/cli@latest assets inspect ./model.glb --animation --humanoid
npx @aura3d/cli@latest assets validate --source --release
npx @aura3d/cli@latest assets validate-game --profile fighting-character --asset fighter
npx @aura3d/cli@latest assets validate-animation --clips idle,walk,run
npx @aura3d/cli@latest assets certify-game-geometry --asset track --category racing
npx @aura3d/cli@latest assets bind-game-route-evidence --route my-race --category racing --assets car,track --screenshot tests/reports/route.png --geometry-report tests/reports/topology.json --composition-report tests/reports/composition.json --visual-review docs/visual-review.json
npx @aura3d/cli@latest assets assemble-character --name hero --body heroBody --part hair=heroHair
npx @aura3d/cli@latest check-deploy --dist dist
npx @aura3d/cli@latest init --agent all
```

## What It Writes

- `aura.assets.json`: asset manifest with source, license, quality, role, provenance, hash metadata, retained probes, and optional hash-bound `gameGeometry` certification/evidence.
- `src/aura-assets.ts`: generated TypeScript asset references for your routes.
- Public asset files under the configured app asset directory.

## Best With

- `create-aura3d`: start a Vite browser 3D app with templates for product
  viewers, cinematic scenes, animation workflows, and games.
- `@aura3d/engine`: render typed assets through the public `createAuraApp`
  browser API.

## Links

- Website: https://aura3d.auraone.ai
- Repository: https://github.com/auraoneai/aura3d
- Engine package: https://www.npmjs.com/package/@aura3d/engine
- Scaffolder package: https://www.npmjs.com/package/create-aura3d
