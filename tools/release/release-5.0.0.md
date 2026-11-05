# Aura3D 5.0.0 release runbook

Run this only after acceptance has passed and the owner has said go. Each section is copy-paste
bash (zsh works too). Run the sections in order. Every `test`/`node -e` guard is a hard stop: if
one fails, do not continue. Fix the cause, or roll back (section 9).

Scope: publish 25 npm packages, deprecate older versions, tag `v5.0.0`, push, merge into `main`,
create the GitHub release, deploy the Cloudflare Pages projects `aura3d` and `aura3d-wonder-world`,
and verify the live sites. Never use Vercel. Never run `npm login`, `gh auth login|refresh`,
`wrangler login`, `npm token create` or setup scripts. Never export or set `GH_*`, `GITHUB_*`,
`NPM_TOKEN` or `NODE_AUTH_TOKEN`, and never write a token into a repo `.npmrc`. The npm token in
`~/.npmrc` (granular, `bypass_2fa: true`, expires around 2027-01-30) and the `gh` keyring login
are used as they are.

Memory recipes this runbook follows: `project-436-docs-site-release`, `project-479-release`,
`project-4710-release`, `release-deprecate-priors`.

## 0. Pre-freeze prerequisites

These must already be true in the frozen commit. Each item changes source inputs, so making the
change after the freeze breaks the candidate binding (`bindSourceIdentityToCommit` compares the
input digest of every tracked and untracked-but-not-ignored file). Check them before the freeze.

| # | Item | How to check |
|---|------|--------------|
| P1 | `CHANGELOG.md` heading reads `## 5.0.0 (YYYY-MM-DD)`, not `(unreleased)`, and the "Known limits" line "The release candidate is not frozen..." is gone | `grep -n '^## 5.0.0' CHANGELOG.md` |
| P2 | Homepage trust stat says 25 npm packages (`marketing/index.html`, `<strong>24</strong><span>npm packages`). Otherwise `marketing/scripts/check-site.mjs` fails the marketing build | `node marketing/scripts/check-site.mjs` |
| P3 | The marketing Vite build resolves the SPZ zstd worker. Today `packages/assets/src/loaders/ZstdDecoder.ts:25` uses `new URL("../workers/zstd.worker.js", import.meta.url)`. Only `zstd.worker.ts` exists in source, so the source-aliased marketing build fails with `Could not resolve entry module "../packages/assets/src/workers/zstd.worker.js"`. Wonder World builds through the same root aliases and is likely affected too | `pnpm --dir marketing build` |
| P4 | The page `https://aura3d.auraone.ai/docs/migration/4-to-5` exists after the 7c deploy. Done in source: `marketing/scripts/gen-migration-doc.mjs` renders `docs/migration/4-to-5.md` into `marketing/docs/migration/4-to-5.html`, the marketing build emits it as `marketing/dist/docs/migration/4-to-5.html`, and Cloudflare Pages serves that file at the extensionless URL. The build fails if the page is stale against the Markdown. Until 7c is live the URL is still the SPA fallback (homepage), so the deprecation messages in section 5 point at a page that appears with the 7c deploy | `node marketing/scripts/gen-migration-doc.mjs --check`; section 8 check |
| P5 | `origin/main` is an ancestor of the freeze commit. Today `origin/main` has `aa1b724b2` (CI cost guard, `.gitlab-ci.yml`, `tools/remote-runner/provision.sh`), which `native/5.0` lacks, so `main` cannot be fast-forwarded. Merge it into `native/5.0` before the freeze, or accept the merge-commit path in 6c | `git merge-base --is-ancestor origin/main <freeze>` |
| P6 | This runbook is committed in the freeze, or removed from the checkout. An untracked `tools/release/release-5.0.0.md` changes the source input digest | `git status --short tools/release` |
| P7 | The gate's candidate plan and its 25 archives exist locally (`code-complete-go.json` → `candidatePlan.path`, `tests/reports/native-capabilities/<run>/candidate-tarballs/*.tgz`). The ACR source pass (`tools/remote-acr/run-source5.sh`) does not download its tarballs, only the plan JSON inside `source-report.json`. Its `pack` step also fails today: `source5-run.sh` exports `AURA3D_SOURCE_MANIFEST` as a `shasum` text list, and `stagedSourceIdentity` `JSON.parse`s that file (native-5-source-002 `[pack] SyntaxError ... source-identity.mjs:100`) | section 1 |

