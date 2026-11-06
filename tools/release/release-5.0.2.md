# Aura3D 5.0.2 release runbook

5.0.2 follows 5.0.1 (the first 5.x that draws all 25 games). This runbook is the 5.0.1 runbook with the rendered-frame
gate made mandatory and automated: **a release without a rendered frame is not a release.** Nothing reaches `latest`,
the production site or a deprecation unless `tools/release/render-gate` has passed (25 live games + 20 templates, zero
misses) against the exact bytes about to be promoted, immediately before that step. The public API is unchanged.

Run this only after the ACR source pass has passed on the frozen commit and the owner has said go. Each section is
copy-paste bash (zsh works too, see the zsh trap in "Traps"), run in order. Every `test`/`node -e` guard is a hard stop:
fix the cause or roll back (section 10). Never use Vercel. Never run `npm login`, `gh auth login|refresh`,
`wrangler login`, `npm token create` or setup scripts. Never export or set `GH_*`, `GITHUB_*`, `NPM_TOKEN` or
`NODE_AUTH_TOKEN`, and never write a token into a repo `.npmrc`. Use the existing `~/.npmrc` token and the `gh` keyring
login as they are. Scratch lives in the repo at `tests/reports/release-502` (gitignored), never `/tmp` or `~/`. No local
Docker, no local Playwright; browser checks use the render gate, whose default driver is the REA CLI
(`capture-browser-scenario`, the same engine as the MCP tool) on a real-GPU Chrome.

The 25 packages are the `native-1` inventory in `release-inventory.mjs` (same set as 5.0.1, including `@aura3d/addons`).
The retired packages (deprecate only, never publish) are `@aura3d/editor`, `@aura3d/environments`, `@aura3d/materials`,
`@aura3d/three-compat`, `@aura3d/showcase-assets`, `@aura3d/showcase-assets-web`, `@aura3d/lean`.

Helper scripts (all in `tools/release/`, unit-tested, nothing lives in `/tmp`): `render-gate/index.mjs`,
`restamp-version.mjs`, `insert-changelog.mjs`, `poll-registry.mjs`, `deploy-site.mjs`, `deprecate-versions.mjs`,
`banner-releases.mjs`.

## Order at a glance

| Step | Section | Reversible | Effect |
|---|---|---|---|
| 0 | Pre-freeze prerequisites | yes | tree is release-ready |
| 1 | Verify freeze and ACR source pass | read-only | |
| 2 | **Render gate on the packed build (games + templates)** | read-only | gate before any registry write |
| 3 | `publish-all --tag next` | npm: no (deprecate only) | 5.0.2 exists on dist-tag `next`; `latest` still 5.0.1 |
| 4 | Registry poll + install + **render gate on the registry build** | read-only | |
| 5 | Site preview deploy + **render gate on the preview URL** | preview only | |
| 6 | **Render gate on the preview again**, then site production deploy + **render gate on production** | rollback by API | |
| 7 | Tag, push, merge to main | tag: owner only | |
| 8 | **Render gate on production again**, then promote: `latest`, deprecate 5.0.1 and older, GitHub release Latest + banners | dist-tag yes | |
| 9 | Final verification | read-only | |
| 10 | Rollback | | |

Stop at the first failed gate. A failure in 2, 4 or 5 leaves `latest` on 5.0.1 and production untouched, so users are no
worse off than today; fix forward as 5.0.3. The gate is a hard stop, not advice: a blank canvas is a release blocker, not a
known limit.

## 0. Pre-freeze prerequisites (must be true in the frozen commit)

Items below change source inputs, so changing them after the freeze breaks the candidate binding.

