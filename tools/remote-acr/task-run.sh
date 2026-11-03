#!/usr/bin/env bash
# In-image browser execution. Native acceptance validates the complete frozen
# candidate before discovery or any browser/display process starts. Legacy
# browser jobs keep their established selectors and optional headed mode.
set -euo pipefail
if [ "${AURA3D_SOURCE_PROCESS_GUARD:-0}" = 1 ]; then
  echo "FATAL: browser runner is forbidden within a source-phase process." >&2
  exit 2
fi
cd /repo

# Artifact transport. A legacy SAS (5.0 acceptance without an identity task)
# is kept in an unexported variable so no test, browser or helper process sees
# it; only upload-artifacts.mjs receives it (artifact_upload below).
A3D_ARTIFACT_SAS="${AURA3D_ARTIFACTS_SAS:-}"
unset AURA3D_ARTIFACTS_SAS
case "$A3D_ARTIFACT_SAS" in b64:*) A3D_ARTIFACT_SAS="$(printf '%s' "${A3D_ARTIFACT_SAS#b64:}" | base64 -d)";; esac  # ACR passes docker args via /bin/sh; the SAS's '&' must not appear raw
[ "$A3D_ARTIFACT_SAS" != none ] || A3D_ARTIFACT_SAS=""
AURA3D_ARTIFACT_TRANSPORT="${AURA3D_ARTIFACT_TRANSPORT:-managed-identity}"
[ "$AURA3D_ARTIFACT_TRANSPORT" != none ] || AURA3D_ARTIFACT_TRANSPORT=managed-identity
case "$AURA3D_ARTIFACT_TRANSPORT" in managed-identity|legacy-sas) ;; *) echo 'FATAL: invalid artifact transport' >&2; exit 2;; esac
artifact_upload() {
  if [ -n "$A3D_ARTIFACT_SAS" ]; then
    AURA3D_ARTIFACTS_SAS="$A3D_ARTIFACT_SAS" node tools/remote-acr/upload-artifacts.mjs "$@"
  else
    node tools/remote-acr/upload-artifacts.mjs "$@"
  fi
}

