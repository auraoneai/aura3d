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
# re-hashed against the plan (tools/remote-acr/source5-artifacts.mjs). packed-b1 and packed-b2
# get the same SAS (same values file) and upload their consumer source reports
# (clean-install source.json, matrix-source.json)
# with every file under their run directories to source5/<run>/consumers-1/ and consumers-2/ (one
# upload per <= 128 MiB chunk); they are downloaded, re-hashed and
# extracted under <run>/artifacts/consumers/<job path> and recorded as
# `artifacts.consumers` (source5-artifacts.mjs verify-consumers). The packed examples
# run as EXAMPLE_SHARDS (default 4) shard stages packed-c1..packed-cN (same SAS, each
# started only with >= 2100 s left): each packs again, runs examples-source for its
# deterministic cost-balanced slice of the catalog (agent-examples --packed --shard I/N)
# and uploads its slice of tests/reports/native-examples-catalog/<run>/ to
# source5/<run>/examples-<I>/. The launcher downloads and verifies every shard bundle,
# proves the shards are one complete partition of the catalog, merges them into one
# examples-source.json and extracts the union under <run>/artifacts/examples/ as
# `artifacts.examples` (source5-artifacts.mjs verify-examples). The shards merge per run, so
# a run holds all of them or none.
# Every packed stage gets PLAN_GENERATED_AT (the commit's UTC committer time)
# so their candidate plans are byte-identical (the adapter refuses otherwise).
# Usage: RUN_ID=native-5-source-001 tools/remote-acr/run-source5.sh
#        STAGES="static suites" ... to run a subset (rerun of affected checks);
#        STAGES="packed-c1 packed-c2 packed-c3 packed-c4" reruns the example shards.
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
EXAMPLE_SHARDS="${EXAMPLE_SHARDS:-4}"
[[ "$EXAMPLE_SHARDS" =~ ^[1-9][0-9]?$ ]] && [ "$EXAMPLE_SHARDS" -le 16 ] || { echo "FATAL: EXAMPLE_SHARDS must be an integer 1..16" >&2; exit 2; }
EXAMPLE_STAGES=""
for i in $(seq 1 "$EXAMPLE_SHARDS"); do EXAMPLE_STAGES="$EXAMPLE_STAGES packed-c$i"; done
EXAMPLE_STAGES="${EXAMPLE_STAGES# }"
DEFAULT_STAGES="packed-a packed-b1 packed-b2 $EXAMPLE_STAGES static suites"
for i in $(seq 1 "$UNIT_SHARDS"); do DEFAULT_STAGES="$DEFAULT_STAGES unit-$i-of-$UNIT_SHARDS"; done
STAGES="${STAGES:-$DEFAULT_STAGES}"
# packed-a, packed-b1, packed-b2 and the example shards upload with the run's single SAS, so they are
# queued first (packed-a, packed-b1, packed-b2, packed-c1..cN), well inside the SAS lifetime.
WANT_ARTIFACTS=0; WANT_CONSUMERS=0; WANT_EXAMPLES=0
want_stage() { case " $STAGES " in *" $1 "*) return 0;; esac; return 1; }
for tok in $STAGES; do
  case "$tok" in
    packed-b) echo "FATAL: stage packed-b was split into packed-b1 (clean-install, tree-shaking) and packed-b2 (consumer-matrix, runtime-audit)" >&2; exit 2;;
    packed-c) echo "FATAL: stage packed-c was replaced by the example shards: $EXAMPLE_STAGES" >&2; exit 2;;
    packed-c*) idx="${tok#packed-c}"
      [[ "$idx" =~ ^[1-9][0-9]*$ ]] && [ "$idx" -le "$EXAMPLE_SHARDS" ] || { echo "FATAL: unknown example shard stage $tok (EXAMPLE_SHARDS=$EXAMPLE_SHARDS)" >&2; exit 2; };;
  esac
done
EXAMPLE_PRESENT=0
for i in $(seq 1 "$EXAMPLE_SHARDS"); do want_stage "packed-c$i" && EXAMPLE_PRESENT=$((EXAMPLE_PRESENT + 1)); done
if [ "$EXAMPLE_PRESENT" -gt 0 ]; then
  [ "$EXAMPLE_PRESENT" = "$EXAMPLE_SHARDS" ] || { echo "FATAL: the example shards merge into one report per run; run all of them together (STAGES=\"$EXAMPLE_STAGES\")" >&2; exit 2; }
  WANT_EXAMPLES=1