| # | Item | How to check |
|---|------|--------------|
| P1 | `CHANGELOG.md` top heading reads `## 5.0.2 (DATE)` (insert with `node tools/release/insert-changelog.mjs --version 5.0.2 --date DATE --notes-file FILE`; if the date slips update the CHANGELOG, migration doc and its generated HTML together) | `grep -n '^## 5.0.2' CHANGELOG.md` |
| P2 | Versions are 5.0.2 everywhere (bump with `prepare-version`, then `node tools/release/restamp-version.mjs --from 5.0.1 --to 5.0.2 --since-commit <5.0.1 release commit>`) | `node tools/release/prepare-version.mjs 5.0.2 --check` (exit 0, `changed: []`), `node marketing/scripts/check-version.mjs` |
| P3 | Homepage and site checks pass **on a site built after the version bump** (a build made before the bump ships the old number) | `node marketing/scripts/check-site.mjs` |
| P4 | The migration page is generated and current | `node marketing/scripts/gen-migration-doc.mjs --check` |
| P5 | `origin/main` is an ancestor of the freeze commit, or the merge-commit path in section 7 is accepted | `git merge-base --is-ancestor origin/main <freeze>` |
| P6 | This runbook is committed in the freeze (an untracked file changes the source digest) | `git status --short tools/release` |
| P7 | The tested candidate plan and its 25 archives exist (from the ACR source pass), **including `artifacts/tarballs`** the plan paths point into | section 1 |
| P8 | Every file a game loads from root `public/aura-assets/` is listed in `aura.assets.json` (the site build copies only manifest entries; a hand-written `glb()` URL that is not listed returns the SPA HTML and kills the game, as the 4.7.17 floodlight mast did) | `node marketing/scripts/build-showcase-routes.mjs` then the render gate in section 5; plus `pnpm check:assets` |
| P9 | The release tree is a clean worktree at the freeze commit, never `main` (see D3-04) | `git status --porcelain` empty in `$WT` |

## 1. Verify the freeze and the ACR source pass (read-only)

```bash
set -euo pipefail
REPO=/Users/gurbakshchahal/platforms/aura3d     # or the worktree that holds the freeze
cd "$REPO"
REL="$REPO/tests/reports/release-502"           # scratch inside the repo (gitignored)
mkdir -p "$REL/logs"
unset AURA3D_SOURCE_MANIFEST A3D_RELEASE_PLAN A3D_RELEASE_PACK_DIR NATIVE_RUN_ID NATIVE_REPORT_DIR
V=5.0.2; PREV=5.0.1
FREEZE=$(git rev-parse HEAD)                    # the commit the parent froze
GATE=<the gate record produced by the source pass>
PLAN=<the candidate plan path inside that record: candidatePlan.path>
MIGRATION_URL=https://aura3d.auraone.ai/docs/migration/4-to-5
test -z "$(git status --porcelain --untracked-files=no -- . ':!AGENTS.md')"
node tools/native-capability-gate/index.mjs --phase acceptance --gate "$GATE"
node -e '
const fs=require("fs"),c=require("crypto");const [gate,plan]=process.argv.slice(1);
const g=JSON.parse(fs.readFileSync(gate,"utf8")),bytes=fs.readFileSync(plan);
if(c.createHash("sha256").update(bytes).digest("hex")!==g.candidatePlan.sha256) throw new Error("plan bytes differ from the gate");
const p=JSON.parse(bytes);
if(p.version!=="5.0.2"||p.packages.length!==25||p.packageCount!==25) throw new Error("plan is not the 25-package 5.0.2 set");
for(const e of p.packages){const b=fs.readFileSync(e.tarball);
 if(c.createHash("sha256").update(b).digest("hex")!==e.sha256) throw new Error("archive differs "+e.tarball);
 if("sha512-"+c.createHash("sha512").update(b).digest("base64")!==e.integrity) throw new Error("integrity differs "+e.tarball);}
console.log("plan OK");' "$GATE" "$PLAN"
cat > "$REL/env.sh" <<EOF
REPO=$REPO; REL=$REL; V=$V; PREV=$PREV; FREEZE=$FREEZE; PLAN=$PLAN; MIGRATION_URL=$MIGRATION_URL; WT=$REL/wt
EOF
```

