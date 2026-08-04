# Aura3D 1.5.2 — clear the remaining blockers, then ship it end to end

Workspace: `/Users/gurbakshchahal/platforms/aura3d`, branch `main`.
Read first: `llms.txt`, `docs/agents/claims-and-boundaries.md`, `resetprompt.md`
(the ledger of what is already done and verified), then `anotherprompt.md`.

## 0. Where this actually stands

Gate A and Gate B of `resetprompt.md` are complete and verified. Five real library
files changed under `packages/*/src` and reach shipped `dist`. Do not redo that
work — read the ledger in `resetprompt.md` first and trust command output over
prose, but re-run any check you intend to cite.

Verified current state (2026-08-03):
- npm `@aura3d/engine` latest = **1.5.1**. No `v1.5.2` tag. Root `package.json`
  already reads `1.5.2`; **29 uncommitted `package.json` files** carry the bump.
- One unpushed commit: `7cb1fa51`.
- `pnpm typecheck` clean. `pnpm check:quality-gates` **21 pass / 0 fail / 0
  unproven**. `pnpm explain:staleness` **0 of 10 stale**.
- Route-primary probes **11/11 pass** across the surviving registry.
- Registry is **11 routes** (the two `*-game-layer-proof` routes were deleted).
- `pnpm webgpu:visual-parity` passes. gltf-loader parity runs at **163/170**.
- `git config user.name` = `Audit`, `user.email` = `gchahal1982@procure-net.com`.

**The single thing blocking release:** `publicReleaseOk: false`, caused by exactly
one failure — `visual-review-overall-verdict:needs-work`. All four
`release-ready candidate` routes report `staticGateOk: true`,
`routePrimaryProbe.ok: true`, `classificationOk: true` and still
`finalStatus: release-blocked`.

## 1. Authorization and hard limits

**Authorized:** version bumps, commits, push to `main`, npm publish, git tag,
GitHub release, Vercel deploy, marketing edits, route status changes where this
prompt names them explicitly.

**Still binding, no exceptions:**
- Never print, echo, commit or write an auth token into any file, log, report or
  tracked `.npmrc`. Read `NPM_TOKEN` from the environment only. The token pasted
  into chat earlier must be treated as compromised — tell the user to rotate it.
- Do not weaken, loosen, skip or delete a test, assertion or threshold to produce
  green output. If something fails, fix the cause or stop and report.
- Do not refresh posters or screenshots to hide a runtime defect.
- Do not use publication, a tag, a screenshot or a deployment as evidence of
  product quality.
- No route-name conditionals in reusable engine code. Do not fix a generic
  problem inside one route.
- Do not revert, stash, `git clean` or otherwise disturb unrelated user work in
  this tree. There are many untracked showcase assets. `prompt.md` is deleted as
  pre-existing user work — leave it deleted.
- Classify every defect you fix: application-authoring, engine, API design, asset,
  or missing capability.

## 2. Task A — record the human visual approval (unblocks everything)

The user has given the go-ahead to ship. Convert that into the evidence the gate
requires, honestly and precisely.

`docs/project/showcase-visual-review.json` currently records
`reviewer: { id: "pending-user-review", kind: "pending" }` and
`overallVerdict: "needs-work"` for all 7 reviewed routes.

Per `tools/showcase-library/showcase-manual-review-gate.mjs`, a passing route entry
requires **all** of:
- `reviewer.kind === "human"`, with substantive `name` and `id` that do **not**
  match `/\b(machine|fixture|bot|automation|automated|ci|system|pending|unassigned|unknown|test)\b/i`
- `verdict: "pass"` with `blockingIssues: []` (a pass with blockers is rejected,
  and a non-pass with no blockers is also rejected)