## 1. Verify the freeze and acceptance (read-only)

```bash
set -euo pipefail
REPO=/Users/gurbakshchahal/platforms/aura3d
REL=/tmp/aura3d-rel500            # scratch, outside the repo
mkdir -p "$REL/logs"
cd "$REPO"
unset AURA3D_SOURCE_MANIFEST A3D_RELEASE_PLAN A3D_RELEASE_PACK_DIR NATIVE_RUN_ID NATIVE_REPORT_DIR
GATE=tests/reports/native-capabilities/code-complete-go.json
ACCEPT_RUN_ID=<the merged acceptance RUN_ID>   # e.g. native-5-accept-001 (MERGE_RUNS output)
ACCEPT=tests/reports/native-5/$ACCEPT_RUN_ID/acceptance-report.json
V=5.0.0; PREV=4.7.13
MIGRATION_URL=https://aura3d.auraone.ai/docs/migration/4-to-5   # see P4: marketing/dist/docs/migration/4-to-5.html, live after 7c

FREEZE=$(node -p 'const g=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")); if(g.schema!=="aura3d.native-code-complete/1"||g.status!=="CODE_COMPLETE_GO") throw new Error("not a GO record"); g.freezeCommit' "$GATE")
test "$(git rev-parse HEAD)" = "$FREEZE"               # HEAD is the frozen commit
test "$(git rev-parse native/5.0)" = "$FREEZE"         # branch is not ahead of the freeze
test -z "$(git status --porcelain --untracked-files=no -- . ':!AGENTS.md')"
node tools/native-capability-gate/index.mjs --phase acceptance --gate "$GATE"    # prints "CODE_COMPLETE_GO validated"

# The acceptance report passed for this exact gate and commit.
node -e '
const fs=require("fs"),c=require("crypto");
const [acc,gate,freeze]=process.argv.slice(1);
const r=JSON.parse(fs.readFileSync(acc,"utf8"));
const gsha=c.createHash("sha256").update(fs.readFileSync(gate)).digest("hex");
if(r.schema!=="aura3d.acceptance5-report/1") throw new Error("bad schema");
if(r.status!=="passed") throw new Error("acceptance status "+r.status+" "+JSON.stringify(r.totals));
if(r.candidate?.freezeCommit!==freeze) throw new Error("acceptance ran on "+r.candidate?.freezeCommit);
if(r.candidate?.gateSha256!==gsha) throw new Error("acceptance ran against a different gate record");
console.log("acceptance passed:",JSON.stringify(r.totals));' "$ACCEPT" "$GATE" "$FREEZE"

# The candidate plan is the one the gate binds. Every archive exists and matches its digest.
PLAN=$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).candidatePlan.path' "$GATE")
node -e '
const fs=require("fs"),c=require("crypto");
const [gate,plan]=process.argv.slice(1);
const g=JSON.parse(fs.readFileSync(gate,"utf8"));
const bytes=fs.readFileSync(plan);
if(c.createHash("sha256").update(bytes).digest("hex")!==g.candidatePlan.sha256) throw new Error("plan bytes differ from the gate");
const p=JSON.parse(bytes);
if(p.version!=="5.0.0"||p.packages.length!==25||p.packageCount!==25) throw new Error("plan is not the 25-package 5.0.0 set");
for(const e of p.packages){const b=fs.readFileSync(e.tarball);
  if(c.createHash("sha256").update(b).digest("hex")!==e.sha256) throw new Error("archive differs "+e.tarball);
  if("sha512-"+c.createHash("sha512").update(b).digest("base64")!==e.integrity) throw new Error("integrity differs "+e.tarball);}
console.log("plan OK:",p.packages.map(e=>e.name).join(" "));' "$GATE" "$PLAN"

cat > "$REL/env.sh" <<EOF
REPO=$REPO; REL=$REL; V=$V; PREV=$PREV; FREEZE=$FREEZE; PLAN=$PLAN; MIGRATION_URL=$MIGRATION_URL
WT=$REL/wt
EOF
```

