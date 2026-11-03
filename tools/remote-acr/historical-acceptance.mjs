#!/usr/bin/env node
/** Closed, post-gate execution of the retained historical assertion inventory.
 *
 * Inputs are candidate-bound artifacts from completed native browser runs. A
 * legacy report's timestamp or a caller-provided hash alone is not evidence
 * that it describes the frozen candidate. This module never generates missing
 * reports or downloads history, and its CLI refuses source-phase invocation.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateAcceptanceGate } from '../native-capability-gate/index.mjs';
import { HISTORICAL_ACCEPTANCE_TESTS, HISTORICAL_REPLAY_ASSERTIONS, HISTORICAL_REPLAY_FIXTURES,
  HISTORICAL_REPLAY_INAPPLICABLE, HISTORICAL_REPLAY_SOURCE_TEST, HISTORICAL_REPLAY_TEST } from './source-checks.mjs';
import { redactText } from './upload-artifacts.mjs';

export const HISTORICAL_INPUT_SCHEMA = 'aura3d.native-historical-inputs/1';
export const HISTORICAL_REQUEST_SCHEMA = 'aura3d.native-historical-input-request/1';
export const HISTORICAL_REPORT_PATHS = Object.freeze([
  'tests/reports/bundle-scenarios.json',
  'tests/reports/developer-friction.json',
  'tests/reports/engine-layer-ratio.json',
  'tests/reports/negative-complexity.json',
  'tests/reports/tier12-route-health/report.json'
]);
const HASH = /^[a-f0-9]{64}$/;
const OID = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const RUN_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const MAX_JSON = 16 * 1024 * 1024;
const MAX_BUNDLE = 64 * 1024 * 1024;
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const fail = message => { throw new Error(message); };
const assert = (condition, message) => { if (!condition) fail(message); };
const eqRef = (a, b) => a?.path === b?.path && a?.sha256 === b?.sha256;

function safePath(path) {
  assert(typeof path === 'string' && path.length > 0 && !isAbsolute(path) && !path.includes('\\') &&
    !/[\x00-\x1f\x7f]/.test(path) && !path.split('/').some(part => !part || part === '.' || part === '..'), 'unsafe input path');
  return path;
}

function checkRef(ref, label) {
  assert(ref && typeof ref === 'object' && HASH.test(ref.sha256 || ''), `invalid ${label} reference`);
  safePath(ref.path);
  return ref;
}

function sameSet(a, b) {
  return a.length === b.length && new Set(a).size === a.length && new Set(b).size === b.length &&
    a.every(value => b.includes(value));
}

/** Validate identity and provenance using an injected bounded, hash-checking reader. */
export function validateHistoricalInputs(manifest, gate, gatePath, gateSha256, readRef) {
  safePath(gatePath);
  assert(HASH.test(gateSha256) && manifest?.schema === HISTORICAL_INPUT_SCHEMA, 'invalid historical input manifest');
  assert(eqRef(manifest.gate, { path: gatePath, sha256: gateSha256 }), 'historical inputs refer to a different gate');
  const candidate = manifest.candidate;
  assert(candidate?.freezeCommit === gate.freezeCommit && candidate?.sourceInputDigest === gate.sourceInputDigest &&
    candidate?.lockfileSha256 === gate.lockfileSha256 && eqRef(candidate?.candidatePlan, gate.candidatePlan), 'historical candidate identity mismatch');
  const rows = gate.deferredAcceptanceTests;
  assert(Array.isArray(rows) && sameSet(rows.map(row => row.path), [...HISTORICAL_ACCEPTANCE_TESTS]), 'deferred historical files do not match the gate');
  const ids = [];
  for (const row of rows) {
    assert(row.phase === 'acceptance' && row.status === 'not-run' && HASH.test(row.sha256 || '') &&
      Array.isArray(row.assertionIds) && row.assertionIds.length > 0, 'invalid deferred historical row');
    for (const id of row.assertionIds) {
      assert(typeof id === 'string' && id.startsWith(`${row.path}::`) && id.length > row.path.length + 2, 'invalid historical assertion ID');
      ids.push(id);
    }
  }
  assert(ids.length > 0 && new Set(ids).size === ids.length, 'duplicate historical assertion ID');
  assert(Array.isArray(manifest.reports) && sameSet(manifest.reports.map(report => report.path), [...HISTORICAL_REPORT_PATHS]), 'historical report inventory is incomplete');
  const paths = [gatePath];
  for (const report of manifest.reports) {
    checkRef(report, 'report');
    assert(Number.isSafeInteger(report.size) && report.size >= 0 && report.size <= MAX_JSON, 'invalid report size');
    const data = readRef(report, MAX_JSON);
    assert(data.length === report.size, `report size mismatch: ${report.path}`);
    try { JSON.parse(data.toString('utf8')); } catch { fail(`malformed report: ${report.path}`); }
    const receiptRef = checkRef(report.provenance?.receipt, 'producer receipt');
    assert(receiptRef.path.startsWith('tests/reports/native-historical-inputs/'), 'producer receipt must be an explicit retained input');
    assert(report.provenance?.kind === 'candidate-browser-run', 'report is historical or lacks candidate provenance');
    const artifactPath = `aura3d-browser-artifacts/reports/${report.path.slice('tests/reports/'.length)}`;
    assert(report.provenance.artifactPath === artifactPath, 'report artifact path mismatch');
    const receipt = JSON.parse(readRef(receiptRef, MAX_JSON).toString('utf8'));
    assert(receipt.schema === 'aura3d.native-browser-run/1' && RUN_ID.test(receipt.runId || '') && receipt.sourceRunId === gate.runId &&
      receipt.gateSha256 === gateSha256 && receipt.freezeCommit === gate.freezeCommit &&
      receipt.sourceInputDigest === gate.sourceInputDigest && receipt.lockfileSha256 === gate.lockfileSha256 &&
      eqRef(receipt.candidatePlan, gate.candidatePlan) && receipt.discoveryExit === 0 &&
      receipt.playwrightExit === 0 && receipt.inventoryExit === 0 && typeof receipt.project === 'string' && receipt.project.length > 0 &&
      Array.isArray(receipt.artifacts), `unverified producer for ${report.path}`);
    const matches = receipt.artifacts.filter(item => item.path === artifactPath);
    assert(matches.length === 1 && matches[0].sha256 === report.sha256 && matches[0].size === report.size,
      `producer artifact mismatch: ${report.path}`);
    paths.push(report.path, receiptRef.path);
  }
  const history = checkRef(manifest.history, 'history');
  assert(history.path.startsWith('tests/reports/native-historical-inputs/') &&
    Number.isSafeInteger(history.size) && history.size > 0 && history.size <= MAX_BUNDLE &&
    history.freezeCommit === gate.freezeCommit && OID.test(history.firstCommit || '') && history.firstCommit.startsWith('8471cb2f') &&
    OID.test(history.parentCommit || ''), 'history identity is invalid');
  assert(readRef(history, MAX_BUNDLE).length === history.size, 'history size mismatch');
  paths.push(history.path);
  return { files: [...new Set(paths)].sort(), assertionIds: ids.sort(), testPaths: [...HISTORICAL_ACCEPTANCE_TESTS] };
}

