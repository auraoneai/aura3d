#!/usr/bin/env node
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join, resolve } from "node:path";

const [, , inputArg, outputArg] = process.argv;
if (!inputArg || !outputArg) {
  console.error("Usage: node tools/v9-advanced-gallery-assets/pack-gltf-to-glb.mjs <input.gltf> <output.glb>");
  process.exit(1);
}

const inputPath = resolve(inputArg);
const outputPath = resolve(outputArg);
const inputDir = dirname(inputPath);
const gltf = JSON.parse(readFileSync(inputPath, "utf8"));

if (!Array.isArray(gltf.buffers) || gltf.buffers.length !== 1 || !gltf.buffers[0]?.uri) {
  throw new Error("This packer expects a single external .bin buffer.");
}

const chunks = [];
let byteOffset = 0;

function pushAligned(buffer) {
  const alignedOffset = align4(byteOffset);
  if (alignedOffset > byteOffset) {
    chunks.push(Buffer.alloc(alignedOffset - byteOffset));
    byteOffset = alignedOffset;
  }
  const offset = byteOffset;
  chunks.push(buffer);
  byteOffset += buffer.length;
  return offset;
}

const binPath = join(inputDir, decodeURI(gltf.buffers[0].uri));
const binBuffer = readFileSync(binPath);
pushAligned(binBuffer);

for (const image of gltf.images ?? []) {
  if (!image.uri || image.bufferView !== undefined) continue;
  const uri = decodeURI(image.uri);
  if (uri.startsWith("data:")) {
    throw new Error("Data URI images are not supported by this simple packer.");
  }
  const imageBytes = readFileSync(join(inputDir, uri));
  const imageOffset = pushAligned(imageBytes);
  gltf.bufferViews ??= [];
  const bufferView = {
    buffer: 0,
    byteOffset: imageOffset,
    byteLength: imageBytes.length
  };
  const bufferViewIndex = gltf.bufferViews.length;
  gltf.bufferViews.push(bufferView);
  image.bufferView = bufferViewIndex;
  image.mimeType ??= mimeTypeForPath(uri);
  delete image.uri;
}

gltf.buffers = [{ byteLength: byteOffset }];
const binaryChunk = Buffer.concat(chunks, byteOffset);
const jsonBuffer = Buffer.from(JSON.stringify(gltf));
const paddedJsonLength = align4(jsonBuffer.length);
const paddedJson = Buffer.concat([
  jsonBuffer,
  Buffer.alloc(paddedJsonLength - jsonBuffer.length, 0x20)
], paddedJsonLength);
const paddedBinLength = align4(binaryChunk.length);
const paddedBin = Buffer.concat([
  binaryChunk,
  Buffer.alloc(paddedBinLength - binaryChunk.length)
], paddedBinLength);

const totalLength = 12 + 8 + paddedJson.length + 8 + paddedBin.length;
const header = Buffer.alloc(12);
header.write("glTF", 0, "ascii");
header.writeUInt32LE(2, 4);
header.writeUInt32LE(totalLength, 8);

const jsonHeader = Buffer.alloc(8);
jsonHeader.writeUInt32LE(paddedJson.length, 0);
jsonHeader.writeUInt32LE(0x4e4f534a, 4);

const binHeader = Buffer.alloc(8);
binHeader.writeUInt32LE(paddedBin.length, 0);
binHeader.writeUInt32LE(0x004e4942, 4);

mkdirSync(dirname(outputPath), { recursive: true });
writeFileSync(outputPath, Buffer.concat([header, jsonHeader, paddedJson, binHeader, paddedBin], totalLength));
console.log(`Packed ${inputPath} -> ${outputPath} (${totalLength} bytes)`);

function align4(value) {
  return (value + 3) & ~3;
}

function mimeTypeForPath(path) {
  const lower = path.toLowerCase();
  if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
  if (lower.endsWith(".png")) return "image/png";
  throw new Error(`Cannot infer image MIME type for ${path}`);
}
