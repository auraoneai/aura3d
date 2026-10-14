import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SOURCE = resolve(import.meta.dirname, "../assets/turbo-alpine-venue.png");
const OUTPUT = resolve(import.meta.dirname, "../generated/turboAlpineVenue.glb");
const PROMPT = "assets/turbo-alpine-venue.prompt.md";
const NAME = "Turbo Alpine Venue";
// The selected original imagegen frame is a transparent 3:2 alpine treeline.
// Keep the full cutout so its irregular alpha silhouette can sit behind the
// certified circuit without inventing road or sky pixels.
const SCENIC_V_MAX = 1;
const align4 = (value) => (value + 3) & ~3;
const padded = (bytes, fill = 0) => { const output = Buffer.alloc(align4(bytes.length), fill); bytes.copy(output); return output; };
const floats = (values) => { const output = Buffer.alloc(values.length * 4); values.forEach((value, index) => output.writeFloatLE(value, index * 4)); return output; };
const ushorts = (values) => { const output = Buffer.alloc(values.length * 2); values.forEach((value, index) => output.writeUInt16LE(value, index * 2)); return output; };

const halfWidth = 8;
const halfHeight = halfWidth * (1024 * SCENIC_V_MAX) / 1536;
const halfDepth = 0.08;
const positions = padded(floats([
  -halfWidth, -halfHeight, halfDepth, halfWidth, -halfHeight, halfDepth,
  halfWidth, halfHeight, halfDepth, -halfWidth, halfHeight, halfDepth,
  -halfWidth, -halfHeight, -halfDepth, halfWidth, -halfHeight, -halfDepth,
  halfWidth, halfHeight, -halfDepth, -halfWidth, halfHeight, -halfDepth
]));
const uvs = padded(floats([
  0, SCENIC_V_MAX, 1, SCENIC_V_MAX, 1, 0, 0, 0,
  0, SCENIC_V_MAX, 1, SCENIC_V_MAX, 1, 0, 0, 0
]));
const indices = padded(ushorts([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]));
const image = padded(readFileSync(SOURCE));
const offsets = [0, positions.length, positions.length + uvs.length, positions.length + uvs.length + indices.length];
const binary = Buffer.concat([positions, uvs, indices, image]);
const gltf = {
  asset: { version: "2.0", generator: "Aura3D Turbo deterministic review-art builder", extras: { source: SOURCE, prompt: PROMPT, license: "CC0-1.0", role: "renderer-owned-non-gameplay-background" } },
  extensionsUsed: ["KHR_materials_unlit"], scene: 0, scenes: [{ name: NAME, nodes: [0] }],
  nodes: [{ name: `${NAME}-card`, mesh: 0 }],
  meshes: [{ name: `${NAME}-mesh`, primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }],
  materials: [{ name: `${NAME}-unlit-alpha`, doubleSided: true, alphaMode: "BLEND", pbrMetallicRoughness: { baseColorFactor: [1, 1, 1, 1], baseColorTexture: { index: 0 }, metallicFactor: 0, roughnessFactor: 1 }, extensions: { KHR_materials_unlit: {} } }],
  textures: [{ name: `${NAME}-texture`, sampler: 0, source: 0 }], samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
  images: [{ name: `${NAME}-image`, bufferView: 3, mimeType: "image/png" }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: 8, type: "VEC3", min: [-halfWidth, -halfHeight, -halfDepth], max: [halfWidth, halfHeight, halfDepth] },
    { bufferView: 1, componentType: 5126, count: 8, type: "VEC2", min: [0, 0], max: [1, 1] },
    { bufferView: 2, componentType: 5123, count: 12, type: "SCALAR", min: [0], max: [7] }
  ],
  bufferViews: [
    { buffer: 0, byteOffset: offsets[0], byteLength: positions.length, target: 34962 },
    { buffer: 0, byteOffset: offsets[1], byteLength: uvs.length, target: 34962 },
    { buffer: 0, byteOffset: offsets[2], byteLength: 24, target: 34963 },
    { buffer: 0, byteOffset: offsets[3], byteLength: image.length }
  ], buffers: [{ byteLength: binary.length }]
};
const json = padded(Buffer.from(JSON.stringify(gltf), "utf8"), 0x20);
const body = Buffer.alloc(12 + 8 + json.length + 8 + binary.length);
body.write("glTF", 0, "ascii"); body.writeUInt32LE(2, 4); body.writeUInt32LE(body.length, 8);
body.writeUInt32LE(json.length, 12); body.writeUInt32LE(0x4e4f534a, 16); json.copy(body, 20);
const binaryHeader = 20 + json.length; body.writeUInt32LE(binary.length, binaryHeader); body.writeUInt32LE(0x004e4942, binaryHeader + 4); binary.copy(body, binaryHeader + 8);
const target = OUTPUT; mkdirSync(dirname(target), { recursive: true }); writeFileSync(target, body);
console.log(JSON.stringify({ output: target, source: SOURCE, bytes: body.length }, null, 2));
