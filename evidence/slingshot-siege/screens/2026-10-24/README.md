# Slingshot Siege: screenshots 2026-10-24

- **Build:** `2f788073d` (origin/game-rework head), served by the example dev server from source (the app's own `public/` is 336 KB; the 1.4 GB root `public/` is not copied: the slim image carries 144 key-resolved asset files, 148 MB).
- **Runner:** remote ACR task, headless Chromium on **software WebGL2 (SwiftShader), not real-GPU frames**. RUN_ID `shotsa4-slingshot`.
- **Viewports:** `1280x720/`, `390x844/`, and `card/` (720x450, 1x and 2x). `status.txt` has the capture log.
- **Note:** a first run (RUN_ID `shotsa-slingshot`) showed "Renderer unavailable" because the capture image lacked a GLB declared by key in `src/aura-assets.ts` (HTTP 404). Those frames were discarded; this set is from the fixed rerun.

## States
Title, early (autoplay, Driftwood Cove level 1, aiming), one desktop action frame (aiming), three mobile action frames including a **shot in flight**, mid, card 1x/2x. **Not reached:** a launch at 1280x720 within the budget, a level-complete or results screen.

## Problems seen in the frames (reported, not fixed here)
- 1280x720: the bottom hint bar (Drag / Tap / Space / R M P) **overlaps the lower edge of the ammo tray** and the "TAP Yolk Drop" button.
- 390x844: the title "Slingshot Siege" **wraps to two lines and runs into the score card**; the three-line hint block **covers the ammo tray**; the fortress is cropped on the left; the tab row wraps.
- The island scene itself renders fully (rocks, windmill, arch, flags, crates, barrels, sling and birds); no black frames, missing textures or floating props seen.
