import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, lstatSync, openSync, readSync, readdirSync, readlinkSync, realpathSync } from 'node:fs';
import { isAbsolute, relative, resolve, sep } from 'node:path';
import { inspectAdmittedArchiveFiles } from './admitted-archive-modes.mjs';
import { isSourceInput, stagedSourceIdentity } from './source-identity.mjs';
import { consumeWorkspacePnpmAdmission } from './workspace-pnpm-admission.mjs';
import { consumePnpmConsumerGraph } from './portable-pnpm-lock.mjs';
import { consumeArchiveAdmission } from './archive-admission.mjs';
import { inspectNpmArchive } from './portable-npm-lock.mjs';

// This is a point-in-time inspection, not permission to install or execute.
// Generated pnpm scripts and metadata do not yet have an independently
// authenticated inventory. They fail closed until such a contract exists.
const MAX_FILES = 500000;
const MAX_TOTAL_BYTES = 2 * 1024 * 1024 * 1024;
const MAX_FILE_BYTES = 256 * 1024 * 1024;
const MAX_PACKAGES = 10000;
const HASH = /^[a-f0-9]{64}$/;
const PACKAGE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const fail = message => { throw new Error(`PNPM_INSTALLED_TREE: ${message}`); };
const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const sri = bytes => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;

function sourcePath(value, label, allowRoot = false) {
  if (allowRoot && value === '.') return value;
  if (typeof value !== 'string' || !value || value.length > 4096 || isAbsolute(value) || value.includes('\\') ||
      /[\x00-\x1f\x7f]/.test(value) || value.split('/').some(part => !part || part === '.' || part === '..')) fail(`unsafe ${label}`);
  return value;
}
function packageName(value) {
  if (typeof value !== 'string' || value.length > 214 || !PACKAGE.test(value)) fail('invalid package name');
  return value;
}
function noteIdentity(state, path, stat, link) {
  if (!state) return;
  const item = { identity: fileIdentity(stat), ...(link === undefined ? {} : { link }) }, prior = state.identities.get(path);
  if (prior && (prior.identity !== item.identity || prior.link !== item.link)) fail('installed tree changed during inspection');
  state.identities.set(path, item);
}
function safeDirectory(root, path, label, state) {
  let stat, real;
  try { stat = lstatSync(path); real = realpathSync(path); } catch { fail(`missing ${label}`); }
  if (!stat.isDirectory() || stat.isSymbolicLink() || real !== path || (path !== root && !path.startsWith(`${root}${sep}`))) fail(`invalid ${label}`);
  noteIdentity(state, path, stat);
  return stat;
}
function fileIdentity(stat) {
  return `${stat.dev}:${stat.ino}:${stat.nlink}:${stat.size}:${stat.mode}:${stat.mtimeMs}:${stat.ctimeMs}`;
}
function readFileChecked(path, state, max = MAX_FILE_BYTES, retain = false) {
  let before, fd;
  try {
    before = lstatSync(path);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > max) fail('invalid, linked, or oversized installed file');
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = fstatSync(fd);
    if (!opened.isFile() || fileIdentity(opened) !== fileIdentity(before)) fail('installed file changed before reading');
    const hash = createHash('sha256'), chunk = Buffer.alloc(256 * 1024), chunks = [];
    let size = 0;
    for (;;) {
      const count = readSync(fd, chunk, 0, chunk.length, null);
      if (!count) break;
      size += count; state.bytes += count;
      if (size > max || state.bytes > MAX_TOTAL_BYTES) fail('installed byte limit exceeded');
      hash.update(chunk.subarray(0, count));
      if (retain) chunks.push(Buffer.from(chunk.subarray(0, count)));
    }
    const after = fstatSync(fd), current = lstatSync(path);
    if (size !== before.size || fileIdentity(after) !== fileIdentity(before) || fileIdentity(current) !== fileIdentity(before)) fail('installed file changed while reading');
    if (++state.files > MAX_FILES) fail('installed file limit exceeded');
    noteIdentity(state, path, before);
    return { size, sha256: hash.digest('hex'), executable: before.mode & 0o111,
      ...(retain ? { bytes: Buffer.concat(chunks) } : {}) };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('PNPM_INSTALLED_TREE:')) throw error;
    fail('installed file cannot be read safely');
  } finally { if (fd !== undefined) closeSync(fd); }
}
function snapshotBase(key) {
  if (typeof key !== 'string' || !key || key.length > 8192) fail('invalid snapshot identity');
  const firstPeer = key.indexOf('('), base = firstPeer < 0 ? key : key.slice(0, firstPeer);
  const at = base.lastIndexOf('@');
  if (at < 1 || !base.slice(at + 1)) fail('invalid snapshot package identity');
  return { base, name: packageName(base.slice(0, at)), version: base.slice(at + 1) };
}
function virtualStoreName(id) {
  // The pinned pnpm version uses '_' for flat peer/patch bindings and '+'
  // for scoped-name slashes. Long names are hashed by pnpm and nested binding
  // encodings are not yet proven here; never guess either identity.
  const match = /^([^()]+)((?:\([^()]+\))*)$/.exec(id);
  if (!match || !/^[a-zA-Z0-9@/._+=-]+$/.test(match[1])) fail('unsupported virtual-store snapshot identity');
  const bindings = [...match[2].matchAll(/\(([^()]+)\)/g)].map(item => item[1]);
  if (bindings.some(item => !/^[a-zA-Z0-9@/._+=-]+$/.test(item))) fail('unsupported virtual-store peer identity');
  const folder = [match[1], ...bindings].join('_').replaceAll('/', '+');
  if (Buffer.byteLength(folder, 'utf8') > 120) fail('hashed virtual-store snapshot identity is unavailable');
  return folder;
}

/**
 * Describe a conservative platform closure using caller-supplied observations.
 * This is deliberately not an admission, runtime fingerprint, isolation
 * check, or permission to install: the caller must independently establish
 * that the supplied tuple and configuration match the isolated pnpm process.
 */
