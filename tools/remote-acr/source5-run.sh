#!/usr/bin/env bash
# In-image runner for the Aura3D 5.0 source pass (decision record item 1 in
# docs/prds/aura3d-native-code-complete.md). Runs the Phase A §4 command list
# in order, never stops early, and records one exit code per command. No
# browser stage runs here. Results are printed between SOURCE5_REPORT markers.
# packed-a also uploads the tested plan, archives and packed reports to
# source5/<run>/artifacts/ in the run container (artifacts-upload below), and
# packed-b uploads its consumer source reports with the projects, logs and
# archives they reference to source5/<run>/consumers/ (consumers-upload); the
# container SAS arrives only as AURA3D_ARTIFACTS_SAS from the launcher's 0600
# --values file and is handed to upload-artifacts.mjs alone.
set -uo pipefail
cd /repo
export CI=1
export NATIVE_RUN_ID="${NATIVE_RUN_ID:?}"
export NATIVE_RELEASE_KIND="${NATIVE_RELEASE_KIND:-major}"
export NATIVE_REPORT_DIR="/repo/tests/reports/native-5/${NATIVE_RUN_ID}"
# JSON manifest in the stagedSourceIdentity schema (tools/remote-acr/source5-manifest.mjs).
export AURA3D_SOURCE_MANIFEST=".native-source-manifest.json"
A3D_ARTIFACT_SAS="${AURA3D_ARTIFACTS_SAS:-}"
unset AURA3D_ARTIFACTS_SAS
case "$A3D_ARTIFACT_SAS" in none) A3D_ARTIFACT_SAS="";; esac
mkdir -p "$NATIVE_REPORT_DIR" /tmp/source5-logs
RESULTS=/tmp/source5-results.tsv
: > "$RESULTS"

run() {
  local id="$1"; shift
  local log="/tmp/source5-logs/${id}.log"
  local started ended rc
  started=$(date +%s)
  echo "::: SOURCE5_BEGIN ${id} :: $*"
  # Only the upload commands see the SAS (as SOURCE5_SAS, never in the command text).
  if [ "$id" = artifacts-upload ] || [ "$id" = consumers-upload ]; then
    SOURCE5_SAS="$A3D_ARTIFACT_SAS" timeout --kill-after=15 "${SOURCE5_CMD_TIMEOUT:-1620}" bash -c "$*" > "$log" 2>&1
  else
    timeout --kill-after=15 "${SOURCE5_CMD_TIMEOUT:-1620}" bash -c "$*" > "$log" 2>&1
  fi
  rc=$?
  ended=$(date +%s)
  if [ "$rc" = 0 ]; then tail -n 20 "$log"; else tail -n "${SOURCE5_FAIL_LINES:-400}" "$log"; fi | sed "s/^/[${id}] /"
  echo "::: SOURCE5_END ${id} rc=${rc} secs=$((ended - started))"
  printf '%s\t%s\t%s\t%s\n' "$id" "$rc" "$((ended - started))" "$*" >> "$RESULTS"
}

