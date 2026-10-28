# Exposure parity with three.js r185 (lane L-Q, WP-Q.1)

Measured on software WebGL2 (SwiftShader) on the remote runner (`tools/remote-acr/run.sh`, spec `tests/browser/exposure-calibration.spec.ts`), 320x200 centre crop of a flat roughness-1 plane lit head-on, `output.exposure = 1`, 4.3.7 sources. Software GL only; not a real-GPU claim.

## Direction correction

The PRD text says "skinned character mean luma 144 (Aura3D) vs 192 (three.js)". The raw record says the opposite: `evidence/vs-threejs/results.json` has `meanLuma.three = [143.96, 145.33]` and `meanLuma.aura = [192.45, 192.39]`, and `RESULTS.md` section 9 lists "mean luma three / Aura (f25)" as `144.0 / 192.5`. Aura3D was the brighter one, so the calibration darkens Aura3D (removes an implicit fill), it does not brighten it.

## Cause

A scene that authored lights and no environment was still lit by the scene category's implicit studio/daylight environment (`compiler/environment.ts`, `categoryLighting`), on top of the authored lights. The authored light units were already correct (`A * I / PI`).

## Linear output vs three (ratio of measured / `A*I/PI` + the roughness-1 dielectric lobe)

| Case | 4.3.7 before | after |
| --- | --- | --- |
| directional 1, #808080 | 6.32 | 1.005 |
| directional 2.2 warm, #cc8844 | 2.37 / 3.66 / 4.78 | 0.997 / 0.998 / 1.006 |
| directional 3, white | 1.05 (clipped) | 1.000 |
| directional 0.5, #4488cc | 12.99 / 11.50 / 10.41 | 1.016 / 1.004 / 0.999 |
| directional 2, #6f8a5a | 3.72 / 3.65 / 3.84 | 0.995 / 1.001 / 1.011 |
| ambient 1, #808080 | 0.997 | 0.997 |
| ambient 0.5 + sun 2 | not run | 0.999 |
| hemisphere 1.3 (sky = ground) | 0 (light dropped; fill came from the category environment) | 1.014 / 1.003 / 1.011 |
| hemisphere 1.3 + sun 2 | not run | 1.004 / 1.000 / 1.001 |
| no lights at all (#808080) | linear 0.361 | unchanged on purpose (three renders black; Aura3D keeps the category environment so an unlit scene still shows) |

ACES display luma (default operator, exposure 1) for directional 1 on #808080: 188.9 before, 67.0 after, three.js reference 67.3.

## Known approximation

A hemisphere light enters as the mean of its sky and ground colours (three's value on a horizontal normal). Up- and down-facing surfaces differ from three by half the sky/ground gap. The calibration case uses sky = ground so it is exact. The skinned-character bench scene (`#dce8f2` over `#4d6358`) was not re-run in this lane.

## Baselines

No visual baseline was refreshed in this lane. Scenes affected: those with authored lights and no `environments.*` node and no light probe; they get darker (to the three numbers above). `environments.studio()` (or any `environments.*`) restores the old fill. `tests/browser/post-luma.spec.ts` fails at `daylight vignette` (0.722 against a 0.78 floor) both on the 4.3.7 sources and with this change, so it is not caused by it. `tests/browser/agent-api-visual-smoke.spec.ts` cannot bundle `@aura3d/engine/devtools` in the container (pre-existing).
