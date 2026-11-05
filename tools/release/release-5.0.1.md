# Aura3D 5.0.1 release runbook

5.0.1 is 5.0.0 plus the render fixes in `tests/reports/render-census-501.md` (contact-shadow mount guard and
eleven other new hard throws now degrade with a one-time warning; corrected asset hashes; reduced-motion water;
`instances.mesh` registration; image flipY degrade). The public API is unchanged. 5.0.0 blanked every showcase game
on production, so this runbook differs from `release-5.0.0.md` in ORDER: nothing is promoted to `latest`, deployed to
production or deprecated until the packed/registry build has been proven to draw all 25 games on a real GPU.

Run this only after the ACR source pass has passed on the frozen commit and the owner has said go. Each section is
copy-paste bash (zsh works too), run in order. Every `test`/`node -e` guard is a hard stop: fix the cause or roll back
(section 10). Never use Vercel. Never run `npm login`, `gh auth login|refresh`, `wrangler login`, `npm token create` or
setup scripts. Never export or set `GH_*`, `GITHUB_*`, `NPM_TOKEN` or `NODE_AUTH_TOKEN`, and never write a token into a repo
`.npmrc`. Use the existing `~/.npmrc` token and the `gh` keyring login as they are. Scratch lives in the repo at
`tests/reports/release-501` (gitignored), never `/tmp` or `~/`. No local Docker, no local Playwright; browser checks use REA
`capture_browser_scenario` against a real-GPU Chrome.

The 25 packages are the `native-1` inventory in `release-inventory.mjs` (same set as 5.0.0, including `@aura3d/addons`).
The retired packages (deprecate only, never publish) are `@aura3d/editor`, `@aura3d/environments`, `@aura3d/materials`,
`@aura3d/three-compat`, `@aura3d/showcase-assets`, `@aura3d/showcase-assets-web`, `@aura3d/lean`.

## Order at a glance

| Step | Section | Reversible | Effect |
|---|---|---|---|
| 0 | Pre-freeze prerequisites | yes | tree is release-ready |
| 1 | Verify freeze and ACR source pass | read-only | |
| 2 | Render census gate on the packed build | read-only | gate before any registry write |
| 3 | `publish-all --tag next` | npm: no (deprecate only) | 5.0.1 exists on dist-tag `next`; `latest` still 5.0.0 |
| 4 | Registry poll + install + REA real-GPU check of 25 games from the registry build | read-only | |
| 5 | Site preview deploy + REA check of 25 games on the preview URL | preview only | |
| 6 | Site production deploy + REA check | rollback by API | |
| 7 | Tag, push, merge to main | tag: owner only | |
| 8 | Promote: `npm dist-tag add ... latest`, deprecate 5.0.0 and older, GitHub release Latest + banners | dist-tag yes | |
| 9 | Final verification | read-only | |
| 10 | Rollback | | |

Stop at the first failed gate. A failure in 4 or 5 leaves `latest` on 5.0.0 and production untouched, so users are no
worse off than today; fix forward as 5.0.2.

## 0. Pre-freeze prerequisites (must be true in the frozen commit)

Items below change source inputs, so changing them after the freeze breaks the candidate binding.

| # | Item | How to check |
|---|------|--------------|
| P1 | `CHANGELOG.md` top heading reads `## 5.0.1 (2026-11-05)` (adjust the date only if the release slips; then update the CHANGELOG, migration doc and its generated HTML together) | `grep -n '^## 5.0.1' CHANGELOG.md` |
| P2 | Versions are 5.0.1 everywhere | `node tools/release/prepare-version.mjs 5.0.1 --check` (exit 0, `changed: []`), `node marketing/scripts/check-version.mjs` |
| P3 | Homepage and site checks pass | `node marketing/scripts/check-site.mjs` |
| P4 | The migration page is generated and current | `node marketing/scripts/gen-migration-doc.mjs --check` |
| P5 | `origin/main` is an ancestor of the freeze commit, or the merge-commit path in section 7 is accepted | `git merge-base --is-ancestor origin/main <freeze>` |
| P6 | This runbook is committed in the freeze (an untracked file changes the source digest) | `git status --short tools/release` |
| P7 | The tested candidate plan and its 25 archives exist (from the ACR source pass) | section 1 |

## 1. Verify the freeze and the ACR source pass (read-only)

