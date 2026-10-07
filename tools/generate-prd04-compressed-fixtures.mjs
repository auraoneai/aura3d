#!/usr/bin/env node
/**
 * PRD-04 P5-2: emit Draco and Meshopt variants of an asset-corpus GLB for the
 * `gltf-decoders-variants` browser spec. Keeps the original accessors/bufferViews
 * as spec-compliant fallbacks and appends the compressed blobs to the BIN chunk.
 *
 * Usage: node tools/generate-prd04-compressed-fixtures.mjs <in.glb> <out-draco.glb> <out-meshopt.glb>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { MeshoptEncoder } from "meshoptimizer";

const GLB_MAGIC = 0x46546c67;
const JSON_CHUNK = 0x4e4f534a;
const BIN_CHUNK = 0x004e4942;
const COMPONENT_BYTES = { 5120: 1, 5121: 1, 5122: 2, 5123: 2, 5125: 4, 5126: 4 };
const TYPE_COMPONENTS = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };

function readGlb(path) {
  const buf = readFileSync(path);
  if (buf.readUInt32LE(0) !== GLB_MAGIC) throw new Error(`${path}: not a GLB`);
  const jsonLength = buf.readUInt32LE(12);
  const json = JSON.parse(buf.subarray(20, 20 + jsonLength).toString("utf8"));
  const binOffset = 20 + jsonLength;
  const binLength = buf.readUInt32LE(binOffset);
  return { json, bin: buf.subarray(binOffset + 8, binOffset + 8 + binLength) };
}

function writeGlb(path, json, bin) {
  const jsonText = JSON.stringify(json);
  const jsonPad = (4 - (jsonText.length % 4)) % 4;
  const jsonChunk = Buffer.concat([Buffer.from(jsonText), Buffer.alloc(jsonPad, 0x20)]);
  const binPad = (4 - (bin.length % 4)) % 4;
  const binChunk = Buffer.concat([bin, Buffer.alloc(binPad)]);
  const out = Buffer.alloc(12 + 8 + jsonChunk.length + 8 + binChunk.length);
  out.writeUInt32LE(GLB_MAGIC, 0);
  out.writeUInt32LE(2, 4);
  out.writeUInt32LE(out.length, 8);
  out.writeUInt32LE(jsonChunk.length, 12);
  out.writeUInt32LE(JSON_CHUNK, 16);
  jsonChunk.copy(out, 20);
  const binOffset = 20 + jsonChunk.length;
  out.writeUInt32LE(binChunk.length, binOffset);
  out.writeUInt32LE(BIN_CHUNK, binOffset + 4);
  binChunk.copy(out, binOffset + 8);
  writeFileSync(path, out);
}

const accessorBytes = (json, bin, index) => {
  const accessor = json.accessors[index];
  const view = json.bufferViews[accessor.bufferView];
  const size = COMPONENT_BYTES[accessor.componentType] * TYPE_COMPONENTS[accessor.type];
  const offset = (view.byteOffset ?? 0) + (accessor.byteOffset ?? 0);
  return { bytes: bin.subarray(offset, offset + accessor.count * size), size, accessor };
};

function appendToBin(bin, bytes) {
  const pad = (4 - (bin.length % 4)) % 4;
  const offset = bin.length + pad;
  return { bin: Buffer.concat([bin, Buffer.alloc(pad), Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength)]), offset };
}

async function writeMeshoptVariant(json, bin, outPath) {
  await MeshoptEncoder.ready;
  const next = JSON.parse(JSON.stringify(json));
  const views = [];
  for (const mesh of next.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      for (const accessorIndex of [...Object.values(primitive.attributes), primitive.indices]) {
        if (accessorIndex === undefined) continue;
        const { bytes, size } = accessorBytes(next, bin, accessorIndex);
        const accessor = next.accessors[accessorIndex];
        const isIndex = accessorIndex === primitive.indices;
        const encoded = MeshoptEncoder.encodeGltfBuffer(
          new Uint8Array(bytes.buffer, bytes.byteOffset, bytes.byteLength),
          accessor.count,
          size,
          isIndex ? "TRIANGLES" : "ATTRIBUTES"
        );
        const { bin: grown, offset } = appendToBin(bin, encoded);
        bin = grown;
        const view = next.bufferViews[accessor.bufferView];
        view.extensions = {
          EXT_meshopt_compression: {
            buffer: 0,
            byteOffset: offset,
            byteLength: encoded.byteLength,
            byteStride: size,
            count: accessor.count,
            mode: isIndex ? "TRIANGLES" : "ATTRIBUTES",
            filter: "NONE"
          }
        };
        views.push(view);
      }
    }
  }
  next.extensionsUsed = [...new Set([...(next.extensionsUsed ?? []), "EXT_meshopt_compression"])];
  next.buffers[0].byteLength = bin.length;
  writeGlb(outPath, next, bin);
  console.log(`wrote ${outPath} (${views.length} meshopt bufferViews)`);
}

async function writeDracoVariant(json, bin, outPath) {
  const factory = (await import("draco3d")).default;
  const encoderModule = await factory.createEncoderModule();
  const next = JSON.parse(JSON.stringify(json));
  for (const mesh of next.meshes ?? []) {
    for (const primitive of mesh.primitives) {
      const dracoMesh = new encoderModule.Mesh();
      const builder = new encoderModule.MeshBuilder();
      const encoder = new encoderModule.Encoder();
      const output = new encoderModule.DracoInt8Array();
      const attributes = {};
      try {
        for (const [semantic, accessorIndex] of Object.entries(primitive.attributes)) {
          const { bytes, size, accessor } = accessorBytes(next, bin, accessorIndex);
          if (accessor.componentType !== 5126) continue; // float attributes only (helmet is all-float)
          const id = builder.AddFloatAttributeToMesh(
            dracoMesh,
            encoderModule[semantic] ?? encoderModule.GENERIC,
            accessor.count,
            TYPE_COMPONENTS[accessor.type],
            new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4)
          );
          attributes[semantic] = id;
        }
        const indices = accessorBytes(next, bin, primitive.indices);
        const indexCount = next.accessors[primitive.indices].count;
        const u16 = new Uint16Array(indices.bytes.buffer, indices.bytes.byteOffset, indexCount);
        builder.AddFacesToMesh(dracoMesh, indexCount / 3, new Uint32Array(u16));
        const length = encoder.EncodeMeshToDracoBuffer(dracoMesh, output);
        if (length <= 0) throw new Error("draco encode produced 0 bytes");
        const compressed = Uint8Array.from({ length }, (_, i) => output.GetValue(i));
        const { bin: grown, offset } = appendToBin(bin, compressed);
        bin = grown;
        const bufferViewIndex = next.bufferViews.push({ buffer: 0, byteOffset: offset, byteLength: compressed.byteLength }) - 1;
        primitive.extensions = { ...primitive.extensions, KHR_draco_mesh_compression: { bufferView: bufferViewIndex, attributes } };
      } finally {
        for (const resource of [output, encoder, builder, dracoMesh]) encoderModule.destroy(resource);
      }
    }
  }
  next.extensionsUsed = [...new Set([...(next.extensionsUsed ?? []), "KHR_draco_mesh_compression"])];
  next.buffers[0].byteLength = bin.length;
  writeGlb(outPath, next, bin);
  console.log(`wrote ${outPath}`);
}

const [inPath, dracoOut, meshoptOut] = process.argv.slice(2);
if (!inPath || !dracoOut || !meshoptOut) {
  console.error("usage: generate-prd04-compressed-fixtures.mjs <in.glb> <out-draco.glb> <out-meshopt.glb>");
  process.exit(1);
}
const { json, bin } = readGlb(inPath);
await writeDracoVariant(json, bin, dracoOut);
await writeMeshoptVariant(json, bin, meshoptOut);
