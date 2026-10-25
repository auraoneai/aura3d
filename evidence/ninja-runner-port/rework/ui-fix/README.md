# Shadowstep Gauntlet: UI and scenery fix

Before and after frames were captured on the remote runner (software WebGL2 on SwiftShader, not a GPU) with the game's QA hooks at the same deterministic states, from `origin/game-rework` `34f5037d2` (before) and this branch (after). Capture code: `tests/browser/shotsb-gauntlet.spec.ts` and the short `tests/browser/fixb-gauntlet.spec.ts`. Run ids: `fixb-before-gauntlet`, `fixb-after2-gauntlet`, `fixb-after3-gauntlet`. Nothing here is real-GPU evidence; the owner should confirm the look on the Mac.

## What changed

- **Phone HUD:** at 390 px the "Sound on" pill sat on the stats panel and the four abilities (one 128 px column) covered the form buttons and part of the runner. Under 760 px the forms and abilities are two full-width rows (four abilities across), the pill sits above them, the vitals and stats cards are compact with safe-area insets, and the progress bar moves under the cards (it was hidden behind them). On desktop the pill moved 28 px right so it no longer sits on the end of the progress bar.
- **Stretched, torn-looking houses:** `mput` scaled each Meshy model per axis to a requested box, so a nearly square house (1.9 x 1.6 x 1.0 natural size) was stretched up to about 3x on one axis, which smears its texture. The per-axis scale now stays within +-28% of the uniform scale (at most about 1.64x between axes), with a unit test that fails on the old code. The village in `mid-action-1280-before-after.jpg` shows towers and houses with their own proportions.
- **Huge flat grey polygons at the end of the course:** the valley cliffs reused the small rock mesh (8 segments x 5 rings, 64 facets) scaled to 8 to 28 units. They now use a new `cliff` shape (28 x 18 with a second noise octave, over 900 facets) on their own `cliffs` layer; the small rock is unchanged (test pins its 64 facets). `results-1280-before-after.jpg` shows the walls broken into many smaller facets. They still read as low-poly flat-shaded rock; a textured, smoother cliff would be art work.
- **Not fixed, needs art:** in `gate-hit-1280-before-after.jpg` the nearest house on the right still shows large diagonal triangles cutting across its windows when the camera passes close (alley gap 1.6 to 3.4 m). That is the Meshy house mesh itself (a coarse remesh under the 8,000-triangle budget), not the scale, so it needs a cleaner or denser `houseA` / `houseB` model (about 30 to 45 Meshy credits each), and a big oak trunk stands right in front of it.

Files: `apps/showcase-ninja-runner-port/index.html`, `examples/ninja-runner-port/{index.html,scenery.ts,shapes.ts,world.ts}`, `tests/unit/ninja-runner-port/{models,scenery}.test.ts`.

## Frames (before | after)

- `title-390-before-after.jpg`
- `gate-hit-1280-before-after.jpg`
- `run-1280-before-after.jpg`
- `action-1280-before-after.jpg`
- `mid-action-1280-before-after.jpg`
- `results-1280-before-after.jpg`
- `early-390-before-after.jpg`
- `run-390-before-after.jpg`
