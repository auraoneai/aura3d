# Courier Rush — Midnight Dispatch Redesign PRD

**Route:** `apps/showcase-courier-rush/`  
**Claim:** root-safe prototype with route-local delivery rules and traffic behavior

## Experience

Run five urgent deliveries through a compact rain-dark district. Read dispatch, locate a pickup, load a visible parcel, choose a route through seeded traffic, and bank an early-delivery combo. This is navigation under pressure, not circuit racing with package icons.

## Visual thesis

Warm storefronts and pickup/drop zones against cool wet streets, red tail lamps, cream van, restrained teal navigation accents. Close chase camera shows the van and next intersection; destination landmarks rise above traffic without turning into fake world geometry. Traffic silhouettes and brake states stay readable in rain/fog.

## Shift arc

1. Nearby pickup/drop teaches zones and parcel visibility.
2. Cross-traffic introduces timing and horn warning.
3. Two-route delivery rewards navigation choice.
4. Fragile express run tightens timer and strike stakes.
5. Final long run combines traffic and short deadline, then resolves to a shift scorecard.

## Systems

- Typed van, parcel, traffic variants, and zone landmarks; public arcade vehicle helper with a delivery-specific tune.
- Seeded route-local traffic follows authored lane loops and courtesy windows; it is not navmesh traffic.
- Sensor-backed pickup/drop changes parcel node visibility and dispatch truth exactly once.
- Strikes come from pinned collision rules; combo comes from actual early delivery.
- Audio separates engine, rain/ambient, traffic, dispatch, parcel, score, and UI.

## Proof and quality gates

- Unit: queue/timers/combo/strikes, lane-loop seed, courtesy stops, full reset.
- Browser: drive, pickup with visible parcel, delivery, traffic strike, fail, pause, full shift completion.
- Acceptance captures: dispatch start, pickup, parcel-in-bed, busy intersection, drop payoff, shift result, mobile.

## Definition of done

- [x] README and feel clearly distinguish the game from Turbo Drift Circuit.
- [x] Every delivery is navigable and completable inside its authored timer.
- [x] Parcel and zones are real scene state, not DOM-only representation.
- [x] Traffic is deterministic for a seed and never spawns unfairly on the player.
- [x] Mobile controls leave road, van, and next intersection readable.
- [ ] Exact artifacts and deploy pass independent review.

## Execution ledger

**Status:** Machine-complete; independent exact-artifact review pending  
**Last verified:** 2026-08-23 13:50 PDT  
**Implementation scope:** `apps/showcase-courier-rush/`, Courier unit/browser/evidence surfaces, generated artifacts, and this PRD  
**Authoritative evidence:** dispatch/traffic units; playable/scene browser specs; typed assets/audio; route/deploy/review artifacts  
**Remaining blockers:** Independent human review of the exact hash-bound final artifacts is required before public promotion; all repository-controlled implementation, evidence, performance, asset, route-health, and deploy gates pass.

### Requirement checklist

- [x] CR-01 Midnight district composition, camera, wet-street values, van, traffic, landmarks, and route cues are readable and distinct from Turbo.
- [x] CR-02 Five deliveries teach zones, traffic, route choice, fragile express pressure, and a combined final run within authored timers.
- [x] CR-03 Typed van/parcel/traffic/landmarks and delivery-specific arcade tune are current and honestly bounded.
- [x] CR-04 Seeded authored lane-loop traffic and courtesy windows are deterministic, readable, and never spawn unfairly.
- [x] CR-05 Pickup/drop sensors fire once and make the typed parcel visibly load/unload in sync with dispatch truth.
- [x] CR-06 Collision strikes, early-delivery combo, timers, failure, completion, pause, and full reset are deterministic.
- [x] CR-07 Engine/rain/traffic/dispatch/parcel/score/UI audio and scene feedback originate from real state.
- [x] CR-08 Browser proves drive, pickup, parcel visibility, delivery, traffic strike, fail, pause, reset, and full shift on keyboard/touch.
- [x] CR-09 Dispatch, pickup, parcel, intersection, drop, result, mobile, and reduced-mode artifacts pass.
- [ ] CR-10 Performance, route-health, assets/audio, deploy, bounded claims, accessibility, and independent review pass.

### Verification record

| Date | Requirement | Evidence | Result |
| --- | --- | --- | --- |
| 2026-08-23 | CR baseline | Current app/route-health plus dispatch, traffic, playable, and scene suites located | In progress |
| 2026-08-23 | CR-02, CR-04–CR-08 | `13/13` Courier units and `2/2` browser suites; full-shift report proves five trigger-enter pickups/drops inside timers, real pause freeze, typed parcel state, collision/timer failure, reset, keyboard and touch drive | Pass |
| 2026-08-23 | CR-03, CR-07 | Six original CC-BY model hashes reproducibly registered release-quality with root-safe rendered probes; ten deterministic CC0 cues registered and referenced by live state | Pass |
| 2026-08-23 | CR-01, CR-09 | Agent inspected dispatch, pickup, parcel, intersection/strike, drop payoff, failure, completion, 390×844 mobile, reduced-motion, and route-primary artifacts; no independent approval claimed | Machine pass; human review pending |
| 2026-08-23 | CR performance | `performance-report.json`: dispatch p95 `0.0008 ms`, eight-car traffic p95 `0.0088 ms`, full-shift draw calls `376/600` | Pass |
| 2026-08-23 | CR route/deploy | Source-bound `route-health.json` reports `machinePass: true`, primitives `3/40`; exact six-asset release deploy has zero failures/warnings; root typecheck and docs gates pass | Pass |
| 2026-08-23 | CR route-primary | Current source `sha256-a7f97f9275fed8ce430b33c388a82625b2ef1823f2e0f8c7ddd40b006307bba2`; van isolation `216×332`, `28,531` pixels, 65 color buckets, readability 80, unclipped/unoccluded | Pass |
| 2026-08-23 | Exact artifact hashes | dispatch `f04ebb49…`; pickup `9686c711…`; parcel `66643978…`; intersection `cc488751…`; payoff `430e3112…`; strike fail `f9e34873…`; timer fail `02fd4fd0…`; result `5853aefe…`; mobile `c87018b7…`; reduced `f40ed7b8…`; route-primary `2f462265…` | Bound for independent review |
