#!/usr/bin/env bash
# Remote-execute aura3d Playwright/browser specs on serverless Azure ACR
# Tasks (policy: no local Docker, no GitHub Actions, no standing runners,
# no --agent-pool). Reuses existing infra by default:
#   registry: picassostagingacr (Basic, eastus2, PICASSO-STAGING-RG)
#   egress:   aidprogsnap1009gch (StorageV2, eastus2, aid-programs-store-rg)
#
# Flow: stage a minimal build context -> `az acr build` the
# tools/remote-acr/Dockerfile.playwright image -> `az acr run` the task yaml
# (specs + artifact SAS injected) -> download artifacts + save logs under
# tests/reports/remote-acr/<RUN_ID>/.
#
# Usage:
#   tools/remote-acr/run.sh                 # default parity spec trio
#   SPECS="tests/browser/parity-*.spec.ts" AURA3D_REPORTER="line,json" \
#     tools/remote-acr/run.sh
#   BUILD=0 IMAGE_TAG=run-<id> tools/remote-acr/run.sh   # reuse built image
#
# Env knobs (all optional):
#   AZ_WRAPPER         azure CLI wrapper          (az-auraone-gurbaksh)
#   EXPECTED_SUB       subscription guard         (9b7da706-63ce-4740-8c03-3b77cbe1b7d0)
#   ACR_NAME/ACR_RG    registry                   (picassostagingacr / PICASSO-STAGING-RG)
#   IMAGE_REPO         repo inside the registry   (aura3d-playwright)
#   STORAGE_ACCOUNT/RG blob account               (aidprogsnap1009gch / aid-programs-store-rg)
#   BLOB_CONTAINER     blob container             (aura3d-remote-acr)
#   RUN_ID             run stamp                  (utc timestamp)
#   SPECS              specs for playwright       (three parity specs)
#   AURA3D_REPORTER    playwright --reporter      (line)
#   BUILD              1=az acr build, 0=skip     (1)
#   SKIP_UPLOAD        1 to disable blob egress   (0)
#   KEEP_IMAGE         1 keeps the pushed tag     (1)
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

AZ_WRAPPER="${AZ_WRAPPER:-az-auraone-gurbaksh}"
EXPECTED_SUB="${EXPECTED_SUB:-9b7da706-63ce-4740-8c03-3b77cbe1b7d0}"
ACR_NAME="${ACR_NAME:-picassostagingacr}"
ACR_RG="${ACR_RG:-PICASSO-STAGING-RG}"
IMAGE_REPO="${IMAGE_REPO:-aura3d-playwright}"
STORAGE_ACCOUNT="${STORAGE_ACCOUNT:-aidprogsnap1009gch}"
STORAGE_RG="${STORAGE_RG:-aid-programs-store-rg}"
BLOB_CONTAINER="${BLOB_CONTAINER:-aura3d-remote-acr}"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)}"
SPECS="${SPECS:-tests/browser/parity-shader.spec.ts tests/browser/parity-post.spec.ts tests/browser/parity-texture.spec.ts}"
AURA3D_REPORTER="${AURA3D_REPORTER:-line}"
BUILD="${BUILD:-1}"
SKIP_UPLOAD="${SKIP_UPLOAD:-0}"
KEEP_IMAGE="${KEEP_IMAGE:-1}"

IMAGE_TAG="${IMAGE_TAG:-run-${RUN_ID}}"
OUT_DIR="tests/reports/remote-acr/${RUN_ID}"
mkdir -p "$OUT_DIR"

echo "== remote-acr run ${RUN_ID}"
echo "   az wrapper : ${AZ_WRAPPER}"
echo "   acr        : ${ACR_NAME} (${ACR_RG})  image=${IMAGE_REPO}:${IMAGE_TAG}"
echo "   storage    : ${STORAGE_ACCOUNT}/${BLOB_CONTAINER}  skip_upload=${SKIP_UPLOAD}"
echo "   specs      : ${SPECS}"
echo "   reporter   : ${AURA3D_REPORTER}"
echo "   out dir    : ${OUT_DIR}"

# ---- 0. Auth + subscription guard (never bare az; never login) -------------
SUB="$("$AZ_WRAPPER" account show --query id -o tsv 2>/dev/null || true)"
if [ "$SUB" != "$EXPECTED_SUB" ]; then
  echo "FATAL: ${AZ_WRAPPER} account is '${SUB:-<none>}', expected ${EXPECTED_SUB}." >&2
  exit 2
