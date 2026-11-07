# SplatSiblings — execution handover (2026-11-07)

Authoritative blueprint: [`SplatSiblings-PRD.md`](SplatSiblings-PRD.md) (same directory, committed).
This file records **where the build actually stopped**, what is verified, and what remains.
Every claim below was measured on disk on 2026-11-07; nothing here is a guess.

---

## 1. Why execution halted

**All game lanes died on `You've reached your credit usage limit. Please upgrade your subscription plan to get
more resources.`** — not on a task error and not on the earlier ~30-minute execution cap.

| Wave | Lanes | Outcome |
| --- | --- | --- |
| 1 | 5 lanes (read-first brief) | credit/cap death, **0 files written** |
| 2 | 5 lanes (write-first Speed Contract) | died mid-run, **left 1.2k–1.9k src lines per game** |
| 3 | 5 lanes (Resume Contract, after the user switched model) | died on the credit limit after 33–61 tool calls each, **left near-complete apps** |

Consequence: subagent launches will keep failing until credits are restored or the plan is upgraded. The
main-agent path (no subagents) is unaffected and can finish everything in §6 sequentially.

## 2. Worktree map — where each game lives

**All five games live in ONE worktree.** There is no per-game worktree; each game is a directory set inside it.

| Path | Branch / HEAD | Role |
| --- | --- | --- |
| `/Users/gurbakshchahal/platforms/aura3d-splat-siblings` | `games/splat-siblings` @ `fb64c2cdf` (based on `ef4c44ab4`, which contains v5.0.3 = `f73a2bfaf`) | **THE execution worktree.** Kit + PRD committed here; all five games' code is here, **untracked** |
| `/Users/gurbakshchahal/platforms/aura3d` | detached `c0158f2fa` (5.0.2-era) | Main checkout. Contains Splat Rush and the shared registry. **Must stay untouched** by this effort |
| `/Users/gurbakshchahal/platforms/aura3d-splat-siblings-briefs` | not a repo | Lane operating brief `game-lane.md` (Speed + Resume contracts, ownership rules, Phase-A battery) |
| `/Users/gurbakshchahal/platforms/aura3d-fix501/tests/reports/release-503` | `release/5.0.3` @ `f73a2bfaf` | Reference for the shipped 5.0.3 tree (read-only) |

Per-game locations inside the execution worktree (all still **untracked** — `git status` shows five `??` dirs):

| Game (slug) | App | Unit tests | Browser spec | Evidence |
| --- | --- | --- | --- | --- |
| Shape Shift Sprint (`shape-shift-sprint`) | `apps/showcase-shape-shift-sprint/` | `tests/unit/shape-shift-sprint/` (**absent**) | **absent** | **absent** |
| Number Surge (`number-surge`) | `apps/showcase-number-surge/` | `tests/unit/number-surge/` (5 files) | **absent** | `evidence/number-surge/README.md` |
| Splat Turf (`splat-turf`) | `apps/showcase-splat-turf/` | `tests/unit/splat-turf/` (7 files) | `tests/browser/splat-turf.spec.ts` | `evidence/splat-turf/README.md` |
| Polarity Orbs (`polarity-orbs`) | `apps/showcase-polarity-orbs/` | `tests/unit/polarity-orbs/` (**absent**) | **absent** | `evidence/polarity-orbs/README.md` |
| Beat Hopper (`beat-hopper`) | `apps/showcase-beat-hopper/` | `tests/unit/beat-hopper/` (1 file) | **absent** | `evidence/beat-hopper/README.md` |

**Data-loss warning:** no lane ran `git add`/`git commit` (by design — the parent commits). Roughly 7,000 lines of
untracked work sit in the execution worktree. Do **not** run `git clean -fd`, `git reset --hard`, or
`git checkout .` there. First action after resuming should be committing the current state as a WIP checkpoint.

## 3. Work-package scoreboard (frozen 8-WP denominator)

