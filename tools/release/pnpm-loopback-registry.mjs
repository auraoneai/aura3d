import { createHash, randomBytes } from 'node:crypto';
import { consumePnpmArchiveAdmission } from './archive-admission.mjs';
import { consumeWorkspacePnpmAdmission } from './workspace-pnpm-admission.mjs';
import { readConsumerOfflineArchiveStore, readWorkspaceOfflineArchiveStore } from '../remote-acr/offline-archive-store.mjs';

// This adapter does not bind a socket or launch a process. A future, separately
// verified remote isolation layer may connect its request handler to a loopback
// HTTP listener. A registry URL alone does not establish network isolation.
const MAX_ARCHIVE = 64 * 1024 * 1024;
const MAX_ARCHIVES = 10000;
const MAX_TOTAL = 256 * 1024 * 1024;
const MAX_SERVED = 2 * MAX_TOTAL;
const MAX_REQUESTS = 20000;
const MAX_TARGET = 8192;
const NAME = /^[a-z0-9][a-z0-9._-]*$/;
const VERSION = /^(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)\.(?:0|[1-9][0-9]*)(?:-[0-9a-zA-Z.-]+)?$/;
const fail = message => { throw new Error(`PNPM_LOOPBACK_REGISTRY: ${message}`); };
const sha256 = data => createHash('sha256').update(data).digest('hex');
const sri = data => `sha512-${createHash('sha512').update(data).digest('base64')}`;

