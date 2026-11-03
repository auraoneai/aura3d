import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';
import { closeSync, constants, fstatSync, lstatSync, openSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, posix, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';
import {
  inspectIndependentPnpmConsumer, seedVerifiedWorkspacePnpmStore, verifyWorkspacePnpmNativeStore
} from './portable-pnpm-lock.mjs';
import { inspectNpmArchive } from './portable-npm-lock.mjs';
import { inspectAdmittedArchiveFiles } from './admitted-archive-modes.mjs';
import { verifyInstalledPnpmWorkspace, verifyInstalledPnpmWorkspaceForPlatform } from './pnpm-installed-tree.mjs';
import { isSourceInput, stagedSourceIdentity } from './source-identity.mjs';

// This is deliberately unset until an independent review policy has actually
// been established. Neither a source manifest nor a caller-supplied receipt is
// a trust root. Tests may pin a synthetic policy only in an isolated copy.
const TRUSTED_WORKSPACE_POLICY_SHA256 = null;
const WORKSPACE_POLICY_PATH = 'tools/release/workspace-archive-admission-policy.json';
// These are unresolved first-party outputs, not reviewed executable bytes.
// The table is deliberately internal and the opt-in remains off by default.
const DEFERRED_WORKSPACE_CLI_BINS = Object.freeze({
  'packages/aura3d-cli': Object.freeze({ name: '@aura3d/cli', source: 'src/cli.ts', target: 'dist/cli.js',
    bins: Object.freeze({ aura3d: 'dist/cli.js', aura: 'dist/cli.js', cli: 'dist/cli.js' }) }),
  'packages/create-aura3d': Object.freeze({ name: 'create-aura3d', source: 'src/cli.ts', target: 'dist/cli.js',
    bins: Object.freeze({ 'create-aura3d': 'dist/cli.js' }) })
});
const MAX_DOCUMENT = 16 * 1024 * 1024;
const MAX_ARCHIVE = 64 * 1024 * 1024;
const MAX_TOTAL = 256 * 1024 * 1024;
const MAX_NODES = 250000;
const MAX_PACKAGES = 10000;
const MAX_DEPTH = 48;
const MAX_TOOLCHAIN_FILE = 256 * 1024 * 1024;
const MAX_TOOLCHAIN_TOTAL = 512 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const SRI = /^sha512-[A-Za-z0-9+/]{86}==$/;
const SOURCE_APPROVAL_DOMAIN = 'aura3d.workspace-source-approval/1\0';
const PACKAGE = /^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/;
const PROHIBITED = /^(?:three|@types\/three|@react-three\/[^/]+|babylonjs(?:-gltf2interface)?|@babylonjs\/[^/]+|playcanvas|@playcanvas\/[^/]+)$/i;
const fail = message => { throw new Error(`WORKSPACE_PNPM_ADMISSION: ${message}`); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sri = bytes => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);
function mapping(value, label) { if (!plain(value)) fail(`invalid ${label}`); return value; }
function fields(value, allowed, label) {
  mapping(value, label);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`unsupported ${label} field: ${key}`);
}
function packageName(value, label = 'package name') {
  if (typeof value !== 'string' || value.length > 214 || !PACKAGE.test(value) || PROHIBITED.test(value)) fail(`invalid or prohibited ${label}`);
  return value;
}
function text(bytes, label) {
  if (!(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > MAX_DOCUMENT) fail(`invalid ${label} bytes`);
  let result;
  try { result = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail(`invalid ${label} UTF-8`); }
  if (result.charCodeAt(0) === 0xfeff || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(result)) fail(`invalid ${label} characters`);
  return result;
}

// JSON.parse accepts duplicate keys. Reject them before consuming a manifest or
// review so an independently reviewed meaning cannot differ from runtime use.
function strictJson(bytes, label, requireCanonical = false) {
  const source = text(bytes, label);
  let parsed;
  try { parsed = JSON.parse(source); } catch { fail(`invalid ${label} JSON`); }
  let at = 0, tokens = 0;
  const ws = () => { while (/\s/.test(source[at] ?? '') && at < source.length) at++; };
  const string = () => {
    const start = at++;
    for (;;) {
      if (at >= source.length) fail(`invalid ${label} JSON string`);
      const ch = source[at++];
      if (ch === '\\') { if (at >= source.length) fail(`invalid ${label} JSON escape`); at++; }
      else if (ch === '"') break;
    }
    try { return JSON.parse(source.slice(start, at)); } catch { fail(`invalid ${label} JSON string`); }
  };
  function value(depth) {
    if (++tokens > MAX_NODES || depth > MAX_DEPTH) fail(`${label} JSON limit exceeded`);
    ws(); const c = source[at];
    if (c === '"') { string(); return; }
    if (c === '{') {
      at++; ws(); const keys = new Set();
      if (source[at] === '}') { at++; return; }
      for (;;) {
        ws(); if (source[at] !== '"') fail(`invalid ${label} object key`);
        const key = string();
        if (keys.has(key) || ['__proto__', 'prototype', 'constructor'].includes(key)) fail(`duplicate or unsafe ${label} key`);
        keys.add(key); ws(); if (source[at++] !== ':') fail(`invalid ${label} object`);
        value(depth + 1); ws(); const next = source[at++];
        if (next === '}') return;
        if (next !== ',') fail(`invalid ${label} object`);
      }
    }
    if (c === '[') {
      at++; ws(); if (source[at] === ']') { at++; return; }
      for (;;) { value(depth + 1); ws(); const next = source[at++]; if (next === ']') return; if (next !== ',') fail(`invalid ${label} array`); }
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?(?:[eE][+-]?[0-9]+)?)/.exec(source.slice(at));
    if (!match) fail(`invalid ${label} JSON value`);
    at += match[0].length;
  }
  value(0); ws(); if (at !== source.length) fail(`invalid ${label} JSON trailing bytes`);
  if (requireCanonical && `${JSON.stringify(parsed, null, 2)}\n` !== source) fail(`noncanonical ${label} JSON`);
  return parsed;
}

// Pnpm lockfiles use a small YAML subset. Fail on aliases, duplicate keys,
// multiline scalars, tags, merges and ambiguous indentation rather than
// guessing how a package manager would interpret an unsupported construct.
function parseYaml(input, label) {
  const lines = [], source = text(input, label); let nodes = 0, cursor = 0;
  for (const raw of source.split(/\r?\n/)) {
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    if (raw.includes('\t') || raw.includes('\r')) fail(`unsupported ${label} whitespace`);
    const indent = raw.length - raw.trimStart().length, body = raw.slice(indent);
    if (indent % 2 || indent / 2 > MAX_DEPTH || /\s$/.test(body) || /^(?:---|\.\.\.|%)/.test(body)) fail(`unsupported ${label} syntax`);
    lines.push({ indent, body }); if (lines.length > MAX_NODES) fail(`${label} line limit exceeded`);
  }
  function parts(raw, delimiter) {
    let start = 0, nesting = 0, quote = ''; const out = [];
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (quote === "'") { if (c === "'" && raw[i + 1] === "'") i++; else if (c === "'") quote = ''; continue; }
      if (quote === '"') { if (c === '\\') i++; else if (c === '"') quote = ''; continue; }
      if (c === "'" || c === '"') quote = c;
      else if (c === '{' || c === '[') nesting++;
      else if (c === '}' || c === ']') { nesting--; if (nesting < 0) fail(`invalid ${label} collection`); }
      else if (c === delimiter && nesting === 0 && (delimiter !== ':' || i + 1 === raw.length || /\s/.test(raw[i + 1]))) {
        out.push(raw.slice(start, i)); start = i + 1;
        if (delimiter === ':') { out.push(raw.slice(start)); return out; }
      }
    }
    if (quote || nesting) fail(`invalid ${label} collection`);
    out.push(raw.slice(start)); return out;
  }
  function scalar(raw) {
    if (++nodes > MAX_NODES || !raw || raw.length > 8192) fail(`invalid ${label} scalar`);
    if (raw[0] === '"') { try { const v = JSON.parse(raw); if (typeof v !== 'string') fail(`invalid ${label} scalar`); return v; } catch { fail(`invalid ${label} quoted scalar`); } }
    if (raw[0] === "'") {
      if (raw.at(-1) !== "'" || /(^|[^'])'(?!')/.test(raw.slice(1, -1))) fail(`invalid ${label} quoted scalar`);
      return raw.slice(1, -1).replace(/''/g, "'");
    }
    if (/^[!&*|>%`@]/.test(raw) || /[\[\]{},]/.test(raw) || /(?:^|\s)#/.test(raw) || /:\s/.test(raw) || /\s$/.test(raw) || raw === '<<') fail(`unsupported ${label} scalar`);
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (/^(?:null|~|\.nan|[-+]?\.inf)$/i.test(raw)) fail(`unsupported ${label} null`);
    return raw;
  }
  function pair(raw) {
    const item = parts(raw, ':'); if (item.length !== 2) fail(`invalid ${label} mapping`);
    const key = scalar(item[0].trim());
    if (typeof key !== 'string' || !key || ['__proto__', 'prototype', 'constructor', '<<'].includes(key)) fail(`invalid ${label} key`);
    return [key, item[1].trim()];
  }
  function flow(raw, depth = 0) {
    if (depth > MAX_DEPTH) fail(`${label} depth limit exceeded`);
    if (raw.startsWith('{') || raw.startsWith('[')) {
      const isMap = raw[0] === '{'; if (!raw.endsWith(isMap ? '}' : ']')) fail(`invalid ${label} flow value`);
      const body = raw.slice(1, -1).trim(), out = isMap ? Object.create(null) : [];
      if (!body) return out;
      for (const part of parts(body, ',')) {
        if (!part.trim()) fail(`invalid ${label} flow value`);
        if (!isMap) out.push(flow(part.trim(), depth + 1));
        else { const [key, item] = pair(part.trim()); if (!item || Object.hasOwn(out, key)) fail(`duplicate ${label} key`); out[key] = flow(item, depth + 1); }
      }
      return out;
    }
    return scalar(raw);
  }
  function block(indent, depth) {
    if (depth > MAX_DEPTH || cursor >= lines.length || lines[cursor].indent !== indent) fail(`invalid ${label} indentation`);
    const sequence = lines[cursor].body.startsWith('- '), result = sequence ? [] : Object.create(null);
    if (++nodes > MAX_NODES) fail(`${label} node limit exceeded`);
    while (cursor < lines.length && lines[cursor].indent === indent) {
      const body = lines[cursor++].body;
      if (sequence) {
        if (!body.startsWith('- ') || !body.slice(2).trim()) fail(`invalid ${label} sequence`);
        result.push(flow(body.slice(2).trim()));
      } else {
        if (body.startsWith('- ')) fail(`mixed ${label} sequence`);
        const [key, rest] = pair(body); if (Object.hasOwn(result, key)) fail(`duplicate ${label} key`);
        if (rest) result[key] = flow(rest);
        else { if (cursor >= lines.length || lines[cursor].indent !== indent + 2) fail(`invalid ${label} indentation`); result[key] = block(indent + 2, depth + 1); }
      }
      if (cursor < lines.length && lines[cursor].indent > indent) fail(`invalid ${label} indentation`);
    }
    return result;
  }
  if (!lines.length || lines[0].indent !== 0) fail(`empty ${label}`);
  const result = block(0, 0); if (cursor !== lines.length) fail(`invalid ${label} trailing content`);
  return mapping(result, label);
}

function stringifyYaml(value, indent = 0) {
  const prefix = ' '.repeat(indent), out = [];
  for (const [key, entry] of Object.entries(mapping(value, 'generated lock'))) {
    const name = JSON.stringify(key);
    if (plain(entry) && Object.keys(entry).length) { out.push(`${prefix}${name}:`); out.push(stringifyYaml(entry, indent + 2)); }
    else if (plain(entry)) out.push(`${prefix}${name}: {}`);
    else if (Array.isArray(entry)) {
      if (entry.some(item => typeof item !== 'string' && typeof item !== 'boolean')) fail('unsupported generated lock array');
      out.push(`${prefix}${name}: [${entry.map(item => JSON.stringify(item)).join(', ')}]`);
    } else if (typeof entry === 'string' || typeof entry === 'boolean') out.push(`${prefix}${name}: ${JSON.stringify(entry)}`);
    else fail('unsupported generated lock value');
  }
  return out.join('\n');
}

function relativePath(path, label) {
  if (typeof path !== 'string' || !path || isAbsolute(path) || path.includes('\\') || /[\x00-\x1f]/.test(path)
      || path.split('/').some(part => !part || part === '.' || part === '..')) fail(`unsafe ${label}`);
  return path;
}
function readPlain(root, path, max = MAX_DOCUMENT, allowEmpty = false) {
  relativePath(path, 'source path');
  const base = realpathSync(resolve(root)), full = resolve(base, path);
  if (!full.startsWith(`${base}${sep}`)) fail('source escapes root');
  let stat, real; try { stat = lstatSync(full); real = realpathSync(full); } catch { fail(`missing source: ${path}`); }
  if (!stat.isFile() || stat.isSymbolicLink() || real !== full || (!allowEmpty && stat.size < 1) || stat.size > max) fail(`invalid source: ${path}`);
  return readFileSync(full);
}
function stagedContext(root, sourceManifestPath) {
  const base = realpathSync(resolve(root));
  relativePath(sourceManifestPath, 'source manifest path');
  const manifestBytes = readPlain(base, sourceManifestPath), manifest = strictJson(manifestBytes, 'source manifest');
  const source = stagedSourceIdentity(base, sourceManifestPath);
  if (sha(manifestBytes) !== source.manifestSha256 || !Array.isArray(manifest.files)) fail('source manifest identity differs');
  const entries = new Map(manifest.files.map(entry => [entry.path, entry]));
  const read = (path, label = 'staged source') => {
    if (!isSourceInput(path)) fail(`invalid ${label} path`);
    const entry = entries.get(path);
    if (!entry || entry.type !== 'file') fail(`missing ${label}: ${path}`);
    const bytes = readPlain(base, path, MAX_DOCUMENT, true); if (sha(bytes) !== entry.sha256) fail(`${label} digest mismatch: ${path}`);
    return bytes;
  };
  return { root: base, sourceManifestPath, manifest, source, entries, read };
}

function stringMap(value, label) {
  if (value === undefined) return Object.create(null);
  mapping(value, label);
  for (const [name, item] of Object.entries(value)) {
    packageName(name, `${label} name`);
    if (typeof item !== 'string' || !item || item.length > 4096) fail(`invalid ${label} value`);
  }
  return value;
}
function sameSet(a, b) { return canonical([...a].sort()) === canonical([...b].sort()); }
function workspacePatterns(config) {
  fields(config, ['packages', 'allowBuilds', 'minimumReleaseAgeExclude', 'overrides', 'patchedDependencies'], 'workspace configuration');
  if (!Array.isArray(config.packages) || !config.packages.length || config.packages.length > 256) fail('missing workspace package patterns');
  const patterns = config.packages.map(pattern => {
    if (typeof pattern !== 'string' || pattern.startsWith('!')) fail('unsupported workspace package pattern');
    const wildcard = pattern.endsWith('/*'), base = wildcard ? pattern.slice(0, -2) : pattern;
    relativePath(base, 'workspace package pattern');
    // A literal plus an optional final single-directory star is the entire
    // supported grammar. In particular extglobs must not be mistaken for a
    // literal while pnpm expands them to uninspected workspace packages.
    if (!/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(base)) fail('unsupported workspace package pattern');
    return { base, wildcard };
  });
  for (const name of ['overrides', 'patchedDependencies']) if (config[name] !== undefined) mapping(config[name], `workspace ${name}`);
  if (config.allowBuilds !== undefined) {
    mapping(config.allowBuilds, 'workspace build policy');
    for (const [name, enabled] of Object.entries(config.allowBuilds)) {
      packageName(name, 'build policy package');
      if (typeof enabled !== 'boolean') fail('invalid workspace build policy');
    }
  }
  if (config.minimumReleaseAgeExclude !== undefined && (!Array.isArray(config.minimumReleaseAgeExclude)
    || config.minimumReleaseAgeExclude.some(value => typeof value !== 'string' || !value || value.length > 512))) fail('invalid release age exclusions');
  return patterns;
}
function manifestPaths(context, patterns) {
  const paths = new Set(['package.json']);
  for (const path of context.entries.keys()) {
    if (!path.endsWith('/package.json')) continue;
    const parent = path.slice(0, -'/package.json'.length);
    if (patterns.some(pattern => pattern.wildcard
      ? parent.startsWith(`${pattern.base}/`) && !parent.slice(pattern.base.length + 1).includes('/')
      : parent === pattern.base)) paths.add(path);
  }
  return [...paths].sort();
}
function rejectLocalPnpmConfig(root, dirs) {
  // Source staging deliberately excludes npm credentials; also refuse local
  // pnpm configuration and hooks that could change a later install's meaning.
  // Include intermediate ancestors, not only importer directories: a config
  // in `packages/` can affect an importer under `packages/example/`.
  const checked = new Set(['.']);
  for (const dir of dirs) {
    for (let parent = dir; parent !== '.'; parent = posix.dirname(parent)) checked.add(parent);
  }
  for (const dir of checked) {
    for (const leaf of ['.npmrc', '.pnpmfile.cjs', '.pnpmfile.js', '.pnpmfile.mjs', 'pnpmfile.cjs', 'pnpmfile.js', 'pnpmfile.mjs']) {
      try { lstatSync(resolve(root, dir === '.' ? leaf : `${dir}/${leaf}`)); }
      catch (error) { if (error?.code === 'ENOENT') continue; throw error; }
      fail('workspace package-manager configuration or hook is unsupported');
    }
  }
}

/**
 * pnpm may chmod/link manifest-declared binaries even with lifecycle scripts
 * disabled. Require an admitted regular file or a separately recorded, absent
 * first-party output under the default-off deferred-bin contract. Neither path
 * authorizes a future install.
 */
function validateManifestBins(manifest, label, assertFile) {
  if (manifest.directories !== undefined) {
    mapping(manifest.directories, `${label} directories`);
    // Directory-derived command enumeration and its generated names require a
    // separate contract; do not guess which paths pnpm will touch.
    if (manifest.directories.bin !== undefined) fail(`${label} directories.bin is unsupported`);
  }
  if (manifest.bin === undefined) return;
  const entries = typeof manifest.bin === 'string' ? [['default', manifest.bin]] : Object.entries(mapping(manifest.bin, `${label} bin`));
  if (entries.length > MAX_PACKAGES) fail(`${label} bin inventory exceeds limit`);
  for (const [name, value] of entries) {
    if (name !== 'default' && (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name) || name === '.' || name === '..')) fail(`invalid ${label} bin name`);
    if (typeof value !== 'string' || !value || value.length > 4096) fail(`invalid ${label} bin target`);
    const path = value.startsWith('./') ? value.slice(2) : value;
    relativePath(path, `${label} bin target`);
    if (!/^[A-Za-z0-9._+@/-]+$/.test(path)) fail(`unsafe ${label} bin target`);
    assertFile(path);
  }
}

function assertDeferredOutputAbsent(root, importer) {
  // `dist` is excluded from the staged source manifest. Reject the entire
  // ancestor, including dangling links, until output custody is established.
  try { lstatSync(resolve(root, importer, 'dist')); }
  catch (error) { if (error?.code === 'ENOENT') return; throw error; }
  fail(`deferred workspace bin output directory exists: ${importer}/dist`);
}

function assertDeferredVerifier(context) {
  // Compare current module-path bytes with the staged file. This cannot prove
  // which bytes were already loaded or establish independent executor trust.
  const verifier = context.read('tools/release/workspace-pnpm-admission.mjs', 'deferred-bin verifier');
  if (!Buffer.from(verifier).equals(readFileSync(fileURLToPath(import.meta.url)))) fail('deferred-bin verifier differs from staged source');
}

function deferredWorkspaceBin(context, dir, name, manifest, manifestSha256, target) {
  if (!Object.hasOwn(DEFERRED_WORKSPACE_CLI_BINS, dir)) return null;
  const spec = DEFERRED_WORKSPACE_CLI_BINS[dir];
  if (name !== spec.name || target !== spec.target || canonical(manifest.bin) !== canonical(spec.bins)) return null;
  assertDeferredVerifier(context);
  const sourcePath = `${dir}/${spec.source}`, source = context.read(sourcePath, 'deferred workspace bin source');
  assertDeferredOutputAbsent(context.root, dir);
  return { importer: dir, name, manifestSha256, commands: Object.keys(spec.bins).sort(), target: spec.target,
    source: { path: sourcePath, sha256: sha(source) } };
}
function semver(value) {
  if (typeof value !== 'string' || !/^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/.test(value)) fail('unsupported workspace package version');
  const parts = value.split('.').map(Number); if (parts.some(item => !Number.isSafeInteger(item))) fail('oversized workspace package version');
  return parts;
}
function workspaceVersionSatisfies(value, range) {
  const current = semver(value), compare = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
  if (range === '*' || range === '^' || range === '~' || range === 'workspace:*' || range === 'workspace:^' || range === 'workspace:~') return true;
  if (range.startsWith('workspace:')) range = range.slice('workspace:'.length);
  if (typeof range !== 'string' || !range.trim() || range.length > 512 || !/^[0-9xX*.^~<>=| \t-]+$/.test(range)) fail('unsupported workspace version range');
  return range.split('||').some(alternative => {
    if (!alternative.trim() || /\s-\s/.test(alternative)) fail('unsupported workspace version range');
    const tokens = alternative.trim().replace(/(>=|<=|>|<|=|\^|~)\s+/g, '$1').split(/\s+/);
    return tokens.every(token => {
      const match = /^(\^|~|>=|<=|>|<|=)?(\*|[xX]|(?:0|[1-9]\d*)(?:\.(?:0|[1-9]\d*|[xX*])){0,2})$/.exec(token);
      if (!match) fail('unsupported workspace version range');
      const op = match[1] ?? '', raw = match[2].split('.'), wild = raw.findIndex(part => /^[xX*]$/.test(part));
      const count = wild < 0 ? raw.length : wild;
      if (wild >= 0 && raw.slice(wild).some(part => !/^[xX*]$/.test(part))) fail('invalid workspace version range');
      if (!count) { if (op && op !== '=') fail('unsupported workspace wildcard'); return true; }
      const lower = [0, 0, 0]; for (let i = 0; i < count; i++) { lower[i] = Number(raw[i]); if (!Number.isSafeInteger(lower[i])) fail('oversized workspace version range'); }
      let upper;
      if (op === '^') { const index = lower[0] ? 0 : count === 1 ? 0 : lower[1] ? 1 : count === 2 ? 1 : 2; upper = [...lower]; upper[index]++; for (let i = index + 1; i < 3; i++) upper[i] = 0; }
      else if (op === '~') { const index = count === 1 ? 0 : 1; upper = [...lower]; upper[index]++; for (let i = index + 1; i < 3; i++) upper[i] = 0; }
      else if (count < 3) { upper = [...lower]; upper[count - 1]++; for (let i = count; i < 3; i++) upper[i] = 0; }
      if (op === '>') return count < 3 ? compare(current, upper) >= 0 : compare(current, lower) > 0;
      if (op === '>=') return compare(current, lower) >= 0;
      if (op === '<') return compare(current, lower) < 0;
      if (op === '<=') return count < 3 ? compare(current, upper) < 0 : compare(current, lower) <= 0;
      return compare(current, lower) >= 0 && (upper ? compare(current, upper) < 0 : compare(current, lower) === 0);
    });
  });
}
function dependencyTarget(name, specification) {
  packageName(name, 'dependency name');
  if (typeof specification !== 'string' || !specification || specification.length > 4096) fail('invalid dependency specifier');
  if (specification.startsWith('npm:')) {
    const match = /^npm:((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)@(.+)$/.exec(specification);
    if (!match) fail('unsupported dependency alias');
    return { name: packageName(match[1], 'dependency alias target'), range: match[2] };
  }
  if (/^(?:file:|link:|https?:|git\+|github:|gitlab:|bitbucket:|catalog:|patch:)/i.test(specification)) fail('unsupported external dependency protocol');
  return { name, range: specification };
}

function packageKey(value) {
  if (typeof value !== 'string') fail('invalid package identity');
  const match = /^((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)@((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))$/.exec(value);
  if (!match) fail('unsupported package identity');
  packageName(match[1], 'package identity'); semver(match[2]);
  return { name: match[1], version: match[2], key: value };
}

function workspaceRules(context, config, lock) {
  const configOverrides = config.overrides ?? Object.create(null), lockOverrides = lock.overrides ?? Object.create(null);
  mapping(configOverrides, 'workspace overrides'); mapping(lockOverrides, 'lock overrides');
  if (canonical(configOverrides) !== canonical(lockOverrides)) fail('workspace overrides differ from lock');
  const overrides = [];
  for (const [selector, version] of Object.entries(configOverrides)) {
    // Only exact, unversioned direct-parent selectors with exact registry
    // versions are modeled. Global selectors, ranges and nested selectors
    // would require different package-manager semantics.
    const match = /^((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)>((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)$/.exec(selector);
    if (!match || typeof version !== 'string') fail('unsupported workspace override selector');
    packageName(match[1], 'override parent'); packageName(match[2], 'override dependency'); semver(version);
    overrides.push({ selector, parent: match[1], dependency: match[2], version, affectedPackages: [] });
  }
  const configPatches = config.patchedDependencies ?? Object.create(null), lockPatches = lock.patchedDependencies ?? Object.create(null);
  mapping(configPatches, 'workspace patches'); mapping(lockPatches, 'lock patches');
  if (!sameSet(Object.keys(configPatches), Object.keys(lockPatches))) fail('workspace patches differ from lock');
  const patches = new Map();
  for (const [key, path] of Object.entries(configPatches)) {
    packageKey(key);
    relativePath(path, 'patch path');
    const data = context.read(path, 'workspace patch'), digest = sha(data);
    if (!HASH.test(lockPatches[key] ?? '') || lockPatches[key] !== digest) fail('workspace patch hash differs from lock');
    patches.set(key, { packageKey: key, patch: { path, sha256: digest }, bytes: Buffer.from(data), snapshotKeys: [] });
  }
  return { overrides, patches };
}

/** Strip only an exactly source-bound, top-level patch marker for inspection. */
function normalizePatchedReference(installed, raw, patches) {
  if (typeof raw !== 'string' || !raw || raw.length > 8192) fail('invalid locked package reference');
  const withName = /^[0-9]/.test(raw) ? `${installed}@${raw}` : raw;
  const match = /^((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)@((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))(.*)$/.exec(withName);
  if (!match) fail('unsupported locked package reference');
  packageName(match[1], 'locked package reference');
  const rule = patches.get(`${match[1]}@${match[2]}`), suffix = match[3];
  let normalized = suffix;
  if (rule) {
    const marker = `(patch_hash=${rule.patch.sha256})`;
    if (!suffix.startsWith(marker)) fail('patched package reference is missing its exact patch hash');
    normalized = suffix.slice(marker.length);
  }
  if (normalized.includes('(patch_hash=')) fail('unsupported nested or unbound patch marker');
  return /^[0-9]/.test(raw) ? `${match[2]}${normalized}` : `${match[1]}@${match[2]}${normalized}`;
}

// Model only ordinary text modifications to existing files. No fuzzy context,
// mode changes, binary patches, renames, creations or deletions are accepted.
// The real package manager and the installed-tree verifier remain separate.
function applyTextPatch(patchBytes, inputFiles) {
  const patchText = text(patchBytes, 'workspace patch');
  if (!patchText.endsWith('\n') || patchText.includes('\r')) fail('unsupported workspace patch line endings');
  const lines = patchText.slice(0, -1).split('\n'), files = new Map(inputFiles.map(file => [file.path, file]));
  const changed = [], seen = new Set(); let at = 0;
  while (at < lines.length) {
    const header = /^diff --git a\/([A-Za-z0-9._+@/-]+) b\/([A-Za-z0-9._+@/-]+)$/.exec(lines[at++]);
    if (!header || header[1] !== header[2]) fail('unsupported workspace patch file operation');
    const path = relativePath(header[1], 'patch file path');
    if (seen.has(path)) fail('duplicate workspace patch file');
    seen.add(path);
    const original = files.get(path);
    if (!original) fail('workspace patch references a missing file');
    if (lines[at]?.startsWith('index ')) {
      const index = /^index [a-f0-9]+\.\.[a-f0-9]+(?: (100644|100755))?$/.exec(lines[at++]);
      if (!index) fail('unsupported workspace patch index');
      if (index[1] && (Number.parseInt(index[1], 8) & 0o111) !== original.executable) fail('workspace patch index mode differs');
    }
    if (lines[at++] !== `--- a/${path}` || lines[at++] !== `+++ b/${path}`) fail('workspace patch must modify an existing file');
    let originalText;
    try { originalText = new TextDecoder('utf-8', { fatal: true }).decode(original.bytes); } catch { fail('workspace patch target is not UTF-8 text'); }
    if (!originalText.endsWith('\n') || originalText.includes('\r') || originalText.includes('\0')) fail('unsupported workspace patch target line endings');
    const beforeLines = originalText.slice(0, -1).split('\n'), output = [];
    let cursor = 0, hunks = 0;
    while (at < lines.length && lines[at].startsWith('@@ ')) {
      const hunk = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(?: .*)?$/.exec(lines[at++]);
      if (!hunk) fail('invalid workspace patch hunk');
      const oldStart = Number(hunk[1]), oldCount = Number(hunk[2] ?? '1'), newStart = Number(hunk[3]), newCount = Number(hunk[4] ?? '1');
      if (![oldStart, oldCount, newStart, newCount].every(Number.isSafeInteger) || oldStart < 1 || newStart < 1
          || oldCount < 1 || newCount < 1 || oldStart - 1 < cursor || oldStart - 1 > beforeLines.length) fail('unsupported workspace patch hunk range');
      output.push(...beforeLines.slice(cursor, oldStart - 1)); cursor = oldStart - 1;
      if (output.length !== newStart - 1) fail('workspace patch hunk position differs');
      let read = 0, written = 0;
      while (at < lines.length && !lines[at].startsWith('@@ ') && !lines[at].startsWith('diff --git ')) {
        const line = lines[at++], mark = line[0], body = line.slice(1);
        if (![' ', '-', '+'].includes(mark)) fail('unsupported workspace patch hunk line');
        if (mark !== '+') {
          if (beforeLines[cursor] !== body) fail('workspace patch context differs from archive');
          cursor++; read++;
        }
        if (mark !== '-') { output.push(body); written++; }
      }
      if (read !== oldCount || written !== newCount) fail('workspace patch hunk length differs');
      hunks++;
    }
    if (!hunks) fail('workspace patch file has no hunks');
    output.push(...beforeLines.slice(cursor));
    const bytes = Buffer.from(`${output.join('\n')}\n`);
    if (bytes.length > MAX_ARCHIVE) fail('workspace patched file is too large');
    changed.push({ path, before: { sha256: original.sha256, size: original.size, executable: original.executable },
      after: { sha256: sha(bytes), size: bytes.length, executable: original.executable }, bytes });
  }
  if (!changed.length) fail('workspace patch is empty');
  return changed.sort((a, b) => a.path.localeCompare(b.path));
}

// Build a temporary in-memory projection for the existing graph inspector.
// It is never installed or returned as an admitted archive; original reviewed
// tarballs remain the only transport bytes. Long paths use a PAX path record.
function inspectionTar(files) {
  const chunks = []; let total = 1024, sequence = 0;
  function header(name, size, executable, type = '0') {
    const block = Buffer.alloc(512), full = Buffer.from(name), nameFits = full.length <= 100;
    if (nameFits) full.copy(block, 0);
    else {
      let split = name.lastIndexOf('/');
      while (split > 0 && (Buffer.byteLength(name.slice(0, split)) > 155 || Buffer.byteLength(name.slice(split + 1)) > 100)) split = name.lastIndexOf('/', split - 1);
      if (split < 1) fail('inspection tar path exceeds ustar limits');
      block.write(name.slice(split + 1), 0, 100, 'utf8'); block.write(name.slice(0, split), 345, 155, 'utf8');
    }
    const octal = (value, start, length) => {
      const encoded = `${value.toString(8).padStart(length - 1, '0')}\0`;
      if (Buffer.byteLength(encoded) > length) fail('inspection tar value exceeds limit');
      block.write(encoded, start, length, 'ascii');
    };
    octal(0o644 | executable, 100, 8); octal(0, 108, 8); octal(0, 116, 8);
    octal(size, 124, 12); octal(0, 136, 12); block.fill(32, 148, 156); block[156] = type.charCodeAt(0);
    block.write('ustar\0', 257, 6, 'ascii'); block.write('00', 263, 2, 'ascii');
    octal(block.reduce((sum, byte) => sum + byte, 0), 148, 8);
    return block;
  }
  function entry(name, data, executable, type = '0') {
    const bytes = Buffer.from(data), padding = (512 - bytes.length % 512) % 512;
    total += 512 + bytes.length + padding; if (total > MAX_TOTAL) fail('inspection tar exceeds expanded byte limit');
    chunks.push(header(name, bytes.length, executable, type), bytes, Buffer.alloc(padding));
  }
  for (const file of files) {
    const name = `package/${relativePath(file.path, 'inspection file path')}`;
    if (Buffer.byteLength(name) > 100) {
      let split = name.lastIndexOf('/');
      while (split > 0 && (Buffer.byteLength(name.slice(0, split)) > 155 || Buffer.byteLength(name.slice(split + 1)) > 100)) split = name.lastIndexOf('/', split - 1);
      if (split < 1) {
        const payload = `path=${name}\n`; let length = Buffer.byteLength(payload) + 2;
        while (Buffer.byteLength(`${length} ${payload}`) !== length) length = Buffer.byteLength(`${length} ${payload}`);
        entry(`PaxHeader/${sequence}`, Buffer.from(`${length} ${payload}`), 0, 'x');
        entry(`package/projected-${sequence++}`, file.bytes, file.executable); continue;
      }
    }
    entry(name, file.bytes, file.executable);
  }
  const result = gzipSync(Buffer.concat([...chunks, Buffer.alloc(1024)]));
  if (result.byteLength > MAX_ARCHIVE) fail('inspection archive exceeds compressed byte limit');
  return result;
}
function peerMeta(manifest) {
  const peers = stringMap(manifest.peerDependencies, 'peer dependencies');
  const metadata = manifest.peerDependenciesMeta === undefined ? Object.create(null) : mapping(manifest.peerDependenciesMeta, 'peer dependency metadata');
  for (const [name, item] of Object.entries(metadata)) {
    if (!Object.hasOwn(peers, name)) fail('peer metadata names an absent peer');
    fields(item, ['optional'], 'peer metadata');
    if (typeof item.optional !== 'boolean') fail('invalid optional peer metadata');
  }
  return { peers, metadata };
}
function workspaceGraph(context, archiveSnapshots, allowDeferredWorkspaceBins = false) {
  const workspaceBytes = context.read('pnpm-workspace.yaml', 'workspace configuration');
  const config = parseYaml(workspaceBytes, 'workspace configuration');
  const patterns = workspacePatterns(config), paths = manifestPaths(context, patterns);
  if (paths.length > MAX_PACKAGES) fail('workspace importer limit exceeded');
  const manifests = new Map(), names = new Set(), deferredBins = new Map();
  for (const path of paths) {
    const bytes = context.read(path, 'workspace manifest'), manifest = strictJson(bytes, 'workspace manifest');
    mapping(manifest, 'workspace manifest');
    const name = packageName(manifest.name, 'workspace package name'), version = manifest.version;
    semver(version);
    if (names.has(name)) fail('duplicate workspace package name');
    names.add(name);
    if (manifest.pnpm !== undefined && Object.keys(mapping(manifest.pnpm, 'manifest pnpm configuration')).length) fail('workspace manifest pnpm configuration is unsupported');
    if (path === 'package.json' && manifest.packageManager !== 'pnpm@11.1.3') fail('workspace package manager must be pinned to pnpm 11.1.3');
    if (path !== 'package.json' && manifest.packageManager !== undefined) fail('nested package-manager configuration is unsupported');
    const dir = path === 'package.json' ? '.' : path.slice(0, -'/package.json'.length);
    validateManifestBins(manifest, 'workspace', target => {
      if (allowDeferredWorkspaceBins) {
        const deferred = deferredWorkspaceBin(context, dir, name, manifest, sha(bytes), target);
        if (deferred) { deferredBins.set(dir, deferred); return; }
      }
      const sourcePath = dir === '.' ? target : `${dir}/${target}`;
      context.read(sourcePath, 'workspace bin target');
    });
    manifests.set(dir, { path, name, version, sha256: sha(bytes), manifest });
  }
  rejectLocalPnpmConfig(context.root, manifests.keys());
  const lockBytes = context.read('pnpm-lock.yaml', 'workspace lock');
  if (sha(lockBytes) !== context.source.lockfileSha256) fail('workspace lock source identity mismatch');
  const lock = parseYaml(lockBytes, 'workspace lock');
  fields(lock, ['lockfileVersion', 'settings', 'importers', 'packages', 'snapshots', 'overrides', 'patchedDependencies'], 'workspace lock');
  if (lock.lockfileVersion !== '9.0') fail('only pnpm lockfile version 9.0 is supported');
  const rules = workspaceRules(context, config, lock);
  const settings = lock.settings === undefined ? Object.create(null) : lock.settings;
  fields(settings, ['autoInstallPeers', 'excludeLinksFromLockfile'], 'lock settings');
  for (const value of Object.values(settings)) if (typeof value !== 'boolean') fail('invalid lock setting');
  if (settings.excludeLinksFromLockfile === true) fail('workspace links must be retained in the lock');
  const importers = mapping(lock.importers, 'lock importers');
  if (!sameSet(manifests.keys(), Object.keys(importers))) fail('workspace importers differ from staged manifests');
  const packages = mapping(lock.packages, 'lock packages'), snapshots = mapping(lock.snapshots, 'lock snapshots');
  if (Object.keys(packages).length > MAX_PACKAGES || Object.keys(snapshots).length > MAX_PACKAGES) fail('workspace graph package limit exceeded');
  const projectedPackages = JSON.parse(JSON.stringify(packages)), projectedSnapshots = Object.create(null);
  for (const [key, value] of Object.entries(snapshots)) {
    const normalized = normalizePatchedReference('', key, rules.patches);
    if (Object.hasOwn(projectedSnapshots, normalized)) fail('patched snapshots collide in the inspection projection');
    const item = JSON.parse(JSON.stringify(value));
    for (const group of ['dependencies', 'optionalDependencies']) {
      if (item[group] === undefined) continue;
      mapping(item[group], `snapshot ${group}`);
      for (const [name, reference] of Object.entries(item[group])) item[group][name] = normalizePatchedReference(name, reference, rules.patches);
    }
    projectedSnapshots[normalized] = item;
    if (key !== normalized) {
      const match = /^((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)@((?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*))/.exec(key);
      const rule = match && rules.patches.get(`${match[1]}@${match[2]}`);
      if (!rule) fail('patched snapshot has no source-bound patch');
      rule.snapshotKeys.push(key);
    }
  }
  for (const rule of rules.patches.values()) if (!rule.snapshotKeys.length) fail('workspace patch has no matching snapshot');
  const syntheticManifest = { name: 'aura-workspace-inspection', version: '0.0.0', private: true, dependencies: {} };
  const syntheticRoot = { dependencies: {} }, importerRecords = [], links = [];
  let serial = 0;
  function addExternal(installed, specification, lockedVersion) {
    const target = dependencyTarget(installed, specification);
    if (typeof lockedVersion !== 'string' || !lockedVersion || /^(?:file:|link:)/.test(lockedVersion)) fail('external dependency has an unsupported lock resolution');
    const alias = `workspace-root-${serial++}`, spec = `npm:${target.name}@${target.range}`;
    const normalized = normalizePatchedReference(target.name, lockedVersion, rules.patches);
    const version = /^[0-9]/.test(normalized) ? `${target.name}@${normalized}` : normalized;
    syntheticManifest.dependencies[alias] = spec;
    syntheticRoot.dependencies[alias] = { specifier: spec, version };
    return target.name;
  }
  for (const [dir, entry] of manifests) {
    const importer = importers[dir]; fields(importer, ['dependencies', 'devDependencies', 'optionalDependencies'], 'workspace importer');
    const requested = {
      dependencies: stringMap(entry.manifest.dependencies, 'workspace dependencies'),
      devDependencies: stringMap(entry.manifest.devDependencies, 'workspace devDependencies'),
      optionalDependencies: stringMap(entry.manifest.optionalDependencies, 'workspace optionalDependencies')
    };
    const { peers, metadata } = peerMeta(entry.manifest), lockedByName = new Map(), roots = [];
    for (const group of Object.keys(requested)) {
      const locked = importer[group] === undefined ? Object.create(null) : mapping(importer[group], `importer ${group}`);
      for (const [name, node] of Object.entries(locked)) {
        packageName(name, 'importer dependency');
        fields(node, ['specifier', 'version'], 'importer dependency');
        if (typeof node.specifier !== 'string' || typeof node.version !== 'string' || lockedByName.has(name)) fail('invalid or duplicated importer dependency');
        const directSpec = requested[group][name];
        const autoPeer = group === 'dependencies' && settings.autoInstallPeers === true && peers[name] === node.specifier;
        if (directSpec !== node.specifier && !autoPeer) fail(`importer dependency differs from staged manifest: ${dir}/${name}`);
        lockedByName.set(name, { group, ...node });
      }
    }
    for (const [group, values] of Object.entries(requested)) {
      for (const [name, specification] of Object.entries(values)) {
        const node = lockedByName.get(name);
        // pnpm may collapse an exact duplicate from two dependency sections.
        if (!node || node.specifier !== specification || (node.group !== group && requested[node.group]?.[name] !== specification)) fail(`workspace dependency is missing from lock: ${dir}/${name}`);
      }
    }
    for (const [name, node] of lockedByName) {
      let kind, target;
      if (node.version.startsWith('link:')) {
        if (!node.specifier.startsWith('workspace:')) fail(`local link is not a workspace dependency: ${dir}/${name}`);
        const suffix = node.version.slice('link:'.length);
        if (!suffix || suffix.startsWith('/') || suffix.includes('\\') || /[?#\x00-\x1f]/.test(suffix)) fail('unsafe workspace link');
        const destination = posix.normalize(posix.join(dir, suffix));
        if (destination === '..' || destination.startsWith('../') || destination.startsWith('/')) fail('workspace link escapes source');
        const linked = manifests.get(destination);
        if (!linked || linked.name !== name || !workspaceVersionSatisfies(linked.version, node.specifier)) fail(`workspace link identity mismatch: ${dir}/${name}`);
        kind = 'workspace'; target = destination;
        links.push({ importer: dir, name, target: destination, version: linked.version });
      } else {
        if (node.specifier.startsWith('workspace:')) fail('workspace dependency is not linked');
        kind = 'archive'; target = addExternal(name, node.specifier, node.version);
      }
      roots.push({ group: node.group, name, specifier: node.specifier, version: node.version, kind, target });
    }
    // Check every declared peer against its actual locked target. Additional
    // synthetic aliases preserve distinct versions selected by each importer.
    for (const [name, specification] of Object.entries(peers)) {
      const node = lockedByName.get(name);
      if (!node) {
        if (settings.autoInstallPeers === true && metadata[name]?.optional !== true) fail(`required auto-installed peer is missing: ${dir}/${name}`);
        continue;
      }
      if (node.version.startsWith('link:')) {
        const destination = posix.normalize(posix.join(dir, node.version.slice('link:'.length)));
        const linked = manifests.get(destination);
        if (!linked || linked.name !== name || !workspaceVersionSatisfies(linked.version, specification)) fail(`workspace peer version mismatch: ${dir}/${name}`);
      } else addExternal(name, specification, node.version);
    }
    importerRecords.push({ path: dir, name: entry.name, version: entry.version, manifestSha256: entry.sha256,
      peerDependencies: JSON.parse(JSON.stringify(peers)), peerDependenciesMeta: JSON.parse(JSON.stringify(metadata)),
      roots: roots.sort((a, b) => a.name.localeCompare(b.name)) });
  }
  const syntheticLock = { lockfileVersion: '9.0', settings, importers: { '.': syntheticRoot }, packages: projectedPackages, snapshots: projectedSnapshots };
  const byPath = new Map(), archiveInputs = []; let total = 0;
  if (!Array.isArray(archiveSnapshots) || archiveSnapshots.length > MAX_PACKAGES) fail('workspace archive snapshots are required');
  const resolutions = new Set();
  for (const [index, item] of archiveSnapshots.entries()) {
    fields(item, ['resolved', 'bytes'], 'archive snapshot');
    if (typeof item.resolved !== 'string' || !item.resolved || item.resolved.length > 8192 || resolutions.has(item.resolved)) fail('duplicate or invalid archive resolution');
    if (!(item.bytes instanceof Uint8Array) || !item.bytes.byteLength || item.bytes.byteLength > MAX_ARCHIVE) fail('invalid workspace archive bytes');
    total += item.bytes.byteLength; if (total > MAX_TOTAL) fail('workspace archive byte limit exceeded');
    resolutions.add(item.resolved);
    const path = `workspace-archive/${index}`, bytes = Buffer.from(item.bytes);
    byPath.set(path, bytes); archiveInputs.push({ resolved: item.resolved, path });
  }
  const byResolution = new Map(archiveInputs.map(item => [item.resolved, item.path]));
  const originals = new Map(), unresolvedOptionalPeers = [];
  for (const [key, metadata] of Object.entries(packages)) {
    const id = packageKey(key), name = id.name, version = id.version;
    fields(metadata.resolution, ['integrity', 'tarball'], 'package resolution');
    const leaf = name.slice(name.lastIndexOf('/') + 1);
    const resolved = `https://registry.npmjs.org/${name}/-/${leaf}-${version}.tgz`;
    if (metadata.resolution.tarball !== undefined && metadata.resolution.tarball !== resolved) fail('unsupported workspace registry resolution');
    const path = byResolution.get(resolved), originalBytes = path && byPath.get(path);
    if (!originalBytes) fail(`missing package archive: ${key}`);
    if (sri(originalBytes) !== metadata.resolution.integrity) fail(`archive integrity mismatch: ${key}`);
    const parsed = inspectAdmittedArchiveFiles(originalBytes), manifest = parsed.manifest;
    if (manifest.name !== name || manifest.version !== version) fail(`workspace archive identity mismatch: ${key}`);
    const regularArchiveFiles = new Set(parsed.files.map(file => file.path));
    validateManifestBins(manifest, 'archive', target => {
      if (!regularArchiveFiles.has(target)) fail(`archive bin target is not a regular reviewed file: ${target}`);
    });
    for (const field of ['cpu', 'os', 'libc']) {
      const actual = manifest[field], expected = metadata[field];
      if (actual !== undefined && (!Array.isArray(actual) || actual.some(item => typeof item !== 'string'))) fail(`invalid archive ${field} metadata`);
      if (canonical(actual ?? null) !== canonical(expected ?? null)) fail(`archive ${field} metadata differs from lock`);
    }
    const original = { resolved, path, bytes: Buffer.from(originalBytes), sha256: sha(originalBytes),
      integrity: sri(originalBytes), manifest };
    originals.set(resolved, original);
    const projectedFiles = parsed.files.map(file => ({ ...file, bytes: Buffer.from(file.bytes) }));
    const projectedManifest = JSON.parse(JSON.stringify(manifest));
    let manifestChanged = false, filesChanged = false;
    const patch = rules.patches.get(key);
    if (patch) {
      const changed = applyTextPatch(patch.bytes, parsed.files);
      if (changed.some(file => file.path === 'package.json')) fail('patching package manifests is not supported');
      patch.archive = { name, version, sha256: original.sha256, integrity: original.integrity };
      patch.files = changed;
      for (const file of changed) {
        const projected = projectedFiles.find(item => item.path === file.path);
        if (!projected) fail('patch projection file is missing');
        projected.bytes = Buffer.from(file.bytes);
      }
      filesChanged = true;
    }
    for (const rule of rules.overrides) {
      if (rule.parent !== name) continue;
      const required = projectedManifest.dependencies ?? {}, optional = projectedManifest.optionalDependencies ?? {};
      const isRequired = Object.hasOwn(required, rule.dependency), isOptional = Object.hasOwn(optional, rule.dependency);
      if (!isRequired && !isOptional) continue;
      if ((isRequired && isOptional) || (isRequired && typeof required[rule.dependency] !== 'string')
          || (isOptional && typeof optional[rule.dependency] !== 'string')) fail('override does not identify one archive dependency');
      if (isRequired) required[rule.dependency] = rule.version; else optional[rule.dependency] = rule.version;
      rule.affectedPackages.push(key); manifestChanged = true;
    }
    const peers = metadata.peerDependencies ?? {}, peerOptions = metadata.peerDependenciesMeta ?? {};
    if (canonical(peers) !== canonical(manifest.peerDependencies ?? {}) || canonical(peerOptions) !== canonical(manifest.peerDependenciesMeta ?? {})) fail('archive peer metadata differs from lock');
    for (const [peer, range] of Object.entries(peers)) {
      if (range !== 'latest') continue;
      if (peerOptions[peer]?.optional !== true) fail('registry tag peer must be optional');
      const variants = Object.entries(snapshots).filter(([snapshot]) => snapshot === key || snapshot.startsWith(`${key}(`));
      if (!variants.length) fail('optional tag peer has no package snapshot');
      for (const [snapshot, item] of variants) {
        if (Object.hasOwn(item.dependencies ?? {}, peer) || Object.hasOwn(item.optionalDependencies ?? {}, peer)
            || (item.transitivePeerDependencies ?? []).includes(peer) || snapshot.includes(`(${peer}@`)) {
          fail('optional tag peer is resolved or bound');
        }
      }
      delete projectedManifest.peerDependencies[peer];
      delete projectedManifest.peerDependenciesMeta[peer];
      delete projectedPackages[key].peerDependencies[peer];
      delete projectedPackages[key].peerDependenciesMeta[peer];
      unresolvedOptionalPeers.push({ packageKey: key, name: peer, specifier: range,
        snapshotKeys: variants.map(([snapshot]) => snapshot).sort() });
      manifestChanged = true;
    }
    if (manifestChanged) {
      const packageFile = projectedFiles.find(file => file.path === 'package.json');
      if (!packageFile) fail('workspace archive manifest is missing');
      packageFile.bytes = Buffer.from(JSON.stringify(projectedManifest));
      filesChanged = true;
    }
    if (filesChanged) {
      const projected = inspectionTar(projectedFiles);
      byPath.set(path, projected);
      projectedPackages[key].resolution.integrity = sri(projected);
    }
  }
  if (originals.size !== archiveInputs.length) fail('archive inventory has unused entries');
  for (const rule of rules.overrides) {
    if (!rule.affectedPackages.length) fail('workspace override has no matching package');
    rule.affectedPackages.sort();
  }
  for (const rule of rules.patches.values()) if (!rule.archive || !rule.files) fail('workspace patch has no matching archive');
  const inspection = inspectIndependentPnpmConsumer({ manifestBytes: Buffer.from(JSON.stringify(syntheticManifest)),
    lockBytes: Buffer.from(`${stringifyYaml(syntheticLock)}\n`), archives: archiveInputs,
    readArchive: path => byPath.get(path), candidatePackages: [] });
  // The shared graph inspector validates the lock's platform fields and all
  // reachable optional edges. Bind those fields to the actual archive package
  // manifest too: a changed platform constraint must not silently decide which
  // bytes are installed on a given host.
  const originalArchives = inspection.archives.map(item => {
    const original = originals.get(item.resolved); if (!original) fail('inspection archive has no original'); return original;
  });
  const byIdentity = new Map(originalArchives.map(item => [`${item.manifest.name}@${item.manifest.version}`, item]));
  for (const [key, metadata] of Object.entries(packages)) {
    const match = /^((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)@(.+)$/.exec(key);
    if (!match) fail('invalid workspace package identity');
    const archive = byIdentity.get(`${match[1]}@${match[2]}`);
    if (!archive) fail('workspace package archive is missing');
    for (const field of ['cpu', 'os', 'libc']) {
      const actual = archive.manifest[field], expected = metadata[field];
      if (actual !== undefined && (!Array.isArray(actual) || actual.some(item => typeof item !== 'string'))) fail(`invalid archive ${field} metadata`);
      if (canonical(actual ?? null) !== canonical(expected ?? null)) fail(`archive ${field} metadata differs from lock`);
    }
  }
  const graph = {
    settings: JSON.parse(JSON.stringify(settings)),
    importers: importerRecords.sort((a, b) => a.path.localeCompare(b.path)),
    packages: Object.entries(packages).map(([key, value]) => ({ key, ...JSON.parse(JSON.stringify(value)) })).sort((a, b) => a.key.localeCompare(b.key)),
    snapshots: Object.entries(snapshots).map(([key, value]) => ({ key, ...JSON.parse(JSON.stringify(value)) })).sort((a, b) => a.key.localeCompare(b.key))
  };
  return { graph, deferredBins: [...deferredBins.values()].sort((a, b) => a.importer.localeCompare(b.importer)),
    links: links.sort((a, b) => `${a.importer}/${a.name}`.localeCompare(`${b.importer}/${b.name}`)),
    archives: originalArchives, patches: [...rules.patches.values()].map(rule => ({ packageKey: rule.packageKey, archive: rule.archive,
      patch: rule.patch, snapshotKeys: rule.snapshotKeys.sort(), files: rule.files })).sort((a, b) => a.packageKey.localeCompare(b.packageKey)),
    overrides: rules.overrides.sort((a, b) => a.selector.localeCompare(b.selector)),
    unresolvedOptionalPeers: unresolvedOptionalPeers.sort((a, b) => `${a.packageKey}/${a.name}`.localeCompare(`${b.packageKey}/${b.name}`)),
    workspaceBytes: Buffer.from(workspaceBytes), lockBytes: Buffer.from(lockBytes),
    workspaceSha256: sha(workspaceBytes), lockSha256: sha(lockBytes),
    allowedBuilds: Object.entries(config.allowBuilds ?? {}).filter(([, enabled]) => enabled).map(([name]) => name).sort() };
}

function exactKeys(value, keys, label) {
  fields(value, keys, label);
  if (Object.keys(value).length !== keys.length || keys.some(key => !Object.hasOwn(value, key))) fail(`invalid ${label} fields`);
}
function identity(value, label) {
  exactKeys(value, ['name', 'version', 'sha256', 'integrity'], label);
  packageName(value.name, `${label} name`); semver(value.version);
  if (!HASH.test(value.sha256 ?? '') || !SRI.test(value.integrity ?? '')
      || Buffer.from(value.integrity.slice(7), 'base64').toString('base64') !== value.integrity.slice(7)) fail(`invalid ${label} digest`);
}
function policy(context) {
  if (!HASH.test(TRUSTED_WORKSPACE_POLICY_SHA256 ?? '')) fail('no independently trusted workspace policy anchor is configured');
  const bytes = context.read(WORKSPACE_POLICY_PATH, 'workspace policy');
  if (sha(bytes) !== TRUSTED_WORKSPACE_POLICY_SHA256) fail('workspace policy differs from independently trusted anchor');
  const value = strictJson(bytes, 'workspace policy', true);
  fields(value, ['schema', 'admissions', 'patches', 'toolchain', 'sourceAuthorities'], 'workspace policy');
  if (!Object.hasOwn(value, 'schema') || !Object.hasOwn(value, 'admissions')) fail('invalid workspace policy fields');
  if (value.schema !== 'aura3d.workspace-archive-policy/1' || !Array.isArray(value.admissions) || value.admissions.length > MAX_PACKAGES) fail('invalid workspace policy inventory');
  const entries = new Map(), patches = new Map();
  for (const item of value.admissions) {
    exactKeys(item, ['archive', 'review'], 'policy admission');
    identity(item.archive, 'policy archive');
    exactKeys(item.review, ['path', 'sha256'], 'policy review');
    relativePath(item.review.path, 'review path');
    if (!HASH.test(item.review.sha256 ?? '') || item.review.path === WORKSPACE_POLICY_PATH) fail('invalid policy review reference');
    const key = canonical(item.archive); if (entries.has(key)) fail('duplicate workspace policy archive');
    entries.set(key, item.review);
  }
  if (value.patches !== undefined && (!Array.isArray(value.patches) || value.patches.length > MAX_PACKAGES)) fail('invalid workspace patch policy');
  for (const item of value.patches ?? []) {
    exactKeys(item, ['archive', 'patch', 'review'], 'patch policy admission');
    identity(item.archive, 'patch policy archive');
    exactKeys(item.patch, ['path', 'sha256'], 'patch policy source');
    exactKeys(item.review, ['path', 'sha256'], 'patch policy review');
    relativePath(item.patch.path, 'patch policy source'); relativePath(item.review.path, 'patch policy review');
    if (!HASH.test(item.patch.sha256 ?? '') || !HASH.test(item.review.sha256 ?? '')
        || item.review.path === WORKSPACE_POLICY_PATH || item.review.path === item.patch.path) fail('invalid patch policy reference');
    const key = canonical({ archive: item.archive, patch: item.patch });
    if (patches.has(key)) fail('duplicate patch policy admission');
    patches.set(key, item.review);
  }
  // The policy pin, not the candidate or its approval envelope, chooses the
  // independent source reviewers. An absent inventory is valid for archive
  // byte inspection but cannot approve a source-runner workspace.
  const authorities = new Map(), configured = value.sourceAuthorities ?? [];
  if (!Array.isArray(configured) || configured.length > MAX_PACKAGES) fail('invalid workspace source authority inventory');
  for (const authority of configured) {
    exactKeys(authority, ['keyId', 'spkiDerBase64'], 'workspace source authority');
    if (!HASH.test(authority.keyId ?? '') || typeof authority.spkiDerBase64 !== 'string'
        || !/^[A-Za-z0-9+/]+={0,2}$/.test(authority.spkiDerBase64)) fail('invalid workspace source authority');
    const der = Buffer.from(authority.spkiDerBase64, 'base64');
    if (der.length !== 44 || der.toString('base64') !== authority.spkiDerBase64
        || sha(der) !== authority.keyId || authorities.has(authority.keyId)) fail('invalid or duplicate workspace source authority');
    let key;
    try { key = createPublicKey({ key: der, format: 'der', type: 'spki' }); }
    catch { fail('invalid workspace source authority key'); }
    if (key.asymmetricKeyType !== 'ed25519' || !Buffer.from(key.export({ format: 'der', type: 'spki' })).equals(der)) {
      fail('unsupported workspace source authority key');
    }
    authorities.set(authority.keyId, key);
  }
  return { entries, patches, authorities, toolchain: value.toolchain, sha256: sha(bytes) };
}
function reviewedRef(context, item, label, forbidden) {
  exactKeys(item, ['path', 'sha256'], label); relativePath(item.path, `${label} path`);
  if (!HASH.test(item.sha256 ?? '') || forbidden.includes(item.path)) fail(`invalid ${label} reference`);
  const data = context.read(item.path, label); if (sha(data) !== item.sha256) fail(`${label} digest mismatch`);
  return data;
}
function reviewArchive(context, policyEntries, archive) {
  const actualIdentity = { name: archive.manifest.name, version: archive.manifest.version, sha256: archive.sha256, integrity: archive.integrity };
  identity(actualIdentity, 'workspace archive');
  const reference = policyEntries.get(canonical(actualIdentity));
  if (!reference) fail(`no independent workspace archive review for ${actualIdentity.name}@${actualIdentity.version}`);
  const reviewBytes = reviewedRef(context, reference, 'archive review', [WORKSPACE_POLICY_PATH]);
  const review = strictJson(reviewBytes, 'archive review', true);
  exactKeys(review, ['schema', 'archive', 'decision', 'scope', 'reviewer', 'files'], 'archive review');
  identity(review.archive, 'review archive');
  exactKeys(review.reviewer, ['id', 'kind'], 'archive reviewer');
  if (review.schema !== 'aura3d.archive-review/1' || review.decision !== 'approved' || review.scope !== 'complete-archive'
      || review.reviewer.kind !== 'independent-source-review' || typeof review.reviewer.id !== 'string'
      || review.reviewer.id.trim().length < 3 || review.reviewer.id.length > 200
      || /^(?:unknown|pending|unassigned|fixture|synthetic)$/i.test(review.reviewer.id)
      || canonical(review.archive) !== canonical(actualIdentity)) fail('workspace archive review identity or decision mismatch');
  const files = inspectNpmArchive(archive.bytes).files
    .map(file => ({ path: file.path, sha256: sha(file.bytes), size: file.bytes.byteLength }))
    .sort((a, b) => a.path.localeCompare(b.path));
  if (!Array.isArray(review.files) || !files.length || review.files.length !== files.length) fail('workspace review does not cover every archive file');
  const reviewed = new Map();
  for (const item of review.files) {
    exactKeys(item, ['path', 'sha256', 'size', 'origin', 'sources', 'evidence', 'rationale'], 'reviewed file');
    relativePath(item.path, 'reviewed archive path');
    if (reviewed.has(item.path) || !HASH.test(item.sha256 ?? '') || !Number.isSafeInteger(item.size) || item.size < 0
        || !['source-match', 'reviewed-output'].includes(item.origin) || typeof item.rationale !== 'string'
        || item.rationale.trim().length < 60 || item.rationale.length > 8192) fail('invalid workspace file review');
    const forbidden = [WORKSPACE_POLICY_PATH, reference.path], sources = item.sources, evidence = item.evidence;
    if (!Array.isArray(sources) || !sources.length || sources.length > MAX_PACKAGES || !Array.isArray(evidence) || !evidence.length || evidence.length > MAX_PACKAGES) fail('workspace file review requires sources and evidence');
    if (new Set(sources.map(ref => ref?.path)).size !== sources.length || new Set(evidence.map(ref => ref?.path)).size !== evidence.length) fail('duplicate workspace evidence path');
    const sourceBytes = sources.map(ref => reviewedRef(context, ref, 'review source', forbidden));
    for (const ref of evidence) {
      if (!reviewedRef(context, ref, 'review evidence', [...forbidden, ...sources.map(source => source.path)]).byteLength) fail('review evidence is empty');
    }
    if (item.origin === 'source-match' && !sourceBytes.some(bytes => bytes.length === item.size && sha(bytes) === item.sha256)) fail('workspace reviewed source does not match archive file');
    reviewed.set(item.path, item);
  }
  for (const file of files) {
    const record = reviewed.get(file.path);
    if (!record || record.sha256 !== file.sha256 || record.size !== file.size) fail(`workspace review inventory differs: ${file.path}`);
  }
  return { ...actualIdentity, resolved: archive.resolved, review: { ...reference }, files };
}
function patchFileIdentity(value, label) {
  exactKeys(value, ['sha256', 'size', 'executable'], label);
  if (!HASH.test(value.sha256 ?? '') || !Number.isSafeInteger(value.size) || value.size < 0
      || !Number.isInteger(value.executable) || value.executable < 0 || (value.executable & ~0o111) !== 0) fail(`invalid ${label}`);
}
function reviewPatch(context, policyEntries, patch) {
  const reference = policyEntries.get(canonical({ archive: patch.archive, patch: patch.patch }));
  if (!reference) fail(`no independently reviewed patch output for ${patch.packageKey}`);
  const data = reviewedRef(context, reference, 'patch review', [WORKSPACE_POLICY_PATH, patch.patch.path]);
  const review = strictJson(data, 'patch review', true);
  exactKeys(review, ['schema', 'archive', 'patch', 'decision', 'scope', 'reviewer', 'files'], 'patch review');
  identity(review.archive, 'patch review archive');
  exactKeys(review.patch, ['path', 'sha256'], 'patch review source');
  exactKeys(review.reviewer, ['id', 'kind'], 'patch reviewer');
  if (review.schema !== 'aura3d.workspace-patch-review/1' || review.decision !== 'approved' || review.scope !== 'complete-patch'
      || review.reviewer.kind !== 'independent-source-review' || typeof review.reviewer.id !== 'string'
      || review.reviewer.id.trim().length < 3 || review.reviewer.id.length > 200
      || /^(?:unknown|pending|unassigned|fixture|synthetic)$/i.test(review.reviewer.id)
      || canonical(review.archive) !== canonical(patch.archive) || canonical(review.patch) !== canonical(patch.patch)) fail('patch review identity or decision mismatch');
  if (!Array.isArray(review.files) || !patch.files.length || review.files.length !== patch.files.length) fail('patch review does not cover every changed file');
  const reviewed = new Map();
  for (const item of review.files) {
    exactKeys(item, ['path', 'before', 'after', 'sources', 'evidence', 'rationale'], 'reviewed patch file');
    relativePath(item.path, 'reviewed patch file');
    patchFileIdentity(item.before, 'patch before identity'); patchFileIdentity(item.after, 'patch after identity');
    if (reviewed.has(item.path) || typeof item.rationale !== 'string' || item.rationale.trim().length < 60 || item.rationale.length > 8192) fail('invalid patch file review');
    if (!Array.isArray(item.sources) || !item.sources.length || item.sources.length > MAX_PACKAGES
        || !Array.isArray(item.evidence) || !item.evidence.length || item.evidence.length > MAX_PACKAGES
        || new Set(item.sources.map(ref => ref?.path)).size !== item.sources.length
        || new Set(item.evidence.map(ref => ref?.path)).size !== item.evidence.length) fail('patch review requires sources and evidence');
    const blocked = [WORKSPACE_POLICY_PATH, reference.path];
    for (const ref of item.sources) reviewedRef(context, ref, 'patch review source', blocked);
    if (!item.sources.some(source => source.path === patch.patch.path && source.sha256 === patch.patch.sha256)) fail('patch review does not cite the source-bound patch');
    for (const ref of item.evidence) {
      if (!reviewedRef(context, ref, 'patch review evidence', [...blocked, ...item.sources.map(source => source.path)]).byteLength) fail('patch review evidence is empty');
    }
    reviewed.set(item.path, item);
  }
  for (const file of patch.files) {
    const record = reviewed.get(file.path);
    if (!record || canonical(record.before) !== canonical(file.before) || canonical(record.after) !== canonical(file.after)) fail(`reviewed patch output differs: ${file.path}`);
  }
  return { packageKey: patch.packageKey, archive: { ...patch.archive }, patch: { ...patch.patch },
    snapshotKeys: [...patch.snapshotKeys], review: { ...reference },
    files: patch.files.map(file => ({ path: file.path, before: { ...file.before }, after: { ...file.after } })) };
}
function freeze(value) {
  if (value && typeof value === 'object' && !ArrayBuffer.isView(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
const workspaceCapabilities = new WeakMap();
function deferredBinOptIn(value) {
  if (value !== undefined && typeof value !== 'boolean') fail('invalid deferred workspace bin opt-in');
  return value === true;
}

/**
 * Inspect a staged workspace and exact caller-supplied bytes. This function is
 * structural only: a graph, a digest, or a name filter is not a source review.
 * It neither issues a capability nor authorizes package-manager execution.
 */
export function inspectWorkspacePnpmGraph({ root, sourceManifestPath, archives, allowDeferredWorkspaceBins }) {
  const allowDeferred = deferredBinOptIn(allowDeferredWorkspaceBins);
  const context = stagedContext(root, sourceManifestPath), found = workspaceGraph(context, archives, allowDeferred);
  return {
    source: { ...context.source }, workspaceSha256: found.workspaceSha256, lockSha256: found.lockSha256,
    graph: found.graph, deferredBins: found.deferredBins, links: found.links, overrides: found.overrides, unresolvedOptionalPeers: found.unresolvedOptionalPeers,
    patches: found.patches.map(patch => ({ packageKey: patch.packageKey, archive: { ...patch.archive }, patch: { ...patch.patch },
      snapshotKeys: [...patch.snapshotKeys], files: patch.files.map(file => ({ path: file.path, before: { ...file.before },
        after: { ...file.after }, bytes: Uint8Array.from(file.bytes) })) })),
    archives: found.archives.map(item => ({ resolved: item.resolved, name: item.manifest.name, version: item.manifest.version,
      sha256: item.sha256, integrity: item.integrity, bytes: Uint8Array.from(item.bytes) })),
    allowedBuilds: found.allowedBuilds
  };
}

/**
 * Review every represented workspace archive against an independently pinned
 * pre-candidate policy. The opaque capability protects these exact snapshots
 * for later byte custody only; it is not permission to run an install.
 */
export function verifyWorkspacePnpmAdmission({ root, sourceManifestPath, archives, allowDeferredWorkspaceBins }) {
  if (!HASH.test(TRUSTED_WORKSPACE_POLICY_SHA256 ?? '')) fail('no independently trusted workspace policy anchor is configured');
  const allowDeferred = deferredBinOptIn(allowDeferredWorkspaceBins);
  const context = stagedContext(root, sourceManifestPath), trusted = policy(context), found = workspaceGraph(context, archives, allowDeferred);
  const decisions = found.archives.map(archive => reviewArchive(context, trusted.entries, archive));
  const patchDecisions = found.patches.map(patch => reviewPatch(context, trusted.patches, patch));
  const receipt = freeze({
    schema: 'aura3d.workspace-pnpm-admission/1', source: { ...context.source },
    sourceManifest: { path: sourceManifestPath, sha256: context.source.manifestSha256 },
    workspaceSha256: found.workspaceSha256, lockSha256: found.lockSha256,
    policy: { path: WORKSPACE_POLICY_PATH, sha256: trusted.sha256 }, graph: found.graph, deferredBins: found.deferredBins, links: found.links,
    archives: decisions, patches: patchDecisions, overrides: found.overrides,
    unresolvedOptionalPeers: found.unresolvedOptionalPeers, allowedBuilds: found.allowedBuilds,
    prerequisites: ['Independently verified pinned package-manager custody.',
      'A verified isolated offline or sealed-network store and transport.',
      'Lifecycle scripts disabled until installed files and outputs are independently verified.',
      ...(found.deferredBins.length ? ['Trusted verifier and process custody for the deferred-bin contract.',
        'Deferred workspace CLI output bytes and their source-to-output relationship remain unverified.'] : []),
      'Exact installed-tree, optional/platform selection and generated-file verification.',
      'Only the inspected exact patch, direct-parent override and unresolved optional tag forms are represented.']
  });
  const capability = Object.freeze({});
  workspaceCapabilities.set(capability, {
    root: context.root, sourceManifestPath, receipt,
    workspaceBytes: Buffer.from(found.workspaceBytes), lockBytes: Buffer.from(found.lockBytes),
    archives: found.archives.map(item => ({ resolved: item.resolved, bytes: Buffer.from(item.bytes) })),
    patches: found.patches.map(patch => ({ packageKey: patch.packageKey,
      files: patch.files.map(file => ({ path: file.path, bytes: Buffer.from(file.bytes) })) }))
  });
  return { receipt, capability };
}

/** Recheck the staged source/policy and return fresh, exact reviewed bytes. */
export function consumeWorkspacePnpmAdmission({ capability, root, sourceManifestPath }) {
  const saved = workspaceCapabilities.get(capability);
  if (!saved) fail('invalid workspace archive capability');
  const context = stagedContext(root, sourceManifestPath), trusted = policy(context);
  if (saved.root !== context.root || saved.sourceManifestPath !== sourceManifestPath
      || saved.receipt.source.manifestSha256 !== context.source.manifestSha256
      || saved.receipt.source.inputDigest !== context.source.inputDigest || saved.receipt.policy.sha256 !== trusted.sha256) fail('workspace capability source or policy differs');
  if (saved.receipt.deferredBins.length) assertDeferredVerifier(context);
  const deferredBins = saved.receipt.deferredBins.map(item => {
    assertDeferredOutputAbsent(context.root, item.importer);
    return { ...item, commands: [...item.commands], source: { ...item.source } };
  });
  const archives = saved.archives.map((item, index) => {
    const metadata = saved.receipt.archives[index];
    if (metadata.resolved !== item.resolved || metadata.sha256 !== sha(item.bytes) || metadata.integrity !== sri(item.bytes)) fail('workspace archive snapshot differs');
    return { ...metadata, files: metadata.files.map(file => ({ ...file })), bytes: Uint8Array.from(item.bytes) };
  });
  const patches = saved.patches.map((patch, index) => {
    const metadata = saved.receipt.patches[index];
    if (metadata.packageKey !== patch.packageKey || metadata.files.length !== patch.files.length) fail('workspace patch snapshot differs');
    return { ...metadata, archive: { ...metadata.archive }, patch: { ...metadata.patch }, snapshotKeys: [...metadata.snapshotKeys],
      files: patch.files.map((file, position) => {
        const record = metadata.files[position];
        if (record.path !== file.path || record.after.size !== file.bytes.length || record.after.sha256 !== sha(file.bytes)) fail('workspace patch output snapshot differs');
        return { path: record.path, before: { ...record.before }, after: { ...record.after }, bytes: Uint8Array.from(file.bytes) };
      }) };
  });
  return { source: { ...saved.receipt.source }, workspaceSha256: saved.receipt.workspaceSha256,
    lockSha256: saved.receipt.lockSha256, workspaceBytes: Uint8Array.from(saved.workspaceBytes), lockBytes: Uint8Array.from(saved.lockBytes),
    graph: JSON.parse(JSON.stringify(saved.receipt.graph)), deferredBins, links: saved.receipt.links.map(item => ({ ...item })), archives, patches,
    overrides: JSON.parse(JSON.stringify(saved.receipt.overrides)), unresolvedOptionalPeers: JSON.parse(JSON.stringify(saved.receipt.unresolvedOptionalPeers)) };
}

// A separately signed source approval is distinct from the archive capability.
// It lives outside the staged source so its signature does not recursively
// change the source manifest it approves. It is never an install permit.
const workspaceSourceApprovals = new WeakMap();

/**
 * Describe exactly what an independent reviewer must approve. A caller may
 * send this subject to a reviewer, but constructing it grants no authority.
 */
export function workspacePnpmSourceApprovalSubject(input) {
  fields(input, ['root', 'sourceManifestPath', 'capability'], 'workspace source approval subject');
  const { root, sourceManifestPath, capability } = input;
  const saved = workspaceCapabilities.get(capability);
  if (!saved) fail('invalid workspace archive capability');
  const admitted = consumeWorkspacePnpmAdmission({ root, sourceManifestPath, capability });
  return freeze({
    schema: 'aura3d.workspace-source-subject/1',
    sourceInputSha256: admitted.source.inputDigest,
    sourceManifestSha256: admitted.source.manifestSha256,
    workspaceSha256: admitted.workspaceSha256,
    lockfileSha256: admitted.lockSha256,
    policySha256: saved.receipt.policy.sha256,
    // Includes every importer, archive/review, patch, deferred bin and
    // prerequisite in the independently reviewed byte-custody receipt.
    admissionSha256: sha(Buffer.from(canonical(saved.receipt)))
  });
}

function checkWorkspaceSourceApproval({ root, sourceManifestPath, capability, approvalBytes }) {
  const subject = workspacePnpmSourceApprovalSubject({ root, sourceManifestPath, capability });
  const trusted = policy(stagedContext(root, sourceManifestPath));
  if (!trusted.authorities.size) fail('no independently trusted workspace source approval authority is configured');
  const envelope = strictJson(approvalBytes, 'workspace source approval', true);
  exactKeys(envelope, ['schema', 'payload', 'signature'], 'workspace source approval envelope');
  const { payload, signature } = envelope;
  exactKeys(payload, ['schema', 'subject', 'decision', 'scope', 'reviewer'], 'workspace source approval payload');
  exactKeys(payload.subject, Object.keys(subject), 'workspace source approval subject');
  exactKeys(payload.reviewer, ['id', 'kind'], 'workspace source reviewer');
  exactKeys(signature, ['algorithm', 'keyId', 'value'], 'workspace source approval signature');
  if (envelope.schema !== 'aura3d.workspace-source-approval-envelope/1'
      || payload.schema !== 'aura3d.workspace-source-approval/1'
      || payload.decision !== 'approved' || payload.scope !== 'workspace-dependency-inputs'
      || payload.reviewer.kind !== 'independent-source-review' || typeof payload.reviewer.id !== 'string'
      || payload.reviewer.id.trim().length < 3 || payload.reviewer.id.length > 200
      || /[\x00-\x1f\x7f]/.test(payload.reviewer.id)
      || /^(?:unknown|pending|unassigned|fixture|synthetic)$/i.test(payload.reviewer.id)) {
    fail('invalid independent workspace source approval');
  }
  if (canonical(payload.subject) !== canonical(subject) || trusted.sha256 !== subject.policySha256) {
    fail('workspace source approval does not bind the staged source, policy and admission');
  }
  const authority = trusted.authorities.get(signature.keyId);
  if (signature.algorithm !== 'ed25519' || !authority) fail('untrusted workspace source approval authority');
  if (typeof signature.value !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(signature.value)) fail('invalid workspace source approval signature');
  const bytes = Buffer.from(signature.value, 'base64');
  if (bytes.length !== 64 || bytes.toString('base64') !== signature.value
      || !verifySignature(null, Buffer.from(SOURCE_APPROVAL_DOMAIN + canonical(payload)), authority, bytes)) {
    fail('invalid workspace source approval signature');
  }
  return freeze({ schema: 'aura3d.workspace-source-approval-observation/1', subject,
    approvalSha256: sha(approvalBytes), keyId: signature.keyId, installationAuthorized: false,
    scope: 'Independent approval of these staged dependency inputs only; no install, runtime or isolation authority.' });
}

/** Verify a pinned authority's signed, source-bound approval without executing it. */
export function verifyWorkspacePnpmSourceApproval(input) {
  fields(input, ['root', 'sourceManifestPath', 'capability', 'approvalBytes'], 'workspace source approval');
  const { root, sourceManifestPath, capability, approvalBytes } = input;
  const approval = checkWorkspaceSourceApproval({ root, sourceManifestPath, capability, approvalBytes });
  const approvalCapability = Object.freeze({});
  workspaceSourceApprovals.set(approvalCapability, {
    capability, root: realpathSync(resolve(root)), sourceManifestPath,
    bytes: Buffer.from(approvalBytes), approval
  });
  return { approval, approvalCapability };
}

/** Revalidate the live approval and its archive capability against current source. */
export function consumeWorkspacePnpmSourceApproval(input) {
  fields(input, ['root', 'sourceManifestPath', 'capability', 'approvalCapability'], 'workspace source approval consumption');
  const { root, sourceManifestPath, capability, approvalCapability } = input;
  const saved = workspaceSourceApprovals.get(approvalCapability);
  if (!saved || saved.capability !== capability || saved.root !== realpathSync(resolve(root))
      || saved.sourceManifestPath !== sourceManifestPath) fail('invalid workspace source approval capability');
  const approval = checkWorkspaceSourceApproval({ root, sourceManifestPath, capability, approvalBytes: saved.bytes });
  if (canonical(approval) !== canonical(saved.approval)) fail('workspace source approval changed');
  return approval;
}

function toolchainFileIdentity(value, label) {
  exactKeys(value, ['sha256', 'size', 'executable'], label);
  if (!HASH.test(value.sha256 ?? '') || !Number.isSafeInteger(value.size) || value.size < 1
      || value.size > MAX_TOOLCHAIN_FILE || !Number.isInteger(value.executable)
      || value.executable < 0 || (value.executable & ~0o111) !== 0) fail(`invalid ${label}`);
}

// A policy pin authenticates its independently reviewed inventory. It does
// not authenticate the running process, filesystem isolation or loaded code.
function reviewedToolchain(context, trusted) {
  const item = trusted.toolchain;
  if (item === undefined) fail('no independently reviewed workspace package-manager byte policy is configured');
  exactKeys(item, ['manager', 'nodeVersion', 'node', 'entrypoint', 'files', 'review'], 'toolchain policy');
  if (item.manager !== 'pnpm@11.1.3' || item.nodeVersion !== '22.23.2') fail('unsupported toolchain identity');
  toolchainFileIdentity(item.node, 'node toolchain identity');
  if (!item.node.executable) fail('node toolchain binary must be executable');
  relativePath(item.entrypoint, 'package-manager entrypoint');
  if (!Array.isArray(item.files) || !item.files.length || item.files.length > MAX_PACKAGES) fail('invalid package-manager file inventory');
  let previous = '', total = item.node.size;
  for (const file of item.files) {
    exactKeys(file, ['path', 'sha256', 'size', 'executable'], 'package-manager file');
    relativePath(file.path, 'package-manager file');
    if (previous && file.path <= previous) fail('duplicate or unordered package-manager files');
    previous = file.path;
    toolchainFileIdentity({ sha256: file.sha256, size: file.size, executable: file.executable }, 'package-manager file identity');
    total += file.size;
    if (total > MAX_TOOLCHAIN_TOTAL) fail('package-manager file inventory exceeds byte limit');
  }
  if (!item.files.some(file => file.path === item.entrypoint)) fail('package-manager entrypoint is not inventoried');
  const reviewBytes = reviewedRef(context, item.review, 'toolchain review', [WORKSPACE_POLICY_PATH]);
  const review = strictJson(reviewBytes, 'toolchain review', true);
  exactKeys(review, ['schema', 'subject', 'decision', 'scope', 'reviewer', 'evidence', 'rationale'], 'toolchain review');
  exactKeys(review.reviewer, ['id', 'kind'], 'toolchain reviewer');
  const subject = { manager: item.manager, nodeVersion: item.nodeVersion, node: item.node,
    entrypoint: item.entrypoint, files: item.files };
  if (review.schema !== 'aura3d.pnpm-toolchain-review/1' || review.decision !== 'approved'
      || review.scope !== 'complete-toolchain' || review.reviewer.kind !== 'independent-source-review'
      || typeof review.reviewer.id !== 'string' || review.reviewer.id.trim().length < 3 || review.reviewer.id.length > 200
      || /^(?:unknown|pending|unassigned|fixture|synthetic)$/i.test(review.reviewer.id)
      || canonical(review.subject) !== canonical(subject)
      || typeof review.rationale !== 'string' || review.rationale.trim().length < 60 || review.rationale.length > 8192
      || !Array.isArray(review.evidence) || !review.evidence.length || review.evidence.length > MAX_PACKAGES
      || new Set(review.evidence.map(ref => ref?.path)).size !== review.evidence.length) fail('invalid independent package-manager review');
  for (const ref of review.evidence) {
    if (!reviewedRef(context, ref, 'toolchain review evidence', [WORKSPACE_POLICY_PATH, item.review.path]).byteLength) fail('toolchain review evidence is empty');
  }
  return item;
}

const toolchainStatIdentity = stat => `${stat.dev}:${stat.ino}:${stat.nlink}:${stat.size}:${stat.mode}:${stat.mtimeMs}:${stat.ctimeMs}`;
function toolchainPath(path, directory) {
  if (typeof path !== 'string' || !isAbsolute(path) || resolve(path) !== path) fail('toolchain paths must be absolute and canonical');
  let stat, real;
  try { stat = lstatSync(path); real = realpathSync(path); } catch { fail('toolchain path is unavailable'); }
  if (real !== path || stat.isSymbolicLink() || (directory ? !stat.isDirectory() : !stat.isFile())
      || (!directory && stat.nlink !== 1) || (process.platform !== 'win32' && (stat.mode & 0o022))) {
    fail('toolchain path is linked, writable by others or not a regular entry');
  }
  return stat;
}
function observedToolchainFile(path, expected) {
  const before = toolchainPath(path, false);
  if (before.size !== expected.size || before.size > MAX_TOOLCHAIN_FILE || (before.mode & 0o111) !== expected.executable) fail('toolchain file size or executable mode differs from review');
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    if (toolchainStatIdentity(fstatSync(fd)) !== toolchainStatIdentity(before)) fail('toolchain file changed before reading');
    const bytes = readFileSync(fd);
    if (bytes.length !== before.size || sha(bytes) !== expected.sha256
        || toolchainStatIdentity(fstatSync(fd)) !== toolchainStatIdentity(before)
        || toolchainStatIdentity(toolchainPath(path, false)) !== toolchainStatIdentity(before)) fail('toolchain file differs from review or changed while reading');
  } finally { if (fd !== undefined) closeSync(fd); }
  return toolchainStatIdentity(before);
}

/**
 * Compare a Node binary and complete pnpm file tree with an independently
 * pinned, source-reviewed inventory. This is a point-in-time byte observation
 * only: it does not run either file, establish their versions, authenticate
 * shared libraries/the running process, or authorize installation.
 */
export function inspectWorkspacePnpmToolchain(input) {
  fields(input, ['root', 'sourceManifestPath', 'capability', 'toolchainRoot', 'nodePath'], 'toolchain observation');
  const { root, sourceManifestPath, capability, toolchainRoot, nodePath } = input;
  const admitted = consumeWorkspacePnpmAdmission({ root, sourceManifestPath, capability });
  const context = stagedContext(root, sourceManifestPath), trusted = policy(context);
  const item = reviewedToolchain(context, trusted);
  const rootStat = toolchainPath(toolchainRoot, true);
  observedToolchainFile(nodePath, item.node);
  const expected = new Map(item.files.map(file => [file.path, file])), directories = new Set(['']);
  for (const file of item.files) {
    let dir = posix.dirname(file.path);
    while (dir !== '.') { directories.add(dir); dir = posix.dirname(dir); }
  }
  const seen = new Set(), states = new Map(), fileStates = new Map();
  function visit(path, local, depth) {
    if (depth > MAX_DEPTH) fail('package-manager tree depth exceeds limit');
    const before = toolchainPath(path, true); states.set(path, toolchainStatIdentity(before));
    for (const name of readdirSync(path).sort()) {
      const next = local ? `${local}/${name}` : name, full = resolve(path, name);
      relativePath(next, 'package-manager file');
      const stat = lstatSync(full);
      if (stat.isDirectory() && !stat.isSymbolicLink()) {
        if (!directories.has(next)) fail('unreviewed package-manager directory');
        visit(full, next, depth + 1);
      } else {
        const want = expected.get(next);
        if (!want || seen.has(next)) fail('unreviewed package-manager file');
        fileStates.set(full, observedToolchainFile(full, want)); seen.add(next);
      }
    }
  }
  visit(toolchainRoot, '', 0);
  if (seen.size !== expected.size) fail('reviewed package-manager file is missing');
  for (const [path, identity] of fileStates) if (toolchainStatIdentity(toolchainPath(path, false)) !== identity) fail('package-manager file changed during observation');
  for (const [path, identity] of states) if (toolchainStatIdentity(toolchainPath(path, true)) !== identity) fail('package-manager tree changed during observation');
  if (toolchainStatIdentity(toolchainPath(toolchainRoot, true)) !== toolchainStatIdentity(rootStat)) fail('package-manager root changed during observation');
  observedToolchainFile(nodePath, item.node);
  const confirmed = consumeWorkspacePnpmAdmission({ root, sourceManifestPath, capability });
  if (canonical(confirmed.source) !== canonical(admitted.source)) fail('workspace admission changed during toolchain observation');
  return freeze({ schema: 'aura3d.workspace-pnpm-toolchain-observation/1',
    sourceInputDigest: admitted.source.inputDigest, policySha256: trusted.sha256,
    declaredManager: item.manager, declaredNodeVersion: item.nodeVersion, fileCount: item.files.length,
    nodeSha256: item.node.sha256, executionAuthorized: false,
    scope: 'Point-in-time reviewed file bytes only; runtime identity, package-manager custody, shared libraries and process/network isolation are not attested.' });
}

// Source-identity intentionally excludes generated output and dependencies.
// A fresh pre-install source must not contain those excluded paths: otherwise
// even a correct source digest could coexist with an unreviewed stale tree.
function assertFreshWorkspaceSource(root) {
  const base = realpathSync(resolve(root));
  const excluded = new Set(['node_modules', '.pnpm-store', '.git', 'dist', 'dist-examples', 'coverage', '.cache']);
  let count = 0;
  function visit(dir, depth) {
    if (depth > MAX_DEPTH * 2) fail('staged workspace directory depth exceeds limit');
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (++count > MAX_NODES) fail('staged workspace entry limit exceeded');
      if (excluded.has(entry.name)) fail(`preexisting dependency or build output in staged workspace: ${entry.name}`);
      if (entry.isDirectory() && !entry.isSymbolicLink()) visit(resolve(dir, entry.name), depth + 1);
    }
  }
  visit(base, 0);
}

function assertSeparateWorkspaceStore(root, storeDir) {
  if (typeof storeDir !== 'string' || !isAbsolute(storeDir) || resolve(storeDir) !== storeDir) fail('workspace store path must be absolute and canonical');
  let source, parent;
  try { source = realpathSync(resolve(root)); parent = realpathSync(dirname(storeDir)); }
  catch { fail('workspace source or store parent is unavailable'); }
  const store = resolve(parent, basename(storeDir));
  if (store === source || store.startsWith(`${source}${sep}`) || source.startsWith(`${store}${sep}`)) {
    fail('workspace store must be separate from the staged source');
  }
}

/**
 * Materialize a fresh private pnpm store from independently reviewed bytes.
 * This is deliberately in the same process as the opaque admission: a JSON
 * receipt or a store copied from another job cannot substitute for it.
 *
 * The store verifier checks its index and contents, but neither OS-level
 * immutability nor permission to execute a package manager follows from this
 * point-in-time observation.
 */
export function prepareWorkspacePnpmOfflineStore(input) {
  fields(input, ['root', 'sourceManifestPath', 'archives', 'allowDeferredWorkspaceBins', 'storeDir', 'approvalBytes'], 'workspace store preparation');
  const { root, sourceManifestPath, archives, allowDeferredWorkspaceBins, storeDir, approvalBytes } = input;
  const { receipt, capability } = verifyWorkspacePnpmAdmission({ root, sourceManifestPath, archives, allowDeferredWorkspaceBins });
  const { approval, approvalCapability } = verifyWorkspacePnpmSourceApproval({ root, sourceManifestPath, capability, approvalBytes });
  assertFreshWorkspaceSource(root);
  assertSeparateWorkspaceStore(root, storeDir);
  const storeInput = { root, sourceManifestPath, capability, storeDir };
  const created = seedVerifiedWorkspacePnpmStore(storeInput);
  const checked = verifyWorkspacePnpmNativeStore(storeInput);
  assertFreshWorkspaceSource(root);
  const expectedBinding = { kind: 'workspace', source: receipt.source,
    workspaceSha256: receipt.workspaceSha256, lockfileSha256: receipt.lockSha256 };
  if (created.schema !== 'aura3d.pnpm-native-store/1' || created.installationAuthorized !== false
      || canonical(created.binding) !== canonical(expectedBinding) || !HASH.test(created.manifestSha256 ?? '')
      || created.archiveCount !== receipt.archives.length || !Number.isSafeInteger(created.fileCount) || created.fileCount < 1
      || canonical(created) !== canonical(checked)) fail('verified workspace native store binding differs');
  const confirmedApproval = consumeWorkspacePnpmSourceApproval({ root, sourceManifestPath, capability, approvalCapability });
  if (canonical(approval) !== canonical(confirmedApproval)) fail('workspace approval changed during store preparation');
  return Object.freeze({ receipt, capability, approval, approvalCapability, store: checked, installationAuthorized: false });
}

/**
 * Inspect an already materialized tree and the same job's native store. This
 * runs no package manager and issues no execution capability. In particular,
 * a synthetic tree can pass this check without an install having happened.
 */
export function verifyWorkspacePnpmInstalledSnapshot(input) {
  fields(input, ['root', 'sourceManifestPath', 'capability', 'storeDir', 'installRoot', 'conditionalPlatform'], 'installed workspace observation');
  const { root, sourceManifestPath, capability, storeDir, installRoot, conditionalPlatform = false } = input;
  if (typeof conditionalPlatform !== 'boolean') fail('invalid conditional platform observation');
  let source, project;
  try { source = realpathSync(resolve(root)); project = realpathSync(resolve(installRoot)); }
  catch { fail('staged source or installed workspace is unavailable'); }
  if (source === project || source.startsWith(`${project}${sep}`) || project.startsWith(`${source}${sep}`)) {
    fail('installed workspace must be separate from the admitted staged source');
  }
  const storeInput = { root, sourceManifestPath, capability, storeDir, afterUse: { projectDir: project } };
  const before = verifyWorkspacePnpmNativeStore(storeInput);
  const treeInput = { root, sourceManifestPath, capability, installRoot: project };
  const tree = conditionalPlatform ? verifyInstalledPnpmWorkspaceForPlatform(treeInput) : verifyInstalledPnpmWorkspace(treeInput);
  const after = verifyWorkspacePnpmNativeStore(storeInput);
  if (before.installationAuthorized !== false || canonical(before) !== canonical(after)
      || tree.sourceInputDigest !== before.binding.source?.inputDigest
      || tree.lockfileSha256 !== before.binding.lockfileSha256) fail('installed workspace and native store bindings differ');
  return Object.freeze({ schema: 'aura3d.workspace-pnpm-installed-observation/1', store: after, tree,
    installationAuthorized: false,
    scope: 'Point-in-time source, store and installed-tree observation only; no package-manager execution or process isolation is attested.' });
}

/**
 * Archive admission and a native store are necessary, not sufficient. Check
 * those real capabilities when supplied, but never treat their receipts, a
 * caller-provided executable path, --offline, or a post-use observation as
 * package-manager custody or an isolation capability.
 */
export function assertWorkspacePnpmInstallReady(input) {
  if (input === undefined) fail('workspace package-manager custody, offline store and installed-tree verification are unavailable; a live admission and verified store are required');
  fields(input, ['root', 'sourceManifestPath', 'capability', 'approvalCapability', 'storeDir', 'toolchainRoot', 'nodePath'], 'workspace install readiness');
  const { root, sourceManifestPath, capability, approvalCapability } = input;
  const admitted = consumeWorkspacePnpmAdmission({ root, sourceManifestPath, capability });
  consumeWorkspacePnpmSourceApproval({ root, sourceManifestPath, capability, approvalCapability });
  const store = verifyWorkspacePnpmNativeStore({ root, sourceManifestPath, capability, storeDir: input.storeDir });
  if (store.installationAuthorized !== false || store.binding?.kind !== 'workspace'
      || canonical(store.binding.source) !== canonical(admitted.source)
      || store.binding.workspaceSha256 !== admitted.workspaceSha256
      || store.binding.lockfileSha256 !== admitted.lockSha256) fail('workspace install store differs from admission');
  if (input.toolchainRoot !== undefined || input.nodePath !== undefined) {
    inspectWorkspacePnpmToolchain({ root: input.root, sourceManifestPath: input.sourceManifestPath,
      capability: input.capability, toolchainRoot: input.toolchainRoot, nodePath: input.nodePath });
  }
  fail('workspace package-manager custody, enforced process/network isolation, lifecycle-disabled execution and continuous installed-tree/deferred-bin verification are unavailable');
}
