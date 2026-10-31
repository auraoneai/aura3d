# Craterline GP: final screenshots (after the UI and render fixes)

- **Build:** GU47 phase 3 (4.7.1) `gu47/g15` at `619a21232`, remote run `g15p3-r8-2..5` (tag `g15p3r8-1324`, picassostagingacr); capture code `tests/browser/shotsb-lib.ts` + `tests/browser/shotsb-orbit.spec.ts` (unchanged). Previous retake: `origin/game-rework` `0d965903c`.
- **Runner:** remote Azure ACR task `finb-orbit` (tools/remote-acr/run.sh), headless Chromium on SwiftShader: software WebGL2, not a GPU. Nothing here is real-GPU evidence; the owner should confirm the look on the Mac.
- **Viewports:** 1280x720 and 390x844 (touch emulation, scale 1). Card images: `card.jpg` is 720x450 (downscaled from `card@2x.jpg`, 1440x900 captured at 1x device scale).
- **Method:** states are driven through the game QA hooks (manual stepping) so frames are deterministic; the title frame is taken from the normal page. `capture-log.txt` has the per-frame state, the visible overlays and the console errors (empty for every pass).

## Frames

- `boost-1280.jpg`
- `boost-390.jpg`
- `card.jpg`
- `card@2x.jpg`
- `impact-1280.jpg`
- `impact-390.jpg`
- `mid-action-1280.jpg`
- `mid-action-390.jpg`
- `results-1280.jpg`
- `results-390.jpg`
- `start-1280.jpg`
- `start-390.jpg`
- `title-1280.jpg`
- `title-390.jpg`

## States reached and not reached

Reached: title, start (countdown), boost (racing, boost held), mid-action (autopilot), impact (rider flown into a gate pillar at 35 m/s: caption "Crashed into the gate pillar"), results (full seven-lap autopilot, "Gold medal"). Card: boost. Not reached: none.

## Checked against the fixed list (frames opened and read: title 1280 and 390, boost 1280, mid-action 390, impact 1280, results 1280, start 390, boost card)

- Old names or "port" text: none in the frames.
- Black frames: none.
- Brand marks or lettering: none seen.

## Problems still visible (severity)

- **Medium:** on the 390 title screen the bike overlaps the Expert chip and the "Precise lines, 3 rescues" text, and the "ABOVE. BELOW. BEYOND." tagline is cut off at the left edge.
- **Low:** the orange track surface still shows long brush-streak smearing in racing frames (shorter than before the fix, still visible).
- **Low:** in the impact frame the rider sits on the pillar base; the rebound is not visible in a still.
- Fixed since the first retake: the title now reads "CRATERLINE GP." and "Craterline Cup"; the standings panel no longer overlaps the race-time panel at 1280 or 390.
