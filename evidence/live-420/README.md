# Live 4.2.0 verification (production aura3d.auraone.ai, software WebGL2 remote runs)

Production deployment `aura3d-4qsyewnn7-veerone.vercel.app` from tag `v4.2.0` (`6c36be9c3`). Remote headless Chromium on SwiftShader (ACR runs `live420-idx1|idx2|idx3|port1|port1b|port2|port3|slam`; specs `tests/browser/live-index-games.spec.ts`, `live-ports-smoke.spec.ts` (patched on this branch to use the 4.2.0 canonical slugs from `docs/workflows/game-inventory.json`) and `liveslam.spec.ts`). **Software GL only: none of this is real-GPU evidence.** Raw results: `results.json`; hero frames: `frames/`.

## Result: 25 of 26 games pass their spec; 1 fails the liveness assertion only (it loads, draws, 0 errors)

- 15 index games: 15/15 pass (HTTP 200, canvas drawing non-black, frame changes, 0 console errors, 0 bad responses, no black-frame guard lines).
- 11 ports on their canonical slugs: 10/11 pass. **Ion Circuit (the heatsink port) fails the spec liveness assertion** in both runs (`live420-port1` and the flake-check rerun `live420-port1b`): frames and hook state did not advance within the 240x180 window at about 0.2 fps on the CPU rasteriser. It loaded and drew a lit non-black frame (non-black 0.97 to 1.00, 852 to 870 colours), 38 draw calls, 0 console and page errors, 0 bad responses. The same assertion failed at 4.1.3, so this is a software-GL speed limit, not a regression. Its gameplay is unverified here; only a real GPU can check it.
- Aura Slam route (`/apps/showcase-top-tennis/`): all 25 checks of `liveslam.spec.ts` pass; draw calls 119 at boot and at end (budget 150); single bundle `showcase-top-tennis-*.js`, no legacy scripts, diag panel clean, mobile HIT/LOB present, no horizontal scroll, 0 console errors, 0 non-200 assets.

## Site-level checks (curl)

- All 26 inventory URLs return 200. The homepage says "26 games" (twice) and "26 playable games" (once); inventory `liveGameCount` is 26.
- No `800K`, `15 games` or `4 playable` in the served homepage, `/llms.txt`, `/llms-full.txt`, `/apps/showcase-index/` or `/docs/aura3d-vs-threejs.html`.
- `/llms.txt` mentions 4.2.0 (1 time) and `/llms-full.txt` (3 times). The comparison page `/docs/aura3d-vs-threejs.html` is 200, titled "Aura3D 4.2.0 vs. three.js: measured, with the caveats", and links `evidence/vs-threejs/RESULTS.md`.
- All 11 old port slugs (`/apps/showcase-<slug>-port`) answer 308 to the new canonical path.

## Fifteen index games

| Game | HTTP | non-black | mean luma | frame changed | draw calls | console errors | bad responses | self-heal lines |
|---|---|---|---|---|---|---|---|---|
| iron-crown | 200 | 0.867 | 49.7 | 0.9711 | 79 | 0 | 0 | 0 |
| bunker-zero | 200 | 0.961 | 69 | 0.4377 | n/a | 0 | 0 | 0 |
| cross-hop | 200 | 0.995 | 107.7 | 0.4794 | 100 | 0 | 0 | 0 |
| top-tennis | 200 | 0.924 | 51.4 | 0.0552 | 119 | 0 | 0 | 0 |
| slingshot-siege | 200 | 0.977 | 107.3 | 0.0872 | 298 | 0 | 0 | 0 |
| roadster-rush | 200 | 0.995 | 84.2 | 0.409 | 721 | 0 | 0 | 0 |
| heatsink | 200 | 1 | 88 | 0.4707 | 1281 | 0 | 0 | 0 |
| teleoperator | 200 | 1 | 96.6 | 0.2623 | 460 | 0 | 0 | 0 |
| pips-big-leap | 200 | 1 | 152.5 | 0.9256 | 497 | 0 | 0 | 0 |
| aura-hoops-3d | 200 | 1 | 99.7 | 0.7769 | 95 | 0 | 0 | 0 |
| aura-diamond-3d | 200 | 1 | 79.4 | 0.2212 | 488 | 0 | 0 | 0 |
| aura-fc-3d | 200 | 1 | 105.4 | 0.779 | 357 | 0 | 0 | 0 |
| red-zone-3d | 200 | 1 | 110.2 | 0.3871 | 328 | 0 | 0 | 0 |
| aura-links-3d | 200 | 0.998 | 131.6 | 0.4515 | 74 | 0 | 0 | 0 |
| dot-dash-3d | 200 | 0.89 | 28.2 | 0.0321 | 67 | 0 | 0 | 0 |

## Eleven ports (heatsink appears twice: first run, then the flake-check rerun)

| Port -> live path | HTTP | canvas non-black | distinct colours | draw calls | fps (play) | console/page errors | bad responses | self-heal lines |
|---|---|---|---|---|---|---|---|---|
| heatsink -> /apps/ion-circuit/ | 200 | 1.000 | 852 | 38 | 0.25 | 0/0 | 0 | 0 |
| last-train -> /apps/lamplight-line/ | 200 | 1.000 | 1114 | 177 | 0.23 | 0/0 | 0 | 0 |
| strange-orbit -> /apps/craterline-gp/ | 200 | 1.000 | 1809 | 27 | 0.61 | 0/0 | 0 | 0 |
| splat-rush -> /apps/chroma-roll/ | 200 | 1.000 | 3342 | 88 | 1.31 | 0/0 | 0 | 0 |
| serpentine-sky-run -> /apps/serpentine-sky-run/ | 200 | 1.000 | 1917 | 19 | 0.76 | 0/0 | 0 | 0 |
| drift-and-deliver -> /apps/gridlock-courier/ | 200 | 1.000 | 1425 | 107 | 0.39 | 0/0 | 0 | 0 |
| ninja-runner -> /apps/shadowstep-gauntlet/ | 200 | 1.000 | 1602 | 43 | 0.29 | 0/0 | 0 | 0 |
| roadster-hours -> /apps/saltwind-highway/ | 200 | 0.999 | 1697 | 71 | 0.42 | 0/0 | 0 | 0 |
| where-the-wind-wanders -> /apps/the-bellkeepers-walk/ | 200 | 0.999 | 6448 | 16 | 0.46 | 0/0 | 0 | 0 |
| silt-and-signal -> /apps/duneglide/ | 200 | 0.997 | 1122 | 156 | 0.50 | 0/0 | 0 | 0 |
| cloud-runner -> /apps/cumulus-dash/ | 200 | 1.000 | 1685 | 187 | 0.30 | 0/0 | 0 | 0 |
| heatsink -> /apps/ion-circuit/ | 200 | 0.967 | 870 | 38 | 0.21 | 0/0 | 0 | 0 |