| WP | Scope | State |
| --- | --- | --- |
| WP-1 | Shared runner kit `examples/shared/runner-kit/` | **DONE, committed** (`fb64c2cdf`) — 40/40 kit tests green, Splat's 122 tests green, eslint clean, root typecheck 0 errors |
| WP-2 | Shape Shift Sprint | ~85% by files — app complete, **zero tests**, no gates run |
| WP-3 | Number Surge | ~90% — app complete, 5/7 test files, 30/33 tests pass, **no browser spec**, no gates run |
| WP-4 | Splat Turf | ~95% — app complete incl. browser spec, 43/46 tests pass, **no gates run** |
| WP-5 | Polarity Orbs | ~75% — app complete (world.ts finished in wave 3), **zero tests** |
| WP-6 | Beat Hopper | ~75% — app complete, 13/15 tests pass, **2 typecheck errors**, 6 test files missing |
| WP-7 | Registration + integration (catalog, generators, liveGameCount 30) | **NOT STARTED** |
| WP-8 | Phase B remote evidence + deploy | **NOT STARTED** (user-gated by design) |

Program-wide: **1 of 8 WPs done** (12.5%); the five games average roughly 84% by file count and 0% by
fully-green gates.

## 4. Verified vs unverified (do not confuse these)

Verified by the parent on 2026-11-07:

- `node_modules/.bin/vitest run tests/unit/shared-runner-kit` → **40/40 pass** (WP-1, committed).
- Per-app `pnpm --dir apps/showcase-<slug> typecheck`: **pass** for shape-shift-sprint, number-surge, splat-turf,
  polarity-orbs; **fail** for beat-hopper (2 errors, §5.5).
- Scoped vitest: number-surge 30/33, splat-turf 43/46, beat-hopper 13/15 (failure names in §5).

**Never run** for any game: eslint, `pnpm --dir apps/showcase-<slug> build`,
`node apps/showcase-<slug>/scripts/write-route-health.mjs` (so **no `route-health.json` exists for any of the
five**), `node tools/game-checks/run.mjs <slug>`, root `pnpm typecheck`, `check-site.mjs`, `check-route-health.mjs`.
Nothing in this slate is shippable-quality verified yet; no `playable` claim is earned.

## 5. Per-game state and the exact remaining work

### 5.1 Shape Shift Sprint — `shape-shift-sprint`
Present: `package.json` (5.0.3, ports 5198/4198), `tsconfig.json`, `vite.config.ts`, `index.html`,
`aura.assets.json`, `scripts/write-route-health.mjs`, `public/aura-assets/{GT-Walsheim-Bold.woff2,PROVENANCE.md}`,
`src/{sim,world,presentation,meshes,hud,look,fx,audio,autopilot,aura-assets,main}.ts`, `src/art/direction.ts`.
Typecheck clean.
Missing: `README.md`, `evidence/shape-shift-sprint/README.md`, **all** PRD §4.2 unit tests (sim, meshes, motion,
hud-contrast, shaders-compile, audio, art-direction), `tests/browser/shape-shift-sprint.spec.ts`,
`route-health.json`, and every Phase-A gate.

### 5.2 Number Surge — `number-surge`
Present: full app incl. `README.md`, `evidence/number-surge/README.md`, 5 test files. Typecheck clean.
Failing tests (all in `tests/unit/number-surge/sim.test.ts`, group "scoring, walls, death, restart"):
1. `autopilot scores, smashes walls and persists the biggest smash in state`
2. `wall HP follows 40 + 30·wallsPassed + floor(rng·20)`
3. `C4: begin re-centres steering target AND drag state`

These are the PRD §3.3 core mechanics, so the **sim is wrong, not the tests** — check HP formula, smash
settlement (`number −= HP`, `score += HP·10·mult`, `biggestSmash` persistence) and C4 begin-state re-centring.
Missing: `tests/unit/number-surge/{audio,art-direction}.test.ts`, `tests/browser/number-surge.spec.ts`,
`route-health.json`, remaining gates.

### 5.3 Splat Turf — `splat-turf`
Furthest along: full app, `README.md`, evidence README, 7 unit tests, browser spec written. Typecheck clean.
Also carries an extra generated file, `src/art/direction.audit.json` (art-direction audit output — harmless, keep
or regenerate).
Failing tests:
1. `tests/unit/splat-turf/meshes.test.ts` › `finish gate: two 10-segment posts + bar = 116 verts, 6.4 m span`
2. `tests/unit/splat-turf/sim.test.ts` › `double replay produces identical traces (integers exact, floats within 1e-9)`
   — determinism break; hunt for `Math.random` or a shared-RNG leak between gameplay and presentation streams