# Stages (each ACR run executes one stage; <= 30 min each per the ACR policy).
# SOURCE5_STAGE: static | unit-<i>-of-<n> | suites | packed-a | packed-b
STAGE="${SOURCE5_STAGE:?SOURCE5_STAGE required}"
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=6144}"
# Both packed stages pack the same commit; the launcher's pinned plan time
# (frozen commit's UTC committer time) makes their plans byte-identical.
case "${A3D_PLAN_GENERATED_AT:-}" in none) unset A3D_PLAN_GENERATED_AT;; *) [ -z "${A3D_PLAN_GENERATED_AT:-}" ] || export A3D_PLAN_GENERATED_AT;; esac
pack_candidate() {
  run build                'pnpm build'
  run pack                 'node tools/release/publish-all.mjs --pack-only --out-plan "$NATIVE_REPORT_DIR/candidate-plan.json"'
  export A3D_RELEASE_PLAN="$NATIVE_REPORT_DIR/candidate-plan.json"
}
case "$STAGE" in
  static)
    run typecheck            'pnpm typecheck'
    run lint                 'pnpm lint'
    run resolution           'pnpm resolution:check'
    run browser-tests-tsc    'pnpm exec tsc -p tsconfig.browser-tests.json --noEmit'
    run release-tools        'node --test tools/release/*.test.mjs'
    ;;
  unit-*)
    SHARD="${STAGE#unit-}"; SHARD="${SHARD/-of-//}"
    # tests/unit/package-dist imports built packages/*/dist; the unit shards run
    # before any build, so it runs in packed-a right after `pnpm build`.
    EXCLUDES=" --exclude 'tests/unit/package-dist/**'"
    while IFS= read -r t; do case "$t" in ''|'#'*) ;; *) EXCLUDES="$EXCLUDES --exclude $t";; esac; done < tools/remote-acr/acceptance-evidence-tests.txt
    UJSON="$NATIVE_REPORT_DIR/unit-${SHARD/\//-of-}.json"
    run "unit-${SHARD/\//-of-}" "pnpm exec vitest run tests/unit --maxWorkers=2 --shard=$SHARD$EXCLUDES --reporter=default --reporter=json --outputFile=$UJSON"
    # Complete failing-test list (the per-command log tail may truncate it).
    UJSON="$UJSON" node -e '
      const fs = require("fs"); let r; try { r = JSON.parse(fs.readFileSync(process.env.UJSON, "utf8")); } catch { console.log("::: UNIT_FAILURES unavailable"); process.exit(0); }
      for (const f of r.testResults || []) for (const a of f.assertionResults || []) if (a.status === "failed")
        console.log("::: UNIT_FAIL " + f.name.replace(/^\/repo\//, "") + " :: " + a.fullName + " :: " + String((a.failureMessages || [])[0] || "").split("\n")[0].slice(0, 300));
      for (const f of r.testResults || []) if ((f.assertionResults || []).length === 0 && f.status === "failed")
        console.log("::: UNIT_FAIL " + f.name.replace(/^\/repo\//, "") + " :: <file failed to run> :: " + String(f.message || "").split("\n")[0].slice(0, 300));
    ' 
    ;;
  suites)
    run assets-qr            'pnpm exec vitest run tests/assets tests/qr --maxWorkers=2'
    run packages             'pnpm test:packages'
    ;;
  packed-a)
    pack_candidate
    run package-dist-unit    'pnpm exec vitest run tests/unit/package-dist --maxWorkers=2'
    run api-baseline         'pnpm exec tsx --tsconfig tsconfig.base.json tools/public-surface-diff/prepare-baseline.ts --candidate-plan "$A3D_RELEASE_PLAN" --out "$NATIVE_REPORT_DIR/baseline-manifest.json"'
    run integration          'pnpm test:integration'
    run packages-dist        'pnpm test:packages:dist'
    run verify-exports       'pnpm verify:exports'
    run verify-imports       'pnpm verify:imports'
    run tarballs             'pnpm check:tarballs'
    run bundle-size          'pnpm check:bundle-size'
    run api-diff             'pnpm exec tsx --tsconfig tsconfig.base.json tools/public-surface-diff/index.ts --baseline-manifest "$NATIVE_REPORT_DIR/baseline-manifest.json" --candidate-plan "$A3D_RELEASE_PLAN" --release-kind "$NATIVE_RELEASE_KIND" --out "$NATIVE_REPORT_DIR/api-diff.json"'
    run api-contract         'pnpm exec tsx --tsconfig tsconfig.base.json tools/public-api-contract/index.ts --candidate-plan "$A3D_RELEASE_PLAN"'
    # Public reference from the packed candidate's declarations (S5-WP24-03).
    run api-docs-packed      'pnpm exec tsx --tsconfig tsconfig.base.json tools/api-docs/index.ts --candidate-plan "$A3D_RELEASE_PLAN" --out "$NATIVE_REPORT_DIR/public-api.md" --write'
    run api-docs             'pnpm exec tsx --tsconfig tsconfig.base.json tools/api-docs/index.ts --candidate-plan "$A3D_RELEASE_PLAN"'
    # Tested plan + archives + packed reports back to the Mac (packed-a only;
    # packed-b's archives are compared byte-for-byte by the launcher). An upload
    # or staging failure fails this command and therefore the stage.
    run artifacts-upload     'rm -rf /tmp/source5-artifacts && mkdir -p /tmp/source5-artifacts && node tools/remote-acr/source5-artifacts.mjs stage "$A3D_RELEASE_PLAN" "$NATIVE_REPORT_DIR" /tmp/source5-artifacts/artifacts "$NATIVE_RUN_ID"; s=$?; AURA3D_ARTIFACTS_SAS="$SOURCE5_SAS" node tools/remote-acr/upload-artifacts.mjs --prefix "source5/$NATIVE_RUN_ID" /tmp/source5-artifacts/artifacts; u=$?; [ "$s" = 0 ] && [ "$u" = 0 ]'
    ;;
  packed-b)
    pack_candidate
    run clean-install        'pnpm exec tsx --tsconfig tsconfig.base.json tools/package-clean-install/index.ts --phase source --run-id "$NATIVE_RUN_ID"'
    run tree-shaking         'pnpm exec tsx --tsconfig tsconfig.base.json tools/installed-tree-shaking/index.ts --source-report "tests/reports/native-consumers/$NATIVE_RUN_ID/source.json"'
    run consumer-matrix      'pnpm exec tsx --tsconfig tsconfig.base.json tools/native-consumer-matrix/index.ts --phase source --run-id "$NATIVE_RUN_ID"'
    # Every catalog example installed from the packed candidate (A3D_RELEASE_PLAN
    # archives, lock pinned to the plan's SHA-512 integrity) and built; no custody
    # lock input (decision record item 1). Gate check: clean-install.
    run examples-source      'pnpm exec tsx --tsconfig tsconfig.base.json tools/agent-examples/index.ts --phase source --packed --run-id "$NATIVE_RUN_ID" --candidate-plan "$A3D_RELEASE_PLAN"'
    run runtime-audit        'pnpm exec tsx --tsconfig tsconfig.base.json tools/native-runtime-audit/index.ts --phase source'
    # Consumer source reports (clean-install source.json, matrix-source.json,
    # examples-source.json) and every file under their run directories back to the
    # Mac, so the gate can bind them for the acceptance consumer phase. One upload
    # per <= 128 MiB chunk keeps each upload-artifacts.mjs call under its 512 MiB
    # limit. A staging or upload failure fails this command and therefore the stage.
    run consumers-upload     'rm -rf /tmp/source5-consumers && mkdir -p /tmp/source5-consumers && node tools/remote-acr/source5-artifacts.mjs stage-consumers "$NATIVE_RUN_ID" /tmp/source5-consumers/consumers; s=$?; u=1; if [ "$s" = 0 ]; then u=0; for f in /tmp/source5-consumers/consumers/*; do AURA3D_ARTIFACTS_SAS="$SOURCE5_SAS" node tools/remote-acr/upload-artifacts.mjs --prefix "source5/$NATIVE_RUN_ID" --copy "$f" "consumers/${f##*/}" || { u=1; break; }; done; fi; [ "$s" = 0 ] && [ "$u" = 0 ]'
    ;;
  *) echo "unknown SOURCE5_STAGE $STAGE" >&2; exit 2 ;;
