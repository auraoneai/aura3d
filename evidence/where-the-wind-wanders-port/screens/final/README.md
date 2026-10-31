# The Bellkeeper's Walk: final screenshots (after the UI and render fixes)

**Retaken 2026-10-31 (GU47 phase 3, lane g23):** every frame below was taken again on the GU47 phase-3 round-2 build (`0006e4f08`: the panel-approved GU47 daylight look is the default boot), remote run `g23p3-r2-5` (crmmeprodacr, image `g23p3r2`), spec `tests/browser/audit-fix/where-the-wind-wanders-port.spec.ts --grep=screens`, same file names and sizes. Software WebGL2 (SwiftShader), not a GPU. `metrics.jsonl` holds the spec's `WW_META` lines for this run.

**Retaken 2026-10-29 (audit lane G23, RH-05):** every frame below was taken again from `audit-fix/g23` at 1bde718d4 (4.5.0 render path `hdr-msaa`, quality `auto`, fused bloom), remote run `g23-after3-10292046`, spec `tests/browser/audit-fix/where-the-wind-wanders-port.spec.ts`, same file names and sizes. `results.1280x720` is now the epilogue reached by play (the original's recorded run rings the bell, then the game clock runs 9.5 + 6 s), not forced. Per-frame numbers: `evidence/where-the-wind-wanders-port/audit-fix/after/g23-after3-10292046/metrics.jsonl`. The notes below describe the earlier set from 2026-10-25.

- **Build:** `origin/game-rework` at `0d965903c` (examples dev server, QA hooks). Capture: `tests/browser/finc-lib.ts` + `finc-games.ts` (`WIND`), decoder `tools/shots/decode-finc.mjs`; numbers in `metrics.jsonl`.
- **Runner:** serverless ACR Chromium, **software WebGL2 (SwiftShader), not a GPU**. These frames are not real-GPU evidence.
- **Method:** the route is the examples page (no quick bar or credit link), driven through `window.__AURA_WIND__`. The texture status table has 19 rows, 0 textured and 0 pending (scalar materials), so there was nothing to wait for. Every frame was opened and looked at.
- **Checks:** the title card reads "The Bellkeeper's Walk"; no old name, "port" or lore term in any visible text; 0 console errors, 0 bad responses; the canvas fills the viewport at every size.

## States

| File | State |
|---|---|
| `title.1280x720`, `title.390x844` | title card with controls and "Begin the walk" |
| `gameplay-early.*` | 60 steps in, standing near the start |
| `key-walk.*` | 120 steps walking right (`D`) |
| `mid-walk.1280x720` | 300 steps walking right |
| `results.1280x720` | the epilogue panel "Stillwater Isle", **forced** with `epilogue(6)`, not reached by play (HUD still reads 0 / 3 discovered) |
| `card.2x.1440x900`, `card.1x` | 720x450 card frame from `key-walk`; the 1x image is the 2x frame downscaled in the page |

Mobile (390x844) has title, `gameplay-early` and `key-walk`.

## Problems still visible

1. **Low-medium (likeness review):** the pink translucent cat-like floating companion at the left of every frame resembles a well-known creature. It needs your eyes.
2. **Low:** the long cloak hides the knees, and a still frame cannot show the stride. `key-walk` and `mid-walk` show the boots mid-stride; foot slide was measured separately by the earlier lane, not here.
3. **Low:** in `results` the hero is not in frame and the panel sits over the grass; the counter still reads 0 / 3.
4. **Low:** grass near the camera shows dithered, speckled edges at the bottom of the frame.
