import { createHash } from 'node:crypto';
import {
  chmodSync, closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync,
  readFileSync, readdirSync, readlinkSync, realpathSync, rmSync, writeFileSync
} from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { gunzipSync } from 'node:zlib';
import { inspectNpmArchive } from './portable-npm-lock.mjs';
import * as admissionProvider from './archive-admission.mjs';
import * as workspaceAdmissionProvider from './workspace-pnpm-admission.mjs';
import { stagedSourceIdentity } from './source-identity.mjs';
import { verifyInstalledPnpmConsumer } from './pnpm-installed-tree.mjs';

// Inspection is intentionally a restricted subset of pnpm 11's lockfile v9.
// An unsupported construct is an error, never an invitation to resolve it.
// This module neither executes pnpm nor reads the network or package code.
const MAX_TEXT = 16 * 1024 * 1024;
const MAX_ARCHIVE = 64 * 1024 * 1024;
const MAX_TOTAL = 256 * 1024 * 1024;
const MAX_ITEMS = 10000;
const MAX_YAML_NODES = 250000;
const MAX_DEPTH = 48;
const denied = /^(?:three|@types\/three|@react-three\/[^/]+|babylonjs(?:-gltf2interface)?|@babylonjs\/[^/]+|playcanvas|@playcanvas\/[^/]+)$/i;
const fail = message => { throw new Error(`PNPM_INDEPENDENCE: ${message}`); };
const hash = (algorithm, value, encoding = 'hex') => createHash(algorithm).update(value).digest(encoding);
const canonical = value => JSON.stringify(value, (_key, item) => item && typeof item === 'object' && !Array.isArray(item)
  ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : item);
