#!/usr/bin/env bash
# Cloud replacement for the local headless-Chrome census/capture scripts.
# Runs Chromium on serverless Azure ACR Tasks (no VMs, no standing infra, no local browser).
#
#   tools/remote-acr/capture.sh --base https://<host> --slugs <file|a,b,c> --out <dir> \
#       [--backend webgpu|webgl2|default] [--wait 14] [--ready-timeout 90] [--shards N] [--script <json>]
#       [--query "at=1200&autostart=1"] [--chrome-args "<flags>"] [--probe] [--cleanup-image] [--task-id ID]
#
# Output in --out: <slug>.json + <slug>.png (the census.mjs fields, plus .capture and
# .script_run), optional <slug>.after.png / .solid-*.png, summary.json, logs/shard-N.log.
# See tools/remote-acr/README.md ("Remote capture") for the script format and limits.
#
# Env: AZ_WRAPPER (az-auraone-gurbaksh) ACR_NAME (picassostagingacr) IMAGE_REPO (aura3d-capture)
#      MAX_CONCURRENT_RUNS (10) SHARDS cap is 6.
set -euo pipefail
if [ "${AURA3D_SOURCE_PROCESS_GUARD:-0}" = 1 ]; then echo "FATAL: browser runner is forbidden within a source-phase process." >&2; exit 2; fi
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
AZ_WRAPPER="${AZ_WRAPPER:-az-auraone-gurbaksh}"
EXPECTED_SUB="${EXPECTED_SUB:-9b7da706-63ce-4740-8c03-3b77cbe1b7d0}"
ACR_NAME="${ACR_NAME:-picassostagingacr}"
IMAGE_REPO="${IMAGE_REPO:-aura3d-capture}"
MAX_CONCURRENT_RUNS="${MAX_CONCURRENT_RUNS:-10}"
COST_GUARD="${COST_GUARD:-/Users/gurbakshchahal/.local/bin/auraone-cost-guard}"
LEDGER="${LEDGER:-/Users/gurbakshchahal/.local/state/auraone-cloud-ledger/ephemeral-resources.jsonl}"

BASE="" SLUGS="" OUT="" BACKEND="default" WAIT=14 SHARDS=1 READY_TIMEOUT=90 SCRIPT="" CHROME_ARGS="" PROBE=0 CLEANUP_IMAGE=0 QUERY=""
TASK_ID="${TASK_ID:-aura3d-remote-capture-$(date -u +%Y%m%d)}"
usage() { sed -n 2,12p "${BASH_SOURCE[0]}" | sed 's/^# \{0,1\}//'; exit 2; }
while [ $# -gt 0 ]; do
  case "$1" in
    --base) BASE="$2"; shift 2;; --slugs) SLUGS="$2"; shift 2;; --out) OUT="$2"; shift 2;;
    --backend) BACKEND="$2"; shift 2;; --wait) WAIT="$2"; shift 2;; --ready-timeout) READY_TIMEOUT="$2"; shift 2;; --shards) SHARDS="$2"; shift 2;;
    --script) SCRIPT="$2"; shift 2;; --chrome-args) CHROME_ARGS="$2"; shift 2;; --task-id) TASK_ID="$2"; shift 2;;
    --query) QUERY="$2"; shift 2;; --probe) PROBE=1; shift;; --cleanup-image) CLEANUP_IMAGE=1; shift;; -h|--help) usage;; *) echo "unknown arg: $1" >&2; usage;;
  esac
done
[ -n "$BASE" ] && [ -n "$OUT" ] || usage
[ "$PROBE" = 1 ] || [ -n "$SLUGS" ] || usage
case "$BASE" in https://*) ;; *) echo "FATAL: --base must be an https:// origin" >&2; exit 2;; esac
case "$BACKEND" in default|webgpu|webgl2) ;; *) echo "FATAL: --backend must be webgpu|webgl2|default" >&2; exit 2;; esac
case "$WAIT" in ''|*[!0-9.]*) echo "FATAL: --wait must be seconds" >&2; exit 2;; esac
case "$SHARDS" in ''|*[!0-9]*) echo "FATAL: --shards must be an integer" >&2; exit 2;; esac
[ "$SHARDS" -ge 1 ] && [ "$SHARDS" -le 6 ] || { echo "FATAL: --shards must be 1..6" >&2; exit 2; }
[ -z "$SCRIPT" ] || [ -f "$SCRIPT" ] || { echo "FATAL: script file not found: $SCRIPT" >&2; exit 2; }

