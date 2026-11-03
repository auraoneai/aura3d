#!/usr/bin/env bash
# Aura3D 5.0 source pass on the 4.x ACR path (decision record item 1,
# docs/prds/aura3d-native-code-complete.md). One `az acr build` of
# Dockerfile.playwright from the committed candidate, then one `az acr run`
# per stage (<= 1800 s each, <= 2 concurrent, ACR policy), reports merged into
# tests/reports/native-5/<run>/source-report.json, image deleted afterwards.
# The staged context carries .native-source-manifest.json (stagedSourceIdentity
# schema, tools/remote-acr/source5-manifest.mjs). When packed-a runs, one
# container-scoped rcwl SAS (<= SAS_TTL_MINUTES, default 120) is minted once
# (tools/remote-acr/sas-transport.sh) and reaches packed-a only via the 0600
# --values file; packed-a uploads the tested plan, archives and packed reports
# to source5/<run>/artifacts/, which are downloaded into <run>/artifacts/ and
# re-hashed against the plan (tools/remote-acr/source5-artifacts.mjs). packed-b
# gets the same SAS (same values file) and uploads its consumer source reports
# (clean-install source.json, matrix-source.json) with every file under their
# run directories to source5/<run>/consumers/; they are downloaded, re-hashed and
# extracted under <run>/artifacts/consumers/<job path> and recorded as
# `artifacts.consumers` (source5-artifacts.mjs verify-consumers).
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
# packed-a and packed-b upload with the run's single SAS, so they start first
# (packed-a, then packed-b), well inside the SAS lifetime.
WANT_ARTIFACTS=0; WANT_CONSUMERS=0
case " $STAGES " in *" packed-b "*) STAGES="packed-b $(printf '%s\n' $STAGES | { grep -vx packed-b || true; } | tr '\n' ' ')"; STAGES="${STAGES% }"; WANT_CONSUMERS=1;; esac
case " $STAGES " in *" packed-a "*) STAGES="packed-a $(printf '%s\n' $STAGES | { grep -vx packed-a || true; } | tr '\n' ' ')"; STAGES="${STAGES% }"; WANT_ARTIFACTS=1;; esac
SAS_TTL_MINUTES="${SAS_TTL_MINUTES:-120}"
MAX_PARALLEL=2
[[ "$RUN_ID" =~ ^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$ ]] || { echo 'invalid RUN_ID' >&2; exit 2; }
if [ "${BUILD:-1}" = 0 ]; then
  COMMIT="${IMAGE_COMMIT:?BUILD=0 requires IMAGE_COMMIT (the commit the reused image was built from)}"
elif [ -n "$(git status --porcelain --untracked-files=no -- . ':!AGENTS.md')" ]; then
  echo 'FATAL: tracked changes present; the source pass runs only a committed candidate' >&2; exit 2
else
  COMMIT="$(git rev-parse HEAD)"
fi
OUT_DIR="tests/reports/native-5/$RUN_ID"
[ -e "$OUT_DIR" ] && { echo "FATAL: $OUT_DIR exists" >&2; exit 2; }
mkdir -p "$OUT_DIR"
IMAGE_TAG="${IMAGE_TAG:-run-$RUN_ID}"
BUILD="${BUILD:-1}"
CTX="$(mktemp -d /tmp/aura3d-source5.XXXXXX)"
PUSHED=0
# shellcheck source=tools/remote-acr/sas-transport.sh
. "$REPO_ROOT/tools/remote-acr/sas-transport.sh"
cleanup() {
  local rc=$?
  trap - EXIT INT TERM
  # Never delete the image while a stage run still uses it.
  wait 2>/dev/null || true
  sas_transport_close
  if [ "$PUSHED" = 1 ] && [ "$KEEP_IMAGE" != 1 ]; then
    "$AZ_WRAPPER" acr repository delete -n "$ACR_NAME" --image "$IMAGE_REPO:$IMAGE_TAG" --yes -o none || { echo "image cleanup FAILED: $IMAGE_REPO:$IMAGE_TAG" >&2; rc=1; }
  fi
  rm -rf "$CTX" "$CTX.list"
  exit "$rc"
}
trap cleanup EXIT INT TERM

SUB="$("$AZ_WRAPPER" account show --query id -o tsv)"
[ "$SUB" = "$EXPECTED_SUB" ] || { echo "FATAL: subscription $SUB" >&2; exit 2; }

if [ "${BUILD:-1}" = 0 ]; then MANIFEST_SHA=reused-image; LOCK_SHA=reused-image; INPUT_DIGEST=-; TREE=-; else
echo "== staging committed candidate $COMMIT"
TREE="$(git rev-parse "$COMMIT^{tree}")"
# Untracked local reports stay out; committed (tracked) reports are candidate
# source (e.g. tests/reports/final-competitive-baseline) and are staged.
{ git ls-files -z --cached --others --exclude-standard \
    | grep -zv -e '^tests/reports/' -e '/node_modules/' -e '^node_modules/'
  git ls-files -z --cached -- tests/reports; } \
  > "$CTX.list"
