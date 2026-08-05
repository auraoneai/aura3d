# Finish GameEngine-PRD.md, then ship 1.5.3

You are continuing work in `/Users/gurbakshchahal/platforms/aura3d`. Your job is to
complete every remaining task in `GameEngine-PRD.md`, tick each one off in that file
as it is genuinely done, then commit, push, and release 1.5.3.

Read `GameEngine-PRD.md` in full before doing anything. It is the specification.
This prompt tells you the verified starting state, the order to work in, and the
rules that make the result real rather than cosmetic.

---

## 0. Verified starting state (confirmed by command 2026-08-04 — re-verify, do not trust)

`resetprompt.md` is **finished and closed**. 1.5.2 is published (all 26 packages),
tagged `v1.5.2`, GitHub release live, `aura3d.auraone.ai` serving 1.5.2. Do not
reopen it. Do not re-verify it. It is not your task.

`GameEngine-PRD.md` is the active work and **its checkboxes are stale**: 4 ticked
(WS-0 only), 47 unticked. Much of WS-1 through WS-3 is actually done in unpushed
commits. Your first job is to make the file tell the truth, then finish the rest.

### 7 unpushed commits on `main` (3,161 insertions, all library-level)

```
cc4624af WS-0: correct the false parity claims before building on them
588a5d7c WS-1: public physics runtime, and fix applyForce being a silent no-op
9a0d1f93 WS-2: real mesh surface queries, ending the baked-plane defect class
8bc01390 WS-3.1/3.2: mesh-backed vehicle surface, and two real chassis defects
1fc1b10e WS-3.6/3.7: apex from declared intent, plus the mechanics that make a jump feel like one
7d6bb08e WS-3.5: character controller against mesh, and three more real defects
edde88af WS-3.3/3.4: force-based vehicle motion, and CCD proven
```

New: `PhysicsRuntime.ts` (402), `MeshBVH.ts` (326), `VehicleMotion.ts` (290),
`SurfaceQuery.ts` (159); `CharacterController.ts` +363, `PlatformerMotion.ts` +154.
Six new physics test files. **138/138 physics tests pass. `pnpm typecheck` is clean.**

### Dirty tree — in-progress WS-3.8/WS-4 work, 17 modified tracked files

Including `apps/showcase-turbo-drift-circuit/src/main.ts` (+111),
`apps/showcase-skyline-runner/src/level.ts`, `packages/engine/src/agent-api/GameGenreKits.ts`,
`packages/engine/src/agent-api/PlatformerMotion.ts`, and generated
`game-geometry.ts` for both games. **Do not discard this work** — inspect it,
understand what it was reaching for, and finish it. Per AGENTS.md rule, do not
revert unrelated user changes; there is 1 untracked file, leave it alone.

### What audit proved is ALREADY DONE (tick these after re-verifying, do not redo)

- **WS-1.1, 1.2, 1.3, 1.8** — `applyForce/applyImpulse/applyTorque`, `onCollision`,
  `onCollisionWith`, `onTriggerEnter/Exit`, `raycastAll`, `sphereCast`,
  `overlapSphere`, `overlapBox` all present in `PhysicsRuntime.ts`; exported via
  `export * from "./PhysicsRuntime.js"` at `agent-api/index.ts:73`
- **WS-2.1, 2.2, 2.3** — BVH matches brute force on 1000 random rays over a
  10k-triangle mesh (test passes); mesh surface queries real
- **WS-3.1–3.7** — force-based tyre model, no tunnelling at 200 km/h with a 16 ms
  step (test passes), character controller against mesh, apex from declared intent
- **WS-4.3, 4.4** — `vehicle-mesh-contact.test.ts` (8 tests) and
  `character-mesh-contact.test.ts` (10 tests) exist and pass

### What audit proved is NOT done, contrary to commit messages

- **WS-1.4 collision layers and masks** — `collisionLayer` returns **0 matches** in
  `PhysicsRuntime.ts`. Not implemented as specified.
- **WS-1.6 ball-socket joints** — `ballSocket` returns **0 matches**. `hinge`,
  `slider`, `spring`, `motor` are present; ball-socket is missing. WS-1.6 asks for
  six joint types. Also confirm `fixed`.
- **WS-1.7, WS-1.9** — `packages/physics/src/PhysicsDebugDraw.ts` and
  `docs/concepts/physics.md` both exist **but were already in `origin/main`**.
  Their existence is not evidence of new work. WS-1.7 requires a real consumer;
  WS-1.9 requires runnable snippets for the new runtime. Verify content, not paths.
