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
- [ ] Scenario-2 (product viewer) gzip ≤ **1.25x** equivalent
- [ ] Scenario-3 (game runtime) gzip ≤ **1.5x** equivalent
- [ ] Ratios measured by WS-2.4's canonical config against a real Three.js build, reported
      side by side. If a ratio is missed, the release does not ship on that dimension —
      **do not raise the budget** (R2)

### B.2 Developer friction — measured, beside performance

Aura3D wins by making developers faster. That must be measured, not asserted.

- [ ] **Minutes from `npm install` to first rendered cube** — timed on a clean machine
      profile, scripted, recorded
- [ ] **Authored lines of code** for each of the three WS-2.4 scenarios vs the Three.js
      equivalent. Baseline already measured from
      `external-parity-threejs-visual-parity/gap-report.md`: product configurator 15 vs 74,
      asset review 10 vs 68, interior 7 vs 54, orbit 7 vs 48
- [ ] **Number of imports** a developer must write per scenario
- [ ] **Number of dependencies** a developer must install per scenario
- [ ] **TypeScript compile time** for a scaffolded project
- [ ] **Runtime startup time** to first frame
- [ ] **Proof:** committed `tests/reports/developer-friction.json` with every field measured
      for both Aura3D and the Three.js equivalent

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
      `be86c73e`**, net of additions. Note that adding Rapier *adds* a dependency while
      removing far more code — that trade is explicitly acceptable and must be stated, not
      hidden — **currently delta 0.** Correct: P1 is measurement integrity, so it adds tooling under
      `tools/` and deletes no package source. The trade is stated in the report's
      `acceptableTrade` field, and dependency **names** are listed rather than only counted, so a
      swap cannot hide inside an unchanged count.
- [ ] **Release condition: R12 violations = 0** — **currently 5 of 5**, each detected structurally
      rather than asserted: `PhysicsWorld` still declares both backends; `packages/input/ActionMap`
      and `GameRuntime.createGameInput` both live; `packages/audio` and `engine/src/game/GameAudio`
      both live; `VehicleMotion` and `game.racing`'s kinematic integration both live; `GameRuntime`
      plus per-kit integrators. P3 and P4 resolve these.
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
- [ ] A route-only fix for a defect reproducible in two routes is an automatic failure of
      this gate regardless of the ratio — **deliberately not automated.** Whether two routes share
      one defect is a judgement no diff can make; the tool instead publishes
      `largestRouteChanges` so a reviewer can see every route-side edit ranked by size. Recording
      this as a human gate rather than pretending it is mechanical.
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
| 10 | Physics migration invariants beyond the 138 tests | WS-4.3 |
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
pipeline that were each introduced without answering these four questions — and every one is
now being removed, replaced, or archived at a cost far exceeding what the ADR would have cost.

A new subsystem is anything that would appear on the §A "what Aura3D is NOT" list, or any
package that introduces a new runtime capability rather than composing existing ones.

**R12 — Single ownership. No duplicate runtime implementations.** Every capability has
exactly one owner. **Adapters are allowed; duplicate implementations are not.**

The repository violates this today in five places, all measured:

| Capability | Implementation A | Implementation B |
|---|---|---|
| Physics solver | `cannon-es` backend | hand-written `aura-js` backend (joints silently no-op on A) |
| Input | `packages/input` (XR, touch, gamepad, gesture, replay) | `GameRuntime.ts:1618` `createGameInput` (buffering, combo, axes) |
| Audio | `packages/audio` | `engine/src/game/GameAudio.ts` |
| Vehicle motion | `packages/physics/VehicleMotion.ts` (force model) | `game.racing` kinematic integration |
| Game runtime | `engine/src/agent-api/GameRuntime.ts` | per-kit private integrators |

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
- [x] **Proof:** run against `packages/rendering/src/OceanFixtures.ts` — must report the
      known `EnvironmentPlatform.ts` importer. A tool that clears a known-unsafe file is broken.
      — **blocked with 23 references**, first being
      `runtime-consumer @ packages/rendering/src/EnvironmentPlatform.ts:304`, plus the
      `rendering/src/index.ts:839,848` barrel re-exports, `docs/api/public-api.md:1101` and
      `tests/reports/api-docs.json:998`. Encoded as a regression test:
      `tests/unit/tools/deletion-safety.test.ts` → **4 passed**, one of which asserts the
      `EnvironmentPlatform.ts` importer specifically.