The 25 packages (`release-inventory.mjs`, inventory `native-1`): `@aura3d/engine`, `@aura3d/addons`
(new, first publish), `@aura3d/animation`, `@aura3d/apps`, `@aura3d/asset-index`, `@aura3d/assets`,
`@aura3d/audio`, `@aura3d/cli`, `@aura3d/controls`, `@aura3d/core`, `create-aura3d`,
`@aura3d/debug`, `@aura3d/ecs`, `@aura3d/editor-runtime`, `@aura3d/input`, `@aura3d/math`,
`@aura3d/navigation-recast`, `@aura3d/physics`, `@aura3d/physics-rapier`,
`@aura3d/product-studio`, `@aura3d/react`, `@aura3d/rendering`, `@aura3d/scene`,
`@aura3d/scripting`, `@aura3d/workflows`. Retired (deprecate only, never publish):
`@aura3d/editor`, `@aura3d/environments`, `@aura3d/materials`, `@aura3d/three-compat`,
`@aura3d/showcase-assets`, `@aura3d/showcase-assets-web`, `@aura3d/lean`.

### If P7 fails (no local tested archives)

`publish-all.mjs --from-plan` publishes the exact plan tarballs with `npm publish <tarball>`.
It re-hashes every archive (SHA-256 and SHA-512) before any registry write and never repacks.
Plain `--dry-run` without `--from-plan` repacks into `tests/reports/release-tarballs`, which already
exists on this checkout, so it refuses. Do not use it for 5.0.0.

If the tested archives are not on disk, a repack is allowed only when it is byte-identical. In the
clean worktree (section 2a, then `pnpm install --frozen-lockfile --offline && pnpm build`), run:

```bash
A3D_RELEASE_PACK_DIR=tests/reports/native-capabilities/release-500-repack/candidate-tarballs \
  node tools/release/publish-all.mjs --pack-only --out-plan tests/reports/native-capabilities/release-500-repack/candidate-plan.json
node -e 'const a=require(process.argv[1]),b=require(process.argv[2]);let bad=0;for(const p of a.packages){const q=b.packages.find(x=>x.name===p.name);if(!q||q.sha256!==p.sha256){bad++;console.log("DIFF",p.name)}}if(bad)process.exit(1);console.log("byte-identical")' "$PWD/<tested plan>" "$PWD/tests/reports/native-capabilities/release-500-repack/candidate-plan.json"
```

If any digest differs, stop. The tested image used Node 24.14.1 and pnpm 11.1.3, and this Mac has
Node 26.11.1, so gzip bytes can differ. In that case the archives must come from the tested run
itself, or a new candidate must go through acceptance again. Do not publish untested bytes.

## 2. npm: preflight, then publish the exact archives

### 2a. Clean release worktree (publish and deploy run from here)

```bash
set -euo pipefail; source /tmp/aura3d-rel500/env.sh
git -C "$REPO" worktree add --detach "$WT" "$FREEZE"
# Copy only the candidate directory (plan + 25 tarballs). Never copy tests/, public/ or evidence/.
CAND_DIR=$(dirname "$PLAN")
mkdir -p "$WT/$CAND_DIR" && rsync -a "$REPO/$CAND_DIR/" "$WT/$CAND_DIR/"
cd "$WT"
git checkout -- AGENTS.md 2>/dev/null || true      # the machine policy sync rewrites AGENTS.md in worktrees; never commit it
test -z "$(git status --porcelain)"                 # no tracked or untracked source drift
test "$(git lfs ls-files | awk '$2=="-"' | wc -l | tr -d ' ')" = 0   # LFS objects present
npm whoami                                          # expect veeronecorp
npm token list --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{if(!JSON.parse(s).some(t=>t.bypass_2fa===true))process.exit(1);console.log("bypass_2fa token present")})'
```

