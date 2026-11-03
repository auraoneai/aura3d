import { createHash, createPublicKey, verify as verifySignature } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs';
import { isAbsolute, resolve, sep } from 'node:path';
import { assertReleaseInventory } from './release-inventory.mjs';
import { isSourceInput, stagedSourceIdentity } from './source-identity.mjs';
import { inspectIndependentNpmConsumer, inspectNpmArchive } from './portable-npm-lock.mjs';
import { inspectIndependentPnpmConsumer } from './portable-pnpm-lock.mjs';

// This digest must be established independently before source work begins.
// A candidate, staged manifest, receipt, or key contained in the policy itself
// cannot establish its own trust. No approved policy anchor exists today.
// Authenticity of this pin also depends on loading the trusted verifier code.
const TRUSTED_POLICY_SHA256 = null;
const POLICY = 'tools/release/archive-admission-policy.json';
const MAX_JSON = 16 * 1024 * 1024;
const MAX_EVIDENCE = 128 * 1024 * 1024;
const MAX_ARCHIVES = 10000;
const MAX_TOTAL = 256 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const SRI = /^sha512-[A-Za-z0-9+/]{86}==$/;
const CANDIDATE_DOMAIN = 'aura3d.candidate-review/1\0';
const capabilities = new WeakMap();
const pnpmCapabilities = new WeakMap();
const fail = message => { throw new Error(`ARCHIVE_ADMISSION: ${message}`); };
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const integrity = bytes => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
const canonical = value => Array.isArray(value) ? `[${value.map(canonical).join(',')}]` :
  value && typeof value === 'object' ? `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}` : JSON.stringify(value);