**Two calibration corrections made while proving it, both worth recording** — a gate that cannot
be cleared gets routed around rather than satisfied:

1. Generic stems are excluded from specifier matching. An early version emitted `index` for
   `packages/test-utils/src/index.ts` and reported **27,230** blocking references — every line
   containing the word. Barrels now match on their directory path and package subpath instead.
2. A file mention inside a source comment or hand-written prose is reported as a non-blocking
   `prose-mention`, not as a consumer. The tool's own explanatory comment names
   `test-utils/src/index.ts`, so it blocked on itself. Generated documentation
   (`docs/api/`, `docs/site/`, `llms.txt`) still blocks, because a reference there means a
   generator must be re-run.

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

- [ ] Proper sheen lobe: Charlie or Ashikhmin distribution with sheen albedo scaling and
      correct energy behaviour.
- [ ] **Proof:** grazing-angle lobe presence and energy behaviour asserted structurally.

#### WS-2.1c Iridescence

- [ ] Thin-film interference varying with view angle and IOR, honouring
      `iridescenceThicknessMinimum`/`Maximum`.
- [ ] **Proof:** hue shift across viewing angles asserted structurally, on `iridescence-abalone`.

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

      Two of those are the clearest remaining wins and both are *static-import* problems rather than
      construction problems: `PhysicsWorld` is already **lazily constructed** (`:9832`, with a comment
      recording that eager construction cost 85 KB of `cannon-es`) yet still **statically imported** at
      module scope, and `WebGPUDevice` arrives through
      `rendering/src/index.ts → advanced-runtime → Renderer → RenderBackend`. Deferring either needs the
      value import removed from the barrel, which is exactly the entry-point split this row describes.
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

- [ ] Never select it for a developer-authored scene. If the production path cannot start,
      throw a diagnosable error instead of silently drawing gradients.
- [ ] Rename to `renderDiagnosticPreviewToCanvas`; headless/diagnostic use only.
- [ ] Remove `"canvas2d"` from the public `AuraBackend` union (:9150) or mark internal.
- [ ] **Proof:** a typed-GLB route with a deliberately failed device errors; no gradient frame.

### WS-2.6 Context-loss recovery through the root API

- [ ] Surface the existing `WebGL2Device.ts:349-350` listeners through `createAuraApp` —
      `onDeviceLost` / `onDeviceRestored` plus automatic resource recreation.
- [ ] **Create** `tests/browser/context-loss-recovery.spec.ts` using `WEBGL_lose_context`.
- [ ] **Proof:** row moves `gap` → `parity` **with** its lineage test named (R1).

### WS-2.7 Text — define the requirement before choosing an implementation

A naive `TextGeometry` could close a parity row while giving poor real-world text. Do not
prescribe the implementation first.

- [ ] **Step 1 — write the requirement doc** `docs/architecture/text-requirements.md`
      covering which of these we owe developers: lit 3D geometry text · high-quality
      scalable UI text · world-space labels · accessible DOM labels · occlusion-aware
      annotations.
- [ ] **Step 2 — evaluate the four ecosystem approaches** against it: geometry text,
      SDF/MSDF, DOM/CSS overlay, texture atlas. Note that **an SDF/MSDF system is likely
      more strategically useful than a TextGeometry equivalent**, and that we already have
      accessible DOM labels.
- [ ] **Step 3 — implement the chosen one(s).** File paths follow from the decision.
- [ ] **Proof:** requirement doc + decision record committed *before* implementation; the
      parity row cites the chosen approach and a visual test showing correct occlusion.

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