fi
TENANT="$("$AZ_WRAPPER" account show --query tenantId -o tsv)"
echo "   verified   : sub=${SUB} tenant=${TENANT}"

LOGIN_SERVER="$("$AZ_WRAPPER" acr show -n "$ACR_NAME" -g "$ACR_RG" --query loginServer -o tsv)"
echo "   loginServer: ${LOGIN_SERVER}"

# ---- 1. Stage build context -------------------------------------------------
# The full repo is ~8GB+ (node_modules, 4.9G tests/, 1.4G public/, evidence);
# ACR build contexts must be lean. The image only needs the workspace
# (manifests + src + dist for unmapped export fallbacks), the browser tests,
# support files, examples, and the naming-taxonomy tool the dev server
# imports. Hermeticity: `pnpm install --frozen-lockfile` runs in-image, so
# local node_modules is never shipped (its binaries are darwin anyway).
CTX="$(mktemp -d /tmp/aura3d-acr-ctx.XXXXXX)"
cleanup_ctx() { rm -rf "$CTX"; }
trap cleanup_ctx EXIT

echo "== staging context in ${CTX}"
rsync -a package.json pnpm-lock.yaml pnpm-workspace.yaml \
        playwright.config.ts tsconfig.base.json index.html favicon.svg "$CTX/"
rsync -a patches "$CTX/"
rsync -a --exclude '*/node_modules' \
        --exclude 'create-aura3d/templates' \
        --exclude 'create-aura3d/hdri' \
        packages "$CTX/"
rsync -a --exclude '*/node_modules' workers "$CTX/"
mkdir -p "$CTX/tests"
rsync -a tests/browser tests/support "$CTX/tests/"
rsync -a examples "$CTX/"
mkdir -p "$CTX/tools"
rsync -a tools/naming-taxonomy tools/remote-acr "$CTX/tools/"

du -sh "$CTX" | awk '{print "   context size: "$1}'

# ---- 2. Build image on ACR Tasks --------------------------------------------
if [ "$BUILD" = "1" ]; then
  echo "== az acr build ${IMAGE_REPO}:${IMAGE_TAG}"
  "$AZ_WRAPPER" acr build \
    -r "$ACR_NAME" -g "$ACR_RG" \
    -t "${IMAGE_REPO}:${IMAGE_TAG}" \
    -f tools/remote-acr/Dockerfile.playwright \
    "$CTX" 2>&1 | tee "${OUT_DIR}/acr-build.log" | tail -25
  if [ "${PIPESTATUS[0]}" -ne 0 ]; then
    echo "FATAL: az acr build failed — full log at ${OUT_DIR}/acr-build.log" >&2
    exit 3
  fi
  echo "   build ok (log: ${OUT_DIR}/acr-build.log)"
else
  echo "== BUILD=0, reusing ${IMAGE_REPO}:${IMAGE_TAG}"
fi

# ---- 3. Artifact egress: container + short-lived SAS ------------------------
SAS_URL=""
if [ "$SKIP_UPLOAD" != "1" ]; then
  echo "== preparing blob egress ${STORAGE_ACCOUNT}/${BLOB_CONTAINER}"
  ACCOUNT_KEY="$("$AZ_WRAPPER" storage account keys list \
    -n "$STORAGE_ACCOUNT" -g "$STORAGE_RG" --query '[0].value' -o tsv)"
  "$AZ_WRAPPER" storage container create \
    --name "$BLOB_CONTAINER" --account-name "$STORAGE_ACCOUNT" \
    --account-key "$ACCOUNT_KEY" -o none --only-show-errors 2>/dev/null || true
  SAS_EXPIRY="$(date -u -v+6H +%Y-%m-%dT%H:%MZ 2>/dev/null || date -u -d '+6 hours' +%Y-%m-%dT%H:%MZ)"
  SAS_TOKEN="$("$AZ_WRAPPER" storage container generate-sas \
    --name "$BLOB_CONTAINER" --account-name "$STORAGE_ACCOUNT" \
    --account-key "$ACCOUNT_KEY" \
    --permissions racwdl --expiry "$SAS_EXPIRY" -o tsv)"
  SAS_URL="https://${STORAGE_ACCOUNT}.blob.core.windows.net/${BLOB_CONTAINER}?${SAS_TOKEN}"
  echo "   sas ready (expiry ${SAS_EXPIRY}, perms racwdl)"
else
  echo "== SKIP_UPLOAD=1; artifacts stay in the acr log only"
fi

