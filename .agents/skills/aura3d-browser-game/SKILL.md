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

## Start here

Read `docs/agents/build-a-game.md` (one page, type-checked sample) and
`docs/api/game-cheatsheet.md`. Build the route from the library shell
(`createGame` from `@aura3d/engine/game`, `createFixedStepLoop`,
`installQaHooks`, `defineModelAssets`, `installSafetyNet`); do not hand-roll a
HUD, touch layer, loop, QA hooks, synth or black-frame guard. Verify remotely
only (`tools/remote-acr/run.sh`): software WebGL2 is correctness and draw-call
evidence, never GPU performance evidence.

## Look target

Pick the genre's recipe row before adding props: [genre looks](references/genre-looks.md) (template, look id, camera, mood) and the full table in `../aura3d-art-direction/references/look-recipes.md`.

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

2. The look supplies sky light, key shadow, fog, and grade — never stack extra
   `lights.studio()` / `lights.directional()` on top, pass `{ fogDensityScale: 0,
   exposureEv: -0.1 }` to `looks.preset(...)` if fog whitewashes a fast route,
   and never pin post-processing or the compiler off with a `qualityRebuild` flag
   list (the engine defaults are right; `@aura3d/engine/game` already turns the
   `game` lane on; install the safety net instead), and never
   set `emissive: "#ffffff"` on instanced pool materials (`instanceColors`
   multiply `u_baseColor`, not `u_emissiveColor`).
3. Mount typed 3D GLBs for every character, athlete, enemy, vehicle, weapon,
   tree, and landmark (`model(assets.<name>, { targetMaxDimension, role })`,
   emissive 3–5 on pickups, and explicit `material: material.pbr({ color })` on
   untextured preview GLBs); use `targetHeight` only for upright humanoids and
   `targetMaxDimension` for vehicles, rackets, paddles, weapons, and wide props
   so silhouettes never stretch vertically. Drive rigged characters (`skins > 0`)
   with `handle.setAnimation({ clip, loop: true, speed })` synced to locomotion
   (`idle`, `walk`, `run`, `attack`) for real pixel motion under the key shadow
   instead of sliding rigid statues. Never build stick-figure humans or box cars
   from primitives; ground `model()` actors (`minY = 0`) at `y + sy / 2` of
   centered platforms; wind custom `geometry.custom` triangles CCW from `+Y`; and
   run Meshy GLBs through `assets optimize --role` before admission and mount
   them with a valid 64-char `sha256-...` `hash` (`defineModelAssets`).
4. Camera state drives `app.camera` every frame — size `html, body, #app, canvas`
   to `100vw × 100vh` (`position: fixed; inset: 0`), extend the 3D ground apron
   deep in `+Z`/`-Z` so the bottom frame is never a black void, disable
   `collision: true` on `camera.rigs.shoulder` when the hero has child nodes, and
   enforce `>= 1.4m` fighter pushbox separation (`|x| >= 1.8m` at spawn).
5. Gate Frame 1 on `await app.ready()` before fading `#boot-gate` (`opacity: 0;
   pointer-events: none` then remove) and starting simulation so lighting,
   shadow, and GLB silhouettes never pop in. Default `autopilot` to `false`
   (immediate manual control on Frame 1) unless `?autoplay=1` or `?demo=1` is in
   the URL or the user clicks the HUD `Auto` toggle button (`button.blur()` so
   `Space`/`Enter` never re-trigger focused HUD controls), and wire HUD/events
   through `game.eventLog` and `game.hud.*` in a compact top bar.
6. Reset without tearing down the scene: mutate runtime node handles
   (`app.nodes.require(...)`) instead of calling `app.setScene()` on same-stage
   (`stageId` / `worldId`) restarts so shadow and postprocess grade never drop.
7. Genre gates (plan for 60 seconds of meaningful play): [genre gates](references/genre-gates.md).
8. `npx @aura3d/cli@latest assets validate --no-placeholders --require-license`
   and `assets validate-game`; racing/platformer also
   `assets certify-game-geometry --asset track --category racing`.
9. Runtime evidence: pause, step one frame, then `game.evidence` over input,
   bodies, events, HUD, and look state — see `aura3d-evidence-review` (one link).
10. Build the shell from the kits, not by hand: `@aura3d/engine/game` (HUD, touch,
    session, sound), `installQaHooks` + `createFixedStepLoop` for deterministic
    replay, `createCueBank` for sound, `installSafetyNet` for `?diag=1` and
    black-frame self-heal — [kits and hooks](references/kits-and-hooks.md).

## Look-dev loop

Run the `aura3d look capture` → judge → iterate loop from `aura3d-art-direction`:
lint first (`aura3d look lint`), then the weakest rubric category; one change
per round until every category reads 7+, 6 rounds, or 2 flat rounds.

## Stop and report

- `assets certify-game-geometry` returns `"ok": false` or a blocker such as
  `racing-road-mesh-not-found`: label `prototype`; never hide the gap with
  primitive ledges or road strips.
- Manual input cannot complete the route while a proof replay can: `prototype`.
- The primary player, vehicle, or world is a primitive stand-in: `prototype`.
- `assets validate-game` crashes or fails: report the exact message, label
  `blocked` for public claims.
- A kit is missing a needed rule: write it route-local, say so, file a gap.
- Benchmark mode without `look capture`: build, stop, label `prototype`.

## References

- [Shared boundaries](../aura3d-core/references/boundaries.md)
- [Look recipes](../aura3d-art-direction/references/look-recipes.md)
- [Quality bar](../aura3d-art-direction/references/quality-bar.md)
- Build a game (one page, type-checked sample): `docs/agents/build-a-game.md`
- Game kit cheat sheet: `docs/api/game-cheatsheet.md`
- [Build a browser game guide](https://github.com/auraoneai/aura3d/blob/main/docs/guides/build-a-browser-game.md)
- [Game example standards](https://github.com/auraoneai/aura3d/blob/main/docs/agents/game-example-standards.md)
- [Game runtime API](https://github.com/auraoneai/aura3d/blob/main/docs/api/game-runtime.md)
- [Genre looks in the frame](references/genre-looks.md)
- [Mistakes already made (read first)](https://github.com/auraoneai/aura3d/blob/main/docs/agents/lessons-learned.md)
- [Kits and hooks (4.1)](references/kits-and-hooks.md)
- Believable motion (`@aura3d/engine/game`): `attachToBone` (bat, club, ball in a hand), `createLocomotion` and `createFootSlideMeter` (legs that match the ground), `createHandBounce` and `measureHandBall` (a ball dribbled by hand: hand and floor contact, hand-offs, proof): `docs/api/motion-hand-bounce.md`; `createTwoHandGrip` and `measureGrip` (a bat, club or racket held in both hands: grip, hand-off, proof): `docs/api/motion-two-hand-grip.md`, `docs/agents/build-a-game.md`
