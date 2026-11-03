#!/usr/bin/env bash
# Remote-execute aura3d Playwright/browser specs on serverless Azure ACR
# Tasks (policy: no local Docker, no GitHub Actions, no standing runners,
# no --agent-pool). Reuses existing infra by default:
#   registry: picassostagingacr (Basic, eastus2, PICASSO-STAGING-RG)
#
# Flow: stage a minimal build context -> `az acr build` the
# tools/remote-acr/Dockerfile.playwright image -> `az acr run` the task yaml
# -> save logs under tests/reports/remote-acr/<RUN_ID>/.
#
# Native acceptance uses a preauthorized managed identity and a nonsecret
# AURA3D_ARTIFACTS_BLOB_URL. The task fails closed if its identity cannot
# obtain a token; no tokens, SAS URLs or credentials are sent in CLI args.
# Without an identity-enabled task, AURA3D_ARTIFACT_TRANSPORT=legacy-sas uses
# the 4.x container-SAS path instead (tools/remote-acr/sas-transport.sh): the
# same gate and candidate checks run first, the SAS is minted once (<= 2 h,
# rcwl) and reaches the task only through a --values file in the run context.
# 5.0 sharded acceptance: tools/remote-acr/run-acceptance5.sh.
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
#   RUN_ID             run stamp                  (utc timestamp)
#   SPECS              specs for playwright       (three parity specs)
#   AURA3D_REPORTER    playwright --reporter      (line)
#   BUILD              1=az acr build, 0=skip     (1)
#   KEEP_IMAGE         1 keeps the pushed tag     (native default 0, legacy 1)
#   AURA3D_CODE_COMPLETE_GATE   required for native acceptance
#   AURA3D_ACCEPTANCE_KIND      browser|historical-evidence|historical-replay|external-codec-fixtures
#   AURA3D_HISTORICAL_INPUTS    candidate-bound input manifest for historical mode
#   AURA3D_EXTERNAL_CODEC_LOCK  run-scoped independently proven fixture closure
#   AURA3D_EXTERNAL_CODEC_NPM_INPUTS  run-scoped offline npm archive inventory
#   AURA3D_BROWSER_PROJECT      native browser project (chromium-automation)
#   AURA3D_ARTIFACTS_BLOB_URL   preauthorized Azure Blob container URL
#   AURA3D_ACR_IDENTITY_TASK    existing identity-enabled ACR Task name
#   AURA3D_ARTIFACTS_CLIENT_ID  optional managed-identity client UUID
#   AURA3D_ARTIFACT_TRANSPORT   managed-identity (default) | legacy-sas (browser kind, no identity task)
#   CONTEXT_PROFILE    slim|full                  (slim) slim omits public/aura-assets
#                      (~1.4GB of showcase GLBs) and the environment-corpus /
#                      asset-corpus / advanced-gallery fixture trees (~380MB); the
#                      parity/port specs do not load them. Use full for specs that do.
#   EXTRA_DIRS         space-separated repo-relative dirs to add to the context (e.g. apps/showcase-foo).
#                      apps/common and apps/showcase-port-shared are always staged (every showcase app imports them).
#   PUBLIC_ASSETS      space-separated paths under public/aura-assets to include even in the slim
#                      profile; subpaths keep their folders (Textures/x.png), and a directory is copied whole
#   SPECS must not contain shell metacharacters (| ( ) ; & < > ` $): the ACR step runs it through /bin/sh.
set -euo pipefail
if [ "${AURA3D_SOURCE_PROCESS_GUARD:-0}" = 1 ]; then
  echo "FATAL: browser runner is forbidden within a source-phase process." >&2
  exit 2
fi

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$REPO_ROOT"

AZ_WRAPPER="${AZ_WRAPPER:-az-auraone-gurbaksh}"
EXPECTED_SUB="${EXPECTED_SUB:-9b7da706-63ce-4740-8c03-3b77cbe1b7d0}"
EXPECTED_TENANT="${EXPECTED_TENANT:-8aa8a205-1f60-42a0-a546-03e2bda76637}"
ACR_NAME="${ACR_NAME:-picassostagingacr}"
ACR_RG="${ACR_RG:-PICASSO-STAGING-RG}"
IMAGE_REPO="${IMAGE_REPO:-aura3d-playwright}"
RUN_ID="${RUN_ID:-$(date -u +%Y%m%dT%H%M%SZ)-$$}"
AURA3D_ACCEPTANCE_KIND="${AURA3D_ACCEPTANCE_KIND:-browser}"
case "$AURA3D_ACCEPTANCE_KIND" in browser|historical-evidence|historical-replay|external-codec-fixtures) ;; *) echo "FATAL: invalid acceptance kind." >&2; exit 2;; esac
if [ "$AURA3D_ACCEPTANCE_KIND" = historical-evidence ]; then
  [ -z "${SPECS+x}" ] || { echo "FATAL: historical acceptance uses a fixed test inventory." >&2; exit 2; }
  SPECS='tests/unit/tools/developer-value.test.ts tests/unit/tools/honest-public-claims.test.ts tests/unit/tools/release-metrics-rollup.test.ts'
elif [ "$AURA3D_ACCEPTANCE_KIND" = historical-replay ]; then
  [ -z "${SPECS+x}" ] || { echo "FATAL: historical replay uses a fixed test inventory." >&2; exit 2; }
  SPECS='tests/unit/aura-slam/replay.test.ts'
elif [ "$AURA3D_ACCEPTANCE_KIND" = external-codec-fixtures ]; then
  [ -z "${SPECS+x}" ] || { echo "FATAL: external codec acceptance uses a fixed test inventory." >&2; exit 2; }
  SPECS='tests/acceptance/gltf-external-decoder-fixtures.test.ts'
else
  SPECS="${SPECS:-tests/browser/parity-shader.spec.ts tests/browser/parity-post.spec.ts tests/browser/parity-texture.spec.ts}"