mkdir -p "$OUT/logs"
OUT="$(cd "$OUT" && pwd)"

# ---- slugs ------------------------------------------------------------------
if [ -f "$SLUGS" ]; then SLUG_LIST="$(grep -v '^[[:space:]]*\(#\|$\)' "$SLUGS" | tr -s ' \t\n' '\n\n\n' | grep -v '^$')"
else SLUG_LIST="$(printf '%s' "$SLUGS" | tr ',' '\n')"; fi
if [ "$PROBE" = 1 ] && [ -z "$SLUG_LIST" ]; then SLUG_LIST="probe"; fi
if printf '%s\n' "$SLUG_LIST" | grep -qv '^[a-zA-Z0-9._-]*$'; then echo "FATAL: slug has unsafe characters" >&2; exit 2; fi
NSLUGS="$(printf '%s\n' "$SLUG_LIST" | grep -c .)"
[ "$SHARDS" -le "$NSLUGS" ] || SHARDS="$NSLUGS"

# per-shard budget: each slug may take wait + ready-timeout + script (~60s); the ACR step is capped at 1500 s
PER_SLUG=$(node -e 'process.stdout.write(String(Math.ceil(Number(process.argv[1])+Number(process.argv[2])+(process.argv[3]?60:10))))' "$WAIT" "$READY_TIMEOUT" "$SCRIPT")
[ $(( PER_SLUG * ((NSLUGS + SHARDS - 1) / SHARDS) )) -le 1450 ] || { echo "WARN: worst case ${PER_SLUG}s/slug x $(( (NSLUGS + SHARDS - 1) / SHARDS )) slugs/shard may exceed the 1500 s ACR cap; raise --shards or lower --ready-timeout" >&2; }

# ---- Azure guard (never bare az, never login) ---------------------------------
SUB="$("$AZ_WRAPPER" account show --query id -o tsv 2>/dev/null || true)"
[ "$SUB" = "$EXPECTED_SUB" ] || { echo "FATAL: ${AZ_WRAPPER} account is '${SUB:-<none>}', expected ${EXPECTED_SUB}." >&2; exit 2; }
ACR_JSON="$("$AZ_WRAPPER" acr show -n "$ACR_NAME" --query '{rg:resourceGroup,ls:loginServer,loc:location}' -o json)"
ACR_RG="$(printf '%s' "$ACR_JSON" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).rg)')"
LOGIN_SERVER="$(printf '%s' "$ACR_JSON" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).ls)')"
ACR_LOC="$(printf '%s' "$ACR_JSON" | node -e 'process.stdout.write(JSON.parse(require("fs").readFileSync(0,"utf8")).loc)')"

# ---- cleanup trap: cancel any run this invocation still has in flight -----------
PIDS=() RUNIDS_FILE="$OUT/logs/run-ids.txt"; : > "$RUNIDS_FILE"
FINISHED=0
cleanup() {
  trap - EXIT INT TERM
  if [ "$FINISHED" != 1 ]; then
    for pid in "${PIDS[@]:-}"; do [ -n "$pid" ] && kill "$pid" 2>/dev/null || true; done
    while read -r rid; do
      [ -n "$rid" ] || continue
      st="$("$AZ_WRAPPER" acr task show-run -r "$ACR_NAME" --run-id "$rid" --query status -o tsv 2>/dev/null || true)"
      case "$st" in Running|Queued|Started) "$AZ_WRAPPER" acr task cancel-run -r "$ACR_NAME" --run-id "$rid" >/dev/null 2>&1 && echo "cancelled ACR run $rid" >&2 || true;; esac
    done < "$RUNIDS_FILE"
  fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# ---- concurrency guard --------------------------------------------------------
