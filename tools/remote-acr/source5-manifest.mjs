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
// plus one field the validator ignores:
//   stagedExcludedPaths staged files outside the identity set (tracked
//                       tests/reports, BUNDLE_SIZES.md, ...), so
//                       tools/remote-acr/source5-files.mjs can list every
//                       shipped file without Git.
// The file is `.native-source-manifest.json` at the context root, a path
// `isSourceInput` excludes, so it never declares itself.
//
// CLI: node tools/remote-acr/source5-manifest.mjs write <ctx> <nul-separated-list> <commit> <tree>
//      writes <ctx>/.native-source-manifest.json and verifies it with
//      stagedSourceIdentity before any provider command runs.
import { createHash } from 'node:crypto';
import { closeSync, lstatSync, openSync, readFileSync, readSync, readlinkSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { isAdministrativeSource, isSourceInput, sourceManifestInputDigest, stagedSourceIdentity } from '../release/source-identity.mjs';

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

/** Build the staged manifest for `paths` (repo-relative, as staged under `root`). */
export function buildSource5Manifest({ root, paths, commit, tree }) {
  if (!OBJECT_ID.test(commit ?? '') || !OBJECT_ID.test(tree ?? '')) throw new Error('Source manifest needs a full commit and tree id');
  const unique = [...new Set(paths.filter(Boolean))].sort();
  const files = [], administrativeFiles = [], stagedExcludedPaths = [];
  for (const path of unique) {
    if (path === SOURCE5_MANIFEST_NAME) continue;
    if (isSourceInput(path)) files.push(manifestEntry(root, path));
    else if (isAdministrativeSource(path)) administrativeFiles.push(manifestEntry(root, path));
    else stagedExcludedPaths.push(path);
  }
  if (!files.length) throw new Error('Source manifest has no source inputs');
  const lock = files.find(entry => entry.path === 'pnpm-lock.yaml');
  if (!lock) throw new Error('Source manifest is missing pnpm-lock.yaml');
  return {
    schema: SOURCE5_MANIFEST_SCHEMA,
    origin: { commit, tree },
    files,
    administrativeFiles,
    lockfileSha256: lock.sha256,
    inputDigest: sourceManifestInputDigest(files),
    stagedExcludedPaths
  };
}

/** Write `<root>/.native-source-manifest.json` and verify it with the in-image validator. */
export function writeSource5Manifest({ root, paths, commit, tree }) {
  const manifest = buildSource5Manifest({ root, paths, commit, tree });
  writeFileSync(resolve(root, SOURCE5_MANIFEST_NAME), `${JSON.stringify(manifest, null, 2)}\n`, { flag: 'wx' });
  const identity = stagedSourceIdentity(root, SOURCE5_MANIFEST_NAME);
  return { manifest, identity };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const [command, ctx, listFile, commit, tree] = process.argv.slice(2);
  try {
    if (command !== 'write' || !ctx || !listFile) throw new Error('usage: source5-manifest.mjs write <ctx> <nul-list> <commit> <tree>');
    const paths = readFileSync(listFile, 'utf8').split('\0').filter(Boolean);
    const { manifest, identity } = writeSource5Manifest({ root: ctx, paths, commit, tree });
    console.log(`   manifest   : ${manifest.files.length} source + ${manifest.administrativeFiles.length} administrative + ${manifest.stagedExcludedPaths.length} excluded; inputDigest ${identity.inputDigest}`);
  } catch (error) {
    console.error(`FATAL: source manifest: ${error.message}`);
    process.exitCode = 1;
  }
}
