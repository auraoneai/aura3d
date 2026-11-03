/** Offline provenance and request contract for the gated external codec cell. */
import { createHash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { gunzipSync } from 'node:zlib';

export const EXTERNAL_CODEC_POLICY_PATH = 'tests/acceptance/gltf-external-codec-policy.json';
export const EXTERNAL_CODEC_TEST_PATH = 'tests/acceptance/gltf-external-decoder-fixtures.test.ts';
export const EXTERNAL_CODEC_CONFIG_PATH = 'tests/acceptance/external-codec.vitest.config.ts';
export const EXTERNAL_CODEC_SOURCE_TEST_PATH = 'tests/assets/gltf-optional-external-decoders.test.ts';
export const EXTERNAL_CODEC_CONTRACT_TEST_PATH = 'tests/unit/tools/native-external-codec-contract.test.ts';
export const EXTERNAL_CODEC_ASSERTION_IDS = Object.freeze([
  `${EXTERNAL_CODEC_TEST_PATH}::external glTF decoder fixture acceptance loads the Khronos MeshoptCubeTest asset with the real meshoptimizer package`,
  `${EXTERNAL_CODEC_TEST_PATH}::external glTF decoder fixture acceptance loads the Khronos Duck Draco asset with the real draco3d package`
].sort());

const REVISION = '2bac6f8c57bf471df0d2a1e8a8ec023c7801dddf';
const RAW_ROOT = `https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/${REVISION}/`;
const HASH256 = /^[a-f0-9]{64}$/;
const HASH160 = /^[a-f0-9]{40}$/;
const RUN_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const MAX_POLICY_BYTES = 64 * 1024;
const POLICY = {
  schema: 'aura3d.external-codec-policy/1',
  repository: 'https://github.com/KhronosGroup/glTF-Sample-Assets', revision: REVISION,
  rawOrigin: 'https://raw.githubusercontent.com',
  limits: { maxDocumentBytes: 4194304, maxResourceBytes: 67108864, maxTotalBytes: 134217728, maxResources: 64, maxProofBytes: 16777216 },
  fixtures: [
    { id: 'meshopt-cube', codec: 'meshoptimizer', documentPath: 'Models/MeshoptCubeTest/glTF/MeshoptCubeTest.gltf',
      documentSha256: '8721150e3409425acf83aa21986e55880360ab084c17e96409c25fac53477f72', license: 'CC0-1.0',
      assertionId: `${EXTERNAL_CODEC_TEST_PATH}::external glTF decoder fixture acceptance loads the Khronos MeshoptCubeTest asset with the real meshoptimizer package` },
    { id: 'duck-draco', codec: 'draco3d', documentPath: 'Models/Duck/glTF-Draco/Duck.gltf', documentSha256: null,
      license: 'SCEA validation only',
      assertionId: `${EXTERNAL_CODEC_TEST_PATH}::external glTF decoder fixture acceptance loads the Khronos Duck Draco asset with the real draco3d package` }
  ]
};

function must(ok, message) { if (!ok) throw new Error(`EXTERNAL_CODEC_UNAVAILABLE: ${message}`); }
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const gitHash = (kind, bytes) => createHash('sha1').update(`${kind} ${bytes.length}\0`).update(bytes).digest('hex');
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function equalSet(left, right) {
  return Array.isArray(left) && left.length === right.length && new Set(left).size === left.length && [...left].sort().every((value, index) => value === [...right].sort()[index]);
}
function bytesOf(value, label, maxBytes) {
  must(value instanceof Uint8Array && value.byteLength <= maxBytes, `${label} is missing or too large`);
  return Buffer.from(value);
}
function base64(value, label, maxBytes) {
  must(typeof value === 'string' && value.length <= Math.ceil(maxBytes / 3) * 4 && /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value), `invalid ${label}`);
  const bytes = Buffer.from(value, 'base64');
  must(bytes.length <= maxBytes && bytes.toString('base64') === value, `invalid ${label}`);
  return bytes;
}
function safeRepoPath(path) {
  must(typeof path === 'string' && path.length > 0 && path.length <= 1024 && !isAbsolute(path) && !path.includes('\\') &&
    !/[\x00-\x1f\x7f]/.test(path) && path.split('/').every(part => part && part !== '.' && part !== '..'), 'unsafe repository path');
  return path;
}
function safeLocalPath(path, runId) {
  safeRepoPath(path);
  must(path.startsWith(`tests/reports/native-external-codec-inputs/${runId}/assets/`), 'fixture bytes are outside the run-scoped inputs');
  return path;
}
function parseJson(bytes, label) {
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new Error(`EXTERNAL_CODEC_UNAVAILABLE: invalid ${label}`); }
}