```bash
set -euo pipefail
REPO=/Users/gurbakshchahal/platforms/aura3d     # or the worktree that holds the freeze
cd "$REPO"
REL="$REPO/tests/reports/release-501"           # scratch inside the repo (gitignored)
mkdir -p "$REL/logs"
unset AURA3D_SOURCE_MANIFEST A3D_RELEASE_PLAN A3D_RELEASE_PACK_DIR NATIVE_RUN_ID NATIVE_REPORT_DIR
V=5.0.1; PREV=5.0.0
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
if(p.version!=="5.0.1"||p.packages.length!==25||p.packageCount!==25) throw new Error("plan is not the 25-package 5.0.1 set");
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
set -euo pipefail; source tests/reports/release-501/env.sh
git -C "$REPO" worktree add --detach "$WT" "$FREEZE"
CAND_DIR=$(dirname "$PLAN"); mkdir -p "$WT/$CAND_DIR" && rsync -a "$REPO/$CAND_DIR/" "$WT/$CAND_DIR/"
cd "$WT"; git checkout -- AGENTS.md 2>/dev/null || true
test -z "$(git status --porcelain)"
npm whoami      # expect veeronecorp
```

## 2. Render census gate on the packed/registry build (before any registry write)

Every one of the 25 live games must draw against the packed 5.0.1 archives, not only against workspace source (the
5.0.0 regression passed source-level suites). Method is the one in `tests/reports/render-census-501.md`:

1. Install the 25 plan archives into the route build (offline, from `$PLAN`), run the deploy route build
   `node marketing/scripts/build-showcase-routes.mjs` from `$WT` so the games resolve `@aura3d/*` from the packed
   packages, and serve `marketing/dist` on loopback (`python3 -m http.server` bound to 127.0.0.1).
2. For each URL in `jq -r '.games[] | select(.status=="live") | .url' docs/workflows/game-inventory.json` (expect 25) run
   REA `rea_call(tool="capture_browser_scenario", ...)` at 960x540 with a 9-12 s settle on a real-GPU Chrome
   (loopback CDP only for this purpose), save the PNG and console to `$REL/census/<game>.png|json`.
3. Pass criteria per game: the 3D scene is visible in the PNG (a menu overlay over the blurred scene counts), zero
   error-level console messages other than `Failed to load resource ... 404`, and no `RENDERER_MOUNT_FAILED`.
   Warnings with a `*_DEGRADED` code are expected where listed in the CHANGELOG; record which games emit them.
4. Write `$REL/census/summary.md` (25 rows: game, drawn yes/no, error count, degrade codes).

Gate: 25/25 drawn. Any miss stops the release before step 3. A blank canvas is a release blocker, not a known limit.

## 3. Publish under dist-tag `next` (first irreversible step)

`publish-all.mjs --tag next` runs `npm publish <exact tarball> --access public --tag next` and verifies the registry with
`npm view <pkg>@next version`, so `latest` is not moved.

```bash
set -euo pipefail; source tests/reports/release-501/env.sh; cd "$WT"
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
# expect next=5.0.1, latest=5.0.0 for every package that existed before; @aura3d/addons latest may already be 5.0.0
```

## 4. Registry poll, clean install, REA real-GPU check from the registry

