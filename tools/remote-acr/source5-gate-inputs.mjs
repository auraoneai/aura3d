#!/usr/bin/env node
/**
 * Aura3D 5.0 freeze adapter: ACR source5 run directories -> the exact inputs of
 * `tools/native-capability-gate/index.mjs --phase code-complete`.
 *
 *   node tools/remote-acr/source5-gate-inputs.mjs --run tests/reports/native-5/<full-pass> \
 *     [--run tests/reports/native-5/<rerun> ...] [--scope docs/prds/aura3d-5.0-scope.md] [--out <file>]
 *
 * The first --run is the full pass (`tools/remote-acr/run-source5.sh`, all stages).
 * Later --run directories are reruns of single stages (`STAGES=... run-source5.sh`)
 * on the SAME commit; per stage, the LAST run that attempted it wins, pass or fail.
 *
 * Inputs read from each run directory (written by run-source5.sh):
 *   source-report.json      aura3d.source5-report/2 (candidate, stages, commands, problems,
 *                           `artifacts` = retained packed-a uploads, see ARTIFACTS_SCHEMA;
 *                           `artifacts.consumers` / `artifacts.examples` = retained packed-b consumer
 *                           reports / the merged packed-c1..cN example report, see CONSUMERS_SCHEMA)
 *   stage-<stage>.json/.rc  per-stage report and `az acr run` exit code
 *   acr-run-<stage>.log     per-stage log (hashed as the check artifact)
 *   source-manifest.json    full pass only: the staged aura3d.native-source-manifest/1
 *                           (= AURA3D_SOURCE_MANIFEST in the job), SHA-256 recorded as
 *                           candidate.sourceManifestSha256 -> the gate's --source-manifest
 *
 * Output: one file, `source-reports.json` (aura3d.source5-gate-inputs/1; default
 * `<full-pass>/gate-inputs/source-reports.json`, never overwritten) listing every
 * expected check with its passing commands and artifacts, the candidate commit,
 * lockfile digest, retained candidate plan and archives (re-hashed here and in the
 * gate), the deferred-to-acceptance list and the scope-row completion.
 *
 * It REFUSES (exit 1, every reason listed) when any expected check is missing or
 * failed, a stage report or log is absent, runs mix commits, the packed stages
 * disagree on archive digests, a retained artifact is missing or does not hash to
 * the plan, or a required scope row is neither **DONE** nor a reviewed verify-only
 * row whose mapped checks passed. It never writes a value it did not read from a
 * retained report. The gate re-runs the same merge from the retained files
 * (`verifySource5GateInputs`), so hand-editing the output cannot open it.
 */
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseScopeOutcomes } from '../native-capability-gate/index.mjs';
import { mergeExampleShardReports } from '../agent-examples/shard.mjs';

export const SOURCE5_REPORT_SCHEMA = 'aura3d.source5-report/2';
export const SOURCE5_STAGE_SCHEMA = 'aura3d.source5-report/1';
export const GATE_INPUTS_SCHEMA = 'aura3d.source5-gate-inputs/1';
export const SOURCE_MANIFEST_SCHEMA = 'aura3d.native-source-manifest/1';
export const SOURCE_MANIFEST_FILE = 'source-manifest.json';
export const REUSED_IMAGE = 'reused-image';
export const ACCEPTANCE_EVIDENCE_LIST = 'tools/remote-acr/acceptance-evidence-tests.txt';
export const DEFAULT_SCOPE = 'docs/prds/aura3d-5.0-scope.md';
/**
 * `source-report.json#artifacts`: the packed-a uploads downloaded by the launcher,
 * as written by `verifyDownloadedArtifacts` in tools/remote-acr/source5-artifacts.mjs
 * ({ schema: 'aura3d.source5-artifacts/1', ok, plan: { localPath, sha256 },
 * archives: [{ name, localPath, sha256, verified }], ... }). Paths are
 * repository-relative (or relative to the run directory). Every byte is re-hashed here.
 */
export const ARTIFACTS_SCHEMA = 'aura3d.source5-artifacts/1';
/**
 * `source-report.json#artifacts.consumers` / `#artifacts.examples`: the packed-b consumer reports
 * and the merged packed-c example report (union of the N shard bundles) downloaded and extracted by the
 * launcher, as written by `verifyDownloadedConsumers` / `verifyDownloadedExamples` in
 * tools/remote-acr/source5-artifacts.mjs ({ schema: 'aura3d.source5-consumers/1', kind, ok, runId,
 * index: { localPath, sha256 }, sourceConsumerReport / matrixSourceReport (consumers) or
 * examplesSourceReport (examples): { localPath, jobPath, sha256 }, shards (examples) }). Every indexed
 * file is re-hashed here, and for examples the union is re-proved from the retained shard reports
 * (every catalog id exactly once, merged report = merge of the shard reports); they become gate
 * inputs, each recorded with the in-job path (`jobPath`) the reports and their validators use.
 */
export const CONSUMERS_SCHEMA = 'aura3d.source5-consumers/1';
/** Bound report fields per retained bundle: `consumers` (packed-b) and `examples` (packed-c). */
const BUNDLE_FIELDS = Object.freeze({ consumers: ['sourceConsumerReport', 'matrixSourceReport'], examples: ['examplesSourceReport'] });
/** A safe repository-relative path (no absolute, backslash, control, empty, `.` or `..` part). */
const safeRelPath = path => typeof path === 'string' && !!path && !isAbsolute(path) && !path.includes('\\') && !/[\x00-\x1f\x7f]/.test(path)
  && path.split('/').every(part => part && part !== '.' && part !== '..');

