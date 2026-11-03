#!/usr/bin/env node
/** Closed external-codec acceptance: all offline proof precedes provisioning.
 * Package and archive validation does not establish semantic provenance of
 * arbitrary embedded code; the source gate must establish that separately.
 */
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { basename, dirname, isAbsolute, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { validateAcceptanceGate } from '../native-capability-gate/index.mjs';
import { assertIndependentNpmConsumer } from '../release/portable-npm-lock.mjs';
import { verifyArchiveAdmission } from '../release/archive-admission.mjs';
import { EXTERNAL_CODEC_TEST, EXTERNAL_CODEC_CONFIG, EXTERNAL_CODEC_POLICY } from './source-checks.mjs';
import { validateExternalCodecInputs, evaluateExternalCodecResults, validateExternalCodecInstalledProject,
  validateExternalCodecRunContext } from './external-codec-contract.mjs';
import { redactText } from './upload-artifacts.mjs';

// The run-scoped npm-inventory.json contains {schema, runId, gate,
// freezeCommit, sourceInputDigest, candidatePlan, archives:[{resolved,path}]}.
// Registry archives are retained offline under the same run's npm/ directory;
// candidate archives come from the gate-bound matrix project. No archive or
// fixture proof is synthesized or fetched by this launcher.
export const CODEC_NPM_INPUT_SCHEMA = 'aura3d.external-codec-npm-inputs/1';
const RUN_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const HASH = /^[a-f0-9]{64}$/;
const MAX_JSON = 32 * 1024 * 1024;
const MAX_ARCHIVE = 128 * 1024 * 1024;
const PROJECT = 'npm-react19-peer-present';
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const assert = (condition, message) => { if (!condition) throw new Error(`EXTERNAL_CODEC_UNAVAILABLE: ${message}`); };
const sameRef = (a, b) => a?.path === b?.path && a?.sha256 === b?.sha256;

function safePath(path) {
  assert(typeof path === 'string' && path.length > 0 && !isAbsolute(path) && !path.includes('\\') &&
    !/[\x00-\x1f\x7f]/.test(path) && path.split('/').every(part => part && part !== '.' && part !== '..'), 'unsafe input path');
  return path;
}

function readSafe(root, path, limit) {
  safePath(path);
  const base = realpathSync(root);
  let current = base;
  for (const part of path.split('/')) {
    current = resolve(current, part);
    assert(!lstatSync(current).isSymbolicLink(), 'symlink input is forbidden');
  }
  assert(current.startsWith(`${base}${sep}`), 'input escaped source root');
  const stat = lstatSync(current);
  assert(stat.isFile() && stat.size <= limit, 'input missing or exceeds its byte limit');
  return readFileSync(current);
}

function parse(bytes, label) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Error(`EXTERNAL_CODEC_UNAVAILABLE: malformed ${label}`); }
}

/** Gate and candidate binding for an independently retained npm archive set. */
export function validateCodecArchiveInventory(inventory, gate, gatePath, gateSha256, runId) {
  assert(RUN_ID.test(runId || '') && HASH.test(gateSha256 || '') && inventory?.schema === CODEC_NPM_INPUT_SCHEMA &&
    inventory.runId === runId && sameRef(inventory.gate, { path: gatePath, sha256: gateSha256 }) &&
    inventory.freezeCommit === gate.freezeCommit && inventory.sourceInputDigest === gate.sourceInputDigest &&
    sameRef(inventory.candidatePlan, gate.candidatePlan), 'npm archive inventory is not bound to the candidate');
  assert(Array.isArray(inventory.archives) && inventory.archives.length > 0 && inventory.archives.length <= 4096, 'npm archive inventory is incomplete');
  const urls = new Set(), paths = new Set();
  for (const item of inventory.archives) {
    assert(item && typeof item.resolved === 'string' && item.resolved.startsWith('https://registry.npmjs.org/') &&
      !urls.has(item.resolved) && !paths.has(item.path), 'ambiguous registry archive');
    safePath(item.path);
    assert(item.path.startsWith(`tests/reports/native-external-codec-inputs/${runId}/npm/`), 'npm archive is outside run-scoped inputs');
    urls.add(item.resolved); paths.add(item.path);
  }
  return inventory.archives;
}

