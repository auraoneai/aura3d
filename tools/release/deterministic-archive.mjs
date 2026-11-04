// Deterministic npm archive entry order.
//
// `pnpm pack` writes small packages (for example `@aura3d/apps` and `@aura3d/react`) with entries in the
// order its asynchronous file reads finish, so two packs of the same commit can produce different archive
// bytes (and therefore different plan SHA-256/SRI values) with identical file contents. The ACR source pass
// packs the same commit in several stages and requires the stage plans to be byte-identical, so every archive
// is rewritten with its entries (each with its own pax/GNU extension headers) sorted by path and a fixed gzip
// level. Entry headers, modes, sizes and file bytes are copied unchanged.
import { readFileSync, renameSync, writeFileSync } from "node:fs";
import { gunzipSync, gzipSync } from "node:zlib";

const BLOCK = 512;

const cString = (bytes, start, length) => {
  const slice = bytes.subarray(start, start + length);
  const end = slice.indexOf(0);
  return Buffer.from(end < 0 ? slice : slice.subarray(0, end)).toString("utf8");
};

const octal = (bytes, start, length) => {
  const text = cString(bytes, start, length).trim();
  if (!text) return 0;
  if (!/^[0-7]+$/.test(text)) throw new Error("Unsupported tar size encoding");
  return Number.parseInt(text, 8);
};

const paxPath = (data) => {
  let offset = 0;
  while (offset < data.length) {
    const space = data.indexOf(0x20, offset);
    if (space < 0) break;
    const length = Number.parseInt(data.subarray(offset, space).toString("utf8"), 10);
    if (!Number.isInteger(length) || length <= space - offset) break;
    const record = data.subarray(space + 1, offset + length - 1).toString("utf8");
    if (record.startsWith("path=")) return record.slice(5);
    offset += length;
  }
  return undefined;
};

/** Rewrite uncompressed tar bytes with entries (and their extension headers) in path order. */
export function sortTarEntries(tar) {
  const groups = [];
  let pending = [];
  let pendingPath;
  let offset = 0;
  while (offset + BLOCK <= tar.length) {
    const header = tar.subarray(offset, offset + BLOCK);
    if (header.every((byte) => byte === 0)) break;
    const size = octal(header, 124, 12);
    const type = String.fromCharCode(header[156] || 0x30);
    const total = BLOCK + Math.ceil(size / BLOCK) * BLOCK;
    if (offset + total > tar.length) throw new Error("Truncated tar entry");
    const chunk = tar.subarray(offset, offset + total);
    const data = tar.subarray(offset + BLOCK, offset + BLOCK + size);
    offset += total;
    pending.push(chunk);
    if (type === "x") { pendingPath = paxPath(data) ?? pendingPath; continue; }
    if (type === "g" || type === "L" || type === "K") {
      if (type === "L") pendingPath = cString(data, 0, data.length);
      continue;
    }
    const prefix = cString(header, 345, 155);
    const name = cString(header, 0, 100);
    groups.push({ path: pendingPath ?? (prefix ? `${prefix}/${name}` : name), chunks: pending });
    pending = [];
    pendingPath = undefined;
  }
  if (pending.length) throw new Error("Tar extension header without an entry");
  const paths = groups.map((group) => group.path);
  if (new Set(paths).size !== paths.length) throw new Error("Duplicate tar entry path");
  groups.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return Buffer.concat([...groups.flatMap((group) => group.chunks), Buffer.alloc(BLOCK * 2)]);
}

/** Deterministic `.tgz` bytes for the same archive contents. */
export function normalizeNpmArchiveBytes(bytes) {
  return gzipSync(sortTarEntries(gunzipSync(bytes)), { level: 9 });
}

/** Rewrite one packed archive in place; returns the file path. */
export function normalizeNpmArchiveFile(file) {
  const normalized = normalizeNpmArchiveBytes(readFileSync(file));
  const temporary = `${file}.normalized`;
  writeFileSync(temporary, normalized);
  renameSync(temporary, file);
  return file;
}
