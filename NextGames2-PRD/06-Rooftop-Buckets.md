# Rooftop Buckets — Summer-Night Heats Redesign PRD

**Route:** `apps/showcase-rooftop-buckets/`  
**Claim:** root-safe prototype with route-local basketball shot/scoring logic; no reusable sports kit claim

## Experience

Survive a sequence of rooftop shooting heats: choose aim and release strength, read the projected arc, beat moving pressure, build a swish streak, and hit the gold ball before the buzzer. The rim, ball path, release, and result must be visually credible from every accepted camera state.

## Visual thesis

Warm sodium court light against a deep blue summer skyline, orange ball, white net/rim accents, gold bonus ball, restrained red buzzer state. Camera sits just behind and above the shooter lane with rim/backboard unobstructed. The typed court, rim/backboard, ball, and defender create a real place; city dressing stays below the shot arc.

## Heat arc

1. Open heat teaches aim/power and makes/misses.
2. Spot heat requires shots from three marked locations.
3. Pressure heat adds a defender telegraph and shorter clock.
4. Fire heat rewards consecutive swishes with a visible/audible state.
5. Gold-ball finale offers a high-value last shot before the buzzer.

## Shot contract

- Aim/power predicts a bounded first-flight arc from the same authored/physics step used by the actual shot.
- A make requires a valid top-to-bottom rim sensor sequence; board/rim contacts cannot count as a swish.
- Ball locks to one active shot until settle/reset; no double score.
- Defender pressure modifies a documented timing/aim parameter and has a readable telegraph; it does not secretly rewrite outcomes.

## Systems and proof

- Typed court, hoop/rim/backboard, ball, and defender assets with real scene participation.
- Unit: trajectory determinism, rim sequence, swish/board/rim/miss, streak, heat timers, gold ball, reset.
- Browser: aim/power, make/miss, spot progression, defender pressure, fire streak, buzzer fail, gold win, pause.
- Acceptance captures: opening court, charged arc, release, swish, rim miss, defender contest, fire state, buzzer/gold result, mobile.

## Definition of done

- [x] Predicted and actual pinned arcs agree within the published tolerance.
- [x] Rim, net/goal region, ball, and defender remain readable throughout flight.
- [x] Make categories and score/streak behavior are deterministic and non-duplicating.
- [x] Touch aim can be used without covering the hoop or release lane.
- [ ] Exact desktop/mobile/reduced-motion artifacts pass independent review before promotion.

## Execution ledger

**Status:** Machine-complete; promotion blocked pending independent exact-artifact review  
**Last verified:** 2026-08-23 18:03 PDT  
**Implementation scope:** `apps/showcase-rooftop-buckets/`, court/shot/scoring/heats source/assets, unit/browser/evidence surfaces, and this PRD  
**Authoritative evidence:** scoring/heats units; source-bound playable and shot-visual browser reports; registered asset/probe evidence; generated route-health, performance, deploy, route-primary, route-policy, docs, and launch reports; exact unreviewed frames  
**Remaining blockers:** independent human approval of the exact hash-bound desktop, mobile, touch-active, outcome, and reduced-motion artifact family; promotion remains intentionally blocked until that verdict is recorded

### Requirement checklist

- [x] RB-01 Typed court, hoop/rim/backboard, ball, and defender have durable provenance and materially participate in play.
- [x] RB-02 Summer-night camera keeps rim, backboard, ball path, release lane, defender, and shot arc unobstructed.
- [x] RB-03 Open, spot, pressure, fire, and gold-ball heats form an escalating complete session with outcome and reset.
- [x] RB-04 Aim/power prediction uses the actual bounded first-flight step and meets published pinned-arc tolerance.
- [x] RB-05 Make requires valid top-to-bottom rim sequence; board/rim/miss/swish categories and shot lock prevent double score.
- [x] RB-06 Defender pressure has a readable telegraph and documented deterministic influence rather than hidden outcome rewriting.
- [x] RB-07 Streak, fire, gold ball, timer/buzzer, scoring, pause, fail/win, and reset are deterministic.
- [x] RB-08 Typed registered court/contact/outcome audio and scene feedback are actual-event-driven.
- [x] RB-09 Browser proves aim, power, make/miss, spots, defender, fire, buzzer, gold win, pause, reset, and touch.
- [x] RB-10 Opening, charge, release, swish, miss, contest, fire, result, mobile, and reduced-mode artifacts pass.
- [ ] RB-11 README, route-health, performance, deploy, bounded claims, accessibility, and independent review pass.

### Verification record

| Date | Requirement | Evidence | Result |
| --- | --- | --- | --- |
| 2026-08-23 | RB baseline | Current source/route-health plus scoring/heats/playable/shot suites located; README absent | In progress |
| 2026-08-23 | RB-01–RB-08 | Five typed release-quality GLBs and ten typed candidate-quality WAVs with durable CC0 provenance; five release-asset probes; 17/17 scoring/heat/trajectory tests; deterministic seeded audio/model builders; current root-safe runtime and README | Pass |
| 2026-08-23 | RB-02, RB-09, RB-10 | `rooftop-buckets-playable.spec.ts` and `rooftop-buckets-shot-visual.spec.ts`: 3/3 browser tests; 13 exact desktop/mobile/touch/reduced-motion artifacts; source-bound reports `b97efeda…` and `23a408e…` | Pass — exact artifacts generated and machine-validated; independent verdict still pending |
| 2026-08-23 | RB-04–RB-07 | Exact shared ballistic integrator/predictor, armed top-to-bottom rim sequence, deterministic defender influence, five-heat progression, terminal lock/reset, and 17/17 focused unit tests | Pass |
| 2026-08-23 | RB-11 machine gates | Typecheck; zero-warning deploy `417521b0…`; performance `4aa37584…` (0.002 ms ballistic p95, 118/150 draw calls, zero physics bodies); route-health `dd0e5eaa…`; route-primary `6e00f16b…` (188×209 isolated backboard, 9,148 pixels, no failures); docs checks | Pass except independent review |
| 2026-08-23 | Route policy and launch classification | Route-policy tests 34/34; launch evidence `03df990a…`: Rooftop `ok: true`, `prototype-blocked`, classification/build/deploy/health valid, sole blocker `visual-review:rooftop-buckets-independent-review-pending` | Pass — correctly blocked from promotion |
