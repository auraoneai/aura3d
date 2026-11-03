#!/usr/bin/env node
/** Bounded Blob artifact egress. Authentication is supplied by the task's
 * managed identity, never in argv. For existing jobs only, an already supplied
 * AURA3D_ARTIFACTS_SAS environment variable is also supported.
 *
 * AURA3D_ARTIFACTS_BLOB_URL=https://<account>.blob.core.windows.net/<container>
 * node tools/remote-acr/upload-artifacts.mjs --prefix <run-id> [--copy <file> <name>]... [dir ...]
 * Source handoffs use --source-handoff --prefix <run-id>/<prepare|resume>
 * --preserve-root <absolute-root> and only the run-scoped report directories.
 * Use --check to establish that the configured service identity can obtain a
 * storage token before starting acceptance. The task/identity and container
 * must already be provisioned and authorized; this script changes no IAM.
 */
import { closeSync, constants, fstatSync, lstatSync, openSync, readdirSync, readFileSync, realpathSync } from "node:fs";
import { basename, join, relative, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

const MAX_FILE_BYTES = 200 * 1024 * 1024;
const MAX_TOTAL_BYTES = 512 * 1024 * 1024;
const MAX_FILES = 2000;
// Portable source inputs alone permit 10,000 files and 512 MiB; candidate
// archives are separate. Keep ordinary uploads at their existing limits and
// scope the larger envelope to run-named source reports. Each actual batch is
// still constrained by MAX_TOTAL_BYTES and MAX_FILES.
const MAX_SOURCE_TOTAL_BYTES = 8 * MAX_TOTAL_BYTES;
const MAX_SOURCE_FILES = 10 * MAX_FILES;
const MAX_SOURCE_BUILD_REPORT_BYTES = 256 * 1024 * 1024;
const SOURCE_REPORT_FAMILIES = new Set([
  "native-capabilities", "native-consumers", "native-consumer-matrix",
  "native-examples-catalog", "native-source-inputs",
]);
const TOKEN_RESOURCE = "https://storage.azure.com/";

export function safeBlobName(name) {
  if (typeof name !== "string" || !name || name.startsWith("/") || name.includes("\\") ||
      name.split("/").some(part => !part || part === "." || part === "..") || /[\x00-\x1f\x7f?#]/.test(name)) {
    throw new Error("invalid artifact name");
  }
  return name;
}

export function parseArgs(argv) {
  const out = { copies: [], dirs: [], check: false };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--check") out.check = true;
    else if (arg === "--source-handoff") out.sourceHandoff = true;
    else if (arg === "--prefix") out.prefix = argv[++i];
    else if (arg === "--preserve-root") out.preserveRoot = argv[++i];
    else if (arg === "--copy") out.copies.push({ src: argv[++i], dest: argv[++i] });
    else if (!arg.startsWith("-")) out.dirs.push(arg);
    else throw new Error(`unknown argument: ${arg}`);
  }
  safeBlobName(out.prefix);
  if (out.preserveRoot !== undefined && (!out.preserveRoot || !out.preserveRoot.startsWith("/"))) throw new Error("--preserve-root requires an absolute directory");
  if (out.check && (out.dirs.length || out.copies.length)) throw new Error("--check cannot upload files");
  if (!out.check && !out.dirs.length && !out.copies.length) throw new Error("no artifacts specified");
  for (const item of out.copies) {
    if (!item.src || !item.dest) throw new Error("--copy requires a source and destination");
    safeBlobName(item.dest);
  }
  if (out.sourceHandoff) sourceHandoffRunId(out);
  return out;
}

function sourceHandoffRunId(args) {
  const match = /^([A-Za-z0-9][A-Za-z0-9_-]{0,79})\/(prepare|resume)$/.exec(args.prefix ?? "");
  if (!match || !args.preserveRoot || !args.preserveRoot.startsWith("/") || args.check ||
      !Array.isArray(args.dirs) || !args.dirs.length || !Array.isArray(args.copies) || args.copies.length) {
    throw new Error("source handoff requires a run/phase prefix, an absolute preserve root and report directories only");
  }
  return match[1];
}

function sourceArtifactLimit(dest, runId) {
  const parts = dest.split("/");
  if (parts.length < 5 || parts[0] !== "tests" || parts[1] !== "reports" ||
      !SOURCE_REPORT_FAMILIES.has(parts[2]) || parts[3] !== runId) {
    throw new Error(`source handoff artifact is outside the run-scoped reports: ${dest}`);
  }
  if (parts[2] === "native-capabilities" && parts.length === 5 &&
      (parts[4] === "source-build.json" || parts[4] === "resume-build-products.json")) {
    return MAX_SOURCE_BUILD_REPORT_BYTES;
  }
  return MAX_FILE_BYTES;
}

/** Split an already validated inventory into bounded, ordered transfer batches. */
export function planArtifactBatches(entries, { maxBytes = MAX_TOTAL_BYTES, maxFiles = MAX_FILES } = {}) {
  if (!Array.isArray(entries) || !entries.length || !Number.isSafeInteger(maxBytes) || maxBytes < 1 ||
      !Number.isSafeInteger(maxFiles) || maxFiles < 1) throw new Error("invalid artifact batch plan");
  const batches = [];
  let batch = [], total = 0;
  for (const entry of entries) {
    if (!entry || !Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > maxBytes) {
      throw new Error("artifact cannot fit in a transfer batch");
    }
    if (batch.length && (batch.length >= maxFiles || total + entry.size > maxBytes)) {
      batches.push(batch); batch = []; total = 0;
    }
    batch.push(entry); total += entry.size;
  }
  if (batch.length) batches.push(batch);
  return batches;
}

export function parseBlobUrl(value, { allowSas = false } = {}) {
  let u;
  try { u = new URL(value); } catch { throw new Error("invalid artifact container URL"); }
  if (u.protocol !== "https:" || !/^[a-z0-9]{3,24}\.blob\.core\.windows\.net$/i.test(u.hostname) ||
      u.port || u.username || u.password || u.hash || !/^\/[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])?$/.test(u.pathname) ||
      (!allowSas && u.search) || (allowSas && !u.search)) {
    throw new Error("artifact URL must name one Azure Blob container over HTTPS");
  }
  return u;
}