ACTIVE="$("$AZ_WRAPPER" acr task list-runs -r "$ACR_NAME" --top 40 --query "length([?status=='Running' || status=='Queued' || status=='Started'])" -o tsv 2>/dev/null || echo 0)"
if [ $((ACTIVE + SHARDS)) -gt "$MAX_CONCURRENT_RUNS" ]; then
  echo "FATAL: ${ACTIVE} ACR runs active + ${SHARDS} shards > ${MAX_CONCURRENT_RUNS}. Lower --shards or wait." >&2; exit 2
fi

# ---- cost/lifecycle contract (serverless ACR task, tier 2, $0 idle) ---------------------
RUN_RES="acr-capture-runs/${TASK_ID}-$(date -u +%H%M%S)"
"$COST_GUARD" cloud-preflight --resource-id "$RUN_RES" --task-id "$TASK_ID" --project aura3d --repo aura3d \
  --agent-session claude-code-remotecap --purpose remote-capture-census --provider azure --account "az-auraone-gurbaksh:${SUB}" \
  --region "$ACR_LOC" --resource-type acr-task --sku acr-task-standard --vcpus 2 --memory-gib 4 --ttl-minutes 40 \
  --estimated-hourly-usd 0.36 --estimated-run-usd 0.30 --allow-parallel-shard \
  --cleanup-command "${AZ_WRAPPER} acr task cancel-run -r ${ACR_NAME} --run-id <id> (runs auto-exit; --timeout 1500)" \
  --verification-command "${AZ_WRAPPER} acr task list-runs -r ${ACR_NAME} --top 20 --query \"[?status=='Running']\" -o tsv" >> "$OUT/logs/cost-guard.log" 2>&1 \
  || { echo "FATAL: auraone-cost-guard cloud-preflight refused (see $OUT/logs/cost-guard.log)" >&2; tail -8 "$OUT/logs/cost-guard.log" >&2; exit 2; }

# ---- image: cached by content tag, 2-file build context ---------------------------
HASH="$(cat "$HERE/Dockerfile.capture" "$HERE/capture-runner.mjs" | shasum -a 256 | cut -c1-10)"
IMAGE_TAG="pw1591-${HASH}"
IMAGE="${IMAGE_REPO}:${IMAGE_TAG}"
if "$AZ_WRAPPER" acr repository show-tags -n "$ACR_NAME" --repository "$IMAGE_REPO" -o tsv 2>/dev/null | grep -qx "$IMAGE_TAG"; then
  echo "== image cached: ${IMAGE}"
else
  CTX="$(mktemp -d "${TMPDIR:-/tmp}/a3d-capture-ctx.XXXXXX")"
  cp "$HERE/Dockerfile.capture" "$HERE/capture-runner.mjs" "$CTX/"
  echo "== az acr build ${IMAGE} (context $(du -sk "$CTX" | cut -f1) KB)"
  T0=$(date +%s)
  (cd "$CTX" && "$AZ_WRAPPER" acr build -r "$ACR_NAME" -t "$IMAGE" -f Dockerfile.capture --timeout 1800 .) > "$OUT/logs/acr-build.log" 2>&1 \
    || { echo "FATAL: az acr build failed; see $OUT/logs/acr-build.log" >&2; tail -20 "$OUT/logs/acr-build.log" >&2; rm -rf "$CTX"; exit 1; }
  rm -rf "$CTX"
  echo "   built in $(( $(date +%s) - T0 ))s"
  NOW="$(date -u +%Y-%m-%dT%H:%M:%SZ)"; EXP="$(date -u -v+24H +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -d '+24 hours' +%Y-%m-%dT%H:%M:%SZ)"
  node -e '
    const [rid,sub,loc,task,created,exp,imgc,imgv]=process.argv.slice(1);
    process.stdout.write(JSON.stringify({resource_id:rid,provider:"azure",account_or_subscription:"az-auraone-gurbaksh:"+sub,region:loc,resource_type:"acr-image-tag",parent_task_id:task,agent_session:"claude-code-remotecap",created_at:created,expires_at:exp,estimated_hourly_cost:0,cleanup_command:imgc,verification_command:imgv,status:"active",notes:"cached capture image (tools/remote-acr/capture.sh); delete with --cleanup-image"})+"\n");
  ' "${ACR_NAME}/${IMAGE}" "$SUB" "$ACR_LOC" "$TASK_ID" "$NOW" "$EXP" \
    "${AZ_WRAPPER} acr repository delete -n ${ACR_NAME} --image ${IMAGE} --yes" \
    "${AZ_WRAPPER} acr repository show-tags -n ${ACR_NAME} --repository ${IMAGE_REPO} -o tsv" >> "$LEDGER" 2>/dev/null || true
