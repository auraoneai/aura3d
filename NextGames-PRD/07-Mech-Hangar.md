# Mech Hangar — Build, Prove, Fight Redesign PRD

**Route:** `apps/showcase-mech-hangar/`  
**Claim:** root-safe prototype; typed asset assembly and route-local combat, not a reusable mech/fighting kit

## Experience

Build a mech whose visible parts change its real stats, inspect the provenance of every part, lock the assembly, then prove the build in a short arena duel. The hangar is not a skin selector and the arena is not a reduced Aura Clash clone.

## Visual thesis

Hangar: cold industrial shell, warm inspection lamps, centered turntable, uncluttered part silhouette, provenance passport beside—not over—the model. Arena: brutalist pit with high value separation, limited sparks/dust, and camera margins sized for heavy machines. Part families use silhouette first, color second.

## Product flow

1. Select chassis, legs, arms, weapon, and optional utility from at least four validated choices per required slot.
2. Each swap visibly changes model pixels, named stat bars, and an understandable tradeoff.
3. Validation rejects missing/incompatible plans before lock-in.
4. Arena bout tests move, light/heavy, guard, power special, guard break, KO, and rematch.
5. Rematches cycle seeded rival aggression while the player build persists in-page.

## Asset gate

Do not fake compatibility. The curation report must establish durable license/source metadata, scale range, socket/placement strategy, silhouette difference, and successful runtime rendering for the full part matrix. If the gate fails, reduce the design explicitly or stop; do not hide primitive replacements under a game claim.

## Systems and proof

- CLI-registered typed parts plus validated assembly plans; visual swap and stat truth share one selected-part state.
- Route-local deterministic combat and seeded `createCombatAi` role parameters.
- Named animation clips only when typed metadata proves them; otherwise use honest authored runtime motion.
- Unit: validation, stats, incompatibilities, damage/guard/power, AI outcome hashes.
- Browser: every slot swap, anti-skin-swap pixel delta, invalid rejection, lock-in, full bout, aggression difference, reset.

## Definition of done

- [x] Curation gate proves the complete licensed, compatible, visually distinct part set.
- [x] Every selection materially changes rendered assembly and the documented stat result.
- [x] Invalid plans never enter the arena.
- [x] Build differences measurably alter combat outcomes under pinned fixtures.
- [ ] Hangar and arena each have approved desktop/mobile/reduced-motion frame sets.
- [x] Provenance is visible accessibly and matches the manifest.
- [ ] Exact artifacts pass independent review; route remains prototype until then.

## Execution ledger

**Status:** Machine-complete; independent exact-artifact review pending  
**Last verified:** 2026-08-23 15:49 PDT  
**Implementation scope:** `apps/showcase-mech-hangar/`; root typed asset manifest/map and generated MH-2M models/audio; Mech unit/browser/probe evidence; showcase route gate/index integration; deploy, performance, route-health, and exact artifact generators; this PRD  
**Authoritative evidence:** `apps/showcase-mech-hangar/parts-curation-report.json`, `performance-report.json`, `deploy-report.json`, and `route-health.json`; 16 release asset probes; 16-selection matrix and source-bound browser receipts under `tests/reports/mech-hangar/`; route-primary probe; focused unit/browser/build/docs commands below  
**Remaining blockers:** independent human approval of the exact hash-bound desktop, mobile, mechanic, and reduced-motion artifact set; route remains `prototype-blocked` and absent from the public showcase until that external verdict

### Requirement checklist

- [x] MH-01 Curation proves the full licensed, durable-source, scale/socket-compatible, visually distinct required part matrix.
- [x] MH-02 Hangar composition makes the assembly silhouette, turntable, stat tradeoffs, and matching provenance passport readable.
- [x] MH-03 Every chassis/legs/arms/weapon/utility selection visibly changes rendered pixels and its documented gameplay stats.
- [x] MH-04 Missing/incompatible plans are rejected before lock-in and no primitive/cosmetic-only substitution bypasses the gate.
- [x] MH-05 Arena movement, light/heavy, guard, power special, guard break, KO, rematch, and back-to-hangar flow are complete.
- [x] MH-06 Build stats measurably alter combat outcomes and seeded rival aggression roles are distinct/deterministic.
- [x] MH-07 Animation claims use typed clip metadata or honest authored runtime motion.
- [x] MH-08 Typed registered hangar/combat audio and sparks/dust/camera feedback are actual-event-driven and reduced-mode safe.
- [x] MH-09 Browser proves every slot, anti-skin-swap pixel delta, rejection, lock-in, full bout, AI difference, pause, and reset.
- [x] MH-10 Hangar, part swap, passport, arena, hit, KO, mobile, and reduced-mode artifacts pass.
- [ ] MH-11 Route-health, performance, assets/provenance, deploy, prototype claims, accessibility, and independent review pass.

### Verification record

| Date | Requirement | Evidence | Result |
| --- | --- | --- | --- |
| 2026-08-23 | MH baseline | Current app/route-health plus assembly/combat and build/arena suites located; curation gate requires fresh audit | In progress |
| 2026-08-23 | MH-01, MH-03, MH-04 | `parts-curation-report.json`; `tests/reports/mech-hangar/part-matrix.json`; `pnpm exec vitest run tests/unit/apps/mech-hangar-assembly.test.ts tests/unit/apps/mech-hangar-combat.test.ts tests/unit/tools/showcase-route-gates.test.ts` | Pass — deterministic original CC0 MH-2M family is 16/16 compatible, 16/16 release-proven, and 16/16 hash-unique; all 16 exposed required-slot selections have distinct assembly hashes and owning stat deltas; invalid/missing typed plans are rejected; 45/45 focused tests passed |
| 2026-08-23 | MH-02, MH-05, MH-08, MH-09, MH-10 | `pnpm exec playwright test tests/browser/mech-hangar-build.spec.ts tests/browser/mech-hangar-arena.spec.ts --reporter=line`; four source-bound receipts and 13 PNG states under `tests/reports/mech-hangar/` | Pass — 5/5 browser scenarios proved selection, rejection, lock-in, combat arc, AI difference, pause/reset, keyboard/touch, mobile, and reduced motion; exact machine artifact hashes are retained by route health |
| 2026-08-23 | MH-06, MH-07 | Focused 25-test assembly/combat suite; `performance-report.json`; route source/README claim audit | Pass — pinned stat builds and aggression roles produce deterministic distinct outcomes; route claims only authored runtime motion and route-local combat |
| 2026-08-23 | MH-01, MH-11 machine gates | `showcase-release-asset-probes.spec.ts`; 16 hash-bound probe JSON/PNG pairs; `evidence:deploy`; `evidence:route-health`; targeted `showcase-route-primary-probes.spec.ts` | Pass — strict 16-model release and dist/source deploy checks have zero warnings/failures; performance passes at 0.0014 ms simulation p95 and 42 hangar draw calls; route-primary rendered probe passes; route health is `machinePass: true` |
| 2026-08-23 | Repository integration | Mech app typecheck/build; `showcase-route-gates.test.ts`; `pnpm check:agent-docs`; `pnpm check:docs-codeblocks`; `pnpm check:docs-site`; `git diff --check` | Pass — app typecheck/build, 20/20 route-gate tests, 4/4 docs-site browser tests, all docs generators, and whitespace validation passed |
| 2026-08-23 | Independent-review portions of frame-set DoD and MH-11 | Exact artifacts and hashes listed in `apps/showcase-mech-hangar/route-health.json`; route gate blocker `visual-review:mech-hangar-independent-review-pending` | Pending — no self-approval; route remains `prototype-blocked`, `publicShowcase: false` |