rsync -a --from0 --files-from="$CTX.list" ./ "$CTX/"
# JSON manifest in the exact stagedSourceIdentity schema (publish-all --pack-only
# and every AURA3D_SOURCE_MANIFEST consumer), verified here before any build.
node tools/remote-acr/source5-manifest.mjs write "$CTX" "$CTX.list" "$COMMIT" "$TREE"
cp "$CTX/.native-source-manifest.json" "$OUT_DIR/source-manifest.json"
MANIFEST_SHA="$(shasum -a 256 "$OUT_DIR/source-manifest.json" | cut -d' ' -f1)"
LOCK_SHA="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).lockfileSha256' "$OUT_DIR/source-manifest.json")"
INPUT_DIGEST="$(node -p 'JSON.parse(require("fs").readFileSync(process.argv[1], "utf8")).inputDigest' "$OUT_DIR/source-manifest.json")"
du -sh "$CTX" | awk '{print "   context: "$1}'
fi

LOGIN_SERVER="$("$AZ_WRAPPER" acr show -n "$ACR_NAME" -g "$ACR_RG" --query loginServer -o tsv)"
PUSHED=1
if [ "$BUILD" = 0 ]; then
  echo "== BUILD=0: reusing $IMAGE_REPO:$IMAGE_TAG (built from the same commit)"
  "$AZ_WRAPPER" acr repository show-tags -n "$ACR_NAME" --repository "$IMAGE_REPO" -o tsv | grep -qx "$IMAGE_TAG" || { echo "FATAL: image tag $IMAGE_TAG not found" >&2; exit 3; }
else
echo "== az acr build $IMAGE_REPO:$IMAGE_TAG"
set +e
"$AZ_WRAPPER" acr build -r "$ACR_NAME" -g "$ACR_RG" -t "$IMAGE_REPO:$IMAGE_TAG" \
  --build-arg AURA3D_NATIVE_ACCEPTANCE=0 -f tools/remote-acr/Dockerfile.playwright --timeout 1800 \
  "$CTX" > "$OUT_DIR/acr-build.log" 2>&1
BUILD_RC=$?
set -e
tail -15 "$OUT_DIR/acr-build.log"
[ "$BUILD_RC" = 0 ] || { echo "FATAL: build failed ($OUT_DIR/acr-build.log)" >&2; exit 3; }
fi

if [ "$WANT_ARTIFACTS" = 1 ] || [ "$WANT_CONSUMERS" = 1 ]; then
  # One SAS per launcher run, minted after the build so the packed stages (queued first) start at once.
  sas_transport_open "$SAS_TTL_MINUTES" tools/remote-acr/task.source5.yaml || { echo 'FATAL: artifact transport unavailable; the packed stages cannot return their archives and consumer reports' >&2; exit 3; }
fi

