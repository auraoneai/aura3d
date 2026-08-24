# Pulse Tunnel — Synesthetic Sprint Redesign PRD

**Route:** `apps/showcase-pulse-tunnel/`  
**Claim:** abstract root-safe prototype; `beat` mode only when measured, otherwise honest deterministic `pattern` mode

## Experience

Read a musical obstacle phrase, switch lanes, jump, slide, and graze danger through a 90-second tunnel arrangement. Rhythm organizes anticipation and payoff; it must never be claimed more accurately than the measured clock contract proves.

## Visual thesis

Four sections use distinct disciplined palettes: cyan intro, violet build, hot magenta drop, white/gold finale. Tunnel structure remains dark and thin; obstacles are solid readable silhouettes with a half-beat telegraph. Player lane, incoming gate, and safe opening dominate. Bloom and fog pulse gently around geometry rather than becoming the geometry.

## Run arc

- Intro teaches lane changes on quarter phrases.
- Build introduces jump/slide and first graze.
- Drop combines lane and height patterns, raises stem density, and risks shield loss.
- Finale alternates learned motifs at maximum readable speed.
- Three shield hits end the run; completion reports score, graze chain, sync mode, and measured drift.

## Clock contract

- Audio-context time drives scheduling only after a target-browser spike establishes tolerance.
- Drift is sampled and published; repeated breach flips to `pattern` mode without breaking play.
- Pattern mode uses the same authored chart against a deterministic game clock and is not described as beat-accurate.
- Pause/resume realigns clocks and stems through a tested policy; no silent timer drift.

## Proof and quality gates

- Unit: chart determinism, buffered inputs, graze window, shield rules, drift transition.
- Browser: lane/jump/slide avoid and collide, graze, section change, pause, fail, restart, sync fallback.
- Acceptance captures: telegraph, lane switch, jump, graze, drop, shield break, finale, result, mobile.

## Definition of done

- [x] Sync spike records measured browsers and tolerance; claims match its result.
- [x] `syncMode` and drift evidence come from clocks, not HUD text.
- [x] Obstacle silhouettes remain readable before arrival in every section.
- [x] Reduced motion/flash preserves telegraph timing and collision truth.
- [x] All stems/cues are typed and registered.
- [ ] Independent review approves exact artifacts before promotion.

## Execution ledger

**Status:** Machine-complete; independent exact-artifact review pending  
**Last verified:** 2026-08-23 14:55 PDT  
**Implementation scope:** `apps/showcase-pulse-tunnel/`, Pulse unit/browser/evidence surfaces, generated artifacts, and this PRD  
**Authoritative evidence:** 22 clock/chart/player/style units; four current browser scenarios; source-bound playable/mobile/completion/sync receipts; typed CC0 stems/cues; route health; performance report; exact release deploy; hash-bound acceptance artifacts  
**Remaining blockers:** independent human review of the exact final artifacts; no machine-side requirement remains

### Requirement checklist

- [x] PT-01 Target-browser clock spike records measured drift/tolerance and selects honest `beat` or deterministic `pattern` mode.
- [x] PT-02 Cyan, violet, magenta, and gold sections preserve player lane, telegraphed obstacle, and safe opening readability.
- [x] PT-03 Intro, build, drop, finale, shield failure, completion, score, graze, and reset form a complete 90-second arc.
- [x] PT-04 Clock/chart scheduling, repeated-drift fallback, pause/resume realignment, and sync telemetry are deterministic and tested.
- [x] PT-05 Lane, jump, slide, buffered input, graze, style decay, shield/invulnerability, section, fail, and reset rules are proven.
- [x] PT-06 Typed registered stems/cues and renderer tunnel/effects follow actual section/obstacle/gameplay state.
- [x] PT-07 Browser proves avoid/collide for lane/jump/slide, graze, section, pause, fail, restart, and fallback on keyboard/touch.
- [x] PT-08 Telegraph, lane, jump, graze, drop, shield break, finale, result, mobile, and reduced-mode artifacts pass.
- [ ] PT-09 Route-health, performance, typed audio, deploy, clock-bounded claims, accessibility, and independent review pass.

### Verification record

| Date | Requirement | Evidence | Result |
| --- | --- | --- | --- |
| 2026-08-23 | PT baseline | Current app/route-health plus clock, playable, and sync suites located; mode not inherited as proven | In progress |
| 2026-08-23 | PT-01, PT-04 | `tests/reports/pulse-tunnel/sync-report.json`; HeadlessChrome 151 measured 119.13/116.87/120.50 ms against 80 ms and naturally flipped at 2.888 s with continuity | Pass — `NO-GO-BROWSER-PROFILE`; pattern-mode claim retained |
| 2026-08-23 | PT-03, PT-05, PT-07 | `pnpm exec vitest run tests/unit/apps/pulse-tunnel-clock.test.ts` (22/22); playable browser suite plus sync suite (4/4) | Pass |
| 2026-08-23 | PT-02, PT-08 | `tests/reports/pulse-tunnel/` exact load, lane, jump, graze, drop, shield, finale, failure, completion/reduced, and mobile artifacts; hashes in `route-health.json` | Pass — agent inspected current pixels; independent verdict remains open |
| 2026-08-23 | PT-06 | `pnpm --dir apps/showcase-pulse-tunnel register:audio`; manifest and generated type map; `route-health.json` validates 4 stems + 9 cues as candidate CC0-1.0 typed live references | Pass |
| 2026-08-23 | PT-09 machine scope | App typecheck/build; `performance-report.json` (0.0006 ms p95, 119/600 draw calls); `route-health.json` machinePass; exact `check-deploy --release --source ... --no-assets` (0 failures/warnings) | Pass — independent review component remains open |
| 2026-08-23 | Exact evidence binding | Route source `33ccfb5f30d07a70cc4289b1d950d300d72d6b105d46acae32d097bcc52a4bf2`; playable/mobile/completion/sync receipt SHA-256 `fed9c544...`, `bddf3da5...`, `69e2ce0c...`, `7f372203...` | Pass |
