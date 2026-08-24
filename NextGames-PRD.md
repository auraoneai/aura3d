# Next Games — Portfolio PRD

**Revision:** 3.0  
**Date:** 2026-08-22  
**Status:** machine-complete; promotion remains blocked on independent exact-artifact reviews  
**Scope:** Siege Golf, Neon Swarm, Aurora Lander, Gravity Post, Courier Rush, Pulse Tunnel, Mech Hangar

## Portfolio thesis

These seven games should make Aura3D's breadth obvious through play, not through a feature checklist. Each title owns a distinct camera, pace, silhouette, color system, physical verb, and emotional rhythm. Together they cover destruction, crowd pressure, precision flight, orbital planning, city navigation, musical reflex, and asset assembly without presenting route-local code as a universal engine kit.

| Game | Core verb | Camera | Art direction | Primary Aura3D proof target |
| --- | --- | --- | --- | --- |
| Siege Golf | aim, strike, topple | elevated follow/aim | storybook siege range at golden hour | root physics, sensors, camera, typed props |
| Neon Swarm | herd, evade, burst | top-down tactical | black arena with disciplined cyan/magenta threat language | native instancing, seeded steering, effects |
| Aurora Lander | feather, stabilize, land | side/three-quarter chase | polar research frontier under an aurora | terrain/surface queries, vehicle state, particles |
| Gravity Post | plot, slingshot, dock | orbital overview | clean retro-future postal chart in deep space | solar scene composition, authored gravity, prediction |
| Courier Rush | route, deliver, improvise | close chase | rain-wet night delivery district | arcade vehicle, traffic AI, sensors, city composition |
| Pulse Tunnel | read, switch, graze | locked on-rails | graphic music tunnel with section-specific palettes | timeline/audio clock contract, effects, input buffering |
| Mech Hangar | assemble, evaluate, duel | orbit preview then arena | industrial build bay opening into a brutalist pit | typed asset assembly, validation, combat AI |

## Portfolio rules

- Every title opens with the player, objective, and next meaningful affordance visible.
- Every title has a signature frame no sibling could plausibly produce.
- Typed primary assets and asset provenance are part of the product, not hidden plumbing.
- Route-local physics, AI, rules, and glue are named as route-local unless an exported and tested root helper owns them.
- Abstract games may use procedural geometry as the subject only when they are explicitly labeled abstract.
- Audio, VFX, camera movement, world text, and HUD changes are driven from gameplay state.
- A complete run includes instruction, active play, escalation, outcome, and reset.
- Touch controls are designed around safe areas and never obscure the focal play lane.
- Automated screenshots are acceptance artifacts only when the scenario and runtime state are pinned.
- Independent review of exact final artifacts is required before gallery promotion.

## Production sequence

### Wave 1 — prove the visual bar

1. **Siege Golf:** readable physics tableau, impact feel, and environmental storytelling.
2. **Aurora Lander:** vehicle silhouette, terrain readability, atmospheric restraint, and precision feedback.
3. **Neon Swarm:** large-count instancing without losing enemy/player readability.

### Wave 2 — prove systemic variety

4. **Gravity Post:** prediction-first game language and non-physical authored gravity disclosure.
5. **Courier Rush:** navigable city routes, traffic behavior, clear pickup/drop staging.

### Wave 3 — gated experiments

6. **Pulse Tunnel:** proceed with clock-driven beat mode only if measured sync holds; otherwise ship honestly in deterministic pattern mode.
7. **Mech Hangar:** proceed only if the licensed part set passes socket, scale, silhouette, and runtime-validation gates.

## Shared acceptance frame set

Every title must capture and independently review:

1. **Attract/load:** fantasy, player, and objective readable without debug UI.
2. **Primary verb:** the core interaction at its clearest silhouette.
3. **Pressure:** failure risk and game state legible without reading telemetry.
4. **Payoff:** signature success or high-skill moment.
5. **Outcome:** victory/failure presentation and obvious restart affordance.
6. **Mobile:** active play with touch controls and no focal occlusion.
7. **Reduced motion:** same game truth without aggressive camera/flash behavior.

## Shared engineering and evidence gates

- One Aura app mount per route; public package imports only for root-safe claims.
- Fixed-step or deterministic state for systems that promise replays, seeded layouts, AI comparison, or trajectory prediction.
- Input tests cover movement, pause, signature mechanic, fail/win state, and reset.
- Scene tests establish that typed primary assets are mounted, grounded, visible, and materially part of play.
- Pixel assertions target the subject region and a meaningful state change; DOM-only checks cannot prove a 3D claim.
- Route-health declares renderer path, capability label, primary assets, primitive role/count, fallback mode, evidence, and blockers.
- Audio assets are generated or licensed, CLI-registered, gesture-unlocked, and mapped to buses.
- Performance budgets are per title; an instancing title proves draw behavior, while a physics title proves stable fixed stepping and body counts.
- Promotion is blocked by missing artifact hashes, stale screenshots, unverified deployment, or missing independent review even when builds and tests pass.