/** This ordering is shared by the real launcher and source-only synthetic tests. */
export function runCodecPreflight({ validateGate, validateFixtures, validateArchives }) {
  const gate = validateGate();
  const fixtures = validateFixtures(gate);
  const archives = validateArchives(gate, fixtures);
  return { gate, fixtures, archives };
}

/** Forward only the review inventory retained by the already validated gate.
 * The admission verifier authenticates signatures, evidence and archive identity;
 * these transport checks do not themselves establish review provenance.
 */
export function admitCodecArchives({ root, gate, report, project, manifestBytes, lockBytes, snapshots, readBytes },
  verify = verifyArchiveAdmission) {
  assert(gate?.status === 'CODE_COMPLETE_GO' && RUN_ID.test(gate.runId || '') && Array.isArray(gate.inputs) &&
    gate.portableInputs && typeof readBytes === 'function' && typeof verify === 'function', 'validated candidate review inputs are unavailable');
  const portable = gate.portableInputs, prefix = `tests/reports/native-source-inputs/${gate.runId}/`;
  const inputRef = portable.inputs;
  assert(inputRef?.path === `${prefix}inputs.json` && HASH.test(inputRef.sha256 || '') && gate.inputs.includes(inputRef.path) &&
    sameRef(portable.sourceManifest, gate.sourceManifest) && sameRef(portable.candidatePlan, gate.candidatePlan),
  'portable candidate inputs do not match the gate');
  const envelopeBytes = readBytes(inputRef.path, MAX_JSON);
  assert(envelopeBytes instanceof Uint8Array && sha256(envelopeBytes) === inputRef.sha256, 'portable candidate input envelope changed');
  const envelope = parse(envelopeBytes, 'portable candidate input envelope');
  assert(envelope.schema === 'aura3d.native-portable-inputs/1' && envelope.runId === gate.runId &&
    sameRef(envelope.sourceManifest, gate.sourceManifest) && sameRef(envelope.candidatePlan, gate.candidatePlan) &&
    Array.isArray(envelope.files), 'portable candidate input envelope identity differs');
  const exactRef = ref => ref && typeof ref === 'object' && !Array.isArray(ref) && Object.keys(ref).sort().join(',') === 'path,sha256';
  const equalRefs = (left, right) => Array.isArray(left) && Array.isArray(right) && left.length === right.length &&
    left.every((ref, index) => exactRef(ref) && exactRef(right[index]) && sameRef(ref, right[index]));
  assert(report?.runId === gate.runId && project?.id === PROJECT &&
    equalRefs(portable.candidateReviews, envelope.candidateReviews) && equalRefs(portable.candidateReviewEvidence, envelope.candidateReviewEvidence) &&
    equalRefs(portable.candidateReviews, report.candidateReviews) && equalRefs(portable.candidateReviews, project.candidateReviews),
  'candidate review inventory differs from the gate');
  const files = new Map();
  for (const entry of envelope.files) {
    assert(entry && typeof entry.path === 'string' && !files.has(entry.path), 'candidate input file inventory is ambiguous');
    files.set(entry.path, entry);
  }
  let total = 0;
  for (const [key, folder] of [['candidateReviews', 'candidate-reviews'], ['candidateReviewEvidence', 'candidate-review-evidence']]) {
    const refs = portable[key];
    assert(Array.isArray(refs) && refs.length <= 10000, 'candidate review inventory is invalid');
    let previous = '';
    for (const ref of refs) {
      assert(ref && typeof ref === 'object' && !Array.isArray(ref) && Object.keys(ref).sort().join(',') === 'path,sha256' &&
        HASH.test(ref.sha256 || '') && typeof ref.path === 'string' && /^[A-Za-z0-9._/-]+$/.test(ref.path), 'candidate review reference is invalid');
      safePath(ref.path);
      const directory = `${prefix}${folder}/`;
      assert(ref.path.startsWith(directory) && ref.path.length > directory.length && (!previous || previous < ref.path) &&
        (key !== 'candidateReviews' || ref.path === `${directory}${ref.sha256}.json`) && gate.inputs.includes(ref.path),
      'candidate review reference is outside the gated run or missing');
      const entry = files.get(ref.path);
      assert(entry && entry.sha256 === ref.sha256 && Number.isSafeInteger(entry.size) &&
        entry.size > 0 && entry.size <= 64 * 1024 * 1024, 'candidate review file identity differs');
      total += entry.size;
      assert(total <= 512 * 1024 * 1024, 'candidate review input budget exceeded');
      const content = readBytes(ref.path, 64 * 1024 * 1024);
      assert(content instanceof Uint8Array && content.byteLength === entry.size && sha256(content) === ref.sha256,
        'candidate review file changed');
      previous = ref.path;
    }
  }
  return verify({ root, sourceManifestPath: gate.sourceManifest.path, planPath: gate.candidatePlan.path,
    manifestBytes, lockBytes, archives: snapshots, candidateReviews: portable.candidateReviews });
}

