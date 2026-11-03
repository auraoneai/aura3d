#!/usr/bin/env node
// Tested-archive retrieval for the 5.0 ACR source pass.
//
// In the image (packed-a, command `artifacts-upload` in source5-run.sh):
//   node tools/remote-acr/source5-artifacts.mjs stage <plan> <report-dir> <out-dir> <run-id>
// copies the candidate plan, every archive the plan names, and the packed-stage
// reports into <out-dir> with an `artifact-index.json`; upload-artifacts.mjs
// then sends <out-dir> to `source5/<run-id>/artifacts/` in the run container.
//
// On the Mac (tools/remote-acr/run-source5.sh, after download):
//   node tools/remote-acr/source5-artifacts.mjs verify <dir> <repo-root> <commit|-> <lock-sha256|-> <input-digest|-> <out-json>
// re-hashes every downloaded archive against the plan (SHA-256 and SHA-512
// integrity), checks the plan against the staged candidate identity, and
// writes the result merged into source-report.json as `artifacts`.
//
// packed-b (command `consumers-upload`): `stage-consumers <run-id> <out-dir>`
// packs its consumer source reports and the files they reference; packed-c
// (command `examples-upload`): `stage-examples` packs the packed example source
// report and its retained projects. On the Mac `verify-consumers` /
// `verify-examples` re-hash and extract them into <run>/artifacts/consumers/ and
// <run>/artifacts/examples/ (recorded as `artifacts.consumers` / `artifacts.examples`).
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, dirname, join, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

export const ARTIFACT_INDEX_SCHEMA = 'aura3d.source5-artifacts/1';
export const ARTIFACT_INDEX_NAME = 'artifact-index.json';
export const PLAN_NAME = 'candidate-plan.json';
/** Packed-stage reports retrieved with the archives (all written by packed-a). */
export const PACKED_REPORTS = Object.freeze(['api-diff.json', 'public-api.md', 'baseline-manifest.json']);
const ARCHIVE_NAME = /^[A-Za-z0-9][A-Za-z0-9._+-]{0,200}\.tgz$/;
const HEX64 = /^[a-f0-9]{64}$/;

const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const sha512Integrity = bytes => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
const regularFile = path => { try { const s = lstatSync(path); return s.isFile() && !s.isSymbolicLink(); } catch { return false; } };

/** Plan packages with their archive file names; throws on an incomplete or ambiguous plan. */
export function planArchives(plan) {
  if (plan?.schema !== 'aura3d-release-plan/1.0' || plan.packOnly !== true || !Array.isArray(plan.packages) || !plan.packages.length) {
    throw new Error('candidate plan is not a pack-only aura3d release plan');
  }
  const seen = new Set();
  return plan.packages.map(entry => {
    const { name, version, tarball, sha256: digest, integrity } = entry ?? {};
    const file = typeof tarball === 'string' ? basename(tarball) : '';
    if (!name || !version || !ARCHIVE_NAME.test(file) || !HEX64.test(digest ?? '') || !/^sha512-[A-Za-z0-9+/]+=*$/.test(integrity ?? '')) {
      throw new Error(`candidate plan entry has no packed archive: ${name ?? '<unnamed>'}`);
    }
    if (seen.has(file)) throw new Error(`duplicate archive file name in plan: ${file}`);
    seen.add(file);
    return { name, version, planTarball: tarball, file, sha256: digest, integrity };
  });
}