AURA3D_ACCEPTANCE_KIND="${AURA3D_ACCEPTANCE_KIND:-browser}"
case "$AURA3D_ACCEPTANCE_KIND" in browser|historical-evidence|historical-replay|external-codec-fixtures) ;; *) echo 'FATAL: invalid acceptance kind' >&2; exit 2;; esac
if [ "$AURA3D_ACCEPTANCE_KIND" != browser ]; then
  # This fixed, non-browser inventory is separately gated and never selects
  # Playwright, a display, arbitrary tests or replacement measurements.
  [ "${AURA3D_NATIVE_ACCEPTANCE:-0}" = 1 ] || { echo 'FATAL: historical acceptance requires native mode' >&2; exit 2; }
  case "${AURA3D_RUN_ID:-}" in ''|*[!a-zA-Z0-9_-]*) echo 'FATAL: invalid historical run ID' >&2; exit 2;; esac
  [ "${#AURA3D_RUN_ID}" -le 80 ] || { echo 'FATAL: historical run ID too long' >&2; exit 2; }
  case "${AURA3D_CODE_COMPLETE_GATE:-}" in ''|none|/*|*'..'*|*[!a-zA-Z0-9_./-]*) echo 'FATAL: invalid code-complete gate' >&2; exit 2;; esac
  [ "${AURA3D_BROWSER_PROJECT:-none}" = none ] && [ "${AURA3D_HEADED_XVFB:-0}" != 1 ] || { echo 'FATAL: historical mode does not start a browser' >&2; exit 2; }
  LAUNCHER=tools/remote-acr/historical-acceptance.mjs
  LOG_NAME=historical-output.txt
  if [ "$AURA3D_ACCEPTANCE_KIND" = historical-evidence ]; then
    case "${AURA3D_HISTORICAL_INPUTS:-}" in tests/reports/native-historical-inputs/*) ;; *) echo 'FATAL: historical inputs missing' >&2; exit 2;; esac
    case "$AURA3D_HISTORICAL_INPUTS" in *'..'*|*[!a-zA-Z0-9_./-]*) echo 'FATAL: unsafe historical input path' >&2; exit 2;; esac
    [ "${AURA3D_SPECS_CSV:-}" = 'tests/unit/tools/developer-value.test.ts,tests/unit/tools/honest-public-claims.test.ts,tests/unit/tools/release-metrics-rollup.test.ts' ] || { echo 'FATAL: historical test inventory changed' >&2; exit 2; }
    PREFLIGHT=(--phase preflight --gate "$AURA3D_CODE_COMPLETE_GATE" --inputs "$AURA3D_HISTORICAL_INPUTS")
    EXECUTE=(--phase execute --gate "$AURA3D_CODE_COMPLETE_GATE" --inputs "$AURA3D_HISTORICAL_INPUTS" --run-id "$AURA3D_RUN_ID")
    ARTIFACT_DIR="tests/reports/native-historical-acceptance/${AURA3D_RUN_ID}"
  elif [ "$AURA3D_ACCEPTANCE_KIND" = historical-replay ]; then
    [ "${AURA3D_HISTORICAL_INPUTS:-none}" = none ] || { echo 'FATAL: replay does not use measured-report inputs' >&2; exit 2; }
    [ "${AURA3D_SPECS_CSV:-}" = 'tests/unit/aura-slam/replay.test.ts' ] || { echo 'FATAL: historical replay inventory changed' >&2; exit 2; }
    PREFLIGHT=(--phase replay-preflight --gate "$AURA3D_CODE_COMPLETE_GATE")
    EXECUTE=(--phase replay-execute --gate "$AURA3D_CODE_COMPLETE_GATE" --run-id "$AURA3D_RUN_ID")
    ARTIFACT_DIR="tests/reports/native-historical-replay/${AURA3D_RUN_ID}"
  else
    [ "${AURA3D_HISTORICAL_INPUTS:-none}" = none ] || { echo 'FATAL: codec mode does not use historical reports' >&2; exit 2; }
    [ "${AURA3D_SPECS_CSV:-}" = 'tests/acceptance/gltf-external-decoder-fixtures.test.ts' ] || { echo 'FATAL: codec inventory changed' >&2; exit 2; }
    for codec_input in "${AURA3D_EXTERNAL_CODEC_LOCK:-}" "${AURA3D_EXTERNAL_CODEC_NPM_INPUTS:-}"; do
      case "$codec_input" in "tests/reports/native-external-codec-inputs/${AURA3D_RUN_ID}/"*) ;; *) echo 'FATAL: run-scoped codec inputs missing' >&2; exit 2;; esac
      case "$codec_input" in *'..'*|*[!a-zA-Z0-9_./-]*) echo 'FATAL: unsafe codec input path' >&2; exit 2;; esac
    done
    LAUNCHER=tools/remote-acr/external-codec-run.mjs
    LOG_NAME=external-codec-output.txt
    PREFLIGHT=(--phase preflight --gate "$AURA3D_CODE_COMPLETE_GATE" --lock "$AURA3D_EXTERNAL_CODEC_LOCK" --npm-inputs "$AURA3D_EXTERNAL_CODEC_NPM_INPUTS" --run-id "$AURA3D_RUN_ID")
    EXECUTE=(--phase execute --gate "$AURA3D_CODE_COMPLETE_GATE" --lock "$AURA3D_EXTERNAL_CODEC_LOCK" --npm-inputs "$AURA3D_EXTERNAL_CODEC_NPM_INPUTS" --run-id "$AURA3D_RUN_ID")
    ARTIFACT_DIR="tests/reports/native-external-codec-acceptance/${AURA3D_RUN_ID}"
  fi
  [ -n "${A3D_RELEASE_PLAN:-}" ] && [ "$A3D_RELEASE_PLAN" != none ] || { echo 'FATAL: candidate plan missing' >&2; exit 2; }
  [ "$AURA3D_ARTIFACT_TRANSPORT" = managed-identity ] || { echo 'FATAL: historical acceptance uses the managed-identity transport' >&2; exit 2; }
  # Revalidate the gate, every report and the offline history before any
  # credential or test process is started in the remote container.
  node "$LAUNCHER" "${PREFLIGHT[@]}"
  [ -n "${AURA3D_ARTIFACTS_BLOB_URL:-}" ] && [ "$AURA3D_ARTIFACTS_BLOB_URL" != none ] || { echo 'FATAL: artifact destination missing' >&2; exit 2; }
  node tools/remote-acr/upload-artifacts.mjs --prefix "$AURA3D_RUN_ID" --check || { echo 'FATAL: artifact identity unavailable' >&2; exit 2; }
  LOG="$(mktemp /tmp/aura3d-historical-log.XXXXXX)"
  trap 'rm -f "$LOG"' EXIT
  set +e
  node "$LAUNCHER" "${EXECUTE[@]}" 2>&1 |
    node --input-type=module -e 'import {createInterface} from "node:readline"; import {redactText} from "./tools/remote-acr/upload-artifacts.mjs"; for await (const line of createInterface({input:process.stdin,crlfDelay:Infinity})) console.log(redactText(line));' |
    tee "$LOG"
  PIPE_EXITS=("${PIPESTATUS[@]}")
  HISTORICAL_EXIT=${PIPE_EXITS[0]}
  CONSOLE_EXIT=$((PIPE_EXITS[1] || PIPE_EXITS[2]))
  set -e
  UPLOAD_EXIT=0
  if [ -d "$ARTIFACT_DIR" ]; then
    node tools/remote-acr/upload-artifacts.mjs --prefix "$AURA3D_RUN_ID" --copy "$LOG" "$LOG_NAME" "$ARTIFACT_DIR" || UPLOAD_EXIT=$?
  else
    node tools/remote-acr/upload-artifacts.mjs --prefix "$AURA3D_RUN_ID" --copy "$LOG" "$LOG_NAME" || UPLOAD_EXIT=$?
  fi
  if [ "$AURA3D_ACCEPTANCE_KIND" = external-codec-fixtures ]; then
    echo "[task-run] EXTERNAL_CODEC_EXIT=${HISTORICAL_EXIT}"
  else
    echo "[task-run] HISTORICAL_EXIT=${HISTORICAL_EXIT}"
  fi
  echo "[task-run] CONSOLE_EXIT=${CONSOLE_EXIT}"
  echo "[task-run] UPLOAD_EXIT=${UPLOAD_EXIT}"
  [ "$HISTORICAL_EXIT" -eq 0 ] && [ "$CONSOLE_EXIT" -eq 0 ] && [ "$UPLOAD_EXIT" -eq 0 ] || exit 1
  exit 0
fi

AURA3D_SPECS="${AURA3D_SPECS:-${AURA3D_SPECS_CSV:-}}"
AURA3D_SPECS="${AURA3D_SPECS//,/ }"
: "${AURA3D_SPECS:?AURA3D_SPECS or AURA3D_SPECS_CSV is required}"
: "${AURA3D_RUN_ID:?AURA3D_RUN_ID is required}"
AURA3D_NATIVE_ACCEPTANCE="${AURA3D_NATIVE_ACCEPTANCE:-0}"
AURA3D_BROWSER_PROJECT="${AURA3D_BROWSER_PROJECT:-none}"
AURA3D_CODE_COMPLETE_GATE="${AURA3D_CODE_COMPLETE_GATE:-none}"
case "${AURA3D_NATIVE_ACCEPTANCE}:${AURA3D_RUN_ID}:${AURA3D_SPECS}:${AURA3D_BROWSER_PROJECT}:${AURA3D_CODE_COMPLETE_GATE}" in
  1:*|*:native-*|*native-*.spec.ts*|*:*:*:chromium-*:*|*:*:*:firefox-*:*|*:*:*:webkit-*:* ) AURA3D_NATIVE_ACCEPTANCE=1 ;;
esac
[ "$AURA3D_CODE_COMPLETE_GATE" = none ] || AURA3D_NATIVE_ACCEPTANCE=1
if [ "$AURA3D_NATIVE_ACCEPTANCE" != 1 ]; then
  LEGACY_SPEC_COUNT=0
  for selector in $AURA3D_SPECS; do
    case "$selector" in */native-*|tests/browser/resource-soak-u1.spec.ts) AURA3D_NATIVE_ACCEPTANCE=1;; esac
    case "$selector" in
      @headed-xvfb|@env-GL_*|--grep|--grep=*|@g[0-9]*) continue;;
      tests/browser/*.spec.ts|tests/visual/*.spec.ts|tests/browser/*.spec.ts:[0-9]*|tests/visual/*.spec.ts:[0-9]*)
        LEGACY_SPEC_COUNT=$((LEGACY_SPEC_COUNT + 1))
        case "$selector" in *'*'*|*'?'*|*'['*)
          for match in $selector; do
            case "$match" in *'*'*|*'?'*|*'['*|*/native-*) AURA3D_NATIVE_ACCEPTANCE=1;; esac
          done;;
        esac;;
      # The 4.x ACR path passed other Playwright selectors/args (for example a
      # --grep value) straight through; only native-named inputs force native mode.
      *native-*) AURA3D_NATIVE_ACCEPTANCE=1;;
      *) continue;;
    esac
  done
  [ "$LEGACY_SPEC_COUNT" -gt 0 ] || AURA3D_NATIVE_ACCEPTANCE=1