If the tested archives are not on disk, a repack is allowed only when byte-identical (see "If P7 fails" in
`release-5.0.0.md`); otherwise a new candidate goes through the source pass again. Never publish untested bytes.

Clean release worktree (publish and deploy run from here):

```bash
set -euo pipefail; source tests/reports/release-502/env.sh
git -C "$REPO" worktree add --detach "$WT" "$FREEZE"
CAND_DIR=$(dirname "$PLAN"); mkdir -p "$WT/$CAND_DIR" && rsync -a "$REPO/$CAND_DIR/" "$WT/$CAND_DIR/"
# the plan's archive paths point into artifacts/tarballs: copy them too or every later step fails with ENOENT
for d in $(node -p 'require(process.argv[1]).packages.map(p=>require("path").dirname(p.tarball)).filter((v,i,a)=>a.indexOf(v)===i).join(" ")' "$PLAN"); do mkdir -p "$WT/$d" && rsync -a "$REPO/$d/" "$WT/$d/"; done
cd "$WT"; git checkout -- AGENTS.md 2>/dev/null || true
test -z "$(git status --porcelain)"
npm whoami      # expect veeronecorp
```

## 2. Render gate on the packed/registry build (before any registry write)

Every one of the 25 live games and all 20 templates must draw against the packed 5.0.2 archives, not only against
workspace source (the 5.0.0 regression passed source-level suites).

```bash
set -euo pipefail; source tests/reports/release-502/env.sh; cd "$WT"
# 1. Install the 25 plan archives into the route build (offline, from $PLAN), build the games from the packed packages
#    and serve marketing/dist on loopback.
node marketing/scripts/build-showcase-routes.mjs
( cd marketing/dist && exec python3 -m http.server 8123 --bind 127.0.0.1 ) & SERVER=$!
trap 'kill $SERVER 2>/dev/null' EXIT INT TERM
sleep 2
# 2. Games (25 rows) from the packed build and templates (20 rows) scaffolded from the plan archives.
node tools/release/render-gate/index.mjs --out "$REL/census" --base http://127.0.0.1:8123 --games
node tools/release/render-gate/index.mjs --out "$REL/census-templates" --templates --templates-source "archives:$WT/$PLAN" --work-dir "$REL/template-work"
```

Pass criteria per row, enforced by the gate (exit non-zero on any miss, summary in `<out>/summary.md`): no
`RENDERER_MOUNT_FAILED`, no error-level console message other than `Failed to load resource ... 404`, and a non-black
frame (percentile-brightened texture test, so a dim scene behind an opaque menu card counts and a black canvas, a single
clear colour or a bare card does not). Warnings with a `*_DEGRADED` code are listed in the summary; compare them with the
CHANGELOG. Gate: 25/25 games and 20/20 templates. If the REA CLI cannot run, capture with the MCP
`capture_browser_scenario` at 960x540 with a 10 s settle, save each result as `<id>.json` (and PNG) and run
`--driver saved --saved-dir <dir>` to analyze them.

## 3. Publish under dist-tag `next` (first irreversible step)

`publish-all.mjs --tag next` runs `npm publish <exact tarball> --access public --tag next` and verifies the registry with
`npm view <pkg>@next version`, so `latest` is not moved.

```bash
set -euo pipefail; source tests/reports/release-502/env.sh; cd "$WT"
env -u AURA3D_SOURCE_MANIFEST -u A3D_RELEASE_PLAN node tools/release/publish-all.mjs --dry-run --from-plan "$PLAN" --tag next 2>&1 | tee "$REL/logs/30-dry-run.log"
test "$(grep -c '^\[dry-run\] validated retained' "$REL/logs/30-dry-run.log")" = 25
set +e
env -u AURA3D_SOURCE_MANIFEST -u A3D_RELEASE_PLAN node tools/release/publish-all.mjs --from-plan "$PLAN" --tag next > "$REL/logs/31-publish.log" 2>&1; rc=$?
echo "PUBLISH_EXIT rc=$rc" >> "$REL/logs/31-publish.log"; tail -30 "$REL/logs/31-publish.log"
grep -c '^published \|^already published ' "$REL/logs/31-publish.log"   # expect 25
```