function identityEndpoint(env) {
  const endpoint = env.IDENTITY_ENDPOINT || env.MSI_ENDPOINT;
  if (!endpoint) throw new Error("managed identity endpoint is unavailable");
  let url;
  try { url = new URL(endpoint); } catch { throw new Error("invalid managed identity endpoint"); }
  if (url.protocol !== "http:" || !["127.0.0.1", "localhost", "169.254.169.254"].includes(url.hostname) || url.username || url.password) {
    throw new Error("managed identity endpoint is not a local platform endpoint");
  }
  const headers = {};
  if (env.IDENTITY_ENDPOINT && env.IDENTITY_HEADER) {
    url.searchParams.set("api-version", "2019-08-01");
    headers["X-IDENTITY-HEADER"] = env.IDENTITY_HEADER;
  } else if (env.MSI_ENDPOINT && env.MSI_SECRET) {
    url.searchParams.set("api-version", "2017-09-01");
    headers.Secret = env.MSI_SECRET;
  } else {
    url.searchParams.set("api-version", "2018-02-01");
    headers.Metadata = "true";
  }
  url.searchParams.set("resource", TOKEN_RESOURCE);
  const clientId = env.AURA3D_ARTIFACTS_CLIENT_ID;
  if (clientId && clientId !== "none") {
    if (!/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(clientId)) throw new Error("invalid managed identity client ID");
    url.searchParams.set("client_id", clientId);
  }
  return { url, headers };
}

export async function managedIdentityToken(env = process.env, request = fetch) {
  const { url, headers } = identityEndpoint(env);
  let response;
  try { response = await request(url, { headers, redirect: "error", signal: AbortSignal.timeout(10000) }); }
  catch { throw new Error("managed identity token request failed"); }
  if (!response.ok) throw new Error(`managed identity token request failed (HTTP ${response.status})`);
  const value = await response.json().catch(() => null);
  if (typeof value?.access_token !== "string" || !value.access_token) throw new Error("managed identity returned no access token");
  return value.access_token;
}

function contentTypeFor(file) {
  const ext = file.slice(file.lastIndexOf(".") + 1).toLowerCase();
  return ({ png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", webp: "image/webp", gif: "image/gif",
    json: "application/json", html: "text/html", txt: "text/plain", log: "text/plain", md: "text/plain",
    webm: "video/webm", zip: "application/zip", xml: "application/xml", wasm: "application/wasm" })[ext] || "application/octet-stream";
}

function* walk(dir) {
  const stat = lstatSync(dir);
  if (stat.isSymbolicLink()) throw new Error(`symlink artifacts are not permitted: ${dir}`);
  if (stat.isFile()) { yield dir; return; }
  if (!stat.isDirectory()) throw new Error(`unsupported artifact: ${dir}`);
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    const file = join(dir, entry.name);
    if (entry.isSymbolicLink()) throw new Error(`symlink artifacts are not permitted: ${file}`);
    if (entry.isDirectory()) yield* walk(file);
    else if (entry.isFile()) yield file;
  }
}

