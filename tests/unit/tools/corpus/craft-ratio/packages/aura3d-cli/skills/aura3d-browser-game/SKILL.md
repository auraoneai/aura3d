---
name: aura3d-browser-game
description: Builds a playable Aura3D browser game route on the public genre kits with typed assets, deterministic input, reset, an objective, and game-geometry and runtime evidence. Use when working in the `mini-game`, `racing-starter`, `falling-blocks-starter`, `fighting-game`, or `character-controller` templates, calling `game.platformer`, `game.racing`, `game.fallingBlocks`, `game.fighting`, or `game.evidence`, or running `assets validate-game`, `assets certify-game-geometry`, or `assets bind-game-route-evidence`.
---

# Aura3D browser game

A route with a scene and a key listener is not a game. A public game proves
input, reset, an objective, and a progression loop in the browser. Shared rules
(claim labels, forbidden patterns, typed assets, benchmark mode) are in
[boundaries](../aura3d-core/references/boundaries.md).

## Establish the contract

1. Run `npx @aura3d/cli@latest --help`. Use only the `assets validate-game`,
   `assets certify-game-geometry`, and `assets bind-game-route-evidence` flags
   it prints; `--category` accepts only `racing` or `platformer`.
2. Read `src/aura-assets.ts` and `aura.assets.json`. Player, vehicle, track,
   and world must be typed keys with a role (`character`, `vehicle`, `track`,
   `world`). Missing keys: load `aura3d-assets` first.
3. Read the template `package.json` so you know what `npm run test` runs.
4. Decide the mode. Benchmark mode: edit, `npm install && npm run build`, stop.

## Procedure

1. Start from the matching template: `npx create-aura3d@latest <dir> --template
   mini-game` (platformer), `racing-starter`, `falling-blocks-starter`,
   `fighting-game`, or `character-controller`.
2. Use the genre kit before writing rules. `game.platformer`, `game.racing`,
   `game.fallingBlocks`, and `game.fighting` are deterministic source-level
   helpers. Route-local mechanics are allowed only for what a kit cannot
   express, and each one is documented as a library gap.

   ```ts
   import { createAuraApp, game, lights, model, scene } from "@aura3d/engine";
   import { assets } from "./aura-assets";

   const app = createAuraApp("#app", {
     scene: scene()
       .add(model(assets.hero).runtime(game.runtimeNode("player", { tags: ["player"] })))
       .add(lights.studio())
   });
   const player = app.nodes.require("player");
   const input = app.input({
     actions: { left: ["KeyA", "ArrowLeft"], right: ["KeyD", "ArrowRight"], jump: ["Space"], restart: ["KeyR"] },
     axes: { moveX: { negative: "left", positive: "right" } },
     bufferMs: 120
   });
   const level = game.platformer({
     start: { x: 0, y: 0.35 },
     finish: { x: 12, y: 0.35 },
     platforms: [{ id: "ground", x: -1, y: 0, width: 14, height: 0.35 }]
   });

   app.onFrame(({ dt }) => {
     input.update(dt);
     const state = level.step(dt, { moveX: input.axis("moveX"), jumpPressed: input.buffered("jump") });
     player.setPosition(state.player.x, state.player.y, 0);
   });
   ```

3. Call the input update once per frame before any query. Only nodes marked
   with `game.runtimeNode` are mutable at runtime.
4. Wire HUD and events through `game.eventLog` and `game.hud.*`, and pause,
   reduced motion, and focus through `game.accessibility.*`. The route owns DOM
   layout; the bindings own the values.
5. Make reset real: restart after normal play and after win or fail returns
   score, timer, bodies, input, and animation to baseline.
6. Genre gates (from the game example standards):
   racing needs throttle, brake, steer, ordered checkpoints, a lap or finish,
   and a penalty or timeout;
   platformer needs move, jump, fall, collision that matches visible ledges,
   collectibles, hazards, and a camera that keeps the player visible;
   falling blocks needs move, rotate, soft and hard drop, lock, line clear,
   scoring, levels, and game over. Plan for 60 seconds of meaningful play.
7. Validate assets:

   ```bash
   npx @aura3d/cli@latest assets validate --no-placeholders --require-license
   npx @aura3d/cli@latest assets validate-game --no-placeholders --require-license
   ```

8. Racing and platformer: certify the rendered geometry, then bind it to the
   route with a screenshot and reports captured remotely.

   ```bash
   npx @aura3d/cli@latest assets certify-game-geometry --asset track --category racing
   npx @aura3d/cli@latest assets bind-game-route-evidence --route main --category racing \
     --assets car,track --screenshot <png> --geometry-report <json> \
     --composition-report <json> --visual-review <json>
   ```

9. Collect runtime evidence after at least one stepped frame: pause, step one
   frame, then call `game.evidence` with the input, bodies, events, HUD, and
   app state.
10. Normal mode: `npm run build` locally, then `npm run test` (Playwright:
    movement, restart, one score or fail or finish mechanic, desktop and mobile
    screenshots) in CI or on a remote runner. Hand results to
    `aura3d-evidence-review`.

## Stop and report

- `assets certify-game-geometry` returns `"ok": false` or a blocker such as
  `racing-road-mesh-not-found`: the track or world is not game-ready. Label the
  route `prototype`; do not hide the gap with primitive ledges or road strips.
- Manual input cannot complete the route while a proof replay can: `prototype`.
- The primary player, vehicle, or world is a primitive stand-in: `prototype`.
- `assets validate-game` crashes or fails: report the exact message and label
  the route `blocked` for public claims. Do not skip the gate.
- A kit is missing a needed rule (fail state, collision semantics, path
  alignment): write it route-local, say so, and file a library gap.
- Benchmark mode: stop after the build and report the runner-owned command.

## References

- [Shared boundaries](../aura3d-core/references/boundaries.md)
- [Build a browser game](https://github.com/auraoneai/aura3d/blob/main/docs/guides/build-a-browser-game.md)
- [Game example standards](https://github.com/auraoneai/aura3d/blob/main/docs/agents/game-example-standards.md)
- [Game showcase build](https://github.com/auraoneai/aura3d/blob/main/docs/agents/game-showcase-build.md)
- [Game runtime API](https://github.com/auraoneai/aura3d/blob/main/docs/api/game-runtime.md)
- [Aura Clash showcase](https://aura3d.auraone.ai/docs/aura-clash-showcase.html)
