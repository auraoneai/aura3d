#!/usr/bin/env bash
# Aura3D 5.0 acceptance on the 4.x ACR path (decision record item 1 + 4c,
# docs/prds/aura3d-native-code-complete.md; Phase B,
# docs/prds/aura3d-native-acceptance.md).
#
#   1. Refuses unless AURA3D_CODE_COMPLETE_GATE is a CODE_COMPLETE_GO record
#      bound to this exact clean HEAD and passes
#      tools/native-capability-gate/index.mjs --phase acceptance — before any
#      Azure call, staging or build.
#   2. Plans shards from tools/remote-acr/acceptance5-inventory.txt
#      (tools/remote-acr/acceptance5.mjs; Playwright --shard, ~900 s of
#      estimated tests per <= 1800 s ACR run, batches sized to one SAS window).
#   3. Stages the gate-enumerated candidate (as run.sh native mode), revalidates
#      the gate inside the staged context, builds ONE Dockerfile.playwright
#      image (the image build revalidates the gate again).
#   4. Mints one legacy container SAS (<= 120 min, rcwl, sas-transport.sh) and
#      runs the shards, <= 2 concurrent `az acr run --timeout 1800`; each run
#      revalidates the gate in task-run.sh before discovery. The deferred
#      evidence unit tests run last (acceptance5-evidence.sh).
#   5. Downloads artifacts and merges
#      tests/reports/native-5/<RUN_ID>/acceptance-report.json.
#
# Usage:
#   PLAN_ONLY=1 tools/remote-acr/run-acceptance5.sh           # print the shard plan, no gate, no Azure
#   RUN_ID=native-5-accept-001-b1 BATCH=1 tools/remote-acr/run-acceptance5.sh
#   MERGE_RUNS="<run-id> <run-id>" RUN_ID=<combined> tools/remote-acr/run-acceptance5.sh   # merge batch reports only
set -euo pipefail
if [ "${AURA3D_SOURCE_PROCESS_GUARD:-0}" = 1 ]; then
  echo "FATAL: acceptance launcher is forbidden within a source-phase process." >&2
  exit 2
fi
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

AZ_WRAPPER="${AZ_WRAPPER:-az-auraone-gurbaksh}"
EXPECTED_SUB='9b7da706-63ce-4740-8c03-3b77cbe1b7d0'
EXPECTED_TENANT='8aa8a205-1f60-42a0-a546-03e2bda76637'
ACR_NAME="${ACR_NAME:-picassostagingacr}"
ACR_RG="${ACR_RG:-SHARED-CI-RG}"
IMAGE_REPO="${IMAGE_REPO:-aura3d-acceptance5}"
RUN_ID="${RUN_ID:-native-5-accept-$(date -u +%Y%m%dT%H%M%SZ)}"
INVENTORY="${INVENTORY:-tools/remote-acr/acceptance5-inventory.txt}"
AURA3D_CODE_COMPLETE_GATE="${AURA3D_CODE_COMPLETE_GATE:-tests/reports/native-capabilities/code-complete-go.json}"
SAS_TTL_MINUTES="${SAS_TTL_MINUTES:-120}"
KEEP_IMAGE="${KEEP_IMAGE:-0}"
BATCH="${BATCH:-}"
MAX_PARALLEL=2
ACR_TIMEOUT=1800
START_MARGIN=120
[[ "$RUN_ID" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$ ]] || { echo 'FATAL: RUN_ID must be [a-zA-Z0-9_-], at most 48 characters' >&2; exit 2; }
[ -z "$BATCH" ] || [[ "$BATCH" =~ ^[1-9][0-9]?$ ]] || { echo 'FATAL: invalid BATCH' >&2; exit 2; }
[[ "$SAS_TTL_MINUTES" =~ ^[0-9]+$ ]] && [ "$SAS_TTL_MINUTES" -le 120 ] || { echo 'FATAL: SAS_TTL_MINUTES must be <= 120' >&2; exit 2; }
OUT_DIR="tests/reports/native-5/$RUN_ID"

if [ -n "${MERGE_RUNS:-}" ]; then
  ARGS=()
  for run in $MERGE_RUNS; do
    [[ "$run" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,47}$ ]] && [ -f "tests/reports/native-5/$run/plan.json" ] || { echo "FATAL: no plan for run $run" >&2; exit 2; }
    ARGS+=(--run-dir "tests/reports/native-5/$run")
  done
  MERGE_RC=0
  node tools/remote-acr/acceptance5.mjs merge --out "$OUT_DIR/acceptance-report.json" "${ARGS[@]}" || MERGE_RC=$?
  echo "   report: $OUT_DIR/acceptance-report.json"
  exit "$MERGE_RC"
fi

