# Aura3D 1.6 release handoff

Date: 2026-08-08
Status: release candidate; publication is blocked only by the required human visual verdict and the release sequence that follows it

Read this file, then `Aura3D-1.6-Replatform-PRD.md`, `MIGRATION-1.6.md`,
`llms.txt`, and `docs/agents/claims-and-boundaries.md`. The PRD remains the
authoritative checklist.

## Current repository state

| Item | Current value |
| --- | --- |
| Branch | `main` |
| Candidate version | `1.6.0` |
| Current local evidence commit | `018d0730` |
| Last published release tag | `v1.5.2` |
| Local commits ahead of `origin/main` at this handoff | 128 |
| Public package set | 26, including the root `@aura3d/engine` package |
| PRD checklist | 283 checked, 12 unchecked, 0 partial |
| Package-source lines | 200,924 versus the frozen 200,929 baseline: **−5** |
| R12 duplicate owners | **0/5** |
| Route tiers | Tier 1: 4; Tier 2: 39; Tier 3: 102; 145 total; 0 unclassified |

Re-run `git status --short` and the named evidence commands before relying on
this snapshot. Generated release-trace documents may be dirty after a failed or
partial verifier and must be regenerated from the canonical checklist rather
than edited as source.

## Completed implementation

The remaining 1.6 code, architecture, packaging, and measurement blockers are
closed:

- ADR 0003 supersedes ADR 0002 for shared runtime ownership. Arcade vehicle and
  platformer integration now use shared `GameRuntime` owners, and architecture
  tests reject private continuous integrators.
- R12 is 0/5 and tracked package source is five lines below the frozen baseline.
- The lean public entries remain within their unchanged absolute budgets. The
  current Aura/Three scenario ratios are 0.582x for core, 1.248x for product,
  and 0.832x for game.
- The root tarball finalizer resolves exported workspace subpaths internally.
  Fresh isolated package installation, Node ESM import, TypeScript, and Vite
  browser bundling pass without monorepo aliases.
- The release installer includes the complete locally packed package set.
- Install-to-first-cube is measured from isolated projects with 12 retained
  samples per candidate, cold and warm state, raw timestamps, environment, and
  rendered-pixel proof. Cold medians are 6,638.6 ms for Aura3D and 5,047.9 ms
  for Three.js; warm medians are 3,199.5 ms and 2,297.7 ms respectively.
- The unused private `packages/test-utils` workspace was removed after graph,
  consumer, build, typecheck, and deletion-safety proof. The public release set
  is 26 packages.
- The website source contains the 1.6 installation, lean-entry, migration,
  bundle, examples, limitations, GitHub, npm, and documentation updates. The
  canonical production hostname is `https://aura3d.auraone.ai`; `aurd3d` is a
  typo, not a separate product or deployment.

## Current verification evidence

The latest canonical browser run passed **37/37** in one invocation. It
regenerated the route-primary probes after the final renderer fingerprint
change. The focused retained-evidence checks then passed **76/76**, and
`pnpm verify:demos` passed with 3/3 browser-ready and 3/3 visual-pixel examples.

The Product Configurator route-primary screenshot changed during that canonical
run. `synchronize-route-primary-asset-evidence.ts` updated the generated asset
manifest and typed map to the current image hash. The freshness suite passed
56/56 after synchronization.

The showcase build/deploy checker now has exactly one class of failure:
independent human approval is absent for the four public release candidates.
All four candidates pass static, typed-asset, route-primary, build, deploy,
interaction, and structural review checks. The visual-review document is an
intentionally rejected baseline with `reviewer.kind: "pending"` and
`overallVerdict: "needs-work"`.

## Required human verdict

The owner must inspect and explicitly approve or reject the exact retained
desktop, mobile, and interaction frames for:

- `showcase-product-configurator`
- `showcase-smart-city-control`
- `showcase-cinematic-architecture`
- `showcase-digital-twin-ops`

The exact workflow is in `docs/project/VISUAL-REVIEW-SIGNOFF.md`. Approval must
include a real reviewer identity and must preserve the hashes and perceptual
signatures written by `refresh-visual-review-baseline.mjs`.

Do **not** approve or promote these prototype routes:

- `showcase-blockfall-reactor`
- `showcase-skyline-runner`
- `showcase-turbo-drift-circuit`

They remain `prototype-blocked` even if their machine gates pass.

## Commands already green after final runtime work

These results are current to the evidence commit above; rerun them after any
source or generated-asset change:

```bash
pnpm typecheck
pnpm build
pnpm test:browser
pnpm exec vitest run \
  tests/unit/tools/evidence-freshness.test.ts \
  tests/unit/tools/replicability-metrics.test.ts
pnpm verify:demos
pnpm verify:package-install-smoke:fresh
pnpm verify:package-provenance
pnpm exec vitest run tests/unit/package-dist --reporter=dot
pnpm measure:install-to-first-cube
```

`node tools/showcase-library/build-and-check.mjs` is expected to remain nonzero
until the human verdict is recorded. Do not suppress that failure.

## Release sequence after approval

After a valid human verdict is recorded:

1. Rerun the showcase build/check and `showcase-route-gates` unit coverage.
2. Regenerate the requirements trace from the canonical release checklist and
   update only checklist items actually proven by evidence.
3. Commit all final docs and evidence, confirm a clean worktree, and record the
   exact release commit.
4. Run the complete release suite twice, serially, from that same clean commit.
5. Build and audit all 26 public-package tarballs from that commit; run isolated
   Node ESM, TypeScript, Vite/browser, provenance, and clean-install checks.
6. Verify `npm whoami`, confirm 1.6.0 is unpublished for every package, and use
   `node tools/release/publish-all.mjs` in dependency order. Never put a token in
   command arguments or repository files. Pause if npm requests interactive
   2FA.
7. Verify every npm version, dist-tag, integrity, tarball, dependency, and export
   from the registry, then repeat external-consumer checks from registry installs.
8. Push `main`, create `v1.6.0` at the exact approved commit, verify the remote
   SHA, and create the GitHub release with the actual migration, package, bundle,
   example, and limitation notes.
9. Deploy `marketing` through its linked Vercel project, verify the preview,
   promote it to `https://aura3d.auraone.ai`, and inspect the live desktop/mobile
   pages, routes, links, assets, console, network, and version text.
10. Complete the 12 remaining PRD boxes with external receipts, regenerate the
    final trace/evidence docs, commit and push the post-publication record, and
    finish with a clean tree.

## Claim and safety boundaries

- Root claims require proof through the public `@aura3d/engine` surface.
- Production-runtime and rendering-internal capabilities stay explicitly
  labeled; they are not automatic root claims.
- Public examples use typed assets, never raw model URLs, guessed identifiers,
  Three.js imports, loaders, controls, or hand-written renderer loops.
- DOM/CSS/canvas overlays are UI, not renderer evidence.
- Do not weaken thresholds, rewrite historical ADRs, fabricate a human verdict,
  or use generated reports as hand-authored source.
- Use the existing authenticated npm, GitHub, and Vercel sessions without
  printing, inspecting, committing, or serializing credentials.

## Definition of completion

Aura3D 1.6 is not released until both serial full suites pass, all 26 packages
are verified on npm, the exact Git tag and GitHub release exist, the canonical
website is verified live, all post-publish checks pass, all 295 PRD boxes are
checked with real evidence, and the worktree is clean.