export function loadCodec(root, gatePath, lockPath, npmPath, runId) {
  safePath(gatePath); safePath(lockPath); safePath(npmPath);
  assert(RUN_ID.test(runId || '') && lockPath === `tests/reports/native-external-codec-inputs/${runId}/lock.json` &&
    npmPath === `tests/reports/native-external-codec-inputs/${runId}/npm-inventory.json`, 'fixed run-scoped codec inputs are required');
  let gateSha256, lockSha256, npmSha256, lock, registryArchives, manifest, packageLock, project, plan, candidatePackages, allArchives, admission;
  const preflight = runCodecPreflight({
    validateGate: () => {
      const gate = validateAcceptanceGate({ root, gatePath });
      gateSha256 = sha256(readSafe(root, gatePath, MAX_JSON));
      assert(process.env.A3D_RELEASE_PLAN === undefined || process.env.A3D_RELEASE_PLAN === gate.candidatePlan.path, 'release plan differs from gate');
      return gate;
    },
    validateFixtures: gate => {
      const lockBytes = readSafe(root, lockPath, MAX_JSON);
      lockSha256 = sha256(lockBytes); lock = parse(lockBytes, 'fixture lock');
      assert(lock.runId === runId, 'fixture lock run ID differs');
      const policyBytes = readSafe(root, EXTERNAL_CODEC_POLICY, MAX_JSON);
      assert(gate.deferredExternalCodecTests?.policy?.sha256 === sha256(policyBytes), 'codec policy differs from gate');
      return validateExternalCodecInputs({ policyBytes, gate, gatePath, gateSha256, lock,
        readBytes: (path, max) => readSafe(root, path, max) });
    },
    validateArchives: gate => {
      const inputBytes = readSafe(root, npmPath, MAX_JSON);
      npmSha256 = sha256(inputBytes);
      registryArchives = validateCodecArchiveInventory(parse(inputBytes, 'npm archive inventory'), gate, gatePath, gateSha256, runId);
      const reportBytes = readSafe(root, gate.matrixSourceReport.path, MAX_JSON);
      assert(gate.inputs.includes(gate.matrixSourceReport.path) && sha256(reportBytes) === gate.matrixSourceReport.sha256,
        'matrix report differs from the gate');
      const report = parse(reportBytes, 'matrix report');
      const matches = report.projects?.filter(item => item.id === PROJECT) || [];
      assert(matches.length === 1, 'candidate consumer project is unavailable');
      project = matches[0];
      assert(project.manager === 'npm' && project.lockfile === 'package-lock.json' && Array.isArray(project.installedPackages), 'unsupported matrix project');
      const manifestPath = `${safePath(project.path)}/package.json`, packageLockPath = `${project.path}/package-lock.json`;
      assert(gate.inputs.includes(manifestPath) && gate.inputs.includes(packageLockPath), 'candidate consumer inputs were not staged by the gate');
      const manifestBytes = readSafe(root, manifestPath, MAX_JSON), packageLockBytes = readSafe(root, packageLockPath, MAX_JSON);
      assert(sha256(manifestBytes) === project.manifestSha256 && sha256(packageLockBytes) === project.lockfileSha256, 'candidate consumer identity changed');
      manifest = parse(manifestBytes, 'consumer manifest'); packageLock = parse(packageLockBytes, 'consumer lock');
      const lockedPaths = Object.keys(packageLock.packages || {});
      for (const name of ['@aura3d/assets', 'draco3d', 'meshoptimizer']) {
        assert(lockedPaths.some(path => path === `node_modules/${name}` || path.endsWith(`/node_modules/${name}`)), `candidate codec dependency is missing: ${name}`);
      }
      plan = parse(readSafe(root, gate.candidatePlan.path, MAX_JSON), 'candidate plan');
      candidatePackages = project.installedPackages.map(pkg => {
        const expected = plan.packages?.find(entry => entry.name === pkg.name);
        assert(expected && JSON.stringify(expected) === JSON.stringify(pkg), 'candidate archive identity changed');
        const path = `${project.path}/tarballs/${basename(pkg.tarball)}`;
        assert(gate.inputs.includes(path), 'candidate archive was not staged by the gate');
        return { ...pkg, path };
      });
      const candidateArchives = new Map();
      for (const entry of Object.values(packageLock.packages || {})) {
        if (typeof entry?.resolved !== 'string' || !entry.resolved.startsWith('file:')) continue;
        const match = /^file:(?:\.\/)?tarballs\/([^/]+\.tgz)$/.exec(entry.resolved);
        const candidate = match && candidatePackages.filter(pkg => basename(pkg.tarball) === match[1]);
        assert(candidate?.length === 1, 'unrecognized local package archive');
        candidateArchives.set(entry.resolved, { resolved: entry.resolved, path: candidate[0].path });
      }
      allArchives = [...registryArchives, ...candidateArchives.values()];
      let totalBytes = 0;
      const snapshots = allArchives.map(item => {
        const bytes = readSafe(root, item.path, 64 * 1024 * 1024);
        totalBytes += bytes.length;
        assert(totalBytes <= 256 * 1024 * 1024, 'offline npm archive set exceeds its byte limit');
        return { resolved: item.resolved, bytes };
      });
      const verified = admitCodecArchives({ root, gate, report, project, manifestBytes, lockBytes: packageLockBytes, snapshots,
        readBytes: (path, max) => readSafe(root, path, max) });
      admission = { capability: verified.capability, manifestBytes, lockBytes: packageLockBytes };
      return assertIndependentNpmConsumer({ manifest, lock: packageLock, archives: allArchives, candidatePackages, admission,
        readArchive: (path, max = MAX_ARCHIVE) => readSafe(root, path, Math.min(max, MAX_ARCHIVE)) });
    }
  });
  return { ...preflight, gateSha256, lockSha256, npmSha256, registryArchives, allArchives, manifest, packageLock, candidatePackages, project, plan, admission,
    inputPaths: [...new Set([lockPath, npmPath, ...preflight.fixtures.inputPaths, ...registryArchives.map(item => item.path)])].sort() };
}

