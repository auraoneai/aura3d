import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, linkSync, lstatSync, mkdirSync, mkdtempSync, openSync, readSync, realpathSync, renameSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { dirname, isAbsolute, join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { stagePortableInputs } from './portable-inputs.mjs';

// Assembly transports explicitly supplied bytes. It does not execute a
// package manager, decide provenance, verify a review signature or admit an
// archive. The remote pre-install verifier remains the admission authority.
const HASH = /^[a-f0-9]{64}$/;
const SRI = /^sha512-[A-Za-z0-9+/]{86}==$/;
const RUN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const EXAMPLE = /^(?:capability-example:[a-z0-9-]+|starter-example:[a-z0-9][a-z0-9-]*|documented-example:(?:apps|examples)\/[a-z0-9][a-z0-9-]*)$/;
const MAX_JSON = 16 * 1024 * 1024;
const MAX_FILE = 64 * 1024 * 1024;
const MAX_TOTAL = 512 * 1024 * 1024;
const MAX_FILES = 10000;
const CHUNK = 256 * 1024;
const POLICY = 'tools/release/archive-admission-policy.json';
const TEMPLATE_SOURCE = 'packages/create-aura3d/src/index.ts';
const fail = message => { throw new Error(`PORTABLE_ASSEMBLY: ${message}`); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const jsonBytes = value => Buffer.from(`${JSON.stringify(value, null, 2)}\n`);
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const object = value => value !== null && typeof value === 'object' && !Array.isArray(value);
function fields(value, names, label) {
  if (!object(value) || Object.keys(value).length !== names.length || names.some(name => !Object.hasOwn(value, name))) fail(`invalid ${label}`);
}
function array(value, label, max = MAX_FILES, nonempty = true) {
  if (!Array.isArray(value) || value.length > max || (nonempty && value.length === 0)) fail(`invalid ${label}`);
  return value;
}
function safePath(path) {
  if (typeof path !== 'string' || !path || path.length > 4096 || isAbsolute(path) || path.includes('\\') || /[\x00-\x1f\x7f]/.test(path)) fail('unsafe input path');
  for (const part of path.split('/')) {
    const lower = part.toLowerCase();
    if (!part || part === '.' || part === '..' || ['node_modules', '.git', '.ssh', '.aws', '.azure', '.gcloud', '.gnupg', '.kube', '.docker', '.config', '.codex', '.npmrc', '.netrc', '.pypirc', '.yarnrc', '.yarnrc.yml', '.git-credentials', '.dockercfg', 'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519'].includes(lower) || /^\.env(?:\.|$)/i.test(part) || /\.(?:pem|key|p12|pfx|jks|keystore)$/i.test(part)) fail('private or unsafe input path');
  }
  return path;
}
function rootDirectory(value) {
  if (typeof value !== 'string' || !isAbsolute(value)) fail('roots must be absolute directories');
  try {
    const stat = lstatSync(value);
    if (stat.isSymbolicLink() || !stat.isDirectory()) fail('root must be a real directory');
    return realpathSync(value);
  } catch (error) {
    if (error?.message?.startsWith('PORTABLE_ASSEMBLY:')) throw error;
    fail('root directory is unavailable');
  }
}
function checkedFile(root, path, max, allowEmpty = false) {
  safePath(path);
  let current = root;
  try {
    const parts = path.split('/');
    for (let index = 0; index < parts.length; index++) {
      current = join(current, parts[index]);
      const stat = lstatSync(current);
      if (stat.isSymbolicLink() || (index < parts.length - 1 && !stat.isDirectory())) fail('unsafe input ancestor');
    }
    if (!realpathSync(current).startsWith(root + sep)) fail('input escapes its root');
    const fd = openSync(current, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    const stat = fstatSync(fd);
    if (!stat.isFile() || stat.size > max || (!allowEmpty && stat.size === 0)) { closeSync(fd); fail('invalid input file'); }
    return { fd, stat, path: current };
  } catch (error) {
    if (error?.message?.startsWith('PORTABLE_ASSEMBLY:')) throw error;
    fail('input file is unavailable');
  }
}
function unchanged(before, after) {
  return before.dev === after.dev && before.ino === after.ino && before.size === after.size && before.mtimeMs === after.mtimeMs && before.ctimeMs === after.ctimeMs;
}
function inputRef(value, label, allowEmpty = false) {
  fields(value, ['path', 'size', 'sha256'], label);
  safePath(value.path);
  if (!Number.isSafeInteger(value.size) || value.size < (allowEmpty ? 0 : 1) || value.size > MAX_FILE || !HASH.test(value.sha256 ?? '')) fail(`invalid ${label}`);
  return value;
}
function bytes(root, ref, max = MAX_JSON) {
  inputRef(ref, 'input identity');
  if (ref.size > max) fail('metadata exceeds its limit');
  const file = checkedFile(root, ref.path, max);
  try {
    if (file.stat.size !== ref.size) fail('input size mismatch');
    const out = Buffer.alloc(ref.size); let offset = 0;
    while (offset < out.length) {
      const count = readSync(file.fd, out, offset, out.length - offset, null);
      if (!count) fail('input changed while reading');
      offset += count;
    }
    if (!unchanged(file.stat, fstatSync(file.fd)) || sha256(out) !== ref.sha256) fail('input identity changed');
    return out;
  } finally { closeSync(file.fd); }
}
function parseJson(input, label) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(input)); }
  catch { fail(`invalid ${label} JSON`); }
}
function ensureParent(path) { mkdirSync(dirname(path), { recursive: true, mode: 0o700 }); }

