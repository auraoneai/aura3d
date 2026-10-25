# Aura3D vs three.js: an honest comparison

Status: v3, 2026-10-25 (4.2.0 candidate). Replaces v2 (4.1.2) and the 4.0.0 marketing page, whose headline figures (`~120 lines vs 18`, `15 / 15 categories won`, `83% less bootstrap code`, `zero-dependency`) were not reproducible.

Sources: `evidence/vs-threejs/RESULTS.md` (bench, Aura3D 4.1.2), `evidence/agent-eval/` (cold-start trial, current-main tarballs), `evidence/stock-build/` (stock `vite build` smoke), `evidence/perf-frame-cost/`, `docs/workflows/aura3d-vs-threejs-matrix.md` (capability matrix), `docs/workflows/aura3d-vs-threejs-analysis-and-plan.md` (plan). three.js is 0.185.1 throughout.

## Read this first

- **Software GL.** Every timing and every render check is from a CPU-only remote runner with software WebGL2 (SwiftShader). They compare CPU and driver cost under equal conditions and say nothing about an Apple M-series or desktop GPU. Three games were checked on the owner's M4 Max; nothing else is real-GPU evidence.
- **Two kinds of evidence, both small.** The bench is five scenes written by one author who knows three.js far better than Aura3D (anecdote, not a study). The cold-start trial is one model (claude-sonnet-5.5) on five tasks, three runs per task, 40-turn budget (n=15 per arm), each run in an isolated sandbox with no repo context.
- **Versions matter.** Rows say which version produced them. Bench timings are Aura3D 4.1.2 (measured 2026-10-24); several fixes since then (cube frame cost 666 to 50 ms) were measured separately and are labelled.
- Aura3D wraps a three.js-compatible renderer lineage. Where they share a code path the result is a tie.

## The short version

Aura3D is a shorter, safer path from an idea to a shipped browser scene or game, especially when an AI agent writes the code, and it ships batteries three.js does not (game kit, QA and replay, safety net, asset provenance, deploy checks). three.js is the smaller, faster-to-first-frame, faster-to-author, far more mature runtime with a much larger ecosystem. Choose by what you are optimising.

## Where Aura3D is better (counted or measured)

| Area | Evidence | Version and label |
|---|---|---|
| Scene source length (non-blank lines of `scene.ts`) | PBR viewer 24 vs 49, forest 49 vs 71, skinned character 45 vs 62, game loop 61 vs 82. Not shorter: one cube (18 vs 15), shader water (87 vs 86, tie) | 4.1.2 bench, one author, software-GL harness. In 4.1.2 the Aura3D side also needed a generated assets file and a Vite config; the stock build works from 4.1.3 |
| Imports | 1 module vs up to 8; fewer distinct API symbols in all five visual scenes | 4.1.2 bench |
| Features in one call | bloom, shadow, per-instance colour instancing, fixed-step loop, QA and replay hooks, custom shader pass | 4.1.2 bench, `RESULTS.md` section 11 (author-assessed) |
| Game batteries | HUD, touch, juice, session (`@aura3d/engine/game`), audio cue bank, QA hooks, fixed-step loop, safety net with black-frame self-heal, scatter and merge, seeded RNG with draw counter; since 4.1.3 also a motion kit (`attachToBone`, `createLocomotion`, foot-slide meter, impact world with hit-stop and shake, smoothing) and a render interpolator and presenter that removes stalls on 120 and 144 Hz displays | counted from exports (`docs/api/root-exports.md`, `docs/api/motion-*.md`); the motion kit and presenter are new in 4.2.0 |
| Game pieces promoted from real games | `effects.toon`, `cameras.chase`, `prefabs.objectiveMarker`, compass and canvas minimap widgets, `createCountedRng`, `aura3d evidence judge` (blind A/B model judge), `installGameBeacon` | in 4.1.3 |
| Safety | production assets need a same-origin URL, sha256 and provenance or nothing draws; shader failures are reported loudly; `createFrameErrorBoundary` keeps drawing after a throwing frame; `?diag=1` panel | counted; found by real-device and cold-start failures, fixed in 4.1.x and 4.2.0 |
| Agent workflow | `llms.txt`, boundary docs, 14 skills, recipes with compiled scenes, `check-deploy`, an asset catalog searchable through the CLI (size not re-counted for this page), a Meshy pipeline with credit caps | counted |
| Cold-start first-try builds and typechecks | 15 of 15 builds and 13 of 15 typechecks first try (equal to three.js on builds) after the docs rewrite, from 10 and 8 at baseline | agent-eval, claude-sonnet-5.5, n=15, 40-turn budget, software GL |
| Shipped proof | the shipped games on the 4.x lineage (count generated from `docs/workflows/game-inventory.json`) with evidence folders and screenshots; Aura Slam is a complete native Aura3D game with a bit-identical simulation in differential tests against the original scripts, a replay gate and a render gate | counted in the repo; the live site count is generated from `docs/workflows/game-inventory.json` |
| Migration | `aura3d migrate three` classifies 245 constructs (21 exact, 174 approximate, 47 none, 3 pending); its output is an annotated worklist, not a finished port | counted; tested on the bench PBR viewer |

## Where three.js is better (measured)