export function describePnpmPlatformClosure(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !['graph', 'platform', 'supportedArchitectures'].includes(key))) fail('unsupported provisional platform options');
  const { graph, platform, supportedArchitectures } = input;
  if (!graph || typeof graph !== 'object' || Array.isArray(graph) ||
      Object.keys(graph).some(key => !['settings', 'importers', 'packages', 'snapshots'].includes(key)) ||
      !graph.settings || typeof graph.settings !== 'object' || Array.isArray(graph.settings) ||
      Object.entries(graph.settings).some(([key, value]) => !['autoInstallPeers', 'excludeLinksFromLockfile'].includes(key) || typeof value !== 'boolean') ||
      !Array.isArray(graph.importers) || !Array.isArray(graph.packages) || !Array.isArray(graph.snapshots) ||
      graph.importers.length > MAX_PACKAGES || graph.packages.length > MAX_PACKAGES || graph.snapshots.length > MAX_PACKAGES) fail('invalid provisional platform graph');
  if (!platform || typeof platform !== 'object' || Array.isArray(platform) ||
      Object.keys(platform).sort().join(',') !== 'cpu,libc,os' ||
      [platform.os, platform.cpu, platform.libc].some(value => typeof value !== 'string' || !/^[a-z0-9_]+$/.test(value) || value === 'current')) {
    fail('invalid provisional platform tuple');
  }
  if (supportedArchitectures !== undefined) {
    if (!supportedArchitectures || typeof supportedArchitectures !== 'object' || Array.isArray(supportedArchitectures) ||
        Object.keys(supportedArchitectures).some(key => !['os', 'cpu', 'libc'].includes(key))) fail('unsupported architecture configuration');
    for (const value of Object.values(supportedArchitectures)) {
      if (!Array.isArray(value) || value.length !== 1 || value[0] !== 'current') fail('non-current architecture configuration is unavailable');
    }
  }
  const packages = new Map(), snapshots = new Map(), importerPaths = new Set();
  for (const item of graph.packages) {
    const { base } = snapshotBase(item.key);
    if (item.key !== base || packages.has(base) || (item.resolution && Object.keys(item.resolution).some(key => !['integrity', 'tarball'].includes(key)))) fail('unsupported platform package metadata');
    for (const field of ['os', 'cpu', 'libc']) {
      const value = item[field];
      if (value !== undefined && (!Array.isArray(value) || !value.length || value.some(token => typeof token !== 'string' || !/^!?[a-zA-Z0-9_]+$/.test(token)))) fail('unsupported platform constraint');
    }
    if (item.engines !== undefined && (!item.engines || typeof item.engines !== 'object' || Array.isArray(item.engines) || Object.values(item.engines).some(value => typeof value !== 'string'))) fail('unsupported platform engine metadata');
    packages.set(base, item);
  }
  for (const item of graph.snapshots) {
    const { base } = snapshotBase(item.key);
    if (!packages.has(base) || snapshots.has(item.key) || (item.optional !== undefined && typeof item.optional !== 'boolean')) fail('invalid platform snapshot');
    snapshots.set(item.key, item);
  }
  for (const importer of graph.importers) {
    sourcePath(importer.path, 'platform importer path', true);
    if (importerPaths.has(importer.path) || !Array.isArray(importer.roots)) fail('invalid platform importer');
    importerPaths.add(importer.path);
  }
  if (!importerPaths.has('.')) fail('platform root importer is missing');
  const lookup = (name, value) => {
    packageName(name);
    if (typeof value !== 'string' || !value || value.startsWith('link:') || value.startsWith('file:')) fail('unsupported platform dependency resolution');
    const id = snapshots.has(value) ? value : `${name}@${value}`;
    if (!snapshots.has(id)) fail('unresolved platform dependency');
    return id;
  };
  const compatibleList = (values, current) => {
    if (values === undefined) return true;
    if (!Array.isArray(values) || !values.length || values.some(value => typeof value !== 'string' || !/^!?[a-zA-Z0-9_]+$/.test(value))) fail('unsupported platform constraint');
    if (values.length === 1 && values[0] === 'any') return true;
    if (values.includes(`!${current}`)) return false;
    const positive = values.filter(value => !value.startsWith('!'));
    return positive.length === 0 || positive.includes(current);
  };
  const queue = [], seen = new Map(), selected = new Set(), skipped = new Map();
  const enqueue = value => { if (queue.length >= MAX_FILES) fail('platform graph edge limit exceeded'); queue.push(value); };
  for (const importer of graph.importers) {
    for (const edge of importer.roots) {
      if (!['dependencies', 'devDependencies', 'optionalDependencies'].includes(edge.group)) fail('unsupported platform importer group');
      if (edge.kind === 'workspace') {
        if (!importerPaths.has(edge.target)) fail('unresolved platform workspace dependency');
      } else if (edge.kind === 'archive') {
        const name = packageName(edge.target), id = lookup(name, edge.version);
        if (snapshotBase(id).name !== name) fail('platform root archive identity differs');
        enqueue({ id, parent: true, required: edge.group !== 'optionalDependencies' });
      } else fail('unsupported platform importer dependency');
    }
  }
  for (let position = 0; position < queue.length; position++) {
    const { id, parent, required } = queue[position], prior = seen.get(id) ?? 0;
    const state = parent ? 1 : 2, requiredState = required ? 4 : 8;
    if ((prior & (parent ? 2 : 1)) !== 0) fail('ambiguous mixed-parent platform reachability');
    if ((prior & state) && (prior & requiredState)) continue;
    seen.set(id, prior | state | requiredState);
    const snapshot = snapshots.get(id), metadata = packages.get(snapshotBase(id).base);
    if (snapshot.optional === true && required) fail('optional snapshot is reachable through a fully required path');
    let installable = parent;
    if (parent && snapshot.optional === true) {
      if (metadata.engines && Object.keys(metadata.engines).length) fail('optional engine selection is unavailable');
      const os = compatibleList(metadata.os, platform.os), cpu = compatibleList(metadata.cpu, platform.cpu), libc = compatibleList(metadata.libc, platform.libc);
      installable = os && cpu && (platform.libc === 'unknown' || libc);
    }
    if (!installable && snapshot.optional === true) {
      skipped.set(id, parent ? 'platform-incompatible' : 'ancestor-incompatible');
    } else selected.add(id);
    const requiredDeps = snapshot.dependencies ?? {}, optionalDeps = snapshot.optionalDependencies ?? {};
    if (!requiredDeps || typeof requiredDeps !== 'object' || Array.isArray(requiredDeps) ||
        !optionalDeps || typeof optionalDeps !== 'object' || Array.isArray(optionalDeps)) fail('invalid platform dependency map');
    for (const [name, value] of Object.entries(requiredDeps)) {
      if (Object.hasOwn(optionalDeps, name)) fail('duplicate platform dependency');
      enqueue({ id: lookup(name, value), parent: installable, required });
    }
    for (const [name, value] of Object.entries(optionalDeps)) enqueue({ id: lookup(name, value), parent: installable, required: false });
  }
  if (seen.size !== snapshots.size) fail('platform graph contains unreachable snapshots');
  return Object.freeze({ schema: 'aura3d.pnpm-platform-description/1',
    platform: Object.freeze({ ...platform }), selected: Object.freeze([...selected].sort()),
    skipped: Object.freeze([...skipped].sort(([a], [b]) => a.localeCompare(b)).map(([id, reason]) => Object.freeze({ id, reason }))),
    assumptions: Object.freeze({ include: 'all-importers-and-dependency-groups', engineStrict: false,
      includeIncompatiblePackages: false, initialSkipped: 'empty', supportedArchitectures: 'current' }),
    authority: 'Provisional caller-supplied platform description only; not runtime identity, isolation proof, or permission to install.' });
}
function declaredBinTargets(manifest, files) {
  if (manifest.bin === undefined) return new Set();
  const declarations = typeof manifest.bin === 'string'
    ? [[packageName(manifest.name).split('/').at(-1), manifest.bin]]
    : manifest.bin && typeof manifest.bin === 'object' && !Array.isArray(manifest.bin)
      ? Object.entries(manifest.bin) : fail('unsupported package bin declaration');
  const targets = new Set();
  for (const [name, raw] of declarations) {
    if (typeof name !== 'string' || !name || typeof raw !== 'string' || !raw || isAbsolute(raw) || raw.includes('\\')) fail('unsafe package bin declaration');
    const path = raw.replace(/^(?:\.\/)+/, '');
    sourcePath(path, 'package bin path');
    if (!files.has(path)) fail('package bin target is not an admitted regular file');
    // The pinned POSIX linker handles the command named node separately and
    // does not run its ordinary target-normalization path for that command.
    if (name !== 'node') targets.add(path);
  }
  return targets;
}
function fixedBinFile(file) {
  const input = file.bytes;
  let output = input;
  if (input[0] === 35 && input[1] === 33) {
    const newline = input.indexOf(10);
    if (newline > 3 && newline < 2048 && input[newline - 1] === 13) {
      // The package manager rewrites via UTF-8. Refuse ambiguous replacement
      // of invalid input rather than accepting a lossy conversion.
      try { new TextDecoder('utf-8', { fatal: true }).decode(input); } catch { return undefined; }
      output = Buffer.concat([input.subarray(0, newline - 1), input.subarray(newline)]);
    }
  }
  return { size: output.byteLength, sha256: digest(output), executable: 0o111 };
}
function actualEntries(root, directory, expectedNames, options = {}, state) {
  if (!expectedNames.size && options.allowMissing) {
    try { lstatSync(directory); } catch (error) { if (error?.code === 'ENOENT') return; throw error; }
  }
  safeDirectory(root, directory, 'node_modules directory', state);
  const seen = new Set();
  const add = name => {
    if (seen.has(name) || !expectedNames.has(name)) fail(`unrecorded installed entry: ${name}`);
    seen.add(name);
  };
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === '.pnpm' && options.allowStore) {
      const path = resolve(directory, entry.name);
      safeDirectory(root, path, 'virtual store', state);
      add('.pnpm');
    } else if (entry.name.startsWith('@')) {
      const scope = resolve(directory, entry.name);
      if (!/^@[a-z0-9][a-z0-9._-]*$/.test(entry.name)) fail('invalid installed scope');
      safeDirectory(root, scope, 'scope directory', state);
      const children = readdirSync(scope, { withFileTypes: true });
      if (!children.length) fail('empty installed scope');
      for (const child of children) add(packageName(`${entry.name}/${child.name}`));
    } else add(packageName(entry.name));
  }
  if (seen.size !== expectedNames.size) fail('missing installed dependency entry');
}
function resolveLink(root, path, label, state) {
  let stat, text, actual;
  try { stat = lstatSync(path); text = readlinkSync(path); actual = realpathSync(path); } catch { fail(`missing ${label} link`); }
  const lexical = text ? resolve(path, '..', text) : '';
  if (!stat.isSymbolicLink() || isAbsolute(text) || !text || text.includes('\\') || /[\x00-\x1f\x7f]/.test(text) ||
      (lexical !== root && !lexical.startsWith(`${root}${sep}`)) ||
      (actual !== root && !actual.startsWith(`${root}${sep}`))) fail(`invalid ${label} link`);
  noteIdentity(state, path, stat, text);
  return actual;
}
function verifyInstalledSource(root, sourceManifestPath, admitted) {
  let found;
  try { found = stagedSourceIdentity(root, sourceManifestPath); } catch { fail('installed source does not match its staged manifest'); }
  if (found.inputDigest !== admitted.source.inputDigest || found.manifestSha256 !== admitted.source.manifestSha256 ||
      found.lockfileSha256 !== admitted.lockSha256 || found.fingerprint !== admitted.source.fingerprint ||
      found.commit !== admitted.source.commit || found.tree !== admitted.source.tree) fail('installed source identity differs');
}
function deferredOutputRecords(records, importers) {
  if (!Array.isArray(records) || records.length > MAX_PACKAGES) fail('invalid deferred workspace bin inventory');
  const seen = new Set(), result = [];
  for (const record of records) {
    if (!record || typeof record !== 'object' || Array.isArray(record)) fail('invalid deferred workspace bin record');
    sourcePath(record.importer, 'deferred workspace importer');
    sourcePath(record.target, 'deferred workspace bin target');
    if (record.target !== 'dist/cli.js' || !record.source || typeof record.source !== 'object' || Array.isArray(record.source) ||
        record.source.path !== `${record.importer}/src/cli.ts` || !HASH.test(record.source.sha256 ?? '') ||
        !Array.isArray(record.commands) || !record.commands.length || record.commands.length > MAX_PACKAGES ||
        record.commands.some(command => typeof command !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(command)) ||
        new Set(record.commands).size !== record.commands.length) fail('invalid deferred workspace bin record');
    sourcePath(record.source.path, 'deferred workspace bin source');
    const importer = importers.get(record.importer);
    if (!importer || importer.name !== packageName(record.name) || importer.manifestSha256 !== record.manifestSha256 ||
        !HASH.test(record.manifestSha256 ?? '') || seen.has(record.importer)) fail('deferred workspace bin differs from importer graph');
    seen.add(record.importer);
    const identity = JSON.stringify([record.importer, record.name, record.manifestSha256, record.target,
      [...record.commands].sort(), record.source.path, record.source.sha256]);
    result.push({ importer: record.importer, directory: importer.directory, identity });
  }
  return result.sort((a, b) => a.importer.localeCompare(b.importer));
}
function assertDeferredOutputsAbsent(root, records, state) {
  for (const record of records) {
    // Check the excluded ancestor itself, not just the target: a file, an
    // empty directory, or even a dangling symlink invalidates the deferral.
    safeDirectory(root, record.directory, 'deferred workspace importer', state);
    try { lstatSync(resolve(record.directory, 'dist')); }
    catch (error) {
      if (error?.code === 'ENOENT') continue;
      fail('deferred workspace output cannot be inspected');
    }
    fail(`deferred workspace bin output directory exists: ${record.importer}/dist`);
  }
}
function rejectUnrecordedModuleDirectories(root, importers, state) {
  const allowed = new Set([...importers.values()].map(item => resolve(item.directory, 'node_modules')));
  let entries = 0;
  const walk = directory => {
    safeDirectory(root, directory, 'workspace source directory', state);
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      if (++entries > MAX_FILES) fail('workspace source entry limit exceeded');
      const path = resolve(directory, item.name), stat = lstatSync(path);
      if (item.name === '.git' || item.name === '.pnpm-store') fail('unreviewed workspace control or store directory');
      if (item.name === 'node_modules') {
        if (!allowed.has(path) || !stat.isDirectory() || stat.isSymbolicLink()) fail('unrecorded workspace node_modules directory');
        continue;
      }
      if (stat.isDirectory() && !stat.isSymbolicLink()) walk(path);
    }
  };
  walk(root);
}
function verifyStableTree(state) {
  for (const [path, expected] of state.identities) {
    let stat;
    try { stat = lstatSync(path); } catch { fail('installed tree changed during inspection'); }
    if (fileIdentity(stat) !== expected.identity || (expected.link !== undefined && (!stat.isSymbolicLink() || readlinkSync(path) !== expected.link))) {
      fail('installed tree changed during inspection');
    }
  }
}

