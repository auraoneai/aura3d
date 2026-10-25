# Cumulus Dash: screenshots, 2026-10-24

Retaken for the screenshot refresh (section 5 of `docs/workflows/game-rework-prompt.md`).

- **Build:** `origin/game-rework` at `06cf4f7eb` (examples dev server, QA hooks; spec `tests/browser/shotsc-lib.ts`, decoder `tools/shots/decode-shots.mjs`).
- **Runner:** serverless ACR Chromium, **software WebGL2 (SwiftShader), not a GPU**. Timing, shading and anti-aliasing differ from a real GPU, so these frames are not real-GPU evidence.
- **Method:** deterministic states driven through the game's QA hook (`window.__AURA_*__`), one JPEG per state; every frame was looked at.
- **Viewports:** **640x360 desktop (reduced: this game is slow on software GL)** and 390x844 mobile subset, plus 720x450 card images at 1x and 2x device scale. There is no 1280x720 set.

## States

| File | State |
|---|---|
| `title.640x360`, `title.390x844` | title screen |
| `gameplay-early.*` | run started (`begin()` and 20 settle frames) |
| `key-run.*` | 120 frames of running |
| `key-jump.640x360` | jump input then 14 frames |
| `mid-track.640x360` | teleported to s=600 ("Checkpoint", 3 of 7 orbs) |
| `results.640x360` | the finale cinematic (`place(1e6)`, 240 frames): letterboxed, no score screen |
| `card.1x`, `card.2x` | 720x450 frame from `key-run` |

## Problems seen (not fixed in this lane)

1. **Old game name in the UI:** the title card reads **"Beyond the Cloud Runner"** (both sizes). The public name is Cumulus Dash.
2. **Canvas does not fill the frame at device scale 2:** `card.2x` shows the 3D view in the lower-left 960x600 of a 1440x900 frame with black elsewhere (`card.1x` is correct). On a Retina display the same sizing could show up in play; worth checking on real hardware.
3. The game state still names the first chapter "Mount Paozu" (not visible in the captured frames; it may appear on a chapter banner).
4. The runner's orange outfit and blue sash should be reviewed against `docs/audit/likeness-brand-audit.md`.
5. Desktop frames are 640x360 only, so UI scale differs from the 1280x720 sets of the other games.