/** In-image: copy plan, archives and packed reports into `outDir` with an index. */
export function stageArtifacts({ root, planPath, reportDir, outDir, runId }) {
  const planBytes = readFileSync(resolve(root, planPath));
  const archives = planArchives(JSON.parse(planBytes));
  mkdirSync(join(outDir, 'tarballs'), { recursive: true });
  mkdirSync(join(outDir, 'reports'), { recursive: true });
  writeFileSync(join(outDir, PLAN_NAME), planBytes, { flag: 'wx' });
  const indexArchives = archives.map(archive => {
    const source = resolve(root, archive.planTarball);
    if (!regularFile(source)) throw new Error(`packed archive is missing: ${archive.planTarball}`);
    const bytes = readFileSync(source);
    if (sha256(bytes) !== archive.sha256 || sha512Integrity(bytes) !== archive.integrity) throw new Error(`packed archive differs from its plan entry: ${archive.planTarball}`);
    copyFileSync(source, join(outDir, 'tarballs', archive.file));
    return { name: archive.name, version: archive.version, planTarball: archive.planTarball, path: `tarballs/${archive.file}`, sha256: archive.sha256, size: bytes.length };
  });
  const reports = PACKED_REPORTS.map(name => {
    const source = join(reportDir, name);
    if (!regularFile(source)) return { name, missing: true };
    const bytes = readFileSync(source);
    copyFileSync(source, join(outDir, 'reports', name));
    return { name, path: `reports/${name}`, sha256: sha256(bytes), size: bytes.length };
  });
  const index = { schema: ARTIFACT_INDEX_SCHEMA, runId, plan: { path: PLAN_NAME, sha256: sha256(planBytes) }, archives: indexArchives, reports };
  writeFileSync(join(outDir, ARTIFACT_INDEX_NAME), `${JSON.stringify(index, null, 2)}\n`, { flag: 'wx' });
  return index;
}

function listFiles(dir, prefix = '') {
  const out = [];
  for (const entry of readdirSync(join(dir, prefix), { withFileTypes: true })) {
    const path = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) out.push(...listFiles(dir, path));
    else out.push(path);
  }
  return out;
}

/**
 * Mac side: verify a downloaded artifact directory. Every archive is re-hashed
 * against the plan itself (not only the index); the plan must name the staged
 * candidate (`expected.commit`, `expected.lockfileSha256`, and
 * `expected.inputDigest` when given). Returns a report; `ok` is false with
 * `problems` when anything is missing, extra or different.
 */
export function verifyDownloadedArtifacts({ dir, root = process.cwd(), expected = {} }) {
  const problems = [], rel = path => relative(root, path).split(sep).join('/');
  const result = { schema: ARTIFACT_INDEX_SCHEMA, ok: false, dir: rel(dir), plan: null, archives: [], reports: [], problems };
  let index, planBytes, plan, archives;
  try { index = JSON.parse(readFileSync(join(dir, ARTIFACT_INDEX_NAME), 'utf8')); } catch { problems.push(`${ARTIFACT_INDEX_NAME} missing or unreadable`); return result; }
  if (index?.schema !== ARTIFACT_INDEX_SCHEMA || !Array.isArray(index.archives) || !Array.isArray(index.reports)) { problems.push('artifact index has an unknown schema'); return result; }
  try { planBytes = readFileSync(join(dir, PLAN_NAME)); plan = JSON.parse(planBytes); } catch { problems.push(`${PLAN_NAME} missing or unreadable`); return result; }
  const planSha = sha256(planBytes);
  result.plan = { localPath: rel(join(dir, PLAN_NAME)), sha256: planSha };
  if (index.plan?.sha256 !== planSha) problems.push('candidate plan bytes differ from the uploaded index');
  try { archives = planArchives(plan); } catch (error) { problems.push(error.message); return result; }
  if (expected.commit && plan.source?.commit !== expected.commit) problems.push(`plan source commit ${plan.source?.commit} is not the candidate ${expected.commit}`);
  if (expected.lockfileSha256 && (plan.lockfileSha256 !== expected.lockfileSha256 || plan.source?.lockfileSha256 !== expected.lockfileSha256)) problems.push('plan lockfile digest is not the candidate lockfile');
  if (expected.inputDigest && plan.source?.inputDigest !== expected.inputDigest) problems.push('plan source input digest is not the staged manifest input digest');
  const referenced = new Set([ARTIFACT_INDEX_NAME, PLAN_NAME]);
  for (const archive of archives) {
    const path = `tarballs/${archive.file}`, local = join(dir, path);
    referenced.add(path);
    const indexed = index.archives.find(entry => entry.name === archive.name);
    if (!indexed || indexed.path !== path || indexed.sha256 !== archive.sha256) problems.push(`index entry for ${archive.name} does not match the plan`);
    if (!regularFile(local)) { problems.push(`archive not downloaded: ${path}`); continue; }
    const bytes = readFileSync(local), actual = sha256(bytes);
    const verified = actual === archive.sha256 && sha512Integrity(bytes) === archive.integrity;
    if (!verified) problems.push(`archive bytes differ from the plan: ${path}`);
    result.archives.push({ name: archive.name, version: archive.version, planTarball: archive.planTarball, localPath: rel(local), sha256: actual, size: bytes.length, verified });
  }
  if (index.archives.length !== archives.length) problems.push(`index lists ${index.archives.length} archives, plan has ${archives.length}`);
  for (const name of PACKED_REPORTS) {
    const indexed = index.reports.find(entry => entry?.name === name);
    if (!indexed) { problems.push(`index has no entry for report ${name}`); continue; }
    if (indexed.missing) { result.reports.push({ name, missing: true }); problems.push(`report not produced in the image: ${name}`); continue; }
    const path = `reports/${name}`, local = join(dir, path);
    referenced.add(path);
    if (indexed.path !== path || !regularFile(local)) { problems.push(`report not downloaded: ${path}`); continue; }
    const actual = sha256(readFileSync(local)), verified = actual === indexed.sha256;
    if (!verified) problems.push(`report bytes differ from the index: ${path}`);
    result.reports.push({ name, localPath: rel(local), sha256: actual, verified });
  }
  for (const path of existsSync(dir) ? listFiles(dir) : []) if (!referenced.has(path)) problems.push(`unexpected downloaded file: ${path}`);
  result.ok = problems.length === 0;
  return result;
}

