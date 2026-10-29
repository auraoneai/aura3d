# Cumulus Dash: audit 2026-10-29 before/after evidence (lane g25)

All frames are remote software WebGL2 (SwiftShader) on `tools/remote-acr/run.sh`, never a real GPU. Spec: `tests/browser/audit-fix/cloud-runner-port.spec.ts` (desktop 960x540, mobile 390x844 with `isMobile`/`hasTouch`). Each luma number is the second render at a `place(s)` point after a 30 s settle, never the first frame. `meta.txt` in each folder is the raw `CR_META` / `AB_META` output.

| Folder | Run | Code |
|---|---|---|
| `before/` | `g25-before-20261029164517` | base `audit-fix/integration` b2dba3713 (hook `__AURA_KID_GOKU__`) |
| `after-run1-no-vignette/` | `g25-after-20261029165453` | lane branch with the vignette removed (superseded: too bright) |
| `ab/` | `g25-abA-20261029174303`, `g25-abB-20261029174310`, `g25-abvig-20261029184802`, `g25-abflags-20261029184807` | lane branch with one edit reverted per variant |
| `after/` | `g25-after3-20261029192618` | lane branch final (vignette kept) |

## Steady-state mean luma (0-255)

| place(s) | before | after-run1 (no vignette) | after (final) |
|---|---|---|---|
| 60 | 130.71 | 198.63 | 131.21 |
| 520 | 129.78 | 194.22 | 130.26 |
| 1100 | 139.64 | 208.16 | 140.17 |
| 1420 | 127.01 | 191.10 | 127.26 |
| 1700 | 115.07 | 172.34 | 115.16 |

0% black and 0% clipped pixels in `before/` and `after/` at every point. The run-1 jump came from removing the vignette: the A/B variants that revert the sun angles, bloom radius, distance culling, checkpoint flags or `warmPrograms` all stay within 0.7 of the lane value (198.6 at s=60), and only the `vignette` variant returns to 131.2.

## Gameplay probes

| Row | before | after |
|---|---|---|
| CR-1 hearts=1, rock at s=45 | snapshot `dead`, phase `playing`, result null, score 42 then 129 after 600 more frames | phase `result`, won false, score 27 and still 27 after 600 frames |
| CR-2 retry after a win | `s=1850`, balls `[1,2,3,5,6,7,4]`, button "Run it again" | `s=0`, balls `[]`, button "Run again" |
| CR-5 finale | camera on the hut wall, hero out of frame, pearl row showing under the letterbox (`before/cr5-finale-page.jpg`) | hero and hut both in frame, HUD hidden (`after/cr5-finale-page.jpg`) |
| CR-6 portrait log | log band about y 490-665 of 844, rock-textured | log band about y 500-605 of 844, bark-coloured |
| CR-9 touch hint | "← → OR A D TO STEER" | "TAP ◀ ▶ TO STEER" |
| CR-11 post warnings | `post-field-deprecated:bloom.radius` twice | none |

## 1280x720 steady state (`before-hd/`, `after-hd/`)

Runs `g25-hd-before-194701` (base b2dba3713) and `g25-hd-after-194659` (lane). Second render at each point, after a 30 s settle.

| place(s) | before | after |
|---|---|---|
| 60 | 130.19 | 130.68 |
| 520 | 129.25 | 129.67 |
| 1420 | 125.96 | 126.38 |

Both: `hdr-msaa`, quality `auto`, bloom fusion `separable`, no `OPTION_IGNORED`, 0% black, 0% clipped. 240 frames of play from s=30 reached s=89 and score 361 on both builds (`hd-play-page.jpg`).

## Draw-call and texture budget (`before-budget/`, `after-budget/`)

Runs `g25-budget-before-195017` and `g25-budget-after-194950`, 960x540.

| place(s) | draw calls before | after | chunks culled | textureBytes |
|---|---|---|---|---|
| 60 | 187 | 149 | 39 | 172.7 MB → 176.9 MB |
| 520 | 159 | 130 | 33 | 176.9 MB |
| 1100 | 127 | 113 | 31 | 189.5 MB |
| 1420 | 84 | 78 | 31 | 189.5 MB |
| 1700 | 69 | 69 | 32 | 189.5 MB |