PLAN_TMP="$(mktemp /tmp/aura3d-acceptance5-plan.XXXXXX)"
CTX=""; INPUTS_JSON=""; INPUTS_LIST=""; STAGING_RECORD=""; PUSHED=0; IMAGE_TAG=""
# shellcheck source=tools/remote-acr/sas-transport.sh
. tools/remote-acr/sas-transport.sh
cleanup() {
  local rc=$?
  trap - EXIT INT TERM
  # Stop any shard still waiting locally; ACR enforces its own --timeout.
  local pids; pids="$(jobs -rp)"; [ -z "$pids" ] || kill $pids 2>/dev/null || true
  sas_transport_close
  if [ "$PUSHED" = 1 ] && [ "$KEEP_IMAGE" != 1 ]; then
    "$AZ_WRAPPER" acr repository delete -n "$ACR_NAME" --image "$IMAGE_REPO:$IMAGE_TAG" --yes -o none \
      || { echo "FATAL: image cleanup could not be verified: $IMAGE_REPO:$IMAGE_TAG" >&2; rc=1; }
  fi
  rm -rf "$PLAN_TMP" ${CTX:+"$CTX"} ${INPUTS_JSON:+"$INPUTS_JSON"} ${INPUTS_LIST:+"$INPUTS_LIST"} ${STAGING_RECORD:+"$STAGING_RECORD"}
  exit "$rc"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# ---- plan (pure; no gate or Azure needed) ------------------------------------
node tools/remote-acr/acceptance5.mjs plan --inventory "$INVENTORY" --run-id "$RUN_ID" ${BATCH:+--batch "$BATCH"} \
  --sas-ttl-seconds "$((SAS_TTL_MINUTES * 60))" --out "$PLAN_TMP"
if [ "${PLAN_ONLY:-0}" = 1 ]; then exit 0; fi
BATCH_COUNT="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).batchCount' "$PLAN_TMP")"
if [ -z "$BATCH" ] && [ "$BATCH_COUNT" -gt 1 ]; then
  echo "FATAL: the plan needs $BATCH_COUNT batches to fit one ${SAS_TTL_MINUTES}-minute SAS; run each with BATCH=1..$BATCH_COUNT and a distinct RUN_ID, then MERGE_RUNS." >&2
  exit 2
fi

# ---- 1. gate refusal before any provider process -----------------------------
COMMIT="$(git rev-parse HEAD)"
TRACKED_CLEAN=1
[ -z "$(git status --porcelain --untracked-files=no -- . ':!AGENTS.md')" ] || TRACKED_CLEAN=0
BINDING="$(node tools/remote-acr/acceptance5.mjs gate-binding --gate "$AURA3D_CODE_COMPLETE_GATE" --head "$COMMIT" --tracked-clean "$TRACKED_CLEAN")" \
  || { echo "FATAL: acceptance refused; no Azure work was started." >&2; exit 2; }
node tools/native-capability-gate/index.mjs --phase acceptance --gate "$AURA3D_CODE_COMPLETE_GATE" \
  || { echo "FATAL: code-complete gate failed validation; no Azure work was started." >&2; exit 2; }
[ ! -e "$OUT_DIR" ] || { echo "FATAL: $OUT_DIR exists; use a new RUN_ID" >&2; exit 2; }
mkdir -p "$OUT_DIR"
cp "$PLAN_TMP" "$OUT_DIR/plan.json"
PLAN_JSON="$REPO_ROOT/$OUT_DIR/plan.json"
printf '%s\n' "$BINDING" > "$OUT_DIR/gate-binding.json"
bind() { node -p "JSON.parse(process.argv[1])[process.argv[2]]" "$BINDING" "$1"; }
RELEASE_PLAN="$(bind candidatePlan)"
CONSUMER_SOURCE_REPORT="$(bind consumerSourceReport)"
MATRIX_SOURCE_REPORT="$(bind matrixSourceReport)"
EXAMPLES_SOURCE_REPORT="$(bind examplesSourceReport)"
GLOBAL_TIMEOUT_MS="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).limits.playwrightGlobalTimeoutMs' "$PLAN_JSON")"
# Evidence unit tests join the staging scan so the asset trees they read are kept.
SCAN_FILES="$(node -p 'const p=JSON.parse(require("fs").readFileSync(process.argv[1],"utf8"));[...new Set([...p.shards.flatMap(s=>s.specs), ...(p.evidence?.files ?? [])])].join(" ")' "$PLAN_JSON")"
EVIDENCE_RUN="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).evidence?.runId ?? ""' "$PLAN_JSON")"

# ---- 2. stage the gate-enumerated candidate (run.sh native browser mode) -----
CTX="$(mktemp -d /tmp/aura3d-acceptance5-ctx.XXXXXX)"
INPUTS_JSON="$(mktemp /tmp/aura3d-acceptance5-inputs.XXXXXX)"
INPUTS_LIST="$(mktemp /tmp/aura3d-acceptance5-list.XXXXXX)"
STAGING_RECORD="$(mktemp /tmp/aura3d-acceptance5-staging.XXXXXX)"
node tools/native-capability-gate/index.mjs --phase acceptance --gate "$AURA3D_CODE_COMPLETE_GATE" --list-inputs > "$INPUTS_JSON"
node tools/remote-acr/acceptance5.mjs safe-inputs "$INPUTS_JSON" "$AURA3D_CODE_COMPLETE_GATE" > "$INPUTS_LIST"
# shellcheck disable=SC2086 # plan paths are validated exact repository paths
node tools/remote-acr/acceptance-staging.mjs select "$INPUTS_LIST" "$AURA3D_CODE_COMPLETE_GATE" "$STAGING_RECORD" $SCAN_FILES || exit 2
rsync -a --from0 --files-from="$INPUTS_LIST" ./ "$CTX/"
cp "$STAGING_RECORD" "$CTX/.aura3d-acceptance-staging.json"
# shellcheck disable=SC2086
node tools/remote-acr/acceptance-staging.mjs verify-context "$CTX" "$INPUTS_LIST" $SCAN_FILES || exit 2
(cd "$CTX" && node tools/native-capability-gate/index.mjs --phase acceptance --gate "$AURA3D_CODE_COMPLETE_GATE") \
  || { echo "FATAL: staged context failed gate validation" >&2; exit 2; }
du -sh "$CTX" | awk '{print "   context    : "$1}'

# ---- 3. Azure context, one image build ---------------------------------------
SUB="$("$AZ_WRAPPER" account show --query id -o tsv 2>/dev/null || true)"
[ "$SUB" = "$EXPECTED_SUB" ] || { echo "FATAL: ${AZ_WRAPPER} subscription is '${SUB:-<none>}'" >&2; exit 2; }
[ "$("$AZ_WRAPPER" account show --query tenantId -o tsv)" = "$EXPECTED_TENANT" ] || { echo "FATAL: unexpected Azure tenant" >&2; exit 2; }
LOGIN_SERVER="$("$AZ_WRAPPER" acr show -n "$ACR_NAME" -g "$ACR_RG" --query loginServer -o tsv)"
IMAGE_TAG="run-${RUN_ID}-$(node -e 'process.stdout.write(require("node:crypto").randomUUID().slice(0, 8))')"
printf '%s\n' "$IMAGE_REPO:$IMAGE_TAG" > "$OUT_DIR/image"
echo "== az acr build $IMAGE_REPO:$IMAGE_TAG (candidate $COMMIT)"
PUSHED=1
set +e
"$AZ_WRAPPER" acr build -r "$ACR_NAME" -g "$ACR_RG" -t "$IMAGE_REPO:$IMAGE_TAG" \
  --build-arg AURA3D_NATIVE_ACCEPTANCE=1 --build-arg "AURA3D_CODE_COMPLETE_GATE=$AURA3D_CODE_COMPLETE_GATE" \
  -f tools/remote-acr/Dockerfile.playwright --timeout "$ACR_TIMEOUT" "$CTX" > "$OUT_DIR/acr-build.log" 2>&1
BUILD_RC=$?
set -e
tail -15 "$OUT_DIR/acr-build.log"
[ "$BUILD_RC" = 0 ] || { echo "FATAL: build failed ($OUT_DIR/acr-build.log)" >&2; exit 3; }
rm -rf "$CTX"; CTX=""

# ---- 4. one SAS, shards (<= 2 concurrent), evidence last ---------------------
sas_transport_open "$SAS_TTL_MINUTES" tools/remote-acr/task.playwright.yaml tools/remote-acr/task.acceptance5-evidence.yaml

run_shard() {
  set +e
  local id="$1" dir="$OUT_DIR/shards/$1" fields
  fields="$(node -e '
    const s = JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).shards.find(x => x.id === process.argv[2]);
    process.stdout.write([s.runId, s.project, s.specs.join(","), s.shard ?? "none", s.config ?? "none"].join("\t"));
  ' "$PLAN_JSON" "$id")"
  local shard_run project specs_csv shard config
  IFS=$'\t' read -r shard_run project specs_csv shard config <<< "$fields"
  "$AZ_WRAPPER" acr run -r "$ACR_NAME" -g "$ACR_RG" -f task.playwright.yaml --values "$A3D_SAS_VALUES_FILE" --timeout "$ACR_TIMEOUT" \
    --set "LOGIN_SERVER=$LOGIN_SERVER" --set "IMAGE=$IMAGE_REPO:$IMAGE_TAG" --set "RUN_ID=$shard_run" \
    --set "SPECS_CSV=$specs_csv" --set "REPORTER=line,json" --set "BROWSER_PROJECT=$project" \
    --set "NATIVE_ACCEPTANCE=1" --set "ACCEPTANCE_KIND=browser" --set "HISTORICAL_INPUTS=none" \
    --set "EXTERNAL_CODEC_LOCK=none" --set "EXTERNAL_CODEC_NPM_INPUTS=none" \
    --set "CODE_COMPLETE_GATE=$AURA3D_CODE_COMPLETE_GATE" --set "RELEASE_PLAN=$RELEASE_PLAN" \
    --set "CONSUMER_SOURCE_REPORT=$CONSUMER_SOURCE_REPORT" --set "MATRIX_SOURCE_REPORT=$MATRIX_SOURCE_REPORT" \
    --set "EXAMPLES_SOURCE_REPORT=$EXAMPLES_SOURCE_REPORT" \
    --set "NETWORK_REPORT=tests/reports/native-acceptance/$shard_run/network.json" \
    --set "MEASUREMENT_REPORT=tests/reports/native-performance/$shard_run/manifest.json" \
    --set "PERF_DEVICE_B64=none" --set "PERF_DRIVER_B64=none" \
    --set "ARTIFACTS_BLOB_URL=none" --set "ARTIFACTS_CLIENT_ID=none" --set "ARTIFACT_TRANSPORT=legacy-sas" \
    --set "PW_SHARD=$shard" --set "PW_GLOBAL_TIMEOUT_MS=$GLOBAL_TIMEOUT_MS" --set "PLAYWRIGHT_CONFIG=$config" \
    "$A3D_SAS_DIR" > "$dir/acr-run.log" 2>&1
  echo "$?" > "$dir/rc"
  sas_redact_file "$dir/acr-run.log"
  sas_download_prefix "$shard_run" "$dir/artifacts" > "$dir/download.log" 2>&1 || echo "download failed" >> "$dir/download.log"
  echo "   shard $id: acr rc=$(cat "$dir/rc") $(grep -o 'PLAYWRIGHT_EXIT=[0-9a-z-]*' "$dir/acr-run.log" | tail -1)"
}