Re-run the publish command for any `FAILED` line (published packages are skipped). `rc != 0` caused only by `registry
mismatch` is npm cache lag. Confirm tags afterwards:

```bash
for n in $(node -p 'require(process.argv[1]).packages.map(p=>p.name).join(" ")' "$PLAN"); do
  printf '%s next=%s latest=%s\n' "$n" "$(npm view "$n@next" version)" "$(npm view "$n@latest" version)"; done
# expect next=5.0.2, latest=5.0.1 for every package that existed before; @aura3d/addons latest may already be 5.0.1
```

## 4. Registry poll, clean install, REA real-GPU check from the registry

```bash
set -euo pipefail; source tests/reports/release-502/env.sh
node tools/release/poll-registry.mjs --plan "$WT/$PLAN" --version "$V" | tee "$REL/logs/40-poll.log"
C="$REL/consumer"; rm -rf "$C"; mkdir -p "$C"; cd "$C"; npm init -y > /dev/null
npm install --prefer-online "@aura3d/engine@next"
node -e 'const l=require("./package-lock.json");const e=l.packages["node_modules/@aura3d/engine"];if(e.version!=="5.0.2")throw new Error("installed "+e.version);console.log("engine 5.0.2 installed")'
node --input-type=module -e 'const m = await import("@aura3d/engine"); if (typeof m.createAuraApp !== "function") throw new Error("createAuraApp missing"); console.log("engine import OK")'
```

Then repeat the census of section 2 with the game route build resolving `@aura3d/*` from the registry install
(`@aura3d/engine@5.0.2` and the other 24 from `$C/node_modules`), 25/25 drawn, results to `$REL/census-registry/`. Gate: a
miss here means the published bytes differ from what the source pass tested: stop, leave `latest` on 5.0.1 and
deprecate `5.0.2` with a message pointing to the next fix.

## 5. Site preview deploy and verification

```bash
set -euo pipefail; source tests/reports/release-502/env.sh; cd "$WT"; source ~/.config/auraone/cloudflare-env.sh
wrangler whoami | grep -q bd3fbe37a66521e496ea1b90f669f8b7
for p in aura3d aura3d-wonder-world; do
  wrangler pages deployment list --project-name "$p" --environment production --json \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s);console.log(a[0].Id||a[0].id)})' > "$REL/rollback-$p.id"
  echo "$p rollback target: $(cat "$REL/rollback-$p.id")"
done
rsync -a --ignore-existing "$REPO/fixtures/" fixtures/        # gitignored fixtures trap
git checkout -- AGENTS.md 2>/dev/null || true
pnpm install --frozen-lockfile --offline > "$REL/logs/50-install.log" 2>&1
nice -n 10 pnpm build > "$REL/logs/51-build.log" 2>&1
nice -n 10 pnpm --dir marketing build > "$REL/logs/52-marketing.log" 2>&1
# The site MUST be built here, after the version bump, from the release tree (a build made earlier shows the old number).
# deploy-site.mjs refuses a dirty tree or a HEAD that is not $FREEZE, swaps in the small optimized fixtures (24 MiB
# Pages limit: boom-box.glb pinned by hash, antique-camera.glb), runs verify-asset-urls and wrangler pages deploy.
node tools/release/deploy-site.mjs --version "$V" --freeze "$FREEZE" --mode preview 2>&1 | tee "$REL/logs/53-preview.log" | tail -12
PREVIEW=https://release-5-0-2.aura3d.pages.dev
for u in / /docs/ /apps/aura-clash-showcase/ /docs/migration/4-to-5; do printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$PREVIEW$u")" "$u"; done
node tools/verify-asset-urls/index.mjs --base "$PREVIEW" | tail -3
node tools/site/scan-live-site.mjs "$PREVIEW" | tail -4
```

