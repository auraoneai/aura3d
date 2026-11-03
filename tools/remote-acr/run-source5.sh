#!/usr/bin/env bash
# Aura3D 5.0 source pass on the 4.x ACR path (decision record item 1,
# docs/prds/aura3d-native-code-complete.md). One `az acr build` of
# Dockerfile.playwright from the committed candidate, then one `az acr run`
# per stage (<= 1800 s each, <= 2 concurrent, ACR policy), reports merged into
# tests/reports/native-5/<run>/source-report.json, image deleted afterwards.
# Usage: RUN_ID=native-5-source-001 tools/remote-acr/run-source5.sh
#        STAGES="static suites" ... to run a subset (rerun of affected checks).
set -euo pipefail
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"
AZ_WRAPPER="${AZ_WRAPPER:-az-auraone-gurbaksh}"
EXPECTED_SUB='9b7da706-63ce-4740-8c03-3b77cbe1b7d0'
ACR_NAME="${ACR_NAME:-picassostagingacr}"
ACR_RG="${ACR_RG:-SHARED-CI-RG}"
IMAGE_REPO="${IMAGE_REPO:-aura3d-source5}"
RUN_ID="${RUN_ID:-native-5-source-$(date -u +%Y%m%dT%H%M%SZ)}"
KEEP_IMAGE="${KEEP_IMAGE:-0}"
RELEASE_KIND="${NATIVE_RELEASE_KIND:-major}"
UNIT_SHARDS="${UNIT_SHARDS:-6}"
DEFAULT_STAGES="static suites packed-a packed-b"
for i in $(seq 1 "$UNIT_SHARDS"); do DEFAULT_STAGES="$DEFAULT_STAGES unit-$i-of-$UNIT_SHARDS"; done
STAGES="${STAGES:-$DEFAULT_STAGES}"
MAX_PARALLEL=2
[[ "$RUN_ID" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$ ]] || { echo 'invalid RUN_ID' >&2; exit 2; }
if [ -n "$(git status --porcelain --untracked-files=no -- . ':!AGENTS.md')" ]; then
  echo 'FATAL: tracked changes present; the source pass runs only a committed candidate' >&2; exit 2
fi
COMMIT="$(git rev-parse HEAD)"
OUT_DIR="tests/reports/native-5/$RUN_ID"
[ -e "$OUT_DIR" ] && { echo "FATAL: $OUT_DIR exists" >&2; exit 2; }
mkdir -p "$OUT_DIR"
IMAGE_TAG="run-$RUN_ID"
CTX="$(mktemp -d /tmp/aura3d-source5.XXXXXX)"
PUSHED=0
cleanup() {
  local rc=$?
  trap - EXIT INT TERM
  if [ "$PUSHED" = 1 ] && [ "$KEEP_IMAGE" != 1 ]; then
    "$AZ_WRAPPER" acr repository delete -n "$ACR_NAME" --image "$IMAGE_REPO:$IMAGE_TAG" --yes -o none || { echo "image cleanup FAILED: $IMAGE_REPO:$IMAGE_TAG" >&2; rc=1; }
  fi
  rm -rf "$CTX" "$CTX.list"
  exit "$rc"
}
trap cleanup EXIT INT TERM

SUB="$("$AZ_WRAPPER" account show --query id -o tsv)"
[ "$SUB" = "$EXPECTED_SUB" ] || { echo "FATAL: subscription $SUB" >&2; exit 2; }

echo "== staging committed candidate $COMMIT"
git ls-files -z --cached --others --exclude-standard \
  | grep -zv -e '^tests/reports/' -e '/node_modules/' -e '^node_modules/' \
  > "$CTX.list"
rsync -a --from0 --files-from="$CTX.list" ./ "$CTX/"
( cd "$CTX" && tr '\0' '\n' < "$CTX.list" | while IFS= read -r f; do [ -f "$f" ] && shasum -a 256 "$f"; done ) > "$CTX/tools/remote-acr/.source5-manifest.txt"
printf '%s\n' "$COMMIT" > "$CTX/tools/remote-acr/.source5-commit"
cp "$CTX/tools/remote-acr/.source5-manifest.txt" "$OUT_DIR/source-manifest.txt"
MANIFEST_SHA="$(shasum -a 256 "$OUT_DIR/source-manifest.txt" | cut -d' ' -f1)"
LOCK_SHA="$(shasum -a 256 pnpm-lock.yaml | cut -d' ' -f1)"
du -sh "$CTX" | awk '{print "   context: "$1}'