run_evidence() {
  set +e
  local dir="$OUT_DIR/evidence" prefixes
  prefixes="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).shards.map(s=>s.runId).join(",") || "none"' "$PLAN_JSON")"
  "$AZ_WRAPPER" acr run -r "$ACR_NAME" -g "$ACR_RG" -f task.acceptance5-evidence.yaml --values "$A3D_SAS_VALUES_FILE" --timeout "$ACR_TIMEOUT" \
    --set "LOGIN_SERVER=$LOGIN_SERVER" --set "IMAGE=$IMAGE_REPO:$IMAGE_TAG" --set "RUN_ID=$EVIDENCE_RUN" \
    --set "CODE_COMPLETE_GATE=$AURA3D_CODE_COMPLETE_GATE" --set "EVIDENCE_PREFIXES=$prefixes" \
    "$A3D_SAS_DIR" > "$dir/acr-run.log" 2>&1
  echo "$?" > "$dir/rc"
  sas_redact_file "$dir/acr-run.log"
  echo "   evidence: acr rc=$(cat "$dir/rc") $(grep -o 'EVIDENCE_EXIT=[0-9]*' "$dir/acr-run.log" | tail -1)"
}

wait_for_slot() { while [ "$(jobs -rp | wc -l | tr -d ' ')" -ge "$MAX_PARALLEL" ]; do sleep 10; done; }
has_window() { [ "$(sas_seconds_left)" -ge $((ACR_TIMEOUT + START_MARGIN)) ]; }

