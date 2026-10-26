# Shadowstep Gauntlet: final screenshots (4.3.0 art pass)

- **Build:** the working tree that became `origin/main` `7f94e7cd9`, except that this run staged the valley outcrops sunk slightly deeper (cliff base `-0.3 s` and height `1.1 s` instead of the committed `-0.22 s` and `1.35 s`), so the finish frame shows lower outcrops than the shipped build (the art pass: ten generated scenery models replace the placeholder houses, stalls, cliffs, rocks, tufts, hills and fences; `evidence/ninja-runner-port/art-pass/` has the before/after frames).
- **Runner:** remote Azure ACR task `p1shstep-shots` (`tools/remote-acr/run.sh`, spec `tests/browser/shotsb-gauntlet.spec.ts`, decoded with `tools/shots/decode-shotsb.mjs`), headless Chromium on SwiftShader: software WebGL2, not a GPU. Nothing here is real-GPU evidence; the owner should confirm the look on the Mac.
- **Viewports:** 1280x720 for every state; 390x844 (touch emulation) for title, early and run only. The full spec exceeds the one hour ACR step limit at this scene's software-GL speed, so the 390-wide action, gate-hit, mid-action and results frames were not retaken and the stale ones from the previous set were removed. The card (`card.jpg` 720x450 from `card@2x.jpg` 1440x900) comes from the separate `p1shstep-card2` run (`tests/browser/shotsb-gauntlet-card.spec.ts`: a single `begin` + 300 frames state at the 1440x900 card viewport).
- **Method:** states are driven through the game QA hooks (manual stepping) so frames are deterministic; the title frame is taken from the normal page. `capture-log.txt` has the per-frame state and console errors (empty for desktop).

## Frames

`title-1280`, `title-390`, `early-1280`, `early-390`, `run-1280`, `run-390`, `action-1280` (jump plus spiral orb), `gate-hit-1280` (a crate ram with debris, backstreets), `mid-action-1280` (autopilot, 1,800 frames in), `results-1280` ("The village is safe.", valley outcrops and falls), `card.jpg`, `card@2x.jpg`.

## Checked (frames opened and read)

- Old names or "port" text: none in the frames.
- Black frames: none.
- Brand marks or lettering: none seen.
- Scenery: stone cottages, timber townhouses, a market stall, shrubs, rail fences and a distant forested ridge in the village and backstreets; sandstone outcrops and the falls at the finish.

## Problems still visible (severity)

- **Low:** the stone cottage reads very dark against the bright grass; foreground oak and pine models keep their faceted leaf cards; the right-hand house in `gate-hit-1280` shows stretched texture because the camera passes within a metre of it.
- **Low:** on 390 the ability bar and form selector take about 130 px at the bottom of the screen.
