# Tagline check, run 2: hero candidates (2026-10-27)

Run `tagline2-*` on the remote ACR runner, same spec and builder as run 1 (`../README.md`), software WebGL2. Playwright exit 0 (1 passed, 9.0 min). `summary.log` holds the build and render lines; `frames/` holds every frame. The combined `results.json` did not reassemble from the log this time (one base64 chunk was damaged), so the numbers below come from `summary.log`.

New apps, all built on the stock `create-aura3d@4.3.5` product-viewer scaffold, all typecheck and build:

| App | Source | Lines | Frame |
|---|---|---|---|
| `aura-hero` | `tools/bench-vs-threejs/tagline/aura-variants/hero.ts` | 10 | Product framed at about 55% of frame height, centred, on the light studio backdrop; orbit enabled |
| `aura-hero-no-appoptions` | `.../hero-no-appoptions.ts` | 9 | Identical stats to `aura-hero` (mean 205.5, std 36.3) |
| `aura-hero-floor` | `.../hero-floor.ts` | 11 | Same framing plus a dark studio floor below the horizon (mean 114.3, std 78.2) |
| `aura-template-stock` | the scaffold's own `src/main.ts` | 81 | Plinth and deck under the product, light backdrop above (mean 132.4, std 84.4) |

Reference apps re-run unchanged: `aura-hello` 6 lines (small product, light backdrop), `three-minimal` 38 lines (no orbit controls), `three-look` 55 lines (no orbit controls), `aura-cube` 18 lines.

Findings:

- `camera.frameAsset` plus `model(..., { targetHeight })` fixes the framing gap from run 1: 10 lines give a framed, shadowed, orbitable product.
- The light backdrop is by design: `environments.hdri` draws its studio HDRI as the backdrop by default, and the `product-studio` look keeps that (a solid colour there would be the "solid void" the `look/solid-void` lint flags). It is the same in every Aura3D variant, including the shipped template. A floor plane gives the darker lower half. The solid `#2b2f36` in the three.js apps is the look's fallback colour, so the backdrops differ; the line counts do not change if the three.js apps show the same HDRI.
- `looks.appOptions` made no visible difference at DPR 1 on this runner.