// Compare the restored files with the independently checked npm archives, not
// with a receipt supplied by the caller. No package code runs in this check.
const CODEC_MATRIX_PROJECT = 'npm-react19-peer-present';
const MAX_PACKAGE_ARCHIVE = 64 * 1024 * 1024;
const MAX_PACKAGE_EXPANDED = 256 * 1024 * 1024;
const MAX_PACKAGE_ENTRIES = 200000;
const MAX_INSTALLED_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_INSTALLED_ENTRIES = 1000000;

function tarOctal(bytes) {
  const text = bytes.toString('ascii').replace(/\0.*$/, '').trim();
  must(!text || /^[0-7]+$/.test(text), 'invalid npm tar number');
  const value = text ? Number.parseInt(text, 8) : 0;
  must(Number.isSafeInteger(value) && value >= 0, 'invalid npm tar number');
  return value;
}
function tarText(bytes) {
  const end = bytes.indexOf(0);
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, end < 0 ? bytes.length : end)); }
  catch { throw new Error('EXTERNAL_CODEC_UNAVAILABLE: invalid npm tar text'); }
}
function tarPaxPath(bytes) {
  let index = 0, path;
  while (index < bytes.length) {
    const space = bytes.indexOf(32, index);
    must(space > index, 'invalid npm PAX record');
    const length = bytes.subarray(index, space).toString('ascii');
    must(/^[1-9][0-9]*$/.test(length), 'invalid npm PAX length');
    const end = index + Number(length);
    must(Number.isSafeInteger(end) && end <= bytes.length && end > space + 1 && bytes[end - 1] === 10, 'invalid npm PAX record');
    const record = tarText(bytes.subarray(space + 1, end - 1)), equals = record.indexOf('=');
    must(equals > 0, 'invalid npm PAX value');
    const key = record.slice(0, equals), value = record.slice(equals + 1);
    if (key === 'path') { must(path === undefined, 'duplicate npm PAX path'); path = value; }
    else must(['mtime', 'atime', 'ctime', 'uid', 'gid', 'uname', 'gname'].includes(key), 'unsupported npm PAX value');
    index = end;
  }
  return path;
}
function npmArchiveFiles(input) {
  const bytes = bytesOf(input, 'npm archive', MAX_PACKAGE_ARCHIVE);
  let tar;
  try { tar = gunzipSync(bytes, { maxOutputLength: MAX_PACKAGE_EXPANDED }); }
  catch { throw new Error('EXTERNAL_CODEC_UNAVAILABLE: invalid or oversized npm archive'); }
  const files = new Map(), dirs = new Set(), seen = new Set();
  let offset = 0, entries = 0, pendingPath, terminal = false;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) {
      must(tar.length % 512 === 0 && tar.subarray(offset).every(byte => byte === 0), 'invalid npm tar trailer');
      terminal = true; break;
    }
    must(++entries <= MAX_PACKAGE_ENTRIES, 'npm tar entry limit exceeded');
    let checksum = 0;
    for (let i = 0; i < 512; i++) checksum += i >= 148 && i < 156 ? 32 : header[i];
    must(checksum === tarOctal(header.subarray(148, 156)), 'npm tar checksum mismatch');
    const size = tarOctal(header.subarray(124, 136)), body = offset + 512, end = body + size;
    must(Number.isSafeInteger(end) && end <= tar.length, 'truncated npm tar');
    const type = String.fromCharCode(header[156] || 48);
    if (type === 'x') {
      must(pendingPath === undefined && size <= 1024 * 1024, 'invalid npm PAX entry');
      pendingPath = tarPaxPath(tar.subarray(body, end)) ?? '';
    } else {
      must(type === '0' || type === '5', 'unsupported npm tar entry');
      must(type !== '5' || size === 0, 'invalid npm tar directory');
      const prefix = tarText(header.subarray(345, 500)), name = tarText(header.subarray(0, 100));
      const path = (pendingPath || (prefix ? `${prefix}/${name}` : name)).replace(/^\.\//, '').replace(/\/$/, '');
      pendingPath = undefined;
      safeRepoPath(path);
      const parts = path.split('/');
      must(parts[0] === 'package' && !parts.includes('node_modules') && !parts.includes('.git') && !seen.has(path), 'unsafe or duplicate npm tar path');
      seen.add(path);
      const rel = parts.slice(1).join('/');
      if (!rel) must(type === '5', 'invalid npm tar root');
      else {
        for (let i = 1; i < parts.length - 1; i++) dirs.add(parts.slice(1, i + 1).join('/'));
        if (type === '5') dirs.add(rel);
        else files.set(rel, { size, sha256: sha256(tar.subarray(body, end)) });
      }
    }
    offset = body + Math.ceil(size / 512) * 512;
  }
  must(terminal && pendingPath === undefined && files.has('package.json') && [...dirs].every(path => !files.has(path)), 'incomplete or conflicting npm tar');
  return { files, dirs };
}

