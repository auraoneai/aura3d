import { createHash, randomUUID } from "node:crypto";
import { lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, extname, join } from "node:path";
import { MeshoptDecoder } from "meshoptimizer";

const EXT = "EXT_meshopt_compression";
const SUPPORTED_EXTENSIONS = new Set([EXT, "KHR_mesh_quantization"]);
const MAX_DECODED_BYTES = 256 * 1024 * 1024;

function readGlb(bytes) {
  if (bytes.length < 20 || bytes.readUInt32LE(0) !== 0x46546c67 || bytes.readUInt32LE(4) !== 2 || bytes.readUInt32LE(8) !== bytes.length) {
    throw new Error("source is not a complete GLB 2.0 file");
  }
  const chunks = [];
  for (let offset = 12; offset < bytes.length;) {
    if (offset + 8 > bytes.length) throw new Error("truncated GLB chunk header");
    const length = bytes.readUInt32LE(offset);
    const type = bytes.readUInt32LE(offset + 4);
    const end = offset + 8 + length;
    if (length % 4 || end > bytes.length) throw new Error("invalid GLB chunk length");
    chunks.push({ type, data: bytes.subarray(offset + 8, end) });
    offset = end;
  }
  if (chunks[0]?.type !== 0x4e4f534a) throw new Error("GLB is missing its JSON chunk");
  return { json: JSON.parse(chunks[0].data.toString("utf8")), chunks };
}

function hasUnexpectedReference(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasUnexpectedReference);
  return Object.entries(value).some(([key, child]) =>
    key === EXT || (key === "buffer" && Number.isInteger(child) && child !== 0) || hasUnexpectedReference(child)
  );
}

function hasUnsupportedExtensions(value) {
  if (!value || typeof value !== "object") return false;
  if (Array.isArray(value)) return value.some(hasUnsupportedExtensions);
  return Object.entries(value).some(([key, child]) => {
    if (key === "extensions" && (!child || typeof child !== "object" || Array.isArray(child) ||
        Object.keys(child).some((name) => !SUPPORTED_EXTENSIONS.has(name)))) return true;
    return hasUnsupportedExtensions(child);
  });
}

function binaryGlb(json, bin) {
  const encoded = Buffer.from(JSON.stringify(json));
  const jsonPadding = Buffer.alloc((4 - encoded.length % 4) % 4, 0x20);
  const binPadding = Buffer.alloc((4 - bin.length % 4) % 4);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0);
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + encoded.length + jsonPadding.length + 8 + bin.length + binPadding.length, 8);
  header.writeUInt32LE(encoded.length + jsonPadding.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16);
  const binHeader = Buffer.alloc(8);
  binHeader.writeUInt32LE(bin.length + binPadding.length, 0);
  binHeader.writeUInt32LE(0x004e4942, 4);
  return Buffer.concat([header, encoded, jsonPadding, binHeader, bin, binPadding]);
}

function saveDerived(source, sourceBytes, output, dir) {
  const name = basename(source, extname(source));
  const hash = createHash("sha256").update(sourceBytes).digest("hex").slice(0, 16);
  const prefix = `${name}.${hash}.meshopt-decoded`;
  mkdirSync(dir, { recursive: true });
  let candidate = join(dir, `${prefix}.glb`);
  for (;;) {
    try {
      writeFileSync(candidate, output, { flag: "wx" });
      return candidate;
    } catch (error) {
      if (error.code !== "EEXIST") throw error;
      try {
        const stat = lstatSync(candidate);
        if (stat.isFile() && stat.size === output.length && readFileSync(candidate).equals(output)) return candidate;
      } catch {}
      candidate = join(dir, `${prefix}.${randomUUID()}.glb`);
    }
  }
}

