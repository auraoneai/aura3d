# Aura Links 3D: screenshots 2026-10-24

- **Build:** `c6575c723` (origin/game-rework head), served from a `vite build` of the app (the app's `vite.config.ts` is not applied by the dev server), with catalog assets resolved from the staged `public/aura-assets`.
- **Runner:** remote ACR task, headless Chromium on **software WebGL2 (SwiftShader), not real-GPU frames**. RUN_ID `shotsa8-links`.
- **Viewports:** `1280x720/`, `390x844/`, and `card/` (720x450, 1x and 2x). `status.txt` has the capture log.
- **History:** three earlier runs produced a black 3D canvas with only the HUD. A console probe showed the cause: the capture image lacked the Links GLBs (HTTP 404, drawCalls 0 and "production renderer failed to mount"). That was staging, not a game regression. Those frames were discarded.

## States
Title, early, address, power, accuracy, six swing-phase frames (Space x3 drives the swing), ball-flight camera, card 1x/2x, at both viewports. **Not reached:** hole-out, scorecard / results.

## Problems seen in the frames (reported, not fixed here)
- The golfer at address now stands with a forward lean and flexed knees (the earlier 20-degree whole-body slant is gone); the club is in the hands.
- The **golfer and a second figure at the left edge show noisy, shard-like texture artifacts** (silver speckle) and a **heavily corrupted golf cart texture**; this is the existing Meshy texture, untouched.
- A second golfer is **cropped at the left edge** of the 1280x720 frame, and at 390x844 the golfer is cut off at the left edge.
- The STROKES counter climbs from 0 to 18 within a few seconds of the three Space presses and reads +14 / +15 over par: the harness presses Space once to start the swing, but the counter keeps rising (likely repeated auto swings or a counter fault; not investigated).
- 390x844: the mode and course bar wraps to **four rows** and covers the scoreboard.