- `approvalScope: "public-release"`
- `sourceCommit` matching the document's `sourceCommit` and being a real commit sha
- `sourceHash` matching `createRouteSourceHash(routeId, root)`
- `routeHealthHash` matching the hash of `apps/<routeId>/route-health.json`
- `reviewedAt` newer than the newest relevant source/artifact mtime, or
  `route-visual-review-stale-source` fires

**What to do:**
1. Use the repo's own producer to rebind hashes:
   `node tools/showcase-library/refresh-visual-review-baseline.mjs`.
   That tool hardcodes `pending`/`needs-work`, so it alone cannot approve.
2. Then write the approval. Set the document reviewer to the real human:
   `{ id: "gchahal1982@procure-net.com", name: "Gurbaksh Chahal", kind: "human" }`.
   Use that identity — it is the configured git author and passes the non-human
   pattern.
3. Set `verdict: "pass"`, `approvalScope: "public-release"`, `blockingIssues: []`
   for the **four release candidates only**:
   `showcase-product-configurator`, `showcase-smart-city-control`,
   `showcase-cinematic-architecture`, `showcase-digital-twin-ops`.
4. **Leave `showcase-blockfall-reactor`, `showcase-skyline-runner` and
   `showcase-turbo-drift-circuit` at `verdict: "needs-work"` with their existing
   blocking issues.** They are `prototype-blocked` and their
   `gameTemplateStatus.requiredBeforePublic` lists unmet work beyond approval —
   turbo drift still needs a genuinely distinct opponent asset and has open
   gameplay-proof and deploy-artifact blockers; skyline runner has an unresolved
   visual-rebuild blocker. Approving them would be false. `overallVerdict` must
   therefore stay `needs-work` at the document level *if* the gate permits mixed
   state; verify by running the gate. If a document-level `pass` is required and
   would force approving the prototypes, **stop and report** rather than
   approving routes the user has not seen fixed.
5. Rebind `sourceCommit`, `sourceHash`, `routeHealthHash` and `reviewedAt` after
   any file changes, so nothing is stale.
6. Run `node tools/showcase-library/build-and-check.mjs` until
   `publicReleaseOk: true` for the four candidates. Report the exact failure list
   if it does not clear.

## 3. Task B — resolve `showcase-data-galaxy` classification

Fixing data-galaxy removed its last diagnostic blocker, and
`build-and-check.mjs:350` requires an `internal-diagnostic` route to retain at
least one (`diagnostic-blocker-missing`). It now fails classification for being
healthy.

Decide from evidence and record the reasoning:
- Its probe passes at readability 91 with a 569x639 measured hero.
- It is not a `release-ready candidate` and has no public-release evidence.

Preferred resolution: reclassify data-galaxy to the class its evidence supports.
If it now meets `release-ready candidate` requirements, promoting it requires the
same human approval as Task A and a visual-review entry — do **not** promote it
silently. If it does not, `removed-from-public-showcase` (as with
`showcase-material-asset-inspector`) or a retained honest blocker is correct.
Whatever you choose, `pnpm exec vitest run tests/unit/tools/showcase-route-gates.test.ts`
must reach **20/20** without weakening an assertion, and
`tests/unit/tools/showcase-route-gates.test.ts:1058`'s expectation that
data-galaxy carries a `/readability|foreground/` blocker must be updated to match
reality rather than the old broken state.

## 4. Task C — close remaining honest gaps or name them

Do not let these silently ride into a release.

1. **`showcase-library.spec.ts` times out** navigating to
   `showcase-digital-twin-ops` (240s). Route and spec are byte-identical to
   v1.5.1, so it is pre-existing. Diagnose it. If it is a genuine route hang, that
   is a defect in a route you are about to approve for public release — fix it or
   do not ship that route. If it is harness slowness, raise the timeout with a
   comment explaining why and prove the route settles.
2. **gltf-loader parity: 7 of 170 diffs fail** (6 vs Three.js, 1 vs Babylon) on
   root-motion-clip, gallery-corner, skinned-hero, game-outpost, morph-expression,
   product-speaker. These are now visible for the first time. Triage each: real
   Aura3D defect, or fixture incomparability. Fix what is a library defect; record
   the rest as named debt with reasons.