const object = (value, label) => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail(`invalid ${label}`);
  return value;
};
function keys(value, required, label) {
  object(value, label);
  if (Object.keys(value).length !== required.length || required.some(key => !Object.hasOwn(value, key))) fail(`invalid ${label} fields`);
}
function text(value, label, minimum = 1, maximum = 4096) {
  if (typeof value !== 'string' || value.trim().length < minimum || value.length > maximum || /[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value)) fail(`invalid ${label}`);
  return value;
}
function sourcePath(path, label) {
  if (typeof path !== 'string' || !path || isAbsolute(path) || path.includes('\\') || /[\x00-\x1f]/.test(path) ||
      path.split('/').some(part => !part || part === '.' || part === '..')) fail(`unsafe ${label}`);
  return path;
}
function bytes(value, label, max = MAX_JSON) {
  if (!(value instanceof Uint8Array) || value.byteLength < 1 || value.byteLength > max) fail(`invalid ${label} bytes`);
  return Buffer.from(value);
}
function json(input, label, canonical = false) {
  let value, decoded;
  try {
    decoded = new TextDecoder('utf-8', { fatal: true }).decode(input);
    value = JSON.parse(decoded);
  } catch { fail(`invalid ${label} JSON`); }
  // Keep later canonicalization and signature verification bounded even for
  // an unauthenticated review document with deeply nested values.
  const pending = [{ value, depth: 0 }];
  let count = 0;
  while (pending.length) {
    const current = pending.pop();
    if (++count > 1000000 || current.depth > 64) fail(`${label} JSON limit exceeded`);
    if (current.value && typeof current.value === 'object') {
      for (const child of Object.values(current.value)) pending.push({ value: child, depth: current.depth + 1 });
    }
  }
  // Canonical policy/review serialization also rejects duplicate object keys.
  if (canonical && `${JSON.stringify(value, null, 2)}\n` !== decoded) fail(`noncanonical ${label} JSON`);
  return value;
}
function localFile(root, path, max, allowEmpty = false) {
  sourcePath(path, 'file path');
  const absolute = resolve(root, path), base = realpathSync(root);
  if (!absolute.startsWith(base + sep)) fail('file escapes repository');
  let stat, real;
  try { stat = lstatSync(absolute); real = realpathSync(absolute); } catch { fail(`missing file: ${path}`); }
  if (!stat.isFile() || stat.isSymbolicLink() || real !== absolute || (!allowEmpty && stat.size < 1) || stat.size > max) fail(`invalid or unsafe file: ${path}`);
  return readFileSync(absolute);
}
function stagedFile(root, path, context) {
  sourcePath(path, 'evidence path');
  if (!isSourceInput(path)) fail(`evidence is not a staged source input: ${path}`);
  if (context.cache.has(path)) return context.cache.get(path);
  const entry = context.sourceEntries.get(path);
  if (!entry || entry.type !== 'file') fail(`evidence is absent from the source manifest: ${path}`);
  const local = localFile(root, path, MAX_EVIDENCE, true);
  if (sha256(local) !== entry.sha256) fail(`staged evidence differs: ${path}`);
  context.cache.set(path, local);
  return local;
}
function ref(value, root, context, label, forbiddenPaths = []) {
  keys(value, ['path', 'sha256'], label);
  if (!HASH.test(value.sha256 ?? '') || forbiddenPaths.includes(value.path)) fail(`invalid ${label} reference`);
  const data = stagedFile(root, value.path, context);
  if (label === 'supporting evidence' && data.length === 0) fail('supporting evidence is empty');
  if (sha256(data) !== value.sha256) fail(`${label} digest mismatch: ${value.path}`);
  return data;
}
function refs(values, root, context, label, forbiddenPaths) {
  if (!Array.isArray(values) || values.length === 0 || values.length > 10000) fail(`missing ${label}`);
  const seen = new Set();
  return values.map(value => {
    if (seen.has(value?.path)) fail(`duplicate ${label} path`);
    seen.add(value?.path);
    return ref(value, root, context, label, forbiddenPaths);
  });
}
function exactArchiveIdentity(value, label) {
  keys(value, ['name', 'version', 'sha256', 'integrity'], label);
  text(value.name, `${label} name`, 1, 214);
  text(value.version, `${label} version`, 1, 128);
  if (!HASH.test(value.sha256 ?? '') || !SRI.test(value.integrity ?? '') ||
      Buffer.from(value.integrity.slice(7), 'base64').toString('base64') !== value.integrity.slice(7)) fail(`invalid ${label} digest`);
}
function sameIdentity(left, right) {
  return ['name', 'version', 'sha256', 'integrity'].every(key => left?.[key] === right?.[key]);
}
function identityKey(value) {
  return JSON.stringify([value.name, value.version, value.sha256, value.integrity]);
}
function assertPolicyPin() {
  if (!HASH.test(TRUSTED_POLICY_SHA256 ?? '')) fail('no independently trusted policy anchor is configured');
}
function policyEntries(policyBytes) {
  if (policyBytes.length > MAX_JSON) fail('policy exceeds byte limit');
  if (sha256(policyBytes) !== TRUSTED_POLICY_SHA256) fail('staged policy does not match the independently trusted anchor');
  const policy = json(policyBytes, 'policy', true);
  object(policy, 'policy');
  keys(policy, Object.hasOwn(policy, 'candidateAuthorities') ? ['schema', 'admissions', 'candidateAuthorities'] : ['schema', 'admissions'], 'policy');
  if (policy.schema !== 'aura3d.archive-admission-policy/1' || !Array.isArray(policy.admissions) || policy.admissions.length > MAX_ARCHIVES) fail('invalid policy schema or inventory');
  const entries = new Map();
  for (const item of policy.admissions) {
    keys(item, ['archive', 'review'], 'admission');
    exactArchiveIdentity(item.archive, 'admission archive');
    keys(item.review, ['path', 'sha256'], 'review reference');
    sourcePath(item.review.path, 'review path');
    if (!HASH.test(item.review.sha256 ?? '') || item.review.path === POLICY) fail('invalid review reference');
    const id = identityKey(item.archive);
    if (entries.has(id)) fail('duplicate archive admission');
    entries.set(id, item);
  }
  const authorities = new Map();
  const configured = policy.candidateAuthorities ?? [];
  if (!Array.isArray(configured) || configured.length > MAX_ARCHIVES) fail('invalid candidate authority inventory');
  for (const authority of configured) {
    keys(authority, ['keyId', 'spkiDerBase64'], 'candidate authority');
    if (!HASH.test(authority.keyId ?? '') || typeof authority.spkiDerBase64 !== 'string' ||
        !/^[A-Za-z0-9+/]+={0,2}$/.test(authority.spkiDerBase64)) fail('invalid candidate authority');
    const der = Buffer.from(authority.spkiDerBase64, 'base64');
    if (der.length !== 44 || der.toString('base64') !== authority.spkiDerBase64 || sha256(der) !== authority.keyId || authorities.has(authority.keyId)) fail('invalid or duplicate candidate authority identity');
    let key;
    try { key = createPublicKey({ key: der, format: 'der', type: 'spki' }); } catch { fail('invalid candidate authority key'); }
    if (key.asymmetricKeyType !== 'ed25519' || !Buffer.from(key.export({ format: 'der', type: 'spki' })).equals(der)) fail('unsupported candidate authority key');
    authorities.set(authority.keyId, key);
  }
  return { entries, authorities };
}

