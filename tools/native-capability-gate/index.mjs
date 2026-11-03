#!/usr/bin/env node
/** The single Phase A -> Phase B boundary. No browser or provider is started here. */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync, writeFileSync, mkdirSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isSourceInput } from '../release/source-identity.mjs';
import { inspectNpmArchive } from '../release/portable-npm-lock.mjs';
import { verifyArchiveAdmissionBatch, verifyPnpmArchiveAdmissionBatch } from '../release/archive-admission.mjs';
import { verifySourceBuildHandoff, verifySupplementalEvidence } from '../remote-acr/source-resume.mjs';
import { verifyPortableInputs } from '../remote-acr/portable-inputs.mjs';
import { ARCHIVE_ADMISSION_FILES, ARCHIVE_ADMISSION_TESTS, EXTERNAL_CODEC_CONTRACT_TEST, EXTERNAL_CODEC_LAUNCHER_TEST, EXTERNAL_CODEC_SOURCE_TEST, HISTORICAL_ACCEPTANCE_INVENTORY, HISTORICAL_LAUNCHER, HISTORICAL_LAUNCHER_TEST, HISTORICAL_REPLAY_SOURCE_TEST, HISTORICAL_SOURCE_TEST, assertPassingPhaseReport, buildSteps, expectedExternalCodecAcceptance, expectedHistoricalAcceptance, expectedHistoricalReplay, nativeSourceInventoryForManifest, sourceTestFileCoverage, parseTap, parseVitestInventory, sourceHandoffApi, validateSourceArgv } from '../remote-acr/source-checks.mjs';
import { redactText } from '../remote-acr/upload-artifacts.mjs';

const SHA = /^[a-f0-9]{64}$/;
const fail = message => { throw new Error(`native capability gate: ${message}`); };
const sha256 = data => createHash('sha256').update(data).digest('hex');
const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value)
  : Array.isArray(value) ? `[${value.map(canonical).join(',')}]`
    : `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`;
