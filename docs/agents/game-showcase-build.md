# Showcase game build guide

Version: 4.6.0

Use this when you add, edit or review a game on the public showcase (`apps/showcase-*`, the 15 cards on `https://aura3d.auraone.ai/apps/showcase-index/`, the Crayon ports in `examples/*-port`, and `examples/aura-slam`). Build the game with `docs/agents/build-a-game.md`; this page is what a showcase route adds on top: route-health, evidence, honest disclosure and the review gate.

## Non-negotiables

- Read `llms.txt` and `docs/agents/claims-and-boundaries.md` before writing code.
- Public imports only: `@aura3d/engine`, `@aura3d/engine/game`, `@aura3d/engine/audio`, `@aura3d/debug`. No renderer internals, no `three`, no deprecated subpaths (`production-runtime`, `advanced-runtime`). `tests/unit/agent-api/public-example-boundary.test.ts` fails the build on these.
- Typed assets only: GLBs through `defineModelAssets` or `src/aura-assets.ts`; no string asset ids, invented URLs or route-local loaders. Characters, vehicles and landmarks are never primitives; primitives are for ground, lines, rings and debug.
- The shell comes from the kit (`createGame` from `@aura3d/engine/game`); QA hooks from `installQaHooks`; safety net from `installSafetyNet`. A showcase route that hand-rolls these is a review finding.
- Hitboxes, boxes and debug rigs are hidden in normal play; debug visuals live behind an explicit debug or evidence mode.
- Remote verification only (`tools/remote-acr/run.sh`); never local Playwright, Docker or heavy builds. Software WebGL2 results are labelled as software GL.
- Licensed fonts and the dense UI preset named in the repository policy (`AGENTS.md`).

## Route anatomy

| Piece | Where |
| --- | --- |
| Entry and HTML | `apps/showcase-<slug>/index.html`, `src/main.ts` |
| Pure simulation | `src/game/` or `examples/<game>/sim/` (no DOM, no `Math.random`) |
| Typed assets | `src/aura-assets.ts` and `aura.assets.json`, or `defineModelAssets` |
| Route health | `apps/showcase-<slug>/route-health.json` |
| Evidence | `evidence/<game>/` (frames, `results.json`, README) |
| Specs | `tests/browser/<game>*.spec.ts` |
| Index card and disclosure | `apps/showcase-index/index.html`, generated pages in `tools/showcase-port-pages/` |

## Route health

`route-health.json` names the route, the renderer and fallback state, the exact primary assets, the claim label and its limits. `node scripts/check-route-health.mjs` validates it. Its rules: `publicShowcase: true` needs `qualityGate.status === "accepted"` with human reviewer logins in `acceptedBy` (agent ids are rejected), there are no free-text quality claims, and no route-local asset may self-assign `quality: "release"`. Agents never accept their own work.

## Evidence a public game ships with

- The page and every JS, CSS, GLB, texture and audio request return 200; zero console errors and page errors; a non-blank canvas.
- The QA global (`window.__AURA_<NAME>__`) reports `ready`, a plain-data `state()` and a stable replay hash for a seeded script.
- Input changes state, restart works after win and fail, and at least 60 seconds of player-driven play is demonstrated.
- Draw calls are within the route's budget, read from `app.diagnostics()` or `?diag=1` (Aura Slam: 150, measured 119 live).
- Frames for first load, after input, mid-route, fail or reset, finish, and mobile 390x844. Original-game frames used for comparison stay local and gitignored.
- For ports: a replay against a recorded reference (the Crayon ports match to 1e-6 or better; Aura Slam is bit-identical in differential tests) and a blind judge result stated as a model judge (`aura3d evidence judge`), never as human agreement.
- `aura3d assets validate-game`, `aura3d assets validate --no-placeholders --require-license` and `aura3d check-deploy --dist dist` pass for the exact route.

## Disclosure copy

State what the page is, what it is not, and the measured state. Examples that are in use: "Time Trial mode only; the art is generated and checked on software WebGL2 only"; "Independent game built with Aura3D; not affiliated with any other game or studio." Games are named for themselves: no "port" or "reconstruction" wording and no other game's name in titles, UI or metadata. Never write "polished", "flagship", "Unity replacement", "Unreal competitor", "Babylon parity" or "drop-in three.js replacement". Software-GL numbers are never GPU numbers.

## Review checklist

- [ ] Built from the kits (`build-a-game.md`), no hand-rolled shell
- [ ] Typed assets, no primitives for characters or vehicles
- [ ] Remote spec run id recorded; 0 console errors; frames saved
- [ ] Replay stable twice; draw calls within budget
- [ ] `route-health.json` valid; disclosure matches the evidence
- [ ] Mobile frame checked; no horizontal scroll; HUD not covering play area

## History

Earlier versions of this page described only `apps/aura-clash-showcase` and referenced release scripts that no longer exist in `package.json` (`verify:aura-clash-flagship`, `verify:aura3d110-performance`, `verify:aura3d110-deployed-visual`, `aura3d110:readiness`). That app's own tests remain `pnpm --dir apps/aura-clash-showcase test:playable` and `test:flagship`; run them through the remote runner.
