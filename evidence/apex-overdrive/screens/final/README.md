# Apex Overdrive: final screenshots (after the UI and render fixes)

- **Build:** `origin/game-rework` at `0d965903c` (examples dev server serving `apps/showcase-roadster-rush`, with `apps/showcase-port-shared` and the three root-manifest GLBs staged). Capture: `tests/browser/finc-apex.spec.ts` (title to results, both sizes) and `finc-apex-card.spec.ts` (card), decoder `tools/shots/decode-finc.mjs`; numbers in `metrics.jsonl`.
- **Runner:** serverless ACR Chromium, **software WebGL2 (SwiftShader), not a GPU**. These frames are not real-GPU evidence.
- **Method:** driven through `window.__GAME__.game` (manual stepping). Every frame was opened and looked at.
- **Checks:** the HUD pill reads "APEX OVERDRIVE" (no "AURA3D 4.0"); no old name or stale version in any visible text; 0 console errors, 0 bad responses.

## States

| File | State |
|---|---|
| `title.1280x720`, `title.390x844` | page ready, game in `title` mode (this route has no title card; the run is drawn behind the HUD) |
| `gameplay-early.*` | run restarted, 60 sim steps |
| `key-ramp.*` | shield pickup plus the "ramp" scenario, 30 steps |
| `mid-drive.1280x720` | 480 more steps |
| `results.1280x720` | "Wrecked!" card (score 1,460, 269 m, 16 bolts, best combo x2, new best), **forced** with `gameOver()` |
| `card.2x.1440x900`, `card.1x` | 720x450 card frame, 60 sim steps into a fresh run; the 1x image is the 2x frame downscaled in the page |

## Fixed since the first retake (confirmed in frames)

- The "AURA3D 4.0" pill is gone.
- On mobile the 3D view fills the screen and the mode bar is one scrolling row.
- The card shows the player car clearly with a tidy HUD.
- No black canvas; the GLBs load.

## Problems still visible

1. **Medium (likeness review):** the orange truck cab's grille carries a round emblem that may read as a real manufacturer badge; the resolution is too low to confirm. The white van's grille and round headlights are a familiar generic shape.
2. **Low:** on desktop the mode bar wraps to two rows at the top and covers part of the buildings; on mobile it is cut at "Carr…" (it scrolls sideways, by design).
3. **Low:** in `key-ramp` two trucks stand side by side in adjacent lanes at the same distance and read as a wall (they no longer interpenetrate).
4. **Low:** the mobile score and shield panels overlap the left truck.
5. The ramp scenario can put a truck in front of the camera (a first card attempt did); the delivered card avoids it.