/** Build a manifest only from existing bytes and candidate-bound producer records. */
export function buildHistoricalInputManifest(request, gate, gatePath, gateSha256, readPath) {
  assert(request?.schema === HISTORICAL_REQUEST_SCHEMA && Array.isArray(request.reports) &&
    sameSet(request.reports.map(report => report.path), [...HISTORICAL_REPORT_PATHS]), 'historical input request is incomplete or ambiguous');
  const reports = request.reports.map(report => {
    safePath(report.path);
    assert(typeof report.receiptPath === 'string' && report.receiptPath.startsWith('tests/reports/native-historical-inputs/'),
      'producer receipt must be an explicit retained input');
    safePath(report.receiptPath);
    const bytes = readPath(report.path, MAX_JSON);
    // The preserved tests parse these files directly; reject malformed inputs
    // during preparation rather than starting a test process to discover them.
    JSON.parse(bytes.toString('utf8'));
    const receipt = readPath(report.receiptPath, MAX_JSON);
    return { path: report.path, sha256: sha256(bytes), size: bytes.length,
      provenance: { kind: 'candidate-browser-run', receipt: { path: report.receiptPath, sha256: sha256(receipt) },
        artifactPath: `aura3d-browser-artifacts/reports/${report.path.slice('tests/reports/'.length)}` } };
  });
  const history = request.history;
  assert(history && typeof history.path === 'string' && history.path.startsWith('tests/reports/native-historical-inputs/'),
    'offline history bundle is missing');
  safePath(history.path);
  const historyBytes = readPath(history.path, MAX_BUNDLE);
  const manifest = { schema: HISTORICAL_INPUT_SCHEMA, gate: { path: gatePath, sha256: gateSha256 },
    candidate: { freezeCommit: gate.freezeCommit, sourceInputDigest: gate.sourceInputDigest,
      lockfileSha256: gate.lockfileSha256, candidatePlan: gate.candidatePlan },
    reports, history: { path: history.path, sha256: sha256(historyBytes), size: historyBytes.length,
      freezeCommit: gate.freezeCommit, firstCommit: history.firstCommit, parentCommit: history.parentCommit } };
  validateHistoricalInputs(manifest, gate, gatePath, gateSha256, (ref, max) => {
    const bytes = readPath(ref.path, max);
    assert(sha256(bytes) === ref.sha256, `input hash mismatch: ${ref.path}`);
    return bytes;
  });
  return manifest;
}