export async function prepareRetextureSource(source, dir) {
  const sourceBytes = readFileSync(source);
  const { json, chunks } = readGlb(sourceBytes);
  const views = json.bufferViews ?? [];
  const compressed = views.filter((view) => view.extensions?.[EXT]);
  const declared = json.extensionsUsed?.includes(EXT) || json.extensionsRequired?.includes(EXT);
  if (!compressed.length && !declared) return source;
  if (!compressed.length) throw new Error(`${EXT} declared without compressed buffer views`);
  if (["extensionsUsed", "extensionsRequired"].some((key) => json[key] !== undefined &&
      (!Array.isArray(json[key]) || json[key].some((name) => !SUPPORTED_EXTENSIONS.has(name)))) ||
      hasUnsupportedExtensions(json)) {
    throw new Error("unsupported extension on meshopt source");
  }
  if (chunks.length !== 2 || chunks[1].type !== 0x004e4942) throw new Error("unsupported GLB chunks for meshopt decoding");
  const bin = chunks[1].data;
  const buffers = json.buffers ?? [];
  if (buffers.length < 1 || buffers.length > 2 || buffers[0].uri || !Number.isSafeInteger(buffers[0].byteLength) ||
      buffers[0].byteLength > bin.length || bin.length - buffers[0].byteLength > 3) {
    throw new Error("unsupported GLB buffers for meshopt decoding");
  }
  if (buffers.length === 2) {
    const fallback = buffers[1];
    if (!Number.isSafeInteger(fallback.byteLength) || fallback.byteLength <= 0 ||
        Object.keys(fallback).some((key) => key !== "byteLength" && key !== "extensions") ||
        Object.keys(fallback.extensions ?? {}).length !== 1 ||
        JSON.stringify(fallback.extensions?.[EXT]) !== '{"fallback":true}') {
      throw new Error("unsupported meshopt fallback buffer");
    }
  }
  if (!MeshoptDecoder.supported) throw new Error("meshopt decoder is unavailable");
  await MeshoptDecoder.ready;
  const parts = [bin];
  let size = bin.length;
  let decodedTotal = 0;
  for (const view of views) {
    const ext = view.extensions?.[EXT];
    if (!ext) {
      const offset = view.byteOffset ?? 0;
      if (view.buffer !== 0 || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(view.byteLength) ||
          view.byteLength < 0 || offset + view.byteLength > buffers[0].byteLength) {
        throw new Error("unsupported uncompressed buffer view");
      }
      continue;
    }
    if (Object.keys(ext).some((key) => !["buffer", "byteOffset", "byteLength", "byteStride", "count", "mode", "filter"].includes(key))) {
      throw new Error("unsupported meshopt extension metadata");
    }
    const offset = ext.byteOffset ?? 0;
    const length = ext.byteLength;
    const stride = ext.byteStride;
    const count = ext.count;
    const viewOffset = view.byteOffset ?? 0;
    if (ext.buffer !== 0 || !Number.isSafeInteger(offset) || offset < 0 || !Number.isSafeInteger(length) || length <= 0 ||
        offset + length > buffers[0].byteLength || !Number.isSafeInteger(stride) || stride <= 0 ||
        !Number.isSafeInteger(count) || count <= 0 || !Number.isSafeInteger(view.byteLength) ||
        !Number.isSafeInteger(view.buffer) || view.buffer < 0 || view.buffer >= buffers.length ||
        !Number.isSafeInteger(viewOffset) || viewOffset < 0 || viewOffset + view.byteLength > buffers[view.buffer].byteLength ||
        count * stride !== view.byteLength || (view.byteStride !== undefined && view.byteStride !== stride) ||
        !["ATTRIBUTES", "TRIANGLES", "INDICES"].includes(ext.mode) ||
        (ext.filter !== undefined && !["NONE", "OCTAHEDRAL", "QUATERNION", "EXPONENTIAL"].includes(ext.filter)) ||
        (ext.mode === "ATTRIBUTES" ? stride % 4 !== 0 || stride > 256 : ![2, 4].includes(stride)) ||
        (ext.mode === "TRIANGLES" && count % 3 !== 0) ||
        (ext.mode !== "ATTRIBUTES" && ext.filter !== undefined && ext.filter !== "NONE") ||
        (ext.filter === "OCTAHEDRAL" && ![4, 8].includes(stride)) ||
        (ext.filter === "QUATERNION" && stride !== 8)) {
      throw new Error("invalid or unsupported meshopt buffer view");
    }
    decodedTotal += view.byteLength;
    if (decodedTotal > MAX_DECODED_BYTES) throw new Error("meshopt decoded source exceeds the safe size limit");
    const decoded = Buffer.alloc(view.byteLength);
    MeshoptDecoder.decodeGltfBuffer(decoded, count, stride, bin.subarray(offset, offset + length), ext.mode, ext.filter);
    const padding = Buffer.alloc((4 - size % 4) % 4);
    parts.push(padding, decoded);
    size += padding.length;
    view.buffer = 0;
    view.byteOffset = size;
    size += decoded.length;
    delete view.extensions[EXT];
    if (!Object.keys(view.extensions).length) delete view.extensions;
  }
  if (buffers.length === 2) buffers.pop();
  if (hasUnexpectedReference(json)) throw new Error("unsupported meshopt or fallback buffer reference");
  for (const key of ["extensionsUsed", "extensionsRequired"]) {
    if (json[key]) {
      json[key] = json[key].filter((extension) => extension !== EXT);
      if (!json[key].length) delete json[key];
    }
  }
  const outputBin = Buffer.concat(parts);
  buffers[0].byteLength = outputBin.length;
  return saveDerived(source, sourceBytes, binaryGlb(json, outputBin), dir);
}