3. `tests/unit/splat-turf/sim.test.ts` › `eraser bot: -15 tank and wipes the last 15 m of trail`
   (asserts at `sim.test.ts:98-100`: `o.combo === 0`, `o.paintedCells <= o.passedCells − …`)
Missing: `route-health.json`, remaining gates.

### 5.4 Polarity Orbs — `polarity-orbs`
Present: full app incl. `src/world.ts` (finished in wave 3), `src/art/direction.ts`, `main.ts`, assets, scripts,
`README.md`, evidence README. Typecheck clean.
Missing: **all** PRD §4.2 unit tests, `tests/browser/polarity-orbs.spec.ts`, `route-health.json`, every gate.
Priority coverage per PRD §3.5: tap-flip input rule (`pointerup` with `|dx| < 8px`, Space/Enter), polarity
mismatch → −life + 0.85 shrink, collect radius 1.2, row mix 70% mixed / 30% uniform-opposite, rainbow 5s /
shield / x2 7s / magnet 6s at radius 3.5, determinism double-replay.

### 5.5 Beat Hopper — `beat-hopper`
Present: full app incl. `src/world.ts`, `src/art/direction.ts`, `README.md`, evidence README, 1 test file.
**Typecheck fails** — `apps/showcase-beat-hopper/src/aura-assets.ts:9` `TS2741: Property '"gtWalsheimBold"' is
missing in type 'AuraAssetMap<Record<string, AuraAssetDefinition>>' but required in type
'AuraAssetMap<AuraGeneratedAssetDefinitions>'`, and `:11` `TS2322: Type '"font"' is not assignable to type
'AuraAssetType'`. Fix by matching the real generated-asset shape (compare `apps/showcase-cross-hop` and
`apps/showcase-polarity-orbs`, which typecheck clean) — most likely the font belongs in `aura.assets.json` with a
supported asset type, not as a hand-declared `"font"` entry.
Failing tests (`tests/unit/beat-hopper/sim.test.ts`):
1. `combo multiplier: mult = 1 + floor(combo/4) capped at 5, points use the new mult`
2. `phrase schedule: beat grid, min 1-beat spacing, hop→hop ≥2 beats, density ramps 2→1, speed +1 per phrase`
   (assert at `sim.test.ts:283` requires consecutive-phrase beat deltas)
Per PRD §3.6, `sim` beatIndex must drive music and 132 BPM timing — do not use wall-clock.
Missing: 6 unit-test files (meshes, motion, hud-contrast, shaders-compile, audio, art-direction),
`tests/browser/beat-hopper.spec.ts`, `route-health.json`, remaining gates.

## 5bis. Exact failure evidence (full scoped run, 2026-11-07: **126 passed / 8 failed** of 134 tests in 18 files)

