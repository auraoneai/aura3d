# Aura Clash

Aura Clash is the flagship Aura3D browser fighting game showcase. It is an original arcade fighter built to demonstrate typed GLB assets, Quaternius-derived character and city assets, cinematic arenas, responsive combat UI, accessibility controls, evidence routes, poster capture scenarios, and deploy-ready TypeScript.

## Routes

- Final public route: `/showcase/aura-clash/`
- `/playable/` launches the playable fighting route with HUD, combat controls, typed GLB scene composition, AI pressure, timer, result states, GitHub link, and npm link.
- `/evidence/` shows developer proof for typed assets, Quaternius provenance, route coverage, controls, animation states, and acceptance gates.
- `/accessibility/` exposes reduced motion, reduced flash, and high contrast controls.
- `/deploy-check/` documents the route and asset readiness checks needed before public promotion.
- `/poster/` defines screenshot and Open Graph capture scenarios.

## Built with the public Aura3D API

Aura Clash uses normal TypeScript against `@aura3d/engine`:

```ts
import { camera, createAuraApp, effects, lights, model, scene } from "@aura3d/engine";
import { assets } from "./src/aura-assets";

const fightScene = scene()
  .add(model(assets.auraClashDuelStage))
  .add(model(assets.fighterMaraVolt))
  .add(model(assets.fighterRookAtlas))
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

The game architecture, typed assets, evidence surfaces, route metadata, readiness checks, and combat systems are implemented. Browser visual QA, screenshot approval, build validation, Vercel deployment, and live URL checks still require explicit approval before this showcase can be declared finished.
