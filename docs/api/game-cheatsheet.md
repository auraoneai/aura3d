# Game kit cheat sheet

One page. Every name below exists in the 4.1.2 source. For a worked, type-checked example read `docs/agents/build-a-game.md`; for details follow the page links.

## What to import

| Need | Name | From | Page |
| --- | --- | --- | --- |
| Real game shell (HUD, touch, sound, juice, session) | `createGame`, `sfxUrl`, `SFX_IDS`, `mountHud`, `createJuice` | `@aura3d/engine/game` | `game-kit.md` |
| Headless stub (do not use for games) | `createGame` | `@aura3d/engine` | `game-kit.md` |
| Fixed-step loop | `createFixedStepLoop` (alias `fixedStepLoop`) | `@aura3d/engine` | `qa-kit.md` |
| QA hooks, URL params | `installQaHooks`, `readQaParams`, `qaHookGlobalName` | `@aura3d/engine` | `qa-kit.md` |
| Replayable randomness | `createCountedRng` (`next`, `range`, `int`, `reset`, `draws`) | `@aura3d/engine` | `qa-kit.md` |
| Safety net | `installSafetyNet`, `installBlackFrameGuard`, `installFrameTap`, `resolveQualitySwitches` | `@aura3d/debug` | `safety-net.md` |
| Procedural sound | `createCueBank`, `createStepSequencer`, `createToneLoop`, `noteFrom`, `SCALES`, `scaleSemitones` | `@aura3d/engine/audio` | `audio-synth.md` |
| Recorded sound slices | `createSampleSlices` | `@aura3d/engine/audio` | `audio-synth.md` |
| Production GLBs | `defineModelAssets` (`assets.node`, `assets.refs`, `assets.enabled`) | `@aura3d/engine` | `model-loader.md` |
| Skinned actors in the game loop | `attachRootRenderSource`, `TypedGLBActor` | `@aura3d/engine` | `skinned-actors.md` |
| Prop placement | `scatterAlongPath`, `scatterInArea`, `scatterTransforms`, `splitScatterByDistance`, `createScatterRandom` | `@aura3d/engine` | `scatter-merge.md` |
| Static merge | `mergeStatic`, `mergeStaticByKey` | `@aura3d/engine` | `scatter-merge.md` |
| Shader helpers | `#include <a3d_noise>`, `#include <a3d_fog>` and the other `a3d_*` chunks | in `material.custom` GLSL | `glsl-chunks.md` |
| Racket and ball sports | `game.racketSports()`: `ballFlight`, `scoring`, `athleteRig` | `@aura3d/engine` | `ball-flight.md`, `racket-athlete-rig.md` |
| Cel look | `effects.toon({ bands, outline })` | `@aura3d/engine` | `toon.md` |
| Blind A/B judging | `aura3d evidence judge` (a model judge, not a human) | CLI | `cli-asset-tools.md` |

## Shell at a glance

```text
createGame({ id, target, scene, input, hud, touch, sound, juice, evidence? })
  g.start()  g.ready()  g.app  g.input  g.session  g.hud  g.sound  g.juice  g.fx
  g.session: pause() resume() paused state timeScale hitStop(s) slowMo(scale, ms)
  g.hud:     set(id, value) banner(text) toast(text) damageNumber(v, pos) setVisible(b)
  g.sound:   cue(name)  unlock()
  g.juice:   fire(event, { position?, strength? })
  g.input:   held(a) pressed(a) released(a) buffered(a) consume(a) update(dt)
```

- Session states: `booting`, `loading`, `title`, `playing`, `paused`, `results`, `transitioning`, `context-lost`, `disposed`.
- HUD widget kinds: `score`, `timer`, `meter`, `combo`, `lives`, `objective`, `speedometer`, `prompt`, `minimap`, `indicator`.
- HUD themes: `arcade-neon`, `motorsport`, `sports-broadcast`, `sci-fi-telemetry`, `fighting`, `tabletop`, `plain`.
- Touch presets: `twin-stick`, `dpad-2btn`, `dpad-4btn`, `steer-pedals`, `aim-drag`, `flight`, `lane-swipe`, `flippers`.
- Juice effects per event: `punch`, `flash`, `shake`, `hitStop`, `rumble`, `fx`.

## QA global

`window.__AURA_<NAME>__`: `ready()`, `seed`, `state()`, `stepFrames(n, input?)`, `reset(seed?)`, `replay(script)`, `begin()`, `traceRow()`; first error in `__AURA_<NAME>_ERROR__`. URL: `?manual=1&seed=7&warmup=30&autostart=1` through `readQaParams`.

## Safety switches

`?post=0 ?shadow=0 ?env=0 ?sky=0 ?aa=0 ?quality=low ?tm=aces ?heal=0 ?diag=1`. Opt in with `installSafetyNet({ safety: true, canvas, app })`.

## Rules in one list

1. Real shell from `@aura3d/engine/game`; no hand-rolled HUD, touch, loop, hooks, synth or black-frame guard.
2. Pure, seeded simulation; no `Math.random`, `Date` or `performance.now` in it.
3. Characters, vehicles and landmarks are typed GLBs (`defineModelAssets` or `aura3d assets`), never primitives or raw URLs.
4. Browser specs run remotely (`tools/remote-acr/run.sh`); software GL is not GPU evidence.
5. Instance or merge repeated props; stay inside the per-game draw-call budget (Aura Slam: 150).
6. Licensed fonts only; dense UI preset.
7. Label claims per `docs/agents/claims-and-boundaries.md`.
