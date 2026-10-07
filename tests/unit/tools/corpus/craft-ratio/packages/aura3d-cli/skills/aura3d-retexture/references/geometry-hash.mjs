#!/usr/bin/env node
// Geometry-untouched proof for a retexture: hashes every mesh primitive's
// POSITION (and index) accessor bytes in a .glb, ignoring materials, images,
// and textures. Two GLBs whose "geometryHash" matches have byte-identical
// vertex positions and topology. Dependency-free; reads GLB 2.0 (BIN chunk,
// data: URIs, or relative buffer files). Draco-compressed meshes are rejected.
//
// Usage: node geometry-hash.mjs before.glb [after.glb]
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

function readGlb(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== 0x46546c67) throw new Error(`${path}: not a GLB (bad magic)`);
  let offset = 12;
  let json;
  let bin;
  while (offset < buf.length) {
    const length = buf.readUInt32LE(offset);
    const type = buf.readUInt32LE(offset + 4);
    const chunk = buf.subarray(offset + 8, offset + 8 + length);
    if (type === 0x4e4f534a) json = JSON.parse(chunk.toString("utf8"));
    else if (type === 0x004e4942) bin = chunk;
    offset += 8 + length;
  }
  if (!json) throw new Error(`${path}: missing JSON chunk`);
  // buffer 0 is the BIN chunk unless it declares a uri; data: and relative uris are also read.
  const buffers = (json.buffers ?? []).map((buffer, index) => {
    if (!buffer.uri) return index === 0 ? bin : undefined;
    if (buffer.uri.startsWith("data:")) return Buffer.from(buffer.uri.split(",")[1] ?? "", "base64");
    if (/^[a-z]+:/i.test(buffer.uri)) throw new Error(`${path}: remote buffer uri not supported`);
    return readFileSync(resolve(dirname(path), decodeURIComponent(buffer.uri)));
  });
  return { json, buffers };
}

const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COUNT = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function accessorBytes({ json, buffers }, index) {
  const accessor = json.accessors[index];
  if (accessor.bufferView === undefined) return Buffer.alloc(0);
  const view = json.bufferViews[accessor.bufferView];
  const bin = buffers[view.buffer ?? 0];
  if (!bin) throw new Error(`buffer ${view.buffer ?? 0} is not readable`);
  const elementSize = COMPONENT_BYTES[accessor.componentType] * TYPE_COUNT[accessor.type];
  const stride = view.byteStride ?? elementSize;
  const start = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  const out = Buffer.alloc(elementSize * accessor.count);
  for (let i = 0; i < accessor.count; i += 1) bin.copy(out, i * elementSize, start + i * stride, start + i * stride + elementSize);
  return out;
}

function geometryReport(path) {
  const glb = readGlb(path);
  const whole = createHash("sha256");
  const primitives = [];
  (glb.json.meshes ?? []).forEach((mesh, meshIndex) => {
    (mesh.primitives ?? []).forEach((primitive, primitiveIndex) => {
      if (primitive.extensions?.KHR_draco_mesh_compression) throw new Error("Draco-compressed geometry: decode before hashing");
      const position = primitive.attributes?.POSITION;
      if (position === undefined) return;
      const positions = accessorBytes(glb, position);
      const indices = primitive.indices === undefined ? Buffer.alloc(0) : accessorBytes(glb, primitive.indices);
      const hash = createHash("sha256").update(positions).update(indices).digest("hex");
      whole.update(hash);
      const accessor = glb.json.accessors[position];
      primitives.push({ mesh: mesh.name ?? `mesh${meshIndex}`, primitive: primitiveIndex, vertices: accessor.count, min: accessor.min, max: accessor.max, hash: `sha256-${hash}` });
    });
  });
  return { file: path, primitiveCount: primitives.length, geometryHash: `sha256-${whole.digest("hex")}`, primitives };
}

const [before, after] = process.argv.slice(2);
if (!before) {
  console.error("usage: node geometry-hash.mjs before.glb [after.glb]");
  process.exit(2);
}
const a = geometryReport(before);
if (!after) {
  console.log(JSON.stringify(a, null, 2));
} else {
  const b = geometryReport(after);
  const geometryUntouched = a.geometryHash === b.geometryHash;
  const changed = a.primitives.filter((p, i) => p.hash !== b.primitives[i]?.hash).map((p) => `${p.mesh}#${p.primitive}`);
  console.log(JSON.stringify({ geometryUntouched, before: a.geometryHash, after: b.geometryHash, primitiveCount: [a.primitiveCount, b.primitiveCount], changed }, null, 2));
  process.exitCode = geometryUntouched ? 0 : 1;
}
