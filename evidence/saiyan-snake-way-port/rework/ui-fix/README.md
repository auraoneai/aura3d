# Serpentine Sky Run: UI fix

Before and after frames were captured on the remote runner (software WebGL2 on SwiftShader, not a GPU) with the game's QA hooks at the same deterministic states, from `origin/game-rework` `34f5037d2` (before) and this branch (after). Capture code: `tests/browser/shotsb-*.spec.ts`. Run ids: `fixb-before-*` and `fixb-after*`. Nothing here is real-GPU evidence; the owner should confirm the look on the Mac.

## What changed

- **Old wording removed:** the title card said "A port of a Crayon browser game on the Aura3D engine."; the sentence is gone. The Ember runner tagline "The original look." is now "The classic look.".
- **HUD overlap on phones:** at 390 px the distance bar sat on the runner panel and its number was clipped ("58,50"). Under 640 px the bar now sits at the bottom, above the touch buttons, full width, with a backing panel and full-contrast text so it stays readable on the bright road.
- **Title card over the touch buttons:** the Slide, Fly and Surge buttons showed behind the card. They are hidden while any overlay is open, and cards scroll if taller than 92vh.

Files: `apps/showcase-serpentine-sky-run-port/index.html`, `examples/saiyan-snake-way-port/{index.html,styles.ts}`.

## Frames (before | after)

- `title-390-before-after.jpg`
- `mid-action-390-before-after.jpg`
- `title-1280-before-after.jpg`