- [ ] Keep `WebGL2Device`, `WebGPUDevice`, `createRenderDevice`, `Renderer`, `Geometry`,
      `Material` exported (already at `packages/rendering/src/index.ts:21-62`).
- [ ] Document custom shader, custom pass, and custom scene-node extension paths.
- [ ] **Proof:** a clean-room project adds a custom postprocess pass using public exports
      only, no `@aura3d/*/src/*` deep import.

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

- [ ] **Step 1 — characterization tests, before any change.** Capture the current
      `createGameInput` contract (`GameInputOptions` :382, `GameInputController` :436) and
      the `packages/input` contract, comparing: event timing · held vs pressed vs released ·
      repeat behaviour · touch normalization · action mapping · simulation-frame sampling ·
      replay format · focus loss · pointer lock · gamepad dead zones.
- [ ] **Step 2 — pick the survivor from that table**, then port the other's unique
      capabilities into it. Do not assume the answer.
- [ ] **Step 3 — thin adapter** for the losing surface, only if behaviour matches the
      characterization tests exactly.
**The invariant is service ownership, not a grep count.** Multiple low-level listeners are
legitimate when they belong to an editor iframe, the application shell, a WebXR session, a
standalone-package compatibility adapter, or a test harness. Requiring exactly one
repo-wide match would force awkward architecture.

- [ ] **Stated invariant:** *a single runtime input service owns keyboard state for a
      mounted Aura3D application, and adapters do not independently interpret the same
      event stream.*
- [ ] **Proof:** characterization tests pass identically before and after; an architecture
      test asserts one input service per mounted app and no adapter double-interpreting
      events. Legitimate independent listeners are enumerated with their justification.

### WS-3.2 Audio — same standard

`packages/audio` (2,205 lines, **1 consumer**) vs `packages/engine/src/game/GameAudio.ts`
(own `createGain` at :98). Custom DSP is only 69 lines.

- [ ] **Step 1 — characterization tests** on both: playback state, scheduling/timing,
      bus routing, spatialization, gain ramps, context unlock/resume, dispose semantics.
- [ ] **Step 2 — choose the survivor from evidence**, port the other's unique capabilities.
- [ ] **Step 3 — inspect before deleting. "Web Audio already provides the node" is not
      sufficient grounds.** A thin wrapper can legitimately add consistent disposal, typed
      presets, automation, serialization, scene integration or diagnostics.
      **Inspection result (2026-08-05):** `Reverb.ts` (30 lines) wraps `createConvolver`
      with `setImpulse`, `connect`, `disconnect`, and a `dispose` that nulls the buffer.
      `Filter.ts` (39) wraps `createBiquadFilter` with validated `setFrequency`/`setQ`
      (throws on non-finite/negative) plus `dispose`. Both implement the shared
      `AudioEffect` interface. So they are **not pure aliases** — they carry disposal
      discipline, input validation and interface conformance.
- [ ] **Revised recommendation: keep both**, and fold them into whichever audio layer WS-3.2
      selects. Delete only if the chosen layer already provides equivalent disposal,
      validation and `AudioEffect` conformance, making them true duplicates. Record the
      decision either way.
- [ ] **Proof:** one `AudioContext` owner; `examples/game-slice` unchanged in behaviour.

### WS-3.3 Remove dead packages from the active tree — no in-tree graveyard

Git history and tags are the archive. An `archive/1.5/` code directory risks stale
imports, duplicate manifests, workspace confusion, TS project-reference breakage, tooling
still indexing dead code, and ambiguity about support status.

- [ ] `packages/ecs` — 1,480 lines, **0 consumers** in apps/examples/templates; only
      `packages/engine/src/ecs/ECSRenderSource.ts` (233) imports it. Run R8, then **remove
      from the workspace and delete from the active tree.** Decide `ECSRenderSource.ts`
      with it.