fi

# ---- shard + launch ---------------------------------------------------------------
SCRIPT_JSON=null; [ -z "$SCRIPT" ] || SCRIPT_JSON="$(cat "$SCRIPT")"
BACKEND_ARG="$BACKEND"
echo "== capture: ${NSLUGS} slug(s), ${SHARDS} shard(s), backend=${BACKEND}, wait=${WAIT}s, base=${BASE}"
T_START=$(date +%s)
declare -a SHARD_PIDS=()
for ((i = 0; i < SHARDS; i++)); do
  CFG_B64="$(printf '%s\n' "$SLUG_LIST" | awk -v n="$SHARDS" -v i="$i" '(NR-1)%n==i' | \
    BASE="$BASE" QUERY="$QUERY" BACKEND="$BACKEND_ARG" WAIT="$WAIT" READY_TIMEOUT="$READY_TIMEOUT" SHARD="$i" SCRIPT_JSON="$SCRIPT_JSON" CHROME_ARGS="$CHROME_ARGS" PROBE="$PROBE" \
    node -e '
      const slugs = require("fs").readFileSync(0, "utf8").split("\n").filter(Boolean);
      const e = process.env;
      const cfg = { base: e.BASE, slugs, backend: e.BACKEND, wait: Number(e.WAIT), readyTimeout: Number(e.READY_TIMEOUT), shard: e.SHARD, script: JSON.parse(e.SCRIPT_JSON),
        query: e.QUERY, chromeArgs: e.CHROME_ARGS ? e.CHROME_ARGS.split(/\s+/).filter(Boolean) : [], mode: e.PROBE === "1" ? "probe" : "capture" };
      process.stdout.write(Buffer.from(JSON.stringify(cfg)).toString("base64url"));')"
  (
    "$AZ_WRAPPER" acr run -r "$ACR_NAME" -f "$HERE/task.capture.yaml" --timeout 1500 \
      --set "LOGIN_SERVER=${LOGIN_SERVER}" --set "IMAGE=${IMAGE}" --set "CONFIG_B64=${CFG_B64}" /dev/null \
      > "$OUT/logs/shard-${i}.log" 2>&1
    echo $? > "$OUT/logs/shard-${i}.rc"
  ) &
  SHARD_PIDS+=("$!"); PIDS+=("$!")
done

# collect run ids as they appear (for cancel-on-exit and the report)
for _ in $(seq 1 60); do
  n=0; for ((i = 0; i < SHARDS; i++)); do grep -qE 'Queued a run with ID' "$OUT/logs/shard-${i}.log" 2>/dev/null && n=$((n+1)); done
  [ "$n" -ge "$SHARDS" ] && break; sleep 2
done
for ((i = 0; i < SHARDS; i++)); do
  rid="$(grep -oE 'Queued a run with ID: [a-z0-9]+' "$OUT/logs/shard-${i}.log" 2>/dev/null | head -1 | awk '{print $NF}')"
  [ -z "$rid" ] || { echo "$rid" >> "$RUNIDS_FILE"; echo "   shard ${i}: run ${rid}"; }
