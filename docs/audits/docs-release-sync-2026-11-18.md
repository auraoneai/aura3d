# Docs and release sync audit (2026-11-18)

Scope: published 5.5.0 to 5.5.6 (tag `v5.5.6`) plus the work after it (commits `v5.5.6..HEAD` and the uncommitted tree). Every published package is at 5.5.6; nothing here was bumped, committed or published.

## Feature coverage

| Feature | Release | CHANGELOG | llms.txt | llms-full.txt | docs/agents | docs/api | Skills | README |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `RuntimeQualityGovernor` | 5.5.3 | 5.5.3 | Kits | Kits | `build-a-game.md` | `quality-governor.md` (new) | `aura3d-performance`, `kits-and-hooks.md` | Game kit |
| `createBlackFrameWatch` alpha-0 fix | 5.5.4 | 5.5.4 | via `safety-net.md` | Kits | `README.md` (routing) | `safety-net.md` (already correct) | `kits-and-hooks.md` | via Safety net (`installSafetyNet`) |
| Display-P3 v2 negotiation | 5.5.4 | 5.5.4 | out of scope (size cap) | Kits | none: it is a request that falls back to sRGB; nothing more to claim | `public-api.md` | none | none |
| QA telemetry, virtual gamepads, offline audio | 5.5.5 | 5.5.5 | Kits | Kits | `verification.md`, `build-a-game.md`, `api-surface.md` | `qa-kit.md` | `kits-and-hooks.md` | Game kit (`qa-kit.md` link) |
| `createAuraTuneOverlay` (`/devtools`) | 5.5.5 | 5.5.5 | Kits | Kits | `api-surface.md`, `build-a-game.md` | `qa-kit.md` | `kits-and-hooks.md` | none |
| `@aura3d/engine/sculpt` | 5.5.6 | 5.5.6 | Read first | Kits | `README.md`, `build-a-game.md` | `sculpt.md` (new) | bundled `llms.txt` | Typed scene API |
| `computeCameraClearance` | 5.5.6 | 5.5.6 | More pitfalls | Kits | `README.md`, `api-surface.md`, `build-a-game.md` | `motion-camera-clear.md` | bundled `llms.txt` | Typed scene API |
| `sculptHairMassMesh`, `sminCubic`, `smaxCubic` | unreleased | Unreleased | via `sculpt.md` | Kits | via `sculpt.md` | `sculpt.md` | none | none |
| brushedMetal groove maps, `contrast` cache key | unreleased | Unreleased | none: a fix with no API | none | none | none | none | none |
| Humanoid/SMPL motion (`@aura3d/animation`) | unreleased | Unreleased | via `animation import` | Kits | `build-a-game.md` | `humanoid-motion.md` (new) | `aura3d-character-animation` | none |
| `assets convert`, `generate`, `normalize`, `preview`, `slim` | unreleased | Unreleased | Assets | Assets | `asset-workflow.md`, `build-playbook.md` (via `cli-asset-tools.md`) | `cli-reference.md`, `cli-asset-tools.md` | `aura3d-assets` + `generate-convert-post.md` | CLI README |
| `animation import`, `animation generate` | unreleased | Unreleased | Assets | Assets | `build-a-game.md` | `cli-reference.md` | `aura3d-character-animation` | CLI README |
| Monorepo-only gating (exit 2) | unreleased | Unreleased | via reference | via reference | n/a | `cli-reference.md` | n/a | n/a |

## CLI

- `aura3d help --json` lists 69 commands. Built from source and from `dist`, the list is identical, and every command answers `--help` with exit 0.
- `docs/api/cli-reference.md` was regenerated. The only drift was the `assets thumbnail` description.
- `tools/docs/gen-cli-reference.mjs --verify-docs` no longer reports two false positives:
  - chained invocations such as `aura3d a x, aura3d b y`;
  - a bare command group such as `aura3d assets`.
  Over 134 doc files (893 invocations) it reports 0 problems. `CHANGELOG.md` is outside the verify set: two historical entries use a slash shorthand, and the Unreleased entry names the removed `assets budget` on purpose.
- Every one of the 69 commands is now named in at least one guide or skill. The last 11 were added to `docs/agents/verification.md` and `docs/workflows/animation-episode-production.md`: `perf-report`, `core inspect-programs`, `vfx validate-atlas`, `assets bind-game-route-evidence`, `prd08 motion-report`, and `animation plan|preview|render|package|review|verify`. The same workflow page also used a stale `assets validate-animation --require-license` flag, now fixed.
- `docs/workflows/aura3d-vs-threejs-analysis-and-plan.md` (a dated 2026-10-24 plan) still names a planned `aura3d new game`. That is a historical record, so it was left as is.

## llms.txt size

The committed `llms.txt` was 25,332 bytes, already over the `llms-size` limit of 25,000. The source (`marketing/content/llms-core.txt`) also held text that had never been regenerated. The regenerated file is 24,961 bytes:

- I folded lists that appeared twice (the material and primitive lists, the hero-subject line, the sculpt export list) into links to `docs/api`.
- I removed the unverified sentence "100% native … zero Meshy".

`sitemap.xml`, `marketing/sitemap.xml` and `public/sitemap.xml` were restored after `gen-seo.mjs` ran, so their dates and entries are unchanged.

## Checks

| Check | Result |
| --- | --- |
| `gen-cli-reference.mjs --check` | pass (69 commands) |
| `gen-cli-reference.mjs --verify-docs` (134 files) | pass |
| `check-root-exports.mjs`, `sync-engine-readme.mjs --check`, `gen-api-signatures.mjs` | pass |
| `pnpm check:skills`, skill mirrors in `.agents`, `.claude` and `.cursor` | pass, identical |
| `pnpm check:marketing-truth`, `check:claim-lineage`, `marketing check:version` | pass |
| `pnpm check:agent-docs` | static rows pass, including `llms-size`. Two rows need a browser and were not run here (see below). |
| `pnpm check:docs-codeblocks` | not run: needs `A3D_RELEASE_PLAN` or `--candidate-plan`, and no release plan exists |

The two `check:agent-docs` rows that need a browser:

- `first-screen-blocks-typecheck-and-render` needs GPU render reports for `docs/agents/first-screen.md`. That file is unchanged from `HEAD`, so this failure was already there.
- `llms-agent-simulation-builds-working-app` runs a local Playwright test. Local Chromium is not installed, and repo policy says browser tests run remotely through `tools/remote-acr/run.sh`.

## Needs the owner

- Owner chose 5.6.0. Every manifest, the CHANGELOG (`## 5.6.0 (unreleased)`), doc headers, llms files and site copy are bumped in the tree. Still to do: commit, tag `v5.6.0`, publish to npm, deploy the site.
- The uncommitted CLI and animation work, plus these doc changes, still need to be committed.
- `check:agent-docs` and `check:docs-codeblocks` still need a remote run against a release candidate.
