# Release 4.1.4 runbook (hotfix)

Status: prepared on branch `release-4.1.4`, not published, not tagged, not deployed to production. A preview deployment exists. This runbook lists the exact production steps for the owner to approve; every step below was learned from the 4.1.3 release.

## 0. What 4.1.4 contains

`origin/main` (4.1.3 plus the unreleased library fixes: embedded neutral environment, `createParentFit`, `onFrame` error boundary, `material.custom` precision fix, docs and eval fixes), merged with `origin/hotfix-brand` (brand and likeness asset cleanup, Teleoperator texture clean, Hoops freeze fix, billiards cabinet and bean fixes, Cumulus Dash 2x crop fix) and the `warmPrograms` library function with its Gridlock Courier use (first frame was partial in 4.1.3). Nothing from `game-rework` (4.2.0) is included. See the 4.1.4 section of `CHANGELOG.md`.

The pre-release verification results are in `evidence/release-4.1.4/README.md` (gates, packed-tarball consumer smoke on Vite 7.3.2 and 7.3.7, and the remote checks of the affected games). The preview deployment of the branch is `https://aura3d-nqu2f7r7n-veerone.vercel.app` (behind Vercel SSO).

## 1. Preconditions

- Owner approval for: publishing 24 packages to npm, the GitHub release and tag, the production deploy.
- Decide separately: deprecate `4.1.3` and earlier on npm and mark older GitHub releases superseded (the owner asked for full deprecation at 4.1.3; for 4.1.4 this needs a fresh yes).
- The release branch head and the version bump commit are on `origin/release-4.1.4`. Check that `origin/main` has not moved since the branch was cut (`git log origin/release-4.1.4..origin/main` should be empty, otherwise merge `origin/main` into the branch and rerun the gates).

## 2. Land the branch on `main`

From the main checkout (not a symlinked worktree: `pnpm pack` needs the real install):

```sh
git fetch origin
git checkout main && git pull --ff-only origin main
git merge --ff-only origin/release-4.1.4   # if it cannot fast-forward, stop and rebuild the branch
git push origin main
```

## 3. Build, pack, publish

```sh
node_modules/.bin/tsc -p tsconfig.build.json
node --experimental-strip-types tools/finalize-dist/index.ts
node tools/release/publish-all.mjs --dry-run          # writes the plan and tarballs for the CURRENT head
node tools/release/publish-all.mjs --from-plan tests/reports/release-tarballs/release-plan.json
```

Rules learned at 4.1.3:

- Do not commit, pull or edit anything between the dry run and `--from-plan`: the plan carries a source fingerprint, and any change fails it with `Release plan source fingerprint mismatch`. If it fails, rerun the dry run and then publish.
- Never set `NPM_CONFIG_USERCONFIG` or any token variable (the older release-process doc suggests it; policy forbids it). The existing `~/.npmrc` credentials are used.
- The first publish run may print `registry check failed ... E404` for most packages and `registry verification: 2/24`. That is npm registry lag, not a failed publish. Rerun the same command: it reports `already published ... (skipping)`.

## 4. Verify from a clean directory (poll for lag)

```sh
cd /tmp
for p in $(node -e 'console.log(require("/PATH/TO/REPO/tests/reports/release-tarballs/release-plan.json").packages.map(p=>p.name).join(" "))'); do
  npm view "$p@4.1.4" version
done
```

Poll (about 20 s apart, up to 10 minutes) until all 24 show `4.1.4`. Then install `@aura3d/engine@4.1.4` and `@aura3d/cli@4.1.4` into an empty directory and import the root and `@aura3d/engine/game` exports (`warmPrograms`, `installGameBeacon`, `drawCanvasMinimap`, `createCountedRng`, `installQaHooks`).

## 5. Tag and GitHub release

```sh
git tag -a v4.1.4 <bump commit sha> -m "Aura3D 4.1.4" && git push origin v4.1.4
awk '/^## 4\.1\.4/{f=1;next} /^## 4\.1\.3/{f=0} f' CHANGELOG.md | sed '/./,$!d' > /tmp/notes-414.md   # check it is not empty
gh release create v4.1.4 --title "Aura3D 4.1.4" --notes-file /tmp/notes-414.md --latest --verify-tag
```

Check the notes are not empty before creating the release (4.1.3 was created with empty notes once and had to be edited). Date the changelog heading (`## 4.1.4 (unreleased)` becomes `## 4.1.4 (YYYY-MM-DD)`) and commit that to `main` after the tag.

## 6. Deprecation (only with the owner's confirmation)

```sh
# for every package in the scope that has 4.1.4: deprecate versions below it
npm deprecate "<pkg>@<4.1.4" "Superseded by 4.1.4. Upgrade to <pkg>@4.1.4 or later (see https://github.com/auraoneai/aura3d/releases/tag/v4.1.4)."
```

Run it for the 24 packages. Packages not in the release (the seven retired ones: `editor`, `environments`, `lean`, `materials`, `showcase-assets`, `showcase-assets-web`, `three-compat`) are already deprecated entirely. For GitHub, each older release's notes start with a "Superseded" banner and the release is marked pre-release; update the banner link to 4.1.4 if the owner confirms. npm deprecation is reversible (an empty message clears it).

## 7. Production deploy (clean worktree)

```sh
git worktree add --detach /tmp/aura3d-deploy-414 v4.1.4
cd /tmp/aura3d-deploy-414
mkdir -p .vercel && cp <main checkout>/.vercel/project.json .vercel/
rsync -a --ignore-existing <main checkout>/fixtures/ fixtures/
printf '\n/evidence/\n' >> .vercelignore      # ANCHORED. Never use `evidence/`: it also drops packages/game/src/evidence
vercel-auraone deploy --prod --yes
```

- Do not ignore `/tests/`: `vite.config.ts` imports `./tests/browser/installed-package-resolve`, and the build fails without it.
- The upload must stay under 15,000 files. The branch has 14,094 deployable files with `/evidence/` ignored (15,058 without).
- If the build fails with no message, read the deployment logs: `vercel-auraone inspect <url> --logs`.
- Rollback: redeploy the `v4.1.3` tag the same way (4.1.2 is the one before it).

## 8. Live verification

Run the live verification pattern of `evidence/live-413/` (remote runner, software GL; `tests/browser/live-index-games.spec.ts`): 15 index games, 11 ports (use the slugs on the live index), the Aura Slam route, `llms.txt`, `llms-full.txt`, version text on `/apps/showcase-index/` (4.1.4, none of 4.1.3). Commit the frames with `git add -f` where `.gitignore` still ignores images (the `game-rework` branch allows `evidence/**/screens`, `rework` and `live-*` images).

## 9. After release

- Merge `origin/main` into `game-rework` (4.2.0). Expect conflicts in `CHANGELOG.md`, the athlete and rooftop assets and manifests (both branches clean them with different files), and `packages/game/src/index.ts`.
- Real-GPU checks for the owner (Mac, 2x display): Cumulus Dash fills the frame, Hoops continues after the first basket, Gridlock Courier's first frame is complete, the cleaned athletes and vehicles look acceptable.

## 10. What 4.1.4 does not fix

See the Known issues in the changelog: real-vehicle silhouettes in Teleoperator, Gridlock Courier's road flip and translucent car, software-GL-only evidence, the legacy post chain. The new original Teleoperator vehicles, the motion kit and the game rework are in 4.2.0 on `game-rework`.
