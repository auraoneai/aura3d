#!/usr/bin/env bash
# In-image runner for the 5.0 deferred evidence-reading unit tests
# (tools/remote-acr/acceptance-evidence-tests.txt), launched last by
# run-acceptance5.sh through task.acceptance5-evidence.yaml. Revalidates the
# gate, fetches this batch's browser shard reports into tests/reports/ (never
# overwriting candidate files), runs the tests and prints a compact result
# between ACCEPTANCE5_EVIDENCE markers so the host keeps it without a download.
set -uo pipefail
if [ "${AURA3D_SOURCE_PROCESS_GUARD:-0}" = 1 ]; then
  echo "FATAL: acceptance evidence runner is forbidden within a source-phase process." >&2
  exit 2
fi
cd /repo || exit 2
export CI=1
A3D_ARTIFACT_SAS="${AURA3D_ARTIFACTS_SAS:-}"
unset AURA3D_ARTIFACTS_SAS
case "$A3D_ARTIFACT_SAS" in b64:*) A3D_ARTIFACT_SAS="$(printf '%s' "${A3D_ARTIFACT_SAS#b64:}" | base64 -d)";; esac  # ACR passes docker args via /bin/sh; the SAS's '&' must not appear raw
[ "$A3D_ARTIFACT_SAS" != none ] || A3D_ARTIFACT_SAS=""
[[ "${AURA3D_RUN_ID:-}" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$ ]] || { echo "FATAL: invalid run ID" >&2; exit 2; }
case "${AURA3D_CODE_COMPLETE_GATE:-}" in ''|none|/*|*'..'*|*[!a-zA-Z0-9_./-]*) echo "FATAL: invalid code-complete gate" >&2; exit 2;; esac
[[ "${AURA3D_EVIDENCE_PREFIXES:-}" =~ ^(none|[a-zA-Z0-9][a-zA-Z0-9_,-]*)$ ]] || { echo "FATAL: invalid evidence prefixes" >&2; exit 2; }
[ -n "$A3D_ARTIFACT_SAS" ] || { echo "FATAL: legacy SAS artifact destination missing" >&2; exit 2; }

node tools/native-capability-gate/index.mjs --phase acceptance --gate "$AURA3D_CODE_COMPLETE_GATE" || exit 2
export AURA3D_CODE_COMPLETE_GATE

FETCH_EXIT=0
echo '{"fetched":0,"bytes":0,"conflicts":[]}' > /tmp/evidence-fetch.json
if [ "$AURA3D_EVIDENCE_PREFIXES" != none ]; then
  AURA3D_ARTIFACTS_SAS="$A3D_ARTIFACT_SAS" node tools/remote-acr/acceptance5.mjs fetch-reports \
    --prefixes "$AURA3D_EVIDENCE_PREFIXES" --dest tests/reports > /tmp/evidence-fetch.json || FETCH_EXIT=$?
fi
echo "[evidence] fetched browser reports: $(cat /tmp/evidence-fetch.json | head -c 300)"

FILES=()
while IFS= read -r t; do case "$t" in ''|'#'*) ;; *) FILES+=("$t");; esac; done < tools/remote-acr/acceptance-evidence-tests.txt
pnpm exec vitest run "${FILES[@]}" --maxWorkers=2 --reporter=default --reporter=json --outputFile.json=/tmp/evidence-vitest.json 2>&1 |
  node --input-type=module -e 'import {createInterface} from "node:readline"; import {redactText} from "./tools/remote-acr/upload-artifacts.mjs"; for await (const line of createInterface({input:process.stdin,crlfDelay:Infinity})) console.log(redactText(line));' |
  tee /tmp/evidence-output.txt
EVIDENCE_EXIT=${PIPESTATUS[0]}

echo "::: ACCEPTANCE5_EVIDENCE_BEGIN"
node tools/remote-acr/acceptance5.mjs evidence-summary /tmp/evidence-vitest.json /tmp/evidence-fetch.json
echo "::: ACCEPTANCE5_EVIDENCE_END"

UPLOAD_EXIT=0
COPIES=(--copy /tmp/evidence-output.txt evidence-output.txt --copy /tmp/evidence-fetch.json evidence-fetch.json)
[ ! -f /tmp/evidence-vitest.json ] || COPIES+=(--copy /tmp/evidence-vitest.json evidence-vitest.json)
AURA3D_ARTIFACTS_SAS="$A3D_ARTIFACT_SAS" node tools/remote-acr/upload-artifacts.mjs --prefix "$AURA3D_RUN_ID" "${COPIES[@]}" || UPLOAD_EXIT=$?
echo "[evidence] FETCH_EXIT=${FETCH_EXIT}"
echo "[evidence] EVIDENCE_EXIT=${EVIDENCE_EXIT}"
echo "[evidence] UPLOAD_EXIT=${UPLOAD_EXIT}"
[ "$EVIDENCE_EXIT" = 0 ] && [ "$FETCH_EXIT" = 0 ] && [ "$UPLOAD_EXIT" = 0 ] || exit 1
exit 0