### 2b. Dry run against the exact plan (no repack, no registry writes)

```bash
set -euo pipefail; source /tmp/aura3d-rel500/env.sh; cd "$WT"
env -u AURA3D_SOURCE_MANIFEST -u A3D_RELEASE_PLAN node tools/release/publish-all.mjs --dry-run --from-plan "$PLAN" 2>&1 | tee "$REL/logs/20-dry-run.log"
grep -c '^\[dry-run\] validated retained' "$REL/logs/20-dry-run.log"     # expect 25
grep -q 'dry-run complete.' "$REL/logs/20-dry-run.log"
```

The dry run fails if any package already has 5.0.0, if an archive changed, or if the plan does
not bind to `$FREEZE`. Make no edits between 2b and 2c.

### 2c. Publish (the first irreversible step)

```bash
set -uo pipefail; source /tmp/aura3d-rel500/env.sh; cd "$WT"
env -u AURA3D_SOURCE_MANIFEST -u A3D_RELEASE_PLAN node tools/release/publish-all.mjs --from-plan "$PLAN" > "$REL/logs/21-publish.log" 2>&1; rc=$?
echo "PUBLISH_EXIT rc=$rc" >> "$REL/logs/21-publish.log"; tail -30 "$REL/logs/21-publish.log"
grep -c '^published \|^already published ' "$REL/logs/21-publish.log"   # expect 25
```

If you monitor the log, filter on `PUBLISH_EXIT` only; one notification per package floods. A
non-zero rc caused only by `registry mismatch` lines comes from `npm view` cache lag in the
script's final check. If all 25 lines say `published`/`already published`, go on to section 3.
For any `FAILED <pkg>` line, re-run 2c: packages that already landed are skipped as
`already published`.

## 3. Registry poll (fetch, not the npm CLI cache)

```bash
set -euo pipefail; source /tmp/aura3d-rel500/env.sh
cat > "$REL/poll-registry-500.mjs" <<'EOF'
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
node "$REL/poll-registry-500.mjs" "$WT/$PLAN" "$V" | tee "$REL/logs/30-poll.log"
```

Expect about 4 minutes of lag (4.7.10). An integrity mismatch is a stop: roll back (section 9).

## 4. Clean-directory install check

```bash
set -euo pipefail; source /tmp/aura3d-rel500/env.sh
C=$(mktemp -d "$REL/consumer.XXXXXX"); cd "$C"
npm init -y > /dev/null
npm install --prefer-online "@aura3d/engine@$V"
node -e '
const fs=require("fs");const plan=JSON.parse(fs.readFileSync(process.argv[1],"utf8"));const lock=JSON.parse(fs.readFileSync("package-lock.json","utf8"));
let seen=0;for(const [p,e] of Object.entries(lock.packages)){const c=plan.packages.find(x=>p.endsWith("node_modules/"+x.name));if(!c)continue;seen++;
 if(e.version!==c.version||e.integrity!==c.integrity) throw new Error("installed "+p+" "+e.version+" "+e.integrity);}
if(!seen) throw new Error("no planned packages installed");console.log("installed archives match the plan:",seen);' "$WT/$PLAN"
node --input-type=module -e 'const m = await import("@aura3d/engine"); if (typeof m.createAuraApp !== "function") throw new Error("createAuraApp missing"); console.log("engine import OK")'
```

The `create-aura3d` scaffold check is 6e: templates fetch large binaries from the `v5.0.0` tag,
so it must run after the tag is pushed.

## 5. Deprecate all prior versions

Run this only after sections 3 and 4 pass.

