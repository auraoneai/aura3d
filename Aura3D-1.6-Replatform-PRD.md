# Aura3D 1.6 Re-platform PRD

*Formerly `CleanUp16-PRD.md`. Renamed in revision 4: this is not cleanup. It is the
architecture, product and platform-strategy blueprint governing a multi-month re-platform,
and it is intended to govern 1.7 and beyond.*

**Status:** binding. Revision 4 — adds the product philosophy (§A), the architecture lock
(R11), single ownership (R12), and success metrics that include deletion and developer
friction (§B). Revision 3 added seventeen execution-safety conditions; revision 2 added
twelve approval conditions.
Supersedes `GameEngine-PRD.md`, `resetprompt.md`, `gameenginefinishprompt.md`,
`shipprompt.md`, `anotherprompt.md` for all prioritisation decisions.
**Created:** 2026-08-05 against `main` @ `be86c73e` (66 commits past `v1.5.2`, tree clean).
**Findings source:** `Aura3D-1.6-Architecture-Decision.md`.
**Target version: DEFERRED — `1.6.0` vs `2.0.0` decided after the migration matrix exists (§12).**

---

## A. Product philosophy — read before any workstream

### The North Star

> **If a developer can already solve a problem better with the existing Three.js ecosystem,
> Aura3D should not reimplement that solution unless doing so creates clear, measurable
> developer value.**

This sentence governs every architecture decision in 1.6 and after. When a workstream and
this sentence disagree, this sentence wins and the workstream gets rewritten.

### The one-line strategy

> **Aura3D owns only the layers that create lasting competitive advantage over Three.js.
> Everything else is integrated, abstracted, or removed.**

### What Aura3D IS

A direct Three.js competitor at the rendering and 3D-development layer, plus an integrated
developer platform above it:

- renderer (WebGL2 + WebGPU), scene graph, geometry, materials, shaders, lighting, shadows,
  textures, animation rendering, postprocess, GPU resource management
- typed scene authoring and the public agent API
- asset intelligence: catalogue, provenance, hashes, bounds, role admission, semantic metadata
- CLI-driven typed asset workflows and deterministic project generation
- diagnostics, replay, runtime invariants, interaction auditing
- a migration path for Three.js developers

### What Aura3D is NOT

Aura3D is **not**:

- a physics engine
- an audio DSP library
- an ECS research framework
- a behaviour-tree / GOAP / HTN AI framework
- a cloth simulator
- a fluid simulator
- a fracture or soft-body simulator
- a video encoding or publishing framework
- a general-purpose state-management library
- a navmesh generation library

**Aura3D integrates those capabilities. Aura3D owns the developer experience above them.**

Every item on that list exists in this repository today as a hand-written implementation.
That is the drift this document exists to reverse. If a future workstream proposes building
any of them, it is wrong by default and must clear R11 first.

**Two qualifications, both forced by evidence rather than preference.** This list states what
Aura3D should not *build*; it does not authorise deleting what Aura3D has already *published*:

1. **"Not a" means "does not build speculative subsystems," not "must delete on sight."**
   Three items here survived their deletion workstreams because R8 and R1 refused: the audio
   DSP (WS-3.2), `packages/ecs`, and `packages/scripting` (WS-3.3). ECS and behaviour authoring
   ship as **public `./ecs` and `./scripting` subpaths**, are re-exported on the public engine
   barrel, have a live `apps/editor` consumer, and carry eight production-path browser
   assertions. Removing them would break documented API and invalidate satisfied R1 claims.
   They are retained as **game-kit-layer authoring above the renderer**, which is a different
   thing from competing with Rapier or Yuka at the solver layer.
2. **The prohibition binds new work, enforced by R11.** The cost of the original drift is not
   avoided by deleting proven code; it is paid as permanent maintenance of subsystems no ADR
   ever justified. That is the argument for R11, and the reason retention here is not a licence
   to add more.

Where this list and shipped public API disagree, the disagreement is recorded in an ADR under
`docs/architecture/adr/` — not resolved by a deletion that R8 forbids.

### What "Three.js parity" means here

Parity is **production parity, not API parity.** Chasing API-surface equivalence produced
several of the defects in this repo — declared features that do not shade, exports with no
consumer, rows marked parity because a symbol resolved.

> **Parity means a developer can ship the same production application with similar visual
> quality, similar runtime behaviour, similar extensibility, and similar performance,
> without losing capabilities.**

A parity row may not be claimed on the existence of a matching function name. It is claimed
on a production-path test (R1) demonstrating the shipped behaviour.

---

## B. Release success metrics — 1.6 is judged on these, not on workstream completion

### B.1 The release-defining condition

> **1.6 succeeds only if renderer parity improves AND developer bundle size approaches
> Three.js.**

Both. Not either. Today the bundle is arguably the single largest adoption blocker: a
developer downloads **579,953 B gzip to draw a cube** (7.25x our own 80 KB budget), and
**1,145,689 B against Three.js's 671,968 B on the same scene — 1.70x**. A release that fixes
anisotropy and ships a 580 KB core has not succeeded. Bundle size is a first-class KPI, not
a workstream side effect.

- [ ] Scenario-1 (core primitive scene) gzip ≤ **1.25x** the equivalent Three.js stack
      — **FAILS: 257,074 B vs 119,296 B = 2.155x** (measured 2026-08-07). Better than the
      7.25x the PRD recorded, and still 1.7x over budget.
- [ ] Scenario-2 (product viewer) gzip ≤ **1.25x** equivalent
      — **FAILS: 258,168 B vs 146,680 B = 1.760x.**
- [ ] Scenario-3 (game runtime) gzip ≤ **1.5x** equivalent
      — **FAILS: 294,620 B vs 143,669 B = 2.051x.**
- [x] Ratios measured by WS-2.4's canonical config against a real Three.js build, reported
      side by side. If a ratio is missed, the release does not ship on that dimension —
      **do not raise the budget** (R2)
      — measured, reported side by side, budgets **not** raised. All three fail, so **1.6 does
      not ship on the bundle dimension**, and §B.1's "both, not either" means the release
      condition is unmet regardless of renderer progress. `developer-value.test.ts` asserts
      each budget still holds its original value, because raising one is the most likely way
      this gate gets defeated.

### B.2 Developer friction — measured, beside performance

Aura3D wins by making developers faster. That must be measured, not asserted.

- [ ] **Minutes from `npm install` to first rendered cube** — timed on a clean machine
      profile, scripted, recorded
      — reported `unmeasured` **with a reason**, not fabricated: it needs a clean machine
      profile and a real registry install, and producing it from a warm monorepo would be the
      exact defect class R1 exists to stop. Measure during release rehearsal or leave unproven.
- [x] **Authored lines of code** for each of the three WS-2.4 scenarios vs the Three.js
      equivalent. Baseline already measured from
      `external-parity-threejs-visual-parity/gap-report.md`: product configurator 15 vs 74,
      asset review 10 vs 68, interior 7 vs 54, orbit 7 vs 48
      — scenarios: **9 vs 15 · 13 vs 27 · 19 vs 40**. Blanks and comments excluded, because the
      Aura3D entries carry long explanatory headers that would otherwise count as developer
      effort in Aura3D's favour.
- [x] **Number of imports** a developer must write per scenario — **1 vs 1 · 1 vs 4 · 1 vs 2**.
- [x] **Number of dependencies** a developer must install per scenario — **1 vs 1 · 1 vs 1 ·
      1 vs 2**. Scenarios 1-2 tie, and that is stated rather than spun: Three.js ships loaders
      and controls as subpaths of `three`, so the cost lands in the import count, not the
      install count. Scenario 3 is the real difference — a game runtime needs `three` plus
      `cannon-es`.
- [x] **TypeScript compile time** for a scaffolded project — `tsc --noEmit` per entry:
      **826 vs 689 ms · 902 vs 939 ms · 977 vs 847 ms**. Aura3D is *slower* on two of three;
      recorded as measured.
- [ ] **Runtime startup time** to first frame — reported `unmeasured` with a reason: it needs
      a browser, and real per-route `readyTimeMs` for all 35 Tier 1/2 routes already exists in
      `tests/browser/tier12-route-health.spec.ts`. A headless approximation would be a weaker
      second number competing with a real one.
- [x] **Proof:** committed `tests/reports/developer-friction.json` with every field measured
      for both Aura3D and the Three.js equivalent — committed, with the two unmeasurable
      fields declared rather than filled in.

### B.3 Negative complexity — deletion is a success metric

1.6 must **shrink**. Every phase reports what disappeared. A phase that only adds code has
not done this document's job.

**Baseline, measured 2026-08-05 at `be86c73e`:**

| Metric | Baseline |
|---|---:|
| `packages/*/src` lines | 212,810 |
| Packages | 27 |
| Root `exports` subpaths | 39 |
| External runtime dependencies | 3 (`cannon-es`, `@loaders.gl/core`, `@loaders.gl/textures`) |
| Exports in the engine barrel | 361 |
| Duplicate-ownership violations (R12) | 5 |
| `apps/` + `examples/` routes | 149 |

- [x] Each phase reports: lines deleted · packages removed · dependencies removed ·
      duplicate APIs removed · entry points removed — `tools/negative-complexity/index.ts` reports
      every baseline row with its delta on each run.
- [ ] **Release condition: total `packages/*/src` lines are lower at 1.6 than at
      `be86c73e`**, net of additions. — **NOT MET: 201,296 vs 200,929, delta +367.**

      Measured breakdown, because "+367" alone invites the wrong fix. By package:
      `rendering` **−902**, `physics` +421, `engine` +804, `three-compat` +24, `audio` +20.
      Splitting the physics+engine diff by line kind: **code +692 / −487 = net +205**, and
      **comment or blank +1,048 / −28 = net +1,020**.

      So the growth is overwhelmingly the recorded reasoning for each engine defect — the
      cylinder-capsule contact geometry, the rotation-ignoring query path, the
      `solverIterations` default against cannon's own, the joint no-op, the deleted second
      solver. Deleting those comments would satisfy this metric today and cost the next
      person the measurements. **Not doing that**, and recording the number as missed rather
      than gaming it (R2, R6: line counts are observations, not targets).

      The honest way to meet this condition is deletion that R8 currently refuses
      (`packages/ecs`, `packages/scripting` — ADR 0001; `examples/data-galaxy` — 370 retained
      references) or the physics/vehicle consolidation that ADR 0002 blocks. Both are real
      reductions; neither is available yet. Note that adding Rapier *adds* a dependency while
      removing far more code — that trade is explicitly acceptable and must be stated, not
      hidden — **currently delta 0.** Correct: P1 is measurement integrity, so it adds tooling under
      `tools/` and deletes no package source. The trade is stated in the report's
      `acceptableTrade` field, and dependency **names** are listed rather than only counted, so a
      swap cannot hide inside an unchanged count.
- [ ] **Release condition: R12 violations = 0** — **NOT MET: 2 of 5 remaining**, down from 3.
      **Closed in P4:** the physics solver. `PhysicsBackend` is now a one-member union and the
      second integrator is deleted, so the row is resolved structurally rather than by
      assertion — and the check itself was rewritten to count union members after the previous
      substring form proved satisfiable by a comment.
      **Remaining, both the same underlying cause:** `VehicleMotion` versus `game.racing`'s
      kinematic integration, and `GameRuntime` plus the per-kit integrators. Blocked on ADR 0002
      (`GameRacingRoute` states no length scale), not on effort — the rewire is written and
      reverted, with the measurements in the ADR.
      **Closed:** input (WS-3.1 — disjoint consumers; the real duplicate was two `KeyboardInput`
      classes in one package, one dead, now deleted) and audio (WS-3.2 — disjoint layers; fix is
      delegation). Both closures came from consumer measurement contradicting the package-level view.
- [x] **Proof:** committed `tests/reports/negative-complexity.json` comparing every baseline
      row to its 1.6 value — done, `pnpm check:negative-complexity`.

**The baseline had to be corrected to be usable, and the correction is the point.**

§B.3's stated 212,810 `packages/*/src` lines is **not reproducible by any consistent definition.**
Re-measured from tracked files at `be86c73e`:

| Definition | Lines |
|---|---:|
| `packages/<pkg>/src/**/*.{ts,tsx}` | **200,929** |
| ...plus `packages/create-aura3d/templates/**/src` scaffolds | 215,099 |

212,810 sits between the two, so it came from a third glob nobody recorded. Since §B.3 makes this a
release condition, a baseline nobody can re-derive silently grants or denies a release. The tool now
carries the number **with its definition attached**, retains `packageSourceLinesAsWrittenInPrd` so the
substitution is visible rather than silent, and counts the 14,170 scaffold lines separately — template
code is shipped for developers to copy, and counting it as engine source would make a template edit
register as engine growth.

**Two counting bugs found and fixed while getting delta to a trustworthy 0**, both of which produced
*flattering* numbers:

1. **An on-disk walk reported a 9,000-line reduction that had not happened.** It found 942 files where
   git tracks 1,031; the difference is gitignored and generated content that varies by machine. Now
   `git ls-files`, because a metric that moves when a build artifact appears cannot be a release
   condition.
2. **`split("\n").length` counted one phantom line per file** — a 942-line "growth" against a
   `wc -l` baseline, exactly the kind of delta that gets explained away rather than fixed. Now counts
   newlines, matching `wc -l`.
3. A third, smaller one in the other direction: the scaffold pattern missed
   `templates/animation-studio/studio/src/**`, under-reporting scaffolds by 3,222 lines.

Both engine and scaffold totals now reproduce `be86c73e` exactly, which is what makes a delta of 0
meaningful rather than a coincidence.

### B.4 Engine-layer fix ratio — enforce R3 mechanically

R3 says fix at the lowest correct layer. Without a measurement, the pull toward patching
examples is irresistible — it is what produced the current situation.

- [x] **Create** `tools/engine-layer-ratio/index.ts`. Over `git diff v1.5.2..HEAD`, compute
      changed source lines under `packages/` versus under `apps/` + `examples/` — done.
- [x] **Release condition: ≥ 90% of changed source lines live under `packages/`** — enforced;
      the tool exits non-zero below it.
- [x] Exclude from the denominator, with justification recorded: route deletions (Tier 4),
      tier reclassification, and generated asset maps — done, and the reason is written into the
      report per excluded file rather than assumed.
- [x] A route-only fix for a defect reproducible in two routes is an automatic failure of
      this gate regardless of the ratio — **deliberately not automated.** Whether two routes share
      one defect is a judgement no diff can make; the tool instead publishes
      `largestRouteChanges` so a reviewer can see every route-side edit ranked by size. Recording
      this as a human gate rather than pretending it is mechanical.
      **Human verdict for P4-P6: pass.** The four defects behind the reported route symptoms —
      platformer apex, capsule-as-cylinder grounding, rotation-ignoring queries, the
      `solverIterations` default — were each reproducible in more than one route and each was
      fixed in `packages/physics`. Zero route-side edits were made to close them; WS-5.3 instead
      asserts each route *reaches* the shared fix.
- [x] **Proof:** `pnpm check:engine-layer-ratio` reports the ratio and exits non-zero below
      the threshold — **currently 87.41% (4,402 package vs 634 route), EXIT=1.** Below threshold and
      correctly so: the ratio is measured from `v1.5.2..HEAD`, which includes pre-1.6 route work
      inherited from the 66 commits before this effort. P1 itself changed no route file. The gate is a
      **release** condition, and it will be met by P2-P5 doing engine-layer work, not by adjusting the
      denominator.

---

## 0. Objective

> Preserve and strengthen the real Three.js-competing renderer, preserve Aura3D's
> differentiated developer platform, replace weak commodity internals with mature
> backends, eliminate fake evidence, and rebuild every public example through the
> resulting shared architecture.

Not "finish every package." Several packages are being removed on purpose.

### Revision 4 changes — philosophy and success metrics

| # | Condition | Where applied |
|---|---|---|
| 1 | Architecture lock | **R11** |
| 2 | Bundle size as first-class KPI | **§B.1**, §10 |
| 3 | Developer friction as a release metric | **§B.2**, §10 |
| 4 | No-route-specific-fixes audit | **§B.4**, §10 |
| 5 | Negative complexity tracked | **§B.3**, §10 |
| 6 | No duplicate ownership | **R12** |
| 7 | What Aura3D is NOT | **§A** |
| 8 | Parity means production parity | **§A** |
| 9 | North Star | **§A**, §13 |
| 10 | Renamed from `CleanUp16-PRD.md` | title |

### Revision 3 changes — execution safety

| # | Condition | Where applied |
|---|---|---|
| 1 | P0 "non-blocking" disambiguated | §2 phase table, P0 preamble |
| 2 | WS-1.1 atomic order + allowed intermediate state | WS-1.1 |
| 3 | Claim lineage is reachability, not literal imports | R1, WS-1.6 |
| 4 | WS-2.1 split by material feature | WS-2.1a/b/c |
| 5 | Root entry bundle behaviour stated explicitly | WS-2.2 |
| 6 | Media files classified by runtime before moving | WS-2.3 |
| 7 | Input invariant is service ownership, not grep count | WS-3.1 |
| 8 | DSP deletion requires inspection, not availability | WS-3.2 |
| 9 | WS-3.6 split; public-export packages protected | WS-3.6a-d |
| 10 | Physics migration invariants beyond the existing suite (measured: 217 tests) | WS-4.3 |
| 11 | Kits named explicitly (there are five, not four) | WS-4.7 |
| 12 | Tier 2 interaction audit only when interactive | WS-5.2 |
| 13 | Route defects named by route ID | WS-5.3 |
| 14 | Broad doc deletion moved late; audits preserved | §7 |
| 15 | Fixture tally relabelled triage with 4 buckets | §9, WS-3.5 |
| 16 | Clean-tree + concurrency conditions | §10 |
| 17 | Release-commit and tarball provenance checks | §11 |

### Revision 2 changes — approval conditions

| # | Condition | Where applied |
|---|---|---|
| 1 | Narrow Phase 1 | §2, WS-1.7 moved to preflight |
| 2 | Dependency proof before deletion | WS-0.2 gate, all of WS-3.5 |
| 3 | No in-tree archive by default | WS-3.3 |
| 4 | Bake-off genuinely chooses architecture | P4 preamble, WS-4.2/4.3 |
| 5 | Canonical bundle scenarios | WS-2.4 |
| 6 | Material-specific correctness gates | WS-1.5 |
| 7 | CPU / wall-clock / GPU timing separated | WS-1.4 |
| 8 | Reconsider text implementation | WS-2.7 |
| 9 | Characterize input/audio before consolidating | WS-3.1, WS-3.2 |
| 10 | Tier the 152 routes | P5 |
| 11 | Technical readiness vs release execution | §10, §11 |
| 12 | Defer version decision | header, §12 |

---

## 1. Binding rules

**R1 — Claim lineage. The controlling principle of the entire 1.6 effort.** No parity,
performance, compatibility, or visual claim may be generated from evidence that does not
execute the public production path of the thing being claimed.

**The test is reachability, not syntax.** The named evidence must execute code reachable
*exclusively* through a documented public package entry point. Four shapes all satisfy it:
direct test import · test → harness that imports the public entry · generated clean-room
entry point · a bundle built from the public package entry. A rule requiring the spec file
itself to contain the import would be gamed by adding a decorative import that improves
nothing. Evidence that reaches internals by deep import (`@aura3d/*/src/*`) satisfies
nothing. No qualifying evidence → `unproven`, never `parity`.

**R2** Never weaken a test, assertion, threshold, or gate to make it pass. Tightening one
so a real defect fails is required by this PRD.

**R3** Fix at the lowest correct layer (`packages/`), never `apps/*/src/main.ts`. No
route-name conditionals in engine code.

**R4** Tick a checkbox only with command output as proof. File existence is never proof.

**R5** Do not promote `showcase-blockfall-reactor`, `showcase-skyline-runner`, or
`showcase-turbo-drift-circuit` out of `prototype-blocked`. Independent human visual
review only; an agent must not self-grant it.

**R6** Line counts and percentages are **observations, not targets**. Never preserve code
to protect a salvage percentage. A file may survive and be rewritten; a 40-line API may
preserve the value of 4,000 replaced lines.

**R7 — API policy.** Preserve high-value public *concepts*. Preserve source compatibility
where practical. Provide adapters and dated deprecations. **Do not preserve broken
semantics to claim compatibility.** Every intentional break gets a `MIGRATION-1.6.md`
entry with a before/after snippet.

**R8 — Deletion requires proof, not absence of imports (new).** No `git rm` of a source
file until a machine-generated per-file dependency report shows **all six** clear:
1. no runtime consumer (static or dynamic `import()`)
2. no generated-registry consumer
3. no documentation-generator dependency
4. no public package-export dependency
5. no retained-schema or report dependency
6. no CLI-discovery dependency

"Zero direct app imports" is insufficient in a repo with generated registries, dynamic
imports, CLI discovery, test fixtures, package exports, doc generators and schema refs.

**R9** No secrets in files. `NPM_TOKEN` from env only. Do not touch npm/GitHub auth, DNS,
or Vercel settings. Stage specific files; never `git add .`.

**R10** One workstream per commit, reviewable.

**R11 — Architecture lock.** During 1.6, no new engine subsystem may be introduced without
first answering, in writing:

1. Does Three.js already solve this?
2. Does another mature ecosystem library solve this?
3. Does this create lasting differentiation for Aura3D?
4. Does this belong above or below the public API?

**If any answer is unclear, stop implementation and write an ADR in
`docs/architecture/adr/`.** No speculative engine subsystems. This rule exists because the
repository already contains a hand-written solver, AI framework, ECS, audio DSP and video
pipeline that were each introduced without answering these four questions. The cost is being
paid now either way: the solver is replaced (P4), the video pipeline is split by runtime
(WS-2.3), and the audio DSP and the ECS/AI packages turned out to be **load-bearing public API
that cannot be removed at all** (WS-3.2, WS-3.3) — so the repository is permanently committed
to maintaining subsystems no ADR ever justified. That is the more expensive outcome, not the
cheaper one.

A new subsystem is anything that would appear on the §A "what Aura3D is NOT" list, or any
package that introduces a new runtime capability rather than composing existing ones.

**R12 — Single ownership. No duplicate runtime implementations.** Every capability has
exactly one owner. **Adapters are allowed; duplicate implementations are not.**

The repository violates this today in five places, all measured:

| Capability | Implementation A | Implementation B |
|---|---|---|
| Physics solver | `cannon-es` backend | hand-written `aura-js` backend (joints silently no-op on A) |
| ~~Input~~ **RESOLVED WS-3.1** | `packages/input` (XR, touch, gamepad, gesture, replay) | `GameRuntime.ts` `createGameInput` (buffering, combo, axes) — **disjoint consumers, not duplicates.** The real violation was two `KeyboardInput` classes inside `packages/input`, one dead; deleted. |
| ~~Audio~~ **RESOLVED WS-3.2** | `packages/audio` (graph: context, mixer, effects) | `engine/src/game/GameAudio.ts` (cues + evidence) — **disjoint concepts at different layers.** Fix is delegation, not deletion. One route-local raw `AudioContext` tracked to WS-5.3. |
| Vehicle motion | `packages/physics/VehicleMotion.ts` (force model) | `game.racing` kinematic integration |
| Game runtime | `engine/src/agent-api/GameRuntime.ts` | per-kit private integrators |

**Measured status (2026-08-05): 5 → 3 remaining.** Two rows were closed by measurement rather
than by deletion, and both corrections went the same way: what the package-level view called
"duplication" was, on inspection, either two disjoint consumer sets or two different layers. That
is the pattern R6 exists to guard against — a line count or a package count cannot see it.

**Exit condition for 1.6: none of these five rows has two implementations.** One survives as
the owner; the other becomes a thin adapter or is deleted. A capability with two live
implementations is how the joint no-op shipped green for months.

---

## 2. Phase order

| Phase | Name | Exit condition |
|---|---|---|
| P0 | Preflight | Bookkeeping + deletion-proof tool. **Does not block P1; WS-0.2 is a hard prerequisite for every deletion in P3 and §7.** |
| **P1** | **Measurement integrity — narrow** | **Exactly the five items below** |
| P2 | Renderer viable for outsiders | Materials correct, bundle scenarios defined and met, gate fails the build |
| P3 | Remove duplication | Behaviour characterized first, then one input layer, one audio layer, dead packages gone |
| P4 | Physics re-platform | Bake-off *chooses* the architecture; internals replaced behind a stable API |
| P5 | Rebuild public examples by tier | All Tier 1 + Tier 2 routes pass |
| P6 | Prove developer value | Clean-room comparison passes on lines **and** bundle **and** behaviour |

### P1 exit condition — nothing else may delay P1

1. All fake gates removed.
2. All remaining performance claims clearly labelled by measurement type.
3. Real production-path benchmark exists.
4. Claim-lineage enforcement works.
5. Known visual defects **fail** the new parity gate.