| # | Test | Assert | Expected → actual | Where to look |
| --- | --- | --- | --- | --- |
| 1 | `beat-hopper/sim.test.ts:220` combo multiplier | `o.score` | `3600` (= 60·(4+8+12+16+20)) → **4340** | PRD §3.6: points must use the **new** multiplier after combo increments, and PERFECT=60 / GOOD=30 — 4340 means some hits scored at the old mult or a mixed window |
| 2 | `beat-hopper/sim.test.ts:282` phrase schedule | `b - lastLocal` at index 0 | `2` → **14** | First-obstacle beat offset / phrase start; check `speed +1 per 8-bar phrase` isn't shifting the grid before the first spawn |
| 3 | `number-surge/sim.test.ts:133` autopilot run | `o.score > 0` | `> 0` → **0** (also `wallsSmashed >= 1`, `biggestSmash >= 40`) | Autopilot never matches gates, or match scoring is unreachable — §3.3 gate window 1.6 and combo scoring |
| 4 | `number-surge/sim.test.ts:197` wall HP formula | `hps.length >= 2` | `>= 2` → **0** | Walls spawn every 400 m; the loop breaks at `passed >= 3` without ever recording HP → wall creation or `wallsPassed` bookkeeping |
| 5 | `number-surge/sim.test.ts:216` C4 restart | `o.distance` | `0` → **16.063** | `begin()` resets `number`/`score` but **not `distance`** (§3.1 C4: re-centre steering AND drag AND reset run state) |
| 6 | `splat-turf/meshes.test.ts:95` finish gate span | `extent(m, 0)` | `[-3.2, 3.2]` → **[-3.2141, 3.2141]** | Posts sit at ±3.2 with their own radius added; place posts at ±(3.2 − postRadius) or rebuild so the outer span is exactly 6.4 m |
| 7 | `splat-turf/sim.test.ts:27` replay determinism | `a.trace.length` | `20 + script.length` → **901 vs 921** | Two replays of the same seed/inputs diverge (or terminate early) — the classic culprits are `Math.random`, presentation RNG bleeding into gameplay, or step-order drift |
| 8 | `splat-turf/sim.test.ts:98` eraser bot | `o.eraserHits` | `1` → **0** | §3.4: 3 eraser bots, −15 tank and wipe last 15 m — bots aren't spawning in range or the hit test never fires by row 21 |

## 6. Ordered plan for whoever picks this up

1. **Checkpoint the tree.** In `/Users/gurbakshchahal/platforms/aura3d-splat-siblings`:
   `git add apps examples/shared tests evidence docs/prds/splat-siblings && git commit -m "splat-siblings: WIP wave-3 lane output"`.
   (No push, no deploy.)
2. **Fix the three failing games' sims** (§5.2–§5.3, §5.5) and Beat Hopper's `aura-assets.ts` typecheck, then
   re-run scoped vitest per slug. Max 2 targeted fix attempts per failure; if a failure is structural, report it
   rather than widening scope.
3. **Write the missing tests**: shape-shift-sprint (all 7 + browser spec), polarity-orbs (all 7 + browser spec),
   beat-hopper (6 + browser spec), number-surge (audio + art-direction + browser spec).
   Patterns: `tests/unit/splat-rush-port/*`, `tests/unit/shared-runner-kit/*`, `tests/browser/splat-rush-port.spec.ts`.
   Browser specs are **written, never run locally** (Phase B is remote-runner only).
4. **Run the full Phase-A battery per game** (all five gates, from the worktree root):
   ```bash
   pnpm --dir apps/showcase-<slug> typecheck
   pnpm exec eslint apps/showcase-<slug> tests/unit/<slug> tests/browser/<slug>.spec.ts
   node_modules/.bin/vitest run tests/unit/<slug> --reporter=dot
   pnpm --dir apps/showcase-<slug> build
   node apps/showcase-<slug>/scripts/write-route-health.mjs
   node tools/game-checks/run.mjs <slug>
   ```
   0 errors required; phase-2 game-checks screens/capture warnings are allowed until WP-8. Commit each game when green.
5. **WP-7 registration** (parent-owned, in the execution worktree): `tools/site/games.catalog.json` (5 entries),
   `marketing/scripts/build-showcase-routes.mjs` `showcaseRoutes`, `apps/showcase-index/src/main.ts` app entries,
   `docs/games/game-names.md`, `marketing/scripts/gen-seo.mjs`, `tests/visual-qa.routes.json`,
   `game-luma-targets.ts`, `real-gpu/scenarios.json`, hand-typed counts; run `gen-game-inventory.mjs`
   (liveGameCount 25 → **30**), `gen-showcase-index.mjs`, `gen-seo.mjs`; then `node tools/game-checks/run.mjs --all`,
   `node marketing/scripts/check-site.mjs`, `node scripts/check-route-health.mjs`, root typecheck 0 new errors.
   Facts for the registry: ports 5198–5202 dev / 4198–4202 preview; QA keys `shape-shift`, `number-surge`,
   `splat-turf`, `polarity-orbs`, `beat-hopper` → `__AURA_SHAPE_SHIFT__`, `__AURA_NUMBER_SURGE__`,
   `__AURA_SPLAT_TURF__`, `__AURA_POLARITY_ORBS__`, `__AURA_BEAT_HOPPER__`; genres platformer (shape-shift-sprint,
   number-surge, beat-hopper) / arcade (splat-turf, polarity-orbs); classification `prototype`, claimStatus
   `bounded`, verification `playable` only once Phase A is green.