function hashCodecProject(project) {
  const digest = createHash('sha256');
  function walk(dir, prefix) {
    for (const entry of readdirSync(dir).sort()) {
      if (!prefix && entry === 'node_modules') continue;
      const name = prefix ? `${prefix}/${entry}` : entry, full = join(dir, entry), stat = lstatSync(full);
      digest.update(name).update('\0');
      if (stat.isSymbolicLink()) {
        const target = realpathSync(full);
        must(target === project || target.startsWith(`${project}${sep}`), 'candidate project symlink escaped isolation');
        digest.update('link\0').update(readlinkSync(full));
      } else if (stat.isDirectory()) { digest.update('directory\0'); walk(full, name); }
      else if (stat.isFile()) digest.update('file\0').update(readFileSync(full));
      else must(false, 'unsupported candidate project entry');
      digest.update('\0');
    }
  }
  walk(project, '');
  return digest.digest('hex');
}

/** Recompute the exact project and installed package bytes against the gated archives. */
export function validateExternalCodecInstalledProject({ root, projectPath, project, packageLock, archives, readArchive }) {
  must(typeof root === 'string' && typeof projectPath === 'string' && isAbsolute(projectPath) && typeof readArchive === 'function', 'candidate project input is missing');
  const source = realpathSync(root), consumer = realpathSync(projectPath);
  must(consumer === resolve(projectPath) && consumer !== source && !consumer.startsWith(`${source}${sep}`) && lstatSync(consumer).isDirectory(), 'candidate project is not isolated');
  for (let parent = dirname(consumer); ; parent = dirname(parent)) {
    must(!existsSync(join(parent, 'node_modules')), 'candidate can resolve packages outside its isolated project');
    if (dirname(parent) === parent) break;
  }
  must(project?.id === CODEC_MATRIX_PROJECT && HASH256.test(project.projectSha256 || '') && hashCodecProject(consumer) === project.projectSha256, 'candidate project inputs differ from the gate');
  must(packageLock?.lockfileVersion === 3 && packageLock.packages && typeof packageLock.packages === 'object' && Array.isArray(archives), 'candidate package lock is missing');
  const lock = packageLock.packages, byResolution = new Map();
  for (const item of archives) {
    must(item && typeof item.resolved === 'string' && typeof item.path === 'string' && !byResolution.has(item.resolved), 'ambiguous npm archive inventory');
    byResolution.set(item.resolved, item.path);
  }
  const lockedPaths = Object.keys(lock).filter(Boolean).sort();
  must(lockedPaths.length > 0 && lockedPaths.length <= 10000, 'candidate package inventory is empty or too large');
  for (const path of lockedPaths) {
    safeRepoPath(path);
    must(/^node_modules\/(?:@[^/]+\/)?[^/]+(?:\/node_modules\/(?:@[^/]+\/)?[^/]+)*$/.test(path), 'invalid installed package path');
  }
  const archiveCache = new Map(), verifiedFiles = new Set(), observed = new Set(), binTargets = [], inventory = [];
  let totalBytes = 0, totalEntries = 0;
  const count = size => {
    totalEntries += 1; totalBytes += size;
    must(totalEntries <= MAX_INSTALLED_ENTRIES && totalBytes <= MAX_INSTALLED_BYTES, 'installed candidate byte limit exceeded');
  };
  function inspectPackage(path) {
    const entry = lock[path], resolved = entry?.resolved, archivePath = byResolution.get(resolved);
    must(archivePath && typeof entry.integrity === 'string', 'installed package has no verified archive');
    let archive = archiveCache.get(resolved);
    if (!archive) {
      const bytes = bytesOf(readArchive(archivePath, MAX_PACKAGE_ARCHIVE), 'npm archive', MAX_PACKAGE_ARCHIVE);
      must(`sha512-${createHash('sha512').update(bytes).digest('base64')}` === entry.integrity, 'installed archive integrity changed');
      archive = { ...npmArchiveFiles(bytes), integrity: entry.integrity }; archiveCache.set(resolved, archive);
    }
    // The same resolution can occur at several paths, but must retain its lock integrity.
    must(archive.integrity === entry.integrity, 'inconsistent installed archive integrity');
    const digest = createHash('sha256'), foundFiles = new Set(), foundDirs = new Set();
    function walk(dir, prefix) {
      for (const name of readdirSync(dir).sort()) {
        if (!prefix && name === 'node_modules') continue;
        const rel = prefix ? `${prefix}/${name}` : name, full = join(dir, name), stat = lstatSync(full);
        count(stat.isFile() ? stat.size : 0);
        must(!stat.isSymbolicLink(), 'symlink in installed package');
        if (stat.isDirectory()) { must(archive.dirs.has(rel), 'extra installed package directory'); foundDirs.add(rel); walk(full, rel); }
        else {
          const expected = archive.files.get(rel);
          must(stat.isFile() && expected && stat.size === expected.size, 'extra or changed installed package file');
          const actual = sha256(readFileSync(full));
          must(actual === expected.sha256, 'installed package bytes differ from archive');
          foundFiles.add(rel); verifiedFiles.add(realpathSync(full));
          digest.update(rel).update('\0').update(actual).update('\0');
        }
      }
    }
    walk(join(consumer, ...path.split('/')), '');
    must(foundFiles.size === archive.files.size && foundDirs.size === archive.dirs.size, 'installed package is missing archive entries');
    observed.add(path);
    inventory.push({ path, integrity: entry.integrity, filesSha256: digest.digest('hex') });
    const nested = join(consumer, ...path.split('/'), 'node_modules');
    if (readdirSync(join(consumer, ...path.split('/'))).includes('node_modules')) inspectModules(nested, `${path}/node_modules`);
  }
  function inspectModules(dir, prefix) {
    const stat = lstatSync(dir);
    must(stat.isDirectory() && !stat.isSymbolicLink(), 'invalid candidate node_modules');
    for (const name of readdirSync(dir).sort()) {
      const full = join(dir, name), item = lstatSync(full);
      if (name === '.bin') {
        must(item.isDirectory() && !item.isSymbolicLink(), 'invalid npm executable directory');
        for (const binary of readdirSync(full)) {
          const link = join(full, binary);
          must(lstatSync(link).isSymbolicLink(), 'unverified npm executable');
          binTargets.push(realpathSync(link));
        }
      } else if (name === '.package-lock.json') must(item.isFile() && !item.isSymbolicLink(), 'invalid npm metadata');
      else if (name.startsWith('@')) {
        must(item.isDirectory() && !item.isSymbolicLink(), 'invalid npm scope');
        for (const child of readdirSync(full).sort()) {
          const path = `${prefix}/${name}/${child}`, childStat = lstatSync(join(full, child));
          must(Object.hasOwn(lock, path) && childStat.isDirectory() && !childStat.isSymbolicLink(), 'unlocked installed package');
          inspectPackage(path);
        }
      } else {
        const path = `${prefix}/${name}`;
        must(Object.hasOwn(lock, path) && item.isDirectory() && !item.isSymbolicLink(), 'unlocked installed package');
        inspectPackage(path);
      }
    }
  }
  inspectModules(join(consumer, 'node_modules'), 'node_modules');
  for (const path of lockedPaths) if (!observed.has(path)) {
    must(lock[path]?.optional === true, 'required locked package is not installed');
    inventory.push({ path, integrity: lock[path].integrity, absentOptional: true });
  }
  must(binTargets.every(target => verifiedFiles.has(target)), 'npm executable points outside verified installed files');
  inventory.sort((a, b) => a.path.localeCompare(b.path));
  return { projectRealpath: consumer, installedTreeSha256: sha256(Buffer.from(canonical(inventory))) };
}

