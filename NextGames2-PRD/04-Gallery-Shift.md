# Gallery Shift — Museum Heist Redesign PRD

**Route:** `apps/showcase-gallery-shift/`  
**Claim:** root-safe prototype with route-local stealth/perception; no reusable stealth, navigation, or AI kit claim

## Experience

Enter a modern museum after midnight, read patrol rhythm, move between real occluders, steal three exhibits across two floors, avoid cameras and lasers, then reach the exit. Good stealth should feel earned because visibility and sound are consistent, explainable, and spatially legible.

## Visual thesis

Quiet limestone galleries, black exterior void, warm exhibit pools, cold security light, red alarm only after escalation. The typed museum and exhibits establish scale and identity. The player/thief uses a distinct silhouette; guards carry narrow world-space attention cues; cameras and lasers have physical fixtures. Debug cones never appear in release frames.

## Mission arc

1. Lobby teaches cover, walking versus sneaking, and camera sweep.
2. First gallery introduces one guard and a forgiving exhibit lift.
3. Stair/second floor combines hearing, crossing patrols, and laser timing.
4. Third exhibit triggers a controlled alarm escalation and changes the return route.
5. Exit run resolves to clean win; detection produces a short caught state and fast restart.

## Perception contract

- Guard vision uses distance, field angle, and line-of-sight query against documented occluder layers/ignore filters.
- Hearing uses explicit movement/noise events and radius checks; sneaking reduces a measured radius rather than making the player magically silent.
- Cameras and lasers use distinct once-per-entry state transitions.
- Guard animation events may time footsteps or presentation when clip metadata exists; AI truth does not depend on guessed animation frames.
- Two floors need explicit navigation ownership. If patrol paths are authored, say authored; do not imply Recast/navmesh.

## Systems and proof

- Typed museum, displays, exhibits, fixtures, and character assets; primitives only for hidden collision/debug or set dressing.
- Unit: LOS occlusion, angle/range edge cases, hearing radii, patrol determinism, exhibit/laser once-only state, reset.
- Browser: walk/sneak, hide behind real occluder, camera/laser, exhibit collection, floor transition, caught, win, pause, reset.
- Acceptance captures: lobby, cover/guard, camera sweep, exhibit lift, stair crossing, alarm return, exit, caught, mobile.

## Definition of done

- [x] Detection outcomes match visible geometry and published perception parameters.
- [x] Player can complete the full two-floor route without relying on debug UI.
- [x] Exhibits visibly leave/transform and objective state updates exactly once.
- [x] Alarm changes scene, audio, and patrol pressure without strobing or hiding paths.
- [ ] Exact artifacts and evidence pass independent review before promotion.

## Execution ledger

**Status:** Machine-complete; blocked only on independent exact-artifact review  
**Last verified:** 2026-08-23 20:42 PDT  
**Implementation scope:** `apps/showcase-gallery-shift/`, perception/patrol/mission source/assets, unit/browser/evidence surfaces, and this PRD  
**Authoritative evidence:** vision/patrol units; playable/scene browser specs; generated route-health/deploy; exact reviewed frames  
**Remaining blockers:** independent human review of the exact hash-bound artifact family is pending; it is intentionally not self-approved

### Requirement checklist

- [x] GS-01 Typed museum, displays, exhibits, fixtures, thief, and guards have durable provenance and establish credible scale.
- [x] GS-02 Lobby, first gallery, stair/second floor, third-exhibit escalation, return route, exit, caught state, and reset form a complete mission.
- [x] GS-03 Limestone/warm-exhibit/cold-security/red-alarm composition preserves thief, guards, fixtures, cover, route, and exhibit readability.
- [x] GS-04 Guard vision deterministically combines range, field angle, and filtered LOS against real occluders.
- [x] GS-05 Hearing uses explicit movement/noise events and measured walk/sneak radii with deterministic patrol response.
- [x] GS-06 Cameras, lasers, exhibits, floor transitions, caught, and exit fire exact once-per-entry/state transitions.
- [x] GS-07 Guard footsteps/presentation use animation events only when typed clip metadata exists; the selected clips expose no footstep events, so a documented authored distance gait drives presentation while AI truth remains independent.
- [x] GS-08 Two-floor navigation ownership is documented as authored; no Recast/navmesh claim is made.
- [x] GS-09 Alarm changes scene/audio/patrol pressure without strobing, debug cones, or hidden paths.
- [x] GS-10 Browser proves walk, sneak, occlusion, camera, laser, exhibit, floor transition, caught, win, pause, reset, and touch.
- [x] GS-11 Lobby, cover, camera, exhibit, stairs, alarm, exit, caught, mobile, and reduced-mode artifacts pass machine review.
- [x] GS-12 README, route-health, performance, assets/audio, strict deploy, bounded claims, and accessibility pass.
- [ ] GS-13 Independent review approves the exact final desktop/mobile/reduced-motion artifact family before public promotion.

### Verification record

| Date | Requirement | Evidence | Result |
| --- | --- | --- | --- |
| 2026-08-23 | GS baseline | Current source/assets and vision/patrol/playable/scene suites located; README/route-health absent | In progress |
| 2026-08-23 | GS-01–GS-10 implementation and gameplay proof | `apps/showcase-gallery-shift/src/`; six original release-model probes plus release-proven thief/guard; eleven candidate-quality typed CC0 audio cues; 37/37 focused units; 3/3 browser tests; two-floor three-exhibit mission, public-physics LOS, authored hearing/patrols, third-lift alarm, caught/reset/win, keyboard/touch/pause | Pass |
| 2026-08-23 | GS-11 exact machine artifact family | `tests/reports/gallery-shift/browser-evidence.json`; 12 hash-bound artifacts covering lobby, cover, detection, caught, exhibit, stairs, camera, alarm, exit, mobile, and reduced motion; release frames contain no debug cones | Pass — independent verdict still pending |
| 2026-08-23 | GS-12 release/evidence gates | `apps/showcase-gallery-shift/README.md`; zero-warning six-model strict deploy; 0.003 ms route-logic CPU p95, deterministic state hash, 174 draw calls at 938×800; route-health machine pass; targeted route-primary pass; 44 px touch targets and keyboard/touch parity | Pass |
| 2026-08-23 | GS-13 independent exact-artifact review | Exact artifacts are bound and promotion remains `prototype-blocked` / `publicShowcase: false`; no independent verdict is recorded | Pending |
| 2026-08-23 | Portfolio route policy and launch classification | 31/31 route/manual/game-release policy tests; agent-doc and docs-codeblock checks; full retained route-primary sweep; launch entry `ok: true`, `staticGateOk: true`, `routePrimaryProbe.ok: true`, `classificationOk: true`, `publicReleaseCounted: false`; sole Gallery blocker is `visual-review:gallery-shift-independent-review-pending` | Pass |