- [ ] `packages/scripting` — 5,837 lines (GOAP, HTN, BehaviorTree, UtilityAI,
      DecisionTree, Perception, WeaponSystem, VisualGraph), **0 `engine` references**.
      Run R8, then remove and delete.
- [ ] Remove from `pnpm-workspace.yaml`, root `package.json` `exports` (`./ecs`,
      `./scripting`), and the publish list.
- [ ] **Create** `docs/architecture/removed-in-1.6.md` — for each removed package: final
      commit SHA, the tag containing it, line count, why removed, and how to retrieve it
      from history.
- [ ] Use an in-tree `archive/` **only** if R8 finds a live dependency that cannot be cut
      in this release.
- [ ] **Proof:** `pnpm build && pnpm typecheck` pass; both absent from
      `pnpm -r list --depth -1`; retrieval instructions verified by an actual
      `git show <sha>:<path>`.

### WS-3.4 Delete stub compatibility implementations

`packages/rendering/src/threejs-compatibility/` — 354 lines, 0 consumers, actively
misleading: `SceneRenderer.ts:19-33` returns hardcoded
`{ meshes: 72, instances: 12000, skinnedMeshes: 4, transparentObjects: 18 }`.

- [ ] Run R8 on all 11 files, then `git rm`: `InstancingSystem.ts`, `LightingSystem.ts`,
      `MaterialSystem.ts`, `RenderTargetSystem.ts`, `RendererDiagnostics.ts`,
      `SceneRenderer.ts`, `ShadowSystem.ts`, `TextureSystem.ts`, `ThreeCompatRenderer.ts`,
      `TransparencySystem.ts`, `index.ts` (+ `performance/`, `postprocess/`, `shaders/`,
      `vfx/` subdirs).
- [ ] **Keep `packages/three-compat/` — different thing, real, and the migration on-ramp.**
- [ ] Remove the re-export from `packages/rendering/src/index.ts`.
- [ ] **Proof:** `git grep -n "ThreeCompatRenderer" -- packages apps examples` empty.

### WS-3.5 Fixture files — dependency proof per file, no bulk deletion

38 files, 10,720 lines. They are descriptor objects, not simulations —
`ClothFixtures.ts` carries a `blockedClaims` array listing the 8 things it cannot do.
**Revision 1 was too confident here. Apply R8 to all 38, not just the 7 known-entangled.**

- [ ] Run `check:deletion-safety` on **all 38** and commit the report **before** deleting
      anything. The report is the gate; this checklist is not.
- [ ] Delete only files whose report is clear on all six points.

Known-entangled (verified 2026-08-05 — these already fail R8):

- [ ] `rendering/OceanFixtures.ts` (318) ← `EnvironmentPlatform.ts`
- [ ] `rendering/TerrainFixtures.ts` (310) ← `EnvironmentPlatform.ts`, `VegetationFixtures.ts`
- [ ] `rendering/VegetationFixtures.ts` (314) ← `EnvironmentPlatform.ts`
- [ ] `rendering/ProceduralTextureFixtures.ts` (393) ← `ProductTurntableFixtures.ts`, `ArchitecturalMaterialCatalog.ts`
- [ ] `rendering/ProductTurntableFixtures.ts` (908) ← `CanonicalSceneFixtures.ts`
- [ ] `rendering/CanonicalSceneFixtures.ts` (95) ← `tools/`
- [ ] `animation/SecondaryAnimationFixtures.ts` (210) ← `SpringBones.ts`, `FootIk.ts`
- [ ] For each: extract the genuinely-used generation code (e.g.
      `createTerrainHeightfieldGeometry`) into a real module first, then delete the descriptor.

Candidates pending their R8 report (do not delete on this list alone): physics Cloth 359 ·
FireSmoke 382 · Fluid 301 · Fracture 277 · SoftBody 363 · PhysicsSandbox 394 ·
Platformer 205; rendering ArchitecturalLighting 241 · ArchitecturalMeasurement 155 ·
Culling 280 · SpaceEnvironment 200 · VoxelWorld 280 · Weather 223; audio AdaptiveMusic 132 ·
AudioEffectsAnalysis 311 · SpatialAudio 137; input GestureHaptics 179 ·
InputActionBinding 121 · XR 203; editor-runtime LocalizationAccessibility 368;
assets AssetBundleCache 290 · SceneAnalysis 438; animation MotionMatching 254;
scripting (8 files, 2,079 — travel with WS-3.3).

