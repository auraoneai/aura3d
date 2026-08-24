# Current Games — Portfolio Redesign PRD

**Revision:** 3.0  
**Date:** 2026-08-22  
**Status:** machine-complete; promotion remains blocked on independent exact-artifact reviews  
**Scope:** Turbo Drift Circuit, Aura Clash Arena, Neon Corridor Strike, Blockfall Reactor, Skyline Runner

## Product decision

The five current games are not receiving another layer of decorative props. They are being re-directed as five unmistakably different, screenshot-worthy arcade experiences. Existing gameplay contracts that are proven and fun may stay; weak staging, generic neon, flat lighting, cluttered HUDs, placeholder composition, and effects that do not communicate gameplay should be replaced.

The target is a strong playable vertical slice for each game—not a claim that Aura3D is a mature commercial game engine. Every route keeps its current capability label until the exact rebuilt artifact passes its own runtime, visual, accessibility, performance, asset, and human-review gates.

## Portfolio identity

| Game | One-sentence promise | New visual identity | Signature moment |
| --- | --- | --- | --- |
| Turbo Drift Circuit | Thread a Formula-style car through a dusk circuit and beat your own ghost. | sun-baked club racing; vermilion car, cobalt rival, amber horizon, cool asphalt | drift through the final bend beside the translucent best-lap ghost |
| Aura Clash Arena | Read, bait, punish, and finish a rival in a rooftop duel. | graphic rooftop fight broadcast; ink-black silhouettes, jade player energy, magenta rival energy | hit-stop KO framed by in-world ceremony type and a crowd surge |
| Neon Corridor Strike | Fight forward through a hostile industrial corridor, not a target range. | oppressive sci-fi utility deck; sodium lamps, emergency red, weapon cyan | breach the final lock while tracers, debris, and alarm states converge |
| Blockfall Reactor | Stabilize an arcade reactor by making clean, rhythmic line clears. | premium physical cabinet plus luminous reactor well; obsidian shell, ion blue, warning orange | a four-line clear discharges the reactor and transforms the whole cabinet |
| Skyline Runner | Carry a relay spark across three escalating rooftop districts. | stylized sunrise parkour; steel blue dawn, green grove, gold crown district | clear the final rooftop gap with the best-run ghost in frame |

## What Aura3D should visibly demonstrate

The redesign uses capabilities only where they strengthen a game:

- typed, provenance-tracked primary GLB/glTF assets and normalized placement;
- one `createAuraApp` per root-safe route, runtime-node mutation, deterministic frame stepping, pause, reset, and input replay;
- route-local game logic supported by public input, collision, query, physics, platformer, racing, falling-block, combat, camera, effects, HUD, accessibility, and evidence helpers;
- real renderer-owned particles/effects, scene geometry, instancing, distance LOD, mesh text, and physics flavor where currently proven from the selected API path;
- clip controls and animation events only when typed clip metadata and the route's API boundary support them;
- audio registered through the asset pipeline, separated into useful buses, unlocked by user gesture, and tied to state transitions;
- browser proof that interaction changes runtime state and rendered pixels.

Capability breadth is not the design goal. If a feature does not improve readability, tension, mastery, or replay value, it does not ship.

## Shared redesign laws

1. **The opening frame sells the fantasy.** The primary subject, immediate objective, playable space, and danger or rival must be readable before movement.
2. **One dominant focal point.** UI, bloom, fog, props, and particles must support the focal hierarchy rather than compete with it.
3. **Three-layer depth.** Every camera composition needs readable foreground framing, playable midground, and a restrained background silhouette.
4. **Gameplay owns effects.** Every major effect answers an event: acceleration, hit, guard, pickup, line clear, checkpoint, damage, failure, or victory.
5. **Color carries state.** Neutral exploration/play, warning, success, player, rival, and interactable colors are consistent within each title.
6. **No generic neon soup.** Emissive color is an accent. Surfaces need value separation, darkness, negative space, and material contrast.
7. **No fake 3D.** DOM is menus, HUD, captions, and accessible status only; particles, trails, lighting, world labels, impacts, and scene objects come from Aura3D-rendered systems.
8. **No primitive hero assets.** Named characters, vehicles, weapons, worlds, cabinets, and environments use typed assets. Procedural geometry may support abstract playfields and set dressing.
9. **The first minute has an arc.** Establish the verb, introduce pressure, create a reversal or escalation, then deliver a payoff or clear failure.
10. **Feel survives reduced motion.** Reduced-motion and reduced-flash modes remove camera shake, aggressive pulses, and flashes without hiding game truth.
11. **Desktop and mobile are separately composed.** Mobile is not a cropped desktop screenshot; HUD density, camera distance, and touch occlusion are reviewed independently.
12. **No self-promotion from green automation.** Automated checks establish correctness. An independent human approves the exact final desktop and mobile artifacts.

## Shared quality bar

Each route needs all of the following before promotion:

