# Aura3D vs three.js: an honest comparison

Status: v2, 2026-10-24. Replaces the 4.0.0 marketing page, whose headline figures (`~120 lines vs 18`, `15 / 15 categories won`, `83% less bootstrap code`) were not reproducible and used APIs that do not exist.

Sources: `evidence/vs-threejs/RESULTS.md` (measured), `docs/workflows/aura3d-vs-threejs-matrix.md` (54-row capability matrix), `docs/workflows/aura3d-vs-threejs-analysis-and-plan.md` (plan). Versions: Aura3D 4.1.2 against three.js 0.185.1.

## Read this first

- Timings are from a CPU-only remote runner with software WebGL2 (SwiftShader). They compare CPU and driver cost under equal conditions. They say nothing about an Apple M-series or desktop GPU.
- Five small scenes, written by one agent that knows three.js far better than Aura3D (the Aura3D side also read repo examples). Treat counts as anecdote, not a controlled study. A controlled cold-start trial (`tools/agent-eval/`) is being built to replace it.
- Aura3D wraps a three.js-compatible renderer lineage. Where they share a code path the result is a tie.

## The short version

Aura3D is a shorter, safer path from an idea to a shipped scene or game, especially when an AI agent writes the code. three.js is the faster, smaller, more mature runtime with a far larger ecosystem. Choose by what you are optimising.

## Where Aura3D is better (measured or counted)

| Area | Evidence |
|---|---|
| Scene source length (non-blank lines, `scene.ts`) | PBR viewer 24 vs 49, forest 49 vs 71, skinned character 45 vs 62, game loop 61 vs 82. Not shorter: one cube (18 vs 15) and shader water (87 vs 86, tie). |
| Imports | 1 module vs up to 8; fewer distinct API symbols in all five visual scenes |
| Features in one call | bloom, shadow, per-instance colour instancing, fixed-step loop, QA/replay hooks, custom shader pass (RESULTS section 11) |
| Safety | Production assets need a same-origin URL, sha256 and provenance or nothing draws; shader failures are reported loudly; black-frame self-heal and a `?diag=1` panel |
| Agent workflow | `llms.txt`, boundary docs, 24 skills, `check-deploy`, a 652-entry asset catalog, a Meshy pipeline with credit caps |
| Game batteries | HUD, touch controls, audio cue bank, scatter and merge planners, seeded RNG, deterministic replay (`@aura3d/engine/game` and kits) |
| Migration | `aura3d migrate three` classifies 245 constructs (21 exact, 174 approximate, 47 none, 3 pending) |
| Shipped proof | 26 games on the 4.x lineage, Aura Slam as a complete native port with replay and render gates |

## Where three.js is better (measured)

| Area | three.js | Aura3D 4.1.2 |
|---|---|---|
| JS bundle, one-cube app | 495.7 KB raw, 124.8 KB gzip, 1 file | 3,841 KB raw, 1,089 KB gzip (7.7x and 8.7x), 25 files |
| Requests on load | 2 | 26 |
| Time to first frame, cube (median of 3) | 95 ms | 3,269 ms |
| Frame time, cube, software GL | 0.9 ms | 623 ms at 4.1.2; about 50 ms after the 4.1.3 perf work (`a816facf6`) |
| Frame time, other scenes | 19.5 to 224.8 ms | 623 to 983 ms at 4.1.2, with three.js at 4x MSAA still 1.4 to 319 ms |
| Draw calls, game loop | 19 | 38 |
| Stock build | `vite build` works with no config | 4.1.2 needed an extra package, a plugin and a config file; the browser-safe import fix is on main for 4.1.3 (unreleased) |
| First-try authoring | 3 edits, 0 silent wrong-API uses | 7 edits, 2 silent no-ops (`plane` segments, `orbit` options) |
| Subdivided plane for vertex displacement | supported | option accepted and ignored |
| Breadth | 8 non-PBR material types, GTAO/SSR/SSGI passes, WebGPU renderer, WebXR, many loaders, about 638 TSL names | typed subset (62 TSL names), toon pass added on main for 4.1.3 (unreleased), WebGL2 only by default |
| Maturity | about 15.2M weekly downloads, 314 versions, years of field use | about 391 weekly downloads, 42 versions (npm snapshot) |

Ties: PBR, lights, primitives, instancing and helper objects; the shader-water picture was identical in both libraries (JSD 0.0000); game-loop replay hashes were identical.

## What this does not prove

- No real-GPU performance claim in either direction. Three games were checked on the owner's Apple M4 Max; everything automated is software GL.
- No claim that Aura3D renders the same picture as three.js: the same nominal lights gave a brighter Aura3D frame (mean luma 89.3 vs 55.0 in the PBR viewer), so ports need exposure tuning.
- No "less code to make a game" claim: a complete game with HUD, audio and replay was not compared.

## When to choose three.js

- You need WebGPU, WebXR, exotic loaders, SSR/SSGI/GTAO or the largest ecosystem (React Three Fiber, drei, tutorials, hiring pool).
- Bundle size and first-frame time on low-end devices are the main constraint.
- You have a large existing three.js codebase and no reason to rewrite it.

## When to choose Aura3D

- An AI agent writes or maintains the scene or game and you want types, docs and guardrails that make wrong code fail loudly.
- You are shipping a browser game and want HUD, touch, audio, replay and deploy checks without assembling them.
- You want asset provenance and a verified deploy path.

## Migrating

See [`migration/from-threejs.md`](migration/from-threejs.md): the verified mapping for the 40 most common APIs, how to run the codemod, what it cannot do, and a measured before and after.