SHARD_IDS="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1],"utf8")).shards.map(s=>s.id).join(" ")' "$PLAN_JSON")"
echo "== shards: ${SHARD_IDS:-none} (max $MAX_PARALLEL concurrent)"
for id in $SHARD_IDS; do
  mkdir -p "$OUT_DIR/shards/$id"
  wait_for_slot
  if ! has_window; then echo "SAS window too short to start a ${ACR_TIMEOUT}s run" > "$OUT_DIR/shards/$id/not-started"; echo "   shard $id: not started (SAS window)"; continue; fi
  run_shard "$id" &
  sleep 5
done
wait
if [ -n "$EVIDENCE_RUN" ]; then
  mkdir -p "$OUT_DIR/evidence"
  if has_window; then run_evidence; else echo "   evidence: not started (SAS window)"; fi
fi
sas_transport_close

# ---- 5. merged report --------------------------------------------------------
MERGE_RC=0
node tools/remote-acr/acceptance5.mjs merge --out "$OUT_DIR/acceptance-report.json" --run-dir "$OUT_DIR" || MERGE_RC=$?
echo "   report: $OUT_DIR/acceptance-report.json"
# 0 = every planned cell passed; 1 = failed/incomplete (see report); 2 = merge error.
exit "$MERGE_RC"
