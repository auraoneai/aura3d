---
name: aura3d-browser-game
description: Builds a playable Aura3D browser game route on the public genre kits with typed assets, deterministic input, reset, an objective, and a genre look recipe driven through the look-dev loop. Use when working in the `mini-game`, `racing-starter`, `falling-blocks-starter`, `fighting-game`, or `character-controller` templates, calling `game.platformer`, `game.racing`, `game.fallingBlocks`, `game.fighting`, or `game.evidence`, or running `assets validate-game` or `assets certify-game-geometry`.
---

# Aura3D browser game

A route with a scene and a key listener is not a game — and a playable scene
with flat lighting is not a finished game. A public game proves input, reset,
an objective and a progression loop in the browser AND looks like its genre.
Shared rules (claim labels, forbidden patterns, typed assets, benchmark mode)
are in [boundaries](../aura3d-core/references/boundaries.md).

## Look target

Genre → recipe row (full table: `../aura3d-art-direction/references/look-recipes.md`):

| Template | Look | Camera | Frame mood |
| --- | --- | --- | --- |
| `mini-game` | `outdoor-day` | `follow` (side-on) fov 50 | saturated greens, sky blue, warm wood + coin gold; fog 0.0025; `daylight-outdoor` post; coin sparkle + land dust |
| `racing-starter` | `golden-hour` | `chase` fov 60 | warm asphalt, burnt orange, charcoal + headlight amber; low sun haze; `cinematic-film` post; brake glow |
| `falling-blocks-starter` | `neon-arcade` | `orthographic` (top-down) fov 45 | neon palette per piece colour, dark glossy board + accent rim; `neon-night` post; line-clear flash |
| `fighting-game` | `arena-fight` | `follow` (side-on) fov 45 | arena dark, rope colour, crowd shadow + spotlight rim; haze cone; `arena-fight` post; hit sparks |
| `character-controller` | `outdoor-day` | `shoulder` fov 55 | open world greens + cloth accent; fog to horizon; `daylight-outdoor` post |

## Establish the contract

1. Run `npx @aura3d/cli@latest --help`. Use only the commands and flags it
   prints; `--category` accepts only `racing` or `platformer`.
2. Read `src/aura-assets.ts` and `aura.assets.json`. Player, vehicle, track,
   and world must be typed keys with a role (`character`, `vehicle`, `track`,
   `world`). Missing keys: load `aura3d-assets` first.
3. Read the template `package.json` so you know what `npm run test` runs.
4. Decide the mode. Benchmark mode: if `aura3d look capture` is available, run
   the look-dev loop; otherwise build and stop, label `prototype`.

## Procedure

1. Scaffold the matching template, then add the genre look before any props:

   ```ts
   import { createAuraApp, game, looks, model, scene } from "@aura3d/engine";
   import { assets } from "./aura-assets";

   const app = createAuraApp("#app", {
     scene: scene()
       .add(looks.preset("outdoor-day"))
       .add(model(assets.hero).runtime(game.runtimeNode("player", { tags: ["player"] }))),
     ...looks.appOptions("outdoor-day")
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

2. The look supplies the sky light, key shadow, fog and grade — do not add
   `lights.studio()` or `lights.ambient()` on top.
3. Typed models at real scale for hero/collectibles (emissive 3–5 on pickups
   reads as sparkle under the post grade); platforms/track from the best
   typed catalog kit.
4. Camera state drives `app.camera` every frame (rig from the genre row) —
   never write camera position into evidence fields.
5. Wire HUD and events through `game.eventLog` and `game.hud.*` — DOM HUD only,
   no in-world counters, no debug overlay in shipped frames.
6. Make reset real: restart after normal play and after win or fail returns
   score, timer, bodies, input, and animation to baseline.
7. Genre gates (mechanics, from the game example standards):

   | Genre | Must have |
   | --- | --- |
   | racing | throttle, brake, steer, ordered checkpoints, lap or finish, penalty or timeout |
   | platformer | move, jump, fall, collision matching visible ledges, collectibles, hazards, camera keeps player visible |
   | falling blocks | move, rotate, soft + hard drop, lock, line clear, scoring, levels, game over |
   | fighting | strikes/blocks, hit reactions, round + KO state, both fighters readable |
   | character controller | walk/run/jump clips playing, camera shoulder follow, locomotion direction matches travel |

   Plan for 60 seconds of meaningful play.

8. `npx @aura3d/cli@latest assets validate --no-placeholders --require-license`
   and `assets validate-game`; racing/platformer also
   `assets certify-game-geometry --asset track --category racing`.
9. Runtime evidence: pause, step one frame, then `game.evidence` over input,
   bodies, events, HUD, app state — see `aura3d-evidence-review` (one link).

## Look-dev loop

Run the `aura3d look capture` → judge → iterate loop from
`aura3d-art-direction`: lint first (`aura3d look lint`), then the weakest
rubric category; one change per round until every category reads 7+, 6
rounds, or 2 flat rounds.

## Stop and report

- `assets certify-game-geometry` returns `"ok": false` or a blocker such as
  `racing-road-mesh-not-found`: label `prototype`; never hide the gap with
  primitive ledges or road strips.
- Manual input cannot complete the route while a proof replay can: `prototype`.
- The primary player, vehicle, or world is a primitive stand-in: `prototype`.
- `assets validate-game` crashes or fails: report the exact message, label
  `blocked` for public claims.
- A kit is missing a needed rule (fail state, collision semantics, path
  alignment): write it route-local, say so, file a library gap.
- Benchmark mode without `look capture`: build, stop, label `prototype`.

## References

- [Shared boundaries](../aura3d-core/references/boundaries.md)
- [Look recipes](../aura3d-art-direction/references/look-recipes.md)
- [Quality bar](../aura3d-art-direction/references/quality-bar.md)
- [Build a browser game](https://github.com/auraoneai/aura3d/blob/main/docs/guides/build-a-browser-game.md)
- [Game example standards](https://github.com/auraoneai/aura3d/blob/main/docs/agents/game-example-standards.md)
- [Game runtime API](https://github.com/auraoneai/aura3d/blob/main/docs/api/game-runtime.md)
- [Genre looks in the frame](references/genre-looks.md)
