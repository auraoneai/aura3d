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
**Last verified:** 2026-08-23 12:35 PDT  
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

### Exact artifact submission set

The following SHA-256 values are generated and revalidated by
`apps/showcase-neon-swarm/scripts/write-route-health.mjs`; they are the exact
files awaiting independent review:

| Artifact | SHA-256 |
| --- | --- |
| `01-load.png` | `18c4fd63a6927c97c7a74f6e4f0df59034f80e7c08e38822fce61acbb26604ec` |
| `02-mid-wave.png` | `3386fdffb644c689b4ae7df1b9a2031ab64a7345b10d7a4003a150fe5defa693` |
| `03-instancing-swarm.png` | `4da68968a4a8e63fc4738056c01555fea5e6c65512f5c6f980207ff343ec532d` |
| `04-death.png` | `7f693d708acf75779bad73763d8c9004105fd9725fe4af25272bb8ca3e4a4e94` |
| `05-reset.png` | `84eb30fa4b93982787edd1060dbfca1d2555b3fc450049c5b1060f5642cb1cf1` |
| `06-finale-320.png` | `b790c9dcf17f36e1afc217dd50c6ce67ceafea6aa8f7358f384014c7ed56ad0b` |
| `07-complete.png` | `e9aff5aaa90d280945e25fc4ba00642e5c08253b36fcc665c96d6dd2b9ec558c` |
| `08-mobile-active.png` | `888e1f913510dd2f69dac77c463cb5926cc4f5c8205ce61d4c1ea99710a39505` |
| `09-reduced-finale.png` | `79719f9c083d147f0dff95313405bfe9e26a4729ce9d13edf5fee3bc03cab80f` |
| `10-burst-cascade.png` | `d16657a4abcc8473cbb415419b1350ebcc46851ed10f828c9f7b4a5004fa8d84` |
| `11-upgrade-choice.png` | `b84d37ddfb18516e8f54af3c75c30ec8f8ee5d90b6fa9474b3f50bf655a331e5` |
