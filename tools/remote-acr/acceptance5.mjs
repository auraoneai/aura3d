#!/usr/bin/env node
/**
 * Aura3D 5.0 acceptance planning, gate binding and report merge
 * (tools/remote-acr/run-acceptance5.sh). Pure functions are exported for
 * tests; the CLI at the bottom is the only part that touches the file system
 * or network. Nothing here launches Azure work.
 *
 *   plan          --inventory <file> --run-id <id> [--batch <k>] [--groups <a,b>] --out <plan.json>
 *                 (optional groups, e.g. visual-compare, run only when named in --groups)
 *   gate-binding  --gate <path> --head <commit> --tracked-clean <0|1>   (reads HEAD's parent/diff with git)
 *   safe-inputs   <inputs.json> <gate> [<extra.json>]      (NUL list on stdout)
 *   merge         --out <report.json> --run-dir <dir> [--run-dir <dir>...]
 *   fetch-reports --prefixes <a,b> --dest <dir>             (in-image; SAS from env)
 *   evidence-summary <vitest.json> <fetch.json>             (in-image; base64 on stdout)
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, readlinkSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, isAbsolute, join, posix, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const PROJECTS = Object.freeze(['chromium-automation', 'firefox-automation', 'webkit-automation',
  'chromium-gpu-headless', 'chromium-software', 'chromium-experimental']);
/** Playwright configs the in-image runner accepts besides the root config (task-run.sh allowlist). */
export const ALLOWED_CONFIGS = Object.freeze({ 'tests/qr/prd04/playwright.config.ts': 'tests/qr/prd04' });
export const ACR_TIMEOUT_SECONDS = 1800;
export const MAX_CONCURRENT_RUNS = 2;
export const DEFAULTS = Object.freeze({
  // Image pull, in-image gate revalidation, packed-consumer restore, discovery, upload.
  overheadSeconds: 600,
  // Estimated test time packed into one shard; Playwright's --global-timeout is
  // ACR_TIMEOUT - overhead, so the estimate leaves ~25% headroom.
  budgetSeconds: 900,
  sasTtlSeconds: 7200,
  startMarginSeconds: 120,
  evidenceSeconds: 600,
});

const SAFE_PATH = /^[A-Za-z0-9_][A-Za-z0-9_./-]*$/;
const RUN_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const safeRel = p => typeof p === 'string' && SAFE_PATH.test(p) && !p.split('/').some(s => !s || s === '.' || s === '..');

// ---------------------------------------------------------------- inventory

/**
 * INI-style inventory: `[group <id>]` headers, `key = value` settings
 * (kind, project, config, seconds-per-test, reason, include) and one path per
 * line, optionally followed by `tests=<n>` / `seconds-per-test=<n>`.
 */