const SHA = /^[a-f0-9]{64}$/;
const GIT_SHA = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;
const UNIT_STAGE = /^unit-([1-9]\d*)-of-([1-9]\d*)$/;
/** packed-c<I>: example shard I (of N, N taken from the `--shard I/N` its examples-source command ran). */
const EXAMPLE_STAGE = /^packed-c([1-9]\d*)$/;
const STAGE = /^(?:static|suites|packed-a|packed-b|packed-c[1-9]\d*|unit-[1-9]\d*-of-[1-9]\d*)$/;
const sha256 = data => createHash('sha256').update(data).digest('hex');
const sha512 = data => `sha512-${createHash('sha512').update(data).digest('base64')}`;
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
    : `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
const range = n => Array.from({ length: n }, (_, i) => i + 1);

/** Command IDs per stage, in run order, exactly as `tools/remote-acr/source5-run.sh` runs them. */
export const STAGE_COMMANDS = Object.freeze({
  static: ['typecheck', 'lint', 'resolution', 'browser-tests-tsc', 'release-tools'],
  suites: ['assets-qr', 'packages'],
  'packed-a': ['build', 'pack', 'package-dist-unit', 'api-baseline', 'integration', 'packages-dist', 'verify-exports', 'verify-imports',
    'tarballs', 'bundle-size', 'api-diff', 'api-contract', 'api-docs-packed', 'api-docs', 'artifacts-upload'],
  'packed-b': ['build', 'pack', 'clean-install', 'tree-shaking', 'consumer-matrix', 'runtime-audit', 'consumers-upload']
});
/** Commands of every example shard stage `packed-c<I>`, in run order. */
export const EXAMPLE_SHARD_COMMANDS = Object.freeze(['build', 'pack', 'examples-source', 'examples-upload']);
export const stageCommandIds = stage => (UNIT_STAGE.test(stage) ? [stage] : EXAMPLE_STAGE.test(stage) ? EXAMPLE_SHARD_COMMANDS : Object.hasOwn(STAGE_COMMANDS, stage) ? STAGE_COMMANDS[stage] : null);

/**
 * Expected-check inventory: the 24 Phase A §4 commands, in §4 order, then the
 * runner commands that prove S5-WP24-03 and retain the tested candidate. `from` names the stage commands that must
 * all exit 0; `unit-shards` = every `unit-<i>-of-<n>` shard; `example-shards:<id>` = that command in
 * every `packed-c<i>` shard stage. `test:parity` is
 * `tests/unit/parity`, run by the unit shards; tests/unit/package-dist needs built
 * packages and runs in packed-a right after `pnpm build`. Every packed stage (packed-a,
 * packed-b and each example shard packed-c<i>) rebuilds and repacks, so build/pack must pass in all of
 * them. The shards' `examples-source` (every catalog example installed from the packed candidate, one
 * slice per shard; not a §4 command) is folded into `clean-install`: both are clean installs of the
 * packed candidate, so it needs packed-b's clean-install AND every shard's examples-source.
 */
export const EXPECTED_CHECKS = Object.freeze([
  { id: 'typecheck', section4: 'pnpm typecheck', from: ['static:typecheck'] },
  { id: 'lint', section4: 'pnpm lint', from: ['static:lint'] },
  { id: 'resolution', section4: 'pnpm resolution:check', from: ['static:resolution'] },
  { id: 'parity', section4: 'pnpm test:parity', from: ['unit-shards'], satisfiedBy: 'unit' },
  { id: 'unit', section4: 'pnpm test:unit', from: ['unit-shards', 'packed-a:package-dist-unit'] },
  { id: 'assets-qr', section4: 'pnpm exec vitest run tests/assets tests/qr', from: ['suites:assets-qr'] },
  { id: 'packages', section4: 'pnpm test:packages', from: ['suites:packages'] },
  { id: 'release-tools', section4: 'node --test tools/release/*.test.mjs', from: ['static:release-tools'] },
  { id: 'build', section4: 'pnpm build', from: ['packed-a:build', 'packed-b:build', 'example-shards:build'] },
  { id: 'pack', section4: 'node tools/release/publish-all.mjs --pack-only', from: ['packed-a:pack', 'packed-b:pack', 'example-shards:pack'] },
  { id: 'api-baseline', section4: 'tools/public-surface-diff/prepare-baseline.ts', from: ['packed-a:api-baseline'] },
  { id: 'integration', section4: 'pnpm test:integration', from: ['packed-a:integration'] },
  { id: 'packages-dist', section4: 'pnpm test:packages:dist', from: ['packed-a:packages-dist'] },
  { id: 'browser-tests-tsc', section4: 'pnpm exec tsc -p tsconfig.browser-tests.json --noEmit', from: ['static:browser-tests-tsc'] },
  { id: 'verify-exports', section4: 'pnpm verify:exports', from: ['packed-a:verify-exports'] },
  { id: 'verify-imports', section4: 'pnpm verify:imports', from: ['packed-a:verify-imports'] },
  { id: 'tarballs', section4: 'pnpm check:tarballs', from: ['packed-a:tarballs'] },
  { id: 'clean-install', section4: 'tools/package-clean-install/index.ts --phase source', from: ['packed-b:clean-install', 'example-shards:examples-source'] },
  { id: 'tree-shaking', section4: 'tools/installed-tree-shaking/index.ts', from: ['packed-b:tree-shaking'] },
  { id: 'bundle-size', section4: 'pnpm check:bundle-size', from: ['packed-a:bundle-size'] },
  { id: 'api-diff', section4: 'tools/public-surface-diff/index.ts', from: ['packed-a:api-diff'] },
  { id: 'api-contract', section4: 'tools/public-api-contract/index.ts', from: ['packed-a:api-contract'] },
  { id: 'consumer-matrix', section4: 'tools/native-consumer-matrix/index.ts --phase source', from: ['packed-b:consumer-matrix'] },
  { id: 'runtime-audit', section4: 'tools/native-runtime-audit/index.ts --phase source', from: ['packed-b:runtime-audit'] },
  { id: 'api-docs-packed', section4: null, runner: 'S5-WP24-03', from: ['packed-a:api-docs-packed'] },
  { id: 'api-docs', section4: null, runner: 'S5-WP24-03', from: ['packed-a:api-docs'] },
  { id: 'artifacts-upload', section4: null, runner: 'candidate retention (plan, archives, packed reports; packed-b consumer reports; packed-c1..cN example reports)', from: ['packed-a:artifacts-upload', 'packed-b:consumers-upload', 'example-shards:examples-upload'] }
].map(Object.freeze));

/**
 * REVIEWED TABLE (owner decision record item 2: no re-derivation). The FINISH-5.0
 * rows of docs/prds/aura3d-5.0-scope.md that carry no **DONE** marker because
 * their remaining work is "verify in the source pass". Each completes only when
 * every listed check passed in the merged source report (and, where listed, the
 * named-defect rows it depends on are **DONE**). Changing this table changes the
 * gate's completion evidence: review it like a scope edit.
 */
export const VERIFY_ONLY_ROWS = Object.freeze({
  'S5-WP04-02': { checks: ['unit', 'assets-qr'], basis: 'existing lobe/material suites (tests/unit, tests/qr)' },
  'S5-WP11-02': { checks: ['unit'], basis: 'existing cross-path playback suites (tests/unit)' },
  'S5-WP12-02': { checks: ['unit'], basis: 'existing control cleanup suites (tests/unit); device gestures are Phase B' },
  'S5-WP13-03': { checks: ['unit', 'assets-qr'], basis: 'existing deterministic/statistical tests (tests/unit, tests/qr); rendered sample is Phase B' },
  'S5-WP15-02': { checks: ['unit', 'assets-qr'], basis: 'existing terrain/sky/scatter suites (tests/unit, tests/qr, tests/assets)' },
  'S5-WP16-01': { checks: ['unit'], basis: 'scheduler suites (tests/unit); browser timing is Phase B' },
  'S5-WP19-02': { checks: ['resolution', 'typecheck', 'integration'], basis: 'resolution:check registry exports, QR trees in typecheck, packed worker assets in integration' },
  'S5-WP19-03': { checks: ['integration'], basis: 'packed ESM/CJS Node matrix in tests/integration/native-capability-consumer.test.ts' },
  'S5-WP19-05': { checks: ['tarballs', 'lint', 'release-tools'], basis: 'PACKAGE_INVENTORY drives tarball audit targets, ESLint boundary plugin and release tools' },
  'S5-WP19-07': { checks: ['clean-install', 'consumer-matrix', 'runtime-audit'], basis: 'row closes when no external engine appears in any packed/install profile' },
  'S5-WP20-07': { checks: ['unit'], basis: 'soak accounting unit test; runtime soak proof is Phase B' },
  'S5-WP24-01': { checks: ['api-baseline', 'api-diff'], basis: 'baseline metadata verified, comparator on the exact packed candidate' },
  'S5-WP24-02': { checks: ['api-baseline', 'api-diff'], requiresDone: ['S5-DEF-07'], basis: 'comparator on the candidate; migration record is S5-DEF-07' },
  'S5-WP24-03': { checks: ['api-docs-packed', 'api-docs'], basis: 'reference regenerated from packed declarations and verified' },
  'S5-WP25-02': { checks: ['bundle-size'], basis: 'gzip budgets measured on the candidate' },
  'S5-WP25-04': { checks: ['unit'], requiresDone: ['S5-DEF-01'], basis: 'fence assertion conflicts are S5-DEF-01; teardown suites in tests/unit' },
  'S5-WP26-02': { checks: ['unit'], basis: 'line diagnostic suites (tests/unit); rendered output is Phase B' },
  'S5-WP29-01': { checks: ['clean-install', 'runtime-audit', 'consumer-matrix'], basis: 'scaffold profile graph and packed-runtime audit' },
  'S5-WP29-02': { checks: ['tarballs', 'runtime-audit', 'clean-install', 'consumer-matrix'], basis: 'archive scan on the packed candidate and offline consumers on ACR' }
});

export class Source5GateInputsError extends Error {
  constructor(problems) {
    super(`source5 gate inputs REFUSED:\n${problems.map(p => `  - ${p}`).join('\n')}`);
    this.problems = problems;
  }
}

/** A scope row is DONE when its remaining-work text has a **DONE marker not followed by a later **PARTIAL marker. */
export function rowIsDone(row) {
  const markers = [...String(row?.remaining ?? '').matchAll(/\*\*(DONE|PARTIAL)\b/g)];
  return markers.length > 0 && markers.at(-1)[1] === 'DONE';
}

/** Completed required scope rows: **DONE** rows, plus reviewed verify-only rows whose mapped checks passed. */
export function deriveCompletion(scope, passingCheckIds, table = VERIFY_ONLY_ROWS) {
  const problems = [], completion = [];
  const required = new Set(scope.required), byId = new Map(scope.rows.map(row => [row.id, row]));
  const known = new Set(EXPECTED_CHECKS.map(check => check.id)), passing = new Set(passingCheckIds);
  for (const [id, entry] of Object.entries(table)) {
    if (!required.has(id)) problems.push(`verify-only table row ${id} is not a required (FINISH-5.0 / named-defect) scope row`);
    if (!Array.isArray(entry.checks) || !entry.checks.length) problems.push(`verify-only table row ${id} names no checks`);
    for (const check of entry.checks ?? []) if (!known.has(check)) problems.push(`verify-only table row ${id} names unknown check ${check}`);
  }
  for (const row of scope.rows.filter(r => required.has(r.id))) {
    if (rowIsDone(row)) { completion.push({ id: row.id, basis: 'done-marker' }); continue; }
    const entry = table[row.id];
    if (!entry) { problems.push(`required scope row ${row.id} has no **DONE** marker and no reviewed verify-only check mapping`); continue; }
    const notPassing = (entry.checks ?? []).filter(check => !passing.has(check));
    const notDone = (entry.requiresDone ?? []).filter(id => !byId.has(id) || !rowIsDone(byId.get(id)));
    if (notPassing.length) problems.push(`required scope row ${row.id} (verify-only): mapped checks not passing: ${notPassing.join(', ')}`);
    if (notDone.length) problems.push(`required scope row ${row.id} (verify-only): prerequisite rows not **DONE**: ${notDone.join(', ')}`);
    if (!notPassing.length && !notDone.length) completion.push({ id: row.id, basis: 'verified-checks', checks: [...entry.checks], ...(entry.requiresDone ? { requiresDone: [...entry.requiresDone] } : {}) });
  }
  return { problems, completedOutcomeIds: completion.map(item => item.id), completion };
}

const ref = (io, path) => { const data = io.read(path); return { path, sha256: sha256(data), data }; };
const strip = ({ data: _data, ...rest }) => rest;
const json = data => { try { return JSON.parse(data.toString('utf8')); } catch { return null; } };
/** Artifact paths may be repository-relative or relative to the run directory. */
function artifactPath(io, dir, path) {
  if (typeof path !== 'string' || !path || isAbsolute(path)) return null;
  if (path.startsWith(`${dir}/`) && io.exists(path)) return path;
  return io.exists(`${dir}/${path}`) ? `${dir}/${path}` : io.exists(path) ? path : null;
}

/**
 * Read one run directory through `io` ({ read(path) -> Buffer, exists(path) -> boolean },
 * repository-relative paths). Recorded artifact digests are re-checked against the bytes.
 */
export function loadRun(io, dir) {
  const run = { dir, runId: basename(String(dir)), report: null, reportRef: null, stages: {}, manifest: null, artifacts: null, problems: [] };
  const reportPath = `${dir}/source-report.json`;
  if (!io.exists(reportPath)) { run.problems.push(`${dir}: source-report.json missing`); return run; }
  const reportFile = ref(io, reportPath);
  run.reportRef = strip(reportFile);
  run.report = json(reportFile.data);
  if (!run.report || typeof run.report !== 'object') { run.problems.push(`${dir}: source-report.json is not JSON`); run.report = null; return run; }
  for (const stage of Array.isArray(run.report.stages) ? run.report.stages : []) {
    if (typeof stage !== 'string' || !STAGE.test(stage)) continue;
    const entry = { json: null, rc: null, log: null };
    const stagePath = `${dir}/stage-${stage}.json`, rcPath = `${dir}/stage-${stage}.rc`, logPath = `${dir}/acr-run-${stage}.log`;
    if (io.exists(stagePath)) { const file = ref(io, stagePath); entry.json = { ...strip(file), content: json(file.data) }; }
    if (io.exists(rcPath)) { const text = io.read(rcPath).toString('utf8').trim(); entry.rc = /^\d+$/.test(text) ? Number(text) : text; }
    if (io.exists(logPath)) entry.log = strip(ref(io, logPath));
    run.stages[stage] = entry;
  }
  const manifestPath = `${dir}/${SOURCE_MANIFEST_FILE}`;
  if (io.exists(manifestPath)) { const file = ref(io, manifestPath); run.manifest = { ...strip(file), content: json(file.data) }; }
  const recorded = run.report.artifacts;
  // packed-a's part; a packed-b-only rerun records just `artifacts.consumers`.
  if (recorded && typeof recorded === 'object' && !Array.isArray(recorded) && ['schema', 'ok', 'plan'].some(key => recorded[key] !== undefined)) {
    const artifacts = { candidatePlan: null, archives: [], problems: [] };
    if (recorded.schema !== ARTIFACTS_SCHEMA || recorded.ok !== true) artifacts.problems.push(`retained artifacts were not verified by the launcher (${ARTIFACTS_SCHEMA}, ok: ${recorded.ok}): ${(recorded.problems ?? []).join('; ')}`);
    const planRecord = recorded.plan ?? null, planWhere = planRecord?.localPath ?? planRecord?.path;
    const planPath = artifactPath(io, dir, planWhere);
    if (!planPath) artifacts.problems.push(`retained candidate plan ${JSON.stringify(planWhere)} not found`);
    else {
      const file = ref(io, planPath);
      if (file.sha256 !== planRecord.sha256) artifacts.problems.push(`retained candidate plan ${planPath} does not match its recorded SHA-256`);
      artifacts.candidatePlan = { ...strip(file), content: json(file.data) };
    }
    for (const archive of Array.isArray(recorded.archives) ? recorded.archives : []) {
      const where = archive?.localPath ?? archive?.path, path = artifactPath(io, dir, where);
      if (!path) { artifacts.problems.push(`retained archive ${JSON.stringify(where)} not found`); continue; }
      const data = io.read(path), digest = sha256(data);
      if (digest !== archive.sha256) artifacts.problems.push(`retained archive ${path} does not match its recorded SHA-256`);
      artifacts.archives.push({ path, sha256: digest, integrity: sha512(data) });
    }
    run.artifacts = artifacts;
  }
  if (recorded?.consumers && typeof recorded.consumers === 'object') run.consumers = loadConsumers(io, dir, run.runId, recorded.consumers, 'consumers');
  if (recorded?.examples && typeof recorded.examples === 'object') run.examples = loadConsumers(io, dir, run.runId, recorded.examples, 'examples');
  return run;
}

/** Re-read an extracted bundle (packed-b consumers / packed-c examples) through its retained index; every byte is re-hashed. */
function loadConsumers(io, dir, runId, recorded, kind) {
  const consumers = { value: null, problems: [] }, problems = consumers.problems;
  if (recorded.schema !== CONSUMERS_SCHEMA || recorded.ok !== true) { problems.push(`retained consumer reports were not verified by the launcher (${CONSUMERS_SCHEMA}, ok: ${recorded.ok}): ${(recorded.problems ?? []).join('; ')}`); return consumers; }
  const indexPath = artifactPath(io, dir, recorded.index?.localPath);
  if (!indexPath) { problems.push(`retained consumer index ${JSON.stringify(recorded.index?.localPath)} not found`); return consumers; }
  const indexFile = ref(io, indexPath), index = json(indexFile.data);
  if (indexFile.sha256 !== recorded.index.sha256) problems.push(`retained consumer index ${indexPath} does not match its recorded SHA-256`);
  if (index?.schema !== CONSUMERS_SCHEMA || index.kind !== kind || index.runId !== runId || !Array.isArray(index.files)) { problems.push(`retained consumer index ${indexPath} is not a ${CONSUMERS_SCHEMA} ${kind} index of run ${runId}`); return consumers; }
  const base = dirname(indexPath), files = [], byJob = new Map();
  for (const file of index.files) {
    const jobPath = file?.path;
    if (typeof jobPath !== 'string' || !jobPath || isAbsolute(jobPath) || jobPath.split('/').some(part => !part || part === '.' || part === '..')) { problems.push(`retained consumer index lists an unsafe path ${JSON.stringify(jobPath)}`); continue; }
    const path = `${base}/${jobPath}`;
    if (!io.exists(path)) { problems.push(`retained consumer file missing: ${path}`); continue; }
    const data = io.read(path), digest = sha256(data);
    if (digest !== file.sha256) problems.push(`retained consumer file ${path} does not match the consumer index`);
    files.push({ path, jobPath, sha256: digest });
    byJob.set(jobPath, { path, sha256: digest, data });
  }
  // Examples: the merged union must be exactly the retained shard bundles (every catalog id once).
  const shardUnion = kind === 'examples' ? loadExampleShards({ io, base, index, recorded, byJob, runId, files, problems }) : null;
  const reports = {}, planRefs = [];
  for (const field of BUNDLE_FIELDS[kind]) {
    const jobPath = index.reports?.[field]?.path, file = byJob.get(jobPath);
    if (!file || index.reports[field].sha256 !== file.sha256 || recorded[field]?.jobPath !== jobPath || recorded[field]?.sha256 !== file.sha256) { problems.push(`retained ${field} ${JSON.stringify(jobPath)} is missing or differs from the consumer index`); continue; }
    reports[field] = { path: file.path, jobPath, sha256: file.sha256 };
    // The candidate plan each report was produced against (in-job path + SHA-256).
    const content = json(file.data);
    const plan = field === 'examplesSourceReport' ? { path: content?.candidatePlan, sha256: content?.candidateSha256 } : { path: content?.candidate?.path, sha256: content?.candidate?.sha256 };
    if (!safeRelPath(plan.path) || !SHA.test(plan.sha256 ?? '')) problems.push(`retained ${field} does not name its candidate plan (path + SHA-256)`);
    else planRefs.push({ field, ...plan });
  }
  if (!problems.length && new Set(planRefs.map(ref => `${ref.path}\0${ref.sha256}`)).size !== 1) problems.push(`retained consumer reports name different candidate plans (${planRefs.map(ref => `${ref.field}=${ref.path}@${ref.sha256}`).join(', ')})`);
  if (!problems.length) consumers.value = { runId, index: { path: indexFile.path, sha256: indexFile.sha256 }, ...reports, ...(shardUnion ? { shardCount: shardUnion.count, shardIndexes: shardUnion.indexes } : {}), files };
  // Plan the bundle's reports name (in-job path + SHA-256); consumers' path becomes the plan's jobPath.
  consumers.candidatePlan = planRefs[0] ? { jobPath: planRefs[0].path, sha256: planRefs[0].sha256 } : null;
  return consumers;
}
/**
 * Re-prove the retained examples union: the merged index names `shardCount` shard bundles, each shard
 * index and report is retained with the recorded bytes, every file a shard index lists is in the union
 * with the same SHA-256 (and the union holds nothing else but the merged report), and the merged
 * `examples-source.json` is exactly the merge of the shard reports (`mergeExampleShardReports`: one
 * consistent catalog partition, every catalog id covered exactly once, no shard missing).
 */
function loadExampleShards({ io, base, index, recorded, byJob, runId, files, problems }) {
  const count = index.shardCount;
  if (index.merged !== true || !Number.isInteger(count) || count < 1 || !Array.isArray(index.shards) || index.shards.length !== count) { problems.push('retained examples index is not a merged shard union (merged, shardCount, shards)'); return null; }
  if (canonical(recorded.shards ?? null) !== canonical(index.shards)) { problems.push('retained examples shard list differs from the launcher record'); return null; }
  const before = problems.length, reports = [], indexes = [], accounted = new Set([index.reports?.examplesSourceReport?.path]);
  for (let i = 1; i <= count; i += 1) {
    const entry = index.shards.find(item => item?.shard === i);
    if (!entry || entry.count !== count || entry.indexFile?.path !== `consumer-index.shard-${i}-of-${count}.json`) { problems.push(`retained examples index lacks a valid shard ${i}/${count} entry`); continue; }
    const indexPath = `${base}/${entry.indexFile.path}`;
    if (!io.exists(indexPath)) { problems.push(`retained shard index missing: ${indexPath}`); continue; }
    const file = ref(io, indexPath), shardIndex = json(file.data);
    if (file.sha256 !== entry.indexFile.sha256) problems.push(`retained shard index ${indexPath} does not match its recorded SHA-256`);
    if (shardIndex?.schema !== CONSUMERS_SCHEMA || shardIndex.kind !== 'examples' || shardIndex.runId !== runId || canonical(shardIndex.shard ?? null) !== canonical({ index: i, count }) || !Array.isArray(shardIndex.files)) { problems.push(`retained shard index ${indexPath} is not shard ${i}/${count} of run ${runId}`); continue; }
    for (const item of shardIndex.files) {
      accounted.add(item?.path);
      const inUnion = byJob.get(item?.path);
      if (!inUnion || inUnion.sha256 !== item.sha256) problems.push(`retained shard ${i}/${count} file ${JSON.stringify(item?.path)} is missing from the union or differs`);
    }
    const reportFile = byJob.get(entry.report?.path);
    if (!reportFile || reportFile.sha256 !== entry.report.sha256 || shardIndex.reports?.examplesShardReport?.path !== entry.report.path || shardIndex.reports.examplesShardReport.sha256 !== entry.report.sha256) { problems.push(`retained shard ${i}/${count} report is missing or differs from its index`); continue; }
    const report = json(reportFile.data);
    if (report?.runId !== runId) problems.push(`retained shard ${i}/${count} report is for run ${report?.runId}, not ${runId}`);
    if (report?.shard?.index !== i || report.shard.count !== count) problems.push(`retained shard ${i}/${count} report says it is shard ${report?.shard?.index}/${report?.shard?.count}`);
    reports.push(report);
    indexes.push({ shard: i, path: indexPath, sha256: file.sha256 });
  }
  for (const item of files) if (!accounted.has(item.jobPath)) problems.push(`retained examples union holds a file no shard index lists: ${item.jobPath}`);
  if (problems.length > before) return null;
  const union = mergeExampleShardReports(reports, count);
  if (union.problems.length) { problems.push(...union.problems.map(problem => `retained example shards: ${problem}`)); return null; }
  const merged = byJob.get(index.reports?.examplesSourceReport?.path);
  if (!merged || canonical(json(merged.data)) !== canonical(union.merged)) { problems.push('retained examples-source.json is not the union of the retained shard reports'); return null; }
  return { count, indexes };
}
export const runSummary = run => ({ dir: run.dir, runId: run.runId, sourceReport: run.reportRef, stagesRun: run.report?.stages ?? [] });

function checkPlan(plan, where, commit, lockfileSha256, problems) {
  if (!plan || typeof plan !== 'object') { problems.push(`${where} missing (pack produced no candidate plan)`); return null; }
  const bad = [];
  if (plan.schema !== 'aura3d-release-plan/1.0') bad.push(`schema ${JSON.stringify(plan.schema)}`);
  if (plan.packOnly !== true) bad.push('packOnly is not true');
  if (plan.commit !== commit) bad.push(`commit ${plan.commit} is not the candidate commit ${commit}`);
  if (plan.lockfileSha256 !== lockfileSha256) bad.push(`lockfileSha256 ${plan.lockfileSha256} differs from the tested lockfile`);
  if (!Array.isArray(plan.packages) || !plan.packages.length) bad.push('no packages');
  else {
    if (plan.packageCount !== plan.packages.length) bad.push('packageCount does not match packages');
    for (const pkg of plan.packages) {
      if (typeof pkg?.name !== 'string' || !pkg.name || pkg.version !== plan.version || typeof pkg.tarball !== 'string' || !pkg.tarball
        || !SHA.test(pkg.sha256 ?? '') || !/^sha512-[A-Za-z0-9+/]+={0,2}$/.test(pkg.integrity ?? '')) bad.push(`package ${pkg?.name ?? '?'} lacks name/version/tarball/sha256/integrity`);
    }
    if (new Set(plan.packages.map(pkg => pkg?.name)).size !== plan.packages.length) bad.push('duplicate package names');
  }
  if (bad.length) { problems.push(`${where}: ${bad.join('; ')}`); return null; }
  return plan;
}

/** Merge loaded runs (first = full pass, later = stage reruns; last attempt per stage wins). Pure; the gate re-runs it. */
export function mergeRuns(runs) {
  const problems = runs.flatMap(run => run.problems);
  if (!runs.length) return { problems: ['no source5 run directories given'], value: null };
  const base = runs[0], baseCandidate = base.report?.candidate ?? {};
  for (const run of runs) {
    if (!run.report) continue;
    if (run.report.schema !== SOURCE5_REPORT_SCHEMA) problems.push(`${run.dir}: schema ${JSON.stringify(run.report.schema)}, expected ${SOURCE5_REPORT_SCHEMA}`);
    if (!GIT_SHA.test(run.report.candidate?.commit ?? '')) problems.push(`${run.dir}: candidate commit missing or not a full SHA`);
    if (run.report.browserAcceptance !== 'not-run') problems.push(`${run.dir}: browserAcceptance is not "not-run"`);
  }
  const commits = [...new Set(runs.map(run => run.report?.candidate?.commit))];
  if (commits.length > 1) problems.push(`runs mix candidate commits (${runs.map(run => `${run.dir}=${run.report?.candidate?.commit}`).join(', ')}); every run must test the same commit`);
  const commit = baseCandidate.commit, lockfileSha256 = baseCandidate.lockfileSha256;
  if (!SHA.test(baseCandidate.sourceManifestSha256 ?? '') || !SHA.test(lockfileSha256 ?? '')) problems.push(`${base.dir}: the first run must be a full pass with a real source manifest and lockfile digest (BUILD=0 reruns go after it)`);
  else if (!base.manifest) problems.push(`${base.dir}/${SOURCE_MANIFEST_FILE} missing`);
  else if (base.manifest.sha256 !== baseCandidate.sourceManifestSha256) problems.push(`${base.dir}/${SOURCE_MANIFEST_FILE} does not match the recorded sourceManifestSha256`);
  else {
    const m = base.manifest.content;
    if (m?.schema !== SOURCE_MANIFEST_SCHEMA || m.origin?.commit !== commit || m.lockfileSha256 !== lockfileSha256 || !Array.isArray(m.files) || !m.files.length) problems.push(`${base.dir}/${SOURCE_MANIFEST_FILE} is not a ${SOURCE_MANIFEST_SCHEMA} manifest of the candidate commit and lockfile`);
  }
  for (const run of runs.slice(1)) {
    for (const key of ['sourceManifestSha256', 'lockfileSha256']) {
      const value = run.report?.candidate?.[key];
      if (run.report && value !== baseCandidate[key] && value !== REUSED_IMAGE) problems.push(`${run.dir}: ${key} ${value} differs from the full pass ${base.dir}`);
    }
  }
  const winners = new Map();
  for (const run of runs) for (const stage of Array.isArray(run.report?.stages) ? run.report.stages : []) {
    if (typeof stage !== 'string' || !STAGE.test(stage)) { problems.push(`${run.dir}: unknown stage ${JSON.stringify(stage)}`); continue; }
    winners.set(stage, run);
  }
  const shardCounts = [...new Set([...winners.keys()].map(stage => UNIT_STAGE.exec(stage)?.[2]).filter(Boolean))];
  if (shardCounts.length !== 1) problems.push(`unit shards: expected one shard count, found ${shardCounts.join(', ') || 'no unit stage'}`);
  const shards = shardCounts.length === 1 ? Number(shardCounts[0]) : 0;
  // Example shards: N is the `--shard I/N` count their examples-source commands ran with (one value for all).
  const shardOfCommand = stage => /--shard \d+\/(\d+)(?!\d)/.exec(winners.get(stage)?.stages[stage]?.json?.content?.commands?.find(command => command?.id === 'examples-source')?.command ?? '')?.[1] ?? '?';
  const exampleCounts = [...new Set([...winners.keys()].filter(stage => EXAMPLE_STAGE.test(stage)).map(shardOfCommand))];
  if (exampleCounts.length !== 1 || exampleCounts[0] === '?') problems.push(`example shards: expected one shard count in the examples-source commands, found ${exampleCounts.join(', ') || 'no packed-c shard stage'}`);
  const exampleShards = exampleCounts.length === 1 && exampleCounts[0] !== '?' ? Number(exampleCounts[0]) : 0;
  const exampleStages = range(exampleShards).map(i => `packed-c${i}`);
  const required = ['static', 'suites', 'packed-a', 'packed-b', ...exampleStages, ...range(shards).map(i => `unit-${i}-of-${shards}`)];
  // The shards' reports are merged into one examples report per run, so all of them come from one run.
  for (const stage of exampleStages) {
    const run = winners.get(stage), first = winners.get('packed-c1');
    if (run && first && run !== first) problems.push(`${stage} ran in ${run.dir} but packed-c1 in ${first.dir}: the example shards merge into one report per run, so rerun all ${exampleShards} together (STAGES="${exampleStages.join(' ')}")`);
  }
  for (const stage of required) if (!winners.has(stage)) problems.push(`stage ${stage} never ran`);
  for (const stage of winners.keys()) if (!required.includes(stage)) problems.push(`unexpected stage ${stage}`);
  for (const run of runs) for (const problem of Array.isArray(run.report?.problems) ? run.report.problems : []) {
    const stage = /^stage (\S+): report missing/.exec(problem)?.[1];
    if (stage && winners.get(stage) !== run) continue; // superseded by a later attempt of that stage
    if (/^artifacts: /.test(problem) && winners.get('packed-a') !== run) continue; // packed-a artifacts superseded by a later packed-a run
    if (/^consumers: /.test(problem) && winners.get('packed-b') !== run) continue; // packed-b consumer reports superseded by a later packed-b run
    if (/^examples: /.test(problem) && winners.get('packed-c1') !== run) continue; // example reports superseded by a later run of the shards
    if (/^candidate archive digests differ/.test(problem)) continue; // recomputed below from the winning packed stages
    problems.push(`${run.dir}: ${problem}`);
  }
  const observed = new Map(), stageSources = {}, plans = {};
  let releaseKind = null, deferred = null;
  for (const stage of required) {
    const run = winners.get(stage); if (!run) continue;
    const entry = run.stages[stage], where = `${run.dir} stage ${stage}`;
    if (!entry?.json?.content) { problems.push(`${where}: no stage report (stage-${stage}.json missing or empty)`); continue; }
    if (entry.rc !== 0) problems.push(`${where}: az acr run exit ${entry.rc ?? 'unrecorded'}`);
    if (!entry.log) problems.push(`${where}: log acr-run-${stage}.log missing`);
    const content = entry.json.content;
    if (content.schema !== SOURCE5_STAGE_SCHEMA || content.stage !== stage || content.runId !== run.runId) problems.push(`${where}: stage report identity (schema/stage/runId) mismatch`);
    if (content.browserAcceptance !== 'not-run') problems.push(`${where}: browserAcceptance is not "not-run"`);
    const commands = Array.isArray(content.commands) ? content.commands : [];
    const ids = commands.map(command => command?.id), expected = stageCommandIds(stage);
    if (canonical(ids) !== canonical(expected)) problems.push(`${where}: ran [${ids.join(', ')}] but the runner defines [${expected.join(', ')}]`);
    const merged = (Array.isArray(run.report.commands) ? run.report.commands : []).filter(command => command?.stage === stage).map(({ stage: _stage, ...rest }) => rest);
    if (canonical(merged) !== canonical(commands)) problems.push(`${where}: source-report.json commands differ from stage-${stage}.json`);
    const unit = UNIT_STAGE.exec(stage), example = EXAMPLE_STAGE.exec(stage);
    for (const command of commands) {
      if (!Number.isInteger(command?.exitCode) || typeof command.seconds !== 'number' || typeof command.command !== 'string' || !command.command) { problems.push(`${where}: command ${command?.id} has no exit code/duration/command`); continue; }
      if (unit && (!command.command.includes('vitest run tests/unit') || !command.command.includes(`--shard=${unit[1]}/${unit[2]}`))) problems.push(`${where}: unit shard command does not run tests/unit shard ${unit[1]}/${unit[2]}`);
      if (example && command.id === 'examples-source' && !(command.command.includes('--packed') && new RegExp(`--shard ${example[1]}/${exampleShards}(?!\\d)`).test(command.command))) problems.push(`${where}: examples-source does not run packed example shard ${example[1]}/${exampleShards}`);
      if (example && command.id === 'examples-upload' && !(command.command.includes('stage-examples') && command.command.includes(` ${example[1]}/${exampleShards}`))) problems.push(`${where}: examples-upload does not retain packed example shard ${example[1]}/${exampleShards}`);
      observed.set(`${stage}:${command.id}`, { runId: run.runId, stage, id: command.id, exitCode: command.exitCode, seconds: command.seconds, command: command.command });
    }
    if (releaseKind === null) releaseKind = content.releaseKind;
    else if (content.releaseKind !== releaseKind) problems.push(`${where}: release kind ${content.releaseKind} differs from ${releaseKind}`);
    const list = content.deferredToAcceptance;
    if (!Array.isArray(list) || !list.length || list.some(item => typeof item !== 'string' || !item)) problems.push(`${where}: deferredToAcceptance missing`);
    else if (deferred === null) deferred = list;
    else if (canonical(list) !== canonical(deferred)) problems.push(`${where}: deferredToAcceptance differs between stages`);
    if (/^packed-[ab]$/.test(stage) || EXAMPLE_STAGE.test(stage)) plans[stage] = content.candidatePlan;
    stageSources[stage] = { runId: run.runId, stageReport: { path: entry.json.path, sha256: entry.json.sha256 }, log: entry.log };
  }
  if (!['patch', 'minor', 'major'].includes(releaseKind)) problems.push(`release kind ${JSON.stringify(releaseKind)} is invalid`);
  // `from` tokens: `<stage>:<id>`, `unit-shards`, or `example-shards:<id>` (that command in every packed-c<i>).
  const expandFrom = from => (from === 'unit-shards' ? range(shards).map(i => `unit-${i}-of-${shards}:unit-${i}-of-${shards}`)
    : from.startsWith('example-shards:') ? (exampleStages.length ? exampleStages : ['packed-c1']).map(stage => `${stage}:${from.slice('example-shards:'.length)}`) : [from]);
  const consumed = new Set(EXPECTED_CHECKS.flatMap(def => def.from.flatMap(expandFrom)));
  for (const [key, command] of observed) if (!consumed.has(key) && !/^unit-/.test(key) && command.exitCode !== 0) problems.push(`command ${key} FAILED exit ${command.exitCode} (run ${command.runId})`);
  const checks = EXPECTED_CHECKS.map(def => {
    const keys = def.from.flatMap(expandFrom);
    const commands = keys.map(key => observed.get(key) ?? null);
    const missing = keys.filter((_, i) => !commands[i]), failed = commands.filter(command => command && command.exitCode !== 0);
    if (missing.length) problems.push(`check ${def.id}: no result for ${missing.join(', ')}`);
    if (failed.length) problems.push(`check ${def.id}: FAILED ${failed.map(c => `${c.stage}:${c.id} exit ${c.exitCode} (run ${c.runId})`).join(', ')}`);
    const stages = [...new Set(keys.map(key => key.split(':')[0]))].filter(stage => stageSources[stage]);
    return { id: def.id, section4Command: def.section4, ...(def.runner ? { runnerCheckFor: def.runner } : {}), ...(def.satisfiedBy ? { satisfiedBy: def.satisfiedBy } : {}),
      status: missing.length || failed.length ? 'failed' : 'passed', commands: commands.filter(Boolean),
      artifacts: stages.flatMap(stage => [stageSources[stage].stageReport, stageSources[stage].log].filter(Boolean)) };
  });
  const planA = checkPlan(plans['packed-a'], 'packed-a candidate plan', commit, lockfileSha256, problems);
  const digests = plan => canonical(plan.packages.map(pkg => [pkg.name, pkg.version, pkg.sha256, pkg.integrity]));
  // packed-b's and the example shards' reports bind their own plan bytes; acceptance places packed-a's retained
  // plan at their in-job path, so every packed stage's plan must be identical (the launcher pins generatedAt).
  for (const stage of ['packed-b', ...exampleStages]) {
    const other = checkPlan(plans[stage], `${stage} candidate plan`, commit, lockfileSha256, problems);
    if (!planA || !other) continue;
    if (digests(planA) !== digests(other)) problems.push(`candidate archive digests differ between packed-a and ${stage} (rebuild/repack is not reproducible)`);
    else if (canonical(planA) !== canonical(other)) problems.push(`candidate plans differ between packed-a and ${stage} (plan time not pinned: A3D_PLAN_GENERATED_AT)`);
  }
  // The exact candidate archives, retained by the packed-a run (uploaded, downloaded, SHA-256-verified).
  const packedRun = winners.get('packed-a');
  let candidatePlan = null, archives = [];
  if (packedRun) {
    const retained = packedRun.artifacts;
    if (!retained) problems.push(`${packedRun.dir}: source-report.json has no retained artifacts (candidate plan + archives); rerun packed-a with the artifact-retaining launcher`);
    else {
      problems.push(...retained.problems.map(problem => `${packedRun.dir}: ${problem}`));
      if (retained.candidatePlan && planA && canonical(retained.candidatePlan.content) !== canonical(planA)) problems.push(`${packedRun.dir}: retained candidate plan differs from the packed-a stage plan`);
      if (retained.candidatePlan) candidatePlan = { path: retained.candidatePlan.path, sha256: retained.candidatePlan.sha256 };
      if (planA) {
        archives = planA.packages.map(pkg => {
          const found = retained.archives.filter(archive => archive.sha256 === pkg.sha256);
          if (found.length !== 1) { problems.push(`${packedRun.dir}: archive for ${pkg.name}@${pkg.version} (${pkg.sha256}) is not retained exactly once`); return null; }
          if (found[0].integrity !== pkg.integrity) problems.push(`${packedRun.dir}: retained archive ${found[0].path} SHA-512 integrity differs from the plan`);
          if (!safeRelPath(pkg.tarball)) problems.push(`${packedRun.dir}: plan archive path for ${pkg.name} is not a safe repository-relative path`);
          // jobPath: where the source jobs (and their reports) read this archive.
          return { name: pkg.name, version: pkg.version, tarball: pkg.tarball, path: found[0].path, jobPath: pkg.tarball, sha256: pkg.sha256, integrity: pkg.integrity };
        }).filter(Boolean);
        if (retained.archives.length !== planA.packages.length) problems.push(`${packedRun.dir}: ${retained.archives.length} retained archives for ${planA.packages.length} planned packages`);
      }
    }
  }
  // The packed-b consumer source reports and the packed-c example source report (and every file they
  // reference), retained by the winning packed-b / packed-c runs. Each must name the retained candidate
  // plan's SHA-256; acceptance stages that plan at the consumer reports' in-job path (the clean-install and
  // matrix tools compare paths; the example validator binds the plan by SHA-256).
  const bundles = {};
  for (const [stage, kind] of [['packed-b', 'consumers'], ['packed-c1', 'examples']]) {
    const run = winners.get(stage);
    if (!run) continue;
    const bundle = run[kind];
    if (!bundle) { problems.push(`${run.dir}: source-report.json has no retained ${kind} reports (artifacts.${kind}); rerun ${kind === 'examples' ? 'all packed-c shards' : stage} with the retaining launcher`); continue; }
    problems.push(...bundle.problems.map(problem => `${run.dir}: ${problem}`));
    if (kind === 'examples' && bundle.value && bundle.value.shardCount !== exampleShards) problems.push(`${run.dir}: retained examples union has ${bundle.value.shardCount} shards but the stages ran ${exampleShards}`);
    const ref = bundle.candidatePlan;
    if (candidatePlan && ref && ref.sha256 !== candidatePlan.sha256) problems.push(`${run.dir}: ${kind} reports were produced against plan ${ref.jobPath} (${ref.sha256}), not the retained candidate plan (${candidatePlan.sha256})`);
    bundles[kind] = bundle;
  }
  const consumerValue = bundles.consumers?.value, exampleValue = bundles.examples?.value;
  if (candidatePlan && consumerValue && bundles.consumers.candidatePlan?.sha256 === candidatePlan.sha256) candidatePlan = { ...candidatePlan, jobPath: bundles.consumers.candidatePlan.jobPath };
  const consumerReports = consumerValue && exampleValue ? {
    runId: consumerValue.runId, index: consumerValue.index,
    sourceConsumerReport: consumerValue.sourceConsumerReport, matrixSourceReport: consumerValue.matrixSourceReport, examplesSourceReport: exampleValue.examplesSourceReport,
    examples: { runId: exampleValue.runId, index: exampleValue.index, shards: exampleValue.shardCount, shardIndexes: exampleValue.shardIndexes },
    files: [...consumerValue.files, ...exampleValue.files]
  } : null;
  const value = {
    candidate: { commit, sourceManifestSha256: baseCandidate.sourceManifestSha256, lockfileSha256 },
    sourceManifest: base.manifest ? { path: base.manifest.path, sha256: base.manifest.sha256 } : null,
    releaseKind, unitShards: shards, stageSources, checks,
    expectedCheckIds: EXPECTED_CHECKS.map(check => check.id),
    executedCheckIds: checks.filter(check => check.commands.length).map(check => check.id),
    passingCheckIds: checks.filter(check => check.status === 'passed').map(check => check.id),
    candidatePlan, archives, archiveBinding: 'retained-rehashed', consumerReports,
    deferredToAcceptance: deferred ?? []
  };
  return { problems, value };
}

/** Gate side: re-derive everything from the retained run files and compare with the supplied inputs. */
export function verifySource5GateInputs({ reports, manifestRef, scope, io }) {
  const fail = message => { throw new Error(`source5 gate inputs: ${message}`); };
  if (reports?.schema !== GATE_INPUTS_SCHEMA || reports.acceptance !== 'not-run' || reports.browserAcceptance !== 'not-run') fail('invalid schema or acceptance state');
  if (!Array.isArray(reports.runs) || !reports.runs.length || reports.runs.some(run => typeof run?.dir !== 'string')) fail('no runs');
  const runs = reports.runs.map(run => loadRun(io, run.dir));
  if (canonical(runs.map(runSummary)) !== canonical(reports.runs)) fail('retained run files changed or the run list differs');
  const { problems, value } = mergeRuns(runs);
  if (problems.length) fail(`retained runs do not pass:\n  - ${problems.join('\n  - ')}`);
  for (const key of Object.keys(value)) if (canonical(reports[key]) !== canonical(value[key])) fail(`${key} differs from the retained runs`);
  if (canonical(manifestRef) !== canonical(value.sourceManifest)) fail('--source-manifest is not the manifest the full pass staged and tested');
  const evidenceList = io.read(ACCEPTANCE_EVIDENCE_LIST).toString('utf8').split('\n').filter(line => line && !line.startsWith('#'));
  if (canonical(evidenceList) !== canonical(value.deferredToAcceptance)) fail(`deferredToAcceptance differs from ${ACCEPTANCE_EVIDENCE_LIST}`);
  const completion = deriveCompletion(scope, value.passingCheckIds);
  if (completion.problems.length) fail(`scope completion refused:\n  - ${completion.problems.join('\n  - ')}`);
  if (canonical(completion.completedOutcomeIds) !== canonical(reports.completedOutcomeIds) || canonical(completion.completion) !== canonical(reports.outcomeCompletion)) fail('completed outcome IDs differ from the scope + verified checks');
  const used = [value.candidatePlan.path, ...value.archives.map(archive => archive.path),
    value.consumerReports.index.path, value.consumerReports.examples.index.path, ...value.consumerReports.examples.shardIndexes.map(shard => shard.path), ...value.consumerReports.files.map(file => file.path), ...runs.flatMap(run => [run.reportRef.path,
    // Each winning stage's report, log and recorded `az acr run` exit code (re-read by every later validation).
    ...Object.entries(value.stageSources).filter(([, source]) => source.runId === run.runId)
      .flatMap(([stage, source]) => [source.stageReport.path, source.log.path, `${run.dir}/stage-${stage}.rc`])])];
  return { value, used: [...new Set(used)] };
}

// ---- host-side producer ------------------------------------------------------
function repoIo(root) {
  const realRoot = realpathSync(root);
  const absolute = path => {
    if (typeof path !== 'string' || !path || isAbsolute(path) || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Source5GateInputsError([`unsafe repository-relative path: ${path}`]);
    return join(root, path);
  };
  return {
    exists: path => existsSync(absolute(path)),
    read: path => {
      const file = absolute(path), real = realpathSync(file);
      if (!real.startsWith(`${realRoot}${sep}`) || !lstatSync(file).isFile()) throw new Source5GateInputsError([`not a regular file inside the repository: ${path}`]);
      return readFileSync(file);
    }
  };
}

export function buildGateInputs({ root = process.cwd(), runDirs, scopePath = DEFAULT_SCOPE, out, verifyOnlyRows = VERIFY_ONLY_ROWS }) {
  root = resolve(root);
  const io = repoIo(root);
  const dirs = (runDirs ?? []).map(dir => (isAbsolute(dir) ? relative(root, dir) : dir).replace(/\\/g, '/').replace(/\/+$/, ''));
  if (!dirs.length) throw new Source5GateInputsError(['no --run directory given']);
  const runs = dirs.map(dir => loadRun(io, dir));
  const { problems, value } = mergeRuns(runs);
  let completion = null;
  try { completion = deriveCompletion(parseScopeOutcomes(io.read(scopePath).toString('utf8')), value?.passingCheckIds ?? [], verifyOnlyRows); problems.push(...completion.problems); }
  catch (error) { problems.push(`scope ${scopePath}: ${error.message}`); }
  if (problems.length) throw new Source5GateInputsError(problems);
  const output = (out ?? `${dirs[0]}/gate-inputs/source-reports.json`).replace(/\\/g, '/');
  if (existsSync(join(root, output))) throw new Source5GateInputsError([`${output} already exists; gate inputs are never overwritten (use a new --out)`]);
  const reports = {
    schema: GATE_INPUTS_SCHEMA, acceptance: 'not-run', browserAcceptance: 'not-run', sourceRunner: 'acr-source5',
    runId: runs[0].runId, runs: runs.map(runSummary), ...value,
    scope: scopePath, completedOutcomeIds: completion.completedOutcomeIds, outcomeCompletion: completion.completion
  };
  const text = `${JSON.stringify(reports, null, 2)}\n`;
  mkdirSync(dirname(join(root, output)), { recursive: true });
  writeFileSync(join(root, output), text, { flag: 'wx' });
  return { sourceManifest: value.sourceManifest, sourceReports: { path: output, sha256: sha256(text) }, reports };
}

function cli() {
  const args = process.argv.slice(2), runDirs = [], options = {};
  for (let i = 0; i < args.length; i += 2) {
    const arg = args[i], next = args[i + 1];
    if (!['--run', '--scope', '--out'].includes(arg) || !next || next.startsWith('--')) throw new Source5GateInputsError([`usage: --run <dir> [--run <dir> ...] [--scope <md>] [--out <json>] (bad argument ${arg})`]);
    if (arg === '--run') runDirs.push(next); else if (options[arg] !== undefined) throw new Source5GateInputsError([`duplicate ${arg}`]); else options[arg] = next;
  }
  const result = buildGateInputs({ runDirs, scopePath: options['--scope'] ?? DEFAULT_SCOPE, out: options['--out'] });
  const r = result.reports;
  console.log(`candidate ${r.candidate.commit} (${r.runs.map(run => run.runId).join(' + ')}): ${r.passingCheckIds.length}/${r.expectedCheckIds.length} expected checks passed, ${r.archives.length} archives re-hashed, ${r.completedOutcomeIds.length} required scope rows complete (${r.outcomeCompletion.filter(c => c.basis === 'verified-checks').length} verify-only via checks)`);
  console.log(`wrote ${result.sourceReports.path}`);
  console.log(`next (HEAD must be ${r.candidate.commit}, or a commit with byte-identical source inputs):\n  node tools/native-capability-gate/index.mjs --phase code-complete --source-manifest ${result.sourceManifest.path} --source-reports ${result.sourceReports.path} --scope ${r.scope} --ledger docs/prds/aura3d-native-capability-ledger.json --freeze-commit "$(git rev-parse HEAD)" --owner "$NATIVE_INTEGRATION_OWNER" --out tests/reports/native-capabilities/code-complete-go.json`);
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { cli(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
