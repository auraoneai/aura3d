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
Cues: engine loop, drift scuff, wind loop, checkpoint chime, countdown blips,
`go`, finish fanfare, off-track rumble, and `ui-confirm`. Playback is gated on
a real user gesture (first keydown/pointerdown unlocks the `AudioContext`) and
is disabled under reduced-motion. The cue-to-asset manifest lives in
`src/audio-cues.ts` and the runtime wiring in `src/turbo-audio.ts`/`src/main.ts`.

## API gaps refused

This route deliberately does not use three/GLTFLoader/bespoke renderer loops;
DRM-free CC0 audio was synthesized and registered through the Aura3D CLI rather
than claiming provenance it does not have. The gameplay uses the public
`createAuraApp` surface (`game.racing`, `game.effects`) throughout; no physical
solid-tyre/tyre-model claim is made (that is a flagship-roadmap capability, not
`createAuraApp`). Label remains `createAuraApp` / prototype-blocked.
