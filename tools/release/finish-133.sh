#!/bin/bash
# Finishes the 1.3.3 release once npm publish auth is available.
# Usage: NPM_CONFIG_USERCONFIG=~/aura3d-publish.npmrc bash tools/release/finish-133.sh
set -euo pipefail
cd "$(dirname "$0")/../.."

echo "== 1/4 publish all 26 packages (skips any already at 1.3.3 via E403-conflict) =="
node tools/release/publish-all.mjs

echo "== 2/4 registry verification (26/26 at 1.3.3) =="
node -e '
const { execSync } = require("child_process");
const { readdirSync, existsSync, readFileSync } = require("fs");
const pkgs = ["package.json", ...readdirSync("packages").map(p => "packages/"+p+"/package.json")].filter(p => existsSync(p));
let ok = 0, bad = [];
for (const p of pkgs) {
  const m = JSON.parse(readFileSync(p, "utf8"));
  if (m.private) continue;
  const v = execSync("npm view "+m.name+" version", {encoding:"utf8"}).trim();
  if (v === "1.3.3") ok++; else bad.push(m.name+"@"+v);
}
console.log("registry at 1.3.3:", ok, "/ 26");
if (ok !== 26) { console.error("NOT ALL PUBLISHED:", bad.join(", ")); process.exit(1); }
'

echo "== 3/4 published-create lockstep proof =="
pnpm exec tsx --tsconfig tsconfig.base.json tools/aura3d109-published-create-aura3d-proof/index.ts --out tests/reports/aura3d133/published-create-aura3d-proof.json
pnpm exec tsx --tsconfig tsconfig.base.json tools/aura3d109-published-engine-proof/index.ts --out tests/reports/aura3d133/published-engine-proof.json

echo "== 4/4 clean-machine npx smoke (one classic + one three-compat) =="
SMOKE=$(mktemp -d /tmp/aura3d-npx-smoke.XXXXXX)
for T in product-viewer three-compat-character-viewer; do
  echo "--- $T ---"
  (cd "$SMOKE" && npx --yes create-aura3d@latest "$T-app" --template "$T" 2>&1 | tail -2)
  (cd "$SMOKE/$T-app" && npm install --no-audit --no-fund 2>&1 | tail -1 && npm run build 2>&1 | tail -2)
done
echo "ALL POST-PUBLISH CHECKS GREEN — mark QuickFixes.md lines 294/295/302 and re-run: pnpm exec tsx --tsconfig tsconfig.base.json tools/aura3d106-release-readiness/index.ts --out tests/reports/aura3d133/release.json"