/**
 * Check only the fixed policy configuration before dispatching source work.
 * This returns no capability and does not review archives, source evidence,
 * candidate plans, lock graphs, or any admission decision.
 */
export function assertArchiveAdmissionConfigured({ root = process.cwd() } = {}) {
  assertPolicyPin();
  const base = realpathSync(resolve(root));
  policyEntries(localFile(base, POLICY, MAX_JSON));
}

function stagedContext(root, sourceManifestPath, planPath) {
  assertPolicyPin();
  root = realpathSync(resolve(root));
  sourcePath(sourceManifestPath, 'source manifest path');
  sourcePath(planPath, 'candidate plan path');
  const manifestBytes = localFile(root, sourceManifestPath, MAX_JSON);
  const manifest = json(manifestBytes, 'source manifest');
  const source = stagedSourceIdentity(root, sourceManifestPath);
  if (sha256(manifestBytes) !== source.manifestSha256 || !HASH.test(source.inputDigest ?? '')) fail('staged source identity mismatch');
  const sourceEntries = new Map(manifest.files.map(entry => [entry.path, entry]));
  const planBytes = localFile(root, planPath, MAX_JSON), rawPlan = json(planBytes, 'candidate plan');
  if (rawPlan?.schema !== 'aura3d-release-plan/1.0' || !rawPlan.source || !Array.isArray(rawPlan.packages) ||
      Object.keys(source).some(key => rawPlan.source[key] !== source[key])) fail('candidate plan does not bind the staged source');
  const manifests = ['package.json', ...readdirSync(resolve(root, 'packages')).map(name => `packages/${name}/package.json`)
    .filter(path => existsSync(resolve(root, path)))].map(path => json(localFile(root, path, MAX_JSON), 'package manifest')).filter(value => value.private !== true);
  const expected = assertReleaseInventory(rawPlan.version, manifests.map(value => value.name), rawPlan.inventoryId);
  assertReleaseInventory(rawPlan.version, rawPlan.packages.map(value => value.name), rawPlan.inventoryId);
  if (rawPlan.packageCount !== expected.length || rawPlan.expectedPackageCount !== expected.length) fail('candidate package count mismatch');
  for (const manifest of manifests) {
    const candidate = rawPlan.packages.find(item => item.name === manifest.name);
    if (!candidate || candidate.version !== manifest.version || candidate.version !== rawPlan.version) fail(`candidate version mismatch: ${manifest.name}`);
    const data = localFile(root, candidate.tarball, 64 * 1024 * 1024);
    if (sha256(data) !== candidate.sha256 || integrity(data) !== candidate.integrity) fail(`candidate archive mismatch: ${candidate.name}`);
  }
  const plan = { ...rawPlan, reference: { path: planPath, sha256: sha256(planBytes) } };
  const context = { root, sourceManifestPath, source, sourceEntries, plan, cache: new Map() };
  const policyBytes = stagedFile(root, POLICY, context);
  const { entries, authorities } = policyEntries(policyBytes);
  return { ...context, entries, authorities, policySha256: sha256(policyBytes), reviewCache: new Map(),
    candidateReviews: new Map(), sidecars: new Map(), sidecarBytes: 0 };
}

