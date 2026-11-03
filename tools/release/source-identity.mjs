import { createHash } from 'node:crypto';
import { lstatSync, readFileSync, readlinkSync, readdirSync, realpathSync } from 'node:fs';
import { dirname, isAbsolute, relative, resolve, sep } from 'node:path';
import { execFileSync } from 'node:child_process';

// Source jobs stage exactly this input set. Administrative records travel in the
// manifest separately so updating the ledger/acceptance notes cannot silently
// change the candidate code identity; their bytes are still verified.
const excludedSegments = new Set(['.git', 'node_modules', 'dist', 'dist-examples', 'coverage', 'test-results', '.cache', '.pnpm-store', '.goal', '.orchestrate', '.vercel', '.wrangler']);
const administrativePaths = new Set(['docs/prds/aura3d-native-capability-ledger.json', 'docs/prds/aura3d-native-acceptance.md']);
const excludedPaths = new Set([
  '.native-source-manifest.json', 'BUNDLE_SIZES.md',
  'muse3jsparity-3.0.1-PRD.md', 'muse3jsparity-3.0.1-FINISH-PLAN.md',
  'muse3jsparity-3.0.1-CLOSEOUT-PLAN.md', 'docs/project/release-artifacts.json',
  'docs/project/reviews/muse3jsparity-301-combined-source-dispositions.json',
  'benchmark/context/muse3jsparity-r185-matrix.json'
]);
export const isAdministrativeSource = path => administrativePaths.has(path);
export const isSourceInput = path => {
  if (!path || typeof path !== 'string' || isAbsolute(path) || path.includes('\\')) return false;
  const parts = path.split('/');
  if (parts.some(part => !part || part === '.' || part === '..' || excludedSegments.has(part))) return false;
  const name = parts.at(-1);
  if (excludedPaths.has(path) || isAdministrativeSource(path)
    || /^(tests\/reports|release-artifacts|tests\/tooling-calibration)(\/|$)/.test(path)
    || ['.npmrc', '.pypirc', '.DS_Store'].includes(name)
    || (/^\.env(?:\.|$)/.test(name) && name !== '.env.example' && name !== '.env.sample')
    || /\.(?:pem|p12|pfx|key)$/i.test(name)) return false;
  return true;
};
const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const gitAt = root => (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }).trim();
const modeOf = stat => stat.isSymbolicLink() ? '120000' : stat.isFile() ? ((stat.mode & 0o111) ? '100755' : '100644') : null;
const inside = (root, path) => path === root || path.startsWith(root + sep);

function bytesForPath(root, path) {
  const absolute = resolve(root, path);
  const stat = lstatSync(absolute);
  const mode = modeOf(stat);
  if (!mode) throw new Error(`Unsupported source input ${path}`);
  if (stat.isSymbolicLink()) {
    const target = readlinkSync(absolute);
    if (isAbsolute(target) || !inside(root, resolve(dirname(absolute), target))) throw new Error(`Source symlink escapes root: ${path}`);
    // Resolve each existing ancestor, even for dangling links, so an in-root
    // link cannot hide an escape through another symlinked directory.
    assertBoundedSymlinkTarget(root, absolute, target);
    return { type: 'symlink', mode, bytes: Buffer.from(target), fingerprintBytes: `<symlink:${target}>` };
  }
  const bytes = readFileSync(absolute);
  return { type: 'file', mode, bytes, fingerprintBytes: bytes };
}
function assertBoundedSymlinkTarget(root, absolute, target) {
  let destination = resolve(dirname(absolute), target);
  for (let hops = 0; hops < 40; hops++) {
    if (!inside(root, destination)) throw new Error(`Source symlink escapes root: ${relative(root, absolute)}`);
    const parts = relative(root, destination).split(sep).filter(Boolean);
    let current = root, expanded = false;
    for (let i = 0; i < parts.length; i++) {
      current = resolve(current, parts[i]);
      let stat;
      try { stat = lstatSync(current); } catch (error) { if (error?.code === 'ENOENT') return; throw error; }
      if (stat.isSymbolicLink()) {
        const link = readlinkSync(current);
        if (isAbsolute(link)) throw new Error(`Source symlink escapes root: ${relative(root, absolute)}`);
        destination = resolve(dirname(current), link, ...parts.slice(i + 1));
        expanded = true;
        break;
      }
    }
    if (!expanded) return;
  }
  throw new Error(`Source symlink cycle: ${relative(root, absolute)}`);
}
function fingerprint(root, paths) {
  const hash = createHash('sha256');
  for (const path of [...paths].sort()) hash.update(path).update('\0').update(bytesForPath(root, path).fingerprintBytes).update('\0');
  return hash.digest('hex');
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
export const sourceManifestInputDigest = entries => sha256(canonical(entries));
function walk(root, dir = root, found = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const absolute = resolve(dir, entry.name);
    const path = relative(root, absolute).split(sep).join('/');
    if (entry.isDirectory()) {
      if (!excludedSegments.has(entry.name) && !/^(tests\/reports|release-artifacts|tests\/tooling-calibration)$/.test(path)) walk(root, absolute, found);
    } else if (isSourceInput(path) || isAdministrativeSource(path)) found.push(path);
  }
  return found;
}