fi
export AURA3D_NATIVE_ACCEPTANCE

REPORTER="${AURA3D_REPORTER:-line}"
XVFB_PID=""
RESTORE_DIR=""
A3D_PW_ARGS=()
A3D_PW_RUN_ARGS=()
A3D_CONFIG_DIR=""
if [ "$AURA3D_NATIVE_ACCEPTANCE" = 1 ]; then
  case " $AURA3D_SPECS " in *' @headed-xvfb '*|*' --headed '*) echo "FATAL: headed selectors are forbidden for native acceptance" >&2; exit 2;; esac
  case "$AURA3D_SPECS" in *'*'*|*'?'*|*'['*) echo "FATAL: native spec paths must be exact" >&2; exit 2;; esac
  if [ "${AURA3D_HEADED_XVFB:-0}" = 1 ]; then echo "FATAL: headed browser mode is forbidden for native acceptance" >&2; exit 2; fi
  case "$AURA3D_RUN_ID" in ''|*[!a-zA-Z0-9_-]*) echo "FATAL: invalid run ID" >&2; exit 2;; esac
  case "$AURA3D_BROWSER_PROJECT" in
    chromium-automation|firefox-automation|webkit-automation|chromium-gpu-headless|chromium-software|chromium-experimental) ;;
    *) echo "FATAL: invalid browser project" >&2; exit 2;;
  esac
  case "$AURA3D_CODE_COMPLETE_GATE" in none|''|/*|*'..'*|*[!a-zA-Z0-9_./-]*) echo "FATAL: missing or unsafe code-complete gate" >&2; exit 2;; esac
  [ -n "${A3D_RELEASE_PLAN:-}" ] && [ "$A3D_RELEASE_PLAN" != none ] || { echo "FATAL: candidate release plan is missing" >&2; exit 2; }
  case ",$REPORTER," in *,json,*) ;; *) echo "FATAL: JSON reporter is required" >&2; exit 2;; esac
  # 5.0 acceptance (run-acceptance5.sh): optional allowlisted lane config,
  # Playwright --shard and a --global-timeout that ends tests before the ACR
  # run timeout so results are still uploaded.
  case "${AURA3D_PLAYWRIGHT_CONFIG:-none}" in
    none|'') A3D_CONFIG_DIR="" ;;
    tests/qr/prd04/playwright.config.ts) A3D_CONFIG_DIR=tests/qr/prd04; A3D_PW_ARGS+=(--config "$AURA3D_PLAYWRIGHT_CONFIG") ;;
    *) echo "FATAL: unsupported Playwright config" >&2; exit 2 ;;
  esac
  case "${AURA3D_PW_SHARD:-none}" in
    none|'') AURA3D_PW_SHARD="" ;;
    *) [[ "$AURA3D_PW_SHARD" =~ ^([1-9][0-9]{0,2})/([1-9][0-9]{0,2})$ ]] && [ "${BASH_REMATCH[1]}" -le "${BASH_REMATCH[2]}" ] \
         || { echo "FATAL: invalid Playwright shard" >&2; exit 2; }
       A3D_PW_ARGS+=(--shard="$AURA3D_PW_SHARD" --pass-with-no-tests) ;;
  esac
  case "${AURA3D_PW_GLOBAL_TIMEOUT_MS:-none}" in
    none|'') ;;
    *) [[ "$AURA3D_PW_GLOBAL_TIMEOUT_MS" =~ ^[1-9][0-9]{4,6}$ ]] && [ "$AURA3D_PW_GLOBAL_TIMEOUT_MS" -le 1800000 ] \
         || { echo "FATAL: invalid Playwright global timeout" >&2; exit 2; }
       A3D_PW_RUN_ARGS+=(--global-timeout="$AURA3D_PW_GLOBAL_TIMEOUT_MS") ;;
  esac
  for spec in $AURA3D_SPECS; do
    if [ -n "$A3D_CONFIG_DIR" ]; then
      case "$spec" in "$A3D_CONFIG_DIR"/browser/*.spec.ts) ;; *) echo "FATAL: invalid native spec selector for the selected config" >&2; exit 2;; esac
    else
      case "$spec" in tests/browser/*.spec.ts|tests/visual/*.spec.ts) ;; *) echo "FATAL: invalid native spec selector" >&2; exit 2;; esac
    fi
    case "$spec" in *'*'*|*'?'*|*'['*) echo "FATAL: native spec paths must be exact" >&2; exit 2;; esac
    case "/$spec/" in *'/../'*|*'/./'*) echo "FATAL: unsafe native spec path" >&2; exit 2;; esac
    [ -f "$spec" ] || { echo "FATAL: staged spec missing: $spec" >&2; exit 2; }
  done
  node tools/native-capability-gate/index.mjs --phase acceptance --gate "$AURA3D_CODE_COMPLETE_GATE" || exit 2
  # ACR source5 records: the job reads each retained file at its recorded in-job path
  # (jobPath, placed by acceptance-staging.mjs place-job-paths); those bytes must still
  # hash to the gate's SHA-256.
  GATE_PLAN="$(node -e 'const g=require("./"+process.argv[1]);const p=g.sourceRunner==="acr-source5"?g.candidatePlan?.jobPath:g.candidatePlan?.path;if(!p)process.exit(1);process.stdout.write(p)' "$AURA3D_CODE_COMPLETE_GATE")" || exit 2
  [ "$GATE_PLAN" = "$A3D_RELEASE_PLAN" ] || { echo "FATAL: candidate release plan mismatch" >&2; exit 2; }
  node - "$AURA3D_CODE_COMPLETE_GATE" <<'NODE' || exit 2
const fs = require('node:fs');
const { createHash } = require('node:crypto');
const gate = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
const source5 = gate.sourceRunner === 'acr-source5';
const bound = [['candidatePlan', 'A3D_RELEASE_PLAN'], ['sourceConsumerReport','NATIVE_CONSUMER_SOURCE_REPORT'], ['matrixSourceReport','NATIVE_MATRIX_SOURCE_REPORT'], ['examplesSourceReport','NATIVE_EXAMPLES_SOURCE_REPORT']];
for (const [field, env] of bound.slice(1)) {
  const path = source5 ? gate[field]?.jobPath : gate[field]?.path;
  if (!path || path !== process.env[env]) throw new Error(`source report mismatch: ${field}`);
}
if (source5) for (const [field, env] of bound) {
  const file = process.env[env];
  if (fs.lstatSync(file).isSymbolicLink() || createHash('sha256').update(fs.readFileSync(file)).digest('hex') !== gate[field].sha256) throw new Error(`in-job ${field} does not match the gate SHA-256`);
}
NODE
  [ "${NATIVE_NETWORK_REPORT:-}" = "tests/reports/native-acceptance/${AURA3D_RUN_ID}/network.json" ] || { echo "FATAL: unsafe network output path" >&2; exit 2; }
  [ "${NATIVE_MEASUREMENT_REPORT:-}" = "tests/reports/native-performance/${AURA3D_RUN_ID}/manifest.json" ] || { echo "FATAL: unsafe measurement output path" >&2; exit 2; }
  for name in NATIVE_PERF_DEVICE NATIVE_PERF_DRIVER; do
    encoded_name="${name}_B64"
    encoded="${!encoded_name:-none}"
    if [ "$encoded" = none ]; then unset "$name"; continue; fi
    case "$encoded" in *[!a-zA-Z0-9_-]*) echo "FATAL: invalid device label encoding" >&2; exit 2;; esac
    decoded="$(node -e 'const s=Buffer.from(process.argv[1],"base64url").toString("utf8"); if(!s || s.length>200 || /[\x00-\x1f\x7f]/.test(s))process.exit(1); process.stdout.write(s)' "$encoded")" || exit 2
    export "$name=$decoded"
  done
  if [ "$AURA3D_ARTIFACT_TRANSPORT" = legacy-sas ]; then
    # Prove the destination is writable before any consumer restore or browser.
    [ "${AURA3D_ARTIFACTS_BLOB_URL:-none}" = none ] && [ -n "$A3D_ARTIFACT_SAS" ] || { echo "FATAL: legacy SAS artifact destination missing" >&2; exit 2; }
    printf '%s\n' "$AURA3D_RUN_ID" > /tmp/aura3d-transport-check.txt
    artifact_upload --prefix "$AURA3D_RUN_ID" --copy /tmp/aura3d-transport-check.txt transport-check.txt >/dev/null \
      || { echo "FATAL: legacy SAS artifact destination is not writable" >&2; exit 2; }
  else
    [ -z "$A3D_ARTIFACT_SAS" ] || { echo "FATAL: SAS supplied without the legacy-sas transport" >&2; exit 2; }
    [ -n "${AURA3D_ARTIFACTS_BLOB_URL:-}" ] && [ "$AURA3D_ARTIFACTS_BLOB_URL" != none ] || { echo "FATAL: managed-identity artifact destination missing" >&2; exit 2; }
    node tools/remote-acr/upload-artifacts.mjs --prefix "$AURA3D_RUN_ID" --check || { echo "FATAL: managed identity cannot obtain a storage token" >&2; exit 2; }
  fi
  NATIVE_ACCEPTANCE_RUN_ID="$AURA3D_RUN_ID"
  export AURA3D_BROWSER_PROJECT A3D_RELEASE_PLAN NATIVE_ACCEPTANCE_RUN_ID
  mkdir -p "tests/reports/native-acceptance/${AURA3D_RUN_ID}"
  # The portable projects and lockfiles are source-report-bound. Restore for
  # every native job so packed-consumer imports work even through helpers.
  if [ "$AURA3D_NATIVE_ACCEPTANCE" = 1 ]; then
      # Restore
      # the two exact candidate installations, never host node_modules.
      RESTORE_DIR="$(mktemp -d /tmp/aura3d-native-consumers.XXXXXX)"
      trap 'rm -rf "$RESTORE_DIR"' EXIT
      RESTORE_PROJECTS="$RESTORE_DIR/projects"
      if ! pnpm exec tsx --tsconfig tsconfig.base.json tools/native-consumer-matrix/index.ts \
          --phase browser --run-id "$AURA3D_RUN_ID" --source-report "$NATIVE_MATRIX_SOURCE_REPORT" \
          --gate "$AURA3D_CODE_COMPLETE_GATE" --restore-react --out-dir "$RESTORE_PROJECTS" \
          > /tmp/aura3d-react-restored.json 2> /tmp/aura3d-react-restore.log; then
        node --input-type=module -e 'import {readFileSync} from "node:fs"; import {redactText} from "./tools/remote-acr/upload-artifacts.mjs"; console.error(redactText(readFileSync("/tmp/aura3d-react-restore.log", "utf8")))'
        echo "FATAL: candidate consumer restoration failed" >&2
        exit 2
      fi
      RESTORED_PATHS="$(node - "$RESTORE_PROJECTS" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const base = fs.realpathSync(process.argv[2]);
const paths = JSON.parse(fs.readFileSync('/tmp/aura3d-react-restored.json', 'utf8'));
for (const name of ['react18', 'react19']) {
  const value = paths[name];
  if (typeof value !== 'string' || path.resolve(value) !== path.join(base, name) || fs.realpathSync(value) !== path.resolve(value) || !fs.statSync(path.join(value, 'node_modules')).isDirectory()) throw new Error(`invalid restored consumer: ${name}`);
}
process.stdout.write(`${paths.react18}\t${paths.react19}`);
NODE
      )" || { echo "FATAL: invalid restored consumers" >&2; exit 2; }
      IFS=$'\t' read -r A3D_REACT_18_CONSUMER_DIR A3D_REACT_19_CONSUMER_DIR <<< "$RESTORED_PATHS"
      A3D_INSTALLED_PACKAGE_ROOT="$A3D_REACT_19_CONSUMER_DIR"
      export A3D_REACT_18_CONSUMER_DIR A3D_REACT_19_CONSUMER_DIR A3D_INSTALLED_PACKAGE_ROOT
  fi
else
  [ "$AURA3D_BROWSER_PROJECT" != none ] || unset AURA3D_BROWSER_PROJECT
  [ "$AURA3D_CODE_COMPLETE_GATE" != none ] || unset AURA3D_CODE_COMPLETE_GATE
  [ "${A3D_RELEASE_PLAN:-none}" != none ] || unset A3D_RELEASE_PLAN
  [ "${AURA3D_ARTIFACTS_BLOB_URL:-none}" != none ] || unset AURA3D_ARTIFACTS_BLOB_URL
  FILTERED_SPECS=""
  for spec in $AURA3D_SPECS; do
    if [ "$spec" = "@headed-xvfb" ]; then
      Xvfb :99 -screen 0 1280x720x24 -nolisten tcp >/dev/null 2>&1 &
      XVFB_PID=$!
      export DISPLAY=:99 AURA3D_HEADED_XVFB=1
      sleep 2
      echo "[task-run] headed Chromium under Xvfb (pid ${XVFB_PID}, DISPLAY=${DISPLAY})"
    elif [[ "$spec" =~ ^@env-(GL_[A-Z_]+)=([0-9][0-9,]*)$ ]]; then
      # GU47 phase 7 (g09): capture knobs (GL_TEX_WAIT_S, GL_SETTLE, GL_PAIR_MS) ride in SPECS_CSV as `@env-NAME=digits`
      # sentinels, because the task yaml passes no env. Only GL_* names and digit/comma values are accepted.
      export "${BASH_REMATCH[1]}=${BASH_REMATCH[2]}"
      echo "[task-run] env ${BASH_REMATCH[1]}=${BASH_REMATCH[2]}"
    else
      FILTERED_SPECS="${FILTERED_SPECS:+${FILTERED_SPECS} }${spec}"
    fi
  done
  AURA3D_SPECS="$FILTERED_SPECS"
fi
cleanup_task() {
  [ -z "$XVFB_PID" ] || kill "$XVFB_PID" 2>/dev/null || true
  [ -z "$RESTORE_DIR" ] || rm -rf "$RESTORE_DIR"
}
trap cleanup_task EXIT

echo "[task-run] run_id=${AURA3D_RUN_ID}"
echo "[task-run] node=$(node --version) pnpm=$(pnpm --version)"
echo "[task-run] specs=${AURA3D_SPECS} project=${AURA3D_BROWSER_PROJECT:-legacy} reporter=${REPORTER}"
mkdir -p tests/reports test-results
# Record existing report files so artifact egress contains this invocation's
# outputs, rather than re-uploading source reports, archives, or gate inputs.
if [ "$AURA3D_NATIVE_ACCEPTANCE" = 1 ]; then
  node <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
function scan(dir, out) {
  for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
    const p = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`symlink in report tree: ${p}`);
    if (entry.isDirectory()) scan(p, out);
    else if (entry.isFile()) { const st = fs.statSync(p); out[p] = [st.size, st.mtimeMs]; }
  }
}
const files = {}; scan('tests/reports', files);
fs.writeFileSync('/tmp/aura3d-report-before.json', JSON.stringify(files));
NODE
fi

# Validate the discovered inventory before starting any browser, then compare
# it with the actual structured results after the run.
validate_inventory() {
  AURA3D_SPECS="$AURA3D_SPECS" AURA3D_BROWSER_PROJECT="$AURA3D_BROWSER_PROJECT" INVENTORY_PHASE="$1" \
    A3D_CONFIG_DIR="$A3D_CONFIG_DIR" A3D_SHARDED="${AURA3D_PW_SHARD:+1}" node <<'NODE'
const fs = require('node:fs');
const requested = process.env.AURA3D_SPECS.trim().split(/\s+/);
const project = process.env.AURA3D_BROWSER_PROJECT;
const configDir = process.env.A3D_CONFIG_DIR;
const sharded = process.env.A3D_SHARDED === '1';
// Lane configs report files relative to their own directory.
const repoFile = file => { file = file.replace(/^\.\//, ''); return configDir && !file.startsWith(`${configDir}/`) ? `${configDir}/${file}` : file; };
function tests(path, observed) {
  const data = JSON.parse(fs.readFileSync(path, 'utf8'));
  if (data.errors?.length || !Array.isArray(data.suites)) throw new Error(`invalid report: ${path}`);
  const result = new Map();
  function visit(suite) {
    for (const spec of suite.specs || []) {
      for (const test of spec.tests || []) {
        if (!spec.id || !spec.file || test.projectName !== project) throw new Error('test missing ID, file or requested project');
        const key = `${spec.id}:${test.projectName}`;
        if (result.has(key)) throw new Error(`duplicate test: ${key}`);
        if (observed && (test.expectedStatus !== 'passed' || !test.results?.length || test.results.at(-1).status !== 'passed' || test.status !== 'expected')) throw new Error(`test missing, skipped or failed: ${key}`);
        result.set(key, repoFile(spec.file));
      }
    }
    for (const child of suite.suites || []) visit(child);
  }
  data.suites.forEach(visit);
  return result;
}
try {
  const expected = tests('tests/reports/remote-acr-inventory.json', false);
  // A Playwright shard holds whole files and may be empty; the host merge
  // (tools/remote-acr/acceptance5.mjs) checks per-spec coverage across shards.
  if (!expected.size && !sharded) throw new Error('test discovery returned no tests');
  if (!sharded) for (const spec of requested) if (![...expected.values()].includes(spec)) throw new Error(`selected spec contained no tests: ${spec}`);
  for (const file of new Set(expected.values())) if (!requested.includes(file)) throw new Error(`discovered an unrequested file: ${file}`);
  if (process.env.INVENTORY_PHASE === 'execution') {
    const actual = tests('tests/reports/remote-acr-report.json', true);
    if (expected.size !== actual.size || [...expected].some(([id, file]) => actual.get(id) !== file)) throw new Error('discovery and execution inventories differ');
  }
  console.log(`[task-run] ${process.env.INVENTORY_PHASE} inventory: ${expected.size} tests across ${requested.length} specs`);
} catch (error) {
  console.error(`[task-run] inventory verification failed: ${error.message}`);
  process.exitCode = 1;
}
NODE
}

DISCOVERY_EXIT=0
INVENTORY_EXIT=0
PW_EXIT=""
CONSOLE_EXIT=0
if [ "$AURA3D_NATIVE_ACCEPTANCE" = 1 ]; then
  # Absolute: lane configs resolve reporter paths from their own directory.
  export PLAYWRIGHT_JSON_OUTPUT_NAME="$PWD/tests/reports/remote-acr-inventory.json"
  # shellcheck disable=SC2086 # selectors were validated as exact paths above
  pnpm exec playwright test ${AURA3D_SPECS} ${A3D_PW_ARGS[@]+"${A3D_PW_ARGS[@]}"} --project="$AURA3D_BROWSER_PROJECT" --list --reporter=json > /tmp/playwright-discovery.txt 2>&1 || DISCOVERY_EXIT=$?
  if [ "$DISCOVERY_EXIT" = 0 ]; then validate_inventory discovery || DISCOVERY_EXIT=$?; fi
  INVENTORY_EXIT=$DISCOVERY_EXIT
fi

if [ "$DISCOVERY_EXIT" = 0 ]; then
  export PLAYWRIGHT_JSON_OUTPUT_NAME=tests/reports/remote-acr-report.json
  [ "$AURA3D_NATIVE_ACCEPTANCE" != 1 ] || PLAYWRIGHT_JSON_OUTPUT_NAME="$PWD/tests/reports/remote-acr-report.json"
  set +e
  if [ "$AURA3D_NATIVE_ACCEPTANCE" = 1 ]; then
    # shellcheck disable=SC2086
    pnpm exec playwright test ${AURA3D_SPECS} ${A3D_PW_ARGS[@]+"${A3D_PW_ARGS[@]}"} ${A3D_PW_RUN_ARGS[@]+"${A3D_PW_RUN_ARGS[@]}"} --project="$AURA3D_BROWSER_PROJECT" --reporter="$REPORTER" 2>&1 |
      node --input-type=module -e '
        import { createInterface } from "node:readline";
        import { redactText } from "./tools/remote-acr/upload-artifacts.mjs";
        for await (const line of createInterface({input:process.stdin, crlfDelay:Infinity})) console.log(redactText(line));
      ' | tee /tmp/playwright-output.txt
    PIPE_EXITS=("${PIPESTATUS[@]}")
    PW_EXIT=${PIPE_EXITS[0]}
    CONSOLE_EXIT=$((PIPE_EXITS[1] || PIPE_EXITS[2]))
  else
    # shellcheck disable=SC2086
    pnpm exec playwright test ${AURA3D_SPECS} --reporter="$REPORTER" 2>&1 | tee /tmp/playwright-output.txt
    PW_EXIT=${PIPESTATUS[0]}
  fi
  set -e
  if [ "$AURA3D_NATIVE_ACCEPTANCE" = 1 ]; then validate_inventory execution || INVENTORY_EXIT=$?; fi
else
  printf 'Discovery failed (exit %s); browser tests were not started.\n' "$DISCOVERY_EXIT" > /tmp/playwright-output.txt
fi

echo "[task-run] DISCOVERY_EXIT=${DISCOVERY_EXIT}"
echo "[task-run] PLAYWRIGHT_EXIT=${PW_EXIT:-not-run}"
echo "[task-run] INVENTORY_EXIT=${INVENTORY_EXIT}"
echo "[task-run] CONSOLE_EXIT=${CONSOLE_EXIT}"
if [ "$AURA3D_NATIVE_ACCEPTANCE" != 1 ]; then
  for ctx in test-results/*/error-context.md; do
    [ -f "$ctx" ] || continue
    echo "[task-run] ===== ${ctx} ====="
    cat "$ctx"
  done
  if [ -f tests/reports/remote-acr-report.json ]; then
    echo "[task-run] ===== tests/reports/remote-acr-report.json ====="
    cat tests/reports/remote-acr-report.json
  fi