esac

echo "::: SOURCE5_REPORT_BEGIN"
RESULTS="$RESULTS" SOURCE5_STAGE="$STAGE" A3D_RELEASE_PLAN="${A3D_RELEASE_PLAN:-}" node -e '
  const fs = require("fs");
  const rows = fs.readFileSync(process.env.RESULTS, "utf8").trim().split("\n").filter(Boolean).map((l) => {
    const [id, rc, secs, ...cmd] = l.split("\t");
    return { id, exitCode: Number(rc), seconds: Number(secs), command: cmd.join("\t") };
  });
  const plan = process.env.A3D_RELEASE_PLAN;
  const out = {
    schema: "aura3d.source5-report/1",
    runId: process.env.NATIVE_RUN_ID,
    releaseKind: process.env.NATIVE_RELEASE_KIND,
    finishedUtc: new Date().toISOString(),
    candidatePlan: fs.existsSync(plan) ? JSON.parse(fs.readFileSync(plan, "utf8")) : null,
    commands: rows,
    passed: rows.filter((r) => r.exitCode === 0).map((r) => r.id),
    failed: rows.filter((r) => r.exitCode !== 0).map((r) => r.id),
    stage: process.env.SOURCE5_STAGE,
    deferredToAcceptance: fs.readFileSync("tools/remote-acr/acceptance-evidence-tests.txt", "utf8").split("\n").filter((l) => l && !l.startsWith("#")),
    browserAcceptance: "not-run",
    // Packed-candidate reference for docs/api/public-api.md (written by api-docs-packed).
    generatedApiReference: (() => {
      const file = `${process.env.NATIVE_REPORT_DIR}/public-api.md`;
      if (!fs.existsSync(file)) return null;
      const text = fs.readFileSync(file, "utf8");
      return { path: "docs/api/public-api.md", sha256: require("crypto").createHash("sha256").update(text).digest("hex"), text };
    })()
  };
  process.stdout.write(Buffer.from(JSON.stringify(out)).toString("base64").replace(/(.{76})/g, "$1\n") + "\n");
'
echo "::: SOURCE5_REPORT_END"
FAILED=$(awk -F'\t' '$2 != 0' "$RESULTS" | wc -l | tr -d ' ')
echo "SOURCE5_EXIT=${FAILED}"
exit 0
