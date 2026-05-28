# Starter Template Visual Review

Generated: 2026-05-28

This review records the current human visual QA pass for the starter
screenshots. The result is intentionally stricter than the automated
pixel-profile checks: a nonblank canvas, a GLB in frame, or a few colored pixels
is not enough proof that a prompt created a polished visual result.

## Reviewed Artifacts

| Template | Clean-install screenshot | Verdict | Notes |
|---|---|---|---|
| `product-viewer` | `tests/reports/package-clean-install-workspace/templates/product-viewer/demo/tests/reports/screenshot.png` | technical pass / product-quality gap | Renders a full glTF speaker product in a studio setup with softboxes, warm rim light, shadowing, grille, cabinet, and diagnostics. This proves typed GLB rendering and a starter studio layout. It is not product-quality proof that a prompt creates a polished product hero. |
| `cinematic-scene` | `tests/reports/package-clean-install-workspace/templates/cinematic-scene/demo/tests/reports/screenshot.png` | technical pass / product-quality gap | Renders a textured GLB helmet hero with rain strokes, cyan and amber practicals, a wet floor, alley walls, and diagnostics. It is materially better than the old placeholder grid, but still reads as an imported object plus symbolic effects rather than a fully art-directed cinematic result. |
| `mini-game` | `tests/reports/package-clean-install-workspace/templates/mini-game/demo/tests/reports/screenshot.png` | technical pass / product-quality gap | Renders a distinct robot arena with typed GLB player, board rails, coins, hazard block, laser gate, motion trail, goal portal, and diagnostics. It proves a basic game-scene scaffold, not a visually compelling playable demo. |

## Current Automated Proof

- `pnpm run check:templates` passes.
- `pnpm run check:clean-install` passes.
- Clean-install screenshot profiles are scene-specific:
  - `product-viewer`: cabinet, grille, metal, softbox, warm reflection, center object.
  - `cinematic-scene`: cyan practicals, amber light, rain, wet reflection, center hero, dark alley.
  - `mini-game`: robot armor, robot joints, boost pack, coins, hazard, portal, cyan trail, arena.

## Product Quality Boundary

These screenshots are not product-quality proof. They prove the current
templates can render GLB assets, lights, diagnostics, and basic scene cues. They
do not prove that Aura3D can take an arbitrary prompt and create a visually
desirable scene.

Current failure mode: the images can still be read as one imported object plus
symbolic effects. Rain can be perceived as lines. Cinematic lighting can be
perceived as colored bars. A game arena can be perceived as primitive shapes
around a robot. That is not enough for the product promise.

The next acceptance bar is defined in
`docs/project/prompt-visual-quality-gap.md`. Until that bar is met, treat these
screenshots as render-plumbing evidence only.
