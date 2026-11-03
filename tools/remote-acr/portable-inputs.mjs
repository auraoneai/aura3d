import { createHash } from 'node:crypto';
import { constants, closeSync, fstatSync, lstatSync, mkdirSync, mkdtempSync, openSync, readSync, readdirSync, realpathSync, renameSync, rmSync, writeFileSync, writeSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve, sep } from 'node:path';

// This is an input transport check, not an archive admission decision. The
// caller must use the fixed, independently anchored archive verifier before a
// provider or package installation can run.
const POLICY = 'tools/release/archive-admission-policy.json';
const HASH = /^[a-f0-9]{64}$/;
const GIT = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;
const RUN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
// Catalog IDs are logical identifiers, not filesystem components. Their
// prefixes and documented route separators come from the example catalog.
function isExampleCatalogId(value) {
  return typeof value === 'string' && value.length <= 256
    && /^(?:capability-example:[a-z0-9-]+|starter-example:[a-z0-9][a-z0-9-]*|documented-example:(?:apps|examples)\/[a-z0-9][a-z0-9-]*)$/.test(value);
}
const SRI = /^sha512-[A-Za-z0-9+/]{86}==$/;
const MAX_JSON = 16 * 1024 * 1024;
const MAX_FILE = 64 * 1024 * 1024;
const MAX_GRAPH = 256 * 1024 * 1024;
const MAX_TOTAL = 512 * 1024 * 1024;
const MAX_FILES = 10000;
const MAX_SOURCE_FILES = 100000;
const MAX_GRAPHS = 512;
export const PORTABLE_INPUT_CHUNK_BYTES = 256 * 1024;
const fail = message => { throw new Error(`PORTABLE_INPUTS: ${message}`); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const integrity = bytes => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` :
  value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const object = value => !!value && typeof value === 'object' && !Array.isArray(value);
function fields(value, required, label) {
  if (!object(value) || Object.keys(value).length !== required.length || required.some(key => !Object.hasOwn(value, key))) fail(`invalid ${label} fields`);
}
function list(value, label, limit = MAX_FILES, nonempty = true) {
  if (!Array.isArray(value) || value.length > limit || (nonempty && !value.length)) fail(`invalid ${label} inventory`);
  return value;
}
function publicPath(path) {
  if (typeof path !== 'string' || !path || path.length > 4096 || isAbsolute(path) || path.includes('\\') || /[\x00-\x1f\x7f]/.test(path)) fail('unsafe path');
  for (const part of path.split('/')) {
    const lower = part.toLowerCase();
    if (!part || part === '.' || part === '..' || ['node_modules', '.git', '.ssh', '.aws', '.azure', '.gcloud', '.gnupg', '.kube', '.docker', '.config', '.codex', '.npmrc', '.netrc', '.pypirc', '.yarnrc', '.yarnrc.yml', '.git-credentials', '.dockercfg', 'id_rsa', 'id_dsa', 'id_ecdsa', 'id_ed25519'].includes(lower) || /^\.env(?:\.|$)/i.test(part) || /\.(?:pem|key|p12|pfx|jks|keystore)$/i.test(part)) fail('private or unsafe path');
  }
  return path;
}
function rootDir(root) {
  if (typeof root !== 'string' || !root) fail('missing root');
  try { return realpathSync(resolve(root)); } catch { fail('missing root'); }
}
function snapshot(root, path, limit, allowEmpty = false) {
  publicPath(path);
  let current = root;
  try {
    for (const [index, part] of path.split('/').entries()) {
      current = join(current, part);
      const stat = lstatSync(current);
      if (stat.isSymbolicLink() || (index < path.split('/').length - 1 && !stat.isDirectory())) fail('unsafe file component');
    }
    if (!realpathSync(current).startsWith(root + sep)) fail('file escapes root');
    const fd = openSync(current, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    try {
      const before = fstatSync(fd);
      if (!before.isFile() || before.size > limit || (!allowEmpty && before.size === 0)) fail('invalid file size or type');
      const data = Buffer.alloc(before.size); let offset = 0;
      while (offset < data.length) {
        const count = readSync(fd, data, offset, data.length - offset, null);
        if (!count) fail('file changed while reading');
        offset += count;
      }
      const after = fstatSync(fd);
      if (after.size !== before.size || after.ino !== before.ino || after.mtimeMs !== before.mtimeMs) fail('file changed while reading');
      return data;
    } finally { closeSync(fd); }
  } catch (error) {
    if (error?.message?.startsWith('PORTABLE_INPUTS:')) throw error;
    fail('missing or unreadable file');
  }
}
// Used by the local transport: the largest allocation is one 256 KiB chunk,
// even when the input is a multi-megabyte candidate or dependency archive.
function streamIdentity(root, path, limit, outputPath) {
  publicPath(path);
  let current = root, input, output;
  try {
    const parts = path.split('/');
    for (let index = 0; index < parts.length; index++) {
      current = join(current, parts[index]);
      const stat = lstatSync(current);
      if (stat.isSymbolicLink() || (index < parts.length - 1 && !stat.isDirectory())) fail('unsafe file component');
    }
    if (!realpathSync(current).startsWith(root + sep)) fail('file escapes root');
    input = openSync(current, constants.O_RDONLY | (constants.O_NOFOLLOW || 0));
    const before = fstatSync(input);
    if (!before.isFile() || before.size > limit) fail('invalid file size or type');
    if (outputPath !== undefined) output = openSync(outputPath, 'wx', 0o600);
    const digest = createHash('sha256'), sri = createHash('sha512'), chunk = Buffer.alloc(PORTABLE_INPUT_CHUNK_BYTES);
    let size = 0;
    while (size < before.size) {
      const count = readSync(input, chunk, 0, Math.min(chunk.length, before.size - size), null);
      if (!count) fail('file changed while reading');
      digest.update(chunk.subarray(0, count)); sri.update(chunk.subarray(0, count));
      if (output !== undefined) {
        let written = 0;
        while (written < count) {
          const next = writeSync(output, chunk, written, count - written, null);
          if (!next) fail('could not stage file');
          written += next;
        }
      }
      size += count;
    }
    const after = fstatSync(input);
    if (after.size !== before.size || after.ino !== before.ino || after.mtimeMs !== before.mtimeMs) fail('file changed while reading');
    return { size, sha256: digest.digest('hex'), integrity: `sha512-${sri.digest('base64')}` };
  } catch (error) {
    if (error?.message?.startsWith('PORTABLE_INPUTS:')) throw error;
    fail('missing or unreadable file');
  } finally {
    if (input !== undefined) closeSync(input);
    if (output !== undefined) closeSync(output);
  }
}

// JSON.parse accepts duplicate keys. Detect them first without requiring a
// particular serializer, so ordinary generated package-lock files are valid.
function json(bytes, label) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail(`invalid ${label} JSON`); }
  let i = 0;
  const whitespace = () => { while (i < text.length && /[\x20\t\r\n]/.test(text[i])) i++; };
  function string() {
    const start = i++;
    while (i < text.length) {
      if (text[i] === '\\') { i += 2; continue; }
      if (text[i++] === '"') {
        try { return JSON.parse(text.slice(start, i)); } catch { fail(`invalid ${label} JSON`); }
      }
    }
    fail(`invalid ${label} JSON`);
  }
  function value(depth) {
    if (depth > 128) fail(`oversized ${label} JSON nesting`);
    whitespace();
    if (text[i] === '"') { string(); return; }
    if (text[i] === '{') {
      i++; whitespace(); const seen = new Set();
      if (text[i] === '}') { i++; return; }
      while (i < text.length) {
        whitespace(); if (text[i] !== '"') fail(`invalid ${label} JSON`);
        const key = string(); if (seen.has(key)) fail(`duplicate ${label} JSON key`); seen.add(key);
        whitespace(); if (text[i++] !== ':') fail(`invalid ${label} JSON`);
        value(depth + 1); whitespace();
        if (text[i] === '}') { i++; return; }
        if (text[i++] !== ',') fail(`invalid ${label} JSON`);
      }
      fail(`invalid ${label} JSON`);
    }
    if (text[i] === '[') {
      i++; whitespace(); if (text[i] === ']') { i++; return; }
      while (i < text.length) {
        value(depth + 1); whitespace();
        if (text[i] === ']') { i++; return; }
        if (text[i++] !== ',') fail(`invalid ${label} JSON`);
      }
      fail(`invalid ${label} JSON`);
    }
    const match = /^(?:true|false|null|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)/.exec(text.slice(i));
    if (!match) fail(`invalid ${label} JSON`); i += match[0].length;
  }
  value(0); whitespace(); if (i !== text.length) fail(`invalid ${label} JSON`);
  let parsed;
  try { parsed = JSON.parse(text); } catch { fail(`invalid ${label} JSON`); }
  function secrets(node) {
    if (typeof node === 'string') {
      if (/\bBearer\s+[A-Za-z0-9._~+\/-]+/i.test(node) || /(?:^|[?&])(?:access_token|auth_token|api_key|token|password|secret)=/i.test(node)) fail(`credential in ${label}`);
      if (/^https?:\/\//i.test(node)) {
        try { const url = new URL(node); if (url.username || url.password) fail(`credential in ${label}`); } catch (error) { if (error?.message?.startsWith('PORTABLE_INPUTS:')) throw error; }
      }
    } else if (node && typeof node === 'object') for (const [key, child] of Object.entries(node)) {
      if (/^(?:_auth|_authToken|authToken|accessToken|access_token|apiKey|api_key|password|passwd|secret|clientSecret|privateKey)$/i.test(key)) fail(`credential in ${label}`);
      secrets(child);
    }
  }
  secrets(parsed);
  return parsed;
}
function checkYamlMetadata(bytes) {
  let yaml;
  try { yaml = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('invalid pnpm lock UTF-8'); }
  if (/(?:^|[\s{'"\[,])(?:_auth|_authToken|authToken|accessToken|access_token|apiKey|api_key|password|passwd|secret|clientSecret|privateKey)[\s'"]*:/im.test(yaml) || /\bBearer\s+[A-Za-z0-9._~+\/-]+/i.test(yaml) || /https?:\/\/[^/\s'"<>]*@/i.test(yaml) || /[?&](?:access_token|auth_token|api_key|token|password|secret)=/i.test(yaml)) fail('credential in pnpm lock');
}
function checkEvidenceText(bytes) {
  let text;
  try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch { fail('invalid candidate evidence text'); }
  if (/https:\/\/[^\s"'<>?]+\?[^\s"'<>]+/i.test(text) || /\bBearer\s+[A-Za-z0-9._~+\/-]+=*/i.test(text)
    || /(?:access[_-]?token|authorization|password|secret|sig|sas)["']?\s*[:=]\s*["']?[^\s,"'&}]+/i.test(text)) fail('credential in candidate evidence');
}
function evidenceFormat(path) { return /\.(?:txt|md|log|csv|html|xml|tap)$/i.test(path) ? 'text' : undefined; }
function digestRef(ref, label, sized = false) {
  fields(ref, sized ? ['path', 'size', 'sha256'] : ['path', 'sha256'], label);
  publicPath(ref.path);
  if (!HASH.test(ref.sha256 ?? '') || (sized && (!Number.isSafeInteger(ref.size) || ref.size < 0 || ref.size > MAX_FILE))) fail(`invalid ${label} identity`);
}
function sameRef(actual, expected, label) {
  digestRef(actual, label);
  if (actual.path !== expected.path || actual.sha256 !== expected.sha256) fail(`${label} mismatch`);
}
function validateResolved(value) {
  if (typeof value !== 'string' || value.length > 8192) fail('invalid archive resolution');
  if (/^file:(?:(?:\.\/)?tarballs\/[A-Za-z0-9._-]+\.tgz|aura-candidates\/[a-f0-9]{64}\.tgz)$/.test(value)) return;
  let url;
  try { url = new URL(value); } catch { fail('invalid archive resolution'); }
  if (url.protocol !== 'https:' || url.hostname !== 'registry.npmjs.org' || url.port || url.username || url.password || url.search || url.hash || url.href !== value) fail('unsupported archive resolution');
}
function fixedPaths(runId) {
  if (!RUN.test(runId ?? '') || runId === '.' || runId === '..') fail('invalid run ID');
  const report = `tests/reports/native-capabilities/${runId}`;
  const side = `tests/reports/native-source-inputs/${runId}`;
  return { report, side, source: `${report}/source-manifest.json`, candidate: `${report}/candidate-plan.json`, inputs: `${side}/inputs.json` };
}
function sourceContext(root, paths, sourceManifestPath, candidatePlanPath, collectCandidates = true) {
  if (sourceManifestPath !== paths.source || candidatePlanPath !== paths.candidate) fail('run-scoped source or candidate path mismatch');
  const sourceBytes = snapshot(root, paths.source, MAX_JSON), planBytes = snapshot(root, paths.candidate, MAX_JSON);
  const manifest = json(sourceBytes, 'source manifest'), plan = json(planBytes, 'candidate plan');
  if (manifest?.schema !== 'aura3d.native-source-manifest/1' || !GIT.test(manifest.origin?.commit ?? '') || !GIT.test(manifest.origin?.tree ?? '') || !HASH.test(manifest.inputDigest ?? '') || !HASH.test(manifest.lockfileSha256 ?? '')) fail('invalid source manifest');
  list(manifest.files, 'source manifest', MAX_SOURCE_FILES);
  let previous = ''; const entries = new Map();
  for (const item of manifest.files) {
    if (!object(item) || typeof item.path !== 'string' || (previous && previous >= item.path) || !HASH.test(item.sha256 ?? '')) fail('invalid source manifest inventory');
    previous = item.path; entries.set(item.path, item);
  }
  if (sha256(Buffer.from(canonical(manifest.files))) !== manifest.inputDigest || entries.get('pnpm-lock.yaml')?.sha256 !== manifest.lockfileSha256) fail('source manifest digest mismatch');
  const manifestSha256 = sha256(sourceBytes), planSha256 = sha256(planBytes);
  if (plan?.schema !== 'aura3d-release-plan/1.0' || plan.packOnly !== true || plan.lockfileSha256 !== manifest.lockfileSha256 || plan.source?.commit !== manifest.origin.commit || plan.source?.tree !== manifest.origin.tree || plan.source?.lockfileSha256 !== manifest.lockfileSha256 || plan.source?.inputDigest !== manifest.inputDigest || plan.source?.manifestSha256 !== manifestSha256 || !HASH.test(plan.source?.fingerprint ?? '')) fail('candidate source identity mismatch');
  list(plan.packages, 'candidate packages', MAX_GRAPHS);
  if (plan.expectedPackageCount !== plan.packages.length || plan.packageCount !== plan.packages.length) fail('candidate package count mismatch');
  const candidates = new Map(), candidateRefs = new Map(), names = new Set(), candidateDigests = new Set(); let candidateSize = 0;
  for (const item of plan.packages) {
    if (!object(item) || typeof item.name !== 'string' || !item.name || names.has(item.name) || !HASH.test(item.sha256 ?? '') || !SRI.test(item.integrity ?? '') || typeof item.tarball !== 'string' || !item.tarball.startsWith(`${paths.report}/candidate-tarballs/`) || candidateRefs.has(item.tarball)) fail('invalid candidate package');
    names.add(item.name);
    const data = collectCandidates ? snapshot(root, item.tarball, MAX_FILE) : undefined;
    const actual = data ? { size: data.byteLength, sha256: sha256(data), integrity: integrity(data) } : streamIdentity(root, item.tarball, MAX_FILE);
    if (!actual.size || actual.sha256 !== item.sha256 || actual.integrity !== item.integrity) fail('candidate archive mismatch');
    candidateSize += actual.size;
    if (candidateSize > MAX_TOTAL) fail('candidate archives exceed byte limit');
    candidateDigests.add(item.sha256);
    candidateRefs.set(item.tarball, actual);
    if (data) candidates.set(item.tarball, data);
  }
  const policyEntry = entries.get(POLICY);
  if (!policyEntry || policyEntry.type !== 'file') fail('policy absent from source manifest');
  const policyBytes = snapshot(root, POLICY, MAX_JSON);
  if (sha256(policyBytes) !== policyEntry.sha256) fail('policy source mismatch');
  json(policyBytes, 'policy');
  return { sourceBytes, planBytes, manifest, plan, candidates, candidateRefs, candidateDigests, source: { path: paths.source, sha256: manifestSha256 }, candidate: { path: paths.candidate, sha256: planSha256 }, policy: { path: POLICY, sha256: sha256(policyBytes) } };
}
function checkPhysicalInventory(root, side, records) {
  const allowed = new Set([`${side}/inputs.json`, ...records.keys()]);
  const dirs = new Set([side]);
  for (const path of allowed) {
    let dir = dirname(path);
    while (dir.startsWith(`${side}/`)) { dirs.add(dir); dir = dirname(dir); }
  }
  function walk(path) {
    let entries;
    try { entries = readdirSync(join(root, path), { withFileTypes: true }); } catch { fail('sidecar directory unavailable'); }
    for (const entry of entries) {
      const name = `${path}/${entry.name}`; publicPath(name);
      if (entry.isSymbolicLink()) fail('sidecar symlink');
      if (entry.isDirectory()) { if (!dirs.has(name)) fail('unexpected sidecar directory'); walk(name); }
      else if (!entry.isFile() || !allowed.has(name)) fail('unexpected sidecar file');
    }
  }
  walk(side);
}
function envelopeContext(root, paths, options, context) {
  if (options.inputsPath !== paths.inputs) fail('run-scoped input path mismatch');
  const inputBytes = snapshot(root, paths.inputs, MAX_JSON), input = json(inputBytes, 'input envelope');
  fields(input, ['schema', 'runId', 'sourceManifest', 'candidatePlan', 'admissionPolicy', 'consumerBundle', 'exampleBundle', 'matrixBundle', 'exampleManifests', 'candidateReviews', 'candidateReviewEvidence', 'files'], 'input envelope');
  if (input.schema !== 'aura3d.native-portable-inputs/1' || input.runId !== options.runId) fail('input envelope identity mismatch');
  sameRef(input.sourceManifest, context.source, 'source manifest');
  sameRef(input.candidatePlan, context.candidate, 'candidate plan');
  sameRef(input.admissionPolicy, context.policy, 'admission policy');
  digestRef(input.consumerBundle, 'consumer bundle'); digestRef(input.exampleBundle, 'example bundle'); digestRef(input.matrixBundle, 'matrix bundle');
  const matrixPrefix = `${paths.side}/matrix/`;
  if (input.matrixBundle.path !== `${matrixPrefix}bundle.json`) fail('matrix bundle is not run-scoped');
  const records = new Map(); let previous = '', total = 0;
  for (const item of list(input.files, 'sidecar files')) {
    digestRef(item, 'sidecar file', true);
    if (!item.path.startsWith(`${paths.side}/`) || item.path === paths.inputs || (previous && previous >= item.path)) fail('invalid sidecar file inventory');
    previous = item.path;
    total += item.size; if (total > MAX_TOTAL) fail('sidecar input byte limit exceeded');
    records.set(item.path, item);
  }
  for (const [key, prefix] of [['candidateReviews', `${paths.side}/candidate-reviews/`], ['candidateReviewEvidence', `${paths.side}/candidate-review-evidence/`]]) {
    let previousPath = '';
    for (const ref of list(input[key], key, MAX_FILES, false)) {
      digestRef(ref, key);
      if (!/^[A-Za-z0-9._/-]+$/.test(ref.path) || !ref.path.startsWith(prefix) || ref.path.length === prefix.length || (previousPath && previousPath >= ref.path)
        || (key === 'candidateReviews' && ref.path !== `${prefix}${ref.sha256}.json`)) fail(`invalid ${key} path or order`);
      const entry = records.get(ref.path);
      if (!entry || !entry.size || entry.sha256 !== ref.sha256) fail(`missing or mismatched ${key} file`);
      previousPath = ref.path;
    }
  }
  checkPhysicalInventory(root, paths.side, records);
  return { inputBytes, input, records, matrixPrefix };
}

// Inspect only bounded input metadata during local transport. Lock graphs and
// compressed archives are deliberately left to the remote admission checks.
function stageMetadata(root, input, records, context, matrixPrefix, runId) {
  const used = new Set(), metadata = new Map(), archiveIntegrity = new Map();
  function reference(path, sha, size, allowCandidate = false, format) {
    publicPath(path);
    const entry = records.get(path) ?? (allowCandidate ? context.candidateRefs.get(path) : undefined);
    if (!entry || (sha !== undefined && entry.sha256 !== sha) || (size !== undefined && entry.size !== size)) fail('missing or conflicting input reference');
    if (records.has(path)) used.add(path);
    if (format) {
      if (!records.has(path) || entry.size < 1 || entry.size > MAX_JSON || (metadata.has(path) && metadata.get(path) !== format)) fail('invalid metadata reference');
      metadata.set(path, format);
    }
    return entry;
  }
  function readMetadata(path, label) {
    const entry = records.get(path);
    if (!entry || entry.size > MAX_JSON || !entry.size) fail('invalid metadata reference');
    const bytes = snapshot(root, path, MAX_JSON);
    if (bytes.length !== entry.size || sha256(bytes) !== entry.sha256) fail('metadata file mismatch');
    return json(bytes, label);
  }
  for (const ref of input.candidateReviews) reference(ref.path, ref.sha256, undefined, false, 'json');
  for (const ref of input.candidateReviewEvidence) reference(ref.path, ref.sha256, undefined, false, evidenceFormat(ref.path));
  for (const ref of [input.consumerBundle, input.exampleBundle, input.matrixBundle]) reference(ref.path, ref.sha256, undefined, false, 'json');
  const consumer = readMetadata(input.consumerBundle.path, 'consumer bundle');
  const examples = readMetadata(input.exampleBundle.path, 'example bundle');
  const matrix = readMetadata(input.matrixBundle.path, 'matrix bundle');
  fields(consumer, ['schema', 'candidatePlanSha256', 'sourceManifestSha256', 'projects'], 'consumer bundle');
  if (consumer.schema !== 'aura3d.portable-consumer-input/1' || consumer.candidatePlanSha256 !== context.candidate.sha256 || consumer.sourceManifestSha256 !== context.source.sha256) fail('consumer bundle identity mismatch');
  fields(examples, ['schema', 'runId', 'candidateSha256', 'sourceInputDigest', 'examples'], 'example bundle');
  if (examples.schema !== 'aura3d.native-example-locks/1' || examples.runId !== runId || examples.candidateSha256 !== context.candidate.sha256 || examples.sourceInputDigest !== context.manifest.inputDigest) fail('example bundle identity mismatch');
  fields(matrix, ['schema', 'candidatePlanSha256', 'sourceManifest', 'cells'], 'matrix bundle');
  if (matrix.schema !== 'aura3d.native-matrix-input/1' || matrix.candidatePlanSha256 !== context.candidate.sha256) fail('matrix bundle identity mismatch');
  sameRef(matrix.sourceManifest, context.source, 'matrix source manifest');
  function file(ref, label, format) {
    digestRef(ref, label, true); reference(ref.path, ref.sha256, ref.size, false, format);
  }
  function archives(rows, kind) {
    let previous = '', total = 0;
    for (const item of list(rows, 'graph archives')) {
      fields(item, kind === 'example' ? ['resolved', 'path'] : ['resolved', 'path', 'size', 'sha256', 'integrity'], 'archive');
      validateResolved(item.resolved);
      if (previous && previous >= item.resolved) fail('duplicate or unordered archive resolution');
      previous = item.resolved;
      if (kind !== 'example' && (!Number.isSafeInteger(item.size) || item.size < 1 || item.size > MAX_FILE || !HASH.test(item.sha256 ?? '') || !SRI.test(item.integrity ?? ''))) fail('invalid archive reference');
      if (kind === 'matrix' && item.path !== `${matrixPrefix}archives/${item.sha256}.tgz`) fail('matrix archive path mismatch');
      const entry = reference(item.path, item.sha256, item.size, true);
      if (!entry.size || entry.size > MAX_FILE) fail('invalid archive size');
      total += entry.size; if (total > MAX_GRAPH) fail('archive graph limit exceeded');
      if (item.integrity !== undefined) {
        const prior = archiveIntegrity.get(item.path);
        if (prior && prior !== item.integrity) fail('conflicting archive integrity');
        if (context.candidateRefs.has(item.path) && entry.integrity !== item.integrity) fail('candidate archive integrity mismatch');
        archiveIntegrity.set(item.path, item.integrity);
      }
      if (item.resolved.startsWith('file:')) {
        if (!context.candidateDigests.has(entry.sha256)) fail('local resolution must match a retained candidate');
        if (kind === 'example' && item.resolved !== `file:aura-candidates/${entry.sha256}.tgz`) fail('example candidate resolution mismatch');
        if (kind === 'consumer' && !/^file:(?:\.\/)?tarballs\//.test(item.resolved)) fail('consumer candidate resolution mismatch');
        if (kind === 'matrix' && !context.plan.packages.some(pkg => pkg.sha256 === entry.sha256 && item.resolved === `file:./tarballs/${basename(pkg.tarball)}`)) fail('matrix candidate resolution mismatch');
      }
    }
  }
  const projectIds = new Set();
  for (const project of list(consumer.projects, 'consumer projects', MAX_GRAPHS)) {
    fields(project, ['id', 'manifest', 'lockfile', 'archives', 'assets'], 'consumer project');
    if (!ID.test(project.id ?? '') || projectIds.has(project.id)) fail('invalid consumer project ID'); projectIds.add(project.id);
    file(project.manifest, 'consumer manifest', 'json'); file(project.lockfile, 'consumer lock', 'json');
    archives(project.archives, 'consumer');
    const targets = new Set();
    for (const item of list(project.assets, 'consumer assets', MAX_FILES, false)) {
      fields(item, ['target', 'path', 'size', 'sha256'], 'consumer asset');
      const { target, ...ref } = item; publicPath(target);
      if (targets.has(target)) fail('duplicate asset target'); targets.add(target); file(ref, 'consumer asset');
    }
  }
  const wrappers = new Map();
  for (const item of list(input.exampleManifests, 'example manifests', MAX_GRAPHS)) {
    fields(item, ['id', 'path', 'size', 'sha256'], 'example manifest');
    if (!isExampleCatalogId(item.id) || wrappers.has(item.id)) fail('invalid example manifest ID');
    const { id, ...ref } = item; file(ref, 'example manifest', 'json'); wrappers.set(id, ref);
  }
  const exampleIds = new Set();
  for (const item of list(examples.examples, 'example projects', MAX_GRAPHS)) {
    fields(item, ['id', 'manifestSha256', 'lockPath', 'lockSha256', 'archives'], 'example project');
    if (!isExampleCatalogId(item.id) || exampleIds.has(item.id) || !HASH.test(item.manifestSha256 ?? '') || !HASH.test(item.lockSha256 ?? '') || wrappers.get(item.id)?.sha256 !== item.manifestSha256) fail('invalid example project identity');
    exampleIds.add(item.id); reference(item.lockPath, item.lockSha256, undefined, false, 'json'); archives(item.archives, 'example');
  }
  if (wrappers.size !== exampleIds.size) fail('unexpected example manifest');
  const cells = ['npm', 'pnpm'].flatMap(manager => [18, 19].flatMap(major => ['absent', 'present'].map(peer => ({ id: `${manager}-react${major}-peer-${peer}`, manager }))));
  if (list(matrix.cells, 'matrix cells', cells.length).length !== cells.length) fail('matrix cell inventory incomplete');
  const cellIds = new Set();
  for (const item of matrix.cells) {
    fields(item, ['id', 'manager', 'manifest', 'lockfile', 'archives'], 'matrix cell');
    if (!cells.some(cell => cell.id === item.id && cell.manager === item.manager) || cellIds.has(item.id)) fail('invalid matrix cell ID'); cellIds.add(item.id);
    const directory = `${matrixPrefix}cells/${item.id}/`;
    if (item.manifest?.path !== `${directory}package.json` || item.lockfile?.path !== `${directory}${item.manager === 'npm' ? 'package-lock.json' : 'pnpm-lock.yaml'}`) fail('matrix cell file path mismatch');
    file(item.manifest, 'matrix manifest', 'json'); file(item.lockfile, 'matrix lock', item.manager === 'npm' ? 'json' : 'yaml'); archives(item.archives, 'matrix');
  }
  if (used.size !== records.size) fail('unexpected or missing referenced sidecar file');
  for (const path of records.keys()) {
    const format = /\.json$/i.test(path) ? 'json' : /\.ya?ml$/i.test(path) ? 'yaml' : undefined;
    if (format && !metadata.has(path)) metadata.set(path, format);
  }
  for (const [path, format] of metadata) {
    const entry = records.get(path), bytes = snapshot(root, path, MAX_JSON);
    if (bytes.byteLength !== entry.size || sha256(bytes) !== entry.sha256) fail('metadata file mismatch');
    if (format === 'yaml') checkYamlMetadata(bytes);
    else if (format === 'text') checkEvidenceText(bytes);
    else json(bytes, 'input metadata');
  }
  return archiveIntegrity;
}
function verifyInternal(options) {
  const root = rootDir(options.root), paths = fixedPaths(options.runId);
  const context = sourceContext(root, paths, options.sourceManifestPath, options.candidatePlanPath);
  const { inputBytes, input, records, matrixPrefix } = envelopeContext(root, paths, options, context);
  const snapshots = new Map();
  for (const item of records.values()) {
    const bytes = snapshot(root, item.path, MAX_FILE, true);
    if (bytes.byteLength !== item.size || sha256(bytes) !== item.sha256) fail('sidecar file mismatch');
    snapshots.set(item.path, bytes);
  }
  const used = new Set();
  function sidecar(path, expectedSha, expectedSize, max = MAX_JSON, allowEmpty = false) {
    publicPath(path); const record = records.get(path), data = snapshots.get(path);
    if (!record || !data || data.length > max || (!allowEmpty && !data.length) || (expectedSha !== undefined && record.sha256 !== expectedSha) || (expectedSize !== undefined && record.size !== expectedSize)) fail('missing or conflicting sidecar reference');
    used.add(path); return data;
  }
  for (const ref of input.candidateReviews) json(sidecar(ref.path, ref.sha256), 'candidate review');
  for (const ref of input.candidateReviewEvidence) {
    const format = evidenceFormat(ref.path) || (/\.json$/i.test(ref.path) ? 'json' : /\.ya?ml$/i.test(ref.path) ? 'yaml' : undefined);
    const bytes = sidecar(ref.path, ref.sha256, undefined, format ? MAX_JSON : MAX_FILE);
    if (format === 'text') checkEvidenceText(bytes);
    else if (format === 'json') json(bytes, 'candidate evidence');
    else if (format === 'yaml') checkYamlMetadata(bytes);
  }
  function archive(path, expectedSha, expectedSize) {
    const data = context.candidates.get(path) ?? sidecar(path, expectedSha, expectedSize, MAX_FILE);
    if ((expectedSha !== undefined && sha256(data) !== expectedSha) || (expectedSize !== undefined && data.length !== expectedSize)) fail('archive identity mismatch');
    return data;
  }
  const consumer = json(sidecar(input.consumerBundle.path, input.consumerBundle.sha256), 'consumer bundle');
  const examples = json(sidecar(input.exampleBundle.path, input.exampleBundle.sha256), 'example bundle');
  const matrix = json(sidecar(input.matrixBundle.path, input.matrixBundle.sha256), 'matrix bundle');
  fields(consumer, ['schema', 'candidatePlanSha256', 'sourceManifestSha256', 'projects'], 'consumer bundle');
  if (consumer.schema !== 'aura3d.portable-consumer-input/1' || consumer.candidatePlanSha256 !== context.candidate.sha256 || consumer.sourceManifestSha256 !== context.source.sha256) fail('consumer bundle identity mismatch');
  fields(examples, ['schema', 'runId', 'candidateSha256', 'sourceInputDigest', 'examples'], 'example bundle');
  if (examples.schema !== 'aura3d.native-example-locks/1' || examples.runId !== options.runId || examples.candidateSha256 !== context.candidate.sha256 || examples.sourceInputDigest !== context.manifest.inputDigest) fail('example bundle identity mismatch');
  fields(matrix, ['schema', 'candidatePlanSha256', 'sourceManifest', 'cells'], 'matrix bundle');
  if (matrix.schema !== 'aura3d.native-matrix-input/1' || matrix.candidatePlanSha256 !== context.candidate.sha256) fail('matrix bundle identity mismatch');
  sameRef(matrix.sourceManifest, context.source, 'matrix source manifest');
  const wrappers = new Map();
  for (const item of list(input.exampleManifests, 'example manifests', MAX_GRAPHS)) {
    fields(item, ['id', 'path', 'size', 'sha256'], 'example manifest');
    if (!isExampleCatalogId(item.id) || wrappers.has(item.id)) fail('invalid example manifest ID');
    const { id, ...ref } = item; digestRef(ref, 'example manifest', true);
    wrappers.set(id, ref);
  }
  const consumers = [], pnpmConsumers = [];
  function graph(manifestBytes, lockBytes, archives, kind, manager = 'npm') {
    json(manifestBytes, 'project manifest');
    const locked = new Map();
    if (manager === 'npm') {
      const lock = json(lockBytes, 'project lock');
      if (lock?.lockfileVersion !== 3 || !object(lock.packages) || !object(lock.packages[''])) fail('invalid project lock');
      for (const [path, entry] of Object.entries(lock.packages)) {
        if (!path) continue;
        if (!object(entry)) fail('invalid lock entry');
        validateResolved(entry.resolved);
        if (!SRI.test(entry.integrity ?? '')) fail('invalid lock integrity');
        const prior = locked.get(entry.resolved);
        if (prior && prior !== entry.integrity) fail('conflicting lock integrity');
        locked.set(entry.resolved, entry.integrity);
      }
    } else {
      // Full graph and YAML syntax validation belongs to the separate pnpm
      // admission verifier. Refuse credential-bearing text before transport.
      checkYamlMetadata(lockBytes);
    }
    const actual = [], seen = new Set(); let size = 0, previousResolution = '';
    for (const item of list(archives, 'graph archives')) {
      fields(item, kind !== 'example' ? ['resolved', 'path', 'size', 'sha256', 'integrity'] : ['resolved', 'path'], 'archive');
      validateResolved(item.resolved); publicPath(item.path);
      if ((previousResolution && previousResolution >= item.resolved) || seen.has(item.resolved)) fail('duplicate or unordered archive resolution');
      previousResolution = item.resolved; seen.add(item.resolved);
      if (kind !== 'example' && (!Number.isSafeInteger(item.size) || item.size < 1 || item.size > MAX_FILE || !HASH.test(item.sha256 ?? '') || !SRI.test(item.integrity ?? ''))) fail('invalid archive reference');
      if (kind === 'matrix' && item.path !== `${matrixPrefix}archives/${item.sha256}.tgz`) fail('matrix archive path mismatch');
      const data = archive(item.path, item.sha256, item.size);
      size += data.length;
      if (size > MAX_GRAPH || data.length > MAX_FILE || !data.length || (manager === 'npm' && integrity(data) !== locked.get(item.resolved)) || (kind !== 'example' && integrity(data) !== item.integrity)) fail('archive lock or graph limit mismatch');
      if (item.resolved.startsWith('file:')) {
        if (!context.candidateDigests.has(sha256(data))) fail('local resolution must match a retained candidate');
        if (kind === 'example' && item.resolved !== `file:aura-candidates/${sha256(data)}.tgz`) fail('example candidate resolution mismatch');
        if (kind === 'consumer' && !/^file:(?:\.\/)?tarballs\//.test(item.resolved)) fail('consumer candidate resolution mismatch');
        if (kind === 'matrix' && !context.plan.packages.some(pkg => pkg.sha256 === sha256(data) && item.resolved === `file:./tarballs/${basename(pkg.tarball)}`)) fail('matrix candidate resolution mismatch');
      }
      actual.push({ resolved: item.resolved, bytes: data });
    }
    if (manager === 'npm' && (locked.size !== seen.size || [...locked.keys()].some(key => !seen.has(key)))) fail('incomplete archive inventory');
    (manager === 'pnpm' ? pnpmConsumers : consumers).push({ manifestBytes, lockBytes, archives: actual });
  }
  const projectIds = new Set();
  for (const item of list(consumer.projects, 'consumer projects', MAX_GRAPHS)) {
    fields(item, ['id', 'manifest', 'lockfile', 'archives', 'assets'], 'consumer project');
    if (!ID.test(item.id ?? '') || projectIds.has(item.id)) fail('invalid consumer project ID'); projectIds.add(item.id);
    digestRef(item.manifest, 'consumer manifest', true); digestRef(item.lockfile, 'consumer lock', true);
    const manifest = sidecar(item.manifest.path, item.manifest.sha256, item.manifest.size);
    const lock = sidecar(item.lockfile.path, item.lockfile.sha256, item.lockfile.size);
    const targets = new Set();
    for (const asset of list(item.assets, 'consumer assets', MAX_FILES, false)) {
      fields(asset, ['target', 'path', 'size', 'sha256'], 'consumer asset');
      const { target, ...ref } = asset; publicPath(target); digestRef(ref, 'consumer asset', true);
      if (targets.has(target)) fail('duplicate asset target'); targets.add(target);
      sidecar(ref.path, ref.sha256, ref.size, MAX_FILE, true);
    }
    graph(manifest, lock, item.archives, 'consumer');
  }
  const exampleIds = new Set();
  for (const item of list(examples.examples, 'example projects', MAX_GRAPHS)) {
    fields(item, ['id', 'manifestSha256', 'lockPath', 'lockSha256', 'archives'], 'example project');
    if (!isExampleCatalogId(item.id) || exampleIds.has(item.id) || !HASH.test(item.manifestSha256 ?? '') || !HASH.test(item.lockSha256 ?? '')) fail('invalid example project identity');
    exampleIds.add(item.id);
    const wrapper = wrappers.get(item.id);
    if (!wrapper || wrapper.sha256 !== item.manifestSha256) fail('example wrapper mismatch');
    const manifest = sidecar(wrapper.path, wrapper.sha256, wrapper.size), lock = sidecar(item.lockPath, item.lockSha256);
    graph(manifest, lock, item.archives, 'example');
  }
  const expectedCells = ['npm', 'pnpm'].flatMap(manager => [18, 19].flatMap(major => ['absent', 'present'].map(peer => ({ id: `${manager}-react${major}-peer-${peer}`, manager }))));
  const cells = list(matrix.cells, 'matrix cells', expectedCells.length);
  if (cells.length !== expectedCells.length) fail('matrix cell inventory incomplete');
  const cellIds = new Set();
  for (const item of cells) {
    fields(item, ['id', 'manager', 'manifest', 'lockfile', 'archives'], 'matrix cell');
    const expected = expectedCells.find(cell => cell.id === item.id);
    if (!expected || expected.manager !== item.manager || cellIds.has(item.id)) fail('invalid matrix cell ID');
    cellIds.add(item.id);
    digestRef(item.manifest, 'matrix manifest', true); digestRef(item.lockfile, 'matrix lock', true);
    const cellPrefix = `${matrixPrefix}cells/${item.id}/`;
    if (item.manifest.path !== `${cellPrefix}package.json` || item.lockfile.path !== `${cellPrefix}${item.manager === 'npm' ? 'package-lock.json' : 'pnpm-lock.yaml'}`) fail('matrix cell file path mismatch');
    const manifest = sidecar(item.manifest.path, item.manifest.sha256, item.manifest.size);
    const lock = sidecar(item.lockfile.path, item.lockfile.sha256, item.lockfile.size);
    graph(manifest, lock, item.archives, 'matrix', item.manager);
  }
  if (wrappers.size !== exampleIds.size || consumers.length > MAX_GRAPHS || pnpmConsumers.length > MAX_GRAPHS || used.size !== records.size) fail('unexpected or missing referenced sidecar file');
  return { result: { sourceManifest: context.source, candidatePlan: context.candidate, inputs: { path: paths.inputs, sha256: sha256(inputBytes) }, admissionPolicy: context.policy, consumerBundle: { ...input.consumerBundle }, exampleBundle: { ...input.exampleBundle }, matrixBundle: { ...input.matrixBundle }, candidateReviews: input.candidateReviews.map(ref => ({ ...ref })), candidateReviewEvidence: input.candidateReviewEvidence.map(ref => ({ ...ref })), consumers, pnpmConsumers }, snapshots, inputBytes, paths, context };
}

/** Verify only; returned bytes still require independently pinned admission. */
export function verifyPortableInputs(options) { return verifyInternal(options).result; }

/** Transport checked inputs with bounded memory; admission remains remote. */
export function stagePortableInputs(options) {
  const root = rootDir(options.root), dest = rootDir(options.dest), paths = fixedPaths(options.runId);
  if (dest === root) fail('stage destination must differ from input root');
  const context = sourceContext(root, paths, options.sourceManifestPath, options.candidatePlanPath, false);
  const { inputBytes, input, records, matrixPrefix } = envelopeContext(root, paths, options, context);
  const expectedIntegrity = stageMetadata(root, input, records, context, matrixPrefix, options.runId);
  const staged = sourceContext(dest, paths, options.sourceManifestPath, options.candidatePlanPath, false);
  if (!staged.sourceBytes.equals(context.sourceBytes) || !staged.planBytes.equals(context.planBytes) || staged.policy.sha256 !== context.policy.sha256) fail('destination source or candidate differs');
  const rootManifest = snapshot(dest, '.native-source-manifest.json', MAX_JSON);
  if (!rootManifest.equals(staged.sourceBytes)) fail('destination source manifest copy differs');
  const result = { sourceManifest: context.source, candidatePlan: context.candidate, inputs: { path: paths.inputs, sha256: sha256(inputBytes) },
    admissionPolicy: context.policy, consumerBundle: { ...input.consumerBundle }, exampleBundle: { ...input.exampleBundle }, matrixBundle: { ...input.matrixBundle },
    candidateReviews: input.candidateReviews.map(ref => ({ ...ref })), candidateReviewEvidence: input.candidateReviewEvidence.map(ref => ({ ...ref })) };
  const parent = `${dest}/tests/reports/native-source-inputs`;
  // The destination is a private source stage; check each existing ancestor
  // before creating missing ones and reserve a per-run lock against other users
  // of this staging operation.
  let current = dest;
  for (const part of ['tests', 'reports', 'native-source-inputs']) {
    current = join(current, part);
    try { const stat = lstatSync(current); if (!stat.isDirectory() || stat.isSymbolicLink()) fail('unsafe destination directory'); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; mkdirSync(current); }
  }
  const target = join(parent, options.runId), lock = `${target}.staging-lock`;
  let temporary, acquired = false, committed = false;
  try {
    mkdirSync(lock); acquired = true;
    try { lstatSync(target); fail('sidecar destination already exists'); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    temporary = mkdtempSync(join(parent, '.portable-staging-'));
    writeFileSync(join(temporary, 'inputs.json'), inputBytes, { flag: 'wx', mode: 0o600 });
    for (const item of records.values()) {
      const relative = item.path.slice(paths.side.length + 1), destination = join(temporary, relative);
      mkdirSync(dirname(destination), { recursive: true });
      const actual = streamIdentity(root, item.path, MAX_FILE, destination);
      if (actual.size !== item.size || actual.sha256 !== item.sha256 || (expectedIntegrity.has(item.path) && actual.integrity !== expectedIntegrity.get(item.path))) fail('sidecar file mismatch');
    }
    const finalStage = sourceContext(dest, paths, options.sourceManifestPath, options.candidatePlanPath, false);
    if (!finalStage.sourceBytes.equals(context.sourceBytes) || !finalStage.planBytes.equals(context.planBytes) || finalStage.policy.sha256 !== context.policy.sha256 || !snapshot(dest, '.native-source-manifest.json', MAX_JSON).equals(context.sourceBytes)) fail('destination identity changed during staging');
    try { lstatSync(target); fail('sidecar destination already exists'); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
    renameSync(temporary, target); temporary = undefined; committed = true;
    committed = false;
    return result;
  } finally {
    if (temporary) rmSync(temporary, { recursive: true, force: true });
    if (committed) rmSync(target, { recursive: true, force: true });
    if (acquired) try { rmSync(lock, { recursive: true, force: true }); } catch { /* Preserve the primary error. */ }
  }
}
