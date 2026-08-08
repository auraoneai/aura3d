# Aura3D 1.6 — agent handoff

**Read this file, then `Aura3D-1.6-Replatform-PRD.md`, then start work.** Everything below is
measured from the repository, not remembered. Re-verify anything you intend to rely on.

---

## 0. Your objective

Finish every unchecked box in `Aura3D-1.6-Replatform-PRD.md`, checking each one off **in that file**
as it completes, with the command output that proves it. Do not stop while unblocked work remains.

**Three exceptions you must not cross:**

1. **§11 (Release execution) requires the user to say "approved to publish" first.** It is 13 boxes
   of publishing actions. §10 going green is *not* approval. Do not publish, tag, or deploy.
2. **Three routes stay `prototype-blocked`** — `showcase-blockfall-reactor`,
   `showcase-skyline-runner`, `showcase-turbo-drift-circuit`. R5 requires human review.
   `tests/unit/tools/blocked-routes-stay-blocked.test.ts` enforces this in four places and **will
   fail** if you promote them.
3. **ADR 0002 blocks the racing kit** and needs a *user decision*, not more engineering. See §5.

---

## 1. Repository state

| | |
|---|---|
| Branch | **`main`** — no feature branches, no work in progress elsewhere |
| HEAD | `4f9b0663` |
| Working tree | **clean** (`git status --porcelain` → 0 lines) |
| Remote | `git@github.com:auraoneai/aura3d.git` |
| **Unpushed commits** | **82** on `main` vs `origin/main` |
| Last release tag | `v1.5.2` |
| Worktrees | one stale entry, **nothing to merge** — see below |

### Nothing needs merging

There are no branches or worktrees holding unmerged work. `git worktree list` shows a second entry:

```
/private/tmp/aura3d-showcase-build-audit.aOCImR/worktree  601275c4 (detached HEAD) prunable
```

That directory **no longer exists on disk** and its commit `601275c4` is already an ancestor of
`main` (verified with `git merge-base --is-ancestor`). It is leftover bookkeeping from a tool that
creates a temp worktree to audit builds. Clear it with:

```bash
git worktree prune
```

### The 82 unpushed commits

All on `main`, all linear, ranging from pre-1.6 work (`e5fce72c` WS-3.8) through this session's 20
commits (`0ed7d1d3..HEAD`). **Do not force-push and do not rebase.** Pushing is a normal
`git push`, but note the project convention: do not push to `main` unless the user asks. Confirm
with the user before pushing.

---

## 2. The documents, and which is authoritative

| File | Role | Trust |
|---|---|---|
| **`Aura3D-1.6-Replatform-PRD.md`** | **The governing document.** 293 checkboxes, 258 checked, 35 unchecked. Every rule (R1–R12) lives in §1. | **Authoritative.** Update it as you work. |
| `Aura3D-1.6-Architecture-Decision.md` | The audit that produced the PRD: what to keep, replace, delete. | Authoritative for *why*, superseded by the PRD for *what*. |
| `MIGRATION-1.6.md` | Migration matrix + the version decision (**1.6.0**). Every row measured against `v1.5.2`. | Authoritative. Gated by `tests/unit/tools/migration-matrix.test.ts`. |
| `docs/architecture/adr/0001-…` | ECS + scripting **retained** — R8 refused deletion. | Binding. Do not relitigate. |
| `docs/architecture/adr/0002-…` | Racing kit force model **blocked** on a route-contract gap. | Binding. Do not relitigate. Needs a user decision. |
| `docs/architecture/physics-backend-decision.md` | One production solver: `cannon-es`. No multi-backend. | Binding. Do not relitigate. |
| `docs/architecture/removed-in-1.6.md` | Retrieval record for the 9 files §7 deleted. | Authoritative. |
| `docs/architecture/meshbvh-responsibilities.md` | MeshBVH stays, and stays in `packages/physics`. | Binding. |
| `docs/architecture/package-ownership.md`, `1.6-layers.md`, `claim-lineage.md`, `extension-points.md`, `text-requirements.md` | Supporting architecture records. | Authoritative. |
| `docs/archive/*` | Two superseded audits, kept because §7 forbids erasing prior reasoning. | **Historical. Not current.** |
| `GameEngine-PRD.md` | **Superseded** by the 1.6 PRD. Retained only because 6 live tooling references read it. | Do not work from it. Do not delete it. |
| `README.md` | Public claims, including the honest limitations section. | Gated by `tests/unit/tools/honest-public-claims.test.ts`. |
| `AGENTS.md` | Repo conventions: anti-patterns, claim labels, commands. | Read before editing routes/docs/claims. |