fi
# The consumers bundle merges both parts (clean-install + matrix source reports), so both stages run together.
if want_stage packed-b1 || want_stage packed-b2; then
  { want_stage packed-b1 && want_stage packed-b2; } || { echo "FATAL: the consumer reports merge from packed-b1 and packed-b2; run both (STAGES=\"packed-b1 packed-b2\")" >&2; exit 2; }
  WANT_CONSUMERS=1
fi
want_stage packed-a && WANT_ARTIFACTS=1
ORDERED=""
for first in packed-a packed-b1 packed-b2 $EXAMPLE_STAGES; do want_stage "$first" && ORDERED="$ORDERED $first"; done
for tok in $STAGES; do case "$tok" in packed-a|packed-b1|packed-b2|packed-c*) ;; *) ORDERED="$ORDERED $tok";; esac; done
STAGES="${ORDERED# }"
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
# Pinned candidate plan time: the frozen commit's UTC committer time, so every
# packed stage (and any packed rerun on the same commit) writes the same plan bytes.
PLAN_GENERATED_AT="$(TZ=UTC git log -1 --date=format-local:%Y-%m-%dT%H:%M:%SZ --format=%cd "$COMMIT" 2>/dev/null || true)"
[[ "$PLAN_GENERATED_AT" =~ ^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}Z$ ]] || { echo "FATAL: cannot read the commit time of $COMMIT" >&2; exit 2; }
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
# `az acr build` silently drops every file named .gitignore ("default ignore rules").
# They are part of the source identity, so ship them as .gitignore.a3d-staged; the
# image restores the names right after COPY (Dockerfile.playwright). Done after the
# manifest is written/verified, so the manifest keeps the real names and digests.
find "$CTX" -name .gitignore -not -path '*/node_modules/*' -print0 | while IFS= read -r -d '' g; do mv "$g" "$(dirname "$g")/.gitignore.a3d-staged"; done
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

if [ "$WANT_ARTIFACTS" = 1 ] || [ "$WANT_CONSUMERS" = 1 ] || [ "$WANT_EXAMPLES" = 1 ]; then
  # One SAS per launcher run, minted after the build so the packed stages (queued first) start at once.
  sas_transport_open "$SAS_TTL_MINUTES" tools/remote-acr/task.source5.yaml || { echo 'FATAL: artifact transport unavailable; the packed stages cannot return their archives and consumer reports' >&2; exit 3; }
fi