function runningPlatform() {
  let libc = 'unknown';
  if (process.platform === 'linux') {
    try {
      const report = process.report?.getReport();
      if (typeof report?.header?.glibcVersionRuntime === 'string' && report.header.glibcVersionRuntime) libc = 'glibc';
      else if (Array.isArray(report?.sharedObjects) && report.sharedObjects.some(path =>
        typeof path === 'string' && /(?:^|\/)ld-musl-[a-zA-Z0-9_.-]+\.so(?:\.[0-9]+)?$/.test(path))) libc = 'musl';
    } catch { /* An unknown libc can never justify an omission by itself. */ }
  }
  return Object.freeze({ os: process.platform, cpu: process.arch, libc });
}

/**
 * Compare a confined installed workspace to a live, opaque workspace archive
 * admission. This validates file/graph identity only and never grants install,
 * script, network, runtime, or execution authority. Generated files and
 * unsupported patches still fail. Conditional platform omission is separate
 * from the strict, complete-snapshot report.
 */
function verifyWorkspace({ root, sourceManifestPath, capability, installRoot }, conditional) {
  const admitted = consumeWorkspacePnpmAdmission({ capability, root, sourceManifestPath });
  let base;
  try { base = realpathSync(resolve(installRoot)); } catch { fail('installed root is unavailable'); }
  safeDirectory(base, base, 'installed root');
  if (!admitted?.graph || Object.keys(admitted.graph).some(key => !['settings', 'importers', 'packages', 'snapshots'].includes(key)) ||
      !Array.isArray(admitted.graph.importers) || !Array.isArray(admitted.graph.packages) ||
      !Array.isArray(admitted.graph.snapshots) || !Array.isArray(admitted.archives) || admitted.graph.importers.length > MAX_PACKAGES ||
      admitted.graph.packages.length > MAX_PACKAGES || admitted.graph.snapshots.length > MAX_PACKAGES ||
      !(admitted.lockBytes instanceof Uint8Array) || digest(admitted.lockBytes) !== admitted.lockSha256 ||
      admitted.source?.lockfileSha256 !== admitted.lockSha256) fail('invalid admitted workspace graph');
  verifyInstalledSource(base, sourceManifestPath, admitted);
  const graph = admitted.graph, state = { bytes: 0, files: 0, identities: new Map() }, importers = new Map(), packages = new Map(), snapshots = new Map(), archives = new Map();
  for (const importer of graph.importers) {
    sourcePath(importer.path, 'importer path', true);
    if (importers.has(importer.path) || !Array.isArray(importer.roots) || !HASH.test(importer.manifestSha256 ?? '')) fail('invalid importer graph');
    const directory = importer.path === '.' ? base : resolve(base, importer.path);
    safeDirectory(base, directory, 'workspace importer', state);
    const manifest = readFileChecked(resolve(directory, 'package.json'), state, 16 * 1024 * 1024);
    if (manifest.sha256 !== importer.manifestSha256) fail(`workspace importer manifest differs: ${importer.path}`);
    importers.set(importer.path, { ...importer, directory });
  }
  if (!importers.has('.')) fail('root importer is missing');
  const deferred = deferredOutputRecords(admitted.deferredBins, importers);
  assertDeferredOutputsAbsent(base, deferred, state);
  rejectUnrecordedModuleDirectories(base, importers, state);
  for (const entry of graph.packages) {
    const { base: key } = snapshotBase(entry.key);
    if (entry.key !== key || packages.has(key)) fail('invalid package graph');
    packages.set(key, entry);
  }
  for (const entry of graph.snapshots) {
    const { base: key } = snapshotBase(entry.key);
    if (!packages.has(key) || snapshots.has(entry.key) || (entry.optional !== undefined && typeof entry.optional !== 'boolean')) fail('invalid snapshot graph');
    snapshots.set(entry.key, entry);
  }
  for (const archive of admitted.archives) {
    const key = `${packageName(archive.name)}@${archive.version}`;
    if (archives.has(key) || !(archive.bytes instanceof Uint8Array) || digest(archive.bytes) !== archive.sha256 ||
        sri(archive.bytes) !== archive.integrity || !Array.isArray(archive.files)) fail('invalid admitted archive identity');
    const packageEntry = packages.get(key);
    if (!packageEntry || packageEntry.resolution?.integrity !== archive.integrity) fail('archive differs from lock');
    archives.set(key, archive);
  }
  if (archives.size !== packages.size) fail('admitted archives are incomplete');

  const expectedFiles = new Map(), visited = new Map(), actualOwners = new Map(), stores = new Set(), queue = [];
  const snapshotFor = (name, value) => {
    if (typeof value !== 'string' || !value || value.startsWith('link:') || value.startsWith('file:')) fail('unsupported installed dependency resolution');
    const qualified = snapshots.has(value) ? value : `${name}@${value}`;
    if (!snapshots.has(qualified)) fail(`unresolved installed snapshot: ${name}`);
    return qualified;
  };
  const platform = conditional ? runningPlatform() : undefined;
  const isOmittedEdge = (id, group) => {
    if (!platform || group !== 'optionalDependencies' || snapshots.get(id).optional !== true) return false;
    const metadata = packages.get(snapshotBase(id).base);
    let mismatch = false;
    for (const field of ['os', 'cpu', 'libc']) {
      const values = metadata[field];
      if (values === undefined) continue;
      // This supported subset is deliberately positive-only. Never infer a
      // skip from negations, wildcard/current tokens, or an unknown libc.
      if (!Array.isArray(values) || !values.length || values.length > 256 ||
          values.some(value => typeof value !== 'string' || !/^[a-z0-9_]+$/.test(value) ||
            value === 'any' || value === 'current' || value === 'unknown') ||
          new Set(values).size !== values.length) fail('unsupported platform omission constraint');
      if (platform[field] !== 'unknown' && !values.includes(platform[field])) mismatch = true;
    }
    return mismatch;
  };
  const snapshotEdges = id => {
    const snapshot = snapshots.get(id), out = [], names = new Set();
    for (const group of ['dependencies', 'optionalDependencies']) {
      const dependencies = snapshot[group] ?? {};
      if (!dependencies || typeof dependencies !== 'object' || Array.isArray(dependencies)) fail('invalid snapshot dependency map');
      for (const [name, target] of Object.entries(dependencies)) {
        packageName(name);
        if (names.has(name)) fail('duplicate snapshot dependency');
        names.add(name);
        out.push({ name, group, id: snapshotFor(name, target) });
      }
    }
    return out;
  };
  let selectedSnapshots, omittedSnapshots;
  if (conditional) {
    const roots = [];
    for (const importer of importers.values()) for (const edge of importer.roots) {
      if (!['dependencies', 'devDependencies', 'optionalDependencies'].includes(edge.group)) fail('invalid importer dependency group');
      if (edge.kind === 'archive') {
        const targetName = packageName(edge.target), id = snapshotFor(targetName, edge.version);
        if (snapshotBase(id).name !== targetName) fail('archive dependency identity differs');
        roots.push({ id, group: edge.group });
      } else if (edge.kind !== 'workspace') fail('unsupported importer dependency');
    }
    const closure = includeOmissions => {
      const pending = roots.filter(edge => includeOmissions || !isOmittedEdge(edge.id, edge.group)).map(edge => edge.id), seen = new Set();
      for (let position = 0; position < pending.length; position++) {
        const id = pending[position];
        if (seen.has(id)) continue;
        seen.add(id);
        for (const edge of snapshotEdges(id)) if (includeOmissions || !isOmittedEdge(edge.id, edge.group)) pending.push(edge.id);
        if (pending.length > MAX_FILES) fail('platform graph edge limit exceeded');
      }
      return seen;
    };
    const all = closure(true);
    if (all.size !== snapshots.size) fail('admitted snapshot graph is incomplete');
    selectedSnapshots = closure(false);
    omittedSnapshots = [...all].filter(id => !selectedSnapshots.has(id)).sort();
  }
  const archiveFiles = key => {
    if (expectedFiles.has(key)) return expectedFiles.get(key);
    const archive = archives.get(key), parsed = inspectAdmittedArchiveFiles(archive.bytes);
    if (parsed.manifest.name !== archive.name || parsed.manifest.version !== archive.version) fail('archive manifest differs');
    for (const field of ['os', 'cpu', 'libc']) {
      if (JSON.stringify(parsed.manifest[field] ?? null) !== JSON.stringify(packages.get(key)[field] ?? null)) {
        fail(`archive platform metadata differs: ${key}/${field}`);
      }
    }
    const files = new Map();
    for (const file of parsed.files) files.set(file.path, { size: file.size, sha256: file.sha256, executable: file.executable });
    const reviewed = new Map();
    for (const file of archive.files) {
      sourcePath(file.path, 'archive file path');
      if (reviewed.has(file.path) || !HASH.test(file.sha256 ?? '') || !Number.isSafeInteger(file.size) || file.size < 0) fail('invalid reviewed file inventory');
      reviewed.set(file.path, file);
    }
    if (files.size !== reviewed.size) fail('reviewed archive inventory differs');
    for (const [path, file] of files) {
      const reviewedFile = reviewed.get(path);
      if (!reviewedFile || reviewedFile.size !== file.size || reviewedFile.sha256 !== file.sha256) fail('reviewed archive file differs');
    }
    const binTargets = declaredBinTargets(parsed.manifest, files);
    for (const file of parsed.files) if (binTargets.has(file.path)) {
      const normalized = fixedBinFile(file);
      files.set(file.path, { ...files.get(file.path), isBin: true, ...(normalized ? { binFixed: normalized } : {}) });
    }
    expectedFiles.set(key, files); return files;
  };
  // Also inspect archives excluded by platform selection. A missing optional
  // package is never permission to replace or omit its independent review.
  for (const key of packages.keys()) archiveFiles(key);
  // A patch is accepted only as a fresh result of the independently reviewed
  // workspace capability. The original archive remains checked in full; each
  // changed file must bind to that original and to the exact output bytes.
  const patchBySnapshot = new Map(), patches = admitted.patches ?? [];
  if (!Array.isArray(patches) || patches.length > MAX_PACKAGES) fail('invalid admitted patch inventory');
  let patchBytes = 0;
  const mode = value => Number.isInteger(value) && value >= 0 && value <= 0o111 && (value & ~0o111) === 0;
  for (const patch of patches) {
    const archive = archives.get(patch.packageKey);
    if (!archive || patch.archive?.name !== archive.name || patch.archive?.version !== archive.version ||
        patch.archive?.sha256 !== archive.sha256 || patch.archive?.integrity !== archive.integrity ||
        !HASH.test(patch.patch?.sha256 ?? '') || !Array.isArray(patch.snapshotKeys) || !patch.snapshotKeys.length ||
        !Array.isArray(patch.files) || !patch.files.length || patch.files.length > MAX_FILES) fail('invalid reviewed patch identity');
    sourcePath(patch.patch.path, 'patch source path');
    if (!isSourceInput(patch.patch.path)) fail('reviewed patch is not a staged source input');
    const patchPath = resolve(base, patch.patch.path);
    let patchReal;
    try { patchReal = realpathSync(patchPath); } catch { fail('reviewed patch source is missing'); }
    if (patchReal !== patchPath || !patchReal.startsWith(`${base}${sep}`)) fail('reviewed patch source is unsafe');
    const source = readFileChecked(patchPath, state, 16 * 1024 * 1024);
    if (source.sha256 !== patch.patch.sha256) fail('reviewed patch source differs');
    const original = archiveFiles(patch.packageKey), changed = new Map();
    for (const file of patch.files) {
      sourcePath(file.path, 'patched file path');
      const before = original.get(file.path);
      if (changed.has(file.path) || !before || before.isBin || !HASH.test(file.before?.sha256 ?? '') ||
          !HASH.test(file.after?.sha256 ?? '') || !Number.isSafeInteger(file.before?.size) || !Number.isSafeInteger(file.after?.size) ||
          file.before.size < 0 || file.after.size < 0 || file.after.size > MAX_FILE_BYTES ||
          !mode(file.before?.executable) || !mode(file.after?.executable) || file.before.executable !== file.after.executable ||
          !(file.bytes instanceof Uint8Array)) fail('unsupported reviewed patch file');
      if (before.sha256 !== file.before.sha256 || before.size !== file.before.size || before.executable !== file.before.executable) fail('reviewed patch input differs from archive');
      patchBytes += file.bytes.byteLength;
      if (patchBytes > MAX_TOTAL_BYTES || file.bytes.byteLength !== file.after.size || digest(file.bytes) !== file.after.sha256) fail('reviewed patch output differs');
      changed.set(file.path, { size: file.after.size, sha256: file.after.sha256, executable: file.after.executable });
    }
    const perSnapshot = new Map(original);
    for (const [path, file] of changed) perSnapshot.set(path, file);
    for (const id of patch.snapshotKeys) {
      if (!snapshots.has(id) || snapshotBase(id).base !== patch.packageKey || patchBySnapshot.has(id)) fail('invalid patched snapshot identity');
      patchBySnapshot.set(id, perSnapshot);
    }
  }
  const enqueue = (id, actual) => {
    const { name, base: key } = snapshotBase(id);
    const storeRoot = resolve(base, 'node_modules/.pnpm'), rel = relative(storeRoot, actual);
    const parts = rel.split(sep), names = name.split('/');
    if (rel.startsWith(`..${sep}`) || isAbsolute(rel) || parts.length !== 2 + names.length ||
        parts[0] !== virtualStoreName(id) || parts[1] !== 'node_modules' || parts.slice(2).join('/') !== name) {
      fail('package is outside its exact virtual-store snapshot location');
    }
    safeDirectory(base, actual, 'installed package', state);
    const previous = visited.get(id), owner = actualOwners.get(actual);
    if ((previous && previous !== actual) || (owner && owner !== id)) fail('snapshot package identity is ambiguous');
    if (previous) return;
    visited.set(id, actual); actualOwners.set(actual, id); stores.add(parts[0]);
    queue.push({ id, actual, key, name, modules: resolve(storeRoot, parts[0], 'node_modules') });
  };
  for (const importer of importers.values()) {
    const modules = resolve(importer.directory, 'node_modules'), names = new Set(), declared = new Set();
    if (importer.path === '.') names.add('.pnpm');
    for (const edge of importer.roots) {
      packageName(edge.name);
      if (declared.has(edge.name) || names.has(edge.name)) fail('duplicate importer dependency');
      declared.add(edge.name);
      if (edge.kind !== 'archive' || !isOmittedEdge(snapshotFor(packageName(edge.target), edge.version), edge.group)) names.add(edge.name);
    }
    actualEntries(base, modules, names, { allowStore: importer.path === '.', allowMissing: importer.path !== '.' }, state);
    for (const edge of importer.roots) {
      if (edge.kind === 'archive' && isOmittedEdge(snapshotFor(packageName(edge.target), edge.version), edge.group)) continue;
      const actual = resolveLink(base, resolve(modules, edge.name), 'importer dependency', state);
      if (edge.kind === 'workspace') {
        const linked = importers.get(edge.target);
        if (!linked || linked.name !== edge.name || actual !== linked.directory) fail('workspace dependency target differs');
      } else if (edge.kind === 'archive') {
        const targetName = packageName(edge.target), id = snapshotFor(targetName, edge.version);
        if (snapshotBase(id).name !== targetName) fail('archive dependency identity differs');
        enqueue(id, actual);
      } else fail('unsupported importer dependency');
    }
  }
  for (let position = 0; position < queue.length; position++) {
    const current = queue[position], expected = patchBySnapshot.get(current.id) ?? archiveFiles(current.key), actual = new Map();
    const expectedDirectories = new Set();
    for (const path of expected.keys()) {
      const parts = path.split('/');
      for (let end = 1; end < parts.length; end++) expectedDirectories.add(parts.slice(0, end).join('/'));
    }
    const walk = (directory, prefix = '') => {
      safeDirectory(base, directory, 'package directory', state);
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name), rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        sourcePath(rel, 'package file path');
        const stat = lstatSync(path);
        if (stat.isSymbolicLink()) fail('installed package contains a symlink');
        if (stat.isDirectory()) {
          if (!expectedDirectories.has(rel)) fail(`unrecorded package directory: ${rel}`);
          walk(path, rel);
        }
        else if (stat.isFile()) {
          if (!expected.has(rel) || actual.has(rel)) fail(`unrecorded package file: ${rel}`);
          actual.set(rel, readFileChecked(path, state));
        } else fail('unsupported installed package entry');
      }
    };
    walk(current.actual);
    if (actual.size !== expected.size) fail('installed package files are incomplete');
    for (const [path, want] of expected) {
      const got = actual.get(path);
      const matches = candidate => candidate && got && got.size === candidate.size && got.sha256 === candidate.sha256 && got.executable === candidate.executable;
      if (!matches(want) && !matches(want.binFixed)) fail(`installed package differs from reviewed archive: ${path}`);
    }
    const deps = snapshotEdges(current.id).filter(edge => !isOmittedEdge(edge.id, edge.group));
    const names = new Set([current.name]);
    for (const edge of deps) {
      if (names.has(edge.name)) fail('self or duplicate installed dependency');
      names.add(edge.name);
    }
    actualEntries(base, current.modules, names, {}, state);
    for (const edge of deps) {
      const actualTarget = resolveLink(base, resolve(current.modules, edge.name), 'package dependency', state);
      enqueue(edge.id, actualTarget);
    }
  }
  if (conditional
    ? visited.size !== selectedSnapshots.size || [...visited.keys()].some(id => !selectedSnapshots.has(id))
    : visited.size !== snapshots.size) fail('installed snapshot set is incomplete');
  const storeRoot = resolve(base, 'node_modules/.pnpm');
  safeDirectory(base, storeRoot, 'virtual store', state);
  let foundLock = false;
  for (const entry of readdirSync(storeRoot, { withFileTypes: true })) {
    if (entry.name === 'lock.yaml') {
      if (foundLock) fail('duplicate virtual-store lock');
      const lock = readFileChecked(resolve(storeRoot, entry.name), state, 16 * 1024 * 1024);
      if (lock.sha256 !== admitted.lockSha256 || lock.size !== admitted.lockBytes.byteLength) fail('virtual-store lock differs');
      foundLock = true;
    } else if (!stores.has(entry.name)) fail(`unrecorded virtual-store entry: ${entry.name}`);
    else {
      const store = resolve(storeRoot, entry.name);
      safeDirectory(base, store, 'virtual-store package', state);
      const children = readdirSync(store);
      if (children.length !== 1 || children[0] !== 'node_modules') fail('unrecorded virtual-store package entry');
      safeDirectory(base, resolve(store, 'node_modules'), 'virtual-store modules', state);
    }
  }
  if (!foundLock) fail('virtual-store lock is missing');
  rejectUnrecordedModuleDirectories(base, importers, state);
  verifyInstalledSource(base, sourceManifestPath, admitted);
  const confirmed = consumeWorkspacePnpmAdmission({ capability, root, sourceManifestPath });
  if (confirmed.source.inputDigest !== admitted.source.inputDigest || confirmed.source.manifestSha256 !== admitted.source.manifestSha256 ||
      confirmed.lockSha256 !== admitted.lockSha256) fail('admission changed during installed-tree inspection');
  const confirmedDeferred = deferredOutputRecords(confirmed.deferredBins, importers);
  if (confirmedDeferred.length !== deferred.length || confirmedDeferred.some((record, index) => record.identity !== deferred[index].identity)) {
    fail('deferred workspace bin admission changed during installed-tree inspection');
  }
  assertDeferredOutputsAbsent(base, confirmedDeferred, state);
  verifyStableTree(state);
  return Object.freeze({ schema: conditional ? 'aura3d.pnpm-installed-workspace-platform/1' : 'aura3d.pnpm-installed-workspace/1',
    sourceInputDigest: admitted.source.inputDigest,
    lockfileSha256: admitted.lockSha256, snapshotKeys: Object.freeze([...visited.keys()].sort()),
    importerCount: importers.size, fileCount: state.files, bytes: state.bytes,
    ...(conditional ? { platform, omittedSnapshotKeys: Object.freeze(omittedSnapshots), installationAuthorized: false } : {}),
    scope: conditional
      ? 'Conditional point-in-time graph and archive verification using this process platform only; pnpm invocation/configuration, runtime identity, isolation and execution remain unverified.'
      : 'Point-in-time reviewed archive, supported source patch and complete installed graph identity only; package-manager custody, generated files, platform omissions and execution remain separate.' });
}

