# Serpentine Sky Run: final screenshots (GU47 phase 3, 4.7.1, 2026-10-31)

- **Retake (4.7.1):** branch `gu47/g17` at d4b565cd1 + 3b22bb312 (the colour-script look with the phase-3 rubric pass: sun-aligned runner cast shadow, road sky reflection and glint, prayer-flag posts and cords, VIOLET runner on a first visit). Remote ACR run `g17p3-r2-shots` (`tests/browser/shotsb-serpentine.spec.ts`), software WebGL2 (SwiftShader), 1280x720 and 390x844; card 1440x900. Console errors: none in every pass. Index posters rebuilt with `node tools/site/build-card-images.mjs` (only this game's webp files kept). The early, jump and roll states fall inside the 4 s intro shot (cinebars), by design (SSR-15).

## Earlier take (audit lane G17, 2026-10-29)

- **Build:** `audit-fix/g17` (head at capture: the phone mute icon commit) merged with `audit-fix/e2` bcb705198 (the directional, additive hemisphere), so these frames show the 4.5.0 engine with this lane's fixes, including `environments.neutral({ intensity: 0.9 })`. Capture code: `tests/browser/shotsb-lib.ts` and `tests/browser/shotsb-serpentine.spec.ts`.
- **Runner:** remote Azure ACR task `g17shots3` (`tools/remote-acr/run.sh`), headless Chromium on SwiftShader. This is software WebGL2, not a GPU, so none of these frames is real-GPU evidence.
- **Viewports:** 1280x720 and 390x844 (touch emulation, scale 1). The card images are `card@2x.jpg` (1440x900, captured at 1x device scale) and `card.jpg` (720x450, downscaled). The index posters `public/previews/showcase-index/serpentine-sky-run-port{,@2x}.webp` are made from the same frame.
- **Method:** states are driven through `window.__AURA_SERPENTINE_SKY_RUN__` with manual stepping, so the frames are deterministic. The title frame comes from the normal page. `capture-log.txt` has the state of each frame, the visible overlays and the console errors, which are empty for every pass.

## States

All five states were reached: title, early (the check-in banner), jump, roll, mid-action (the "THE LONG ROAD" banner, spark 87) and results. The card uses the mid-action state. The results frames show the real results card: the idle run falls at the first gap (s = 754.8), and `outro(3)` passes the fall's 2.6 s results delay. The card shows distance, score, best, days left, the days bonus and its note.

## Checked

- Old names: none in the frames.
- Black frames: none.
- HUD: the SPARK and STRAIN labels are visible, the surge chip sits below the player card, and the mute button is a text button on desktop and an icon beside pause on phones. On phones the touch buttons and the progress bar do not overlap.