| Area | three.js | Aura3D | Version and label |
|---|---|---|---|
| JS bundle, one-cube app | 495.7 KB raw, 124.8 KB gzip, 1 file | 3,841 KB raw, 1,089 KB gzip, 25 files (7.7x and 8.7x) | 4.1.2 bench, JS only |
| Stock hello-world build | about 0.5 MB | 3,262 kB raw / 964 kB gzip (4.1.3); 3,395 kB / 1,062 kB after the embedded neutral environment (4.2.0 candidate) | `evidence/stock-build/`, `evidence/neutral-embedded/`, JS plus CSS, Vite 7.3.2; three.js figure from the 4.1.2 bench |
| Requests on load | 2 | 26 | 4.1.2 bench |
| Time to first frame, cube (median of 3) | 95 ms | 3,269 ms | 4.1.2 bench, software GL |
| Frame time, cube | 0.9 ms | 623 ms at 4.1.2; about 50 ms after the 4.1.3 frame-cost work | 4.1.2 bench and `evidence/perf-frame-cost/`, software GL |
| Frame time, other scenes | 19.5 to 224.8 ms | 623 to 983 ms at 4.1.2 (three.js at 4x MSAA still 1.4 to 319 ms) | 4.1.2 bench, not re-run since |
| Forest, 18,000 instances | completes (1.4 s per frame at 4x MSAA) | about 38 s per frame at 4.1.2, about 6.4 s after 4.1.3 | `evidence/perf-frame-cost/`, software GL |
| Authoring speed for a coding agent | median 4 turns, 15 of 15 final renders non-black | median 10 turns, 14 of 15 final renders non-black (median 40 turns and 8 of 15 at baseline) | agent-eval, claude-sonnet-5.5, n=15, 40-turn budget, software GL; three.js has far more training data behind it |
| Draw calls, game loop | 19 | 38 | 4.1.2 bench |
| Subdivided plane for vertex displacement | supported | option accepted and ignored (4.1.2) | `RESULTS.md` section 12 |
| Breadth | 8 non-PBR material types, GTAO/SSR/SSGI passes, WebGPU renderer, WebXR, many loaders, about 638 TSL names | typed subset (62 TSL names), toon pass added, WebGL2 only by default | counted from source |
| Maturity | about 15.2M weekly downloads, 314 versions, years of field use | about 391 weekly downloads, 43 versions | npm snapshot: week of 2026-10-16 to 2026-10-22, versions on 2026-10-25 |

Ties: PBR, lights, primitives, instancing, helper objects, cube, array and stereo cameras; the shader-water picture was identical in both libraries (JSD 0.0000); game-loop replay hashes were identical.

## What this does not prove

- No real-GPU performance claim in either direction.
- No claim that Aura3D renders the same picture as three.js: the same nominal lights gave a brighter Aura3D frame (mean luma 89.3 vs 55.0 in the PBR viewer), so ports need exposure tuning.
- No "less code to make a game" claim: a complete game with HUD, audio and replay was not compared line for line (the cold-start trial built one complete mobile arcade game with Aura3D, n=1, as an existence proof).
- The cold-start numbers are one model on five small tasks. The trial found failures in our docs, product and harness, which are listed in `evidence/agent-eval/baseline1/NOTES.md`.

## What we measured and how

- **Bench** (`tools/bench-vs-threejs/`): five scenes plus a one-cube baseline, each built twice (three.js, Aura3D) as a standalone Vite app, measured on a remote CPU runner with software WebGL2 at 640x360. Metrics: scene lines and tokens, imports, bundle bytes, requests, time to first frame (median of 3), frame time (60 frames), draw calls, correctness (JSD of luma histograms). Method and caveats: `tools/bench-vs-threejs/README.md`, results: `evidence/vs-threejs/RESULTS.md`.
- **Cold-start trial** (`tools/agent-eval/`): fresh agents with no repo context in isolated sandboxes, Aura3D arm with the packed library and entry docs only, three.js arm with three.js types only, same prompts, same model, 40-turn budget, scored remotely (first-try typecheck, first-try build, non-black render, turns, tokens). Results and the list of what the trial fixed: `evidence/agent-eval/baseline1/NOTES.md`.
- **Stock build** (`tools/release/consumer-build-smoke.mjs`): packed tarballs installed into a fresh project, stock `vite build` and `vite dev`, no extra plugin, Vite 7.3.2 and 7.3.7: `evidence/stock-build/`.
- **Frame cost** (`tests/browser/perf-frame-cost.spec.ts`): median ms per frame, before and after: `evidence/perf-frame-cost/`.

## When to choose three.js

- You need WebGPU, WebXR, exotic loaders, SSR/SSGI/GTAO or the largest ecosystem (React Three Fiber, drei, tutorials, hiring pool).
- Bundle size and first-frame time on low-end devices are the main constraint.
- You have a large existing three.js codebase and no reason to rewrite it.
- A person (not an agent) is writing a quick one-off scene and already knows three.js.

## When to choose Aura3D

- An AI agent writes or maintains the scene or game and you want types, docs, recipes and guardrails that make wrong code fail loudly.
- You are shipping a browser game and want HUD, touch, audio, replay, a safety net, interpolation for high-refresh displays and deploy checks without assembling them.
- You want asset provenance and a verified deploy path.

## Migrating

See [`migration/from-threejs.md`](migration/from-threejs.md): the verified mapping for the 40 most common APIs, how to run the codemod, what it cannot do, and a measured before and after.