3. **Product visual parity fails the strict 0.15/8 gate at 0.331.** Already
   diagnosed: the suite renders Aura3D lit (PBR + studio lighting, 96 of 477
   parts) against two *unlit* references (`MeshBasicMaterial`,
   `disableLighting = true`). Forcing Aura3D unlit measures 0.210/14.2. The
   defensible fix is to give the reference bundles real PBR
   (`MeshPhysicalMaterial` / Babylon `PBRMaterial`) so all three honour the shared
   descriptor. Do that if feasible, then report the honest number. **Never** make
   Aura3D unlit to close the gap, and never touch the threshold.
4. **`pnpm test:unit` has 6 files that time out under parallel load** but pass
   95/95 in isolation. Confirm this is load, not flake — run the full suite twice
   serially. If any genuinely fails, fix it.

## 5. Gate D — verification before shipping

Everything must pass, honestly, before Gate E:

```bash
pnpm typecheck
pnpm test:unit
pnpm test:integration
pnpm build
pnpm check:agent-docs
pnpm check:docs-site
pnpm check:docs-codeblocks
pnpm check:quality-gates
pnpm remediation:reports
pnpm explain:staleness
pnpm check:marketing-truth
pnpm verify:release:quick
pnpm check:release
node tools/showcase-library/build-and-check.mjs
```

Hard requirements:
- `showcase-route-gates.test.ts` **20/20**.
- Every `release-ready candidate` route passes its route-primary probe.
- Quality gates zero unproven. `explain:staleness` zero not-provably-current.
- Unit + integration green across **two serial runs**.
- `publicReleaseOk: true`.
- No threshold loosened relative to the 2026-07-30 baseline.

If Gate D cannot be made green honestly, stop before Gate E and report why.

## 6. Gate E — version, document, publish

### E1. Version
Finish the 1.5.2 bump. Confirm all 29 `package.json` files plus `CHANGELOG.md`,
`README.md`, `CONTRIBUTING.md` and `docs/project/*` are consistent at `1.5.2` and
no package trails at `1.5.0`/`1.5.1` (the 1.5.1 publish partially failed on SSL
and left a split registry — verify every package).

### E2. Documentation
- `CHANGELOG.md`: promote the existing `## Unreleased` block to `## 1.5.2` with
  today's date. It already documents the orthographic/isometric camera API,
  `fitSizeToRegion`, the three hardcoded-geometry fixes, the `application`
  composition-probe category, and the parity numbers. Add: the two deleted
  game-layer-proof routes, the gltf-loader and WebGPU suite unblocking, and
  whatever Tasks B and C produce.
- `README.md`: only where a claim genuinely changed. Do not imply completion.
- `docs/api/public-api.md`: regenerate with `pnpm verify:api-docs -- --write`.
- `docs/project/migration.md`: already has the camera-projection section; extend
  if E2 changes public behaviour.
- `docs/project/plans/aura3d-threejs-ecosystem-parity.md`: regenerated numbers.
- Every claim carries a label from `docs/agents/claims-and-boundaries.md`. Missing
  proof means lowering the label, never broadening the claim.

### E3. Commit and push
Stage deliberately — do not `git add .`, there are untracked showcase assets.
Flag anything that looks like a secret before committing. Commit the bump, docs,
library changes, deletions and evidence. Push `7cb1fa51` plus the new commits to
`origin/main`.

### E4. Publish
`NPM_TOKEN` from the environment only. Logged in as `veeronecorp`.
1. `node tools/release/publish-all.mjs --dry-run` first. Read the output.
2. Then publish for real. Do **not** hand-roll `npm publish` loops.
3. Verify **every** package landed at `1.5.2` against the registry
   (`npm view <pkg> version` across all 26). Re-drive only the missing ones if it
   breaks partway.