**Files that no longer exist** and that you may see referenced in old prose: `resetprompt.md`,
`anotherprompt.md`, `gameenginefinishprompt.md`, `shipprompt.md`, `FixUpNewPRD.md`,
`finalfixesatlibrarylevel.md`, `GoLiveCheckList.md`, `QuickFixes.md`, `logs.txt`. All deleted in §7
after R8 cleared them. Retrieval: `docs/architecture/removed-in-1.6.md`.

---

## 3. Verified state — run these to sync

```bash
git worktree prune                      # clear the stale entry
pnpm typecheck:raw                      # expect: clean
npx vitest run tests/unit tests/integration
#   expect: 3348 passed / 1 failed (448 files)
#   the 1 failure MUST stay failing — see below
```

**The one expected failure:** `tests/unit/tools/showcase-route-gates.test.ts` → "binds generated
launch evidence to the current route gate config". The four release candidates' visual approvals are
**hash-bound** to route sources that have since changed, so the recorded approval describes an older
render. R5 says a human decides. **Refreshing that record is the laundering WS-5.4 forbids.** Leave
it failing until the user re-approves.

Other gates worth running to orient yourself:

```bash
npx tsx tools/route-tiers/index.ts               # 136 routes, 0 unclassified
npx tsx tools/negative-complexity/index.ts       # R12: 2 of 5, lines +367
npx tsx tools/engine-layer-ratio/index.ts        # 92.52% (passes)
npx tsx tools/bundle-scenarios/index.ts          # FAILS — the release blocker
npx tsx tools/blocked-route-review/index.ts      # the R5 review package
pnpm check:claim-lineage                         # 56/56
pnpm check:deletion-safety                       # empty queue = pass
```

---

## 4. What was accomplished (so you don't redo it)

### Phase 4 — physics, complete except the racing kit

**The second solver is gone.** `PhysicsWorld` carried two complete solvers behind one `step()`.
That was the defect generator: joints were solved on `aura-js` and were a **silent no-op** on the
default `cannon-es` path; `applyForce` accumulated on one and was **dropped** on the other; collider
materials, declared inertia and 3 of 7 public `Shape` kinds were `aura-js`-only. The suite stayed
green because tests pinned the branch that worked. `PhysicsBackend` is now a one-member union;
`disableCannonBackend` and the JS integrator are deleted.

**Four real engine defects, found by writing the nine invariants:**

1. `solverIterations` defaulted to **1**, overwriting cannon's own **10** — every route ran a tenth
   of the constraint quality the backend ships with. A 6-box stack collapsed completely.
2. Capsule colliders were built as **flat-ended cylinders**. Indistinguishable on flat ground; on
   any slope the character rested on a rim 0.099 above the surface, so `grounded` was permanently
   false and a character on a ramp could not jump or step.
3. Every `raycast`/`sphereCast` **ignored body rotation**. Contacts respected it; queries did not.
   Slopes did not exist as far as any query was concerned.
4. Character **step-up fired before reaching the ledge**, then step-down undid it — one oscillation
   per frame with `grounded` flickering.

All four are in `packages/physics`, not in `apps/`. §B.4 confirms: **92.52%** of changed source
lines are under `packages/`, up from 87.41%.

### Phase 5 — routes, complete