Render gate on the preview URL (hard gate, nothing is deployed to production until it passes):

```bash
set -euo pipefail; source tests/reports/release-502/env.sh; cd "$WT"; PREVIEW=https://release-5-0-2.aura3d.pages.dev
node tools/release/render-gate/index.mjs --out "$REL/census-preview" --base "$PREVIEW" --games
```

Gate: 25/25 games. The built site must also show 5.0.2 (`curl -s "$PREVIEW/" | grep -o '5\.0\.2' | head -1`).

## 6. Site production deploy

Only after section 5 passed. **Run the render gate against the preview once more immediately before deploying** (the
preview is the exact bytes that go live; a stale pass is not a pass):

```bash
set -euo pipefail; source tests/reports/release-502/env.sh; cd "$WT"
node tools/release/render-gate/index.mjs --out "$REL/census-preview-final" --base https://release-5-0-2.aura3d.pages.dev --games
```

```bash
set -euo pipefail; source tests/reports/release-502/env.sh; cd "$WT"; source ~/.config/auraone/cloudflare-env.sh
node tools/release/deploy-site.mjs --version "$V" --freeze "$FREEZE" --mode production 2>&1 | tee "$REL/logs/60-prod.log" | tail -8
wrangler pages deployment list --project-name aura3d --environment production | head -6
PID=$(wrangler pages deployment list --project-name aura3d --environment preview --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{console.log(JSON.parse(s).filter(d=>(d.Branch||d.branch)==="release-5-0-2").map(d=>d.Id||d.id).join(" "))})')
for id in $PID; do wrangler pages deployment delete "$id" --project-name aura3d --force; done   # delete the preview (teardown rule)
```

Run the render gate on production (results to `$REL/census-prod/`):

```bash
node tools/release/render-gate/index.mjs --out "$REL/census-prod" --base https://aura3d.auraone.ai --games
```

A miss here: roll back the site first (section 10), leave `latest` on 5.0.1.

`aura3d-wonder-world`: if the owner wants it redeployed, follow section 7d of `release-5.0.0.md` with branch
`release-5-0-2` (never write its addresses into tracked files). Redeploy it only if 5.0.2 changes its content.

## 7. Tag, push, merge into main

```bash
set -euo pipefail; source tests/reports/release-502/env.sh; cd "$REPO"
git tag -a "v$V" "$FREEZE" -m "Aura3D $V"
git push origin "$FREEZE:refs/heads/release/5.0.2"
git push origin "v$V"
git ls-remote origin "refs/tags/v$V^{}" | grep -q "$FREEZE"
awk '/^## 5\.0\.1/{f=1;next} /^## /{if(f)exit} f' CHANGELOG.md > "$REL/notes-$V.md"
test -s "$REL/notes-$V.md"; ! grep -q 'unreleased\|not frozen' "$REL/notes-$V.md"
git fetch origin main
M=$REL/main-merge; git worktree add --detach "$M" origin/main; cd "$M"
if git merge-base --is-ancestor origin/main "$FREEZE"; then git merge --ff-only "$FREEZE"
else git merge --no-ff "$FREEZE" -m "merge: Aura3D $V into main [skip ci]" -m "Co-Authored-By: Claude <noreply@anthropic.com>"; fi
git checkout -- AGENTS.md 2>/dev/null || true
git push origin HEAD:refs/heads/main
MAIN_HEAD=$(git rev-parse HEAD); echo "main -> $MAIN_HEAD"
cd "$REPO"; git worktree remove "$M"
sleep 20; gh run list --branch main --event push --limit 30 --json databaseId,headSha,status \
  -q ".[] | select(.headSha==\"$MAIN_HEAD\" and .status!=\"completed\") | .databaseId" | xargs -n1 -I{} gh run cancel {} || true   # policy: no GitHub Actions
```

