#!/usr/bin/env bash
# Submit the single, source-only candidate job to serverless ACR Tasks.
# No arbitrary command/arguments, local Docker, browser or acceptance mode.
set -euo pipefail
if [ "$#" -ne 0 ]; then echo 'source runner does not accept argv or browser/acceptance commands' >&2; exit 2; fi
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"
AZ_WRAPPER="${AZ_WRAPPER:-az-auraone-gurbaksh}"
EXPECTED_SUB='9b7da706-63ce-4740-8c03-3b77cbe1b7d0'
EXPECTED_TENANT='8aa8a205-1f60-42a0-a546-03e2bda76637'
ACR_NAME="${ACR_NAME:-picassostagingacr}"
ACR_RG="${ACR_RG:-PICASSO-STAGING-RG}"
IMAGE_REPO="${IMAGE_REPO:-aura3d-native-source}"
NATIVE_SOURCE_PHASE="${NATIVE_SOURCE_PHASE:-prepare}"
if [ "$NATIVE_SOURCE_PHASE" = resume ] && [ -z "${RUN_ID:-}" ]; then echo 'resume requires the original RUN_ID' >&2; exit 2; fi
RUN_ID="${RUN_ID:-native-source-$(date -u +%Y%m%dT%H%M%SZ)-$(node -e 'process.stdout.write(require("node:crypto").randomBytes(8).toString("hex"))')}"
KEEP_IMAGE="${KEEP_IMAGE:-0}"
NATIVE_RELEASE_KIND="${NATIVE_RELEASE_KIND:-patch}"
NATIVE_BUILD_REPORT_SHA256="${NATIVE_BUILD_REPORT_SHA256:-none}"
ARTIFACTS_BLOB_URL="${AURA3D_ARTIFACTS_BLOB_URL:-}"
ACR_IDENTITY_TASK="${AURA3D_ACR_IDENTITY_TASK:-}"
[[ "$RUN_ID" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$ ]] || { echo 'invalid RUN_ID' >&2; exit 2; }
[[ "$IMAGE_REPO" =~ ^[a-z0-9][a-z0-9._/-]*$ ]] || { echo 'invalid image repository' >&2; exit 2; }
[[ "$ACR_NAME" =~ ^[a-zA-Z0-9]+$ && "$ACR_RG" =~ ^[a-zA-Z0-9._-]+$ ]] || { echo 'invalid registry selection' >&2; exit 2; }
[[ "$ACR_IDENTITY_TASK" =~ ^[a-zA-Z0-9_-]+$ ]] || { echo 'AURA3D_ACR_IDENTITY_TASK must name an existing identity-enabled ACR task' >&2; exit 2; }
[[ "$ARTIFACTS_BLOB_URL" =~ ^https://[a-z0-9]+\.blob\.core\.windows\.net/[a-z0-9][a-z0-9-]+$ ]] || { echo 'AURA3D_ARTIFACTS_BLOB_URL must name a credential-free Azure Blob container URL' >&2; exit 2; }
case "$NATIVE_RELEASE_KIND" in patch|minor|major) ;; *) echo 'invalid NATIVE_RELEASE_KIND' >&2; exit 2 ;; esac
case "$NATIVE_SOURCE_PHASE" in prepare|resume) ;; *) echo 'invalid NATIVE_SOURCE_PHASE' >&2; exit 2 ;; esac
if [ "$NATIVE_SOURCE_PHASE" = resume ]; then
  [[ "$NATIVE_BUILD_REPORT_SHA256" =~ ^[a-f0-9]{64}$ ]] || { echo 'resume requires the separately retained build report SHA-256' >&2; exit 2; }
elif [ "$NATIVE_BUILD_REPORT_SHA256" != none ]; then
  echo 'build report SHA-256 is only valid for resume' >&2; exit 2
