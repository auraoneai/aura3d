# Aura Hoops 3D: UI fix (before and after)

- **Before:** `screens/2026-10-24/` frames (`before-*.jpg` here are copies); **after:** frames from the remote capture run `fixe-aura-hoops-3d` (`after-*.jpg`).
- **Runner:** remote ACR task (`tools/remote-acr/run.sh`) running `tests/browser/shotsa-aura-hoops-3d.spec.ts`, headless Chromium on **software WebGL2 (SwiftShader), not real-GPU frames**. Frames decoded with `tools/shots/decode-frames.mjs`.
- **Viewports:** 1280x720 and 390x844, state `early`.

## Problem
The mode bar wrapped to three rows over the scoreboard on phones, the intro title wrapped over the court, and the intro message could linger on slow frames.

## Change
Shared one-row quick bar; HUD below it; the LIVE tag and intro message sit below the scoreboard on phones and the message is one line; the message also ends on wall-clock time.

## Not covered
Only the viewports above were captured after the fix; results screens were not reached; the check was by eye with no automated overlap metric; real-GPU appearance is unchecked.