/** Verify the source-job manifest and all bytes, without relying on a .git directory. */
export function stagedSourceIdentity(root, manifestPath) {
  root = resolve(root);
  const manifestBytes = readFileSync(resolve(root, manifestPath));
  const manifest = JSON.parse(manifestBytes);
  if (manifest.schema !== 'aura3d.native-source-manifest/1' || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(manifest.origin?.commit ?? '') || !/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/.test(manifest.origin?.tree ?? '') || !Array.isArray(manifest.files) || manifest.files.length === 0) throw new Error('Invalid staged source manifest');
  const administrative = manifest.administrativeFiles ?? [];
  if (!Array.isArray(administrative)) throw new Error('Invalid administrative source entries');
  const seen = new Set();
  for (const [entries, permitted] of [[manifest.files, isSourceInput], [administrative, isAdministrativeSource]]) {
    let previous = '';
    for (const entry of entries) {
      const { path, type, mode, sha256: expected } = entry ?? {};
      if (!permitted(path) || (previous && path <= previous) || seen.has(path) || !/^[a-f0-9]{64}$/.test(expected ?? '')) throw new Error(`Invalid or duplicate staged source path: ${path}`);
      previous = path;
      seen.add(path);
      let actual;
      try { actual = bytesForPath(root, path); } catch (error) { throw new Error(`Invalid or missing staged source ${path}: ${error.message}`); }
      if (type !== actual.type || mode !== actual.mode || expected !== sha256(actual.bytes)) throw new Error(`Staged source bytes or mode mismatch: ${path}`);
    }
  }
  const undeclared = walk(root).filter(path => !seen.has(path));
  if (undeclared.length) throw new Error(`Undeclared staged source: ${undeclared.slice(0, 20).join(', ')}`);
  const inputDigest = sourceManifestInputDigest(manifest.files);
  if (inputDigest !== manifest.inputDigest) throw new Error('Staged source manifest input digest mismatch');
  const lockEntry = manifest.files.find(entry => entry.path === 'pnpm-lock.yaml');
  if (!lockEntry || lockEntry.sha256 !== manifest.lockfileSha256) throw new Error('Staged lockfile identity mismatch');
  return { commit: manifest.origin.commit, tree: manifest.origin.tree, lockfileSha256: lockEntry.sha256, fingerprint: fingerprint(root, manifest.files.map(entry => entry.path)), inputDigest, manifestSha256: sha256(manifestBytes) };
}

function gitSourceIdentity(root) {
  const git = gitAt(root);
  const paths = gitSourcePaths(root);
  return { commit: git('rev-parse', 'HEAD'), tree: git('rev-parse', 'HEAD^{tree}'), lockfileSha256: sha256(readFileSync(resolve(root, 'pnpm-lock.yaml'))), fingerprint: fingerprint(resolve(root), paths) };
}
function gitSourcePaths(root) {
  return [...new Set(gitAt(root)('ls-files', '-z', '--cached', '--others', '--exclude-standard').split('\0').filter(isSourceInput))]
    .filter(path => { try { lstatSync(resolve(root, path)); return true; } catch { return false; } });
}
export function gitSourceInputDigest(root) {
  root = resolve(root);
  const entries = gitSourcePaths(root).sort().map(path => {
    const entry = bytesForPath(root, path);
    return { path, type: entry.type, mode: entry.mode, sha256: sha256(entry.bytes) };
  });
  return sourceManifestInputDigest(entries);
}
export function sourceIdentity(root, manifestPath = process.env.AURA3D_SOURCE_MANIFEST) {
  return manifestPath ? stagedSourceIdentity(root, manifestPath) : gitSourceIdentity(root);
}

/** A Git tag can identify only committed source; dirty-source candidate receipts cannot authorize publication. */
export function assertCommittedReleaseSource(root) {
  const git = gitAt(root);
  const paths = [...git('diff', '--name-only', '-z', 'HEAD').split('\0'), ...git('ls-files', '-z', '--others', '--exclude-standard').split('\0')];
  const relevant = paths.filter(isSourceInput);
  if (relevant.length) throw new Error(`Release tag cannot identify uncommitted source: ${[...new Set(relevant)].slice(0, 20).join(', ')}`);
}

/** Bind previously tested implementation bytes and candidate archives to a later frozen commit. */
export function bindSourceIdentityToCommit(root, staged, archiveEntries, freezeCommit) {
  root = resolve(root);
  const git = gitAt(root);
  if (!freezeCommit || git('rev-parse', 'HEAD') !== freezeCommit || git('rev-parse', `${freezeCommit}^{commit}`) !== freezeCommit) throw new Error('Frozen commit must be the current full commit');
  assertCommittedReleaseSource(root);
  const current = gitSourceIdentity(root);
  if (!staged?.inputDigest || staged.inputDigest !== gitSourceInputDigest(root) || staged.fingerprint !== current.fingerprint || staged.lockfileSha256 !== current.lockfileSha256) throw new Error('Frozen commit differs from tested implementation inputs');
  if (!Array.isArray(archiveEntries) || !archiveEntries.length) throw new Error('Candidate archives are required for freeze binding');
  const archives = archiveEntries.map(({ path, sha256: expected }) => {
    if (typeof path !== 'string' || !/^[a-f0-9]{64}$/.test(expected ?? '') || !inside(root, resolve(root, path)) || !inside(realpathSync(root), realpathSync(resolve(root, path)))) throw new Error('Invalid candidate archive identity');
    const actual = sha256(readFileSync(resolve(root, path)));
    if (actual !== expected) throw new Error(`Candidate archive differs from tested bytes: ${path}`);
    return { path, sha256: actual };
  });
  if (new Set(archives.map(a => a.path)).size !== archives.length) throw new Error('Duplicate candidate archive');
  return { schema: 'aura3d.source-freeze-binding/1', origin: { commit: staged.commit, tree: staged.tree }, freeze: { commit: current.commit, tree: current.tree }, inputDigest: staged.inputDigest, fingerprint: current.fingerprint, lockfileSha256: current.lockfileSha256, archives };
}