fi
# Send stdout, structured reports, screenshots and traces together. Upload
# status is recorded independently so it never changes the real test result.
UPLOAD_EXIT=0
if [ "$AURA3D_NATIVE_ACCEPTANCE" = 1 ]; then
  mkdir -p /tmp/aura3d-browser-artifacts/reports
  AURA3D_SPECS="$AURA3D_SPECS" AURA3D_BROWSER_PROJECT="$AURA3D_BROWSER_PROJECT" DISCOVERY_EXIT="$DISCOVERY_EXIT" \
    PW_EXIT="$PW_EXIT" INVENTORY_EXIT="$INVENTORY_EXIT" AURA3D_PW_SHARD="${AURA3D_PW_SHARD:-}" A3D_CONFIG_DIR="$A3D_CONFIG_DIR" \
    AURA3D_PLAYWRIGHT_CONFIG="${AURA3D_PLAYWRIGHT_CONFIG:-none}" AURA3D_ARTIFACT_TRANSPORT="$AURA3D_ARTIFACT_TRANSPORT" node <<'NODE' || UPLOAD_EXIT=1
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const before = JSON.parse(fs.readFileSync('/tmp/aura3d-report-before.json', 'utf8'));
let count = 0, bytes = 0;
function copyNew(dir) {
  for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
    const p = path.join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`symlink in report tree: ${p}`);
    if (entry.isDirectory()) copyNew(p);
    else if (entry.isFile()) {
      const st = fs.statSync(p), old = before[p];
      if (old && old[0] === st.size && old[1] === st.mtimeMs) continue;
      count++; bytes += st.size;
      if (count > 2000 || st.size > 200 * 1024 * 1024 || bytes > 512 * 1024 * 1024) throw new Error('browser reports exceed transfer limits');
      const dest = path.join('/tmp/aura3d-browser-artifacts/reports', path.relative('tests/reports', p));
      fs.mkdirSync(path.dirname(dest), {recursive:true}); fs.copyFileSync(p, dest);
    }
  }
}
copyNew('tests/reports');
const gateBytes = fs.readFileSync(process.env.AURA3D_CODE_COMPLETE_GATE);
const gate = JSON.parse(gateBytes);
const artifacts = [];
let artifactBytes = 0;
function addFile(src, name) {
  const st = fs.lstatSync(src);
  if (!st.isFile() || st.isSymbolicLink()) throw new Error(`unsafe artifact: ${src}`);
  artifactBytes += st.size;
  if (st.size > 200 * 1024 * 1024 || artifactBytes > 512 * 1024 * 1024 || artifacts.length >= 2000) throw new Error('browser artifact inventory exceeds transfer limits');
  artifacts.push({path:name, size:st.size, sha256:crypto.createHash('sha256').update(fs.readFileSync(src)).digest('hex')});
}
function inventory(dir, prefix) {
  for (const entry of fs.readdirSync(dir, {withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))) {
    const file = path.join(dir, entry.name), name = `${prefix}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`symlink in artifact tree: ${file}`);
    if (entry.isDirectory()) inventory(file, name);
    else if (entry.isFile()) addFile(file, name);
  }
}
inventory('/tmp/aura3d-browser-artifacts/reports', 'aura3d-browser-artifacts/reports');
inventory('test-results', 'test-results');
addFile('/tmp/playwright-output.txt', 'playwright-output.txt');
addFile('/tmp/playwright-discovery.txt', 'playwright-discovery.txt');
fs.writeFileSync('/tmp/aura3d-browser-artifacts/run-manifest.json', JSON.stringify({
  schema:'aura3d.native-browser-run/1', runId:process.env.AURA3D_RUN_ID, sourceRunId:gate.runId,
  project:process.env.AURA3D_BROWSER_PROJECT, specs:process.env.AURA3D_SPECS.split(/\s+/),
  freezeCommit:gate.freezeCommit, sourceInputDigest:gate.sourceInputDigest, lockfileSha256:gate.lockfileSha256,
  gateSha256:crypto.createHash('sha256').update(gateBytes).digest('hex'),
  candidatePlan:gate.candidatePlan, node:process.version, artifacts,
  shard:process.env.AURA3D_PW_SHARD || null, playwrightConfig:process.env.A3D_CONFIG_DIR ? process.env.AURA3D_PLAYWRIGHT_CONFIG : null,
  artifactTransport:process.env.AURA3D_ARTIFACT_TRANSPORT,
  discoveryExit:Number(process.env.DISCOVERY_EXIT), playwrightExit:process.env.PW_EXIT === '' ? null : Number(process.env.PW_EXIT),
  inventoryExit:Number(process.env.INVENTORY_EXIT), completedUtc:new Date().toISOString()
}, null, 2) + '\n');
NODE
  if [ "$UPLOAD_EXIT" = 0 ]; then
    artifact_upload --prefix "$AURA3D_RUN_ID" \
      --copy /tmp/playwright-output.txt playwright-output.txt \
      --copy /tmp/playwright-discovery.txt playwright-discovery.txt \
      /tmp/aura3d-browser-artifacts test-results || UPLOAD_EXIT=$?
  fi
elif [ -n "${AURA3D_ARTIFACTS_BLOB_URL:-}" ] && [ "$AURA3D_ARTIFACTS_BLOB_URL" != none ] || [ -n "$A3D_ARTIFACT_SAS" ]; then
  artifact_upload --prefix "$AURA3D_RUN_ID" \
    --copy /tmp/playwright-output.txt playwright-output.txt tests/reports test-results || UPLOAD_EXIT=$?
else
  UPLOAD_EXIT=2
  echo "[task-run] artifact destination unavailable"
fi
echo "[task-run] UPLOAD_EXIT=${UPLOAD_EXIT}"
if [ -z "$PW_EXIT" ]; then exit 1; fi
if [ "$PW_EXIT" -ne 0 ]; then exit "$PW_EXIT"; fi
if [ "$AURA3D_NATIVE_ACCEPTANCE" = 1 ] && { [ "$INVENTORY_EXIT" -ne 0 ] || [ "$CONSOLE_EXIT" -ne 0 ]; }; then exit 1; fi
if [ "$AURA3D_NATIVE_ACCEPTANCE" = 1 ] && [ "$UPLOAD_EXIT" -ne 0 ]; then exit 1; fi
exit 0