/** A context is a run binding, never a substitute for checking installed bytes. */
export function validateExternalCodecRunContext({ context, runId, gate, gatePath, gateSha256, lockPath, lockSha256, npmPath, npmSha256, projectRealpath, installedTreeSha256 }) {
  must(RUN_ID.test(runId || '') && HASH256.test(gateSha256 || '') && HASH256.test(lockSha256 || '') && HASH256.test(npmSha256 || '') && HASH256.test(installedTreeSha256 || ''), 'candidate context inputs are incomplete');
  const expected = { schema: 'aura3d.external-codec-candidate-context/1', runId,
    gate: { path: gatePath, sha256: gateSha256 }, freezeCommit: gate?.freezeCommit, sourceInputDigest: gate?.sourceInputDigest,
    candidatePlan: gate?.candidatePlan, fixtureLock: { path: lockPath, sha256: lockSha256 }, npmInventory: { path: npmPath, sha256: npmSha256 },
    matrixProject: CODEC_MATRIX_PROJECT, projectRealpath, installedTreeSha256 };
  must(typeof projectRealpath === 'string' && isAbsolute(projectRealpath) && canonical(context) === canonical(expected), 'candidate context does not match verified inputs and installed bytes');
  return expected;
}

/** Validate the immutable, source-controlled policy without reading any assets. */
export function validateExternalCodecPolicy(policyBytes) {
  const bytes = bytesOf(policyBytes, 'codec policy', MAX_POLICY_BYTES);
  const policy = parseJson(bytes, 'codec policy');
  must(canonical(policy) === canonical(POLICY), 'codec policy differs from the fixed source contract');
  return { policy, sha256: sha256(bytes) };
}

