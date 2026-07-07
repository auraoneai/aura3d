# Aura3D 1.4.2 Release Notes

Aura3D 1.4.2 is a developer-positioning and npm-discoverability patch for the
26 public Aura3D packages.

## What Changed

- Rewrote the root README opening around the developer promise: build browser
  3D apps from prompts, real assets, and TypeScript.
- Replaced compliance-first README copy with install-first, outcome-first copy
  for `create-aura3d` and `@aura3d/cli`, the two main npm discovery surfaces.
- Kept the public examples on generated typed assets and public
  `@aura3d/engine` imports while moving detailed claim-boundary language out of
  the first-read sales path.
- Updated npm package metadata and all package/template versions to `1.4.2` so
  npm `latest` shows the refreshed README content instead of the older package
  presentation.

## Developer Story

The package pages now sell the workflow a developer actually wants to try:

```bash
npx create-aura3d@latest my-product --template product-viewer
cd my-product
npm run dev
```

Then add a real model with the CLI and render it through generated TypeScript
asset references:

```bash
npx @aura3d/cli@latest assets add ./assets/sneaker.glb --name sneaker
```

```ts
import { createAuraApp, lights, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

createAuraApp("#app", {
  scene: scene().add(model(assets.sneaker)).add(lights.studio())
});
```

## Claim Boundary

This release does not introduce new renderer, WebGPU, PBR, postprocess,
skinning, morph-target, game-kit, or production-runtime capabilities. It is a
package README, npm metadata, scaffold-version, and developer-positioning patch
on top of the 1.4.x runtime baseline.

## Verification

Prepublish verification for this patch is tracked through the standard package
release gates:

```bash
pnpm verify:api-docs -- --write
pnpm check:agent-docs
pnpm typecheck:raw
pnpm build
pnpm exec vitest run tests/unit/create-aura3d/templates.test.ts --reporter=dot
pnpm verify:package-install-smoke:fresh
pnpm verify:versioned-release
pnpm verify:package-provenance
node tools/release/publish-all.mjs --dry-run
```

Publish command:

```bash
node tools/release/publish-all.mjs
```

Npm auth material must remain outside committed source and must not be printed
in logs.