export function parseInventory(text, { readInclude = () => { throw new Error('include not supported'); } } = {}) {
  const groups = [];
  let group = null;
  text.split('\n').forEach((raw, index) => {
    const line = raw.replace(/\s+#.*$/, '').trim();
    const where = `inventory line ${index + 1}`;
    if (!line || line.startsWith('#')) return;
    const header = /^\[group ([a-z0-9][a-z0-9-]{0,23})\]$/.exec(line);
    if (header) {
      if (groups.some(g => g.id === header[1])) throw new Error(`${where}: duplicate group ${header[1]}`);
      group = { id: header[1], kind: 'browser', project: null, config: null, configDir: '', secondsPerTest: 60, reason: '', optional: false, split: 'files', entries: [] };
      groups.push(group); return;
    }
    if (!group) throw new Error(`${where}: entry outside a group`);
    const setting = /^([a-z-]+)\s*=\s*(.+)$/.exec(line);
    if (setting) {
      const [, key, value] = setting;
      if (key === 'kind') { if (!['browser', 'evidence', 'excluded'].includes(value)) throw new Error(`${where}: kind ${value}`); group.kind = value; }
      else if (key === 'project') { if (!PROJECTS.includes(value)) throw new Error(`${where}: unsupported project ${value}`); group.project = value; }
      else if (key === 'config') { if (!(value in ALLOWED_CONFIGS)) throw new Error(`${where}: unsupported config ${value}`); group.config = value; group.configDir = ALLOWED_CONFIGS[value]; }
      else if (key === 'seconds-per-test') group.secondsPerTest = positiveInt(value, where);
      // optional = true: planned only when named in --groups (never part of the default plan or its batches).
      else if (key === 'optional') { if (!['true', 'false'].includes(value)) throw new Error(`${where}: optional must be true or false`); group.optional = value === 'true'; }
      // split = tests: the group's specs run their tests in Playwright parallel mode, so --shard may split inside a file.
      else if (key === 'split') { if (!['files', 'tests'].includes(value)) throw new Error(`${where}: split must be files or tests`); group.split = value; }
      else if (key === 'reason') group.reason = group.reason ? `${group.reason} ${value}` : value;
      else if (key === 'include') {
        if (!safeRel(value)) throw new Error(`${where}: unsafe include`);
        for (const path of readInclude(value).split('\n').map(l => l.trim()).filter(l => l && !l.startsWith('#'))) group.entries.push(entry(path, [], where));
      } else throw new Error(`${where}: unknown setting ${key}`);
      return;
    }
    const [path, ...opts] = line.split(/\s+/);
    group.entries.push(entry(path, opts, where));
  });
  for (const g of groups) {
    if (!g.reason) throw new Error(`group ${g.id} has no reason`);
    if (!g.entries.length) throw new Error(`group ${g.id} is empty`);
    if (g.kind === 'browser' && !g.project) throw new Error(`group ${g.id} has no project`);
    if (g.kind !== 'browser' && (g.project || g.config)) throw new Error(`group ${g.id}: only browser groups select a project/config`);
    const seen = new Set();
    for (const e of g.entries) {
      if (seen.has(e.path)) throw new Error(`group ${g.id}: duplicate ${e.path}`);
      seen.add(e.path);
      if (g.kind === 'browser') {
        const ok = g.configDir ? e.path.startsWith(`${g.configDir}/browser/`) && e.path.endsWith('.spec.ts')
          : /^tests\/(?:browser|visual)\/.+\.spec\.ts$/.test(e.path);
        if (!ok) throw new Error(`group ${g.id}: ${e.path} is not a spec for this config`);
      } else if (g.kind === 'evidence' && !/^tests\/.+\.test\.ts$/.test(e.path)) throw new Error(`group ${g.id}: ${e.path} is not a unit test`);
      if (g.kind !== 'excluded' && e.path.endsWith('/')) throw new Error(`group ${g.id}: directories are only allowed in excluded groups`);
    }
  }
  return { groups };
}
function positiveInt(value, where) {
  if (!/^[1-9][0-9]{0,5}$/.test(String(value))) throw new Error(`${where}: expected a positive integer, got ${value}`);
  return Number(value);
}
function entry(path, opts, where) {
  if (!safeRel(path.endsWith('/') ? path.slice(0, -1) : path)) throw new Error(`${where}: unsafe path ${path}`);
  const out = { path };
  for (const opt of opts) {
    const m = /^(tests|seconds-per-test)=(.+)$/.exec(opt);
    if (!m) throw new Error(`${where}: unknown option ${opt}`);
    out[m[1] === 'tests' ? 'tests' : 'secondsPerTest'] = positiveInt(m[2], where);
  }
  return out;
}

/** Every listed path exists; every native spec on disk is covered by a browser group or an excluded group. */
export function validateInventory(inventory, { exists, nativeSpecs }) {
  const problems = [];
  const covered = new Set();
  for (const g of inventory.groups) for (const e of g.entries) {
    if (!exists(e.path)) problems.push(`${g.id}: missing ${e.path}`);
    if (g.kind !== 'evidence') covered.add(e.path);
  }
  for (const spec of nativeSpecs) if (!covered.has(spec)) problems.push(`native spec not in the inventory: ${spec}`);
  if (problems.length) throw new Error(problems.join('; '));
  return true;
}

/** Static estimate: test calls, with templated titles (loop-generated) counted twice. */
export function estimateSpecTests(text) {
  let count = 0;
  for (const m of text.matchAll(/^\s*(?:test|it)(?:\.(?:fixme|fail|slow|skip|only))?\(\s*(["'`])((?:\\.|(?!\1).)*)\1/gm)) {
    count += m[1] === '`' && m[2].includes('${') ? 2 : 1;
  }
  return Math.max(1, count);
}

export function shardRunId(runId, groupId, index, total) {
  const id = `${runId}-${groupId}-${index}of${total}`;
  if (!RUN_ID.test(id)) throw new Error(`shard run ID is invalid or longer than 80 characters: ${id}`);
  return id;
}

/**
 * One ACR run per shard. Playwright --shard splits by test count without
 * splitting a file, so a group gets at most one shard per spec file.
 */
export function planShards(inventory, { runId, estimate, budgetSeconds = DEFAULTS.budgetSeconds, overheadSeconds = DEFAULTS.overheadSeconds }) {
  if (!RUN_ID.test(runId) || runId.length > 48) throw new Error('run ID must match [a-zA-Z0-9_-] and be at most 48 characters');
  const shards = [], warnings = [];
  for (const g of inventory.groups.filter(x => x.kind === 'browser')) {
    const specs = g.entries.map(e => {
      const tests = e.tests ?? estimate(e.path);
      const seconds = tests * (e.secondsPerTest ?? g.secondsPerTest);
      if (seconds > budgetSeconds && g.split !== 'tests') warnings.push(`${g.id}: ${e.path} alone is estimated at ${seconds}s (> ${budgetSeconds}s shard budget); Playwright cannot split a file, so its tail may be interrupted (recorded as no-data)`);
      return { path: e.path, tests, seconds };
    });
    const tests = specs.reduce((a, s) => a + s.tests, 0), seconds = specs.reduce((a, s) => a + s.seconds, 0);
    const cap = g.split === 'tests' ? Math.max(specs.length, tests) : specs.length;
    const total = Math.max(1, Math.min(cap, Math.ceil(seconds / budgetSeconds)));
    for (let i = 1; i <= total; i++) {
      shards.push({ id: `${g.id}-${i}of${total}`, runId: shardRunId(runId, g.id, i, total), group: g.id, project: g.project,
        config: g.config, configDir: g.configDir, specs: specs.map(s => s.path), shard: total > 1 ? `${i}/${total}` : null,
        estimatedTests: Math.ceil(tests / total), estimatedSeconds: Math.min(ACR_TIMEOUT_SECONDS, overheadSeconds + Math.ceil(seconds / total)) });
    }
  }
  return { shards, warnings };
}

/**
 * Split shards into batches whose simulated schedule (2 lanes, estimated
 * durations) starts every run while the single SAS still has a full ACR
 * timeout plus margin left. The evidence run closes the last batch.
 */
export function planBatches(shards, { hasEvidence, ttlSeconds = DEFAULTS.sasTtlSeconds, startMarginSeconds = DEFAULTS.startMarginSeconds,
  evidenceSeconds = DEFAULTS.evidenceSeconds, overheadSeconds = DEFAULTS.overheadSeconds, lanes = MAX_CONCURRENT_RUNS } = {}) {
  const latestStart = ttlSeconds - ACR_TIMEOUT_SECONDS - startMarginSeconds;
  if (latestStart < 0) throw new Error('SAS lifetime is shorter than one ACR run');
  const fits = items => {
    const free = Array(lanes).fill(0);
    for (const seconds of items) {
      free.sort((a, b) => a - b);
      if (free[0] > latestStart) return false;
      free[0] += seconds;
    }
    return true;
  };
  const evidence = overheadSeconds + evidenceSeconds;
  const batches = [];
  let current = [];
  for (const shard of shards) {
    if (current.length && !fits([...current, shard].map(s => s.estimatedSeconds))) { batches.push(current); current = []; }
    current.push(shard);
  }
  if (current.length) batches.push(current);
  if (hasEvidence) {
    const last = batches.at(-1) ?? [];
    if (batches.length && fits([...last.map(s => s.estimatedSeconds), evidence])) batches[batches.length - 1] = [...last, { id: 'evidence', evidence: true }];
    else batches.push([{ id: 'evidence', evidence: true }]);
  }
  return batches.map(batch => batch.map(s => s.id));
}

/**
 * Groups the plan runs: the named ones (optional groups included), or every non-optional group when none are named.
 * `groups` null/empty means the default plan. Unknown ids fail.
 */
export function selectGroups(inventory, groups) {
  const wanted = Array.isArray(groups) ? groups.filter(Boolean) : [];
  if (!wanted.length) return { groups: inventory.groups.filter(g => !g.optional) };
  for (const id of wanted) if (!inventory.groups.some(g => g.id === id)) throw new Error(`unknown group ${id}`);
  return { groups: inventory.groups.filter(g => wanted.includes(g.id)) };
}

export function buildPlan(fullInventory, options) {
  const inventory = selectGroups(fullInventory, options.groups);
  const { shards, warnings } = planShards(inventory, options);
  const evidenceGroup = inventory.groups.find(g => g.kind === 'evidence');
  const batches = planBatches(shards, { ...options, hasEvidence: Boolean(evidenceGroup) });
  const batch = options.batch ?? null;
  if (batch !== null && (!Number.isInteger(batch) || batch < 1 || batch > batches.length)) throw new Error(`batch must be 1..${batches.length}`);
  const selected = new Set(batch === null ? batches.flat() : batches[batch - 1]);
  if (batch === null && batches.length > 1) warnings.push(`the plan needs ${batches.length} batches to fit one ${options.ttlSeconds ?? DEFAULTS.sasTtlSeconds}s SAS window; run with BATCH=1..${batches.length}`);
  return {
    schema: 'aura3d.acceptance5-plan/1', runId: options.runId, batch, batchCount: batches.length, batches,
    shards: shards.filter(s => selected.has(s.id)),
    evidence: evidenceGroup && selected.has('evidence') ? { group: evidenceGroup.id, runId: `${options.runId}-evidence`, files: evidenceGroup.entries.map(e => e.path) } : null,
    groupSelection: options.groups?.length ? [...options.groups] : null,
    groups: inventory.groups.map(g => ({ id: g.id, kind: g.kind, project: g.project, config: g.config, reason: g.reason, optional: g.optional, entries: g.entries.map(e => e.path) })),
    limits: { acrTimeoutSeconds: ACR_TIMEOUT_SECONDS, maxConcurrentRuns: MAX_CONCURRENT_RUNS,
      playwrightGlobalTimeoutMs: (ACR_TIMEOUT_SECONDS - (options.overheadSeconds ?? DEFAULTS.overheadSeconds)) * 1000 },
    warnings,
  };
}

// ---------------------------------------------------------------- gate

/** The committed CODE_COMPLETE_GO record (freeze sequence step 6 force-adds it in the commit after F). */
export const CODE_COMPLETE_RECORD = 'tests/reports/native-capabilities/code-complete-go.json';

/**
 * Why HEAD is not the record-only commit on top of freeze commit F, or null when it is:
 * HEAD's only parent is F, HEAD's diff against F touches exactly CODE_COMPLETE_RECORD
 * and nothing else, and the record committed at HEAD is byte-identical to the validated gate.
 * `info` = { head, parents, changedPaths, recordAtHead } (see readHeadCommit).
 */
export function recordCommitProblem(info, { head, freezeCommit, gateText }) {
  if (!info) return 'HEAD history is unavailable';
  if (info.head !== head) return `HEAD is ${info.head}, not ${head}`;
  if (!Array.isArray(info.parents) || info.parents.length !== 1 || info.parents[0] !== freezeCommit) return `HEAD's only parent must be the freeze commit (parents: ${(info.parents ?? []).join(' ') || 'none'})`;
  const changed = Array.isArray(info.changedPaths) ? [...new Set(info.changedPaths)] : [];
  if (changed.length !== 1 || changed[0] !== CODE_COMPLETE_RECORD) return `HEAD's diff against the freeze commit must touch only ${CODE_COMPLETE_RECORD} (it touches: ${changed.join(', ') || 'nothing'})`;
  if (typeof info.recordAtHead !== 'string' || info.recordAtHead !== gateText) return `${CODE_COMPLETE_RECORD} committed at HEAD differs from the validated gate`;
  return null;
}

/** Git facts recordCommitProblem needs (host side only; nothing is written). */
export function readHeadCommit(root, freezeCommit) {
  const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 });
  const [head, ...parents] = git('rev-list', '--parents', '-n', '1', 'HEAD').trim().split(/\s+/);
  let changedPaths = null, recordAtHead = null;
  try { changedPaths = git('diff-tree', '-r', '--no-commit-id', '--name-only', '--no-renames', '-z', freezeCommit, head, '--').split('\0').filter(Boolean); } catch { changedPaths = null; }
  try { recordAtHead = git('cat-file', 'blob', `${head}:${CODE_COMPLETE_RECORD}`); } catch { recordAtHead = null; }
  return { head, parents, changedPaths, recordAtHead };
}

/**
 * Host-side refusal before any provider call: the gate must exist, be a GO record and bind this
 * clean HEAD, which is either the freeze commit F itself or the record-only commit on F
 * (freeze sequence step 6; see recordCommitProblem). `inspectHead(F)` supplies the git facts.
 * All three source reports (clean-install, matrix, examples) are required. On the ACR source5
 * path (sourceRunner acr-source5) the job sees the retained files at their in-job paths
 * (acceptance-staging.mjs place-job-paths), so the binding hands the job each `jobPath`
 * (candidate plan and reports); the gate still binds their SHA-256s.
 */
export function checkGateBinding({ gatePath, gateText, head, trackedClean, inspectHead }) {
  if (!gatePath) throw new Error('AURA3D_CODE_COMPLETE_GATE is required');
  if (!safeRel(gatePath)) throw new Error('gate path must be repository-relative');
  if (gateText === null || gateText === undefined) throw new Error(`gate record missing: ${gatePath}`);
  let gate;
  try { gate = JSON.parse(gateText); } catch { throw new Error('gate record is not JSON'); }
  if (gate?.schema !== 'aura3d.native-code-complete/1' || gate.status !== 'CODE_COMPLETE_GO') throw new Error('gate record is not a CODE_COMPLETE_GO record');
  if (!/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(gate.freezeCommit ?? '')) throw new Error('gate has no freeze commit');
  let headRelation = 'freeze-commit';
  if (gate.freezeCommit !== head) {
    let info = null;
    try { info = inspectHead ? inspectHead(gate.freezeCommit) : null; } catch { info = null; }
    const why = recordCommitProblem(info, { head, freezeCommit: gate.freezeCommit, gateText });
    if (why) throw new Error(`stale gate: freeze commit ${gate.freezeCommit} is not HEAD ${head}, and HEAD is not the record-only commit on it (${why})`);
    headRelation = 'record-commit';
  }
  if (!trackedClean) throw new Error('tracked changes present; acceptance runs only the frozen commit');
  const source5 = gate.sourceRunner === 'acr-source5';
  // The path the job reads: source5 records carry the in-job path of each retained file.
  const jobPath = ref => (source5 ? ref?.jobPath : ref?.path) ?? null;
  const plan = jobPath(gate.candidatePlan);
  if (!safeRel(plan)) throw new Error('gate lacks a safe candidate plan path');
  const reports = ['sourceConsumerReport', 'matrixSourceReport', 'examplesSourceReport'].map(k => jobPath(gate[k]));
  if (reports.some(p => !safeRel(p))) throw new Error('gate lacks bound source consumer reports');
  return { freezeCommit: gate.freezeCommit, head, headRelation, gateSha256: createHash('sha256').update(gateText).digest('hex'), candidatePlan: plan,
    consumerSourceReport: reports[0], matrixSourceReport: reports[1], examplesSourceReport: reports[2],
    sourceInputDigest: gate.sourceInputDigest ?? null, lockfileSha256: gate.lockfileSha256 ?? null, sourceRunId: gate.runId ?? null };
}

/** Same checks as run.sh's staged-input filter: repository-relative regular files or in-repo relative symlinks. */
export function safeInputList(root, entries) {
  root = realpathSync(root);
  const out = [];
  for (const name of new Set(entries)) {
    if (typeof name !== 'string' || !name || posix.isAbsolute(name) || name.includes('\\') ||
        name.split('/').some(p => !p || p === '.' || p === '..') || /[\x00-\x1f]/.test(name)) throw new Error('Unsafe staged input path');
    const absolute = resolve(root, name);
    if (!absolute.startsWith(root + sep) || realpathSync(dirname(absolute)) !== dirname(absolute)) throw new Error(`Invalid staged parent: ${name}`);
    const stat = lstatSync(absolute);
    if (stat.isSymbolicLink()) {
      const target = readlinkSync(absolute);
      if (isAbsolute(target) || !resolve(dirname(absolute), target).startsWith(root + sep)) throw new Error(`Unsafe staged symlink: ${name}`);
    } else if (!stat.isFile()) throw new Error(`Invalid staged file: ${name}`);
    out.push(name);
  }
  return out;
}

// ---------------------------------------------------------------- results

const SOFTWARE = /swiftshader|llvmpipe|softpipe|lavapipe|software (?:raster|render)|\bsoftware\b/i;
const UNSUPPORTED = /\bunsupported\b/i;
const NO_DATA = /no-data|no data|unavailable|not available|cannot render|no adapter/i;

/** passed | failed | skipped | unsupported | no-data for one Playwright JSON test. */
export function classifyPlaywrightTest(test) {
  const last = test.results?.at(-1);
  const notes = [...(test.annotations ?? []), ...(last?.annotations ?? [])];
  const noteText = notes.map(a => `${a.type ?? ''} ${a.description ?? ''}`).join(' ');
  if (test.status === 'skipped' || last?.status === 'skipped') {
    if (UNSUPPORTED.test(noteText)) return { status: 'unsupported', reason: noteText.trim().slice(0, 300) };
    if (NO_DATA.test(noteText)) return { status: 'no-data', reason: noteText.trim().slice(0, 300) };
    return { status: 'skipped', reason: noteText.trim().slice(0, 300) || null };
  }
  if (!last) return { status: 'no-data', reason: 'no result recorded' };
  if (last.status === 'interrupted') return { status: 'no-data', reason: 'interrupted (global timeout or runner stop)' };
  if (test.status === 'expected' && last.status === 'passed') return { status: 'passed', reason: null };
  if (test.status === 'flaky') return { status: 'failed', reason: 'flaky: passed only on retry' };
  const message = (last.errors?.[0]?.message ?? last.error?.message ?? last.status ?? '').replace(/\u001b\[[0-9;]*m/g, '');
  // A spec that states the WebGPU adapter is absent never passes, but it is missing hardware evidence, not a defect.
  if (/WEBGPU_ACCEPTANCE_UNAVAILABLE|WebGPU adapter request did not return a device/.test(message)) return { status: 'no-data', reason: message.slice(0, 300) };
  return { status: 'failed', reason: message.slice(0, 500) };
}

/**
 * Adapter/hardware labels emitted by the spec (annotations and small JSON
 * attachments). "physical" only when the spec itself says so and nothing
 * names a software rasterizer; otherwise software or unverified.
 */
export function hardwareLabels(test, project) {
  const labels = [];
  const texts = [];
  const last = test.results?.at(-1);
  for (const a of [...(test.annotations ?? []), ...(last?.annotations ?? [])]) {
    if (/adapter|backend|xr-evidence|evidence|device|hardware/i.test(a.type ?? '')) {
      labels.push({ type: a.type, value: String(a.description ?? '').slice(0, 300) });
      texts.push(String(a.description ?? ''));
    }
  }
  let explicitPhysical = false;
  for (const att of last?.attachments ?? []) {
    if (att.contentType !== 'application/json' || typeof att.body !== 'string' || att.body.length > 1_500_000) continue;
    let value;
    try { value = JSON.parse(Buffer.from(att.body, 'base64').toString('utf8')); } catch { continue; }
    const found = pickLabelFields(value);
    for (const [type, v] of found) {
      labels.push({ type: `${att.name}:${type}`, value: String(v).slice(0, 300) });
      texts.push(String(v));
      if (/^(?:deviceClass|hardwareStatus|evidenceKind|hardware)$/.test(type) && String(v) === 'physical') explicitPhysical = true;
    }
  }
  const softwareNamed = project === 'chromium-software' || texts.some(t => SOFTWARE.test(t));
  const hardware = softwareNamed ? 'software' : explicitPhysical ? 'physical' : 'unverified';
  return { hardware, labels: dedupeLabels(labels).slice(0, 20) };
}
function pickLabelFields(value, depth = 0, out = []) {
  if (!value || typeof value !== 'object' || depth > 3 || out.length > 40) return out;
  for (const [key, v] of Object.entries(value)) {
    if (/^(?:adapter|adapterInfo|renderer|unmaskedRenderer|deviceClass|hardwareStatus|evidenceKind|hardware|backend|vendor|architecture|device)$/.test(key)
        && (typeof v === 'string' || typeof v === 'number' || (v && typeof v === 'object'))) {
      out.push([key, typeof v === 'object' ? JSON.stringify(v) : v]);
    } else if (v && typeof v === 'object') pickLabelFields(v, depth + 1, out);
  }
  return out;
}
function dedupeLabels(labels) {
  const seen = new Set();
  return labels.filter(l => { const k = `${l.type}\0${l.value}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

/** Flatten a Playwright JSON report into per-test rows with repository-relative files. */
export function collectPlaywrightTests(report, { configDir = '' } = {}) {
  const rows = [];
  const visit = suite => {
    for (const spec of suite.specs ?? []) for (const test of spec.tests ?? []) {
      let file = String(spec.file ?? '').replace(/^\.\//, '');
      if (configDir && !file.startsWith(`${configDir}/`)) file = `${configDir}/${file}`;
      const { status, reason } = classifyPlaywrightTest(test);
      const { hardware, labels } = hardwareLabels(test, test.projectName);
      const tags = [...(spec.tags ?? []), ...(test.tags ?? []), ...(test.annotations ?? []).map(a => a.type).filter(Boolean)].map(String).slice(0, 10);
      rows.push({ file, title: spec.title, project: test.projectName, status, reason, hardware, labels, tags });
    }
    for (const child of suite.suites ?? []) visit(child);
  };
  for (const suite of report?.suites ?? []) visit(suite);
  return rows;
}

/** `[task-run] NAME_EXIT=<n>` lines from a shard log. */
export function parseTaskRunExits(logText) {
  const exits = {};
  for (const m of String(logText).matchAll(/\[task-run\] ([A-Z]+)_EXIT=([0-9]+|not-run)/g)) exits[m[1].toLowerCase()] = m[2] === 'not-run' ? null : Number(m[2]);
  return exits;
}

/** Base64 payload between ACR-log markers (timestamps stripped). */
export function extractMarkedPayload(logText, name) {
  const lines = String(logText).split('\n').map(l => l.replace(/\r$/, '').replace(/^\d{4}\/\d{2}\/\d{2} [0-9:.]+ /, ''));
  const start = lines.findIndex(l => l.trim() === `::: ${name}_BEGIN`), end = lines.findIndex((l, i) => i > start && l.trim() === `::: ${name}_END`);
  if (start < 0 || end < 0) return null;
  try { return JSON.parse(Buffer.from(lines.slice(start + 1, end).join('').trim(), 'base64').toString('utf8')); } catch { return null; }
}

/** Compact vitest JSON: per-file rows; ENOENT on report/evidence paths is no-data, not a pass. */
export function summarizeVitest(vitest, root = '/repo/') {
  const files = [];
  for (const file of vitest?.testResults ?? []) {
    const tests = (file.assertionResults ?? []).map(a => {
      const message = (a.failureMessages ?? []).join('\n').slice(0, 500);
      let status = a.status === 'passed' ? 'passed' : a.status === 'failed' ? 'failed' : 'skipped';
      if (status === 'failed' && /ENOENT|no such file or directory/.test(message) && /tests\/reports\/|evidence\//.test(message)) status = 'no-data';
      return { title: a.fullName ?? a.title, status, reason: status === 'passed' ? null : message || null };
    });
    const name = String(file.name ?? '').startsWith(root) ? file.name.slice(root.length) : file.name;
    if (!tests.length && file.status === 'failed') tests.push({ title: '(file)', status: 'failed', reason: String(file.message ?? 'suite failed to load').slice(0, 500) });
    files.push({ file: name, tests });
  }
  return files;
}

/**
 * C4-06: a no-data test may leave the report `passed` only when it carries an EXPERIMENTAL or GPU/device-only label
 * (title, Playwright tag, annotation or hardware label). The allowed list is recorded in the report.
 */
export const ALLOWED_NO_DATA_LABEL = /\bEXPERIMENTAL\b|\bGPU[-/ ]?only\b|\bdevice[-/ ]?only\b|\bGPU\/device\b/i;
export function allowedNoDataLabel(test, specRow) {
  const texts = [test.title, ...(test.tags ?? []), ...(specRow?.labels ?? []).map(l => `${l.type} ${l.value}`)];
  const hit = texts.find(t => ALLOWED_NO_DATA_LABEL.test(String(t ?? '')));
  return hit === undefined ? null : String(hit).slice(0, 120);
}

const EMPTY = () => ({ passed: 0, failed: 0, skipped: 0, unsupported: 0, 'no-data': 0 });

/**
 * Merge one or more run directories' results. `runs` items:
 * { plan, binding, shards: { [shardId]: { rc, exits, report|null, manifest|null, notStarted? } }, evidence: summary|null, evidenceRc }
 */
export function mergeAcceptance(runs, { generatedAt = new Date().toISOString() } = {}) {
  const specRows = new Map(), shardRows = [], problems = [];
  const totals = EMPTY();
  const hardware = { software: 0, physical: 0, unverified: 0 };
  const candidates = new Set(runs.map(r => r.binding?.freezeCommit ?? 'unknown'));
  if (candidates.size > 1) problems.push(`runs were made against different candidates: ${[...candidates].join(', ')}`);
  for (const run of runs) {
    for (const shard of run.plan.shards) {
      const result = run.shards[shard.id] ?? { notStarted: 'no result recorded' };
      const tests = result.report ? collectPlaywrightTests(result.report, { configDir: shard.configDir }) : [];
      shardRows.push({ runId: run.plan.runId, id: shard.id, shardRunId: shard.runId, group: shard.group, project: shard.project, shard: shard.shard,
        acrExit: result.rc ?? null, playwrightExit: result.exits?.playwright ?? null, inventoryExit: result.exits?.inventory ?? null,
        uploadExit: result.exits?.upload ?? null, reportFound: Boolean(result.report), notStarted: result.notStarted ?? null, tests: tests.length });
      if (result.notStarted) problems.push(`shard ${shard.id} not started: ${result.notStarted}`);
      else if (!result.report) problems.push(`shard ${shard.id}: no structured Playwright report (acr exit ${result.rc ?? 'unknown'}, upload exit ${result.exits?.upload ?? 'unknown'})`);
      for (const spec of shard.specs) {
        const key = `${shard.group}\0${shard.project}\0${spec}`;
        if (!specRows.has(key)) specRows.set(key, { spec, group: shard.group, project: shard.project, shards: [], missingShards: [], ...EMPTY(),
          hardware: { software: 0, physical: 0, unverified: 0 }, labels: [], tests: [] });
        const row = specRows.get(key);
        row.shards.push(shard.id);
        if (!result.report) row.missingShards.push(shard.id);
      }
      for (const t of tests) {
        const row = specRows.get(`${shard.group}\0${shard.project}\0${t.file}`);
        if (!row) { problems.push(`shard ${shard.id} reported an unplanned file: ${t.file}`); continue; }
        row[t.status]++; row.hardware[t.hardware]++;
        row.labels = dedupeLabels([...row.labels, ...t.labels]).slice(0, 30);
        row.tests.push({ title: t.title, status: t.status, reason: t.reason, hardware: t.hardware, tags: t.tags });
      }
    }
  }
  const specs = [...specRows.values()].map(row => {
    const count = row.passed + row.failed + row.skipped + row.unsupported + row['no-data'];
    if (!count) row['no-data'] = 1, row.tests.push({ title: '(spec)', status: 'no-data', hardware: 'unverified',
      reason: row.missingShards.length ? `shard report unavailable: ${row.missingShards.join(', ')}` : 'no tests discovered in any shard' });
    const status = row.failed ? 'failed' : row['no-data'] ? 'no-data' : row.skipped ? 'skipped' : row.passed ? 'passed' : 'unsupported';
    for (const k of Object.keys(totals)) totals[k] += row[k];
    for (const k of Object.keys(hardware)) hardware[k] += row.hardware[k];
    return { ...row, status };
  });
  const evidence = [];
  for (const run of runs) {
    if (!run.plan.evidence) continue;
    if (!run.evidence) {
      problems.push(`evidence stage ${run.plan.evidence.runId}: no result (acr exit ${run.evidenceRc ?? 'unknown'})`);
      for (const file of run.plan.evidence.files) { evidence.push({ file, status: 'no-data', ...EMPTY(), 'no-data': 1, tests: [] }); totals['no-data']++; }
      continue;
    }
    const byFile = new Map(run.evidence.files.map(f => [f.file, f]));
    for (const file of run.plan.evidence.files) {
      const tests = byFile.get(file)?.tests ?? [{ title: '(file)', status: 'no-data', reason: 'not executed' }];
      const row = { file, ...EMPTY(), tests };
      for (const t of tests) row[t.status]++;
      for (const k of Object.keys(totals)) totals[k] += row[k];
      row.status = row.failed ? 'failed' : row['no-data'] ? 'no-data' : row.skipped ? 'skipped' : 'passed';
      evidence.push(row);
    }
    if (run.evidence.fetch?.conflicts?.length) problems.push(`evidence stage kept ${run.evidence.fetch.conflicts.length} candidate files instead of browser outputs with the same path`);
  }
  const allowedNoData = [], unlabeledNoData = [];
  for (const row of specs) for (const t of row.tests) {
    if (t.status !== 'no-data') continue;
    const label = allowedNoDataLabel(t, row);
    (label ? allowedNoData : unlabeledNoData).push({ spec: row.spec, test: t.title, reason: t.reason ?? null, ...(label ? { label } : {}) });
  }
  for (const row of evidence) for (const t of row.tests) if (t.status === 'no-data') unlabeledNoData.push({ spec: row.file, test: t.title, reason: t.reason ?? null });
  const incomplete = problems.length || unlabeledNoData.length || totals.skipped;
  return {
    schema: 'aura3d.acceptance5-report/1', generatedAt,
    candidate: runs[0]?.binding ?? null,
    runs: runs.map(r => ({ runId: r.plan.runId, batch: r.plan.batch, image: r.image ?? null, transport: 'legacy-sas' })),
    status: totals.failed ? 'failed' : incomplete ? 'incomplete' : 'passed',
    totals, hardware,
    noDataPolicy: { rule: 'status is passed only when failed is 0 and every no-data test is labeled EXPERIMENTAL or GPU/device-only', allowed: allowedNoData, unlabeled: unlabeledNoData },
    note: 'Hardware classes come only from labels the specs emit: software = a software rasterizer was named (or chromium-software); physical = the spec reported physical and no software adapter was named; everything else is unverified. ACR Tasks containers have no GPU.',
    specs, evidence, shards: shardRows,
    excluded: runs[0]?.plan.groups.filter(g => g.kind === 'excluded').map(g => ({ group: g.id, reason: g.reason, entries: g.entries })) ?? [],
    problems,
  };
}

// ---------------------------------------------------------------- in-image evidence fetch

const MAX_FETCH_FILES = 2000, MAX_FETCH_BYTES = 512 * 1024 * 1024;
/** Download `<prefix>/aura3d-browser-artifacts/reports/**` into destRoot, never overwriting a candidate file. */
export async function fetchReports({ sasUrl, prefixes, destRoot, request = fetch }) {
  const base = new URL(sasUrl);
  if (base.protocol !== 'https:' || !/^[a-z0-9]{3,24}\.blob\.core\.windows\.net$/.test(base.hostname) || !base.search) throw new Error('invalid SAS container URL');
  const fetched = [], conflicts = [];
  let bytes = 0;
  for (const prefix of prefixes) {
    if (!RUN_ID.test(prefix)) throw new Error('invalid prefix');
    const listPrefix = `${prefix}/aura3d-browser-artifacts/reports/`;
    let marker = '';
    do {
      const url = new URL(base);
      url.searchParams.set('restype', 'container'); url.searchParams.set('comp', 'list'); url.searchParams.set('prefix', listPrefix);
      if (marker) url.searchParams.set('marker', marker);
      const response = await request(url, { headers: { 'x-ms-version': '2023-11-03' }, redirect: 'error', signal: AbortSignal.timeout(60000) });
      if (!response.ok) throw new Error(`blob list failed (HTTP ${response.status})`);
      const xml = await response.text();
      marker = /<NextMarker>([^<]*)<\/NextMarker>/.exec(xml)?.[1] ?? '';
      for (const m of xml.matchAll(/<Blob>[\s\S]*?<Name>([^<]+)<\/Name>[\s\S]*?<\/Blob>/g)) {
        const name = m[1].replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>');
        const rel = name.slice(listPrefix.length);
        if (!safeRel(rel)) throw new Error('unsafe blob name');
        const dest = resolve(destRoot, rel);
        if (!dest.startsWith(resolve(destRoot) + sep)) throw new Error('blob escapes destination');
        if (existsSync(dest)) { conflicts.push(rel); continue; }
        if (fetched.length >= MAX_FETCH_FILES) throw new Error('too many evidence files');
        const blobUrl = new URL(base);
        blobUrl.pathname = `${base.pathname}/${name.split('/').map(encodeURIComponent).join('/')}`;
        const blob = await request(blobUrl, { headers: { 'x-ms-version': '2023-11-03' }, redirect: 'error', signal: AbortSignal.timeout(120000) });
        if (!blob.ok) throw new Error(`blob download failed (HTTP ${blob.status})`);
        const data = Buffer.from(await blob.arrayBuffer());
        bytes += data.length;
        if (bytes > MAX_FETCH_BYTES) throw new Error('evidence exceeds the transfer limit');
        mkdirSync(dirname(dest), { recursive: true });
        writeFileSync(dest, data, { flag: 'wx' });
        fetched.push(rel);
      }
    } while (marker);
  }
  return { fetched: fetched.length, bytes, conflicts };
}

// ---------------------------------------------------------------- CLI

function options(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) {
      const key = argv[i].slice(2), value = argv[++i];
      if (value === undefined) throw new Error(`--${key} needs a value`);
      if (key === 'run-dir') (out[key] ??= []).push(value); else out[key] = value;
    } else out._.push(argv[i]);
  }
  return out;
}
const readJsonOrNull = path => { try { return JSON.parse(readFileSync(path, 'utf8')); } catch { return null; } };
const readTextOrEmpty = path => { try { return readFileSync(path, 'utf8'); } catch { return ''; } };

function listNativeSpecs(root) {
  return readdirSync(join(root, 'tests/browser')).filter(n => /^native-.+\.spec\.ts$/.test(n)).map(n => `tests/browser/${n}`).sort();
}

export function loadRunDir(dir) {
  const plan = JSON.parse(readFileSync(join(dir, 'plan.json'), 'utf8'));
  const binding = readJsonOrNull(join(dir, 'gate-binding.json'));
  const shards = {};
  for (const shard of plan.shards) {
    const sdir = join(dir, 'shards', shard.id);
    const notStarted = readTextOrEmpty(join(sdir, 'not-started')).trim() || null;
    const rcText = readTextOrEmpty(join(sdir, 'rc')).trim();
    const reports = join(sdir, 'artifacts', shard.runId, 'aura3d-browser-artifacts', 'reports');
    shards[shard.id] = { notStarted, rc: rcText === '' ? null : Number(rcText), exits: parseTaskRunExits(readTextOrEmpty(join(sdir, 'acr-run.log'))),
      report: readJsonOrNull(join(reports, 'remote-acr-report.json')),
      manifest: readJsonOrNull(join(sdir, 'artifacts', shard.runId, 'aura3d-browser-artifacts', 'run-manifest.json')) };
  }
  const evidenceRc = readTextOrEmpty(join(dir, 'evidence', 'rc')).trim();
  return { plan, binding, shards, image: readTextOrEmpty(join(dir, 'image')).trim() || null,
    evidence: plan.evidence ? extractMarkedPayload(readTextOrEmpty(join(dir, 'evidence', 'acr-run.log')), 'ACCEPTANCE5_EVIDENCE') : null,
    evidenceRc: evidenceRc === '' ? null : Number(evidenceRc) };
}

export async function main(argv) {
  const [command, ...rest] = argv;
  const opts = options(rest);
  if (command === 'plan') {
    const root = process.cwd();
    const inventory = parseInventory(readFileSync(opts.inventory, 'utf8'), { readInclude: p => readFileSync(join(root, p), 'utf8') });
    validateInventory(inventory, { exists: p => existsSync(join(root, p)), nativeSpecs: listNativeSpecs(root) });
    const plan = buildPlan(inventory, { runId: opts['run-id'], batch: opts.batch ? Number(opts.batch) : null,
      groups: opts.groups ? String(opts.groups).split(',').map(x => x.trim()).filter(Boolean) : null,
      ttlSeconds: opts['sas-ttl-seconds'] ? Number(opts['sas-ttl-seconds']) : DEFAULTS.sasTtlSeconds,
      estimate: p => estimateSpecTests(readFileSync(join(root, p), 'utf8')) });
    if (opts.out) writeFileSync(opts.out, `${JSON.stringify(plan, null, 2)}\n`);
    const lines = [`   plan       : ${plan.shards.length} browser shards${plan.evidence ? ' + evidence' : ''}, batch ${plan.batch ?? 'all'} of ${plan.batchCount}`];
    for (const s of plan.shards) lines.push(`     ${s.id.padEnd(34)} ${s.project.padEnd(22)} ${String(s.specs.length).padStart(3)} specs ~${s.estimatedTests} tests ~${Math.round(s.estimatedSeconds / 60)} min${s.shard ? ` --shard=${s.shard}` : ''}`);
    if (plan.evidence) lines.push(`     ${'evidence'.padEnd(34)} vitest ${plan.evidence.files.length} files`);
    plan.batches.forEach((b, i) => lines.push(`     batch ${i + 1}: ${b.join(' ')}`));
    for (const w of plan.warnings) lines.push(`   WARN: ${w}`);
    process.stdout.write(`${lines.join('\n')}\n`);
  } else if (command === 'gate-binding') {
    const gatePath = opts.gate;
    const gateText = gatePath && safeRel(gatePath) && existsSync(gatePath) ? readFileSync(gatePath, 'utf8') : null;
    const binding = checkGateBinding({ gatePath, gateText, head: opts.head, trackedClean: opts['tracked-clean'] === '1',
      inspectHead: freezeCommit => readHeadCommit(process.cwd(), freezeCommit) });
    if (opts.out) writeFileSync(opts.out, `${JSON.stringify(binding, null, 2)}\n`);
    process.stdout.write(`${JSON.stringify(binding)}\n`);
  } else if (command === 'safe-inputs') {
    const [inputs, gate, extra] = opts._;
    const entries = JSON.parse(readFileSync(inputs, 'utf8'));
    if (!Array.isArray(entries) || !entries.length) throw new Error('Gate did not enumerate candidate inputs');
    if (extra) entries.push(...JSON.parse(readFileSync(extra, 'utf8')));
    process.stdout.write(safeInputList('.', [...entries, gate]).map(n => `${n}\0`).join(''));
  } else if (command === 'merge') {
    const report = mergeAcceptance((opts['run-dir'] ?? []).map(loadRunDir));
    mkdirSync(dirname(opts.out), { recursive: true });
    writeFileSync(opts.out, `${JSON.stringify(report, null, 2)}\n`);
    const t = report.totals;
    process.stdout.write(`   acceptance : ${report.status} — passed ${t.passed}, failed ${t.failed}, skipped ${t.skipped}, unsupported ${t.unsupported}, no-data ${t['no-data']}; hardware software ${report.hardware.software} / physical ${report.hardware.physical} / unverified ${report.hardware.unverified}\n`);
    for (const p of report.problems) process.stdout.write(`   PROBLEM: ${p}\n`);
    if (report.status !== 'passed') process.exitCode = 1;
  } else if (command === 'fetch-reports') {
    const sasUrl = process.env.AURA3D_ARTIFACTS_SAS;
    if (!sasUrl) throw new Error('SAS transport unavailable');
    const prefixes = String(opts.prefixes ?? '').split(',').filter(Boolean);
    const result = await fetchReports({ sasUrl, prefixes, destRoot: opts.dest });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } else if (command === 'evidence-summary') {
    const [vitestPath, fetchPath] = opts._;
    const summary = { schema: 'aura3d.acceptance5-evidence/1', files: summarizeVitest(readJsonOrNull(vitestPath)), fetch: readJsonOrNull(fetchPath) };
    process.stdout.write(`${Buffer.from(JSON.stringify(summary)).toString('base64').replace(/(.{76})/g, '$1\n')}\n`);
  } else throw new Error(`unknown command: ${command}`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).catch(error => { console.error(`FATAL: ${error.message}`); process.exitCode = 2; });
}