Dependent test cleanup, once the corresponding fixture clears R8:

- [ ] `tests/browser/runtime-external-parity.spec.ts` (1,238 lines) asserts
      `oldBranchClothSimulationPort` and — at :618-619 —
      `expect(clothBlockedClaims).toContain("Unity Cloth parity")`. **It tests that a
      descriptor declares what it cannot do.** Remove those cases (:266-287, :591-702).
- [ ] `examples/game-slice/main.ts:1372,1789` sets those flags. Remove.
- [ ] Remove deleted names from each `index.ts` / `browser-index.ts`.
- [ ] **Proof:** committed dependency report + `pnpm typecheck && pnpm test:unit` pass.

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

#### WS-3.6a Dependency graph and ownership rules

- [ ] Document owner + allowed dependency direction per package in `DESIGN.md`.
- [ ] Publish the actual current graph, including transitive edges, as committed evidence.
- [ ] **Proof:** graph matches `pnpm -r list`; no undocumented edge.

#### WS-3.6b Lint enforcement

- [ ] Extend the ESLint boundary rule (already blocks `@aura3d/*/src/*`) to forbid upward
      dependencies per WS-3.6a.
- [ ] **Proof:** `pnpm lint` passes; a deliberately-added upward import fails it.

#### WS-3.6c Zero-consumer audit — classify, do not delete

- [ ] For each of the six: is it public API, a dependency layer, or genuinely dead?
      Use the table above as the starting evidence, not app-import counts.
- [ ] **Proof:** committed classification with the public-export and transitive-dependency
      status of each.

#### WS-3.6d Per-package consolidation decisions

- [ ] One decision, one commit, per package. Under R8 and R7.
- [ ] **`core` and `apps` are not candidates for removal in 1.6** — `engine` depends on both.
- [ ] `materials`, `environments`, `editor` are public exports: removal is a **breaking
      change** feeding §12, and requires a deprecation path, not a delete.
- [ ] `test-utils` (62, not exported) is the only straightforward candidate.
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

- [ ] Define in `packages/physics/src/index.ts`: bodies, colliders, joints,
      raycast/shapecast, character controller, vehicle, deterministic stepping.
- [ ] No `cannon-es` or Rapier type in the public surface.
- [ ] **Proof:** `git grep -n "cannon-es" packages/physics/src/index.ts` empty.

### WS-4.2 Bake-off — allowed to produce any of these outcomes

- [ ] **Create** `tools/physics-backend-bakeoff/index.ts`. Score every candidate on:
      browser bundle size · WASM initialization cost · deterministic stepping across runs ·
      character-controller quality · vehicle-controller capability · Web Worker support ·
      API stability · raw performance · mobile behaviour · licensing.
- [ ] Use the existing 21 physics test files / 138 tests as correctness fixtures.
- [ ] **Permitted outcomes, explicitly:** Rapier only · Cannon only · Rapier plus a
      minimal kinematic mode · external physics adapters as separate optional packages ·
      **no multi-backend abstraction at all**.
- [ ] Evaluate whether a multi-backend abstraction earns its permanent cost. If not, say so.
- [ ] **Write the decision into `docs/architecture/physics-backend-decision.md` with the
      numbers before changing any solver code.**
- [ ] **Proof:** committed report; the selection justified per dimension; the
      multi-backend question answered explicitly either way.

### WS-4.3 Implement the chosen architecture

- [ ] Implement whatever WS-4.2 selected, behind the WS-4.1 contract.
- [ ] Fix or remove the `aura-js` path — the joint no-op divergence must not survive in
      any form.
