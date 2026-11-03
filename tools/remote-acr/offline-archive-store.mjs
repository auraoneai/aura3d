/**
 * A private, content-addressed transport for already reviewed pnpm archives.
 *
 * This is deliberately NOT a pnpm v11 store, an install authorization, or
 * evidence of process/network isolation. The pnpm cache format and the
 * installed tree still need separate verification before any install or code
 * execution. A serialized manifest alone is never accepted as admission.
 */
import { createHash } from 'node:crypto';
import {
  closeSync, constants, fstatSync, lstatSync, mkdirSync, openSync, readFileSync,
  readdirSync, realpathSync, rmSync, writeFileSync
} from 'node:fs';
import { basename, dirname, isAbsolute, join, resolve } from 'node:path';
import { consumePnpmArchiveAdmission } from '../release/archive-admission.mjs';
import { consumeWorkspacePnpmAdmission } from '../release/workspace-pnpm-admission.mjs';

const MAX_ARCHIVES = 10000;
const MAX_ARCHIVE = 64 * 1024 * 1024;
const MAX_TOTAL = 256 * 1024 * 1024;
const MAX_MANIFEST = 16 * 1024 * 1024;
const HASH = /^[a-f0-9]{64}$/;
const NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const fail = message => { throw new Error(`PNPM_OFFLINE_ARCHIVE_STORE: ${message}`); };
const sha = bytes => createHash('sha256').update(bytes).digest('hex');
const sri = bytes => `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
const compare = (a, b) => a < b ? -1 : a > b ? 1 : 0;
const identity = stat => `${stat.dev}:${stat.ino}:${stat.nlink}:${stat.size}:${stat.mode}:${stat.mtimeMs}:${stat.ctimeMs}`;

function privateStat(path, directory) {
  let stat, real;
  try { stat = lstatSync(path); real = realpathSync(path); } catch { fail('store path is unavailable'); }
  if (stat.isSymbolicLink() || real !== path || (directory ? !stat.isDirectory() : !stat.isFile()) ||
      (!directory && stat.nlink !== 1) ||
      (process.platform !== 'win32' && ((stat.mode & 0o077) !== 0 || (!directory && (stat.mode & 0o111) !== 0) ||
        (typeof process.getuid === 'function' && stat.uid !== process.getuid())))) {
    fail('store path is not a private, unlinked regular entry');
  }
  return stat;
}

function location(path) {
  if (typeof path !== 'string' || !isAbsolute(path) || !NAME.test(basename(path))) fail('invalid store directory');
  let parent;
  try { parent = realpathSync(dirname(resolve(path))); } catch { fail('store parent is unavailable'); }
  privateStat(parent, true);
  return { parent, store: join(parent, basename(path)) };
}

function snapshot(input, binding) {
  if (!Array.isArray(input) || !input.length || input.length > MAX_ARCHIVES) fail('invalid admitted archive inventory');
  const seen = new Set(), blobs = new Map(), entries = [];
  let total = 0;
  for (const item of input) {
    const resolved = item?.resolved, bytes = item?.bytes;
    if (typeof resolved !== 'string' || !resolved || resolved.length > 8192 || /[\x00-\x20\x7f]/.test(resolved) ||
        seen.has(resolved) || !(bytes instanceof Uint8Array) || !bytes.byteLength || bytes.byteLength > MAX_ARCHIVE) {
      fail('invalid admitted archive snapshot');
    }
    seen.add(resolved);
    total += bytes.byteLength;
    if (total > MAX_TOTAL) fail('archive inventory exceeds byte limit');
    const copy = Buffer.from(bytes), digest = sha(copy), prior = blobs.get(digest);
    if (prior && !prior.equals(copy)) fail('archive digest collision');
    blobs.set(digest, copy);
    entries.push({ resolved, path: `archives/${digest}.tgz`, size: copy.length, sha256: digest, integrity: sri(copy) });
  }
  entries.sort((a, b) => compare(a.resolved, b.resolved));
  const manifest = { schema: 'aura3d.pnpm-offline-archive-store/1', binding, archives: entries };
  const manifestBytes = Buffer.from(`${JSON.stringify(manifest, null, 2)}\n`);
  if (manifestBytes.length > MAX_MANIFEST) fail('archive manifest exceeds byte limit');
  return { manifest, manifestBytes, blobs };
}

function consumerSnapshot({ capability, manifestBytes, lockBytes }) {
  const archives = consumePnpmArchiveAdmission({ capability, manifestBytes, lockBytes });
  return snapshot(archives, { kind: 'consumer', manifestSha256: sha(manifestBytes), lockfileSha256: sha(lockBytes) });
}

function workspaceSnapshot({ capability, root, sourceManifestPath }) {
  const admitted = consumeWorkspacePnpmAdmission({ capability, root, sourceManifestPath });
  const source = admitted.source;
  if (!HASH.test(source?.inputDigest ?? '') || !HASH.test(source?.manifestSha256 ?? '') ||
      !HASH.test(source?.lockfileSha256 ?? '') || source.lockfileSha256 !== admitted.lockSha256) fail('invalid workspace admission identity');
  return snapshot(admitted.archives, { kind: 'workspace', sourceInputDigest: source.inputDigest,
    sourceManifestSha256: source.manifestSha256, lockfileSha256: source.lockfileSha256 });
}

function readChecked(path, max) {
  const before = privateStat(path, false);
  if (before.size > max) fail('stored file exceeds byte limit');
  let fd;
  try {
    fd = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    if (identity(fstatSync(fd)) !== identity(before)) fail('stored file changed before reading');
    const bytes = readFileSync(fd), after = fstatSync(fd), current = lstatSync(path);
    if (identity(after) !== identity(before) || identity(current) !== identity(before) || bytes.length !== before.size) {
      fail('stored file changed while reading');
    }
    return bytes;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('PNPM_OFFLINE_ARCHIVE_STORE:')) throw error;
    fail('stored file cannot be read safely');
  } finally { if (fd !== undefined) closeSync(fd); }
}

function verify(path, expected) {
  const { parent, store } = location(path);
  const parentStat = privateStat(parent, true), storeStat = privateStat(store, true);
  if (JSON.stringify(readdirSync(store).sort()) !== JSON.stringify(['archives', 'manifest.json'])) fail('unexpected store entries');
  const archiveDir = join(store, 'archives'), archiveStat = privateStat(archiveDir, true);
  const names = [...expected.blobs.keys()].map(digest => `${digest}.tgz`).sort(compare);
  if (JSON.stringify(readdirSync(archiveDir).sort(compare)) !== JSON.stringify(names)) fail('stored archive inventory differs');
  if (!readChecked(join(store, 'manifest.json'), MAX_MANIFEST).equals(expected.manifestBytes)) fail('stored manifest differs from admission');
  for (const name of names) {
    const bytes = readChecked(join(archiveDir, name), MAX_ARCHIVE), expectedBytes = expected.blobs.get(name.slice(0, -4));
    if (!bytes.equals(expectedBytes)) fail('stored archive differs from admission');
  }
  if (identity(privateStat(parent, true)) !== identity(parentStat) ||
      identity(privateStat(store, true)) !== identity(storeStat) ||
      identity(privateStat(archiveDir, true)) !== identity(archiveStat)) fail('store changed during verification');
  return {
    schema: expected.manifest.schema, binding: { ...expected.manifest.binding },
    manifestSha256: sha(expected.manifestBytes), archiveCount: expected.manifest.archives.length,
    blobCount: expected.blobs.size, installationAuthorized: false,
    archives: expected.manifest.archives.map(item => ({ resolved: item.resolved, bytes: Uint8Array.from(expected.blobs.get(item.sha256)) }))
  };
}

function create(path, obtain) {
  // Verify admission before making any filesystem changes.
  const expected = obtain(), { parent, store } = location(path), parentStat = privateStat(parent, true);
  let created = false;
  try {
    mkdirSync(store, { mode: 0o700 });
    created = true;
    mkdirSync(join(store, 'archives'), { mode: 0o700 });
    for (const [digest, bytes] of expected.blobs) {
      writeFileSync(join(store, 'archives', `${digest}.tgz`), bytes, { flag: 'wx', mode: 0o600 });
    }
    writeFileSync(join(store, 'manifest.json'), expected.manifestBytes, { flag: 'wx', mode: 0o600 });
    // Capability and staged source can change while the store is being written.
    const current = obtain();
    if (!current.manifestBytes.equals(expected.manifestBytes)) fail('admission changed while creating store');
    // Creating the store changes its parent's directory timestamps but not its
    // identity/ownership. Do not mistake the expected timestamp change for a
    // mutation; the stored path itself is rechecked below.
    const parentAfter = privateStat(parent, true);
    if (parentAfter.dev !== parentStat.dev || parentAfter.ino !== parentStat.ino) fail('store parent changed');
    const result = verify(store, current);
    if (!obtain().manifestBytes.equals(current.manifestBytes)) fail('admission changed while verifying store');
    return result;
  } catch (error) {
    if (created) rmSync(store, { recursive: true, force: true });
    throw error;
  }
}

function read(path, obtain) {
  const before = obtain(), result = verify(path, before), after = obtain();
  if (!after.manifestBytes.equals(before.manifestBytes)) fail('admission changed while reading store');
  return result;
}

/** Persist only archives held by a live, source-bound workspace capability. */
export function createWorkspaceOfflineArchiveStore(input) {
  return create(input.storeDir, () => workspaceSnapshot(input));
}
/** Revalidate both admission and every stored byte; never trust the manifest alone. */
export function readWorkspaceOfflineArchiveStore(input) {
  return read(input.storeDir, () => workspaceSnapshot(input));
}
/** Persist only archives held by a live, candidate-bound pnpm capability. */
export function createConsumerOfflineArchiveStore(input) {
  return create(input.storeDir, () => consumerSnapshot(input));
}
/** Revalidate the candidate, lock, manifest and every stored archive. */
export function readConsumerOfflineArchiveStore(input) {
  return read(input.storeDir, () => consumerSnapshot(input));
}