```bash
set -uo pipefail; source /tmp/aura3d-rel500/env.sh
cat > "$REL/deprecate-500.mjs" <<'EOF'
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
const [planPath, V, url] = process.argv.slice(2);
const plan = JSON.parse(readFileSync(planPath, "utf8"));
const RETIRED = ["@aura3d/editor", "@aura3d/environments", "@aura3d/materials", "@aura3d/three-compat", "@aura3d/showcase-assets", "@aura3d/showcase-assets-web", "@aura3d/lean"];
const superseded = `Superseded by ${V} — see ${url}`;
const retired = `Retired: use @aura3d/engine@${V} or later — see ${url}`;
const run = (spec, msg) => {
  for (let i = 1; i <= 3; i++) {   // @aura3d/cli failed once in 4.7.10 and needed a retry
    try { execFileSync("npm", ["deprecate", spec, msg], { stdio: "pipe", encoding: "utf8" }); console.log("OK", spec); return; }
    catch (e) { console.log(`retry ${i}`, spec, String(e.stderr || e.message).split("\n").find((l) => /error/i.test(l)) || ""); }
  }
  console.log("FAILED", spec); process.exitCode = 1;
};
for (const { name } of plan.packages) {
  if (name === "@aura3d/addons") continue;   // first published at 5.0.0: no prior versions
  run(`${name}@<${V}`, superseded);
}
for (const name of RETIRED) run(name, retired);   // all versions
EOF
node "$REL/deprecate-500.mjs" "$WT/$PLAN" "$V" "$MIGRATION_URL" | tee "$REL/logs/50-deprecate.log"

cat > "$REL/check-deprecations-500.mjs" <<'EOF'
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
console.log(bad ? `${bad} packages need attention` : `all ${plan.packages.length} packages: only ${V} undeprecated, latest=${V}; ${RETIRED.length} retired packages re-pointed`);
process.exitCode = bad ? 1 : 0;
EOF
node "$REL/check-deprecations-500.mjs" "$WT/$PLAN" "$V" | tee "$REL/logs/51-check-deprecations.log"
```

## 6. Git tag, push, merge into main, GitHub release

`main` has workflows that run on every push (`ci`, `build`, `browser-matrix` with 5 long shards, the
`qr-*` suites, `mirror-to-gitlab`). The machine policy forbids using GitHub Actions. Push to `main`
with a `[skip ci]` head commit. If a fast-forward makes the freeze commit the head and its message
lacks `[skip ci]`, cancel the push runs right away (6c).

```bash
set -euo pipefail; source /tmp/aura3d-rel500/env.sh; cd "$REPO"
# 6a. Tag the frozen commit and push the branch and tag.
git tag -a "v$V" "$FREEZE" -m "Aura3D $V"
git push origin "$FREEZE:refs/heads/native/5.0"
git push origin "v$V"
git ls-remote origin "refs/tags/v$V^{}" | grep -q "$FREEZE"

# 6b. Release notes from CHANGELOG 5.0.0 (outside the repo).
awk '/^## 5\.0\.0/{f=1;next} /^## /{if(f)exit} f' CHANGELOG.md > "$REL/notes-$V.md"
test -s "$REL/notes-$V.md"
! grep -q 'unreleased\|not frozen' "$REL/notes-$V.md"          # P1

# 6c. Merge into main. The convention is fast-forward (4.3.6, 4.7.9, 4.7.13).
git fetch origin main
M=$REL/main-merge; git worktree add --detach "$M" origin/main; cd "$M"
if git merge-base --is-ancestor origin/main "$FREEZE"; then
  git merge --ff-only "$FREEZE"
else
  git merge --no-ff "$FREEZE" -m "merge: Aura3D $V (native/5.0) into main [skip ci]" -m "Co-Authored-By: Claude <noreply@anthropic.com>"
fi
git checkout -- AGENTS.md 2>/dev/null || true
git push origin HEAD:refs/heads/main
MAIN_HEAD=$(git rev-parse HEAD); echo "main -> $MAIN_HEAD"
cd "$REPO"; git worktree remove "$M"
# If the push was a fast-forward without [skip ci], cancel the triggered runs:
sleep 20; gh run list --branch main --event push --limit 30 --json databaseId,headSha,status \
  -q ".[] | select(.headSha==\"$MAIN_HEAD\" and .status!=\"completed\") | .databaseId" | xargs -n1 -I{} gh run cancel {} || true

# 6d. GitHub release (Latest).
gh release create "v$V" --verify-tag --title "Aura3D $V" --notes-file "$REL/notes-$V.md" --latest
```

