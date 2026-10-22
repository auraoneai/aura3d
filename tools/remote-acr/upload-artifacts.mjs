#!/usr/bin/env node
/**
 * Uploads artifact files to Azure Blob Storage using a container-level SAS
 * URL — no Azure CLI, SDK, or credentials beyond the SAS. Runs inside the
 * Playwright image (Node >= 20, global fetch).
 *
 *   node upload-artifacts.mjs --sas <containerSasUrl> --prefix <blobPrefix>
 *         [--copy <absPath> <blobRelativeName>]... [dir ...]
 *
 * `dir` arguments are walked recursively; each file is PUT as a BlockBlob at
 * `<prefix>/<dir>/<relpath>`. `--copy` uploads a single file to
 * `<prefix>/<blobRelativeName>`.
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { basename, join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const MAX_BYTES = 200 * 1024 * 1024;

function parseArgs(argv) {
  const out = { copies: [], dirs: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--sas") out.sas = argv[++i];
    else if (arg === "--prefix") out.prefix = argv[++i]?.replace(/^\/+|\/+$/g, "");
    else if (arg === "--copy") out.copies.push({ src: argv[++i], dest: argv[++i] });
    else if (!arg.startsWith("--")) out.dirs.push(arg);
    else throw new Error(`unknown argument: ${arg}`);
  }
  if (!out.sas) throw new Error("--sas <container sas url> is required");
  return out;
}

function splitSas(sasUrl) {
  const u = new URL(sasUrl);
  const query = u.search.startsWith("?") ? u.search.slice(1) : u.search;
  return { base: `${u.origin}${u.pathname.replace(/\/+$/, "")}`, query };
}

function contentTypeFor(file) {
  const ext = file.slice(file.lastIndexOf(".") + 1).toLowerCase();
  switch (ext) {
    case "png": return "image/png";
    case "jpg": case "jpeg": return "image/jpeg";
    case "webp": return "image/webp";
    case "gif": return "image/gif";
    case "json": return "application/json";
    case "html": return "text/html";
    case "txt": case "log": return "text/plain";
    case "webm": return "video/webm";
    case "zip": return "application/zip";
    case "xml": return "application/xml";
    case "wasm": return "application/wasm";
    default: return "application/octet-stream";
  }
}

function* walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(full);
    else if (entry.isFile()) yield full;
  }
}

function blobUrl(base, query, name) {
  // Encode each path segment; '/' stays a separator so the blob name keeps
  // its directory structure for `az storage blob download-batch`.
  const encoded = name.split("/").map(encodeURIComponent).join("/");
  return `${base}/${encoded}?${query}`;
}

async function upload(base, query, blobName, file) {
  const stat = statSync(file);
  if (stat.size > MAX_BYTES) {
    console.log(`[upload] SKIP ${file} (${stat.size} bytes > ${MAX_BYTES} cap)`);
    return false;
  }
  const body = readFileSync(file);
  const res = await fetch(blobUrl(base, query, blobName), {
    method: "PUT",
    headers: {
      "x-ms-blob-type": "BlockBlob",
      "x-ms-version": "2023-11-03",
      "content-type": contentTypeFor(file),
      "content-length": String(body.length),
    },
    body,
  });
  if (!res.ok) {
    console.log(`[upload] FAIL ${blobName} <- ${file}: HTTP ${res.status} ${await res.text().catch(() => "")}`);
    return false;
  }
  console.log(`[upload] ${blobName} <- ${file} (${stat.size} bytes)`);
  return true;
}

const args = parseArgs(process.argv.slice(2));
const { base, query } = splitSas(args.sas);
const prefix = args.prefix ? `${args.prefix}/` : "";

let uploaded = 0, failed = 0;
const failures = [];

for (const dir of args.dirs) {
  let root = dir;
  try {
    const st = statSync(dir);
    if (st.isFile()) {
      const name = `${prefix}${basename(dir)}`;
      (await upload(base, query, name, dir)) ? uploaded++ : (failed++, failures.push(dir));
      continue;
    }
  } catch {
    console.log(`[upload] skip missing path: ${dir}`);
    continue;
  }
  for (const file of walk(root)) {
    const rel = relative(".", file).split(sep).join("/");
    const ok = await upload(base, query, `${prefix}${rel}`, file);
    ok ? uploaded++ : (failed++, failures.push(file));
  }
}

for (const { src, dest } of args.copies) {
  try {
    const ok = await upload(base, query, `${prefix}${dest.replace(/^\/+/, "")}`, src);
    ok ? uploaded++ : (failed++, failures.push(src));
  } catch (error) {
    failed++; failures.push(src);
    console.log(`[upload] FAIL ${src}: ${error.message}`);
  }
}

console.log(`[upload] done: ${uploaded} uploaded, ${failed} failed`);
if (failed > 0) {
  console.log(`[upload] failures: ${failures.join(", ")}`);
  process.exitCode = 1;
}