// ---- packed-b consumer reports / packed-c example reports -----------------------
// Two bundle kinds, same format. `consumers` (packed-b): the clean-install and
// consumer-matrix source reports with the projects, logs and dependency archives
// they reference. `examples` (packed-c): the packed example source report with
// its retained wrappers, builds and logs. The acceptance consumer phase
// re-validates and restores from those exact files. In the image,
// `stage-consumers` / `stage-examples` pack the kind's run directories into
// <= CONSUMER_CHUNK_BYTES chunks plus `consumer-index.json` (per-file SHA-256,
// offsets); source5-run.sh uploads one chunk per upload-artifacts.mjs call, so
// each call stays under its 512 MiB limit. On the Mac, `verify-consumers` /
// `verify-examples` re-hash every chunk and file and extract the files under
// their job paths into <run>/artifacts/consumers/ or <run>/artifacts/examples/.
export const CONSUMERS_SCHEMA = 'aura3d.source5-consumers/1';
export const CONSUMER_INDEX_NAME = 'consumer-index.json';
export const CONSUMER_CHUNK_BYTES = 128 * 1024 * 1024;
/** Total retained consumer bytes (each upload-artifacts.mjs call carries one <= 128 MiB chunk). */
export const CONSUMER_MAX_BYTES = 3 * 1024 * 1024 * 1024;
export const CONSUMER_MAX_FILES = 50000;
const RUN_ID = /^[a-zA-Z0-9][a-zA-Z0-9_-]{0,79}$/;
const CHUNK_NAME = /^bundle-\d{3}\.bin$/;
export const BUNDLE_KINDS = Object.freeze(['consumers', 'examples']);
const kindOf = kind => { if (!BUNDLE_KINDS.includes(kind)) throw new Error(`unknown consumer bundle kind ${kind}`); return kind; };
/** Job repository-relative directories one bundle kind retains for a run (consumers: packed-b, examples: packed-c). */
export const consumerRoots = (runId, kind = 'consumers') => (kindOf(kind) === 'examples'
  ? [`tests/reports/native-examples-catalog/${runId}`]
  : [`tests/reports/native-consumers/${runId}`, `tests/reports/native-consumer-matrix/${runId}`]);
