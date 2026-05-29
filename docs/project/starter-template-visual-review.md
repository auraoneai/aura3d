# Starter Template Visual Review

Generated: 2026-05-29

This review records the current human visual QA pass for the starter
screenshots. The result is intentionally stricter than the automated
pixel-profile checks: a nonblank canvas, a GLB in frame, or a few colored pixels
is not enough proof that a prompt created a polished visual result.

## Reviewed Artifacts

| Template | Clean-install screenshot | Verdict | Notes |
|---|---|---|---|
| `product-viewer` | `tests/reports/package-clean-install-workspace/templates/product-viewer/demo/tests/reports/screenshot.png` | `product-quality-pass` | Renders a full glTF speaker product as a staged studio product viewer with softboxes, plinth/contact cues, warm/cool reflection strips, cabinet/grille/material detail, orbit affordance, and diagnostics. The screenshot reads as the product-viewer prompt without source-code context. |
| `cinematic-scene` | `tests/reports/package-clean-install-workspace/templates/cinematic-scene/demo/tests/reports/screenshot.png` | `product-quality-pass` | Renders a textured GLB helmet hero as a rainy neon alley shot with foreground/background depth, cyan and amber practicals, layered rain, wet reflection streaks, splash cues, and diagnostics. The screenshot reads as the cinematic prompt instead of a model plus rain-line decoration. |
| `mini-game` | `tests/reports/package-clean-install-workspace/templates/mini-game/demo/tests/reports/screenshot.png` | `product-quality-pass` | Renders a distinct collect-and-dodge arena with typed GLB player, board rails, health/state pips, pathing cue, coins, hazard block, laser gate, motion trail, goal portal, and diagnostics. The screenshot reads as a playable starter arena rather than unrelated primitives around a robot. |

## Current Automated Proof

- `pnpm run check:templates` passes.
- `pnpm run check:clean-install` passes.
- Clean-install screenshot profiles are scene-specific:
  - `product-viewer`: cabinet, grille, metal, softbox, warm reflection, center object.
  - `cinematic-scene`: cyan practicals, amber light, rain, wet reflection, center hero, dark alley.
  - `mini-game`: robot armor, robot joints, boost pack, coins, hazard, portal, cyan trail, arena.

## Product Quality Boundary

These screenshots are product-quality proof for the approved starter recipes.
They do not prove that Aura3D can take any arbitrary prompt and any arbitrary
asset and create a visually desirable scene.

The current boundary is narrow: product-quality is shown for the three starter
prompt recipes through clean-install route health, screenshot profiles, and
manual review. These screenshots are supporting evidence only. They are not the
release proof that Aura3D beats raw Three.js.

The current release acceptance bar is defined in `FinalizedPromptPlan.md` and
`benchmark/protocol.md`.