function readSidecar(context, path, expected, max = MAX_EVIDENCE) {
  sourcePath(path, 'candidate sidecar path');
  if (!HASH.test(expected ?? '') || !/^[A-Za-z0-9._/-]+$/.test(path) || path.length > 4096 ||
      path.split('/').some(part => /^(?:\.git|node_modules|\.ssh|\.aws|\.azure|\.config|\.codex|\.env(?:\..*)?|id_(?:rsa|dsa|ecdsa|ed25519)|.*\.(?:pem|key|p12|pfx))$/i.test(part))) fail('unsafe candidate sidecar identity');
  const existing = context.sidecars.get(path);
  if (existing) {
    if (existing.sha256 !== expected) fail('conflicting candidate sidecar identity');
    return existing.bytes;
  }
  if (context.sidecars.size >= MAX_ARCHIVES * 2) fail('candidate sidecar count limit exceeded');
  const data = localFile(context.root, path, max);
  context.sidecarBytes += data.length;
  if (context.sidecarBytes > MAX_TOTAL || sha256(data) !== expected) fail('candidate sidecar byte limit or digest mismatch');
  context.sidecars.set(path, { sha256: expected, bytes: data });
  return data;
}
function sidecarIdentities(context) {
  return [...context.sidecars].map(([path, item]) => ({ path, sha256: item.sha256 }));
}
function assertSidecarsUnchanged(root, identities) {
  for (const item of identities) if (sha256(localFile(root, item.path, MAX_EVIDENCE)) !== item.sha256) fail('candidate review or evidence changed after admission');
}
function loadCandidateReviews(context, candidateReviews = []) {
  if (!Array.isArray(candidateReviews) || candidateReviews.length > context.plan.packages.length) fail('invalid candidate review inventory');
  let previous = '', run;
  for (const reference of candidateReviews) {
    keys(reference, ['path', 'sha256'], 'candidate review reference');
    const match = typeof reference.path === 'string' && /^tests\/reports\/native-source-inputs\/([A-Za-z0-9][A-Za-z0-9._-]{0,79})\/candidate-reviews\/([a-f0-9]{64})\.json$/.exec(reference.path);
    if (!match || match[1] === '.' || match[1] === '..' || reference.sha256 !== match[2] || (previous && reference.path <= previous) || (run && match[1] !== run)) fail('invalid, duplicate, unsorted or mixed-run candidate review reference');
    previous = reference.path; run = match[1];
    const data = readSidecar(context, reference.path, reference.sha256, MAX_JSON);
    const envelope = json(data, 'candidate review', true);
    keys(envelope, ['schema', 'payload', 'signature'], 'candidate review envelope');
    const payload = envelope.payload, signature = envelope.signature;
    keys(payload, ['schema', 'sourceInputSha256', 'sourceManifestSha256', 'candidatePlanSha256', 'archive', 'decision', 'scope', 'reviewer', 'files'], 'candidate review payload');
    keys(signature, ['algorithm', 'keyId', 'value'], 'candidate review signature');
    exactArchiveIdentity(payload.archive, 'candidate review archive');
    const planned = context.plan.packages.find(item => item.name === payload.archive.name);
    if (envelope.schema !== 'aura3d.candidate-review-envelope/1' || payload.schema !== 'aura3d.candidate-review/1' ||
        payload.sourceInputSha256 !== context.source.inputDigest || payload.sourceManifestSha256 !== context.source.manifestSha256 ||
        payload.candidatePlanSha256 !== context.plan.reference.sha256 || !sameIdentity(payload.archive, planned)) fail('candidate review does not bind staged source, plan and archive');
    const authority = context.authorities.get(signature.keyId);
    if (signature.algorithm !== 'ed25519' || !authority) fail('untrusted candidate review authority');
    if (typeof signature.value !== 'string' || !/^[A-Za-z0-9+/]{86}==$/.test(signature.value)) fail('invalid candidate review signature');
    const sig = Buffer.from(signature.value, 'base64');
    if (sig.length !== 64 || sig.toString('base64') !== signature.value ||
        !verifySignature(null, Buffer.from(CANDIDATE_DOMAIN + canonical(payload)), authority, sig)) fail('invalid candidate review signature');
    const id = identityKey(payload.archive);
    if (context.candidateReviews.has(id)) fail('duplicate candidate archive review');
    context.candidateReviews.set(id, { payload, reference: { ...reference, keyId: signature.keyId }, runId: run });
  }
}
function candidateEvidence(context, values, blocked, runId) {
  if (!Array.isArray(values) || !values.length || values.length > MAX_ARCHIVES) fail('missing supporting evidence');
  const seen = new Set();
  for (const item of values) {
    keys(item, ['scope', 'path', 'sha256'], 'candidate supporting evidence');
    if (seen.has(item.path) || blocked.includes(item.path)) fail('duplicate or invalid candidate evidence');
    seen.add(item.path);
    if (item.scope === 'source') ref({ path: item.path, sha256: item.sha256 }, context.root, context, 'supporting evidence', blocked);
    else if (item.scope === 'sidecar') {
      if (typeof item.path !== 'string' || !item.path.startsWith(`tests/reports/native-source-inputs/${runId}/candidate-review-evidence/`)) fail('candidate evidence is outside its run-scoped directory');
      readSidecar(context, item.path, item.sha256);
    } else fail('unsupported candidate evidence scope');
  }
}
function reviewArchive(root, context, archive) {
  const identity = { name: archive.manifest.name, version: archive.manifest.version, sha256: archive.sha256, integrity: archive.integrity };
  exactArchiveIdentity(identity, 'actual archive');
  const key = identityKey(identity), cached = context.reviewCache.get(key);
  if (cached) return { ...cached, resolved: archive.resolved };
  const candidate = context.plan.packages.some(item => item.name === identity.name);
  let review, reviewRef, runId;
  if (candidate) {
    const signed = context.candidateReviews.get(key);
    if (!signed) fail(`no trusted digest-bound candidate archive review for ${identity.name}@${identity.version}`);
    review = signed.payload; reviewRef = signed.reference; runId = signed.runId;
  } else {
    const admission = context.entries.get(key);
    if (!admission) fail(`no trusted digest-bound archive admission for ${identity.name}@${identity.version}`);
    const reviewBytes = ref(admission.review, root, context, 'review', [POLICY]);
    if (reviewBytes.length > MAX_JSON) fail('review exceeds byte limit');
    review = json(reviewBytes, 'review', true); reviewRef = admission.review;
    keys(review, ['schema', 'archive', 'decision', 'scope', 'reviewer', 'files'], 'review');
  }
  exactArchiveIdentity(review.archive, 'review archive');
  keys(review.reviewer, ['id', 'kind'], 'reviewer');
  text(review.reviewer.id, 'reviewer identity', 3, 200);
  if (/^(?:unknown|pending|unassigned|fixture|synthetic)$/i.test(review.reviewer.id) || review.reviewer.kind !== 'independent-source-review' ||
      review.schema !== (candidate ? 'aura3d.candidate-review/1' : 'aura3d.archive-review/1') || review.decision !== 'approved' || review.scope !== 'complete-archive' || !sameIdentity(review.archive, identity)) fail('archive review identity or decision mismatch');
  const actual = inspectNpmArchive(archive.bytes).files.map(file => ({ path: file.path, sha256: sha256(file.bytes), size: file.bytes.byteLength })).sort((a, b) => a.path.localeCompare(b.path));
  if (!Array.isArray(review.files) || review.files.length !== actual.length || !actual.length) fail('archive review does not cover every file');
  const files = new Map();
  for (const item of review.files) {
    keys(item, ['path', 'sha256', 'size', 'origin', 'sources', 'evidence', 'rationale'], 'review file');
    sourcePath(item.path, 'archive review file');
    if (files.has(item.path) || !HASH.test(item.sha256 ?? '') || !Number.isSafeInteger(item.size) || item.size < 0) fail('invalid or duplicate reviewed file');
    if (!['source-match', 'reviewed-output'].includes(item.origin)) fail(`unknown file origin: ${item.path}`);
    text(item.rationale, 'file review rationale', 60, 8192);
    const blocked = [POLICY, reviewRef.path];
    const sourceBytes = refs(item.sources, root, context, 'source', blocked);
    const evidenceBlocked = [...blocked, ...item.sources.map(source => source.path)];
    if (candidate) candidateEvidence(context, item.evidence, evidenceBlocked, runId);
    else refs(item.evidence, root, context, 'supporting evidence', evidenceBlocked);
    if (item.origin === 'source-match' && !sourceBytes.some(data => sha256(data) === item.sha256 && data.byteLength === item.size)) fail(`source bytes do not match reviewed file: ${item.path}`);
    files.set(item.path, item);
  }
  for (const file of actual) {
    const record = files.get(file.path);
    if (!record || record.sha256 !== file.sha256 || record.size !== file.size) fail(`review inventory differs from archive: ${file.path}`);
  }
  const reviewed = { ...identity, review: { ...reviewRef }, files: actual };
  context.reviewCache.set(key, reviewed);
  return { ...reviewed, resolved: archive.resolved };
}
function freeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

