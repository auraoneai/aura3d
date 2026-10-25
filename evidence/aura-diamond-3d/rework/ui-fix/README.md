# Aura Diamond 3D: UI fix (before and after)

- **Before:** `screens/2026-10-24/` frames (`before-*.jpg` here are copies); **after:** frames from the remote capture run `fixd-aura-diamond-3d` (`after-*.jpg`).
- **Runner:** remote ACR task (`tools/remote-acr/run.sh`) running `tests/browser/shotsa-aura-diamond-3d.spec.ts`, headless Chromium on **software WebGL2 (SwiftShader), not real-GPU frames**. Frames decoded with `tools/shots/decode-frames.mjs`.
- **Viewports:** 1280x720 and 390x844, state `stance`.

## Problem
The mode bar was a wrapping three-row panel that covered the scoreboard on phones, and the strike zone was a grey slab over the batter.

## Change
Shared one-row quick bar with the credit link; HUD sits below it; the strike zone is a thin outline so the batter and catcher stay visible; 'PLAY BALL' is one line on phones.

## Not covered
Only the viewports above were captured after the fix; results screens were not reached; the check was by eye with no automated overlap metric; real-GPU appearance is unchecked.
