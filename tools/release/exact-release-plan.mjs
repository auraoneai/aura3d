import { assertReleaseInventory } from './release-inventory.mjs';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, existsSync, realpathSync } from 'node:fs';
import { resolve, relative, isAbsolute, sep } from 'node:path';
import { assertCommittedReleaseSource, bindSourceIdentityToCommit, gitSourceInputDigest, sourceIdentity } from './source-identity.mjs';
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
function localPath(root, path) {
  if (typeof path !== 'string' || !path || isAbsolute(path) || path.includes('\\') || path.split('/').some(part => !part || part === '.' || part === '..')) throw new Error(`Invalid candidate archive path ${path}`);
  const absolute = resolve(root, path), real = realpathSync(absolute), base = realpathSync(root);
  if (!real.startsWith(base + sep)) throw new Error(`Candidate archive escapes source root: ${path}`);
  return absolute;
}
export function loadValidatedReleasePlan(root = process.cwd(), path = process.env.A3D_RELEASE_PLAN) {
  if (!path) return null;
  root = resolve(root);
  const absolute = resolve(root, path), bytes = readFileSync(absolute), plan = JSON.parse(bytes);
  // An acceptance image is built from a staged context without .git (and without the source manifest), so the
  // commit/tree/fingerprint of the checkout cannot be recomputed there. The plan's identity is still bound by its
  // SHA-256 in the validated code-complete gate (callers check reference.sha256 against the gate), and every
  // archive hash/integrity below is verified, so only the git-derived source comparison is skipped.
  const gitless = !process.env.AURA3D_SOURCE_MANIFEST && !existsSync(resolve(root, '.git'));
  const source = gitless ? null : sourceIdentity(root);
  if (plan.schema !== 'aura3d-release-plan/1.0' || !plan.source || !Array.isArray(plan.packages)) throw new Error('Invalid exact release plan');
  const sourceMatches = gitless || Object.keys(source).every(key => plan.source[key] === source[key]) &&
    (!plan.source.inputDigest || !!process.env.AURA3D_SOURCE_MANIFEST || gitSourceInputDigest(root) === plan.source.inputDigest);
  if (!sourceMatches) {
    // A code-complete commit can follow the source run. Its implementation
    // digest and every archive must still match the tested staged candidate.
    if (process.env.AURA3D_SOURCE_MANIFEST || !plan.source.inputDigest) throw new Error('Exact release source mismatch');
    bindSourceIdentityToCommit(root, plan.source, plan.packages.map(p => ({ path: p.tarball, sha256: p.sha256 })), source.commit);
  }
  const manifestPaths = ['package.json', ...readdirSync(resolve(root, 'packages')).map(name => `packages/${name}/package.json`).filter(p => existsSync(resolve(root, p)))];
  const manifests = manifestPaths.map(p => JSON.parse(readFileSync(resolve(root, p), 'utf8'))).filter(p => p.private !== true);
  const expected = assertReleaseInventory(plan.version, manifests.map(p => p.name), plan.inventoryId);
  assertReleaseInventory(plan.version, plan.packages.map(p => p.name), plan.inventoryId);
  if (plan.packageCount !== expected.length || plan.expectedPackageCount !== expected.length) throw new Error('Exact release plan count mismatch');
  for (const manifest of manifests) {
    const candidate = plan.packages.find(p => p.name === manifest.name);
    if (!candidate || candidate.version !== manifest.version || candidate.version !== plan.version) throw new Error(`Exact release version mismatch ${manifest.name}`);
    const data = readFileSync(localPath(root, candidate.tarball));
    if (hash(data) !== candidate.sha256 || `sha512-${createHash('sha512').update(data).digest('base64')}` !== candidate.integrity) throw new Error(`Exact archive mismatch ${candidate.name}`);
  }
  return { ...plan, reference: { path: relative(root, absolute), sha256: hash(bytes) } };
}
/** Require a candidate to match the actual frozen checkout, even if a staging
 * manifest environment variable is still present in the caller's process. */
export function bindReleasePlanToCurrentCommit(root, plan) {
  root = resolve(root);
  assertCommittedReleaseSource(root);
  const current = sourceIdentity(root, null);
  if (plan.source?.inputDigest) return bindSourceIdentityToCommit(root, plan.source, plan.packages.map(p => ({ path: p.tarball, sha256: p.sha256 })), current.commit);
  if (!plan.source || Object.keys(current).some(key => plan.source[key] !== current[key])) throw new Error('Release plan does not identify the frozen checkout');
  return { schema: 'aura3d.source-freeze-binding/legacy', freeze: { commit: current.commit, tree: current.tree }, fingerprint: current.fingerprint, lockfileSha256: current.lockfileSha256 };
}
export function inspectInstalledRelease(root, project, plan) {
  const lock = JSON.parse(readFileSync(resolve(project, 'package-lock.json'), 'utf8'));
  const observed = [];
  for (const [path, p] of Object.entries(lock.packages ?? {})) {
    const candidate = plan.packages.find(entry => path.endsWith(`node_modules/${entry.name}`));
    if (!candidate) continue;
    const installed = JSON.parse(readFileSync(resolve(project, path, 'package.json'), 'utf8'));
    if (installed.version !== candidate.version || p.integrity !== candidate.integrity) throw new Error(`Installed archive identity mismatch ${path}`);
    observed.push({ name: candidate.name, version: installed.version, integrity: p.integrity, resolved: p.resolved, tarball: candidate.tarball, sha256: candidate.sha256 });
  }
  if (!observed.length) throw new Error('No exact release packages observed in installed lock');
  return { project: relative(root, project), lockfileSha256: hash(readFileSync(resolve(project, 'package-lock.json'))), packages: observed };
}