/** Strict report: every admitted snapshot and every graph edge must exist. */
export function verifyInstalledPnpmWorkspace(input) {
  return verifyWorkspace(input, false);
}

/**
 * Conditional report for direct optional platform mismatches, using only this
 * verifier process's observed platform. The runner must independently bind
 * pnpm to that same environment and supported architecture configuration.
 */
export function verifyInstalledPnpmWorkspaceForPlatform(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !['root', 'sourceManifestPath', 'capability', 'installRoot'].includes(key))) {
    fail('unsupported platform verification options');
  }
  return verifyWorkspace(input, true);
}

function npmInstalledPath(path) {
  sourcePath(path, 'npm installed package path');
  const parts = path.split('/');
  let name;
  for (let index = 0; index < parts.length;) {
    if (parts[index++] !== 'node_modules' || index >= parts.length) fail('invalid npm installed package path');
    name = parts[index++];
    if (name.startsWith('@')) {
      if (index >= parts.length) fail('invalid npm installed package path');
      name += `/${parts[index++]}`;
    }
    packageName(name);
  }
  return name;
}

function npmBinDeclarations(manifest, files) {
  if (manifest.directories?.bin !== undefined) fail('directory-based npm bins are unavailable');
  if (manifest.bin === undefined) return new Map();
  const entries = typeof manifest.bin === 'string'
    ? [[packageName(manifest.name).split('/').at(-1), manifest.bin]]
    : Object.entries(consumerObject(manifest.bin, 'npm bin declaration'));
  const bins = new Map();
  for (const [command, raw] of entries) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(command) ||
        typeof raw !== 'string' || !raw || isAbsolute(raw) || raw.includes('\\')) fail('unsupported npm bin declaration');
    const target = raw.replace(/^(?:\.\/)+/, '');
    sourcePath(target, 'npm bin target');
    if (!files.has(target) || bins.has(command)) fail('npm bin target is not an admitted regular file');
    bins.set(command, target);
  }
  return bins;
}