- **136 routes tiered** by `tools/route-tiers` (Tier 1 = 4, Tier 2 = 31, Tier 3 = 101, Tier 4 = 0),
  derived from `docs/project/showcase/apps-classification.md` rather than hand-authored. 0
  unclassified, and a new route **cannot** be added without a tier.
- **All 35 Tier 1/2 routes health-checked in a real browser.** 32 pass. 3 pre-existing failures are
  pinned by name (below).
- **7 reported route defects** are retained regression cases in
  `tests/unit/apps/reported-route-defects.test.ts`, each asserting the route *reaches the shared
  fix* rather than re-testing the engine.
- **Blocked routes enforced** in all four places a promotion could happen, plus a review package
  showing **4 of 6 engine causes FIXED, 2 BLOCKED**.

### Phase 6, §7, §B, §10

- Developer friction measured for **both** engines: authored lines **9/13/19 vs 15/27/40**, one
  install vs two for a game runtime. Two fields declared `unmeasured` with reasons rather than
  fabricated.
- **WS-6.1 verdict: FAILS** on the bundle axis. Recorded as failing; not accommodated.
- §7: 9 files deleted (R8-cleared), 2 audits archived, `GameEngine-PRD.md` retained.
- **Version decided: `1.6.0`** from the measured matrix — 0 packages removed, 0 non-`three-compat`
  symbols removed. §12 expected `2.0.0`; both its premises turned out false.
- §10: **20 of 24** boxes met, two serial full runs with identical results.

---

## 5. What remains — ordered by whether you can act

### 5a. BLOCKED on a user decision — do not attempt

**ADR 0002 — the racing kit.** PRD lines 2682, 2697, 2709 (WS-4.7) and the R12 rows.

`game.racing` integrates its own kinematic motion: heading comes straight from steering input, so
the car has no slip, no yaw inertia, no lateral velocity — hence no weight transfer or understeer.
That is the "movement is not natural" symptom, and the last R12 duplicate-ownership row.

**The rewire was written in full and reverted.** It does not converge because `GameRacingRoute`
never states a length scale, and every tyre-model quantity is scale-dependent. Measured at the
correct arc-window corner radius of 1.005: **11 of 12** target-g × wheelbase configurations cannot
hold the tightest corner at the route's declared 4x pace, and the one that can delivers 120 g.
Raising the substep cap 64 → 1024 changed nothing, so it is not integrator stability — the tyre is
past its slip peak. The shipped pace is a *kinematic* pace.

**Ask the user to choose one:**

1. Add `unitsPerMetre` to `GameRacingRoute` and re-derive the certified pace.
2. Re-author the circuit geometry for the current pace.
3. Leave racing kinematic and close the R12 row as accepted debt.

Options 1 and 2 change shipped route evidence and the 60-second race proof, so they touch a
`prototype-blocked` route and need R5 review. **Do not tune constants until three real tests pass** —
that is the exact pattern this PRD exists to end (R2).

**§11 Release execution.** 13 boxes, PRD lines 3243–3263. Begins with "User states approval to
publish." Note the 1.5.1 failure mode recorded there: a partial publish left a **split registry**,
so post-publish verification must compare version **and integrity hash** across all ~27 packages.

### 5b. ACTIONABLE — the highest-value work left

**§B.1 bundle size — the release-defining condition.** PRD lines 116–121, 1319–1335, 3108, 3182.

> "1.6 succeeds only if renderer parity improves **AND** developer bundle size approaches
> Three.js." Both. Not either.

Measured, freshly:

| Scenario | Aura3D | Three.js | Ratio | Budget |
|---|---:|---:|---:|---:|
| 1 core primitive scene | 257,074 B | 119,296 B | **2.15x** | 1.25x |
| 2 product viewer | 258,168 B | 146,680 B | **1.76x** | 1.25x |
| 3 game runtime | 294,620 B | 143,669 B | **2.05x** | 1.50x |