// Link into the private input mirror when possible. The opened inode is
// checked against the link and hashed; a cross-device source is streamed
// instead. stagePortableInputs later makes the final independent byte copy.
function mirrorFile(root, ref, dest, { integrity, allowEmpty = false } = {}) {
  inputRef(ref, 'input identity', allowEmpty);
  const source = checkedFile(root, ref.path, MAX_FILE, allowEmpty);
  let out;
  try {
    if (source.stat.size !== ref.size) fail('input size mismatch');
    ensureParent(dest);
    let linked = false, baseline = source.stat;
    try {
      linkSync(source.path, dest);
      const target = lstatSync(dest);
      if (target.isSymbolicLink() || !target.isFile() || target.dev !== source.stat.dev || target.ino !== source.stat.ino) fail('input changed during linking');
      // Creating a hard link legitimately changes the inode's ctime. Establish
      // the post-link baseline only after confirming that its content-facing
      // identity did not change, then detect later changes while hashing.
      baseline = fstatSync(source.fd);
      if (baseline.dev !== source.stat.dev || baseline.ino !== source.stat.ino || baseline.size !== source.stat.size || baseline.mtimeMs !== source.stat.mtimeMs) fail('input changed during linking');
      linked = true;
    } catch (error) {
      if (error?.message?.startsWith('PORTABLE_ASSEMBLY:')) throw error;
      if (error?.code !== 'EXDEV' && error?.code !== 'EPERM' && error?.code !== 'ENOTSUP') fail('cannot reserve staged input');
      out = openSync(dest, 'wx', 0o600);
    }
    const digest = createHash('sha256'), sri = createHash('sha512'), buffer = Buffer.alloc(CHUNK);
    let total = 0;
    while (total < source.stat.size) {
      const count = readSync(source.fd, buffer, 0, Math.min(buffer.length, source.stat.size - total), null);
      if (!count) fail('input changed while reading');
      const chunk = buffer.subarray(0, count); digest.update(chunk); sri.update(chunk);
      if (!linked) {
        let offset = 0;
        while (offset < count) { const written = writeSync(out, chunk, offset, count - offset, null); if (!written) fail('cannot copy staged input'); offset += written; }
      }
      total += count;
    }
    if (!unchanged(baseline, fstatSync(source.fd)) || total !== ref.size || digest.digest('hex') !== ref.sha256) fail('input identity changed');
    const actualIntegrity = `sha512-${sri.digest('base64')}`;
    if (integrity !== undefined && actualIntegrity !== integrity) fail('archive integrity mismatch');
  } finally {
    if (out !== undefined) closeSync(out);
    closeSync(source.fd);
  }
}
function mkdirSafe(root, path) {
  let current = root;
  for (const part of path.split('/')) {
    current = join(current, part);
    try {
      const stat = lstatSync(current);
      if (!stat.isDirectory() || stat.isSymbolicLink() || (process.platform !== 'win32' && ((stat.mode & 0o022) !== 0 || (process.getuid && stat.uid !== process.getuid())))) fail('unsafe output directory');
    } catch (error) {
      if (error?.code !== 'ENOENT') throw error;
      mkdirSync(current, { mode: 0o700 });
    }
  }
  return current;
}
function assertAbsent(path) {
  try { lstatSync(path); fail('run output already exists'); }
  catch (error) { if (error?.code !== 'ENOENT') throw error; }
}
function uniqueIds(values, expected, label) {
  if (values.length !== expected.length || new Set(values).size !== values.length || expected.some(id => !values.includes(id))) fail(`${label} inventory mismatch`);
}
function templates(root, manifest) {
  const entry = manifest.files?.find(item => item.path === TEMPLATE_SOURCE && item.type === 'file');
  if (!entry || !HASH.test(entry.sha256 ?? '')) fail('template source is absent from the staged manifest');
  const file = checkedFile(root, TEMPLATE_SOURCE, MAX_JSON);
  let content;
  try {
    const ref = { path: TEMPLATE_SOURCE, size: file.stat.size, sha256: entry.sha256 };
    closeSync(file.fd);
    content = new TextDecoder('utf-8', { fatal: true }).decode(bytes(root, ref));
  } catch (error) {
    try { closeSync(file.fd); } catch { /* already closed */ }
    if (error?.message?.startsWith('PORTABLE_ASSEMBLY:')) throw error;
    fail('invalid template inventory source');
  }
  const match = /\bexport\s+const\s+CREATE_AURA3D_TEMPLATES\s*=\s*\[([\s\S]*?)\]\s*as\s+const\s*;/.exec(content);
  if (!match) fail('template inventory is not a static literal');
  const names = [];
  const item = /\s*(?:"([a-z0-9][a-z0-9-]*)"|'([a-z0-9][a-z0-9-]*)')\s*(,|$)/gy;
  let offset = 0;
  while (offset < match[1].length) {
    if (/^\s*$/.test(match[1].slice(offset))) break;
    item.lastIndex = offset; const next = item.exec(match[1]);
    if (!next) fail('template inventory is not a static literal');
    names.push(next[1] ?? next[2]); offset = item.lastIndex;
    if (next[3] !== ',' && !/^\s*$/.test(match[1].slice(offset))) fail('invalid template inventory');
  }
  if (!names.length || new Set(names).size !== names.length || names.some(name => !ID.test(name))) fail('invalid template inventory');
  return names;
}
function archiveFields(value) {
  fields(value, ['resolved', 'origin', 'path', 'size', 'sha256', 'integrity'], 'archive input');
  if (typeof value.resolved !== 'string' || !value.resolved || !['supplied', 'candidate'].includes(value.origin) || !SRI.test(value.integrity ?? '')) fail('invalid archive input');
  if (Buffer.from(value.integrity.slice(7), 'base64').toString('base64') !== value.integrity.slice(7)) fail('invalid archive integrity');
  inputRef({ path: value.path, size: value.size, sha256: value.sha256 }, 'archive identity');
  if (value.resolved.startsWith('file:') !== (value.origin === 'candidate')) fail('local archive origin must be a candidate');
}
function ids(rows, label, validator = value => ID.test(value ?? '')) {
  const found = new Set();
  for (const row of rows) {
    if (!validator(row?.id) || found.has(row.id)) fail(`invalid or duplicate ${label} ID`);
    found.add(row.id);
  }
  return [...found];
}

