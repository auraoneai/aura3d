# Aura Links 3D: UI fix (before and after)

- **Before:** `screens/2026-10-24/` frames (`before-*.jpg` here are copies); **after:** frames from the remote capture run `fixf-aura-links-3d` (`after-*.jpg`).
- **Runner:** remote ACR task (`tools/remote-acr/run.sh`) running `tests/browser/shotsa-aura-links-3d.spec.ts`, headless Chromium on **software WebGL2 (SwiftShader), not real-GPU frames**. Frames decoded with `tools/shots/decode-frames.mjs`.
- **Viewports:** 1280x720 and 390x844, state `address`.

## Problem
The mode bar wrapped over the scoreboard on phones and the LIVE tag overlapped the scoreboard.

## Change
Shared one-row quick bar; HUD below it; banner and message below the scoreboard on phones. The golfer is still cropped at the left edge on phones (camera framing, not changed here).

## Not covered
Only the viewports above were captured after the fix; results screens were not reached; the check was by eye with no automated overlap metric; real-GPU appearance is unchecked.