- **WS-4.1** — route-local lies still present in
  `apps/showcase-turbo-drift-circuit/src/main.ts`: `CAR_GROUND_Y` ×6,
  `VERGE_DROP` ×3, `CAR_TYRE_CONTACT_Y` ×2, `SHOULDER_WIDTH` ×2,
  `TRACK_SURFACE_Y` ×1
- **WS-4.2** — `grep -cE "gravity:|jumpVelocity:" apps/showcase-skyline-runner/src/main.ts`
  returns **3**, target is 0
- **WS-5.1, 5.2, 5.3** — arch opacity, transparency sorting, live-site `SPEED 0`
- **WS-6.1, 6.2, 6.3, 6.4** — no clean-room dirs exist for `physics-sandbox`,
  `top-down-shooter`, `physics-puzzle`. `tests/clean-room/` currently holds only
  `product-configurator`, `digital-twin`, `racing-prototype`, `platformer-prototype`.
  `PROJECTS` in `tests/browser/clean-room-projects.spec.ts` has those 4 entries
  (lines 35–71), each with `id`, `dir`, `kind`, `globalName`, `lineBudget`,
  `controls`, `keys`. Static apps budget 200, playable prototypes 300.
- **WS-7.1–7.6** — `pnpm check:game-runtime` does **not exist** in `package.json`.
  `tools/showcase-library/game-visual-qa.mjs` (23,559 bytes) and
  `tests/browser/showcase-gameplay-proof.spec.ts` (46,276 bytes) both exist and are
  where 7.1–7.5 belong; extend them, do not create parallel tools.

**The headline problem:** the general physics layer got built, but the two flagship
games still bypass it. That is precisely the failure mode `GameEngine-PRD.md` was
written to prevent. WS-4 is the highest-value remaining work.

---

## 1. Rules — non-negotiable

These come from `AGENTS.md`, `docs/agents/claims-and-boundaries.md`, and
`GameEngine-PRD.md` §1. Re-read the PRD's four grep-enforceable rules before starting.

1. **Never weaken a test, assertion, threshold, or gate to make it pass.** If a gate
   fails, either fix the product or record the failure as open debt. Loosening is
   forbidden. If you believe a threshold is wrong, say so and leave it alone.
2. **No route-name conditionals in engine code.** No `if (route === "turbo-drift")`.
   A fix that applies to one route only is not a fix.
3. **Fix at the lowest correct layer.** If both games need it, it belongs in
   `packages/`, not in `apps/*/src/main.ts`.
4. **No `three`, `GLTFLoader`, `OrbitControls`, or hand-rolled render loops** in
   public examples, routes, templates, or clean-room projects. No deep
   `@aura3d/*/src/*` imports — public package exports only.
5. **Classify every defect** before fixing: application-authoring / engine /
   API-design / asset / missing-capability. Record the classification.
6. **Tick a PRD checkbox only when you have command output proving it.** Paste or
   cite the proof in the PRD row. A file existing is not proof; a passing test that
   fails when you revert the fix is.
7. **Write the gate before the fix where the PRD says so.** WS-7 rows state
   "Observed failing on 1.5.2" — you must actually observe the failure first, record
   it, then fix. A gate that never failed proves nothing.
8. **Do not promote route statuses.** `blockfall-reactor`, `skyline-runner`,
   `turbo-drift-circuit` stay `prototype-blocked` unless their gates genuinely pass.
9. **Do not refresh posters or screenshots to hide defects.** Do not use publication,
   tags, screenshots, or deployment as quality evidence.
10. **No secrets in files.** Read `NPM_TOKEN` from the environment only. Never write a
    token into any file, commit, or log. If you find one, do not persist it.
11. **Do not touch npm/GitHub auth, DNS, or Vercel project settings.**

---

## 2. Order of work

Follow the PRD's own sequencing (§3). WS-1 before WS-3, WS-3 before WS-4, gates
before their fixes, WS-6 last as the real acceptance test.

### Step A — Make the PRD honest (do this first, it is cheap)

Re-verify each "already done" item above with a command. For every one that holds,
tick it and cite the proof. For WS-1.4, 1.6, 1.7, 1.9 leave unticked and note the
audit finding in the row. Update **Status:** at line 3 to reflect reality.

Deliverable: `GameEngine-PRD.md` checkbox state matches the repo, with evidence.

### Step B — Finish WS-1 gaps

- **1.4** Collision layers and masks. Unit test: masked pairs generate no contacts.
- **1.6** Add ball-socket (and confirm `fixed`) so all six joint types exist, each
  with a stability test.
- **1.7** Give `PhysicsDebugDraw` a real consumer that renders colliders, contacts,
  normals, joints, sleeping state, raycasts.