function registryPath(resolved) {
  if (typeof resolved !== 'string' || resolved.length > MAX_TARGET || !resolved.startsWith('https://registry.npmjs.org/')) fail('unsupported admitted archive resolution');
  let parsed;
  try { parsed = new URL(resolved); } catch { fail('invalid admitted registry resolution'); }
  if (parsed.protocol !== 'https:' || parsed.hostname !== 'registry.npmjs.org' || parsed.port || parsed.username || parsed.password || parsed.search || parsed.hash ||
      resolved !== `https://registry.npmjs.org${parsed.pathname}` || parsed.pathname.includes('%')) fail('noncanonical admitted registry resolution');
  const parts = parsed.pathname.split('/');
  let scope, leaf, dash, file;
  if (parts.length === 4) [, leaf, dash, file] = parts;
  else if (parts.length === 5) [, scope, leaf, dash, file] = parts;
  else fail('unsupported admitted registry path');
  if ((scope !== undefined && (!scope.startsWith('@') || !NAME.test(scope.slice(1)))) || !NAME.test(leaf) || dash !== '-' || !file.startsWith(`${leaf}-`) || !file.endsWith('.tgz')) fail('unsupported admitted registry path');
  const version = file.slice(leaf.length + 1, -4);
  if (!VERSION.test(version)) fail('unsupported admitted registry version');
  return parsed.pathname.slice(1);
}
function localPath(resolved) {
  return typeof resolved === 'string' && /^file:\.\/tarballs\/[A-Za-z0-9][A-Za-z0-9._-]*\.tgz$/.test(resolved) && !resolved.includes('..');
}
function preparedRegistry(admitted, revalidate) {
  if (!Array.isArray(admitted) || admitted.length < 1 || admitted.length > MAX_ARCHIVES) fail('invalid admitted archive set');
  const prefix = `/${randomBytes(24).toString('hex')}/`, routes = new Map(), resolutions = new Set();
  let archiveBytes = 0;
  for (const entry of admitted) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry) || typeof entry.resolved !== 'string' || resolutions.has(entry.resolved) ||
        !(entry.bytes instanceof Uint8Array) || !entry.bytes.byteLength || entry.bytes.byteLength > MAX_ARCHIVE) fail('invalid admitted archive snapshot');
    resolutions.add(entry.resolved);
    archiveBytes += entry.bytes.byteLength; if (archiveBytes > MAX_TOTAL) fail('admitted archive set exceeds byte limit');
    if (entry.resolved.startsWith('file:')) {
      if (!localPath(entry.resolved)) fail('unsupported admitted local archive');
      continue;
    }
    const path = prefix + registryPath(entry.resolved);
    if (routes.has(path)) fail('ambiguous admitted registry route');
    const bytes = Buffer.from(entry.bytes), digest = sha256(bytes);
    routes.set(path, { bytes, sha256: digest, integrity: sri(bytes), served: 0 });
  }
  let closed = false, requests = 0, denied = 0, servedBytes = 0;
  // The original admission is bound to mutable staged source and, for packed
  // consumers, candidate-review sidecars. A snapshot made when the dispatcher
  // was created is not authority to keep serving after any of those change.
  // The capability consumer rechecks that context and its retained archive
  // bytes. Close permanently rather than returning bytes under a stale review.
  const checkAdmission = () => {
    try { revalidate(); }
    catch {
      denied++;
      closed = true;
      fail('admission changed or is unavailable');
    }
  };
  const deniedReply = status => {
    denied++;
    return { status, headers: Object.freeze({ 'content-length': '0', 'cache-control': 'no-store' }), body: new Uint8Array() };
  };
  const status = () => Object.freeze({ closed, requests, denied, servedBytes, registryArchives: routes.size,
    routes: Object.freeze([...routes.entries()].map(([path, value]) => Object.freeze({ path, sha256: value.sha256, integrity: value.integrity, size: value.bytes.byteLength, served: value.served }))) });
  return Object.freeze({
    // Append this path to the isolated loopback origin selected by the trusted
    // host. The host must validate its socket, authority and request headers.
    registryPath: prefix,
    handle(request) {
      if (closed) fail('registry dispatcher is closed');
      if (++requests > MAX_REQUESTS) return deniedReply(429);
      if (!request || typeof request !== 'object' || Array.isArray(request) || request.method !== 'GET') return deniedReply(405);
      if (typeof request.target !== 'string' || request.target.length > MAX_TARGET || !request.target.startsWith(prefix) ||
          /[?#%\\\x00-\x20\x7f]/.test(request.target)) return deniedReply(400);
      const route = routes.get(request.target);
      if (!route) return deniedReply(404);
      checkAdmission();
      if (servedBytes + route.bytes.byteLength > MAX_SERVED || sha256(route.bytes) !== route.sha256 || sri(route.bytes) !== route.integrity) return deniedReply(503);
      servedBytes += route.bytes.byteLength; route.served++;
      return { status: 200, headers: Object.freeze({
        'content-type': 'application/octet-stream', 'content-length': String(route.bytes.byteLength),
        'cache-control': 'no-store', 'x-content-type-options': 'nosniff'
      }), body: Uint8Array.from(route.bytes) };
    },
    status,
    finish() {
      if (closed) fail('registry dispatcher is closed');
      closed = true;
      if (denied) fail('unexpected or failed registry requests occurred');
      checkAdmission();
      return status();
    }
  });
}

/** Retain fresh snapshots from a real pnpm-branded admission capability. */
export function createPnpmLoopbackRegistry({ capability, manifestBytes, lockBytes }) {
  const revalidate = () => consumePnpmArchiveAdmission({ capability, manifestBytes, lockBytes });
  return preparedRegistry(revalidate(), revalidate);
}

/** Workspace capabilities have a separate brand and bind staged source identity. */
export function createWorkspacePnpmLoopbackRegistry({ capability, root, sourceManifestPath }) {
  const revalidate = () => consumeWorkspacePnpmAdmission({ capability, root, sourceManifestPath });
  return preparedRegistry(revalidate().archives, revalidate);
}

/** Serve a verified private archive store; the store itself grants no authority. */
export function createStoredPnpmLoopbackRegistry(input) {
  const revalidate = () => readConsumerOfflineArchiveStore(input);
  return preparedRegistry(revalidate().archives, revalidate);
}

/** Source-bound workspace counterpart, rechecked before every archive response. */
export function createStoredWorkspacePnpmLoopbackRegistry(input) {
  const revalidate = () => readWorkspaceOfflineArchiveStore(input);
  return preparedRegistry(revalidate().archives, revalidate);
}