fi
AURA3D_REPORTER="${AURA3D_REPORTER:-}"
AURA3D_BROWSER_PROJECT="${AURA3D_BROWSER_PROJECT:-}"
AURA3D_NATIVE_ACCEPTANCE="${AURA3D_NATIVE_ACCEPTANCE:-0}"
[ "$AURA3D_ACCEPTANCE_KIND" = browser ] || AURA3D_NATIVE_ACCEPTANCE=1
AURA3D_CODE_COMPLETE_GATE="${AURA3D_CODE_COMPLETE_GATE:-}"
AURA3D_HISTORICAL_INPUTS="${AURA3D_HISTORICAL_INPUTS:-}"
AURA3D_EXTERNAL_CODEC_LOCK="${AURA3D_EXTERNAL_CODEC_LOCK:-}"
AURA3D_EXTERNAL_CODEC_NPM_INPUTS="${AURA3D_EXTERNAL_CODEC_NPM_INPUTS:-}"
AURA3D_ARTIFACTS_BLOB_URL="${AURA3D_ARTIFACTS_BLOB_URL:-}"
AURA3D_ACR_IDENTITY_TASK="${AURA3D_ACR_IDENTITY_TASK:-}"
AURA3D_ARTIFACT_TRANSPORT="${AURA3D_ARTIFACT_TRANSPORT:-managed-identity}"
case "$AURA3D_ARTIFACT_TRANSPORT" in managed-identity|legacy-sas) ;; *) echo "FATAL: invalid artifact transport." >&2; exit 2;; esac
ACR_TIMEOUT_ARGS=()
BUILD="${BUILD:-1}"
KEEP_IMAGE="${KEEP_IMAGE:-}"
CONTEXT_PROFILE="${CONTEXT_PROFILE:-slim}"
PUBLIC_ASSETS="${PUBLIC_ASSETS:-}"