function inspectAdmission(context, { manifestBytes, lockBytes, archives }, format = 'npm') {
  const manifestData = bytes(manifestBytes, 'manifest'), lockData = bytes(lockBytes, 'lock');
  if (!Array.isArray(archives) || !archives.length || archives.length > MAX_ARCHIVES) fail('archive snapshots are required');
  const byPath = new Map(), inputs = [], resolutions = new Set();
  let total = 0;
  for (const [index, archive] of archives.entries()) {
    keys(archive, ['resolved', 'bytes'], 'archive snapshot');
    text(archive.resolved, 'archive resolution', 1, 8192);
    if (resolutions.has(archive.resolved)) fail('duplicate archive resolution');
    resolutions.add(archive.resolved);
    const data = bytes(archive.bytes, 'archive', 64 * 1024 * 1024);
    total += data.byteLength;
    if (total > MAX_TOTAL) fail('archive snapshots exceed byte limit');
    const path = `snapshot/${index}`;
    byPath.set(path, data);
    inputs.push({ resolved: archive.resolved, path });
  }
  const shared = { archives: inputs, readArchive: path => byPath.get(path), candidatePackages: context.plan.packages };
  const inspection = format === 'npm'
    ? inspectIndependentNpmConsumer({ ...shared, manifest: json(manifestData, 'manifest'), lock: json(lockData, 'lock') })
    : inspectIndependentPnpmConsumer({ ...shared, manifestBytes: manifestData, lockBytes: lockData });
  const reports = inspection.archives.map(archive => reviewArchive(context.root, context, archive));
  const receipt = freeze({
    schema: 'aura3d.archive-admission-receipt/1',
    ...(format === 'pnpm' ? { lockFormat: 'pnpm' } : {}),
    sourceInputSha256: context.source.inputDigest,
    sourceManifest: { path: context.sourceManifestPath, sha256: context.source.manifestSha256 },
    testedOrigin: { commit: context.source.commit, tree: context.source.tree },
    plan: { ...context.plan.reference },
    policy: { path: POLICY, sha256: context.policySha256 },
    manifestSha256: sha256(manifestData), lockSha256: sha256(lockData),
    archives: reports,
    limitations: [
      'This decision relies on the independently trusted policy pin and the substantive independent reviews it references.',
      'Code-complete verification must bind the tested source manifest to the eventual frozen commit.',
      'A digest, source mapping, signature, scan result, or absence of matches alone does not establish independent authorship.'
    ]
  });
  return { receipt, snapshots: inspection.archives.map(item => ({ resolved: item.resolved, bytes: Buffer.from(item.bytes), sha256: item.sha256, integrity: item.integrity })) };
}
function sameContext(current, receipt) {
  return current.plan.reference.sha256 === receipt.plan.sha256 && current.source.inputDigest === receipt.sourceInputSha256 &&
    current.source.manifestSha256 === receipt.sourceManifest.sha256 && current.policySha256 === receipt.policy.sha256;
}

