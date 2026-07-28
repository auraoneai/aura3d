# Aura3D Showcase Material and Asset Inspector

Retained material and asset inspection route for the Aura3D showcase build.

## Remediation Status

- Classification: removed-from-public-showcase; retained as a typed-asset
  inspection tool because Product Configurator already promotes the same
  headphone hero.
- Route health: `apps/showcase-material-asset-inspector/route-health.json`.
- Asset status: inspected subject is the typed GLB
  `assets.showcaseHeadphones`.
- Current proof: retained route-primary evidence passes for
  `assets.showcaseHeadphones`, and launch deploy/release validation passes for
  the same typed product asset. Those lower-level proofs do not override the
  unpromoted classification.
- Primitive status: comparison samples, rails, layer proxies, and inspection
  guides are diagnostic staging only.
- Claim status: bounded to generated asset/material metadata. Do not claim full
  production PBR parity, external asset editing, or private loader behavior
  without separate pixel-backed tests.

## Route

- Path: `/apps/showcase-material-asset-inspector/`
- Entry: `src/main.ts`
- Evidence global: `window.__AURA3D_SHOWCASE_MATERIAL_ASSET_INSPECTOR__`

## Asset Workflow

The route imports the shared typed root asset:

```ts
import { assets } from "../../../src/aura-assets";
model(assets.showcaseHeadphones);
```

No raw GLB URLs, invented string asset ids, Three.js imports, or loader code are
used. The inspected model is `assets.showcaseHeadphones`, and this app does not
edit the shared root `src/aura-assets.ts`.

## Controls

- View modes: comparison, asset, material grid, exploded preview.
- Lighting modes: material lab, studio, metal, glass.
- Readiness panel: typed asset, license, materials, textures, and animation note.
- Extension panel: PBR path, texture slots, skeleton status, and morph target status.

## Evidence

The route publishes:

- Typed asset id, URL, hash, license, author, material names, texture count, node count, and bounds.
- Material inspector panels from `material.inspector(...)`.
- Material visual QA from `material.visualQA(...)`.
- Scene evidence from `collectAuraSceneEvidence(...)`.
- Route health and runtime diagnostics from the mounted `createAuraApp(...)` instance.

Procedural geometry is limited to material comparison spheres, inspection rails,
exploded preview layers, labels, and lighting/staging. The typed GLB remains the
only product asset in the route.

## Claim Boundary

This route retains a passing route-primary probe and deploy/release asset
validation for `assets.showcaseHeadphones`, but it is unpromoted to avoid
duplicating Product Configurator's hero. It must not be presented as a current
public candidate, production PBR parity, a DCC replacement, or a native
renderer/material parity proof.
