# Genre kits: what is a building block and what is per game

Version: 4.7.0

The root `game.*` genre kits are tested simulation building blocks. They give you motion, scoring, lap and ball rules as pure, deterministic code you step with `dt`. They are not finished games. This page states the boundary for each kit and gives one example per kit that compiles against the public API (`tools/docs-codeblocks` typechecks every `ts` block here) and runs headless (`tests/unit/docs/genre-kit-examples.test.ts`).

Rule of thumb: the kit owns the physics and rules; you own the art, the level, the opponent behavior, the camera and HUD, and the proof that the game is fun and works. Say "built on the Aura3D platformer kit", never "a complete platformer". Claim labels are in [claims-and-boundaries.md](claims-and-boundaries.md).

| Kit | Kit provides (root-tested) | Per game (not provided) |
| --- | --- | --- |
| `game.platformer(level)` | Fixed-step player motion (gravity, coyote time, jump buffer, dash, ledge tolerance), platforms, moving platforms, collectibles, hazards, checkpoints, lives, finish, events | Level layout, art, enemy behavior beyond hazard volumes, camera, HUD, audio, difficulty curve |
| `game.arcadeKart({ route })` | Route-following kart physics (steer, drift charge, mini-turbo, boost), checkpoints and laps, rival stepping, bump and spin hazards, roadway nodes | Track art, rival AI beyond the cruise/weave helper, items, race flow, camera, HUD |
| `game.carSoccer(options)` | Car and ball physics, boost, hop, kickoff reset, car-to-car bumps, simple teammate, striker and keeper AI, pitch and goal nodes | Match rules (score, timer, overtime), car and arena art, real opponent AI, camera, HUD |
| `game.fighting(options)` (also `games.createFightingGameKit`) | Input mapping, moves with frame data, hit and hurt boxes, kinematic bodies, combat world, camera director, hit effects, a basic opponent AI | Roster, move sets beyond the defaults, characters and animation, stages, round and match flow, netcode |
| `game.racketSports()` | Scoring state machine (game, match, tiebreak), exact event-time ball flight, athlete rig solver, ball stepping | Court and character art, shot selection, opponent AI, line calls, serve flow, camera, HUD |

What this does not prove: that a kit-based game is playable, balanced or good-looking. A game claim still needs input that changes state, an objective, reset and a pixel check ([claims-and-boundaries.md](claims-and-boundaries.md) section 6). The root `createGame` is a headless stub; the lifecycle, HUD and touch kit is `@aura3d/engine/game`.

## Platformer

```ts
import { game } from "@aura3d/engine";

const platformer = game.platformer({
  id: "docs-platformer",
  start: { x: 0, y: 2 },
  finish: { x: 12, y: 1 },
  platforms: [{ id: "ground", x: -4, y: 0, width: 24, height: 1 }]
});

for (let frame = 0; frame < 90; frame += 1) platformer.step(1 / 60, { moveX: 1 });
const platformerSnapshot = platformer.snapshot();
// platformerSnapshot.player.x grew; platformerSnapshot.status is "playing" or "completed"
export const platformerResult = { x: platformerSnapshot.player.x, status: platformerSnapshot.status };
```

## Arcade kart

```ts
import { game } from "@aura3d/engine";

const kart = game.arcadeKart({
  route: {
    id: "docs-oval",
    closed: true,
    width: 16,
    points: [
      { x: 0, y: -40 },
      { x: 40, y: -20 },
      { x: 40, y: 20 },
      { x: 0, y: 40 },
      { x: -40, y: 20 },
      { x: -40, y: -20 }
    ],
    checkpoints: [0.25, 0.5, 0.75]
  },
  lapsToWin: 2
});

let last = kart.state;
for (let frame = 0; frame < 120; frame += 1) {
  last = kart.stepPlayer(1 / 60, { throttle: true, brake: false, steer: 0, drift: false, boost: false }).state;
}
export const kartResult = { speed: last.speed, progress: last.progress, lap: last.lap };
```

## Car soccer

```ts
import { game } from "@aura3d/engine";

const soccer = game.carSoccer();
soccer.resetKickoff();

for (let frame = 0; frame < 120; frame += 1) {
  soccer.stepHeroCar(1 / 60, { throttle: true, brake: false, steer: 0, boost: false, hop: false });
  soccer.stepBallPhysics(1 / 60, [soccer.hero, soccer.green, soccer.rival, soccer.purple]);
}
export const soccerResult = { heroSpeed: soccer.hero.speed, ballZ: soccer.ball.z };
```

## Fighting

```ts
import { game } from "@aura3d/engine";

const fighting = game.fighting({ autoListen: false, opponentAi: false, random: () => 0.5 });

let fightingSnapshot = fighting.snapshot();
for (let frame = 0; frame < 60; frame += 1) fightingSnapshot = fighting.update(1 / 60);
export const fightingResult = { player: fightingSnapshot.states.player, opponent: fightingSnapshot.states.opponent };
```

## Racket sports

```ts
import { game } from "@aura3d/engine";

const racket = game.racketSports();
const scoring = racket.scoring();

let score = scoring.init(0);
for (let point = 0; point < 4; point += 1) score = scoring.awardPoint(score, 0).state;
export const racketResult = { games: score.games, label: scoring.label(3, 0) };
```
