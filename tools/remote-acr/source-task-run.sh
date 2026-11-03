#!/usr/bin/env bash
# Runs inside the immutable source image. Test and egress exits remain distinct.
set -uo pipefail
cd /repo

if [ "$#" -ne 0 ]; then echo 'source task refuses extra argv' >&2; exit 2; fi
: "${NATIVE_RUN_ID:?NATIVE_RUN_ID is required}"
: "${NATIVE_RELEASE_KIND:?NATIVE_RELEASE_KIND is required}"
: "${NATIVE_SOURCE_PHASE:?NATIVE_SOURCE_PHASE is required}"
: "${AURA3D_ARTIFACTS_BLOB_URL:?managed-identity artifact destination is required}"
if [[ ! "$NATIVE_RUN_ID" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$ ]]; then echo 'invalid source run ID' >&2; exit 2; fi
case "$NATIVE_RELEASE_KIND" in patch|minor|major) ;; *) echo 'invalid release kind' >&2; exit 2 ;; esac
case "$NATIVE_SOURCE_PHASE" in prepare|resume) ;; *) echo 'invalid source phase' >&2; exit 2 ;; esac
if [ "$NATIVE_SOURCE_PHASE" = resume ] && [[ ! "${NATIVE_BUILD_REPORT_SHA256:-}" =~ ^[0-9a-f]{64}$ ]]; then
  echo 'a separately retained build report digest is required to resume' >&2; exit 2
fi
export NATIVE_REPORT_DIR="tests/reports/native-capabilities/$NATIVE_RUN_ID"
export AURA3D_SOURCE_MANIFEST='.native-source-manifest.json'
mkdir -p "$NATIVE_REPORT_DIR"

# Resolve the existing task identity token before any checks. Blob authorization
# is confirmed by the actual create-only artifact upload.
if ! node tools/remote-acr/upload-artifacts.mjs --check --prefix "$NATIVE_RUN_ID/$NATIVE_SOURCE_PHASE"; then
  echo 'SOURCE_TEST_EXIT=not-run'
  echo 'SOURCE_UPLOAD_EXIT=2'
  echo 'source task has no authorized artifact egress' >&2
  exit 2
fi

log="$NATIVE_REPORT_DIR/source-task.log"
report="$NATIVE_REPORT_DIR/source-build.json"
if [ "$NATIVE_SOURCE_PHASE" = resume ]; then log="$NATIVE_REPORT_DIR/source-task-resume.log"; report="$NATIVE_REPORT_DIR/source-reports.json"; fi
node tools/remote-acr/source-checks.mjs run 2>&1 | tee "$log"
source_rc=${PIPESTATUS[0]}
if [ ! -s "$report" ] && [ "$source_rc" -eq 0 ]; then source_rc=2; fi
printf 'SOURCE_TEST_EXIT=%s\n' "$source_rc"

# Retain available outputs even on failure. Avoid passing credentials in argv.
# Package tarballs, consumer workspaces, the manifest and logs bind the run.
dirs=("$NATIVE_REPORT_DIR")
for candidate in "tests/reports/native-consumers/$NATIVE_RUN_ID" "tests/reports/native-consumer-matrix/$NATIVE_RUN_ID" "tests/reports/native-examples-catalog/$NATIVE_RUN_ID"; do
  [ ! -d "$candidate" ] || dirs+=("$candidate")
done
if [ "$NATIVE_SOURCE_PHASE" = resume ]; then dirs+=("tests/reports/native-source-inputs/$NATIVE_RUN_ID"); fi
node tools/remote-acr/upload-artifacts.mjs --source-handoff --prefix "$NATIVE_RUN_ID/$NATIVE_SOURCE_PHASE" --preserve-root /repo "${dirs[@]}"
upload_rc=$?
printf 'SOURCE_UPLOAD_EXIT=%s\n' "$upload_rc"
if [ "$source_rc" -ne 0 ]; then exit "$source_rc"; fi
if [ "$upload_rc" -ne 0 ]; then exit "$upload_rc"; fi
