# Game Runtime Release Contract

Date: 2026-07-01
Status: honest remediation contract

This document describes the current public game-runtime boundary and the gates
required before Aura3D can claim reusable production-quality browser game kits.

## Current Public Pattern

The current public root path supports app lifecycle, runtime nodes, frame loops,
input helpers, and game evidence patterns:

```ts
import { createAuraApp, game, lights, model, scene } from "@aura3d/engine";
import { assets } from "./aura-assets";

const app = createAuraApp("#app", {
  scene: scene()
    .add(model(assets.fighter).runtime(game.runtimeNode("player")))
    .add(lights.studio())
});

const player = app.nodes.require("player");

app.onFrame(({ dt }) => {
  player.translate(dt, 0, 0);
});
```

## Current Public Game Strengths

- `createAuraApp` returns an app handle.
- Runtime nodes can be registered with `.runtime(game.runtimeNode("id"))`.
- `app.nodes.require("id")` can mutate gameplay nodes.
- `app.onFrame`, `app.offFrame`, `app.pause`, `app.resume`, and `app.step` are
  available for runtime updates and deterministic tests where exported.
- `game.input` and related helpers can support keyboard and replay-style tests.
- `game.eventLog(...)` plus generic `game.hud.score(...)`,
  `game.hud.objective(...)`, `game.hud.eventLog(...)`, and
  `game.evidence(...)` support non-fighting event and HUD source evidence.
- `game.platformer(...)`, `game.racing(...)`, and `game.fallingBlocks(...)`
  provide deterministic source-level genre kits with unit tests for movement,
  checkpoints, hazards, lap validation, line clears, hold, replay, and
  checksums.
- Fighting-game helper examples exist and can be documented only where the API
  and tests are current.

## Current Gaps

Do not claim reusable production-quality browser starters until these exist as
public routes with browser input and screenshot tests:

- browser-tested genre use of `game.collisionWorld(...)`; the generic collision
  facade covers overlap, sweep, resolution, enter/stay/exit events, and
  layer/tag filtering, and the genre kits are source-tested, but public
  examples need browser proof;
- platformer starter route using `game.platformer(...)` with keyboard tests for
  move, jump, land, collect, hazard, respawn, checkpoint, and finish;
- racing starter route using `game.racing(...)` with keyboard tests for
  throttle, steering, checkpoint order, lap validation, reset, and off-track
  behavior;
- mesh-derived or overlay-validated racing topology bound to real track asset
  hashes;
- mesh-derived or overlay-validated platformer playable surfaces bound to real
  world/stage asset hashes;
- game-to-scene transform validation proving car-to-road and character-to-world
  alignment in retained screenshots;
- public visual review that confirms the route looks like a credible game, not
  a proof harness.
- falling-block starter route using `game.fallingBlocks(...)` with keyboard
  tests for left/right, rotate, soft drop, hard drop, hold, lock, line clear,
  replay, and checksum.

## Route-Local Logic Rule

Route-local game logic can support a prototype, but it is not proof of a
reusable Aura3D game kit. Docs and READMEs must say "route-local prototype"
unless the mechanic is implemented in a public package API and tested from root
`@aura3d/engine`.

For public racing and platformer examples, route-local points, rectangles, or
timers are not enough. The game geometry must be bound to the visible typed
asset through retained topology or surface evidence.

## Release Evidence

A game route is not release-ready from source code alone. It needs:

- typed primary character/vehicle/world/track assets unless explicitly abstract;
- route-health JSON with category, claims, assets, primitive count, renderer
  backend, and fallback state;
- keyboard input test;
- visible state change after input;
- objective, scoring/fail state, reset, and progression/loop;
- genre-specific mechanic tests;
- retained game-geometry evidence for racing/platformer categories;
- desktop and mobile screenshots with readable gameplay;
- HUD state matching gameplay state.

## Current Game Example Status

Turbo Drift Circuit and Skyline Runner are intentionally removed from public
examples. The library is not being deleted. The game layer must be rebuilt
before these categories can return.

Current blockers:

- Turbo Drift Circuit:
  `asset-pair:racing-public-composition-bounds-missing`.
- Skyline Runner:
  `asset-pair:platformer-public-character-world-binding-missing`.

## Library Roadmap Link

Reusable game-kit work is tracked in
`docs/project/roadmaps/library-gap-roadmap.md` and
`docs/project/aura3d-game-layer-rebuild-plan.md`. Until those tasks pass
acceptance checks, platformer and racing showcase routes must be described as
route-local prototypes or prototype-blocked evidence routes.
