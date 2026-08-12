# Aura Clash

Aura Clash Arena is a playable Aura3D fighting showcase proving browser-runtime mechanics with two current, textured, animated Quaternius GLB fighters, input, animation state, combat evidence, screenshots, and deployment checks.

The route uses production-runtime render resources with the advanced-runtime
`A3DRenderer`; it does not make a root `createAuraApp` capability claim or a
current flagship-quality claim.

## Routes

- Promoted route path from the 2026-07-23 release snapshot: `/showcase/aura-clash/`
- `/playable/` launches the playable fighting route with HUD, combat controls, typed GLB scene composition, AI pressure, timer, result states, GitHub link, and npm link.
- `/evidence/` shows developer proof for typed assets, Quaternius provenance, route coverage, controls, animation states, and acceptance gates.
- `/accessibility/` exposes reduced motion, reduced flash, and high contrast controls.
- `/deploy-check/` documents the route and asset readiness checks needed before public promotion.
- `/poster/` defines screenshot and Open Graph capture scenarios.

## Aura3D package surfaces

Aura Clash uses normal TypeScript and includes root `@aura3d/engine` APIs, but
the complete app also imports scoped advanced-runtime, production-runtime,
rendering, scene, and animation package surfaces:

```ts
import { camera, createAuraApp, effects, lights, model, scene } from "@aura3d/engine";
import { assets } from "./src/aura-assets";

const fightScene = scene()
  .add(model(assets.arenaNeonDowntownTextured))
  .add(model(assets.auraClashPlayerRig))
  .add(model(assets.auraClashRivalRig))
  .add(lights.ambient({ color: "#8ee7bd", intensity: 0.36 }))
  .add(camera.perspective({ fov: 42, position: [0, 2.35, 7.4] }));

createAuraApp("#aura-stage", { scene: fightScene });
```

Runtime code must use generated typed assets from `src/aura-assets.ts`. Do not use raw string asset IDs in the safe API.

## Asset pipeline

- Source downloads live outside runtime in `downloads/` and selected extracted assets are staged under `assets/quaternius-source/selected/`.
- Source GLBs are generated into `assets/source/`.
- Public registered assets are generated into `public/aura-assets/`.
- Provenance is tracked in `assets/quaternius-asset-provenance.json`.
- Typed assets are generated in `src/aura-assets.ts`.

Useful scripts:

```bash
npm run assets:stage
npm run assets:build
npm run assets:register
npm run assets:provenance
npm run assets:check
npm run routes:check
```

## Controls

- `A` / `D`: move
- `Space`: jump
- `Shift`: dash
- `Q`: guard
- `J`: light attack
- `K`: heavy attack
- `L`: Aura Burst special
- `R`: restart round
- `P`: pause or resume round

## Current completion boundary

The game architecture, current typed fighters, source-archive provenance, evidence surfaces, route metadata, readiness checks, combat systems, mounted browser gameplay proof, and local visual-regression proof are implemented. Public promotion still requires approval of the exact final screenshots and verification of the deployed production URL; local evidence is not a deployment claim.