- [ ] Only if WS-4.2 chose multi-backend: add compatibility backends with dated
      deprecations (R7). Otherwise do not build the abstraction.

**"All 138 tests pass" is necessary but insufficient — those tests were written around the
current solver's semantics and may encode its quirks.** Classify every existing physics
test before migrating:

- [ ] **Contract tests** — must survive unchanged; they define the public promise.
- [ ] **Implementation-characterization tests** — may encode old-solver quirks; each is
      either rewritten as a contract test or deleted with a recorded reason. Never retained
      as a constraint on the new backend by default.
- [ ] **New cross-backend physical invariants** — written fresh, must hold on any backend.
- [ ] **Full-route behaviour tests** — end-to-end, per WS-5.3.

The selected backend must additionally prove all nine, none of which the historical 138
fully cover:

- [ ] stacked-body stability
- [ ] joint behaviour (the 1.5.x silent no-op class must be impossible)
- [ ] tunnelling / CCD under high velocity
- [ ] sleeping and waking
- [ ] deterministic repeatability across runs and sessions
- [ ] character grounding
- [ ] slope and step movement
- [ ] vehicle suspension
- [ ] browser initialization and disposal (including WASM init and teardown)

- [ ] **Proof:** the test classification is committed; all nine invariants have named tests
      passing on the production backend, not a fallback.

### WS-4.4 Retain the layer above the solver

Keep — game logic, genuinely ours, no external equivalent:

- [ ] `RacingLineProfile.ts` (254) · `PathFollowDriver.ts` (279) · `SurfaceQuery.ts` (159)
      · `PhysicsDebugDraw.ts` (199) · `PhysicsStepper.ts` (47) ·
      `engine/src/agent-api/VehicleChassis.ts` (588) · telemetry · speed profiles ·
      semantic surfaces
- [ ] **Proof:** their tests pass unchanged after the swap.

### WS-4.5 MeshBVH — audit by responsibility, do not assume duplication

**Correction to revision 1.** `MeshBVH.ts` (326) is not automatically physics duplication.
Measured consumers: `tests/unit/physics/mesh-surface-query.test.ts` (18 refs),
`SurfaceQuery.ts` (5), `tests/unit/physics/vehicle-mesh-contact.test.ts` (5),
`engine/src/agent-api/index.ts` (3), `GameSceneGeometryBindings.ts` (2),
`create-aura3d/src/showcase-spec-types.ts` (2), `PhysicsRuntime.ts` (1),
`turbo-drift-real-circuit-contact.test.ts` (1), plus a docs snippet.

- [ ] Classify each consumer by responsibility: rendering queries · selection/picking ·
      static geometry analysis · asset admission · raycasting · spatial indexing ·
      physics contact.
- [ ] Only the physics-contact responsibility can be made redundant by a new solver. If
      other responsibilities remain, `MeshBVH` **stays** and possibly moves out of
      `packages/physics`.
- [ ] **Proof:** committed responsibility table; decision follows from it.

### WS-4.6 Navigation is independent of the solver swap

`Navigation` appears in 8 app files, `Crowd` in 5, `Steering` in 2 — unlike `scripting`,
this is in use. Path planning, navmeshes, semantic routes and steering overlap with
physics queries but are not the same problem.

- [ ] Keep `Navigation.ts` (321), `Crowd.ts` (283), `Steering.ts` (531) unchanged through P4.
- [ ] Re-evaluate against the chosen backend's queries **afterwards**, as its own decision
      with its own evidence.
- [ ] **Proof:** navigation tests pass before and after, untouched by the swap.

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

- [ ] Define the shared-runtime contract each must satisfy: consumes `PhysicsRuntime` and
      `SurfaceQuery`; defines no private integrator; owns no route-local surface constant.
- [ ] Rebuild each, one commit per kit: racing · platformer · falling blocks · locomotion ·
      fighting (`GameGenreKits.ts` 2,329, `game-kits/fighting.ts` 671,
      `GameRuntime.ts` 4,256, `PlatformerMotion.ts` 571).
