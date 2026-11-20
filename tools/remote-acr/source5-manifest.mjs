#!/usr/bin/env node
// Staged source manifest for the 5.0 ACR source pass (tools/remote-acr/run-source5.sh).
//
// The launcher stages the committed candidate without `.git`; tools in the
// image (publish-all --pack-only, exact-release-plan, consumer matrix) read the
// candidate identity from AURA3D_SOURCE_MANIFEST through
// tools/release/source-identity.mjs `stagedSourceIdentity`. This writes that
// manifest in its exact schema (`aura3d.native-source-manifest/1`, same shape as
// the 4.x tools/remote-acr/source-checks.mjs `stageSource`):
//   files               identity inputs (`isSourceInput`), sorted, {path,type,mode,sha256}
//   administrativeFiles ledger/acceptance notes (`isAdministrativeSource`)
//   inputDigest         `sourceManifestInputDigest(files)`
//   lockfileSha256      sha256 of pnpm-lock.yaml (must equal its files entry)
//   origin              { commit, tree } of the candidate
//   unstaged            only when the launcher left source inputs out of the
//                       context: { files: [{path, gitBlob}], fingerprint }. Only
//                       root evidence media (`isUnstageableSource`) that no
//                       source-pass stage reads (`selectUnstagedSources`). Each
//                       stays in `files` (sha256; inputDigest unchanged), `gitBlob`
//                       is its blob in origin.tree (checked against the bytes
//                       here) and `fingerprint` is the identity fingerprint over
//                       every file, computed here from the context plus checkout.
// plus one field the validator ignores:
//   stagedExcludedPaths staged files outside the identity set (tracked
//                       tests/reports, BUNDLE_SIZES.md, ...), so
//                       tools/remote-acr/source5-files.mjs can list every
//                       candidate file without Git.
// The file is `.native-source-manifest.json` at the context root, a path
// `isSourceInput` excludes, so it never declares itself.
//
// CLI: node tools/remote-acr/source5-manifest.mjs select <repo> <nul-list> <commit> <staged-list-out> <unstaged-out>
//      splits the candidate list into the NUL list to copy and the JSON
//      unstaged list (SOURCE5_STAGE_ALL=1 stages everything);
//      node tools/remote-acr/source5-manifest.mjs write <ctx> <nul-list> <commit> <tree> [<unstaged-json> <repo>]
//      writes <ctx>/.native-source-manifest.json for the whole candidate list and
//      verifies it with stagedSourceIdentity before any provider command runs.
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { closeSync, existsSync, lstatSync, openSync, readFileSync, readSync, readlinkSync, statSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { gitBlobId, isAdministrativeSource, isSourceInput, isUnstageableSource, sourceInputFingerprint, sourceManifestInputDigest, stagedSourceIdentity } from '../release/source-identity.mjs';

export const SOURCE5_MANIFEST_SCHEMA = 'aura3d.native-source-manifest/1';
export const SOURCE5_MANIFEST_NAME = '.native-source-manifest.json';
const OBJECT_ID = /^[a-f0-9]{40}(?:[a-f0-9]{24})?$/;

function fileSha256(absolute) {
  const hash = createHash('sha256'), buffer = Buffer.allocUnsafe(1024 * 1024), fd = openSync(absolute, 'r');
  try { let n; while ((n = readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, n)); }
  finally { closeSync(fd); }
  return hash.digest('hex');
}

/** One manifest entry, hashed exactly as source-identity's `bytesForPath`. */
export function manifestEntry(root, path) {
  const absolute = resolve(root, path), stat = lstatSync(absolute);
  if (stat.isSymbolicLink()) return { path, type: 'symlink', mode: '120000', sha256: createHash('sha256').update(readlinkSync(absolute)).digest('hex') };
  if (!stat.isFile()) throw new Error(`Unsupported staged input (not a file or symlink): ${path}`);
  return { path, type: 'file', mode: (stat.mode & 0o111) ? '100755' : '100644', sha256: fileSha256(absolute) };
}

// Root evidence media that a source-pass stage does read stays staged:
//   */screens/**        tools/site/gen-game-inventory.mjs lists each game's screens/final (or
//                       screens/2026-10-24) images (tests/unit/site/game-inventory.test.ts)
//   evidence/receipts/  tools/receipts/check.mjs re-hashes every receipt frame
// plus every root evidence media path a file under tests/, tools/, packages/ or scripts/ names
// literally (e.g. the sha256-pinned baselines in tools/release/visual-compare-5.0/plan.json,
// re-hashed by tests/unit/tools/visual-compare-contact-sheet.test.ts when present).
export const SOURCE5_KEEP_STAGED = [/(^|\/)screens\//, /^evidence\/receipts\//];
const REFERENCE_ROOTS = /^(?:tests|tools|packages|scripts)\//;
const REFERENCE_TEXT = /\.(?:[cm]?[jt]sx?|json|ya?ml|sh|html|txt)$/i;
const MEDIA_REFERENCE = /evidence\/[A-Za-z0-9_.@+/-]+\.(?:png|jpe?g|webp|gif|mp4|webm)/gi;

/** Root evidence media paths named literally by candidate code and data under tests/, tools/, packages/, scripts/. */
export function referencedEvidenceMedia(root, paths) {
  const referenced = new Set();
  for (const path of paths) {
    if (!REFERENCE_ROOTS.test(path) || !REFERENCE_TEXT.test(path) || path.startsWith('tests/reports/')) continue;
    let stat;
    try { stat = lstatSync(resolve(root, path)); } catch { continue; }
    if (!stat.isFile() || stat.size > 32 * 1024 * 1024) continue;
    for (const match of readFileSync(resolve(root, path), 'utf8').matchAll(MEDIA_REFERENCE)) referenced.add(match[0]);
  }
  return referenced;
}

/**
 * The candidate inputs the launcher leaves out of the build context: tracked root evidence media
 * (`isUnstageableSource`) outside SOURCE5_KEEP_STAGED and not named by candidate code, whose bytes
 * under `root` are exactly the blob in `treeBlobs` (path -> blob id in the commit's tree).
 * Anything else (untracked, modified, executable, symlink) is staged as before. Sorted [{ path, gitBlob }].
 */
export function selectUnstagedSources({ root, paths, treeBlobs }) {
  const referenced = referencedEvidenceMedia(root, paths);
  const unstaged = [];
  for (const path of [...new Set(paths.filter(Boolean))].sort()) {
    if (!isUnstageableSource(path) || SOURCE5_KEEP_STAGED.some(re => re.test(path)) || referenced.has(path)) continue;
    const gitBlob = treeBlobs.get(path);
    if (!gitBlob) continue;
    const stat = lstatSync(resolve(root, path));
    if (!stat.isFile() || (stat.mode & 0o111) || gitBlobId(readFileSync(resolve(root, path)), gitBlob.length) !== gitBlob) continue;
    unstaged.push({ path, gitBlob });
  }
  return unstaged;
}

/** path -> blob id of every non-executable regular file in `commit`'s tree (`git ls-tree -r`). */
export function commitBlobIds(repo, commit) {
  const blobs = new Map();
  for (const line of execFileSync('git', ['ls-tree', '-r', '-z', '--full-tree', commit], { cwd: repo, maxBuffer: 1 << 28 }).toString('utf8').split('\0')) {
    const match = /^100644 blob ([a-f0-9]+)\t(.+)$/s.exec(line);
    if (match) blobs.set(match[2], match[1]);
  }
  return blobs;
}

/**
 * Build the manifest for the candidate list `paths` (repo-relative). Every path is staged under
 * `root` except `unstaged` ([{ path, gitBlob }] from selectUnstagedSources): those must be absent
 * from `root` and are hashed from the checkout `sourceRoot`, whose bytes must be their commit blob.
 */
export function buildSource5Manifest({ root, paths, commit, tree, unstaged = [], sourceRoot = null }) {
  if (!OBJECT_ID.test(commit ?? '') || !OBJECT_ID.test(tree ?? '')) throw new Error('Source manifest needs a full commit and tree id');
  const unique = [...new Set(paths.filter(Boolean))].sort();
  const notStaged = new Map(unstaged.map(entry => [entry?.path, entry?.gitBlob]));
  if (notStaged.size !== unstaged.length) throw new Error('Duplicate unstaged source');
  if (notStaged.size && !sourceRoot) throw new Error('Unstaged sources need the checkout they are read from');
  const listed = new Set(unique);
  for (const [path, gitBlob] of notStaged) {
    if (!isUnstageableSource(path) || !listed.has(path)) throw new Error(`Not an unstageable candidate input: ${path}`);
    if (existsSync(resolve(root, path))) throw new Error(`Unstaged source is present in the staged context: ${path}`);
    if (typeof gitBlob !== 'string' || gitBlob.length !== tree.length || gitBlobId(readFileSync(resolve(sourceRoot, path)), tree.length) !== gitBlob) throw new Error(`Unstaged source differs from its commit blob: ${path}`);
  }
  const rootOf = path => (notStaged.has(path) ? sourceRoot : root);
  const files = [], administrativeFiles = [], stagedExcludedPaths = [];
  for (const path of unique) {
    if (path === SOURCE5_MANIFEST_NAME) continue;
    if (isSourceInput(path)) files.push(manifestEntry(rootOf(path), path));
    else if (isAdministrativeSource(path)) administrativeFiles.push(manifestEntry(root, path));
    else stagedExcludedPaths.push(path);
  }
  if (!files.length) throw new Error('Source manifest has no source inputs');
  const lock = files.find(entry => entry.path === 'pnpm-lock.yaml');
  if (!lock) throw new Error('Source manifest is missing pnpm-lock.yaml');
  const manifest = {
    schema: SOURCE5_MANIFEST_SCHEMA,
    origin: { commit, tree },
    files,
    administrativeFiles,
    lockfileSha256: lock.sha256,
    inputDigest: sourceManifestInputDigest(files)
  };
  if (notStaged.size) {
    manifest.unstaged = {
      files: [...notStaged.keys()].sort().map(path => ({ path, gitBlob: notStaged.get(path) })),
      fingerprint: sourceInputFingerprint(files.map(entry => entry.path), rootOf)
    };
  }
  manifest.stagedExcludedPaths = stagedExcludedPaths;
  return manifest;
}

/** Write `<root>/.native-source-manifest.json` and verify it with the in-image validator. */
export function writeSource5Manifest({ root, paths, commit, tree, unstaged = [], sourceRoot = null }) {
  const manifest = buildSource5Manifest({ root, paths, commit, tree, unstaged, sourceRoot });
  writeFileSync(resolve(root, SOURCE5_MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  const identity = stagedSourceIdentity(root, SOURCE5_MANIFEST_NAME);
  return { manifest, identity };
}

const readNulList = file => readFileSync(file, 'utf8').split('\0').filter(Boolean);
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, ...args] = process.argv.slice(2);
  try {
    if (command === 'select') {
      const [repo, listFile, commit, stagedOut, unstagedOut] = args;
      if (!repo || !listFile || !OBJECT_ID.test(commit ?? '') || !stagedOut || !unstagedOut) throw new Error('usage: source5-manifest.mjs select <repo> <nul-list> <commit> <staged-list-out> <unstaged-out>');
      const paths = readNulList(listFile);
      const unstaged = process.env.SOURCE5_STAGE_ALL === '1' ? [] : selectUnstagedSources({ root: repo, paths, treeBlobs: commitBlobIds(repo, commit) });
      const skip = new Set(unstaged.map(entry => entry.path));
      writeFileSync(stagedOut, paths.filter(path => !skip.has(path)).map(path => `${path}\0`).join(''));
      writeFileSync(unstagedOut, `${JSON.stringify(unstaged)}\n`);
      const bytes = unstaged.reduce((sum, entry) => sum + statSync(resolve(repo, entry.path)).size, 0);
      console.log(`   unstaged   : ${unstaged.length} root evidence media files (${(bytes / 1048576).toFixed(0)} MiB) listed in the manifest, not uploaded`);
    } else if (command === 'write') {
      const [ctx, listFile, commit, tree, unstagedFile, repo] = args;
      if (!ctx || !listFile) throw new Error('usage: source5-manifest.mjs write <ctx> <nul-list> <commit> <tree> [<unstaged-json> <repo>]');
      const unstaged = unstagedFile ? JSON.parse(readFileSync(unstagedFile, 'utf8')) : [];
      const { manifest, identity } = writeSource5Manifest({ root: ctx, paths: readNulList(listFile), commit, tree, unstaged, sourceRoot: repo ?? null });
      console.log(`   manifest   : ${manifest.files.length} source (${manifest.unstaged?.files.length ?? 0} unstaged) + ${manifest.administrativeFiles.length} administrative + ${manifest.stagedExcludedPaths.length} excluded; inputDigest ${identity.inputDigest}`);
    } else throw new Error('usage: source5-manifest.mjs select <repo> <nul-list> <commit> <staged-list-out> <unstaged-out> | write <ctx> <nul-list> <commit> <tree> [<unstaged-json> <repo>]');
  } catch (error) {
    console.error(`FATAL: source manifest: ${error.message}`);
    process.exitCode = 1;
  }
}
