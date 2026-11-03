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
import { createHash } from 'node:crypto';
import { copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { basename, join, relative, resolve, sep } from 'node:path';
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
    } else {
      throw new Error('usage: source5-artifacts.mjs stage <plan> <report-dir> <out-dir> <run-id> | verify <dir> <repo-root> <commit|-> <lock-sha256|-> <input-digest|-> <out-json>');
    }
  } catch (error) {
    console.error(`[artifacts] ${error.message}`);
    process.exitCode = 1;
  }
}
