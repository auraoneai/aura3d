# Game kit: `@aura3d/engine/game`

> three.js has no HUD, touch, session or game-sound layer. This page covers all of them, plus pause and results and camera juice, in one import with nothing extra to install.

The game kit is the full game shell for Aura3D routes: lifecycle, pause and results, a DOM HUD, touch controls, juice (camera punch, flash, hit-stop, rumble, particles), game sound and a sound-effect pack. It ships inside the `@aura3d/engine` package as the `./game` subpath. There is no separate package to install.

```ts
import { createGame, sfxUrl } from "@aura3d/engine/game";
```

## Which `createGame`?

| Import | What you get |
| --- | --- |
| `@aura3d/engine/game` | The real kit: HUD, touch, juice, session, sound, evidence beacon. Use this one. |
| `@aura3d/engine` | A headless stub. It mounts the app and nothing else, and its first call logs `CREATE_GAME_STUB` pointing here. |

Importing `createGame` from `@aura3d/engine/game` is itself the opt-in: the `game` quality-rebuild lane defaults on for this entry point (`A3D_QR_GAME`). An explicit setting still wins, in this order:

1. URL `?a3d-qr=-game`
2. env `A3D_QR=-game` or `A3D_QR_GAME=0`
3. `qualityRebuild: { flags: ["-game"] }` or `"none"` in the options

Passing `qualityRebuild: { flags: ["game"] }`, as the templates do, is still valid and changes nothing.

## Minimal route

```ts
import { createGame, sfxUrl } from "@aura3d/engine/game";

const game = createGame({
  id: "my-route",
  target: "#app",
  scene: buildScene,
  hud: { theme: "motorsport", widgets: [] },
  touch: { preset: "steer-pedals", bindings: { throttle: "throttle", brake: "brake" } },
  sound: { cues: { lap: { id: "lap", asset: { url: sfxUrl("ui.confirm.00") }, volume: 0.7 } } },
  juice: { lap: { shake: 0.2, punch: { fovDeg: 2, ms: 240 } } }
});

game.start();
await game.ready();
```

`game.app` is the mounted Aura app, `game.session` owns pause, time scale, hit-stop and the legal state transitions (`booting`, `loading`, `playing`, `paused`, `transitioning`, `results`, `disposed`), and `game.shell` shows the pause, settings and results menus.

## What is in the kit

- **HUD:** `mountHud`, `HUD_THEMES`, `screenFraction` and the widget specs.
- **Touch:** touch control presets with named bindings.
- **Juice:** `createJuice`, `createTweenEngine`, `createOverlayDriver`, `createRumbleDriver`, the fx primitive pool and `FX_PRESETS`.
- **Session:** `GameSessionImpl`, `attachSessionLifecycle` (pauses on tab hide), `createAccessibility` (reduced motion, reduced flash, high contrast).
- **Sound:** the `sfx` pack, `SFX_IDS` and `sfxUrl(id)`.
- **Evidence and capture:** `installGameBeacon`, `installEvidenceChannel`, `captureFromUrl`, `lookSignature`.

Subpaths: `@aura3d/engine/game/art`, `@aura3d/engine/game/capture`, `@aura3d/engine/game/util` and `@aura3d/engine/game/styles.css`.

## Notes

- The kit is built from `packages/game` in this repository. `@aura3d/game` itself stays private; the published surface is the subpath.
- The published `@aura3d/engine` tarball was installed and the `racing-starter` template built against it as the check for this page.
- Most ports under `examples/*-port` and many showcase apps still hand-roll their HUD, QA hooks, audio and model loading; at the time of writing only Aura Slam and Splat Rush use the cue bank and QA hook kits. New routes start from the kit; migrating the rest is tracked as library work.
- Rebindable keys (`createBindingStore`) are private to `@aura3d/game` today; publishing it through this entry is a follow-up.
- `g.shell.showResults(values)` exists on the contract, but no shipped game uses it (they render their own results DOM). Verify it on your route before relying on it.

## Related pages

- One-page walkthrough with a type-checked sample: `docs/agents/build-a-game.md`.
- Names on one page: `docs/api/game-cheatsheet.md`.
- Deterministic loop and hooks: `docs/api/qa-kit.md`. Safety net: `docs/api/safety-net.md`. Procedural audio: `docs/api/audio-synth.md`. Production GLBs: `docs/api/model-loader.md`. Scatter and merge: `docs/api/scatter-merge.md`. Shader chunks: `docs/api/glsl-chunks.md`. Cel pass: `docs/api/toon.md`. Racket sports: `docs/api/ball-flight.md`, `docs/api/racket-athlete-rig.md`.
