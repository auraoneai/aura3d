# Blockfall Reactor

Blockfall Reactor is a bounded Aura3D falling-block puzzle candidate: a typed
catalog-sourced arcade cabinet framing a readable 10×20 playfield, hold/next
grids, progression, event feedback, deterministic replay evidence, and
keyboard/touch controls. This document covers the audio/FX pass
(CurrentGames-PRD `04-Blockfall-Reactor.md`, tasks BF-A1..BF-A6).

## Remediation Status

- Classification: `candidate` — unchanged by the audio/FX pass. It is not a
  release-ready route until a fresh hash-bound independent visual review passes.
- Route health: `apps/showcase-blockfall-reactor/route-health.json`.
- Primary subject: `assets.showcaseBlockfallCabinet` (typed, CLI-registered,
  release-probed). Board cells, rails, glows, wall boards, and FX shards are
  valid procedural set dressing for an abstract falling-block game.
- Current blocker: independent human approval of the exact final source-bound
  screenshots. Technical proof does not constitute visual approval.
- Claim status: bounded to the public `game.fallingBlocks` kit, keyboard/touch
  interaction proof, and retained Aura3D route evidence.

## Audio pass (BF-A1/BF-02/BF-03)

All audio is original in-repo synthesis — no sampled or downloaded material.
`scripts/build-sfx.mjs` generates every WAV (16-bit PCM mono 44.1 kHz,
author "Aura3D synthesis", license CC0-1.0), and each file is registered with
`aura3d assets add` so playback resolves typed members of
`src/aura-assets.ts` (`assets.blockfall*Sfx`). No raw URLs, no invented ids.

Nine gameplay cues answer observed state changes only:

| Cue | Trigger | Bus |
| --- | --- | --- |
| move | move action accepted by the kit | sfx |
| rotate | rotate action accepted | sfx |
| lock-thud | kit `lock` event | sfx |
| line-clear sweep | kit `line-clear` event with 1–3 rows | sfx |
| quad fanfare | kit `line-clear` event with 4 rows | sfx |
| level-up charge | level rises past last observed level | sfx |
| hold-swap latch | hold action accepted | sfx |
| hard-drop slam | hard-drop action accepted | sfx |
| game-over sting | kit `game-over` event | sfx |

Loops start once on the first user gesture (autoplay-policy discipline):

- `blockfallReactorHumLoop` — ambient reactor hum on its own **ambient bus**.
- `blockfallMusicStem1..4` — additive music intensity stems, one per five
  levels (stem 2 joins at level 6, stem 3 at 11, stem 4 at 16). Stems are
  persistent loops; layering is per-stem **bus-volume automation** via
  `setBusVolume`, so a reset simply returns the gains to the level-1 mix.

Evidence: `audio` and `audioTriggerMap` fields on the mounted proof object;
unit coverage in `tests/unit/apps/blockfall-audio-trigger-map.test.ts`;
browser coverage in `tests/browser/blockfall-reactor-audio-fx.spec.ts`.

## Instanced board view (BF-A2/BF-04)

Visible board cells render through two instanced emissive pool groups instead
of one node per cell: the locked stack is one instanced sub-pool per tetromino
kind (the glow hue lives in each shared neon material), and the active piece is
a single four-instance pool whose material follows the live kind. The projection
lives in `src/board-view.ts` as a pure function of kit state;
`boardViewMatchesState` pins view/state parity cell-for-cell in
`tests/unit/apps/blockfall-board-view.test.ts`. The legacy per-cell nodes stay
mounted but hidden so the route can measure renderer draw calls for both
representations in one build; the A/B numbers land in
`boardView.drawCallTelemetry` on the mounted proof object and are asserted by
the browser spec (instanced < perCell).

## Wall scoreboard (BF-A3/BF-06)

Extruded scene-native boards on the arcade back wall: zero-padded score
(`000000`) and level (`01`) digits built from the engine `text3D` glyph font
(digits are exactly its supported set), plus SCORE / LEVEL / NEXT word boards
assembled from the same 5×7 extruded-box language because the engine font ships
no letters. Live updates toggle pre-built digit visibility — no scene rebuilds.
The DOM HUD remains the accessible source of truth.

## Clear FX + camera punch (BF-A4/BF-05)

Line clears launch a shard burst from the cleared rows (`src/clear-fx.ts`);
shard count, speed, and spread scale with the number of lines cleared. Quad
clears and level-ups drive a short damped camera punch (`src/camera-feel.ts`)
by mutating the owned camera spec offsets. Both systems are gated by
`prefers-reduced-motion`: under reduced motion nothing spawns and nothing
punches — the suppression itself is recorded in the mounted proof.

## Attract mode (BF-A6/BF-08)

The route boots straight into a playable game. After 45 seconds with no input
(and while not paused or in replay), the recorded expert run takes over behind
the title card (`src/attract.ts`). The run is the competent planner segment from the route's
deterministic rules module before its first top-out, committed as
`tests/fixtures/blockfall/expert-run.json` (plus an embedded byte-identical TS
twin the route imports). The fixture doubles as a regression harness:
`tests/unit/apps/blockfall-attract.test.ts` replays it against `rules.ts`
and pins the final score hash and state checksum. The first player input exits
attract and starts a fresh game. Scope note: the fixture proves determinism of
`rules.ts`; mounted attract playback drives the public `game.fallingBlocks`
kit, whose randomizer differs.

## Bloom (BF-A5/BF-07)

One restrained bloom pass over emissive content, shipped at exact documented
values — full motion: intensity 0.26, threshold 0.55, maxIntensity 1.6,
anti-blowout on; reduced-flash preference: intensity 0.12. Retained before
(bloom off) and after stills are captured from one mounted scene by
`tests/browser/blockfall-bloom-stills.spec.ts` into
`tests/reports/blockfall-reactor-bloom/`.

## Controls

- `ArrowLeft`/`ArrowRight` or `A`/`D`: move
- `ArrowUp`, `W`, `X`, or `E`: rotate clockwise; `Z`/`Q`: counter-clockwise
- `ArrowDown` or `S`: soft drop
- `Space`: hard drop
- `C` or `Shift`: hold
- `Escape` or `P`: pause
- `R`: reset

Touch controls are exposed in the route for mobile smoke coverage. Any input
also exits attract mode into a fresh game.

## Evidence

The route publishes `window.__AURA3D_SHOWCASE_BLOCKFALL_REACTOR__` with status,
controls, systems, public falling-block kit state, HUD/accessibility evidence,
runtime-node evidence, line-clear proof, replay checksum proof, and the
audio/FX/scoreboard/attract/board-view fields described above. All game state
flows through `game.fallingBlocks`.

## Claim Boundary

The candidate uses the typed catalog cabinet, procedural Aura3D primitives, and
the public `game.fallingBlocks` kit. It does not use raw GLB paths, string
asset ids, private renderer APIs, or a route-local reducer for live gameplay.
It does not claim production puzzle-game launch quality, reusable game kits, or
current visual approval. Audio/FX additions do not change the route label.