/**
 * Assemble explicit inputs into the transport envelope. No archive admission
 * is implied. Example inventory supplied by the caller is checked again by
 * the source producer against the actual source-derived catalog.
 */
export function preparePortableInputs(options) {
  fields(options, ['root', 'inputRoot', 'runId', 'sourceManifestSha256', 'candidatePlanSha256', 'expectedExampleIds', 'consumers', 'examples', 'matrix', 'candidateReviews', 'candidateReviewEvidence'], 'assembly options');
  const root = rootDirectory(options.root), inputRoot = rootDirectory(options.inputRoot), runId = options.runId;
  if (!RUN.test(runId ?? '') || runId === '.' || runId === '..' || !HASH.test(options.sourceManifestSha256 ?? '') || !HASH.test(options.candidatePlanSha256 ?? '')) fail('invalid run or source identity');
  const report = `tests/reports/native-capabilities/${runId}`, side = `tests/reports/native-source-inputs/${runId}`;
  const sourcePath = `${report}/source-manifest.json`, planPath = `${report}/candidate-plan.json`;
  const fixedRef = (path, digest) => {
    const file = checkedFile(root, path, MAX_JSON);
    const ref = { path, size: file.stat.size, sha256: digest }; closeSync(file.fd);
    return ref;
  };
  const sourceRef = fixedRef(sourcePath, options.sourceManifestSha256), planRef = fixedRef(planPath, options.candidatePlanSha256);
  const sourceBytes = bytes(root, sourceRef), planBytes = bytes(root, planRef);
  const source = parseJson(sourceBytes, 'source manifest'), plan = parseJson(planBytes, 'candidate plan');
  if (!Array.isArray(source.files) || !Array.isArray(plan.packages) || !HASH.test(source.inputDigest ?? '')) fail('invalid staged source or candidate');
  const policy = source.files.find(entry => entry.path === POLICY && entry.type === 'file');
  if (!policy || !HASH.test(policy.sha256 ?? '')) fail('source policy is missing');
  const policyRef = fixedRef(POLICY, policy.sha256);
  bytes(root, policyRef);
  const requiredConsumers = ['launcher', ...templates(root, source), 'react-import'];
  const consumers = array(options.consumers, 'consumer projects', 512), examples = array(options.examples, 'example projects', 512);
  const matrix = array(options.matrix, 'matrix cells', 8), exampleIds = array(options.expectedExampleIds, 'expected example IDs', 512);
  if (exampleIds.some(id => typeof id !== 'string' || id.length > 256 || !EXAMPLE.test(id)) || new Set(exampleIds).size !== exampleIds.length) fail('invalid expected example inventory');
  uniqueIds(ids(consumers, 'consumer'), requiredConsumers, 'consumer');
  uniqueIds(ids(examples, 'example', value => typeof value === 'string' && value.length <= 256 && EXAMPLE.test(value)), exampleIds, 'example');
  const expectedCells = ['npm', 'pnpm'].flatMap(manager => [18, 19].flatMap(major => ['absent', 'present'].map(peer => ({ id: `${manager}-react${major}-peer-${peer}`, manager }))));
  uniqueIds(ids(matrix, 'matrix'), expectedCells.map(cell => cell.id), 'matrix');
  array(options.candidateReviews, 'candidate reviews', MAX_FILES, false);
  array(options.candidateReviewEvidence, 'candidate review evidence', MAX_FILES, false);

  const parent = mkdirSafe(root, 'tests/reports/native-source-inputs');
  const finalPath = join(parent, runId), lock = join(parent, `.${runId}.assembly-lock`);
  let temp, locked = false;
  try {
    mkdirSync(lock, { mode: 0o700 }); locked = true;
    assertAbsent(finalPath);
    temp = mkdtempSync(join(parent, '.portable-assembly-'));
    const inputMirror = join(temp, 'input'), destMirror = join(temp, 'output');
    mkdirSync(inputMirror, { mode: 0o700 }); mkdirSync(destMirror, { mode: 0o700 });
    const fixed = [sourceRef, planRef, policyRef];
    const candidates = new Map();
    for (const pkg of plan.packages) {
      if (!pkg || typeof pkg.tarball !== 'string' || !pkg.tarball.startsWith(`${report}/candidate-tarballs/`) || !HASH.test(pkg.sha256 ?? '') || !SRI.test(pkg.integrity ?? '') || candidates.has(pkg.tarball)) fail('invalid candidate archive inventory');
      const file = checkedFile(root, pkg.tarball, MAX_FILE), ref = { path: pkg.tarball, size: file.stat.size, sha256: pkg.sha256 };
      closeSync(file.fd); candidates.set(pkg.tarball, { ...ref, integrity: pkg.integrity });
    }
    if (!candidates.size) fail('candidate archive inventory is empty');
    for (const ref of [...fixed, ...candidates.values()]) {
      const { path, size, sha256: digest, integrity } = ref;
      for (const mirror of [inputMirror, destMirror]) mirrorFile(root, { path, size, sha256: digest }, join(mirror, path), { integrity });
    }
    mirrorFile(root, sourceRef, join(destMirror, '.native-source-manifest.json'));
    const records = new Map(), inspected = new Map(); let total = 0, duplicateIndex = 0;
    const record = (path, ref, sourceRoot = inputRoot, integrity, allowEmpty = false) => {
      safePath(path); inputRef(ref, 'supplied file', allowEmpty);
      if (!path.startsWith(`${side}/`) || path === `${side}/inputs.json`) fail('sidecar path is not run-scoped');
      const prior = records.get(path);
      if (prior) {
        if (prior.size !== ref.size || prior.sha256 !== ref.sha256) fail('conflicting sidecar identity');
        const key = `${sourceRoot}\0${ref.path}`;
        const seen = inspected.get(key);
        if (seen) {
          if (seen.size !== ref.size || seen.sha256 !== ref.sha256 || (integrity && seen.integrity && seen.integrity !== integrity)) fail('conflicting supplied input identity');
          if (integrity && !seen.integrity) {
            mirrorFile(sourceRoot, ref, join(temp, 'duplicate-inputs', String(duplicateIndex++)), { integrity, allowEmpty });
            seen.integrity = integrity;
          }
        } else {
          mirrorFile(sourceRoot, ref, join(temp, 'duplicate-inputs', String(duplicateIndex++)), { integrity, allowEmpty });
          inspected.set(key, { size: ref.size, sha256: ref.sha256, integrity });
        }
        return prior;
      }
      if (records.size >= MAX_FILES || total + ref.size > MAX_TOTAL) fail('sidecar bounds exceeded');
      mirrorFile(sourceRoot, ref, join(inputMirror, path), { integrity, allowEmpty });
      const key = `${sourceRoot}\0${ref.path}`;
      const seen = inspected.get(key);
      if (seen && (seen.size !== ref.size || seen.sha256 !== ref.sha256 || (integrity && seen.integrity && seen.integrity !== integrity))) fail('conflicting supplied input identity');
      inspected.set(key, { size: ref.size, sha256: ref.sha256, integrity: integrity ?? seen?.integrity });
      const value = { path, size: ref.size, sha256: ref.sha256 }; records.set(path, value); total += ref.size;
      return value;
    };
    const generated = (path, value) => {
      const data = jsonBytes(value);
      if (data.length > MAX_JSON || records.has(path) || records.size >= MAX_FILES || total + data.length > MAX_TOTAL) fail('generated metadata exceeds bounds');
      const dest = join(inputMirror, path); ensureParent(dest); writeFileSync(dest, data, { flag: 'wx', mode: 0o600 });
      const ref = { path, size: data.length, sha256: sha256(data) }; records.set(path, ref); total += data.length;
      return ref;
    };
    const projectFile = (path, ref) => record(path, inputRef(ref, 'project file'));
    const archives = (rows, kind) => {
      const result = [], seen = new Set();
      for (const row of array(rows, 'archive inputs')) {
        archiveFields(row);
        if (seen.has(row.resolved)) fail('duplicate archive resolution'); seen.add(row.resolved);
        const ref = { path: row.path, size: row.size, sha256: row.sha256 };
        let path;
        if (row.origin === 'candidate') {
          const candidate = candidates.get(row.path);
          if (!candidate || candidate.sha256 !== row.sha256 || candidate.size !== row.size || candidate.integrity !== row.integrity) fail('candidate archive does not match the plan');
          path = kind === 'matrix' ? `${side}/matrix/archives/${row.sha256}.tgz` : row.path;
          if (kind === 'matrix') record(path, ref, root, row.integrity);
        } else {
          path = kind === 'matrix' ? `${side}/matrix/archives/${row.sha256}.tgz` : `${side}/archives/${row.sha256}.tgz`;
          record(path, ref, inputRoot, row.integrity);
        }
        result.push(kind === 'example' ? { resolved: row.resolved, path } : { resolved: row.resolved, path, size: row.size, sha256: row.sha256, integrity: row.integrity });
      }
      return result.sort((a, b) => compare(a.resolved, b.resolved));
    };
    const consumerProjects = consumers.map(item => {
      fields(item, ['id', 'manifest', 'lockfile', 'archives', 'assets'], 'consumer project');
      const dir = `${side}/consumer/projects/${item.id}`;
      const manifest = projectFile(`${dir}/package.json`, item.manifest), lockfile = projectFile(`${dir}/package-lock.json`, item.lockfile);
      const targets = new Set();
      const assets = array(item.assets, 'consumer assets', MAX_FILES, false).map(asset => {
        fields(asset, ['target', 'file'], 'consumer asset'); safePath(asset.target);
        if (targets.has(asset.target)) fail('duplicate consumer asset target'); targets.add(asset.target);
        const ext = /\.(json|ya?ml)$/i.exec(asset.target)?.[0].toLowerCase() ?? '.bin';
        const ref = record(`${side}/consumer/assets/${asset.file.sha256}${ext}`, inputRef(asset.file, 'consumer asset file', true), inputRoot, undefined, true);
        return { target: asset.target, ...ref };
      }).sort((a, b) => compare(a.target, b.target));
      return { id: item.id, manifest, lockfile, archives: archives(item.archives, 'consumer'), assets };
    }).sort((a, b) => compare(a.id, b.id));
    const exampleManifests = [];
    const exampleProjects = examples.map(item => {
      fields(item, ['id', 'manifest', 'lockfile', 'archives'], 'example project');
      const key = sha256(Buffer.from(item.id)), dir = `${side}/examples/projects/${key}`;
      const manifest = projectFile(`${dir}/package.json`, item.manifest), lock = projectFile(`${dir}/package-lock.json`, item.lockfile);
      exampleManifests.push({ id: item.id, ...manifest });
      return { id: item.id, manifestSha256: manifest.sha256, lockPath: lock.path, lockSha256: lock.sha256, archives: archives(item.archives, 'example') };
    }).sort((a, b) => compare(a.id, b.id));
    exampleManifests.sort((a, b) => compare(a.id, b.id));
    const matrixCells = matrix.map(item => {
      fields(item, ['id', 'manager', 'manifest', 'lockfile', 'archives'], 'matrix cell');
      if (!expectedCells.some(cell => cell.id === item.id && cell.manager === item.manager)) fail('matrix manager mismatch');
      const dir = `${side}/matrix/cells/${item.id}`;
      const manifest = projectFile(`${dir}/package.json`, item.manifest);
      const lockfile = projectFile(`${dir}/${item.manager === 'npm' ? 'package-lock.json' : 'pnpm-lock.yaml'}`, item.lockfile);
      return { id: item.id, manager: item.manager, manifest, lockfile, archives: archives(item.archives, 'matrix') };
    }).sort((a, b) => compare(a.id, b.id));
    const candidateReviews = options.candidateReviews.map(ref => {
      inputRef(ref, 'candidate review');
      const retained = record(`${side}/candidate-reviews/${ref.sha256}.json`, ref);
      return { path: retained.path, sha256: retained.sha256 };
    }).sort((a, b) => compare(a.path, b.path));
    const candidateReviewEvidence = options.candidateReviewEvidence.map(item => {
      fields(item, ['path', 'file'], 'candidate review evidence'); safePath(item.path);
      if (!item.path.startsWith(`${side}/candidate-review-evidence/`)) fail('candidate review evidence is not run-scoped');
      const retained = record(item.path, inputRef(item.file, 'candidate review evidence file'));
      return { path: retained.path, sha256: retained.sha256 };
    }).sort((a, b) => compare(a.path, b.path));
    if (new Set(candidateReviews.map(ref => ref.path)).size !== candidateReviews.length || new Set(candidateReviewEvidence.map(ref => ref.path)).size !== candidateReviewEvidence.length) fail('duplicate candidate review input');
    const consumer = generated(`${side}/consumer-bundle.json`, { schema: 'aura3d.portable-consumer-input/1', candidatePlanSha256: planRef.sha256, sourceManifestSha256: sourceRef.sha256, projects: consumerProjects });
    const example = generated(`${side}/example-bundle.json`, { schema: 'aura3d.native-example-locks/1', runId, candidateSha256: planRef.sha256, sourceInputDigest: source.inputDigest, examples: exampleProjects });
    const matrixBundle = generated(`${side}/matrix/bundle.json`, { schema: 'aura3d.native-matrix-input/1', candidatePlanSha256: planRef.sha256, sourceManifest: { path: sourcePath, sha256: sourceRef.sha256 }, cells: matrixCells });
    const envelope = { schema: 'aura3d.native-portable-inputs/1', runId,
      sourceManifest: { path: sourcePath, sha256: sourceRef.sha256 }, candidatePlan: { path: planPath, sha256: planRef.sha256 },
      admissionPolicy: { path: POLICY, sha256: policyRef.sha256 },
      consumerBundle: { path: consumer.path, sha256: consumer.sha256 }, exampleBundle: { path: example.path, sha256: example.sha256 },
      matrixBundle: { path: matrixBundle.path, sha256: matrixBundle.sha256 }, exampleManifests, candidateReviews, candidateReviewEvidence,
      files: [...records.values()].sort((a, b) => compare(a.path, b.path)) };
    const envelopeBytes = jsonBytes(envelope), inputsPath = `${side}/inputs.json`;
    if (envelopeBytes.length > MAX_JSON) fail('input envelope exceeds bounds');
    const inputPath = join(inputMirror, inputsPath); ensureParent(inputPath); writeFileSync(inputPath, envelopeBytes, { flag: 'wx', mode: 0o600 });
    const checked = stagePortableInputs({ root: inputMirror, dest: destMirror, runId, sourceManifestPath: sourcePath, candidatePlanPath: planPath, inputsPath });
    if (checked.inputs.path !== inputsPath || checked.inputs.sha256 !== sha256(envelopeBytes)) fail('staged envelope identity mismatch');
    assertAbsent(finalPath);
    renameSync(join(destMirror, side), finalPath);
    return Object.freeze({ runId, inputs: Object.freeze({ path: inputsPath, sha256: checked.inputs.sha256 }), sourceManifest: Object.freeze({ path: sourcePath, sha256: sourceRef.sha256 }), candidatePlan: Object.freeze({ path: planPath, sha256: planRef.sha256 }), admission: 'not-verified' });
  } catch (error) {
    if (error?.message?.startsWith('PORTABLE_ASSEMBLY:') || error?.message?.startsWith('PORTABLE_INPUTS:')) throw error;
    if (error?.code === 'EEXIST') fail('run output or assembly lock already exists');
    fail('portable assembly failed');
  } finally {
    if (temp) rmSync(temp, { recursive: true, force: true });
    if (locked) rmSync(lock, { recursive: true, force: true });
    // Publication is one rename after validation; an unsuccessful attempt has
    // no run-scoped output directory. Never remove a preexisting destination.
  }
}

