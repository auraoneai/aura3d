# Aura Slam 3D: audit-fix captures, 2026-10-29 (lane G01)

All frames come from `tests/browser/audit-fix/top-tennis.spec.ts` on the remote runner (`tools/remote-acr/run.sh`, Azure ACR Tasks, headless Chromium, software WebGL2 / SwiftShader). This is not real-GPU evidence. The route is `/apps/showcase-top-tennis/` served by `tests/browser/example-dev-server.ts`.

Each `meta.jsonl` line is one `GL_META` record: canvas-only luma stats (mean, p5, p50, p95, fraction below luma 12, fraction at or above 250), 7x7 colour patches at the projected spectator seats and athletes, game state, camera, spectator node state, diagnostics, and the controls-hint text. Shots are taken at steady state: judge the later ones (`mid-b`, `mid-c`, `settle-40s` and later), never the first frame.

| Folder | Code | Runs |
|---|---|---|
| `v4.3.7/` | tag `v4.3.7` | `g01-v437b-122136` (flow 1280 and 390) |
| `before/` | `audit-fix/integration` (4.5.0 base) | `g01-before-121740` (flows, card, Moon state), `g01-beforeS-123947` (states), `g01-beforeC-131038` (card, context loss) |
| `after/` | `audit-fix/g01` | `g01-final2-131920` (flow 1280), `g01-final2-131920-390`, `g01-final2-131920-misc` (card), `g01-final-124319-state` (diag, production path), `g01-final3-132401` (six venues), `g01-final4-132948` (context loss) |

File names: `<profile>-<state>.jpg` are full-page screenshots (the `screens/final` set), `flow-<profile>-<shot>.jpg`, `state-*`, `venue-*`, `ctxloss-*` are canvas-only frames.

## Key numbers

| Check | v4.3.7 | before (4.5.0) | after |
|---|---|---|---|
| 1280 steady mean luma (`mid-b`) | 44.36 | 50.37 | 53.29 |
| 1280 median luma | 48 | 54 | 55 |
| 1280 pixels below luma 12 | 9.95% | 8.30% | 3.67% |
| Spectator patch saturation (12 seats in frame) | n/a | 0.011 | 0.623 |
| Spectator node colours after updates | n/a | 0 | 24 |
| 390 rival on screen | no | no (x = -53 px) | yes |
| 390 near athlete on screen | no | no (feet at y = 979 of 844) | yes |
| 390 canvas box | n/a | top 196, height 844 (overflows the screen) | top 196, height 536 |
| 390 vertical FOV | 15 | 15 | 29.3 |
| Results screen via QA steps | n/a | not reached in 240,000 steps (score 0-0) | 3-0 in 12,000 steps, at 1280 and 390 |
| Context loss: sim time advanced while lost (3 s) | n/a | 2.98 s, WebGL 2 error shown | 0.05 s, paused, "Graphics reset" shown |
| Moon: spectators, grandstand and side stands | n/a | not captured: the base ignored `?venue=` on quick start, so every base "venue" run played on hard court | hidden, debug reports hidden (`venue-moon`) |
| `?aura3d-render=production` vs default, mean luma | n/a | 50.37 / 50.37 | 53.30 / 53.30 |
| Draw calls, 1280 rally | 125 | 125 | 124 |
| Draw calls, 390 rally | 68 | 67 | 160 (the whole court, stands and crowd are now in view) |
| 390 whole-page mean luma (`mid-b`) | n/a | 52.72 | 33.85 |

The 390 luma numbers are whole-page screenshots with everything but the canvas hidden on black: the canvas covered 648 of 844 rows before (it ran off the bottom of the screen) and 536 rows after, so most of the drop is black page area, not a darker court. Compare 390 frames by eye, not by this mean.