function parseArgs(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    assert(['--phase', '--gate', '--lock', '--npm-inputs', '--run-id', '--list-inputs'].includes(key) && options[key] === undefined, 'invalid launcher argument');
    if (key === '--list-inputs') options[key] = true;
    else { assert(args[index + 1] && !args[index + 1].startsWith('--'), `missing ${key}`); options[key] = args[++index]; }
  }
  assert(['preflight', 'execute'].includes(options['--phase']) && options['--gate'] && options['--lock'] && options['--npm-inputs'] &&
    RUN_ID.test(options['--run-id'] || '') && (!options['--list-inputs'] || options['--phase'] === 'preflight'), 'missing launcher inputs');
  return options;
}

function cleanEnv() {
  const allowed = new Set(['PATH', 'TMPDIR', 'LANG', 'LC_ALL', 'TZ', 'CI', 'SYSTEMROOT', 'WINDIR']);
  return Object.fromEntries(Object.entries(process.env).filter(([key]) => allowed.has(key)));
}

/** Check Node's whole ancestor resolution chain before allocating a consumer. */
export function assertCleanCodecTemporaryParent(parent, root, pathExists = existsSync) {
  assert(typeof parent === 'string' && isAbsolute(parent) && parent === resolve(parent) && typeof root === 'string' &&
    isAbsolute(root) && parent !== root && !parent.startsWith(`${root}${sep}`), 'temporary parent is not isolated');
  for (let current = parent; ; current = dirname(current)) {
    assert(!pathExists(resolve(current, 'node_modules')), 'temporary parent can resolve an external node_modules');
    if (dirname(current) === current) break;
  }
  return parent;
}

function createCleanTemporaryDirectory(root) {
  const candidates = [...new Set([tmpdir(), '/var/tmp', '/private/var/tmp'])];
  for (const candidate of candidates) {
    try {
      const parent = realpathSync(candidate);
      assert(lstatSync(parent).isDirectory(), 'temporary parent is not a directory');
      assertCleanCodecTemporaryParent(parent, realpathSync(root));
      return mkdtempSync(resolve(parent, 'aura3d-codec-'));
    } catch { /* Try the next fixed temporary parent; never use a tainted one. */ }
  }
  throw new Error('EXTERNAL_CODEC_UNAVAILABLE: no clean isolated temporary parent');
}

