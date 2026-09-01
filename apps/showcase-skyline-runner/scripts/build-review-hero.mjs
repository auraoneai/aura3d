import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";

const SOURCE = resolve("apps/showcase-skyline-runner/assets/skyline-arctic-runner.png");
const OUTPUT = resolve("apps/showcase-skyline-runner/generated/skylineArcticRunner.glb");
const align4 = (value) => (value + 3) & ~3;
const padded = (bytes, fill = 0) => {
  const output = Buffer.alloc(align4(bytes.length), fill);
  bytes.copy(output);
  return output;
};
const floats = (values) => {
  const output = Buffer.alloc(values.length * 4);
  values.forEach((value, index) => output.writeFloatLE(value, index * 4));
  return output;
};
const ushorts = (values) => {
  const output = Buffer.alloc(values.length * 2);
  values.forEach((value, index) => output.writeUInt16LE(value, index * 2));
  return output;
};

const halfWidth = (1250 / 927) / 2;
const halfDepth = 0.025;
const positions = padded(floats([
  -halfWidth, -0.5, halfDepth, halfWidth, -0.5, halfDepth,
  halfWidth, 0.5, halfDepth, -halfWidth, 0.5, halfDepth,
  -halfWidth, -0.5, -halfDepth, halfWidth, -0.5, -halfDepth,
  halfWidth, 0.5, -halfDepth, -halfWidth, 0.5, -halfDepth
]));
const uvs = padded(floats([
  0, 1, 1, 1, 1, 0, 0, 0,
  0, 1, 1, 1, 1, 0, 0, 0
]));
const indices = padded(ushorts([0, 1, 2, 0, 2, 3, 4, 6, 5, 4, 7, 6]));
const image = padded(readFileSync(SOURCE));
const offsets = [0, positions.length, positions.length + uvs.length, positions.length + uvs.length + indices.length];
const binary = Buffer.concat([positions, uvs, indices, image]);
const gltf = {
  asset: {
    version: "2.0",
    generator: "Aura3D Skyline deterministic alpha-hero builder",
    extras: {
      source: "apps/showcase-skyline-runner/assets/skyline-arctic-runner.png",
      prompt: "apps/showcase-skyline-runner/assets/skyline-arctic-runner.prompt.md",
      license: "CC0-1.0",
      role: "renderer-owned-primary-character-sprite"
    }
  },
  extensionsUsed: ["KHR_materials_unlit"],
  scene: 0,
  scenes: [{ name: "Skyline Arctic Runner", nodes: [0] }],
  nodes: [{ name: "skyline-arctic-runner-plane", mesh: 0 }],
  meshes: [{ name: "skyline-arctic-runner-mesh", primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 1 }, indices: 2, material: 0 }] }],
  materials: [{
    name: "skyline-arctic-runner-unlit-alpha",
    doubleSided: true,
    alphaMode: "BLEND",
    alphaCutoff: 0.03,
    pbrMetallicRoughness: {
      baseColorFactor: [1, 1, 1, 1],
      baseColorTexture: { index: 0 },
      metallicFactor: 0,
      roughnessFactor: 1
    },
    extensions: { KHR_materials_unlit: {} }
  }],
  textures: [{ name: "skyline-arctic-runner-texture", sampler: 0, source: 0 }],
  samplers: [{ magFilter: 9729, minFilter: 9987, wrapS: 33071, wrapT: 33071 }],
  images: [{ name: "skyline-arctic-runner-image", bufferView: 3, mimeType: "image/png" }],
  accessors: [
    { bufferView: 0, componentType: 5126, count: 8, type: "VEC3", min: [-halfWidth, -0.5, -halfDepth], max: [halfWidth, 0.5, halfDepth] },
    { bufferView: 1, componentType: 5126, count: 8, type: "VEC2", min: [0, 0], max: [1, 1] },
    { bufferView: 2, componentType: 5123, count: 12, type: "SCALAR", min: [0], max: [7] }
  ],
  bufferViews: [
    { buffer: 0, byteOffset: offsets[0], byteLength: positions.length, target: 34962 },
    { buffer: 0, byteOffset: offsets[1], byteLength: uvs.length, target: 34962 },
    { buffer: 0, byteOffset: offsets[2], byteLength: 24, target: 34963 },
    { buffer: 0, byteOffset: offsets[3], byteLength: image.length }
  ],
  buffers: [{ byteLength: binary.length }]
};
const json = padded(Buffer.from(JSON.stringify(gltf), "utf8"), 0x20);
const output = Buffer.alloc(12 + 8 + json.length + 8 + binary.length);
output.write("glTF", 0, "ascii");
output.writeUInt32LE(2, 4);
output.writeUInt32LE(output.length, 8);
output.writeUInt32LE(json.length, 12);
output.writeUInt32LE(0x4e4f534a, 16);
json.copy(output, 20);
const binaryHeader = 20 + json.length;
output.writeUInt32LE(binary.length, binaryHeader);
output.writeUInt32LE(0x004e4942, binaryHeader + 4);
binary.copy(output, binaryHeader + 8);
mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT, output);
console.log(JSON.stringify({ output: OUTPUT, source: SOURCE, bytes: output.length }, null, 2));
