# Release 4.2.0 runbook

Status: prepared on `game-rework`; nothing is published, tagged or deployed until every lane has landed and the gates in section 1 pass. This replaces the stale 4.1.4 runbook (4.1.4 was dropped; its fixes ship inside 4.2.0).

Owner decisions already recorded: ship everything as 4.2.0; deprecate every prior version on npm and mark older GitHub releases superseded at publish (standing preference); the hosted asset index and its cloud resources are deleted; no unverifiable claims on the site (the live game count is generated: 26 at last count).

## 0. What 4.2.0 contains

- Motion kit in `@aura3d/engine/game`: `attachToBone`, locomotion, foot-slide meter, impact response, pose smoothing, double-frame detector, render presenter (`loop.alpha`, `createFixedStepPresenter`, `runMotionGate`), `createGameBeacon`/`installGameBeacon`, `warmPrograms`.
- Library promotions: `effects.toon`, `cameras.chase`, `prefabs.objectiveMarker`, compass and canvas minimap, `aura3d evidence judge`, counted RNG.
- Engine fixes: attachments read the final pose, canvas backing size follows the authored size (2x crop), neutral environment embedded (no fetch), `createParentFit`, `onFrame` error boundary, `material.custom` precision fix.
- `aura3d assets resolve "<need>"` (project asset, open CC0 source, Meshy opt-in with budget, procedural recipe) replaces the hosted index. `aura3d look capture` defaults to a remote runner.
- Games: physics, animation, objectives and presentation fixes across the index games and renamed ports; new names; likeness and brand cleanup; shared quick bar; 26 live games from the generated inventory.
- Docs: agent fast path, recipes, lessons-learned, new-game checklist, game checks runner (`node tools/game-checks/run.mjs --all`), honest three.js comparison.

## 1. Preconditions (all must hold)

1. No agent is still pushing to `game-rework` (`git log origin/game-rework --since="30 minutes ago"` is empty).
2. `node tools/game-checks/run.mjs --all` reports 0 errors (the Meshy per-game cap warnings are known).
3. Gates on the merged tree: `tsc -p tsconfig.build.json`, `verify-exports`, `verify-imports`, `public-api-contract`, `public-surface-diff`, `check:skills`, `node tools/docs/check-root-exports.mjs`, docs links and snippets, `public-example-boundary`, likeness-audit tests, kit and game unit tests, Aura Slam G1 and G3 (remote), consumer build smoke on the packed tarballs (remote; `evidence/stock-build/`), `marketing/scripts/check-site.mjs`, `check-version.mjs`. Compare any failure against a clean `origin/main` baseline.
4. Preview deploy of the branch passes the remote check of all live games (0 console errors, hero frame non-black).

## 2. Land `game-rework` on `main`

From the main checkout (not a symlinked worktree: `pnpm pack` needs the real install):

```sh
git fetch origin
git checkout main && git pull --ff-only origin main
git merge origin/game-rework      # a merge commit is fine; resolve CHANGELOG by keeping every line
git push origin main
```

## 3. Bump, build, pack, publish

```sh
node tools/release/prepare-version.mjs 4.2.0
# prepare-version misses these: replace 4.1.3 with 4.2.0 in the files touched by commit 973d3fe1a (marketing/docs/*.html,
# apps/showcase-index/index.html, CONTRIBUTING.md, docs/project stamps, apps/*/package.json "version", CHANGELOG "Version:" line);
# leave historical benchmark and evidence mentions and the dated 4.1.3 changelog section.
node marketing/scripts/gen-seo.mjs
node_modules/.bin/tsx --tsconfig tsconfig.base.json tools/agent-skills/sync.ts && node_modules/.bin/tsx --tsconfig tsconfig.base.json tools/agent-skills/check.ts
node marketing/scripts/check-version.mjs
node_modules/.bin/tsc -p tsconfig.build.json
node --experimental-strip-types tools/finalize-dist/index.ts
git add -u && git commit -m "release: Aura3D 4.2.0" && git push origin main
node tools/release/publish-all.mjs --dry-run                                   # writes the plan for the CURRENT head
node tools/release/publish-all.mjs --from-plan tests/reports/release-tarballs/release-plan.json
```

Rules learned at 4.1.3:

- Do not commit, pull or edit between the dry run and `--from-plan`: the plan carries a source fingerprint (`Release plan source fingerprint mismatch`). If it fails, rerun the dry run on the unchanged head and retry.
- Never set `NPM_CONFIG_USERCONFIG` or token variables (policy); the existing `~/.npmrc` is used.
- The first publish may print `registry check failed ... E404` and `registry verification: 2/24`. That is registry lag, not failure: rerun the same command, then poll.
- Date the changelog heading (`## 4.2.0 (unreleased)` becomes `## 4.2.0 (YYYY-MM-DD)`) before creating the GitHub release, and never create the release with empty notes.

## 4. Verify from a clean directory (poll for lag)

