# Chroma Roll: UI fix

Before and after frames were captured on the remote runner (software WebGL2 on SwiftShader, not a GPU) with the game's QA hooks at the same deterministic states, from `origin/game-rework` `34f5037d2` (before) and this branch (after). Capture code: `tests/browser/shotsb-*.spec.ts`. Run ids: `fixb-before-*` and `fixb-after*`. Nothing here is real-GPU evidence; the owner should confirm the look on the Mac.

## What changed

- **Old name removed:** the title card heading read "SPLAT RUSH"; it now reads "CHROMA ROLL" (wrapper and example page).
- **Popups over the HUD:** the milestone, OUCH and PERFECT popups started 9vh from the top, on top of the score and the combo text, and at 48 px they ran off the screen on phones. They now start at `clamp(120px, 16vh, 200px)` and scale with `min(8vh, 7.5vw)`.
- **Score and combo overlap (found in the after frames):** under 520 px the score wrapped to two lines and the combo counter sat on its digits. The score is nowrap with a smaller size, the lives do not shrink, and the combo moves to 72 px.

Files: `apps/showcase-splat-rush-port/index.html`, `examples/splat-rush-port/index.html`.

## Frames (before | after)

- `title-1280-before-after.jpg`
- `title-390-before-after.jpg`
- `mid-action-390-before-after.jpg`