function readSafe(root, path, limit) {
  safePath(path);
  const rootReal = realpathSync(root);
  let current = rootReal;
  for (const part of path.split('/')) {
    current = resolve(current, part);
    const stat = lstatSync(current);
    assert(!stat.isSymbolicLink(), `symlink input is forbidden: ${path}`);
  }
  assert(current.startsWith(`${rootReal}${sep}`), 'input escaped the source root');
  const stat = lstatSync(current);
  assert(stat.isFile() && stat.size <= limit, `input is missing or exceeds its bound: ${path}`);
  return readFileSync(current);
}

function readBound(root, ref, limit) {
  checkRef(ref, 'input');
  const bytes = readSafe(root, ref.path, limit);
  assert(sha256(bytes) === ref.sha256, `input hash mismatch: ${ref.path}`);
  return bytes;
}

function gitEnv() {
  // Neither Git nor test subprocesses need ambient service credentials.
  const allowed = new Set(['PATH', 'TMPDIR', 'LANG', 'LC_ALL', 'TZ', 'CI', 'SYSTEMROOT', 'WINDIR']);
  const env = Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.has(key)));
  env.GIT_CONFIG_NOSYSTEM = '1';
  env.GIT_CONFIG_GLOBAL = '/dev/null';
  env.GIT_TERMINAL_PROMPT = '0';
  env.GIT_CONFIG_COUNT = '1';
  env.GIT_CONFIG_KEY_0 = 'core.hooksPath';
  env.GIT_CONFIG_VALUE_0 = '/dev/null';
  return env;
}

function git(args, cwd) {
  const result = spawnSync('git', args, { cwd, env: gitEnv(), encoding: 'utf8', maxBuffer: 1024 * 1024, timeout: 120000 });
  assert(result.status === 0 && !result.error, 'offline history verification failed');
  return result.stdout.trim();
}

/** Prepare a private bare repository from a self-contained local bundle. */
function prepareHistory(root, history, destination) {
  const bundle = resolve(root, history.path);
  git(['init', '--bare', '--quiet', destination], root);
  git(['--git-dir', destination, 'bundle', 'verify', bundle], root);
  const heads = git(['bundle', 'list-heads', bundle], root).split('\n').filter(Boolean);
  assert(heads.length === 1 && heads[0] === `${history.freezeCommit} refs/heads/frozen`, 'offline history has unexpected heads');
  git(['--git-dir', destination, 'fetch', '--quiet', '--no-tags', '--no-write-fetch-head', bundle,
    'refs/heads/frozen:refs/heads/frozen'], root);
  git(['--git-dir', destination, 'symbolic-ref', 'HEAD', 'refs/heads/frozen'], root);
  assert(git(['--git-dir', destination, 'rev-parse', '--verify', 'HEAD^{commit}'], root) === history.freezeCommit &&
    git(['--git-dir', destination, 'rev-parse', '--verify', '8471cb2f^{commit}'], root) === history.firstCommit &&
    git(['--git-dir', destination, 'rev-parse', '--verify', '8471cb2f~1^{commit}'], root) === history.parentCommit,
  'offline history does not match the frozen candidate and baseline');
  return destination;
}

