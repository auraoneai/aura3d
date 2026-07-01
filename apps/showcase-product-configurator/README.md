# Aura3D Showcase Product Configurator

Public typed-product configurator candidate for the Aura3D showcase build.

## Remediation Status

- Classification: candidate; public showcase status is allowed by current retained evidence.
- Route health: `apps/showcase-product-configurator/route-health.json`.
- Asset status: primary product is the typed GLB `assets.showcaseHeadphones`.
- Route-primary status: retained evidence now passes for
  `assets.showcaseHeadphones`.
- Deploy/release status: `assets.showcaseHeadphones` passes release deploy
  validation through a hash-bound manifest orientation override tied to the
  retained route-primary product-view probe. This does not claim the source GLB
  embeds `aura3d.orientation.forwardAxis`.
- Primitive status: showroom staging is allowed, but exploded internals are
  conceptual proxy primitives and must not be described as authored product
  internals.
- Claim status: bounded to a typed product configurator, generated asset
  metadata, retained route-primary evidence, and deploy validation for the
  declared primary asset.

## Route

- Path: `/apps/showcase-product-configurator/`
- Entry: `src/main.ts`
- Evidence global: `window.__AURA3D_SHOWCASE_PRODUCT_CONFIGURATOR__`

## Asset Workflow

The route imports the shared typed root asset:

```ts
import { assets } from "../../../src/aura-assets";
model(assets.showcaseHeadphones);
```

No raw GLB URLs, invented asset ids, Three.js imports, or loader code are used.
The product subject is `assets.showcaseHeadphones`, a CC-BY-4.0 headphones GLB
registered by the Aura3D CLI in the root typed asset file. This app does not edit
`src/aura-assets.ts`.

## Controls

- Variant segmented control: Graphite, Ceramic, Copper.
- Finish swatches: Satin, Gloss, Titanium.
- Part focus: overview, earcups, headband, cushions.
- Exploded mode: procedural part proxy staging around the typed asset.
- Turntable: toggles the Aura scene turntable animation.

## Evidence

The route publishes:

- Typed asset id, URL, hash, license, author, material count, texture count, and bounds.
- Product diagnostics from `product.diagnostics(...)`.
- Visual QA from `product.visualQA(...)`.
- Scene evidence from `collectAuraSceneEvidence(...)`.
- Route health and runtime diagnostics from the mounted `createAuraApp(...)` instance.

Procedural geometry is limited to showroom staging, focus halos, exploded part
proxies, swatches, and metric plinths. The evidence global explicitly states
that these are not authored GLB parts.

## Claim Boundary

This route may be presented as a public typed product-configurator candidate
because route-primary evidence and release/deploy asset validation pass for
`assets.showcaseHeadphones`. It must not be presented as launch-ready commerce,
public marketing quality, or a complete authored exploded-internals product
configurator. The source GLB still does not embed a `forwardAxis`; the accepted
orientation evidence is a hash-bound product-view manifest override tied to the
retained route-primary probe.
