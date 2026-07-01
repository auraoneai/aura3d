import { mkdirSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { inflateRawSync } from "node:zlib";

export interface DownloadResult {
  readonly path?: string;
}

export type DownloadFile = (
  url: string,
  destPath: string,
) => Promise<DownloadResult | void>;

const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]);
const GLB_MAGIC = Buffer.from([0x67, 0x6c, 0x54, 0x46]);

export const defaultDownloadFile: DownloadFile = async (url, destPath) => {
  const res = await fetch(url, { headers: { accept: "model/gltf-binary,application/zip,*/*" } });
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new Error(
        `Aura3D resolve failed: ${url} requires authentication (HTTP ${res.status}). ` +
          `This source (e.g. Sketchfab) needs an OAuth download token; set SKETCHFAB_API_TOKEN ` +
          `or pull a direct-download (Objaverse) candidate instead.`,
      );
    }
    throw new Error(`Aura3D resolve failed: download of ${url} returned HTTP ${res.status}.`);
  }
  const buffer = Buffer.from(await res.arrayBuffer());
  if (buffer.length === 0) {
    throw new Error(`Aura3D resolve failed: download of ${url} was empty.`);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.includes("application/json") || buffer[0] === 0x7b) {
    const followed = await followSignedDownload(buffer, destPath);
    if (followed) return followed;
    throw new Error(
      `Aura3D resolve failed: ${url} returned a JSON envelope, not model bytes ` +
        `(auth-gated download requiring an OAuth token). Pull a direct-download candidate instead.`,
    );
  }

  if (startsWith(buffer, ZIP_MAGIC)) {
    return unpackZipToModel(buffer, destPath);
  }

  writeFileSync(destPath, buffer);
  await fetchExternalDependencies(buffer, url, destPath);
  return { path: destPath };
};

function externalUris(modelBytes: Buffer, destPath: string): string[] {
  let json: unknown;
  try {
    if (startsWith(modelBytes, GLB_MAGIC)) {
      if (modelBytes.length < 20) return [];
      const jsonLen = modelBytes.readUInt32LE(12);
      json = JSON.parse(modelBytes.toString("utf8", 20, 20 + jsonLen));
    } else if (destPath.toLowerCase().endsWith(".gltf")) {
      json = JSON.parse(modelBytes.toString("utf8"));
    } else {
      return [];
    }
  } catch {
    return [];
  }
  const doc = json as { images?: { uri?: string }[]; buffers?: { uri?: string }[] };
  const uris = [...(doc.images ?? []), ...(doc.buffers ?? [])]
    .map((entry) => entry.uri)
    .filter((uri): uri is string => typeof uri === "string" && uri.length > 0 && !uri.startsWith("data:"));
  return [...new Set(uris)];
}

async function fetchExternalDependencies(
  modelBytes: Buffer,
  sourceUrl: string,
  destPath: string,
): Promise<void> {
  const uris = externalUris(modelBytes, destPath);
  if (uris.length === 0) return;
  const dir = dirname(destPath);
  await Promise.all(
    uris.map(async (uri) => {
      const decoded = decodeURIComponent(uri);
      const target = join(dir, decoded);
      let resolvedUrl: string;
      try {
        resolvedUrl = new URL(uri, sourceUrl).toString();
      } catch {
        return;
      }
      try {
        const res = await fetch(resolvedUrl, { headers: { accept: "*/*" } });
        if (!res.ok) return;
        const bytes = Buffer.from(await res.arrayBuffer());
        if (bytes.length === 0) return;
        mkdirSync(dirname(target), { recursive: true });
        writeFileSync(target, bytes);
      } catch {
        return;
      }
    }),
  );
}

function startsWith(buffer: Buffer, magic: Buffer): boolean {
  return buffer.length >= magic.length && buffer.subarray(0, magic.length).equals(magic);
}