/** The source reports a bundle kind carries and the gate binds (field name -> job path). */
export const consumerReportPaths = (runId, kind = 'consumers') => (kindOf(kind) === 'examples'
  ? { examplesSourceReport: `tests/reports/native-examples-catalog/${runId}/examples-source.json` }
  : { sourceConsumerReport: `tests/reports/native-consumers/${runId}/source.json`, matrixSourceReport: `tests/reports/native-consumers/${runId}/matrix-source.json` });

const safeJobPath = (path, runId, kind) => typeof path === 'string' && !path.includes('\\') && !/[\x00-\x1f\x7f]/.test(path)
  && path.split('/').every(part => part && part !== '.' && part !== '..')
  && consumerRoots(runId, kind).some(root => path.startsWith(`${root}/`));

/** In-image: pack one bundle kind's run directories into chunks + index under `outDir`. */
export function stageConsumers({ root, runId, outDir, kind = 'consumers', chunkBytes = CONSUMER_CHUNK_BYTES, maxBytes = CONSUMER_MAX_BYTES }) {
  if (!RUN_ID.test(runId ?? '')) throw new Error('invalid run id');
  const reports = consumerReportPaths(runId, kind);
  for (const [field, path] of Object.entries(reports)) if (!regularFile(join(root, path))) throw new Error(`${field} was not produced: ${path}`);
  const files = [];
  for (const dir of consumerRoots(runId, kind)) {
    const absolute = join(root, dir);
    let stat;
    try { stat = lstatSync(absolute); } catch { throw new Error(`consumer report directory missing: ${dir}`); }
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error(`consumer report directory is not a directory: ${dir}`);
    for (const path of listEntries(root, dir)) files.push(path);
  }
  files.sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  if (files.length > CONSUMER_MAX_FILES) throw new Error(`consumer reports have ${files.length} files (limit ${CONSUMER_MAX_FILES})`);
  mkdirSync(outDir, { recursive: true });
  const chunks = [], entries = [];
  let chunk = null, total = 0;
  const closeChunk = () => {
    if (!chunk) return;
    const bytes = Buffer.concat(chunk.parts);
    writeFileSync(join(outDir, chunk.name), bytes, { flag: 'wx' });
    chunks.push({ path: chunk.name, sha256: sha256(bytes), size: bytes.length });
    chunk = null;
  };
  for (const path of files) {
    const bytes = readFileSync(join(root, path));
    if (bytes.length > chunkBytes) throw new Error(`consumer file exceeds the chunk size: ${path}`);
    total += bytes.length;
    if (total > maxBytes) throw new Error(`consumer reports exceed ${maxBytes} bytes`);
    if (chunk && chunk.size + bytes.length > chunkBytes) closeChunk();
    if (!chunk) chunk = { name: `bundle-${String(chunks.length).padStart(3, '0')}.bin`, parts: [], size: 0 };
    entries.push({ path, sha256: sha256(bytes), size: bytes.length, chunk: chunk.name, offset: chunk.size });
    chunk.parts.push(bytes); chunk.size += bytes.length;
  }
  closeChunk();
  const byPath = new Map(entries.map(entry => [entry.path, entry]));
  const index = {
    schema: CONSUMERS_SCHEMA, kind, runId, roots: consumerRoots(runId, kind),
    reports: Object.fromEntries(Object.entries(reports).map(([field, path]) => [field, { path, sha256: byPath.get(path).sha256 }])),
    chunks, files: entries, totalBytes: total
  };
  writeFileSync(join(outDir, CONSUMER_INDEX_NAME), `${JSON.stringify(index, null, 2)}\n`, { flag: 'wx' });
  return index;
}

