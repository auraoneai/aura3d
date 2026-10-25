# Slingshot Siege: UI fix (before and after)

- **Before:** `screens/2026-10-24/` frames (`before-*.jpg` here are copies); **after:** frames from the remote capture run `fixf-slingshot-siege` (`after-*.jpg`).
- **Runner:** remote ACR task (`tools/remote-acr/run.sh`) running `tests/browser/shotsa-slingshot-siege.spec.ts`, headless Chromium on **software WebGL2 (SwiftShader), not real-GPU frames**. Frames decoded with `tools/shots/decode-frames.mjs`.
- **Viewports:** 1280x720 and 390x844, state `early`.

## Problem
The hint footer overlapped the ammo tray at 1280x720, the footer took three rows on phones, and the title wrapped into the score card.

## Change
The ammo tray, ability button and shot meter sit above a one-line scrolling hint footer; the top bar never wraps (title one line, tabs scroll). Slingshot keeps its own in-HUD bar rather than the shared one.

## Not covered
Only the viewports above were captured after the fix; results screens were not reached; the check was by eye with no automated overlap metric; real-GPU appearance is unchecked.