async function followSignedDownload(
  buffer: Buffer,
  destPath: string,
): Promise<DownloadResult | undefined> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(buffer.toString("utf8"));
  } catch {
    return undefined;
  }
  const envelope = parsed as Record<string, unknown> | null;
  const directUrl =
    pickUrl(envelope?.["glb"]) ?? pickUrl(envelope?.["gltf"]) ?? pickUrl(envelope?.["model"]);
  if (!directUrl) return undefined;
  const res = await fetch(directUrl, { headers: { accept: "model/gltf-binary,application/zip,*/*" } });
  if (!res.ok) return undefined;
  const inner = Buffer.from(await res.arrayBuffer());
  if (inner.length === 0) return undefined;
  if (startsWith(inner, ZIP_MAGIC)) return unpackZipToModel(inner, destPath);
  writeFileSync(destPath, inner);
  return { path: destPath };
}

function pickUrl(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const url = (value as Record<string, unknown>)["url"];
    if (typeof url === "string") return url;
  }
  return undefined;
}

function unpackZipToModel(zip: Buffer, destPath: string): DownloadResult {
  const dir = dirname(destPath);
  const entries = readZipEntries(zip);
  if (entries.length === 0) {
    throw new Error("Aura3D resolve failed: downloaded ZIP contained no files.");
  }
  let glbPath: string | undefined;
  let gltfPath: string | undefined;
  for (const entry of entries) {
    if (entry.name.endsWith("/")) continue;
    const safeName = basename(entry.name);
    if (!safeName) continue;
    const outPath = join(dir, safeName);
    writeFileSync(outPath, entry.data);
    const lower = safeName.toLowerCase();
    if (lower.endsWith(".glb") && (!glbPath || isPlausibleGlb(entry.data))) glbPath = outPath;
    else if (lower.endsWith(".gltf") && !gltfPath) gltfPath = outPath;
  }
  const chosen = glbPath ?? gltfPath;
  if (!chosen) {
    throw new Error("Aura3D resolve failed: ZIP did not contain a .glb or .gltf model.");
  }
  return { path: chosen };
}

function isPlausibleGlb(data: Buffer): boolean {
  return startsWith(data, GLB_MAGIC);
}

interface ZipEntry {
  readonly name: string;
  readonly data: Buffer;
}

function readZipEntries(zip: Buffer): ZipEntry[] {
  const eocd = findEocd(zip);
  if (eocd < 0) return [];
  const total = zip.readUInt16LE(eocd + 10);
  let cd = zip.readUInt32LE(eocd + 16);
  const entries: ZipEntry[] = [];
  for (let i = 0; i < total; i += 1) {
    if (cd + 46 > zip.length || zip.readUInt32LE(cd) !== 0x02014b50) break;
    const method = zip.readUInt16LE(cd + 10);
    const compSize = zip.readUInt32LE(cd + 20);
    const nameLen = zip.readUInt16LE(cd + 28);
    const extraLen = zip.readUInt16LE(cd + 30);
    const commentLen = zip.readUInt16LE(cd + 32);
    const localOffset = zip.readUInt32LE(cd + 42);
    const name = zip.toString("utf8", cd + 46, cd + 46 + nameLen);
    const data = inflateLocalEntry(zip, localOffset, method, compSize);
    if (data) entries.push({ name, data });
    cd += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

function inflateLocalEntry(
  zip: Buffer,
  localOffset: number,
  method: number,
  compSize: number,
): Buffer | undefined {
  if (localOffset + 30 > zip.length || zip.readUInt32LE(localOffset) !== 0x04034b50) return undefined;
  const nameLen = zip.readUInt16LE(localOffset + 26);
  const extraLen = zip.readUInt16LE(localOffset + 28);
  const dataStart = localOffset + 30 + nameLen + extraLen;
  const comp = zip.subarray(dataStart, dataStart + compSize);
  if (method === 0) return Buffer.from(comp);
  if (method === 8) {
    try {
      return inflateRawSync(comp);
    } catch {
      return undefined;
    }
  }
  return undefined;
}

function findEocd(zip: Buffer): number {
  const min = Math.max(0, zip.length - 0xffff - 22);
  for (let i = zip.length - 22; i >= min; i -= 1) {
    if (zip.readUInt32LE(i) === 0x06054b50) return i;
  }
  return -1;
}