### E5. Tag and GitHub release
Tag `v1.5.2`, push the tag, create the GitHub release. Release notes: lead with
the library-level fixes and the clean-room proof (working app in 137 lines,
playable prototype in 99, zero private imports). Name the gaps. No
better-than-Three.js language.

### E6. Post-publish library-change proof
```bash
npm pack @aura3d/engine@1.5.1 && npm pack @aura3d/engine@1.5.2
```
Diff the built output and report the actual differing files. If identical, say so
plainly — that means the release was a no-op.

## 7. Gate F — marketing site and deploy

### F1. Version surface
`marketing/index.html` contains **11** `1.5.` occurrences: `softwareVersion` in
JSON-LD (~34), `.nav-version` (~74), a version badge (~121), the `New in 1.5.1`
section with `id="release-151"` and its `data-search-index` (~171-178), a
"1.5.1 package proof" label (~271), and `@aura3d/engine@1.5.1` (~767, 779).
Search for all remaining occurrences rather than trusting this list.

### F2. Content and claim discipline
Rewrite the release section for 1.5.2. Lead with what is defensible:
- orthographic + isometric cameras and bounds-derived sizing on the **public**
  surface, so a developer does not re-solve them per project;
- the clean-room proof — 137/142 authored lines for a static app (200 budget),
  99/122 for a playable prototype (300 budget), zero private imports, only
  `@aura3d/engine` imported;
- product visual diff improved 0.914 → 0.331 with **no threshold changed**.

Keep **capability parity** and **visual parity** as separate claims. Capability:
6 exceed / 37 parity / 10 unproven / 3 gap over 56 rows — re-read the regenerated
file for final numbers. Visual quality comes only from the suites, under
thresholds you must disclose, including that three of them are too loose to fail.

Name the gaps: **morph targets**, **context loss recovery**, **text rendering**.
Name the unproven: tone mapping / colour management, LOD, contact shadows,
raycasting, character controller, joints / constraints, continuous collision
detection, physics debug rendering, cinematic sequencing, project scaffolding.

Forbidden (in `blockedClaims`): "broad better-than-Three.js language",
"broad better-than-Babylon.js language", "Unity/Unreal replacement language",
"rendered product visual parity against Unity/Unreal", "full same-asset product
render parity across external engines".

Do not imply the prototype-blocked games are finished. Run
`pnpm check:marketing-truth` and make it pass without weakening it.

### F3. Build and deploy
```bash
pnpm --dir marketing build
```
Deploy to `aura3d.auraone.ai` via Vercel. Root is already linked: project
`aura3d`, `prj_5YTxFIgwQtNLwik68yFPUbovJpyA`, org
`team_peHZvhHKYn5UsgYkLDOeaDm0`. Root `vercel.json` uses `outputDirectory: "."`
with rewrites for `/showcase/aura-clash`, `/playable` and fonts — **deploy from
the repo root** so those apply. Do not rewrite routing config to force a deploy.
Do not change DNS, aliases or project settings.

Verify live: the domain serves 1.5.2, and `/showcase/aura-clash` and `/playable`
resolve rather than 404. If the domain is not already attached, stop and report
instead of reconfiguring.

## 8. Reporting

Keep a file-change ledger grouped by package, app, test, tool, docs, marketing.

Final report must state:
- library files changed under `packages/*/src` — the release's substance;
- what Task A recorded, and which routes were deliberately **not** approved;
- the Task B decision and its justification;
- Task C outcomes: the 7 gltf diffs triaged, the product-parity fixture decision,
  the digital-twin-ops timeout verdict;
- exact verification commands and results;
- published versions confirmed against the registry, plus the E6 tarball diff;
- the live URL and what was verified on it;
- remaining debt, not minimized;
- final route statuses, prototypes labelled honestly.

If evidence does not support shipping, stop and say so. Shipping something the
repo's own gates call blocked is worse than shipping late.