const nonempty = (v, name) => { if (typeof v !== 'string' || !v.trim()) fail(`${name} is missing`); return v; };
const array = (v, name) => { if (!Array.isArray(v) || !v.length) fail(`${name} is empty or missing`); return v; };
const digest = (v, name) => { if (typeof v !== 'string' || !SHA.test(v)) fail(`${name} is not a SHA-256`); return v; };
function equalSet(left, right, name) {
  array(left, `${name} left`); array(right, `${name} right`);
  if (left.some(x => typeof x !== 'string' || !x) || right.some(x => typeof x !== 'string' || !x)
      || new Set(left).size !== left.length || new Set(right).size !== right.length
      || left.length !== right.length || left.some(x => !right.includes(x))) fail(`${name} differ or contain duplicates`);
}
function safePath(root, path) {
  if (typeof path !== 'string' || !path || isAbsolute(path) || path.includes('\\')
      || path.split('/').some(part => !part || part === '.' || part === '..' || part === '.git')) fail(`unsafe relative path: ${path}`);
  const absolute = resolve(root, path);
  if (!absolute.startsWith(`${resolve(root)}${sep}`)) fail(`path escapes root: ${path}`);
  return absolute;
}
function bytes(root, path) {
  const absolute = safePath(root, path);
  const real = realpathSync(absolute);
  if (!real.startsWith(`${realpathSync(root)}${sep}`)) fail(`file resolves outside root: ${path}`);
  if (!lstatSync(absolute).isFile()) fail(`expected regular file: ${path}`);
  return readFileSync(absolute);
}
function readJson(root, path) {
  try { return JSON.parse(bytes(root, path).toString('utf8')); }
  catch (error) { fail(`cannot read JSON ${path}: ${error.message}`); }
}
function checkedFile(root, reference, label) {
  if (!reference || typeof reference !== 'object') fail(`${label} reference missing`);
  const path = nonempty(reference.path, `${label} path`);
  const actual = sha256(bytes(root, path));
  if (actual !== digest(reference.sha256, `${label} digest`)) fail(`${label} hash mismatch: ${path}`);
  return path;
}
function asRef(root, path) { return { path, sha256: sha256(bytes(root, path)) }; }
function sourceBytes(root, entry) {
  const path = safePath(root, entry.path);
  const stat = lstatSync(path);
  if (stat.isSymbolicLink()) {
    if (entry.type !== 'symlink' || entry.mode !== '120000') fail(`wrong symlink type/mode: ${entry.path}`);
    const target = readlinkSync(path);
    if (isAbsolute(target) || !resolve(dirname(path), target).startsWith(`${resolve(root)}${sep}`)) fail(`unsafe symlink: ${entry.path}`);
    return Buffer.from(target);
  }
  if (!stat.isFile() || entry.type !== 'file' || entry.mode !== (stat.mode & 0o111 ? '100755' : '100644')) fail(`wrong file type/mode: ${entry.path}`);
  return readFileSync(path);
}
function manifestInputs(root, manifest) {
  if (manifest.schema !== 'aura3d.native-source-manifest/1') fail('unsupported source manifest');
  const entries = array(manifest.files, 'manifest files');
  const paths = entries.map(entry => entry.path);
  if (new Set(paths).size !== paths.length || paths.some((p, i) => !isSourceInput(p) || (i && paths[i - 1] >= p))) fail('source manifest paths are invalid, duplicate or unsorted');
  // Use the same path/byte fingerprint that the staged release-plan producer
  // records. The manifest digest alone does not authenticate a separately
  // supplied plan fingerprint used by the source-consumer report.
  const fingerprint = createHash('sha256');
  for (const entry of entries) {
    const data = sourceBytes(root, entry);
    if (sha256(data) !== digest(entry.sha256, `source ${entry.path}`)) fail(`source file changed: ${entry.path}`);
    fingerprint.update(entry.path).update('\0').update(entry.type === 'symlink' ? `<symlink:${data.toString('utf8')}>` : data).update('\0');
  }
  if (sha256(canonical(entries)) !== digest(manifest.inputDigest, 'source input digest')) fail('source input digest mismatch');
  const lock = entries.find(entry => entry.path === 'pnpm-lock.yaml');
  if (!lock || lock.sha256 !== digest(manifest.lockfileSha256, 'lockfile digest')) fail('lockfile is absent or mismatched');
  nonempty(manifest.origin?.commit, 'tested origin commit');
  nonempty(manifest.origin?.tree, 'tested origin tree');
  return { paths, fingerprint: fingerprint.digest('hex') };
}
function git(root, ...args) { return execFileSync('git', args, { cwd: root, maxBuffer: 256 * 1024 * 1024 }); }
function gitObjectHash(format, type, data) { return createHash(format).update(`${type} ${data.length}\0`).update(data).digest('hex'); }
function parseTree(data, format) {
  const size = format === 'sha1' ? 20 : 32;
  const entries = [];
  for (let offset = 0; offset < data.length;) {
    const space = data.indexOf(0x20, offset), nul = data.indexOf(0, space + 1);
    if (space < 0 || nul < 0 || nul + 1 + size > data.length) fail('invalid git tree proof');
    const mode = data.subarray(offset, space).toString('ascii');
    const name = data.subarray(space + 1, nul).toString('utf8');
    if (!name || name === '.' || name === '..' || name.includes('/') || name.includes('\uFFFD')) fail('invalid git tree entry');
    entries.push({ mode, name, oid: data.subarray(nul + 1, nul + 1 + size).toString('hex') });
    offset = nul + 1 + size;
  }
  if (new Set(entries.map(e => e.name)).size !== entries.length) fail('duplicate git tree entry');
  return entries;
}
function createCommitProof(root, freezeCommit) {
  const format = git(root, 'rev-parse', '--show-object-format').toString().trim();
  if (!['sha1', 'sha256'].includes(format)) fail('unsupported git object format');
  const commit = git(root, 'rev-parse', '--verify', `${freezeCommit}^{commit}`).toString().trim();
  if (freezeCommit !== commit || git(root, 'rev-parse', 'HEAD').toString().trim() !== commit) fail('freeze must be the full current HEAD commit');
  const commitBytes = git(root, 'cat-file', 'commit', commit);
  const tree = /^tree ([a-f0-9]+)$/m.exec(commitBytes.toString('utf8'))?.[1];
  if (!tree) fail('freeze commit has no tree');
  const objects = [];
  const visit = oid => {
    if (objects.some(x => x.oid === oid)) return;
    const data = git(root, 'cat-file', 'tree', oid);
    objects.push({ oid, data: data.toString('base64') });
    for (const entry of parseTree(data, format)) if (entry.mode === '40000' || entry.mode === '040000') visit(entry.oid);
  };
  visit(tree);
  return { format, commit, tree, commitObject: commitBytes.toString('base64'), treeObjects: objects };
}
function verifyCommitProof(root, proof, manifest) {
  if (!proof || !['sha1', 'sha256'].includes(proof.format)) fail('missing commit proof');
  const commitBytes = Buffer.from(nonempty(proof.commitObject, 'commit proof'), 'base64');
  if (gitObjectHash(proof.format, 'commit', commitBytes) !== proof.commit) fail('commit proof hash mismatch');
  const tree = /^tree ([a-f0-9]+)$/m.exec(commitBytes.toString('utf8'))?.[1];
  if (!tree || tree !== proof.tree) fail('commit tree mismatch');
  const objects = new Map();
  for (const item of array(proof.treeObjects, 'commit tree objects')) {
    const data = Buffer.from(nonempty(item.data, 'tree object'), 'base64');
    if (gitObjectHash(proof.format, 'tree', data) !== item.oid || objects.has(item.oid)) fail('tree object hash mismatch or duplicate');
    objects.set(item.oid, data);
  }
  const source = new Map(manifest.files.map(entry => [entry.path, entry]));
  const visited = new Set(), actual = [];
  const visit = (oid, prefix) => {
    const data = objects.get(oid);
    if (!data) fail(`missing tree proof ${oid}`);
    visited.add(oid);
    for (const entry of parseTree(data, proof.format)) {
      const path = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.mode === '40000' || entry.mode === '040000') { visit(entry.oid, path); continue; }
      if (!isSourceInput(path)) continue;
      const expected = source.get(path);
      if (!expected || !['100644', '100755', '120000'].includes(entry.mode) || expected.mode !== entry.mode) fail(`unlisted or incompatible committed source: ${path}`);
      if (gitObjectHash(proof.format, 'blob', sourceBytes(root, expected)) !== entry.oid) fail(`source differs from freeze commit: ${path}`);
      actual.push(path);
    }
  };
  visit(tree, '');
  if (visited.size !== objects.size) fail('unreferenced tree object in proof');
  equalSet([...source.keys()], actual, 'committed source inventory');
}
function roadmapRequirements(markdown) {
  const needed = new Set();
  let section = '';
  for (const line of markdown.split(/\r?\n/)) {
    const heading = /^## (\d+)\./.exec(line); if (heading) section = heading[1];
    const gap = /^\|\s*(G\d+)\s*\|/.exec(line); if (gap) needed.add(`gap:${gap[1]}`);
    const file = /^\|\s*(?:CREATE|MODIFY|DELETE)\s*\|\s*([^|]+?)\s*\|/.exec(line);
    if (section === '4' && file) needed.add(`file:${file[1].trim()}`);
    const task = /^- \[[ xX]\] (.+)$/.exec(line);
    if (task && ['5', '6', '7', '8'].includes(section)) {
      const kind = section === '5' ? 'task' : section === '6' ? 'checklist' : 'phase';
      needed.add(`${kind}:sha256:${sha256(task[1].trim())}`);
    }
  }
  if (!needed.size || ![...needed].some(x => x.startsWith('gap:')) || ![...needed].some(x => x.startsWith('task:'))) fail('roadmap requirement inventory is empty');
  return needed;
}
function verifyLedger(root, ledger, reports) {
  if (ledger.schema !== 'aura3d.native-capability-ledger/1') fail('unsupported ledger');
  const road = checkedFile(root, ledger.roadmap, 'roadmap');
  const required = array(ledger.requiredSourceOutcomeIds, 'required outcome IDs');
  const outcomes = array(ledger.outcomes, 'outcomes');
  equalSet(required, outcomes.map(x => x.id), 'ledger required/outcome IDs');
  equalSet(required, reports.completedOutcomeIds, 'required/completed outcomes');
  const refs = new Set();
  const requiredWps = new Set([...bytes(root, road).toString('utf8').matchAll(/^### (WP-\d+) —/gm)].map(m => m[1]));
  const seenWps = new Set();
  for (const row of outcomes) {
    if (row.required !== true || !/^WP-\d+$/.test(row.owner || '') || !requiredWps.has(row.owner)
      || !row.description?.trim() || row.source?.status !== 'implemented' || row.source?.completion !== 'complete') fail(`unowned or incomplete outcome ${row.id}`);
    seenWps.add(row.owner);
    for (const ref of array(row.references, `references ${row.id}`)) refs.add(`${ref.kind}:${ref.locator}`);
    if (!Array.isArray(row.implementation?.files) || !row.implementation.files.length || !Array.isArray(row.implementation?.symbols) || !row.implementation.symbols.length
      || !Array.isArray(row.implementation?.publicEntrypoints) || !row.implementation.publicEntrypoints.length) fail(`missing implementation details ${row.id}`);
    for (const file of row.implementation.files) { safePath(root, file.path); if (!['CREATE', 'MODIFY', 'DELETE'].includes(file.action)) fail(`invalid file action ${row.id}`); }
    for (const check of array(row.source.checks, `checks ${row.id}`)) {
      const result = reports.checks.find(x => x.id === check.id);
      if (!result || check.status !== 'passed' || check.runId !== reports.runId || !check.command || !check.artifactHashes || !check.measuredResults) fail(`unverified source check ${row.id}`);
    }
    for (const evidence of array(row.source.evidence, `evidence ${row.id}`)) {
      if (!evidence.id || !evidence.kind || !evidence.source || evidence.runId !== reports.runId || !evidence.artifactHashes || !evidence.measuredResults) fail(`unverified evidence ${row.id}`);
    }
    if (!Array.isArray(row.source.provenance) || !row.source.provenance.length) fail(`missing provenance ${row.id}`);
    if (!row.acceptance || row.acceptance.status !== 'not-run') fail(`acceptance was used for source completion ${row.id}`);
  }
  equalSet([...requiredWps], [...seenWps], 'roadmap work packages');
  for (const ref of roadmapRequirements(bytes(root, road).toString('utf8'))) if (!refs.has(ref)) fail(`unrepresented roadmap requirement ${ref}`);
  return { required, snapshotSha256: sha256(canonical(outcomes)) };
}
// The source job may have run in a different filesystem root. Its recorded root
// is used only to interpret the paths inside the retained Vitest JSON, never to
// read files on this machine.
export function verifyVitestInventory(root, inventory, expectedFiles) {
  if (typeof inventory.sourceRoot !== 'string' || !isAbsolute(inventory.sourceRoot) || inventory.sourceRoot.includes('\0')) fail(`missing Vitest source root: ${inventory.checkId}`);
  const path = checkedFile(root, inventory.result, `Vitest result ${inventory.checkId}`);
  const observed = parseVitestInventory(readJson(root, path), expectedFiles, inventory.sourceRoot);
  for (const key of ['expectedFiles', 'discoveredFiles', 'testCount', 'passedCount', 'failedCount', 'skippedCount', 'testNames']) {
    if (canonical(inventory[key]) !== canonical(observed[key])) fail(`Vitest result summary mismatch for ${inventory.checkId}: ${key}`);
  }
  return path;
}
export function verifyTapInventory(root, inventory, check, expectedFiles, runId) {
  const id = inventory.checkId;
  if (!['packages', 'packages-dist', 'node-release'].includes(id) || check?.id !== id) fail(`invalid TAP check: ${id}`);
  const subruns = array(check.subruns, `TAP subruns ${id}`);
  equalSet(expectedFiles, subruns.map(s => s.file), `TAP subrun files ${id}`);
  const paths = [], discoveredFiles = [], testNames = [];
  const count = { testCount: 0, passedCount: 0, failedCount: 0, skippedCount: 0 };
  for (const [index, subrun] of subruns.entries()) {
    if (subrun.exitCode !== 0) fail(`TAP subrun exit missing or failed: ${subrun.file}`);
    try { validateSourceArgv(id, subrun.argv); } catch (error) { fail(`invalid TAP subrun command ${subrun.file}: ${error.message}`); }
    if (subrun.argv.at(-1) !== subrun.file) fail(`TAP subrun command selects a different file: ${subrun.file}`);
    if (subrun.result?.path !== `tests/reports/native-capabilities/${runId}/results/${id}/${index}.tap`) fail(`unexpected TAP result path: ${subrun.file}`);
    const path = checkedFile(root, subrun.result, `TAP result ${subrun.file}`);
    const stats = parseTap(bytes(root, path).toString('utf8'));
    for (const key of Object.keys(count)) count[key] += stats[key];
    discoveredFiles.push(subrun.file); testNames.push(...stats.testNames); paths.push(path);
  }
  const observed = { expectedFiles: [...expectedFiles].sort(), discoveredFiles, ...count, testNames };
  for (const key of ['expectedFiles', 'discoveredFiles', 'testCount', 'passedCount', 'failedCount', 'skippedCount', 'testNames']) {
    if (canonical(inventory[key]) !== canonical(observed[key])) fail(`TAP result summary mismatch for ${id}: ${key}`);
  }
  return paths;
}
// Matches the source matrix producer's portable project fingerprint. Retained
// dependency trees, links and empty directories are refused because the
// acceptance staging contract copies only portable regular files.
function portableMatrixProject(root, projectPath) {
  const absolute = safePath(root, projectPath), stat = lstatSync(absolute);
  const expectedReal = resolve(realpathSync(root), relative(resolve(root), absolute));
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(absolute) !== expectedReal) fail(`unsafe matrix project: ${projectPath}`);
  const digest = createHash('sha256'), files = [];
  const visit = (dir, prefix = '') => {
    const names = readdirSync(dir).sort();
    if (!names.length) fail(`empty matrix project directory cannot be staged: ${projectPath}${prefix ? `/${prefix}` : ''}`);
    for (const entry of names) {
      const name = prefix ? `${prefix}/${entry}` : entry;
      assertExamplePart(entry);
      if (/[\x00-\x1f\x7f]/.test(name)) fail(`unsafe matrix project path: ${projectPath}`);
      if (['node_modules', 'coverage', 'test-results', 'playwright-report'].includes(entry.toLowerCase()) || name === 'tests/reports') fail(`excluded tree in matrix project: ${projectPath}/${name}`);
      const path = `${projectPath}/${name}`, full = safePath(root, path), item = lstatSync(full);
      if (item.isSymbolicLink()) fail(`matrix project symlink cannot be staged: ${path}`);
      digest.update(name).update('\0');
      if (item.isDirectory()) { digest.update('directory\0'); visit(full, name); }
      else if (item.isFile()) { digest.update('file\0').update(readFileSync(full)); files.push(path); }
      else fail(`unsupported matrix project entry: ${path}`);
      digest.update('\0');
    }
  };
  visit(absolute);
  return { sha256: digest.digest('hex'), files };
}
function verifyRetainedMatrix(root, reports, manifestRef, plan, matrix, candidateReviews, admissionGraphs, pnpmAdmissionGraphs) {
  const cells = ['npm', 'pnpm'].flatMap(manager => [18, 19].flatMap(reactMajor => ['absent', 'present'].map(peer => ({
    id: `${manager}-react${reactMajor}-peer-${peer}`, manager, reactMajor, peer
  }))));
  const checkIds = ['install', 'installed-identity', 'javascript-esm', 'condition-node', 'condition-browser', 'typescript-nodenext', 'typescript-bundler', 'react-ssr', 'optional-peer', 'browser-build'];
  const browsers = ['chromium', 'firefox', 'webkit'];
  if (matrix.candidate?.version !== plan.version || canonical(matrix.candidate?.packages) !== canonical(plan.packages)
      || canonical(matrix.source?.manifest) !== canonical(manifestRef)) fail('matrix retained candidate mismatch');
  if (!Array.isArray(matrix.projects) || matrix.projects.length !== cells.length || !Array.isArray(matrix.checks)
      || matrix.checks.length !== cells.length * checkIds.length || !Array.isArray(matrix.browser)
      || matrix.browser.some(row => row?.status !== 'not-run')) fail('matrix retained inventory is incomplete');
  equalSet(cells.map(cell => cell.id), matrix.projects.map(project => project?.id), 'matrix projects');
  equalSet(cells.flatMap(cell => browsers.map(browser => `${cell.id}/${browser}`)), matrix.browser.map(row => row?.id), 'matrix browser inventory');
  const used = [], snapshots = new Map();
  let archiveByteCount = 0;
  for (const cell of cells) {
    const project = matrix.projects.find(item => item.id === cell.id);
    const projectPath = `tests/reports/native-consumer-matrix/${reports.runId}/projects/${cell.id}`;
    const lockfile = cell.manager === 'npm' ? 'package-lock.json' : 'pnpm-lock.yaml';
    if (project.path !== projectPath || project.manager !== cell.manager || project.reactMajor !== cell.reactMajor
        || project.peer !== cell.peer || project.lockfile !== lockfile || project.retention !== 'portable-v1'
        || canonical(project.candidateReviews) !== canonical(candidateReviews)
        || canonical(project.sourceManifest) !== canonical(manifestRef)) fail(`matrix project identity mismatch: ${cell.id}`);
    const portable = portableMatrixProject(root, projectPath);
    if (portable.sha256 !== digest(project.projectSha256, `matrix project ${cell.id} digest`)) fail(`matrix project changed: ${cell.id}`);
    const files = portable.files.map(path => { const data = bytes(root, path); return { path: path.slice(projectPath.length + 1), size: data.byteLength, sha256: sha256(data) }; })
      .sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
    if (canonical(files) !== canonical(project.files)) fail(`matrix project file inventory mismatch: ${cell.id}`);
    used.push(...portable.files);
    checkedFile(root, { path: `${projectPath}/package.json`, sha256: project.manifestSha256 }, `matrix ${cell.id} manifest`);
    checkedFile(root, { path: `${projectPath}/${lockfile}`, sha256: project.lockfileSha256 }, `matrix ${cell.id} lockfile`);
    const pending = ['@aura3d/engine', '@aura3d/react', '@aura3d/assets', '@aura3d/input', '@aura3d/controls', ...(cell.peer === 'present' ? ['@aura3d/navigation-recast'] : [])];
    const required = new Set();
    while (pending.length) {
      const name = pending.shift();
      if (required.has(name)) continue;
      const candidate = plan.packages.find(pkg => pkg.name === name);
      if (!candidate || (candidate.internalDependencies !== undefined && !Array.isArray(candidate.internalDependencies))) fail(`matrix candidate package missing: ${name}`);
      required.add(name); pending.push(...(candidate.internalDependencies || []));
    }
    const installed = array(project.installedPackages, `matrix ${cell.id} installed packages`);
    equalSet([...required], installed.map(pkg => pkg?.name), `matrix ${cell.id} candidate packages`);
    if (new Set(installed.map(pkg => basename(pkg.tarball || ''))).size !== installed.length) fail(`matrix archive filenames collide: ${cell.id}`);
    for (const pkg of installed) {
      const candidate = plan.packages.find(item => item.name === pkg.name);
      if (canonical(pkg) !== canonical(candidate)) fail(`matrix package identity mismatch: ${cell.id}/${pkg.name}`);
      checkedFile(root, { path: `${projectPath}/tarballs/${basename(pkg.tarball)}`, sha256: pkg.sha256 }, `matrix ${cell.id} archive ${pkg.name}`);
    }
    const archiveRows = array(project.archives, `matrix ${cell.id} archives`), graphBytes = new Map();
    let previous = '';
    for (const entry of archiveRows) {
      if (!entry || typeof entry.resolved !== 'string' || !entry.resolved || entry.resolved <= previous
          || !SHA.test(entry.sha256 || '') || !Number.isSafeInteger(entry.size) || entry.size < 1 || entry.size > 64 * 1024 * 1024
          || entry.path !== `tests/reports/native-consumer-matrix/${reports.runId}/dependency-archives/${entry.sha256}.tgz`) fail('matrix archive inventory is invalid');
      previous = entry.resolved;
      const absolute = safePath(root, entry.path), stat = lstatSync(absolute);
      if (!stat.isFile() || stat.size !== entry.size || realpathSync(absolute) !== resolve(realpathSync(root), relative(resolve(root), absolute))) fail('matrix archive is unsafe');
      let data = snapshots.get(entry.path);
      if (!data) { data = readFileSync(absolute); archiveByteCount += data.byteLength; snapshots.set(entry.path, data); }
      if (archiveByteCount > 1024 * 1024 * 1024 || sha256(data) !== entry.sha256
          || `sha512-${createHash('sha512').update(data).digest('base64')}` !== entry.integrity) fail('matrix archive bytes changed');
      graphBytes.set(entry.path, data); used.push(entry.path);
      if (entry.resolved.startsWith('file:')) {
        const local = entry.resolved.slice(5).replace(/^\.\//, '');
        assertExampleRelative(local);
        if (!bytes(root, `${projectPath}/${local}`).equals(data)) fail('matrix local candidate archive mismatch');
      }
    }
    (cell.manager === 'npm' ? admissionGraphs : pnpmAdmissionGraphs).push({ graph: admissionGraph(root, `${projectPath}/package.json`, `${projectPath}/${lockfile}`, archiveRows, graphBytes), receipt: project.admission });
    for (const id of checkIds) {
      const matches = matrix.checks.filter(check => check?.project === cell.id && check?.id === id);
      const expectedLog = `tests/reports/native-consumer-matrix/${reports.runId}/logs/${cell.id}-${id}.log`;
      if (matches.length !== 1 || matches[0].status !== 'pass' || matches[0].exitCode !== 0
          || matches[0].logPath !== expectedLog || !Array.isArray(matches[0].command) || !matches[0].command.length
          || matches[0].command.some(value => typeof value !== 'string' || !value) || !Number.isSafeInteger(matches[0].logSize) || matches[0].logSize < 0) fail(`matrix check is missing or failed: ${cell.id}/${id}`);
      used.push(checkedFile(root, { path: expectedLog, sha256: matches[0].logSha256 }, `matrix ${cell.id}/${id} log`));
      if (bytes(root, expectedLog).byteLength !== matches[0].logSize) fail(`matrix log size mismatch: ${cell.id}/${id}`);
    }
  }
  return used;
}
const EXAMPLE_PRIVATE_DIRS = new Set(['.git', '.ssh', '.aws', '.azure', '.gcloud', '.gnupg', '.kube', '.docker', '.config', '.codex']);
const EXAMPLE_PRIVATE_FILES = new Set(['.npmrc', '.netrc', '.pypirc', '.yarnrc', '.yarnrc.yml', '.git-credentials', '.dockercfg', 'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519']);
const EXAMPLE_SOURCE_IGNORED = new Set(['.git', 'node_modules', 'dist', 'build', 'coverage', 'test-results', 'playwright-report', '.cache', 'reports']);
function assertExamplePart(name) {
  const lower = typeof name === 'string' ? name.toLowerCase() : '';
  if (!lower || /[\\\x00-\x1f\x7f?#]/.test(name) || name === '.' || name === '..'
      || EXAMPLE_PRIVATE_DIRS.has(lower) || EXAMPLE_PRIVATE_FILES.has(lower)
      || /^\.env(?:$|[._-])/.test(lower) || /\.(?:pem|key|p12|pfx|jks|keystore)$/.test(lower)) fail('example contains a private or unsafe path');
}
function assertExampleRelative(path) {
  if (typeof path !== 'string' || !path || isAbsolute(path)) fail('example contains a private or unsafe path');
  for (const part of path.split('/')) assertExamplePart(part);
}
function checkedExampleContent(path, data) {
  if (/\.(?:js|mjs|cjs|ts|tsx|jsx|json|html|css|svg|md|txt|log|xml|ya?ml)$/i.test(path)) {
    const text = data.toString('utf8');
    if (redactText(text) !== text) fail('example contains sensitive content');
  }
}
// The example producer records every retained regular file in sorted order.
// Recompute those rows and the legacy source fingerprint without exposing any
// private paths or file contents in a diagnostic.
function exampleInventory(root, directory, budget, countBudget = true) {
  assertExampleRelative(directory);
  const absolute = safePath(root, directory), stat = lstatSync(absolute);
  const expectedReal = resolve(realpathSync(root), relative(resolve(root), absolute));
  if (!stat.isDirectory() || stat.isSymbolicLink() || realpathSync(absolute) !== expectedReal) fail('example retained directory is unsafe');
  const rows = [];
  const visit = (dir, prefix = '') => {
    const names = readdirSync(dir).sort();
    if (!names.length) fail('example retained empty directory cannot be staged');
    for (const entry of names) {
      assertExamplePart(entry);
      if (entry.toLowerCase() === 'node_modules') fail('example retained directory contains dependencies');
      const name = prefix ? `${prefix}/${entry}` : entry, full = join(dir, entry), item = lstatSync(full);
      if (item.isSymbolicLink()) fail('example retained directory contains a symlink');
      if (item.isDirectory()) visit(full, name);
      else if (item.isFile()) {
        if (item.size > 200 * 1024 * 1024) fail('example retained file exceeds its size bound');
        if (countBudget) {
          budget.files += 1; budget.bytes += item.size;
          if (budget.files > (budget.maxFiles ?? 2000) || budget.bytes > (budget.maxBytes ?? 512 * 1024 * 1024)) fail('retained files exceed their bounds');
        }
        const data = readFileSync(full); checkedExampleContent(name, data);
        rows.push({ path: name, sha256: sha256(data), bytes: data.byteLength });
      } else fail('example retained directory contains an unsupported entry');
    }
  };
  visit(absolute);
  rows.sort((a, b) => a.path < b.path ? -1 : a.path > b.path ? 1 : 0);
  return rows;
}
function exampleSourceFingerprint(root, directory) {
  const base = safePath(root, directory), digest = createHash('sha256');
  const visit = (dir, prefix = '') => {
    for (const entry of readdirSync(dir).sort((a, b) => a.localeCompare(b))) {
      if (EXAMPLE_SOURCE_IGNORED.has(entry)) continue;
      const name = prefix ? `${prefix}/${entry}` : entry, full = join(dir, entry), item = lstatSync(full);
      if (item.isDirectory()) visit(full, name);
      else if (item.isFile()) digest.update(name).update('\0').update(readFileSync(full)).update('\0');
      else fail('example source contains an unsupported entry');
    }
  };
  visit(base);
  return digest.digest('hex');
}
// Match the producer's depth-first, locale-sorted file walk without extracting
// or executing package code. The scanner has already checked the tar paths.
function compareArchivePaths(left, right) {
  const a = left.path.split('/'), b = right.path.split('/');
  for (let i = 0; i < Math.min(a.length, b.length); i++) {
    const order = a[i].localeCompare(b[i]);
    if (order) return order;
  }
  return a.length - b.length;
}
function exampleCandidateContentDigest(root, candidate) {
  const { files } = inspectNpmArchive(bytes(root, candidate.tarball));
  if (!files.length) fail('example candidate archive has no files');
  const hash = createHash('sha256');
  for (const file of files.sort(compareArchivePaths)) hash.update(file.path).update('\0').update(file.bytes).update('\0');
  return hash.digest('hex');
}
function consumerTemplateInventory(root, manifest) {
  const path = 'packages/create-aura3d/src/index.ts';
  if (!manifest.files.some(entry => entry.path === path && entry.type === 'file')) fail('consumer template source is not bound to the manifest');
  const source = bytes(root, path).toString('utf8');
  const declarations = [...source.matchAll(/\bexport\s+const\s+CREATE_AURA3D_TEMPLATES\s*=\s*\[([\s\S]*?)\]\s+as\s+const\s*;/g)];
  if (declarations.length !== 1 || declarations[0][1].length > 16384
      || !/^\s*(?:"[a-z0-9][a-z0-9-]*"\s*,\s*)*(?:"[a-z0-9][a-z0-9-]*"\s*,?\s*)?$/.test(declarations[0][1])) fail('consumer template source inventory is not a bounded literal array');
  let templates;
  try { templates = JSON.parse(`[${declarations[0][1].replace(/,\s*$/, '')}]`); }
  catch { fail('consumer template source inventory is invalid'); }
  if (!templates.length || templates.includes('react-import') || new Set(templates).size !== templates.length) fail('consumer template source inventory is incomplete');
  return templates;
}
function consumerSourceFingerprint(root, projectPath, rows) {
  const hash = createHash('sha256');
  for (const row of [...rows].sort(compareArchivePaths)) {
    if (row.path === 'package-lock.json') continue;
    hash.update(`file\0${row.path}\0`).update(bytes(root, `${projectPath}/${row.path}`)).update('\0');
  }
  return hash.digest('hex');
}
function consumerCandidateContentDigest(root, candidate) {
  const { files } = inspectNpmArchive(bytes(root, candidate.tarball));
  const excluded = new Set(['node_modules', '.git', 'coverage', 'test-results', 'playwright-report']);
  const rows = files.filter(file => file.path !== 'package-lock.json' && file.path !== 'tests/reports'
    && !file.path.startsWith('tests/reports/') && !file.path.split('/').some(part => excluded.has(part)));
  if (!rows.length) fail('consumer candidate archive has no retained content');
  const hash = createHash('sha256');
  for (const file of rows.sort(compareArchivePaths)) hash.update(`file\0${file.path}\0`).update(file.bytes).update('\0');
  return hash.digest('hex');
}
function admissionGraph(root, manifestPath, lockPath, archiveRows, archiveBytes) {
  const manifestBytes = bytes(root, manifestPath), lockBytes = bytes(root, lockPath);
  const archives = archiveRows.map(row => ({ resolved: row.resolved, bytes: archiveBytes.get(row.path) }));
  if (archives.some(row => !row.bytes)) fail('consumer admission archive is missing');
  return { manifestBytes, lockBytes, archives };
}
function verifyRetainedConsumers(root, reports, manifestRef, manifest, plan, consumer, candidateReviews, admissionGraphs) {
  const templates = consumerTemplateInventory(root, manifest), required = [...templates, 'react-import'];
  if (consumer.candidate?.version !== plan.version || canonical(consumer.candidate?.packages) !== canonical(plan.packages)
      || canonical(consumer.source?.manifest) !== canonical(manifestRef)
      || !consumer.toolVersions?.node || !consumer.toolVersions?.npm || !Array.isArray(consumer.projects)
      || !Array.isArray(consumer.checks) || !consumer.checks.length || !Array.isArray(consumer.browser)
      || consumer.browser.some(row => row?.status !== 'not-run')) fail('consumer candidate or retained inventory is incomplete');
  equalSet(required, consumer.projects.map(project => project?.template), 'consumer project inventory');
  equalSet(templates, consumer.browser.map(cell => cell?.id), 'consumer browser inventory');
  const used = [], seenLogs = new Set(), archiveBytes = new Map(), contentDigests = new Map();
  const budget = { files: 0, bytes: 0, maxFiles: 100000, maxBytes: 4 * 1024 * 1024 * 1024 };
  let archiveByteCount = 0;
  const checks = consumer.checks;
  if (new Set(checks.map(check => check?.id)).size !== checks.length
      || !checks.some(check => check?.id === 'launcher:install' && check.project === 'launcher')) fail('consumer source check inventory is incomplete');
  for (const check of checks) {
    const prefix = `tests/reports/native-consumers/${reports.runId}/logs/`, name = typeof check?.logPath === 'string' && check.logPath.startsWith(prefix) ? check.logPath.slice(prefix.length) : '';
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*\.log$/.test(name) || seenLogs.has(check.logPath)
        || check.status !== 'passed' || check.exitCode !== 0 || !Array.isArray(check.command) || !check.command.length
        || check.command.some(value => typeof value !== 'string' || !value) || !Number.isSafeInteger(check.logSize) || check.logSize < 0 || check.logSize > 64 * 1024 * 1024) fail('consumer source check or log is invalid');
    seenLogs.add(check.logPath);
    const path = checkedFile(root, { path: check.logPath, sha256: check.logSha256 }, 'consumer source log');
    const absolute = safePath(root, path);
    if (realpathSync(absolute) !== resolve(realpathSync(root), relative(resolve(root), absolute))) fail('consumer source log is unsafe');
    const data = bytes(root, path);
    if (data.byteLength !== check.logSize) fail('consumer source log size mismatch');
    checkedExampleContent(path, data); used.push(path);
  }
  for (const project of consumer.projects) {
    const template = project.template, fixture = template === 'react-import';
    const projectPath = fixture ? `tests/reports/native-consumers/${reports.runId}/projects/react-import`
      : `tests/reports/native-consumers/${reports.runId}/projects/templates/${template}/demo`;
    if (project.path !== projectPath || project.kind !== (fixture ? 'fixture' : 'template') || project.retention !== 'portable-v1'
        || canonical(project.candidateReviews) !== canonical(candidateReviews)
        || canonical(project.sourceManifest) !== canonical(manifestRef)) fail('consumer project identity is invalid');
    for (const id of [...(fixture ? [] : ['scaffold']), 'install', 'build']) if (!checks.some(check => check.project === template && check.id === `${template}:${id}`)) fail('consumer source check is missing');
    const rows = exampleInventory(root, projectPath, budget).map(({ path, sha256, bytes: size }) => ({ path, size, sha256 }));
    if (rows.some(row => row.path.split('/').some(part => ['coverage', 'test-results', 'playwright-report'].includes(part.toLowerCase()))
        || row.path === 'tests/reports' || row.path.startsWith('tests/reports/'))
        || canonical(rows) !== canonical(project.files) || consumerSourceFingerprint(root, projectPath, rows) !== project.projectSha256) fail('consumer retained file inventory mismatch');
    assertExampleRelative(project.entry);
    if (!rows.some(row => row.path === project.entry)) fail('consumer project entry is missing');
    checkedFile(root, { path: `${projectPath}/package.json`, sha256: project.manifestSha256 }, 'consumer manifest');
    checkedFile(root, { path: `${projectPath}/package-lock.json`, sha256: project.lockfileSha256 }, 'consumer lockfile');
    used.push(...rows.map(row => `${projectPath}/${row.path}`));
    const lock = readJson(root, `${projectPath}/package-lock.json`);
    if (!lock.packages || typeof lock.packages !== 'object' || Array.isArray(lock.packages)) fail('consumer lock package inventory is invalid');
    const archiveRows = array(project.archives, 'consumer archives'), snapshots = new Map();
    let previous = '';
    for (const entry of archiveRows) {
      if (!entry || typeof entry.resolved !== 'string' || !entry.resolved || entry.resolved <= previous
          || !SHA.test(entry.sha256 || '') || !Number.isSafeInteger(entry.size) || entry.size < 1 || entry.size > 64 * 1024 * 1024
          || entry.path !== `tests/reports/native-consumers/${reports.runId}/dependency-archives/${entry.sha256}.tgz`) fail('consumer archive inventory is invalid');
      previous = entry.resolved;
      const absolute = safePath(root, entry.path), stat = lstatSync(absolute);
      if (!stat.isFile() || stat.size !== entry.size || realpathSync(absolute) !== resolve(realpathSync(root), relative(resolve(root), absolute))) fail('consumer archive is unsafe');
      let data = archiveBytes.get(entry.path);
      if (!data) { data = readFileSync(absolute); archiveByteCount += data.byteLength; archiveBytes.set(entry.path, data); }
      if (archiveByteCount > 1024 * 1024 * 1024 || sha256(data) !== entry.sha256
          || `sha512-${createHash('sha512').update(data).digest('base64')}` !== entry.integrity) fail('consumer archive bytes changed');
      snapshots.set(entry.path, data); used.push(entry.path);
      if (entry.resolved.startsWith('file:')) {
        const local = entry.resolved.slice(5).replace(/^\.\//, '');
        assertExampleRelative(local);
        if (!bytes(root, `${projectPath}/${local}`).equals(data)) fail('consumer local archive differs from its verified bytes');
      }
    }
    const installed = [];
    for (const path of Object.keys(lock.packages).filter(Boolean).sort()) {
      const entry = lock.packages[path], parts = path.split('/'), index = parts.lastIndexOf('node_modules');
      const name = entry.name ?? (parts[index + 1]?.startsWith('@') ? `${parts[index + 1]}/${parts[index + 2]}` : parts[index + 1]);
      const candidate = plan.packages.find(pkg => pkg.name === name);
      if (!candidate) continue;
      if (entry.version !== candidate.version || entry.integrity !== candidate.integrity) fail('consumer installed candidate identity mismatch');
      let contentsSha256 = contentDigests.get(candidate.sha256);
      if (!contentsSha256) { contentsSha256 = consumerCandidateContentDigest(root, candidate); contentDigests.set(candidate.sha256, contentsSha256); }
      installed.push({ name, installPath: path, version: candidate.version, sha256: candidate.sha256, integrity: candidate.integrity, contentsSha256 });
    }
    if (!installed.length || canonical(installed) !== canonical(project.installedPackages)) fail('consumer installed candidate inventory mismatch');
    admissionGraphs.push({ graph: admissionGraph(root, `${projectPath}/package.json`, `${projectPath}/package-lock.json`, archiveRows, snapshots), receipt: project.admission });
  }
  return used;
}
function verifyRetainedExamples(root, reports, plan, examples, candidateReviews, admissionGraphs) {
  if (canonical(examples.source) !== canonical(plan.source) || canonical(examples.packages) !== canonical(plan.packages)
      || !Array.isArray(examples.cases) || !examples.cases.length || !Array.isArray(examples.projects)
      || examples.projects.length !== examples.cases.length || !Array.isArray(examples.failures) || examples.failures.length) fail('example retained candidate or inventory mismatch');
  equalSet(examples.cases.map(item => item?.id), examples.projects.map(item => item?.id), 'example cases and projects');
  const used = [], suffixes = new Set(), budget = { files: 0, bytes: 0 }, archiveBytes = new Map(), contentDigests = new Map();
  let archiveByteCount = 0;
  for (const item of examples.cases) {
    if (typeof item.id !== 'string' || !/^[a-zA-Z0-9:_/-]+$/.test(item.id) || item.status !== 'passed') fail('example case is invalid or failed');
    const suffix = item.id.replace(/[^a-z0-9-]+/gi, '-');
    if (!suffix || suffixes.has(suffix)) fail('example retained project names collide');
    suffixes.add(suffix);
    const project = examples.projects.find(value => value.id === item.id);
    const wrapper = `tests/reports/native-examples-catalog/${reports.runId}/projects/${suffix}`;
    if (project.wrapperPath !== wrapper || item.project !== project.path || typeof project.path !== 'string'
        || canonical(project.candidateReviews) !== canonical(candidateReviews)
        || !project.path.startsWith(`${wrapper}/`)) fail('example retained project identity mismatch');
    assertExampleRelative(project.path);
    const retained = exampleInventory(root, wrapper, budget);
    if (!retained.length || canonical(retained) !== canonical(project.retainedFiles)
        || sha256(JSON.stringify(retained)) !== project.retainedSha256
        || exampleSourceFingerprint(root, wrapper) !== project.sourceSha256) fail('example retained source inventory mismatch');
    used.push(...retained.map(entry => `${wrapper}/${entry.path}`));
    checkedFile(root, { path: `${wrapper}/package.json`, sha256: project.manifestSha256 }, 'example manifest');
    checkedFile(root, { path: `${wrapper}/package-lock.json`, sha256: project.lockSha256 }, 'example lockfile');
    const output = `${project.path}/dist`, outputFiles = exampleInventory(root, output, budget, false);
    if (!outputFiles.length || canonical(outputFiles) !== canonical(project.outputFiles)
        || sha256(JSON.stringify(outputFiles)) !== project.outputSha256) fail('example retained output inventory mismatch');
    assertExampleRelative(project.outputEntry);
    if (!outputFiles.some(entry => entry.path === project.outputEntry)) fail('example output entry is missing');
    const lock = readJson(root, `${wrapper}/package-lock.json`);
    if (!lock.packages || typeof lock.packages !== 'object' || Array.isArray(lock.packages)) fail('example lock lacks package identities');
    const archiveRows = array(project.verifiedArchives, 'example verified archives'), archivePaths = new Map();
    let previousResolution = '';
    for (const entry of archiveRows) {
      if (!entry || typeof entry.resolved !== 'string' || !entry.resolved || entry.resolved <= previousResolution
          || !SHA.test(entry.sha256 || '')
          || entry.path !== `tests/reports/native-examples-catalog/${reports.runId}/dependency-archives/${entry.sha256}.tgz`) fail('example verified archive inventory is invalid');
      previousResolution = entry.resolved;
      const absolute = safePath(root, entry.path), stat = lstatSync(absolute);
      if (!stat.isFile() || stat.size > 64 * 1024 * 1024
          || realpathSync(absolute) !== resolve(realpathSync(root), relative(resolve(root), absolute))) fail('example verified archive is unsafe');
      let data = archiveBytes.get(entry.path);
      if (!data) {
        data = readFileSync(absolute); archiveByteCount += data.byteLength;
        if (archiveByteCount > 1024 * 1024 * 1024) fail('example verified archives exceed their size bound');
        archiveBytes.set(entry.path, data);
      }
      if (sha256(data) !== entry.sha256) fail('example verified archive hash mismatch');
      archivePaths.set(entry.path, data); used.push(entry.path);
      if (entry.resolved.startsWith('file:')) {
        const relativePath = entry.resolved.slice(5);
        if (relativePath !== `aura-candidates/${entry.sha256}.tgz` || !bytes(root, `${wrapper}/${relativePath}`).equals(data)) fail('example local candidate archive mismatch');
      }
    }
    const expectedInstalled = [], expectedContents = [];
    for (const [path, observed] of Object.entries(lock.packages)) {
      const candidate = plan.packages.find(pkg => path === `node_modules/${pkg.name}` || path.endsWith(`/node_modules/${pkg.name}`));
      if (!candidate) continue;
      if (observed?.integrity !== candidate.integrity || observed?.version !== candidate.version) fail('example lock candidate identity mismatch');
      expectedInstalled.push({ name: candidate.name, version: candidate.version, integrity: observed.integrity,
        ...(observed.resolved === undefined ? {} : { resolved: observed.resolved }), tarball: candidate.tarball, sha256: candidate.sha256 });
      let contentDigest = contentDigests.get(candidate.sha256);
      if (!contentDigest) { contentDigest = exampleCandidateContentDigest(root, candidate); contentDigests.set(candidate.sha256, contentDigest); }
      expectedContents.push({ path, sha256: contentDigest });
    }
    if (!expectedInstalled.length || canonical(project.installedPackages) !== canonical(expectedInstalled)
        || !Array.isArray(project.installedPackageContents)) fail('example installed candidate inventory mismatch');
    equalSet(expectedContents.map(entry => entry.path), project.installedPackageContents.map(entry => entry?.path), 'example installed content inventory');
    if (expectedContents.some(entry => !project.installedPackageContents.some(observed => observed.path === entry.path && observed.sha256 === entry.sha256))) fail('example installed content differs from candidate archive');
    admissionGraphs.push({ graph: admissionGraph(root, `${wrapper}/package.json`, `${wrapper}/package-lock.json`, archiveRows, archivePaths), receipt: project.admission });
    const checks = array(item.checks, 'example checks');
    if (new Set(checks.map(check => check?.id)).size !== checks.length
        || ['install', 'build'].some(id => checks.filter(check => check?.id === id).length !== 1)) fail('example required checks are missing or duplicate');
    const logDirectory = `tests/reports/native-examples-catalog/${reports.runId}/logs/${suffix}`;
    const logAbsolute = safePath(root, logDirectory), logStat = lstatSync(logAbsolute);
    if (!logStat.isDirectory() || logStat.isSymbolicLink()
        || realpathSync(logAbsolute) !== resolve(realpathSync(root), relative(resolve(root), logAbsolute))) fail('example source log directory is unsafe');
    equalSet(checks.map(check => `${check?.id}.log`), readdirSync(logAbsolute), 'example source log inventory');
    for (const check of checks) {
      if (typeof check.id !== 'string' || !/^[a-zA-Z0-9_-]+$/.test(check.id) || check.status !== 'passed' || check.exitCode !== 0
          || !Array.isArray(check.command) || !check.command.length || check.command.some(value => typeof value !== 'string' || !value)) fail('example source check failed');
      const path = `${logDirectory}/${check.id}.log`;
      if (check.logPath !== path) fail('example source log path mismatch');
      used.push(checkedFile(root, { path, sha256: check.logSha256 }, 'example source log'));
      checkedExampleContent(path, bytes(root, path));
    }
  }
  return used;
}
function verifyRetainedSourceReports(root, reports, plan) {
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(reports.runId)) fail('invalid source run ID');
  const retained = reports.retainedReports;
  if (!retained || typeof retained !== 'object' || Array.isArray(retained)) fail('retained source reports are missing');
  equalSet(['bundleSize', 'installedTreeShaking'], Object.keys(retained), 'retained source report inventory');
  const used = [];
  for (const [name, filename] of [['bundleSize', 'bundle-size.json'], ['installedTreeShaking', 'installed-tree-shaking.json']]) {
    const reference = retained[name];
    if (reference?.path !== `tests/reports/native-capabilities/${reports.runId}/${filename}`) fail(`wrong retained ${name} path`);
    used.push(checkedFile(root, reference, name));
    const content = readJson(root, reference.path);
    const schema = name === 'bundleSize' ? 'aura3d-real-bundle-size' : 'aura3d.installed-tree-shaking/2';
    if (content.schema !== schema || content.pass !== true || !Array.isArray(content.failures) || content.failures.length !== 0
        || !Array.isArray(content.checks) || !content.checks.length
        || content.checks.some(check => typeof check?.id !== 'string' || !check.id || check.pass !== true)
        || new Set(content.checks.map(check => check.id)).size !== content.checks.length) fail(`retained ${name} report failed or is incomplete`);
    if (canonical(content.candidate?.releasePlan) !== canonical(reports.candidatePlan)
        || content.candidate?.version !== plan.version || canonical(content.candidate?.source) !== canonical(plan.source)) fail(`retained ${name} candidate mismatch`);
    if (name === 'bundleSize') {
      const checkIds = new Set(content.checks.map(check => check.id));
      if (content.candidate?.status !== 'bound' || !Array.isArray(content.targets) || !content.targets.length
          || content.targets.some(target => !/^[a-zA-Z0-9_-]+$/.test(target?.id || '') || !checkIds.has(target.id))
          || new Set(content.targets.map(target => target.id)).size !== content.targets.length
          || ['candidate-identity', 'bundle-artifact-identity', 'real-size-limit-bundle-measurement'].some(id => !checkIds.has(id))) fail('retained bundleSize measurements are incomplete');
      for (const target of content.targets) {
        const bundlePath = `tests/reports/native-capabilities/${reports.runId}/bundle-size/${target.id}.js`;
        if (target.bundlePath !== bundlePath || target.gzipPath !== `${bundlePath}.gz`) fail(`retained bundleSize artifact path mismatch: ${target.id}`);
        used.push(checkedFile(root, { path: target.bundlePath, sha256: target.bundleSha256 }, `bundleSize ${target.id} JavaScript`));
        used.push(checkedFile(root, { path: target.gzipPath, sha256: target.gzipSha256 }, `bundleSize ${target.id} gzip`));
        if (bytes(root, target.bundlePath).byteLength !== target.jsBytes || bytes(root, target.gzipPath).byteLength !== target.gzipBytes) fail(`retained bundleSize artifact byte count mismatch: ${target.id}`);
      }
    } else {
      const source = reports.phaseReports?.sourceConsumerReport;
      if (content.sourceReport?.runId !== reports.runId || content.sourceReport?.path !== source?.path
          || content.sourceReport?.sha256 !== source?.sha256) fail('retained installedTreeShaking source report mismatch');
    }
  }
  return used;
}
function verifySourceHandoff(root, reports, manifestRef, manifest) {
  if (!['patch', 'minor', 'major'].includes(reports.releaseKind) || reports.sourceManifestPath !== manifestRef.path
      || reports.buildHandoff?.path !== `tests/reports/native-capabilities/${reports.runId}/source-build.json`) fail('source build handoff identity is missing');
  const handoff = verifySourceBuildHandoff({ root, runId: reports.runId, releaseKind: reports.releaseKind,
    manifestBytes: bytes(root, manifestRef.path), manifest, expectedReportSha256: reports.buildHandoff.sha256, api: sourceHandoffApi() });
  if (canonical(handoff.reportRef) !== canonical(reports.buildHandoff) || canonical(handoff.sourceManifest) !== canonical(manifestRef)
      || canonical(handoff.sourceInventory) !== canonical(reports.sourceInventory)
      || canonical(handoff.candidate.candidatePlan) !== canonical(reports.candidatePlan)
      || canonical(handoff.candidate.archives) !== canonical(reports.archives)) fail('source build handoff candidate mismatch');
  const build = handoff.report, count = build.checks.length;
  if (canonical(build.checks) !== canonical(reports.checks.slice(0, count))
      || canonical(build.testInventories) !== canonical(reports.testInventories.slice(0, build.testInventories.length))
      || canonical(build.completedOutcomeIds) !== canonical(reports.completedOutcomeIds)) fail('source build handoff prefix mismatch');
  const resume = reports.resumeRebuild;
  if (resume?.checkId !== 'resume-rebuild' || resume.inventory?.path !== `tests/reports/native-capabilities/${reports.runId}/resume-build-products.json`
      || resume.buildProductsSha256 !== handoff.buildProductsSha256) fail('source rebuild inventory reference mismatch');
  const path = checkedFile(root, resume.inventory, 'source rebuild inventory'), rebuilt = readJson(root, path);
  if (rebuilt.schema !== 'aura3d.native-source-build-products/1' || rebuilt.runId !== reports.runId
      || canonical(rebuilt.sourceManifest) !== canonical(manifestRef) || canonical(rebuilt.candidatePlan) !== canonical(reports.candidatePlan)
      || rebuilt.buildProductsSha256 !== handoff.buildProductsSha256 || canonical(rebuilt.buildProducts) !== canonical(handoff.buildProducts)) fail('source rebuild inventory mismatch');
  return [...handoff.retainedFiles.map(ref => ref.path), path];
}
export function verifySourceInventoryEvidence({ root, reports, manifestRef, manifest }) {
  if (reports.schema !== 'aura3d.native-source-reports/1' || reports.acceptance !== 'not-run') fail('invalid source report phase/schema');
  if (!/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/.test(nonempty(reports.runId, 'source run ID'))) fail('invalid source run ID');
  if (reports.sourceManifestSha256 !== manifestRef.sha256) fail('source report manifest mismatch');
  if (!['patch', 'minor', 'major'].includes(reports.releaseKind)) fail('source release kind is invalid');
  const inventory = nativeSourceInventoryForManifest(manifest, reports.runId);
  const expectedSteps = buildSteps(reports.runId, `tests/reports/native-capabilities/${reports.runId}`, reports.releaseKind, inventory);
  const expectedIds = expectedSteps.map(step => step.id);
  equalSet(expectedIds, reports.expectedCheckIds, 'canonical/expected checks');
  equalSet(expectedIds, reports.fullExpectedCheckIds, 'full expected checks');
  equalSet(expectedIds, array(reports.checks, 'checks').map(x => x.id), 'expected/observed checks');
  equalSet(expectedIds, reports.executedCheckIds, 'expected/executed checks');
  if (canonical(expectedIds) !== canonical(reports.expectedCheckIds)
      || canonical(expectedIds) !== canonical(reports.fullExpectedCheckIds)
      || canonical(expectedIds) !== canonical(reports.executedCheckIds)
      || canonical(expectedIds) !== canonical(reports.checks.map(check => check.id))) fail('source checks do not preserve the canonical phase order');
  const used = [];
  if (reports.sourceInventory?.path !== `tests/reports/native-capabilities/${reports.runId}/source-inventory.json`) fail('source inventory path mismatch');
  used.push(checkedFile(root, reports.sourceInventory, 'source inventory'));
  if (canonical(readJson(root, reports.sourceInventory.path)) !== canonical(inventory)) fail('source inventory differs from the staged manifest');
  for (const [index, check] of reports.checks.entries()) {
    if (check.status !== 'passed' || check.exitCode !== 0 || check.started !== true) fail(`source check did not pass: ${check.id}`);
    if (canonical(check.argv) !== canonical(expectedSteps[index].argv)) fail(`source check command mismatch: ${check.id}`);
    used.push(checkedFile(root, { path: check.log, sha256: check.sha256 }, `log ${check.id}`));
  }
  const coverage = sourceTestFileCoverage(inventory, reports.testInventories);
  for (const [key, value] of Object.entries(coverage)) if (canonical(reports[key]) !== canonical(value)) fail(`source test coverage mismatch: ${key}`);
  equalSet(coverage.expectedSourceTestFiles, coverage.executedSourceTestFiles, 'expected/executed source files');
  const expectedInventories = coverage.expectedTestFiles;
  const supplemental = new Map(inventory.supplementalChecks.map(plan => [plan.id, plan]));
  const invs = array(reports.testInventories, 'test inventories');
  equalSet(Object.keys(expectedInventories), invs.map(i => i.checkId), 'test suite inventory');
  for (const inv of invs) {
    equalSet(expectedInventories[inv.checkId], inv.expectedFiles, `expected tests ${inv.checkId}`);
    equalSet(inv.expectedFiles, inv.discoveredFiles, `discovered tests ${inv.checkId}`);
    if (!Number.isSafeInteger(inv.testCount) || inv.testCount <= 0 || inv.passedCount !== inv.testCount || inv.failedCount !== 0 || inv.skippedCount !== 0) fail(`tests missing, failed or skipped: ${inv.checkId}`);
    if (supplemental.has(inv.checkId)) {
      verifySupplementalEvidence({ runId: reports.runId, plan: supplemental.get(inv.checkId),
        check: reports.checks.find(check => check.id === inv.checkId), inventory: inv, api: sourceHandoffApi(),
        readRetained: (ref, expectedPath) => {
          if (ref?.path !== expectedPath) fail(`supplemental result path mismatch: ${inv.checkId}`);
          used.push(checkedFile(root, ref, `supplemental result ${inv.checkId}`));
          return bytes(root, ref.path);
        } });
    } else if (['parity', 'unit', 'unit-dist', 'unit-packed', 'assets-qr', 'integration'].includes(inv.checkId)) used.push(verifyVitestInventory(root, inv, expectedInventories[inv.checkId]));
    else used.push(...verifyTapInventory(root, inv, reports.checks.find(check => check.id === inv.checkId), expectedInventories[inv.checkId], reports.runId));
  }
  return used;
}
function verifyReports(root, reports, manifestRef, manifest, sourceFingerprint) {
  const used = verifySourceInventoryEvidence({ root, reports, manifestRef, manifest });
  const planPath = checkedFile(root, reports.candidatePlan, 'candidate plan'); used.push(planPath);
  const plan = readJson(root, planPath);
  const packages = array(plan.packages, 'candidate packages');
  if (plan.schema !== 'aura3d-release-plan/1.0' || plan.packOnly !== true || typeof plan.version !== 'string' || !plan.version
      || plan.expectedPackageCount !== packages.length || plan.packageCount !== packages.length
      || packages.some(pkg => typeof pkg.name !== 'string' || !pkg.name || pkg.version !== plan.version)
      || new Set(packages.map(pkg => pkg.name)).size !== packages.length) fail('candidate plan package inventory is incomplete');
  if (plan.commit !== manifest.origin.commit || plan.source?.commit !== manifest.origin.commit
      || plan.source?.tree !== manifest.origin.tree || plan.source?.inputDigest !== manifest.inputDigest
      || plan.source?.fingerprint !== sourceFingerprint || plan.source?.manifestSha256 !== manifestRef.sha256
      || plan.source?.lockfileSha256 !== manifest.lockfileSha256 || plan.lockfileSha256 !== manifest.lockfileSha256) fail('candidate plan source identity mismatch');
  const archives = array(reports.archives, 'candidate archives');
  equalSet(packages.map(p => p.tarball), archives.map(p => p.path), 'candidate package archives');
  for (const archive of archives) {
    used.push(checkedFile(root, archive, 'archive'));
    const pkg = packages.find(p => p.tarball === archive.path);
    const integrity = `sha512-${createHash('sha512').update(bytes(root, archive.path)).digest('base64')}`;
    if (pkg?.sha256 !== archive.sha256 || pkg.integrity !== integrity) fail(`candidate archive does not match plan: ${archive.path}`);
  }
  used.push(...verifySourceHandoff(root, reports, manifestRef, manifest));
  const sidecarPath = `tests/reports/native-source-inputs/${reports.runId}/inputs.json`;
  const portable = verifyPortableInputs({ root, runId: reports.runId, sourceManifestPath: manifestRef.path,
    candidatePlanPath: reports.candidatePlan.path, inputsPath: sidecarPath });
  const { consumers: inputConsumers, pnpmConsumers: inputPnpmConsumers, ...portableRefs } = portable;
  if (canonical(portableRefs) !== canonical(reports.portableInputs) || !Array.isArray(inputConsumers) || !inputConsumers.length
      || !Array.isArray(inputPnpmConsumers) || !inputPnpmConsumers.length || !Array.isArray(portable.candidateReviews)
      || !Array.isArray(portable.candidateReviewEvidence)) fail('portable source input inventory mismatch');
  const sidecar = readJson(root, sidecarPath);
  if (!Array.isArray(sidecar.files)) fail('portable source input file inventory is missing');
  used.push(sidecarPath, ...sidecar.files.map(item => item.path));
  const phaseContents = {};
  for (const key of ['sourceConsumerReport', 'matrixSourceReport', 'examplesSourceReport']) {
    const report = reports.phaseReports?.[key];
    used.push(checkedFile(root, report, key));
    const content = readJson(root, report.path);
    try { assertPassingPhaseReport(key, content, reports.runId, { candidatePlan: reports.candidatePlan }, plan); }
    catch (error) { fail(`${key} is invalid: ${error.message}`); }
    if (canonical(content.candidateReviews) !== canonical(portable.candidateReviews)) fail(`${key} candidate review inventory mismatch`);
    phaseContents[key] = content;
  }
  const admissionGraphs = inputConsumers.map(graph => ({ graph })), pnpmAdmissionGraphs = inputPnpmConsumers.map(graph => ({ graph }));
  used.push(...verifyRetainedConsumers(root, reports, manifestRef, manifest, plan, phaseContents.sourceConsumerReport, portable.candidateReviews, admissionGraphs));
  used.push(...verifyRetainedMatrix(root, reports, manifestRef, plan, phaseContents.matrixSourceReport, portable.candidateReviews, admissionGraphs, pnpmAdmissionGraphs));
  used.push(...verifyRetainedExamples(root, reports, plan, phaseContents.examplesSourceReport, portable.candidateReviews, admissionGraphs));
  const verifyAdmissions = (graphs, verifier, format) => {
    if (!graphs.length) fail(`missing ${format} admission inventory`);
    const receipts = verifier({ root, sourceManifestPath: manifestRef.path, planPath: reports.candidatePlan.path,
      candidateReviews: portable.candidateReviews, consumers: graphs.map(item => item.graph) });
    if (!Array.isArray(receipts) || receipts.length !== graphs.length) fail('consumer admission inventory is incomplete');
    for (const [index, receipt] of receipts.entries()) {
      const { graph, receipt: reported } = graphs[index];
      if ((format === 'pnpm' && receipt.lockFormat !== 'pnpm') || canonical(receipt.sourceManifest) !== canonical(manifestRef)
          || receipt.sourceInputSha256 !== manifest.inputDigest || canonical(receipt.testedOrigin) !== canonical(manifest.origin)
          || canonical(receipt.plan) !== canonical(reports.candidatePlan) || receipt.manifestSha256 !== sha256(graph.manifestBytes)
          || receipt.lockSha256 !== sha256(graph.lockBytes) || (reported !== undefined && canonical(receipt) !== canonical(reported))) fail('consumer admission does not match the frozen source and candidate');
    }
  };
  verifyAdmissions(admissionGraphs, verifyArchiveAdmissionBatch, 'npm');
  verifyAdmissions(pnpmAdmissionGraphs, verifyPnpmArchiveAdmissionBatch, 'pnpm');
  used.push(...verifyRetainedSourceReports(root, reports, plan));
  return used;
}
function verifyDeferredAcceptance(root, manifest, reports) {
  for (const path of [...ARCHIVE_ADMISSION_FILES, ...ARCHIVE_ADMISSION_TESTS]) {
    if (!manifest.files.some(entry => entry.path === path && entry.type === 'file')) fail('archive admission source or tests are not staged');
  }
  const unit = reports.testInventories.find(inventory => inventory.checkId === 'unit');
  for (const path of ARCHIVE_ADMISSION_TESTS) {
    if (!unit?.expectedFiles?.includes(path) || !unit.discoveredFiles?.includes(path)) fail('archive admission source test was not executed');
  }
  if (!manifest.files.some(entry => entry.path === HISTORICAL_ACCEPTANCE_INVENTORY)) fail('historical acceptance inventory is not a source input');
  if (!manifest.files.some(entry => entry.path === HISTORICAL_LAUNCHER)) fail('historical acceptance launcher is not a source input');
  let expected;
  try { expected = expectedHistoricalAcceptance(manifest, readJson(root, HISTORICAL_ACCEPTANCE_INVENTORY)); }
  catch (error) { fail(`historical acceptance inventory is invalid: ${error.message}`); }
  if (canonical(manifest.deferredAcceptanceTests) !== canonical(expected)
      || canonical(reports.deferredAcceptanceTests) !== canonical(expected)) fail('deferred acceptance inventory mismatch');
  let replay;
  try { replay = expectedHistoricalReplay(manifest); }
  catch (error) { fail(`historical replay inventory is invalid: ${error.message}`); }
  if (canonical(manifest.deferredReplayTests) !== canonical(replay)
      || canonical(reports.deferredReplayTests) !== canonical(replay)) fail('deferred replay inventory mismatch');
  let externalCodec;
  try { externalCodec = expectedExternalCodecAcceptance(manifest); }
  catch (error) { fail(`external codec inventory is invalid: ${error.message}`); }
  if (canonical(manifest.deferredExternalCodecTests) !== canonical(externalCodec)
      || canonical(reports.deferredExternalCodecTests) !== canonical(externalCodec)) fail('deferred external codec inventory mismatch');
  for (const path of [HISTORICAL_SOURCE_TEST, HISTORICAL_LAUNCHER_TEST, HISTORICAL_REPLAY_SOURCE_TEST]) {
    if (!unit?.expectedFiles?.includes(path) || !unit.discoveredFiles?.includes(path)) fail(`historical acceptance source test was not executed: ${path}`);
  }
  for (const path of [EXTERNAL_CODEC_CONTRACT_TEST, EXTERNAL_CODEC_LAUNCHER_TEST, externalCodec.portableScannerTest?.path]) {
    if (!unit?.expectedFiles?.includes(path) || !unit.discoveredFiles?.includes(path)) fail(`external codec source test was not executed: ${path}`);
  }
  const assets = reports.testInventories.find(inventory => inventory.checkId === 'assets-qr');
  if (!assets?.expectedFiles?.includes(EXTERNAL_CODEC_SOURCE_TEST) || !assets.discoveredFiles?.includes(EXTERNAL_CODEC_SOURCE_TEST)) fail('external codec source test was not executed');
  return { deferredAcceptanceTests: expected, deferredReplayTests: replay, deferredExternalCodecTests: externalCodec };
}
function evaluate(root, sourceManifestPath, sourceReportsPath, ledgerPath, proof) {
  root = resolve(root);
  const sourceManifest = asRef(root, sourceManifestPath), sourceReports = asRef(root, sourceReportsPath), ledgerRef = asRef(root, ledgerPath);
  const manifest = readJson(root, sourceManifest.path), reports = readJson(root, sourceReports.path), ledger = readJson(root, ledgerRef.path);
  const { paths, fingerprint } = manifestInputs(root, manifest);
  verifyCommitProof(root, proof, manifest);
  const reportPaths = verifyReports(root, reports, sourceManifest, manifest, fingerprint);
  const { deferredAcceptanceTests, deferredReplayTests, deferredExternalCodecTests } = verifyDeferredAcceptance(root, manifest, reports);
  const outcome = verifyLedger(root, ledger, reports);
  const candidatePlan = reports.candidatePlan;
  const phaseReports = reports.phaseReports;
  const inputs = [...new Set([sourceManifest.path, sourceReports.path, ledgerRef.path, ledger.roadmap.path, ...paths, ...reportPaths])].sort();
  return { sourceManifest, sourceReports, ledger: ledgerRef, roadmap: ledger.roadmap, freezeCommit: proof.commit, testedOrigin: manifest.origin,
    sourceInputDigest: manifest.inputDigest, lockfileSha256: manifest.lockfileSha256, runId: reports.runId, candidatePlan,
    sourceInventory: reports.sourceInventory, buildHandoff: reports.buildHandoff, portableInputs: reports.portableInputs, resumeRebuild: reports.resumeRebuild,
    archives: reports.archives, retainedReports: reports.retainedReports, sourceConsumerReport: phaseReports.sourceConsumerReport, matrixSourceReport: phaseReports.matrixSourceReport,
    examplesSourceReport: phaseReports.examplesSourceReport, requiredOutcomeIds: outcome.required, completedOutcomeIds: reports.completedOutcomeIds,
    outcomeSnapshotSha256: outcome.snapshotSha256, expectedCheckIds: reports.expectedCheckIds, executedCheckIds: reports.executedCheckIds, passingCheckIds: reports.checks.map(c => c.id),
    expectedTestFiles: reports.expectedTestFiles, executedTestFiles: reports.executedTestFiles,
    expectedSourceTestFiles: reports.expectedSourceTestFiles, executedSourceTestFiles: reports.executedSourceTestFiles,
    deferredAcceptanceTests, deferredReplayTests, deferredExternalCodecTests,
    acceptance: 'not-run', commitProof: proof, inputs };
}
export function emitCodeCompleteGate({ root = process.cwd(), sourceManifest, sourceReports, ledger, freezeCommit, out, owner }) {
  root = resolve(root); nonempty(owner, 'integration owner');
  const proof = createCommitProof(root, nonempty(freezeCommit, 'freeze commit'));
  const result = evaluate(root, sourceManifest, sourceReports, ledger, proof);
  const actualInputs = git(root, 'ls-files', '-z', '--cached', '--others', '--exclude-standard').toString().split('\0').filter(isSourceInput);
  equalSet([...new Set(actualInputs)], readJson(root, sourceManifest).files.map(x => x.path), 'working source inventory');
  const record = { schema: 'aura3d.native-code-complete/1', status: 'CODE_COMPLETE_GO', createdAt: new Date().toISOString(), owner, ...result };
  const output = safePath(root, out); mkdirSync(dirname(output), { recursive: true });
  writeFileSync(output, `${JSON.stringify(record, null, 2)}\n`, { flag: 'wx' });
  return record;
}
export function validateAcceptanceGate({ root = process.cwd(), gatePath, sourceReport } = {}) {
  root = resolve(root); nonempty(gatePath, 'gate path');
  const record = readJson(root, gatePath);
  if (record.schema !== 'aura3d.native-code-complete/1' || record.status !== 'CODE_COMPLETE_GO'
      || typeof record.owner !== 'string' || !record.owner.trim()
      || typeof record.createdAt !== 'string' || !Number.isFinite(Date.parse(record.createdAt))) fail('invalid gate record');
  const result = evaluate(root, record.sourceManifest?.path, record.sourceReports?.path, record.ledger?.path, record.commitProof);
  for (const [key, value] of Object.entries(result)) if (canonical(record[key]) !== canonical(value)) fail(`gate field mismatch: ${key}`);
  if (sourceReport && ![record.sourceConsumerReport.path, record.matrixSourceReport.path, record.examplesSourceReport.path].includes(sourceReport)) fail('selected source report is not bound to this gate');
  return record;
}
function cli() {
  const args = process.argv.slice(2), options = {};
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]; if (!arg.startsWith('--') || options[arg] !== undefined) fail(`unknown or duplicate argument ${arg}`);
    if (arg === '--list-inputs') options[arg] = true;
    else { if (!args[i + 1] || args[i + 1].startsWith('--')) fail(`missing argument for ${arg}`); options[arg] = args[++i]; }
  }
  const phase = options['--phase'];
  const allowed = phase === 'acceptance' ? ['--phase', '--gate', '--source-report', '--list-inputs']
    : phase === 'code-complete' ? ['--phase', '--source-manifest', '--source-reports', '--ledger', '--freeze-commit', '--out', '--owner'] : [];
  if (!allowed.length || Object.keys(options).some(x => !allowed.includes(x))) fail('invalid phase or argument');
  if (phase === 'acceptance') {
    const record = validateAcceptanceGate({ gatePath: options['--gate'], sourceReport: options['--source-report'] });
    process.stdout.write(options['--list-inputs'] ? `${JSON.stringify([...new Set([options['--gate'], ...record.inputs])].sort())}\n` : 'CODE_COMPLETE_GO validated\n');
  } else {
    emitCodeCompleteGate({ sourceManifest: options['--source-manifest'], sourceReports: options['--source-reports'], ledger: options['--ledger'],
      freezeCommit: options['--freeze-commit'], out: options['--out'], owner: options['--owner'] || process.env.NATIVE_INTEGRATION_OWNER });
    process.stdout.write('CODE_COMPLETE_GO emitted\n');
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try { cli(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
