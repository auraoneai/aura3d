# Next Games 2 — Portfolio PRD

**Revision:** 3.0  
**Date:** 2026-08-22  
**Status:** machine-complete; promotion remains blocked on independent exact-artifact reviews  
**Scope:** Vault Breakers, Bank Shot, Patrol Wing, Gallery Shift, Deep Recovery, Rooftop Buckets

## Portfolio thesis

This collection is built around familiar physical fantasies with unusually strong scene readability: pinball, pool, flight, stealth, underwater salvage, and rooftop basketball. Familiarity raises the bar. A recognizable object with weak scale, lighting, contact, staging, or motion looks worse than an abstract prototype, so every game must make its central physical relationship instantly credible.

| Game | Player fantasy | Physical relationship to sell | Visual direction | Signature frame |
| --- | --- | --- | --- | --- |
| Vault Breakers | crack a vault by mastering a pinball table | flipper → ball → target bank | deco bank vault crossed with premium arcade hardware | multiball erupts as the vault door swings open |
| Bank Shot | run a three-rack night under the hall lamp | cue → ball → cushion/pocket | smoky after-hours pool hall, green cloth, brass light | the eight ball drops while the table settles around it |
| Patrol Wing | fly a dangerous border patrol | aircraft → air mass → drone/landing pad | graphic dieselpunk frontier at high altitude | low-health touchdown after the final drone pass |
| Gallery Shift | steal three exhibits without being seen | thief → occluder → guard/camera/laser | quiet modern museum after midnight | exit doors open as a guard beam sweeps behind the thief |
| Deep Recovery | salvage a wreck before oxygen and hull fail | sub → sonar → grappled mass | black-water industrial dive with bioluminescent accents | heavy crate breaks the surface with oxygen nearly gone |
| Rooftop Buckets | survive escalating street-ball shooting heats | release arc → rim/backboard → net | summer-night city rooftop, sodium court light, distant skyline | gold ball swishes at the buzzer with the defender airborne |

## Shared direction

1. **Physical scale first.** Camera height, object proportions, contact points, and grounding must make the central interaction believable within the supported renderer path.
2. **The play surface is sacred.** Decorative elements never obscure ball paths, flight corridors, patrol cones, sonar returns, grapple lines, or basket silhouettes.
3. **Anticipation before impact.** Charge, aim, predicted path, guard telegraph, sonar pulse, or shot arc creates readable intent before the result.
4. **Impact changes the whole composition.** Major successes affect lighting, audio layers, world props, camera framing, and score—not just a small HUD number.
5. **Failure is authored.** Tilt, scratch, crash, detection, blackout, or buzzer failure has a distinct visual/audio state and a fast, obvious reset.
6. **No simulation inflation.** Authored arcade gravity, kicks, steering, drag, perception, or scoring are labeled authored. Rapier/query ownership is described precisely.
7. **No asset laundering.** Every primary table, ball, vehicle, character, museum, exhibit, wreck, court, rim, and defender is typed and provenance-tracked.
8. **Exact artifacts decide promotion.** Source, green tests, or a route-health declaration cannot substitute for current desktop/mobile captures and independent review.

## Recommended delivery order

1. **Bank Shot** — tightly bounded camera and universally legible success/failure.
2. **Rooftop Buckets** — validates trajectory feedback, rim contact, pacing, and mobile aim.
3. **Vault Breakers** — highest physics/mechanism tuning burden among the ball games.
4. **Gallery Shift** — validates spatial queries and state-readable stealth without fake overlays.
5. **Deep Recovery** — validates darkness, sonar readability, towing feel, and resource pressure.
6. **Patrol Wing** — highest camera, control, target readability, and large-space composition risk.

## Shared release gates

| Area | Portfolio requirement |
| --- | --- |
| First frame | hero object and playable space dominate; objective is legible within three seconds |
| Interaction | keyboard and promised touch input visibly change both runtime state and 3D pixels |
| Physics/queries | deterministic scenarios test the exact collision, joint, sensor, ray/sphere/overlap query, or authored approximation used |
| Camera | no clipping, lost subject, inverted horizon, blocked rim/pocket, or unreadable line of action in acceptance scenarios |
| Feedback | charge/telegraph, impact, success, damage/failure, and outcome each have distinct scene and audio language |
| Assets | typed references plus durable hash/license/source metadata for every primary asset |
| Accessibility | pause, focus, contrast, reduced motion/flash, non-color-only state, touch safe areas |
| Performance | route-specific body/query/instance/draw budgets measured under the acceptance scenario |
| Evidence | generated route-health, runtime global, unit and browser proof, exact screenshot hashes, deploy check |
| Review | independent human verdict on final desktop and mobile artifacts; no self-approval |

## Detail documents

- `NextGames2-PRD/01-Vault-Breakers.md`
- `NextGames2-PRD/02-Bank-Shot.md`
- `NextGames2-PRD/03-Patrol-Wing.md`
- `NextGames2-PRD/04-Gallery-Shift.md`
- `NextGames2-PRD/05-Deep-Recovery.md`
- `NextGames2-PRD/06-Rooftop-Buckets.md`

Each detail PRD describes the desired rebuild from the player's point of view, then binds that direction to Aura3D's current public and route-local implementation surfaces. Checklists are proof requirements, not declarations that work already passed.

## Execution ledger