/** Preserve failed, skipped and missing assertions as distinct outcomes. */
export function evaluateHistoricalResults(report, gate, root) {
  const rows = gate.deferredAcceptanceTests;
  const expected = rows.flatMap(row => row.assertionIds).sort();
  assert(Array.isArray(report?.testResults), 'historical Vitest result is missing');
  const observed = new Map();
  const files = [];
  for (const file of report.testResults) {
    const path = (isAbsolute(file.name) ? relative(root, file.name) : file.name).replaceAll('\\', '/');
    files.push(path);
    assert(Array.isArray(file.assertionResults), 'historical assertion results are missing');
    for (const test of file.assertionResults) {
      const id = `${path}::${test.fullName || test.title || ''}`;
      assert(!observed.has(id), `duplicate historical assertion: ${id}`);
      observed.set(id, test.status);
    }
  }
  assert(sameSet(files, [...HISTORICAL_ACCEPTANCE_TESTS]), 'historical executed file inventory differs');
  const missing = expected.filter(id => !observed.has(id));
  const unexpected = [...observed.keys()].filter(id => !expected.includes(id));
  const failed = expected.filter(id => observed.get(id) === 'failed');
  const skipped = expected.filter(id => observed.has(id) && !['passed', 'failed'].includes(observed.get(id)));
  const passed = expected.filter(id => observed.get(id) === 'passed');
  const complete = missing.length === 0 && unexpected.length === 0 && failed.length === 0 && skipped.length === 0 &&
    passed.length === expected.length && report.success === true && report.numTotalTests === expected.length;
  return { status: complete ? 'passed' : 'failed', expected, passed, failed, skipped, missing, unexpected };
}

/** The first-party replay is a distinct fixture-based cell, not a browser receipt. */
export function validateHistoricalReplayContract(gate) {
  const row = gate?.deferredReplayTests;
  assert(row?.schema === 'aura3d.historical-replay-inventory/1' && row.kind === 'first-party-historical-regression' &&
    row.path === HISTORICAL_REPLAY_TEST && HASH.test(row.sha256 || '') && row.phase === 'acceptance' && row.status === 'not-run' &&
    row.currentCandidateBrowserReceipt === false && row.sourceTest?.path === HISTORICAL_REPLAY_SOURCE_TEST &&
    HASH.test(row.sourceTest?.sha256 || ''), 'invalid deferred historical replay contract');
  assert(Array.isArray(row.assertionIds) && sameSet(row.assertionIds, [...HISTORICAL_REPLAY_ASSERTIONS]) &&
    Array.isArray(row.inapplicableAssertionIds) && sameSet(row.inapplicableAssertionIds, [...HISTORICAL_REPLAY_INAPPLICABLE]),
  'historical replay assertion inventory differs');
  assert(Array.isArray(row.fixtures) && row.fixtures.length === HISTORICAL_REPLAY_FIXTURES.length &&
    sameSet(row.fixtures.map(ref => ref.path), HISTORICAL_REPLAY_FIXTURES.map(ref => ref.path)) &&
    row.fixtures.every(ref => HISTORICAL_REPLAY_FIXTURES.some(expected => eqRef(ref, expected))), 'historical replay fixture inventory differs');
  return row;
}