**The work is scoped and sized for you.** `packages/rendering/src/ShaderLibrary.ts` is 191,160
bytes, of which **183 KB sits inside the single `createDefaultShaderLibrary()` function**
registering **15 shader variants eagerly**. A cube needs 2.

| | bytes of GLSL | variants |
|---|---:|---:|
| a cube **needs** (unlit + PBR) | 25,229 | 2 |
| a cube **pays for** | **157,414** | 13 |

Largest droppables: `TEXTURED_PBR` 54,289 · `SKINNED_LIT_EIGHT_INFLUENCE` 24,307 · `SKINNED_LIT`
23,931 · `NORMAL_MAPPED_PBR` 19,970 · `INSTANCED_PBR` 19,616. Dropping the first three alone is
102,527 bytes of source — more than the remaining gap, before gzip.

**The seam is narrower than the PRD's own two options suggest.** `Renderer.create()` is *already*
`async` (`Renderer.ts:461`), and all four consumers accept `options.shaderLibrary`, falling back to
`createDefaultShaderLibrary()` only when none is given (`Renderer.ts:457`, `ForwardPass.ts:203`,
`DepthPass.ts:50`, `EnvironmentBackgroundPass.ts:41`). So lazy family registration can be `await`ed
inside `Renderer.create` and handed down — **`ForwardPass.getShader` can stay synchronous**, because
the library is fully populated before the first frame.

Why I did not do it: 183 KB in one function means the split touches all 15 registrations at once,
and §B.1 is already measured and disclosed in `README.md`. Starting a render-path refactor at the
end of a session trades a known shortfall for an unknown risk of breaking all rendering. **You
should do it** — it is the single highest-value item left, and it unblocks 8 checkboxes plus the
release condition.

Before you start, PRD line 1319 requires you to **choose and record** the root bundle behaviour:
(a) root stays compatibility-heavy and budgets are enforced on lean entry points; (b) root becomes
lean and removed exports move to deprecated subpaths (breaking, feeds §12); or (c) root keeps every
export and provably tree-shakes. **(c) is only valid if measured.** Record the choice in
`MIGRATION-1.6.md`. Line 1330 is the trap: *"a budget met only by an entry nobody is told to import
is not a budget."*

**Three broken public routes.** Found by WS-5.2, pinned as a known-failing set in
`tests/browser/tier12-route-health.spec.ts`.

- `examples/material-showroom` — its **entire** `main.ts` is
  `import "../_quarantine/material-showroom/main";` and `examples/_quarantine/` was deleted from the
  tree. Unchanged since 1.5.0, so it has been 404ing ever since. **R8 blocks deletion** (11 release
  gates read its `main.ts` for static composition analysis), so it must be **repaired**. Its
  retained spec `tests/browser/rendering-external-parity-visuals.spec.ts` demands a real contract:
  22 named materials, 5 procedural texture fixtures, 3 environment presets.
- `examples/postprocess-lab`, `examples/shadow-lab` — never reach ready inside the 10 s budget, and
  render at half the expected DPR backing size.

Independent confirmation: `rendering-external-parity-visuals.spec.ts` already fails **7 of 10** on
`main` against exactly these three.

**Remaining smaller items:**

| PRD line | Item |
|---|---|
| 1088 | WS-2.1a: plumb glTF tangents `GLTFLoader.ts` → `Geometry.ts` → `MaterialBinding.ts`. `VertexFormat.P3N3T4T2` already carries a 4-component tangent, so this is loader plumbing, not a format change. Anisotropy parity stays `parity-unproven` for asset tangents until done. |
| 2560 | WS-4.3: full-route behaviour tests, end-to-end, per WS-5.3. |
| 136, 157 | §B.2: install-to-first-cube (needs a clean machine profile) and startup-to-first-frame (needs a browser). Both currently declared `unmeasured` **with reasons** — that is legitimate. Only fill them in with real measurements. |
| 185, 209, 3190, 3203 | §B.3 / R12 release conditions. `packages/*/src` is **+367 lines** (code +205, comments +1,020 — the recorded reasoning for each engine defect). **Do not delete those comments to hit the metric** (R2, R6). The honest routes are the deletions R8 refused or the vehicle consolidation ADR 0002 blocks. |
| 3133 | §10 credibility check: `npm pack` old vs new. Deferred deliberately — it describes a published candidate, so it belongs with §11 after the version is applied. |