function parseTree(bytes) {
  const entries = new Map();
  for (let offset = 0; offset < bytes.length;) {
    const space = bytes.indexOf(0x20, offset), nul = bytes.indexOf(0, space + 1);
    must(space > offset && nul > space + 1 && nul + 21 <= bytes.length, 'malformed Git tree');
    const mode = bytes.subarray(offset, space).toString('ascii');
    const rawName = bytes.subarray(space + 1, nul), name = rawName.toString('utf8');
    must(Buffer.from(name, 'utf8').equals(rawName) && name !== '.' && name !== '..' && !name.includes('/') && !name.includes('\\') && !/[\x00-\x1f\x7f]/.test(name) && !entries.has(name), 'invalid Git tree entry');
    must(['40000', '040000', '100644', '100755', '120000', '160000'].includes(mode), 'unsupported Git tree mode');
    entries.set(name, { mode, oid: bytes.subarray(nul + 1, nul + 21).toString('hex') });
    offset = nul + 21;
  }
  return entries;
}

/** Verify Git Merkle objects against a caller-supplied trusted commit ID. */
export function verifyExternalCodecGitProof(provenance, expectedRevision, limits) {
  must(HASH160.test(expectedRevision || '') && provenance && provenance.revision === expectedRevision && Array.isArray(provenance.trees) && provenance.trees.length > 0 && provenance.trees.length <= 4096, 'pinned Git proof is missing');
  let proofBytes = 0;
  const commit = base64(provenance.commitObjectBase64, 'commit object', limits.maxProofBytes);
  proofBytes += commit.length;
  must(gitHash('commit', commit) === expectedRevision, 'Git commit does not match the pinned revision');
  const match = /^tree ([a-f0-9]{40})\n/.exec(commit.toString('utf8'));
  must(match, 'Git commit tree is missing');
  const trees = new Map();
  for (const item of provenance.trees) {
    must(item && HASH160.test(item.oid || '') && !trees.has(item.oid), 'invalid or duplicate Git tree');
    const bytes = base64(item.bytesBase64, 'tree object', limits.maxProofBytes);
    proofBytes += bytes.length;
    must(proofBytes <= limits.maxProofBytes && gitHash('tree', bytes) === item.oid, 'Git tree proof hash mismatch');
    trees.set(item.oid, parseTree(bytes));
  }
  must(trees.has(match[1]), 'Git root tree is missing');
  return path => {
    const parts = safeRepoPath(path).split('/');
    let oid = match[1];
    for (let index = 0; index < parts.length; index += 1) {
      const entry = trees.get(oid)?.get(parts[index]);
      must(entry, `missing Git proof for ${path}`);
      if (index === parts.length - 1) {
        must(entry.mode === '100644' || entry.mode === '100755', `fixture is not a regular Git blob: ${path}`);
        return entry.oid;
      }
      must(entry.mode === '40000' || entry.mode === '040000', `fixture parent is not a Git tree: ${path}`);
      oid = entry.oid;
    }
    throw new Error('EXTERNAL_CODEC_UNAVAILABLE: invalid fixture path');
  };
}

