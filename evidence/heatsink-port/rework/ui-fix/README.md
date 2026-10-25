# Ion Circuit: UI fix

Before and after frames were captured on the remote runner (software WebGL2 on SwiftShader, not a GPU) with the game's QA hooks at the same deterministic states, from `origin/game-rework` `34f5037d2` (before) and this branch (after). Capture code: `tests/browser/shotsb-*.spec.ts`. Run ids: `fixb-before-*` and `fixb-after*`. Nothing here is real-GPU evidence; the owner should confirm the look on the Mac.

## What changed

- **Title screen:** the race already sits in its countdown behind the menu, so the objective line, the HUD blocks and the countdown "3" were drawn over the title card and the Start button. While the menu is open the HUD and countdown are hidden (`#menu:not(.hidden) ~ #hud, ~ #count`), and overlay cards scroll if taller than 92vh.
- **Top HUD row:** seven blocks at 110 px minimum clipped at 640 px and overflowed the right edge at 390. Under 900 px the row wraps into two rows (smaller values and padding), with safe-area insets; the objective line moves to 110 px, the bottom panels shrink, and the notice and countdown scale down.
- **"Black band across the horizon" (not a rendering fault):** in the mobile mid-race frame it is a checkpoint gate's dark crossbar with a neon strip, seen close in a narrow view; at the start the distant gate reads as a thin teal line. It is real gate geometry, so I left it. If a lighter gate is wanted, that is a material change to the gate model.

Files: `apps/showcase-heatsink-port/index.html`, `examples/heatsink-port/index.html`.

## Frames (before | after)

- `title-390-before-after.jpg`
- `title-640-before-after.jpg`
- `early-640-before-after.jpg`
- `early-390-before-after.jpg`
- `mid-action-390-before-after.jpg`
- `mid-action-640-before-after.jpg`
