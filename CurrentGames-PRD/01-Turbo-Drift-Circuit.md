# Turbo Drift Circuit — Dusk Rivalry Redesign

**Route:** `apps/showcase-turbo-drift-circuit/`  
**Claim boundary:** `createAuraApp` root safe API; route-local arcade racing; keep `prototype-blocked` until exact artifacts pass review

## Player promise

Drive a red Formula-style car through a compact club circuit at the end of a hot race day. Learn six gates, pressure a distinct blue rival, build one clean lap, then chase the translucent memory of your best run. The game should feel like a duel with the track—not a car model floating over grey geometry.

## Preserve

- Certified track topology and generated geometry remain command-owned and unedited.
- Four laps, six ordered gates, start ceremony, off-track recovery, pause/reset, passing-lane rules, and Rapier contact ownership remain intact.
- Player, rival, and circuit stay typed primary assets; the ghost remains visual-only.
- Do not claim tyre, drivetrain, suspension, damage, or motorsport simulation.

## Creative redesign

### Composition and camera

- Opening frame: player car fills the lower third, rival sits one car-length ahead, first gate and the next bend are both readable.
- Chase camera uses speed-based distance and restrained look-ahead; yaw follows road intent without horizon roll. Recovery never snaps through the track.
- Long straights open the horizon; technical bends compress the camera slightly to emphasize proximity and steering precision.
- Spectators, barriers, trees, and signs form depth bands and never narrow the certified passing corridor.

### Art direction

- Palette: vermilion player, cobalt rival, cool blue-grey road, dusty tan verge, amber sun, restrained cyan timing accents.
- Reduce undifferentiated emissive decoration. Use warm sunlight/cool fill separation and dark tire/barrier masses to hold the cars' silhouettes.
- Instanced crowds and treelines should create scale; distance LOD should simplify the horizon without visible popping in the acceptance run.
- In-world `text3D` is limited to start/finish identity and lap ceremony. DOM remains the accessible timer/position HUD.

### Feel and arc

1. Countdown isolates engine, lights, and rival.
2. Lap one teaches gates with generous presentation.
3. Lap two introduces stronger rival pressure and trackside reactions.
4. Lap three exposes the best-lap ghost and time delta.
5. Final lap tightens music, gate accents, and crowd response; finish resolves into a clean result tableau.

Drift must communicate through rear slip angle, road-relative camera response, registered scuff audio, and renderer-owned trail/dust—not a full-screen flash. Off-track state changes sound, vibration/rumble telemetry, speed, and verge contact language.

## Aura3D implementation map

| Need | Surface | Rule |
| --- | --- | --- |
| vehicle state | `game.racing` and route-local tune | authored-unit arcade behavior only |
| solid contact | public physics/Rapier path already used | Rapier remains sole physical owner |
| ghost | game input replay/export/import plus runtime node | no collider, timing, position, or AI influence |
| scenery | `instances.*`, `distanceLod` | evidence captures count/draw behavior |
| signs | `text3D` | supported glyphs only; no HUD substitution |
| audio | typed cues and route audio buses | engine, wind, music, SFX, UI separation; gesture unlock |
| optional boost | sensor-backed route flag | default off; boosted laps are a separate category |

## Delivery slices

1. Recompose load camera, car grounding, rival spacing, first gate, and road/value hierarchy.
2. Retune speed camera, drift feedback, recovery, and audio from one deterministic lap fixture.
3. Rebuild scenery bands, dynamic verge props, gantry, and dusk lighting without touching topology.
4. Finish best-lap recording, ghost presentation, delta UI, and final-lap escalation.
5. Validate desktop/mobile/reduced-motion frames and regenerate route evidence from commands.

## Acceptance scenarios

- **Grid:** both typed cars, road, gate one, and horizon readable; no debug guides.
- **Drift:** visible lateral attitude and restrained trail/dust while all four wheels remain compositionally grounded.
- **Pass:** player and rival simultaneously readable on asphalt with clear lateral room.
- **Ghost chase:** translucent ghost visible yet unmistakably non-solid; best-lap delta updates.
- **Finish:** car, gantry, result, and dusk skyline form one coherent poster frame.

## Definition of done