- **1.8** Re-assert: everything reachable from the public API, zero deep imports.
- **1.9** Document the runtime in `docs/api/public-api.md` and
  `docs/concepts/physics.md` with **runnable** snippets: push a crate, detect a
  pickup, raycast for line-of-sight, build a hinged door. `pnpm check:docs-codeblocks`
  must pass.
- **1.5** Audit declared shape coverage (`capsule`, `cylinder`, `sphere`,
  `convexHull`, `trimesh`, `heightfield`) against what the backend actually supports.

### Step C — WS-3.8, WS-3.9 (the structural change)

All four kits consume `PhysicsRuntime` + `SurfaceQuery`; no kit integrates its own
bodies or contacts. Write the architecture test that enforces it. Then make kits
*compositions* over the general layer and document the composition path, so a fifth
genre needs no new kit code — WS-6.2 is the proof of this.

### Step D — WS-4 (highest value; finish the dirty-tree work)

Delete the route-local approximations and put both games on the general layer.

- **4.1** Remove `TRACK_SURFACE_Y`, `CAR_GROUND_Y`, `CAR_TYRE_CONTACT_Y`,
  `VERGE_DROP`, `SHOULDER_WIDTH` and the analytic `circuitSurface.sample` from
  turbo-drift. All five counts → 0.
- **4.2** Skyline declares `jumpHeight` / `feel` only.
  `grep -cE "gravity:|jumpVelocity:"` → 0.
- **4.3 / 4.4** Prove the mesh-contact tests are **load-bearing**: revert the 4.1/4.2
  fix, observe the test fail, restore, observe it pass. Record both observations.
  A passing test that would also pass on the broken code is worthless.

Note both games have modified generated `src/generated/game-geometry.ts`. Understand
how geometry is generated before hand-editing anything generated — check
`packages/create-aura3d/src/showcase-spec-game-geometry-extractor.ts`.

### Step E — WS-5 (rendering + telemetry)

- **5.1** Root-cause the translucent DUNLOP arch. Likely glTF alpha-mode misread
  (`OPAQUE` treated as `BLEND`) or unsorted transparency. **Classify before fixing.**
- **5.2** Correct transparent sort order and depth-write policy in
  `packages/rendering/src/Renderer.ts`. Overlapping transparent quads must composite
  correctly.
- **5.3** Fix live-site `SPEED 0` while `STATUS running`. Reproduce first: determine
  whether the HUD reads a different state object than the simulation, or whether the
  car is genuinely stationary. Classify, then fix. Note the WS-0.4 retraction — this
  is a live-site defect, not a clean-room one.

### Step F — WS-7 (gates, each observed failing first)

Extend `tools/showcase-library/game-visual-qa.mjs` for 7.1–7.4 and
`tests/browser/showcase-gameplay-proof.spec.ts` for 7.5. Then add
`"check:game-runtime"` to `package.json` running 7.1–7.5, and wire it into
`check:release`.

For each of 7.1–7.4 the PRD demands you **observe it failing on 1.5.2** before the
fix lands. If you have already fixed the defect in Step D/E, check out the 1.5.2 tag
or stash, run the gate, capture the failure, then restore. Record the observed
failure output in the PRD row.

### Step G — WS-6 (the real acceptance test, last)

Three new clean-room projects under `tests/clean-room/`, public API only, zero
private imports, matching the existing `PROJECTS` entry shape in
`tests/browser/clean-room-projects.spec.ts`:

- **6.1** `physics-sandbox` — stack crates, impulse-push them, detect collisions,
  raycast to pick. Under 200 authored lines.
- **6.2** `top-down-shooter` — **no kit code**: projectiles, collision layers so
  bullets miss each other, trigger pickups, enemy hit events. Under 300 lines.
- **6.3** `physics-puzzle` — hinged door, sliding block, spring platform. Joints
  only, no kit. Under 300 lines.
- **6.4** Add all three to the suite with the same budgets and zero-private-import
  rule. **7/7 clean-room projects pass.**

If 6.2 cannot be built without writing kit code, the layering is still wrong — say
so plainly and fix the layering. Do not smuggle in a kit and call it done.

### Step H — Definition of done

Work through `GameEngine-PRD.md` §4 line by line and confirm each item with
evidence. Every one of the 51 checkboxes is either ticked with proof, or explicitly
retracted with a stated reason (as WS-0.4 was). No silent skips.

---

## 3. Verification before release

Run these and get them green. If something fails, fix the product — never the test.

```bash
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm build
pnpm check:game-runtime          # new, from WS-7.6
pnpm test:browser
pnpm test:visual
pnpm remediation:reports         # regenerate parity/physics-audit/inventory
pnpm check:quality-gates
pnpm check:agent-docs
pnpm check:docs-codeblocks
pnpm check:release
pnpm verify:release
```

