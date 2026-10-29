# Wonder World P0 foundation evidence

**Status: prototype.** The P0 gate of `04` (A01-A11, F0.1-F0.6, J08): the app builds, passes its content lint, privacy scan and `aura3d check-deploy --browser`, draws its first frame from the admitted models and from the stand-ins, and the published `create-aura3d@4.5.0` scaffold builds and serves outside the monorepo. Every result here comes from headless Chromium (HeadlessChrome 147 on Linux x86_64) on the remote runner with software WebGL2, renderer `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)`. That is **not real-GPU or physical-device evidence**: times are wall-clock times on a software renderer, not performance numbers. No real child's image, audio or name is in any file here; the specs redact what they print and `apps/<app>/tools/extract-remote-evidence.mjs` redacts again (`<app>` is the app's folder name).

| | |
| --- | --- |
| Commit under test | `7e1986801` (tree clean) for `audio-and-pausing`, `consumer-smoke`, `look`, `low-motion`, `low-motion-2`, `no-speech-required`, `no-speech-required-2`, `parent-panel`, `playback-activities`, `playback-episodes`, `playback-episodes-2`, `stills`, `stills-2`, `stills-3`, `stills-4`, `touch-and-layout`; `498c32f63` (tree clean) for `characters`, `characters-2`, `characters-3`; `2ae4125d1` (tree clean) for `first-frame-build` (the three commits differ only in tests/browser spec files; the app is the same), from each record's `commit` field (written by `apps/<app>/tools/remote-run.sh` into `.run-commit`) |
| Engine | `@aura3d/engine` 4.5.0 (`engineVersion` in each record) |
| Renderer | `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)` |
| Date | 2026-10-29, fan-out stamp `20261029T172337Z`; `first-frame-build` from `20261029T174544Z`; `characters`, `characters-2`, `characters-3` from `20261029T182623Z` (one ACR run per line of the run list in `tests/browser/wonder-world-lib.ts`, one shared image, deleted after the runs) |

## Runs
| Run ID | Specs | Result | Records |
| --- | --- | --- | --- |
| `wonder-first-frame-build-20261029T174544Z` | `tests/browser/wonder-world-first-frame.spec.ts`, `tests/browser/wonder-world-build.spec.ts` | passed: 4 passed (20.7 min) | [screens/2026-10-29/first-frame-build/](screens/2026-10-29/first-frame-build/) (8 records, 3 images) |
| `wonder-consumer-smoke-20261029T172337Z` | `tests/browser/wonder-world-consumer-smoke.spec.ts` | passed: 1 passed (6.9 min) | [screens/2026-10-29/consumer-smoke/](screens/2026-10-29/consumer-smoke/) (1 record, 1 image) |

## Build and deploy check (`tests/browser/wonder-world-build.spec.ts`)
| Step | Result |
| --- | --- |
| Content lint (`node tools/validate-wonder-world-content.mjs`, also run by `npm run build`) | exit 0: "OK: content lint passed" |
| Vite build | 1002 files, 56.5 MB: GLB 24.1 MB, MP3 21.1 MB, JS 7.8 MB |
| Privacy scan of the built `dist` (the child's name, derived from the folder name, and source maps) | 25 text files, 0 source maps, 0 hits |
| `aura3d check-deploy --dist dist --no-assets --browser --route /` | exit 0: "Deploy check passed. Browser pass: 1 route(s) loaded with no HTTP errors, failed requests or console errors." |

## First frame (`tests/browser/wonder-world-first-frame.spec.ts`)
E17 "Sheru's Big Adventure", opening beat, 1.5 s in.

| Capture | Drawn from | Viewport | Draw calls | Model / stand-in nodes | Mean luma | Console / page errors, bad responses |
| --- | --- | --- | --- | --- | --- | --- |
| [`first-frame-models`](screens/2026-10-29/first-frame-build/first-frame-models.jpg) | admitted models | 1024x768 | 78 | 2 / 1 | 191.7 | 0 / 0 / 0 |
| [`first-frame-standins`](screens/2026-10-29/first-frame-build/first-frame-standins.jpg) | stand-ins (`models=0`) | 1024x768 | 122 | 0 / 3 | 195.0 | 0 / 0 / 0 |
| [`first-frame-diag`](screens/2026-10-29/first-frame-build/first-frame-diag.jpg) | stand-ins (`models=0`), `?diag=1` | 1024x768 | - | - / - | - | 0 / 0 / 0 |

The `?diag=1` panel (`first-frame-diag`), as captured:

```text
Aura3D safety net (?diag=1)
gpu: ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)
maxTex 8192 units 32 samples 4 fragUniforms 4096 varyings 31
color_buffer_float:y texture_float_linear:y multi_draw:y disjoint_timer_query_webgl2:n navigator.gpu:y dpr 1
engine: backend=webgl2 drawCalls=120 fps=60 warn:Scene has no interactions. Suggested fix: add interactions.orbit() for product/v
canvas: canvas 1024x768 (css 1024x768)
safety: rung 0 (full) off:[] quality:default tm:default heal:on
no errors captured
```

## Consumer smoke (`tests/browser/wonder-world-consumer-smoke.spec.ts`)
The published `create-aura3d@4.5.0` `mini-game` scaffold, outside the monorepo in a temp folder, Node v24.14.1.

| Step | Command | Exit | Seconds |
| --- | --- | --- | --- |
| create | `npx -y create-aura3d@4.5.0 smoke --template mini-game --no-agent` | 0 | 3.1 |
| install | `npm install --no-audit --no-fund` | 0 | 18.7 |
| npm ls | `npm ls @aura3d/engine @aura3d/cli --json` | 0 | 0.3 |
| build | `npm run build` | 0 | 13.8 |
| check-deploy | `npx -y @aura3d/cli@4.5.0 check-deploy --dist dist` | 0 | 3.5 |
| check-deploy --browser | `npx -y @aura3d/cli@4.5.0 check-deploy --dist dist --browser --route / --browser-timeout 180000 --browser-settle 300000` | 1 | 340.9 |

Browser pass (`check-deploy --browser` on the scaffold's build): exit 1, 12 failures, all upstream (`07` B32) unless listed as other (0 other). They are the template's own missing demo media (`/packs/game-sfx-core/*.m4a`, `/probes/probe-20ms.*`, `/aura-assets/Textures/colormap.png`, which the template requests but does not ship) and, once the hero check below has shown the hero loads, its aborted duplicate hero request. The spec fails on any other failure.

Hero check: the spec serves the built scaffold itself and opens it. Ready: true; the hero GLB (`/aura-assets/kaykit-barbarian.glb`) finished downloading 2 times with 0 failed requests, and the template reports 76 hero clips (1H_Melee_Attack_Chop, 1H_Melee_Attack_Slice_Diagonal, 1H_Melee_Attack_Slice_Horizontal, 1H_Melee_Attack_Stab, ...). [Screenshot at the ready mark](screens/2026-10-29/consumer-smoke/consumer-smoke-scaffold.jpg).

## Known gaps
- Software WebGL2 only. The real-GPU and physical-device runs are `07` §4.3 item 1.
- The consumer smoke's browser pass lists the mini-game template's missing demo media and its aborted duplicate hero request (`07` B32). Those are upstream template behaviour, not the SDK's core and not this app.
- Load and frame times on the software renderer say nothing about device performance; `06` §6 baselines stay unset until the device runs.