6. **WP-8 Phase B** — remote ACR specs, screenshots, filmstrip previews, evidence writes, `check-deploy`,
   sibling-distinctness judge. Only on explicit user request. Cloudflare Pages is the canonical host (never Vercel).

## 7. Copy-paste handover prompt

Paste this into a fresh agent session (works without subagents; replace "you" scope per §6 step if splitting):

```text
Continue the SplatSiblings build.

Read, in this order, before touching code:
1. /Users/gurbakshchahal/platforms/aura3d-splat-siblings/docs/prds/splat-siblings/HANDOVER.md  (current state, measured)
2. /Users/gurbakshchahal/platforms/aura3d-splat-siblings/docs/prds/splat-siblings/SplatSiblings-PRD.md  (binding spec: §3.1 common sim contract, §3.2-§3.6 per game, §4.2 file set, §7 Phase A gates, §8 guardrails)
3. /Users/gurbakshchahal/platforms/aura3d-splat-siblings-briefs/game-lane.md  (Speed + Resume contracts, ownership, gate battery)
4. /Users/gurbakshchahal/platforms/aura3d-splat-siblings/examples/shared/runner-kit/README.md  (the kit, already green: 40/40)

Work only in the worktree /Users/gurbakshchahal/platforms/aura3d-splat-siblings (branch games/splat-siblings,
HEAD fb64c2cdf + untracked wave-3 output). WARNING: after every shell call the cwd resets to
/Users/gurbakshchahal/platforms/aura3d, a different checkout — prefix every command with
`cd /Users/gurbakshchahal/platforms/aura3d-splat-siblings && `. Never run git clean/reset/checkout . in the worktree:
about 7,000 lines of untracked game code live there.

First action: commit the current wave-3 output as a WIP checkpoint (no push).

Then execute HANDOVER.md §6 in order: fix beat-hopper's src/aura-assets.ts typecheck (2 errors, TS2741/TS2322);
fix the failing sims in number-surge (wall HP formula, smash/biggestSmash, C4 begin re-centre), splat-turf
(replay determinism, eraser-bot −15/wipe, finish-gate mesh verts) and beat-hopper (combo multiplier cap, phrase
beat-grid schedule); write the missing test files for shape-shift-sprint, polarity-orbs, number-surge and
beat-hopper (browser specs written, never run locally); then run all six Phase-A gates per game and report each
command with its real numbers. Only after Phase A is green: WP-7 registration (HANDOVER.md §6 step 5,
liveGameCount 25 → 30) and its site gates. Stop before WP-8 — remote evidence, deploys and pushes need the user's
explicit request.

Hard rules: no edits to packages/**, examples/splat-rush-port/**, or the kit (report kit gaps instead); no new
dependencies; no Meshy spend; no local Playwright/Docker/heavy builds (remote runner only); no trademarked game
names in public copy; never describe Aura3D as built on three.js; max 2 targeted fix attempts per failure, then
report honestly instead of disabling checks or skipping tests (the glslangValidator skip pattern is the only
sanctioned skip). Subagent lanes previously died on a credit usage limit — if agent launches fail, do the work
directly in this session, one game at a time in the order above.
```

## 8. Operational lessons (so the next wave doesn't repeat them)

- Lane briefs must be **write-first**: wave 1 read everything and wrote nothing. Keep the Speed Contract in
  `game-lane.md` binding, and give every relaunched lane the exact per-game missing-file manifest from §5.
- Subagent output files are JSONL transcripts — never `cat`/`tail` them from the parent; wait for the completion
  notification, then verify the **diff on disk** instead.
- Lanes never commit (parent verifies and commits), which is why the tree is untracked and fragile today.
- Credit limits surface as "failed" with a one-line summary; they say nothing about how much work landed —
  measure the disk, as §4–§5 do.