export function evaluateHistoricalReplayResults(report, gate, root) {
  const row = validateHistoricalReplayContract(gate);
  assert(Array.isArray(report?.testResults) && report.testResults.length === 1, 'historical replay result is missing');
  const file = report.testResults[0];
  const path = (isAbsolute(file.name) ? relative(root, file.name) : file.name).replaceAll('\\', '/');
  assert(path === row.path && Array.isArray(file.assertionResults), 'historical replay file inventory differs');
  const observed = new Map();
  for (const test of file.assertionResults) {
    const id = `${path}::${test.fullName || test.title || ''}`;
    assert(!observed.has(id), `duplicate historical replay assertion: ${id}`);
    observed.set(id, test.status);
  }
  const expected = [...row.assertionIds].sort();
  const inapplicable = row.inapplicableAssertionIds.map(id => ({ id, status: observed.get(id) ?? 'not-discovered' }));
  const invalidInactive = inapplicable.filter(item => !['pending', 'todo', 'skipped', 'disabled', 'not-discovered'].includes(item.status));
  const unexpected = [...observed.keys()].filter(id => !expected.includes(id) && !row.inapplicableAssertionIds.includes(id));
  const missing = expected.filter(id => !observed.has(id));
  const failed = expected.filter(id => observed.get(id) === 'failed');
  const skipped = expected.filter(id => observed.has(id) && !['passed', 'failed'].includes(observed.get(id)));
  const passed = expected.filter(id => observed.get(id) === 'passed');
  const complete = missing.length === 0 && unexpected.length === 0 && invalidInactive.length === 0 && failed.length === 0 &&
    skipped.length === 0 && passed.length === expected.length && report.success === true && report.numTotalTests === observed.size;
  return { status: complete ? 'passed' : 'failed', expected, passed, failed, skipped, missing, unexpected, inapplicable, invalidInactive };
}

function loadReplayGate(root, gatePath) {
  const gate = validateAcceptanceGate({ root, gatePath });
  const gateSha256 = sha256(readSafe(root, gatePath, MAX_JSON));
  const row = validateHistoricalReplayContract(gate);
  for (const fixture of row.fixtures) readBound(root, fixture, MAX_BUNDLE);
  return { gate, gateSha256, row };
}

function loadInputs(root, gatePath, inputPath) {
  assert(inputPath.startsWith('tests/reports/native-historical-inputs/'), 'historical input manifest must be run-scoped');
  const gate = validateAcceptanceGate({ root, gatePath });
  const gateBytes = readSafe(root, gatePath, MAX_JSON);
  const inputBytes = readSafe(root, inputPath, MAX_JSON);
  const manifest = JSON.parse(inputBytes.toString('utf8'));
  const validated = validateHistoricalInputs(manifest, gate, gatePath, sha256(gateBytes), (ref, max) => readBound(root, ref, max));
  return { gate, gateSha256: sha256(gateBytes), manifest, inputSha256: sha256(inputBytes), ...validated };
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    assert(['--phase', '--gate', '--inputs', '--run-id', '--list-inputs'].includes(key) && options[key] === undefined, 'invalid historical launcher argument');
    if (key === '--list-inputs') options[key] = true;
    else { assert(args[index + 1] && !args[index + 1].startsWith('--'), `missing ${key}`); options[key] = args[++index]; }
  }
  assert(['prepare', 'preflight', 'execute', 'replay-preflight', 'replay-execute'].includes(options['--phase']) && options['--gate'], 'missing historical launcher inputs');
  const replay = options['--phase'].startsWith('replay-');
  assert(replay ? !options['--inputs'] && !options['--list-inputs'] : Boolean(options['--inputs']), 'invalid historical input selection');
  assert(['preflight', 'replay-preflight'].includes(options['--phase']) || (!options['--list-inputs'] && RUN_ID.test(options['--run-id'] || '')), 'invalid historical run ID');
  return options;
}

