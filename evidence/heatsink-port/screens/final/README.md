# Ion Circuit: final screenshots (GU47 phase-3 retake, 2026-10-31)

- **Build:** branch `gu47/g19` at b967a20f2 (Aura3D 4.7.0 plus the phase-3 twilight default: panel-verified better than 4.6.2 in rounds g19p3r1..r3, 3/0/0 each). Capture code: `tests/browser/shotsb-lib.ts` and `tests/browser/shotsb-circuit.spec.ts`, remote run `g19p3-scr-2` (picassostagingacr), decoded with `tools/shots/decode-shotsb.mjs`.
- **Runner:** headless Chromium on SwiftShader: software WebGL2, not a GPU. `quality=low` as before (no GTAO, motion blur, CA, grain or lens flare; one shadow cascade).
- **Card:** `card@2x.jpg` is the strike state at 1440x900 (`strike-card2x` in the log), `card.jpg` is it downscaled to 720x450; previews rebuilt with `node tools/site/build-card-images.mjs`.
- **Known:** in the 390 frames the two-line objective touches the district banner; the `max-width: 500px` rule that moves the banner to 172 px landed after this capture and is not in these frames.

## Previous set (audit-fix retake, 2026-10-29)


- **Build:** branch `audit-fix/g19` (4.5.0 engine plus the lane G19 fixes: GO banner, HUD, touch controls, contact shadow, strip bounds, LIGHT-01 environment). Capture code: `tests/browser/shotsb-lib.ts` and `tests/browser/shotsb-circuit.spec.ts`.
- **Runner:** remote Azure ACR task `g19-w3-screens` (`tools/remote-acr/run.sh`), headless Chromium on SwiftShader: software WebGL2, not a GPU. The owner should confirm the look on real hardware.
- **Viewports:** 640x360 reduced low-quality canvas and 390x844 (touch device, so the touch controls show). Card: `card@2x.jpg` is the strike state at 1440x900, `card.jpg` is it downscaled to 720x450. Same file names and sizes as the previous set.
- **Method:** states are driven through the game QA hooks (manual stepping), so frames are deterministic; the title frame is the normal page. `capture-log.txt` has the per-frame state, the visible overlays and the console errors.

## Frames

- `title-640.jpg`, `title-390.jpg`: menu over the countdown.
- `early-*`, `start-*`: countdown (3 and 2).
- `strike-*`: step 323 of the strike replay, the first kill, 2.2 s into the race: the GO banner has cleared and the next-target line is visible.
- `mid-action-*`: step 1148, a barrel shot at 170 m/s.
- `results-*`: a real finished race (lane-follow bot at 80 m/s, `autopilot` hook): GOLD, 42 of 48 kills, finish time 4:49.233, with the medal rules under the stats.
- `card.jpg`, `card@2x.jpg`: the strike state.

## Changes against the previous set (2026-10-25)

- The countdown banner is no longer hidden by the capture code; it clears by itself (HP-01).
- The `results` frames used to show a race in progress; they now show a finished card (audit "Tests and evidence gaps").
- HUD: KILLS / RACE, HULL pips, best lap under TIME (HP-06, HP-15). The 390 frames show the touch buttons (HP-03).
