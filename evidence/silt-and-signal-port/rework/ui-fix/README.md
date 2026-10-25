# Duneglide: mobile HUD and results card (2026-10-24)

Frames are software WebGL2 from the remote runner; not real-GPU evidence.

- **Compass over the objective text, controls box on the speed meter (390x844):** the objective card now stops 92 px short of the right edge, the compass is 72 px, the controls hint is hidden at 560 px and below (the title screen keeps the full table). `before-gameplay-early.390x844.jpg` / `after-...`.
- **Bare results card:** the card now shows time in flight, lamps restored, field notes, impacts and a rating (Glass-smooth, Steady hand, Rough landings by impact count), plus "Fly again". The QA hook `setMode("done")` now goes through `openDone()` so the forced state shows the real card. The numbers in the after frames are from a forced state, so they read zero. `before-results.1280x720.jpg` / `after-results.1280x720.jpg`, `after-results.390x844.jpg`.