/**
 * Inspect a complete npm tree without executing it. Snapshot bytes supplied
 * here are not admission authority; the public unbound result says so.
 */
function inspectNpmTree({ projectDir, lock, archives }, admissionBound) {
  if (typeof projectDir !== 'string' || !isAbsolute(projectDir) || !lock || typeof lock !== 'object' ||
      Array.isArray(lock) || !lock.packages || typeof lock.packages !== 'object' || Array.isArray(lock.packages) ||
      lock.lockfileVersion !== 3 || !Object.hasOwn(lock.packages, '') || !lock.packages[''] ||
      typeof lock.packages[''] !== 'object' || Array.isArray(lock.packages['']) ||
      !Array.isArray(archives) || archives.length > MAX_PACKAGES) fail('invalid npm installed-tree inputs');
  let root;
  try {
    const stat = lstatSync(projectDir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('npm consumer project must be a real directory');
    root = realpathSync(projectDir);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('PNPM_INSTALLED_TREE:')) throw error;
    fail('npm consumer project is unavailable');
  }
  const state = { bytes: 0, files: 0, identities: new Map() };
  safeDirectory(root, root, 'npm consumer project', state);
  const entries = Object.entries(lock.packages).filter(([path]) => path !== '');
  if (entries.length > MAX_PACKAGES) fail('npm installed package limit exceeded');

  const snapshots = new Map(), used = new Set();
  let archiveBytes = 0;
  for (const archive of archives) {
    if (!archive || typeof archive !== 'object' || typeof archive.resolved !== 'string' ||
        snapshots.has(archive.resolved) || !(archive.bytes instanceof Uint8Array) ||
        !archive.bytes.byteLength || archive.bytes.byteLength > 64 * 1024 * 1024) fail('invalid npm archive snapshot');
    archiveBytes += archive.bytes.byteLength;
    if (archiveBytes > MAX_TOTAL_BYTES) fail('npm archive byte limit exceeded');
    const bytes = Buffer.from(archive.bytes), parsed = inspectNpmArchive(bytes), files = new Map();
    for (const file of parsed.files) {
      sourcePath(file.path, 'npm archive file path');
      if (files.has(file.path)) fail('duplicate npm archive file');
      files.set(file.path, { size: file.bytes.byteLength, sha256: digest(file.bytes) });
    }
    snapshots.set(archive.resolved, { bytes, manifest: parsed.manifest, files,
      bins: npmBinDeclarations(parsed.manifest, files) });
  }
  const packages = new Map(), moduleGroups = new Map();
  for (const [path, entry] of entries) {
    const name = npmInstalledPath(path);
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.resolved !== 'string') fail('invalid npm lock entry');
    // A port/path that merely looks local is not a sealed dispatcher. Until a
    // socket-bound dispatcher authority exists, no dynamic loopback lock URL
    // may be used as installed-tree evidence.
    if (!entry.resolved.startsWith('file:')) {
      let url;
      try { url = new URL(entry.resolved); } catch { fail('invalid npm archive resolution'); }
      if (url.protocol === 'http:') fail('npm loopback resolution lacks sealed dispatcher authority');
      if (url.protocol !== 'https:' || url.hostname !== 'registry.npmjs.org' || url.port ||
          url.username || url.password || url.search || url.hash) fail('unsupported npm archive resolution');
    }
    const snapshot = snapshots.get(entry.resolved);
    if (!snapshot || entry.integrity !== sri(snapshot.bytes)) fail('npm installed package archive differs from lock');
    if (snapshot.manifest.name !== (entry.name ?? name) || snapshot.manifest.version !== entry.version) fail('npm installed package identity differs from archive');
    used.add(entry.resolved);
    const marker = path.lastIndexOf('node_modules/'), modules = path.slice(0, marker + 'node_modules'.length);
    if (!moduleGroups.has(modules)) moduleGroups.set(modules, new Map());
    const group = moduleGroups.get(modules);
    if (group.has(name) || packages.has(path)) fail('duplicate npm installed package');
    const item = { path, name, snapshot, directory: resolve(root, path) };
    group.set(name, item); packages.set(path, item);
  }
  if (used.size !== snapshots.size) fail('npm archive inventory has unused entries');
  for (const item of packages.values()) {
    // No optional flag, current verifier platform, or caller-supplied tuple
    // proves what platform/configuration the installer actually used.
    try { lstatSync(item.directory); }
    catch (error) {
      if (error?.code === 'ENOENT') fail(`npm installed package is missing (platform custody unavailable): ${item.path}`);
      fail('npm installed package cannot be inspected');
    }
    safeDirectory(root, item.directory, 'npm installed package', state);
    const expectedDirectories = new Set(), actual = new Map();
    for (const path of item.snapshot.files.keys()) {
      const parts = path.split('/');
      for (let end = 1; end < parts.length; end++) expectedDirectories.add(parts.slice(0, end).join('/'));
    }
    const walk = (directory, prefix = '') => {
      safeDirectory(root, directory, 'npm package directory', state);
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name), rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        sourcePath(rel, 'npm package file path');
        const stat = lstatSync(path);
        if (stat.isSymbolicLink()) fail('npm installed package contains a symlink');
        if (!prefix && entry.name === 'node_modules') {
          if (!stat.isDirectory()) fail('invalid nested npm node_modules');
          continue;
        }
        if (stat.isDirectory()) {
          if (!expectedDirectories.has(rel)) fail(`unrecorded npm package directory: ${rel}`);
          walk(path, rel);
        } else if (stat.isFile()) {
          if (!item.snapshot.files.has(rel) || actual.has(rel)) fail(`unrecorded npm package file: ${rel}`);
          actual.set(rel, readFileChecked(path, state));
        } else fail('unsupported npm installed package entry');
      }
    };
    walk(item.directory);
    if (actual.size !== item.snapshot.files.size) fail('npm installed package files are incomplete');
    for (const [path, want] of item.snapshot.files) {
      const got = actual.get(path);
      if (!got || got.size !== want.size || got.sha256 !== want.sha256) fail(`npm installed package differs from admitted archive: ${item.path}/${path}`);
    }
  }

  const inspectModules = modules => {
    const directory = resolve(root, modules), expected = moduleGroups.get(modules) ?? new Map();
    let present = true;
    try { lstatSync(directory); } catch (error) {
      if (error?.code === 'ENOENT') present = false;
      else fail('npm node_modules cannot be inspected');
    }
    if (!present) {
      if (expected.size) fail(`npm node_modules is missing: ${modules}`);
      return;
    }
    safeDirectory(root, directory, 'npm node_modules directory', state);
    const expectedBins = new Map(), seen = new Set();
    for (const item of expected.values()) for (const [command, target] of item.snapshot.bins) {
      const absolute = resolve(item.directory, target), prior = expectedBins.get(command);
      if (prior && prior !== absolute) fail(`ambiguous npm bin command: ${command}`);
      expectedBins.set(command, absolute);
    }
    let binDirectory = false;
    const inspectPackage = name => {
      if (!expected.has(name) || seen.has(name)) fail(`unrecorded npm installed package: ${modules}/${name}`);
      seen.add(name);
      inspectModules(`${expected.get(name).path}/node_modules`);
    };
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.name === '.package-lock.json' && modules === 'node_modules') {
        readFileChecked(path, state, 16 * 1024 * 1024);
      } else if (entry.name === '.bin') {
        binDirectory = true;
        safeDirectory(root, path, 'npm bin directory', state);
        const commands = new Set();
        for (const command of readdirSync(path)) {
          const target = expectedBins.get(command), link = resolve(path, command);
          if (!target || commands.has(command)) fail(`undeclared npm bin command: ${command}`);
          let stat, text, real;
          try { stat = lstatSync(link); text = readlinkSync(link); real = realpathSync(link); }
          catch { fail(`npm bin target is unavailable: ${command}`); }
          if (!stat.isSymbolicLink() || !text || isAbsolute(text) || text.includes('\\') || /[\x00-\x1f\x7f]/.test(text) ||
              resolve(path, text) !== target || real !== target) fail(`npm bin does not target its declared file: ${command}`);
          noteIdentity(state, link, stat, text);
          commands.add(command);
        }
        if (commands.size !== expectedBins.size) fail('npm bin inventory is incomplete');
      } else if (entry.name.startsWith('@')) {
        const scope = resolve(directory, entry.name);
        if (!/^@[a-z0-9][a-z0-9._-]*$/.test(entry.name)) fail('invalid npm package scope');
        safeDirectory(root, scope, 'npm package scope', state);
        const children = readdirSync(scope);
        if (!children.length) fail('empty npm package scope');
        for (const child of children) inspectPackage(packageName(`${entry.name}/${child}`));
      } else inspectPackage(packageName(entry.name));
    }
    if (seen.size !== expected.size) fail(`npm installed package inventory is incomplete: ${modules}`);
    if (!binDirectory && expectedBins.size) fail('npm bin directory is missing');
  };
  inspectModules('node_modules');
  verifyStableTree(state);
  return Object.freeze({ schema: 'aura3d.npm-installed-consumer/1',
    archiveAdmissionBound: admissionBound, packagePaths: Object.freeze([...packages.keys()].sort()),
    fileCount: state.files, bytes: state.bytes, installationAuthorized: false, executionAuthorized: false,
    scope: admissionBound
      ? 'Point-in-time exact admitted npm graph, archive bytes and declared bins only; installer identity, platform, isolation and execution remain unverified.'
      : 'Unbound structural npm tree observation only; archive admission, installer identity, platform, isolation and execution remain unverified.' });
}