Then, because `remediation:parity` regenerates the Three.js parity scorecard:
re-read it and confirm the physics rows now reflect reality. WS-0 downgraded
`vehicle dynamics` and `vehicle AI driving` to `parity-unproven`. If WS-1/2/3 have
genuinely earned an upgrade, upgrade with evidence. If not, leave them down. Do not
upgrade a row to make the release look better — `blockedClaims` and the
`parity-consumers` test exist to catch exactly that.

Run `pnpm verify:release:repeat` (3 serial runs) to catch flake before publishing.

---

## 4. Commit and push

Commit in logical units, not one giant commit. Suggested grouping:

1. PRD honesty pass (Step A)
2. WS-1 gaps: layers/masks, ball-socket, debug-draw consumer, docs
3. WS-3.8/3.9 kits-as-compositions + architecture test
4. WS-4 route-local lies deleted, both games on the general layer
5. WS-5 rendering + telemetry fixes
6. WS-7 gates + `check:game-runtime` wired into `check:release`
7. WS-6 three clean-room projects, 7/7 passing
8. Version bump to 1.5.3

Message style: match the existing 7 commits — `WS-n: what changed, and the defect it
fixed`. State the defect class. Do not claim more than the tests prove.

Stage specific files, not `git add .` — there is untracked user content in this tree.
Push to `main` (authorized for this release; the 7 existing commits also need to go).

---

## 5. Bump to 1.5.3 and release

Only after §3 is green and §4 is pushed. **1.5.3 must not publish until it contains
real `packages/*/src` changes** — the same gate that governed 1.5.2:

```bash
git diff --name-only v1.5.2..HEAD | grep "packages/.*/src/"
```

Empty output means **STOP**. It will not be empty if you did the work above.

1. **Bump** 1.5.2 → 1.5.3. 57 files currently carry `1.5.2` (all `package.json`
   plus CHANGELOG/README/CONTRIBUTING/docs). Update every one; the root
   `package.json` too. Then `pnpm verify:docs-version` and
   `pnpm verify:versioned-release` must pass.
2. **CHANGELOG** — write a real 1.5.3 entry describing the game-engine work:
   public physics runtime, mesh surface queries, kits as compositions, the defect
   classes closed. Name the gaps that remain. No marketing language.
3. **Publish** via `node tools/release/publish-all.mjs` — **dry-run first**. Note
   that 1.5.1 partially failed on an SSL error and left the registry split, so after
   publishing, verify **every** package landed at 1.5.3, not just `@aura3d/engine`.
4. **Tag** `v1.5.3` and create the GitHub release.
5. **Prove the library changed** — the C4 check that made 1.5.2 credible:
   ```bash
   npm pack @aura3d/engine@1.5.2 && npm pack @aura3d/engine@1.5.3
   ```
   Extract both, diff, and confirm the new physics symbols (`PhysicsRuntime`,
   `MeshBVH`, `SurfaceQuery`, collision layers, ball-socket joints) appear in 1.5.3
   and are absent in 1.5.2. This is what proves the fix is library-level and not a
   game patch.
6. **Marketing** — `marketing/index.html` has 11 hardcoded `1.5.2` strings. Update
   them, and update the capability content to reflect the new physics runtime.
   Keep the honest gap disclosures on the page; do not remove them.
   `pnpm check:marketing-truth` and `pnpm check:marketing-links` must pass.
7. **Deploy** to `aura3d.auraone.ai` from the repo **root** (root `vercel.json` uses
   `outputDirectory: "."` with rewrites for `/showcase/aura-clash` and `/playable`).
   Project `aura3d`. Do not change Vercel settings. If the domain is not already
   attached, stop and report.
8. **Confirm live** — fetch the deployed site, assert 1.5.3 appears and zero `1.5.2`
   strings remain.

---

## 6. Report honestly at the end

State plainly:

- Which of the 51 PRD checkboxes are ticked with proof, which were retracted and why
- Whether WS-6.2 was truly built with no kit code (the generality proof)
- Which gates were observed failing before their fix, with the failure output
- What visual/parity thresholds still fail, and which claims stay blocked
- Anything you could not verify

Do not report a claim as supported when the repo's own tooling refuses to back it.
If the physics layer is genuinely general now, the evidence will say so; if it is
not, say that instead. The 1.5.3 release is only worth shipping if a developer could
pick up `@aura3d/engine` and build an arbitrary physics game against the public API
without touching a kit or a private import — that is the bar, and WS-6 is how you
find out whether you cleared it.
