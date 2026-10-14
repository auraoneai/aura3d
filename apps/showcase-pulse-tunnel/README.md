# Pulse Tunnel (prototype)

On-rails rhythm runner through the proven neonTunnel() look. Gates and walls pulse in
on the music's beat; you switch lanes, jump low gates, slide under high ones, and graze
near-misses for style multipliers. One 90-second authored run, three shields, then the
tunnel scores you.

**Label: prototype from day one.** This route illustrates direction; it has not had
independent human visual review, and it makes no production-rendering, kit-reuse, or
rhythm-accuracy claims.

## Sync contract (the honest version)

Web-Audio-to-frame-loop sync is the highest-risk gap this game touches, so the behavior
is published as a measured contract instead of a promise:

- In **beat mode**, obstacles schedule against the AudioContext clock (ctx.currentTime
  relative to the shared stem anchor), never frame deltas. The four stems start at one
  shared anchor timestamp, so "on the beat" is meaningful.
- Once per second, a drift monitor compares audio-clock elapsed against frame-clock
  elapsed (performance.now()). If |drift| exceeds **80 ms** for **3 consecutive
  checks**, the route permanently flips to **pattern mode**: the identical authored
  chart continues against a frame-time accumulator seeded with the audio elapsed at
  flip time. The HUD debug badge (?debug=1) and
  window.__PULSE_TUNNEL_EVIDENCE__.syncMode always show which mode is live.
- With no usable AudioContext at all (headless route-health runs, blocked autoplay),
  the run starts directly in pattern mode and says so. The game is fully playable in
  both modes because both schedule the same chart.

**Current measured result (2026-08-23, HeadlessChrome 151 on this Mac profile):**
the source-bound spike recorded +119.13 ms, +116.87 ms, and +120.50 ms drift at
the three consecutive checks against an 80 ms tolerance. It selected
`NO-GO-BROWSER-PROFILE` and naturally flipped to deterministic pattern mode at
2.888 s while gameplay continued. The exact browser, source hashes, samples, and
decision are in `tests/reports/pulse-tunnel/sync-report.json`. No claim is made for
untested browsers or audio devices.

**There is no "perfect rhythm sync" here.** The claim is bounded: gates arrive within
the *measured* tolerance reported by tests/browser/pulse-tunnel-sync.spec.ts into
tests/reports/pulse-tunnel/sync-report.json. That report is the PT-01 spike receipt:
it records per-gate scheduled-vs-observed audio timestamps and the max |drift| seen.
If tolerance fails on target browsers, the README-level answer is already implemented:
ship in pattern mode with music-reactive visuals and say so.

### Test-only fault injection

window.__PULSE_TUNNEL_TEST__.injectDrift(ms) adds a synthetic offset to the drift
monitor's readings so the fallback flip is provable end-to-end in a real browser
without waiting for hardware drift. It exists only for
tests/browser/pulse-tunnel-sync.spec.ts; gameplay never reads it.

## Controls

| Input | Action |
| --- | --- |
| A/D or Left/Right | Lane switch (buffered 120 ms) |
| W/Up | Jump low gates |
| S/Down | Slide under high gates |
| P / R | Pause / restart |

Touch: lane-left / lane-right hold buttons plus Jump / Slide / Restart buttons. All of
them dispatch the same keyboard codes through bindGameTouchControls, so input has
exactly one path.

## Music and SFX provenance

All audio is original CC0 synthesis generated in-repo:

- scripts/build-music.mjs - four 90 s stems (drums/bass/lead/air) at BPM 120,
  deterministic arrangement, sections intro -> build -> drop -> finale mapped to stem
  unmutes on the mixer buses.
- scripts/build-sfx.mjs - nine cue WAVs (laneSwitch, jump, slide, graze, shieldHit,
  shieldBreak, sectionRise, runOver, uiConfirm).

Regenerate from this directory with `node scripts/build-music.mjs` and
`node scripts/build-sfx.mjs`, then run `pnpm register:audio`. The reproducible
registration script records each asset as candidate-quality CC0-1.0 synthesis by
Aura3D synthesis with durable source and license metadata in generated
`aura.assets.json` and `src/aura-assets.ts`. The route references all 13 through
typed `assets.pulse*` members—no raw URLs or invented IDs.

## Presentation boundaries

The player is the release-validated typed `assets.pulseRunnerCraft`, facing the
release-validated typed `assets.pulseTerminalSentry` inside the release-validated
typed `assets.pulseReactorEncounterWorld`. All three are original CC0 Pulse Tunnel
assets with retained root-rendered probe evidence. All
lane, jump, slide, collision, and rhythm behavior remains route-local authored arcade
motion and makes no physical-spacecraft claim. Gate frames, the continuous
reactor-tunnel volume, terminal iris, projectiles, hue washes, and sparks are
renderer-owned abstract geometry around the typed player. Fog pulses and hit flash
render in-scene; DOM/CSS is HUD chrome only.

## Evidence

- window.__PULSE_TUNNEL_EVIDENCE__: { mounted, syncMode, driftMs, section, distance,
  style, shields, state, gateEvents[], audioCues[], ... } - updated every frame; gate
  events carry audio-clock timestamps.
- Unit proof: tests/unit/apps/pulse-tunnel-clock.test.ts (scheduler math, drift flip,
  chart determinism, player kinematics, style math).
- Browser proof: tests/browser/pulse-tunnel-playable.spec.ts and
  tests/browser/pulse-tunnel-sync.spec.ts.
- Source-bound receipts: `tests/reports/pulse-tunnel/playable-evidence.json`,
  `mobile-evidence.json`, `completion-evidence.json`, and `sync-report.json` bind
  their producer and route hashes plus every acceptance capture.
- Performance: `performance-report.json` passes at 0.001 ms simulation p95 and
  30 full-run draw calls for the documented route-local scope.
- Route health: `route-health.json` machine-passes with three release-quality typed
  visual assets plus 13 typed audio assets, 34 primitive source occurrences,
  current evidence hashes, bounded claims,
  and the independent-review blocker retained.
- Exact build deployment: the release check validates `pulseRunnerCraft`,
  `pulseTerminalSentry`, and `pulseReactorEncounterWorld`, while route health
  separately validates every typed WAV hash, provenance record, quality grade, and
  live use.

## Review status

Machine implementation and verification: **complete as of 2026-08-23**.
Independent human visual review: **pending**. The exact telegraph, lane, jump,
graze, drop, shield, finale, failure, completion/reduced-motion, and mobile hashes
are recorded in `route-health.json`. Route classification remains
`prototype-blocked` in `tools/showcase-library/route-gates.json`; no promotion is
claimed until an external verdict approves those exact artifacts.
