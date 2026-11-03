/** Verify and stage a retained Phase A build handoff. This module runs no checks. */
import { createHash } from 'node:crypto';
import {
  closeSync, constants, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync,
  readSync, realpathSync, renameSync, rmSync, rmdirSync, writeSync
} from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';

export const SOURCE_BUILD_SCHEMA = 'aura3d.native-source-build/1';
const HASH = /^[a-f0-9]{64}$/;
const RUN_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const MAX_DOCUMENT = 64 * 1024 * 1024;
const MAX_BUILD_REPORT = 256 * 1024 * 1024;
const MAX_ARCHIVE = 64 * 1024 * 1024;
const SUMMARY = ['expectedFiles', 'discoveredFiles', 'testCount', 'passedCount', 'failedCount', 'skippedCount', 'testNames'];
const VITEST_IDS = ['parity', 'unit', 'assets-qr', 'unit-dist'];
const TAP_IDS = ['packages', 'node-release'];
const assert = (condition, message) => { if (!condition) throw new Error(`source build handoff: ${message}`); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const canonical = value => {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
};
const equal = (actual, expected, message) => assert(canonical(actual) === canonical(expected), message);

function safeRelative(path, prefix) {
  assert(typeof path === 'string' && path.startsWith(`${prefix}/`) && !isAbsolute(path)
    && !path.includes('\\') && !/[\x00-\x1f\x7f]/.test(path), 'invalid retained path');
  const parts = path.split('/');
  assert(parts.every(part => part && part !== '.' && part !== '..'
    && !/^(?:node_modules|\.git|\.npmrc|\.pypirc|\.netrc|\.env(?:\..*)?|credentials?|secrets?)$/i.test(part)
    && !/\.(?:pem|key|p12|pfx)$/i.test(part)), 'unsafe retained path');
  return path;
}

// Inspect each ancestor instead of trusting a lexical prefix. Open files with
// O_NOFOLLOW and compare their inode with the inspected file before reading.
function openRegular(root, path, maxSize) {
  let current = root;
  const parts = path.split('/');
  for (const [index, part] of parts.entries()) {
    current = resolve(current, part);
    const stat = lstatSync(current);
    assert(!stat.isSymbolicLink(), `symbolic link in retained input: ${path}`);
    assert(index === parts.length - 1 ? stat.isFile() : stat.isDirectory(), `invalid retained input: ${path}`);
  }
  assert(realpathSync(current) === current, `retained input escapes root: ${path}`);
  const before = lstatSync(current);
  assert(before.size <= maxSize, `retained input too large: ${path}`);
  const fd = openSync(current, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
  try {
    const opened = fstatSync(fd);
    assert(opened.isFile() && before.dev === opened.dev && before.ino === opened.ino && opened.size <= maxSize, `retained input changed: ${path}`);
    return { fd, size: opened.size };
  } catch (error) { closeSync(fd); throw error; }
}

function consume(root, path, maxSize, collect = false, outputFd = null) {
  const { fd, size } = openRegular(root, path, maxSize);
  const digest = createHash('sha256'), chunk = Buffer.allocUnsafe(1024 * 1024), pieces = [];
  let total = 0;
  try {
    let n;
    while ((n = readSync(fd, chunk, 0, chunk.length, null)) > 0) {
      total += n;
      assert(total <= maxSize, `retained input too large: ${path}`);
      const part = chunk.subarray(0, n);
      digest.update(part);
      if (collect) pieces.push(Buffer.from(part));
      if (outputFd !== null) {
        let written = 0;
        while (written < n) written += writeSync(outputFd, part, written, n - written);
      }
    }
    assert(total === size && fstatSync(fd).size === size, `retained input changed: ${path}`);
  } finally { closeSync(fd); }
  return { sha256: digest.digest('hex'), bytes: collect ? Buffer.concat(pieces, total) : undefined };
}

function json(bytes, label) {
  try { return JSON.parse(bytes.toString('utf8')); }
  catch { throw new Error(`source build handoff: invalid ${label} JSON`); }
}
function sortedUniqueStrings(value, label) {
  assert(Array.isArray(value) && value.every(item => typeof item === 'string' && item.length > 0)
    && new Set(value).size === value.length, `invalid ${label}`);
  equal(value, [...value].sort(), `${label} is not sorted`);
}
function checkSummary(inventory, observed) {
  for (const key of SUMMARY) equal(inventory[key], observed[key], `${inventory.checkId} result summary mismatch: ${key}`);
  assert(Number.isSafeInteger(observed.testCount) && observed.testCount > 0
    && observed.passedCount === observed.testCount && observed.failedCount === 0 && observed.skippedCount === 0,
  `${inventory.checkId} has missing, failed or skipped tests`);
}

export function verifySupplementalEvidence({ runId, plan, check, inventory, api, readRetained }) {
  assert(RUN_ID.test(runId || '') && typeof readRetained === 'function', 'invalid supplemental verification input');
  api.validateSupplementalCheck(plan, runId);
  assert(check?.id === plan.id && check.runner === plan.runner && check.cwd === plan.cwd && check.argv === null
    && check.status === 'passed' && check.exitCode === 0 && check.started === true, `supplemental check did not pass: ${plan.id}`);
  assert(inventory?.checkId === plan.id && inventory.runner === plan.runner && inventory.cwd === plan.cwd,
    `supplemental test inventory identity mismatch: ${plan.id}`);
  assert(Array.isArray(check.subruns) && check.subruns.length === plan.invocations.length,
    `supplemental invocation inventory mismatch: ${plan.id}`);
  const reportDir = `tests/reports/native-capabilities/${runId}`, observed = {
    expectedFiles: [...plan.expectedFiles], discoveredFiles: [], testCount: 0,
    passedCount: 0, failedCount: 0, skippedCount: 0, testNames: []
  };
  for (const [index, invocation] of plan.invocations.entries()) {
    const subrun = check.subruns[index];
    assert(subrun && subrun.file === (invocation.file || null) && subrun.cwd === plan.cwd
      && subrun.exitCode === 0 && subrun.signal === null && subrun.error === null,
    `supplemental invocation did not pass: ${plan.id}/${index}`);
    equal(subrun.argv, invocation.argv, `supplemental invocation command mismatch: ${plan.id}/${index}`);
    const outputPath = `${reportDir}/results/${plan.id}/${index}.${plan.runner === 'node-test' ? 'tap' : 'log'}`;
    const output = readRetained(subrun.result, outputPath);
    if (plan.runner === 'vitest') {
      assert(typeof inventory.sourceRoot === 'string' && isAbsolute(inventory.sourceRoot) && !inventory.sourceRoot.includes('\0'),
        `invalid supplemental Vitest root: ${plan.id}`);
      equal(subrun.testResult, inventory.result, `supplemental Vitest result identity mismatch: ${plan.id}`);
      const result = readRetained(inventory.result, `${reportDir}/${plan.id}.json`);
      const parsed = api.parseVitestInventory(json(result, 'supplemental Vitest result'), plan.expectedFiles, inventory.sourceRoot, plan.cwd);
      checkSummary(inventory, parsed);
    } else {
      const stats = plan.runner === 'node-test'
        ? api.parseTap(output.toString('utf8'))
        : api.parseSourceShellResult(output.toString('utf8'), invocation.file);
      if (plan.runner === 'shell') {
        assert(inventory.countKind === 'file-invocations' && subrun.reportedCases === stats.reportedCases,
          `supplemental shell result mismatch: ${invocation.file}`);
      }
      observed.discoveredFiles.push(invocation.file);
      for (const key of ['testCount', 'passedCount', 'failedCount', 'skippedCount']) observed[key] += stats[key];
      observed.testNames.push(...stats.testNames);
    }
  }
  if (plan.runner !== 'vitest') checkSummary(inventory, observed);
}

/**
 * Verify already-retained source checks and candidate bytes. `manifestBytes`
 * comes from the NEW staged context, which need not be located under `root`.
 * `expectedReportSha256` is a separately retained identity, not an assertion
 * that the transport or its signer is trustworthy.
 */
export function verifySourceBuildHandoff({ root, runId, releaseKind, manifestBytes, manifest, report, expectedReportSha256, api }) {
  assert(RUN_ID.test(runId || '') && ['patch', 'minor', 'major'].includes(releaseKind), 'invalid run or release kind');
  assert(HASH.test(expectedReportSha256 || ''), 'missing separately retained build report digest');
  assert(Buffer.isBuffer(manifestBytes), 'staged manifest bytes are required');
  for (const key of ['buildSteps', 'expectedTestFiles', 'nativeSourceInventoryForManifest', 'sourceTestFileCoverage',
    'validateSupplementalCheck', 'parseSourceShellResult', 'parseVitestInventory', 'parseTap', 'validateSourceArgv', 'verifyCandidate']) {
    assert(typeof api?.[key] === 'function', `missing verifier callback: ${key}`);
  }
  const sourceRoot = realpathSync(root), reportDir = `tests/reports/native-capabilities/${runId}`;
  const reportPath = `${reportDir}/source-build.json`;
  const reportData = consume(sourceRoot, reportPath, MAX_BUILD_REPORT, true);
  assert(reportData.sha256 === expectedReportSha256, 'build report digest mismatch');
  const retainedReport = json(reportData.bytes, 'build report');
  if (report !== undefined) equal(retainedReport, report, 'build report differs from supplied report');
  report = retainedReport;
  equal(json(manifestBytes, 'staged manifest'), manifest, 'staged manifest object differs from its bytes');
  assert(report?.schema === SOURCE_BUILD_SCHEMA && report.runId === runId && report.releaseKind === releaseKind
    && report.acceptance === 'not-run', 'build report identity or acceptance mismatch');
  sortedUniqueStrings(report.completedOutcomeIds, 'completed outcome IDs');
  assert(Array.isArray(report.buildProducts) && report.buildProducts.length > 0 && report.buildProducts.length <= 1_000_000
    && HASH.test(report.buildProductsSha256 || ''), 'missing or oversized build product inventory');
  const productByPath = new Map();
  let productBytes = 0;
  for (const item of report.buildProducts) {
    assert(item && typeof item.path === 'string'
      && /^(?:dist|packages\/[\w.-]+\/dist)(?:\/.+)?$/.test(item.path)
      && !item.path.includes('\\') && !/[\x00-\x1f\x7f]/.test(item.path)
      && item.path.split('/').every(part => part && part !== '.' && part !== '..'
        && !/^(?:node_modules|\.git|\.npmrc|\.pypirc|\.netrc|\.env(?:\..*)?|credentials?|secrets?)$/i.test(part)
        && !/\.(?:pem|key|p12|pfx)$/i.test(part))
      && /^(?:100|040)[0-7]{3}$/.test(item.mode || '') && HASH.test(item.sha256 || '')
      && Number.isSafeInteger(item.size) && item.size >= 0 && item.size <= 1024 * 1024 * 1024, 'invalid build product');
    equal(Object.keys(item).sort(), ['mode', 'path', 'sha256', 'size'], 'unexpected build product metadata');
    if (item.mode.startsWith('040')) assert(item.size === 0 && item.sha256 === hash(''), 'invalid build directory metadata');
    productBytes += item.size;
    assert(productBytes <= 8 * 1024 * 1024 * 1024, 'build product inventory exceeds its byte limit');
    productByPath.set(item.path, item);
  }
  sortedUniqueStrings(report.buildProducts.map(item => item.path), 'build product paths');
  assert(productByPath.get('dist')?.mode.startsWith('040')
    && report.buildProducts.some(item => /^packages\/[\w.-]+\/dist$/.test(item.path) && item.mode.startsWith('040')),
  'required build product roots are missing');
  assert(report.buildProducts.some(item => item.mode.startsWith('100')), 'build product inventory contains no files');
  for (const item of report.buildProducts) {
    const match = item.path.match(/^(dist|packages\/[\w.-]+\/dist)(?:\/(.*))?$/);
    const root = match[1];
    assert(productByPath.get(root)?.mode.startsWith('040'), 'build product root directory missing');
    if (item.path !== root) {
      const parent = item.path.slice(0, item.path.lastIndexOf('/'));
      assert(productByPath.get(parent)?.mode.startsWith('040'), 'build product parent directory missing');
    }
  }
  assert(hash(canonical(report.buildProducts)) === report.buildProductsSha256, 'build product inventory digest mismatch');

  const retained = new Map([[reportPath, expectedReportSha256]]);
  const add = (ref, expectedPath, maxSize = MAX_DOCUMENT, collect = false) => {
    assert(ref && typeof ref === 'object' && HASH.test(ref.sha256 || ''), 'invalid retained reference');
    const path = safeRelative(ref.path, reportDir);
    if (expectedPath) assert(path === expectedPath, 'unexpected retained path');
    assert(!retained.has(path), `duplicate retained path: ${path}`);
    const data = consume(sourceRoot, path, maxSize, collect);
    assert(data.sha256 === ref.sha256, `retained digest mismatch: ${path}`);
    retained.set(path, ref.sha256);
    return data.bytes;
  };
  const sourceManifest = { path: report.sourceManifestPath, sha256: report.sourceManifestSha256 };
  const sourceBytes = add(sourceManifest, `${reportDir}/source-manifest.json`, MAX_DOCUMENT, true);
  assert(sourceBytes.equals(manifestBytes), 'staged and retained source manifest bytes differ');
  const sourceInventory = report.sourceInventory;
  const inventoryBytes = add(sourceInventory, `${reportDir}/source-inventory.json`, MAX_DOCUMENT, true);
  const sourcePlan = api.nativeSourceInventoryForManifest(manifest, runId);
  equal(json(inventoryBytes, 'source inventory'), sourcePlan, 'source inventory differs from the staged manifest');
  const supplemental = new Map(sourcePlan.supplementalChecks.map(check => [check.id, check]));
  const steps = api.buildSteps(runId, reportDir, releaseKind, sourcePlan);
  assert(Array.isArray(steps) && steps.filter(step => step.id === 'pack').length === 1, 'invalid canonical build steps');
  const packIndex = steps.findIndex(step => step.id === 'pack');
  assert(packIndex >= 0 && steps[packIndex + 1]?.id === 'resume-rebuild'
    && steps[packIndex + 2]?.id === 'unit-packed', 'invalid build/resume boundary');
  const prefix = steps.slice(0, packIndex + 1), ids = prefix.map(step => step.id);
  assert(new Set(ids).size === ids.length, 'duplicate canonical build check');
  equal(report.expectedCheckIds, ids, 'build check inventory mismatch');
  equal(report.fullExpectedCheckIds, steps.map(step => step.id), 'full source check inventory mismatch');
  equal(report.executedCheckIds, ids, 'executed build check inventory mismatch');
  assert(Array.isArray(report.checks), 'missing build checks');
  equal(report.checks.map(check => check.id), ids, 'build check order mismatch');
  const expected = api.expectedTestFiles(manifest);
  const inventoryIds = ids.filter(id => VITEST_IDS.includes(id) || TAP_IDS.includes(id) || supplemental.has(id));
  assert(Array.isArray(report.testInventories), 'missing test inventories');
  equal(report.testInventories.map(inventory => inventory.checkId), inventoryIds, 'test inventory order mismatch');
  for (const id of inventoryIds) {
    if (supplemental.has(id)) continue;
    sortedUniqueStrings(expected?.[id], `expected ${id} files`);
    assert(expected[id].length > 0, `empty expected ${id} inventory`);
  }
  const coverage = api.sourceTestFileCoverage(sourcePlan, report.testInventories);
  for (const [key, value] of Object.entries(coverage)) equal(report[key], value, `source test coverage mismatch: ${key}`);

  for (const [index, step] of prefix.entries()) {
    const check = report.checks[index];
    assert(check.status === 'passed' && check.exitCode === 0 && check.started === true, `build check did not pass: ${step.id}`);
    equal(check.argv, step.argv, `build command mismatch: ${step.id}`);
    add({ path: check.log, sha256: check.sha256 }, `${reportDir}/logs/${step.id}.log`);
    assert(Array.isArray(check.subruns), `missing build subruns: ${step.id}`);
    if (!TAP_IDS.includes(step.id) && !supplemental.has(step.id)) {
      assert(check.subruns.length === 0, `unexpected build subruns: ${step.id}`);
      api.validateSourceArgv(step.id, check.argv);
    }
    const inventory = report.testInventories.find(item => item.checkId === step.id);
    if (supplemental.has(step.id)) {
      verifySupplementalEvidence({ runId, plan: supplemental.get(step.id), check, inventory, api,
        readRetained: (ref, expectedPath) => add(ref, expectedPath, MAX_DOCUMENT, true) });
    }
    if (VITEST_IDS.includes(step.id)) {
      assert(typeof inventory.sourceRoot === 'string' && isAbsolute(inventory.sourceRoot) && !inventory.sourceRoot.includes('\0'), 'invalid recorded Vitest root');
      const result = add(inventory.result, `${reportDir}/${step.id}.json`, MAX_DOCUMENT, true);
      checkSummary(inventory, api.parseVitestInventory(json(result, 'Vitest result'), expected[step.id], inventory.sourceRoot));
    }
    if (TAP_IDS.includes(step.id)) {
      equal(check.subruns.map(subrun => subrun.file), expected[step.id], `TAP file inventory mismatch: ${step.id}`);
      const observed = { expectedFiles: [...expected[step.id]], discoveredFiles: [], testCount: 0, passedCount: 0, failedCount: 0, skippedCount: 0, testNames: [] };
      for (const [subIndex, subrun] of check.subruns.entries()) {
        assert(subrun.exitCode === 0 && Array.isArray(subrun.argv) && subrun.argv.at(-1) === subrun.file, `invalid TAP subrun: ${step.id}`);
        api.validateSourceArgv(step.id, subrun.argv);
        const bytes = add(subrun.result, `${reportDir}/results/${step.id}/${subIndex}.tap`, MAX_DOCUMENT, true);
        const stats = api.parseTap(bytes.toString('utf8'));
        assert(Number.isSafeInteger(stats.testCount) && stats.testCount > 0 && stats.passedCount === stats.testCount
          && stats.failedCount === 0 && stats.skippedCount === 0 && Array.isArray(stats.testNames), `invalid TAP result: ${step.id}`);
        observed.discoveredFiles.push(subrun.file);
        for (const key of ['testCount', 'passedCount', 'failedCount', 'skippedCount']) observed[key] += stats[key];
        observed.testNames.push(...stats.testNames);
      }
      checkSummary(inventory, observed);
    }
  }
  const planPath = `${reportDir}/candidate-plan.json`;
  const planBytes = add(report.candidatePlan, planPath, MAX_DOCUMENT, true);
  const plan = json(planBytes, 'candidate plan');
  assert(Array.isArray(report.archives) && report.archives.length > 0 && Array.isArray(plan.packages) && plan.packages.length > 0, 'candidate archives are missing');
  const archivePaths = report.archives.map(entry => entry.path);
  sortedUniqueStrings(archivePaths, 'candidate archive paths');
  equal([...plan.packages.map(pkg => pkg.tarball)].sort(), archivePaths, 'candidate archive inventory mismatch');
  for (const archive of report.archives) {
    assert(typeof archive.path === 'string' && archive.path.startsWith(`${reportDir}/candidate-tarballs/`), 'candidate archive outside pack directory');
    add(archive, null, MAX_ARCHIVE);
  }
  const candidate = api.verifyCandidate(sourceRoot, planPath, manifest);
  equal(candidate, { candidatePlan: report.candidatePlan, archives: report.archives }, 'candidate identity mismatch');
  return { report, reportRef: { path: reportPath, sha256: expectedReportSha256 }, sourceManifest, sourceInventory, candidate,
    buildProducts: report.buildProducts, buildProductsSha256: report.buildProductsSha256,
    retainedFiles: [...retained].map(([path, sha256]) => ({ path, sha256 })).sort((a, b) => a.path.localeCompare(b.path)) };
}

/** Publish only a completely verified handoff into an absent run directory. */
export function stageSourceBuildHandoff(options) {
  const verified = verifySourceBuildHandoff(options);
  const sourceRoot = realpathSync(options.root), destinationRoot = realpathSync(options.dest);
  const parentPath = 'tests/reports/native-capabilities', parent = resolve(destinationRoot, parentPath);
  let cursor = destinationRoot;
  for (const part of parentPath.split('/')) {
    cursor = resolve(cursor, part);
    try { mkdirSync(cursor); } catch (error) { if (error.code !== 'EEXIST') throw error; }
    const stat = lstatSync(cursor);
    assert(stat.isDirectory() && !stat.isSymbolicLink() && realpathSync(cursor) === cursor, 'unsafe destination parent');
  }
  const finalPath = resolve(parent, options.runId);
  const temporary = mkdtempSync(resolve(parent, `.${options.runId}-handoff-`));
  let claimed = false;
  try {
    const runPrefix = `${parentPath}/${options.runId}/`;
    for (const ref of verified.retainedFiles) {
      assert(ref.path.startsWith(runPrefix), 'invalid staged file path');
      const within = ref.path.slice(runPrefix.length), target = resolve(temporary, within);
      const rel = relative(temporary, target);
      assert(rel && rel !== '..' && !rel.startsWith(`..${sep}`), 'staged file escapes destination');
      mkdirSync(dirname(target), { recursive: true });
      const fd = openSync(target, constants.O_CREAT | constants.O_EXCL | constants.O_WRONLY | (constants.O_NOFOLLOW || 0), 0o600);
      let copied;
      const limit = ref.path === `${parentPath}/${options.runId}/source-build.json` ? MAX_BUILD_REPORT
        : ref.path.includes('/candidate-tarballs/') ? MAX_ARCHIVE : MAX_DOCUMENT;
      try { copied = consume(sourceRoot, ref.path, limit, false, fd); }
      finally { closeSync(fd); }
      assert(copied.sha256 === ref.sha256, `retained input changed during staging: ${ref.path}`);
    }
    // mkdir is the exclusive claim; rename can only replace this empty claim.
    mkdirSync(finalPath);
    claimed = true;
    renameSync(temporary, finalPath);
    claimed = false;
    return verified;
  } catch (error) {
    rmSync(temporary, { recursive: true, force: true });
    if (claimed) { try { rmdirSync(finalPath); } catch { /* Never remove another writer's files. */ } }
    throw error;
  }
}
