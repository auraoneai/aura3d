# Patrol Wing — Frontier Air Patrol Redesign PRD

**Route:** `apps/showcase-patrol-wing/`  
**Claim:** root-safe prototype with route-local authored arcade flight/combat; not an aerodynamic or flight-simulation claim

## Experience

Fly a compact patrol route through mountain rings, intercept drones, manage hull, and land on a frontier pad. The player should understand heading, altitude trend, target position, and landing risk from the scene—not fight the camera or instrument clutter.

## Visual thesis

Dieselpunk frontier above ochre ridges and cloud shadow: cream/red player plane, black/orange drones, cyan route rings, amber pad beacon. Chase camera leads velocity gently with stable horizon and strong aircraft silhouette. Target framing never pulls the camera away from terrain safety.

## Patrol arc

- Takeoff and first three rings teach pitch/yaw/throttle response.
- Drone pair introduces lead, fire cadence, and damage feedback.
- Canyon segment demands route discipline and altitude reading.
- Final drone wave plus low-hull warning creates pressure.
- Return approach teaches glide, alignment, descent, and touchdown classification.

## Systems

- Typed plane, drones, rings/beacon/environment assets; authored flight state with honest naming.
- Seeded drone routes and route-local combat; hit truth from the exact query/collision path used.
- Ring sensors progress patrol once per entry; landing state uses pinned pad, velocity, and orientation bounds.
- Ghost may replay best ring path visually; no collision or scoring effect.
- Audio: engine/wind, cannon, hit/down, warning, ring, touchdown, patrol clear.

## Proof and quality gates

- Unit pins flight response, seed, weapon cooldown/hit, ring order, hull, touchdown, reset.
- Browser proves flight axes, rings, fire/drone down, damage/fail, landing, pause, reset.
- Captures: takeoff, ring run, drone pass, hit, canyon, low hull, final approach, touchdown, mobile.

## Definition of done

- [x] Plane remains in frame with a stable horizon throughout the acceptance patrol.
- [x] Rings, drones, terrain, and pad are readable at gameplay distance.
- [x] Flight and combat are clearly labeled authored arcade systems.
- [x] Landing outcome matches visible approach state.
- [ ] Exact desktop/mobile/reduced-motion artifacts pass independent review.

## Execution ledger

**Status:** Machine-complete; blocked only on independent exact-artifact review  
**Last verified:** 2026-08-23 22:18 PDT  
**Implementation scope:** `apps/showcase-patrol-wing/`, flight/combat/patrol source/assets, unit/browser/evidence surfaces, and this PRD  
**Authoritative evidence:** flight/combat units; playable browser spec; generated route-health/deploy; exact reviewed frames  
**Remaining blockers:** independent human review of the exact hash-bound desktop/mobile/reduced-motion artifact family; promotion remains intentionally blocked until that verdict is recorded

### Requirement checklist

- [x] PW-01 Typed plane, drones, rings/beacon, and environment have durable provenance and readable frontier composition.
- [x] PW-02 Chase camera leads velocity with stable horizon and never sacrifices terrain safety or aircraft silhouette for target framing.
- [x] PW-03 Takeoff/rings, drone pair, canyon, final wave/low hull, return approach, touchdown, and reset form a complete patrol arc.
- [x] PW-04 Authored arcade flight and route-local combat ownership is precisely labeled with no aerodynamic/simulation claim.
- [x] PW-05 Flight response, seeded drones, fire cooldown/hit, ordered rings, hull, touchdown, failure, pause, and reset are deterministic.
- [x] PW-06 Ring sensors fire once and landing classification matches visible pad, velocity, alignment, and orientation state.
- [x] PW-07 Typed engine/wind/weapon/hit/warning/ring/touchdown audio and scene feedback are state-driven.
- [x] PW-08 Browser proves all flight axes, rings, fire/down, damage/fail, landing, pause, reset, and promised touch.
- [x] PW-09 Takeoff, rings, drone, hit, canyon, low hull, approach, touchdown, mobile, and reduced-mode artifacts pass.
- [ ] PW-10 README, route-health, performance, deploy, bounded claims, accessibility, and independent review pass.

### Verification record

| Date | Requirement | Evidence | Result |
| --- | --- | --- | --- |
| 2026-08-23 | PW baseline | Current source/assets and flight/combat/playable suites located; README/route-health absent | In progress |
| 2026-08-23 | PW-01–PW-08 implementation and gameplay proof | `apps/showcase-patrol-wing/src/`; four original release-quality typed CC0 models; eleven candidate-quality typed CC0 audio cues; 23/23 focused units; expanded playable browser test; complete rings, two-drone combat, damage/failure, approach/touchdown, reset, keyboard/touch, pause, and reduced-motion truth | Pass |
| 2026-08-23 | PW-09 exact machine artifact family | `tests/reports/patrol-wing/playable/browser-evidence.json`; ten source-, producer-, and artifact-hash-bound captures for takeoff, ring run, drone pass/hit, canyon, low hull, final approach, touchdown, mobile touch, and reduced motion | Pass — independent verdict still pending |
| 2026-08-23 | PW-10 machine gates | README; route typecheck/build; zero-warning four-model strict deploy; 0.004 ms route-logic CPU p95, deterministic state hash `54dcd06e`, 133 draw calls; route-health machine pass; route-primary pass; accessibility and bounded authored-arcade claims | Pass except independent review |
| 2026-08-23 | Portfolio route policy and launch classification | Full retained route-primary sweep; launch entry `ok: true`, `staticGateOk: true`, `routePrimaryProbe.ok: true`, `classificationOk: true`, `publicReleaseCounted: false`; sole Patrol diagnostic blocker is `visual-review:patrol-wing-independent-review-pending` | Pass — correctly blocked from promotion |