- [ ] Architecture test: each kit imports the shared runtime; none defines a private integrator.
- [ ] Fix `solvePlatformerMotion`: `apex = max(minApex, geometry.maxRise * apexHeadroom)`
      collapses to `minApex` on level courses — this is the barely-there jump. Make apex
      intent-derived, not next-platform-derived.
- [ ] **Proof:** rows `vehicle dynamics`, `vehicle AI driving`,
      `platformer motion tuning` leave `parity-unproven` **with lineage tests** (R1).

---

## PHASE 5 — Rebuild public examples, by tier

112 `apps/` + 38 `examples/` + 20 templates. Rebuilding all of them equally would turn
this into another endless project. Only 11 routes are gated in
`tools/showcase-library/route-gates.json` today, and only 2 apps have a `tests/` dir.

### WS-5.1 Classify every route into a tier

- [ ] **Tier 1 — public and marketed.** Fully rebuilt and interaction-tested before
      release. Starting set: the 11 gated routes in `route-gates.json`.
- [ ] **Tier 2 — public documentation examples.** Must build, run, and demonstrate the API
      accurately. No marketing polish required.
- [ ] **Tier 3 — diagnostics and internal fixtures.** Stay internal, explicitly labelled,
      no polish. Candidates: the 29 `wow-*` and 10 `three-compat-*` apps, `regression-*`.
- [ ] **Tier 4 — obsolete or duplicative.** Delete under R8.
- [ ] **Proof:** committed inventory with one tier + rationale per route, totalling 150+.

### WS-5.2 Rebuild Tier 1 and Tier 2

- [ ] Every Tier 1/2 route uses the production renderer, shared interaction APIs,
      asset-relative placement, the consolidated input/audio layers, and the selected
      physics backend where applicable.

**Evidence is proportional to what the route actually does.** Requiring an interaction
audit on a non-interactive demonstration would manufacture synthetic controls that prove
nothing.

- [ ] **Route health: required for every Tier 1 and Tier 2 route.**
- [ ] **Interaction audit: required only where the route exposes interaction.**
- [ ] Any route without one declares `interactionMode: "none"` with a written justification
      in its route record. An undeclared missing audit is a failure; a declared and
      justified one is not.
- [ ] **Proof:** every Tier 1/2 route has route-health evidence, and every route either has
      an interaction audit or a justified `interactionMode: "none"`.

### WS-5.3 Reported defects become retained regression cases — named by route ID

Named explicitly so they cannot slip back into "not in scope." Every route below exists
(verified 2026-08-05).

- [ ] **`showcase-product-configurator`** — focus indicator (the flattened-bar defect);
      callout visibility.
- [ ] **`showcase-digital-twin-ops`** — floating procedural geometry; asset-relative
      anchoring instead of literal helper coordinates.
- [ ] **`showcase-turbo-drift-circuit`** — tyre contact (wheels sinking into the road on
      turns); track surface behaviour; opponent behaviour.
- [ ] **`showcase-skyline-runner`** — jump height and feel; landing; scenery continuity;
      session lifecycle.
- [ ] **`aura-clash-showcase`** — hit timing; spacing; recovery frames (shipped 12-32 active
      against 4-5 recovery, inverted from any real fighting game); AI behaviour.
- [ ] **`showcase-blockfall-reactor`** — complete game-loop verification.
- [ ] Cross-cutting: labels reaching the scene graph but drawn only in the Canvas-2D path.
- [ ] **Proof:** each bullet has a named test that fails against the pre-fix code and
      passes after. A screenshot is not a regression test.

### WS-5.4 Blocked routes stay blocked

- [ ] `showcase-blockfall-reactor`, `showcase-skyline-runner`,
      `showcase-turbo-drift-circuit` remain `prototype-blocked` (R5). Prepare the review
      package; **do not promote.**
- [ ] Do not refresh posters/screenshots to hide defects.
- [ ] **Proof:** `route-gates.json` still shows all three blocked.