**Status:** Machine-complete; blocked only on independent exact-artifact reviews  
**Last verified:** 2026-08-23 23:47 PDT  
**Implementation scope:** six Next Games 2 routes, their assets/tests/evidence, six child PRDs, and this portfolio roll-up  
**Authoritative evidence:** child ledgers; deterministic physical/query fixtures; current unit/browser/build/deploy outputs; generated route-health; exact reviewed artifacts  
**Remaining blockers:** all six child games are machine-complete but still await independent exact-artifact review; every route remains unpromoted until those external verdicts are recorded

### Requirement checklist

- [ ] NG2-01 All six child PRDs have `Status: Complete`, no unchecked requirements, and no remaining blockers.
- [x] NG2-02 Every title delivers its specified player fantasy, central physical relationship, art direction, and signature frame.
- [x] NG2-03 Physical scale, play-surface visibility, anticipation, impact payoff, and authored failure are proven per title.
- [x] NG2-04 Simulation ownership and authored approximations are precisely labeled with no capability inflation.
- [x] NG2-05 Every primary table, ball, vehicle, character, museum, exhibit, wreck, court, rim, and defender is typed and provenance-tracked.
- [x] NG2-06 First-frame and interaction evidence proves real scene/runtime change on keyboard and promised touch input.
- [x] NG2-07 Camera acceptance scenarios contain no clipping, lost subject, inverted horizon, blocked target, or unreadable action line.
- [x] NG2-08 Charge/telegraph, impact, success, failure, and outcome have distinct state-driven scene/audio language.
- [x] NG2-09 Pause, focus, contrast, reduced motion/flash, non-color-only state, and touch safe areas pass per title.
- [x] NG2-10 Route-specific body/query/instance/draw budgets and deterministic fixtures pass.
- [ ] NG2-11 Generated route-health, runtime globals, unit/browser proof, deploy checks, exact hashes, and independent reviews are current.
- [ ] NG2-12 A fresh portfolio audit finds zero unchecked child requirements and zero unresolved blockers.

### Verification record

| Date | Requirement | Evidence | Result |
| --- | --- | --- | --- |
| 2026-08-23 | NG2 baseline | Six existing route/source and unit/browser families inventoried; missing README/route-health surfaces recorded | In progress |
| 2026-08-23 | Bank Shot child checkpoint | `NextGames2-PRD/02-Bank-Shot.md`; 27/27 unit tests; 3/3 browser tests; 18 release-model probes; zero-warning deploy; performance, route-health, route-primary, route-registry, docs, and launch evidence | Machine-complete — BS-01 through BS-09 pass; BS-10 and the visual-credibility/final-promotion DoD remain unchecked solely for independent exact-artifact review |
| 2026-08-23 | Rooftop Buckets child checkpoint | `NextGames2-PRD/06-Rooftop-Buckets.md`; 17/17 unit tests; 3/3 browser tests; five release-model probes; ten registered audio assets; zero-warning deploy; performance, route-health, route-primary, route-policy, docs, and launch evidence | Machine-complete — RB-01 through RB-10 pass; RB-11 and the independent-review DoD remain unchecked solely for independent exact-artifact review |
| 2026-08-23 | Vault Breakers child checkpoint | `NextGames2-PRD/01-Vault-Breakers.md`; 20/20 unit tests; 4/4 browser tests; five release-model probes; eleven registered audio assets; warning-free strict deploy; performance, route-health, route-primary, route-policy, docs, and Vault launch classification | Machine-complete — VB-01 through VB-10 pass; VB-11 and the independent-review DoD remain unchecked solely for independent exact-artifact review |
| 2026-08-23 | Gallery Shift child checkpoint | `NextGames2-PRD/04-Gallery-Shift.md`; 37/37 unit tests; 3/3 browser tests; six original route-model probes plus typed thief/guard evidence; eleven registered audio assets; zero-warning strict deploy; performance, route-health, route-primary, accessibility, and 12-file exact artifact family | Machine-complete — GS-01 through GS-12 pass; GS-13 and the independent-review DoD remain unchecked solely for independent exact-artifact review |
| 2026-08-23 | Deep Recovery child checkpoint | `NextGames2-PRD/05-Deep-Recovery.md`; 20/20 unit tests; 2/2 browser tests; five original release-model probes; eleven registered audio assets; zero-warning strict deploy; performance, route-health, full route-primary sweep, docs, and 11-file exact artifact family | Machine-complete — DR-01 through DR-10 pass; DR-11 and the independent-review DoD remain unchecked solely for independent exact-artifact review |
| 2026-08-23 | Patrol Wing child checkpoint | `NextGames2-PRD/03-Patrol-Wing.md`; 23/23 unit tests; expanded browser acceptance patrol; four release-model probes; eleven registered audio assets; zero-warning strict deploy; performance, route-health, route-primary, launch classification, and 10-file exact artifact family | Machine-complete — PW-01 through PW-09 pass; PW-10 and the independent-review DoD remain unchecked solely for independent exact-artifact review |
| 2026-08-23 | Next Games 2 machine checkpoint | Six machine-complete child ledgers plus current 18-game showcase-thumbnail producer | All machine portfolio requirements pass; NG2-01, NG2-11, and NG2-12 remain open only where independent review/final blocker clearance is explicit |
| 2026-08-23 | Final broad repository gate | `pnpm typecheck`; `pnpm build`; `pnpm test` | Pass — root typecheck; 29-package build; 3,728/3,728 unit assertions and 11/11 integration assertions |