- [x] Grounding and passing-lane tests remain unchanged and green.
- [x] Keyboard/touch movement, checkpoint, lap, pause, finish, reset, and ghost toggle are browser-proven.
- [x] Ghost export/import reproduces the pinned path hash and never affects race truth.
- [x] Props cannot invade the passing corridor; scenery/LOD telemetry is current.
- [x] Five acceptance scenarios have desktop and mobile captures tied to runtime states.
- [x] Reduced motion removes camera punch/pulses while preserving speed and state readability.
- [x] Route-health, typed asset provenance, audio registration, deploy check, and exact screenshot hashes are current.
- [ ] Independent human review passes before any promotion or quality superlative.

## Execution ledger

**Status:** Machine-complete; blocked only on independent exact-artifact review  
**Last verified:** 2026-08-23 23:21 PDT  
**Implementation scope:** `apps/showcase-turbo-drift-circuit/`, Turbo unit/browser tests, generated route/evidence artifacts, and this PRD  
**Authoritative evidence:** generated topology and route-health; Turbo unit tests; grounding, ghost, opponent, scene, gameplay, mobile, deploy, and exact visual-review artifacts  
**Remaining blockers:** TDC-05 independent art-direction review and the independent-human-approval portion of TDC-14 remain open; no machine implementation or verification blocker remains

### Requirement checklist

- [x] TDC-01 Certified topology, four laps, six ordered gates, start ceremony, passing corridor, Rapier contact, pause, reset, and recovery remain intact.
- [x] TDC-02 Typed player, rival, and circuit provenance is current and no simulation claim exceeds authored arcade racing.
- [x] TDC-03 Opening grid frame reads player, distinct rival, first gate, next bend, road, and horizon with no debug guides.
- [x] TDC-04 Speed camera, look-ahead, road-relative yaw, technical-bend compression, and recovery transitions pass without clipping or horizon roll.
- [ ] TDC-05 Dusk palette, car silhouettes, value hierarchy, scenery depth bands, and certified-corridor clearance pass visual review.
- [x] TDC-06 Drift visibly proves lateral attitude, road-relative response, typed scuff audio, and renderer-owned trail/dust without simulation inflation.
- [x] TDC-07 Off-track state visibly and audibly changes while preserving recovery and timing truth.
- [x] TDC-08 Best-lap ghost round-trip reproduces the pinned path hash and never affects collision, AI, timing, position, or score.
- [x] TDC-09 Instanced scenery, distance LOD, dynamic verge props, and gantry signage pass telemetry, pop, clearance, and glyph checks.
- [x] TDC-10 Registered audio buses and gesture unlock prove engine, wind, music, SFX, UI, and finish duck/reset behavior.
- [x] TDC-11 Optional boost mode remains default-off and boosted results are categorically separate.
- [x] TDC-12 Browser evidence proves keyboard/touch movement, drift, checkpoint, lap, rival pass, pause, finish, reset, and ghost toggle.
- [x] TDC-13 Grid, drift, pass, ghost, finish, mobile, and reduced-motion artifacts are current and source-bound.
- [ ] TDC-14 Route-health, deploy, performance, accessibility, claims, and independent human review pass.

### Verification record

| Date | Requirement | Evidence | Result |
| --- | --- | --- | --- |
| 2026-08-23 | TDC baseline | Current source, route-health, and Turbo unit/browser test families located; no requirement marked complete without rerun | In progress |
| 2026-08-23 | TDC-01, TDC-02 | 12 focused Turbo unit suites (69 tests); route typecheck and production build; release deploy check over `showcaseCc0FormulaRaceCar`, `showcaseCcByFormulaOpponent`, and `showcaseTsukubaCircuit` | Passed |
| 2026-08-23 | TDC-08 | Ghost-replay unit suite plus mounted browser round-trip proof; exported/imported path hash remains pinned and replay state is visual-only | Passed |
| 2026-08-23 | TDC-09, TDC-11 | Scene-incorporation browser proof for prop reaction, scenery/LOD/signage telemetry, corridor clearance, supported glyphs, and default-off versus explicit `?boost=1` state | Passed |
| 2026-08-23 | TDC visual audit | Current scene captures confirm corrected prop scale and reduced gantry occlusion; ghost legibility, typed-track foreground intrusion, full scenario matrix, mobile/reduced-motion artifacts, and independent review remain open | In progress |
| 2026-08-23 | TDC-03, TDC-04, TDC-06, TDC-07, TDC-10, TDC-12, TDC-13 | Fresh seven-state source-bound acceptance producer passes grid, live drift, mounted rival pass, best-lap ghost, natural four-lap finish, mobile touch, and reduced-motion truth; finish presentation now continues after simulation stops; route-primary and composition regenerate green; 64 focused units, app typecheck/build, and strict release deploy pass | Machine gates passed; independent exact review pending |