---

## 6. Rules that will bite you

Full text in PRD §1. These are the ones that actually caught mistakes this session:

- **R1 — claim lineage.** No claim from evidence that does not execute the public production path.
  Reachability, not syntax. `@aura3d/*/src/*` deep imports satisfy nothing.
- **R2 — never weaken a test or threshold to pass.** Budgets are derived from measured Three.js
  builds; raising one requires Three.js to grow.
- **R3 — fix in `packages/`, never in `apps/*/src/main.ts`.** Enforced at ≥90% by
  `tools/engine-layer-ratio`.
- **R4 — a checkbox needs command output.** Not an assertion.
- **R5 — never promote the three blocked routes.**
- **R6 — line counts are observations, not targets.**
- **R8 — deletion needs the six-point machine report** (`tools/deletion-safety`). It refused a lot:
  ECS/scripting (61 of 68 files, 300 refs), all 38 fixture files (0 lines removed),
  `examples/data-galaxy` (370 refs), `examples/material-showroom` (11 gates). **Run it before
  deleting anything.**
- **R10 — one workstream per commit.**
- **R11 — architecture lock.** Four questions before any new subsystem, else an ADR.
- **R12 — single ownership.** Currently 2 of 5, both blocked on ADR 0002.

### Mistakes I made, so you can skip them

- **A tool that greps for a string will be satisfied by a comment.** My first R12 physics check
  looked for `"aura-js"` in `PhysicsWorld.ts` — which still appears in the doc comment explaining
  *why* there is one backend. It now counts union members. My WS-4.1 barrel comment likewise broke
  the PRD's own grep proof by naming the backend.
- **`null` is not `0`.** My route-health check failed 8 routes for "0 draw calls" when `drawCalls`
  was `null` — those routes do not publish that diagnostic. Treating "did not report" as "measured
  zero" is the same conflation that produced the fake gates this PRD exists to remove.
- **A test for a default must use the default.** My stacking invariant passed
  `solverIterations: 8`, so reverting the default to 1 left it green — it could not detect a
  regression in the very thing it protected.
- **Do not pin gitignored artifacts.** My WS-5.4 gate hashed PNGs under `tests/reports/**`, which
  are regenerable, so honest regeneration failed the gate. It now pins the digest recorded in the
  tracked `route-health.json`.
- **Check whether a canonical answer already exists.** My route classifier ignored
  `docs/project/showcase/apps-classification.md` and left 44 routes unclassified. That document is
  the policy; the tool should read it.
- **`git grep` before measuring geometry yourself.** I wrote a per-vertex corner-radius measure and
  got 0.480, then 0.684. Both wrong. `arcCurvature` already does it correctly over an arc window;
  the answer is 1.005, and its own comment explains why per-vertex is invalid.
- **Verify a regression test fails against the pre-fix code.** Reintroduce the defect, watch it
  fail, restore. Several of my tests only became real gates after that check.

---

## 7. Working agreement

- **Update `Aura3D-1.6-Replatform-PRD.md` as you go**, in the same commit as the work. Check the
  box, and append the measurement or command output that proves it. Where a box is **not** met,
  leave it unchecked and record *why*, with numbers — that is what the unchecked boxes in §B.1 and
  §B.3 look like today.
- Commit messages: what changed, what it measured, what it corrected. One workstream per commit.
- Run `pnpm typecheck:raw` and the relevant tests before each commit.
- If something has failed twice, stop and diagnose the root cause rather than tuning again. That is
  how ADR 0002 got written instead of a fudged racing kit.
- Report findings plainly, including your own errors. Several of the most useful results this
  session were discovering that a previous claim was wrong.
