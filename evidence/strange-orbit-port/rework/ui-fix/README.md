# Craterline GP: UI fix

Before and after frames were captured on the remote runner (software WebGL2 on SwiftShader, not a GPU) with the game's QA hooks at the same deterministic states, from `origin/game-rework` `34f5037d2` (before) and this branch (after). Capture code: `tests/browser/shotsb-*.spec.ts`. Run ids: `fixb-before-*` and `fixb-after*`. Nothing here is real-GPU evidence; the owner should confirm the look on the Mac.

## What changed

- **Old names removed:** the title screen heading read "STRANGE ORBIT." and the brand line "Orbital Cycling Club"; they now read "CRATERLINE GP." and "Craterline Cup". The course blurb no longer says "The original planet dive".
- **HUD overlap:** the standings list sat on the Race time block (its "Best lap" line) at 1280 and covered the lap and race-time panels at 390, with "Lap 1 / 7" wrapping. The list and the banner now start at 104 px (96 px on phones) and the top row has nowrap, smaller values and safe-area insets under 720 px; the key hint hides on phones; the banner sits left of the list.
- **Smeared track texture:** the brush streaks were sampled at a 10:1 stretch along the track (`q = (u*90, v*9)`), which is the shader's intended painterly look, so this is an art-direction setting, not a UV bug. It is now 5:1 (`60 x 12`) with the vein noise at `26 x 7`. The streaks are visibly shorter in `mid-action-1280-before-after.jpg`. If a cleaner surface is wanted, the amethyst section needs its own texture, which is art work.

Files: `examples/strange-orbit-port/{ui.ts,shaders.ts,course.ts}`.

## Frames (before | after)

- `title-1280-before-after.jpg`
- `title-390-before-after.jpg`
- `mid-action-1280-before-after.jpg`
- `boost-390-before-after.jpg`