fi
case "$KEEP_IMAGE" in 0|1) ;; *) echo 'invalid KEEP_IMAGE' >&2; exit 2 ;; esac
# Both phases require a separately admitted workspace graph, independently
# signed source approval and verified store. Those can be inspected in-process,
# but no authenticated package-manager custody, sealed network/process
# isolation or durable post-install custody exists. Refuse before staging or
# provider calls rather than using a signature, receipt or --offline as an
# execution permit.
node tools/remote-acr/source-checks.mjs workspace-admission
OUT_DIR="tests/reports/remote-acr/$RUN_ID/$NATIVE_SOURCE_PHASE"
if [ -e "$OUT_DIR" ]; then echo "source phase already exists: $RUN_ID/$NATIVE_SOURCE_PHASE" >&2; exit 2; fi
mkdir -p "$OUT_DIR"
TEMP_ROOT="$(mktemp -d "${TMPDIR:-/tmp}/aura3d-source.XXXXXX")"
CTX="$TEMP_ROOT/context"
IMAGE_TAG="run-$RUN_ID-$NATIVE_SOURCE_PHASE"
IMAGE_CREATED=0
cleanup() {
  local status=$?
  trap - EXIT INT TERM
  rm -rf "$TEMP_ROOT"
  if [ "$IMAGE_CREATED" = 1 ] && [ "$KEEP_IMAGE" = 0 ]; then
    if ! "$AZ_WRAPPER" acr repository delete -n "$ACR_NAME" --image "$IMAGE_REPO:$IMAGE_TAG" --yes -o none; then
      echo "image cleanup failed: $IMAGE_REPO:$IMAGE_TAG" >&2
      status=1
    fi
  fi
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

# No provider command is reached for incomplete source/fixtures, an unsafe
# lockfile, changed input bytes, or any unsupported invocation.
node tools/remote-acr/source-checks.mjs stage "$CTX"
(cd "$CTX" && node tools/remote-acr/source-checks.mjs independence)
if [ "$NATIVE_SOURCE_PHASE" = resume ]; then
  node tools/remote-acr/source-checks.mjs stage-resume "$CTX" "$RUN_ID" "$NATIVE_RELEASE_KIND" "$NATIVE_BUILD_REPORT_SHA256"
fi
cp "$CTX/.native-source-manifest.json" "$OUT_DIR/source-manifest.json"

SUB="$("$AZ_WRAPPER" account show --query id -o tsv)"
TENANT="$("$AZ_WRAPPER" account show --query tenantId -o tsv)"
if [ "$SUB" != "$EXPECTED_SUB" ] || [ "$TENANT" != "$EXPECTED_TENANT" ]; then
  echo 'Azure subscription or tenant does not match the authorized source runner' >&2; exit 2
fi
LOGIN_SERVER="$("$AZ_WRAPPER" acr show -n "$ACR_NAME" -g "$ACR_RG" --query loginServer -o tsv)"
[[ "$LOGIN_SERVER" =~ ^[a-zA-Z0-9.-]+\.azurecr\.io$ ]] || { echo 'invalid registry login server' >&2; exit 2; }
TASK_IDENTITY="$("$AZ_WRAPPER" acr task show -n "$ACR_IDENTITY_TASK" -r "$ACR_NAME" -g "$ACR_RG" --query identity -o json)"
TASK_IDENTITY="$TASK_IDENTITY" node -e '
  const identity = JSON.parse(process.env.TASK_IDENTITY || "null");
  if (!identity || (!identity.principalId && !Object.keys(identity.userAssignedIdentities || {}).length)) {
    console.error("existing ACR task has no managed identity"); process.exit(1);
  }
' 
# Do not overwrite any existing image tag, including one from another host.
"$AZ_WRAPPER" acr repository list -n "$ACR_NAME" -o tsv > "$TEMP_ROOT/repositories"
if awk -v repo="$IMAGE_REPO" '$0 == repo {found=1} END {exit !found}' "$TEMP_ROOT/repositories"; then
  "$AZ_WRAPPER" acr repository show-tags -n "$ACR_NAME" --repository "$IMAGE_REPO" -o tsv > "$TEMP_ROOT/tags"
  if awk -v tag="$IMAGE_TAG" '$0 == tag {found=1} END {exit !found}' "$TEMP_ROOT/tags"; then
    echo "source image tag already exists: $IMAGE_REPO:$IMAGE_TAG" >&2; exit 2
  fi
fi

# ACR build is serverless and uses no standing pool. The image is deleted by
# the trap on normal, failed and interrupted runs unless explicitly retained.
IMAGE_CREATED=1
if ! "$AZ_WRAPPER" acr build -r "$ACR_NAME" -g "$ACR_RG" -t "$IMAGE_REPO:$IMAGE_TAG" \
  --build-arg "NATIVE_RUN_ID=$RUN_ID" --build-arg "NATIVE_SOURCE_PHASE=$NATIVE_SOURCE_PHASE" \
  --build-arg "NATIVE_RELEASE_KIND=$NATIVE_RELEASE_KIND" --build-arg "NATIVE_BUILD_REPORT_SHA256=$NATIVE_BUILD_REPORT_SHA256" \
  -f tools/remote-acr/Dockerfile.source "$CTX" 2>&1 | tee "$OUT_DIR/acr-build.log"; then
  echo 'source image build failed' >&2; exit 3
fi
DIGEST="$("$AZ_WRAPPER" acr repository show -n "$ACR_NAME" --image "$IMAGE_REPO:$IMAGE_TAG" --query digest -o tsv)"
[[ "$DIGEST" =~ ^sha256:[0-9a-f]{64}$ ]] || { echo 'registry did not return an immutable image digest' >&2; exit 3; }

set +e
"$AZ_WRAPPER" acr task run -n "$ACR_IDENTITY_TASK" -r "$ACR_NAME" -g "$ACR_RG" --context "$CTX" --file tools/remote-acr/task.source.yaml \
  --set "LOGIN_SERVER=$LOGIN_SERVER" --set "IMAGE=$IMAGE_REPO@$DIGEST" \
  --set "RUN_ID=$RUN_ID" --set "RELEASE_KIND=$NATIVE_RELEASE_KIND" --set "SOURCE_PHASE=$NATIVE_SOURCE_PHASE" \
  --set "BUILD_REPORT_SHA256=$NATIVE_BUILD_REPORT_SHA256" \
  --set "ARTIFACTS_BLOB_URL=$ARTIFACTS_BLOB_URL" 2>&1 | tee "$OUT_DIR/acr-run.log"
RUN_RC=${PIPESTATUS[0]}
set -e
# A successful infrastructure command is insufficient: both task and upload
# must emit one explicit zero status. Keep test and transport exits distinct.
RESULT=0
node tools/remote-acr/source-checks.mjs evaluate-result "$OUT_DIR/acr-run.log" "$RUN_RC" "$OUT_DIR/summary.json" "$RUN_ID" "$DIGEST" || RESULT=1
UPLOAD_EXIT="$(node -e 'const s=require("./"+process.argv[1]); process.stdout.write(String(s.artifactUploadExit ?? "missing"))' "$OUT_DIR/summary.json")"
if [ "$UPLOAD_EXIT" = 0 ]; then
  # The service identity performed the upload; the already-authenticated local
  # governed CLI retrieves the immutable prefix. Credentials never enter argv.
  ACCOUNT_NAME="${ARTIFACTS_BLOB_URL#https://}"
  ACCOUNT_NAME="${ACCOUNT_NAME%%.*}"
  CONTAINER_NAME="${ARTIFACTS_BLOB_URL##*/}"
  mkdir -p "$TEMP_ROOT/retrieved"
  if ! "$AZ_WRAPPER" storage blob download-batch --account-name "$ACCOUNT_NAME" --auth-mode login \
    --source "$CONTAINER_NAME" --destination "$TEMP_ROOT/retrieved" --pattern "$RUN_ID/$NATIVE_SOURCE_PHASE/*" \
    --no-progress -o none > "$OUT_DIR/artifact-download.log" 2>&1; then
    echo "artifact download failed; see $OUT_DIR/artifact-download.log" >&2; RESULT=1
  elif [ "$NATIVE_SOURCE_PHASE" = prepare ] && ! node tools/remote-acr/source-checks.mjs materialize-build "$TEMP_ROOT/retrieved" "$RUN_ID" "$NATIVE_RELEASE_KIND"; then
    echo 'build handoff verification or retention failed' >&2; RESULT=1
  elif [ "$NATIVE_SOURCE_PHASE" = resume ] && ! node tools/remote-acr/source-checks.mjs materialize "$TEMP_ROOT/retrieved" "$RUN_ID" resume; then
    echo 'artifact verification or retention failed' >&2; RESULT=1
  fi
fi
if [ "$RESULT" != 0 ]; then
  echo "source job failed, did not report a result, or could not retain evidence; see $OUT_DIR/summary.json" >&2
  exit 1
fi
if [ "$NATIVE_SOURCE_PHASE" = prepare ]; then
  printf 'Source build preparation passed and retained its candidate: %s (remaining source checks have not run)\n' "$RUN_ID"
else
  printf 'Source job passed with retained artifacts: %s\n' "$RUN_ID"
fi
