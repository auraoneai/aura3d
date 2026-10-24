# Kits and hooks for browser games (4.1)

Eleven ports and a tennis rebuild each copied the same shell code. The pieces below
are now library surface: start from them instead of hand-rolling a HUD, an input
store, a fixed-step loop, QA hooks or a synth. Every name here is verified against
`docs/api/*.md` and the source; if an import fails, the installed version predates
4.1 and you stop and report instead of re-creating the kit.

## Pick the piece

| Need | Use | Import |
| --- | --- | --- |
| Lifecycle, pause, results, DOM HUD, touch controls, juice, game sound | the game kit: `createGame`, `mountHud`, `createJuice`, `sfxUrl` | `@aura3d/engine/game` |
| Deterministic fixed-step simulation and automated checks | `createFixedStepLoop`, `installQaHooks`, `readQaParams`, `createCountedRng` | `@aura3d/engine` |
| Procedural sound cues, a mute key, ducking, step sequencer, engine drone | `createCueBank`, `createStepSequencer`, `createToneLoop`, `noteFrom`, `SCALES` | `@aura3d/engine/audio` |
| Recorded takes (several hits in one sprite sheet) | `createSampleSlices` | `@aura3d/engine/audio` |
| Rebindable keys with validation and persistence | `createBindingStore` (private `@aura3d/game` today; publishing through the game kit is the follow-up) | in-repo only |
| Racket and ball sports | `game.racketSports()`: `ballFlight`, `scoring`, `athleteRig` | `@aura3d/engine` |
| A black-frame safety net and a GPU diagnostics panel | `installSafetyNet` | `@aura3d/debug` |

`createGame` from `@aura3d/engine` is a headless stub that logs `CREATE_GAME_STUB`.
The real kit is the `@aura3d/engine/game` entry, and importing it turns the `game`
quality-rebuild lane on by default. Do not add a `qualityRebuild` flag list by hand.

## Deterministic replay and QA hooks

A browser spec, a capture tool and the live smoke all drive the page through
`window.__AURA_<NAME>__`. Install it once with `installQaHooks(name, options)` and
keep the `state` hook plain data: never put engine objects in it.

```ts
import { createFixedStepLoop, installQaHooks, readQaParams } from "@aura3d/engine";

const config = readQaParams({ seed: { type: "number", default: 1 }, manual: { type: "flag" } });
const loop = createFixedStepLoop({
  manual: config.manual,
  isActive: () => ready,
  step: () => sim.advance(readInput()),
  render: () => draw()
});
const qa = installQaHooks("my-game", {
  ready: () => ready,
  seed: config.seed,
  state: () => sim.snapshot(),
  stepFrames: (n, input) => { for (let i = 0; i < n; i++) sim.advance(input); draw(); },
  reset: (seed) => { sim = new Sim(seed ?? config.seed); draw(); },
  app: () => app
});
loop.start();
```

Rules that came out of the ports:

- Keep the simulation a pure fixed-timestep module with a seedable RNG
  (`createCountedRng` exposes a draw counter so a replay can assert it). It never
  touches the DOM, `Math.random`, `Date` or `performance.now`.
- Record a scripted input run from the original or the reference build in two
  independent sessions, derive the tolerance from their spread, and replay it as a
  unit test. The Crayon ports match to 1e-6 or better; Aura Slam matches the
  original engine bit for bit.
- Anything that advances inside the render callback (autoplay, assist swings)
  makes extra renders change the game: render once per step in manual mode.
- Read `?manual=1`, `?warmup=`, `?seed=` through `readQaParams`, not by hand.

## Production safety net

For any route you ship, install the safety net and keep `?diag=1` working. It is
opt-in: with `safety` unset the handle is inert and only parses the switches.

```ts
import { installSafetyNet } from "@aura3d/debug";

const net = installSafetyNet({ safety: true, canvas, app });
const { post, shadow, env, quality } = net.switches; // read before building the scene
// after each drawn frame: net.sample(framesDrawn);
```

`?post=0 ?shadow=0 ?env=0 ?sky=0 ?aa=0 ?quality=low ?tm=aces ?heal=0 ?diag=1` are
the switches; your game decides what each one changes. A canvas that stays black
for about 23 samples reloads one rung down (`no-aa`, `no-post`, `aces-tone`,
`no-env`, `no-shadow`, `low-quality`), logs `SAFETY_BLACK_FRAME`, and the next page
logs `SAFETY_COMPAT_MODE`. Never replace this with a blanket `qualityRebuild` pin
that disables post-processing for every player.

## Sound

`createCueBank({ cues, muteKey })` sits on the page's single `AudioContextManager`,
so the one-owner rule holds: never write `new AudioContext(`. Call `bank.install()`
for first-gesture unlock and the mute key, then `bank.play(id, { level })`. Bind
`play` to simulation events, not to key presses, so replays sound the same.

## Racket sports

`game.racketSports().ballFlight(config)` is exact event-time flight (bounce, net,
tape, boards) in court units with a different axis convention from the simple
`stepBallPhysics` (z up, net at y = 0). `scoring` is a pure game, match and
tiebreak state machine that defaults to tennis. `athleteRig` has `locomotion`,
`applyLimbs` and `solveKnee`. Line calls, AI and costumes stay game code.

## Converting an existing game

Follow the order used for Aura Slam: capture a deterministic reference, write the
typed contract, transcribe the pure simulation behind differential tests, port
render, input, audio and UI behind that contract, then gate on replay, matching
frames, a real-input play-through and a production-build check before swapping the
route. See `docs/aura-slam/ARCHITECTURE.md` and
`docs/workflows/crayon-game-reverse-engineering.md`.