## Detail documents

- `NextGames-PRD/01-Siege-Golf.md`
- `NextGames-PRD/02-Neon-Swarm.md`
- `NextGames-PRD/03-Aurora-Lander.md`
- `NextGames-PRD/04-Gravity-Post.md`
- `NextGames-PRD/05-Courier-Rush.md`
- `NextGames-PRD/06-Pulse-Tunnel.md`
- `NextGames-PRD/07-Mech-Hangar.md`

The detail PRDs own title-specific creative direction, gameplay arc, asset strategy, implementation seams, risks, and proof. This portfolio document does not confer completion or promotion status on any route.

## Execution ledger

**Status:** Machine-complete; blocked only on independent exact-artifact reviews  
**Last verified:** 2026-08-23 23:47 PDT  
**Implementation scope:** seven Next Games routes, their assets/tests/evidence, seven child PRDs, and this portfolio roll-up  
**Authoritative evidence:** child ledgers; gate-spike reports; current unit/browser/build/deploy outputs; generated route-health; exact reviewed artifacts  
**Remaining blockers:** all seven child games are machine-complete but still require independent exact-artifact review; the portfolio and every route remain unpromoted until those external verdicts

### Requirement checklist

- [ ] NG-01 All seven child PRDs have `Status: Complete`, no unchecked requirements, and no remaining blockers.
- [x] NG-02 Every title has the distinct core verb, camera, art direction, and Aura3D proof target in the portfolio table.
- [x] NG-03 Every title proves attract, primary verb, pressure, payoff, outcome, mobile, and reduced-mode acceptance frames.
- [x] NG-04 Typed primary assets and provenance are complete; abstract procedural subjects are labeled honestly.
- [x] NG-05 Route-local physics, AI, rules, gravity, flight, traffic, and glue are distinguished from exported root helpers.
- [x] NG-06 Each complete run proves instruction, active play, escalation, outcome, pause, and full reset.
- [x] NG-07 Touch layouts respect safe areas and do not occlude the focal play lane.
- [x] NG-08 Current unit/browser/scene/pixel evidence proves the actual 3D behavior rather than DOM text.
- [x] NG-09 Route-health for every title declares renderer path, label, assets, primitive role/count, fallback, evidence, and blockers.
- [x] NG-10 Pulse Tunnel's measured clock spike justifies beat mode or the final route and claims use deterministic pattern mode.
- [x] NG-11 Mech Hangar's licensed compatible-part gate passes without primitive or cosmetic-only substitution.
- [ ] NG-12 All title-specific performance budgets, deployments, exact artifact hashes, and independent visual reviews pass.
- [ ] NG-13 A fresh portfolio audit finds zero unchecked child requirements and zero unresolved blockers.

### Verification record

| Date | Requirement | Evidence | Result |
| --- | --- | --- | --- |
| 2026-08-23 | NG baseline | Seven existing route/source and unit/browser families inventoried; completion evidence not yet audited | In progress |
| 2026-08-23 | NG-10 | `tests/reports/pulse-tunnel/sync-report.json`, Pulse route health, README, and child ledger: HeadlessChrome 151 breached 80 ms for three checks and naturally selected deterministic pattern fallback at 2.888 s | Pass — source-bound `NO-GO-BROWSER-PROFILE`; no universal beat claim |
| 2026-08-23 | Next Games checkpoint | Siege Golf, Neon Swarm, Aurora Lander, Gravity Post, Courier Rush, and Pulse Tunnel child ledgers | Six machine-complete; exact independent reviews remain pending; Mech Hangar remains active |
| 2026-08-23 | NG-11 | Mech `parts-curation-report.json`, 16 release asset probes, `part-matrix.json`, strict deploy report, route-health, focused unit/browser suites, and route-gate integration | Pass — 16/16 deterministic original CC0 MH-2M required parts are compatible, release-proven, hash-unique, typed, and visibly/statistically distinct; no primitive/cosmetic substitution |
| 2026-08-23 | Next Games machine checkpoint | All seven child ledgers and current generated route/deploy/performance/browser evidence | Seven machine-complete; every independent exact-artifact review remains pending and no route was promoted from machine evidence alone |
| 2026-08-23 | Gallery imagery refresh | Current mounted imagery for all seven routes is included in the source-bound 18-game showcase-thumbnail producer and hash manifest | Machine pass; independent visual review remains pending |
| 2026-08-23 | Final broad repository gate | `pnpm typecheck`; `pnpm build`; `pnpm test` | Pass — root typecheck; 29-package build; 3,728/3,728 unit assertions and 11/11 integration assertions |
