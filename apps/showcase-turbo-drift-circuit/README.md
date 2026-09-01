# Turbo Drift Circuit

Status: materially rebuilt; independent exact-artifact review pending

Claim label: createAuraApp

Primary assets: `showcaseCc0FormulaRaceCar`,
`showcaseCcByFormulaOpponent`, and `showcaseTsukubaCircuit`

Turbo Drift Circuit is a four-lap arcade racing candidate with six ordered
gates, a typed red Formula-style player car, a distinct typed blue/black rival,
a chase camera aligned to forward travel, drift feedback, off-track recovery,
lap/finish progression, and circuit-derived per-wheel contact sampling. The
visual grey asphalt is wide enough for the player to pass the rival on tarmac.
Rapier owns solid vehicle contact. SAT clamps only the player's commanded
target. Opponent `onRoad` evidence uses the same body-on-asphalt test as the
player.

Controls:

- `W`/`ArrowUp`: throttle
- `S`/`ArrowDown`: brake
- `A`/`ArrowLeft`: steer left
- `D`/`ArrowRight`: steer right
- `Space` or left `Shift`: drift
- `P` or `Esc`: pause
- `R`: reset
- `G`: toggle the time-trial ghost replay (once a best lap exists)

The public claim is bounded to authored-unit arcade handling, certified track
topology, selected Rapier collision proof, and deterministic opponent driving.
It does not claim a physical tyre model, drivetrain, damage, suspension, or
motorsport simulation. Automated composition, route-primary, gameplay,
interaction, grounding, and deploy evidence must remain fresh. Public promotion
is blocked until an independent human approves the exact final source-bound
screenshots and the release gate is regenerated from those artifacts.

## Audio

All sound cues are CC0 WAVs synthesized deterministically by
`scripts/build-sfx.mjs` (`node scripts/build-sfx.mjs`), registered through the
Aura3D asset CLI so each cue has a typed `assets.turbo*Sfx` reference and
provenance (`CC0-1.0`, author "Aura3D synthesis", source page is the script).
Cues: engine loop, drift scuff, wind loop, registered music loop, checkpoint
chime, countdown blips, `go`, finish fanfare, off-track rumble, and
`ui-confirm`. Playback is gated on a real user gesture (first
gesture unlocks the `AudioContext`) and is disabled under reduced-motion. The
cue-to-asset manifest lives in `src/audio-cues.ts` and the runtime wiring in
`src/turbo-audio.ts`/`src/main.ts`.

Buses (PRD TDC-A5): engine and wind each own a dedicated bus, the music loop
plays on its own `music` bus, and gameplay/UI cues keep their buses. The finish
fanfare ducks the music bus for its duration; reset restores it. Bus ids and
the duck state are published as additive audio evidence fields (`busIds`,
`musicDucked`).

## Time-trial ghost and scene incorporations

- **Ghost replay** (`src/ghost.ts`, PRD TDC-A1): every lap is recorded from the
  same kit snapshot the HUD reads; the best lap is sealed through an export →
  import round trip whose path hash is asserted identical by unit test
  (`turbo-ghost-replay.test.ts`). On later laps a translucent ghost car replays
  the best lap. It is visual-only: no collision body, excluded from gap,
  position and timing logic. Toggle with `G` or the panel button.
- **Dynamic track props** (`src/track-props.ts`, TDC-A2): cones and tire stacks
  are real light Rapier bodies flanked strictly outside the passing-lane
  corridor (probe-verified placement; unit-tested). Scatter is cosmetic - prop
  mass keeps car contact negligible, and a per-frame corridor clamp projects any
  scattered body back onto the verge.
- **Instanced scenery + LOD** (`src/scenery.ts`, TDC-A3): crowd stands, tree
  clusters and tire walls draw via `instances.*`; far treeline bands use
  `distanceLod`. The late-afternoon grade (warm key, cool rim/fog) is formalized
  in `TURBO_LATE_AFTERNOON_MOOD`.
- **Gantry signage** (`src/signage.ts`, TDC-A4): start/finish gantry carries a
  static "TSUKUBA" board plus a lap-state board built with the engine's `text3D`
  glyph meshes (A-Z/0-9 only; lap counts are written "LAP N OF 4" because there
  is no slash glyph). Boards are prebuilt per state and lit by session state.
- **Boost rings** (`src/boost-rings.ts`, TDC-A6): OPTIONAL, default OFF. Behind
  `?boost=1` emissive rings on straights grant a short burst through the same
  contact-resolution path nitro uses. Default OFF keeps all retained lap-time
  evidence valid; ON-mode lap times are not comparable with retained baselines.

## API gaps refused

This route deliberately avoids renderer-library imports, direct GLB loader internals,
and bespoke renderer loops;
DRM-free CC0 audio was synthesized and registered through the Aura3D CLI rather
than claiming provenance it does not have. The gameplay uses the public
`createAuraApp` surface (`game.racing`, `game.effects`) throughout; no physical
solid-tyre/tyre-model claim is made (that is a flagship-roadmap capability, not
`createAuraApp`). Label remains `createAuraApp` / prototype-blocked.