```bash
set -euo pipefail; source tests/reports/release-501/env.sh
cat > "$REL/poll-registry.mjs" <<'EOF'
import { readFileSync } from "node:fs";
const [planPath, V] = process.argv.slice(2);
const pkgs = JSON.parse(readFileSync(planPath, "utf8")).packages.map((p) => ({ name: p.name, integrity: p.integrity }));
if (pkgs.length !== 25) throw new Error(`expected 25 packages, plan has ${pkgs.length}`);
const t0 = Date.now();
for (;;) {
  const res = await Promise.all(pkgs.map(async ({ name, integrity }) => {
    try {
      const r = await fetch(`https://registry.npmjs.org/${name.replace("/", "%2F")}/${V}`, { headers: { "cache-control": "no-cache" } });
      if (!r.ok) return [name, `http ${r.status}`];
      const j = await r.json();
      return [name, j.dist?.integrity === integrity ? "ok" : "integrity-mismatch"];
    } catch (e) { return [name, String(e.message).slice(0, 40)]; }
  }));
  const bad = res.filter(([, s]) => s !== "ok");
  console.log(`${Math.round((Date.now() - t0) / 1000)}s ok ${res.length - bad.length}/${res.length}${bad.length ? " pending: " + bad.map(([n, s]) => `${n}(${s})`).join(" ") : ""}`);
  if (!bad.length) { console.log("REGISTRY_OK"); break; }
  if (bad.some(([, s]) => s === "integrity-mismatch")) { console.log("REGISTRY_INTEGRITY_MISMATCH"); process.exit(2); }
  if (Date.now() - t0 > 30 * 60 * 1000) { console.log("REGISTRY_TIMEOUT"); process.exit(1); }
  await new Promise((r) => setTimeout(r, 20000));
}
EOF
node "$REL/poll-registry.mjs" "$WT/$PLAN" "$V" | tee "$REL/logs/40-poll.log"
C="$REL/consumer"; rm -rf "$C"; mkdir -p "$C"; cd "$C"; npm init -y > /dev/null
npm install --prefer-online "@aura3d/engine@next"
node -e 'const l=require("./package-lock.json");const e=l.packages["node_modules/@aura3d/engine"];if(e.version!=="5.0.1")throw new Error("installed "+e.version);console.log("engine 5.0.1 installed")'
node --input-type=module -e 'const m = await import("@aura3d/engine"); if (typeof m.createAuraApp !== "function") throw new Error("createAuraApp missing"); console.log("engine import OK")'
```

Then repeat the census of section 2 with the game route build resolving `@aura3d/*` from the registry install
(`@aura3d/engine@5.0.1` and the other 24 from `$C/node_modules`), 25/25 drawn, results to `$REL/census-registry/`. Gate: a
miss here means the published bytes differ from what the source pass tested: stop, leave `latest` on 5.0.0 and
deprecate `5.0.1` with a message pointing to the next fix.

## 5. Site preview deploy and verification

```bash
set -euo pipefail; source tests/reports/release-501/env.sh; cd "$WT"; source ~/.config/auraone/cloudflare-env.sh
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
# 25 MiB per-file limit: ship the optimized boom-box.glb the live site already serves.
curl -fsS --max-time 120 -o "$REL/boom-box.glb" https://aura3d.auraone.ai/fixtures/asset-corpus/boom-box.glb
test "$(shasum -a 256 "$REL/boom-box.glb" | cut -d' ' -f1)" = 10d1de0e7699c79de597ac6d813e8505abf126b1a2c2e5dcc621a19d3e081cab
cp "$REL/boom-box.glb" marketing/dist/fixtures/asset-corpus/boom-box.glb
test -z "$(find marketing/dist -type f -size +24M)"
test -f marketing/dist/_headers && test -f marketing/dist/_redirects && test -f marketing/dist/docs/migration/4-to-5.html
node tools/verify-asset-urls/index.mjs --dist marketing/dist | tail -3
wrangler pages deploy marketing/dist --project-name aura3d --branch release-5-0-1 --commit-dirty=true \
  --commit-hash "$FREEZE" --commit-message "release: Aura3D $V (preview)" 2>&1 | tee "$REL/logs/53-preview.log" | tail -8
PREVIEW=https://release-5-0-1.aura3d.pages.dev
for u in / /docs/ /apps/aura-clash-showcase/ /docs/migration/4-to-5; do printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$PREVIEW$u")" "$u"; done
node tools/verify-asset-urls/index.mjs --base "$PREVIEW" | tail -3
node tools/site/scan-live-site.mjs "$PREVIEW" | tail -4
```

Render check on the preview URL: for each of the 25 live game URLs run REA `capture_browser_scenario` against
`$PREVIEW<game url>` (same settings and pass criteria as section 2), results to `$REL/census-preview/`. Gate: 25/25 drawn.
The built site must also show 5.0.1 (`curl -s "$PREVIEW/" | grep -o '5\.0\.1' | head -1`).

## 6. Site production deploy

Only after section 5 passed.

```bash
set -euo pipefail; source tests/reports/release-501/env.sh; cd "$WT"; source ~/.config/auraone/cloudflare-env.sh
wrangler pages deploy marketing/dist --project-name aura3d --branch main --commit-dirty=true \
  --commit-hash "$FREEZE" --commit-message "release: Aura3D $V" 2>&1 | tee "$REL/logs/60-prod.log" | tail -8
wrangler pages deployment list --project-name aura3d --environment production | head -6
PID=$(wrangler pages deployment list --project-name aura3d --environment preview --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{console.log(JSON.parse(s).filter(d=>(d.Branch||d.branch)==="release-5-0-1").map(d=>d.Id||d.id).join(" "))})')
for id in $PID; do wrangler pages deployment delete "$id" --project-name aura3d --force; done   # delete the preview (teardown rule)
```

Repeat the REA check on `https://aura3d.auraone.ai<game url>` for all 25 games (results to `$REL/census-prod/`). A miss
here: roll back the site first (section 10), leave `latest` on 5.0.0.

`aura3d-wonder-world`: if the owner wants it redeployed, follow section 7d of `release-5.0.0.md` with branch
`release-5-0-1` (never write its addresses into tracked files). The 5.0.1 fixes do not change its content.

## 7. Tag, push, merge into main

```bash
set -euo pipefail; source tests/reports/release-501/env.sh; cd "$REPO"
git tag -a "v$V" "$FREEZE" -m "Aura3D $V"
git push origin "$FREEZE:refs/heads/fix/5.0.1-contact-shadow-mount"
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
set -euo pipefail; source tests/reports/release-501/env.sh
S="$REL/scaffold"; rm -rf "$S"; mkdir -p "$S"; cd "$S"
npx -y "create-aura3d@next" smoke --template mini-game
cd smoke && npm install --prefer-online && npm run build && npx -y "@aura3d/cli@next" check-deploy --dist dist
node -p 'require("./package.json").dependencies["@aura3d/engine"]'   # expect 5.0.1
```

## 8. Promote: `latest`, deprecations, GitHub release

Only after sections 2, 4, 5 and 6 are all 25/25. This is the step that changes what `npm install @aura3d/engine` gives users.

```bash
set -uo pipefail; source tests/reports/release-501/env.sh
for n in $(node -p 'require(process.argv[1]).packages.map(p=>p.name).join(" ")' "$WT/$PLAN"); do
  npm dist-tag add "$n@$V" latest || echo "FAILED dist-tag $n"
done
cat > "$REL/deprecate.mjs" <<'EOF'
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const [planPath, V, url] = process.argv.slice(2);
const plan = JSON.parse(readFileSync(planPath, "utf8"));
const RETIRED = ["@aura3d/editor", "@aura3d/environments", "@aura3d/materials", "@aura3d/three-compat", "@aura3d/showcase-assets", "@aura3d/showcase-assets-web", "@aura3d/lean"];
const superseded = `Superseded by ${V} (5.0.0 does not draw the showcase games) - see ${url}`;
const retired = `Retired: use @aura3d/engine@${V} or later - see ${url}`;
const run = (spec, msg) => {
  for (let i = 1; i <= 3; i++) {
    try { execFileSync("npm", ["deprecate", spec, msg], { stdio: "pipe", encoding: "utf8" }); console.log("OK", spec); return; }
    catch (e) { console.log(`retry ${i}`, spec, String(e.stderr || e.message).split("\n").find((l) => /error/i.test(l)) || ""); }
  }
  console.log("FAILED", spec); process.exitCode = 1;
};
for (const { name } of plan.packages) run(`${name}@<${V}`, superseded);   // includes 5.0.0 and @aura3d/addons@5.0.0
for (const name of RETIRED) run(name, retired);
EOF
node "$REL/deprecate.mjs" "$WT/$PLAN" "$V" "$MIGRATION_URL" | tee "$REL/logs/80-deprecate.log"
cat > "$REL/check-deprecations.mjs" <<'EOF'
import { readFileSync } from "node:fs";
const [planPath, V] = process.argv.slice(2);
const plan = JSON.parse(readFileSync(planPath, "utf8"));
const RETIRED = ["@aura3d/editor", "@aura3d/environments", "@aura3d/materials", "@aura3d/three-compat", "@aura3d/showcase-assets", "@aura3d/showcase-assets-web", "@aura3d/lean"];
let bad = 0;
const doc = async (n) => (await fetch(`https://registry.npmjs.org/${n.replace("/", "%2F")}`, { headers: { "cache-control": "no-cache" } })).json();
for (const { name } of plan.packages) {
  const d = await doc(name);
  const live = Object.entries(d.versions).filter(([, v]) => !v.deprecated).map(([k]) => k);
  if (!(live.length === 1 && live[0] === V && d["dist-tags"].latest === V)) { bad++; console.log("NOT OK", name, "undeprecated:", live.join(","), "latest:", d["dist-tags"].latest); }
}
for (const name of RETIRED) {
  const d = await doc(name);
  const live = Object.entries(d.versions).filter(([, v]) => !v.deprecated || !v.deprecated.includes(V)).map(([k]) => k);
  if (live.length) { bad++; console.log("NOT OK retired", name, live.join(",")); }
}
console.log(bad ? `${bad} packages need attention` : `all ${plan.packages.length} packages: only ${V} undeprecated, latest=${V}`);
process.exitCode = bad ? 1 : 0;
EOF
node "$REL/check-deprecations.mjs" "$WT/$PLAN" "$V" | tee "$REL/logs/81-check-deprecations.log"
# Optionally drop the now redundant next tag: npm dist-tag rm <pkg> next
```

GitHub release (Latest) and banners on every older release (`v5.0.0` included; it is the one that must say "superseded"):

```bash
set -euo pipefail; source tests/reports/release-501/env.sh; cd "$REPO"
gh release create "v$V" --verify-tag --title "Aura3D $V" --notes-file "$REL/notes-$V.md" --latest
cat > "$REL/banner-releases.mjs" <<'EOF'
import { execFileSync } from "node:child_process";
const [V, url] = process.argv.slice(2);
const REL_URL = `https://github.com/auraoneai/aura3d/releases/tag/v${V}`;
const BANNER = `> **Superseded.** This version is deprecated. Upgrade to [Aura3D ${V}](${REL_URL}); see the [4.x to 5.0 migration guide](${url}).`;
const gh = (...a) => execFileSync("gh", a, { encoding: "utf8", maxBuffer: 1 << 26 });
const releases = JSON.parse(gh("release", "list", "--limit", "300", "--json", "tagName"));
let n = 0;
for (const { tagName } of releases) {
  if (tagName === `v${V}`) continue;
  const body = gh("release", "view", tagName, "--json", "body", "-q", ".body");
  const next = `${BANNER}\n\n${body.replace(/^> \*\*Superseded\.\*\*[^\n]*\n+/m, "")}`;
  if (next !== body) gh("release", "edit", tagName, "--notes", next, "--prerelease", "--latest=false");
  else gh("release", "edit", tagName, "--prerelease", "--latest=false");
  n++; console.log(tagName, next !== body ? "bannered" : "already current");
}
console.log(`${n} older releases processed`);
EOF
node "$REL/banner-releases.mjs" "$V" "$MIGRATION_URL" | tee "$REL/logs/82-banner.log"
gh release list --limit 3      # v5.0.1 Latest; v5.0.0 Pre-release
```

## 9. Final verification

```bash
set -uo pipefail; source tests/reports/release-501/env.sh; cd "$WT"
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

Record in `STATE.md` / memory: freeze commit, tag, `main` head, npm 25/25 with `latest`=5.0.1, deprecation check output,
GitHub banner count, Cloudflare deployment IDs, the three census summaries (`census`, `census-registry`, `census-preview`,
`census-prod`), and the still-open known limits from the CHANGELOG.

## 10. Rollback (record the IDs in section 5 before deploying)

Site (Wrangler has no Pages rollback; use the v4 API):

```bash
source tests/reports/release-501/env.sh; source ~/.config/auraone/cloudflare-env.sh
p=aura3d
curl -fsS -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$p/deployments/$(cat "$REL/rollback-$p.id")/rollback" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.success,j.result?.id)})'
```

npm, before section 8 (the normal failure case): `latest` is still 5.0.0, so only mark the bad build:
`npm deprecate "<pkg>@5.0.1" "Do not use: fixed in the next 5.0.x"` for each package and `npm dist-tag rm <pkg> next`.

npm, after section 8: point `latest` back and re-deprecate. 5.0.0 is the known-blank build, so prefer fixing forward as
5.0.2; if a rollback to 4.7.14 is required:

```bash
for n in $(node -p 'require(process.argv[1]).packages.map(p=>p.name).filter(n=>n!=="@aura3d/addons").join(" ")' "$WT/$PLAN"); do
  npm dist-tag add "$n@4.7.14" latest
  npm deprecate "$n@4.7.14" ""
  npm deprecate "$n@5.0.1" "Rolled back: use $n@4.7.14 until a fixed 5.x ships"
done
npm deprecate "@aura3d/addons@5.0.1" "Rolled back with Aura3D 5.0.1: do not use"
```

Unpublishing within 72 h deletes production data and needs the owner's explicit go; it is not part of this rollback.

GitHub: `gh release edit v5.0.1 --prerelease --latest=false && gh release edit v4.7.14 --prerelease=false --latest`, then
restore the original v4.7.14 notes to drop the banner. Never delete a pushed tag or force-push `main`; if `main` must
return to earlier content use `git revert -m 1 <merge>` with `[skip ci]`.