/** Repository-relative regular files under `dir`; any symlink or special file refuses. */
function listEntries(root, dir) {
  const out = [];
  for (const entry of readdirSync(join(root, dir), { withFileTypes: true })) {
    const path = `${dir}/${entry.name}`;
    if (entry.isSymbolicLink()) throw new Error(`consumer reports contain a symlink: ${path}`);
    if (entry.isDirectory()) out.push(...listEntries(root, path));
    else if (entry.isFile()) out.push(path);
    else throw new Error(`consumer reports contain a special file: ${path}`);
  }
  return out;
}

/**
 * Mac side: verify the downloaded consumer chunks in `dir` and extract every
 * indexed file to `dest/<job path>` (plus `dest/consumer-index.json`). Returns
 * the record merged into source-report.json as `artifacts.consumers`.
 */
export function verifyDownloadedConsumers({ dir, dest, root = process.cwd(), runId, kind = 'consumers' }) {
  const problems = [], rel = path => relative(root, path).split(sep).join('/');
  kindOf(kind);
  const result = { schema: CONSUMERS_SCHEMA, kind, ok: false, runId, dir: rel(dest), index: null,
    ...Object.fromEntries(Object.keys(consumerReportPaths('x', kind)).map(field => [field, null])),
    files: 0, bytes: 0, problems };
  if (!RUN_ID.test(runId ?? '')) { problems.push('invalid run id'); return result; }
  let indexBytes, index;
  try { indexBytes = readFileSync(join(dir, CONSUMER_INDEX_NAME)); index = JSON.parse(indexBytes); } catch { problems.push(`${CONSUMER_INDEX_NAME} missing or unreadable`); return result; }
  if (index?.schema !== CONSUMERS_SCHEMA || index.kind !== kind || index.runId !== runId || !Array.isArray(index.chunks) || !Array.isArray(index.files)) { problems.push('consumer index has an unknown schema, another kind or another run id'); return result; }
  if (existsSync(dest) && readdirSync(dest).length) { problems.push(`extraction directory is not empty: ${rel(dest)}`); return result; }
  const chunks = new Map();
  for (const chunk of index.chunks) {
    if (!CHUNK_NAME.test(chunk?.path ?? '') || chunks.has(chunk.path)) { problems.push(`invalid chunk entry ${JSON.stringify(chunk?.path)}`); continue; }
    if (!regularFile(join(dir, chunk.path))) { problems.push(`chunk not downloaded: ${chunk.path}`); continue; }
    const bytes = readFileSync(join(dir, chunk.path));
    if (sha256(bytes) !== chunk.sha256 || bytes.length !== chunk.size) { problems.push(`chunk bytes differ from the index: ${chunk.path}`); continue; }
    chunks.set(chunk.path, bytes);
  }
  const expected = new Set([CONSUMER_INDEX_NAME, ...index.chunks.map(chunk => chunk?.path)]);
  for (const path of existsSync(dir) ? listFiles(dir) : []) if (!expected.has(path)) problems.push(`unexpected downloaded file: ${path}`);
  if (problems.length) return result;
  const seen = new Set(), extracted = [];
  for (const file of index.files) {
    if (!safeJobPath(file?.path, runId, kind) || seen.has(file.path)) { problems.push(`unsafe or duplicate consumer path ${JSON.stringify(file?.path)}`); continue; }
    seen.add(file.path);
    const bytes = chunks.get(file.chunk);
    if (!bytes || !Number.isSafeInteger(file.offset) || !Number.isSafeInteger(file.size) || file.offset < 0 || file.size < 0 || file.offset + file.size > bytes.length) { problems.push(`consumer file is outside its chunk: ${file.path}`); continue; }
    const data = bytes.subarray(file.offset, file.offset + file.size);
    if (sha256(data) !== file.sha256) { problems.push(`consumer file bytes differ from the index: ${file.path}`); continue; }
    extracted.push({ path: file.path, data });
  }
  for (const [field, path] of Object.entries(consumerReportPaths(runId, kind))) {
    const entry = index.files.find(file => file?.path === path);
    if (!entry || index.reports?.[field]?.path !== path || index.reports[field].sha256 !== entry.sha256) problems.push(`${field} is not retained: ${path}`);
  }
  if (problems.length) return result;
  mkdirSync(dest, { recursive: true });
  for (const { path, data } of extracted) {
    const local = join(dest, path);
    mkdirSync(dirname(local), { recursive: true });
    writeFileSync(local, data, { flag: 'wx' });
  }
  writeFileSync(join(dest, CONSUMER_INDEX_NAME), indexBytes, { flag: 'wx' });
  result.index = { localPath: rel(join(dest, CONSUMER_INDEX_NAME)), sha256: sha256(indexBytes) };
  for (const [field, path] of Object.entries(consumerReportPaths(runId, kind))) {
    result[field] = { localPath: rel(join(dest, path)), jobPath: path, sha256: index.reports[field].sha256 };
  }
  result.files = extracted.length;
  result.bytes = extracted.reduce((sum, file) => sum + file.data.length, 0);
  result.ok = true;
  return result;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, ...args] = process.argv.slice(2);
  try {
    if (command === 'stage' && args.length === 4) {
      const [planPath, reportDir, outDir, runId] = args;
      const index = stageArtifacts({ root: process.cwd(), planPath, reportDir, outDir, runId });
      console.log(`[artifacts] staged plan + ${index.archives.length} archives + ${index.reports.filter(r => !r.missing).length}/${PACKED_REPORTS.length} reports`);
      const missing = index.reports.filter(r => r.missing).map(r => r.name);
      if (missing.length) { console.error(`[artifacts] packed reports missing: ${missing.join(', ')}`); process.exitCode = 1; }
    } else if (command === 'verify' && args.length === 6) {
      const [dir, root, commit, lockfileSha256, inputDigest, outJson] = args;
      const known = value => (value && value !== '-' ? value : undefined);
      const result = verifyDownloadedArtifacts({ dir: resolve(dir), root: resolve(root), expected: { commit: known(commit), lockfileSha256: known(lockfileSha256), inputDigest: known(inputDigest) } });
      writeFileSync(outJson, `${JSON.stringify(result, null, 2)}\n`);
      console.log(`   artifacts  : ${result.ok ? 'verified' : 'NOT VERIFIED'} (${result.archives.filter(a => a.verified).length}/${result.archives.length} archives)`);
      for (const p of result.problems) console.log(`   artifact problem: ${p}`);
      if (!result.ok) process.exitCode = 1;
    } else if ((command === 'stage-consumers' || command === 'stage-examples') && args.length === 2) {
      const [runId, outDir] = args, kind = command === 'stage-examples' ? 'examples' : 'consumers';
      const index = stageConsumers({ root: process.cwd(), runId, outDir, kind });
      console.log(`[${kind}] staged ${index.files.length} files (${index.totalBytes} bytes) in ${index.chunks.length} chunks`);
    } else if ((command === 'verify-consumers' || command === 'verify-examples') && args.length === 5) {
      const [dir, dest, root, runId, outJson] = args, kind = command === 'verify-examples' ? 'examples' : 'consumers';
      const result = verifyDownloadedConsumers({ dir: resolve(dir), dest: resolve(dest), root: resolve(root), runId, kind });
      writeFileSync(outJson, `${JSON.stringify(result, null, 2)}\n`);
      console.log(`   ${kind.padEnd(10)} : ${result.ok ? 'verified' : 'NOT VERIFIED'} (${result.files} files)`);
      for (const p of result.problems) console.log(`   ${kind} problem: ${p}`);
      if (!result.ok) process.exitCode = 1;
    } else {
      throw new Error('usage: source5-artifacts.mjs stage <plan> <report-dir> <out-dir> <run-id> | verify <dir> <repo-root> <commit|-> <lock-sha256|-> <input-digest|-> <out-json> | stage-consumers|stage-examples <run-id> <out-dir> | verify-consumers|verify-examples <download-dir> <dest-dir> <repo-root> <run-id> <out-json>');
    }
  } catch (error) {
    console.error(`[artifacts] ${error.message}`);
    process.exitCode = 1;
  }
}
