# Starter Template Visual Review

Generated: 2026-05-28

This review records the human visual QA pass for the starter screenshots. It is
separate from the automated pixel-profile checks because a nonblank canvas or a
few colored pixels is not enough proof that the starter matches its prompt.

## Reviewed Artifacts

| Template | Clean-install screenshot | Verdict | Notes |
|---|---|---|---|
| `product-viewer` | `tests/reports/package-clean-install-workspace/templates/product-viewer/demo/tests/reports/screenshot.png` | pass with caveat | Renders a full glTF speaker product in a studio setup with softboxes, warm rim light, shadowing, grille, cabinet, and diagnostics. It is still a stylized starter render, not a photoreal product-marketing render. |
| `cinematic-scene` | `tests/reports/package-clean-install-workspace/templates/cinematic-scene/demo/tests/reports/screenshot.png` | pass | Renders a textured GLB helmet hero, rain streaks, cyan and amber practicals, wet-floor reflections, alley walls, and diagnostics. The screenshot reads as the rainy neon cinematic prompt. |
| `mini-game` | `tests/reports/package-clean-install-workspace/templates/mini-game/demo/tests/reports/screenshot.png` | pass | Renders a distinct robot arena with typed GLB player, board rails, coins, hazard block, laser gate, motion trail, goal portal, and diagnostics. It no longer reads as the generic grid/primitive placeholder. |

## Current Automated Proof

- `pnpm run check:templates` passes.
- `pnpm run check:clean-install` passes.
- Clean-install screenshot profiles are scene-specific:
  - `product-viewer`: cabinet, grille, metal, softbox, warm reflection, center object.
  - `cinematic-scene`: cyan practicals, amber light, rain, wet reflection, center hero, dark alley.
  - `mini-game`: robot armor, robot joints, boost pack, coins, hazard, portal, cyan trail, arena.

## Remaining Visual Caveat

The product-viewer starter is now prompt-aligned and no longer a blank or
generic primitive scene, but it is still the weakest of the three visually. Do
not market it as photorealistic output. Treat it as a compact starter proof that
typed glTF product assets render in a studio scene with screenshots and
diagnostics.
