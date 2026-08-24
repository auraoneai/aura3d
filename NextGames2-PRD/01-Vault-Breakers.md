# Vault Breakers — Art-Deco Pinball Redesign PRD

**Route:** `apps/showcase-vault-breakers/`  
**Claim:** root-safe prototype; route-local pinball systems on the public physics surface; preserve documented motor workaround until fixed upstream

## Experience

Crack a bank vault by mastering a compact physical table. Charge the plunger, snap two flippers, bank five target stands, survive drains and tilt, open the door, then control multiball. The table should read like premium hardware with a mission, not loose primitives scattered under neon.

## Visual thesis

Black lacquer, brushed brass, burgundy lane accents, cool white ball, green bank lights. Camera is a stable elevated table view with modest event pushes; the lower flipper gap, active ball, target bank, ramps, and vault door are always visible. Lighting follows mission state: closed vault is cool and guarded, target completion warms the door, multiball releases gold-white energy.

## Table flow

- Plunger lane teaches charge/release and feeds a safe opening orbit.
- Bumpers and slings build multiplier without hiding the ball.
- Five-bank target mission visibly advances on the table and accessible HUD.
- Vault opening changes world geometry/presentation and releases multiball.
- Three balls, nudge/tilt discipline, clear drain state, final score, fast reset.

## Physical and authored boundary

- Rapier owns ball/bat bodies, contacts, joints, and sensors used by the route.
- Motorized flippers keep the documented same-sign mirrored-axis workaround and spike evidence until adapter behavior changes.
- Slope component, nudge, bumper/slingshot kicks, door swing, auto-plunge, and drain catch remain explicitly authored arcade logic.
- No ball-spin, angular-ball, production-rendering, or reusable pinball-kit claims.

## Proof and acceptance

- Unit pins flipper response, limits, deterministic serve/reset, scoring, sensors, tilt, banks, and multiball.
- Browser proves both flippers, plunger charge, nudge/tilt, target progression, drain, vault opening, multiball, pause, reset.
- Captures: attract table, charged plunge, flipper contact, bank near-complete, vault opening, multiball, tilt, game over, mobile.

## Definition of done

- [x] Ball remains visually trackable in every machine-verified state and camera response.
- [x] Flippers hold/launch under pinned loads without violating the workaround contract.
- [x] Mission state is visible in-world and mirrored accessibly.
- [x] All typed models/audio and generated route evidence are current.
- [ ] Exact desktop/mobile artifacts pass independent review before index promotion.

## Execution ledger

**Status:** Machine-complete; blocked only on independent exact-artifact review  
**Last verified:** 2026-08-23 19:38 PDT  
**Implementation scope:** `apps/showcase-vault-breakers/`, flipper/table/scoring sources, unit/browser/evidence artifacts, and this PRD  
**Authoritative evidence:** flipper spike; table/scoring units; playable/table-visual browser specs; route/deploy/review artifacts  
**Remaining blockers:** independent human review of the exact final desktop/mobile artifact family; public promotion remains prohibited until that verdict is recorded

### Requirement checklist

- [x] VB-01 Elevated table composition keeps lower gap, ball, flippers, banks, ramps, and typed vault visible and trackable.
- [x] VB-02 Art-deco values and renderer-owned mission feedback distinguish guarded, target-progress, vault-open, multiball, tilt, and game-over states without relying on color alone.
- [x] VB-03 Rapier owns bodies/contacts/joints/sensors and the documented same-sign mirrored-axis workaround remains pinned.
- [x] VB-04 Slope, nudge, kicks, door, auto-plunge, and drain catch remain explicitly authored with no spin/mechanism inflation.
- [x] VB-05 Plunger, both flippers, bumpers/slings, five-bank mission, vault opening, multiball, three balls, drain, tilt, pause, and reset work.
- [x] VB-06 Flipper response/limits/load, deterministic serve/reset, scoring, sensor, bank, tilt, and multiball units pass.
- [x] VB-07 In-world mission/score state and typed registered audio are actual-event-driven and mirrored accessibly.
- [x] VB-08 Browser proves every core interaction and complete mission/outcome on keyboard/touch.
- [x] VB-09 Attract, plunge, contact, bank, vault, multiball, tilt, game-over, mobile, and reduced-mode artifacts pass.
- [x] VB-10 Performance, route-health, five release-model probes, eleven typed audio cues, warning-free strict deploy, bounded prototype claims, route-primary, and launch classification pass.
- [ ] VB-11 Independent human review approves the exact final artifacts before index promotion.

### Verification record

| Date | Requirement | Evidence | Result |
| --- | --- | --- | --- |
| 2026-08-23 | VB baseline | Current README/route-health, spike, unit, and browser suites located | In progress |
| 2026-08-23 | VB-01–VB-09 implementation and exact machine artifacts | `apps/showcase-vault-breakers/src/`; `tests/reports/vault-breakers/browser-evidence.json` (`df9ce371…`); `tests/reports/vault-breakers/playable/browser-evidence.json` (`3d3ec92c…`); 20/20 focused units; 4/4 browser tests; desktop/mobile/reduced-motion state family | Pass |
| 2026-08-23 | VB-02/VB-07 world-state legibility | Typed mechanism overlay plus renderer-owned guarded/progress/vault/multiball/tilt/game-over beacon; text/HUD redundancy; exact bank, vault, multiball, tilt, and game-over captures | Pass — machine visual inspection only; not an independent approval |
| 2026-08-23 | VB-03/VB-04/VB-06 physical boundary and regressions | `tests/unit/apps/vault-breakers-flipper-spike.test.ts`; scoring/table suites; repeated-session body reuse regression; source claim boundary | Pass — 20/20 |
| 2026-08-23 | VB-10 asset/deploy/performance/route gates | Five hash-bound release-model probes; eleven candidate-quality typed CC0 audio cues; `deploy-report.json` (`ce83040d…`, zero warnings); `performance-report.json` (`3aaaff53…`, 0.646 ms fixed-step p95, 114 draw calls); `route-health.json` (`62c2c972…`); current full-sweep route-primary evidence | Pass |
| 2026-08-23 | VB-10 portfolio launch classification | `tests/reports/showcase-library-build-deploy.json`: Vault `ok=true`, static/route-primary/build/classification pass, `prototype-blocked`, not public-release-counted | Pass for Vault; portfolio command remains red only because four unrelated public routes have stale independent-review records |
| 2026-08-23 | VB-11 independent final review | No independent verdict was supplied or self-authored | Pending — sole Vault blocker |
