# Aurora Lander — Whiteout Descent Redesign PRD

**Route:** `apps/showcase-aurora-lander/`  
**Claim:** root-safe prototype; route-local authored lander flight with precisely named physics/query ownership

## Experience

Bring a fragile probe through gusts and whiteout to three polar research pads. Manage vertical speed, lateral drift, fuel, hull, and orientation. A landing is satisfying because the player can read the approach, correct it, and understand exactly why contact was soft, hard, or fatal.

## Visual thesis

Dark indigo sky, cold snow planes, green-violet aurora ribbons, warm pad beacons, white probe with amber RCS. The lander and pad must remain higher-contrast than the aurora. Camera is a restrained three-quarter chase with terrain look-ahead; no horizon roll. Snow/jet particles indicate force and wind but cannot obscure the pad.

## Mission arc

- Site One teaches vertical speed on a wide pad.
- Site Two adds lateral gusts and uneven approach terrain.
- Site Three introduces fuel pressure, narrow pad, and strongest whiteout.
- Soft landing awards integrity/fuel bonus; hard landing damages hull; crash ends run; all sites clear produces extraction tableau.

## Systems

- Typed probe and pad beacon assets; terrain/world assets or explicitly abstract generated terrain with honest labeling.
- Authored thrust, rotation, fuel, and gust model; public queries/surface evidence for ground/pad contact where used.
- Prediction marker shows a bounded landing estimate and changes with real velocity/thrust state.
- Audio separates engine/RCS, wind/ambient, warning, contact, and UI.
- Ghost descent may replay the best path visually after a completed site, never affecting contact.

## Proof and quality gates

- Unit tests pin touchdown classification, fuel/hull math, gust seeds, reset, and optional ghost hash.
- Browser proof covers thrust, rotate, soft/hard/crash, pad progression, pause, and reset.
- Acceptance captures: approach, gust correction, pad lock, soft contact, crash, final extraction, mobile.
- Route-health names simulation approximations, terrain/query path, typed assets, particle role, and visual-review status.

## Definition of done

- [x] Contact outcomes correspond to visible vertical/lateral/orientation state.
- [x] Lander and pad remain readable through the strongest accepted whiteout.
- [x] Three sites create increasing but completable difficulty.
- [x] Reduced motion removes camera impulse, not essential force/contact feedback.
- [ ] Exact artifact set passes independent visual and deployment review.

## Execution ledger

**Status:** Machine-complete; independent exact-artifact review pending  
**Last verified:** 2026-08-23 11:20 PDT  
**Implementation scope:** `apps/showcase-aurora-lander/`; `tests/unit/apps/aurora-lander-*`; `tests/browser/aurora-lander-*`; `tests/reports/aurora-lander-*`; Aurora route/asset/release probes; route registry/index metadata; documentation and this PRD  
**Authoritative evidence:** 25 focused unit assertions; 8 focused browser scenarios; hash-bound campaign/contact artifacts; passing performance and route-health reports; release asset probes; full 12-route primary sweep; successful Aurora build, deploy, classification, and launch entry  
**Remaining blockers:** Independent human review must approve the exact submitted artifact hashes before AL-09, the final Definition of Done item, promotion, and document completion can be checked

### Requirement checklist

- [x] AL-01 Typed probe/pad/world assets and precisely labeled authored thrust, rotation, fuel, gust, and contact/query ownership are current.
- [x] AL-02 Three sites teach vertical speed, add lateral/terrain pressure, then combine fuel/narrow-pad/whiteout mastery.
- [x] AL-03 Lander, pad, terrain, velocity/orientation state, and prediction remain readable through strongest accepted whiteout.
- [x] AL-04 Touchdown classification, fuel/hull, gust seeds, progression, crash, extraction, and reset are deterministic.
- [x] AL-05 Bounded landing prediction changes with real state and does not overclaim certainty.
- [x] AL-06 Typed engine/RCS/wind/warning/contact/UI audio and force/weather particles are actual-state-driven.
- [x] AL-07 Browser proves thrust, rotation, soft/hard/crash, progression, pause, reset, and promised touch control.
- [x] AL-08 Approach, gust, pad lock, soft contact, crash, extraction, mobile, and reduced-mode artifacts pass.
- [ ] AL-09 Performance, route-health, assets, deploy, bounded claims, accessibility, and independent review pass.

### Verification record

| Date | Requirement | Evidence | Result |
| --- | --- | --- | --- |
| 2026-08-23 | AL baseline | Current app/route-health plus touchdown, ghost, playable, and terrain suites located | In progress |
| 2026-08-23 | AL-01, AL-06 | `aura.assets.json`; `src/aura-assets.ts`; release probes for `auroraLanderProbe` (`bff8e15b…`) and `auroraPadBeacon` (`c94a5b6b…`); ten typed audio hashes; `lander-audio.ts`; scoped `check-deploy --release` | Pass |
| 2026-08-23 | AL-02, AL-04, AL-05 | `pnpm exec vitest run tests/unit/apps/aurora-lander-ghost.test.ts tests/unit/apps/aurora-lander-touchdown.test.ts --reporter=dot` — 25/25; playthrough softly completes Sites 1–3 with 79.52%, 76.85%, and 74.64% fuel remaining | Pass |
| 2026-08-23 | AL-03, AL-06, AL-07 | `tests/browser/aurora-lander-campaign.spec.ts`, `aurora-lander-playable.spec.ts`, and `aurora-lander-terrain.spec.ts` — 8/8; strongest whiteout records density 0.62, 45 renderer nodes, typed audio playback, and bounded prediction | Pass |
| 2026-08-23 | AL-03, AL-08 | Exact PNG SHA-256: approach `50b26736…`; gust `c631ab9a…`; strongest whiteout `7f3f9cbb…`; extraction `f91ea326…`; hard contact `466452c3…`; mobile `c8b899e0…`; reduced motion `a6f1747d…`; crash `524dfe7f…`; soft/pad lock `3c4bc404…` | Machine artifact checks pass; independent review pending |
| 2026-08-23 | AL-01, AL-03, AL-09 machine gates | `performance-report.json` (`pass: true`, fixed-step p95 0.0004 ms, prediction p95 0.0895 ms, terrain p95 2.3214 ms, whiteout 53/60 draw calls); `route-health.json` (`machinePass: true`) | Pass |
| 2026-08-23 | AL-01, AL-03, AL-09 machine gates | Full `showcase-route-primary-probes.spec.ts` — 12/12 routes, summary pass; final documentation-bound Aurora probe `21cec91d…`, 264×430 subject, readability 69, unclipped/unoccluded, both typed assets present, retained/current source and health hashes equal | Pass |
| 2026-08-23 | AL-09 machine gates | Aurora `typecheck`, Vite build, scoped release deploy, route classification, static gate, and `tests/reports/showcase-library-build-deploy.json` route entry all pass; only Aurora diagnostic is `visual-review:aurora-lander-independent-review-pending` | Pass with external-review blocker retained |
| 2026-08-23 | Final DoD, AL-09 | Exact hash-bound artifact set submitted for independent human visual/deployment review; no approval verdict is present | Pending |
