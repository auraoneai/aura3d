# Cumulus Dash: final screenshots (after the UI and render fixes)

- **Build:** `origin/game-rework` at `0d965903c` (examples dev server, QA hooks). Capture: `tests/browser/finc-lib.ts` + `finc-games.ts` (`CLOUD`, `CLOUD_JUMP`), decoder `tools/shots/decode-finc.mjs`; numbers in `metrics.jsonl`.
- **Runner:** serverless ACR Chromium, **software WebGL2 (SwiftShader), not a GPU**. These frames are not real-GPU evidence.
- **Method:** the route is the examples page, driven through `window.__AURA_KID_GOKU__`. **Desktop frames are 640x360, a reduced canvas** because the route is slow on software GL; mobile is 390x844. The texture probe found no diagnostics rows for this route (`none`), so texture settling could not be measured; the frames show textured rocks, log, trees and hero. Every frame was opened and looked at.
- **Checks:** the title card reads "Cumulus Dash" ("Sky Ridge Run", "sky pearls"); no old name, "port" or lore term (`Paozu`, `Goku`, `Saiyan`, ...) in any visible text; 0 console errors, 0 bad responses.

## Device-scale (2x) crop check

`dsf2-key.640x360@2x`: 640x360 CSS at device scale 2. Canvas backing 960x540, client 640x360 (the engine caps the pixel ratio at 1.5). The 3D view fills the whole frame: top-right region mean luma 130.8, dark fraction 0.000 (it was 94.7 to 99.6 percent dark in 4.1.3, where the renderer drew 720 of 1080 pixels). The 2x card (`card.2x.1440x900`, 720x450 CSS) also fills the frame.

## States

| File | State |
|---|---|
| `title.640x360`, `title.390x844` | title card |
| `gameplay-early.*` | run begins (`begin` + 20 settle frames) |
| `key-run.*` | 120 game frames running |
| `key-jump.640x360` | runner airborne on the open track (placed at 600, jump input) |
| `mid-track.640x360` | placed at distance 600, "Checkpoint" toast |
| `results.640x360` | **forced** with `place(1000000)`: this is the ending cutscene ("...the long way home."), not a results card |
| `dsf2-key.640x360@2x`, `card.2x.1440x900`, `card.1x` | 2x checks and the card (from `key-run`; 1x is the 2x frame downscaled in the page) |

## Problems still visible

1. **Medium:** the `results` state is the forced ending cutscene. The letterbox bars cut off the top HUD (hearts, button) and the bottom bar, and the hero is not in frame. No real results card was reached.
2. **Low:** in mobile `gameplay-early` the runner is hidden behind the rolling log at the start.
3. **Low:** the hint "← → OR A D TO STEER" has low contrast over the sky and rocks.
4. **Low:** the 1.5x pixel-ratio cap makes the 2x frames soft.
5. **Review:** the runner is a teal tunic, gold sash, curly brown hair: clearly original, no spiky hair or orange gi.