run_stage() {
  set +eu
  local stage="$1" log="$OUT_DIR/acr-run-$1.log" rc=0
  local common=(--timeout 1800 --set "LOGIN_SERVER=$LOGIN_SERVER" --set "IMAGE=$IMAGE_REPO:$IMAGE_TAG"
    --set "RUN_ID=$RUN_ID" --set "RELEASE_KIND=$RELEASE_KIND" --set "STAGE=$stage" --set "PLAN_GENERATED_AT=$PLAN_GENERATED_AT" --set "EXAMPLE_SHARDS=$EXAMPLE_SHARDS")
  if [ "$stage" = packed-a ] || [ "$stage" = packed-b1 ] || [ "$stage" = packed-b2 ] || [[ "$stage" =~ ^packed-c[1-9][0-9]*$ ]]; then
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
EXAMPLES_JSON="$OUT_DIR/examples-verification.json"
[ "$WANT_CONSUMERS" = 1 ] && { sas_redact_file "$OUT_DIR/acr-run-packed-b1.log"; sas_redact_file "$OUT_DIR/acr-run-packed-b2.log"; }
if [ "$WANT_EXAMPLES" = 1 ]; then for stage in $EXAMPLE_STAGES; do sas_redact_file "$OUT_DIR/acr-run-$stage.log"; done; fi
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
# packed-b1/packed-b2 consumer bundle (consumers-1, consumers-2): download, re-hash and extract the union under
# <run>/artifacts/consumers/<job path> (source5-artifacts.mjs verify-consumers).
download_consumers() {
  local dl="$OUT_DIR/.consumers-download"
  echo "== downloading source5/$RUN_ID/consumers-1..2"
  rm -rf "$dl" "$OUT_DIR/artifacts/consumers"; mkdir -p "$dl"
  if AZURE_STORAGE_KEY="$A3D_SAS_KEY" "$AZ_WRAPPER" storage blob download-batch --source "$A3D_SAS_CONTAINER" \
      --account-name "$A3D_SAS_STORAGE_ACCOUNT" --auth-mode key --pattern "source5/$RUN_ID/consumers-*/*" \
      --destination "$dl" -o none --only-show-errors > "$OUT_DIR/consumers-download.log" 2>&1 \
      && [ -d "$dl/source5/$RUN_ID" ]; then :; else
    echo "   consumers download failed ($OUT_DIR/consumers-download.log)"; mkdir -p "$dl/source5/$RUN_ID"
  fi
  node tools/remote-acr/source5-artifacts.mjs verify-consumers "$dl/source5/$RUN_ID" "$OUT_DIR/artifacts/consumers" \
    "$REPO_ROOT" "$RUN_ID" "$CONSUMERS_JSON" || true
  rm -rf "$dl"
}
# Example shard bundles (source5/<run>/examples-<I>/): download all, re-hash each, extract the union under
# <run>/artifacts/examples/<job path>, prove the shards are one complete partition of the catalog and write
# the merged examples-source.json (source5-artifacts.mjs verify-examples).
download_examples() {
  local dl="$OUT_DIR/.examples-download"
  echo "== downloading source5/$RUN_ID/examples-1..$EXAMPLE_SHARDS"
  rm -rf "$dl" "$OUT_DIR/artifacts/examples"; mkdir -p "$dl"
  if AZURE_STORAGE_KEY="$A3D_SAS_KEY" "$AZ_WRAPPER" storage blob download-batch --source "$A3D_SAS_CONTAINER" \
      --account-name "$A3D_SAS_STORAGE_ACCOUNT" --auth-mode key --pattern "source5/$RUN_ID/examples-*/*" \
      --destination "$dl" -o none --only-show-errors > "$OUT_DIR/examples-download.log" 2>&1 \
      && [ -d "$dl/source5/$RUN_ID" ]; then :; else
    echo "   examples download failed ($OUT_DIR/examples-download.log)"; mkdir -p "$dl/source5/$RUN_ID"
  fi
  node tools/remote-acr/source5-artifacts.mjs verify-examples "$dl/source5/$RUN_ID" "$OUT_DIR/artifacts/examples" \
    "$REPO_ROOT" "$RUN_ID" "$EXAMPLES_JSON" "$EXAMPLE_SHARDS" || true
  rm -rf "$dl"
}
[ "$WANT_CONSUMERS" = 1 ] && download_consumers
[ "$WANT_EXAMPLES" = 1 ] && download_examples
sas_transport_close

COMMIT="$COMMIT" TREE="$TREE" MANIFEST_SHA="$MANIFEST_SHA" LOCK_SHA="$LOCK_SHA" INPUT_DIGEST="$INPUT_DIGEST" OUT="$OUT_DIR" STAGES="$STAGES" \
  WANT_ARTIFACTS="$WANT_ARTIFACTS" ARTIFACTS_JSON="$ARTIFACTS_JSON" WANT_CONSUMERS="$WANT_CONSUMERS" CONSUMERS_JSON="$CONSUMERS_JSON" \
  WANT_EXAMPLES="$WANT_EXAMPLES" EXAMPLES_JSON="$EXAMPLES_JSON" node -e '
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
  for (const [kind, flag, file] of [["consumers", "WANT_CONSUMERS", "CONSUMERS_JSON"], ["examples", "WANT_EXAMPLES", "EXAMPLES_JSON"]]) {
    if (process.env[flag] !== "1") continue;
    let bundle;
    try { bundle = JSON.parse(fs.readFileSync(process.env[file], "utf8")); } catch { bundle = { ok: false, problems: [`${kind} verification did not run`] }; }
    if (!bundle.ok) problems.push(...(bundle.problems || []).map((p) => `${kind}: ${p}`));
    artifacts = { ...(artifacts || {}), [kind]: bundle };
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
    candidatePlan: plans["packed-a"] || plans["packed-b1"] || plans["packed-b2"] || Object.entries(plans).find(([stage]) => /^packed-c[0-9]+$/.test(stage))?.[1] || null,
    // Downloaded tested archives (tools/remote-acr/source5-artifacts.mjs verify; packed-a),
    // `artifacts.consumers` (verify-consumers; packed-b1 + packed-b2) and `artifacts.examples` (verify-examples; the
    // merged union of the packed-c1..cN shard bundles); null when no packed stage ran.
    artifacts,
    browserAcceptance: "not-run"
  };
  fs.writeFileSync(`${out}/source-report.json`, JSON.stringify(report, null, 2) + "\n");
  for (const c of commands) console.log(`${c.exitCode === 0 ? "PASS" : "FAIL"} ${c.id} (${c.seconds}s)`);
  for (const p of problems) console.log(`PROBLEM ${p}`);
  console.log(`passed ${report.passed.length}, failed ${report.failed.length}, problems ${problems.length}`);
'
echo "   report: $OUT_DIR/source-report.json"