export function collectArtifacts(args) {
  const entries = [];
  const seen = new Set();
  const preserveRoot = args.preserveRoot ? resolve(args.preserveRoot) : undefined;
  const realRoot = preserveRoot ? realpathSync(preserveRoot) : undefined;
  const sourceRunId = args.sourceHandoff ? sourceHandoffRunId(args) : undefined;
  let total = 0;
  const checkedSource = src => {
    const absolute = resolve(src);
    if (preserveRoot && (!absolute.startsWith(preserveRoot + sep) ||
        realpathSync(absolute) !== resolve(realRoot, relative(preserveRoot, absolute)))) {
      throw new Error(`artifact is outside preserve root or contains a symlink: ${src}`);
    }
    return absolute;
  };
  const add = (src, dest) => {
    src = checkedSource(src);
    const stat = lstatSync(src);
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error(`artifact must be a regular file: ${src}`);
    const name = safeBlobName(`${args.prefix}/${dest}`);
    if (seen.has(name)) throw new Error(`duplicate artifact name: ${name}`);
    const fileLimit = sourceRunId ? sourceArtifactLimit(dest, sourceRunId) : MAX_FILE_BYTES;
    if (!Number.isSafeInteger(stat.size) || stat.size < 0 || stat.size > fileLimit) throw new Error(`artifact exceeds per-file limit: ${src}`);
    total += stat.size;
    if (total > (sourceRunId ? MAX_SOURCE_TOTAL_BYTES : MAX_TOTAL_BYTES) ||
        entries.length >= (sourceRunId ? MAX_SOURCE_FILES : MAX_FILES)) throw new Error("artifact inventory exceeds size or file-count limit");
    seen.add(name);
    entries.push({ src, name, size: stat.size, dev: stat.dev, ino: stat.ino, mtimeMs: stat.mtimeMs, ctimeMs: stat.ctimeMs });
  };
  for (const input of args.dirs) {
    const root = checkedSource(input);
    for (const src of walk(root)) {
      const dest = preserveRoot ? relative(preserveRoot, src).split(sep).join("/") :
        lstatSync(root).isFile() ? basename(root) : `${basename(root)}/${relative(root, src).split(sep).join("/")}`;
      add(src, dest);
    }
  }
  for (const { src, dest } of args.copies) add(src, dest);
  if (!entries.length) throw new Error("no artifact files found");
  return entries;
}

function snapshotArtifact(artifact) {
  // Read and scan one immutable buffer before uploading. Refuse a replaced,
  // symlinked or changed file rather than transferring bytes we did not scan.
  const fd = openSync(artifact.src, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const matches = stat => stat.isFile() && stat.dev === artifact.dev && stat.ino === artifact.ino &&
      stat.size === artifact.size && stat.mtimeMs === artifact.mtimeMs && stat.ctimeMs === artifact.ctimeMs;
    if (!matches(fstatSync(fd))) throw new Error(`artifact changed before transfer: ${artifact.name}`);
    const raw = readFileSync(fd);
    if (raw.length !== artifact.size || !matches(fstatSync(fd))) throw new Error(`artifact changed during transfer: ${artifact.name}`);
    return raw;
  } finally { closeSync(fd); }
}

export function redactText(text) {
  return text.replace(/(https:\/\/[^\s"'<>?]+)\?[^\s"'<>]+/gi, "$1?[redacted]")
    .replace(/(Bearer\s+)[A-Za-z0-9._~+\/-]+=*/gi, "$1[redacted]")
    .replace(/((?:access[_-]?token|authorization|password|secret|sig|sas)["']?\s*[:=]\s*["']?)[^\s,"'&}]+/gi, "$1[redacted]");
}

export async function run(args, env = process.env, request = fetch) {
  const blob = env.AURA3D_ARTIFACTS_BLOB_URL === "none" ? undefined : env.AURA3D_ARTIFACTS_BLOB_URL;
  const sas = !blob && env.AURA3D_ARTIFACTS_SAS;
  if (!blob && !sas) throw new Error("artifact container is not configured");
  const base = parseBlobUrl(blob || sas, { allowSas: Boolean(sas) });
  const token = sas ? undefined : await managedIdentityToken(env, request);
  if (args.check) return { uploaded: 0 };
  const artifacts = collectArtifacts(args);
  const batches = planArtifactBatches(artifacts);
  for (const batch of batches) for (const artifact of batch) {
    const url = new URL(base);
    url.pathname = `${base.pathname}/${artifact.name.split("/").map(encodeURIComponent).join("/")}`;
    const type = contentTypeFor(artifact.src);
    const raw = snapshotArtifact(artifact);
    if (/^(?:text\/|application\/(?:json|xml))/.test(type)) {
      const text = raw.toString("utf8");
      if (redactText(text) !== text) throw new Error(`artifact may contain credentials and was not transferred: ${artifact.name}`);
    }
    // Preserve bytes exactly: source report and candidate digests bind these
    // artifacts. Producers must redact sensitive fields before hashing them.
    const body = raw;
    let response;
    try {
      response = await request(url, { method: "PUT", headers: {
        "x-ms-blob-type": "BlockBlob", "x-ms-version": "2023-11-03", "if-none-match": "*", "content-type": type,
        "content-length": String(body.length), ...(token ? { authorization: `Bearer ${token}` } : {}),
      }, body, redirect: "error", signal: AbortSignal.timeout(120000) });
    } catch { throw new Error(`artifact transfer failed: ${artifact.name}`); }
    if (!response.ok) throw new Error(`artifact transfer failed: ${artifact.name} (HTTP ${response.status})`);
    console.log(`[upload] ${artifact.name} (${body.length} bytes)`);
  }
  return { uploaded: artifacts.length };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const result = await run(parseArgs(process.argv.slice(2)));
    console.log(`[upload] ${result.uploaded} artifacts transferred`);
  } catch (error) {
    console.error(`[upload] ${error.message}`);
    process.exitCode = 1;
  }
}