6e. Scaffold check (needs the pushed tag):

```bash
set -euo pipefail; source /tmp/aura3d-rel500/env.sh
S=$(mktemp -d "$REL/scaffold.XXXXXX"); cd "$S"
npx -y "create-aura3d@$V" smoke --template mini-game
cd smoke && npm install --prefer-online && npm run build
npx -y "@aura3d/cli@$V" check-deploy --dist dist
node -p 'require("./package.json").dependencies["@aura3d/engine"]'   # expect 5.0.0
```

6f. Banner the older GitHub releases (memory `release-deprecate-priors`). There are 56 now.

```bash
set -uo pipefail; source /tmp/aura3d-rel500/env.sh
cat > "$REL/banner-releases-500.mjs" <<'EOF'
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
node "$REL/banner-releases-500.mjs" "$V" "$MIGRATION_URL" | tee "$REL/logs/60-banner.log"
gh release list --limit 3      # v5.0.0 Latest; v4.7.13 Pre-release
```

## 7. Cloudflare Pages deploys (preview first, then production)

### 7a. Record rollback targets before deploying

```bash
set -euo pipefail; source /tmp/aura3d-rel500/env.sh
wrangler whoami | grep -q bd3fbe37a66521e496ea1b90f669f8b7
for p in aura3d aura3d-wonder-world; do
  wrangler pages deployment list --project-name "$p" --environment production --json \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s);console.log(a[0].Id||a[0].id)})' > "$REL/rollback-$p.id"
  echo "$p rollback target: $(cat "$REL/rollback-$p.id")"
done
```

Last observed (2026-11-03): `aura3d` production `40f0ad4b-91f4-4ed3-8450-250c81e3c5c7` (4.7.10,
`554f840`); `aura3d-wonder-world` production `194a0a85-4c91-48b6-827b-c99a6f14aa81`. Use the IDs
recorded at deploy time, not these.

### 7b. Build the site payload in the release worktree

```bash
set -uo pipefail; source /tmp/aura3d-rel500/env.sh; cd "$WT"
source ~/.config/auraone/cloudflare-env.sh
# Fixtures trap: gitignored fixtures (e.g. fixtures/asset-corpus/boom-box.glb) exist only in the main checkout.
rsync -a --ignore-existing "$REPO/fixtures/" fixtures/
git checkout -- AGENTS.md 2>/dev/null || true
pnpm install --frozen-lockfile --offline > "$REL/logs/70-install.log" 2>&1 || { echo FAIL install; exit 1; }
nice -n 10 pnpm build > "$REL/logs/71-build.log" 2>&1 || { echo FAIL pnpm build; exit 1; }
nice -n 10 pnpm --dir marketing build > "$REL/logs/72-marketing.log" 2>&1 || { echo FAIL marketing build; tail -20 "$REL/logs/72-marketing.log"; exit 1; }
# 25 MiB per-file limit: boom-box.glb is 38 MB raw. Ship the optimized copy the live site already serves.
curl -fsS --max-time 120 -o "$REL/boom-box.glb" https://aura3d.auraone.ai/fixtures/asset-corpus/boom-box.glb
test "$(shasum -a 256 "$REL/boom-box.glb" | cut -d' ' -f1)" = 10d1de0e7699c79de597ac6d813e8505abf126b1a2c2e5dcc621a19d3e081cab
cp "$REL/boom-box.glb" marketing/dist/fixtures/asset-corpus/boom-box.glb
# antique-camera.glb is now the 17.5 MB Khronos original (5.0 re-pin ae8969...). It is under the limit, so do NOT overwrite it with the old 21.5 MB copy.
test -z "$(find marketing/dist -type f -size +24M)" || { find marketing/dist -type f -size +24M -exec ls -la {} \; ; echo "FAIL: files over 24 MiB"; exit 1; }
test -f marketing/dist/_headers && test -f marketing/dist/_redirects
test -f marketing/dist/docs/migration/4-to-5.html   # MIGRATION_URL page (P4)
node tools/verify-asset-urls/index.mjs --dist marketing/dist | tail -3
```

