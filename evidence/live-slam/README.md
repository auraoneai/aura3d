# Live verification: native Aura Slam at /apps/showcase-top-tennis/ (2026-10-24)

Target: https://aura3d.auraone.ai/apps/showcase-top-tennis/ (deployment `aura3d-1s0m4ogqa-veerone.vercel.app`, main `09ccc9518`).
Method: remote headless Chromium on SwiftShader (software WebGL2) via `tools/remote-acr/run.sh`, spec `tests/browser/liveslam.spec.ts`, runs `liveslam-10241003` and `liveslam-full-1038` (frames and `results.json` are from the second run). Plus one Prism Browser check in a session of its own (opened and closed). Software GL only: this is not real-GPU evidence.

## Results

| Check | Result |
|---|---|
| HTTP 200, `data-aura-slam-ready`, title "Aura Slam 3D - Championship 3D Tennis on Aura3D" | PASS |
| Only one script, `/assets/showcase-top-tennis-*.js`; no `toptennis` legacy scripts | PASS |
| No 'Busted' / spreadsheet / work-sheet text in the DOM, pause card or menu | PASS |
| Quick Match starts; real key events (Space serve, arrows hold) change the match state; ball speed readout moves (135 km/h) | PASS |
| Pause card (P) shows Resume / Settings - Controls / New match, no 'Busted'; P resumes | PASS |
| Modes menu: Single Game enabled; Tournament and Online disabled with "Coming soon" | PASS |
| Smash Lab starts and returns to Quick Match | PASS (frame 05) |
| Mobile 390x844 touch: HIT 105x105, LOB 56x56, joystick visible, no horizontal scroll | PASS |
| Draw calls <= 150 | PASS (119 at boot and end; 117-125 in frames) |
| `?diag=1` panel: rung 0 (full), black 0, healthy, no errors captured, no shader/link/context-lost lines | PASS |
| Self-heal / black-frame guard did not fire (0 console lines) | PASS |
| Aura asset requests all 200 (6) | PASS |
| 0 console errors, 0 page errors, 0 bad responses (desktop and mobile) | PASS |

Spec note: as run, `diagClean`/`diagCleanEnd` failed because the regex `/SHADER/i` matched "SwiftShader" in the GPU line. That was a spec bug (fixed in `liveslam.spec.ts`); `results.json` keeps `checksAsRun` and recomputes the two checks from the stored panel text (`checks`). No rerun with the fixed regex was done.

Prism (cloudflare provider, own sessions): page loads, `ready=true`, one bundle, no 'Busted', Tournament and Online disabled, `?diag=1` panel shows rung 0 and "no errors captured".

## Defects seen (not fixed in this lane)

1. Modes menu (frame 04) renders cramped and unstyled: content flush to the left viewport edge, no panel chrome, mode cards touching, footer links ("Home Settings How to play") jammed together. The pause card (frame 03) is fine.
2. Mobile portrait (frame 06): the quick-switcher bar overlaps the scoreboard and the court is cropped (left player partly off-screen, net split).
3. Engine warning in the panel: "Scene has no interactions" (harmless for a game that uses its own input, but noisy), and `POSTPROCESS_V2_UNMIGRATED` console warning (legacy post chain kept).

## Not ported (documented in `docs/aura-slam/ARCHITECTURE.md`)

Tour and tournament, online play and lobbies, roster/appearance/character select (Phase 2 UI), telemetry, PWA, SEO page. Legacy URLs `toptennis/*` return 404.

Frames: `01_boot` ... `06_mobile` (JPEG q72). Raw data: `results.json`.