/** Structural comparison only; supplied bytes and lock are not authenticated. */
export function inspectInstalledNpmConsumer(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !['projectDir', 'lock', 'archives'].includes(key))) fail('invalid npm observation options');
  return inspectNpmTree(input, false);
}

/** Bind both ends of a complete npm tree inspection to one live admission. */
export function verifyInstalledNpmConsumer(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !['projectDir', 'admission'].includes(key)) ||
      !input.admission || typeof input.admission !== 'object' || Array.isArray(input.admission) ||
      Object.keys(input.admission).some(key => !['capability', 'manifestBytes', 'lockBytes'].includes(key))) {
    fail('invalid npm admission verification options');
  }
  const { capability, manifestBytes, lockBytes } = input.admission;
  const request = { capability, manifestBytes, lockBytes };
  const admitted = consumeArchiveAdmission(request);
  consumerJson(manifestBytes, 'admitted npm manifest');
  const lock = consumerJson(lockBytes, 'admitted npm lock');
  if (!lock.packages || typeof lock.packages !== 'object' || Array.isArray(lock.packages)) fail('invalid admitted npm graph');
  let root;
  try {
    const stat = lstatSync(input.projectDir);
    if (!stat.isDirectory() || stat.isSymbolicLink()) fail('npm consumer project must be a real directory');
    root = realpathSync(input.projectDir);
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('PNPM_INSTALLED_TREE:')) throw error;
    fail('npm consumer project is unavailable');
  }
  const state = { bytes: 0, files: 0, identities: new Map() };
  safeDirectory(root, root, 'npm consumer project', state);
  const validateInputs = () => {
    const actualManifest = readFileChecked(resolve(root, 'package.json'), state, 16 * 1024 * 1024);
    const actualLock = readFileChecked(resolve(root, 'package-lock.json'), state, 16 * 1024 * 1024);
    if (actualManifest.sha256 !== digest(manifestBytes) || actualManifest.size !== manifestBytes.byteLength ||
        actualLock.sha256 !== digest(lockBytes) || actualLock.size !== lockBytes.byteLength) fail('npm consumer manifest or lock differs from admission');
    const byResolution = new Map(admitted.map(item => [item.resolved, item.bytes])), seen = new Set();
    for (const entry of Object.values(lock.packages)) {
      if (!entry || typeof entry !== 'object' || typeof entry.resolved !== 'string' || !entry.resolved.startsWith('file:')) continue;
      const local = entry.resolved.slice(5).replace(/^(?:\.\/)+/, '');
      sourcePath(local, 'npm local archive path');
      if (seen.has(local)) continue;
      seen.add(local);
      const path = resolve(root, local);
      let real;
      try { real = realpathSync(path); } catch { fail('npm local archive is unavailable'); }
      if (real !== path || !real.startsWith(`${root}${sep}`)) fail('npm local archive path is unsafe');
      const actual = readFileChecked(path, state, 64 * 1024 * 1024), expected = byResolution.get(entry.resolved);
      if (!expected || actual.size !== expected.byteLength || actual.sha256 !== digest(expected)) fail('npm local archive differs from admission');
    }
  };
  validateInputs();
  const report = inspectNpmTree({ projectDir: root, lock, archives: admitted }, true);
  validateInputs();
  const confirmed = consumeArchiveAdmission(request);
  const identities = values => values.map(item => [item.resolved, item.bytes.byteLength, digest(item.bytes)]).sort(([a], [b]) => a.localeCompare(b));
  if (JSON.stringify(identities(admitted)) !== JSON.stringify(identities(confirmed))) fail('npm admission changed during installed-tree inspection');
  verifyStableTree(state);
  return Object.freeze({ ...report, manifestSha256: digest(manifestBytes), lockfileSha256: digest(lockBytes) });
}