function main(args) {
  assert(process.env.AURA3D_SOURCE_PROCESS_GUARD !== '1', 'historical acceptance is forbidden during source work');
  const options = parseArgs(args), root = process.cwd();
  const gatePath = safePath(options['--gate']);
  if (options['--phase'].startsWith('replay-')) {
    const replay = loadReplayGate(root, gatePath);
    assert(process.env.A3D_RELEASE_PLAN === undefined || process.env.A3D_RELEASE_PLAN === replay.gate.candidatePlan.path,
      'release plan differs from the validated gate');
    if (options['--phase'] === 'replay-preflight') {
      process.stdout.write('historical replay fixture inputs validated\n');
      return 0;
    }
    const runId = options['--run-id'];
    const parentDir = resolve(root, 'tests/reports/native-historical-replay');
    mkdirSync(parentDir, { recursive: true });
    assert(realpathSync(parentDir) === parentDir, 'unsafe historical replay output directory');
    const outDir = resolve(parentDir, runId);
    mkdirSync(outDir, { recursive: false });
    const output = resolve(outDir, 'vitest.json');
    const env = { ...gitEnv(), AURA3D_CODE_COMPLETE_GATE: gatePath, A3D_RELEASE_PLAN: replay.gate.candidatePlan.path };
    const result = spawnSync(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', replay.row.path,
      '--maxWorkers=1', '--minWorkers=1', '--reporter=json', `--outputFile=${output}`],
    { cwd: root, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 900000 });
    writeFileSync(resolve(outDir, 'vitest.log'), redactText(`${result.stdout || ''}\n${result.stderr || ''}`), { flag: 'wx' });
    let inventory = { status: 'not-run', reason: 'Vitest did not produce a valid replay result' };
    try { inventory = evaluateHistoricalReplayResults(JSON.parse(readFileSync(output, 'utf8')), replay.gate, root); } catch { /* Preserve missing or invalid results. */ }
    let identity = 'valid';
    try { assert(loadReplayGate(root, gatePath).gateSha256 === replay.gateSha256, 'gate changed'); } catch { identity = 'changed'; }
    const passed = result.status === 0 && !result.error && inventory.status === 'passed' && identity === 'valid';
    const summary = { schema: 'aura3d.native-historical-replay-run/1', runId, status: passed ? 'passed' : 'failed',
      gateSha256: replay.gateSha256, freezeCommit: replay.gate.freezeCommit, sourceInputDigest: replay.gate.sourceInputDigest,
      candidatePlan: replay.gate.candidatePlan, fixtureKind: replay.row.kind, fixtures: replay.row.fixtures,
      currentCandidateBrowserReceipt: false, testExit: Number.isInteger(result.status) ? result.status : null, identity, inventory };
    writeFileSync(resolve(outDir, 'run-manifest.json'), `${JSON.stringify(summary, null, 2)}\n`, { flag: 'wx' });
    process.stdout.write(`HISTORICAL_EXIT=${passed ? 0 : 1}\n`);
    return passed ? 0 : 1;
  }
  const inputPath = safePath(options['--inputs']);
  if (options['--phase'] === 'prepare') {
    assert(inputPath.startsWith('tests/reports/native-historical-inputs/'), 'historical request must be run-scoped');
    const gate = validateAcceptanceGate({ root, gatePath });
    const gateBytes = readSafe(root, gatePath, MAX_JSON);
    const gateSha256 = sha256(gateBytes);
    const requestBytes = readSafe(root, inputPath, MAX_JSON);
    const request = JSON.parse(requestBytes.toString('utf8'));
    const manifest = buildHistoricalInputManifest(request, gate, gatePath, gateSha256, (path, max) => readSafe(root, path, max));
    assert(process.env.A3D_RELEASE_PLAN === undefined || process.env.A3D_RELEASE_PLAN === gate.candidatePlan.path,
      'release plan differs from the validated gate');
    const temporary = mkdtempSync(resolve(tmpdir(), 'aura3d-historical-prepare-'));
    try {
      prepareHistory(root, manifest.history, resolve(temporary, 'history.git'));
      // Inputs and the actual gate can change while offline history is read.
      // Recheck all bytes before publishing a fresh, immutable manifest.
      const currentGate = validateAcceptanceGate({ root, gatePath });
      assert(sha256(readSafe(root, gatePath, MAX_JSON)) === gateSha256 &&
        sha256(readSafe(root, inputPath, MAX_JSON)) === sha256(requestBytes), 'historical request or gate changed');
      validateHistoricalInputs(manifest, currentGate, gatePath, gateSha256, (ref, max) => readBound(root, ref, max));
      const baseDir = resolve(root, 'tests/reports/native-historical-inputs');
      assert(realpathSync(baseDir) === baseDir, 'unsafe historical input directory');
      const parentDir = resolve(baseDir, options['--run-id']);
      try { mkdirSync(parentDir); } catch (error) { if (error?.code !== 'EEXIST') throw error; }
      const parentStat = lstatSync(parentDir);
      assert(parentStat.isDirectory() && !parentStat.isSymbolicLink() && realpathSync(parentDir) === parentDir,
        'unsafe historical input directory');
      const output = resolve(parentDir, 'manifest.json');
      writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
      process.stdout.write(`tests/reports/native-historical-inputs/${options['--run-id']}/manifest.json\n`);
      return 0;
    } finally { rmSync(temporary, { recursive: true, force: true }); }
  }
  const inputs = loadInputs(root, gatePath, inputPath);
  assert(process.env.A3D_RELEASE_PLAN === undefined || process.env.A3D_RELEASE_PLAN === inputs.gate.candidatePlan.path,
    'release plan differs from the validated gate');
  const temporary = mkdtempSync(resolve(tmpdir(), 'aura3d-historical-'));
  try {
    const historyDir = prepareHistory(root, inputs.manifest.history, resolve(temporary, 'history.git'));
    if (options['--phase'] === 'preflight') {
      if (options['--list-inputs']) process.stdout.write(`${JSON.stringify([...new Set([...inputs.files, inputPath])].sort())}\n`);
      else process.stdout.write('historical inputs validated\n');
      return 0;
    }
    const runId = options['--run-id'];
    const parentDir = resolve(root, 'tests/reports/native-historical-acceptance');
    mkdirSync(parentDir, { recursive: true });
    assert(realpathSync(parentDir) === parentDir, 'unsafe historical output directory');
    const outDir = resolve(parentDir, runId);
    mkdirSync(outDir, { recursive: false });
    const output = resolve(outDir, 'vitest.json');
    const env = { ...gitEnv(), GIT_DIR: historyDir, GIT_WORK_TREE: root,
      AURA3D_CODE_COMPLETE_GATE: gatePath, A3D_RELEASE_PLAN: inputs.gate.candidatePlan.path };
    const result = spawnSync(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', ...inputs.testPaths,
      '--maxWorkers=1', '--minWorkers=1', '--reporter=json', `--outputFile=${output}`],
    { cwd: root, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 900000 });
    const log = redactText(`${result.stdout || ''}\n${result.stderr || ''}`);
    writeFileSync(resolve(outDir, 'vitest.log'), log, { flag: 'wx' });
    let inventory = { status: 'not-run', reason: 'Vitest did not produce a valid result' };
    try { inventory = evaluateHistoricalResults(JSON.parse(readFileSync(output, 'utf8')), inputs.gate, root); } catch { /* Preserve the missing/invalid result. */ }
    let identity = 'valid';
    try {
      const after = loadInputs(root, gatePath, inputPath);
      assert(after.gateSha256 === inputs.gateSha256 && after.inputSha256 === inputs.inputSha256, 'acceptance inputs changed');
    } catch { identity = 'changed'; }
    const passed = result.status === 0 && !result.error && inventory.status === 'passed' && identity === 'valid';
    const summary = { schema: 'aura3d.native-historical-run/1', runId, status: passed ? 'passed' : 'failed',
      gateSha256: inputs.gateSha256, inputManifestSha256: inputs.inputSha256, freezeCommit: inputs.gate.freezeCommit,
      sourceInputDigest: inputs.gate.sourceInputDigest, candidatePlan: inputs.gate.candidatePlan,
      evidenceKind: 'candidate-bound browser-run artifacts; historical comparison assertions',
      testExit: Number.isInteger(result.status) ? result.status : null, identity, inventory };
    writeFileSync(resolve(outDir, 'run-manifest.json'), `${JSON.stringify(summary, null, 2)}\n`, { flag: 'wx' });
    process.stdout.write(`HISTORICAL_EXIT=${passed ? 0 : 1}\n`);
    return passed ? 0 : 1;
  } finally { rmSync(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { process.exitCode = main(process.argv.slice(2)); }
  catch (error) { console.error(`historical acceptance not-run: ${error instanceof Error ? error.message : 'invalid input'}`); process.exitCode = 2; }
}