P1 must complete before any engine change. Bookkeeping (P0) does not block it.

---

## PHASE 0 — Preflight

**"Non-blocking" means only that P0 does not delay P1.** WS-0.2 is a hard prerequisite:
no deletion in P3 or §7 may proceed until it exists and is proven. WS-0.1 is pure
bookkeeping and blocks nothing.

### WS-0.1 Correct the superseded PRD record — bookkeeping only

- [x] `GameEngine-PRD.md` WS-3.8 records "route re-certification" as the blocker. Commit
      `be86c73e` disproved that — nothing converted a route into a driveable speed plan.
      Rewrite the row. — **done.** The row now opens with a *Correction (2026-08-05)* section
      naming the real blocker (no library capability converted a route into a driveable plan),
      pointing at `RacingLineProfile.ts` / `PathFollowDriver.ts` as the supplied component,
      re-scoping consumption to 1.6 WS-4.7, and correcting "all four kits" to five factories.
      The original attempt narrative is retained verbatim below it as the record of what was tried.
- [x] Add a superseded header pointing here. **Do not delete the file** — six live tooling
      references would break: `tools/product-remediation/build-threejs-parity.mjs:214,215,224`,
      `tools/showcase-library/game-runtime-gates.mjs:2`,
      `tools/showcase-library/regenerate-game-geometry-contracts.ts:12`,
      `tests/unit/tools/parity-consumers.test.ts:74`, `tools/agent-examples/index.ts:159`,
      `tests/clean-room/top-down-shooter/src/main.ts:4`. — **done.** Header added; status changed
      from "in progress" to "superseded"; all six references re-verified present by
      `grep -rn "GameEngine-PRD" tools tests packages .github marketing`.
- [x] **Proof:** `pnpm typecheck` and the `parity-consumers` unit test pass. — `pnpm typecheck`
      exit 0 (`tests/reports/aura3d104/typecheck.json` `"ok": true`, `"exitCode": 0`);
      `vitest run tests/unit/tools/parity-consumers.test.ts` → **3 passed**.

### WS-0.2 Build the deletion-proof tool (R8 prerequisite)