async function main(args) {
  assert(process.env.AURA3D_SOURCE_PROCESS_GUARD !== '1', 'acceptance is forbidden during source work');
  const options = parseArgs(args), root = process.cwd(), gatePath = options['--gate'], lockPath = options['--lock'],
    npmPath = options['--npm-inputs'], runId = options['--run-id'];
  const inputs = loadCodec(root, gatePath, lockPath, npmPath, runId);
  if (options['--phase'] === 'preflight') {
    process.stdout.write(options['--list-inputs'] ? `${JSON.stringify(inputs.inputPaths)}\n` : 'external codec offline inputs validated\n');
    return 0;
  }
  const base = resolve(root, 'tests/reports/native-external-codec-acceptance');
  mkdirSync(base, { recursive: true });
  assert(realpathSync(base) === base, 'unsafe output directory');
  const out = resolve(base, runId); mkdirSync(out, { recursive: false });
  let temporary;
  try {
    temporary = createCleanTemporaryDirectory(root);
    const consumer = resolve(temporary, 'consumer');
    // Revalidate every proof immediately before the only restore subprocess.
    const current = loadCodec(root, gatePath, lockPath, npmPath, runId);
    assert(current.gateSha256 === inputs.gateSha256 && current.lockSha256 === inputs.lockSha256 && current.npmSha256 === inputs.npmSha256, 'codec inputs changed');
    const script = `import {validateSourceMatrixReport,validateGateMatchesSource,restoreMatrixProject} from './tools/native-consumer-matrix/index.ts';
      import {validateAcceptanceGate} from './tools/native-capability-gate/index.mjs';
      const [gatePath,reportPath,out]=process.argv.slice(1); const gate=validateAcceptanceGate({gatePath,sourceReport:reportPath});
      const report=validateSourceMatrixReport(process.cwd(),reportPath); validateGateMatchesSource(gate,report);
      await restoreMatrixProject(process.cwd(),report,'${PROJECT}',out);`;
    const env = { ...cleanEnv(), npm_config_offline: 'true', npm_config_ignore_scripts: 'true',
      npm_config_userconfig: '/dev/null', npm_config_globalconfig: '/dev/null' };
    const restore = spawnSync(process.execPath, ['--import', 'tsx', '--input-type=module', '-e', script, gatePath,
      inputs.gate.matrixSourceReport.path, consumer], { cwd: root, env, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 900000 });
    assert(restore.status === 0 && !restore.error, 'verified offline candidate restore failed');
    const consumerRealpath = realpathSync(consumer);
    const installed = validateExternalCodecInstalledProject({ root, projectPath: consumerRealpath, project: inputs.project,
      packageLock: inputs.packageLock, archives: inputs.allArchives,
      readArchive: (path, max = MAX_ARCHIVE) => readSafe(root, path, Math.min(max, MAX_ARCHIVE)) });
    const contextPath = `tests/reports/native-external-codec-acceptance/${runId}/candidate-context.json`;
    const context = { schema: 'aura3d.external-codec-candidate-context/1', runId,
      gate: { path: gatePath, sha256: inputs.gateSha256 }, freezeCommit: inputs.gate.freezeCommit,
      sourceInputDigest: inputs.gate.sourceInputDigest, candidatePlan: inputs.gate.candidatePlan,
      fixtureLock: { path: lockPath, sha256: inputs.lockSha256 }, npmInventory: { path: npmPath, sha256: inputs.npmSha256 },
      matrixProject: PROJECT, projectRealpath: installed.projectRealpath, installedTreeSha256: installed.installedTreeSha256 };
    validateExternalCodecRunContext({ context, runId, gate: inputs.gate, gatePath, gateSha256: inputs.gateSha256,
      lockPath, lockSha256: inputs.lockSha256, npmPath, npmSha256: inputs.npmSha256, ...installed });
    writeFileSync(resolve(root, contextPath), `${JSON.stringify(context, null, 2)}\n`, { flag: 'wx' });
    const output = resolve(out, 'vitest.json');
    const testEnv = { ...cleanEnv(), AURA3D_CODE_COMPLETE_GATE: gatePath, A3D_RELEASE_PLAN: inputs.gate.candidatePlan.path,
      AURA3D_EXTERNAL_CODEC_LOCK: lockPath, AURA3D_EXTERNAL_CODEC_NPM_INPUTS: npmPath, AURA3D_EXTERNAL_CODEC_CONTEXT: contextPath,
      AURA3D_EXTERNAL_CODEC_PROJECT: consumerRealpath, AURA3D_RUN_ID: runId, AURA3D_RUN_NETWORK_ASSET_TESTS: '1' };
    const result = spawnSync(process.execPath, [resolve(root, 'node_modules/vitest/vitest.mjs'), 'run', EXTERNAL_CODEC_TEST,
      '--config', EXTERNAL_CODEC_CONFIG, '--maxWorkers=1', '--minWorkers=1', '--reporter=json', `--outputFile=${output}`],
    { cwd: root, env: testEnv, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024, timeout: 900000 });
    writeFileSync(resolve(out, 'vitest.log'), redactText(`${result.stdout || ''}\n${result.stderr || ''}`), { flag: 'wx' });
    let inventory = { status: 'not-run', reason: 'Vitest did not produce a valid codec result' };
    try { inventory = evaluateExternalCodecResults(parse(readFileSync(output), 'Vitest result'), root); } catch { /* Missing output is not a pass. */ }
    let identity = 'valid';
    try { const after = loadCodec(root, gatePath, lockPath, npmPath, runId);
      assert(after.gateSha256 === inputs.gateSha256 && after.lockSha256 === inputs.lockSha256 && after.npmSha256 === inputs.npmSha256, 'inputs changed');
      const installedAfter = validateExternalCodecInstalledProject({ root, projectPath: consumerRealpath, project: after.project,
        packageLock: after.packageLock, archives: after.allArchives,
        readArchive: (path, max = MAX_ARCHIVE) => readSafe(root, path, Math.min(max, MAX_ARCHIVE)) });
      assert(installedAfter.projectRealpath === installed.projectRealpath && installedAfter.installedTreeSha256 === installed.installedTreeSha256,
        'installed candidate changed during execution');
    } catch { identity = 'changed'; }
    const passed = result.status === 0 && !result.error && inventory.status === 'passed' && identity === 'valid';
    const summary = { schema: 'aura3d.external-codec-run/1', runId, status: passed ? 'passed' : inventory.status === 'not-run' ? 'not-run' : 'failed',
      gateSha256: inputs.gateSha256, freezeCommit: inputs.gate.freezeCommit, sourceInputDigest: inputs.gate.sourceInputDigest,
      candidatePlan: inputs.gate.candidatePlan, fixtureLockSha256: inputs.lockSha256, npmInventorySha256: inputs.npmSha256,
      execution: 'installed-candidate', currentCandidateBrowserReceipt: false, testExit: Number.isInteger(result.status) ? result.status : null, identity, inventory };
    writeFileSync(resolve(out, 'run-manifest.json'), `${JSON.stringify(summary, null, 2)}\n`, { flag: 'wx' });
    process.stdout.write(`EXTERNAL_CODEC_EXIT=${passed ? 0 : 1}\n`);
    return passed ? 0 : 1;
  } catch (error) {
    const summary = { schema: 'aura3d.external-codec-run/1', runId, status: 'not-run',
      gateSha256: inputs.gateSha256, freezeCommit: inputs.gate.freezeCommit, sourceInputDigest: inputs.gate.sourceInputDigest,
      candidatePlan: inputs.gate.candidatePlan, fixtureLockSha256: inputs.lockSha256, npmInventorySha256: inputs.npmSha256,
      execution: 'installed-candidate', currentCandidateBrowserReceipt: false, testExit: null, reason: 'offline preparation or candidate restore failed' };
    writeFileSync(resolve(out, 'run-manifest.json'), `${JSON.stringify(summary, null, 2)}\n`, { flag: 'wx' });
    console.error(redactText(String(error?.message || error)));
    process.stdout.write('EXTERNAL_CODEC_EXIT=1\n');
    return 1;
  } finally { if (temporary) rmSync(temporary, { recursive: true, force: true }); }
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main(process.argv.slice(2)).then(code => { process.exitCode = code; }).catch(error => {
    console.error(`external-codec-run: ${error.message}`); process.exitCode = 2;
  });
}
