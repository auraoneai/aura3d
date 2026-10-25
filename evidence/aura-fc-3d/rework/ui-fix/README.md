# Aura FC 3D: UI fix (before and after)

- **Before:** `screens/2026-10-24/` frames (`before-*.jpg` here are copies); **after:** frames from the remote capture run `fixh-aura-fc-3d` (`after-*.jpg`).
- **Runner:** remote ACR task (`tools/remote-acr/run.sh`) running `tests/browser/shotsa-aura-fc-3d.spec.ts`, headless Chromium on **software WebGL2 (SwiftShader), not real-GPU frames**. Frames decoded with `tools/shots/decode-frames.mjs`.
- **Viewports:** 1280x720 and 390x844, state `early`.

## Problem
FC had its own header bar and the HUD sat at fixed offsets.

## Change
FC now uses the shared one-row bar with the credit link; its HUD sits below it; the possession label no longer touches the scoreboard; the keyboard hint is hidden on phones (it was clipped).

## Not covered
Only the viewports above were captured after the fix; results screens were not reached; the check was by eye with no automated overlap metric; real-GPU appearance is unchecked.