# ---- 4. Run the task ----------------------------------------------------------
echo "== az acr run"
RUN_RC=0
set +e
"$AZ_WRAPPER" acr run -r "$ACR_NAME" -g "$ACR_RG" \
  -f tools/remote-acr/task.playwright.yaml /dev/null \
  --set "LOGIN_SERVER=${LOGIN_SERVER}" \
  --set "IMAGE=${IMAGE_REPO}:${IMAGE_TAG}" \
  --set "RUN_ID=${RUN_ID}" \
  --set "SPECS_CSV=$(echo ${SPECS} | tr ' ' ',')" \
  --set "REPORTER=${AURA3D_REPORTER}" \
  ${SAS_URL:+--set-secret "AURA3D_ARTIFACTS_SAS=${SAS_URL}"} \
  2>&1 | tee "${OUT_DIR}/acr-run.log"
RUN_RC=${PIPESTATUS[0]}
set -e
echo "   acr run exit: ${RUN_RC} (log: ${OUT_DIR}/acr-run.log)"

# ---- 5. Pull artifacts back ---------------------------------------------------
if [ -n "$SAS_URL" ]; then
  echo "== downloading artifacts -> ${OUT_DIR}/artifacts"
  mkdir -p "${OUT_DIR}/artifacts"
  "$AZ_WRAPPER" storage blob download-batch \
    --source "$BLOB_CONTAINER" \
    --destination "${OUT_DIR}/artifacts" \
    --pattern "${RUN_ID}/*" \
    --account-name "$STORAGE_ACCOUNT" --account-key "$ACCOUNT_KEY" \
    -o none --only-show-errors 2>/dev/null \
    || echo "   (no artifacts downloaded)"
fi

# ---- 6. Optional image cleanup (ephemeral-by-default spirit) -------------------
if [ "$KEEP_IMAGE" != "1" ]; then
  echo "== KEEP_IMAGE=0: deleting ${IMAGE_REPO}:${IMAGE_TAG}"
  "$AZ_WRAPPER" acr repository delete -n "$ACR_NAME" \
    --image "${IMAGE_REPO}:${IMAGE_TAG}" --yes -o none || true
fi

# ---- 7. Summary --------------------------------------------------------------
PW_EXIT="$(grep -o 'PLAYWRIGHT_EXIT=[0-9]*' "${OUT_DIR}/acr-run.log" | tail -1 | cut -d= -f2 || true)"
RUN_ID="$RUN_ID" EXPECTED_SUB="$EXPECTED_SUB" ACR_NAME="$ACR_NAME" \
  IMAGE_REPO="$IMAGE_REPO" IMAGE_TAG="$IMAGE_TAG" LOGIN_SERVER="$LOGIN_SERVER" \
  STORAGE_ACCOUNT="$STORAGE_ACCOUNT" BLOB_CONTAINER="$BLOB_CONTAINER" \
  SPECS="$SPECS" AURA3D_REPORTER="$AURA3D_REPORTER" RUN_RC="$RUN_RC" \
  PW_EXIT="$PW_EXIT" SUMMARY_PATH="${OUT_DIR}/summary.json" \
node -e '
  const fs = require("fs");
  const summary = {
    runId: process.env.RUN_ID,
    finishedUtc: new Date().toISOString(),
    azure: {
      subscription: process.env.EXPECTED_SUB,
      acr: process.env.ACR_NAME,
      image: `${process.env.IMAGE_REPO}:${process.env.IMAGE_TAG}`,
      loginServer: process.env.LOGIN_SERVER,
      storage: `${process.env.STORAGE_ACCOUNT}/${process.env.BLOB_CONTAINER}`
    },
    specs: process.env.SPECS.split(/\s+/),
    reporter: process.env.AURA3D_REPORTER,
    acrRunExitCode: Number(process.env.RUN_RC),
    playwrightExit: process.env.PW_EXIT === "" ? null : Number(process.env.PW_EXIT),
    logs: { build: "acr-build.log", run: "acr-run.log" },
    artifactsDir: "artifacts"
  };
  fs.writeFileSync(process.env.SUMMARY_PATH, JSON.stringify(summary, null, 2) + "\n");
' 2>/dev/null || true

echo
echo "== DONE run=${RUN_ID} acr_rc=${RUN_RC} playwright_exit=${PW_EXIT:-unknown}"
echo "   evidence: ${OUT_DIR}/ (acr-run.log, acr-build.log, summary.json, artifacts/)"
exit "$RUN_RC"
