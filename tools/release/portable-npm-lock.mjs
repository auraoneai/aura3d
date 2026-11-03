import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { createRequire } from 'node:module';
import { existsSync, lstatSync, readdirSync, realpathSync } from 'node:fs';
import { delimiter, isAbsolute, join, resolve } from 'node:path';
import { consumeArchiveAdmission } from './archive-admission.mjs';

// This is a pre-install check: it consumes already local archive bytes and
// never starts a package manager, resolves a URL, or executes package code.
const MAX_ARCHIVE = 64 * 1024 * 1024;
const MAX_ARCHIVES_TOTAL = 256 * 1024 * 1024;
const MAX_EXPANDED = 256 * 1024 * 1024;
const MAX_MANIFEST = 1024 * 1024;
const MAX_ENTRIES = 200000;
const MAX_PACKAGES = 10000;
const forbidden = /^(?:three|@types\/three|@react-three\/[^/]+|babylonjs(?:-gltf2interface)?|@babylonjs\/[^/]+|playcanvas|@playcanvas\/[^/]+)$/i;
const sections = ['dependencies', 'devDependencies', 'optionalDependencies', 'peerDependencies'];
const fail = message => { throw new Error(`NPM_INDEPENDENCE: ${message}`); };
const object = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`${label} must be an object`);
  return value;
};
const digest = (algorithm, data, encoding = 'hex') => createHash(algorithm).update(data).digest(encoding);
const canonical = value => JSON.stringify(value, function (_key, item) {
  return item && typeof item === 'object' && !Array.isArray(item)
    ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b))) : item;
});
function safePath(value, label) {
  if (typeof value !== 'string' || !value || value.length > 4096 || value.startsWith('/') || value.includes('\\') || /[\x00-\x1f\x7f]/.test(value) ||
      value.split('/').length > 256 || value.split('/').some(part => !part || part === '.' || part === '..')) fail(`unsafe ${label}`);
  return value;
}
function packageName(name, label) {
  if (typeof name !== 'string' || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(name)) fail(`invalid ${label}`);
  if (forbidden.test(name)) fail(`prohibited package identity: ${name}`);
  return name;
}
function fileSpecPath(value, label) {
  const path = value.replace(/^\.\//, '');
  safePath(path, label);
  // npm interprets URL escapes, query strings and fragments in file specs.
  // Accept only an unambiguous relative path before it is copied for restore.
  if (!/^[A-Za-z0-9@._/-]+$/.test(path)) fail(`unsafe ${label}`);
  return path;
}
function versionSpec(spec) {
  return typeof spec === 'string' && /^[A-Za-z0-9.*^~<>=+| _-]+$/.test(spec) && /\S/.test(spec);
}
function aliasTarget(spec) {
  if (typeof spec !== 'string' || !spec) fail('invalid dependency specifier');
  if (!spec.startsWith('npm:')) return null;
  const match = /^npm:((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)(?:@(.+))?$/.exec(spec);
  if (!match || (match[2] !== undefined && !versionSpec(match[2]))) fail('invalid npm alias');
  return packageName(match[1], 'alias target');
}
function dependencyMap(value, label) {
  if (value === undefined) return {};
  const result = object(value, label);
  for (const [name, spec] of Object.entries(result)) {
    packageName(name, 'dependency name');
    const alias = aliasTarget(spec);
    if (spec.startsWith('file:')) fileSpecPath(spec.slice(5), 'dependency file');
    else if (!alias && !versionSpec(spec)) fail(`unsupported dependency source: ${name}`);
  }
  return result;
}
function peerMeta(value, peers, label) {
  if (value === undefined) return {};
  const meta = object(value, label);
  for (const [name, raw] of Object.entries(meta)) {
    packageName(name, 'peer metadata name');
    if (!Object.hasOwn(peers, name)) fail(`peer metadata has no matching dependency: ${name}`);
    const entry = object(raw, `${label}/${name}`);
    if (Object.keys(entry).some(key => key !== 'optional') ||
        (entry.optional !== undefined && typeof entry.optional !== 'boolean')) fail(`unsupported peer metadata: ${name}`);
  }
  return meta;
}
function rejectUnsupportedPackageSettings(value, label) {
  for (const key of ['overrides', 'workspaces']) if (value[key] !== undefined) fail(`unsupported ${label} ${key}`);
  for (const bundled of [value.bundledDependencies, value.bundleDependencies]) {
    if (bundled !== undefined && bundled !== false && (!Array.isArray(bundled) || bundled.length !== 0)) fail('bundled dependencies are not allowed');
  }
}
function installedName(path) {
  const parts = path.split('/');
  if (!parts.length || parts[0] !== 'node_modules') fail(`invalid lock package path: ${path}`);
  let name = '';
  for (let i = 0; i < parts.length;) {
    if (parts[i++] !== 'node_modules' || !parts[i]) fail(`invalid lock package path: ${path}`);
    name = parts[i++];
    if (name.startsWith('@')) { if (!parts[i]) fail(`invalid lock package path: ${path}`); name += `/${parts[i++]}`; }
    packageName(name, 'installed package name');
  }
  return name;
}
function resolveDependency(packages, parent, name) {
  let base = parent;
  for (;;) {
    const candidate = `${base ? `${base}/` : ''}node_modules/${name}`;
    if (Object.hasOwn(packages, candidate)) return candidate;
    if (!base) return null;
    const index = base.lastIndexOf('/node_modules/');
    base = index < 0 ? '' : base.slice(0, index);
  }
}
function resolvedSpec(value) {
  if (typeof value !== 'string' || !value) fail('missing package resolved location');
  if (value.startsWith('file:')) {
    fileSpecPath(value.slice(5), 'file resolution');
    return;
  }
  let url;
  try { url = new URL(value); } catch { fail('invalid package resolved URL'); }
  // The loopback form is used only for a candidate and is checked against its
  // independently verified archive identity below.
  if (url.protocol === 'http:' && url.hostname === '127.0.0.1' && /^\/-\/tarballs\/[a-f0-9]{64}$/.test(url.pathname) && !url.username && !url.password && !url.search && !url.hash) return;
  if (url.protocol !== 'https:' || url.hostname !== 'registry.npmjs.org' || url.port || url.username || url.password || url.search || url.hash) fail('unsupported package registry or URL');
}

/** Validate the complete lock graph before retrieving package archive bytes. */
export function assertIndependentNpmGraph({ manifest, lock }) {
  object(manifest, 'manifest'); object(lock, 'lock');
  // Version 2 also contains a legacy graph; accepting it without proving both
  // representations equivalent could give npm a different dependency graph.
  if (lock.lockfileVersion !== 3) fail('only npm lockfile version 3 is supported');
  rejectUnsupportedPackageSettings(manifest, 'manifest');
  const packages = object(lock.packages, 'lock packages');
  if (Object.keys(packages).length > MAX_PACKAGES) fail('lock package limit exceeded');
  const root = object(packages[''], 'lock root');
  for (const section of sections) {
    const a = dependencyMap(manifest[section], `manifest ${section}`);
    const b = dependencyMap(root[section], `lock root ${section}`);
    if (canonical(a) !== canonical(b)) fail(`root ${section} differs from lock`);
  }
  if (canonical(peerMeta(manifest.peerDependenciesMeta, dependencyMap(manifest.peerDependencies, 'manifest peerDependencies'), 'manifest peer metadata')) !==
      canonical(peerMeta(root.peerDependenciesMeta, dependencyMap(root.peerDependencies, 'lock root peerDependencies'), 'lock root peer metadata'))) fail('root peer metadata differs from lock');
  for (const [path, raw] of Object.entries(packages)) {
    if (!path) continue;
    safePath(path, 'lock package path');
    const name = installedName(path), entry = object(raw, `lock package ${path}`);
    if (entry.name !== undefined) packageName(entry.name, 'locked package identity');
    if (entry.link || entry.inBundle || entry.bundled) fail(`linked or bundled package: ${path}`);
    if (typeof entry.version !== 'string' || !entry.version) fail(`missing locked version: ${path}`);
    resolvedSpec(entry.resolved);
    if (typeof entry.integrity !== 'string' || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(entry.integrity) ||
        Buffer.from(entry.integrity.slice(7), 'base64').length !== 64 ||
        Buffer.from(entry.integrity.slice(7), 'base64').toString('base64') !== entry.integrity.slice(7)) fail(`missing canonical SHA-512 integrity: ${path}`);
    for (const section of sections) dependencyMap(entry[section], `${path} ${section}`);
    peerMeta(entry.peerDependenciesMeta, dependencyMap(entry.peerDependencies, `${path} peerDependencies`), `${path} peer metadata`);
    if (forbidden.test(name)) fail(`prohibited package identity: ${name}`);
  }
  for (const [path, entry] of Object.entries(packages)) {
    for (const section of sections) {
      for (const [name, spec] of Object.entries(dependencyMap(entry[section], `${path} ${section}`))) {
        if (path && spec.startsWith('file:')) fail(`unsupported transitive file dependency: ${path}/${name}`);
        const found = resolveDependency(packages, path, name);
        const optional = section === 'optionalDependencies' || (section === 'peerDependencies' && entry.peerDependenciesMeta?.[name]?.optional === true);
        if (!found) { if (optional) continue; fail(`unresolved dependency: ${path || '<root>'}/${name}`); }
        if (spec.startsWith('file:') && (!packages[found].resolved?.startsWith('file:') ||
            fileSpecPath(spec.slice(5), 'dependency file') !== fileSpecPath(packages[found].resolved.slice(5), 'file resolution'))) {
          fail(`dependency file resolution differs from lock: ${path || '<root>'}/${name}`);
        }
        const target = aliasTarget(spec);
        if (target && packages[found].name !== target) fail(`unverified alias target: ${path || '<root>'}/${name}`);
        if ((packages[found].name ?? installedName(found)) !== (target ?? name)) fail(`dependency identity mismatch: ${path || '<root>'}/${name}`);
      }
    }
  }
  return { packagePaths: Object.keys(packages).filter(Boolean).sort() };
}

function octal(bytes, label) {
  const text = bytes.toString('ascii').replace(/\0.*$/, '').trim();
  if (!text) return 0;
  if (!/^[0-7]+$/.test(text)) fail(`unsupported tar ${label}`);
  const value = Number.parseInt(text, 8);
  if (!Number.isSafeInteger(value) || value < 0) fail(`invalid tar ${label}`);
  return value;
}
function tarText(bytes) {
  try { return new TextDecoder('utf-8', { fatal: true }).decode(bytes.subarray(0, bytes.indexOf(0) < 0 ? bytes.length : bytes.indexOf(0))); }
  catch { fail('invalid UTF-8 in tar metadata'); }
}
function paxPath(data) {
  let index = 0, path;
  while (index < data.length) {
    const space = data.indexOf(32, index);
    if (space < 0) fail('malformed PAX record');
    const text = data.subarray(index, space).toString('ascii');
    if (!/^[1-9][0-9]*$/.test(text)) fail('malformed PAX length');
    const size = Number(text), end = index + size;
    if (!Number.isSafeInteger(size) || end > data.length || end <= space + 1 || data[end - 1] !== 10) fail('malformed PAX record');
    const field = data.subarray(space + 1, end - 1);
    if (field.includes(0)) fail('malformed PAX value');
    const record = tarText(field), equals = record.indexOf('=');
    if (equals < 1) fail('malformed PAX value');
    const key = record.slice(0, equals), value = record.slice(equals + 1);
    if (key === 'path') { if (path !== undefined) fail('duplicate PAX path'); path = value; }
    else if (!['mtime', 'atime', 'ctime', 'uid', 'gid', 'uname', 'gname'].includes(key)) fail(`unsupported PAX field: ${key}`);
    index = end;
  }
  return path;
}
/** Parse a tarball while rejecting unsafe or bundled contents. */
function parseArchive(bytes, includeFiles = false) {
  if (!Buffer.isBuffer(bytes) && !(bytes instanceof Uint8Array)) fail('archive reader did not return bytes');
  if (bytes.byteLength < 1 || bytes.byteLength > MAX_ARCHIVE) fail('archive exceeds compressed byte limit');
  let data;
  try { data = gunzipSync(bytes, { maxOutputLength: MAX_EXPANDED }); } catch { fail('invalid or oversized gzip archive'); }
  let offset = 0, count = 0, pendingPath, manifest, terminal = false;
  const seen = new Map(), parents = new Set(), files = [];
  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) {
      if (data.length % 512 !== 0 || !data.subarray(offset).every(byte => byte === 0)) fail('nonzero or truncated tar trailer');
      terminal = true; break;
    }
    if (++count > MAX_ENTRIES) fail('archive entry limit exceeded');
    const expected = octal(header.subarray(148, 156), 'checksum');
    let sum = 0;
    for (let i = 0; i < 512; i++) sum += i >= 148 && i < 156 ? 32 : header[i];
    if (sum !== expected) fail('tar checksum mismatch');
    const size = octal(header.subarray(124, 136), 'size'), body = offset + 512, end = body + size;
    if (!Number.isSafeInteger(end) || end > data.length) fail('truncated tar entry');
    const type = String.fromCharCode(header[156] || 48);
    if (type === 'x') {
      if (pendingPath !== undefined || size > MAX_MANIFEST) fail('invalid PAX entry');
      pendingPath = paxPath(data.subarray(body, end)) ?? '';
    } else {
      if (type !== '0' && type !== '5') fail('unsupported tar entry type');
      if (type === '5' && size !== 0) fail('invalid tar directory size');
      const prefix = tarText(header.subarray(345, 500)), name = tarText(header.subarray(0, 100));
      const effective = (pendingPath || (prefix ? `${prefix}/${name}` : name)).replace(/^\.\//, '').replace(/\/$/, '');
      pendingPath = undefined;
      safePath(effective, 'tar path');
      const parts = effective.split('/');
      if (parts[0] !== 'package' || parts.some(part => /^(?:node_modules|\.git)$/i.test(part)) ||
          parts.some(part => /^(?:\.npmrc|\.pypirc|\.env(?:\..*)?|credentials(?:\.json)?|id_(?:rsa|ecdsa|ed25519)|.*\.(?:key|pem|p12|pfx))$/i.test(part))) fail('archive contains an unsafe or bundled path');
      if (seen.has(effective)) fail('duplicate tar path');
      if (effective === 'package' && type !== '5') fail('invalid tar package root');
      if (type === '0' && parents.has(effective)) fail('tar file conflicts with a directory');
      for (let index = 1; index < parts.length; index++) {
        const parent = parts.slice(0, index).join('/');
        if (seen.get(parent) === '0') fail('tar directory conflicts with a file');
        parents.add(parent);
      }
      seen.set(effective, type);
      if (includeFiles && type === '0') files.push({ path: parts.slice(1).join('/'), bytes: Uint8Array.from(data.subarray(body, end)) });
      if (effective === 'package/package.json') {
        if (type !== '0' || size < 2 || size > MAX_MANIFEST) fail('invalid archive manifest size');
        try { manifest = JSON.parse(data.subarray(body, end).toString('utf8')); } catch { fail('invalid archive manifest JSON'); }
      }
    }
    offset = body + Math.ceil(size / 512) * 512;
  }
  if (!terminal || pendingPath !== undefined || !manifest) fail('incomplete tar archive or missing manifest');
  object(manifest, 'archive manifest');
  rejectUnsupportedPackageSettings(manifest, 'archive manifest');
  for (const section of sections) dependencyMap(manifest[section], `archive ${section}`);
  peerMeta(manifest.peerDependenciesMeta, dependencyMap(manifest.peerDependencies, 'archive peerDependencies'), 'archive peer metadata');
  return { manifest, files };
}

/**
 * Inspect regular package files from an already-local archive. Returned file
 * arrays are independent copies and do not imply trust or installation rights.
 */
export function inspectNpmArchive(bytes) { return parseArchive(bytes, true); }

function inspectConsumer({ manifest, lock, archives, readArchive, candidatePackages }, rejectExternal) {
  const { packagePaths } = assertIndependentNpmGraph({ manifest, lock });
  if (!Array.isArray(archives) || archives.length > MAX_PACKAGES || typeof readArchive !== 'function' || !Array.isArray(candidatePackages)) fail('archive inventory is required');
  const byResolution = new Map();
  for (const item of archives) {
    object(item, 'archive inventory item'); resolvedSpec(item.resolved); safePath(item.path, 'archive path');
    if (byResolution.has(item.resolved)) fail('duplicate archive resolution');
    byResolution.set(item.resolved, item.path);
  }
  const candidates = new Map();
  for (const candidate of candidatePackages) {
    object(candidate, 'candidate'); packageName(candidate.name, 'candidate name');
    if ((!candidate.name.startsWith('@aura3d/') && candidate.name !== 'create-aura3d') ||
        candidates.has(candidate.name) || typeof candidate.version !== 'string' || !/^[a-f0-9]{64}$/.test(candidate.sha256 ?? '') || typeof candidate.integrity !== 'string') fail('invalid candidate inventory');
    candidates.set(candidate.name, candidate);
  }
  if (rejectExternal) for (const path of packagePaths) {
    const entry = lock.packages[path];
    if (!candidates.has(entry.name ?? installedName(path))) fail('trusted digest-bound external archive admission is unavailable');
  }
  const used = new Set(), parsed = new Map();
  let totalBytes = 0;
  for (const path of packagePaths) {
    const entry = lock.packages[path], archivePath = byResolution.get(entry.resolved);
    if (!archivePath) fail(`archive is missing: ${path}`);
    used.add(entry.resolved);
    let record = parsed.get(entry.resolved);
    if (!record) {
      const input = readArchive(archivePath);
      if (!(input instanceof Uint8Array)) fail('archive reader did not return bytes');
      totalBytes += input.byteLength;
      if (totalBytes > MAX_ARCHIVES_TOTAL) fail('archive inventory exceeds byte limit');
      const bytes = Buffer.from(input);
      const integrity = `sha512-${digest('sha512', bytes, 'base64')}`;
      record = { manifest: parseArchive(bytes).manifest, sha256: digest('sha256', bytes), integrity, bytes };
      parsed.set(entry.resolved, record);
    }
    if (entry.integrity !== record.integrity) fail(`archive integrity mismatch: ${path}`);
    const actual = record.manifest, name = packageName(actual.name, 'archive package name');
    if (actual.version !== entry.version || (entry.name !== undefined && entry.name !== name)) fail(`archive identity mismatch: ${path}`);
    if (entry.resolved.startsWith('https:')) {
      const url = new URL(entry.resolved), leaf = name.slice(name.lastIndexOf('/') + 1);
      if (url.pathname.includes('%') || url.pathname !== `/${name}/-/${leaf}-${actual.version}.tgz`) fail(`registry archive URL identity mismatch: ${path}`);
    }
    const installed = installedName(path);
    if (installed !== name && entry.name !== name) fail(`unverified installed alias: ${path}`);
    for (const section of ['dependencies', 'optionalDependencies', 'peerDependencies']) {
      const actualDeps = dependencyMap(actual[section], `archive ${section}`);
      const lockedDeps = dependencyMap(entry[section], `lock ${section}`);
      if (canonical(actualDeps) !== canonical(lockedDeps)) fail(`archive dependency metadata mismatch: ${path}/${section}`);
    }
    if (canonical(peerMeta(actual.peerDependenciesMeta, dependencyMap(actual.peerDependencies, 'archive peerDependencies'), 'archive peer metadata')) !==
        canonical(peerMeta(entry.peerDependenciesMeta, dependencyMap(entry.peerDependencies, 'lock peerDependencies'), 'lock peer metadata'))) fail(`archive peer metadata mismatch: ${path}`);
    const candidate = candidates.get(name);
    if (candidate) {
      if (candidate.version !== actual.version || candidate.sha256 !== record.sha256 || candidate.integrity !== record.integrity) fail(`candidate archive mismatch: ${name}`);
    } else if (name.startsWith('@aura3d/') || name === 'create-aura3d' || entry.resolved.startsWith('file:') || entry.resolved.startsWith('http://')) {
      fail(`unrecognized candidate or local archive: ${name}`);
    }
  }
  if (used.size !== archives.length) fail('archive inventory has unused entries');
  return { packagePaths, inputPaths: [...new Set(archives.map(item => item.path))].sort(),
    archives: [...parsed].map(([resolved, record]) => ({ resolved, path: byResolution.get(resolved), ...record })).sort((a, b) => a.resolved.localeCompare(b.resolved)) };
}

/** Structural inspection only; the result must never be treated as admission. */
export function inspectIndependentNpmConsumer(input) { return inspectConsumer(input, false); }

/**
 * Pre-install assertion. A package name, lock and tar layout cannot prove that
 * source code was not vendored. No install authorization is returned while a
 * trusted, digest-bound provenance admission provider is unavailable.
 */
export function assertIndependentNpmConsumer(input) {
  if (!input.admission) {
    inspectConsumer(input, true);
    fail('trusted digest-bound candidate archive admission is unavailable');
  }
  const { capability, manifestBytes, lockBytes } = input.admission;
  const admitted = consumeArchiveAdmission({ capability, manifestBytes, lockBytes });
  let manifest, lock;
  try { manifest = JSON.parse(Buffer.from(manifestBytes).toString('utf8')); lock = JSON.parse(Buffer.from(lockBytes).toString('utf8')); }
  catch { fail('invalid admitted graph bytes'); }
  if (canonical(manifest) !== canonical(input.manifest) || canonical(lock) !== canonical(input.lock)) fail('admitted graph differs from inspected graph');
  const inspected = inspectConsumer(input, false), expected = new Map(admitted.map(item => [item.resolved, item.bytes]));
  if (expected.size !== inspected.archives.length) fail('admitted archive inventory differs');
  for (const archive of inspected.archives) {
    const bytes = expected.get(archive.resolved);
    if (!bytes || !Buffer.from(bytes).equals(archive.bytes)) fail('archive differs from admitted snapshot');
  }
  return { inputPaths: inspected.inputPaths };
}

/** Seed only opaque-capability-admitted bytes into a fresh isolated npm cache. */
export async function seedVerifiedNpmCache({ lock, archives, readArchive, cacheDir, npmPath, admission }) {
  if (typeof cacheDir !== 'string' || !cacheDir || !Array.isArray(archives) || typeof readArchive !== 'function') fail('invalid cache preparation inputs');
  object(lock, 'lock');
  if (!admission) {
    for (const item of archives) {
      object(item, 'archive inventory item'); resolvedSpec(item.resolved); safePath(item.path, 'archive path');
      if (!item.resolved.startsWith('file:')) fail('trusted digest-bound external archive admission is unavailable');
    }
    fail('trusted digest-bound candidate archive admission is unavailable');
  }
  const { capability, manifestBytes, lockBytes } = admission;
  const admitted = consumeArchiveAdmission({ capability, manifestBytes, lockBytes });
  let admittedLock;
  try { admittedLock = JSON.parse(Buffer.from(lockBytes).toString('utf8')); } catch { fail('invalid admitted lock bytes'); }
  if (canonical(admittedLock) !== canonical(lock)) fail('admitted lock differs from cache lock');
  const expected = new Map(admitted.map(item => [item.resolved, item.bytes])), seen = new Set(), registry = [];
  for (const item of archives) {
    object(item, 'archive inventory item'); resolvedSpec(item.resolved); safePath(item.path, 'archive path');
    if (seen.has(item.resolved)) fail('duplicate cache archive resolution');
    seen.add(item.resolved);
    const snapshot = expected.get(item.resolved), input = readArchive(item.path);
    if (!snapshot || !(input instanceof Uint8Array) || !Buffer.from(snapshot).equals(input)) fail('cache archive differs from admitted snapshot');
    const matches = Object.values(object(lock.packages, 'lock packages')).filter(entry => entry?.resolved === item.resolved);
    const integrity = `sha512-${digest('sha512', snapshot, 'base64')}`;
    if (!matches.length || matches.some(entry => entry.integrity !== integrity)) fail('cache archive differs from lock');
    if (!item.resolved.startsWith('file:')) registry.push({ resolved: item.resolved, bytes: Buffer.from(snapshot) });
  }
  if (seen.size !== expected.size) fail('cache archive inventory differs from admission');
  if (!registry.length) return;
  if (!isAbsolute(cacheDir) || !existsSync(cacheDir) || !lstatSync(cacheDir).isDirectory() || lstatSync(cacheDir).isSymbolicLink() || readdirSync(cacheDir).length) fail('cache must be an empty isolated directory');
  const bins = (process.env.PATH ?? '').split(delimiter).filter(Boolean);
  const found = npmPath ?? bins.map(dir => join(dir, 'npm')).find(path => existsSync(path));
  if (!found) fail('npm is unavailable for offline cache preparation');
  let cacache;
  try { cacache = createRequire(realpathSync(found))('cacache'); } catch { fail('npm cache implementation is unavailable'); }
  for (const item of registry) await cacache.put(resolve(cacheDir, '_cacache'), `make-fetch-happen:request-cache:${item.resolved}`, item.bytes,
    { metadata: { time: Date.now(), url: item.resolved, reqHeaders: {}, resHeaders: {}, options: { compress: true } } });
}
