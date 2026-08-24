# Blockfall Reactor — Premium Cabinet Redesign

**Route:** `apps/showcase-blockfall-reactor/`  
**Claim boundary:** root-safe falling-block route using the public falling-block helper; exact visual approval remains separate

## Player promise

Operate a physical arcade reactor: place pieces cleanly, manage hold and next, build heat through consecutive clears, and discharge the machine with a four-line event. The board must be instantly readable as a game while the cabinet makes every state feel physical and consequential.

## Creative direction

- The typed cabinet is the hero frame, not a decorative shell around tiny DOM blocks.
- Camera is nearly orthographic, three-quarter frontal, with the 10×20 well occupying the visual center and cabinet controls/vents framing it.
- Palette: obsidian body, ion-blue idle cells, warm white active piece, orange heat, red overload, gold quad-clear. Limit bloom so cell boundaries stay sharp.
- Board cells are renderer-owned 3D/instanced geometry. DOM mirrors score, hold, next, level, and accessibility information but cannot fake the playfield or FX.
- The back panel's supported mesh text can show score/level ceremony; it never replaces accessible text.

## Game arc

1. Attract replay demonstrates move, rotate, hold, hard drop, and a clear without taking control from an active player.
2. Early level emphasizes clean piece silhouettes and soft audio.
3. Consecutive clears raise reactor light, hum stems, and cabinet vent activity.
4. Near-top danger reduces decorative noise and makes the warning state unmistakable.
5. Quad clear discharges energy through the cabinet, hits a restrained camera punch, then returns to sharper calm.
6. Game over visibly powers down the well and exposes an immediate restart.

## System direction

| System | Requirement |
| --- | --- |
| board | instanced occupied cells plus distinct ghost/active/locked states; no per-frame remount |
| controls | move, rotate, soft/hard drop, hold, pause, reset; buffered behavior remains kit-owned where applicable |
| feedback | event-driven move/rotate/lock/clear/quad/level/game-over cues and scene effects |
| audio | typed registered cues plus layered reactor/music buses; gesture unlock and mute |
| camera | fixed readable frame; only short event impulses, removed under reduced motion |
| attract mode | deterministic input/state replay, canceled immediately by real input |
| evidence | board hashes, event stream, draw/instance counts, screenshot states, reset proof |

## Acceptance scenarios

- Attract frame with cabinet, well, next, hold, and score hierarchy.
- Active piece and landing ghost remain distinguishable in every palette state.
- Single clear, quad clear, level-up, top-out danger, and game-over each visibly differ.
- Mobile view preserves full board and touch controls without covering the lowest rows.

## Definition of done

- [x] Falling-block rules, score, hold, next, level, top-out, pause, and reset are unit/browser-proven.
- [x] Instancing evidence proves board rendering behavior and stable cell alignment.
- [x] Attract replay is deterministic and yields instantly to player input.
- [x] All cues are typed/registered and fired from observed kit events, not guessed timers.
- [x] Bloom/FX never erase cell edges or active-piece silhouette.
- [x] Desktop/mobile/reduced-motion captures cover attract, play, clear, quad, danger, and outcome.
- [ ] Route-health and independent exact-artifact review pass before promotion.

## Execution ledger

**Status:** Machine-complete; blocked only on independent exact-artifact review  
**Last verified:** 2026-08-23 23:08 PDT  
**Implementation scope:** `apps/showcase-blockfall-reactor/`, Blockfall unit/browser/evidence surfaces, generated route-health, and this PRD  
**Authoritative evidence:** public-kit state fixtures; board/attract/audio tests; browser FX/still captures; instance/draw evidence; deploy/review artifacts  
**Remaining blockers:** BFR-11 independent exact-artifact review and the independent-approval portion of BFR-12 remain open; no machine implementation or verification blocker remains

### Requirement checklist

- [x] BFR-01 Typed cabinet is the hero and the renderer-owned 10×20 well is centered/readable in desktop and mobile composition.
- [x] BFR-02 Falling-block rules prove move, rotate, soft/hard drop, hold, next, score, level, top-out, pause, and full reset.
- [x] BFR-03 Instanced occupied cells and ghost/active/locked states align and remain visually distinguishable in all palette states.
- [x] BFR-04 Obsidian/ion/orange/red/gold palette and bounded bloom preserve every cell edge and active-piece silhouette.
- [x] BFR-05 Attract replay is deterministic, demonstrates core verbs, and yields immediately to real input.
- [x] BFR-06 Early, consecutive-clear, danger, quad-discharge, level-up, and game-over arcs visibly change cabinet/audio state.
- [x] BFR-07 Move, rotate, lock, clear, quad, level, hold, and game-over cues are typed, registered, gesture-unlocked, and actual-event-driven.
- [x] BFR-08 Camera remains fixed/readable with only short state-driven impulses removed under reduced motion.
- [x] BFR-09 DOM mirrors accessible HUD truth and never fakes the playfield or 3D effects.
- [x] BFR-10 Browser evidence proves keyboard/touch play, pause, outcome, and reset.
- [ ] BFR-11 Attract, play, clear, quad, danger, game-over, mobile, and reduced-mode artifacts pass exact review.
- [ ] BFR-12 Instance/performance, route-health, assets/audio, deployment, bounded claims, and independent approval pass.

### Verification record

| Date | Requirement | Evidence | Result |
| --- | --- | --- | --- |
| 2026-08-23 | BFR baseline | Current app/route-health plus attract, board, audio, replay, and browser FX suites inventoried | In progress |
| 2026-08-23 | BFR-01–BFR-10 | `pnpm --dir apps/showcase-blockfall-reactor typecheck`; production build; 28 focused unit assertions; 8 focused browser cases; exact scenario receipts/hashes under `tests/reports/blockfall-reactor-fx/`; bloom stills; current desktop/mobile/reduced-motion pixel inspection; draw-call A/B 171 vs 563; deploy release gate | Pass |
| 2026-08-23 | BFR-11–BFR-12 | Generated `route-health.json` records current source hash, six exact mounted-kit scenario receipts, mobile/reduced artifacts, bounded claims, and successful deployment validation | Awaiting independent exact-artifact/human approval; not checked |
| 2026-08-23 | Final machine refresh | Fresh app typecheck and production build pass; 28/28 focused unit assertions and 9/9 focused browser scenarios pass; exact acceptance receipts and bloom stills were regenerated; route health was rewritten from current source; strict release deploy reports `ok:true` with zero failures/warnings | Machine-complete; independent approval deliberately not inferred |