/**
 * Review already-local archive snapshots. The policy is an independently pinned input;
 * this function accepts neither a trust callback nor an external receipt.
 * Later code-complete verification must bind this staged source to the freeze.
 */
export function verifyArchiveAdmission({ root, sourceManifestPath, planPath, candidateReviews = [], ...input }) {
  const context = stagedContext(root, sourceManifestPath, planPath);
  loadCandidateReviews(context, candidateReviews);
  const result = inspectAdmission(context, input), capability = Object.freeze({});
  const sidecars = sidecarIdentities(context);
  assertSidecarsUnchanged(context.root, sidecars);
  capabilities.set(capability, { root: context.root, sourceManifestPath, planPath, sidecars, ...result });
  return { receipt: result.receipt, capability };
}
/** Issue a format-specific capability only after independently parsing the pnpm graph. */
export function verifyPnpmArchiveAdmission({ root, sourceManifestPath, planPath, candidateReviews = [], ...input }) {
  const context = stagedContext(root, sourceManifestPath, planPath);
  loadCandidateReviews(context, candidateReviews);
  const result = inspectAdmission(context, input, 'pnpm'), capability = Object.freeze({});
  const sidecars = sidecarIdentities(context);
  assertSidecarsUnchanged(context.root, sidecars);
  pnpmCapabilities.set(capability, { root: context.root, sourceManifestPath, planPath, sidecars, ...result });
  return { receipt: result.receipt, capability };
}

