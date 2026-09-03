# Neon Swarm — Vector Panic Redesign PRD

**Route:** `apps/showcase-neon-swarm/`  
**Claim:** explicitly abstract root-safe prototype using native instancing and route-local seeded steering

## Experience

Survive escalating waves of hundreds of drones by carving space, collecting risky upgrades, and timing a burst that turns encirclement into a score cascade. The scene must read at a glance: player, safe direction, swarm pressure, pickup, and burst radius.

## Visual thesis

Near-black tactical floor with sparse grid landmarks. Player is a bright white/cyan core with a unique silhouette; enemies are magenta with value variation by role; pickups are gold and shape-distinct; danger zones are red-orange. Effects are thin vectors, arcs, and particles—not opaque bloom clouds. Top-down camera is stable with slight speed lead and no decorative roll.

## Run arc

1. Teach motion and orbiting enemy flow with a small wave.
2. Add two enemy roles and first upgrade choice.
3. Compress the arena and increase steering pressure.
4. Trigger elite wave plus score opportunity.
5. Survive finale or lose all shields; show seed, score, max combo, and restart.

## Systems

- One or few `instances.*` pools hold 300+ enemy transforms; no one-node-per-drone architecture.
- Seeded route-local steering separates seek, separation, orbit, flee, and elite behavior.
- Collision/collection state is deterministic and spatially partitioned; render transforms mirror truth.
- Burst, graze, collection, damage, combo break, and wave clear own distinct renderer effects/audio.
- Upgrades change gameplay parameters and visible player/swarm behavior, not just HUD numbers.

## Proof and quality gates

- Unit tests pin seed determinism, steering invariants, spawn safety, upgrade math, and score/combo.
- Browser test proves movement, pickup, burst, damage, wave transition, fail, pause, and reset.
- Evidence reports live/pooled instance counts, draw behavior, frame budget, seed, and outcome.
- Acceptance captures: opening, encirclement, burst cascade, elite wave, upgrade choice, failure, mobile.

## Definition of done

- [x] Player remains findable within one glance at maximum swarm density.
- [x] 300+ live enemies are renderer-instanced and performance evidence is current.
- [x] Same seed/input fixture produces the same outcome hash.
- [x] Effects never erase enemy, pickup, or arena-boundary readability.
- [x] Reduced motion/flash and touch play retain all game truth.
- [ ] Independent review approves exact artifacts before gallery promotion.

## Execution ledger

**Status:** Machine-complete; independent exact-artifact review pending  
**Last verified:** 2026-09-02 18:43 PDT
**Implementation scope:** `apps/showcase-neon-swarm/`, Swarm unit/browser/evidence surfaces, generated artifacts, and this PRD  
**Authoritative evidence:** steering/seed units; instancing/playable browser specs; performance/route/deploy evidence; exact reviewed frames  
**Remaining blockers:** Independent human review must approve the exact submitted artifact hashes before NS-09, the final Definition of Done item, promotion, and document completion can be checked

### Requirement checklist

- [x] NS-01 Opening and maximum-density frames make player, safe direction, swarm, pickup, and burst radius immediately readable.
- [x] NS-02 Abstract palette and shape language distinguish player, enemy roles, pickups, danger, and boundaries without bloom clouds.
- [x] NS-03 Opening, upgrade, compression, elite, finale, failure, score, and reset form the promised run arc.
- [x] NS-04 At least 300 live enemies use bounded native instance pools rather than per-enemy scene nodes.
- [x] NS-05 Seeded steering, spawn safety, collision, collection, upgrades, score, and combo produce deterministic outcome hashes.
- [x] NS-06 Burst, graze, collect, damage, combo break, and wave clear trigger distinct renderer/audio feedback from actual events.
- [x] NS-07 Browser evidence proves movement, pickup, burst, damage, waves, upgrades, fail, pause, and reset on keyboard/touch.
- [x] NS-08 Opening, encirclement, burst, elite, upgrade, failure, mobile, and reduced-mode artifacts pass.
- [ ] NS-09 Instance/draw/frame budgets, route-health, abstract claims, deploy, accessibility, and independent review pass.

### Verification record