```sh
cd /tmp
for p in $(node -e 'console.log(require("/PATH/TO/REPO/tests/reports/release-tarballs/release-plan.json").packages.map(p=>p.name).join(" "))'); do npm view "$p@4.2.0" version; done
```

Poll about 20 s apart, up to 10 minutes, until all packages show 4.2.0. Then install `@aura3d/engine@4.2.0` and `@aura3d/cli@4.2.0` into an empty directory, import the root and `@aura3d/engine/game` exports (`effects.toon`, `cameras.chase`, `prefabs.objectiveMarker`, `installGameBeacon`, `warmPrograms`, `attachToBone`, `createLocomotion`, `createImpactWorld`), and run `aura3d assets resolve "crate" --dry-run`.

## 5. Tag and GitHub release

```sh
git tag -a v4.2.0 <bump commit sha> -m "Aura3D 4.2.0" && git push origin v4.2.0
awk '/^## 4\.2\.0/{f=1;next} /^## 4\.1\.4|^## 4\.1\.3/{f=0} f' CHANGELOG.md | sed '/./,$!d' > /tmp/notes-420.md; wc -l /tmp/notes-420.md   # must not be empty
gh release create v4.2.0 --title "Aura3D 4.2.0" --notes-file /tmp/notes-420.md --latest --verify-tag
```

## 6. Deprecate every prior version (standing owner preference)

```sh
# every package in the release plan: deprecate everything below 4.2.0
npm deprecate "<pkg>@<4.2.0" "Superseded by 4.2.0. Upgrade to <pkg>@4.2.0 or later (see https://github.com/auraoneai/aura3d/releases/tag/v4.2.0)."
```

Also deprecate the retired packages in full (`@aura3d/editor`, `environments`, `lean`, `materials`, `showcase-assets`, `showcase-assets-web`, `three-compat`) if not already (`npm view <pkg>@<latest> deprecated`). List the scope with `npm access list packages @aura3d` so nothing is missed. 4.2.0 itself must not be deprecated: verify with `npm view <pkg>@4.2.0 deprecated` (empty).

GitHub: for every release except `v4.2.0`, prepend `> **Superseded.** This version is deprecated. Upgrade to [Aura3D 4.2.0](https://github.com/auraoneai/aura3d/releases/tag/v4.2.0).` if it is not already there, and set `--prerelease --latest=false`; create banner-marked releases for tags that have no release page (skip non-version tags such as `v4-pre-cutover-*`).

## 7. Production deploy (clean worktree)

```sh
git worktree add --detach /tmp/aura3d-deploy-420 v4.2.0
cd /tmp/aura3d-deploy-420
mkdir -p .vercel && cp <main checkout>/.vercel/project.json .vercel/
rsync -a --ignore-existing <main checkout>/fixtures/ fixtures/
printf '\n/evidence/\n' >> .vercelignore      # ANCHORED. Never `evidence/`: it also drops packages/game/src/evidence
vercel-auraone deploy --prod --yes
```

- Do not ignore `/tests/`: `vite.config.ts` imports `./tests/browser/installed-package-resolve`.
- The upload must stay under 15,000 files (about 14.4k deployable with `/evidence/` ignored; check `git ls-files | rg -v '^evidence/' | wc -l` plus fixtures).
- A build that fails with no message: `vercel-auraone inspect <url> --logs`.
- Rollback: redeploy the `v4.1.3` tag the same way.

## 8. Live verification

First run `node tools/verify-asset-urls/index.mjs --base https://aura3d.auraone.ai` (every asset URL a live game references must answer 200 with a matching size and no HTML fallback), then the game smoke below. Run both after EVERY production deploy, hotfixes included.

Run the live smoke over every game in `docs/workflows/game-inventory.json` (remote, software GL: `tests/browser/live-index-games.spec.ts` pattern, evidence under `evidence/live-420/`): 200, non-black frame, 0 console errors, no black-frame guard reload. Check: homepage numbers equal the inventory (26 games), no `800K`, `15 games` or `4 playable` strings in served HTML or `llms*.txt`, redirects from old slugs work, the comparison page renders, the Aura Slam route (draw calls at most 150), and `https://aura3d.auraone.ai/llms.txt` shows 4.2.0. Items that need the owner's real GPU: Aura Slam feel, 120 Hz smoothness, Hoops crash fix, Drift, Silt, Last Train, Cumulus Dash at 2x.

## 9. After release

- Refresh `docs/workflows/aura3d-vs-threejs-matrix.md` rows and the scorecard from the live numbers.
- Re-run the 26-game scan and the likeness audit over the final assets.
- Open follow-ups: owner decisions on the `LICENSE` file and the Graphik font redistribution; art passes (Shadowstep Gauntlet houses, Teleoperator silhouettes, Duneglide slabs, Iron Crown roster faces); the Gridlock road flip; Meshy per-game cap enforcement in the helper.
