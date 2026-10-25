# hotfix-brand: remote verification (software WebGL2, not real-GPU)

Branch `hotfix-brand` off `origin/main` (fd7141d3a). All browser runs are on the remote ACR runner (SwiftShader, 960x540 for the boot check, 320x180 with effects off for the 10-minute run). Frames and per-game results: `*.jpg`, `results.json`, `hoops-hit-stop.json`.

## 1. Cleaned assets: each affected game boots from a built copy (`tests/browser/hotfix-brand.spec.ts`, ACR run `hotfix-2`: 6 of 6 passed)

Per game: 0 console errors, every GLB it requests answers 200, none of the removed original files is requested, the cleaned model is requested, the frame is not black (mean luma > 8).

| Game | Cleaned models requested | Mean luma | Frame |
|---|---|---|---|
| Aura Hoops 3D | `hoopsAthleteBigClean`, `hoopsAthleteGuardClean` | 65.9 | `aura-hoops-3d.jpg` |
| Aura Diamond 3D | `diamondAthleteClean` | 81.4 | `aura-diamond-3d.jpg` |
| Aura Links 3D | `linksGolferAthleteClean` | 112.9 | `aura-links-3d.jpg` |
| Aura FC 3D | `fcSoccerStrikerClean`, `fcGoalkeeperClean` | 130.6 | `aura-fc-3d.jpg` |
| Red Zone 3D | `rzQuarterbackClean` | 63.8 | `red-zone-3d.jpg` |
| Teleoperator | `teleopWaymoClean`, `teleopCybercabClean`, `teleopCorvetteClean` | 69.4 | `teleoperator.jpg` |

HDR environment files 404 in the static server used for these runs (the files are not copied into the probe dist); that is unrelated to this change and was filtered from the error count the same way earlier probes did.

Not browser-checked (no live app uses them): the Formula opponent, Tsukuba circuits and the rooftop athletes. Their cleaned files are covered by the manifest integrity tests (`tests/unit/likeness-audit/brand-clean-assets.test.ts`).

## 2. Hoops hit-stop freeze (`tests/browser/hotfix-hoops-hitstop*.spec.ts`, 10-minute autoplay, ACR runs `hotfixhs-old` and `hotfixhs-new`)

A per-frame signature of the simulation (ball, athlete positions, score) was recorded; a frozen match repeats the same signature.

| Build | Frames | First made basket at frame | Frames after it | Identical to the previous frame | Longest identical run | Phases seen |
|---|---|---|---|---|---|---|
| old (`origin/main`) | 203 | 73 | 130 | **129** | 129 (to the end of the run) | live, shot, score |
| new (hit-stop on real frame time) | 192 | 73 | 119 | **15** | 14 | live, shot, score, check |

The old build never leaves the "score" phase after the first basket; the new build continues into the next phase. Both runs: 0 console errors. Software GL renders only about 0.3 frames per second, so these 10-minute runs cover roughly 190 frames (at most about 10 game seconds at the 0.05 s per-frame cap). They show the match unfreezing after the first basket, not a full match; a full match would need a real GPU.

Unit test (`tests/unit/aura-hoops/hit-stop.test.ts`): a simulated 90 ms dunk hit-stop freezes 5 to 7 frames of real time and then game time runs again; the old game-time countdown model never ends.