function consumerVirtualName(id) {
  const info = snapshotBase(id);
  if (!info.version.startsWith('file:')) return virtualStoreName(id);
  const first = id.indexOf('('), suffix = first < 0 ? '' : id.slice(first);
  const local = info.version.replace(/^file:/, 'file+').replaceAll('/', '+');
  return virtualStoreName(`${local}${suffix}`);
}
function consumerObject(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`invalid ${label}`);
  return value;
}
function consumerJson(bytes, label) {
  let text, value;
  try {
    text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    value = JSON.parse(text);
  } catch { fail(`invalid ${label}`); }
  let compact = '', quoted = false, escaped = false;
  for (const char of text) {
    if (quoted) {
      compact += char;
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === '"') quoted = false;
    } else if (char === '"') { quoted = true; compact += char; }
    else if (!/\s/.test(char)) compact += char;
  }
  if (compact !== JSON.stringify(value)) fail(`ambiguous ${label}`);
  return consumerObject(value, label);
}
function consumerBinDeclarations(manifest, files) {
  if (manifest.directories?.bin !== undefined && manifest.bin === undefined) fail('directory-based package bins are unavailable');
  if (manifest.bin === undefined) return new Map();
  const entries = typeof manifest.bin === 'string'
    ? [[packageName(manifest.name).split('/').at(-1), manifest.bin]]
    : Object.entries(consumerObject(manifest.bin, 'package bin declaration'));
  const result = new Map();
  for (const [command, raw] of entries) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(command) || command === 'node' ||
        typeof raw !== 'string' || !raw || isAbsolute(raw) || raw.includes('\\')) fail('unsupported package bin declaration');
    const target = raw.replace(/^(?:\.\/)+/, '');
    sourcePath(target, 'package bin path');
    if (!files.has(target) || result.has(command)) fail('package bin target is not an admitted regular file');
    result.set(command, target);
  }
  return result;
}
function consumerShim(modules, storeRoot, alias, packageDir, file) {
  const rootModules = resolve(storeRoot, 'node_modules');
  const packageModules = resolve(packageDir, 'node_modules');
  const snapshotModules = resolve(storeRoot, consumerVirtualName(file.id), 'node_modules');
  const target = resolve(modules, alias, file.path);
  if (![modules, storeRoot, alias, packageDir, file.path].every(value => /^[A-Za-z0-9@/._+-]+$/.test(value))) {
    fail('unsupported shell shim path');
  }
  const nodePath = [packageModules, snapshotModules, rootModules].join(':');
  const source = Buffer.from(file.bytes);
  const shebang = source.subarray(0, Math.min(source.length, 2048)).toString('utf8').split('\n', 1)[0].replace(/\r$/, '');
  const node = shebang === '#!/usr/bin/env node' || shebang === '#!/usr/bin/node';
  if (shebang.startsWith('#!') && !node) fail('unsupported package bin interpreter');
  const prefix = String.raw`#!/bin/sh
basedir=$(dirname "$(echo "$0" | sed -e 's,\\,/,g')")

case ` + '`uname`' + String.raw` in
    *CYGWIN*|*MINGW*|*MSYS*)
        if command -v cygpath > /dev/null 2>&1; then
            basedir=` + '`cygpath -w "$basedir"`' + String.raw`
        fi
    ;;
esac

if [ -z "$NODE_PATH" ]; then
  export NODE_PATH="` + nodePath + String.raw`"
else
  export NODE_PATH="` + nodePath + String.raw`:$NODE_PATH"
fi
`;
  const command = `$basedir/../${alias}/${file.path}`;
  const body = node
    ? `if [ -x "$basedir/node" ]; then\n  exec "$basedir/node"  "${command}" "$@"\nelse\n  exec node  "${command}" "$@"\nfi\n`
    : `exec "${command}"   "$@"\nexit $?\n`;
  return Buffer.from(`${prefix}${body}# cmd-shim-target=${target}\n`);
}
function consumerEntries(root, directory, expectedNames, special, state) {
  safeDirectory(root, directory, 'consumer node_modules directory', state);
  const seen = new Set();
  const add = name => {
    if (seen.has(name) || !expectedNames.has(name)) fail(`unrecorded consumer dependency: ${name}`);
    seen.add(name);
  };
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (special.has(entry.name)) {
      const path = resolve(directory, entry.name), kind = special.get(entry.name);
      if (kind === 'directory') safeDirectory(root, path, 'consumer metadata directory', state);
      else if (kind !== 'file') fail('invalid consumer metadata entry');
      special.delete(entry.name);
    } else if (entry.name.startsWith('@')) {
      if (!/^@[a-z0-9][a-z0-9._-]*$/.test(entry.name)) fail('invalid consumer scope');
      const scope = resolve(directory, entry.name);
      safeDirectory(root, scope, 'consumer scope', state);
      const children = readdirSync(scope, { withFileTypes: true });
      if (!children.length) fail('empty consumer scope');
      for (const child of children) add(packageName(`${entry.name}/${child.name}`));
    } else add(packageName(entry.name));
  }
  if (seen.size !== expectedNames.size || special.size) fail('missing consumer dependency or metadata entry');
}
function consumerMetadata(root, storeRoot, state, input, snapshots, selected, omitted, aliases) {
  const path = resolve(root, 'node_modules/.modules.yaml');
  const data = readFileChecked(path, state, 16 * 1024 * 1024, true).bytes;
  const metadata = consumerJson(data, 'consumer modules metadata');
  const allowed = ['hoistedDependencies', 'hoistPattern', 'included', 'injectedDeps', 'layoutVersion', 'nodeLinker',
    'packageManager', 'pendingBuilds', 'publicHoistPattern', 'prunedAt', 'registries', 'skipped', 'storeDir',
    'virtualStoreDir', 'virtualStoreDirMaxLength', 'allowBuilds'];
  if (Object.keys(metadata).some(key => !allowed.includes(key)) || metadata.layoutVersion !== 5 ||
      metadata.nodeLinker !== 'isolated' || metadata.packageManager !== 'pnpm@11.1.3' ||
      metadata.virtualStoreDir !== '.pnpm' || metadata.virtualStoreDirMaxLength !== 120 ||
      JSON.stringify(metadata.hoistPattern) !== '["*"]' || JSON.stringify(metadata.publicHoistPattern) !== '[]' ||
      JSON.stringify(metadata.included) !== '{"dependencies":true,"devDependencies":true,"optionalDependencies":true}' ||
      JSON.stringify(metadata.injectedDeps) !== '{}' || JSON.stringify(metadata.pendingBuilds) !== '[]' ||
      !Array.isArray(metadata.skipped) || JSON.stringify([...metadata.skipped].sort()) !== JSON.stringify(omitted) ||
      (metadata.prunedAt !== undefined && (typeof metadata.prunedAt !== 'string' || !Number.isFinite(Date.parse(metadata.prunedAt)) ||
        new Date(metadata.prunedAt).toUTCString() !== metadata.prunedAt))) {
    fail('consumer modules metadata differs from supported configuration');
  }
  if (metadata.allowBuilds !== undefined && JSON.stringify(metadata.allowBuilds) !== '{}') fail('consumer build permissions are unavailable');
  const registries = consumerObject(metadata.registries, 'consumer registries');
  for (const [name, value] of Object.entries(registries)) {
    // A dynamically selected loopback port/path cannot be authenticated from
    // this metadata or a caller-supplied URL. The current pure dispatcher does
    // not seal a listener authority, so fail closed instead of accepting it.
    if (name === 'default' && !['https://registry.npmjs.org/', 'http://127.0.0.1:9/'].includes(value)) fail('unsupported consumer registry metadata');
    if (name === '@jsr' && value !== 'https://npm.jsr.io/') fail('unsupported consumer registry metadata');
    if (name !== 'default' && name !== '@jsr') fail('unsupported consumer registry metadata');
  }
  if (typeof registries.default !== 'string' || typeof input.storeDir !== 'string' || !isAbsolute(input.storeDir) ||
      metadata.storeDir !== resolve(input.storeDir, 'v11')) fail('consumer store metadata is not bound to the supplied store');
  const hoists = consumerObject(metadata.hoistedDependencies, 'consumer hoists'), privateHoists = new Map(), publicHoists = new Map();
  for (const [id, mapping] of Object.entries(hoists)) {
    if (!snapshots.has(id) || !selected.has(id)) fail('consumer hoist references an uninstalled snapshot');
    for (const [alias, location] of Object.entries(consumerObject(mapping, 'consumer hoist mapping'))) {
      packageName(alias);
      const possibilities = aliases.get(alias);
      if (!possibilities || possibilities.size !== 1 || !possibilities.has(id)) fail('consumer hoist is not uniquely bound to a dependency edge');
      const destination = location === 'private' ? privateHoists : location === 'public' ? publicHoists : undefined;
      if (!destination || destination.has(alias)) fail('invalid or duplicate consumer hoist');
      destination.set(alias, id);
    }
  }
  return { privateHoists, publicHoists };
}