### 7c. `aura3d`: preview branch, verify, then production

```bash
set -euo pipefail; source /tmp/aura3d-rel500/env.sh; cd "$WT"; source ~/.config/auraone/cloudflare-env.sh
wrangler pages deploy marketing/dist --project-name aura3d --branch release-5-0-0 --commit-dirty=true \
  --commit-hash "$FREEZE" --commit-message "release: Aura3D $V (preview)" 2>&1 | tee "$REL/logs/73-preview.log" | tail -8
PREVIEW=https://release-5-0-0.aura3d.pages.dev
for u in / /docs/ /apps/aura-clash-showcase/ /docs/migration/4-to-5; do printf '%s %s\n' "$(curl -s -o /dev/null -w '%{http_code}' "$PREVIEW$u")" "$u"; done
node tools/verify-asset-urls/index.mjs --base "$PREVIEW" | tail -3
node tools/site/scan-live-site.mjs "$PREVIEW" | tail -4
# Production
wrangler pages deploy marketing/dist --project-name aura3d --branch main --commit-dirty=true \
  --commit-hash "$FREEZE" --commit-message "release: Aura3D $V" 2>&1 | tee "$REL/logs/74-prod.log" | tail -8
wrangler pages deployment list --project-name aura3d --environment production | head -6
# Delete the preview deployment (Cloudflare teardown rule)
PID=$(wrangler pages deployment list --project-name aura3d --environment preview --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const a=JSON.parse(s).filter(d=>(d.Branch||d.branch)==="release-5-0-0");console.log(a.map(d=>d.Id||d.id).join(" "))})')
for id in $PID; do wrangler pages deployment delete "$id" --project-name aura3d --force; done
```

### 7d. `aura3d-wonder-world`: preview branch, verify, then production

The repo is public, so never write the Wonder World addresses into tracked files. The production
domain is read from the Cloudflare API here.

```bash
set -euo pipefail; source /tmp/aura3d-rel500/env.sh; cd "$WT"; source ~/.config/auraone/cloudflare-env.sh
bash apps/veer-wonder-world/tools/deploy-build.sh > "$REL/logs/75-ww-build.log" 2>&1 || { tail -20 "$REL/logs/75-ww-build.log"; exit 1; }
test -z "$(find apps/veer-wonder-world/dist -type f -size +24M)"
wrangler pages deploy apps/veer-wonder-world/dist --project-name aura3d-wonder-world --branch release-5-0-0 \
  --commit-dirty=true --commit-hash "$FREEZE" --commit-message "release: Aura3D $V (preview)" 2>&1 | tail -6
WW_PREVIEW="https://release-5-0-0.aura3d-wonder-world.pages.dev"
curl -s -o /dev/null -w '%{http_code}\n' "$WW_PREVIEW/"                         # 200
curl -s "$WW_PREVIEW/" | grep -qi 'noindex'                                     # stays noindex
wrangler pages deploy apps/veer-wonder-world/dist --project-name aura3d-wonder-world --branch main \
  --commit-dirty=true --commit-hash "$FREEZE" --commit-message "release: Aura3D $V" 2>&1 | tail -6
WW_DOMAIN=$(curl -fsS -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
  "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/aura3d-wonder-world" \
  | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>console.log(JSON.parse(s).result.domains.find(d=>!d.endsWith(".pages.dev"))))')
curl -s -o /dev/null -w '%{http_code}\n' "https://$WW_DOMAIN/"                    # 200
PID=$(wrangler pages deployment list --project-name aura3d-wonder-world --environment preview --json | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{console.log(JSON.parse(s).filter(d=>(d.Branch||d.branch)==="release-5-0-0").map(d=>d.Id||d.id).join(" "))})')
for id in $PID; do wrangler pages deployment delete "$id" --project-name aura3d-wonder-world --force; done
```