Scaffold check (needs the pushed tag):

```bash
set -euo pipefail; source tests/reports/release-502/env.sh
S="$REL/scaffold"; rm -rf "$S"; mkdir -p "$S"; cd "$S"
npx -y "create-aura3d@next" smoke --template mini-game
cd smoke && npm install --prefer-online && npm run build && npx -y "@aura3d/cli@next" check-deploy --dist dist
node -p 'require("./package.json").dependencies["@aura3d/engine"]'   # expect 5.0.2
```

## 8. Promote: `latest`, deprecations, GitHub release

Only after sections 2, 4, 5 and 6 are all 25/25 (games) and 20/20 (templates). This is the step that changes what `npm install @aura3d/engine` gives users, so
**re-run the render gate against production immediately before it** and stop on any non-zero exit:

```bash
set -euo pipefail; source tests/reports/release-502/env.sh; cd "$WT"
node tools/release/render-gate/index.mjs --out "$REL/census-prod-prepromote" --base https://aura3d.auraone.ai --games
node tools/release/render-gate/index.mjs --out "$REL/census-registry-prepromote" --templates --templates-source registry:next --work-dir "$REL/template-work-final"
```

```bash
set -uo pipefail; source tests/reports/release-502/env.sh
for n in $(node -p 'require(process.argv[1]).packages.map(p=>p.name).join(" ")' "$WT/$PLAN"); do
  npm dist-tag add "$n@$V" latest || echo "FAILED dist-tag $n"
done
node tools/release/deprecate-versions.mjs --plan "$WT/$PLAN" --version "$V" --url "$MIGRATION_URL" \
  --special "5.0.1=Superseded by {version} - see {url}" | tee "$REL/logs/80-deprecate.log"
node tools/release/deprecate-versions.mjs --check --plan "$WT/$PLAN" --version "$V" | tee "$REL/logs/81-check-deprecations.log"
# Optionally drop the now redundant next tag: npm dist-tag rm <pkg> next
```

GitHub release (Latest) and banners on every older release (`v5.0.1` included):

```bash
set -euo pipefail; source tests/reports/release-502/env.sh; cd "$REPO"
gh release create "v$V" --verify-tag --title "Aura3D $V" --notes-file "$REL/notes-$V.md" --latest
node tools/release/banner-releases.mjs --version "$V" --url "$MIGRATION_URL" | tee "$REL/logs/82-banner.log"
gh release list --limit 3      # v5.0.2 Latest; v5.0.1 Pre-release
```

## 9. Final verification

```bash
set -uo pipefail; source tests/reports/release-502/env.sh; cd "$WT"
bad=0
for u in $(jq -r '.games[] | select(.status=="live") | .url' docs/workflows/game-inventory.json); do
  c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 "https://aura3d.auraone.ai$u"); [ "$c" = 200 ] || { echo "BAD $u $c"; bad=$((bad+1)); }
done
echo "live game URLs non-200: $bad"                                   # expect 0 of 25
node tools/verify-asset-urls/index.mjs --base https://aura3d.auraone.ai 2>&1 | tail -3
node tools/site/scan-live-site.mjs 2>&1 | tail -4
curl -s "$MIGRATION_URL" | grep -q '<title>Migrate from Aura3D 4.x to 5' && echo "migration page OK"
curl -s https://aura3d.auraone.ai/ | grep -o '5\.0\.1' | head -1
git -C "$REPO" worktree remove --force "$WT"
```

Record in `STATE.md` / memory: freeze commit, tag, `main` head, npm 25/25 with `latest`=5.0.2, deprecation check output,
GitHub banner count, Cloudflare deployment IDs, the render-gate summaries (`census`, `census-templates`, `census-registry`,
`census-preview`, `census-prod`), and the still-open known limits from the CHANGELOG.