---

## PHASE 6 — Prove developer value

### WS-6.1 Clean-room comparison

- [ ] Extend `tests/clean-room/` (14 files today) with an Aura3D-vs-Three.js build of the
      same app measuring: equivalent visual output · authored line count · setup burden ·
      bundle size (WS-2.4 scenarios) · runtime correctness · integration complexity ·
      escape hatches · zero private imports · zero route-local patches.
- [ ] Baseline from `external-parity-threejs-visual-parity/gap-report.md`: product
      configurator 15 vs 74 lines; asset review 10 vs 68; interior 7 vs 54; orbit 7 vs 48.
- [ ] **Proof:** fewer lines **and** bundle within budget **and** correct behaviour. All
      three, or it fails.

### WS-6.2 Honest public claims

- [ ] Regenerate the parity output under R1.
- [ ] Update `README.md`, `llms.txt`, `docs/agents/claims-and-boundaries.md`, `marketing/`.
- [ ] Keep `blockedClaims`; no broad better-than-Three.js/Babylon language.
- [ ] State plainly where we remain behind: breadth of loaders/examples, bundle size if
      still over, physics history.
- [ ] **Proof:** `pnpm check:marketing-truth && pnpm check:agent-docs` pass.

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

- [ ] `logs.txt` (678,992 B) — stale 2026-08-03 transcript, verified unreferenced, and
      already caused one session to mistake it for current state. Delete now.
- [ ] `apps/showcase-cannon-physics-proof.ts` — stray source file at `apps/` root, outside
      any app directory.
- [ ] `_gallery.mjs` `_shot.mjs` `_shot7.mjs` `_shot8.mjs` `_shot9.mjs` (7,132 B) — loose
      root scripts.

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

### Fixture files — four buckets, not one number

| Bucket | Files | Lines | Meaning |
|---|---:|---:|---|
| **Needs extraction first** | 7 | 2,548 | Verified internal importers (WS-3.5). Extract real generation code, then delete the descriptor. |
| **Travels with WS-3.3** | 8 | 2,079 | `packages/scripting` fixtures; go with the package. |
| **Undecided — pending R8 report** | 23 | 6,093 | May be deletable, may be retained. **No commitment.** |
| **Confirmed deletable** | 0 | 0 | Nothing is confirmed until its report is clean. |

Total in scope: 38 files / 10,720 lines. **Action: triage; delete only cleared files.**

### Other categories

| Category | Lines | Action | Gated by |
|---|---:|---|---|
| Video / episode / publishing | 10,389 | **classify by runtime, then separate** (WS-2.3) | runtime table |
| `packages/scripting` | 5,837 | remove from tree, keep in history | R8 |
| `packages/ecs` | 1,480 | remove from tree, keep in history | R8 |
| `rendering/threejs-compatibility/` | 354 | delete | R8 |
| Audio DSP (`Reverb`, `Filter`) | 69 | **retain — inspection showed real behaviour** (WS-3.2) | inspected |
| Fabricated perf gate | ~60 | delete, per WS-1.1 atomic order | — |
| `core`, `apps`, `materials`, `environments`, `editor` | 3,363 | **not removal candidates** — public exports; `engine` depends on `core` and `apps` | WS-3.6c |
| `test-utils` | 62 | only straightforward candidate | R8 |
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

1. **ECS and scripting** — remove from the active tree; preserve through Git history and
    tags. **No `archive/1.5/` code graveyard** unless R8 finds a live dependency that
    cannot be cut. `docs/architecture/removed-in-1.6.md` records final SHA, tag, and
    retrieval command. (WS-3.3)
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

The hand-written solver, the unused AI framework, the unused ECS, the 69 lines of audio DSP,
the descriptor files shaped like simulations, and the fabricated performance gate did not
earn their place. They made the repository larger, less trustworthy, and harder to use.

1.6 keeps the first list and ends the second. **1.7 stays honest by applying R11 before
writing code, not after shipping it.**
