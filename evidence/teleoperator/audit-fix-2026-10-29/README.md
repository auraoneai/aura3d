# Grid Dispatch audit fixes: before and after (2026-10-29)

Lane G04. Base: `audit-fix/integration` (`b2dba3713`, origin/main `31f8945ad` plus the audit docs). After: branch `audit-fix/g04`. All captures are remote software WebGL2 (SwiftShader, Azure ACR Tasks), not a real GPU. Spec: `tests/browser/audit-fix/teleoperator.spec.ts`; decoder: `tools/teleoperator/decode-gl-log.mjs`.

- `before/`: runs `g04b-desktop`, `g04b-phone`, `g04b-card`, `g04b-weather` on the base commit.
- `after/`: runs `g04c-desktop`, `g04d-phone`, `g04c-card`, `g04c-weather`, `g04a-bloom` on the branch.
- `before/meta.json`, `after/meta.json`: per shot, the frame and car-crop luma, view-space geometry, game state, draw calls and HUD rectangles. `run-lines.json`: the QA check results and touch logs.

Every shot is taken with the app paused after at least two newly presented frames; steady-state shots come after 45 to 60 s and 4 to 6 frames.

| Check | Before | After |
|---|---|---|
| Car to inner yellow line, chase view, right lane (C2) | 1.13 m (car drawn on the centre line) | 3.58 m (its lane) |
| Camera inside a car (C4), on-car cameras | Cyber Coupe roof and bumper: inside (clearance dx 0.08, dy -0.47, dz 0.10 m) | none of 10 shots (5 cars x roof, bumper) |
| Touch pads on 390x844 (C3) | none | 4 pads of 64 px; Throttle 9.5 to 16.7 m/s, Right x 3.4 to 5.9 m |
| Fare card vs speedometer on 390 (C15) | card y 667-792, dial y 684-838 (overlap) | card y 108-255, dial y 684-838 |
| Manual car with no input rolls past the pickup (C1) | fare completes (audit) | 0 rides, 2 misses (`manual-idle`) |
| Stop at the kerb beacon in the kerb lane (C1) | not checked | boards (`kerb-stop`) |
| Skip fare (C7) | pays a full fare (audit) | pays $0 (`skip-pays-nothing`) |
| L5 shift to results (C7) | no shift, no results | 5/5 fares, $193.12, 5.0 stars, 0 collisions, 0 red lights, score 218 |
| Sky presets, car-crop luma noon/golden/fog/night (C8) | 162.1 / 161.5 / 162.9 / 162.1 (lights never change) | 154.3 / 131.6 / 149.6 / 128.1 |
| Sky presets, frame luma | 106.8 / 103.9 / 104.0 / 100.4 | 98.5 / 86.1 / 108.7 / 33.2 |
| White car, chase steady state, car crop (C14) | mean 162.0, 0.03% at 245 or more | mean 154.2, 0% |
| GL draw calls, chase steady state (C12) | 610 | 411 |
| Bloom fusion vs `?aura3d-render=production` (RP-05) | not measured | mean abs diff 0.69/255, 7.2% of pixels over 2/255, max 11/255 |

The audit's 205 mean and 20% clipped on the white car came from a pre-4.5.0 frame; the base 4.5.0 build already measures 162 with no clipping, and removing the ambient light lowers it to 154.