// The command consumes one explicit canonical JSON descriptor and performs no
// subprocess, network, package resolution, review creation or installation.
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 5 || !isAbsolute(process.argv[2]) || !isAbsolute(process.argv[3])) fail('usage: node prepare-portable-inputs.mjs <source-root> <input-root> <descriptor-relative-path>');
    const root = rootDirectory(process.argv[2]), inputRoot = rootDirectory(process.argv[3]), path = safePath(process.argv[4]);
    const file = checkedFile(inputRoot, path, MAX_JSON);
    let descriptor;
    try {
      const data = Buffer.alloc(file.stat.size); let offset = 0;
      while (offset < data.length) { const count = readSync(file.fd, data, offset, data.length - offset, null); if (!count) fail('descriptor changed'); offset += count; }
      if (!unchanged(file.stat, fstatSync(file.fd))) fail('descriptor changed');
      descriptor = parseJson(data, 'descriptor');
      if (!jsonBytes(descriptor).equals(data)) fail('descriptor must use canonical JSON formatting');
    } finally { closeSync(file.fd); }
    const result = preparePortableInputs({ ...descriptor, root, inputRoot });
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (error) {
    process.stderr.write(`${error instanceof Error ? error.message : 'PORTABLE_ASSEMBLY: failed'}\n`); process.exitCode = 1;
  }
}