## 10. Rollback (record the IDs in section 5 before deploying)

Site (Wrangler has no Pages rollback; use the v4 API):

```bash
source tests/reports/release-502/env.sh; source ~/.config/auraone/cloudflare-env.sh
p=aura3d
curl -fsS -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$p/deployments/$(cat "$REL/rollback-$p.id")/rollback" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.success,j.result?.id)})'
```

npm, before section 8 (the normal failure case): `latest` is still 5.0.1, so only mark the bad build:
`npm deprecate "<pkg>@5.0.2" "Do not use: fixed in the next 5.0.x"` for each package and `npm dist-tag rm <pkg> next`.

npm, after section 8: point `latest` back and re-deprecate. Prefer fixing forward as 5.0.3; if a rollback to 5.0.1 (the last
release whose render gate passed) is required:

```bash
for n in $(node -p 'require(process.argv[1]).packages.map(p=>p.name).filter(n=>n!=="@aura3d/addons").join(" ")' "$WT/$PLAN"); do
  npm dist-tag add "$n@5.0.1" latest
  npm deprecate "$n@5.0.1" ""   # 5.0.1 was marked superseded in section 8: clear it
  npm deprecate "$n@5.0.2" "Rolled back: use $n@5.0.1 until a fixed 5.x ships"
done
npm deprecate "@aura3d/addons@5.0.2" "Rolled back with Aura3D 5.0.2: do not use"
```

Unpublishing within 72 h deletes production data and needs the owner's explicit go; it is not part of this rollback.

GitHub: `gh release edit v5.0.2 --prerelease --latest=false && gh release edit v5.0.1 --prerelease=false --latest`, then
restore the original v5.0.1 notes to drop the banner. Never delete a pushed tag or force-push `main`; if `main` must
return to earlier content use `git revert -m 1 <merge>` with `[skip ci]`.

## Traps (each one cost a release before)

1. **A release without a rendered frame is not a release.** 5.0.0 passed every source-level suite and drew nothing on
   production. The render gate (sections 2, 4, 5, 6, 8) is the only evidence that counts; it runs on the artifact about
   to be promoted, immediately before the irreversible step.
2. **Build the site after the version bump,** inside the release tree. A site built before the bump ships the old
   version number and stale route bundles.
3. **`aura.assets.json` must list every root `public/aura-assets/` file a game loads.** The site build copies only manifest
   entries; an unlisted file answers with the SPA HTML (`Unexpected token '<'`) and the game dies. Check P8 and let the
   render gate on the preview catch it.
4. **Deploy from a release tree, never from `main`.** `main` may hold an unverified major (5.0.0 was live for 25 minutes
   before rollback). `deploy-site.mjs` refuses a dirty tree or a HEAD that is not the freeze commit.
5. **The zsh `${VAR}` trap.** Inside double quotes zsh treats `$VAR:...`, `$VAR[...]` and `$status` specially, and
   an unset variable under `set -u` aborts a pasted block. Always write `${VAR}`, quote every expansion, and
   `source tests/reports/release-502/env.sh` first in every block (each block is a fresh shell).
6. **Tarballs in the plan path need `artifacts/tarballs` copied** into the release worktree (section 1); the plan stores
   archive paths relative to the repo, and a worktree at the freeze commit does not contain gitignored artifacts.
7. **Gitignored fixtures** (`fixtures/`) must be rsynced into the worktree before the site build (section 5).
8. **The 24 MiB Pages file limit:** `deploy-site.mjs` swaps in the optimized `boom-box.glb` (hash pinned) and
   `antique-camera.glb` from the live site; any other file above the limit stops the deploy.
9. Scratch and helper scripts live in `tools/release/` and `tests/reports/release-502`, not `/tmp` (deleted on this
   machine).
