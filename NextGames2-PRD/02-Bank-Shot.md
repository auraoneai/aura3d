# Bank Shot — After-Hours Pool Hall Redesign PRD

**Route:** `apps/showcase-bank-shot/`  
**Claim:** root-safe prototype with route-local three-rack rules; physics ownership described exactly

## Experience

Clear three escalating arcade racks beneath a single pool-hall lamp. Read the table, aim with a prediction guide, set power, strike, then watch every ball settle before the rules score pocket, rail, foul, combo, and rack outcome. The game should feel deliberate and tactile, not like sixteen marbles on a rectangle.

## Visual thesis

Deep green cloth, walnut rail, brass lamp, ivory cue ball, accurately distinguishable object balls, dark smoky room. Camera is a stable high three-quarter view; aim mode tightens enough to read cue contact and intended pocket while retaining the whole tactical table. Pocket mouths, cushions, cue, and all balls remain unobscured.

## Rack arc

1. Open rack teaches legal strike, pocket, scratch, and settle lock.
2. Combo rack rewards consecutive declared/eligible pockets under a timer.
3. Eight-ball rack adds ordered end condition and final pressure.

Input is disabled while balls are materially moving. Aim prediction is bounded and honest; it should not promise multi-collision certainty. Contact, cushion, pocket, scratch, foul, combo, rack clear/fail, and eight-ball win have distinct restrained audio/scene response.

## Systems and proof

- Typed table, cue, and individual balls; deterministic rack placement and full-reset hashes.
- Rapier/public physics path owns actual ball contact where used; route rules consume settled outcomes.
- Sensor/region pocket truth is once-per-entry; rules prevent double score.
- Unit: rack determinism, legal/foul logic, scoring/combo, eight-ball ordering, reset.
- Browser: aim/power/strike, settle lock, pocket, cushion, scratch, rack clear/fail, pause, reset.

## Acceptance frames

Attract rack, aim line, cue contact, multi-ball motion, pocket drop, scratch/foul, eight-ball finish, mobile aim. Ball colors/numbers or equivalent identities must remain accessible through more than hue alone.

## Definition of done

- [ ] Table scale, ball contact, pocket entry, and cue alignment are visually credible. *(Machine evidence passes; independent exact-artifact review remains required.)*
- [x] No next shot can begin before the settled-state contract permits it.
- [x] All three racks are completable and their rule differences are clear.
- [x] Reduced motion preserves trajectory/contact information.
- [ ] Exact artifacts, evidence, deploy, and independent review pass before promotion.

## Execution ledger

**Status:** Machine-complete; promotion blocked pending independent exact-artifact review  
**Last verified:** 2026-08-23 16:55 PDT  
**Implementation scope:** `apps/showcase-bank-shot/`, billiards source/assets, Bank Shot unit/browser/evidence surfaces, and this PRD  
**Authoritative evidence:** determinism/rules units; playable/shot-visual browser specs; generated route-health/deploy; exact reviewed frames  
**Remaining blockers:** independent human review of the exact hash-bound desktop/mobile artifact set is pending; the route remains `prototype-blocked` and is not a public showcase card

### Requirement checklist

- [x] BS-01 Typed table, cue, and individually identifiable balls have current durable provenance and credible scale/contact/alignment.
- [x] BS-02 Green-cloth/walnut/brass composition keeps whole tactical table, pockets, cushions, cue, and all balls readable.
- [x] BS-03 Open, combo, and eight-ball racks have distinct complete rules, timers/order, outcomes, and full reset.
- [x] BS-04 Aim/power prediction is bounded, honest, and visibly connected to actual first-flight state.
- [x] BS-05 Physics owns actual ball contacts used; pocket truth fires once; settled-state lock prevents early/double shots and score.
- [x] BS-06 Legal/foul, cushion, pocket, scratch, combo, rack clear/fail, and eight-ball win are deterministic and state-driven.
- [x] BS-07 Typed registered audio/scene feedback distinguishes contact and outcome without hiding ball motion.
- [x] BS-08 Browser proves aim, power, strike, settle lock, pocket, cushion, scratch, all rack outcomes, pause, reset, and touch.
- [x] BS-09 Attract, aim, cue contact, motion, pocket, foul, eight-ball finish, mobile, and reduced-mode artifacts pass.
- [ ] BS-10 README, generated route-health, performance, deploy, bounded claims, accessibility, and independent review pass.

### Verification record

| Date | Requirement | Evidence | Result |
| --- | --- | --- | --- |
| 2026-08-23 | BS baseline | Current source/assets and determinism/rules/playable/shot suites located; README/route-health absent | In progress |
| 2026-08-23 | BS-01, BS-07 | `aura.assets.json`; `src/aura-assets.ts`; 18 current hash-bound root-renderer probes; `pnpm --dir apps/showcase-bank-shot register:assets`; strict deploy report | Pass — 18 original CC0 typed models are release-graded with zero deploy warnings; ten typed synthesized audio cues retain durable CC0 provenance |
| 2026-08-23 | BS-02, BS-04, BS-09 | `tests/reports/bank-shot/browser-evidence.json`; 12 exact PNGs plus `visual.json`; `tests/reports/showcase-route-primary-probes/showcase-bank-shot.json` | Pass — whole table and six pockets remain visible on desktop/mobile; runtime-bound table isolation scores 100 readability with no clipping/UI occlusion; aim/contact/motion/outcome/reduced artifacts are source/hash bound |
| 2026-08-23 | BS-03, BS-05, BS-06 | `pnpm exec vitest run tests/unit/apps/bank-shot-determinism.test.ts tests/unit/apps/bank-shot-rules.test.ts` | Pass — 27/27 tests cover deterministic racks, scatter/settle, bounded spin, legal/foul/eight ordering, reset hash, physical pocket gaps, and once-per-entry sensors |
| 2026-08-23 | BS-08 | `pnpm exec playwright test tests/browser/bank-shot-playable.spec.ts tests/browser/bank-shot-shot-visual.spec.ts` | Pass — 3/3 browser tests prove keyboard/touch aim and strike, public-Rapier motion, settle lock, second shot, pocket/foul/rack-fail/session-clear outcomes, pause/resume, and full reset |
| 2026-08-23 | BS-10 machine gates | `pnpm --dir apps/showcase-bank-shot typecheck`; `build`; `evidence:performance`; `evidence:deploy`; `write:route-health`; docs checks; 20/20 route-gate tests; `docs/project/showcase-launch-evidence.json` | Machine pass — 5.061 ms simulation CPU p95 under 5.5 ms, 162 draw calls under 220, 34 bodies under 40, 18-model deploy clean, route health `machinePass: true`, launch route `ok: true` |
| 2026-08-23 | BS-10 independent review | Exact artifact hashes in `apps/showcase-bank-shot/route-health.json`; route gate blocker `visual-review:bank-shot-independent-review-pending` | Pending — not self-approved; route remains `prototype-blocked`, `publicShowcase: false` |