function dependencyPath(uri, fixture) {
  must(typeof uri === 'string' && uri.length > 0 && uri.length <= 2048, 'invalid glTF dependency URI');
  if (uri.startsWith('data:')) return null; // Its bytes are already bound by the document blob.
  must(!/^[a-z][a-z0-9+.-]*:/i.test(uri) && !uri.startsWith('/') && !uri.includes('\\') && !/[?#\x00-\x1f\x7f]/.test(uri), 'unsupported glTF dependency URI');
  for (const segment of uri.split('/')) {
    let decoded;
    try { decoded = decodeURIComponent(segment); } catch { throw new Error('EXTERNAL_CODEC_UNAVAILABLE: invalid dependency encoding'); }
    must(!decoded.includes('/') && !decoded.includes('\\') && !/[\x00-\x1f\x7f]/.test(decoded), 'unsafe encoded dependency URI');
  }
  const base = new URL(fixture.documentPath, RAW_ROOT), result = new URL(uri, base);
  const prefix = new URL(`Models/${fixture.id === 'meshopt-cube' ? 'MeshoptCubeTest' : 'Duck'}/`, RAW_ROOT);
  must(result.origin === prefix.origin && result.pathname.startsWith(prefix.pathname) && !result.search && !result.hash, 'dependency escapes its pinned fixture');
  const path = decodeURIComponent(result.pathname.slice(new URL(RAW_ROOT).pathname.length));
  return safeRepoPath(path);
}

function documentDependencies(documentBytes, fixture) {
  const json = parseJson(documentBytes, 'glTF document');
  must(json && typeof json === 'object' && !Array.isArray(json) && typeof json.asset?.version === 'string' && json.asset.version.startsWith('2.'), 'unsupported glTF document');
  const paths = new Set();
  for (const key of ['buffers', 'images']) {
    must(json[key] === undefined || Array.isArray(json[key]), `invalid glTF ${key}`);
    for (const item of json[key] ?? []) {
      must(item && typeof item === 'object' && !Array.isArray(item), `invalid glTF ${key} entry`);
      if (item.uri === undefined) continue;
      const path = dependencyPath(item.uri, fixture);
      if (path) paths.add(path);
    }
  }
  return [...paths].sort();
}

function expectedUrl(path) { return new URL(path.split('/').map(encodeURIComponent).join('/'), RAW_ROOT).href; }
function verifyRecord(record, expectedPath, runId, blobOid, readBytes, limits, document) {
  must(record && record.repoPath === expectedPath && record.url === expectedUrl(expectedPath) && HASH256.test(record.sha256 || '') && Number.isSafeInteger(record.byteLength) && record.byteLength >= 0, 'invalid fixture lock entry');
  const maxBytes = document ? limits.maxDocumentBytes : limits.maxResourceBytes;
  must(record.byteLength <= maxBytes, 'fixture exceeds its byte limit');
  const localPath = safeLocalPath(record.localPath, runId);
  const bytes = bytesOf(readBytes(localPath, maxBytes), 'retained fixture bytes', maxBytes);
  must(bytes.length === record.byteLength && sha256(bytes) === record.sha256, 'retained fixture bytes differ from the lock');
  if (record.lfsPointerBase64 !== undefined) {
    const pointer = base64(record.lfsPointerBase64, 'Git LFS pointer', 4096);
    must(gitHash('blob', pointer) === blobOid, 'Git LFS pointer does not match the pinned tree');
    const match = /^version https:\/\/git-lfs\.github\.com\/spec\/v1\noid sha256:([a-f0-9]{64})\nsize (0|[1-9][0-9]*)\n?$/.exec(pointer.toString('utf8'));
    must(match && match[1] === record.sha256 && Number(match[2]) === record.byteLength, 'Git LFS content does not match its pointer');
  } else {
    must(!bytes.subarray(0, 42).toString('utf8').startsWith('version https://git-lfs.github.com/spec/v1'), 'Git LFS content is unavailable');
    must(gitHash('blob', bytes) === blobOid, 'fixture does not match the pinned Git tree');
  }
  return { repoPath: expectedPath, url: record.url, sha256: record.sha256, byteLength: record.byteLength, localPath, bytes };
}

/** Verify a fixture closure against an already authenticated tree lookup. */
export function validateExternalCodecFixtureRecords({ policy, runId, fixtures: lockedFixtures, treeBlob, readBytes }) {
  must(policy && Array.isArray(policy.fixtures) && policy.fixtures.length === 2 && policy.limits && RUN_ID.test(runId || '') &&
    typeof treeBlob === 'function' && typeof readBytes === 'function', 'fixture closure inputs are unavailable');
  must(Array.isArray(lockedFixtures) && lockedFixtures.length === policy.fixtures.length && equalSet(lockedFixtures.map(fixture => fixture?.id), policy.fixtures.map(fixture => fixture.id)), 'fixture lock inventory differs');
  const localPaths = new Set(), urls = new Set();
  let totalBytes = 0, resourceCount = 0;
  const fixtures = policy.fixtures.map(fixture => {
    const item = lockedFixtures.find(entry => entry.id === fixture.id);
    must(Array.isArray(item?.dependencies), 'fixture dependencies are unavailable');
    const document = verifyRecord(item.document, fixture.documentPath, runId, treeBlob(fixture.documentPath), readBytes, policy.limits, true);
    if (fixture.documentSha256 !== null) must(document.sha256 === fixture.documentSha256, 'document differs from the independently pinned SHA-256');
    const expected = documentDependencies(document.bytes, fixture);
    must(equalSet(item.dependencies.map(entry => entry?.repoPath), expected), 'fixture dependency closure differs');
    const dependencies = expected.map(path => verifyRecord(item.dependencies.find(entry => entry.repoPath === path), path, runId, treeBlob(path), readBytes, policy.limits, false));
    for (const record of [document, ...dependencies]) {
      must(!localPaths.has(record.localPath) && !urls.has(record.url), 'duplicate fixture input');
      localPaths.add(record.localPath); urls.add(record.url); totalBytes += record.byteLength; resourceCount += 1;
      must(totalBytes <= policy.limits.maxTotalBytes && resourceCount <= policy.limits.maxResources, 'fixture input budget exceeded');
    }
    const strip = ({ bytes: _bytes, ...record }) => record;
    return { id: fixture.id, codec: fixture.codec, document: strip(document), dependencies: dependencies.map(strip) };
  });
  return { fixtures, inputPaths: [...localPaths].sort(), limits: { ...policy.limits } };
}

/**
 * Validate a candidate-bound offline fixture lock and Git proof. `readBytes`
 * must synchronously read regular in-root files without following symlinks.
 * No network or process is started by this function.
 */
export function validateExternalCodecInputs({ policyBytes, gate, gatePath, gateSha256, lock, readBytes }) {
  must(typeof readBytes === 'function', 'fixture reader is unavailable');
  const { policy, sha256: policySha256 } = validateExternalCodecPolicy(policyBytes);
  must(HASH256.test(gateSha256 || '') && typeof gatePath === 'string' && gatePath.length > 0 && gate &&
    gate.status === 'CODE_COMPLETE_GO' && /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(gate.freezeCommit || '') &&
    HASH256.test(gate.sourceInputDigest || '') && gate.candidatePlan && typeof gate.candidatePlan.path === 'string' &&
    HASH256.test(gate.candidatePlan.sha256 || ''), 'valid candidate gate is required');
  const cell = gate.deferredExternalCodecTests;
  must(cell?.schema === 'aura3d.external-codec-fixture-inventory/1' && cell.kind === 'external-codec-fixtures' && cell.path === EXTERNAL_CODEC_TEST_PATH &&
    cell.phase === 'acceptance' && cell.status === 'not-run' && cell.currentCandidateBrowserReceipt === false && equalSet(cell.assertionIds, EXTERNAL_CODEC_ASSERTION_IDS) &&
    HASH256.test(cell.sha256 || '') && cell.policy?.path === EXTERNAL_CODEC_POLICY_PATH && cell.policy.sha256 === policySha256 &&
    cell.config?.path === EXTERNAL_CODEC_CONFIG_PATH && HASH256.test(cell.config.sha256 || '') &&
    cell.sourceTest?.path === EXTERNAL_CODEC_SOURCE_TEST_PATH && HASH256.test(cell.sourceTest.sha256 || '') &&
    cell.contractTest?.path === EXTERNAL_CODEC_CONTRACT_TEST_PATH && HASH256.test(cell.contractTest.sha256 || ''),
  'external codec inventory differs from the gate');
  must(lock?.schema === 'aura3d.external-codec-lock/1' && RUN_ID.test(lock.runId || '') && lock.gate?.path === gatePath && lock.gate?.sha256 === gateSha256 &&
    lock.freezeCommit === gate.freezeCommit && lock.sourceInputDigest === gate.sourceInputDigest &&
    canonical(lock.candidatePlan) === canonical(gate.candidatePlan) && lock.policy?.path === EXTERNAL_CODEC_POLICY_PATH && lock.policy?.sha256 === policySha256,
  'fixture lock is not bound to the candidate gate');
  const treeBlob = verifyExternalCodecGitProof(lock.provenance, REVISION, policy.limits);
  return { ...validateExternalCodecFixtureRecords({ policy, runId: lock.runId, fixtures: lock.fixtures, treeBlob, readBytes }), policySha256 };
}

/** Block every unlisted request and authenticate bounded response bytes before returning them. */
export function createExternalCodecFetch({ fixtures, limits, fetchImpl }) {
  must(Array.isArray(fixtures) && fixtures.length === 2 && limits && typeof fetchImpl === 'function', 'verified fixture fetch inputs are unavailable');
  const records = fixtures.flatMap(fixture => [fixture.document, ...fixture.dependencies]);
  const byUrl = new Map(records.map(record => [record.url, record]));
  must(byUrl.size === records.length && records.every(record => HASH256.test(record.sha256 || '') && Number.isSafeInteger(record.byteLength) && record.byteLength >= 0), 'verified request inventory is invalid');
  let transferred = 0;
  return async (input, init = {}) => {
    const request = new Request(input, init), entry = byUrl.get(request.url);
    must(entry && request.method === 'GET' && request.credentials === 'omit' && request.redirect === 'error' &&
      [...request.headers.keys()].every(name => name === 'accept'), 'network request is not allowed by the fixture lock');
    const response = await fetchImpl(request);
    try {
      must(response?.ok && !response.redirected && response.url === request.url && !/text\/html/i.test(response.headers.get('content-type') ?? ''), 'fixture response URL, status or type is invalid');
      const declared = response.headers.get('content-length');
      if (declared !== null) must(/^\d+$/.test(declared) && Number.isSafeInteger(Number(declared)) && Number(declared) <= limits.maxResourceBytes, 'fixture response length is invalid');
      must(response.body && typeof response.body.getReader === 'function', 'bounded fixture response streaming is unavailable');
    } catch (error) {
      try { await response?.body?.cancel(); } catch { /* Preserve the response failure. */ }
      throw error;
    }
    const reader = response.body.getReader(), chunks = [];
    let count = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        must(value instanceof Uint8Array, 'invalid fixture response chunk');
        count += value.byteLength; transferred += value.byteLength;
        must(count <= entry.byteLength && transferred <= limits.maxTotalBytes, 'fixture response exceeds its byte budget');
        chunks.push(Buffer.from(value));
      }
    } catch (error) { try { await reader.cancel(); } catch { /* Preserve the request failure. */ } throw error; }
    finally { try { reader.releaseLock(); } catch { /* Preserve the request result. */ } }
    const bytes = Buffer.concat(chunks, count);
    must(count === entry.byteLength && sha256(bytes) === entry.sha256, 'fixture response integrity mismatch');
    const headers = new Headers(response.headers);
    headers.delete('content-encoding');
    headers.set('content-length', String(bytes.length));
    return new Response(bytes, { status: response.status, statusText: response.statusText, headers });
  };
}