| Date | Requirement | Evidence | Result |
| --- | --- | --- | --- |
| 2026-08-23 | NS baseline | Current app/route-health plus steering, instancing, and playable suites located | In progress |
| 2026-08-23 | NS-03, NS-05, NS-07 | `pnpm exec vitest run tests/unit/apps/neon-swarm-steering.test.ts` passed 15/15; units pin five authored waves, five stages/insets, schedule determinism, spawn safety, risky-pickup sensors, upgrade clamps, terminal hashing, steering/bounds, elite telegraph/burst, graze/radial overlap, and pool capacity | Pass |
| 2026-08-23 | NS-03, NS-05, NS-06, NS-07 | `pnpm exec playwright test tests/browser/neon-swarm-playable.spec.ts tests/browser/neon-swarm-instancing.spec.ts --config playwright.config.ts` passed 6/6. Source-tree-bound reports retain real movement, spatial pickup, 6→5 contact damage, kill/combo, graze, radial burst, combo break, wave clear, upgrade, pause, failure/reset, five stages, touch, and reduced-mode truth; pickup/damage/graze/burst/combo-break/wave-clear cues are each observed from the corresponding actual event | Pass |
| 2026-08-23 | NS-03, NS-05 | `tests/reports/neon-swarm/campaign-completion.json` retains five schedule checksums, a real 320-live finale, completion, and two matching terminal hashes `fnv1a32-fc06659d` for seed `20260821` | Pass |
| 2026-08-23 | NS-04, NS-09 machine subset | `pnpm --dir apps/showcase-neon-swarm evidence:performance` passed: 320 staged/browser instances, 59 draws, 352 native instanced submissions, 686,529 non-black pixels, route-local simulation p95 `0.4694 ms`/max `1.4064 ms`; no GPU-frame-time parity claim | Pass |
| 2026-08-23 | Assets/audio/claims | Three CC-BY-4.0 typed release models retain durable source pages/download URLs, hash-bound rendered probes, orientation/normalization evidence, and exact release-deploy admission; thirteen deterministic CC0 cues retain current hashes and typed `createGameAudio` proof. README, route-health, showcase index metadata, and classification use the bounded root-safe prototype label and explicit abstract-drone/Recast/production disclaimers | Pass |
| 2026-08-23 | NS-01, NS-02, NS-08 | Exact-frame inspection confirms white/cyan typed courier plus aim/radius grammar, magenta grunt/red-pink elite separation, gold spatial pickup, red-orange compressed boundary, restrained transparent effects, visible 320-density courier/pickup, legible upgrade/failure/completion states, non-overlapping mobile controls, and reduced-mode truth. This agent inspection is not independent approval | Pass (machine/agent visual audit only) |
| 2026-08-23 | Route composition | Full `showcase-route-primary-probes.spec.ts` sweep passed 13/13. Neon isolated typed-courier probe passed with no failures: 210×225 px, unclipped, readability 66, screenshot `sha256-e4ca24015577224e98554e58f2874601b87dd18bacddc323a56caf45b69363da` | Pass |
| 2026-08-23 | Build/deploy/route health | App typecheck and build pass; exact release `check-deploy` passes with zero failures/warnings for courier, barricade, and lamp; `route-health.json` records `machinePass: true`, `prototype-blocked`, `publicShowcase: false`, and only `visual-review:neon-swarm-independent-review-pending`. Shared `build-and-check.mjs` remains globally red for unrelated public candidates/Blockfall, while the Neon row passes static, route-primary, build, deploy, and classification gates | Pass for Neon; unrelated portfolio failures retained |
| 2026-08-23 | Repository/docs gates | `pnpm typecheck`, `pnpm check:agent-docs`, and `pnpm check:docs-codeblocks` pass after the final Neon source/test/doc changes | Pass |
| 2026-08-23 | NS-09 / final DoD | Exact artifact set below is hash-bound and machine/agent reviewed, but no independent human verdict exists; route remains `prototype-blocked` and absent from the public card slate | Pending independent review |
| 2026-09-02 | Structural/readability correction and NS-04/NS-06/NS-09 machine gates | Removed the unreachable full-city dressing branch that exceeded the route's declared primitive budget; retained the compact authored lane, typed courier, carbine/muzzle attachment, separated deterministic swarm fixture, and renderer-owned hit/burst feedback. `pnpm --dir apps/showcase-neon-swarm typecheck`, `pnpm exec vitest run tests/unit/apps/neon-swarm-steering.test.ts --reporter=dot`, and the focused Neon playable/instancing browser producer passed (16/16 units, 6/6 browser). Named performance evidence passes with 320 staged/browser instances, 50 draws, 322 native instanced submissions, 0.8227 ms simulation p95, and 989,166 non-black pixels; named route-health and release check-deploy pass with source primitive count 36/40. | Pass for current machine/agent structural audit; independent exact-artifact review remains the only blocker |

### Exact artifact submission set

The following SHA-256 values are generated and revalidated by
`apps/showcase-neon-swarm/scripts/write-route-health.mjs`; they are the exact
files awaiting independent review:

| Artifact | SHA-256 |
| --- | --- |
| `01-load.png` | `c328b85be16c0344fdc6f3079dacaf03c8ab828d166d4e229c5ad1f4b61635be` |
| `02-mid-wave.png` | `07560ce16269200534685b9b027fe6c99b66c88f9f9d4abcb0f64729486a9e03` |
| `03-instancing-swarm.png` | `17c95fe648f3c01d172fa2ea0a8e2f145b9a2c31f71b7eacaad5fd2db4eeaf28` |
| `04-death.png` | `99e2cb05df3af83dc7225d2e4a8adeaf6a8b642249d80a1335537962de3e071a` |
| `05-reset.png` | `35b9f1b9ba3143d8b32691a4a31a61086fe2b19edfa19778c573d0aacbbd87b5` |
| `06-finale-320.png` | `b5737fa4b1f5dbb37d2e57f20a8112f8ea90a5513b5bf54af44eddab4455d6b7` |
| `07-complete.png` | `afcb7f4b8c748c8e95eafe5359bb6f5e9c5f7f932163ae06f7d019b423667b60` |
| `08-mobile-active.png` | `e4c8007fa77f420ce31f5ddc016c722e638d0b39e1770041de19b294c95c5fdb` |
| `09-reduced-finale.png` | `bbca95e49bf0a15954cf9e6548d71d33ca668b158ea3ae7a206bd8a23e6bf263` |
| `10-burst-cascade.png` | `0a71976bf0bc12e8c5c27dc875bd3d24139e17e83befec038a1fb22a23386c39` |
| `11-upgrade-choice.png` | `d857bfae51b727bc568445c704d4489c3e521250c58ca09d2dc2ca5d0e73810c` |
