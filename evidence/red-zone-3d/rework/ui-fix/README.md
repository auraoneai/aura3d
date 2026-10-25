# Red Zone 3D: UI fix (before and after)

- **Before:** `screens/2026-10-24/` frames (`before-*.jpg` here are copies); **after:** frames from the remote capture run `fixj-red-zone-3d` (`after-*.jpg`).
- **Runner:** remote ACR task (`tools/remote-acr/run.sh`) running `tests/browser/shotsa-red-zone-3d.spec.ts`, headless Chromium on **software WebGL2 (SwiftShader), not real-GPU frames**. Frames decoded with `tools/shots/decode-frames.mjs`.
- **Viewports:** 1280x720 and 390x844, state `early` (pre-snap with the play-call sheet showing).

## Problem
The mode bar covered the HUD on phones, the play-call cards were large and covered the lower third of the field, the sheet was rebuilt every frame (which can swallow clicks), and the big matchup banner overflowed both screen edges on phones.

## Change
Shared one-row quick bar with the credit link and the HUD below it. The play-call sheet is a compact strip of three cards above the field-position bar with a small PLAYS toggle chip that collapses it to the selected card; on phones it is one row of three cards without the diagrams. The sheet is rebuilt only when its content changes. The big call wraps and fits on phones.

## Not covered
Collapsed state was not captured; touchdown and results screens were not reached; the check was by eye with no automated overlap metric; real-GPU appearance is unchecked.