/** Require the two exact acceptance assertions once each; no missing or skipped tests pass. */
export function evaluateExternalCodecResults(report, root) {
  must(report && Array.isArray(report.testResults) && typeof root === 'string', 'codec result inventory is missing');
  const observed = new Map();
  for (const file of report.testResults) {
    const path = (isAbsolute(file.name) ? relative(root, file.name) : file.name).replaceAll('\\', '/');
    must(path === EXTERNAL_CODEC_TEST_PATH && Array.isArray(file.assertionResults), 'unexpected codec test file');
    for (const test of file.assertionResults) {
      const id = `${path}::${test.fullName || test.title || ''}`;
      must(!observed.has(id), 'duplicate codec assertion');
      observed.set(id, test.status);
    }
  }
  const missing = EXTERNAL_CODEC_ASSERTION_IDS.filter(id => !observed.has(id));
  const passed = EXTERNAL_CODEC_ASSERTION_IDS.filter(id => observed.get(id) === 'passed');
  const failed = EXTERNAL_CODEC_ASSERTION_IDS.filter(id => observed.has(id) && observed.get(id) !== 'passed');
  const unexpected = [...observed.keys()].filter(id => !EXTERNAL_CODEC_ASSERTION_IDS.includes(id));
  const ok = report.success === true && report.numTotalTests === 2 && report.testResults.length === 1 && passed.length === 2 && !missing.length && !failed.length && !unexpected.length;
  return { status: ok ? 'passed' : 'failed', expected: [...EXTERNAL_CODEC_ASSERTION_IDS], passed, failed, missing, unexpected };
}
