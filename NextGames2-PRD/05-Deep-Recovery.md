# Deep Recovery — Black-Water Salvage Redesign PRD

**Route:** `apps/showcase-deep-recovery/`  
**Claim:** root-safe prototype with route-local submarine, sonar, oxygen, and salvage rules; precise query/physics wording required

## Experience

Descend into black water, pulse sonar to reveal a wreck, grapple valuable crates, tow them to a buoy, repair hull breaches, and surface before oxygen expires. Darkness should create tension without making navigation arbitrary; sonar must reveal actual spatial truth.

## Visual thesis

Near-black blue water, narrow warm sub lamps, green-cyan bioluminescence, amber salvage, red breach warning. The typed sub and wreck are always readable as silhouettes. Visibility is layered: lamp cone for immediate space, sonar pulse for temporary structure, buoy beacon for orientation. Fog and particles imply depth but cannot erase the grapple line or collision threat.

## Dive arc

- Descent teaches movement, depth, oxygen, and first sonar return.
- Wreck perimeter introduces a standard crate and safe grapple/tow.
- Interior gap adds hull-contact risk and repair decision.
- Heavy crate increases drag/turn cost and oxygen pressure.
- Final ascent combines low resources, buoy navigation, and surface payoff.

## Systems

- Typed sub, wreck, standard/heavy crates, and buoy.
- Authored submarine thrust/drag/buoyancy and oxygen model; exact physics/query ownership documented.
- Sonar samples real world targets/occlusion rules and renders world-space returns; DOM may list contacts accessibly but cannot fake the pulse.
- Grapple attachment/tow mass visibly changes handling. Collection banks only inside buoy zone.
- Breach, repair, blackout, surfacing, and failure own distinct state-driven light/audio behavior.

## Proof and quality gates

- Unit: sonar target filtering, oxygen/depth consumption, breach/repair, grapple eligibility, crate value/mass, bank, reset.
- Browser: movement, sonar reveal, grapple/tow/drop, collision breach, repair, bank, blackout/fail, surface/win, pause.
- Captures: descent, sonar reveal, wreck approach, grapple, heavy tow, breach, low oxygen, surface, mobile.

## Definition of done

- [x] Full mission is navigable without debug geometry and sonar corresponds to real targets.
- [x] Heavy and standard salvage feel and score differently.
- [x] Darkness remains atmospheric while sub, objective, and hazards stay readable.
- [x] Reduced motion/flash preserves sonar and warning truth.
- [ ] Exact artifacts, evidence, deployment, and independent review pass.

## Execution ledger

**Status:** Machine-complete; blocked only on independent exact-artifact review  
**Last verified:** 2026-08-23 21:30 PDT  
**Implementation scope:** `apps/showcase-deep-recovery/`, sub/sonar/oxygen/salvage source/assets, unit/browser/evidence surfaces, and this PRD  
**Authoritative evidence:** sonar/oxygen/salvage units; playable/scene browser specs; generated route-health/deploy; exact reviewed frames  
**Remaining blockers:** independent human review of the exact hash-bound artifact family is pending; it is intentionally not self-approved

### Requirement checklist

- [x] DR-01 Typed sub, wreck, standard/heavy crates, and buoy have current durable provenance and remain readable silhouettes.
- [x] DR-02 Descent, wreck approach, standard salvage, breach/repair, heavy salvage, ascent, surface/failure, and reset form a complete dive.
- [x] DR-03 Lamp, sonar, buoy, fog, particles, grapple line, objectives, and hazards preserve black-water tension without arbitrary navigation.
- [x] DR-04 Authored thrust/drag/buoyancy/oxygen and exact physics/query ownership are documented without simulation inflation.
- [x] DR-05 Sonar samples real world targets/filters/occlusion and world-space returns; DOM only mirrors contacts accessibly.
- [x] DR-06 Grapple/tow state, mass-dependent handling, buoy bank, oxygen/depth, breach/repair, blackout, surface, pause, and reset are deterministic.
- [x] DR-07 Typed ambient/sonar/hull/alarm/repair/grapple/bank/oxygen/blackout/surface audio and lighting are state-driven.
- [x] DR-08 Browser proves movement, sonar, grapple/tow/drop, breach, repair, bank, fail, surface/win, pause, reset, and touch.
- [x] DR-09 Descent, sonar, wreck, grapple, heavy tow, breach, low oxygen, surface, mobile, and reduced-mode artifacts pass machine review.
- [x] DR-10 README, route-health, performance, deploy, bounded claims, and accessibility pass.
- [ ] DR-11 Independent review approves the exact final desktop/mobile/reduced-motion artifact family before public promotion.

### Verification record

| Date | Requirement | Evidence | Result |
| --- | --- | --- | --- |
| 2026-08-23 | DR baseline | Current source/route-health plus sonar/oxygen/salvage/playable/scene suites located; README absent | In progress |
| 2026-08-23 | DR-01–DR-08 implementation and gameplay proof | `apps/showcase-deep-recovery/src/`; five original release-quality typed CC0 models; eleven candidate-quality typed CC0 audio cues; 20/20 focused units; 2/2 browser tests; full standard/heavy salvage mission with collision breach, explicit buoy repair, blackout, surface win, reset, keyboard/touch, pause, and reduced-motion truth | Pass |
| 2026-08-23 | DR-09 exact machine artifact family | `tests/reports/deep-recovery/playable/browser-evidence.json`; 11 source-, producer-, and artifact-hash-bound captures for descent, sonar, wreck, standard grapple, breach, heavy tow, low oxygen, surface completion, blackout, mobile touch, and reduced motion | Pass — independent verdict still pending |
| 2026-08-23 | DR-10 release/evidence gates | `apps/showcase-deep-recovery/README.md`; zero-warning five-model strict deploy; 0.002 ms route-logic CPU p95, deterministic state hash `ebc8fe50`, 81 draw calls at 1280×800; route-health machine pass; full 21-route route-primary sweep; root-safe claim and authored query ownership retained | Pass |
| 2026-08-23 | DR-11 independent exact-artifact review | Exact artifacts are bound and promotion remains `prototype-blocked` / `publicShowcase: false`; no independent verdict is recorded | Pending |
| 2026-08-23 | Portfolio route policy and launch classification | 28/28 route/manual-review policy tests; full retained route-primary sweep; launch entry `ok: true`, `staticGate.ok: true`, `routePrimaryProbe.ok: true`, `classificationOk: true`, `publicReleaseCounted: false`; sole Deep Recovery blocker is `visual-review:deep-recovery-independent-review-pending` | Pass |