run_stage() {
  set +eu
  local stage="$1" log="$OUT_DIR/acr-run-$1.log" rc=0
  local common=(--timeout 1800 --set "LOGIN_SERVER=$LOGIN_SERVER" --set "IMAGE=$IMAGE_REPO:$IMAGE_TAG"
    --set "RUN_ID=$RUN_ID" --set "RELEASE_KIND=$RELEASE_KIND" --set "STAGE=$stage")
  if [ "$stage" = packed-a ] || [ "$stage" = packed-b ]; then
    # The upload must finish before the SAS expires.
    if [ "$(sas_seconds_left)" -lt 2100 ]; then
      echo "$stage not started: SAS has $(sas_seconds_left)s left (< 2100s)" > "$log"; rc=97
    else
      "$AZ_WRAPPER" acr run -r "$ACR_NAME" -g "$ACR_RG" -f task.source5.yaml --values "$A3D_SAS_VALUES_FILE" \
        "${common[@]}" "$A3D_SAS_DIR" > "$log" 2>&1 || rc=$?
    fi
  else
    "$AZ_WRAPPER" acr run -r "$ACR_NAME" -g "$ACR_RG" -f tools/remote-acr/task.source5.yaml \
      "${common[@]}" --set "ARTIFACTS_SAS=none" /dev/null > "$log" 2>&1 || rc=$?
  fi
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

ARTIFACTS_JSON="$OUT_DIR/artifacts-verification.json"
CONSUMERS_JSON="$OUT_DIR/consumers-verification.json"
[ "$WANT_CONSUMERS" = 1 ] && sas_redact_file "$OUT_DIR/acr-run-packed-b.log"
if [ "$WANT_ARTIFACTS" = 1 ]; then
  sas_redact_file "$OUT_DIR/acr-run-packed-a.log"
  echo "== downloading source5/$RUN_ID/artifacts"
  DL="$OUT_DIR/.artifacts-download"
  rm -rf "$DL" "$OUT_DIR/artifacts"; mkdir -p "$DL"
  if AZURE_STORAGE_KEY="$A3D_SAS_KEY" "$AZ_WRAPPER" storage blob download-batch --source "$A3D_SAS_CONTAINER" \
      --account-name "$A3D_SAS_STORAGE_ACCOUNT" --auth-mode key --pattern "source5/$RUN_ID/artifacts/*" \
      --destination "$DL" -o none --only-show-errors > "$OUT_DIR/artifacts-download.log" 2>&1 \
      && [ -d "$DL/source5/$RUN_ID/artifacts" ]; then
    mv "$DL/source5/$RUN_ID/artifacts" "$OUT_DIR/artifacts"
  else
    echo "   artifact download failed ($OUT_DIR/artifacts-download.log)"; mkdir -p "$OUT_DIR/artifacts"
  fi
  rm -rf "$DL"
  # Verified before the consumer files land under artifacts/consumers/.
  node tools/remote-acr/source5-artifacts.mjs verify "$OUT_DIR/artifacts" "$REPO_ROOT" "$COMMIT" "$LOCK_SHA" "$INPUT_DIGEST" "$ARTIFACTS_JSON" || true
fi
if [ "$WANT_CONSUMERS" = 1 ]; then
  echo "== downloading source5/$RUN_ID/consumers"
  DL="$OUT_DIR/.consumers-download"
  rm -rf "$DL" "$OUT_DIR/artifacts/consumers"; mkdir -p "$DL"
  if AZURE_STORAGE_KEY="$A3D_SAS_KEY" "$AZ_WRAPPER" storage blob download-batch --source "$A3D_SAS_CONTAINER" \
      --account-name "$A3D_SAS_STORAGE_ACCOUNT" --auth-mode key --pattern "source5/$RUN_ID/consumers/*" \
      --destination "$DL" -o none --only-show-errors > "$OUT_DIR/consumers-download.log" 2>&1 \
      && [ -d "$DL/source5/$RUN_ID/consumers" ]; then :; else
    echo "   consumer download failed ($OUT_DIR/consumers-download.log)"; mkdir -p "$DL/source5/$RUN_ID/consumers"
  fi
  node tools/remote-acr/source5-artifacts.mjs verify-consumers "$DL/source5/$RUN_ID/consumers" "$OUT_DIR/artifacts/consumers" \
    "$REPO_ROOT" "$RUN_ID" "$CONSUMERS_JSON" || true
  rm -rf "$DL"
fi
sas_transport_close

COMMIT="$COMMIT" TREE="$TREE" MANIFEST_SHA="$MANIFEST_SHA" LOCK_SHA="$LOCK_SHA" INPUT_DIGEST="$INPUT_DIGEST" OUT="$OUT_DIR" STAGES="$STAGES" \
  WANT_ARTIFACTS="$WANT_ARTIFACTS" ARTIFACTS_JSON="$ARTIFACTS_JSON" WANT_CONSUMERS="$WANT_CONSUMERS" CONSUMERS_JSON="$CONSUMERS_JSON" node -e '
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
  let artifacts = null;
  if (process.env.WANT_ARTIFACTS === "1") {
    try { artifacts = JSON.parse(fs.readFileSync(process.env.ARTIFACTS_JSON, "utf8")); } catch { artifacts = { ok: false, problems: ["artifact verification did not run"] }; }
    if (!artifacts.ok) problems.push(...(artifacts.problems || []).map((p) => `artifacts: ${p}`));
  }
  if (process.env.WANT_CONSUMERS === "1") {
    let consumers;
    try { consumers = JSON.parse(fs.readFileSync(process.env.CONSUMERS_JSON, "utf8")); } catch { consumers = { ok: false, problems: ["consumer verification did not run"] }; }
    if (!consumers.ok) problems.push(...(consumers.problems || []).map((p) => `consumers: ${p}`));
    artifacts = { ...(artifacts || {}), consumers };
  }
  const known = (v) => (v && v !== "-" && v !== "reused-image" ? v : null);
  const report = {
    schema: "aura3d.source5-report/2",
    candidate: {
      commit: process.env.COMMIT, tree: known(process.env.TREE),
      sourceManifestPath: known(process.env.MANIFEST_SHA) ? `${out}/source-manifest.json` : null,
      sourceManifestSha256: process.env.MANIFEST_SHA, inputDigest: known(process.env.INPUT_DIGEST),
      lockfileSha256: process.env.LOCK_SHA
    },
    stages, commands,
    passed: commands.filter((c) => c.exitCode === 0).map((c) => c.id),
    failed: commands.filter((c) => c.exitCode !== 0).map((c) => c.id),
    problems,
    candidatePlan: plans["packed-a"] || plans["packed-b"] || null,
    // Downloaded tested archives (tools/remote-acr/source5-artifacts.mjs verify; packed-a) and
    // `artifacts.consumers` (verify-consumers; packed-b); null when neither packed stage ran.
    artifacts,
    browserAcceptance: "not-run"
  };
  fs.writeFileSync(`${out}/source-report.json`, JSON.stringify(report, null, 2) + "\n");
  for (const c of commands) console.log(`${c.exitCode === 0 ? "PASS" : "FAIL"} ${c.id} (${c.seconds}s)`);
  for (const p of problems) console.log(`PROBLEM ${p}`);
  console.log(`passed ${report.passed.length}, failed ${report.failed.length}, problems ${problems.length}`);
'
echo "   report: $OUT_DIR/source-report.json"