## 8. Post-deploy verification (production)

```bash
set -uo pipefail; source /tmp/aura3d-rel500/env.sh; cd "$WT"
bad=0
for u in $(jq -r '.games[] | select(.status=="live") | .url' docs/workflows/game-inventory.json); do
  c=$(curl -s -o /dev/null -w '%{http_code}' --max-time 60 "https://aura3d.auraone.ai$u"); [ "$c" = 200 ] || { echo "BAD $u $c"; bad=$((bad+1)); }
done
echo "live game URLs: $(jq '[.games[]|select(.status=="live")]|length' docs/workflows/game-inventory.json), non-200: $bad"   # expect 25, 0
node tools/verify-asset-urls/index.mjs --base https://aura3d.auraone.ai 2>&1 | tail -3
node tools/site/scan-live-site.mjs 2>&1 | tail -4
# The migration link used in every deprecation message must be a real page, not the SPA homepage fallback (P4).
curl -s "$MIGRATION_URL" | grep -q '<title>Migrate from Aura3D 4.x to 5' && ! curl -s "$MIGRATION_URL" | grep -q '<title>Aura3D: the TypeScript 3D engine' \
  && echo "migration page OK" || echo "MIGRATION PAGE MISSING: $MIGRATION_URL serves the homepage"
curl -s https://aura3d.auraone.ai/ | grep -o '5\.0\.0' | head -1                 # site shows 5.0.0
# Cleanup: release worktree (keep $REL/logs)
git -C "$REPO" worktree remove --force "$WT"
```

Record the release in `STATE.md` / memory: release commit, tag, `main` head, npm 25/25, deprecation
check output, GitHub banner count, Cloudflare deployment IDs, game URLs 200, asset URL count, and
live scan pages.

## 9. Rollback (write down the IDs in 7a before deploying)

Cloudflare: Wrangler has no Pages rollback command, so use the v4 API.

```bash
source /tmp/aura3d-rel500/env.sh; source ~/.config/auraone/cloudflare-env.sh
for p in aura3d aura3d-wonder-world; do
  curl -fsS -X POST -H "Authorization: Bearer $CLOUDFLARE_API_TOKEN" \
    "https://api.cloudflare.com/client/v4/accounts/$CLOUDFLARE_ACCOUNT_ID/pages/projects/$p/deployments/$(cat "$REL/rollback-$p.id")/rollback" \
    | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const j=JSON.parse(s);console.log(j.success,j.result?.id)})'
done
```

npm: point `latest` back to 4.7.13, un-deprecate 4.7.13, and deprecate 5.0.0. `@aura3d/addons`
has only 5.0.0, so it is deprecated only. Unpublishing within 72 h deletes production data and
needs the owner's explicit go; it is not part of this rollback.

```bash
source /tmp/aura3d-rel500/env.sh
for n in $(node -p 'require(process.argv[1]).packages.map(p=>p.name).filter(n=>n!=="@aura3d/addons").join(" ")' "$WT/$PLAN" 2>/dev/null || node -p 'require(process.argv[1]).packages.map(p=>p.name).filter(n=>n!=="@aura3d/addons").join(" ")' "$REPO/$PLAN"); do
  npm dist-tag add "$n@4.7.13" latest
  npm deprecate "$n@4.7.13" ""
  npm deprecate "$n@5.0.0" "Rolled back: use $n@4.7.13 until a fixed 5.x ships"
done
npm deprecate "@aura3d/addons@5.0.0" "Rolled back with Aura3D 5.0.0: do not use"
```

GitHub: `gh release edit v5.0.0 --prerelease --latest=false && gh release edit v4.7.13 --prerelease=false --latest`.
Then remove the 4.7.13 banner with `gh release edit v4.7.13 --notes-file <original notes>`. Leave
the `v5.0.0` tag; deleting a published tag needs the owner. If `main` must return to 4.7.13
content, use `git revert -m 1 <merge>` with `[skip ci]` (only after a non-ff merge). Never
force-push `main`.