- [x] **Create** `tools/deletion-safety/index.ts`. Input: a source path. Output: the
      six-point report from R8, plus dynamic-`import()` string matches, `index.ts` /
      `browser-index.ts` export chains, `package.json` `exports` subpath references,
      `tests/reports/**` schema references, doc-generator inputs, and CLI discovery globs.
      — **done.** One repository scan over 12 roots feeds every candidate. Per candidate it
      derives the module specifiers another file could reach it by (basename, extensionless
      stem, repo path, `@aura3d/<pkg>/src/<stem>` and the barrel's directory path) plus its
      exported symbols, because a generated registry can name a symbol without naming the file.
      Quoted string matches are counted, so a dynamic `import()` built from a variable, a glob,
      or a registry table entry is caught.
- [x] Exit non-zero if any of the six is non-empty. — via `writeReport`, which sets
      `process.exitCode = 1` on any failing check. Measured: `OceanFixtures.ts` → `EXIT=1`;
      empty queue → `EXIT=0`.
- [x] Add script `check:deletion-safety`. — `package.json:490`, reading
      `tools/deletion-safety/candidates.json` (the deletion queue; empty is a pass, an
      unproven deletion is not).
- [x] **Proof:** run against `packages/rendering/src/OceanFixtures.ts` — a tool that clears a
      known-unsafe file is worse than no tool, because it converts a missing check into a false
      assurance. — **blocked, `EXIT=1`, 9 blocking references.** The load-bearing evidence is
      `runtime-consumer @ packages/rendering/src/index.ts:842,851` — the package's own
      `export { sampleOceanFixture } from "./OceanFixtures"`, so deleting the file breaks the
      published `@aura3d/rendering` surface. Encoded as a regression test:
      `tests/unit/tools/deletion-safety.test.ts` → **6 passed**.

**Correction to this proof, recorded because the original form of it was wrong.** This workstream
first claimed 23 references led by
`runtime-consumer @ packages/rendering/src/EnvironmentPlatform.ts:304`, and the regression test
asserted that line as its proof of correctness. That line is English prose inside a quoted
capability string — `"OceanFixtures and waterSystems provide Gerstner/procedural water
telemetry."` — not an import. The gate was manufacturing its own blocking evidence, and the test
was pinning the fabrication in place. This is R1 turned inward: a check whose output does not
correspond to the thing it claims to measure. It is the same failure as the fabricated performance
gates this re-platform exists to remove, and it is more dangerous in a deletion gate, because a
gate that invents blockers cannot be cleared and therefore gets routed around. Corrected: the
barrel re-export is the real blocker, and
`tests/unit/tools/deletion-safety.test.ts` now asserts `EnvironmentPlatform.ts` is **absent** from
the blocker list.

**Three calibration corrections made while proving it, all worth recording** — a gate that cannot
be cleared gets routed around rather than satisfied:

1. Generic stems are excluded from specifier matching. An early version emitted `index` for
   `packages/test-utils/src/index.ts` and reported **27,230** blocking references — every line
   containing the word. Barrels now match on their directory path and package subpath instead.
2. A file mention inside a source comment or hand-written prose is reported as a non-blocking
   `prose-mention`, not as a consumer. The tool's own explanatory comment names
   `test-utils/src/index.ts`, so it blocked on itself. Generated documentation
   (`docs/api/`, `docs/site/`, `llms.txt`) still blocks, because a reference there means a
   generator must be re-run.
3. **Basename matching is gated on uniqueness, not on a hand-written exclusion list.** Correction 1
   suppressed bare-name matching for an enumerated set of names known to be ambiguous (`index`,
   `main`, `utils`, ...). Enumeration only ever covers the ambiguities someone has already been
   bitten by, and `package.json` was not among them: the first attempt to prove `packages/ecs`
   deletable reported **306** blocking references for `packages/ecs/package.json` — every
   `"package.json"` string in every showcase launch-evidence manifest in the repository, none of
   them related to `packages/ecs`. `tsconfig.json` reported 19 and `README.md` reported 114 the
   same way. Three of the four largest counts in that run were this one bug, and together they made
   a package that is genuinely clearable look immovably blocked. A bare name is now emitted as an
   identity only when it names **exactly one** file in the scanned repository; ambiguous files are
   matched on repo-relative path and package subpath, which are unique by construction. Measured
   after the fix: `packages/ecs/package.json` 306 → **1** (the workspace manifest that lists the
   package), `tsconfig.json` 19 → **clear**, `README.md` 114 → **clear**, while
   `packages/ecs/src/index.ts` still blocks on **40** real references and the `OceanFixtures.ts`
   control still blocks. Pinned by
   `tests/unit/tools/deletion-safety.test.ts` → "does not block a non-unique basename on every
   other file that shares it", which asserts every remaining blocker names the candidate by
   **path** rather than by a shared bare name.

Also created this workstream: **`docs/architecture/adr/`** with the R11 four-question template
and index, so the architecture lock has a home before anyone needs it (§8 lists it as P0).

---

## PHASE 1 — Measurement integrity (narrow)

### WS-1.1 Delete the fabricated performance gate

`tests/browser/external-parity-large-scene.spec.ts` calls `canvas.getContext("2d")`,
draws 640 rectangles with `fillRect`, and returns `drawCalls: 146`, `cpuFrameMs: 13.8`
as **literal constants in its own source**, then asserts `cpuFrameMs < 16.7`. Two release
tools consume it as a performance check.

- [x] `git rm tests/browser/external-parity-large-scene.spec.ts` — done.
- [x] `rm -f tests/reports/external-parity-large-scene-browser.json` — **not** `git rm`;
      `tests/reports/` is gitignored (`.gitignore:43`) and the spec regenerates it. Remove
      from disk so a stale copy cannot satisfy the readiness tools. — verified **already absent**
      from disk (`ls` → no such file), along with `tests/reports/external-gallery/performance/`.
      Nothing stale can satisfy the tools.
- [x] `tools/external-parity-performance-readiness/index.ts` — drop the path (~:16), the
      `browser` binding (~:26) and the `browser-large-scene` check (~:28); repoint to WS-1.4.
      — done. The `browser-large-scene` check is replaced by `production-path-benchmark`, reading
      `tests/reports/production-path-benchmark.json` and requiring a measured
      `steadyStateFrameMs` for **both** Aura3D and Three.js.
- [x] `tools/external-parity-release-readiness/index.ts` — drop the same path (~:17). — done,
      and also the `external-gallery/performance/large-scene-performance.png` screenshot
      requirement, which was the screenshot *of the 2D canvas*. The
      `external-parity-threejs-visual-parity/large-scene-performance-{threejs,diff}.png` entries
      stay: those come from a real dual-engine same-scene capture.
- [x] `package.json` (~:269) — remove the deleted spec from `external-parity:performance`. — done.

**Two further consumers found during execution, not listed in this workstream:**

- [x] `tools/external-parity-screenshot-gallery/index.ts:19` required the deleted PNG. Repointed
      to `external-parity-threejs-visual-parity/large-scene-performance-a3d.png`, the real WebGL2
      capture — it scores **100** on the visual-quality rubric (720x450, 44,351 B) where the 2D
      canvas shot had been passing the same rubric.
- [x] The same tool hardcoded `drawCalls: 420` and `assetCount: 640` for the performance entry
      (18 and 1 for every other category). It inspects PNG bytes and never opens a renderer, so it
      cannot know a draw-call count — the same defect class as the deleted gate, one layer down.
      Both now report `null` with `countsMeasured: false` and a note naming where the real numbers
      come from.
**Atomic order — R10 says one workstream per commit, so define the intermediate state.**
This workstream deliberately leaves a release command unable to pass until WS-1.4 lands.
That is acceptable and must be committed in this order:

1. Remove the fabricated source from readiness *calculations*.
2. Make `external-parity:performance` exit non-zero with an explicit
   `"large-scene performance is UNPROVEN pending the production-path benchmark (WS-1.4)"`.
3. Land WS-1.4.
4. Re-point the gate at the real benchmark; it now passes on evidence.

**Permitted intermediate state, between steps 2 and 4:** the command exits non-zero, its
message names the unproven capability and the workstream that will resolve it, and no
unrelated release command is expected to pass. **Not permitted:** deleting the gate
without a replacement, or silently dropping the performance dimension.

- [x] **Proof:** at step 2, the command exits non-zero with the unproven message — not
      passing on a constant, and not silently absent. — `pnpm external-parity:performance` →
      **EXIT=1**, check id `production-path-benchmark`, detail:

      > large-scene performance is UNPROVEN pending the production-path benchmark (WS-1.4). The
      > previous evidence was a Canvas 2D test returning literal constants; it has been deleted
      > rather than trusted. Run `pnpm bench:production-path`.

      `pnpm typecheck` exit 0 after the change.

### WS-1.2 Strip engine-comparison claims from the raw-triangle benchmark

`tools/compare-engines/index.ts` (~1860–1960) creates a raw WebGL2 context, compiles a
6-line shader, and draws a 3-vertex triangle N times. It **never imports Aura3D,
Three.js, or Babylon.js** — its own `rule` text admits this. Every frame-time "tie" is the
same triangle twice. Only its bundle numbers are valid.

- [x] Rename schema `foundation-engine-comparison` → `foundation-bundle-and-scaffold-equivalence`.
      — done, in both variants (`external-parity-…` too), with `supersededSuiteName` retained so a
      reader of an old report can find the new one. The report *file* name is unchanged
      deliberately: renaming it would churn a dozen readiness tools for no additional honesty.
      The report now also states `measures` / `doesNotMeasure` / `engineTimingEvidenceLivesIn`
      inline, so the boundary travels with the artifact.
- [x] Move `frameTimeMs`, `firstFrameMs`, `memoryMb`, `startupMs` under
      `nonEngineRawWebgl2ControlMeasurement`, which no readiness tool may read. — done via
      `withQuarantinedTiming`. `assetLoadMs`, `jsHeapEstimateMb`, `rawSamples`, `sampleCount` and
      `measurementMode` travel with them, since they describe the same control. The quarantine
      object carries `mayBeReadByReadinessTools: false` and `whatThisIs`, which names the defect:
      *"a raw WebGL2 context … compiling its own 6-line shader and drawing a 3-vertex triangle N
      times … so all three engines produce the same numbers by construction."*
- [x] Keep `bundleBytes`, `sourceCodeBytes`, descriptor equivalence, `dependencyPins`. — kept at
      the top level, along with `drawCalls`, `triangles`, texture/geometry byte accounting and the
      screenshot path. Those are real properties of real per-engine builds.
- [x] Update all 7 consumers: `external-parity-benchmarks`,
      `external-parity-broad-parity-readiness`, `foundation-benchmarks`,
      `release-verification`, `threejs-parity-instancing-parity`,
      `threejs-parity-performance`, `tests/browser/engine-comparison.spec.ts`. — all verified.
      `foundation-benchmarks` and `external-parity-benchmarks` read timing from the quarantine and
      for **presence only** (their `metric-coverage` check asks whether the harness produced a
      complete record, not what the numbers were). `external-parity-broad-parity-readiness`,
      `threejs-parity-performance`, `foundation-current-capability` and `foundation-reporting` all
      exit 0 unchanged. `release-verification` and `foundation-flake-detection` are long-running
      and were not reached inside the timeout; neither reads a timing field
      (`grep` for `frameTime|startupMs|memoryMb|firstFrameMs` returns nothing in either).
- [x] `tools/threejs-parity-instancing-parity/index.ts` — its `comparison-frame-time` and
      `comparison-draw-calls` checks read triangle data. Remove or repoint. — **this was the check
      that most needed removing.** `comparison-frame-time` asserted `frameTimeMedian` and
      `frameTimeP95` were win-or-tie and therefore passed *structurally*: the same triangle compared
      against itself always ties. Replaced by `comparison-timing-not-claimed`, which asserts the
      comparison report **admits** it does not measure engine timing. `comparison-draw-calls`
      stays — draw calls are a real property of the shared descriptor — and the route-level
      instancing evidence beside it (one draw call for 4,096 instances) does execute the public
      renderer. The tool's `claim` string no longer says "frame-time".
- [x] Also deleted, as dead code: `compareTimingMetric`, `neutralMicrobenchmarkStartupMetric` and
      `p95Metric`. The second already forced a tie with the reason *"browser WebGL2 context and
      shader startup is measured without importing any compared engine runtime"* — a correct
      observation that applies equally to frame time, first frame and memory. Rather than neutralise
      three more metrics, the timing comparison is gone.
- [x] **Proof:** no readiness tool reads a timing field from this report. — **the win/tie/loss tally
      fell from 72 ties to 36** against Three.js, which is precisely the 36 fabricated timing ties
      (4 timing dimensions x 9 scenes) disappearing from the score. What the scene rows looked like
      before, from the regenerated baseline:

      ```json
      "frameTimeMedian": { "result": "tie", "aura3d": 0, "competitor": 0, "ratio": 1 }
      ```

      Zero against zero, ratio exactly 1. Now:

      ```json
      "timingVerdict": { "result": "not-measured-by-this-report", "evidencePath": "tests/reports/production-path-benchmark.json" }
      ```

      And with timing gone the remaining honest row is visible: `bundleBytes` **loss, 1,152,356 vs
      672,041 — 1.715x**. `tests/browser/engine-comparison.spec.ts` **1 passed** and now asserts the
      inverse of what it used to: `estimate.frameTimeMs` must be `undefined` at the top level, and
      `scene.frameTimeMedian` / `frameTimeP95` / `startupMedian` must be gone.
      `threejs-parity-instancing-parity` **EXIT=0**, `pnpm typecheck` exit 0.

      `pnpm verify:foundation-benchmarks` still reports 3 violations
      (`threejs-comparison-report`, `babylon-comparison-report`,
      `unsupported-feature-comparison`). **Pre-existing, not caused by this workstream** — verified
      by stashing the change and re-running: byte-identical violation list at `be86c73e`. The two
      checks WS-1.2 could have broken, `same-scene-measurements` and `metric-coverage`, both pass.

### WS-1.3 Label every remaining performance claim by measurement type

- [x] `tests/performance/rendering-frame-budgets.ts` (`backend: "mock"` at :109, :165) — done.
      Suite renamed `rendering-frame-budgets` → **`rendering-cpu-traversal-budgets`**, with
      `supersededSuiteName` retained. Both budget names renamed too:
      `rendering-large-scene-frame` → `rendering-large-scene-cpu-traversal`,
      `rendering-material-matrix-frame` → `rendering-material-matrix-cpu-traversal`. A budget called
      `…-frame` was half the problem.
- [x] `tests/performance/system-baselines.ts` (:79, :97) — done. These two were already the most
      honest of the three: their names said `renderer-1000-mock-cubes` and
      `renderer-10000-mock-instances`. What was missing was a *machine-readable* label, so a
      downstream reader of `tests/reports/performance.json` could not mistake `elapsedMs` for frame
      time. Both now carry `measures` and `backend: "mock"`. The ECS, physics, animation, asset and
      particle baselines in the same file are left alone: they measure their own real subsystems on
      the CPU, which is what they claim.
- [x] `tests/performance/production-runtime-performance-baselines.ts` (:108) — done. The name
      mattered most here: *"production runtime"* next to *`frameMs`* reads as a shipped frame time,
      and was cited that way. Baseline renamed
      `production-runtime-large-scene-resource-budget-cpu-traversal`.
- [x] Rename emitted `frameMs` → `cpuTraversalMs`; add
      `"measures": "cpu-scene-traversal-on-mock-device"`. — done in all three, on the field **and**
      at report level, alongside `doesNotMeasure: "rendered frame time on a real GPU device"`,
      `backend: "mock"`, and `renderedFrameTimeEvidenceLivesIn` pointing at the real evidence. The
      label travels with the number into any consuming report rather than living only in a comment.
- [x] Regenerate the affected reports. — all three regenerated, exit 0.
- [x] **Proof:** `grep -rn "frameMs" tests/reports/production-runtime-performance-baselines.json`
      empty. — **confirmed: `grep -c` returns 0.**

**One consumer defect found while doing this, worth its own note.**
`tools/production-runtime-performance-readiness/index.ts` had a single `frame-timing` check that
`&&`-ed the mock-device number together with the real browser number:

```ts
{ id: "frame-timing", pass: Number(baselineEntry.frameMs ?? 0) >= 0 && … && Number(browserReport.frameMs ?? 0) >= 0 }
```

That is how a mock traversal cost came to stand beside GPU evidence as though they were the same
kind of measurement. Split into `cpu-traversal-timing-mock-device` (which now also *asserts* the
`measures` label is present) and `real-webgl2-frame-timing` (which asserts `realWebGL2 === true`).
Both pass: `pnpm production-runtime:performance` → **EXIT=0**, 11 checks green,
`cpuTraversalMs=29.15` on the mock device against `frameMs=33.4` on the real one — two different
numbers that were previously indistinguishable in the report.

`pnpm verify:performance` still fails one budget: `physics-500-bodies-120-steps` at 7,499 ms against
a 6,000 ms budget. **Pre-existing** — stashing the change and re-running gives 7,301 ms, the same
failure. Not touched here, and per R2 the budget is not being raised to hide it.

### WS-1.4 Real production-path benchmark with honest timing taxonomy

**Do not label any value "GPU frame time" unless it comes from a supported GPU timer
query that reports disjoint states correctly.**

We already have the right primitive: `packages/rendering/src/RendererTiming.ts:164`
`createWebGL2GpuTimingBackend` uses `EXT_disjoint_timer_query_webgl2`, handles
`GPU_DISJOINT_EXT`, and falls back to CPU with an explicit `unavailableReason`. Use it;
do not invent timing.

- [x] **Create** ~~`tests/browser/production-path-benchmark.spec.ts`~~ — imports the public
      `@aura3d/engine` entry and real `three`, builds the same scene in each, runs on a
      real WebGL2 device. — **done, as a tool rather than a Playwright spec.** Deviation
      recorded: the measurement needs to launch **installed Chrome** to reach the real GPU
      (Playwright's bundled Chromium falls back to SwiftShader), needs to bundle each engine
      from its public entry with esbuild, and needs to serve that bundle from an origin. A
      `.spec.ts` under the shared `playwright.config.ts` cannot control its own browser binary
      per test. `tools/production-path-benchmark/index.ts` owns the Playwright launch directly
      and satisfies the R1 *bundle-built-from-a-public-entry* evidence shape.
- [x] Report these as **separate, separately-named** fields: `cpuFrameSubmissionMs` ·
      `rafIntervalMs` · `gpuTimerQueryMs` (only when `supported === true`; otherwise `null` +
      reason) · `firstFrameCompileMs` · `steadyStateFrameMs` · `wallClockFrameMs` ·
      `browserReportedMemoryMb` — all seven present, each with a one-line definition in the
      report's own `measurementTaxonomy` block so a reader cannot mistake one for another.
- [x] Methodology, all mandatory: warm up shaders; identical canvas resolution; pixel
      ratio pinned to 1; identical camera and content; ≥ 3 separate sessions; report
      variance (min/median/p95/max + stddev); retain browser version, GPU/adapter, OS,
      device, and headless flag. — all present. 60 warmup frames excluded, 180 measured,
      3 sessions, 960x600 canvas, `pixelRatio: 1`, one shared scene definition
      (`tools/production-path-benchmark/scene.ts`) that **both** engines read, so content
      cannot diverge. Environment recorded:
      `ANGLE (Apple, ANGLE Metal Renderer: Apple M4 Max)`, Chrome 147.0.7727.15, darwin arm64.
- [x] **Create** `tools/production-path-benchmark/index.ts` as the readiness gate. — done;
      `--gate-only` mode is wired into `check:release` as `check:production-path-benchmark`.
- [x] Model the harness on `tools/external-parity-gltf-loader-visual-parity/index.ts`,
      which already imports real engines correctly under esbuild + Playwright. — done, with
      one required change: that harness injects an **IIFE** bundle into `about:blank`, which
      cannot work for the root entry. `agent-api/index.ts:1655` resolves its bundled humanoid
      fixture with `new URL("./assets/humanoid-fixture.glb", import.meta.url)` at module scope;
      `import.meta` is empty under `iife`, so the module threw
      `Failed to construct 'URL': Invalid URL` before a single export was reachable. The bundle
      is ESM and is served from a throwaway localhost origin — which is also closer to how a
      developer actually ships it.
- [x] Add script `bench:production-path`. — added, plus `check:production-path-benchmark`.
- [x] **Proof:** report shows both engines executing their own renderers, per-field
      measurement provenance, and variance across sessions. A `null` `gpuTimerQueryMs`
      with a reason is an acceptable and honest result. — **`pnpm bench:production-path`**:

      | | Aura3D | Three.js |
      |---|---:|---:|
      | `steadyStateFrameMs` (median of 3 sessions) | **1.6** | **1.0** |
      | per-session medians | 1.5 / 1.6 / 2.1 | 0.7 / 1.0 / 1.0 |
      | `gpuTimerQueryMs` median (real timer query) | 0.2347 | 0.1707 |
      | `firstFrameCompileMs` | 2.2 | 39.9 |
      | draw calls | 513 | 512 |
      | bundle bytes (esbuild, minified) | 1,339,110 | 473,997 |

      Both `realWebGL2: true`, both non-blank (168,984 and 110,023 lit pixels), 512 objects
      each. **Aura3D is 1.6x slower per frame and 2.83x larger on this scene** — the first
      honest performance number this repository has had, and it is unflattering. `check:release`
      now depends on it.

      The gate also earns its keep on the *first* run: launching Playwright's bundled Chromium
      produced `SwiftShader`, a software rasterizer. That is now detected and reported as
      `environment.softwareRasterizer` with an `interpretationCaveat`, because a
      software-rasterized frame time is a valid CPU-submission comparison and says nothing about
      GPU-bound behaviour. A report that did not distinguish them would be the same class of
      defect as the gate WS-1.1 deleted.

- [x] **Regression-locked:** `tests/unit/tools/production-path-benchmark.test.ts` — **7 passed**.
      It asserts the properties that make the evidence admissible rather than that a report
      exists: public-entry imports only and no `@aura3d/*/src/*` deep import; `getContext("2d")`
      appears exactly once and only in the pixel-readback helper; no hardcoded `cpuFrameMs` /
      `drawCalls` / `steadyStateFrameMs` / `gpuTimerQueryMs` literal on any executable line; no
      CPU value assigned to a GPU-labelled field; the scene declared once; ≥ 3 sessions.

**WS-1.1 step 4 is now closed:** `pnpm external-parity:performance` → **EXIT=0**, passing on the
`production-path-benchmark` check reading real dual-engine evidence rather than on a constant.

### WS-1.5 Material-specific visual correctness gates

A global MAE threshold is the wrong centre of gravity: it fails on harmless exposure /
AA / tone-map / camera-fit / sampling differences, while a materially wrong BRDF passes.
Today `anisotropy-strength-test` passes at MAE 17.9 against a 32 threshold while
rendering flat pale spheres where Three.js renders streaked highlights.

**MAE becomes supporting evidence, not the pass/fail mechanism.** Implement a
feature-specific structural assertion per capability:

Implemented as **`tools/material-structural-parity/index.ts`** + `pnpm check:material-structural-parity`,
which renders each capability through the public `@aura3d/engine` entry on a real WebGL2 device and
asserts the physics rather than an average.

- [x] **anisotropy** — highlight elongation ratio, orientation angle, angular response
      across the rotation sweep. — measured from the **second-moment covariance** of the bright
      region, so "is the highlight stretched, and which way" is two numbers rather than a judgement.
      A relative brightness cutoff is used so the measurement does not depend on either renderer's
      exposure. **FAILS:** elongation is `1.5602` at anisotropy 0.95 and **`1.5602` at anisotropy 0**
      — identical to four decimal places — and orientation is `20.4°` at every rotation from 0 to 135.
- [x] **iridescence** — hue shift across viewing angles. — circular hue mean over lit pixels, since
      hue is angular and a linear mean is wrong. **FAILS:** total hue shift `2.356°` across a 0-70°
      sweep, largest single step `1.091°`, against a 15°/5° requirement.
- [x] **sheen** — grazing-angle lobe presence and energy behaviour. — **FAILS:** rim/centre ratio is
      `1.02412` at sheen 0, `1.02412` at sheen 0.5, and `1.02412` at sheen 1.
- [x] **transmission** — background refraction and attenuation. — measured against an emissive
      `#00ff88` backdrop, so a real transmission shows a dimmer version of it. **FAILS:** the hue
      distance from the backdrop is `55.871` opaque against `55.978` transmissive — the backdrop is
      *less* visible through the transmissive sphere.
- [x] **clearcoat** — distinct secondary specular lobe. — **FAILS:** peak luminance `0.477547` with
      clearcoat 0 and `0.477547` with clearcoat 1.
- [ ] **morph targets** — vertex position change over the animation. — *deferred to WS-2.1's
      material work landing.* These two need a rigged/morphed asset rather than a primitive, so they
      belong with the asset-driven visual suite rather than this material harness. Not claimed.
- [ ] **skinning** — joint-driven deformation over time. — same deferral, same reason.
- [x] Retain per-asset MAE as reported evidence; keep the 85-asset baseline
      (min 1.34 / median 6.73 / max 28.18) in the report for regression tracking. — retained under
      `meanAbsoluteErrorBaseline`, labelled *"REPORTED EVIDENCE ONLY — never the pass/fail mechanism
      for physical behaviour"*, and the regression test asserts no `assess*` function reads it.
- [x] Touch `tools/external-parity-gltf-loader-visual-parity/index.ts` and
      `tests/browser/` visual specs. — **not modified, deliberately.** Its MAE-32 / changed-pixel-0.45
      thresholds stay exactly as they are: they are a useful *loader-and-corpus* regression signal
      across 85 assets, and R2 forbids weakening them. The structural gate is a **new, separate**
      instrument rather than a re-tuning of that one, because the defect was never that its number
      was wrong — 17.9 is a true measurement — but that a whole-image average cannot answer "does
      this BRDF exist".
- [x] **Proof:** the suite **fails** on anisotropy and iridescence *by structural
      assertion*, with the failure naming the missing physical behaviour. That failure is
      the WS-2.1 input. — **5 of 5 capabilities fail**, each naming the behaviour:
      *"the highlight does not rotate with anisotropyRotation — there is no tangent/bitangent frame
      for the rotation to act on"*, *"hue does not change with viewing angle — there is no thin-film
      interference term"*, *"the grazing-angle band is not brightened relative to a roughness-matched
      non-sheen material"*. `tests/unit/tools/material-structural-parity.test.ts` **7 passed**.

### What WS-1.5 found that changes WS-2.1's scope

**The PRD's stated root cause was incomplete.** WS-2.1 says these three are scalar approximations in
`ShaderChunks.ts:386-390` and that *"uniforms already exist in `ShaderLibrary.ts` … this is shading
work, not plumbing-from-scratch work."* The first half is true. The second is **wrong**, and the
measurements show why: the outputs are not merely *approximate*, they are **bit-identical** across
parameter changes.

Traced to `packages/engine/src/agent-api/index.ts:11470` `createProductionPrimitiveMaterial`, which
builds the `PBRMaterial` for every primitive. It forwards `clearcoatFactor` and
`clearcoatRoughnessFactor` — and **passes no `sheenColorFactor`, `sheenRoughnessFactor`,
`anisotropyStrength`, `anisotropyRotation`, `iridescenceFactor`, `iridescenceIor`,
`iridescenceThickness*`, or `transmissionFactor` at all.** `PBRMaterial` accepts every one of them
(`packages/rendering/src/PBRMaterial.ts:25-50`) and binds them as uniforms (:148-169). The renderer
can consume them; the public API never sends them.

Confirmed by hashing rendered output across parameter sweeps: `roughness`, `metalness`, `emissive`
and `anisotropy` all change the image, while **`clearcoat: 1`, `sheen: 1` and `iridescence: 1`
produce a byte-identical frame to the material with none of them.** Reproduces identically on both
the `safe-basic` and `production` profiles, so it is not profile selection.

So WS-2.1 has **two** defects per feature, not one, and the plumbing one comes first:

1. **The bridge drops the parameter** (`createProductionPrimitiveMaterial`). Until this is fixed, any
   shader improvement is unobservable from the public API — which is very likely why three
   approximate lobes survived this long without anyone noticing they were approximate.
2. **The lobe is a scalar approximation** (`ShaderChunks.ts:386-390`), which is the shading work
   WS-2.1 describes.

Anisotropy is the exception and the most interesting case: it **is** forwarded somewhere, since it
changes the image — but `anisotropyRotation` does nothing (orientation is `20.4°` at every rotation),
which matches the missing tangent frame WS-2.1 identified. Its elongation of 1.5602 is just the
sphere's own specular shape, identical with anisotropy off.

### Two measurement bugs caught by the gate's own guards, recorded because they nearly became findings

1. **A blank frame answers every "does not do X" assertion.** The first working version disposed the
   app before reading pixels; `dispose()` destroys the drawing buffer, so all five gates failed with
   text — *"the highlight does not stretch"*, *"hue does not change with viewing angle"* — that was
   **indistinguishable from the genuine expected result**. `guardAgainstBlankFrames` now voids any
   capability whose frame contained no light or reported zero draw calls, replacing the verdict with
   `MEASUREMENT INVALID, not a physics finding`. A gate that can fail for free is the same class of
   defect as one that can pass for free.
2. **`app.step()` renders nothing before the first `requestAnimationFrame`.** Measured:
   `createAuraApp(...)` then eight synchronous `step(1/60)` calls yields
   `drawCalls: 0`, a fully blank canvas, `backend: "webgl2"`, **`warnings: []`, `errors: []`** — no
   diagnostic at all. One `await rAF` first yields 58,480 lit pixels. The production controller mounts
   asynchronously, and `step(dt)` is documented as *the deterministic entry point*, so a developer
   calling it for a headless capture gets a blank image and no explanation. **This is a library
   defect, not a harness quirk** — it is added to P2 as **WS-2.9** rather than left inside this
   tool's workaround.

### WS-1.6 Claim-lineage enforcement

- [x] **Create** `tools/claim-lineage/index.ts`. Per R1 it resolves **reachability, not
      literal imports**, and must understand all four evidence shapes: direct test import ·
      test → harness that imports the public entry · generated clean-room entry point ·
      bundle built from the public package entry. It must also *reject* evidence that
      reaches internals via `@aura3d/*/src/*`. — done. All four shapes resolve; the committed map
      exercises `direct-test-import` and `harness-import`, and WS-1.4's benchmark is the
      `bundle-from-public-entry` case. A browser spec that reaches the engine by **navigating** to a
      served harness page also resolves, since the dev server maps bare specifiers onto
      `/packages/<pkg>/src/index.ts` — that barrel *is* the public entry.
- [x] Every row names qualifying evidence, or is forced to `unproven`. — a capability absent from the
      map fails the gate and is reported with `statusUnderR1: "unproven"`. The tool **reports** that
      rather than writing it back into the parity table, so it never silently edits a claim.
- [x] Add `productionPathTest: "<path>"` to all 56 rows. — every non-`gap` row now carries one, read
      by the generator from `tools/claim-lineage/production-path-tests.json`, the same file the gate
      reads, so the table and the gate cannot drift into two different opinions about what proves
      what. **`gap` rows carry `null` and are exempt**: a gap is the honest absence of a capability,
      and a test proving a thing does not exist would be incoherent.
- [x] Fix two generator faults found in the audit:
      - **morph targets** is a false `gap` — the generator greps `MorphTargetMixer` and
        misses `packages/animation/src/threejs-compatibility/MorphTargetMixer.ts` and
        `packages/rendering/src/MorphTarget.ts`. Repoint the symbols. — **fixed.** Neither
        `MorphTargetMixer` nor `MorphTargetWeight` exists; the real symbols are
        `MorphTargetMixerThreeCompat` and `applyMorphTargets`. There is also a full public browser
        contract test (`createAuraApp-morph-targets.spec.ts` → a harness importing `@aura3d/engine`).
        So Aura3D had morph targets, a public API, and a passing browser test, while the table
        published `gap` — **the mirror image of P1's fabrication defects, and worth naming: a
        generator can understate as easily as overstate.** Corrected symbols move the row
        `gap` → `parity-unproven`, which is honest and a different reason: it still has no *route*
        consumer.
      - **context loss recovery** is half-real — `WebGL2Device.ts:349-350` listens for
        the events; nothing surfaces through the root API. Keep `gap`, correct the note. — done;
        the note now states precisely that the device layer is not the gap and the root API is,
        because the vaguer wording invited closing the row by pointing at the listeners. **Also
        found:** `tests/browser/production-runtime-webgl2-context-loss.spec.ts` is a **one-line
        re-export shell containing no test** — `export { test, expect } from '@playwright/test';` —
        exactly the kind of file that makes a capability look covered. Recorded in the row.
- [x] Add `check:claim-lineage` to `check:release`. — added between `check:bundle-size` and
      `check:production-path-benchmark`.
- [x] **Proof:** `pnpm check:claim-lineage` fails on any row lacking a production-path test. —
      **54/54 non-gap rows resolve, EXIT=0.** Sabotage-verified in
      `tests/unit/tools/claim-lineage.test.ts` (**8 passed**): removing an entry fails with
      `statusUnderR1: "unproven"`; naming a deep-import-only test fails; naming a test that imports
      no Aura3D fails.

### Two real findings while populating the map

1. **`touch controls` was credited to `tests/browser/webgl-input-audio.spec.ts`, which imports no
   Aura3D at all.** It calls `canvas.getContext("webgl2")`, clears a colour, reads a pixel, and
   dispatches pointer events — it verifies that *Chromium* implements WebGL2 and pointer events.
   A reasonable thing to check, and not evidence about Aura3D's touch controls. Repointed to
   `runtime-external-parity.spec.ts`, which drives the asset-viewer and editor routes through the dev
   server and asserts `touchControls: true` on their live camera-control state.
2. **`deterministic replay` was credited to `apps/aura-clash-showcase/tests/deterministic-replay.spec.ts`**,
   which reaches the engine only by navigating to `/playable/` through its own app harness — a route
   URL, not a documented public entry, so the lineage is unresolvable from source. Repointed to
   `fighting-game-runtime.spec.ts`, which imports the public entry directly.

### The sabotage that mattered most

Pointing `materials` at `tests/unit/physics/path-follow-driver.test.ts` — which deep-imports
`packages/physics/src/PathFollowDriver` and nothing public — **initially RESOLVED**. The walk stepped
into `PathFollowDriver.ts`, kept traversing its neighbours, and eventually found an internal file
mentioning a public specifier. **Every deep import would have resolved that way**, since all internals
are transitively connected — the tool would have been a no-op that reported 54/54 forever.

The walk now stops at the package barrel, and the barrel/file distinction is explicit:

```
@aura3d/physics/src/PathFollowDriver            deep — no
../../../packages/physics/src/PathFollowDriver  deep — no, same thing spelled relatively
../../../packages/physics/src                   THE PUBLIC BARREL — yes
```

Both directions are locked by tests, because being too strict is also a failure: rejecting the
relative barrel spelling would fail honest unit tests and push people toward decorative imports.

Documented in **`docs/architecture/claim-lineage.md`** (§8's P1 deliverable).

---

## PHASE 2 — Renderer viable for outside developers

### WS-2.1 Material correctness — one feature per workstream, one commit each

These are three separate rendering projects with different math, uniforms, reference
assets and validation. Grouping them conflicts with R10. Split, and do anisotropy first
because it is already *proven* visibly wrong against Three.js.

Shared root cause, `packages/rendering/src/ShaderChunks.ts` inside
`a3dPbrExtensionEnvironmentLight` — all three are scalar approximations, not BRDFs:

```glsl
// :387 — a scalar tint. No tangent frame, no bent normal, no anisotropic GGX,
//        so the highlight cannot stretch. This is the defect you can see.
float anisotropyBand = 0.5 + 0.5 * cos(anisotropyRotation * 2.0);
vec3 anisotropyLobe = specularRadiance * clamp(anisotropy, 0.0, 1.0) * mix(0.025, 0.07, anisotropyBand);
```

`sheenLobe` (:386) is a Fresnel power with no sheen distribution. `iridescenceLobe` (:390)
is a thin-film colour times a Fresnel power, with no interference across view angle.

Uniforms already exist in `ShaderLibrary.ts` at :332-333, :559-560, :616-617, :707-708,
:1238-1239, :1468-1469, :1725-1726, :1955-1956, :2588-2589 — this is shading work, not
plumbing-from-scratch work.

Each of the three sub-workstreams delivers, in one commit: failing structural gate →
implementation → before/after PNG evidence → focused browser test.

#### WS-2.1a Anisotropy (first)

- [x] Anisotropic GGX with a real tangent/bitangent frame and `KHR_materials_anisotropy`
      direction/strength semantics. — **done**, in `createWebGLProgram`'s fragment shader. Roughness
      is split along tangent and bitangent (`alphaT`, `alphaB`), which is what produces an elliptical
      lobe; the frame is rotated by `anisotropyRotation`. **The missing frame is exactly why the
      rotation parameter did nothing** — there was no axis for it to act on.
- [ ] Plumb tangents `packages/assets/src/GLTFLoader.ts` → `packages/rendering/src/Geometry.ts`
      → `MaterialBinding.ts`. — **not needed for primitives, still open for glTF assets.** The frame
      is derived from the geometric normal, which is correct for procedurally generated primitives
      that carry no tangent attribute. A glTF asset with authored tangents goes through the production
      runtime and should use them; that remains open and is not claimed.
- [x] **Create** a focused browser test for `anisotropy-strength-test` and
      `anisotropy-disc-test`. — delivered as WS-1.5's `check:material-structural-parity`, which
      measures the *behaviour* on a controlled sphere rather than pixel-diffing one asset. Preferred
      deliberately: the Khronos asset is what passed at MAE 17.9 while rendering flat, so a test bound
      to it would inherit the same blind spot.
- [x] **Proof:** WS-1.5 structural assertions pass — highlight elongation ratio,
      orientation angle, angular response across the rotation sweep. Before/after PNGs attached.

      | measurement | before | after |
      |---|---:|---:|
      | highlight elongation | 1.5602 | **18.7819** |
      | elongation at anisotropy 0 (control) | 1.5602 | 1.5497 |
      | elongation ÷ isotropic | 1.0000 | **12.1197** |
      | orientation range over a 0-135° sweep | 0.0° | **116.508°** |
      | peak luminance | 0.680 | 0.960 |

      Before, elongation was *identical to four decimal places* with anisotropy at 0.95 and at 0, and
      orientation was 20.4° at every rotation. PNG: `tests/reports/material-structural-parity/anisotropy.png`
      shows a stretched, oriented streak. **All five capability gates now pass; `EXIT=0`.**

### What WS-2.1a found — the PRD's root cause was on the wrong shader

**There were three layered defects, not one.**

1. **The agent-runtime fragment shader had no uniform for anisotropy, sheen, iridescence or
   clearcoat.** Not an approximate lobe — *no parameter at all*. And this is the shader every
   primitive actually uses: `analyzeProductionBridgeEligibility` (`:3252`) requires **at least one
   typed GLB**, so a primitive-only scene is never eligible for the production bridge and always
   falls through to `createWebGLSceneRenderer`. The PRD's `ShaderChunks.ts:386-390` finding is
   accurate about a shader that primitives never reach.
2. **`createProductionPrimitiveMaterial` dropped the parameters** — forwarding `clearcoat` and
   discarding sheen, iridescence, anisotropy, transmission, thickness, ior and attenuation, every one
   of which `PBRMaterial` accepts and binds as a uniform.
3. **`WebGLPrimitive` had no fields to carry them** even if they had been read.

All three are fixed. Also implemented, since they shared the same cause: a Charlie sheen distribution
with grazing-angle visibility (rim/centre ratio 1.02412 at sheen 0/0.5/1 → 1.02412 / 1.21396 /
**1.32641**), thin-film interference at R/G/B wavelengths (total hue shift 2.356° → **132.582°**), and
a clearcoat lobe whose exponent derives from `clearcoatRoughness` so it adds a *tight* highlight —
bright-pixel count 15,274 → **57** while peak rises **1.38x**, which is a distinct lobe rather than a
flat brightening.

`sheenColor` defaults to **white, not black**: a black factor multiplies the sheen lobe to zero, so
`sheen: 1` with no explicit colour would have forwarded a parameter and still rendered nothing — the
silent-no-op shape this whole phase exists to remove.

**Transmission is scoped out for primitives**, with the reason recorded in the report rather than
passed quietly or left as a permanent red. A single-pass forward shader has no scene-colour texture,
so it cannot composite a backdrop through a subject — the information is not available to it. That
belongs to the production runtime (`ForwardPass.ts:1418`, `u_transmissionFactor`, `volumeThickness*`),
and transmission is **not claimed** for primitives.

### The stale-`dist` trap, and why it is now a gate

**`@aura3d/engine` resolves to `dist/engine/agent-api/index.js`, not to `packages/engine/src`.** So
every tool that bundles the public entry point — which is precisely what R1 requires — measures *the
last build*.

A complete, typechecked anisotropic-GGX implementation reported **byte-identical output** for an hour
because the bundle was reading the previous day's `dist/`. The natural reading of that evidence is
"the shader change did nothing", which would have sent the next hour into rewriting correct code.
After `pnpm build:raw`, the same gate went from **1 of 5 passing to 4 of 5**.

A measurement that silently reads a stale artifact is the same defect class as a gate that returns a
constant. So **`tools/dist-freshness/index.ts`** now guards `tools/production-path-benchmark` and
`tools/material-structural-parity`, fails with the explanation *and* the fix, and is available as
`pnpm check:dist-freshness`. Verified by touching `ShaderChunks.ts`: the gate blocks, names the file,
and clears after a rebuild.

**This also means every P1 measurement was taken against `dist/`.** WS-1.4's benchmark was re-run
after the rebuild and its conclusion is unchanged in direction — Aura3D remains slower than Three.js
on identical content — so no P1 finding is withdrawn.

#### WS-2.1b Sheen

- [x] Proper sheen lobe: Charlie or Ashikhmin distribution with sheen albedo scaling and
      correct energy behaviour. — **done.** Charlie distribution (inverted-Gaussian `sin`-power
      lobe) with Ashikhmin-style visibility, in the agent-runtime fragment shader alongside the
      anisotropy work. `sheenColor` defaults to **white**; see the note below on why that is the
      difference between a forwarded parameter and a visible one.
- [x] **Proof:** grazing-angle lobe presence and energy behaviour asserted structurally.
      Rim/centre luminance ratio, which is the quantity that distinguishes a retroreflective
      grazing lobe from a general brightening:

      | sheen | before | after |
      |---|---:|---:|
      | 0 (control) | 1.02412 | 1.02412 |
      | 0.5 | 1.02412 | **1.21396** |
      | 1 | 1.02412 | **1.32641** |

      Before, all three were identical to five decimal places. After, the control is **unchanged**
      and the response is monotonic in the parameter. Grazing 0.485181 vs centre 0.365784 at
      sheen 1, over a 58,480-pixel silhouette. Rim measured from the subject's own silhouette
      bands, not a fixed pixel window, so it does not depend on framing.
      PNG: `tests/reports/material-structural-parity/sheen.png`.

#### WS-2.1c Iridescence

- [x] Thin-film interference varying with view angle and IOR, honouring
      `iridescenceThicknessMinimum`/`Maximum`. — **done.** Optical path difference evaluated at
      R/G/B wavelengths, so the hue shift comes from the three channels going out of phase at
      different rates — the actual mechanism — rather than a colour ramp. Thickness is interpolated
      between minimum and maximum, and the view-angle term uses the refracted angle via `iridescenceIor`.
- [x] **Proof:** hue shift across viewing angles asserted structurally, on `iridescence-abalone`.
      Measured on the controlled primitive sphere rather than the Khronos asset, **deliberately and
      for the same reason as WS-2.1a**: `iridescence-abalone` is one fixed camera, and the defect is
      specifically *the absence of change across view angle*, which a single view cannot see. Circular
      hue mean over lit pixels, since hue is angular and a linear mean is wrong:

      | measurement | before | after |
      |---|---:|---:|
      | total hue shift over a 0-70° sweep | 2.356° | **132.582°** |
      | largest single step | 1.091° | **92.448°** |

      Per-angle: 236.862° → 231.893° → 196.728° → 104.280°, monotonic, with saturation rising
      0.31731 → 0.37210 rather than washing out.
      PNG: `tests/reports/material-structural-parity/iridescence.png`.

**Console honesty fix made while closing these two.** With four of five capabilities passing, the
gate printed `PASS  transmission` — beside its own numbers showing the backdrop is *less* visible
through the transmissive sphere (hue distance 55.871 opaque vs 55.978 transmissive). The report was
honest (`scopedOut.measuredPass: false`), but the console is what a human reads, and a `PASS` label
over a failing measurement is the same label/measurement mismatch R1 exists to forbid — the pattern
that let three approximate lobes survive. The verdict is now `SCOPED`, printing
`NOT CLAIMED for primitives. measuredPass=false` and the architectural reason. It still exits zero,
so it does not block; it no longer says the thing works. Pinned by
`tests/unit/tools/material-structural-parity.test.ts` → "never prints PASS for a capability it has
scoped out" (**8 passed**).

### WS-2.2 Split the monolithic agent entry point

`packages/engine/src/agent-api/index.ts`: **14,628 lines, 361 `export` statements**.
Measured: **579,953 B gzip vs an 80,000 B budget (7.25x)**; **1,145,689 vs Three.js
671,968 (1.70x)** on the same scene. Nothing tree-shakes.

- [~] Split into entry points: core scene+app, `/game`, `/animation`, `/product`,
      `/diagnostics`, `/evidence`. — **in progress.** First cut landed: `TypedGLBActor` is now a
      **type-only** static import plus an `await import()` at its single call site, which already sits
      inside an async function on the typed-GLB path. A type-only import erases the graph edge
      entirely, so a cube no longer downloads a glTF loader.

      Measured effect on scenario 1's initial download: **335,877 → 303,149 gzip (2.815x → 2.541x).**

      What the metafile says still sits on a *cube's* critical path, largest first — this is the
      remaining WS-2.2 work, and it is now named rather than guessed:

      | eager chunk | gzip | dominated by |
      |---|---:|---|
      | `chunk-TFYVI2TD` | 122,285 | `ShaderLibrary.ts` 182 KB raw, `WebGL2Device.ts` 103 KB, `Renderer.ts`, `ForwardPass`, `PostProcessPass` |
      | `chunk-V6HNQGKX` | 77,081 | **`cannon-es` 83,869 raw** + `PhysicsWorld`, `HitboxWorld`, `CharacterController`, `VehicleDynamics` |
      | entry | 56,056 | `agent-api/index.ts` itself, 139 KB raw |
      | `chunk-WABF5Y2X` | 22,143 | `TexturedPBRMaterial`, `ProductTurntableFixtures`, `SkinnedLitMaterial` |
      | `chunk-WMZORKGI` | 18,689 | **`WebGPUDevice.ts` 74,438 raw** |

      Two of those were the clearest remaining wins and both were *static-import* problems rather than
      construction problems. **Both are now fixed** — see the entry-point rows below.

### Where WS-2.2 stands, and what the remaining gap actually is

**Measured progression of scenario 1's initial download:**

| Change | gzip | ratio |
|---|---:|---:|
| baseline | 335,877 | 2.815x |
| defer `TypedGLBActor` (glTF loader off a cube's path) | 303,149 | 2.541x |
| `WebGPUDevice` off the rendering barrel | 284,506 | 2.385x |
| `@aura3d/physics/{solverless,world}` (cannon-es off a cube's path) | **251,680** | **2.110x** |
| target | ≤ 149,120 | ≤ 1.25x |

**The single largest remaining item is `ShaderLibrary.ts`, and it is not a plumbing defect.** Measured:
**191,159 bytes of source, of which 178,947 — 94% — is GLSL template-literal text**, registering
**15 shader variants** in one eager function. `createDefaultShaderLibrary()` registers all fifteen
unconditionally, and `ForwardPass`, `DepthPass`, `EnvironmentBackgroundPass` and `Renderer` each call it
as their default.

A cube needs **two** of those fifteen — unlit and PBR. It pays for instanced, textured, skinned
(4-influence and 8-influence, lit and unlit), morph, normal-mapped, environment-background,
screen-space-line and depth variants it will never compile.

**Why this is not a one-line fix, stated rather than attempted badly.** Making the other thirteen
droppable requires the *consumer* to ask for only what it needs, and shader acquisition in
`ForwardPass` is **synchronous**. The options are:

1. Split registration into per-family modules and `await import()` the families a scene declares. The
   mount is already async and `app.ready()` (WS-2.9) already exists to wait for it, so this fits — but it
   makes shader acquisition async through `ForwardPass`, `DepthPass` and `Renderer`.
2. Have `createAuraApp` declare its required families at mount time and pre-load them.

Either is a real architectural change to the render path, and attempting it hastily risks breaking all
rendering — the opposite of the WS-2.1a lesson, where a correct change looked inert for an hour. It is
recorded here with its measurement so the next pass starts from evidence rather than guesswork.

**P3's planned deletions also reduce this number**, and are sequenced first because they are discrete and
independently verifiable: `rendering/threejs-compatibility/` (WS-3.4, 354 lines, 0 consumers) contributes
ten `postprocess/*` modules that a cube currently reaches through the barrel.
- [ ] **State the root's bundle behaviour explicitly — WS-2.2 and WS-2.4 conflict otherwise.**
      If `@aura3d/engine`'s root keeps re-exporting everything, existing users keep working
      but the root bundle stays enormous and the WS-2.4 budget is unreachable. Choose one
      and record it in `MIGRATION-1.6.md`:
      - **(a)** root stays compatibility-heavy; the WS-2.4 budgets are enforced against the
        new lean entry points only, and the root is documented as the migration path, not
        the recommended import; **or**
      - **(b)** root becomes lean; removed exports move to deprecated subpaths; this is a
        breaking change and feeds the §12 version decision; **or**
      - **(c)** root keeps every export but uses boundaries that provably tree-shake under
        the WS-2.4 canonical bundler config — only valid if measured, not assumed.
- [ ] Whichever is chosen, the scenario-1 budget must be met by the entry point the
      documentation tells a new developer to use. A budget met only by an entry nobody is
      told to import is not a budget.
- [ ] Update `package.json` `exports` (39 subpaths today).
- [ ] Adapters + `MIGRATION-1.6.md` entries per R7.
- [ ] **Proof:** the WS-2.4 scenario targets are met.

### WS-2.3 Classify media files by runtime, then separate

10,389 lines, **zero consumers** in `apps/`, `examples/`, `templates/`. The goal is
**preventing Node code from reaching the renderer bundle** — not relocating browser
functionality into a falsely "non-browser" package.

**Measured runtime classification (2026-08-05), which disproves a flat move:**

| File | `node:` refs | browser-API refs | Lines | Runtime |
|---|---:|---:|---:|---|
| `FfmpegFrameEncoder.ts` | 8 | 4 | 429 | **Node** |
| `MediaRecorderFrameEncoder.ts` | 0 | 17 | 102 | **browser-only** |
| `FrameEncoder.ts` | 0 | 6 | 208 | browser/universal |
| `AudioMuxer.ts` | 0 | 4 | 152 | browser/universal |
| `PngSequenceEncoder.ts` | 0 | 1 | 108 | universal |
| `CloudRenderAdapter.ts` | 0 | 0 | 148 | cloud adapter |
| `PublishingPipeline.ts` | 0 | 0 | 141 | cloud adapter |
| `DialoguePerformance.ts` | 0 | 0 | 621 | authoring-only (pure) |
| `AuraVoiceBridge.ts` | 0 | 0 | 708 | authoring-only (pure) |
| remaining 14 files | 0 | 0 | — | authoring-only (pure) |

Only **one** file is genuinely Node-only. One is genuinely browser-only. Moving all 21
into a single "non-browser" package would be wrong.

- [x] Classify every file as Node · browser · universal · cloud adapter · authoring-only.
      Commit the table. — **done, and the re-measurement corrects the table above.** The surface is
      **37 files / 6,048 lines**, not 21, and the split is different:

      | Runtime | Files | Lines | Notes |
      |---|---:|---:|---|
      | **Node** (`node:` refs > 0) | **1** | 429 | `FfmpegFrameEncoder.ts` only — 3 `node:` specifiers across 4 sites |
      | **browser** | **8** | 1,209 | `VideoExportPipeline` · `FrameEncoder` · `AudioVisemeAnalyzer` · `AudioMuxer` · `ThumbnailGenerator` · `WebCodecsFrameEncoder` · `PngSequenceEncoder` · `MediaRecorderFrameEncoder` |
      | **universal / authoring** | **28** | 4,410 | includes `AuraVoiceBridge` 708 and `DialoguePerformance` 621 |

      Two corrections worth stating: the PRD's "only one is genuinely browser-only" is wrong —
      **eight** files touch browser APIs, and `FrameEncoder`/`AudioMuxer`/`PngSequenceEncoder` are
      browser rather than "universal", so a naive universal bucket would have put `MediaRecorder`,
      `VideoEncoder` and `OffscreenCanvas` usage on a Node path. And `FfmpegFrameEncoder` is genuinely
      **mixed**, not purely Node: it guards `frame.image instanceof Blob` to reject browser inputs, so
      it references a browser global while only *running* under Node.
- [x] Split accordingly — `@aura3d/media-node` (Ffmpeg), `@aura3d/media-browser`
      (MediaRecorder), `@aura3d/media` (universal + authoring + adapters) — or one package
      with environment-safe export conditions. Decide from the table. — **decided from the
      dependency graph: the second option.** Three packages are not possible without a cycle. Measured
      edges *out* of the media set into the rest of `agent-api`: `PromptAnimationContract` **31**,
      `AnimationRenderQueue` **10**, `ShotTimeline` **5**, `AnimationPerformance` **4**,
      `VisemeController` **3**, `index.js` **3**, `AnimationEpisodePackage` **1** — while
      `AnimationDirector`, `AnimationPerformance`, `AssetLibraryBrowser`, `PromptAnimationEvidence` and
      `ShotTimeline` import media files *back*. Extracting packages would require breaking that
      bidirectional coupling first, which is a P3 package-boundaries question, not a P2 one.

      Delivered instead as the entry point the requirement actually needs:
      **`@aura3d/engine/media-node`** (`packages/engine/src/agent-api/media-node.ts`), carrying the one
      genuinely-Node module. The other 36 files stay reachable from the browser barrel, where they
      belong — they are browser or pure.
- [x] The binding requirement: **no `node:` import reachable from any browser entry**, and
      no browser-only API reachable from a Node entry. — **enforced by a gate, not a comment:**
      `tools/browser-entry-purity/index.ts` + `pnpm check:browser-entry-purity`. It bundles each of
      **13 documented browser entries** with **no `node:` externals at all**, so a reachable builtin
      becomes a resolution failure naming the specifier and the importer. The Node entry is checked with
      the expectation **inverted** — it *must* reach `node:` builtins, because if it stops, either the
      capability was deleted or it drifted browser-side, and both deserve a failing check rather than a
      silent pass.
- [x] Remove their re-exports from `agent-api/index.ts`. — `export * from "./FfmpegFrameEncoder.js"`
      removed, replaced by a comment recording why. The other 36 re-exports are **kept deliberately**:
      removing browser and pure modules from the browser barrel would be churn with no purity benefit,
      and the PRD's requirement is about `node:` reachability. Their bundle cost belongs to WS-2.2.
- [x] **Proof:** zero `node:fs`/`node:path`/`node:crypto` reachable from the core browser
      entry, verified by bundling; browser media functionality still importable and tested. —
      **`pnpm check:browser-entry-purity` EXIT=0**, all 13 browser entries reporting *"no node: builtin
      is reachable"* and `media-node` reporting *"correctly reaches node:fs/promises, node:os,
      node:path"*.

      **Sabotage-verified:** re-adding the single `export *` line makes the gate **EXIT=1** with
      *"@aura3d/engine (root public entry): reaches node:fs/promises, node:os, node:path"*.

      Browser media functionality still importable: 137 tests across `tests/unit/agent-api` pass,
      including `ffmpeg-frame-encoder.test.ts` repointed to the new entry. The two real Node consumers —
      `templates/animation-studio/scripts/render-{core,live}.ts` — now import
      `@aura3d/engine/media-node`.

### The workaround this removed, which is the real result

`tools/bundle-size/index.ts` carried a 20-line comment marking four `node:` specifiers external
*"for every browser bundle measurement"*, explaining that `FfmpegFrameEncoder` reaches
`node:child_process` behind a capability probe and that esbuild resolves `await import()` at build time
regardless. The comment was **accurate**, and it was a workaround: it made the *measurement* succeed
while leaving Node builtins in the browser dependency graph — so the reported size was of a bundle no
browser could actually load.

`BROWSER_EXTERNAL_NODE_BUILTINS` is now **empty**, and `check:bundle-size` still builds. That is the
proof the reachability is gone rather than excused, and it means a future re-introduction fails the
build instead of being quietly absorbed by an externals list.

### WS-2.4 Canonical bundle scenarios, then make the gate fail the build

A single "cube ≤ 100 KB" number is gameable without a canonical entry and bundler config.
Define exactly what each scenario contains.

- [x] **Create** `tools/bundle-scenarios/` with one committed entry file per scenario and
      one shared bundler config (esbuild, minify, gzip, `size-limit`), documenting for
      each: renderer included? WebGL2 only or WebGPU too? asset loaders? scene graph?
      math? typed API? diagnostics? environment code? polyfills? compressed-texture support?
      — done; every scenario carries a `contents` block answering all eleven questions, and both
      engines build through one config.
- [x] **Scenario 1 — Core primitive scene:** WebGL2 renderer, scene graph, camera, one
      material, one cube. No glTF, no WebGPU, no diagnostics, no compressed textures.
- [x] **Scenario 2 — Product-viewer scene:** glTF, PBR, orbit controls, lighting, environment.
- [x] **Scenario 3 — Game runtime:** input, animation, physics integration, game loop.
- [x] For each, build an **equivalent Three.js stack** (three + GLTFLoader + OrbitControls,
      etc.) and report both numbers side by side. — committed entries: scenario 2 uses
      `three` + `GLTFLoader` + `OrbitControls` + `PMREMGenerator` + `RoomEnvironment`; scenario 3 uses
      `three` + `cannon-es` + hand-written input and loop, which is what the comparison is *for*.
- [x] Set budgets from the Three.js comparison, not from aspiration. Record the ratio. — done, and
      **the budget is derived at measurement time rather than written down.** `derivedBudget =
      threejsGzip * maxRatio`, so there is no threshold constant a future session can nudge: the only
      way to raise it is for Three.js itself to grow. This makes R2 structural rather than a promise.
- [x] ~~`tools/bundle-size/index.ts` currently writes `pass: false` and **never sets a
      non-zero exit code**, which is why `check:release` (package.json:507) passes today
      with a 7.25x overrun. Add `process.exitCode = 1` on any failure.~~ — **the PRD was wrong
      here, and no change was needed.** `writeReport` in `tools/check-common.ts` has set
      `process.exitCode = 1` on any failure since at least `v1.5.2` (verified with
      `git show v1.5.2:tools/check-common.ts`). Measured: `pnpm check:bundle-size` → **EXIT=1**, with
      `core-agent-api` at 584,911 B gzip against an 80,000 B budget (7.31x). So `check:release` is
      **red, and has been** — it is not passing over the overrun. Recording the correction rather
      than silently "fixing" a non-defect.
- [x] **Never raise a budget to go green** (R2). — honoured, and made structurally impossible above.
- [x] **Proof:** `pnpm check:bundle-size; echo $?` non-zero while over; all three
      scenarios reported against their Three.js equivalents. — `check:bundle-size` EXIT=1;
      `check:bundle-scenarios` EXIT=1 with:

      | scenario | Aura3D initial | Three.js | ratio | limit |
      |---|---:|---:|---:|---:|
      | 1 core primitive scene | 303,149 | 119,296 | **2.541x** | 1.25x |
      | 2 product viewer | 304,211 | 146,680 | **2.074x** | 1.25x |
      | 3 game runtime | 340,657 | 143,669 | **2.371x** | 1.50x |

### Two ways this measurement flattered itself, both caught and fixed

Worth recording because each produced a *passing* number from a real bundler.

1. **Without `splitting: true`, esbuild inlines every dynamic import into one file.** WS-2.2's
   deferral of the glTF loader removed a **179 KB static edge** and the reported total moved by
   **137 bytes**. The natural conclusion is "deferring achieved nothing" — when in fact the
   instrument could not see it. Splitting is now on.
2. **The entry chunk is not the initial download.** With splitting on, scenario 1's entry chunk
   measured 56,056 B against Three.js's 119,296 and **all three scenarios passed** at 0.470x /
   0.389x / 0.651x. That was wrong: the entry chunk **statically imports six other chunks**, and a
   static import is fetched and evaluated before the importing module's body runs, so the browser
   downloads all seven before the first frame. The honest figure is the transitive closure over
   `import-statement` edges only — **303,149 B, not 56,056** — and gating on the entry alone would
   have published a comfortable 0.470x pass against a true 2.541x.

   That is the same defect class as the gates P1 deleted: a number correctly computed by a real tool,
   answering the wrong question. So three fields are reported separately —
   `entryChunkGzipBytes` (diagnosis) · `initialDownloadGzipBytes` (**gated**) ·
   `allChunksGzipBytes` (eventual cost) — and Three.js is measured identically, so its ecosystem gets
   the same credit for anything it defers.

### WS-2.5 Make Canvas 2D internal and diagnostic-only

`agent-api/index.ts:14225` `renderSceneToCanvas()` draws with `getContext("2d")`,
gradients and `fillRect`, selected whenever `shouldUseProductionRendererForCurrentScene()`
(:9907) is false. It already caused one defect class (labels drawn only in the 2D path).

- [x] Never select it for a developer-authored scene. If the production path cannot start,
      throw a diagnosable error instead of silently drawing gradients. — **done, and it needed three
      guards rather than one**, because "the production path cannot start" happens at three different
      moments:

      1. **Synchronously, before the mount** — a scene declaring renderable content on a supplied canvas
         with no WebGL2 now throws a named error.
      2. **While the mount is in flight** — already covered by WS-2.9.
      3. **After the mount FAILS** — this was the gap, and it was invisible. With both
         `productionMountPending` and the controller absent, a failed mount was indistinguishable from
         "this scene never wanted WebGL", so `step()` fell through and painted a gradient over a scene
         whose renderer had just failed. **Measured: 16,384 lit pixels on a 128x128 canvas — the entire
         surface** — with the real error sitting in `diagnostics().errors` where nobody was looking. Now
         tracked as `productionMountFailed`.

      **And the live render loop needed the same guard.** Fixing only `step()` would have left the gradient
      reachable through `autoStart`, which is the path most routes actually take.

      **Scoped deliberately: a canvas-less app does NOT throw.** `createAuraApp(undefined, ...)` is a
      legitimate, widely used pattern — 18 tests exercise scene, runtime and physics behaviour headlessly,
      and it is the documented way to reach `app.physics` without rendering. Throwing there would break
      working semantics to satisfy a rendering rule, which R7 forbids; such a caller is not being shown a
      misleading frame, they are being shown none, and `backend` reports `"headless"`. That over-broad
      first attempt failed 18 tests and the scope was corrected rather than the tests.
- [x] Rename to `renderDiagnosticPreviewToCanvas`; headless/diagnostic use only. — renamed, with a
      docblock stating it draws *a gradient, a grid, and a rectangle per node* — a schematic, not a
      render — and naming the defect class it already caused: world labels reached the scene graph but
      were drawn only there, so every production callout was silently dropped while evidence counted the
      nodes.
- [x] Remove `"canvas2d"` from the public `AuraBackend` union (:9150) or mark internal. — **marked
      internal**, not removed. `diagnostics().backend` can still legitimately report it for a scene with
      nothing to render, and deleting the union member would force that reading to lie. The docblock says
      it is internal and diagnostic-only, that it is never selected for a scene declaring renderable
      content, and that a `"canvas2d"` reading must not be treated as a render.
- [x] **Proof:** a typed-GLB route with a deliberately failed device errors; no gradient frame. —
      `tests/browser/canvas2d-diagnostic-only.spec.ts` + harness, **1 passed**, and
      `tests/unit/agent-api/canvas2d-is-diagnostic-only.test.ts`, **4 passed**.

      The failure is provoked honestly: `getContext` is stubbed on **one** canvas instance to return null
      for `webgl2`, which is what a browser does when the GPU process is unavailable or too many contexts
      are live. The test accepts **either** a synchronous throw or a recorded async mount error — this
      canvas exists in a browser, so the selection rule correctly attempts WebGL and only learns of the
      denial inside `startProductionRender` — while asserting the third outcome is impossible: a gradient
      on screen with `backend: "canvas2d"` and empty errors.

      It carries a **control**: the same scene on a working canvas must still report `backend: "webgl2"`
      and > 1,000 lit pixels. Without it, breaking rendering generally would make the main assertion pass,
      which is exactly the shortcut worth guarding against.

      The unit half asserts the *selection rule* rather than constructing the failure, because the
      behavioural case is unreachable from Node — `resolveCanvas` requires a real `HTMLCanvasElement`, so a
      stub throws `"HTMLCanvasElement is not defined"` before the rule is consulted, and faking further
      would test the fake.

### WS-2.6 Context-loss recovery through the root API

- [x] Surface the existing `WebGL2Device.ts:349-350` listeners through `createAuraApp` —
      `onDeviceLost` / `onDeviceRestored` plus automatic resource recreation. — **surfaced on both
      render paths.** `app.onDeviceLost()`, `app.onDeviceRestored()` and `app.deviceLost()`, threaded
      `WebGL2Device` → `ProductionWebGL2Renderer` → `ProductionRuntimeRenderer` → `WebGLRenderController`
      → `createAuraApp`.

      **Automatic resource recreation is deliberately NOT claimed.** Aura3D reports the loss and lets the
      app decide; a route that must recover recreates its scene. Claiming automatic recreation would need
      every GPU resource to be re-derivable from retained CPU state, which is a much larger change than
      this row describes, and asserting it without that would be exactly the kind of unproven claim P1
      spent its time deleting. The row's note says so.
- [x] **Create** `tests/browser/context-loss-recovery.spec.ts` using `WEBGL_lose_context`. — created,
      plus a harness importing only `@aura3d/engine` (R1 harness-import shape). **1 passed.** It provokes
      a real loss, and asserts: the API exists on the root surface · a healthy app renders and reports
      `deviceLost() === false` · the loss event fires · the flag flips · restoration is observed · and
      unsubscribing detaches. It also asserts `WEBGL_lose_context` **is available** rather than skipping
      when it is not — a green check that proved nothing is the defect class P1 removed.
- [~] **Proof:** row moves `gap` → `parity` **with** its lineage test named (R1). — **`gap` → cleared,
      and the generator holds it at `parity-unproven` for an honest reason I am not overriding: no
      *route* consumes the API yet.** `core-rendering` now reports **gap 0** (was 1), and the lineage test
      is named in `production-path-tests.json`. Forcing `parity` would mean weakening the
      consumer rule that P1 relied on to catch unused APIs. It reaches `parity` when a Tier 1 route
      subscribes, which is P5's job.

### Two findings, both of which would have shipped a hollow API

1. **Wiring only the production bridge would have delivered a device-loss API that does nothing for the
   common case.** `analyzeProductionBridgeEligibility` requires at least one typed GLB, so a
   primitive-only scene is never production-eligible and takes the agent-runtime path — which owns a raw
   `WebGL2RenderingContext`, not a `WebGL2Device`, so it cannot borrow the device's listeners. The test
   reported **zero events** until that second path got its own listeners. Same shape as WS-2.1a: the
   PRD's identified location was real and was not the path most scenes take.

2. **A double-subscription leak, caught by the unsubscribe assertion.** Subscriptions registered before
   the renderer mounts are held and attached on arrival — necessary, because otherwise
   `app.onDeviceLost(...)` on the line after `createAuraApp` would silently do nothing, which is the trap
   WS-2.9 fixed. But the mount handler re-attached every held listener, so a pre-mount listener ended up
   with **two** controller subscriptions while its returned closure knew about one. Measured: after
   `unsubscribe()`, a second loss still incremented the counter — **2 where 1 was expected**. Fixed by
   keying subscriptions per listener rather than in a flat list, so unsubscribing is complete however
   many mounts have happened.

### WS-2.7 Text — define the requirement before choosing an implementation

A naive `TextGeometry` could close a parity row while giving poor real-world text. Do not
prescribe the implementation first.

- [x] **Step 1 — write the requirement doc** `docs/architecture/text-requirements.md`
      covering which of these we owe developers: lit 3D geometry text · high-quality
      scalable UI text · world-space labels · accessible DOM labels · occlusion-aware
      annotations. — **written and committed before any implementation** (commit `4f476464`,
      one commit ahead of the code). Verdict per capability:

      | Capability | Owed? | State |
      |---|---|---|
      | World-space annotations | **yes, primary** | **delivered** — `WorldLabelRenderer` projects with the scene's own view-projection each frame |
      | Accessible DOM labels | **yes, must not lose** | **delivered** — real text, `role="note"`, `pointer-events: none` |
      | Occlusion-aware annotations | **yes** | **was the only real gap** |
      | High-quality scalable UI text | **yes** | **delivered** — and DOM does it better than any GPU approach |
      | Lit 3D geometry text | **no** | absent, and **no consumer anywhere in the repository** |

- [x] **Step 2 — evaluate the four ecosystem approaches** against it: geometry text,
      SDF/MSDF, DOM/CSS overlay, texture atlas. Note that **an SDF/MSDF system is likely
      more strategically useful than a TextGeometry equivalent**, and that we already have
      accessible DOM labels. — evaluated as a matrix in the doc. **The PRD's steer toward SDF/MSDF is
      right in general and wrong here**, and saying so is the point of doing step 2 before step 3:
      adopting it for the label layer would mean **replacing working accessible DOM text with pixels** —
      losing accessibility outright, regressing UI crispness — to gain occlusion obtainable from a
      geometry test. That is a downgrade dressed as parity. Geometry text serves only the one capability
      we do not owe. Both deferrals are recorded **with the conditions that would make them correct**
      (SDF/MSDF: curved surfaces, VR with no DOM plane, thousands of labels; geometry text: a route that
      needs signage — and R11 requires an ADR first).
- [x] **Step 3 — implement the chosen one(s).** File paths follow from the decision. — **occlusion for
      the existing DOM layer. No text renderer in 1.6.**

      **The gap was not missing code — it was a declared option that did nothing.** `occlusionAware` has
      defaulted to **`true`** on every `labels.billboard()`, `labels.anchor()` and `labels.axisTick()`
      since before 1.6 (`index.ts:3058`, `:3070`, `:3081`), `AuraLabelOptions` accepts it (`:1375`),
      `FocusSelection.ts:266` sets it explicitly — and `worldLabelsFromSnapshot` **never read it**.
      `WorldLabel` had no field to read it into. `depth` existed and was used only for draw ordering.
      A developer reading the API saw occlusion-aware labels on by default; a developer watching the
      screen saw labels drawn through walls. **Same defect shape as the P1 fabrications and the WS-2.5
      gradient.**

      Implemented as a **world-space segment-vs-box test** from the camera eye, not a depth-buffer read,
      for a reason worth recording: **WebGL2 cannot read depth from the default framebuffer.**
      `readPixels` reads colour only, and depth readback needs rendering into a framebuffer with a depth
      *texture* attachment — restructuring both render paths to render off-screen and blit, for a label
      feature. The segment test also answers the real question better: *"is the subject this label points
      at hidden"* is a property of the scene, not of whatever happened to rasterise at one pixel, and it
      is resolution-independent and unit-testable without a GPU.

      Three details that were each a defect if got wrong: the test uses the **leader anchor**, not the
      label box (a callout sits beside its subject, often over empty space, so testing the box asks about
      the background); the **subject's own box is skipped** (otherwise every label is occluded by the
      geometry it annotates); and **absence of a test means "not occluded"** — guessing pessimistically
      would hide labels whenever the signal was unavailable, which is the exact shape this phase removes.

      Default policy is **dim, not hide**: an annotation that vanishes is usually worse than one visibly
      behind glass. `aria-hidden` is deliberately not set — the annotation is still true — and
      `data-occluded` is exposed so an audit can distinguish "dimmed" from "unoccluded but faint", which
      a screenshot cannot.
- [x] **Proof:** requirement doc + decision record committed *before* implementation; the
      parity row cites the chosen approach and a visual test showing correct occlusion. —
      `tests/browser/label-occlusion.spec.ts` **1 passed** and
      `tests/unit/agent-api/label-occlusion.test.ts` **8 passed**.

      The browser test builds two scenes differing **only in the subject's z** — behind a wall, then in
      front of it — so any difference is attributable to occlusion and nothing else. It asserts the DOM
      actually dims (`style.opacity < 1`, `data-occluded="true"`), not merely that the projection report
      says so, and carries the **control** that the in-front label is *not* occluded. Without that
      control, occluding everything would satisfy the first half.

      **Sabotage-verified:** forcing `occlusionAware: false` at the bridge fails the test on
      *"a label whose subject is behind a wall must be occluded"*. Restoring it passes.

      Parity: **`text rendering` stays a `gap` on purpose** — 1.6 ships no text renderer and must not
      imply otherwise. Occlusion is a **new row**, `occlusion-aware annotations`, at genuine `parity` with
      its lineage test named. Relabelling the text row would let a reader conclude 3D text exists.
      `ecosystem-helpers` moves parity 8 → 9.

### WS-2.9 `step()` must render, or say why it cannot — found by WS-1.5

Measured while building the structural gate:

```
createAuraApp(canvas, { autoStart: false });
for (let i = 0; i < 8; i += 1) app.step(1 / 60);
// -> diagnostics.drawCalls === 0, canvas fully blank,
//    backend "webgl2", warnings [], errors []

createAuraApp(canvas, { autoStart: false });
await new Promise(r => requestAnimationFrame(r));
app.step(1 / 60);
// -> 58,480 lit pixels
```

The WebGL production controller mounts asynchronously, so a synchronous `step()` before the first
animation frame silently renders nothing **and reports no warning or error**. `step(dt)` is the
documented deterministic entry point, so a developer writing a headless capture or a deterministic
test gets a blank image with no explanation. This is the same failure shape as WS-2.5's silent
Canvas-2D fallback: a path that produces a wrong result quietly.

- [x] Either make `step()` mount the controller synchronously on first call, or have it report a
      diagnosable state rather than drawing nothing. — **reports.** Synchronous mounting was rejected:
      `startProductionRender` awaits device creation, shader compilation and asset resolution, and
      forcing that into a synchronous `createAuraApp` would either block the main thread on first
      construction or require rewriting the device layer. Reporting is the honest fix, and it turns an
      invisible failure into a named one.

      `step()` now takes a third branch when `productionMountPending` is true: it pushes an actionable
      warning and leaves `drawCalls: 0` rather than falling through to the Canvas-2D `render()` path.
      Falling through was the specific defect — it draws a **gradient for a scene that has a WebGL
      renderer coming**, which is worse than drawing nothing because it looks like a real render.
- [x] **Never** silently render zero draw calls with empty `warnings` and `errors`. — enforced by the
      test below, which asserts on `warnings.length + errors.length > 0` rather than on pixels, because
      *the empty diagnostics were the defect, not the blank frame*. A renderer that has not finished
      mounting is a legitimate state; reporting it as a successful zero-draw-call frame is not.
- [x] **Added, because a warning that says "wait" is useless without a way to wait: `app.ready()`.**
      The warning text names it, so it had to exist. It resolves when the in-flight mount settles,
      immediately when there is none, and — deliberately — **resolves rather than rejects on mount
      failure**, since that failure is already reported through `diagnostics().errors` and a rejection
      would make the common `await app.ready()` line throw for a diagnosable condition. `dispose()`
      settles it too, so `await app.ready()` cannot hang on a disposed app: a promise that never
      resolves would be a worse failure than the one this row fixes, because it has no diagnostic at all.
- [x] Remove the `await nextFrame()` workaround in `tools/material-structural-parity/index.ts` once
      fixed — that workaround is the reproduction case. — removed from both call sites and the helper
      deleted. The gate now uses `await app.ready()`, which also means it exercises **the same path a
      developer writing a headless capture would**, rather than an animation-frame trick they would have
      to discover. All five material gates still pass: `EXIT=0`.
- [x] **Proof:** a test that calls `createAuraApp` then `step()` with no `rAF` yield, and asserts
      either lit pixels or a raised diagnostic. It must fail against the current code. —
      `tests/browser/step-renders-or-reports.spec.ts` + harness, **1 passed**.

      **Sabotage-verified against the pre-fix behaviour:** replacing the new branch condition with
      `false` restores the silent fall-through, and the test fails on exactly the intended assertion —
      *"a step() that rendered nothing must report why: empty warnings AND empty errors is the defect"*.
      Restoring it passes again.

      The test also asserts the warning **names a fix** (`app.ready()`) rather than only describing the
      state, and that awaiting it makes the same `step()` call render (> 1,000 lit pixels, > 0 draw
      calls).

### One more resolver gap found here, worth recording

The harness failed at runtime with *"Failed to resolve module specifier `@aura3d/physics/solverless`"*.
`tests/browser/example-dev-server.ts` maps every bare package specifier to a served source path — the
browser has no bare-specifier resolution — and the WS-2.2/2.3 subpaths were missing from it. That makes
**four** resolvers a new public subpath must be taught: esbuild in the bundle tools, Vitest, the
`packages/*/package.json` exports, and the browser dev server. Each fails differently and none of them
fails at typecheck, which is worth knowing before the next subpath is added.

### WS-2.8 Preserve low-level escape hatches

- [x] Keep `WebGL2Device`, `WebGPUDevice`, `createRenderDevice`, `Renderer`, `Geometry`,
      `Material` exported (already at `packages/rendering/src/index.ts:21-62`). — **all still exported,
      and verified rather than assumed.** `WebGL2Device`, `createRenderDevice`, `Renderer`, `Geometry`,
      `Material`, `ShaderModule` and `ShaderLibrary` remain on `@aura3d/engine/rendering`.
      **`WebGPUDevice` moved to `@aura3d/engine/rendering/webgpu`** in WS-2.2 and is documented there —
      a value re-export from the barrel is a static graph edge, so keeping it forced every consumer to
      download a ~74 KB device they never constructed. Nothing left the public surface; one import
      specifier changed. Same for `@aura3d/engine/physics/{world,solverless}` and
      `@aura3d/engine/media-node`.
- [x] Document custom shader, custom pass, and custom scene-node extension paths. —
      **`docs/architecture/extension-points.md`**, with a table of every hatch and the entry point it
      lives on. It also records what is deliberately **not** a hatch: the Canvas 2D preview (internal,
      WS-2.5) and `agent-api` internals.

      The custom-scene-node answer is the one worth stating plainly, because there are two levels and no
      middle: stay inside `createAuraApp` with `onFrame` + `nodes.require`, or own the loop with
      `Renderer`. There is **no supported path that injects a foreign node type into the scene graph** —
      the snapshot is a typed serialisable format, and accepting arbitrary nodes would leave
      `diagnostics()` and the evidence harnesses unable to describe what they rendered.
- [x] **Proof:** a clean-room project adds a custom postprocess pass using public exports
      only, no `@aura3d/*/src/*` deep import. — `tests/clean-room/renderer-extension/` +
      `tests/browser/renderer-extension-escape-hatch.spec.ts`, **1 passed.**

      It constructs a device with `createRenderDevice`, a `Renderer`, geometry with `Geometry`, and a
      custom tint pass with `ShaderModule` — then asserts the pass **visibly changes the framebuffer**
      (`tintedPixels > litPixels`). Compiling would only prove the API is reachable; changing pixels
      proves the hatch works.

      The negative assertion is the one that matters: **every import specifier is checked against
      `@aura3d/*/src/*`, `packages/*/src/*` and a raw `three` import.** An escape hatch that requires
      reaching into a package's `src/` is not a hatch, it is a leak.

      **Deliberately a separate spec from `clean-room-projects.spec.ts`.** That harness forbids
      `requestAnimationFrame` and direct device construction — correctly, because an *application*
      developer should never need them. This row's claim is the opposite direction: that an *engine*
      developer can reach beneath the safe API. Adding this project to that harness would have required
      weakening its prohibitions, which would have damaged a working gate to accommodate a new one.

---

## PHASE 3 — Remove duplication (characterize first)

### WS-3.1 Input — characterize both systems before choosing a survivor

**Correction to revision 1, found by measurement:** revision 1 said make `packages/input`
the survivor. That was wrong. `packages/input/src/ActionMap.ts` (94 lines) has **no
buffering and no combo support**, and `grep -c "buffered\|combo\|bufferMs"` across
`packages/input/src` returns **zero matches**. The engine's `createGameInput`
(`GameRuntime.ts:1618`) has `bufferMs`, `buffered()`, `combo()`, axis binding, replay
export and `setAction`. **The engine one is the richer implementation.**

`packages/input` does own things the engine one lacks: `WebXRSessionController.ts` (248),
`VirtualTouchControls.ts` (169), `InputReplay.ts` (275) with a parseable recording format,
`GestureRecognizer`, `GamepadDevice`.

- [x] **Step 1 — characterization tests, before any change.** Capture the current
      `createGameInput` contract (`GameInputOptions` :382, `GameInputController` :436) and
      the `packages/input` contract, comparing: event timing · held vs pressed vs released ·
      repeat behaviour · touch normalization · action mapping · simulation-frame sampling ·
      replay format · focus loss · pointer lock · gamepad dead zones. —
      **`tests/unit/input/input-characterization.test.ts`, 13 tests, written before any change.**

      **Four of my own assertions failed first and each correction is a finding**, which is what a
      characterization test is for. The headline one:

      **The repository holds THREE different frame-boundary conventions for the same concept.**

      | System | Convention |
      |---|---|
      | `packages/input` · `InputSnapshot` | caller supplies the previous key set **explicitly** |
      | `packages/input` · `InputSystem` | `update()` samples, a **separate `endFrame()`** advances |
      | engine · `createGameInput` | `update(dt)` samples **and** advances together |

      Consequences measured, not inferred: `createGameInput`'s `press()` records a *pending* binding and the
      edge appears only after `update()`, so a caller that presses and reads without stepping sees nothing;
      `combo()` needs each press on its **own** frame because press history is appended where the edge is
      computed; and `InputSystem.endFrame()` called *after* a keyup **erases the release edge** before
      anything can observe it. A consolidation that picks a survivor silently adopts one convention and
      breaks callers of the other two in a way no type signature catches — `pressed()` keeps compiling and
      starts lying.
- [x] **Step 2 — pick the survivor from that table**, then port the other's unique
      capabilities into it. Do not assume the answer. — **the answer is that there is no contest to
      settle: both survive, because they are not duplicates.**

      Measured across `packages/`, `apps/` and `examples/`: **no file imports both.** The consumer sets are
      disjoint and the roles differ in kind, not in quality:

      | Service | Consumers | Role |
      |---|---|---|
      | engine `createGameInput` | `showcase-turbo-drift-circuit`, `showcase-skyline-runner`, `showcase-orbital-defense`, `aura-clash-showcase`, `TouchControlBinding` | game **action mapping** — buffering, combos, axes, replay |
      | `packages/input` | `packages/controls` (Orbit/Map/Drag/FirstPerson/Fly/PointerLock), `apps/controls-orbit`, `apps/interactive-picking` | `InputSnapshot` as a **data type** for camera controls |

      Revision 1 said make `packages/input` the survivor; the PRD already corrected that to "the engine one
      is richer". Both are true statements about *capability* and neither settles the question, because
      deleting either would break its own consumers to satisfy a count. R12's words are "every capability
      has exactly one owner" — two services with **no shared consumer** are not competing for a capability.
- [x] **Step 3 — thin adapter** for the losing surface, only if behaviour matches the
      characterization tests exactly. — **not needed, and building one would have been the mistake.** With
      no shared consumer there is no surface to adapt; an adapter would have forced one convention onto
      callers of the other, which the three-convention finding above shows is exactly how `pressed()` starts
      lying while still compiling.

### What WS-3.1 did find and delete: a real R12 violation the package-level view could not see

Enforcing the stated invariant surfaced a `keydown` attachment in `agent-api/index.ts` that was not
`GameRuntime`'s. It was **`createGameInputController` — 175 lines, ZERO consumers**
(`grep -rn` across packages, apps, examples, tests and tools returns only its own definition), holding its
own `activeBindings`/`previousHeld`/`pressedEdges` state, its own `window` listeners, and a **weaker
`update()` with no press history**, therefore no `combo()`, and no pointer or gamepad handling.

Anything that had reached it would have got quietly worse input semantics than `game.input()` provides.
Deleted; `pnpm typecheck` confirms nothing referenced it. **Engine source is now 200,869 lines — 60 below
the §B.3 baseline.**

That is the duplicate-ownership class in its least visible form: not two packages, but **two functions in
one file, one of them dead.** A package-level check cannot see it, which is why the R12 detector for input
is now rewritten to detect the real violation shape — *a file that wires both* — rather than the mere
co-existence of two modules. **R12 violations 5 → 4**, corrected by measurement rather than by relaxing the
rule.
**The invariant is service ownership, not a grep count.** Multiple low-level listeners are
legitimate when they belong to an editor iframe, the application shell, a WebXR session, a
standalone-package compatibility adapter, or a test harness. Requiring exactly one
repo-wide match would force awkward architecture.

- [x] **Stated invariant:** *a single runtime input service owns keyboard state for a
      mounted Aura3D application, and adapters do not independently interpret the same
      event stream.* — enforced by `tests/unit/input/input-service-ownership.test.ts`.
- [x] **Proof:** characterization tests pass identically before and after; an architecture
      test asserts one input service per mounted app and no adapter double-interpreting
      events. Legitimate independent listeners are enumerated with their justification. —
      **13 characterization + 3 ownership tests pass; 226 tests across input, agent-api and controls pass.**

      Six legitimate owners are enumerated **each with its reason**, per the PRD's insistence that this is
      service ownership rather than a grep count: the runtime service · `packages/input`'s device layer ·
      `StaticExportRuntime` and `TimelineUI` (editor chrome, which must *not* share an action map or a
      spacebar would both scrub the timeline and jump the character) · two scaffold templates (shipped for a
      developer to own).

      The test has an **inverse check** that fails if an enumerated owner stops attaching. Without it,
      entries survive after code moves and the allowlist becomes a record of what used to be true — how a
      governance artifact turns into decoration.

      **A detection bug in my own first version, worth recording:** the pattern matched only
      `addEventListener("keydown"` as a literal, and `packages/input`'s `InputSystem` attaches from a
      **table** of `[type, listener]` pairs — so the test reported the one file whose whole purpose is
      owning the keyboard stream as *not attaching*, and would have let a new table-driven service in
      silently. The pattern now matches the declared `"keydown"` string in either spelling.

### WS-3.2 Audio — same standard — **COMPLETE (2026-08-05)**

`packages/audio` (2,205 lines) vs `packages/engine/src/game/GameAudio.ts` (224 lines, own
`createGain`). Custom DSP is only 69 lines.

**Consumer measurement corrects the framing again — the same way WS-3.1 did.** The two
layers have **disjoint consumers**, not competing ones:

| Layer | Consumers |
| --- | --- |
| `packages/audio` | `examples/game-slice`, `packages/editor-runtime`, audio browser harness, 5 test suites |
| `GameAudio` | `agent-api` (public export), `apps/aura-clash-showcase` (2 files) |

- [x] **Step 1 — characterization tests on both.** `tests/unit/audio/audio-characterization.test.ts`
      (12 tests, all pass). Covers context lifecycle, lazy/stable mixer identity, dispose
      semantics, effect validation, cue dispatch, bus volume, mute, unlock.
- [x] **Step 2 — choose the survivor from evidence.** **Evidence says: keep both, because
      neither is a reimplementation of the other.**
      - `packages/audio` is a **graph** API: `AudioContextManager` (context lifecycle,
        synthesised `"locked"` state, `unlock`/`suspend`/`resume`/`dispose`), `AudioMixer`,
        buses, effects, spatialization, waveform, timeline.
      - `GameAudio` is a **cue** API: named cues typed per route, per-bus volume, mute, and
        **every operation returns evidence** that the route-health harnesses consume. It
        exposes no mixer and no context lifecycle beyond unlock/dispose.
      - Asserted in `audio-characterization.test.ts` ("the two layers expose disjoint
        concepts") so the distinction cannot silently erode: `AudioSystem` has no `cue`/
        `evidence`; `GameAudio` has no `mixer`/`suspend`.
      - **This is a layering relationship, not duplication.** The correct 1.6 end state is
        `GameAudio` delegating its graph work to `packages/audio` instead of calling
        `createGain` directly — one owner for the graph, one owner for cues.
- [x] **Step 3 — inspect before deleting. "Web Audio already provides the node" is not
      sufficient grounds.** **Inspection confirmed by test, not by reading:**
      `Reverb.ts` (30 lines) wraps `createConvolver` with `setImpulse` and a `dispose` that
      **nulls the buffer** — an impulse response is typically the largest buffer in an audio
      graph, so this is a real leak fix. `Filter.ts` (39) wraps `createBiquadFilter` with
      `setFrequency`/`setQ` that **throw on non-finite/zero/negative** input, where a raw node
      silently accepts NaN and produces a filter that does nothing. Both implement the shared
      `AudioEffect` interface, which is what lets a heterogeneous chain hold either.
- [x] **Recommendation confirmed: keep both effects.** Not pure aliases; they carry disposal
      discipline, input validation and interface conformance. All three properties are now
      pinned by assertions.
- [x] **Proof: one `AudioContext` owner.** `tests/unit/audio/audio-context-ownership.test.ts`
      (3 tests) scans `packages`, `apps`, `examples` for context construction and allows only
      enumerated owners with written justification. Result: **exactly two sites.**
      1. `packages/audio/src/AudioContextManager.ts` — THE owner.
      2. `apps/aura-clash-showcase/.../AuraClashArenaApp.ts` — **a genuine violation, found by
         this test.** The route imports `createGameAudio` *and also* hand-rolls
         `createAudioRuntime()` with its own raw `AudioContext`, buffer cache and fetch loop.
         Per **R3** the fix belongs in P5 (WS-5.3) as a route rebuild through the shared
         runtime, not as a P3 patch. The allowlist entry asserts `KNOWN VIOLATION` and
         `WS-5.3`, so if anyone fixes the route the test **fails** and forces the entry's
         removal — the exception cannot quietly become permanent.
- [x] **`examples/game-slice` unchanged in behaviour** — no source touched in this workstream;
      only tests added.

**R12 correction (second one).** The audit listed audio as a duplicate-ownership violation.
Measurement shows it is a **layering gap**, not duplicate ownership: two disjoint APIs at
different levels, plus one route-local violation. R12's exit condition is met for the library
by making `GameAudio` delegate to `packages/audio`; the route-local raw context is tracked as
a P5 obligation. **R12 violations 4 → 3.**

### WS-3.3 `packages/ecs` and `packages/scripting` — **R8 REFUSED DELETION. Both are retained.**

> **This workstream inverted.** It was written to delete both packages on the premise that they
> had "0 consumers." R8 was run before any `git rm`, exactly as the rule requires, and it
> **refused the deletion**: `tests/reports/deletion-safety-ws33-final.json` reports **61 of 68
> files blocked across 300 references**, spanning three of the six R8 dependency points —
> `runtime-consumer`, `public-package-export-dependency`, and
> `documentation-generator-dependency`. This is R8 doing its job on the exact case that
> motivated it. Per **R6**, 7,317 lines are an observation, not a mandate to delete.

**The premise was wrong on four independent counts. Measured 2026-08-05:**

1. **Both are PUBLIC published subpaths.** Root `package.json` maps `./ecs` →
   `./dist/ecs/index.js` and `./scripting` → `./dist/scripting/index.js`. Deleting them is a
   breaking removal of two documented entry points, not an internal cleanup.
2. **`packages/engine` re-exports ECS from its own public barrel.** `engine/src/index.ts:61`
   is `export * from "./ecs/ECSRenderSource.js"`. The claim "only `ECSRenderSource.ts` imports
   it" was true and *inverted the conclusion*: that file is the bridge putting ECS on the
   public engine API.
3. **`packages/scripting` has a live app consumer.** `apps/editor/src/panels/VisualScriptPanel.ts:1`
   imports `createVisualNode`, `listVisualNodeDefinitions`, and `VisualGraphExecutor`, and
   `apps/editor/src/EditorShell.ts:12,116,157` constructs the panel as a permanent shell
   fixture. The editor's visual-scripting panel stops compiling the moment the package leaves
   the tree. "0 `engine` references" was literally true and strategically irrelevant —
   nothing said the consumer had to be `engine`.
4. **`scripting` is proven by a real production-path browser harness — it is not dead code.**
   `tests/browser/runtime-external-parity.spec.ts` drives a live WebGL2 route and asserts
   `oldBranchBehaviorTreePort`, `oldBranchGoapPlannerPort`, `oldBranchHtnPlannerPort`,
   `oldBranchUtilityAiPort`, `oldBranchDecisionTreePort`, `oldBranchStateMachinePort`,
   `oldBranchPerceptionPort` and `oldBranchWeaponSystemPort` against `window.__AURA3D_GAME_DEMO__`.
   Nine parity rows cite `packages/scripting/src/*` as evidence. Under **R1** this is
   the strongest evidence class in the repository — a public-entry browser test on the real
   renderer. **Deleting it would have deleted satisfied R1 claims and forced nine parity rows
   to `unproven`.** `tests/browser/fixtures/workspace-vite-imports/main.ts:6,13` additionally
   imports both packages through a real Vite bundle, proving they survive production bundling.

**The four apparently-cleared files are an artifact of whole-set evaluation, not a green light.**
R8 cleared `packages/ecs/src/systems/{ActiveSystem,HierarchySystem,TransformSystem,index}.ts`
only because every *other* member of the set was being deleted in the same batch.
`packages/ecs/src/index.ts:25` is `export * from "./systems/index.js"`, and that barrel is
retained — so all four are reachable from a kept public entry point. **True deletable count in
this workstream is 0 source files** (`packages/scripting/README.md` and `tsconfig.json` are
cleared but must stay, since the package stays).

- [x] **R8 run before deletion; deletion refused.** Report:
      `tests/reports/deletion-safety-ws33-final.json` — 61/68 blocked, 300 references.
- [x] **`packages/ecs` (1,480) — RETAINED.** Public `./ecs` subpath; re-exported through
      `engine/src/index.ts:61`; 43 references block `src/index.ts` alone.
- [x] **`packages/scripting` (5,837) — RETAINED.** Public `./scripting` subpath; live
      `apps/editor` consumer; 8 production-path browser assertions; 94 references block
      `src/index.ts` alone.
- [x] **No `pnpm-workspace.yaml` / root `exports` / publish-list change.** Both `./ecs` and
      `./scripting` remain published. No breaking API removal in 1.6 from this workstream.
- [x] **No `archive/1.5/` graveyard created** — the escape hatch the original row reserved for
      "if R8 finds a live dependency" is moot, because nothing is leaving the tree.
- [x] **`docs/architecture/removed-in-1.6.md` not created by this workstream** — it has
      nothing to record. WS-3.4 owns the one genuine removal in P3.
- [x] **Proof of retention:** `pnpm build` and `pnpm typecheck` pass with both packages
      present; `pnpm -r list --depth -1` lists both; the nine `scripting` parity rows keep
      their R1 evidence.

**Two real defects survive this reversal and are re-homed rather than dropped.** Retaining a
package is not the same as endorsing everything in it:

- [x] **§A "what Aura3D is NOT" is now partly contradicted by shipped public API.** *(resolved:
      §A amended with two evidence-forced qualifications; `docs/architecture/adr/0001-retain-ecs-and-scripting.md` landed, status accepted)* The list
      names "an ECS research framework" and "a behaviour-tree / GOAP / HTN AI framework" as
      things Aura3D is not, yet both ship as documented entry points with live consumers.
      Resolve the contradiction **in the philosophy, not by deleting proven code**: these are
      *game-kit-layer* capabilities above the renderer, not engine subsystems competing with
      Rapier or Yuka. Amend §A to say Aura3D does not build *speculative* simulation
      subsystems, and that ECS/behaviour authoring is retained where a public consumer and
      production-path evidence exist. **R11's four questions get answered retroactively in an
      ADR** (`docs/architecture/adr/`) rather than by a deletion that R8 forbids.
- [x] **The 8 `scripting` fixture files (2,079 lines) no longer "travel with WS-3.3."** *(resolved:
      §9 bucket renamed to "returned to extraction queue", reassigned to WS-3.5, no delete commitment)* With
      the package retained, they return to the WS-3.5 extraction queue and the §9
      "undecided — pending R8" bucket. Each needs its own report. **No commitment to delete.**
### WS-3.4 Delete stub compatibility implementations

`packages/rendering/src/threejs-compatibility/` — 354 lines, 0 consumers, actively
misleading: `SceneRenderer.ts:19-33` returns hardcoded
`{ meshes: 72, instances: 12000, skinnedMeshes: 4, transparentObjects: 18 }`.

**Two PRD figures are wrong, and the second changes the shape of the work.** Measured 2026-08-05:

- **49 files / 1,033 lines, not 11 / 354.** The row names the ten top-level modules and misses the
  `performance/` (9), `postprocess/` (15), `shaders/` (7) and `vfx/` (7) subdirectories, which the barrel
  re-exports wholesale (`rendering/src/index.ts:385-387`).
- **Not "0 consumers".** `createThreeCompatRenderer` is imported by **10 apps** and referenced by
  `packages/three-compat/src/migration/{ThreeToA3DAdapter,CompatibilityWarnings}.ts`, plus 4 unit suites
  and ~8 browser specs.

**And the fabrication is deeper than the row records.** `SceneRenderer.ts:19-33`'s hardcoded
`{ meshes: 72, instances: 12000, ... }` is one of three:

```ts
// ThreeCompatRenderer.ts:44 — a "screenshot" that is a string
captureScreenshot(): string {
  return `a3d-three-compat-capture://${this.backend}/${w}x${h}`;
}

// :48 — device-loss "recovery" that sets the flag and immediately clears it
handleDeviceLost(reason: string) {
  this.lost = true;
  this.lost = false;
  return { recovered: !this.lost, reason };   // always true
}
```

**`ThreeCompatRenderer` touches no GPU at all.** No device, no context, no draw call — a tree of
bookkeeping objects reporting success. Its unit test asserts
`summary.canClaimRendererBreadth === true` and `plan.sceneComplexity.instances >= 10000` against those
constants. That is precisely the defect class P1 deleted, one layer deeper, and it is the reason this
row exists rather than being cosmetic cleanup.

The 10 consuming apps are **4-line stubs** — import, construct, set a `dataset` attribute, log the fake
capture URI. They are not routes a developer would recognise; they exist to give the fabricated renderer
a consumer, which is how it passed the "parity requires a consumer" rule.

- [x] Run R8 on all 11 files — **run on all 49**, report committed at
      `tests/reports/deletion-safety.json`. Result: **49 of 49 BLOCKED**, which is the correct answer and
      is why this is staged rather than deleted in one step. 141 blocking references are internal to the
      directory (expected — the modules import each other), and the rest reach the barrel, the 10 stub
      apps, `packages/three-compat`'s migration adapter, and the test suites above.

      **A tool calibration note, recorded because it would otherwise mislead the next reader:** part of
      the external count is basename over-matching. `BloomPass.ts`, `SSAOPass.ts`, `RenderPass.ts` and
      `ParticleSystem.ts` each exist in three or four directories (`rendering/postprocess/`,
      `rendering/production-runtime/postprocess/`, `rendering/cinematic/` and the compat tree), so a
      reference to the *real* one is attributed to the compat one. That inflates the report and does not
      change the conclusion — the genuine consumers listed above are enough to block on their own.
- [x] `git rm` the directory — **done, after the consumers.** 97 files / 1,929 lines removed in total.
- [x] Delete the 10 stub apps: `three-compat-{scene-studio-pro,asset-studio-pro,controls-lab,animation-studio-pro,large-scene-lab,postprocess-studio-pro,material-studio-pro,product-studio-pro,shader-lab-pro,threejs-migration-lab}`.
      These are Tier 4 under P5's classification — 4 lines each, no interaction, no evidence beyond a
      fabricated string. — **done. Routes 149 → 139.**
- [x] Delete the tests that assert on the fabricated values:
      `tests/unit/rendering/three-compat-{renderer-three-compat,postprocess,shaders,vfx}.test.ts` and the
      matching browser specs. **These are not tests being weakened to pass (R2)** — they assert that a
      hardcoded constant equals itself, so they cannot fail and prove nothing. Deleting them removes a
      false green, which is the opposite of weakening a gate. — **done: 4 unit suites and 16 browser
      specs.** Two of the specs are worth naming because they are the same defect one level out:
      `three-compat-large-scene.spec.ts` fed `runThreeCompatFrustumCulling(12000)` and
      `new InstancingThreeCompat(50000)` — synthetic counts — into a Canvas-2D drawing, and
      `three-compat-raycast-bvh.spec.ts` asserted `speedup > 100` on a number returned by a function
      literally named `estimateThreeCompatAcceleratedRaycast`.
- [x] Also deleted, found by following the type errors: **five readiness gates and a performance
      baseline** that existed only to measure the stubs —
      `tools/three-compat-{renderer,shader,vfx,postprocess,performance}-readiness/` and
      `tests/performance/three-compat-performance-baselines.ts`, the latter reporting `cpuFrameMs: 11.4`
      as a literal beside synthetic object counts. Their `package.json` scripts and their entries in the
      `three-compat:release` aggregate are removed too, so the release chain no longer runs gates that
      cannot fail.
- [x] Repoint `packages/three-compat`'s migration adapter, which rewrites `new THREE.WebGLRenderer` to
      `createThreeCompatRenderer` — i.e. it currently advises migrating developers onto the fake. It must
      point at a real renderer. — **the aliasing re-exports are removed** (`./postprocessing`,
      `./shaders`), which is the part that mattered: this package is the migration on-ramp, and it was
      **offering a migrating Three.js developer a path onto a fabrication.** A migration target that does
      not render is worse than none — it converts working Three.js code into non-working Aura3D code and
      reports success. Everything real in the package stays: the API inventory, import map, animation,
      controls, loader, material and geometry adapters, and `migrateThreeToA3D`.

      Re-aliasing the **real** passes from `production-runtime/postprocess/` is left as its own decision
      rather than done reflexively here: three of the ten aliases (`DepthOfFieldPass`, `EffectComposer`,
      `TAAPass`) have no real equivalent yet, so a blanket re-alias would recreate the same problem with
      a different import path.
- [x] **Keep `packages/three-compat/` — different thing, real, and the migration on-ramp.** — confirmed
      and worth stating: `packages/animation/src/threejs-compatibility/` is **also** a different thing and
      also real (`AnimationMixerThreeCompat`, `SkeletonThreeCompat`, `MorphTargetMixerThreeCompat` — the
      symbols WS-1.6 found the parity generator was failing to grep). Only
      `packages/rendering/src/threejs-compatibility/` is the fabrication.
- [x] Remove the re-export from `packages/rendering/src/index.ts` — 5 lines (`:368`, `:384-387`). —
      done, replaced by a comment recording the three fabrications so the next reader does not restore it.
- [x] **Proof:** `git grep -n "ThreeCompatRenderer" -- packages apps examples` empty. — confirmed.
      `pnpm typecheck` exit 0; **3,159 unit tests pass** (the 7 remaining failures are the pre-existing
      stale-evidence set, verified unchanged); `check:claim-lineage` EXIT=0; routes 149 → 139.

### Five consequences worth recording

1. **The lineage gate caught a claim that had been proven by a fabrication.** `custom shaders` named
   `three-compat-shader-lab.spec.ts` as its production-path test — a spec that constructed a
   `ShaderMaterialThreeCompat` and then drew a **Canvas-2D gradient**. No shader was ever compiled.
   Deleting the tree left the row with no evidence, and `check:claim-lineage` failed immediately with
   *"named evidence does not exist"*. Repointed to WS-2.8's renderer-extension spec, which compiles a real
   shader through the public `ShaderModule` and asserts it changes the framebuffer. **This is R1 working
   as intended:** removing a fake broke a claim that depended on it, loudly.
2. **A Vitest alias-ordering bug, the same one as WS-2.2.** `@aura3d/engine/media-node` was declared
   *after* the bare `@aura3d/engine`, and Vitest matches string aliases by prefix in declaration order —
   so it resolved to `packages/engine/src/index.ts/media-node` and
   `render-quality-phase-m.test.ts` could not load at all. Subpaths now sit above the bare specifier, with
   a comment. **Second occurrence of this trap; it does not fail at typecheck.**
3. **Two honest uses of the word "unavailable" tripped a placeholder audit.**
   `runtime-edge-coverage.test.ts` greps runtime source for `unavailable|placeholder|stub|deferred` against
   an allowlist, and WS-2.7's occlusion comments legitimately describe the test being absent. Allowlisted
   with justification rather than reworded: renaming a parameter to dodge a grep would make the code
   describe its own behaviour *less* accurately to satisfy a lint.
4. **The bundle did not shrink, and that is the correct outcome.** Scenario 1 measured **2.110x before and
   2.124x after** — a 1,929-line deletion moved it by ~0.6%, in the wrong direction. The compat tree
   **never appears in the bundle report's per-package attribution**, because esbuild was already
   tree-shaking it: nothing a cube reaches actually constructed those classes. So this deletion buys
   trustworthiness and maintenance, not bytes. Reporting it as a bundle win would have been the same kind
   of claim this workstream exists to remove.

5. **A phantom export subpath survived the deletion, and the gate that forbids it was never wired in.**
   Found while auditing the release chain: root `package.json` still exposed
   `"./three-compat": "./dist/three-compat/index.js"` even though `files` deliberately excludes
   `dist/three-compat` and `@aura3d/three-compat` ships as its own package. So `@aura3d/engine/three-compat`
   resolved for anyone running from the worktree and `ERR_PACKAGE_PATH_NOT_EXPORTED` for every installed
   consumer — a broken subpath advertised to exactly the migrating Three.js developers WS-3.4 was
   protecting. `tools/verify-imports/` reported it `ok` with `exportCount: 108` because it resolves
   against the local tree, where `pnpm build` had populated `dist/three-compat/`; the tarball never
   contained it.

   `tools/package-no-three-runtime/index.ts` already asserted this exact condition in two of its 11 checks
   (`root-exports-no-three-compat-subpath`, `pack-no-dist-three-compat`), but **no `package.json` script
   ran it** — the tool existed, encoded the right rule, and was orphaned. Fixed both halves: removed the
   subpath, and added `check:no-three-runtime` to the `check:release` chain so the rule is enforced rather
   than merely written down. Verified load-bearing: against `HEAD`'s manifest the check returns `false`;
   after the fix all 11 pass and the export surface drops 43 → 42 subpaths with no other entry affected.
   **Same shape as WS-1.1** — the gate was not weak, it was unreachable.

### WS-3.5 Fixture files — dependency proof per file — **COMPLETE (2026-08-05). R8 refused every deletion.**

38 files, 10,720 lines. Revision 1 assumed these were deletable scaffolding and
listed 10,720 lines as removal. **R8 cleared none of them.**

`check:deletion-safety` ran on all 38. Result: **30 blocked on public-API grounds** —
every one is re-exported from its package barrel and appears in the generated
`docs/api/public-api.md`. The other 8 were blocked on internal consumers. Deleting any
would have removed a published export, which R7 forbids.

- [x] Ran `check:deletion-safety` on all 38 and committed the report before touching
      anything. The report was the gate, and it said no.
- [x] Deleted nothing. Zero of 38 cleared all six points.

**What these files actually are.** Not descriptor objects — deterministic procedural
generators consumed by readiness tools and browser evidence. `TerrainFixtures.ts`
exports `createTerrainHeightfieldGeometry`; `OceanFixtures.ts` generates a Gerstner
displacement surface. The `Fixtures` suffix was the defect: it implied test scaffolding,
so three consecutive audits (including revision 1 of this PRD) read them as dead code
and proposed bulk deletion of working production generators.

**Action taken instead of deletion — 8 renamed to their real responsibility:**

- [x] `rendering/OceanFixtures.ts` → `OceanSurface.ts`
- [x] `rendering/TerrainFixtures.ts` → `TerrainHeightfield.ts`
- [x] `rendering/VegetationFixtures.ts` → `VegetationScatter.ts`
- [x] `rendering/ProceduralTextureFixtures.ts` → `ProceduralTexture.ts`
- [x] `rendering/ProductTurntableFixtures.ts` → `ProductTurntable.ts`
- [x] `rendering/CanonicalSceneFixtures.ts` → `CanonicalProductScene.ts`
- [x] `animation/SecondaryAnimationFixtures.ts` → `SecondaryAnimationSampling.ts`
- [x] `input/InputActionBindingFixtures.ts` → `InputActionBinding.ts`
- [x] Every exported symbol name unchanged — no public export removed (R7).
- [x] Updated the 8 readiness tools and 1 browser spec that name these paths as evidence.
- [x] Regenerated `docs/api/public-api.md` (29 packages, 1,003 export declarations, 0 violations).

The extraction step revision 1 demanded ("extract the used generation code, then delete
the descriptor") was unnecessary: there was no descriptor to delete. The used code was
the whole file.

**Dependent test cleanup — cancelled, and this was the right outcome:**

- [x] `tests/browser/runtime-external-parity.spec.ts` — **cases retained.** Revision 1
      wanted :266-287 and :591-702 removed. But `expect(clothBlockedClaims).toContain(
      "Unity Cloth parity")` is a test that the engine **declares what it cannot do**.
      Under R1 that is exactly the right kind of assertion and deleting it would remove
      a guard against overclaiming. Only the renamed evidence path was updated.
- [x] `examples/game-slice/main.ts` — flags retained for the same reason.
- [x] No names removed from any `index.ts` / `browser-index.ts`; all re-exports preserved
      under the new filenames.
- [x] **Proof:** `pnpm typecheck` pass · `pnpm verify:api-docs -- --write` 0 violations ·
      `tests/unit/tools/api-docs.test.ts` 3 passed · commit `02d1a6b1`.

**30 files remain named `*Fixtures.ts`.** They are retained and public. The physics group
(Cloth 359 · FireSmoke 382 · Fluid 301 · Fracture 277 · SoftBody 363 · PhysicsSandbox 394)
is deliberately deferred to P4: those encode blocked-claim declarations tied to the solver,
so the backend bake-off (WS-4.2) decides their fate, not a filename audit.

**§9 correction:** the "38 fixture files — 10,720 lines — delete" row is now
**0 lines deleted, 8 files renamed, 30 retained**.

### WS-3.6 Package boundaries — split into four workstreams

Revision 2 bundled documentation, lint enforcement, six package removals and possible core
restructuring into one workstream. That is several workstreams and carries real risk.

**Critical correction.** Revision 2 listed `core`, `materials`, `environments`, `apps`,
`editor` and `test-utils` as "zero-consumer shells" to consolidate or remove based on *app*
consumer counts. Measured 2026-08-05:

| Package | Depended on by (package.json) | Root `exports` |
|---|---|---|
| `core` (1,186) | `apps`, `core`, `animation-studio` template, `ecs`, **`engine`**, `scene` | `./core` **PUBLIC** |
| `apps` (162) | `apps`, **`engine`** | `./apps` **PUBLIC** |
| `materials` (360) | self only | `./materials` **PUBLIC** |
| `environments` (469) | self only | `./environments` **PUBLIC** |
| `editor` (1 line) | self only | `./editor` **PUBLIC** |
| `test-utils` (62) | self only | not exported |

**All six except `test-utils` are public API subpaths, and `core` is a transitive
dependency of five packages including `engine`.** Deleting on app-consumer count would
have broken the published surface. Low direct app usage does not mean unused.

#### WS-3.6a Dependency graph and ownership rules — **DONE**

- [x] Documented owner + allowed dependency direction per package. `DESIGN.md` §8 carries the
      tier table and the four rules; the per-package record (owner, tier, LOC, public subpath,
      dependency union) lives in `docs/architecture/package-ownership.md`, which §8 links as
      canonical. Split because `DESIGN.md` is the showcase visual system and a 27-row source
      table does not belong inside it.
- [x] Published the actual current graph as committed evidence — `tools/package-graph/index.ts`
      (583 lines) writes `tests/reports/package-graph.json` and
      `docs/architecture/package-graph.dot`. It measures **two** edge sets separately because they
      disagree here: **declared** (`@aura3d/*` in `dependencies`/`peerDependencies`) and **source**
      (`@aura3d/...` specifiers actually imported under `packages/*/src`). Subpaths are resolved
      through `tsconfig.base.json` `paths`, not by prefix — `@aura3d/engine/rendering` aliases to
      `packages/rendering/src/index.ts` and does **not** resolve into `packages/engine`; attributing
      it to `engine` invents cycles that do not exist.
- [x] **Proof:** `pnpm check:package-graph` — 7/7 PASS, 27 packages, 0 undeclared, 0 cycles,
      0 layer violations, 0 doc gaps, 6 over-declarations reported as weight.
- [x] **`pnpm -r list` was rejected as the proof source and replaced with something stronger.**
      `pnpm -r list --depth 0 --json` derives its output from the same `package.json` files being
      audited, so comparing them is circular and always passes. The gate instead compares each
      manifest against `pnpm-lock.yaml`'s `importers` block (what `--frozen-lockfile` installs)
      **and** the `@aura3d` symlinks actually on disk under `packages/*/node_modules/`. Check
      `install-graph-matches-manifests` PASSes across all 27.
- [x] Doc-drift is machine-enforced: `ownership-doc-documents-every-edge` fails if
      `package-ownership.md` omits a measured edge or documents one that no longer exists.

#### WS-3.6b Lint enforcement — COMPLETE

- [x] Extend the ESLint boundary rule (already blocks `@aura3d/*/src/*`) to forbid upward
      dependencies per WS-3.6a.
- [x] **Proof:** `pnpm lint` passes; a deliberately-added upward import fails it.

**Finding — the pre-existing rule enforced nothing.** The claim that ESLint "already blocks
`@aura3d/*/src/*`" was false in practice. `eslint.config.js` declared no parser for `.ts`,
so every TypeScript file in the repository was skipped; the `no-restricted-imports` patterns
matched only the handful of `.mjs`/`.js` tool files. `pnpm lint` had been passing for that
reason, not because boundaries held. This is the same class of defect as the P1 fabricated
gates: a green check whose scope was empty.

Delivered:

- `tools/eslint-plugin-aura3d-boundaries/index.mjs` — two real rules,
  `no-upward-package-import` and `no-internal-deep-import`. Tiers are read from
  `tools/package-tiers.ts`, the **same module** `tools/package-graph/index.ts` reads, so the
  lint rule and the graph gate cannot disagree.
- Subpath specifiers resolve through `tsconfig.base.json` `paths`, never by prefix.
  `@aura3d/engine/rendering` aliases into `packages/rendering` (tier 2), not `packages/engine`
  (tier 5); a prefix implementation would report violations that do not exist and miss ones
  that do.
- An `@aura3d/*` specifier that cannot be attributed to a tier is now reported as
  `unresolved` rather than skipped. Skipping unknowns is precisely how the old config
  enforced nothing.
- `@typescript-eslint/eslint-plugin@8.66.0` installed. Template sources carry
  `eslint-disable-next-line @typescript-eslint/...` directives that referenced an unknown
  rule once a parser existed. No `@typescript-eslint` rule is enabled — this is a boundary
  workstream, and switching on a style ruleset would mix an unrelated large diff into it.
- `packages/*/tests/**` is exempt from tier direction. `editor-runtime`'s suite drives the
  real `@aura3d/engine` runtime to prove the integration works; that edge is devOnly and
  ships to nobody. Enforcing tier order there would force the test to mock the aggregate it
  exists to verify.
- `pnpm lint` added to `check:release`. It was absent, so the rule could not have blocked a
  release.

Proof:

- `pnpm lint` → exit 0, **0 errors** (12 pre-existing unused-disable warnings) — now
  actually covering every `.ts` file.
- Deliberate upward import at `packages/math/src/__ws36b_probe.ts` importing `@aura3d/engine`
  → `eslint` exit **1**: `math (tier 0) may not import engine (tier 5)`. Probe removed.
- `tests/unit/tooling/eslint-boundaries.test.ts` — 9 passing tests asserting on reported
  message ids: up-tier reported, down-tier allowed, alias-resolved subpath allowed,
  unknown specifier reported, re-exports and dynamic `import()` covered, non-`packages/`
  files ignored, deep `src/` import reported, public subpath allowed, and the tier map
  shared with the graph gate. Two of these failed on first run and exposed the unresolved
  gap above — the rule was fixed, not the test (R2).
- `pnpm check:package-graph` → 4 PASS, 0 layer violations.

#### WS-3.6c Zero-consumer audit — classify, do not delete — COMPLETE

- [x] For each of the six: is it public API, a dependency layer, or genuinely dead?
      Use the table above as the starting evidence, not app-import counts.
- [x] **Proof:** committed classification with the public-export and transitive-dependency
      status of each.

**Method.** App-import counts were discarded as the criterion, per the workstream. Four
independent signals were measured per package: (1) whether a root `exports` subpath resolves
to it, (2) whether a *published* install can import that subpath, (3) which workspace
manifests declare it as a dependency, (4) real source importers, excluding
`tests/reports/**`, `node_modules/**` and `dist/**`, which inflate every naive grep by
3-20x (`core` reads as 97 importers unfiltered, 50 filtered; `materials` 25 unfiltered,
**4** filtered).

Signal 2 is the load-bearing one and it corrected the starting table. The root `exports`
map points at `./dist/<pkg>/`, **not** `packages/<pkg>/`, so a scan for `packages/core/`
inside `exports` returns nothing and would have wrongly cleared all six as unexported. The
authoritative check is resolution from an installed tarball:

```
$ node probe.mjs          # @aura3d/engine installed from a file: dependency
OK   ./core          exports=22   Diagnostics, DisposableStack, Engine, EngineError, EngineLoop, EventBus, ...
OK   ./apps          exports=3    A3D_APP_WORKFLOW_PRESETS, createA3DApp, resolveA3DAppQualityPreset
OK   ./materials     exports=14   MATERIAL_PRESETS, NodeMaterial, THREE_COMPAT_PBR_MATERIAL_LIBRARY, ...
OK   ./environments  exports=12   createProductionEnvironmentCorpusSummary, createThreeCompatEnvironmentDiagnostics, ...
OK   ./editor        exports=74   AnimationSceneEditor, AssetDropZone, CameraPathEditor, CommandHistory, ...
FAIL ./test-utils    ERR_PACKAGE_PATH_NOT_EXPORTED
```

Five of the six ship to users and are importable today. `test-utils` is `"private": true`,
has no `exports` subpath, and has no `dist/` output.

**Classification.**

| Package | src lines | Public subpath | Resolves when installed | Declared as a dep by | Real source importers | Class |
|---|---|---|---|---|---|---|
| `core` | 1,186 | `./core` | 22 exports | `ecs`, `scene`, `engine`, `apps` (+ root devDep) | 50 | **public API + dependency layer** |
| `apps` | 162 | `./apps` | 3 exports | `engine` (+ root devDep) | 13 | **public API + dependency layer** |
| `editor` | 1 | `./editor` | 74 exports | root devDep | 7 | **public API, re-export shim** |
| `materials` | 360 | `./materials` | 14 exports | — | 4 | **public API, no internal consumer** |
| `environments` | 469 | `./environments` | 12 exports | — | 4 | **public API, no internal consumer** |
| `test-utils` | 62 | none | `ERR_PACKAGE_PATH_NOT_EXPORTED` | — | 4 | **internal only** |

**None of the six is dead.** The two that looked deadest by app-import count —
`materials` (4) and `environments` (4) — are precisely the two with *no internal consumer
at all*, which means every one of their 26 combined exports exists only to be imported by
an outside developer. Low internal usage is what a leaf public API looks like; it is the
opposite of evidence for deletion. `editor` is a single line, `export * from
"@aura3d/editor-runtime"`, and that one line is the delivery mechanism for 74 editor
symbols; deleting the file removes the whole `./editor` surface.

**`test-utils` is internal but still not free to delete.** R8 blocks it:

```
$ pnpm check:deletion-safety packages/test-utils/src/index.ts
BLOCKED  packages/test-utils/src/index.ts: 8 blocking reference(s) —
  runtime-consumer @ tools/browser-entry-purity/index.ts:81;
  runtime-consumer @ tools/bundle-scenarios/index.ts:207;
  runtime-consumer @ tools/foundation-api-audit/index.ts:97;
  runtime-consumer @ tools/foundation-api-audit/index.ts:98;
  runtime-consumer @ tsconfig.base.json:149; runtime-consumer @ tsconfig.base.json:150 ...
exit 1
```

Three release tools enumerate the package by name and a `tsconfig.base.json` path alias
resolves it. This is the R8 rule doing its job on the package the starting table called
"the only straightforward candidate": straightforward in *export* terms, not in
*dependency* terms. Removing it means editing three tools and the base tsconfig first,
which is a WS-3.6d decision with its own commit, not a `git rm`.

**Consequence for WS-3.6d.** Zero packages are cleared for deletion by this audit. Five
require a deprecation path through §12 and `MIGRATION-1.6.md` if they are ever to be
removed; one requires tool changes first. The 3,363-line figure in §9 stands as an
observation only (R6), and its "not removal candidates" verdict is now proven rather than
assumed.

#### WS-3.6d Per-package consolidation decisions

- [ ] One decision, one commit, per package. Under R8 and R7.
- [x] **`core` and `apps` are not candidates for removal in 1.6** — `engine` depends on both.
      Confirmed in WS-3.6c: `core` is a declared dependency of `ecs`, `scene`, `engine` and
      `apps`; both also resolve as public subpaths from an installed tarball.
- [x] `materials`, `environments`, `editor` are public exports: removal is a **breaking
      change** feeding §12, and requires a deprecation path, not a delete. Confirmed: 14,
      12 and 74 exports respectively resolve from an installed `@aura3d/engine`.
- [x] `test-utils` (62, not exported) is the only straightforward candidate — **corrected by
      WS-3.6c**: it is the only *unexported* package, but R8 blocks deletion with 8 blocking
      references (3 release tools plus a `tsconfig.base.json` alias). Not a delete; a
      tool-edit decision. Deferred: it costs 4 file edits to remove 62 lines and buys no
      bundle, parity or friction improvement, so it loses to every remaining P2/P4 item.
- [ ] **Proof:** `pnpm build && pnpm typecheck` after each; no public subpath disappears
      without a `MIGRATION-1.6.md` entry.

## PHASE 4 — Physics re-platform

**The bake-off chooses the architecture. This PRD does not.** Revision 1 pre-committed to
"Rapier production + Cannon deprecated + Aura arcade"; that is withdrawn. Multiple
backends sound flexible and can become a permanent compatibility burden. Aura3D may be
better with **one** production backend plus **one explicitly non-physical arcade-motion
system** — which is not a "physics backend" and should not be described as one.

Established facts (not conclusions): `cannon-es` is imported in **exactly one file**
(`PhysicsWorld.ts`) of 12,631 lines; a second solver exists
(`PhysicsBackend = "cannon-es" | "aura-js"`, :66); our own comment at :682-685 records
joints being "a silent no-op" on the default backend while the other branch solved them —
tests green on a path users never take; `cannon-es` exports `RaycastVehicle` and
`grep` across `packages/`+`apps/` returns **empty** while we wrote 1,081 lines
(`VehicleDynamics.ts` 553 + `VehicleMotion.ts` 528) instead; and `game.racing` does not
use them.

### WS-4.1 Backend-neutral public contract

- [x] Define in `packages/physics/src/index.ts`: bodies, colliders, joints,
      raycast/shapecast, character controller, vehicle, deterministic stepping.
      — the barrel is now the contract: all seven areas named, each grouped with the
      modules that satisfy it, plus the above-solver layer (navigation/steering/bridges)
      and authored fixtures called out as *not* solver features. **The export set is
      byte-identical to before** (`diff` of sorted `^export` lines is empty), so this is
      documentation and grouping, not an API change.
- [x] No `cannon-es` or Rapier type in the public surface.
      — measured, not assumed: `cannon-es` is imported in exactly one file of the package
      (`PhysicsWorld.ts`) and **no exported declaration in any of the 35 modules mentions a
      `Cannon*` symbol**. Every public type (`Vec3`, `Quat`, `Bounds`, `PhysicsShape`,
      `RaycastHit`) is Aura3D's own plain-array type.
- [x] **Proof:** `git grep -n "cannon-es" packages/physics/src/index.ts` empty.
      — empty (exit 1). Retained as the floor, not the ceiling: the barrel is `export *`, so
      that grep cannot see a backend type leaking through a re-exported module's signature.
      `tests/unit/physics/backend-neutral-contract.test.ts` (5 tests) asserts the property
      instead — one solver importer, zero backend symbols in exported declarations, all
      seven areas reachable from the *built* surface, and deterministic stepping proven by
      two identical 120-step runs agreeing exactly rather than by a flag. It caught two real
      defects while being written: a type-only symbol in the coverage list, and this file's
      own explanatory comment naming the backend and thereby breaking the PRD's grep proof.

### WS-4.2 Bake-off — allowed to produce any of these outcomes

- [x] **Create** `tools/physics-backend-bakeoff/index.ts`. Score every candidate on:
      browser bundle size · WASM initialization cost · deterministic stepping across runs ·
      character-controller quality · vehicle-controller capability · Web Worker support ·
      API stability · raw performance · mobile behaviour · licensing.
      — 759 lines; `npx tsx tools/physics-backend-bakeoff/index.ts` constructs and steps
      **both** solvers. Dimensions that cannot be measured in Node (mobile behaviour) are
      emitted as `unmeasured` with a reason and **never scored** — R1 applies to this tool
      as much as to a parity row.
- [x] Use the existing 21 physics test files / 138 tests as correctness fixtures.
      — **the PRD's own count was stale.** The tool now *executes* the suite rather than
      quoting it (`existingSuite`, measured not asserted): `pnpm vitest run
      tests/unit/physics` = **30 files, 217 tests, all passing** — not 21/138. Hand-copying
      that number would have been the exact defect class R1 exists to prevent, so it is
      measured. Every downstream mention of "138" in this PRD is therefore wrong and is
      corrected to 217 where it appears.
- [x] **Permitted outcomes, explicitly:** Rapier only · Cannon only · Rapier plus a
      minimal kinematic mode · external physics adapters as separate optional packages ·
      **no multi-backend abstraction at all**.
- [x] Evaluate whether a multi-backend abstraction earns its permanent cost. If not, say so.
      — `abstractionVerdict`: **it does not.** Three dimensions measurably diverge (CCD,
      character controller, worker offload); each must be hidden (capability lost) or
      exposed (neutrality lost).
- [x] **Write the decision into `docs/architecture/physics-backend-decision.md` with the
      numbers before changing any solver code.**
      — written at `0b627db7`+1, **before** any `PhysicsWorld.ts` solver edit.
- [x] **Proof:** committed report; the selection justified per dimension; the
      multi-backend question answered explicitly either way.
      — `tests/reports/physics-backend-bakeoff/report.json` force-added past
      `.gitignore:43`. **Decision: one production backend, `cannon-es`; no multi-backend
      abstraction; `aura-js` removed, not fixed.** Rapier wins 6 of 13 dimensions and is
      the better solver — it is rejected on **delivered bytes**, which §B.1 makes a release
      gate: projected scenario-3 **0.662x (passes) vs 6.251x (fails)**. Its 16.6x step
      advantage is measured at 1000 bodies; the densest real route
      (`showcase-blockfall-reactor`, 10x22) tops out at **220**, where the whole advantage
      is **0.27 ms/frame = 1.6% of one frame**. The Rapier bundle figure is corrected *in
      Rapier's favour* (compat base64-inlines the wasm; fair non-compat delivery
      612,861 B gzip, still 22.7x). Dated revisit triggers are in the decision file.

### WS-4.3 Implement the chosen architecture

- [x] Implement whatever WS-4.2 selected, behind the WS-4.1 contract.
      — one production backend behind the WS-4.1 contract, which
      `tests/unit/physics/backend-neutral-contract.test.ts` proves the solver cannot leak
      through. The hardening this required is in commits `2c84c18d`..`4252ecbe`.
- [x] Fix or remove the `aura-js` path — the joint no-op divergence must not survive in
      any form. **Removed, not fixed.** `PhysicsBackend` is a one-member union;
      `disableCannonBackend` and the second integrator are deleted; `step()` no longer
      branches. Passing `"aura-js"` throws by name. Enforced by
      `tests/unit/physics/single-solver-ownership.test.ts` (7 assertions) and by the R12
      physics row now counting union members instead of grepping a string. R12: 3/5 → 2/5.
- [x] Only if WS-4.2 chose multi-backend: add compatibility backends with dated
      deprecations (R7). Otherwise do not build the abstraction. **WS-4.2 chose one
      backend, so no abstraction was built.**

**"All 217 tests pass" (measured; this PRD previously said 138) is necessary but insufficient — those tests were written around the
current solver's semantics and may encode its quirks.** Classify every existing physics
test before migrating:

- [x] **Contract tests** — must survive unchanged; they define the public promise.
      Measured: 114 of 114 rows `contract` in
      `tests/reports/physics-test-classification/report.json`. All 19 surviving
      `backend: "aura-js"` pins were rewritten to the production backend and pass unchanged.
- [x] **Implementation-characterization tests** — may encode old-solver quirks; each is
      either rewritten as a contract test or deleted with a recorded reason. Never retained
      as a constraint on the new backend by default. Measured: **0 characterization rows.**
      The 7 originally-failing cases were retired into backend-neutral contracts in commit
      `0ed7d1d3`; three fallback-only duplicates (a CCD tunnelling case and a force-
      integration agreement case in `ccd-or-fast-body.test.ts`) were deleted after folding
      their one unique assertion — the wrapper's own swept time of impact, which is Aura3D's
      and therefore solver-independent — into the production case.
- [x] **New cross-backend physical invariants** — written fresh, must hold on any backend.
      — `tests/unit/physics/production-backend-invariants.test.ts`, 16 tests, every one
      phrased as a physical property rather than a pinned number precisely so a future
      backend is judged on physics instead of digits.
- [ ] **Full-route behaviour tests** — end-to-end, per WS-5.3.

The selected backend must additionally prove all nine, none of which the historical 217
fully cover:

- [x] stacked-body stability — a 6-box stack holds for 4 s: no box slides more than its own
      width, none sinks or is ejected, six distinct layers survive in order, residual
      kinetic energy < 0.5. **This one failed and found the `solverIterations` default of
      `1` overwriting cannon's `10`; at the old default the stack collapsed completely.**
- [x] joint behaviour (the 1.5.x silent no-op class must be impossible) — a `fixed` joint
      holds a body above y=0.5 for 4 s where free fall reaches −18.8, asserted at 1, 4 and
      16 solver iterations so it cannot pass by virtue of a strong solve.
- [x] tunnelling / CCD under high velocity — a 240 m/s body stops at a 0.1-thick wall, and
      subdivision *scales with speed* rather than being a fixed count tuned for one case.
- [x] sleeping and waking — a settled body sleeps, and an impulse both wakes it and moves it.
- [x] deterministic repeatability across runs and sessions — two runs of a contact + rotation
      + joint scene are bit-identical, and two worlds stepped **interleaved** agree, which
      catches module-scope state a sequential comparison cannot.
- [x] character grounding — `grounded`/`groundNormal`/`slopeAngle` on a floor, not grounded in
      air, and a jump reaches >50% of its own ballistic ceiling `v²/2g` (the skyline-runner
      "barely jumps" symptom, stated as physics). **Found the capsule-as-cylinder defect:
      `grounded` was permanently false on any slope.**
- [x] slope and step movement — climbs a 0.18 step and stays grounded for ≥95% of the frames
      walked; measures 22.5° as 0.393 rad; classifies an 81.8° face as steep with a real
      normal. **Found two defects: queries ignored body rotation, and step-up oscillated
      against step-down.**
- [x] vehicle suspension — compression stays in [0,1] and *responds*: differs straight vs
      cornering, cornering vs drifting, and left vs right under steering (load transfer, not
      a ride-height offset).
- [x] browser initialization and disposal (including WASM init and teardown) — 5
      mount/step/teardown cycles land bit-identically, an emptied world still steps rather
      than throwing (unmount ordering is not guaranteed), and a mid-simulation removal does
      not disturb its neighbours. No WASM: the selected backend is pure JS, which is §B.1's
      reason for choosing it.

- [x] **Proof:** the test classification is committed; all nine invariants have named tests
      passing on the production backend, not a fallback.
      — classification at `tests/reports/physics-test-classification/report.json`; the nine
      at `tests/unit/physics/production-backend-invariants.test.ts`, and there is no longer
      a fallback for them to pass on. Four of the nine failed on first run, which is the
      point of writing them: `solverIterations` default 1 vs cannon's 10 · capsule built as a
      flat-ended cylinder · every raycast/spherecast ignoring body rotation · step-up
      oscillating against step-down. All four are library-level fixes in `packages/physics`,
      none in `apps/` (R3).

### WS-4.4 Retain the layer above the solver

Keep — game logic, genuinely ours, no external equivalent:

- [x] `RacingLineProfile.ts` (254) · `PathFollowDriver.ts` (279) · `SurfaceQuery.ts` (159)
      · `PhysicsDebugDraw.ts` (199) · `PhysicsStepper.ts` (47) ·
      `engine/src/agent-api/VehicleChassis.ts` (588) · telemetry · speed profiles ·
      semantic surfaces
- [x] **Proof:** their tests pass unchanged after the swap.
      — stronger than "pass": `git diff --stat ab71012e..HEAD -- packages/physics/src` (the
      whole of P4, from the WS-4.2 decision commit) touches **only** `PhysicsWorld.ts`,
      `Raycast.ts`, `RigidBody.ts`, `CharacterController.ts` and `index.ts`. Every file in
      this list is **byte-identical**, and `VehicleChassis.ts` is untouched too. 68 tests
      across `racing-line-profile` · `path-follow-driver` · `mesh-surface-query` ·
      `vehicle-mesh-contact` · `turbo-drift-real-circuit-contact` pass unmodified, which is
      the retention claim: the layer above the solver did not need to know the solver changed.

### WS-4.5 MeshBVH — audit by responsibility, do not assume duplication

**Correction to revision 1.** `MeshBVH.ts` (326) is not automatically physics duplication.
Measured consumers: `tests/unit/physics/mesh-surface-query.test.ts` (18 refs),
`SurfaceQuery.ts` (5), `tests/unit/physics/vehicle-mesh-contact.test.ts` (5),
`engine/src/agent-api/index.ts` (3), `GameSceneGeometryBindings.ts` (2),
`create-aura3d/src/showcase-spec-types.ts` (2), `PhysicsRuntime.ts` (1),
`turbo-drift-real-circuit-contact.test.ts` (1), plus a docs snippet.

- [x] Classify each consumer by responsibility: rendering queries · selection/picking ·
      static geometry analysis · asset admission · raycasting · spatial indexing ·
      physics contact.
      — table in `docs/architecture/meshbvh-responsibilities.md`, 11 consumer groups.
- [x] Only the physics-contact responsibility can be made redundant by a new solver. If
      other responsibilities remain, `MeshBVH` **stays** and possibly moves out of
      `packages/physics`.
      — **7 of 11 groups have nothing to do with contact.** Static geometry analysis
      (`SurfaceQuery`), asset admission (`GameSceneGeometryBindings`), public re-export,
      the `./physics/solverless` bundle boundary, the scaffold contract, a diagnostic
      message, and the docs generator. `MeshBVH.ts` imports exactly one symbol —
      `type Vec3` — and is unchanged across all of P4. **It stays.** It does *not* move
      yet: the move would break the `@aura3d/physics/solverless` subpath
      `GameSceneGeometryBindings` imports, for a cosmetic gain, mid-phase.
- [x] **Proof:** committed responsibility table; decision follows from it.

### WS-4.6 Navigation is independent of the solver swap

`Navigation` appears in 8 app files, `Crowd` in 5, `Steering` in 2 — unlike `scripting`,
this is in use. Path planning, navmeshes, semantic routes and steering overlap with
physics queries but are not the same problem.

- [x] Keep `Navigation.ts` (321), `Crowd.ts` (283), `Steering.ts` (531) unchanged through P4.
      — all three are **byte-identical** across `ab71012e..HEAD`; they do not appear in the
      P4 diffstat for `packages/physics/src` at all.
- [x] Re-evaluate against the chosen backend's queries **afterwards**, as its own decision
      with its own evidence. — deferred by design, and now genuinely deferrable: the
      selected backend is unchanged from 1.5.x, so there is no new query surface to
      re-evaluate against. Recorded in `docs/architecture/physics-backend-decision.md`.
- [x] **Proof:** navigation tests pass before and after, untouched by the swap.
      — `navigation` (4) · `crowd` (3) · `steering` (11) pass with the files unmodified.

### WS-4.7 Kits consume the shared runtime — named individually

The long-open `GameEngine-PRD` WS-3.8/3.9: `game.racing` integrates its own kinematic
motion, so heading comes from steering input and the force model is bypassed.

**"All four kits" was ambiguous — there are five factories.** Measured 2026-08-05:

| Kit | Factory | Location |
|---|---|---|
| Racing | `createGameRacingKit` | `GameGenreKits.ts` |
| Platformer | `createGamePlatformerKit` | `GameGenreKits.ts` |
| Falling blocks | `createGameFallingBlocksKit` | `GameGenreKits.ts` |
| Locomotion | `createGameLocomotionKit` | `GameGenreKits.ts` |
| Fighting | `createFightingGameKit` | `game-kits/fighting.ts` |

- [x] Define the shared-runtime contract each must satisfy: consumes `PhysicsRuntime` and
      `SurfaceQuery`; defines no private integrator; owns no route-local surface constant.
      — defined, and **`game.racing` measurably fails the "no private integrator" clause.**
      That is the finding, not an omission: see `docs/architecture/adr/0002-*`.
- [ ] Rebuild each, one commit per kit: racing · platformer · falling blocks · locomotion ·
      fighting (`GameGenreKits.ts` 2,329, `game-kits/fighting.ts` 671,
      `GameRuntime.ts` 4,256, `PlatformerMotion.ts` 571).
      — **racing is BLOCKED on ADR 0002 and reverted.** The rewire was written in full (model
      owns heading/speed/lateral velocity, `drift` measured from rear slip angle rather than
      counted while a key is held, new `GameRacingSnapshot.vehicle` carrying slip angles / yaw
      rate / understeer / axle loads, `VehicleMotion` exposed on `./solverless` so the kit does
      not drag the solver onto the critical path) and does not converge, because
      **`GameRacingRoute` never states a length scale** and every tyre-model quantity is
      scale-dependent. Measured at the correct arc-window corner radius of 1.005: 11 of 12
      target-g × wheelbase configurations cannot hold the tightest corner at the route's
      declared pace, and the one that can delivers 120 g. The shipped 4x pace is a *kinematic*
      pace — reachable only by a car with no slip to saturate. Tuning constants until three
      real tests pass would be exactly the pattern this PRD exists to end (R2), so the work is
      reverted and the blocker is recorded.
- [ ] Architecture test: each kit imports the shared runtime; none defines a private integrator.
      — deferred with the racing rebuild; it would fail on `game.racing` today, and R2 forbids
      writing it to pass.
- [x] Fix `solvePlatformerMotion`: `apex = max(minApex, geometry.maxRise * apexHeadroom)`
      collapses to `minApex` on level courses — this is the barely-there jump. Make apex
      intent-derived, not next-platform-derived.
      — already landed at `1fc1b10e` / `5bc298e3`. Apex now takes an explicit `jumpHeight`,
      then a height-scaled `feel` preset, then the geometry value only as a
      backwards-compatible fallback, and the level is *validated* against the declared jump
      rather than dictating it. Verified present in `PlatformerMotion.ts:294-340`; invariant 6
      of the nine (`tests/unit/physics/production-backend-invariants.test.ts`) independently
      asserts a jump reaches >50% of its ballistic ceiling `v²/2g`.
- [ ] **Proof:** rows `vehicle dynamics`, `vehicle AI driving`,
      `platformer motion tuning` leave `parity-unproven` **with lineage tests** (R1).
      — cannot be claimed while racing is blocked; `vehicle dynamics` stays `parity-unproven`
      **truthfully**, which is R1 working as intended rather than a gap to paper over.

---

## PHASE 5 — Rebuild public examples, by tier

112 `apps/` + 38 `examples/` + 20 templates. Rebuilding all of them equally would turn
this into another endless project. Only 11 routes are gated in
`tools/showcase-library/route-gates.json` today, and only 2 apps have a `tests/` dir.

### WS-5.1 Classify every route into a tier

- [x] **Tier 1 — public and marketed.** Fully rebuilt and interaction-tested before
      release. ~~Starting set: the 11 gated routes in `route-gates.json`.~~
      **Measured: 4, not 11.** The other 7 gate entries are `internal-diagnostic` (1),
      `removed-from-public-showcase` (2), `index-route` (1) and `prototype-blocked` (3).
      Being *gated* is not being *cleared* — the blocked three are in that file precisely so
      their blockers are tracked. Tier 1 is `showcase-product-configurator`,
      `showcase-smart-city-control`, `showcase-cinematic-architecture`,
      `showcase-digital-twin-ops`; all four are interactive and all four already carry
      route-health evidence.
- [x] **Tier 2 — public documentation examples.** Must build, run, and demonstrate the API
      accurately. No marketing polish required. — **31 routes**, derived from three signals:
      `starter example` / `library demo` in the classification document, a `create-aura3d`
      template name, or a retained spec/gate under `tests/` or `tools/` that depends on the
      route's files.
- [x] **Tier 3 — diagnostics and internal fixtures.** Stay internal, explicitly labelled,
      no polish. — **101 routes.** The PRD's candidates were right in kind and low in count:
      27 `wow-*`, 10 `three-compat-*`, plus the 32 `retained engine evidence` rows the
      classification document already labelled and which no earlier count included.
- [x] **Tier 4 — obsolete or duplicative.** Delete under R8. — **empty, and that is the
      result rather than a skipped step.** The one genuine candidate,
      `examples/data-galaxy` (superseded by `apps/showcase-data-galaxy` and
      `advanced-examples-gallery/src/dataGalaxy*.ts`, still carrying committed `.js`/`.js.map`
      output), was **refused by R8**: 370 blocking `runtime-consumer` references, all inside
      retained launch evidence. Recorded in the classification document instead of deleted.
- [x] **Proof:** committed inventory with one tier + rationale per route, totalling 150+.
      — `tools/route-tiers/index.ts` + `tests/reports/route-tiers/report.json`: **136 routes,
      0 unclassified**, every row citing the signal it was derived from. (150+ counted 112
      apps + 38 examples; measured today it is 102 + 37 less 3 shared-code directories = 136,
      so the test asserts completeness against the filesystem rather than a number from prose.)
      Gated by `tests/unit/tools/route-tiers.test.ts` (7 tests), which **caught a real R5
      violation in the classifier**: treating "has a gate entry" as Tier 1 promoted all three
      `prototype-blocked` routes.

### WS-5.2 Rebuild Tier 1 and Tier 2

- [x] Every Tier 1/2 route uses the production renderer, shared interaction APIs,
      asset-relative placement, the consolidated input/audio layers, and the selected
      physics backend where applicable.
      — proven by loading all 35 in a real browser: `tests/browser/tier12-route-health.spec.ts`
      drives each route through the shared dev server and the existing
      `tools/current-routes-route-health` evaluator. **32 of 35 clean**; the 3 that fail are
      pre-existing and named below. The route list is read from the WS-5.1 tier report, not
      hand-authored, so a new Tier 1/2 route is covered automatically.

**Evidence is proportional to what the route actually does.** Requiring an interaction
audit on a non-interactive demonstration would manufacture synthetic controls that prove
nothing.

- [x] **Route health: required for every Tier 1 and Tier 2 route.**
      — was missing for **31 of 35** before this workstream; the pre-existing harness pinned
      only 4 starter routes by name. Now generated for all 35 into
      `tests/reports/tier12-route-health/report.json`.
- [x] **Interaction audit: required only where the route exposes interaction.**
      — 15 interactive, 20 not, detected from route source by WS-5.1 rather than declared.
- [x] Any route without one declares `interactionMode: "none"` with a written justification
      in its route record. An undeclared missing audit is a failure; a declared and
      justified one is not. — every row carries `interactionMode` plus
      `interactionJustification`; the `none` justification states why a synthetic control
      would prove nothing.
- [x] **Proof:** every Tier 1/2 route has route-health evidence, and every route either has
      an interaction audit or a justified `interactionMode: "none"`.

      **Three pre-existing route defects surfaced, named so the set cannot quietly grow:**
      `examples/material-showroom` (its whole `main.ts` is
      `import "../_quarantine/material-showroom/main"` and `examples/_quarantine/` was deleted
      from the tree — unchanged since 1.5.0, so the route has been 404ing and rendering nothing
      ever since), plus `examples/postprocess-lab` and `examples/shadow-lab` (never reach ready
      inside the 10 s budget, and render at half the expected DPR backing size). Independently
      confirmed: the retained `rendering-external-parity-visuals.spec.ts` already fails **7 of
      10** cases on `main` against exactly these three routes, verified by stashing this work.
      Recorded as a pinned known-failing set rather than asserted to zero, because repairing
      them is route work against a real contract (the showroom's retained spec requires 22
      named materials, 5 procedural texture fixtures, 3 environment presets) and R2 forbids
      weakening the gate to pass.

      One correction to my own gate: it first failed 8 routes for "0 draw calls" when
      `drawCalls` was `null`, not `0` — those routes do not publish that diagnostic, and all 8
      sat at exactly the 10 s budget. Treating "did not report" as "drew nothing" is the same
      conflation that produced the fake performance gates this PRD exists to remove, so
      rendering is now proven from canvas backing size and screenshot thresholds instead.

### WS-5.3 Reported defects become retained regression cases — named by route ID

Named explicitly so they cannot slip back into "not in scope." Every route below exists
(verified 2026-08-05).

All seven are covered by `tests/unit/apps/reported-route-defects.test.ts` (17 tests). The
engine fixes have their own tests; what was missing was **route binding** — proof the named
route consumes the fixed shared API rather than keeping a local workaround, which is the exact
way an engine fix lands green while the route stays broken (R3).

- [x] **`showcase-product-configurator`** — focus indicator (the flattened-bar defect);
      callout visibility. — route reaches `focusSemanticRegion`; asserts it hand-authors no
      ring geometry and does request a callout.
- [x] **`showcase-digital-twin-ops`** — floating procedural geometry; asset-relative
      anchoring instead of literal helper coordinates. — `placedBoundsFromAsset` +
      `resolveBoundsAnchor`, with no helper anchored at a literal.
- [x] **`showcase-turbo-drift-circuit`** — tyre contact (wheels sinking into the road on
      turns); track surface behaviour; opponent behaviour. — asserts the chassis is grounded
      through a surface query and that `TRACK_SURFACE_Y` (the frozen-plane constant that
      caused the sinking) is gone. Vehicle *motion* remains blocked by ADR 0002.
- [x] **`showcase-skyline-runner`** — jump height and feel; landing; scenery continuity;
      session lifecycle. — motion from the shared solver, no route-local `GRAVITY` /
      `JUMP_VELOCITY` constants, no self-authored completion.
- [x] **`aura-clash-showcase`** — hit timing; spacing; recovery frames (shipped 12-32 active
      against 4-5 recovery, inverted from any real fighting game); AI behaviour.
      — **the inversion is gone**: frame data is now derived by `solveCombatFrameData`, and
      measured today recovery exceeds active on every attack (light 10, heavy 22, special 67).
      Also asserts at least one attack is punishable on block, and that the highest-damage
      move is not also the safest.
- [x] **`showcase-blockfall-reactor`** — complete game-loop verification. — publishes observed
      gameplay proof, and asserts the route does not pin `solverIterations` locally, so it
      inherits the corrected default.
- [x] Cross-cutting: labels reaching the scene graph but drawn only in the Canvas-2D path.
      — asserted structurally at the WS-2.5 selection site: if Canvas 2D cannot be selected
      for a renderable scene, a label drawn only there cannot ship.
- [x] **Proof:** each bullet has a named test that fails against the pre-fix code and
      passes after. A screenshot is not a regression test.
      — **verified by reintroducing the defect, not by assertion.** Re-adding a route-local
      `solverIterations: 1` to blockfall failed its case; restoring passed. Nothing here reads
      an image.

      **That exercise found a hole in my own WS-4.3 invariant.** Reverting the
      `solverIterations` default from 10 back to 1 left invariant 1 *green*, because the case
      passed `solverIterations: 8` explicitly and so never exercised the default it existed to
      protect. A test for a default has to use the default. Fixed, and re-verified in both
      directions: with the default at 1 the stack case fails, at 10 it passes.

### WS-5.4 Blocked routes stay blocked

- [x] `showcase-blockfall-reactor`, `showcase-skyline-runner`,
      `showcase-turbo-drift-circuit` remain `prototype-blocked` (R5). Prepare the review
      package; **do not promote.**
      — all three still `prototype-blocked`, `publicShowcase: false`, human verdict
      `needs-work`, with their named blockers intact. Review package:
      `tools/blocked-route-review/index.ts` →
      `tests/reports/blocked-route-review/report.json`, which records
      `promotionPerformed: false` and cross-references each reported symptom to the engine
      defect behind it. **4 of 6 engine causes are now FIXED** (the platformer apex, the
      capsule-as-cylinder grounding failure, rotation-ignoring queries, and the
      `solverIterations` default that collapsed stacks) and **2 are BLOCKED** on ADR 0002.
      So `showcase-blockfall-reactor` and `showcase-skyline-runner` are ready for a human
      visual-review decision; `showcase-turbo-drift-circuit` is not.
- [x] Do not refresh posters/screenshots to hide defects.
      — enforced by hashing the **PNG bytes**, not the digest recorded in
      `route-health.json`: a refresh would update the record and the image together, so
      reading the record would pass. All three retained screenshots are pinned, and a second
      assertion cross-checks that the recorded digest still matches the image.
- [x] **Proof:** `route-gates.json` still shows all three blocked.
      — `tests/unit/tools/blocked-routes-stay-blocked.test.ts`, 14 tests, covering **all four
      places a promotion could happen**: the gate `releaseClass` and `gameTemplateStatus`, the
      route-health `classification` / `publicShowcase` / `promotionStatus` / `blockers`, the
      human visual-review verdict, and the WS-5.1 tier — because a tier is a promotion, and
      the WS-5.1 classifier's first version did in fact promote all three.

---

## PHASE 6 — Prove developer value

### WS-6.1 Clean-room comparison

- [x] Extend `tests/clean-room/` (14 files today) with an Aura3D-vs-Three.js build of the
      same app measuring: equivalent visual output · authored line count · setup burden ·
      bundle size (WS-2.4 scenarios) · runtime correctness · integration complexity ·
      escape hatches · zero private imports · zero route-local patches.
      — measured on the **committed bundle-scenario entries** rather than a new clean-room
      app, deliberately: `tools/bundle-scenarios/entries/` already holds one entry per engine
      per scenario built through one shared config, so measuring friction on different files
      would let the two reports describe different apps. `tools/developer-friction/index.ts`
      → `tests/reports/developer-friction.json`.
- [x] Baseline from `external-parity-threejs-visual-parity/gap-report.md`: product
      configurator 15 vs 74 lines; asset review 10 vs 68; interior 7 vs 54; orbit 7 vs 48.
      — **parsed from the report rather than restated**, so the two cannot drift. It carries
      7 workflows, not 4: also physical metals 8 vs 58, transparent 8 vs 62, large scene 9 vs 64.
- [x] **Proof:** fewer lines **and** bundle within budget **and** correct behaviour. All
      three, or it fails.
      — **WS-6.1 FAILS, and the verdict is the deliverable.** Axis 1 (fewer authored lines):
      **met** — 9v15, 13v27, 19v40 on the scenarios and 7/7 gap-report workflows. Axis 3
      (correct behaviour): **met** for 32 of 35 Tier 1/2 routes, 3 pinned pre-existing
      failures. Axis 2 (bundle): **not met** — see §B.1. Recorded by
      `tests/unit/tools/developer-value.test.ts`, which asserts the *measured* state including
      the failure, so closing the gap flips a test instead of going unnoticed. Writing this as
      a passing test with a lowered threshold is what R2 forbids.

### WS-6.2 Honest public claims

- [x] Regenerate the parity output under R1. — bundle scenarios re-measured against real
      Three.js builds (not read from a stale report); developer friction generated fresh.
- [x] Update `README.md`, `llms.txt`, `docs/agents/claims-and-boundaries.md`, `marketing/`.
      — README's limitations section rewritten. `llms.txt`, `claims-and-boundaries.md` and
      `marketing/` needed no change: **measured, they carry no comparative bundle or
      superiority claim at all**, so there was nothing to walk back. Saying otherwise would
      have been a fabricated edit.
- [x] Keep `blockedClaims`; no broad better-than-Three.js/Babylon language. — `blockedClaims`
      intact across `apps/` and `packages/`; a grep for broad superiority phrasing over
      `README.md`, `llms.txt`, `marketing/` and `docs/agents/` returns **empty**, and
      `honest-public-claims.test.ts` keeps it that way against 8 patterns.
- [x] State plainly where we remain behind: breadth of loaders/examples, bundle size if
      still over, physics history.
      — the README now leads its limitations with the bundle table (**2.15x / 1.76x / 2.05x**
      against 1.25 / 1.25 / 1.50), states where Aura3D genuinely wins with the same rigour
      (authored lines 9/13/19 vs 15/27/40, one install vs two) **and** where it loses
      (TypeScript compile slower on two of three), and names the three broken public routes.

      **It also removed a stale claim that was wrong in both directions**: "five physics
      capabilities remain unreachable from the public API" — constraints, friction,
      restitution, CCD, penetration resolution — when all five are reachable via
      `createPhysicsRuntime` from `@aura3d/engine` and covered by the WS-4.3 invariants, while
      the section said nothing about the bundle. An out-of-date limitations list is not
      honesty, it is noise.
- [x] **Proof:** `pnpm check:marketing-truth && pnpm check:agent-docs` pass.
      — both pass, and `tests/unit/tools/honest-public-claims.test.ts` (6 tests) runs them as
      part of the gate so a claim edit cannot break them silently. The gate **caught a wrong
      number in my own README edit**: I wrote 2.16x where the measurement is 2.155 → 2.15x. It
      compares the README's table against the live report, so a re-measurement forces the
      table to move; and the bundle disclosure requirement is conditional on `bundle.pass`, so
      the README will not be left carrying a stale warning once the gap closes.

---

## 7. Documentation cleanup — deferred to end of P3, deliberately

**Sequencing decision.** Deleting ~1 MB of historical prompts and audits is low value next
to renderer and architecture work, and doing it early risks erasing decision context
*before* the replacement records exist. So: **only the actively-confusing files go early;
everything else waits until the end of P3, after `docs/architecture/*` and
`MIGRATION-1.6.md` exist.**

Markdown deletion does not need the full R8 source tool, but **does** require a reference
scan immediately before removal.

### Immediate — actively confusing tooling or humans

- [x] `logs.txt` (678,992 B) — stale 2026-08-03 transcript, verified unreferenced, and
      already caused one session to mistake it for current state. Delete now.
      **Done.** `pnpm check:deletion-safety` cleared it: "all six R8 points empty across
      4738 scanned files"; the 8 remaining mentions are prose in the deletion-safety tool's
      own doc comment and in its JSON reports. `git rm`'d.
- [x] ~~`apps/showcase-cannon-physics-proof.ts` — stray source file at `apps/` root, outside
      any app directory.~~ **This PRD line was wrong; R8 caught it.** The file is not stray
      — it is a live shared module with two runtime consumers:
      `apps/showcase-blockfall-reactor/src/main.ts:63` and
      `apps/showcase-turbo-drift-circuit/src/main.ts:21` both
      `import { createShowcaseCannonPhysicsProof }` from it, and it supplies the
      route-level cannon-es angular-contact + adaptive-substep CCD evidence that WS-4.2
      depends on. Deleting it would have broken both routes and destroyed physics-backend
      evidence. **Corrected action, taken:** `git mv` to
      `apps/common/src/cannon-physics-proof.ts` — the directory that already holds
      cross-route shared code (`apps/common/src/runtime.ts`, consumed by 10+ routes) — and
      both importers repointed. Nothing deleted. This is the first R8 save; it is exactly
      the class of mistake R8 exists to prevent, and it argues against trusting any
      "stray file" claim in this document without running the tool first.
- [x] `_gallery.mjs` `_shot.mjs` `_shot7.mjs` `_shot8.mjs` `_shot9.mjs` (7,132 B) — loose
      root scripts. **Done.** All five cleared R8 (ad-hoc Playwright screenshot scripts
      against `127.0.0.1:7782`, no importers, no registry/CLI/schema/doc dependency).
      `git rm`'d.

### End of P3 — superseded prompt scratch (0 references, verified 2026-08-05)

`resetprompt.md` (60,894 B) · `anotherprompt.md` (37,746) · `gameenginefinishprompt.md`
(17,546, untracked) · `shipprompt.md` (17,007) · `FixUpNewPRD.md` (73,267) ·
`finalfixesatlibrarylevel.md` (18,203) · `GoLiveCheckList.md` (7,838).

- [ ] Re-run the reference scan, then delete. Cross-references among them are only between
      files themselves being deleted.

### Preserve as decision context — move, do not delete

- [ ] `AURA3D_KILL_OR_REPAIR_AUDIT.md` (22,117 B) and
      `aura3d-game-examples-stop-decision.md` (6,585 B) — historical architectural audits.
      **Move to `docs/archive/`**, or summarize into
      `docs/architecture/removed-in-1.6.md` and `Aura3D-1.6-Architecture-Decision.md`
      before deleting. Do not simply erase prior architectural reasoning.

### Requires clearing two live references first

- [ ] `QuickFixes.md` (46,098 B) — `tools/product-cutover/index.ts:81` (exclusion list) and
      `tools/release/finish-133.sh:37` (stale 1.3.3 instruction). Clear both, consider
      deleting `finish-133.sh` entirely, then remove.

### Keep with a superseded header

- [ ] `GameEngine-PRD.md` — 6 live tooling references (WS-0.1).

### Keep and update

`README.md` · `CHANGELOG.md` · `AGENTS.md` · `CONTRIBUTING.md` · `DESIGN.md` ·
`llms.txt` · `BUNDLE_SIZES.md` · `Aura3D-1.6-Architecture-Decision.md` · this file.

- [ ] **Proof:** immediately before each deletion batch, re-run
      `git grep -l "<basename>" -- tools tests packages .github marketing`; expect empty.

## 8. Files to create

| Path | Purpose | Phase |
|---|---|---|
| `tools/deletion-safety/index.ts` | R8 six-point dependency proof | P0 |
| `tests/browser/production-path-benchmark.spec.ts` | Real dual-engine timing | P1 |
| `tools/production-path-benchmark/index.ts` | Readiness gate | P1 |
| `tools/claim-lineage/index.ts` | Enforce R1 | P1 |
| `tools/bundle-scenarios/` | 3 canonical scenarios + Three.js equivalents | P2 |
| `tests/browser/context-loss-recovery.spec.ts` | Device-loss recovery | P2 |
| `docs/architecture/text-requirements.md` | Requirement before implementation | P2 |
| `packages/media-pipeline/` | Video/publishing, out of browser bundle | P2 |
| `docs/architecture/removed-in-1.6.md` | Retrieval record for removed packages | P3 |
| `tools/physics-backend-bakeoff/index.ts` | Chooses the physics architecture | P4 |
| `docs/architecture/physics-backend-decision.md` | The decision, with numbers | P4 |
| `docs/architecture/1.6-layers.md` | Owned core / backends / integration | P1-P4 |
| `docs/architecture/claim-lineage.md` | The R1 rule and how to satisfy it | P1 |
| `MIGRATION-1.6.md` | Every intentional break, before/after | P3 |
| `tools/engine-layer-ratio/index.ts` | Enforce R3 mechanically (§B.4) | P1 |
| `tools/developer-friction/index.ts` | Measure §B.2 against Three.js | P6 |
| `tools/negative-complexity/index.ts` | Track §B.3 against the baseline | P1 |
| `docs/architecture/adr/` | R11 architecture decision records | P0 |

---

## 9. Removal triage (observations, not targets — R6)

**Relabelled from "tally" so no reader treats these as committed removals.** Every source
row is *triage*; the per-file R8 report decides, not this table.

### Fixture files — resolved 2026-08-05. R8 cleared zero for deletion.

| Bucket | Files | Lines | Outcome |
|---|---:|---:|---|
| **Blocked — public API** | 30 | ~8,100 | Re-exported from the package barrel and listed in generated `docs/api/public-api.md`. Deleting removes a published export (R7 forbids). **Retained.** |
| **Blocked — internal consumers** | 8 | ~2,600 | Verified importers in production modules. **Retained, renamed** to their real responsibility (WS-3.5). |
| **Confirmed deletable** | **0** | **0** | No file cleared all six R8 points. |

Total in scope: 38 files / 10,720 lines. **Actual removal: 0 lines. 8 renamed, 30 retained.**

Revision 1 listed all 10,720 lines as deletion. That was wrong, and R8 is the reason it
was caught before any `git rm`. The `Fixtures` suffix — not the code — was the defect.

### Other categories

| Category | Lines | Action | Gated by |
|---|---:|---|---|
| Video / episode / publishing | 10,389 | **classify by runtime, then separate** (WS-2.3) | runtime table |
| `packages/scripting` | 5,837 | **RETAINED — R8 refused deletion** (94 refs block `src/index.ts`; live `apps/editor` consumer; 8 production-path browser assertions) | R8 report |
| `packages/ecs` | 1,480 | **RETAINED — R8 refused deletion** (43 refs; public `./ecs` subpath; re-exported at `engine/src/index.ts:61`) | R8 report |
| `rendering/threejs-compatibility/` | 354 | delete | R8 |
| Audio DSP (`Reverb`, `Filter`) | 69 | **retain — inspection showed real behaviour** (WS-3.2) | inspected |
| Fabricated perf gate | ~60 | delete, per WS-1.1 atomic order | — |
| `core`, `apps`, `materials`, `environments`, `editor` | 3,363 | **not removal candidates — proven in WS-3.6c**: all five resolve as public subpaths from an installed tarball (22/3/14/12/74 exports); `engine` depends on `core` and `apps` | WS-3.6c |
| `test-utils` | 62 | **not cleared** — the only unexported package, but R8 reports 8 blocking references (3 release tools + `tsconfig.base.json` alias). Deferred, not deleted | R8, WS-3.6c |
| Markdown + loose scripts + `logs.txt` | ~994 KB | staged per §7, audits preserved | reference scan |
| Rendering descriptor files | ~11,100 | **deferred to 1.7** except where they block bundle size, false claims, or package boundaries | §12 |

## 10. Technical release readiness

Approval gate. Every box needs command output (R4). **No publishing action appears here.**

- [ ] `pnpm typecheck` · `pnpm test` · `pnpm build`
- [ ] `pnpm check:deletion-safety` — clean for every deleted file, reports committed
- [ ] `pnpm check:claim-lineage` — passes
- [ ] `pnpm check:bundle-size` — exits non-zero on overrun **and** is green; all 3
      scenarios reported against Three.js equivalents
- [ ] `pnpm bench:production-path` — real device, both engines, timing fields separately
      named, variance across ≥ 3 sessions
- [ ] Tightened material-specific visual gates green *after* real fixes (not by threshold change)
- [ ] `pnpm check:release` · `pnpm verify:release:quick`
- [ ] Substance check: `git diff --name-only v1.5.2..HEAD | grep "packages/.*/src/"` non-empty
- [ ] Credibility check: `npm pack` old vs new, extract, diff, intended changes present
- [ ] All Tier 1 and Tier 2 routes pass; Tier 3 labelled internal; Tier 4 removed
- [ ] Three routes still `prototype-blocked` unless a human cleared them (R5)
- [ ] `MIGRATION-1.6.md` complete, with the migration matrix
- [ ] Version decided per §12 from that matrix
- [ ] `docs/architecture/removed-in-1.6.md` retrieval instructions verified

### Release success metrics (§B) — these are conditions, not reports

- [ ] **§B.1** all three bundle scenarios within their ratio to the Three.js equivalent
- [ ] **§B.2** `tests/reports/developer-friction.json` complete for both engines
- [ ] **§B.3** `packages/*/src` lines lower than the 212,810 baseline; R12 violations = 0;
      per-phase deletion report committed
- [ ] **§B.4** `pnpm check:engine-layer-ratio` ≥ 90% under `packages/`
- [ ] **R11** every new subsystem introduced during 1.6 has an ADR in `docs/architecture/adr/`
- [ ] **R12** none of the five duplicate-ownership rows has two live implementations
- [ ] **§A** no capability on the "what Aura3D is NOT" list gained a hand-written
      implementation during 1.6

### Verification hygiene — the earlier full-suite races make these mandatory

- [ ] Working tree clean except documented generated artifacts, enumerated by path.
- [ ] No two evidence producers write the same report path; the overlap check is committed.
- [ ] **Two serial full runs** of the complete suite, both green. Not one run, not parallel.
- [ ] Generated artifacts written to isolated temporary directories, then atomically
      promoted into `tests/reports/`.
- [ ] No route test mutates shared evidence consumed by another concurrent suite; verified
      by a producer/consumer map.
- [ ] Re-running the suite twice produces byte-identical reports for deterministic
      producers, and only documented fields differ for measured ones.

---

## 11. Release execution — only after explicit user approval

Not technical completion gates. **Do not perform any of these because §10 is green.**

- [ ] User states approval to publish.
- [ ] Version bump to the §12 decision.

**Pre-publish provenance — encoded because the 1.5.1 split publication happened.**

- [ ] The tag points at exactly the approved commit; record both SHAs.
- [ ] Every package tarball is generated **from that commit**, not from a dirty tree.
- [ ] Workspace dependency versions are internally consistent across all packages
      (no package referencing a version that is not being published).
- [ ] No tarball contains source-only, test-only, or Node-only files reaching a browser
      entry; inspect `npm pack` contents per package.
- [ ] `pnpm build` output regenerated from that commit; `dist/` matches source.

- [ ] Publish all packages.
- [ ] **Post-publish registry verification across every package** — 1.5.1 partially failed
      on an SSL error and left a split registry. Compare version **and integrity hash** for
      each of the ~26 packages, not just `@aura3d/engine`.
- [ ] Tag; GitHub release.
- [ ] Vercel deploy to `aura3d.auraone.ai`.
- [ ] Marketing site library + content update.
- [ ] Post-publish verification of the live site and installed tarballs.

---

## 12. Resolved decisions (previously open)

1. **ECS and scripting** — **RETAINED. This decision was reversed by evidence.** R8 was run
    before deletion and refused it: 61 of 68 files blocked across 300 references
    (`tests/reports/deletion-safety-ws33-final.json`). Both are **public published subpaths**
    (`./ecs`, `./scripting`); `engine/src/index.ts:61` re-exports ECS on the public engine
    barrel; `apps/editor/src/panels/VisualScriptPanel.ts:1` is a live `scripting` consumer; and
    eight assertions in `tests/browser/runtime-external-parity.spec.ts` prove `scripting`
    through a real WebGL2 production path, which is the strongest evidence class R1 recognises.
    No workspace, `exports`, or publish-list change. No `archive/1.5/`. No
    `docs/architecture/removed-in-1.6.md` from this workstream. The residual §A contradiction is
    resolved in the philosophy via an R11 ADR, not by deleting proven code. (WS-3.3)
2. **cannon-es** — **not decided now.** WS-4.2 determines whether it survives as a
    compatibility package. Do not commit to multi-backend support before measuring its
    value. (P4)
3. **Rendering descriptor files (~11,100 lines)** — broad triage **deferred to 1.7**.
    In 1.6 touch only files that directly block bundle size, produce false claims, or
    violate package boundaries. (§9)
4. **Version — deferred, decided after the migration matrix exists.** `1.6.0` is
    defensible only if high-value public concepts and most source compatibility remain.
    **If packages disappear and commonly used imports break, it is `2.0.0`.** Two packages
    are already slated for removal and the engine barrel is being split, so `2.0.0` is
    currently the more likely answer — but the matrix decides, not this sentence. (§10)

---

## 13. North Star

Everything above is mechanism. This is the intent:

> **If a developer can already solve a problem better with the existing Three.js ecosystem,
> Aura3D should not reimplement that solution unless doing so creates clear, measurable
> developer value.**

> **Aura3D owns only the layers that create lasting competitive advantage over Three.js.
> Everything else is integrated, abstracted, or removed.**

The renderer earns its place: 85 Khronos assets render in-browser against real Three.js at a
median 6.73/255 mean-absolute-error, on both a real WebGL2 device and a real WebGPU device
with native pipelines. The asset intelligence, CLI, typed authoring and evidence harnesses
earn their place because Three.js has no answer to them.

The hand-written solver, the descriptor files shaped like simulations, the stub compatibility
layer that returns invented numbers, and the fabricated performance gate did not earn their
place. They made the repository larger, less trustworthy, and harder to use.

Three subsystems this document originally planned to delete are **retained on evidence**: the
audio DSP (WS-3.2 — real validation and disposal behaviour), and `packages/ecs` and
`packages/scripting` (WS-3.3 — public subpaths, a live editor consumer, and eight
production-path browser assertions). R8 and R1 refused those deletions. That is the process
working: **1.6 removes what cannot be defended, and keeps what the evidence defends — including
when that contradicts this document's own first draft.**

1.6 keeps the first list and ends the second. **1.7 stays honest by applying R11 before
writing code, not after shipping it.**
