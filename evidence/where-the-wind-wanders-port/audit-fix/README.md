# The Bellkeeper's Walk: audit-fix evidence (lane G23, 2026-10-29)

Remote runner only (`tools/remote-acr/run.sh`, ACR, SwiftShader software WebGL2). These are not GPU numbers. Spec: `tests/browser/audit-fix/where-the-wind-wanders-port.spec.ts`. Each folder holds the decoded JPEGs (full page, HUD included) and `metrics.jsonl` (one line per shot: canvas luma, HUD boxes and overlaps, caption, state, render path, draw calls, bell angle, audio state; plus console and navigation lines).

- `before/g23-before-10291933/`: base `audit-fix/integration` b2dba3713. Examples-page screens are valid. The app-route tests did not mount the scene (the dev server resolved the GLB URLs under `apps/…/src/assets/`, a 404 that only the dev server has), so those frames are dropped; their DOM numbers (credit grid, Begin hit test, navigation, captions) are valid and kept in `metrics.jsonl`.
- `before/g23-before3-10292014/`: base again, app-route tests with the URL mapping (live, bloom, touch, ending).
- `after/g23-after3-10292046/`: this branch at 1bde718d4, all five tests, Playwright exit 0. Source of the retaken `screens/final/`.
- `scripts/`: `compress-glb.mjs` and `split-bell.mjs` (asset changes), `decode-log.mjs` (log to JPEG and JSONL).

## Numbers

| Check | Before | After |
|---|---|---|
| Live route GLB bytes, 10 or 11 unique files (Resource Timing) | 15,714,716 | 8,396,392 |
| Loading card | "Drawing the valley…" only | counts models: "… 4 of 11 models (3.0 MB)" |
| Steady-state canvas luma, live route 1280x720, at 3 / 25 / 60 s | 164.48 / 164.50 / 164.52 | 164.43 / 164.59 / 164.48 |
| Fused vs production bloom, letter-glow frame 640x360 (two frames) | mean 0.0002, max 1/255 | mean 0.0001 and 0.0002, max 1/255 |
| 390x844 touch: what the centre of Begin hits | `wwui-pad` | `wwui-begin` |
| 390x844 touch: points of a 256-point grid over the pad that hit the credit link | 26 | 0 |
| Tap at the pad's lower-left | navigated to `/apps/showcase-index/` | stayed |
| Pad held up for 4 s | 0 u (the Begin tap was eaten by the pad) | 1.283 u |
| HUD overlaps on the live route at 390x844 | `quest~hint`, `pad~creditLink`, `begin~pad` | none |
| Journal after the first letter on a phone | open over the screen | closed, Journal button flashes |
| Caption 6.5 s after picking up the first letter at once | intro line 2, then 3 | the letter's text |
| Caption 14 s after leaving the epilogue | "Stillwater Isle. Another morning…" on | off |
| Bell swing angle after the ring | no swinging node (`null`) | -0.045 to 0.006 rad over 4 samples |
| Touch pause button | absent | present; pause sets audio gain 0 |
| Ending reached by play, then Walk again | no button | state back at START, title showing |

Steady state: the live shots are judged at 25 and 60 s, not the first frame; the screens use a settle shot before each judged one.