done
for pid in "${SHARD_PIDS[@]}"; do wait "$pid" || true; done
FINISHED=1
"$COST_GUARD" ledger-update --resource-id "$RUN_RES" --status deleted --cleanup-verified --notes "serverless ACR runs exited; no compute remains" >> "$OUT/logs/cost-guard.log" 2>&1 || true
DUR=$(( $(date +%s) - T_START ))

# ---- merge -----------------------------------------------------------------------
RC=0
for ((i = 0; i < SHARDS; i++)); do
  src="$OUT/logs/shard-${i}.log"
  [ "$(cat "$OUT/logs/shard-${i}.rc" 2>/dev/null || echo 1)" = 0 ] || { echo "WARN: shard ${i} ACR run failed (see $src)" >&2; RC=1; }
  node "$HERE/capture-runner.mjs" --collect "$src" "$OUT" || RC=1
done
if [ "$PROBE" = 1 ]; then echo "probe result: $OUT/probe-*.json"; exit "$RC"; fi
OUT="$OUT" SLUG_LIST="$SLUG_LIST" DUR="$DUR" SHARDS="$SHARDS" IMAGE="$IMAGE" BACKEND="$BACKEND" node -e '
  const fs = require("fs"); const e = process.env;
  const rows = []; let bad = 0;
  for (const slug of e.SLUG_LIST.split("\n").filter(Boolean)) {
    let r; try { r = JSON.parse(fs.readFileSync(`${e.OUT}/${slug}.json`, "utf8")); } catch { rows.push({ slug, pass: false, why: "missing" }); bad++; continue; }
    // AURA_READY_STALLED is an engine hint that software GL trips (slow first frame), not a failure.
    const hard = (r.non404_errors_final ?? r.non404_errors ?? []).filter((x) => !/AURA_READY_STALLED \(hint/.test(x));
    const errs = hard.length;
    const why = [];
    if (r.capture_error) why.push("capture_error");
    if (r.mount_failed) why.push("mount_failed");
    if (r.safety_black_frame) why.push("safety_black_frame");
    if (r.failed_to_start_visible) why.push("failed_to_start_visible");
    if (!(r.canvases >= 1)) why.push("no_canvas");
    if (r.ready !== "true") why.push("not_ready");
    if (errs) why.push(`errors=${errs}`);
    if (r.reload_suspected) why.push("reload_suspected");
    const row = { slug, pass: why.length === 0, why: why.join(","), canvases: r.canvases, ready: r.ready, errors: errs, codes: r.codes, gpu: r.gpu, navs: r.frame_navigated };
    if (r.script_run) row.solid = r.script_run.solid_frame_count === undefined ? "script_error" : `${r.script_run.solid_frame_count}/${r.script_run.samples_total}`;
    rows.push(row); if (!row.pass) bad++;
  }
  fs.writeFileSync(`${e.OUT}/summary.json`, JSON.stringify({ image: e.IMAGE, backend: e.BACKEND, shards: Number(e.SHARDS), duration_s: Number(e.DUR), failing: bad, rows }, null, 1));
  for (const r of rows) console.log(`${r.pass ? "PASS" : "FAIL"} ${r.slug}${r.why ? "  " + r.why : ""}${r.solid ? "  solid=" + r.solid : ""}`);
  console.log(`-- ${rows.length - bad}/${rows.length} pass, ${bad} fail, wall ${e.DUR}s, summary: ${e.OUT}/summary.json`);
  process.exit(bad ? 1 : 0);
' || RC=1

if [ "$CLEANUP_IMAGE" = 1 ]; then
  "$AZ_WRAPPER" acr repository delete -n "$ACR_NAME" --image "$IMAGE" --yes -o none && echo "deleted image ${IMAGE}"
  "$COST_GUARD" ledger-update --resource-id "${ACR_NAME}/${IMAGE}" --status deleted --cleanup-verified --notes "capture.sh --cleanup-image" >/dev/null 2>&1 || true
fi
exit "$RC"
