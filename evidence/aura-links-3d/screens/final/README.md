# Aura Links 3D: final screenshots (retaken 2026-10-29)

- **Build:** branch `audit-fix/g10` at `f03ec0bd1` (4.5.0 engine plus the audit fixes: player-driven swing, holes that finish, closing scorecard, aim camera and tee-marker changes). The 2026-10-25 set this replaces came from `origin/game-rework` `8da9c05d3` on engine 4.0.2.
- **Runner:** remote ACR task (`tools/remote-acr/run.sh`), headless Chromium on **software WebGL2 (SwiftShader), not real-GPU frames**.
- **Spec:** `tests/browser/audit-fix/aura-links-3d.spec.ts`, tag `@shots` (screens and card) and `@round` (results). RUN_IDs `g10m-links-shots-*` (screens, card) and `g10final-round` (results). Frames are logged as base64 JPEG chunks and decoded locally, since the run has no artifact egress.
- **How the sequence is driven:** `?course=stAuroras&qa=1`. Game logic is held (`__AURA_LINKS_QA__.hold(true)`) and stepped with `advance()`, so each frame shows the state it is named for; the three swing presses are real Space key presses.
- **Layout:** same file names and sizes as before. `1280x720/`, `390x844/`, `card/` (720x450 at 1x and 2x). New: `04-results.jpg` in both sizes, the closing scorecard after a nine-hole `?autoplay=1` round. `card/flat-lighting-card-2x.jpg` is the old frame and was not retaken.

## Frames

- `01-title`: the menu (`?menu=1`).
- `02-early`, `03-action-01-address`: hole 1 tee, aim camera, ball in the lower third beside the golfer.
- `03-action-02-power`, `03-action-03-accuracy`: the meter after the first and second press (power about 52%).
- `03-action-04-swing-0` to `-09-swing-5`: the swing and the ball flight on the chase camera.
- `03-action-10-route-...-state-p`: the next address after the shot (strokes 1 in the HUD).
- `04-results`: closing scorecard. Remote state: `ROUND COMPLETE`, par 36, 19 strokes, -17 (autopilot demo, not a human round).

## Known limits

- Software GL frames; colours and shadow detail on a GPU differ.
- The golfer's glossy blue-silver sheen under the sky environment (noted in the 2026-10-25 set) is unchanged; it needs a re-hashed asset.