function object(value, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) fail(`${label} must be a mapping`);
  return value;
}
function fields(value, allowed, label) {
  object(value, label);
  for (const key of Object.keys(value)) if (!allowed.includes(key)) fail(`unsupported ${label} field: ${key}`);
}
function inputText(value, label) {
  if (!(value instanceof Uint8Array) || value.byteLength < 1 || value.byteLength > MAX_TEXT) fail(`invalid ${label} bytes`);
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(value); } catch { fail(`invalid ${label} UTF-8`); }
  if (text.charCodeAt(0) === 0xfeff || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) fail(`invalid ${label} characters`);
  return text;
}
function name(value, label = 'package name') {
  if (typeof value !== 'string' || value.length > 214 || !/^(?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/.test(value)) fail(`invalid ${label}`);
  if (denied.test(value)) fail(`prohibited package identity: ${value}`);
  return value;
}
function safeInventoryPath(value) {
  if (typeof value !== 'string' || value.length > 4096 || !/^[A-Za-z0-9@._/-]+$/.test(value) || value.startsWith('/') ||
      value.split('/').some(part => !part || part === '.' || part === '..')) fail('unsafe archive inventory path');
  return value;
}
function localResolution(value) {
  if (typeof value !== 'string') fail('invalid local tarball resolution');
  const match = /^file:(?:\.\/)?tarballs\/([A-Za-z0-9][A-Za-z0-9._-]*\.tgz)$/.exec(value);
  if (!match || match[1].includes('..')) fail('unsupported local tarball resolution');
  return `file:./tarballs/${match[1]}`;
}
function integrity(value) {
  if (typeof value !== 'string' || !/^sha512-[A-Za-z0-9+/]{86}==$/.test(value)) fail('missing canonical SHA-512 integrity');
  const data = Buffer.from(value.slice(7), 'base64');
  if (data.length !== 64 || data.toString('base64') !== value.slice(7)) fail('noncanonical SHA-512 integrity');
  return value;
}

// A small, deliberately strict YAML subset: pnpm's block mappings/sequences and
// simple flow collections. No anchors, aliases, tags, merges, directives,
// duplicate mappings, multiline scalars, implicit dates or multiple documents.
function parseLock(text) {
  let nodes = 0;
  const add = () => { if (++nodes > MAX_YAML_NODES) fail('lock YAML node limit exceeded'); };
  function scalar(raw) {
    add();
    if (!raw || raw.length > 8192) fail('empty or oversized lock YAML scalar');
    if (raw[0] === "'") {
      if (raw.length < 2 || raw.at(-1) !== "'") fail('unterminated lock YAML quote');
      const inner = raw.slice(1, -1);
      if (/(^|[^'])'(?!')/.test(inner) || /'($|[^'])/.test(inner.replace(/''/g, ''))) fail('invalid lock YAML quote');
      return inner.replace(/''/g, "'");
    }
    if (raw[0] === '"') {
      let value; try { value = JSON.parse(raw); } catch { fail('unsupported lock YAML quoted scalar'); }
      if (typeof value !== 'string') fail('invalid lock YAML scalar');
      return value;
    }
    if (/^[!&*|>%`@]/.test(raw) || /[\[\]{},]/.test(raw) || /(?:^|\s)#/.test(raw) || /:\s/.test(raw) || /\s$/.test(raw) || raw === '<<') fail('unsupported lock YAML scalar');
    if (raw === 'true') return true;
    if (raw === 'false') return false;
    if (/^(?:null|~|\.nan|[-+]?\.inf)$/i.test(raw)) fail('unsupported lock YAML null or number');
    if (/^[-+]?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/.test(raw)) return Number(raw);
    return raw;
  }
  function splitOutside(raw, separator) {
    const out = []; let start = 0, quote = '', depth = 0;
    for (let i = 0; i < raw.length; i++) {
      const c = raw[i];
      if (quote === "'") { if (c === "'" && raw[i + 1] === "'") i++; else if (c === "'") quote = ''; continue; }
      if (quote === '"') { if (c === '\\') i++; else if (c === '"') quote = ''; continue; }
      if (c === "'" || c === '"') quote = c;
      else if (c === '{' || c === '[') depth++;
      else if (c === '}' || c === ']') { if (--depth < 0) fail('unbalanced lock YAML collection'); }
      else if (c === separator && depth === 0 && (separator !== ':' || i + 1 === raw.length || /\s/.test(raw[i + 1]))) {
        out.push(raw.slice(start, i)); start = i + 1;
        if (separator === ':') { out.push(raw.slice(start)); return out; }
      }
    }
    if (quote || depth) fail('unbalanced lock YAML collection');
    out.push(raw.slice(start)); return out;
  }
  function pair(raw) {
    const parts = splitOutside(raw, ':');
    if (parts.length !== 2) fail('invalid lock YAML mapping');
    const key = scalar(parts[0].trim());
    if (typeof key !== 'string' || !key || key === '__proto__' || key === 'constructor' || key === 'prototype' || key === '<<') fail('invalid lock YAML key');
    return [key, parts[1].trim()];
  }
  function flow(raw, depth = 0) {
    if (depth > MAX_DEPTH) fail('lock YAML depth limit exceeded');
    if (raw.startsWith('{') || raw.startsWith('[')) {
      const mapping = raw[0] === '{', close = mapping ? '}' : ']';
      if (!raw.endsWith(close)) fail('invalid lock YAML flow collection');
      add(); const body = raw.slice(1, -1).trim(), result = mapping ? Object.create(null) : [];
      if (!body) return result;
      for (const part of splitOutside(body, ',')) {
        if (!part.trim()) fail('invalid lock YAML flow collection');
        if (!mapping) result.push(flow(part.trim(), depth + 1));
        else {
          const [key, value] = pair(part.trim());
          if (!value || Object.hasOwn(result, key)) fail('duplicate or empty lock YAML entry');
          result[key] = flow(value, depth + 1);
        }
      }
      return result;
    }
    return scalar(raw);
  }
  const lines = [];
  for (const raw of text.split(/\r?\n/)) {
    if (!raw.trim() || /^\s*#/.test(raw)) continue;
    if (raw.includes('\t') || /\r/.test(raw)) fail('unsupported lock YAML whitespace');
    const indent = raw.length - raw.trimStart().length, content = raw.slice(indent);
    if (indent % 2 || indent / 2 > MAX_DEPTH || /\s$/.test(content) || /^(?:---|\.\.\.|%)/.test(content)) fail('unsupported lock YAML syntax');
    lines.push({ indent, content });
    if (lines.length > MAX_YAML_NODES) fail('lock YAML line limit exceeded');
  }
  let at = 0;
  function block(indent, depth) {
    if (depth > MAX_DEPTH || at >= lines.length || lines[at].indent !== indent) fail('invalid lock YAML indentation');
    const sequence = lines[at].content.startsWith('- '), result = sequence ? [] : Object.create(null); add();
    while (at < lines.length && lines[at].indent === indent) {
      const content = lines[at++].content;
      if (sequence) {
        if (!content.startsWith('- ') || !content.slice(2).trim()) fail('unsupported lock YAML sequence');
        result.push(flow(content.slice(2).trim()));
      } else {
        if (content.startsWith('- ')) fail('mixed lock YAML collection');
        const [key, raw] = pair(content);
        if (Object.hasOwn(result, key)) fail(`duplicate lock YAML key: ${key}`);
        if (raw) result[key] = flow(raw);
        else {
          if (at >= lines.length || lines[at].indent !== indent + 2) fail('empty or invalid lock YAML mapping');
          result[key] = block(indent + 2, depth + 1);
        }
      }
      if (at < lines.length && lines[at].indent > indent) fail('invalid lock YAML indentation');
    }
    return result;
  }
  if (!lines.length || lines[0].indent !== 0) fail('empty lock YAML');
  const result = block(0, 0);
  if (at !== lines.length) fail('invalid lock YAML trailing content');
  return result;
}

function parseManifest(bytes) {
  let value; try { value = JSON.parse(inputText(bytes, 'manifest')); } catch { fail('invalid manifest JSON'); }
  fields(value, ['name', 'version', 'private', 'type', 'dependencies', 'devDependencies', 'optionalDependencies'], 'manifest');
  name(value.name, 'manifest name');
  if (typeof value.version !== 'string' || !value.version || value.private !== true || (value.type !== undefined && value.type !== 'module' && value.type !== 'commonjs')) fail('unsupported consumer manifest');
  return value;
}
function version(value) {
  // Pre-release ordering has subtle npm-specific rules; refuse it until covered
  // by a separately verified semver implementation.
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)$/.test(value)) fail('unsupported package version');
  const result = value.split('.').map(Number);
  if (result.some(v => !Number.isSafeInteger(v))) fail('oversized package version');
  return result;
}
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];
function satisfies(actual, range) {
  const value = version(actual);
  if (typeof range !== 'string' || !range.trim() || range.length > 1024 || !/^[0-9xX*.^~<>=| \t-]+$/.test(range)) fail('unsupported dependency range');
  const alternatives = range.split('||');
  if (alternatives.some(part => !part.trim())) fail('invalid dependency range');
  return alternatives.map(part => {
    const normalized = part.trim().replace(/(>=|<=|>|<|=|\^|~)\s+/g, '$1');
    if (/\s-\s/.test(normalized)) fail('unsupported hyphen dependency range');
    return normalized.split(/\s+/).map(token => {
      const match = /^(\^|~|>=|<=|>|<|=)?(\*|[xX]|(?:0|[1-9][0-9]*)(?:\.(?:0|[1-9][0-9]*|[xX*])){0,2})$/.exec(token);
      if (!match) fail('unsupported dependency range');
      const op = match[1] ?? '', parts = match[2].split('.'), wild = parts.findIndex(p => /^[xX*]$/.test(p));
      const count = wild < 0 ? parts.length : wild;
      if (wild >= 0 && parts.slice(wild).some(p => !/^[xX*]$/.test(p))) fail('invalid wildcard dependency range');
      if (!count) { if (op && op !== '=') fail('unsupported wildcard comparator'); return true; }
      const lo = [0, 0, 0]; for (let i = 0; i < count; i++) { lo[i] = Number(parts[i]); if (!Number.isSafeInteger(lo[i])) fail('oversized dependency range'); }
      let hi;
      if (op === '^') { const index = lo[0] ? 0 : count === 1 ? 0 : lo[1] ? 1 : count === 2 ? 1 : 2; hi = [...lo]; hi[index]++; for (let i = index + 1; i < 3; i++) hi[i] = 0; }
      else if (op === '~') { const index = count === 1 ? 0 : 1; hi = [...lo]; hi[index]++; for (let i = index + 1; i < 3; i++) hi[i] = 0; }
      else if (count < 3) { hi = [...lo]; hi[count - 1]++; for (let i = count; i < 3; i++) hi[i] = 0; }
      if (op === '>') return count < 3 ? cmp(value, hi) >= 0 : cmp(value, lo) > 0;
      if (op === '>=') return cmp(value, lo) >= 0;
      if (op === '<') return cmp(value, lo) < 0;
      if (op === '<=') return count < 3 ? cmp(value, hi) < 0 : cmp(value, lo) <= 0;
      return cmp(value, lo) >= 0 && (hi ? cmp(value, hi) < 0 : cmp(value, lo) === 0);
    }).every(Boolean);
  }).some(Boolean);
}
function specifier(value, installedName, allowFile = false) {
  name(installedName, 'dependency name');
  if (typeof value !== 'string' || !value || value.length > 4096) fail('invalid dependency specifier');
  if (value.startsWith('file:')) {
    if (!allowFile) fail('unsupported transitive local dependency');
    return { target: installedName, file: localResolution(value) };
  }
  if (value.startsWith('npm:')) {
    const match = /^npm:((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)@(.+)$/.exec(value);
    if (!match) fail('unsupported dependency alias');
    name(match[1], 'alias target');
    // Validate syntax independently of whether any version happens to match.
    satisfies('0.0.0', match[2]);
    return { target: match[1], range: match[2] };
  }
  satisfies('0.0.0', value);
  return { target: installedName, range: value };
}
function splitRef(raw) {
  if (typeof raw !== 'string' || raw.length > 8192) fail('invalid snapshot reference');
  const first = raw.indexOf('('), base = first < 0 ? raw : raw.slice(0, first), bindings = [];
  let at = first < 0 ? raw.length : first;
  while (at < raw.length) {
    if (raw[at] !== '(') fail('invalid peer variant');
    const start = ++at; let depth = 1;
    while (at < raw.length && depth) { if (raw[at] === '(') depth++; else if (raw[at] === ')') depth--; if (depth > MAX_DEPTH) fail('peer depth limit exceeded'); at++; }
    if (depth || at === start + 1) fail('invalid peer variant');
    bindings.push(parseId(raw.slice(start, at - 1)));
  }
  return { base, bindings };
}
function parseId(raw) {
  const match = /^((?:@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*)@(.+)$/.exec(raw);
  if (!match) fail('invalid package or snapshot key');
  name(match[1]);
  const ref = splitRef(match[2]);
  if (ref.base.startsWith('file:')) localResolution(ref.base); else version(ref.base);
  return { key: raw, name: match[1], base: ref.base, bindings: ref.bindings };
}
function targetId(installedName, raw, expectedTarget) {
  if (typeof raw !== 'string' || !raw) fail('invalid dependency resolution');
  let target = installedName, ref = raw;
  if (!raw.startsWith('file:') && !/^[0-9]/.test(raw)) {
    const parsed = parseId(raw); target = parsed.name; ref = raw.slice(target.length + 1);
  }
  if (target !== expectedTarget) fail(`dependency alias identity mismatch: ${installedName}`);
  const parsed = parseId(`${target}@${ref}`);
  return parsed;
}
function map(value, label) { if (value === undefined) return Object.create(null); return object(value, label); }
function stringMap(value, label) {
  const result = map(value, label);
  for (const [key, val] of Object.entries(result)) if (typeof val !== 'string') fail(`invalid ${label}: ${key}`);
  return result;
}
function peerMetadata(value, peers, label) {
  const entries = map(value, label);
  for (const [key, raw] of Object.entries(entries)) {
    name(key, 'peer name');
    fields(raw, ['optional'], 'peer metadata');
    if (!Object.hasOwn(peers, key) || typeof raw.optional !== 'boolean') fail('invalid peer metadata');
  }
  return entries;
}

function readLock(bytes) {
  const lock = parseLock(inputText(bytes, 'lock'));
  fields(lock, ['lockfileVersion', 'settings', 'importers', 'packages', 'snapshots'], 'lock');
  if (lock.lockfileVersion !== '9.0') fail('only pnpm lockfile version 9.0 is supported');
  if (lock.settings !== undefined) {
    fields(lock.settings, ['autoInstallPeers', 'excludeLinksFromLockfile'], 'lock settings');
    for (const value of Object.values(lock.settings)) if (typeof value !== 'boolean') fail('invalid lock settings');
  }
  const importers = object(lock.importers, 'lock importers');
  if (Object.keys(importers).length !== 1 || !Object.hasOwn(importers, '.')) fail('only a single root importer is supported');
  fields(importers['.'], ['dependencies', 'devDependencies', 'optionalDependencies'], 'root importer');
  object(lock.packages, 'lock packages'); object(lock.snapshots, 'lock snapshots');
  if (Object.keys(lock.packages).length > MAX_ITEMS || Object.keys(lock.snapshots).length > MAX_ITEMS) fail('lock package limit exceeded');
  return lock;
}
function peerBindings(id, result = []) {
  for (const peer of id.bindings) {
    result.push(peer);
    if (result.length > MAX_ITEMS) fail('peer binding limit exceeded');
    peerBindings(peer, result);
  }
  return result;
}
function inspectGraph(manifest, lock) {
  const packages = new Map(), snapshots = new Map(), roots = [];
  for (const [key, entry] of Object.entries(lock.packages)) {
    const id = parseId(key);
    if (id.bindings.length) fail('package metadata must not contain peer variants');
    fields(entry, ['resolution', 'engines', 'cpu', 'os', 'libc', 'hasBin', 'deprecated', 'peerDependencies', 'peerDependenciesMeta'], 'package metadata');
    fields(entry.resolution, ['integrity', 'tarball'], 'package resolution');
    integrity(entry.resolution.integrity);
    if (entry.hasBin !== undefined && typeof entry.hasBin !== 'boolean') fail('invalid package hasBin metadata');
    if (entry.deprecated !== undefined && typeof entry.deprecated !== 'string') fail('invalid package deprecation metadata');
    if (entry.engines !== undefined) stringMap(entry.engines, 'package engines');
    for (const field of ['cpu', 'os', 'libc']) if (entry[field] !== undefined && (!Array.isArray(entry[field]) || entry[field].some(item => typeof item !== 'string' || !/^[a-zA-Z0-9_!-]+$/.test(item)))) fail(`invalid package ${field} metadata`);
    const peers = stringMap(entry.peerDependencies, 'package peer dependencies');
    for (const [peer, spec] of Object.entries(peers)) specifier(spec, peer);
    peerMetadata(entry.peerDependenciesMeta, peers, 'package peer metadata');
    packages.set(key, { id, entry });
  }
  for (const [key, entry] of Object.entries(lock.snapshots)) {
    const id = parseId(key), base = `${id.name}@${id.base}`;
    if (!packages.has(base)) fail(`snapshot has no package metadata: ${key}`);
    fields(entry, ['dependencies', 'optionalDependencies', 'transitivePeerDependencies', 'optional'], 'snapshot');
    if (entry.optional !== undefined && typeof entry.optional !== 'boolean') fail('invalid optional snapshot flag');
    const deps = stringMap(entry.dependencies, 'snapshot dependencies'), optional = stringMap(entry.optionalDependencies, 'snapshot optional dependencies');
    for (const key of Object.keys(deps)) if (Object.hasOwn(optional, key)) fail('duplicate snapshot dependency');
    const transitive = entry.transitivePeerDependencies;
    if (transitive !== undefined) {
      if (!Array.isArray(transitive) || new Set(transitive).size !== transitive.length) fail('invalid transitive peer dependencies');
      for (const peer of transitive) name(peer, 'transitive peer name');
    }
    snapshots.set(key, { id, base, entry });
  }
  for (const group of ['dependencies', 'devDependencies', 'optionalDependencies']) {
    const requested = stringMap(manifest[group], `manifest ${group}`), locked = map(lock.importers['.'][group], `importer ${group}`);
    if (canonical(Object.keys(requested).sort()) !== canonical(Object.keys(locked).sort())) fail(`root ${group} differs from lock`);
    for (const [installed, rawSpec] of Object.entries(requested)) {
      const spec = specifier(rawSpec, installed, true), node = locked[installed];
      fields(node, ['specifier', 'version'], 'importer dependency');
      if (node.specifier !== rawSpec) fail(`root dependency specifier differs: ${installed}`);
      const target = targetId(installed, node.version, spec.target);
      if (spec.file) { if (!target.base.startsWith('file:') || localResolution(target.base) !== spec.file) fail(`local dependency mismatch: ${installed}`); }
      else if (target.base.startsWith('file:') || !satisfies(target.base, spec.range)) fail(`root dependency version mismatch: ${installed}`);
      roots.push(target.key);
    }
  }
  return { packages, snapshots, roots };
}
function archiveResolution(id, entry) {
  if (id.base.startsWith('file:')) {
    const local = localResolution(id.base);
    if (typeof entry.resolution.tarball !== 'string' || localResolution(entry.resolution.tarball) !== local) fail('local package tarball differs from lock identity');
    return local;
  }
  const leaf = id.name.slice(id.name.lastIndexOf('/') + 1);
  const resolved = `https://registry.npmjs.org/${id.name}/-/${leaf}-${id.base}.tgz`;
  if (entry.resolution.tarball !== undefined && entry.resolution.tarball !== resolved) fail('unsupported registry tarball location');
  return resolved;
}
function inventory(input) {
  if (!Array.isArray(input.archives) || input.archives.length > MAX_ITEMS || typeof input.readArchive !== 'function' || !Array.isArray(input.candidatePackages)) fail('archive inventory is required');
  const archives = new Map(), candidates = new Map();
  for (const item of input.archives) {
    fields(item, ['resolved', 'path'], 'archive inventory item');
    if (typeof item.resolved !== 'string' || item.resolved.length > 8192 || archives.has(item.resolved)) fail('invalid or duplicate archive resolution');
    safeInventoryPath(item.path); archives.set(item.resolved, item.path);
  }
  for (const candidate of input.candidatePackages) {
    object(candidate, 'candidate package'); name(candidate.name, 'candidate package name');
    if ((!candidate.name.startsWith('@aura3d/') && candidate.name !== 'create-aura3d') || candidates.has(candidate.name) ||
        typeof candidate.version !== 'string' || !/^[a-f0-9]{64}$/.test(candidate.sha256 ?? '')) fail('invalid candidate package identity');
    version(candidate.version); integrity(candidate.integrity);
    candidates.set(candidate.name, candidate);
  }
  return { archives, candidates };
}
function inspectArchives(graph, input) {
  const { archives, candidates } = inventory(input), records = new Map(), byPackage = new Map(), used = new Set();
  let total = 0, expanded = 0;
  for (const [key, { id, entry }] of graph.packages) {
    const resolved = archiveResolution(id, entry), path = archives.get(resolved);
    if (!path) fail(`missing package archive: ${key}`);
    used.add(resolved);
    let record = records.get(resolved);
    if (!record) {
      const raw = input.readArchive(path);
      if (!(raw instanceof Uint8Array) || !raw.byteLength || raw.byteLength > MAX_ARCHIVE) fail('invalid package archive bytes');
      total += raw.byteLength; if (total > MAX_TOTAL) fail('archive inventory exceeds byte limit');
      const bytes = Buffer.from(raw), parsed = inspectNpmArchive(bytes);
      for (const file of parsed.files) { expanded += file.bytes.byteLength; if (expanded > MAX_TOTAL) fail('expanded archive inventory exceeds byte limit'); }
      record = { resolved, path, bytes, sha256: hash('sha256', bytes), integrity: `sha512-${hash('sha512', bytes, 'base64')}`, manifest: parsed.manifest };
      records.set(resolved, record);
    }
    if (record.integrity !== entry.resolution.integrity) fail(`archive integrity mismatch: ${key}`);
    const actual = object(record.manifest, 'archive manifest');
    if (name(actual.name, 'archive package name') !== id.name || typeof actual.version !== 'string') fail(`archive identity mismatch: ${key}`);
    version(actual.version);
    if (!id.base.startsWith('file:') && id.base !== actual.version) fail(`archive version mismatch: ${key}`);
    const candidate = candidates.get(id.name);
    if (candidate) {
      if (candidate.version !== actual.version || candidate.sha256 !== record.sha256 || candidate.integrity !== record.integrity || !resolved.startsWith('file:')) fail(`candidate archive mismatch: ${id.name}`);
      if (typeof candidate.tarball === 'string' && localResolution(`file:tarballs/${candidate.tarball.split('/').at(-1)}`) !== resolved) fail(`candidate tarball name mismatch: ${id.name}`);
    } else if (id.name.startsWith('@aura3d/') || id.name === 'create-aura3d' || resolved.startsWith('file:')) fail(`unrecognized candidate or local archive: ${id.name}`);
    const peers = stringMap(actual.peerDependencies, 'archive peer dependencies');
    if (canonical(peers) !== canonical(map(entry.peerDependencies, 'package peer dependencies')) ||
        canonical(peerMetadata(actual.peerDependenciesMeta, peers, 'archive peer metadata')) !== canonical(peerMetadata(entry.peerDependenciesMeta, peers, 'package peer metadata'))) fail(`archive peer metadata mismatch: ${key}`);
    byPackage.set(key, record);
  }
  if (used.size !== archives.size) fail('archive inventory has unused entries');
  return { records, byPackage };
}
function validateSnapshot(graph, archiveRecords, snapshot) {
  const { id, entry, base } = snapshot, actual = archiveRecords.byPackage.get(base).manifest;
  const required = stringMap(actual.dependencies, 'archive dependencies'), optional = stringMap(actual.optionalDependencies, 'archive optional dependencies');
  const peers = stringMap(actual.peerDependencies, 'archive peer dependencies');
  const peerMeta = peerMetadata(actual.peerDependenciesMeta, peers, 'archive peer metadata');
  const dependencies = stringMap(entry.dependencies, 'snapshot dependencies'), optionalDeps = stringMap(entry.optionalDependencies, 'snapshot optional dependencies');
  const edgeTargets = [];
  const targetVersion = target => {
    const linked = graph.snapshots.get(target.key);
    if (!linked) fail(`unresolved snapshot edge: ${target.key}`);
    return archiveRecords.byPackage.get(linked.base).manifest.version;
  };
  for (const [installed, raw] of Object.entries(required)) {
    if (Object.hasOwn(optional, installed)) continue; // npm optional dependencies override ordinary dependencies.
    const spec = specifier(raw, installed);
    if (!Object.hasOwn(dependencies, installed)) fail(`missing snapshot dependency: ${id.key}/${installed}`);
    const target = targetId(installed, dependencies[installed], spec.target);
    if (!satisfies(targetVersion(target), spec.range)) fail(`snapshot dependency version mismatch: ${id.key}/${installed}`);
    edgeTargets.push(target.key);
  }
  for (const [installed, raw] of Object.entries(optional)) {
    const spec = specifier(raw, installed);
    if (!Object.hasOwn(optionalDeps, installed)) fail(`missing snapshot optional dependency: ${id.key}/${installed}`);
    const target = targetId(installed, optionalDeps[installed], spec.target);
    if (!satisfies(targetVersion(target), spec.range)) fail(`snapshot optional version mismatch: ${id.key}/${installed}`);
    edgeTargets.push(target.key);
  }
  for (const [installed, raw] of Object.entries(peers)) {
    const spec = specifier(raw, installed);
    if (!Object.hasOwn(dependencies, installed) && !Object.hasOwn(optionalDeps, installed)) {
      if (peerMeta[installed]?.optional === true) continue;
      fail(`missing snapshot peer dependency: ${id.key}/${installed}`);
    }
    const target = targetId(installed, dependencies[installed] ?? optionalDeps[installed], spec.target);
    if (!satisfies(targetVersion(target), spec.range)) fail(`snapshot peer version mismatch: ${id.key}/${installed}`);
    edgeTargets.push(target.key);
  }
  const transitive = new Set(entry.transitivePeerDependencies ?? []);
  for (const [installed, raw] of Object.entries({ ...dependencies, ...optionalDeps })) {
    name(installed, 'snapshot dependency name');
    if (Object.hasOwn(required, installed) || Object.hasOwn(optional, installed) || Object.hasOwn(peers, installed)) continue;
    if (!transitive.has(installed)) fail(`unexpected snapshot dependency: ${id.key}/${installed}`);
    const target = targetId(installed, raw, installed);
    edgeTargets.push(target.key);
  }
  const directPeers = new Set();
  for (const peer of id.bindings) {
    if (directPeers.has(peer.name)) fail(`duplicate peer binding: ${id.key}/${peer.name}`);
    directPeers.add(peer.name);
    const linked = dependencies[peer.name] ?? optionalDeps[peer.name];
    if (linked !== undefined) {
      if (targetId(peer.name, linked, peer.name).key !== peer.key) fail(`peer binding differs from snapshot edge: ${id.key}/${peer.name}`);
    } else if (!transitive.has(peer.name)) fail(`unbound peer variant: ${id.key}/${peer.name}`);
  }
  for (const peer of peerBindings(id)) edgeTargets.push(peer.key);
  for (const target of edgeTargets) if (!graph.snapshots.has(target)) fail(`unresolved snapshot edge: ${target}`);
  return edgeTargets;
}

/** Parse and inspect actual pnpm lock, manifest, and archive bytes; not authorization. */
export function inspectIndependentPnpmConsumer(input) {
  object(input, 'inspection input');
  const manifest = parseManifest(input.manifestBytes), lock = readLock(input.lockBytes), graph = inspectGraph(manifest, lock);
  const records = inspectArchives(graph, input), edges = new Map();
  for (const [key, snapshot] of graph.snapshots) edges.set(key, validateSnapshot(graph, records, snapshot));
  const pending = [...graph.roots], seen = new Set();
  while (pending.length) {
    const key = pending.pop(); if (seen.has(key)) continue;
    if (!edges.has(key)) fail(`unresolved root snapshot: ${key}`);
    seen.add(key); pending.push(...edges.get(key));
  }
  if (seen.size !== graph.snapshots.size) fail('lock contains unreachable snapshots');
  if (new Set([...graph.snapshots.values()].map(snapshot => snapshot.base)).size !== graph.packages.size) fail('lock contains unused package metadata');
  return { packageKeys: [...graph.snapshots.keys()].sort(), inputPaths: [...new Set(input.archives.map(item => item.path))].sort(),
    archives: [...records.records.values()].sort((a, b) => a.resolved < b.resolved ? -1 : a.resolved > b.resolved ? 1 : 0) };
}

/** Requires the pnpm-specific, policy-backed opaque admission capability. */
export function assertIndependentPnpmConsumer(input) {
  if (!input?.admission?.capability || typeof admissionProvider.consumePnpmArchiveAdmission !== 'function') fail('pnpm archive admission is unavailable');
  const admitted = admissionProvider.consumePnpmArchiveAdmission({ capability: input.admission.capability, manifestBytes: input.manifestBytes, lockBytes: input.lockBytes });
  const inspected = inspectIndependentPnpmConsumer(input), byResolution = new Map(admitted.map(item => [item.resolved, item.bytes]));
  if (byResolution.size !== inspected.archives.length) fail('admitted archive inventory differs');
  for (const archive of inspected.archives) {
    const expected = byResolution.get(archive.resolved);
    if (!(expected instanceof Uint8Array) || !Buffer.from(expected).equals(archive.bytes)) fail('archive differs from admitted snapshot');
  }
  return { inputPaths: inspected.inputPaths };
}

export function consumePnpmConsumerGraph(input) {
  const { capability, manifestBytes, lockBytes } = input ?? {};
  if (!capability || typeof capability !== 'object' || !(manifestBytes instanceof Uint8Array) || !(lockBytes instanceof Uint8Array)) {
    fail('PNPM_INSTALLED_SET_UNAVAILABLE: live admission and exact manifest/lock bytes are required');
  }
  const admitted = admissionProvider.consumePnpmArchiveAdmission({ capability, manifestBytes, lockBytes });
  const archives = [], candidates = [], byPath = new Map();
  for (const [index, item] of admitted.entries()) {
    const path = `admitted/${index}.tgz`, bytes = Buffer.from(item.bytes);
    archives.push({ resolved: item.resolved, path }); byPath.set(path, bytes);
    if (item.resolved.startsWith('file:')) {
      const parsed = inspectNpmArchive(bytes);
      candidates.push({ name: parsed.manifest.name, version: parsed.manifest.version,
        sha256: hash('sha256', bytes), integrity: `sha512-${hash('sha512', bytes, 'base64')}`,
        tarball: localResolution(item.resolved).slice('file:./'.length) });
    }
  }
  const inspected = inspectIndependentPnpmConsumer({ manifestBytes, lockBytes, archives,
    candidatePackages: candidates, readArchive: path => byPath.get(path) });
  const manifest = parseManifest(manifestBytes), lock = readLock(lockBytes), graph = inspectGraph(manifest, lock);
  const packages = [...graph.packages].map(([key, { id, entry }]) => {
    const archive = inspected.archives.find(item => item.resolved === archiveResolution(id, entry));
    if (!archive) fail('admitted package archive is unavailable');
    return { key, name: id.name, resolution: { ...entry.resolution }, os: entry.os, cpu: entry.cpu, libc: entry.libc,
      archive: { resolved: archive.resolved, bytes: Uint8Array.from(archive.bytes), sha256: archive.sha256, integrity: archive.integrity } };
  });
  const target = (installed, raw) => {
    if (raw.startsWith('file:') || /^[0-9]/.test(raw)) return parseId(`${installed}@${raw}`).key;
    return parseId(raw).key;
  };
  const snapshots = [...graph.snapshots].map(([key, { id, base, entry }]) => ({
    key, packageKey: base, name: id.name, optional: entry.optional === true,
    bindings: id.bindings.map(peer => peer.key),
    edges: ['dependencies', 'optionalDependencies'].flatMap(group =>
      Object.entries(entry[group] ?? {}).map(([installed, raw]) => ({ name: installed, group, target: target(installed, raw) })))
  }));
  const roots = ['dependencies', 'devDependencies', 'optionalDependencies'].flatMap(group =>
    Object.entries(lock.importers['.'][group] ?? {}).map(([installed, node]) => {
      const spec = specifier(manifest[group][installed], installed, true);
      return { name: installed, group, target: targetId(installed, node.version, spec.target).key };
    }));
  return { manifestSha256: hash('sha256', manifestBytes), lockfileSha256: hash('sha256', lockBytes), packages, snapshots, roots };
}

// pnpm 11.1.3's v11 store has a SQLite package_index whose BLOBs use
// msgpackr records and a SHA-512 content-addressed file directory. The
// implementation below only materializes already-admitted archive bytes. It
// does not run pnpm, establish network/process isolation, verify an installed
// tree, or authorize installation. In particular, pnpm's separate registry
// supply-chain policy checks can perform network requests even with --offline.
const STORE_SCHEMA = 'aura3d.pnpm-native-store/1';
const STORE_SQL = 'CREATE TABLE package_index (key TEXT PRIMARY KEY, data BLOB NOT NULL) WITHOUT ROWID';
const STORE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const STORE_LIMIT = 256 * 1024 * 1024;
const STORE_FILES = 200000;
const STORE_META_FIELDS = [
  'name', 'version', 'bin', 'directories', 'scripts', 'dependencies',
  'optionalDependencies', 'peerDependencies', 'peerDependenciesMeta',
  'dependenciesMeta', 'engines', 'os', 'cpu', 'libc', 'hasBin',
  'hasInstallScript', 'gypfile'
];
const storeFail = message => fail(`PNPM_STORE_UNAVAILABLE: ${message}`);
const storeSort = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const statIdentity = stat => `${stat.dev}:${stat.ino}:${stat.nlink}:${stat.size}:${stat.mode}:${stat.mtimeMs}:${stat.ctimeMs}`;

function privateStoreEntry(path, directory) {
  let stat, real;
  try { stat = lstatSync(path); real = realpathSync(path); }
  catch { storeFail('store path is unavailable'); }
  // Executable content may have group/other execute bits but never read/write
  // bits; all containing directories are private to the current user.
  if (stat.isSymbolicLink() || real !== path || (directory ? !stat.isDirectory() : !stat.isFile()) ||
      (!directory && stat.nlink !== 1) || (process.platform !== 'win32' &&
        ((stat.mode & (directory ? 0o077 : 0o066)) !== 0 ||
          (typeof process.getuid === 'function' && stat.uid !== process.getuid())))) {
    storeFail('store path is not a private, unlinked regular entry');
  }
  return stat;
}
function storeLocation(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || !STORE_NAME.test(basename(path))) storeFail('invalid store directory');
  let parent;
  try { parent = realpathSync(dirname(resolve(path))); } catch { storeFail('store parent is unavailable'); }
  privateStoreEntry(parent, true);
  return { parent, store: join(parent, basename(path)) };
}
function storeRead(path, max) {
  const before = privateStoreEntry(path, false);
  if (before.size > max) storeFail('store file exceeds byte limit');
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    if (statIdentity(fstatSync(fd)) !== statIdentity(before)) storeFail('store file changed before reading');
    const bytes = readFileSync(fd);
    if (bytes.length !== before.size || statIdentity(fstatSync(fd)) !== statIdentity(before) ||
        statIdentity(lstatSync(path)) !== statIdentity(before)) storeFail('store file changed while reading');
    return bytes;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('PNPM_INDEPENDENCE:')) throw error;
    storeFail('store file cannot be read safely');
  } finally { if (fd !== undefined) closeSync(fd); }
}

// Encode the subset of msgpackr's self-contained records needed by a pnpm
// package index. Plain objects are records, while files is explicitly a Map:
// pnpm iterates the latter. Reuse shape IDs, refusing excessive nesting/shapes.
function packStoreRecord(value) {
  const shapes = new Map();
  let next = 0x40, nodes = 0;
  const length = (count, fix, fixMax, tag16, tag32) => {
    if (!Number.isSafeInteger(count) || count < 0 || count > STORE_FILES) storeFail('store metadata length exceeds limit');
    if (count < fixMax) return Buffer.from([fix + count]);
    if (count <= 0xffff) { const head = Buffer.alloc(3); head[0] = tag16; head.writeUInt16BE(count, 1); return head; }
    const head = Buffer.alloc(5); head[0] = tag32; head.writeUInt32BE(count, 1); return head;
  };
  const string = item => {
    const bytes = Buffer.from(item, 'utf8'), size = bytes.length;
    if (size > MAX_TEXT) storeFail('store metadata string exceeds limit');
    let head;
    if (size < 32) head = Buffer.from([0xa0 + size]);
    else if (size <= 255) head = Buffer.from([0xd9, size]);
    else if (size <= 0xffff) { head = Buffer.alloc(3); head[0] = 0xda; head.writeUInt16BE(size, 1); }
    else { head = Buffer.alloc(5); head[0] = 0xdb; head.writeUInt32BE(size, 1); }
    return Buffer.concat([head, bytes]);
  };
  const encode = (item, depth = 0) => {
    if (++nodes > STORE_FILES * 16 || depth > MAX_DEPTH) storeFail('store metadata complexity exceeds limit');
    if (item === null) return Buffer.from([0xc0]);
    if (item === false) return Buffer.from([0xc2]);
    if (item === true) return Buffer.from([0xc3]);
    if (typeof item === 'string') return string(item);
    if (typeof item === 'number' && Number.isFinite(item)) {
      const out = Buffer.alloc(9); out[0] = 0xcb; out.writeDoubleBE(item, 1); return out;
    }
    if (Array.isArray(item)) return Buffer.concat([length(item.length, 0x90, 16, 0xdc, 0xdd), ...item.map(v => encode(v, depth + 1))]);
    if (item instanceof Map) {
      const entries = [...item.entries()];
      return Buffer.concat([length(entries.length, 0x80, 16, 0xde, 0xdf),
        ...entries.flatMap(([key, val]) => [string(key), encode(val, depth + 1)])]);
    }
    if (!item || typeof item !== 'object' || Object.getPrototypeOf(item) !== Object.prototype) storeFail('unsupported store metadata value');
    const keys = Object.keys(item).sort(storeSort);
    if (keys.some(key => ['__proto__', 'prototype', 'constructor'].includes(key))) storeFail('unsafe store metadata key');
    const signature = JSON.stringify(keys);
    let id = shapes.get(signature), prefix;
    if (id === undefined) {
      if (next > 0x7f) storeFail('too many store metadata record shapes');
      id = next++; shapes.set(signature, id);
      prefix = Buffer.concat([Buffer.from([0xd4, 0x72, id]),
        length(keys.length, 0x90, 16, 0xdc, 0xdd), ...keys.map(string)]);
    } else prefix = Buffer.from([id]);
    return Buffer.concat([prefix, ...keys.map(key => encode(item[key], depth + 1))]);
  };
  const packed = encode(value);
  if (packed.length > MAX_TEXT) storeFail('store package index exceeds byte limit');
  return packed;
}

function archiveWithModes(bytes) {
  const parsed = inspectNpmArchive(bytes);
  let data;
  try { data = gunzipSync(bytes, { maxOutputLength: STORE_LIMIT }); }
  catch { storeFail('invalid or oversized admitted archive'); }
  let offset = 0, index = 0;
  const files = [];
  while (offset + 512 <= data.length) {
    const header = data.subarray(offset, offset + 512);
    if (header.every(byte => byte === 0)) break;
    const readOctal = (start, length) => {
      const value = header.subarray(start, start + length).toString('ascii').replace(/\0.*$/, '').trim();
      if (value && !/^[0-7]+$/.test(value)) storeFail('invalid admitted tar mode or size');
      const number = value ? Number.parseInt(value, 8) : 0;
      if (!Number.isSafeInteger(number) || number < 0) storeFail('invalid admitted tar number');
      return number;
    };
    const size = readOctal(124, 12), type = String.fromCharCode(header[156] || 48), end = offset + 512 + size;
    if (!Number.isSafeInteger(end) || end > data.length) storeFail('truncated admitted archive');
    if (type === '0') {
      const file = parsed.files[index++], mode = readOctal(100, 8);
      if (!file || mode > 0o777 || file.bytes.byteLength !== size) storeFail('unsupported admitted file mode');
      files.push({ path: file.path, bytes: Buffer.from(file.bytes), mode });
    } else if (type !== '5' && type !== 'x') storeFail('unsupported admitted tar entry');
    offset += 512 + Math.ceil(size / 512) * 512;
  }
  if (index !== parsed.files.length) storeFail('admitted file inventory differs');
  return { manifest: parsed.manifest, files };
}
function nativeStorePlan(admitted, binding) {
  if (!Array.isArray(admitted) || !admitted.length || admitted.length > MAX_ITEMS) storeFail('admitted archives are required');
  const contents = new Map(), rows = new Map(), archives = [];
  let expanded = 0, filesCount = 0, compressed = 0;
  for (const entry of admitted) {
    if (!entry || typeof entry.resolved !== 'string' || !(entry.bytes instanceof Uint8Array) ||
        !entry.bytes.byteLength || entry.bytes.byteLength > MAX_ARCHIVE) storeFail('invalid admitted archive');
    const bytes = Buffer.from(entry.bytes); compressed += bytes.length;
    if (compressed > MAX_TOTAL) storeFail('admitted archives exceed byte limit');
    const parsed = archiveWithModes(bytes), manifest = parsed.manifest;
    name(manifest.name, 'store package name'); version(manifest.version);
    const leaf = manifest.name.slice(manifest.name.lastIndexOf('/') + 1);
    let id;
    if (entry.resolved.startsWith('file:')) id = localResolution(entry.resolved).replace('file:./', 'file:');
    else {
      if (entry.resolved !== `https://registry.npmjs.org/${manifest.name}/-/${leaf}-${manifest.version}.tgz`) {
        storeFail('admitted registry archive identity differs');
      }
      id = `${manifest.name}@${manifest.version}`;
    }
    const archiveIntegrity = `sha512-${hash('sha512', bytes, 'base64')}`, key = `${archiveIntegrity}\t${id}`;
    if (rows.has(key)) storeFail('duplicate native store index key');
    const metadata = {};
    for (const field of STORE_META_FIELDS) if (manifest[field] !== undefined) metadata[field] = manifest[field];
    if (metadata.scripts !== undefined && (!metadata.scripts || typeof metadata.scripts !== 'object' ||
        Array.isArray(metadata.scripts) || Object.values(metadata.scripts).some(value => typeof value !== 'string'))) {
      storeFail('unsupported package script metadata');
    }
    const fileMap = new Map(), identities = [];
    for (const file of parsed.files) {
      expanded += file.bytes.length;
      if (++filesCount > STORE_FILES || expanded > STORE_LIMIT) storeFail('admitted file inventory exceeds limit');
      const hex = hash('sha512', file.bytes), executable = file.mode & 0o111;
      const path = `${hex.slice(0, 2)}/${hex.slice(2)}${executable ? '-exec' : ''}`;
      const prior = contents.get(path);
      if (prior && (!prior.bytes.equals(file.bytes) || prior.executable !== executable)) storeFail('ambiguous native store file mode');
      if (!prior) contents.set(path, { bytes: file.bytes, executable });
      fileMap.set(file.path, { checkedAt: 0, digest: hex, mode: file.mode, size: file.bytes.length });
      identities.push({ path: file.path, sha256: hash('sha256', file.bytes), sha512: hex, mode: file.mode, size: file.bytes.length });
    }
    // Conservatively mark every script-bearing archive and binding.gyp as
    // requiring a build; never silently claim lifecycle work is unnecessary.
    const requiresBuild = !!(metadata.scripts && Object.keys(metadata.scripts).length) ||
      metadata.hasInstallScript === true || metadata.gypfile === true || fileMap.has('binding.gyp');
    const data = packStoreRecord({ requiresBuild, manifest: metadata, algo: 'sha512', files: fileMap });
    rows.set(key, data);
    archives.push({ resolved: entry.resolved, name: manifest.name, version: manifest.version,
      sha256: hash('sha256', bytes), integrity: archiveIntegrity, key,
      indexSha256: hash('sha256', data), files: identities.sort((a, b) => storeSort(a.path, b.path)) });
  }
  archives.sort((a, b) => storeSort(a.key, b.key));
  const manifestBytes = Buffer.from(`${JSON.stringify({ schema: STORE_SCHEMA, binding, archives }, null, 2)}\n`);
  if (manifestBytes.length > MAX_TEXT) storeFail('store manifest exceeds byte limit');
  return { binding, archives, contents, rows, manifestBytes };
}
function consumerStorePlan(input) {
  if (!input?.admission?.capability || !(input.admission.manifestBytes instanceof Uint8Array) ||
      !(input.admission.lockBytes instanceof Uint8Array)) storeFail('live consumer admission and manifest/lock bytes are required');
  const { capability, manifestBytes, lockBytes } = input.admission;
  const admitted = admissionProvider.consumePnpmArchiveAdmission({ capability, manifestBytes, lockBytes });
  return nativeStorePlan(admitted, { kind: 'consumer', manifestSha256: hash('sha256', manifestBytes), lockfileSha256: hash('sha256', lockBytes) });
}
function workspaceStorePlan(input) {
  if (!input?.capability) storeFail('live workspace admission is required');
  const admitted = workspaceAdmissionProvider.consumeWorkspacePnpmAdmission({
    capability: input.capability, root: input.root, sourceManifestPath: input.sourceManifestPath
  });
  if (!admitted?.source || admitted.source.lockfileSha256 !== admitted.lockSha256) storeFail('invalid admitted workspace identity');
  return nativeStorePlan(admitted.archives, { kind: 'workspace', source: admitted.source,
    workspaceSha256: admitted.workspaceSha256, lockfileSha256: admitted.lockSha256 });
}
function sqliteVarint(value) {
  if (!Number.isSafeInteger(value) || value < 0) storeFail('invalid SQLite index sample');
  const out = [value & 0x7f];
  while (value > 127) { value = Math.floor(value / 128); out.unshift((value & 0x7f) | 0x80); }
  return Buffer.from(out);
}
function sqliteIndexSample(key) {
  const bytes = Buffer.from(key), serial = sqliteVarint(bytes.length * 2 + 13);
  const header = sqliteVarint(serial.length + 1);
  if (header.length !== 1) storeFail('oversized SQLite index sample');
  return Buffer.concat([header, serial, bytes]);
}
function verifyStoreStatistics(db, schema, expected) {
  const allowed = new Map([
    ['package_index', STORE_SQL],
    ['sqlite_stat1', 'CREATE TABLE sqlite_stat1(tbl,idx,stat)'],
    ['sqlite_stat4', 'CREATE TABLE sqlite_stat4(tbl,idx,neq,nlt,ndlt,sample)']
  ]);
  const names = new Set();
  for (const entry of schema) {
    if (entry.type !== 'table' || !allowed.has(entry.name) || entry.sql !== allowed.get(entry.name) || names.has(entry.name)) {
      storeFail('native store index schema differs');
    }
    names.add(entry.name);
  }
  if (!names.has('package_index') || (names.has('sqlite_stat4') && !names.has('sqlite_stat1'))) storeFail('native store index schema differs');
  if (!names.has('sqlite_stat1')) return;
  const stats = db.prepare('SELECT tbl, idx, stat FROM sqlite_stat1 LIMIT 3').all();
  if (stats.length > 1) storeFail('native store index statistics differ');
  for (const row of stats) {
    const match = typeof row.stat === 'string' && /^([1-9][0-9]*) 1$/.exec(row.stat);
    if (row.tbl !== 'package_index' || row.idx !== 'package_index' || !match ||
        !Number.isSafeInteger(Number(match[1])) || Number(match[1]) > expected.rows.size) storeFail('native store index statistics differ');
  }
  if (!names.has('sqlite_stat4')) return;
  const samples = new Set([...expected.rows.keys()].map(key => sqliteIndexSample(key).toString('hex'))), seen = new Set();
  const rows = db.prepare('SELECT tbl, idx, neq, nlt, ndlt, sample FROM sqlite_stat4 LIMIT ?').all(Math.min(expected.rows.size + 1, STORE_FILES + 1));
  if (rows.length > Math.min(expected.rows.size, STORE_FILES)) storeFail('native store index statistics differ');
  for (const row of rows) {
    const sample = row.sample instanceof Uint8Array ? Buffer.from(row.sample).toString('hex') : '';
    if (row.tbl !== 'package_index' || row.idx !== 'package_index' || row.neq !== '1' ||
        typeof row.nlt !== 'string' || !/^(?:0|[1-9][0-9]*)$/.test(row.nlt) || row.ndlt !== row.nlt ||
        !Number.isSafeInteger(Number(row.nlt)) || Number(row.nlt) >= expected.rows.size ||
        !samples.has(sample) || seen.has(sample)) storeFail('native store index statistics differ');
    seen.add(sample);
  }
}
function projectFile(path, expectedHash) {
  let before, fd;
  try {
    before = lstatSync(path);
    if (!before.isFile() || before.isSymbolicLink() || before.nlink !== 1 || before.size > MAX_TEXT) storeFail('project binding file is unsafe');
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    if (statIdentity(fstatSync(fd)) !== statIdentity(before)) storeFail('project binding changed');
    const bytes = readFileSync(fd);
    if (bytes.length !== before.size || hash('sha256', bytes) !== expectedHash ||
        statIdentity(fstatSync(fd)) !== statIdentity(before) || statIdentity(lstatSync(path)) !== statIdentity(before)) {
      storeFail('project binding differs from admission');
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('PNPM_INDEPENDENCE:')) throw error;
    storeFail('project binding file is unavailable');
  } finally { if (fd !== undefined) closeSync(fd); }
}
function verifyStoreProject(input, expected, parent) {
  const requested = input?.afterUse?.projectDir;
  if (typeof requested !== 'string' || !isAbsolute(requested) || resolve(requested) !== requested ||
      dirname(requested) !== parent) storeFail('post-use project must be an absolute sibling in the private store parent');
  let stat, real;
  try { stat = lstatSync(requested); real = realpathSync(requested); } catch { storeFail('post-use project is unavailable'); }
  if (!stat.isDirectory() || stat.isSymbolicLink() || real !== requested || requested === input.storeDir) storeFail('post-use project is unsafe');
  if (expected.binding.kind === 'consumer') {
    projectFile(join(requested, 'package.json'), expected.binding.manifestSha256);
    projectFile(join(requested, 'pnpm-lock.yaml'), expected.binding.lockfileSha256);
  } else {
    let source;
    try { source = stagedSourceIdentity(requested, input.sourceManifestPath); } catch { storeFail('post-use workspace source differs from admission'); }
    if (canonical(source) !== canonical(expected.binding.source)) storeFail('post-use workspace source differs from admission');
  }
  if (statIdentity(lstatSync(requested)) !== statIdentity(stat)) storeFail('post-use project changed');
  return requested;
}
function verifyNativeStore(path, expected, input) {
  const { parent, store } = storeLocation(path), parentStat = privateStoreEntry(parent, true);
  const storeStat = privateStoreEntry(store, true), v11 = join(store, 'v11'), v11Stat = privateStoreEntry(v11, true);
  const filesDir = join(v11, 'files'), filesStat = privateStoreEntry(filesDir, true), database = join(v11, 'index.db');
  const postUse = input?.afterUse !== undefined;
  if (postUse && (!input.afterUse || typeof input.afterUse !== 'object' || Array.isArray(input.afterUse) ||
      Object.keys(input.afterUse).join(',') !== 'projectDir')) storeFail('invalid post-use binding');
  const project = postUse ? verifyStoreProject(input, expected, parent) : undefined;
  if (JSON.stringify(readdirSync(store).sort()) !== JSON.stringify(['manifest.json', 'v11']) ||
      JSON.stringify(readdirSync(v11).sort()) !== JSON.stringify(postUse ? ['files', 'index.db', 'projects'] : ['files', 'index.db'])) storeFail('unexpected native store entries');
  let projectsStat, linkStat, linkPath, linkText;
  if (postUse) {
    const projects = join(v11, 'projects');
    projectsStat = privateStoreEntry(projects, true);
    const links = readdirSync(projects);
    if (links.length !== 1 || links[0] !== hash('sha256', Buffer.from(project)).slice(0, 32)) storeFail('native store project registrations differ');
    linkPath = join(projects, links[0]);
    try { linkStat = lstatSync(linkPath); linkText = readlinkSync(linkPath); }
    catch { storeFail('native store project registration is unavailable'); }
    if (!linkStat.isSymbolicLink() || linkText !== relative(projects, project) || realpathSync(linkPath) !== project) {
      storeFail('native store project registration differs');
    }
  }
  if (!storeRead(join(store, 'manifest.json'), MAX_TEXT).equals(expected.manifestBytes)) storeFail('native store manifest differs');
  const buckets = new Map();
  for (const path of expected.contents.keys()) {
    const [bucket, file] = path.split('/');
    if (!buckets.has(bucket)) buckets.set(bucket, []);
    buckets.get(bucket).push(file);
  }
  if (JSON.stringify(readdirSync(filesDir).sort(storeSort)) !== JSON.stringify([...buckets.keys()].sort(storeSort))) {
    storeFail('native store content buckets differ');
  }
  for (const [bucket, names] of buckets) {
    const directory = join(filesDir, bucket), before = privateStoreEntry(directory, true);
    if (JSON.stringify(readdirSync(directory).sort(storeSort)) !== JSON.stringify(names.sort(storeSort))) storeFail('native store content inventory differs');
    for (const file of names) {
      const expectedFile = expected.contents.get(`${bucket}/${file}`), full = join(directory, file), stat = privateStoreEntry(full, false);
      if ((stat.mode & 0o111) !== expectedFile.executable || !storeRead(full, STORE_LIMIT).equals(expectedFile.bytes)) {
        storeFail('native store content differs from admission');
      }
    }
    if (statIdentity(privateStoreEntry(directory, true)) !== statIdentity(before)) storeFail('native store changed during verification');
  }
  const dbStat = privateStoreEntry(database, false);
  if (dbStat.size > STORE_LIMIT) storeFail('native store index exceeds byte limit');
  let db;
  try {
    db = new DatabaseSync(database, { readOnly: true });
    db.exec('PRAGMA trusted_schema = OFF; PRAGMA query_only = ON;');
    const schema = db.prepare("SELECT type, name, sql FROM sqlite_schema ORDER BY type, name").all();
    if (postUse) verifyStoreStatistics(db, schema, expected);
    else if (schema.length !== 1 || schema[0].type !== 'table' || schema[0].name !== 'package_index' || schema[0].sql !== STORE_SQL) storeFail('native store index schema differs');
    const check = db.prepare('PRAGMA quick_check').all();
    if (check.length !== 1 || check[0].quick_check !== 'ok') storeFail('native store index is corrupt');
    const rows = db.prepare('SELECT key, data FROM package_index ORDER BY key').all();
    if (rows.length !== expected.rows.size) storeFail('native store index inventory differs');
    for (const row of rows) {
      const wanted = expected.rows.get(row.key);
      if (!wanted || !(row.data instanceof Uint8Array) || !Buffer.from(row.data).equals(wanted)) storeFail('native store index differs from admission');
    }
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('PNPM_INDEPENDENCE:')) throw error;
    storeFail('native store index cannot be verified');
  } finally { db?.close(); }
  if (statIdentity(privateStoreEntry(database, false)) !== statIdentity(dbStat) ||
      statIdentity(privateStoreEntry(parent, true)) !== statIdentity(parentStat) ||
      statIdentity(privateStoreEntry(store, true)) !== statIdentity(storeStat) ||
      statIdentity(privateStoreEntry(v11, true)) !== statIdentity(v11Stat) ||
      statIdentity(privateStoreEntry(filesDir, true)) !== statIdentity(filesStat)) storeFail('native store changed during verification');
  if (postUse) {
    if (statIdentity(privateStoreEntry(join(v11, 'projects'), true)) !== statIdentity(projectsStat) ||
        statIdentity(lstatSync(linkPath)) !== statIdentity(linkStat) || readlinkSync(linkPath) !== linkText ||
        realpathSync(linkPath) !== project || verifyStoreProject(input, expected, parent) !== project) storeFail('native store project registration changed');
  }
  return Object.freeze({ schema: STORE_SCHEMA, binding: structuredClone(expected.binding),
    manifestSha256: hash('sha256', expected.manifestBytes), archiveCount: expected.archives.length,
    fileCount: expected.contents.size, installationAuthorized: false,
    scope: 'Point-in-time native store contents only; process isolation, registry policy, package-manager custody and installed-tree verification remain required.' });
}
function createNativeStore(input, obtain) {
  const expected = obtain(), { parent, store } = storeLocation(input.storeDir), parentStat = privateStoreEntry(parent, true);
  let created = false;
  try {
    mkdirSync(store, { mode: 0o700 }); created = true;
    const v11 = join(store, 'v11'), files = join(v11, 'files');
    mkdirSync(v11, { mode: 0o700 }); mkdirSync(files, { mode: 0o700 });
    for (const [path, file] of expected.contents) {
      const [bucket, basename] = path.split('/'), dir = join(files, bucket);
      try { mkdirSync(dir, { mode: 0o700 }); } catch (error) { if (error?.code !== 'EEXIST') throw error; }
      writeFileSync(join(dir, basename), file.bytes, { flag: 'wx', mode: 0o600 | file.executable });
      chmodSync(join(dir, basename), 0o600 | file.executable);
    }
    const db = new DatabaseSync(join(v11, 'index.db'));
    try {
      db.exec(`${STORE_SQL}; BEGIN IMMEDIATE;`);
      const insert = db.prepare('INSERT INTO package_index (key, data) VALUES (?, ?)');
      for (const [key, bytes] of expected.rows) insert.run(key, bytes);
      db.exec('COMMIT;');
    } finally { db.close(); }
    chmodSync(join(v11, 'index.db'), 0o600);
    writeFileSync(join(store, 'manifest.json'), expected.manifestBytes, { flag: 'wx', mode: 0o600 });
    const current = obtain(), parentAfter = privateStoreEntry(parent, true);
    if (!current.manifestBytes.equals(expected.manifestBytes)) storeFail('admission changed while creating native store');
    if (parentAfter.dev !== parentStat.dev || parentAfter.ino !== parentStat.ino) storeFail('store parent changed');
    const result = verifyNativeStore(store, current);
    if (!obtain().manifestBytes.equals(current.manifestBytes)) storeFail('admission changed while verifying native store');
    return result;
  } catch (error) {
    if (created) rmSync(store, { recursive: true, force: true });
    throw error;
  }
}
function readNativeStore(input, obtain) {
  const before = obtain(), report = verifyNativeStore(input.storeDir, before, input), after = obtain();
  if (!after.manifestBytes.equals(before.manifestBytes)) storeFail('admission changed while verifying native store');
  return report;
}

/** Materialize only a live consumer capability's reviewed archives in pnpm's v11 layout. */
export function seedVerifiedPnpmStore(input) {
  return createNativeStore(input, () => consumerStorePlan(input));
}
/** Recheck every native index record and CAS byte against the live consumer capability. */
export function verifyPnpmNativeStore(input) {
  return readNativeStore(input, () => consumerStorePlan(input));
}
/** Workspace admission has a separate, source-bound opaque capability. */
export function seedVerifiedWorkspacePnpmStore(input) {
  return createNativeStore(input, () => workspaceStorePlan(input));
}
export function verifyWorkspacePnpmNativeStore(input) {
  return readNativeStore(input, () => workspaceStorePlan(input));
}

/** Installed-tree archive identity cannot be inferred from a lock or receipt. */
export function assertInstalledPnpmArchiveSet(input) {
  if (!input?.admission?.capability || !(input.admission.manifestBytes instanceof Uint8Array) ||
      !(input.admission.lockBytes instanceof Uint8Array)) fail('PNPM_INSTALLED_SET_UNAVAILABLE: live admission and exact manifest/lock bytes are required');
  return verifyInstalledPnpmConsumer(input);
}