export function verifyInstalledPnpmConsumer(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input) ||
      Object.keys(input).some(key => !['projectDir', 'admission', 'storeDir'].includes(key)) ||
      !input.admission || typeof input.admission !== 'object' ||
      Object.keys(input.admission).some(key => !['capability', 'manifestBytes', 'lockBytes'].includes(key))) fail('invalid consumer verification options');
  const { capability, manifestBytes, lockBytes } = input.admission;
  const admitted = consumePnpmConsumerGraph({ capability, manifestBytes, lockBytes });
  if (typeof input.projectDir !== 'string' || !isAbsolute(input.projectDir) || resolve(input.projectDir) !== input.projectDir) fail('invalid consumer project path');
  let root;
  try { root = realpathSync(input.projectDir); } catch { fail('consumer project is unavailable'); }
  if (root !== input.projectDir) fail('consumer project must have a canonical path');
  const state = { bytes: 0, files: 0, identities: new Map() };
  safeDirectory(root, root, 'consumer project', state);
  const manifest = readFileChecked(resolve(root, 'package.json'), state, 16 * 1024 * 1024);
  const lock = readFileChecked(resolve(root, 'pnpm-lock.yaml'), state, 16 * 1024 * 1024);
  if (manifest.sha256 !== admitted.manifestSha256 || lock.sha256 !== admitted.lockfileSha256) fail('consumer project differs from admission');
  const packages = new Map(), snapshots = new Map(), parsed = new Map();
  for (const item of admitted.packages) {
    if (packages.has(item.key) || digest(item.archive.bytes) !== item.archive.sha256 ||
        sri(item.archive.bytes) !== item.archive.integrity || item.resolution.integrity !== item.archive.integrity) fail('consumer archive identity differs');
    const archive = inspectAdmittedArchiveFiles(item.archive.bytes);
    if (archive.manifest.name !== item.name) fail('consumer archive name differs');
    for (const field of ['os', 'cpu', 'libc']) {
      if (JSON.stringify(archive.manifest[field] ?? null) !== JSON.stringify(item[field] ?? null)) fail(`consumer archive platform metadata differs: ${field}`);
    }
    const files = new Map();
    for (const file of archive.files) {
      sourcePath(file.path, 'consumer archive file path');
      files.set(file.path, file);
    }
    const bins = consumerBinDeclarations(archive.manifest, files);
    packages.set(item.key, item);
    parsed.set(item.key, { files, bins });
  }
  const tarballs = new Map();
  for (const item of admitted.packages) if (item.archive.resolved.startsWith('file:')) {
    const match = /^file:\.\/tarballs\/([A-Za-z0-9][A-Za-z0-9._-]*\.tgz)$/.exec(item.archive.resolved);
    if (!match || tarballs.has(match[1])) fail('invalid consumer local archive identity');
    tarballs.set(match[1], item.archive);
  }
  if (tarballs.size) {
    const directory = resolve(root, 'tarballs');
    safeDirectory(root, directory, 'consumer tarball directory', state);
    const names = readdirSync(directory);
    if (names.length !== tarballs.size || names.some(name => !tarballs.has(name))) fail('consumer tarball inventory differs');
    for (const [name, archive] of tarballs) {
      const file = readFileChecked(resolve(directory, name), state, 64 * 1024 * 1024);
      if (file.size !== archive.bytes.byteLength || file.sha256 !== archive.sha256) fail('consumer tarball differs from admission');
    }
  }
  for (const item of admitted.snapshots) {
    if (snapshots.has(item.key) || !packages.has(item.packageKey)) fail('invalid consumer snapshot');
    snapshots.set(item.key, item);
  }
  const platform = runningPlatform(), omittedEdge = edge => {
    const target = snapshots.get(edge.target);
    if (!target) fail('unresolved consumer dependency');
    if (edge.group !== 'optionalDependencies' || !target.optional) return false;
    const metadata = packages.get(target.packageKey);
    let mismatch = false;
    for (const field of ['os', 'cpu', 'libc']) {
      const values = metadata[field];
      if (values === undefined) continue;
      if (!Array.isArray(values) || !values.length || values.length > 256 ||
          values.some(value => typeof value !== 'string' || !/^[a-z0-9_]+$/.test(value) ||
            ['any', 'current', 'unknown'].includes(value)) || new Set(values).size !== values.length) {
        fail('unsupported consumer platform omission constraint');
      }
      if (platform[field] !== 'unknown' && !values.includes(platform[field])) mismatch = true;
    }
    return mismatch;
  };
  const closure = includeOmitted => {
    const queue = admitted.roots.filter(edge => includeOmitted || !omittedEdge(edge)).map(edge => edge.target), seen = new Set();
    for (let i = 0; i < queue.length; i++) {
      const id = queue[i], snapshot = snapshots.get(id);
      if (!snapshot) fail('unresolved consumer snapshot');
      if (seen.has(id)) continue;
      seen.add(id);
      for (const edge of snapshot.edges) if (includeOmitted || !omittedEdge(edge)) queue.push(edge.target);
      if (queue.length > MAX_FILES) fail('consumer graph edge limit exceeded');
    }
    return seen;
  };
  const all = closure(true), selected = closure(false), omitted = [...all].filter(id => !selected.has(id)).sort();
  if (all.size !== snapshots.size) fail('consumer snapshot graph is incomplete');
  const edges = [...admitted.roots, ...[...selected].flatMap(id => snapshots.get(id).edges)];
  for (const edge of edges) if (omittedEdge(edge) && selected.has(edge.target)) fail('ambiguous consumer optional reachability');
  const included = edge => !omittedEdge(edge);
  const aliases = new Map();
  for (const edge of edges.filter(included)) {
    packageName(edge.name);
    if (!aliases.has(edge.name)) aliases.set(edge.name, new Set());
    aliases.get(edge.name).add(edge.target);
  }
  const storeRoot = resolve(root, 'node_modules/.pnpm'), modules = resolve(root, 'node_modules');
  let hasMetadata = false;
  try { lstatSync(resolve(modules, '.modules.yaml')); hasMetadata = true; }
  catch (error) { if (error?.code !== 'ENOENT') fail('consumer metadata cannot be inspected'); }
  const hoists = hasMetadata
    ? consumerMetadata(root, storeRoot, state, input, snapshots, selected, omitted, aliases)
    : { privateHoists: new Map(), publicHoists: new Map() };
  const visited = new Map(), owned = new Map(), folders = new Map(), queue = [];
  const expectedPath = id => {
    const snapshot = snapshots.get(id);
    if (!snapshot || !selected.has(id)) fail('consumer link references an omitted snapshot');
    const folder = consumerVirtualName(id), owner = folders.get(folder);
    if (owner && owner !== id) fail('consumer virtual-store identity collision');
    folders.set(folder, id);
    return resolve(storeRoot, folder, 'node_modules', snapshot.name);
  };
  const enqueue = (id, actual) => {
    const expected = expectedPath(id);
    if (actual !== expected) fail('consumer link differs from exact snapshot location');
    safeDirectory(root, actual, 'consumer installed package', state);
    if (owned.has(actual) && owned.get(actual) !== id) fail('consumer package identity is ambiguous');
    if (visited.has(id)) return;
    visited.set(id, actual); owned.set(actual, id); queue.push(id);
  };
  const rootEdges = admitted.roots.filter(included), rootNames = new Map();
  for (const edge of rootEdges) {
    if (rootNames.has(edge.name)) fail('duplicate consumer root dependency');
    rootNames.set(edge.name, edge.target);
  }
  for (const [alias, id] of hoists.publicHoists) {
    if (rootNames.has(alias)) fail('consumer public hoist collides with a root dependency');
    rootNames.set(alias, id);
  }
  const binMap = links => {
    const bins = new Map();
    for (const [alias, id] of links) {
      const snapshot = snapshots.get(id), pack = parsed.get(snapshot.packageKey);
      for (const [command, path] of pack.bins) {
        const prior = bins.get(command);
        if (prior && (prior.id !== id || prior.alias !== alias || prior.path !== path)) fail('ambiguous consumer bin command');
        bins.set(command, { id, alias, path, bytes: pack.files.get(path).bytes });
      }
    }
    return bins;
  };
  const checkBins = (directory, links, required) => {
    const bins = binMap(links);
    let present = true;
    try { lstatSync(directory); } catch (error) { if (error?.code === 'ENOENT') present = false; else fail('consumer bin directory is unavailable'); }
    if (!present) {
      if (required && bins.size) fail('consumer bin directory is missing');
      return false;
    }
    safeDirectory(root, directory, 'consumer bin directory', state);
    const entries = readdirSync(directory), seen = new Set();
    for (const command of entries) {
      const bin = bins.get(command);
      if (!bin || seen.has(command)) fail('unrecorded consumer bin');
      const packageDir = expectedPath(bin.id), expected = consumerShim(resolve(directory, '..'), storeRoot, bin.alias, packageDir, bin);
      const got = readFileChecked(resolve(directory, command), state, 1024 * 1024, true);
      if (got.executable !== 0o111 || got.size !== expected.length || got.sha256 !== digest(expected)) {
        const offset = expected.findIndex((byte, index) => byte !== got.bytes[index]);
        fail(`consumer bin shim differs at byte ${offset < 0 ? got.size : offset} (length ${got.size}/${expected.length}, executable ${got.executable})`);
      }
      seen.add(command);
    }
    if (required && seen.size !== bins.size) fail('consumer bin inventory is incomplete');
    return true;
  };
  const rootBin = checkBins(resolve(modules, '.bin'), rootNames, true);
  const rootSpecial = new Map([['.pnpm', 'directory'], ...(hasMetadata ? [['.modules.yaml', 'file']] : []), ...(rootBin ? [['.bin', 'directory']] : [])]);
  consumerEntries(root, modules, new Set(rootNames.keys()), rootSpecial, state);
  for (const [alias, id] of rootNames) enqueue(id, resolveLink(root, resolve(modules, alias), 'consumer root dependency', state));
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i], snapshot = snapshots.get(id), actual = visited.get(id), pack = parsed.get(snapshot.packageKey);
    const expectedDirs = new Set();
    for (const path of pack.files.keys()) {
      const parts = path.split('/');
      for (let end = 1; end < parts.length; end++) expectedDirs.add(parts.slice(0, end).join('/'));
    }
    const found = new Map();
    const walk = (directory, prefix = '') => {
      safeDirectory(root, directory, 'consumer package directory', state);
      for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const path = resolve(directory, entry.name), rel = prefix ? `${prefix}/${entry.name}` : entry.name;
        sourcePath(rel, 'consumer package file');
        const stat = lstatSync(path);
        if (stat.isSymbolicLink()) fail('consumer package contains a symlink');
        if (stat.isDirectory()) {
          if (!expectedDirs.has(rel)) fail(`unrecorded consumer package directory: ${rel}`);
          walk(path, rel);
        } else if (stat.isFile()) {
          if (!pack.files.has(rel) || found.has(rel)) fail(`unrecorded consumer package file: ${rel}`);
          found.set(rel, readFileChecked(path, state));
        } else fail('unsupported consumer package entry');
      }
    };
    walk(actual);
    if (found.size !== pack.files.size) fail('consumer package files are incomplete');
    const binTargets = new Set(pack.bins.values());
    for (const [path, file] of pack.files) {
      const got = found.get(path), fixed = binTargets.has(path) ? fixedBinFile(file) : undefined;
      const matches = value => value && got && got.size === value.size && got.sha256 === value.sha256 && got.executable === value.executable;
      if (!matches(file) && !matches(fixed)) fail(`consumer package differs from admitted archive: ${path}`);
    }
    const links = new Map();
    for (const edge of snapshot.edges.filter(included)) {
      if (edge.name === snapshot.name || links.has(edge.name)) fail('duplicate consumer snapshot dependency');
      links.set(edge.name, edge.target);
    }
    for (const binding of snapshot.bindings) {
      if (![...links.values()].includes(binding)) fail('consumer peer binding has no exact installed edge');
    }
    const packageModules = resolve(storeRoot, consumerVirtualName(id), 'node_modules');
    const packageBin = checkBins(resolve(packageModules, '.bin'), links, false);
    consumerEntries(root, packageModules, new Set([snapshot.name, ...links.keys()]),
      new Map(packageBin ? [['.bin', 'directory']] : []), state);
    for (const [alias, target] of links) enqueue(target, resolveLink(root, resolve(packageModules, alias), 'consumer snapshot dependency', state));
  }
  if (visited.size !== selected.size) fail('consumer installed snapshot set is incomplete');
  const storeEntries = new Set(folders.keys());
  storeEntries.add('lock.yaml');
  if (hoists.privateHoists.size) storeEntries.add('node_modules');
  safeDirectory(root, storeRoot, 'consumer virtual store', state);
  const entries = readdirSync(storeRoot);
  if (entries.length !== storeEntries.size || entries.some(entry => !storeEntries.has(entry))) fail('consumer virtual-store inventory differs');
  const installedLock = readFileChecked(resolve(storeRoot, 'lock.yaml'), state, 16 * 1024 * 1024);
  if (installedLock.sha256 !== admitted.lockfileSha256 || installedLock.size !== lockBytes.byteLength) fail('consumer virtual-store lock differs');
  for (const folder of folders.keys()) {
    const directory = resolve(storeRoot, folder);
    safeDirectory(root, directory, 'consumer virtual-store package', state);
    if (JSON.stringify(readdirSync(directory)) !== '["node_modules"]') fail('unrecorded consumer virtual-store entry');
  }
  if (hoists.privateHoists.size) {
    const privateModules = resolve(storeRoot, 'node_modules');
    const privateBin = checkBins(resolve(privateModules, '.bin'), hoists.privateHoists, false);
    consumerEntries(root, privateModules, new Set(hoists.privateHoists.keys()),
      new Map(privateBin ? [['.bin', 'directory']] : []), state);
    for (const [alias, id] of hoists.privateHoists) enqueue(id, resolveLink(root, resolve(privateModules, alias), 'consumer private hoist', state));
  }
  const confirmed = consumePnpmConsumerGraph({ capability, manifestBytes, lockBytes });
  const identity = graph => JSON.stringify({ manifestSha256: graph.manifestSha256, lockfileSha256: graph.lockfileSha256,
    roots: graph.roots, snapshots: graph.snapshots, packages: graph.packages.map(item => ({
      key: item.key, resolution: item.resolution, os: item.os, cpu: item.cpu, libc: item.libc,
      sha256: item.archive.sha256, integrity: item.archive.integrity, resolved: item.archive.resolved
    })) });
  if (identity(admitted) !== identity(confirmed)) fail('consumer admission changed during inspection');
  verifyStableTree(state);
  return Object.freeze({ schema: 'aura3d.pnpm-installed-consumer/1', manifestSha256: admitted.manifestSha256,
    lockfileSha256: admitted.lockfileSha256, snapshotKeys: Object.freeze([...selected].sort()),
    omittedSnapshotKeys: Object.freeze(omitted), platform, fileCount: state.files, bytes: state.bytes,
    installationAuthorized: false,
    scope: 'Point-in-time admitted consumer graph, package bytes, supported generated shims and hoists only; runtime identity, store integrity, isolation and execution remain separate.' });
}