LOGIN_SERVER="$("$AZ_WRAPPER" acr show -n "$ACR_NAME" -g "$ACR_RG" --query loginServer -o tsv)"
echo "== az acr build $IMAGE_REPO:$IMAGE_TAG"
PUSHED=1
set +e
"$AZ_WRAPPER" acr build -r "$ACR_NAME" -g "$ACR_RG" -t "$IMAGE_REPO:$IMAGE_TAG" \
  --build-arg AURA3D_NATIVE_ACCEPTANCE=0 -f tools/remote-acr/Dockerfile.playwright --timeout 1800 \
  "$CTX" > "$OUT_DIR/acr-build.log" 2>&1
BUILD_RC=$?
set -e
tail -15 "$OUT_DIR/acr-build.log"
[ "$BUILD_RC" = 0 ] || { echo "FATAL: build failed ($OUT_DIR/acr-build.log)" >&2; exit 3; }

run_stage() {
  set +e
  local stage="$1" log="$OUT_DIR/acr-run-$1.log"
  "$AZ_WRAPPER" acr run -r "$ACR_NAME" -g "$ACR_RG" -f tools/remote-acr/task.source5.yaml --timeout 1800 \
    --set "LOGIN_SERVER=$LOGIN_SERVER" --set "IMAGE=$IMAGE_REPO:$IMAGE_TAG" \
    --set "RUN_ID=$RUN_ID" --set "RELEASE_KIND=$RELEASE_KIND" --set "STAGE=$stage" \
    /dev/null > "$log" 2>&1
  local rc=$?
  awk '/::: SOURCE5_REPORT_BEGIN/{f=1;next}/::: SOURCE5_REPORT_END/{f=0}f' "$log" \
    | sed -E 's/^[0-9]{4}\/[0-9]{2}\/[0-9]{2} [0-9:]+ //' | tr -d '\r' | base64 -d > "$OUT_DIR/stage-$stage.json" 2>/dev/null || true
  echo "$rc" > "$OUT_DIR/stage-$stage.rc"
  echo "   stage $stage: acr rc=$rc"
}
echo "== stages: $STAGES"
for stage in $STAGES; do
  while [ "$(jobs -rp | wc -l | tr -d ' ')" -ge "$MAX_PARALLEL" ]; do sleep 5; done
  run_stage "$stage" &
done
wait

COMMIT="$COMMIT" MANIFEST_SHA="$MANIFEST_SHA" LOCK_SHA="$LOCK_SHA" OUT="$OUT_DIR" STAGES="$STAGES" node -e '
  const fs = require("fs");
  const out = process.env.OUT;
  const stages = process.env.STAGES.split(/\s+/).filter(Boolean);
  const commands = [], problems = [], plans = {};
  for (const s of stages) {
    let r = null; try { r = JSON.parse(fs.readFileSync(`${out}/stage-${s}.json`, "utf8")); } catch {}
    const rc = Number(fs.readFileSync(`${out}/stage-${s}.rc`, "utf8"));
    if (!r) { problems.push(`stage ${s}: report missing (acr rc=${rc})`); continue; }
    for (const c of r.commands) commands.push({ stage: s, ...c });
    if (r.candidatePlan) plans[s] = r.candidatePlan;
    if (r.generatedApiReference) fs.writeFileSync(`${out}/public-api.generated.md`, r.generatedApiReference.text);
  }
  const digestsOf = (p) => JSON.stringify((p.packages || p.archives || p.entries || []).map((e) => [e.name, e.version, e.sha256 || e.integrity || e.digest]));
  const planStages = Object.keys(plans);
  if (planStages.length > 1 && new Set(planStages.map((s) => digestsOf(plans[s]))).size !== 1)
    problems.push(`candidate archive digests differ between ${planStages.join(", ")}`);
  const report = {
    schema: "aura3d.source5-report/2",
    candidate: { commit: process.env.COMMIT, sourceManifestSha256: process.env.MANIFEST_SHA, lockfileSha256: process.env.LOCK_SHA },
    stages, commands,
    passed: commands.filter((c) => c.exitCode === 0).map((c) => c.id),
    failed: commands.filter((c) => c.exitCode !== 0).map((c) => c.id),
    problems,
    candidatePlan: plans["packed-a"] || plans["packed-b"] || null,
    browserAcceptance: "not-run"
  };
  fs.writeFileSync(`${out}/source-report.json`, JSON.stringify(report, null, 2) + "\n");
  for (const c of commands) console.log(`${c.exitCode === 0 ? "PASS" : "FAIL"} ${c.id} (${c.seconds}s)`);
  for (const p of problems) console.log(`PROBLEM ${p}`);
  console.log(`passed ${report.passed.length}, failed ${report.failed.length}, problems ${problems.length}`);
'
echo "   report: $OUT_DIR/source-report.json"