case "$SPECS" in
  *[\|\(\)\;\&\<\>\`\$]*)
    echo "SPECS contains a shell metacharacter (| ( ) ; & < > \` \$); the ACR step would run it through /bin/sh. Use a plain --grep tag such as @g3." >&2
    exit 2 ;;
esac

# The documented native commands identify themselves by their specs, project,
# gate or run ID. An explicit flag also covers new groups before naming settles.
case "${AURA3D_NATIVE_ACCEPTANCE}:${RUN_ID}:${SPECS}:${AURA3D_BROWSER_PROJECT}:${AURA3D_CODE_COMPLETE_GATE}" in
  1:*|*:native-*|*native-*.spec.ts*|*:*:*:*?*:*|*:*:*:*:*?*) AURA3D_NATIVE_ACCEPTANCE=1 ;;
esac
# An opaque selector can discover native tests without spelling their names.
# Keep explicit legacy paths and their historic glob/tag selectors available;
# anything that might select a native spec is subject to the global gate.
if [ "$AURA3D_NATIVE_ACCEPTANCE" != 1 ]; then
  LEGACY_SPEC_COUNT=0
  for selector in $SPECS; do
    case "$selector" in */native-*|tests/browser/resource-soak-u1.spec.ts) AURA3D_NATIVE_ACCEPTANCE=1;; esac
    case "$selector" in
      @headed-xvfb|--grep|--grep=*|@g[0-9]*) continue;;
      tests/browser/*.spec.ts|tests/visual/*.spec.ts|tests/browser/*.spec.ts:[0-9]*|tests/visual/*.spec.ts:[0-9]*)
        LEGACY_SPEC_COUNT=$((LEGACY_SPEC_COUNT + 1))
        case "$selector" in *'*'*|*'?'*|*'['*)
          # An unmatched pattern, broad pattern or native match is not a
          # proven legacy selection. Shell expansion happens only as data.
          for match in $selector; do
            case "$match" in *'*'*|*'?'*|*'['*|*/native-*) AURA3D_NATIVE_ACCEPTANCE=1;; esac
          done;;
        esac;;
      *) AURA3D_NATIVE_ACCEPTANCE=1;;
    esac
  done
  [ "$LEGACY_SPEC_COUNT" -gt 0 ] || AURA3D_NATIVE_ACCEPTANCE=1
fi
if [ -z "$KEEP_IMAGE" ]; then
  if [ "$AURA3D_NATIVE_ACCEPTANCE" = 1 ]; then KEEP_IMAGE=0; else KEEP_IMAGE=1; fi
fi

if [ "$AURA3D_NATIVE_ACCEPTANCE" = 1 ]; then
  [ "$EXPECTED_SUB" = 9b7da706-63ce-4740-8c03-3b77cbe1b7d0 ] && [ "$EXPECTED_TENANT" = 8aa8a205-1f60-42a0-a546-03e2bda76637 ] || { echo "FATAL: invalid native Azure context." >&2; exit 2; }
  case " $SPECS " in *' @headed-xvfb '*|*' --headed '*)
    echo "FATAL: headed selectors are not permitted for native acceptance." >&2; exit 2;; esac
  case "$SPECS" in *'*'*|*'?'*|*'['*) echo "FATAL: native spec paths must be exact." >&2; exit 2;; esac
  case "$RUN_ID" in ''|*[!a-zA-Z0-9_-]*) echo "FATAL: invalid native run ID." >&2; exit 2;; esac
  [ "${#RUN_ID}" -le 80 ] || { echo "FATAL: native run ID is too long." >&2; exit 2; }
  if [ "$AURA3D_ACCEPTANCE_KIND" != browser ]; then
    [ -z "$AURA3D_BROWSER_PROJECT" ] || { echo "FATAL: historical acceptance does not select a browser." >&2; exit 2; }
    AURA3D_BROWSER_PROJECT=none
    if [ "$AURA3D_ACCEPTANCE_KIND" = historical-evidence ]; then
      case "$AURA3D_HISTORICAL_INPUTS" in tests/reports/native-historical-inputs/*) ;; *) echo "FATAL: historical input manifest is required." >&2; exit 2;; esac
      case "$AURA3D_HISTORICAL_INPUTS" in *'..'*|*[!a-zA-Z0-9_./-]*) echo "FATAL: unsafe historical input path." >&2; exit 2;; esac
    elif [ "$AURA3D_ACCEPTANCE_KIND" = external-codec-fixtures ]; then
      [ -z "$AURA3D_HISTORICAL_INPUTS" ] || { echo "FATAL: codec mode does not use historical reports." >&2; exit 2; }
      for codec_input in "$AURA3D_EXTERNAL_CODEC_LOCK" "$AURA3D_EXTERNAL_CODEC_NPM_INPUTS"; do
        case "$codec_input" in "tests/reports/native-external-codec-inputs/${RUN_ID}/"*) ;; *) echo "FATAL: run-scoped codec inputs are required." >&2; exit 2;; esac
        case "$codec_input" in *'..'*|*[!a-zA-Z0-9_./-]*) echo "FATAL: unsafe codec input path." >&2; exit 2;; esac
      done
    else
      [ -z "$AURA3D_HISTORICAL_INPUTS" ] || { echo "FATAL: replay does not use measured-report inputs." >&2; exit 2; }
    fi
  else
    AURA3D_BROWSER_PROJECT="${AURA3D_BROWSER_PROJECT:-chromium-automation}"
    case "$AURA3D_BROWSER_PROJECT" in
      chromium-automation|firefox-automation|webkit-automation|chromium-gpu-headless|chromium-software|chromium-experimental) ;;
      *) echo "FATAL: unsupported native browser project: $AURA3D_BROWSER_PROJECT" >&2; exit 2;;
    esac
    for spec in $SPECS; do
      case "$spec" in
        tests/browser/*.spec.ts|tests/visual/*.spec.ts) ;;
        *) echo "FATAL: native SPECS must contain only exact browser spec paths." >&2; exit 2;;
      esac
      case "$spec" in *'*'*|*'?'*|*'['*) echo "FATAL: native spec paths must be exact." >&2; exit 2;; esac
      case "/$spec/" in *'/../'*|*'/./'*) echo "FATAL: invalid native spec path." >&2; exit 2;; esac
    done
  fi
  [ -n "$AURA3D_CODE_COMPLETE_GATE" ] || { echo "FATAL: native acceptance requires a code-complete gate." >&2; exit 2; }
  case "$AURA3D_CODE_COMPLETE_GATE" in /*|*'..'*|*[!a-zA-Z0-9_./-]*) echo "FATAL: gate path must be repository-relative." >&2; exit 2;; esac
  [ "$BUILD" = 1 ] || { echo "FATAL: native acceptance must build a fresh image from the validated candidate." >&2; exit 2; }
  AURA3D_REPORTER="${AURA3D_REPORTER:-line,json}"
  case ",$AURA3D_REPORTER," in *,json,*) ;; *) AURA3D_REPORTER="${AURA3D_REPORTER},json";; esac
  case "$AURA3D_REPORTER" in *[!a-z,]*) echo "FATAL: invalid reporter selector." >&2; exit 2;; esac
  # No provider process, image build, or job submission happens until the
  # complete global gate is verified against this checkout.
  node tools/native-capability-gate/index.mjs --phase acceptance --gate "$AURA3D_CODE_COMPLETE_GATE"
  if [ "$AURA3D_ACCEPTANCE_KIND" = historical-evidence ]; then
    node tools/remote-acr/historical-acceptance.mjs --phase preflight --gate "$AURA3D_CODE_COMPLETE_GATE" --inputs "$AURA3D_HISTORICAL_INPUTS"
  elif [ "$AURA3D_ACCEPTANCE_KIND" = historical-replay ]; then
    node tools/remote-acr/historical-acceptance.mjs --phase replay-preflight --gate "$AURA3D_CODE_COMPLETE_GATE"
  elif [ "$AURA3D_ACCEPTANCE_KIND" = external-codec-fixtures ]; then
    node tools/remote-acr/external-codec-run.mjs --phase preflight --gate "$AURA3D_CODE_COMPLETE_GATE" --lock "$AURA3D_EXTERNAL_CODEC_LOCK" --npm-inputs "$AURA3D_EXTERNAL_CODEC_NPM_INPUTS" --run-id "$RUN_ID"
  fi
  # ACR policy for native jobs: every build/run is bounded at 1800 s.
  ACR_TIMEOUT_ARGS=(--timeout 1800)
  if [ "$AURA3D_ARTIFACT_TRANSPORT" = legacy-sas ]; then
    [ "$AURA3D_ACCEPTANCE_KIND" = browser ] || { echo "FATAL: historical acceptance keeps the managed-identity transport." >&2; exit 2; }
    [ -z "$AURA3D_ACR_IDENTITY_TASK" ] && [ -z "$AURA3D_ARTIFACTS_BLOB_URL" ] && [ -z "${AURA3D_ARTIFACTS_CLIENT_ID:-}" ] \
      || { echo "FATAL: legacy-sas transport is only for runs without an identity task or managed-identity container." >&2; exit 2; }
  else
  [ -n "$AURA3D_ARTIFACTS_BLOB_URL" ] || { echo "FATAL: native acceptance needs an approved managed-identity artifact container." >&2; exit 2; }
  case "$AURA3D_ACR_IDENTITY_TASK" in ''|*[!a-zA-Z0-9_-]*) echo "FATAL: native acceptance requires an existing identity-enabled ACR task (or AURA3D_ARTIFACT_TRANSPORT=legacy-sas)." >&2; exit 2;; esac
  if [ -n "${AURA3D_ARTIFACTS_CLIENT_ID:-}" ]; then
    AURA3D_ARTIFACTS_CLIENT_ID="$AURA3D_ARTIFACTS_CLIENT_ID" node -e 'if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(process.env.AURA3D_ARTIFACTS_CLIENT_ID)) process.exit(1)'
  fi
  AURA3D_ARTIFACTS_BLOB_URL="$AURA3D_ARTIFACTS_BLOB_URL" node --input-type=module -e '
    import { parseBlobUrl } from "./tools/remote-acr/upload-artifacts.mjs";
    parseBlobUrl(process.env.AURA3D_ARTIFACTS_BLOB_URL);
  '
  fi
  A3D_RELEASE_PLAN="$(node -e '
    const fs = require("node:fs");
    const record = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const p = record.candidatePlan?.path;
    if (typeof p !== "string" || !p || p.startsWith("/") || p.split("/").includes("..") || /\s/.test(p)) process.exit(1);
    process.stdout.write(p);
  ' "$AURA3D_CODE_COMPLETE_GATE")" || { echo "FATAL: gate lacks a safe candidate plan path." >&2; exit 2; }
  REPORT_PATHS="$(node -e '
    const fs = require("node:fs");
    const record = JSON.parse(fs.readFileSync(process.argv[1], "utf8"));
    const fields = ["sourceConsumerReport", "matrixSourceReport", "examplesSourceReport"];
    const paths = fields.map(field => record[field]?.path);
    if (paths.some(p => typeof p !== "string" || !/^[a-zA-Z0-9_./-]+$/.test(p) || p.startsWith("/") || p.split("/").some(part => !part || part === "." || part === ".."))) process.exit(1);
    process.stdout.write(paths.join("\t"));
  ' "$AURA3D_CODE_COMPLETE_GATE")" || { echo "FATAL: gate lacks bound source consumer reports." >&2; exit 2; }
  IFS=$'\t' read -r NATIVE_CONSUMER_SOURCE_REPORT NATIVE_MATRIX_SOURCE_REPORT NATIVE_EXAMPLES_SOURCE_REPORT <<< "$REPORT_PATHS"
  NATIVE_NETWORK_REPORT="tests/reports/native-acceptance/${RUN_ID}/network.json"
  NATIVE_MEASUREMENT_REPORT="tests/reports/native-performance/${RUN_ID}/manifest.json"
  for val in "${NATIVE_PERF_DEVICE:-}" "${NATIVE_PERF_DRIVER:-}"; do
    [ "${#val}" -le 200 ] || { echo "FATAL: device or driver label too long." >&2; exit 2; }
  done
  NATIVE_PERF_DEVICE_B64="$(NATIVE_PERF_DEVICE="${NATIVE_PERF_DEVICE:-}" node -e 'const s=process.env.NATIVE_PERF_DEVICE; if(/[\x00-\x1f\x7f]/.test(s))process.exit(1); process.stdout.write(s ? Buffer.from(s).toString("base64url") : "none")')"
  NATIVE_PERF_DRIVER_B64="$(NATIVE_PERF_DRIVER="${NATIVE_PERF_DRIVER:-}" node -e 'const s=process.env.NATIVE_PERF_DRIVER; if(/[\x00-\x1f\x7f]/.test(s))process.exit(1); process.stdout.write(s ? Buffer.from(s).toString("base64url") : "none")')"
fi
AURA3D_REPORTER="${AURA3D_REPORTER:-line}"

if [ "$AURA3D_NATIVE_ACCEPTANCE" = 1 ]; then
  [ -z "${IMAGE_TAG:-}" ] || { echo "FATAL: native image tags must be unique per run." >&2; exit 2; }
  IMAGE_TAG="run-${RUN_ID}-$(node -e 'process.stdout.write(require("node:crypto").randomUUID())')"
else
  IMAGE_TAG="${IMAGE_TAG:-run-${RUN_ID}}"
fi
OUT_DIR="tests/reports/remote-acr/${RUN_ID}"
if [ "$AURA3D_NATIVE_ACCEPTANCE" = 1 ] && [ -e "$OUT_DIR" ]; then echo "FATAL: native run ID already exists: $RUN_ID" >&2; exit 2; fi
mkdir -p "$OUT_DIR"

echo "== remote-acr run ${RUN_ID}"
echo "   az wrapper : ${AZ_WRAPPER}"
echo "   acr        : ${ACR_NAME} (${ACR_RG})  image=${IMAGE_REPO}:${IMAGE_TAG}"
echo "   specs      : ${SPECS}"
echo "   context    : ${CONTEXT_PROFILE}"
echo "   reporter   : ${AURA3D_REPORTER}"
echo "   out dir    : ${OUT_DIR}"

# ---- 1. Stage build context -------------------------------------------------
# The full repo is ~8GB+ (node_modules, 4.9G tests/, 1.4G public/, evidence);
# ACR build contexts must be lean. The image only needs the workspace
# (manifests + src + dist for unmapped export fallbacks), the browser tests,
# support files, examples, and the naming-taxonomy tool the dev server
# imports. Hermeticity: `pnpm install --frozen-lockfile` runs in-image, so
# local node_modules is never shipped (its binaries are darwin anyway).
CTX="$(mktemp -d /tmp/aura3d-acr-ctx.XXXXXX)"
IMAGE_PUSH_ATTEMPTED=0
INPUTS_JSON=""
INPUTS_LIST=""
HISTORICAL_INPUTS_JSON=""
STAGING_RECORD=""
cleanup_ctx() {
  local saved_status=$?
  trap - EXIT
  if [ "$IMAGE_PUSH_ATTEMPTED" = 1 ] && [ "$KEEP_IMAGE" != 1 ]; then
    echo "== KEEP_IMAGE=0: deleting ${IMAGE_REPO}:${IMAGE_TAG}"
    if ! "$AZ_WRAPPER" acr repository delete -n "$ACR_NAME" --image "${IMAGE_REPO}:${IMAGE_TAG}" --yes -o none; then
      echo "FATAL: image cleanup could not be verified: ${IMAGE_REPO}:${IMAGE_TAG}" >&2
      saved_status=1
    fi
  fi
  rm -rf "$CTX"
  [ -z "${A3D_SAS_DIR:-}" ] || rm -rf "$A3D_SAS_DIR"
  [ -z "$INPUTS_JSON" ] || rm -f "$INPUTS_JSON"
  [ -z "$INPUTS_LIST" ] || rm -f "$INPUTS_LIST"
  [ -z "$HISTORICAL_INPUTS_JSON" ] || rm -f "$HISTORICAL_INPUTS_JSON"
  [ -z "$STAGING_RECORD" ] || rm -f "$STAGING_RECORD"
  exit "$saved_status"
}
trap cleanup_ctx EXIT
trap 'exit 130' INT
trap 'exit 143' TERM

echo "== staging context in ${CTX}"
if [ "$AURA3D_NATIVE_ACCEPTANCE" = 1 ]; then
  INPUTS_JSON="$(mktemp /tmp/aura3d-native-inputs.XXXXXX)"
  INPUTS_LIST="$(mktemp /tmp/aura3d-native-list.XXXXXX)"
  node tools/native-capability-gate/index.mjs --phase acceptance --gate "$AURA3D_CODE_COMPLETE_GATE" --list-inputs > "$INPUTS_JSON"
  if [ "$AURA3D_ACCEPTANCE_KIND" = historical-evidence ]; then
    HISTORICAL_INPUTS_JSON="$(mktemp /tmp/aura3d-historical-inputs.XXXXXX)"
    node tools/remote-acr/historical-acceptance.mjs --phase preflight --gate "$AURA3D_CODE_COMPLETE_GATE" --inputs "$AURA3D_HISTORICAL_INPUTS" --list-inputs > "$HISTORICAL_INPUTS_JSON"
  elif [ "$AURA3D_ACCEPTANCE_KIND" = external-codec-fixtures ]; then
    HISTORICAL_INPUTS_JSON="$(mktemp /tmp/aura3d-codec-inputs.XXXXXX)"
    node tools/remote-acr/external-codec-run.mjs --phase preflight --gate "$AURA3D_CODE_COMPLETE_GATE" --lock "$AURA3D_EXTERNAL_CODEC_LOCK" --npm-inputs "$AURA3D_EXTERNAL_CODEC_NPM_INPUTS" --run-id "$RUN_ID" --list-inputs > "$HISTORICAL_INPUTS_JSON"
  fi
  node - "$INPUTS_JSON" "$AURA3D_CODE_COMPLETE_GATE" "$HISTORICAL_INPUTS_JSON" > "$INPUTS_LIST" <<'NODE'
const fs = require('node:fs');
const path = require('node:path');
const root = fs.realpathSync('.');
const entries = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));
if (process.argv[4]) {
  const extra = JSON.parse(fs.readFileSync(process.argv[4], 'utf8'));
  if (!Array.isArray(extra) || !extra.length) throw new Error('Historical input inventory is empty');
  entries.push(...extra);
}
if (!Array.isArray(entries) || !entries.length) throw new Error('Gate did not enumerate candidate inputs');
for (const name of new Set([...entries, process.argv[3]])) {
  if (typeof name !== 'string' || !name || path.posix.isAbsolute(name) || name.includes('\\') ||
      name.split('/').some(part => !part || part === '.' || part === '..') || /[\x00-\x1f]/.test(name)) throw new Error('Unsafe staged input path');
  const absolute = path.resolve(name);
  const parent = fs.realpathSync(path.dirname(absolute));
  if (!absolute.startsWith(root + path.sep) || parent !== path.dirname(absolute)) throw new Error(`Invalid staged parent: ${name}`);
  const stat = fs.lstatSync(absolute);
  if (stat.isSymbolicLink()) {
    const target = fs.readlinkSync(absolute);
    const resolved = path.resolve(path.dirname(absolute), target);
    if (path.isAbsolute(target) || !resolved.startsWith(root + path.sep)) throw new Error(`Unsafe staged symlink: ${name}`);
  } else if (!stat.isFile()) throw new Error(`Invalid staged file: ${name}`);
  process.stdout.write(name + '\0');
}
NODE
  if [ "$AURA3D_ACCEPTANCE_KIND" = browser ]; then
    # The full checkout was validated above; leave out whole asset trees
    # (marketing, evidence, apps, docs, ...) that no selected spec or module it
    # imports references. The record makes the in-context and in-image gate
    # checks accept exactly those absences and nothing else.
    STAGING_RECORD="$(mktemp /tmp/aura3d-acceptance-staging.XXXXXX)"
    # shellcheck disable=SC2086 # SPECS is a validated list of exact paths.
    AURA3D_EXTRA_DIRS="${EXTRA_DIRS:-}" node tools/remote-acr/acceptance-staging.mjs select "$INPUTS_LIST" "$AURA3D_CODE_COMPLETE_GATE" "$STAGING_RECORD" $SPECS || exit 2
  fi
  rsync -a --from0 --files-from="$INPUTS_LIST" ./ "$CTX/"
  [ -z "$STAGING_RECORD" ] || cp "$STAGING_RECORD" "$CTX/.aura3d-acceptance-staging.json"
  # Missing specs, payload trees or promised inputs fail before any submission.
  # shellcheck disable=SC2086
  node tools/remote-acr/acceptance-staging.mjs verify-context "$CTX" "$INPUTS_LIST" $SPECS || exit 2
  # Independently validate the exact Git-free staging context before ACR sees it.
  (cd "$CTX" && node tools/native-capability-gate/index.mjs --phase acceptance --gate "$AURA3D_CODE_COMPLETE_GATE")
  if [ "$AURA3D_ACCEPTANCE_KIND" = historical-evidence ]; then
    (cd "$CTX" && node tools/remote-acr/historical-acceptance.mjs --phase preflight --gate "$AURA3D_CODE_COMPLETE_GATE" --inputs "$AURA3D_HISTORICAL_INPUTS")
  elif [ "$AURA3D_ACCEPTANCE_KIND" = historical-replay ]; then
    (cd "$CTX" && node tools/remote-acr/historical-acceptance.mjs --phase replay-preflight --gate "$AURA3D_CODE_COMPLETE_GATE")
  elif [ "$AURA3D_ACCEPTANCE_KIND" = external-codec-fixtures ]; then
    (cd "$CTX" && node tools/remote-acr/external-codec-run.mjs --phase preflight --gate "$AURA3D_CODE_COMPLETE_GATE" --lock "$AURA3D_EXTERNAL_CODEC_LOCK" --npm-inputs "$AURA3D_EXTERNAL_CODEC_NPM_INPUTS" --run-id "$RUN_ID")
  fi
else
rsync -a package.json pnpm-lock.yaml pnpm-workspace.yaml \
        playwright.config.ts tsconfig.base.json index.html favicon.svg \
        vite.config.ts vite.aliases.generated.ts tsconfig.paths.generated.json "$CTX/"
rsync -a patches "$CTX/"
# public/ mirrors at the origin root in the dev server (vite contract) —
# /aura-environments/*.manifest.json are lazily fetched by the engine.
if [ "$CONTEXT_PROFILE" = "full" ]; then
  rsync -a public "$CTX/"
else
  rsync -a --exclude 'aura-assets' public "$CTX/"
  mkdir -p "$CTX/public/aura-assets"
  # -R keeps subfolders (public/aura-assets/Textures/... stays under Textures/), so companion textures resolve.
  for asset in $PUBLIC_ASSETS; do (cd public/aura-assets && rsync -aR "$asset" "$CTX/public/aura-assets/"); done
fi
rsync -a --exclude '*/node_modules' \
        --exclude 'create-aura3d/templates' \
        --exclude 'create-aura3d/hdri' \
        packages "$CTX/"
# workers/ may be absent (the hosted-index worker was retired); the Dockerfile
# still COPYs the directory, so stage an empty one when there is nothing to copy.
mkdir -p "$CTX/workers" && touch "$CTX/workers/.keep"
if [ -d workers ]; then rsync -a --exclude '*/node_modules' workers "$CTX/"; fi
mkdir -p "$CTX/tests"
rsync -a tests/browser tests/support tests/fixtures "$CTX/tests/"
# Browser labs fetch fixture GLBs from the repo-root `fixtures/` tree
# (`/fixtures/threejs-parity/assets/...`), served by the example dev server.
if [ "$CONTEXT_PROFILE" = "full" ]; then
  rsync -a fixtures "$CTX/"
else
  rsync -a --exclude 'environment-corpus' --exclude 'asset-corpus' --exclude 'advanced-gallery' fixtures "$CTX/"
fi
rsync -a examples "$CTX/"
# EXTRA_DIRS: space-separated repo-relative dirs (e.g. apps/showcase-foo) the spec serves through the dev server.
mkdir -p "$CTX/apps"
rsync -a src "$CTX/"
rsync -aR assets/packs "$CTX/"
# Shared by every showcase app (fonts.css, quickbar.css): without them HUD fonts 404 and the quick bar is unstyled.
for shared in apps/common apps/showcase-port-shared; do [ -d "$shared" ] && rsync -aR --exclude node_modules --exclude dist "$shared" "$CTX/"; done
for extra in ${EXTRA_DIRS:-}; do rsync -aR --exclude node_modules --exclude dist "$extra" "$CTX/"; done
mkdir -p "$CTX/tools"
# Whole tools/ tree (about 11 MB), matching the Dockerfile's `COPY tools/`: the visual specs import many tool modules.
rsync -a --exclude node_modules --exclude dist --exclude _stage tools "$CTX/"
# The Dockerfile COPYs evidence/exposure-parity/wp6 unconditionally: tests/browser/exposure-cases.spec.ts checks every run against the recorded rows there.
mkdir -p "$CTX/evidence/exposure-parity/wp6"
[ -d evidence/exposure-parity/wp6 ] && rsync -a evidence/exposure-parity/wp6/ "$CTX/evidence/exposure-parity/wp6/"

fi

du -sh "$CTX" | awk '{print "   context size: "$1}'

# ---- 0. Auth + subscription guard (never bare az; never login) -------------
SUB="$("$AZ_WRAPPER" account show --query id -o tsv 2>/dev/null || true)"
if [ "$SUB" != "$EXPECTED_SUB" ]; then
  echo "FATAL: ${AZ_WRAPPER} account is '${SUB:-<none>}', expected ${EXPECTED_SUB}." >&2
  exit 2
fi
TENANT="$("$AZ_WRAPPER" account show --query tenantId -o tsv)"
if [ "$TENANT" != "$EXPECTED_TENANT" ]; then echo "FATAL: unexpected Azure tenant." >&2; exit 2; fi
echo "   verified   : sub=${SUB} tenant=${TENANT}"

LOGIN_SERVER="$("$AZ_WRAPPER" acr show -n "$ACR_NAME" -g "$ACR_RG" --query loginServer -o tsv)"
echo "   loginServer: ${LOGIN_SERVER}"
if [ "$AURA3D_NATIVE_ACCEPTANCE" = 1 ] && [ "$AURA3D_ARTIFACT_TRANSPORT" = managed-identity ]; then
  TASK_IDENTITY="$("$AZ_WRAPPER" acr task show -n "$AURA3D_ACR_IDENTITY_TASK" -r "$ACR_NAME" -g "$ACR_RG" --query identity -o json)"
  TASK_IDENTITY="$TASK_IDENTITY" node -e '
    const id = JSON.parse(process.env.TASK_IDENTITY || "null");
    if (!id || (!id.principalId && !Object.keys(id.userAssignedIdentities || {}).length)) {
      console.error("FATAL: named ACR task has no managed identity"); process.exit(1);
    }
  '
fi

# ---- 2. Build image on ACR Tasks --------------------------------------------
if [ "$BUILD" = "1" ]; then
  echo "== az acr build ${IMAGE_REPO}:${IMAGE_TAG}"
  IMAGE_PUSH_ATTEMPTED=1
  set +e
  "$AZ_WRAPPER" acr build \
    -r "$ACR_NAME" -g "$ACR_RG" \
    -t "${IMAGE_REPO}:${IMAGE_TAG}" \
    --build-arg "AURA3D_NATIVE_ACCEPTANCE=${AURA3D_NATIVE_ACCEPTANCE}" \
    --build-arg "AURA3D_CODE_COMPLETE_GATE=${AURA3D_CODE_COMPLETE_GATE:-none}" \
    -f tools/remote-acr/Dockerfile.playwright ${ACR_TIMEOUT_ARGS[@]+"${ACR_TIMEOUT_ARGS[@]}"} \
    "$CTX" 2>&1 | tee "${OUT_DIR}/acr-build.log" | tail -25
  BUILD_RC=${PIPESTATUS[0]}
  set -e
  if [ "$BUILD_RC" -ne 0 ]; then
    echo "FATAL: az acr build failed — full log at ${OUT_DIR}/acr-build.log" >&2
    exit 3
  fi
  echo "   build ok (log: ${OUT_DIR}/acr-build.log)"
else
  echo "== BUILD=0, reusing ${IMAGE_REPO}:${IMAGE_TAG}"
fi

# ---- 3. Run the task ----------------------------------------------------------
# Only nonsecret configuration is forwarded. Native tasks require a managed
# identity and verify its access before test discovery.
echo "== az acr run"
RUN_RC=0
TRANSPORT_SET=(--set "ARTIFACTS_SAS=none")
if [ "$AURA3D_ARTIFACT_TRANSPORT" = legacy-sas ]; then
  # One SAS for this invocation, after the image exists; value only in the
  # 0600 values file of the run context (never argv, never printed).
  # shellcheck source=tools/remote-acr/sas-transport.sh
  . tools/remote-acr/sas-transport.sh
  sas_transport_open "${SAS_TTL_MINUTES:-120}" tools/remote-acr/task.playwright.yaml || exit 2
  TRANSPORT_SET=()
fi
set +e
if [ "$AURA3D_ARTIFACT_TRANSPORT" = legacy-sas ]; then
  RUN_COMMAND=("$AZ_WRAPPER" acr run -r "$ACR_NAME" -g "$ACR_RG" -f task.playwright.yaml --values "$A3D_SAS_VALUES_FILE" --timeout 1800 "$A3D_SAS_DIR")
elif [ "$AURA3D_NATIVE_ACCEPTANCE" = 1 ]; then
  # The existing task carries the preauthorized identity; override its job
  # content with this gate-verified context and YAML. No IAM is modified.
  RUN_COMMAND=("$AZ_WRAPPER" acr task run -n "$AURA3D_ACR_IDENTITY_TASK" -r "$ACR_NAME" -g "$ACR_RG" --context "$CTX" --file tools/remote-acr/task.playwright.yaml)
else
  RUN_COMMAND=("$AZ_WRAPPER" acr run -r "$ACR_NAME" -g "$ACR_RG" -f tools/remote-acr/task.playwright.yaml /dev/null)
fi
"${RUN_COMMAND[@]}" \
  --set "LOGIN_SERVER=${LOGIN_SERVER}" \
  --set "IMAGE=${IMAGE_REPO}:${IMAGE_TAG}" \
  --set "RUN_ID=${RUN_ID}" \
  --set "SPECS_CSV=$(echo ${SPECS} | tr ' ' ',')" \
  --set "REPORTER=${AURA3D_REPORTER}" \
  --set "BROWSER_PROJECT=${AURA3D_BROWSER_PROJECT:-none}" \
  --set "NATIVE_ACCEPTANCE=${AURA3D_NATIVE_ACCEPTANCE}" \
  --set "ACCEPTANCE_KIND=${AURA3D_ACCEPTANCE_KIND}" \
  --set "HISTORICAL_INPUTS=${AURA3D_HISTORICAL_INPUTS:-none}" \
  --set "EXTERNAL_CODEC_LOCK=${AURA3D_EXTERNAL_CODEC_LOCK:-none}" \
  --set "EXTERNAL_CODEC_NPM_INPUTS=${AURA3D_EXTERNAL_CODEC_NPM_INPUTS:-none}" \
  --set "CODE_COMPLETE_GATE=${AURA3D_CODE_COMPLETE_GATE:-none}" \
  --set "RELEASE_PLAN=${A3D_RELEASE_PLAN:-none}" \
  --set "CONSUMER_SOURCE_REPORT=${NATIVE_CONSUMER_SOURCE_REPORT:-none}" \
  --set "MATRIX_SOURCE_REPORT=${NATIVE_MATRIX_SOURCE_REPORT:-none}" \
  --set "EXAMPLES_SOURCE_REPORT=${NATIVE_EXAMPLES_SOURCE_REPORT:-none}" \
  --set "NETWORK_REPORT=${NATIVE_NETWORK_REPORT:-none}" \
  --set "MEASUREMENT_REPORT=${NATIVE_MEASUREMENT_REPORT:-none}" \
  --set "PERF_DEVICE_B64=${NATIVE_PERF_DEVICE_B64:-none}" \
  --set "PERF_DRIVER_B64=${NATIVE_PERF_DRIVER_B64:-none}" \
  --set "ARTIFACTS_BLOB_URL=${AURA3D_ARTIFACTS_BLOB_URL:-none}" \
  --set "ARTIFACTS_CLIENT_ID=${AURA3D_ARTIFACTS_CLIENT_ID:-none}" \
  --set "ARTIFACT_TRANSPORT=${AURA3D_ARTIFACT_TRANSPORT}" \
  --set "PW_SHARD=none" --set "PW_GLOBAL_TIMEOUT_MS=none" --set "PLAYWRIGHT_CONFIG=none" \
  ${TRANSPORT_SET[@]+"${TRANSPORT_SET[@]}"} \
  2>&1 | tee "${OUT_DIR}/acr-run.log"
RUN_RC=${PIPESTATUS[0]}
set -e
if [ "$AURA3D_ARTIFACT_TRANSPORT" = legacy-sas ]; then
  sas_redact_file "${OUT_DIR}/acr-run.log"
  sas_download_prefix "$RUN_ID" "${OUT_DIR}/artifacts" || echo "   (artifact download failed; see UPLOAD_EXIT)"
  sas_transport_close
fi
echo "   acr run exit: ${RUN_RC} (log: ${OUT_DIR}/acr-run.log)"

# The EXIT trap removes an ephemeral image even on early failure or signal.

# ---- 7. Summary --------------------------------------------------------------
PW_EXIT="$(grep -o 'PLAYWRIGHT_EXIT=[0-9]*' "${OUT_DIR}/acr-run.log" | tail -1 | cut -d= -f2 || true)"
INVENTORY_EXIT="$(grep -o 'INVENTORY_EXIT=[0-9]*' "${OUT_DIR}/acr-run.log" | tail -1 | cut -d= -f2 || true)"
HISTORICAL_EXIT="$(grep -o 'HISTORICAL_EXIT=[0-9]*' "${OUT_DIR}/acr-run.log" | tail -1 | cut -d= -f2 || true)"
EXTERNAL_CODEC_EXIT="$(grep -o 'EXTERNAL_CODEC_EXIT=[0-9]*' "${OUT_DIR}/acr-run.log" | tail -1 | cut -d= -f2 || true)"
UPLOAD_EXIT="$(grep -o 'UPLOAD_EXIT=[0-9]*' "${OUT_DIR}/acr-run.log" | tail -1 | cut -d= -f2 || true)"
RUN_ID="$RUN_ID" EXPECTED_SUB="$EXPECTED_SUB" ACR_NAME="$ACR_NAME" \
  IMAGE_REPO="$IMAGE_REPO" IMAGE_TAG="$IMAGE_TAG" LOGIN_SERVER="$LOGIN_SERVER" \
  SPECS="$SPECS" AURA3D_REPORTER="$AURA3D_REPORTER" RUN_RC="$RUN_RC" \
  PW_EXIT="$PW_EXIT" INVENTORY_EXIT="$INVENTORY_EXIT" HISTORICAL_EXIT="$HISTORICAL_EXIT" EXTERNAL_CODEC_EXIT="$EXTERNAL_CODEC_EXIT" UPLOAD_EXIT="$UPLOAD_EXIT" AURA3D_ACCEPTANCE_KIND="$AURA3D_ACCEPTANCE_KIND" AURA3D_BROWSER_PROJECT="$AURA3D_BROWSER_PROJECT" SUMMARY_PATH="${OUT_DIR}/summary.json" \
node -e '
  const fs = require("fs");
  const summary = {
    runId: process.env.RUN_ID,
    finishedUtc: new Date().toISOString(),
    azure: {
      subscription: process.env.EXPECTED_SUB,
      acr: process.env.ACR_NAME,
      image: `${process.env.IMAGE_REPO}:${process.env.IMAGE_TAG}`,
      loginServer: process.env.LOGIN_SERVER
    },
    specs: process.env.SPECS.split(/\s+/),
    reporter: process.env.AURA3D_REPORTER,
    acceptanceKind: process.env.AURA3D_ACCEPTANCE_KIND,
    project: process.env.AURA3D_BROWSER_PROJECT || null,
    acrRunExitCode: Number(process.env.RUN_RC),
    playwrightExit: process.env.PW_EXIT === "" ? null : Number(process.env.PW_EXIT),
    inventoryExit: process.env.INVENTORY_EXIT === "" ? null : Number(process.env.INVENTORY_EXIT),
    historicalExit: process.env.HISTORICAL_EXIT === "" ? null : Number(process.env.HISTORICAL_EXIT),
    externalCodecExit: process.env.EXTERNAL_CODEC_EXIT === "" ? null : Number(process.env.EXTERNAL_CODEC_EXIT),
    artifactUploadExit: process.env.UPLOAD_EXIT === "" ? null : Number(process.env.UPLOAD_EXIT),
    logs: { build: "acr-build.log", run: "acr-run.log" }
  };
  fs.writeFileSync(process.env.SUMMARY_PATH, JSON.stringify(summary, null, 2) + "\n");
'

echo
echo "== DONE run=${RUN_ID} acr_rc=${RUN_RC} playwright_exit=${PW_EXIT:-unknown} historical_exit=${HISTORICAL_EXIT:-not-run} external_codec_exit=${EXTERNAL_CODEC_EXIT:-not-run}"
echo "   evidence: ${OUT_DIR}/ (acr-run.log, acr-build.log, summary.json)"
if [ "$RUN_RC" -ne 0 ]; then exit "$RUN_RC"; fi
if [ "$AURA3D_ACCEPTANCE_KIND" = external-codec-fixtures ]; then
  if [ -z "$EXTERNAL_CODEC_EXIT" ] || [ "$EXTERNAL_CODEC_EXIT" -ne 0 ]; then echo "FATAL: external codec inventory is missing, failed or not-run." >&2; exit 1; fi
elif [ "$AURA3D_ACCEPTANCE_KIND" != browser ]; then
  if [ -z "$HISTORICAL_EXIT" ] || [ "$HISTORICAL_EXIT" -ne 0 ]; then echo "FATAL: historical inventory is missing, failed or not-run." >&2; exit 1; fi
else
  if [ -z "$PW_EXIT" ] || [ "$PW_EXIT" -ne 0 ]; then
    echo "FATAL: missing or failing Playwright exit status." >&2; exit 1
  fi
  if [ "$AURA3D_NATIVE_ACCEPTANCE" = 1 ] && { [ -z "$INVENTORY_EXIT" ] || [ "$INVENTORY_EXIT" -ne 0 ]; }; then
    echo "FATAL: native discovery/execution inventory is missing or failed." >&2; exit 1
  fi
fi
if [ "$AURA3D_NATIVE_ACCEPTANCE" = 1 ] && { [ -z "$UPLOAD_EXIT" ] || [ "$UPLOAD_EXIT" -ne 0 ]; }; then
  echo "FATAL: native artifact transfer is missing or failed." >&2; exit 1
fi
exit 0