/**
 * Review a bounded group of graphs with two source validations rather than one
 * per project. Returned receipts are informational and cannot authorize an
 * install; the final source recheck rejects a changed stage during the batch.
 */
function inspectBatch({ root, sourceManifestPath, planPath, consumers, candidateReviews = [] }, format) {
  if (!Array.isArray(consumers) || !consumers.length || consumers.length > 512) fail('invalid admission batch');
  const context = stagedContext(root, sourceManifestPath, planPath), receipts = [];
  loadCandidateReviews(context, candidateReviews);
  let fileCount = 0;
  for (const input of consumers) {
    const result = inspectAdmission(context, input, format);
    fileCount += result.receipt.archives.reduce((sum, archive) => sum + archive.files.length, 0);
    if (fileCount > 500000) fail('admission batch file inventory limit exceeded');
    receipts.push(result.receipt);
  }
  if (!sameContext(stagedContext(context.root, sourceManifestPath, planPath), receipts[0])) fail('source, plan or policy changed during admission batch');
  assertSidecarsUnchanged(context.root, sidecarIdentities(context));
  return receipts;
}
export function verifyArchiveAdmissionBatch(input) { return inspectBatch(input, 'npm'); }
export function verifyPnpmArchiveAdmissionBatch(input) { return inspectBatch(input, 'pnpm'); }

/** Recheck the exact staged context and return fresh copies of the admitted bytes. */
function consume(capabilitiesForFormat, { capability, manifestBytes, lockBytes }) {
  const held = capability && capabilitiesForFormat.get(capability);
  if (!held) fail('invalid admission capability');
  const manifestData = bytes(manifestBytes, 'manifest'), lockData = bytes(lockBytes, 'lock');
  if (sha256(manifestData) !== held.receipt.manifestSha256 || sha256(lockData) !== held.receipt.lockSha256) fail('manifest or lock differs from admitted bytes');
  const current = stagedContext(held.root, held.sourceManifestPath, held.planPath);
  if (!sameContext(current, held.receipt)) fail('source, plan or policy changed after admission');
  assertSidecarsUnchanged(held.root, held.sidecars);
  return held.snapshots.map(item => {
    if (sha256(item.bytes) !== item.sha256 || integrity(item.bytes) !== item.integrity) fail('admitted archive snapshot changed');
    return { resolved: item.resolved, bytes: Uint8Array.from(item.bytes) };
  });
}
export function consumeArchiveAdmission(input) { return consume(capabilities, input); }
export function consumePnpmArchiveAdmission(input) { return consume(pnpmCapabilities, input); }
