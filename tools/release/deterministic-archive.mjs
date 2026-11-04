// Deterministic npm archive entry order.
//
// `pnpm pack` writes small packages (for example `@aura3d/apps` and `@aura3d/react`) with entries in the
// order its asynchronous file reads finish, so two packs of the same commit can produce different archive
// bytes (and therefore different plan SHA-256/SRI values) with identical file contents. The ACR source pass
// packs the same commit in several stages and requires the stage plans to be byte-identical, so every archive
// is rewritten with its entries (each with its own pax/GNU extension headers) sorted by path and a fixed gzip
// level.
//
// Sorting entries is not enough: `pnpm pack` also rewrites `workspace:*` ranges in `package/package.json` and
// emits the rewritten dependency maps in the order its asynchronous version lookups finish (ACR pass 011:
// `@aura3d/debug` packed with `animation, rendering, physics` in one stage and `animation, physics, rendering`
// in six others, 36 bytes of one entry). Dependency maps in the packed manifest are therefore key-sorted, and
// every entry header is normalized (mtime, uid/gid 0, empty uname/gname, mode 0644/0755, recomputed checksum).
// File bytes of every other entry are copied unchanged.
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

const DEPENDENCY_MAPS = ["dependencies", "devDependencies", "peerDependencies", "optionalDependencies"];
const FIXED_MTIME = 499162500; // 1985-10-26T08:15:00Z, the value npm/pnpm pack already writes.

/** Key-sort the dependency maps of a packed manifest; anything that is not a JSON object is returned untouched. */
export function canonicalizeManifestBytes(data) {
  let manifest;
  const text = data.toString("utf8");
  try { manifest = JSON.parse(text); } catch { return data; }
  if (manifest === null || typeof manifest !== "object" || Array.isArray(manifest)) return data;
  let changed = false;
  for (const field of DEPENDENCY_MAPS) {
    const map = manifest[field];
    if (map === null || typeof map !== "object" || Array.isArray(map)) continue;
    const keys = Object.keys(map);
    const sorted = [...keys].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0));
    if (sorted.every((key, index) => key === keys[index])) continue;
    manifest[field] = Object.fromEntries(sorted.map((key) => [key, map[key]]));
    changed = true;
  }
  if (!changed) return data;
  const indent = /^\{\r?\n( +|\t)"/.exec(text)?.[1] ?? 2;
  return Buffer.from(`${JSON.stringify(manifest, null, indent)}${text.endsWith("\n") ? "\n" : ""}`, "utf8");
}

const writeOctal = (header, start, length, value) => {
  header.fill(0, start, start + length);
  header.write(`${value.toString(8).padStart(length - 1, "0")}\0`, start, "latin1");
};

/** Normalize one entry header in place: mtime, owner ids/names, mode class, size; fresh checksum. */
function normalizeHeader(header, size) {
  const mode = octal(header, 100, 8);
  writeOctal(header, 100, 8, mode & 0o111 ? 0o755 : 0o644);
  writeOctal(header, 108, 8, 0);
  writeOctal(header, 116, 8, 0);
  writeOctal(header, 124, 12, size);
  writeOctal(header, 136, 12, FIXED_MTIME);
  header.fill(0, 265, 297); // uname
  header.fill(0, 297, 329); // gname
  header.fill(0x20, 148, 156);
  const sum = header.reduce((total, byte) => total + byte, 0);
  header.write(`${sum.toString(8).padStart(6, "0")}\0 `, 148, "latin1");
}

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
    if (type === "x") { pending.push(chunk); pendingPath = paxPath(data) ?? pendingPath; continue; }
    if (type === "g" || type === "L" || type === "K") {
      pending.push(chunk);
      if (type === "L") pendingPath = cString(data, 0, data.length);
      continue;
    }
    const prefix = cString(header, 345, 155);
    const name = cString(header, 0, 100);
    const path = pendingPath ?? (prefix ? `${prefix}/${name}` : name);
    // The entry itself (not its extension headers): canonical manifest bytes, then a normalized header.
    const entryHeader = Buffer.from(header);
    const entryData = type === "0" && path === "package/package.json" ? canonicalizeManifestBytes(Buffer.from(data)) : data;
    normalizeHeader(entryHeader, entryData.length);
    pending.push(Buffer.concat([entryHeader, entryData, Buffer.alloc(Math.ceil(entryData.length / BLOCK) * BLOCK - entryData.length)]));
    groups.push({ path, chunks: pending });
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