| Gate | Required evidence |
| --- | --- |
| Product | clear fantasy, objective, fail condition, progression, reset, and a complete 60+ second session or intentionally shorter replayable round |
| Composition | first-load, active-play, escalation, failure, and victory captures at desktop and mobile widths |
| Gameplay | browser input proves movement plus the title's signature mechanic and full reset |
| Visual | primary subject readable; no accidental occlusion, blank fallback, debug geometry, clipped type, blown highlights, or UI covering action |
| Assets | typed references, durable provenance/license fields, validation output, no raw URLs or invented IDs |
| Runtime | deterministic state where promised; pause freezes gameplay clocks; one app mount; evidence global is additive and truthful |
| Audio | gesture unlock, bus ownership, cue manifest, mute behavior, no unregistered media |
| Accessibility | keyboard, visible focus, readable HUD, reduced motion/flash, contrast, touch parity where promised |
| Performance | route-specific frame-time/draw/instance budgets measured on the supported test profile |
| Claims | route-health generated from source and commands; capability label matches the actual import/runtime path |
| Review | independent human approval bound to exact screenshot hashes and deployed build |

## Execution model

Work in vertical slices, not subsystem-wide passes:

1. Lock each game's visual thesis, camera grammar, palette, and five acceptance frames.
2. Repair first-load composition and primary asset readability before adding mechanics.
3. Make the signature interaction feel excellent using state-tied animation, audio, effects, and camera response.
4. Build the first-minute dramatic arc and full win/fail/reset loop.
5. Add density and secondary systems only after the core remains legible under play.
6. Validate desktop, mobile, reduced-motion, pause, deterministic replay, and route evidence.
7. Capture exact artifacts and request independent review; do not mark the game visually approved yourself.

## Recommended order

1. **Blockfall Reactor** — bounded camera and abstract board make it the fastest place to establish the new visual bar.
2. **Turbo Drift Circuit** — tests the portfolio's chase-camera, environment, speed, and replay language.
3. **Skyline Runner** — tests side-on composition, animation, layered vistas, and platform readability.
4. **Neon Corridor Strike** — higher camera/weapon/occlusion risk; preserve every binding FPS law.
5. **Aura Clash Arena** — highest animation, combat-readability, and import-boundary risk; finish once the shared art-review process works.

## Detail documents

- `CurrentGames-PRD/01-Turbo-Drift-Circuit.md`
- `CurrentGames-PRD/02-Aura-Clash-Arena.md`
- `CurrentGames-PRD/03-Neon-Corridor-Strike.md`
- `CurrentGames-PRD/03-Neon-Corridor-Strike-CONSTRAINTS.md`
- `CurrentGames-PRD/04-Blockfall-Reactor.md`
- `CurrentGames-PRD/05-Skyline-Runner.md`

These documents are planning sources. A checked task means the named evidence exists in the current worktree; it never means visual or public-release approval by implication.

## Execution ledger

**Status:** Machine-complete; blocked only on independent exact-artifact reviews  
**Last verified:** 2026-08-23 23:47 PDT  
**Implementation scope:** five current-game routes, their tests/evidence, this roll-up, and six child PRD/constraint documents  
**Authoritative evidence:** child ledgers; current unit/browser/build/deploy outputs; generated route-health; exact desktop/mobile artifacts; independent review verdicts  
**Remaining blockers:** exact final independent reviews remain pending for all five games; CG-01, CG-05, CG-10, and CG-12 stay open where they explicitly require those verdicts or final blocker clearance

### Requirement checklist

- [ ] CG-01 All five current-game child PRDs have `Status: Complete`, no unchecked requirements, and no remaining blockers.
- [ ] CG-02 The Neon Corridor binding-constraint ledger is complete against unchanged FPS-law evidence.
- [x] CG-03 Each game has the unique player promise, visual identity, and signature moment defined in the portfolio table.
- [ ] CG-04 Every game passes the twelve shared redesign laws in desktop, mobile, and reduced-mode scenarios.
- [ ] CG-05 Product, composition, gameplay, visual, asset, runtime, audio, accessibility, performance, claims, and review gates pass for every game.
- [x] CG-06 Every game proves a complete first-minute/session arc with objective, progression, outcome, pause, and full reset.
- [x] CG-07 Typed primary assets and durable provenance are current; no primitive hero, raw URL, invented ID, or direct loader is present.
- [x] CG-08 Effects and world presentation originate from Aura3D/runtime state; DOM remains UI/accessibility only.
- [x] CG-09 Current capability labels match the actual API/import paths and no promotion language exceeds evidence.
- [ ] CG-10 Final source-bound desktop/mobile artifacts for all five games have current hashes and independent human approval.
- [x] CG-11 Current-game narrow gates and final broad repository gates pass against the same source revision.
- [ ] CG-12 A fresh roll-up audit finds zero unchecked child requirements and zero unresolved blockers.

### Verification record

| Date | Requirement | Evidence | Result |
| --- | --- | --- | --- |
| 2026-08-23 | CG baseline | All six child documents and five route/test families inventoried; no current evidence inherited as completion | In progress |
| 2026-08-23 | Current-games machine checkpoint | Turbo, Aura Clash, Neon Corridor, Blockfall, Skyline, and the binding Corridor companion all have requirement-level machine evidence; the 18-game thumbnail producer refreshes gallery imagery without granting visual approval | Five machine-complete routes; independent exact reviews and final broad same-revision audit remain pending |
| 2026-08-23 | CG-11 final broad gate | `pnpm typecheck`; `pnpm build`; `pnpm test` | Pass — root typecheck; 29-package build; 494 unit files / 3,728 assertions; 9 integration files / 11 assertions, all against the consolidated source tree |
